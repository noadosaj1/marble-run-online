import { bumper, funnel, gate, peg, pegField, rotor, slope, switchbacks } from '../obstacles';
import type { Obstacle, SectionBuilder } from '../obstacles';
import { assembleTrack, withFunnel } from './common';

/** A big cross under the chute, then two counter-rotating bars. */
export const spinWheel: SectionBuilder = (y0, W) => {
  const cx = W / 2;
  const obs: Obstacle[] = [
    rotor(cx, y0 + 110, 230, 1.3, { arms: 2 }),
    peg(cx - 175, y0 + 190), peg(cx + 175, y0 + 190),
    slope(0, y0 + 230, 150, y0 + 275), slope(W, y0 + 230, W - 150, y0 + 275),
    rotor(225, y0 + 400, 340, 1.1),
    rotor(675, y0 + 400, 340, -1.1),
    peg(cx, y0 + 410),
  ];
  return withFunnel(obs, y0, 600, W, { height: 160, gap: 90 });
};

/** Paddle wheels in the side pockets shove marbles back to the middle. */
export const spinPaddles: SectionBuilder = (y0, W) => {
  const cx = W / 2;
  const obs: Obstacle[] = [
    rotor(140, y0 + 120, 250, 1.0, { arms: 3, thickness: 12 }),
    rotor(W - 140, y0 + 270, 250, -1.0, { arms: 3, thickness: 12 }),
    rotor(140, y0 + 420, 250, 1.0, { arms: 3, thickness: 12, phase: 0.5 }),
    ...pegField(300, 600, y0 + 60, 8, { dx: 76, dy: 62 }),
    rotor(cx, y0 + 590, 320, 0.8),
  ];
  return withFunnel(obs, y0, 700, W, { height: 160, gap: 90 });
};

/** Gentle shelves with spinning bats that flick marbles along (or back). */
export const spinShelves = (flip = false): SectionBuilder => (y0, W) => {
  const count = 4;
  const obs: Obstacle[] = switchbacks(0, W, y0 + 70, count, { spacing: 230, gap: 150, drop: 150, startLeft: !flip });
  for (let i = 0; i < count; i++) {
    const yy = y0 + 70 + i * 230;
    obs.push(rotor(W / 2 + (i % 2 ? 90 : -90), yy - 45, 120, i % 2 ? 2.2 : -2.2));
  }
  return withFunnel(obs, y0, 70 + count * 230, W, { height: 150, gap: 90 });
};

/** Three rows of staggered windmills. */
export const spinWindmill: SectionBuilder = (y0, W) => {
  const obs: Obstacle[] = [
    rotor(150, y0 + 80, 240, 1.5), rotor(450, y0 + 80, 240, -1.5), rotor(750, y0 + 80, 240, 1.5),
    rotor(300, y0 + 270, 240, -1.3), rotor(600, y0 + 270, 240, 1.3),
    rotor(150, y0 + 460, 240, 1.5, { phase: 1 }), rotor(450, y0 + 460, 240, -1.5, { phase: 1 }),
    rotor(750, y0 + 460, 240, 1.5, { phase: 1 }),
    peg(30, y0 + 180), peg(W - 30, y0 + 180), peg(30, y0 + 370), peg(W - 30, y0 + 370),
  ];
  return withFunnel(obs, y0, 600, W, { height: 160, gap: 90 });
};

/** Sliding gates guard a double funnel. */
export const spinGates: SectionBuilder = (y0, W) => {
  const cx = W / 2;
  const obs: Obstacle[] = [
    ...funnel(0, W, y0 + 20, 170, 150),
    gate(cx, y0 + 215, 70, 85, 0.33),
    ...funnel(cx - 200, cx + 200, y0 + 260, 120, 76),
    gate(cx, y0 + 395, 56, 70, 0.41, 0.5),
    bumper(cx - 120, y0 + 150, 14), bumper(cx + 120, y0 + 150, 14),
  ];
  return { obstacles: obs, height: 460 };
};

/** One huge slow bar over the finish approach. */
export const spinFinale: SectionBuilder = (y0, W) => {
  const cx = W / 2;
  const obs: Obstacle[] = [
    rotor(cx, y0 + 140, 560, 0.9, { thickness: 16 }),
    rotor(cx, y0 + 140, 90, -2.4, { arms: 2, thickness: 12 }),
    slope(0, y0 + 220, 160, y0 + 270), slope(W, y0 + 220, W - 160, y0 + 270),
  ];
  return withFunnel(obs, y0, 330, W, { height: 170, gap: 120 });
};

export const spinner = assembleTrack(
  {
    id: 'spinner',
    name: 'The Spinner',
    tagline: 'Round and round',
    description: 'Rotating bars, paddle wheels and sliding gates that fling marbles sideways.',
    difficulty: 2,
    maxDurationSec: 170,
    theme: {
      bgTop: '#0f2a3d', bgBottom: '#0c1426', wall: '#27506b', wallEdge: '#5fb7e8',
      peg: '#bfe7ff', accent: '#3be8c8', accent2: '#ffd23f',
    },
  },
  [
    ['Spin Cycle', spinWheel],
    ['Paddles', spinPaddles],
    ['Bat Shelves', spinShelves()],
    ['Windmills', spinWindmill],
    ['The Gates', spinGates],
    ['Big Sweep', spinFinale],
  ],
);
