import { describe, expect, it } from 'vitest';
import { testModel, solve, rel, EI, E } from './testutil';
import { udl, pointLoad, momentLoad } from './defaults';
import { analyze } from './analysis';
import { equilibrium } from './postprocess';
import { equivalentNodalLoads, localStiffness, fixedEndState } from './element';
import type { Load } from './types';

const kN = 1e3;
const TOL = 1e-6;

function close(actual: number, expected: number, tol = TOL) {
  expect(rel(actual, expected), `actual ${actual} vs expected ${expected}`).toBeLessThan(tol);
}

describe('element', () => {
  it('equivalent nodal loads equal the closed-form formulas (Euler–Bernoulli)', () => {
    const L = 2.7;
    const q1 = 3.1e3;
    const q2 = 7.9e3;
    const r = equivalentNodalLoads({ L, EA: 1e9, EI: 2e7, GAs: Infinity }, { q1, q2, p1: 0, p2: 0 });
    close(r[1], (L * (7 * q1 + 3 * q2)) / 20);
    close(r[2], (L * L * (3 * q1 + 2 * q2)) / 60);
    close(r[4], (L * (3 * q1 + 7 * q2)) / 20);
    close(r[5], (-L * L * (2 * q1 + 3 * q2)) / 60);
  });

  it('equivalent axial loads', () => {
    const L = 3;
    const r = equivalentNodalLoads({ L, EA: 1e9, EI: 2e7, GAs: Infinity }, { q1: 0, q2: 0, p1: 2, p2: 5 });
    close(r[0], (L * (2 * 2 + 5)) / 6);
    close(r[3], (L * (2 + 2 * 5)) / 6);
  });

  it('stiffness matrix is symmetric and singular with 3 rigid body modes', () => {
    const k = localStiffness({ L: 2, EA: 3e8, EI: 5e6, GAs: 1e8 });
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) close(k[i][j] + 1, k[j][i] + 1, 1e-12);
    // rigid translation in z and rigid rotation produce zero forces
    const L = 2;
    const rot = [0, 0, 1, 0, L, 1];
    for (const row of k) expect(Math.abs(row.reduce((s, v, j) => s + v * rot[j], 0))).toBeLessThan(1e-6);
  });

  it('Timoshenko fixed-end forces for uniform load equal Euler–Bernoulli', () => {
    const p = { L: 2, EA: 1e9, EI: 4e6, GAs: 2e7 };
    const f = fixedEndState(p, { q1: 1000, q2: 1000, p1: 0, p2: 0 });
    close(f.V0, 1000);
    close(f.M0, (-1000 * 4) / 12);
  });
});

