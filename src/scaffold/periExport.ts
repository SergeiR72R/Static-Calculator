/**
 * Parts of the older PERI CAD kind (PERI_AEC_DB_BAUTEIL: base jacks and others) are not written to
 * DXF by AutoCAD. The AutoLISP command PERIEXPORT (tools/PERIEXPORT.lsp) writes them to a text file
 * next to the drawing: article, name, size, insertion point, rotation, normal and the bounding box in
 * world coordinates. Here these parts are added to the drawing read from the DXF: their axis from the
 * insertion point, rotation and normal with their size (standards with their rosettes); without these,
 * from the bounding box (vertical for jacks and standards, along the longest side for ledgers and
 * beams, across the box for diagonals).
 */
import type { PartGeom, ScaffoldDoc, ScaffoldPart, V3 } from './pericad';
import { classifyPart } from './catalog';
import { findPart } from './weights';

export interface ExportEntry {
  type: string;
  fields: Record<string, string>;
}

export interface ExportFile {
  insunits: number;
  entries: ExportEntry[];
}

/** null if the text is not a PERIEXPORT file */
export function parsePeriExport(text: string): ExportFile | null {
  const lines = text.split(/\r?\n/);
  const head = lines[0]?.split('\t') ?? [];
  if (head[0]?.trim() !== 'PERIEXPORT') return null;
  const insunits = Number(head.find((h) => h.startsWith('INSUNITS='))?.slice(9) ?? 0);
  const entries: ExportEntry[] = [];
  for (const l of lines.slice(1)) {
    if (!l.trim()) continue;
    const fields: Record<string, string> = {};
    for (const f of l.split('\t')) {
      const k = f.indexOf('=');
      if (k > 0) fields[f.slice(0, k).trim()] = f.slice(k + 1).trim();
    }
    entries.push({ type: fields.T ?? '', fields });
  }
  return { insunits, entries };
}

const point = (s?: string): V3 | null => {
  if (!s) return null;
  const v = s.split(',').map(Number);
  return v.length >= 3 && v.every(Number.isFinite) ? [v[0], v[1], v[2]] : null;
};

const centre = (e: ExportEntry): V3 => {
  const a = point(e.fields.Min)!;
  const b = point(e.fields.Max)!;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
};

const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0;

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Rosettes of a standard placed from the export (its block geometry is not in the DXF), from its
 * bottom along its axis, m: UVR / UVR-2 / UVH / UVA every 0.5 m from 0.38 m; base standards UVB 24 / 25
 * at 0.125 m, UVB 49 / 50 at 0.125 and 0.375 m (as the blocks of PERI CAD).
 */
export function rosetteOffsets(name: string, length: number): number[] {
  if (/\bUVB[\s-]*(24|25)\b/i.test(name)) return [0.125];
  if (/\bUVB[\s-]*(49|50)\b/i.test(name)) return [0.125, 0.375];
  if (!/\bUV[RHA]\b|\bUVR-2\b|\bUVH-2\b/i.test(name)) return [];
  const out: number[] = [];
  for (let z = 0.38; z < length - 0.05; z += 0.5) out.push(Math.round(z * 1000) / 1000);
  return out;
}

/**
 * Axis (and rosettes) of a part from its insertion point, rotation and normal (the object coordinate
 * system of AutoCAD) and its size: the part's own x along the rotation in the plane of the normal,
 * width along x, depth along y, height along the normal. Null without these fields.
 */
