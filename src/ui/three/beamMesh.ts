/**
 * Geometry and heat map of the 3D beam view (no rendering here, unit tested).
 *
 * Coordinates: X = beam axis, Y = up (= −z of the beam convention), Z = section width.
 * The real cross-section outline of every segment is swept along the sample stations of
 * the result grid (duplicate stations at jumps are kept, so jumps stay sharp).
 */
import { ShapeUtils, Vector2 } from 'three';
import type { Analysis } from '../../core/analysis';
import type { ViewResult } from '../../core/results';
import type { SectionDef } from '../../core/types';
import { sectionOutline, sectionProps, type SectionProps } from '../../sections/properties';
import { designStrength } from '../../sections/materials';
import { heatColor, isDiverging, type HeatField, type HeatRange } from './heat';

export { autoSectionScale, heatColor, HEAT_FIELDS, isDiverging, legendGradient, type HeatField, type HeatRange } from './heat';

/** Closed polygon loops of a cross-section, relative to the centroid: [y (width), zDown] */
export interface SectionLoops {
  outer: [number, number][];
  holes: [number, number][][];
  /** further solid parts without holes (e.g. double channel) */
  parts: [number, number][][];
  props: SectionProps;
}

function circle(r: number, n = 40): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [r * Math.cos(a), r * Math.sin(a)] as [number, number];
  });
}

