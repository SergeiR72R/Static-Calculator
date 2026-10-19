/**
 * PERI system components used as beams. All checks compare design actions E_d (ULS combinations)
 * with design resistances R_d of the PERI beam proofs ("Beam proofs for SRU, RCS, GT24, VT20"):
 *
 *  - SRU U120 (2 × U120, S235): net sections A 4-4, A 5-5 (slot region) and B 2-2 (centre region)
 *    with N_Rd, V_z,Rd, M_y,Rd and the interaction n–v, v–m, n–v–m (a_w, w_w per section),
 *    document ST_was_2024/00040.
 *  - RCS (2 × U200, S355): net section with bolt holes, EN 1993-1-1 6.2.10 / 6.2.9.1 (6.36),
 *    procedure after Wagenknecht, γ_M1 = 1.1, γ_M2 = 1.25, document ST_kls_2016-00106.
 *  - GT 24, VT 20 (timber formwork girders): design values of the MULTIFLEX instructions
 *    (V_Rd, M_Rd, support forces F_R,d depending on the support case, GT 24 also M at the support).
 *    I of the girders from the chords (matches the published EI with E = 11 000 N/mm²).
 *
 * PERI DI §2.1: perm F = R_d / 1.5 — with the default ULS combination 1.5·G + 1.5·Q the design
 * check is identical to the check of the permissible values with the actual loads.
 */
import type { Material, PeriProductId } from '../core/types';
import { materialPreset } from './materials';

const kN = 1e3;
const kNm = 1e3;
const mm = 1e-3;
const cm2 = 1e-4;
const cm4 = 1e-8;

/** Design resistances of one cross-section region (PERI interaction with a_w, w_w) */
export interface PeriRegion {
  /** region label ('' if the member has only one) */
  label: string;
  MRd: number;
  NRd: number;
  VRd: number;
  aw: number;
  ww: number;
}

/**
 * RCS climbing rail: net cross-section 2 × U200 with bolt holes d1 / d2 (cm, kN/cm²) for the
 * EN 1993-1-1 interaction (Wagenknecht)
 */
export interface Ec3Rail {
  A: number;
  Wpl: number;
  h: number;
  tf: number;
  tw: number;
  d1: number;
  e1: number;
  d2: number;
  e2: number;
  fy: number;
  fu: number;
  gM1: number;
  gM2: number;
}

/** Timber formwork girder: MULTIFLEX design values (N, Nm, m) */
export interface GirderData {
  VRd: number;
  MRd: number;
  /** support forces F_R,d: end support (outermost) / intermediate support, under a lattice node or between nodes */
  Fend: { node: number; between: number };
  Fint: { node: number; between: number };
  /** moment at the support M_m,Rd (GT 24; under a node / between nodes) */
  Mm?: { node: number; between: number };
  /** VT 20: F_R,d by the distance of the support from the girder end (< farFrom → near, else far) */
  byEdge?: { near: number; far: number; farFrom: number };
  /** minimum distance support axis – girder end, m */
  minEdge: number;
}

export type PeriCheckData = { method: 'design'; regions: PeriRegion[]; ec3?: Ec3Rail } | ({ method: 'girder' } & GirderData);

/** Cross-section geometry for the sketch / 3D view (mm) */
export type PeriShape =
  | { type: 'girder'; h: number; b: number; tf: number; tw: number }
  | { type: 'doubleU'; h: number; bU: number; tw: number; tf: number; gap: number };

export interface PeriProduct {
  id: PeriProductId;
  name: string;
  /** material preset applied when the product is chosen */
  material: 'C24' | 'S235' | 'S355';
  /** cm², cm⁴ */
  A: number;
  Iy: number;
  /** kg/m (self weight) */
  mass: number;
  shape: PeriShape;
  check: PeriCheckData;
  /** standard catalogue lengths, m */
  lengths: number[];
  /** short source reference */
  source: string;
}

const range = (a: number, b: number, step: number) => Array.from({ length: Math.round((b - a) / step) + 1 }, (_, i) => Math.round((a + i * step) * 1000) / 1000);

