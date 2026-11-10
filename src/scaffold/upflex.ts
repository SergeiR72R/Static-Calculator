/**
 * PERI UP Flex: design data of the approval Z-8.22-863 (DIBt, 22.09.2025), section 3.2 and annex A,
 * and of the PERI UP Tabellenbuch (05/2021). See docs/peri-up-flex-data.md. SI units unless noted.
 */

const kNcm = 10; // kNcm → N·m
const kN = 1e3;
const cm2 = 1e-4;
const cm4 = 1e-8;
export const E_STEEL = 210e9;
export const G_STEEL = 81e9;

/** connection variant of table 6: rosette and standard tube */
export type Variant = '1a' | '1b' | '2a' | '2b' | '2c';
/** ledger head: UH / UHD or UH Plus / UH-2 */
export type LedgerHead = 'UH' | 'PLUS';

export interface TubeData {
  name: string;
  A: number;
  I: number;
  /** design resistances (γM = 1.1, red α_pl = 1.25) */
  NRd: number;
  MRd: number;
  VRd: number;
  fyd: number;
  /** kg/m */
  g: number;
}

/** standard tubes Ø 48.3 */
export const TUBES: Record<'t27' | 't32' | 't36', TubeData> = {
  t27: { name: 'Ø48,3×2,7 S235/320', A: 3.87 * cm2, I: 10.1 * cm4, NRd: 113 * kN, MRd: 152 * kNcm, VRd: 41.4 * kN, fyd: 291e6, g: 2.91 },
  t32: { name: 'Ø48,3×3,2 S235/320', A: 4.53 * cm2, I: 11.59 * cm4, NRd: 132 * kN, MRd: 174 * kNcm, VRd: 48.5 * kN, fyd: 291e6, g: 3.56 },
  t36: { name: 'Ø48,3×3,6 S355', A: 5.06 * cm2, I: 12.71 * cm4, NRd: 163 * kN, MRd: 212 * kNcm, VRd: 60.0 * kN, fyd: 323e6, g: 3.98 },
};

export const VARIANT_TUBE: Record<Variant, keyof typeof TUBES> = { '1a': 't32', '1b': 't36', '2a': 't32', '2b': 't36', '2c': 't27' };

export interface LedgerSection {
  name: string;
  A: number;
  Iy: number;
  Iz: number;
  J: number;
  g: number;
  /** resistances of the ledger cross-section 50 mm from the standard axis (table 13) */
  w: { N: number; My: number; Vz: number; Mx: number; Mz: number; Vy: number };
}

/** ledger profiles RHP 60 × 30 (strong axis y = vertical loads) */
export const LEDGERS: Record<'r20' | 'r30' | 'r24', LedgerSection> = {
  r20: {
    name: 'RHP 60×30×2,0 S355',
    A: 3.34 * cm2,
    Iy: 15.05 * cm4,
    Iz: 5.08 * cm4,
    J: 12.3 * cm4,
    g: 2.7,
    w: { N: 80.4 * kN, My: 123 * kNcm, Vz: 41.0 * kN, Mx: 89.8 * kNcm, Mz: 109 * kNcm, Vy: 46.4 * kN },
  },
  r30: {
    name: 'RHP 60×30×3,0 S355',
    A: 4.81 * cm2,
    Iy: 20.5 * cm4,
    Iz: 6.8 * cm4,
    J: 17.1 * cm4,
    g: 4.05,
    w: { N: 117 * kN, My: 175 * kNcm, Vz: 60.0 * kN, Mx: 129 * kNcm, Mz: 154 * kNcm, Vy: 67.6 * kN },
  },
  r24: {
    name: 'RHP 60×30×2,4 S460',
    A: 3.94 * cm2,
    Iy: 17.38 * cm4,
    Iz: 5.83 * cm4,
    J: 14.3 * cm4,
    g: 3.19,
    w: { N: 95.2 * kN, My: 144 * kNcm, Vz: 48.6 * kN, Mx: 106 * kNcm, Mz: 128 * kNcm, Vy: 55.0 * kN },
  },
};

/**
 * Moment / rotation of the ledger connection: φ = M / (a − b·|M|), i.e. secant stiffness a − b·|M|
 * [a in kNcm/rad, b in 1/rad, range of |M| in kNcm]. My: positive = tension at the bottom of the
 * ledger at the connection (annex A, pages 1–8), Mz: annex A pages 11–13, Mx: pages 14–15.
 */
