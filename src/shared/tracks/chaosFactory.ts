import { bumper, conveyor, funnel, gate, peg, piston, platform, rotor, slope } from '../obstacles';
import type { Obstacle, SectionBuilder } from '../obstacles';
import { assembleTrack, withFunnel } from './common';

/** Rows of tilted pistons that punch marbles upwards and sideways. */
export const chaosPistons: SectionBuilder = (y0, W) => {
  const obs: Obstacle[] = [];
  const xs = [130, 290, 450, 610, 770];
  xs.forEach((x, i) => {
    obs.push(piston(x, y0 + 120, 70, 90, 0.5, { angle: i % 2 ? 0.2 : -0.2, phase: i * 0.2 }));
  });
  [210, 370, 530, 690].forEach((x, i) => {
    obs.push(peg(x, y0 + 90));
    obs.push(piston(x, y0 + 300, 70, 90, 0.55, { angle: i % 2 ? -0.2 : 0.2, phase: i * 0.27 + 0.1 }));
  });
  [130, 290, 450, 610, 770].forEach((x) => obs.push(peg(x, y0 + 270)));
  obs.push(slope(0, y0 + 380, 110, y0 + 420), slope(W, y0 + 380, W - 110, y0 + 420));
  return withFunnel(obs, y0, 460, W, { height: 160, gap: 90 });
};

/** Zig-zag conveyor belts, including one that runs uphill. */
export const chaosBelts: SectionBuilder = (y0, W) => {
  const obs: Obstacle[] = [
    conveyor(330, y0 + 100, 520, 3.6, 0.25),
    conveyor(570, y0 + 270, 520, -3.6, -0.25),
    conveyor(330, y0 + 440, 520, 3.6, 0.25),
    conveyor(560, y0 + 610, 460, -2.6, 0.18),
    peg(840, y0 + 120), peg(60, y0 + 300), peg(840, y0 + 470),
  ];
  return withFunnel(obs, y0, 700, W, { height: 160, gap: 90 });
};

/** Springy bumpers everywhere. */
export const chaosBumpers: SectionBuilder = (y0, W) => {
  const obs: Obstacle[] = [];
  for (let r = 0; r < 5; r++) {
    const off = r % 2 ? 80 : 0;
    for (let x = 90 + off; x <= W - 80; x += 160) obs.push(bumper(x, y0 + 60 + r * 120, 22));
  }
  obs.push(slope(0, y0 + 520, 130, y0 + 570), slope(W, y0 + 520, W - 130, y0 + 570));
  return withFunnel(obs, y0, 600, W, { height: 160, gap: 90 });
};

/** Fast conveyor shelves that fire marbles at bumpers on the far wall. */
export const chaosShelves: SectionBuilder = (y0, W) => {
  const count = 3;
  const gap = 170;
  const drop = 120;
  const obs: Obstacle[] = [];
  for (let i = 0; i < count; i++) {
    const yy = y0 + 70 + i * 250;
    const fromLeft = i % 2 === 0;
    const len = W - gap;
    const ang = Math.atan2(drop, len);
    const cx = fromLeft ? len / 2 : W - len / 2;
    const cy = yy + drop / 2;
    obs.push(conveyor(cx, cy, len, 4.5, fromLeft ? ang : Math.PI - ang));
    obs.push(bumper(fromLeft ? W - 36 : 36, yy + 190, 18));
  }
  return withFunnel(obs, y0, 70 + count * 250, W, { height: 150, gap: 90 });
};

/** Reverse belts: marbles climb, then get dumped. */
export const chaosClimb: SectionBuilder = (y0, W) => {
  const obs: Obstacle[] = [
    conveyor(450, y0 + 130, 640, 2.4, -0.22),
    conveyor(450, y0 + 330, 640, -2.4, 0.22),
    slope(0, y0 + 90, 90, y0 + 120), slope(W, y0 + 290, W - 90, y0 + 320),
    bumper(450, y0 + 230, 20),
  ];
  return withFunnel(obs, y0, 480, W, { height: 150, gap: 90 });
};

/** Wide tilted platforms sweeping across the track. */
export const chaosSweepers: SectionBuilder = (y0, W) => {
  const obs: Obstacle[] = [
    platform(450, y0 + 110, 260, 'x', 200, 0.28, { angle: 0.14 }),
    platform(450, y0 + 290, 260, 'x', 200, 0.28, { angle: -0.14, phase: 0.5 }),
    platform(450, y0 + 470, 260, 'x', 200, 0.33, { angle: 0.14, phase: 0.25 }),
    bumper(60, y0 + 200, 18), bumper(W - 60, y0 + 380, 18),
  ];
  return withFunnel(obs, y0, 570, W, { height: 160, gap: 90 });
};

/** Chute flings marbles up a fast belt; they sail across to a catcher. */
export const chaosLaunch: SectionBuilder = (y0, W) => {
  const obs: Obstacle[] = [
    slope(W - 40, y0 + 30, 70, y0 + 130),
    conveyor(120, y0 + 190, 170, 7.5, -0.5),
    slope(W, y0 + 330, 330, y0 + 420),
    bumper(560, y0 + 250, 20),
    slope(0, y0 + 330, 90, y0 + 360),
  ];
  return withFunnel(obs, y0, 470, W, { height: 160, gap: 90 });
};

/** Gates and a spinner right above the exit. */
export const chaosFinale: SectionBuilder = (y0, W) => {
  const cx = W / 2;
  const obs: Obstacle[] = [
    ...funnel(0, W, y0 + 10, 190, 180),
    rotor(cx - 70, y0 + 250, 130, 2.2, { arms: 2, thickness: 12 }),
    rotor(cx + 70, y0 + 250, 130, -2.2, { arms: 2, thickness: 12 }),
    gate(cx, y0 + 350, 80, 100, 0.37),
    ...funnel(cx - 160, cx + 160, y0 + 330, 100, 90),
  ];
  return { obstacles: obs, height: 470 };
};

export const chaosFactory = assembleTrack(
  {
    id: 'chaos',
    name: 'Chaos Factory',
    tagline: 'Everything moves',
    description: 'Pistons, conveyors, bumpers and sweeping platforms. Expect to be launched somewhere silly.',
    difficulty: 4,
    maxDurationSec: 200,
    theme: {
      bgTop: '#2b1a10', bgBottom: '#150f12', wall: '#5a4a3e', wallEdge: '#ffb454',
      peg: '#ffd9a0', accent: '#ff6b2c', accent2: '#ffe14d',
    },
  },
  [
    ['Pistons', chaosPistons],
    ['Conveyors', chaosBelts],
    ['Bumpers', chaosBumpers],
    ['Kickers', chaosShelves],
    ['Sweepers', chaosSweepers],
    ['Escalator', chaosClimb],
    ['Launchpad', chaosLaunch],
    ['The Press', chaosFinale],
  ],
);
