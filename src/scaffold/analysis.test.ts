import { describe, expect, it } from 'vitest';
import { aecPartCount, parsePeriCadDxf } from './pericad';
import { analyzeScaffold } from './structure';
import { buildScaffoldModel } from './model';
import { DEFAULT_ANALYSIS, GAMMA_F, analyzeScaffoldModel, buildLoadCases, mergeResults, prepareAnalysis, weakDofs } from './analysis';
import { connCz, connInteraction, connKy, connResistance, tubeUtilisation, ubkData, ubhData, ublData } from './upflex';
import { periDxf, towerParts, type TestPart } from './testDxf';

const tower = (edit?: (p: TestPart[]) => void) => {
  const parts = towerParts();
  edit?.(parts);
  return analyzeScaffold(parsePeriCadDxf(periDxf(parts), 'tower.dxf'));
};
/** node diagonals 200/200 in both bays of the plane y = 0 and y = 2, bottom lift (rosettes 0.22 → 2.22) */
const braced = (p: TestPart[]) => {
  for (const ay of [0, 2]) for (const ax of [0, 2]) p.push({ art: 'UBK', rot: 'x', t: [ax + 0.083, ay - 0.05, 0.22] });
};

describe('PERI UP Flex approval data', () => {
  it('moment / rotation curves: secant stiffness of the ledger connection', () => {
    // UH Plus at Ø48.3×3.2 with 8 mm rosette: φ = M/(17100 − 65.6·M) [kNcm]
    expect(connKy('PLUS', '1a', 0)).toBeCloseTo(171000, 0);
    expect(connKy('PLUS', '1a', 1000)).toBeCloseTo((17100 - 65.6 * 100) * 10, 0);
    expect(connKy('PLUS', '1a', -1000)).toBeCloseTo((13150 - 66.6 * 100) * 10, 0);
    expect(connKy('UH', '2c', 500)).toBeCloseTo((8040 - 45.9 * 50) * 10, 0);
  });

  it('resistances and interaction of the connection (tables 11, 12; Gl. 7–8)', () => {
    const R = connResistance('PLUS', '1a');
    expect(R.MyPos).toBe(1610);
    expect(R.MyNeg).toBe(1360);
    expect(R.NPos).toBe(37300);
    expect(R.VzPos).toBe(30400);
    expect(R.alphaPos).toBe(0.2);
    // hogging moment with a vertical load on the rosette: Gl. 8c governs with tension, 7c without
    const a = connInteraction('PLUS', '1a', { N: 0, My: -680, Vz: 15200, Vy: 0, Mz: 0, Mx: 0 });
    expect(a.eq).toBe('8a');
    expect(a.eta).toBeCloseTo(0.97 * 0.5 + 0.23 * 0.5, 6);
    const b = connInteraction('PLUS', '1a', { N: 0, My: 805, Vz: 15200, Vy: 0, Mz: 0, Mx: 0 });
    expect(b.eq).toBe('7a');
    expect(b.eta).toBeCloseTo(0.5 + 0.5, 6);
    const c = connInteraction('UH', '1a', { N: 2470, My: 0, Vz: 0, Vy: 1130, Mz: 0, Mx: 0 });
    expect(c.eta).toBeCloseTo(0.1 + 0.06, 6);
  });

  it('ledger diagonals UBL / UBL-2 (tables 16, 17): springs C_d and resistances', () => {
    // 1.00 × 1.00 at UH Plus: C_d+ = 25.2 kN/cm, C_d− = 21.8 kN/cm, N−Rd = 11.4 kN, N+Rd = 12.3 kN
    const d = ublData(1, 1, true, Math.SQRT2);
    expect(d.eaT / Math.SQRT2 / 1e5).toBeCloseTo(25.2, 6);
    expect(d.eaC / Math.SQRT2 / 1e5).toBeCloseTo(21.8, 6);
    expect(d.nT).toBe(12300);
    expect(d.nC).toBe(11400);
    expect(d.slack).toBe(0.002);
    // at UH: N+Rd = 9.64 kN; 3.00 × 2.00: N−Rd = 5.49 kN
    expect(ublData(3, 2, false, 3.6).nT).toBe(9640);
    expect(ublData(3, 2, false, 3.6).nC).toBe(5490);
    // a field between the rows: the next larger one
    expect(ublData(1.4, 0.9, false, 1.7).nC).toBe(ublData(1.5, 1.0, false, 1.7).nC);
  });

  it('vertical spring c_z of the connection (annex A pages 9, 10): secant stiffness', () => {
    // rosette 8 mm: tension δ = Fz/(31.5 − 1.89·Fz), compression 60 kN/mm up to 5 kN, then δ = Fz/10 + 0.4167
    expect(connCz('1a', 0)).toBeCloseTo(31.5e6, 3);
    expect(connCz('1a', 10e3)).toBeCloseTo((31.5 - 18.9) * 1e6, 3);
    expect(connCz('1b', -3e3)).toBeCloseTo(60e6, 3);
    expect(connCz('1a', -20e3)).toBeCloseTo((20 / (2 - 0.4167)) * 1e6, 0);
    // rosette 6 mm: tension δ = Fz/(8 − 0.39·Fz), compression δ = Fz/(36 + 0.96·Fz)
    expect(connCz('2c', 0)).toBeCloseTo(8e6, 3);
    expect(connCz('2a', 5e3)).toBeCloseTo((8 - 1.95) * 1e6, 3);
    expect(connCz('2b', -10e3)).toBeCloseTo((36 - 9.6) * 1e6, 3);
  });

  it('cosine interaction of the tube and diagonal tables', () => {
    expect(tubeUtilisation(0.5, 0)).toBeCloseTo(0.5, 6);
    expect(tubeUtilisation(0, 0.5)).toBeCloseTo(0.5, 6);
    // on the curve m = cos(π/2·n)
    expect(tubeUtilisation(0.5, Math.cos(Math.PI / 4))).toBeCloseTo(1, 6);
    expect(ubkData(2, 2, false)).toMatchObject({ eaT: 4100e3, nT: 13200, eaC: 1970e3, nC: 7480, slack: 0.01 });
    expect(ubkData(1.5, 1, true)).toMatchObject({ eaT: 2250e3, nT: 12600, eaC: 850e3, nC: 9750, slack: 0.012 });
    expect(ubhData(1.5, 1)).toMatchObject({ eaT: 7920e3, nT: 11200, slack: 0.002 });
  });
});

