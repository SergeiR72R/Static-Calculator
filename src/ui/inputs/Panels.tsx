import type { Combination, Id, Load, LoadCategory } from '../../core/types';
import { defaultCombinations, makeHinge, makeSupport, uid } from '../../core/defaults';
import { useStore } from '../../state/store';
import { Button, Card, NumberField, SelectField, SwitchField, TextField, cx } from '../common';
import { useFmt, type Fmt } from '../hooks';
import { IconPlus, IconTrash } from '../icons';
import { HingeEditor, LoadEditor, SupportEditor, caseLabel } from './Editors';
import { defaultSnap } from '../../units/units';

function Selectable({ id, kind, children }: { id: Id; kind: 'support' | 'hinge' | 'load'; children: React.ReactNode }) {
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const active = selection?.kind === kind && selection.id === id;
  return (
    <div
      onFocusCapture={() => select({ kind, id })}
      className={cx(
        'rounded border p-2 transition-colors',
        active ? 'border-accent-500 bg-accent-50/60 dark:bg-accent-900/20' : 'border-slate-200 dark:border-slate-700',
      )}
    >
      {children}
    </div>
  );
}

export function SupportsPanel() {
  const fmt = useFmt();
  const model = useStore((s) => s.model);
  const update = useStore((s) => s.update);
  const sorted = [...model.supports].sort((a, b) => a.x - b.x);
  const hinges = [...model.hinges].sort((a, b) => a.x - b.x);
  return (
    <div className="space-y-3">
      <Card
        title={fmt.t('support.title')}
        actions={
          <Button
            size="sm"
            data-testid="add-support"
            onClick={() => update((m) => void m.supports.push(makeSupport(m.supports.length ? 'roller' : 'pinned', m.L / 2)))}
          >
            <IconPlus /> {fmt.t('common.add')}
          </Button>
        }
      >
        <div className="space-y-2">
          {sorted.map((s) => (
            <Selectable key={s.id} id={s.id} kind="support">
              <SupportEditor s={s} />
            </Selectable>
          ))}
          {!sorted.length && <p className="text-sm text-slate-500">{fmt.t('support.none')}</p>}
        </div>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{fmt.t('support.legend')}</p>
      </Card>
      <Card
        title={fmt.t('hinge.title')}
        actions={
          <Button size="sm" data-testid="add-hinge" onClick={() => update((m) => void m.hinges.push(makeHinge(m.L / 2)))}>
            <IconPlus /> {fmt.t('common.add')}
          </Button>
        }
      >
        <div className="space-y-2">
          {hinges.map((h) => (
            <Selectable key={h.id} id={h.id} kind="hinge">
              <HingeEditor h={h} />
            </Selectable>
          ))}
          {!hinges.length && <p className="text-sm text-slate-500">{fmt.t('hinge.none')}</p>}
        </div>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{fmt.t('hinge.hint')}</p>
      </Card>
    </div>
  );
}

function newLoad(kind: 'point' | 'moment' | 'dist' | 'axial', caseId: Id, L: number): Load {
  const id = uid('l');
  switch (kind) {
    case 'point':
      return { id, kind: 'point', caseId, x: L / 2, P: 10e3, angle: 90 };
    case 'moment':
      return { id, kind: 'moment', caseId, x: L / 2, M: 10e3, hingeSide: 'left' };
    case 'dist':
      return { id, kind: 'dist', caseId, dir: 'z', x1: 0, x2: L, q1: 5e3, q2: 5e3 };
    case 'axial':
      return { id, kind: 'dist', caseId, dir: 'x', x1: 0, x2: L, q1: 2e3, q2: 2e3 };
  }
}

