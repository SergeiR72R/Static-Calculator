/**
 * Lattice girders (PERI ULA HD, ULS, ULS Flex) as plane frame models, like an RSTAB member model:
 * continuous chords (frame members), pin-ended diagonals / verticals / connectors, end posts welded to
 * the chords. The loads of the beam model act on the top chord at their x; both chords are supported
 * vertically at every support (tube couplers / ledger heads at the standard), the bottom chord of the
 * first support horizontally. Load cases, pattern loading and combinations as in the beam analysis.
 *
 * Design (ULS combinations, design values, γ_M as in the PERI design concept):
 *  - steel members EN 1993-1-1: N_Rd = A·f_y/γ_M, M_Rd = min(W_pl; 1.25·W_el)·f_y/γ_M (PERI
 *    Tabellenbuch: α_pl ≤ 1.25), N–M interaction 6.2.9.1 (CHS: M_N = M_Rd·(1 − n^1.7), RHS:
 *    M_N = M_Rd·(1 − n)/(1 − 0.5·a_w)), shear V ≤ A_v·f_y/(√3·γ_M); flexural buckling (curve a) with
 *    6.3.3 / Annex B (C_m = 1): n/χ_y + k_yy·m ≤ 1, n/χ_z + 0.6·k_yy·m ≤ 1;
 *  - aluminium EN 1999-1-1 (EN AW-6082 T5): N_Rd = A·f_0/γ_M1, M_Rd = W_pl·f_0/γ_M1, heat affected
 *    zone at the welded nodes: N_Rd,haz = min(ρ_o,haz·A·f_0/γ_M1; ρ_u,haz·A·f_u/γ_M2) (analogous M),
 *    flexural buckling class A (α = 0.20, λ̄_0 = 0.10), linear interaction n/χ + m ≤ 1 (y), n/χ_z +
 *    0.6·m ≤ 1 (z);
 *  - buckling lengths: chords in plane = distance of the web connections, out of plane = distance of
 *    the lateral restraints (top chord: spacing a, bottom chord: supports; ULS Flex: standards and
 *    connectors); web members, posts, connectors: system length;
 *  - supports: tube couplers EN 74-1 class B (NK: F_Rd = 9.1 kN·1.5, UNK: 15.1 kN·1.5) per chord,
 *    ULS Flex ledger heads UH Plus at rosette 8 mm (Z-8.22-863: V_z,Rd = +30.4 / −13.4 kN, N_Rd = 37.3 kN);
 *  - deflection of the girder (SLS combinations) against the limits of the settings.
 */
import type { Analysis, Prepared } from './analysis';
import { usesPattern } from './analysis';
import { restrainsW, spanIndexAt, supportRestraint } from './mesh';
import type { BeamModel, Combination, Id, LatticeConfig, PeriProductId } from './types';
import { G_ACC } from './types';
import { dirCos } from './element';
import { FrameMechanismError, MEMBER_SAMPLES, addLine, combineFrame, emptyLoad, frameSolver, type FrameLoad, type FrameResult } from './frame2d';
import { isLattice, latticeModel, type LatticeId, type LatticeMember, type LatticeModel, type MemberRole, type MemberSection } from '../sections/lattice';

const kN = 1e3;

/** Design resistances of the bearings (N) */
export const COUPLER_RD = { NK: 9.1 * 1.5 * kN, UNK: 15.1 * 1.5 * kN };
export const HEAD_RD = { Vdown: 30.4 * kN, Vup: 13.4 * kN, N: 37.3 * kN };
/** pattern parts enumerated explicitly up to this count (2^n variants) */
const MAX_PATTERN_PARTS = 8;
/** half width of the heat affected zone next to a weld (EN 1999-1-1 6.1.6.3, t ≤ 6 mm, MIG), m */
const B_HAZ = 0.02;

export interface LatticeSupport {
  supportId: Id;
  x: number;
  /** node indices (bottom, top) */
  nodes: [number, number];
}

