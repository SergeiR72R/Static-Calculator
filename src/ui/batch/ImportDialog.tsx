import { useMemo, useState } from 'react';
import type { ImportedBeam } from '../../import/acad';
import { useStore } from '../../state/store';
import { batchFromImport } from '../../state/batch';
import { Button, Card } from '../common';
import { DialogShell } from '../DialogShell';
import { useFmt } from '../hooks';
import { warningText } from './BatchPanel';

export interface PendingImport {
  name: string;
  beams: ImportedBeam[];
}

/** Summary of an import before it replaces the current project */
export function ImportDialog({ pending, onClose }: { pending: PendingImport | null; onClose: () => void }) {
  const fmt = useFmt();
  const st = useStore();
  const [showAll, setShowAll] = useState(false);
  const stats = useMemo(() => {
    if (!pending) return null;
    const byKey = new Map<string, number>();
    for (const b of pending.beams) for (const w of b.warnings) byKey.set(w.key, (byKey.get(w.key) ?? 0) + 1);
    const profiles = new Map<string, number>();
    for (const b of pending.beams) {
      const s = b.model.segments[0].section;
      const name = s.kind === 'peri' ? s.product : s.kind;
      profiles.set(name, (profiles.get(name) ?? 0) + 1);
    }
    return { byKey, profiles, loads: pending.beams.reduce((n, b) => n + b.model.loads.length, 0), images: pending.beams.filter((b) => b.image).length };
  }, [pending]);
  if (!pending || !stats) return null;
  const withWarnings = pending.beams.filter((b) => b.warnings.some((w) => w.key !== 'ground'));
  const doImport = () => {
    const { batch, images } = batchFromImport(pending.name, pending.beams);
    st.loadBatch(batch, images);
    st.showToast('toast.imported', { n: pending.beams.length });
    onClose();
  };
  return (
    <DialogShell open onOpenChange={(o) => !o && onClose()} title={fmt.t('import.title')} wide>
      <div className="space-y-3 text-sm" data-testid="import-dialog">
        <p>
          <b>{pending.name}</b> — {fmt.t('import.summary', { n: pending.beams.length, loads: stats.loads, images: stats.images })}
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {fmt.t('import.profiles')}: {[...stats.profiles].map(([p, n]) => `${p} × ${n}`).join(', ')}
        </p>
        <Card>
          <p className="mb-1 text-xs font-semibold">{fmt.t('import.assumptions')}</p>
          <ul className="list-disc space-y-0.5 ps-4 text-xs text-slate-600 dark:text-slate-300">
            <li>{fmt.t('import.rule.supports')}</li>
            <li>{fmt.t('import.rule.loads')}</li>
            <li>{fmt.t('import.rule.length')}</li>
            <li>{fmt.t('import.rule.selfWeight')}</li>
          </ul>
        </Card>
        {stats.byKey.size > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold">{fmt.t('import.notes')}</p>
            <ul className="space-y-0.5 text-xs">
              {[...stats.byKey].map(([k, n]) => (
                <li key={k} data-testid={`import-note-${k}`}>
                  <span className="num font-semibold">{n} ×</span> {fmt.t(`import.note.${k}`)}
                </li>
              ))}
            </ul>
            {withWarnings.length > 0 && (
              <button type="button" className="mt-1 text-xs text-accent-700 underline dark:text-accent-300" onClick={() => setShowAll(!showAll)}>
                {fmt.t(showAll ? 'import.hideDetails' : 'import.showDetails')}
              </button>
            )}
            {showAll && (
              <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto rounded border border-slate-200 p-2 text-[11px] dark:border-slate-700">
                {withWarnings.map((b) => (
                  <li key={b.key}>
                    <b>
                      {b.key} {b.designation}
                    </b>
                    : {b.warnings.filter((w) => w.key !== 'ground').map((w) => warningText(fmt, w)).join('; ')}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {st.batch && <p className="text-xs text-amber-700 dark:text-amber-400">{fmt.t('import.replaceList')}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>{fmt.t('common.cancel')}</Button>
          <Button variant="primary" onClick={doImport} data-testid="import-confirm">
            {fmt.t('import.confirm', { n: pending.beams.length })}
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}
