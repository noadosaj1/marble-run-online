import Matter from 'matter-js';
import {
  FINISH_GRACE_MS, IMPACT_STRONG, PHYSICS, STUCK_CHECK_MS, STUCK_MIN_MOVE,
} from '../../shared/constants';
import { isDynamic, obstaclePose } from '../../shared/obstacles';
import type { DynamicObstacle, Obstacle } from '../../shared/obstacles';
import { getTrack, startSlots } from '../../shared/tracks';
import type { TrackDef, TrackId } from '../../shared/tracks';
import { EV_BUMPER, EV_FINISH, EV_IMPACT, EV_MARBLE } from '../../shared/types';
import type { MarbleTuple, SimEvent, Snapshot } from '../../shared/types';
import { createRng, shuffle } from './rng';

const { Engine, Bodies, Body, Composite, Events, Vector } = Matter;

// Collision categories. Active marbles only touch the course and each other;
// finished marbles drop into a catch basin below the line and ignore the course.
const CAT_COURSE = 0x0001;
const CAT_MARBLE = 0x0002;
const CAT_DONE = 0x0004;
const CAT_BASIN = 0x0008;

interface MarbleSim {
  index: number;
  body: Matter.Body;
  finished: boolean;
  finishPosition: number;
  finishTimeMs: number;
  /** Anti-stuck bookkeeping. */
  lastX: number;
  lastY: number;
  stuckStrikes: number;
}

type BodyMeta =
  | { kind: 'bumper'; x: number; y: number }
  | { kind: 'conveyor'; dx: number; dy: number; speed: number }
  | { kind: 'wall' };

export interface FinishInfo { index: number; position: number; timeMs: number }

/**
 * Authoritative physics for one race. Deterministic: fixed 1/60 s steps, seeded RNG,
 * no wall-clock reads — (track, marble count, seed) reproduces the same race, which
 * is what a future replay feature would need.
 */
export class RaceSimulation {
  readonly track: TrackDef;
  tick = 0;
  finishOrder: number[] = [];
  /** Set once the race should end (all done / timeout). */
  over = false;
  firstFinishTick = -1;

  private engine: Matter.Engine;
  private marbles: MarbleSim[] = [];
  private movers: { ob: DynamicObstacle; body: Matter.Body }[] = [];
  private meta = new Map<number, BodyMeta>();
  private rng: () => number;
  private events: SimEvent[] = [];
  private lastEventTick = new Map<string, number>();
  private onFinish: (f: FinishInfo) => void;
  private collisionHandler: (e: Matter.IEventCollision<Matter.Engine>) => void;
  private activeHandler: (e: Matter.IEventCollision<Matter.Engine>) => void;
  private disposed = false;
  private seq = 0;

  constructor(
    trackId: TrackId,
    readonly marbleCount: number,
    readonly seed: number,
    onFinish: (f: FinishInfo) => void = () => {},
  ) {
    this.track = getTrack(trackId);
    this.onFinish = onFinish;
    this.rng = createRng(seed);
    this.engine = Engine.create({
      positionIterations: PHYSICS.positionIterations,
      velocityIterations: PHYSICS.velocityIterations,
      enableSleeping: false,
    });
    // Gravity is applied manually to marbles only (scripted bodies must not drift).
    this.engine.gravity.scale = 0;

    this.buildWorld();
    this.spawnMarbles();

    this.collisionHandler = (e) => this.handleCollisionStart(e);
    this.activeHandler = (e) => this.handleCollisionActive(e);
    Events.on(this.engine, 'collisionStart', this.collisionHandler);
    Events.on(this.engine, 'collisionActive', this.activeHandler);
  }

  // ---- world construction -------------------------------------------------

  private buildWorld(): void {
    const { width: W, height: H, finishY } = this.track;
    const bodies: Matter.Body[] = [];
    const courseFilter = { category: CAT_COURSE, mask: CAT_MARBLE, group: 0 };
    const add = (b: Matter.Body, m: BodyMeta = { kind: 'wall' }) => {
      b.collisionFilter = { ...courseFilter };
      this.meta.set(b.id, m);
      bodies.push(b);
    };
    // frictionStatic 0: Matter's static friction makes marbles stick on gentle slopes.
    const staticOpts: Matter.IChamferableBodyDefinition = { isStatic: true, friction: PHYSICS.wall.friction, frictionStatic: 0, restitution: PHYSICS.wall.restitution };

    // Outer walls + ceiling (thick, so nothing escapes).
    add(Bodies.rectangle(-30, H / 2, 60, H + 400, staticOpts));
    add(Bodies.rectangle(W + 30, H / 2, 60, H + 400, staticOpts));
    add(Bodies.rectangle(W / 2, -30, W + 120, 60, staticOpts));

    for (const o of this.track.obstacles) this.addObstacle(o, add, staticOpts);

    // Catch basin below the finish line, only for finished marbles.
    const basinFilter = { category: CAT_BASIN, mask: CAT_DONE, group: 0 };
    const floorY = finishY + 150;
    const basin = [
      Bodies.rectangle(W / 2, floorY + 30, W + 120, 60, { isStatic: true, restitution: 0.3 }),
      Bodies.rectangle(-30, floorY - 100, 60, 400, { isStatic: true }),
      Bodies.rectangle(W + 30, floorY - 100, 60, 400, { isStatic: true }),
    ];
    for (const b of basin) {
      b.collisionFilter = { ...basinFilter };
      bodies.push(b);
    }
    Composite.add(this.engine.world, bodies);
  }

