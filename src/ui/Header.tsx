import { useRef, useState } from 'react';
import { Dialog, DropdownMenu } from 'radix-ui';
import { useStore } from '../state/store';
import { TEMPLATE_IDS, defaultModel } from '../core/defaults';
import { parseProject, serializeProject, shareUrl } from '../state/persist';
import { LANGS } from '../i18n';
import type { Lang } from '../units/format';
import { Button, NumberField, cx, downloadBlob } from './common';
import { useFmt, useResults } from './hooks';
import {
  IconBeamLogo,
  IconChevronDown,
  IconDownload,
  IconFile,
  IconLink,
  IconMoon,
  IconPrint,
  IconRedo,
  IconSun,
  IconTemplate,
  IconUndo,
  IconUpload,
  IconX,
} from './icons';
import { buildDxf } from '../export/dxf';
import { buildCsv } from '../export/csv';
import { viewLabel } from './viewLabel';

const menuContent =
  'no-print z-50 min-w-52 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-900';
const menuItem =
  'flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-accent-100 data-[disabled]:opacity-40 dark:data-[highlighted]:bg-accent-900/50';

function fileBase(name: string) {
  return (name || 'balken').replace(/[^\w\-äöüÄÖÜß]+/g, '_').slice(0, 60);
}

function DialogShell({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: React.ReactNode }) {
  const fmt = useFmt();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="no-print fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="no-print fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
            <Dialog.Close className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={fmt.t('common.close')}>
              <IconX />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{title}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Header() {
  const fmt = useFmt();
  const st = useStore();
  const { an, vr } = useResults();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dxfOpen, setDxfOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const canExport = an.ok && !!vr;

  const saveJson = () => downloadBlob(serializeProject(st.model), `${fileBase(st.model.name)}.json`, 'application/json');
  const openJson = async (f: File) => {
    try {
      const m = parseProject(await f.text());
      st.loadModel(m);
      st.showToast('toast.loaded');
    } catch (e) {
      st.showToast(e instanceof Error && e.message.startsWith('file.') ? e.message : 'file.invalid');
    }
  };
  const share = async () => {
    const url = shareUrl(st.model, window.location.href);
    window.history.replaceState(null, '', url);
    setLink(url);
    try {
      await navigator.clipboard?.writeText(url);
      st.showToast('toast.linkCopied');
    } catch {
      /* clipboard not available: dialog shows the link */
    }
  };
  const exportDxf = () => {
    if (!an.ok || !vr) return;
    const dw = buildDxf(an, vr, {
      lang: st.lang,
      units: st.units,
      decimals: st.decimals,
      scales: st.dxfScale,
      momentSide: st.momentSide,
      title: st.model.name || fmt.t('app.title'),
      viewLabel: viewLabel(fmt, st.model, st.view),
    });
    downloadBlob(dw.bytes() as BlobPart, `${fileBase(st.model.name)}.dxf`, 'application/dxf');
    setDxfOpen(false);
  };
  const exportCsv = () => {
    if (!an.ok || !vr) return;
    const csv = buildCsv(an, vr, { lang: st.lang, units: st.units, step: st.csvStep, viewLabel: viewLabel(fmt, st.model, st.view) });
    downloadBlob(csv, `${fileBase(st.model.name)}.csv`, 'text/csv;charset=utf-8');
    setCsvOpen(false);
  };

  return (
    <header className="no-print sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <div className="flex items-center gap-2 pr-2 text-accent-700 dark:text-accent-400">
        <IconBeamLogo />
        <div className="leading-tight">
          <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">{fmt.t('app.title')}</h1>
          <p className="hidden text-[11px] text-slate-500 sm:block dark:text-slate-400">{fmt.t('app.subtitle')}</p>
        </div>
      </div>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button data-testid="templates-menu" className="hidden md:inline-flex">
            <IconTemplate /> {fmt.t('header.templates')} <IconChevronDown />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={menuContent} align="start" sideOffset={4}>
            {TEMPLATE_IDS.map((id) => (
              <DropdownMenu.Item key={id} className={menuItem} data-testid={`template-${id}`} onSelect={() => st.loadTemplate(id)}>
                {fmt.t(`templates.${id}`)}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <div className="hidden items-center md:flex">
        <Button variant="ghost" aria-label={fmt.t('header.undo')} title={`${fmt.t('header.undo')} (Ctrl+Z)`} disabled={!st.history.past.length} onClick={st.undo} data-testid="undo">
          <IconUndo />
        </Button>
        <Button variant="ghost" aria-label={fmt.t('header.redo')} title={`${fmt.t('header.redo')} (Ctrl+Y)`} disabled={!st.history.future.length} onClick={st.redo} data-testid="redo">
          <IconRedo />
        </Button>
      </div>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button data-testid="file-menu">
            <IconFile /> {fmt.t('header.file')} <IconChevronDown />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={menuContent} align="start" sideOffset={4}>
            <DropdownMenu.Item className={menuItem} onSelect={() => st.loadModel(defaultModel())}>
              <IconFile /> {fmt.t('header.new')}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={menuItem} data-testid="menu-open" onSelect={() => fileRef.current?.click()}>
              <IconUpload /> {fmt.t('header.open')}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={menuItem} data-testid="menu-save" onSelect={saveJson}>
              <IconDownload /> {fmt.t('header.save')}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={menuItem} data-testid="menu-share" onSelect={share}>
              <IconLink /> {fmt.t('header.share')}
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
            <DropdownMenu.Item className={menuItem} disabled={!canExport} data-testid="menu-csv" onSelect={() => setCsvOpen(true)}>
              <IconDownload /> {fmt.t('header.csv')}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={menuItem} disabled={!canExport} data-testid="menu-dxf" onSelect={() => setDxfOpen(true)}>
              <IconDownload /> {fmt.t('header.dxf')}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={menuItem} disabled={!canExport} data-testid="menu-print" onSelect={() => setTimeout(() => window.print(), 50)}>
              <IconPrint /> {fmt.t('header.print')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        data-testid="file-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void openJson(f);
          e.target.value = '';
        }}
      />

      <div className="ml-auto flex items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-slate-300 text-xs dark:border-slate-600" role="group" aria-label={fmt.t('header.units')}>
          {(['metric', 'imperial'] as const).map((u) => (
            <button
              key={u}
              type="button"
              data-testid={`units-${u}`}
              aria-pressed={st.units === u}
              onClick={() => st.setPrefs({ units: u })}
              className={cx('px-2 py-1.5', st.units === u ? 'bg-accent-700 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800')}
            >
              {fmt.t(`header.${u}`)}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="lang-select">
          {fmt.t('header.language')}
        </label>
        <select
          id="lang-select"
          data-testid="lang-select"
          value={st.lang}
          onChange={(e) => st.setPrefs({ lang: e.target.value as Lang })}
          className="h-8 rounded-md border border-slate-300 bg-white px-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
        >
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {l.toUpperCase()} – {fmt.t(`lang.${l}`)}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          aria-label={fmt.t('header.theme')}
          data-testid="theme-toggle"
          onClick={() => st.setPrefs({ theme: st.theme === 'dark' ? 'light' : 'dark' })}
        >
          {st.theme === 'dark' ? <IconSun /> : <IconMoon />}
        </Button>
      </div>

      <DialogShell open={dxfOpen} onOpenChange={setDxfOpen} title={fmt.t('dxf.title')}>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{fmt.t('dxf.description')}</p>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={`M: mm / ${fmt.unit('moment')}`} value={st.dxfScale.M} onChange={(v) => st.setPrefs({ dxfScale: { ...st.dxfScale, M: v } })} />
          <NumberField label={`V: mm / ${fmt.unit('force')}`} value={st.dxfScale.V} onChange={(v) => st.setPrefs({ dxfScale: { ...st.dxfScale, V: v } })} />
          <NumberField label={`N: mm / ${fmt.unit('force')}`} value={st.dxfScale.N} onChange={(v) => st.setPrefs({ dxfScale: { ...st.dxfScale, N: v } })} />
          <NumberField label={fmt.t('dxf.deflectionFactor')} value={st.dxfScale.w} onChange={(v) => st.setPrefs({ dxfScale: { ...st.dxfScale, w: v } })} />
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={exportDxf} data-testid="dxf-download">
            <IconDownload /> {fmt.t('dxf.download')}
          </Button>
        </div>
      </DialogShell>

      <DialogShell open={csvOpen} onOpenChange={setCsvOpen} title={fmt.t('csv.title')}>
        <NumberField label={fmt.t('csv.step')} value={st.csvStep} q="length" onChange={(v) => st.setPrefs({ csvStep: v > 0 ? v : 0.1 })} />
        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={exportCsv} data-testid="csv-download">
            <IconDownload /> {fmt.t('csv.download')}
          </Button>
        </div>
      </DialogShell>

      <DialogShell open={!!link} onOpenChange={(o) => !o && setLink(null)} title={fmt.t('header.share')}>
        <p className="mb-2 text-xs text-slate-500">{fmt.t('share.description')}</p>
        <textarea
          readOnly
          value={link ?? ''}
          data-testid="share-link"
          className="h-24 w-full rounded border border-slate-300 bg-slate-50 p-2 font-mono text-[11px] dark:border-slate-600 dark:bg-slate-800"
          onFocus={(e) => e.target.select()}
        />
      </DialogShell>
    </header>
  );
}
