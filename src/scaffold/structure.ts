/**
 * Structure of an imported PERI CAD scaffold: parts in world coordinates, standards, lattice girders
 * (ULS Flex chains and ULA / ULS in one piece) with their supports and the deck loads on them,
 * parts list and plausibility notes.
 *
 * Coordinates: x, y horizontal, z up (metres), as in the drawing.
 */
import type { BeamModel, Load } from '../core/types';
import { baseModel, makeSupport, udl } from '../core/defaults';
import { FLEX, LATTICE_TYPES, flexLength, type LatticeId } from '../sections/lattice';
import { periMaterial } from '../sections/peri';
import { classifyPart, PART_KINDS, type PartClass } from './catalog';
import { findPart, partKg } from './weights';
import { healParts, type PartMove } from './heal';
import { place, type ScaffoldDoc, type ScaffoldPart, type V3 } from './pericad';

export interface WorldPart {
  part: ScaffoldPart;
  cls: PartClass;
  lines: [V3, V3][];
  rosettes: V3[];
  min: V3;
  max: V3;
  /** horizontal axis direction of the part (local x), unit */
  u: [number, number];
}

export interface Column {
  x: number;
  y: number;
  z0: number;
  z1: number;
  parts: string[];
}

export interface GirderLoad {
  /** along the girder from its start, m */
  s1: number;
  s2: number;
  /** deck span carried half by this girder, m */
  span: number;
}

export interface Girder {
  key: string;
  product: LatticeId;
  /** ULS Flex intermediate elements */
  flex?: number[];
  /** girder length as in the beam calculator (ULS Flex: system length, ULA / ULS: overall length), m */
  L: number;
  /** start point (beam x = 0) in plan and the axis direction */
  origin: [number, number];
  u: [number, number];
  zBottom: number;
  zTop: number;
  parts: string[];
  /** support positions along the girder, m */
  supports: number[];
  supportsAssumed: boolean;
  loads: GirderLoad[];
  warnings: { key: string; params?: Record<string, string | number> }[];
}

export interface ScaffoldIssue {
  key: string;
  params?: Record<string, string | number>;
  parts: string[];
  severity: 'warning' | 'info';
}

export interface BomRow {
  /** weight of one part, kg (from the PERI parts list; undefined if unknown) */
  weight?: number;
  article: string;
  name: string;
  desc: string;
  count: number;
  kind: PartClass['kind'];
}

/** anchor: scaffold tube with a coupler at a standard and a flange coupler (or nothing) at the structure */
export interface Anchor {
  /** the tube */
  id: string;
  /** couplers at the standard, flange couplers at the structure */
  couplers: string[];
  flange: string[];
  /** point at the standard and at the structure, horizontal length */
  atStandard: V3;
  atStructure: V3;
  length: number;
}

