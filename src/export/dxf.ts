/**
 * Client side ASCII DXF R12 (AC1009) generator — no external libraries.
 * Entities: LINE, POLYLINE/VERTEX/SEQEND, SOLID, ARC, CIRCLE, TEXT. Hatching is done with LINEs.
 * Drawing units: mm, beam at scale 1:1, diagrams offset downwards (DXF y axis points up).
 */
import type { Analysis } from '../core/analysis';
import type { ViewResult } from '../core/results';
import type { Load, Support } from '../core/types';
import { translate } from '../i18n';
import { formatNumber, type Lang } from '../units/format';
import { fromSI, unitSymbol, type Quantity, type UnitSystem } from '../units/units';
import { encodeCodepage, escapeForCodepage, type DxfCodepage } from './codepage';

export const DXF_LAYERS: { name: string; color: number }[] = [
  { name: 'BEAM_AXIS', color: 7 },
  { name: 'SUPPORTS', color: 1 },
  { name: 'LOADS', color: 4 },
  { name: 'DIAG_M', color: 3 },
  { name: 'DIAG_V', color: 5 },
  { name: 'DIAG_N', color: 6 },
  { name: 'DEFLECTION', color: 2 },
  { name: 'TEXT', color: 7 },
];

type Layer = (typeof DXF_LAYERS)[number]['name'];
type Pt = [number, number];

function n(v: number): string {
  const s = (Math.abs(v) < 5e-7 ? 0 : v).toFixed(4);
  return s.replace(/\.?0+$/, '') || '0';
}

export class DxfWriter {
  private out: string[] = [];
  private minX = Infinity;
  private minY = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;
  constructor(readonly codepage: DxfCodepage) {}

