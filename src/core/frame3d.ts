/**
 * Space frame (6 degrees of freedom per node): beam members with rigid end offsets and connection
 * springs at both ends (semi-rigid joints, hinges), truss members, spring supports, geometric
 * stiffness for second-order analysis. SI units. The non-linear behaviour (secant stiffness of
 * joints, slack, one-sided supports) is controlled from outside through the member and support
 * states; every call of `solve` is one linear step.
 *
 * Local member axes: x from the connection point at node i to that at node j; y horizontal
 * (global Z × x), z = x × y (upwards for horizontal members). Vertical members: y = global Y.
 * End forces and connection forces use the order [N, Vy, Vz, Mx, My, Mz] in local axes, as forces
 * acting on the member end (i) and on the member end (j).
 */
import { SparseSym, minimumDegreeOrder } from './sparse';

export type V3 = [number, number, number];

export interface Section3 {
  EA: number;
  /** bending about the local y axis (deflection in local z) and about the local z axis */
  EIy: number;
  EIz: number;
  GJ: number;
}

/** connection of a member end to its node */
export interface MemberEnd {
  /** rigid arm from the node to the connection point, global coordinates, m */
  offset?: V3;
  /**
   * spring stiffness between the rigid arm and the member end in local axes
   * [kx, ky, kz, krx, kry, krz]; Infinity = rigid (default), 0 = released
   */
  k?: number[];
}

export interface Member3 {
  i: number;
  j: number;
  sec: Section3;
  /** axial force only (pin-ended) */
  truss?: boolean;
  ends?: [MemberEnd | undefined, MemberEnd | undefined];
}

export interface Support3 {
  node: number;
  /** 0…2 translations x, y, z; 3…5 rotations */
  dof: number;
  /** spring stiffness, N/m or N·m/rad; Infinity = rigid */
  k: number;
}

export interface FrameModel3 {
  nodes: V3[];
  members: Member3[];
  supports: Support3[];
}

/** state of a member in one linear step */
export interface MemberState {
  /** false: member removed (slack, tension / compression only) */
  active?: boolean;
  /** secant stiffness of the end springs, overrides `ends[..].k` */
  k?: [number[] | undefined, number[] | undefined];
  /** axial force for the geometric stiffness, N (tension positive) */
  N?: number;
  /** imposed lengthening (slack already used up, lack of fit), m — truss members */
  elong?: number;
  /** factor on the axial stiffness of a truss member (tension / compression stiffness) */
  eaFactor?: number;
}

export interface Loads3 {
  /** nodal loads, 6 per node, global */
  nodal: Float64Array;
  /** uniformly distributed member loads, global, N/m */
  member: { m: number; q: V3 }[];
}

export interface MemberResult {
  /** forces on the member ends in local axes [N, Vy, Vz, Mx, My, Mz] at i and at j (j: section forces) */
  fi: Float64Array;
  fj: Float64Array;
  /** axial force (tension positive), N */
  N: number;
  /** relative displacements in the end springs (member end − rigid arm), local */
  di: Float64Array;
  dj: Float64Array;
  /** local distributed load [qx, qy, qz] */
  q: V3;
  L: number;
}

export interface Result3 {
  u: Float64Array;
  members: (MemberResult | null)[];
  /** support forces (force of the support on the structure), same order as model.supports */
  reactions: Float64Array;
}

export class FrameError3 extends Error {
  constructor(
    public node: number,
    public dof: number,
  ) {
    super('frame3d: not positive definite');
  }
}

const RIGID = 1e12;
const RIGID_ROT = 1e10;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);

/** rotation matrix rows = local axes x, y, z in global coordinates */
export function localAxes(a: V3, b: V3): { R: number[]; L: number } {
  const d = sub(b, a);
  const L = norm(d);
  const x: V3 = [d[0] / L, d[1] / L, d[2] / L];
  let y: V3;
  if (Math.hypot(x[0], x[1]) < 1e-6) y = [0, 1, 0];
  else {
    y = cross([0, 0, 1], x);
    const n = norm(y);
    y = [y[0] / n, y[1] / n, y[2] / n];
  }
  const z = cross(x, y);
  return { R: [...x, ...y, ...z], L };
}

