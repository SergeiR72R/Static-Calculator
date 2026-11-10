/**
 * Snapping of imprecisely placed parts ("heilen"): parts of a PERI CAD drawing are sometimes placed
 * a few centimetres beside their connection point. Within a tolerance they are moved (translation
 * only) to where they belong:
 *  1. standards / base standards: onto a common axis, rosettes onto the 0.50 m grid of the column;
 *  2. ledgers, diagonals, brackets: their ends onto the rosettes of the standards. The offset of an
 *     end from the standard axis and from the rosette is learned from the parts of the same article
 *     in the drawing (most frequent value), ledgers fall back to the PERI UP geometry;
 *  3. decks: onto their supporting ledgers / girder chords (height learned from the drawing),
 *     centred between them.
 * What stands or lies on a moved bracket or ledger (standards, ledgers on ledger receivers) moves
 * with it; ledgers, diagonals and decks at moved standards are snapped afterwards. If more than a
 * few parts would have to follow, nothing is moved and the group is reported for checking.
 */
import type { V3 } from './pericad';
import type { WorldPart } from './structure';

export interface PartMove {
  id: string;
  d: V3;
  reason: 'column' | 'grid' | 'end' | 'deck' | 'follow';
}

/** a group that would have to be moved as a whole: left as drawn, to be checked by the user */
export interface HealCheck {
  root: string;
  parts: string[];
}

/** more followers than this: no automatic move */
export const MAX_FOLLOW = 10;

/** rosette pitch of PERI UP standards, m */
const PITCH = 0.5;
const EPS = 5e-4;

export function translatePart(w: WorldPart, d: V3) {
  const add = (p: V3): V3 => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
  w.lines = w.lines.map(([a, b]) => [add(a), add(b)]);
  w.rosettes = w.rosettes.map(add);
  w.min = add(w.min);
  w.max = add(w.max);
  w.part.m[3] += d[0];
  w.part.m[7] += d[1];
  w.part.m[11] += d[2];
}

const len2 = (a: V3, b: V3) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const norm = (d: V3) => Math.hypot(d[0], d[1], d[2]);

/** most frequent value (1 mm bins); null without a majority of at least two */
function mode(vals: number[]): number | null {
  if (!vals.length) return null;
  const bins = new Map<number, number[]>();
  for (const v of vals) {
    const k = Math.round(v * 1000);
    bins.set(k, [...(bins.get(k) ?? []), v]);
  }
  const best = [...bins.values()].sort((a, b) => b.length - a.length)[0];
  if (vals.length > 1 && best.length < 2) return null;
  return best.reduce((a, b) => a + b, 0) / best.length;
}

function vertAxis(w: WorldPart): [V3, V3] | null {
  let best: [V3, V3] | null = null;
  let l = 0;
  for (const [a, b] of w.lines)
    if (len2(a, b) < 1e-3 && Math.abs(b[2] - a[2]) > l) {
      l = Math.abs(b[2] - a[2]);
      best = a[2] < b[2] ? [a, b] : [b, a];
    }
  return best;
}

