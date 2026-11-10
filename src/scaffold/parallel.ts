/**
 * The scaffold analysis in background workers: the combinations are shared out between up to four
 * workers that run in parallel; their results are merged. Without workers (or if they fail to
 * start) the analysis runs on the page itself.
 */
import { analyzeScaffoldModelAsync, buildCombos, mergeResults, type AnalysisOptions, type ScaffoldResult } from './analysis';
import type { ScaffoldModel } from './model';
import type { WorkerJob, WorkerMessage } from './analysis.worker';
import AnalysisWorker from './analysis.worker?worker&inline';

export async function analyzeScaffoldParallel(model: ScaffoldModel, opt: AnalysisOptions, progress: (done: number, total: number) => void): Promise<ScaffoldResult> {
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
  progress(0, names.length);
  const run = (w: Worker, k: number) =>
    new Promise<ScaffoldResult>((resolve, reject) => {
      let started = false;
      w.onmessage = (e: MessageEvent<WorkerMessage>) => {
        const m = e.data;
        if (m.type === 'start') started = true;
        else if (m.type === 'done-one') progress(++done, names.length);
        else if (m.type === 'result') resolve(m.result);
        else reject(new Error(m.message));
      };
      w.onerror = (e) => {
        e.preventDefault();
        reject(started ? new Error(e.message || 'worker') : new WorkerStartError());
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
