import type { BeamModel, Issue } from './types';
import { X_TOL } from './types';
import { nullSpace } from './linalg';
import { supportRestraint, type Mesh } from './mesh';

const mech = (key: string, params?: Issue['params']): Issue => ({ path: '', key, params, severity: 'error' });

/**
 * Kinematic analysis of the beam before factorisation. The beam is split by internal hinges
 * into parts; each part is a rigid body with 2 transverse DOFs (w, slope). Supports and
 * hinges are linear constraints; a non-trivial null space means a mechanism.
 * Axial direction: at least one restraint in x is required.
 */
export function kinematicCheck(model: BeamModel, mesh: Mesh): Issue[] {
  const issues: Issue[] = [];
  if (!model.supports.length) return [mech('mech.noSupports')];

  const hingeX = mesh.nodes.filter((n) => n.hinge).map((n) => n.x);
  const bounds = [0, ...hingeX, model.L];
  const nParts = bounds.length - 1;
  const partOf = (x: number): number => {
    for (let i = 0; i < nParts; i++) if (x < bounds[i + 1] - X_TOL) return i;
    return nParts - 1;
  };
  const isHingeAt = (x: number) => hingeX.some((h) => Math.abs(h - x) <= X_TOL);

  const rows: number[][] = [];
  const row = () => new Array<number>(2 * nParts).fill(0);
  // hinge continuity of w
  for (let j = 0; j < hingeX.length; j++) {
    const x = hingeX[j];
    const r = row();
    r[2 * j] = 1;
    r[2 * j + 1] = x - bounds[j];
    r[2 * (j + 1)] = -1;
    rows.push(r);
  }
  let nW = 0;
  let nU = 0;
  const wSupportX: number[] = [];
  for (const s of model.supports) {
    const rs = supportRestraint(s);
    if (rs.u || rs.ku > 0) nU++;
    const atHinge = isHingeAt(s.x);
    if (rs.w || rs.kw > 0) {
      nW++;
      wSupportX.push(s.x);
      // a support at a hinge acts on the shared point: constrain the part on the left
      const i = atHinge ? partOf(s.x) - 1 : partOf(s.x);
      const r = row();
      r[2 * i] = 1;
      r[2 * i + 1] = s.x - bounds[i];
      rows.push(r);
    }
    if ((rs.t || rs.kt > 0) && !atHinge) {
      const i = partOf(s.x);
      const r = row();
      r[2 * i + 1] = 1;
      rows.push(r);
    }
  }
  if (nU === 0) issues.push(mech('mech.noX'));
  if (nW === 0) {
    issues.push(mech('mech.noZ'));
    return issues;
  }
  const { basis } = nullSpace(rows.length ? rows : [row()], 2 * nParts);
  if (basis.length) {
    const moving = new Set<number>();
    for (const v of basis) {
      const scale = Math.max(...v.map(Math.abs));
      for (let i = 0; i < nParts; i++) {
        // displacement at both part ends
        const wa = v[2 * i];
        const wb = v[2 * i] + v[2 * i + 1] * (bounds[i + 1] - bounds[i]);
        if (Math.abs(wa) > 1e-9 * scale || Math.abs(wb) > 1e-9 * scale) moving.add(i);
      }
    }
    if (nParts === 1) {
      issues.push(mech('mech.rotation', { x: wSupportX[0] }));
    } else {
      let reported = false;
      for (const i of [...moving].sort((a, b) => a - b)) {
        if (i === 0 || i === nParts - 1) continue;
        const a = bounds[i];
        const b = bounds[i + 1];
        const supported = wSupportX.some((x) => x >= a - X_TOL && x <= b + X_TOL);
        if (!supported) {
          issues.push(mech('mech.twoHinges', { x1: a, x2: b }));
          reported = true;
          break;
        }
      }
      if (!reported) {
        const ms = [...moving].sort((a, b) => a - b);
        const x1 = bounds[ms[0] ?? 0];
        const x2 = bounds[(ms[ms.length - 1] ?? nParts - 1) + 1];
        issues.push(mech('mech.part', { x1, x2 }));
      }
    }
  }
  return issues;
}
