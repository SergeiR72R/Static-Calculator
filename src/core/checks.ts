import type { Analysis, Prepared } from './analysis';
import type { SpanRegion } from './mesh';
import { combinationsEnvelope, type ViewResult } from './results';
import { designShearStrength, designStrength } from '../sections/materials';
import type { FieldArrays, SampleGrid } from './postprocess';
import type { PeriProductId } from './types';
import { X_TOL } from './types';
import { findPeriProduct, periInteraction, type PeriInteraction } from '../sections/peri';

export interface StressCheck {
  value: number;
  x: number;
  /** design resistance */
  fd: number;
  eta: number;
  ok: boolean;
  elem: number;
  /** N, M (or V) at the governing point */
  N: number;
  M: number;
  V: number;
}

export interface DeflectionCheck {
  span: SpanRegion;
  w: number;
  x: number;
  denominator: number;
  limit: number;
  eta: number;
  ok: boolean;
}

/** One verification of a PERI component */
export interface PeriCheckItem {
  /** 'M' | 'V' | 'N' | 'int' (interaction) | 'Rend' | 'Rint' (support force) */
  key: 'M' | 'V' | 'N' | 'int' | 'Rend' | 'Rint';
  /** acting value (absolute) and resistance / permissible value; for 'int' Ed = η, Rd = 1 */
  Ed: number;
  Rd: number;
  eta: number;
  x: number;
  /** region label (SRU: A / B) */
  region?: string;
  /** forces at the governing point (interaction) */
  N?: number;
  V?: number;
  M?: number;
  parts?: PeriInteraction;
}

export interface PeriCheck {
  product: PeriProductId;
  method: 'design' | 'perm';
  basis: 'ULS' | 'SLS' | 'view';
  items: PeriCheckItem[];
  eta: number;
  ok: boolean;
}

export interface Checks {
  strength: StressCheck | null;
  shear: StressCheck | null;
  deflection: DeflectionCheck[];
  /** checks of PERI components (per product used) */
  peri: PeriCheck[];
  /** which results were used */
  strengthBasis: 'ULS' | 'view';
  deflectionBasis: 'SLS' | 'view';
}

interface Basis {
  grid: SampleGrid;
  max: FieldArrays;
  min: FieldArrays;
  reactions?: { max: Float64Array; min: Float64Array };
}

/** PERI product of an element (null for ordinary sections) */
function periOf(prep: Prepared, ei: number): PeriProductId | null {
  const def = prep.model.segments[prep.mesh.elements[ei].segIndex]?.section;
  return def?.kind === 'peri' ? def.product : null;
}

function absMax(b: Basis, f: 'N' | 'M' | 'V' | 'w', k: number) {
  const a = b.max[f][k];
  const c = b.min[f][k];
  return Math.abs(a) >= Math.abs(c) ? a : c;
}

export function strengthCheck(prep: Prepared, b: Basis): StressCheck | null {
  let best: StressCheck | null = null;
  for (let k = 0; k < b.grid.x.length; k++) {
    const ei = b.grid.elem[k];
    if (periOf(prep, ei)) continue;
    const fd = designStrength(prep.mesh.elements[ei].material);
    const s = b.max.sigma[k];
    const eta = s / fd;
    if (!best || eta > best.eta)
      best = { value: s, x: b.grid.x[k], fd, eta, ok: eta <= 1, elem: ei, N: absMax(b, 'N', k), M: absMax(b, 'M', k), V: absMax(b, 'V', k) };
  }
  return best;
}

export function shearCheck(prep: Prepared, b: Basis): StressCheck | null {
  let best: StressCheck | null = null;
  for (let k = 0; k < b.grid.x.length; k++) {
    const t = b.max.tau[k];
    if (Number.isNaN(t)) continue;
    const ei = b.grid.elem[k];
    if (periOf(prep, ei)) continue;
    const fvd = designShearStrength(prep.mesh.elements[ei].material);
    const eta = t / fvd;
    if (!best || eta > best.eta)
      best = { value: t, x: b.grid.x[k], fd: fvd, eta, ok: eta <= 1, elem: ei, N: absMax(b, 'N', k), M: absMax(b, 'M', k), V: absMax(b, 'V', k) };
  }
  return best;
}

export function deflectionChecks(prep: Prepared, b: Basis): DeflectionCheck[] {
  const st = prep.model.settings;
  return prep.mesh.spans.map((span) => {
    let w = 0;
    let x = span.x1;
    for (let k = 0; k < b.grid.x.length; k++) {
      const xk = b.grid.x[k];
      if (xk < span.x1 - 1e-9 || xk > span.x2 + 1e-9) continue;
      const v = absMax(b, 'w', k);
      if (Math.abs(v) > Math.abs(w)) {
        w = v;
        x = xk;
      }
    }
    const Ls = span.x2 - span.x1;
    const denominator = span.kind === 'cantilever' ? st.deflLimitCantilever : st.deflLimitSpan;
    const limit = Ls / denominator;
    const eta = Math.abs(w) / limit;
    return { span, w, x, denominator, limit, eta, ok: eta <= 1 };
  });
}

/**
 * PERI components: steel members (SRU, RCS) with the design resistances and the PERI M–N–V
 * interaction on the ULS envelope; timber girders (GT 24, VT 20K) with the permissible values
 * (perm F = R_d/1.5) on the actual loads, i.e. the characteristic (SLS) combinations.
 */