describe('benchmarks §9.1 (relative error < 1e-6)', () => {
  it('cantilever, uniform load: w = qL⁴/8EI, M = −qL²/2', () => {
    const L = 4;
    const q = 10 * kN;
    const s = solve(testModel(L, [['fixed', 0]], [udl('G', 0, L, 10)]));
    close(s.at(L).right.w, (q * L ** 4) / (8 * EI));
    close(s.at(0).right.M, (-q * L * L) / 2);
    close(s.R(0)[1], q * L);
    close(s.R(0)[2], (-q * L * L) / 2);
  });

  it('cantilever, point load at the tip: w = PL³/3EI', () => {
    const L = 3;
    const P = 25 * kN;
    const s = solve(testModel(L, [['fixed', 0]], [pointLoad('G', L, 25)]));
    close(s.at(L).left.w, (P * L ** 3) / (3 * EI));
    close(s.at(0).right.M, -P * L);
    close(s.vr.extremes.w.max.value, (P * L ** 3) / (3 * EI));
  });

  it('simply supported, point load at midspan: M = PL/4, w = PL³/48EI', () => {
    const L = 6;
    const P = 40 * kN;
    const s = solve(testModel(L, [['pinned', 0], ['roller', L]], [pointLoad('G', L / 2, 40)]));
    close(s.vr.extremes.M.max.value, (P * L) / 4);
    close(s.at(L / 2).left.w, (P * L ** 3) / (48 * EI));
    close(s.vr.extremes.w.max.value, (P * L ** 3) / (48 * EI));
    // jump of V at the load
    close(s.at(L / 2).left.V, P / 2);
    close(s.at(L / 2).right.V, -P / 2);
  });

  it('simply supported, uniform load: M = qL²/8, w = 5qL⁴/384EI', () => {
    const L = 7;
    const q = 12 * kN;
    const s = solve(testModel(L, [['pinned', 0], ['roller', L]], [udl('G', 0, L, 12)]));
    close(s.vr.extremes.M.max.value, (q * L * L) / 8);
    close(s.vr.extremes.M.max.x, L / 2);
    close(s.at(L / 2).left.w, (5 * q * L ** 4) / (384 * EI));
    close(s.vr.extremes.w.max.value, (5 * q * L ** 4) / (384 * EI));
    close(s.R(0)[1], (q * L) / 2);
    close(s.R(1)[1], (q * L) / 2);
  });

  it('fixed–fixed, uniform load: M_support = −qL²/12, M_span = qL²/24, w = qL⁴/384EI', () => {
    const L = 5;
    const q = 8 * kN;
    const s = solve(testModel(L, [['fixed', 0], ['fixed', L]], [udl('G', 0, L, 8)]));
    close(s.at(0).right.M, (-q * L * L) / 12);
    close(s.at(L).left.M, (-q * L * L) / 12);
    close(s.at(L / 2).left.M, (q * L * L) / 24);
    close(s.at(L / 2).left.w, (q * L ** 4) / (384 * EI));
  });

  it('fixed–pinned, uniform load: R = 3qL/8, M_fixed = −qL²/8', () => {
    const L = 6;
    const q = 10 * kN;
    const s = solve(testModel(L, [['fixed', 0], ['roller', L]], [udl('G', 0, L, 10)]));
    close(s.R(1)[1], (3 * q * L) / 8);
    close(s.at(0).right.M, (-q * L * L) / 8);
    close(s.R(0)[2], (-q * L * L) / 8);
  });

  it('two equal spans, uniform load: R = 3qL/8, 10qL/8, 3qL/8; M_B = −qL²/8', () => {
    const L = 5;
    const q = 10 * kN;
    const s = solve(testModel(2 * L, [['pinned', 0], ['roller', L], ['roller', 2 * L]], [udl('G', 0, 2 * L, 10)]));
    close(s.R(0)[1], (3 * q * L) / 8);
    close(s.R(1)[1], (10 * q * L) / 8);
    close(s.R(2)[1], (3 * q * L) / 8);
    close(s.at(L).left.M, (-q * L * L) / 8);
  });

  it('three equal spans, uniform load: M_B = M_C = −0.1qL², M_end span = 0.08qL²', () => {
    const L = 4;
    const q = 10 * kN;
    const s = solve(
      testModel(3 * L, [['pinned', 0], ['roller', L], ['roller', 2 * L], ['roller', 3 * L]], [udl('G', 0, 3 * L, 10)]),
    );
    close(s.at(L).left.M, -0.1 * q * L * L);
    close(s.at(2 * L).left.M, -0.1 * q * L * L);
    close(s.at(0.4 * L).left.M, 0.08 * q * L * L);
    close(s.vr.extremes.M.max.value, 0.08 * q * L * L);
  });

  it('Gerber beam: M = 0 at the hinge, reactions from statics', () => {
    const s = solve(
      testModel(14, [['pinned', 0], ['roller', 6], ['roller', 14]], [udl('G', 0, 14, 10)], { hinges: [7.5] }),
    );
    expect(Math.abs(s.at(7.5).left.M)).toBeLessThan(1e-6);
    expect(Math.abs(s.at(7.5).right.M)).toBeLessThan(1e-6);
    close(s.R(2)[1], 32.5 * kN);
    close(s.R(1)[1], 87.5 * kN);
    close(s.R(0)[1], 20 * kN);
  });

  it('inclined force: N = P·cos α between load and fixed (pinned) support', () => {
    const P = 10;
    const alpha = 30;
    const s = solve(testModel(6, [['pinned', 0], ['roller', 6]], [pointLoad('G', 2, P, alpha)]));
    const Px = P * kN * Math.cos((alpha * Math.PI) / 180);
    close(s.at(1).left.N, Px);
    expect(Math.abs(s.at(4).left.N)).toBeLessThan(1e-6);
    close(s.R(0)[0], -Px);
    // vertical component
    const Pz = P * kN * Math.sin((alpha * Math.PI) / 180);
    close(s.R(0)[1] + s.R(1)[1], Pz);
  });

  it('partial trapezoidal load: statics and unit-load deflection', () => {
    const L = 8;
    const s = solve(testModel(L, [['pinned', 0], ['roller', L]], [udl('G', 2, 6, 5, 15)]));
    close(s.R(1)[1], (40 * kN * (2 + 4 * (5 + 30) / 60)) / L);
    close(s.R(0)[1], 40 * kN - (40 * kN * (2 + 4 * (5 + 30) / 60)) / L);
    close(s.at(4).left.M, 60 * kN);
    // analytic M(x)
    const RA = s.R(0)[1];
    const q = (x: number) => (x < 2 || x > 6 ? 0 : (5 + 2.5 * (x - 2)) * kN);
    const M = (x: number) => {
      // RA·x − ∫₀ˣ q(s)(x−s) ds  (Gauss quadrature, exact for the polynomial pieces)
      let m = RA * x;
      const a = Math.max(2, 0);
      const b = Math.min(6, x);
      if (b > a) m -= gauss((t) => q(t) * (x - t), a, b);
      return m;
    };
    const mbar = (x: number) => (x <= 4 ? x / 2 : (L - x) / 2);
    const w4 = (gauss((x) => M(x) * mbar(x), 0, 2) + gauss((x) => M(x) * mbar(x), 2, 4) + gauss((x) => M(x) * mbar(x), 4, 6) + gauss((x) => M(x) * mbar(x), 6, 8)) / EI;
    close(s.at(4).left.w, w4);
  });

  it('concentrated moment in the span: jump of M equals M₀', () => {
    const L = 6;
    const M0 = 12;
    const s = solve(testModel(L, [['pinned', 0], ['roller', L]], [momentLoad('G', 2, M0)]));
    const v = s.at(2);
    close(v.right.M - v.left.M, M0 * kN);
    // R_A(↑) from ΣM_B: clockwise moment → R_A = −M0/L (downwards)
    close(s.R(0)[1], (-M0 * kN) / L);
    close(v.left.M, (-M0 * kN * 2) / L);
  });

  it('elastic support: k → ∞ gives the rigid support, k → 0 the missing support', () => {
    const L = 4;
    const q = 10 * kN;
    const stiff = solve(
      testModel(2 * L, [['pinned', 0], ['spring', L, { kw: 1e15 }], ['roller', 2 * L]], [udl('G', 0, 2 * L, 10)]),
    );
    close(stiff.at(L).left.M, (-q * L * L) / 8);
    close(stiff.R(1)[1], (10 * q * L) / 8);
    const soft = solve(
      testModel(2 * L, [['pinned', 0], ['spring', L, { kw: 1e-3 }], ['roller', 2 * L]], [udl('G', 0, 2 * L, 10)]),
    );
    close(soft.at(L).left.M, (q * (2 * L) ** 2) / 8);
    close(soft.at(L).left.w, (5 * q * (2 * L) ** 4) / (384 * EI));
    // spring reaction = k·w
    close(soft.R(1)[1], 1e-3 * soft.at(L).left.w);
  });

  it('support settlement in a two-span beam: M_B = 3EIΔ/L²', () => {
    const L = 5;
    const d = 0.01;
    const s = solve(testModel(2 * L, [['pinned', 0], ['roller', L, { dw: d }], ['roller', 2 * L]], []));
    close(s.at(L).left.M, (3 * EI * d) / (L * L));
    close(s.R(1)[1], (-6 * EI * d) / L ** 3);
    close(s.R(0)[1], (3 * EI * d) / L ** 3);
    close(s.at(L).left.w, d);
  });

  it('Timoshenko cantilever: w = PL³/3EI + PL/(G·A_s)', () => {
    const L = 2;
    const P = 50 * kN;
    const m = testModel(L, [['fixed', 0]], [pointLoad('G', L, 50)], {
      edit: (mm) => {
        mm.settings.theory = 'timoshenko';
      },
    });
    const s = solve(m);
    const G = m.segments[0].material.G;
    const As = 2.568e-3;
    close(s.at(L).left.w, (P * L ** 3) / (3 * EI) + (P * L) / (G * As));
  });

  it('Timoshenko simply supported with trapezoidal load satisfies the exact solution at midspan', () => {
    const L = 3;
    const m = testModel(L, [['pinned', 0], ['roller', L]], [udl('G', 0, L, 10, 30)], {
      edit: (mm) => {
        mm.settings.theory = 'timoshenko';
      },
    });
    const s = solve(m);
    const G = m.segments[0].material.G;
    const GAs = G * 2.568e-3;
    // unit load method: w = ∫ M m̄/EI + ∫ V v̄/GAs
    const q = (x: number) => (10 + (20 * x) / L) * kN;
    const W = gauss(q, 0, L);
    const RB = gauss((x) => q(x) * x, 0, L) / L;
    const RA = W - RB;
    const M = (x: number) => RA * x - gauss((t) => q(t) * (x - t), 0, x);
    const V = (x: number) => RA - gauss(q, 0, x);
    const a = L / 2;
    const mbar = (x: number) => (x <= a ? x / 2 : (L - x) / 2);
    const vbar = (x: number) => (x <= a ? 0.5 : -0.5);
    const w = (gauss((x) => M(x) * mbar(x), 0, a) + gauss((x) => M(x) * mbar(x), a, L)) / EI +
      (gauss((x) => V(x) * vbar(x), 0, a) + gauss((x) => V(x) * vbar(x), a, L)) / GAs;
    close(s.at(a).left.w, w);
  });
});

