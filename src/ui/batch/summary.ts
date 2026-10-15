import { analyze } from '../../core/analysis';
import { computeView } from '../../core/results';
import { runChecks } from '../../core/checks';
import type { BeamModel } from '../../core/types';

/** Result of a beam of the list: analysis failed, a check fails, or the largest utilisation */
export interface BeamSummary {
  state: 'error' | 'fail' | 'ok';
  /** largest utilisation of all checks (0 if none) */
  eta: number;
  /** first error (i18n key) if the analysis failed */
  error?: string;
}

const cache = new WeakMap<BeamModel, BeamSummary>();

/** Summary of a model (cached per model object; models are immutable in the store) */
export function beamSummary(m: BeamModel): BeamSummary {
  const hit = cache.get(m);
  if (hit) return hit;
  let res: BeamSummary;
  const an = analyze(m);
  const vr = an.ok ? computeView(an, { type: 'envelope' }) : null;
  const c = an.ok && vr ? runChecks(an, vr) : null;
  if (!an.ok || !c) res = { state: 'error', eta: 0, error: an.errors[0]?.key };
  else {
    const etas = [c.strength?.eta ?? 0, c.shear?.eta ?? 0, ...c.peri.map((p) => p.eta), ...c.deflection.map((d) => d.eta)];
    const eta = Math.max(0, ...etas.filter(Number.isFinite));
    const fail = eta > 1 || c.uplift.some((u) => !u.ok) || etas.some((e) => !Number.isFinite(e));
    res = { state: fail ? 'fail' : 'ok', eta };
  }
  cache.set(m, res);
  return res;
}
