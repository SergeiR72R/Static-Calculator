import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readXlsx } from '../import/xlsx';
import { importAcadWorkbook } from '../import/acad';
import { batchFromImport, itemStatus, parseAnyProject, serializeBatch, setChecked } from './batch';
import { serializeProject } from './persist';

const beams = importAcadWorkbook(readXlsx(new Uint8Array(readFileSync(join(__dirname, '../import/__fixtures__/acad-sample.xlsx')))));

describe('beam list', () => {
  const { batch, images } = batchFromImport('acad-sample.xlsx', beams);

  it('items, first one active, drawings by item id', () => {
    expect(batch.items).toHaveLength(beams.length);
    expect(batch.active).toBe(batch.items[0].id);
    expect(Object.keys(images)).toHaveLength(3);
    expect(images[batch.items[0].id]).toMatch(/^data:image\/png/);
  });

  it('checked → changed after an edit → open when unchecked', () => {
    const it0 = batch.items[0];
    expect(itemStatus(it0)).toBe('open');
    const c = setChecked(it0, true);
    expect(itemStatus(c)).toBe('checked');
    const edited = { ...c, model: { ...c.model, L: c.model.L + 0.1 } };
    expect(itemStatus(edited)).toBe('changed');
    expect(itemStatus(setChecked(edited, false))).toBe('open');
  });

  it('project file round trip keeps the list, statuses and drawings; single beam files still open', () => {
    const b2 = { ...batch, items: batch.items.map((i, k) => (k === 1 ? setChecked(i, true) : i)), active: batch.items[2].id };
    const p = parseAnyProject(serializeBatch(b2, images));
    expect(p.kind).toBe('batch');
    if (p.kind !== 'batch') return;
    expect(p.batch.items.map((i) => itemStatus(i))).toEqual(b2.items.map((i) => itemStatus(i)));
    expect(p.batch.active).toBe(b2.active);
    expect(p.images).toEqual(images);
    expect(parseAnyProject(serializeProject(batch.items[0].model)).kind).toBe('model');
    expect(() => parseAnyProject('{"format":"balkenrechner-batch","batch":{"items":[]}}')).toThrow('file.invalid');
  });
});
