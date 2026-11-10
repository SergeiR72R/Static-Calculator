/**
 * Reader for drawings of PERI CAD saved as ASCII DXF ("Speichern unter → AutoCAD DXF").
 *
 * PERI CAD writes every scaffold part as a custom entity PERI_PARTS_AC_DB_CONSTRUCTED_SINGLE_PIECE
 * in model space:
 *   100 PERIAcDbAcadEntity → 90, then 16 × code 40: placement matrix 4 × 4 (row major, metres)
 *   100 PERIAcDbConstructedPart → 340: handle of the part type (…_SINGLE_PIECE_INTRINSIC object)
 * The part type (OBJECTS section) holds the article number, the short name, the description and the
 * handles of its display blocks ("Top", "Line", "3D", …). The "Line" block contains the system
 * lines of the part (LINE) and its rosettes / node discs (CIRCLE, also via INSERT).
 *
 * Only plain text parsing, no external libraries.
 */

export type V3 = [number, number, number];

/** system geometry of a part type in its local coordinates */
export interface PartGeom {
  lines: [V3, V3][];
  /** rosettes / connection discs (circle centres) */
  rosettes: V3[];
}

export interface ScaffoldPart {
  /** DXF handle */
  id: string;
  article: string;
  /** short name, e.g. "UVR 200" */
  name: string;
  /** description, e.g. "Vertikalstiel UVR 200" */
  desc: string;
  layer: string;
  /** placement: row-major 3 × 4 (rotation | translation), metres */
  m: number[];
  /** own system lines (parts from the PERIEXPORT file of AutoCAD), instead of the geometry of the article */
  geom?: PartGeom;
}

export interface ScaffoldDoc {
  fileName: string;
  parts: ScaffoldPart[];
  /** system geometry by article number */
  geom: Record<string, PartGeom>;
  /** parts of the older PERI CAD kind (PERI_AEC_DB_BAUTEIL) in the drawing: AutoCAD does not write them to DXF */
  aecParts?: number;
  /** other block references of the drawing (timber planks, blocks …): name and insertion point, m */
  blocks?: { name: string; p: V3 }[];
  /** rotation (row-major 3 × 3) that turned the drawing upright (y up in PERI CAD) */
  up?: number[];
  /** parts added from the PERIEXPORT file of AutoCAD */
  exported?: { file: string; added: number; groups: number; guessed: number; unknown: number };
}

/** number of instances of the older PERI CAD parts (class PERI_AEC_DB_BAUTEIL) from the CLASSES section */
export function aecPartCount(text: string): number {
  const head = text.slice(0, 4_000_000);
  const m = /\n\s*1\r?\nPERI_AEC_DB_BAUTEIL\r?\n(?:\s*\d+\r?\n[^\n]*\n){0,6}?\s*91\r?\n\s*(\d+)/.exec(head);
  return m ? Number(m[1]) : 0;
}

export class ScaffoldImportError extends Error {
  constructor(key: string) {
    super(key);
  }
}

type Tag = [number, string];
interface Rec {
  type: string;
  tags: Tag[];
}

/** DXF records (0-groups) by section */
function readRecords(text: string, progress?: (frac: number) => void): Map<string, Rec[]> {
  const lines = text.split(/\r?\n/);
  const step = 2 * Math.max(Math.floor(lines.length / 200), 1000);
  const out = new Map<string, Rec[]>();
  let sec = '';
  let cur: Rec | null = null;
  let list: Rec[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (progress && i % step === 0) progress(i / lines.length);
    const code = parseInt(lines[i], 10);
    if (Number.isNaN(code)) throw new ScaffoldImportError('scaffold.err.format');
    const v = lines[i + 1].trim();
    if (code === 0) {
      if (v === 'SECTION') {
        cur = null;
        sec = '';
        continue;
      }
      if (v === 'ENDSEC') {
        cur = null;
        continue;
      }
      if (v === 'EOF') break;
      cur = { type: v, tags: [] };
      list.push(cur);
      continue;
    }
    if (code === 2 && !sec && !cur) {
      sec = v;
      list = [];
      out.set(sec, list);
      continue;
    }
    cur?.tags.push([code, v]);
  }
  return out;
}

const first = (r: Rec, code: number) => r.tags.find((t) => t[0] === code)?.[1];
const num = (v: string | undefined, d = 0) => {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : d;
};

/** index of the subclass marker (100) with this name, −1 if none */
const marker = (r: Rec, name: string) => r.tags.findIndex((t) => t[0] === 100 && t[1] === name);

interface RawBlock {
  lines: [V3, V3][];
  circles: V3[];
  inserts: { name: string; p: V3; s: V3; rot: number }[];
}