interface Curve {
  a: number;
  b: number;
  max: number;
}
const C = (a: number, b: number, max: number): Curve => ({ a, b, max });

const MY: Record<LedgerHead, Record<Variant, { pos: Curve; neg: Curve }>> = {
  UH: {
    '1a': { pos: C(11250, 45.9, 100), neg: C(16900, 152, 100) },
    '1b': { pos: C(12550, 54.9, 110), neg: C(16160, 136, 110) },
    '2a': { pos: C(11250, 45.9, 100), neg: C(16900, 152, 100) },
    '2b': { pos: C(11250, 45.9, 100), neg: C(16900, 152, 100) },
    '2c': { pos: C(8040, 45.9, 80), neg: C(12910, 152, 80) },
  },
  PLUS: {
    '1a': { pos: C(17100, 65.6, 175), neg: C(13150, 66.6, 145) },
    '1b': { pos: C(14900, 40.3, 250), neg: C(12000, 56.6, 175) },
    '2a': { pos: C(20000, 87.0, 175), neg: C(11700, 53.2, 145) },
    '2b': { pos: C(20000, 87.0, 175), neg: C(11700, 53.2, 145) },
    '2c': { pos: C(21300, 130, 125), neg: C(14100, 98.0, 115) },
  },
};
const rosette6 = (v: Variant) => v[0] === '2';
const mzCurve = (h: LedgerHead, v: Variant): Curve => (h === 'PLUS' && rosette6(v) ? C(520, 1.33, 35) : C(1440, 26.6, 35));
const mxCurve = (h: LedgerHead): Curve => (h === 'PLUS' ? C(4700, 77.9, 45) : C(3500, 96.0, 27));

/** secant stiffness for the moment M (N·m; sign as in the approval), N·m/rad */
function secant(c: Curve, M: number): number {
  const m = Math.min(Math.abs(M) / kNcm, c.max);
  // never below the secant at the end of the curve
  return Math.max(c.a - c.b * m, 0.05 * c.a) * kNcm;
}
export const connKy = (h: LedgerHead, v: Variant, My: number) => secant(My >= 0 ? MY[h][v].pos : MY[h][v].neg, My);
export const connKz = (h: LedgerHead, v: Variant, Mz: number) => secant(mzCurve(h, v), Mz);

/**
 * Vertical spring c_z of the ledger connection (flexibility of the rosette; annex A pages 9, 10; for
 * ledgers of 25 cm and all ledgers with a ledger diagonal UBL): secant stiffness [N/m] for the force
 * Fz in the spring [N], tension positive (the ledger lifts), compression negative (it bears on the rosette).
 *  - rosette 8 mm (variants 1): tension δ = Fz/(31.5 − 1.89·Fz), compression δ = Fz/60 up to 5 kN,
 *    then δ = Fz/10 + 0.4167 [kN, mm];
 *  - rosette 6 mm (variants 2): tension δ = Fz/(8 − 0.39·Fz), compression δ = Fz/(36 + 0.96·Fz).
 */
export function connCz(v: Variant, Fz: number): number {
  const f = Fz / kN;
  const r6 = v[0] === '2';
  const k0 = r6 ? (f >= 0 ? 8 : 36) : f >= 0 ? 31.5 : 60;
  let k: number;
  if (r6) k = f >= 0 ? 8 - 0.39 * Math.min(f, 15) : 36 + 0.96 * Math.max(f, -33);
  else k = f >= 0 ? 31.5 - 1.89 * Math.min(f, 15) : f >= -5 ? 60 : f / (f / 10 + 0.4167);
  return Math.max(k, 0.05 * k0) * 1e6;
}
export const connKx = (h: LedgerHead, Mx: number) => secant(mxCurve(h), Mx);

export interface ConnResistance {
  MyPos: number;
  MyNeg: number;
  NPos: number;
  NNeg: number;
  VzPos: number;
  VzNeg: number;
  Vy: number;
  Mz: number;
  Mx: number;
  /** factors of the interaction standard tube / ledger connection (table 12) */
  alphaPos: number;
  alphaNeg: number;
}

