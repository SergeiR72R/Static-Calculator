/**
 * PERI system components used as beams: formwork girders GT 24 / VT 20K (timber, permissible
 * values) and the steel members SRU U120 / climbing rail RCS (design resistances with the
 * PERI M–N–V interaction).
 *
 * Sources:
 *  - SRU U120, RCS: PERI Bemessungsinformationen / Structural Design Information
 *    "RCS/VARIOKIT Connections", sections 4.1 (p. 9) and 4.10 (p. 19–20).
 *  - GT 24, VT 20K: PERI product data (perm M, perm Q, perm R, EI). I is computed from
 *    the chords only (lattice / web neglected) and matches the published EI with E = 11 000 N/mm².
 *
 * Design concept (PERI DI §2.1): perm F = R_d / γ_F with γ_F = 1.5, utilisation UF = F_act / perm F
 * with the actual (unfactored) load. R_d values are compared with design actions E_d.
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

export type PeriCheckData =
  | { method: 'design'; regions: PeriRegion[] }
  | {
      method: 'perm';
      /** permissible bending moment, Nm */
      M: number;
      /** permissible shear force, N */
      V: number;
      /** permissible support force at the girder end / intermediate support, N */
      Rend: number;
      Rint: number;
    };

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
    check: { method: 'perm', M: 7.0 * kNm, V: 13.0 * kN, Rend: 28.0 * kN, Rint: 28.0 * kN },
    // 0,90 … 6,00 m in 0,30 m steps (special lengths up to 17,85 m on request)
    lengths: range(0.9, 6.0, 0.3),
    source: 'PERI GT 24: perm M = 7,0 kNm, perm Q = 13,0 kN, perm R = 28,0 kN, EI = 887 kNm²',
  },
  {
    id: 'VT20K',
    name: 'PERI VT 20K',
    material: 'C24',
    // chords 80 × 40 mm
    A: 64,
    Iy: 4181,
    mass: 5.9,
    shape: { type: 'girder', h: 200, b: 80, tf: 40, tw: 27 },
    check: { method: 'perm', M: 5.0 * kNm, V: 11.0 * kN, Rend: 11.0 * kN, Rint: 22.0 * kN },
    lengths: [1.45, 1.9, 2.15, 2.45, 2.65, 2.9, 3.3, 3.6, 3.9, 4.5, 4.9, 5.9],
    source: 'PERI VT 20K: perm M = 5,0 kNm, perm Q = 11,0 kN, perm A = 11,0 kN, perm B = 22,0 kN, EI = 460 kNm²',
  },
  {
    id: 'SRU120',
    name: 'PERI SRU U120',
    material: 'S235',
    // net values of the slot region A (governing)
    A: 28.2,
    Iy: 696.98,
    mass: 26.6,
    shape: { type: 'doubleU', h: 120, bU: 55, tw: 7, tf: 9, gap: 52 },
    check: {
      method: 'design',
      regions: [
        { label: 'A', MRd: 28.34 * kNm, NRd: 602.45 * kN, VRd: 113.4 * kN, aw: 0.326, ww: 0.205 },
        { label: 'B', MRd: 28.82 * kNm, NRd: 663.12 * kN, VRd: 148.46 * kN, aw: 0.388, ww: 0.219 },
      ],
    },
    lengths: [0.72, 0.97, 1.22, 1.47, 1.72, 1.97, 2.22, 2.47, 2.72, 2.97, 3.47, 3.97, 4.47, 4.97, 5.47, 5.97],
    source: 'PERI DI RCS/VARIOKIT, 4.10 Steel Waler SRU U120 (S. 19–20)',
  },
  {
    id: 'RCS',
    name: 'PERI RCS',
    material: 'S355',
    A: 56.38,
    Iy: 3576,
    mass: 52.6,
    shape: { type: 'doubleU', h: 200, bU: 75, tw: 8.5, tf: 11.5, gap: 82 },
    check: { method: 'design', regions: [{ label: '', MRd: 132.7 * kNm, NRd: 1820 * kN, VRd: 432.91 * kN, aw: 0.412, ww: 0.241 }] },
    lengths: [1.48, 2.48, 3.48, 4.98, 7.48, 9.98],
    source: 'PERI DI RCS/VARIOKIT, 4.1 Climbing Rail RCS (S. 9)',
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
  /** n–m_y, v–m_y, n–v, n–v–m_y (the last three only if v > 0.5, else 0) */
  nm: number;
  vm: number;
  nv: number;
  nvm: number;
  eta: number;
}

/**
 * PERI DI cross-section verification with interaction (RCS p. 9, SRU p. 20):
 *   m_y = M/M_Rd, n = N/N_Rd, v = V/V_Rd, ρ = 0 (v ≤ 0.5) or (2v − 1)²
 *   n–m_y:   m_y (1 − 0.5 a_w) / (1 − n)
 *   v–m_y:   m_y / (1 − ρ w_w)                                     (only v > 0.5)
 *   n–v:     n / (1 − ρ a_w)                                       (only v > 0.5)
 *   n–v–m_y: m_y (1 − 0.5 a_w (1−ρ)/(1−ρ a_w)) / ((1 − ρ w_w)(1 − n/(1 − ρ a_w)))   (only v > 0.5)
 */
export function periInteraction(r: PeriRegion, N: number, V: number, M: number): PeriInteraction {
  const my = Math.abs(M) / r.MRd;
  const n = Math.abs(N) / r.NRd;
  const v = Math.abs(V) / r.VRd;
  const rho = v <= 0.5 ? 0 : (2 * v - 1) ** 2;
  const div = (a: number, b: number) => (b > 1e-12 ? a / b : a > 0 ? Infinity : 0);
  const nm = div(my * (1 - 0.5 * r.aw), 1 - n);
  let vm = 0;
  let nv = 0;
  let nvm = 0;
  if (v > 0.5) {
    vm = div(my, 1 - rho * r.ww);
    nv = div(n, 1 - rho * r.aw);
    const red = 1 - (0.5 * r.aw * (1 - rho)) / (1 - rho * r.aw);
    nvm = div(my * red, (1 - rho * r.ww) * (1 - n / (1 - rho * r.aw)));
  }
  const eta = Math.max(my, n, v, nm, vm, nv, nvm);
  return { my, n, v, rho, nm, vm, nv, nvm, eta };
}
