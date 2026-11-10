/**
 * State of the scaffold mode (PERI CAD import): the drawing, load and snapping options, selection.
 * Saved in the browser like the beam project, independently of it.
 */
import { create } from 'zustand';
import { storage } from '../state/persist';
import type { ScaffoldDoc } from './pericad';
import { STANDING_FACTOR, germanWindZone, qpEN, qpGermany, type Admin, type ExposureDE } from './wind';
import { VB0_LU, VB0_NL, belgianVb0, dutchTerrain, dutchWindArea, qpNetherlands } from './windBenelux';

const KEY = 'balken.scaffold';
const OPT_KEY = 'balken.scaffoldOpts';

/** site of the scaffold (for wind, snow and ice) */
export interface Site {
  /** what the user typed, e.g. "Weißenhorn" */
  query: string;
  /** recognised place, e.g. "Weißenhorn, Landkreis Neu-Ulm, Bayern, Deutschland" */
  name: string;
  lat: number;
  lon: number;
  /** ISO 3166-1 alpha-2, lower case */
  country: string;
  /** height above sea level, m (null: unknown) */
  elevation: number | null;
  /** position confirmed by the user on the map */
  confirmed: boolean;
  /** administrative units of the place (wind zone) */
  admin?: Admin;
}

/** terrain categories EN 1991-1-4 */
export type Terrain = '0' | 'I' | 'II' | 'III' | 'IV';
export const TERRAINS: Terrain[] = ['0', 'I', 'II', 'III', 'IV'];

export interface ScaffoldOpts {
  /** service class EN 12811-1 (1…6) */
  loadClass: number;
  /** self weight of the decks, N/m² */
  g: number;
  /** snapping tolerance, m */
  tol: number;
  site: Site | null;
  /** scaffold outdoors (wind, snow, ice) or in a building */
  exposure: 'outdoor' | 'indoor';
  snow: boolean;
  ice: boolean;
  terrain: Terrain;
  /** peak velocity pressure of the maximum wind, N/m² (0: not set) */
  qMax: number;
  /** snow load on the decks, N/m² */
  snowLoad: number;
  /** ice thickness on the members, m */
  iceThickness: number;
  /** loaded deck level (−1: the largest) */
  level: number;
  secondOrder: boolean;
  /** q_p entered by hand (qMax) instead of the value from the wind zone */
  windManual: boolean;
  /** German wind zone chosen by the user (0: from the table) */
  windZone: number;
  windExposure: ExposureDE;
  /** basic wind velocity v_b,0 of the national annex for sites outside Germany, m/s */
  vb0: number;
  /** factor 0.7 for the standing time of the scaffold */
  standing: boolean;
}

export interface SiteWind {
  /** peak velocity pressure, N/m² (0: unknown) */
  qp: number;
  /** value for the analysis (with the standing factor), N/m² */
  qMax: number;
  /** wind zone (Germany 1…4, Netherlands wind area 1…3) and whether the rule is unambiguous */
  zone?: number;
  /** basic wind velocity used, m/s (Belgium, Luxembourg, other countries) */
  vb0?: number;
  sure?: boolean;
  rows?: string[];
  source: 'manual' | 'de' | 'nl' | 'be' | 'lu' | 'en' | 'none';
}