interface CaseFrame {
  full: FrameResult;
  pattern?: { rest: FrameResult; spans: FrameResult[] };
}

export interface LatticeAnalysis {
  product: LatticeId;
  model: LatticeModel;
  supports: LatticeSupport[];
  cases: Map<Id, CaseFrame>;
  error?: 'mechanism';
}

/** Section definition of the girder (the whole beam must consist of one lattice product) */
export function latticeOf(model: BeamModel): { id: LatticeId; cfg?: LatticeConfig } | null {
  const s0 = model.segments[0]?.section;
  if (!s0 || s0.kind !== 'peri' || !isLattice(s0.product)) return null;
  for (const s of model.segments) if (s.section.kind !== 'peri' || s.section.product !== s0.product) return null;
  return { id: s0.product as LatticeId, cfg: s0.lattice };
}

/** Uses a lattice product somewhere (also mixed with other sections) */
export function usesLattice(model: BeamModel): PeriProductId | null {
  for (const s of model.segments) if (s.section.kind === 'peri' && isLattice(s.section.product)) return s.section.product;
  return null;
}

function loadPoints(model: BeamModel): number[] {
  const xs: number[] = [];
  for (const s of model.supports) xs.push(s.x);
  for (const l of model.loads) {
    if (l.kind === 'dist') xs.push(l.x1, l.x2);
    else xs.push(l.x);
  }
  for (const sp of model.supports) xs.push(sp.x);
  return xs;
}

/** chord members of a chord, sorted by x */
function chordMembers(lm: LatticeModel, chord: 0 | 1): number[] {
  return lm.members
    .map((m, k) => ({ m, k }))
    .filter(({ m }) => m.role === (chord === 1 ? 'top' : 'bottom'))
    .sort((a, b) => lm.nodes[a.m.i].x - lm.nodes[b.m.i].x)
    .map((p) => p.k);
}

function nodeAt(lm: LatticeModel, chord: 0 | 1, x: number): number {
  let best = -1;
  let d = Infinity;
  lm.nodes.forEach((n, i) => {
    if (n.chord !== chord) return;
    const e = Math.abs(n.x - x);
    if (e < d) {
      d = e;
      best = i;
    }
  });
  return best;
}

/** Load vector of a load case (or the pattern part 'rest' / span index) */
function caseLoad(prep: Prepared, lm: LatticeModel, caseId: Id, filter: 'all' | 'rest' | number): FrameLoad {
  const { model, mesh } = prep;
  const load = emptyLoad(lm.nodes.length);
  const spanOk = (x: number) => filter === 'all' || (filter !== 'rest' && spanIndexAt(mesh.spans, x) === filter);
  const top = chordMembers(lm, 1);
  for (const l of model.loads) {
    if (l.caseId !== caseId) continue;
    if (l.kind === 'point') {
      if (!spanOk(l.x)) continue;
      const n = nodeAt(lm, 1, l.x);
      const [c, s] = dirCos(l.angle);
      load.F[3 * n] += l.P * c;
      load.F[3 * n + 1] -= l.P * s;
    } else if (l.kind === 'moment') {
      if (!spanOk(l.x)) continue;
      const n = nodeAt(lm, 1, l.x);
      load.F[3 * n + 2] -= l.M;
    } else {
      const span = l.x2 - l.x1;
      for (const k of top) {
        const m = lm.members[k];
        const xa = lm.nodes[m.i].x;
        const xb = lm.nodes[m.j].x;
        const xm = (xa + xb) / 2;
        if (xm <= l.x1 || xm >= l.x2) continue;
        if (filter !== 'all' && (filter === 'rest' || spanIndexAt(mesh.spans, xm) !== filter)) continue;
        const qa = l.q1 + ((l.q2 - l.q1) * (xa - l.x1)) / span;
        const qb = l.q1 + ((l.q2 - l.q1) * (xb - l.x1)) / span;
        addLine(load, k, l.dir === 'z' ? [0, -qa, 0, -qb] : [qa, 0, qb, 0]);
      }
    }
  }
  // self weight of the girder: half on each chord
  if (model.settings.selfWeight && caseId === prep.selfWeightCase) {
    const g = (lm.mass * G_ACC) / 2;
    for (const c of [0, 1] as const)
      for (const k of chordMembers(lm, c)) {
        const xm = (lm.nodes[lm.members[k].i].x + lm.nodes[lm.members[k].j].x) / 2;
        if (filter !== 'all' && (filter === 'rest' || spanIndexAt(mesh.spans, xm) !== filter)) continue;
        addLine(load, k, [0, -g, 0, -g]);
      }
  }
  return load;
}

