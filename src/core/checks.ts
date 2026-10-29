import type { Analysis, Prepared } from './analysis';
import type { SpanRegion } from './mesh';
import { combinationsEnvelope, type ViewResult } from './results';
import { designShearStrength, designStrength } from '../sections/materials';
import type { FieldArrays, SampleGrid } from './postprocess';
import type { PeriProductId } from './types';
import { X_TOL } from './types';
import { findPeriProduct, girderSupport, periInteraction, rcsInteraction, rcsResistances } from '../sections/peri';
import { analyzeLattice, characteristicCombination, latticeEnvelope, latticeOf, type LatticeMode } from './lattice';
import type { MemberRole } from '../sections/lattice';

export interface StressCheck {
  value: number;
  x: number;
  /** design resistance */
  fd: number;
  eta: number;
  ok: boolean;
  elem: number;
  /** N, M (or V) at the governing point */
  N: number;
  M: number;
  V: number;
}

export interface DeflectionCheck {
  span: SpanRegion;
  w: number;
  x: number;
  denominator: number;
  limit: number;
  eta: number;
  ok: boolean;
}

/** One verification of a PERI component */
export interface PeriCheckItem {
  /**
   * 'M' | 'V' | 'N' (single resistances), 'int' (interaction), 'Rend' | 'Rint' (support force at an
   * end / intermediate support), 'Mm' (moment at a support, GT 24), 'edge' (support distance from the girder end)
   */
  key: 'M' | 'V' | 'N' | 'int' | 'Rend' | 'Rint' | 'Mm' | 'edge' | LatticeItemKey;
  /** acting value (absolute) and resistance; for 'int' Ed = η, Rd = 1; for 'edge' Ed = distance, Rd = minimum (m) */
  Ed: number;
  Rd: number;
  eta: number;
  x: number;
  /** cross-section (SRU: A 4-4, A 5-5, B 2-2) */
  region?: string;
  /** support case (i18n key below kpi.periCase) */
  case?: 'node' | 'between' | 'near' | 'far';
  /** forces at the governing point (interaction) */
  N?: number;
  V?: number;
  M?: number;
  /** ratios of the interaction */
  parts?: { n: number; v: number; m: number; rho: number; terms: [string, number][] };
  /** lattice girders: governing verification, buckling length, χ, member section */
  mode?: LatticeMode;
  Lcr?: number;
  chi?: number;
  section?: string;
  /** lattice girder bearings: couplers 'NK/NK' …, 'head'; shares of the chords (bottom, top) */
  bearing?: string;
  shares?: [number, number];
}

/** Lattice girder items: chords, web members (diagonals, verticals, connectors), end posts, bearings */
export type LatticeItemKey = 'top' | 'bottom' | 'diag' | 'vert' | 'conn' | 'post' | 'bearing';

/** Member model of a lattice girder for the drawing */
export interface LatticeCheckView {
  name: string;
  L: number;
  h: number;
  nodes: { x: number; z: number }[];
  members: { i: number; j: number; role: MemberRole; hinged: boolean; eta: number; N: number; section: string }[];
  /** lateral restraints of the top chord */
  restraints: number[];
  supports: number[];
  /** load arrangements evaluated (combinations × pattern variants) */
  variants: number;
}

export interface PeriCheck {
  product: PeriProductId;
  method: 'design' | 'girder' | 'lattice';
  basis: 'ULS' | 'view';
  items: PeriCheckItem[];
  eta: number;
  ok: boolean;
  /** lattice girders: member model with utilisations; 'mechanism' if it cannot be solved */
  lattice?: LatticeCheckView;
  error?: 'mechanism';
}

/**
 * Uplift of a compression-only support (pinned, roller): the support can only push the beam up.
 * R_z (↑ +, force on the beam) < 0 means the beam lifts off – the support fails.
 */
export interface UpliftCheck {
  supportId: string;
  x: number;
  /** smallest R_z over the combinations (↑ +), N */
  Rmin: number;
  ok: boolean;
}

