import { useMemo, useState, type ReactNode } from 'react';
import { CATALOG, DEFAULT_FAMILIES, DESIGN_KINDS, FAMILIES, byArticle, type DesignKind } from '../../designer/catalog';
import { ANCHOR_ANGLES, anchorAngle, cat, designBom, designDoc, designIssues, exampleDesign, standards } from '../../designer/design';
import { useDesigner } from '../../designer/store';
import { LOAD_CLASSES } from '../../scaffold/catalog';
import { analyzeScaffold } from '../../scaffold/structure';
import { buildScaffoldModel } from '../../scaffold/model';
import { DEFAULT_ANALYSIS } from '../../scaffold/analysis';
import { analyzeScaffoldParallel } from '../../scaffold/parallel';
import { assessScaffold } from '../../scaffold/advice';
import { Button, Card, CheckField, FoldCard, FoldState, HelpTip, NumberField, SelectField, TextField, cx } from '../common';
import { useFmt } from '../hooks';
import { IconTrash, IconUndo, IconRedo } from '../icons';
import { VerdictPanel } from '../scaffold/VerdictPanel';
import { DesignCanvas, type Tool } from './DesignCanvas';
import { PartIcon } from './PartIcon';

function ToolButton({ on, onClick, children, testId }: { on: boolean; onClick: () => void; children: ReactNode; testId: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      data-testid={testId}
      className={cx('rounded-md border px-2 py-1 text-xs font-medium', on ? 'border-accent-700 bg-accent-700 text-white' : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800')}
    >
      {children}
    </button>
  );
}

/** catalogue: the parts of PERI UP by kind, with their side view, article and weight */
function Catalog({ tool, setTool }: { tool: Tool; setTool: (t: Tool) => void }) {
  const fmt = useFmt();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<DesignKind>>(new Set(['standard']));
  const families = useDesigner((s) => s.families);
  const match = (s: string) => !q.trim() || s.toLowerCase().includes(q.trim().toLowerCase());
  return (
    <Card title={fmt.t('designer.catalog')} testId="designer-catalog">
      <TextField value={q} onChange={setQ} placeholder={fmt.t('designer.search')} testId="designer-search" />
      <div className="mt-2 space-y-1">
        {DESIGN_KINDS.map((k) => {
          const items = CATALOG.filter((c) => c.kind === k && families.includes(c.family) && match(`${c.name} ${c.desc} ${c.article}`));
          if (!items.length) return null;
          const show = open.has(k) || !!q.trim();
          return (
            <div key={k} className="rounded border border-slate-200 dark:border-slate-700">
              <button type="button" className="flex w-full items-center justify-between px-2 py-1 text-start text-xs font-semibold" onClick={() => setOpen((o) => new Set(o.has(k) ? [...o].filter((x) => x !== k) : [...o, k]))} aria-expanded={show} data-testid={`designer-kind-${k}`}>
                <span>{fmt.t(`designer.kind.${k}`)}</span>
                <span className="text-slate-400">{items.length}</span>
              </button>
              {show && (
                <ul className="max-h-72 overflow-y-auto border-t border-slate-200 dark:border-slate-700">
                  {items.map((c) => {
                    const on = tool.kind === 'part' && tool.article === c.article;
                    return (
                      <li key={c.article}>
                        <button
                          type="button"
                          onClick={() => setTool(on ? { kind: 'select' } : c.kind === 'tube' ? { kind: 'tube' } : { kind: 'part', article: c.article })}
                          aria-pressed={on}
                          className={cx('flex w-full items-center gap-2 px-2 py-1 text-start', on || (c.kind === 'tube' && tool.kind === 'tube') ? 'bg-accent-50 ring-1 ring-accent-600 dark:bg-accent-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800')}
                          data-testid={`designer-cat-${c.article}`}
                        >
                          <PartIcon part={c} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">{c.desc}</span>
                            <span className="num block text-[11px] text-slate-500">
                              {c.article}
                              {c.kg !== undefined && ` · ${fmt.num(c.kg, 2)} kg`}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** properties of the selected parts: decks of ledgers and brackets, extension of jacks, anchors */
function Properties({ selected, setSelected }: { selected: string[]; setSelected: (ids: string[]) => void }) {
  const fmt = useFmt();
  const dz = useDesigner();
  const d = dz.design;
  const parts = d.parts.filter((p) => selected.includes(p.id));
  const anchorsSel = d.anchors.filter((a) => selected.includes(a.id));
  if (!parts.length && anchorsSel.length)
    return (
      <div className="space-y-2 text-xs" data-testid="designer-props">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold">{anchorsSel.length > 1 ? fmt.t('designer.props.anchorsMany', { n: anchorsSel.length }) : fmt.t('designer.props.anchor', { id: anchorsSel[0].id })}</p>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              dz.removeParts(selected);
              setSelected([]);
            }}
            aria-label={fmt.t('designer.props.remove')}
            data-testid="designer-remove"
          >
            <IconTrash />
          </Button>
        </div>
        {anchorsSel.map((a) => (
          <div key={a.id} className="space-y-1.5 rounded border border-slate-200 p-2 dark:border-slate-700" data-testid={`designer-anchor-props-${a.id}`}>
            <p className="text-slate-500">
              {a.id} · {fmt.t('designer.props.anchorOn', { std: `${a.part} ${byArticle.get(d.parts.find((x) => x.id === a.part)?.article ?? '')?.name ?? ''}`, z: fmt.q(a.z, 'length', 2) })}
            </p>
            <SelectField
              label={fmt.t('designer.props.anchorDir')}
              help="designer.anchorDir"
              value={String(anchorAngle(d, a))}
              testId={`designer-anchor-side-${a.id}`}
              options={ANCHOR_ANGLES.map((g) => ({ value: String(g), label: fmt.t(g === 180 ? 'designer.props.wallLeft' : 'designer.props.wallRight') }))}
              onChange={(v) => dz.updateAnchor(a.id, { angle: Number(v) })}
            />
            <NumberField label={fmt.t('scaffold.fix.limit')} q="force" value={a.limit ?? 0} onChange={(v) => dz.updateAnchor(a.id, { limit: v > 0 ? v : undefined })} help="scaffold.fixLimit" testId={`designer-anchor-limit-${a.id}`} />
          </div>
        ))}
      </div>
    );
  if (!parts.length) return <p className="text-xs text-slate-500">{fmt.t('designer.props.none')}</p>;
  const p = parts[0];
  const c = cat(p);
  const decked = parts.filter((x) => cat(x).kind === 'ledger' || cat(x).kind === 'bracket');
  const all = (f: (x: (typeof parts)[number]) => boolean) => decked.length > 0 && decked.every(f);
  const setDeck = (patch: Partial<{ width: number; work: boolean }> | null) =>
    dz.edit((dd) => ({
      ...dd,
      parts: dd.parts.map((x) => (selected.includes(x.id) && (cat(x).kind === 'ledger' || cat(x).kind === 'bracket') ? { ...x, deck: patch === null ? undefined : { width: x.deck?.width ?? dd.settings.field, work: x.deck?.work ?? false, ...patch } } : x)),
    }));
  const std = standards(d).find((s) => s.part.id === p.id);
  return (
    <div className="space-y-2 text-xs" data-testid="designer-props">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{parts.length > 1 ? fmt.t('designer.props.many', { n: parts.length }) : c.desc}</p>
          {parts.length === 1 && (
            <p className="num text-slate-500">
              {p.id} · {c.article}
              {c.kg !== undefined && ` · ${fmt.num(c.kg, 2)} kg`}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="danger"
          onClick={() => {
            dz.removeParts(selected);
            setSelected([]);
          }}
          aria-label={fmt.t('designer.props.remove')}
          data-testid="designer-remove"
        >
          <IconTrash />
        </Button>
      </div>
      {parts.length === 1 && c.kind === 'diagonal' && (p.side ?? 1) < 0 && (
        <p className="text-slate-600 dark:text-slate-300" data-testid="designer-back-side">
          {fmt.t('designer.props.backSide')}
        </p>
      )}
      {decked.length > 0 && (
        <div className="space-y-1.5 rounded border border-slate-200 p-2 dark:border-slate-700">
          <CheckField checked={all((x) => !!x.deck)} onChange={(v) => setDeck(v ? {} : null)} label={fmt.t('designer.props.deck')} help="designer.deck" testId="designer-deck" />
          {all((x) => !!x.deck) && (
            <>
              <NumberField label={fmt.t('designer.props.width')} q="length" value={p.deck?.width ?? d.settings.field} onChange={(v) => setDeck({ width: Math.max(0, v) })} help="designer.width" testId="designer-width" />
              <CheckField checked={all((x) => !!x.deck?.work)} onChange={(v) => setDeck({ work: v })} label={fmt.t('designer.props.work')} help="designer.work" testId="designer-work" />
            </>
          )}
        </div>
      )}
      {parts.length === 1 && c.kind === 'jack' && (
        <NumberField label={fmt.t('designer.props.ext')} q="length" value={p.ext ?? 0.2} onChange={(v) => dz.updatePart(p.id, { ext: Math.min(Math.max(v, 0.05), c.ext ?? 0.3) })} help="designer.ext" testId="designer-ext" />
      )}
      {parts.length === 1 && std && (
        <div className="space-y-1">
          <p className="font-medium">{fmt.t('designer.props.anchors')}</p>
          {d.anchors
            .filter((a) => a.part === p.id)
            .map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2" data-testid={`designer-anchor-row-${a.id}`}>
                <span className="shrink-0">
                  {a.id} · z = {fmt.q(a.z, 'length', 2)}
                </span>
                <select
                  className="h-7 min-w-0 rounded border border-slate-300 bg-white px-1 text-xs dark:border-slate-600 dark:bg-slate-900"
                  value={anchorAngle(d, a)}
                  onChange={(e) => dz.updateAnchor(a.id, { angle: Number(e.target.value) })}
                  aria-label={fmt.t('designer.props.anchorDir')}
                  data-testid={`designer-anchor-dir-${a.id}`}
                >
                  {ANCHOR_ANGLES.map((g) => (
                    <option key={g} value={g}>
                      {fmt.t(g === 180 ? 'designer.props.wallLeft' : 'designer.props.wallRight')}
                    </option>
                  ))}
                </select>
                <HelpTip id="designer.anchorDir" title={fmt.t('designer.props.anchorDir')} />
                <Button size="sm" variant="ghost" onClick={() => dz.removeAnchor(a.id)} aria-label={fmt.t('designer.props.remove')}>
                  ✕
                </Button>
              </div>
            ))}
          <div className="flex flex-wrap gap-1">
            {std.rosettes.map((z) => (
              <Button key={z} size="sm" onClick={() => dz.addAnchor({ part: p.id, z, angle: anchorAngle(d, { id: '', part: p.id, z }) })} disabled={d.anchors.some((a) => a.part === p.id && Math.abs(a.z - z) < 0.01)} data-testid={`designer-anchor-add-${z}`}>
                + {fmt.num(z, 2)}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** what the drawing shows of the result: nodes and joints, reactions */
function ViewCard() {
  const fmt = useFmt();
  const view = useDesigner((s) => s.view);
  const setView = useDesigner((s) => s.setView);
  return (
    <FoldCard title={fmt.t('designer.view.title')} testId="designer-view" state={<FoldState items={view.points === 'threshold' ? [`≥ ${Math.round(view.threshold * 100)} %`] : view.points === 'none' ? ['–'] : []} />}>
      <div className="grid grid-cols-1 gap-2">
        <SelectField
          label={fmt.t('designer.view.points')}
          help="designer.viewPoints"
          value={view.points}
          testId="designer-view-points"
          options={[
            { value: 'all', label: fmt.t('designer.view.all') },
            { value: 'threshold', label: fmt.t('designer.view.threshold') },
            { value: 'none', label: fmt.t('designer.view.none') },
          ]}
          onChange={(v) => setView({ points: v })}
        />
        {view.points === 'threshold' && (
          <NumberField label={fmt.t('designer.view.from')} value={view.threshold * 100} onChange={(v) => setView({ threshold: Math.min(Math.max(v, 0), 500) / 100 })} testId="designer-view-threshold" />
        )}
        <CheckField className="text-xs" checked={view.reactions} onChange={(v) => setView({ reactions: v })} label={fmt.t('designer.view.reactions')} help="designer.viewReactions" testId="designer-view-reactions" />
      </div>
    </FoldCard>
  );
}

/** which series of parts the catalogue shows (first generation by default) */
function FamiliesCard() {
  const fmt = useFmt();
  const families = useDesigner((s) => s.families);
  const setFamilies = useDesigner((s) => s.setFamilies);
  const changed = families.length !== DEFAULT_FAMILIES.length || families.some((f) => !DEFAULT_FAMILIES.includes(f));
  return (
    <FoldCard title={fmt.t('designer.families')} testId="designer-families" state={<FoldState items={changed ? [String(families.length)] : []} />}>
      <p className="mb-1 flex items-center gap-1 text-[11px] text-slate-500">
        {fmt.t('designer.familiesHint')} <HelpTip id="designer.families" title={fmt.t('designer.families')} />
      </p>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
        {FAMILIES.map((f) => (
          <label key={f.id} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={families.includes(f.id)}
              onChange={(e) => setFamilies(e.target.checked ? [...families, f.id] : families.filter((x) => x !== f.id))}
              data-testid={`designer-family-${f.id}`}
            />
            <span>
              {f.id === 'tube' || f.id === 'spigot' ? fmt.t(`designer.kind.${f.kind}`) : f.id}
              {f.gen && <span className="ms-1 text-[10px] text-slate-400">{fmt.t('designer.gen', { n: f.gen })}</span>}
            </span>
          </label>
        ))}
      </div>
      <Button size="sm" variant="ghost" className="mt-1" onClick={() => setFamilies([...DEFAULT_FAMILIES])} disabled={!changed} data-testid="designer-families-reset">
        {fmt.t('designer.familiesReset')}
      </Button>
    </FoldCard>
  );
}

export default function DesignerApp() {
  const fmt = useFmt();
  const dz = useDesigner();
  const d = dz.design;
  const [tool, setTool] = useState<Tool>({ kind: 'select' });
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const issues = useMemo(() => designIssues(d), [d]);
  const bom = useMemo(() => designBom(d), [d]);
  const run = dz.run;
  const stale = !!run && run.design !== d;
  const errors = issues.filter((i) => i.severity === 'error');

  const calc = async () => {
    setError(null);
    setBusy(fmt.t('designer.calc.model'));
    await new Promise((r) => setTimeout(r, 20));
    try {
      const { doc, loads, fixings, hanging } = designDoc(d);
      const st = analyzeScaffold(doc, { tol: 0.02 });
      const model = buildScaffoldModel(st, loads, [], { fixings, plane: true, planLoads: false, capByArticle: true, hanging });
      const s = d.settings;
      const result = await analyzeScaffoldParallel(
        model,
        { ...DEFAULT_ANALYSIS, p: (LOAD_CLASSES[s.loadClass] ?? 2) * 1e3, loadClass: s.loadClass, outdoor: s.outdoor, qWork: s.outdoor ? 200 : 0, qMax: s.outdoor ? s.qMax : 0, dhb: 0, dhbLoad: 0, dirs: ['x'] },
        (pr) => setBusy(fmt.t('designer.calc.progress', { done: pr.done, total: pr.total })),
      );
      dz.setRun({ result, notes: model.notes, design: d });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  };

  const fresh = run && !stale ? run : null;
  const eta = useMemo(() => {
    if (!fresh) return null;
    // the parts by their own checks; nodes and joints of the standards are shown at their place
    const m = new Map<string, number>();
    for (const c of fresh.result.checks) {
      if (c.check === 'node' || c.check === 'joint') continue;
      const id = c.part.replace(/\.c\d$/, '');
      m.set(id, Math.max(m.get(id) ?? 0, c.eta));
    }
    return m;
  }, [fresh]);
  const view = dz.view;
  // nodes and joints as chosen in the settings: all, from a utilisation on, none
  const points = useMemo(
    () =>
      fresh && view.points !== 'none'
        ? (fresh.result.points ?? []).filter((c) => view.points === 'all' || c.eta >= view.threshold).map((c) => ({ x: c.at[0], z: c.at[2], eta: c.eta, check: c.check, part: c.part, node: c.node }))
        : [],
    [fresh, view.points, view.threshold],
  );
  const reactions = fresh && view.reactions ? fresh.result.bases : [];
  const anchorForces = useMemo(() => (fresh && view.reactions ? new Map(fresh.result.fixings.map((f) => [f.id, f.F])) : undefined), [fresh, view.reactions]);
  const assessment = useMemo(() => {
    const zs = d.parts.flatMap((p) => [p.z, p.z2 ?? p.z]);
    const xs = standards(d).map((s) => s.x);
    return assessScaffold({
      issues: [],
      result: run?.result ?? null,
      notes: run?.notes,
      height: zs.length ? Math.max(...zs) - Math.min(...zs, 0) : 0,
      width: xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
      held: d.anchors.length,
    });
  }, [run, d]);
  const checks = useMemo(() => {
    if (!fresh) return [];
    const best = new Map<string, (typeof fresh.result.checks)[number]>();
    for (const c of fresh.result.checks) {
      const k = `${c.part}|${c.check}`;
      if (!best.has(k) || best.get(k)!.eta < c.eta) best.set(k, c);
    }
    return [...best.values()].sort((a, b) => b.eta - a.eta);
  }, [fresh]);
  const kg = bom.reduce((s, r) => s + (r.kg ?? 0) * r.count, 0);
  const s = d.settings;

  return (
    <main className="no-print grid flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[300px_1fr_320px]" data-testid="designer-app">
      <aside className="space-y-3">
        <Card title={fmt.t('designer.tools')}>
          <div className="flex flex-wrap gap-1">
            <ToolButton on={tool.kind === 'select'} onClick={() => setTool({ kind: 'select' })} testId="designer-tool-select">
              {fmt.t('designer.tool.select')}
            </ToolButton>
            <ToolButton on={tool.kind === 'anchor'} onClick={() => setTool({ kind: 'anchor' })} testId="designer-tool-anchor">
              {fmt.t('designer.tool.anchor')}
            </ToolButton>
            <ToolButton on={tool.kind === 'tube'} onClick={() => setTool({ kind: 'tube' })} testId="designer-tool-tube">
              {fmt.t('designer.tool.tube')}
            </ToolButton>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <Button size="sm" onClick={dz.undo} disabled={!dz.past.length} aria-label={fmt.t('designer.undo')} data-testid="designer-undo">
              <IconUndo />
            </Button>
            <Button size="sm" onClick={dz.redo} disabled={!dz.future.length} aria-label={fmt.t('designer.redo')} data-testid="designer-redo">
              <IconRedo />
            </Button>
            <Button size="sm" onClick={() => dz.copy(selected)} disabled={!selected.length} data-testid="designer-copy" title="Ctrl+C">
              {fmt.t('designer.copy')}
            </Button>
            <Button size="sm" onClick={() => setTool({ kind: 'paste' })} disabled={!dz.clipboard} aria-pressed={tool.kind === 'paste'} data-testid="designer-paste" title="Ctrl+V">
              {fmt.t('designer.paste', { n: dz.clipboard?.parts.length ?? 0 })}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!d.parts.length || window.confirm(fmt.t('designer.exampleConfirm'))) {
                  dz.load(exampleDesign());
                  setSelected([]);
                }
              }}
              data-testid="designer-example"
            >
              {fmt.t('designer.example')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (window.confirm(fmt.t('designer.clearConfirm'))) {
                  dz.clear();
                  setSelected([]);
                }
              }}
              disabled={!d.parts.length}
              data-testid="designer-clear"
            >
              {fmt.t('designer.clear')}
            </Button>
          </div>
        </Card>
        <Catalog tool={tool} setTool={setTool} />
      </aside>

      <section className="min-w-0 space-y-3">
        <Card
          title={fmt.t('designer.title')}
          actions={
            <Button variant="primary" size="sm" onClick={() => void calc()} disabled={!!busy || errors.length > 0} data-testid="designer-run">
              {busy ?? fmt.t(run ? 'designer.calc.rerun' : 'designer.calc.run')}
            </Button>
          }
        >
          <p className="mb-2 text-xs text-slate-600 dark:text-slate-300">{fmt.t('designer.intro')}</p>
          <DesignCanvas tool={tool} setTool={setTool} selected={selected} setSelected={setSelected} eta={eta} points={points} reactions={reactions} anchorForces={anchorForces} />
          {eta && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              {fmt.t('designer.etaLegend')}
              <span className="inline-block h-2 w-3 rounded-sm bg-[#16a34a]" />≤ 70 %
              <span className="inline-block h-2 w-3 rounded-sm bg-[#f59e0b]" />70 – 100 %
              <span className="inline-block h-2 w-3 rounded-sm bg-[#dc2626]" />&gt; 100 %
              <span>· {fmt.t('designer.pointsLegend')}</span>
            </p>
          )}
        </Card>

        <Card title={fmt.t('scaffold.advice.title')} testId="designer-result">
          {issues.length > 0 && (
            <ul className="mb-2 space-y-1 text-xs" data-testid="designer-issues">
              {issues.map((i) => (
                <li key={i.key}>
                  <button type="button" className={cx('text-start', i.severity === 'error' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-300')} onClick={() => i.parts.length && setSelected(i.parts)} data-testid={`designer-issue-${i.key}`}>
                    ⚠ {fmt.t(`designer.issue.${i.key}`)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
          <VerdictPanel a={assessment} done={!!run} stale={stale} selected={selected} onSelect={setSelected} />
          {checks.length > 0 && (
            <details className="mt-3" data-testid="designer-checks">
              <summary className="cursor-pointer text-xs font-semibold text-accent-700 dark:text-accent-300">{fmt.t('designer.checks', { n: checks.length })}</summary>
              <div className="mt-1 max-h-80 overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-slate-700">
                      <th className="px-1.5 py-1 text-start font-medium">{fmt.t('designer.col.part')}</th>
                      <th className="px-1.5 py-1 text-start font-medium">{fmt.t('designer.col.check')}</th>
                      <th className="px-1.5 py-1 text-start font-medium">{fmt.t('designer.col.combo')}</th>
                      <th className="px-1.5 py-1 text-end font-medium">η</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checks.map((c, k) => {
                      const id = c.part.replace(/\.c\d$/, '');
                      const p = d.parts.find((x) => x.id === id);
                      return (
                        <tr key={k} className={cx('cursor-pointer border-b border-slate-100 dark:border-slate-800', selected.includes(id) && 'bg-fuchsia-50 dark:bg-fuchsia-900/20')} onClick={() => setSelected([id])}>
                          <td className="px-1.5 py-1">
                            {id} {p ? byArticle.get(p.article)?.name : ''}
                          </td>
                          <td className="px-1.5 py-1">{fmt.t(`scaffold.calc.check.${c.check}`)}</td>
                          <td className="px-1.5 py-1">{c.combo}</td>
                          <td className={cx('num px-1.5 py-1 text-end font-semibold', c.eta > 1 ? 'text-red-600' : c.eta > 0.7 ? 'text-amber-600' : 'text-emerald-700')}>{Math.round(c.eta * 100)} %</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </Card>
      </section>

      <aside className="space-y-3">
        <Card title={fmt.t('designer.props.title')}>
          <Properties selected={selected} setSelected={setSelected} />
        </Card>
        <Card title={fmt.t('designer.settings')} testId="designer-settings">
          <div className="grid grid-cols-1 gap-2">
            <TextField label={fmt.t('designer.name')} value={d.name} onChange={dz.setName} testId="designer-name" />
            <SelectField
              label={fmt.t('scaffold.loads.class')}
              help="scaffold.loadClass"
              value={String(s.loadClass)}
              testId="designer-class"
              options={Object.entries(LOAD_CLASSES).map(([k, v]) => ({ value: k, label: fmt.t('scaffold.loads.classOption', { n: k, p: fmt.q(v * 1e3, 'areaLoad') }) }))}
              onChange={(v) => dz.setSettings({ loadClass: Number(v) })}
            />
            <NumberField label={fmt.t('scaffold.loads.g')} q="areaLoad" showUnit value={s.g} onChange={(v) => dz.setSettings({ g: Math.max(0, v) })} help="scaffold.g" testId="designer-g" />
            <NumberField label={fmt.t('designer.field')} q="length" showUnit value={s.field} onChange={(v) => dz.setSettings({ field: Math.max(0, v) })} help="designer.field" testId="designer-field" />
            <SelectField
              label={fmt.t('scaffold.site.exposure')}
              help="scaffold.exposure"
              value={s.outdoor ? 'out' : 'in'}
              testId="designer-exposure"
              options={[
                { value: 'out', label: fmt.t('scaffold.site.outdoor') },
                { value: 'in', label: fmt.t('scaffold.site.indoor') },
              ]}
              onChange={(v) => dz.setSettings({ outdoor: v === 'out' })}
            />
            {s.outdoor && <NumberField label={fmt.t('designer.qMax')} q="areaLoad" showUnit value={s.qMax} onChange={(v) => dz.setSettings({ qMax: Math.max(0, v) })} help="designer.qMax" testId="designer-qmax" />}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">{fmt.t('designer.assumptions')}</p>
        </Card>
        <ViewCard />
        <FamiliesCard />
        <FoldCard title={fmt.t('designer.bom')} testId="designer-bom" state={<FoldState items={bom.length ? [`${fmt.num(kg, 0)} kg`] : []} />}>
          {bom.length > 0 && (
            <table className="w-full text-xs" data-testid="designer-bom-table">
              <tbody>
                {bom.map((r) => (
                  <tr key={r.article} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="num px-1 py-0.5 text-slate-500">{r.article}</td>
                    <td className="px-1 py-0.5">{r.name}</td>
                    <td className="num px-1 py-0.5 text-end">{r.count}</td>
                    <td className="num px-1 py-0.5 text-end">{r.kg !== undefined ? fmt.num(r.kg * r.count, 1) : '–'}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td />
                  <td className="px-1 py-0.5">{fmt.t('designer.total')}</td>
                  <td />
                  <td className="num px-1 py-0.5 text-end">{fmt.num(kg, 1)} kg</td>
                </tr>
              </tbody>
            </table>
          )}
        </FoldCard>
        <p className="flex items-center gap-1 text-[11px] text-slate-500">
          <HelpTip id="designer.about" title={fmt.t('designer.title')} /> {fmt.t('designer.aboutShort')}
        </p>
      </aside>
    </main>
  );
}