const analysisCache = new WeakMap<Analysis, LatticeAnalysis | null>();

export function analyzeLattice(an: Analysis): LatticeAnalysis | null {
  if (analysisCache.has(an)) return analysisCache.get(an) ?? null;
  const res = computeLattice(an);
  analysisCache.set(an, res);
  return res;
}

function computeLattice(an: Analysis): LatticeAnalysis | null {
  if (!an.ok || !an.prep) return null;
  const prep = an.prep;
  const model = an.model;
  const def = latticeOf(model);
  if (!def) return null;
  const lm = latticeModel(def.id, model.L, def.cfg, loadPoints(model));
  const sups = model.supports
    .filter(restrainsW)
    .map((s) => ({ supportId: s.id, x: s.x, nodes: [nodeAt(lm, 0, s.x), nodeAt(lm, 1, s.x)] as [number, number] }))
    .sort((a, b) => a.x - b.x);
  const out: LatticeAnalysis = { product: def.id, model: lm, supports: sups, cases: new Map() };
  if (!sups.length) {
    out.error = 'mechanism';
    return out;
  }
  const fs: { node: number; dof: 0 | 1 | 2 }[] = [];
  for (const s of sups) fs.push({ node: s.nodes[0], dof: 1 }, { node: s.nodes[1], dof: 1 });
  const hor = model.supports.filter((s) => supportRestraint(s).u).sort((a, b) => a.x - b.x)[0] ?? model.supports[0];
  fs.push({ node: nodeAt(lm, 0, hor.x), dof: 0 });
  let solver;
  try {
    solver = frameSolver(
      lm.nodes,
      lm.members.map((m) => ({ i: m.i, j: m.j, EA: m.sec.mat.E * m.sec.A, EI: m.sec.mat.E * m.sec.Iy, hinged: m.hinged })),
      fs,
    );
  } catch (e) {
    if (e instanceof FrameMechanismError) {
      out.error = 'mechanism';
      return out;
    }
    throw e;
  }
  for (const lc of model.loadCases) {
    const full = solver.solve(caseLoad(prep, lm, lc.id, 'all'));
    const cf: CaseFrame = { full };
    if (usesPattern(model, prep.mesh, lc.id))
      cf.pattern = {
        rest: solver.solve(caseLoad(prep, lm, lc.id, 'rest')),
        spans: prep.mesh.spans.map((s) => solver.solve(caseLoad(prep, lm, lc.id, s.index))),
      };
    out.cases.set(lc.id, cf);
  }
  return out;
}

/** All load arrangements of a combination (pattern loading enumerated) */
export function combinationVariants(la: LatticeAnalysis, factors: Record<Id, number>): FrameResult[] {
  const base: [number, FrameResult][] = [];
  const parts: [number, FrameResult][] = [];
  let like: FrameResult | null = null;
  for (const [cid, f] of Object.entries(factors)) {
    if (!f) continue;
    const c = la.cases.get(cid);
    if (!c) continue;
    like = c.full;
    if (c.pattern && c.pattern.spans.length <= MAX_PATTERN_PARTS) {
      base.push([f, c.pattern.rest]);
      for (const s of c.pattern.spans) parts.push([f, s]);
    } else base.push([f, c.full]);
  }
  if (!like) return [];
  if (parts.length > MAX_PATTERN_PARTS) {
    // too many parts: full load only
    return [combineFrame([...base, ...parts], like)];
  }
  const out: FrameResult[] = [];
  for (let mask = 0; mask < 1 << parts.length; mask++) {
    const t = [...base];
    parts.forEach((p, k) => {
      if (mask & (1 << k)) t.push(p);
    });
    out.push(combineFrame(t, like));
  }
  return out;
}

