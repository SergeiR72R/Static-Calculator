import { describe, expect, it } from 'vitest';
import { analyzeScaffold } from '../scaffold/structure';
import { buildScaffoldModel } from '../scaffold/model';
import { analyzeScaffoldModel, DEFAULT_ANALYSIS } from '../scaffold/analysis';
import { CATALOG } from './catalog';
import { designBom, designDoc, designIssues, emptyDesign, rosettes, snap, tubePoint, type Design, type Placed } from './design';

const art = (name: string) => CATALOG.find((c) => c.name === name)!;
let n = 0;
const place = (d: Design, name: string, px: number, pz: number): Placed => {
  const c = snap(d, art(name), px, pz);
  if (!c) throw new Error(`no snap for ${name} at ${px}, ${pz}`);
  const p = { id: `D${++n}`, ...c.part };
  d.parts.push(p);
  return p;
};

/** facade scaffold section: two standards 0.75 m apart, 4 m high, decks at 2 m and 4 m, bracket inside */
function facade(): Design {
  const d = emptyDesign();
  for (const x of [0, 0.75]) {
    place(d, 'UJB 38-50/30', x, 0);
    place(d, 'UVB 24', x, 0.3);
    place(d, 'UVR 200', x, 1.4);
    place(d, 'UVR 200', x, 3.4);
  }
  const levels = [...new Set(rosettes(d).map((r) => r.z))].sort((a, b) => a - b);
  // ledgers at the bottom, at about 2 m and 4 m
  for (const z of [levels[0], levels.find((v) => v > 1.9)!, levels.find((v) => v > 3.9)!]) place(d, 'UH 75 Plus', 0.375, z);
  const deckZ = levels.find((v) => v > 1.9)!;
  for (const p of d.parts) if (p.deck && p.z > 1) p.deck.work = true;
  // bracket inside (towards −x) at the working level
  place(d, 'UCM 50 mit Zapfen', -0.25, deckZ);
  d.anchors.push({ id: 'A1', part: d.parts.find((p) => p.x === 0 && p.article === '100009' && p.z > 2)!.id, z: levels.find((v) => v > 3.9)! });
  d.anchors.push({ id: 'A2', part: d.parts.find((p) => p.x === 0 && p.article === '100009' && p.z < 2)!.id, z: deckZ });
  return d;
}

describe('designer: section of a PERI UP scaffold', () => {
  it('parts snap: standards on the jacks and on each other, ledgers between rosettes of equal height', () => {
    const d = facade();
    const std = d.parts.filter((p) => p.article === '100009');
    expect(std.map((p) => p.z).sort()).toEqual([0.44, 0.44, 2.44, 2.44]);
    // base standard on the jack (extension 0.2 m)
    expect(d.parts.find((p) => p.article === '100014')!.z).toBeCloseTo(0.2, 3);
    const led = d.parts.filter((p) => p.article === '114629');
    expect(led).toHaveLength(3);
    expect(led.every((p) => p.x === 0)).toBe(true);
    // the bracket hangs on the inner standard towards −x
    expect(d.parts.find((p) => p.article === '412676')).toMatchObject({ x: 0, dir: -1 });
    expect(designIssues(d)).toEqual([]);
    // a ledger finds no standard 3 m away
    expect(snap(d, art('UH 300 Plus'), 1.5, 2.3)).toBeNull();
    // a tube point lies on a standard
    expect(tubePoint(d, 0.72, 1.33)).toMatchObject({ x: 0.75, z: 1.35 });
  });

  it('the drawing of the section is calculated by the analysis of the scaffold mode', () => {
    const d = facade();
    const { doc, loads, fixings } = designDoc(d);
    const st = analyzeScaffold(doc);
    expect(st.parts.filter((w) => w.cls.kind === 'standard')).toHaveLength(4);
    expect(st.parts.filter((w) => w.cls.kind === 'ledger')).toHaveLength(3);
    expect(st.columns).toHaveLength(2);
    const m = buildScaffoldModel(st, loads, [], { fixings, plane: true });
    expect(m.notes.filter((x) => /Free|Loose|floating|Ignored/.test(x.key))).toEqual([]);
    expect(m.fixings).toHaveLength(2);
    const r = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, dirs: ['x'], qMax: 500 });
    expect(r.combos.map((c) => c.name)).toEqual(['A +x', 'A −x', 'R +x', 'R −x', 'S +x', 'S −x']);
    expect(r.combos.every((c) => c.ok)).toBe(true);
    expect(r.unstable).toEqual([]);
    // loads of the decks: q · b on the working ledgers and the bracket
    const V = r.bases.reduce((s, b) => s + b.Vmax, 0);
    expect(V).toBeGreaterThan(2 * 2000 * 2.5 * 0.75);
    // every load bearing part is checked
    const checked = new Set(r.checks.map((c) => c.part));
    for (const p of d.parts) if (!['100411'].includes(p.article)) expect(checked.has(p.id), p.article).toBe(true);
    const eta = Math.max(...r.checks.map((c) => c.eta));
    expect(eta).toBeGreaterThan(0.05);
    expect(eta).toBeLessThan(1.5);
  });

  it('parts list of the section', () => {
    const bom = designBom(facade());
    expect(bom.find((r) => r.article === '100009')).toMatchObject({ count: 4, kg: 10 });
    expect(bom.find((r) => r.article === '114629')?.count).toBe(3);
  });
});
