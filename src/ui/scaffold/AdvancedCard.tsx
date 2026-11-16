import { advancedChanged, useScaffold } from '../../scaffold/store';
import { Button, NumberField, SelectField } from '../common';
import { useFmt } from '../hooks';

/**
 * Settings that need no attention (defaults after the approval and the calibration with PERI
 * ForceControl): closed by default, with the number of changed settings and a reset.
 */
export function AdvancedCard({ levels }: { levels: { z: number; area: number }[] }) {
  const fmt = useFmt();
  const sc = useScaffold();
  const changed = advancedChanged(sc);
  const yesNo = (on: string, off: string) => [
    { value: 'on', label: fmt.t(on) },
    { value: 'off', label: fmt.t(off) },
  ];
  return (
    <details className="rounded-lg border border-slate-200 bg-white text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900" data-testid="scaffold-advanced">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 font-semibold">
        <span>{fmt.t('scaffold.adv.title')}</span>
        {changed.length > 0 ? (
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white" data-testid="scaffold-advanced-changed">
            {fmt.t('scaffold.adv.changed', { n: changed.length })}
          </span>
        ) : (
          <span className="text-[11px] font-normal text-slate-500">{fmt.t('scaffold.adv.default')}</span>
        )}
      </summary>
      <div className="space-y-2 border-t border-slate-200 p-3 dark:border-slate-700">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{fmt.t('scaffold.adv.hint')}</p>
        <div className="grid grid-cols-1 gap-2">
          <SelectField
            label={fmt.t('scaffold.calc.level')}
            value={String(sc.level)}
            testId="scaffold-calc-level"
            options={[
              { value: '-1', label: fmt.t('scaffold.calc.levelAuto') },
              ...levels.map((l, k) => ({ value: String(k), label: fmt.t('scaffold.calc.levelOption', { z: fmt.q(l.z, 'length'), a: fmt.num(l.area, 1) }) })),
            ]}
            onChange={(v) => sc.setOpts({ level: Number(v) })}
          />
          <NumberField label={fmt.t('scaffold.loads.g')} q="areaLoad" showUnit value={sc.g} onChange={(v) => sc.setOpts({ g: Math.max(0, v) })} testId="scaffold-load-g" />
          <NumberField label={fmt.t('scaffold.heal.tol')} q="sectionDim" showUnit value={sc.tol} onChange={(v) => sc.setOpts({ tol: Math.min(Math.max(0, v), 0.2) })} testId="scaffold-tol" />
          <SelectField
            label={fmt.t('scaffold.calc.ubkModel')}
            value={sc.ubkModel}
            testId="scaffold-calc-ubk"
            options={[
              { value: 'annexA', label: fmt.t('scaffold.calc.ubkAnnexA') },
              { value: 'table15', label: fmt.t('scaffold.calc.ubkTable15') },
            ]}
            onChange={(v) => sc.setOpts({ ubkModel: v === 'table15' ? 'table15' : 'annexA' })}
          />
          <SelectField label={fmt.t('scaffold.calc.slack')} value={sc.diagSlack ? 'on' : 'off'} testId="scaffold-calc-slack" options={yesNo('scaffold.calc.slackOn', 'scaffold.calc.slackOff')} onChange={(v) => sc.setOpts({ diagSlack: v === 'on' })} />
          <SelectField
            label={fmt.t('scaffold.calc.splice')}
            value={sc.spliceNoTension ? 'on' : 'off'}
            testId="scaffold-calc-splice"
            options={yesNo('scaffold.calc.spliceFree', 'scaffold.calc.spliceTension')}
            onChange={(v) => sc.setOpts({ spliceNoTension: v === 'on' })}
          />
          <SelectField label={fmt.t('scaffold.calc.cap')} value={sc.capByArticle ? 'on' : 'off'} testId="scaffold-calc-cap" options={yesNo('scaffold.calc.capArticle', 'scaffold.calc.capSix')} onChange={(v) => sc.setOpts({ capByArticle: v === 'on' })} />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={sc.secondOrder} onChange={(e) => sc.setOpts({ secondOrder: e.target.checked })} data-testid="scaffold-calc-second" />
            {fmt.t('scaffold.calc.secondOrder')}
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={sc.gFavR} onChange={(e) => sc.setOpts({ gFavR: e.target.checked })} data-testid="scaffold-gfav" />
            {fmt.t('scaffold.loads.gFav')}
          </label>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{fmt.t('scaffold.heal.hint')}</p>
        <Button size="sm" className="w-full justify-center" onClick={() => sc.resetAdvanced()} disabled={!changed.length} data-testid="scaffold-advanced-reset">
          {fmt.t('scaffold.adv.reset')}
        </Button>
      </div>
    </details>
  );
}