// ---------------------------------------------------------------- design

export type LatticeMode = 'section' | 'haz' | 'bucklingY' | 'bucklingZ' | 'shear' | 'tension' | 'compression';

export interface MemberDesign {
  eta: number;
  mode: LatticeMode;
  /** forces at the governing point (N > 0 tension) */
  N: number;
  M: number;
  V: number;
  /** buckling length and χ (buckling modes) */
  Lcr?: number;
  chi?: number;
  /** x of the governing point */
  x: number;
}

function chi(sec: MemberSection, Lcr: number, axis: 'y' | 'z'): { chi: number; lambda: number } {
  const m = sec.mat;
  const I = axis === 'y' ? sec.Iy : sec.Iz;
  const Ncr = (Math.PI ** 2 * m.E * I) / (Lcr * Lcr);
  const lambda = Math.sqrt((sec.A * m.f0) / Ncr);
  if (lambda <= m.lambda0) return { chi: 1, lambda };
  const phi = 0.5 * (1 + m.alpha * (lambda - m.lambda0) + lambda * lambda);
  return { chi: Math.min(1, 1 / (phi + Math.sqrt(phi * phi - lambda * lambda))), lambda };
}

function NRd(sec: MemberSection) {
  return (sec.A * sec.mat.f0) / sec.mat.gM1;
}

function MRd(sec: MemberSection) {
  const W = sec.mat.kind === 'steel' ? Math.min(sec.Wpl, 1.25 * sec.Wel) : sec.Wpl;
  return (W * sec.mat.f0) / sec.mat.gM1;
}

function VRd(sec: MemberSection) {
  return (sec.Av * sec.mat.f0) / (Math.sqrt(3) * sec.mat.gM1);
}

/** cross-section utilisation for N and M (in the heat affected zone if `haz`) */
function sectionEta(sec: MemberSection, N: number, M: number, haz: boolean): number {
  const m = sec.mat;
  if (m.kind === 'alu') {
    let Nr = NRd(sec);
    let Mr = MRd(sec);
    if (haz && m.haz) {
      Nr = Math.min(m.haz.rhoO * Nr, (m.haz.rhoU * sec.A * m.fu) / m.gM2);
      Mr = Math.min(m.haz.rhoO * Mr, (m.haz.rhoU * sec.Wel * m.fu) / m.gM2);
    }
    return Math.abs(N) / Nr + Math.abs(M) / Mr;
  }
  const n = Math.abs(N) / NRd(sec);
  if (n >= 1) return n + Math.abs(M) / MRd(sec);
  const MN = sec.tube ? MRd(sec) * (1 - n ** 1.7) : Math.min(MRd(sec), (MRd(sec) * (1 - n)) / (1 - 0.5 * sec.aw));
  return Math.max(n, Math.abs(M) / MN);
}

/** member buckling with bending (N < 0 compression) */
function bucklingEta(sec: MemberSection, N: number, M: number, Ly: number, Lz: number): { y: number; z: number; chiY: number; chiZ: number } {
  const c = Math.max(0, -N);
  const cy = chi(sec, Ly, 'y');
  const cz = chi(sec, Lz, 'z');
  const ny = c / (cy.chi * NRd(sec));
  const nz = c / (cz.chi * NRd(sec));
  const m = Math.abs(M) / MRd(sec);
  const kyy = sec.mat.kind === 'steel' ? Math.min(1 + Math.max(0, cy.lambda - 0.2) * ny, 1 + 0.8 * ny) : 1;
  return { y: ny + kyy * m, z: nz + 0.6 * kyy * m, chiY: cy.chi, chiZ: cz.chi };
}

