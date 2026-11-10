/**
 * Analysis of a PERI UP Flex scaffold as a space frame, in the way of a member analysis program
 * (RSTAB): loads and combinations after DIN EN 12811-1, non-linear iteration (secant stiffness of
 * the rosette connections, slack and tension / compression stiffness of the diagonals, one-sided
 * bases, second-order theory with sway imperfection), checks after the approval Z-8.22-863.
 */
import { Frame3, FrameError3, emptyLoads3, localAxes, sectionForces, type Loads3, type MemberResult, type MemberState, type V3 } from '../core/frame3d';
import { standardBuckling } from '../core/latticePeri';
import type { ScaffoldModel } from './model';
import { COUPLER_RD, E_STEEL, JACK, JOINT, LEDGERS, TUBES, connCz, connInteraction, connKx, connKy, connKz, connResistance, tubeUtilisation, type ConnForces } from './upflex';

const G = 9.81;

export interface AnalysisOptions {
  /** service load, N/m² */
  p: number;
  /** service class 1…6 (share of the service load together with the maximum wind) */
  loadClass: number;
  /** loaded deck level (index of model.levels) or −1: the level with the largest deck area */
  level: number;
  outdoor: boolean;
  /** velocity pressure of the working wind, N/m² (EN 12811-1: 200) */
  qWork: number;
  /** peak velocity pressure of the maximum wind, N/m² (0: no out-of-service combination) */
  qMax: number;
  /** aerodynamic force coefficient of the members */
  cf: number;
  /** snow on the decks, N/m² (0: none) */
  snow: number;
  /** ice on the members: thickness, m (0: none) */
  ice: number;
  /** second-order theory with sway imperfection */
  secondOrder: boolean;
}

export const DEFAULT_ANALYSIS: AnalysisOptions = { p: 2000, loadClass: 3, level: -1, outdoor: true, qWork: 200, qMax: 0, cf: 1.3, snow: 0, ice: 0, secondOrder: true };

/** partial factor for all actions (EN 12811-1, 10.3.2) */
export const GAMMA_F = 1.5;

export type CheckKind = 'conn' | 'node' | 'tube' | 'buckling' | 'joint' | 'ledger' | 'diagonal' | 'anchor' | 'coupler' | 'uplift' | 'jack' | 'unstable' | 'stability';

export interface PartCheck {
  part: string;
  check: CheckKind;
  eta: number;
  combo: string;
  /** governing equation or detail */
  detail?: string;
  /** forces at the governing place, N / N·m */
  N?: number;
  M?: number;
  V?: number;
}

export interface ComboResult {
  name: string;
  ok: boolean;
  iterations: number;
  converged: boolean;
  /** bases in tension were kept (lifting off would leave a mechanism) */
  noLift?: boolean;
  /** stability lost with the second order (results of the first order): parts where the system gives way */
  stability?: string[];
  /** node of a mechanism / instability */
  errorNode?: number;
  /** largest horizontal and vertical displacement, m, and their nodes */
  dh: number;
  dv: number;
  dhNode?: number;
  dvNode?: number;
  /** sum of the vertical support forces, N */
  sumV: number;
}

export interface BaseResult {
  part: string;
  node: number;
  /** vertical force on the base: largest compression (positive) and smallest value (negative: uplift) */
  Vmax: number;
  Vmin: number;
  H: number;
  combo: string;
}

export interface ForceResult {
  part: string;
  /** axial force range, N (tension positive) */
  Nmax: number;
  Nmin: number;
  eta: number;
  combo: string;
}

export interface BeamResult {
  part: string;
  length: number;
  points: {
    /** position along the beam, 0…1 */
    t: number;
    support: boolean;
    /** largest load on the beam (downwards positive) or largest support force (upwards positive), N */
    F: number;
    combo: string;
  }[];
}

export interface ScaffoldResult {
  combos: ComboResult[];
  /** governing check of every part (largest utilisation) */
  checks: PartCheck[];
  /** largest utilisation by part */
  eta: Record<string, number>;
  bases: BaseResult[];
  anchors: ForceResult[];
  /** assumed supports of beams: vertical force, N */
  beamSupports: { part: string; node: number; V: number }[];
  /** beams SRU / RCS: what stands on them and their supports (design values, envelope) */
  beams: BeamResult[];
  /** loaded level and total loads (characteristic), N */
  level: number;
  totalG: number;
  totalQ: number;
  /** number of unknowns */
  unknowns: number;
  /** degrees of freedom without stiffness held by a weak spring (mechanisms) */
  weak: number;
  /** factorisations of the stiffness matrix, calls and steps of the conjugate gradients (statistics) */
  factorisations: number;
  pcg: [number, number];
  /** parts of a mechanism: their weak spring takes a noticeable force */
  unstable: string[];
}

/** weak springs on degrees of freedom without stiffness (N/m, N·m/rad) and the force that counts */
const SOFT_T = 1e6;
const SOFT_R = 1e4;
const SOFT_F = 50;
const SOFT_M = 20;

/**
 * Degrees of freedom without stiffness (mechanisms), found by a factorisation with all diagonals
 * out: every zero pivot is fixed and listed (as AUTOSPC in other programs).
 */
export function weakDofs(model: ScaffoldModel): number[] {
  const spc: number[] = [];
  const states = model.members.map((m) => (m.diag || m.floating ? { active: false } : undefined));
  try {
    new Frame3(model.frame).solve(emptyLoads3(model.frame), states, undefined, { spc });
  } catch (e) {
    if (!(e instanceof FrameError3)) throw e;
  }
  return spc;
}

interface Combo {
  name: string;
  loads: Loads3;
}