export function LoadsPanel() {
  const fmt = useFmt();
  const model = useStore((s) => s.model);
  const update = useStore((s) => s.update);
  const view = useStore((s) => s.view);
  const caseId = view.type === 'case' ? view.id : model.loadCases[0]?.id ?? 'G';
  const groups: { key: 'point' | 'moment' | 'dist' | 'axial'; filter: (l: Load) => boolean }[] = [
    { key: 'dist', filter: (l) => l.kind === 'dist' && l.dir === 'z' },
    { key: 'point', filter: (l) => l.kind === 'point' },
    { key: 'moment', filter: (l) => l.kind === 'moment' },
    { key: 'axial', filter: (l) => l.kind === 'dist' && l.dir === 'x' },
  ];
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-2 text-[11px] leading-snug text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
        {fmt.t('load.signs')}
      </div>
      {groups.map((g) => {
        const items = model.loads.filter(g.filter);
        return (
          <Card
            key={g.key}
            title={fmt.t(`load.kinds.${g.key}`)}
            actions={
              <Button size="sm" data-testid={`add-load-${g.key}`} onClick={() => update((m) => void m.loads.push(newLoad(g.key, caseId, m.L)))}>
                <IconPlus /> {fmt.t('common.add')}
              </Button>
            }
          >
            <div className="space-y-2">
              {items.map((l) => (
                <Selectable key={l.id} id={l.id} kind="load">
                  <LoadEditor l={l} />
                </Selectable>
              ))}
              {!items.length && <p className="text-xs text-slate-500">{fmt.t('load.none')}</p>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

const CATEGORIES: LoadCategory[] = ['G', 'Q', 'S', 'W', 'custom'];

export function comboLabel(fmt: Fmt, model: { loadCases: { id: Id; name: string; category: LoadCategory }[] }, c: Combination): string {
  if (c.name) return c.name;
  const parts = Object.entries(c.factors)
    .filter(([, f]) => f !== 0)
    .map(([id, f]) => {
      const lc = model.loadCases.find((k) => k.id === id);
      const sym = lc ? (lc.category === 'custom' ? lc.name || id : lc.category) : id;
      return `${fmt.num(f, 2)}·${sym}`;
    });
  return `${fmt.t(`combo.types.${c.type}`)}: ${parts.join(' + ') || '0'}`;
}

export function CasesPanel() {
  const fmt = useFmt();
  const model = useStore((s) => s.model);
  const update = useStore((s) => s.update);
  return (
    <div className="space-y-3">
      <Card
        title={fmt.t('lc.title')}
        actions={
          <Button
            size="sm"
            onClick={() =>
              update((m) => void m.loadCases.push({ id: uid('c'), name: `${fmt.t('lc.customName')} ${m.loadCases.length + 1}`, category: 'custom' }))
            }
          >
            <IconPlus /> {fmt.t('common.add')}
          </Button>
        }
      >
        <div className="space-y-1.5">
          {model.loadCases.map((c) => (
            <div key={c.id} className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
              <TextField
                value={c.name}
                placeholder={fmt.t(`lc.${c.category}`)}
                onChange={(v) =>
                  update((m) => {
                    const t = m.loadCases.find((k) => k.id === c.id);
                    if (t) t.name = v;
                  }, `lc.${c.id}.name`)
                }
              />
              <SelectField
                value={c.category}
                ariaLabel={fmt.t('lc.category')}
                options={CATEGORIES.map((k) => ({ value: k, label: fmt.t(`lc.cat.${k}`) }))}
                onChange={(category) =>
                  update((m) => {
                    const t = m.loadCases.find((k) => k.id === c.id);
                    if (t) t.category = category;
                  })
                }
              />
              <Button
                size="sm"
                variant="danger"
                aria-label={fmt.t('common.delete')}
                disabled={model.loadCases.length <= 1 || model.loads.some((l) => l.caseId === c.id)}
                title={model.loads.some((l) => l.caseId === c.id) ? fmt.t('lc.inUse') : undefined}
                onClick={() =>
                  update((m) => {
                    m.loadCases = m.loadCases.filter((k) => k.id !== c.id);
                    for (const cb of m.combinations) delete cb.factors[c.id];
                  })
                }
              >
                <IconTrash />
              </Button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{fmt.t('lc.selfWeightHint')}</p>
      </Card>
      <Card
        title={fmt.t('combo.title')}
        actions={
          <div className="flex gap-1">
            <Button size="sm" onClick={() => update((m) => void (m.combinations = defaultCombinations()))}>
              {fmt.t('combo.presets')}
            </Button>
            <Button
              size="sm"
              onClick={() =>
                update((m) => void m.combinations.push({ id: uid('k'), name: '', type: 'ULS', factors: { G: 1.35 }, inEnvelope: true }))
              }
            >
              <IconPlus /> {fmt.t('common.add')}
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {model.combinations.map((c) => (
            <div key={c.id} className="rounded border border-slate-200 p-2 dark:border-slate-700" data-testid={`combo-${c.id}`}>
              <div className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
                <TextField
                  value={c.name}
                  placeholder={comboLabel(fmt, model, c)}
                  onChange={(v) =>
                    update((m) => {
                      const t = m.combinations.find((k) => k.id === c.id);
                      if (t) t.name = v;
                    }, `combo.${c.id}.name`)
                  }
                />
                <SelectField
                  value={c.type}
                  ariaLabel={fmt.t('combo.type')}
                  options={[
                    { value: 'ULS', label: fmt.t('combo.types.ULS') },
                    { value: 'SLS', label: fmt.t('combo.types.SLS') },
                  ]}
                  onChange={(type) =>
                    update((m) => {
                      const t = m.combinations.find((k) => k.id === c.id);
                      if (t) t.type = type;
                    })
                  }
                />
                <Button
                  size="sm"
                  variant="danger"
                  aria-label={fmt.t('common.delete')}
                  onClick={() => update((m) => void (m.combinations = m.combinations.filter((k) => k.id !== c.id)))}
                >
                  <IconTrash />
                </Button>
              </div>
              <div className="mt-1 grid grid-cols-4 gap-2">
                {model.loadCases.map((lc) => (
                  <NumberField
                    key={lc.id}
                    label={`γ ${lc.category === 'custom' ? caseLabel(fmt, model, lc.id) : lc.category}`}
                    value={c.factors[lc.id] ?? 0}
                    path={`combinations.${c.id}.factors.${lc.id}`}
                    onChange={(v) =>
                      update((m) => {
                        const t = m.combinations.find((k) => k.id === c.id);
                        if (t) t.factors[lc.id] = v;
                      }, `combo.${c.id}.${lc.id}`)
                    }
                  />
                ))}
              </div>
              <label className="mt-1 flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={c.inEnvelope}
                  onChange={(e) =>
                    update((m) => {
                      const t = m.combinations.find((k) => k.id === c.id);
                      if (t) t.inEnvelope = e.target.checked;
                    })
                  }
                />
                {fmt.t('combo.inEnvelope')}
              </label>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{fmt.t('combo.hint')}</p>
      </Card>
    </div>
  );
}

export function SettingsPanel() {
  const fmt = useFmt();
  const model = useStore((s) => s.model);
  const update = useStore((s) => s.update);
  const st = useStore();
  const s = model.settings;
  const set = (patch: Partial<typeof s>, key?: string) => update((m) => void Object.assign(m.settings, patch), key);
  return (
    <div className="space-y-3">
      <Card title={fmt.t('settings.analysis')}>
        <SelectField
          label={fmt.t('settings.theory')}
          value={s.theory}
          options={[
            { value: 'euler', label: fmt.t('settings.euler') },
            { value: 'timoshenko', label: fmt.t('settings.timoshenko') },
          ]}
          onChange={(theory) => set({ theory })}
        />
        <div className="mt-2">
          <SwitchField checked={s.selfWeight} onChange={(selfWeight) => set({ selfWeight })} label={fmt.t('settings.selfWeight')} hint={fmt.t('settings.selfWeightHint')} testId="self-weight" />
          <SwitchField
            checked={s.patternLoading}
            onChange={(patternLoading) => set({ patternLoading })}
            label={fmt.t('settings.patternLoading')}
            hint={fmt.t('settings.patternLoadingHint')}
          />
          <SwitchField checked={s.shearCheck} onChange={(shearCheck) => set({ shearCheck })} label={fmt.t('settings.shearCheck')} />
        </div>
      </Card>
      <Card title={fmt.t('settings.limits')}>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={fmt.t('settings.deflLimitSpan')} value={s.deflLimitSpan} path="settings.deflLimitSpan" onChange={(v) => set({ deflLimitSpan: v }, 'dls')} />
          <NumberField
            label={fmt.t('settings.deflLimitCantilever')}
            value={s.deflLimitCantilever}
            path="settings.deflLimitCantilever"
            onChange={(v) => set({ deflLimitCantilever: v }, 'dlc')}
          />
        </div>
      </Card>
      <Card title={fmt.t('settings.display')}>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={fmt.t('settings.decimals')}
            value={st.decimals}
            onChange={(v) => st.setPrefs({ decimals: Math.max(0, Math.min(6, Math.round(v))) })}
            testId="decimals"
          />
          <NumberField
            label={fmt.t('settings.snap')}
            value={st.snap}
            q="length"
            onChange={(v) => st.setPrefs({ snap: v > 0 ? v : defaultSnap(st.units) })}
          />
        </div>
      </Card>
    </div>
  );
}
