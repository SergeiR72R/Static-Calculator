import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { testModel } from './testutil';
import { analyze } from './analysis';
import { equilibrium } from './postprocess';
import { computeView } from './results';
import type { Load, Support, SupportType } from './types';
import { uid } from './defaults';

const kN = 1e3;
/** positions on the 0.05 m snapping grid, magnitudes rounded to 0.1 kN (realistic input) */
const snap = (x: number) => Math.round(x / 0.05) * 0.05;
const r1 = (v: number) => Math.round(v * 10) / 10;

const loadArb = (L: number): fc.Arbitrary<Load> =>
  fc.oneof(
    fc
      .record({
        x: fc.double({ min: 0, max: L, noNaN: true }),
        P: fc.double({ min: -50, max: 50, noNaN: true }),
        angle: fc.double({ min: 0, max: 360, noNaN: true }),
      })
      .map((r): Load => ({ id: uid('l'), kind: 'point', caseId: 'G', x: snap(r.x), P: r1(r.P) * kN, angle: r.angle })),
    fc
      .record({ x: fc.double({ min: 0, max: L, noNaN: true }), M: fc.double({ min: -50, max: 50, noNaN: true }) })
      .map((r): Load => ({ id: uid('l'), kind: 'moment', caseId: 'G', x: snap(r.x), M: r1(r.M) * kN, hingeSide: 'left' })),
    fc
      .record({
        a: fc.double({ min: 0, max: L, noNaN: true }),
        b: fc.double({ min: 0, max: L, noNaN: true }),
        q1: fc.double({ min: -30, max: 30, noNaN: true }),
        q2: fc.double({ min: -30, max: 30, noNaN: true }),
        dir: fc.constantFrom<'z' | 'x'>('z', 'z', 'x'),
      })
      .filter((r) => Math.abs(snap(r.a) - snap(r.b)) > 0.01)
      .map(
        (r): Load => ({
          id: uid('l'),
          kind: 'dist',
          caseId: 'G',
          dir: r.dir,
          x1: snap(Math.min(r.a, r.b)),
          x2: snap(Math.max(r.a, r.b)),
          q1: r1(r.q1) * kN,
          q2: r1(r.q2) * kN,
        }),
      ),
  );

const modelArb = fc
  .record({
    L: fc.integer({ min: 40, max: 400 }).map((n) => n * 0.05),
    kind: fc.constantFrom('pinnedRollers', 'fixedPlus', 'springs'),
    pos: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 4 }),
    hinge: fc.boolean(),
  })
  .chain((r) =>
    fc.array(loadArb(r.L), { minLength: 1, maxLength: 6 }).map((loads) => {
      const xs = [...new Set(r.pos.map((p) => snap(p * r.L)))].sort((a, b) => a - b);
      const sup: ([SupportType, number] | [SupportType, number, Partial<Support>])[] = [];
      const hinges: number[] = [];
      if (r.kind === 'pinnedRollers') {
        sup.push(['pinned', 0]);
        const others = xs.filter((x) => x > 0.05);
        if (!others.length) others.push(r.L);
        for (const x of others) sup.push(['roller', x]);
        // one hinge between the first two supports keeps the system stable only if ≥ 3 supports
        if (r.hinge && others.length >= 2) hinges.push(snap((others[0] + others[1]) / 2));
      } else if (r.kind === 'fixedPlus') {
        sup.push(['fixed', 0]);
        for (const x of xs.filter((x) => x > 0.05)) sup.push(['roller', x]);
        if (r.hinge && xs.some((x) => x > 0.15)) hinges.push(snap(xs.filter((x) => x > 0.15)[0] / 2));
      } else {
        // elastic clamp (ku = 10⁶ kN/m, kw = 10⁵ kN/m, kθ = 10⁵ kN·m/rad) plus elastic intermediate supports
        sup.push(['spring', 0, { ku: 1e9, kw: 1e8, kt: 1e8 }]);
        for (const x of xs.filter((x) => x > 0.05)) sup.push(['spring', x, { kw: 2e6 }]);
      }
      return testModel(r.L, sup, loads, { hinges });
    }),
  );

describe('property based: global equilibrium of random models', () => {
  it('ΣF_x = ΣF_z = ΣM = 0 with residual < 1e-9·ΣP', () => {
    fc.assert(
      fc.property(modelArb, (m) => {
        const an = analyze(m);
        fc.pre(an.ok);
        const vr = computeView(an, { type: 'case', id: 'G' })!;
        const lr = vr.lr!;
        // ΣP: sum of absolute applied load resultants
        let sumP = 0;
        for (const l of m.loads) {
          if (l.kind === 'point') sumP += Math.abs(l.P);
          else if (l.kind === 'moment') sumP += Math.abs(l.M) / m.L;
          else sumP += ((Math.abs(l.q1) + Math.abs(l.q2)) / 2) * (l.x2 - l.x1);
        }
        fc.pre(sumP > 1 * kN);
        const eq = equilibrium(an.prep!, lr);
        expect(Math.abs(eq.residual[0])).toBeLessThan(1e-9 * sumP);
        expect(Math.abs(eq.residual[1])).toBeLessThan(1e-9 * sumP);
        expect(Math.abs(eq.residual[2])).toBeLessThan(1e-9 * sumP * m.L);
        // no NaN anywhere
        for (const v of vr.max.M) expect(Number.isFinite(v)).toBe(true);
        for (const v of vr.max.w) expect(Number.isFinite(v)).toBe(true);
      }),
      { numRuns: 300, seed: 4711 },
    );
  }, 120_000);

  it('internal forces are continuous across element boundaries without nodal loads', () => {
    fc.assert(
      fc.property(modelArb, (m) => {
        const an = analyze(m);
        fc.pre(an.ok);
        const vr = computeView(an, { type: 'case', id: 'G' })!;
        const prep = an.prep!;
        // at nodes without point loads/moments/supports/hinges, N, V, M are continuous
        const g = vr.grid;
        for (let k = 0; k + 1 < g.x.length; k++) {
          if (g.elem[k] === g.elem[k + 1]) continue;
          const node = prep.mesh.nodes[prep.mesh.elements[g.elem[k + 1]].n1];
          if (node.reasons.some((r) => r === 'pointLoad' || r === 'moment' || r === 'support' || r === 'hinge')) continue;
          const scale = Math.max(1, ...Array.from(vr.max.M).map(Math.abs));
          expect(Math.abs(vr.max.M[k] - vr.max.M[k + 1])).toBeLessThan(1e-8 * scale);
          expect(Math.abs(vr.max.w[k] - vr.max.w[k + 1])).toBeLessThan(1e-9 + 1e-8 * Math.max(...Array.from(vr.max.w).map(Math.abs)));
        }
      }),
      { numRuns: 100, seed: 815 },
    );
  }, 120_000);
});