export interface Checks {
  strength: StressCheck | null;
  /** uplift of compression-only supports over all combinations */
  uplift: UpliftCheck[];
  upliftBasis: 'combos' | 'view';
  shear: StressCheck | null;
  deflection: DeflectionCheck[];
  /** checks of PERI components (per product used) */
  peri: PeriCheck[];
  /** which results were used */
  strengthBasis: 'ULS' | 'view';
  deflectionBasis: 'SLS' | 'view' | 'char';
  /** deflection from the member model of a lattice girder */
  deflectionLattice?: boolean;
}

interface Basis {
  grid: SampleGrid;
  max: FieldArrays;
  min: FieldArrays;
  reactions?: { max: Float64Array; min: Float64Array };
}

/** PERI product of an element (null for ordinary sections) */
function periOf(prep: Prepared, ei: number): PeriProductId | null {
  const def = prep.model.segments[prep.mesh.elements[ei].segIndex]?.section;
  return def?.kind === 'peri' ? def.product : null;
}

function absMax(b: Basis, f: 'N' | 'M' | 'V' | 'w', k: number) {
  const a = b.max[f][k];
  const c = b.min[f][k];
  return Math.abs(a) >= Math.abs(c) ? a : c;
}

export function strengthCheck(prep: Prepared, b: Basis): StressCheck | null {
  let best: StressCheck | null = null;
  for (let k = 0; k < b.grid.x.length; k++) {
    const ei = b.grid.elem[k];
    if (periOf(prep, ei)) continue;
    const fd = designStrength(prep.mesh.elements[ei].material);
    const s = b.max.sigma[k];
    const eta = s / fd;
    if (!best || eta > best.eta)
      best = { value: s, x: b.grid.x[k], fd, eta, ok: eta <= 1, elem: ei, N: absMax(b, 'N', k), M: absMax(b, 'M', k), V: absMax(b, 'V', k) };
  }
  return best;
}

export function shearCheck(prep: Prepared, b: Basis): StressCheck | null {
  let best: StressCheck | null = null;
  for (let k = 0; k < b.grid.x.length; k++) {
    const t = b.max.tau[k];
    if (Number.isNaN(t)) continue;
    const ei = b.grid.elem[k];
    if (periOf(prep, ei)) continue;
    const fvd = designShearStrength(prep.mesh.elements[ei].material);
    const eta = t / fvd;
    if (!best || eta > best.eta)
      best = { value: t, x: b.grid.x[k], fd: fvd, eta, ok: eta <= 1, elem: ei, N: absMax(b, 'N', k), M: absMax(b, 'M', k), V: absMax(b, 'V', k) };
  }
  return best;
}

export function deflectionChecks(prep: Prepared, b: Basis): DeflectionCheck[] {
  const st = prep.model.settings;
  return prep.mesh.spans.map((span) => {
    let w = 0;
    let x = span.x1;
    for (let k = 0; k < b.grid.x.length; k++) {
      const xk = b.grid.x[k];
      if (xk < span.x1 - 1e-9 || xk > span.x2 + 1e-9) continue;
      const v = absMax(b, 'w', k);
      if (Math.abs(v) > Math.abs(w)) {
        w = v;
        x = xk;
      }
    }
    const Ls = span.x2 - span.x1;
    const denominator = span.kind === 'cantilever' ? st.deflLimitCantilever : st.deflLimitSpan;
    const limit = Ls / denominator;
    const eta = Math.abs(w) / limit;
    return { span, w, x, denominator, limit, eta, ok: eta <= 1 };
  });
}

/** Supports that can transfer compression only (no anchoring against uplift) */
export function isCompressionOnly(type: string): boolean {
  return type === 'pinned' || type === 'roller';
}

/** Numerical tolerance for "R_z < 0": relative to the largest reaction */
export function upliftTolerance(...vecs: Float64Array[]): number {
  let m = 0;
  for (const v of vecs) for (const r of v) m = Math.max(m, Math.abs(r));
  return Math.max(1e-6, 1e-9 * m);
}

export function upliftChecks(prep: Prepared, rmin: Float64Array, rmax: Float64Array): UpliftCheck[] {
  const tol = upliftTolerance(rmin, rmax);
  const out: UpliftCheck[] = [];
  prep.model.supports.forEach((sp, i) => {
    if (!isCompressionOnly(sp.type)) return;
    const Rmin = rmin[3 * i + 1];
    out.push({ supportId: sp.id, x: sp.x, Rmin, ok: Rmin >= -tol });
  });
  return out.sort((a, b) => a.x - b.x);
}