/** elastic stiffness of a beam in local axes (12 × 12, row major) */
function beamK(s: Section3, L: number, out: Float64Array) {
  out.fill(0);
  const set = (i: number, j: number, v: number) => {
    out[i * 12 + j] = v;
    out[j * 12 + i] = v;
  };
  const a = s.EA / L;
  const t = s.GJ / L;
  set(0, 0, a);
  set(6, 6, a);
  set(0, 6, -a);
  set(3, 3, t);
  set(9, 9, t);
  set(3, 9, -t);
  // bending about z: v, θz (dofs 1, 5, 7, 11)
  const z = s.EIz / (L * L * L);
  set(1, 1, 12 * z);
  set(7, 7, 12 * z);
  set(1, 7, -12 * z);
  set(1, 5, 6 * z * L);
  set(1, 11, 6 * z * L);
  set(5, 7, -6 * z * L);
  set(7, 11, -6 * z * L);
  set(5, 5, 4 * z * L * L);
  set(11, 11, 4 * z * L * L);
  set(5, 11, 2 * z * L * L);
  // bending about y: w, θy (dofs 2, 4, 8, 10), θy = −dw/dx
  const y = s.EIy / (L * L * L);
  set(2, 2, 12 * y);
  set(8, 8, 12 * y);
  set(2, 8, -12 * y);
  set(2, 4, -6 * y * L);
  set(2, 10, -6 * y * L);
  set(4, 8, 6 * y * L);
  set(8, 10, 6 * y * L);
  set(4, 4, 4 * y * L * L);
  set(10, 10, 4 * y * L * L);
  set(4, 10, 2 * y * L * L);
}

/** geometric stiffness for the axial force N (tension positive), added to `out` */
function beamKg(N: number, L: number, out: Float64Array) {
  const c = N / (30 * L);
  const add = (i: number, j: number, v: number) => {
    out[i * 12 + j] += v * c;
    if (i !== j) out[j * 12 + i] += v * c;
  };
  // v, θz
  add(1, 1, 36);
  add(7, 7, 36);
  add(1, 7, -36);
  add(1, 5, 3 * L);
  add(1, 11, 3 * L);
  add(5, 7, -3 * L);
  add(7, 11, -3 * L);
  add(5, 5, 4 * L * L);
  add(11, 11, 4 * L * L);
  add(5, 11, -L * L);
  // w, θy
  add(2, 2, 36);
  add(8, 8, 36);
  add(2, 8, -36);
  add(2, 4, -3 * L);
  add(2, 10, -3 * L);
  add(4, 8, 3 * L);
  add(8, 10, 3 * L);
  add(4, 4, 4 * L * L);
  add(10, 10, 4 * L * L);
  add(4, 10, -L * L);
}

/** in-place inverse of a symmetric positive definite 12 × 12 matrix (Gauss–Jordan with pivoting) */
function invert12(a: Float64Array): boolean {
  const n = 12;
  const inv = new Float64Array(144);
  for (let i = 0; i < n; i++) inv[i * n + i] = 1;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r * n + c]) > Math.abs(a[p * n + c])) p = r;
    const piv = a[p * n + c];
    if (!(Math.abs(piv) > 1e-300)) return false;
    if (p !== c)
      for (let k = 0; k < n; k++) {
        let t = a[c * n + k];
        a[c * n + k] = a[p * n + k];
        a[p * n + k] = t;
        t = inv[c * n + k];
        inv[c * n + k] = inv[p * n + k];
        inv[p * n + k] = t;
      }
    for (let k = 0; k < n; k++) {
      a[c * n + k] /= piv;
      inv[c * n + k] /= piv;
    }
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r * n + c];
      if (f === 0) continue;
      for (let k = 0; k < n; k++) {
        a[r * n + k] -= f * a[c * n + k];
        inv[r * n + k] -= f * inv[c * n + k];
      }
    }
  }
  a.set(inv);
  return true;
}

interface Elem {
  /** member geometry between the connection points */
  R: number[];
  L: number;
  /** rigid arms (global) */
  oi: V3;
  oj: V3;
}

/** T (12 × 12): local displacements of the connection points from the global node displacements */
function transform(e: Elem, T: Float64Array) {
  T.fill(0);
  const R = e.R;
  for (let end = 0; end < 2; end++) {
    const o = end === 0 ? e.oi : e.oj;
    const b = end * 6;
    // u_c = u + θ × o ; θ_c = θ
    // θ × o = [θy·oz − θz·oy, θz·ox − θx·oz, θx·oy − θy·ox]
    const C = [0, o[2], -o[1], -o[2], 0, o[0], o[1], -o[0], 0];
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        T[(b + r) * 12 + b + c] = R[r * 3 + c];
        T[(b + 3 + r) * 12 + b + 3 + c] = R[r * 3 + c];
        // R · C
        T[(b + r) * 12 + b + 3 + c] = R[r * 3] * C[c] + R[r * 3 + 1] * C[3 + c] + R[r * 3 + 2] * C[6 + c];
      }
  }
}

