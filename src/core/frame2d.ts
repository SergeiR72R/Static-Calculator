/**
 * Linear plane frame (2D) for member models such as lattice girders: Euler–Bernoulli frame members
 * and pin-ended truss members, nodal loads, linear line loads on members.
 *
 * Global axes: x to the right, z upwards; node DOFs (u, w, φ), φ counter-clockwise. Member forces:
 * N > 0 tension, M sagging positive (bottom fibre in tension for a member running in +x).
 */
import { SymBandMatrix, choleskyBand, choleskySolve } from './linalg';

export interface FrameNode {
  x: number;
  z: number;
}

export interface FrameMember {
  i: number;
  j: number;
  EA: number;
  EI: number;
  /** pin-ended (axial force only) */
  hinged: boolean;
}

/** restrained DOF: 0 = u, 1 = w, 2 = φ */
export interface FrameSupport {
  node: number;
  dof: 0 | 1 | 2;
}

/** Load case: nodal forces (3 per node) and global line loads per member (per unit member length) */
export interface FrameLoad {
  F: Float64Array;
  /** member index → global components at i / j: [px1, pz1, px2, pz2] */
  line: Map<number, [number, number, number, number]>;
}

export function emptyLoad(nNodes: number): FrameLoad {
  return { F: new Float64Array(3 * nNodes), line: new Map() };
}

export function addLine(l: FrameLoad, m: number, v: [number, number, number, number]) {
  const a = l.line.get(m);
  if (a) for (let k = 0; k < 4; k++) a[k] += v[k];
  else l.line.set(m, [...v]);
}

/** Member results in local axes; M sampled at `MEMBER_SAMPLES` equidistant points */
export const MEMBER_SAMPLES = 5;

export interface FrameResult {
  /** nodal displacements (3 per node) */
  d: Float64Array;
  /** support reactions (3 per node, global) */
  R: Float64Array;
  /** per member: N (constant part, mean of both ends), V at both ends, M at the samples */
  N: Float64Array;
  /** N at the ends (line loads along the member) */
  N1: Float64Array;
  N2: Float64Array;
  V1: Float64Array;
  V2: Float64Array;
  /** M[m * MEMBER_SAMPLES + k] */
  M: Float64Array;
}

interface Geometry {
  L: number;
  c: number;
  s: number;
}

function geom(nodes: FrameNode[], m: FrameMember): Geometry {
  const dx = nodes[m.j].x - nodes[m.i].x;
  const dz = nodes[m.j].z - nodes[m.i].z;
  const L = Math.hypot(dx, dz);
  return { L, c: dx / L, s: dz / L };
}

/** local stiffness (u1, w1, φ1, u2, w2, φ2) */
function localK(m: FrameMember, L: number): number[][] {
  const a = m.EA / L;
  const K = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
  K[0][0] = K[3][3] = a;
  K[0][3] = K[3][0] = -a;
  if (!m.hinged) {
    const e = m.EI / L ** 3;
    const t: [number, number, number][] = [
      [1, 1, 12], [1, 2, 6 * L], [1, 4, -12], [1, 5, 6 * L],
      [2, 2, 4 * L * L], [2, 4, -6 * L], [2, 5, 2 * L * L],
      [4, 4, 12], [4, 5, -6 * L], [5, 5, 4 * L * L],
    ];
    for (const [p, q, v] of t) K[p][q] = K[q][p] = e * v;
  }
  return K;
}

/** local equivalent nodal loads of a linear load (axial p, transverse q in local axes) */
function localEq(m: FrameMember, L: number, p1: number, p2: number, q1: number, q2: number): number[] {
  const f = [(L * (2 * p1 + p2)) / 6, 0, 0, (L * (p1 + 2 * p2)) / 6, 0, 0];
  if (m.hinged) {
    // pin-ended: simple beam reactions, no end moments
    f[1] = (L * (2 * q1 + q2)) / 6;
    f[4] = (L * (q1 + 2 * q2)) / 6;
  } else {
    f[1] = (L * (7 * q1 + 3 * q2)) / 20;
    f[2] = (L * L * (3 * q1 + 2 * q2)) / 60;
    f[4] = (L * (3 * q1 + 7 * q2)) / 20;
    f[5] = -(L * L * (2 * q1 + 3 * q2)) / 60;
  }
  return f;
}

