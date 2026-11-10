import { useMemo, useState } from 'react';
import { siteWind, useScaffold } from '../../scaffold/store';
import type { ScaffoldStructure } from '../../scaffold/structure';
import { LOAD_CLASSES } from '../../scaffold/catalog';
import { buildScaffoldModel, type ModelNote } from '../../scaffold/model';
import { analyzeScaffoldModelAsync, type CheckKind, type ScaffoldResult } from '../../scaffold/analysis';
import { Button, Card, NumberField, SelectField, cx } from '../common';
import { useFmt } from '../hooks';
import { useStore } from '../../state/store';
import { batchFromImport } from '../../state/batch';
import { scaffoldBeam } from '../../scaffold/beams';
import { beamSummary } from '../batch/summary';
import { IconAlert, IconCheck, IconChevronRight, IconInfo } from '../icons';

export interface ScaffoldRun {
  result: ScaffoldResult;
  notes: ModelNote[];
  levels: { z: number; area: number }[];
  sig: string;
  ms: number;
}

export function etaColor(eta: number): string {
  if (!(eta >= 0)) return '#94a3b8';
  if (eta > 1) return '#dc2626';
  if (eta > 0.9) return '#f59e0b';
  if (eta > 0.6) return '#84cc16';
  return '#16a34a';
}

const CHECKS: CheckKind[] = ['conn', 'node', 'tube', 'buckling', 'joint', 'ledger', 'diagonal', 'anchor', 'coupler', 'uplift'];