/** interval [a, b] of sorted points containing x */
function interval(pts: number[], x: number, L: number): [number, number] {
  let a = 0;
  let b = L;
  for (const p of pts) {
    if (p <= x + 1e-9) a = p;
    if (p > x + 1e-9) {
      b = p;
      break;
    }
  }
  return [a, b];
}

const isWeb = (r: MemberRole) => r === 'diag' || r === 'vert' || r === 'conn';

export interface LatticeDesign {
  /** per member: governing design (over all variants) */
  members: MemberDesign[];
  /** governing axial force per member (signed) and the variant result of the governing member */
  N: Float64Array;
}

/** Design of all members for one result (one load arrangement) */
export function designMembers(la: LatticeAnalysis, r: FrameResult): MemberDesign[] {
  const lm = la.model;
  const out: MemberDesign[] = [];
  // nodes with welded web members (HAZ of aluminium chords)
  const weldNode = new Uint8Array(lm.nodes.length);
  if (lm.welded)
    for (const m of lm.members)
      if (isWeb(m.role) || m.role === 'post') {
        weldNode[m.i] = 1;
        weldNode[m.j] = 1;
      }
  // largest |M| per in-plane buckling interval and per out-of-plane interval of each chord
  const chordInfo = new Map<number, { Ly: number; Lz: number; My: number; Mz: number; Ncy: number; Ncz: number }>();
  for (const c of [0, 1] as const) {
    const ks = chordMembers(lm, c);
    const groups = (pts: number[]) => {
      const g = new Map<string, number[]>();
      for (const k of ks) {
        const xm = (lm.nodes[lm.members[k].i].x + lm.nodes[lm.members[k].j].x) / 2;
        const key = interval(pts, xm, lm.L).join('|');
        g.set(key, [...(g.get(key) ?? []), k]);
      }
      return g;
    };
    const stat = (list: number[]) => {
      let M = 0;
      let Nc = 0;
      for (const k of list) {
        Nc = Math.min(Nc, r.N1[k], r.N2[k]);
        for (let s = 0; s < MEMBER_SAMPLES; s++) M = Math.max(M, Math.abs(r.M[k * MEMBER_SAMPLES + s]));
      }
      return { M, Nc };
    };
    for (const [key, list] of groups(lm.braces[c])) {
      const [a, b] = key.split('|').map(Number);
      const st = stat(list);
      for (const k of list) chordInfo.set(k, { Ly: b - a, Lz: 0, My: st.M, Mz: 0, Ncy: st.Nc, Ncz: 0 });
    }
    for (const [key, list] of groups(lm.restraints[c])) {
      const [a, b] = key.split('|').map(Number);
      const st = stat(list);
      for (const k of list) Object.assign(chordInfo.get(k)!, { Lz: b - a, Mz: st.M, Ncz: st.Nc });
    }
  }
  lm.members.forEach((m: LatticeMember, k) => {
    const sec = m.sec;
    const xi = lm.nodes[m.i].x;
    const xj = lm.nodes[m.j].x;
    const L = Math.hypot(xj - xi, lm.nodes[m.j].z - lm.nodes[m.i].z);
    let best: MemberDesign = { eta: 0, mode: 'section', N: r.N[k], M: 0, V: 0, x: (xi + xj) / 2 };
    const take = (d: MemberDesign) => {
      if (d.eta > best.eta) best = d;
    };
    if (m.hinged) {
      // truss member: axial force only
      const N = r.N[k];
      const xm = (xi + xj) / 2;
      if (N >= 0) {
        let Nr = NRd(sec);
        if (sec.mat.haz && lm.welded) Nr = Math.min(Nr, (sec.mat.haz.rhoU * sec.A * sec.mat.fu) / sec.mat.gM2);
        take({ eta: N / Nr, mode: 'tension', N, M: 0, V: 0, x: xm });
      } else {
        if (sec.mat.haz && lm.welded) take({ eta: sectionEta(sec, N, 0, true), mode: 'haz', N, M: 0, V: 0, x: xm });
        else take({ eta: -N / NRd(sec), mode: 'compression', N, M: 0, V: 0, x: xm });
        // pin-ended: buckling length = system length about both axes
        const c = Math.min(chi(sec, L, 'y').chi, chi(sec, L, 'z').chi);
        take({ eta: -N / (c * NRd(sec)), mode: L > 0 && c < 1 ? (sec.Iz < sec.Iy ? 'bucklingZ' : 'bucklingY') : 'compression', N, M: 0, V: 0, Lcr: L, chi: c, x: xm });
      }
      out.push(best);
      return;
    }
    // frame member (chords, posts): every sample point
    const Vmax = Math.max(Math.abs(r.V1[k]), Math.abs(r.V2[k]));
    take({ eta: Vmax / VRd(sec), mode: 'shear', N: r.N[k], M: 0, V: Vmax, x: (xi + xj) / 2 });
    for (let s = 0; s < MEMBER_SAMPLES; s++) {
      const t = s / (MEMBER_SAMPLES - 1);
      const x = xi + (xj - xi) * t;
      const N = r.N1[k] + (r.N2[k] - r.N1[k]) * t;
      const M = r.M[k * MEMBER_SAMPLES + s];
      const nearWeld = (s === 0 && weldNode[m.i]) || (s === MEMBER_SAMPLES - 1 && weldNode[m.j]) || (m.role === 'post' && lm.welded);
      const haz = !!(sec.mat.haz && lm.welded && (nearWeld || L < 2 * B_HAZ));
      take({ eta: sectionEta(sec, N, M, haz), mode: haz ? 'haz' : 'section', N, M, V: Vmax, x });
    }
    // buckling (compression)
    const ci = chordInfo.get(k);
    const Ncomp = Math.min(r.N1[k], r.N2[k]);
    const tiny = -0.005 * NRd(sec);
    if (ci && ci.Ncy < tiny) {
      const b = bucklingEta(sec, ci.Ncy, ci.My, ci.Ly, ci.Lz || lm.L);
      take({ eta: b.y, mode: 'bucklingY', N: ci.Ncy, M: ci.My, V: 0, Lcr: ci.Ly, chi: b.chiY, x: (xi + xj) / 2 });
    }
    if (ci && ci.Ncz < tiny) {
      const b = bucklingEta(sec, ci.Ncz, ci.Mz, ci.Ly, ci.Lz || lm.L);
      take({ eta: b.z, mode: 'bucklingZ', N: ci.Ncz, M: ci.Mz, V: 0, Lcr: ci.Lz, chi: b.chiZ, x: (xi + xj) / 2 });
    }
    if (!ci && Ncomp < tiny) {
      // posts: system length h about both axes
      let M = 0;
      for (let s = 0; s < MEMBER_SAMPLES; s++) M = Math.max(M, Math.abs(r.M[k * MEMBER_SAMPLES + s]));
      const b = bucklingEta(sec, Ncomp, M, L, L);
      take({ eta: Math.max(b.y, b.z), mode: b.y >= b.z ? 'bucklingY' : 'bucklingZ', N: Ncomp, M, V: 0, Lcr: L, chi: Math.min(b.chiY, b.chiZ), x: (xi + xj) / 2 });
    }
    out.push(best);
  });
  return out;
}