/** resistances of a ledger connection (table 11) and factors α (table 12); all positive, SI */
export function connResistance(h: LedgerHead, v: Variant): ConnResistance {
  const plus = h === 'PLUS';
  const my: Record<Variant, [number, number]> = plus
    ? { '1a': [161, 136], '1b': [175, 136], '2a': [158, 136], '2b': [158, 136], '2c': [113, 107] }
    : { '1a': [93.3, 89.1], '1b': [100, 100], '2a': [93.3, 89.1], '2b': [93.3, 89.1], '2c': [66.7, 68.1] };
  const r8 = !rosette6(v);
  const NPos = r8 ? (plus ? 37.3 : 24.7) : plus ? 29.4 : 24.7;
  const NNeg = plus ? (v === '2c' ? 29.4 : 37.3) : 24.7;
  const alpha: Record<Variant, [number, number]> = plus
    ? { '1a': [0.2, 0.22], '1b': [0.03, 0.05], '2a': [0.2, 0.22], '2b': [0.03, 0.05], '2c': [0.3, 0.4] }
    : { '1a': [0.29, 0.29], '1b': [0.1, 0.1], '2a': [0.29, 0.29], '2b': [0.1, 0.1], '2c': [0.5, 0.5] };
  return {
    MyPos: my[v][0] * kNcm,
    MyNeg: my[v][1] * kNcm,
    NPos: NPos * kN,
    NNeg: NNeg * kN,
    VzPos: (r8 ? 30.4 : 28.9) * kN,
    VzNeg: (plus ? 13.9 : 13.4) * kN,
    Vy: (plus ? 18.5 : 11.3) * kN,
    Mz: (plus ? 33.9 : 34.5) * kNcm,
    Mx: (plus ? 41.0 : 25.6) * kNcm,
    alphaPos: alpha[v][0],
    alphaNeg: alpha[v][1],
  };
}

/** connection forces in the sign convention of the approval, SI */
export interface ConnForces {
  /** tension positive */
  N: number;
  /** tension at the bottom of the ledger positive */
  My: number;
  /** ledger pushes the rosette down: positive */
  Vz: number;
  Vy: number;
  Mz: number;
  Mx: number;
}

/**
 * Interaction in the ledger connection (Gl. 5–10): largest utilisation and the governing equation.
 */
export function connInteraction(h: LedgerHead, v: Variant, f: ConnForces): { eta: number; eq: string; parts: Record<string, number> } {
  const R = connResistance(h, v);
  const nP = Math.max(f.N, 0) / R.NPos;
  const nN = Math.max(-f.N, 0) / R.NNeg;
  const mP = Math.max(f.My, 0) / R.MyPos;
  const mN = Math.max(-f.My, 0) / R.MyNeg;
  const vP = Math.max(f.Vz, 0) / R.VzPos;
  const vN = Math.max(-f.Vz, 0) / R.VzNeg;
  const vy = Math.abs(f.Vy) / R.Vy;
  const mz = Math.abs(f.Mz) / R.Mz;
  const mx = Math.abs(f.Mx) / R.Mx;
  const eqs: [string, number][] = [];
  if (h === 'UH') {
    const n = nP + nN;
    eqs.push(['5a', n + mP + vP + 0.6 * vy + 0.95 * mz], ['5b', n + mN + vN + 0.6 * vy + 0.95 * mz], ['5c', nP + mx + mz]);
  } else {
    const X = Math.max(vy, mz);
    eqs.push(['7a', mP + vP + X], ['7b', nN + mP + X], ['7c', mN + vN + X], ['7d', nP + mx + mz]);
    if (v === '1a' || v === '1b') eqs.push(['8a', nP + 0.97 * mN + 0.23 * vP + X], ['8b', nP + 0.43 * mN + 0.66 * vP + X], ['8c', nP + mN + 0.58 * vN + X]);
    else if (v === '2a' || v === '2b') eqs.push(['9a', nP + 0.97 * mN + 0.23 * vP + X], ['9b', nP + 0.37 * mN + 0.71 * vP + X], ['9c', nP + mN + X]);
    else eqs.push(['10a', nP + 0.29 * mN + 0.71 * vP + X], ['10b', nP + mN + X]);
  }
  const best = eqs.reduce((a, b) => (b[1] > a[1] ? b : a));
  return { eta: best[1], eq: best[0], parts: { nP, nN, mP, mN, vP, vN, vy, mz, mx } };
}

/**
 * Vectorial utilisation of a tube under N and M with the cosine interaction m = cos(π/2·n)
 * (approval Bild 1): I_S = a / b along the ray through (n, m).
 */
