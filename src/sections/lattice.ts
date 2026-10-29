/**
 * PERI lattice girders (Gitterträger) as plane frameworks, like an RSTAB member model:
 *
 *  - ULA 50 HD / ULA 70 HD (aluminium EN AW-6082 T5/T6) and ULS 50 / ULS 70 (steel): chords and
 *    end posts Ø 48.3 × 4.0 (ULA) / Ø 48.3 × 3.2 S235JRH, min R_eH = 320 N/mm² (ULS), diagonals
 *    RR 40 × 20 × 3 (ULA) / RR 40 × 20 × 2 S235JRH (ULS). Drawings: DIBt Z-8.1-865, Anlage A,
 *    Seiten 45–48. Nodes of one chord every 1.00 m (system points, x = k·1 m), of the other chord in
 *    between; the two diagonals of a node meet the chord with a gap g (65 / 79 mm), end posts
 *    85 mm outside the system points, chords 125 mm beyond them. System lines as in the PERI DWG
 *    blocks "PERI_101656…101659_PartDisplayName_Line".
 *  - ULS Flex (S355): end elements ULS 50 Flex, intermediate elements ULS 100 / 125 / 150 Flex
 *    joined with the connector ULS Flex (Verbinder, Ø 48.3 × 3.2). Chords RR 60 × 30 × 3 S355J0H,
 *    verticals and diagonals RR 40 × 20 × 2 S355J2H, system height 500 mm. Drawings: DIBt
 *    Z-8.22-863, Anlage B, Seiten 154–158; system lines of the PERI DWG blocks
 *    "PERI_124781 / 124790 / 124795 / 124805 / 124806".
 *
 * Coordinates: x along the girder (0 = girder end), z upwards (0 = bottom chord axis), m.
 */
import type { LatticeConfig, PeriProductId } from '../core/types';

const MPa = 1e6;
const mm = 1e-3;

export type LatticeId = 'ULA50HD' | 'ULA70HD' | 'ULS50' | 'ULS70' | 'ULSFLEX';

export const LATTICE_IDS: LatticeId[] = ['ULA50HD', 'ULA70HD', 'ULS50', 'ULS70', 'ULSFLEX'];

export function isLattice(id: PeriProductId | string): id is LatticeId {
  return (LATTICE_IDS as string[]).includes(id);
}

/** Design material of a member (EN 1993-1-1 / EN 1999-1-1) */
export interface LatticeMaterial {
  name: string;
  kind: 'steel' | 'alu';
  E: number;
  G: number;
  rho: number;
  /** f_y (steel) / f_0 (aluminium), Pa */
  f0: number;
  fu: number;
  /** γ_M0 = γ_M1 (PERI: 1.1), γ_M2 (aluminium, fracture) */
  gM1: number;
  gM2: number;
  /** aluminium heat affected zone: ρ_o,haz, ρ_u,haz (EN 1999-1-1, Table 3.2b) */
  haz?: { rhoO: number; rhoU: number };
  /** flexural buckling curve: imperfection factor α and plateau λ̄_0 */
  alpha: number;
  lambda0: number;
}

const steel = (name: string, fy: number, fu: number): LatticeMaterial => ({
  name,
  kind: 'steel',
  E: 210000 * MPa,
  G: 81000 * MPa,
  rho: 7850,
  f0: fy * MPa,
  fu: fu * MPa,
  gM1: 1.1,
  gM2: 1.25,
  // hot-finished hollow sections: buckling curve a
  alpha: 0.21,
  lambda0: 0.2,
});

export const LATTICE_MATERIALS = {
  // S235JRH with min R_eH = 320 N/mm² (chords / posts of ULS, tube of the connector ULS Flex)
  S235_320: steel('S235JRH (R_eH ≥ 320)', 320, 360),
  S235: steel('S235JRH', 235, 360),
  S355: steel('S355J0H / S355J2H', 355, 470),
  // EN AW-6082 T5 (alternatively T6; T5 has the lower strength): f_0 = 230, f_u = 270, f_o,haz = 125, f_u,haz = 185,
  // buckling class A (α = 0.20, λ̄_0 = 0.10), γ_M1 = 1.1, γ_M2 = 1.25
  AW6082: {
    name: 'EN AW-6082 T5',
    kind: 'alu',
    E: 70000 * MPa,
    G: 27000 * MPa,
    rho: 2700,
    f0: 230 * MPa,
    fu: 270 * MPa,
    gM1: 1.1,
    gM2: 1.25,
    haz: { rhoO: 125 / 230, rhoU: 185 / 270 },
    alpha: 0.2,
    lambda0: 0.1,
  } satisfies LatticeMaterial,
};

