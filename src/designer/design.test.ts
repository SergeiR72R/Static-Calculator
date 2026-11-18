import { describe, expect, it } from 'vitest';
import { analyzeScaffold } from '../scaffold/structure';
import { buildScaffoldModel } from '../scaffold/model';
import { analyzeScaffoldModel, DEFAULT_ANALYSIS } from '../scaffold/analysis';
import { CATALOG } from './catalog';
import { anchorAngle, designBom, designDoc, designIssues, emptyDesign, hangingStandards, horizontalLoads, maxLoadClass, rosettes, snap, tubePoint, type Design, type Placed } from './design';

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

  /** a frame of two standards with a ledger at the bottom and one at the top (decks as given) */
  const portal = (ledger: string, o: { cls?: number; b?: number; outdoor?: boolean; qMax?: number; anchor?: boolean } = {}) => {
    const d = emptyDesign();
    d.settings.outdoor = o.outdoor ?? false;
    d.settings.qMax = o.qMax ?? 0;
    const L = art(ledger).L;
    for (const x of [0, L]) {
      place(d, 'UJB 38-50/30', x, 0);
      place(d, 'UVB 24', x, 0.3);
      place(d, 'UVR 200', x, 1.4);
    }
    const lv = [...new Set(rosettes(d).map((r) => r.z))].sort((a, b) => a - b);
    const lo = place(d, ledger, L / 2, lv[0]);
    const up = place(d, ledger, L / 2, lv[lv.length - 1]);
    lo.deck = undefined;
    up.deck = { width: o.b ?? 2.5, work: true, cls: o.cls ?? 3 };
    if (o.anchor ?? true) d.anchors.push({ id: 'A1', part: d.parts.find((p) => p.x === 0 && p.article === '100009')!.id, z: lv[lv.length - 1], angle: 180 });
    return { d, up };
  };
  const solve = (d: Design) => {
    const { doc, loads, fixings, hanging } = designDoc(d);
    const m = buildScaffoldModel(analyzeScaffold(doc), loads, [], { fixings, plane: true, hanging });
    const s = d.settings;
    return analyzeScaffoldModel(m, { ...DEFAULT_ANALYSIS, p: 0, loadClass: maxLoadClass(d), outdoor: s.outdoor, qWork: s.outdoor ? 200 : 0, qMax: s.outdoor ? s.qMax : 0, dhb: 0, dirs: ['x'], diagrams: true });
  };

  it('ledgers at the permissible line load of the PERI Tabellenbuch are used to 100 %', () => {
    // UH Plus / UHV Plus: zul. q in kN/m (p. 25, 26); g = 0.3 kN/m² and the working load make it up
    const rows: [string, number][] = [
      ['UH 75 Plus', 24.1],
      ['UH 100 Plus', 18.3],
      ['UH 150 Plus', 6.5],
      ['UH 200 Plus', 3.49],
      ['UH 300 Plus', 1.29],
      ['UHV 200 Plus', 13.6],
      ['UHV 300 Plus', 6.29],
    ];
    for (const [name, zul] of rows) {
      // class 3 (2.0 kN/m²) + 0.3: field width for q = zul
      const { d, up } = portal(name, { b: (zul * 1e3) / 2300 });
      const r = solve(d);
      const eta = Math.max(...r.checks.filter((c) => c.part === up.id && c.check === 'ledger').map((c) => c.eta));
      expect(eta, name).toBeGreaterThan(0.96);
      expect(eta, name).toBeLessThan(1.08);
    }
    // the table governs for the long ledgers
    const { d, up } = portal('UH 300 Plus', { b: 1.29e3 / 2300 });
    expect(solve(d).checks.find((c) => c.part === up.id && c.check === 'ledger')?.detail).toContain('Tabellenbuch');
  });

  it('each deck keeps its load class; the working load follows it', () => {
    const { d, up } = portal('UH 150 Plus', { cls: 2, b: 2 });
    d.settings.loadClass = 6;
    const q = (dd: Design) => designDoc(dd).loads.find((l) => l.id === `${up.id}.q`)!.value;
    expect(q(d)).toBeCloseTo(1500 * 2, 6);
    up.deck!.cls = 4;
    expect(q(d)).toBeCloseTo(3000 * 2, 6);
    expect(maxLoadClass(d)).toBe(4);
    // a new deck takes the class of the settings
    expect(snap(d, art('UCM 50 mit Zapfen'), 1.8, up.z)?.part.deck).toMatchObject({ cls: 6 });
  });

  it('horizontal loads: outdoors never less than indoors; the maximum wind acts on the field width', () => {
    const H = (o: Parameters<typeof portal>[1]) => horizontalLoads(portal('UH 200 Plus', { cls: 6, b: 3, ...o }).d)[0];
    const indoor = H({ outdoor: false });
    // 2.5 % of 6 kN/m² · 3 m · 2 m
    expect(indoor).toMatchObject({ windWork: 0, windMax: 0 });
    expect(indoor.notional).toBeCloseTo(900, 6);
    const outdoor = H({ outdoor: true });
    // working wind 0.2 kN/m² · 1.2 on the band 0.4 m · 3 m, the notional load above it
    expect(outdoor.windWork).toBeCloseTo(288, 6);
    expect(outdoor.windWork + outdoor.notional).toBeCloseTo(900, 6);
    expect(H({ outdoor: true, qMax: 1000 }).windMax).toBeCloseTo(720, 6);
    // the sway of the frame without bracing: outdoors at least as indoors, more with the maximum wind
    const dh = (o: Parameters<typeof portal>[1], combo = 'A') =>
      Math.max(0, ...solve(portal('UH 200 Plus', { cls: 3, b: 1.5, anchor: false, ...o }).d).combos.filter((c) => c.name.startsWith(combo)).map((c) => c.dh));
    expect(dh({ outdoor: true })).toBeGreaterThanOrEqual(dh({ outdoor: false }) * 0.999);
    // out of service: the sway grows with the maximum wind
    expect(dh({ outdoor: true, qMax: 500 }, 'R')).toBeGreaterThan(0.001);
    expect(dh({ outdoor: true, qMax: 1000 }, 'R')).toBeGreaterThan(dh({ outdoor: true, qMax: 500 }, 'R') * 1.3);
  });

  it('brackets UCM at the permissible loads of the PERI Tabellenbuch: line load and a standard on the tip', () => {
    const run = (b: number, post: boolean) => {
      const { d, up } = portal('UH 100 Plus', { cls: 3, b: 1 });
      const br = place(d, 'UCM 50 mit Zapfen', 1.3, up.z);
      br.deck = { width: b, work: true, cls: 3 };
      if (post) place(d, 'UVR 100', 1.5, up.z + 0.8);
      const r = solve(d);
      return r.checks.find((c) => c.part === br.id && c.check === 'bracket')!;
    };
    // zul. q = 15.1 kN/m: (2.0 + 0.3) kN/m² over 15.1 / 2.3 m
    const full = run(15.1 / 2.3, false);
    expect(full.detail).toContain('Tabellenbuch');
    expect(full.eta).toBeGreaterThan(0.97);
    expect(full.eta).toBeLessThan(1.08);
    // a standard on the spigot adds its weight as a single load at the tip (zul. F = 3.58 kN)
    expect(run(15.1 / 2.3, true).eta).toBeGreaterThan(full.eta + 0.005);
    expect(run(2.5, false).eta).toBeLessThan(0.45);
  });

  it('shear force of the ledger for the diagram: q · L / 2 at its ends', () => {
    const { d, up } = portal('UH 200 Plus', { cls: 3, b: 1.5 });
    const r = solve(d);
    const s = r.shear!.find((x) => x.part === up.id)!;
    // design load (2.0 + 0.3) · 1.5 · 1.5 kN/m plus the self weight, over about 1.95 m
    const V = (2300 * 1.5 * 1.5 * 1.95) / 2;
    expect(Math.abs(s.V0)).toBeGreaterThan(V * 0.95);
    expect(Math.abs(s.V0)).toBeLessThan(V * 1.1);
    expect(Math.sign(s.V0)).toBe(-Math.sign(s.V1));
    expect(r.shear!.some((x) => x.kind === 'standard')).toBe(true);
  });

  it('parts list of the section', () => {
    const bom = designBom(facade());
    expect(bom.find((r) => r.article === '100009')).toMatchObject({ count: 4, kg: 10 });
    expect(bom.find((r) => r.article === '114629')?.count).toBe(3);
  });
});
