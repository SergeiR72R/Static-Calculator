/**
 * Parts of the older PERI CAD kind (PERI_AEC_DB_BAUTEIL: base jacks and others) are not written to
 * DXF by AutoCAD. The AutoLISP command PERIEXPORT (tools/PERIEXPORT.lsp) writes them to a text file
 * next to the drawing: article, name, size and the bounding box in world coordinates. Here these
 * parts are added to the drawing read from the DXF: their axis from the bounding box (vertical for
 * jacks and standards, along the longest side for ledgers and beams, across the box for diagonals).
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

const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0;

/**
 * The drawing with the parts of the export added. Coordinates of the export are in drawing units;
 * they are scaled to the parts of the DXF (PERI parts may be placed in metres in a drawing in mm)
 * and turned upright like them.
 */
export function mergePeriExport(doc: ScaffoldDoc, ex: ExportFile, file: string): ScaffoldDoc {
  const parts = ex.entries.filter((e) => e.type === 'PERI_AEC_DB_BAUTEIL' && point(e.fields.Min) && point(e.fields.Max));
  const groups = ex.entries.filter((e) => /GRUPPE/i.test(e.type)).length;
  // scale: compare the positions of the export with those of the parts of the DXF
  const centre = (e: ExportEntry): V3 => {
    const a = point(e.fields.Min)!;
    const b = point(e.fields.Max)!;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  };
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
  let guessed = 0;
  let unknown = 0;
  const added: ScaffoldPart[] = [];
  for (const e of parts) {
    const a0 = point(e.fields.Min)!;
    const b0 = point(e.fields.Max)!;
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
    // axis of the part, relative to the centre of the box
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