/** Member cross-section (SI). In-plane bending about y, out-of-plane about z. */
export interface MemberSection {
  name: string;
  A: number;
  /** in-plane / out-of-plane second moments of area */
  Iy: number;
  Iz: number;
  Wel: number;
  Wpl: number;
  /** shear area for in-plane shear */
  Av: number;
  /** web share a_w = (A − 2·b·t)/A for the N–M interaction of RHS (0 for CHS) */
  aw: number;
  tube: boolean;
  mat: LatticeMaterial;
}

export function chs(D: number, t: number, mat: LatticeMaterial): MemberSection {
  const d = D - 2 * t;
  const A = (Math.PI / 4) * (D * D - d * d) * mm * mm;
  const I = (Math.PI / 64) * (D ** 4 - d ** 4) * mm ** 4;
  return {
    name: `Ø ${fmtMm(D)} × ${fmtMm(t)}`,
    A,
    Iy: I,
    Iz: I,
    Wel: I / ((D / 2) * mm),
    Wpl: ((D ** 3 - d ** 3) / 6) * mm ** 3,
    Av: (2 * A) / Math.PI,
    aw: 0,
    tube: true,
    mat,
  };
}

/** Rectangular hollow section h × b × t (h in the plane of the girder) */
export function rhs(h: number, b: number, t: number, mat: LatticeMaterial): MemberSection {
  const hi = h - 2 * t;
  const bi = b - 2 * t;
  const A = (h * b - hi * bi) * mm * mm;
  const Iy = ((b * h ** 3 - bi * hi ** 3) / 12) * mm ** 4;
  const Iz = ((h * b ** 3 - hi * bi ** 3) / 12) * mm ** 4;
  return {
    name: `RR ${fmtMm(h)} × ${fmtMm(b)} × ${fmtMm(t)}`,
    A,
    Iy,
    Iz,
    Wel: Iy / ((h / 2) * mm),
    Wpl: ((b * h * h - bi * hi * hi) / 4) * mm ** 3,
    Av: (A * h) / (b + h),
    aw: Math.min(0.5, (A - 2 * b * t * mm * mm) / A),
    tube: false,
    mat,
  };
}

function fmtMm(v: number): string {
  return String(v).replace('.', ',');
}

export type MemberRole = 'top' | 'bottom' | 'diag' | 'post' | 'vert' | 'conn';

export interface LatticeNode {
  x: number;
  z: number;
  /** chord: 0 bottom, 1 top, -1 other */
  chord: 0 | 1 | -1;
}

export interface LatticeMember {
  i: number;
  j: number;
  role: MemberRole;
  sec: MemberSection;
  /** pinned at both ends (truss member, axial force only) */
  hinged: boolean;
}

/** Brace point of a chord (for the in-plane buckling length) */
export interface LatticeModel {
  id: LatticeId;
  name: string;
  h: number;
  L: number;
  nodes: LatticeNode[];
  members: LatticeMember[];
  /** x of the connection points of web members per chord (bottom, top), sorted */
  braces: [number[], number[]];
  /** x of lateral restraints of the chords (bottom, top), sorted */
  restraints: [number[], number[]];
  /** welded web members (aluminium: heat affected zone at the chord nodes) */
  welded: boolean;
  /** self weight, kg/m (incl. connectors / heads) */
  mass: number;
  /** support type of the chords: tube couplers (ULA / ULS) or ledger heads UH Plus (ULS Flex) */
  bearing: 'coupler' | 'head';
}

/** Type data of a lattice girder */
export interface LatticeType {
  id: LatticeId;
  name: string;
  /** system height (chord axes), m */
  h: number;
  chord: MemberSection;
  web: MemberSection;
  post: MemberSection;
  /** gap of the two diagonals at a node, m */
  gap: number;
  /** girder length − system length, m (2 × 125 mm overhang beyond the system points) */
  overhang: number;
  /** end post: distance outside the system point, m */
  postOut: number;
  /** catalogue: overall length l → weight, kg */
  weights: [number, number][];
  welded: boolean;
}

const ALU = LATTICE_MATERIALS.AW6082;
const S320 = LATTICE_MATERIALS.S235_320;

