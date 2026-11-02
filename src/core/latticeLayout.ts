/**
 * Layout changes of a lattice girder in one model update: catalogue length ↔ ULS Flex elements,
 * beam length, supports (standards) moved with the girder ends / connectors, loads kept on the
 * girder.
 */
import type { BeamModel, LatticeConfig } from './types';
import { X_TOL } from './types';
import { LATTICE_TYPES, defaultFlexElements, flexElements, flexLength, isLattice, type LatticeId } from '../sections/lattice';

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** connector positions of ULS Flex elements (standard axis at 0) */
export function flexConnectors(elements: number[]): number[] {
  const out = [0.5];
  for (const e of elements) out.push(r6(out[out.length - 1] + e));
  return out;
}

/**
 * Apply a new length (catalogue length: ULS Flex elements are chosen automatically) or new ULS Flex
 * elements (the length follows) to a model whose segments are one lattice product.
 */
export function applyLatticeLayout(m: BeamModel, p: { L?: number; flex?: number[] }) {
  const seg = m.segments[0];
  if (!seg || seg.section.kind !== 'peri' || !isLattice(seg.section.product)) return;
  const id = seg.section.product as LatticeId;
  const oldL = m.L;
  const oldCfg: LatticeConfig = seg.section.lattice ?? {};
  let L = p.L ?? oldL;
  let cfg: LatticeConfig = { ...oldCfg };
  let oldConns: number[] = [];
  let newConns: number[] = [];
  if (id === 'ULSFLEX') {
    const oldEl = flexElements(oldCfg, oldL);
    oldConns = flexConnectors(oldEl);
    const el = p.flex ?? (p.L !== undefined ? defaultFlexElements(p.L) : oldEl);
    if (!el.length) return;
    cfg = { ...cfg, flex: el };
    L = flexLength(el);
    newConns = flexConnectors(el);
  }
  if (!(L > 0)) return;
  for (const s of m.segments) if (s.section.kind === 'peri') s.section = { ...s.section, lattice: cfg };
  // supports: girder ends / system points follow the end, standards at connectors keep their connector
  const o = id === 'ULSFLEX' ? 0 : LATTICE_TYPES[id].overhang;
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  for (const s of m.supports) {
    if (near(s.x, oldL)) s.x = L;
    else if (o > 0 && near(s.x, oldL - o)) s.x = r6(L - o);
    else if (id === 'ULSFLEX') {
      const k = oldConns.findIndex((c) => near(c, s.x));
      if (k >= 0) s.x = newConns[Math.min(k, newConns.length - 1)];
      else if (s.x > L) s.x = L;
    } else if (s.x > L - o) s.x = r6(L - o);
  }
  // one support per position
  const seen = new Set<number>();
  m.supports = m.supports.filter((s) => {
    const k = Math.round(s.x * 1e6);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  m.L = L;
  // loads: on the girder
  for (const l of m.loads) {
    if (l.kind === 'dist') {
      if (near(l.x2, oldL) || l.x2 > L) l.x2 = L;
      if (l.x1 > L - X_TOL) l.x1 = Math.max(0, L - 0.1);
    } else if (near(l.x, oldL) || l.x > L) l.x = L;
  }
  const segs = [...m.segments].sort((a, b) => a.x1 - b.x1);
  m.segments = segs.filter((s) => s.x1 < L - X_TOL || s === segs[0]);
  m.segments[m.segments.length - 1].x2 = L;
}
