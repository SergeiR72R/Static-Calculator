import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { itemStatus, type BatchItem, type ItemStatus } from '../../state/batch';
import { Button, cx } from '../common';
import { useFmt, type Fmt } from '../hooks';
import { IconAlert, IconCheck, IconChevronDown, IconChevronRight, IconX } from '../icons';
import { beamSummary, type BeamSummary } from './summary';

type Filter = 'all' | 'open' | 'checked' | 'problems';

/** import notes that are only information (not a problem) */
const INFO_ONLY = new Set(['ground', 'lengthSnapped']);

const isProblem = (it: BatchItem, s: BeamSummary) => s.state !== 'ok' || it.warnings.some((w) => !INFO_ONLY.has(w.key));

export function warningText(fmt: Fmt, w: { key: string; params?: Record<string, string | number> }) {
  return fmt.t(`import.warn.${w.key}`, w.params);
}

function StatusIcon({ st }: { st: ItemStatus }) {
  const fmt = useFmt();
  if (st === 'checked')
    return (
      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-600 text-white" title={fmt.t('batch.status.checked')} aria-label={fmt.t('batch.status.checked')}>
        <IconCheck width={11} height={11} />
      </span>
    );
  if (st === 'changed')
    return (
      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-amber-500 text-[10px] font-bold text-white" title={fmt.t('batch.status.changed')} aria-label={fmt.t('batch.status.changed')}>
        !
      </span>
    );
  return <span className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-300 dark:border-slate-600" title={fmt.t('batch.status.open')} aria-label={fmt.t('batch.status.open')} />;
}

function EtaBadge({ s }: { s: BeamSummary }) {
  const fmt = useFmt();
  if (s.state === 'error')
    return (
      <span className="rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300" title={s.error ? fmt.t(s.error) : ''}>
        {fmt.t('batch.error')}
      </span>
    );
  return (
    <span className={cx('num w-12 text-end text-[11px] font-semibold', s.state === 'fail' ? 'text-red-600 dark:text-red-400' : s.eta > 0.9 ? 'text-amber-600' : 'text-emerald-700 dark:text-emerald-400')}>
      {fmt.num(s.eta * 100, 0)} %
    </span>
  );
}