describe('structural model of the scaffold', () => {
  const st = tower(braced);
  const m = buildScaffoldModel(st);

  it('standards with nodes at the rosettes, bases, ledgers with rosette connections', () => {
    expect(m.bases).toHaveLength(6);
    expect(m.notes).toEqual([]);
    const kinds = m.members.reduce<Record<string, number>>((a, x) => ((a[x.kind] = (a[x.kind] ?? 0) + 1), a), {});
    expect(kinds.ledger).toBe(16);
    expect(kinds.girder).toBe(2);
    expect(kinds.ubk).toBe(4);
    // ledgers at the base standard UVB 24 (Ø48.3×3.6, rosette 8 mm): variant 1b, above: 1a
    const conns = m.members.filter((x) => x.kind === 'ledger').map((x) => x.conn!.join());
    expect(conns.filter((c) => c === '1b,1b')).toHaveLength(7);
    expect(conns.filter((c) => c === '1a,1a')).toHaveLength(9);
    // standard joints with the rotational spring
    expect(m.members.filter((x) => x.joint).length).toBe(10);
    expect(m.levels.map((l) => +l.area.toFixed(2))).toEqual([7.64, 7.64]);
  });

  it('loads: self weight from the parts list, service load on one level', () => {
    const lc = buildLoadCases(m, { ...DEFAULT_ANALYSIS, p: 2000 });
    // 10 UVR 200 (10 kg), 6 UVB 24 (2.47), 16 UH 200 Plus (6.04), 32 UDG 25×200 (12.2);
    // girders and diagonals without a weight in the parts list: estimated
    const kg = 10 * 10 + 6 * 2.47 + 16 * 6.04 + 32 * 12.2;
    expect(lc.totalG / 9.81).toBeGreaterThan(kg);
    expect(lc.totalG / 9.81).toBeLessThan(kg + 160);
    expect(lc.totalQ).toBeCloseTo(7.644 * 2000, -1);
  });
});

