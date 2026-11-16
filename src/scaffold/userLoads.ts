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