export function periChecks(prep: Prepared, uls: Basis, ulsBasis: 'ULS' | 'view', sls: Basis, slsBasis: 'SLS' | 'view'): PeriCheck[] {
  const used = new Set<PeriProductId>();
  for (let ei = 0; ei < prep.mesh.elements.length; ei++) {
    const p = periOf(prep, ei);
    if (p) used.add(p);
  }
  const out: PeriCheck[] = [];
  for (const id of used) {
    const pr = findPeriProduct(id);
    if (!pr) continue;
    const c = pr.check;
    const b = c.method === 'design' ? uls : sls;
    const items: PeriCheckItem[] = [];
    const maxAbs = (f: 'N' | 'V' | 'M', Rd: number, key: 'N' | 'V' | 'M', region?: string) => {
      let best: PeriCheckItem | null = null;
      for (let k = 0; k < b.grid.x.length; k++) {
        if (periOf(prep, b.grid.elem[k]) !== id) continue;
        const v = Math.abs(absMax(b, f, k));
        if (!best || v > best.Ed) best = { key, Ed: v, Rd, eta: v / Rd, x: b.grid.x[k], region };
      }
      if (best) items.push(best);
    };
    if (c.method === 'perm') {
      maxAbs('M', c.M, 'M');
      maxAbs('V', c.V, 'V');
      // support forces of supports on the girder (end of the beam = girder end)
      const segs = prep.model.segments.filter((s) => s.section.kind === 'peri' && s.section.product === id);
      const L = prep.model.L;
      prep.model.supports.forEach((sp, i) => {
        if (!b.reactions || !segs.some((s) => sp.x >= s.x1 - X_TOL && sp.x <= s.x2 + X_TOL)) return;
        const R = Math.max(Math.abs(b.reactions.max[3 * i + 1]), Math.abs(b.reactions.min[3 * i + 1]));
        const end = sp.x <= X_TOL || sp.x >= L - X_TOL;
        const Rd = end ? c.Rend : c.Rint;
        items.push({ key: end ? 'Rend' : 'Rint', Ed: R, Rd, eta: R / Rd, x: sp.x });
      });
    } else {
      const multi = c.regions.length > 1;
      // single resistances: the weakest region
      const weakest = (f: 'MRd' | 'NRd' | 'VRd') => c.regions.reduce((a, r) => (r[f] < a[f] ? r : a));
      maxAbs('M', weakest('MRd').MRd, 'M', multi ? weakest('MRd').label : undefined);
      maxAbs('N', weakest('NRd').NRd, 'N', multi ? weakest('NRd').label : undefined);
      maxAbs('V', weakest('VRd').VRd, 'V', multi ? weakest('VRd').label : undefined);
      let best: PeriCheckItem | null = null;
      for (let k = 0; k < b.grid.x.length; k++) {
        if (periOf(prep, b.grid.elem[k]) !== id) continue;
        const N = absMax(b, 'N', k);
        const V = absMax(b, 'V', k);
        const M = absMax(b, 'M', k);
        for (const r of c.regions) {
          const parts = periInteraction(r, N, V, M);
          if (!best || parts.eta > best.eta)
            best = { key: 'int', Ed: parts.eta, Rd: 1, eta: parts.eta, x: b.grid.x[k], region: multi ? r.label : undefined, N, V, M, parts };
        }
      }
      if (best) items.push(best);
    }
    const eta = Math.max(0, ...items.map((i) => i.eta));
    out.push({ product: id, method: c.method, basis: c.method === 'design' ? ulsBasis : slsBasis, items, eta, ok: eta <= 1 });
  }
  return out;
}

/**
 * Express checks: strength (σ = |N|/A + |M|/W ≤ f_d) from the ULS combinations, deflection
 * (w ≤ L/250 span, L/125 cantilever) from the SLS combinations. If no such combinations
 * exist, the currently displayed result is used.
 */
export function runChecks(an: Analysis, view: ViewResult): Checks | null {
  if (!an.ok || !an.prep) return null;
  const prep = an.prep;
  const uls = an.model.combinations.filter((c) => c.type === 'ULS');
  const sls = an.model.combinations.filter((c) => c.type === 'SLS');
  const ulsEnv = uls.length ? combinationsEnvelope(an, uls, view.grid) : null;
  const slsEnv = sls.length ? combinationsEnvelope(an, sls, view.grid) : null;
  const sb: Basis = ulsEnv ? { grid: view.grid, max: ulsEnv.max, min: ulsEnv.min, reactions: { max: ulsEnv.rmax, min: ulsEnv.rmin } } : view;
  const db: Basis = slsEnv ? { grid: view.grid, max: slsEnv.max, min: slsEnv.min, reactions: { max: slsEnv.rmax, min: slsEnv.rmin } } : view;
  return {
    strength: strengthCheck(prep, sb),
    shear: an.model.settings.shearCheck ? shearCheck(prep, sb) : null,
    deflection: deflectionChecks(prep, db),
    peri: periChecks(prep, sb, ulsEnv ? 'ULS' : 'view', db, slsEnv ? 'SLS' : 'view'),
    strengthBasis: ulsEnv ? 'ULS' : 'view',
    deflectionBasis: slsEnv ? 'SLS' : 'view',
  };
}
