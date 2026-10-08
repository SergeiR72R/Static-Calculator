import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from '../core/analysis';
import { computeView } from '../core/results';
import { TEMPLATE_IDS, pointLoad, momentLoad, udl } from '../core/defaults';
import { exampleModel } from '../core/examples';
import { DXF_LAYERS, buildDxf, type DxfOptions } from './dxf';
import { decodeCodepage, encodeCodepage, escapeForCodepage } from './codepage';
import type { Lang } from '../units/format';

const ALLOWED = new Set(['LINE', 'POLYLINE', 'VERTEX', 'SEQEND', 'SOLID', 'ARC', 'CIRCLE', 'TEXT']);

function opts(lang: Lang): DxfOptions {
  return {
    lang,
    units: 'metric',
    decimals: 2,
    scales: { N: 20, V: 20, M: 20, w: 0 },
    momentSide: 'bottom',
    title: lang === 'ru' ? 'Проверка' : 'Prüfung Träger',
    viewLabel: 'GZT',
  };
}

function build(id: (typeof TEMPLATE_IDS)[number], lang: Lang, view: 'combo' | 'envelope' = 'combo') {
  const m = exampleModel(id);
  if (id === 'simple') {
    m.loads.push(pointLoad('Q', 2, 12, 60), momentLoad('G', 4, 8), udl('G', 1, 5, 2, 2, 'x'));
  }
  const an = analyze(m);
  const vr = computeView(an, view === 'combo' ? { type: 'combo', id: 'ULS1' } : { type: 'envelope' })!;
  return buildDxf(an, vr, opts(lang));
}

/** Parse group code / value pairs */
function pairs(text: string): [number, string][] {
  const lines = text.split('\r\n');
  if (lines[lines.length - 1] === '') lines.pop();
  expect(lines.length % 2).toBe(0);
  const out: [number, string][] = [];
  for (let i = 0; i < lines.length; i += 2) {
    expect(lines[i].trim(), `line ${i}`).toMatch(/^-?\d+$/);
    out.push([Number(lines[i]), lines[i + 1]]);
  }
  return out;
}

