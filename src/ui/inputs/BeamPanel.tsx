import { useState } from 'react';
import type { BeamModel } from '../../core/types';
import { X_TOL } from '../../core/types';
import { makeSegment } from '../../core/defaults';
import { sectionLabel } from '../../sections/properties';
import { useStore } from '../../state/store';
import { Button, Card, NumberField, TextField, cx } from '../common';
import { useFmt } from '../hooks';
import { IconChevronDown, IconChevronRight, IconPlus, IconTrash } from '../icons';
import { MaterialEditor, SectionEditor, SectionSketch } from './SectionEditor';

/** Change the beam length; items located at the old beam end follow the new end. */
export function setBeamLength(m: BeamModel, L: number) {
  const old = m.L;
  const atEnd = (x: number) => Math.abs(x - old) <= 1e-9;
  m.L = L;
  if (!(L > 0)) return;
  for (const s of m.supports) if (atEnd(s.x)) s.x = L;
  for (const h of m.hinges) if (atEnd(h.x)) h.x = L;
  for (const l of m.loads) {
    if (l.kind === 'dist') {
      if (atEnd(l.x2)) l.x2 = L;
    } else if (atEnd(l.x)) l.x = L;
  }
  const segs = [...m.segments].sort((a, b) => a.x1 - b.x1);
  const last = segs[segs.length - 1];
  if (last && (atEnd(last.x2) || last.x2 > L)) last.x2 = L;
  // drop segments that start beyond the new end
  m.segments = segs.filter((s) => s.x1 < L - X_TOL || s === segs[0]);
  if (m.segments.length) m.segments[m.segments.length - 1].x2 = L;
}

export function BeamPanel() {
  const fmt = useFmt();
  const model = useStore((s) => s.model);
  const update = useStore((s) => s.update);
  const selection = useStore((s) => s.selection);
  const [open, setOpen] = useState<string | null>(model.segments[0]?.id ?? null);
  const segs = [...model.segments].sort((a, b) => a.x1 - b.x1);
  // after loading another project the remembered id is stale → open the first segment
  const openId = open !== null && !segs.some((s) => s.id === open) ? (segs[0]?.id ?? null) : open;

  const split = () => {
    update((m) => {
      const ss = [...m.segments].sort((a, b) => a.x1 - b.x1);
      const last = ss[ss.length - 1];
      const mid = Math.round(((last.x1 + last.x2) / 2) * 1000) / 1000;
      const n = makeSegment(mid, last.x2, structuredClone(last.section), structuredClone(last.material));
      last.x2 = mid;
      m.segments = [...ss, n];
    });
  };

  return (
    <div className="space-y-3">
      <Card>
        <div className="grid grid-cols-2 gap-2">
          <TextField label={fmt.t('beam.name')} value={model.name} onChange={(v) => update((m) => void (m.name = v), 'name')} testId="project-name" />
          <NumberField
            label={fmt.t('beam.length')}
            value={model.L}
            q="length"
            path="L"
            testId="beam-length"
            onChange={(v) => update((m) => setBeamLength(m, v), 'L')}
          />
          <TextField
            className="col-span-2"
            label={fmt.t('beam.author')}
            value={model.author ?? ''}
            onChange={(v) => update((m) => void (m.author = v), 'author')}
          />
          <label className="col-span-2 block">
            <span className="mb-0.5 block text-[11px] font-medium text-slate-500 dark:text-slate-400">{fmt.t('beam.description')}</span>
            <textarea
              value={model.description ?? ''}
              rows={2}
              onChange={(e) => update((m) => void (m.description = e.target.value), 'description')}
              className="w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-sm outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
        </div>
      </Card>
      <Card
        title={fmt.t('beam.segments')}
        actions={
          <Button size="sm" onClick={split} data-testid="add-segment" className="whitespace-nowrap">
            <IconPlus /> {fmt.t('beam.addSegment')}
          </Button>
        }
      >
        <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">{fmt.t('beam.segmentsHint')}</p>
        <div className="space-y-2">
          {segs.map((s, i) => {
            const isOpen = openId === s.id;
            const base = `segments.${s.id}`;
            return (
              <div
                key={s.id}
                className={cx(
                  'rounded border border-slate-200 dark:border-slate-700',
                  selection?.kind === 'segment' && selection.id === s.id && 'ring-2 ring-accent-500',
                )}
              >
                <div className="flex items-center gap-2 px-2 py-1">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1 text-start text-sm"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : s.id)}
                  >
                    {isOpen ? <IconChevronDown /> : <IconChevronRight />}
                    <span className="font-medium">
                      {fmt.t('beam.segment')} {i + 1}
                    </span>
                    <span className="truncate text-xs text-slate-500">
                      {sectionLabel(s.section)} · {fmt.t(`material.preset.${s.material.preset}`)}
                    </span>
                  </button>
                  {segs.length > 1 && (
                    <Button
                      size="sm"
                      variant="danger"
                      aria-label={fmt.t('common.delete')}
                      onClick={() =>
                        update((m) => {
                          const ss = [...m.segments].sort((a, b) => a.x1 - b.x1);
                          const idx = ss.findIndex((x) => x.id === s.id);
                          if (idx > 0) ss[idx - 1].x2 = ss[idx].x2;
                          else if (ss[1]) ss[1].x1 = ss[0].x1;
                          ss.splice(idx, 1);
                          m.segments = ss;
                        })
                      }
                    >
                      <IconTrash />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 px-2 pb-2">
                  <NumberField
                    label={fmt.t('beam.from')}
                    value={s.x1}
                    q="length"
                    path={`${base}.x1`}
                    disabled={i === 0}
                    onChange={(v) =>
                      update((m) => {
                        const ss = [...m.segments].sort((a, b) => a.x1 - b.x1);
                        ss[i].x1 = v;
                        if (ss[i - 1]) ss[i - 1].x2 = v;
                      }, `${base}.x1`)
                    }
                  />
                  <NumberField
                    label={fmt.t('beam.to')}
                    value={s.x2}
                    q="length"
                    path={`${base}.x2`}
                    disabled={i === segs.length - 1}
                    onChange={(v) =>
                      update((m) => {
                        const ss = [...m.segments].sort((a, b) => a.x1 - b.x1);
                        ss[i].x2 = v;
                        if (ss[i + 1]) ss[i + 1].x1 = v;
                      }, `${base}.x2`)
                    }
                  />
                </div>
                {isOpen && (
                  <div className="space-y-3 border-t border-slate-200 p-2 dark:border-slate-700">
                    <SectionEditor
                      def={s.section}
                      base={`${base}.section`}
                      onChange={(d) =>
                        update((m) => {
                          const t = m.segments.find((x) => x.id === s.id);
                          if (t) t.section = d;
                        }, `${base}.section`)
                      }
                      onMaterial={(mat) =>
                        update((m) => {
                          const t = m.segments.find((x) => x.id === s.id);
                          if (t) t.material = mat;
                        }, `${base}.material`)
                      }
                      L={model.L}
                      onLength={(v) => update((m) => setBeamLength(m, v), 'L')}
                    />
                    <SectionSketch def={s.section} rho={s.material.rho} />
                    <MaterialEditor
                      m={s.material}
                      base={`${base}.material`}
                      onChange={(mat) =>
                        update((m) => {
                          const t = m.segments.find((x) => x.id === s.id);
                          if (t) t.material = mat;
                        }, `${base}.material`)
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