  private addObstacle(
    o: Obstacle,
    add: (b: Matter.Body, m?: BodyMeta) => void,
    staticOpts: Matter.IChamferableBodyDefinition,
  ): void {
    switch (o.type) {
      case 'wall':
        add(Bodies.rectangle(o.x, o.y, o.w, o.h, { ...staticOpts, angle: o.angle }));
        break;
      case 'peg':
        add(Bodies.circle(o.x, o.y, o.r, { isStatic: true, friction: PHYSICS.peg.friction, frictionStatic: 0, restitution: PHYSICS.peg.restitution }, 14));
        break;
      case 'bumper':
        add(
          Bodies.circle(o.x, o.y, o.r, { isStatic: true, frictionStatic: 0, restitution: PHYSICS.bumper.restitution }, 20),
          { kind: 'bumper', x: o.x, y: o.y },
        );
        break;
      case 'conveyor': {
        const body = Bodies.rectangle(o.x, o.y, o.w, o.h, { ...staticOpts, friction: 0, angle: o.angle });
        add(body, { kind: 'conveyor', dx: Math.cos(o.angle), dy: Math.sin(o.angle), speed: o.speed });
        break;
      }
      case 'rotor': {
        const parts: Matter.Body[] = [];
        for (let i = 0; i < o.arms; i++) {
          parts.push(Bodies.rectangle(o.x, o.y, o.length, o.thickness, { angle: (Math.PI * i) / o.arms }));
        }
        const body = parts.length === 1 ? parts[0] : Body.create({ parts });
        this.makeKinematic(body, o);
        add(body);
        break;
      }
      case 'mover': {
        const body = Bodies.rectangle(o.x, o.y, o.w, o.h, { angle: o.angle });
        this.makeKinematic(body, o);
        add(body);
        break;
      }
    }
  }

  /** Scripted bodies: huge mass (immovable) but not "static", so they carry velocity into collisions. */
  private makeKinematic(body: Matter.Body, o: DynamicObstacle): void {
    body.friction = 0;
    body.frictionStatic = 0;
    body.frictionAir = 0;
    body.restitution = 0.4;
    Body.setMass(body, PHYSICS.kinematicMass);
    Body.setInertia(body, PHYSICS.kinematicMass * 1e6);
    const pose = obstaclePose(o, 0);
    Body.setPosition(body, { x: pose.x, y: pose.y });
    Body.setAngle(body, pose.angle);
    this.movers.push({ ob: o, body });
  }

  private spawnMarbles(): void {
    const slots = shuffle(startSlots(this.track, this.marbleCount, PHYSICS.marble.radius), this.rng);
    const m = PHYSICS.marble;
    for (let i = 0; i < this.marbleCount; i++) {
      const body = Bodies.circle(slots[i].x, slots[i].y, m.radius, {
        density: m.density,
        friction: m.friction,
        frictionStatic: m.frictionStatic,
        restitution: m.restitution,
        frictionAir: m.frictionAir,
        label: 'marble',
        collisionFilter: { category: CAT_MARBLE, mask: CAT_COURSE | CAT_MARBLE, group: 0 },
      }, 24);
      this.marbles.push({
        index: i, body, finished: false, finishPosition: 0, finishTimeMs: 0,
        lastX: slots[i].x, lastY: slots[i].y, stuckStrikes: 0,
      });
    }
    Composite.add(this.engine.world, this.marbles.map((m2) => m2.body));
  }

  // ---- stepping -----------------------------------------------------------

  get timeMs(): number {
    return this.tick * PHYSICS.tickMs;
  }

