/**
 * Enclosures (tents, Einhausungen) of PERI UP after DIN EN 16508, as the PERI design reports do:
 *  - wind after DIN EN 1991-1-4/NA (mixed profile), reduced for the standing time k(T);
 *  - snow after DIN EN 1991-1-3/NA;
 *  - pressure coefficients of a monopitch enclosure (EN 16508): roof suction, walls pressure / suction;
 *  - the roof girders (ULS / ULA lattice girders of the drawing) with the roof loads as point loads at
 *    the purlins: chords, chord buckling, diagonals, couplers at the bearings (beam calculator, PERI checks);
 *  - local sliding and overturning of the whole enclosure.
 * Loads in N, lengths in m.
 */
import { analyze } from '../core/analysis';
import { analyzeLattice, latticeEnvelope, type MemberDesign, type BearingDesign } from '../core/lattice';
import { pointLoad } from '../core/defaults';
import type { BeamModel, Combination } from '../core/types';
import type { Girder, ScaffoldStructure } from '../scaffold/structure';
import { girderBeamModel } from '../scaffold/structure';
import { partKg } from '../scaffold/weights';
import { QB_DE, type ExposureDE } from '../scaffold/wind';

export type SnowZone = '1' | '1a' | '2' | '2a' | '3';
export const SNOW_ZONES: SnowZone[] = ['1', '1a', '2', '2a', '3'];

/** characteristic snow load on the ground after DIN EN 1991-1-3/NA, N/m² (A: altitude, m) */
export function snowGroundDE(zone: SnowZone, A: number): number {
  const f = ((A + 140) / 760) ** 2;
  const base = zone.startsWith('1') ? Math.max(0.19 + 0.91 * f, 0.65) : zone.startsWith('2') ? Math.max(0.25 + 1.91 * f, 0.85) : Math.max(0.31 + 2.91 * f, 1.1);
  return (zone.endsWith('a') ? 1.25 * base : base) * 1e3;
}

/** shape coefficient μ1 of a monopitch roof (EN 1991-1-3, table 5.2) */
export function snowShape(alphaDeg: number): number {
  if (alphaDeg <= 30) return 0.8;
  if (alphaDeg < 60) return (0.8 * (60 - alphaDeg)) / 30;
  return 0;
}

/** peak velocity pressure after DIN EN 1991-1-4/NA, mixed profile (annex NA.B.3.3), N/m² */
export function qpProfileDE(zone: number, exposure: ExposureDE, z: number): number {
  const qb = QB_DE[zone] ?? QB_DE[1];
  // above 50 m the profiles go on with their upper branch (up to 300 m)
  if (exposure === 'coast' && zone > 1) return z <= 4 ? 1.8 * qb : z <= 50 ? 2.3 * qb * (z / 10) ** 0.27 : 2.6 * qb * (z / 10) ** 0.19;
  if (exposure === 'island') return z <= 2 ? 1.1 * 1e3 : 1.5 * 1e3 * (z / 10) ** 0.19;
  return z <= 7 ? 1.5 * qb : z <= 50 ? 1.7 * qb * (z / 10) ** 0.37 : 2.1 * qb * (z / 10) ** 0.24;
}

/** reduction of the wind for temporary states (DIN EN 1991-1-4/NA, table NA.B.5): duration × measures */
export const STANDING_DURATIONS = ['3d', '3m', '12m', '24m'] as const;
export type StandingDuration = (typeof STANDING_DURATIONS)[number];
export type StandingMeasures = 'protect' | 'reinforce' | 'none';
const KT: Record<StandingDuration, Record<StandingMeasures, number>> = {
  '3d': { protect: 0.1, reinforce: 0.2, none: 0.5 },
  '3m': { protect: 0.2, reinforce: 0.3, none: 0.5 },
  '12m': { protect: 0.2, reinforce: 0.3, none: 0.6 },
  '24m': { protect: 0.2, reinforce: 0.4, none: 0.7 },
};
export function standingFactor(d: StandingDuration, m: StandingMeasures): number {
  return KT[d][m];
}

/** pressure coefficients of a monopitch enclosure (EN 16508; values of the PERI reports) */
export interface Cpe {
  /** roof suction, wind on the low eave / on the high eave */
  roofLow: number;
  roofHigh: number;
  /** walls: pressure (windward) and suction (leeward) */
  wallPressure: number;
  wallSuction: number;
}
export const DEFAULT_CPE: Cpe = { roofLow: -0.6, roofHigh: -0.9, wallPressure: 0.8, wallSuction: -0.5 };

/** friction coefficients (DIN EN 12812): base plate on … */
export const FRICTION = { timber: 0.5, concrete: 0.4, steel: 0.2 } as const;
export type Friction = keyof typeof FRICTION;

