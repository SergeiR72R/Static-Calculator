import type { Combination, Id } from './types';
import { combineResults, type Analysis, type LinearResult, type Prepared } from './analysis';
import {
  FIELDS,
  evalElement,
  extremesSampled,
  extremesSingle,
  newFieldArrays,
  reactionVector,
  sampleGrid,
  sampleResult,
  sigmaOf,
  tauOf,
  type Extremes,
  type FieldArrays,
  type PointValues,
  type SampleGrid,
} from './postprocess';

export type ResultView = { type: 'case'; id: Id } | { type: 'combo'; id: Id } | { type: 'envelope' };

export interface ViewResult {
  view: ResultView;
  kind: 'single' | 'envelope';
  /** the linear result for single views (exact evaluation, report) */
  lr?: LinearResult;
  grid: SampleGrid;
  max: FieldArrays;
  min: FieldArrays;
  reactions: { max: Float64Array; min: Float64Array };
  extremes: Extremes;
  /** number of combination variants contained (pattern loading / envelope) */
  variants: number;
}

type Terms = [number, LinearResult][];

/** Linear decomposition of a combination: base terms + independent optional parts (pattern loading). */
export interface Decomposition {
  base: Terms;
  parts: Terms;
}

export function decomposeCombination(an: Analysis, factors: Record<Id, number>): Decomposition {
  const base: Terms = [];
  const parts: Terms = [];
  for (const [cid, f] of Object.entries(factors)) {
    if (!f) continue;
    const cr = an.cases.get(cid);
    if (!cr) continue;
    if (cr.pattern) {
      base.push([f, cr.pattern.rest]);
      for (const s of cr.pattern.spans) parts.push([f, s]);
    } else base.push([f, cr.full]);
  }
  return { base, parts };
}

/** Plain (non-pattern) linear combination Σ γ·E */
export function combinationResult(an: Analysis, factors: Record<Id, number>): LinearResult {
  const prep = an.prep as Prepared;
  const terms: Terms = [];
  for (const [cid, f] of Object.entries(factors)) {
    const cr = an.cases.get(cid);
    if (cr && f) terms.push([f, cr.full]);
  }
  return combineResults(prep, terms);
}

const LINEAR_FIELDS = ['N', 'V', 'M', 'u', 'w', 'theta'] as const;

// Sampling is linear in the loads: every basic result is sampled once per analysis and
// combinations / envelopes are formed from the sampled arrays (superposition).
const gridCache = new WeakMap<Prepared, SampleGrid>();
const sampleCache = new WeakMap<LinearResult, { s: FieldArrays; r: Float64Array }>();

export function gridFor(prep: Prepared): SampleGrid {
  let g = gridCache.get(prep);
  if (!g) {
    g = sampleGrid(prep);
    gridCache.set(prep, g);
  }
  return g;
}

function sampled(prep: Prepared, lr: LinearResult, grid: SampleGrid): { s: FieldArrays; r: Float64Array } {
  if (grid !== gridCache.get(prep)) return { s: sampleResult(prep, lr, grid), r: reactionVector(prep, lr) };
  let c = sampleCache.get(lr);
  if (!c) {
    c = { s: sampleResult(prep, lr, grid), r: reactionVector(prep, lr) };
    sampleCache.set(lr, c);
  }
  return c;
}

function superpose(prep: Prepared, grid: SampleGrid, terms: Terms): { s: FieldArrays; r: Float64Array } {
  const n = grid.x.length;
  const s = newFieldArrays(n);
  const r = new Float64Array(3 * prep.model.supports.length);
  for (const [f, lr] of terms) {
    const c = sampled(prep, lr, grid);
    for (const fld of LINEAR_FIELDS) {
      const a = s[fld];
      const b = c.s[fld];
      for (let k = 0; k < n; k++) a[k] += f * b[k];
    }
    for (let i = 0; i < r.length; i++) r[i] += f * c.r[i];
  }
  return { s, r };
}

function deriveStress(prep: Prepared, grid: SampleGrid, max: FieldArrays, min: FieldArrays) {
  for (let k = 0; k < grid.x.length; k++) {
    const ei = grid.elem[k];
    const N = Math.max(Math.abs(max.N[k]), Math.abs(min.N[k]));
    const M = Math.max(Math.abs(max.M[k]), Math.abs(min.M[k]));
    const V = Math.max(Math.abs(max.V[k]), Math.abs(min.V[k]));
    max.sigma[k] = min.sigma[k] = sigmaOf(prep, ei, N, M);
    max.tau[k] = min.tau[k] = tauOf(prep, ei, V);
  }
}

function singleView(an: Analysis, view: ResultView, terms: Terms, grid: SampleGrid): ViewResult {
  const prep = an.prep as Prepared;
  const lr = terms.length === 1 && terms[0][0] === 1 ? terms[0][1] : combineResults(prep, terms);
  const { s, r } = superpose(prep, grid, terms);
  deriveStress(prep, grid, s, s);
  return {
    view,
    kind: 'single',
    lr,
    grid,
    max: s,
    min: s,
    reactions: { max: r, min: r },
    extremes: extremesSingle(prep, lr),
    variants: 1,
  };
}

interface Env {
  max: FieldArrays;
  min: FieldArrays;
  rmax: Float64Array;
  rmin: Float64Array;
  variants: number;
}

