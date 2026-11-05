import { describe, expect, it } from 'vitest';
import { emptyLoad, frameSolver, MEMBER_SAMPLES } from './frame2d';
import { testModel } from './testutil';
import { pointLoad, udl } from './defaults';
import { analyze } from './analysis';
import { analyzeLattice, latticeEnvelope, latticeView } from './lattice';
import { runChecks } from './checks';
import { computeView } from './results';
import { periMaterial } from '../sections/peri';
import { defaultFlexElements, flexLength, latticeModel } from '../sections/lattice';
import { applyLatticeLayout } from './latticeLayout';
import type { Load, PeriProductId } from './types';

const kN = 1e3;

describe('plane frame', () => {
  it('cantilever: tip load P → M = P·L at the clamp, deflection P·L³/(3EI)', () => {
    const EI = 2e6;
    const s = frameSolver(
      [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }],
      [
        { i: 0, j: 1, EA: 1e9, EI, hinged: false },
        { i: 1, j: 2, EA: 1e9, EI, hinged: false },
      ],
      [{ node: 0, dof: 0 }, { node: 0, dof: 1 }, { node: 0, dof: 2 }],
    );
    const l = emptyLoad(3);
    l.F[3 * 2 + 1] = -1000;
    const r = s.solve(l);
    expect(r.d[3 * 2 + 1]).toBeCloseTo(-(1000 * 8) / (3 * EI), 9);
    // hogging at the clamp: −P·L
    expect(r.M[0]).toBeCloseTo(-2000, 6);
    expect(r.R[1]).toBeCloseTo(1000, 6);
    expect(r.R[2]).toBeCloseTo(2000, 6);
  });

  it('simple beam with a line load: M = qL²/8, truss member: axial force only', () => {
    const s = frameSolver(
      [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 2, z: 1 }],
      [
        { i: 0, j: 1, EA: 1e9, EI: 1e6, hinged: false },
        { i: 0, j: 2, EA: 1e9, EI: 0, hinged: true },
        { i: 2, j: 1, EA: 1e9, EI: 0, hinged: true },
      ],
      [{ node: 0, dof: 0 }, { node: 0, dof: 1 }, { node: 1, dof: 1 }],
    );
    const l = emptyLoad(3);
    l.F[3 * 2 + 1] = -2000;
    const r = s.solve(l);
    // two-bar truss on the beam as tie: diagonals in compression, tie in tension
    const Nd = -1000 / Math.sin(Math.atan2(1, 2));
    expect(r.N[1]).toBeCloseTo(Nd, 3);
    expect(r.N[2]).toBeCloseTo(Nd, 3);
    expect(r.N[0]).toBeCloseTo(2000, 3);
    // tie loaded by end forces only: no bending
    expect(Math.abs(r.M[Math.floor(MEMBER_SAMPLES / 2)])).toBeLessThan(1e-6);
  });
});

describe('lattice geometry', () => {
  it('ULA 50/425 HD: system points 125 mm inside, nodes every 0.5 m alternating, end posts', () => {
    const lm = latticeModel('ULA50HD', 4.25, { eccentric: false });
    const diags = lm.members.filter((m) => m.role === 'diag');
    expect(diags).toHaveLength(8);
    expect(lm.members.filter((m) => m.role === 'post').map((m) => lm.nodes[m.i].x)).toEqual([0.04, 4.21]);
    // first diagonal from the top chord at the system point to the bottom chord 0.5 m further
    const d0 = diags[0];
    expect([lm.nodes[d0.i].x, lm.nodes[d0.i].z, lm.nodes[d0.j].x, lm.nodes[d0.j].z]).toEqual([0.125, 0.5, 0.625, 0]);
    expect(lm.mass).toBeCloseTo(18.4 / 4.25, 6);
  });

  it('eccentric nodes: diagonals 65 mm apart at the chord', () => {
    const lm = latticeModel('ULS50', 4.25, { eccentric: true });
    const d0 = lm.members.find((m) => m.role === 'diag')!;
    expect(lm.nodes[d0.i].x).toBeCloseTo(0.125 + 0.0325, 9);
  });

  it('ULS Flex: elements, connectors, default element choice', () => {
    expect(defaultFlexElements(3)).toEqual([1, 1]);
    expect(defaultFlexElements(3.25)).toEqual([1, 1.25]);
    expect(defaultFlexElements(5.5)).toEqual([1, 1, 1.25, 1.25]);
    expect(flexLength([1.5, 1.5])).toBe(4);
    const lm = latticeModel('ULSFLEX', 4, { flex: [1.5, 1.5] });
    expect(lm.members.filter((m) => m.role === 'conn').map((m) => lm.nodes[m.i].x)).toEqual([0.5, 2, 3.5]);
    expect(lm.members.filter((m) => m.role === 'vert')).toHaveLength(8);
    expect(lm.members.filter((m) => m.role === 'diag')).toHaveLength(8);
    expect(lm.restraints[1]).toEqual([0, 0.5, 2, 3.5, 4]);
  });
});

