/**
 * Linear algebra for the FEM solver.
 *
 * The free-free stiffness matrix of a beam is symmetric positive definite and banded
 * (sequential DOF numbering gives a half bandwidth ≤ 7). The Cholesky factorisation
 * K = L·Lᵀ is therefore performed on the band only — it is the ordinary (dense) Cholesky
 * algorithm restricted to entries that are not structurally zero, so the result is
 * identical while the cost is O(n·b²) instead of O(n³).
 */

export class SymBandMatrix {
  /** row-major lower band: entry (i, j), j ≤ i, i − j ≤ bw, stored at i*(bw+1) + (i−j) */
  readonly data: Float64Array;
  constructor(
    readonly n: number,
    readonly bw: number,
  ) {
    this.data = new Float64Array(n * (bw + 1));
  }
  get(i: number, j: number): number {
    if (j > i) [i, j] = [j, i];
    if (i - j > this.bw) return 0;
    return this.data[i * (this.bw + 1) + (i - j)];
  }
  add(i: number, j: number, v: number): void {
    if (j > i) [i, j] = [j, i];
    if (i - j > this.bw) throw new Error('outside band');
    this.data[i * (this.bw + 1) + (i - j)] += v;
  }
  set(i: number, j: number, v: number): void {
    if (j > i) [i, j] = [j, i];
    if (i - j > this.bw) throw new Error('outside band');
    this.data[i * (this.bw + 1) + (i - j)] = v;
  }
  mulVec(x: ArrayLike<number>): Float64Array {
    const y = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const j0 = Math.max(0, i - this.bw);
      for (let j = j0; j <= i; j++) {
        const a = this.data[i * (this.bw + 1) + (i - j)];
        if (a === 0) continue;
        y[i] += a * x[j];
        if (j !== i) y[j] += a * x[i];
      }
    }
    return y;
  }
  /** 1-norm (= ∞-norm for symmetric matrices) */
  norm1(): number {
    const s = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const j0 = Math.max(0, i - this.bw);
      for (let j = j0; j <= i; j++) {
        const a = Math.abs(this.data[i * (this.bw + 1) + (i - j)]);
        s[i] += a;
        if (j !== i) s[j] += a;
      }
    }
    let m = 0;
    for (const v of s) m = Math.max(m, v);
    return m;
  }
}

export interface CholeskyResult {
  ok: boolean;
  /** index of the (first) zero / negative pivot */
  failedAt: number;
  /** ratio pivot / original diagonal at failure */
  ratio: number;
  L?: SymBandMatrix;
  /** smallest relative pivot d_i / K_ii encountered */
  minRelPivot: number;
}

/** Relative pivot threshold for detecting a (nearly) singular stiffness matrix */
export const PIVOT_TOL = 1e-11;

export function choleskyBand(K: SymBandMatrix, tol = PIVOT_TOL): CholeskyResult {
  const n = K.n;
  const bw = K.bw;
  const w = bw + 1;
  const L = new SymBandMatrix(n, bw);
  const a = L.data;
  a.set(K.data);
  let minRel = Infinity;
  for (let j = 0; j < n; j++) {
    const k0 = Math.max(0, j - bw);
    let d = a[j * w];
    const orig = K.data[j * w];
    for (let k = k0; k < j; k++) {
      const l = a[j * w + (j - k)];
      d -= l * l;
    }
    const rel = orig > 0 ? d / orig : d;
    minRel = Math.min(minRel, rel);
    if (!(d > 0) || !(rel > tol) || !Number.isFinite(d)) {
      return { ok: false, failedAt: j, ratio: rel, minRelPivot: minRel };
    }
    const ljj = Math.sqrt(d);
    a[j * w] = ljj;
    const iMax = Math.min(n - 1, j + bw);
    for (let i = j + 1; i <= iMax; i++) {
      let s = a[i * w + (i - j)];
      const kk0 = Math.max(0, i - bw);
      for (let k = Math.max(k0, kk0); k < j; k++) {
        s -= a[i * w + (i - k)] * a[j * w + (j - k)];
      }
      a[i * w + (i - j)] = s / ljj;
    }
  }
  return { ok: true, failedAt: -1, ratio: 1, L, minRelPivot: minRel };
}

