import { describe, expect, it } from 'vitest';
import { PERI_PRODUCTS, findPeriProduct, periInteraction, periMaterial, rcsInteraction, rcsResistances } from './peri';
import { lineMass, sectionOutline, sectionProps } from './properties';
import { testModel } from '../core/testutil';
import { udl } from '../core/defaults';
import { analyze } from '../core/analysis';
import { computeView } from '../core/results';
import { runChecks } from '../core/checks';
import { validateModel } from '../core/validate';
import type { PeriProductId } from '../core/types';

const kN = 1e3;
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('PERI components', () => {
  it('girder I from the chords matches the published EI (E = 11 000 N/mm²)', () => {
    const chordsI = (h: number, b: number, tf: number) => (2 * (b * tf * ((h - tf) / 2) ** 2) + (2 * b * tf ** 3) / 12) * 1e-12;
    const gt = sectionProps({ kind: 'peri', product: 'GT24' });
    const vt = sectionProps({ kind: 'peri', product: 'VT20K' });
    expect(rel(gt.I, chordsI(240, 80, 60))).toBeLessThan(1e-3);
    expect(rel(vt.I, chordsI(200, 80, 40))).toBeLessThan(1e-3);
    expect(rel(periMaterial('GT24').E * gt.I, 887e3)).toBeLessThan(2e-3);
    expect(rel(periMaterial('VT20K').E * vt.I, 460e3)).toBeLessThan(2e-3);
  });

  it('section values and self weight from the tables', () => {
    const rcs = sectionProps({ kind: 'peri', product: 'RCS' });
    expect(rcs.A).toBeCloseTo(56.38e-4, 10);
    expect(rcs.I).toBeCloseTo(3576e-8, 12);
    expect(lineMass(rcs, 7850)).toBe(52.6);
    const sru = sectionProps({ kind: 'peri', product: 'SRU120' });
    expect(sru.I).toBeCloseTo(696.97e-8, 12);
    const o = sectionOutline({ kind: 'peri', product: 'SRU120' });
    expect(o.type === 'poly' && o.parts?.length).toBe(1);
  });

  it('catalogue lengths', () => {
    expect(findPeriProduct('GT24')!.lengths).toHaveLength(18);
    expect(findPeriProduct('GT24')!.lengths.at(-1)).toBe(6);
    expect(findPeriProduct('RCS')!.lengths).toEqual([1.48, 2.48, 2.98, 3.48, 3.98, 4.98, 7.48, 9.98]);
    expect(findPeriProduct('SRU120')!.lengths[0]).toBe(0.722);
    expect(findPeriProduct('SRU120')!.lengths).toHaveLength(16);
    for (const p of PERI_PRODUCTS) expect(p.lengths.length).toBeGreaterThan(0);
  });

  it('SRU interaction (PERI proof): n–v, v–m, n–v–m with ρ = (2·max(0.5; v) − 1)²', () => {
    const r = (findPeriProduct('SRU120')!.check as { regions: Parameters<typeof periInteraction>[0][] }).regions[1];
    expect(r.label).toBe('A 5-5');
    // v ≤ 0.5 → ρ = 0: n–v–m = m (1 − 0.5 a_w)/(1 − n)
    const a = periInteraction(r, 100 * kN, 50 * kN, 15 * kN);
    const m = 15 / 25.1877;
    const n = 100 / 593.67;
    expect(a.rho).toBe(0);
    expect(a.nvm).toBeCloseTo((m * (1 - 0.5 * 0.44)) / (1 - n), 10);
    // v > 0.5
    const b = periInteraction(r, 100 * kN, 110 * kN, 15 * kN);
    const v = 110 / 149.66;
    const rho = (2 * v - 1) ** 2;
    expect(b.rho).toBeCloseTo(rho, 12);
    expect(b.vm).toBeCloseTo(m / (1 - 0.32 * rho), 10);
    expect(b.nv).toBeCloseTo(n / (1 - 0.44 * rho), 10);
    const red = 1 - (0.5 * 0.44 * (1 - rho)) / (1 - rho * 0.44);
    expect(b.nvm).toBeCloseTo((m * red) / ((1 - 0.32 * rho) * (1 - n / (1 - 0.44 * rho))), 10);
  });

  it('RCS: net resistances reproduce the PERI values (EN 1993-1-1, γM1 = 1.1)', () => {
    const c = findPeriProduct('RCS')!.check;
    if (c.method !== 'design' || !c.ec3) throw new Error('rcs');
    const R = rcsResistances(c.ec3);
    expect(R.Npl / kN).toBeCloseTo(1819.5, 0); // DI: N_Rd = 1820 kN
    expect(R.Vpl / kN).toBeCloseTo(432.9, 0); // DI: V_z,Rd = 432.91 kN
    expect(R.Mpl / kN).toBeCloseTo(132.7, 1); // DI: M_y,Rd = 132.7 kNm
    expect(R.aw).toBeCloseTo(0.412, 3);
    expect(R.ww).toBeCloseTo(0.241, 3);
    // pure bending: n–v–m = m; small N (< N*) does not reduce M
    const q0 = rcsInteraction(c.ec3, 0, 0, 100 * kN);
    expect(q0.nvm).toBeCloseTo(100 / 132.7, 3);
    const q1 = rcsInteraction(c.ec3, 50 * kN, 0, 100 * kN);
    expect(q1.nvm).toBeCloseTo(q0.nvm, 10);
    // high shear reduces the web: M_V,y,Rd < M_pl
    const q2 = rcsInteraction(c.ec3, 0, 350 * kN, 100 * kN);
    expect(q2.rho).toBeCloseTo((2 * (350 / (R.Vpl / kN)) - 1) ** 2, 10);
    expect(q2.vm).toBeGreaterThan(q0.m);
    // large N: reduction with a = min((A_red − A_f)/A_red; 0.5)
    const q3 = rcsInteraction(c.ec3, 900 * kN, 0, 50 * kN);
    expect(q3.nvm).toBeGreaterThan(q3.m);
  });

  const girder = (product: PeriProductId, L: number, supports: [ 'pinned' | 'roller', number][], g: number, q: number) =>
    testModel(L, supports, [udl('G', 0, L, g), udl('Q', 0, L, q)], {
      edit: (m) => {
        m.segments[0].section = { kind: 'peri', product };
        m.segments[0].material = periMaterial(product);
      },
    });

  it('GT 24 (MULTIFLEX): V, M, end support forces, moment at the support, edge distance', () => {
    const L = 3;
    // supports 0.2 m from the girder ends (≥ 16 cm), q_d = 1.5·2 + 1.5·3 = 7.5 kN/m
    const m = girder('GT24', L, [['pinned', 0.2], ['pinned', 2.8]], 2, 3);
    expect(validateModel(m).filter((i) => i.severity === 'error')).toEqual([]);
    const an = analyze(m);
    const c = runChecks(an, computeView(an, { type: 'envelope' })!)!;
    expect(c.strength).toBeNull();
    const p = c.peri[0];
    expect(p.method).toBe('girder');
    expect(p.basis).toBe('ULS');
    const item = (k: string) => p.items.find((i) => i.key === k)!;
    // M at midspan: R·1.3 − q·1.5²/2 = 11.25·1.3 − 8.4375 = 6.1875 kNm
    expect(item('M').Ed).toBeCloseTo(6.1875 * kN, 3);
    expect(item('M').Rd).toBe(10.5 * kN);
    expect(item('V').Ed).toBeCloseTo(9.75 * kN, 3);
    expect(item('V').Rd).toBe(19.5 * kN);
    const ends = p.items.filter((i) => i.key === 'Rend');
    expect(ends).toHaveLength(2);
    expect(ends[0].Ed).toBeCloseTo(11.25 * kN, 3);
    expect(ends[0].Rd).toBe(19.5 * kN); // between nodes (safe side)
    expect(ends[0].case).toBe('between');
    expect(item('Mm').Ed).toBeCloseTo(0.15 * kN, 3);
    expect(item('Mm').Rd).toBe(6 * kN);
        expect(item('edge').eta).toBeCloseTo(0.16 / 0.2, 10);
    expect(p.ok).toBe(true);
    // supports under a node: cases 1 / 3
    const m2 = girder('GT24', L, [['pinned', 0.2], ['pinned', 2.8]], 2, 3);
    m2.segments[0].section = { kind: 'peri', product: 'GT24', atNode: true };
    const an2 = analyze(m2);
    const p2 = runChecks(an2, computeView(an2, { type: 'envelope' })!)!.peri[0];
    expect(p2.items.find((i) => i.key === 'Rend')!.Rd).toBe(24 * kN);
    expect(p2.items.find((i) => i.key === 'Mm')!.Rd).toBe(10.5 * kN);
  });

  it('GT 24 continuous girder: intermediate support 30 kN; support at the girder end violates the edge distance', () => {
    const m = girder('GT24', 4, [['pinned', 0], ['pinned', 2], ['pinned', 4]], 2, 0);
    const an = analyze(m);
    const p = runChecks(an, computeView(an, { type: 'envelope' })!)!.peri[0];
    const int = p.items.find((i) => i.key === 'Rint')!;
    expect(int.Rd).toBe(30 * kN);
    // q_d = 3 kN/m, two spans 2 m: middle support 1.25·q·L = 7.5 kN
    expect(int.Ed).toBeCloseTo(7.5 * kN, 3);
    const edges = p.items.filter((i) => i.key === 'edge');
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.eta > 1)).toBe(true);
    expect(p.ok).toBe(false);
  });

  it('VT 20: support force 24 kN closer than 45 cm to the girder end, 33 kN otherwise', () => {
    const m = girder('VT20K', 5.2, [['pinned', 0.2], ['pinned', 2.6], ['pinned', 5.0]], 2, 0);
    const an = analyze(m);
    const p = runChecks(an, computeView(an, { type: 'envelope' })!)!.peri[0];
    const ends = p.items.filter((i) => i.key === 'Rend');
    expect(ends.map((e) => [e.Rd / kN, e.case])).toEqual([
      [24, 'near'],
      [24, 'near'],
    ]);
    const int = p.items.find((i) => i.key === 'Rint')!;
    expect([int.Rd / kN, int.case]).toEqual([33, 'far']);
    expect(p.items.find((i) => i.key === 'M')!.Rd).toBe(7.5 * kN);
    expect(p.items.find((i) => i.key === 'V')!.Rd).toBe(16.5 * kN);
    expect(p.items.some((i) => i.key === 'Mm')).toBe(false);
    expect(p.items.filter((i) => i.key === 'edge').every((e) => e.eta <= 1)).toBe(true);
  });

  it('SRU U120: ULS envelope, weakest section A 5-5 for M, interaction over all three sections', () => {
    const L = 2.472;
    const m = girder('SRU120', L, [['pinned', 0], ['pinned', L]], 10, 10);
    const an = analyze(m);
    const c = runChecks(an, computeView(an, { type: 'envelope' })!)!;
    const p = c.peri[0];
    expect(p.basis).toBe('ULS');
    const M = p.items.find((i) => i.key === 'M')!;
    // self weight off; 1.5·10 + 1.5·10 = 30 kN/m
    expect(M.Ed).toBeCloseTo((30 * kN * L * L) / 8, 2);
    expect(M.Rd).toBeCloseTo(25.1877 * kN, 6);
    expect(M.region).toBe('A 5-5');
    const int = p.items.find((i) => i.key === 'int')!;
    expect(int.eta).toBeGreaterThanOrEqual(M.eta - 1e-12);
    expect(int.parts!.terms.map((t) => t[0])).toEqual(['n–v', 'v–m', 'n–v–m']);
  });
});
