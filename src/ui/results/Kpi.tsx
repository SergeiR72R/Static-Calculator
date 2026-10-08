import type { Field } from '../../core/postprocess';
import { useStore } from '../../state/store';
import { Badge, Card, cx } from '../common';
import { useFmt, useResults } from '../hooks';
import { IconAlert, IconInfo } from '../icons';
import type { Quantity } from '../../units/units';

export function ReactionsCard() {
  const fmt = useFmt();
  const { an, vr } = useResults();
  if (!vr) return null;
  const sups = an.model.supports.map((s, i) => ({ s, i })).sort((a, b) => a.s.x - b.s.x);
  const env = vr.kind === 'envelope';
  const cell = (i: number, c: number, q: Quantity) => {
    const mx = vr.reactions.max[3 * i + c];
    const mn = vr.reactions.min[3 * i + c];
    if (env && Math.abs(mx - mn) > 1e-9 * Math.max(1, Math.abs(mx))) return `${fmt.num(fmt.val(mn, q))} … ${fmt.num(fmt.val(mx, q))}`;
    return fmt.num(fmt.val(mx, q));
  };
  return (
    <Card title={fmt.t('kpi.reactions')} testId="kpi-reactions">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-1 text-left font-medium">{fmt.t('support.single')}</th>
              <th className="text-right font-medium">x [{fmt.unit('length')}]</th>
              <th className="text-right font-medium">R_x [{fmt.unit('force')}]</th>
              <th className="text-right font-medium">R_z [{fmt.unit('force')}]</th>
              <th className="text-right font-medium">M_R [{fmt.unit('moment')}]</th>
            </tr>
          </thead>
          <tbody className="num">
            {sups.map(({ s, i }) => (
              <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800" data-testid={`reaction-${s.id}`}>
                <td className="py-1 text-left">
                  {fmt.t(`support.types.${s.type}`)}
                  {s.type === 'spring' && <span className="ml-1 text-[10px] text-slate-500">({fmt.t('kpi.springForce')})</span>}
                </td>
                <td className="text-right">{fmt.num(fmt.val(s.x, 'length'))}</td>
                <td className="text-right">{cell(i, 0, 'force')}</td>
                <td className="text-right" data-testid="reaction-Rz">{cell(i, 1, 'force')}</td>
                <td className="text-right">{cell(i, 2, 'moment')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[10.5px] text-slate-500 dark:text-slate-400">{fmt.t('kpi.reactionSigns')}</p>
    </Card>
  );
}

export function ExtremesCard() {
  const fmt = useFmt();
  const { vr } = useResults();
  if (!vr) return null;
  const rows: { f: Field; q: Quantity }[] = [
    { f: 'N', q: 'force' },
    { f: 'V', q: 'force' },
    { f: 'M', q: 'moment' },
    { f: 'w', q: 'deflection' },
  ];
  const ex = vr.extremes;
  return (
    <Card title={fmt.t('kpi.extremes')} testId="kpi-extremes">
      <table className="w-full text-xs">
        <thead className="text-slate-500 dark:text-slate-400">
          <tr>
            <th className="py-1 text-left font-medium" />
            <th className="text-right font-medium">max</th>
            <th className="text-right font-medium">x</th>
            <th className="text-right font-medium">min</th>
            <th className="text-right font-medium">x</th>
          </tr>
        </thead>
        <tbody className="num">
          {rows.map(({ f, q }) => (
            <tr key={f} className="border-t border-slate-100 dark:border-slate-800" data-testid={`extreme-row-${f}`}>
              <td className="py-1 text-left font-semibold">
                {fmt.t(`sym.${f}`)} <span className="font-normal text-slate-500">[{fmt.unit(q)}]</span>
              </td>
              <td className="text-right" data-testid={`kpi-${f}-max`}>
                {fmt.num(fmt.val(ex[f].max.value, q))}
              </td>
              <td className="text-right text-slate-500">{fmt.num(fmt.val(ex[f].max.x, 'length'))}</td>
              <td className="text-right" data-testid={`kpi-${f}-min`}>
                {fmt.num(fmt.val(ex[f].min.value, q))}
              </td>
              <td className="text-right text-slate-500">{fmt.num(fmt.val(ex[f].min.x, 'length'))}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-100 dark:border-slate-800">
            <td className="py-1 text-left font-semibold">
              σ<sub>max</sub> <span className="font-normal text-slate-500">[{fmt.unit('stress')}]</span>
            </td>
            <td className="text-right" data-testid="kpi-sigma-max">
              {fmt.num(fmt.val(ex.sigma.max.value, 'stress'))}
            </td>
            <td className="text-right text-slate-500">{fmt.num(fmt.val(ex.sigma.max.x, 'length'))}</td>
            <td />
            <td />
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-[10.5px] text-slate-500 dark:text-slate-400">{fmt.t('kpi.lengthUnit', { u: fmt.unit('length') })}</p>
    </Card>
  );
}

function Eta({ eta }: { eta: number }) {
  const pct = Math.min(eta, 1.5) / 1.5;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-700" aria-hidden>
      <div className={cx('h-full', eta <= 1 ? (eta > 0.9 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-red-500')} style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

export function ChecksCard() {
  const fmt = useFmt();
  const { checks } = useResults();
  if (!checks) return null;
  const pct = (e: number) => `${fmt.num(e * 100, 1)} %`;
  return (
    <Card title={fmt.t('kpi.checks')} testId="kpi-checks">
      <p className="mb-2 text-[10.5px] text-slate-500 dark:text-slate-400">{fmt.t('kpi.expressNote')}</p>
      <div className="space-y-2 text-xs">
        {checks.strength && (
          <div data-testid="check-strength">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{fmt.t('kpi.strength')}</span>
              <Badge ok={checks.strength.ok}>{checks.strength.ok ? fmt.t('kpi.ok') : fmt.t('kpi.fail')}</Badge>
            </div>
            <div className="num text-slate-600 dark:text-slate-300">
              σ = {fmt.q(checks.strength.value, 'stress')} ≤ f_d = {fmt.q(checks.strength.fd, 'stress')} · η = <b>{pct(checks.strength.eta)}</b> · x ={' '}
              {fmt.q(checks.strength.x, 'length')}
            </div>
            <Eta eta={checks.strength.eta} />
            <div className="text-[10px] text-slate-500">{fmt.t(checks.strengthBasis === 'ULS' ? 'kpi.basisULS' : 'kpi.basisView')}</div>
          </div>
        )}
        {checks.shear && (
          <div data-testid="check-shear">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{fmt.t('kpi.shear')}</span>
              <Badge ok={checks.shear.ok}>{checks.shear.ok ? fmt.t('kpi.ok') : fmt.t('kpi.fail')}</Badge>
            </div>
            <div className="num text-slate-600 dark:text-slate-300">
              τ = {fmt.q(checks.shear.value, 'stress')} ≤ f_v,d = {fmt.q(checks.shear.fd, 'stress')} · η = <b>{pct(checks.shear.eta)}</b>
            </div>
            <Eta eta={checks.shear.eta} />
          </div>
        )}
        {checks.deflection.map((d) => (
          <div key={d.span.index} data-testid={`check-deflection-${d.span.index}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {fmt.t(d.span.kind === 'cantilever' ? 'kpi.cantilever' : 'kpi.span')} {fmt.num(fmt.val(d.span.x1, 'length'))}–
                {fmt.q(d.span.x2, 'length')}
              </span>
              <Badge ok={d.ok}>{d.ok ? fmt.t('kpi.ok') : fmt.t('kpi.fail')}</Badge>
            </div>
            <div className="num text-slate-600 dark:text-slate-300">
              |w| = {fmt.q(Math.abs(d.w), 'deflection')} ≤ L/{fmt.num(d.denominator, 0)} = {fmt.q(d.limit, 'deflection')} · η = <b>{pct(d.eta)}</b>
            </div>
            <Eta eta={d.eta} />
          </div>
        ))}
        <div className="text-[10px] text-slate-500">{fmt.t(checks.deflectionBasis === 'SLS' ? 'kpi.basisSLS' : 'kpi.basisView')}</div>
      </div>
    </Card>
  );
}

export function IssuesBox() {
  const fmt = useFmt();
  const { an } = useResults();
  const select = useStore((s) => s.select);
  if (an.ok && !an.warnings.length) return null;
  return (
    <div className="space-y-1.5" data-testid="issues">
      {!an.ok && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200" data-testid="analysis-error">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <IconAlert /> {fmt.t('issues.failed')}
          </div>
          <ul className="list-disc space-y-0.5 pl-5">
            {an.errors.map((e, i) => (
              <li key={i}>
                {e.path ? <span className="font-mono text-xs opacity-70">{pathLabel(fmt.t, e.path)}: </span> : null}
                {fmt.issue(e)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {an.warnings.map((w, i) => (
        <div
          key={i}
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          onClick={() => {
            const [kind, id] = w.path.split('.');
            if (kind === 'supports') select({ kind: 'support', id });
            if (kind === 'hinges') select({ kind: 'hinge', id });
          }}
        >
          <IconInfo className="mt-0.5 shrink-0" /> {fmt.issue(w)}
        </div>
      ))}
    </div>
  );
}

function pathLabel(t: (k: string) => string, path: string): string {
  const [kind, , field] = path.split('.');
  const k = { supports: 'support.single', hinges: 'hinge.single', loads: 'load.single', segments: 'beam.segment', settings: 'tabs.settings', combinations: 'combo.single', L: 'beam.length' }[kind];
  return `${k ? t(k) : kind}${field ? ` · ${field}` : ''}`;
}