function girder(product: PeriProductId, L: number, sups: [number, number], loads: Load[], cfg: object = {}) {
  return testModel(L, [['pinned', sups[0]], ['roller', sups[1]]], loads, {
    edit: (m) => {
      m.segments[0].section = { kind: 'peri', product, lattice: cfg };
      m.segments[0].material = periMaterial(product);
    },
  });
}

function maxEta(product: PeriProductId, L: number, sups: [number, number], loads: Load[], cfg: object = {}) {
  const m = girder(product, L, sups, loads, cfg);
  const an = analyze(m);
  expect(an.ok).toBe(true);
  const la = analyzeLattice(an)!;
  const env = latticeEnvelope(an, la, m.combinations.filter((c) => c.type === 'ULS'), [], undefined);
  return Math.max(...env.members.map((d) => d.eta));
}

describe('lattice design against the PERI tables (Tabellenbuch PERI UP, S. 50–57)', () => {
  // permissible single load at midspan, lateral restraints every 1.00 m, 1.5·G + 1.5·Q: η ≈ 1
  const table: [PeriProductId, number, number, number][] = [
    ['ULA50HD', 6.25, 6, 13.1],
    ['ULA50HD', 4.25, 4, 16.3],
    ['ULA70HD', 8.25, 8, 13.2],
    ['ULS50', 4.25, 4, 30.7],
    ['ULS50', 6.25, 6, 23.2],
    ['ULS70', 8.25, 8, 22.5],
  ];
  it.each(table)('%s %s m, span %s m, zul F = %s kN', (p, L, span, F) => {
    const o = (L - span) / 2;
    // the PERI tables agree with centric nodes
    const eta = maxEta(p, L, [o, o + span], [pointLoad('Q', L / 2, F)], { restraint: 1, eccentric: false });
    expect(eta).toBeGreaterThan(0.8);
    expect(eta).toBeLessThan(1.06);
  });

  it('larger restraint spacing (out-of-plane buckling L_cr = a): on the safe side of the table', () => {
    expect(maxEta('ULA50HD', 6.25, [0.125, 6.125], [pointLoad('Q', 3.125, 11.5)], { restraint: 1.5, eccentric: false })).toBeGreaterThan(1);
  });

  it.each([
    [1, 8, 27.5],
    [1.25, 6, 20],
    [1.5, 5, 15],
  ])('ULS Flex with elements %s m: max M of the table (%s elements, M = %s kNm)', (e, k, M) => {
    const L = 1 + k * e;
    const q = (8 * M) / (L * L);
    const m = girder('ULSFLEX', L, [0, L], [udl('Q', 0, L, q)], { flex: Array(k).fill(e) });
    m.settings.selfWeight = false;
    const an = analyze(m);
    const la = analyzeLattice(an)!;
    const env = latticeEnvelope(an, la, m.combinations.filter((c) => c.type === 'ULS'), [], undefined);
    const eta = Math.max(...env.members.map((d) => d.eta));
    expect(eta).toBeGreaterThan(0.85);
    expect(eta).toBeLessThan(1.06);
  });
});