describe('hinges and degenerate cases', () => {
  it('moment at a hinge is attached to the chosen side', () => {
    // cantilever with hinge at 2 and roller at 4; moment at the hinge on the right side
    const loads: Load[] = [momentLoad('G', 2, 10, 'right')];
    const s = solve(testModel(4, [['fixed', 0], ['roller', 4]], loads, { hinges: [2] }));
    // right part 2..4: moment 10 kNm at its left end, roller at 4 → M(2+) = 10 kNm
    close(s.at(2).right.M, 10 * kN);
    expect(Math.abs(s.at(2).left.M)).toBeLessThan(1e-6);
    const s2 = solve(testModel(4, [['fixed', 0], ['roller', 4]], [momentLoad('G', 2, 10, 'left')], { hinges: [2] }));
    // moment on the left part (cantilever end): M(2−) = −10 kNm, right part unloaded
    close(s2.at(2).left.M, -10 * kN);
    expect(Math.abs(s2.at(2).right.M)).toBeLessThan(1e-6);
  });

  it('hinge at a clamp acts as a pinned support (with warning)', () => {
    const m = testModel(10, [['pinned', 0], ['fixed', 5], ['roller', 10]], [udl('G', 0, 10, 10)], { hinges: [5] });
    const an = analyze(m);
    expect(an.ok).toBe(true);
    expect(an.warnings.some((w) => w.key === 'warn.hingeAtClamp')).toBe(true);
    const s = solve(m);
    expect(Math.abs(s.at(5).left.M)).toBeLessThan(1e-6);
    close(s.R(1)[1], 50 * kN);
  });

  it('hinge at the beam end is ignored with a warning', () => {
    const an = analyze(testModel(4, [['fixed', 0]], [pointLoad('G', 4, 1)], { hinges: [4] }));
    expect(an.ok).toBe(true);
    expect(an.warnings.some((w) => w.key === 'warn.hingeAtEnd')).toBe(true);
  });
});

