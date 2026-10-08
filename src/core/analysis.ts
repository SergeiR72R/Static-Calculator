import type { BeamModel, Id, Issue } from './types';
import { G_ACC, X_TOL } from './types';
import { buildMesh, nodeIndexAt, supportRestraint, spanIndexAt, type Mesh } from './mesh';
import { dirCos, equivalentNodalLoads, globalStiffness, matVec, type ElementLoad, type Mat6 } from './element';
import { choleskyBand, choleskySolve, conditionEstimate, SymBandMatrix } from './linalg';
import { kinematicCheck } from './stability';
import { validateModel } from './validate';

export type DofKind = 'u' | 'w' | 't';

export interface DofMap {
  n: number;
  /** per node: global DOF numbers (tL = tR unless the node is a hinge) */
  node: { u: number; w: number; tL: number; tR: number }[];
  /** per element: 6 global DOFs [u1, w1, θ1, u2, w2, θ2] */
  elem: number[][];
  kind: DofKind[];
  nodeOf: number[];
  /** for hinge rotations: 'L' / 'R', '' otherwise */
  side: ('' | 'L' | 'R')[];
}

export interface RestraintEntry {
  supportId: Id;
  dof: number;
  comp: DofKind;
  /** prescribed displacement (settlement) */
  value: number;
  caseId: Id;
}

export interface SpringEntry {
  supportId: Id;
  dof: number;
  comp: DofKind;
  k: number;
}

export interface Prepared {
  model: BeamModel;
  mesh: Mesh;
  dof: DofMap;
  /** global element stiffness matrices */
  Ke: Mat6[];
  /** global stiffness matrix including springs */
  K: SymBandMatrix;
  restraints: RestraintEntry[];
  springs: SpringEntry[];
  fixed: number[];
  free: number[];
  /** global DOF → position in the free list, −1 if restrained */
  freeIndex: Int32Array;
  Kff: SymBandMatrix;
  Lff: SymBandMatrix;
  cond: number;
  minRelPivot: number;
  /** id of the load case receiving the self weight ('' if none) */
  selfWeightCase: Id;
  warnings: Issue[];
}

/** Linear result of a set of loads. All fields combine linearly (superposition). */
export interface LinearResult {
  /** global displacement vector */
  u: Float64Array;
  /** reactions at restrained DOFs: R = K·u − F (0 at free DOFs) */
  R: Float64Array;
  /** spring forces acting on the beam, per spring entry (−k·u) */
  springF: Float64Array;
  /** nodal loads applied directly at nodes */
  Fn: Float64Array;
  /** equivalent nodal loads of the span loads */
  Fe: Float64Array;
  /** prescribed displacements */
  us: Float64Array;
  /** internal forces at the start of each element (ξ = 0+) */
  N0: Float64Array;
  V0: Float64Array;
  M0: Float64Array;
  /** span loads per element */
  q1: Float64Array;
  q2: Float64Array;
  p1: Float64Array;
  p2: Float64Array;
  /** resultants of the applied loads: ΣF_x, ΣF_z, ΣM about x = 0 (clockwise) */
  sum: Float64Array;
}

export function buildDofMap(mesh: Mesh): DofMap {
  let d = 0;
  const kind: DofKind[] = [];
  const nodeOf: number[] = [];
  const side: ('' | 'L' | 'R')[] = [];
  const push = (k: DofKind, n: number, s: '' | 'L' | 'R') => {
    kind.push(k);
    nodeOf.push(n);
    side.push(s);
    return d++;
  };
  const node = mesh.nodes.map((nd) => {
    const u = push('u', nd.index, '');
    const w = push('w', nd.index, '');
    const tL = push('t', nd.index, nd.hinge ? 'L' : '');
    const tR = nd.hinge ? push('t', nd.index, 'R') : tL;
    return { u, w, tL, tR };
  });
  const elem = mesh.elements.map((e) => [
    node[e.n1].u,
    node[e.n1].w,
    node[e.n1].tR,
    node[e.n2].u,
    node[e.n2].w,
    node[e.n2].tL,
  ]);
  return { n: d, node, elem, kind, nodeOf, side };
}

