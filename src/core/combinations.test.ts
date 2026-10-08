import { describe, expect, it } from 'vitest';
import { testModel, rel } from './testutil';
import { udl, pointLoad } from './defaults';
import { analyze } from './analysis';
import { computeView, combinationResult, valuesAt } from './results';
import { handCalculation, handMoment } from './handcalc';
import { sampleGrid, sampleResult } from './postprocess';
import { runChecks } from './checks';

const kN = 1e3;
const close = (a: number, b: number, tol = 1e-9) => expect(rel(a, b), `${a} vs ${b}`).toBeLessThan(tol);

describe('load cases and combinations', () => {
  const L = 6;
  const m = testModel(L, [['pinned', 0], ['roller', L]], [udl('G', 0, L, 5), udl('Q', 0, L, 3)]);
  const an = analyze(m);

  it('single load case view', () => {
    const v = computeView(an, { type: 'case', id: 'Q' })!;
    close(v.extremes.M.max.value, (3 * kN * L * L) / 8);
  });

  it('ULS combination 1.35·G + 1.5·Q (hand example)', () => {
    const v = computeView(an, { type: 'combo', id: 'ULS1' })!;
    expect(v.kind).toBe('single');
    // (1.35·5 + 1.5·3)·6²/8 = 50.625 kNm
    close(v.extremes.M.max.value, 50.625 * kN);
    close(v.reactions.max[1], ((1.35 * 5 + 1.5 * 3) * kN * L) / 2);
  });

  it('envelope over the ULS combinations', () => {
    const v = computeView(an, { type: 'envelope' })!;
    expect(v.kind).toBe('envelope');
    close(v.extremes.M.max.value, 50.625 * kN);
    // minimum at midspan is the smaller combination 1.0·5 + 1.5·3 = 9.5 kN/m → 42.75 kNm
    const mid = v.grid.x.findIndex((x) => Math.abs(x - L / 2) < 1e-12);
    close(v.min.M[mid], 42.75 * kN);
    close(v.max.M[mid], 50.625 * kN);
    close(v.reactions.min[1], (9.5 * kN * L) / 2);
  });

  it('deflection check uses the SLS combination 1.0·G + 1.0·Q', () => {
    const v = computeView(an, { type: 'combo', id: 'ULS1' })!;
    const c = runChecks(an, v)!;
    expect(c.deflectionBasis).toBe('SLS');
    const EI = m.segments[0].material.E * 8.356e-5;
    const w = (5 * 8 * kN * L ** 4) / (384 * EI);
    close(Math.abs(c.deflection[0].w), w, 1e-6);
    close(c.deflection[0].limit, L / 250);
    expect(c.strengthBasis).toBe('ULS');
    close(c.strength!.value, (50.625 * kN) / 5.571e-4, 1e-3);
  });
});

