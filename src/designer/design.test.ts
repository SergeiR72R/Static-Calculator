import { describe, expect, it } from 'vitest';
import { analyzeScaffold } from '../scaffold/structure';
import { buildScaffoldModel } from '../scaffold/model';
import { analyzeScaffoldModel, DEFAULT_ANALYSIS } from '../scaffold/analysis';
import { CATALOG } from './catalog';
import { anchorAngle, designBom, designDoc, designIssues, emptyDesign, hangingStandards, rosettes, snap, tubePoint, type Design, type Placed } from './design';

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

  it('a bracket built from a diagonal, a hanging standard and a ledger is held by them and checked', () => {
    const d = emptyDesign();
    d.settings.outdoor = false;
    for (const x of [0, 0.75]) {
      place(d, 'UJB 38-50/30', x, 0);
      place(d, 'UVB 24', x, 0.3);
      place(d, 'UVR 200', x, 1.4);
    }
    place(d, 'UH 75 Plus', 0.375, 0.32);
    place(d, 'UH 75 Plus', 0.375, 2.32);
    // the post outside: in the air, on the rosette grid, 1.25 m from the frame
    const post = place(d, 'UVR 100', -1.2, 2.4);
    expect(post).toMatchObject({ x: -1.25, z: 1.94 });
    expect(designIssues(d).map((i) => i.key)).toContain('floating');
    // diagonal from a lower rosette of the frame up to the post, ledger on top back to the frame
    const diag = place(d, 'UBK 125/100', -0.6, 1.8);
    expect(diag).toMatchObject({ x: 0, z: 1.32, dir: -1 });
    const top = place(d, 'UH 125 Plus', -0.6, 2.32);
    expect(top).toMatchObject({ x: -1.25, z: 2.32 });
    top.deck!.work = true;
    expect(hangingStandards(d)).toEqual([post.id]);
    expect(designIssues(d).filter((i) => i.severity === 'error')).toEqual([]);
    d.anchors.push({ id: 'A1', part: d.parts.find((p) => p.x === 0 && p.article === '100009')!.id, z: 2.32 });
    const { doc, loads, fixings, hanging } = designDoc(d);
    const m = buildScaffoldModel(analyzeScaffold(doc), loads, [], { fixings, plane: true, hanging });
    // the post stands on nothing
    expect(m.bases.map((b) => b.part)).not.toContain(post.id);
    const r = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, outdoor: false, qWork: 0, qMax: 0, dirs: ['x'] });
    expect(r.combos.every((c) => c.ok)).toBe(true);
    expect(r.unstable).toEqual([]);
    const best = (id: string, check: string) => Math.max(0, ...r.checks.filter((c) => c.part === id && c.check === check).map((c) => c.eta));
    // the diagonal carries the bracket in compression, the ledger on top in tension
    expect(best(diag.id, 'diagonal')).toBeGreaterThan(0.05);
    expect(best(top.id, 'conn')).toBeGreaterThan(0.05);
    expect(best(post.id, 'tube') + best(post.id, 'node')).toBeGreaterThan(0.01);
  });

  it('the strut of a bracket UCM carries it to the standard below (not a cantilever tube)', () => {
    const d = emptyDesign();
    for (const x of [0, 1]) {
      place(d, 'UJB 38-50/30', x, 0);
      place(d, 'UVB 24', x, 0.3);
      place(d, 'UVR 200', x, 1.4);
    }
    place(d, 'UH 100 Plus', 0.5, 0.32);
    const l = place(d, 'UH 100 Plus', 0.5, 2.32);
    const br = place(d, 'UCM 50 mit Zapfen', 1.3, 2.32);
    l.deck!.work = true;
    br.deck!.work = true;
    d.settings.loadClass = 6;
    d.anchors.push({ id: 'A1', part: d.parts.find((p) => p.x === 0 && p.article === '100009')!.id, z: 2.32 });
    const { doc, loads, fixings } = designDoc(d);
    const m = buildScaffoldModel(analyzeScaffold(doc), loads, [], { fixings, plane: true });
    expect(m.members.filter((x) => x.part === br.id)).toHaveLength(3);
    const r = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, p: 6000, loadClass: 6, outdoor: false, qWork: 0, qMax: 0, dirs: ['x'] });
    const eta = Math.max(...r.checks.filter((c) => c.part === br.id).map((c) => c.eta));
    expect(r.checks.find((c) => c.part === br.id)?.check).toBe('bracket');
    // as a cantilever tube it was 171 %
    expect(eta).toBeLessThan(0.6);
    // node checks carry their place
    expect(r.checks.filter((c) => c.check === 'node').every((c) => c.at)).toBe(true);
  });

  it('anchors go to the wall on the chosen side, held horizontally both ways', () => {
    const d = facade();
    d.anchors[0].angle = 0;
    d.anchors[1].angle = 180;
    const { fixings } = designDoc(d);
    expect(fixings.map((f) => f.dirs)).toEqual([['x'], ['x']]);
    expect(fixings.every((f) => !f.vec)).toBe(true);
    // without a choice (older sections): away from the middle of the section
    delete d.anchors[0].angle;
    expect(anchorAngle(d, d.anchors[0])).toBe(180);
  });

  it('a tie of a fixing in any direction carries its force along it (model)', () => {
    const d = facade();
    const { doc, loads, fixings } = designDoc(d);
    fixings[0] = { ...fixings[0], dirs: [], vec: [-1, 0, 1] };
    const m = buildScaffoldModel(analyzeScaffold(doc), loads, [], { fixings, plane: true });
    expect(m.fixings.find((f) => f.id === 'A1')?.tie).toBeTruthy();
    const r = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, dirs: ['x'], qMax: 500 });
    expect(r.combos.every((c) => c.ok)).toBe(true);
    const f = r.fixings.find((x) => x.id === 'A1')!;
    expect(f.F).toBeGreaterThan(10);
    expect(Math.abs(Math.abs(f.R[0]) - Math.abs(f.R[2]))).toBeLessThan(1e-6 * f.F + 1e-6);
  });

  it('a double diagonal: the second UBK of a bay on the other side of the rosettes, both carry', () => {
    const run = (double: boolean) => {
      const d = facade();
      d.anchors = [];
      const lv = [...new Set(rosettes(d).map((r) => r.z))].sort((a, b) => a - b);
      const a = place(d, 'UBK 75/200', 0.4, lv[0] + 1);
      expect(a.side).toBeUndefined();
      if (double) {
        const b = place(d, 'UBK 75/200', 0.4, lv[0] + 1);
        expect(b).toMatchObject({ x: a.x, z: a.z, dir: a.dir, side: -1 });
        // no third one in the bay
        expect(snap(d, art('UBK 75/200'), 0.4, lv[0] + 1)?.part.x === a.x && snap(d, art('UBK 75/200'), 0.4, lv[0] + 1)?.part.z === a.z).toBe(false);
      }
      const { doc, loads, fixings } = designDoc(d);
      const st = analyzeScaffold(doc);
      expect(st.issues.filter((i) => i.key === 'duplicate')).toEqual([]);
      const m = buildScaffoldModel(st, loads, [], { fixings, plane: true });
      const diags = d.parts.filter((p) => p.article === a.article);
      expect(m.members.filter((x) => diags.some((p) => p.id === x.part))).toHaveLength(diags.length);
      const r = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, dirs: ['x'], qMax: 500 });
      expect(r.combos.every((c) => c.ok)).toBe(true);
      return diags.map((p) => Math.max(...r.checks.filter((c) => c.part === p.id && c.check === 'diagonal').map((c) => c.eta)));
    };
    const [single] = run(false);
    const [d1, d2] = run(true);
    expect(d1).toBeGreaterThan(0.01);
    expect(d2).toBeGreaterThan(0.01);
    // the two share the force of one
    expect(Math.max(d1, d2)).toBeLessThan(single * 0.8);
  });

  it('UVB 49: the standard on it at 0.49 m, its upper rosette on the grid of the standard', () => {
    const d = emptyDesign();
    place(d, 'UJB 38-50/30', 0, 0);
    const b = place(d, 'UVB 49', 0, 0.4);
    expect(b.z).toBeCloseTo(0.2, 3);
    const u = place(d, 'UVR 200', 0, 1.6);
    expect(u.z).toBeCloseTo(0.69, 3);
    const ros = rosettes(d).map((r) => r.z);
    expect(ros).toEqual(expect.arrayContaining([0.32, 0.57, 1.07, 1.57]));
    // a free standard beside it on the grid of its upper rosette (0.57 + k · 0.5)
    const f = place(d, 'UVR 100', 1, 1.2);
    const k = (f.z + 0.38 - 0.57) / 0.5;
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
  });

  it('UBL: a ledger diagonal sits on two ledgers of a bay and is held by them in the analysis', () => {
    const d = emptyDesign();
    d.settings.outdoor = false;
    for (const x of [0, 2]) {
      place(d, 'UJB 38-50/30', x, 0);
      place(d, 'UVB 24', x, 0.3);
      place(d, 'UVR 200', x, 1.4);
    }
    // no ledgers yet: nowhere to go
    expect(snap(d, art('UBL 200/200'), 1, 1.3)).toBeNull();
    place(d, 'UH 200 Plus', 1, 0.32);
    const top = place(d, 'UH 200 Plus', 1, 2.32);
    top.deck!.work = true;
    const ubl = place(d, 'UBL 200/200', 1.2, 1.4);
    expect(ubl).toMatchObject({ x: 0, z: 0.32, dir: 1 });
    expect(designIssues(d).map((i) => i.key)).not.toContain('noBracing');
    const { doc, loads, fixings } = designDoc(d);
    const m = buildScaffoldModel(analyzeScaffold(doc), loads, [], { fixings, plane: true });
    expect(m.notes.filter((x) => x.key === 'ublNoLedger')).toEqual([]);
    expect(m.members.filter((x) => x.part === ubl.id).map((x) => x.kind)).toEqual(['ubl']);
    const r = analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, outdoor: false, qWork: 0, qMax: 0, dirs: ['x'] });
    expect(r.combos.every((c) => c.ok)).toBe(true);
    expect(Math.max(...r.checks.filter((c) => c.part === ubl.id).map((c) => c.eta))).toBeGreaterThan(0.01);
  });

  it('UBL is not used for a bracket built from a diagonal', () => {
    const d = emptyDesign();
    for (const x of [0, 0.75]) {
      place(d, 'UJB 38-50/30', x, 0);
      place(d, 'UVB 24', x, 0.3);
      place(d, 'UVR 200', x, 1.4);
    }
    place(d, 'UVR 100', -1.2, 2.4);
    place(d, 'UBK 125/100', -0.6, 1.8);
    place(d, 'UH 125 Plus', -0.6, 2.32);
    // a lower ledger of the same bay would make it a bay, but the post hangs: no UBL there
    expect(snap(d, art('UBL 150/100'), -0.6, 1.8)).toBeNull();
  });

  it('parts list of the section', () => {
    const bom = designBom(facade());
    expect(bom.find((r) => r.article === '100009')).toMatchObject({ count: 4, kg: 10 });
    expect(bom.find((r) => r.article === '114629')?.count).toBe(3);
  });
});