export function selfWeightCaseId(model: BeamModel): Id {
  return model.loadCases.find((c) => c.category === 'G')?.id ?? '';
}

function bandwidth(elemDofs: number[][], map: (d: number) => number): number {
  let bw = 0;
  for (const dofs of elemDofs) {
    const m = dofs.map(map).filter((v) => v >= 0);
    for (const a of m) for (const b of m) bw = Math.max(bw, Math.abs(a - b));
  }
  return bw;
}

export type PrepareResult = { ok: true; prep: Prepared } | { ok: false; errors: Issue[]; warnings: Issue[]; mesh: Mesh };

/** Mesh, DOF numbering, assembly, partitioning and factorisation (load independent). */
export function prepare(model: BeamModel, mesh: Mesh = buildMesh(model)): PrepareResult {
  const warnings: Issue[] = [...mesh.warnings];
  const dof = buildDofMap(mesh);
  const Ke = mesh.elements.map((e) => globalStiffness(e.props, 0));
  const bw = bandwidth(dof.elem, (d) => d);
  const K = new SymBandMatrix(dof.n, bw);
  mesh.elements.forEach((_, ei) => {
    const g = dof.elem[ei];
    const k = Ke[ei];
    for (let i = 0; i < 6; i++)
      for (let j = 0; j <= i; j++) {
        const v = k[i][j];
        if (v !== 0) K.add(g[i], g[j], v);
      }
  });

  // supports → restraints and springs
  const restraints: RestraintEntry[] = [];
  const springs: SpringEntry[] = [];
  const restrained = new Map<number, RestraintEntry>();
  for (const s of model.supports) {
    const ni = nodeIndexAt(mesh.nodes, s.x);
    const nd = mesh.nodes[ni];
    const nm = dof.node[ni];
    const rs = supportRestraint(s);
    if (nd.hinge && (rs.t || rs.kt > 0)) {
      warnings.push({ path: `supports.${s.id}.type`, key: 'warn.hingeAtClamp', severity: 'warning' });
      rs.t = false;
      rs.kt = 0;
    }
    const add = (comp: DofKind, d: number, value: number) => {
      if (restrained.has(d)) {
        warnings.push({ path: `supports.${s.id}.x`, key: 'warn.duplicateRestraint', severity: 'warning' });
        return;
      }
      const r: RestraintEntry = { supportId: s.id, dof: d, comp, value, caseId: s.settlementCase };
      restrained.set(d, r);
      restraints.push(r);
    };
    if (rs.u) add('u', nm.u, s.du);
    if (rs.w) add('w', nm.w, s.dw);
    if (rs.t) add('t', nm.tL, s.dt);
    const spring = (comp: DofKind, d: number, k: number) => {
      if (k > 0) {
        springs.push({ supportId: s.id, dof: d, comp, k });
        K.add(d, d, k);
      }
    };
    spring('u', nm.u, rs.ku);
    spring('w', nm.w, rs.kw);
    spring('t', nm.tL, rs.kt);
  }
  const fixed = [...restrained.keys()].sort((a, b) => a - b);
  const freeIndex = new Int32Array(dof.n).fill(-1);
  const free: number[] = [];
  for (let d = 0; d < dof.n; d++) {
    if (!restrained.has(d)) {
      freeIndex[d] = free.length;
      free.push(d);
    }
  }
  const bwf = bandwidth(dof.elem, (d) => freeIndex[d]);
  const Kff = new SymBandMatrix(free.length, bwf);
  for (let a = 0; a < free.length; a++) {
    const ga = free[a];
    for (let b = Math.max(0, a - bwf); b <= a; b++) {
      const v = K.get(ga, free[b]);
      if (v !== 0) Kff.set(a, b, v);
    }
  }
  const ch = choleskyBand(Kff);
  if (!ch.ok || !ch.L) {
    const g = free[ch.failedAt];
    const node = mesh.nodes[dof.nodeOf[g]];
    return {
      ok: false,
      errors: [{ path: '', key: 'mech.numeric', params: { x: node.x, dof: dof.kind[g] }, severity: 'error' }],
      warnings,
      mesh,
    };
  }
  const cond = conditionEstimate(Kff, ch.L);
  if (cond > 1e12) warnings.push({ path: '', key: 'warn.illConditioned', params: { cond }, severity: 'warning' });
  return {
    ok: true,
    prep: {
      model,
      mesh,
      dof,
      Ke,
      K,
      restraints,
      springs,
      fixed,
      free,
      freeIndex,
      Kff,
      Lff: ch.L,
      cond,
      minRelPivot: ch.minRelPivot,
      selfWeightCase: selfWeightCaseId(model),
      warnings,
    },
  };
}

