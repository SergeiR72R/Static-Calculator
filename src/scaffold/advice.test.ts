import { describe, expect, it } from 'vitest';
import { assessScaffold } from './advice';
import type { PartCheck, ScaffoldResult } from './analysis';

const combo = (name: string, o: Partial<ScaffoldResult['combos'][number]> = {}) => ({ name, ok: true, iterations: 3, converged: true, dh: 0.01, dv: 0.002, dhNode: 0, dvNode: 0, sumV: 1e5, ...o }) as ScaffoldResult['combos'][number];
const result = (checks: Partial<PartCheck>[], o: Partial<ScaffoldResult> = {}): ScaffoldResult =>
  ({
    combos: [combo('A +x'), combo('A +y')],
    checks: checks.map((c, i) => ({ part: `p${i}`, check: 'conn', eta: 0.5, combo: 'A +x', ...c })) as PartCheck[],
    eta: {},
    bases: [],
    anchors: [],
    fixings: [],
    beamSupports: [],
    beams: [],
    level: 0,
    totalG: 0,
    totalQ: 0,
    unknowns: 0,
    weak: 0,
    factorisations: 0,
    pcg: [0, 0],
    unstable: [],
    ...o,
  }) as ScaffoldResult;

describe('plain answer of the scaffold analysis', () => {
  it('works up to 70 %, to the engineer up to 100 %, fails above', () => {
    expect(assessScaffold({ issues: [], result: result([{ eta: 0.69 }]) })).toMatchObject({ verdict: 'ok', todo: [] });
    const near = assessScaffold({ issues: [], result: result([{ eta: 0.85 }, { eta: 0.4 }]) });
    expect(near.verdict).toBe('check');
    expect(near.todo).toMatchObject([{ key: 'node', level: 'warn', parts: ['p0'], params: { n: 1, eta: 85, dir: 'x' } }]);
    const bad = assessScaffold({ issues: [], result: result([{ eta: 1.3, check: 'diagonal', combo: 'R +y' }, { eta: 1.1, check: 'diagonal', combo: 'R −y' }, { eta: 0.9, check: 'diagonal' }, { eta: 0.8, check: 'jack' }]) });
    expect(bad.verdict).toBe('fail');
    expect(bad.maxEta).toBeCloseTo(1.3, 9);
    // the failing parts only, by the measure; the direction of their combinations
    expect(bad.todo.map((t) => [t.key, t.level, t.parts.length, t.params?.dir])).toEqual([
      ['diagonal', 'fail', 2, 'y'],
      ['jack', 'warn', 1, 'x'],
    ]);
  });

  it('the model first: mechanisms, parts not held, defects of the program block the verdict', () => {
    const mech = assessScaffold({ issues: [], result: result([{ eta: 0.3 }], { combos: [combo('A +x', { ok: false })], unstable: ['a', 'b'] }) });
    expect(mech.verdict).toBe('model');
    expect(mech.fix[0]).toMatchObject({ key: 'mechanism', level: 'block', parts: ['a', 'b'] });
    expect(assessScaffold({ issues: [], result: result([]), defects: [{ key: 'carrierBroken', parts: ['x'] }] }).verdict).toBe('model');
    expect(assessScaffold({ issues: [], result: result([], { unstable: ['a'] }) }).fix[0].key).toBe('unheld');
  });

  it('remarks on the model do not change a verdict of the scaffold, but are listed', () => {
    const a = assessScaffold({
      issues: [
        { key: 'ledgerOneEndDecked', params: { n: 2 }, parts: ['l1', 'l2'], severity: 'warning' },
        { key: 'healed', params: { n: 3, d: 4 }, parts: ['h'], severity: 'info' },
      ],
      result: result([{ eta: 0.5 }]),
      audit: { total: 10, counts: {} as never, listed: [{ fate: 'loose', name: 'UH 100', parts: ['u'] }, { fate: 'noWeight', name: 'Federstecker', parts: ['f'] }] },
      notes: [{ key: 'ledgerLoose', parts: ['u'] }, { key: 'beamAssumed', parts: ['b'] }, { key: 'deckNoSupport', parts: ['d'] }],
      noMaxWind: true,
    });
    expect(a.verdict).toBe('ok');
    expect(a.fix.map((f) => f.key)).toEqual(['loose', 'issue.ledgerOneEndDecked', 'note.deckNoSupport', 'noMaxWind']);
  });

  it('parts drawn twice: one remark for all places', () => {
    const dup = (name: string, id: string) => ({ key: 'duplicate', params: { name, n: 2 }, parts: [id, id + 'b'], severity: 'warning' as const });
    const a = assessScaffold({ issues: [dup('Federstecker', 'a'), dup('Federstecker', 'c'), dup('UH 100', 'e')], result: null });
    expect(a.fix).toMatchObject([{ key: 'duplicates', parts: ['a', 'ab', 'c', 'cb', 'e', 'eb'], params: { n: 3, names: 'Federstecker, UH 100' } }]);
  });

  it('lost stability, uplift, sway and slender scaffolds without ties', () => {
    const r = result([{ check: 'uplift', eta: 1.01, combo: 'S +x' }], {
      combos: [combo('R +x', { stability: ['s1', 's2'], dh: 0.2 }), combo('R −x', { stability: ['s2'] })],
      bases: [{ part: 'b', node: 1, Vmax: 1, Vmin: 0, H: 0, combo: 'A +x', lifted: true }],
    });
    const a = assessScaffold({ issues: [], result: r, height: 8, width: 1 });
    expect(a.verdict).toBe('fail');
    expect(a.todo.map((t) => t.key)).toEqual(['rootHorizontal', 'stabilityLost', 'uplift', 'sway']);
    expect(a.todo[1]).toMatchObject({ parts: ['s1', 's2'], params: { dir: 'x' } });
    expect(a.todo[3].params).toMatchObject({ mm: 200, ratio: 40 });
    expect(a.fix).toMatchObject([{ key: 'slender', params: { r: 8 } }]);
    // held by ties: no remark
    expect(assessScaffold({ issues: [], result: null, height: 8, width: 1, held: 4 }).fix).toEqual([]);
    // before the first run: a hint only
    expect(assessScaffold({ issues: [], result: null, height: 8, width: 1 }).fix[0].level).toBe('info');
  });

  it('several failures in one direction with sway or uplift: the common cause comes first', () => {
    const r = result(
      [
        { check: 'conn', eta: 2, combo: 'R +x' },
        { check: 'diagonal', eta: 1.5, combo: 'R −x' },
        { check: 'ledger', eta: 1.2, combo: 'A +y' },
        { check: 'uplift', eta: 1.01, combo: 'S +x' },
      ],
      { combos: [combo('R +x')] },
    );
    const a = assessScaffold({ issues: [], result: r });
    expect(a.todo[0]).toMatchObject({ key: 'rootHorizontal', level: 'fail', params: { axis: 'X' } });
    // a single failure needs no summary
    expect(assessScaffold({ issues: [], result: result([{ check: 'conn', eta: 2, combo: 'R +x' }]) }).todo.map((t) => t.key)).toEqual(['node']);
  });

  it('lattice girders of the beam calculator count', () => {
    const a = assessScaffold({ issues: [], result: result([{ eta: 0.2 }]), girders: [{ key: 'T1', eta: 1.2, parts: ['g'] }, { key: 'T2', eta: 0.5, parts: ['h'] }] });
    expect(a.verdict).toBe('fail');
    expect(a.maxEta).toBeCloseTo(1.2, 9);
    expect(a.todo).toMatchObject([{ key: 'girder', level: 'fail', params: { name: 'T1', eta: 120 } }]);
  });
});
