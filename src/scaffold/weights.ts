/**
 * Parts database of PERI UP: article number → weight [kg] and catalogue name. Sources: parts list of
 * PERI CAD 24 (BeamCheck module) and the product overview of the PERI "AuV UP Gerüstbaukasten
 * Kernbauteile" (Art.-Nr., Gew. kg). PERI CAD does not store weights in the drawing; parts are
 * looked up by article number (also with the other leading digit used for the same part in the
 * catalogue: 1xxxxx ↔ 4xxxxx) and, failing that, by their name.
 */
import db from './partsDb.json';

export interface DbPart {
  article: string;
  kg: number;
  name: string;
}

const DB = db as unknown as Record<string, [number, string]>;

const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/,?\s*(verz|vz)\b\.?/g, ' ')
    .replace(/(\d)\s*x\s*(\d)/g, '$1x$2')
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .trim();

const BY_NAME = new Map<string, string>();
for (const [a, v] of Object.entries(DB)) if (!BY_NAME.has(normName(v[1]))) BY_NAME.set(normName(v[1]), a);

/** database entry of a part of the drawing (article, short name, description) */
export function findPart(article: string, name = '', desc = ''): DbPart | undefined {
  const cands = [article];
  if (/^[14]\d{5}$/.test(article)) cands.push((article[0] === '1' ? '4' : '1') + article.slice(1));
  for (const a of cands) if (DB[a]) return { article: a, kg: DB[a][0], name: DB[a][1] };
  for (const n of [desc, name]) {
    const a = n ? BY_NAME.get(normName(n)) : undefined;
    if (a) return { article: a, kg: DB[a][0], name: DB[a][1] };
  }
  return undefined;
}

/** weights by article number (lookup with the fallbacks of `findPart`) */
export const PART_WEIGHTS: Record<string, number> = new Proxy({} as Record<string, number>, {
  get: (_, article: string) => findPart(article)?.kg,
});

/** weight of a part of the drawing, kg (undefined: not in the database) */
export function partKg(p: { article: string; name?: string; desc?: string }): number | undefined {
  const kg = findPart(p.article, p.name, p.desc)?.kg;
  if (kg !== undefined) return kg;
  // scaffold tubes Ø 48.3 × 3.2 of any length: 3.56 kg/m
  const t = `${p.name ?? ''} ${p.desc ?? ''}`;
  const L = /gerüstrohr|tube/i.test(t) ? Number(/(\d+(?:[.,]\d+)?)\s*m\b/i.exec(t)?.[1]?.replace(',', '.')) : NaN;
  return L > 0 ? Math.round(3.56 * L * 100) / 100 : undefined;
}

export const PARTS_DB_SIZE = Object.keys(DB).length;
