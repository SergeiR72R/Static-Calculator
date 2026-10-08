import type { Id } from './types';
import {
  axialDisplacement,
  axialForce,
  bendingMoment,
  deflectionEB,
  deflectionIntegrated,
  fixedEndState,
  shearForce,
} from './element';
import { elementLoad, type LinearResult, type Prepared } from './analysis';

export const FIELDS = ['N', 'V', 'M', 'u', 'w', 'theta', 'sigma', 'tau'] as const;
export type Field = (typeof FIELDS)[number];

export type PointValues = Record<Field, number>;

/** Exact evaluation of all result fields inside element `ei` at local coordinate ξ ∈ [0, L]. */
export function evalElement(prep: Prepared, lr: LinearResult, ei: number, xi: number): PointValues {
  const e = prep.mesh.elements[ei];
  const g = prep.dof.elem[ei];
  const ld = elementLoad(lr, ei);
  const L = e.L;
  const N = axialForce(xi, L, lr.N0[ei], ld);
  const V = shearForce(xi, L, lr.V0[ei], ld);
  const M = bendingMoment(xi, L, lr.V0[ei], lr.M0[ei], ld);
  const u = axialDisplacement(xi, e.props, lr.u[g[0]], lr.N0[ei], ld);
  const d =
    Number.isFinite(e.props.GAs)
      ? deflectionIntegrated(xi, e.props, lr.u[g[1]], lr.u[g[2]], lr.V0[ei], lr.M0[ei], ld)
      : deflectionEB(xi, e.props, { w1: lr.u[g[1]], t1: lr.u[g[2]], w2: lr.u[g[4]], t2: lr.u[g[5]] }, ld);
  return { N, V, M, u, w: d.w, theta: d.theta, sigma: sigmaOf(prep, ei, N, M), tau: tauOf(prep, ei, V) };
}

/** σ = |N|/A + |M|/W for the governing fibre (express check) */
export function sigmaOf(prep: Prepared, ei: number, N: number, M: number): number {
  const s = prep.mesh.elements[ei].section;
  const W = Math.min(s.Wtop || Infinity, s.Wbot || Infinity);
  return Math.abs(N) / s.A + (Number.isFinite(W) ? Math.abs(M) / W : 0);
}

/** τ = V·S/(I·b) at the neutral axis; NaN if S or b unknown */
export function tauOf(prep: Prepared, ei: number, V: number): number {
  const s = prep.mesh.elements[ei].section;
  if (!(s.S > 0) || !(s.bNA > 0)) return NaN;
  return (Math.abs(V) * s.S) / (s.I * s.bNA);
}

export interface SampleGrid {
  x: Float64Array;
  elem: Int32Array;
  xi: Float64Array;
}

/** Sampling points; each element contributes its own end points so jumps appear as duplicate x. */
export function sampleGrid(prep: Prepared, target = 400): SampleGrid {
  const els = prep.mesh.elements;
  const L = prep.mesh.L;
  const counts = els.map((e) => Math.max(2, 2 * Math.ceil((target * e.L) / (2 * L))));
  const total = counts.reduce((s, c) => s + c + 1, 0);
  const x = new Float64Array(total);
  const elem = new Int32Array(total);
  const xi = new Float64Array(total);
  let k = 0;
  els.forEach((e, ei) => {
    const n = counts[ei];
    for (let j = 0; j <= n; j++) {
      const s = j === n ? e.L : (e.L * j) / n;
      x[k] = j === n ? e.x2 : e.x1 + s;
      elem[k] = ei;
      xi[k] = s;
      k++;
    }
  });
  return { x, elem, xi };
}

export type FieldArrays = Record<Field, Float64Array>;

export function newFieldArrays(n: number): FieldArrays {
  return {
    N: new Float64Array(n),
    V: new Float64Array(n),
    M: new Float64Array(n),
    u: new Float64Array(n),
    w: new Float64Array(n),
    theta: new Float64Array(n),
    sigma: new Float64Array(n),
    tau: new Float64Array(n),
  };
}

export function sampleResult(prep: Prepared, lr: LinearResult, grid: SampleGrid): FieldArrays {
  const n = grid.x.length;
  const out = newFieldArrays(n);
  for (let k = 0; k < n; k++) {
    const v = evalElement(prep, lr, grid.elem[k], grid.xi[k]);
    for (const f of FIELDS) out[f][k] = v[f];
  }
  return out;
}