describe('scaffold analysis', () => {
  it('braced tower indoors: equilibrium, convergence, checks', () => {
    const m = buildScaffoldModel(tower(braced));
    const opt = { ...DEFAULT_ANALYSIS, outdoor: false };
    const res = analyzeScaffoldModel(m, opt);
    expect(res.combos).toHaveLength(4);
    for (const c of res.combos) {
      expect(c.ok).toBe(true);
      expect(c.converged).toBe(true);
      expect(c.sumV).toBeCloseTo(GAMMA_F * (res.totalG + res.totalQ), -2);
      expect(c.dh).toBeLessThan(0.05);
    }
    const kinds = new Set(res.checks.map((c) => c.check));
    // the node diagonals stay within their slack of 1 cm at this load
    for (const k of ['conn', 'node', 'tube', 'buckling', 'joint', 'ledger']) expect(kinds.has(k as never)).toBe(true);
    for (const c of res.checks) expect(Number.isFinite(c.eta)).toBe(true);
    expect(Math.max(...res.bases.map((b) => b.Vmax))).toBeGreaterThan((GAMMA_F * (res.totalG + res.totalQ)) / 6);
    expect(res.bases.every((b) => b.Vmin > 0)).toBe(true);
  });

  it('more load → higher utilisation; the service class scales the load', () => {
    const m = buildScaffoldModel(tower(braced));
    const a = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, outdoor: false, p: 2000 });
    const b = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, outdoor: false, p: 6000 });
    const max = (r: typeof a, k: string) => Math.max(...r.checks.filter((c) => c.check === k).map((c) => c.eta));
    expect(max(b, 'conn')).toBeGreaterThan(max(a, 'conn') * 1.5);
    expect(max(b, 'buckling')).toBeGreaterThan(max(a, 'buckling') * 1.5);
  });

  it('wind outdoors: larger sway than indoors; maximum wind adds the out-of-service combinations', () => {
    const m = buildScaffoldModel(tower(braced));
    const indoor = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, outdoor: false });
    const out = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, outdoor: true, qMax: 800 });
    expect(out.combos).toHaveLength(8);
    expect(out.combos.filter((c) => c.name.startsWith('R'))).toHaveLength(4);
    expect(Math.max(...out.combos.map((c) => c.dh))).toBeGreaterThan(Math.max(...indoor.combos.map((c) => c.dh)));
  });

  it('second order increases the sway of the unbraced tower', () => {
    const m = buildScaffoldModel(tower());
    const first = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, outdoor: false, secondOrder: false });
    const second = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, outdoor: false, secondOrder: true });
    expect(Math.max(...second.combos.map((c) => c.dh))).toBeGreaterThan(Math.max(...first.combos.map((c) => c.dh)) * 1.05);
  });

  it('anchor: tube to the structure takes horizontal load, checked against the coupler', () => {
    const st = tower((p) => {
      p.push({ art: 'TUBE', rot: 'nx', t: [-0.06, 0, 4.2] });
      p.push({ art: 'RA', rot: 'x', t: [-0.06, 0, 4.2] });
      p.push({ art: 'UEC', rot: 'x', t: [-1.06, 0, 4.2] });
    });
    const m = buildScaffoldModel(st);
    expect(m.anchors).toHaveLength(1);
    const res = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, outdoor: true, qMax: 800 });
    expect(res.anchors).toHaveLength(1);
    expect(Math.max(Math.abs(res.anchors[0].Nmax), Math.abs(res.anchors[0].Nmin))).toBeGreaterThan(100);
    const free = analyzeScaffoldModel(buildScaffoldModel(tower()), { ...DEFAULT_ANALYSIS, outdoor: true, qMax: 800 });
    const dx = (r: typeof res) => r.combos.find((c) => c.name === 'R +x')!.dh;
    expect(dx(res)).toBeLessThan(dx(free));
  });
});

