/**
 * A section of a PERI UP scaffold drawn in the designer (side view, x horizontal, z up): the parts and
 * where they snap, the decks with their field width and working load, anchors and supports; and the
 * drawing made of it for the analysis of the scaffold mode (as if it came from PERI CAD).
 */
import type { PartGeom, ScaffoldDoc, ScaffoldPart, V3 } from '../scaffold/pericad';
import type { UserFixing, UserLoad } from '../scaffold/userLoads';
import { LOAD_CLASSES } from '../scaffold/catalog';
import { CATALOG, COUPLER, HEAD, ON_SPIGOT, SPIGOT, UVB_H, byArticle, partGeom, tubeArticle, type CatalogPart } from './catalog';

export interface Placed {
  id: string;
  article: string;
  /**
   * standard / base: axis and bottom; jack: axis and base plate; ledger: axis of the left standard and
   * the rosette; bracket: axis of its standard and the rosette; diagonal: axis and rosette of the lower
   * end; tube: first end; spigot: point on the ledger (its rosette height)
   */
  x: number;
  z: number;
  /** bracket: towards +x (1) or −x (−1); diagonal: the upper end towards +x (1) or −x (−1) */
  dir?: 1 | -1;
  /** tube: second end */
  x2?: number;
  z2?: number;
  /** jack: base plate to the bottom of the standard on it, m */
  ext?: number;
  /** ledger / bracket: decks on it */
  deck?: { width: number; work: boolean };
}

export interface DesignAnchor {
  id: string;
  /** the standard and the height of the anchor */
  part: string;
  z: number;
  /** design resistance, N (optional) */
  limit?: number;
}

export interface DesignSettings {
  /** load class EN 12811-1 (service load on the working decks) */
  loadClass: number;
  /** self weight of the decks, N/m² */
  g: number;
  /** field width given to new decks (length of the decks across the section), m */
  field: number;
  /** outdoors (working wind 0.2 kN/m² and the maximum wind) or indoors (notional horizontal load) */
  outdoor: boolean;
  /** peak velocity pressure of the maximum wind, N/m² (0: no out-of-service combinations) */
  qMax: number;
}

export interface Design {
  name: string;
  parts: Placed[];
  anchors: DesignAnchor[];
  settings: DesignSettings;
}

export const DEFAULT_SETTINGS: DesignSettings = { loadClass: 3, g: 300, field: 2.5, outdoor: true, qMax: 0 };

export const emptyDesign = (): Design => ({ name: '', parts: [], anchors: [], settings: { ...DEFAULT_SETTINGS } });

const EPS = 0.006;
const near = (a: number, b: number, t = EPS) => Math.abs(a - b) <= t;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export const cat = (p: Placed): CatalogPart => byArticle.get(p.article)!;

// ---------------------------------------------------------------- geometry of the placed parts

/** standards and base standards: axis, bottom, top (system), rosettes (absolute heights) */
export interface StandardInfo {
  part: Placed;
  x: number;
  z0: number;
  z1: number;
  rosettes: number[];
  spigot: boolean;
}

export function standards(d: Design): StandardInfo[] {
  return d.parts
    .filter((p) => cat(p)?.kind === 'standard' || cat(p)?.kind === 'base')
    .map((p) => {
      const c = cat(p);
      return { part: p, x: p.x, z0: p.z, z1: r3(p.z + c.L), rosettes: (c.rosettes ?? []).map((r) => r3(p.z + r)), spigot: !!c.spigot };
    });
}

/** all rosettes of the section: (x, z) and their standard */
export function rosettes(d: Design): { x: number; z: number; std: string }[] {
  return standards(d).flatMap((s) => s.rosettes.map((z) => ({ x: s.x, z, std: s.part.id })));
}

