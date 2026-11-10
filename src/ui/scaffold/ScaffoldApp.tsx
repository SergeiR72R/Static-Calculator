import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useStore } from '../../state/store';
import { useScaffold } from '../../scaffold/store';
import { analyzeScaffold, girderBeamModel, girderDesignation, type Girder, type ScaffoldIssue, type ScaffoldStructure } from '../../scaffold/structure';
import { KIND_COLOR, LOAD_CLASSES, PART_KINDS, type PartKind } from '../../scaffold/catalog';
import { batchFromImport } from '../../state/batch';
import { beamSummary, type BeamSummary } from '../batch/summary';
import { warningText } from '../batch/BatchPanel';
import { Button, Card, NumberField, SelectField, cx } from '../common';
import { useFmt, type Fmt } from '../hooks';
import { IconAlert, IconChevronRight, IconInfo, IconPrint, IconUpload, IconX } from '../icons';
import { openDxfFile } from './openDxf';
import { SiteCard } from './SiteCard';
import { AnalysisCard, etaColor as partEtaColor, type ScaffoldRun } from './AnalysisCard';
import { ScaffoldReport } from './ScaffoldReport';

const Scaffold3D = lazy(() => import('./Scaffold3D'));

function etaColor(s: BeamSummary): string {
  if (s.state === 'error') return '#94a3b8';
  if (s.state === 'fail') return '#dc2626';
  if (s.eta > 0.9) return '#f59e0b';
  return '#16a34a';
}

function signature(name: string, n: number, o: { loadClass: number; g: number; tol: number }) {
  return `${name}|${n}|${o.loadClass}|${o.g}|${o.tol}`;
}

