import type { BeamModel, Hinge, Id, Load, Support, SupportType } from '../../core/types';
import { supportRestraint } from '../../core/mesh';
import { useStore } from '../../state/store';
import { Button, NumberField, SelectField } from '../common';
import { useFmt, type Fmt } from '../hooks';
import { IconTrash } from '../icons';

export const SUPPORT_TYPES: SupportType[] = ['fixed', 'pinned', 'roller', 'slider', 'spring'];

export function caseLabel(fmt: Fmt, model: BeamModel, id: Id): string {
  const c = model.loadCases.find((k) => k.id === id);
  if (!c) return id;
  return c.name || fmt.t(`lc.${c.category}`);
}

export function caseOptions(fmt: Fmt, model: BeamModel) {
  return model.loadCases.map((c) => ({ value: c.id, label: caseLabel(fmt, model, c.id) }));
}

function useEditing() {
  const update = useStore((s) => s.update);
  const select = useStore((s) => s.select);
  return { update, select };
}

export function SupportEditor({ s, compact }: { s: Support; compact?: boolean }) {
  const fmt = useFmt();
  const model = useStore((st) => st.model);
  const { update, select } = useEditing();
  const base = `supports.${s.id}`;
  const set = (patch: Partial<Support>, key: string) =>
    update((m) => {
      const t = m.supports.find((x) => x.id === s.id);
      if (t) Object.assign(t, patch);
    }, `${base}.${key}`);
  const r = supportRestraint({ ...s, type: s.type === 'spring' ? 'pinned' : s.type });
  return (
    <div className="space-y-2" data-testid={`support-editor-${s.id}`}>
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <SelectField
          label={fmt.t('support.type')}
          value={s.type}
          testId="support-type"
          options={SUPPORT_TYPES.map((tp) => ({ value: tp, label: fmt.t(`support.types.${tp}`) }))}
          onChange={(type) =>
            set(type === 'spring' && s.kw === 0 && s.ku === 0 && s.kt === 0 ? { type, kw: 1e7 } : { type }, 'type')
          }
        />
        <NumberField label="x" value={s.x} q="length" path={`${base}.x`} onChange={(x) => set({ x }, 'x')} testId="support-x" />
        <Button
          size="sm"
          variant="danger"
          aria-label={fmt.t('common.delete')}
          onClick={() => {
            update((m) => void (m.supports = m.supports.filter((x) => x.id !== s.id)));
            select(null);
          }}
        >
          <IconTrash />
        </Button>
      </div>
      {s.type === 'spring' && (
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="k_u" value={s.ku} q="springTrans" path={`${base}.ku`} onChange={(ku) => set({ ku }, 'ku')} />
          <NumberField label="k_w" value={s.kw} q="springTrans" path={`${base}.kw`} onChange={(kw) => set({ kw }, 'kw')} />
          <NumberField label="k_θ" value={s.kt} q="springRot" path={`${base}.kt`} onChange={(kt) => set({ kt }, 'kt')} />
          <p className="col-span-3 text-[11px] text-slate-500">{fmt.t('support.springHint')}</p>
        </div>
      )}
      {s.type !== 'spring' && !compact && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-slate-600 dark:text-slate-300">{fmt.t('support.settlement')}</summary>
          <div className="mt-1 grid grid-cols-4 gap-2">
            {r.u && <NumberField label="Δu" value={s.du} q="deflection" path={`${base}.du`} onChange={(du) => set({ du }, 'du')} />}
            {r.w && <NumberField label="Δw" value={s.dw} q="deflection" path={`${base}.dw`} onChange={(dw) => set({ dw }, 'dw')} />}
            {r.t && <NumberField label="Δθ" value={s.dt} q="rotation" path={`${base}.dt`} onChange={(dt) => set({ dt }, 'dt')} />}
            <SelectField
              label={fmt.t('load.case')}
              value={s.settlementCase}
              options={caseOptions(fmt, model)}
              onChange={(settlementCase) => set({ settlementCase }, 'settlementCase')}
            />
          </div>
        </details>
      )}
    </div>
  );
}

