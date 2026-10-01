import { PHYSICS } from '../../../shared/constants';
import { isDynamic } from '../../../shared/obstacles';
import type { TrackDef } from '../../../shared/tracks';
import { EV_BUMPER, EV_FINISH, EV_IMPACT, EV_MARBLE, RacePhase } from '../../../shared/types';
import type { Racer, SimEvent } from '../../../shared/types';
import { Camera } from '../camera/Camera';
import type { CameraMode, Point } from '../camera/Camera';
import { Particles } from '../effects/Particles';
import { Trails } from '../effects/Trails';
import { sound } from '../audio/sound';
import type { SampledMarble } from '../raceFeed';
import { shade } from './colors';
import { drawObstacle, obstacleRadius } from './obstacleDraw';

export interface Frame {
  dt: number;
  /** Simulation time in ms. */
  simTimeMs: number;
  marbles: SampledMarble[];
  racers: Racer[];
  localIndex: number;
  phase: RacePhase;
  cameraMode: CameraMode;
  /** Finishing times by racer index (null while racing). */
  finishTimes: (number | null)[];
}

const R = PHYSICS.marble.radius;
const CONFETTI = ['#ff4d6d', '#ffe14d', '#4cc9ff', '#7bd953', '#d65cff', '#ffffff'];

/**
 * Draws one frame of the race onto a canvas. Pure presentation: it knows nothing
 * about sockets or React, it just turns (track, interpolated marbles) into pixels.
 */
