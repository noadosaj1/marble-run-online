interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string; gravity: number; shape: 0 | 1;
}

const MAX_PARTICLES = 500;

/** Lightweight world-space particle system (sparks, confetti). */
export class Particles {
  private list: Particle[] = [];

  clear(): void {
    this.list.length = 0;
  }

  burst(x: number, y: number, count: number, colors: string[], opts: {
    speed?: number; life?: number; size?: number; gravity?: number; shape?: 0 | 1; up?: number;
  } = {}): void {
    const speed = opts.speed ?? 4;
    for (let i = 0; i < count && this.list.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.9);
      this.list.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - (opts.up ?? 0),
        life: 0,
        max: (opts.life ?? 0.6) * (0.6 + Math.random() * 0.8),
        size: (opts.size ?? 3) * (0.6 + Math.random() * 0.8),
        color: colors[(Math.random() * colors.length) | 0],
        gravity: opts.gravity ?? 0.12,
        shape: opts.shape ?? 0,
      });
    }
  }

  update(dt: number): void {
    const f = dt * 60;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.list[i] = this.list[this.list.length - 1];
        this.list.pop();
        continue;
      }
      p.vy += p.gravity * f;
      p.vx *= 1 - 0.02 * f;
      p.x += p.vx * f;
      p.y += p.vy * f;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.list) {
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.shape === 1) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 9 + p.x);
        ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
