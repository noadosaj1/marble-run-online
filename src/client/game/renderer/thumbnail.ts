import { isDynamic, obstaclePose } from '../../../shared/obstacles';
import type { TrackDef } from '../../../shared/tracks';

/**
 * Draws a "course map" preview: the tall track is cut into columns laid out side by
 * side so the whole course fits a small card while staying recognisable.
 */
export function drawTrackThumbnail(canvas: HTMLCanvasElement, track: TrackDef): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 150;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const th = track.theme;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, th.bgTop);
  g.addColorStop(1, th.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const pad = 8;
  const cols = Math.max(2, Math.round((track.height / track.width) * (h / w) * 0.9));
  const colH = track.height / cols;
  const scale = Math.min((h - pad * 2) / colH, (w - pad * 2) / (cols * track.width * 1.06));
  const totalW = cols * track.width * scale * 1.06;
  const startX = (w - totalW) / 2;

  for (let c = 0; c < cols; c++) {
    ctx.save();
    ctx.beginPath();
    const cx = startX + c * track.width * scale * 1.06;
    ctx.rect(cx, pad, track.width * scale, colH * scale);
    ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(cx, pad, track.width * scale, colH * scale);
    ctx.translate(cx, pad - c * colH * scale);
    ctx.scale(scale, scale);
    for (const o of track.obstacles) {
      if (o.y < c * colH - 60 || o.y > (c + 1) * colH + 60) continue;
      switch (o.type) {
        case 'wall':
        case 'conveyor':
          ctx.save();
          ctx.translate(o.x, o.y);
          ctx.rotate(o.angle);
          ctx.fillStyle = o.type === 'conveyor' ? th.accent : th.wallEdge;
          ctx.fillRect(-o.w / 2, -Math.max(o.h, 14) / 2, o.w, Math.max(o.h, 14));
          ctx.restore();
          break;
        case 'peg':
          ctx.fillStyle = th.peg;
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r + 3, 0, Math.PI * 2); ctx.fill();
          break;
        case 'bumper':
          ctx.fillStyle = th.accent;
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r + 4, 0, Math.PI * 2); ctx.fill();
          break;
        default:
          if (isDynamic(o)) {
            const p = obstaclePose(o, 0);
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.fillStyle = th.accent2;
            const len = o.type === 'rotor' ? o.length : o.w;
            const thick = Math.max(16, o.type === 'rotor' ? o.thickness : o.h);
            ctx.fillRect(-len / 2, -thick / 2, len, thick);
            if (o.type === 'rotor' && o.arms > 1) ctx.fillRect(-thick / 2, -len / 2, thick, len);
            ctx.restore();
          }
      }
    }
    if (track.finishY > c * colH && track.finishY < (c + 1) * colH) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, track.finishY - 14, track.width, 28);
    }
    ctx.restore();
  }
}
