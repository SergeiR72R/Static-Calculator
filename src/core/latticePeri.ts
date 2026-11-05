/**
 * Checks of lattice girders after the PERI design report "Checks of elements" (Balkenrechner tests):
 *
 *  - ULS chords / end posts CHS 48.3 × 3.2 S235JRH (f_y,k = 320 N/mm²), DIN EN 1993-1-1, γ_M = 1.1:
 *    N_Rd = 131.9 kN, V_Rd = 2·A·f_y/(π·√3·γ_M) = 48.5 kN, M_Rd = α_pl·W_el·f_y/γ_M = 174.55 kNcm
 *    (α_pl = min(W_pl/W_el; 1.25)); n = |N|/N_Rd, v = |V|/V_Rd and the moment check by the acting
 *    N and V:
 *      v ≤ 1/3, n ≤ 0.1:          m = |M| / M_Rd
 *      1/3 < v ≤ 0.9, n ≤ 0.1:    m = |M| / (M_Rd·√(1 − v²))
 *      v ≤ 1/3, 0.1 < n ≤ 1:      m = |M| / (M_Rd·cos(π·n/2))
 *      1/3 < v ≤ 0.9, 0.1 < n ≤ 1: m = |M| / (M_Rd·√(1 − v²)·cos(π·n/(2·√(1 − v²))))
 *    No flexural buckling and no welds (as in the PERI check).
 *  - ULS diagonals RHS 40 × 20 × 2 S235JRH: N_Rd = 45.65, V_y,Rd = 8.79, V_z,Rd = 17.57 kN,
 *    M_y,Rd = 54.07, M_z,Rd = 34.11 kNcm; ρ = (2v − 1)² for v ≥ 0.5, M_N,Rd = M_Rd·(1 − n)/(1 − 0.5·a)
 *    (a = a_w = a_f ≤ 0.5), m_y = |M_y|/(M_N,y,Rd·(1 − ρ_z)), m_z = |M_z|/(M_N,z,Rd·(1 − ρ_y)),
 *    m_N = m_y^α + m_z^β with α = β = min(1.66/(1 − 1.13·n²); 6).
 *  - Scaffold standard between the couplers (UVR, RO 48.3 × 3.2, f_y,k = 320 N/mm²): flexural
 *    buckling, Euler case 2, L_cr = vertical length of the ledgers fixed to the tube (default 200 cm),
 *    buckling curve b (DIBt newsletter 1/2019), γ_M1 = 1.1.
 *  - Couplers EN 74-1: slipping F_S,Rd = 15 kN / 1.1 (RA 48/48 class B), 25 kN / 1.1 (with
 *    supplementary coupler, class BB).
 *  - ULS Flex (PI 550): permissible loads of the configurations (span, elements): uniform load q or
 *    single loads at the positions A, B, … (connectors from the left); design values ×1.5; the
 *    resistances include the self weight and decks UDG.
 */
import type { Load } from './types';

const kN = 1e3;
const kNcm = 10;

export const PERI_GAMMA_M = 1.1;

/** ULS chord / post CHS 48.3 × 3.2, f_y,k = 320 N/mm² (N, N·m) */
export const ULS_CHORD = { NRd: 131.9 * kN, VRd: 48.5 * kN, MRd: 174.5454545 * kNcm };
/** ULS diagonal RHS 40 × 20 × 2 S235 */
export const ULS_DIAG = { NRd: 45.65 * kN, VyRd: 8.79 * kN, VzRd: 17.57 * kN, MyRd: 54.07 * kNcm, MzRd: 34.11 * kNcm, a: 0.5 };

export interface PeriParts {
  n: number;
  v: number;
  m: number;
  /** case of the moment check (1 … 4, 0 = outside the ranges) */
  case: number;
}

/** ULS chord / end post: cross-section check of the PERI report */
export function periChordCheck(N: number, V: number, M: number): { eta: number; parts: PeriParts } {
  const n = Math.abs(N) / ULS_CHORD.NRd;
  const v = Math.abs(V) / ULS_CHORD.VRd;
  const Ma = Math.abs(M);
  const R = ULS_CHORD.MRd;
  let m = 0;
  let c = 0;
  if (v <= 1 / 3 && n <= 0.1) {
    m = Ma / R;
    c = 1;
  } else if (v > 1 / 3 && v <= 0.9 && n <= 0.1) {
    m = Ma / (R * Math.sqrt(1 - v * v));
    c = 2;
  } else if (v <= 1 / 3 && n > 0.1 && n <= 1) {
    m = Ma / (R * Math.cos((Math.PI * n) / 2));
    c = 3;
  } else if (v > 1 / 3 && v <= 0.9 && n > 0.1 && n <= 1) {
    const r = Math.sqrt(1 - v * v);
    const k = (Math.PI * n) / (2 * r);
    m = k >= Math.PI / 2 ? Infinity : Ma / (R * r * Math.cos(k));
    c = 4;
  } else m = n > 1 || v > 0.9 ? Math.max(n, v) : 0;
  return { eta: Math.max(n, v, m), parts: { n, v, m, case: c } };
}

