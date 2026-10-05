import { randomBytes, randomInt } from 'node:crypto';
import { MARBLE_COLORS, COUNTDOWN_SNAPSHOT_MS, RESULTS_DELAY_MS, SNAPSHOT_EVERY_TICKS, PHYSICS } from '../../shared/constants';
import { DEFAULT_TRACK, isTrackId } from '../../shared/tracks';
import type { TrackId } from '../../shared/tracks';
import { RacePhase } from '../../shared/types';
import type {
  ErrorCode, PlayerPublic, RaceInfo, Racer, ResultEntry, RoomState, ServerToClientEvents,
} from '../../shared/types';
import { config } from '../config';
import { RaceSimulation } from '../game/RaceSimulation';
import { RaceStateMachine } from '../game/RaceStateMachine';

/** How the room talks to the network layer (kept abstract so rooms are testable). */
export interface RoomBroadcaster {
  toRoom<E extends keyof ServerToClientEvents>(
    code: string, event: E, ...args: Parameters<ServerToClientEvents[E]>
  ): void;
}

export class RoomError extends Error {
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
  }
}

interface ServerPlayer {
  id: string;
  token: string;
  socketId: string | null;
  nickname: string;
  color: string;
  connected: boolean;
  disconnectedAt: number | null;
  finishPosition: number | null;
  finishTimeMs: number | null;
}

interface ActiveRace {
  info: RaceInfo;
  sim: RaceSimulation;
  /** Wall-clock the sim clock is anchored to (== goAt unless we had to skip time). */
  anchor: number;
  nextKeepalive: number;
  resultsAt: number;
}

/** Max physics steps per loop iteration; beyond this we drop time instead of spiralling. */
const MAX_CATCHUP_STEPS = 6;

export class Room {
  readonly machine = new RaceStateMachine();
  hostId = '';
  selectedTrack: TrackId = DEFAULT_TRACK;
  raceId = 0;
  emptySince: number | null = null;
  private lastLagLog = 0;
  private players = new Map<string, ServerPlayer>();
  private race: ActiveRace | null = null;

  constructor(readonly code: string, private out: RoomBroadcaster) {}

  // ---- membership -----------------------------------------------------------

  get phase(): RacePhase {
    return this.machine.phase;
  }

  get playerCount(): number {
    return this.players.size;
  }

