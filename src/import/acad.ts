/**
 * Import of the beam list exported from AutoCAD (Excel, sheets "Übersicht", "Positionen",
 * "Abbildungen"): one beam model per row of the overview with its PERI profile, length,
 * supports (pinned + rollers) and the point loads Gk / Qk of the positions sheet.
 *
 * Columns are found by their header text, so the column order may change.
 */
import type { BeamModel, PeriProductId, Support } from '../core/types';
import { baseModel, makeSupport, pointLoad } from '../core/defaults';
import { PERI_PRODUCTS, findPeriProduct, periMaterial } from '../sections/peri';
import type { CellValue, Sheet } from './xlsx';

export interface ImportWarning {
  /** i18n key below import.warn */
  key: string;
  params?: Record<string, string | number>;
}

export interface ImportedBeam {
  /** position key from the drawing, e.g. "B-003" */
  key: string;
  /** designation, e.g. "RCS 498" */
  designation: string;
  model: BeamModel;
  warnings: ImportWarning[];
  /** drawing of the beam from the export (data URL) */
  image?: string;
}

/** lengths within this tolerance are snapped to the catalogue length, m */
export const LENGTH_SNAP = 0.025;
/** points closer than this are merged, m */
const MERGE = 0.001;

const norm = (v: CellValue) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Column index by header: exact match first, then "starts with" */
function col(header: CellValue[], ...names: string[]): number {
  const h = header.map(norm);
  for (const n of names) {
    const i = h.findIndex((x) => x === n || x.replace(/\s*\[.*\]$/, '') === n);
    if (i >= 0) return i;
  }
  for (const n of names) {
    const i = h.findIndex((x) => x.startsWith(n));
    if (i >= 0) return i;
  }
  return -1;
}

/** factor to metres from the unit in the header ("[mm]", "[cm]", "[m]"); default mm */
function lengthFactor(header: CellValue): number {
  const u = /\[(\w+)\]/.exec(String(header ?? ''))?.[1]?.toLowerCase();
  return u === 'm' ? 1 : u === 'cm' ? 0.01 : 0.001;
}

const num = (v: CellValue) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v.replace(',', '.'))) ? Number(v.replace(',', '.')) : NaN);
const str = (v: CellValue) => (v === null || v === undefined ? '' : String(v)).trim();

function findSheet(sheets: Sheet[], test: (header: string[]) => boolean): Sheet | undefined {
  return sheets.find((s) => test((s.rows[0] ?? []).map(norm)));
}

/**
 * PERI product for a designation ("SRU 147", "RCS 498", "Kletterschienenverbinder RCS 97").
 * Known family token → that product; otherwise the product with the nearest mass per metre.
 */
export function profileFor(designation: string, massPerMetre: number): { product: PeriProductId; exact: boolean } {
  const d = designation.toUpperCase();
  const exact = /^(SRU|RCS|GT|VT)\s*\d+[A-Z]?$/.test(d.replace(/\s+/g, ' ').trim());
  if (/\bSRU\b/.test(d)) return { product: 'SRU120', exact };
  if (/\bRCS\b/.test(d)) return { product: 'RCS', exact };
  if (/\bGT\s*24\b/.test(d)) return { product: 'GT24', exact };
  if (/\bVT\s*20/.test(d)) return { product: 'VT20K', exact };
  let best = PERI_PRODUCTS[0];
  for (const p of PERI_PRODUCTS) if (Math.abs(p.mass - massPerMetre) < Math.abs(best.mass - massPerMetre)) best = p;
  return { product: best.id, exact: false };
}

const mm = (x: number) => Math.round(x * 1000);