describe('lattice checks in runChecks', () => {
  it('items per member group, bearings, diagram data, deflection of the member model', () => {
    const m = girder('ULA50HD', 6.25, [0.125, 6.125], [pointLoad('G', 3.125, 2), pointLoad('Q', 3.125, 8)]);
    const an = analyze(m);
    const c = runChecks(an, computeView(an, { type: 'envelope' })!)!;
    const p = c.peri.find((x) => x.method === 'lattice')!;
    expect(p.items.map((i) => i.key)).toEqual(['top', 'bottom', 'diag', 'post', 'bearing', 'bearing', 'bearing', 'bearing']);
    expect(p.lattice!.members.length).toBeGreaterThan(30);
    expect(p.items.find((i) => i.key === 'bearing')!.bearing).toBe('NK');
    // support force of the two couplers of a support: half of 1.5·(2 + 8) kN (self weight off), shared by both chords
    const b = p.items.filter((i) => i.key === 'bearing' && Math.abs(i.x - 0.125) < 1e-9);
    expect(b.map((i) => i.chord).sort()).toEqual([0, 1]);
    expect(b[0].Ed + b[1].Ed).toBeCloseTo(7.5 * kN, -1);
    expect(Math.min(b[0].Ed, b[1].Ed)).toBeGreaterThan(2 * kN);
    expect(c.deflectionLattice).toBe(true);
    expect(c.deflection.find((d) => d.span.kind === 'span')!.w).toBeGreaterThan(0);
  });

  it('pattern loading over two spans: all variants are evaluated', () => {
    const m = girder('ULSFLEX', 6, [0, 6], [udl('Q', 0, 6, 2)], { flex: [1, 1, 1, 1, 1] });
    m.supports.push({ ...m.supports[1], id: 'mid', x: 3 });
    m.settings.patternLoading = true;
    const an = analyze(m);
    const c = runChecks(an, computeView(an, { type: 'envelope' })!)!;
    const nUls = m.combinations.filter((k) => k.type === 'ULS').length;
    expect(c.peri[0].lattice!.variants).toBe(4 * nUls);
  });
});

describe('member forces for the displayed result', () => {
  it('load case: single values; envelope: max ≥ min, reactions balance the load', () => {
    const m = girder('ULS50', 4.25, [0.125, 4.125], [pointLoad('Q', 2.125, 10)]);
    m.settings.selfWeight = false;
    const an = analyze(m);
    const la = analyzeLattice(an)!;
    const c = latticeView(an, la, { type: 'case', id: 'Q' })!;
    expect(c.kind).toBe('single');
    let Rz = 0;
    for (let i = 1; i < c.Rmax.length; i += 3) Rz += c.Rmax[i];
    expect(Rz).toBeCloseTo(10 * kN, 3);
    const e = latticeView(an, la, { type: 'envelope' })!;
    for (let k = 0; k < e.Nmax.length; k++) expect(e.Nmax[k]).toBeGreaterThanOrEqual(e.Nmin[k]);
  });
});

describe('lattice layout', () => {
  it('ULS Flex: catalogue length → elements; elements → length; supports follow ends and connectors', () => {
    const m = girder('ULSFLEX', 3, [0, 3], [pointLoad('Q', 3, 5)], { flex: [1, 1] });
    m.supports.push({ ...m.supports[1], id: 'c', x: 1.5 });
    applyLatticeLayout(m, { L: 7.75 });
    expect(m.L).toBe(7.75);
    const s0 = m.segments[0].section;
    expect(s0.kind === 'peri' && s0.lattice?.flex).toEqual(defaultFlexElements(7.75));
    expect(m.supports.map((s) => s.x).sort((a, b) => a - b)).toEqual([0, 1.5, 7.75]);
    expect(m.loads[0].kind === 'point' && m.loads[0].x).toBe(7.75);
    applyLatticeLayout(m, { flex: [1.5, 1.5, 1.5] });
    expect(m.L).toBe(5.5);
    // support at the 2nd connector (1.5 m) moves to the 2nd connector of the new elements (2.0 m)
    expect(m.supports.map((s) => s.x).sort((a, b) => a - b)).toEqual([0, 2, 5.5]);
    expect(m.segments[0].x2).toBe(5.5);
  });

  it('ULA: catalogue length moves the support at the far system point', () => {
    const m = girder('ULA50HD', 4.25, [0.125, 4.125], []);
    applyLatticeLayout(m, { L: 6.25 });
    expect(m.supports.map((s) => s.x)).toEqual([0.125, 6.125]);
  });
});

