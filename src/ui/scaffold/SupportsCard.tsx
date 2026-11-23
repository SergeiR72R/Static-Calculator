import { useCallback, useEffect, useMemo, useState } from 'react';
import { beamEndFixings, beamsWithoutSupports } from '../../scaffold/beamSupports';
import { buildScaffoldModel } from '../../scaffold/model';
import { useScaffold } from '../../scaffold/store';
import type { ScaffoldStructure } from '../../scaffold/structure';
import { SUPPORT_KINDS, modelSupports, type SupportInfo, type SupportKind } from '../../scaffold/supports';
import { orderedAxis, type UserFixing } from '../../scaffold/userLoads';
import { Button, CheckField, FoldCard, FoldState, cx } from '../common';
import { useFmt } from '../hooks';
import { beamEndName } from './BeamSupportsPrompt';

/** colours of the kinds of supports (3D marks and the list) */
export const SUPPORT_COLOR: Record<SupportKind, number> = {
  base: 0x2563eb,
  baseUser: 0x0891b2,
  beamEnd: 0xea580c,
  anchor: 0x16a34a,
  strut: 0x9333ea,
  fixing: 0xdc2626,
  other: 0xca8a04,
};
const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** drawings up to this size: the supports are worked out by themselves when shown */
const AUTO_PARTS = 4000;

export interface ModelSupports {
  list: SupportInfo[] | null;
  stale: boolean;
  busy: boolean;
  build: () => void;
  /** the list is wanted (shown in 3D or the card open): built by itself for drawings not too large */
  want: (on: boolean) => void;
}