/** ULS diagonal: cross-section check of the PERI report (in-plane: V_z, M_y; out of plane: V_y, M_z) */
export function periDiagCheck(N: number, Vz: number, My: number, Vy = 0, Mz = 0): { eta: number; parts: PeriParts & { mN: number } } {
  const d = ULS_DIAG;
  const n = Math.abs(N) / d.NRd;
  const vy = Math.abs(Vy) / d.VyRd;
  const vz = Math.abs(Vz) / d.VzRd;
  const rhoY = vy >= 0.5 ? (2 * vy - 1) ** 2 : 0;
  const rhoZ = vz >= 0.5 ? (2 * vz - 1) ** 2 : 0;
  const alpha = Math.min(1.66 / (1 - 1.13 * n * n), 6);
  const alphaEff = alpha > 0 ? alpha : 6;
  const MNy = Math.min(d.MyRd, (d.MyRd * (1 - n)) / (1 - 0.5 * d.a));
  const MNz = Math.min(d.MzRd, (d.MzRd * (1 - n)) / (1 - 0.5 * d.a));
  const my = Math.abs(My) > 0 ? Math.abs(My) / Math.max(1e-9, MNy * (1 - rhoZ)) : 0;
  const mz = Math.abs(Mz) > 0 ? Math.abs(Mz) / Math.max(1e-9, MNz * (1 - rhoY)) : 0;
  const mN = my ** alphaEff + mz ** alphaEff;
  return { eta: Math.max(n, vy, vz, my, mz, mN), parts: { n, v: Math.max(vy, vz), m: Math.max(my, mz), case: 0, mN } };
}

/** Flexural buckling of the scaffold standard (curve b, γ_M1 = 1.1): N_Rd, χ */
export function standardBuckling(Lcr: number, D = 48.3, t = 3.2, fy = 320): { NRd: number; chi: number; lambda: number } {
  const A = ((Math.PI / 4) * (D * D - (D - 2 * t) ** 2)) / 1e6;
  const I = ((Math.PI / 64) * (D ** 4 - (D - 2 * t) ** 4)) / 1e12;
  const i = Math.sqrt(I / A);
  const lambda1 = 93.9 * Math.sqrt(235 / fy);
  const lambda = Lcr / i / lambda1;
  const phi = 0.5 * (1 + 0.34 * (lambda - 0.2) + lambda * lambda);
  const chi = Math.min(1, 1 / (phi + Math.sqrt(phi * phi - lambda * lambda)));
  return { NRd: (chi * A * fy * 1e6) / PERI_GAMMA_M, chi, lambda };
}

/** Coupler slipping resistance (EN 74-1): class B 15 kN, BB 25 kN, / γ_M */
export const COUPLER_SLIP_RD = { NK: (15 * kN) / PERI_GAMMA_M, UNK: (25 * kN) / PERI_GAMMA_M };

/** default buckling length of the standard (vertical length of the ledgers at the tube), m */
export const STANDARD_LCR = 2;

/** ULS Flex configurations (PERI PI 550): span, elements, perm q [kN/m], perm F at the positions */
export interface FlexConfig {
  span: number;
  /** elements in cm, e.g. [125, 125] */
  elements: number[];
  q: number;
  /** permissible single load per position (A = first connector from the left) */
  F: Record<string, number>;
}

const cfg = (span: number, items: [number, number][], q: number, loads: [string, number][]): FlexConfig => {
  const F: Record<string, number> = {};
  for (const [pos, f] of loads) for (const p of pos.split(' ')) F[p] = f;
  return { span, elements: items.flatMap(([n, e]) => Array(n).fill(e)), q, F };
};