function readBlocks(recs: Rec[]): Map<string, RawBlock> {
  const blocks = new Map<string, RawBlock>();
  let cur: RawBlock | null = null;
  for (const r of recs) {
    if (r.type === 'BLOCK') {
      cur = { lines: [], circles: [], inserts: [] };
      blocks.set(first(r, 2) ?? '', cur);
      continue;
    }
    if (r.type === 'ENDBLK') {
      cur = null;
      continue;
    }
    if (!cur) continue;
    const p = (c: number): V3 => [num(first(r, c)), num(first(r, c + 10)), num(first(r, c + 20))];
    if (r.type === 'LINE') cur.lines.push([p(10), p(11)]);
    else if (r.type === 'CIRCLE') cur.circles.push(p(10));
    else if (r.type === 'LWPOLYLINE') {
      const xs = r.tags.filter((t) => t[0] === 10).map((t) => num(t[1]));
      const ys = r.tags.filter((t) => t[0] === 20).map((t) => num(t[1]));
      const z = num(first(r, 38));
      const pts: V3[] = xs.map((x, k) => [x, ys[k] ?? 0, z]);
      const closed = (num(first(r, 70)) & 1) === 1;
      for (let k = 1; k < pts.length; k++) cur.lines.push([pts[k - 1], pts[k]]);
      if (closed && pts.length > 2) cur.lines.push([pts[pts.length - 1], pts[0]]);
    } else if (r.type === 'INSERT')
      cur.inserts.push({ name: first(r, 2) ?? '', p: p(10), s: [num(first(r, 41), 1), num(first(r, 42), 1), num(first(r, 43), 1)], rot: num(first(r, 50)) });
  }
  return blocks;
}

/** block geometry with nested inserts resolved */
function flatten(blocks: Map<string, RawBlock>, name: string, depth = 0): PartGeom {
  const b = blocks.get(name);
  const g: PartGeom = { lines: [], rosettes: [] };
  if (!b || depth > 6) return g;
  g.lines.push(...b.lines.map(([a, c]) => [[...a], [...c]] as [V3, V3]));
  g.rosettes.push(...b.circles.map((c) => [...c] as V3));
  for (const ins of b.inserts) {
    const sub = flatten(blocks, ins.name, depth + 1);
    const c = Math.cos((ins.rot * Math.PI) / 180);
    const s = Math.sin((ins.rot * Math.PI) / 180);
    const tf = (q: V3): V3 => {
      const x = q[0] * ins.s[0];
      const y = q[1] * ins.s[1];
      return [ins.p[0] + c * x - s * y, ins.p[1] + s * x + c * y, ins.p[2] + q[2] * ins.s[2]];
    };
    g.lines.push(...sub.lines.map(([a, e]) => [tf(a), tf(e)] as [V3, V3]));
    g.rosettes.push(...sub.rosettes.map(tf));
  }
  return g;
}

const DISPLAY_BLOCK = /^PERI_(\d{6}(?:-\d+)?)_PartDisplayName_(.+)$/;

/**
 * Parts of the older PERI CAD kind (PERI_AEC_DB_BAUTEIL) are not written to DXF. Exploded in
 * AutoCAD they become references of their display block "PERI_<article>_PartDisplayName_3D"; the
 * axis comes from the block "…_Line". Returns the parts with the placement of the block (rotation
 * only; the uniform scale of the reference is returned separately) in drawing units.
 */
