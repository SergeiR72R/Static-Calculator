/**
 * Plane frame element with 3 DOFs per node: u (axial), w (transverse, +z down), θ (= dw/dx, clockwise).
 * Local DOF order: [u1, w1, θ1, u2, w2, θ2].
 *
 * Euler–Bernoulli by default; Timoshenko via the shear parameter Φ = 12·EI / (G·A_s·L²).
 */

export type Mat6 = number[][];

export interface ElementProps {
  L: number;
  EA: number;
  EI: number;
  /** G·A_s, Infinity for Euler–Bernoulli */
  GAs: number;
}

export function shearParam(p: ElementProps): number {
  return Number.isFinite(p.GAs) ? (12 * p.EI) / (p.GAs * p.L * p.L) : 0;
}

/** Local element stiffness matrix k (6×6) */
export function localStiffness(p: ElementProps): Mat6 {
  const { L, EA, EI } = p;
  const phi = shearParam(p);
  const a = EA / L;
  const c = EI / ((1 + phi) * L ** 3);
  const k = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
  k[0][0] = a;
  k[0][3] = -a;
  k[3][0] = -a;
  k[3][3] = a;
  const B = [
    [12, 6 * L, -12, 6 * L],
    [6 * L, (4 + phi) * L * L, -6 * L, (2 - phi) * L * L],
    [-12, -6 * L, 12, -6 * L],
    [6 * L, (2 - phi) * L * L, -6 * L, (4 + phi) * L * L],
  ];
  const idx = [1, 2, 4, 5];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) k[idx[i]][idx[j]] = c * B[i][j];
  return k;
}

/**
 * Transformation matrix T (local ← global) for an element whose axis is rotated by β
 * (measured clockwise from +x, consistent with z downwards). For the straight beam β = 0 → T = I.
 */
export function transformation(beta: number): Mat6 {
  const c = Math.cos(beta);
  const s = Math.sin(beta);
  const T = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
  for (const o of [0, 3]) {
    T[o][o] = c;
    T[o][o + 1] = s;
    T[o + 1][o] = -s;
    T[o + 1][o + 1] = c;
    T[o + 2][o + 2] = 1;
  }
  return T;
}

export function matMul(A: Mat6, B: Mat6): Mat6 {
  const n = A.length;
  const m = B[0].length;
  const r = Array.from({ length: n }, () => new Array<number>(m).fill(0));
  for (let i = 0; i < n; i++)
    for (let k = 0; k < B.length; k++) {
      const a = A[i][k];
      if (a === 0) continue;
      for (let j = 0; j < m; j++) r[i][j] += a * B[k][j];
    }
  return r;
}

export function transpose(A: Mat6): Mat6 {
  return A[0].map((_, j) => A.map((row) => row[j]));
}

/** Global element stiffness K_e = Tᵀ·k·T */
export function globalStiffness(p: ElementProps, beta = 0): Mat6 {
  const k = localStiffness(p);
  if (beta === 0) return k;
  const T = transformation(beta);
  return matMul(matMul(transpose(T), k), T);
}

export function matVec(A: Mat6, x: ArrayLike<number>): number[] {
  return A.map((row) => row.reduce((s, a, j) => s + a * x[j], 0));
}

/** Linear load on the element: transverse q (+z) and axial p (+x), values at both ends, N/m */
export interface ElementLoad {
  q1: number;
  q2: number;
  p1: number;
  p2: number;
}

/**
 * Fixed-end internal forces at the left end (ξ = 0+) of a fully clamped element under the
 * span load, from the exact (flexibility) solution: N0, V0, M0.
 */
export function fixedEndState(p: ElementProps, ld: ElementLoad): { N0: number; V0: number; M0: number } {
  const { L, EI, GAs } = p;
  const { q1, q2, p1, p2 } = ld;
  const dq = q2 - q1;
  // axial: u(L) − u(0) = 0  →  N0 = (1/L)·∫P1 = L(2p1 + p2)/6
  const N0 = (L * (2 * p1 + p2)) / 6;
  // bending: ψ(L) = 0 and w(L) = 0 with ψ' = −M/EI, w' = ψ + V/GA_s
  //  eq1: M0·L + V0·L²/2 = q1·L³/6 + dq·L³/24
  //  eq2: (1/EI)(M0·L²/2 + V0·L³/6 − q1·L⁴/24 − dq·L⁴/120) − (1/GAs)(V0·L − q1·L²/2 − dq·L²/6) = 0
  const fs = Number.isFinite(GAs) ? 1 / GAs : 0;
  const a11 = L;
  const a12 = (L * L) / 2;
  const b1 = (q1 * L ** 3) / 6 + (dq * L ** 3) / 24;
  const a21 = (L * L) / 2 / EI;
  const a22 = L ** 3 / 6 / EI - fs * L;
  const b2 = ((q1 * L ** 4) / 24 + (dq * L ** 4) / 120) / EI - fs * ((q1 * L * L) / 2 + (dq * L * L) / 6);
  const det = a11 * a22 - a12 * a21;
  const M0 = (b1 * a22 - a12 * b2) / det;
  const V0 = (a11 * b2 - a21 * b1) / det;
  return { N0, V0, M0 };
}

