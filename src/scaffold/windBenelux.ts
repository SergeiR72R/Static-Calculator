/**
 * Wind in the Benelux countries (national annexes to EN 1991-1-4).
 *  - Netherlands, NEN-EN 1991-1-4/NB: wind areas I / II / III (v_b,0 = 29.5 / 27.0 / 24.5 m/s) by
 *    province and, in Noord-Holland, by municipality (rule of figure NB.1); peak velocity pressure
 *    from table NB.4 ("extreme stuwdruk") for coast / open country / built-up area.
 *  - Belgium, NBN EN 1991-1-4 ANB: v_b,0 = 23 … 26 m/s by municipality (table 4.2 ANB, not
 *    available here): by province from the map of figure 4.3 ANB; where a province has two values
 *    the higher one is taken and has to be confirmed.
 *  - Luxembourg, ILNAS-EN 1991-1-4/AN-LU: one value for the whole country (24 m/s; to be checked
 *    against the national annex).
 * Sources and the state of the data: docs/wind-benelux.md.
 */
import type { Admin, ZoneResult } from './wind';
import type { Terrain } from './store';

const low = (s?: string) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]+/g, ' ')
    .trim();
const has = (list: string[], s?: string) => !!s && list.includes(low(s));

// ---- Netherlands

export const VB0_NL: Record<number, number> = { 1: 29.5, 2: 27.0, 3: 24.5 };

/** provinces by ISO 3166-2 code and name (Dutch, Frisian, German, English) */
const NL_II = ['NL-GR', 'NL-FR', 'NL-FL', 'NL-ZH', 'NL-ZE', 'NL-NH'];
const NL_III = ['NL-DR', 'NL-OV', 'NL-GE', 'NL-UT', 'NL-NB', 'NL-LI'];
const NL_PROV: Record<string, string> = {
  groningen: 'NL-GR',
  friesland: 'NL-FR',
  fryslan: 'NL-FR',
  flevoland: 'NL-FL',
  'zuid holland': 'NL-ZH',
  sudholland: 'NL-ZH',
  'south holland': 'NL-ZH',
  zeeland: 'NL-ZE',
  'noord holland': 'NL-NH',
  nordholland: 'NL-NH',
  'north holland': 'NL-NH',
  drenthe: 'NL-DR',
  overijssel: 'NL-OV',
  gelderland: 'NL-GE',
  utrecht: 'NL-UT',
  'noord brabant': 'NL-NB',
  nordbrabant: 'NL-NB',
  'north brabant': 'NL-NB',
  limburg: 'NL-LI',
};
/** Wadden islands (area I) */
const WADDEN = ['texel', 'vlieland', 'terschelling', 'ameland', 'schiermonnikoog'];
/** Noord-Holland north of Heemskerk – Uitgeest – Wormerland – Purmerend – Edam-Volendam (area I) */
const NH_NORTH = [
  'castricum',
  'heiloo',
  'alkmaar',
  'bergen',
  'dijk en waard',
  'heerhugowaard',
  'langedijk',
  'schagen',
  'den helder',
  'hollands kroon',
  'medemblik',
  'opmeer',
  'koggenland',
  'hoorn',
  'drechterland',
  'stede broec',
  'enkhuizen',
  'graft de rijp',
  'schermer',
];
/** villages of the former municipalities Beemster (now Purmerend) and Zeevang (now Edam-Volendam): north of the line */
const NH_NORTH_VILLAGES = ['middenbeemster', 'westbeemster', 'noordbeemster', 'zuidoostbeemster', 'beemster', 'oosthuizen', 'middelie', 'kwadijk', 'warder', 'schardam', 'hobrede', 'beets', 'zeevang'];

/** Wind area (1, 2, 3) of a place in the Netherlands (null: province not found) */
export function dutchWindArea(a: Admin): ZoneResult | null {
  const code = a.iso?.find((c) => /^NL-[A-Z]{2}$/.test(c)) ?? NL_PROV[low(a.state)];
  if (!code) return null;
  const towns = [a.municipality, a.town, a.village, a.county].filter((x): x is string => !!x);
  const rule = (zone: number, text: string, sure = true): ZoneResult => ({ zone, sure, rows: [`${a.state ?? code}: windgebied ${['', 'I', 'II', 'III'][zone]} – ${text}`] });
  if (towns.some((t) => has(WADDEN, t))) return rule(1, 'Waddeneilanden');
  if (NL_III.includes(code)) return rule(3, 'Drenthe, Overijssel, Gelderland, Utrecht, Noord-Brabant, Limburg');
  if (code === 'NL-NH') {
    if (towns.some((t) => has(NH_NORTH, t) || has(NH_NORTH_VILLAGES, t))) return rule(1, 'Noord-Holland ten noorden van Heemskerk, Uitgeest, Wormerland, Purmerend en Edam-Volendam');
    // the two municipalities that now include villages north of the line
    if (towns.some((t) => has(['purmerend', 'edam volendam'], t)))
      return rule(2, 'Purmerend / Edam-Volendam: windgebied II; de vroegere gemeenten Beemster en Zeevang liggen ten noorden van de grens (windgebied I) – controleren', false);
    return rule(2, 'Noord-Holland ten zuiden van Heemskerk, Uitgeest, Wormerland, Purmerend en Edam-Volendam');
  }
  if (NL_II.includes(code)) return rule(2, 'vasteland Groningen en Friesland, Flevoland, Zuid-Holland, Zeeland');
  return null;
}

