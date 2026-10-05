import { MAX_PLAYERS } from '../shared/constants';

const int = (name: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
};

/** Server settings, all overridable through environment variables (see .env.example). */
export const config = {
  port: int('PORT', 3001, 1, 65535),
  /** Bind address. 0.0.0.0 (IPv4, all interfaces) is what hosts like Render scan for. */
  host: process.env.HOST?.trim() || '0.0.0.0',
  /** Comma separated origins, or "*" */
  clientOrigin: process.env.CLIENT_ORIGIN?.trim() || '*',
  serveClient: (process.env.SERVE_CLIENT ?? 'true') !== 'false',
  maxPlayers: int('MAX_PLAYERS', MAX_PLAYERS, 1, MAX_PLAYERS),
  maxRooms: int('MAX_ROOMS', 500, 1),
  countdownMs: int('COUNTDOWN_MS', 3500, 1000, 15000),
  roomEmptyTtlMs: int('ROOM_EMPTY_TTL_MS', 30_000, 1000),
  reconnectGraceMs: int('RECONNECT_GRACE_MS', 10_000, 0),
} as const;
