/**
 * Parts of PERI UP for the 2D designer (side view): article, name and weight from the parts list,
 * the system geometry as the PERI CAD part library draws it (the same lines and rosettes the DXF import
 * reads) and the dimensions the parts snap by.
 *
 * Coordinates of the side view: x horizontal, z up (m); every part lies in the plane y = 0.
 */
import type { PartGeom, V3 } from '../scaffold/pericad';
import { findPart } from '../scaffold/weights';

export type DesignKind = 'jack' | 'base' | 'standard' | 'ledger' | 'bracket' | 'diagonal' | 'tube' | 'spigot';

export const DESIGN_KINDS: DesignKind[] = ['standard', 'base', 'jack', 'ledger', 'bracket', 'diagonal', 'tube', 'spigot'];

export interface CatalogPart {
  /** article number of PERI */
  article: string;
  /** short name, e.g. "UVR-2 200" */
  name: string;
  /** catalogue name, e.g. "Vertikalstiel UVR-2 200" */
  desc: string;
  kind: DesignKind;
  kg?: number;
  /** standards: system length (bottom to the bottom of the next one); ledgers: axis to axis; brackets:
   * from the standard axis to the spigot; diagonals: bay width; jacks: spindle length; tubes: length */
  L: number;
  /** diagonals: height of the bay */
  H?: number;
  /** jacks: largest extension (base plate to the bottom of the standard), m */
  ext?: number;
  /** standards: heights of the rosettes above the bottom */
  rosettes?: number[];
  /** standards: a spigot on the top (another standard stands on it) */
  spigot?: boolean;
  /** brackets: a spigot at the end for a standard */
  bracketSpigot?: boolean;
  /** series (FAMILIES), e.g. "UVR", "UH-2" */
  family: string;
}

/** first rosette above the bottom of a vertical standard; rosettes every 0.5 m */
const UVR_FIRST = 0.38;
/** spigot of a standard: the next one stands this far below the top of the line */
export const SPIGOT = 0.16;
/** base standard UVB 24: height and its rosette */
export const UVB_H = 0.24;
export const UVB_ROS = 0.12;
/** ledger and diagonal heads: distance of the part from the standard axis */
const LEDGER_HEAD = 0.042;
const UBK_HEAD = 0.083;
/** a standard on a spigot (bracket, ledger spigot): its bottom above the rosette / the ledger */
export const ON_SPIGOT = 0.12;

const rosAt = (L: number) => {
  const out: number[] = [];
  for (let z = UVR_FIRST; z < L - 0.05; z += 0.5) out.push(Math.round(z * 1000) / 1000);
  return out;
};

const part = (article: string, name: string, kind: DesignKind, L: number, family: string, o: Partial<CatalogPart> = {}): CatalogPart => {
  const db = findPart(article, name);
  return { article, name, desc: db?.name ?? name, kind, kg: db?.kg, L, family, ...o };
};

/**
 * Series of the catalogue; `gen`: generation of PERI UP (2: the "-2" parts with the 8 mm rosette and
 * the newer ledgers). By default the designer shows the first generation (and the parts without one).
 */
export const FAMILIES: { id: string; kind: DesignKind; gen?: 1 | 2 }[] = [
  { id: 'UVR', kind: 'standard', gen: 1 },
  { id: 'UVH', kind: 'standard', gen: 1 },
  { id: 'UVR-2', kind: 'standard', gen: 2 },
  { id: 'UVH-2', kind: 'standard', gen: 2 },
  { id: 'UVB', kind: 'base' },
  { id: 'UJB', kind: 'jack' },
  { id: 'UH', kind: 'ledger', gen: 1 },
  { id: 'UHV', kind: 'ledger', gen: 1 },
  { id: 'UH-2', kind: 'ledger', gen: 2 },
  { id: 'UHV-2', kind: 'ledger', gen: 2 },
  { id: 'UCM', kind: 'bracket' },
  { id: 'UBK', kind: 'diagonal', gen: 1 },
  { id: 'UBK-2', kind: 'diagonal', gen: 2 },
  { id: 'tube', kind: 'tube' },
  { id: 'spigot', kind: 'spigot' },
];
export const DEFAULT_FAMILIES = FAMILIES.filter((f) => f.gen !== 2).map((f) => f.id);

const std = (rows: [string, number][], prefix: string, spigot: boolean) =>
  rows.map(([a, cm]) => part(a, `${prefix} ${cm}`, 'standard', cm / 100, prefix, { rosettes: rosAt(cm / 100), spigot }));