export function tubeUtilisation(n0: number, m0: number): number {
  const n = Math.abs(n0);
  const m = Math.abs(m0);
  const a = Math.hypot(n, m);
  if (a < 1e-12) return 0;
  // point on the interaction curve on the ray: t·(n, m) with t·m = cos(π/2·t·n)
  let lo = 0;
  let hi = n > 1e-12 ? 1 / n : 1e6;
  for (let k = 0; k < 60; k++) {
    const t = (lo + hi) / 2;
    if (t * m < Math.cos((Math.PI / 2) * Math.min(t * n, 1))) lo = t;
    else hi = t;
  }
  return 1 / ((lo + hi) / 2);
}

/** standard joint ("Übergreifstoß", 3.2.8.2) */
export const JOINT = { k: 12900 * kNcm, MRd: 113 * kNcm, NRd: 100 * kN };

/** couplers EN 74-1 class B: design slip resistance (permissible 9.1 kN × 1.5) */
export const COUPLER_RD = 9.1 * 1.5 * kN;

export interface DiagonalData {
  /** axial stiffness in tension / compression, N */
  eaT: number;
  eaC: number;
  /** resistances in tension / compression, N */
  nT: number;
  nC: number;
  /** slack, m */
  slack: number;
}

// L, H [m]; tension R8: EA [kN], N_Rd [kN]; tension R6; compression R8; compression R6
const UBK: number[][] = [
  [1.5, 0.5, 1970.0, 10.2, 1910.0, 10.3, 2020.0, 10.1, 750.0, 10.3],
  [2.0, 0.5, 2580.0, 9.77, 2500.0, 9.98, 2710.0, 9.77, 970.0, 9.98],
  [2.5, 0.5, 3160.0, 9.64, 3080.0, 9.85, 2540.0, 9.62, 1070.0, 9.62],
  [3.0, 0.5, 3740.0, 9.58, 3660.0, 9.78, 2600.0, 6.64, 1240.0, 6.64],
  [1.0, 1.0, 2210.0, 13.2, 2050.0, 9.88, 1140.0, 12.2, 730.0, 7.62],
  [1.04, 1.0, 2460.0, 13.2, 2360.0, 10.3, 1700.0, 12.4, 1140.0, 7.77],
  [1.25, 1.0, 2200.0, 13.2, 2070.0, 11.4, 1400.0, 12.0, 790.0, 8.62],
  [1.5, 1.0, 2460.0, 12.7, 2250.0, 12.6, 1970.0, 11.8, 850.0, 9.75],
  [2.0, 1.0, 2920.0, 11.6, 2780.0, 11.5, 2380.0, 10.7, 1090.0, 11.0],
  [2.5, 1.0, 3420.0, 10.8, 3300.0, 10.7, 2590.0, 8.52, 1200.0, 8.52],
  [3.0, 1.0, 3960.0, 10.0, 3830.0, 10.2, 2280.0, 6.09, 1310.0, 6.09],
  [1.5, 1.5, 3190.0, 13.2, 3010.0, 10.5, 1570.0, 11.3, 1090.0, 7.83],
  [2.0, 1.5, 3460.0, 13.1, 3130.0, 13.0, 2220.0, 9.74, 1310.0, 9.24],
  [2.5, 1.5, 3860.0, 12.1, 3640.0, 12.0, 2210.0, 7.15, 1380.0, 7.15],
  [3.0, 1.5, 4320.0, 11.5, 4120.0, 11.3, 1970.0, 5.32, 1660.0, 5.32],
  [0.72, 2.0, 3560.0, 9.69, 3090.0, 6.07, 1970.0, 9.69, 1350.0, 6.07],
  [0.75, 2.0, 3360.0, 9.73, 3060.0, 6.09, 1420.0, 9.73, 1120.0, 6.09],
  [1.0, 2.0, 3500.0, 10.5, 3230.0, 6.69, 1460.0, 10.1, 1190.0, 6.34],
  [1.04, 2.0, 3790.0, 10.6, 3340.0, 6.8, 2050.0, 10.2, 1460.0, 6.38],
  [1.25, 2.0, 3670.0, 11.4, 3470.0, 7.44, 1540.0, 10.5, 1270.0, 6.65],
  [1.5, 2.0, 3890.0, 12.2, 3750.0, 8.35, 1900.0, 9.49, 1310.0, 7.03],
  [2.0, 2.0, 4100.0, 13.2, 3920.0, 10.8, 1970.0, 7.48, 1820.0, 7.48],
  [2.5, 2.0, 4360.0, 13.2, 3960.0, 13.2, 1890.0, 5.81, 1720.0, 5.81],
  [3.0, 2.0, 4800.0, 12.4, 4450.0, 12.3, 1690.0, 4.5, 1520.0, 4.5],
];
const UBS: number[][] = [
  [1.0, 1.0, 4550.0, 16.8, 2730.0, 11.8, 4670.0, 14.9, 3270.0, 10.4],
  [1.5, 1.0, 6130.0, 15.8, 3680.0, 11.1, 4790.0, 15.8, 3350.0, 11.1],
  [2.0, 1.0, 8110.0, 14.5, 4870.0, 10.2, 4080.0, 14.4, 2860.0, 10.1],
  [2.5, 1.0, 10470.0, 14.0, 6280.0, 9.8, 3070.0, 10.9, 2150.0, 7.6],
  [3.0, 1.0, 12640.0, 13.7, 7580.0, 9.8, 3140.0, 8.4, 2200.0, 5.9],
  [1.0, 1.5, 5250.0, 14.6, 3150.0, 10.2, 5200.0, 13.8, 3640.0, 9.7],
  [1.5, 1.5, 6320.0, 17.2, 3790.0, 12.0, 4200.0, 15.0, 2940.0, 10.5],
  [2.0, 1.5, 7830.0, 16.1, 4700.0, 11.3, 3710.0, 12.2, 2600.0, 8.6],
  [2.5, 1.5, 9460.0, 15.3, 5680.0, 10.7, 3310.0, 9.58, 2320.0, 6.7],
  [3.0, 1.5, 11710.0, 14.5, 7030.0, 10.2, 2890.0, 7.54, 2020.0, 5.3],
  [2.0, 2.0, 8120.0, 17.0, 4870.0, 11.9, 3340.0, 10.0, 2340.0, 7.0],
  [2.5, 2.0, 9400.0, 16.2, 5640.0, 11.3, 2910.0, 8.17, 2040.0, 5.7],
  [3.0, 2.0, 10790.0, 15.7, 6470.0, 11.0, 2700.0, 6.52, 1890.0, 4.6],
];
// L, B [m]; EA [kN]
const UBH: number[][] = [
  [1.0, 1.0, 6900],
  [1.25, 1.0, 7430],
  [1.25, 1.25, 7840],
  [1.5, 0.67, 7560],
  [1.5, 0.72, 7610],
  [1.5, 0.75, 7650],
  [1.5, 1.0, 7920],
  [1.5, 1.04, 7950],
  [1.5, 1.25, 8150],
  [1.5, 1.5, 8410],
  [2.0, 0.67, 8410],
  [2.0, 0.72, 8420],
  [2.0, 0.75, 8420],
  [2.0, 1.0, 8490],
  [2.0, 1.04, 8490],
  [2.0, 1.25, 8500],
  [2.0, 1.5, 8520],
  [2.0, 2.0, 8190],
  [2.5, 0.67, 8470],
  [2.5, 0.72, 8460],
  [2.5, 0.75, 8450],
  [2.5, 1.0, 8370],
  [2.5, 1.04, 8350],
  [2.5, 1.25, 8190],
  [2.5, 1.5, 8010],
  [2.5, 2.0, 7220],
  [2.5, 2.5, 5850],
  [3.0, 0.67, 7590],
  [3.0, 0.72, 7560],
  [3.0, 0.75, 7540],
  [3.0, 1.0, 7330],
  [3.0, 1.04, 7290],
  [3.0, 1.25, 6990],
  [3.0, 1.5, 6660],
  [3.0, 2.0, 5510],
  [3.0, 2.5, 3910],
  [3.0, 3.0, 2310],
];