// NEN-EN 1991-1-4/NB, table NB.4: extreme stuwdruk q_p(z) [kN/m²]
// columns: I kust, I onbebouwd, I bebouwd, II kust, II onbebouwd, II bebouwd, III onbebouwd, III bebouwd
const NB4_H = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200];
const NB4: number[][] = [
  [0.93, 0.71, 0.69, 0.78, 0.6, 0.58, 0.49, 0.48],
  [1.11, 0.71, 0.69, 0.93, 0.6, 0.58, 0.49, 0.48],
  [1.22, 0.71, 0.69, 1.02, 0.6, 0.58, 0.49, 0.48],
  [1.3, 0.71, 0.69, 1.09, 0.6, 0.58, 0.49, 0.48],
  [1.37, 0.78, 0.69, 1.14, 0.66, 0.58, 0.54, 0.48],
  [1.42, 0.84, 0.69, 1.19, 0.71, 0.58, 0.58, 0.48],
  [1.47, 0.89, 0.69, 1.23, 0.75, 0.58, 0.62, 0.48],
  [1.51, 0.94, 0.73, 1.26, 0.79, 0.62, 0.65, 0.51],
  [1.55, 0.98, 0.77, 1.29, 0.82, 0.65, 0.68, 0.53],
  [1.58, 1.02, 0.81, 1.32, 0.85, 0.68, 0.7, 0.56],
  [1.71, 1.16, 0.96, 1.43, 0.98, 0.8, 0.8, 0.66],
  [1.8, 1.27, 1.07, 1.51, 1.07, 0.9, 0.88, 0.74],
  [1.88, 1.36, 1.16, 1.57, 1.14, 0.97, 0.94, 0.8],
  [1.94, 1.43, 1.23, 1.63, 1.2, 1.03, 0.99, 0.85],
  [2.0, 1.5, 1.3, 1.67, 1.25, 1.09, 1.03, 0.89],
  [2.04, 1.55, 1.35, 1.71, 1.3, 1.13, 1.07, 0.93],
  [2.09, 1.6, 1.4, 1.75, 1.34, 1.17, 1.11, 0.97],
  [2.12, 1.65, 1.45, 1.78, 1.38, 1.21, 1.14, 1.0],
  [2.16, 1.69, 1.49, 1.81, 1.42, 1.25, 1.17, 1.03],
  [2.19, 1.73, 1.53, 1.83, 1.45, 1.28, 1.19, 1.05],
  [2.22, 1.76, 1.57, 1.86, 1.48, 1.31, 1.22, 1.08],
  [2.25, 1.8, 1.6, 1.88, 1.5, 1.34, 1.24, 1.1],
  [2.27, 1.83, 1.63, 1.9, 1.53, 1.37, 1.26, 1.13],
  [2.3, 1.86, 1.66, 1.92, 1.55, 1.39, 1.28, 1.15],
  [2.32, 1.88, 1.69, 1.94, 1.58, 1.42, 1.3, 1.17],
  [2.34, 1.91, 1.72, 1.96, 1.6, 1.44, 1.32, 1.18],
  [2.36, 1.93, 1.74, 1.98, 1.62, 1.46, 1.33, 1.2],
  [2.38, 1.96, 1.77, 1.99, 1.64, 1.48, 1.35, 1.22],
  [2.42, 2.0, 1.81, 2.03, 1.68, 1.52, 1.38, 1.25],
  [2.45, 2.04, 1.85, 2.05, 1.71, 1.55, 1.41, 1.28],
  [2.48, 2.08, 1.89, 2.08, 1.74, 1.59, 1.44, 1.31],
  [2.51, 2.12, 1.93, 2.1, 1.77, 1.62, 1.46, 1.33],
  [2.54, 2.15, 1.96, 2.13, 1.8, 1.65, 1.48, 1.35],
  [2.56, 2.18, 2.0, 2.15, 1.83, 1.67, 1.5, 1.38],
  [2.59, 2.21, 2.03, 2.17, 1.85, 1.7, 1.52, 1.4],
  [2.61, 2.24, 2.06, 2.19, 1.88, 1.72, 1.54, 1.42],
  [2.63, 2.27, 2.08, 2.2, 1.9, 1.75, 1.56, 1.44],
  [2.65, 2.29, 2.11, 2.22, 1.92, 1.77, 1.58, 1.46],
];

export type DutchTerrain = 'kust' | 'onbebouwd' | 'bebouwd';

/** Dutch terrain from the EN category: 0 → coast, I / II → open country, III / IV → built-up area */
export const dutchTerrain = (t: Terrain): DutchTerrain => (t === '0' ? 'kust' : t === 'III' || t === 'IV' ? 'bebouwd' : 'onbebouwd');

