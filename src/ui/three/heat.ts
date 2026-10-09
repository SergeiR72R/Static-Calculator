/** Heat map colour scales and helpers of the 3D view (no three.js dependency, statically importable). */

export type HeatField = 'sigma' | 'eta' | 'M' | 'V' | 'w';
export const HEAT_FIELDS: HeatField[] = ['sigma', 'eta', 'M', 'V', 'w'];

/** diverging fields are coloured symmetric around 0 (blue = negative / compression, red = positive / tension) */
export function isDiverging(f: HeatField): boolean {
  return f === 'sigma' || f === 'M' || f === 'V';
}

type RGB = [number, number, number];
const DIVERGING: RGB[] = [
  [0.13, 0.4, 0.67], // −max  #2166ac
  [0.57, 0.77, 0.87],
  [0.9, 0.9, 0.9], // 0
  [0.96, 0.65, 0.51],
  [0.7, 0.09, 0.17], // +max  #b2182b
];
const SEQUENTIAL: RGB[] = [
  [0.17, 0.48, 0.71], // 0       #2c7bb6
  [0.67, 0.85, 0.91],
  [1.0, 1.0, 0.75],
  [0.99, 0.68, 0.38],
  [0.84, 0.1, 0.11], // max     #d7191c
];

function ramp(stops: RGB[], t: number): RGB {
  const u = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(u));
  const f = u - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** colour for a value given the colour range */
export function heatColor(v: number, range: HeatRange): RGB {
  if (range.diverging) {
    const m = Math.max(Math.abs(range.min), Math.abs(range.max)) || 1;
    return ramp(DIVERGING, 0.5 + v / (2 * m));
  }
  const span = range.max - range.min || 1;
  return ramp(SEQUENTIAL, (v - range.min) / span);
}

/** CSS gradient of the colour scale (legend) */
export function legendGradient(diverging: boolean): string {
  const stops = diverging ? DIVERGING : SEQUENTIAL;
  return `linear-gradient(to right, ${stops.map((c, i) => `rgb(${c.map((x) => Math.round(x * 255)).join(',')}) ${(i / (stops.length - 1)) * 100}%`).join(', ')})`;
}

export interface HeatRange {
  min: number;
  max: number;
  diverging: boolean;
}

/** Automatic section exaggeration so that the section stays visible on long beams */
export function autoSectionScale(L: number, h: number): number {
  if (!(h > 0)) return 1;
  const s = L / (14 * h);
  return s <= 1.5 ? 1 : s <= 3 ? 2 : s <= 7 ? 5 : 10;
}