describe('mechanisms give clear errors, never NaN', () => {
  it('two rollers: no restraint in x', () => {
    const an = analyze(testModel(5, [['roller', 0], ['roller', 5]], [udl('G', 0, 5, 1)]));
    expect(an.ok).toBe(false);
    expect(an.errors.map((e) => e.key)).toContain('mech.noX');
  });

  it('two hinges in a row without support in between', () => {
    const an = analyze(testModel(9, [['pinned', 0], ['roller', 9]], [udl('G', 0, 9, 1)], { hinges: [3, 6] }));
    expect(an.ok).toBe(false);
    expect(an.errors.map((e) => e.key)).toContain('mech.twoHinges');
  });

  it('no supports', () => {
    const an = analyze(testModel(5, [], [udl('G', 0, 5, 1)]));
    expect(an.ok).toBe(false);
    expect(an.errors.map((e) => e.key)).toEqual(['mech.noSupports']);
  });

  it('single pinned support: beam can rotate', () => {
    const an = analyze(testModel(5, [['pinned', 2]], []));
    expect(an.ok).toBe(false);
    expect(an.errors.map((e) => e.key)).toContain('mech.rotation');
  });

  it('Gerber suspended span between two hinges is stable', () => {
    const an = analyze(
      testModel(16, [['fixed', 0], ['fixed', 16]], [udl('G', 0, 16, 10)], { hinges: [5, 11] }),
    );
    expect(an.ok).toBe(true);
  });

  it('validation errors point to fields', () => {
    const m = testModel(5, [['pinned', 0], ['roller', 6]], [udl('G', 3, 2, 1)]);
    const an = analyze(m);
    expect(an.ok).toBe(false);
    const paths = an.errors.map((e) => e.path);
    expect(paths).toContain(`supports.${m.supports[1].id}.x`);
    expect(paths).toContain(`loads.${m.loads[0].id}.x2`);
  });
});

