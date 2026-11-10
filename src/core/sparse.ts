/**
 * Sparse symmetric positive definite solver (Cholesky, up-looking as in CSparse) with a fill-reducing
 * minimum-degree ordering on the node graph. For 3D frame models with some ten thousand unknowns.
 */

/** Minimum-degree ordering of a graph given by its edges; returns the elimination order of the vertices */
export function minimumDegreeOrder(n: number, edges: [number, number][]): Int32Array {
  const adj: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (const [a, b] of edges)
    if (a !== b) {
      adj[a].add(b);
      adj[b].add(a);
    }
  const order = new Int32Array(n);
  const done = new Uint8Array(n);
  // buckets of vertices by degree (lazy: entries may be stale)
  const deg = new Int32Array(n);
  const buckets: number[][] = [];
  const push = (v: number) => {
    const d = adj[v].size;
    deg[v] = d;
    (buckets[d] ??= []).push(v);
  };
  for (let v = 0; v < n; v++) push(v);
  let lo = 0;
  for (let k = 0; k < n; k++) {
    let v = -1;
    for (;;) {
      const b = buckets[lo];
      if (!b || !b.length) {
        lo++;
        continue;
      }
      const c = b.pop()!;
      if (done[c] || deg[c] !== lo) continue;
      v = c;
      break;
    }
    done[v] = 1;
    order[k] = v;
    const nb = [...adj[v]];
    for (const a of nb) adj[a].delete(v);
    // the neighbours become a clique
    for (let i = 0; i < nb.length; i++) {
      const sa = adj[nb[i]];
      for (let j = i + 1; j < nb.length; j++)
        if (!sa.has(nb[j])) {
          sa.add(nb[j]);
          adj[nb[j]].add(nb[i]);
        }
    }
    for (const a of nb) {
      push(a);
      if (deg[a] < lo) lo = deg[a];
    }
    adj[v].clear();
  }
  return order;
}

/**
 * Symmetric matrix in compressed columns (upper triangle of the permuted matrix) with a fixed
 * pattern: values are set to zero and added again for every factorisation.
 */
export class SparseSym {
  readonly n: number;
  /** column pointers, row indices (sorted) and values of the upper triangle of P·A·Pᵀ */
  readonly cp: Int32Array;
  readonly ci: Int32Array;
  readonly cx: Float64Array;
  /** perm[new] = old, inv[old] = new */
  readonly perm: Int32Array;
  readonly inv: Int32Array;
  private parent: Int32Array;
  private lp: Int32Array;
  private li: Int32Array;
  private lx: Float64Array;

  /**
   * @param n number of unknowns
   * @param perm elimination order of the unknowns (perm[new] = old)
   * @param pairs pattern: pairs (i, j) of coupled unknowns in the original numbering (any order,
   *   duplicates allowed); the diagonal is always part of the pattern
   */
  constructor(n: number, perm: Int32Array, pairs: Int32Array) {
    this.n = n;
    this.perm = perm;
    this.inv = new Int32Array(n);
    for (let k = 0; k < n; k++) this.inv[perm[k]] = k;
    // columns of the upper triangle
    const cols: number[][] = Array.from({ length: n }, (_, j) => [j]);
    for (let p = 0; p < pairs.length; p += 2) {
      let i = this.inv[pairs[p]];
      let j = this.inv[pairs[p + 1]];
      if (i === j) continue;
      if (i > j) [i, j] = [j, i];
      cols[j].push(i);
    }
    this.cp = new Int32Array(n + 1);
    const rows: number[] = [];
    for (let j = 0; j < n; j++) {
      const c = cols[j].sort((a, b) => a - b);
      let last = -1;
      for (const i of c)
        if (i !== last) {
          rows.push(i);
          last = i;
        }
      this.cp[j + 1] = rows.length;
    }
    this.ci = Int32Array.from(rows);
    this.cx = new Float64Array(rows.length);
    // elimination tree
    const parent = new Int32Array(n).fill(-1);
    const anc = new Int32Array(n).fill(-1);
    for (let k = 0; k < n; k++)
      for (let p = this.cp[k]; p < this.cp[k + 1]; p++) {
        let i = this.ci[p];
        while (i !== -1 && i < k) {
          const next = anc[i];
          anc[i] = k;
          if (next === -1) parent[i] = k;
          i = next;
        }
      }
    this.parent = parent;
    // column counts of L (pattern of every row by the elimination tree)
    const count = new Int32Array(n).fill(1);
    const w = new Int32Array(n).fill(-1);
    for (let k = 0; k < n; k++) {
      w[k] = k;
      for (let p = this.cp[k]; p < this.cp[k + 1]; p++) {
        let i = this.ci[p];
        while (i < k && w[i] !== k) {
          count[i]++;
          w[i] = k;
          i = parent[i];
        }
      }
    }
    this.lp = new Int32Array(n + 1);
    for (let j = 0; j < n; j++) this.lp[j + 1] = this.lp[j] + count[j];
    this.li = new Int32Array(this.lp[n]);
    this.lx = new Float64Array(this.lp[n]);
  }

