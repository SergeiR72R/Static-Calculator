import { describe, expect, it } from 'vitest';
import { testModel } from './testutil';
import { analyze } from './analysis';
import { computeView } from './results';
import { runChecks } from './checks';
import { pointLoad, udl } from './defaults';
import type { Load, SupportType } from './types';

/** 200-element model: 41 supports, 160 point loads, 1 distributed load */
export function bigModel() {
  const L = 100;
  const sup: [SupportType, number][] = [['pinned', 0]];
  for (let i = 1; i <= 40; i++) sup.push(['roller', i * 2.5]);
  const loads: Load[] = [udl('G', 0, L, 5), udl('Q', 0, L, 3)];
  for (let i = 0; i < 160; i++) {
    const x = 0.3 + Math.floor(i / 4) * 2.5 + (i % 4) * 0.5;
    loads.push(pointLoad(i % 2 ? 'Q' : 'G', x, 10, 90));
  }
  return testModel(L, sup, loads);
}

describe('performance', () => {
  it('200 elements: analysis + results + checks well below 50 ms', () => {
    const m = bigModel();
    const run = () => {
      const t0 = performance.now();
      const an = analyze(m);
      const vr = computeView(an, { type: 'combo', id: 'ULS1' })!;
      runChecks(an, vr);
      return { t: performance.now() - t0, an };
    };
    run();
    const times: number[] = [];
    let elements = 0;
    for (let i = 0; i < 5; i++) {
      const r = run();
      times.push(r.t);
      elements = r.an.mesh!.elements.length;
    }
    times.sort((a, b) => a - b);
    console.log(`elements=${elements} median=${times[2].toFixed(1)}ms`);
    expect(elements).toBeGreaterThanOrEqual(200);
    expect(times[2]).toBeLessThan(50);
  });
});
