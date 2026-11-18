/**
 * A section of a PERI UP scaffold drawn in the designer (side view, x horizontal, z up): the parts and
 * where they snap, the decks with their field width and working load, anchors and supports; and the
 * drawing made of it for the analysis of the scaffold mode (as if it came from PERI CAD).
 */
import type { PartGeom, ScaffoldDoc, ScaffoldPart, V3 } from '../scaffold/pericad';
import type { UserFixing, UserLoad } from '../scaffold/userLoads';
import { LOAD_CLASSES } from '../scaffold/catalog';
import { CATALOG, COUPLER, HEAD, ON_SPIGOT, SPIGOT, UBL_DZ, UVB_H, byArticle, partGeom, tubeArticle, type CatalogPart } from './catalog';

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
  /**
   * diagonal: side of the rosettes it is wedged on (1: front, −1: back): two diagonals of a bay on both
   * sides of the rosettes make a double diagonal (UBK can be fixed so)
   */
  side?: 1 | -1;
  /** tube: second end */
  x2?: number;
  z2?: number;
  /** jack: base plate to the bottom of the standard on it, m */
  ext?: number;
  /** ledger / bracket: decks on it */
  deck?: { width: number; work: boolean; /** load class EN 12811-1 of this deck (kept with it; without: the class of the settings) */ cls?: number };
}

export interface DesignAnchor {
  id: string;
  /** the standard and the height of the anchor */
  part: string;
  z: number;
  /**
   * side of the building (wall) in the side view: 180 – on the left (←), 0 – on the right (→);
   * undefined: away from the middle of the section (older sections)
   */
  angle?: number;
  /** design resistance, N (optional) */
  limit?: number;
}

/** sides of the wall an anchor goes to: left (180°), right (0°) */
export const ANCHOR_ANGLES = [180, 0];

/** direction of an anchor as drawn: its angle, else horizontal away from the middle of the section */
export function anchorAngle(d: Design, a: DesignAnchor): number {
  if (a.angle !== undefined) return ((a.angle % 360) + 360) % 360;
  const xs = standards(d).map((s) => s.x);
  const x = standards(d).find((s) => s.part.id === a.part)?.x ?? 0;
  return x <= (Math.min(...xs) + Math.max(...xs)) / 2 ? 180 : 0;
}