/** global line load → local components (axial p, transverse q) */
function toLocal(g: Geometry, v: [number, number, number, number]): [number, number, number, number] {
  const p = (px: number, pz: number) => g.c * px + g.s * pz;
  const q = (px: number, pz: number) => -g.s * px + g.c * pz;
  return [p(v[0], v[1]), p(v[2], v[3]), q(v[0], v[1]), q(v[2], v[3])];
}

const toGlobal = (g: Geometry, f: number[]): number[] => [
  g.c * f[0] - g.s * f[1], g.s * f[0] + g.c * f[1], f[2],
  g.c * f[3] - g.s * f[4], g.s * f[3] + g.c * f[4], f[5],
];

/** Factorised frame: solve any number of load cases */
export interface FrameSolver {
  nodes: FrameNode[];
  members: FrameMember[];
  solve(load: FrameLoad): FrameResult;
}

export class FrameMechanismError extends Error {}

export function frameSolver(nodes: FrameNode[], members: FrameMember[], supports: FrameSupport[]): FrameSolver {
  const n = 3 * nodes.length;
  const fixed = new Uint8Array(n);
  for (const s of supports) fixed[3 * s.node + s.dof] = 1;
  // rotations of nodes without a rigid member connection are not DOFs
  const rigid = new Uint8Array(nodes.length);
  for (const m of members)
    if (!m.hinged) {
      rigid[m.i] = 1;
      rigid[m.j] = 1;
    }
  const inactive = new Uint8Array(n);
  for (let k = 0; k < nodes.length; k++) if (!rigid[k]) inactive[3 * k + 2] = 1;
  const map = new Int32Array(n).fill(-1);
  let nf = 0;
  for (let d = 0; d < n; d++) if (!fixed[d] && !inactive[d]) map[d] = nf++;
  const geo = members.map((m) => geom(nodes, m));
  const kl = members.map((m, k) => localK(m, geo[k].L));
  const kg = members.map((_, k) => {
    const g = geo[k];
    const T = (v: number[]) => toGlobal(g, v);
    // K_global = Tᵀ K T: columns via transformation of unit vectors
    const out = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
    for (let col = 0; col < 6; col++) {
      const eG = new Array<number>(6).fill(0);
      eG[col] = 1;
      // local displacements of the global unit vector
      const dl = [g.c * eG[0] + g.s * eG[1], -g.s * eG[0] + g.c * eG[1], eG[2], g.c * eG[3] + g.s * eG[4], -g.s * eG[3] + g.c * eG[4], eG[5]];
      const fl = kl[k].map((row) => row.reduce((a, v, q) => a + v * dl[q], 0));
      const fg = T(fl);
      for (let r = 0; r < 6; r++) out[r][col] = fg[r];
    }
    return out;
  });
  const dofs = members.map((m) => [3 * m.i, 3 * m.i + 1, 3 * m.i + 2, 3 * m.j, 3 * m.j + 1, 3 * m.j + 2]);
  let bw = 0;
  for (const ds of dofs) {
    const f = ds.map((d) => map[d]).filter((d) => d >= 0);
    if (f.length) bw = Math.max(bw, Math.max(...f) - Math.min(...f));
  }
  const K = new SymBandMatrix(nf, bw);
  members.forEach((_, k) => {
    for (let p = 0; p < 6; p++) {
      const a = map[dofs[k][p]];
      if (a < 0) continue;
      for (let q = 0; q < 6; q++) {
        const b = map[dofs[k][q]];
        if (b < 0 || b > a) continue;
        const v = kg[k][p][q];
        if (v !== 0) K.add(a, b, v);
      }
    }
  });
  const ch = choleskyBand(K, 1e-12);
  if (!ch.ok || !ch.L) throw new FrameMechanismError('frame: mechanism / singular stiffness');
  const Lf = ch.L;

  return {
    nodes,
    members,
    solve(load) {
      const Fe = Float64Array.from(load.F);
      const eqLocal = new Map<number, { eq: number[]; ll: [number, number, number, number] }>();
      for (const [k, v] of load.line) {
        const g = geo[k];
        const ll = toLocal(g, v);
        const eq = localEq(members[k], g.L, ll[0], ll[1], ll[2], ll[3]);
        eqLocal.set(k, { eq, ll });
        const eg = toGlobal(g, eq);
        for (let p = 0; p < 6; p++) Fe[dofs[k][p]] += eg[p];
      }
      const rhs = new Float64Array(nf);
      for (let d = 0; d < n; d++) if (map[d] >= 0) rhs[map[d]] = Fe[d];
      const x = choleskySolve(Lf, rhs);
      const d = new Float64Array(n);
      for (let k = 0; k < n; k++) if (map[k] >= 0) d[k] = x[map[k]];
      const nm = members.length;
      const res: FrameResult = {
        d,
        R: new Float64Array(n),
        N: new Float64Array(nm),
        N1: new Float64Array(nm),
        N2: new Float64Array(nm),
        V1: new Float64Array(nm),
        V2: new Float64Array(nm),
        M: new Float64Array(nm * MEMBER_SAMPLES),
      };
      // Σ member end forces at the nodes (global) for the reactions
      const acc = new Float64Array(n);
      members.forEach((m, k) => {
        const g = geo[k];
        const dg = dofs[k].map((q) => d[q]);
        const dl = [g.c * dg[0] + g.s * dg[1], -g.s * dg[0] + g.c * dg[1], dg[2], g.c * dg[3] + g.s * dg[4], -g.s * dg[3] + g.c * dg[4], dg[5]];
        const f = kl[k].map((row) => row.reduce((a, v, q) => a + v * dl[q], 0));
        const el = eqLocal.get(k);
        if (el) for (let p = 0; p < 6; p++) f[p] -= el.eq[p];
        const fg = toGlobal(g, f);
        for (let p = 0; p < 6; p++) acc[dofs[k][p]] += fg[p];
        res.N1[k] = -f[0];
        res.N2[k] = f[3];
        res.N[k] = (f[3] - f[0]) / 2;
        res.V1[k] = f[1];
        res.V2[k] = -f[4];
        const q1 = el ? el.ll[2] : 0;
        const q2 = el ? el.ll[3] : 0;
        for (let s = 0; s < MEMBER_SAMPLES; s++) {
          const xi = (g.L * s) / (MEMBER_SAMPLES - 1);
          // ∫₀^ξ q(s)(ξ − s) ds for q linear from q1 to q2
          const qa = q1;
          const qb = (q2 - q1) / g.L;
          const load = (qa * xi * xi) / 2 + (qb * xi ** 3) / 6;
          res.M[k * MEMBER_SAMPLES + s] = m.hinged ? 0 : -f[2] + xi * f[1] + load;
        }
      });
      for (let q = 0; q < n; q++) if (fixed[q]) res.R[q] = acc[q] - load.F[q];
      return res;
    },
  };
}

/** Σ γ·result (linear superposition) */
export function combineFrame(terms: [number, FrameResult][], like: FrameResult): FrameResult {
  const out: FrameResult = {
    d: new Float64Array(like.d.length),
    R: new Float64Array(like.R.length),
    N: new Float64Array(like.N.length),
    N1: new Float64Array(like.N.length),
    N2: new Float64Array(like.N.length),
    V1: new Float64Array(like.N.length),
    V2: new Float64Array(like.N.length),
    M: new Float64Array(like.M.length),
  };
  const keys = ['d', 'R', 'N', 'N1', 'N2', 'V1', 'V2', 'M'] as const;
  for (const [f, r] of terms)
    for (const key of keys) {
      const a = out[key];
      const b = r[key];
      for (let i = 0; i < a.length; i++) a[i] += f * b[i];
    }
  return out;
}
