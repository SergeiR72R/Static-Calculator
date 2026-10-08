// Helpers shared by the core unit tests (not used by the application).
import type { BeamModel, Load, Support, SupportType } from './types';
import { baseModel, makeHinge, makeSupport } from './defaults';
import { analyze, type Analysis } from './analysis';
import { computeView, valuesAt, type ViewResult } from './results';
import { materialPreset } from '../sections/materials';

export const E = 210e9;
export const I = 8.356e-5;
export const A = 5.381e-3;
export const EI = E * I;

export function testModel(
  L: number,
  supports: ([SupportType, number] | [SupportType, number, Partial<Support>])[],
  loads: Load[],
  opts: { hinges?: number[]; edit?: (m: BeamModel) => void } = {},
): BeamModel {
  const m = baseModel(L);
  m.segments[0].material = { ...materialPreset('S235'), E };
  m.segments[0].section = { kind: 'manual', A, I, Wtop: 5.571e-4, Wbot: 5.571e-4, As: 2.568e-3 };
  m.supports = supports.map(([t, x, extra]) => makeSupport(t, x, extra ?? {}));
  m.hinges = (opts.hinges ?? []).map((x) => makeHinge(x));
  m.loads = loads;
  opts.edit?.(m);
  return m;
}

export interface Solved {
  an: Analysis;
  vr: ViewResult;
  at: (x: number) => ReturnType<typeof valuesAt>;
  /** reaction of support i: [R_x, R_z(↑), M] */
  R: (i: number) => [number, number, number];
}

export function solve(m: BeamModel, caseId = 'G'): Solved {
  const an = analyze(m);
  if (!an.ok) throw new Error('analysis failed: ' + an.errors.map((e) => e.key).join(','));
  const vr = computeView(an, { type: 'case', id: caseId });
  if (!vr) throw new Error('no view');
  return {
    an,
    vr,
    at: (x) => valuesAt(an, vr, x),
    R: (i) => [vr.reactions.max[3 * i], vr.reactions.max[3 * i + 1], vr.reactions.max[3 * i + 2]],
  };
}

/** relative closeness */
export function rel(a: number, b: number): number {
  const s = Math.max(Math.abs(a), Math.abs(b));
  return s === 0 ? 0 : Math.abs(a - b) / s;
}
