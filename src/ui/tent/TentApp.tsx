import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useScaffold } from '../../scaffold/store';
import { analyzeScaffold } from '../../scaffold/structure';
import { useStore } from '../../state/store';
import {
  FRICTION,
  SNOW_ZONES,
  STANDING_DURATIONS,
  analyzeTent,
  partWeights,
  qpProfileDE,
  snowGroundDE,
  snowShape,
  standingFactor,
  tentGeometry,
  tentSizes,
  type Friction,
  type GirderResult,
  type SnowZone,
  type StandingDuration,
  type StandingMeasures,
  type TentInput,
} from '../../tent/tent';
import { useTent, type TentOpts } from '../../tent/store';
import type { ExposureDE } from '../../scaffold/wind';
import { Button, Card, HelpTip, NumberField, SelectField, cx } from '../common';
import { useFmt, type Fmt } from '../hooks';
import { openScaffoldFiles } from '../scaffold/openDxf';
import { useProgress } from '../scaffold/progress';

/** a value from the drawing that can be set by hand: field, and "from the drawing" when empty */
function OptField({ label, value, auto, q, onChange, testId }: { label: string; value: number | null; auto: number; q: Parameters<Fmt['q']>[1]; onChange: (v: number | null) => void; testId: string }) {
  const fmt = useFmt();
  return (
    <div className="flex items-end gap-1">
      <NumberField label={label} value={value ?? Number(auto.toPrecision(4))} q={q} onChange={(v) => onChange(v)} showUnit testId={testId} className="flex-1" />
      {value !== null && (
        <button type="button" className="mb-1 text-[11px] text-accent-700 underline dark:text-accent-300" onClick={() => onChange(null)} data-testid={`${testId}-auto`}>
          {fmt.t('tent.auto')}
        </button>
      )}
    </div>
  );
}