/**
 * Peak velocity pressure in the Netherlands, N/m², from table NB.4: the height is rounded up to the
 * next value of the table (on the safe side). Area III has no coast column (open country instead).
 */
export function qpNetherlands(area: number, terrain: DutchTerrain, h: number): number {
  const i = NB4_H.findIndex((z) => z >= h - 1e-9);
  const row = NB4[i < 0 ? NB4.length - 1 : i];
  const a = Math.min(Math.max(Math.round(area), 1), 3);
  const t = a === 3 && terrain === 'kust' ? 'onbebouwd' : terrain;
  const col = a === 3 ? (t === 'bebouwd' ? 7 : 6) : (a - 1) * 3 + (t === 'kust' ? 0 : t === 'onbebouwd' ? 1 : 2);
  return row[col] * 1e3;
}

// ---- Belgium

/** v_b,0 by province (figure 4.3 ANB): value taken for the province and the rows of the map */
const BE: Record<string, { vb0: number; rows: string[] }> = {
  'BE-VWV': { vb0: 26, rows: ['West-Vlaanderen: 26 m/s', '… arrondissement Kortrijk: 25 m/s'] },
  'BE-VOV': { vb0: 26, rows: ['Oost-Vlaanderen: arrondissements Eeklo, Gent: 26 m/s', '… Sint-Niklaas, Dendermonde, Aalst, Oudenaarde: 25 m/s'] },
  'BE-VAN': { vb0: 25, rows: ['Antwerpen: 25 m/s'] },
  'BE-VLI': { vb0: 25, rows: ['Limburg: 25 m/s'] },
  'BE-VBR': { vb0: 25, rows: ['Vlaams-Brabant: 25 m/s'] },
  'BE-BRU': { vb0: 25, rows: ['Bruxelles / Brussel: 25 m/s'] },
  'BE-WBR': { vb0: 25, rows: ['Brabant wallon: 25 m/s'] },
  'BE-WHT': { vb0: 25, rows: ['Hainaut: arrondissements Mouscron, Tournai, Ath, Soignies, Mons: 25 m/s', '… Charleroi, Thuin: 24 m/s'] },
  'BE-WNA': { vb0: 24, rows: ['Namur: 24 m/s', '… sud de l’arrondissement de Dinant: 23 m/s'] },
  'BE-WLG': { vb0: 24, rows: ['Liège: arrondissements Waremme, Liège, Huy, nord de Verviers: 24 m/s', '… sud et est de l’arrondissement de Verviers: 23 m/s'] },
  'BE-WLX': { vb0: 23, rows: ['Luxembourg (province): 23 m/s'] },
};
const BE_PROV: Record<string, string> = {
  'west vlaanderen': 'BE-VWV',
  westflandern: 'BE-VWV',
  'flandre occidentale': 'BE-VWV',
  'west flanders': 'BE-VWV',
  'oost vlaanderen': 'BE-VOV',
  ostflandern: 'BE-VOV',
  'flandre orientale': 'BE-VOV',
  'east flanders': 'BE-VOV',
  antwerpen: 'BE-VAN',
  anvers: 'BE-VAN',
  antwerp: 'BE-VAN',
  limburg: 'BE-VLI',
  limbourg: 'BE-VLI',
  'vlaams brabant': 'BE-VBR',
  'flamisch brabant': 'BE-VBR',
  'brabant flamand': 'BE-VBR',
  'flemish brabant': 'BE-VBR',
  'brabant wallon': 'BE-WBR',
  'wallonisch brabant': 'BE-WBR',
  'walloon brabant': 'BE-WBR',
  hainaut: 'BE-WHT',
  hennegau: 'BE-WHT',
  henegouwen: 'BE-WHT',
  namur: 'BE-WNA',
  namen: 'BE-WNA',
  liege: 'BE-WLG',
  luttich: 'BE-WLG',
  luik: 'BE-WLG',
  luxembourg: 'BE-WLX',
  luxemburg: 'BE-WLX',
};

export interface Vb0Result {
  vb0: number;
  /** false: the province has two values, the higher one is taken – to be confirmed */
  sure: boolean;
  rows: string[];
}

/** v_b,0 of a place in Belgium (null: province not found; Brussels by region) */
export function belgianVb0(a: Admin): Vb0Result | null {
  // province code (the region codes BE-VLG / BE-WAL are not in the table; Brussels is a region)
  let code = a.iso?.find((c) => c in BE);
  if (!code) code = BE_PROV[low(a.county)] ?? BE_PROV[low(a.district)] ?? BE_PROV[low(a.state)];
  if (!code && /brussel|bruxelles|brussels/.test(`${low(a.state)} ${low(a.town)}`)) code = 'BE-BRU';
  const p = code ? BE[code] : undefined;
  if (!p) return null;
  return { vb0: p.vb0, sure: p.rows.length === 1, rows: p.rows };
}

// ---- Luxembourg

/** v_b,0 for the whole of Luxembourg (AN-LU; one value) */
export const VB0_LU = 24;