  /** statistics: calls and steps of the conjugate gradients */
  pcgCalls = 0;
  pcgSteps = 0;

  /** number of entries of the factor */
  get fill(): number {
    return this.lp[this.n];
  }

  clear() {
    this.cx.fill(0);
  }

  /** position of the entry (i, j) of the original matrix in `cx` (−1 if not in the pattern) */
  index(i0: number, j0: number): number {
    let i = this.inv[i0];
    let j = this.inv[j0];
    if (i > j) [i, j] = [j, i];
    let lo = this.cp[j];
    let hi = this.cp[j + 1] - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      const r = this.ci[m];
      if (r === i) return m;
      if (r < i) lo = m + 1;
      else hi = m - 1;
    }
    return -1;
  }

  /** diagonal entry position of the original unknown i */
  diag(i0: number): number {
    return this.cp[this.inv[i0] + 1] - 1;
  }

  /**
   * Cholesky factorisation of the current values. Returns −1 on success or the original index of
   * the unknown at which the matrix is not positive definite (mechanism / instability).
   * With `spc`, zero pivots (unknowns without stiffness: mechanisms) are fixed instead and their
   * original indices collected there (as AUTOSPC); a clearly negative pivot still fails.
   */
  factor(spc?: number[]): number {
    const { n, cp, ci, cx, parent, lp, li, lx } = this;
    this.failed = null;
    const c = new Int32Array(n);
    const x = new Float64Array(n);
    const s = new Int32Array(n);
    const w = new Int32Array(n).fill(-1);
    for (let k = 0; k < n; k++) c[k] = lp[k];
    for (let k = 0; k < n; k++) {
      // pattern of row k of L: reach of the entries of column k in the elimination tree
      let top = n;
      w[k] = k;
      let scale = 0;
      for (let p = cp[k]; p < cp[k + 1]; p++) {
        let i = ci[p];
        x[i] = cx[p];
        if (i === k) scale = Math.abs(cx[p]);
        let len = 0;
        for (; i < k && w[i] !== k; i = parent[i]) {
          s[len++] = i;
          w[i] = k;
        }
        while (len > 0) s[--top] = s[--len];
      }
      let d = x[k];
      x[k] = 0;
      for (; top < n; top++) {
        const i = s[top];
        const lki = x[i] / lx[lp[i]];
        x[i] = 0;
        for (let p = lp[i] + 1; p < c[i]; p++) x[li[p]] -= lx[p] * lki;
        d -= lki * lki;
        const p = c[i]++;
        li[p] = k;
        lx[p] = lki;
      }
      // with `spc` (search for mechanisms) also nearly zero pivots count: round-off of the rigid
      // connections leaves a little stiffness on a mechanism
      if (!(d > (spc ? 1e-8 : 1e-10) * scale) || !Number.isFinite(d)) {
        if (!spc || !Number.isFinite(d) || d < -1e-6 * scale) {
          this.failed = { k, c };
          return this.perm[k];
        }
        spc.push(this.perm[k]);
        d = Math.max(scale, 1);
      }
      const p = c[k]++;
      li[p] = k;
      lx[p] = Math.sqrt(d);
    }
    return -1;
  }

  /** row and column fill at which the last factorisation failed */
  private failed: { k: number; c: Int32Array } | null = null;

  /**
   * After a failed factorisation (pivot d ≤ 0 at the unknown k): a displacement x with xᵀ·A·x = d ≤ 0,
   * i.e. a direction in which the matrix has no stiffness (instability). x_k = 1 and the unknowns
   * eliminated before k follow it in equilibrium (x₁ = −A₁₁⁻¹·a); all others are zero. Original numbering.
   */
  negativeDirection(): Float64Array | null {
    const f = this.failed;
    if (!f) return null;
    const { lp, li, lx, perm, n } = this;
    const { k, c } = f;
    const x = new Float64Array(k + 1);
    x[k] = 1;
    // L₁₁ᵀ·x₁ = −l (row k of L, already stored as the last entries of its columns)
    for (let j = k - 1; j >= 0; j--) {
      let v = 0;
      for (let p = lp[j] + 1; p < c[j]; p++) v -= lx[p] * x[li[p]];
      x[j] = v / lx[lp[j]];
    }
    const out = new Float64Array(n);
    for (let j = 0; j <= k; j++) out[perm[j]] = x[j];
    return out;
  }

  /** y = A·x with the current values (original numbering) */
  multiply(x: Float64Array): Float64Array {
    const { n, cp, ci, cx, perm } = this;
    const xp = new Float64Array(n);
    for (let k = 0; k < n; k++) xp[k] = x[perm[k]];
    const yp = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      const xj = xp[j];
      let v = 0;
      for (let p = cp[j]; p < cp[j + 1]; p++) {
        const i = ci[p];
        const a = cx[p];
        if (i === j) v += a * xj;
        else {
          v += a * xp[i];
          yp[i] += a * xj;
        }
      }
      yp[j] += v;
    }
    const y = new Float64Array(n);
    for (let k = 0; k < n; k++) y[perm[k]] = yp[k];
    return y;
  }

  /**
   * Solve A·x = b for the current values by conjugate gradients, preconditioned with the last
   * factorisation (of a matrix close to the current one, e.g. the previous step of a non-linear
   * iteration). Returns null if it does not converge within `maxIt` steps (then factorise again).
   */
  pcg(b: Float64Array, tol = 1e-9, maxIt = 25): Float64Array | null {
    this.pcgCalls++;
    const n = this.n;
    const x = this.solve(b);
    const Ax = this.multiply(x);
    const r = new Float64Array(n);
    for (let k = 0; k < n; k++) r[k] = b[k] - Ax[k];
    let z = this.solve(r);
    const z0 = this.solve(b);
    let ref = 0;
    for (let k = 0; k < n; k++) ref += b[k] * z0[k];
    if (!(ref > 0)) return x;
    let rz = 0;
    for (let k = 0; k < n; k++) rz += r[k] * z[k];
    const p = Float64Array.from(z);
    for (let it = 0; it < maxIt; it++) {
      if (!(rz > 0) || Math.sqrt(rz / ref) <= tol) return x;
      this.pcgSteps++;
      const Ap = this.multiply(p);
      let pAp = 0;
      for (let k = 0; k < n; k++) pAp += p[k] * Ap[k];
      if (!(pAp > 0)) return null;
      const alpha = rz / pAp;
      for (let k = 0; k < n; k++) {
        x[k] += alpha * p[k];
        r[k] -= alpha * Ap[k];
      }
      z = this.solve(r);
      let rz1 = 0;
      for (let k = 0; k < n; k++) rz1 += r[k] * z[k];
      const beta = rz1 / rz;
      rz = rz1;
      for (let k = 0; k < n; k++) p[k] = z[k] + beta * p[k];
    }
    return Math.sqrt(Math.max(rz, 0) / ref) <= tol ? x : null;
  }

  /** solve A·x = b with the last factorisation (b in the original numbering, not modified) */
  solve(b: Float64Array): Float64Array {
    const { n, lp, li, lx, perm } = this;
    const y = new Float64Array(n);
    for (let k = 0; k < n; k++) y[k] = b[perm[k]];
    for (let j = 0; j < n; j++) {
      y[j] /= lx[lp[j]];
      const yj = y[j];
      for (let p = lp[j] + 1; p < lp[j + 1]; p++) y[li[p]] -= lx[p] * yj;
    }
    for (let j = n - 1; j >= 0; j--) {
      let v = y[j];
      for (let p = lp[j] + 1; p < lp[j + 1]; p++) v -= lx[p] * y[li[p]];
      y[j] = v / lx[lp[j]];
    }
    const x = new Float64Array(n);
    for (let k = 0; k < n; k++) x[perm[k]] = y[k];
    return x;
  }
}