export function HingeEditor({ h }: { h: Hinge }) {
  const fmt = useFmt();
  const { update, select } = useEditing();
  const base = `hinges.${h.id}`;
  return (
    <div className="grid grid-cols-[1fr_auto] items-end gap-2" data-testid={`hinge-editor-${h.id}`}>
      <NumberField
        label={`x (${fmt.t('hinge.single')})`}
        value={h.x}
        q="length"
        path={`${base}.x`}
        onChange={(x) =>
          update((m) => {
            const t = m.hinges.find((k) => k.id === h.id);
            if (t) t.x = x;
          }, `${base}.x`)
        }
      />
      <Button
        size="sm"
        variant="danger"
        aria-label={fmt.t('common.delete')}
        onClick={() => {
          update((m) => void (m.hinges = m.hinges.filter((k) => k.id !== h.id)));
          select(null);
        }}
      >
        <IconTrash />
      </Button>
    </div>
  );
}

export function loadKindLabel(fmt: Fmt, l: Load): string {
  if (l.kind === 'dist') return fmt.t(l.dir === 'x' ? 'load.kinds.axial' : 'load.kinds.dist');
  return fmt.t(`load.kinds.${l.kind}`);
}

export function LoadEditor({ l }: { l: Load }) {
  const fmt = useFmt();
  const model = useStore((st) => st.model);
  const { update, select } = useEditing();
  const base = `loads.${l.id}`;
  const set = (patch: Partial<Load>, key: string) =>
    update((m) => {
      const t = m.loads.find((x) => x.id === l.id);
      if (t) Object.assign(t, patch);
    }, `${base}.${key}`);
  const atHinge = l.kind === 'moment' && model.hinges.some((h) => Math.abs(h.x - l.x) < 1e-9);
  return (
    <div className="space-y-2" data-testid={`load-editor-${l.id}`}>
      <div className="flex items-end gap-2">
        <SelectField
          className="flex-1"
          label={fmt.t('load.case')}
          value={l.caseId}
          testId="load-case"
          options={caseOptions(fmt, model)}
          onChange={(caseId) => set({ caseId }, 'caseId')}
        />
        <Button
          size="sm"
          variant="danger"
          aria-label={fmt.t('common.delete')}
          onClick={() => {
            update((m) => void (m.loads = m.loads.filter((x) => x.id !== l.id)));
            select(null);
          }}
        >
          <IconTrash />
        </Button>
      </div>
      {l.kind === 'point' && (
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="x" value={l.x} q="length" path={`${base}.x`} onChange={(x) => set({ x }, 'x')} testId="load-x" />
          <NumberField label="P" value={l.P} q="force" path={`${base}.P`} onChange={(P) => set({ P }, 'P')} testId="load-P" />
          <NumberField label="α" value={l.angle} q="angle" path={`${base}.angle`} onChange={(angle) => set({ angle }, 'angle')} />
        </div>
      )}
      {l.kind === 'moment' && (
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="x" value={l.x} q="length" path={`${base}.x`} onChange={(x) => set({ x }, 'x')} />
          <NumberField label="M" value={l.M} q="moment" path={`${base}.M`} onChange={(M) => set({ M }, 'M')} testId="load-M" />
          {atHinge && (
            <SelectField
              label={fmt.t('load.hingeSide')}
              value={l.hingeSide}
              options={[
                { value: 'left', label: fmt.t('load.left') },
                { value: 'right', label: fmt.t('load.right') },
              ]}
              onChange={(hingeSide) => set({ hingeSide }, 'hingeSide')}
            />
          )}
        </div>
      )}
      {l.kind === 'dist' && (
        <div className="grid grid-cols-4 gap-2">
          <NumberField label="x₁" value={l.x1} q="length" path={`${base}.x1`} onChange={(x1) => set({ x1 }, 'x1')} testId="load-x1" />
          <NumberField label="x₂" value={l.x2} q="length" path={`${base}.x2`} onChange={(x2) => set({ x2 }, 'x2')} testId="load-x2" />
          <NumberField
            label={l.dir === 'x' ? 'p₁' : 'q₁'}
            value={l.q1}
            q="lineLoad"
            path={`${base}.q1`}
            testId="load-q1"
            onChange={(q1) => set(l.q1 === l.q2 ? { q1, q2: q1 } : { q1 }, 'q1')}
          />
          <NumberField
            label={l.dir === 'x' ? 'p₂' : 'q₂'}
            value={l.q2}
            q="lineLoad"
            path={`${base}.q2`}
            testId="load-q2"
            onChange={(q2) => set({ q2 }, 'q2')}
          />
        </div>
      )}
    </div>
  );
}
