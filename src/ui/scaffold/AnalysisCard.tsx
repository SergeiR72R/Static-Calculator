import { useMemo, useState } from 'react';
import { siteWind, useScaffold } from '../../scaffold/store';
import type { ScaffoldStructure } from '../../scaffold/structure';
import { LOAD_CLASSES } from '../../scaffold/catalog';
import { PART_FATES, buildScaffoldModel, type ImportAudit, type ModelNote, type ScaffoldModel } from '../../scaffold/model';
import { LIFT_TOL, type CheckKind, type ScaffoldResult } from '../../scaffold/analysis';
import { analyzeScaffoldParallel } from '../../scaffold/parallel';
import { useProgress } from './progress';
import { ProgressBar } from './ProgressBar';
import { Button, Card, NumberField, cx } from '../common';
import { useFmt } from '../hooks';
import { ETA_FAIL, ETA_OK } from '../../scaffold/advice';
import { VerdictPanel, useAssessment } from './VerdictPanel';
import { useStore } from '../../state/store';
import { batchFromImport } from '../../state/batch';
import { scaffoldBeam } from '../../scaffold/beams';
import { beamSummary } from '../batch/summary';
import { IconAlert, IconCheck, IconChevronRight, IconInfo } from '../icons';

export interface ScaffoldRun {
  result: ScaffoldResult;
  notes: ModelNote[];
  audit: ImportAudit;
  defects: ScaffoldModel['defects'];
  levels: { z: number; area: number }[];
  sig: string;
  ms: number;
}

export function etaColor(eta: number): string {
  if (!(eta >= 0)) return '#94a3b8';
  if (eta > ETA_FAIL) return '#dc2626';
  if (eta > ETA_OK) return '#f59e0b';
  return '#16a34a';
}

const CHECKS: CheckKind[] = ['stability', 'unstable', 'conn', 'node', 'tube', 'buckling', 'joint', 'ledger', 'diagonal', 'jack', 'anchor', 'coupler', 'uplift'];

