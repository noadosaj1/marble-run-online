import { pegField, slope, switchbacks, wall } from '../obstacles';
import type { Obstacle, SectionBuilder } from '../obstacles';
import { assembleTrack, withFunnel } from './common';

/** Loose pegs to spread the pack before the first split. */
export const mazeSpread: SectionBuilder = (y0, W) =>
  ({ obstacles: pegField(0, W, y0 + 30, 5, { dx: 90, dy: 56 }), height: 300 });

/** Three lanes of very different length: switchbacks / dense pegs / long zig-zag. */
export const mazeTriple: SectionBuilder = (y0, W) => {
  const a = W / 3;
  const b = (2 * W) / 3;
  const obs: Obstacle[] = [
    // splitter wedges + dividers
    slope(a, y0 + 30, a - 80, y0 + 75), slope(a, y0 + 30, a + 80, y0 + 75),
    slope(b, y0 + 30, b - 80, y0 + 75), slope(b, y0 + 30, b + 80, y0 + 75),
    wall(a, y0 + 520, 16, 940), wall(b, y0 + 520, 16, 940),
    ...switchbacks(0, a - 8, y0 + 110, 6, { spacing: 150, gap: 84, drop: 55 }),
    ...pegField(a + 8, b - 8, y0 + 110, 15, { dx: 60, margin: 44 }),
    ...switchbacks(b + 8, W, y0 + 110, 8, { spacing: 112, gap: 84, drop: 45, startLeft: false }),
  ];
  return withFunnel(obs, y0, 1010, W, { height: 170, gap: 80 });
};

/** Two lanes: tight shelves on the left, "steps" with pegs on the right. */
export const mazeDual: SectionBuilder = (y0, W) => {
  const cx = W / 2;
  const obs: Obstacle[] = [
    slope(cx, y0 + 30, cx - 160, y0 + 80), slope(cx, y0 + 30, cx + 160, y0 + 80),
    wall(cx, y0 + 480, 16, 840),
    ...switchbacks(0, cx - 8, y0 + 110, 5, { spacing: 160, gap: 76, drop: 70 }),
    ...switchbacks(cx + 8, W, y0 + 130, 4, { spacing: 190, gap: 100, drop: 90, startLeft: false }),
  ];
  return withFunnel(obs, y0, 900, W, { height: 160, gap: 80 });
};

/** Full-width baffles with several gaps: marbles choose by luck. */
export const mazeBaffles: SectionBuilder = (y0, W) => {
  const obs: Obstacle[] = [];
  for (let i = 0; i < 6; i++) {
    const yy = y0 + 50 + i * 150;
    if (i % 2 === 0) {
      obs.push(slope(0, yy, 240, yy + 34), slope(570, yy, 330, yy + 34), slope(W, yy, 660, yy + 34));
    } else {
      obs.push(slope(100, yy, 100 + 280, yy + 30), slope(520, yy + 30, 800, yy));
    }
  }
  return withFunnel(obs, y0, 960, W, { height: 160, gap: 70 });
};

export const maze = assembleTrack(
  {
    id: 'maze',
    name: 'The Maze',
    tagline: 'Pick a path (you can’t)',
    description: 'Lanes split and rejoin. Physics decides your route — short and bumpy, or long and slow.',
    difficulty: 3,
    maxDurationSec: 200,
    theme: {
      bgTop: '#2a1238', bgBottom: '#150b26', wall: '#5b2d7a', wallEdge: '#c47bff',
      peg: '#f3d1ff', accent: '#ff5ca8', accent2: '#8cf06b',
    },
  },
  [
    ['Spread', mazeSpread],
    ['Three Ways', mazeTriple],
    ['Two Ways', mazeDual],
    ['Baffles', mazeBaffles],
  ],
);
