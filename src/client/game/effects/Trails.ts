const LEN = 14;

/** Short fading tail behind each marble. */
export class Trails {
  private pts: Float32Array[] = [];
  private counts: number[] = [];

  clear(): void {
    this.pts = [];
    this.counts = [];
  }

  push(i: number, x: number, y: number): void {
    const buf = (this.pts[i] ??= new Float32Array(LEN * 2));
    const n = this.counts[i] ?? 0;
    if (n > 0) {
      const lx = buf[(n - 1) % LEN * 2];
      const ly = buf[(n - 1) % LEN * 2 + 1];
      if (Math.abs(lx - x) + Math.abs(ly - y) < 2.5) return; // barely moved
    }
    buf[n % LEN * 2] = x;
    buf[n % LEN * 2 + 1] = y;
    this.counts[i] = n + 1;
  }

  draw(ctx: CanvasRenderingContext2D, i: number, color: string, radius: number): void {
    const buf = this.pts[i];
    const n = this.counts[i] ?? 0;
    if (!buf || n < 2) return;
    const count = Math.min(n, LEN);
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    for (let k = 1; k < count; k++) {
      const a = (n - k - 1 + LEN * 4) % LEN;
      const b = (n - k + LEN * 4) % LEN;
      const t = 1 - k / count;
      ctx.globalAlpha = t * 0.35;
      ctx.lineWidth = radius * 1.5 * t;
      ctx.beginPath();
      ctx.moveTo(buf[a * 2], buf[a * 2 + 1]);
      ctx.lineTo(buf[b * 2], buf[b * 2 + 1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