export const PERI_PRODUCTS: PeriProduct[] = [
  {
    id: 'GT24',
    name: 'PERI GT 24',
    material: 'C24',
    // chords 80 × 60 mm
    A: 96,
    Iy: 8064,
    mass: 5.9,
    shape: { type: 'girder', h: 240, b: 80, tf: 60, tw: 28 },
    // MULTIFLEX: cases 1/2 end support, 3/4 support of continuous girders / cantilevers; 1/3 under a node, 2/4 between nodes
    check: {
      method: 'girder',
      VRd: 19.5 * kN,
      MRd: 10.5 * kNm,
      Fend: { node: 24 * kN, between: 19.5 * kN },
      Fint: { node: 42 * kN, between: 30 * kN },
      Mm: { node: 10.5 * kNm, between: 6 * kNm },
      minEdge: 0.16,
    },
    // 0,90 … 6,00 m in 0,30 m steps (special lengths up to 17,85 m on request)
    lengths: range(0.9, 6.0, 0.3),
    source: 'PERI MULTIFLEX (Beam proofs GT 24): V_Rd = 19,5 kN, M_Rd = 10,5 kNm, F_R,d = 24 / 19,5 / 42 / 30 kN, M_m,Rd = 10,5 / 6 kNm, EI = 887 kNm²',
  },
  {
    id: 'VT20K',
    name: 'PERI VT 20',
    material: 'C24',
    // chords 80 × 40 mm
    A: 64,
    Iy: 4181,
    mass: 5.9,
    shape: { type: 'girder', h: 200, b: 80, tf: 40, tw: 27 },
    // MULTIFLEX / EN 13377 (VT 20, VT 20K, VT 20 Alpha, Alpha 3S): F_R,d = 24 kN (support < 45 cm from the end, ≥ 15 cm), 33 kN (≥ 45 cm)
    check: {
      method: 'girder',
      VRd: 16.5 * kN,
      MRd: 7.5 * kNm,
      Fend: { node: 24 * kN, between: 24 * kN },
      Fint: { node: 33 * kN, between: 33 * kN },
      byEdge: { near: 24 * kN, far: 33 * kN, farFrom: 0.45 },
      minEdge: 0.15,
    },
    lengths: [1.45, 1.9, 2.15, 2.45, 2.65, 2.9, 3.3, 3.6, 3.9, 4.5, 4.9, 5.9],
    source: 'PERI MULTIFLEX (Beam proofs VT 20): V_Rd = 16,5 kN, M_Rd = 7,5 kNm, F_R,d = 24 kN (< 45 cm vom Ende) / 33 kN, EI = 460 kNm²',
  },
  {
    id: 'SRU120',
    name: 'PERI SRU U120',
    material: 'S235',
    // net values of the slot region A, section 4-4 (stiffness)
    A: 28.19,
    Iy: 696.97,
    mass: 26.6,
    shape: { type: 'doubleU', h: 120, bU: 55, tw: 7, tf: 9, gap: 52 },
    check: {
      method: 'design',
      regions: [
        { label: 'A 4-4', MRd: 28.3401 * kNm, NRd: 602.3 * kN, VRd: 113.39 * kN, aw: 0.33, ww: 0.22 },
        { label: 'A 5-5', MRd: 25.1877 * kNm, NRd: 593.67 * kN, VRd: 149.66 * kN, aw: 0.44, ww: 0.32 },
        { label: 'B 2-2', MRd: 28.7375 * kNm, NRd: 663.02 * kN, VRd: 148.45 * kN, aw: 0.39, ww: 0.23 },
      ],
    },
    // exact lengths L/mm of the PERI table (SRU 72 = 722 mm …)
    lengths: [0.722, 0.972, 1.222, 1.472, 1.722, 1.972, 2.222, 2.472, 2.722, 2.972, 3.472, 3.972, 4.472, 4.972, 5.472, 5.972],
    source: 'PERI Beam proofs SRU (ST_was_2024/00040): Schnitte A 4-4, A 5-5, B 2-2',
  },
  {
    id: 'RCS',
    name: 'PERI RCS',
    material: 'S355',
    A: 56.38,
    Iy: 3576,
    mass: 52.6,
    shape: { type: 'doubleU', h: 200, bU: 75, tw: 8.5, tf: 11.5, gap: 82 },
    check: {
      method: 'design',
      // resistances of the net section (γ_M1 = 1.1): see rcsResistances()
      regions: [{ label: '', MRd: 132.7 * kNm, NRd: 1819.5 * kN, VRd: 432.9 * kN, aw: 0.412, ww: 0.241 }],
      ec3: { A: 56.38, Wpl: 411.18, h: 20, tf: 1.15, tw: 0.85, d1: 2.1, e1: 5.5, d2: 2.6, e2: 5.5, fy: 35.5, fu: 49, gM1: 1.1, gM2: 1.25 },
    },
    // DI table: 148, 248, 348, 498, 748, 998; RCS 298 / 398 occur in AutoCAD exports (PERI item nos.)
    lengths: [1.48, 2.48, 2.98, 3.48, 3.98, 4.98, 7.48, 9.98],
    source: 'PERI Beam proofs RCS (ST_kls_2016-00106): EN 1993-1-1 6.2.10, Nettoquerschnitt, γM1 = 1,1',
  },
];

