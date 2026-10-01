import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/types';

/**
 * Where the game server lives. Never assumed to be same-origin:
 *  - VITE_SERVER_URL wins if set (separate static host + Node host).
 *  - `npm run dev`: the server on port 3001 of whatever host served the page (works for LAN phones).
 *  - production build with no setting: same origin (server also serves the client).
 */
export function resolveServerUrl(): string | undefined {
  const configured = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (configured) return configured;
  if (import.meta.env.DEV) return `${window.location.protocol}//${window.location.hostname}:3001`;
  return undefined;
}

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: GameSocket = io(resolveServerUrl() ?? window.location.origin, {
  transports: ['websocket', 'polling'],
  reconnectionDelayMax: 3000,
  timeout: 6000,
});