export interface BearingDesign {
  supportId: Id;
  x: number;
  /** ledger heads: chord (0 bottom, 1 top); couplers: both chords together (-1) */
  chord: -1 | 0 | 1;
  /** vertical support force (↑ +) and horizontal force, N */
  R: number;
  H: number;
  /** share of the chords (couplers): bottom / top */
  parts?: [number, number];
  Rd: number;
  eta: number;
  /** couplers 'NK/NK' … (bottom / top) or ledger head */
  kind: string;
}

/**
 * Bearings: ULS Flex ledger heads per chord; tube couplers of ULA / ULS per support with the sum of
 * both couplers (the couplers of both chords clamp to the same standard and share the support force,
 * as in the PERI tables).
 */
export function designBearings(la: LatticeAnalysis, r: FrameResult, cfg: LatticeConfig | undefined): BearingDesign[] {
  const out: BearingDesign[] = [];
  const kind = cfg?.couplers ?? 'NK/NK';
  const conf = kind.split('/') as ('NK' | 'UNK')[];
  for (const s of la.supports) {
    const Rv = s.nodes.map((n) => r.R[3 * n + 1]) as [number, number];
    const Hv = s.nodes.map((n) => r.R[3 * n]) as [number, number];
    if (la.model.bearing === 'head') {
      for (const c of [0, 1] as const) {
        const R = Rv[c];
        const H = Hv[c];
        const Rd = R >= 0 ? HEAD_RD.Vdown : HEAD_RD.Vup;
        out.push({ supportId: s.supportId, x: s.x, chord: c, R, H, Rd, eta: Math.max(Math.abs(R) / Rd, Math.abs(H) / HEAD_RD.N), kind: 'head' });
      }
    } else {
      const R = Rv[0] + Rv[1];
      const H = Hv[0] + Hv[1];
      const Rd = COUPLER_RD[conf[0] ?? 'NK'] + COUPLER_RD[conf[1] ?? 'NK'];
      out.push({ supportId: s.supportId, x: s.x, chord: -1, R, H, parts: Rv, Rd, eta: Math.hypot(R, H) / Rd, kind });
    }
  }
  return out;
}

