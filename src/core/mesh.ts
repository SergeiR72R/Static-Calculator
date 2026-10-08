import type { BeamModel, Issue, Material, Support } from './types';
import { X_TOL } from './types';
import type { ElementProps } from './element';
import { sectionProps, type SectionProps } from '../sections/properties';

export type NodeReason =
  | 'start'
  | 'end'
  | 'support'
  | 'hinge'
  | 'pointLoad'
  | 'moment'
  | 'loadStart'
  | 'loadEnd'
  | 'segment';

export interface MeshNode {
  index: number;
  x: number;
  reasons: NodeReason[];
  /** active internal hinge (separate rotations left/right) */
  hinge: boolean;
}

export interface MeshElement {
  index: number;
  n1: number;
  n2: number;
  x1: number;
  x2: number;
  L: number;
  segIndex: number;
  material: Material;
  section: SectionProps;
  props: ElementProps;
  /** index of the span region the element lies in */
  span: number;
}

export interface SpanRegion {
  index: number;
  x1: number;
  x2: number;
  kind: 'span' | 'cantilever';
}

export interface Mesh {
  L: number;
  nodes: MeshNode[];
  elements: MeshElement[];
  spans: SpanRegion[];
  warnings: Issue[];
}

/** Effective restraint / spring set of a support */
export interface Restraint {
  u: boolean;
  w: boolean;
  t: boolean;
  ku: number;
  kw: number;
  kt: number;
}

export function supportRestraint(s: Support): Restraint {
  const r: Restraint = { u: false, w: false, t: false, ku: 0, kw: 0, kt: 0 };
  switch (s.type) {
    case 'fixed':
      r.u = r.w = r.t = true;
      break;
    case 'pinned':
      r.u = r.w = true;
      break;
    case 'roller':
      r.w = true;
      break;
    case 'slider':
      r.u = r.t = true;
      break;
    case 'spring':
      r.ku = Math.max(0, s.ku);
      r.kw = Math.max(0, s.kw);
      r.kt = Math.max(0, s.kt);
      break;
  }
  return r;
}

/** Restrains or springs the transverse direction (defines span boundaries) */
export function restrainsW(s: Support): boolean {
  const r = supportRestraint(s);
  return r.w || r.kw > 0;
}

/** Find nearest node index for a coordinate */
export function nodeIndexAt(nodes: MeshNode[], x: number): number {
  let lo = 0;
  let hi = nodes.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (nodes[mid].x <= x) lo = mid;
    else hi = mid;
  }
  return Math.abs(nodes[lo].x - x) <= Math.abs(nodes[hi].x - x) ? lo : hi;
}

export function spanRegions(model: BeamModel): SpanRegion[] {
  const L = model.L;
  const xs = [...new Set(model.supports.filter(restrainsW).map((s) => s.x))].sort((a, b) => a - b);
  const pts: number[] = [];
  for (const x of xs) if (!pts.length || x - pts[pts.length - 1] > X_TOL) pts.push(x);
  if (!pts.length) return [{ index: 0, x1: 0, x2: L, kind: 'span' }];
  const bounds = [0, ...pts, L];
  const regions: SpanRegion[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const x1 = bounds[i];
    const x2 = bounds[i + 1];
    if (x2 - x1 <= X_TOL) continue;
    const freeLeft = i === 0 && pts[0] > X_TOL;
    const freeRight = i + 1 === bounds.length - 1 && L - pts[pts.length - 1] > X_TOL;
    regions.push({ index: regions.length, x1, x2, kind: freeLeft || freeRight ? 'cantilever' : 'span' });
  }
  // A single fixed support alone (classic cantilever) yields one region with a free end → 'cantilever'.
  return regions;
}

export function spanIndexAt(spans: SpanRegion[], x: number): number {
  for (const s of spans) if (x < s.x2 - X_TOL) return s.index;
  return spans.length - 1;
}

/** Build the finite element mesh from the characteristic points of the model. */
export function buildMesh(model: BeamModel): Mesh {
  const L = model.L;
  const warnings: Issue[] = [];
  const pts: { x: number; reason: NodeReason }[] = [
    { x: 0, reason: 'start' },
    { x: L, reason: 'end' },
  ];
  for (const s of model.supports) pts.push({ x: s.x, reason: 'support' });
  for (const h of model.hinges) pts.push({ x: h.x, reason: 'hinge' });
  for (const l of model.loads) {
    if (l.kind === 'point') pts.push({ x: l.x, reason: 'pointLoad' });
    else if (l.kind === 'moment') pts.push({ x: l.x, reason: 'moment' });
    else {
      pts.push({ x: l.x1, reason: 'loadStart' });
      pts.push({ x: l.x2, reason: 'loadEnd' });
    }
  }
  for (const seg of model.segments) {
    if (seg.x1 > X_TOL && seg.x1 < L - X_TOL) pts.push({ x: seg.x1, reason: 'segment' });
    if (seg.x2 > X_TOL && seg.x2 < L - X_TOL) pts.push({ x: seg.x2, reason: 'segment' });
  }
  pts.sort((a, b) => a.x - b.x);
  const nodes: MeshNode[] = [];
  for (const p of pts) {
    const x = Math.min(Math.max(p.x, 0), L);
    const last = nodes[nodes.length - 1];
    if (last && Math.abs(x - last.x) <= X_TOL) {
      if (!last.reasons.includes(p.reason)) last.reasons.push(p.reason);
    } else {
      nodes.push({ index: nodes.length, x, reasons: [p.reason], hinge: false });
    }
  }
  // exact end coordinates
  nodes[0].x = 0;
  nodes[nodes.length - 1].x = L;

  // hinges
  const seenHinge = new Set<number>();
  for (const h of model.hinges) {
    const i = nodeIndexAt(nodes, h.x);
    if (i === 0 || i === nodes.length - 1) {
      warnings.push({ path: `hinges.${h.id}.x`, key: 'warn.hingeAtEnd', severity: 'warning' });
      continue;
    }
    if (seenHinge.has(i)) {
      warnings.push({ path: `hinges.${h.id}.x`, key: 'warn.duplicateHinge', severity: 'warning' });
      continue;
    }
    seenHinge.add(i);
    nodes[i].hinge = true;
  }

  const spans = spanRegions(model);
  const elements: MeshElement[] = [];
  const isTimo = model.settings.theory === 'timoshenko';
  const segProps = model.segments.map((s) => sectionProps(s.section));
  for (let i = 0; i + 1 < nodes.length; i++) {
    const x1 = nodes[i].x;
    const x2 = nodes[i + 1].x;
    const xm = (x1 + x2) / 2;
    let segIndex = model.segments.findIndex((s) => xm >= s.x1 - X_TOL && xm <= s.x2 + X_TOL);
    if (segIndex < 0) segIndex = 0;
    const seg = model.segments[segIndex];
    const sp = segProps[segIndex];
    const E = seg.material.E;
    const Le = x2 - x1;
    elements.push({
      index: i,
      n1: i,
      n2: i + 1,
      x1,
      x2,
      L: Le,
      segIndex,
      material: seg.material,
      section: sp,
      props: { L: Le, EA: E * sp.A, EI: E * sp.I, GAs: isTimo ? seg.material.G * sp.As : Infinity },
      span: spanIndexAt(spans, xm),
    });
  }
  return { L, nodes, elements, spans, warnings };
}
