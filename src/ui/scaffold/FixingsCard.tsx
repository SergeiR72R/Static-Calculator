import { useMemo, useState } from 'react';
import { useScaffold } from '../../scaffold/store';
import type { ScaffoldStructure } from '../../scaffold/structure';
import type { UserFixing } from '../../scaffold/userLoads';
import { Button, FoldCard, FoldState, HelpTip, NumberField, TextField, cx } from '../common';
import { useFmt } from '../hooks';

const AXES = ['x', 'y', 'z'] as const;

/**
 * Fixings of the scaffold to the building (or another structure) set by hand on parts chosen in the
 * 3D view: the axes held, the place along the part and the resistance of one fixing (optional).
 */
export function FixingsCard({ st }: { st: ScaffoldStructure }) {
  const fmt = useFmt();
  const sc = useScaffold();
  const [name, setName] = useState('');
  const [dirs, setDirs] = useState<('x' | 'y' | 'z')[]>(['x', 'y']);
  const [at, setAt] = useState(1);
  const [limit, setLimit] = useState(0);
  // a fixing along a part, or a support at the bottom of standards (springs per axis, pressure only)
  const [kind, setKind] = useState<'fixing' | 'support'>('fixing');
  const [k, setK] = useState<Record<'x' | 'y' | 'z', number>>({ x: 0, y: 0, z: 0 });
  const [compression, setCompression] = useState(true);
  const byId = useMemo(() => new Map(st.parts.map((w) => [w.part.id, w])), [st]);
  const isStd = (id: string) => ['standard', 'base'].includes(byId.get(id)?.cls.kind ?? '');
  const sel = sc.selected.filter((id) => byId.has(id) && (kind === 'fixing' || isStd(id)));
  const skipped = kind === 'support' ? sc.selected.filter((id) => byId.has(id) && !isStd(id)).length : 0;
  const add = () => {
    if (!sel.length || !dirs.length) return;
    const ks = Object.fromEntries(AXES.filter((d) => dirs.includes(d) && k[d] > 0).map((d) => [d, k[d]]));
    const f: UserFixing = {
      id: `F${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
      name: name.trim() || fmt.t(kind === 'support' ? 'scaffold.fix.supportDefault' : 'scaffold.fix.default'),
      parts: [...sel],
      at: kind === 'support' ? 0 : Math.min(Math.max(at, 0), 1),
      dirs: AXES.filter((d) => dirs.includes(d)),
      ...(limit > 0 ? { limit } : {}),
      ...(kind === 'support' ? { support: { ...(Object.keys(ks).length ? { k: ks } : {}), compression: dirs.includes('z') && compression } } : {}),
    };
    sc.addFixing(f);
    setName('');
  };
  const toggle = (d: 'x' | 'y' | 'z') => setDirs((v) => (v.includes(d) ? v.filter((x) => x !== d) : [...v, d]));

  return (
    <FoldCard title={fmt.t('scaffold.fix.title')} testId="scaffold-fixings" state={<FoldState items={sc.fixings.length ? [String(sc.fixings.length)] : []} />}>
      <p className="mb-2 text-xs text-slate-600 dark:text-slate-300">{fmt.t('scaffold.fix.intro')}</p>
      <div className="mb-2 flex gap-1" role="radiogroup" aria-label={fmt.t('scaffold.fix.kind')}>
        {(['fixing', 'support'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={kind === v}
            onClick={() => {
              setKind(v);
              setDirs(v === 'support' ? ['x', 'y', 'z'] : ['x', 'y']);
            }}
            className={cx('rounded-md border px-2 py-1 text-xs font-medium', kind === v ? 'border-accent-700 bg-accent-700 text-white' : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800')}
            data-testid={`scaffold-fix-kind-${v}`}
          >
            {fmt.t(`scaffold.fix.kind_${v}`)}
          </button>
        ))}
        <HelpTip id="scaffold.fixSupport" title={fmt.t('scaffold.fix.kind_support')} />
      </div>
      <div className="grid grid-cols-2 items-end gap-2 lg:grid-cols-6">
        <TextField className="col-span-2" label={fmt.t('scaffold.fix.name')} value={name} onChange={setName} placeholder={fmt.t('scaffold.fix.namePlaceholder')} testId="scaffold-fix-name" help="scaffold.fixName" />
        <div>
          <div className="mb-1 flex items-center gap-1">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{fmt.t('scaffold.fix.axes')}</p>
            <HelpTip id="scaffold.fixAxes" title={fmt.t('scaffold.fix.axes')} />
          </div>
          <div className="flex gap-2 pb-1.5 text-xs">
            {AXES.map((d) => (
              <label key={d} className="flex items-center gap-1">
                <input type="checkbox" checked={dirs.includes(d)} onChange={() => toggle(d)} data-testid={`scaffold-fix-${d}`} />
                {d.toUpperCase()}
              </label>
            ))}
          </div>
        </div>
        {kind === 'fixing' ? (
          <NumberField label={fmt.t('scaffold.fix.at')} value={at * 100} onChange={(v) => setAt(Math.min(Math.max(v / 100, 0), 1))} testId="scaffold-fix-at" help="scaffold.fixAt" />
        ) : (
          <label className="flex items-center gap-1 pb-1.5 text-xs">
            <input type="checkbox" checked={compression} disabled={!dirs.includes('z')} onChange={(e) => setCompression(e.target.checked)} data-testid="scaffold-fix-compression" />
            {fmt.t('scaffold.fix.compression')}
          </label>
        )}
        <NumberField label={fmt.t('scaffold.fix.limit')} q="force" value={limit} onChange={(v) => setLimit(Math.max(0, v))} testId="scaffold-fix-limit" help="scaffold.fixLimit" />
      </div>
      {kind === 'support' && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {AXES.map((d) => (
            <NumberField
              key={d}
              label={fmt.t('scaffold.fix.k', { d: d.toUpperCase() })}
              q="springTrans"
              value={k[d]}
              disabled={!dirs.includes(d)}
              onChange={(v) => setK((o) => ({ ...o, [d]: Math.max(0, v) }))}
              testId={`scaffold-fix-k-${d}`}
            />
          ))}
          <p className="col-span-3 text-[11px] text-slate-500">{fmt.t('scaffold.fix.kHint')}</p>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={add} disabled={!sel.length || !dirs.length} data-testid="scaffold-fix-add">
          {fmt.t(kind === 'support' ? 'scaffold.fix.addSupport' : 'scaffold.fix.add', { n: sel.length })}
        </Button>
        <span className="text-[11px] text-slate-500">{sel.length ? '' : fmt.t(kind === 'support' ? 'scaffold.fix.selectStandards' : 'scaffold.fix.selectHint')}</span>
        {skipped > 0 && <span className="text-[11px] text-amber-700 dark:text-amber-300">{fmt.t('scaffold.fix.notStandards', { n: skipped })}</span>}
      </div>

      {sc.fixings.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs" data-testid="scaffold-fix-table">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-slate-700">
                <th className="px-1.5 py-1 text-start font-medium">{fmt.t('scaffold.fix.name')}</th>
                <th className="px-1.5 py-1 text-start font-medium">{fmt.t('scaffold.fix.axes')}</th>
                <th className="px-1.5 py-1 text-end font-medium">{fmt.t('scaffold.fix.at')}</th>
                <th className="px-1.5 py-1 text-end font-medium">{fmt.t('scaffold.fix.points')}</th>
                <th className="px-1.5 py-1 text-end font-medium">{fmt.t('scaffold.fix.limit')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sc.fixings.map((f) => {
                const missing = f.parts.filter((id) => !byId.has(id)).length;
                const on = sc.selected.length === f.parts.length && f.parts.every((id) => sc.selected.includes(id));
                return (
                  <tr key={f.id} className={cx('border-b border-slate-100 dark:border-slate-800', on && 'bg-fuchsia-50 dark:bg-fuchsia-900/20')}>
                    <td className="px-1.5 py-1">
                      <button type="button" className="text-start underline" onClick={() => (on ? sc.select([]) : sc.select(f.parts))} aria-pressed={on}>
                        {f.name}
                      </button>
                    </td>
                    <td className="px-1.5 py-1 font-medium" data-testid={`scaffold-fix-axes-${f.id}`}>
                      {f.dirs.map((d) => (f.support?.k?.[d] ? `${d.toUpperCase()} ${fmt.q(f.support.k[d]!, 'springTrans', 0)}` : d.toUpperCase())).join(' + ')}
                      {f.support?.compression ? ` (${fmt.t('scaffold.fix.pressureShort')})` : ''}
                    </td>
                    <td className="num px-1.5 py-1 text-end">{f.support ? fmt.t('scaffold.fix.bottom') : `${fmt.num(f.at * 100, 0)} %`}</td>
                    <td className="num px-1.5 py-1 text-end">
                      {f.parts.length - missing}
                      {missing > 0 && <span className="ms-1 text-amber-600">(−{missing})</span>}
                    </td>
                    <td className="num px-1.5 py-1 text-end">{f.limit ? fmt.q(f.limit, 'force', 1) : '–'}</td>
                    <td className="px-1.5 py-1 text-end">
                      <Button size="sm" variant="ghost" onClick={() => sc.removeFixing(f.id)} aria-label={fmt.t('scaffold.fix.remove')} data-testid={`scaffold-fix-remove-${f.id}`}>
                        ✕
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </FoldCard>
  );
}