/** Options, start and results of the space frame analysis of the scaffold */
export function AnalysisCard({ st, run, setRun }: { st: ScaffoldStructure; run: ScaffoldRun | null; setRun: (r: ScaffoldRun | null) => void }) {
  const fmt = useFmt();
  const sc = useScaffold();
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CheckKind | 'all'>('all');
  const [showAll, setShowAll] = useState(false);
  const outdoor = sc.exposure === 'outdoor';
  const p = (LOAD_CLASSES[sc.loadClass] ?? 2) * 1e3;
  const wind = siteWind(sc, Math.max(st.max[2] - st.min[2], 1));
  const sig = JSON.stringify([sc.doc?.fileName, st.parts.length, sc.tol, p, sc.level, outdoor, Math.round(wind.qMax), sc.snow && sc.snowLoad, sc.ice && sc.iceThickness, sc.secondOrder]);
  const stale = !!run && run.sig !== sig;
  const byId = useMemo(() => new Map(st.parts.map((w) => [w.part.id, w])), [st]);
  const levels = useMemo(() => {
    // deck levels as in the model (clusters of deck heights)
    const out: { z: number; area: number }[] = [];
    for (const w of st.parts) {
      if (w.cls.kind !== 'deck') continue;
      const z = w.min[2];
      let l = out.find((x) => Math.abs(x.z - z) < 0.3);
      if (!l) out.push((l = { z, area: 0 }));
      l.area += (w.max[0] - w.min[0]) * (w.max[1] - w.min[1]);
    }
    return out;
  }, [st]);

  const start = async () => {
    setBusy({ done: 0, total: 1 });
    setError(null);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const t0 = performance.now();
      const model = buildScaffoldModel(st);
      const result = await analyzeScaffoldModelAsync(
        model,
        {
          p,
          loadClass: sc.loadClass,
          level: sc.level,
          outdoor,
          qWork: 200,
          qMax: wind.qMax,
          cf: 1.3,
          snow: outdoor && sc.snow ? sc.snowLoad : 0,
          ice: outdoor && sc.ice ? sc.iceThickness : 0,
          secondOrder: sc.secondOrder,
        },
        (done, total) => setBusy({ done, total }),
      );
      setRun({ result, notes: model.notes, levels: model.levels, sig, ms: performance.now() - t0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRun(null);
    }
    setBusy(null);
  };

  const res = run?.result;
  const failed = res?.combos.filter((c) => !c.ok) ?? [];
  const maxEta = res ? Math.max(0, ...res.checks.map((c) => c.eta)) : 0;
  const rows = res ? res.checks.filter((c) => filter === 'all' || c.check === filter) : [];
  const shown = showAll ? rows.slice(0, 400) : rows.slice(0, 25);
  const counts = new Map<CheckKind, { n: number; max: number }>();
  for (const c of res?.checks ?? []) {
    const o = counts.get(c.check) ?? { n: 0, max: 0 };
    o.n++;
    o.max = Math.max(o.max, c.eta);
    counts.set(c.check, o);
  }
  const uplift = res?.bases.filter((b) => b.Vmin < 0).length ?? 0;
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
      title={fmt.t('scaffold.calc.title')}
      testId="scaffold-calc"
      actions={
        <Button variant="primary" size="sm" onClick={() => void start()} disabled={!!busy} data-testid="scaffold-calc-run">
          {busy ? fmt.t('scaffold.calc.running', { done: busy.done, total: busy.total }) : fmt.t(run ? 'scaffold.calc.rerun' : 'scaffold.calc.run')}
        </Button>
      }
    >
      <p className="mb-2 text-xs text-slate-600 dark:text-slate-300">{fmt.t('scaffold.calc.intro')}</p>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <SelectField
          label={fmt.t('scaffold.calc.level')}
          value={String(sc.level)}
          testId="scaffold-calc-level"
          options={[
            { value: '-1', label: fmt.t('scaffold.calc.levelAuto') },
            ...levels.map((l, k) => ({ value: String(k), label: fmt.t('scaffold.calc.levelOption', { z: fmt.q(l.z, 'length'), a: fmt.num(l.area, 1) }) })),
          ]}
          onChange={(v) => sc.setOpts({ level: Number(v) })}
        />
        {outdoor && sc.snow && <NumberField label={fmt.t('scaffold.calc.snowLoad')} q="areaLoad" showUnit value={sc.snowLoad} onChange={(v) => sc.setOpts({ snowLoad: Math.max(0, v) })} />}
        {outdoor && sc.ice && <NumberField label={fmt.t('scaffold.calc.ice')} q="sectionDim" showUnit value={sc.iceThickness} onChange={(v) => sc.setOpts({ iceThickness: Math.max(0, v) })} />}
        <label className="flex items-end gap-2 pb-1 text-xs">
          <input type="checkbox" checked={sc.secondOrder} onChange={(e) => sc.setOpts({ secondOrder: e.target.checked })} data-testid="scaffold-calc-second" />
          {fmt.t('scaffold.calc.secondOrder')}
        </label>
      </div>
      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{fmt.t(outdoor ? (wind.qMax > 0 ? 'scaffold.calc.combosOutdoor' : 'scaffold.calc.combosNoMax') : 'scaffold.calc.combosIndoor', { q: fmt.q(wind.qMax, 'areaLoad') })}</p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {res && (
        <div className={cx('mt-3 space-y-3', stale && 'opacity-60')} data-testid="scaffold-calc-result">
          {stale && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{fmt.t('scaffold.calc.stale')}</p>}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1 rounded px-2 py-1 font-semibold text-white" style={{ background: failed.length ? '#dc2626' : etaColor(maxEta) }} data-testid="scaffold-calc-max">
              {failed.length || maxEta > 1 ? <IconAlert /> : <IconCheck />} max η = {fmt.num(maxEta * 100, 0)} %
            </span>
            <span className="text-xs text-slate-600 dark:text-slate-300">
              {fmt.t('scaffold.calc.summary', {
                g: fmt.q(res.totalG, 'force', 1),
                q: fmt.q(res.totalQ, 'force', 1),
                z: fmt.q(run.levels[res.level]?.z ?? 0, 'length'),
                n: res.unknowns,
                s: fmt.num(run.ms / 1000, 1),
              })}
            </span>
          </div>
          {failed.length > 0 && (
            <p className="flex items-start gap-1 text-xs font-medium text-red-600 dark:text-red-400" data-testid="scaffold-calc-failed">
              <IconAlert className="mt-0.5 shrink-0" width={12} height={12} /> {fmt.t('scaffold.calc.unstable', { names: failed.map((c) => c.name).join(', ') })}
            </p>
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
                {fmt.t('scaffold.calc.basesMax', { v: fmt.q(Math.max(0, ...res.bases.map((b) => b.Vmax)), 'force', 1), h: fmt.q(Math.max(0, ...res.bases.map((b) => b.H)), 'force', 1) })}
              </p>
              {uplift > 0 && (
                <button
                  type="button"
                  className="mt-1 flex items-start gap-1 text-start text-xs font-medium text-red-600 underline dark:text-red-400"
                  onClick={() => sc.select(res.bases.filter((b) => b.Vmin < 0).map((b) => b.part))}
                >
                  <IconAlert className="mt-0.5 shrink-0" width={12} height={12} /> {fmt.t('scaffold.calc.uplift', { n: uplift })}
                </button>
              )}
            </div>
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

          {run.notes.length > 0 && (
            <div data-testid="scaffold-calc-notes">
              <p className="mb-1 text-xs font-semibold">{fmt.t('scaffold.calc.notes')}</p>
              <ul className="space-y-0.5">
                {run.notes.map((n) => (
                  <li key={n.key}>
                    <button type="button" className="flex items-start gap-1.5 rounded px-1 text-start text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => sc.select(n.parts)}>
                      <IconInfo className="mt-0.5 shrink-0" width={12} height={12} /> {fmt.t(`scaffold.calc.note.${n.key}`, { ...n.params, n: n.parts.length })}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{fmt.t('scaffold.calc.basis')}</p>
        </div>
      )}
    </Card>
  );
}
