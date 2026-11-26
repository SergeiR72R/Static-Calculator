import { describe, expect, it } from 'vitest';
import { aecPartCount, parsePeriCadDxf } from './pericad';
import { analyzeScaffold } from './structure';
import { buildScaffoldModel } from './model';
import { DEFAULT_ANALYSIS, GAMMA_F, analyzeScaffoldModel, buildCombos, buildLoadCases, mergeResults, prepareAnalysis, weakDofs } from './analysis';
import type { UserLoad } from './userLoads';
import { COUPLER_SLIP_K, E_STEEL, JOINT, JOINT_TENSION, TUBES, connCz, connInteraction, connKy, connResistance, oppositeOmega, rosetteBase, rosetteTension, tubeUtilisation, ubkData, ubhData, ublData } from './upflex';
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
    // annex A: table A.1 (UBK) and A.2 (UBK-2) for the model with the eccentric diagonal head
    expect(ubkData(2, 2, false, { ubk2: false })).toMatchObject({ eaT: 4660e3, nT: 13200, eaC: 2600e3, nC: 8910 });
    expect(ubkData(1.5, 1, true, { ubk2: false })).toMatchObject({ eaT: 2960e3, nT: 13200, eaC: 1590e3, nC: 9750, slack: 0.012 });
    expect(ubkData(1, 1, true, { ubk2: true })).toMatchObject({ eaT: 2050e3, nT: 10400, eaC: 730e3, nC: 9360 });
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
    // two girders: the top chord in three pieces (end panels 0.5 m) and per end bottom chord, post
    // and diagonal of the end panel
    expect(kinds.girder).toBe(2 * (3 + 2 * 3));
    expect(kinds.ubk).toBe(4);
    // rosettes 6 mm: ledgers at the base standard UVB 24 (Ø48.3×3.6): variant 2b, above (Ø48.3×3.2): 2a
    const conns = m.members.filter((x) => x.kind === 'ledger').map((x) => x.conn!.join());
    expect(conns.filter((c) => c === '2b,2b')).toHaveLength(7);
    expect(conns.filter((c) => c === '2a,2a')).toHaveLength(9);
    // standard joints with the rotational spring
    expect(m.members.filter((x) => x.joint).length).toBe(10);
    expect(m.levels.map((l) => +l.area.toFixed(2))).toEqual([7.64, 7.64]);
  });

  it('rosettes: stiffness 6 mm, resistance by the article of the standard (as PERI ForceControl)', () => {
    const st = tower(braced);
    const ubk = (m: ReturnType<typeof buildScaffoldModel>) => m.members.find((x) => x.kind === 'ubk')!.diag!;
    // UVR 200 (8 mm rosette, variant 1a): springs of 6 mm, resistance of 8 mm
    const a = ubk(buildScaffoldModel(st));
    const six = ubkData(2, 2, true, { ubk2: false });
    const eight = ubkData(2, 2, false, { ubk2: false });
    expect(a.eaT).toBe(six.eaT);
    expect(a.slack).toBe(six.slack);
    expect(a.nT).toBe(eight.nT);
    expect(a.nC).toBe(eight.nC);
    // resistance as the stiffness
    const b = ubk(buildScaffoldModel(st, [], [], { capByArticle: false }));
    expect([b.nT, b.nC]).toEqual([six.nT, six.nC]);
    // ledger connections checked with the rosette of the article, springs of 6 mm
    const led = buildScaffoldModel(st).members.find((x) => x.kind === 'ledger' && x.conn?.[0])!;
    expect(led.conn![0]![0]).toBe('2');
    expect(led.connCap![0]![0]).toBe('1');
    expect(buildScaffoldModel(st, [], [], { capByArticle: false }).members.find((x) => x.kind === 'ledger' && x.conn?.[0])!.connCap).toBeUndefined();
  });

  it('node diagonals UBK after annex A: head 8.3 cm beside the standard, 3.6 cm out of the plane', () => {
    const ubk = m.frame.members.filter((_, k) => m.members[k].kind === 'ubk');
    expect(ubk).toHaveLength(4);
    for (const x of ubk) {
      const oi = x.ends?.[0]?.offset ?? [0, 0, 0];
      const oj = x.ends?.[1]?.offset ?? [0, 0, 0];
      // along the bay (x) towards the other standard, both ends on the same side beside the plane y = const
      expect(Math.abs(oi[0])).toBeCloseTo(0.083, 6);
      expect(oi[0] * oj[0]).toBeLessThan(0);
      expect(Math.abs(oi[1])).toBeCloseTo(0.036, 6);
      expect(oj[1]).toBeCloseTo(oi[1], 9);
      expect(oi[2]).toBe(0);
      expect(x.sec.EA).toBeCloseTo(ubkData(2, 2, true, { ubk2: false }).eaT, -3);
    }
    // table 15: centric, without offsets
    const t = buildScaffoldModel(st, [], [], { ubk: 'table15' });
    const t15 = t.frame.members.filter((_, k) => t.members[k].kind === 'ubk');
    expect(t15.every((x) => !x.ends)).toBe(true);
    expect(t15[0].sec.EA).toBeCloseTo(ubkData(2, 2, true).eaT, -3);
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
    // second order: no separate χ buckling check (the stability is in the forces of the standards)
    for (const k of ['conn', 'node', 'tube', 'joint', 'ledger']) expect(kinds.has(k as never)).toBe(true);
    expect(kinds.has('buckling')).toBe(false);
    // first order: with the buckling check
    const first = analyzeScaffoldModel(m, { ...opt, secondOrder: false });
    expect(first.checks.some((c) => c.check === 'buckling')).toBe(true);
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
    expect(max(b, 'tube')).toBeGreaterThan(max(a, 'tube') * 1.5);
  });

  it('wind outdoors: larger sway than indoors; maximum wind adds the out-of-service combinations', () => {
    const m = buildScaffoldModel(tower(braced));
    const indoor = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, outdoor: false });
    const out = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, outdoor: true, qMax: 800 });
    expect(out.combos).toHaveLength(12);
    expect(out.combos.filter((c) => c.name.startsWith('R'))).toHaveLength(4);
    expect(out.combos.filter((c) => c.name.startsWith('S'))).toHaveLength(4);
    expect(Math.max(...out.combos.map((c) => c.dh))).toBeGreaterThan(Math.max(...indoor.combos.map((c) => c.dh)));
  });

  it('user loads: point and line loads on parts, DHB from the moved load, γ of the combinations', () => {
    const st = tower(braced);
    // two ledgers at +2.22 m along x and one along y
    const lx = st.parts.filter((w) => w.cls.kind === 'ledger' && Math.abs(w.min[2] - 2.22) < 0.1 && w.max[0] - w.min[0] > 1).slice(0, 2);
    const ly = st.parts.find((w) => w.cls.kind === 'ledger' && Math.abs(w.min[2] - 2.22) < 0.1 && w.max[1] - w.min[1] > 1)!;
    const loads: UserLoad[] = [
      { id: 'a', name: 'platform', case: 'G', kind: 'point', value: 10e3, at: 0.5, parts: lx.map((w) => w.part.id) },
      { id: 'b', name: 'traffic', case: 'Q', kind: 'point', value: 6e3, at: 0.5, parts: lx.map((w) => w.part.id) },
      { id: 'c', name: 'ballast', case: 'G', kind: 'line', value: 2e3, at: 0, parts: [ly.part.id] },
    ];
    // DHB on the standards of the ledgers along x (the chosen parts: their tops)
    const stds = st.parts.filter((w) => w.cls.kind === 'standard' && w.min[2] > 2).slice(0, 2);
    expect(Math.hypot(stds[0].min[0] - stds[1].min[0], stds[0].min[1] - stds[1].min[1])).toBeGreaterThan(1);
    const m = buildScaffoldModel(st, loads, stds.map((w) => w.part.id));
    expect(m.dhbNodes).toHaveLength(2);
    // G and Q at the same place share one node in the middle of each ledger
    expect(m.user[0].nodal.map((n) => n.node)).toEqual(m.user[1].nodal.map((n) => n.node));
    for (const n of m.user[0].nodal) expect(m.frame.nodes[n.node][2]).toBeCloseTo(2.22, 1);
    const opt = { ...DEFAULT_ANALYSIS, outdoor: true, qMax: 600, dhbLoad: 100e3 };
    const cb = buildCombos(m, opt);
    const L = m.user[2].members.reduce((a, x) => a + m.lengths[x.m], 0);
    expect(L).toBeCloseTo(2, 1);
    expect(cb.userG).toBeCloseTo(2 * 10e3 + 2e3 * L, 3);
    expect(cb.userQ).toBeCloseTo(2 * 6e3, 3);
    // DHB: 10 % of the load moved by the crane
    expect(cb.dhb).toBeCloseTo(10e3, 3);
    const res = analyzeScaffoldModel(m, opt);
    const share = 0.25; // load class 3
    // working, out of service (γ = 1.5) and stability (γ = 0.9) in 4 directions each
    expect(res.combos.map((c) => c.name[0]).join('')).toBe('AAAARRRRSSSS');
    for (const c of res.combos) {
      expect(c.ok).toBe(true);
      // working: everything × 1.5; out of service: permanent × 1.5 + share of Q (user Q too);
      // stability: permanent × 0.9 (favourable)
      const V = c.name.startsWith('A')
        ? GAMMA_F * (res.totalG + res.totalQ + cb.userG + cb.userQ)
        : c.name.startsWith('R')
          ? GAMMA_F * (res.totalG + cb.userG + share * (res.totalQ + cb.userQ))
          : 0.9 * (res.totalG + cb.userG);
      expect(c.sumV).toBeCloseTo(V, -2);
    }
    expect(res.dhb).toBeCloseTo(cb.dhb, 3);
    // no moved load: no DHB
    expect(buildCombos(m, { ...opt, dhbLoad: 0 }).dhb).toBe(0);
  });

  it('user loads in the working or the out-of-service combinations only (as the load cases per combination of PFC)', () => {
    const st = tower(braced);
    const lx = st.parts.filter((w) => w.cls.kind === 'ledger' && Math.abs(w.min[2] - 2.22) < 0.1 && w.max[0] - w.min[0] > 1).slice(0, 2);
    const ids = lx.map((w) => w.part.id);
    const loads: UserLoad[] = [
      { id: 'w', name: 'platform live load', case: 'Q', kind: 'point', value: 6e3, at: 0.5, parts: ids, when: 'work' },
      { id: 'r', name: 'hoist parked', case: 'Q', kind: 'point', value: 4e3, at: 0.5, parts: ids, when: 'rest' },
      { id: 'g', name: 'hoist mast out of service', case: 'G', kind: 'point', value: 3e3, at: 0.5, parts: ids, when: 'rest' },
    ];
    const m = buildScaffoldModel(st, loads);
    const opt = { ...DEFAULT_ANALYSIS, p: 0, outdoor: true, qMax: 600 };
    const res = analyzeScaffoldModel(m, opt);
    const V = (n: string) => res.combos.find((c) => c.name === n)!.sumV;
    const G = res.totalG;
    // working: the working load only; out of service: the parked loads in full (no share); stability: G parked × 0.9
    expect(V('A +x')).toBeCloseTo(GAMMA_F * (G + 2 * 6e3), -2);
    expect(V('R +x')).toBeCloseTo(GAMMA_F * (G + 2 * 4e3 + 2 * 3e3), -2);
    expect(V('S +x')).toBeCloseTo(0.9 * (G + 2 * 3e3), -2);
  });

  it('fixings to the building set by the user: supports at the chosen parts and axes, reactions and check', () => {
    const st = tower(braced);
    // the two upper standards at x = 0 held at their top in x
    const tops = st.parts.filter((w) => w.cls.kind === 'standard' && w.min[2] > 2 && Math.abs(w.min[0]) < 0.1).map((w) => w.part.id);
    expect(tops).toHaveLength(2);
    const opt = { ...DEFAULT_ANALYSIS, outdoor: true, qMax: 600 };
    const free = analyzeScaffoldModel(buildScaffoldModel(st), opt);
    const m = buildScaffoldModel(st, [], [], { fixings: [{ id: 'f', name: 'wall', parts: tops, at: 1, dirs: ['x'], limit: 5e3 }] });
    expect(m.fixings).toHaveLength(2);
    for (const f of m.fixings) {
      expect(m.frame.nodes[f.node][2]).toBeCloseTo(4.5, 1);
      expect(f.sups.map((x) => m.frame.supports[x.sup].dof)).toEqual([0]);
    }
    const r = analyzeScaffoldModel(m, opt);
    // held in x: less sway in x, the fixings take a force in x only
    const dx = (res: typeof r) => Math.max(...res.combos.filter((c) => /x/.test(c.name)).map((c) => c.dh));
    expect(dx(r)).toBeLessThan(dx(free) * 0.6);
    expect(r.fixings).toHaveLength(2);
    for (const f of r.fixings) {
      expect(Math.abs(f.R[0])).toBeGreaterThan(100);
      expect(f.R[1]).toBe(0);
      expect(f.R[2]).toBe(0);
      expect(f.eta).toBeCloseTo(f.F / 5e3, 9);
    }
    expect(r.checks.some((c) => c.check === 'fixing')).toBe(true);
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

  it('anchors chosen by the user: a tube through two couplers becomes an anchor, a recognised one can be none', () => {
    // a 2 m tube along y beside the standards x = 0, coupled to both, sticking out 10 cm at y = 2.1
    const withTube = (p: TestPart[]) => {
      p.push({ art: 'TUBE2', rot: 'y', t: [-0.05, 0.1, 3.2] });
      p.push({ art: 'RA', rot: 'x', t: [-0.05, 0.12, 3.2] });
      p.push({ art: 'RA', rot: 'x', t: [-0.05, 2, 3.2] });
    };
    const parts = towerParts();
    withTube(parts);
    const doc = parsePeriCadDxf(periDxf(parts), 'tower.dxf');
    const tube = analyzeScaffold(doc).parts.find((w) => w.part.name === 'TUBE 2m')!;
    // made no anchor: bracing between the two standards
    const auto = analyzeScaffold(doc, { tol: 0.05, anchorRoles: { [tube.part.id]: 'tube' } });
    expect(auto.anchors).toHaveLength(0);
    const st = analyzeScaffold(doc, { tol: 0.05, anchorRoles: { [tube.part.id]: 'anchor' } });
    expect(st.anchors).toHaveLength(1);
    const a = st.anchors[0];
    expect(a).toMatchObject({ id: tube.part.id, chosen: true });
    // held at the end beyond the last standard, through both couplers
    expect(a.atStructure[1]).toBeCloseTo(2.1, 2);
    expect(a.via).toHaveLength(1);
    const m = buildScaffoldModel(st);
    expect(m.anchors[0].links).toHaveLength(2);
    // the couplers work side by side: the tube is stiff, each coupler slips in its own link
    for (const k of m.anchors[0].chain) expect(m.frame.members[k].sec.EA).toBeCloseTo(E_STEEL * TUBES.t32.A, 0);
    for (const k of m.anchors[0].links) {
      const fm = m.frame.members[k];
      const L = Math.hypot(...[0, 1, 2].map((i) => m.frame.nodes[fm.j][i] - m.frame.nodes[fm.i][i]));
      expect((12 * fm.sec.EIy) / L ** 3).toBeCloseTo(COUPLER_SLIP_K, -3);
    }
    const r = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, outdoor: true, qMax: 800, keep: true });
    expect(r.anchors[0]).toMatchObject({ part: tube.part.id, couplers: 2 });
    expect(r.checks.find((c) => c.check === 'anchor')?.detail).toMatch(/2 Kupplungen/);
    // the end at the building is held across and along the facade
    const far = m.frame.members[m.anchors[0].chain[0]].j;
    const sups = m.frame.supports.map((q, i) => ({ ...q, i })).filter((q) => q.node === far);
    expect(sups.map((q) => q.dof).sort()).toEqual([0, 1]);
    const peak = (dof: number) => Math.max(...r.combos.map((c) => Math.abs(c.reactions![sups.find((q) => q.dof === dof)!.i])));
    expect(peak(0)).toBeGreaterThan(100);
    expect(peak(1)).toBeGreaterThan(100);
    // each coupler's slip force from its link; the anchor check is that of the worst coupler: the
    // slip (EN 12811-1, C.1) or the interaction with the pull-apart force and the moment (Eq. 10)
    expect(r.anchors[0].Fc).toBeGreaterThan(0);
    expect(r.anchors[0].eta).toBeGreaterThan(0);
    expect(r.checks.find((c) => c.check === 'anchor')?.detail).toMatch(/^EN 12811-1, (C\.1|Eq\. 10)/);
    // the sway along the tube is smaller than without the anchor
    const dy = (x: typeof r) => x.combos.find((c) => c.name === 'R +y')!.dh;
    expect(dy(r)).toBeLessThan(dy(analyzeScaffoldModel(buildScaffoldModel(auto), { ...DEFAULT_ANALYSIS, outdoor: true, qMax: 800 })));
    // and the other way round: a recognised anchor made no anchor
    const anchored = tower((p) => {
      p.push({ art: 'TUBE', rot: 'nx', t: [-0.06, 0, 4.2] });
      p.push({ art: 'RA', rot: 'x', t: [-0.06, 0, 4.2] });
      p.push({ art: 'UEC', rot: 'x', t: [-1.06, 0, 4.2] });
    });
    expect(anchored.anchors).toHaveLength(1);
    const p2 = towerParts();
    p2.push({ art: 'TUBE', rot: 'nx', t: [-0.06, 0, 4.2] }, { art: 'RA', rot: 'x', t: [-0.06, 0, 4.2] }, { art: 'UEC', rot: 'x', t: [-1.06, 0, 4.2] });
    const none = analyzeScaffold(parsePeriCadDxf(periDxf(p2), 'tower.dxf'), { tol: 0.05, anchorRoles: { [anchored.anchors[0].id]: 'tube' } });
    expect(none.anchors).toHaveLength(0);
    expect(none.parts.find((w) => w.part.id === anchored.anchors[0].id)?.cls.kind).toBe('tube');
  });

  it('a strut against the building pushes only; a brace coupled to an anchor tube is part of the model', () => {
    // the anchor tube of the test above (towards the building at y = 2.1) and a tube diagonal in plan
    // from the standard at (4, 2) to a coupler on the anchor tube at y ≈ 1 (away from the standards)
    const parts = towerParts();
    parts.push({ art: 'TUBE2', rot: 'y', t: [-0.05, 0.1, 3.2] }, { art: 'RA', rot: 'x', t: [-0.05, 0.12, 3.2] }, { art: 'RA', rot: 'x', t: [-0.05, 2, 3.2] });
    parts.push({ art: 'TUBED', rot: 'x', t: [-0.25, 0.9975, 3.25] }, { art: 'RA', rot: 'x', t: [3.98, 2.055, 3.25] }, { art: 'RA', rot: 'x', t: [-0.05, 1.0475, 3.225] });
    const doc = parsePeriCadDxf(periDxf(parts), 'tower.dxf');
    const ids = analyzeScaffold(doc).parts;
    const anchorId = ids.find((w) => w.part.name === 'TUBE 2m')!.part.id;
    const braceId = ids.find((w) => w.part.name === 'TUBE 4,5m')!.part.id;
    const model = (role: 'anchor' | 'strut') => buildScaffoldModel(analyzeScaffold(doc, { tol: 0.05, anchorRoles: { [anchorId]: role, [braceId]: 'tube' } }));
    const m = model('strut');
    expect(m.anchors).toHaveLength(1);
    expect(m.anchors[0].strut?.dir[1]).toBeCloseTo(-1, 6);
    // the brace: from the standard to a node on the anchor tube
    const brace = m.members.map((x, k) => [x, k] as const).filter(([x]) => x.part === braceId);
    expect(brace.length).toBeGreaterThan(0);
    expect(m.notes.some((n) => n.key === 'tubeFree' && n.parts.includes(braceId))).toBe(false);
    const chainNodes = new Set(m.anchors[0].chain.flatMap((k) => [m.frame.members[k].i, m.frame.members[k].j]));
    expect(brace.some(([, k]) => chainNodes.has(m.frame.members[k].i) || chainNodes.has(m.frame.members[k].j))).toBe(true);
    // pushed (+y, towards the building) it bears, pulled (−y) it is released
    const opt = { ...DEFAULT_ANALYSIS, outdoor: true, qMax: 800, keep: true };
    const r = analyzeScaffoldModel(m, opt);
    const [sx, sy] = m.anchors[0].strut!.sups;
    const R = (name: string) => { const c = r.combos.find((q) => q.name === name)!; return [c.reactions![sx], c.reactions![sy]]; };
    expect(-R('R +y')[1]).toBeGreaterThan(100);
    expect(R('R −y').map(Math.abs)).toEqual([0, 0]);
    // as an anchor it holds both ways
    const ma = model('anchor');
    expect(ma.anchors[0].strut).toBeUndefined();
    const ra = analyzeScaffoldModel(ma, opt);
    const far = ma.frame.members[ma.anchors[0].chain[0]].j;
    const sa = ma.frame.supports.findIndex((q) => q.node === far && q.dof === 1);
    expect(Math.abs(ra.combos.find((c) => c.name === 'R −y')!.reactions![sa])).toBeGreaterThan(100);
  });

  it('clad scaffold: wind q · c_f · influence width on the standards facing it, none behind them', () => {
    const m = buildScaffoldModel(tower());
    const opt = { ...DEFAULT_ANALYSIS, outdoor: true, qMax: 800, cladding: 1.3 };
    const w = buildLoadCases(m, opt).wind([1, 0, 0], 0);
    const len = (k: number) => Math.hypot(...[0, 1, 2].map((i) => m.frame.nodes[m.frame.members[k].j][i] - m.frame.nodes[m.frame.members[k].i][i]));
    // the standards of the tower: x = 0, 2, 4 and y = 0, 2; wind along +x reaches the line x = 0 first
    const loaded = w.member.filter((l) => l.q[0] !== 0);
    expect(loaded.length).toBeGreaterThan(0);
    for (const l of loaded) {
      expect(m.members[l.m].kind).toBe('standard');
      const x = (m.frame.nodes[m.frame.members[l.m].i][0] + m.frame.nodes[m.frame.members[l.m].j][0]) / 2;
      expect(Math.abs(x)).toBeLessThan(0.2);
      // two standards 2 m apart: each carries half the facade between them, 1 m
      expect(l.q[0]).toBeCloseTo(1.3 * 1, 6);
    }
    // total: c_f · facade width (2 m) · height of the standards at x = 0
    const H = loaded.reduce((a, l) => a + len(l.m), 0) / 2;
    expect(loaded.reduce((a, l) => a + l.q[0] * len(l.m), 0)).toBeCloseTo(1.3 * 2 * H, 6);
    // open scaffold: wind on all members
    const open = buildLoadCases(m, { ...opt, cladding: 0 }).wind([1, 0, 0], 0);
    expect(open.member.filter((l) => l.q[0] !== 0).some((l) => m.members[l.m].kind === 'ledger')).toBe(true);
  });

  it('supports set by hand at the bottom of standards: in place of the base, springs, pressure only', () => {
    const st = tower();
    const auto = buildScaffoldModel(st);
    // the lowest part of the first column (a base standard on its spindle) and its node
    const col = st.columns[0];
    const lowest = st.parts.filter((w) => col.parts.includes(w.part.id) && ['standard', 'base'].includes(w.cls.kind)).sort((a, b) => a.min[2] - b.min[2])[0];
    const K = 5e6;
    const m = buildScaffoldModel(st, [], [], { fixings: [{ id: 'S1', name: 'HEB', parts: [lowest.part.id], at: 0, dirs: ['x', 'y', 'z'], support: { k: { z: K }, compression: true } }] });
    // the same number of bases: the automatic one of this column replaced by the spring
    expect(m.bases).toHaveLength(auto.bases.length);
    const b = m.bases.find((q) => q.part === lowest.part.id)!;
    expect(m.frame.supports.slice(b.sup, b.sup + 3).map((q) => q.k)).toEqual([Infinity, Infinity, K]);
    // the spring settles under load: the vertical reaction is k · displacement
    const r = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, outdoor: false, keep: true });
    const c = r.combos[0];
    expect(c.reactions![b.sup + 2]).toBeCloseTo(-K * c.u![b.node * 6 + 2], 0);
    expect(c.reactions![b.sup + 2]).toBeGreaterThan(0);
    // horizontal only (no Z): a fixing, not a base; the column then hangs on the others
    const h = buildScaffoldModel(st, [], [], { fixings: [{ id: 'S2', name: 'H', parts: [lowest.part.id], at: 0, dirs: ['x', 'y'], support: {} }] });
    expect(h.bases).toHaveLength(auto.bases.length - 1);
    const f = h.fixings.find((q) => q.id === 'S2')!;
    expect(f.sups.map((q) => q.dir)).toEqual(['x', 'y']);
  });

  it('notional horizontal load: per bay 2.5 % of its service load, at least 0.3 kN (EN 12811-1, 6.2.3)', () => {
    const m = buildScaffoldModel(tower());
    const sumX = (p: number) => {
      const lc = buildLoadCases(m, { ...DEFAULT_ANALYSIS, outdoor: false, p, level: 0 });
      const w = lc.notional([1, 0, 0]);
      let x = 0;
      for (let n = 0; n < m.frame.nodes.length; n++) x += w.nodal[n * 6];
      return { x, Q: lc.totalQ, bays: new Set(m.decks.filter((d) => d.level === 0).map((d) => d.bay)).size };
    };
    // two bays of 2 × 2 m with 2 kN/m²: 2.5 % of 8 kN is below 0.3 kN in each
    const a = sumX(2000);
    expect(a.bays).toBe(2);
    expect(a.Q).toBeGreaterThan(15000);
    expect(a.Q).toBeLessThan(16100);
    expect(a.x).toBeCloseTo(2 * 300, 6);
    // 6 kN/m²: 2.5 % of 24 kN per bay
    const b = sumX(6000);
    expect(b.x).toBeCloseTo(0.025 * b.Q, 6);
  });

  it('toe boards are in the wind by their face', () => {
    const m = buildScaffoldModel(tower());
    const opt = { ...DEFAULT_ANALYSIS, outdoor: true, qMax: 800 };
    const sumX = (mm: typeof m) => {
      const w = buildLoadCases(mm, opt).wind([1, 0, 0], 0);
      let x = 0;
      for (const l of w.member) {
        const fm = mm.frame.members[l.m];
        x += l.q[0] * Math.hypot(...[0, 1, 2].map((i) => mm.frame.nodes[fm.j][i] - mm.frame.nodes[fm.i][i]));
      }
      for (let n = 0; n < mm.frame.nodes.length; n++) x += w.nodal[n * 6];
      return x;
    };
    const base = sumX(m);
    const withPlate = { ...m, plates: [...m.plates, { node: 0, ax: 1, ay: 0.5 }] };
    expect(sumX(withPlate) - base).toBeCloseTo(opt.cf * 1, 6);
  });
});