/**
 * PERI components, design actions of the ULS envelope against the design resistances of the
 * PERI beam proofs: SRU (three net sections + interaction), RCS (EN 1993-1-1 6.2.10, Wagenknecht),
 * GT 24 / VT 20 (MULTIFLEX: V, M, support forces by support case, GT 24 also M at the supports,
 * minimum distance of the outer supports from the girder end).
 */
export function periChecks(prep: Prepared, b: Basis, basis: 'ULS' | 'view'): PeriCheck[] {
  const used = new Set<PeriProductId>();
  for (let ei = 0; ei < prep.mesh.elements.length; ei++) {
    const p = periOf(prep, ei);
    if (p) used.add(p);
  }
  const out: PeriCheck[] = [];
  for (const id of used) {
    const pr = findPeriProduct(id);
    if (!pr) continue;
    const c = pr.check;
    // lattice girders: member model (core/lattice.ts, latticeChecks)
    if (c.method === 'lattice') continue;
    const items: PeriCheckItem[] = [];
    const onProduct = (k: number) => periOf(prep, b.grid.elem[k]) === id;
    const maxAbs = (f: 'N' | 'V' | 'M', Rd: number, key: 'N' | 'V' | 'M', region?: string) => {
      let best: PeriCheckItem | null = null;
      for (let k = 0; k < b.grid.x.length; k++) {
        if (!onProduct(k)) continue;
        const v = Math.abs(absMax(b, f, k));
        if (!best || v > best.Ed) best = { key, Ed: v, Rd, eta: v / Rd, x: b.grid.x[k], region };
      }
      if (best) items.push(best);
    };
    if (c.method === 'girder') {
      maxAbs('M', c.MRd, 'M');
      maxAbs('V', c.VRd, 'V');
      const segs = prep.model.segments.filter((s) => s.section.kind === 'peri' && s.section.product === id);
      const g0 = Math.min(...segs.map((s) => s.x1));
      const g1 = Math.max(...segs.map((s) => s.x2));
      const atNode = segs.some((s) => s.section.kind === 'peri' && s.section.atNode === true);
      const sups = prep.model.supports
        .map((sp, i) => ({ sp, i }))
        .filter(({ sp }) => sp.x >= g0 - X_TOL && sp.x <= g1 + X_TOL)
        .sort((p, q) => p.sp.x - q.sp.x);
      sups.forEach(({ sp, i }, k) => {
        const end = k === 0 || k === sups.length - 1;
        const edge = Math.min(sp.x - g0, g1 - sp.x);
        const sc = girderSupport(c, end, edge, atNode);
        if (b.reactions) {
          const R = Math.max(Math.abs(b.reactions.max[3 * i + 1]), Math.abs(b.reactions.min[3 * i + 1]));
          const cs = c.byEdge ? (edge >= c.byEdge.farFrom - 1e-9 ? 'far' : 'near') : atNode ? 'node' : 'between';
          items.push({ key: end ? 'Rend' : 'Rint', Ed: R, Rd: sc.F, eta: R / sc.F, x: sp.x, case: cs });
        }
        if (sc.Mm !== undefined) {
          // moment at the support: largest |M| of the grid points at the support
          let Ms = 0;
          for (let j = 0; j < b.grid.x.length; j++) if (Math.abs(b.grid.x[j] - sp.x) < 1e-9) Ms = Math.max(Ms, Math.abs(absMax(b, 'M', j)));
          items.push({ key: 'Mm', Ed: Ms, Rd: sc.Mm, eta: Ms / sc.Mm, x: sp.x, case: atNode ? 'node' : 'between' });
        }
        if (end) items.push({ key: 'edge', Ed: edge, Rd: c.minEdge, eta: Math.min(9.99, c.minEdge / Math.max(edge, 1e-6)), x: sp.x });
      });
    } else if (c.ec3) {
      const R = rcsResistances(c.ec3);
      maxAbs('M', R.Mpl, 'M');
      maxAbs('N', R.Npl, 'N');
      maxAbs('V', R.Vpl, 'V');
      let best: PeriCheckItem | null = null;
      for (let k = 0; k < b.grid.x.length; k++) {
        if (!onProduct(k)) continue;
        const N = absMax(b, 'N', k);
        const V = absMax(b, 'V', k);
        const M = absMax(b, 'M', k);
        const q = rcsInteraction(c.ec3, N, V, M);
        if (!best || q.eta > best.eta)
          best = {
            key: 'int', Ed: q.eta, Rd: 1, eta: q.eta, x: b.grid.x[k], N, V, M,
            parts: { n: q.n, v: q.v, m: q.m, rho: q.rho, terms: [['n–v', q.nv], ['v–m', q.vm], ['n–v–m', q.nvm]] },
          };
      }
      if (best) items.push(best);
    } else {
      const multi = c.regions.length > 1;
      // single resistances: the weakest section
      const weakest = (f: 'MRd' | 'NRd' | 'VRd') => c.regions.reduce((a, r) => (r[f] < a[f] ? r : a));
      maxAbs('M', weakest('MRd').MRd, 'M', multi ? weakest('MRd').label : undefined);
      maxAbs('N', weakest('NRd').NRd, 'N', multi ? weakest('NRd').label : undefined);
      maxAbs('V', weakest('VRd').VRd, 'V', multi ? weakest('VRd').label : undefined);
      let best: PeriCheckItem | null = null;
      for (let k = 0; k < b.grid.x.length; k++) {
        if (!onProduct(k)) continue;
        const N = absMax(b, 'N', k);
        const V = absMax(b, 'V', k);
        const M = absMax(b, 'M', k);
        for (const r of c.regions) {
          const q = periInteraction(r, N, V, M);
          if (!best || q.eta > best.eta)
            best = {
              key: 'int', Ed: q.eta, Rd: 1, eta: q.eta, x: b.grid.x[k], region: multi ? r.label : undefined, N, V, M,
              parts: { n: q.n, v: q.v, m: q.my, rho: q.rho, terms: [['n–v', q.nv], ['v–m', q.vm], ['n–v–m', q.nvm]] },
            };
        }
      }
      if (best) items.push(best);
    }
    const eta = Math.max(0, ...items.map((i) => i.eta));
    out.push({ product: id, method: c.method, basis, items, eta, ok: eta <= 1 });
  }
  return out;
}