/** Which part of a load case to include: all, only loads of one span region, or only settlements */
export type SpanFilter = 'all' | 'rest' | number;

export interface LoadVector {
  Fn: Float64Array;
  Fe: Float64Array;
  us: Float64Array;
  q1: Float64Array;
  q2: Float64Array;
  p1: Float64Array;
  p2: Float64Array;
  sum: Float64Array;
}

/** Self weight line load of an element, N/m */
export function selfWeightOf(prep: Prepared, ei: number): number {
  const e = prep.mesh.elements[ei];
  return e.material.rho * e.section.A * G_ACC;
}

/** Assemble the load vector of a load case (or part of it). */
export function buildLoadVector(prep: Prepared, caseId: Id, filter: SpanFilter = 'all'): LoadVector {
  const { mesh, dof, model } = prep;
  const n = dof.n;
  const ne = mesh.elements.length;
  const lv: LoadVector = {
    Fn: new Float64Array(n),
    Fe: new Float64Array(n),
    us: new Float64Array(n),
    q1: new Float64Array(ne),
    q2: new Float64Array(ne),
    p1: new Float64Array(ne),
    p2: new Float64Array(ne),
    sum: new Float64Array(3),
  };
  const spanOk = (x: number) => filter === 'all' || (filter !== 'rest' && spanIndexAt(mesh.spans, x) === filter);
  const elemOk = (ei: number) => filter === 'all' || (filter !== 'rest' && mesh.elements[ei].span === filter);

  for (const l of model.loads) {
    if (l.caseId !== caseId) continue;
    if (l.kind === 'point') {
      if (!spanOk(l.x)) continue;
      const ni = nodeIndexAt(mesh.nodes, l.x);
      const [c, sn] = dirCos(l.angle);
      const Px = l.P * c;
      const Pz = l.P * sn;
      lv.Fn[dof.node[ni].u] += Px;
      lv.Fn[dof.node[ni].w] += Pz;
      lv.sum[0] += Px;
      lv.sum[1] += Pz;
      lv.sum[2] += mesh.nodes[ni].x * Pz;
    } else if (l.kind === 'moment') {
      if (!spanOk(l.x)) continue;
      const ni = nodeIndexAt(mesh.nodes, l.x);
      const nm = dof.node[ni];
      const d = mesh.nodes[ni].hinge ? (l.hingeSide === 'right' ? nm.tR : nm.tL) : nm.tL;
      lv.Fn[d] += l.M;
      lv.sum[2] += l.M;
    } else {
      const span = l.x2 - l.x1;
      for (let ei = 0; ei < ne; ei++) {
        const e = mesh.elements[ei];
        const xm = (e.x1 + e.x2) / 2;
        if (xm <= l.x1 + X_TOL || xm >= l.x2 - X_TOL) continue;
        if (!elemOk(ei)) continue;
        const qa = l.q1 + ((l.q2 - l.q1) * (e.x1 - l.x1)) / span;
        const qb = l.q1 + ((l.q2 - l.q1) * (e.x2 - l.x1)) / span;
        const resultant = ((qa + qb) / 2) * e.L;
        if (l.dir === 'z') {
          lv.q1[ei] += qa;
          lv.q2[ei] += qb;
          lv.sum[1] += resultant;
          lv.sum[2] += (e.L / 6) * (qa * (2 * e.x1 + e.x2) + qb * (e.x1 + 2 * e.x2));
        } else {
          lv.p1[ei] += qa;
          lv.p2[ei] += qb;
          lv.sum[0] += resultant;
        }
      }
    }
  }
  if (model.settings.selfWeight && caseId === prep.selfWeightCase) {
    for (let ei = 0; ei < ne; ei++) {
      if (!elemOk(ei)) continue;
      const e = mesh.elements[ei];
      const g = selfWeightOf(prep, ei);
      lv.q1[ei] += g;
      lv.q2[ei] += g;
      lv.sum[1] += g * e.L;
      lv.sum[2] += g * e.L * ((e.x1 + e.x2) / 2);
    }
  }
  // equivalent nodal loads
  for (let ei = 0; ei < ne; ei++) {
    if (lv.q1[ei] === 0 && lv.q2[ei] === 0 && lv.p1[ei] === 0 && lv.p2[ei] === 0) continue;
    const r = equivalentNodalLoads(mesh.elements[ei].props, elementLoad(lv, ei));
    const g = dof.elem[ei];
    for (let i = 0; i < 6; i++) lv.Fe[g[i]] += r[i];
  }
  // settlements
  if (filter === 'all' || filter === 'rest') {
    for (const r of prep.restraints) if (r.caseId === caseId) lv.us[r.dof] = r.value;
  }
  return lv;
}

