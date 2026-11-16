/**
 * Structural model of an imported PERI UP Flex scaffold for the space frame analysis:
 *  - standards: continuous members with nodes at every rosette, rotational spring at the standard
 *    joints (approval Z-8.22-863, 3.2.8.2);
 *  - ledgers: beams with the semi-rigid rosette connection at their ends (rigid arm e_x = 2.5 cm,
 *    e_z = 3.5 cm and springs My, Mz, Mx; annex A page 16); ledger on ledger (UHA) hinged;
 *  - node / bracing / horizontal diagonals: pin-ended members with the total stiffness and slack of
 *    tables 14, 15 and 19; tubes with couplers as bracing or anchors;
 *  - brackets, SRU / RCS beams and lattice girders (as equivalent beams) carry what stands or lies
 *    on them;
 *  - supports: base of the standards (one-sided), anchors (tube axis), assumed beam ends;
 *  - decks: no stiffness, their loads go half to each of their two supports.
 */
import type { FrameModel3, Member3, MemberEnd, Section3, V3 } from '../core/frame3d';
import { latticeEquivalent } from '../sections/lattice';
import { findPeriProduct, periSI } from '../sections/peri';
import { deckedLedger, type ScaffoldStructure, type WorldPart } from './structure';
import type { PartKind } from './catalog';
import { partKg } from './weights';
import { E_STEEL, G_STEEL, JACK, JOINT, LEDGERS, TUBES, UBK_HEAD, VARIANT_TUBE, connCz, connKx, connKy, connKz, ubhData, ubkData, ublData, ubsData, type DiagonalData, type LedgerHead, type Variant } from './upflex';
import { planBlockLoads, type PlanLoads } from './planLoads';
import { orderedAxis, type UserFixing, type UserLoad, type UserLoadWhen } from './userLoads';

export type MKind = 'standard' | 'ledger' | 'bracket' | 'beam' | 'girder' | 'ubk' | 'ubs' | 'ubh' | 'ubl' | 'tube' | 'anchor' | 'jack' | 'link';

/** a user load applied to the model: nodal forces (point loads) and member loads (line loads), N and N/m downwards */
export interface UserLoadApplied {
  load: string;
  case: 'G' | 'Q';
  /** horizontal along x / y (in the combinations of that direction, with their sign), else vertical */
  dir?: 'x' | 'y';
  /** force direction (x, y) of a horizontal load, default along `dir` */
  vec?: [number, number];
  when?: UserLoadWhen;
  nodal: { node: number; F: number }[];
  members: { m: number; q: number }[];
}

export interface ModelMember {
  kind: MKind;
  /** part of the drawing */
  part: string;
  tube?: keyof typeof TUBES;
  /** the member starts at a standard joint */
  joint?: boolean;
  head?: LedgerHead;
  ledger?: keyof typeof LEDGERS;
  /** standard: position of the tube check in the span (from the start), besides the ends without ledgers */
  tubeAt?: number;
  /** semi-rigid rosette connection at the start / end: variant of the standard there (springs) */
  conn?: [Variant | null, Variant | null];
  /** variant for the checks of the connection where it differs from `conn` (by the article) */
  connCap?: [Variant | null, Variant | null];
  diag?: DiagonalData;
  /** weight per metre, kg/m */
  g: number;
  /** carrier (ledger, beam …) this segment belongs to */
  carrier?: number;
  /** spindle pair from a standard to the standard above it through a platform (compression only) */
  link?: boolean;
  /** spindle: base jack (under a standard) or head jack (on a standard, under a beam) */
  jack?: 'foot' | 'head';
  /** part of a group without any support (not connected to the scaffold): left out */
  floating?: boolean;
}

/** point of a beam (SRU / RCS) where something stands on it or where it is supported */
export interface BeamPoint {
  node: number;
  /** position along the beam, 0…1 */
  t: number;
  support: boolean;
}

export interface ModelNote {
  key: string;
  params?: Record<string, string | number>;
  parts: string[];
}

export interface BaseSupport {
  node: number;
  /** index of the first of the three translational supports in frame.supports */
  sup: number;
  part: string;
  column: number;
}

export interface DeckShare {
  level: number;
  /** on a carrier (all its segments) or on a node */
  carrier?: number;
  node?: number;
  area: number;
  kg: number;
}

export interface ScaffoldModel {
  frame: FrameModel3;
  members: ModelMember[];
  /** member lengths between the connection points, m */
  lengths: number[];
  /** column index of a node on a standard, −1 otherwise */
  nodeColumn: Int32Array;
  bases: BaseSupport[];
  /** anchors: truss member of the anchor tube */
  anchors: { member: number; part: string; node: number }[];
  /** beam ends supported by assumption */
  assumedSupports: { node: number; sup: number; part: string }[];
  /** deck levels (height, deck area) */
  levels: { z: number; area: number }[];
  decks: DeckShare[];
  /** members of a carrier and its length */
  carriers: { part: string; kind: MKind; members: number[]; length: number; points?: BeamPoint[] }[];
  /** weight of parts that are not members (toe boards, couplers …), kg at a node */
  masses: { node: number; kg: number }[];
  /** weight that could not be placed, kg */
  lostKg: number;
  notes: ModelNote[];
  /** loads entered by the user */
  user: UserLoadApplied[];
  /** nodes of the dynamic horizontal load (DHB): the chosen parts, else the tops of the standards
   * that reach the top of the scaffold */
  dhbNodes: number[];
  /** loads from the bodies of the drawing (ballast), null when not taken */
  plan: PlanLoads | null;
  /** what became of every part of the drawing in the model (nothing may be dropped silently) */
  audit: ImportAudit;
  /**
   * defects of the model found by its self check (an error of the program, not of the drawing): a
   * carrier not continuous from end to end, a member without length, a member to a missing node
   */
  defects: { key: 'carrierBroken' | 'zeroMember' | 'badNode'; parts: string[] }[];
  /** fixings to the building: node, held axes and their supports (index in frame.supports) */
  fixings: { id: string; part: string; node: number; sups: { dir: 'x' | 'y' | 'z'; sup: number }[]; limit?: number }[];
}

/**
 * Role of a part in the model: member(s), deck (load and area), joint of two members (splice),
 * weight only at the nearest node (accessories), included in the weight of another part (spindle
 * nut); `loose`: a load-bearing part that is not a member (its weight only, if known); `noWeight`: an
 * accessory without a weight in the parts database; `none`: nothing of the part in the model.
 */
export type PartFate = 'member' | 'deck' | 'joint' | 'weight' | 'included' | 'loose' | 'noWeight' | 'none';
export const PART_FATES: PartFate[] = ['member', 'deck', 'joint', 'weight', 'included', 'loose', 'noWeight', 'none'];
/** fates reported part by part (the drawing should be checked there) */
export const FATES_LISTED: PartFate[] = ['loose', 'none', 'noWeight'];
const LOAD_BEARING = new Set<PartKind>(['standard', 'base', 'ledger', 'diagonal', 'bracket', 'jack', 'flexEnd', 'flexElement', 'flexConnector', 'girder', 'beam', 'beamSplice', 'tube', 'anchor']);

export interface ImportAudit {
  total: number;
  counts: Record<PartFate, number>;
  /** parts with a fate of FATES_LISTED, by fate and name */
  listed: { fate: PartFate; name: string; parts: string[] }[];
}

const tubeSection = (t: keyof typeof TUBES): Section3 => ({ EA: E_STEEL * TUBES[t].A, EIy: E_STEEL * TUBES[t].I, EIz: E_STEEL * TUBES[t].I, GJ: G_STEEL * 2 * TUBES[t].I });
const ledgerSection = (l: keyof typeof LEDGERS): Section3 => ({ EA: E_STEEL * LEDGERS[l].A, EIy: E_STEEL * LEDGERS[l].Iy, EIz: E_STEEL * LEDGERS[l].Iz, GJ: G_STEEL * LEDGERS[l].J });

/**
 * Variant of the standard after table 6 of the approval, by the article: 1a (rosette 8 mm, Ø48.3 × 3.2)
 * for UVR / UVH, 1b (8 mm, Ø48.3 × 3.6 S355) for UVB 24 / 49 / 135 Plus and UVH 165 Plus, 2b
 * (Rosette-2 6 mm, Ø48.3 × 3.6) for UVB 25 / 50, 2c (6 mm, Ø48.3 × 2.7) for the standards "-2".
 * `rosette6`: all as 6 mm (the unfavourable choice when the parts on site are not known).
 */
function standardVariant(w: WorldPart, rosette6 = false): Variant {
  const t = `${w.part.name} ${w.part.desc}`;
  if (/UV[RHB]-2/i.test(t)) return '2c';
  const base = /UVB/i.test(t) || /UVH\s*165/i.test(t);
  if (rosette6) return base ? '2b' : '2a';
  if (/UVB\s*(25|50)\b/i.test(t)) return '2b';
  return base ? '1b' : '1a';
}

function ledgerType(w: WorldPart): { head: LedgerHead; sec: keyof typeof LEDGERS } {
  const t = `${w.part.name} ${w.part.desc}`;
  if (/UH[VA]?-2/i.test(t)) return { head: 'PLUS', sec: 'r24' };
  if (/\+|plus|UHV/i.test(t)) {
    // UH Plus 100 / 125 and UHV: wall 3 mm (from the weights of the parts list), else 2 mm
    const n = Number(/(\d{2,3})/.exec(w.part.name)?.[1]);
    return { head: 'PLUS', sec: /UHV/i.test(t) ? 'uhv' : n === 100 || n === 125 ? 'r30' : 'r20' };
  }
  return { head: 'UH', sec: 'r20' };
}

const HINGE = [Infinity, Infinity, Infinity, Infinity, 0, 0];
/** end panel of a lattice girder (end element ULS 50 Flex), m, and area of its posts / diagonals, m² */
const GIRDER_PANEL = 0.5;
const GIRDER_WEB_A = 2.0e-4;
/** horizontal offset of a spindle from the standard above / below it, m */
const JACK_XY = 0.045;
/** largest extension of a spindle (approval: 60 cm), m; weight of an added base jack UJB 38-50/30, kg */
const JACK_MAX_EXT = 0.6;
const JACK_KG = 3.39;
/** gap between the plate of the upper spindle and the top of the standard below: from 40 cm a beam of
 * the structure lies between them (below: a platform), searched up to 1.2 m, m */