/** Solver for one model: pattern and ordering are set up once, `solve` can be called many times */
export class Frame3 {
  readonly model: FrameModel3;
  private elems: Elem[];
  private K: SparseSym;
  /** positions of the 144 element entries in the sparse matrix */
  private pos: Int32Array[];
  private supPos: Int32Array;

  constructor(model: FrameModel3) {
    this.model = model;
    const n = model.nodes.length;
    this.elems = model.members.map((m) => {
      const oi = m.ends?.[0]?.offset ?? [0, 0, 0];
      const oj = m.ends?.[1]?.offset ?? [0, 0, 0];
      const a: V3 = [model.nodes[m.i][0] + oi[0], model.nodes[m.i][1] + oi[1], model.nodes[m.i][2] + oi[2]];
      const b: V3 = [model.nodes[m.j][0] + oj[0], model.nodes[m.j][1] + oj[1], model.nodes[m.j][2] + oj[2]];
      const { R, L } = localAxes(a, b);
      return { R, L, oi, oj };
    });
    const order = minimumDegreeOrder(
      n,
      model.members.map((m) => [m.i, m.j] as [number, number]),
    );
    const perm = new Int32Array(n * 6);
    for (let k = 0; k < n; k++) for (let d = 0; d < 6; d++) perm[k * 6 + d] = order[k] * 6 + d;
    const pairs: number[] = [];
    for (let v = 0; v < n; v++) for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) pairs.push(v * 6 + a, v * 6 + b);
    for (const m of model.members) for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) pairs.push(m.i * 6 + a, m.j * 6 + b);
    this.K = new SparseSym(n * 6, perm, Int32Array.from(pairs));
    this.pos = model.members.map((m) => {
      const p = new Int32Array(144);
      for (let a = 0; a < 12; a++)
        for (let b = 0; b < 12; b++) {
          const ga = (a < 6 ? m.i : m.j) * 6 + (a % 6);
          const gb = (b < 6 ? m.i : m.j) * 6 + (b % 6);
          p[a * 12 + b] = this.K.index(ga, gb);
        }
      return p;
    });
    this.supPos = Int32Array.from(model.supports.map((s) => this.K.diag(s.node * 6 + s.dof)));
  }

  get unknowns(): number {
    return this.K.n;
  }

  get fill(): number {
    return this.K.fill;
  }

  /**
   * One linear step.
   * @param states per member (undefined: default)
   * @param supportActive per support (undefined: all active)
   */
  solve(loads: Loads3, states?: (MemberState | undefined)[], supportActive?: boolean[]): Result3 {
    const { model, K } = this;
    const n = model.nodes.length;
    K.clear();
    const f = Float64Array.from(loads.nodal);
    const qByMember = new Map<number, V3>();
    for (const l of loads.member) {
      const q = qByMember.get(l.m);
      if (q) qByMember.set(l.m, [q[0] + l.q[0], q[1] + l.q[1], q[2] + l.q[2]]);
      else qByMember.set(l.m, l.q);
    }

    const ke = new Float64Array(144);
    const T = new Float64Array(144);
    const tmp = new Float64Array(144);
    const kg = new Float64Array(144);
    // per member: data for the recovery of the end forces
    const rec: ({ A: Float64Array; kel: Float64Array; S: Float64Array; p: Float64Array; T: Float64Array; q: V3; truss: boolean; ea: number; elong: number } | null)[] = [];

    for (let mi = 0; mi < model.members.length; mi++) {
      const m = model.members[mi];
      const e = this.elems[mi];
      const st = states?.[mi];
      if (st?.active === false) {
        rec.push(null);
        continue;
      }
      const L = e.L;
      transform(e, T);
      const qg = qByMember.get(mi);
      const R = e.R;
      const ql: V3 = qg ? [R[0] * qg[0] + R[1] * qg[1] + R[2] * qg[2], R[3] * qg[0] + R[4] * qg[1] + R[5] * qg[2], R[6] * qg[0] + R[7] * qg[1] + R[8] * qg[2]] : [0, 0, 0];
      const p = new Float64Array(12);
      const S = new Float64Array(12);
      let kc: Float64Array;
      let A: Float64Array;
      if (m.truss) {
        // axial spring between the connection points; loads go to the ends as for a simple beam
        const ea = (m.sec.EA * (st?.eaFactor ?? 1)) / L;
        ke.fill(0);
        ke[0] = ea;
        ke[6 * 12 + 6] = ea;
        ke[6] = -ea;
        ke[6 * 12] = -ea;
        if (st?.N) {
          // string stiffness N/L in both transverse directions
          const g = st.N / L;
          for (const d of [1, 2]) {
            ke[d * 12 + d] += g;
            ke[(d + 6) * 12 + d + 6] += g;
            ke[d * 12 + d + 6] -= g;
            ke[(d + 6) * 12 + d] -= g;
          }
        }
        for (let d = 0; d < 3; d++) {
          p[d] = (ql[d] * L) / 2;
          p[6 + d] = (ql[d] * L) / 2;
        }
        // imposed lengthening: pushes the ends apart
        const el = st?.elong ?? 0;
        p[0] -= ea * el;
        p[6] += ea * el;
        kc = Float64Array.from(ke);
        A = new Float64Array(0);
        rec.push({ A, kel: Float64Array.from(ke), S, p, T: Float64Array.from(T), q: ql, truss: true, ea, elong: el });
      } else {
        beamK(m.sec, L, ke);
        if (st?.N) beamKg(st.N, L, ke);
        // equivalent nodal loads of the distributed load (fixed-end forces with opposite sign)
        p[0] = (ql[0] * L) / 2;
        p[6] = (ql[0] * L) / 2;
        p[1] = (ql[1] * L) / 2;
        p[7] = (ql[1] * L) / 2;
        p[5] = (ql[1] * L * L) / 12;
        p[11] = (-ql[1] * L * L) / 12;
        p[2] = (ql[2] * L) / 2;
        p[8] = (ql[2] * L) / 2;
        p[4] = (-ql[2] * L * L) / 12;
        p[10] = (ql[2] * L * L) / 12;
        const k0 = st?.k?.[0] ?? m.ends?.[0]?.k;
        const k1 = st?.k?.[1] ?? m.ends?.[1]?.k;
        if (!k0 && !k1) {
          kc = ke;
          A = new Float64Array(0);
          rec.push({ A, kel: Float64Array.from(ke), S, p, T: Float64Array.from(T), q: ql, truss: false, ea: 0, elong: 0 });
        } else {
          for (let d = 0; d < 6; d++) {
            const r = d < 3 ? RIGID : RIGID_ROT;
            const a = k0 ? k0[d] : Infinity;
            const b = k1 ? k1[d] : Infinity;
            S[d] = Number.isFinite(a) ? a : r;
            S[6 + d] = Number.isFinite(b) ? b : r;
          }
          // A = (S + K)⁻¹
          A = Float64Array.from(ke);
          for (let d = 0; d < 12; d++) A[d * 12 + d] += S[d];
          // torsion released at both ends: keep the matrix regular
          if (S[3] === 0 && S[9] === 0) A[3 * 12 + 3] += 1e-6 * m.sec.GJ;
          if (!invert12(A)) throw new FrameError3(m.i, 0);
          // condensed: Kc = S − S·A·S ; load: pc = S·A·p
          kc = kg;
          for (let a = 0; a < 12; a++)
            for (let b = 0; b < 12; b++) kc[a * 12 + b] = (a === b ? S[a] : 0) - S[a] * A[a * 12 + b] * S[b];
          const pc = new Float64Array(12);
          for (let a = 0; a < 12; a++) {
            let v = 0;
            for (let b = 0; b < 12; b++) v += A[a * 12 + b] * p[b];
            pc[a] = S[a] * v;
          }
          // the recovery needs the member load vector, the assembly the condensed one
          rec.push({ A, kel: Float64Array.from(ke), S, p: Float64Array.from(p), T: Float64Array.from(T), q: ql, truss: false, ea: 0, elong: 0 });
          p.set(pc);
        }
      }
      // global: Tᵀ·kc·T and Tᵀ·p
      for (let a = 0; a < 12; a++)
        for (let b = 0; b < 12; b++) {
          let v = 0;
          for (let c = 0; c < 12; c++) v += kc[a * 12 + c] * T[c * 12 + b];
          tmp[a * 12 + b] = v;
        }
      const pos = this.pos[mi];
      for (let a = 0; a < 12; a++) {
        for (let b = 0; b < 12; b++) {
          const ga = (a < 6 ? m.i : m.j) * 6 + (a % 6);
          const gb = (b < 6 ? m.i : m.j) * 6 + (b % 6);
          // upper triangle of the permuted matrix only once
          if (K.inv[ga] > K.inv[gb]) continue;
          let v = 0;
          for (let c = 0; c < 12; c++) v += T[c * 12 + a] * tmp[c * 12 + b];
          K.cx[pos[a * 12 + b]] += v;
        }
        let v = 0;
        for (let c = 0; c < 12; c++) v += T[c * 12 + a] * p[c];
        f[(a < 6 ? m.i : m.j) * 6 + (a % 6)] += v;
      }
    }

    // supports
    model.supports.forEach((s, k) => {
      if (supportActive && supportActive[k] === false) return;
      K.cx[this.supPos[k]] += Number.isFinite(s.k) ? s.k : s.dof < 3 ? RIGID : RIGID_ROT;
    });
    // degrees of freedom without any stiffness (rotations of nodes with pin-ended members only)
    for (let d = 0; d < n * 6; d++) {
      const p = K.diag(d);
      if (!(Math.abs(K.cx[p]) > 1e-9)) {
        K.cx[p] = 1;
        f[d] = 0;
      }
    }

    const bad = K.factor();
    if (bad >= 0) throw new FrameError3(Math.floor(bad / 6), bad % 6);
    const u = K.solve(f);
    // displacements beyond any structure: a mechanism that slipped through the factorisation
    for (let d = 0; d < u.length; d++) if (!(Math.abs(u[d]) < 100)) throw new FrameError3(Math.floor(d / 6), d % 6);

    // member forces
    const members: (MemberResult | null)[] = [];
    const ul = new Float64Array(12);
    for (let mi = 0; mi < model.members.length; mi++) {
      const r = rec[mi];
      if (!r) {
        members.push(null);
        continue;
      }
      const m = model.members[mi];
      const L = this.elems[mi].L;
      // local displacements of the rigid arms
      for (let a = 0; a < 12; a++) {
        let v = 0;
        for (let b = 0; b < 12; b++) v += r.T[a * 12 + b] * u[(b < 6 ? m.i : m.j) * 6 + (b % 6)];
        ul[a] = v;
      }
      const ue = new Float64Array(12);
      const di = new Float64Array(6);
      const dj = new Float64Array(6);
      if (r.A.length) {
        // member ends: ue = A·(S·ul + p)
        const rhs = new Float64Array(12);
        for (let a = 0; a < 12; a++) rhs[a] = r.S[a] * ul[a] + r.p[a];
        for (let a = 0; a < 12; a++) {
          let v = 0;
          for (let b = 0; b < 12; b++) v += r.A[a * 12 + b] * rhs[b];
          ue[a] = v;
        }
        for (let d = 0; d < 6; d++) {
          di[d] = ue[d] - ul[d];
          dj[d] = ue[6 + d] - ul[6 + d];
        }
      } else ue.set(ul);
      // end forces on the member: K·ue − p
      const fe = new Float64Array(12);
      for (let a = 0; a < 12; a++) {
        let v = -r.p[a];
        for (let b = 0; b < 12; b++) v += r.kel[a * 12 + b] * ue[b];
        fe[a] = v;
      }
      const fi = fe.slice(0, 6);
      // section forces at j: forces on the positive face
      const fj = fe.slice(6, 12);
      const N = r.truss ? r.ea * (ue[6] - ue[0] - r.elong) : (fj[0] - fi[0]) / 2;
      members.push({ fi, fj, N, di, dj, q: r.q, L });
    }
    const reactions = new Float64Array(model.supports.length);
    model.supports.forEach((s, k) => {
      if (supportActive && supportActive[k] === false) return;
      const kk = Number.isFinite(s.k) ? s.k : s.dof < 3 ? RIGID : RIGID_ROT;
      reactions[k] = -kk * u[s.node * 6 + s.dof];
    });
    return { u, members, reactions };
  }
}

/** empty load set for a model */
export function emptyLoads3(model: FrameModel3): Loads3 {
  return { nodal: new Float64Array(model.nodes.length * 6), member: [] };
}

/**
 * Section forces of a beam member at the distance x from its start (local axes): from the end
 * forces at i and the distributed load. Sign: forces on the positive face.
 */
export function sectionForces(r: MemberResult, x: number): { N: number; Vy: number; Vz: number; Mx: number; My: number; Mz: number } {
  const [qx, qy, qz] = r.q;
  // equilibrium of the part 0…x: F(x) = −F_i − q·x
  const N = -r.fi[0] - qx * x;
  const Vy = -r.fi[1] - qy * x;
  const Vz = -r.fi[2] - qz * x;
  const Mx = -r.fi[3];
  // moments of the end forces and of the load about the section
  const My = -r.fi[4] - r.fi[2] * x - (qz * x * x) / 2;
  const Mz = -r.fi[5] + r.fi[1] * x + (qy * x * x) / 2;
  return { N, Vy, Vz, Mx, My, Mz };
}
