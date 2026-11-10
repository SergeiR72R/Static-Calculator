import type { ScaffoldStructure } from '../../scaffold/structure';
import { LOAD_CLASSES } from '../../scaffold/catalog';
import { siteWind, useScaffold } from '../../scaffold/store';
import { useFmt } from '../hooks';
import { BRAND, FullLogo } from '../Brand';
import { LANG_LOCALE } from '../../units/format';
import type { ScaffoldRun } from './AnalysisCard';

const th = 'border border-slate-400 px-1.5 py-0.5 text-start font-semibold';
const td = 'border border-slate-400 px-1.5 py-0.5';
const tn = `${td} text-end num whitespace-nowrap`;

/** most checks in the report (the governing ones first) */
const MAX_CHECKS = 80;
const MAX_BASES = 25;

/**
 * Print / PDF report of the scaffold mode (window.print): site and conditions, loads, results of
 * the analysis (if run) and the specification of the parts with their weights.
 */
export function ScaffoldReport({ st, run }: { st: ScaffoldStructure; run: ScaffoldRun | null }) {
  const fmt = useFmt();
  const sc = useScaffold();
  const doc = sc.doc;
  const height = Math.max(st.max[2] - st.min[2], 1);
  const outdoor = sc.exposure === 'outdoor';
  const wind = siteWind(sc, height);
  const byId = new Map(st.parts.map((w) => [w.part.id, w]));
  const name = (id: string) => byId.get(id)?.part.name ?? id;
  const res = run?.result;
  const maxEta = res ? Math.max(0, ...res.checks.map((c) => c.eta)) : 0;
  const totalKg = st.bom.reduce((a, b) => a + (b.weight ?? 0) * b.count, 0);
  const noWeight = st.bom.filter((b) => b.weight === undefined).reduce((a, b) => a + b.count, 0);
  const pct = (e: number) => `${fmt.num(e * 100, 0)} %`;
  const checks = res ? res.checks.slice(0, MAX_CHECKS) : [];
  const failedChecks = res ? res.checks.filter((c) => c.eta > 1).length : 0;
  const bases = res ? [...res.bases].sort((a, b) => b.Vmax - a.Vmax) : [];
  const uplift = res ? res.bases.filter((b) => b.Vmin < 0) : [];
  const windText = [
    wind.qMax > 0 ? fmt.t('scaffold.wind.result', { qp: fmt.q(wind.qp, 'areaLoad'), q: fmt.q(wind.qMax, 'areaLoad'), h: fmt.q(height, 'length', 1) }) : fmt.t('scaffold.wind.none'),
    wind.source === 'de' && wind.zone ? fmt.t('scaffold.wind.zoneN', { n: wind.zone }) : '',
    wind.source === 'nl' && wind.zone ? `windgebied ${['', 'I', 'II', 'III'][wind.zone]}` : '',
    wind.vb0 ? `v_b,0 = ${fmt.num(wind.vb0, 1)} m/s` : '',
    wind.source === 'manual' ? fmt.t('scaffold.wind.manual') : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="print-only text-[11px] text-black" data-testid="scaffold-report">
      <header className="mb-3 border-b-2 pb-1" style={{ borderColor: BRAND.green }}>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-bold" style={{ color: BRAND.blue }}>
            {fmt.t('scaffold.report.title')}
          </h1>
          <FullLogo className="h-10" />
        </div>
        <p>
          {doc?.fileName || '–'} · {fmt.t('print.date')}: {new Date().toLocaleDateString(LANG_LOCALE[fmt.lang])} · {fmt.t('scaffold.report.software')}
        </p>
      </header>

      <h2 className="mt-2 text-base font-semibold">{fmt.t('scaffold.report.conditions')}</h2>
      <table className="my-1 border-collapse">
        <tbody>
          <tr>
            <th className={th}>{fmt.t('scaffold.site.title')}</th>
            <td className={td}>
              {sc.site
                ? `${sc.site.name} (${fmt.num(sc.site.lat, 4)}°, ${fmt.num(sc.site.lon, 4)}°${sc.site.elevation !== null ? `, ${fmt.num(sc.site.elevation, 0)} m ${fmt.t('scaffold.site.asl')}` : ''})`
                : fmt.t('scaffold.site.missing')}
            </td>
          </tr>
          <tr>
            <th className={th}>{fmt.t('scaffold.site.exposure')}</th>
            <td className={td}>{fmt.t(outdoor ? 'scaffold.site.outdoor' : 'scaffold.site.indoor')}</td>
          </tr>
          {outdoor && (
            <tr>
              <th className={th}>{fmt.t('scaffold.wind.title')}</th>
              <td className={td}>{windText}</td>
            </tr>
          )}
          {outdoor && (
            <tr>
              <th className={th}>{fmt.t('scaffold.report.snowIce')}</th>
              <td className={td}>
                {fmt.t('scaffold.site.snow')}: {sc.snow ? fmt.q(sc.snowLoad, 'areaLoad') : fmt.t('common.no')} · {fmt.t('scaffold.site.ice')}: {sc.ice ? fmt.q(sc.iceThickness, 'length') : fmt.t('common.no')}
              </td>
            </tr>
          )}
          <tr>
            <th className={th}>{fmt.t('scaffold.report.loadClass')}</th>
            <td className={td}>
              {sc.loadClass} ({fmt.q((LOAD_CLASSES[sc.loadClass] ?? 2) * 1e3, 'areaLoad')}) · {fmt.t('scaffold.report.deckG')}: {fmt.q(sc.g, 'areaLoad')}
            </td>
          </tr>
          <tr>
            <th className={th}>{fmt.t('scaffold.report.size')}</th>
            <td className={td}>
              {fmt.q(st.max[0] - st.min[0], 'length', 1)} × {fmt.q(st.max[1] - st.min[1], 'length', 1)} × {fmt.q(height, 'length', 1)} ·{' '}
              {fmt.t('scaffold.file.summary', { n: st.parts.length, types: st.bom.length, girders: st.girders.length })}
            </td>
          </tr>
        </tbody>
      </table>

      <h2 className="mt-3 text-base font-semibold">{fmt.t('scaffold.report.results')}</h2>
      {!res || !run ? (
        <p>{fmt.t('scaffold.report.notRun')}</p>
      ) : (
        <>
          <p className="font-semibold">
            max η = {pct(maxEta)} ·{' '}
            {fmt.t('scaffold.calc.summary', {
              g: fmt.q(res.totalG, 'force', 1),
              q: fmt.q(res.totalQ, 'force', 1),
              z: fmt.q(run.levels[res.level]?.z ?? 0, 'length'),
              n: res.unknowns,
              s: fmt.num(run.ms / 1000, 1),
            })}
          </p>
          {res.unstable.length > 0 && <p className="font-semibold text-red-700">{fmt.t('scaffold.report.unstable', { n: res.unstable.length })}</p>}
          <table className="my-1 border-collapse">
            <thead>
              <tr>
                <th className={th}>{fmt.t('scaffold.calc.combo')}</th>
                <th className={th}>{fmt.t('scaffold.calc.iter')}</th>
                <th className={th}>{fmt.t('scaffold.calc.dh')}</th>
                <th className={th}>{fmt.t('scaffold.calc.dv')}</th>
                <th className={th}>ΣV</th>
              </tr>
            </thead>
            <tbody>
              {res.combos.map((c) => (
                <tr key={c.name}>
                  <td className={td}>{c.name}</td>
                  {c.ok ? (
                    <>
                      <td className={tn}>{c.iterations}</td>
                      <td className={tn}>{fmt.q(c.dh, 'length', 1)}</td>
                      <td className={tn}>{fmt.q(c.dv, 'length', 1)}</td>
                      <td className={tn}>{fmt.q(c.sumV, 'force', 1)}</td>
                    </>
                  ) : (
                    <td className={td} colSpan={4}>
                      {fmt.t('scaffold.calc.mechanism')}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px]">{fmt.t('scaffold.calc.comboLegend')}</p>

          <h3 className="mt-2 font-semibold">{fmt.t('scaffold.report.checks', { n: checks.length, all: res.checks.length })}</h3>
          {failedChecks > 0 && <p className="text-red-700">{fmt.t('scaffold.report.failed', { n: failedChecks })}</p>}
          <table className="my-1 w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>{fmt.t('scaffold.calc.part')}</th>
                <th className={th}>{fmt.t('scaffold.calc.checkCol')}</th>
                <th className={th}>η</th>
                <th className={th}>{fmt.t('scaffold.calc.combo')}</th>
                <th className={th}>N</th>
                <th className={th}>M</th>
                <th className={th}>V</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={`${c.part}|${c.check}`} className="print-avoid-break">
                  <td className={td}>
                    {name(c.part)} <span className="text-slate-500">{c.part}</span>
                  </td>
                  <td className={td}>
                    {fmt.t(`scaffold.calc.check.${c.check}`)}
                    {c.detail ? ` · ${c.detail}` : ''}
                  </td>
                  <td className={`${tn} font-semibold`} style={{ color: c.eta > 1 ? '#b91c1c' : undefined }}>
                    {pct(c.eta)}
                  </td>
                  <td className={td}>{c.combo}</td>
                  <td className={tn}>{c.N !== undefined ? fmt.q(c.N, 'force', 2) : ''}</td>
                  <td className={tn}>{c.M !== undefined ? fmt.q(c.M, 'moment', 2) : ''}</td>
                  <td className={tn}>{c.V !== undefined ? fmt.q(c.V, 'force', 2) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="mt-2 font-semibold">{fmt.t('scaffold.calc.bases', { n: res.bases.length })}</h3>
          <p>
            {fmt.t('scaffold.calc.basesMax', { v: fmt.q(Math.max(0, ...res.bases.map((b) => b.Vmax)), 'force', 1), h: fmt.q(Math.max(0, ...res.bases.map((b) => b.H)), 'force', 1) })}
            {uplift.length > 0 && ` ${fmt.t('scaffold.report.uplift', { n: uplift.length })}`}
          </p>
          <table className="my-1 border-collapse">
            <thead>
              <tr>
                <th className={th}>{fmt.t('scaffold.calc.part')}</th>
                <th className={th}>x / y / z [m]</th>
                <th className={th}>V_max</th>
                <th className={th}>V_min</th>
                <th className={th}>H</th>
                <th className={th}>{fmt.t('scaffold.calc.combo')}</th>
              </tr>
            </thead>
            <tbody>
              {[...uplift, ...bases.filter((b) => b.Vmin >= 0)].slice(0, Math.max(MAX_BASES, uplift.length)).map((b) => {
                const w = byId.get(b.part);
                return (
                  <tr key={b.node}>
                    <td className={td}>{name(b.part)}</td>
                    <td className={tn}>{w ? [w.min[0] - st.min[0], w.min[1] - st.min[1], w.min[2] - st.min[2]].map((v) => fmt.num(v, 2)).join(' / ') : ''}</td>
                    <td className={tn}>{fmt.q(b.Vmax, 'force', 1)}</td>
                    <td className={tn} style={{ color: b.Vmin < 0 ? '#b91c1c' : undefined }}>
                      {fmt.q(b.Vmin, 'force', 1)}
                    </td>
                    <td className={tn}>{fmt.q(b.H, 'force', 1)}</td>
                    <td className={td}>{b.combo}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {res.anchors.length > 0 && (
            <>
              <h3 className="mt-2 font-semibold">{fmt.t('scaffold.calc.anchors', { n: res.anchors.length })}</h3>
              <table className="my-1 border-collapse">
                <thead>
                  <tr>
                    <th className={th}>{fmt.t('scaffold.calc.part')}</th>
                    <th className={th}>N_max</th>
                    <th className={th}>N_min</th>
                    <th className={th}>η</th>
                    <th className={th}>{fmt.t('scaffold.calc.combo')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...res.anchors]
                    .sort((a, b) => b.eta - a.eta)
                    .map((a) => (
                      <tr key={a.part}>
                        <td className={td}>
                          {name(a.part)} <span className="text-slate-500">{a.part}</span>
                        </td>
                        <td className={tn}>{fmt.q(a.Nmax, 'force', 2)}</td>
                        <td className={tn}>{fmt.q(a.Nmin, 'force', 2)}</td>
                        <td className={tn}>{pct(a.eta)}</td>
                        <td className={td}>{a.combo}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          )}

          {res.beams.length > 0 && (
            <>
              <h3 className="mt-2 font-semibold">{fmt.t('scaffold.beams.title', { n: res.beams.length })}</h3>
              <table className="my-1 border-collapse">
                <thead>
                  <tr>
                    <th className={th}>{fmt.t('scaffold.beams.beam')}</th>
                    <th className={th}>L</th>
                    <th className={th}>{fmt.t('scaffold.report.beamLoads')}</th>
                    <th className={th}>{fmt.t('scaffold.report.beamSupports')}</th>
                  </tr>
                </thead>
                <tbody>
                  {res.beams.map((b, k) => (
                    <tr key={b.part}>
                      <td className={td}>
                        B{k + 1} {name(b.part)}
                      </td>
                      <td className={tn}>{fmt.q(b.length, 'length', 2)}</td>
                      <td className={td}>
                        {b.points
                          .filter((p) => !p.support && p.F > 0)
                          .map((p) => `${fmt.num(p.t * b.length, 2)} m: ${fmt.q(p.F, 'force', 1)}`)
                          .join('; ') || '–'}
                      </td>
                      <td className={td}>
                        {b.points
                          .filter((p) => p.support)
                          .map((p) => `${fmt.num(p.t * b.length, 2)} m: ${fmt.q(p.F, 'force', 1)}`)
                          .join('; ') || '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {run.notes.length > 0 && (
            <>
              <h3 className="mt-2 font-semibold">{fmt.t('scaffold.calc.notes')}</h3>
              <ul className="list-disc ps-5">
                {run.notes.map((n) => (
                  <li key={n.key}>{fmt.t(`scaffold.calc.note.${n.key}`, { ...n.params, n: n.parts.length })}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {st.issues.some((i) => i.severity === 'warning') && (
        <>
          <h3 className="mt-2 font-semibold">{fmt.t('scaffold.issues.title')}</h3>
          <ul className="list-disc ps-5">
            {st.issues
              .filter((i) => i.severity === 'warning')
              .map((i, k) => (
                <li key={k}>{fmt.t(`scaffold.issue.${i.key}`, i.params)}</li>
              ))}
          </ul>
        </>
      )}

      <h2 className="print-page-break mt-3 text-base font-semibold">{fmt.t('scaffold.bom.title')}</h2>
      <table className="my-1 w-full border-collapse" data-testid="scaffold-report-bom">
        <thead>
          <tr>
            <th className={th}>{fmt.t('scaffold.bom.article')}</th>
            <th className={th}>{fmt.t('scaffold.bom.name')}</th>
            <th className={th}>{fmt.t('scaffold.bom.kind')}</th>
            <th className={th}>{fmt.t('scaffold.bom.count')}</th>
            <th className={th}>{fmt.t('scaffold.report.unitKg')}</th>
            <th className={th}>{fmt.t('scaffold.bom.weight')}, kg</th>
          </tr>
        </thead>
        <tbody>
          {st.bom.map((b) => (
            <tr key={b.article} className="print-avoid-break">
              <td className={`${td} num`}>{b.article}</td>
              <td className={td}>{b.desc || b.name}</td>
              <td className={td}>{fmt.t(`scaffold.kind.${b.kind}`)}</td>
              <td className={tn}>{b.count}</td>
              <td className={tn}>{b.weight !== undefined ? fmt.num(b.weight, 2) : '–'}</td>
              <td className={tn}>{b.weight !== undefined ? fmt.num(b.weight * b.count, 1) : '–'}</td>
            </tr>
          ))}
          <tr>
            <td className={`${td} font-semibold`} colSpan={3}>
              {fmt.t('scaffold.report.total')}
            </td>
            <td className={`${tn} font-semibold`}>{st.bom.reduce((a, b) => a + b.count, 0)}</td>
            <td className={td} />
            <td className={`${tn} font-semibold`}>{fmt.num(totalKg, 0)}</td>
          </tr>
        </tbody>
      </table>
      {noWeight > 0 && <p>{fmt.t('scaffold.report.noWeight', { n: noWeight })}</p>}

      <p className="mt-3 text-[10px] text-slate-600">{fmt.t('scaffold.calc.basis')}</p>
    </div>
  );
}
