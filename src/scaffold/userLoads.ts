import type { WorldPart } from './structure';

/**
 * Loads entered by the user on parts of the scaffold (loads of a structure on top calculated
 * separately, a loading platform, ballast …). Vertical, downwards.
 */
export interface UserLoad {
  id: string;
  name: string;
  /** G: permanent (in all combinations), Q: variable (working combinations, out of service with the
   * share of the service class) */
  case: 'G' | 'Q';
  /** point: force on every part (N) at `at` of its length; line: N/m along the whole part */
  kind: 'point' | 'line';
  value: number;
  /** position along the part from its start (the end with the smaller x, then y, then z), 0…1 */
  at: number;
  parts: string[];
  /** direction: vertical downwards (default) or horizontal along x / y, then acting in the combinations
   * in that direction with their sign (as the hoist loads LC7 / LC8 of PERI ForceControl) */
  dir?: 'z' | 'x' | 'y';
  /** horizontal: components (x, y) of the force for the combinations of `dir` (e.g. a hoist load
   * "in y" with a part in x); default along `dir` */
  vec?: [number, number];
  /** combinations: 'all' (default): working, and out of service (Q with the share of the service class);
   * 'work': working only (a load in service, e.g. a hoist working); 'rest': out of service only, in
   * full (e.g. a hoist parked) — as the load cases chosen per combination in PERI ForceControl;
   * 'wind' / 'calm': working with the working wind only / without wind only (indoors, and outdoors in
   * the combinations A0 of a day without wind) */
  when?: UserLoadWhen;
}

export type UserLoadWhen = 'all' | 'work' | 'rest' | 'wind' | 'calm';

/**
 * Fixing of the scaffold to the building (or another structure) set by the user: the chosen parts are
 * held at `at` of their length (as the point loads) in the chosen axes of the drawing, two-sided (as the
 * supports of PERI ForceControl at the heads tied to the building).
 */
export interface UserFixing {
  id: string;
  name: string;
  parts: string[];
  /** position along the part from its start (smaller x, then y, then z), 0…1; 1: top of a standard */
  at: number;
  /** axes held */
  dirs: ('x' | 'y' | 'z')[];
  /**
   * instead of the axes: a tie in this direction (from the scaffold to the building, any angle), held
   * both ways along it
   */
  vec?: [number, number, number];
  /** design resistance of one fixing (resultant of its forces), N; none: no check */
  limit?: number;
  /**
   * a support at the bottom of the standards chosen (instead of what the drawing gives there: base,
   * support on the structure, a beam or girder under it): springs per axis (N/m; absent: rigid) and
   * whether the vertical support takes pressure only (lifts off like a base)
   */
  support?: { k?: Partial<Record<'x' | 'y' | 'z', number>>; compression?: boolean };
  /** on a beam: also held against twisting about the beam axis */
  torsion?: boolean;
  /** a support at the end of a beam proposed by the program (a beam without supports in the drawing) */
  beamEnd?: boolean;
}

/** dynamic horizontal load (ForceControl "DHB"): share of the load moved by the crane (10 %) */
export const DHB_SHARE = 0.1;

/** start and end of a part's axis in a stable order (smaller x, then y, then z first) */
export function orderedAxis(a: [number, number, number], b: [number, number, number]): [[number, number, number], [number, number, number]] {
  for (let i = 0; i < 3; i++) {
    if (Math.abs(a[i] - b[i]) < 1e-6) continue;
    return a[i] < b[i] ? [a, b] : [b, a];
  }
  return [a, b];
}

/** length of a part (its longest line), m */
function partLength(w: WorldPart): number {
  let L = 0;
  for (const [a, b] of w.lines) L = Math.max(L, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  return L;
}

/** total of a load on its parts (characteristic), N */
export function userLoadTotal(l: UserLoad, byId: Map<string, WorldPart>): number {
  const ps = l.parts.map((id) => byId.get(id)).filter((w): w is WorldPart => !!w);
  return l.kind === 'point' ? l.value * ps.length : ps.reduce((s, w) => s + l.value * partLength(w), 0);
}