export interface TentGeometry {
  /** length of the eaves (walls along the eaves), m */
  L: number;
  /** depth across the eaves (span of the roof girders in plan), m */
  B: number;
  /** eave heights: low and high side, m */
  hLow: number;
  hHigh: number;
  /** the high eave lies at the end of the girders at x = 0 (else at x = L of the girders) */
  highAtStart?: boolean;
  /** roof area with the overhangs, m² (else from L, B and the pitch) */
  roofArea?: number;
}

export interface TentInput {
  geo: TentGeometry;
  /** peak velocity pressure with k(T), N/m² */
  qp: number;
  /** snow load on the roof (μ1 · Ce · Ct · sk), N/m² */
  snow: number;
  /** self weight of the roof (girders, purlins, cladding), N/m² of roof */
  gRoof: number;
  /** total self weight of the enclosure, N */
  Gk: number;
  cpe: Cpe;
  /** friction coefficient and its partial factor (DIN EN 12812: 1.3) */
  mu: number;
  gammaMu: number;
  /** spacing of the purlins along the girders (point loads), m */
  purlin: number;
  /** spacing of the lateral restraints of the girder chords (buckling length), m */
  restraint: number;
}

export const GAMMA_G = 1.35;
export const GAMMA_Q = 1.5;

/** geometry of the enclosure from the drawing: plan of the standards, eave heights, girder direction */
export function tentGeometry(st: ScaffoldStructure): TentGeometry | null {
  if (!st.columns.length) return null;
  const xs = st.columns.map((c) => c.x);
  const ys = st.columns.map((c) => c.y);
  const g = st.girders[0];
  // across the eaves: along the roof girders
  const alongX = g ? Math.abs(g.u[0]) >= Math.abs(g.u[1]) : true;
  const ex = Math.max(...xs) - Math.min(...xs);
  const ey = Math.max(...ys) - Math.min(...ys);
  const z0 = Math.min(...st.columns.map((c) => c.z0));
  let hLow: number;
  let hHigh: number;
  let highAtStart = false;
  if (st.girders.length) {
    // eaves: the top chord at both ends of the girders (an inclined girder: its lowest point is the
    // bottom chord at the low end, the top chord lies the depth of the girder above it)
    const depth = (q: Girder) => Number(/(\d{2})/.exec(q.product)?.[1] ?? 50) / 100;
    hHigh = Math.max(...st.girders.map((q) => q.zTop - z0));
    hLow = Math.min(...st.girders.map((q) => q.zBottom + depth(q) - z0));
    // side of the high eave: the higher standards at the start or the end of the girder
    const col = (s: number) => {
      const p = [g.origin[0] + g.u[0] * s, g.origin[1] + g.u[1] * s];
      const near = st.columns.filter((c) => Math.hypot(c.x - p[0], c.y - p[1]) < 1);
      return near.length ? Math.max(...near.map((c) => c.z1)) : -Infinity;
    };
    highAtStart = col(0) > col(g.L);
  } else {
    const tops = st.columns.map((c) => c.z1 - z0);
    hHigh = Math.max(...tops);
    hLow = Math.min(...tops);
  }
  return { L: alongX ? ey : ex, B: alongX ? ex : ey, hLow, hHigh, highAtStart };
}

/** derived sizes of the enclosure */
export function tentSizes(geo: TentGeometry) {
  const rise = geo.hHigh - geo.hLow;
  const alpha = (Math.atan2(rise, geo.B) * 180) / Math.PI;
  const roofArea = geo.roofArea && geo.roofArea > 0 ? geo.roofArea : geo.L * Math.hypot(geo.B, rise);
  return {
    alpha,
    roofArea,
    /** walls along the eaves: high side A, low side B; gables: trapezoids */
    wallA: geo.L * geo.hHigh,
    wallB: geo.L * geo.hLow,
    gable: (geo.B * (geo.hLow + geo.hHigh)) / 2,
  };
}

/** weight of the parts of the drawing, N; of the roof: the parts above the low eave (girders, purlins …) */
export function partWeights(st: ScaffoldStructure, geo: TentGeometry): { total: number; roof: number; unknown: number } {
  const z0 = Math.min(...st.columns.map((c) => c.z0));
  let total = 0;
  let roof = 0;
  let unknown = 0;
  for (const w of st.parts) {
    const kg = partKg(w.part);
    if (kg === undefined) {
      unknown++;
      continue;
    }
    total += kg * 9.81;
    const zc = (w.min[2] + w.max[2]) / 2 - z0;
    if (w.cls.kind === 'girder' || zc > geo.hLow - 0.3) roof += kg * 9.81;
  }
  return { total, roof, unknown };
}

export interface WindResult {
  /** walls along the eaves: windward pressure, leeward suction and the total horizontal force, N */
  wallA: number;
  wallB: number;
  /** wind across the eaves (on the high wall) and along the eaves (on a gable), N */
  across: number;
  along: number;
  /** uplift of the roof (suction on the whole roof, wind on the high eave), N */
  uplift: number;
}

