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
}

export interface ScaffoldDoc {
  fileName: string;
  parts: ScaffoldPart[];
  /** system geometry by article number */
  geom: Record<string, PartGeom>;
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
function readRecords(text: string): Map<string, Rec[]> {
  const lines = text.split(/\r?\n/);
  const out = new Map<string, Rec[]>();
  let sec = '';
  let cur: Rec | null = null;
  let list: Rec[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
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

/** Parse the text of a PERI CAD DXF. Throws ScaffoldImportError with an i18n key. */
export function parsePeriCadDxf(text: string, fileName = ''): ScaffoldDoc {
  const head = text.slice(0, 32);
  if (head.startsWith('AC10')) throw new ScaffoldImportError('scaffold.err.dwg');
  if (head.startsWith('AutoCAD Binary DXF')) throw new ScaffoldImportError('scaffold.err.binary');
  const secs = readRecords(text);
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
  if (!raws.length) {
    const proxies = (secs.get('ENTITIES') ?? []).some((r) => r.type === 'ACAD_PROXY_ENTITY');
    throw new ScaffoldImportError(proxies ? 'scaffold.err.proxy' : 'scaffold.err.noParts');
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
  return { fileName, parts: raws.map((r) => r.part), geom };
}

/** part placement applied to a local point */
export function place(m: number[], q: V3): V3 {
  return [m[0] * q[0] + m[1] * q[1] + m[2] * q[2] + m[3], m[4] * q[0] + m[5] * q[1] + m[6] * q[2] + m[7], m[8] * q[0] + m[9] * q[1] + m[10] * q[2] + m[11]];
}