  private g(code: number, value: string | number) {
    this.out.push(String(code), typeof value === 'number' ? n(value) : value);
  }
  private ext(...pts: Pt[]) {
    for (const [x, y] of pts) {
      if (x < this.minX) this.minX = x;
      if (y < this.minY) this.minY = y;
      if (x > this.maxX) this.maxX = x;
      if (y > this.maxY) this.maxY = y;
    }
  }
  private head(type: string, layer: Layer) {
    this.g(0, type);
    this.g(8, layer);
  }
  line(layer: Layer, a: Pt, b: Pt) {
    this.ext(a, b);
    this.head('LINE', layer);
    this.g(10, a[0]);
    this.g(20, a[1]);
    this.g(30, 0);
    this.g(11, b[0]);
    this.g(21, b[1]);
    this.g(31, 0);
  }
  polyline(layer: Layer, pts: Pt[], closed = false) {
    if (pts.length < 2) return;
    this.ext(...pts);
    this.head('POLYLINE', layer);
    this.g(66, '1');
    this.g(10, 0);
    this.g(20, 0);
    this.g(30, 0);
    this.g(70, closed ? '1' : '0');
    for (const p of pts) {
      this.head('VERTEX', layer);
      this.g(10, p[0]);
      this.g(20, p[1]);
      this.g(30, 0);
    }
    this.head('SEQEND', layer);
  }
  /** filled triangle / quadrilateral (R12 SOLID corner order 1-2-4-3) */
  solid(layer: Layer, a: Pt, b: Pt, c: Pt, d: Pt = c) {
    this.ext(a, b, c, d);
    this.head('SOLID', layer);
    this.g(10, a[0]);
    this.g(20, a[1]);
    this.g(30, 0);
    this.g(11, b[0]);
    this.g(21, b[1]);
    this.g(31, 0);
    this.g(12, c[0]);
    this.g(22, c[1]);
    this.g(32, 0);
    this.g(13, d[0]);
    this.g(23, d[1]);
    this.g(33, 0);
  }
  /** arc, angles in degrees counter-clockwise */
  arc(layer: Layer, c: Pt, r: number, a0: number, a1: number) {
    this.ext([c[0] - r, c[1] - r], [c[0] + r, c[1] + r]);
    this.head('ARC', layer);
    this.g(10, c[0]);
    this.g(20, c[1]);
    this.g(30, 0);
    this.g(40, r);
    this.g(50, a0);
    this.g(51, a1);
  }
  circle(layer: Layer, c: Pt, r: number) {
    this.ext([c[0] - r, c[1] - r], [c[0] + r, c[1] + r]);
    this.head('CIRCLE', layer);
    this.g(10, c[0]);
    this.g(20, c[1]);
    this.g(30, 0);
    this.g(40, r);
  }
  text(layer: Layer, p: Pt, h: number, s: string, align: 'left' | 'center' | 'right' = 'left', rot = 0) {
    const w = s.length * h * 0.6;
    const x0 = align === 'left' ? p[0] : align === 'center' ? p[0] - w / 2 : p[0] - w;
    this.ext([x0, p[1]], [x0 + w, p[1] + h]);
    this.head('TEXT', layer);
    this.g(10, p[0]);
    this.g(20, p[1]);
    this.g(30, 0);
    this.g(40, h);
    this.g(1, escapeForCodepage(s.replace(/[\r\n]+/g, ' '), this.codepage));
    if (rot) this.g(50, rot);
    this.g(7, 'STANDARD');
    if (align !== 'left') {
      this.g(72, align === 'center' ? '1' : '2');
      this.g(11, p[0]);
      this.g(21, p[1]);
      this.g(31, 0);
    }
  }
  arrow(layer: Layer, tail: Pt, head: Pt, size: number) {
    const dx = head[0] - tail[0];
    const dy = head[1] - tail[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const b: Pt = [head[0] - ux * size, head[1] - uy * size];
    this.line(layer, tail, b);
    this.solid(layer, head, [b[0] - uy * size * 0.35, b[1] + ux * size * 0.35], [b[0] + uy * size * 0.35, b[1] - ux * size * 0.35]);
  }

  toString(): string {
    const ext = Number.isFinite(this.minX) ? [this.minX, this.minY, this.maxX, this.maxY] : [0, 0, 1, 1];
    const h: string[] = [];
    const g = (code: number, v: string | number) => h.push(String(code), typeof v === 'number' ? n(v) : v);
    g(0, 'SECTION');
    g(2, 'HEADER');
    g(9, '$ACADVER');
    g(1, 'AC1009');
    g(9, '$DWGCODEPAGE');
    g(3, this.codepage);
    g(9, '$INSBASE');
    g(10, 0);
    g(20, 0);
    g(30, 0);
    g(9, '$EXTMIN');
    g(10, ext[0]);
    g(20, ext[1]);
    g(30, 0);
    g(9, '$EXTMAX');
    g(10, ext[2]);
    g(20, ext[3]);
    g(30, 0);
    g(9, '$LIMMIN');
    g(10, ext[0]);
    g(20, ext[1]);
    g(9, '$LIMMAX');
    g(10, ext[2]);
    g(20, ext[3]);
    g(9, '$INSUNITS');
    g(70, '4');
    g(0, 'ENDSEC');
    // TABLES
    g(0, 'SECTION');
    g(2, 'TABLES');
    g(0, 'TABLE');
    g(2, 'LTYPE');
    g(70, '1');
    g(0, 'LTYPE');
    g(2, 'CONTINUOUS');
    g(70, '0');
    g(3, 'Solid line');
    g(72, '65');
    g(73, '0');
    g(40, 0);
    g(0, 'ENDTAB');
    g(0, 'TABLE');
    g(2, 'LAYER');
    g(70, String(DXF_LAYERS.length + 1));
    for (const l of [{ name: '0', color: 7 }, ...DXF_LAYERS]) {
      g(0, 'LAYER');
      g(2, l.name);
      g(70, '0');
      g(62, String(l.color));
      g(6, 'CONTINUOUS');
    }
    g(0, 'ENDTAB');
    g(0, 'TABLE');
    g(2, 'STYLE');
    g(70, '1');
    g(0, 'STYLE');
    g(2, 'STANDARD');
    g(70, '0');
    g(40, 0);
    g(41, 1);
    g(50, 0);
    g(71, '0');
    g(42, 2.5);
    g(3, 'txt');
    g(4, '');
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');
    g(0, 'SECTION');
    g(2, 'BLOCKS');
    g(0, 'ENDSEC');
    g(0, 'SECTION');
    g(2, 'ENTITIES');
    const tail = ['0', 'ENDSEC', '0', 'EOF'];
    return [...h, ...this.out, ...tail].join('\r\n') + '\r\n';
  }

  bytes(): Uint8Array {
    return encodeCodepage(this.toString(), this.codepage);
  }
}

export interface DxfOptions {
  lang: Lang;
  units: UnitSystem;
  decimals: number;
  /** mm per display unit (N, V: force unit; M: moment unit), w: magnification of the deformed axis (0 = auto) */
  scales: { N: number; V: number; M: number; w: number };
  momentSide: 'bottom' | 'top';
  title: string;
  viewLabel: string;
}

/** Language of the generated DXF labels */
export function dxfLang(lang: Lang): Lang {
  return lang === 'he' ? 'en' : lang;
}

export function dxfCodepageFor(lang: Lang): DxfCodepage {
  return lang === 'ru' ? 'ANSI_1251' : 'ANSI_1252';
}

/** Build the complete drawing of the beam, loads and diagrams of the given result view. */
export function buildDxf(an: Analysis, vr: ViewResult, options: DxfOptions): DxfWriter {
  // Hebrew (RTL) is not supported by R12 text entities: drawing labels in English
  const opt = { ...options, lang: dxfLang(options.lang) };
  const t = (k: string, p?: Record<string, string | number>) => translate(opt.lang, k, p);
  // ASCII minus: the unicode minus sign (U+2212) is missing in the standard CAD fonts
  const fmtv = (v: number, q: Quantity, d = opt.decimals) => formatNumber(fromSI(v, q, opt.units), opt.lang, d, false).replace('\u2212', '-');
  const unit = (q: Quantity) => unitSymbol(q, opt.units);
  const model = an.model;
  const dw = new DxfWriter(dxfCodepageFor(opt.lang));
  const Lmm = model.L * 1000;
  const X = (x: number) => x * 1000;
  const S = Math.min(400, Math.max(80, Lmm / 40));
  const th = Math.max(25, S * 0.28);

  // title
  dw.text('TEXT', [0, 6 * S], th * 1.6, opt.title || t('app.title'));
  dw.text('TEXT', [0, 6 * S - th * 2.2], th, opt.viewLabel);

  // beam axis
  dw.line('BEAM_AXIS', [0, 0], [Lmm, 0]);
  for (const seg of model.segments) if (seg.x1 > 1e-9) dw.line('BEAM_AXIS', [X(seg.x1), -S * 0.25], [X(seg.x1), S * 0.25]);

  // supports
  for (const s of model.supports) drawSupport(dw, s, X(s.x), S, Lmm);
  for (const h of model.hinges) dw.circle('SUPPORTS', [X(h.x), 0], S * 0.18);

  // loads
  const qmax = Math.max(1e-9, ...model.loads.map((l) => (l.kind === 'dist' ? Math.max(Math.abs(l.q1), Math.abs(l.q2)) : 0)));
  let level = 0;
  for (const l of model.loads) {
    if (l.kind === 'dist') {
      drawDistLoad(dw, l, X, S, th, qmax, level++, (v) => `${fmtv(v, 'lineLoad')} ${unit('lineLoad')}`);
    } else drawPointLoad(dw, l, X, S, th, fmtv, unit, t);
  }

  // dimension chain
  const pts = [
    ...new Set(
      [0, model.L, ...model.supports.map((s) => s.x), ...model.hinges.map((h) => h.x), ...model.loads.flatMap((l) => (l.kind === 'dist' ? [l.x1, l.x2] : [l.x]))]
        .filter((x) => x >= 0 && x <= model.L)
        .map((x) => Math.round(x * 1e6) / 1e6),
    ),
  ].sort((a, b) => a - b);
  const yd = -2.6 * S;
  dw.line('BEAM_AXIS', [0, yd], [Lmm, yd]);
  for (const x of pts) dw.line('BEAM_AXIS', [X(x) - S * 0.12, yd - S * 0.12], [X(x) + S * 0.12, yd + S * 0.12]);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (X(b) - X(a) < th * 2) continue;
    dw.text('BEAM_AXIS', [(X(a) + X(b)) / 2, yd + S * 0.15], th * 0.8, formatNumber(fromSI(b - a, 'length', opt.units), opt.lang, 3, false), 'center');
  }

