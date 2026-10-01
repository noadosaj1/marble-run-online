import type { Obstacle, Peg, Section, SectionBuilder, Wall } from '../obstacles';
import { slope, wall, funnel } from '../obstacles';

export const TRACK_WIDTH = 900;

export interface TrackTheme {
  bgTop: string;
  bgBottom: string;
  wall: string;
  wallEdge: string;
  peg: string;
  accent: string;
  accent2: string;
}

export interface StartZone { x: number; y: number; w: number; h: number }

export interface TrackMarker { y: number; text: string }

export type TrackId = 'drop' | 'spinner' | 'maze' | 'chaos' | 'gauntlet';

export interface TrackDef {
  id: TrackId;
  name: string;
  tagline: string;
  description: string;
  /** 1-5 */
  difficulty: number;
  width: number;
  height: number;
  /** Rectangle in which marbles are placed (centre x/y, size). Server shuffles the slots. */
  start: StartZone;
  /** A marble finishes when its centre passes this y. */
  finishY: number;
  /** Hard cap for a race on this track. */
  maxDurationSec: number;
  theme: TrackTheme;
  obstacles: Obstacle[];
  markers: TrackMarker[];
}

export const START_ZONE: StartZone = { x: TRACK_WIDTH / 2, y: 70, w: 360, h: 64 };
const CHUTE_HEIGHT = 290;

/** Holding chute under the start zone that pours the pack out through `gap`. */
export const startChute: SectionBuilder = (y0, W) => {
  const cx = W / 2;
  const gap = 150;
  return {
    obstacles: [
      wall(cx - 198, y0 + 90, 16, 180),
      wall(cx + 198, y0 + 90, 16, 180),
      ...funnel(cx - 190, cx + 190, y0 + 170, 110, gap),
    ],
    height: CHUTE_HEIGHT - 10,
  };
};

/**
 * Remove pegs that would overlap one of the given walls (walls are treated as
 * their centre line segment).
 */
export function clearOf(pegs: Peg[], walls: Wall[], margin = 14): Peg[] {
  return pegs.filter((p) =>
    walls.every((w) => {
      const half = w.w / 2;
      const c = Math.cos(w.angle);
      const s = Math.sin(w.angle);
      const dx = p.x - w.x;
      const dy = p.y - w.y;
      const along = Math.max(-half, Math.min(half, dx * c + dy * s));
      const px = w.x + along * c;
      const py = w.y + along * s;
      return Math.hypot(p.x - px, p.y - py) > w.h / 2 + p.r + margin;
    }),
  );
}

/** Convenience: a closed section whose funnel starts `relY` below the section top. */
export function withFunnel(
  obstacles: Obstacle[], y0: number, relY: number, W: number, opts: { height?: number; gap?: number } = {},
): Section {
  const h = opts.height ?? 150;
  return { obstacles: [...obstacles, ...funnel(0, W, y0 + relY, h, opts.gap ?? 80)], height: relY + h };
}

export { slope };

export type NamedSection = [name: string | null, build: SectionBuilder];

/** Assemble a TrackDef from stacked sections: start chute, sections, finish. */
export function assembleTrack(
  meta: Omit<TrackDef, 'width' | 'height' | 'start' | 'finishY' | 'obstacles' | 'markers'>,
  sections: NamedSection[],
): TrackDef {
  const W = TRACK_WIDTH;
  const obstacles: Obstacle[] = [];
  const markers: TrackMarker[] = [];
  let y = 0;
  const chute = startChute(y, W);
  obstacles.push(...chute.obstacles);
  y += chute.height;
  for (const [name, build] of sections) {
    const s = build(y, W);
    if (name) markers.push({ y, text: name });
    obstacles.push(...s.obstacles);
    y += s.height;
  }
  const finishY = y + 90;
  return {
    ...meta,
    width: W,
    height: finishY + 190,
    start: START_ZONE,
    finishY,
    obstacles,
    markers,
  };
}
