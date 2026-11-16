import { useMemo, useState } from 'react';
import { useScaffold } from '../../scaffold/store';
import type { ScaffoldStructure } from '../../scaffold/structure';
import type { UserFixing } from '../../scaffold/userLoads';
import { Button, Card, NumberField, TextField, cx } from '../common';
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
  const byId = useMemo(() => new Map(st.parts.map((w) => [w.part.id, w])), [st]);
  const sel = sc.selected.filter((id) => byId.has(id));
  const add = () => {
    if (!sel.length || !dirs.length) return;
    const f: UserFixing = {
      id: `F${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
      name: name.trim() || fmt.t('scaffold.fix.default'),
      parts: [...sel],
      at: Math.min(Math.max(at, 0), 1),
      dirs: AXES.filter((d) => dirs.includes(d)),
      ...(limit > 0 ? { limit } : {}),
    };
    sc.addFixing(f);
    setName('');
  };
  const toggle = (d: 'x' | 'y' | 'z') => setDirs((v) => (v.includes(d) ? v.filter((x) => x !== d) : [...v, d]));

  return (
    <Card title={fmt.t('scaffold.fix.title')} testId="scaffold-fixings">
      <p className="mb-2 text-xs text-slate-600 dark:text-slate-300">{fmt.t('scaffold.fix.intro')}</p>
      <div className="grid grid-cols-2 items-end gap-2 lg:grid-cols-6">
        <TextField className="col-span-2" label={fmt.t('scaffold.fix.name')} value={name} onChange={setName} placeholder={fmt.t('scaffold.fix.namePlaceholder')} testId="scaffold-fix-name" />
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">{fmt.t('scaffold.fix.axes')}</p>
          <div className="flex gap-2 pb-1.5 text-xs">
            {AXES.map((d) => (
              <label key={d} className="flex items-center gap-1">
                <input type="checkbox" checked={dirs.includes(d)} onChange={() => toggle(d)} data-testid={`scaffold-fix-${d}`} />
                {d.toUpperCase()}
              </label>
            ))}
          </div>
        </div>
        <NumberField label={fmt.t('scaffold.fix.at')} value={at * 100} onChange={(v) => setAt(Math.min(Math.max(v / 100, 0), 1))} testId="scaffold-fix-at" />
        <NumberField label={fmt.t('scaffold.fix.limit')} q="force" value={limit} onChange={(v) => setLimit(Math.max(0, v))} testId="scaffold-fix-limit" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={add} disabled={!sel.length || !dirs.length} data-testid="scaffold-fix-add">
          {fmt.t('scaffold.fix.add', { n: sel.length })}
        </Button>
        <span className="text-[11px] text-slate-500">{sel.length ? '' : fmt.t('scaffold.fix.selectHint')}</span>
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
                    <td className="px-1.5 py-1 font-medium">{f.dirs.map((d) => d.toUpperCase()).join(' + ')}</td>
                    <td className="num px-1.5 py-1 text-end">{fmt.num(f.at * 100, 0)} %</td>
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
    </Card>
  );
}
