import type { TrackId } from './tracks';

/** Explicit lifecycle of a room / race. See server/game/RaceStateMachine.ts. */
export enum RacePhase {
  WAITING = 'WAITING',
  COUNTDOWN = 'COUNTDOWN',
  RACING = 'RACING',
  FINISHED = 'FINISHED',
  RESULTS = 'RESULTS',
}

export interface PlayerPublic {
  id: string;
  nickname: string;
  color: string;
  connected: boolean;
  isHost: boolean;
  finished: boolean;
  finishPosition: number | null;
  finishTimeMs: number | null;
}

/** One marble in the current race. `index` addresses the snapshot arrays. */
export interface Racer {
  index: number;
  playerId: string;
  nickname: string;
  color: string;
}

export interface ResultEntry {
  position: number;
  playerId: string;
  nickname: string;
  color: string;
  /** null = did not finish (timeout); still ranked by progress. */
  timeMs: number | null;
  connected: boolean;
}

export interface RaceInfo {
  raceId: number;
  trackId: TrackId;
  /** RNG seed; with the track + racers it fully determines the simulation (replay-ready). */
  seed: number;
  racers: Racer[];
  /** Server wall-clock (ms epoch) at which physics starts. */
  goAt: number;
  countdownStartedAt: number;
  /** Player ids in finishing order so far. */
  finishOrder: string[];
  results: ResultEntry[] | null;
}

export interface RoomState {
  code: string;
  hostId: string;
  players: PlayerPublic[];
  maxPlayers: number;
  selectedTrack: TrackId;
  phase: RacePhase;
  raceId: number;
  race: RaceInfo | null;
  /** Server clock when this state was produced (for clock sync). */
  serverTime: number;
}

/**
 * Compact per-marble tuple: [x, y, vx, vy, angle, finishPosition(0 = racing)].
 * Index == Racer.index.
 */
export type MarbleTuple = [number, number, number, number, number, number];

/** Transient effect events: [kind, x, y, power]. */
export type SimEvent = [kind: number, x: number, y: number, power: number];
export const EV_IMPACT = 1; // marble hit something hard
export const EV_BUMPER = 2; // marble hit a bumper
export const EV_FINISH = 3; // marble crossed the line
export const EV_MARBLE = 4; // marble-marble clack

export interface Snapshot {
  raceId: number;
  seq: number;
  /** Simulation time in ms since GO (tick * 1000/60). */
  t: number;
  m: MarbleTuple[];
  ev?: SimEvent[];
}

// ---- Socket protocol ----
export type ErrorCode =
  | 'INVALID_NICKNAME'
  | 'INVALID_ROOM_CODE'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'RACE_IN_PROGRESS'
  | 'INVALID_TRACK'
  | 'NOT_HOST'
  | 'NOT_IN_ROOM'
  | 'ALREADY_IN_ROOM'
  | 'BAD_STATE'
  | 'NOT_ENOUGH_PLAYERS'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'SESSION_EXPIRED'
  | 'INTERNAL';

export type Ack<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string };

export interface JoinData {
  playerId: string;
  /** Secret used to resume this seat after a dropped connection. */
  token: string;
  room: RoomState;
}

export interface ClientToServerEvents {
  'room:host': (p: { nickname: string }, ack: (r: Ack<JoinData>) => void) => void;
  'room:join': (p: { nickname: string; code: string }, ack: (r: Ack<JoinData>) => void) => void;
  'room:rejoin': (p: { code: string; playerId: string; token: string }, ack: (r: Ack<JoinData>) => void) => void;
  'room:leave': (ack?: (r: Ack) => void) => void;
  'room:setTrack': (p: { trackId: string }, ack?: (r: Ack) => void) => void;
  'room:reset': (ack?: (r: Ack) => void) => void; // host: results -> lobby ("play again")
  'race:start': (ack?: (r: Ack) => void) => void;
  'time:sync': (ack: (serverNow: number) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (s: RoomState) => void;
  'room:notice': (n: { kind: 'info' | 'warn'; text: string }) => void;
  'race:snapshot': (s: Snapshot) => void;
  'race:finish': (f: { raceId: number; playerId: string; nickname: string; position: number; timeMs: number }) => void;
}