/**
 * Express checks: strength (σ = |N|/A + |M|/W ≤ f_d) from the ULS combinations, deflection
 * (w ≤ L/250 span, L/125 cantilever) from the SLS combinations. If no such combinations
 * exist, the currently displayed result is used.
 */
export function runChecks(an: Analysis, view: ViewResult): Checks | null {
  if (!an.ok || !an.prep) return null;
  const prep = an.prep;
  const uls = an.model.combinations.filter((c) => c.type === 'ULS');
  const sls = an.model.combinations.filter((c) => c.type === 'SLS');
  const ulsEnv = uls.length ? combinationsEnvelope(an, uls, view.grid) : null;
  const slsEnv = sls.length ? combinationsEnvelope(an, sls, view.grid) : null;
  const sb: Basis = ulsEnv ? { grid: view.grid, max: ulsEnv.max, min: ulsEnv.min, reactions: { max: ulsEnv.rmax, min: ulsEnv.rmin } } : view;
  const db: Basis = slsEnv ? { grid: view.grid, max: slsEnv.max, min: slsEnv.min, reactions: { max: slsEnv.rmax, min: slsEnv.rmin } } : view;
  // uplift: all ULS and SLS combinations (with pattern loading), else the displayed result
  let rmin = view.reactions.min;
  let rmax = view.reactions.max;
  if (ulsEnv || slsEnv) {
    const envs = [ulsEnv, slsEnv].filter((e) => e !== null);
    rmin = envs[0].rmin.map((_, i) => Math.min(...envs.map((e) => e.rmin[i])));
    rmax = envs[0].rmax.map((_, i) => Math.max(...envs.map((e) => e.rmax[i])));
  }
  const out: Checks = {
    strength: strengthCheck(prep, sb),
    uplift: an.model.settings.upliftCheck ? upliftChecks(prep, rmin, rmax) : [],
    upliftBasis: ulsEnv || slsEnv ? 'combos' : 'view',
    shear: an.model.settings.shearCheck ? shearCheck(prep, sb) : null,
    deflection: deflectionChecks(prep, db),
    peri: periChecks(prep, sb, ulsEnv ? 'ULS' : 'view'),
    strengthBasis: ulsEnv ? 'ULS' : 'view',
    deflectionBasis: slsEnv ? 'SLS' : 'view',
  };
  latticeChecks(an, out, view);
  return out;
}

