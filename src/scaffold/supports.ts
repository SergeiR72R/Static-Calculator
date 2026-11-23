/**
 * All supports of the model in one list (for showing them in the 3D view and changing them): bases of
 * the standards (automatic or set by hand), supports of the beams (assumed at their ends or set by
 * hand), anchors and struts, fixings set by hand and supports the model assumed elsewhere.
 */
import type { ScaffoldModel } from './model';
import type { UserFixing } from './userLoads';

type V3 = [number, number, number];

export type SupportKind = 'base' | 'baseUser' | 'beamEnd' | 'anchor' | 'strut' | 'fixing' | 'other';
export const SUPPORT_KINDS: SupportKind[] = ['base', 'baseUser', 'beamEnd', 'anchor', 'strut', 'fixing', 'other'];

export interface SupportInfo {
  kind: SupportKind;
  /** the part held (lowest standard, beam, tube, part of the fixing) */
  part: string;
  /** a fixing set by hand behind it */
  fixing?: string;
  node: number;
  p: V3;
  /** axes held ("xyz"); a rotation held: "r" */
  dirs: string;
  /** springs instead of rigid supports */
  springs?: boolean;
  /** vertically pressure only (lifts off) */
  compression?: boolean;
}

const AX = 'xyz';

export function modelSupports(m: ScaffoldModel, fixings: UserFixing[] = []): SupportInfo[] {
  const sups = m.frame.supports;
  const claimed = new Set<number>();
  const out: SupportInfo[] = [];
  const at = (n: number): V3 => [m.frame.nodes[n][0], m.frame.nodes[n][1], m.frame.nodes[n][2]];
  const dirsOf = (idx: number[]) =>
    [...new Set(idx.filter((i) => sups[i] && sups[i].dof < 3 && sups[i].k > 0).map((i) => AX[sups[i].dof]))].sort().join('') + (idx.some((i) => sups[i] && sups[i].dof >= 3) ? 'r' : '');
  // bases: set by hand when a support of the user is on the lowest standard
  for (const b of m.bases) {
    const idx = [b.sup, b.sup + 1, b.sup + 2];
    idx.forEach((i) => claimed.add(i));
    const user = fixings.find((f) => f.support && b.standard && f.parts.includes(b.standard));
    out.push({
      kind: user ? 'baseUser' : 'base',
      part: b.standard ?? b.part,
      ...(user ? { fixing: user.id } : {}),
      node: b.node,
      p: at(b.node),
      dirs: dirsOf(idx),
      ...(idx.some((i) => Number.isFinite(sups[i].k) && sups[i].k > 0) ? { springs: true } : {}),
      compression: true,
    });
  }
  // beam ends supported by assumption (with the rotation about the beam at one end)
  for (const s of m.assumedSupports) {
    const idx = [s.sup, s.sup + 1, s.sup + 2];
    if (sups[s.sup + 3]?.node === s.node && sups[s.sup + 3].dof >= 3) idx.push(s.sup + 3);
    idx.forEach((i) => claimed.add(i));
    out.push({ kind: 'beamEnd', part: s.part, node: s.node, p: at(s.node), dirs: dirsOf(idx) });
  }
  // anchors and struts: their end at the building
  for (const a of m.anchors) {
    const far = m.frame.members[a.member].j;
    const idx = sups.map((q, i) => (q.node === far ? i : -1)).filter((i) => i >= 0);
    idx.forEach((i) => claimed.add(i));
    out.push({ kind: a.strut ? 'strut' : 'anchor', part: a.part, node: far, p: at(far), dirs: dirsOf(idx), ...(a.strut ? { compression: true } : {}) });
  }
  // fixings set by hand (not those at the bottom of a standard counted with the bases)
  for (const f of m.fixings) {
    const idx = f.sups.map((q) => q.sup);
    // held against twisting at the same node (beam supports set by hand)
    sups.forEach((q, i) => {
      if (q.node === f.node && q.dof >= 3 && !claimed.has(i)) idx.push(i);
    });
    if (f.tie) {
      const far = m.frame.members[f.tie.member].j;
      sups.forEach((q, i) => q.node === far && claimed.add(i));
    }
    idx.forEach((i) => claimed.add(i));
    const uf = fixings.find((u) => u.id === f.id);
    if (m.bases.some((b) => b.node === f.node && uf?.support)) continue;
    out.push({
      kind: uf?.support ? 'baseUser' : 'fixing',
      part: f.part,
      fixing: f.id,
      node: f.node,
      p: at(f.node),
      dirs: f.tie ? '↗' : dirsOf(idx),
      ...(uf?.support && idx.some((i) => Number.isFinite(sups[i].k)) ? { springs: true } : {}),
    });
  }
  // the rest: supports the model assumed (a ledger end fixed in space, a head jack …)
  const rest = new Map<number, number[]>();
  sups.forEach((q, i) => {
    if (claimed.has(i) || q.k === 0) return;
    rest.set(q.node, [...(rest.get(q.node) ?? []), i]);
  });
  for (const [node, idx] of rest) {
    const k = m.frame.members.findIndex((mb) => mb.i === node || mb.j === node);
    out.push({ kind: 'other', part: k >= 0 ? m.members[k].part : '', node, p: at(node), dirs: dirsOf(idx) });
  }
  return out;
}