function readInsertedParts(ents: Rec[], blocks: Map<string, RawBlock>): { part: ScaffoldPart; scale: number; size: number }[] {
  const out: { part: ScaffoldPart; scale: number; size: number }[] = [];
  const seen = new Set<string>();
  const visit = (name: string, M: number[], layer: string, id: string, depth: number) => {
    const mt = DISPLAY_BLOCK.exec(name);
    if (mt) {
      const article = mt[1];
      if (!blocks.has(`PERI_${article}_PartDisplayName_Line`)) return;
      // rotation and uniform scale of the reference
      const col = (j: number) => Math.hypot(M[j], M[4 + j], M[8 + j]);
      const scale = (col(0) + col(1) + col(2)) / 3 || 1;
      const m = M.map((v, i) => (i % 4 === 3 ? v : v / scale));
      // the same part shown in several views: once
      const key = `${article}|${[m[3], m[7], m[11]].map((v) => Math.round(v / scale * 1000)).join(',')}|${[m[2], m[6], m[10]].map((v) => Math.round(v * 10)).join(',')}`;
      if (seen.has(key)) return;
      seen.add(key);
      const g = flatten(blocks, `PERI_${article}_PartDisplayName_Line`);
      let size = 0;
      for (const [a, b] of g.lines) size = Math.max(size, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * scale);
      // the name comes from the parts database (analyzeScaffold): the reference carries none
      out.push({ part: { id, article, name: article, desc: '', layer, m }, scale, size });
      return;
    }
    // a block holding exploded parts
    const b = blocks.get(name);
    if (!b || depth > 3) return;
    b.inserts.forEach((ins, k) => visit(ins.name, mul34(M, insertMatrix(ins.p, ins.s, ins.rot, [0, 0, 1])), layer, `${id}.${k}`, depth + 1));
  };
  for (const r of ents) {
    if (r.type !== 'INSERT') continue;
    const name = first(r, 2) ?? '';
    if (!DISPLAY_BLOCK.test(name) && !blocks.get(name)?.inserts.some((i) => DISPLAY_BLOCK.test(i.name))) continue;
    const p: V3 = [num(first(r, 10)), num(first(r, 20)), num(first(r, 30))];
    const sc: V3 = [num(first(r, 41), 1), num(first(r, 42), 1), num(first(r, 43), 1)];
    const ex: V3 = [num(first(r, 210)), num(first(r, 220)), num(first(r, 230), 1)];
    visit(name, insertMatrix(p, sc, num(first(r, 50)), ex), first(r, 8) ?? '', first(r, 5) ?? `I${out.length}`, 0);
  }
  return out;
}

/** placement (row-major 3 × 4) of a block reference: OCS of the extrusion, rotation about it, scale */
export function insertMatrix(p: V3, s: V3, rotDeg: number, extrusion: V3): number[] {
  const nl = Math.hypot(...extrusion) || 1;
  const N: V3 = [extrusion[0] / nl, extrusion[1] / nl, extrusion[2] / nl];
  // arbitrary axis algorithm of the DXF reference
  const ax0: V3 = Math.abs(N[0]) < 1 / 64 && Math.abs(N[1]) < 1 / 64 ? [N[2], 0, -N[0]] : [-N[1], N[0], 0];
  const al = Math.hypot(...ax0);
  const Ax: V3 = [ax0[0] / al, ax0[1] / al, ax0[2] / al];
  const Ay: V3 = [N[1] * Ax[2] - N[2] * Ax[1], N[2] * Ax[0] - N[0] * Ax[2], N[0] * Ax[1] - N[1] * Ax[0]];
  const c = Math.cos((rotDeg * Math.PI) / 180);
  const sn = Math.sin((rotDeg * Math.PI) / 180);
  // OCS axes of the block: x' = c·Ax + s·Ay, y' = −s·Ax + c·Ay, z' = N; insertion point in OCS
  const X: V3 = [c * Ax[0] + sn * Ay[0], c * Ax[1] + sn * Ay[1], c * Ax[2] + sn * Ay[2]];
  const Y: V3 = [-sn * Ax[0] + c * Ay[0], -sn * Ax[1] + c * Ay[1], -sn * Ax[2] + c * Ay[2]];
  const P: V3 = [p[0] * Ax[0] + p[1] * Ay[0] + p[2] * N[0], p[0] * Ax[1] + p[1] * Ay[1] + p[2] * N[1], p[0] * Ax[2] + p[1] * Ay[2] + p[2] * N[2]];
  return [X[0] * s[0], Y[0] * s[1], N[0] * s[2], P[0], X[1] * s[0], Y[1] * s[1], N[1] * s[2], P[1], X[2] * s[0], Y[2] * s[1], N[2] * s[2], P[2]];
}

/** a · b for row-major 3 × 4 placements */
function mul34(a: number[], b: number[]): number[] {
  const out = new Array<number>(12);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 4; j++) out[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j] + (j === 3 ? a[i * 4 + 3] : 0);
  return out;
}

/**
 * Parse the text of a PERI CAD DXF. Throws ScaffoldImportError with an i18n key. `progress` gets the
 * share of the records read (0…1).
 */