/** Reaction components per support [R_x(+→), R_z(+↑), M_R(+↻)] for rigid restraints and springs */
export interface SupportReaction {
  supportId: Id;
  Rx: number;
  Rz: number;
  M: number;
  spring: boolean;
}

/** Flat reaction vector: 3 components per support in model order (rigid + spring) */
export function reactionVector(prep: Prepared, lr: LinearResult): Float64Array {
  const sup = prep.model.supports;
  const idx = new Map(sup.map((s, i) => [s.id, i]));
  const out = new Float64Array(3 * sup.length);
  const add = (id: Id, comp: 'u' | 'w' | 't', f: number) => {
    const i = idx.get(id);
    if (i === undefined) return;
    if (comp === 'u') out[3 * i] += f;
    else if (comp === 'w') out[3 * i + 1] -= f; // upward positive
    else out[3 * i + 2] += f;
  };
  for (const r of prep.restraints) add(r.supportId, r.comp, lr.R[r.dof]);
  prep.springs.forEach((s, i) => add(s.supportId, s.comp, lr.springF[i]));
  return out;
}

export function reactionsList(prep: Prepared, vec: Float64Array): SupportReaction[] {
  return prep.model.supports.map((s, i) => ({
    supportId: s.id,
    Rx: vec[3 * i],
    Rz: vec[3 * i + 1],
    M: vec[3 * i + 2],
    spring: s.type === 'spring',
  }));
}

/** Global equilibrium of the applied loads, reactions and spring forces: residuals [ΣF_x, ΣF_z, ΣM_O] */
export function equilibrium(prep: Prepared, lr: LinearResult): { residual: number[]; loadScale: number } {
  let fx = lr.sum[0];
  let fz = lr.sum[1];
  let mo = lr.sum[2];
  const xOf = (d: number) => prep.mesh.nodes[prep.dof.nodeOf[d]].x;
  const add = (d: number, comp: 'u' | 'w' | 't', f: number) => {
    if (comp === 'u') fx += f;
    else if (comp === 'w') {
      fz += f;
      mo += xOf(d) * f;
    } else mo += f;
  };
  for (const r of prep.restraints) add(r.dof, r.comp, lr.R[r.dof]);
  prep.springs.forEach((s, i) => add(s.dof, s.comp, lr.springF[i]));
  // load scale for relative residuals: Σ|nodal + equivalent loads|
  let scale = 0;
  for (let i = 0; i < lr.Fn.length; i++) scale += Math.abs(lr.Fn[i]) + Math.abs(lr.Fe[i]);
  for (let i = 0; i < lr.R.length; i++) scale += Math.abs(lr.R[i]);
  return { residual: [fx, fz, mo], loadScale: scale };
}

export interface Extreme {
  value: number;
  x: number;
}

export type Extremes = Record<Field, { max: Extreme; min: Extreme }>;

function quadRoots(a: number, b: number, c: number): number[] {
  // a·ξ² + b·ξ + c = 0
  if (Math.abs(a) < 1e-300) return Math.abs(b) > 1e-300 ? [-c / b] : [];
  const D = b * b - 4 * a * c;
  if (D < 0) return [];
  const s = Math.sqrt(D);
  return [(-b + s) / (2 * a), (-b - s) / (2 * a)];
}

function emptyExtremes(): Extremes {
  const e = {} as Extremes;
  for (const f of FIELDS) e[f] = { max: { value: -Infinity, x: 0 }, min: { value: Infinity, x: 0 } };
  return e;
}

function consider(ex: Extremes, v: PointValues, x: number) {
  for (const f of FIELDS) {
    const val = v[f];
    if (Number.isNaN(val)) continue;
    if (val > ex[f].max.value) ex[f].max = { value: val, x };
    if (val < ex[f].min.value) ex[f].min = { value: val, x };
  }
}

function finalize(ex: Extremes) {
  for (const f of FIELDS) {
    if (!Number.isFinite(ex[f].max.value)) ex[f].max = { value: NaN, x: 0 };
    if (!Number.isFinite(ex[f].min.value)) ex[f].min = { value: NaN, x: 0 };
  }
  return ex;
}

