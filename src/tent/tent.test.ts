import { describe, expect, it } from 'vitest';
import { analyzeTent, DEFAULT_CPE, purlinPoints, qpProfileDE, snowGroundDE, snowShape, standingFactor, tentStability, tentWind, tributaryWidths, type TentInput } from './tent';
import type { Girder } from '../scaffold/structure';

const kN = 1e3;
// enclosure 00065.E.01 of the PERI report (New ALC Plant): 5.75 m × 5.75 m, eaves 3.75 / 4.75 m, roof 35 m²
const inp = (o: Partial<TentInput> = {}): TentInput => ({
  geo: { L: 5.75, B: 5.75, hLow: 3.75, hHigh: 4.75, roofArea: 35 },
  qp: 0.7 * 475,
  snow: 680,
  gRoof: 320,
  Gk: 72 * kN,
  cpe: DEFAULT_CPE,
  mu: 0.5,
  gammaMu: 1.3,
  purlin: 2,
  restraint: 2.5,
  ...o,
});

describe('loads of an enclosure (DIN EN 1991-1-3/-4 NA, EN 16508)', () => {
  it('wind: mixed profile up to 7 m 1.5 · q_b, standing factor 0.7 for 24 months without measures', () => {
    expect(qpProfileDE(1, 'inland', 5)).toBeCloseTo(480, 6);
    expect(standingFactor('24m', 'none')).toBe(0.7);
    expect(standingFactor('3d', 'protect')).toBe(0.1);
  });
  it('snow: zone 1 at 197 m: s_k = 0.65 kN/m² (minimum); monopitch μ1 = 0.8 up to 30°', () => {
    expect(snowGroundDE('1', 197)).toBeCloseTo(650, 6);
    expect(snowGroundDE('2', 600)).toBeCloseTo((0.25 + 1.91 * ((600 + 140) / 760) ** 2) * kN, 6);
    expect(snowGroundDE('1a', 197)).toBeCloseTo(1.25 * 650, 6);
    expect(snowShape(9)).toBe(0.8);
    expect(snowShape(45)).toBeCloseTo(0.4, 9);
  });
  it('walls and roof as in the report: 7.26 + 3.56 = 10.82 kN parallel, uplift 10.40 kN', () => {
    const w = tentWind(inp({ qp: 330 }));
    expect(w.wallA / kN).toBeCloseTo(7.21, 2);
    expect(-w.wallB / kN).toBeCloseTo(3.56, 2);
    expect(w.across / kN).toBeCloseTo(10.77, 2);
    expect(w.uplift / kN).toBeCloseTo(10.4, 1);
  });
  it('local sliding 0.68 and overturning 0.22 as in the report', () => {
    const s = tentStability(inp({ qp: 330 }));
    expect(s.dir).toBe('across');
    expect(s.Nd / kN).toBeCloseTo(61.6, 1);
    expect(s.FfRd / kN).toBeCloseTo(23.7, 1);
    expect(s.etaSliding).toBeCloseTo(0.68, 2);
    expect(s.Mstb / kN).toBeCloseTo(177.1, 0);
    expect(s.etaOverturning).toBeCloseTo(0.22, 2);
  });
});

describe('roof girders', () => {
  it('geometry from the drawing: eaves from the inclined girders (depth of ULS 50: 0.5 m)', async () => {
    const { tentGeometry } = await import('./tent');
    const g: Girder = { key: 'T1', product: 'ULS50', L: 6.25, origin: [0, 0], u: [1, 0], zBottom: 3.0, zTop: 4.5, parts: [], supports: [0.4, 5.9], supportsAssumed: false, loads: [], warnings: [] };
    const cols = [0, 6].flatMap((x) => [0, 5].map((y) => ({ x, y, z0: 0, z1: x === 0 ? 4.5 : 3.5 })));
    const geo = tentGeometry({ columns: cols, girders: [g] } as never)!;
    expect(geo.hHigh).toBeCloseTo(4.5, 9);
    expect(geo.hLow).toBeCloseTo(3.5, 9);
    expect(geo.B).toBeCloseTo(6, 9);
    expect(geo.L).toBeCloseTo(5, 9);
    expect(geo.highAtStart).toBe(true);
  });

  it('tributary widths: half the distances to the neighbours', () => {
    const g = (y: number): Girder => ({ key: `T${y}`, product: 'ULS50', L: 6.25, origin: [0, y], u: [1, 0], zBottom: 3, zTop: 4.5, parts: [], supports: [0.375, 5.375], supportsAssumed: false, loads: [], warnings: [] });
    expect(tributaryWidths([g(7.53), g(13.28), g(10.03), g(12.53)]).map((v) => +v.toFixed(3))).toEqual([2.5, 0.75, 2.5, 1.625]);
    // purlins at about 2 m: 4 points, the end ones carry half
    const p = purlinPoints(6.25, 2);
    expect(p.map((q) => q.x)).toEqual([0, 6.25 / 3, (2 * 6.25) / 3, 6.25]);
    expect(p[0].share * 2).toBeCloseTo(p[1].share, 9);
  });
  it('ULS 50/625 with the loads of the report: diagonal ≈ 12 kN, chord buckling over 2.5 m, couplers at the bearings', () => {
    const g: Girder = { key: 'T3', product: 'ULS50', L: 6.25, origin: [0, 10], u: [1, 0], zBottom: 3, zTop: 4.5, parts: [], supports: [0.375, 5.375, 6.125], supportsAssumed: false, loads: [], warnings: [] };
    const n: Girder = { ...g, key: 'T1', origin: [0, 7.5] };
    const m: Girder = { ...g, key: 'T4', origin: [0, 12.5] };
    const r = analyzeTent([n, g, m], inp());
    const t3 = r.girders.find((x) => x.key === 'T3')!;
    expect(t3.width).toBeCloseTo(2.5, 9);
    // characteristic loads per purlin as in the report: 0.8 / 1.6 kN G, 1.7 / 3.4 kN S
    expect(t3.points[1].G / kN).toBeCloseTo(1.67, 2);
    expect(t3.points[1].S / kN).toBeCloseTo(3.54, 2);
    expect(Math.abs(t3.diagonal!.N) / kN).toBeGreaterThan(10);
    expect(Math.abs(t3.diagonal!.N) / kN).toBeLessThan(14);
    expect(t3.buckling!.Lcr).toBeCloseTo(2.5, 6);
    expect(t3.buckling!.eta).toBeGreaterThan(0.6);
    expect(t3.buckling!.eta).toBeLessThan(0.95);
    expect(t3.bearing!.eta).toBeGreaterThan(0);
    const keys = r.summary.map((s) => s.key);
    expect(keys).toEqual(['chord', 'buckling', 'diagonal', 'coupler', 'sliding', 'overturning']);
  });
});