function placedGeom(f: Record<string, string>, kind: string, name: string, tf: (q: V3) => V3, turn: (v: V3) => V3, scale: number): { o: V3; geom: PartGeom } | null {
  const L = point(f.Location);
  const N0 = point(f.Normal);
  const r = Number(f.Rotation);
  const w = Number(f.width) * scale;
  const d = Number(f.depth) * scale;
  const h = Number(f.height) * scale;
  if (!L || !N0 || !Number.isFinite(r) || ![w, d, h].every((v) => Number.isFinite(v) && v >= 0)) return null;
  const n = unit(N0);
  const a = unit(Math.abs(n[0]) < 1 / 64 && Math.abs(n[1]) < 1 / 64 ? cross([0, 1, 0], n) : cross([0, 0, 1], n));
  const b = cross(n, a);
  const x0: V3 = [0, 1, 2].map((i) => Math.cos(r) * a[i] + Math.sin(r) * b[i]) as V3;
  const y0 = cross(n, x0);
  // the side of the insertion point the box lies on: from the exported extents (drawings with
  // mirrored parts have it on −y)
  const mn = point(f.Min);
  const mx = point(f.Max);
  const raw = Number(f.width) || 0;
  const rawD = Number(f.depth) || 0;
  const rawH = Number(f.height) || 0;
  let sx = 1;
  let sy = 1;
  if (mn && mx) {
    const tol = 2e-3 * Math.max(1, ...[0, 1, 2].map((i) => mx[i] - mn[i]));
    const inBox = (p: number[]) => [0, 1, 2].every((i) => p[i] >= mn[i] - tol && p[i] <= mx[i] + tol);
    const hit = ([1, -1] as const).flatMap((u) => ([1, -1] as const).map((v) => [u, v] as const)).find(([u, v]) => inBox([0, 1, 2].map((i) => L[i] + (u * raw * x0[i] + v * rawD * y0[i] + rawH * n[i]) / 2)));
    if (hit) [sx, sy] = hit;
  }
  const x: V3 = [x0[0] * sx, x0[1] * sx, x0[2] * sx];
  const y: V3 = [y0[0] * sy, y0[1] * sy, y0[2] * sy];
  const X = unit(turn(x));
  const Y = unit(turn(y));
  const Z = unit(turn(n));
  const O = tf(L);
  const dims: [number, V3][] = [
    [w, X],
    [d, Y],
    [h, Z],
  ];
  const at = (p: V3, ...steps: [number, V3][]): V3 => steps.reduce<V3>((q, [s, v]) => [q[0] + s * v[0], q[1] + s * v[1], q[2] + s * v[2]], p);
  // a diagonal of standards (UBK / UBS): across its two large sizes, from the insertion point
  if (kind === 'diagonal' && w > 0.3 && h > 0.3) return { o: O, geom: { lines: [[[0, 0, 0], at([0, 0, 0], [w, X], [h, Z])]], rosettes: [] } };
  const order = [0, 1, 2].sort((i, j) => dims[j][0] - dims[i][0]);
  // decks and toe boards: their outline in the plane of their two large sizes (a deck at its top, a
  // toe board in its middle), so that they have an area like the parts of PERI CAD drawings
  if (kind === 'deck' || kind === 'toeboard') {
    const [u, v, t] = order.map((i) => dims[i]);
    const c = at([0, 0, 0], [kind === 'deck' ? t[0] : t[0] / 2, t[1]]);
    const p = [c, at(c, u), at(c, u, v), at(c, v)];
    return { o: O, geom: { lines: p.map((q, i) => [q, p[(i + 1) % 4]] as [V3, V3]), rosettes: [] } };
  }
  const [len, dir] = dims[order[0]];
  // lattice girders: both chords (in the plane of the length and the height), with the end posts
  if (kind === 'girder') {
    const [hh, hv] = dims[order[1]];
    const [tt, tv] = dims[order[2]];
    const c1 = at([0, 0, 0], [tt / 2, tv], [tt / 2, hv]);
    const c2 = at(c1, [Math.max(hh - tt, 0), hv]);
    const e1 = at(c1, [len, dir]);
    const e2 = at(c2, [len, dir]);
    return { o: O, geom: { lines: [[c1, e1], [c2, e2], [c1, c2], [e1, e2]], rosettes: [] } };
  }
  const vertical = kind === 'standard' || kind === 'base' || kind === 'jack';
  // standards and spindles: the insertion point is a corner of their square; ledgers lie on it
  const start = kind === 'ledger' ? O : at(O, [dims[order[1]][0] / 2, dims[order[1]][1]], [dims[order[2]][0] / 2, dims[order[2]][1]]);
  const rosettes = vertical && kind !== 'jack' ? rosetteOffsets(name, len).map((z) => at([0, 0, 0], [z, dir])) : [];
  return { o: start, geom: { lines: [[[0, 0, 0], at([0, 0, 0], [len, dir])]], rosettes } };
}

