export interface Point { x: number; y: number }

export type CameraMode = 'pack' | 'me';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Smooth follow camera for a mostly vertical course.
 * `pack` frames the leading group; `me` follows the local marble.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  /** 0..1 screen-shake energy. */
  shake = 0;
  private placed = false;

  /** Bounds of what we try not to exceed (never so far out that marbles vanish). */
  static minZoom = 0.5;
  static maxZoom = 1.6;

  snap(): void {
    this.placed = false;
  }

  update(
    dt: number,
    view: { w: number; h: number },
    world: { w: number; h: number },
    targets: Point[],
    mode: CameraMode,
  ): void {
    const fit = clamp(view.w / (world.w + 80), Camera.minZoom, Camera.maxZoom);
    let tx = world.w / 2;
    let ty = 0;
    let tz = fit;

    if (targets.length > 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of targets) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      if (mode === 'me') {
        tz = clamp(fit * 1.15, Camera.minZoom, Camera.maxZoom);
        tx = targets[0].x;
        ty = targets[0].y + view.h / tz * 0.12;
      } else {
        const bw = maxX - minX;
        const bh = maxY - minY;
        const byBox = Math.min(view.w / (bw + 260), view.h / (bh + 260));
        tz = clamp(Math.min(fit, byBox), Camera.minZoom, Camera.maxZoom);
        tx = (minX + maxX) / 2;
        // look a little below the group — that's where it's heading
        ty = (minY + maxY) / 2 + view.h / tz * 0.1;
      }
    }

    // Keep the view inside the world horizontally (centre if the world is narrower than the view).
    const halfW = view.w / tz / 2;
    tx = world.w <= halfW * 2 ? world.w / 2 : clamp(tx, halfW - 20, world.w - halfW + 20);
    const halfH = view.h / tz / 2;
    ty = clamp(ty, halfH - 120, world.h - halfH + 40);

    if (!this.placed) {
      this.x = tx; this.y = ty; this.zoom = tz;
      this.placed = true;
      return;
    }
    const kPos = 1 - Math.exp(-dt * 4.5);
    const kZoom = 1 - Math.exp(-dt * 2.2);
    this.x += (tx - this.x) * kPos;
    this.y += (ty - this.y) * kPos;
    this.zoom += (tz - this.zoom) * kZoom;
    this.shake *= Math.exp(-dt * 7);
    if (this.shake < 0.01) this.shake = 0;
  }

  addShake(amount: number): void {
    this.shake = Math.min(1, this.shake + amount);
  }

  /** Visible world rectangle (for culling). */
  bounds(view: { w: number; h: number }, pad = 0): { l: number; r: number; t: number; b: number } {
    const hw = view.w / this.zoom / 2 + pad;
    const hh = view.h / this.zoom / 2 + pad;
    return { l: this.x - hw, r: this.x + hw, t: this.y - hh, b: this.y + hh };
  }
}
