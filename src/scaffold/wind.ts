/**
 * Wind on scaffolds: wind zone of the site and peak velocity pressure q_p.
 *  - Germany: wind zones by administrative boundaries (DIBt, "Zuordnung der Windzonen nach
 *    Verwaltungsgrenzen", table embedded in windDE.json) and the velocity pressures of
 *    DIN EN 1991-1-4/NA (simplified values up to 25 m, annex NA.B above).
 *  - other countries: EN 1991-1-4, 4.3–4.5 from the basic wind velocity v_b,0 of the national
 *    annex (entered by the user) and the terrain category.
 * EN 12811-1 allows a factor ≥ 0.7 on the velocity pressure for the limited time a scaffold stands.
 */
import table from './windDE.json';
import type { Terrain } from './store';

export interface Admin {
  state?: string;
  district?: string;
  county?: string;
  town?: string;
  /** municipality and village (Netherlands: gemeente, former municipalities) */
  municipality?: string;
  village?: string;
  /** ISO 3166-2 codes of the administrative units (e.g. NL-NH, BE-VWV) */
  iso?: string[];
}

type Row = [string, number, string, [number, string][]];
const STATES = (table as unknown as { states: Record<string, Row[]> }).states;
const NRW = (table as unknown as { nrw: [string, string, number][] }).nrw;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(landkreise?|kreisfreien?|kreisfreie|kreise?|städte|stadtkreis|städteregion|regierungsbezirk|lk|stadt|freie|hansestadt|und)\b/g, ' ')
    .replace(/[^a-zäöüß]+/g, ' ')
    .trim();

const names = (s: string) =>
  s
    .split(/[,;]| und /)
    .map(norm)
    .filter(Boolean);

export interface ZoneResult {
  zone: number;
  /** false: the table has exceptions for this district – the zone must be confirmed */
  sure: boolean;
  /** rows of the official table that apply (German) */
  rows: string[];
}

/** Wind zone of a place in Germany from its state, district, county and municipality (null: not found) */
export function germanWindZone(a: Admin): ZoneResult | null {
  const state = Object.keys(STATES).find((s) => norm(s) === norm(a.state ?? ''));
  const cand = [a.county, a.town, a.district].filter((x): x is string => !!x).map(norm);
  const town = norm(a.town ?? '');
  if (norm(a.state ?? '') === norm('Nordrhein-Westfalen')) {
    const rows = NRW.filter((r) => cand.includes(norm(r[0])));
    const exact = rows.find((r) => norm(r[1]) === town) ?? rows.find((r) => r[1] === 'alle' || norm(r[1]) === norm(r[0]));
    if (exact) return { zone: exact[2], sure: true, rows: [`${exact[0]}: ${exact[1]} – Windzone ${exact[2]}`] };
    if (rows.length) {
      const z = Math.max(...rows.map((r) => r[2]));
      return { zone: z, sure: new Set(rows.map((r) => r[2])).size === 1, rows: rows.slice(0, 6).map((r) => `${r[0]}: ${r[1]} – Windzone ${r[2]}`) };
    }
    return null;
  }
  if (!state) return null;
  const rows = STATES[state];
  let hit = rows.filter((r) => names(r[0]).some((n) => cand.includes(n)));
  // most specific first: a county before a district
  const byCounty = hit.filter((r) => names(r[0]).includes(norm(a.county ?? a.town ?? '')));
  if (byCounty.length) hit = byCounty;
  if (!hit.length) hit = rows.filter((r) => /übrige/i.test(r[0]) || norm(r[0]) === norm(state));
  if (!hit.length) return null;
  // all (zone, remark) pairs of the matching rows
  const opts = hit.flatMap((r) => [[r[1], r[2]] as [number, string], ...r[3]]);
  const text = hit.flatMap((r) => [`${r[0]}: Windzone ${r[1]}${r[2] ? ` – ${r[2]}` : ''}`, ...r[3].map((x) => `… Windzone ${x[0]} – ${x[1]}`)]);
  if (opts.length === 1 && !/soweit nicht|ausnahme|teile/i.test(opts[0][1])) return { zone: opts[0][0], sure: true, rows: text };
  // the municipality named in a remark
  if (town) {
    const named = opts.find((o) => !/^alle gemeinden/i.test(o[1]) && norm(o[1]).split(' ').includes(town));
    if (named) return { zone: named[0], sure: true, rows: text };
  }
  // otherwise the general rule of the district ("alle Gemeinden, soweit nicht …"), to be confirmed
  const general = opts.find((o) => /^(jeweils )?alle gemeinden/i.test(o[1])) ?? opts[0];
  return { zone: general[0], sure: false, rows: text };
}

export type ExposureDE = 'inland' | 'coast' | 'island';

/** basic velocity pressure q_b,0 of the German wind zones, N/m² */
export const QB_DE: Record<number, number> = { 1: 320, 2: 390, 3: 470, 4: 560 };
export const VB_DE: Record<number, number> = { 1: 22.5, 2: 25, 3: 27.5, 4: 30 };

// DIN EN 1991-1-4/NA, table NA.B.3: h ≤ 10 m, ≤ 18 m, ≤ 25 m [kN/m²]
const NA_B3: Record<string, [number, number, number]> = {
  '1inland': [0.5, 0.65, 0.75],
  '2inland': [0.65, 0.8, 0.9],
  '2coast': [0.85, 1.0, 1.1],
  '3inland': [0.8, 0.95, 1.1],
  '3coast': [1.05, 1.2, 1.3],
  '4inland': [0.95, 1.15, 1.3],
  '4coast': [1.25, 1.4, 1.55],
};

/**
 * Peak velocity pressure in Germany, N/m²: simplified values up to 25 m, the profiles of annex
 * NA.B above; sites above 800 m: factor (0.2 + H_s / 1000).
 */
export function qpGermany(zone: number, exposure: ExposureDE, h: number, elevation = 0): number {
  const qb = QB_DE[zone] ?? QB_DE[2];
  const z = Math.max(h, 1);
  let qp: number;
  const exp: ExposureDE = zone === 1 ? 'inland' : exposure;
  if (exp === 'island') qp = z <= 10 ? 1400 : 1500 * (z / 10) ** 0.19;
  else if (z <= 25) qp = NA_B3[`${zone}${exp}`][z <= 10 ? 0 : z <= 18 ? 1 : 2] * 1e3;
  else if (exp === 'coast') qp = z <= 50 ? 2.3 * qb * (z / 10) ** 0.27 : 2.6 * qb * (z / 10) ** 0.19;
  else qp = z <= 50 ? 1.7 * qb * (z / 10) ** 0.37 : 2.1 * qb * (z / 10) ** 0.24;
  return elevation > 800 ? qp * (0.2 + elevation / 1000) : qp;
}

const Z0: Record<Terrain, [number, number]> = { '0': [0.003, 1], I: [0.01, 1], II: [0.05, 2], III: [0.3, 5], IV: [1.0, 10] };

/** Peak velocity pressure after EN 1991-1-4 (4.8) for v_b,0 [m/s], flat terrain, N/m² */
export function qpEN(vb0: number, terrain: Terrain, h: number): number {
  const [z0, zmin] = Z0[terrain];
  const z = Math.max(h, zmin);
  const kr = 0.19 * (z0 / 0.05) ** 0.07;
  const cr = kr * Math.log(z / z0);
  const Iv = 1 / Math.log(z / z0);
  return (1 + 7 * Iv) * 0.5 * 1.25 * (cr * vb0) ** 2;
}

/** factor for the standing time of a scaffold (EN 12811-1, 6.2.7.4.1) */
export const STANDING_FACTOR = 0.7;