function nearestRow(t: number[][], L: number, H: number): number[] {
  return t.reduce((a, b) => (Math.abs(b[0] - L) + Math.abs(b[1] - H) < Math.abs(a[0] - L) + Math.abs(a[1] - H) ? b : a));
}

/** node diagonal UBK / UBK-2 (table 15) for the bay L × H; slack 1.0 cm (rosette 8 mm) / 1.2 cm (6 mm) */
export function ubkData(L: number, H: number, r6: boolean): DiagonalData {
  const r = nearestRow(UBK, L, H);
  const o = r6 ? 2 : 0;
  return { eaT: r[2 + o] * kN, nT: r[3 + o] * kN, eaC: r[6 + o] * kN, nC: r[7 + o] * kN, slack: r6 ? 0.012 : 0.01 };
}

/** bracing diagonal UBS (table 14); slack 0.1 cm (rosette 8 mm) / 0.3 cm (6 mm) */
export function ubsData(L: number, H: number, r6: boolean): DiagonalData {
  const r = nearestRow(UBS, L, H);
  const o = r6 ? 2 : 0;
  return { eaT: r[2 + o] * kN, nT: r[3 + o] * kN, eaC: r[6 + o] * kN, nC: r[7 + o] * kN, slack: r6 ? 0.003 : 0.001 };
}

