import { getState, pushToast, setState, uid } from '../state/store';
import type { Ack, ClientToServerEvents, JoinData, ServerToClientEvents } from '../../shared/types';
import { RacePhase } from '../../shared/types';
import { raceFeed } from '../game/raceFeed';
import { sound } from '../game/audio/sound';
import { syncClock } from './clock';
import { clearSession, loadSession, saveSession } from './session';
import { socket } from './socket';

export type Result = { ok: true } | { ok: false; message: string };

function request<T>(event: keyof ClientToServerEvents, payload?: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => {
    if (!socket.connected) {
      resolve({ ok: false, code: 'INTERNAL', message: 'Not connected to the game server.' });
      return;
    }
    const args = payload === undefined ? [] : [payload];
    (socket.timeout(8000) as unknown as { emit: (...a: unknown[]) => void }).emit(
      event,
      ...args,
      (err: unknown, res: Ack<T>) => {
        if (err) resolve({ ok: false, code: 'INTERNAL', message: 'The server did not answer. Please try again.' });
        else resolve(res);
      },
    );
  });
}

function enterRoom(data: JoinData): void {
  saveSession({ code: data.room.code, playerId: data.playerId, token: data.token });
  setState({ room: data.room, me: { playerId: data.playerId, token: data.token }, menuNotice: null, openTrackPicker: false });
  sound.play('join');
}

async function joinLike(event: 'room:host' | 'room:join', payload: unknown): Promise<Result> {
  const res = await request<JoinData>(event, payload);
  if (!res.ok) return { ok: false, message: res.message };
  enterRoom(res.data);
  return { ok: true };
}

export const hostGame = (nickname: string): Promise<Result> => joinLike('room:host', { nickname });
export const joinGame = (nickname: string, code: string): Promise<Result> => joinLike('room:join', { nickname, code });

export async function leaveRoom(): Promise<void> {
  clearSession();
  if (socket.connected) await request('room:leave');
  raceFeed.reset(0);
  setState({ room: null, me: null, finishFeed: [], openTrackPicker: false });
}

async function simple(event: keyof ClientToServerEvents, payload?: unknown): Promise<Result> {
  const res = await request(event, payload);
  if (!res.ok) {
    pushToast(res.message, 'error');
    return { ok: false, message: res.message };
  }
  return { ok: true };
}

export const setTrack = (trackId: string): Promise<Result> => simple('room:setTrack', { trackId });
export const startRace = (): Promise<Result> => simple('race:start');
export const playAgain = (): Promise<Result> => simple('room:reset');

export async function changeTrack(): Promise<void> {
  const r = await simple('room:reset');
  if (r.ok) setState({ openTrackPicker: true });
}

// ---- wiring --------------------------------------------------------------

let wired = false;

async function tryResume(): Promise<void> {
  const saved = loadSession();
  if (!saved) return;
  const hadRoom = getState().room !== null;
  const res = await request<JoinData>('room:rejoin', saved);
  if (res.ok) {
    enterRoom(res.data);
  } else {
    clearSession();
    raceFeed.reset(0);
    setState({
      room: null, me: null, finishFeed: [],
      menuNotice: hadRoom ? 'You were disconnected from the room.' : null,
    });
  }
}

export function initNetwork(): void {
  if (wired) return;
  wired = true;

  socket.on('connect', () => {
    setState({ conn: 'connected', everConnected: true });
    void syncClock();
    void tryResume();
  });
  socket.on('connect_error', () => {
    setState((s) => ({ conn: s.everConnected ? 'reconnecting' : 'failed' }));
  });
  socket.on('disconnect', () => {
    setState({ conn: 'reconnecting' });
  });

  socket.on('room:state', (room) => {
    const prev = getState().room;
    if (prev && prev.raceId !== room.raceId) raceFeed.reset(room.raceId);
    if (!prev || prev.raceId !== room.raceId) setState({ finishFeed: [] });
    if (prev && prev.phase !== room.phase && room.phase === RacePhase.RESULTS) sound.play('complete');
    setState({ room });
  });
  socket.on('room:notice', (n) => pushToast(n.text, n.kind));
  socket.on('race:snapshot', (s) => raceFeed.push(s));
  socket.on('race:finish', (f) => {
    sound.play('finish');
    const id = uid();
    setState((s) => ({ finishFeed: [...s.finishFeed.slice(-4), { id, position: f.position, nickname: f.nickname, playerId: f.playerId }] }));
    setTimeout(() => setState((s) => ({ finishFeed: s.finishFeed.filter((e) => e.id !== id) })), 4500);
  });

  // Typed re-export for tests / debugging.
  (window as unknown as { __marble?: unknown }).__marble = { getState };
}

export type { ServerToClientEvents };
