import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readXlsx } from './xlsx';
import { importAcadWorkbook, profileFor } from './acad';
import { analyze } from '../core/analysis';
import { validateModel } from '../core/validate';

const sheets = readXlsx(new Uint8Array(readFileSync(join(__dirname, '__fixtures__/acad-sample.xlsx'))));
const beams = importAcadWorkbook(sheets);
const byKey = (k: string) => beams.find((b) => b.key === k)!;
const keys = (b: (typeof beams)[number]) => b.warnings.map((w) => w.key).sort();

describe('xlsx reader', () => {
  it('reads sheets, shared strings, numbers and anchored images', () => {
    expect(sheets.map((s) => s.name)).toEqual(['Übersicht', 'Positionen', 'Abbildungen']);
    expect(sheets[0].rows[1][3]).toBe('RCS 498');
    expect(sheets[0].rows[1][4]).toBe(4980);
    expect(sheets[2].images).toHaveLength(3);
    expect(sheets[2].images[0].row).toBe(1);
    expect(sheets[2].images[0].dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('rejects files that are not xlsx', () => {
    expect(() => readXlsx(new Uint8Array([1, 2, 3]))).toThrow('import.notXlsx');
  });
});

describe('AutoCAD beam import', () => {
  it('one model per beam, named after key and designation, with the drawing', () => {
    expect(beams.map((b) => b.key)).toEqual(['B-001', 'B-002', 'B-003', 'B-004', 'B-005', 'B-006']);
    expect(byKey('B-001').model.name).toBe('B-001 RCS 498');
    expect(byKey('B-001').image).toMatch(/^data:image\/png/);
    expect(byKey('B-004').image).toBeUndefined();
    expect(byKey('B-001').model.description).toContain('Handle: A1');
  });

  it('continuous beam on three supports: profile, length, supports, loads Gk/Qk', () => {
    const b = byKey('B-001');
    const m = b.model;
    expect(keys(b)).toEqual([]);
    expect(m.L).toBe(4.98);
    expect(m.segments[0].section).toEqual({ kind: 'peri', product: 'RCS' });
    expect(m.segments[0].material.preset).toBe('S355');
    expect(m.settings.selfWeight).toBe(true);
    expect(m.supports.map((s) => [s.type, s.x])).toEqual([
      ['pinned', 0.929],
      ['roller', 2.428],
      ['roller', 4.928],
    ]);
    const loads = m.loads.map((l) => (l.kind === 'point' ? [l.caseId, l.x, Math.round(l.P), l.angle] : null));
    expect(loads).toEqual([
      ['G', 0.929, 11860, 90],
      ['Q', 0.929, 5400, 90],
      ['G', 2.428, 70, 90],
      ['G', 3.43, 15000, 90],
      ['Q', 3.43, 7900, 90],
    ]);
    expect(validateModel(m).filter((i) => i.severity === 'error')).toEqual([]);
    expect(analyze(m).ok).toBe(true);
  });

  it('beam on the ground: supports at the ends and under every load', () => {
    const b = byKey('B-002');
    expect(keys(b)).toEqual(['ground']);
    expect(b.model.supports.map((s) => [s.type, s.x])).toEqual([
      ['pinned', 0],
      ['roller', 0.3],
      ['roller', 0.9],
      ['roller', 1.222],
    ]);
    expect(analyze(b.model).ok).toBe(true);
  });

  it('single support is imported as is and flagged (mechanism)', () => {
    const b = byKey('B-003');
    expect(keys(b)).toEqual(['oneSupport']);
    expect(analyze(b.model).ok).toBe(false);
  });

  it('unknown profile → nearest PERI profile; non-catalogue length kept; snapping within 25 mm', () => {
    expect(keys(byKey('B-004'))).toEqual(['ground', 'lengthNotCatalog', 'noLoads', 'profileMapped']);
    expect(byKey('B-004').model.L).toBe(0.965);
    expect(byKey('B-004').model.segments[0].section).toEqual({ kind: 'peri', product: 'RCS' });
    const b5 = byKey('B-005');
    expect(keys(b5)).toEqual(['lengthSnapped']);
    expect(b5.model.L).toBe(3.472);
    expect(b5.warnings[0].params).toEqual({ from: 3460, to: 3472 });
    // length in the file does not fit the designation (232 mm = rail height, rotated block): standard length
    const b6 = byKey('B-006');
    expect(keys(b6)).toEqual(['ground', 'lengthFromDesignation']);
    expect(b6.model.L).toBe(2.48);
    expect(b6.model.supports.map((s) => s.x)).toEqual([0, 0.116, 2.48]);
  });

  it('profile by name, otherwise by mass per metre', () => {
    expect(profileFor('SRU 147', 26)).toEqual({ product: 'SRU120', exact: true });
    expect(profileFor('Träger XY', 50)).toEqual({ product: 'RCS', exact: false });
    expect(profileFor('Träger XY', 6)).toMatchObject({ exact: false });
  });
});