const ROLE_KEY: Record<MemberRole, LatticeItemKey> = { top: 'top', bottom: 'bottom', diag: 'diag', vert: 'vert', conn: 'conn', post: 'post' };

/**
 * Lattice girders: member model (core/lattice.ts) for all ULS combinations (with pattern loading);
 * the deflection of the girder replaces the one of the equivalent beam (SLS combinations, else the
 * characteristic combination of all load cases).
 */
function latticeChecks(an: Analysis, out: Checks, view: ViewResult) {
  const def = latticeOf(an.model);
  if (!def || !an.prep) return;
  const la = analyzeLattice(an);
  if (!la) return;
  const uls = an.model.combinations.filter((c) => c.type === 'ULS');
  const sls = an.model.combinations.filter((c) => c.type === 'SLS');
  const basis: 'ULS' | 'view' = uls.length ? 'ULS' : 'view';
  if (la.error) {
    out.peri.push({ product: def.id, method: 'lattice', basis, items: [], eta: Infinity, ok: false, error: la.error });
    return;
  }
  // without ULS combinations: the combinations of the current view (or all load cases × 1)
  const view0 = view.view;
  const ulsUsed = uls.length ? uls : view0.type === 'combo' ? an.model.combinations.filter((c) => c.id === view0.id) : [characteristicCombination(an.model)];
  const slsUsed = sls.length ? sls : [characteristicCombination(an.model)];
  const env = latticeEnvelope(an, la, ulsUsed, slsUsed, def.cfg);
  const lm = la.model;
  const items: PeriCheckItem[] = [];
  const roles: MemberRole[] = ['top', 'bottom', 'diag', 'vert', 'conn', 'post'];
  for (const role of roles) {
    let best = -1;
    env.members.forEach((d, k) => {
      if (lm.members[k].role === role && (best < 0 || d.eta > env.members[best].eta)) best = k;
    });
    if (best < 0) continue;
    const d = env.members[best];
    items.push({ key: ROLE_KEY[role], Ed: d.eta, Rd: 1, eta: d.eta, x: d.x, N: d.N, M: d.M, V: d.V, mode: d.mode, Lcr: d.Lcr, chi: d.chi, section: lm.members[best].sec.name });
  }
  for (const b of env.bearings)
    items.push({ key: 'bearing', Ed: Math.abs(b.R), Rd: b.Rd, eta: b.eta, x: b.x, bearing: b.kind, shares: b.parts, V: b.H });
  const eta = Math.max(0, ...items.map((i) => i.eta));
  out.peri.push({
    product: def.id,
    method: 'lattice',
    basis,
    items,
    eta,
    ok: eta <= 1,
    lattice: {
      name: lm.name,
      L: lm.L,
      h: lm.h,
      nodes: lm.nodes.map((n) => ({ x: n.x, z: n.z })),
      members: lm.members.map((m, k) => ({ i: m.i, j: m.j, role: m.role, hinged: m.hinged, eta: env.members[k]?.eta ?? 0, N: env.N[k] ?? 0, section: m.sec.name })),
      restraints: lm.restraints[1],
      supports: la.supports.map((s) => s.x),
      variants: env.variants,
    },
  });
  // deflection of the member model
  const spans = an.prep.mesh.spans;
  // the 125 mm overhangs of ULA / ULS beyond the system points are not cantilevers to be checked
  out.deflection = env.deflection.filter((d) => !(spans[d.span].kind === 'cantilever' && d.x2 - d.x1 < 0.13 + 1e-9)).map((d) => ({ span: spans[d.span], w: d.w, x: d.x, denominator: d.denominator, limit: d.limit, eta: d.eta, ok: d.eta <= 1 }));
  out.deflectionBasis = sls.length ? 'SLS' : 'char';
  out.deflectionLattice = true;
}
