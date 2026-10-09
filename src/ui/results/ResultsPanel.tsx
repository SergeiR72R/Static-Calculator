import type { ResultView } from '../../core/results';
import { useStore } from '../../state/store';
import { cx } from '../common';
import { makeXScale, useFmt, useResults, useWidth } from '../hooks';
import { caseLabel } from '../inputs/Editors';
import { comboLabel } from '../inputs/Panels';
import { CursorReadout, DiagramStack } from './Diagrams';
import { ChecksCard, ExtremesCard, IssuesBox, ReactionsCard } from './Kpi';
import { Schematic } from './Schematic';
import { View3DCard } from './View3DCard';

function viewKey(v: ResultView): string {
  return v.type === 'envelope' ? 'envelope' : `${v.type}:${v.id}`;
}

export function ViewSelect() {
  const fmt = useFmt();
  const model = useStore((s) => s.model);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const hasEnv = model.combinations.some((c) => c.inEnvelope);
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-xs text-slate-500 dark:text-slate-400">{fmt.t('results.view')}</span>
      <select
        className="h-8 max-w-[22rem] rounded border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-900"
        value={viewKey(view)}
        data-testid="view-select"
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'envelope') setView({ type: 'envelope' });
          else {
            const [type, id] = v.split(':');
            setView({ type: type as 'case' | 'combo', id });
          }
        }}
      >
        <optgroup label={fmt.t('results.combos')}>
          {model.combinations.map((c) => (
            <option key={c.id} value={`combo:${c.id}`}>
              {comboLabel(fmt, model, c)}
            </option>
          ))}
        </optgroup>
        {hasEnv && (
          <optgroup label={fmt.t('results.envelope')}>
            <option value="envelope">{fmt.t('results.envelopeOption')}</option>
          </optgroup>
        )}
        <optgroup label={fmt.t('results.cases')}>
          {model.loadCases.map((c) => (
            <option key={c.id} value={`case:${c.id}`}>
              {caseLabel(fmt, model, c.id)}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

export function ResultsToolbar() {
  const fmt = useFmt();
  const st = useStore();
  const { an, vr } = useResults();
  return (
    <div className="no-print flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
      <ViewSelect />
      <div className="flex items-center gap-1 text-xs" role="group" aria-label={fmt.t('results.momentSide')}>
        <span className="text-slate-500 dark:text-slate-400">{fmt.t('results.momentSide')}:</span>
        {(['bottom', 'top'] as const).map((side) => (
          <button
            key={side}
            type="button"
            aria-pressed={st.momentSide === side}
            onClick={() => st.setPrefs({ momentSide: side })}
            className={cx(
              'rounded px-2 py-1',
              st.momentSide === side ? 'bg-accent-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200',
            )}
          >
            {fmt.t(`results.side.${side}`)}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 text-xs">
        <input type="checkbox" checked={st.showDeformed} onChange={(e) => st.setPrefs({ showDeformed: e.target.checked })} />
        {fmt.t('results.deformed')}
        <input
          type="range"
          min={0.2}
          max={3}
          step={0.1}
          value={st.deformScale}
          disabled={!st.showDeformed}
          aria-label={fmt.t('results.deformScale')}
          onChange={(e) => st.setPrefs({ deformScale: Number(e.target.value) })}
          className="w-20"
        />
      </label>
      {vr && (
        <span className="ms-auto text-[11px] text-slate-500 dark:text-slate-400" data-testid="calc-info">
          {vr.kind === 'envelope' ? fmt.t('results.envelopeInfo', { n: vr.variants }) + ' · ' : ''}
          {fmt.t('results.time', { ms: fmt.num(an.time, 1), n: an.mesh?.elements.length ?? 0 })}
        </span>
      )}
    </div>
  );
}

export function ResultsPanel() {
  const fmt = useFmt();
  const model = useStore((s) => s.model);
  const { vr } = useResults();
  const [ref, width] = useWidth<HTMLDivElement>();
  const sx = makeXScale(width, model.L);
  return (
    <div className="space-y-3">
      <IssuesBox />
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" ref={ref}>
        {width > 0 && (
          <>
            <Schematic sx={sx} />
            <div className="sticky top-0 z-10 border-y border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
              <CursorReadout />
            </div>
            {vr ? (
              <DiagramStack sx={sx} />
            ) : (
              <p className="p-6 text-center text-sm text-slate-500">{fmt.t('results.none')}</p>
            )}
          </>
        )}
      </div>
      {vr && (
        <div className="no-print">
          <View3DCard />
        </div>
      )}
      {vr && (
        <div className="grid gap-3 xl:grid-cols-2">
          <ReactionsCard />
          <ExtremesCard />
          <div className="xl:col-span-2">
            <ChecksCard />
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{fmt.t('results.signs')}</p>
    </div>
  );
}
