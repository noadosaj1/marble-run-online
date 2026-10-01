import { bumper, funnel, pegField, slope, switchbacks, wall } from '../obstacles';
import type { Obstacle, SectionBuilder } from '../obstacles';
import { assembleTrack, clearOf, withFunnel } from './common';

/** Plinko field with small edge ramps, ending in a funnel. */
export const dropPlinko = (rows: number, gap = 80): SectionBuilder => (y0, W) => {
  const dy = 52;
  const ramps = [];
  for (let i = 3; i < rows - 2; i += 4) {
    const yy = y0 + 30 + i * dy;
    const left = i % 8 === 3;
    ramps.push(left ? slope(0, yy, 120, yy + 36) : slope(W, yy, W - 120, yy + 36));
  }
  const pegs = clearOf(pegField(0, W, y0 + 30, rows, { dy }), ramps);
  return withFunnel([...pegs, ...ramps], y0, 30 + rows * dy, W, { gap });
};

/** Wedge splits the stream into a peg lane (left) and a long switchback lane (right). */
export const dropSplit: SectionBuilder = (y0, W) => {
  const cx = W / 2;
  const top = y0 + 30;
  const obs: Obstacle[] = [
    slope(cx, top, cx - 250, top + 90),
    slope(cx, top, cx + 250, top + 90),
    wall(cx, top + 520, 16, 900), // divider
    bumper(cx, top - 6, 14),
    ...pegField(0, cx - 8, top + 130, 15, { dx: 64 }),
    ...switchbacks(cx + 8, W, top + 150, 5, { spacing: 160, gap: 100, drop: 80 }),
  ];
  return withFunnel(obs, y0, 1020, W, { height: 170, gap: 80 });
};

/** Two half-width funnels feeding a zig-zag lane and a narrow peg chimney. */
export const dropTwin: SectionBuilder = (y0, W) => {
  const cx = W / 2;
  const obs: Obstacle[] = [
    ...funnel(0, cx, y0 + 20, 150, 74),
    ...funnel(cx, W, y0 + 20, 150, 74),
    wall(cx, y0 + 580, 16, 880),
    ...switchbacks(0, cx - 8, y0 + 200, 5, { spacing: 150, gap: 90, drop: 60 }),
    ...pegField(cx + 8, W, y0 + 200, 14, { dx: 62 }),
  ];
  return withFunnel(obs, y0, 960, W, { height: 170, gap: 90 });
};

/** Sparse final pegs and a wide mouth towards the finish. */
export const dropFinale: SectionBuilder = (y0, W) =>
  withFunnel(pegField(0, W, y0 + 40, 6, { dx: 96, dy: 60, r: 10 }), y0, 420, W, { height: 200, gap: 110 });

export const theDrop = assembleTrack(
  {
    id: 'drop',
    name: 'The Drop',
    tagline: 'Plinko with marbles',
    description: 'A giant vertical marble machine: pegs, ramps, funnels and a few forks in the road.',
    difficulty: 1,
    maxDurationSec: 150,
    theme: {
      bgTop: '#1d1633', bgBottom: '#10122b', wall: '#7a5a3a', wallEdge: '#c99a62',
      peg: '#e9d9a6', accent: '#ffb347', accent2: '#ff6b6b',
    },
  },
  [
    ['Plinko', dropPlinko(11)],
    ['The Fork', dropSplit],
    ['Plinko II', dropPlinko(12, 90)],
    ['Twin Lanes', dropTwin],
    ['Plinko III', dropPlinko(9, 100)],
    ['Final Stretch', dropFinale],
  ],
);
