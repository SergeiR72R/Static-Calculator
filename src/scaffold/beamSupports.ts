/**
 * Beams (SRU / RCS) without supports in the drawing: found at import (quickly, from the structure,
 * without building the model), so that the user decides whether they are supported at their ends.
 * The supports so chosen are fixings set by hand (they can be removed, moved, added like any other).
 *
 * A beam is held by the standards whose top meets it (the beam lies on them, as the model takes it)
 * and, in a suspended scaffold, by a lower beam it lies across. Standards hanging under a beam of a
 * suspended scaffold do not hold it. Fixings set by hand on the beam with the vertical axis count.
 */
import type { ScaffoldStructure, WorldPart } from './structure';
import { orderedAxis, type UserFixing } from './userLoads';

type V3 = [number, number, number];

export interface BeamEnd {
  /** the beam */
  part: string;
  name: string;
  /** end along the part (as the fixings count it: 0 at the start of its ordered axis) */
  at: 0 | 1;
  /** axes held: all three, along the beam free where a standard or jack stands on that end */
  dirs: ('x' | 'y' | 'z')[];
}

function axis(w: WorldPart): [V3, V3] | null {
  let best: [V3, V3] | null = null;
  let l = 0.3;
  for (const [a, b] of w.lines) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (d > l) {
      l = d;
      best = [a, b];
    }
  }
  if (!best) return null;
  // through the middle of the part (as the model takes the beam)
  const [a, b] = best;
  const u: V3 = [(b[0] - a[0]) / l, (b[1] - a[1]) / l, (b[2] - a[2]) / l];
  const c: V3 = [(w.min[0] + w.max[0]) / 2, (w.min[1] + w.max[1]) / 2, (w.min[2] + w.max[2]) / 2];
  return [
    [c[0] - (u[0] * l) / 2, c[1] - (u[1] * l) / 2, c[2] - (u[2] * l) / 2],
    [c[0] + (u[0] * l) / 2, c[1] + (u[1] * l) / 2, c[2] + (u[2] * l) / 2],
  ];
}

/** projection of P on the axis a–b: position t (0…1), horizontal distance, height of P above the axis */
function project(a: V3, b: V3, P: V3) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L, (b[2] - a[2]) / L];
  const s = (P[0] - a[0]) * u[0] + (P[1] - a[1]) * u[1] + (P[2] - a[2]) * u[2];
  const q = [a[0] + u[0] * s, a[1] + u[1] * s, a[2] + u[2] * s];
  return { t: s / L, dh: Math.hypot(P[0] - q[0], P[1] - q[1]), dz: P[2] - q[2] };
}

/**
 * The ends of the beams that have fewer than two supports, with the axes the supports there would
 * hold (as the model assumed them so far: rigid in x, y, z; free along the beam under a standing jack).
 */
export function beamsWithoutSupports(st: ScaffoldStructure, opt: { suspended?: boolean; fixings?: UserFixing[] } = {}): BeamEnd[] {
  const beams = st.parts.filter((w) => w.cls.kind === 'beam').map((w) => ({ w, ax: axis(w) })).filter((x): x is { w: WorldPart; ax: [V3, V3] } => !!x.ax);
  const jacks = st.parts.filter((w) => w.cls.kind === 'jack');
  const nearXY = (w: WorldPart, x: number, y: number) => w.min[0] <= x + 0.1 && w.max[0] >= x - 0.1 && w.min[1] <= y + 0.1 && w.max[1] >= y - 0.1;
  // beam ends in a splice (UK 70, rail connector RCS 97 …) with another beam: joined, no support there
  const GROW = 0.08;
  const splices = st.parts.filter((w) => w.cls.kind === 'beamSplice');
  const inSplice = (P: V3, self: WorldPart) => {
    const hit = (p: V3) =>
      splices.find((s) => {
        if (s.lines.length) return [0, 1, 2].every((i) => p[i] > s.min[i] - GROW && p[i] < s.max[i] + GROW);
        const reach = Number(/(\d{2,3})\s*$/.exec(s.part.name)?.[1] ?? 60) / 100;
        return Math.hypot(p[0] - s.part.m[3], p[1] - s.part.m[7], p[2] - s.part.m[11]) <= reach + GROW;
      });
    const sp = hit(P);
    return !!sp && beams.some((o) => o.w !== self && o.ax.some((q) => hit(q) === sp));
  };
  const out: BeamEnd[] = [];
  for (const { w, ax } of beams) {
    const [a, b] = ax;
    let held = 0;
    const standsOn = [false, false];
    for (const c of st.columns) {
      // the top of a standard under the beam (a head jack in it may reach up to the beam): the beam lies on it
      const top = project(a, b, [c.x, c.y, c.z1]);
      if (!opt.suspended && top.t >= -0.02 && top.t <= 1.02 && top.dh <= 0.15 && top.dz <= 0.05 && top.dz >= -0.5) held++;
      // the foot of a standard (or of its spindle) on the beam
      const foot = Math.min(c.z0, ...jacks.filter((j) => nearXY(j, c.x, c.y) && j.min[2] < c.z0 + 0.02 && j.max[2] > c.z0 - 0.15).map((j) => j.min[2]));
      const ft = project(a, b, [c.x, c.y, foot]);
      if (ft.dh <= 0.15 && ft.dz >= -0.1 && ft.dz <= 0.75) {
        if (ft.t >= -0.02 && ft.t <= 0.02) standsOn[0] = true;
        if (ft.t >= 0.98 && ft.t <= 1.02) standsOn[1] = true;
      }
    }
    // suspended: lying across a lower beam
    if (opt.suspended)
      for (const o of beams) {
        if (o.w === w) continue;
        const [c0, d0] = o.ax;
        const den = (b[0] - a[0]) * (d0[1] - c0[1]) - (b[1] - a[1]) * (d0[0] - c0[0]);
        if (Math.abs(den) < 1e-9) continue;
        const t = ((c0[0] - a[0]) * (d0[1] - c0[1]) - (c0[1] - a[1]) * (d0[0] - c0[0])) / den;
        const u = ((c0[0] - a[0]) * (b[1] - a[1]) - (c0[1] - a[1]) * (b[0] - a[0])) / den;
        if (t < -0.02 || t > 1.02 || u < -0.02 || u > 1.02) continue;
        const dz = a[2] + t * (b[2] - a[2]) - (c0[2] + u * (d0[2] - c0[2]));
        if (dz >= 0.03 && dz <= 0.35) held++;
      }
    held += (opt.fixings ?? []).filter((f) => f.parts.includes(w.part.id) && f.dirs.includes('z')).length;
    if (held >= 2) continue;
    // the ends in the order of the fixings (0: start of the ordered axis)
    const [A] = orderedAxis(a, b);
    const first = A === a ? 0 : 1;
    const along = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 'x' : 'y';
    for (const at of [0, 1] as const) {
      const e = at === 0 ? first : 1 - first;
      if (inSplice(e === 0 ? a : b, w)) continue;
      out.push({ part: w.part.id, name: w.part.name, at, dirs: (['x', 'y', 'z'] as const).filter((d) => !(standsOn[e] && d === along)) });
    }
  }
  return out;
}

/** fixings set by hand for these beam ends: one per end, held against twisting about the beam */
export function beamEndFixings(ends: BeamEnd[], name: (e: BeamEnd) => string): UserFixing[] {
  const stamp = Date.now().toString(36);
  return ends.map((e, k) => ({ id: `B${stamp}${k.toString(36)}`, name: name(e), parts: [e.part], at: e.at, dirs: e.dirs, torsion: true, beamEnd: true }));
}
