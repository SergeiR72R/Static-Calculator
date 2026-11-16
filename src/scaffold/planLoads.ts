/**
 * Loads from the bodies of the drawing (ballast blocks …): block references with a weight (attribute
 * "Gewicht" or volume × density, see pericad.ts) that lie on ledgers, beams or girders of the scaffold.
 * The weight of a body goes to the carriers under its footprint in proportion to the length of each
 * carrier under it, as a uniform load on the carrier (as PERI ForceControl puts ballast on the
 * ledgers). Bodies not lying on the scaffold (planks under the base jacks, the deck of a platform
 * calculated separately) are not loads of the scaffold.
 */
import type { PlanBlock, V3 } from './pericad';
import type { ScaffoldStructure, WorldPart } from './structure';
import type { UserLoad } from './userLoads';

const G = 9.81;
/** margin at the edge of the footprint of a body (a line clearly under it, or at its edge), m */
const GROW = 0.05;
/** a carrier is under a body when its system line lies up to this below the bottom of the body, m */
const BELOW = 0.3;
const ABOVE = 0.05;
/** a body lying on decks: the lines carrying them up to this beside its footprint, m */
const REACH = 3.1;

export interface PlanLoad {
  name: string;
  kg: number;
  /** carriers the body lies on */
  parts: string[];
}

export interface PlanLoads {
  /** line loads (permanent) on the carriers */
  loads: UserLoad[];
  placed: PlanLoad[];
  /** bodies with a weight that do not lie on the scaffold (not loads of the scaffold) */
  unplaced: PlanLoad[];
  /** total placed, N */
  total: number;
}

const CARRIER = new Set(['ledger', 'beam', 'girder']);

