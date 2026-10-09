/**
 * Classical hand calculation for statically determinate beams: reactions from the equilibrium
 * conditions ΣF_x = 0, ΣF_z = 0, ΣM = 0 and M = 0 at every hinge; internal moments by the
 * method of sections. Used to cross-check the FEM results in the step-by-step report.
 */
import type { Analysis, DofKind } from './analysis';
import type { Id } from './types';
import { G_ACC, X_TOL } from './types';
import { gaussSolve } from './linalg';
import { supportRestraint } from './mesh';
import { dirCos } from './element';
import { lineMass } from '../sections/properties';

export interface HandUnknown {
  supportId: Id;
  comp: DofKind;
  x: number;
}

export interface HandEquation {
  /** 'Fx' | 'Fz' | 'M0' | 'hinge' */
  kind: 'Fx' | 'Fz' | 'M0' | 'hinge';
  x?: number;
  /** coefficients of the unknowns */
  coef: number[];
  /** constant term from the loads: Σ coef·R + rhs = 0 */
  rhs: number;
}

/** Applied force items of a load set (global convention, z down, clockwise moments) */
export interface ForceItem {
  x: number;
  Fx: number;
  Fz: number;
  M: number;
  hingeSide?: 'left' | 'right';
}

export interface LinePiece {
  x1: number;
  x2: number;
  q1: number;
  q2: number;
  dir: 'z' | 'x';
}

export interface HandCalc {
  applicable: boolean;
  reason?: 'springs' | 'indeterminate' | 'singular';
  degree: number;
  unknowns: HandUnknown[];
  equations: HandEquation[];
  solution: number[];
  points: ForceItem[];
  pieces: LinePiece[];
}

/** Collect the loads of a load set Σ γ_c·E_c (incl. self weight) */
export function loadItems(an: Analysis, factors: Record<Id, number>): { points: ForceItem[]; pieces: LinePiece[] } {
  const m = an.model;
  const points: ForceItem[] = [];
  const pieces: LinePiece[] = [];
  for (const l of m.loads) {
    const f = factors[l.caseId] ?? 0;
    if (!f) continue;
    if (l.kind === 'point') {
      const [c, s] = dirCos(l.angle);
      points.push({ x: l.x, Fx: f * l.P * c, Fz: f * l.P * s, M: 0 });
    } else if (l.kind === 'moment') points.push({ x: l.x, Fx: 0, Fz: 0, M: f * l.M, hingeSide: l.hingeSide });
    else pieces.push({ x1: l.x1, x2: l.x2, q1: f * l.q1, q2: f * l.q2, dir: l.dir });
  }
  const sw = an.prep?.selfWeightCase;
  if (m.settings.selfWeight && sw && factors[sw]) {
    for (const s of m.segments) {
      const e = an.mesh?.elements.find((el) => el.segIndex === m.segments.indexOf(s));
      const q = e ? factors[sw] * lineMass(e.section, s.material.rho) * G_ACC : 0;
      if (q) pieces.push({ x1: s.x1, x2: s.x2, q1: q, q2: q, dir: 'z' });
    }
  }
  return { points, pieces };
}

/** ∫ q(s) ds and ∫ q(s)(x − s) ds of a linear piece clipped to [a, b] */
function pieceIntegrals(p: LinePiece, a: number, b: number, x: number): { F: number; Mx: number } {
  const lo = Math.max(a, p.x1);
  const hi = Math.min(b, p.x2);
  if (hi <= lo) return { F: 0, Mx: 0 };
  const q = (s: number) => p.q1 + ((p.q2 - p.q1) * (s - p.x1)) / (p.x2 - p.x1);
  const qa = q(lo);
  const qb = q(hi);
  const len = hi - lo;
  const F = ((qa + qb) / 2) * len;
  // ∫ s·q(s) ds
  const sQ = (len / 6) * (qa * (2 * lo + hi) + qb * (lo + 2 * hi));
  return { F, Mx: x * F - sQ };
}

/**
 * Internal bending moment at x from the left free body (loads only, without reactions).
 * mode 'left' = M(x−), 'right' = M(x+), 'hinge' = moment at the left end of a hinge
 * (moments acting on the left side of the hinge included).
 */