export const PERI_IDS: PeriProductId[] = PERI_PRODUCTS.map((p) => p.id);

export function findPeriProduct(id: PeriProductId): PeriProduct | undefined {
  return PERI_PRODUCTS.find((p) => p.id === id);
}

export function periMaterial(id: PeriProductId): Material {
  return materialPreset(findPeriProduct(id)?.material ?? 'S235');
}

/** Overall dimensions in m */
export function periDims(p: PeriProduct): { h: number; b: number } {
  const s = p.shape;
  return s.type === 'girder' ? { h: s.h * mm, b: s.b * mm } : { h: s.h * mm, b: (2 * s.bU + s.gap) * mm };
}

export function periSI(p: PeriProduct): { A: number; I: number } {
  return { A: p.A * cm2, I: p.Iy * cm4 };
}

/** Outline polygons in m, origin top-left (one or two solid parts) */
export function periOutline(p: PeriProduct): [number, number][][] {
  const s = p.shape;
  if (s.type === 'girder') {
    const h = s.h * mm;
    const b = s.b * mm;
    const tf = s.tf * mm;
    const tw = s.tw * mm;
    const x0 = (b - tw) / 2;
    return [
      [
        [0, 0], [b, 0], [b, tf], [x0 + tw, tf], [x0 + tw, h - tf], [b, h - tf], [b, h],
        [0, h], [0, h - tf], [x0, h - tf], [x0, tf], [0, tf],
      ],
    ];
  }
  const h = s.h * mm;
  const bU = s.bU * mm;
  const tw = s.tw * mm;
  const tf = s.tf * mm;
  const x2 = bU + s.gap * mm;
  // back to back: webs face the gap, flanges point outwards
  const left: [number, number][] = [[0, 0], [bU, 0], [bU, h], [0, h], [0, h - tf], [bU - tw, h - tf], [bU - tw, tf], [0, tf]];
  const right: [number, number][] = [[x2, 0], [x2 + bU, 0], [x2 + bU, tf], [x2 + tw, tf], [x2 + tw, h - tf], [x2 + bU, h - tf], [x2 + bU, h], [x2, h]];
  return [left, right];
}

/** Ratios of the PERI interaction for one region (all forces as absolute values) */
export interface PeriInteraction {
  my: number;
  n: number;
  v: number;
  rho: number;
  /** n–v, v–m, n–v–m */
  nv: number;
  vm: number;
  nvm: number;
  eta: number;
}

/**
 * SRU (PERI proof, acc. to DIN EN 1993-1-1): n = N/N_Rd, v = V/V_z,Rd, m = M/M_y,Rd,
 * ρ = (2·max(0.5; v) − 1)²
 *   n–v:   n / (1 − a_w ρ)
 *   v–m:   m / (1 − w_w ρ)
 *   n–v–m: m (1 − 0.5 a_w (1 − ρ)/(1 − ρ a_w)) / ((1 − w_w ρ)(1 − n/(1 − a_w ρ)))
 * (for v ≤ 0.5: ρ = 0 → n–v–m = m (1 − 0.5 a_w)/(1 − n))
 */
export function periInteraction(r: PeriRegion, N: number, V: number, M: number): PeriInteraction {
  const my = Math.abs(M) / r.MRd;
  const n = Math.abs(N) / r.NRd;
  const v = Math.abs(V) / r.VRd;
  const rho = (2 * Math.max(0.5, v) - 1) ** 2;
  const div = (a: number, b: number) => (b > 1e-12 ? a / b : a > 0 ? Infinity : 0);
  const nv = div(n, 1 - r.aw * rho);
  const vm = div(my, 1 - r.ww * rho);
  const red = 1 - (0.5 * r.aw * (1 - rho)) / (1 - rho * r.aw);
  const nvm = div(my * red, (1 - r.ww * rho) * (1 - div(n, 1 - r.aw * rho)));
  const eta = Math.max(my, n, v, nv, vm, nvm < 0 ? Infinity : nvm);
  return { my, n, v, rho, nv, vm, nvm, eta };
}