export interface DesignSettings {
  /** load class EN 12811-1 given to new decks (each deck keeps its own) */
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
    case 'ubl': {
      // x: axis of the left standard of the bay, z: rosette of the lower ledger; the ends on the ledgers
      const a = p.x + HEAD.ubl;
      const b = p.x + c.L - HEAD.ubl;
      return (p.dir ?? 1) > 0 ? [a, p.z + UBL_DZ, b, p.z + (c.H ?? 2) + UBL_DZ] : [b, p.z + UBL_DZ, a, p.z + (c.H ?? 2) + UBL_DZ];
    }
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
function gridZ(d: Design, z: number, first: number, px: number): number {
  const stds = standards(d).filter((s) => s.rosettes.length);
  if (!stds.length) return Math.max(0, Math.round(z / 0.05) * 0.05);
  // bottom such that the rosettes of the new standard lie on the levels of the nearest standard (its
  // top rosette: UVB 49 has one more 0.25 m below the grid)
  const near1 = stds.reduce((a, b) => (Math.abs(b.x - px) < Math.abs(a.x - px) ? b : a));
  const ref = near1.rosettes[near1.rosettes.length - 1] - first;
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
      const z = gridZ(d, pz - c.L / 2, c.kind === 'base' ? (c.rosettes?.[c.rosettes.length - 1] ?? 0.12) : first, px);
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
        cands.push({ part: { article: c.article, x: r.x, z: r.z, deck: { width: d.settings.field, work: false, cls: d.settings.loadClass } }, d: segDist(px, pz, [r.x, r.z, r.x + c.L, r.z]), ok: true });
      }
      break;
    }
    case 'bracket': {
      for (const r of rosettes(d)) {
        const dir: 1 | -1 = px >= r.x ? 1 : -1;
        cands.push({ part: { article: c.article, x: r.x, z: r.z, dir, deck: { width: d.settings.field, work: false, cls: d.settings.loadClass } }, d: segDist(px, pz, [r.x, r.z, r.x + dir * c.L, r.z]), ok: true });
      }
      break;
    }
    case 'diagonal': {
      const ros = rosettes(d);
      for (const r of ros)
        for (const dir of [1, -1] as const) {
          const up = ros.find((q) => near(q.x, r.x + dir * c.L) && near(q.z, r.z + (c.H ?? 2)));
          if (!up) continue;
          // a diagonal of the bay on the front already: this one on the back of the rosettes (double)
          const there = d.parts.filter((p) => cat(p)?.kind === 'diagonal' && near(p.x, r.x) && near(p.z, r.z) && (p.dir ?? 1) === dir && near(cat(p).L, c.L) && near(cat(p).H ?? 2, c.H ?? 2));
          if (there.length >= 2) continue;
          const side: 1 | -1 = there.length && (there[0].side ?? 1) === 1 ? -1 : 1;
          cands.push({ part: { article: c.article, x: r.x, z: r.z, dir, ...(side < 0 ? { side } : {}) }, d: segDist(px, pz, [r.x, r.z, up.x, up.z]), ok: true });
        }
      break;
    }
    case 'ubl': {
      // a ledger diagonal sits on two ledgers of the same bay (not on brackets nor on the ledger of a
      // bracket built from a diagonal: no hanging standard in the bay)
      const hang = new Set(hangingStandards(d));
      const stdAt = (x: number) => standards(d).filter((s) => near(s.x, x, 0.01));
      const ledgers = d.parts.filter((p) => cat(p)?.kind === 'ledger' && near(cat(p).L, c.L));
      for (const lo of ledgers) {
        const up = ledgers.find((q) => near(q.x, lo.x) && near(q.z, lo.z + (c.H ?? 2)));
        if (!up) continue;
        if ([...stdAt(lo.x), ...stdAt(lo.x + c.L)].some((s) => hang.has(s.part.id))) continue;
        for (const dir of [1, -1] as const) {
          if (d.parts.some((p) => cat(p)?.kind === 'ubl' && near(p.x, lo.x) && near(p.z, lo.z) && (p.dir ?? 1) === dir)) continue;
          const part = { article: c.article, x: lo.x, z: lo.z, dir };
          cands.push({ part, d: segDist(px, pz, ends({ ...part, id: '' })), ok: true });
        }
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
  if (!d.parts.some((p) => ['diagonal', 'ubl', 'tube'].includes(cat(p)?.kind)) && !d.anchors.length) out.push({ key: 'noBracing', parts: [], severity: 'warning' });
  return out;
}

// ---------------------------------------------------------------- loads of the decks

/** working load of the deck of a part, N/m² (its own load class, else that of the settings) */
export const deckClass = (d: Design, p: Placed) => p.deck?.cls ?? d.settings.loadClass;
export const deckLoad = (d: Design, p: Placed) => (LOAD_CLASSES[deckClass(d, p)] ?? 2) * 1e3;

/** velocity pressure of the working wind (EN 12811-1, 6.2.7.4.2), N/m², and the force coefficient */
export const WORK_WIND = 200;
const WIND_CF = 1.2;

export interface LevelLoads {
  z: number;
  /** the decked part the horizontal loads of the level act along */
  on: Placed;
  /** wind on the level in service, N: band of 0.4 m at a working level (equipment and material, EN
   * 12811-1 6.2.7.4.2), else 0.2 m (toeboard, ledger), over the field width */
  windWork: number;
  /** notional horizontal load 2.5 % of the working load, at least 0.3 kN (EN 12811-1, 6.2.3), acting
   * without wind: indoors, and outdoors on a day without wind (combinations A0) */
  notional: number;
  /** maximum wind on the level out of service, N: band of 0.2 m over the field width */
  windMax: number;
}

/**
 * Horizontal loads of the decked levels. The section stands for one field of the scaffold: the wind
 * hits the decks, toeboards and ledgers along the field width, not only the tubes of the section.
 */
export function horizontalLoads(d: Design): LevelLoads[] {
  const levels: Placed[][] = [];
  for (const p of d.parts) {
    if (!p.deck || p.deck.width <= 0) continue;
    const l = levels.find((x) => Math.abs(x[0].z - p.z) < 0.3);
    if (l) l.push(p);
    else levels.push([p]);
  }
  const len = (p: Placed) => Math.abs(ends(p)[2] - ends(p)[0]);
  return levels.map((ps) => {
    const b = Math.max(...ps.map((p) => p.deck!.width));
    const working = ps.filter((p) => p.deck!.work);
    const Q = working.reduce((s, p) => s + deckLoad(d, p) * p.deck!.width * len(p), 0);
    const notional = working.length ? Math.max(0.025 * Q, 300) : 0;
    const windWork = d.settings.outdoor ? WIND_CF * WORK_WIND * (working.length ? 0.4 : 0.2) * b : 0;
    return {
      z: ps[0].z,
      on: ps.reduce((a, c) => (len(c) > len(a) ? c : a)),
      windWork,
      notional,
      windMax: d.settings.outdoor ? WIND_CF * d.settings.qMax * 0.2 * b : 0,
    };
  });
}

/** largest load class of the working decks (share of the working load out of service) */
export const maxLoadClass = (d: Design) => Math.max(0, ...d.parts.filter((p) => p.deck?.work).map((p) => deckClass(d, p))) || d.settings.loadClass;

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
        {
          // in front of the plane of the standards (+y) or behind it (−y): the side of the rosette
          const y = (p.side ?? 1) > 0 ? 0.05 : -0.05;
          add(p.id, c, (p.dir ?? 1) > 0 ? mat(ROT_X, [p.x + HEAD.ubk, y - 0.05, p.z]) : mat(ROT_NX, [p.x - HEAD.ubk, y + 0.05, p.z]));
        }
        break;
      case 'ubl':
        add(p.id, c, (p.dir ?? 1) > 0 ? mat(ROT_X, [p.x + HEAD.ubl, 0, p.z + UBL_DZ]) : mat(ROT_NX, [p.x + c.L - HEAD.ubl, 0, p.z + UBL_DZ]));
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
  // decks: self weight on all, working load of their class where it works (line loads along the
  // ledger / bracket)
  const loads: UserLoad[] = [];
  for (const p of d.parts) {
    if (!p.deck || p.deck.width <= 0) continue;
    loads.push({ id: `${p.id}.g`, name: `G ${p.id}`, case: 'G', kind: 'line', value: d.settings.g * p.deck.width, at: 0.5, parts: [p.id] });
    if (p.deck.work) loads.push({ id: `${p.id}.q`, name: `Q ${p.id}`, case: 'Q', kind: 'line', value: deckLoad(d, p) * p.deck.width, at: 0.5, parts: [p.id] });
  }
  // horizontal loads of each decked level, in the direction of each combination, along its longest
  // decked part
  for (const lv of horizontalLoads(d)) {
    const L = Math.max(Math.abs(ends(lv.on)[2] - ends(lv.on)[0]), 0.1);
    const put = (key: string, cs: 'G' | 'Q', when: 'wind' | 'calm' | 'rest', F: number) => {
      if (F > 0) loads.push({ id: `${lv.on.id}.${key}`, name: `${key} ${lv.on.id}`, case: cs, kind: 'line', value: F / L, at: 0.5, parts: [lv.on.id], dir: 'x', when });
    };
    put('wind', 'G', 'wind', lv.windWork);
    put('H', 'Q', 'calm', lv.notional);
    put('windMax', 'G', 'rest', lv.windMax);
  }
  const stdById = new Map(standards(d).map((s) => [s.part.id, s]));
  const fixings: UserFixing[] = [];
  for (const a of d.anchors) {
    const s = stdById.get(a.part);
    if (!s) continue;
    const len = s.z1 - s.z0 + (s.spigot && cat(s.part).kind === 'standard' ? SPIGOT : 0);
    const base = cat(s.part).kind === 'base' ? UVB_H : len;
    // horizontal or vertical: held in that axis (both ways); inclined: a tie in its direction
    const ang = anchorAngle(d, a);
    const axis = ang % 180 === 0 ? (['x'] as const) : ang % 180 === 90 ? (['z'] as const) : null;
    const rad = (ang * Math.PI) / 180;
    fixings.push({
      id: a.id,
      name: a.id,
      parts: [a.part],
      at: Math.min(Math.max((a.z - s.z0) / base, 0), 1),
      dirs: axis ? [...axis] : [],
      ...(axis ? {} : { vec: [Math.cos(rad), 0, Math.sin(rad)] as [number, number, number] }),
      ...(a.limit ? { limit: a.limit } : {}),
    });
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