export interface ScaffoldStructure {
  parts: WorldPart[];
  columns: Column[];
  anchors: Anchor[];
  girders: Girder[];
  bom: BomRow[];
  issues: ScaffoldIssue[];
  /** parts moved onto their connection points */
  moves: PartMove[];
  min: V3;
  max: V3;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const isVert = (a: V3, b: V3) => Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-3 && Math.abs(b[2] - a[2]) > 1e-3;
const isHor = (a: V3, b: V3) => Math.abs(b[2] - a[2]) < 1e-3;

function worldPart(doc: ScaffoldDoc, p0: ScaffoldPart): WorldPart {
  // exploded parts of the older kind carry only their article: name from the parts database
  const db = p0.name === p0.article && !p0.desc ? findPart(p0.article) : undefined;
  const p = db ? { ...p0, name: db.name, desc: db.name } : p0;
  const g = doc.geom[p.article] ?? { lines: [], rosettes: [] };
  const lines = g.lines.map(([a, b]) => [place(p.m, a), place(p.m, b)] as [V3, V3]);
  const rosettes = g.rosettes.map((q) => place(p.m, q));
  const pts = [...lines.flat(), ...rosettes];
  if (!pts.length) pts.push([p.m[3], p.m[7], p.m[11]]);
  const min: V3 = [0, 1, 2].map((i) => Math.min(...pts.map((q) => q[i]))) as V3;
  const max: V3 = [0, 1, 2].map((i) => Math.max(...pts.map((q) => q[i]))) as V3;
  let u: [number, number] = [p.m[0], p.m[4]];
  const n = Math.hypot(u[0], u[1]);
  u = n > 1e-6 ? [u[0] / n, u[1] / n] : [1, 0];
  // canonical sign: the larger component positive
  if ((Math.abs(u[0]) >= Math.abs(u[1]) && u[0] < 0) || (Math.abs(u[1]) > Math.abs(u[0]) && u[1] < 0)) u = [-u[0], -u[1]];
  return { part: { ...p, m: [...p.m] }, cls: classifyPart(p.article, p.name, p.desc), lines, rosettes, min, max, u };
}

/** the longest vertical line of a part (axis of a standard or connector) */
function vertAxis(w: WorldPart): [V3, V3] | null {
  let best: [V3, V3] | null = null;
  let len = 0;
  for (const [a, b] of w.lines)
    if (isVert(a, b) && Math.abs(b[2] - a[2]) > len) {
      len = Math.abs(b[2] - a[2]);
      best = a[2] < b[2] ? [a, b] : [b, a];
    }
  return best;
}

/** standards stacked on the same axis */
function buildColumns(parts: WorldPart[]): Column[] {
  const cols: Column[] = [];
  const items = parts
    .filter((w) => w.cls.kind === 'standard' || w.cls.kind === 'base')
    .map((w) => ({ w, ax: vertAxis(w) }))
    .filter((p): p is { w: WorldPart; ax: [V3, V3] } => !!p.ax)
    .sort((a, b) => a.ax[0][2] - b.ax[0][2]);
  for (const { w, ax } of items) {
    const c = cols.find((k) => Math.hypot(k.x - ax[0][0], k.y - ax[0][1]) < 0.02 && ax[0][2] <= k.z1 + 0.15);
    if (c) {
      c.z0 = Math.min(c.z0, ax[0][2]);
      c.z1 = Math.max(c.z1, ax[1][2]);
      c.parts.push(w.part.id);
    } else cols.push({ x: ax[0][0], y: ax[0][1], z0: ax[0][2], z1: ax[1][2], parts: [w.part.id] });
  }
  return cols;
}

const dot = (a: [number, number], b: [number, number]) => a[0] * b[0] + a[1] * b[1];
/** horizontal distance of point p from the line through o in direction u (signed) */
const perp = (o: [number, number], u: [number, number], p: [number, number]) => (p[0] - o[0]) * -u[1] + (p[1] - o[1]) * u[0];
const along = (o: [number, number], u: [number, number], p: [number, number]) => (p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1];

/** chord heights of girder parts: lowest and highest horizontal line */
function chordZ(ws: WorldPart[]): [number, number] {
  const zs = ws.flatMap((w) => w.lines.filter(([a, b]) => isHor(a, b) && Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.2).map(([a]) => a[2]));
  if (!zs.length) return [Math.min(...ws.map((w) => w.min[2])), Math.max(...ws.map((w) => w.max[2]))];
  return [Math.min(...zs), Math.max(...zs)];
}

/** union-find groups of ULS Flex parts that form one girder (collinear, touching, same height) */
function flexChains(parts: WorldPart[]): WorldPart[][] {
  const fl = parts.filter((w) => w.cls.kind === 'flexEnd' || w.cls.kind === 'flexElement' || w.cls.kind === 'flexConnector');
  const parent = fl.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const mid = (w: WorldPart): [number, number] => [(w.min[0] + w.max[0]) / 2, (w.min[1] + w.max[1]) / 2];
  for (let i = 0; i < fl.length; i++)
    for (let j = i + 1; j < fl.length; j++) {
      const a = fl[i];
      const b = fl[j];
      if (Math.abs(dot(a.u, b.u)) < 0.99) continue;
      if (a.min[2] > b.max[2] + 0.05 || b.min[2] > a.max[2] + 0.05) continue;
      const u = a.u;
      if (Math.abs(perp(mid(a), u, mid(b))) > 0.1) continue;
      const ia = [along([0, 0], u, [a.min[0], a.min[1]]), along([0, 0], u, [a.max[0], a.max[1]])].sort((p, q) => p - q);
      const ib = [along([0, 0], u, [b.min[0], b.min[1]]), along([0, 0], u, [b.max[0], b.max[1]])].sort((p, q) => p - q);
      if (ia[0] > ib[1] + 0.2 || ib[0] > ia[1] + 0.2) continue;
      parent[find(i)] = find(j);
    }
  const groups = new Map<number, WorldPart[]>();
  fl.forEach((w, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(w);
  });
  return [...groups.values()];
}

function flexGirder(ws: WorldPart[], key: string): Girder | null {
  const conns = ws.filter((w) => w.cls.kind === 'flexConnector');
  const elems = ws.filter((w) => w.cls.kind === 'flexElement');
  const ends = ws.filter((w) => w.cls.kind === 'flexEnd');
  const u = (elems[0] ?? ends[0] ?? ws[0]).u;
  const warnings: Girder['warnings'] = [];
  const axes = conns.map(vertAxis).filter((a): a is [V3, V3] => !!a);
  if (!axes.length) return null;
  const o0: [number, number] = [axes[0][0][0], axes[0][0][1]];
  const s = axes.map((a) => along(o0, u, [a[0][0], a[0][1]])).sort((p, q) => p - q);
  const elements: number[] = [];
  for (let k = 1; k < s.length; k++) {
    const e = Math.round((s[k] - s[k - 1]) * 4) / 4;
    elements.push(FLEX.elements.includes(e) ? e : Math.min(...FLEX.elements.filter((x) => x >= e), 1.5));
    if (!FLEX.elements.includes(e)) warnings.push({ key: 'flexSpacing', params: { a: r3(s[k] - s[k - 1]) } });
  }
  if (!elements.length) {
    warnings.push({ key: 'flexOneConnector' });
    return null;
  }
  // intermediate elements of the drawing against the connector spacing
  const drawn = elems.map((w) => w.cls.flexLength).filter((v): v is number => v !== undefined).sort();
  const need = [...elements].sort();
  if (drawn.length !== need.length || drawn.some((v, k) => Math.abs(v - need[k]) > 1e-6))
    warnings.push({ key: 'flexElements', params: { drawn: drawn.map((v) => v * 100).join(' + ') || '–', need: need.map((v) => v * 100).join(' + ') } });
  if (ends.length !== 2) warnings.push({ key: 'flexEnds', params: { n: ends.length } });
  const start = s[0] - FLEX.endLength;
  const origin: [number, number] = [o0[0] + u[0] * start, o0[1] + u[1] * start];
  const [zBottom, zTop] = chordZ([...elems, ...ends].length ? [...elems, ...ends] : ws);
  return {
    key,
    product: 'ULSFLEX',
    flex: elements,
    L: flexLength(elements),
    origin,
    u,
    zBottom,
    zTop,
    parts: ws.map((w) => w.part.id),
    supports: [],
    supportsAssumed: false,
    loads: [],
    warnings,
  };
}

function oneGirder(w: WorldPart, key: string): Girder {
  const id = w.cls.girder!;
  const t = LATTICE_TYPES[id];
  const u = w.u;
  const pts = w.lines.flat();
  const o: [number, number] = [w.part.m[3], w.part.m[7]];
  const ss = pts.map((p) => along(o, u, [p[0], p[1]]));
  const s0 = Math.min(...ss);
  const len = Math.max(...ss) - s0;
  const near = t.weights.map((x) => x[0]).reduce((a, b) => (Math.abs(b - len) < Math.abs(a - len) ? b : a));
  const warnings: Girder['warnings'] = [];
  let L = len;
  if (Math.abs(near - len) <= 0.1) L = near;
  else warnings.push({ key: 'girderLength', params: { L: r3(len) } });
  const mid = (Math.max(...ss) + s0) / 2;
  const start = mid - L / 2;
  const [zBottom, zTop] = chordZ([w]);
  return {
    key,
    product: id,
    L,
    origin: [o[0] + u[0] * start, o[1] + u[1] * start],
    u,
    zBottom,
    zTop,
    parts: [w.part.id],
    supports: [],
    supportsAssumed: false,
    loads: [],
    warnings,
  };
}

/** supports of a girder: standards on its axis that reach the bottom chord */
function findSupports(g: Girder, cols: Column[]) {
  const sys = g.product === 'ULSFLEX' ? [0, ...connectorPositions(g.flex ?? []), g.L] : null;
  const o = g.product === 'ULSFLEX' ? 0 : LATTICE_TYPES[g.product].overhang;
  const xs: number[] = [];
  for (const c of cols) {
    if (Math.abs(perp(g.origin, g.u, [c.x, c.y])) > 0.12) continue;
    const s = along(g.origin, g.u, [c.x, c.y]);
    if (s < -0.15 || s > g.L + 0.15) continue;
    if (c.z1 < g.zBottom - 0.1 || c.z0 > g.zTop + 0.1) continue;
    let x = s;
    if (sys) {
      const n = sys.reduce((a, b) => (Math.abs(b - s) < Math.abs(a - s) ? b : a));
      if (Math.abs(n - s) <= 0.15) x = n;
    } else {
      // ULA / ULS: system points every 0.25 m from the end system point
      x = o + Math.round((s - o) * 4) / 4;
      x = Math.min(Math.max(x, o), g.L - o);
    }
    x = Math.min(Math.max(r3(x), 0), g.L);
    if (!xs.some((v) => Math.abs(v - x) < 1e-6)) xs.push(x);
  }
  xs.sort((a, b) => a - b);
  if (xs.length < 2) {
    g.supportsAssumed = true;
    g.warnings.push({ key: 'girderSupports', params: { n: xs.length } });
    const a = g.product === 'ULSFLEX' ? 0 : o;
    g.supports = [a, r3(g.L - a)];
  } else g.supports = xs;
}

export function connectorPositions(elements: number[]): number[] {
  const out = [FLEX.endLength];
  for (const e of elements) out.push(r3(out[out.length - 1] + e));
  return out;
}

/** decks lying on the top chord, spanning across the girder */
function findLoads(g: Girder, parts: WorldPart[]) {
  const raw: GirderLoad[] = [];
  for (const w of parts) {
    if (w.cls.kind !== 'deck') continue;
    const z = w.min[2];
    if (z < g.zTop - 0.06 || z > g.zTop + 0.15) continue;
    const dx = w.max[0] - w.min[0];
    const dy = w.max[1] - w.min[1];
    const long: [number, number] = dx >= dy ? [1, 0] : [0, 1];
    if (Math.abs(dot(long, g.u)) > 0.2) continue;
    const span = Math.max(dx, dy);
    // one end of the deck on the girder
    const e1: [number, number] = dx >= dy ? [w.min[0], (w.min[1] + w.max[1]) / 2] : [(w.min[0] + w.max[0]) / 2, w.min[1]];
    const e2: [number, number] = dx >= dy ? [w.max[0], (w.min[1] + w.max[1]) / 2] : [(w.min[0] + w.max[0]) / 2, w.max[1]];
    if (Math.min(Math.abs(perp(g.origin, g.u, e1)), Math.abs(perp(g.origin, g.u, e2))) > 0.2) continue;
    const a = [along(g.origin, g.u, [w.min[0], w.min[1]]), along(g.origin, g.u, [w.max[0], w.max[1]])].sort((p, q) => p - q);
    const s1 = Math.max(0, a[0]);
    const s2 = Math.min(g.L, a[1]);
    if (s2 - s1 < 0.05) continue;
    raw.push({ s1, s2, span: Math.max(0.25, Math.round(span * 4) / 4) });
  }
  raw.sort((p, q) => p.s1 - q.s1);
  const out: GirderLoad[] = [];
  for (const l of raw) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.span - l.span) < 1e-6 && l.s1 <= last.s2 + 0.06) last.s2 = Math.max(last.s2, l.s2);
    else out.push({ ...l });
  }
  // decks cover the girder up to its ends: close small gaps at the ends
  for (const l of out) {
    if (l.s1 < 0.06) l.s1 = 0;
    if (l.s2 > g.L - 0.06) l.s2 = g.L;
    l.s1 = r3(l.s1);
    l.s2 = r3(l.s2);
  }
  g.loads = out;
  if (!out.length) g.warnings.push({ key: 'girderNoDecks' });
}