/** points a standard can stand on: top of a standard / base, jack, bracket spigot, spigot on a ledger */
export function seats(d: Design): { x: number; z: number; by: string }[] {
  const out: { x: number; z: number; by: string }[] = [];
  for (const p of d.parts) {
    const c = cat(p);
    if (!c) continue;
    if ((c.kind === 'standard' || c.kind === 'base') && c.spigot) out.push({ x: p.x, z: r3(p.z + c.L), by: p.id });
    else if (c.kind === 'jack') out.push({ x: p.x, z: r3(p.z + (p.ext ?? 0.2)), by: p.id });
    else if (c.kind === 'bracket' && c.bracketSpigot) out.push({ x: r3(p.x + (p.dir ?? 1) * c.L), z: r3(p.z + ON_SPIGOT), by: p.id });
    else if (c.kind === 'spigot') out.push({ x: p.x, z: r3(p.z + ON_SPIGOT), by: p.id });
  }
  return out;
}

/** end points of a part in the side view (for drawing and hit tests) */
export function ends(p: Placed): [number, number, number, number] {
  const c = cat(p);
  switch (c.kind) {
    case 'standard':
    case 'base':
      return [p.x, p.z, p.x, p.z + c.L];
    case 'jack':
      return [p.x, p.z, p.x, p.z + (p.ext ?? 0.2)];
    case 'ledger':
      return [p.x, p.z, p.x + c.L, p.z];
    case 'bracket':
      return [p.x, p.z, p.x + (p.dir ?? 1) * c.L, p.z];
    case 'diagonal':
      return [p.x, p.z, p.x + (p.dir ?? 1) * c.L, p.z + (c.H ?? 2)];
    case 'tube':
      return [p.x, p.z, p.x2 ?? p.x, p.z2 ?? p.z];
    case 'spigot':
      return [p.x, p.z, p.x, p.z + ON_SPIGOT];
  }
}

// ---------------------------------------------------------------- snapping

/** a candidate placement of a catalogue part and how far it is from the pointer */
export interface Candidate {
  part: Omit<Placed, 'id'>;
  d: number;
  /** the placement is possible (false: shown in red with the reason) */
  ok: boolean;
  why?: string;
}

const segDist = (px: number, pz: number, [ax, az, bx, bz]: [number, number, number, number]) => {
  const dx = bx - ax;
  const dz = bz - az;
  const L2 = dx * dx + dz * dz;
  const t = L2 ? Math.min(Math.max(((px - ax) * dx + (pz - az) * dz) / L2, 0), 1) : 0;
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
};

/** rosette grid of the section: the heights of the rosettes repeat every 0.5 m */
function gridZ(d: Design, z: number, first: number): number {
  const ros = rosettes(d);
  if (!ros.length) return Math.max(0, Math.round(z / 0.05) * 0.05);
  // bottom such that the rosettes of the new standard lie on the levels of the others
  const ref = ros[0].z - first;
  return r3(ref + Math.round((z - ref) / 0.5) * 0.5);
}

/** x of a new standard or jack: 0.25 m steps from the nearest standard or jack (the system lengths of the
 * ledgers), else on a 5 cm grid */
function gridX(d: Design, px: number): number {
  const xs = d.parts.filter((p) => ['standard', 'base', 'jack'].includes(cat(p)?.kind)).map((p) => p.x);
  if (!xs.length) return r3(Math.round(px / 0.05) * 0.05);
  const ref = xs.reduce((a, b) => (Math.abs(b - px) < Math.abs(a - px) ? b : a));
  return r3(ref + Math.round((px - ref) / 0.25) * 0.25);
}

/**
 * Where a catalogue part goes for the pointer at (px, pz): the nearest snap of its kind, or null.
 * `reach`: largest distance from the pointer, m.
 */