function signedArea(p: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function sectionLoops(def: SectionDef): SectionLoops {
  const props = sectionProps(def);
  const o = sectionOutline(def);
  let outer: [number, number][];
  let holes: [number, number][][] = [];
  let parts: [number, number][][] = [];
  if (o.type === 'circle') {
    outer = circle(o.D / 2);
    if (o.d > 0) holes = [circle(o.d / 2)];
  } else if (o.type === 'poly') {
    const xs = [o.outer, ...(o.parts ?? [])].flat().map((p) => p[0]);
    const cy = (Math.min(...xs) + Math.max(...xs)) / 2;
    const tr = (pts: [number, number][]) => pts.map(([y, z]) => [y - cy, z - props.zc] as [number, number]);
    outer = tr(o.outer);
    if (o.inner) holes = [tr(o.inner)];
    parts = (o.parts ?? []).map(tr);
  } else {
    // manual input: equivalent rectangle with the same A and I
    const h = props.A > 0 ? Math.sqrt((12 * props.I) / props.A) : 0.1;
    const b = props.A > 0 ? props.A / h : 0.1;
    outer = [
      [-b / 2, -h / 2],
      [b / 2, -h / 2],
      [b / 2, h / 2],
      [-b / 2, h / 2],
    ];
  }
  // consistent orientation: outer counter-clockwise, holes clockwise (in the y/z plane)
  if (signedArea(outer) < 0) outer = [...outer].reverse();
  holes = holes.map((h) => (signedArea(h) > 0 ? [...h].reverse() : h));
  parts = parts.map((p) => (signedArea(p) < 0 ? [...p].reverse() : p));
  return { outer, holes, parts, props };
}

export interface BeamMesh {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  range: HeatRange;
  /** overall size for camera framing */
  height: number;
  width: number;
  /** applied section exaggeration and deformation factors */
  sectionScale: number;
  deformFactor: number;
}

export interface BuildOptions {
  field: HeatField;
  /** exaggeration of the cross-section dimensions (display only) */
  sectionScale: number;
  /** show the deformed shape */
  deformed: boolean;
}

/** Governing value of an envelope at sample k (larger magnitude of max/min) */
function gov(max: Float64Array, min: Float64Array, k: number): number {
  return Math.abs(max[k]) >= Math.abs(min[k]) ? max[k] : min[k];
}

/** Field value at a point of the cross-section (z measured downwards from the centroid) */
export function fieldValue(field: HeatField, N: number, V: number, M: number, w: number, zRel: number, p: SectionProps, fd: number): number {
  switch (field) {
    case 'sigma':
      return N / p.A + (p.I > 0 ? (M * zRel) / p.I : 0);
    case 'eta':
      return Math.abs(N / p.A + (p.I > 0 ? (M * zRel) / p.I : 0)) / fd;
    case 'M':
      return M;
    case 'V':
      return V;
    case 'w':
      return Math.abs(w);
  }
}

export function buildBeamMesh(an: Analysis, vr: ViewResult, o: BuildOptions): BeamMesh {
  const prep = an.prep!;
  const els = prep.mesh.elements;
  const g = vr.grid;
  const n = g.x.length;
  const L = an.model.L;
  const segLoops = an.model.segments.map((s) => sectionLoops(s.section));
  const S = o.sectionScale;

  // station values
  const N = new Float64Array(n);
  const V = new Float64Array(n);
  const M = new Float64Array(n);
  const W = new Float64Array(n);
  let wmax = 0;
  for (let k = 0; k < n; k++) {
    N[k] = gov(vr.max.N, vr.min.N, k);
    V[k] = gov(vr.max.V, vr.min.V, k);
    M[k] = gov(vr.max.M, vr.min.M, k);
    W[k] = gov(vr.max.w, vr.min.w, k);
    wmax = Math.max(wmax, Math.abs(W[k]));
  }
  const deformFactor = o.deformed && wmax > 0 ? (0.04 * L) / wmax : 0;

  // first pass: value range
  let vmin = Infinity;
  let vmax = -Infinity;
  const valueAt = (k: number, zRel: number) => {
    const e = els[g.elem[k]];
    return fieldValue(o.field, N[k], V[k], M[k], W[k], zRel, e.section, designStrength(e.material));
  };
  for (let k = 0; k < n; k++) {
    const loops = segLoops[els[g.elem[k]].segIndex];
    const zs = [loops.outer, ...loops.parts].flat().map((p) => p[1]);
    for (const z of [Math.min(...zs), Math.max(...zs)]) {
      const v = valueAt(k, z);
      if (Number.isFinite(v)) {
        vmin = Math.min(vmin, v);
        vmax = Math.max(vmax, v);
      }
    }
  }
  if (!Number.isFinite(vmin)) vmin = vmax = 0;
  const range: HeatRange = { min: vmin, max: vmax, diverging: isDiverging(o.field) };
  if (o.field === 'eta') {
    range.min = 0;
    range.max = Math.max(1, vmax); // red = 100 % utilisation and more
  } else if (!range.diverging) range.min = 0;

  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const vertex = (k: number, y: number, zRel: number) => {
    const yy = -(zRel * S) - W[k] * deformFactor;
    pos.push(g.x[k], yy, y * S);
    const c = heatColor(valueAt(k, zRel), range);
    col.push(c[0], c[1], c[2]);
    return pos.length / 3 - 1;
  };

  // runs of stations belonging to one segment (one swept solid per run)
  let start = 0;
  let maxH = 0;
  let maxB = 0;
  while (start < n) {
    const seg = els[g.elem[start]].segIndex;
    let end = start;
    while (end + 1 < n && els[g.elem[end + 1]].segIndex === seg) end++;
    const loops = segLoops[seg];
    const zs = [loops.outer, ...loops.parts].flat().map((p) => p[1]);
    const ys = [loops.outer, ...loops.parts].flat().map((p) => p[0]);
    maxH = Math.max(maxH, (Math.max(...zs) - Math.min(...zs)) * S);
    maxB = Math.max(maxB, (Math.max(...ys) - Math.min(...ys)) * S);
    // side walls: every polygon edge gets its own vertices (flat shading across the profile)
    for (const loop of [loops.outer, ...loops.holes, ...loops.parts]) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        let prevA = -1;
        let prevB = -1;
        for (let k = start; k <= end; k++) {
          const va = vertex(k, a[0], a[1]);
          const vb = vertex(k, b[0], b[1]);
          if (prevA >= 0) idx.push(prevA, prevB, vb, prevA, vb, va);
          prevA = va;
          prevB = vb;
        }
      }
    }
    // end caps
    for (const [outerLoop, holeLoops] of [[loops.outer, loops.holes], ...loops.parts.map((p) => [p, []])] as [[number, number][], [number, number][][]][]) {
      const contour = outerLoop.map(([y, z]) => new Vector2(y, z));
      const holes = holeLoops.map((h) => h.map(([y, z]) => new Vector2(y, z)));
      const tris = ShapeUtils.triangulateShape(contour, holes);
      const all = [...outerLoop, ...holeLoops.flat()];
      for (const [k, flip] of [
        [start, true],
        [end, false],
      ] as [number, boolean][]) {
        const base = all.map(([y, z]) => vertex(k, y, z));
        for (const t of tris) {
          if (flip) idx.push(base[t[0]], base[t[1]], base[t[2]]);
          else idx.push(base[t[0]], base[t[2]], base[t[1]]);
        }
      }
    }
    start = end + 1;
  }
  return {
    positions: new Float32Array(pos),
    colors: new Float32Array(col),
    indices: new Uint32Array(idx),
    range,
    height: maxH,
    width: maxB,
    sectionScale: S,
    deformFactor,
  };
}
