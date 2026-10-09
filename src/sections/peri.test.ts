import { describe, expect, it } from 'vitest';
import { PERI_PRODUCTS, findPeriProduct, periInteraction, periMaterial } from './peri';
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
    expect(sru.I).toBeCloseTo(696.98e-8, 12);
    const o = sectionOutline({ kind: 'peri', product: 'SRU120' });
    expect(o.type === 'poly' && o.parts?.length).toBe(1);
  });

  it('catalogue lengths', () => {
    expect(findPeriProduct('GT24')!.lengths).toHaveLength(18);
    expect(findPeriProduct('GT24')!.lengths.at(-1)).toBe(6);
    expect(findPeriProduct('RCS')!.lengths).toEqual([1.48, 2.48, 3.48, 4.98, 7.48, 9.98]);
    expect(findPeriProduct('SRU120')!.lengths).toHaveLength(16);
    for (const p of PERI_PRODUCTS) expect(p.lengths.length).toBeGreaterThan(0);
  });

  it('PERI interaction (RCS p. 9)', () => {
    const r = (findPeriProduct('RCS')!.check as { regions: Parameters<typeof periInteraction>[0][] }).regions[0];
    // v ≤ 0.5: only m_y, n, v and n–m_y
    const a = periInteraction(r, 500 * kN, 100 * kN, 60 * kN);
    const my = 60 / 132.7;
    const n = 500 / 1820;
    expect(a.rho).toBe(0);
    expect(a.eta).toBeCloseTo((my * (1 - 0.5 * 0.412)) / (1 - n), 10);
    // v > 0.5
    const b = periInteraction(r, 200 * kN, 300 * kN, 60 * kN);
    const v = 300 / 432.91;
    const rho = (2 * v - 1) ** 2;
    const n2 = 200 / 1820;
    const red = 1 - (0.5 * 0.412 * (1 - rho)) / (1 - rho * 0.412);
    expect(b.nvm).toBeCloseTo((my * red) / ((1 - rho * 0.241) * (1 - n2 / (1 - rho * 0.412))), 10);
    expect(b.vm).toBeCloseTo(my / (1 - rho * 0.241), 10);
  });

  const girder = (product: PeriProductId, L: number, supports: [ 'pinned' | 'roller', number][], g: number, q: number) =>
    testModel(L, supports, [udl('G', 0, L, g), udl('Q', 0, L, q)], {
      edit: (m) => {
        m.segments[0].section = { kind: 'peri', product };
        m.segments[0].material = periMaterial(product);
      },
    });

  it('GT 24 single span: perm M, perm Q, perm R on the service loads', () => {
    const L = 3;
    const m = girder('GT24', L, [['pinned', 0], ['roller', L]], 2, 3);
    expect(validateModel(m).filter((i) => i.severity === 'error')).toEqual([]);
    const an = analyze(m);
    const c = runChecks(an, computeView(an, { type: 'envelope' })!)!;
    expect(c.strength).toBeNull();
    expect(c.peri).toHaveLength(1);
    const p = c.peri[0];
    expect(p.basis).toBe('SLS');
    const item = (k: string) => p.items.find((i) => i.key === k)!;
    expect(item('M').Ed).toBeCloseTo((5 * kN * L * L) / 8, 3);
    expect(item('M').eta).toBeCloseTo(5.625 / 7, 6);
    expect(item('V').Ed).toBeCloseTo(7.5 * kN, 3);
    expect(p.items.filter((i) => i.key === 'Rend')).toHaveLength(2);
    expect(item('Rend').eta).toBeCloseTo(7.5 / 28, 6);
    expect(p.ok).toBe(true);
  });

  it('VT 20K two spans: intermediate support uses perm B', () => {
    const L = 2.4;
    const m = girder('VT20K', 2 * L, [['pinned', 0], ['roller', L], ['roller', 2 * L]], 2, 0);
    const an = analyze(m);
    const c = runChecks(an, computeView(an, { type: 'envelope' })!)!;
    const rint = c.peri[0].items.find((i) => i.key === 'Rint')!;
    expect(rint.Ed).toBeCloseTo(1.25 * 2 * kN * L, 3);
    expect(rint.Rd).toBe(22 * kN);
  });

  it('SRU U120 uses the ULS envelope and both regions', () => {
    const L = 2.47;
    const m = girder('SRU120', L, [['pinned', 0], ['roller', L]], 10, 10);
    const an = analyze(m);
    const c = runChecks(an, computeView(an, { type: 'envelope' })!)!;
    const p = c.peri[0];
    expect(p.basis).toBe('ULS');
    const M = p.items.find((i) => i.key === 'M')!;
    // self weight off; 1.35·10 + 1.5·10 = 28.5 kN/m
    expect(M.Ed).toBeCloseTo((28.5 * kN * L * L) / 8, 2);
    expect(M.Rd).toBe(28.34 * kN);
    expect(p.items.find((i) => i.key === 'int')!.eta).toBeGreaterThanOrEqual(M.eta - 1e-12);
  });
});