const BEAM_GAP = 0.4;
const BEAM_GAP_MAX = 1.2;
/** largest distance between the standards of a spindle pair through a platform, m */
const JACK_GAP = 1.5;
/** scaffold spindle UJB / UJS (approval 3.2.9.5: A = 4.36 cm², I = 4.96 cm⁴), clamped in the standard */
const JACK_SEC: Section3 = { EA: E_STEEL * JACK.A, EIy: E_STEEL * JACK.I, EIz: E_STEEL * JACK.I, GJ: G_STEEL * 2 * JACK.I };
const dist2 = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const len3 = (a: V3, b: V3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

function longestLine(w: WorldPart, horizontal = false): [V3, V3] | null {
  let best: [V3, V3] | null = null;
  let l = 0;
  for (const [a, b] of w.lines) {
    if (horizontal && Math.abs(b[2] - a[2]) > 1e-3) continue;
    const d = len3(a, b);
    if (d > l) {
      l = d;
      best = [a, b];
    }
  }
  return best;
}

interface Col {
  x: number;
  y: number;
  z0: number;
  z1: number;
  /** variant: springs; cap: checks */
  parts: { w: WorldPart; zb: number; zt: number; variant: Variant; cap: Variant }[];
  ros: number[];
  zs: number[];
  ns: number[];
  /** the bottom is carried by a member (hinged there) */
  onCarrier: boolean;
}

interface Attach {
  node: number;
  /** rigid arm from the node to the point on the carrier axis */
  offset: V3;
  t: number;
  conn?: Variant | null;
  connCap?: Variant | null;
  k?: number[];
}

interface Carrier {
  w: WorldPart | null;
  part: string;
  kind: MKind;
  a: V3;
  b: V3;
  sec: Section3;
  g: number;
  head?: LedgerHead;
  ledger?: keyof typeof LEDGERS;
  tube?: keyof typeof TUBES;
  end: [Attach | null, Attach | null];
  inter: Attach[];
}

/** the tube of the lowest standard on a base is checked this far above the pin (base plate), m — as PERI
 * ForceControl (18_007, 18_013: M / V = 10 cm in the check of UVB) */
const TUBE_ABOVE_PIN = 0.1;

/** rigid link of a part hanging on a point of a carrier (≈ 20 tubes Ø48.3 × 3.2) */
const LINK_SEC: Section3 = { EA: 2.1e11 * 1e-2, EIy: 2.1e11 * 2.4e-6, EIz: 2.1e11 * 2.4e-6, GJ: 8.1e10 * 4.8e-6 };

/** a ledger / diagonal end at a rosette of a ULS Flex connector: horizontal distance, m */
const FLEX_ROSETTE = 0.1;

/** a beam end lies in a splice UK 70 when it is inside its outline grown by this, m */
const SPLICE_GROW = 0.08;

/** eccentricity of a ledger diagonal UBL beside the axis of its ledger (annex A, page 22), m */
const UBL_EY = 0.014;

/** how the node diagonals UBK are modelled (approval 3.2.3.2) */
export type UbkModel = 'annexA' | 'table15';
export interface ModelOptions {
  /** 'annexA': eccentric diagonal head with tables A.1 / A.2 (as PERI ForceControl, default);
   * 'table15': centric pin-ended member with the total stiffness of table 15 */
  ubk?: UbkModel;
  /** weight of the bodies of the drawing lying on the scaffold (ballast) as permanent loads (default) */
  planLoads?: boolean;
  /** stiffness of all rosettes as 6 mm (Rosette-2), the unfavourable variant (default, calibrated with PERI ForceControl); false: by the article (table 6) */
  rosette6?: boolean;
  /** resistance of the rosette connections and diagonals by the article of the standard (table 6), as PERI ForceControl (default); false: as the stiffness */
  capByArticle?: boolean;
  /** fixings to the building set by the user */
  fixings?: UserFixing[];
}

export function buildScaffoldModel(st: ScaffoldStructure, userLoads0: UserLoad[] = [], dhbParts: string[] = [], opts: ModelOptions = {}): ScaffoldModel {
  const ubkModel: UbkModel = opts.ubk ?? 'annexA';
  const plan = opts.planLoads === false ? null : planBlockLoads(st);
  const userLoads = plan ? [...userLoads0, ...plan.loads] : userLoads0;
  const nodes: V3[] = [];
  const nodeCol: number[] = [];
  const notes: ModelNote[] = [];
  const note = (key: string, part: string, params?: Record<string, string | number>) => {
    const n = notes.find((x) => x.key === key);
    if (n) {
      n.parts.push(part);
      if (n.params && typeof n.params.n === 'number') n.params.n++;
    } else notes.push({ key, params: { n: 1, ...params }, parts: [part] });
  };
  const addNode = (p: V3, col = -1) => {
    nodes.push([p[0], p[1], p[2]]);
    nodeCol.push(col);
    return nodes.length - 1;
  };
  const byId = new Map(st.parts.map((w) => [w.part.id, w]));

  // ---- standards
  // clamp rosettes (UEV) on a standard: a rosette at their height
  const clampRos: V3[] = st.parts
    .filter((w) => w.cls.kind === 'accessory' && /klemmrosette|\bUEV\b/i.test(`${w.part.name} ${w.part.desc}`))
    .map((w) => [(w.min[0] + w.max[0]) / 2, (w.min[1] + w.max[1]) / 2, (w.min[2] + w.max[2]) / 2]);
  const cols: Col[] = st.columns.map((c) => {
    const parts = c.parts
      .map((id) => byId.get(id)!)
      .map((w) => {
        let zb = Infinity;
        let zt = -Infinity;
        for (const [a, b] of w.lines)
          if (dist2(a, b) < 1e-3) {
            zb = Math.min(zb, a[2], b[2]);
            zt = Math.max(zt, a[2], b[2]);
          }
        const variant = standardVariant(w, opts.rosette6 ?? true);
        return { w, zb, zt, variant, cap: (opts.capByArticle ?? true) ? standardVariant(w, false) : variant };
      })
      .filter((p) => Number.isFinite(p.zb))
      .sort((a, b) => a.zb - b.zb);
    const zLo = Math.min(...parts.map((p) => p.zb));
    const zHi = Math.max(...parts.map((p) => p.zt));
    const clamps = clampRos.filter((r) => Math.hypot(r[0] - c.x, r[1] - c.y) < 0.15 && r[2] > zLo && r[2] < zHi);
    const ros = [...new Set([...parts.flatMap((p) => p.w.rosettes), ...clamps].map((r) => Math.round(r[2] * 1000) / 1000))].sort((a, b) => a - b);
    const zs = [...new Set([...parts.map((p) => Math.round(p.zb * 1000) / 1000), Math.round(Math.max(...parts.map((p) => p.zt)) * 1000) / 1000, ...ros])].sort((a, b) => a - b);
    // merge points closer than 5 mm
    const z2: number[] = [];
    for (const z of zs) if (!z2.length || z - z2[z2.length - 1] > 0.005) z2.push(z);
    return { x: c.x, y: c.y, z0: z2[0], z1: z2[z2.length - 1], parts, ros, zs: z2, ns: [], onCarrier: false };
  });
  cols.forEach((c, k) => (c.ns = c.zs.map((z) => addNode([c.x, c.y, z], k))));
  /** node of a column at the height z (new node if none within `snap`) */
  const colNode = (k: number, z: number, snap = 0.03): number => {
    const c = cols[k];
    let best = 0;
    for (let i = 1; i < c.zs.length; i++) if (Math.abs(c.zs[i] - z) < Math.abs(c.zs[best] - z)) best = i;
    if (Math.abs(c.zs[best] - z) <= snap) return c.ns[best];
    const zz = Math.min(Math.max(z, c.z0), c.z1);
    if (Math.abs(zz - z) > 1e-9) return colNode(k, zz, 0.006);
    const n = addNode([c.x, c.y, z], k);
    const at = c.zs.findIndex((v) => v > z);
    c.zs.splice(at, 0, z);
    c.ns.splice(at, 0, n);
    return n;
  };
  const colAt = (p: number[], r: number, zTol = 0.1): number => {
    let best = -1;
    let d = r;
    cols.forEach((c, k) => {
      const dd = dist2(p, [c.x, c.y]);
      if (dd <= d && p[2] >= c.z0 - zTol && p[2] <= c.z1 + zTol) {
        d = dd;
        best = k;
      }
    });
    return best;
  };
  const variantAt = (k: number, z: number, of: 'variant' | 'cap' = 'variant'): Variant => {
    const c = cols[k];
    let v = c.parts[0][of];
    for (const p of c.parts) if (p.zb <= z + 0.01) v = p[of];
    return v;
  };
  const rosetteNear = (k: number, z: number, tol: number): number | null => {
    const c = cols[k];
    let best: number | null = null;
    for (const r of c.ros) if (Math.abs(r - z) <= tol && (best === null || Math.abs(r - z) < Math.abs(best - z))) best = r;
    return best;
  };

  // ---- carriers: ledgers, brackets, beams, girders
  const carriers: Carrier[] = [];
  const tips: { p: V3; node: number }[] = [];
  const dir2 = (a: V3, b: V3): [number, number] => {
    const d = dist2(a, b) || 1;
    return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
  };
  /**
   * Springs of the wedge head of a ledger end (P, other end Q) in a rosette of variant v: a ledger is
   * never hinged, its wedge head sits in a rosette (standard, clamp rosette, ULS Flex connector, bracket
   * tip, ledger receiver UHA)
   */
  const wedge = (P: V3, Q: V3, head: LedgerHead, v: Variant): number[] => {
    // ledgers of 25 cm: vertical spring c_z of the connection (annex A pages 9, 10 and 16), initial stiffness in tension
    const cz = dist2(P, Q) <= 0.3 ? connCz(v, 0) : Infinity;
    return [Infinity, Infinity, cz, connKx(head, 0), connKy(head, v, 0), connKz(head, v, 0)];
  };
  /** variant of a rosette not on a standard (the standards of the drawing as a whole) */
  const looseVariant: Variant = (opts.rosette6 ?? true) ? '2a' : '1a';
  /** rosette connection of a ledger end P (other end Q) at a standard */
  const rosetteEnd = (P: V3, Q: V3, head: LedgerHead, part: string): Attach | null => {
    const k = colAt(P, 0.12);
    if (k < 0) return null;
    const u = dir2(P, Q);
    const zr = rosetteNear(k, P[2] - 0.03, 0.08);
    if (zr === null) {
      // no rosette of the drawing at this height: the wedge head sits in one there all the same
      const v = variantAt(k, P[2] - 0.03);
      note('ledgerNoRosette', part);
      return { node: colNode(k, P[2] - 0.03, 0.03), offset: [u[0] * 0.025, u[1] * 0.025, 0.035], t: 0, conn: v, connCap: variantAt(k, P[2] - 0.03, 'cap'), k: wedge(P, Q, head, v) };
    }
    const v = variantAt(k, zr);
    return {
      node: colNode(k, zr, 0.006),
      offset: [u[0] * 0.025, u[1] * 0.025, 0.035],
      t: 0,
      conn: v,
      connCap: variantAt(k, zr, 'cap'),
      k: wedge(P, Q, head, v),
    };
  };

  for (const w of st.parts) {
    if (w.cls.kind !== 'bracket') continue;
    const ml = longestLine(w, true);
    if (!ml) continue;
    // the end at the standard
    const ka = colAt(ml[0], 0.12);
    const kb = colAt(ml[1], 0.12);
    if (ka < 0 && kb < 0) {
      note('bracketFree', w.part.id);
      continue;
    }
    // the bracket hangs on the standard that runs on below it; a standard on its tip starts there
    const below = (k: number, p: V3) => k >= 0 && cols[k].z0 < p[2] - 0.2;
    const aOk = below(ka, ml[0]);
    const bOk = below(kb, ml[1]);
    if (!aOk && !bOk) {
      note('bracketFree', w.part.id);
      continue;
    }
    const first = aOk && (!bOk || dist2(ml[0], [cols[ka].x, cols[ka].y]) <= dist2(ml[1], [cols[kb].x, cols[kb].y]));
    const [P, Q] = first ? ml : [ml[1], ml[0]];
    const k = first ? ka : kb;
    const zr = rosetteNear(k, P[2] - 0.06, 0.1) ?? P[2];
    const n0 = colNode(k, zr, 0.006);
    const tip = addNode(Q);
    tips.push({ p: Q, node: tip });
    const c = cols[k];
    carriers.push({
      w,
      part: w.part.id,
      kind: 'bracket',
      a: [c.x, c.y, P[2]],
      b: Q,
      sec: tubeSection('t32'),
      tube: 't32',
      g: (partKg(w.part) ?? 5) / Math.max(len3(P, Q), 0.1),
      end: [
        { node: n0, offset: [0, 0, P[2] - zr], t: 0 },
        { node: tip, offset: [0, 0, 0], t: 1 },
      ],
      inter: [],
    });
  }

  for (const w of st.parts) {
    if (w.cls.kind !== 'ledger') continue;
    const ml = longestLine(w, true);
    if (!ml || len3(ml[0], ml[1]) < 0.1) continue;
    const { head, sec } = ledgerType(w);
    const L = len3(ml[0], ml[1]);
    carriers.push({
      w,
      part: w.part.id,
      kind: 'ledger',
      a: ml[0],
      b: ml[1],
      sec: ledgerSection(sec),
      head,
      ledger: sec,
      g: (partKg(w.part) ?? LEDGERS[sec].g * L) / L,
      end: [rosetteEnd(ml[0], ml[1], head, w.part.id), rosetteEnd(ml[1], ml[0], head, w.part.id)],
      inter: [],
    });
  }

  // beams SRU / RCS: axis through the middle of the part
  for (const w of st.parts) {
    if (w.cls.kind !== 'beam' || !w.lines.length) continue;
    const ml = longestLine(w)!;
    const L = len3(ml[0], ml[1]);
    if (L < 0.3) continue;
    const u: V3 = [(ml[1][0] - ml[0][0]) / L, (ml[1][1] - ml[0][1]) / L, (ml[1][2] - ml[0][2]) / L];
    const c: V3 = [(w.min[0] + w.max[0]) / 2, (w.min[1] + w.max[1]) / 2, (w.min[2] + w.max[2]) / 2];
    const a: V3 = [c[0] - (u[0] * L) / 2, c[1] - (u[1] * L) / 2, c[2] - (u[2] * L) / 2];
    const b: V3 = [c[0] + (u[0] * L) / 2, c[1] + (u[1] * L) / 2, c[2] + (u[2] * L) / 2];
    const prod = findPeriProduct(/RCS/i.test(w.part.name) ? 'RCS' : 'SRU120');
    const si = prod ? periSI(prod) : { A: 34e-4, I: 728e-8 };
    carriers.push({
      w,
      part: w.part.id,
      kind: 'beam',
      a,
      b,
      sec: { EA: E_STEEL * si.A, EIy: E_STEEL * si.I, EIz: E_STEEL * si.I * 0.2, GJ: G_STEEL * si.I * 0.02 },
      g: (partKg(w.part) ?? 27 * L) / L,
      end: [null, null],
      inter: [],
    });
  }

  /** node on the axis of a carrier at t (point q): an attached node there is shared, else a new one */
  const interAt = (c: Carrier, q: V3, t: number): number => {
    const L = len3(c.a, c.b);
    const hit = c.inter.find((a) => Math.abs(a.offset[0]) + Math.abs(a.offset[1]) + Math.abs(a.offset[2]) < 1e-9 && a.k === undefined && Math.abs(a.t - t) * L < 0.02);
    if (hit) return hit.node;
    const n = addNode(q);
    c.inter.push({ node: n, offset: [0, 0, 0], t: Math.min(Math.max(t, 0), 1) });
    return n;
  };
  // lattice girders as equivalent beams along their top chord
  const trussSec = (ea: number): Section3 => ({ EA: ea, EIy: 1, EIz: 1, GJ: 1 });
  const girderPanels: { part: string; m: { i: number; j: number; sec: Section3; truss: boolean }[] }[] = [];
  const flexRosettes: { p: V3; car: Carrier; part: string; t: number }[] = [];
  const connectorPosts: { i: number; j: number; part: string }[] = [];
  for (const g of st.girders) {
    const eq = latticeEquivalent(g.product);
    const E = g.product.startsWith('ULA') ? 70e9 : E_STEEL;
    const a: V3 = [g.origin[0], g.origin[1], g.zTop];
    const b: V3 = [g.origin[0] + g.u[0] * g.L, g.origin[1] + g.u[1] * g.L, g.zTop];
    const kg = g.parts.reduce((s, id) => s + ((byId.get(id) ? partKg(byId.get(id)!.part) : undefined) ?? 0), 0);
    const car: Carrier = {
      w: null,
      part: g.parts[0],
      kind: 'girder',
      a,
      b,
      sec: { EA: E * eq.A, EIy: E * eq.I, EIz: (E * eq.I) / 30, GJ: (E * eq.I) / 100 },
      g: (kg || 12 * g.L) / g.L,
      end: [null, null],
      inter: [],
    };
    for (const s of g.supports) {
      const p: V3 = [g.origin[0] + g.u[0] * s, g.origin[1] + g.u[1] * s, g.zTop];
      const k = colAt(p, 0.15, 0.6);
      if (k < 0) continue;
      const zr = rosetteNear(k, g.zTop - 0.03, 0.12) ?? Math.min(g.zTop, cols[k].z1);
      const n = colNode(k, zr, 0.006);
      const at: Attach = { node: n, offset: [p[0] - cols[k].x, p[1] - cols[k].y, g.zTop - zr], t: s / g.L, k: HINGE };
      // the end of a lattice girder hangs on the standard with both chords (end element 0.5 m):
      // bottom chord, post and diagonal of the end panel as truss members, so that the couple of the
      // chord forces holds the girder (and ties the standards it connects)
      const end = s < 1e-6 || s > g.L - 1e-6;
      const hh = g.zTop - g.zBottom;
      if (end && hh > 0.1 && g.L > 1.2) {
        const zb = rosetteNear(k, g.zBottom + 0.03, 0.12) ?? g.zBottom;
        if (zb >= cols[k].z0 - 0.01 && zr - zb > 0.1) {
          const nb = colNode(k, zb, 0.006);
          const d = s < 1e-6 ? GIRDER_PANEL : g.L - GIRDER_PANEL;
          const pt: V3 = [g.origin[0] + g.u[0] * d, g.origin[1] + g.u[1] * d, g.zTop];
          const ti = interAt(car, pt, d / g.L);
          const bi = addNode([pt[0], pt[1], g.zBottom]);
          // bottom chord: clamped in the wedge head at the standard (holds the panel sideways too)
          const Ic = Math.max(eq.I - (eq.A / 2) * 2 * ((eq.h - 0.0483) / 2) ** 2, 1e-8) / 2;
          const chord: Section3 = { EA: (E * eq.A) / 2, EIy: E * Ic, EIz: E * Ic, GJ: G_STEEL * Ic };
          const web = trussSec(E * GIRDER_WEB_A);
          girderPanels.push({ part: g.parts[0], m: [{ i: nb, j: bi, sec: chord, truss: false }, { i: bi, j: ti, sec: web, truss: true }, { i: n, j: bi, sec: web, truss: true }] });
        }
      }
      if (s < 1e-6) car.end[0] = at;
      else if (s > g.L - 1e-6) car.end[1] = at;
      else car.inter.push(at);
    }
    carriers.push(car);
    if (g.product === 'ULSFLEX')
      for (const id of g.parts) {
        const w = byId.get(id);
        if (w?.cls.kind === 'flexConnector') for (const r of w.rosettes) flexRosettes.push({ p: r as V3, car, part: id, t: ((r[0] - a[0]) * g.u[0] + (r[1] - a[1]) * g.u[1]) / g.L });
      }
  }

  // rosettes of the ULS Flex connectors (at the chords): ledgers and diagonals ending there hang on the
  // girder. A node at each such rosette, joined to the girder axis by the post of the connector.
  const partEnds = st.parts.filter((w) => w.cls.kind === 'ledger' || w.cls.kind === 'diagonal').flatMap((w) => w.lines.flat());
  const flexNodes: { p: V3; node: number }[] = [];
  for (const r of flexRosettes) {
    if (r.t < -0.02 || r.t > 1.02 || !partEnds.some((q) => dist2(q, r.p) <= FLEX_ROSETTE && Math.abs(q[2] - r.p[2]) <= 0.1)) continue;
    const q: V3 = [r.car.a[0] + (r.car.b[0] - r.car.a[0]) * r.t, r.car.a[1] + (r.car.b[1] - r.car.a[1]) * r.t, r.car.a[2]];
    const top = interAt(r.car, q, r.t);
    const n = addNode(r.p);
    flexNodes.push({ p: r.p, node: n });
    connectorPosts.push({ i: top, j: n, part: r.part });
  }
  const flexRosetteAt = (P: V3) => flexNodes.find((f) => dist2(f.p, P) <= FLEX_ROSETTE && Math.abs(f.p[2] - P[2]) <= 0.1);

  /** point of a carrier axis next to P: parameter t, point and distances */
  const project = (c: Carrier, P: V3) => {
    const L = len3(c.a, c.b);
    const u: V3 = [(c.b[0] - c.a[0]) / L, (c.b[1] - c.a[1]) / L, (c.b[2] - c.a[2]) / L];
    const s = (P[0] - c.a[0]) * u[0] + (P[1] - c.a[1]) * u[1] + (P[2] - c.a[2]) * u[2];
    const q: V3 = [c.a[0] + u[0] * s, c.a[1] + u[1] * s, c.a[2] + u[2] * s];
    return { t: s / L, q, dh: dist2(P, q), dz: P[2] - q[2], L };
  };
  /** carrier under the point P (not `self`) */
  const carrierUnder = (P: V3, self: Carrier | null, dzMin: number, dzMax: number, kinds: MKind[]) => {
    let best: { c: Carrier; pr: ReturnType<typeof project> } | null = null;
    for (const c of carriers) {
      if (c === self || !kinds.includes(c.kind)) continue;
      const pr = project(c, P);
      if (pr.t < -0.02 || pr.t > 1.02 || pr.dh > 0.15 || pr.dz < dzMin || pr.dz > dzMax) continue;
      if (!best || Math.abs(pr.dz) + pr.dh < Math.abs(best.pr.dz) + best.pr.dh) best = { c, pr };
    }
    return best;
  };

  // ledger ends without a standard: ULS Flex connector, bracket tip, ledger receiver on another ledger /
  // beam (all with the wedge head in a rosette: semi-rigid, never hinged)
  for (const c of carriers) {
    if (c.kind !== 'ledger') continue;
    for (const e of [0, 1] as const) {
      if (c.end[e]) continue;
      const P = e === 0 ? c.a : c.b;
      const Q = e === 0 ? c.b : c.a;
      const end = (node: number, at: V3): Attach => ({ node, offset: [P[0] - at[0], P[1] - at[1], P[2] - at[2]], t: e, conn: looseVariant, k: wedge(P, Q, c.head ?? 'PLUS', looseVariant) });
      const fr = flexRosetteAt(P);
      if (fr) {
        c.end[e] = end(fr.node, fr.p);
        continue;
      }
      const tip = tips.find((t) => dist2(t.p, P) <= 0.15 && Math.abs(t.p[2] - P[2]) <= 0.15);
      if (tip) {
        c.end[e] = end(tip.node, tip.p);
        continue;
      }
      const u = carrierUnder(P, c, -0.06, 0.4, ['ledger', 'beam', 'girder', 'bracket']);
      if (u) c.end[e] = end(interAt(u.c, u.pr.q, u.pr.t), u.pr.q);
    }
  }

  // standards on spindles, on beams / ledgers, on the standard below; base supports
  const supports: FrameModel3['supports'] = [];
  const bases: BaseSupport[] = [];
  const jacks = st.parts.filter((w) => w.cls.kind === 'jack');
  const near = (w: WorldPart, x: number, y: number) => w.min[0] <= x + JACK_XY && w.max[0] >= x - JACK_XY && w.min[1] <= y + JACK_XY && w.max[1] >= y - JACK_XY;
  /** spindle (base jack, base plate …) under the bottom of a standard: the lowest point is its foot */
  const jackUnder = (c: Col) => jacks.filter((w) => near(w, c.x, c.y) && w.min[2] < c.z0 + 0.02 && w.max[2] > c.z0 - 0.15);
  /** head jack on the top of a standard (pointing up) */
  const jackOver = (c: Col) => jacks.filter((w) => near(w, c.x, c.y) && w.max[2] > c.z1 - 0.02 && w.min[2] < c.z1 + 0.15);
  // ground: the lowest standard or spindle (not the lowest part: a part may lie far off by mistake)
  const ground = Math.min(...cols.map((c) => c.z0), ...jacks.map((w) => w.min[2]));
  /** `foot`: lowest point of the spindle clamped in the upper standard (its plate), null without a spindle */
  const links: { lower: number; upper: number; part: string; foot: number | null; head: string[] }[] = [];
  /** spindles under base supports: foot below the bottom of the standard (virtual: added by the program) */
  const feet: { col: number; foot: number; part: string; virtual?: boolean }[] = [];
  /**
   * Top of the timber planks / blocks under a standard (the spindle stands on them): planks with
   * their insertion point within 1.05 m of the axis (a plank is 1 m long, inserted at a corner) and
   * their top up to 1.2 m below the bottom of the standard; the highest one (top of the stack).
   */
  const padTop = (c: Col): number | null => {
    let top: number | null = null;
    for (const p of st.pads ?? []) {
      if (Math.hypot(p.p[0] - c.x, p.p[1] - c.y) > 1.05) continue;
      const t = p.p[2] + p.t;
      if (t > c.z0 + 0.01 || t < c.z0 - 1.2) continue;
      if (top === null || t > top) top = t;
    }
    return top;
  };
  cols.forEach((c, k) => {
    const isBase = c.parts[0].w.cls.kind === 'base';
    const under = jackUnder(c);
    // a base standard without a spindle in the drawing (older PERI CAD parts are not written to DXF)
    // on timber planks: the spindle is added, from the planks up into the standard
    const pad = isBase && !under.length ? padTop(c) : null;
    if (pad !== null) {
      const n = addNode([c.x, c.y, pad], k);
      feet.push({ col: k, foot: n, part: c.parts[0].w.part.id, virtual: true });
      bases.push({ node: n, sup: supports.length, part: c.parts[0].w.part.id, column: k });
      for (const dof of [0, 1, 2]) supports.push({ node: n, dof, k: Infinity });
      note('jackAdded', c.parts[0].w.part.id);
      // approval: spindles extended by at most 60 cm
      if (c.z0 - pad > JACK_MAX_EXT + 0.005) note('jackLong', c.parts[0].w.part.id);
      return;
    }
    const foot = Math.min(c.z0, ...under.map((w) => w.min[2]));
    // a base standard (on a spindle) or a spindle right above a standard below (directly under it or
    // 1…3 cm off): with a small gap a platform lies between them and the load goes on to the lower
    // standard; with a gap of 40 cm or more a beam of the structure lies between them and carries the
    // upper standard (the lower one ends under the beam without bearing on it)
    if (isBase || under.length) {
      let best = -1;
      let bd = Infinity;
      let bestGap = 0;
      cols.forEach((d, j) => {
        if (j === k) return;
        const dxy = Math.hypot(d.x - c.x, d.y - c.y);
        if (dxy > JACK_XY) return;
        const top = Math.max(d.z1, ...jackOver(d).map((w) => w.max[2]));
        const gap = foot - top;
        if (gap < -0.05 || gap > BEAM_GAP_MAX || c.z0 - d.z1 > JACK_GAP + BEAM_GAP_MAX) return;
        if (dxy + Math.abs(gap) < bd) {
          bd = dxy + Math.abs(gap);
          best = j;
          bestGap = gap;
        }
      });
      if (best >= 0 && bestGap >= BEAM_GAP) {
        let n = c.ns[0];
        if (foot < c.z0 - 0.02) {
          n = addNode([c.x, c.y, foot], k);
          feet.push({ col: k, foot: n, part: under[0].part.id });
        }
        bases.push({ node: n, sup: supports.length, part: (under[0] ?? c.parts[0].w).part.id, column: k });
        for (const dof of [0, 1, 2]) supports.push({ node: n, dof, k: Infinity });
        note('columnOnBeam', c.parts[0].w.part.id);
        return;
      }
      if (best >= 0) {
        links.push({ lower: best, upper: k, part: under[0]?.part.id ?? c.parts[0].w.part.id, foot: under.length ? foot : null, head: jackOver(cols[best]).map((w) => w.part.id) });
        // with a spindle in the standard the hinge is at the plate of the spindle, not at the standard
        c.onCarrier = !under.length;
        note('columnOnColumn', c.parts[0].w.part.id);
        return;
      }
    }
    const bottom: V3 = [c.x, c.y, foot];
    const carried = carrierUnder(bottom, null, -0.1, 0.75, ['beam', 'ledger', 'girder', 'bracket']);
    if (carried) {
      carried.c.inter.push({ node: c.ns[0], offset: [carried.pr.q[0] - c.x, carried.pr.q[1] - c.y, carried.pr.q[2] - c.z0], t: Math.min(Math.max(carried.pr.t, 0), 1) });
      c.onCarrier = true;
      return;
    }
    // spindles of all kinds, base standards (on a spindle not in the drawing), the lowest level and
    // beam clamps: supported on the ground or on a beam of the structure
    const clamp = st.parts.some((w) => w.cls.kind === 'clamp' && near(w, c.x, c.y) && w.max[2] > foot - 0.6 && w.min[2] < foot + 0.05);
    // also a standard with nothing under it: it stands on a part of the structure (by assumption)
    {
      let n = c.ns[0];
      if (foot < c.z0 - 0.02) {
        n = addNode([c.x, c.y, foot], k);
        feet.push({ col: k, foot: n, part: under[0].part.id });
      }
      bases.push({ node: n, sup: supports.length, part: (under[0] ?? c.parts[0].w).part.id, column: k });
      for (const dof of [0, 1, 2]) supports.push({ node: n, dof, k: Infinity });
      // above the lowest level and not on timber planks: on a beam of the structure (by assumption)
      if (!(isBase || under.length || clamp || c.z0 <= ground + 0.4)) note('columnOnStructure', c.parts[0].w.part.id);
      else if (foot > ground + 0.4 && padTop({ ...c, z0: foot + 0.01 }) === null) note('baseOnStructure', c.parts[0].w.part.id);
    }
  });
  // tops of standards under a beam carry it; a head jack in the standard (e.g. spindle head SRU) carries
  // the beam on its head: the spindle is clamped in the standard, the beam hinged on the head
  const heads: { col: number; head: number; part: string }[] = [];
  for (const car of carriers) {
    if (car.kind !== 'beam') continue;
    cols.forEach((c, k) => {
      const top: V3 = [c.x, c.y, c.z1];
      const pr = project(car, top);
      if (pr.t < -0.02 || pr.t > 1.02 || pr.dh > 0.15 || pr.dz > 0.05 || pr.dz < -0.5) return;
      const jack = jackOver(c).sort((a, b) => b.max[2] - a.max[2])[0];
      let node = c.ns[c.ns.length - 1];
      let z = c.z1;
      if (jack && jack.max[2] > c.z1 + 0.02 && jack.max[2] <= pr.q[2] + 0.05) {
        let h = heads.find((x) => x.col === k);
        if (!h) {
          h = { col: k, head: addNode([c.x, c.y, jack.max[2]], k), part: jack.part.id };
          heads.push(h);
        }
        node = h.head;
        z = jack.max[2];
      }
      car.inter.push({ node, offset: [pr.q[0] - c.x, pr.q[1] - c.y, pr.q[2] - z], t: Math.min(Math.max(pr.t, 0), 1), k: HINGE });
    });
  }
  // head jacks with nothing of the drawing on them (the structure on top is not drawn): clamped in the
  // standard, their head free (loads of the structure on top act there)
  cols.forEach((c, k) => {
    if (heads.some((h) => h.col === k) || links.some((l) => l.lower === k)) return;
    const jack = jackOver(c).sort((a, b) => b.max[2] - a.max[2])[0];
    if (!jack || jack.max[2] < c.z1 + 0.02) return;
    heads.push({ col: k, head: addNode([c.x, c.y, jack.max[2]], k), part: jack.part.id });
  });

  // ---- ledger diagonals UBL / UBL-2 (annex A, pages 22 and 23): fixed to the ledgers 12.5 cm from the
  // standards, 1.4 cm beside the ledger axis; all connections of these ledgers get the vertical
  // spring c_z (flexibility of the rosettes)
  /** ends of the UBL on their ledgers: node on the ledger axis (shared by UBL on both sides of it) and the
   * eccentricity UBL_EY of the diagonal beside the axis (rigid arm of the diagonal) */
  const ublEnds = new Map<string, [{ node: number; c: Carrier; off: V3 }, { node: number; c: Carrier; off: V3 }]>();
  for (const w of st.parts) {
    if (w.cls.kind !== 'diagonal' || !/UBL/i.test(`${w.part.name} ${w.part.desc}`)) continue;
    const ml = longestLine(w);
    if (!ml) continue;
    const found = ml.map((P) => {
      let best: { c: Carrier; pr: ReturnType<typeof project> } | null = null;
      for (const c of carriers) {
        if (c.kind !== 'ledger') continue;
        const pr = project(c, P);
        if (pr.t < 0 || pr.t > 1 || pr.dh > 0.15 || Math.abs(pr.dz) > 0.1) continue;
        if (!best || pr.dh + Math.abs(pr.dz) < best.pr.dh + Math.abs(best.pr.dz)) best = { c, pr };
      }
      return best ? { ...best, P } : null;
    });
    if (!found[0] || !found[1] || found[0].c === found[1].c) continue;
    const ends = found.map((f) => {
      const { c, pr, P } = f!;
      const d = dist2(P, pr.q);
      const n: [number, number] = d > 1e-6 ? [(P[0] - pr.q[0]) / d, (P[1] - pr.q[1]) / d] : [0, 0];
      const node = interAt(c, pr.q, pr.t);
      for (const e of c.end) if (e?.conn && e.k) e.k[2] = connCz(e.conn, 0);
      return { node, c, off: [n[0] * UBL_EY, n[1] * UBL_EY, 0] as V3 };
    });
    ublEnds.set(w.part.id, [ends[0], ends[1]]);
  }

  // ---- frame members
  const fm: Member3[] = [];
  const mm: ModelMember[] = [];
  /** length of a member between its connection points (the rigid arms excluded) */
  // ---- point loads of the user: a node on the beam / ledger / standard at the place of the load
  /** point loads on parts that may be tubes: placed once the tubes are built */
  const pendingTube: { li: number; id: string; at: number }[] = [];
  const user: UserLoadApplied[] = userLoads.map((l) => ({ load: l.id, case: l.case, ...(l.when && l.when !== 'all' ? { when: l.when } : {}), ...(l.dir === 'x' || l.dir === 'y' ? { dir: l.dir, ...(l.vec ? { vec: l.vec } : {}) } : {}), nodal: [], members: [] }));
  userLoads.forEach((l, li) => {
    if (l.kind !== 'point') return;
    for (const id of l.parts) {
      const at = Math.min(Math.max(l.at, 0), 1);
      const car = carriers.find((c) => c.part === id);
      if (car) {
        const [A, B] = orderedAxis(car.a, car.b);
        const P: V3 = [A[0] + at * (B[0] - A[0]), A[1] + at * (B[1] - A[1]), A[2] + at * (B[2] - A[2])];
        const t = Math.min(Math.max(project(car, P).t, 0), 1);
        user[li].nodal.push({ node: interAt(car, P, t), F: l.value });
        continue;
      }
      const k = cols.findIndex((c) => c.parts.some((p) => p.w.part.id === id));
      if (k >= 0) {
        const p = cols[k].parts.find((q) => q.w.part.id === id)!;
        user[li].nodal.push({ node: colNode(k, p.zb + at * (p.zt - p.zb), 0.01), F: l.value });
        continue;
      }
      // a head jack: on its head
      const h = heads.find((x) => x.part === id);
      if (h) {
        user[li].nodal.push({ node: h.head, F: l.value });
        continue;
      }
      // perhaps a tube (tie, brace): after the tubes are built
      pendingTube.push({ li, id, at });
      continue;
      note('userLoadIgnored', id, { name: l.name });
    }
  });

  // ---- fixings to the building set by the user: supports at a node of the part (as the point loads)
  const fixings: ScaffoldModel['fixings'] = [];
  const fixSup = new Map<string, number>();
  for (const f of opts.fixings ?? []) {
    const dirs = [...new Set(f.dirs)].filter((d) => d === 'x' || d === 'y' || d === 'z');
    if (!dirs.length) continue;
    for (const id of f.parts) {
      const at = Math.min(Math.max(f.at, 0), 1);
      let node = -1;
      // a part of a lattice girder: the girder (its carrier carries the first part)
      const gFirst = st.girders.find((g) => g.parts.includes(id))?.parts[0];
      const car = carriers.find((c) => c.part === id) ?? (gFirst ? carriers.find((c) => c.kind === 'girder' && c.part === gFirst) : undefined);
      if (car) {
        const [A, B] = orderedAxis(car.a, car.b);
        const P: V3 = [A[0] + at * (B[0] - A[0]), A[1] + at * (B[1] - A[1]), A[2] + at * (B[2] - A[2])];
        node = interAt(car, P, Math.min(Math.max(project(car, P).t, 0), 1));
      } else {
        const k = cols.findIndex((c) => c.parts.some((p) => p.w.part.id === id));
        if (k >= 0) {
          const p = cols[k].parts.find((q) => q.w.part.id === id)!;
          node = colNode(k, p.zb + at * (p.zt - p.zb), 0.01);
        } else {
          const h = heads.find((x) => x.part === id);
          if (h) node = h.head;
        }
      }
      if (node < 0) {
        note('fixingIgnored', id, { name: f.name });
        continue;
      }
      // one support per node and axis (two fixings at the same point share it)
      const sups = dirs.map((d) => {
        const key = `${node}:${d}`;
        let sup = fixSup.get(key);
        if (sup === undefined) {
          supports.push({ node, dof: 'xyz'.indexOf(d), k: Infinity });
          sup = supports.length - 1;
          fixSup.set(key, sup);
        }
        return { dir: d, sup };
      });
      fixings.push({ id: f.id, part: id, node, sups, ...(f.limit && f.limit > 0 ? { limit: f.limit } : {}) });
    }
  }

  const memberLength = (m: Member3): number => {
    const oi = m.ends?.[0]?.offset ?? [0, 0, 0];
    const oj = m.ends?.[1]?.offset ?? [0, 0, 0];
    return Math.hypot(nodes[m.j][0] + oj[0] - nodes[m.i][0] - oi[0], nodes[m.j][1] + oj[1] - nodes[m.i][1] - oi[1], nodes[m.j][2] + oj[2] - nodes[m.i][2] - oi[2]);
  };
  const carrierOut: ScaffoldModel['carriers'] = [];
  const assumedSupports: ScaffoldModel['assumedSupports'] = [];
  const carrierIndex = new Map<Carrier, number>();
  const spliced = new Set<string>();
  /** ledgers held at one end only (guardrails): no deck loads on them */
  const guardrails = new Set<Carrier>();
  const deckWs = st.parts.filter((w) => w.cls.kind === 'deck');
  // splices UK 70: the beams whose ends lie in the coupling are joined rigidly there (continuous beam)
  for (const w of st.parts) {
    if (w.cls.kind !== 'beamSplice') continue;
    const inBox = (p: V3) => [0, 1, 2].every((i) => p[i] > w.min[i] - SPLICE_GROW && p[i] < w.max[i] + SPLICE_GROW);
    const ends: { c: Carrier; e: 0 | 1; P: V3 }[] = [];
    for (const c of carriers)
      if (c.kind === 'beam')
        for (const e of [0, 1] as const) {
          const P = e === 0 ? c.a : c.b;
          if (!c.end[e] && inBox(P)) ends.push({ c, e, P });
        }
    if (new Set(ends.map((x) => x.c)).size < 2) {
      note('spliceFree', w.part.id);
      continue;
    }
    const m: V3 = [0, 1, 2].map((i) => ends.reduce((s, x) => s + x.P[i], 0) / ends.length) as V3;
    const n = addNode(m);
    for (const x of ends) x.c.end[x.e] = { node: n, offset: [x.P[0] - m[0], x.P[1] - m[1], x.P[2] - m[2]], t: x.e };
    spliced.add(w.part.id);
  }
  for (const c of carriers) {
    // something attached right at a free end becomes that end
    for (const e of [0, 1] as const) {
      if (c.end[e]) continue;
      const k = c.inter.findIndex((a) => (e === 0 ? a.t <= 0.02 : a.t >= 0.98));
      if (k >= 0) c.end[e] = { ...c.inter.splice(k, 1)[0], t: e, k: undefined };
    }
    // a ledger with no end held (both ends in the air) cannot carry anything
    if (c.kind === 'ledger' && !c.inter.length) {
      const held = c.end.filter((e) => e);
      if (!held.length) {
        note('ledgerLoose', c.part);
        continue;
      }
      if (held.length === 1) {
        if (c.w && deckedLedger(c.w, deckWs)) {
          // decks on it: the connection at the other end is missing in the drawing; taken there as a
          // wedge head in a rosette fixed in space
          const e = c.end[0] ? 1 : 0;
          const P = e === 0 ? c.a : c.b;
          const Q = e === 0 ? c.b : c.a;
          const n = addNode(P);
          for (const dof of [0, 1, 2, 3, 4, 5]) supports.push({ node: n, dof, k: Infinity });
          c.end[e] = { node: n, offset: [0, 0, 0], t: e, conn: looseVariant, k: wedge(P, Q, c.head ?? 'PLUS', looseVariant) };
          note('ledgerFixedAssumed', c.part);
        } else {
          // no decks: a guardrail (cantilever in its wedge head), no loads on it but its weight
          note('ledgerGuardrail', c.part);
          guardrails.add(c);
        }
      }
    }
    // ends without a node
    const supportLike = c.inter.filter((a) => a.k === HINGE).length;
    for (const e of [0, 1] as const) {
      if (c.end[e]) continue;
      const P = e === 0 ? c.a : c.b;
      const n = addNode(P);
      c.end[e] = { node: n, offset: [0, 0, 0], t: e };
      if (c.kind === 'beam' && supportLike < 2) {
        // beam on the structure: supported at its ends by assumption
        assumedSupports.push({ node: n, sup: supports.length, part: c.part });
        for (const dof of [0, 1, 2]) supports.push({ node: n, dof, k: Infinity });
        // torsion of the beam held at one end (rotation about its dominant horizontal direction)
        if (e === 0) supports.push({ node: n, dof: Math.abs(c.b[0] - c.a[0]) >= Math.abs(c.b[1] - c.a[1]) ? 3 : 4, k: Infinity });
      }
    }
    if (c.kind === 'beam' && assumedSupports.some((s) => s.part === c.part)) note('beamAssumed', c.part);
    const pts = [c.end[0]!, ...c.inter.sort((a, b) => a.t - b.t), c.end[1]!];
    // the chain of the carrier: points closer than 2 cm along it are one point (the ends of the carrier
    // always in the chain, they hold its connections); every other part attached there hangs on that
    // point by a short rigid link with its own connection — the carrier is never broken there
    const axisAt = (a: Attach): V3 => [nodes[a.node][0] + a.offset[0], nodes[a.node][1] + a.offset[1], nodes[a.node][2] + a.offset[2]];
    const chain: Attach[] = [];
    const hang: { rep: Attach; p: Attach }[] = [];
    pts.forEach((p, i) => {
      const r = chain[chain.length - 1];
      if (!r || (r.node !== p.node && len3(axisAt(r), axisAt(p)) >= 0.02)) {
        chain.push(p);
        return;
      }
      if (r.node === p.node) return;
      if (i === pts.length - 1) {
        // the end of the carrier takes the place of the point next to it
        chain[chain.length - 1] = p;
        for (const h of hang) if (h.rep === r) h.rep = p;
        hang.push({ rep: p, p: r });
      } else hang.push({ rep: r, p });
    });
    const members: number[] = [];
    for (let i = 0; i + 1 < chain.length; i++) {
      const A = chain[i];
      const B = chain[i + 1];
      const first = i === 0;
      const last = i + 2 === chain.length;
      const ea: MemberEnd = { offset: A.offset, k: first ? A.k : undefined };
      const eb: MemberEnd = { offset: B.offset, k: last ? B.k : undefined };
      members.push(fm.length);
      fm.push({ i: A.node, j: B.node, sec: c.sec, ends: [ea, eb] });
      mm.push({
        kind: c.kind,
        part: c.part,
        head: c.head,
        ledger: c.ledger,
        tube: c.tube,
        conn: c.kind === 'ledger' ? [first ? (A.conn ?? null) : null, last ? (B.conn ?? null) : null] : undefined,
        connCap: c.kind === 'ledger' && ((first && A.connCap && A.connCap !== A.conn) || (last && B.connCap && B.connCap !== B.conn)) ? [first ? (A.connCap ?? A.conn ?? null) : null, last ? (B.connCap ?? B.conn ?? null) : null] : undefined,
        g: c.g,
        carrier: carrierOut.length,
      });
    }
    // parts hanging on a point of the chain: rigid link from the axis there to their node
    for (const { rep, p } of hang) {
      const fromAxis = Math.hypot(...p.offset) > 1e-3;
      const toNode = Math.hypot(...rep.offset) > 1e-3;
      // two nodes at the same place (no arm on either side): the link 5 mm along the carrier
      const L = len3(c.a, c.b) || 1;
      const nudge: V3 = [((c.b[0] - c.a[0]) / L) * 0.005, ((c.b[1] - c.a[1]) / L) * 0.005, ((c.b[2] - c.a[2]) / L) * 0.005];
      const ends: [MemberEnd, MemberEnd] = fromAxis
        ? [{ offset: rep.offset }, { offset: [0, 0, 0], k: p.k }]
        : toNode
          ? [{ offset: [0, 0, 0] }, { offset: [0, 0, 0], k: p.k }]
          : [{ offset: [0, 0, 0] }, { offset: nudge, k: p.k }];
      fm.push({ i: rep.node, j: p.node, sec: LINK_SEC, ends });
      mm.push({ kind: 'link', part: c.part, g: 0, link: true });
    }
    carrierIndex.set(c, carrierOut.length);
    const points: BeamPoint[] | undefined =
      c.kind === 'beam' ? pts.map((q) => ({ node: q.node, t: Math.min(Math.max(q.t, 0), 1), support: q.k === HINGE || assumedSupports.some((a) => a.node === q.node) })) : undefined;
    carrierOut.push({ part: c.part, kind: c.kind, members, length: members.reduce((s, m) => s + memberLength(fm[m]), 0), points });
  }

  const nearestNodeOf = (p: V3, r: number): number => {
    let best = -1;
    let d = r;
    for (let i = 0; i < nodes.length; i++) {
      const dd = len3(nodes[i], p);
      if (dd < d) {
        d = dd;
        best = i;
      }
    }
    return best;
  };

  // ---- posts of the ULS Flex connectors (girder axis to the rosette)
  for (const cp of connectorPosts) {
    fm.push({ i: cp.i, j: cp.j, sec: tubeSection('t32') });
    mm.push({ kind: 'girder', part: cp.part, g: 0 });
  }
  // ---- end panels of the lattice girders
  for (const gp of girderPanels)
    for (const x of gp.m) {
      fm.push({ i: x.i, j: x.j, sec: x.sec, ...(x.truss ? { truss: true } : {}) });
      mm.push({ kind: 'girder', part: gp.part, g: 0 });
    }

  // ---- diagonals
  // ledger diagonals UBL not found on two ledgers: table by the ledgers of the drawing
  const ledgerParts = st.parts.filter((w) => w.cls.kind === 'ledger');
  const plusLedgers = ledgerParts.filter((w) => ledgerType(w).head === 'PLUS').length >= ledgerParts.length / 2;
  // field L × H of a UBL from its name ("UBL-2 100/100")
  const ublDims = (w: WorldPart) => /(\d{2,3})\s*\/\s*(\d{2,3})/.exec(w.part.name) ?? /(\d{2,3})\s*\/\s*(\d{2,3})/.exec(w.part.desc);
  for (const w of st.parts) {
    if (w.cls.kind !== 'diagonal') continue;
    const name = `${w.part.name} ${w.part.desc}`;
    const kind: MKind | null = /UBK/i.test(name) ? 'ubk' : /UBH/i.test(name) ? 'ubh' : /UBL/i.test(name) ? 'ubl' : /UBS/i.test(name) ? 'ubs' : null;
    const ml = longestLine(w);
    if (!kind || !ml) {
      note('diagonalType', w.part.id, { names: w.part.name });
      continue;
    }
    // UBL between its two ledgers: table 17 only if both are UH Plus / UH-2, else table 16 (UH)
    const ue = kind === 'ubl' ? ublEnds.get(w.part.id) : undefined;
    if (ue) {
      const [A, B] = ue;
      const pa: V3 = [nodes[A.node][0] + A.off[0], nodes[A.node][1] + A.off[1], nodes[A.node][2]];
      const pb: V3 = [nodes[B.node][0] + B.off[0], nodes[B.node][1] + B.off[1], nodes[B.node][2]];
      const L = len3(pa, pb);
      const dims = ublDims(w);
      const plus = A.c.head === 'PLUS' && B.c.head === 'PLUS';
      const d = ublData(dims ? Number(dims[1]) / 100 : dist2(nodes[A.node], nodes[B.node]), dims ? Number(dims[2]) / 100 : Math.abs(nodes[B.node][2] - nodes[A.node][2]), plus, L);
      fm.push({ i: A.node, j: B.node, sec: trussSec(d.eaT), truss: true, ends: [{ offset: A.off }, { offset: B.off }] });
      mm.push({ kind, part: w.part.id, diag: d, g: (partKg(w.part) ?? 3.5 * L) / L });
      continue;
    }
    if (kind === 'ubl') note('ublNoLedger', w.part.id);
    const ka = colAt(ml[0], 0.3, 0.15);
    const kb = colAt(ml[1], 0.3, 0.15);
    // an end without a standard: at a bracket tip or the end of a cantilevering ledger
    const other = (p: V3) => nearestNodeOf(p, 0.35);
    const za = ka >= 0 ? (rosetteNear(ka, ml[0][2], 0.15) ?? ml[0][2]) : ml[0][2];
    const zb = kb >= 0 ? (rosetteNear(kb, ml[1][2], 0.15) ?? ml[1][2]) : ml[1][2];
    const na = ka >= 0 ? colNode(ka, za, 0.006) : other(ml[0]);
    const nb = kb >= 0 ? colNode(kb, zb, 0.006) : other(ml[1]);
    if (na < 0 || nb < 0 || na === nb || (ka >= 0 && ka === kb)) {
      note('diagonalFree', w.part.id);
      continue;
    }
    const Lh = dist2(nodes[na], nodes[nb]);
    const r6 = (ka >= 0 && variantAt(ka, za)[0] === '2') || (kb >= 0 && variantAt(kb, zb)[0] === '2');
    let d: DiagonalData;
    if (kind === 'ubh') {
      const dims = /(\d{2,3})\s*[x/]\s*(\d{2,3})/.exec(w.part.name);
      d = dims ? ubhData(Number(dims[1]) / 100, Number(dims[2]) / 100) : ubhData(Lh / Math.SQRT2, Lh / Math.SQRT2);
    } else if (kind === 'ubl') {
      const dims = ublDims(w);
      d = ublData(dims ? Number(dims[1]) / 100 : Lh, dims ? Number(dims[2]) / 100 : Math.abs(zb - za), plusLedgers, len3(nodes[na], nodes[nb]));
    } else {
      // stiffness and slack by the rosettes of the stiffness, resistance by those of the checks
      const r6c = (ka >= 0 && variantAt(ka, za, 'cap')[0] === '2') || (kb >= 0 && variantAt(kb, zb, 'cap')[0] === '2');
      const data = (six: boolean) => (kind === 'ubk' ? ubkData(Lh, Math.abs(zb - za), six, ubkModel === 'annexA' ? { ubk2: /UBK-2/i.test(name) } : undefined) : ubsData(Lh, Math.abs(zb - za), six));
      const ds = data(r6);
      const dc = r6c === r6 ? ds : data(r6c);
      d = { ...ds, nT: dc.nT, nC: dc.nC };
    }
    let ends: [MemberEnd, MemberEnd] | undefined;
    if (kind === 'ubk' && ubkModel === 'annexA' && Lh > 0.3) {
      // annex A page 20 / 21: the diagonal head sits e_x beside the standard towards the bay and e_y
      // beside the plane of the standards, on the side where the diagonal is drawn
      const pa = nodes[na];
      const pb = nodes[nb];
      const u: V3 = [(pb[0] - pa[0]) / Lh, (pb[1] - pa[1]) / Lh, 0];
      let n: V3 = [-u[1], u[0], 0];
      const side = ((ml[0][0] + ml[1][0] - pa[0] - pb[0]) / 2) * n[0] + ((ml[0][1] + ml[1][1] - pa[1] - pb[1]) / 2) * n[1];
      if (side < 0) n = [-n[0], -n[1], 0];
      const ey = /UBK-2/i.test(name) ? UBK_HEAD.ey2 : UBK_HEAD.ey;
      const off = (s: number, std: boolean): MemberEnd => ({ offset: std ? [s * UBK_HEAD.ex * u[0] + ey * n[0], s * UBK_HEAD.ex * u[1] + ey * n[1], 0] : [0, 0, 0] });
      ends = [off(1, ka >= 0), off(-1, kb >= 0)];
    }
    const at = (k: number, e?: MemberEnd): V3 => {
      const o = e?.offset ?? [0, 0, 0];
      return [nodes[k][0] + o[0], nodes[k][1] + o[1], nodes[k][2] + o[2]];
    };
    const L = len3(at(na, ends?.[0]), at(nb, ends?.[1]));
    fm.push({ i: na, j: nb, sec: trussSec(d.eaT), truss: true, ...(ends ? { ends } : {}) });
    mm.push({ kind, part: w.part.id, diag: d, g: (partKg(w.part) ?? 3.5 * L) / L });
  }
  /** standards a tube passes (axis within 12 cm, height within the standard), ordered along the tube */
  const tubeCrossings = ([a, b]: [V3, V3]) => {
    const L = len3(a, b);
    const out: { k: number; z: number; s: number }[] = [];
    if (L < 1e-6) return out;
    const t: V3 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L, (b[2] - a[2]) / L];
    const th = Math.hypot(t[0], t[1]);
    cols.forEach((c, k) => {
      // the point of the tube axis horizontally nearest to the axis of the standard
      let s: number;
      if (th < 1e-6) s = 0;
      else s = ((c.x - a[0]) * t[0] + (c.y - a[1]) * t[1]) / (th * th);
      s = Math.min(Math.max(s, -0.05), L + 0.05);
      const p: V3 = [a[0] + s * t[0], a[1] + s * t[1], a[2] + s * t[2]];
      if (Math.hypot(p[0] - c.x, p[1] - c.y) > 0.12 || p[2] < c.z0 - 0.15 || p[2] > c.z1 + 0.15) return;
      out.push({ k, z: Math.min(Math.max(p[2], c.z0), c.z1), s });
    });
    out.sort((x, y) => x.s - y.s);
    return out.filter((x, i) => i === 0 || x.k !== out[i - 1].k);
  };

  /** couplers on a tube (within 12 cm of its axis) at a standard, ordered along the tube */
  const couplerParts = st.parts.filter((w) => w.cls.kind === 'coupler');
  const tubeCouplers = ([a, b]: [V3, V3]) => {
    const L = len3(a, b);
    const out: { k: number; z: number; s: number }[] = [];
    if (L < 1e-6) return out;
    const t: V3 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L, (b[2] - a[2]) / L];
    for (const c of couplerParts) {
      const q: V3 = [c.part.m[3], c.part.m[7], c.part.m[11]];
      const s = (q[0] - a[0]) * t[0] + (q[1] - a[1]) * t[1] + (q[2] - a[2]) * t[2];
      if (s < -0.1 || s > L + 0.1) continue;
      const p: V3 = [a[0] + s * t[0], a[1] + s * t[1], a[2] + s * t[2]];
      if (len3(p, q) > 0.12) continue;
      const k = colAt(p, 0.25, 0.15);
      if (k >= 0) out.push({ k, z: Math.min(Math.max(p[2], cols[k].z0), cols[k].z1), s });
    }
    out.sort((x, y) => x.s - y.s);
    return out.filter((x, i) => i === 0 || x.k !== out[i - 1].k);
  };

  // ---- tubes: anchors and bracing
  const anchors: ScaffoldModel['anchors'] = [];
  const anchorTubes = new Set(st.anchors.map((a) => a.id));
  for (const a of st.anchors) {
    const k = colAt(a.atStandard, 0.3, 0.15);
    if (k < 0) continue;
    const n = colNode(k, a.atStandard[2], 0.03);
    const far = addNode(a.atStructure);
    for (const dof of [0, 1, 2]) supports.push({ node: far, dof, k: Infinity });
    anchors.push({ member: fm.length, part: a.id, node: n });
    fm.push({ i: n, j: far, sec: trussSec(E_STEEL * TUBES.t32.A), truss: true });
    mm.push({ kind: 'anchor', part: a.id, tube: 't32', g: TUBES.t32.g });
    // the tube coupled to further standards on the way: it braces them
    let prev = n;
    for (const p of a.via ?? []) {
      const kv = colAt(p, 0.3, 0.15);
      if (kv < 0) continue;
      const nv = colNode(kv, p[2], 0.03);
      if (nv === prev) continue;
      fm.push({ i: prev, j: nv, sec: trussSec(E_STEEL * TUBES.t32.A), truss: true });
      mm.push({ kind: 'tube', part: a.id, tube: 't32', g: 0 });
      prev = nv;
    }
  }
  for (const w of st.parts) {
    if ((w.cls.kind !== 'tube' && w.cls.kind !== 'anchor') || anchorTubes.has(w.part.id)) continue;
    const ml = longestLine(w);
    if (!ml) continue;
    // coupled to the standards: where its couplers are (the first and the last along the tube, e.g. a
    // diagonal tube with couplers at the top and the bottom; its ends may stick out beyond the
    // standards); without couplers in the drawing to the first and the last standard it passes
    const cpl = tubeCouplers(ml);
    const cross = cpl.length >= 2 ? cpl : tubeCrossings(ml);
    if (cross.length < 2) {
      note('tubeFree', w.part.id);
      continue;
    }
    const [A, B] = [cross[0], cross[cross.length - 1]];
    const na = colNode(A.k, A.z, 0.03);
    const nb = colNode(B.k, B.z, 0.03);
    fm.push({ i: na, j: nb, sec: trussSec(E_STEEL * TUBES.t32.A), truss: true });
    mm.push({ kind: 'tube', part: w.part.id, tube: 't32', g: TUBES.t32.g });
  }
  // point loads on tubes (ties of a hoist …): at the node of the tube nearest to the point (an end
  // sticking out beyond its coupler goes to the coupler)
  for (const { li, id, at } of pendingTube) {
    const w = byId.get(id);
    const tm = w ? fm.map((_, k) => k).filter((k) => mm[k].part === id && (mm[k].kind === 'tube' || mm[k].kind === 'anchor')) : [];
    const ml = w && longestLine(w);
    if (!tm.length || !ml) {
      note('userLoadIgnored', id, { name: userLoads[li].name });
      continue;
    }
    const [A, B] = orderedAxis(ml[0], ml[1]);
    const P: V3 = [A[0] + at * (B[0] - A[0]), A[1] + at * (B[1] - A[1]), A[2] + at * (B[2] - A[2])];
    let best = -1;
    for (const k of tm) for (const n of [fm[k].i, fm[k].j]) if (best < 0 || len3(nodes[n], P) < len3(nodes[best], P)) best = n;
    user[li].nodal.push({ node: best, F: userLoads[li].value });
  }


  // ---- standards (after all nodes on them exist)
  cols.forEach((c, ci) => {
    // the pin under the standard: the base plate of its spindle, else its own bottom
    const foot = feet.find((f) => f.col === ci);
    const zPin = foot ? nodes[foot.foot][2] : c.zs[0];
    for (let i = 0; i + 1 < c.zs.length; i++) {
      const zm = (c.zs[i] + c.zs[i + 1]) / 2;
      let pi = 0;
      for (let p = 0; p < c.parts.length; p++) if (c.parts[p].zb <= zm) pi = p;
      const p = c.parts[pi];
      const t = VARIANT_TUBE[p.variant];
      const joint = pi > 0 && Math.abs(c.zs[i] - p.zb) < 0.006;
      const hinged = i === 0 && c.onCarrier;
      const ends: Member3['ends'] = joint
        ? [{ k: [Infinity, Infinity, Infinity, Infinity, JOINT.k, JOINT.k] }, undefined]
        : hinged
          ? [{ k: HINGE }, undefined]
          : undefined;
      fm.push({ i: c.ns[i], j: c.ns[i + 1], sec: tubeSection(t), ends });
      const nominal = Math.max((pi + 1 < c.parts.length ? c.parts[pi + 1].zb : p.zt) - p.zb, 0.2);
      // the lowest piece on a base: tube checked TUBE_ABOVE_PIN above the pin (as PERI ForceControl)
      const base = i === 0 && !c.onCarrier && (foot || bases.some((b) => b.column === ci));
      const L = c.zs[i + 1] - c.zs[i];
      const tubeAt = base ? Math.min(Math.max(TUBE_ABOVE_PIN - (c.zs[0] - zPin), 0), L) : undefined;
      mm.push({ kind: 'standard', part: p.w.part.id, tube: t, joint, g: (partKg(p.w.part) ?? TUBES[t].g * nominal) / nominal, ...(tubeAt !== undefined ? { tubeAt } : {}) });
    }
  });
  // spindles: clamped in the standard, hinged on the base plate / platform
  const jackKg = (id: string) => {
    const w = byId.get(id);
    return w && w.cls.kind === 'jack' ? (partKg(w.part) ?? 0) : 0;
  };
  for (const f of feet) {
    const c = cols[f.col];
    const L = Math.max(c.z0 - nodes[f.foot][2], 0.05);
    fm.push({ i: c.ns[0], j: f.foot, sec: JACK_SEC, ends: [undefined, { offset: [0, 0, 0], k: [Infinity, Infinity, Infinity, Infinity, 0, 0] }] });
    // an added spindle: weight of the base jack UJB 38-50/30
    mm.push({ kind: 'jack', jack: 'foot', part: f.part, g: (f.virtual ? JACK_KG : jackKg(f.part)) / L });
  }
  // head jacks under beams: clamped in the standard (top of the standard to the head)
  for (const h of heads) {
    const c = cols[h.col];
    const a = c.ns[c.ns.length - 1];
    const L = Math.max(nodes[h.head][2] - nodes[a][2], 0.05);
    fm.push({ i: a, j: h.head, sec: JACK_SEC });
    mm.push({ kind: 'jack', jack: 'head', part: h.part, g: jackKg(h.part) / L });
  }
  // standard on the standard below through a platform (base jack on head jack)
  // The base jack is clamped in the upper standard down to its plate; the plate bears on what lies on
  // the lower standard (head jack, bearing plates, a beam): that piece is clamped in the lower standard
  // and hinged under the plate (the only hinge of the joint).
  const PIN = (): MemberEnd => ({ offset: [0, 0, 0], k: [Infinity, Infinity, Infinity, Infinity, 0, 0] });
  /** parts that are a piece of a member of another part (head jack in a link): weight with that member */
  const absorbed = new Set<string>();
  for (const l of links) {
    const first = fm.length;
    linkMembers(l);
    // the head jack of the lower standard is part of the link (its weight on the link)
    const heads = l.head.filter((id) => id !== l.part);
    const kg = heads.reduce((t, id) => t + jackKg(id), 0);
    if (fm.length > first && heads.length) {
      const last = fm.length - 1;
      mm[last].g += kg / Math.max(memberLength(fm[last]), 0.05);
      for (const id of heads) absorbed.add(id);
    }
  }
  function linkMembers(l: (typeof links)[number]) {
    const lo = cols[l.lower];
    const up = cols[l.upper];
    const a = lo.ns[lo.ns.length - 1];
    const b = up.ns[0];
    const kg = jackKg(l.part);
    if (l.foot !== null && l.foot < up.z0 - 0.02) {
      if (l.foot > nodes[a][2] + 0.03) {
        const f = addNode([up.x, up.y, l.foot], l.upper);
        const Ls = Math.max(up.z0 - l.foot, 0.05);
        fm.push({ i: b, j: f, sec: JACK_SEC });
        mm.push({ kind: 'jack', jack: 'foot', part: l.part, g: kg / Ls });
        fm.push({ i: a, j: f, sec: JACK_SEC, ends: [undefined, PIN()] });
        mm.push({ kind: 'jack', jack: 'head', part: l.part, g: 0, link: true });
      } else {
        // the plate of the spindle right on the lower standard
        const L = Math.max(len3(nodes[a], nodes[b]), 0.05);
        fm.push({ i: b, j: a, sec: JACK_SEC, ends: [undefined, PIN()] });
        mm.push({ kind: 'jack', jack: 'foot', part: l.part, g: kg / L, link: true });
      }
      return;
    }
    const L = Math.max(len3(nodes[a], nodes[b]), 0.05);
    fm.push({ i: a, j: b, sec: JACK_SEC, ends: [undefined, PIN()] });
    mm.push({ kind: 'jack', jack: 'foot', part: l.part, g: kg / L, link: true });
  }

  // ---- decks
  const levels: ScaffoldModel['levels'] = [];
  const decks: DeckShare[] = [];
  const levelOf = (z: number) => {
    let i = levels.findIndex((l) => Math.abs(l.z - z) < 0.3);
    if (i < 0) {
      levels.push({ z, area: 0 });
      i = levels.length - 1;
    }
    return i;
  };
  const nearestNode = nearestNodeOf;
  let lostKg = 0;
  const deckParts = st.parts.filter((w) => w.cls.kind === 'deck').sort((a, b) => a.min[2] - b.min[2]);
  for (const w of deckParts) {
    const long: 0 | 1 = w.max[0] - w.min[0] >= w.max[1] - w.min[1] ? 0 : 1;
    const short = 1 - long;
    const area = (w.max[0] - w.min[0]) * (w.max[1] - w.min[1]);
    const kg = partKg(w.part) ?? 22 * area;
    const z = w.min[2];
    const lv = levelOf(z);
    levels[lv].area += area;
    const mid = (w.min[short] + w.max[short]) / 2;
    const found: Carrier[] = [];
    for (const e of [w.min[long], w.max[long]]) {
      let best: Carrier | null = null;
      let bd = Infinity;
      for (const c of carriers) {
        if (!carrierIndex.has(c) || guardrails.has(c)) continue;
        const dl = Math.abs(c.b[long] - c.a[long]);
        const ds = Math.abs(c.b[short] - c.a[short]);
        if (dl > 0.1 || ds < 0.2) continue;
        if (mid < Math.min(c.a[short], c.b[short]) - 0.05 || mid > Math.max(c.a[short], c.b[short]) + 0.05) continue;
        const pos = (c.a[long] + c.b[long]) / 2;
        const cz = (c.a[2] + c.b[2]) / 2;
        if (Math.abs(pos - e) > 0.2 || cz > z + 0.1 || cz < z - 0.3) continue;
        if (Math.abs(pos - e) < bd) {
          bd = Math.abs(pos - e);
          best = c;
        }
      }
      if (best) found.push(best);
    }
    if (found.length) {
      for (const c of found) decks.push({ level: lv, carrier: carrierIndex.get(c)!, area: area / found.length, kg: kg / found.length });
      if (found.length === 1) note('deckOneSupport', w.part.id);
    } else {
      const n = nearestNode([(w.min[0] + w.max[0]) / 2, (w.min[1] + w.max[1]) / 2, z], 2);
      if (n >= 0) decks.push({ level: lv, node: n, area, kg });
      else lostKg += kg;
      note('deckNoSupport', w.part.id);
    }
  }

  // ---- weight of the parts that are not members
  const modelled = new Set([...mm.map((m) => m.part), ...absorbed]);
  for (const g of st.girders) for (const id of g.parts) modelled.add(id);
  const masses: ScaffoldModel['masses'] = [];
  const weighed = new Set<string>();
  for (const w of st.parts) {
    if (modelled.has(w.part.id) || w.cls.kind === 'deck') continue;
    const kg = partKg(w.part) ?? 0;
    if (!kg) continue;
    const n = nearestNode([(w.min[0] + w.max[0]) / 2, (w.min[1] + w.max[1]) / 2, (w.min[2] + w.max[2]) / 2], 1.5);
    if (n >= 0) {
      masses.push({ node: n, kg });
      weighed.add(w.part.id);
    } else lostKg += kg;
  }

  // groups of members without any support (not connected to the scaffold): left out, reported
  const root = Int32Array.from(nodes, (_, i) => i);
  const find = (a: number): number => {
    while (root[a] !== a) a = root[a] = root[root[a]];
    return a;
  };
  for (const m of fm) root[find(m.i)] = find(m.j);
  const held = new Set(supports.map((q) => find(q.node)));
  const floating = new Set<string>();
  fm.forEach((m, k) => {
    if (held.has(find(m.i))) return;
    mm[k].floating = true;
    floating.add(mm[k].part);
  });
  for (const id of floating) {
    note('floating', id);
    lostKg += partKg(byId.get(id)!.part) ?? 0;
  }

  // ---- fate of every part
  const counts = Object.fromEntries(PART_FATES.map((f) => [f, 0])) as Record<PartFate, number>;
  const listed = new Map<string, { fate: PartFate; name: string; parts: string[] }>();
  for (const w of st.parts) {
    const id = w.part.id;
    const kg = partKg(w.part);
    let f: PartFate;
    if (w.cls.kind === 'deck') f = 'deck';
    else if (modelled.has(id) && !floating.has(id)) f = 'member';
    else if (spliced.has(id)) f = 'joint';
    else if (LOAD_BEARING.has(w.cls.kind)) f = 'loose';
    else if (weighed.has(id)) f = 'weight';
    else if (kg === 0) f = 'included';
    else if (kg === undefined) f = 'noWeight';
    else f = 'none';
    counts[f]++;
    if (FATES_LISTED.includes(f)) {
      const k = `${f}|${w.part.name}`;
      if (!listed.has(k)) listed.set(k, { fate: f, name: w.part.name, parts: [] });
      listed.get(k)!.parts.push(id);
    }
  }
  // ---- self check of the model (an error here is one of the program: reported, tested)
  const defects: ScaffoldModel['defects'] = [];
  const defect = (key: ScaffoldModel['defects'][number]['key'], part: string) => {
    const d = defects.find((x) => x.key === key);
    if (d) {
      if (!d.parts.includes(part)) d.parts.push(part);
    } else defects.push({ key, parts: [part] });
  };
  for (const c of carrierOut)
    for (let i = 1; i < c.members.length; i++) if (fm[c.members[i]].i !== fm[c.members[i - 1]].j) defect('carrierBroken', c.part);
  fm.forEach((x, k) => {
    if (x.i < 0 || x.j < 0 || x.i >= nodes.length || x.j >= nodes.length || x.i === x.j) defect('badNode', mm[k].part);
    else if (memberLength(x) < 1e-4) defect('zeroMember', mm[k].part);
  });

  const audit: ImportAudit = {
    total: st.parts.length,
    counts,
    listed: [...listed.values()].sort((a, b) => FATES_LISTED.indexOf(a.fate) - FATES_LISTED.indexOf(b.fate)),
  };

  // ---- line loads of the user on the members of the parts (not on truss members)
  userLoads.forEach((l, li) => {
    if (l.kind !== 'line') return;
    const ids = new Set(l.parts);
    const found = new Set<string>();
    fm.forEach((m, k) => {
      if (!ids.has(mm[k].part) || m.truss || mm[k].link || mm[k].floating) return;
      user[li].members.push({ m: k, q: l.value });
      found.add(mm[k].part);
    });
    for (const id of l.parts) if (!found.has(id)) note('userLoadIgnored', id, { name: l.name });
  });
  // ---- dynamic horizontal load: on the given parts (head jacks, standards: their top), else on the
  // tops of the standards reaching the top of the scaffold (their head jacks)
  const topOf = (k: number) => heads.find((h) => h.col === k)?.head ?? cols[k].ns[cols[k].ns.length - 1];
  let dhbNodes: number[] = [];
  for (const id of dhbParts) {
    const h = heads.find((x) => x.part === id);
    const k = h ? h.col : cols.findIndex((c) => c.parts.some((p) => p.w.part.id === id));
    if (k >= 0 && !dhbNodes.includes(topOf(k))) dhbNodes.push(topOf(k));
  }
  if (!dhbNodes.length) {
    const topZ = Math.max(...cols.map((c) => c.z1));
    dhbNodes = cols.map((c, k) => (c.z1 >= topZ - 0.5 ? topOf(k) : -1)).filter((n) => n >= 0);
  }

  return {
    frame: { nodes, members: fm, supports },
    members: mm,
    lengths: fm.map(memberLength),
    nodeColumn: Int32Array.from(nodeCol),
    bases,
    anchors,
    assumedSupports,
    levels,
    decks,
    carriers: carrierOut,
    masses,
    lostKg,
    notes,
    user,
    dhbNodes,
    plan,
    audit,
    defects,
    fixings,
  };
}
