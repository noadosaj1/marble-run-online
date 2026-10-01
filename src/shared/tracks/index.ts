import { gauntlet } from './gauntlet';
import { maze } from './maze';
import { chaosFactory } from './chaosFactory';
import { spinner } from './spinner';
import { theDrop } from './theDrop';
import type { TrackDef, TrackId } from './common';

export type { TrackDef, TrackId, TrackTheme, StartZone, TrackMarker } from './common';

/** Registry, in menu order. Adding Track 6 = new file + one line here. */
export const TRACKS: readonly TrackDef[] = [theDrop, spinner, maze, chaosFactory, gauntlet];

export const TRACK_IDS: readonly TrackId[] = TRACKS.map((t) => t.id);

export const DEFAULT_TRACK: TrackId = 'drop';

export function isTrackId(v: unknown): v is TrackId {
  return typeof v === 'string' && (TRACK_IDS as readonly string[]).includes(v);
}

export function getTrack(id: TrackId): TrackDef {
  const t = TRACKS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown track ${id}`);
  return t;
}

/** Marble slot positions inside the start zone (unshuffled, row-major). */
export function startSlots(track: TrackDef, count: number, radius: number): { x: number; y: number }[] {
  const { x, y, w } = track.start;
  const spacing = radius * 2 + 6;
  const cols = Math.max(1, Math.floor((w - radius * 2) / spacing) + 1);
  const rows = Math.ceil(count / cols);
  const slots: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, count - r * cols);
    const c = i % cols;
    slots.push({
      x: x + (c - (inRow - 1) / 2) * spacing,
      y: y + (r - (rows - 1) / 2) * spacing,
    });
  }
  return slots;
}
