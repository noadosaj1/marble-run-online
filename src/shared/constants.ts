/**
 * Tunable constants shared by client and server. Anything that changes how the
 * game feels lives here (or in a track file), not scattered through the code.
 */

export const MAX_PLAYERS = 16;
export const NICKNAME_MAX_LENGTH = 16;
export const ROOM_CODE_LENGTH = 4;
/** No I, L, O, 0, 1 — easy to read out loud and to type. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** 16 clearly distinguishable marble colors (assigned per room, never repeated). */
export const MARBLE_COLORS: readonly string[] = [
  '#ff4d6d', // red
  '#ffa62b', // orange
  '#ffe14d', // yellow
  '#b6e32e', // lime
  '#1fbf75', // green
  '#2ad4c8', // teal
  '#4cc9ff', // sky
  '#3f6bff', // blue
  '#8a5cff', // violet
  '#d65cff', // purple
  '#ff6fd1', // pink
  '#ffffff', // white
  '#b5651d', // brown
  '#a3b1c6', // silver
  '#ff8a5c', // coral
  '#e6c9a0', // sand
];

// ---- Networking ----
export const SNAPSHOT_EVERY_TICKS = 2; // 60 Hz sim -> 30 Hz snapshots
export const COUNTDOWN_SNAPSHOT_MS = 300; // keepalive snapshots while marbles are frozen
export const RESULTS_DELAY_MS = 3500; // FINISHED -> RESULTS pause so the last finish is seen

// ---- Race rules ----
export const FINISH_GRACE_MS = 45_000; // after the first finisher, stragglers get this long
export const STUCK_CHECK_MS = 2500;
export const STUCK_MIN_MOVE = 7; // px a marble must travel per check window

// ---- Physics (Matter.js units: px, ms; one fixed step = 1/60 s) ----
export const PHYSICS = {
  tickMs: 1000 / 60,
  /** Matter force scale; ~0.30 px/step² acceleration. */
  gravity: 0.0011,
  positionIterations: 8,
  velocityIterations: 6,
  /** Hard clamp (px / step) so marbles can never tunnel through thin walls. */
  maxSpeed: 19,
  marble: {
    radius: 11,
    density: 0.002,
    friction: 0, // Matter friction makes marbles stick on gentle slopes; rolling is faked client-side
    frictionStatic: 0,
    restitution: 0.42,
    frictionAir: 0.024,
  },
  wall: { friction: 0, restitution: 0.35 },
  peg: { friction: 0, restitution: 0.5 },
  bumper: { restitution: 1.0, kick: 5.5 },
  conveyorAccel: 0.55,
  /** Mass of kinematic (scripted) bodies — effectively immovable. */
  kinematicMass: 1e7,
} as const;

/** Event thresholds for client effects (relative speed in px/step). */
export const IMPACT_STRONG = 9;