  // deformed axis
  const g = vr.grid;
  const wArr = Array.from(g.x, (_, i) => (Math.abs(vr.max.w[i]) >= Math.abs(vr.min.w[i]) ? vr.max.w[i] : vr.min.w[i]));
  const wmax = Math.max(...wArr.map(Math.abs));
  if (wmax > 0) {
    const f = opt.scales.w > 0 ? opt.scales.w : Math.max(1, Math.round((1.5 * S) / (wmax * 1000)));
    dw.polyline('DEFLECTION', wArr.map((w, i) => [X(g.x[i]), -w * 1000 * f] as Pt));
    dw.text('DEFLECTION', [Lmm + S * 0.5, -S * 0.5], th * 0.8, `${t('sym.w')} ×${formatNumber(f, opt.lang, 0, false)}`);
  }

  // diagrams
  let cursor = -4 * S;
  const diagrams: { field: 'M' | 'V' | 'N'; layer: Layer; q: Quantity; sign: number; scale: number }[] = [
    { field: 'M', layer: 'DIAG_M', q: 'moment', sign: opt.momentSide === 'bottom' ? -1 : 1, scale: opt.scales.M },
    { field: 'V', layer: 'DIAG_V', q: 'force', sign: 1, scale: opt.scales.V },
    { field: 'N', layer: 'DIAG_N', q: 'force', sign: 1, scale: opt.scales.N },
  ];
  const curves = vr.kind === 'envelope' ? [vr.max, vr.min] : [vr.max];
  for (const d of diagrams) {
    const ys = (v: number) => d.sign * fromSI(v, d.q, opt.units) * d.scale;
    let pos = 0;
    let neg = 0;
    for (const c of curves)
      for (const v of c[d.field]) {
        const y = ys(v);
        if (y > pos) pos = y;
        if (y < neg) neg = y;
      }
    const yb = cursor - pos - 2.2 * th;
    // title and scale
    dw.text('TEXT', [0, yb + pos + th * 0.8], th, `${t(`diag.${d.field}`)} ${t(`sym.${d.field}`)} [${unit(d.q)}],  ${t('dxf.scale')} 1 ${unit(d.q)} = ${formatNumber(d.scale, opt.lang, 2, false)} mm`);
    dw.line(d.layer, [0, yb], [Lmm, yb]);
    for (const c of curves) {
      const arr = c[d.field];
      const pl: Pt[] = [[0, yb]];
      for (let i = 0; i < g.x.length; i++) pl.push([X(g.x[i]), yb + ys(arr[i])]);
      pl.push([Lmm, yb]);
      dw.polyline(d.layer, pl);
      // hatching with LINE entities
      const step = Math.max(Lmm / 150, S * 0.2);
      let k = 0;
      for (let x = step / 2; x < Lmm; x += step) {
        while (k + 1 < g.x.length && X(g.x[k + 1]) < x) k++;
        const x0 = X(g.x[k]);
        const x1 = X(g.x[Math.min(k + 1, g.x.length - 1)]);
        const tt = x1 > x0 ? (x - x0) / (x1 - x0) : 0;
        const v = arr[k] + tt * (arr[Math.min(k + 1, g.x.length - 1)] - arr[k]);
        const y = ys(v);
        if (Math.abs(y) > 0.05 * th) dw.line(d.layer, [x, yb], [x, yb + y]);
      }
    }
    // extreme labels
    const ex = vr.extremes[d.field];
    for (const e of [ex.max, ex.min]) {
      if (!Number.isFinite(e.value) || Math.abs(fromSI(e.value, d.q, opt.units)) < 10 ** -opt.decimals / 2) continue;
      const y = yb + ys(e.value);
      dw.circle(d.layer, [X(e.x), y], th * 0.15);
      dw.text(d.layer, [X(e.x), y + (ys(e.value) >= 0 ? th * 0.4 : -th * 1.4)], th, fmtv(e.value, d.q), 'center');
    }
    cursor = yb + neg - 2 * th;
  }
  return dw;
}