function EtaCell({ eta }: { eta: number | undefined }) {
  const fmt = useFmt();
  if (eta === undefined || Number.isNaN(eta)) return <td className="num px-2 py-1 text-end text-slate-400">–</td>;
  // lifted off (no weight left on the ground): not stable at all
  if (!Number.isFinite(eta))
    return (
      <td className="num px-2 py-1 text-end font-semibold text-red-700 dark:text-red-400" data-eta="1e9">
        ∞
      </td>
    );
  return (
    <td className={cx('num px-2 py-1 text-end font-semibold', eta > 1 ? 'text-red-700 dark:text-red-400' : eta > 0.7 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-400')} data-eta={eta.toFixed(3)}>
      {fmt.num(eta, 2)}
    </td>
  );
}

function Row({ label, value, testId }: { label: ReactNode; value: ReactNode; testId?: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-0.5 text-xs last:border-0 dark:border-slate-800" data-testid={testId}>
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span className="num text-end font-medium">{value}</span>
    </div>
  );
}

export default function TentApp() {
  const fmt = useFmt();
  const sc = useScaffold();
  const o = useTent();
  const fileRef = useRef<HTMLInputElement>(null);
  const doc = sc.doc;
  const st = useMemo(() => (doc ? analyzeScaffold(doc, { tol: sc.tol, anchorRoles: sc.anchorRoles }) : null), [doc, sc.tol, sc.anchorRoles]);
  const auto = useMemo(() => (st ? tentGeometry(st) : null), [st]);
  // the bar of reading the drawing ends with its structure
  useEffect(() => {
    if (st) useProgress.getState().setLoad(null);
  }, [st]);

  const geo = auto
    ? {
        L: o.L ?? auto.L,
        B: o.B ?? auto.B,
        hLow: o.hLow ?? auto.hLow,
        hHigh: o.hHigh ?? auto.hHigh,
        highAtStart: auto.highAtStart,
        ...(o.roofArea ? { roofArea: o.roofArea } : {}),
      }
    : null;
  const sizes = geo ? tentSizes(geo) : null;
  const weights = useMemo(() => (st && geo ? partWeights(st, geo) : null), [st, geo?.hLow]); // eslint-disable-line react-hooks/exhaustive-deps

  // wind
  const z = o.z ?? geo?.hHigh ?? 5;
  const kT = standingFactor(o.duration, o.measures);
  const qp0 = qpProfileDE(o.windZone, o.exposure, z);
  const qp = o.qpManual ?? qp0 * kT;
  // snow
  const sk = snowGroundDE(o.snowZone, o.altitude);
  const mu1 = o.mu1 ?? snowShape(sizes?.alpha ?? 0);
  const snow = o.snowManual ?? mu1 * o.ce * o.ct * sk;
  // self weight
  const roofArea = sizes?.roofArea ?? 0;
  const gRoofAuto = roofArea > 0 && weights ? weights.roof / roofArea + o.roofCladding : o.roofCladding;
  const gRoof = o.gRoofManual ?? gRoofAuto;
  const GkAuto = (weights?.total ?? 0) + o.roofCladding * roofArea + o.extraG;
  const Gk = o.GkManual ?? GkAuto;
  const mu = o.mu ?? FRICTION[o.friction];

  const input: TentInput | null = geo ? { geo, qp, snow, gRoof, Gk, cpe: o.cpe, mu, gammaMu: o.gammaMu, purlin: o.purlin, restraint: o.restraint } : null;
  const res = useMemo(() => (st && input ? analyzeTent(st.girders, input) : null), [st, JSON.stringify(input)]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxEta = res ? Math.max(...res.summary.map((s) => s.eta)) : 0;

  const set = (p: Partial<TentOpts>) => o.set(p);
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    await openScaffoldFiles([...files]);
  };
  const openGirder = (g: GirderResult) => {
    const app = useStore.getState();
    if (app.batch && !window.confirm(fmt.t('tent.girders.replaceConfirm'))) return;
    if (app.batch) app.closeBatch();
    app.loadModel({ ...g.model, name: `${g.key} ${g.product} · ${fmt.t('tent.title')}` });
    app.setPrefs({ appMode: 'beam' });
  };
  const N = (v: number, d = 2) => fmt.q(v, 'force', d);
  const P = (v: number) => fmt.q(v, 'areaLoad', 2);
  const M = (v: number) => fmt.q(v, 'moment', 2);
  const Lm = (v: number) => fmt.q(v, 'length', 2);
  const A = (v: number) => `${fmt.num(v, 2)} m²`;

  return (
    <main className="no-print-none grid flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(340px,420px)_1fr]" data-testid="tent-app">
      <div className="space-y-3">
        <Card title={fmt.t('tent.title')} testId="tent-drawing">
          <p className="mb-2 text-xs text-slate-600 dark:text-slate-300">{fmt.t('tent.intro')}</p>
          <input ref={fileRef} type="file" accept=".dxf,.txt" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} data-testid="tent-file" />
          <Button variant="primary" size="sm" onClick={() => fileRef.current?.click()} data-testid="tent-open">
            {fmt.t('scaffold.open')}
          </Button>
          {doc && (
            <p className="mt-2 text-xs" data-testid="tent-loaded">
              {fmt.t('tent.loaded', { file: doc.fileName, n: doc.parts.length, g: st?.girders.length ?? 0 })}
            </p>
          )}
        </Card>

        {geo && auto && sizes && (
          <Card title={fmt.t('tent.geometry')} testId="tent-geometry">
            <div className="grid grid-cols-2 gap-2">
              <OptField label={fmt.t('tent.L')} value={o.L} auto={auto.L} q="length" onChange={(v) => set({ L: v })} testId="tent-L" />
              <OptField label={fmt.t('tent.B')} value={o.B} auto={auto.B} q="length" onChange={(v) => set({ B: v })} testId="tent-B" />
              <OptField label={fmt.t('tent.hLow')} value={o.hLow} auto={auto.hLow} q="length" onChange={(v) => set({ hLow: v })} testId="tent-hLow" />
              <OptField label={fmt.t('tent.hHigh')} value={o.hHigh} auto={auto.hHigh} q="length" onChange={(v) => set({ hHigh: v })} testId="tent-hHigh" />
              <OptField label={`${fmt.t('tent.roofArea')} [m²]`} value={o.roofArea} auto={sizes.roofArea} q="factor" onChange={(v) => set({ roofArea: v })} testId="tent-roofArea" />
            </div>
            <Row label={fmt.t('tent.pitch')} value={`${fmt.num(sizes.alpha, 1)}°`} testId="tent-pitch" />
          </Card>
        )}

        <Card title={fmt.t('tent.wind')} testId="tent-wind">
          <div className="grid grid-cols-2 gap-2">
            <SelectField label={fmt.t('tent.windZone')} value={String(o.windZone)} options={[1, 2, 3, 4].map((v) => ({ value: String(v), label: String(v) }))} onChange={(v) => set({ windZone: Number(v) })} testId="tent-windZone" />
            <SelectField<ExposureDE>
              label={fmt.t('tent.exposure')}
              value={o.exposure}
              options={(['inland', 'coast', 'island'] as const).map((v) => ({ value: v, label: fmt.t(`scaffold.wind.exp.${v}`) }))}
              onChange={(v) => set({ exposure: v })}
              testId="tent-exposure"
            />
            <OptField label={fmt.t('tent.z')} value={o.z} auto={geo?.hHigh ?? 5} q="length" onChange={(v) => set({ z: v })} testId="tent-z" />
            <SelectField<StandingDuration> label={fmt.t('tent.duration')} value={o.duration} options={STANDING_DURATIONS.map((v) => ({ value: v, label: fmt.t(`tent.dur.${v}`) }))} onChange={(v) => set({ duration: v })} testId="tent-duration" />
            <SelectField<StandingMeasures>
              label={fmt.t('tent.measures')}
              value={o.measures}
              options={(['none', 'reinforce', 'protect'] as const).map((v) => ({ value: v, label: fmt.t(`tent.meas.${v}`) }))}
              onChange={(v) => set({ measures: v })}
              testId="tent-measures"
            />
            <OptField label={fmt.t('tent.qp')} value={o.qpManual} auto={qp0 * kT} q="areaLoad" onChange={(v) => set({ qpManual: v })} testId="tent-qp" />
          </div>
          <Row label={fmt.t('tent.qpRow', { z: Lm(z) })} value={P(qp0)} />
          <Row label="k(T)" value={fmt.num(kT, 2)} />
          <Row label={fmt.t('tent.qpT')} value={P(qp)} testId="tent-qp-value" />
          <p className="mt-2 text-xs font-semibold">{fmt.t('tent.cpe')}</p>
          <div className="grid grid-cols-2 gap-2">
            {(['roofLow', 'roofHigh', 'wallPressure', 'wallSuction'] as const).map((k) => (
              <NumberField key={k} label={fmt.t(`tent.cpeKey.${k}`)} value={o.cpe[k]} onChange={(v) => set({ cpe: { ...o.cpe, [k]: v } })} testId={`tent-cpe-${k}`} />
            ))}
          </div>
        </Card>

        <Card title={fmt.t('tent.snow')} testId="tent-snow">
          <div className="grid grid-cols-2 gap-2">
            <SelectField<SnowZone> label={fmt.t('tent.snowZone')} value={o.snowZone} options={SNOW_ZONES.map((v) => ({ value: v, label: v }))} onChange={(v) => set({ snowZone: v })} testId="tent-snowZone" />
            <NumberField label={fmt.t('tent.altitude')} value={o.altitude} q="length" showUnit onChange={(v) => set({ altitude: v })} testId="tent-altitude" />
            <OptField label="μ1" value={o.mu1} auto={snowShape(sizes?.alpha ?? 0)} q="factor" onChange={(v) => set({ mu1: v })} testId="tent-mu1" />
            <NumberField label="Ce" value={o.ce} onChange={(v) => set({ ce: v })} testId="tent-ce" />
            <NumberField label="Ct" value={o.ct} onChange={(v) => set({ ct: v })} testId="tent-ct" />
            <OptField label={fmt.t('tent.s')} value={o.snowManual} auto={mu1 * o.ce * o.ct * sk} q="areaLoad" onChange={(v) => set({ snowManual: v })} testId="tent-s" />
          </div>
          <Row label={fmt.t('tent.sk')} value={P(sk)} />
          <Row label={fmt.t('tent.sRoof')} value={P(snow)} testId="tent-snow-value" />
        </Card>

        <Card title={fmt.t('tent.weight')} testId="tent-weight">
          <div className="grid grid-cols-2 gap-2">
            <NumberField label={fmt.t('tent.roofCladding')} value={o.roofCladding} q="areaLoad" showUnit onChange={(v) => set({ roofCladding: v })} testId="tent-roofCladding" />
            <NumberField label={fmt.t('tent.extraG')} value={o.extraG} q="force" showUnit onChange={(v) => set({ extraG: v })} testId="tent-extraG" />
            <OptField label={fmt.t('tent.gRoof')} value={o.gRoofManual} auto={gRoofAuto} q="areaLoad" onChange={(v) => set({ gRoofManual: v })} testId="tent-gRoof" />
            <OptField label={fmt.t('tent.Gk')} value={o.GkManual} auto={GkAuto} q="force" onChange={(v) => set({ GkManual: v })} testId="tent-Gk" />
          </div>
          {weights && (
            <>
              <Row label={fmt.t('tent.partsWeight')} value={N(weights.total, 1)} />
              <Row label={fmt.t('tent.roofParts')} value={N(weights.roof, 1)} />
              {weights.unknown > 0 && <p className="text-[11px] text-amber-700 dark:text-amber-300">{fmt.t('tent.unknownWeight', { n: weights.unknown })}</p>}
            </>
          )}
        </Card>

        <Card title={fmt.t('tent.ground')} testId="tent-ground">
          <div className="grid grid-cols-2 gap-2">
            <SelectField<Friction> label={fmt.t('tent.friction')} value={o.friction} options={(Object.keys(FRICTION) as Friction[]).map((v) => ({ value: v, label: fmt.t(`tent.fr.${v}`) }))} onChange={(v) => set({ friction: v, mu: null })} testId="tent-friction" />
            <OptField label="μ" value={o.mu} auto={FRICTION[o.friction]} q="factor" onChange={(v) => set({ mu: v })} testId="tent-mu" />
            <NumberField label="γ_M (μ)" value={o.gammaMu} onChange={(v) => set({ gammaMu: v })} testId="tent-gammaMu" />
          </div>
          <p className="mt-2 text-xs font-semibold">{fmt.t('tent.girdersSettings')}</p>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label={fmt.t('tent.purlin')} value={o.purlin} q="length" showUnit onChange={(v) => set({ purlin: v })} testId="tent-purlin" />
            <NumberField label={fmt.t('tent.restraint')} value={o.restraint} q="length" showUnit onChange={(v) => set({ restraint: v })} testId="tent-restraint" />
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="ghost" onClick={o.reset} data-testid="tent-reset">
              {fmt.t('tent.reset')}
            </Button>
            <HelpTip id="tent.method" title={fmt.t('tent.title')} />
          </div>
        </Card>
      </div>

      <div className="space-y-3">
        {!res && (
          <Card testId="tent-empty">
            <p className="text-sm text-slate-600 dark:text-slate-300">{fmt.t('tent.empty')}</p>
          </Card>
        )}
        {res && input && sizes && (
          <>
            <Card title={fmt.t('tent.summary')} testId="tent-summary">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700">
                    <th className="px-2 py-1 text-start font-medium">{fmt.t('tent.check')}</th>
                    <th className="px-2 py-1 text-start font-medium">{fmt.t('tent.where')}</th>
                    <th className="px-2 py-1 text-end font-medium">max η</th>
                  </tr>
                </thead>
                <tbody>
                  {res.summary.map((s) => (
                    <tr key={s.key} className="border-b border-slate-100 dark:border-slate-800" data-testid={`tent-sum-${s.key}`}>
                      <td className="px-2 py-1">{fmt.t(`tent.sum.${s.key}`)}</td>
                      <td className="px-2 py-1 text-xs text-slate-500">{s.girder ?? ''}</td>
                      <EtaCell eta={s.eta} />
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={cx('mt-2 text-sm font-semibold', maxEta <= 1 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')} data-testid="tent-verdict">
                {fmt.t(maxEta <= 1 ? 'tent.ok' : 'tent.notOk', { eta: fmt.num(maxEta, 2) })}
              </p>
            </Card>

            <Card title={fmt.t('tent.loads')} testId="tent-loads">
              <div className="grid gap-x-6 md:grid-cols-2">
                <div>
                  <Row label={fmt.t('tent.wallA', { a: A(sizes.wallA) })} value={N(res.wind.wallA)} />
                  <Row label={fmt.t('tent.wallB', { a: A(sizes.wallB) })} value={N(res.wind.wallB)} />
                  <Row label={fmt.t('tent.across')} value={N(res.wind.across)} testId="tent-across" />
                  <Row label={fmt.t('tent.along', { a: A(sizes.gable) })} value={N(res.wind.along)} />
                </div>
                <div>
                  <Row label={fmt.t('tent.uplift', { a: A(sizes.roofArea) })} value={N(res.wind.uplift)} testId="tent-uplift" />
                  <Row label={fmt.t('tent.GkRow')} value={N(Gk)} />
                  <Row label={fmt.t('tent.Nd')} value={N(res.stability.Nd)} testId="tent-Nd" />
                  <Row label={fmt.t('tent.gRoofRow')} value={P(gRoof)} />
                </div>
              </div>
            </Card>

            <Card title={fmt.t('tent.stability')} testId="tent-stability">
              <div className="grid gap-x-6 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold">{fmt.t('tent.sum.sliding')}</p>
                  <Row label="F_f,Ed = 1,5 · H" value={N(res.stability.FfEd)} />
                  <Row label={`F_f,Rd = μ · N_d / γ_M = ${fmt.num(mu, 2)} · N_d / ${fmt.num(o.gammaMu, 2)}`} value={N(res.stability.FfRd)} />
                  <Row label="η" value={fmt.num(res.stability.etaSliding, 2)} testId="tent-eta-sliding" />
                </div>
                <div>
                  <p className="text-xs font-semibold">{fmt.t('tent.sum.overturning')}</p>
                  <Row label={`M_dst = 1,5 · H · ${Lm(res.stability.hLever)}`} value={M(res.stability.Mdst)} />
                  <Row label={`M_stb = N_d · ${Lm(res.stability.bLever)}`} value={M(res.stability.Mstb)} />
                  <Row label="η" value={fmt.num(res.stability.etaOverturning, 2)} testId="tent-eta-overturning" />
                </div>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{fmt.t(`tent.dir.${res.stability.dir}`)}</p>
            </Card>

            <Card title={fmt.t('tent.girders.title')} testId="tent-girders">
              {res.girders.length === 0 ? (
                <p className="text-xs text-slate-500">{fmt.t('tent.girders.none')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-slate-700">
                        <th className="px-2 py-1 text-start font-medium">{fmt.t('tent.girders.girder')}</th>
                        <th className="px-2 py-1 text-end font-medium">{fmt.t('tent.girders.width')}</th>
                        <th className="px-2 py-1 text-end font-medium">{fmt.t('tent.girders.loads')}</th>
                        <th className="px-2 py-1 text-end font-medium">{fmt.t('tent.sum.chord')}</th>
                        <th className="px-2 py-1 text-end font-medium">{fmt.t('tent.sum.buckling')}</th>
                        <th className="px-2 py-1 text-end font-medium">{fmt.t('tent.sum.diagonal')}</th>
                        <th className="px-2 py-1 text-end font-medium">{fmt.t('tent.sum.coupler')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {res.girders.map((g) => {
                        const mid = g.points[Math.min(1, g.points.length - 1)];
                        return (
                          <tr key={g.key} className="border-b border-slate-100 dark:border-slate-800" data-testid={`tent-girder-${g.key}`}>
                            <td className="px-2 py-1">
                              {g.key} {g.product} · {Lm(g.L)}
                            </td>
                            <td className="num px-2 py-1 text-end">{Lm(g.width)}</td>
                            <td className="num px-2 py-1 text-end" title={fmt.t('tent.girders.loadsTitle')}>
                              {N(mid.G)} / {N(mid.S)} / {N(-mid.W)}
                            </td>
                            <EtaCell eta={g.chord?.eta} />
                            <EtaCell eta={g.buckling?.eta} />
                            <EtaCell eta={g.diagonal?.eta} />
                            <EtaCell eta={g.bearing?.eta} />
                            <td className="px-2 py-1 text-end">
                              <button type="button" className="text-accent-700 underline dark:text-accent-300" onClick={() => openGirder(g)} data-testid={`tent-open-${g.key}`}>
                                {fmt.t('tent.girders.open')}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-1 text-[11px] text-slate-500">{fmt.t('tent.girders.note', { a: Lm(o.purlin), r: Lm(o.restraint) })}</p>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
