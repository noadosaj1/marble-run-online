import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { normalizeRoomCode, sanitizeNickname } from '../../shared/validation';
import type {
  Ack, ClientToServerEvents, ErrorCode, JoinData, ServerToClientEvents,
} from '../../shared/types';
import { config } from '../config';
import { Room, RoomError } from '../rooms/Room';
import { RoomManager } from '../rooms/RoomManager';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Server-side session for a socket. Identity always comes from here, never from the client payload. */
interface SocketData {
  roomCode?: string;
  playerId?: string;
  tokens: number;
  tokenTime: number;
}

const fail = (code: ErrorCode, message: string): Ack<never> => ({ ok: false, code, message });

/** Token bucket: 30 events burst, 15/s sustained. */
function allow(socket: GameSocket): boolean {
  const d = socket.data;
  const now = Date.now();
  d.tokens = Math.min(30, d.tokens + ((now - d.tokenTime) / 1000) * 15);
  d.tokenTime = now;
  if (d.tokens < 1) return false;
  d.tokens -= 1;
  return true;
}

export function createSocketServer(http: HttpServer): { io: Server; rooms: RoomManager } {
  const origins = config.clientOrigin === '*' ? '*' : config.clientOrigin.split(',').map((s) => s.trim());
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(http, {
    cors: { origin: origins },
    maxHttpBufferSize: 10_000,
    pingInterval: 5000,
    pingTimeout: 8000,
  });

  const rooms = new RoomManager(
    {
      toRoom(code, event, ...args) {
        // Snapshots are disposable: if a client is behind, drop rather than queue.
        const target = event === 'race:snapshot' ? io.to(code).volatile : io.to(code);
        (target.emit as (e: string, ...a: unknown[]) => boolean)(event, ...args);
      },
    },
    (code) => {
      // Room destroyed: detach any sockets still subscribed.
      io.in(code).socketsLeave(code);
    },
  );
  rooms.start();

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as GameSocket;
    socket.data.tokens = 30;
    socket.data.tokenTime = Date.now();

    const attach = (room: Room, playerId: string): void => {
      socket.data.roomCode = room.code;
      socket.data.playerId = playerId;
      void socket.join(room.code);
    };

    const detach = (): void => {
      const { roomCode, playerId } = socket.data;
      socket.data.roomCode = undefined;
      socket.data.playerId = undefined;
      if (!roomCode) return;
      void socket.leave(roomCode);
      if (playerId) rooms.get(roomCode)?.removePlayer(playerId);
    };

    /** Wraps a handler: rate-limit, catch errors, always answer the ack. */
    const handle = <A extends unknown[]>(
      fn: (...args: A) => Ack<unknown> | void,
    ) => (...argsAndAck: unknown[]): void => {
      const ack = [...argsAndAck].reverse().find((a) => typeof a === 'function') as ((r: Ack<unknown>) => void) | undefined;
      const respond = (r: Ack<unknown>): void => {
        if (ack) ack(r);
      };
      if (!allow(socket)) return respond(fail('RATE_LIMITED', 'Slow down!'));
      try {
        const args = argsAndAck.filter((a) => typeof a !== 'function') as A;
        const result = fn(...args);
        respond(result ?? { ok: true, data: undefined });
      } catch (err) {
        if (err instanceof RoomError) respond(fail(err.code, err.message));
        else {
          console.error('[socket] handler error', err);
          respond(fail('INTERNAL', 'Something went wrong on the server.'));
        }
      }
    };

    /** Current room + player for this socket, or throws. */
    const session = (): { room: Room; playerId: string } => {
      const { roomCode, playerId } = socket.data;
      const room = roomCode ? rooms.get(roomCode) : undefined;
      if (!room || !playerId || !room.getPlayer(playerId)) throw new RoomError('NOT_IN_ROOM', 'You are not in a room.');
      return { room, playerId };
    };

    const joinData = (room: Room, playerId: string, token: string): Ack<JoinData> =>
      ({ ok: true, data: { playerId, token, room: room.toState() } });

    const object = (v: unknown): Record<string, unknown> =>
      (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

    socket.on('room:host', handle((payload: unknown) => {
      if (socket.data.roomCode) throw new RoomError('ALREADY_IN_ROOM', 'Leave your current room first.');
      const nickname = sanitizeNickname(object(payload).nickname);
      if (!nickname) throw new RoomError('INVALID_NICKNAME', 'Please enter a name (up to 16 characters).');
      const room = rooms.create();
      try {
        const player = room.addPlayer(nickname, socket.id);
        attach(room, player.id);
        return joinData(room, player.id, player.token);
      } catch (err) {
        rooms.destroy(room.code);
        throw err;
      }
    }));

    socket.on('room:join', handle((payload: unknown) => {
      if (socket.data.roomCode) throw new RoomError('ALREADY_IN_ROOM', 'Leave your current room first.');
      const p = object(payload);
      const nickname = sanitizeNickname(p.nickname);
      if (!nickname) throw new RoomError('INVALID_NICKNAME', 'Please enter a name (up to 16 characters).');
      const code = normalizeRoomCode(p.code);
      if (!code) throw new RoomError('INVALID_ROOM_CODE', 'That is not a valid room code.');
      const room = rooms.get(code);
      if (!room) throw new RoomError('ROOM_NOT_FOUND', 'Room not found.');
      const player = room.addPlayer(nickname, socket.id);
      attach(room, player.id);
      return joinData(room, player.id, player.token);
    }));

    socket.on('room:rejoin', handle((payload: unknown) => {
      if (socket.data.roomCode) throw new RoomError('ALREADY_IN_ROOM', 'Already in a room.');
      const p = object(payload);
      const code = normalizeRoomCode(p.code);
      const room = code ? rooms.get(code) : undefined;
      if (!room || typeof p.playerId !== 'string' || typeof p.token !== 'string' || p.token.length > 100) {
        throw new RoomError('SESSION_EXPIRED', 'Your room no longer exists.');
      }
      const player = room.rejoin(p.playerId, p.token, socket.id);
      attach(room, player.id);
      return joinData(room, player.id, player.token);
    }));

    socket.on('room:leave', handle(() => {
      detach();
    }));

    socket.on('room:setTrack', handle((payload: unknown) => {
      const { room, playerId } = session();
      room.setTrack(playerId, object(payload).trackId);
    }));

    socket.on('race:start', handle(() => {
      const { room, playerId } = session();
      room.startRace(playerId);
    }));

    socket.on('room:reset', handle(() => {
      const { room, playerId } = session();
      room.resetToLobby(playerId);
    }));

    socket.on('time:sync', (ack: unknown) => {
      if (typeof ack === 'function' && allow(socket)) (ack as (t: number) => void)(Date.now());
    });

    socket.on('disconnect', () => {
      const { roomCode, playerId } = socket.data;
      if (!roomCode || !playerId) return;
      const room = rooms.get(roomCode);
      if (!room) return;
      // Keep the seat for a short grace period so a refresh / network blip can resume.
      room.markDisconnected(playerId);
    });
  });

  return { io, rooms };
}