/** Solve L·Lᵀ·x = b */
export function choleskySolve(L: SymBandMatrix, b: ArrayLike<number>): Float64Array {
  const n = L.n;
  const bw = L.bw;
  const w = bw + 1;
  const a = L.data;
  const y = Float64Array.from(b);
  for (let i = 0; i < n; i++) {
    let s = y[i];
    for (let k = Math.max(0, i - bw); k < i; k++) s -= a[i * w + (i - k)] * y[k];
    y[i] = s / a[i * w];
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    const kMax = Math.min(n - 1, i + bw);
    for (let k = i + 1; k <= kMax; k++) s -= a[k * w + (k - i)] * y[k];
    y[i] = s / a[i * w];
  }
  return y;
}

/**
 * Estimate of the 1-norm condition number κ₁(K) = ‖K‖₁·‖K⁻¹‖₁ (Hager / Higham estimator,
 * a few solves with the factorisation).
 */
export function conditionEstimate(K: SymBandMatrix, L: SymBandMatrix): number {
  const n = K.n;
  if (n === 0) return 1;
  let x = new Float64Array(n).fill(1 / n);
  let est = 0;
  for (let iter = 0; iter < 5; iter++) {
    const y = choleskySolve(L, x);
    let ny = 0;
    for (const v of y) ny += Math.abs(v);
    if (iter > 0 && ny <= est) break;
    est = ny;
    const xi = y.map((v) => (v >= 0 ? 1 : -1));
    const z = choleskySolve(L, xi); // K symmetric → Kᵀ = K
    let jmax = 0;
    let zmax = -Infinity;
    let zx = 0;
    for (let j = 0; j < n; j++) {
      zx += z[j] * x[j];
      if (Math.abs(z[j]) > zmax) {
        zmax = Math.abs(z[j]);
        jmax = j;
      }
    }
    if (zmax <= zx) break;
    x = new Float64Array(n);
    x[jmax] = 1;
  }
  return K.norm1() * est;
}

/** Dense Gaussian elimination with partial pivoting. Returns null if singular. */
export function gaussSolve(A: number[][], b: number[], tol = 1e-12): number[] | null {
  const n = A.length;
  const M = A.map((r, i) => [...r, b[i]]);
  let scale = 0;
  for (const r of A) for (const v of r) scale = Math.max(scale, Math.abs(v));
  if (scale === 0) return null;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) <= tol * scale) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Rank and a null-space basis of a dense matrix (row echelon with partial pivoting). */
export function nullSpace(A: number[][], ncols: number, tol = 1e-9): { rank: number; basis: number[][] } {
  const M = A.map((r) => [...r]);
  const rows = M.length;
  const pivCols: number[] = [];
  let r = 0;
  let scale = 0;
  for (const row of A) for (const v of row) scale = Math.max(scale, Math.abs(v));
  const eps = tol * (scale || 1);
  for (let c = 0; c < ncols && r < rows; c++) {
    let p = r;
    for (let i = r + 1; i < rows; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    if (Math.abs(M[p][c]) <= eps) continue;
    [M[r], M[p]] = [M[p], M[r]];
    const pv = M[r][c];
    for (let k = 0; k < ncols; k++) M[r][k] /= pv;
    for (let i = 0; i < rows; i++) {
      if (i === r) continue;
      const f = M[i][c];
      if (f === 0) continue;
      for (let k = 0; k < ncols; k++) M[i][k] -= f * M[r][k];
    }
    pivCols.push(c);
    r++;
  }
  const free: number[] = [];
  for (let c = 0; c < ncols; c++) if (!pivCols.includes(c)) free.push(c);
  const basis = free.map((fc) => {
    const v = new Array<number>(ncols).fill(0);
    v[fc] = 1;
    pivCols.forEach((pc, i) => {
      v[pc] = -M[i][fc];
    });
    return v;
  });
  return { rank: pivCols.length, basis };
}