export interface StructureOptions {
  /** snapping tolerance of imprecisely placed parts, m (0: off) */
  tol: number;
  /** at most this many parts may follow a moved part (default 10) */
  maxFollow?: number;
}

export const DEFAULT_TOL = 0.05;

export function analyzeScaffold(doc: ScaffoldDoc, opt: StructureOptions = { tol: DEFAULT_TOL }): ScaffoldStructure {
  const parts = doc.parts.map((p) => worldPart(doc, p));
  const issues: ScaffoldIssue[] = [];

  // duplicates: same article at the same place
  const seen = new Map<string, string[]>();
  for (const w of parts) {
    const k = `${w.part.article}|${w.part.m.map((v) => Math.round(v * 1000)).join(',')}`;
    seen.set(k, [...(seen.get(k) ?? []), w.part.id]);
  }
  for (const ids of seen.values())
    if (ids.length > 1) {
      const w = parts.find((p) => p.part.id === ids[0])!;
      issues.push({ key: 'duplicate', params: { name: w.part.name, n: ids.length }, parts: ids, severity: 'warning' });
    }
  const noGeom = parts.filter((w) => !w.lines.length && !w.rosettes.length && w.cls.kind !== 'coupler');
  if (noGeom.length) issues.push({ key: 'noGeometry', params: { n: noGeom.length, names: [...new Set(noGeom.map((w) => w.part.name))].join(', ') }, parts: noGeom.map((w) => w.part.id), severity: 'warning' });
  if (doc.aecParts) issues.push({ key: 'aecParts', params: { n: doc.aecParts }, parts: [], severity: 'warning' });
  const unknown = parts.filter((w) => w.cls.kind === 'other');
  if (unknown.length) issues.push({ key: 'unknownParts', params: { n: unknown.length, names: [...new Set(unknown.map((w) => w.part.name))].join(', ') }, parts: unknown.map((w) => w.part.id), severity: 'info' });

  const { moves, checks: healChecks } = healParts(parts, opt.tol, opt.maxFollow);
  for (const c of healChecks) {
    const w = parts.find((q) => q.part.id === c.root)!;
    issues.push({ key: 'healCheck', params: { name: w.part.name, n: c.parts.length - 1 }, parts: c.parts, severity: 'warning' });
  }
  if (moves.length) {
    const dmax = Math.max(...moves.map((m) => Math.hypot(...m.d)));
    issues.push({ key: 'healed', params: { n: moves.length, d: Math.round(dmax * 1000) }, parts: moves.map((m) => m.id), severity: 'info' });
  }
  const columns = buildColumns(parts);

  // ledgers: both ends at a standard (or carried by another part)
  const carriers = parts.filter((w) => w.cls.kind === 'accessory' || w.cls.kind === 'ledger' || w.cls.kind === 'beam' || w.cls.kind === 'bracket');
  const free = parts.filter((w) => {
    if (w.cls.kind !== 'ledger') return false;
    const hs = w.lines.filter(([a, b]) => isHor(a, b) && Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.2);
    if (!hs.length) return false;
    const [a, b] = hs.reduce((p, q) => (Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) > Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]) ? q : p));
    const at = (p: V3) =>
      columns.some((c) => Math.hypot(c.x - p[0], c.y - p[1]) < 0.1 && p[2] > c.z0 - 0.1 && p[2] < c.z1 + 0.1) ||
      // ledger receiver UHA (ledger on ledger) or a ledger / beam / bracket just below the end
      carriers.some((q) => q !== w && p[0] > q.min[0] - 0.12 && p[0] < q.max[0] + 0.12 && p[1] > q.min[1] - 0.12 && p[1] < q.max[1] + 0.12 && p[2] > q.min[2] - 0.05 && p[2] < q.max[2] + 0.35);
    return !at(a) || !at(b);
  });
  if (free.length) issues.push({ key: 'ledgerFree', params: { n: free.length }, parts: free.map((w) => w.part.id), severity: 'info' });
  const anchors = findAnchors(parts, columns);
  if (anchors.length)
    issues.push({ key: 'anchors', params: { n: anchors.length }, parts: anchors.flatMap((a) => [a.id, ...a.couplers, ...a.flange]), severity: 'info' });
  if (columns.length && !parts.some((w) => w.cls.kind === 'diagonal'))
    issues.push({ key: 'noDiagonals', parts: [], severity: 'warning' });

  // lattice girders
  const girders: Girder[] = [];
  let n = 0;
  for (const chain of flexChains(parts)) {
    const g = flexGirder(chain, `T${n + 1}`);
    if (g) {
      girders.push(g);
      n++;
    } else issues.push({ key: 'flexChain', parts: chain.map((w) => w.part.id), severity: 'warning' });
  }
  for (const w of parts)
    if (w.cls.kind === 'girder' && w.cls.girder && w.lines.length) {
      girders.push(oneGirder(w, `T${n + 1}`));
      n++;
    }
  // order: by height, then along x, y
  girders.sort((a, b) => a.zBottom - b.zBottom || a.origin[0] - b.origin[0] || a.origin[1] - b.origin[1]);
  girders.forEach((g, k) => (g.key = `T${k + 1}`));
  for (const g of girders) {
    findSupports(g, columns);
    findLoads(g, parts);
  }

  const bomMap = new Map<string, BomRow>();
  for (const w of parts) {
    const r = bomMap.get(w.part.article);
    if (r) r.count++;
    else bomMap.set(w.part.article, { article: w.part.article, weight: partKg(w.part), name: w.part.name, desc: w.part.desc, count: 1, kind: classifyPart(w.part.article, w.part.name, w.part.desc).kind });
  }
  const order = PART_KINDS;
  const bom = [...bomMap.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.name.localeCompare(b.name));

  const all = parts.flatMap((w) => [w.min, w.max]);
  const min: V3 = [0, 1, 2].map((i) => Math.min(...all.map((p) => p[i]))) as V3;
  const max: V3 = [0, 1, 2].map((i) => Math.max(...all.map((p) => p[i]))) as V3;
  return { parts, columns, anchors, girders, bom, issues, moves, min, max };
}

