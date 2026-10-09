import { lazy, Suspense, useCallback, useState } from 'react';
import { HEAT_FIELDS, autoSectionScale, legendGradient, type HeatField } from '../three/heat';
import { sectionProps } from '../../sections/properties';
import { useStore } from '../../state/store';
import { Button, Card, SelectField } from '../common';
import { useFmt } from '../hooks';

const Beam3D = lazy(() => import('../three/Beam3D'));

export function View3DCard() {
  const fmt = useFmt();
  const model = useStore((s) => s.model);
  const [field, setField] = useState<HeatField>('sigma');
  const [deformed, setDeformed] = useState(false);
  const [scaleSel, setScaleSel] = useState<'auto' | '1' | '2' | '5' | '10'>('auto');
  const [resetKey, setResetKey] = useState(0);
  const [range, setRange] = useState<{ min: number; max: number; diverging: boolean } | null>(null);
  const onRange = useCallback((r: { min: number; max: number; diverging: boolean }) => setRange(r), []);

  const hMax = Math.max(0, ...model.segments.map((s) => sectionProps(s.section).h));
  const autoScale = autoSectionScale(model.L, hMax);
  const sectionScale = scaleSel === 'auto' ? autoScale : Number(scaleSel);

  const fmtVal = (v: number) => {
    switch (field) {
      case 'sigma':
        return fmt.q(v, 'stress');
      case 'eta':
        return `${fmt.num(v * 100, 0)} %`;
      case 'M':
        return fmt.q(v, 'moment');
      case 'V':
        return fmt.q(v, 'force');
      case 'w':
        return fmt.q(v, 'deflection');
    }
  };
  const m = range ? Math.max(Math.abs(range.min), Math.abs(range.max)) : 0;

  return (
    <Card
      testId="view-3d"
      title={fmt.t('view3d.title')}
      actions={
        <Button size="sm" onClick={() => setResetKey((k) => k + 1)}>
          {fmt.t('view3d.reset')}
        </Button>
      }
    >
      <div className="mb-2 flex flex-wrap items-end gap-3">
        <SelectField
          className="w-80 max-w-full"
          label={fmt.t('view3d.field')}
          value={field}
          testId="view3d-field"
          options={HEAT_FIELDS.map((f) => ({ value: f, label: fmt.t(`view3d.fields.${f}`) }))}
          onChange={setField}
        />
        <SelectField
          className="w-44"
          label={fmt.t('view3d.sectionScale')}
          value={scaleSel}
          options={[
            { value: 'auto', label: `${fmt.t('view3d.auto')} (×${autoScale})` },
            { value: '1', label: '×1' },
            { value: '2', label: '×2' },
            { value: '5', label: '×5' },
            { value: '10', label: '×10' },
          ]}
          onChange={setScaleSel}
        />
        <label className="flex items-center gap-1.5 pb-1 text-xs">
          <input type="checkbox" checked={deformed} onChange={(e) => setDeformed(e.target.checked)} />
          {fmt.t('view3d.deformed')}
        </label>
      </div>
      <div className="overflow-hidden rounded-md border border-slate-200 bg-gradient-to-b from-slate-50 to-white dark:border-slate-700 dark:from-slate-900 dark:to-slate-950">
        <Suspense fallback={<div className="flex h-[380px] items-center justify-center text-sm text-slate-500">{fmt.t('view3d.loading')}</div>}>
          <Beam3D field={field} sectionScale={sectionScale} deformed={deformed} resetKey={resetKey} onRange={onRange} />
        </Suspense>
      </div>
      {range && (
        <div className="mt-2" data-testid="view3d-legend">
          <div className="h-3 w-full rounded" style={{ background: legendGradient(range.diverging) }} />
          <div className="mt-0.5 flex justify-between text-[11px] num text-slate-600 dark:text-slate-300">
            <span>{range.diverging ? fmtVal(-m) : fmtVal(range.min)}</span>
            {range.diverging && <span>0</span>}
            <span>{range.diverging ? fmtVal(m) : fmtVal(range.max)}</span>
          </div>
        </div>
      )}
      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
        {fmt.t(`view3d.hints.${field}`)} {sectionScale !== 1 && fmt.t('view3d.scaleNote', { s: sectionScale })} {fmt.t('view3d.controls')}
      </p>
    </Card>
  );
}