export function elementLoad(
  src: { q1: Float64Array; q2: Float64Array; p1: Float64Array; p2: Float64Array },
  ei: number,
): ElementLoad {
  return { q1: src.q1[ei], q2: src.q2[ei], p1: src.p1[ei], p2: src.p2[ei] };
}

/** Solve K_ff·u_f = F_f − K_fs·u_s, reactions R = K·u − F and element end forces */
export function solveLoadVector(prep: Prepared, lv: LoadVector): LinearResult {
  const { dof, mesh, free, fixed, K } = prep;
  const n = dof.n;
  const F = new Float64Array(n);
  for (let i = 0; i < n; i++) F[i] = lv.Fn[i] + lv.Fe[i];
  const Kus = K.mulVec(lv.us);
  const rhs = new Float64Array(free.length);
  for (let a = 0; a < free.length; a++) rhs[a] = F[free[a]] - Kus[free[a]];
  const uf = choleskySolve(prep.Lff, rhs);
  // one step of iterative refinement: u_f += K_ff⁻¹·(rhs − K_ff·u_f)
  const res = prep.Kff.mulVec(uf);
  let resNorm = 0;
  for (let a = 0; a < free.length; a++) {
    res[a] = rhs[a] - res[a];
    resNorm += Math.abs(res[a]);
  }
  if (resNorm > 0) {
    const du = choleskySolve(prep.Lff, res);
    for (let a = 0; a < free.length; a++) uf[a] += du[a];
  }
  const u = Float64Array.from(lv.us);
  for (let a = 0; a < free.length; a++) u[free[a]] = uf[a];
  const Ku = K.mulVec(u);
  const R = new Float64Array(n);
  for (const d of fixed) R[d] = Ku[d] - F[d];
  const springF = new Float64Array(prep.springs.length);
  prep.springs.forEach((s, i) => {
    springF[i] = -s.k * u[s.dof];
  });
  const ne = mesh.elements.length;
  const N0 = new Float64Array(ne);
  const V0 = new Float64Array(ne);
  const M0 = new Float64Array(ne);
  for (let ei = 0; ei < ne; ei++) {
    const g = dof.elem[ei];
    const ue = g.map((d) => u[d]);
    const f = matVec(prep.Ke[ei], ue);
    if (lv.q1[ei] !== 0 || lv.q2[ei] !== 0 || lv.p1[ei] !== 0 || lv.p2[ei] !== 0) {
      const r = equivalentNodalLoads(mesh.elements[ei].props, elementLoad(lv, ei));
      for (let i = 0; i < 6; i++) f[i] -= r[i];
    }
    N0[ei] = -f[0];
    V0[ei] = -f[1];
    M0[ei] = f[2];
  }
  return {
    u,
    R,
    springF,
    Fn: lv.Fn,
    Fe: lv.Fe,
    us: lv.us,
    N0,
    V0,
    M0,
    q1: lv.q1,
    q2: lv.q2,
    p1: lv.p1,
    p2: lv.p2,
    sum: lv.sum,
  };
}

