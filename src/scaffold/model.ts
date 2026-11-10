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
import type { ScaffoldStructure, WorldPart } from './structure';
import { partKg } from './weights';
import { E_STEEL, G_STEEL, JOINT, LEDGERS, TUBES, VARIANT_TUBE, connKx, connKy, connKz, ubhData, ubkData, ubsData, type DiagonalData, type LedgerHead, type Variant } from './upflex';

export type MKind = 'standard' | 'ledger' | 'bracket' | 'beam' | 'girder' | 'ubk' | 'ubs' | 'ubh' | 'tube' | 'anchor';

export interface ModelMember {
  kind: MKind;
  /** part of the drawing */
  part: string;
  tube?: keyof typeof TUBES;
  /** the member starts at a standard joint */
  joint?: boolean;
  head?: LedgerHead;
  ledger?: keyof typeof LEDGERS;
  /** semi-rigid rosette connection at the start / end: variant of the standard there */
  conn?: [Variant | null, Variant | null];
  diag?: DiagonalData;
  /** weight per metre, kg/m */
  g: number;
  /** carrier (ledger, beam …) this segment belongs to */
  carrier?: number;
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
}

const tubeSection = (t: keyof typeof TUBES): Section3 => ({ EA: E_STEEL * TUBES[t].A, EIy: E_STEEL * TUBES[t].I, EIz: E_STEEL * TUBES[t].I, GJ: G_STEEL * 2 * TUBES[t].I });
const ledgerSection = (l: keyof typeof LEDGERS): Section3 => ({ EA: E_STEEL * LEDGERS[l].A, EIy: E_STEEL * LEDGERS[l].Iy, EIz: E_STEEL * LEDGERS[l].Iz, GJ: G_STEEL * LEDGERS[l].J });

function standardVariant(w: WorldPart): Variant {
  const t = `${w.part.name} ${w.part.desc}`;
  if (/UV[RH]-2/i.test(t)) return '2c';
  if (/UVB\s*(25|50)\b/i.test(t)) return '2b';
  if (/UVB/i.test(t)) return '1b';
  return '1a';
}

function ledgerType(w: WorldPart): { head: LedgerHead; sec: keyof typeof LEDGERS } {
  const t = `${w.part.name} ${w.part.desc}`;
  if (/UH[VA]?-2/i.test(t)) return { head: 'PLUS', sec: 'r24' };
  if (/\+|plus|UHV/i.test(t)) {
    // UH Plus 100 / 125 and UHV: wall 3 mm (from the weights of the parts list), else 2 mm
    const n = Number(/(\d{2,3})/.exec(w.part.name)?.[1]);
    return { head: 'PLUS', sec: /UHV/i.test(t) || n === 100 || n === 125 ? 'r30' : 'r20' };
  }
  return { head: 'UH', sec: 'r20' };
}

const HINGE = [Infinity, Infinity, Infinity, Infinity, 0, 0];
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
  parts: { w: WorldPart; zb: number; zt: number; variant: Variant }[];
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