export function snap(d: Design, c: CatalogPart, px: number, pz: number, reach = 0.6): Candidate | null {
  const cands: Candidate[] = [];
  const stds = standards(d);
  const occupied = (x: number, z: number) => stds.some((s) => near(s.x, x, 0.02) && s.z0 < z + 0.01 && s.z0 > z - 0.01);
  switch (c.kind) {
    case 'standard':
    case 'base': {
      const first = c.kind === 'base' ? 0.12 : (c.rosettes?.[0] ?? 0.38);
      for (const s of seats(d)) {
        if (occupied(s.x, s.z)) continue;
        cands.push({ part: { article: c.article, x: s.x, z: s.z }, d: Math.hypot(px - s.x, pz - (s.z + c.L / 2)) * 0.6, ok: true });
      }
      // free: on the rosette grid of the others, 0.25 m steps from them (lengths of the ledgers)
      const x = gridX(d, px);
      const z = gridZ(d, pz - c.L / 2, first);
      cands.push({ part: { article: c.article, x: r3(x), z: Math.max(z, 0) }, d: reach * 0.95, ok: true });
      break;
    }
    case 'jack': {
      // under a standard that stands on nothing, else free on the ground
      for (const s of stds) {
        if (seats(d).some((q) => near(q.x, s.x, 0.02) && near(q.z, s.z0, 0.02))) continue;
        const ext = Math.min(Math.max(s.z0 - Math.max(0, s.z0 - 0.2), 0.05), c.ext ?? 0.3);
        cands.push({ part: { article: c.article, x: s.x, z: r3(s.z0 - ext), ext: r3(ext) }, d: Math.hypot(px - s.x, pz - s.z0), ok: true });
      }
      cands.push({ part: { article: c.article, x: gridX(d, px), z: 0, ext: 0.2 }, d: reach * 0.95, ok: true });
      break;
    }
    case 'ledger': {
      const ros = rosettes(d);
      for (const r of ros) {
        const other = ros.find((q) => near(q.x, r.x + c.L) && near(q.z, r.z));
        if (!other) continue;
        if (d.parts.some((p) => cat(p)?.kind === 'ledger' && near(p.x, r.x) && near(p.z, r.z) && near(cat(p).L, c.L))) continue;
        cands.push({ part: { article: c.article, x: r.x, z: r.z, deck: { width: d.settings.field, work: false } }, d: segDist(px, pz, [r.x, r.z, r.x + c.L, r.z]), ok: true });
      }
      break;
    }
    case 'bracket': {
      for (const r of rosettes(d)) {
        const dir: 1 | -1 = px >= r.x ? 1 : -1;
        cands.push({ part: { article: c.article, x: r.x, z: r.z, dir, deck: { width: d.settings.field, work: false } }, d: segDist(px, pz, [r.x, r.z, r.x + dir * c.L, r.z]), ok: true });
      }
      break;
    }
    case 'diagonal': {
      const ros = rosettes(d);
      for (const r of ros)
        for (const dir of [1, -1] as const) {
          const up = ros.find((q) => near(q.x, r.x + dir * c.L) && near(q.z, r.z + (c.H ?? 2)));
          if (!up) continue;
          cands.push({ part: { article: c.article, x: r.x, z: r.z, dir }, d: segDist(px, pz, [r.x, r.z, up.x, up.z]), ok: true });
        }
      break;
    }
    case 'spigot': {
      for (const p of d.parts) {
        const pc = cat(p);
        if (pc?.kind !== 'ledger') continue;
        // on the ledger at a quarter metre from its standards
        for (let s = 0.25; s < pc.L - 0.1; s += 0.25) cands.push({ part: { article: c.article, x: r3(p.x + s), z: p.z }, d: Math.hypot(px - p.x - s, pz - p.z), ok: true });
      }
      break;
    }
    case 'tube':
      // tubes are drawn by two points (tubePoint)
      break;
  }
  const best = cands.filter((x) => x.d <= reach).sort((a, b) => a.d - b.d)[0];
  return best ?? null;
}

/** a point of a tube: on the axis of a standard (to 5 cm), else null */
export function tubePoint(d: Design, px: number, pz: number): { x: number; z: number; std: string } | null {
  let best: { x: number; z: number; std: string; d: number } | null = null;
  for (const s of standards(d)) {
    const z = Math.min(Math.max(Math.round(pz / 0.05) * 0.05, s.z0 + 0.05), s.z1);
    const dd = Math.hypot(px - s.x, pz - z);
    if (dd < 0.4 && (!best || dd < best.d)) best = { x: s.x, z: r3(z), std: s.part.id, d: dd };
  }
  return best && { x: best.x, z: best.z, std: best.std };
}