/**
 * Exact extremes of a single result: candidates are element ends, zeros of p (N), q (V),
 * V (M), the zeros of the slope (w, found by bisection) and a regular sub-sampling.
 */
export function extremesSingle(prep: Prepared, lr: LinearResult): Extremes {
  const ex = emptyExtremes();
  prep.mesh.elements.forEach((e, ei) => {
    const L = e.L;
    const cands = new Set<number>([0, L]);
    const sub = 8;
    for (let k = 1; k < sub; k++) cands.add((L * k) / sub);
    const q1 = lr.q1[ei];
    const dq = lr.q2[ei] - q1;
    const p1 = lr.p1[ei];
    const dp = lr.p2[ei] - p1;
    if (dp !== 0) cands.add((-p1 * L) / dp);
    if (dq !== 0) cands.add((-q1 * L) / dq);
    // V(ξ) = V0 − q1 ξ − dq ξ²/(2L) = 0
    for (const r of quadRoots(-dq / (2 * L), -q1, lr.V0[ei])) cands.add(r);
    // slope zeros for w: sign changes on a fine grid, then bisection
    const slope = slopeFunction(prep, lr, ei);
    const n = 32;
    let sa = slope(0);
    for (let k = 1; k <= n; k++) {
      const b = (L * k) / n;
      const sb = slope(b);
      if (sa === 0) cands.add((L * (k - 1)) / n);
      else if (sa * sb < 0) {
        let lo = (L * (k - 1)) / n;
        let hi = b;
        let flo = sa;
        for (let it = 0; it < 45; it++) {
          const mid = (lo + hi) / 2;
          const fm = slope(mid);
          if (flo * fm <= 0) hi = mid;
          else {
            lo = mid;
            flo = fm;
          }
        }
        cands.add((lo + hi) / 2);
      }
      sa = sb;
    }
    for (const s of cands) {
      if (!(s >= 0 && s <= L)) continue;
      consider(ex, evalElement(prep, lr, ei, s), e.x1 + s);
    }
  });
  return finalize(ex);
}

/** dw/dx inside an element as a fast closure (used for locating deflection extremes) */
export function slopeFunction(prep: Prepared, lr: LinearResult, ei: number): (xi: number) => number {
  const e = prep.mesh.elements[ei];
  const g = prep.dof.elem[ei];
  const ld = elementLoad(lr, ei);
  const L = e.L;
  const { EI, GAs } = e.props;
  const q1 = ld.q1;
  const dq = ld.q2 - ld.q1;
  if (Number.isFinite(GAs)) {
    const t1 = lr.u[g[2]];
    const V0 = lr.V0[ei];
    const M0 = lr.M0[ei];
    return (xi) => {
      const intM = M0 * xi + (V0 * xi * xi) / 2 - (q1 * xi ** 3) / 6 - (dq * xi ** 4) / (24 * L);
      const V = V0 - q1 * xi - (dq * xi * xi) / (2 * L);
      return t1 - intM / EI + V / GAs;
    };
  }
  const w1 = lr.u[g[1]];
  const t1 = lr.u[g[2]];
  const w2 = lr.u[g[4]];
  const t2 = lr.u[g[5]];
  const f = q1 !== 0 || dq !== 0 ? fixedEndState(e.props, ld) : { M0: 0, V0: 0 };
  return (xi) => {
    const s = xi / L;
    const h =
      ((-6 * s + 6 * s * s) / L) * w1 + (1 - 4 * s + 3 * s * s) * t1 + ((6 * s - 6 * s * s) / L) * w2 + (-2 * s + 3 * s * s) * t2;
    return h - (f.M0 * xi + (f.V0 * xi * xi) / 2 - (q1 * xi ** 3) / 6 - (dq * xi ** 4) / (24 * L)) / EI;
  };
}

/** Extremes from sampled envelope arrays */
export function extremesSampled(grid: SampleGrid, max: FieldArrays, min: FieldArrays): Extremes {
  const ex = emptyExtremes();
  for (const f of FIELDS) {
    const a = max[f];
    const b = min[f];
    for (let k = 0; k < grid.x.length; k++) {
      if (a[k] > ex[f].max.value) ex[f].max = { value: a[k], x: grid.x[k] };
      if (b[k] < ex[f].min.value) ex[f].min = { value: b[k], x: grid.x[k] };
    }
  }
  return finalize(ex);
}