  /** Advance exactly one fixed step. */
  step(): void {
    if (this.disposed) return;
    const dt = PHYSICS.tickMs;
    const tSec = (this.tick * dt) / 1000;
    const nextSec = ((this.tick + 1) * dt) / 1000;

    // 1. scripted obstacles: place at t, give them the velocity that lands them at t+dt
    for (const { ob, body } of this.movers) {
      const a = obstaclePose(ob, tSec);
      const b = obstaclePose(ob, nextSec);
      Body.setPosition(body, { x: a.x, y: a.y });
      Body.setAngle(body, a.angle);
      Body.setVelocity(body, { x: b.x - a.x, y: b.y - a.y });
      Body.setAngularVelocity(body, b.angle - a.angle);
    }

    // 2. gravity on marbles still racing (finished ones fall into the basin too)
    for (const m of this.marbles) {
      m.body.force.y += m.body.mass * PHYSICS.gravity;
    }

    Engine.update(this.engine, dt);
    this.tick++;

    // 3. post-step rules
    for (const m of this.marbles) {
      this.clampSpeed(m.body);
      if (!m.finished) {
        this.checkOutOfBounds(m);
        this.checkFinish(m);
      }
    }
    if (this.tick % Math.round(STUCK_CHECK_MS / dt) === 0) this.checkStuck();
    this.checkRaceOver();
  }

  private clampSpeed(body: Matter.Body): void {
    const v = body.velocity;
    const sp = Math.hypot(v.x, v.y);
    if (sp > PHYSICS.maxSpeed) Body.setVelocity(body, Vector.mult(v, PHYSICS.maxSpeed / sp));
  }

  private checkFinish(m: MarbleSim): void {
    if (m.body.position.y < this.track.finishY) return;
    // Several marbles may cross within one tick: order by how far past the line, then index.
    const crossing = this.marbles
      .filter((o) => !o.finished && o.body.position.y >= this.track.finishY)
      .sort((a, b) => b.body.position.y - a.body.position.y || a.index - b.index);
    if (crossing[0] !== m) return; // handled when the leader of this batch is processed
    for (const c of crossing) {
      c.finished = true;
      c.finishPosition = this.finishOrder.length + 1;
      c.finishTimeMs = Math.round(this.timeMs);
      this.finishOrder.push(c.index);
      if (this.firstFinishTick < 0) this.firstFinishTick = this.tick;
      c.body.collisionFilter = { category: CAT_DONE, mask: CAT_BASIN | CAT_DONE, group: 0 };
      this.pushEvent(EV_FINISH, c.body.position.x, c.body.position.y, 1);
      this.onFinish({ index: c.index, position: c.finishPosition, timeMs: c.finishTimeMs });
    }
  }

  /** Marble squeezed through geometry: put it back at the top, rather than lose it forever. */
  private checkOutOfBounds(m: MarbleSim): void {
    const { x, y } = m.body.position;
    if (x > -20 && x < this.track.width + 20 && y > -40 && y < this.track.finishY + 400) return;
    this.respawn(m);
  }

  private respawn(m: MarbleSim): void {
    const s = this.track.start;
    Body.setPosition(m.body, { x: s.x + (this.rng() - 0.5) * (s.w - 60), y: s.y });
    Body.setVelocity(m.body, { x: 0, y: 0 });
    m.lastX = m.body.position.x;
    m.lastY = m.body.position.y;
    m.stuckStrikes = 0;
  }

  /**
   * Anti-stuck: a marble that has barely moved for a check window gets a
   * (seeded-random) nudge, escalating to a hop if it keeps failing.
   */
  private checkStuck(): void {
    for (const m of this.marbles) {
      if (m.finished) continue;
      const { x, y } = m.body.position;
      const moved = Math.hypot(x - m.lastX, y - m.lastY);
      m.lastX = x;
      m.lastY = y;
      if (moved >= STUCK_MIN_MOVE) {
        m.stuckStrikes = 0;
        continue;
      }
      m.stuckStrikes++;
      const dir = this.rng() < 0.5 ? -1 : 1;
      const power = Math.min(4 + m.stuckStrikes * 2.5, 12);
      Body.setVelocity(m.body, { x: dir * power, y: -power * 0.7 });
      if (m.stuckStrikes >= 6) {
        // Truly wedged: back to the start rather than leaving a DNF.
        this.respawn(m);
      } else if (m.stuckStrikes >= 3) {
        // Last resort: hop up and sideways out of whatever is holding it.
        Body.setPosition(m.body, { x, y: y - 70 });
        Body.setVelocity(m.body, { x: dir * 3, y: 0 });
      }
    }
  }

  private checkRaceOver(): void {
    if (this.over) return;
    const allDone = this.finishOrder.length >= this.marbles.length;
    const graceOver =
      this.firstFinishTick >= 0 && this.timeMs - this.firstFinishTick * PHYSICS.tickMs > FINISH_GRACE_MS;
    const timeout = this.timeMs > this.track.maxDurationSec * 1000;
    if (allDone || graceOver || timeout) this.over = true;
  }

  // ---- collisions / effects ----------------------------------------------