/**
 * Anchors as PERI CAD draws them: a scaffold tube with a coupler (RA / SW) at a standard on one end
 * and a flange coupler (UEC / UEF) on the steel beam of the structure — or nothing, the structure
 * itself is usually not drawn — on the other end. Tubes with standards at both ends are bracing.
 * The tubes of anchors get the kind "anchor".
 */
function findAnchors(parts: WorldPart[], columns: Column[]): Anchor[] {
  const couplers = parts.filter((w) => w.cls.kind === 'coupler');
  const isFlange = (w: WorldPart) => /\bUE[CF]\b|flansch|flange/i.test(`${w.part.name} ${w.part.desc}`);
  const pos = (w: WorldPart): V3 => [w.part.m[3], w.part.m[7], w.part.m[11]];
  const near = (p: V3, q: V3, r: number) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= r;
  const colAt = (p: V3) => columns.find((c) => Math.hypot(c.x - p[0], c.y - p[1]) <= 0.25 && p[2] >= c.z0 - 0.1 && p[2] <= c.z1 + 0.1);
  const out: Anchor[] = [];
  for (const w of parts) {
    if (w.cls.kind !== 'tube' || !w.lines.length) continue;
    const [a, b] = w.lines.reduce((p, q) => (Math.hypot(...q[1].map((v, i) => v - q[0][i])) > Math.hypot(...p[1].map((v, i) => v - p[0][i])) ? q : p));
    for (const [s, e] of [
      [a, b],
      [b, a],
    ] as [V3, V3][]) {
      const cs = couplers.filter((c) => !isFlange(c) && near(pos(c), s, 0.2));
      if (!cs.length || !colAt(s)) continue;
      const fl = couplers.filter((c) => isFlange(c) && near(pos(c), e, 0.25));
      // the other end: on the structure (flange coupler) or free; at a standard it is a brace
      if (!fl.length && colAt(e)) continue;
      out.push({ id: w.part.id, couplers: cs.map((c) => c.part.id), flange: fl.map((c) => c.part.id), atStandard: s, atStructure: e, length: Math.hypot(e[0] - s[0], e[1] - s[1]) });
      w.cls = { kind: 'anchor' };
      break;
    }
  }
  return out;
}