/** the part nearest to the pointer (for selecting), within `reach` */
export function hit(d: Design, px: number, pz: number, reach = 0.15): Placed | null {
  let best: { p: Placed; d: number } | null = null;
  for (const p of d.parts) {
    const dd = segDist(px, pz, ends(p));
    if (dd <= reach && (!best || dd < best.d)) best = { p, d: dd };
  }
  return best?.p ?? null;
}

// ---------------------------------------------------------------- checks of the section

/** parts holding a standard at its rosettes or along its axis: ledgers, brackets, diagonals, tubes */
export function holders(d: Design, s: StandardInfo): string[] {
  const out: string[] = [];
  const onRos = (x: number, z: number) => near(x, s.x) && s.rosettes.some((r) => near(r, z));
  for (const p of d.parts) {
    const c = cat(p);
    if (!c || p.id === s.part.id) continue;
    const [x0, z0, x1, z1] = ends(p);
    if (c.kind === 'ledger' && (onRos(x0, z0) || onRos(x1, z1))) out.push(p.id);
    else if (c.kind === 'bracket' && onRos(x0, z0)) out.push(p.id);
    else if (c.kind === 'diagonal' && (onRos(x0, z0) || onRos(x1, z1))) out.push(p.id);
    else if (c.kind === 'tube' && [[x0, z0], [x1, z1]].some(([x, z]) => near(x, s.x) && z >= s.z0 - 0.01 && z <= s.z1 + 0.01)) out.push(p.id);
  }
  return out;
}

/**
 * standards that stand on nothing (neither on a seat nor on the ground) but hang on two or more parts:
 * the post of a bracket built from a diagonal and a ledger
 */
export function hangingStandards(d: Design): string[] {
  const st = seats(d);
  return standards(d)
    .filter((s) => s.z0 > 0.001 && !st.some((q) => near(q.x, s.x, 0.02) && near(q.z, s.z0, 0.02)) && holders(d, s).length >= 2)
    .map((s) => s.part.id);
}

export interface DesignIssue {
  key: string;
  parts: string[];
  severity: 'error' | 'warning';
}

/** what the section misses before it can be calculated */
export function designIssues(d: Design): DesignIssue[] {
  const out: DesignIssue[] = [];
  const stds = standards(d);
  if (!stds.length) return [{ key: 'noStandards', parts: [], severity: 'error' }];
  const st = seats(d);
  // standards on nothing: on a support only if they stand on a jack or on the ground
  const hang = new Set(hangingStandards(d));
  const loose = stds.filter((s) => s.z0 > 0.001 && !hang.has(s.part.id) && !st.some((q) => near(q.x, s.x, 0.02) && near(q.z, s.z0, 0.02)));
  if (loose.length) out.push({ key: 'floating', parts: loose.map((s) => s.part.id), severity: 'error' });
  const decks = d.parts.filter((p) => p.deck);
  if (!decks.length) out.push({ key: 'noDecks', parts: [], severity: 'warning' });
  else if (!decks.some((p) => p.deck!.work)) out.push({ key: 'noWork', parts: [], severity: 'warning' });
  if (!d.parts.some((p) => cat(p)?.kind === 'diagonal' || cat(p)?.kind === 'tube') && !d.anchors.length) out.push({ key: 'noBracing', parts: [], severity: 'warning' });
  return out;
}

// ---------------------------------------------------------------- the drawing for the analysis

const ROT_X = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const ROT_Y = [0, -1, 0, 1, 0, 0, 0, 0, 1];
const ROT_NX = [-1, 0, 0, 0, -1, 0, 0, 0, 1];
const mat = (R: number[], t: V3) => [R[0], R[1], R[2], t[0], R[3], R[4], R[5], t[1], R[6], R[7], R[8], t[2]];

export interface DesignDoc {
  doc: ScaffoldDoc;
  loads: UserLoad[];
  fixings: UserFixing[];
  /** standards hanging on their ledgers and diagonals (no support under them) */
  hanging: string[];
}