/** Net web area, plastic web modulus and resistances of the RCS rail (EN 1993-1-1), SI units */
export function rcsResistances(r: Ec3Rail) {
  const hw = r.h - 2 * r.tf;
  const fillet = r.tf ** 2 * (1 - Math.PI / 4);
  const Aw = 2 * (hw * r.tw + 2 * fillet - (r.d1 + r.d2) * r.tw); // cm²
  const Wplw = 2 * (r.tw * (hw ** 2 / 4 - r.d1 * r.e1 - r.d2 * r.e2) + fillet * (hw - 2 * 0.22337 * r.tf)); // cm³
  const sRd = r.fy / r.gM1; // kN/cm²
  const Npl = r.A * sRd;
  const Nt = Math.min(Npl, (0.9 * r.A * r.fu) / r.gM2);
  const Vpl = (Aw * sRd) / Math.sqrt(3);
  const Mpl = r.Wpl * sRd; // kNcm
  return { Aw, Wplw, sRd, Npl: Npl * 1e3, Nt: Nt * 1e3, Vpl: Vpl * 1e3, Mpl: Mpl * 10, aw: Math.min(Aw / r.A, 0.5), ww: Wplw / r.Wpl };
}

export interface Ec3Interaction {
  n: number;
  v: number;
  m: number;
  rho: number;
  /** n–v = N / N_V,Rd, v–m = M / M_V,y,Rd, n–v–m = M / M_N,V,y,Rd */
  nv: number;
  vm: number;
  nvm: number;
  eta: number;
}

/**
 * RCS: EN 1993-1-1 6.2.10 with 6.2.9.1 (6.36) after Wagenknecht (PERI proof):
 *   ρ = (2·max(0.5; v) − 1)², σ_Rd,red = (1 − ρ) σ_Rd
 *   N_V,Rd = A_f σ_Rd + A_w σ_Rd,red,  M_V,y,Rd = W_pl,f σ_Rd + W_pl,w σ_Rd,red
 *   N* = min(0.5 A_w σ_Rd,red; 0.25 N_V,Rd); n = N/N_V,Rd if N ≥ N*, else 0
 *   a = min((A_red − A_f)/A_red; 0.5) with A_red = A − ρ A_w (only if N ≥ N*)
 *   M_N,V,y,Rd = min(M_V,y,Rd (1 − n)/(1 − 0.5 a); M_V,y,Rd)
 */
export function rcsInteraction(r: Ec3Rail, N: number, V: number, M: number): Ec3Interaction {
  const R = rcsResistances(r);
  const Nk = Math.abs(N) / 1e3; // kN
  const Vk = Math.abs(V) / 1e3;
  const Mk = Math.abs(M) / 10; // kNcm
  const n = Nk / (R.Npl / 1e3);
  const v = Vk / (R.Vpl / 1e3);
  const m = Mk / (R.Mpl / 10);
  const rho = Math.min((2 * Math.max(0.5, v) - 1) ** 2, 1);
  const Af = r.A - R.Aw;
  const Wplf = r.Wpl - R.Wplw;
  const sRed = (1 - rho) * R.sRd;
  const NV = Af * R.sRd + R.Aw * sRed;
  const MV = Wplf * R.sRd + R.Wplw * sRed;
  const div = (a: number, b: number) => (b > 1e-12 ? a / b : a > 0 ? Infinity : 0);
  const nv = div(Nk, NV);
  const vm = div(Mk, MV);
  const Nstar = Math.min(0.5 * R.Aw * sRed, 0.25 * NV);
  const big = Nk >= Nstar && Nk > 0;
  const nRed = big ? nv : 0;
  const Ared = r.A - rho * R.Aw;
  const a = big ? Math.min((Ared - Af) / Ared, 0.5) : 0;
  const MNV = Math.min(Math.max(0, (MV * (1 - nRed)) / (1 - 0.5 * a)), MV);
  const nvm = div(Mk, MNV);
  return { n, v, m, rho, nv, vm, nvm, eta: Math.max(n, v, m, nv, vm, nvm) };
}

/** Support case of a timber girder: design support force and moment at the support */
export function girderSupport(g: GirderData, end: boolean, edge: number, atNode: boolean): { F: number; Mm?: number } {
  const k = atNode ? 'node' : 'between';
  const F = g.byEdge ? (edge >= g.byEdge.farFrom - 1e-9 ? g.byEdge.far : g.byEdge.near) : end ? g.Fend[k] : g.Fint[k];
  return { F, Mm: g.Mm?.[k] };
}