/** unit vectors of the four horizontal directions */
const DIRS: [string, V3][] = [
  ['+x', [1, 0, 0]],
  ['−x', [-1, 0, 0]],
  ['+y', [0, 1, 0]],
  ['−y', [0, -1, 0]],
];

function addScaled(dst: Loads3, src: Loads3, f: number) {
  for (let i = 0; i < src.nodal.length; i++) dst.nodal[i] += f * src.nodal[i];
  for (const l of src.member) dst.member.push({ m: l.m, q: [l.q[0] * f, l.q[1] * f, l.q[2] * f] });
}

/** horizontal loads ψ × vertical loads in the direction d (sway imperfection as equivalent loads) */
function swayOf(src: Loads3, psi: number, d: V3, model: ScaffoldModel): Loads3 {
  const out = emptyLoads3(model.frame);
  for (let n = 0; n < model.frame.nodes.length; n++) {
    const v = -src.nodal[n * 6 + 2] * psi;
    out.nodal[n * 6] += v * d[0];
    out.nodal[n * 6 + 1] += v * d[1];
  }
  for (const l of src.member) {
    const v = -l.q[2] * psi;
    if (v) out.member.push({ m: l.m, q: [v * d[0], v * d[1], 0] });
  }
  return out;
}

export function buildLoadCases(model: ScaffoldModel, opt: AnalysisOptions) {
  const { frame, members } = model;
  const mlen = model.lengths;
  const level = opt.level >= 0 && opt.level < model.levels.length ? opt.level : model.levels.reduce((best, l, k) => (l.area > (model.levels[best]?.area ?? -1) ? k : best), 0);

  // G: self weight of members, decks and other parts (+ ice)
  const g = emptyLoads3(frame);
  const width = (k: number) => (members[k].kind === 'ledger' ? 0.06 : members[k].kind === 'beam' ? 0.12 : members[k].kind === 'girder' ? 0.2 : 0.0483);
  frame.members.forEach((_, k) => {
    let w = members[k].g * G;
    if (opt.ice > 0) {
      const d = width(k);
      w += 900 * G * Math.PI * ((d / 2 + opt.ice) ** 2 - (d / 2) ** 2);
    }
    g.member.push({ m: k, q: [0, 0, -w] });
  });
  const onCarrier = (ld: Loads3, c: number, F: number) => {
    const car = model.carriers[c];
    if (!car.members.length || !(car.length > 0)) return;
    for (const m of car.members) ld.member.push({ m, q: [0, 0, -F / car.length] });
  };
  for (const d of model.decks) {
    if (d.carrier !== undefined) onCarrier(g, d.carrier, d.kg * G);
    else if (d.node !== undefined) g.nodal[d.node * 6 + 2] -= d.kg * G;
  }
  for (const m of model.masses) g.nodal[m.node * 6 + 2] -= m.kg * G;

  // Q: service load on the chosen level; S: snow on all decks
  const q = emptyLoads3(frame);
  const s = emptyLoads3(frame);
  let totalQ = 0;
  for (const d of model.decks) {
    if (d.level === level) {
      totalQ += d.area * opt.p;
      if (d.carrier !== undefined) onCarrier(q, d.carrier, d.area * opt.p);
      else if (d.node !== undefined) q.nodal[d.node * 6 + 2] -= d.area * opt.p;
    }
    if (opt.snow > 0) {
      if (d.carrier !== undefined) onCarrier(s, d.carrier, d.area * opt.snow);
      else if (d.node !== undefined) s.nodal[d.node * 6 + 2] -= d.area * opt.snow;
    }
  }
  let totalG = 0;
  for (const l of g.member) totalG -= l.q[2] * mlen[l.m];
  for (let n = 0; n < frame.nodes.length; n++) totalG -= g.nodal[n * 6 + 2];

  /** wind with the velocity pressure 1 N/m² in the direction d; h: height of the equivalent area on the deck levels */
  const wind = (d: V3, h: number): Loads3 => {
    const w = emptyLoads3(frame);
    frame.members.forEach((m, k) => {
      const a = frame.nodes[m.i];
      const b = frame.nodes[m.j];
      const L = mlen[k] || 1;
      const t: V3 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L, (b[2] - a[2]) / L];
      // component of the wind perpendicular to the member
      const dt = d[0] * t[0] + d[1] * t[1] + d[2] * t[2];
      const e: V3 = [d[0] - dt * t[0], d[1] - dt * t[1], d[2] - dt * t[2]];
      const f = opt.cf * (width(k) + 2 * opt.ice);
      if (Math.hypot(...e) > 1e-6) w.member.push({ m: k, q: [e[0] * f, e[1] * f, 0] });
    });
    // equipment and material on the decks: area of the height h along the deck level, once per level
    model.levels.forEach((_, lv) => {
      const cars = [...new Set(model.decks.filter((x) => x.level === lv && x.carrier !== undefined).map((x) => x.carrier!))];
      const ns = [...new Set(cars.flatMap((c) => model.carriers[c].members.flatMap((m) => [frame.members[m].i, frame.members[m].j])))];
      if (!ns.length) return;
      // extent of the level across the wind
      let lo = Infinity;
      let hi = -Infinity;
      for (const n of ns) {
        const v = -frame.nodes[n][0] * d[1] + frame.nodes[n][1] * d[0];
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      const F = opt.cf * h * Math.max(hi - lo, 0);
      for (const n of ns) {
        w.nodal[n * 6] += (F / ns.length) * d[0];
        w.nodal[n * 6 + 1] += (F / ns.length) * d[1];
      }
    });
    return w;
  };
  /** notional horizontal load: 2.5 % of the service load (at least 0.3 kN) at the loaded level */
  const notional = (d: V3): Loads3 => {
    const w = emptyLoads3(frame);
    const cars = [...new Set(model.decks.filter((x) => x.level === level && x.carrier !== undefined).map((x) => x.carrier!))];
    const ns = [...new Set(cars.flatMap((c) => model.carriers[c].members.flatMap((m) => [frame.members[m].i, frame.members[m].j])))];
    const F = Math.max(0.025 * totalQ, totalQ > 0 ? 300 : 0);
    for (const n of ns) {
      w.nodal[n * 6] += (F / ns.length) * d[0];
      w.nodal[n * 6 + 1] += (F / ns.length) * d[1];
    }
    return w;
  };
  return { g, q, s, wind, notional, level, totalG, totalQ };
}

