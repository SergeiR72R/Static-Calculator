import type { Analysis, Prepared } from './analysis';
import type { SpanRegion } from './mesh';
import { combinationsEnvelope, type ViewResult } from './results';
import { designShearStrength, designStrength } from '../sections/materials';
import type { FieldArrays, SampleGrid } from './postprocess';

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

export interface Checks {
  strength: StressCheck | null;
  shear: StressCheck | null;
  deflection: DeflectionCheck[];
  /** which results were used */
  strengthBasis: 'ULS' | 'view';
  deflectionBasis: 'SLS' | 'view';
}

interface Basis {
  grid: SampleGrid;
  max: FieldArrays;
  min: FieldArrays;
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
  const sb: Basis = ulsEnv ? { grid: view.grid, max: ulsEnv.max, min: ulsEnv.min } : view;
  const db: Basis = slsEnv ? { grid: view.grid, max: slsEnv.max, min: slsEnv.min } : view;
  return {
    strength: strengthCheck(prep, sb),
    shear: an.model.settings.shearCheck ? shearCheck(prep, sb) : null,
    deflection: deflectionChecks(prep, db),
    strengthBasis: ulsEnv ? 'ULS' : 'view',
    deflectionBasis: slsEnv ? 'SLS' : 'view',
  };
}
