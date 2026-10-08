import { describe, expect, it } from 'vitest';
import { sectionProps } from './properties';
import { CATALOG, CATALOG_FAMILIES, findCatalogEntry } from './catalog';
import { designStrength, materialPreset } from './materials';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
const mm = 1e-3;

describe('parametric sections', () => {
  it('rectangle', () => {
    const p = sectionProps({ kind: 'rect', b: 0.1, h: 0.2 });
    expect(rel(p.A, 0.02)).toBeLessThan(1e-12);
    expect(rel(p.I, (0.1 * 0.2 ** 3) / 12)).toBeLessThan(1e-12);
    expect(rel(p.Wtop, (0.1 * 0.2 ** 2) / 6)).toBeLessThan(1e-12);
    expect(rel(p.zTop, 0.1)).toBeLessThan(1e-12);
  });

  it('circle and tube', () => {
    const c = sectionProps({ kind: 'circle', D: 0.1 });
    expect(rel(c.A, (Math.PI * 0.01) / 4)).toBeLessThan(1e-12);
    expect(rel(c.I, (Math.PI * 0.1 ** 4) / 64)).toBeLessThan(1e-12);
    expect(rel(c.Wtop, (Math.PI * 0.1 ** 3) / 32)).toBeLessThan(1e-12);
    const t = sectionProps({ kind: 'tube', D: 0.1683, t: 0.0063 });
    expect(rel(t.A, 32.06e-4)).toBeLessThan(1e-3);
    expect(rel(t.I, 1053e-8)).toBeLessThan(1e-3);
  });

  it('box (sharp corners)', () => {
    const p = sectionProps({ kind: 'box', b: 0.1, h: 0.2, t: 0.01 });
    expect(rel(p.A, 0.1 * 0.2 - 0.08 * 0.18)).toBeLessThan(1e-12);
    expect(rel(p.I, (0.1 * 0.2 ** 3 - 0.08 * 0.18 ** 3) / 12)).toBeLessThan(1e-12);
  });

  it('welded I-section and channel', () => {
    const p = sectionProps({ kind: 'weldedI', h: 0.4, b: 0.2, tw: 0.01, tf: 0.02 });
    expect(rel(p.A, 2 * 0.2 * 0.02 + 0.36 * 0.01)).toBeLessThan(1e-12);
    const I = (0.2 * 0.4 ** 3 - 0.19 * 0.36 ** 3) / 12;
    expect(rel(p.I, I)).toBeLessThan(1e-12);
    expect(rel(p.Wtop, I / 0.2)).toBeLessThan(1e-12);
    // first moment at the neutral axis
    expect(rel(p.S, 0.2 * 0.02 * 0.19 + (0.01 * 0.18 ** 2) / 2)).toBeLessThan(1e-12);
    const u = sectionProps({ kind: 'channel', h: 0.2, b: 0.08, tw: 0.006, tf: 0.011 });
    expect(rel(u.I, (0.08 * 0.2 ** 3 - 0.074 * 0.178 ** 3) / 12)).toBeLessThan(1e-12);
  });

  it('tee section: centroid, W_top ≠ W_bot', () => {
    // flange 200×20, web 10×180 (h = 200)
    const p = sectionProps({ kind: 'tee', h: 0.2, b: 0.2, tw: 0.01, tf: 0.02 });
    const Af = 0.2 * 0.02;
    const Aw = 0.01 * 0.18;
    const zc = (Af * 0.01 + Aw * (0.02 + 0.09)) / (Af + Aw);
    expect(rel(p.A, Af + Aw)).toBeLessThan(1e-12);
    expect(rel(p.zc, zc)).toBeLessThan(1e-12);
    const I = (0.2 * 0.02 ** 3) / 12 + Af * (zc - 0.01) ** 2 + (0.01 * 0.18 ** 3) / 12 + Aw * (0.11 - zc) ** 2;
    expect(rel(p.I, I)).toBeLessThan(1e-12);
    expect(rel(p.Wtop, I / zc)).toBeLessThan(1e-12);
    expect(rel(p.Wbot, I / (0.2 - zc))).toBeLessThan(1e-12);
    expect(p.Wtop).toBeGreaterThan(p.Wbot);
  });
});

describe('catalog (sample check against steel tables)', () => {
  // values from the usual section tables (DIN 1025 / EN 10365)
  const samples: [string, number, number, number, number][] = [
    // name, A cm², Iy cm⁴, Wy cm³, G kg/m
    ['IPE 100', 10.3, 171, 34.2, 8.1],
    ['IPE 200', 28.5, 1943, 194, 22.4],
    ['IPE 300', 53.8, 8356, 557, 42.2],
    ['IPE 400', 84.5, 23130, 1156, 66.3],
    ['HEA 200', 53.8, 3692, 389, 42.3],
    ['HEA 300', 112.5, 18260, 1260, 88.3],
    ['HEB 200', 78.1, 5696, 570, 61.3],
    ['HEB 300', 149.1, 25170, 1678, 117],
    ['HEM 200', 131.3, 10640, 967, 103],
    ['UPE 200', 29.0, 1910, 191, 22.8],
    ['UPN 200', 32.2, 1910, 191, 25.3],
    ['SHS 100x100x5', 18.4, 271, 54.2, 14.4],
    ['CHS 168.3x6.3', 32.1, 1053, 125, 25.2],
  ];
  for (const [name, A, Iy, Wy, G] of samples) {
    it(name, () => {
      const fam = name.split(' ')[0] as (typeof CATALOG_FAMILIES)[number];
      const e = findCatalogEntry(fam, name)!;
      expect(e).toBeDefined();
      expect(rel(e.A, A)).toBeLessThan(0.01);
      expect(rel(e.Iy, Iy)).toBeLessThan(0.01);
      expect(rel(e.Wy, Wy)).toBeLessThan(0.01);
      expect(rel(e.G, G)).toBeLessThan(0.015);
    });
  }

  it('catalog entries are consistent: W ≈ I/(h/2)', () => {
    for (const fam of CATALOG_FAMILIES) {
      expect(CATALOG[fam].length).toBeGreaterThan(5);
      for (const e of CATALOG[fam]) {
        expect(rel(e.Wy, e.Iy / (e.h / 20))).toBeLessThan(0.01);
        const p = sectionProps({ kind: 'catalog', family: fam, name: e.name });
        expect(p.A).toBeGreaterThan(0);
        expect(p.h).toBeCloseTo(e.h * mm, 12);
      }
    }
  });
});

describe('materials', () => {
  it('design strengths', () => {
    expect(designStrength(materialPreset('S235'))).toBeCloseTo(235e6, 3);
    expect(designStrength(materialPreset('S355'))).toBeCloseTo(355e6, 3);
    expect(designStrength(materialPreset('AW6060'))).toBeCloseTo(140e6 / 1.1, 3);
    expect(designStrength(materialPreset('C24'))).toBeCloseTo((0.8 * 24e6) / 1.3, 3);
  });
});