function drawSupport(dw: DxfWriter, s: Support, x: number, S: number, Lmm: number) {
  const L: Layer = 'SUPPORTS';
  const hatch = (x1: number, x2: number, y: number) => {
    const step = S * 0.25;
    for (let xx = x1; xx < x2 - 1e-6; xx += step) dw.line(L, [xx + step, y], [xx, y - step]);
  };
  const tri = (h: number) => dw.polyline(L, [[x, 0], [x - S * 0.5, -h], [x + S * 0.5, -h]], true);
  switch (s.type) {
    case 'fixed': {
      if (s.x <= 1e-9 || x >= Lmm - 1e-6) {
        const d = s.x <= 1e-9 ? -1 : 1;
        dw.line(L, [x, -S], [x, S]);
        for (let y = -S; y < S - 1e-6; y += S * 0.25) dw.line(L, [x, y], [x + d * S * 0.3, y + S * 0.3]);
      } else {
        dw.polyline(L, [[x - S * 0.4, S * 0.5], [x + S * 0.4, S * 0.5], [x + S * 0.4, -S * 0.7], [x - S * 0.4, -S * 0.7]], true);
        hatch(x - S * 0.6, x + S * 0.6, -S * 0.7);
      }
      break;
    }
    case 'pinned':
      tri(S * 0.8);
      dw.line(L, [x - S * 0.7, -S * 0.8], [x + S * 0.7, -S * 0.8]);
      hatch(x - S * 0.7, x + S * 0.7, -S * 0.8);
      break;
    case 'roller':
      tri(S * 0.8);
      dw.line(L, [x - S * 0.7, -S * 0.95], [x + S * 0.7, -S * 0.95]);
      dw.line(L, [x - S * 0.7, -S * 1.15], [x + S * 0.7, -S * 1.15]);
      hatch(x - S * 0.7, x + S * 0.7, -S * 1.15);
      break;
    case 'slider':
      dw.polyline(L, [[x - S * 0.35, S * 0.3], [x + S * 0.35, S * 0.3], [x + S * 0.35, -S * 0.3], [x - S * 0.35, -S * 0.3]], true);
      dw.line(L, [x - S * 0.35, -S * 0.3], [x - S * 0.35, -S * 1.1]);
      dw.line(L, [x + S * 0.35, -S * 0.3], [x + S * 0.35, -S * 1.1]);
      dw.line(L, [x - S * 0.7, -S * 1.1], [x + S * 0.7, -S * 1.1]);
      hatch(x - S * 0.7, x + S * 0.7, -S * 1.1);
      break;
    case 'spring': {
      if (s.kw > 0) {
        const pts: Pt[] = [[x, 0], [x, -S * 0.2]];
        for (let i = 0; i < 4; i++) {
          pts.push([x + S * 0.25, -S * (0.25 + i * 0.2)]);
          pts.push([x - S * 0.25, -S * (0.35 + i * 0.2)]);
        }
        pts.push([x, -S * 1.05], [x, -S * 1.2]);
        dw.polyline(L, pts);
        dw.line(L, [x - S * 0.5, -S * 1.2], [x + S * 0.5, -S * 1.2]);
        hatch(x - S * 0.5, x + S * 0.5, -S * 1.2);
      }
      if (s.ku > 0) {
        const pts: Pt[] = [[x, 0], [x - S * 0.2, 0]];
        for (let i = 0; i < 3; i++) pts.push([x - S * (0.3 + i * 0.2), S * 0.2], [x - S * (0.4 + i * 0.2), -S * 0.2]);
        pts.push([x - S * 1.0, 0], [x - S * 1.2, 0]);
        dw.polyline(L, pts);
        dw.line(L, [x - S * 1.2, -S * 0.4], [x - S * 1.2, S * 0.4]);
      }
      if (s.kt > 0) dw.arc(L, [x, 0], S * 0.45, 200, 120);
      break;
    }
  }
}