export interface LoadOptions {
  /** service load, N/m² */
  p: number;
  /** self weight of the decks, N/m² */
  g: number;
}

/** girder name for lists, e.g. "ULS Flex 50 + 150 + 150 + 50" */
export function girderDesignation(g: Girder): string {
  if (g.product === 'ULSFLEX') return `ULS Flex 50 + ${(g.flex ?? []).map((e) => Math.round(e * 100)).join(' + ')} + 50`;
  return `${LATTICE_TYPES[g.product].name} ${Math.round(g.L * 100)}`;
}

/** beam model of a girder for the beam calculator */
export function girderBeamModel(g: Girder, opt: LoadOptions, fileName = ''): BeamModel {
  const m = baseModel(g.L, `${g.key} ${girderDesignation(g)}`);
  m.segments[0].section = { kind: 'peri', product: g.product, lattice: g.flex ? { flex: g.flex } : {} };
  m.segments[0].material = periMaterial(g.product);
  m.settings.selfWeight = true;
  m.supports = g.supports.map((x, k) => makeSupport(k === 0 ? 'pinned' : 'roller', x));
  const loads: Load[] = [];
  for (const l of g.loads) {
    const b = l.span / 2;
    if (opt.g > 0) loads.push(udl('G', l.s1, l.s2, (opt.g * b) / 1e3));
    if (opt.p > 0) loads.push(udl('Q', l.s1, l.s2, (opt.p * b) / 1e3));
  }
  m.loads = loads;
  m.description = [
    fileName && `PERI CAD: ${fileName}`,
    `${g.key}`,
    `z = ${g.zBottom.toFixed(3)}…${g.zTop.toFixed(3)} m`,
    `${g.parts.length} Teile`,
  ]
    .filter(Boolean)
    .join(' · ');
  return m;
}
