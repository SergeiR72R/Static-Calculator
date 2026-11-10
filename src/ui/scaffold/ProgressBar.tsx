import { useFmt } from '../hooks';
import type { Progress } from './progress';

/** Bar with the phase and the percentage; without a share it runs to and fro. */
export function ProgressBar({ p, testId }: { p: Progress; testId?: string }) {
  const fmt = useFmt();
  const pct = p.frac === null ? null : Math.max(0, Math.min(100, p.frac * 100));
  return (
    <div className="w-full" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} data-testid={testId}>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-slate-700 dark:text-slate-200">{fmt.t(p.phase, p.params)}</span>
        {pct !== null && <span className="num text-slate-500">{fmt.num(pct, 0)} %</span>}
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        {pct === null ? (
          <div className="progress-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-accent-600" />
        ) : (
          <div className="h-full rounded-full bg-accent-600" style={{ width: `${pct}%` }} />
        )}
      </div>
    </div>
  );
}
