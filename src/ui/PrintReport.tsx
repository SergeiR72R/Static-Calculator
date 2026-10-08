import { useStore } from '../state/store';
import { sectionLabel, sectionProps } from '../sections/properties';
import { designStrength } from '../sections/materials';
import { makeXScale, useFmt, useResults } from './hooks';
import { Schematic } from './results/Schematic';
import { Diagram, diagramSpecs } from './results/Diagrams';
import { ChecksCard, ExtremesCard, ReactionsCard } from './results/Kpi';
import { caseLabel } from './inputs/Editors';
import { comboLabel } from './inputs/Panels';
import { useReport } from './ReportTab';
import { ReportBody } from '../report/render';
import { viewLabel } from './viewLabel';

const W = 700;

/** Print / PDF report (window.print). Rendered only while printing; diagrams stay vector SVG. */
export function PrintReport() {
  const fmt = useFmt();
  const model = useStore((s) => s.model);
  const view = useStore((s) => s.view);
  const momentSide = useStore((s) => s.momentSide);
  const printReport = useStore((s) => s.printReport);
  const { an, vr } = useResults();
  const report = useReport();
  const sx = makeXScale(W, model.L);
  const th = 'border border-slate-400 px-1.5 py-0.5 text-left font-semibold';
  const td = 'border border-slate-400 px-1.5 py-0.5 text-right num';
  return (
    <div className="print-only text-[11px] text-black" data-testid="print-report">
      <header className="mb-3 border-b-2 border-black pb-1">
        <h1 className="text-xl font-bold">{model.name || fmt.t('app.title')}</h1>
        <p>
          {fmt.t('print.date')}: {new Date().toLocaleDateString(fmt.lang === 'en' ? 'en-US' : fmt.lang === 'ru' ? 'ru-RU' : 'de-DE')} · {viewLabel(fmt, model, view)} ·{' '}
          {fmt.t('print.software')}
        </p>
        {(model.author || model.description) && (
          <p>
            {model.author ? `${fmt.t('beam.author')}: ${model.author}` : ''}
            {model.author && model.description ? ' · ' : ''}
            {model.description ?? ''}
          </p>
        )}
      </header>

      <h2 className="mt-2 text-base font-semibold">{fmt.t('print.input')}</h2>
      <p>
        L = {fmt.q(model.L, 'length')} · {fmt.t('settings.theory')}: {fmt.t(model.settings.theory === 'euler' ? 'settings.euler' : 'settings.timoshenko')} ·{' '}
        {fmt.t('settings.selfWeight')}: {model.settings.selfWeight ? fmt.t('common.yes') : fmt.t('common.no')}
      </p>
      <table className="my-1 border-collapse">
        <thead>
          <tr>
            <th className={th}>{fmt.t('beam.segment')}</th>
            <th className={th}>x [{fmt.unit('length')}]</th>
            <th className={th}>{fmt.t('material.label')}</th>
            <th className={th}>E [{fmt.unit('modulus')}]</th>
            <th className={th}>f_d [{fmt.unit('stress')}]</th>
            <th className={th}>{fmt.t('section.label')}</th>
            <th className={th}>A [{fmt.unit('area')}]</th>
            <th className={th}>I_y [{fmt.unit('inertia')}]</th>
            <th className={th}>W_o / W_u [{fmt.unit('sectionModulus')}]</th>
          </tr>
        </thead>
        <tbody>
          {model.segments.map((s, i) => {
            const p = sectionProps(s.section);
            return (
              <tr key={s.id}>
                <td className={td}>{i + 1}</td>
                <td className={td}>
                  {fmt.num(fmt.val(s.x1, 'length'))} – {fmt.num(fmt.val(s.x2, 'length'))}
                </td>
                <td className={td}>{fmt.t(`material.preset.${s.material.preset}`)}</td>
                <td className={td}>{fmt.num(fmt.val(s.material.E, 'modulus'), 0)}</td>
                <td className={td}>{fmt.num(fmt.val(designStrength(s.material), 'stress'))}</td>
                <td className={td}>{sectionLabel(s.section)}</td>
                <td className={td}>{fmt.num(fmt.val(p.A, 'area'))}</td>
                <td className={td}>{fmt.num(fmt.val(p.I, 'inertia'))}</td>
                <td className={td}>
                  {fmt.num(fmt.val(p.Wtop, 'sectionModulus'))} / {fmt.num(fmt.val(p.Wbot, 'sectionModulus'))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-start gap-4">
        <table className="my-1 border-collapse">
          <thead>
            <tr>
              <th className={th}>{fmt.t('support.single')}</th>
              <th className={th}>x [{fmt.unit('length')}]</th>
              <th className={th}>{fmt.t('print.details')}</th>
            </tr>
          </thead>
          <tbody>
            {[...model.supports]
              .sort((a, b) => a.x - b.x)
              .map((s) => (
                <tr key={s.id}>
                  <td className={th}>{fmt.t(`support.types.${s.type}`)}</td>
                  <td className={td}>{fmt.num(fmt.val(s.x, 'length'))}</td>
                  <td className={td}>
                    {s.type === 'spring'
                      ? `k_u=${fmt.q(s.ku, 'springTrans')}, k_w=${fmt.q(s.kw, 'springTrans')}, k_θ=${fmt.q(s.kt, 'springRot')}`
                      : s.du || s.dw || s.dt
                        ? `Δu=${fmt.q(s.du, 'deflection')}, Δw=${fmt.q(s.dw, 'deflection')}, Δθ=${fmt.q(s.dt, 'rotation')}`
                        : ''}
                  </td>
                </tr>
              ))}
            {model.hinges.map((h) => (
              <tr key={h.id}>
                <td className={th}>{fmt.t('hinge.single')}</td>
                <td className={td}>{fmt.num(fmt.val(h.x, 'length'))}</td>
                <td className={td} />
              </tr>
            ))}
          </tbody>
        </table>
        <table className="my-1 border-collapse">
          <thead>
            <tr>
              <th className={th}>{fmt.t('load.case')}</th>
              <th className={th}>{fmt.t('report.loadType')}</th>
              <th className={th}>x [{fmt.unit('length')}]</th>
              <th className={th}>{fmt.t('report.loadValues')}</th>
            </tr>
          </thead>
          <tbody>
            {model.loads.map((l) => (
              <tr key={l.id}>
                <td className={th}>{caseLabel(fmt, model, l.caseId)}</td>
                <td className={th}>{l.kind === 'dist' ? fmt.t(l.dir === 'x' ? 'load.kinds.axial' : 'load.kinds.dist') : fmt.t(`load.kinds.${l.kind}`)}</td>
                <td className={td}>
                  {l.kind === 'dist' ? `${fmt.num(fmt.val(l.x1, 'length'))} – ${fmt.num(fmt.val(l.x2, 'length'))}` : fmt.num(fmt.val(l.x, 'length'))}
                </td>
                <td className={td}>
                  {l.kind === 'point'
                    ? `P = ${fmt.q(l.P, 'force')}, α = ${fmt.num(l.angle, 1)}°`
                    : l.kind === 'moment'
                      ? `M = ${fmt.q(l.M, 'moment')}`
                      : `${fmt.q(l.q1, 'lineLoad')} … ${fmt.q(l.q2, 'lineLoad')}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <table className="my-1 border-collapse">
        <thead>
          <tr>
            <th className={th}>{fmt.t('combo.title')}</th>
            <th className={th}>{fmt.t('combo.type')}</th>
          </tr>
        </thead>
        <tbody>
          {model.combinations.map((c) => (
            <tr key={c.id}>
              <td className={th}>{comboLabel(fmt, model, c)}</td>
              <td className={th}>{fmt.t(`combo.types.${c.type}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-3 text-base font-semibold">{fmt.t('print.system')}</h2>
      <Schematic sx={sx} />

      {an.ok && vr && (
        <>
          <div className="print-avoid-break mt-2 grid grid-cols-2 gap-2">
            <ReactionsCard />
            <ExtremesCard />
          </div>
          <h2 className="mt-3 text-base font-semibold">{fmt.t('print.diagrams')}</h2>
          {diagramSpecs(momentSide).map((s) => (
            <Diagram key={s.field} spec={s} vr={vr} an={an} sx={sx} height={100} />
          ))}
          <div className="print-avoid-break mt-2">
            <ChecksCard />
          </div>
        </>
      )}
      {printReport && report && (
        <div className="print-page-break">
          <h1 className="text-lg font-bold">{fmt.t('report.title')}</h1>
          <p>
            {fmt.t('report.loadSet')}: {report.loadSetLabel}
          </p>
          <ReportBody report={report} lang={fmt.lang} printMode />
        </div>
      )}
    </div>
  );
}