/** the supports of the model (built from the drawing and the choices of the user as the analysis does) */
export function useModelSupports(st: ScaffoldStructure | null): ModelSupports {
  const sc = useScaffold();
  const [res, setRes] = useState<{ sig: string; list: SupportInfo[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [wanted, setWanted] = useState(false);
  const sig = JSON.stringify([sc.doc?.fileName, st?.parts.length, sc.tol, sc.anchorRoles, sc.fixings, sc.supportsManual, sc.beamEnds, sc.ubkModel]);
  const build = useCallback(() => {
    if (!st) return;
    setBusy(true);
    // after the busy state is painted
    setTimeout(() => {
      try {
        const m = buildScaffoldModel(st, [], [], { ubk: sc.ubkModel, planLoads: false, capByArticle: sc.capByArticle, fixings: sc.fixings, supportsManual: sc.supportsManual, beamEnds: sc.beamEnds !== 'user' });
        setRes({ sig, list: modelSupports(m, sc.fixings) });
      } finally {
        setBusy(false);
      }
    }, 30);
  }, [st, sig, sc.ubkModel, sc.capByArticle, sc.fixings, sc.supportsManual, sc.beamEnds]);
  const stale = !!res && res.sig !== sig;
  useEffect(() => {
    if (st && (wanted || sc.showSupports) && st.parts.length <= AUTO_PARTS && (!res || stale) && !busy) build();
  }, [st, wanted, sc.showSupports, res, stale, busy, build]);
  return { list: res?.list ?? null, stale, busy, build, want: setWanted };
}

/**
 * All supports of the model: shown in the 3D view on demand, listed by kind, each changed in place
 * (an automatic one turned into one set by hand, removed; anchors and struts by the role of the tube).
 */
export function SupportsCard({ st, sup }: { st: ScaffoldStructure; sup: ModelSupports }) {
  const fmt = useFmt();
  const sc = useScaffold();
  const [kind, setKind] = useState<SupportKind | 'all'>('all');
  const [showAll, setShowAll] = useState(false);
  const byId = useMemo(() => new Map(st.parts.map((w) => [w.part.id, w])), [st]);
  const list = sup.list ?? [];
  const counts = SUPPORT_KINDS.map((k) => [k, list.filter((s) => s.kind === k).length] as const).filter(([, n]) => n > 0);
  const rows = list.filter((s) => kind === 'all' || s.kind === kind);
  const shown = showAll ? rows : rows.slice(0, 60);

  const fixingsCard = () => {
    const el = document.querySelector<HTMLDetailsElement>('[data-testid="scaffold-fixings"]');
    if (el) {
      el.open = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const newId = () => `F${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  /** an automatic base: as a support set by hand (then changed in "Fixings"), or none */
  const baseByHand = (s: SupportInfo, dirs: UserFixing['dirs']) => {
    sc.addFixing({
      id: newId(),
      name: fmt.t(dirs.length ? 'scaffold.fix.supportDefault' : 'scaffold.supports.noneName'),
      parts: [s.part],
      at: 0,
      dirs,
      support: { compression: dirs.includes('z') },
    });
    sc.select([s.part]);
    if (dirs.length) fixingsCard();
  };
  /** the automatic supports of the beams set by hand (all, as asked at import); `drop`: then without this one */
  const beamsByHand = (drop?: SupportInfo) => {
    const ends = beamsWithoutSupports(st, { suspended: sc.supportsManual, fixings: sc.fixings });
    const fs = beamEndFixings(ends, (e) => beamEndName(fmt.t, e));
    let keep = fs;
    if (drop) {
      // the end of the beam nearest to the support dropped
      const w = byId.get(drop.part);
      const l = w?.lines.reduce((a, b) => (Math.hypot(...b[1].map((v, i) => v - b[0][i])) > Math.hypot(...a[1].map((v, i) => v - a[0][i])) ? b : a));
      if (l) {
        const [A, B] = orderedAxis(l[0], l[1]);
        const at = Math.hypot(drop.p[0] - A[0], drop.p[1] - A[1]) <= Math.hypot(drop.p[0] - B[0], drop.p[1] - B[1]) ? 0 : 1;
        keep = fs.filter((f) => !(f.parts[0] === drop.part && f.at === at));
      }
    }
    sc.addFixings(keep);
    sc.setBeamEnds('user');
    sc.select([drop?.part ?? fs[0]?.parts[0]].filter((x): x is string => !!x));
    if (!drop) fixingsCard();
  };
  /** a fixing set by hand: this part out of it (the fixing gone with its last part) */
  const dropFixing = (s: SupportInfo) => {
    const f = sc.fixings.find((x) => x.id === s.fixing);
    if (!f) return;
    const parts = f.parts.filter((id) => id !== s.part);
    if (parts.length) sc.updateFixing(f.id, { parts });
    else sc.removeFixing(f.id);
  };

  const actions = (s: SupportInfo) => {
    const btn = (label: string, on: () => void, tid: string, title?: string) => (
      <Button key={tid} size="sm" variant="ghost" onClick={on} title={title} data-testid={`scaffold-sup-${tid}`}>
        {label}
      </Button>
    );
    switch (s.kind) {
      case 'base':
        return [btn(fmt.t('scaffold.supports.edit'), () => baseByHand(s, ['x', 'y', 'z']), 'edit', fmt.t('scaffold.supports.editBase')), btn('✕', () => baseByHand(s, []), 'remove', fmt.t('scaffold.supports.removeBase'))];
      case 'beamEnd':
        return [btn(fmt.t('scaffold.supports.edit'), () => beamsByHand(), 'edit', fmt.t('scaffold.supports.editBeam')), btn('✕', () => beamsByHand(s), 'remove', fmt.t('scaffold.supports.removeBeam'))];
      case 'anchor':
        return [btn('⇥', () => sc.setAnchorRole([s.part], 'strut'), 'strut', fmt.t('scaffold.anchor.optStrut')), btn('✕', () => sc.setAnchorRole([s.part], 'tube'), 'remove', fmt.t('scaffold.anchor.optTube'))];
      case 'strut':
        return [btn('⚓', () => sc.setAnchorRole([s.part], 'anchor'), 'anchor', fmt.t('scaffold.anchor.optAnchor')), btn('✕', () => sc.setAnchorRole([s.part], 'tube'), 'remove', fmt.t('scaffold.anchor.optTube'))];
      case 'fixing':
      case 'baseUser':
        return s.fixing
          ? [
              btn(
                fmt.t('scaffold.supports.edit'),
                () => {
                  sc.select([s.part]);
                  fixingsCard();
                },
                'edit',
                fmt.t('scaffold.supports.editFixing'),
              ),
              btn('✕', () => dropFixing(s), 'remove', fmt.t('scaffold.fix.remove')),
            ]
          : [];
      default:
        return [];
    }
  };

  return (
    <FoldCard
      title={fmt.t('scaffold.supports.title')}
      testId="scaffold-supports"
      onToggle={sup.want}
      state={<FoldState items={sup.list ? [fmt.t('scaffold.supports.count', { n: list.length })] : []} />}
    >
      <p className="mb-2 text-xs text-slate-600 dark:text-slate-300">{fmt.t('scaffold.supports.intro')}</p>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <CheckField checked={sc.showSupports} onChange={(v) => sc.setOpts({ showSupports: v })} label={fmt.t('scaffold.supports.show3d')} testId="scaffold-supports-3d" />
        <Button size="sm" onClick={sup.build} disabled={sup.busy} data-testid="scaffold-supports-build">
          {fmt.t(sup.busy ? 'scaffold.supports.building' : sup.list && !sup.stale ? 'scaffold.supports.rebuild' : 'scaffold.supports.build')}
        </Button>
        {sup.stale && <span className="text-[11px] text-amber-700 dark:text-amber-300">{fmt.t('scaffold.supports.stale')}</span>}
      </div>
      {sup.list && (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]" role="radiogroup" aria-label={fmt.t('scaffold.supports.title')}>
            {([['all', list.length] as const, ...counts] as const).map(([k, n]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => {
                  setKind(k);
                  sc.select(k === 'all' ? [] : [...new Set(list.filter((s) => s.kind === k).map((s) => s.part))]);
                }}
                className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5', kind === k ? 'border-accent-700 bg-accent-700 text-white' : 'border-slate-300 dark:border-slate-600')}
                data-testid={`scaffold-sup-kind-${k}`}
              >
                {k !== 'all' && <span className="inline-block h-2 w-2 rounded-full" style={{ background: css(SUPPORT_COLOR[k]) }} />}
                {fmt.t(`scaffold.supports.kind_${k}`)} {n}
              </button>
            ))}
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-xs" data-testid="scaffold-sup-table">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-slate-700">
                  <th className="px-1.5 py-1 text-start font-medium">{fmt.t('scaffold.supports.colKind')}</th>
                  <th className="px-1.5 py-1 text-start font-medium">{fmt.t('scaffold.supports.colPart')}</th>
                  <th className="px-1.5 py-1 text-end font-medium">{fmt.t('scaffold.anchor.colZ')}</th>
                  <th className="px-1.5 py-1 text-start font-medium">{fmt.t('scaffold.fix.axes')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((s, i) => {
                  const on = sc.selected.length === 1 && sc.selected[0] === s.part;
                  return (
                    <tr key={`${s.kind}-${s.node}-${i}`} className={cx('border-b border-slate-100 dark:border-slate-800', on && 'bg-fuchsia-50 dark:bg-fuchsia-900/20')} data-testid={`scaffold-sup-row-${s.kind}`}>
                      <td className="px-1.5 py-0.5">
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: css(SUPPORT_COLOR[s.kind]) }} />
                          {fmt.t(`scaffold.supports.kind_${s.kind}`)}
                        </span>
                      </td>
                      <td className="px-1.5 py-0.5">
                        <button type="button" className="text-start underline decoration-dotted" onClick={() => sc.select(on ? [] : [s.part])} aria-pressed={on}>
                          {byId.get(s.part)?.part.name ?? s.part}
                        </button>
                      </td>
                      <td className="num px-1.5 py-0.5 text-end">{fmt.q(s.p[2], 'length', 2)}</td>
                      <td className="px-1.5 py-0.5 font-medium">
                        {s.dirs.replace('r', ' ⟳').toUpperCase() || fmt.t('scaffold.fix.noSupport')}
                        {s.springs ? ` (${fmt.t('scaffold.supports.springs')})` : ''}
                        {s.compression ? ` (${fmt.t('scaffold.fix.pressureShort')})` : ''}
                      </td>
                      <td className="whitespace-nowrap px-1.5 py-0.5 text-end">{actions(s)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > shown.length && (
            <Button size="sm" variant="ghost" className="mt-1" onClick={() => setShowAll(true)} data-testid="scaffold-sup-all">
              {fmt.t('scaffold.supports.more', { n: rows.length - shown.length })}
            </Button>
          )}
          {counts.some(([k]) => k === 'other') && <p className="mt-2 text-[11px] text-slate-500">{fmt.t('scaffold.supports.otherHint')}</p>}
        </>
      )}
    </FoldCard>
  );
}