/** Beam list of an import: switch beams, mark them as checked, see what is open */
export function BatchPanel() {
  const fmt = useFmt();
  const batch = useStore((s) => s.batch);
  const switchBeam = useStore((s) => s.switchBeam);
  const setBeamChecked = useStore((s) => s.setBeamChecked);
  const closeBatch = useStore((s) => s.closeBatch);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => (batch ? batch.items.map((it) => ({ it, st: itemStatus(it), s: beamSummary(it.model) })) : []), [batch]);
  const idx = batch ? batch.items.findIndex((i) => i.id === batch.active) : -1;
  const active = rows[idx];

  // keyboard: Alt+↑ / Alt+↓ previous / next beam
  useEffect(() => {
    if (!batch) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      e.preventDefault();
      const n = batch.items[idx + (e.key === 'ArrowDown' ? 1 : -1)];
      if (n) switchBeam(n.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [batch, idx, switchBeam]);

  // keep the active row visible
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [batch?.active]);

  if (!batch || !active) return null;
  const counts = {
    all: rows.length,
    open: rows.filter((r) => r.st !== 'checked').length,
    checked: rows.filter((r) => r.st === 'checked').length,
    problems: rows.filter((r) => isProblem(r.it, r.s)).length,
  };
  const q = query.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (filter === 'all' || (filter === 'open' && r.st !== 'checked') || (filter === 'checked' && r.st === 'checked') || (filter === 'problems' && isProblem(r.it, r.s))) &&
      (!q || `${r.it.key} ${r.it.designation}`.toLowerCase().includes(q)),
  );
  const go = (d: number) => {
    const n = batch.items[idx + d];
    if (n) switchBeam(n.id);
  };
  const checked = active.st === 'checked';

  return (
    <section className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" data-testid="batch-panel" aria-label={fmt.t('batch.title')}>
      <div className="flex items-center gap-2 px-3 pt-2">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1 text-start" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed}>
          {collapsed ? <IconChevronRight /> : <IconChevronDown />}
          <span className="text-sm font-semibold">{fmt.t('batch.title')}</span>
          <span className="truncate text-xs text-slate-500" title={batch.name}>
            · {batch.name}
          </span>
        </button>
        <button
          type="button"
          className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          title={fmt.t('batch.close')}
          aria-label={fmt.t('batch.close')}
          data-testid="batch-close"
          onClick={() => {
            if (window.confirm(fmt.t('batch.closeConfirm'))) closeBatch();
          }}
        >
          <IconX />
        </button>
      </div>
      {/* progress */}
      <div className="px-3 pt-1">
        <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-300">
          <span data-testid="batch-progress">{fmt.t('batch.progress', { n: counts.checked, total: counts.all })}</span>
          {counts.problems > 0 && <span className="text-red-600 dark:text-red-400">{fmt.t('batch.problemsCount', { n: counts.problems })}</span>}
        </div>
        <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(counts.checked / counts.all) * 100}%` }} />
        </div>
      </div>
      {/* active beam */}
      <div className="flex items-center gap-1.5 px-3 pt-2">
        <Button size="sm" onClick={() => go(-1)} disabled={idx <= 0} aria-label={fmt.t('batch.prev')} title={`${fmt.t('batch.prev')} (Alt+↑)`} data-testid="batch-prev">
          ◀
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-semibold" data-testid="batch-active">
            {active.it.key} <span className="font-normal text-slate-600 dark:text-slate-300">{active.it.designation}</span>
          </div>
          <div className="text-[10.5px] text-slate-500">
            {idx + 1} / {rows.length} · L = {fmt.q(active.it.model.L, 'length')}
          </div>
        </div>
        <Button size="sm" onClick={() => go(1)} disabled={idx >= rows.length - 1} aria-label={fmt.t('batch.next')} title={`${fmt.t('batch.next')} (Alt+↓)`} data-testid="batch-next">
          ▶
        </Button>
      </div>
      <div className="px-3 pt-1.5">
        <button
          type="button"
          data-testid="batch-check"
          aria-pressed={checked}
          onClick={() => setBeamChecked(active.it.id, !checked)}
          className={cx(
            'flex w-full items-center justify-center gap-2 rounded-md border px-2 py-1.5 text-sm font-medium transition-colors',
            checked
              ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
              : 'border-slate-300 bg-white hover:border-emerald-600 hover:text-emerald-700 dark:border-slate-600 dark:bg-slate-900',
          )}
        >
          {checked ? <IconCheck /> : <span className="h-3.5 w-3.5 rounded-sm border-2 border-current" />}
          {fmt.t(checked ? 'batch.checked' : 'batch.markChecked')}
        </button>
        {active.st === 'changed' && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">{fmt.t('batch.changedHint')}</p>}
        {active.it.warnings.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200" data-testid="batch-warnings">
            {active.it.warnings.map((w, i) => (
              <li key={i} className="flex gap-1">
                <IconAlert className="mt-0.5 shrink-0" width={12} height={12} /> {warningText(fmt, w)}
              </li>
            ))}
          </ul>
        )}
      </div>
      {!collapsed && (
        <>
          <div className="flex flex-wrap items-center gap-1 px-3 pt-2">
            {(['all', 'open', 'checked', 'problems'] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                data-testid={`batch-filter-${f}`}
                onClick={() => setFilter(f)}
                className={cx(
                  'rounded-full border px-2 py-0.5 text-[11px]',
                  filter === f ? 'border-accent-600 bg-accent-600 text-white' : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800',
                )}
              >
                {fmt.t(`batch.filter.${f}`)} {counts[f]}
              </button>
            ))}
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={fmt.t('batch.search')}
              aria-label={fmt.t('batch.search')}
              className="ms-auto w-24 min-w-0 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-900"
            />
          </div>
          <div ref={listRef} className="mt-1.5 max-h-[34vh] overflow-y-auto border-t border-slate-100 dark:border-slate-800" role="listbox" aria-label={fmt.t('batch.title')} data-testid="batch-list">
            {shown.map(({ it, st, s }) => {
              const on = it.id === batch.active;
              const warn = it.warnings.filter((w) => !INFO_ONLY.has(w.key));
              return (
                <div
                  key={it.id}
                  role="option"
                  aria-selected={on}
                  data-active={on}
                  data-testid={`batch-item-${it.key}`}
                  tabIndex={-1}
                  onClick={() => switchBeam(it.id)}
                  className={cx(
                    'flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-1 text-xs dark:border-slate-800',
                    on ? 'bg-accent-50 dark:bg-accent-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60',
                  )}
                >
                  <span
                    role="checkbox"
                    aria-checked={st === 'checked'}
                    onClick={(e) => {
                      e.stopPropagation();
                      setBeamChecked(it.id, st !== 'checked');
                    }}
                    className="cursor-pointer"
                  >
                    <StatusIcon st={st} />
                  </span>
                  <span className={cx('w-12 shrink-0', on && 'font-semibold')}>{it.key}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{it.designation}</span>
                  {warn.length > 0 && (
                    <span className="text-amber-600" title={warn.map((w) => warningText(fmt, w)).join('\n')}>
                      <IconAlert width={12} height={12} />
                    </span>
                  )}
                  <EtaBadge s={s} />
                </div>
              );
            })}
            {!shown.length && <p className="px-3 py-2 text-xs text-slate-500">{fmt.t('batch.empty')}</p>}
          </div>
        </>
      )}
    </section>
  );
}