/**
 * Equivalent nodal load vector r (local, same order as DOFs) = negative fixed-end forces.
 * For Euler–Bernoulli this equals F₁ = L(7q₁+3q₂)/20, M₁ = L²(3q₁+2q₂)/60,
 * F₂ = L(3q₁+7q₂)/20, M₂ = −L²(2q₁+3q₂)/60.
 */
export function equivalentNodalLoads(p: ElementProps, ld: ElementLoad): number[] {
  const { L } = p;
  const { N0, V0, M0 } = fixedEndState(p, ld);
  const s = endStateRight(L, N0, V0, M0, ld);
  // fixed-end forces acting on the element: f_u1 = −N0, f_w1 = −V0, f_θ1 = M0, f_u2 = N(L), f_w2 = V(L), f_θ2 = −M(L)
  // r = −f
  return [N0, V0, -M0, -s.N, -s.V, s.M];
}

/** Internal forces at ξ = L given the state at ξ = 0+ */
export function endStateRight(L: number, N0: number, V0: number, M0: number, ld: ElementLoad) {
  return {
    N: axialForce(L, L, N0, ld),
    V: shearForce(L, L, V0, ld),
    M: bendingMoment(L, L, V0, M0, ld),
  };
}

export function axialForce(xi: number, L: number, N0: number, ld: ElementLoad): number {
  return N0 - ld.p1 * xi - ((ld.p2 - ld.p1) * xi * xi) / (2 * L);
}

export function shearForce(xi: number, L: number, V0: number, ld: ElementLoad): number {
  return V0 - ld.q1 * xi - ((ld.q2 - ld.q1) * xi * xi) / (2 * L);
}

export function bendingMoment(xi: number, L: number, V0: number, M0: number, ld: ElementLoad): number {
  return M0 + V0 * xi - (ld.q1 * xi * xi) / 2 - ((ld.q2 - ld.q1) * xi ** 3) / (6 * L);
}

/** Axial displacement u(ξ) = u1 + (1/EA)·∫N */
export function axialDisplacement(xi: number, p: ElementProps, u1: number, N0: number, ld: ElementLoad): number {
  const dp = ld.p2 - ld.p1;
  return u1 + (N0 * xi - (ld.p1 * xi * xi) / 2 - (dp * xi ** 3) / (6 * p.L)) / p.EA;
}

/** Hermite shape functions (cubic) for w1, θ1, w2, θ2 and their derivatives */
export function hermite(xi: number, L: number): { N: number[]; dN: number[] } {
  const s = xi / L;
  return {
    N: [1 - 3 * s * s + 2 * s ** 3, L * (s - 2 * s * s + s ** 3), 3 * s * s - 2 * s ** 3, L * (-s * s + s ** 3)],
    dN: [(-6 * s + 6 * s * s) / L, 1 - 4 * s + 3 * s * s, (6 * s - 6 * s * s) / L, -2 * s + 3 * s * s],
  };
}

/**
 * Euler–Bernoulli deflection: Hermite interpolation of the nodal values plus the particular
 * solution of the clamped–clamped element under its span load.
 */
export function deflectionEB(
  xi: number,
  p: ElementProps,
  d: { w1: number; t1: number; w2: number; t2: number },
  ld: ElementLoad,
): { w: number; theta: number } {
  const { N, dN } = hermite(xi, p.L);
  let w = N[0] * d.w1 + N[1] * d.t1 + N[2] * d.w2 + N[3] * d.t2;
  let theta = dN[0] * d.w1 + dN[1] * d.t1 + dN[2] * d.w2 + dN[3] * d.t2;
  if (ld.q1 !== 0 || ld.q2 !== 0) {
    const f = fixedEndState(p, ld);
    const dq = ld.q2 - ld.q1;
    const L = p.L;
    w -= ((f.M0 * xi * xi) / 2 + (f.V0 * xi ** 3) / 6 - (ld.q1 * xi ** 4) / 24 - (dq * xi ** 5) / (120 * L)) / p.EI;
    theta -= (f.M0 * xi + (f.V0 * xi * xi) / 2 - (ld.q1 * xi ** 3) / 6 - (dq * xi ** 4) / (24 * L)) / p.EI;
  }
  return { w, theta };
}

/**
 * Exact deflection by integration from the left end (valid for Timoshenko and Euler–Bernoulli):
 * ψ(ξ) = θ1 − (1/EI)∫M,  w(ξ) = w1 + ∫ψ + (1/GA_s)∫V.
 */
export function deflectionIntegrated(
  xi: number,
  p: ElementProps,
  w1: number,
  t1: number,
  V0: number,
  M0: number,
  ld: ElementLoad,
): { w: number; theta: number } {
  const L = p.L;
  const dq = ld.q2 - ld.q1;
  const intM = M0 * xi + (V0 * xi * xi) / 2 - (ld.q1 * xi ** 3) / 6 - (dq * xi ** 4) / (24 * L);
  const intIntM = (M0 * xi * xi) / 2 + (V0 * xi ** 3) / 6 - (ld.q1 * xi ** 4) / 24 - (dq * xi ** 5) / (120 * L);
  const intV = V0 * xi - (ld.q1 * xi * xi) / 2 - (dq * xi ** 3) / (6 * L);
  const fs = Number.isFinite(p.GAs) ? 1 / p.GAs : 0;
  return { theta: t1 - intM / p.EI, w: w1 + t1 * xi - intIntM / p.EI + fs * intV };
}