/** horizontal diagonal UBH Flex (table 19) for the bay L × B (L ≥ B); slack 0.2 cm */
export function ubhData(L0: number, B0: number): DiagonalData {
  const L = Math.max(L0, B0);
  const B = Math.min(L0, B0);
  const r = nearestRow(UBH, L, B);
  const n = (r[0] === 3 && r[1] === 3 ? 11.1 : 11.2) * kN;
  return { eaT: r[2] * kN, eaC: r[2] * kN, nT: n, nC: n, slack: 0.002 };
}

// Riegeldiagonale UBL / UBL-2 (tables 16: at UH, 17: at UH Plus / UH-2): L, H [m]; spring Cd in
// tension [kN/cm], N_Rd compression [kN], Cd compression linear, Cd1, Cd2 bilinear [kN/cm];
// N_Rd tension 9.64 kN (UH) / 12.3 kN (UH Plus). From the PDF text: where the merged cell 12.3 kN of
// table 17 landed in the compression column, the value of the next longer field is taken; row
// 1.50 × 2.00 of table 17 interpolated.
const UBL_UH: number[][] = [
  [0.5, 0.5, 28.1, 9.64, 27.1, 27.3, 26.8],
  [0.67, 0.5, 27.6, 9.64, 26.5, 26.7, 26.1],
  [0.72, 0.5, 27.4, 9.64, 26.3, 26.5, 25.9],
  [0.75, 0.5, 27.3, 9.64, 26.1, 26.4, 25.6],
  [1, 0.5, 26.5, 9.64, 24.8, 25.1, 24.3],
  [1.04, 0.5, 26.2, 9.64, 24.5, 24.9, 23.9],
  [1.25, 0.5, 25.5, 9.64, 23.1, 23.6, 22.2],
  [1.5, 0.5, 24.8, 9.64, 21.4, 22.1, 20.1],
  [1.75, 0.5, 24, 9.64, 19.3, 20.4, 17.4],
  [2, 0.5, 23.4, 9.64, 16.9, 18.7, 14.3],
  [2.25, 0.5, 22.8, 9.64, 14.1, 16.7, 10.7],
  [2.5, 0.5, 22.3, 9.44, 10.9, 14.6, 7.26],
  [2.75, 0.5, 21.9, 8.61, 8.63, 13, 5.16],
  [3, 0.5, 21.5, 7.52, 7.26, 11.8, 4.1],
  [0.5, 1, 25.9, 9.64, 23.8, 24.2, 23],
  [0.67, 1, 25.7, 9.64, 23.4, 23.8, 22.6],
  [0.72, 1, 25.6, 9.64, 23.3, 23.7, 22.4],
  [0.75, 1, 25.5, 9.64, 23.1, 23.6, 22.2],
  [1, 1, 25.1, 9.64, 22.2, 22.8, 21],
  [1.04, 1, 24.9, 9.64, 22, 22.6, 20.8],
  [1.25, 1, 24.5, 9.64, 20.8, 21.6, 19.3],
  [1.5, 1, 24, 9.64, 19.1, 20.3, 17.1],
  [1.75, 1, 23.4, 9.64, 17.1, 18.8, 14.4],
  [2, 1, 22.9, 9.64, 14.6, 17.1, 11.4],
  [2.25, 1, 22.4, 9.61, 11.7, 15.2, 8.05],
  [2.5, 1, 22, 9.05, 9.19, 13.5, 5.62],
  [2.75, 1, 21.6, 7.95, 7.8, 12.3, 4.5],
  [3, 1, 21.3, 7, 6.65, 11.2, 3.66],
  [0.5, 1.5, 24.2, 9.64, 19.8, 20.8, 18.1],
  [0.67, 1.5, 24.1, 9.64, 19.5, 20.6, 17.7],
  [0.72, 1.5, 24, 9.64, 19.4, 20.5, 17.5],
  [0.75, 1.5, 24, 9.64, 19.3, 20.4, 17.4],
  [1, 1.5, 23.7, 9.64, 18.4, 19.8, 16.2],
  [1.04, 1.5, 23.7, 9.64, 18.2, 19.6, 15.9],
  [1.25, 1.5, 23.4, 9.64, 17.1, 18.8, 14.4],
  [1.5, 1.5, 23, 9.64, 15.4, 17.6, 12.3],
  [1.75, 1.5, 22.7, 9.64, 13.3, 16.2, 9.76],
  [2, 1.5, 22.3, 9.46, 10.9, 14.6, 7.23],
  [2.25, 1.5, 22, 8.85, 8.96, 13.3, 5.43],
  [2.5, 1.5, 21.6, 7.9, 7.74, 12.2, 4.46],
  [2.75, 1.5, 21.3, 7.04, 6.7, 11.3, 3.7],
  [3, 1.5, 21, 6.3, 5.76, 10.4, 3.04],
  [0.5, 2, 22.9, 9.64, 14.6, 17.1, 11.4],
  [0.67, 2, 22.8, 9.64, 14.3, 16.8, 11],
  [0.72, 2, 22.8, 9.64, 14.2, 16.8, 10.8],
  [0.75, 2, 22.8, 9.64, 14.1, 16.7, 10.7],
  [1, 2, 22.7, 9.64, 13.1, 16, 9.53],
  [1.04, 2, 22.6, 9.64, 12.9, 15.9, 9.31],
  [1.25, 2, 22.4, 9.61, 11.7, 15.2, 8.05],
  [1.5, 2, 22.2, 9.35, 10.3, 14.2, 6.61],
  [1.75, 2, 22, 8.85, 8.96, 13.3, 5.43],
  [2, 2, 21.7, 8.1, 8.01, 12.5, 4.66],
  [2.25, 2, 21.4, 7.38, 7.11, 11.7, 3.99],
  [2.5, 2, 21.2, 6.72, 6.23, 10.9, 3.36],
  [2.75, 2, 20.9, 6.07, 5.52, 10.1, 2.88],
  [3, 2, 20.7, 5.49, 4.89, 9.44, 2.49],
];
const UBL_PLUS: number[][] = [
  [0.5, 0.5, 28.1, 12.3, 27.1, 27.2, 26.8],
  [0.67, 0.5, 27.7, 12.3, 26.4, 26.6, 26.1],
  [0.72, 0.5, 27.5, 12.3, 26.1, 26.4, 25.7],
  [0.75, 0.5, 27.4, 12.2, 26, 26.2, 25.5],
  [1, 0.5, 26.5, 11.9, 24.5, 24.9, 23.8],
  [1.04, 0.5, 26.4, 11.9, 24.3, 24.7, 23.6],
  [1.25, 0.5, 25.7, 11.6, 22.9, 23.4, 21.8],
  [1.5, 0.5, 24.9, 11.2, 21, 21.9, 19.4],
  [1.75, 0.5, 24.2, 10.8, 18.9, 20.2, 16.6],
  [2, 0.5, 23.6, 10.4, 16.4, 18.4, 13.5],
  [2.25, 0.5, 23.1, 9.93, 13.8, 16.5, 10.3],
  [2.5, 0.5, 22.7, 9.44, 10.9, 14.6, 7.26],
  [2.75, 0.5, 22.3, 8.61, 8.63, 13, 5.16],
  [3, 0.5, 21.9, 7.52, 7.26, 11.8, 4.1],
  [0.5, 1, 26, 11.8, 23.5, 24, 22.7],
  [0.67, 1, 25.8, 11.7, 23.1, 23.7, 22.1],
  [0.72, 1, 25.7, 11.6, 23, 23.5, 22],
  [0.75, 1, 25.7, 11.6, 22.9, 23.4, 21.8],
  [1, 1, 25.2, 11.4, 21.8, 22.6, 20.4],
  [1.04, 1, 25.1, 11.4, 21.6, 22.3, 20.2],
  [1.25, 1, 24.7, 11.1, 20.4, 21.4, 18.6],
  [1.5, 1, 24.2, 10.8, 18.6, 20.1, 16.3],
  [1.75, 1, 23.7, 10.5, 16.6, 18.5, 13.7],
  [2, 1, 23.2, 10, 14.3, 16.9, 10.9],
  [2.25, 1, 22.8, 9.61, 11.7, 15.2, 8.05],
  [2.5, 1, 22.4, 9.05, 9.19, 13.5, 5.62],
  [2.75, 1, 22.1, 7.95, 7.8, 12.3, 4.5],
  [3, 1, 21.7, 7, 6.65, 11.2, 3.66],
  [0.5, 1.5, 24.4, 10.9, 19.4, 20.6, 17.4],
  [0.67, 1.5, 24.3, 10.9, 19.1, 20.3, 16.9],
  [0.72, 1.5, 24.2, 10.8, 18.9, 20.2, 16.7],
  [0.75, 1.5, 24.2, 10.8, 18.9, 20.2, 16.6],
  [1, 1.5, 24, 10.7, 17.9, 19.5, 15.4],
  [1.04, 1.5, 23.9, 10.6, 17.7, 19.4, 15.2],
  [1.25, 1.5, 23.7, 10.5, 16.6, 18.5, 13.7],
  [1.5, 1.5, 23.3, 10.2, 15, 17.4, 11.7],
  [1.75, 1.5, 23, 9.84, 13.1, 16.1, 9.47],
  [2, 1.5, 22.7, 9.46, 10.9, 14.6, 7.23],
  [2.25, 1.5, 22.3, 8.85, 8.96, 13.3, 5.43],
  [2.5, 1.5, 22, 7.9, 7.74, 12.2, 4.46],
  [2.75, 1.5, 21.8, 7.04, 6.7, 11.3, 3.7],
  [3, 1.5, 21.5, 6.3, 5.76, 10.4, 3.04],
  [0.5, 2, 23.2, 9.97, 14.3, 16.9, 10.9],
  [0.67, 2, 23.1, 9.97, 14, 16.7, 10.5],
  [0.72, 2, 23.1, 9.97, 13.8, 16.6, 10.4],
  [0.75, 2, 23.1, 9.96, 13.7, 16.6, 10.3],
  [1, 2, 23, 9.81, 12.9, 16, 9.31],
  [1.04, 2, 22.9, 9.78, 12.7, 15.8, 9.14],
  [1.25, 2, 22.8, 9.61, 11.7, 15.2, 8.05],
  [1.5, 2, 22.55, 9.23, 10.33, 14.25, 6.74],
  [1.75, 2, 22.3, 8.85, 8.96, 13.3, 5.43],
  [2, 2, 22.1, 8.1, 8.01, 12.5, 4.66],
  [2.25, 2, 21.9, 7.38, 7.11, 11.7, 3.99],
  [2.5, 2, 21.6, 6.72, 6.23, 10.9, 3.36],
  [2.75, 2, 21.4, 6.07, 5.52, 10.1, 2.88],
  [3, 2, 21.2, 5.49, 4.89, 9.44, 2.49],
];