/**
 * The drawing with the parts of the export added. Coordinates of the export are in drawing units;
 * they are scaled to the parts of the DXF (PERI parts may be placed in metres in a drawing in mm)
 * and turned upright like them.
 */
export function mergePeriExport(doc: ScaffoldDoc, ex: ExportFile, file: string): ScaffoldDoc {
  const parts = ex.entries.filter((e) => e.type === 'PERI_AEC_DB_BAUTEIL' && point(e.fields.Min) && point(e.fields.Max));
  // groups of the older kind (e.g. "UJB 38-50/30" = spindle + nut): their parts are exported as well;
  // a group without any exported part inside its box is reported
  const inside = (g: ExportEntry) => {
    // the box of a group is only its symbol; its insertion point lies in the box of its parts
    const q = point(g.fields.Location) ?? point(g.fields.Min);
    if (!q) return false;
    return parts.some((e) => {
      const a = point(e.fields.Min)!;
      const b = point(e.fields.Max)!;
      const tol = 1e-3 * Math.max(1, ...[0, 1, 2].map((i) => b[i] - a[i]));
      return [0, 1, 2].every((i) => q[i] >= a[i] - tol && q[i] <= b[i] + tol);
    });
  };
  const groups = ex.entries.filter((e) => /GRUPPE/i.test(e.type) && !inside(e)).length;
  // scale: compare the positions of the export with those of the parts of the DXF
  let scale = ex.insunits === 4 ? 1e-3 : 1;
  if (doc.parts.length && parts.length) {
    const here = med(doc.parts.map((p) => Math.hypot(p.m[3], p.m[7], p.m[11])));
    const there = med(parts.map((e) => Math.hypot(...centre(e))));
    if (here > 1) scale = there / here > 300 ? 1e-3 : 1;
  }
  const R = doc.up;
  const tf = (q: V3): V3 => {
    const s: V3 = [q[0] * scale, q[1] * scale, q[2] * scale];
    return R ? [0, 1, 2].map((i) => R[i * 3] * s[0] + R[i * 3 + 1] * s[1] + R[i * 3 + 2] * s[2]) as V3 : s;
  };
  const turn = (v: V3): V3 => (R ? ([0, 1, 2].map((i) => R[i * 3] * v[0] + R[i * 3 + 1] * v[1] + R[i * 3 + 2] * v[2]) as V3) : v);
  // a group with a catalogue article (spindle UJB 38-50/30 = spindle + nut, coupler SW 48/48, …) is one
  // part of the catalogue: its parts (the one holding its insertion point and those inside that one)
  // become one part with the article, name and weight of the group
  const box = (e: ExportEntry): [V3, V3] => [point(e.fields.Min)!, point(e.fields.Max)!];
  const within = (q: V3, [a, b]: [V3, V3]) => {
    const tol = 1e-3 * Math.max(1, ...[0, 1, 2].map((i) => b[i] - a[i]));
    return [0, 1, 2].every((i) => q[i] >= a[i] - tol && q[i] <= b[i] + tol);
  };
  const used = new Set<ExportEntry>();
  const items: { f: Record<string, string>; a0: V3; b0: V3 }[] = [];
  for (const g of ex.entries) {
    if (!/GRUPPE/i.test(g.type) || !findPart(g.fields.ArtNr ?? '')) continue;
    const q = point(g.fields.Location);
    const main = q ? parts.find((e) => !used.has(e) && within(q, box(e))) : undefined;
    if (!main) continue;
    const members = [main, ...parts.filter((e) => e !== main && !used.has(e) && within(centre(e), box(main)))];
    for (const m of members) used.add(m);
    const bs = members.map(box);
    items.push({
      f: { ...g.fields, Handle: main.fields.Handle ?? g.fields.Handle ?? '' },
      a0: [0, 1, 2].map((i) => Math.min(...bs.map((b) => b[0][i]))) as V3,
      b0: [0, 1, 2].map((i) => Math.max(...bs.map((b) => b[1][i]))) as V3,
    });
  }
  // pieces of a catalogue part ("017010_02", "zu_017010_01") outside the box of their group's main part:
  // already counted with the group nearby
  const groupAt = ex.entries.filter((g) => /GRUPPE/i.test(g.type) && findPart(g.fields.ArtNr ?? '') && point(g.fields.Location));
  for (const e of parts) {
    if (used.has(e)) continue;
    const base = /^(?:zu_)?(\d{6})_\d+$/.exec((e.fields.ArtNr ?? '').trim())?.[1];
    if (!base) continue;
    const [a, b] = box(e);
    const r = 3 * Math.max(...[0, 1, 2].map((i) => b[i] - a[i]));
    const c = centre(e);
    if (groupAt.some((g) => g.fields.ArtNr === base && Math.hypot(...point(g.fields.Location)!.map((v, i) => v - c[i])) <= r)) used.add(e);
  }
  for (const e of parts) if (!used.has(e)) items.push({ f: e.fields, a0: box(e)[0], b0: box(e)[1] });
  let guessed = 0;
  let unknown = 0;
  const added: ScaffoldPart[] = [];
  for (const { f, a0, b0 } of items) {
    const e = { fields: f };
    // the box turned upright: its corners
    const corners: V3[] = [];
    for (const x of [a0[0], b0[0]]) for (const y of [a0[1], b0[1]]) for (const z of [a0[2], b0[2]]) corners.push(tf([x, y, z]));
    const lo: V3 = [0, 1, 2].map((i) => Math.min(...corners.map((c) => c[i]))) as V3;
    const hi: V3 = [0, 1, 2].map((i) => Math.max(...corners.map((c) => c[i]))) as V3;
    const d: V3 = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    const c: V3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const article = (e.fields.ArtNr ?? '').trim() || '?';
    const db = findPart(article, e.fields.Bezeichnung ?? '');
    const name = (e.fields.Bezeichnung ?? '').trim() || db?.name || article;
    const desc = db?.name ?? name;
    if (!db) unknown++;
    const kind = classifyPart(article, name, desc).kind;
    // placed by its insertion point, rotation and normal where the export gives them
    const pg = placedGeom(e.fields, kind, `${name} ${desc}`, tf, turn, scale);
    if (pg) {
      added.push({ id: `X${e.fields.Handle ?? added.length}`, article, name, desc, layer: e.fields.Layer ?? '', m: [1, 0, 0, pg.o[0], 0, 1, 0, pg.o[1], 0, 0, 1, pg.o[2]], geom: pg.geom });
      continue;
    }
    // else the axis of the part from its box, relative to the centre of the box
    let line: [V3, V3];
    const big = [0, 1, 2].filter((i) => d[i] > 0.12);
    if (kind === 'jack' || kind === 'standard' || kind === 'base' || (big.length === 1 && big[0] === 2) || (d[2] >= d[0] && d[2] >= d[1] && big.length < 2)) {
      line = [
        [0, 0, -d[2] / 2],
        [0, 0, d[2] / 2],
      ];
    } else if (big.length <= 1) {
      const i = d[0] >= d[1] ? 0 : 1;
      const p: V3 = [0, 0, 0];
      p[i] = d[i] / 2;
      line = [[-p[0], -p[1], 0], p];
    } else {
      // across the box in the plane of its two largest sides: which of the two diagonals is not known
      guessed++;
      const p: V3 = [0, 0, 0];
      for (const i of big) p[i] = d[i] / 2;
      line = [[-p[0], -p[1], -p[2]], p];
    }
    const geom: PartGeom = { lines: [line], rosettes: [] };
    added.push({ id: `X${e.fields.Handle ?? added.length}`, article, name, desc, layer: e.fields.Layer ?? '', m: [1, 0, 0, c[0], 0, 1, 0, c[1], 0, 0, 1, c[2]], geom });
  }
  return {
    ...doc,
    parts: [...doc.parts.filter((p) => !p.id.startsWith('X')), ...added],
    exported: { file, added: added.length, groups, guessed, unknown },
  };
}