export function momentFromLoadsLeft(points: ForceItem[], pieces: LinePiece[], x: number, mode: 'left' | 'right' | 'hinge'): number {
  let M = 0;
  for (const p of points) {
    if (p.x > x + X_TOL) continue;
    if (Math.abs(p.x - x) > X_TOL) {
      M += -p.Fz * (x - p.x) + p.M;
      continue;
    }
    // at x: forces have no lever arm, moments depend on the side
    if (p.M && (mode === 'right' || (mode === 'hinge' && p.hingeSide === 'left'))) M += p.M;
  }
  for (const pc of pieces) if (pc.dir === 'z') M -= pieceIntegrals(pc, 0, x, x).Mx;
  return M;
}

export function handCalculation(an: Analysis, factors: Record<Id, number>): HandCalc {
  const m = an.model;
  const { points, pieces } = loadItems(an, factors);
  const hinges = (an.mesh?.nodes ?? []).filter((n) => n.hinge).map((n) => n.x);
  const none = (reason: HandCalc['reason'], degree = 0): HandCalc => ({
    applicable: false,
    reason,
    degree,
    unknowns: [],
    equations: [],
    solution: [],
    points,
    pieces,
  });
  if (m.supports.some((s) => s.type === 'spring')) return none('springs');
  const unknowns: HandUnknown[] = [];
  for (const s of m.supports) {
    const r = supportRestraint(s);
    const atHinge = hinges.some((h) => Math.abs(h - s.x) <= X_TOL);
    if (r.u) unknowns.push({ supportId: s.id, comp: 'u', x: s.x });
    if (r.w) unknowns.push({ supportId: s.id, comp: 'w', x: s.x });
    if (r.t && !atHinge) unknowns.push({ supportId: s.id, comp: 't', x: s.x });
  }
  const nEq = 3 + hinges.length;
  const degree = unknowns.length - nEq;
  if (degree !== 0) return none('indeterminate', degree);

  let sumFx = 0;
  let sumFz = 0;
  let sumM0 = 0;
  for (const p of points) {
    sumFx += p.Fx;
    sumFz += p.Fz;
    sumM0 += p.x * p.Fz + p.M;
  }
  for (const pc of pieces) {
    const I = pieceIntegrals(pc, pc.x1, pc.x2, 0);
    if (pc.dir === 'x') sumFx += I.F;
    else {
      sumFz += I.F;
      sumM0 += -I.Mx; // Mx = 0·F − ∫s q = −∫ s q
    }
  }
  const equations: HandEquation[] = [
    { kind: 'Fx', coef: unknowns.map((u) => (u.comp === 'u' ? 1 : 0)), rhs: sumFx },
    { kind: 'Fz', coef: unknowns.map((u) => (u.comp === 'w' ? 1 : 0)), rhs: sumFz },
    { kind: 'M0', coef: unknowns.map((u) => (u.comp === 'w' ? u.x : u.comp === 't' ? 1 : 0)), rhs: sumM0 },
  ];
  for (const xh of hinges) {
    // M(x_h) from the left part = 0 (reactions in global convention: force on beam +z, moment clockwise)
    const coef = unknowns.map((u) => {
      if (u.x > xh + X_TOL) return 0;
      if (u.comp === 'w') return -(xh - u.x);
      if (u.comp === 't' && u.x < xh - X_TOL) return 1;
      return 0;
    });
    equations.push({ kind: 'hinge', x: xh, coef, rhs: momentFromLoadsLeft(points, pieces, xh, 'hinge') });
  }
  const sol = gaussSolve(
    equations.map((e) => e.coef),
    equations.map((e) => -e.rhs),
  );
  if (!sol) return { ...none('singular', 0), unknowns, equations };
  return { applicable: true, degree: 0, unknowns, equations, solution: sol, points, pieces };
}

/** Bending moment by the method of sections using the hand-calculated reactions */
export function handMoment(hc: HandCalc, x: number, side: 'left' | 'right'): number {
  let M = momentFromLoadsLeft(hc.points, hc.pieces, x, side);
  hc.unknowns.forEach((u, i) => {
    const inside = side === 'right' ? u.x <= x + X_TOL : u.x < x - X_TOL;
    if (!inside) return;
    if (u.comp === 'w') M += -hc.solution[i] * (x - u.x);
    if (u.comp === 't') M += hc.solution[i];
  });
  return M;
}
