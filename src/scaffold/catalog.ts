/**
 * Part kinds of the PERI UP scaffold system, recognised from the article number and the name that
 * PERI CAD writes into the drawing.
 */
import type { LatticeId } from '../sections/lattice';
import { findPart } from './weights';

export type PartKind =
  | 'standard'
  | 'base'
  | 'ledger'
  | 'deck'
  | 'diagonal'
  | 'bracket'
  | 'jack'
  | 'flexEnd'
  | 'flexElement'
  | 'flexConnector'
  | 'girder'
  | 'beam'
  | 'tube'
  | 'anchor'
  | 'coupler'
  | 'clamp'
  | 'toeboard'
  | 'stair'
  | 'guard'
  | 'accessory'
  | 'other';

export const PART_KINDS: PartKind[] = [
  'standard',
  'base',
  'ledger',
  'deck',
  'diagonal',
  'bracket',
  'jack',
  'flexEnd',
  'flexElement',
  'flexConnector',
  'girder',
  'beam',
  'tube',
  'anchor',
  'coupler',
  'clamp',
  'toeboard',
  'stair',
  'guard',
  'accessory',
  'other',
];

export interface PartClass {
  kind: PartKind;
  /** ULS Flex intermediate element: system length, m */
  flexLength?: number;
  /** lattice girder in one piece (ULA / ULS) */
  girder?: Exclude<LatticeId, 'ULSFLEX'>;
}

/** articles of the drawings seen so far (name rules below cover the rest) */
const ARTICLES: Record<string, PartClass> = {
  '100009': { kind: 'standard' },
  '100014': { kind: 'base' },
  '114645': { kind: 'ledger' },
  '124109': { kind: 'deck' },
  '124805': { kind: 'flexEnd' },
  '124806': { kind: 'flexConnector' },
  '124781': { kind: 'flexElement', flexLength: 1.5 },
};

export function classifyPart(article: string, name: string, desc = ''): PartClass {
  // the catalogue name from the parts database helps where the drawing has a short name only ("UAH")
  const text = `${name} ${desc} ${findPart(article, name, desc)?.name ?? ''}`;
  const flex = /flex/i.test(text);
  if (flex && /zwischenelement|intermediate/i.test(text)) {
    const n = Number(/ULS\s*(\d{3})\s*flex/i.exec(text)?.[1]);
    const L = n === 100 || n === 125 || n === 150 ? n / 100 : ARTICLES[article]?.flexLength;
    return { kind: 'flexElement', flexLength: L };
  }
  if (flex && /endelement|end element/i.test(text)) return { kind: 'flexEnd' };
  if (flex && /verbinder|connector/i.test(text)) return { kind: 'flexConnector' };
  if (ARTICLES[article]) return ARTICLES[article];
  const g = /\bUL([AS])\s*(50|70)\b/i.exec(text);
  if (g && !flex) return { kind: 'girder', girder: g[1].toUpperCase() === 'A' ? (g[2] === '50' ? 'ULA50HD' : 'ULA70HD') : g[2] === '50' ? 'ULS50' : 'ULS70' };
  if (/treppe|leiter|durchstieg|podest|\bUAS\b|\bUA[ACFILW]\b/i.test(text) && !/geländer|belag|tafel/i.test(text)) return { kind: 'stair' };
  if (/geländer|holm\b|rückenschutz|schutzwand|sicherheitstür|\bUP[AGSK]\b|\bUA[GH]\b/i.test(text)) return { kind: 'guard' };
  if (/\b(SRU|RCS)\b|stahlriegel|kletterschiene|multiträger|\b(HEB|HEA|IPE|UPE|GT ?24|VT ?20)\b/i.test(text) && !/spindelkopf/i.test(text)) return { kind: 'beam' };
  if (/klemmrosette|rohrverbinder|verbinder ULT|\bULT\b|schr(aube)?\b|mutter|bolzen|stecker|\bM ?\d+ ?x ?\d+|polyschutz|keder|dübel|ringschraube|spindelkopf|spindelsicherung|distanzhalter|richtstütz|traverse/i.test(text))
    return { kind: 'accessory' };
  if (/gerüsthalter/i.test(text)) return { kind: 'tube' };
  if (/fußplatte|fussplatte|spindelunterlage|lenkrolle|lastrolle/i.test(text)) return { kind: 'jack' };
  if (/trägerklammer|traegerklammer|beam ?clamp/i.test(text)) return { kind: 'clamp' };
  if (/kupplung|coupler|\bR[ARS] ?\d+\/\d+|\bSW ?48|\bUE[CF]\b/i.test(text)) return { kind: 'coupler' };
  if (/gerüstrohr|geruestrohr|\btube\b/i.test(text)) return { kind: 'tube' };
  if (/bordblech|bordbrett|toe ?board|\bUPY\b/i.test(text)) return { kind: 'toeboard' };
  if (/\bUVB\b|basisstiel|starter/i.test(text)) return { kind: 'base' };
  if (/\bUVR\b|\bUVH\b|vertikalstiel|kopfstiel|standard/i.test(text)) return { kind: 'standard' };
  if (/\bUB[LKHS]\b|diagonal/i.test(text)) return { kind: 'diagonal' };
  if (/konsole|\bUC[BM]\b|bracket/i.test(text)) return { kind: 'bracket' };
  if (/zapfen|riegelaufnahme|\bUHA\b|passbolzen|federstecker|kreuzverbinder|eckblech|abdeckblech|\bUD[BC]\b|\bUC ?\d/i.test(text)) return { kind: 'accessory' };
  if (/\bUH\b|\bUHV\b|riegel|ledger|transom/i.test(text)) return { kind: 'ledger' };
  if (/\bUD[AGI]\b|\bUDS\b|belag|tafel|deck/i.test(text)) return { kind: 'deck' };
  if (/spindel|\bUJ[A-Z]{0,2}\b|jack/i.test(text)) return { kind: 'jack' };
  return { kind: 'other' };
}

/** display colours of the part kinds (3D view, legend) */
export const KIND_COLOR: Record<PartKind, string> = {
  standard: '#334155',
  base: '#475569',
  ledger: '#2563eb',
  deck: '#a8a29e',
  diagonal: '#7c3aed',
  bracket: '#be185d',
  jack: '#64748b',
  flexEnd: '#0d9488',
  flexElement: '#0d9488',
  flexConnector: '#f97316',
  girder: '#0d9488',
  beam: '#b45309',
  tube: '#a16207',
  anchor: '#e11d48',
  coupler: '#ca8a04',
  clamp: '#dc2626',
  toeboard: '#d6d3d1',
  stair: '#0891b2',
  guard: '#65a30d',
  accessory: '#94a3b8',
  other: '#cbd5e1',
};

/** service classes EN 12811-1, Table 3: uniformly distributed load, kN/m² */
export const LOAD_CLASSES: Record<number, number> = { 1: 0.75, 2: 1.5, 3: 2.0, 4: 3.0, 5: 4.5, 6: 6.0 };
