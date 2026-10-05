import { MARBLE_COLORS } from '../../shared/constants';
import { MARBLE_STRIDE } from '../../shared/types';
import type { SimEvent, Snapshot } from '../../shared/types';

/** Render this far behind the newest snapshot so we can interpolate smoothly. Adjustable per connection. */
let interpDelay = 90;
const MAX_EXTRAPOLATE_MS = 120;
const STEP_MS = 1000 / 60;

export interface SampledMarble {
  x: number; y: number; vx: number; vy: number; angle: number; finishPos: number;
}

/**
 * Holds recent authoritative snapshots (outside React — updates 30x/s) and
 * answers "where was everything at simulation time t?" by interpolation.
 */
class RaceFeed {
  private snaps: Snapshot[] = [];
  private raceId = 0;
  private renderT = 0;
  private synced = false;
  /** Effect events not yet consumed by the renderer. */
  private pendingEvents: SimEvent[] = [];
  version = 0;

  /** Slower transports (HTTP polling) deliver in bursts and need more cushion. */
  setDelay(ms: number): void {
    interpDelay = ms;
  }

  reset(raceId: number): void {
    this.snaps = [];
    this.raceId = raceId;
    this.renderT = 0;
    this.synced = false;
    this.pendingEvents = [];
    this.version++;
  }

  push(s: Snapshot): void {
    if (s.raceId !== this.raceId) {
      if (s.raceId < this.raceId) return;
      this.reset(s.raceId);
    }
    const last = this.snaps[this.snaps.length - 1];
    if (last && s.seq <= last.seq) return; // stale / duplicate
    this.snaps.push(s);
    if (this.snaps.length > 90) this.snaps.shift();
    if (s.ev) this.pendingEvents.push(...s.ev);

    // Steer the playback clock gently towards (newest - delay); jump if far off.
    if (s.t > 0) {
      const target = s.t - interpDelay;
      if (!this.synced || Math.abs(target - this.renderT) > 400) {
        this.renderT = target;
        this.synced = true;
      } else {
        this.renderT += (target - this.renderT) * 0.06;
      }
    }
  }

  get hasData(): boolean {
    return this.snaps.length > 0;
  }

  /** Advance the playback clock. Returns the current simulation time to draw (ms). */
  advance(dtMs: number): number {
    if (this.synced) this.renderT += dtMs;
    return Math.max(0, this.renderT);
  }

  get latestTime(): number {
    return this.snaps.length ? this.snaps[this.snaps.length - 1].t : 0;
  }

  takeEvents(): SimEvent[] {
    const e = this.pendingEvents;
    this.pendingEvents = [];
    return e;
  }

  /** Interpolated marble states at simulation time `t`. */
  sample(t: number, out: SampledMarble[]): SampledMarble[] {
    const n = this.snaps.length;
    if (n === 0) return out;
    const first = this.snaps[0];
    const last = this.snaps[n - 1];
    let a: Snapshot;
    let b: Snapshot;
    let f: number;
    if (t <= first.t) {
      a = b = first;
      f = 0;
    } else if (t >= last.t) {
      a = b = last;
      f = 0;
    } else {
      let i = n - 2;
      while (i > 0 && this.snaps[i].t > t) i--;
      a = this.snaps[i];
      b = this.snaps[i + 1];
      f = (t - a.t) / Math.max(1, b.t - a.t);
    }
    const extra = t > last.t ? Math.min(t - last.t, MAX_EXTRAPOLATE_MS) / STEP_MS : 0;
    const count = last.m.length / MARBLE_STRIDE;
    for (let i = 0; i < count; i++) {
      const o = i * MARBLE_STRIDE;
      const ma = a.m.length > o ? a.m : last.m;
      const mb = b.m.length > o ? b.m : last.m;
      const r = out[i] ?? (out[i] = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, finishPos: 0 });
      r.x = ma[o] + (mb[o] - ma[o]) * f + (extra ? mb[o + 2] * extra : 0);
      r.y = ma[o + 1] + (mb[o + 1] - ma[o + 1]) * f + (extra ? mb[o + 3] * extra : 0);
      r.vx = mb[o + 2];
      r.vy = mb[o + 3];
      r.angle = ma[o + 4] + (mb[o + 4] - ma[o + 4]) * f;
      r.finishPos = mb[o + 5];
    }
    out.length = count;
    return out;
  }
}

export const raceFeed = new RaceFeed();
export const colorFallback = (i: number): string => MARBLE_COLORS[i % MARBLE_COLORS.length];