/** combinations of EN 12811-1 (working and out of service), γ_F = 1.5, with sway imperfection */
export function buildCombos(model: ScaffoldModel, opt: AnalysisOptions): { combos: Combo[]; level: number; totalG: number; totalQ: number } {
  const lc = buildLoadCases(model, opt);
  const nCols = Math.max(1, new Set(Array.from(model.nodeColumn).filter((c) => c >= 0)).size);
  // inclination at the standard joints, reduced for n standards side by side (EN 12811-1, 10.2.2.2)
  const psi = opt.secondOrder ? 0.01 * Math.sqrt(0.5 + 1 / nCols) : 0;
  const share = opt.loadClass <= 1 ? 0 : opt.loadClass <= 3 ? 0.25 : 0.5;
  const combos: Combo[] = [];
  for (const [dn, d] of DIRS) {
    // working: G + Q + working wind (outdoors) or notional horizontal load
    const v = emptyLoads3(model.frame);
    addScaled(v, lc.g, GAMMA_F);
    addScaled(v, lc.q, GAMMA_F);
    const c = emptyLoads3(model.frame);
    addScaled(c, v, 1);
    if (opt.outdoor && opt.qWork > 0) addScaled(c, lc.wind(d, 0.4), GAMMA_F * opt.qWork);
    else addScaled(c, lc.notional(d), GAMMA_F);
    if (psi) addScaled(c, swayOf(v, psi, d, model), 1);
    combos.push({ name: `A ${dn}`, loads: c });
  }
  if (opt.outdoor && opt.qMax > 0)
    for (const [dn, d] of DIRS) {
      const v = emptyLoads3(model.frame);
      addScaled(v, lc.g, GAMMA_F);
      addScaled(v, lc.q, GAMMA_F * share);
      if (opt.snow > 0) addScaled(v, lc.s, GAMMA_F);
      const c = emptyLoads3(model.frame);
      addScaled(c, v, 1);
      addScaled(c, lc.wind(d, 0.2), GAMMA_F * opt.qMax);
      if (psi) addScaled(c, swayOf(v, psi, d, model), 1);
      combos.push({ name: `R ${dn}`, loads: c });
    }
  return { combos, level: lc.level, totalG: lc.totalG, totalQ: lc.totalQ };
}

interface Solved {
  r: { u: Float64Array; members: (MemberResult | null)[]; reactions: Float64Array };
  iterations: number;
  converged: boolean;
  /** bases kept two-sided because lifting off would leave a mechanism */
  noLift: boolean;
  /** the system lost its stability with the second order: mode, member forces then; continued in first order */
  stability?: { node: number; mode: Float64Array | null; N: Float64Array };
}

/** non-linear solution of one combination */
/** most iterations of one combination */
export const MAX_ITERATIONS = 14;

/**
 * A scaffold does not move by a metre (or turn by a radian): degrees of freedom moving that far in the
 * first, linear step are nearly free (a mechanism with a little stiffness left). They get weak springs
 * like the free ones, and the combination is run again.
 */
const NEAR_FREE_T = 1;
const NEAR_FREE_R = 1;

export class NearlyFreeError extends Error {
  constructor(public dofs: number[]) {
    super('analysis: nearly free degrees of freedom');
  }
}

