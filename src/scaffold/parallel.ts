/**
 * The scaffold analysis in background workers: the combinations are shared out between up to four
 * workers that run in parallel; their results are merged. Without workers (or if they fail to
 * start) the analysis runs on the page itself.
 */
import { MAX_ITERATIONS, analyzeScaffoldModelAsync, buildCombos, mergeResults, type AnalysisOptions, type ScaffoldResult } from './analysis';

/**
 * Progress of the analysis: 'prepare' (search for mechanisms, before the first combination) or 'run'
 * with the combinations done and the share of all (iterations of the running ones counted in).
 */
export interface CalcProgress {
  phase: 'prepare' | 'run';
  done: number;
  total: number;
  frac: number;
}
import type { ScaffoldModel } from './model';
import type { WorkerJob, WorkerMessage } from './analysis.worker';
import AnalysisWorker from './analysis.worker?worker&inline';

export async function analyzeScaffoldParallel(model: ScaffoldModel, opt: AnalysisOptions, onProgress: (p: CalcProgress) => void): Promise<ScaffoldResult> {
  const progress = (done: number, total: number) => onProgress({ phase: 'run', done, total, frac: total ? done / total : 1 });
  const names = buildCombos(model, opt).combos.map((c) => c.name);
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  const n = Math.max(1, Math.min(names.length, 4, Math.max(cores - 1, 1)));
  const workers: Worker[] = [];
  try {
    for (let i = 0; i < n; i++) workers.push(new AnalysisWorker());
  } catch {
    workers.forEach((w) => w.terminate());
    return analyzeScaffoldModelAsync(model, opt, progress);
  }
  let done = 0;
  // iterations of the combination running in each worker; workers that have not started yet
  const iter = new Array<number>(n).fill(0);
  let started = 0;
  const report = () =>
    onProgress(
      started < n
        ? { phase: 'prepare', done, total: names.length, frac: 0 }
        : { phase: 'run', done, total: names.length, frac: Math.min((done + iter.reduce((s, x) => s + x / MAX_ITERATIONS, 0)) / names.length, 1) },
    );
  report();
  const startedCount = () => {
    started++;
    report();
  };
  const run = (w: Worker, k: number) =>
    new Promise<ScaffoldResult>((resolve, reject) => {
      let ok = false;
      w.onmessage = (e: MessageEvent<WorkerMessage>) => {
        const m = e.data;
        if (m.type === 'start') {
          ok = true;
          startedCount();
        } else if (m.type === 'step') {
          iter[k] = Math.min(m.it, MAX_ITERATIONS - 1);
          report();
        } else if (m.type === 'done-one') {
          done++;
          iter[k] = 0;
          report();
        } else if (m.type === 'result') resolve(m.result);
        else reject(new Error(m.message));
      };
      w.onerror = (e) => {
        e.preventDefault();
        reject(ok ? new Error(e.message || 'worker') : new WorkerStartError());
      };
      const job: WorkerJob = { model, opt, combos: names.map((_, i) => i).filter((i) => i % n === k) };
      w.postMessage(job);
    });
  try {
    const parts = await Promise.all(workers.map(run));
    return mergeResults(parts, names);
  } catch (e) {
    if (e instanceof WorkerStartError) return analyzeScaffoldModelAsync(model, opt, progress);
    throw e;
  } finally {
    workers.forEach((w) => w.terminate());
  }
}

class WorkerStartError extends Error {}