export const LATTICE_TYPES: Record<Exclude<LatticeId, 'ULSFLEX'>, LatticeType> = {
  ULA50HD: {
    id: 'ULA50HD',
    name: 'ULA 50 HD',
    h: 0.5,
    chord: chs(48.3, 4, ALU),
    web: rhs(40, 20, 3, ALU),
    post: chs(48.3, 4, ALU),
    gap: 0.06536,
    overhang: 0.125,
    postOut: 0.085,
    weights: [
      [4.25, 18.4],
      [5.25, 22.5],
      [6.25, 26.5],
    ],
    welded: true,
  },
  ULA70HD: {
    id: 'ULA70HD',
    name: 'ULA 70 HD',
    h: 0.7,
    chord: chs(48.3, 4, ALU),
    web: rhs(40, 20, 3, ALU),
    post: chs(48.3, 4, ALU),
    gap: 0.07824,
    overhang: 0.125,
    postOut: 0.085,
    weights: [[8.25, 37.4]],
    welded: true,
  },
  ULS50: {
    id: 'ULS50',
    name: 'ULS 50',
    h: 0.5,
    chord: chs(48.3, 3.2, S320),
    web: rhs(40, 20, 2, LATTICE_MATERIALS.S235),
    post: chs(48.3, 3.2, S320),
    gap: 0.065,
    overhang: 0.125,
    postOut: 0.085,
    weights: [
      [4.25, 41.7],
      [5.25, 50.9],
      [6.25, 60.2],
    ],
    welded: true,
  },
  ULS70: {
    id: 'ULS70',
    name: 'ULS 70',
    h: 0.7,
    chord: chs(48.3, 3.2, S320),
    web: rhs(40, 20, 2, LATTICE_MATERIALS.S235),
    post: chs(48.3, 3.2, S320),
    gap: 0.079,
    overhang: 0.125,
    postOut: 0.085,
    weights: [
      [5.25, 54.8],
      [6.25, 64.5],
      [8.25, 83.6],
    ],
    welded: true,
  },
};

/** ULS Flex: chord RR 60 × 30 × 3, web members RR 40 × 20 × 2, connector Ø 48.3 × 3.2 */
export const FLEX = {
  h: 0.5,
  chord: rhs(60, 30, 3, LATTICE_MATERIALS.S355),
  web: rhs(40, 20, 2, LATTICE_MATERIALS.S355),
  conn: chs(48.3, 3.2, S320),
  /** system lengths of the intermediate elements, m */
  elements: [1, 1.25, 1.5],
  /** weights, kg: end element, connector, intermediate elements 100 / 125 / 150 */
  weightEnd: 6.48,
  weightConn: 5.99,
  weightElem: { 1: 10.5, 1.25: 12.7, 1.5: 15.4 } as Record<number, number>,
  /** end element: system length (standard axis → connector axis) */
  endLength: 0.5,
};

/**
 * Web members of the ULS Flex elements, relative to the left system point (axis of the standard or
 * connector) of the element: verticals (x) and diagonals ([x top, x bottom]).
 */
const FLEX_WEB: Record<string, { verts: number[]; diags: [number, number][] }> = {
  end: { verts: [0.125, 0.375], diags: [[0.177, 0.3229]] },
  '1': {
    verts: [0.125, 0.875],
    diags: [
      [0.4592, 0.1708],
      [0.5408, 0.8292],
    ],
  },
  '1.25': {
    verts: [0.125, 1.125],
    diags: [
      [0.5804, 0.1661],
      [0.6696, 1.0839],
    ],
  },
  '1.5': {
    verts: [0.125, 1.375],
    diags: [
      [0.1708, 0.4592],
      [0.8257, 0.5373],
      [0.9197, 1.3339],
    ],
  },
};

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

/**
 * ULS Flex elements from the section definition; default for a length L: the elements whose sum is
 * L − 2·0.50 m with the smallest largest element (highest M_Rd, PERI Tabellenbuch S. 55–57), then
 * the fewest elements.
 */
export function flexElements(cfg: LatticeConfig | undefined, L: number): number[] {
  if (cfg?.flex?.length) return cfg.flex.filter((e) => FLEX.elements.includes(e));
  return defaultFlexElements(L);
}

export function defaultFlexElements(L: number): number[] {
  // in quarter metres: rest = 4a + 5b + 6c
  const q = Math.round((L - 2 * FLEX.endLength) * 4);
  let best: number[] | null = null;
  const score = (e: number[]) => [Math.max(...e), e.length];
  for (let c = 0; 6 * c <= q; c++)
    for (let b = 0; 6 * c + 5 * b <= q; b++) {
      const r = q - 6 * c - 5 * b;
      if (r % 4) continue;
      const e = [...Array(r / 4).fill(1), ...Array(b).fill(1.25), ...Array(c).fill(1.5)];
      if (!e.length) continue;
      if (!best) best = e;
      else {
        const [m1, n1] = score(e);
        const [m0, n0] = score(best);
        if (m1 < m0 || (m1 === m0 && n1 < n0)) best = e;
      }
    }
  return best ?? [];
}