/** non-linear solution of one combination; `onStep` after every iteration (its number) */
function solveCombo(fr: Frame3, model: ScaffoldModel, loads: Loads3, secondOrder0: boolean, onStep?: (it: number) => void): Solved {
  const { frame, members } = model;
  let secondOrder = secondOrder0;
  let stability: Solved['stability'];
  const nM = frame.members.length;
  const states: (MemberState | undefined)[] = new Array(nM).fill(undefined);
  // connection stiffness [i, j] as [kx, ky, kz] rotational and the vertical spring c_z (Infinity: none);
  // diagonals: −1, 0, +1
  const kc: (number[] | null)[][] = members.map((m, k) =>
    m.conn
      ? [0, 1].map((e) => (m.conn![e] ? [frame.members[k].ends![e]!.k![3], frame.members[k].ends![e]!.k![4], frame.members[k].ends![e]!.k![5], frame.members[k].ends![e]!.k![2]] : null))
      : [null, null],
  );
  const dstate = new Int8Array(nM);
  const flips = new Uint8Array(nM);
  let noLift = false;
  const supActive = frame.supports.map(() => true);
  const axis = frame.members.map((m) => {
    const a = frame.nodes[m.i];
    const b = frame.nodes[m.j];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
    return { t: [(b[0] - a[0]) / L, (b[1] - a[1]) / L, (b[2] - a[2]) / L] as V3, L };
  });
  const makeStates = (Ns: Float64Array | null, first: boolean) => {
    for (let k = 0; k < nM; k++) {
      const m = members[k];
      const st: MemberState = {};
      if (m.floating) st.active = false;
      else if (m.diag) {
        if (dstate[k] === 0) st.active = false;
        else {
          // first step: linear, without slack
          st.elong = first ? 0 : dstate[k] * m.diag.slack;
          st.eaFactor = dstate[k] > 0 ? 1 : m.diag.eaC / m.diag.eaT;
        }
      } else {
        if (secondOrder && Ns) st.N = Ns[k];
        if (m.conn && (kc[k][0] || kc[k][1])) {
          const e = frame.members[k].ends!;
          st.k = [0, 1].map((i) => (kc[k][i] ? [Infinity, Infinity, kc[k][i]![3], kc[k][i]![0], kc[k][i]![1], kc[k][i]![2]] : e[i]?.k)) as MemberState['k'];
        }
      }
      states[k] = st;
    }
  };
  // first step: diagonals act without slack; then the slack decides whether and how they act
  for (let k = 0; k < nM; k++) if (members[k].diag) dstate[k] = 1;
  let Ns: Float64Array | null = null;
  let r!: Solved['r'];
  let converged = false;
  let it = 0;
  const MAX = MAX_ITERATIONS;
  for (it = 1; it <= MAX; it++) {
    if (it > 1) onStep?.(it - 1);
    makeStates(Ns, it === 1);
    try {
      r = fr.solve(loads, states, supActive, { reuse: true });
      if (it === 1) {
        const far: number[] = [];
        for (let d = 0; d < r.u.length; d++) if (Math.abs(r.u[d]) > (d % 6 < 3 ? NEAR_FREE_T : NEAR_FREE_R)) far.push(d);
        if (far.length) throw new NearlyFreeError(far);
      }
    } catch (e) {
      if (e instanceof NearlyFreeError) throw e;
      if (e instanceof FrameError3 && e.kind === 'displacement') throw new NearlyFreeError([e.node * 6 + e.dof]);
      // bases that lifted off left a mechanism: keep all bases two-sided (the uplift is reported)
      if (e instanceof FrameError3 && !noLift && supActive.some((x) => !x)) {
        noLift = true;
        supActive.fill(true);
        it--;
        continue;
      }
      // not positive definite with the axial forces: the system loses its stability (second order).
      // Where it gives way is kept; the combination goes on in first order.
      if (e instanceof FrameError3 && e.kind === 'pivot' && secondOrder && Ns) {
        stability = { node: e.node, mode: e.mode, N: Ns };
        secondOrder = false;
        Ns = null;
        it--;
        continue;
      }
      throw e;
    }
    let changed = false;
    let dk = 0;
    // diagonals: elongation of the member axis between its nodes
    for (let k = 0; k < nM; k++) {
      const m = members[k];
      if (!m.diag) continue;
      const fmk = frame.members[k];
      const t = axis[k].t;
      let d = 0;
      for (let c = 0; c < 3; c++) d += (r.u[fmk.j * 6 + c] - r.u[fmk.i * 6 + c]) * t[c];
      const s = d > m.diag.slack ? 1 : d < -m.diag.slack ? -1 : 0;
      // a diagonal that keeps switching stays out (its slack is not used up reliably)
      if (s !== dstate[k] && flips[k] < 4) {
        flips[k]++;
        dstate[k] = flips[k] >= 4 ? 0 : s;
        changed = true;
      }
    }
    // connections: secant stiffness from the end moments
    const newN = new Float64Array(nM);
    for (let k = 0; k < nM; k++) {
      const mr = r.members[k];
      if (!mr) continue;
      newN[k] = mr.N;
      const m = members[k];
      if (!m.conn) continue;
      for (const e of [0, 1]) {
        const v = m.conn[e];
        const cur = kc[k][e];
        if (!v || !cur) continue;
        const sf = sectionForces(mr, e === 0 ? 0 : mr.L);
        // approval: My positive = tension at the bottom; ours: positive = tension on top
        const target = [connKx(m.head!, sf.Mx), connKy(m.head!, v, -sf.My), connKz(m.head!, v, sf.Mz)];
        // vertical spring: the ledger pushing the rosette down (end force on the member upwards) is
        // compression in the spring
        if (Number.isFinite(cur[3])) target.push(connCz(v, -(e === 0 ? mr.fi[2] : mr.fj[2])));
        for (let c = 0; c < target.length; c++) {
          const nk = 0.5 * (cur[c] + target[c]);
          dk = Math.max(dk, Math.abs(nk - cur[c]) / cur[c]);
          cur[c] = nk;
        }
      }
    }
    // bases: no tension
    for (const b of model.bases) {
      const Rz = r.reactions[b.sup + 2];
      const uz = r.u[b.node * 6 + 2];
      const on = supActive[b.sup + 2];
      const want = noLift ? true : on ? Rz >= -1e-6 : uz < 0;
      if (want !== on) {
        supActive[b.sup + 2] = want;
        changed = true;
      }
    }
    let dN = 0;
    if (secondOrder) {
      if (Ns) for (let k = 0; k < nM; k++) dN = Math.max(dN, Math.abs(newN[k] - Ns[k]) / (Math.abs(newN[k]) + 500));
      else dN = 1;
      Ns = newN;
    }
    if (!changed && dk < 0.03 && dN < 0.02 && it > 1) {
      converged = true;
      break;
    }
  }
  return { r, iterations: Math.min(it, MAX), converged, noLift, stability };
}

