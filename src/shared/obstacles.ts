/**
 * Obstacle definitions. These are pure data: the server turns them into Matter.js
 * bodies and the client draws them. Moving obstacles are a pure function of
 * simulation time (`obstaclePose`), so nothing about them needs to be networked —
 * the client just evaluates the same function at the snapshot's time.
 *
 * Piston / gate / platform are all `mover`s with different parameters.
 */

export interface Wall {
  type: 'wall';
  x: number; y: number; w: number; h: number; angle: number;
}
export interface Peg {
  type: 'peg';
  x: number; y: number; r: number;
}
export interface Bumper {
  type: 'bumper';
  x: number; y: number; r: number;
}
/** Static belt; pushes touching marbles along its local +x axis (rotated by angle). */
export interface Conveyor {
  type: 'conveyor';
  x: number; y: number; w: number; h: number; angle: number;
  /** Target surface speed in px/step. Negative = towards local -x. */
  speed: number;
}
/** `arms` bars of `length` crossing at the hub, spinning at `speed` rad/s. */
export interface Rotor {
  type: 'rotor';
  x: number; y: number; length: number; thickness: number; arms: number;
  speed: number; phase: number;
}
export type MoverKind = 'platform' | 'piston' | 'gate';
/**
 * Slides along `axis` by up to `distance`, `speed` cycles/second.
 * wave 'sine' swings +-distance around (x, y); 'pump' goes 0..distance (pistons).
 */
export interface Mover {
  type: 'mover';
  kind: MoverKind;
  x: number; y: number; w: number; h: number; angle: number;
  axis: 'x' | 'y';
  distance: number; speed: number; phase: number;
  wave: 'sine' | 'pump';
}
export type Obstacle = Wall | Peg | Bumper | Conveyor | Rotor | Mover;
export type DynamicObstacle = Rotor | Mover;

export interface Pose { x: number; y: number; angle: number }

export const isDynamic = (o: Obstacle): o is DynamicObstacle => o.type === 'rotor' || o.type === 'mover';

/** Position/orientation of a moving obstacle at simulation time `tSec`. */
export function obstaclePose(o: DynamicObstacle, tSec: number): Pose {
  const t = Math.max(0, tSec);
  if (o.type === 'rotor') {
    return { x: o.x, y: o.y, angle: o.phase + o.speed * t };
  }
  const theta = (o.speed * t + o.phase) * Math.PI * 2;
  const off = o.wave === 'sine' ? Math.sin(theta) * o.distance : (1 - Math.cos(theta)) * 0.5 * o.distance;
  return {
    x: o.x + (o.axis === 'x' ? off : 0),
    y: o.y + (o.axis === 'y' ? off : 0),
    angle: o.angle,
  };
}

// ---------------------------------------------------------------------------
// Builders. Tracks are assembled from these; keep them tiny and declarative.
// ---------------------------------------------------------------------------

export const WALL_T = 16;

export const wall = (x: number, y: number, w: number, h: number, angle = 0): Wall =>
  ({ type: 'wall', x, y, w, h, angle });

/** A solid slab between two points (ramps, funnel sides, baffles). */
export function slope(x1: number, y1: number, x2: number, y2: number, t = WALL_T): Wall {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return wall((x1 + x2) / 2, (y1 + y2) / 2, Math.hypot(dx, dy), t, Math.atan2(dy, dx));
}

export const ramp = slope;

export const peg = (x: number, y: number, r = 8): Peg => ({ type: 'peg', x, y, r });
export const bumper = (x: number, y: number, r = 22): Bumper => ({ type: 'bumper', x, y, r });

export const conveyor = (x: number, y: number, w: number, speed: number, angle = 0, h = 16): Conveyor =>
  ({ type: 'conveyor', x, y, w, h, angle, speed });