describe('ledger diagonals UBL', () => {
  // UBL-2 200/200 in both bays of the planes y = 0 and y = 2, from the lower to the upper ledgers
  const ubl = (p: TestPart[]) => {
    for (const ay of [0, 2]) for (const ax of [0, 2]) p.push({ art: 'UBL', rot: 'x', t: [ax + 0.125, ay, 0.25] });
  };

  it('fixed to the two ledgers 12.5 cm from the standards; their connections get the spring c_z', () => {
    const m = buildScaffoldModel(tower(ubl));
    const ks = m.members.map((x, k) => (x.kind === 'ubl' ? k : -1)).filter((k) => k >= 0);
    expect(ks).toHaveLength(4);
    expect(m.notes.find((n) => n.key === 'ublNoLedger')).toBeUndefined();
    for (const k of ks) {
      const f = m.frame.members[k];
      // nodes on the ledgers, not on the standards: 12.5 cm from the axes, 1.4 cm beside the ledger axis
      expect(m.nodeColumn[f.i]).toBe(-1);
      expect(m.nodeColumn[f.j]).toBe(-1);
      const [a, b] = [m.frame.nodes[f.i], m.frame.nodes[f.j]].sort((p, q) => p[2] - q[2]);
      expect(a[0] % 2).toBeCloseTo(0.125, 6);
      expect(b[0] % 2).toBeCloseTo(1.875, 6);
      expect(Math.abs(a[1] - Math.round(a[1]))).toBeCloseTo(0.014, 6);
      expect(a[2]).toBeCloseTo(0.25, 6);
      expect(b[2]).toBeCloseTo(2.25, 6);
      // ledgers UH Plus on both sides: table 17, 2.00 × 2.00
      expect(m.members[k].diag!.nT).toBe(12300);
      expect(m.members[k].diag!.nC).toBe(8100);
      expect(m.members[k].diag!.slack).toBe(0.002);
    }
    // ledgers with a diagonal: c_z at their rosette connections; the other ledgers of 2 m: rigid
    const withUbl = new Set(ks.flatMap((k) => [m.frame.members[k].i, m.frame.members[k].j]));
    const carriers = m.carriers.filter((c) => c.kind === 'ledger');
    let soft = 0;
    let rigid = 0;
    for (const c of carriers) {
      const has = c.members.some((k) => withUbl.has(m.frame.members[k].i) || withUbl.has(m.frame.members[k].j));
      for (const k of c.members)
        m.members[k].conn?.forEach((v, e) => {
          if (!v) return;
          const cz = m.frame.members[k].ends![e]!.k![2];
          if (has) {
            expect(cz).toBeCloseTo(31.5e6, 0);
            soft++;
          } else {
            expect(cz).toBe(Infinity);
            rigid++;
          }
        });
    }
    // 4 lower + 4 upper ledgers along x carry a diagonal: 16 connections
    expect(soft).toBe(16);
    expect(rigid).toBeGreaterThan(0);
  });

  it('brace the tower: less sway than without, checked against table 17', () => {
    const opt = { ...DEFAULT_ANALYSIS, outdoor: false };
    const free = analyzeScaffoldModel(buildScaffoldModel(tower()), opt);
    const r = analyzeScaffoldModel(buildScaffoldModel(tower(ubl)), opt);
    expect(r.combos.every((c) => c.ok && c.converged)).toBe(true);
    const sway = (x: typeof r, n: string) => x.combos.find((c) => c.name === n)!.dh;
    expect(sway(r, 'A +x')).toBeLessThan(0.7 * sway(free, 'A +x'));
    const d = r.checks.filter((c) => c.check === 'diagonal');
    expect(d.length).toBe(4);
    expect(d.every((c) => c.eta < 1)).toBe(true);
    // equilibrium is kept with the springs
    expect(r.combos[0].sumV).toBeCloseTo(GAMMA_F * (r.totalG + r.totalQ), -1);
  });
});