/** System length of a ULS Flex girder (standard to standard) */
export function flexLength(elements: number[]): number {
  return r6(2 * FLEX.endLength + elements.reduce((a, b) => a + b, 0));
}

/** Overall length → system length (ULA / ULS) */
export function systemLength(id: Exclude<LatticeId, 'ULSFLEX'>, L: number): number {
  return r6(L - 2 * LATTICE_TYPES[id].overhang);
}

/** Mass per metre for the equivalent beam, kg/m */
export function latticeMass(id: LatticeId, L: number, cfg?: LatticeConfig): number {
  if (id === 'ULSFLEX') {
    const el = flexElements(cfg, L);
    const kg = 2 * FLEX.weightEnd + (el.length + 1) * FLEX.weightConn + el.reduce((a, e) => a + (FLEX.weightElem[e] ?? 10 * e), 0);
    return kg / Math.max(L, 1e-6);
  }
  const t = LATTICE_TYPES[id];
  const near = t.weights.reduce((a, b) => (Math.abs(b[0] - L) < Math.abs(a[0] - L) ? b : a));
  return near[1] / near[0];
}

/** Default lateral restraint spacing of the top chord, m */
export const DEFAULT_RESTRAINT = 1;

interface Builder {
  nodes: LatticeNode[];
  members: LatticeMember[];
  /** node index by chord and x */
  at(chord: 0 | 1, x: number): number;
}

function builder(h: number, chordX: [number[], number[]]): Builder {
  const nodes: LatticeNode[] = [];
  const idx: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  // nodes sorted by x (both chords interleaved: small bandwidth)
  const all: { x: number; c: 0 | 1 }[] = [];
  for (const c of [0, 1] as const) for (const x of new Set(chordX[c].map(r6))) all.push({ x, c });
  all.sort((a, b) => a.x - b.x || a.c - b.c);
  for (const p of all) {
    idx[p.c].set(p.x, nodes.length);
    nodes.push({ x: p.x, z: p.c === 1 ? h : 0, chord: p.c });
  }
  return {
    nodes,
    members: [],
    at(chord, x) {
      const i = idx[chord].get(r6(x));
      if (i === undefined) throw new Error(`lattice: no node at ${x} (chord ${chord})`);
      return i;
    },
  };
}

/** chord members between all consecutive nodes of a chord */
function addChords(b: Builder, sec: MemberSection) {
  for (const c of [0, 1] as const) {
    const ids = b.nodes.map((n, i) => ({ n, i })).filter((p) => p.n.chord === c);
    for (let k = 1; k < ids.length; k++) b.members.push({ i: ids[k - 1].i, j: ids[k].i, role: c === 1 ? 'top' : 'bottom', sec, hinged: false });
  }
}

/**
 * Member model of a girder of overall length L. `extra` are additional chord points (supports,
 * loads) that must be nodes on both chords.
 */
export function latticeModel(id: LatticeId, L: number, cfg: LatticeConfig | undefined, extra: number[] = []): LatticeModel {
  const ex = extra.filter((x) => x > -1e-9 && x < L + 1e-9).map((x) => Math.min(Math.max(x, 0), L));
  if (id === 'ULSFLEX') return flexModel(L, cfg, ex);
  const t = LATTICE_TYPES[id];
  const Ls = Math.round(systemLength(id, L));
  const o = t.overhang;
  const g = cfg?.eccentric ? t.gap / 2 : 0;
  // web points: node k at s = k/2 on the top chord (k even) or the bottom chord (k odd)
  const diags: [number, number, number, number][] = [];
  for (let k = 0; k < 2 * Ls; k++) {
    const s0 = k / 2 + g;
    const s1 = (k + 1) / 2 - g;
    const c0 = k % 2 === 0 ? 1 : 0;
    diags.push([c0, o + s0, 1 - c0, o + s1]);
  }
  const posts = [o - t.postOut, o + Ls + t.postOut];
  const chordX: [number[], number[]] = [
    [0, L, ...posts, ...ex],
    [0, L, ...posts, ...ex],
  ];
  for (const d of diags) {
    chordX[d[0]].push(d[1]);
    chordX[d[2]].push(d[3]);
  }
  const b = builder(t.h, chordX);
  addChords(b, t.chord);
  for (const x of posts) b.members.push({ i: b.at(0, x), j: b.at(1, x), role: 'post', sec: t.post, hinged: false });
  for (const d of diags) b.members.push({ i: b.at(d[0] as 0 | 1, d[1]), j: b.at(d[2] as 0 | 1, d[3]), role: 'diag', sec: t.web, hinged: true });
  const webX = (c: 0 | 1) => [...new Set(diags.flatMap((d) => [d[0] === c ? d[1] : NaN, d[2] === c ? d[3] : NaN]).filter((x) => !Number.isNaN(x)).concat(posts).map(r6))].sort((p, q) => p - q);
  // lateral restraints of the top chord: every a from both system points (PERI: a1, a2, … symmetric)
  const a = cfg?.restraint && cfg.restraint > 0 ? cfg.restraint : DEFAULT_RESTRAINT;
  const top: number[] = [o, o + Ls];
  for (let s = a; s < Ls / 2 + 1e-9; s += a) top.push(o + s, o + Ls - s);
  return {
    id,
    name: t.name,
    h: t.h,
    L,
    nodes: b.nodes,
    members: b.members,
    braces: [webX(0), webX(1)],
    restraints: [[o, o + Ls].map(r6), [...new Set(top.map(r6))].sort((p, q) => p - q)],
    welded: t.welded,
    mass: latticeMass(id, L, cfg),
    bearing: 'coupler',
  };
}