  get connectedCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n++;
    return n;
  }

  /** Adds a player. The first one becomes host. */
  addPlayer(nickname: string, socketId: string): ServerPlayer {
    if (this.phase !== RacePhase.WAITING) {
      throw new RoomError('RACE_IN_PROGRESS', 'Race already in progress. Please wait for the next race.');
    }
    if (this.players.size >= config.maxPlayers) throw new RoomError('ROOM_FULL', 'Room is full.');
    const used = new Set([...this.players.values()].map((p) => p.color));
    const color = MARBLE_COLORS.find((c) => !used.has(c)) ?? MARBLE_COLORS[this.players.size % MARBLE_COLORS.length];
    const player: ServerPlayer = {
      id: randomBytes(6).toString('hex'),
      token: randomBytes(18).toString('hex'),
      socketId,
      nickname,
      color,
      connected: true,
      disconnectedAt: null,
      finishPosition: null,
      finishTimeMs: null,
    };
    this.players.set(player.id, player);
    if (!this.hostId) this.hostId = player.id;
    this.emptySince = null;
    this.broadcastState();
    return player;
  }

  getPlayer(id: string): ServerPlayer | undefined {
    return this.players.get(id);
  }

  /** Resume a seat after a dropped connection. */
  rejoin(playerId: string, token: string, socketId: string): ServerPlayer {
    const p = this.players.get(playerId);
    const a = Buffer.from(p?.token ?? '');
    const b = Buffer.from(token);
    if (!p || a.length !== b.length || !a.equals(b)) {
      throw new RoomError('SESSION_EXPIRED', 'Your seat in this room has expired.');
    }
    p.socketId = socketId;
    p.connected = true;
    p.disconnectedAt = null;
    this.emptySince = null;
    this.broadcastState();
    return p;
  }

  /** Socket dropped (or player left mid-race): keep the marble, mark disconnected. */
  markDisconnected(playerId: string, now = Date.now()): void {
    const p = this.players.get(playerId);
    if (!p || !p.connected) return;
    p.connected = false;
    p.socketId = null;
    p.disconnectedAt = now;
    if (this.hostId === p.id) this.transferHost(p);
    if (this.connectedCount === 0) this.emptySince = now;
    this.broadcastState();
  }

  /** Remove completely (voluntary leave in the lobby, or grace period over). */
  removePlayer(playerId: string, now = Date.now()): void {
    const p = this.players.get(playerId);
    if (!p) return;
    // Mid-race the marble must stay in the simulation, so only mark disconnected.
    if (!this.machine.is(RacePhase.WAITING, RacePhase.RESULTS)) {
      this.markDisconnected(playerId, now);
      return;
    }
    this.players.delete(playerId);
    this.out.toRoom(this.code, 'room:notice', { kind: 'info', text: `${p.nickname} left the room.` });
    if (this.hostId === playerId) this.transferHost(p);
    if (this.connectedCount === 0) this.emptySince = now;
    this.broadcastState();
  }

  private transferHost(previous: ServerPlayer): void {
    const next = [...this.players.values()].find((p) => p.connected && p.id !== previous.id);
    if (!next) return;
    this.hostId = next.id;
    this.out.toRoom(this.code, 'room:notice', {
      kind: 'info',
      text: `${previous.nickname} left the room. ${next.nickname} is now the host.`,
    });
  }

  // ---- host actions ---------------------------------------------------------

  private requireHost(playerId: string): void {
    if (playerId !== this.hostId) throw new RoomError('NOT_HOST', 'Only the host can do that.');
  }

  setTrack(playerId: string, trackId: unknown): void {
    this.requireHost(playerId);
    if (!isTrackId(trackId)) throw new RoomError('INVALID_TRACK', 'That track does not exist.');
    if (this.phase !== RacePhase.WAITING) throw new RoomError('BAD_STATE', 'Tracks can only be changed in the lobby.');
    this.selectedTrack = trackId;
    this.broadcastState();
  }

  startRace(playerId: string, now = Date.now()): void {
    this.requireHost(playerId);
    if (!this.machine.can(RacePhase.COUNTDOWN)) throw new RoomError('BAD_STATE', 'A race is already underway.');
    const racers: Racer[] = [...this.players.values()]
      .filter((p) => p.connected)
      .map((p, index) => ({ index, playerId: p.id, nickname: p.nickname, color: p.color }));
    if (racers.length === 0) throw new RoomError('NOT_ENOUGH_PLAYERS', 'Nobody to race.');

    // Lobby is locked from here on: addPlayer() refuses outside WAITING.
    this.machine.transition(RacePhase.COUNTDOWN);
    this.raceId++;
    for (const p of this.players.values()) {
      p.finishPosition = null;
      p.finishTimeMs = null;
    }
    const seed = randomInt(1, 2 ** 31);
    const sim = new RaceSimulation(this.selectedTrack, racers.length, seed, (f) => this.onFinish(f.index, f.position, f.timeMs));
    const goAt = now + config.countdownMs;
    this.race = {
      sim,
      anchor: goAt,
      nextKeepalive: now,
      resultsAt: 0,
      info: {
        raceId: this.raceId, trackId: this.selectedTrack, seed, racers,
        goAt, countdownStartedAt: now, finishOrder: [], results: null,
      },
    };
    this.broadcastState();
    this.emitSnapshot(); // frozen start positions, so clients can draw the grid immediately
  }

  /** "Play again": back to the lobby with everyone (still connected) kept. */
  resetToLobby(playerId: string, now = Date.now()): void {
    this.requireHost(playerId);
    if (this.phase !== RacePhase.RESULTS) throw new RoomError('BAD_STATE', 'The race is not over yet.');
    this.toLobby(now);
  }

  private toLobby(now: number): void {
    this.disposeRace();
    this.machine.transition(RacePhase.WAITING);
    // Anyone who dropped during the race is gone now.
    for (const p of [...this.players.values()]) {
      if (!p.connected) {
        this.players.delete(p.id);
        this.out.toRoom(this.code, 'room:notice', { kind: 'info', text: `${p.nickname} left the room.` });
      }
      p.finishPosition = null;
      p.finishTimeMs = null;
    }
    if (!this.players.has(this.hostId)) {
      this.hostId = [...this.players.values()].find((p) => p.connected)?.id ?? [...this.players.keys()][0] ?? '';
    }
    if (this.connectedCount === 0) this.emptySince = now;
    this.broadcastState();
  }

  // ---- race loop ------------------------------------------------------------

  /** Called by RoomManager's loop. Drives every time-based transition from the server clock. */
  update(now: number): void {
    // Lobby housekeeping: drop players whose reconnect grace expired.
    if (this.phase === RacePhase.WAITING) {
      for (const p of [...this.players.values()]) {
        if (!p.connected && p.disconnectedAt !== null && now - p.disconnectedAt > config.reconnectGraceMs) {
          this.removePlayer(p.id, now);
        }
      }
    }
    // Everyone gone mid-race: nobody is watching, stop simulating.
    if (this.phase !== RacePhase.WAITING && this.connectedCount === 0) {
      this.toLobby(now);
      return;
    }
    const race = this.race;
    if (!race) return;

    switch (this.phase) {
      case RacePhase.COUNTDOWN:
        if (now >= race.info.goAt) {
          this.machine.transition(RacePhase.RACING);
          this.broadcastState();
        } else if (now >= race.nextKeepalive) {
          race.nextKeepalive = now + COUNTDOWN_SNAPSHOT_MS;
          this.emitSnapshot();
        }
        break;
      case RacePhase.RACING:
        this.stepRace(race, now);
        break;
      case RacePhase.FINISHED:
        if (now >= race.resultsAt) {
          this.machine.transition(RacePhase.RESULTS);
          this.broadcastState();
        }
        break;
      default:
        break;
    }
  }

  private stepRace(race: ActiveRace, now: number): void {
    const { sim } = race;
    const dt = PHYSICS.tickMs;
    let target = Math.floor((now - race.anchor) / dt);
    if (target - sim.tick > MAX_CATCHUP_STEPS * 10) {
      // Server hiccup: skip ahead rather than simulating a huge backlog.
      race.anchor += (target - sim.tick - MAX_CATCHUP_STEPS) * dt;
      target = Math.floor((now - race.anchor) / dt);
    }
    let steps = 0;
    while (sim.tick < target && steps++ < MAX_CATCHUP_STEPS && !sim.over) {
      sim.step();
      if (sim.tick % SNAPSHOT_EVERY_TICKS === 0) this.emitSnapshot();
    }
    // Diagnostics: how far behind real time is the simulation? (CPU-starved hosts show up here.)
    const lag = now - race.anchor - sim.tick * dt;
    if (lag > 100 && now - this.lastLagLog > 5000) {
      this.lastLagLog = now;
      console.warn(`[room ${this.code}] simulation is ${Math.round(lag)}ms behind real time`);
    }
    if (sim.over) this.endRace(race, now);
  }

  private onFinish(index: number, position: number, timeMs: number): void {
    const race = this.race;
    if (!race) return;
    const racer = race.info.racers[index];
    const p = this.players.get(racer.playerId);
    if (p) {
      p.finishPosition = position;
      p.finishTimeMs = timeMs;
    }
    race.info.finishOrder.push(racer.playerId);
    this.out.toRoom(this.code, 'race:finish', {
      raceId: this.raceId, playerId: racer.playerId, nickname: racer.nickname, position, timeMs,
    });
    this.broadcastState();
  }

  private endRace(race: ActiveRace, now: number): void {
    const ranking = race.sim.ranking();
    race.info.results = ranking.map((r, i): ResultEntry => {
      const racer = race.info.racers[r.index];
      return {
        position: i + 1,
        playerId: racer.playerId,
        nickname: racer.nickname,
        color: racer.color,
        timeMs: r.timeMs,
        connected: this.players.get(racer.playerId)?.connected ?? false,
      };
    });
    race.resultsAt = now + RESULTS_DELAY_MS;
    this.emitSnapshot();
    this.machine.transition(RacePhase.FINISHED);
    this.broadcastState();
  }

  private emitSnapshot(): void {
    if (!this.race) return;
    const snap = this.race.sim.snapshot();
    snap.raceId = this.raceId;
    this.out.toRoom(this.code, 'race:snapshot', snap);
  }

  // ---- state ----------------------------------------------------------------

  toState(): RoomState {
    const players: PlayerPublic[] = [...this.players.values()].map((p) => ({
      id: p.id,
      nickname: p.nickname,
      color: p.color,
      connected: p.connected,
      isHost: p.id === this.hostId,
      finished: p.finishPosition !== null,
      finishPosition: p.finishPosition,
      finishTimeMs: p.finishTimeMs,
    }));
    return {
      code: this.code,
      hostId: this.hostId,
      players,
      maxPlayers: config.maxPlayers,
      selectedTrack: this.selectedTrack,
      phase: this.phase,
      raceId: this.raceId,
      race: this.race ? { ...this.race.info, finishOrder: [...this.race.info.finishOrder] } : null,
      serverTime: Date.now(),
    };
  }

  broadcastState(): void {
    this.out.toRoom(this.code, 'room:state', this.toState());
  }

  private disposeRace(): void {
    this.race?.sim.dispose();
    this.race = null;
  }

  /** Release everything (physics world, player map). */
  dispose(): void {
    this.disposeRace();
    this.players.clear();
  }
}