describe('DXF R12 writer', () => {
  it('has the R12 structure: header, tables, blocks, entities, EOF', () => {
    const text = build('gerber', 'de').toString();
    const p = pairs(text);
    const sections = p.filter((x, i) => x[0] === 2 && p[i - 1]?.[1] === 'SECTION').map((x) => x[1]);
    expect(sections).toEqual(['HEADER', 'TABLES', 'BLOCKS', 'ENTITIES']);
    expect(p[p.length - 1]).toEqual([0, 'EOF']);
    const iv = p.findIndex((x) => x[1] === '$ACADVER');
    expect(p[iv + 1]).toEqual([1, 'AC1009']);
    const ic = p.findIndex((x) => x[1] === '$DWGCODEPAGE');
    expect(p[ic + 1]).toEqual([3, 'ANSI_1252']);
  });

  it('defines all layers with the AutoCAD color index', () => {
    const p = pairs(build('simple', 'de').toString());
    for (const l of DXF_LAYERS) {
      const i = p.findIndex((x, k) => x[0] === 2 && x[1] === l.name && p[k - 1][1] === 'LAYER');
      expect(i, l.name).toBeGreaterThan(0);
      const color = p.slice(i, i + 6).find((x) => x[0] === 62);
      expect(Number(color?.[1])).toBe(l.color);
    }
  });

  it('uses only R12 entities, POLYLINE sequences are terminated and every entity has a layer', () => {
    for (const id of TEMPLATE_IDS) {
      const p = pairs(build(id, 'en', 'envelope').toString());
      const start = p.findIndex((x, i) => x[1] === 'ENTITIES' && p[i - 1][1] === 'SECTION');
      let inPoly = false;
      const layers = new Set(DXF_LAYERS.map((l) => l.name));
      const counts: Record<string, number> = {};
      for (let i = start + 1; i < p.length; i++) {
        const [code, val] = p[i];
        if (code !== 0) continue;
        if (val === 'ENDSEC') break;
        expect(ALLOWED.has(val), val).toBe(true);
        counts[val] = (counts[val] ?? 0) + 1;
        expect(p[i + 1][0]).toBe(8);
        expect(layers.has(p[i + 1][1])).toBe(true);
        if (val === 'POLYLINE') {
          expect(inPoly).toBe(false);
          inPoly = true;
        } else if (val === 'SEQEND') {
          expect(inPoly).toBe(true);
          inPoly = false;
        } else if (val === 'VERTEX') expect(inPoly).toBe(true);
        else expect(inPoly).toBe(false);
      }
      expect(inPoly).toBe(false);
      expect(counts.LINE).toBeGreaterThan(10);
      expect(counts.POLYLINE).toBeGreaterThan(3);
      expect(counts.TEXT).toBeGreaterThan(3);
      expect(counts.SOLID).toBeGreaterThan(0);
    }
  });

  it('diagram layers carry the diagrams, hatching made of LINE entities', () => {
    const p = pairs(build('twoSpan', 'de').toString());
    const onLayer = (type: string, layer: string) => p.filter((x, i) => x[0] === 0 && x[1] === type && p[i + 1][1] === layer).length;
    expect(onLayer('POLYLINE', 'DIAG_M')).toBeGreaterThan(0);
    expect(onLayer('LINE', 'DIAG_M')).toBeGreaterThan(20);
    expect(onLayer('POLYLINE', 'DIAG_V')).toBeGreaterThan(0);
    expect(onLayer('POLYLINE', 'DEFLECTION')).toBe(1);
    expect(onLayer('TEXT', 'TEXT')).toBeGreaterThan(2);
    expect(p.some((x) => x[0] === 0 && x[1] === 'HATCH')).toBe(false);
    expect(p.some((x) => x[0] === 0 && x[1] === 'LWPOLYLINE')).toBe(false);
  });

  it('encodes German umlauts in ANSI_1252 and Russian in ANSI_1251', () => {
    const de = build('simple', 'de');
    const deBytes = de.bytes();
    const deText = decodeCodepage(deBytes, 'ANSI_1252');
    expect(deText).toContain('Prüfung Träger');
    expect(deBytes.includes(0xfc)).toBe(true); // ü
    const ru = build('simple', 'ru');
    const ruBytes = ru.bytes();
    const ruText = decodeCodepage(ruBytes, 'ANSI_1251');
    expect(ruText).toContain('ANSI_1251');
    expect(ruText).toContain('Изгибающий момент');
    // one byte per character (single-byte code page, no UTF-8 multi-byte sequences)
    expect(ruBytes.length).toBe([...ru.toString()].length);
    expect(ruBytes.includes(0xc8)).toBe(true); // И
  });

  it('escapes characters missing in the code page as \\U+XXXX', () => {
    expect(escapeForCodepage('a→b', 'ANSI_1252')).toBe('a\\U+2192b');
    expect(escapeForCodepage('Ж²', 'ANSI_1251')).toBe('Ж\\U+00B2');
    expect(escapeForCodepage('Maß 10 kN·m', 'ANSI_1252')).toBe('Maß 10 kN·m');
    expect(Array.from(encodeCodepage('€ä', 'ANSI_1252'))).toEqual([0x80, 0xe4]);
    expect(Array.from(encodeCodepage('Яё', 'ANSI_1251'))).toEqual([0xdf, 0xb8]);
  });

  it('beam is drawn 1:1 in millimetres', () => {
    const p = pairs(build('simple', 'de').toString());
    const i = p.findIndex((x, k) => x[0] === 0 && x[1] === 'LINE' && p[k + 1][1] === 'BEAM_AXIS');
    const vals = Object.fromEntries(p.slice(i + 2, i + 8).map(([c, v]) => [c, Number(v)]));
    expect(vals[10]).toBe(0);
    expect(vals[11]).toBe(6000);
  });

  it('writes sample files for the ezdxf audit (DXF_SAMPLES_DIR)', () => {
    const dir = process.env.DXF_SAMPLES_DIR;
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    for (const id of TEMPLATE_IDS)
      for (const lang of ['de', 'ru', 'en'] as Lang[]) {
        writeFileSync(join(dir, `${id}-${lang}.dxf`), build(id, lang).bytes());
        writeFileSync(join(dir, `${id}-${lang}-envelope.dxf`), build(id, lang, 'envelope').bytes());
      }
  });
});