export function tentWind(inp: TentInput): WindResult {
  const s = tentSizes(inp.geo);
  const { qp, cpe } = inp;
  const pA = qp * s.wallA * cpe.wallPressure;
  const sB = qp * s.wallB * cpe.wallSuction;
  const across = Math.abs(pA) + Math.abs(sB);
  const along = qp * s.gable * (Math.abs(cpe.wallPressure) + Math.abs(cpe.wallSuction));
  const uplift = qp * s.roofArea * Math.abs(Math.min(cpe.roofHigh, cpe.roofLow));
  return { wallA: pA, wallB: sB, across, along, uplift };
}

export interface StabilityResult {
  /** normal force on the ground: G − uplift (γ = 1.0 both, as the PERI reports), N */
  Nd: number;
  /** sliding: design horizontal force and resistance μ · N_d / γ_μ, N */
  FfEd: number;
  FfRd: number;
  etaSliding: number;
  /** overturning about the leeward edge: destabilising 1.5 · H · h/2, stabilising N_d · b/2, N·m */
  Mdst: number;
  Mstb: number;
  etaOverturning: number;
  /** governing wind direction: across the eaves (on the high wall) or along them (on a gable) */
  dir: 'across' | 'along';
  /** lever arms of the check, m */
  hLever: number;
  bLever: number;
}

export function tentStability(inp: TentInput, w = tentWind(inp)): StabilityResult {
  const geo = inp.geo;
  const Nd = inp.Gk - w.uplift;
  const FfRd = Math.max(0, (inp.mu * Nd) / inp.gammaMu);
  const cases = [
    { dir: 'across' as const, H: w.across, h: geo.hHigh / 2, b: geo.B / 2 },
    { dir: 'along' as const, H: w.along, h: (geo.hLow + geo.hHigh) / 4, b: geo.L / 2 },
  ].map((c) => {
    const FfEd = GAMMA_Q * c.H;
    const Mdst = GAMMA_Q * c.H * c.h;
    const Mstb = Math.max(0, Nd * c.b);
    return { ...c, FfEd, Mdst, Mstb, etaS: FfRd > 0 ? FfEd / FfRd : Infinity, etaO: Mstb > 0 ? Mdst / Mstb : Infinity };
  });
  const gov = cases.reduce((a, b) => (Math.max(b.etaS, b.etaO) > Math.max(a.etaS, a.etaO) ? b : a));
  return {
    Nd,
    FfEd: gov.FfEd,
    FfRd,
    etaSliding: gov.etaS,
    Mdst: gov.Mdst,
    Mstb: gov.Mstb,
    etaOverturning: gov.etaO,
    dir: gov.dir,
    hLever: gov.h,
    bLever: gov.b,
  };
}

/** tributary width of each girder (half the distance to its neighbours; at the edge the half spacing), m */
export function tributaryWidths(girders: Girder[]): number[] {
  if (!girders.length) return [];
  const n: [number, number] = [-girders[0].u[1], girders[0].u[0]];
  const pos = girders.map((g) => g.origin[0] * n[0] + g.origin[1] * n[1]);
  const order = pos.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const out = new Array<number>(girders.length).fill(0);
  order.forEach((o, k) => {
    const prev = k > 0 ? o.p - order[k - 1].p : null;
    const next = k + 1 < order.length ? order[k + 1].p - o.p : null;
    out[o.i] = ((prev ?? next ?? 0) + (next ?? prev ?? 0)) / 2;
  });
  return out;
}

/** purlin positions along a girder: from end to end, equally spaced at about the purlin spacing */
export function purlinPoints(L: number, spacing: number): { x: number; share: number }[] {
  const n = Math.max(1, Math.round(L / Math.max(spacing, 0.1)));
  const a = L / n;
  return Array.from({ length: n + 1 }, (_, i) => ({ x: i * a, share: i === 0 || i === n ? a / 2 : a }));
}

export interface GirderResult {
  key: string;
  product: string;
  L: number;
  supports: number[];
  /** tributary width, m, and the point loads (characteristic per purlin: G, S, W↑), N */
  width: number;
  points: { x: number; G: number; S: number; W: number }[];
  /** governing design per kind: chord (section), chord buckling, diagonal, coupler at a bearing */
  chord?: MemberDesign;
  buckling?: MemberDesign;
  diagonal?: MemberDesign;
  bearing?: BearingDesign;
  eta: number;
  model: BeamModel;
}