describe('pattern loading (chessboard) on continuous beams', () => {
  const L = 5;
  const loads = [udl('G', 0, 2 * L, 5), udl('Q', 0, 2 * L, 4)];
  const sup: [ 'pinned' | 'roller', number][] = [['pinned', 0], ['roller', L], ['roller', 2 * L]];
  const m = testModel(2 * L, sup, loads, { edit: (mm) => (mm.settings.patternLoading = true) });
  const an = analyze(m);

  it('envelope equals the max/min over all span load variants', () => {
    const v = computeView(an, { type: 'combo', id: 'ULS1' })!;
    expect(v.kind).toBe('envelope');
    expect(v.variants).toBe(4);
    const prep = an.prep!;
    const grid = sampleGrid(prep);
    // explicit variants: G·1.35 + Q·1.5 on subsets of the spans
    const variants = [
      [],
      [[0, L]],
      [[L, 2 * L]],
      [[0, L], [L, 2 * L]],
    ].map((spans) => {
      const mm = testModel(2 * L, sup, [udl('G', 0, 2 * L, 5 * 1.35), ...spans.map(([a, b]) => udl('G', a, b, 4 * 1.5))]);
      const a = analyze(mm);
      return sampleResult(a.prep!, a.cases.get('G')!.full, grid);
    });
    for (let k = 0; k < grid.x.length; k++) {
      const mx = Math.max(...variants.map((r) => r.M[k]));
      const mn = Math.min(...variants.map((r) => r.M[k]));
      expect(Math.abs(v.max.M[k] - mx)).toBeLessThan(1e-6);
      expect(Math.abs(v.min.M[k] - mn)).toBeLessThan(1e-6);
    }
  });

  it('maximum span moment > uniformly loaded case, support moment from full load', () => {
    const v = computeView(an, { type: 'combo', id: 'ULS1' })!;
    const full = combinationResult(an, { G: 1.35, Q: 1.5 });
    const q = (1.35 * 5 + 1.5 * 4) * kN;
    const fullSampled = sampleResult(an.prep!, full, v.grid);
    const fullMax = Math.max(...fullSampled.M);
    expect(v.extremes.M.max.value).toBeGreaterThan(fullMax * 1.05);
    // support moment: all spans loaded → −qL²/8
    close(v.extremes.M.min.value, (-q * L * L) / 8, 1e-9);
  });

  it('pattern loading ignored when disabled', () => {
    const m2 = testModel(2 * L, sup, loads);
    const v = computeView(analyze(m2), { type: 'combo', id: 'ULS1' })!;
    expect(v.kind).toBe('single');
  });

  it('pattern loading with a point load splits by span', () => {
    const m3 = testModel(2 * L, sup, [pointLoad('Q', 2.5, 10), pointLoad('Q', 7.5, 10)], {
      edit: (mm) => (mm.settings.patternLoading = true),
    });
    const a3 = analyze(m3);
    const v = computeView(a3, { type: 'combo', id: 'SLS1' })!;
    // max deflection in span 1 with load only in span 1: larger than with both loads
    const both = computeView(analyze(testModel(2 * L, sup, [pointLoad('G', 2.5, 10), pointLoad('G', 7.5, 10)])), {
      type: 'case',
      id: 'G',
    })!;
    expect(v.extremes.w.max.value).toBeGreaterThan(both.extremes.w.max.value);
  });
});

describe('hand calculation (statically determinate)', () => {
  it('Gerber beam: reactions and moments by statics equal FEM', () => {
    const m = testModel(14, [['pinned', 0], ['roller', 6], ['roller', 14]], [udl('G', 0, 14, 10), pointLoad('G', 10, 20, 60)], {
      hinges: [7.5],
    });
    const an = analyze(m);
    const hc = handCalculation(an, { G: 1 });
    expect(hc.applicable).toBe(true);
    const v = computeView(an, { type: 'case', id: 'G' })!;
    const R = v.reactions.max;
    hc.unknowns.forEach((u, i) => {
      const si = m.supports.findIndex((s) => s.id === u.supportId);
      const fem = u.comp === 'u' ? R[3 * si] : u.comp === 'w' ? -R[3 * si + 1] : R[3 * si + 2];
      expect(Math.abs(hc.solution[i] - fem)).toBeLessThan(1e-6);
    });
    for (const x of [3, 6, 7.5, 10, 12]) {
      const r = valuesAt(an, v, x);
      expect(Math.abs(handMoment(hc, x, 'left') - r.left.M)).toBeLessThan(1e-6);
      expect(Math.abs(handMoment(hc, x, 'right') - r.right.M)).toBeLessThan(1e-6);
    }
  });

  it('moment at a hinge on the left side', () => {
    const m = testModel(4, [['fixed', 0], ['roller', 4]], [{ id: 'm', kind: 'moment', caseId: 'G', x: 2, M: 10e3, hingeSide: 'left' }], { hinges: [2] });
    const an = analyze(m);
    const hc = handCalculation(an, { G: 1 });
    expect(hc.applicable).toBe(true);
    expect(handMoment(hc, 2, 'left')).toBeCloseTo(-10e3, 6);
    expect(handMoment(hc, 2, 'right')).toBeCloseTo(0, 6);
  });

  it('indeterminate systems are detected', () => {
    const m = testModel(10, [['pinned', 0], ['roller', 5], ['roller', 10]], [udl('G', 0, 10, 1)]);
    const hc = handCalculation(analyze(m), { G: 1 });
    expect(hc.applicable).toBe(false);
    expect(hc.degree).toBe(1);
  });
});