/** Options, start and results of the space frame analysis of the scaffold */
export function AnalysisCard({
  st,
  run,
  setRun,
  girders = [],
}: {
  st: ScaffoldStructure;
  run: ScaffoldRun | null;
  setRun: (r: ScaffoldRun | null) => void;
  /** lattice girders checked in the beam calculator */
  girders?: { key: string; eta: number; parts: string[] }[];
}) {
  const fmt = useFmt();
  const sc = useScaffold();
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const calc = useProgress((s) => s.calc);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CheckKind | 'all'>('all');
  const [showAll, setShowAll] = useState(false);
  const [details, setDetails] = useState(false);
  const outdoor = sc.exposure === 'outdoor';
  const p = (LOAD_CLASSES[sc.loadClass] ?? 2) * 1e3;
  const wind = siteWind(sc, Math.max(st.max[2] - st.min[2], 1));
  const sig = JSON.stringify([sc.doc?.fileName, st.parts.length, sc.tol, p, sc.level, outdoor, Math.round(wind.qMax), sc.snow && sc.snowLoad, sc.ice && sc.iceThickness, sc.secondOrder, sc.loads, sc.dhb, sc.dhbLoad, sc.dhbDir, sc.dhbParts, sc.gFavR, sc.ubkModel, sc.diagSlack, sc.planLoads, sc.spliceNoTension, sc.capByArticle, sc.fixings]);
  const stale = !!run && run.sig !== sig;
  const byId = useMemo(() => new Map(st.parts.map((w) => [w.part.id, w])), [st]);
  const start = async () => {
    const setCalc = useProgress.getState().setCalc;
    setBusy({ done: 0, total: 1 });
    setError(null);
    setCalc({ phase: 'scaffold.progress.model', frac: null });
    await new Promise((r) => setTimeout(r, 30));
    try {
      const t0 = performance.now();
      const model = buildScaffoldModel(st, sc.loads, sc.dhbParts, { ubk: sc.ubkModel, planLoads: sc.planLoads, capByArticle: sc.capByArticle, fixings: sc.fixings });
      setCalc({ phase: 'scaffold.progress.prepare', frac: null });
      const result = await analyzeScaffoldParallel(
        model,
        {
          p,
          loadClass: sc.loadClass,
          level: sc.level,
          outdoor,
          qWork: 200,
          qMax: wind.qMax,
          cf: 1.2,
          snow: outdoor && sc.snow ? sc.snowLoad : 0,
          ice: outdoor && sc.ice ? sc.iceThickness : 0,
          secondOrder: sc.secondOrder,
          dhb: sc.dhb,
          dhbLoad: sc.dhbLoad,
          dhbDir: sc.dhbDir,
          gFavR: sc.gFavR,
          diagSlack: sc.diagSlack,
          spliceNoTension: sc.spliceNoTension,
        },
        (pr) => {
          setBusy({ done: pr.done, total: pr.total });
          setCalc(pr.phase === 'prepare' ? { phase: 'scaffold.progress.prepare', frac: null } : { phase: 'scaffold.progress.run', params: { done: pr.done, total: pr.total }, frac: pr.frac });
        },
      );
      setRun({ result, notes: model.notes, audit: model.audit, defects: model.defects, levels: model.levels, sig, ms: performance.now() - t0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRun(null);
    }
    setBusy(null);
    setCalc(null);
  };

  const res = run?.result;
  const failed = res?.combos.filter((c) => !c.ok) ?? [];
  const assessment = useAssessment(st, run, girders);
  const rows = res ? res.checks.filter((c) => filter === 'all' || c.check === filter) : [];
  const shown = showAll ? rows.slice(0, 400) : rows.slice(0, 25);
  const counts = new Map<CheckKind, { n: number; max: number }>();
  for (const c of res?.checks ?? []) {
    const o = counts.get(c.check) ?? { n: 0, max: 0 };
    o.n++;
    o.max = Math.max(o.max, c.eta);
    counts.set(c.check, o);
  }
  // bases in tension (held two-sided) and bases that lift off (reaction 0, allowed)
  const uplift = res?.bases.filter((b) => b.Vmin < -LIFT_TOL).length ?? 0;
  const lifted = res?.bases.filter((b) => b.lifted && b.Vmin >= -LIFT_TOL) ?? [];
  // beams SRU / RCS with the loads of the analysis, as models of the beam calculator
  const beams = useMemo(() => (res ? res.beams.map((b, k) => scaffoldBeam(b, `B${k + 1}`, byId.get(b.part)?.part.name ?? 'SRU', sc.doc?.fileName)) : []), [res, byId, sc.doc]);
  const beamSums = useMemo(() => beams.map((b) => beamSummary(b.model)), [beams]);
  const openBeams = (key: string) => {
    const app = useStore.getState();
    if (!beams.length || !sc.doc) return;
    const ours = !!sc.batchRef && app.batch?.id === sc.batchRef.id;
    if (!ours && !window.confirm(fmt.t('scaffold.beams.replaceConfirm'))) return;
    const { batch, images } = batchFromImport(`${sc.doc.fileName.replace(/\.dxf$/i, '')} – SRU, RCS`, beams);
    const it = batch.items.find((i) => i.key === key);
    if (it) batch.active = it.id;
    app.loadBatch(batch, images);
    sc.setBatchRef({ id: batch.id, sig: 'beams' });
    app.setPrefs({ appMode: 'beam' });
    app.showToast('scaffold.beams.opened', { n: beams.length });
  };

  return (
    <Card
      title={fmt.t('scaffold.advice.title')}
      testId="scaffold-calc"
      actions={
        <Button variant="primary" size="sm" onClick={() => void start()} disabled={!!busy} data-testid="scaffold-calc-run">
          {busy ? fmt.t('scaffold.calc.running', { done: busy.done, total: busy.total }) : fmt.t(run ? 'scaffold.calc.rerun' : 'scaffold.calc.run')}
        </Button>
      }
    >
      {calc && (
        <div className="mb-3">
          <ProgressBar p={calc} testId="scaffold-calc-progress" />
        </div>
      )}
      {outdoor && (sc.snow || sc.ice) && (
        <div className="mb-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {sc.snow && <NumberField label={fmt.t('scaffold.calc.snowLoad')} q="areaLoad" showUnit value={sc.snowLoad} onChange={(v) => sc.setOpts({ snowLoad: Math.max(0, v) })} help="scaffold.snowLoad" />}
          {sc.ice && <NumberField label={fmt.t('scaffold.calc.ice')} q="sectionDim" showUnit value={sc.iceThickness} onChange={(v) => sc.setOpts({ iceThickness: Math.max(0, v) })} help="scaffold.iceThickness" />}
        </div>
      )}
      <VerdictPanel a={assessment} done={!!res} stale={stale} selected={sc.selected} onSelect={(parts) => sc.select(parts)} />
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {res && (
        <details className={cx('mt-3', stale && 'opacity-60')} data-testid="scaffold-calc-result" open={details} onToggle={(e) => setDetails((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-xs font-semibold text-accent-700 dark:text-accent-300" data-testid="scaffold-calc-details">
            {fmt.t('scaffold.advice.details')}
          </summary>
          <div className="mt-2 space-y-3">
          <p className="text-xs text-slate-600 dark:text-slate-300">{fmt.t('scaffold.calc.intro')}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{fmt.t(outdoor ? (wind.qMax > 0 ? 'scaffold.calc.combosOutdoor' : 'scaffold.calc.combosNoMax') : 'scaffold.calc.combosIndoor', { q: fmt.q(wind.qMax, 'areaLoad') })}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs text-slate-600 dark:text-slate-300">
              {fmt.t('scaffold.calc.summary', {
                g: fmt.q(res.totalG, 'force', 1),
                q: fmt.q(res.totalQ, 'force', 1),
                z: fmt.q(run.levels[res.level]?.z ?? 0, 'length'),
                n: res.unknowns,
                s: fmt.num(run.ms / 1000, 1),
              })}
              {(res.userG ?? 0) + (res.userQ ?? 0) + (res.dhb ?? 0) > 0 && (
                <span data-testid="scaffold-calc-user">
                  {' · '}
                  {fmt.t('scaffold.calc.summaryUser', { g: fmt.q(res.userG ?? 0, 'force', 1), q: fmt.q(res.userQ ?? 0, 'force', 1), h: fmt.q(res.dhb ?? 0, 'force', 2) })}
                </span>
              )}
            </span>
          </div>
          {failed.length > 0 && (
            <p className="flex items-start gap-1 text-xs font-medium text-red-600 dark:text-red-400" data-testid="scaffold-calc-failed">
              <IconAlert className="mt-0.5 shrink-0" width={12} height={12} /> {fmt.t('scaffold.calc.unstable', { names: failed.map((c) => c.name).join(', ') })}
            </p>
          )}
          {res.unstable.length > 0 && (
            <button
              type="button"
              className="flex items-start gap-1 text-start text-xs font-medium text-red-600 underline dark:text-red-400"
              onClick={() => sc.select(res.unstable)}
              data-testid="scaffold-calc-mechanism"
            >
              <IconAlert className="mt-0.5 shrink-0" width={12} height={12} /> {fmt.t('scaffold.calc.mechanismParts', { n: res.unstable.length })}
            </button>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-slate-700">
                  <th className="px-1.5 py-1 text-start font-medium">{fmt.t('scaffold.calc.combo')}</th>
                  <th className="px-1.5 py-1 text-end font-medium">{fmt.t('scaffold.calc.iter')}</th>
                  <th className="px-1.5 py-1 text-end font-medium">{fmt.t('scaffold.calc.dh')}</th>
                  <th className="px-1.5 py-1 text-end font-medium">{fmt.t('scaffold.calc.dv')}</th>
                  <th className="px-1.5 py-1 text-end font-medium">ΣV</th>
                  <th className="px-1.5 py-1 text-start font-medium" />
                </tr>
              </thead>
              <tbody>
                {res.combos.map((c) => (
                  <tr key={c.name} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-1.5 py-0.5 font-semibold">{c.name}</td>
                    <td className="num px-1.5 py-0.5 text-end">{c.ok ? c.iterations : '–'}</td>
                    <td className="num px-1.5 py-0.5 text-end">{c.ok ? fmt.q(c.dh, 'deflection', 1) : '–'}</td>
                    <td className="num px-1.5 py-0.5 text-end">{c.ok ? fmt.q(c.dv, 'deflection', 1) : '–'}</td>
                    <td className="num px-1.5 py-0.5 text-end">{c.ok ? fmt.q(c.sumV, 'force', 1) : '–'}</td>
                    <td className="px-1.5 py-0.5 text-[11px]">
                      {!c.ok ? (
                        <span className="text-red-600">{fmt.t('scaffold.calc.mechanism')}</span>
                      ) : !c.converged ? (
                        <span className="text-amber-700">{fmt.t('scaffold.calc.notConverged')}</span>
                      ) : c.stability ? (
                        <button type="button" className="text-start font-medium text-red-600 underline" onClick={() => sc.select(c.stability!)} data-testid="scaffold-calc-stability">
                          {fmt.t('scaffold.calc.stabilityLost', { n: c.stability.length })}
                        </button>
                      ) : c.noLift ? (
                        <span className="text-amber-700">{fmt.t('scaffold.calc.noLift')}</span>
                      ) : (
                        ''
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-slate-500">{fmt.t('scaffold.calc.comboLegend')}</p>
          </div>

          <div>
            <div className="mb-1 flex flex-wrap items-center gap-1 text-[11px]">
              <button type="button" onClick={() => setFilter('all')} className={cx('rounded-full border px-2 py-0.5', filter === 'all' ? 'border-accent-600 bg-accent-600 text-white' : 'border-slate-300 dark:border-slate-600')}>
                {fmt.t('scaffold.calc.allChecks')}
              </button>
              {CHECKS.filter((k) => counts.has(k)).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  data-testid={`scaffold-calc-filter-${k}`}
                  className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5', filter === k ? 'border-accent-600 bg-accent-600 text-white' : 'border-slate-300 dark:border-slate-600')}
                >
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: etaColor(counts.get(k)!.max) }} />
                  {fmt.t(`scaffold.calc.check.${k}`)} · {fmt.num(counts.get(k)!.max * 100, 0)} %
                </button>
              ))}
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white dark:bg-slate-900">
                  <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-slate-700">
                    <th className="px-1.5 py-1 text-start font-medium">{fmt.t('scaffold.calc.part')}</th>
                    <th className="px-1.5 py-1 text-start font-medium">{fmt.t('scaffold.calc.checkCol')}</th>
                    <th className="px-1.5 py-1 text-end font-medium">η</th>
                    <th className="px-1.5 py-1 text-start font-medium">{fmt.t('scaffold.calc.combo')}</th>
                    <th className="px-1.5 py-1 text-end font-medium">N</th>
                    <th className="px-1.5 py-1 text-end font-medium">M</th>
                    <th className="px-1.5 py-1 text-end font-medium">V</th>
                    <th className="px-1.5 py-1 text-start font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c, k) => (
                    <tr
                      key={k}
                      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                      onClick={() => sc.select([c.part])}
                      data-testid={k === 0 ? 'scaffold-calc-row' : undefined}
                    >
                      <td className="px-1.5 py-0.5">{byId.get(c.part)?.part.name ?? c.part}</td>
                      <td className="px-1.5 py-0.5">{fmt.t(`scaffold.calc.check.${c.check}`)}</td>
                      <td className="num px-1.5 py-0.5 text-end font-semibold" style={{ color: etaColor(c.eta) }}>
                        {fmt.num(c.eta * 100, 0)} %
                      </td>
                      <td className="px-1.5 py-0.5">{c.combo}</td>
                      <td className="num px-1.5 py-0.5 text-end">{c.N !== undefined ? fmt.q(c.N, 'force', 1) : ''}</td>
                      <td className="num px-1.5 py-0.5 text-end">{c.M !== undefined ? fmt.q(c.M, 'moment', 2) : ''}</td>
                      <td className="num px-1.5 py-0.5 text-end">{c.V !== undefined ? fmt.q(c.V, 'force', 1) : ''}</td>
                      <td className="px-1.5 py-0.5 text-[11px] text-slate-500">{c.detail ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > shown.length && (
              <button type="button" className="mt-1 text-xs text-accent-700 underline dark:text-accent-300" onClick={() => setShowAll(true)}>
                {fmt.t('scaffold.calc.showAll', { n: rows.length })}
              </button>
            )}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div data-testid="scaffold-calc-bases">
              <p className="mb-1 text-xs font-semibold">{fmt.t('scaffold.calc.bases', { n: res.bases.length })}</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {fmt.t('scaffold.calc.basesMax', { v: fmt.q(res.bases.reduce((m, b) => Math.max(m, b.Vmax), 0), 'force', 1), h: fmt.q(res.bases.reduce((m, b) => Math.max(m, b.H), 0), 'force', 1) })}
              </p>
              {uplift > 0 && (
                <button
                  type="button"
                  className="mt-1 flex items-start gap-1 text-start text-xs font-medium text-red-600 underline dark:text-red-400"
                  onClick={() => sc.select(res.bases.filter((b) => b.Vmin < -LIFT_TOL).map((b) => b.part))}
                >
                  <IconAlert className="mt-0.5 shrink-0" width={12} height={12} /> {fmt.t('scaffold.calc.uplift', { n: uplift })}
                </button>
              )}
              {lifted.length > 0 && (
                <button type="button" className="mt-1 flex items-start gap-1 text-start text-xs text-slate-600 underline dark:text-slate-300" onClick={() => sc.select(lifted.map((b) => b.part))} data-testid="scaffold-calc-lifted">
                  <IconInfo className="mt-0.5 shrink-0" width={12} height={12} /> {fmt.t('scaffold.calc.lifted', { n: lifted.length })}
                </button>
              )}
            </div>
            {(res.fixings ?? []).length > 0 && (
              <div data-testid="scaffold-calc-fixings">
                <p className="mb-1 text-xs font-semibold">{fmt.t('scaffold.fix.results', { n: res.fixings.length })}</p>
                <div className="max-h-40 overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-slate-700">
                        <th className="px-1.5 py-0.5 text-start font-medium">{fmt.t('scaffold.fix.name')}</th>
                        <th className="px-1.5 py-0.5 text-end font-medium">Fx</th>
                        <th className="px-1.5 py-0.5 text-end font-medium">Fy</th>
                        <th className="px-1.5 py-0.5 text-end font-medium">Fz</th>
                        <th className="px-1.5 py-0.5 text-end font-medium">|F|</th>
                        <th className="px-1.5 py-0.5 text-end font-medium">η</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...res.fixings]
                        .sort((a, b) => b.F - a.F)
                        .map((f) => (
                          <tr key={`${f.id}|${f.part}`} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60" onClick={() => sc.select([f.part])} title={f.combo}>
                            <td className="px-1.5 py-0.5">{sc.fixings.find((x) => x.id === f.id)?.name ?? f.id}</td>
                            {f.R.map((v, i) => (
                              <td key={i} className="num px-1.5 py-0.5 text-end">
                                {fmt.q(v, 'force', 2)}
                              </td>
                            ))}
                            <td className="num px-1.5 py-0.5 text-end font-semibold">{fmt.q(f.F, 'force', 2)}</td>
                            <td className="num px-1.5 py-0.5 text-end font-semibold" style={f.eta !== undefined ? { color: etaColor(f.eta) } : undefined}>
                              {f.eta !== undefined ? `${fmt.num(f.eta * 100, 0)} %` : '–'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {res.anchors.length > 0 && (
              <div data-testid="scaffold-calc-anchors">
                <p className="mb-1 text-xs font-semibold">{fmt.t('scaffold.calc.anchors', { n: res.anchors.length })}</p>
                <div className="max-h-40 overflow-auto">
                  <table className="w-full text-xs">
                    <tbody>
                      {[...res.anchors]
                        .sort((a, b) => b.eta - a.eta)
                        .map((a) => (
                          <tr key={a.part} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60" onClick={() => sc.select([a.part])}>
                            <td className="px-1.5 py-0.5">{byId.get(a.part)?.part.name}</td>
                            <td className="num px-1.5 py-0.5 text-end">
                              {fmt.q(a.Nmin, 'force', 1)} … {fmt.q(a.Nmax, 'force', 1)}
                            </td>
                            <td className="num px-1.5 py-0.5 text-end font-semibold" style={{ color: etaColor(a.eta) }}>
                              {fmt.num(a.eta * 100, 0)} %
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {beams.length > 0 && (
            <div data-testid="scaffold-calc-beams">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">{fmt.t('scaffold.beams.title', { n: beams.length })}</p>
                <Button size="sm" variant="primary" onClick={() => openBeams(beams[0].key)} data-testid="scaffold-beams-open-all">
                  {fmt.t('scaffold.beams.openAll')} <IconChevronRight />
                </Button>
              </div>
              <div className="max-h-56 overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-slate-700">
                      <th className="px-1.5 py-1 text-start font-medium">{fmt.t('scaffold.girders.col.key')}</th>
                      <th className="px-1.5 py-1 text-start font-medium">{fmt.t('scaffold.beams.beam')}</th>
                      <th className="px-1.5 py-1 text-end font-medium">{fmt.t('scaffold.beams.loads')}</th>
                      <th className="px-1.5 py-1 text-end font-medium">ΣF_d</th>
                      <th className="px-1.5 py-1 text-end font-medium">η</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {beams.map((b, k) => (
                      <tr key={b.key} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60" onClick={() => sc.select([res!.beams[k].part])}>
                        <td className="px-1.5 py-0.5 font-semibold">{b.key}</td>
                        <td className="px-1.5 py-0.5">
                          {b.designation}
                          {b.warnings.some((w) => w.key === 'beamSupports') && <span className="ms-1 text-amber-600">({fmt.t('scaffold.girders.assumed')})</span>}
                        </td>
                        <td className="num px-1.5 py-0.5 text-end">{b.loads}</td>
                        <td className="num px-1.5 py-0.5 text-end">{fmt.q(b.sum, 'force', 1)}</td>
                        <td className="num px-1.5 py-0.5 text-end font-semibold" style={{ color: beamSums[k].state === 'error' ? '#94a3b8' : etaColor(beamSums[k].eta) }}>
                          {beamSums[k].state === 'error' ? '–' : `${fmt.num(beamSums[k].eta * 100, 0)} %`}
                        </td>
                        <td className="px-1.5 py-0.5 text-end">
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openBeams(b.key);
                            }}
                            data-testid={`scaffold-beam-open-${b.key}`}
                          >
                            {fmt.t('scaffold.girders.open')} <IconChevronRight />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{fmt.t('scaffold.beams.hint')}</p>
            </div>
          )}

          {(run.defects ?? []).length > 0 && (
            <div data-testid="scaffold-calc-defects" className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              <p className="font-semibold">{fmt.t('scaffold.calc.defects.title')}</p>
              {run.defects.map((d) => (
                <button key={d.key} type="button" className="flex items-start gap-1 text-start underline" onClick={() => sc.select(d.parts)}>
                  <IconAlert className="mt-0.5 shrink-0" width={12} height={12} /> {fmt.t(`scaffold.calc.defects.${d.key}`, { n: d.parts.length })}
                </button>
              ))}
            </div>
          )}
          <div data-testid="scaffold-calc-audit" className="text-xs">
            <p className="mb-0.5 font-semibold">{fmt.t('scaffold.calc.audit.title')}</p>
            <p className="text-slate-600 dark:text-slate-300">
              {fmt.t('scaffold.calc.audit.summary', { n: run.audit.total })}{' '}
              {PART_FATES.filter((f) => run.audit.counts[f] > 0)
                .map((f) => fmt.t(`scaffold.calc.audit.${f}`, { n: run.audit.counts[f] }))
                .join(' · ')}
            </p>
            {run.audit.listed.length > 0 ? (
              <ul className="mt-0.5 space-y-0.5">
                {run.audit.listed.map((x) => (
                  <li key={x.fate + x.name}>
                    <button
                      type="button"
                      data-testid="scaffold-calc-audit-none"
                      aria-pressed={sc.selected === x.parts}
                      className={cx(
                        'flex items-start gap-1.5 rounded px-1 text-start',
                        x.fate === 'noWeight' ? 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800' : 'text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40',
                        sc.selected === x.parts && 'bg-fuchsia-100 ring-1 ring-fuchsia-400 dark:bg-fuchsia-900/40',
                      )}
                      onClick={() => (sc.selected === x.parts ? sc.select([]) : sc.select(x.parts))}
                    >
                      {x.fate === 'noWeight' ? <IconInfo className="mt-0.5 shrink-0" width={12} height={12} /> : <IconAlert className="mt-0.5 shrink-0" width={12} height={12} />} {fmt.t(`scaffold.calc.audit.list.${x.fate}`, { n: x.parts.length, name: x.name })}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <IconCheck width={12} height={12} /> {fmt.t('scaffold.calc.audit.complete')}
              </p>
            )}
          </div>
          {run.notes.length > 0 && (
            <div data-testid="scaffold-calc-notes">
              <p className="mb-1 text-xs font-semibold">{fmt.t('scaffold.calc.notes')}</p>
              <ul className="space-y-0.5">
                {run.notes.map((n) => (
                  <li key={n.key}>
                    <button
                      type="button"
                      aria-pressed={sc.selected === n.parts}
                      className={cx(
                        'flex items-start gap-1.5 rounded px-1 text-start text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                        sc.selected === n.parts && 'bg-fuchsia-100 ring-1 ring-fuchsia-400 hover:bg-fuchsia-100 dark:bg-fuchsia-900/40',
                      )}
                      onClick={() => (sc.selected === n.parts ? sc.select([]) : sc.select(n.parts))}
                    >
                      <IconInfo className="mt-0.5 shrink-0" width={12} height={12} /> {fmt.t(`scaffold.calc.note.${n.key}`, { ...n.params, n: n.parts.length })}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{fmt.t('scaffold.calc.basis')}</p>
          </div>
        </details>
      )}
    </Card>
  );
}
