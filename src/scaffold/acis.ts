/**
 * Extent of ACIS bodies (3DSOLID) of a DXF: the vertices ("point" records) of the body in the
 * coordinates of the block, with the transform of the body applied.
 *  - from AutoCAD 2013 on the body is stored binary (SAB) in the ACDSDATA section ("ASM_Data", by the
 *    handle of the 3DSOLID);
 *  - older DXF hold the text form (SAT) in the 3DSOLID record, groups 1 / 3, each character c ≠ space
 *    written as 159 − c.
 * Only what is needed for a bounding box; no external libraries.
 */
export type V3 = [number, number, number];
export interface Box {
  min: V3;
  max: V3;
}

/** bytes of a hex string (groups 310 joined) */
export function hexBytes(hex: string): Uint8Array {
  const n = hex.length >> 1;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function findSeq(b: Uint8Array, seq: number[], from: number): number {
  outer: for (let i = from; i + seq.length <= b.length; i++) {
    for (let k = 0; k < seq.length; k++) if (b[i + k] !== seq[k]) continue outer;
    return i;
  }
  return -1;
}

const ident = (s: string) => [0x0d, s.length, ...Array.from(s, (c) => c.charCodeAt(0))];
const POINT = ident('point');
const TRANSFORM = ident('transform');

interface Affine {
  /** rows of the rotation (applied to row vectors), translation, scale */
  a: number[];
  t: V3;
  s: number;
}

const apply = (T: Affine | null, p: V3): V3 => {
  if (!T) return p;
  const { a, t, s } = T;
  return [0, 1, 2].map((j) => (p[0] * a[j] + p[1] * a[3 + j] + p[2] * a[6 + j]) * s + t[j]) as V3;
};

function boxOf(pts: V3[]): Box | null {
  if (!pts.length) return null;
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pts)
    for (let i = 0; i < 3; i++) {
      if (p[i] < min[i]) min[i] = p[i];
      if (p[i] > max[i]) max[i] = p[i];
    }
  return { min, max };
}

/** bounding box of a binary ACIS body (SAB) */
export function sabBox(b: Uint8Array): Box | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const vec = (at: number): V3 | null => (at + 25 <= b.length && (b[at] === 0x13 || b[at] === 0x14) ? [dv.getFloat64(at + 1, true), dv.getFloat64(at + 9, true), dv.getFloat64(at + 17, true)] : null);
  let T: Affine | null = null;
  const kt = findSeq(b, TRANSFORM, 0);
  if (kt >= 0) {
    const v: V3[] = [];
    let k = kt + TRANSFORM.length;
    while (v.length < 4 && k < b.length) {
      if (b[k] === 0x14) {
        const x = vec(k);
        if (!x) break;
        v.push(x);
        k += 25;
      } else k++;
    }
    let s = 1;
    if (b[k] === 0x06 && k + 9 <= b.length) s = dv.getFloat64(k + 1, true);
    if (v.length === 4)
      T = {
        a: [...v[0], ...v[1], ...v[2]],
        t: v[3],
        s: Number.isFinite(s) && s > 0 ? s : 1,
      };
  }
  const pts: V3[] = [];
  let k = 0;
  for (;;) {
    k = findSeq(b, POINT, k);
    if (k < 0) break;
    k += POINT.length;
    // the position of the point: the next 3 doubles (tag 0x13)
    for (let i = k; i < Math.min(k + 64, b.length); i++)
      if (b[i] === 0x13) {
        const p = vec(i);
        if (p && p.every(Number.isFinite)) pts.push(apply(T, p));
        break;
      }
  }
  return boxOf(pts);
}

/** text of an encoded SAT body (groups 1 / 3 of the 3DSOLID) */
export function decodeSat(lines: string[]): string {
  return lines.map((l) => Array.from(l, (c) => (c === ' ' ? ' ' : String.fromCharCode(159 - c.charCodeAt(0)))).join('')).join('\n');
}

/** bounding box of a text ACIS body (SAT, decoded) */
export function satBox(sat: string): Box | null {
  const recs = sat.split('#');
  const nums = (r: string) =>
    r
      .trim()
      .split(/\s+/)
      .slice(1)
      .filter((t) => !t.startsWith('$') && /^-?[\d.]+(e[-+]?\d+)?$/i.test(t))
      .map(Number);
  let T: Affine | null = null;
  const tr = recs.find((r) => /^\s*-?\d*\s*transform\b/.test(r) || /^\s*transform\b/.test(r));
  if (tr) {
    let n = nums(tr.replace(/^\s*-?\d+\s+/, ''));
    if (n.length > 13 && Number.isInteger(n[0])) n = n.slice(1);
    if (n.length >= 13)
      T = {
        a: n.slice(0, 9),
        t: [n[9], n[10], n[11]],
        s: n[12] > 0 ? n[12] : 1,
      };
  }
  const pts: V3[] = [];
  for (const r of recs) {
    if (!/^\s*(-?\d+\s+)?point\b/.test(r)) continue;
    const n = nums(r.replace(/^\s*-?\d+\s+/, ''));
    if (n.length >= 3) pts.push(apply(T, [n[n.length - 3], n[n.length - 2], n[n.length - 1]]));
  }
  return boxOf(pts);
}
