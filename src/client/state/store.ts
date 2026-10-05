import { useSyncExternalStore } from 'react';
import type { RoomState } from '../../shared/types';

export type ConnStatus = 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface Toast {
  id: number;
  kind: 'info' | 'warn' | 'error';
  text: string;
}

export interface FinishEntry {
  id: number;
  position: number;
  nickname: string;
  playerId: string;
}

export interface GameState {
  conn: ConnStatus;
  /** Active socket.io transport ('websocket' | 'polling'), for diagnostics and smoothing. */
  transport: string;
  /** True once we have connected at least once (distinguishes first load from a drop). */
  everConnected: boolean;
  room: RoomState | null;
  me: { playerId: string; token: string } | null;
  nickname: string;
  toasts: Toast[];
  finishFeed: FinishEntry[];
  /** Open the track picker as soon as the lobby shows (from "Change track"). */
  openTrackPicker: boolean;
  /** Blocking message shown on the menu after being kicked back (room closed, etc.). */
  menuNotice: string | null;
}

let state: GameState = {
  conn: 'connecting',
  transport: '',
  everConnected: false,
  room: null,
  me: null,
  nickname: '',
  toasts: [],
  finishFeed: [],
  openTrackPicker: false,
  menuNotice: null,
};
const listeners = new Set<() => void>();

export const getState = (): GameState => state;

export function setState(patch: Partial<GameState> | ((s: GameState) => Partial<GameState>)): void {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Select a slice. Selector must return a stable reference (e.g. a field). */
export function useGame<T>(selector: (s: GameState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

let nextId = 1;
export const uid = (): number => nextId++;

export function pushToast(text: string, kind: Toast['kind'] = 'info', ttl = 4200): void {
  const id = uid();
  setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ttl);
}