export interface LatticeDeflection {
  span: number;
  x1: number;
  x2: number;
  w: number;
  x: number;
  limit: number;
  denominator: number;
  eta: number;
}

export function latticeDeflection(la: LatticeAnalysis, prep: Prepared, r: FrameResult): LatticeDeflection[] {
  const st = prep.model.settings;
  return prep.mesh.spans.map((sp) => {
    let w = 0;
    let x = sp.x1;
    la.model.nodes.forEach((n, i) => {
      if (n.chord < 0 || n.x < sp.x1 - 1e-9 || n.x > sp.x2 + 1e-9) return;
      const v = -r.d[3 * i + 1];
      if (Math.abs(v) > Math.abs(w)) {
        w = v;
        x = n.x;
      }
    });
    const denominator = sp.kind === 'cantilever' ? st.deflLimitCantilever : st.deflLimitSpan;
    const limit = (sp.x2 - sp.x1) / denominator;
    return { span: sp.index, x1: sp.x1, x2: sp.x2, w, x, limit, denominator, eta: Math.abs(w) / limit };
  });
}

export interface LatticeEnvelope {
  /** governing design per member over all variants */
  members: MemberDesign[];
  /** axial force per member of the variant with the largest overall utilisation */
  N: Float64Array;
  bearings: BearingDesign[];
  deflection: LatticeDeflection[];
  variants: number;
}

/** Envelope of the design over all variants of the given ULS / SLS combinations */
export function latticeEnvelope(an: Analysis, la: LatticeAnalysis, uls: Combination[], sls: Combination[], cfg: LatticeConfig | undefined): LatticeEnvelope {
  const prep = an.prep as Prepared;
  let members: MemberDesign[] = [];
  let N = new Float64Array(la.model.members.length);
  let worst = -1;
  const bearings = new Map<string, BearingDesign>();
  let variants = 0;
  for (const c of uls)
    for (const r of combinationVariants(la, c.factors)) {
      variants++;
      const d = designMembers(la, r);
      if (!members.length) members = d;
      else d.forEach((m, k) => {
        if (m.eta > members[k].eta) members[k] = m;
      });
      const top = Math.max(...d.map((m) => m.eta));
      if (top > worst) {
        worst = top;
        N = Float64Array.from(r.N);
      }
      for (const b of designBearings(la, r, cfg)) {
        const key = `${b.supportId}|${b.chord}`;
        const old = bearings.get(key);
        if (!old || b.eta > old.eta) bearings.set(key, b);
      }
    }
  let deflection: LatticeDeflection[] = [];
  for (const c of sls)
    for (const r of combinationVariants(la, c.factors)) {
      const d = latticeDeflection(la, prep, r);
      if (!deflection.length) deflection = d;
      else d.forEach((v, k) => {
        if (v.eta > deflection[k].eta) deflection[k] = v;
      });
    }
  return { members, N, bearings: [...bearings.values()], deflection, variants };
}