/** Maximum wind for the site: by hand, from the German wind zone table or from v_b,0 (EN 1991-1-4) */
export function siteWind(o: ScaffoldOpts, height: number): SiteWind {
  if (o.exposure !== 'outdoor') return { qp: 0, qMax: 0, source: 'none' };
  if (o.windManual) return { qp: o.qMax, qMax: o.qMax, source: 'manual' };
  const f = o.standing ? STANDING_FACTOR : 1;
  if (o.site?.country === 'de') {
    const z = o.site.admin ? germanWindZone(o.site.admin) : null;
    const zone = o.windZone || z?.zone;
    if (!zone) return { qp: 0, qMax: 0, source: 'none' };
    const qp = qpGermany(zone, o.windExposure, height, o.site.elevation ?? 0);
    return { qp, qMax: qp * f, zone, sure: o.windZone ? true : z?.sure, rows: z?.rows, source: 'de' };
  }
  if (o.site?.country === 'nl') {
    const z = o.site.admin ? dutchWindArea(o.site.admin) : null;
    const zone = o.windZone >= 1 && o.windZone <= 3 ? o.windZone : z?.zone;
    if (!zone) return { qp: 0, qMax: 0, source: 'none' };
    const qp = qpNetherlands(zone, dutchTerrain(o.terrain), height);
    return { qp, qMax: qp * f, zone, vb0: VB0_NL[zone], sure: o.windZone ? true : z?.sure, rows: z?.rows, source: 'nl' };
  }
  if (o.site?.country === 'be' || o.site?.country === 'lu') {
    const be = o.site.country === 'be';
    const z = be ? (o.site.admin ? belgianVb0(o.site.admin) : null) : { vb0: VB0_LU, sure: true, rows: [`Luxembourg: v_b,0 = ${VB0_LU} m/s`] };
    const vb0 = o.windZone >= 20 ? o.windZone : z?.vb0;
    if (!vb0) return { qp: 0, qMax: 0, source: 'none' };
    const qp = qpEN(vb0, o.terrain, height);
    return { qp, qMax: qp * f, vb0, sure: o.windZone ? true : z?.sure, rows: z?.rows, source: be ? 'be' : 'lu' };
  }
  if (o.site && o.vb0 > 0) {
    const qp = qpEN(o.vb0, o.terrain, height);
    return { qp, qMax: qp * f, vb0: o.vb0, source: 'en' };
  }
  return { qp: 0, qMax: 0, source: 'none' };
}

export const DEFAULT_SCAFFOLD_OPTS: ScaffoldOpts = { loadClass: 3, g: 300, tol: 0.05, site: null, exposure: 'outdoor', snow: false, ice: false, terrain: 'II', qMax: 0, snowLoad: 750, iceThickness: 0.01, level: -1, secondOrder: true, windManual: false, windZone: 0, windExposure: 'inland', vb0: 0, standing: true };

export interface ScaffoldState extends ScaffoldOpts {
  doc: ScaffoldDoc | null;
  /** selected parts (3D, lists) */
  selected: string[];
  /** selected girder key */
  girder: string | null;
  /** beam list created from this drawing: id and signature of drawing + options */
  batchRef: { id: string; sig: string } | null;
  setDoc: (doc: ScaffoldDoc | null) => void;
  setOpts: (o: Partial<ScaffoldOpts>) => void;
  select: (parts: string[], girder?: string | null) => void;
  setBatchRef: (r: { id: string; sig: string } | null) => void;
}

function loadDoc(): ScaffoldDoc | null {
  const raw = storage.get(KEY);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as ScaffoldDoc;
    return Array.isArray(d.parts) && d.geom ? d : null;
  } catch {
    return null;
  }
}

function loadOpts(): ScaffoldOpts & { batchRef: ScaffoldState['batchRef'] } {
  const o = { ...DEFAULT_SCAFFOLD_OPTS, batchRef: null };
  try {
    const saved = JSON.parse(storage.get(OPT_KEY) ?? '{}');
    // options of version 1: deck self weight was the old default 0.20 kN/m² → new default
    if (!saved.v) delete saved.g;
    delete saved.v;
    Object.assign(o, saved);
  } catch {
    /* ignore */
  }
  return o;
}

function save(s: ScaffoldState) {
  const o: ScaffoldOpts & { v: number; batchRef: ScaffoldState['batchRef'] } = {
    v: 2,
    loadClass: s.loadClass,
    g: s.g,
    tol: s.tol,
    site: s.site,
    exposure: s.exposure,
    snow: s.snow,
    ice: s.ice,
    terrain: s.terrain,
    qMax: s.qMax,
    snowLoad: s.snowLoad,
    iceThickness: s.iceThickness,
    level: s.level,
    secondOrder: s.secondOrder,
    windManual: s.windManual,
    windZone: s.windZone,
    windExposure: s.windExposure,
    vb0: s.vb0,
    standing: s.standing,
    batchRef: s.batchRef,
  };
  storage.set(OPT_KEY, JSON.stringify(o));
}

export const useScaffold = create<ScaffoldState>()((set, get) => ({
  ...loadOpts(),
  doc: loadDoc(),
  selected: [],
  girder: null,
  setDoc: (doc) => {
    set({ doc, selected: [], girder: null, batchRef: null });
    save(get());
    if (doc) storage.set(KEY, JSON.stringify(doc));
    else storage.remove(KEY);
  },
  setOpts: (o) => {
    set(o);
    save(get());
  },
  select: (parts, girder = null) => set({ selected: parts, girder }),
  setBatchRef: (r) => {
    set({ batchRef: r });
    save(get());
  },
}));