describe('equilibrium', () => {
  it('residuals vanish for a mixed model', () => {
    const m = testModel(
      12,
      [['pinned', 0], ['spring', 4, { kw: 5e6, kt: 1e6 }], ['roller', 9]],
      [udl('G', 1, 7, 3, 9), udl('G', 2, 11, 2, -1, 'x'), pointLoad('G', 12, 7, 120), momentLoad('G', 5, 4)],
      { hinges: [6] },
    );
    const s = solve(m);
    const prep = s.an.prep!;
    const eq = equilibrium(prep, s.vr.lr!);
    for (const r of eq.residual) expect(Math.abs(r)).toBeLessThan(1e-9 * eq.loadScale * 12);
  });

  it('E is used from material', () => {
    expect(E).toBe(210e9);
  });
});

/** 5-point Gauss–Legendre on [a, b] split into 8 sub-intervals */
function gauss(f: (x: number) => number, a: number, b: number): number {
  const xs = [0, -0.5384693101056831, 0.5384693101056831, -0.906179845938664, 0.906179845938664];
  const ws = [0.5688888888888889, 0.47862867049936647, 0.47862867049936647, 0.23692688505618908, 0.23692688505618908];
  const n = 8;
  const h = (b - a) / n;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const c = a + h * (i + 0.5);
    for (let k = 0; k < 5; k++) s += ws[k] * f(c + (h / 2) * xs[k]) * (h / 2);
  }
  return s;
}