/** set-up of the analysis: solver, combinations, check data; the combinations are run one by one */
export function prepareAnalysis(model: ScaffoldModel, opt: AnalysisOptions, weakIn?: number[], onStep?: (it: number) => void) {
  const { frame, members } = model;
  // mechanisms: weak springs keep the analysis going; their forces show what is not held
  const weak = weakIn ?? weakDofs(model);
  const soft = weak.map((d) => ({ node: Math.floor(d / 6), dof: d % 6, k: d % 6 < 3 ? SOFT_T : SOFT_R }));
  const fr = new Frame3({ ...frame, supports: [...frame.supports, ...soft] });
  const partsAt = new Map<number, Set<string>>();
  frame.members.forEach((m, k) => {
    for (const n of [m.i, m.j]) (partsAt.get(n) ?? partsAt.set(n, new Set()).get(n)!).add(members[k].part);
  });
  const unstable = new Set<string>();
  const { combos, level, totalG, totalQ } = buildCombos(model, opt);
  const best = new Map<string, PartCheck>();
  const put = (c: PartCheck) => {
    if (!Number.isFinite(c.eta)) c.eta = 99;
    const key = `${c.part}|${c.check}`;
    const o = best.get(key);
    if (!o || c.eta > o.eta) best.set(key, c);
  };
  const baseRes = new Map<number, BaseResult>();
  const anchorRes = new Map<string, ForceResult>();
  const beamSup = new Map<number, { part: string; node: number; V: number }>();
  const out: ComboResult[] = [];

  // lateral restraint of the standards: nodes with a ledger, diagonal, anchor or support
  const held = new Uint8Array(frame.nodes.length);
  frame.members.forEach((m, k) => {
    if (members[k].kind !== 'standard') {
      held[m.i] = 1;
      held[m.j] = 1;
    }
  });
  for (const s of frame.supports) held[s.node] = 1;
  // buckling length of every standard member: distance of the held nodes below and above
  const colNodes = new Map<number, number[]>();
  model.nodeColumn.forEach((c, n) => {
    if (c >= 0) (colNodes.get(c) ?? colNodes.set(c, []).get(c)!).push(n);
  });
  const lcr = new Float64Array(frame.members.length);
  for (const ns of colNodes.values()) {
    ns.sort((a, b) => frame.nodes[a][2] - frame.nodes[b][2]);
    const hz = ns.filter((n, i) => held[n] || i === 0 || i === ns.length - 1).map((n) => frame.nodes[n][2]);
    frame.members.forEach((m, k) => {
      if (members[k].kind !== 'standard' || model.nodeColumn[m.i] !== model.nodeColumn[ns[0]]) return;
      const zm = (frame.nodes[m.i][2] + frame.nodes[m.j][2]) / 2;
      let lo = hz[0];
      let hi = hz[hz.length - 1];
      for (const z of hz) {
        if (z <= zm) lo = z;
        if (z >= zm && z < hi) hi = z;
      }
      // a free top (cantilever) buckles with twice its length
      const top = hi === hz[hz.length - 1] && !held[ns[ns.length - 1]];
      lcr[k] = Math.max((hi - lo) * (top ? 2 : 1), 0.25);
    });
  }
  // ledger connections by node (for the interaction standard / connection)
  const connAt = new Map<number, { k: number; e: number }[]>();
  frame.members.forEach((m, k) => {
    const c = members[k].conn;
    if (!c) return;
    if (c[0]) (connAt.get(m.i) ?? connAt.set(m.i, []).get(m.i)!).push({ k, e: 0 });
    if (c[1]) (connAt.get(m.j) ?? connAt.set(m.j, []).get(m.j)!).push({ k, e: 1 });
  });
  // beams: vertical component of the local axes of their members
  const beamRes: BeamResult[] = [];
  const beamOf: { car: number; res: BeamResult }[] = [];
  model.carriers.forEach((c, k) => {
    if (c.kind !== 'beam' || !c.points) return;
    const res: BeamResult = { part: c.part, length: c.length, points: c.points.map((p) => ({ t: p.t, support: p.support, F: 0, combo: '' })) };
    beamRes.push(res);
    beamOf.push({ car: k, res });
  });
  const zAxis = (k: number): [number, number, number] => {
    const m = frame.members[k];
    const oi = m.ends?.[0]?.offset ?? [0, 0, 0];
    const oj = m.ends?.[1]?.offset ?? [0, 0, 0];
    const a = frame.nodes[m.i];
    const b = frame.nodes[m.j];
    const { R } = localAxes([a[0] + oi[0], a[1] + oi[1], a[2] + oi[2]], [b[0] + oj[0], b[1] + oj[1], b[2] + oj[2]]);
    return [R[2], R[5], R[8]];
  };
  const stdAt = new Map<number, number[]>();
  frame.members.forEach((m, k) => {
    if (members[k].kind !== 'standard') return;
    for (const n of [m.i, m.j]) (stdAt.get(n) ?? stdAt.set(n, []).get(n)!).push(k);
  });

  /** rounds of weak springs added for nearly free degrees of freedom (all combinations) */
  let rounds = 0;
  const runCombo = (cb: Combo) => {
    let sol: Solved;
    try {
      sol = solveCombo(fr, model, cb.loads, opt.secondOrder, onStep);
    } catch (e) {
      // a nearly free degree of freedom (some stiffness left, but far too little): held by a weak
      // spring as the free ones, and the combination again
      if (e instanceof NearlyFreeError && rounds < 8) {
        rounds++;
        const have = new Set(soft.map((q) => q.node * 6 + q.dof));
        for (const d of e.dofs) {
          if (have.has(d)) continue;
          const sp = { node: Math.floor(d / 6), dof: d % 6, k: d % 6 < 3 ? SOFT_T : SOFT_R };
          soft.push(sp);
          fr.addSupport(sp);
        }
        runCombo(cb);
        return;
      }
      if (e instanceof NearlyFreeError || e instanceof FrameError3) {
        const node = e instanceof NearlyFreeError ? Math.floor(e.dofs[0] / 6) : e.node;
        out.push({ name: cb.name, ok: false, iterations: 0, converged: false, errorNode: node, dh: 0, dv: 0, sumV: 0 });
        return;
      }
      throw e;
    }
    const { r } = sol;
    let dh = 0;
    let dv = 0;
    let dhNode = -1;
    let dvNode = -1;
    for (let n = 0; n < frame.nodes.length; n++) {
      const h = Math.hypot(r.u[n * 6], r.u[n * 6 + 1]);
      const v = Math.abs(r.u[n * 6 + 2]);
      if (h > dh) [dh, dhNode] = [h, n];
      if (v > dv) [dv, dvNode] = [v, n];
    }
    let sumV = 0;
    frame.supports.forEach((sp, k) => {
      if (sp.dof === 2) sumV += r.reactions[k];
    });
    // stability lost with the second order: the parts where the system gives way (largest displacements
    // of the mode), with the compression of the standards there against their Euler load
    let stabilityParts: string[] | undefined;
    if (sol.stability) {
      const { mode, node, N } = sol.stability;
      const amp = new Float64Array(frame.nodes.length);
      let top = 0;
      if (mode) for (let n = 0; n < amp.length; n++) top = Math.max(top, (amp[n] = Math.hypot(mode[n * 6], mode[n * 6 + 1], mode[n * 6 + 2])));
      const zone = new Set<number>([node]);
      if (top > 0) for (let n = 0; n < amp.length; n++) if (amp[n] >= 0.3 * top) zone.add(n);
      const found = new Map<string, { eta: number; detail?: string; N?: number }>();
      frame.members.forEach((fmk, k) => {
        if (!zone.has(fmk.i) && !zone.has(fmk.j)) return;
        const m = members[k];
        if (m.floating) return;
        let eta = 1.01;
        let detail: string | undefined;
        if (m.kind === 'standard' && N[k] < 0) {
          const Ncr = (Math.PI ** 2 * E_STEEL * TUBES[m.tube!].I) / lcr[k] ** 2;
          eta = Math.max(1.01, -N[k] / Ncr);
          detail = `N = ${(N[k] / 1e3).toFixed(1)} kN, L_cr = ${lcr[k].toFixed(2)} m, N_cr = ${(Ncr / 1e3).toFixed(1)} kN`;
        }
        const o = found.get(m.part);
        if (!o || eta > o.eta) found.set(m.part, { eta, detail, N: N[k] });
      });
      // the most loaded parts of the zone (a large zone is a sway of the whole scaffold)
      const list = [...found.entries()].sort((a, b) => b[1].eta - a[1].eta).slice(0, 200);
      stabilityParts = list.map(([id]) => id);
      for (const [part, f] of list) put({ part, check: 'stability', eta: f.eta, combo: cb.name, detail: f.detail, N: f.N });
    }
    out.push({ name: cb.name, ok: true, iterations: sol.iterations, converged: sol.converged, noLift: sol.noLift, stability: stabilityParts, dh, dv, dhNode, dvNode, sumV });

    // utilisation of the standard tube at both ends of a member
    const tubeEta = (k: number, x: number) => {
      const mr = r.members[k]!;
      const T = TUBES[members[k].tube!];
      const sf = sectionForces(mr, x);
      const M = Math.hypot(sf.My, sf.Mz);
      return { eta: tubeUtilisation(sf.N / T.NRd, M / T.MRd), N: sf.N, M, V: Math.hypot(sf.Vy, sf.Vz) };
    };

    frame.members.forEach((_, k) => {
      const mr = r.members[k];
      const m = members[k];
      if (!mr) return;
      if (m.kind === 'standard' || m.kind === 'bracket') {
        for (const x of [0, mr.L]) {
          const t = tubeEta(k, x);
          put({ part: m.part, check: 'tube', eta: t.eta, combo: cb.name, N: t.N, M: t.M, V: t.V });
        }
        if (m.kind === 'standard') {
          const T = TUBES[m.tube!];
          const N = Math.min(sectionForces(mr, 0).N, sectionForces(mr, mr.L).N);
          if (N < 0) {
            const dims = m.tube === 't27' ? [48.3, 2.7, 320] : m.tube === 't36' ? [48.3, 3.6, 355] : [48.3, 3.2, 320];
            const b = standardBuckling(lcr[k], dims[0], dims[1], dims[2]);
            put({ part: m.part, check: 'buckling', eta: -N / Math.min(b.NRd, T.NRd), combo: cb.name, N, detail: `L_cr = ${lcr[k].toFixed(2)} m, χ = ${b.chi.toFixed(2)}` });
          }
          if (m.joint) {
            const sf = sectionForces(mr, 0);
            const M = Math.hypot(sf.My, sf.Mz);
            put({ part: m.part, check: 'joint', eta: Math.max(M / JOINT.MRd, Math.max(-sf.N, 0) / JOINT.NRd), combo: cb.name, N: sf.N, M });
          }
        }
      } else if (m.kind === 'ledger') {
        const sec = LEDGERS[m.ledger!];
        for (const e of [0, 1]) {
          const x = e === 0 ? 0 : mr.L;
          const sf = sectionForces(mr, x);
          const v = m.conn?.[e];
          if (v) {
            // forces of the ledger on the node in the convention of the approval
            const f: ConnForces = { N: sf.N, My: -sf.My, Vz: e === 0 ? mr.fi[2] : mr.fj[2], Vy: sf.Vy, Mz: sf.Mz, Mx: sf.Mx };
            const ci2 = connInteraction(m.head!, v, f);
            put({ part: m.part, check: 'conn', eta: ci2.eta, combo: cb.name, detail: `Gl. ${ci2.eq}`, N: f.N, M: f.My, V: f.Vz });
          }
          // ledger cross-section 50 mm from the axis of the standard (Gl. 11 / 12)
          const w = sec.w;
          const nS = Math.abs(sf.N) / w.N + Math.abs(sf.Mz) / w.Mz;
          const my = Math.abs(sf.My) / w.My;
          const vS = Math.hypot(Math.abs(sf.Vz) / w.Vz + Math.abs(sf.Mx) / w.Mx, Math.abs(sf.Vy) / w.Vy);
          const u = Math.max(nS + 0.9 * my, 0.89 * nS + 0.8 * my + 0.33 * vS, 0.88 * my + 0.37 * vS, my, vS);
          put({ part: m.part, check: 'ledger', eta: u, combo: cb.name, N: sf.N, M: sf.My, V: sf.Vz });
        }
        const mid = sectionForces(mr, mr.L / 2);
        put({ part: m.part, check: 'ledger', eta: Math.abs(mid.My) / sec.w.My + Math.abs(mid.N) / sec.w.N, combo: cb.name, N: mid.N, M: mid.My, V: mid.Vz });
      } else if (m.kind === 'jack') {
        // spindle: cosine interaction (DIN 4425, 7.1) at the clamped end; a spindle pair through a
        // platform carries compression only
        for (const x of [0, mr.L]) {
          const sf = sectionForces(mr, x);
          const M = Math.hypot(sf.My, sf.Mz);
          put({ part: m.part, check: 'jack', eta: tubeUtilisation(sf.N / JACK.NRd, M / JACK.MRd), combo: cb.name, N: sf.N, M, V: Math.hypot(sf.Vy, sf.Vz) });
        }
        if (m.link && mr.N > 100) put({ part: m.part, check: 'uplift', eta: 1.01, combo: cb.name, N: mr.N });
      } else if (m.diag) {
        const N = mr.N;
        put({ part: m.part, check: 'diagonal', eta: N >= 0 ? N / m.diag.nT : -N / m.diag.nC, combo: cb.name, N });
      } else if (m.kind === 'anchor' || m.kind === 'tube') {
        const N = mr.N;
        put({ part: m.part, check: m.kind === 'anchor' ? 'anchor' : 'coupler', eta: Math.abs(N) / COUPLER_RD, combo: cb.name, N });
        if (m.kind === 'anchor') {
          const o = anchorRes.get(m.part);
          const eta = Math.abs(N) / COUPLER_RD;
          if (!o) anchorRes.set(m.part, { part: m.part, Nmax: N, Nmin: N, eta, combo: cb.name });
          else {
            o.Nmax = Math.max(o.Nmax, N);
            o.Nmin = Math.min(o.Nmin, N);
            if (eta > o.eta) {
              o.eta = eta;
              o.combo = cb.name;
            }
          }
        }
      }
    });

    // interaction standard tube / ledger connection at the rosette (Gl. 1)
    for (const [n, cs] of connAt) {
      let IS = 0;
      let part = '';
      for (const k of stdAt.get(n) ?? []) {
        const x = frame.members[k].i === n ? 0 : r.members[k]!.L;
        const t = tubeEta(k, x);
        if (t.eta >= IS) {
          IS = t.eta;
          part = members[k].part;
        }
      }
      if (!part) continue;
      let worst = 0;
      for (const { k, e } of cs) {
        const mr = r.members[k]!;
        const m = members[k];
        const R = connResistance(m.head!, m.conn![e]!);
        const My = -sectionForces(mr, e === 0 ? 0 : mr.L).My;
        worst = Math.max(worst, My >= 0 ? (R.alphaPos * My) / R.MyPos : (R.alphaNeg * -My) / R.MyNeg);
      }
      put({ part, check: 'node', eta: worst + IS, combo: cb.name, detail: `α·I_A = ${worst.toFixed(2)}, I_S = ${IS.toFixed(2)}` });
    }

    // beams: vertical force of every node on the beam members there
    for (const { car, res } of beamOf) {
      const c = model.carriers[car];
      c.points!.forEach((p, pi) => {
        let Fz = 0;
        for (const k of c.members) {
          const mr = r.members[k];
          if (!mr) continue;
          const z = zAxis(k);
          if (frame.members[k].i === p.node) Fz += z[0] * mr.fi[0] + z[1] * mr.fi[1] + z[2] * mr.fi[2];
          if (frame.members[k].j === p.node) Fz += z[0] * mr.fj[0] + z[1] * mr.fj[1] + z[2] * mr.fj[2];
        }
        // support: pushes the beam up; load: pushes it down
        const F = p.support ? Fz : -Fz;
        if (F > res.points[pi].F) {
          res.points[pi].F = F;
          res.points[pi].combo = cb.name;
        }
      });
    }

    // bases and assumed supports
    for (const b of model.bases) {
      const V = r.reactions[b.sup + 2];
      const H = Math.hypot(r.reactions[b.sup], r.reactions[b.sup + 1]);
      // lifted off (released) or pulled (kept two-sided): uplift
      const lifted = (V === 0 && r.u[b.node * 6 + 2] > 1e-7) || V < -1;
      const o = baseRes.get(b.node);
      if (!o) baseRes.set(b.node, { part: b.part, node: b.node, Vmax: V, Vmin: lifted ? Math.min(V, -1) : V, H, combo: cb.name });
      else {
        if (V > o.Vmax) {
          o.Vmax = V;
          o.combo = cb.name;
        }
        o.Vmin = Math.min(o.Vmin, lifted ? Math.min(V, -1) : V);
        o.H = Math.max(o.H, H);
      }
      if (lifted) put({ part: b.part, check: 'uplift', eta: 1.01, combo: cb.name, N: Math.min(V, 0) });
    }
    for (const s of model.assumedSupports) {
      const V = r.reactions[s.sup + 2];
      const o = beamSup.get(s.node);
      if (!o || V > o.V) beamSup.set(s.node, { part: s.part, node: s.node, V });
    }
    // weak springs of mechanisms that carry something: the parts there are not held
    soft.forEach((sp, i) => {
      const F = Math.abs(r.reactions[frame.supports.length + i]);
      const lim = sp.dof < 3 ? SOFT_F : SOFT_M;
      if (!(F > lim)) return;
      for (const part of partsAt.get(sp.node) ?? []) {
        unstable.add(part);
        put({ part, check: 'unstable', eta: Math.max(1.01, F / lim / 10), combo: cb.name, detail: `${'xyz'[sp.dof % 3]}${sp.dof < 3 ? '' : ' (rot)'}`, ...(sp.dof < 3 ? { V: F } : { M: F }) });
      }
    });
  };
  const finish = (): ScaffoldResult => {
    const eta: Record<string, number> = {};
    for (const c of best.values()) eta[c.part] = Math.max(eta[c.part] ?? 0, c.eta);
    return {
      combos: out,
      checks: [...best.values()].sort((a, b) => b.eta - a.eta),
      eta,
      bases: [...baseRes.values()],
      anchors: [...anchorRes.values()],
      beamSupports: [...beamSup.values()],
      beams: beamRes,
      level,
      totalG,
      totalQ,
      unknowns: fr.unknowns,
      weak: soft.length,
      factorisations: fr.factorisations,
      pcg: fr.pcgStats,
      unstable: [...unstable],
    };
  };
  return { combos, runCombo, finish };
}