  private pushEvent(kind: number, x: number, y: number, power: number): void {
    // Rate-limit per kind+cell so a pile-up doesn't flood the wire.
    const key = `${kind}:${Math.round(x / 40)}:${Math.round(y / 40)}`;
    const last = this.lastEventTick.get(key) ?? -999;
    if (kind !== EV_FINISH && this.tick - last < 8) return;
    this.lastEventTick.set(key, this.tick);
    if (this.events.length < 24) this.events.push([kind, Math.round(x), Math.round(y), Math.round(power * 10) / 10]);
  }

  private handleCollisionStart(e: Matter.IEventCollision<Matter.Engine>): void {
    for (const pair of e.pairs) {
      const { bodyA, bodyB } = pair;
      const aM = bodyA.label === 'marble';
      const bM = bodyB.label === 'marble';
      if (!aM && !bM) continue;
      const marble = aM ? bodyA : bodyB;
      const other = aM ? bodyB : bodyA;
      const relSpeed = Math.hypot(
        bodyA.velocity.x - bodyB.velocity.x,
        bodyA.velocity.y - bodyB.velocity.y,
      );
      const meta = this.meta.get(other.id);
      if (meta?.kind === 'bumper') {
        // Extra kick away from the bumper's centre — makes bumpers actually bumpy.
        const dx = marble.position.x - meta.x;
        const dy = marble.position.y - meta.y;
        const len = Math.hypot(dx, dy) || 1;
        Body.setVelocity(marble, {
          x: marble.velocity.x + (dx / len) * PHYSICS.bumper.kick,
          y: marble.velocity.y + (dy / len) * PHYSICS.bumper.kick,
        });
        this.pushEvent(EV_BUMPER, marble.position.x, marble.position.y, 1);
      } else if (aM && bM) {
        if (relSpeed > 3) this.pushEvent(EV_MARBLE, marble.position.x, marble.position.y, relSpeed);
      } else if (relSpeed > IMPACT_STRONG) {
        this.pushEvent(EV_IMPACT, marble.position.x, marble.position.y, relSpeed);
      }
    }
  }

  private handleCollisionActive(e: Matter.IEventCollision<Matter.Engine>): void {
    for (const pair of e.pairs) {
      const { bodyA, bodyB } = pair;
      const marble = bodyA.label === 'marble' ? bodyA : bodyB.label === 'marble' ? bodyB : null;
      if (!marble) continue;
      const other = marble === bodyA ? bodyB : bodyA;
      const meta = this.meta.get(other.id);
      if (meta?.kind !== 'conveyor') continue;
      // Accelerate the marble along the belt up to the belt's target speed.
      const along = marble.velocity.x * meta.dx + marble.velocity.y * meta.dy;
      const target = meta.speed;
      const delta = target - along;
      if (Math.abs(delta) < 1e-3) continue;
      const push = Math.sign(delta) * Math.min(PHYSICS.conveyorAccel, Math.abs(delta));
      Body.setVelocity(marble, {
        x: marble.velocity.x + meta.dx * push,
        y: marble.velocity.y + meta.dy * push,
      });
    }
  }

  // ---- output -------------------------------------------------------------

  snapshot(): Snapshot {
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const m: MarbleTuple[] = this.marbles.map((s) => [
      r1(s.body.position.x), r1(s.body.position.y),
      r2(s.body.velocity.x), r2(s.body.velocity.y),
      r2(s.body.angle), s.finishPosition,
    ]);
    const snap: Snapshot = { raceId: 0, seq: this.seq++, t: Math.round(this.timeMs), m };
    if (this.events.length) {
      snap.ev = this.events;
      this.events = [];
    }
    return snap;
  }

  /** Final ranking: finishers in order, then the rest by distance travelled. */
  ranking(): { index: number; finished: boolean; timeMs: number | null }[] {
    const finished = this.finishOrder.map((index) => ({
      index, finished: true, timeMs: this.marbles[index].finishTimeMs as number | null,
    }));
    const rest = this.marbles
      .filter((m) => !m.finished)
      .sort((a, b) => b.body.position.y - a.body.position.y || a.index - b.index)
      .map((m) => ({ index: m.index, finished: false, timeMs: null as number | null }));
    return [...finished, ...rest];
  }

  marblePosition(index: number): { x: number; y: number } {
    return { x: this.marbles[index].body.position.x, y: this.marbles[index].body.position.y };
  }

  /** Release the physics world. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    Events.off(this.engine, 'collisionStart', this.collisionHandler);
    Events.off(this.engine, 'collisionActive', this.activeHandler);
    Composite.clear(this.engine.world, false);
    Engine.clear(this.engine);
    this.marbles = [];
    this.movers = [];
    this.meta.clear();
  }
}

export { isDynamic };
