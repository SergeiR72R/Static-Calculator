import { describe, expect, it } from 'vitest';
import { Frame3, FrameError3, emptyLoads3, sectionForces, type FrameModel3, type Section3 } from './frame3d';
import { SparseSym, minimumDegreeOrder } from './sparse';

const E = 210e9;
const G = 81e9;
// tube Ø48.3 × 3.2
const tube: Section3 = { EA: E * 4.53e-4, EIy: E * 11.59e-8, EIz: E * 11.59e-8, GJ: G * 23.18e-8 };
// RHS 60 × 30 × 2 (strong axis y)
const rhs: Section3 = { EA: E * 3.34e-4, EIy: E * 15.05e-8, EIz: E * 5.08e-8, GJ: G * 12.3e-8 };
const fix = (node: number) => [0, 1, 2, 3, 4, 5].map((dof) => ({ node, dof, k: Infinity }));

describe('sparse Cholesky', () => {
  it('solves a random sparse SPD system with a minimum-degree ordering', () => {
    const n = 60;
    const edges: [number, number][] = [];
    for (let i = 0; i < n; i++) for (const j of [i + 1, i + 7, i + 13]) if (j < n) edges.push([i, j]);
    const order = minimumDegreeOrder(n, edges);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
    const K = new SparseSym(n, order, Int32Array.from(edges.flat()));
    const A = Array.from({ length: n }, () => new Float64Array(n));
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
    for (const [i, j] of edges) {
      const v = rnd();
      A[i][j] = A[j][i] = v;
      K.cx[K.index(i, j)] = v;
    }
    for (let i = 0; i < n; i++) {
      A[i][i] = 4;
      K.cx[K.diag(i)] = 4;
    }
    expect(K.factor()).toBe(-1);
    const x0 = Float64Array.from({ length: n }, (_, i) => Math.sin(i));
    const b = new Float64Array(n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) b[i] += A[i][j] * x0[j];
    const x = K.solve(b);
    for (let i = 0; i < n; i++) expect(x[i]).toBeCloseTo(x0[i], 10);
  });

  it('reports the unknown at which the matrix is not positive definite', () => {
    const K = new SparseSym(3, Int32Array.from([0, 1, 2]), Int32Array.from([0, 1, 1, 2]));
    K.cx[K.diag(0)] = 1;
    K.cx[K.diag(1)] = 1;
    K.cx[K.index(0, 1)] = -1;
    K.cx[K.diag(2)] = 1;
    expect(K.factor()).toBe(1);
  });
});