describe('supports, mechanisms, parallel runs', () => {
  it('base standard over a standard below (spindle pair through a platform): load goes on to it', () => {
    // standard of the tower at (0, 0) ends at 4.5 m; base standard 0.4 m above it, 1.5 cm off
    const st = tower((p) => {
      p.push({ art: 'UVB', rot: 'y', t: [0.08 + 0.015, -0.08, 4.9] });
      p.push({ art: 'UVR', rot: 'y', t: [0.08 + 0.015, -0.08, 5.14] });
    });
    const m = buildScaffoldModel(st);
    expect(m.notes.find((n) => n.key === 'columnOnColumn')?.parts.length).toBe(1);
    const links = m.members.filter((x) => x.link);
    expect(links).toHaveLength(1);
    expect(m.bases).toHaveLength(6);
    const r = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, outdoor: false });
    expect(r.combos.every((c) => c.ok)).toBe(true);
    // the spindle pair carries the weight of the standards above it in compression
    expect(r.checks.some((c) => c.check === 'jack' && (c.N ?? 0) < 0)).toBe(true);
  });

  it('a standard without anything under it stands on the structure; a mechanism is held by a weak spring and reported', () => {
    const st = tower((p) => {
      braced(p);
      p.push({ art: 'UVR', rot: 'y', t: [20.08, 19.92, 10] });
    });
    const m = buildScaffoldModel(st);
    // a standard with nothing under it stands on the structure (by assumption, noted)
    expect(m.notes.find((n) => n.key === 'columnOnStructure')?.parts.length).toBe(1);
    const r = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, outdoor: false });
    expect(r.combos.every((c) => c.ok)).toBe(true);
    expect(r.unstable).toHaveLength(0);
    // a single standard on a pinned base, without any ledger: falls over under wind (mechanism),
    // held by a weak spring, reported; the rest of the analysis runs
    const m2 = buildScaffoldModel(
      tower((p) => {
        braced(p);
        p.push({ art: 'UVB', rot: 'y', t: [10.08, 9.92, 0.1] });
        p.push({ art: 'UVR', rot: 'y', t: [10.08, 9.92, 0.34] });
      }),
    );
    expect(weakDofs(m2).length).toBeGreaterThan(0);
    const r2 = analyzeScaffoldModel(m2, { ...DEFAULT_ANALYSIS, qMax: 800 });
    expect(r2.combos.every((c) => c.ok)).toBe(true);
    expect(r2.unstable.length).toBeGreaterThan(0);
    expect(r2.checks.some((c) => c.check === 'unstable')).toBe(true);
  });

  it('combinations run in parts and merged give the same result as one run', () => {
    const m = buildScaffoldModel(tower(braced));
    const opt = { ...DEFAULT_ANALYSIS, qMax: 800 };
    const whole = analyzeScaffoldModel(m, opt);
    const names = whole.combos.map((c) => c.name);
    const parts = [0, 1].map((w) => {
      const a = prepareAnalysis(m, opt);
      a.combos.forEach((cb, i) => i % 2 === w && a.runCombo(cb));
      return a.finish();
    });
    const merged = mergeResults(parts, names);
    expect(merged.combos.map((c) => c.name)).toEqual(names);
    expect(merged.checks.length).toBe(whole.checks.length);
    // the same up to the tolerance of the iterative solution
    expect(Math.max(...merged.checks.map((c) => c.eta))).toBeCloseTo(Math.max(...whole.checks.map((c) => c.eta)), 5);
    for (const b of whole.bases) {
      const o = merged.bases.find((x) => x.node === b.node)!;
      expect(o.Vmax).toBeCloseTo(b.Vmax, 1);
      expect(o.Vmin).toBeCloseTo(b.Vmin, 1);
    }
    whole.beams.forEach((b, k) => b.points.forEach((p, i) => expect(merged.beams[k].points[i].F).toBeCloseTo(p.F, 1)));
  });

  it('older PERI CAD parts (AEC) are counted from the CLASSES section', () => {
    const t = '  0\nSECTION\n  2\nCLASSES\n  0\nCLASS\n  1\nPERI_AEC_DB_BAUTEIL\n  2\nPERIAecDbBauteil\n  3\nPERIBauteilWand\n 90\n        1\n 91\n      1016\n280\n     0\n';
    expect(aecPartCount(t)).toBe(1016);
    expect(aecPartCount(periDxf(towerParts()))).toBe(0);
  });
});

describe('beams SRU / RCS for the beam calculator', () => {
  it('loads of the scaffold analysis as point loads, supports from the model', async () => {
    const { scaffoldBeam } = await import('./beams');
    const b = scaffoldBeam(
      {
        part: 'x',
        length: 0.724,
        points: [
          { t: 0, support: true, F: 2800, combo: 'A +x' },
          { t: 0.59, support: false, F: 6100, combo: 'A +x' },
          { t: 0.93, support: false, F: 0.5, combo: '' },
          { t: 1, support: true, F: 5500, combo: 'A −x' },
        ],
      },
      'B1',
      'SRU 72',
      'plan.dxf',
    );
    // catalogue length of the SRU 72
    expect(b.model.L).toBe(0.722);
    expect(b.model.segments[0].section).toMatchObject({ kind: 'peri', product: 'SRU120' });
    expect(b.model.supports.map((s) => [s.type, s.x])).toEqual([
      ['pinned', 0],
      ['roller', 0.722],
    ]);
    // design force / 1.5 as a variable load: 1.5·Q gives the design force again
    expect(b.model.loads).toHaveLength(1);
    expect(b.model.loads[0]).toMatchObject({ kind: 'point', caseId: 'Q', x: 0.426 });
    expect((b.model.loads[0] as { P: number }).P).toBeCloseTo(6100 / GAMMA_F, 6);
    expect(b.warnings).toEqual([]);
    expect(b.sum).toBe(6100);
    const rcs = scaffoldBeam({ part: 'y', length: 4.98, points: [{ t: 0.5, support: false, F: 9000, combo: 'A +y' }] }, 'B2', 'RCS 498');
    expect(rcs.model.segments[0].section).toMatchObject({ product: 'RCS' });
    expect(rcs.warnings.map((w) => w.key)).toEqual(['beamSupports']);
    expect(rcs.model.supports.map((s) => s.x)).toEqual([0, 4.98]);
  });
});