function flexModel(L: number, cfg: LatticeConfig | undefined, ex: number[]): LatticeModel {
  const elements = flexElements(cfg, L);
  const Ls = flexLength(elements);
  // system points: standards at 0 and Ls (= L), connectors between the elements
  const conns: number[] = [FLEX.endLength];
  for (const e of elements) conns.push(r6(conns[conns.length - 1] + e));
  const verts: number[] = [];
  const diags: [number, number][] = [];
  const add = (s0: number, key: string, mirror = false) => {
    const w = FLEX_WEB[key];
    for (const v of w.verts) verts.push(r6(mirror ? s0 - v : s0 + v));
    for (const [xt, xb] of w.diags) diags.push(mirror ? [r6(s0 - xt), r6(s0 - xb)] : [r6(s0 + xt), r6(s0 + xb)]);
  };
  add(0, 'end');
  elements.forEach((e, k) => add(conns[k], String(e)));
  add(Ls, 'end', true);
  const chordX: [number[], number[]] = [
    [0, Ls, ...conns, ...verts, ...ex],
    [0, Ls, ...conns, ...verts, ...ex],
  ];
  for (const [xt, xb] of diags) {
    chordX[1].push(xt);
    chordX[0].push(xb);
  }
  const b = builder(FLEX.h, chordX);
  addChords(b, FLEX.chord);
  for (const x of verts) b.members.push({ i: b.at(0, x), j: b.at(1, x), role: 'vert', sec: FLEX.web, hinged: true });
  for (const x of conns) b.members.push({ i: b.at(0, x), j: b.at(1, x), role: 'conn', sec: FLEX.conn, hinged: true });
  for (const [xt, xb] of diags) b.members.push({ i: b.at(1, xt), j: b.at(0, xb), role: 'diag', sec: FLEX.web, hinged: true });
  const webX = (c: 0 | 1) => [...new Set([...verts, ...conns, ...diags.map((d) => (c === 1 ? d[0] : d[1]))])].sort((p, q) => p - q);
  // lateral restraints: standards and connectors (horizontal bracing with UH Plus ledgers)
  const lat = [0, Ls, ...conns].sort((p, q) => p - q);
  return {
    id: 'ULSFLEX',
    name: `ULS Flex (50 + ${elements.map((e) => Math.round(e * 100)).join(' + ')} + 50)`,
    h: FLEX.h,
    L,
    nodes: b.nodes,
    members: b.members,
    braces: [webX(0), webX(1)],
    restraints: [lat, lat],
    welded: true,
    mass: latticeMass('ULSFLEX', L, { flex: elements }),
    bearing: 'head',
  };
}

/** Equivalent beam (chords only): A = 2·A_c, I = 2·A_c·(h/2)², SI */
export function latticeEquivalent(id: LatticeId): { A: number; I: number; h: number; b: number } {
  const t = id === 'ULSFLEX' ? { chord: FLEX.chord, h: FLEX.h } : LATTICE_TYPES[id];
  const Ac = t.chord.A;
  return { A: 2 * Ac, I: 2 * Ac * (t.h / 2) ** 2 + 2 * t.chord.Iy, h: t.h + 0.0483, b: 0.0483 };
}