/** File chooser + drag & drop of a PERI CAD DXF */
function DropZone({ big }: { big?: boolean }) {
  const fmt = useFmt();
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const open = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    // let the spinner paint before the synchronous parse
    await new Promise((r) => setTimeout(r, 30));
    await openDxfFile(f);
    setBusy(false);
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void open(e.dataTransfer.files[0]);
      }}
      className={cx(
        'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-center transition-colors',
        big ? 'px-6 py-12' : 'px-3 py-4',
        over ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/30' : 'border-slate-300 dark:border-slate-700',
      )}
      data-testid="scaffold-drop"
    >
      {big && <IconUpload width={40} height={40} className="text-accent-700 dark:text-accent-300" />}
      {big && <p className="text-lg font-semibold">{fmt.t('scaffold.drop.title')}</p>}
      <p className="text-sm text-slate-600 dark:text-slate-300">{fmt.t('scaffold.drop.hint')}</p>
      <Button variant="primary" onClick={() => ref.current?.click()} disabled={busy} data-testid="scaffold-open">
        <IconUpload /> {busy ? fmt.t('scaffold.loading') : fmt.t('scaffold.open')}
      </Button>
      <input
        ref={ref}
        type="file"
        accept=".dxf,.dwg"
        className="hidden"
        data-testid="scaffold-file"
        onChange={(e) => {
          void open(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function Welcome() {
  const fmt = useFmt();
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8" data-testid="scaffold-welcome">
      <div>
        <h2 className="text-xl font-bold text-accent-700 dark:text-accent-200">{fmt.t('scaffold.title')}</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{fmt.t('scaffold.intro')}</p>
      </div>
      <DropZone big />
      <div className="grid gap-3 md:grid-cols-2">
        <Card title={fmt.t('scaffold.drop.stepsTitle')}>
          <ol className="list-decimal space-y-1 ps-5 text-sm">
            <li>{fmt.t('scaffold.drop.step1')}</li>
            <li>{fmt.t('scaffold.drop.step2')}</li>
            <li>{fmt.t('scaffold.drop.step3')}</li>
          </ol>
          <p className="mt-2 text-xs text-slate-500">{fmt.t('scaffold.drop.dwgNote')}</p>
        </Card>
        <Card title={fmt.t('scaffold.drop.whatTitle')}>
          <ul className="list-disc space-y-1 ps-5 text-sm">
            <li>{fmt.t('scaffold.drop.what1')}</li>
            <li>{fmt.t('scaffold.drop.what2')}</li>
            <li>{fmt.t('scaffold.drop.what3')}</li>
            <li>{fmt.t('scaffold.drop.what4')}</li>
          </ul>
          <p className="mt-2 text-xs text-slate-500">{fmt.t('scaffold.next')}</p>
        </Card>
      </div>
    </div>
  );
}

function issueText(fmt: Fmt, i: ScaffoldIssue) {
  return fmt.t(`scaffold.issue.${i.key}`, i.params);
}

/** open the girders of the drawing as a beam list in the beam calculator */
function openInBeam(fmt: Fmt, st: ScaffoldStructure, models: { g: Girder; m: ReturnType<typeof girderBeamModel> }[], key: string) {
  const sc = useScaffold.getState();
  const app = useStore.getState();
  if (!sc.doc) return;
  const sig = signature(sc.doc.fileName, sc.doc.parts.length, sc);
  if (sc.batchRef && app.batch?.id === sc.batchRef.id && sc.batchRef.sig === sig) {
    const it = app.batch.items.find((i) => i.key === key);
    if (it) app.switchBeam(it.id);
    app.setPrefs({ appMode: 'beam' });
    return;
  }
  const ours = !!sc.batchRef && app.batch?.id === sc.batchRef.id;
  if (!ours && !window.confirm(fmt.t('scaffold.girders.replaceConfirm'))) return;
  const beams = models.map(({ g, m }) => ({ key: g.key, designation: girderDesignation(g), model: m, warnings: g.warnings }));
  const { batch, images } = batchFromImport(sc.doc.fileName.replace(/\.dxf$/i, ''), beams);
  const it = batch.items.find((i) => i.key === key);
  if (it) batch.active = it.id;
  app.loadBatch(batch, images);
  sc.setBatchRef({ id: batch.id, sig });
  app.setPrefs({ appMode: 'beam' });
  app.showToast('scaffold.girders.opened', { n: st.girders.length });
}

export default function ScaffoldApp() {
  const fmt = useFmt();
  const sc = useScaffold();
  const [resetKey, setResetKey] = useState(0);
  const [hidden, setHidden] = useState<Set<PartKind>>(new Set());
  const [run, setRun] = useState<ScaffoldRun | null>(null);
  const [byEta, setByEta] = useState(true);
  // the report is only rendered while printing
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
  const doc = sc.doc;
  const st = useMemo(() => (doc ? analyzeScaffold(doc, { tol: sc.tol }) : null), [doc, sc.tol]);
  const p = (LOAD_CLASSES[sc.loadClass] ?? 2) * 1e3;
  const models = useMemo(() => (st && doc ? st.girders.map((g) => ({ g, m: girderBeamModel(g, { p, g: sc.g }, doc.fileName) })) : []), [st, doc, p, sc.g]);
  const sums = useMemo(() => models.map(({ m }) => beamSummary(m)), [models]);
  const girderColor = useMemo(() => Object.fromEntries(models.map(({ g }, k) => [g.key, etaColor(sums[k])])), [models, sums]);
  const shown = useMemo(() => (st ? { ...st, parts: st.parts.filter((w) => !hidden.has(w.cls.kind)) } : null), [st, hidden]);

  const partColor = useMemo(() => (run && byEta ? Object.fromEntries(Object.entries(run.result.eta).map(([id, e]) => [id, partEtaColor(e)])) : null), [run, byEta]);
  // a new drawing: the results of the old one are gone
  const docRef = useRef(doc);
  if (docRef.current !== doc) {
    docRef.current = doc;
    if (run) setRun(null);
  }

  if (!doc || !st || !shown) return <Welcome />;

  const partGirder = new Map<string, Girder>();
  for (const g of st.girders) for (const id of g.parts) partGirder.set(id, g);
  const byId = new Map(st.parts.map((w) => [w.part.id, w]));
  const moved = st.moves.map((m) => m.id);
  const describe = (id: string) => {
    const w = byId.get(id);
    if (!w) return '';
    const g = partGirder.get(id);
    const k = g ? st.girders.indexOf(g) : -1;
    const mv = st.moves.find((m) => m.id === id);
    return [
      `${w.part.name} · ${fmt.t('scaffold.bom.article')} ${w.part.article}`,
      g ? `${g.key} ${girderDesignation(g)} · η = ${fmt.num(sums[k].eta * 100, 0)} %` : '',
      mv ? fmt.t('scaffold.movedBy', { d: fmt.num(Math.hypot(...mv.d) * 1000, 0) }) : '',
      run && run.result.eta[id] !== undefined ? `η = ${fmt.num(run.result.eta[id] * 100, 0)} %` : '',
    ]
      .filter(Boolean)
      .join(' — ');
  };
  const pick = (id: string | null) => {
    if (!id) return sc.select([]);
    const g = partGirder.get(id);
    if (g) sc.select(g.parts, g.key);
    else sc.select([id]);
  };
  const kinds = PART_KINDS.filter((k) => st.parts.some((w) => w.cls.kind === k));
  const selPart = sc.selected.length === 1 && !sc.girder ? byId.get(sc.selected[0]) : undefined;
  const warnings = st.issues.filter((i) => i.severity === 'warning').length;

  return (
    <>
    <main className="no-print grid flex-1 grid-cols-1 md:grid-cols-[minmax(300px,380px)_1fr]" data-testid="scaffold-app">
      <aside className="space-y-3 border-e border-slate-200 bg-slate-100/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">
        <Card
          title={fmt.t('scaffold.file.title')}
          actions={
            <button
              type="button"
              className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              title={fmt.t('scaffold.close')}
              aria-label={fmt.t('scaffold.close')}
              data-testid="scaffold-close"
              onClick={() => window.confirm(fmt.t('scaffold.closeConfirm')) && sc.setDoc(null)}
            >
              <IconX />
            </button>
          }
        >
          <p className="truncate text-sm font-semibold" title={doc.fileName} data-testid="scaffold-file-name">
            {doc.fileName || '–'}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300" data-testid="scaffold-summary">
            {fmt.t('scaffold.file.summary', { n: st.parts.length, types: st.bom.length, girders: st.girders.length })}
          </p>
          <div className="mt-2">
            <DropZone />
          </div>
          <Button size="sm" className="mt-2 w-full justify-center" onClick={() => setTimeout(() => window.print(), 50)} data-testid="scaffold-print">
            <IconPrint /> {fmt.t('scaffold.report.button')}
          </Button>
          <p className="mt-1 text-[11px] text-slate-500">{fmt.t(run ? 'scaffold.report.hint' : 'scaffold.report.hintNoRun')}</p>
        </Card>

        <SiteCard height={Math.max(st.max[2] - st.min[2], 1)} />

        <Card title={fmt.t('scaffold.loads.title')}>
          <div className="grid grid-cols-1 gap-2">
            <SelectField
              label={fmt.t('scaffold.loads.class')}
              value={String(sc.loadClass)}
              testId="scaffold-load-class"
              options={Object.entries(LOAD_CLASSES).map(([k, v]) => ({ value: k, label: fmt.t('scaffold.loads.classOption', { n: k, p: fmt.q(v * 1e3, 'areaLoad') }) }))}
              onChange={(v) => sc.setOpts({ loadClass: Number(v) })}
            />
            <NumberField label={fmt.t('scaffold.loads.g')} q="areaLoad" showUnit value={sc.g} onChange={(v) => sc.setOpts({ g: Math.max(0, v) })} testId="scaffold-load-g" />
          </div>
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{fmt.t('scaffold.loads.hint')}</p>
        </Card>

        <Card title={fmt.t('scaffold.heal.title')}>
          <NumberField label={fmt.t('scaffold.heal.tol')} q="sectionDim" showUnit value={sc.tol} onChange={(v) => sc.setOpts({ tol: Math.min(Math.max(0, v), 0.2) })} testId="scaffold-tol" />
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{fmt.t('scaffold.heal.hint')}</p>
          {st.moves.length > 0 && (
            <button type="button" className="mt-2 text-xs font-medium text-rose-700 underline dark:text-rose-400" onClick={() => sc.select(moved)} data-testid="scaffold-show-moved">
              {fmt.t('scaffold.heal.show', { n: st.moves.length })}
            </button>
          )}
        </Card>

        <Card title={<span>{fmt.t('scaffold.issues.title')} {warnings > 0 && <span className="ms-1 rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{warnings}</span>}</span>} testId="scaffold-issues">
          {!st.issues.length && <p className="text-xs text-slate-500">{fmt.t('scaffold.issues.none')}</p>}
          <ul className="space-y-1">
            {st.issues.map((i, k) => (
              <li key={k}>
                <button
                  type="button"
                  disabled={!i.parts.length}
                  onClick={() => sc.select(i.parts)}
                  className={cx(
                    'flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-start text-xs enabled:hover:bg-slate-100 dark:enabled:hover:bg-slate-800',
                    i.severity === 'warning' ? 'text-amber-800 dark:text-amber-300' : 'text-slate-600 dark:text-slate-300',
                  )}
                  data-testid={`scaffold-issue-${i.key}`}
                >
                  {i.severity === 'warning' ? <IconAlert className="mt-0.5 shrink-0" width={12} height={12} /> : <IconInfo className="mt-0.5 shrink-0" width={12} height={12} />}
                  <span>{issueText(fmt, i)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </aside>

      <section className="min-w-0 space-y-3 p-3">
        <Card
          title={fmt.t('scaffold.view.title')}
          testId="scaffold-view"
          actions={
            <Button size="sm" onClick={() => setResetKey((k) => k + 1)}>
              {fmt.t('view3d.reset')}
            </Button>
          }
        >
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            {kinds.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setHidden((h) => (h.has(k) ? new Set([...h].filter((x) => x !== k)) : new Set([...h, k])))}
                className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5', hidden.has(k) ? 'border-slate-200 opacity-40 dark:border-slate-700' : 'border-slate-300 dark:border-slate-600')}
                aria-pressed={!hidden.has(k)}
                title={fmt.t('scaffold.view.toggle')}
                data-testid={`scaffold-kind-${k}`}
              >
                <span className="inline-block h-2 w-3 rounded-sm" style={{ background: KIND_COLOR[k] }} />
                {fmt.t(`scaffold.kind.${k}`)}
              </button>
            ))}
            {st.girders.length > 0 && (
              <span className="inline-flex items-center gap-1 text-slate-500">
                · {fmt.t('scaffold.view.girderColors')}
                <span className="inline-block h-2 w-3 rounded-sm bg-[#16a34a]" />≤ 90 %
                <span className="inline-block h-2 w-3 rounded-sm bg-[#f59e0b]" />≤ 100 %
                <span className="inline-block h-2 w-3 rounded-sm bg-[#dc2626]" />&gt; 100 %
              </span>
            )}
          </div>
          {run && (
            <label className="mb-1 flex items-center gap-2 text-xs" data-testid="scaffold-color-eta">
              <input type="checkbox" checked={byEta} onChange={(e) => setByEta(e.target.checked)} />
              {fmt.t('scaffold.view.byEta')}
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <span className="inline-block h-2 w-3 rounded-sm bg-[#16a34a]" />≤ 60 %
                <span className="inline-block h-2 w-3 rounded-sm bg-[#84cc16]" />≤ 90 %
                <span className="inline-block h-2 w-3 rounded-sm bg-[#f59e0b]" />≤ 100 %
                <span className="inline-block h-2 w-3 rounded-sm bg-[#dc2626]" />&gt; 100 %
              </span>
            </label>
          )}
          <Suspense fallback={<div className="h-[460px]" />}>
            <Scaffold3D st={shown} girderColor={girderColor} partColor={partColor} selected={sc.selected} moved={moved} resetKey={resetKey} onPick={pick} describe={describe} />
          </Suspense>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>{fmt.t('scaffold.view.hint')}</span>
            {selPart && (
              <span className="font-medium text-slate-700 dark:text-slate-200" data-testid="scaffold-selected">
                {fmt.t('scaffold.selected')}: {selPart.part.desc || selPart.part.name} ({selPart.part.article})
              </span>
            )}
          </div>
        </Card>

        <AnalysisCard st={st} run={run} setRun={setRun} />

        <Card
          title={fmt.t('scaffold.girders.title')}
          testId="scaffold-girders"
          actions={
            st.girders.length > 0 && (
              <Button size="sm" variant="primary" onClick={() => openInBeam(fmt, st, models, sc.girder ?? st.girders[0].key)} data-testid="scaffold-open-all">
                {fmt.t('scaffold.girders.openAll', { n: st.girders.length })} <IconChevronRight />
              </Button>
            )
          }
        >
          {!st.girders.length ? (
            <p className="text-sm text-slate-500">{fmt.t('scaffold.girders.none')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-start text-[11px] text-slate-500 dark:border-slate-700">
                    {(['key', 'type', 'L', 'supports', 'load', 'eta'] as const).map((c) => (
                      <th key={c} className={cx('px-1.5 py-1 font-medium', c === 'eta' ? 'text-end' : 'text-start')}>
                        {fmt.t(`scaffold.girders.col.${c}`)}
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {models.map(({ g, m }, k) => {
                    const s = sums[k];
                    const qk = m.loads.filter((l) => l.kind === 'dist' && l.caseId === 'Q').map((l) => (l.kind === 'dist' ? l.q1 : 0));
                    const on = sc.girder === g.key;
                    return (
                      <tr
                        key={g.key}
                        className={cx('cursor-pointer border-b border-slate-100 dark:border-slate-800', on ? 'bg-amber-50 dark:bg-amber-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60')}
                        onClick={() => sc.select(g.parts, g.key)}
                        data-testid={`scaffold-girder-${g.key}`}
                      >
                        <td className="px-1.5 py-1 font-semibold">{g.key}</td>
                        <td className="px-1.5 py-1">
                          {girderDesignation(g)}
                          {g.warnings.length > 0 && (
                            <span className="ms-1 inline-flex align-middle text-amber-600" title={g.warnings.map((w) => warningText(fmt, w)).join('\n')}>
                              <IconAlert width={12} height={12} />
                            </span>
                          )}
                        </td>
                        <td className="num px-1.5 py-1">{fmt.q(g.L, 'length')}</td>
                        <td className="num px-1.5 py-1">
                          {g.supports.map((x) => fmt.num(x, 2)).join(' · ')}
                          {g.supportsAssumed && <span className="ms-1 text-amber-600">({fmt.t('scaffold.girders.assumed')})</span>}
                        </td>
                        <td className="num px-1.5 py-1">{qk.length ? [...new Set(qk)].map((q) => fmt.q(q, 'lineLoad')).join(' / ') : '–'}</td>
                        <td className="num px-1.5 py-1 text-end font-semibold" style={{ color: etaColor(s) }} data-testid={`scaffold-girder-eta-${g.key}`}>
                          {s.state === 'error' ? fmt.t('batch.error') : `${fmt.num(s.eta * 100, 0)} %`}
                        </td>
                        <td className="px-1.5 py-1 text-end">
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openInBeam(fmt, st, models, g.key);
                            }}
                            data-testid={`scaffold-girder-open-${g.key}`}
                          >
                            {fmt.t('scaffold.girders.open')} <IconChevronRight />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-slate-500">{fmt.t('scaffold.girders.hint')}</p>
            </div>
          )}
        </Card>

        <Card title={fmt.t('scaffold.bom.title')} testId="scaffold-bom">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-slate-700">
                  <th className="px-1.5 py-1 text-start font-medium">{fmt.t('scaffold.bom.article')}</th>
                  <th className="px-1.5 py-1 text-start font-medium">{fmt.t('scaffold.bom.name')}</th>
                  <th className="px-1.5 py-1 text-start font-medium">{fmt.t('scaffold.bom.kind')}</th>
                  <th className="px-1.5 py-1 text-end font-medium">{fmt.t('scaffold.bom.count')}</th>
                  <th className="px-1.5 py-1 text-end font-medium">{fmt.t('scaffold.bom.weight')}, kg</th>
                </tr>
              </thead>
              <tbody>
                {st.bom.map((b) => (
                  <tr
                    key={b.article}
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                    onClick={() => sc.select(st.parts.filter((w) => w.part.article === b.article).map((w) => w.part.id))}
                  >
                    <td className="num px-1.5 py-1">{b.article}</td>
                    <td className="px-1.5 py-1">{b.desc || b.name}</td>
                    <td className="px-1.5 py-1">
                      <span className="me-1 inline-block h-2 w-3 rounded-sm align-middle" style={{ background: KIND_COLOR[b.kind] }} />
                      {fmt.t(`scaffold.kind.${b.kind}`)}
                    </td>
                    <td className="num px-1.5 py-1 text-end font-semibold">{b.count}</td>
                    <td className="num px-1.5 py-1 text-end">{b.weight !== undefined ? fmt.num(b.weight * b.count, 1) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs font-medium" data-testid="scaffold-bom-total">
            {fmt.t('scaffold.bom.total', {
              kg: fmt.num(
                st.bom.reduce((a, b) => a + (b.weight ?? 0) * b.count, 0),
                0,
              ),
              n: st.bom.filter((b) => b.weight === undefined).reduce((a, b) => a + b.count, 0),
            })}
          </p>
        </Card>
      </section>
    </main>
      {printing && <ScaffoldReport st={st} run={run} />}
    </>
  );
}
