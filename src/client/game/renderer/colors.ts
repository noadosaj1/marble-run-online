/** Mix a #rrggbb color towards white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = amount >= 0 ? 255 : 0;
  const a = Math.abs(amount);
  const r = Math.round(((n >> 16) & 255) * (1 - a) + target * a);
  const g = Math.round(((n >> 8) & 255) * (1 - a) + target * a);
  const b = Math.round((n & 255) * (1 - a) + target * a);
  return `rgb(${r},${g},${b})`;
}
