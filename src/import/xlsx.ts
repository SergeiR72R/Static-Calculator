/**
 * Minimal .xlsx reader (no dependencies besides fflate for unzipping): worksheets as cell grids
 * (shared strings, inline strings, numbers, booleans) and the images anchored on a sheet.
 * Works in the browser and in Node (regex based XML parsing, no DOMParser).
 */
import { strFromU8, unzipSync } from 'fflate';

export type CellValue = string | number | boolean | null;

export interface Sheet {
  name: string;
  /** rows[r][c], 0-based */
  rows: CellValue[][];
  /** images anchored on the sheet: top-left cell (0-based) and data URL */
  images: { row: number; col: number; dataUrl: string }[];
}

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');

/** Concatenated text of all <t> elements (rich text runs) */
const textOf = (xml: string) => decodeXml([...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => m[1]).join(''));

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** "AB12" → [row 11, col 27] */
function cellRef(ref: string): [number, number] {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return [0, 0];
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return [Number(m[2]) - 1, c - 1];
}

/** Resolve a relationship target relative to the folder of the part that owns the .rels */
function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

function rels(files: Record<string, Uint8Array>, part: string): Map<string, string> {
  const dir = part.split('/').slice(0, -1).join('/');
  const file = part.split('/').pop()!;
  const raw = files[`${dir}/_rels/${file}.rels`];
  const map = new Map<string, string>();
  if (!raw) return map;
  for (const m of strFromU8(raw).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) map.set(id, resolvePath(part, target));
  }
  return map;
}

function toBase64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml' };

export function readXlsx(data: Uint8Array): Sheet[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    throw new Error('import.notXlsx');
  }
  const wbXml = files['xl/workbook.xml'];
  if (!wbXml) throw new Error('import.notXlsx');
  const wbRels = rels(files, 'xl/workbook.xml');
  const shared = files['xl/sharedStrings.xml'] ? [...strFromU8(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];

  const sheets: Sheet[] = [];
  for (const m of strFromU8(wbXml).matchAll(/<sheet\b[^>]*>/g)) {
    const name = decodeXml(attr(m[0], 'name') ?? '');
    const rid = attr(m[0], 'r:id');
    const path = rid ? wbRels.get(rid) : undefined;
    if (!path || !files[path]) continue;
    const xml = strFromU8(files[path]);
    const rows: CellValue[][] = [];
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const head = c[1];
      const body = c[2] ?? '';
      const ref = attr(head, 'r');
      if (!ref) continue;
      const [r, col] = cellRef(ref);
      const t = attr(head, 't');
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let val: CellValue = null;
      if (t === 'inlineStr') val = textOf(body);
      else if (t === 's') val = v !== undefined ? (shared[Number(v)] ?? '') : '';
      else if (t === 'str') val = v !== undefined ? decodeXml(v) : '';
      else if (t === 'b') val = v === '1';
      else if (v !== undefined) val = Number(v);
      (rows[r] ??= [])[col] = val;
    }
    for (let i = 0; i < rows.length; i++) rows[i] ??= [];

    // images: sheet → drawing → anchors (from row/col) → image parts
    const images: Sheet['images'] = [];
    const sRels = rels(files, path);
    const drawingId = /<drawing\b[^>]*r:id="([^"]+)"/.exec(xml)?.[1];
    const drawingPath = drawingId ? sRels.get(drawingId) : undefined;
    if (drawingPath && files[drawingPath]) {
      const dRels = rels(files, drawingPath);
      const dXml = strFromU8(files[drawingPath]);
      // namespace prefixes vary between producers (xdr:… or default namespace)
      for (const a of dXml.matchAll(/<(?:\w+:)?(oneCellAnchor|twoCellAnchor)\b[\s\S]*?<\/(?:\w+:)?\1>/g)) {
        const from = /<(?:\w+:)?from>[\s\S]*?<(?:\w+:)?col>(\d+)<\/(?:\w+:)?col>[\s\S]*?<(?:\w+:)?row>(\d+)<\/(?:\w+:)?row>/.exec(a[0]);
        const embed = /r:embed="([^"]+)"/.exec(a[0])?.[1];
        const img = embed ? dRels.get(embed) : undefined;
        if (!from || !img || !files[img]) continue;
        const ext = img.split('.').pop()!.toLowerCase();
        images.push({ row: Number(from[2]), col: Number(from[1]), dataUrl: `data:${MIME[ext] ?? 'application/octet-stream'};base64,${toBase64(files[img])}` });
      }
    }
    sheets.push({ name, rows, images });
  }
  return sheets;
}