describe('couplers as in the PERI RSTAB model (ULS 50, 6.25 m, standards at 0.625 / 4.625 m, 10 kN at 5.125 m)', () => {
  it('standard between the couplers, elastic couplers: both couplers carry the support force', () => {
    const m = girder('ULS50', 6.25, [0.625, 4.625], [pointLoad('G', 5.125, 10)]);
    m.settings.selfWeight = true;
    const an = analyze(m);
    const la = analyzeLattice(an)!;
    const r = latticeView(an, la, { type: 'case', id: 'G' })!;
    const R = (si: number, c: 0 | 1) => r.Rmax[3 * la.supports[si].nodes[c] + 1] / kN;
    // RSTAB: left 0.49 (top) / 0.52 (bottom) kN hold-down, right 5.70 / 5.97 kN
    expect(R(0, 1)).toBeCloseTo(-0.49, 1);
    expect(R(0, 0)).toBeCloseTo(-0.52, 1);
    expect(R(1, 1)).toBeCloseTo(5.7, 1);
    expect(R(1, 0)).toBeCloseTo(5.97, 1);
    // top chord over the right standard: RSTAB 10.04 kN
    const k = la.model.members.findIndex((mm) => mm.role === 'top' && Math.abs(la.model.nodes[mm.i].x - 4.625) < 1e-6);
    expect(r.Nmax[k] / kN).toBeCloseTo(10.04, 0);
  });
});

describe('supports and loads next to a node', () => {
  it('a standard 5 mm beside the node acts at the node (no chord stub carrying the support force in shear)', () => {
    const m = girder('ULS50', 6.25, [0.63, 4.63], [pointLoad('Q', 5.13, 10)], { eccentric: false });
    const an = analyze(m);
    const la = analyzeLattice(an)!;
    expect(la.model.nodes.some((n) => Math.abs(n.x - 4.63) < 1e-9)).toBe(false);
    expect(la.model.nodes[la.supports[1].nodes[0]].x).toBeCloseTo(4.625, 9);
    const r = latticeView(an, la, { type: 'envelope' })!;
    let V = 0;
    la.model.members.forEach((mm, k) => {
      if (mm.role === 'top' || mm.role === 'bottom') for (let s = 0; s < 5; s++) V = Math.max(V, Math.abs(r.Vmax[k * 5 + s]), Math.abs(r.Vmin[k * 5 + s]));
    });
    expect(V).toBeLessThan(1 * kN);
  });
});

describe('PERI RSTAB model ULS 70 (8.25 m, standards at 1.625 / 6.625 m, 15 kN at 3.125 m, self weight)', () => {
  it('diagonals, standards and chords agree with RSTAB (eccentric nodes)', () => {
    const m = girder('ULS70', 8.25, [1.625, 6.625], [pointLoad('G', 3.125, 15)]);
    m.settings.selfWeight = true;
    const an = analyze(m);
    const la = analyzeLattice(an)!;
    const r = latticeView(an, la, { type: 'case', id: 'G' })!;
    const lm = la.model;
    const by = (role: string) => lm.members.map((mm, k) => ({ mm, k })).filter(({ mm }) => mm.role === role).sort((a, b) => lm.nodes[a.mm.i].x - lm.nodes[b.mm.i].x).map(({ k }) => r.Nmax[k] / kN);
    const d = by('diag').slice(3, 13);
    // RSTAB: −14.58, 13.95, −12.52, −4.31, 5.73, −6.23, 6.35, −6.32, 6.26, −6.37 kN
    const rstab = [-14.58, 13.95, -12.52, -4.31, 5.73, -6.23, 6.35, -6.32, 6.26, -6.37];
    d.forEach((v, i) => expect(Math.abs(v - rstab[i])).toBeLessThan(1.1));
    // standards: RSTAB 6.83 / 2.88 kN
    const s = by('std');
    expect(s[0]).toBeCloseTo(6.83, 0);
    expect(s[1]).toBeCloseTo(2.88, 0);
  });
});