export function buildScaffoldModel(st: ScaffoldStructure): ScaffoldModel {
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
        return { w, zb, zt, variant: standardVariant(w) };
      })
      .filter((p) => Number.isFinite(p.zb))
      .sort((a, b) => a.zb - b.zb);
    const ros = [...new Set(parts.flatMap((p) => p.w.rosettes.map((r) => Math.round(r[2] * 1000) / 1000)))].sort((a, b) => a - b);
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
  const variantAt = (k: number, z: number): Variant => {
    const c = cols[k];
    let v = c.parts[0].variant;
    for (const p of c.parts) if (p.zb <= z + 0.01) v = p.variant;
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
  /** rosette connection of a ledger end P (other end Q) at a standard */
  const rosetteEnd = (P: V3, Q: V3, head: LedgerHead): Attach | null => {
    const k = colAt(P, 0.12);
    if (k < 0) return null;
    const zr = rosetteNear(k, P[2] - 0.03, 0.08);
    const u = dir2(P, Q);
    if (zr === null) {
      // no rosette at this height: hinged at the standard
      return { node: colNode(k, P[2], 0.03), offset: [u[0] * 0.025, u[1] * 0.025, 0], t: 0, conn: null, k: HINGE };
    }
    const v = variantAt(k, zr);
    // ledgers of 25 cm: vertical spring c_z of the connection (annex A pages 9, 10 and 16), initial stiffness in tension
    const cz = dist2(P, Q) <= 0.3 ? (v[0] === '2' ? 8e6 : 31.5e6) : Infinity;
    return {
      node: colNode(k, zr, 0.006),
      offset: [u[0] * 0.025, u[1] * 0.025, 0.035],
      t: 0,
      conn: v,
      k: [Infinity, Infinity, cz, connKx(head, 0), connKy(head, v, 0), connKz(head, v, 0)],
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
      end: [rosetteEnd(ml[0], ml[1], head), rosetteEnd(ml[1], ml[0], head)],
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

  // lattice girders as equivalent beams along their top chord
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
      if (s < 1e-6) car.end[0] = at;
      else if (s > g.L - 1e-6) car.end[1] = at;
      else car.inter.push(at);
    }
    carriers.push(car);
  }

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

  // ledger ends without a standard: bracket tip, ledger receiver on another ledger / beam, or free
  for (const c of carriers) {
    if (c.kind !== 'ledger') continue;
    for (const e of [0, 1] as const) {
      if (c.end[e]) continue;
      const P = e === 0 ? c.a : c.b;
      const tip = tips.find((t) => dist2(t.p, P) <= 0.15 && Math.abs(t.p[2] - P[2]) <= 0.15);
      if (tip) {
        c.end[e] = { node: tip.node, offset: [P[0] - tip.p[0], P[1] - tip.p[1], P[2] - tip.p[2]], t: e, conn: null, k: HINGE };
        continue;
      }
      const u = carrierUnder(P, c, -0.06, 0.4, ['ledger', 'beam', 'girder', 'bracket']);
      if (u) {
        const n = addNode(u.pr.q);
        u.c.inter.push({ node: n, offset: [0, 0, 0], t: Math.min(Math.max(u.pr.t, 0), 1) });
        c.end[e] = { node: n, offset: [P[0] - u.pr.q[0], P[1] - u.pr.q[1], P[2] - u.pr.q[2]], t: e, conn: null, k: HINGE };
      }
    }
  }

  // standards on or under beams / ledgers; base supports
  const supports: FrameModel3['supports'] = [];
  const bases: BaseSupport[] = [];
  cols.forEach((c, k) => {
    const bottom: V3 = [c.x, c.y, c.z0];
    const under = carrierUnder(bottom, null, -0.1, 0.75, ['beam', 'ledger', 'girder', 'bracket']);
    if (under) {
      under.c.inter.push({ node: c.ns[0], offset: [under.pr.q[0] - c.x, under.pr.q[1] - c.y, under.pr.q[2] - c.z0], t: Math.min(Math.max(under.pr.t, 0), 1) });
      c.onCarrier = true;
      return;
    }
    const isBase = c.parts[0].w.cls.kind === 'base';
    if (isBase || c.z0 <= st.min[2] + 0.4) {
      bases.push({ node: c.ns[0], sup: supports.length, part: c.parts[0].w.part.id, column: k });
      for (const dof of [0, 1, 2]) supports.push({ node: c.ns[0], dof, k: Infinity });
    } else note('columnHanging', c.parts[0].w.part.id);
  });
  // tops of standards under a beam carry it
  for (const car of carriers) {
    if (car.kind !== 'beam') continue;
    cols.forEach((c) => {
      const top: V3 = [c.x, c.y, c.z1];
      const pr = project(car, top);
      if (pr.t < -0.02 || pr.t > 1.02 || pr.dh > 0.15 || pr.dz > 0.05 || pr.dz < -0.5) return;
      car.inter.push({ node: c.ns[c.ns.length - 1], offset: [pr.q[0] - c.x, pr.q[1] - c.y, pr.q[2] - c.z1], t: Math.min(Math.max(pr.t, 0), 1), k: HINGE });
    });
  }

  // ---- frame members
  const fm: Member3[] = [];
  const mm: ModelMember[] = [];
  /** length of a member between its connection points (the rigid arms excluded) */
  const memberLength = (m: Member3): number => {
    const oi = m.ends?.[0]?.offset ?? [0, 0, 0];
    const oj = m.ends?.[1]?.offset ?? [0, 0, 0];
    return Math.hypot(nodes[m.j][0] + oj[0] - nodes[m.i][0] - oi[0], nodes[m.j][1] + oj[1] - nodes[m.i][1] - oi[1], nodes[m.j][2] + oj[2] - nodes[m.i][2] - oi[2]);
  };
  const carrierOut: ScaffoldModel['carriers'] = [];
  const assumedSupports: ScaffoldModel['assumedSupports'] = [];
  const carrierIndex = new Map<Carrier, number>();
  for (const c of carriers) {
    // something attached right at a free end becomes that end
    for (const e of [0, 1] as const) {
      if (c.end[e]) continue;
      const k = c.inter.findIndex((a) => (e === 0 ? a.t <= 0.02 : a.t >= 0.98));
      if (k >= 0) c.end[e] = { ...c.inter.splice(k, 1)[0], t: e, k: undefined };
    }
    // a ledger held at one hinged end only (the other end hangs in the air) cannot carry anything
    if (c.kind === 'ledger' && !c.inter.length) {
      const held = c.end.filter((e) => e);
      if (!held.length || (held.length === 1 && held[0]!.k === HINGE)) {
        note('ledgerLoose', c.part);
        continue;
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
    const pts = [c.end[0]!, ...c.inter.filter((a) => a.t > 0.002 && a.t < 0.998).sort((a, b) => a.t - b.t), c.end[1]!];
    // attachments at the very ends share the end node through a rigid arm
    for (const a of c.inter) if (a.t <= 0.002 || a.t >= 0.998) pts.splice(a.t <= 0.002 ? 1 : pts.length - 1, 0, a);
    const members: number[] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const A = pts[i];
      const B = pts[i + 1];
      if (A.node === B.node) continue;
      const pa: V3 = [nodes[A.node][0] + A.offset[0], nodes[A.node][1] + A.offset[1], nodes[A.node][2] + A.offset[2]];
      const pb: V3 = [nodes[B.node][0] + B.offset[0], nodes[B.node][1] + B.offset[1], nodes[B.node][2] + B.offset[2]];
      if (len3(pa, pb) < 0.02) continue;
      const first = i === 0;
      const last = i + 2 === pts.length;
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
        g: c.g,
        carrier: carrierOut.length,
      });
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

  // ---- diagonals
  const trussSec = (ea: number): Section3 => ({ EA: ea, EIy: 1, EIz: 1, GJ: 1 });
  for (const w of st.parts) {
    if (w.cls.kind !== 'diagonal') continue;
    const name = `${w.part.name} ${w.part.desc}`;
    const kind: MKind | null = /UBK/i.test(name) ? 'ubk' : /UBH/i.test(name) ? 'ubh' : /UBS/i.test(name) ? 'ubs' : null;
    const ml = longestLine(w);
    if (!kind || !ml) {
      note('diagonalType', w.part.id, { names: w.part.name });
      continue;
    }
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
    } else d = kind === 'ubk' ? ubkData(Lh, Math.abs(zb - za), r6) : ubsData(Lh, Math.abs(zb - za), r6);
    const L = len3(nodes[na], nodes[nb]);
    fm.push({ i: na, j: nb, sec: trussSec(d.eaT), truss: true });
    mm.push({ kind, part: w.part.id, diag: d, g: (partKg(w.part) ?? 3.5 * L) / L });
  }
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
  }
  for (const w of st.parts) {
    if ((w.cls.kind !== 'tube' && w.cls.kind !== 'anchor') || anchorTubes.has(w.part.id)) continue;
    const ml = longestLine(w);
    if (!ml) continue;
    const ka = colAt(ml[0], 0.3, 0.15);
    const kb = colAt(ml[1], 0.3, 0.15);
    if (ka < 0 || kb < 0 || ka === kb) {
      note('tubeFree', w.part.id);
      continue;
    }
    const na = colNode(ka, ml[0][2], 0.03);
    const nb = colNode(kb, ml[1][2], 0.03);
    fm.push({ i: na, j: nb, sec: trussSec(E_STEEL * TUBES.t32.A), truss: true });
    mm.push({ kind: 'tube', part: w.part.id, tube: 't32', g: TUBES.t32.g });
  }

  // ---- standards (after all nodes on them exist)
  cols.forEach((c) => {
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
      mm.push({ kind: 'standard', part: p.w.part.id, tube: t, joint, g: (partKg(p.w.part) ?? TUBES[t].g * nominal) / nominal });
    }
  });


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
        if (!carrierIndex.has(c)) continue;
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
  const modelled = new Set(mm.map((m) => m.part));
  for (const g of st.girders) for (const id of g.parts) modelled.add(id);
  const masses: ScaffoldModel['masses'] = [];
  for (const w of st.parts) {
    if (modelled.has(w.part.id) || w.cls.kind === 'deck') continue;
    const kg = partKg(w.part) ?? 0;
    if (!kg) continue;
    const n = nearestNode([(w.min[0] + w.max[0]) / 2, (w.min[1] + w.max[1]) / 2, (w.min[2] + w.max[2]) / 2], 1.5);
    if (n >= 0) masses.push({ node: n, kg });
    else lostKg += kg;
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
  };
}