/**
 * Ledger diagonal UBL / UBL-2 (tables 16 / 17) for the field L × H at ledgers UH or UH Plus; slack
 * 0.2 cm. The approval gives springs C_d [kN/cm]: EA = C_d · length of the diagonal. The flexibility
 * of the rosettes comes from the springs c_z of the ledgers the diagonal is fixed to (`connCz`).
 */
export function ublData(L: number, H: number, plus: boolean, length: number): DiagonalData {
  const t = plus ? UBL_PLUS : UBL_UH;
  // the next larger field (on the safe side for the resistance)
  const cand = t.filter((r) => r[0] >= L - 0.02 && r[1] >= H - 0.02);
  const r = cand.length ? nearestRow(cand, L, H) : nearestRow(t, L, H);
  const cd = (v: number) => v * 1e5 * length;
  return { eaT: cd(r[2]), eaC: cd(r[4]), nT: (plus ? 12.3 : 9.64) * kN, nC: r[3] * kN, slack: 0.002 };
}

/** reduction factor χ for flexural buckling, EN 1993-1-1 (curve a: α = 0.21 … c: 0.49) */
export function chi(lambdaBar: number, alpha: number): number {
  if (lambdaBar <= 0.2) return 1;
  const phi = 0.5 * (1 + alpha * (lambdaBar - 0.2) + lambdaBar * lambdaBar);
  return Math.min(1, 1 / (phi + Math.sqrt(phi * phi - lambdaBar * lambdaBar)));
}

/**
 * Scaffold spindles UJB / UJS (approval 3.2.9.5): equivalent cross-section after DIN 4425,
 * W_pl = 1.25 · W_el; steel S235 assumed, f_y,d = 235 / 1.1 N/mm² (the approval gives no grade).
 */
export const JACK = (() => {
  const A = 4.36e-4;
  const I = 4.96e-8;
  const Wpl = 4.04e-6;
  const fyd = 235e6 / 1.1;
  return { A, I, Wpl, NRd: A * fyd, MRd: Wpl * fyd };
})();
