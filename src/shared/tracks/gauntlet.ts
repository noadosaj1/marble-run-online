import { funnel, gate, peg, rotor, slope } from '../obstacles';
import type { Obstacle, SectionBuilder } from '../obstacles';
import { assembleTrack } from './common';
import { dropPlinko } from './theDrop';
import { spinShelves, spinWheel, spinWindmill } from './spinner';
import { mazeBaffles, mazeTriple } from './maze';
import { chaosClimb, chaosPistons, chaosSweepers } from './chaosFactory';

/** A huge funnel studded with pegs. */
const bigFunnel: SectionBuilder = (y0, W) => {
  const obs: Obstacle[] = [...funnel(0, W, y0 + 10, 520, 90)];
  // pegs inside the cone, kept clear of the slanted walls
  for (let r = 0; r < 6; r++) {
    const half = 380 - r * 55;
    const n = Math.max(1, Math.floor(half / 60));
    for (let i = -n; i <= n; i++) {
      if (Math.abs(i * 60 + (r % 2) * 30) <= half - 30) obs.push(peg(W / 2 + i * 60 + (r % 2) * 30, y0 + 70 + r * 62));
    }
  }
  return { obstacles: obs, height: 560 };
};

/** Last hurdle: crossed bars and a gate right before the line. */
const finalBoss: SectionBuilder = (y0, W) => {
  const cx = W / 2;
  const obs: Obstacle[] = [
    rotor(cx, y0 + 120, 600, 1.0, { thickness: 16 }),
    rotor(cx - 250, y0 + 120, 100, -2.6, { arms: 2, thickness: 12 }),
    rotor(cx + 250, y0 + 120, 100, 2.6, { arms: 2, thickness: 12 }),
    slope(0, y0 + 230, 150, y0 + 275), slope(W, y0 + 230, W - 150, y0 + 275),
    ...funnel(0, W, y0 + 300, 170, 140),
    gate(cx, y0 + 490, 90, 110, 0.4),
  ];
  return { obstacles: obs, height: 520 };
};

export const gauntlet = assembleTrack(
  {
    id: 'gauntlet',
    name: 'The Gauntlet',
    tagline: 'The grand finale',
    description: 'Six sections, every mechanic. Plinko, spinners, a maze, moving platforms, a giant funnel and a final boss.',
    difficulty: 5,
    maxDurationSec: 420,
    theme: {
      bgTop: '#1a1030', bgBottom: '#0a0a1c', wall: '#4a3a7a', wallEdge: '#ffd23f',
      peg: '#ffe9a8', accent: '#ff4d8d', accent2: '#3be8c8',
    },
  },
  [
    ['1 · Plinko', dropPlinko(12)],
    ['1 · Plinko', dropPlinko(8, 90)],
    ['2 · Spinners', spinWheel],
    ['2 · Bat Shelves', spinShelves()],
    ['2 · Windmills', spinWindmill],
    ['3 · The Maze', mazeTriple],
    ['3 · Baffles', mazeBaffles],
    ['4 · Platforms', chaosSweepers],
    ['4 · Escalator', chaosClimb],
    ['4 · Pistons', chaosPistons],
    ['5 · Big Funnel', bigFunnel],
    ['6 · Final Boss', finalBoss],
  ],
);