/**
 * The section as a drawing of PERI CAD (parts with their system geometry) with the loads of its decks
 * (line loads on the ledgers and brackets: self weight and working load times the field width) and
 * its anchors (fixings in x). The analysis holds it out of its plane (ModelOptions.plane).
 */
export function designDoc(d: Design): DesignDoc {
  const parts: ScaffoldPart[] = [];
  const geom: Record<string, PartGeom> = {};
  const add = (id: string, c: { article: string; name: string; desc: string }, m: number[], g?: PartGeom) => {
    parts.push({ id, article: c.article, name: c.name, desc: c.desc, layer: 'DESIGN', m, ...(g ? { geom: g } : {}) });
  };
  for (const p of d.parts) {
    const c = cat(p);
    if (!c) continue;
    if (c.kind !== 'tube') geom[c.article] ??= partGeom(c);
    switch (c.kind) {
      case 'standard':
      case 'base':
        add(p.id, c, mat(ROT_Y, [p.x + 0.08, -0.08, p.z]));
        break;
      case 'jack':
        // its own spindle length: the extension decides where the standard on it begins
        add(p.id, c, mat(ROT_X, [p.x - 0.075, -0.075, p.z]), partGeom(c, Math.max(c.L, (p.ext ?? 0.2) + 0.2)));
        break;
      case 'ledger':
        add(p.id, c, mat(ROT_X, [p.x + HEAD.ledger, -0.015, p.z]));
        break;
      case 'bracket':
        add(p.id, c, (p.dir ?? 1) > 0 ? mat(ROT_X, [p.x, -0.015, p.z]) : mat(ROT_NX, [p.x, 0.015, p.z]));
        break;
      case 'diagonal':
        add(p.id, c, (p.dir ?? 1) > 0 ? mat(ROT_X, [p.x + HEAD.ubk, -0.05, p.z]) : mat(ROT_NX, [p.x - HEAD.ubk, 0.05, p.z]));
        break;
      case 'spigot':
        add(p.id, c, mat(ROT_X, [p.x, 0, p.z]));
        break;
      case 'tube': {
        const x2 = p.x2 ?? p.x;
        const z2 = p.z2 ?? p.z;
        // beside the standards; its couplers at both ends
        const L = Math.hypot(x2 - p.x, z2 - p.z);
        if (L < 0.05) break;
        const cs = (x2 - p.x) / L;
        const sn = (z2 - p.z) / L;
        const t = tubeArticle(L);
        add(p.id, { article: t.article, name: t.name, desc: t.name }, mat([cs, 0, -sn, 0, 1, 0, sn, 0, cs], [p.x, 0.06, p.z]), partGeom(c, L));
        add(`${p.id}.c1`, COUPLER, mat(ROT_X, [p.x, 0.06, p.z]));
        add(`${p.id}.c2`, COUPLER, mat(ROT_X, [x2, 0.06, z2]));
        break;
      }
    }
  }
  geom[COUPLER.article] ??= { lines: [], rosettes: [] };
  // decks: self weight on all, working load where it works (line loads along the ledger / bracket)
  const loads: UserLoad[] = [];
  const q = (LOAD_CLASSES[d.settings.loadClass] ?? 2) * 1e3;
  for (const p of d.parts) {
    if (!p.deck || p.deck.width <= 0) continue;
    loads.push({ id: `${p.id}.g`, name: `G ${p.id}`, case: 'G', kind: 'line', value: d.settings.g * p.deck.width, at: 0.5, parts: [p.id] });
    if (p.deck.work) {
      loads.push({ id: `${p.id}.q`, name: `Q ${p.id}`, case: 'Q', kind: 'line', value: q * p.deck.width, at: 0.5, parts: [p.id] });
      // indoors: notional horizontal load 2.5 % of the working load (EN 12811-1, 6.2.5.2), in the
      // direction of each working combination
      if (!d.settings.outdoor) loads.push({ id: `${p.id}.h`, name: `H ${p.id}`, case: 'Q', kind: 'line', value: 0.025 * q * p.deck.width, at: 0.5, parts: [p.id], dir: 'x', when: 'work' });
    }
  }
  const stdById = new Map(standards(d).map((s) => [s.part.id, s]));
  const fixings: UserFixing[] = [];
  for (const a of d.anchors) {
    const s = stdById.get(a.part);
    if (!s) continue;
    const len = s.z1 - s.z0 + (s.spigot && cat(s.part).kind === 'standard' ? SPIGOT : 0);
    const base = cat(s.part).kind === 'base' ? UVB_H : len;
    fixings.push({ id: a.id, name: a.id, parts: [a.part], at: Math.min(Math.max((a.z - s.z0) / base, 0), 1), dirs: ['x'], ...(a.limit ? { limit: a.limit } : {}) });
  }
  return { doc: { fileName: d.name || 'design', parts, geom }, loads, fixings, hanging: hangingStandards(d) };
}