const ledgers = (rows: [string, number][], fmt: (cm: number) => string, family: string) => rows.map(([a, cm]) => part(a, fmt(cm), 'ledger', cm / 100, family));
const ubk = (rows: [string, number, number][], prefix: string) => rows.map(([a, b, h]) => part(a, `${prefix} ${b}/${h}`, 'diagonal', b / 100, prefix, { H: h / 100 }));

/** the catalogue of the designer */
export const CATALOG: CatalogPart[] = [
  // standards: first generation UVR / UVH, second generation UVR-2 / UVH-2 (rosette 8 mm)
  ...std(
    [
      ['102859', 50],
      ['101306', 100],
      ['102860', 150],
      ['100009', 200],
      ['100012', 300],
      ['400013', 400],
    ],
    'UVR',
    true,
  ),
  ...std(
    [
      ['101309', 50],
      ['100000', 100],
      ['117195', 125],
      ['100003', 150],
      ['100005', 200],
      ['100007', 250],
    ],
    'UVH',
    false,
  ),
  ...std(
    [
      ['132219', 50],
      ['132224', 100],
      ['132229', 150],
      ['132234', 200],
      ['132239', 300],
    ],
    'UVR-2',
    true,
  ),
  ...std(
    [
      ['132123', 50],
      ['132194', 100],
      ['132196', 125],
      ['132198', 150],
      ['132200', 200],
      ['132202', 250],
    ],
    'UVH-2',
    false,
  ),
  part('100014', 'UVB 24', 'base', UVB_H, 'UVB', { rosettes: [UVB_ROS], spigot: true }),
  // base jacks: spindle length, largest extension
  part('100411', 'UJB 38-50/30', 'jack', 0.505, 'UJB', { ext: 0.3 }),
  part('100242', 'UJB 38-80/55', 'jack', 0.8, 'UJB', { ext: 0.55 }),
  // ledgers: UH Plus and the reinforced UHV Plus; second generation UH-2 / UHV-2
  ...ledgers(
    [
      ['114613', 25],
      ['114595', 50],
      ['114629', 75],
      ['114632', 100],
      ['114638', 125],
      ['114641', 150],
      ['117032', 175],
      ['114645', 200],
      ['116356', 225],
      ['114648', 250],
      ['114651', 300],
    ],
    (cm) => `UH ${cm} Plus`,
    'UH',
  ),
  ...ledgers(
    [
      ['114681', 150],
      ['114687', 200],
      ['114691', 250],
      ['114695', 300],
    ],
    (cm) => `UHV ${cm} Plus`,
    'UHV',
  ),
  ...ledgers(
    [
      ['131995', 25],
      ['131998', 50],
      ['132213', 75],
      ['132004', 100],
      ['132007', 125],
      ['132010', 150],
      ['132013', 175],
      ['132016', 200],
      ['132019', 225],
      ['132025', 250],
      ['132022', 300],
    ],
    (cm) => `UH-2 ${cm}`,
    'UH-2',
  ),
  ...ledgers(
    [
      ['137020', 150],
      ['137025', 200],
      ['137030', 250],
      ['137035', 300],
    ],
    (cm) => `UHV-2 ${cm}`,
    'UHV-2',
  ),
  // brackets with a spigot for a standard; UCB 25 without
  part('412676', 'UCM 50 mit Zapfen', 'bracket', 0.5, 'UCM', { bracketSpigot: true }),
  part('412678', 'UCM 75 mit Zapfen', 'bracket', 0.75, 'UCM', { bracketSpigot: true }),
  part('134005', 'UCB 25', 'bracket', 0.25, 'UCM', { bracketSpigot: false }),
  // node diagonals bay / height: UBK and UBK-2
  ...ubk(
    [
      ['424170', 75, 200],
      ['412926', 100, 200],
      ['415354', 125, 100],
      ['412765', 125, 200],
      ['400981', 150, 100],
      ['400973', 150, 150],
      ['400572', 150, 200],
      ['400985', 200, 100],
      ['406630', 200, 150],
      ['400573', 200, 200],
      ['400989', 250, 100],
      ['406624', 250, 150],
      ['400574', 250, 200],
      ['400993', 300, 100],
      ['400575', 300, 200],
    ],
    'UBK',
  ),
  ...ubk(
    [
      ['133418', 75, 200],
      ['133421', 100, 200],
      ['133424', 125, 100],
      ['133427', 125, 200],
      ['133430', 150, 100],
      ['133433', 150, 150],
      ['133436', 150, 200],
      ['133439', 200, 100],
      ['133442', 200, 150],
      ['133445', 200, 200],
      ['133448', 250, 100],
      ['133451', 250, 150],
      ['133454', 250, 200],
      ['133457', 300, 100],
      ['133460', 300, 150],
      ['133463', 300, 200],
    ],
    'UBK-2',
  ),
  // scaffold tubes on couplers RA 48/48 (any length between two standards)
  part('026415', 'Gerüstrohr Ø 48,3', 'tube', 0, 'tube'),
  // spigots on a ledger: a standard stands on the ledger
  part('130681', 'UH-Zapfen-2', 'spigot', 0, 'spigot'),
  part('130684', 'UHA-2 Halb m. Zapfen', 'spigot', 0, 'spigot'),
];