/** Envelope over all subsets of the optional parts: max = base + Σ max(0, part), min = base + Σ min(0, part) */
function decompositionEnvelope(prep: Prepared, d: Decomposition, grid: SampleGrid): Env {
  const base = superpose(prep, grid, d.base);
  const max = newFieldArrays(grid.x.length);
  const min = newFieldArrays(grid.x.length);
  for (const f of LINEAR_FIELDS) {
    max[f].set(base.s[f]);
    min[f].set(base.s[f]);
  }
  const rmax = Float64Array.from(base.r);
  const rmin = Float64Array.from(base.r);
  for (const [fac, lr] of d.parts) {
    const c = sampled(prep, lr, grid);
    for (const f of LINEAR_FIELDS) {
      const a = c.s[f];
      const mx = max[f];
      const mn = min[f];
      for (let k = 0; k < a.length; k++) {
        const v = fac * a[k];
        if (v > 0) mx[k] += v;
        else mn[k] += v;
      }
    }
    for (let i = 0; i < c.r.length; i++) {
      const v = fac * c.r[i];
      if (v > 0) rmax[i] += v;
      else rmin[i] += v;
    }
  }
  deriveStress(prep, grid, max, min);
  return { max, min, rmax, rmin, variants: 2 ** d.parts.length };
}

function envelopeView(view: ResultView, grid: SampleGrid, env: Env): ViewResult {
  return {
    view,
    kind: 'envelope',
    grid,
    max: env.max,
    min: env.min,
    reactions: { max: env.rmax, min: env.rmin },
    extremes: extremesSampled(grid, env.max, env.min),
    variants: env.variants,
  };
}

/** Envelope over several combinations (each possibly with pattern loading) */
export function combinationsEnvelope(an: Analysis, combos: Combination[], grid: SampleGrid): Env | null {
  const prep = an.prep as Prepared;
  let acc: Env | null = null;
  for (const c of combos) {
    const env = decompositionEnvelope(prep, decomposeCombination(an, c.factors), grid);
    if (!acc) {
      acc = env;
      continue;
    }
    for (const f of FIELDS) {
      const a = acc.max[f];
      const b = acc.min[f];
      for (let k = 0; k < a.length; k++) {
        a[k] = Math.max(a[k], env.max[f][k]);
        b[k] = Math.min(b[k], env.min[f][k]);
      }
    }
    for (let i = 0; i < acc.rmax.length; i++) {
      acc.rmax[i] = Math.max(acc.rmax[i], env.rmax[i]);
      acc.rmin[i] = Math.min(acc.rmin[i], env.rmin[i]);
    }
    acc.variants += env.variants;
  }
  if (acc) deriveStress(prep, grid, acc.max, acc.min);
  return acc;
}

/** Results for a view (load case, combination or envelope of the selected combinations). */
export function computeView(an: Analysis, view: ResultView, grid?: SampleGrid): ViewResult | null {
  if (!an.ok || !an.prep) return null;
  const prep = an.prep;
  const g = grid ?? gridFor(prep);
  if (view.type === 'case') {
    const cr = an.cases.get(view.id);
    if (!cr) return null;
    return singleView(an, view, [[1, cr.full]], g);
  }
  if (view.type === 'combo') {
    const c = an.model.combinations.find((k) => k.id === view.id);
    if (!c) return null;
    const d = decomposeCombination(an, c.factors);
    if (!d.parts.length) return singleView(an, view, d.base, g);
    return envelopeView(view, g, decompositionEnvelope(prep, d, g));
  }
  const combos = an.model.combinations.filter((c) => c.inEnvelope);
  if (!combos.length) return null;
  const env = combinationsEnvelope(an, combos, g);
  return env ? envelopeView(view, g, env) : null;
}

/** Values at x for the cursor. Returns [left, right] (identical when no jump). */
export function valuesAt(an: Analysis, vr: ViewResult, x: number): { left: PointValues; right: PointValues; leftMin?: PointValues; rightMin?: PointValues } {
  const prep = an.prep as Prepared;
  const els = prep.mesh.elements;
  const tol = 1e-9 * Math.max(1, prep.mesh.L);
  // element to the left / right of x
  let eR = els.findIndex((e) => x >= e.x1 - tol && x < e.x2 - tol);
  if (eR < 0) eR = els.length - 1;
  let eL = eR;
  if (Math.abs(x - els[eR].x1) <= tol && eR > 0) eL = eR - 1;
  if (vr.kind === 'single' && vr.lr) {
    const xl = Math.min(Math.max(x - els[eL].x1, 0), els[eL].L);
    const xr = Math.min(Math.max(x - els[eR].x1, 0), els[eR].L);
    return { left: evalElement(prep, vr.lr, eL, xl), right: evalElement(prep, vr.lr, eR, xr) };
  }
  const pick = (arr: FieldArrays, ei: number): PointValues => {
    const g = vr.grid;
    let lo = -1;
    for (let k = 0; k < g.x.length; k++) {
      if (g.elem[k] !== ei) continue;
      if (g.x[k] <= x + tol) lo = k;
    }
    if (lo < 0) lo = 0;
    const hi = lo + 1 < g.x.length && g.elem[lo + 1] === ei ? lo + 1 : lo;
    const t = hi === lo || g.x[hi] === g.x[lo] ? 0 : (x - g.x[lo]) / (g.x[hi] - g.x[lo]);
    const v = {} as PointValues;
    for (const f of FIELDS) v[f] = arr[f][lo] + t * (arr[f][hi] - arr[f][lo]);
    return v;
  };
  return {
    left: pick(vr.max, eL),
    right: pick(vr.max, eR),
    leftMin: pick(vr.min, eL),
    rightMin: pick(vr.min, eR),
  };
}