export const rotor = (
  x: number, y: number, length: number, speed: number,
  opts: { arms?: number; thickness?: number; phase?: number } = {},
): Rotor => ({
  type: 'rotor', x, y, length, speed,
  arms: opts.arms ?? 1, thickness: opts.thickness ?? 14, phase: opts.phase ?? 0,
});

export const platform = (
  x: number, y: number, w: number, axis: 'x' | 'y', distance: number, speed: number,
  opts: { h?: number; angle?: number; phase?: number } = {},
): Mover => ({
  type: 'mover', kind: 'platform', x, y, w, h: opts.h ?? 16, angle: opts.angle ?? 0,
  axis, distance, speed, phase: opts.phase ?? 0, wave: 'sine',
});

/** Block that thrusts along y (0..distance) like a piston. */
export const piston = (
  x: number, y: number, w: number, distance: number, speed: number,
  opts: { h?: number; angle?: number; phase?: number } = {},
): Mover => ({
  type: 'mover', kind: 'piston', x, y, w, h: opts.h ?? 30, angle: opts.angle ?? 0,
  axis: 'y', distance, speed, phase: opts.phase ?? 0, wave: 'pump',
});

/** Horizontal sliding door; opens and closes over a gap. */
export const gate = (
  x: number, y: number, w: number, distance: number, speed: number, phase = 0,
): Mover => ({
  type: 'mover', kind: 'gate', x, y, w, h: 14, angle: 0,
  axis: 'x', distance, speed, phase, wave: 'sine',
});

/** Two slabs funnelling [x0, x1] down to a gap of `gap` centred in the range. */
export function funnel(x0: number, x1: number, y: number, height: number, gap: number, t = WALL_T): Wall[] {
  const cx = (x0 + x1) / 2;
  return [
    slope(x0, y, cx - gap / 2, y + height, t),
    slope(x1, y, cx + gap / 2, y + height, t),
  ];
}

/** Staggered peg rows (plinko) inside [x0, x1]. */
export function pegField(
  x0: number, x1: number, y: number, rows: number,
  opts: { dx?: number; dy?: number; r?: number; margin?: number } = {},
): Peg[] {
  const dx = opts.dx ?? 70;
  const dy = opts.dy ?? 52;
  const r = opts.r ?? 8;
  const margin = opts.margin ?? 38;
  const out: Peg[] = [];
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 === 0 ? 0 : dx / 2;
    for (let x = x0 + margin + offset; x <= x1 - margin; x += dx) out.push(peg(x, y + row * dy, r));
  }
  return out;
}

/**
 * Alternating slanted shelves forcing marbles to zig-zag across [x0, x1].
 * Each shelf leaves a `gap` at alternating ends.
 */
export function switchbacks(
  x0: number, x1: number, y: number, count: number,
  opts: { spacing?: number; gap?: number; drop?: number; startLeft?: boolean } = {},
): Wall[] {
  const spacing = opts.spacing ?? 150;
  const gap = opts.gap ?? 90;
  const drop = opts.drop ?? 70;
  let fromLeft = opts.startLeft ?? true;
  const out: Wall[] = [];
  for (let i = 0; i < count; i++) {
    const yy = y + i * spacing;
    // shelf is attached to one wall, slopes downward towards the open end
    out.push(fromLeft ? slope(x0, yy, x1 - gap, yy + drop) : slope(x1, yy, x0 + gap, yy + drop));
    fromLeft = !fromLeft;
  }
  return out;
}

export interface Section { obstacles: Obstacle[]; height: number }
export type SectionBuilder = (y0: number, width: number) => Section;

/** Stack sections vertically. Every section ends in a funnel so they chain safely. */
export function stack(y0: number, width: number, builders: SectionBuilder[]): Section {
  const obstacles: Obstacle[] = [];
  let y = y0;
  for (const b of builders) {
    const s = b(y, width);
    obstacles.push(...s.obstacles);
    y += s.height;
  }
  return { obstacles, height: y - y0 };
}