describe('space frame', () => {
  it('cantilever: deflections in both planes, torsion and axial', () => {
    const L = 2;
    const model: FrameModel3 = { nodes: [[0, 0, 0], [L, 0, 0]], members: [{ i: 0, j: 1, sec: rhs }], supports: fix(0) };
    const fr = new Frame3(model);
    const ld = emptyLoads3(model);
    ld.nodal.set([1000, 200, -300, 50, 0, 0], 6);
    const r = fr.solve(ld);
    expect(r.u[6]).toBeCloseTo((1000 * L) / rhs.EA, 7);
    // horizontal load bends about the weak (vertical) axis, vertical load about the strong axis
    expect(r.u[7]).toBeCloseTo((200 * L ** 3) / (3 * rhs.EIz), 6);
    expect(r.u[8]).toBeCloseTo((-300 * L ** 3) / (3 * rhs.EIy), 6);
    expect(r.u[9]).toBeCloseTo((50 * L) / rhs.GJ, 6);
    const m = r.members[0]!;
    expect(m.N).toBeCloseTo(1000, 3);
    const s0 = sectionForces(m, 0);
    // hogging at the support: My = Fz·L (z up, load down → tension on top)
    expect(Math.abs(s0.My)).toBeCloseTo(300 * L, 3);
    expect(Math.abs(s0.Mz)).toBeCloseTo(200 * L, 3);
    expect(sectionForces(m, L).My).toBeCloseTo(0, 3);
    // reactions balance the loads
    expect(r.reactions[0]).toBeCloseTo(-1000, 2);
    expect(r.reactions[2]).toBeCloseTo(300, 2);
  });

  it('vertical member: local axes, bending by a horizontal load', () => {
    const H = 3;
    const model: FrameModel3 = { nodes: [[0, 0, 0], [0, 0, H]], members: [{ i: 0, j: 1, sec: tube }], supports: fix(0) };
    const ld = emptyLoads3(model);
    ld.nodal.set([500, -200, -10000, 0, 0, 0], 6);
    const r = new Frame3(model).solve(ld);
    expect(r.u[6]).toBeCloseTo((500 * H ** 3) / (3 * tube.EIy), 6);
    expect(r.u[7]).toBeCloseTo((-200 * H ** 3) / (3 * tube.EIy), 6);
    expect(r.members[0]!.N).toBeCloseTo(-10000, 2);
  });

  it('uniform load on a beam with semi-rigid ends: end moment qL²/12 / (1 + 2EI/(kL))', () => {
    const L = 2;
    const q = 3000;
    const k = 171e3; // N·m/rad (UH Plus, initial)
    const model: FrameModel3 = {
      nodes: [[0, 0, 0], [L, 0, 0]],
      members: [{ i: 0, j: 1, sec: rhs, ends: [{ k: [Infinity, Infinity, Infinity, Infinity, k, Infinity] }, { k: [Infinity, Infinity, Infinity, Infinity, k, Infinity] }] }],
      supports: [...fix(0), ...fix(1)],
    };
    const ld = emptyLoads3(model);
    ld.member.push({ m: 0, q: [0, 0, -q] });
    const r = new Frame3(model).solve(ld);
    const m = r.members[0]!;
    const Mend = ((q * L * L) / 12) / (1 + (2 * rhs.EIy) / (k * L));
    expect(Math.abs(sectionForces(m, 0).My)).toBeCloseTo(Mend, 1);
    expect(Math.abs(sectionForces(m, L).My)).toBeCloseTo(Mend, 1);
    // midspan: qL²/8 − M_end, opposite sign
    expect(Math.abs(sectionForces(m, L / 2).My)).toBeCloseTo((q * L * L) / 8 - Mend, 1);
    expect(Math.sign(sectionForces(m, L / 2).My)).toBe(-Math.sign(sectionForces(m, 0).My));
    // rotation in the spring = M / k
    expect(Math.abs(m.di[4])).toBeCloseTo(Mend / k, 6);
    expect(Math.abs(sectionForces(m, 0).Vz)).toBeCloseTo((q * L) / 2, 2);
  });

  it('hinged ends: simple beam', () => {
    const L = 1.5;
    const q = 2000;
    const hinge = [Infinity, Infinity, Infinity, Infinity, 0, 0];
    const model: FrameModel3 = { nodes: [[0, 0, 0], [0, L, 0]], members: [{ i: 0, j: 1, sec: rhs, ends: [{ k: hinge }, { k: hinge }] }], supports: [...fix(0), ...fix(1)] };
    const ld = emptyLoads3(model);
    ld.member.push({ m: 0, q: [0, 0, -q] });
    const r = new Frame3(model).solve(ld);
    const m = r.members[0]!;
    expect(sectionForces(m, 0).My).toBeCloseTo(0, 3);
    expect(Math.abs(sectionForces(m, L / 2).My)).toBeCloseTo((q * L * L) / 8, 2);
  });

  it('rigid end offsets: eccentric connection gives a moment at the node', () => {
    // beam hangs 0.1 m beside a fixed post top; vertical load at its far end
    const model: FrameModel3 = {
      nodes: [[0, 0, 0], [1, 0, 0]],
      members: [{ i: 0, j: 1, sec: rhs, ends: [{ offset: [0, 0.1, 0] }, { offset: [0, 0.1, 0] }] }],
      supports: fix(0),
    };
    const ld = emptyLoads3(model);
    ld.nodal[6 + 2] = -1000;
    const r = new Frame3(model).solve(ld);
    // support moment about x from the eccentricity: 1000 · 0.1 … the load acts at the node (arm 0), the
    // member axis is 0.1 beside: torsion in the member = 1000 · 0.1
    expect(Math.abs(r.members[0]!.fi[3])).toBeCloseTo(100, 3);
    expect(r.reactions[2]).toBeCloseTo(1000, 3);
    expect(Math.abs(r.reactions[4])).toBeCloseTo(1000, 3);
  });

  it('second order: cantilever column with axial and lateral load (exact tan solution)', () => {
    const H = 4;
    const n = 8;
    const nodes = Array.from({ length: n + 1 }, (_, k) => [0, 0, (k * H) / n] as [number, number, number]);
    const model: FrameModel3 = { nodes, members: Array.from({ length: n }, (_, k) => ({ i: k, j: k + 1, sec: tube })), supports: fix(0) };
    const P = 2000;
    const Hl = 100;
    const fr = new Frame3(model);
    const ld = emptyLoads3(model);
    ld.nodal[n * 6] = Hl;
    ld.nodal[n * 6 + 2] = -P;
    const r1 = fr.solve(ld);
    const r2 = fr.solve(ld, r1.members.map((m) => ({ N: m!.N })));
    const u = H * Math.sqrt(P / tube.EIy);
    const exact = ((Hl * H ** 3) / (3 * tube.EIy)) * ((3 * (Math.tan(u) - u)) / u ** 3);
    expect(r1.u[n * 6]).toBeCloseTo((Hl * H ** 3) / (3 * tube.EIy), 6);
    expect(r2.u[n * 6] / exact).toBeCloseTo(1, 3);
    // above the buckling load the system is unstable
    const Pcr = (Math.PI ** 2 * tube.EIy) / (2 * H) ** 2;
    expect(() => fr.solve(ld, r1.members.map(() => ({ N: -1.05 * Pcr })))).toThrow(FrameError3);
    expect(() => fr.solve(ld, r1.members.map(() => ({ N: -0.95 * Pcr })))).not.toThrow();
  });

  it('truss members with slack and tension / compression stiffness; inactive members', () => {
    // braced bay 2 × 2 m: pinned posts, diagonal as truss
    const sec: Section3 = { EA: 2460e3, EIy: 1, EIz: 1, GJ: 1 };
    const model: FrameModel3 = {
      nodes: [[0, 0, 0], [2, 0, 0], [0, 0, 2], [2, 0, 2]],
      members: [
        { i: 0, j: 2, sec: tube, truss: true },
        { i: 1, j: 3, sec: tube, truss: true },
        { i: 2, j: 3, sec: tube, truss: true },
        { i: 0, j: 3, sec, truss: true },
      ],
      supports: [0, 1].flatMap((node) => [0, 1, 2].map((dof) => ({ node, dof, k: Infinity }))).concat([2, 3].map((node) => ({ node, dof: 1, k: Infinity }))),
    };
    const fr = new Frame3(model);
    const ld = emptyLoads3(model);
    ld.nodal[2 * 6] = 5000;
    const r = fr.solve(ld);
    expect(r.members[3]!.N).toBeCloseTo(5000 * Math.SQRT2, 1);
    const d0 = r.u[3 * 6];
    // slack 10 mm used up: the bay moves further by the slack along the diagonal
    const r2 = fr.solve(ld, [undefined, undefined, undefined, { elong: 0.01 }]);
    expect(r2.members[3]!.N).toBeCloseTo(5000 * Math.SQRT2, 1);
    expect(r2.u[3 * 6] - d0).toBeCloseTo(0.01 * Math.SQRT2, 5);
    // without the diagonal: mechanism
    expect(() => fr.solve(ld, [undefined, undefined, undefined, { active: false }])).toThrow(FrameError3);
  });

  it('one-sided supports are switched off from outside', () => {
    const model: FrameModel3 = {
      nodes: [[0, 0, 0], [2, 0, 0], [4, 0, 0]],
      members: [{ i: 0, j: 1, sec: rhs }, { i: 1, j: 2, sec: rhs }],
      supports: [...fix(0).filter((s) => s.dof !== 4), { node: 1, dof: 2, k: Infinity }, { node: 2, dof: 2, k: Infinity }],
    };
    const fr = new Frame3(model);
    const ld = emptyLoads3(model);
    ld.member.push({ m: 0, q: [0, 0, -1000] });
    const r = fr.solve(ld);
    // the unloaded span lifts off its end support
    expect(r.reactions[model.supports.length - 1]).toBeLessThan(0);
    const active = model.supports.map((_, k) => k !== model.supports.length - 1);
    const r2 = fr.solve(ld, undefined, active);
    expect(r2.reactions[model.supports.length - 1]).toBe(0);
    expect(r2.reactions[model.supports.length - 2]).toBeCloseTo(1000, 1);
  });
});