/** the lines of the parts in the side view (x, z), from the same geometry as the drawing for the analysis */
export function sideLines(doc: ScaffoldDoc): Map<string, [number, number, number, number][]> {
  const out = new Map<string, [number, number, number, number][]>();
  for (const p of doc.parts) {
    const g = p.geom ?? doc.geom[p.article];
    if (!g) continue;
    const m = p.m;
    const X = (v: V3) => m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3];
    const Z = (v: V3) => m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11];
    // couplers belong to their tube
    const id = p.id.replace(/\.c\d$/, '');
    const list = out.get(id) ?? [];
    for (const [a, b] of g.lines) list.push([X(a), Z(a), X(b), Z(b)]);
    out.set(id, list);
  }
  return out;
}

/** example: section of a facade scaffold, two standards 0.75 m apart, 4 m, bracket inside, two anchors */
export function exampleDesign(): Design {
  const d = emptyDesign();
  d.name = 'Fassadengerüst 0,75 m';
  let n = 0;
  const place = (name: string, px: number, pz: number) => {
    const c = snap(d, CATALOG.find((x) => x.name === name)!, px, pz);
    if (c) d.parts.push({ id: `D${++n}`, ...c.part });
  };
  for (const x of [0, 0.75]) {
    place('UJB 38-50/30', x, 0);
    place('UVB 24', x, 0.3);
    place('UVR 200', x, 1.4);
    place('UVR 200', x, 3.4);
  }
  const levels = [...new Set(rosettes(d).map((r) => r.z))].sort((a, b) => a - b);
  const l2 = levels.find((v) => v > 1.9)!;
  const l4 = levels.find((v) => v > 3.9)!;
  for (const z of [levels[0], l2, l4]) place('UH 75 Plus', 0.375, z);
  for (const p of d.parts) if (p.deck && p.z > 1) p.deck.work = p.z === l4;
  place('UCM 50 mit Zapfen', -0.25, l2);
  place('UCM 50 mit Zapfen', -0.25, l4);
  const inner = d.parts.filter((p) => p.x === 0 && p.article === '100009');
  d.anchors.push({ id: 'A1', part: inner.find((p) => p.z < 2)!.id, z: l2 });
  d.anchors.push({ id: 'A2', part: inner.find((p) => p.z > 2)!.id, z: l4 });
  return d;
}

/** parts list of the section: article, name, count, weight */
export function designBom(d: Design): { article: string; name: string; count: number; kg?: number }[] {
  const rows = new Map<string, { article: string; name: string; count: number; kg?: number }>();
  const put = (article: string, name: string, kg?: number, n = 1) => {
    const r = rows.get(article) ?? { article, name, count: 0, kg };
    r.count += n;
    rows.set(article, r);
  };
  for (const p of d.parts) {
    const c = cat(p);
    if (!c) continue;
    if (c.kind === 'tube') {
      const L = Math.hypot((p.x2 ?? p.x) - p.x, (p.z2 ?? p.z) - p.z);
      const t = tubeArticle(L);
      put(t.article, t.name, 3.55 * Math.max(L, 0.1));
      put(COUPLER.article, COUPLER.desc, 1.12, 2);
    } else put(c.article, c.desc, c.kg);
  }
  return [...rows.values()].sort((a, b) => a.article.localeCompare(b.article));
}

export { CATALOG };