export function importAcadWorkbook(sheets: Sheet[]): ImportedBeam[] {
  const overview = findSheet(sheets, (h) => h.includes('balken') && h.some((x) => x.startsWith('länge') || x.startsWith('laenge')));
  if (!overview) throw new Error('import.noOverview');
  const positions = findSheet(sheets, (h) => h.includes('balken') && h.some((x) => x.startsWith('position')) && h.includes('art'));
  const pictures = sheets.find((s) => s !== overview && s !== positions && s.images.length > 0);

  // overview columns
  const oh = overview.rows[0];
  const c = {
    key: col(oh, 'balken'),
    handle: col(oh, 'handle'),
    article: col(oh, 'artikel'),
    designation: col(oh, 'bezeichnung'),
    length: col(oh, 'länge', 'laenge'),
    hBottom: col(oh, 'höhe uk'),
    hTop: col(oh, 'höhe ok'),
    xMid: col(oh, 'mitte x'),
    yMid: col(oh, 'mitte y'),
    weight: col(oh, 'gewicht'),
    bearing: col(oh, 'auflage'),
  };
  if (c.key < 0 || c.length < 0) throw new Error('import.noOverview');
  const fL = lengthFactor(oh[c.length]);

  // positions grouped by beam
  type Pos = { kind: 'load' | 'support'; name: string; x: number; G: number; Q: number };
  const byBeam = new Map<string, Pos[]>();
  if (positions) {
    const ph = positions.rows[0];
    const p = {
      key: col(ph, 'balken'),
      kind: col(ph, 'art'),
      name: col(ph, 'name'),
      x: col(ph, 'position vom linken rand', 'position'),
      G: col(ph, 'gk'),
      Q: col(ph, 'qk'),
    };
    const fx = lengthFactor(ph[p.x]);
    for (const r of positions.rows.slice(1)) {
      const key = str(r[p.key]);
      if (!key) continue;
      const kind = norm(r[p.kind]);
      const x = num(r[p.x]) * fx;
      if (!Number.isFinite(x)) continue;
      const item: Pos = {
        kind: kind.startsWith('auflager') ? 'support' : 'load',
        name: str(r[p.name]),
        x,
        G: Math.max(0, num(r[p.G]) || 0),
        Q: Math.max(0, num(r[p.Q]) || 0),
      };
      if (item.kind === 'load' && !kind.startsWith('last')) continue;
      const list = byBeam.get(key) ?? [];
      list.push(item);
      byBeam.set(key, list);
    }
  }

  // drawings: anchored next to the row whose first cell starts with the beam key
  const imageOf = new Map<string, string>();
  if (pictures) {
    for (const img of pictures.images) {
      const key = str(pictures.rows[img.row]?.[0]).split('\n')[0].trim();
      if (key && !imageOf.has(key)) imageOf.set(key, img.dataUrl);
    }
  }

  const out: ImportedBeam[] = [];
  for (const r of overview.rows.slice(1)) {
    const key = str(r[c.key]);
    const Lfile = num(r[c.length]) * fL;
    if (!key || !(Lfile > 0)) continue;
    const designation = str(r[c.designation]);
    const weight = num(r[c.weight]);
    const warnings: ImportWarning[] = [];

    // profile
    const prof = profileFor(designation, weight / Lfile);
    const product = findPeriProduct(prof.product)!;
    if (!prof.exact) warnings.push({ key: 'profileMapped', params: { name: designation || '–', profile: product.name } });

    // length: standard length of the designation ("RCS 248" → 2480 mm, "SRU 147" → 1472 mm) has priority,
    // otherwise the nearest catalogue length within the tolerance, otherwise the length from the file
    const nominal = Number(/(\d+)\s*$/.exec(designation)?.[1]);
    const byName = prof.exact ? product.lengths.find((l) => Math.round(l * 100) === nominal) : undefined;
    const near = product.lengths.reduce((a, b) => (Math.abs(b - Lfile) < Math.abs(a - Lfile) ? b : a), product.lengths[0]);
    const target = byName ?? near;
    let L = Lfile;
    if (Math.abs(target - Lfile) <= LENGTH_SNAP) {
      if (Math.abs(target - Lfile) > 0.0005) warnings.push({ key: 'lengthSnapped', params: { from: mm(Lfile), to: mm(target) } });
      L = target;
    } else if (byName !== undefined) {
      warnings.push({ key: 'lengthFromDesignation', params: { from: mm(Lfile), to: mm(byName), name: designation } });
      L = byName;
    } else warnings.push({ key: 'lengthNotCatalog', params: { L: mm(Lfile), near: mm(near) } });

    const m = baseModel(L, designation ? `${key} ${designation}` : key);
    m.segments[0].section = { kind: 'peri', product: prof.product };
    m.segments[0].material = periMaterial(prof.product);
    m.settings.selfWeight = true;
    const meta: string[] = [];
    const add = (label: string, i: number, unit = '') => {
      if (i >= 0 && str(r[i])) meta.push(`${label}: ${str(r[i])}${unit}`);
    };
    add('Handle', c.handle);
    add('Artikel', c.article);
    add('Höhe UK', c.hBottom, ' mm');
    add('Höhe OK', c.hTop, ' mm');
    add('Mitte X', c.xMid, ' mm');
    add('Mitte Y', c.yMid, ' mm');
    add('Gewicht', c.weight, ' kg');
    add('Auflage', c.bearing);
    m.description = meta.join(' · ');

    const clamp = (x: number, name: string) => {
      if (x < -MERGE || x > L + MERGE) warnings.push({ key: 'outside', params: { name, x: mm(x) } });
      return Math.min(Math.max(x, 0), L);
    };

    // loads (characteristic, vertical): Gk → G, Qk → Q
    const pos = byBeam.get(key) ?? [];
    for (const p of pos.filter((q) => q.kind === 'load')) {
      const x = clamp(p.x, p.name);
      if (p.G > 0) m.loads.push(pointLoad('G', x, p.G));
      if (p.Q > 0) m.loads.push(pointLoad('Q', x, p.Q));
    }
    if (!m.loads.length) warnings.push({ key: 'noLoads' });

    // supports: first pinned, the others rollers
    const xs: number[] = [];
    const addX = (x: number) => {
      if (!xs.some((v) => Math.abs(v - x) < MERGE)) xs.push(x);
    };
    for (const p of pos.filter((q) => q.kind === 'support')) addX(clamp(p.x, p.name));
    const ground = /durchgehend|untergrund/.test(norm(c.bearing >= 0 ? r[c.bearing] : ''));
    if (!xs.length && ground) {
      // continuously bedded on the ground: simplified with supports at the ends and under every load
      addX(0);
      addX(L);
      for (const l of m.loads) if (l.kind === 'point') addX(l.x);
      warnings.push({ key: 'ground' });
    } else if (!xs.length) warnings.push({ key: 'noSupports' });
    else if (xs.length === 1) warnings.push({ key: 'oneSupport' });
    xs.sort((a, b) => a - b);
    m.supports = xs.map((x, i): Support => makeSupport(i === 0 ? 'pinned' : 'roller', x));

    out.push({ key, designation, model: m, warnings, image: imageOf.get(key) });
  }
  if (!out.length) throw new Error('import.empty');
  return out;
}