/** Run all combinations and checks. `progress` is called before every combination. */
export function analyzeScaffoldModel(model: ScaffoldModel, opt: AnalysisOptions, progress?: (done: number, total: number) => void): ScaffoldResult {
  const a = prepareAnalysis(model, opt);
  a.combos.forEach((cb, k) => {
    progress?.(k, a.combos.length);
    a.runCombo(cb);
  });
  return a.finish();
}

/** The same, yielding to the browser between the combinations (progress display) */
export async function analyzeScaffoldModelAsync(model: ScaffoldModel, opt: AnalysisOptions, progress: (done: number, total: number) => void): Promise<ScaffoldResult> {
  const a = prepareAnalysis(model, opt);
  for (let k = 0; k < a.combos.length; k++) {
    progress(k, a.combos.length);
    await new Promise((r) => setTimeout(r, 15));
    a.runCombo(a.combos[k]);
  }
  progress(a.combos.length, a.combos.length);
  return a.finish();
}

/**
 * Results of parts of the combinations (e.g. from several workers) combined into one: the largest
 * utilisation of every part and check, envelopes of the support and member forces.
 */
export function mergeResults(parts: ScaffoldResult[], order: string[]): ScaffoldResult {
  const [first] = parts;
  const best = new Map<string, PartCheck>();
  const bases = new Map<number, BaseResult>();
  const anchors = new Map<string, ForceResult>();
  const beamSup = new Map<number, { part: string; node: number; V: number }>();
  const beams: BeamResult[] = first.beams.map((b) => ({ ...b, points: b.points.map((p) => ({ ...p, F: -Infinity })) }));
  const unstable = new Set<string>();
  let factorisations = 0;
  const pcg: [number, number] = [0, 0];
  for (const r of parts) {
    for (const c of r.checks) {
      const key = `${c.part}|${c.check}`;
      const o = best.get(key);
      if (!o || c.eta > o.eta) best.set(key, c);
    }
    for (const b of r.bases) {
      const o = bases.get(b.node);
      if (!o) bases.set(b.node, { ...b });
      else {
        if (b.Vmax > o.Vmax) [o.Vmax, o.combo] = [b.Vmax, b.combo];
        o.Vmin = Math.min(o.Vmin, b.Vmin);
        o.H = Math.max(o.H, b.H);
      }
    }
    for (const a of r.anchors) {
      const o = anchors.get(a.part);
      if (!o) anchors.set(a.part, { ...a });
      else {
        o.Nmax = Math.max(o.Nmax, a.Nmax);
        o.Nmin = Math.min(o.Nmin, a.Nmin);
        if (a.eta > o.eta) [o.eta, o.combo] = [a.eta, a.combo];
      }
    }
    for (const s of r.beamSupports) {
      const o = beamSup.get(s.node);
      if (!o || s.V > o.V) beamSup.set(s.node, s);
    }
    r.beams.forEach((b, k) =>
      b.points.forEach((p, i) => {
        const q = beams[k].points[i];
        if (p.F > q.F) [q.F, q.combo] = [p.F, p.combo];
      }),
    );
    for (const u of r.unstable) unstable.add(u);
    factorisations += r.factorisations;
    pcg[0] += r.pcg[0];
    pcg[1] += r.pcg[1];
  }
  for (const b of beams) for (const p of b.points) if (!Number.isFinite(p.F)) p.F = 0;
  const eta: Record<string, number> = {};
  for (const c of best.values()) eta[c.part] = Math.max(eta[c.part] ?? 0, c.eta);
  const combos = parts.flatMap((r) => r.combos).sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  return {
    ...first,
    combos,
    checks: [...best.values()].sort((a, b) => b.eta - a.eta),
    eta,
    bases: [...bases.values()],
    anchors: [...anchors.values()],
    beamSupports: [...beamSup.values()],
    beams,
    unstable: [...unstable],
    factorisations,
    pcg,
  };
}