/** the beam model of a roof girder with the roof loads at the purlins, combinations of the PERI report */
export function girderModel(g: Girder, width: number, inp: TentInput): { model: BeamModel; points: GirderResult['points'] } {
  const m = girderBeamModel({ ...g, loads: [] }, { g: 0, p: 0 } as never);
  m.settings.selfWeight = false;
  m.segments[0].section = { kind: 'peri', product: g.product, lattice: { ...(g.flex ? { flex: g.flex } : {}), restraint: inp.restraint } } as never;
  // the roof suction on the girder: wind on the high eave (the larger suction)
  const suction = Math.abs(Math.min(inp.cpe.roofHigh, inp.cpe.roofLow));
  const points = purlinPoints(g.L, inp.purlin).map((p) => {
    const A = p.share * width;
    return { x: p.x, G: inp.gRoof * A, S: inp.snow * A, W: inp.qp * suction * A };
  });
  m.loads = points.flatMap((p) => [
    pointLoad('G', p.x, p.G / 1e3),
    ...(p.S > 0 ? [pointLoad('S', p.x, p.S / 1e3)] : []),
    ...(p.W > 0 ? [pointLoad('W', p.x, p.W / 1e3, -90)] : []),
  ]);
  const combos: Combination[] = [
    { id: 'ULS1', name: '1,35·G + 1,5·S', type: 'ULS', factors: { G: GAMMA_G, S: GAMMA_Q }, inEnvelope: true },
    { id: 'ULS2', name: '1,0·G + 1,5·W', type: 'ULS', factors: { G: 1, W: GAMMA_Q }, inEnvelope: true },
    { id: 'SLS1', name: '1,0·G + 1,0·S', type: 'SLS', factors: { G: 1, S: 1 }, inEnvelope: false },
  ];
  m.combinations = combos;
  return { model: m, points };
}

export function checkGirder(g: Girder, width: number, inp: TentInput): GirderResult {
  const { model, points } = girderModel(g, width, inp);
  const base: GirderResult = { key: g.key, product: g.product, L: g.L, supports: g.supports, width, points, eta: 0, model };
  const an = analyze(model);
  if (!an.ok) return { ...base, eta: Infinity };
  const la = analyzeLattice(an);
  if (!la) return base;
  const env = latticeEnvelope(
    an,
    la,
    model.combinations.filter((c) => c.type === 'ULS'),
    [],
    undefined,
  );
  const pick = (f: (d: MemberDesign, k: number) => boolean) =>
    env.members.reduce<MemberDesign | undefined>((a, d, k) => (f(d, k) && (!a || d.eta > a.eta) ? d : a), undefined);
  const role = (k: number) => la.model.members[k].role;
  const chord = pick((d, k) => (role(k) === 'top' || role(k) === 'bottom' || role(k) === 'post') && d.mode !== 'periBuckling');
  const buckling = pick((d) => d.mode === 'periBuckling');
  const diagonal = pick((_, k) => role(k) === 'diag');
  const bearing = env.bearings.reduce<BearingDesign | undefined>((a, b) => (!a || b.eta > a.eta ? b : a), undefined);
  const eta = Math.max(chord?.eta ?? 0, buckling?.eta ?? 0, diagonal?.eta ?? 0, bearing?.eta ?? 0, ...env.members.map((d) => d.eta));
  return { ...base, chord, buckling, diagonal, bearing, eta };
}

export interface TentResult {
  sizes: ReturnType<typeof tentSizes>;
  wind: WindResult;
  stability: StabilityResult;
  girders: GirderResult[];
  /** summary as in the PERI reports: η of each check */
  summary: { key: 'chord' | 'buckling' | 'diagonal' | 'coupler' | 'sliding' | 'overturning'; eta: number; girder?: string }[];
}

export function analyzeTent(girders: Girder[], inp: TentInput): TentResult {
  const sizes = tentSizes(inp.geo);
  const wind = tentWind(inp);
  const stability = tentStability(inp, wind);
  const widths = tributaryWidths(girders);
  const gr = girders.map((g, i) => checkGirder(g, widths[i], inp));
  const top = (f: (r: GirderResult) => number | undefined) => {
    let best: { eta: number; girder?: string } = { eta: 0 };
    for (const r of gr) {
      const e = f(r);
      if (e !== undefined && e > best.eta) best = { eta: e, girder: r.key };
    }
    return best;
  };
  const summary: TentResult['summary'] = [];
  if (gr.length) {
    summary.push({ key: 'chord', ...top((r) => r.chord?.eta) });
    summary.push({ key: 'buckling', ...top((r) => r.buckling?.eta) });
    summary.push({ key: 'diagonal', ...top((r) => r.diagonal?.eta) });
    summary.push({ key: 'coupler', ...top((r) => r.bearing?.eta) });
  }
  summary.push({ key: 'sliding', eta: stability.etaSliding });
  summary.push({ key: 'overturning', eta: stability.etaOverturning });
  return { sizes, wind, stability, girders: gr, summary };
}
