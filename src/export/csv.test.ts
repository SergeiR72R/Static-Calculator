import { describe, expect, it } from 'vitest';
import { analyze } from '../core/analysis';
import { computeView } from '../core/results';
import { templateModel, pointLoad } from '../core/defaults';
import { buildCsv } from './csv';

describe('CSV export', () => {
  const m = templateModel('simple');
  m.loads.push(pointLoad('G', 2, 10));
  const an = analyze(m);
  const vr = computeView(an, { type: 'case', id: 'G' })!;

  it('German: semicolon separator, decimal comma, reactions and diagrams with step', () => {
    const csv = buildCsv(an, vr, { lang: 'de', units: 'metric', step: 0.5, viewLabel: 'G' });
    const lines = csv.replace('﻿', '').split('\r\n');
    expect(lines.some((l) => l.startsWith('Festlager;0;'))).toBe(true);
    const head = lines.findIndex((l) => l.startsWith('x [m];'));
    expect(lines[head]).toBe('x [m];N [kN];V [kN];M [kN·m];w [mm];θ [mrad];σ [MPa]');
    const rows = lines.slice(head + 1).filter(Boolean);
    // 0..6 step 0.5 = 13 positions, plus a second row at the jump below the point load
    expect(rows.length).toBe(14);
    const at2 = rows.filter((r) => r.startsWith('2;'));
    expect(at2).toHaveLength(2);
    // V jumps by 10 kN at x = 2
    const v = at2.map((r) => Number(r.split(';')[2].replace(',', '.')));
    expect(v[0] - v[1]).toBeCloseTo(10, 6);
    expect(rows[7]).toMatch(/^3;/); // after the two rows at the jump
  });

  it('English: comma separator, decimal point, imperial units', () => {
    const csv = buildCsv(an, vr, { lang: 'en', units: 'imperial', step: 1, viewLabel: 'G' });
    expect(csv).toContain('x [ft],N [kip],V [kip],M [kip·ft]');
    expect(csv).toMatch(/\n0,0,\d+\.\d+/);
  });

  it('envelope has min and max columns', () => {
    const env = computeView(an, { type: 'envelope' })!;
    const csv = buildCsv(an, env, { lang: 'de', units: 'metric', step: 1, viewLabel: 'Env' });
    expect(csv).toContain('M [kN·m] min;M [kN·m] max');
  });
});
