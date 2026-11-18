import { useMemo } from 'react';
import { assessScaffold, type Assessment, type Finding } from '../../scaffold/advice';
import type { ScaffoldResult } from '../../scaffold/analysis';
import type { ImportAudit, ModelNote, ScaffoldModel } from '../../scaffold/model';
import { siteWind, useScaffold } from '../../scaffold/store';
import type { ScaffoldStructure } from '../../scaffold/structure';
import { cx } from '../common';
import { useFmt, type Fmt } from '../hooks';
import { IconAlert, IconCheck, IconInfo } from '../icons';

const TONE = {
  none: 'border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-100',
  model: 'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100',
  fail: 'border-red-400 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100',
  check: 'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100',
  ok: 'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100',
};
const BADGE = { none: '#64748b', model: '#d97706', fail: '#dc2626', check: '#d97706', ok: '#16a34a' };
const LEVEL = {
  block: 'text-red-700 dark:text-red-300',
  fail: 'text-red-700 dark:text-red-300',
  warn: 'text-amber-800 dark:text-amber-300',
  info: 'text-slate-600 dark:text-slate-300',
};

/** the answer for the designer from the drawing, the settings and the analysis (if there is one) */
export function useAssessment(
  st: ScaffoldStructure,
  run: { result: ScaffoldResult; notes: ModelNote[]; audit: ImportAudit; defects: ScaffoldModel['defects'] } | null,
  girders: { key: string; eta: number; parts: string[] }[],
): Assessment {
  const sc = useScaffold();
  const height = st.max[2] - st.min[2];
  // no maximum wind outdoors: why (no site, no zone found for it, no wind map for its country, q_p 0)
  const noMaxWind =
    sc.exposure !== 'outdoor' || siteWind(sc, Math.max(height, 1)).qMax > 0
      ? false
      : sc.windManual
        ? 'qp'
        : !sc.site
          ? 'site'
          : ['de', 'nl', 'be', 'lu'].includes(sc.site.country)
            ? 'zone'
            : 'vb0';
  return useMemo(
    () =>
      assessScaffold({
        issues: st.issues,
        result: run?.result ?? null,
        notes: run?.notes,
        audit: run?.audit,
        defects: run?.defects,
        girders,
        noMaxWind,
        height,
        width: Math.min(st.max[0] - st.min[0], st.max[1] - st.min[1]),
        held: st.anchors.length + sc.fixings.reduce((n, f) => n + f.parts.length, 0),
      }),
    [st, run, girders, noMaxWind, height, sc.fixings],
  );
}

/** text of a finding: remarks of the import and notes of the model keep their own texts */
export function findingText(fmt: Fmt, f: Finding, kind: 'fix' | 'do'): string {
  if (f.key.startsWith('issue.')) return fmt.t(`scaffold.issue.${f.key.slice(6)}`, f.params);
  if (f.key.startsWith('note.')) return fmt.t(`scaffold.calc.note.${f.key.slice(5)}`, f.params);
  const dir = f.params?.dir ? fmt.t(`scaffold.advice.dir.${f.params.dir}`) : '';
  return fmt.t(`scaffold.advice.${kind}.${f.key}`, { ...f.params, dir });
}

function List({ items, kind, selected, onSelect, testId }: { items: Finding[]; kind: 'fix' | 'do'; selected: string[]; onSelect: (parts: string[]) => void; testId: string }) {
  const fmt = useFmt();
  return (
    <ul className="space-y-1" data-testid={testId}>
      {items.map((f, k) => {
        const on = f.parts.length > 0 && selected === f.parts;
        return (
          <li key={`${f.key}${k}`}>
            <button
              type="button"
              disabled={!f.parts.length}
              aria-pressed={on}
              onClick={() => onSelect(on ? [] : f.parts)}
              data-testid={`${testId}-${f.key}`}
              className={cx(
                'flex w-full items-start gap-1.5 rounded px-1.5 py-1 text-start text-xs enabled:hover:bg-black/5 dark:enabled:hover:bg-white/10',
                LEVEL[f.level],
                on && 'bg-fuchsia-100 ring-1 ring-fuchsia-400 dark:bg-fuchsia-900/40',
              )}
            >
              {f.level === 'info' ? <IconInfo className="mt-0.5 shrink-0" width={13} height={13} /> : <IconAlert className="mt-0.5 shrink-0" width={13} height={13} />}
              <span>
                {findingText(fmt, f, kind)}
                {f.parts.length > 0 && <span className="ms-1 whitespace-nowrap underline opacity-80">{fmt.t('scaffold.advice.show')}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The answer at a glance: does the scaffold work, what has to be put right in the model, what to change
 * so that it works. `done`: an analysis exists; `stale`: its input has changed since.
 */
export function VerdictPanel({ a, done, stale, selected, onSelect }: { a: Assessment; done: boolean; stale: boolean; selected: string[]; onSelect: (parts: string[]) => void }) {
  const fmt = useFmt();
  const v = done ? a.verdict : 'none';
  const remarks = a.fix.filter((f) => f.level !== 'info').length;
  return (
    <div className="space-y-3" data-testid="scaffold-verdict" data-verdict={v} data-stale={stale ? '1' : '0'}>
      <div className={cx('flex flex-wrap items-center gap-3 rounded-lg border-2 p-3', TONE[v], stale && 'opacity-60')}>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ background: BADGE[v] }}>
          {v === 'ok' ? <IconCheck width={22} height={22} /> : v === 'none' ? <IconInfo width={22} height={22} /> : <IconAlert width={22} height={22} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-tight" data-testid="scaffold-verdict-title">
            {fmt.t(`scaffold.advice.verdict.${v}`)}
          </p>
          <p className="text-xs">
            {fmt.t(`scaffold.advice.verdictText.${v}`, { eta: fmt.num(a.maxEta * 100, 0) })}
            {done && v !== 'model' && remarks > 0 && ` ${fmt.t('scaffold.advice.remarks', { n: remarks })}`}
          </p>
          {stale && <p className="text-xs font-semibold">{fmt.t('scaffold.calc.stale')}</p>}
        </div>
        {done && (
          <span className="rounded px-2 py-1 text-sm font-semibold text-white" style={{ background: BADGE[v] }} data-testid="scaffold-calc-max">
            max η = {fmt.num(a.maxEta * 100, 0)} %
          </span>
        )}
      </div>
      {a.fix.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold">{fmt.t('scaffold.advice.fixTitle')}</p>
          <List items={a.fix} kind="fix" selected={selected} onSelect={onSelect} testId="scaffold-fix-list" />
        </div>
      )}
      {done && a.todo.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold">{fmt.t(a.verdict === 'fail' ? 'scaffold.advice.todoTitleFail' : a.verdict === 'check' ? 'scaffold.advice.todoTitle' : 'scaffold.advice.todoTitleInfo')}</p>
          <List items={a.todo} kind="do" selected={selected} onSelect={onSelect} testId="scaffold-todo-list" />
        </div>
      )}
    </div>
  );
}