export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private camera = new Camera();
  private particles = new Particles();
  private trails = new Trails();
  private rolls: number[] = [];
  private lastX: number[] = [];
  private view = { w: 1, h: 1 };
  private dpr = 1;
  private track: TrackDef;
  private bgDots: { x: number; y: number; r: number; k: number }[] = [];
  private finishedFlag: boolean[] = [];

  constructor(private canvas: HTMLCanvasElement, track: TrackDef) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.track = track;
    for (let i = 0; i < 70; i++) {
      this.bgDots.push({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2.5, k: 0.1 + Math.random() * 0.25 });
    }
  }

  reset(): void {
    this.camera.snap();
    this.particles.clear();
    this.trails.clear();
    this.rolls = [];
    this.lastX = [];
    this.finishedFlag = [];
  }

  // ---- frame ---------------------------------------------------------------

  render(f: Frame): void {
    this.resize();
    const { ctx } = this;
    const { w, h } = this.view;

    this.updateWorld(f);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackground(f.simTimeMs / 1000);

    const cam = this.camera;
    const sh = cam.shake;
    const ox = sh ? (Math.random() - 0.5) * sh * 18 : 0;
    const oy = sh ? (Math.random() - 0.5) * sh * 18 : 0;
    ctx.save();
    ctx.translate(w / 2 + ox, h / 2 + oy);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    const b = cam.bounds(this.view, 80);
    this.drawTrack(b);
    this.drawObstacles(b, f.simTimeMs / 1000);
    this.drawFinishLine(f.simTimeMs / 1000);
    this.drawMarbles(f, b);
    this.drawEffects();
    ctx.restore();

    this.drawLabels(f);
    this.drawHud(f);
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.dpr = dpr;
    this.view = { w, h };
  }

  // ---- simulation of presentation state (camera, effects) --------------------

  private updateWorld(f: Frame): void {
    const { marbles } = f;
    const active: Point[] = [];
    let leaderY = -Infinity;
    for (let i = 0; i < marbles.length; i++) if (!marbles[i].finishPos) leaderY = Math.max(leaderY, marbles[i].y);

    for (let i = 0; i < marbles.length; i++) {
      const m = marbles[i];
      // Fake rolling: spin proportional to horizontal travel (physics runs frictionless).
      const lx = this.lastX[i] ?? m.x;
      this.rolls[i] = (this.rolls[i] ?? 0) + (m.x - lx) / R + m.vy * 0.004 * (m.vx >= 0 ? 1 : -1);
      this.lastX[i] = m.x;
      this.trails.push(i, m.x, m.y);
      if (!m.finishPos && (m.y > leaderY - 650)) active.push(m);
      if (m.finishPos && !this.finishedFlag[i]) {
        this.finishedFlag[i] = true;
        this.particles.burst(m.x, this.track.finishY, 36, [f.racers[i]?.color ?? '#fff', ...CONFETTI], {
          speed: 7, life: 1.1, size: 4, gravity: 0.18, shape: 1, up: 6,
        });
      }
    }

    let targets: Point[] = active;
    if (f.cameraMode === 'me' && f.localIndex >= 0 && marbles[f.localIndex]) targets = [marbles[f.localIndex]];
    else if (targets.length === 0) {
      // everyone is across the line: watch the finish tray
      targets = [{ x: this.track.width / 2, y: this.track.finishY + 60 }];
    }
    if (f.phase === RacePhase.COUNTDOWN || f.phase === RacePhase.WAITING) {
      targets = [{ x: this.track.start.x, y: this.track.start.y + 120 }];
    }
    this.camera.update(Math.min(f.dt, 0.1), this.view, { w: this.track.width, h: this.track.height }, targets, f.cameraMode);

    this.processEvents(f);
    this.particles.update(Math.min(f.dt, 0.1));
  }

  private processEvents(f: Frame): void {
    const evs: SimEvent[] = this.pendingEvents;
    this.pendingEvents = [];
    const b = this.camera.bounds(this.view, 40);
    for (const [kind, x, y, power] of evs) {
      const visible = x > b.l && x < b.r && y > b.t && y < b.b;
      if (!visible) continue;
      switch (kind) {
        case EV_IMPACT:
          this.particles.burst(x, y, 7, ['#ffffff', '#ffe9a8'], { speed: 3.5, life: 0.4, size: 2.5 });
          this.camera.addShake(Math.min(0.5, (power - 8) / 25));
          sound.play('impact', 120);
          break;
        case EV_BUMPER:
          this.particles.burst(x, y, 12, [this.track.theme.accent, this.track.theme.accent2, '#fff'], { speed: 5, life: 0.5, size: 3 });
          sound.play('bumper', 90);
          break;
        case EV_MARBLE:
          sound.play('clack', 60);
          break;
        case EV_FINISH:
          this.camera.addShake(0.15);
          break;
      }
    }
    void f;
  }

  private pendingEvents: SimEvent[] = [];
  queueEvents(e: SimEvent[]): void {
    if (e.length) this.pendingEvents.push(...e);
  }

  // ---- drawing ---------------------------------------------------------------

  drawBackground(tSec: number): void {
    const { ctx } = this;
    const { w, h } = this.view;
    const th = this.track.theme;
    // darker towards the bottom as the race progresses down the track
    const g = ctx.createLinearGradient(0, 0, 0, h);
    const p = Math.max(0, Math.min(1, this.camera.y / this.track.height));
    g.addColorStop(0, mix(th.bgTop, th.bgBottom, p));
    g.addColorStop(1, mix(th.bgTop, th.bgBottom, Math.min(1, p + 0.35)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // parallax dust
    ctx.fillStyle = '#ffffff';
    for (const d of this.bgDots) {
      const px = mod(d.x * (w + 100) - this.camera.x * this.camera.zoom * d.k, w + 100) - 50;
      const py = mod(d.y * (h + 100) - this.camera.y * this.camera.zoom * d.k + tSec * 2, h + 100) - 50;
      ctx.globalAlpha = 0.07 + d.k * 0.25;
      ctx.beginPath();
      ctx.arc(px, py, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawTrack(b: { l: number; r: number; t: number; b: number }): void {
    const { ctx } = this;
    const { width: W, height: H } = this.track;
    const th = this.track.theme;
    // playfield backdrop
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, Math.max(0, b.t), W, Math.min(H, b.b) - Math.max(0, b.t));
    // faint horizontal guide lines every 200 units help sense of speed
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 2;
    const y0 = Math.max(0, Math.floor(b.t / 200) * 200);
    for (let y = y0; y < Math.min(H, b.b); y += 200) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // outer walls
    ctx.fillStyle = th.wall;
    ctx.fillRect(b.l - 50, b.t, -(b.l - 50) , b.b - b.t);
    ctx.fillRect(W, b.t, b.r - W + 50, b.b - b.t);
    ctx.fillStyle = th.wallEdge;
    ctx.fillRect(-3, b.t, 3, b.b - b.t);
    ctx.fillRect(W, b.t, 3, b.b - b.t);

    // section markers
    ctx.font = '700 22px Fredoka, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const m of this.track.markers) {
      if (m.y < b.t - 40 || m.y > b.b + 40) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(0, m.y - 1, W, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillText(m.text.toUpperCase(), 16, m.y + 20);
    }
  }

  drawObstacles(b: { l: number; r: number; t: number; b: number }, tSec: number): void {
    const th = this.track.theme;
    for (const o of this.track.obstacles) {
      const r = obstacleRadius(o);
      if (o.y + r < b.t || o.y - r > b.b || o.x + r < b.l || o.x - r > b.r) continue;
      drawObstacle(this.ctx, o, tSec, th);
    }
    void isDynamic;
  }

  drawFinishLine(tSec: number): void {
    const { ctx } = this;
    const { width: W, finishY } = this.track;
    const sq = 28;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i * sq < W; i++) {
        ctx.fillStyle = (i + row) % 2 === 0 ? '#ffffff' : '#111122';
        ctx.fillRect(i * sq, finishY - sq + row * sq, Math.min(sq, W - i * sq), sq);
      }
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 54px Fredoka, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('FINISH', W / 2, finishY - sq - 18 + Math.sin(tSec * 3) * 2);
    // catch tray
    const floor = finishY + 150;
    const g = ctx.createLinearGradient(0, finishY + sq, 0, floor + 30);
    g.addColorStop(0, 'rgba(255,214,64,0)');
    g.addColorStop(1, 'rgba(255,214,64,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(0, finishY + sq, W, floor - finishY - sq + 30);
    ctx.fillStyle = this.track.theme.wallEdge;
    ctx.fillRect(0, floor + 4, W, 10);
  }

  drawMarbles(f: Frame, b: { l: number; r: number; t: number; b: number }): void {
    const { ctx } = this;
    // trails first (under marbles)
    for (let i = 0; i < f.marbles.length; i++) {
      const m = f.marbles[i];
      if (m.y < b.t - 100 || m.y > b.b + 100) continue;
      if (!m.finishPos) this.trails.draw(ctx, i, f.racers[i]?.color ?? '#fff', R);
    }
    // local marble drawn last so it's never hidden
    const order = f.marbles.map((_, i) => i).sort((a, c) => (a === f.localIndex ? 1 : c === f.localIndex ? -1 : 0));
    for (const i of order) {
      const m = f.marbles[i];
      if (m.x < b.l - 40 || m.x > b.r + 40 || m.y < b.t - 40 || m.y > b.b + 40) continue;
      const color = f.racers[i]?.color ?? '#fff';
      this.drawMarble(m.x, m.y, color, this.rolls[i] ?? 0, i === f.localIndex);
    }
  }

  private drawMarble(x: number, y: number, color: string, roll: number, isLocal: boolean): void {
    const { ctx } = this;
    if (isLocal) {
      ctx.beginPath();
      ctx.arc(x, y, R + 5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(x, y);
    const g = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
    g.addColorStop(0, shade(color, 0.55));
    g.addColorStop(0.5, color);
    g.addColorStop(1, shade(color, -0.45));
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.stroke();
    // swirl so rolling is visible
    ctx.rotate(roll);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.62, 0.2, Math.PI * 0.8);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.stroke();
    ctx.rotate(-roll);
    ctx.beginPath();
    ctx.arc(-R * 0.35, -R * 0.4, R * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
    ctx.restore();
  }

  drawEffects(): void {
    this.particles.draw(this.ctx);
  }

  /** Name tags in screen space so they stay readable at any zoom. */
  drawLabels(f: Frame): void {
    const { ctx } = this;
    const { w, h } = this.view;
    const cam = this.camera;
    type L = { i: number; sx: number; sy: number; rank: number };
    const visible: L[] = [];
    for (let i = 0; i < f.marbles.length; i++) {
      const m = f.marbles[i];
      const sx = (m.x - cam.x) * cam.zoom + w / 2;
      const sy = (m.y - cam.y) * cam.zoom + h / 2;
      if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;
      visible.push({ i, sx, sy, rank: i === f.localIndex ? -1 : -m.y });
    }
    visible.sort((a, c) => a.rank - c.rank);
    const crowded = visible.length > 8;
    const fs = crowded ? 11 : Math.max(12, Math.min(15, 11 + cam.zoom * 3));
    ctx.font = `700 ${fs}px Fredoka, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const l of visible) {
      const name = f.racers[l.i]?.nickname ?? '';
      const tw = ctx.measureText(name).width + 12;
      const th = fs + 6;
      const cx = l.sx;
      const cy = l.sy - (R + 6) * cam.zoom - th / 2;
      const rect = { x0: cx - tw / 2, y0: cy - th / 2, x1: cx + tw / 2, y1: cy + th / 2 };
      const local = l.i === f.localIndex;
      if (!local && placed.some((p) => rect.x0 < p.x1 && rect.x1 > p.x0 && rect.y0 < p.y1 && rect.y1 > p.y0)) continue;
      placed.push(rect);
      ctx.fillStyle = local ? 'rgba(255,255,255,0.95)' : 'rgba(12,10,32,0.72)';
      ctx.beginPath();
      ctx.roundRect(rect.x0, rect.y0, tw, th, th / 2);
      ctx.fill();
      ctx.fillStyle = local ? '#1b1340' : '#fff';
      ctx.fillText(name, cx, cy + 1);
    }

    // off-screen pointer to the local marble
    const lm = f.marbles[f.localIndex];
    if (lm && !lm.finishPos) {
      const sy = (lm.y - cam.y) * cam.zoom + h / 2;
      if (sy < 0 || sy > h) {
        const up = sy < 0;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = '700 13px Fredoka, system-ui, sans-serif';
        ctx.beginPath();
        ctx.roundRect(w / 2 - 38, up ? 64 : h - 38, 76, 26, 13);
        ctx.fill();
        ctx.fillStyle = '#1b1340';
        ctx.fillText(up ? '▲ You' : '▼ You', w / 2, up ? 77 : h - 25);
      }
    }
  }

  /** Timer, finishing board and course-progress strip. */
  drawHud(f: Frame): void {
    const { ctx } = this;
    const { w, h } = this.view;
    const racing = f.phase === RacePhase.RACING || f.phase === RacePhase.FINISHED;
    if (!racing) return;

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = '700 26px Fredoka, system-ui, sans-serif';
    const s = f.simTimeMs / 1000;
    const txt = `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
    // on narrow screens the top-right is taken by the buttons, so the timer moves left
    const tx = w > 560 ? w / 2 : 16 + 54;
    ctx.fillStyle = 'rgba(12,10,32,0.6)';
    ctx.beginPath(); ctx.roundRect(tx - 54, 12, 108, 38, 19); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(txt, tx, 32);

    // progress strip
    const x = w - 16;
    const top = 70;
    const bottom = h - 60;
    if (bottom - top > 80) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.roundRect(x - 3, top, 6, bottom - top, 3); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - 9, bottom - 2, 18, 4);
      for (let i = 0; i < f.marbles.length; i++) {
        const m = f.marbles[i];
        const p = Math.min(1, Math.max(0, m.y / this.track.finishY));
        const y = top + p * (bottom - top);
        ctx.beginPath();
        ctx.arc(x, y, i === f.localIndex ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = f.racers[i]?.color ?? '#fff';
        ctx.fill();
        ctx.lineWidth = i === f.localIndex ? 2 : 1;
        ctx.strokeStyle = i === f.localIndex ? '#fff' : 'rgba(0,0,0,0.6)';
        ctx.stroke();
      }
    }

    // finishing board
    const done = f.marbles
      .map((m, i) => ({ i, pos: m.finishPos }))
      .filter((e) => e.pos > 0)
      .sort((a, c) => a.pos - c.pos)
      .slice(0, 6);
    if (done.length) {
      const bx = w - 190;
      ctx.textAlign = 'left';
      ctx.font = '700 14px Fredoka, system-ui, sans-serif';
      done.forEach((e, k) => {
        const y = 70 + k * 26;
        if (y > h - 120) return;
        ctx.fillStyle = 'rgba(12,10,32,0.62)';
        ctx.beginPath(); ctx.roundRect(bx - 8, y - 11, 166, 24, 12); ctx.fill();
        ctx.fillStyle = f.racers[e.i]?.color ?? '#fff';
        ctx.beginPath(); ctx.arc(bx + 6, y + 1, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        const t = f.finishTimes[e.i];
        const name = (f.racers[e.i]?.nickname ?? '').slice(0, 11);
        ctx.fillText(`${e.pos}. ${name}`, bx + 18, y + 1);
        if (t != null) {
          ctx.textAlign = 'right';
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillText(`${(t / 1000).toFixed(1)}s`, bx + 150, y + 1);
          ctx.textAlign = 'left';
        }
      });
    }
  }
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Linear blend between two #rrggbb colors. */
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}
