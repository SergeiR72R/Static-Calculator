import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useScaffold, TERRAINS, type Site, type Terrain } from '../../scaffold/store';
import { EU_COUNTRIES, fetchElevation, reversePlace, searchPlace, type Place } from '../../scaffold/geo';
import { siteWind } from '../../scaffold/store';
import { Button, Card, NumberField, SelectField, cx } from '../common';
import { DialogShell } from '../DialogShell';
import { useFmt } from '../hooks';
import { IconAlert, IconCheck } from '../icons';

const SiteMap = lazy(() => import('./SiteMap'));

/** Search a place by name, confirm it on the map (draggable marker), height above sea level. */
function SiteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fmt = useFmt();
  const sc = useScaffold();
  const [query, setQuery] = useState(sc.site?.query ?? '');
  const [results, setResults] = useState<Place[] | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [pick, setPick] = useState<Site | null>(sc.site);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery(sc.site?.query ?? '');
    setPick(sc.site);
    setResults(null);
    setState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (p: Place, q = query, moved = false) => {
    const site: Site = { query: q, name: p.name, lat: p.lat, lon: p.lon, country: p.country, elevation: null, confirmed: false, admin: p.admin };
    setPick(site);
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    void fetchElevation(p.lat, p.lon, ac.signal).then((e) => !ac.signal.aborted && setPick((s) => (s && s.lat === p.lat && s.lon === p.lon ? { ...s, elevation: e } : s)));
    // administrative units in German (wind zone table), also after the marker was moved
    void reversePlace(p.lat, p.lon, ac.signal).then(
      (rp) => rp && !ac.signal.aborted && setPick((s) => (s && s.lat === p.lat && s.lon === p.lon ? { ...s, admin: rp.admin, country: rp.country || s.country, name: moved ? rp.name : s.name } : s)),
    );
  };

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setState('busy');
    try {
      const r = await searchPlace(q, fmt.lang);
      setResults(r);
      setState('idle');
      if (r.length) choose(r[0], q);
    } catch {
      setState('error');
      setResults(null);
    }
  };

  const confirm = () => {
    if (!pick) return;
    sc.setOpts({ site: { ...pick, confirmed: true } });
    onClose();
  };

  return (
    <DialogShell open={open} onOpenChange={(o) => !o && onClose()} title={fmt.t('scaffold.site.dialogTitle')} wide>
      <div className="space-y-3 text-sm" data-testid="site-dialog">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={fmt.t('scaffold.site.placeholder')}
            aria-label={fmt.t('scaffold.site.placeholder')}
            className="h-8 min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900"
            data-testid="site-query"
            autoFocus
          />
          <Button type="submit" variant="primary" disabled={state === 'busy' || !query.trim()} data-testid="site-search">
            {state === 'busy' ? fmt.t('scaffold.site.searching') : fmt.t('scaffold.site.search')}
          </Button>
        </form>
        {state === 'error' && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-red-600 dark:text-red-400">
            <span>{fmt.t('scaffold.site.offline')}</span>
            <Button size="sm" onClick={() => setPick({ query, name: query || '–', lat: 51, lon: 10, country: '', elevation: null, confirmed: false })} data-testid="site-manual">
              {fmt.t('scaffold.site.manual')}
            </Button>
          </div>
        )}
        {results && !results.length && <p className="text-xs text-amber-700 dark:text-amber-300">{fmt.t('scaffold.site.none')}</p>}
        {results && results.length > 1 && (
          <ul className="max-h-28 space-y-0.5 overflow-y-auto rounded border border-slate-200 p-1 text-xs dark:border-slate-700" data-testid="site-results">
            {results.map((r, k) => (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => choose(r)}
                  className={cx('w-full rounded px-1.5 py-0.5 text-start', pick?.lat === r.lat && pick?.lon === r.lon ? 'bg-accent-100 dark:bg-accent-900/40' : 'hover:bg-slate-100 dark:hover:bg-slate-800')}
                >
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {pick && (
          <>
            <p className="text-xs" data-testid="site-pick">
              <b>{pick.name}</b>
            </p>
            <Suspense fallback={<div className="h-72" />}>
              <SiteMap lat={pick.lat} lon={pick.lon} onMove={(lat, lon) => choose({ name: pick.name, lat, lon, country: pick.country, admin: pick.admin }, pick.query, true)} />
            </Suspense>
            <p className="text-[11px] text-slate-500">{fmt.t('scaffold.site.mapHint')}</p>
            <div className="grid grid-cols-3 gap-2">
              <NumberField label={fmt.t('scaffold.site.lat')} value={pick.lat} onChange={(v) => setPick({ ...pick, lat: v })} testId="site-lat" />
              <NumberField label={fmt.t('scaffold.site.lon')} value={pick.lon} onChange={(v) => setPick({ ...pick, lon: v })} testId="site-lon" />
              <NumberField
                label={fmt.t('scaffold.site.elevation')}
                q="length"
                showUnit
                value={pick.elevation ?? 0}
                onChange={(v) => setPick({ ...pick, elevation: v })}
                testId="site-elevation"
              />
            </div>
            {pick.country && !EU_COUNTRIES.has(pick.country) && (
              <p className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300">
                <IconAlert className="mt-0.5 shrink-0" width={12} height={12} /> {fmt.t('scaffold.site.notEu')}
              </p>
            )}
          </>
        )}
        {!pick && state !== 'busy' && <p className="text-xs text-slate-500">{fmt.t('scaffold.site.hint')}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{fmt.t('scaffold.site.cancel')}</Button>
          <Button variant="primary" disabled={!pick} onClick={confirm} data-testid="site-confirm">
            <IconCheck /> {fmt.t('scaffold.site.confirm')}
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}

/** Site and conditions of the scaffold: place (for wind / snow), outdoors or indoors, snow and ice. */
/** Maximum wind: zone of the site (Germany: official table), exposure, q_p; or v_b,0 / q_p by hand */
function WindBlock({ height }: { height: number }) {
  const fmt = useFmt();
  const sc = useScaffold();
  const w = siteWind(sc, height);
  const de = sc.site?.country === 'de';
  return (
    <div className="rounded border border-slate-200 p-2 text-xs dark:border-slate-700" data-testid="site-wind">
      <p className="mb-1 font-semibold">{fmt.t('scaffold.wind.title')}</p>
      <label className="mb-1 flex items-center gap-2">
        <input type="checkbox" checked={sc.windManual} onChange={(e) => sc.setOpts({ windManual: e.target.checked })} data-testid="wind-manual" />
        {fmt.t('scaffold.wind.manual')}
      </label>
      {sc.windManual ? (
        <NumberField label="q_p" q="areaLoad" showUnit value={sc.qMax} onChange={(v) => sc.setOpts({ qMax: Math.max(0, v) })} testId="wind-qmax" />
      ) : !sc.site ? (
        <p className="text-amber-700 dark:text-amber-300">{fmt.t('scaffold.wind.noSite')}</p>
      ) : de ? (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label={fmt.t('scaffold.wind.zone')}
              value={String(sc.windZone)}
              testId="wind-zone"
              options={[{ value: '0', label: w.zone && !sc.windZone ? fmt.t('scaffold.wind.zoneAuto', { n: w.zone }) : fmt.t('scaffold.wind.zoneNone') }, ...[1, 2, 3, 4].map((n) => ({ value: String(n), label: fmt.t('scaffold.wind.zoneN', { n }) }))]}
              onChange={(v) => sc.setOpts({ windZone: Number(v) })}
            />
            <SelectField
              label={fmt.t('scaffold.wind.exposure')}
              value={sc.windExposure}
              testId="wind-exposure"
              options={(['inland', 'coast', 'island'] as const).map((e) => ({ value: e, label: fmt.t(`scaffold.wind.exp.${e}`) }))}
              onChange={(v) => sc.setOpts({ windExposure: v })}
            />
          </div>
          {w.rows && w.rows.length > 0 && (
            <ul className={cx('space-y-0.5 text-[11px]', w.sure ? 'text-slate-500' : 'text-amber-800 dark:text-amber-300')} dir="ltr" lang="de">
              {w.rows.slice(0, 5).map((r, k) => (
                <li key={k}>{r}</li>
              ))}
            </ul>
          )}
          {w.zone && w.sure === false && !sc.windZone && (
            <p className="flex items-start gap-1 font-medium text-amber-700 dark:text-amber-300" data-testid="wind-check">
              <IconAlert className="mt-0.5 shrink-0" width={12} height={12} /> {fmt.t('scaffold.wind.confirm')}
            </p>
          )}
          {!w.zone && <p className="text-amber-700 dark:text-amber-300">{fmt.t('scaffold.wind.notFound')}</p>}
        </div>
      ) : (
        <div>
          <NumberField label={fmt.t('scaffold.wind.vb0')} value={sc.vb0} onChange={(v) => sc.setOpts({ vb0: Math.max(0, v) })} testId="wind-vb0" />
          <p className="mt-1 text-[11px] text-slate-500">{fmt.t('scaffold.wind.vb0Hint')}</p>
        </div>
      )}
      {!sc.windManual && (
        <label className="mt-1.5 flex items-center gap-2">
          <input type="checkbox" checked={sc.standing} onChange={(e) => sc.setOpts({ standing: e.target.checked })} />
          {fmt.t('scaffold.wind.standing')}
        </label>
      )}
      <p className="mt-1.5 font-medium" data-testid="wind-result">
        {w.qMax > 0
          ? fmt.t('scaffold.wind.result', { qp: fmt.q(w.qp, 'areaLoad'), q: fmt.q(w.qMax, 'areaLoad'), h: fmt.q(height, 'length', 1) })
          : fmt.t('scaffold.wind.none')}
      </p>
    </div>
  );
}

export function SiteCard({ height }: { height: number }) {
  const fmt = useFmt();
  const sc = useScaffold();
  const [open, setOpen] = useState(false);
  const outdoor = sc.exposure === 'outdoor';
  return (
    <Card title={fmt.t('scaffold.site.title')} testId="scaffold-site">
      <div className="mb-2 flex overflow-hidden rounded-md border border-slate-300 text-xs dark:border-slate-600" role="group" aria-label={fmt.t('scaffold.site.exposure')}>
        {(['outdoor', 'indoor'] as const).map((e) => (
          <button
            key={e}
            type="button"
            aria-pressed={sc.exposure === e}
            onClick={() => sc.setOpts({ exposure: e })}
            data-testid={`site-${e}`}
            className={cx('flex-1 px-2 py-1.5', sc.exposure === e ? 'bg-accent-700 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800')}
          >
            {fmt.t(`scaffold.site.${e}`)}
          </button>
        ))}
      </div>
      {!outdoor ? (
        <p className="text-xs text-slate-600 dark:text-slate-300">{fmt.t('scaffold.site.indoorHint')}</p>
      ) : (
        <div className="space-y-2">
          {sc.site ? (
            <div className="rounded border border-slate-200 p-2 text-xs dark:border-slate-700" data-testid="site-summary">
              <p className="font-semibold">{sc.site.name}</p>
              <p className="num text-slate-600 dark:text-slate-300">
                {fmt.num(sc.site.lat, 4)}°, {fmt.num(sc.site.lon, 4)}° · {sc.site.country.toUpperCase() || '–'}
                {sc.site.elevation !== null && ` · ${fmt.q(sc.site.elevation, 'length', 0)} ${fmt.t('scaffold.site.asl')}`}
              </p>
              <p className={cx('mt-1 inline-flex items-center gap-1 font-medium', sc.site.confirmed ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700')}>
                {sc.site.confirmed ? <IconCheck width={12} height={12} /> : <IconAlert width={12} height={12} />}
                {fmt.t(sc.site.confirmed ? 'scaffold.site.confirmed' : 'scaffold.site.unconfirmed')}
              </p>
            </div>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-300">{fmt.t('scaffold.site.missing')}</p>
          )}
          <Button size="sm" variant={sc.site ? 'default' : 'primary'} className="w-full justify-center" onClick={() => setOpen(true)} data-testid="site-open">
            {fmt.t(sc.site ? 'scaffold.site.change' : 'scaffold.site.set')}
          </Button>
          <SelectField
            label={fmt.t('scaffold.site.terrain')}
            value={sc.terrain}
            testId="site-terrain"
            options={TERRAINS.map((t) => ({ value: t, label: fmt.t(`scaffold.site.terrainOption.${t}`) }))}
            onChange={(v) => sc.setOpts({ terrain: v as Terrain })}
          />
          <WindBlock height={height} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sc.snow} onChange={(e) => sc.setOpts({ snow: e.target.checked })} data-testid="site-snow" />
            {fmt.t('scaffold.site.snow')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sc.ice} onChange={(e) => sc.setOpts({ ice: e.target.checked })} data-testid="site-ice" />
            {fmt.t('scaffold.site.ice')}
          </label>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{fmt.t('scaffold.site.windHint')}</p>
        </div>
      )}
      <SiteDialog open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}