export function parsePeriCadDxf(text: string, fileName = '', progress?: (frac: number) => void): ScaffoldDoc {
  const head = text.slice(0, 32);
  if (head.startsWith('AC10')) throw new ScaffoldImportError('scaffold.err.dwg');
  if (head.startsWith('AutoCAD Binary DXF')) throw new ScaffoldImportError('scaffold.err.binary');
  const secs = readRecords(text, progress);
  if (!secs.has('ENTITIES')) throw new ScaffoldImportError('scaffold.err.format');

  // handle → record (objects, tables and blocks)
  const byHandle = new Map<string, Rec>();
  for (const recs of secs.values())
    for (const r of recs) {
      const h = first(r, 5) ?? first(r, 105);
      if (h) byHandle.set(h, r);
    }
  const blocks = readBlocks(secs.get('BLOCKS') ?? []);

  interface Raw {
    part: ScaffoldPart;
    lineBlock: string;
  }
  const raws: Raw[] = [];
  for (const r of secs.get('ENTITIES') ?? []) {
    if (r.type !== 'PERI_PARTS_AC_DB_CONSTRUCTED_SINGLE_PIECE') continue;
    const k = marker(r, 'PERIAcDbAcadEntity');
    if (k < 0) continue;
    const mat = r.tags
      .slice(k + 1)
      .filter((t) => t[0] === 40)
      .slice(0, 16)
      .map((t) => num(t[1]));
    if (mat.length < 16) continue;
    const kc = marker(r, 'PERIAcDbConstructedPart');
    const typeHandle = kc >= 0 ? r.tags.slice(kc).find((t) => t[0] === 340)?.[1] : undefined;
    const T = typeHandle ? byHandle.get(typeHandle) : undefined;
    let article = '';
    let name = '';
    let desc = '';
    let lineBlock = '';
    if (T) {
      const ki = marker(T, 'PERIAcDbIntrinsicPart');
      const ks = marker(T, 'PERIAcDbSinglePieceIntrinsicPart');
      const strs = T.tags.slice(ki + 1, ks > ki ? ks : undefined).filter((t) => t[0] === 1).map((t) => t[1]);
      article = strs[0] ?? '';
      name = strs[1] ?? '';
      desc = strs[strs.length - 1] ?? name;
      if (ks >= 0) {
        const tail = T.tags.slice(ks);
        for (let i = 0; i + 1 < tail.length; i++)
          if (tail[i][0] === 1 && tail[i][1] === 'Line' && tail[i + 1][0] === 340) {
            const br = byHandle.get(tail[i + 1][1]);
            lineBlock = (br && first(br, 2)) ?? '';
            break;
          }
      }
    }
    if (!lineBlock && article) lineBlock = `PERI_${article}_PartDisplayName_Line`;
    raws.push({
      part: {
        id: first(r, 5) ?? String(raws.length),
        article: article || '?',
        name: name || article || '?',
        desc: desc || name,
        layer: first(r, 8) ?? '',
        m: [mat[0], mat[1], mat[2], mat[3], mat[4], mat[5], mat[6], mat[7], mat[8], mat[9], mat[10], mat[11]],
      },
      lineBlock,
    });
  }
  const aecParts = aecPartCount(text);
  // parts of the older kind exploded in AutoCAD: references of their display blocks
  const inserted = readInsertedParts(secs.get('ENTITIES') ?? [], blocks);
  if (!raws.length && !inserted.length) {
    const proxies = (secs.get('ENTITIES') ?? []).some((r) => r.type === 'ACAD_PROXY_ENTITY');
    throw new ScaffoldImportError(aecParts ? 'scaffold.err.aec' : proxies ? 'scaffold.err.proxy' : 'scaffold.err.noParts');
  }

  const geom: Record<string, PartGeom> = {};
  for (const r of raws) if (!geom[r.part.article] && blocks.has(r.lineBlock)) geom[r.part.article] = flatten(blocks, r.lineBlock);

  // units: PERI CAD works in metres; a drawing in millimetres has part geometry of hundreds of units
  let ext = 0;
  for (const g of Object.values(geom)) for (const [a, b] of g.lines) ext = Math.max(ext, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  if (ext > 50) {
    const s = 1e-3;
    for (const g of Object.values(geom)) {
      g.lines = g.lines.map(([a, b]) => [a.map((v) => v * s) as V3, b.map((v) => v * s) as V3]);
      g.rosettes = g.rosettes.map((p) => p.map((v) => v * s) as V3);
    }
    for (const r of raws) for (const i of [3, 7, 11]) r.part.m[i] *= s;
  }
  // exploded parts: the display blocks are in metres; the drawing unit follows from the parts above,
  // or else from the size of the placed parts
  let unit = ext > 50 ? 1e-3 : 1;
  if (inserted.length) {
    if (!raws.length) {
      const sizes = inserted.map((q) => q.size).sort((a, b) => a - b);
      unit = sizes[Math.floor(sizes.length / 2)] > 50 ? 1e-3 : 1;
    }
    const u = unit;
    for (const q of inserted) {
      const key = q.part.article;
      if (!geom[key]) {
        const g = flatten(blocks, `PERI_${key}_PartDisplayName_Line`);
        const k = q.scale * u;
        geom[key] = { lines: g.lines.map(([a, b]) => [a.map((v) => v * k) as V3, b.map((v) => v * k) as V3]), rosettes: g.rosettes.map((c) => c.map((v) => v * k) as V3) };
      }
      for (const i of [3, 7, 11]) q.part.m[i] *= u;
      raws.push({ part: q.part, lineBlock: '' });
    }
  }
  // vertical axis: PERI CAD drawings may be modelled with y (or another axis) up; the system lines of the
  // standards run along their local z axis. Rotate the drawing so that this direction becomes +z.
  const ups = new Map<string, { v: V3; n: number }>();
  for (const r of raws) {
    if (!/\bUV[RHB]\b|stiel/i.test(`${r.part.name} ${r.part.desc}`)) continue;
    const v: V3 = [r.part.m[2], r.part.m[6], r.part.m[10]];
    const k = v.map((x) => Math.round(x * 100)).join(',');
    const e = ups.get(k);
    if (e) e.n++;
    else ups.set(k, { v, n: 1 });
  }
  const up = [...ups.values()].sort((a, b) => b.n - a.n)[0]?.v;
  // other block references (planks under the spindles …) in metres
  let others: { name: string; p: V3 }[] = [];
  for (const r of secs.get('ENTITIES') ?? []) {
    const name = r.type === 'INSERT' ? (first(r, 2) ?? '') : '';
    if (!name || DISPLAY_BLOCK.test(name) || name.startsWith('*')) continue;
    const M = insertMatrix([num(first(r, 10)), num(first(r, 20)), num(first(r, 30))], [1, 1, 1], 0, [num(first(r, 210)), num(first(r, 220)), num(first(r, 230), 1)]);
    others.push({ name, p: [M[3] * unit, M[7] * unit, M[11] * unit] });
  }
  // PERI parts may be placed in metres in a drawing in millimetres (and the ordinary blocks in mm):
  // the blocks are scaled to the parts when their positions are about a thousand times larger
  if (others.length && raws.length) {
    const med = (v: number[]) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)];
    const parts = med(raws.map((r) => Math.hypot(r.part.m[3], r.part.m[7])));
    const blocksAt = med(others.map((o) => Math.hypot(o.p[0], o.p[1])));
    if (parts > 1 && blocksAt / parts > 300) others = others.map((o) => ({ name: o.name, p: o.p.map((v) => v * 1e-3) as V3 }));
  }
  let upR: number[] | undefined;
  if (up && up[2] < 0.999) {
    const R = rotationTo(up, [0, 0, 1]);
    upR = R;
    for (const r of raws) r.part.m = mulRT(R, r.part.m);
    others = others.map((o) => ({ name: o.name, p: [0, 1, 2].map((i) => R[i * 3] * o.p[0] + R[i * 3 + 1] * o.p[1] + R[i * 3 + 2] * o.p[2]) as V3 }));
  }
  return { fileName, parts: raws.map((r) => r.part), geom, ...(aecParts ? { aecParts } : {}), ...(others.length ? { blocks: others } : {}), ...(upR ? { up: upR } : {}) };
}

