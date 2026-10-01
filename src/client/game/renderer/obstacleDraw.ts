import { obstaclePose } from '../../../shared/obstacles';
import type { Obstacle } from '../../../shared/obstacles';
import type { TrackTheme } from '../../../shared/tracks';

/** Cheap conservative radius for culling. */
export function obstacleRadius(o: Obstacle): number {
  switch (o.type) {
    case 'wall':
    case 'conveyor': return Math.hypot(o.w, o.h) / 2;
    case 'peg':
    case 'bumper': return o.r;
    case 'rotor': return o.length / 2 + o.thickness;
    case 'mover': return Math.hypot(o.w, o.h) / 2 + o.distance;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function slab(ctx: CanvasRenderingContext2D, w: number, h: number, fill: string, edge: string): void {
  roundRect(ctx, -w / 2, -h / 2, w, h, 5);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = edge;
  ctx.stroke();
}

/** Hazard-stripe fill for scripted obstacles, so players can tell "this moves". */
function stripes(ctx: CanvasRenderingContext2D, w: number, h: number, a: string, b: string): void {
  ctx.save();
  roundRect(ctx, -w / 2, -h / 2, w, h, 5);
  ctx.fillStyle = b;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = a;
  const step = Math.max(10, h * 1.1);
  for (let x = -w / 2 - h; x < w / 2 + h; x += step * 2) {
    ctx.beginPath();
    ctx.moveTo(x, h / 2);
    ctx.lineTo(x + step, h / 2);
    ctx.lineTo(x + step + h, -h / 2);
    ctx.lineTo(x + h, -h / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  roundRect(ctx, -w / 2, -h / 2, w, h, 5);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.stroke();
}

export function drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle, tSec: number, th: TrackTheme): void {
  switch (o.type) {
    case 'wall':
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.angle);
      slab(ctx, o.w, o.h, th.wall, th.wallEdge);
      ctx.restore();
      break;
    case 'peg':
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fillStyle = th.peg;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fill();
      break;
    case 'bumper': {
      const pulse = 1 + Math.sin(tSec * 5 + o.x) * 0.04;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * 1.25 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fillStyle = th.accent;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = th.accent2;
      ctx.fill();
      break;
    }
    case 'conveyor': {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.angle);
      slab(ctx, o.w, o.h, '#2b2f44', th.accent);
      // chevrons scrolling in the belt direction
      ctx.save();
      roundRect(ctx, -o.w / 2, -o.h / 2, o.w, o.h, 5);
      ctx.clip();
      const dir = Math.sign(o.speed) || 1;
      const gap = 26;
      const off = (((tSec * Math.abs(o.speed) * 60 * dir) % gap) + gap) % gap;
      ctx.strokeStyle = th.accent2;
      ctx.lineWidth = 3;
      for (let x = -o.w / 2 - gap + off; x < o.w / 2 + gap; x += gap) {
        ctx.beginPath();
        ctx.moveTo(x - dir * 4, -o.h / 2 + 3);
        ctx.lineTo(x + dir * 4, 0);
        ctx.lineTo(x - dir * 4, o.h / 2 - 3);
        ctx.stroke();
      }
      ctx.restore();
      ctx.restore();
      break;
    }
    case 'rotor': {
      const p = obstaclePose(o, tSec);
      ctx.save();
      ctx.translate(p.x, p.y);
      for (let i = 0; i < o.arms; i++) {
        ctx.save();
        ctx.rotate(p.angle + (Math.PI * i) / o.arms);
        stripes(ctx, o.length, o.thickness, th.accent2, '#1c1c2e');
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(0, 0, o.thickness * 0.85, 0, Math.PI * 2);
      ctx.fillStyle = th.accent;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'mover': {
      const p = obstaclePose(o, tSec);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      if (o.kind === 'gate') slab(ctx, o.w, o.h, th.accent, '#fff');
      else stripes(ctx, o.w, o.h, th.accent, '#1c1c2e');
      ctx.restore();
      break;
    }
  }
}