function drawPointLoad(
  dw: DxfWriter,
  l: Load,
  X: (x: number) => number,
  S: number,
  th: number,
  fmtv: (v: number, q: Quantity, d?: number) => string,
  unit: (q: Quantity) => string,
  t: (k: string) => string,
) {
  if (l.kind === 'point') {
    const a = (l.angle * Math.PI) / 180;
    let dx = Math.cos(a);
    let dy = -Math.sin(a); // DXF y up, z down
    if (l.P < 0) {
      dx = -dx;
      dy = -dy;
    }
    const head: Pt = [X(l.x), 0];
    const tail: Pt = [head[0] - dx * 2.6 * S, head[1] - dy * 2.6 * S];
    dw.arrow('LOADS', tail, head, S * 0.4);
    dw.text('LOADS', [tail[0] + S * 0.1, tail[1] + S * 0.15], th, `P = ${fmtv(Math.abs(l.P), 'force')} ${unit('force')}`);
  } else if (l.kind === 'moment') {
    const c: Pt = [X(l.x), 0];
    const r = S * 0.7;
    // DXF arcs are counter-clockwise; clockwise moment arrow at the start angle
    dw.arc('LOADS', c, r, 20, 290);
    const cw = l.M >= 0;
    const ang = ((cw ? 20 : 290) * Math.PI) / 180;
    const tip: Pt = [c[0] + r * Math.cos(ang), c[1] + r * Math.sin(ang)];
    // tangent: counter-clockwise direction is (−sin, cos)
    const dir = cw ? [Math.sin(ang), -Math.cos(ang)] : [-Math.sin(ang), Math.cos(ang)];
    const b: Pt = [tip[0] - dir[0] * S * 0.35, tip[1] - dir[1] * S * 0.35];
    dw.solid('LOADS', tip, [b[0] - dir[1] * S * 0.13, b[1] + dir[0] * S * 0.13], [b[0] + dir[1] * S * 0.13, b[1] - dir[0] * S * 0.13]);
    dw.text('LOADS', [c[0] + r + S * 0.1, c[1] + r * 0.6], th, `M = ${fmtv(Math.abs(l.M), 'moment')} ${unit('moment')} (${t(cw ? 'dxf.cw' : 'dxf.ccw')})`);
  }
}

