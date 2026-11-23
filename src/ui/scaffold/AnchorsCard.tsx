import { useMemo } from 'react';
import { useScaffold } from '../../scaffold/store';
import type { AnchorRole, ScaffoldStructure } from '../../scaffold/structure';
import { Button, FoldCard, FoldState, HelpTip, cx } from '../common';
import { useFmt } from '../hooks';

/**
 * Anchors to the building: as recognised from the drawing, and the tubes the user makes anchors or
 * not. The anchor force goes to the standards through all couplers of the tube; each is checked.
 */
export function AnchorsCard({ st }: { st: ScaffoldStructure }) {
  const fmt = useFmt();
  const sc = useScaffold();
  const byId = useMemo(() => new Map(st.parts.map((w) => [w.part.id, w])), [st]);
  // tubes among the selected parts (a tube can be an anchor)
  const tubes = sc.selected.filter((id) => {
    const k = byId.get(id)?.cls.kind;
    return k === 'tube' || k === 'anchor';
  });
  const roles = sc.anchorRoles;
  const anchorOf = useMemo(() => new Map(st.anchors.map((a) => [a.id, a])), [st]);
  // every tube of the drawing: anchors first, then by height
  const all = useMemo(
    () =>
      st.parts
        .filter((w) => w.cls.kind === 'tube' || w.cls.kind === 'anchor')
        .sort((p, q) => Number(anchorOf.has(q.part.id)) - Number(anchorOf.has(p.part.id)) || p.min[2] - q.min[2]),
    [st, anchorOf],
  );
  // chosen as anchors / struts but not possible (the tube touches no standard and no flat girder)
  const failed = Object.keys(roles).filter((id) => (roles[id] === 'anchor' || roles[id] === 'strut') && byId.has(id) && !st.anchors.some((a) => a.id === id));
  const changed = Object.keys(roles).filter((id) => byId.has(id)).length;
  const sel = (ids: string[]) => {
    const on = ids.length > 0 && sc.selected.length === ids.length && ids.every((id) => sc.selected.includes(id));
    sc.select(on ? [] : ids);
  };

  return (
    <FoldCard
      title={fmt.t('scaffold.anchor.title')}
      testId="scaffold-anchors"
      state={<FoldState items={[fmt.t('scaffold.anchor.count', { n: st.anchors.length }), ...(changed ? [fmt.t('scaffold.anchor.changed', { n: changed })] : [])]} />}
    >
      <p className="mb-2 text-xs text-slate-600 dark:text-slate-300">{fmt.t('scaffold.anchor.intro')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => sc.setAnchorRole(tubes, 'anchor')} disabled={!tubes.length} data-testid="scaffold-anchor-set">
          {fmt.t('scaffold.anchor.set', { n: tubes.length })}
        </Button>
        <Button size="sm" onClick={() => sc.setAnchorRole(tubes, 'strut')} disabled={!tubes.length} data-testid="scaffold-anchor-strut">
          ⇥ {fmt.t('scaffold.anchor.setStrut', { n: tubes.length })}
        </Button>
        <Button size="sm" onClick={() => sc.setAnchorRole(tubes, 'tube')} disabled={!tubes.length} data-testid="scaffold-anchor-unset">
          {fmt.t('scaffold.anchor.unset', { n: tubes.length })}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => sc.setAnchorRole(tubes, null)} disabled={!tubes.some((id) => roles[id])} data-testid="scaffold-anchor-reset">
          {fmt.t('scaffold.anchor.reset')}
        </Button>
        <HelpTip id="scaffold.anchorRole" title={fmt.t('scaffold.anchor.title')} />
        {!tubes.length && <span className="text-[11px] text-slate-500">{fmt.t('scaffold.anchor.selectHint')}</span>}
      </div>
      {failed.length > 0 && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300" data-testid="scaffold-anchor-failed">
          ⚠{' '}
          <button type="button" className="underline" onClick={() => sel(failed)}>
            {fmt.t('scaffold.anchor.failed', { n: failed.length })}
          </button>
        </p>
      )}

      {all.length > 0 && (
        <div className="mt-3 max-h-72 overflow-auto">
          <table className="w-full text-xs" data-testid="scaffold-anchor-table">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-slate-700">
                <th className="px-1.5 py-1 text-start font-medium">{fmt.t('scaffold.anchor.colTube')}</th>
                <th className="px-1.5 py-1 text-end font-medium">{fmt.t('scaffold.anchor.colZ')}</th>
                <th className="px-1.5 py-1 text-end font-medium">{fmt.t('scaffold.anchor.colCouplers')}</th>
                <th className="px-1.5 py-1 text-start font-medium">{fmt.t('scaffold.anchor.colRole')}</th>
              </tr>
            </thead>
            <tbody>
              {all.map((w) => {
                const id = w.part.id;
                const a = anchorOf.get(id);
                const on = sc.selected.includes(id);
                return (
                  <tr
                    key={id}
                    className={cx('border-b border-slate-100 dark:border-slate-800', on && 'bg-fuchsia-50 dark:bg-fuchsia-900/20', a && 'font-medium')}
                    data-testid={`scaffold-anchor-row-${id}`}
                    data-anchor={a ? '1' : '0'}
                    data-chosen={roles[id] ?? 'auto'}
                    data-couplers={a ? 1 + (a.via?.length ?? 0) : 0}
                  >
                    <td className="px-1.5 py-0.5">
                      <button type="button" className="text-start underline decoration-dotted" onClick={() => sel([id])} aria-pressed={on}>
                        {a ? (a.strut ? '⇥ ' : '⚓ ') : ''}
                        {w.part.name}
                      </button>
                    </td>
                    <td className="num px-1.5 py-0.5 text-end">{fmt.q((w.min[2] + w.max[2]) / 2, 'length', 2)}</td>
                    <td className="num px-1.5 py-0.5 text-end">{a ? 1 + (a.via?.length ?? 0) : '–'}</td>
                    <td className="px-1.5 py-0.5">
                      <select
                        className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800"
                        value={roles[id] ?? 'auto'}
                        onChange={(e) => sc.setAnchorRole([id], e.target.value === 'auto' ? null : (e.target.value as AnchorRole))}
                        aria-label={fmt.t('scaffold.anchor.colRole')}
                        data-testid={`scaffold-anchor-role-${id}`}
                      >
                        <option value="auto">{fmt.t(a && !roles[id] ? (a.strut ? 'scaffold.anchor.autoStrut' : 'scaffold.anchor.autoYes') : 'scaffold.anchor.autoNo')}</option>
                        <option value="anchor">{fmt.t('scaffold.anchor.optAnchor')}</option>
                        <option value="strut">{fmt.t('scaffold.anchor.optStrut')}</option>
                        <option value="tube">{fmt.t('scaffold.anchor.optTube')}</option>
                      </select>
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
