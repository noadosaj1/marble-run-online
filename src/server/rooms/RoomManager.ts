import { config } from '../config';
import { generateRoomCode } from './roomCode';
import { Room, RoomError } from './Room';
import type { RoomBroadcaster } from './Room';

const LOOP_INTERVAL_MS = 8;

/** Owns all rooms and the single timer that drives them. */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private out: RoomBroadcaster, private onRoomDestroyed: (code: string) => void = () => {}) {}

  get size(): number {
    return this.rooms.size;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  create(): Room {
    if (this.rooms.size >= config.maxRooms) throw new RoomError('INTERNAL', 'The server is busy. Please try again soon.');
    const code = generateRoomCode((c) => this.rooms.has(c));
    const room = new Room(code, this.out);
    this.rooms.set(code, room);
    return room;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), LOOP_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const code of [...this.rooms.keys()]) this.destroy(code);
  }

  private tick(): void {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      try {
        room.update(now);
      } catch (err) {
        console.error(`[room ${room.code}] update failed`, err);
        this.destroy(room.code);
        continue;
      }
      if (room.emptySince !== null && room.connectedCount === 0 && now - room.emptySince > config.roomEmptyTtlMs) {
        this.destroy(room.code);
      }
    }
  }

  destroy(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    this.rooms.delete(code);
    room.dispose();
    this.onRoomDestroyed(code);
  }
}
