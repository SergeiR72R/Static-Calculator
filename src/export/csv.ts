import type { Analysis } from '../core/analysis';
import { valuesAt, type ViewResult } from '../core/results';
import type { Field } from '../core/postprocess';
import { translate } from '../i18n';
import { formatInput, usesDecimalPoint, type Lang } from '../units/format';
import { fromSI, unitSymbol, type Quantity, type UnitSystem } from '../units/units';

export interface CsvOptions {
  lang: Lang;
  units: UnitSystem;
  /** sampling step along x, m */
  step: number;
  viewLabel: string;
}

const COLS: { f: Field; q: Quantity }[] = [
  { f: 'N', q: 'force' },
  { f: 'V', q: 'force' },
  { f: 'M', q: 'moment' },
  { f: 'w', q: 'deflection' },
  { f: 'theta', q: 'rotation' },
  { f: 'sigma', q: 'stress' },
];

/**
 * CSV export: reactions and diagram values with a given step along x. Characteristic points
 * (supports, loads, hinges) are added; at jumps two rows (left / right value) are written.
 * de/ru: ";" separator with decimal comma, en: "," with decimal point.
 */
export function buildCsv(an: Analysis, vr: ViewResult, opt: CsvOptions): string {
  const t = (k: string) => translate(opt.lang, k);
  const sep = usesDecimalPoint(opt.lang) ? ',' : ';';
  const num = (v: number, q: Quantity) => (Number.isFinite(v) ? formatInput(fromSI(v, q, opt.units), opt.lang, 6) : '');
  const esc = (s: string) => (s.includes(sep) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const row = (cells: string[]) => cells.map(esc).join(sep);
  const lines: string[] = [];
  const model = an.model;
  lines.push(row([t('app.title'), model.name]));
  lines.push(row([t('results.view'), opt.viewLabel]));
  lines.push('');
  lines.push(row([t('kpi.reactions')]));
  const env = vr.kind === 'envelope';
  const rh = [t('support.single'), `x [${unitSymbol('length', opt.units)}]`];
  for (const [c, q] of [
    ['R_x', 'force'],
    ['R_z', 'force'],
    ['M_R', 'moment'],
  ] as const) {
    if (env) rh.push(`${c} min [${unitSymbol(q, opt.units)}]`, `${c} max [${unitSymbol(q, opt.units)}]`);
    else rh.push(`${c} [${unitSymbol(q, opt.units)}]`);
  }
  lines.push(row(rh));
  model.supports.forEach((s, i) => {
    const cells = [t(`support.types.${s.type}`), num(s.x, 'length')];
    (['force', 'force', 'moment'] as const).forEach((q, c) => {
      if (env) cells.push(num(vr.reactions.min[3 * i + c], q), num(vr.reactions.max[3 * i + c], q));
      else cells.push(num(vr.reactions.max[3 * i + c], q));
    });
    lines.push(row(cells));
  });
  lines.push('');
  lines.push(row([t('csv.diagrams')]));
  const head = [`x [${unitSymbol('length', opt.units)}]`];
  for (const c of COLS) {
    const name = `${translate(opt.lang, `sym.${c.f}`)} [${unitSymbol(c.q, opt.units)}]`;
    if (env && c.f !== 'sigma') head.push(`${name} min`, `${name} max`);
    else head.push(name);
  }
  lines.push(row(head));
  // positions: regular step + characteristic points
  const xs = new Set<number>();
  const step = opt.step > 0 ? opt.step : model.L / 20;
  const n = Math.min(100000, Math.round(model.L / step));
  for (let i = 0; i <= n; i++) xs.add(Math.min(model.L, Math.round(i * step * 1e9) / 1e9));
  for (const nd of an.mesh?.nodes ?? []) xs.add(Math.round(nd.x * 1e9) / 1e9);
  const sorted = [...xs].sort((a, b) => a - b);
  for (const x of sorted) {
    const v = valuesAt(an, vr, x);
    const emit = (p: typeof v.left, pm: typeof v.leftMin) => {
      const cells = [num(x, 'length')];
      for (const c of COLS) {
        if (env && c.f !== 'sigma') cells.push(num(pm ? pm[c.f] : p[c.f], c.q), num(p[c.f], c.q));
        else cells.push(num(p[c.f], c.q));
      }
      lines.push(row(cells));
    };
    emit(v.left, v.leftMin);
    const jump = COLS.some((c) => {
      const a = v.left[c.f];
      const b = v.right[c.f];
      return Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
    });
    if (jump) emit(v.right, v.rightMin);
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
