import { useMemo } from 'react';
import { buildReport } from '../report/build';
import { ReportBody } from '../report/render';
import { reportToHtml, reportToMarkdown } from '../report/exporters';
import { useStore } from '../state/store';
import { Button, SwitchField, downloadBlob } from './common';
import { useFmt, useResults } from './hooks';
import { IconDownload } from './icons';

export function useReport() {
  const { an, checks } = useResults();
  const lang = useStore((s) => s.lang);
  const view = useStore((s) => s.view);
  return useMemo(() => buildReport(an, { lang, view, checks }), [an, lang, view, checks]);
}

export function ReportTab() {
  const fmt = useFmt();
  const report = useReport();
  const printReport = useStore((s) => s.printReport);
  const setPrefs = useStore((s) => s.setPrefs);
  const name = useStore((s) => s.model.name);
  if (!report) return <p className="p-6 text-sm text-slate-500">{fmt.t('report.unavailable')}</p>;
  const heading = `${fmt.t('report.title')} – ${report.title}`;
  const base = (name || 'balken').replace(/[^\w-]+/g, '_');
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" data-testid="report">
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 className="text-lg font-semibold">{fmt.t('report.title')}</h2>
          <p className="text-xs text-slate-500">
            {fmt.t('report.loadSet')}: {report.loadSetLabel}
          </p>
        </div>
        <SwitchField checked={printReport} onChange={(v) => setPrefs({ printReport: v })} label={fmt.t('report.includeInPdf')} />
        <Button size="sm" onClick={() => downloadBlob(reportToHtml(report, fmt.lang, heading), `${base}-rechenweg.html`, 'text/html;charset=utf-8')} data-testid="report-html">
          <IconDownload /> HTML
        </Button>
        <Button size="sm" onClick={() => downloadBlob(reportToMarkdown(report, fmt.lang, heading), `${base}-rechenweg.md`, 'text/markdown;charset=utf-8')} data-testid="report-md">
          <IconDownload /> Markdown
        </Button>
      </div>
      <nav className="no-print mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {report.blocks
          .filter((b) => b.type === 'h' && b.level === 2)
          .map((b) =>
            b.type === 'h' ? (
              <a key={b.id} href={`#${b.id}`} className="text-accent-700 hover:underline dark:text-accent-400">
                {b.text}
              </a>
            ) : null,
          )}
      </nav>
      <ReportBody report={report} lang={fmt.lang} />
    </div>
  );
}