/** characteristic combination (all load cases with factor 1) for the deflection if no SLS combinations exist */
export function characteristicCombination(model: BeamModel): Combination {
  return { id: '__char', name: 'G + Q', type: 'SLS', factors: Object.fromEntries(model.loadCases.map((c) => [c.id, 1])), inEnvelope: false };
}

/** Member forces of the displayed result (load case, combination or envelope): max / min per value */
export interface LatticeViewResult {
  kind: 'single' | 'envelope';
  Nmax: Float64Array;
  Nmin: Float64Array;
  /** M at the member samples (MEMBER_SAMPLES per member) */
  Mmax: Float64Array;
  Mmin: Float64Array;
  /** support reactions (3 per node, global, z up) */
  Rmax: Float64Array;
  Rmin: Float64Array;
  /** nodal displacements of one representative arrangement (single: exact) */
  d: Float64Array;
}

function envelopeOf(rs: FrameResult[]): LatticeViewResult | null {
  if (!rs.length) return null;
  const f = rs[0];
  const out: LatticeViewResult = {
    kind: rs.length > 1 ? 'envelope' : 'single',
    Nmax: Float64Array.from(f.N),
    Nmin: Float64Array.from(f.N),
    Mmax: Float64Array.from(f.M),
    Mmin: Float64Array.from(f.M),
    Rmax: Float64Array.from(f.R),
    Rmin: Float64Array.from(f.R),
    d: Float64Array.from(f.d),
  };
  let dmax = 0;
  for (const r of rs) {
    for (let i = 0; i < r.N.length; i++) {
      out.Nmax[i] = Math.max(out.Nmax[i], r.N1[i], r.N2[i], r.N[i]);
      out.Nmin[i] = Math.min(out.Nmin[i], r.N1[i], r.N2[i], r.N[i]);
    }
    for (let i = 0; i < r.M.length; i++) {
      out.Mmax[i] = Math.max(out.Mmax[i], r.M[i]);
      out.Mmin[i] = Math.min(out.Mmin[i], r.M[i]);
    }
    for (let i = 0; i < r.R.length; i++) {
      out.Rmax[i] = Math.max(out.Rmax[i], r.R[i]);
      out.Rmin[i] = Math.min(out.Rmin[i], r.R[i]);
    }
    let m = 0;
    for (let i = 1; i < r.d.length; i += 3) m = Math.max(m, Math.abs(r.d[i]));
    if (m > dmax) {
      dmax = m;
      out.d = Float64Array.from(r.d);
    }
  }
  return out;
}

/** Results of the member model for a result view of the beam */
export function latticeView(an: Analysis, la: LatticeAnalysis, view: { type: 'case' | 'combo' | 'envelope'; id?: Id }): LatticeViewResult | null {
  if (view.type === 'case') {
    const c = view.id ? la.cases.get(view.id) : undefined;
    return c ? envelopeOf([c.full]) : null;
  }
  const combos = view.type === 'combo' ? an.model.combinations.filter((c) => c.id === view.id) : an.model.combinations.filter((c) => c.inEnvelope);
  return envelopeOf(combos.flatMap((c) => combinationVariants(la, c.factors)));
}