describe('ledger diagonals UBL', () => {
  // UBL-2 200/200 in both bays of the planes y = 0 and y = 2, from the lower to the upper ledgers
  const ubl = (p: TestPart[]) => {
    for (const ay of [0, 2]) for (const ax of [0, 2]) p.push({ art: 'UBL', rot: 'x', t: [ax + 0.125, ay, 0.25] });
  };

  it('on both sides of the same ledgers at the same place: the ledgers stay continuous (no mechanism)', () => {
    // a second diagonal 5 cm on the other side of the ledgers, attached at the same points (as in a
    // stack of bays, where the diagonals of two bays meet on one ledger from both sides)
    const crossed = (p: TestPart[]) => {
      ubl(p);
      for (const ay of [0, 2]) for (const ax of [0, 2]) p.push({ art: 'UBL', rot: 'x', t: [ax + 0.125, ay - 0.1, 0.25] });
    };
    const m = buildScaffoldModel(tower(crossed));
    expect(m.members.filter((x) => x.kind === 'ubl')).toHaveLength(8);
    for (const c of m.carriers.filter((q) => q.kind === 'ledger')) {
      const ms = c.members.map((k) => m.frame.members[k]);
      for (let i = 1; i < ms.length; i++) expect(ms[i].i).toBe(ms[i - 1].j);
    }
    const r = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, outdoor: true, qMax: 600 });
    expect(r.checks.filter((c) => c.check === 'unstable')).toHaveLength(0);
  });

  it('fixed to the two ledgers 12.5 cm from the standards; their connections get the spring c_z', () => {
    const m = buildScaffoldModel(tower(ubl));
    const ks = m.members.map((x, k) => (x.kind === 'ubl' ? k : -1)).filter((k) => k >= 0);
    expect(ks).toHaveLength(4);
    expect(m.notes.find((n) => n.key === 'ublNoLedger')).toBeUndefined();
    for (const k of ks) {
      const f = m.frame.members[k];
      // nodes on the ledger axes (shared by diagonals on both sides), not on the standards: 12.5 cm
      // from the axes; the diagonal 1.4 cm beside the ledger axis (rigid arms of the diagonal)
      expect(m.nodeColumn[f.i]).toBe(-1);
      expect(m.nodeColumn[f.j]).toBe(-1);
      const [a, b] = [m.frame.nodes[f.i], m.frame.nodes[f.j]].sort((p, q) => p[2] - q[2]);
      expect(a[0] % 2).toBeCloseTo(0.125, 6);
      expect(b[0] % 2).toBeCloseTo(1.875, 6);
      expect(Math.abs(a[1] - Math.round(a[1]))).toBeCloseTo(0, 6);
      for (const e of f.ends!) expect(Math.hypot(...e!.offset!)).toBeCloseTo(0.014, 6);
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
            // rosette 6 mm (variant 2a): 8 kN/mm in tension at the start
            expect(cz).toBeCloseTo(8e6, 0);
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
  it('horizontal loads of the user act in the combinations of their axis with the sign of the combination', () => {
    const st = tower(braced);
    const std = st.parts.filter((w) => w.cls.kind === 'standard' && w.min[2] > 1).slice(0, 2);
    const H: UserLoad = { id: 'H', name: 'hoist', case: 'Q', kind: 'point', value: 4000, at: 0.5, parts: std.map((w) => w.part.id), dir: 'x' };
    const opt = { ...DEFAULT_ANALYSIS, outdoor: false, keep: true, secondOrder: false };
    const sumRx = (withLoad: boolean, name: string) => {
      const m = buildScaffoldModel(st, withLoad ? [H] : []);
      const c = analyzeScaffoldModel(m, opt).combos.find((x) => x.name === name)!;
      return m.bases.reduce((s, b) => s + c.reactions![b.sup], 0);
    };
    // 2 standards × 4 kN × γ 1.5, against the direction of the combination's x
    expect(sumRx(true, 'A +x') - sumRx(false, 'A +x')).toBeCloseTo(-12000, -1);
    expect(sumRx(true, 'A −x') - sumRx(false, 'A −x')).toBeCloseTo(12000, -1);
    expect(sumRx(true, 'A +y') - sumRx(false, 'A +y')).toBeCloseTo(0, -1);
  });

  it('bow imperfections of the standards (L_el/250, L_tot/500) raise the bending of the standards', () => {
    const m = buildScaffoldModel(tower(braced));
    const opt = { ...DEFAULT_ANALYSIS, outdoor: false, p: 6000 };
    // mean of the governing moments of the standards
    const tube = (r: ReturnType<typeof analyzeScaffoldModel>) => {
      const t = r.checks.filter((c) => c.check === 'tube');
      return t.reduce((a, c) => a + (c.M ?? 0), 0) / t.length;
    };
    const withBows = tube(analyzeScaffoldModel(m, opt));
    const without = tube(analyzeScaffoldModel(m, { ...opt, bows: false }));
    expect(withBows).toBeGreaterThan(without * 1.03);
  });

  it('as PERI ForceControl: a base lifted off holds nothing; standard joints carry no tension', () => {
    const m = buildScaffoldModel(tower(braced));
    const opt = { ...DEFAULT_ANALYSIS, outdoor: true, qMax: 2500, keep: true };
    const r = analyzeScaffoldModel(m, opt);
    let lifted = 0;
    for (const c of r.combos)
      for (const b of m.bases)
        if (c.reactions![b.sup + 2] === 0) {
          lifted++;
          expect(c.reactions![b.sup]).toBe(0);
          expect(c.reactions![b.sup + 1]).toBe(0);
        }
    expect(lifted).toBeGreaterThan(0);
    // joints opening under tension make the scaffold softer than joints carrying tension
    const t = analyzeScaffoldModel(m, { ...opt, spliceNoTension: false });
    const dh = (x: typeof r) => Math.max(...x.combos.map((c) => c.dh));
    expect(dh(r)).toBeGreaterThanOrEqual(dh(t) - 1e-6);
  });

  it('base standard over a standard below (spindle pair through a platform): load goes on to it', () => {
    // standard of the tower at (0, 0) ends at 4.5 m; base standard 0.3 m above it (a platform), 1.5 cm off
    const st = tower((p) => {
      p.push({ art: 'UVB', rot: 'y', t: [0.08 + 0.015, -0.08, 4.8] });
      p.push({ art: 'UVR', rot: 'y', t: [0.08 + 0.015, -0.08, 5.04] });
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

  it('standard on a standard with a base jack: clamped in the upper standard, hinged at its plate', () => {
    // lower standard ends at 4.5 m; base jack with its plate at 4.8 m, 40 cm in the base standard from 5.2 m
    const st = tower((p) => {
      p.push({ art: 'UJB', rot: 'x', t: [-0.075, -0.075, 4.8] });
      p.push({ art: 'UVB', rot: 'y', t: [0.08, -0.08, 5.2] });
      p.push({ art: 'UVR', rot: 'y', t: [0.08, -0.08, 5.44] });
    });
    const m = buildScaffoldModel(st);
    expect(m.notes.find((n) => n.key === 'columnOnColumn')?.parts.length).toBe(1);
    const jacks = m.members.map((x, k) => ({ x, f: m.frame.members[k] })).filter((q) => q.x.kind === 'jack');
    expect(jacks).toHaveLength(2);
    const z = (n: number) => m.frame.nodes[n][2];
    const spindle = jacks.find((q) => !q.x.link)!;
    const stub = jacks.find((q) => q.x.link)!;
    // spindle from the bottom of the upper standard (5.2) to its plate (4.8), without hinges
    expect([z(spindle.f.i), z(spindle.f.j)]).toEqual([5.2, 4.8]);
    expect(spindle.f.ends).toBeUndefined();
    // from the top of the lower standard (4.5) to the plate, hinged there
    expect(z(stub.f.i)).toBeCloseTo(4.5, 6);
    expect(stub.f.j).toBe(spindle.f.j);
    expect(stub.f.ends![1]!.k!.slice(4)).toEqual([0, 0]);
    // the upper standard runs on into its spindle (no hinge at its bottom)
    const first = m.frame.members.findIndex((f, k) => m.members[k].kind === 'standard' && f.i === spindle.f.i);
    expect(m.frame.members[first].ends?.[0]?.k).toBeUndefined();
    const r = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, outdoor: false });
    expect(r.combos.every((c) => c.ok && !c.stability)).toBe(true);
  });

  it('standards over standards: under 40 cm gap a platform (load through), from 40 cm a beam of the structure', () => {
    // lower standard of the tower ends at 4.5 m; base jack with its plate `gap` above, 40 cm in the base standard
    const stack = (gap: number) =>
      buildScaffoldModel(
        tower((p) => {
          p.push({ art: 'UJB', rot: 'x', t: [-0.075, -0.075, 4.5 + gap] });
          p.push({ art: 'UVB', rot: 'y', t: [0.08, -0.08, 4.9 + gap] });
          p.push({ art: 'UVR', rot: 'y', t: [0.08, -0.08, 5.14 + gap] });
        }),
      );
    const platform = stack(0.3);
    expect(platform.notes.find((n) => n.key === 'columnOnColumn')?.parts.length).toBe(1);
    expect(platform.notes.find((n) => n.key === 'columnOnBeam')).toBeUndefined();
    expect(platform.members.filter((x) => x.link)).toHaveLength(1);
    expect(platform.bases).toHaveLength(6);
    const beam = stack(0.5);
    expect(beam.notes.find((n) => n.key === 'columnOnBeam')?.parts.length).toBe(1);
    expect(beam.notes.find((n) => n.key === 'columnOnColumn')).toBeUndefined();
    expect(beam.members.filter((x) => x.link)).toHaveLength(0);
    // the upper standard stands on the beam with its spindle: a seventh support at the plate
    expect(beam.bases).toHaveLength(7);
    const top = beam.bases.map((b) => beam.frame.nodes[b.node][2]).sort((x, y) => y - x)[0];
    expect(top).toBeCloseTo(5.0, 6);
    expect(beam.members.filter((x) => x.kind === 'jack')).toHaveLength(1);
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

  it('stability lost with the second order: the zone is reported, the combination goes on in first order', () => {
    // the unbraced tower under a load far beyond what its standards carry
    const m = buildScaffoldModel(tower());
    const opt = { ...DEFAULT_ANALYSIS, outdoor: false, p: 150e3 };
    const r = analyzeScaffoldModel(m, opt);
    expect(r.combos.every((c) => c.ok)).toBe(true);
    const lost = r.combos.filter((c) => c.stability);
    expect(lost.length).toBeGreaterThan(0);
    expect(lost[0].stability!.length).toBeGreaterThan(0);
    const st = r.checks.filter((c) => c.check === 'stability');
    expect(st.length).toBeGreaterThan(0);
    expect(st.every((c) => c.eta > 1)).toBe(true);
    // standards of the zone with their compression against the Euler load
    expect(st.some((c) => /N_cr/.test(c.detail ?? ''))).toBe(true);
    // without the second order nothing is lost
    const r1 = analyzeScaffoldModel(m, { ...opt, secondOrder: false });
    expect(r1.combos.some((c) => c.stability)).toBe(false);
    // under the normal load neither
    expect(analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, outdoor: false }).combos.some((c) => c.stability)).toBe(false);
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

describe('suspended scaffolds: girders lying flat, struts with jacks, secured joints', () => {
  /** the tower with a ULS 50/425 lying flat at +1.0 m beside the standards of y = 0 (chords at y 0.12
   * and 0.57) and a tube across it at x = 1 with a jack in its end at the building (y < 0) */
  const doc = () => {
    const d = parsePeriCadDxf(periDxf(towerParts()), 'tower.dxf');
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    const at = (x: number, y: number, z: number) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
    d.parts.push(
      { id: 'G1', article: '100330', name: 'ULS 50/425', desc: '', layer: '0', m: I, geom: { lines: [[[-0.125, 0.12, 1], [4.125, 0.12, 1]], [[-0.125, 0.57, 1], [4.125, 0.57, 1]], [[-0.125, 0.12, 1], [-0.125, 0.57, 1]], [[4.125, 0.12, 1], [4.125, 0.57, 1]]], rosettes: [] } },
      { id: 'T1', article: '026412', name: 'TUBE 2m', desc: '', layer: '0', m: I, geom: { lines: [[[1, 0.8, 1.05], [1, -1.2, 1.05]]], rosettes: [] } },
      { id: 'C1', article: '017020', name: 'RA 48/48', desc: '', layer: '0', m: at(1, 0.12, 1.02), geom: { lines: [], rosettes: [] } },
      { id: 'C2', article: '017020', name: 'RA 48/48', desc: '', layer: '0', m: at(1, 0.57, 1.02), geom: { lines: [], rosettes: [] } },
      { id: 'J1', article: '100159', name: 'UJS 38-80/55', desc: '', layer: '0', m: I, geom: { lines: [[[1, -1.3, 1.05], [1, -1.3, 1.05]]], rosettes: [] } },
    );
    return d;
  };

  it('a girder lying flat is held at the standards its chords are coupled to', () => {
    const st = analyzeScaffold(doc());
    const g = st.girders.find((q) => q.parts.includes('G1'))!;
    expect(g.flat?.width).toBeCloseTo(0.45, 6);
    expect(g.supportsAssumed).toBe(false);
    expect(g.flat!.cols.map((c) => [c.x, c.y])).toEqual([[0, 0], [2, 0], [4, 0]].map(([x, y]) => [expect.closeTo(x, 2), expect.closeTo(y, 2)]));
    const m = buildScaffoldModel(st);
    const car = m.carriers.find((c) => c.part === 'G1');
    expect(car).toBeDefined();
  });

  it('a tube with a jack in its end is a strut, coupled to the chords of the flat girder', () => {
    const st = analyzeScaffold(doc());
    const a = st.anchors.find((q) => q.id === 'T1')!;
    expect(a.strut).toBe(true);
    expect(a.atStructure[1]).toBeCloseTo(-1.3, 6);
    expect(a.girderAt?.length).toBe(2);
    const m = buildScaffoldModel(st);
    const an = m.anchors.find((q) => q.part === 'T1')!;
    expect(an.strut).toBeDefined();
    // the tube hangs on the girder: its couplers at both chords of one section, a link to the node of
    // the girder axis there
    expect(an.links).toHaveLength(1);
    // chosen as an anchor by the user it pulls too
    const st2 = analyzeScaffold(doc(), { tol: 0.05, anchorRoles: { T1: 'anchor' } });
    expect(st2.anchors.find((q) => q.id === 'T1')?.strut).toBe(false);
  });

  it('hanging from the top: the joints of the standards carry tension', () => {
    const st = tower();
    const tops = st.columns.filter((c) => c.z1 > 4).map((c) => st.parts.filter((w) => c.parts.includes(w.part.id)).sort((p, q) => q.max[2] - p.max[2])[0].part.id);
    const fixings = [{ id: 'H', name: 'H', parts: tops, at: 1, dirs: ['x', 'y', 'z'] as ('x' | 'y' | 'z')[], support: {} }];
    const m = buildScaffoldModel(st, [], [], { supportsManual: true, fixings });
    expect(m.suspended).toBe(true);
    const opt = { ...DEFAULT_ANALYSIS, outdoor: false, keep: true };
    const c = analyzeScaffoldModel(m, opt).combos[0];
    expect(c.ok).toBe(true);
    // a joint in tension (the standards below hang on it), closed: the bottom of an outer standard
    // hangs on the joints, not on the ledgers
    expect(m.members.some((q, k) => q.joint && (c.members?.[k]?.N ?? 0) > 100)).toBe(true);
    const open = analyzeScaffoldModel({ ...m, suspended: false }, opt).combos[0];
    const foot = m.frame.nodes.findIndex((p) => Math.hypot(p[0], p[1] - 2) < 0.01 && p[2] < 0.2);
    expect(Math.abs(c.u![foot * 6 + 2])).toBeLessThan(0.3 * Math.abs(open.u![foot * 6 + 2]));
  });
});

describe('rosette and joint in tension (approval 3.2.5, 3.2.6, 3.2.8.4)', () => {
  it('tension of the rosette from a ledger connection (table 22, lever arms of table 23)', () => {
    const kNcm = 10;
    // UH Plus: e_o 6, e_u 5, e_Ri 3.5 cm. Tension 10 kN with M_y = +60 kNcm (> e_Ri·N = 35): top
    expect(rosetteTension('PLUS', 10e3, 60 * kNcm) / 1e3).toBeCloseTo(10 * (1 - 3.5 / 6) + 60 / 6, 6);
    // M_y ≤ e_Ri·N: bottom
    expect(rosetteTension('PLUS', 10e3, -40 * kNcm) / 1e3).toBeCloseTo(10 * (1 + 3.5 / 5) + 40 / 5, 6);
    // compression −10 kN: tension only by a moment beyond the lever arms
    expect(rosetteTension('PLUS', -10e3, -100 * kNcm) / 1e3).toBeCloseTo(-10 * (1 + 3.5 / 5) + 100 / 5, 6);
    expect(rosetteTension('PLUS', -10e3, 100 * kNcm) / 1e3).toBeCloseTo(-10 * (1 - 3.5 / 6) + 100 / 6, 6);
    expect(rosetteTension('PLUS', -10e3, 10 * kNcm)).toBe(0);
    // UH: e_o 5 cm
    expect(rosetteTension('UH', 0, 50 * kNcm) / 1e3).toBeCloseTo(50 / 5, 6);
    // basic values and ω of table 24
    expect(rosetteBase('1a')).toMatchObject({ N: 90e3, V: 33e3, sum: 3 });
    expect(rosetteBase('2c')).toMatchObject({ N: 50e3, V: 40e3, sum: 2.5 });
    expect(oppositeOmega('PLUS', '1b')).toEqual([0.14, 0.1]);
    expect(oppositeOmega('PLUS', '2a')).toEqual([0.42, 0.39]);
    expect(oppositeOmega('UH', '2c')).toEqual([0.08, 0.08]);
  });

  it('the rosettes of a scaffold are checked; a joint in tension by table 26 and Gl. 23', () => {
    const st = tower(braced);
    const r = analyzeScaffoldModel(buildScaffoldModel(st), { ...DEFAULT_ANALYSIS, outdoor: true, qMax: 800 });
    const ros = r.checks.filter((c) => c.check === 'rosette');
    expect(ros.length).toBeGreaterThan(0);
    expect(ros.every((c) => c.eta > 0 && /Gl\. (15|16|17|18|19|20|21|22)/.test(c.detail ?? ''))).toBe(true);
    // hanging from the top: joints in tension
    const tops = st.columns.filter((c) => c.z1 > 4).map((c) => st.parts.filter((w) => c.parts.includes(w.part.id)).sort((p, q) => q.max[2] - p.max[2])[0].part.id);
    const fixings = [{ id: 'H', name: 'H', parts: tops, at: 1, dirs: ['x', 'y', 'z'] as ('x' | 'y' | 'z')[], support: {} }];
    const h = analyzeScaffoldModel(buildScaffoldModel(st, [], [], { supportsManual: true, fixings }), { ...DEFAULT_ANALYSIS, outdoor: false });
    const j = h.checks.filter((c) => c.check === 'joint' && (c.N ?? 0) > 0);
    expect(j.length).toBeGreaterThan(0);
    for (const c of j) expect(c.eta).toBeGreaterThanOrEqual(c.N! / JOINT_TENSION.t32 + (c.M ?? 0) / JOINT.MRd - 1e-9);
    expect(JOINT_TENSION.t32).toBe(47e3);
  });
});