export const FLEX_CONFIGS: FlexConfig[] = [
  cfg(3.5, [[2, 125]], 6.4, [['A C', 12.36], ['B', 15.87]]),
  cfg(4, [[2, 150]], 4.124, [['A C', 12.11], ['B', 13.78]]),
  cfg(4, [[3, 100]], 5.42, [['A D', 12.03], ['B C', 13.69]]),
  cfg(4.75, [[3, 125]], 4.36, [['A D', 11.84], ['B C', 12.98]]),
  cfg(5, [[2, 150], [1, 100]], 2.96, [['A D', 11.7], ['B C', 11.6]]),
  cfg(5, [[4, 100]], 3.47, [['A E', 11.68], ['B D', 12.39], ['C', 11.99]]),
  cfg(5.5, [[3, 150]], 2.6, [['A D', 11.64], ['B C', 11.07]]),
  cfg(6, [[4, 125]], 2.88, [['A E', 11.51], ['B D', 11.68], ['C', 10.99]]),
  cfg(6, [[2, 100], [2, 150]], 2.39, [['A E', 11.44], ['B D', 11.67], ['C', 9.98]]),
  cfg(6, [[5, 100]], 2.88, [['A F', 11.43], ['B E', 11.61], ['C D', 10.42]]),
  cfg(7, [[4, 150]], 1.61, [['A E', 11.34], ['B D', 9.86], ['C', 8.46]]),
  cfg(7, [[6, 100]], 1.86, [['A G', 11.24], ['B F', 11.08], ['C E', 9.54], ['D', 8.9]]),
  cfg(7.25, [[5, 125]], 1.78, [['A F', 11.28], ['B E', 10.91], ['C D', 9.44]]),
  cfg(8, [[4, 150], [1, 100]], 1.08, [['A F', 11.09], ['B E', 9.28], ['C D', 7.25]]),
  cfg(8, [[7, 100]], 1.26, [['A H', 11.07], ['B G', 10.69], ['C F', 8.83], ['D E', 8.29]]),
  cfg(8.5, [[6, 125]], 1.05, [['A G', 11.1], ['B F', 10.4], ['C E', 8.53], ['D', 8.28]]),
];

/** configuration of the elements (the order of the elements is free: compared as a set) */
export function findFlexConfig(elements: number[]): FlexConfig | null {
  const key = (e: number[]) => [...e].map((v) => Math.round(v * (v < 10 ? 100 : 1))).sort((a, b) => a - b).join(',');
  const k = key(elements);
  return FLEX_CONFIGS.find((c) => key(c.elements) === k) ?? null;
}

export interface FlexTableLoad {
  x: number;
  /** position letter(s): 'A' at a connector, 'A–B' between connectors (smaller resistance), '' none */
  pos: string;
  F: number;
  FRd: number;
}

export interface FlexTableCheck {
  config: FlexConfig;
  /** governing combination */
  combo: string;
  qEd: number;
  qRd: number;
  loads: FlexTableLoad[];
  eta: number;
}

/**
 * ULS Flex: utilisation of the PERI configuration for the loads of the beam model (design values of
 * the ULS combinations). Uniform load and single loads are added up: η = q_Ed/q_Rd + Σ F_Ed/F_Rd
 * (the table gives either a uniform load or one single load; adding is on the safe side). A single
 * load between two connectors gets the smaller resistance of both. The self weight is contained
 * in the resistances and is not counted.
 */
export function flexTableCheck(
  model: { loads: Load[]; loadCases: { id: string; category: string }[] },
  config: FlexConfig,
  connectors: number[],
  combos: { name: string; id: string; factors: Record<string, number> }[],
): FlexTableCheck | null {
  const letter = (i: number) => String.fromCharCode(65 + i);
  const FRd = (i: number) => (config.F[letter(i)] ?? 0) * 1.5 * kN;
  let best: FlexTableCheck | null = null;
  for (const c of combos) {
    let qEd = 0;
    const loads: FlexTableLoad[] = [];
    for (const l of model.loads) {
      const f = c.factors[l.caseId] ?? 0;
      if (!f) continue;
      if (l.kind === 'dist') {
        if (l.dir === 'z') qEd += f * Math.max(l.q1, l.q2, 0);
      } else if (l.kind === 'point') {
        const P = f * l.P * Math.sin((l.angle * Math.PI) / 180);
        if (P <= 0) continue;
        let k = 0;
        for (let i = 0; i < connectors.length; i++) if (Math.abs(connectors[i] - l.x) < Math.abs(connectors[k] - l.x)) k = i;
        if (Math.abs(connectors[k] - l.x) <= 0.05) loads.push({ x: l.x, pos: letter(k), F: P, FRd: FRd(k) });
        else {
          // between two connectors (or in an end element): the smaller resistance of the neighbours
          const j = l.x > connectors[k] ? Math.min(k + 1, connectors.length - 1) : Math.max(k - 1, 0);
          const a = Math.min(k, j);
          const b = Math.max(k, j);
          loads.push({ x: l.x, pos: a === b ? letter(a) : `${letter(a)}–${letter(b)}`, F: P, FRd: Math.min(FRd(a), FRd(b)) });
        }
      }
    }
    const qRd = config.q * 1.5 * kN;
    const eta = qEd / qRd + loads.reduce((s, l) => s + (l.FRd > 0 ? l.F / l.FRd : Infinity), 0);
    if (!best || eta > best.eta) best = { config, combo: c.name || c.id, qEd, qRd, loads, eta };
  }
  return best;
}