export const byArticle = new Map(CATALOG.map((p) => [p.article, p]));

/** coupler RA 48/48 at each end of a tube */
export const COUPLER = { article: '017020', name: 'RA 48/48', desc: 'Normalkupplung RA 48/48' };
/** tubes of the catalogue by length (else the article of a special length) */
const TUBES: Record<number, string> = { 1: '026411', 2: '026412', 3: '026413', 4: '026414', 5: '026419', 6: '026418' };
export function tubeArticle(L: number): { article: string; name: string } {
  const n = Math.round(L);
  if (Math.abs(L - n) < 0.01 && TUBES[n]) return { article: TUBES[n], name: `Gerüstrohr Stahl Ø 48,3 x 3,2, L = ${n},0 m` };
  return { article: '026415', name: 'Gerüstrohr Stahl Ø 48,3 x 3,2, Sonderlänge' };
}

/**
 * System geometry of a part in its own coordinates, as the PERI CAD part library draws it (the same
 * geometry the DXF import reads): lines and rosettes; L for tubes of a special length.
 */
export function partGeom(p: CatalogPart, L = p.L): PartGeom {
  const v = (x: number, y: number, z: number): V3 => [x, y, z];
  switch (p.kind) {
    case 'standard':
      return { lines: [[v(0.08, 0.08, 0), v(0.08, 0.08, L + (p.spigot ? SPIGOT : 0))]], rosettes: (p.rosettes ?? []).map((z) => v(0.08, 0.08, z)) };
    case 'base':
      return { lines: [[v(0.08, 0.08, UVB_H), v(0.08, 0.08, 0)]], rosettes: [v(0.08, 0.08, UVB_ROS)] };
    case 'jack':
      return {
        lines: [
          [v(0, 0, 0), v(0.15, 0, 0)],
          [v(0.15, 0, 0), v(0.15, 0.15, 0)],
          [v(0.15, 0.15, 0), v(0, 0.15, 0)],
          [v(0, 0.15, 0), v(0, 0, 0)],
          [v(0.075, 0.075, 0), v(0.075, 0.075, L)],
        ],
        rosettes: [],
      };
    case 'ledger': {
      const l = L - 2 * LEDGER_HEAD;
      return {
        lines: [
          [v(0, 0.015, 0.03), v(l, 0.015, 0.03)],
          [v(0, 0.015, 0.03), v(0, 0.015, -0.06)],
          [v(l, 0.015, 0.03), v(l, 0.015, -0.06)],
        ],
        rosettes: [],
      };
    }
    case 'bracket': {
      const k = L / 0.5;
      const lines: [V3, V3][] = [
        [v(0, 0.015, 0.06), v(L, 0.015, 0.06)],
        [v(0, 0.015, 0), v(0, 0.015, 0.06)],
        [v(0.706 * L, 0.015, 0.06), v(0, 0.015, -0.368 * Math.min(k, 1.2))],
        [v(0.25 * L, 0.015, -0.217 * Math.min(k, 1.2)), v(0.25 * L, 0.015, 0.06)],
      ];
      if (p.bracketSpigot) lines.push([v(L, 0.015, -0.065), v(L, 0.015, ON_SPIGOT)]);
      return { lines, rosettes: [] };
    }
    case 'diagonal':
      return { lines: [[v(0, 0.05, 0), v(L - 2 * UBK_HEAD, 0.05, p.H ?? 2)]], rosettes: [] };
    case 'tube':
      return { lines: [[v(0, 0, 0), v(L, 0, 0)]], rosettes: [] };
    case 'spigot':
      return { lines: [[v(0, 0, 0.03), v(0, 0, ON_SPIGOT)]], rosettes: [] };
  }
}

export const HEAD = { ledger: LEDGER_HEAD, ubk: UBK_HEAD };
