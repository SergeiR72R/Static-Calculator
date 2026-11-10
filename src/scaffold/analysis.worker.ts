/// <reference lib="webworker" />
/**
 * Worker of the scaffold analysis: runs a share of the combinations of one model, so that several
 * workers can work in parallel and the page stays responsive.
 */
import { prepareAnalysis, weakDofs, type AnalysisOptions, type ScaffoldResult } from './analysis';
import type { ScaffoldModel } from './model';

export interface WorkerJob {
  model: ScaffoldModel;
  opt: AnalysisOptions;
  /** indices of the combinations this worker runs */
  combos: number[];
}

export type WorkerMessage = { type: 'start'; total: number; names: string[] } | { type: 'done-one' } | { type: 'result'; result: ScaffoldResult } | { type: 'error'; message: string };

self.onmessage = (e: MessageEvent<WorkerJob>) => {
  const { model, opt, combos } = e.data;
  const post = (m: WorkerMessage) => (self as unknown as Worker).postMessage(m);
  try {
    const a = prepareAnalysis(model, opt, weakDofs(model));
    post({ type: 'start', total: a.combos.length, names: a.combos.map((c) => c.name) });
    for (const k of combos) {
      if (k < a.combos.length) a.runCombo(a.combos[k]);
      post({ type: 'done-one' });
    }
    post({ type: 'result', result: a.finish() });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