function drawDistLoad(
  dw: DxfWriter,
  l: Load,
  X: (x: number) => number,
  S: number,
  th: number,
  qmax: number,
  level: number,
  label: (v: number) => string,
) {
  if (l.kind !== 'dist') return;
  const x1 = X(l.x1);
  const x2 = X(l.x2);
  const base = S * 0.2 + level * 1.8 * S;
  if (l.dir === 'x') {
    const y = base + S * 0.4;
    dw.line('LOADS', [x1, y], [x2, y]);
    const nArr = Math.max(1, Math.floor((x2 - x1) / (S * 1.2)));
    const sg = l.q1 + l.q2 >= 0 ? 1 : -1;
    for (let i = 0; i < nArr; i++) {
      const xa = x1 + ((i + 0.5) * (x2 - x1)) / nArr;
      dw.arrow('LOADS', [xa - sg * S * 0.4, y + S * 0.3], [xa + sg * S * 0.4, y + S * 0.3], S * 0.25);
    }
    dw.text('LOADS', [(x1 + x2) / 2, y + S * 0.7], th, `p = ${label(l.q1)}${l.q2 !== l.q1 ? ' … ' + label(l.q2) : ''}`, 'center');
    return;
  }
  const hmax = 1.2 * S;
  const h1 = Math.max((Math.abs(l.q1) / qmax) * hmax, S * 0.1);
  const h2 = Math.max((Math.abs(l.q2) / qmax) * hmax, S * 0.1);
  dw.polyline('LOADS', [[x1, base], [x1, base + h1], [x2, base + h2], [x2, base]], true);
  const nArr = Math.max(2, Math.floor((x2 - x1) / (S * 0.6)));
  const up = l.q1 + l.q2 < 0;
  for (let i = 0; i <= nArr; i++) {
    const xa = x1 + (i * (x2 - x1)) / nArr;
    const ht = h1 + ((h2 - h1) * i) / nArr;
    if (ht < S * 0.3) continue;
    if (up) dw.arrow('LOADS', [xa, base], [xa, base + ht], S * 0.2);
    else dw.arrow('LOADS', [xa, base + ht], [xa, base], S * 0.2);
  }
  dw.text('LOADS', [x1, base + h1 + S * 0.15], th, `q = ${label(l.q1)}`);
  if (l.q2 !== l.q1) dw.text('LOADS', [x2, base + h2 + S * 0.15], th, label(l.q2), 'right');
}
