import { useMemo, useState } from 'react';
import { planBlockLoads } from '../../scaffold/planLoads';
import { useScaffold } from '../../scaffold/store';
import type { ScaffoldStructure } from '../../scaffold/structure';
import { DHB_SHARE, userLoadTotal, type UserLoad, type UserLoadWhen } from '../../scaffold/userLoads';
import { Button, Card, NumberField, SelectField, TextField, cx } from '../common';
import { useFmt } from '../hooks';
import { IconInfo } from '../icons';

/**
 * Loads entered by the user on parts chosen in the 3D view (a structure on top calculated separately,
 * a loading platform, ballast …) and the dynamic horizontal load computed from all vertical loads.
 */
export function LoadsCard({ st }: { st: ScaffoldStructure }) {
  const fmt = useFmt();
  const sc = useScaffold();
  const [name, setName] = useState('');
  const [lc, setLc] = useState<'G' | 'Q'>('Q');
  const [kind, setKind] = useState<'point' | 'line'>('point');
  const [value, setValue] = useState(10e3);
  const [at, setAt] = useState(0.5);
  const [dir, setDir] = useState<'z' | 'x' | 'y'>('z');
  const [when, setWhen] = useState<UserLoadWhen>('all');
  const whenOptions: { value: UserLoadWhen; label: string }[] = [
    { value: 'all', label: fmt.t('scaffold.loads.whenAll') },
    { value: 'work', label: fmt.t('scaffold.loads.whenWork') },
    { value: 'rest', label: fmt.t('scaffold.loads.whenRest') },
  ];
  const byId = useMemo(() => new Map(st.parts.map((w) => [w.part.id, w])), [st]);
  const sel = sc.selected.filter((id) => byId.has(id));
  // the selected parts by name
  const selNames = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of sel) {
      const w = byId.get(id)!;
      const n = w.part.desc || w.part.name;
      m.set(n, (m.get(n) ?? 0) + 1);
    }
    return [...m].map(([n, c]) => `${c} × ${n}`).join(', ');
  }, [sel, byId]);
  const add = () => {
    if (!sel.length || !(value > 0)) return;
    const l: UserLoad = {
      id: `L${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
      name: name.trim() || fmt.t(lc === 'G' ? 'scaffold.loads.caseG' : 'scaffold.loads.caseQ'),
      case: lc,
      kind,
      value,
      at: Math.min(Math.max(at, 0), 1),
      parts: [...sel],
      ...(dir !== 'z' ? { dir } : {}),
      ...(when !== 'all' ? { when } : {}),
    };
    sc.addLoad(l);
    setName('');
  };
  // bodies of the drawing with a weight (ballast …) on the scaffold
  const plan = useMemo(() => (st.blocks?.some((b) => b.kg && b.box) ? planBlockLoads(st) : null), [st]);
  const planParts = useMemo(() => [...new Set(plan?.placed.flatMap((p) => p.parts) ?? [])], [plan]);
  const totals = { G: 0, Q: 0 };
  for (const l of sc.loads) totals[l.case] += userLoadTotal(l, byId);

  return (
    <Card title={fmt.t('scaffold.loads.title')} testId="scaffold-loads">
      <p className="mb-2 text-xs text-slate-600 dark:text-slate-300">{fmt.t('scaffold.loads.intro')}</p>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-9">
        <TextField className="col-span-2" label={fmt.t('scaffold.loads.name')} value={name} onChange={setName} placeholder={fmt.t('scaffold.loads.namePlaceholder')} testId="scaffold-load-name" />
        <SelectField
          label={fmt.t('scaffold.loads.case')}
          value={lc}
          testId="scaffold-load-case"
          options={[
            { value: 'G', label: fmt.t('scaffold.loads.caseG') },
            { value: 'Q', label: fmt.t('scaffold.loads.caseQ') },
          ]}
          onChange={setLc}
        />
        <SelectField
          label={fmt.t('scaffold.loads.kind')}
          value={kind}
          testId="scaffold-load-kind"
          options={[
            { value: 'point', label: fmt.t('scaffold.loads.point') },
            { value: 'line', label: fmt.t('scaffold.loads.line') },
          ]}
          onChange={setKind}
        />
        <SelectField
          label={fmt.t('scaffold.loads.dir')}
          value={dir}
          testId="scaffold-load-dir"
          options={[
            { value: 'z', label: fmt.t('scaffold.loads.dirZ') },
            { value: 'x', label: fmt.t('scaffold.loads.dirX') },
            { value: 'y', label: fmt.t('scaffold.loads.dirY') },
          ]}
          onChange={setDir}
        />
        <SelectField
          label={fmt.t('scaffold.loads.when')}
          value={when}
          testId="scaffold-load-when"
          options={whenOptions}
          onChange={setWhen}
        />
        <NumberField label={fmt.t('scaffold.loads.value')} q={kind === 'point' ? 'force' : 'lineLoad'} value={value} onChange={(v) => setValue(Math.max(0, v))} testId="scaffold-load-value" />
        {kind === 'point' && <NumberField label={fmt.t('scaffold.loads.at')} value={at * 100} onChange={(v) => setAt(Math.min(Math.max(v / 100, 0), 1))} testId="scaffold-load-at" />}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={add} disabled={!sel.length || !(value > 0)} data-testid="scaffold-load-add">
          {fmt.t('scaffold.loads.add', { n: sel.length })}
        </Button>
        <span className="text-[11px] text-slate-500">{sel.length ? selNames : fmt.t('scaffold.loads.selectHint')}</span>
      </div>

      {sc.loads.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs" data-testid="scaffold-loads-table">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-slate-700">
                <th className="px-1.5 py-1 text-start font-medium">{fmt.t('scaffold.loads.name')}</th>
                <th className="px-1.5 py-1 text-start font-medium">{fmt.t('scaffold.loads.case')}</th>
                <th className="px-1.5 py-1 text-start font-medium">{fmt.t('scaffold.loads.when')}</th>
                <th className="px-1.5 py-1 text-end font-medium">{fmt.t('scaffold.loads.value')}</th>
                <th className="px-1.5 py-1 text-end font-medium">{fmt.t('scaffold.loads.parts')}</th>
                <th className="px-1.5 py-1 text-end font-medium">Σ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sc.loads.map((l) => {
                const missing = l.parts.filter((id) => !byId.has(id)).length;
                const on = sc.selected.length === l.parts.length && l.parts.every((id) => sc.selected.includes(id));
                return (
                  <tr key={l.id} className={cx('border-b border-slate-100 dark:border-slate-800', on && 'bg-fuchsia-50 dark:bg-fuchsia-900/20')}>
                    <td className="px-1.5 py-1">
                      <button type="button" className="text-start underline" onClick={() => (on ? sc.select([]) : sc.select(l.parts))} aria-pressed={on}>
                        {l.name}
                      </button>
                    </td>
                    <td className="px-1.5 py-1">
                      {l.case}
                      {l.dir && l.dir !== 'z' && <span className="ms-1 text-slate-500">±{l.dir}</span>}
                    </td>
                    <td className="px-1.5 py-1">
                      <select
                        className="rounded border border-slate-300 bg-transparent px-1 py-0.5 text-xs dark:border-slate-600"
                        value={l.when ?? 'all'}
                        data-testid="scaffold-load-when-row"
                        aria-label={fmt.t('scaffold.loads.when')}
                        onChange={(e) => sc.updateLoad(l.id, { when: e.target.value as UserLoadWhen })}
                      >
                        {whenOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="num px-1.5 py-1 text-end">
                      {l.kind === 'point' ? `${fmt.q(l.value, 'force', 2)} @ ${fmt.num(l.at * 100, 0)} %` : fmt.q(l.value, 'lineLoad', 2)}
                    </td>
                    <td className="num px-1.5 py-1 text-end">
                      {l.parts.length - missing}
                      {missing > 0 && <span className="ms-1 text-amber-600" title={fmt.t('scaffold.loads.missing', { n: missing })}>(−{missing})</span>}
                    </td>
                    <td className="num px-1.5 py-1 text-end">{fmt.q(userLoadTotal(l, byId), 'force', 1)}</td>
                    <td className="px-1.5 py-1 text-end">
                      <Button size="sm" variant="ghost" onClick={() => sc.removeLoad(l.id)} aria-label={fmt.t('scaffold.loads.remove')} data-testid={`scaffold-load-remove-${l.id}`}>
                        ✕
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300" data-testid="scaffold-loads-total">
            {fmt.t('scaffold.loads.total', { g: fmt.q(totals.G, 'force', 1), q: fmt.q(totals.Q, 'force', 1) })}
          </p>
        </div>
      )}

      {plan && (
        <div className="mt-3 space-y-1 border-t border-slate-200 pt-2 text-xs dark:border-slate-700" data-testid="scaffold-plan-box">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={sc.planLoads} onChange={(e) => sc.setOpts({ planLoads: e.target.checked })} data-testid="scaffold-plan" />
              {fmt.t('scaffold.loads.plan')}
            </label>
            {plan.placed.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => sc.select(planParts)} data-testid="scaffold-plan-show">
                {fmt.t('scaffold.loads.dhbShow')}
              </Button>
            )}
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-300" data-testid="scaffold-plan-summary">
            {fmt.t('scaffold.loads.planSummary', { n: plan.placed.length, f: fmt.q(plan.total, 'force', 1), m: planParts.length })}
            {plan.unplaced.length > 0 && ` ${fmt.t('scaffold.loads.planUnplaced', { n: plan.unplaced.length })}`}
          </p>
        </div>
      )}

      <div className="mt-3 space-y-2 border-t border-slate-200 pt-2 text-xs dark:border-slate-700" data-testid="scaffold-dhb-box">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex items-center gap-2 pb-1">
            <input type="checkbox" checked={sc.dhb > 0} onChange={(e) => sc.setOpts({ dhb: e.target.checked ? DHB_SHARE : 0 })} data-testid="scaffold-dhb" />
            {fmt.t('scaffold.loads.dhb')}
          </label>
          {sc.dhb > 0 && (
            <>
              <NumberField className="w-36" label={fmt.t('scaffold.loads.dhbLoad')} q="force" value={sc.dhbLoad} onChange={(v) => sc.setOpts({ dhbLoad: Math.max(0, v) })} testId="scaffold-dhb-load" />
              <NumberField className="w-20" label={fmt.t('scaffold.loads.dhbShare')} value={sc.dhb * 100} onChange={(v) => sc.setOpts({ dhb: Math.min(Math.max(v / 100, 0), 1) })} testId="scaffold-dhb-share" />
              <SelectField
                className="w-32"
                label={fmt.t('scaffold.loads.dhbDir')}
                value={sc.dhbDir}
                testId="scaffold-dhb-dir"
                options={[
                  { value: 'xy', label: '±x, ±y' },
                  { value: 'x', label: '±x' },
                  { value: 'y', label: '±y' },
                ]}
                onChange={(v) => sc.setOpts({ dhbDir: v })}
              />
              <span className="pb-1.5 font-medium" data-testid="scaffold-dhb-total">
                = {fmt.q(sc.dhb * sc.dhbLoad, 'force', 2)}
              </span>
            </>
          )}
        </div>
        {sc.dhb > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span>{sc.dhbParts.length ? fmt.t('scaffold.loads.dhbOnParts', { n: sc.dhbParts.length }) : fmt.t('scaffold.loads.dhbOnTops')}</span>
            <Button size="sm" onClick={() => sc.setDhbParts([...sel])} disabled={!sel.length} data-testid="scaffold-dhb-take">
              {fmt.t('scaffold.loads.dhbTake', { n: sel.length })}
            </Button>
            {sc.dhbParts.length > 0 && (
              <>
                <Button size="sm" variant="ghost" onClick={() => sc.select(sc.dhbParts)}>
                  {fmt.t('scaffold.loads.dhbShow')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => sc.setDhbParts([])} data-testid="scaffold-dhb-reset">
                  {fmt.t('scaffold.loads.dhbReset')}
                </Button>
              </>
            )}
          </div>
        )}
        <p className="flex items-start gap-1 text-[11px] text-slate-500">
          <IconInfo className="mt-0.5 shrink-0" width={12} height={12} /> {fmt.t('scaffold.loads.dhbHint')}
        </p>
      </div>
    </Card>
  );
}