function partLength(w: WorldPart): number {
  let L = 0;
  for (const [a, b] of w.lines) L = Math.max(L, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  return L;
}

export function planBlockLoads(st: Pick<ScaffoldStructure, 'parts' | 'blocks' | 'columns'>): PlanLoads {
  const carriers = st.parts.filter((w) => CARRIER.has(w.cls.kind));
  const ground = st.columns.length ? Math.min(...st.columns.map((c) => c.z0)) : -Infinity;
  // the system line of a carrier: its longest horizontal line
  const axes: [WorldPart, V3, V3][] = [];
  for (const w of carriers) {
    let best: [V3, V3] | null = null;
    for (const [a, c] of w.lines) if (Math.abs(c[2] - a[2]) < 0.05 && (!best || Math.hypot(c[0] - a[0], c[1] - a[1]) > Math.hypot(best[1][0] - best[0][0], best[1][1] - best[0][1]))) best = [a, c];
    if (best) axes.push([w, best[0], best[1]]);
  }
  const onPart = new Map<string, number>();
  const placed: PlanLoad[] = [];
  const unplaced: PlanLoad[] = [];
  for (const b of st.blocks ?? []) {
    if (!b.kg || !b.box) continue;
    // under the scaffold (planks under the base jacks): not a load of it
    if (b.box.max[2] <= ground + 0.05) continue;
    const z = b.box.min[2];
    const cx = (b.box.min[0] + b.box.max[0]) / 2;
    const cy = (b.box.min[1] + b.box.max[1]) / 2;
    const wx = b.box.max[0] - b.box.min[0];
    const wy = b.box.max[1] - b.box.min[1];
    // carrier lines at the height under the body: along-axis length under the body (footprint
    // projected on the line), signed distance of the line from the centre of the body across it
    interface Hit {
      id: string;
      l: number;
      z: number;
      s: number;
      /** half width of the body across the line */
      hw: number;
      d: [number, number];
    }
    const cand: Hit[] = [];
    for (const [w, a, c] of axes) {
      const zl = (a[2] + c[2]) / 2;
      if (zl < z - BELOW || zl > z + ABOVE) continue;
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 0.1) continue;
      // direction made unique (the side of a line must not depend on the way it is drawn)
      const flip = c[0] - a[0] < -1e-9 || (Math.abs(c[0] - a[0]) <= 1e-9 && c[1] < a[1]);
      const d: [number, number] = flip ? [(a[0] - c[0]) / len, (a[1] - c[1]) / len] : [(c[0] - a[0]) / len, (c[1] - a[1]) / len];
      // the body's footprint seen along the line: interval on the axis and half width across
      const half = (Math.abs(d[0]) * wx + Math.abs(d[1]) * wy) / 2;
      const hw = (Math.abs(d[1]) * wx + Math.abs(d[0]) * wy) / 2;
      const tc = (cx - a[0]) * d[0] + (cy - a[1]) * d[1];
      const l = Math.min(flip ? 0 : len, tc + half) - Math.max(flip ? -len : 0, tc - half);
      if (l <= 0.02) continue;
      const sgn = (cx - a[0]) * -d[1] + (cy - a[1]) * d[0];
      cand.push({ id: w.part.id, l, z: zl, s: -sgn, hw, d });
    }
    // only the highest carriers under the body (it lies on them, not on those further down)
    const top = Math.max(...cand.map((h) => h.z));
    const lvl = cand.filter((h) => h.z > top - 0.1);
    // lines under the body's footprint carry it directly; parallel to its long side first
    const along = (h: Hit) => (wx >= wy ? Math.abs(h.d[0]) : Math.abs(h.d[1])) > 0.98;
    // clearly under the footprint: carries it directly (lines along its long side first)
    const under = lvl.filter((h) => Math.abs(h.s) <= h.hw - GROW);
    let hits: { id: string; l: number }[] = [];
    const direct = under.filter(along).length ? under.filter(along) : wx === wy ? under : [];
    if (direct.length) hits = direct.map((h) => ({ id: h.id, l: h.l }));
    else {
      // on decks between two lines parallel to its long side: lever rule to the nearest line on each side
      const par = lvl.filter((h) => along(h) && Math.abs(h.s) <= h.hw + REACH);
      const neg = par.filter((h) => h.s < 0);
      const pos = par.filter((h) => h.s > 0);
      const near = (xs: Hit[]) => {
        const m = Math.min(...xs.map((h) => Math.abs(h.s)));
        return xs.filter((h) => Math.abs(h.s) < m + 0.02);
      };
      if (neg.length && pos.length) {
        const A = near(neg);
        const B = near(pos);
        const sa = Math.abs(A[0].s);
        const sb = Math.abs(B[0].s);
        const la = A.reduce((t, h) => t + h.l, 0);
        const lb = B.reduce((t, h) => t + h.l, 0);
        hits = [...A.map((h) => ({ id: h.id, l: ((h.l / la) * sb) / (sa + sb) })), ...B.map((h) => ({ id: h.id, l: ((h.l / lb) * sa) / (sa + sb) }))];
      } else {
        // only on one side, at its edge
        const edge = lvl.filter((h) => Math.abs(h.s) <= h.hw + GROW);
        hits = edge.map((h) => ({ id: h.id, l: h.l }));
      }
    }
    const L = hits.reduce((s, h) => s + h.l, 0);
    const rec = { name: b.name, kg: b.kg, parts: hits.map((h) => h.id) };
    if (!L) {
      unplaced.push(rec);
      continue;
    }
    placed.push(rec);
    for (const h of hits) onPart.set(h.id, (onPart.get(h.id) ?? 0) + (b.kg * G * h.l) / L);
  }
  const byId = new Map(st.parts.map((w) => [w.part.id, w]));
  const loads: UserLoad[] = [];
  let total = 0;
  for (const [id, F] of onPart) {
    const w = byId.get(id);
    const len = w ? partLength(w) : 0;
    if (!(len > 0)) continue;
    total += F;
    loads.push({
      id: `plan:${id}`,
      name: 'plan',
      case: 'G',
      kind: 'line',
      value: F / len,
      at: 0,
      parts: [id],
    });
  }
  return { loads, placed, unplaced, total };
}

export type { PlanBlock };