function mainLine(w: WorldPart): [V3, V3] | null {
  // brackets and ledgers: their horizontal bar (the strut of a bracket is longer than its bar)
  const horizontal = w.cls.kind === 'bracket' || w.cls.kind === 'ledger';
  let best: [V3, V3] | null = null;
  let l = 0;
  for (const [a, b] of w.lines) {
    if (horizontal && Math.abs(b[2] - a[2]) > 1e-3) continue;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
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
  rosettes: number[];
}

const ENDS = new Set(['ledger', 'diagonal', 'bracket']);
/** PERI UP: ledger heads 42 mm from the standard axis, system line 30 mm above the rosette */
const DEFAULT_END: Record<string, { d: number; dz: number }> = { ledger: { d: 0.042, dz: 0.03 } };

export function healParts(parts: WorldPart[], tol: number, maxFollow = MAX_FOLLOW): { moves: PartMove[]; checks: HealCheck[] } {
  const moves: PartMove[] = [];
  const checks: HealCheck[] = [];
  if (!(tol > 0)) return { moves, checks };
  const move = (w: WorldPart, d: V3, reason: PartMove['reason']) => {
    if (norm(d) < EPS || norm(d) > tol * Math.SQRT2 + 1e-9) return;
    translatePart(w, d);
    const m = moves.find((x) => x.id === w.part.id);
    if (m) m.d = [m.d[0] + d[0], m.d[1] + d[1], m.d[2] + d[2]];
    else moves.push({ id: w.part.id, d, reason });
  };

  // 1. standards
  const verts = parts
    .filter((w) => w.cls.kind === 'standard' || w.cls.kind === 'base')
    .map((w) => ({ w, ax: vertAxis(w)! }))
    .filter((p) => p.ax)
    .sort((a, b) => a.ax[0][2] - b.ax[0][2]);
  const clusters: { x: number; y: number; items: typeof verts }[] = [];
  for (const v of verts) {
    const c = clusters.find((k) => Math.hypot(k.x - v.ax[0][0], k.y - v.ax[0][1]) <= tol);
    if (c) c.items.push(v);
    else clusters.push({ x: v.ax[0][0], y: v.ax[0][1], items: [v] });
  }
  for (const c of clusters) {
    // axis: most frequent position, else the lowest part
    const mx = mode(c.items.map((i) => i.ax[0][0]));
    const my = mode(c.items.map((i) => i.ax[0][1]));
    const rx = mx ?? c.items[0].ax[0][0];
    const ry = my ?? c.items[0].ax[0][1];
    for (const i of c.items) move(i.w, [rx - i.ax[0][0], ry - i.ax[0][1], 0], 'column');
    // rosette grid of the column: phase of the lowest part with rosettes
    const ref = c.items.find((i) => i.w.rosettes.length);
    if (!ref) continue;
    const phase = (z: number) => ((z % PITCH) + PITCH) % PITCH;
    const ph0 = phase(ref.w.rosettes[0][2]);
    for (const i of c.items) {
      if (i === ref || !i.w.rosettes.length) continue;
      let dz = ph0 - phase(i.w.rosettes[0][2]);
      if (dz > PITCH / 2) dz -= PITCH;
      if (dz < -PITCH / 2) dz += PITCH;
      if (Math.abs(dz) <= tol) move(i.w, [0, 0, dz], 'grid');
    }
  }
  const cols: Col[] = [];
  const colParts: WorldPart[][] = [];
  for (const c of clusters) {
    colParts.push(c.items.map((i) => i.w));
    const ax = c.items.map((i) => vertAxis(i.w)!);
    cols.push({
      x: ax[0][0][0],
      y: ax[0][0][1],
      z0: Math.min(...ax.map((a) => a[0][2])),
      z1: Math.max(...ax.map((a) => a[1][2])),
      rosettes: c.items.flatMap((i) => i.w.rosettes.map((r) => r[2])).sort((a, b) => a - b),
    });
  }

  // 2. parts connected at their ends to the rosettes; what stands or lies on a moved part follows it
  interface EndHit {
    w: WorldPart;
    k: number;
    p: V3;
    col: Col;
    rz: number;
    /** offset of the end from the standard axis: along the part (towards its other end) and across */
    par: number;
    perp: number;
    dir: [number, number];
  }
  const hitsOf = (w: WorldPart): EndHit[] => {
    const out: EndHit[] = [];
    const ml = mainLine(w);
    if (!ml) return out;
    const ends = [...ml].sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);
    ends.forEach((p, k) => {
      let best: { col: Col; r: number } | null = null;
      for (const col of cols) {
        const r = Math.hypot(p[0] - col.x, p[1] - col.y);
        if (r > 0.25 + tol || p[2] < col.z0 - tol || p[2] > col.z1 + tol) continue;
        // a standard on the tip of a bracket is carried by it, it does not hold it
        if (w.cls.kind === 'bracket' && col.z0 > p[2] - 0.2) continue;
        if (!best || r < best.r) best = { col, r };
      }
      if (!best || !best.col.rosettes.length) return;
      const rz = best.col.rosettes.reduce((a, b) => (Math.abs(b - p[2]) < Math.abs(a - p[2]) ? b : a));
      // direction from the standard axis to the end: along the part towards its other end
      const o = ends[1 - k];
      let dir: [number, number] = [o[0] - p[0], o[1] - p[1]];
      const n = Math.hypot(dir[0], dir[1]);
      if (n > 0.05) dir = [dir[0] / n, dir[1] / n];
      else {
        const m2 = Math.hypot(p[0] - best.col.x, p[1] - best.col.y) || 1;
        dir = [(p[0] - best.col.x) / m2, (p[1] - best.col.y) / m2];
      }
      const ox = p[0] - best.col.x;
      const oy = p[1] - best.col.y;
      // a bracket has one end at a standard: one set of learned offsets whatever its direction
      out.push({ w, k: w.cls.kind === 'bracket' ? 0 : k, p, col: best.col, rz, par: ox * dir[0] + oy * dir[1], perp: -ox * dir[1] + oy * dir[0], dir });
    });
    return out;
  };
  const endParts = parts.filter((w) => ENDS.has(w.cls.kind));
  const hits: EndHit[] = endParts.flatMap(hitsOf);
  const learned = new Map<string, { par: number; perp: number; dz: number } | null>();
  const learn = (h: EndHit) => {
    const key = `${h.w.part.article}|${h.k}`;
    if (!learned.has(key)) {
      const same = hits.filter((x) => `${x.w.part.article}|${x.k}` === key);
      const par = mode(same.map((x) => x.par));
      const perp = mode(same.map((x) => Math.abs(x.perp)));
      const dz = mode(same.map((x) => x.p[2] - x.rz));
      const def = DEFAULT_END[h.w.cls.kind];
      learned.set(key, par !== null && perp !== null && dz !== null ? { par, perp, dz } : def ? { par: def.d, perp: 0, dz: def.dz } : null);
    }
    return learned.get(key)!;
  };

  /** standards (column index) and ledgers that stand or lie on the bracket / ledger w */
  const carried = (w: WorldPart): { cols: number[]; ledgers: WorldPart[] } => {
    const res = { cols: [] as number[], ledgers: [] as WorldPart[] };
    const ml = mainLine(w);
    if (!ml || Math.abs(ml[1][2] - ml[0][2]) > 0.05) return res;
    const L = len2(ml[0], ml[1]);
    if (L < 0.05) return res;
    const u = [(ml[1][0] - ml[0][0]) / L, (ml[1][1] - ml[0][1]) / L];
    const near = (p: number[], dzMin: number, dzMax: number) => {
      const t = ((p[0] - ml[0][0]) * u[0] + (p[1] - ml[0][1]) * u[1]) / L;
      if (t < -0.05 || t > 1.05) return false;
      const dh = Math.abs(-(p[0] - ml[0][0]) * u[1] + (p[1] - ml[0][1]) * u[0]);
      const dz = p[2] - ml[0][2];
      return dh <= 0.12 + tol && dz >= dzMin && dz <= dzMax;
    };
    // a standard stands on the part if it starts there (the standards the part hangs on run on below it)
    cols.forEach((c, k) => {
      if (near([c.x, c.y, c.z0], -tol, 0.8)) res.cols.push(k);
    });
    for (const l of endParts) {
      if (l === w || l.cls.kind !== 'ledger') continue;
      const lm = mainLine(l);
      if (!lm) continue;
      for (const p of lm) {
        const atCol = cols.some((c) => Math.hypot(p[0] - c.x, p[1] - c.y) <= 0.25 && p[2] >= c.z0 - tol && p[2] <= c.z1 + tol);
        if (!atCol && near(p, -0.06 - tol, 0.4)) {
          res.ledgers.push(l);
          break;
        }
      }
    }
    return res;
  };
  const moveColumn = (k: number, d: V3) => {
    for (const w of colParts[k]) move(w, d, 'follow');
    const c = cols[k];
    c.x += d[0];
    c.y += d[1];
    c.z0 += d[2];
    c.z1 += d[2];
    c.rosettes = c.rosettes.map((z) => z + d[2]);
  };
  const order = ['bracket', 'ledger', 'diagonal'];
  for (const w of [...endParts].sort((a, b) => order.indexOf(a.cls.kind) - order.indexOf(b.cls.kind))) {
    const ds: V3[] = [];
    for (const h of hitsOf(w)) {
      const t = learn(h);
      if (!t) continue;
      // across the part: the side of the drawing is kept (diagonals may sit on either side of the rosette)
      const pp = h.perp < 0 ? -t.perp : t.perp;
      const target: V3 = [h.col.x + h.dir[0] * t.par - h.dir[1] * pp, h.col.y + h.dir[1] * t.par + h.dir[0] * pp, h.rz + t.dz];
      const d: V3 = [target[0] - h.p[0], target[1] - h.p[1], target[2] - h.p[2]];
      if (norm(d) <= tol * Math.SQRT2) ds.push(d);
    }
    if (!ds.length) continue;
    const avg: V3 = [0, 1, 2].map((i) => ds.reduce((a, d) => a + d[i], 0) / ds.length) as V3;
    if (norm(avg) < EPS) continue;
    // everything standing or lying on this part (and on what follows it) moves with it
    const fCols = new Set<number>();
    const fLedgers = new Set<WorldPart>();
    if (w.cls.kind !== 'diagonal') {
      const queue: WorldPart[] = [w];
      while (queue.length && fLedgers.size + fCols.size <= maxFollow) {
        const c = carried(queue.pop()!);
        for (const k of c.cols) fCols.add(k);
        for (const l of c.ledgers)
          if (!fLedgers.has(l) && l !== w) {
            fLedgers.add(l);
            queue.push(l);
          }
      }
    }
    const followers = [...fLedgers, ...[...fCols].flatMap((k) => colParts[k])];
    if (followers.length > maxFollow) {
      // too much would have to be rebuilt: leave it to the user
      checks.push({ root: w.part.id, parts: [w.part.id, ...followers.map((f) => f.part.id)] });
      continue;
    }
    move(w, avg, 'end');
    for (const l of fLedgers) move(l, avg, 'follow');
    for (const k of fCols) moveColumn(k, avg);
  }

  // 3. decks on ledgers / girder chords
  const supports: { a: V3; b: V3 }[] = [];
  for (const w of parts) {
    if (w.cls.kind === 'ledger') {
      const ml = mainLine(w);
      if (ml && Math.abs(ml[1][2] - ml[0][2]) < 1e-3) supports.push({ a: ml[0], b: ml[1] });
    }
    if (w.cls.kind === 'flexElement' || w.cls.kind === 'flexEnd' || w.cls.kind === 'girder') {
      const hs = w.lines.filter(([a, b]) => Math.abs(b[2] - a[2]) < 1e-3 && len2(a, b) > 0.2);
      const zt = Math.max(...hs.map((l) => l[0][2]));
      for (const l of hs) if (Math.abs(l[0][2] - zt) < 1e-3) supports.push({ a: l[0], b: l[1] });
    }
  }
  interface DeckHit {
    w: WorldPart;
    z: number;
    sz: number;
    lo: number;
    hi: number;
    c: number;
    long: 0 | 1;
  }
  const decks: DeckHit[] = [];
  for (const w of parts) {
    if (w.cls.kind !== 'deck') continue;
    const long: 0 | 1 = w.max[0] - w.min[0] >= w.max[1] - w.min[1] ? 0 : 1;
    const short = 1 - long;
    const mid = (w.min[short] + w.max[short]) / 2;
    const z = w.min[2];
    // support lines across the long axis under each end
    const under = (e: number) => {
      let best: { pos: number; z: number } | null = null;
      for (const s of supports) {
        const dl = Math.abs(s.b[long] - s.a[long]);
        const ds = Math.abs(s.b[short] - s.a[short]);
        if (dl > 0.05 || ds < 0.2) continue;
        if (mid < Math.min(s.a[short], s.b[short]) - 0.05 || mid > Math.max(s.a[short], s.b[short]) + 0.05) continue;
        const pos = (s.a[long] + s.b[long]) / 2;
        if (Math.abs(pos - e) > 0.15 + tol) continue;
        if (s.a[2] > z + tol || s.a[2] < z - 0.25) continue;
        if (!best || Math.abs(pos - e) < Math.abs(best.pos - e)) best = { pos, z: s.a[2] };
      }
      return best;
    };
    const lo = under(w.min[long]);
    const hi = under(w.max[long]);
    if (!lo && !hi) continue;
    decks.push({ w, z, sz: Math.max(lo?.z ?? -Infinity, hi?.z ?? -Infinity), lo: lo?.pos ?? NaN, hi: hi?.pos ?? NaN, c: (w.min[long] + w.max[long]) / 2, long });
  }
  const dz0 = mode(decks.map((d) => d.z - d.sz));
  for (const d of decks) {
    const v: V3 = [0, 0, dz0 !== null ? d.sz + dz0 - d.z : 0];
    if (Number.isFinite(d.lo) && Number.isFinite(d.hi)) v[d.long] = (d.lo + d.hi) / 2 - d.c;
    if (Math.abs(v[0]) <= tol && Math.abs(v[1]) <= tol && Math.abs(v[2]) <= tol) move(d.w, v, 'deck');
  }
  return { moves, checks };
}