/** rotation matrix (row major 3 × 3) turning the unit vector a onto the unit vector b */
function rotationTo(a0: V3, b: V3): number[] {
  const n = Math.hypot(...a0);
  const a: V3 = [a0[0] / n, a0[1] / n, a0[2] / n];
  const c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (c < -0.999999) return [1, 0, 0, 0, -1, 0, 0, 0, -1]; // upside down: half turn about x
  const v: V3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const k = 1 / (1 + c);
  return [
    v[0] * v[0] * k + c,
    v[0] * v[1] * k - v[2],
    v[0] * v[2] * k + v[1],
    v[1] * v[0] * k + v[2],
    v[1] * v[1] * k + c,
    v[1] * v[2] * k - v[0],
    v[2] * v[0] * k - v[1],
    v[2] * v[1] * k + v[0],
    v[2] * v[2] * k + c,
  ];
}

/** R · [M | t] for a row-major 3 × 4 placement */
function mulRT(R: number[], m: number[]): number[] {
  const out = new Array<number>(12);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 4; j++) out[i * 4 + j] = R[i * 3] * m[j] + R[i * 3 + 1] * m[4 + j] + R[i * 3 + 2] * m[8 + j];
  return out;
}

/** part placement applied to a local point */
export function place(m: number[], q: V3): V3 {
  return [m[0] * q[0] + m[1] * q[1] + m[2] * q[2] + m[3], m[4] * q[0] + m[5] * q[1] + m[6] * q[2] + m[7], m[8] * q[0] + m[9] * q[1] + m[10] * q[2] + m[11]];
}
