import { describe, expect, it } from 'vitest';
import { decodeSat, sabBox, satBox } from './acis';
import { blockKg, parsePeriCadDxf } from './pericad';
import { planBlockLoads } from './planLoads';
import { analyzeScaffold } from './structure';
import { buildScaffoldModel } from './model';
import { periDxf, towerParts } from './testDxf';

type V3 = [number, number, number];
const tags = (t: [number, string | number][]) => t.map(([c, v]) => `${String(c).padStart(3, ' ')}\n${v}`).join('\n');

/** block "name" with a box from (0,0,0) to `size` (lines of two corners) and the default weight */
const blockDef = (name: string, size: V3, kg?: number) =>
  tags([
    [0, 'BLOCK'],
    [5, 'F00' + name.length],
    [2, name],
    [10, 0],
    [20, 0],
    [30, 0],
    [0, 'LINE'],
    [10, 0],
    [20, 0],
    [30, 0],
    [11, size[0]],
    [21, size[1]],
    [31, size[2]],
    ...(kg ? ([[0, 'ATTDEF'], [2, 'Gewicht'], [1, kg]] as [number, string | number][]) : []),
    [0, 'ENDBLK'],
  ]);
const insert = (name: string, p: V3, kg?: number) =>
  tags([
    [0, 'INSERT'],
    [2, name],
    [10, p[0]],
    [20, p[1]],
    [30, p[2]],
    ...(kg
      ? ([
          [66, 1],
          [0, 'ATTRIB'],
          [2, 'Gewicht'],
          [1, kg],
          [0, 'ATTRIB'],
          [2, 'FAKTOR'],
          [1, 1],
          [0, 'SEQEND'],
        ] as [number, string | number][])
      : []),
  ]);

/** the tower of the tests with blocks put into the drawing */
function towerWith(defs: string[], refs: string[]) {
  let text = periDxf(towerParts());
  text = text.replace(/(\n\s*2\r?\nBLOCKS\r?\n)/, `$1${defs.join('\n')}\n`);
  text = text.replace(/(\n\s*2\r?\nENTITIES\r?\n)/, `$1${refs.join('\n')}\n`);
  return analyzeScaffold(parsePeriCadDxf(text, 'tower.dxf'));
}

describe('bodies of the drawing (ballast)', () => {
  it('ACIS bodies: vertices with the transform of the body (SAB binary, SAT text)', () => {
    const bytes: number[] = [];
    const ident = (s: string) => bytes.push(0x0d, s.length, ...Array.from(s, (c) => c.charCodeAt(0)));
    const dbl = (...v: number[]) => {
      for (const x of v) bytes.push(...new Uint8Array(new Float64Array([x]).buffer));
    };
    ident('transform');
    for (const r of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [750, 0, 300],
    ]) {
      bytes.push(0x14);
      dbl(...r);
    }
    bytes.push(0x06);
    dbl(1);
    for (const p of [
      [-750, -300, -300],
      [750, 300, 300],
    ]) {
      ident('point');
      bytes.push(0x0c, 1, 0, 0, 0, 0x13);
      dbl(...p);
    }
    expect(sabBox(new Uint8Array(bytes))).toEqual({ min: [0, -300, 0], max: [1500, 300, 600] });
    const enc = (s: string) => Array.from(s, (c) => (c === ' ' ? ' ' : String.fromCharCode(159 - c.charCodeAt(0)))).join('');
    const sat = decodeSat([enc('-0 transform $-1 -1 1 0 0 0 1 0 0 0 1 10 20 30 1 no_rotate no_reflect no_shear #'), enc('-1 point $-1 -1 -1 $-1 0 0 0 #'), enc('-2 point $-1 -1 -1 $-1 2 1 0.5 #')]);
    expect(satBox(sat)).toEqual({ min: [10, 20, 30], max: [12, 21, 30.5] });
  });

  it('weight: attribute Gewicht (times FAKTOR), else volume × density by the name', () => {
    expect(blockKg('Büscher Block 150x60x60', { Gewicht: '1180', FAKTOR: '1' })).toBe(1180);
    expect(blockKg('Ballast', { Gewicht: '500', FAKTOR: '2' })).toBe(1000);
    expect(blockKg('Betonblock', {}, { min: [0, 0, 0], max: [1, 0.5, 0.5] })).toBeCloseTo(600, 6);
    expect(blockKg('Something', {}, { min: [0, 0, 0], max: [1, 1, 1] })).toBeUndefined();
  });

  it('a block on a ledger loads it; on the decks it goes to the two ledgers by the lever rule; others are no loads', () => {
    const st = towerWith(
      [blockDef('Ballast A', [1, 0.5, 0.5]), blockDef('Holzdiele 45x240x1000', [1, 0.24, 0.045], 5.5)],
      [
        // across the ledger y = 0 at +2.22, lying on it (long side along the ledger)
        insert('Ballast A', [2.5, -0.25, 2.3], 1000),
        // on the decks between the ledgers y = 0 and y = 2, centre at y = 0.6
        insert('Ballast A', [0.5, 0.35, 2.3], 1000),
        // a plank under a base jack and one above the scaffold: no loads of it
        insert('Holzdiele 45x240x1000', [-0.5, -0.12, -0.2]),
        insert('Holzdiele 45x240x1000', [1, 1, 8]),
      ],
    );
    expect(st.blocks.filter((b) => b.kg)).toHaveLength(4);
    const pl = planBlockLoads(st);
    expect(pl.placed).toHaveLength(2);
    expect(pl.unplaced.map((u) => u.name)).toEqual(['Holzdiele 45x240x1000']);
    expect(pl.total).toBeCloseTo(2000 * 9.81, 3);
    const byId = new Map(st.parts.map((w) => [w.part.id, w]));
    const at = (pred: (y: number, x: number) => boolean) =>
      pl.loads
        .filter((l) => {
          const w = byId.get(l.parts[0])!;
          return pred((w.min[1] + w.max[1]) / 2, (w.min[0] + w.max[0]) / 2);
        })
        .reduce((s, l) => s + l.value * Math.max(...byId.get(l.parts[0])!.lines.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]))), 0);
    // block on the ledger (2…4, y = 0): all of it on that ledger
    expect(at((y, x) => y < 0.1 && x > 2)).toBeCloseTo(1000 * 9.81, 0);
    // block on the decks: 1.4 / 2 to the ledger y = 0, 0.6 / 2 to y = 2
    expect(at((y, x) => y < 0.1 && x < 2) / (1000 * 9.81)).toBeCloseTo(0.7, 1);
    expect(at((y, x) => y > 1.9 && x < 2) / (1000 * 9.81)).toBeCloseTo(0.3, 1);
    // in the model: permanent loads, can be switched off
    const m = buildScaffoldModel(st);
    expect(m.plan?.total).toBeCloseTo(2000 * 9.81, 3);
    expect(m.user.filter((u) => u.load.startsWith('plan:')).length).toBe(pl.loads.length);
    expect(buildScaffoldModel(st, [], [], { planLoads: false }).plan).toBeNull();
  });
});