const LR_KEYS = ['u', 'R', 'springF', 'Fn', 'Fe', 'us', 'N0', 'V0', 'M0', 'q1', 'q2', 'p1', 'p2', 'sum'] as const;

export function zeroResult(prep: Prepared): LinearResult {
  const n = prep.dof.n;
  const ne = prep.mesh.elements.length;
  return {
    u: new Float64Array(n),
    R: new Float64Array(n),
    springF: new Float64Array(prep.springs.length),
    Fn: new Float64Array(n),
    Fe: new Float64Array(n),
    us: new Float64Array(n),
    N0: new Float64Array(ne),
    V0: new Float64Array(ne),
    M0: new Float64Array(ne),
    q1: new Float64Array(ne),
    q2: new Float64Array(ne),
    p1: new Float64Array(ne),
    p2: new Float64Array(ne),
    sum: new Float64Array(3),
  };
}

/** Σ cᵢ·Rᵢ */
export function combineResults(prep: Prepared, terms: [number, LinearResult][]): LinearResult {
  const out = zeroResult(prep);
  for (const [c, r] of terms) {
    if (c === 0) continue;
    for (const k of LR_KEYS) {
      const a = out[k];
      const b = r[k];
      for (let i = 0; i < a.length; i++) a[i] += c * b[i];
    }
  }
  return out;
}

/** Results of one load case: full case plus (for pattern loading) per-span parts */
export interface CaseResult {
  caseId: Id;
  full: LinearResult;
  /** pattern loading parts: settlements-only part and one result per span region */
  pattern?: { rest: LinearResult; spans: LinearResult[] };
}

export interface Analysis {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  model: BeamModel;
  mesh?: Mesh;
  prep?: Prepared;
  cases: Map<Id, CaseResult>;
  /** wall-clock time of the analysis, ms */
  time: number;
}

export function usesPattern(model: BeamModel, mesh: Mesh, caseId: Id): boolean {
  const c = model.loadCases.find((lc) => lc.id === caseId);
  return !!c && model.settings.patternLoading && c.category === 'Q' && mesh.spans.length > 1;
}

/** Run the complete linear static analysis of all load cases. */
export function analyze(model: BeamModel): Analysis {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const issues = validateModel(model);
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const fail = (errs: Issue[], mesh?: Mesh): Analysis => ({
    ok: false,
    errors: errs,
    warnings,
    model,
    mesh,
    cases: new Map(),
    time: 0,
  });
  if (errors.length) return fail(errors);
  const mesh = buildMesh(model);
  const kin = kinematicCheck(model, mesh);
  if (kin.length) return fail(kin, mesh);
  const pr = prepare(model, mesh);
  if (!pr.ok) {
    warnings.push(...pr.warnings);
    return fail(pr.errors, mesh);
  }
  const prep = pr.prep;
  warnings.push(...prep.warnings);
  const cases = new Map<Id, CaseResult>();
  for (const lc of model.loadCases) {
    const full = solveLoadVector(prep, buildLoadVector(prep, lc.id, 'all'));
    const cr: CaseResult = { caseId: lc.id, full };
    if (usesPattern(model, mesh, lc.id)) {
      cr.pattern = {
        rest: solveLoadVector(prep, buildLoadVector(prep, lc.id, 'rest')),
        spans: mesh.spans.map((s) => solveLoadVector(prep, buildLoadVector(prep, lc.id, s.index))),
      };
    }
    cases.set(lc.id, cr);
  }
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { ok: true, errors: [], warnings, model, mesh, prep, cases, time: t1 - t0 };
}
