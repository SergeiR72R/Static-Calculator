import { memo, useMemo, useState } from 'react';
import katex from 'katex';
import type { Block, Report } from './build';
import { txtNum } from './build';
import type { Lang } from '../units/format';

export function tex(src: string, display = true): string {
  return katex.renderToString(src, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'htmlAndMathml' });
}

/** Paragraph with optional inline math in $…$ */
function Para({ text }: { text: string }) {
  const parts = text.split(/(\$[^$]+\$)/g);
  return (
    <p className="my-1.5 text-sm leading-relaxed">
      {parts.map((p, i) =>
        p.startsWith('$') && p.endsWith('$') ? <span key={i} dangerouslySetInnerHTML={{ __html: tex(p.slice(1, -1), false) }} /> : <span key={i}>{p}</span>,
      )}
    </p>
  );
}

const Tex = memo(function Tex({ src }: { src: string }) {
  const html = useMemo(() => tex(src), [src]);
  return <div className="my-1 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />;
});

function MatrixTable({ b, lang }: { b: Extract<Block, { type: 'matrix' }>; lang: Lang }) {
  return (
    <div className="my-2 max-w-full overflow-x-auto">
      <table className="matrix-table border-collapse">
        <thead>
          <tr>
            <th />
            {b.colLabels.map((c, j) => (
              <th key={j} className="px-1 text-[10px] font-normal text-slate-500">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {b.data.map((row, i) => (
            <tr key={i}>
              <th className="pr-1 text-right text-[10px] font-normal text-slate-500">{b.rowLabels[i]}</th>
              {row.map((v, j) => (
                <td key={j} className={v === null || v === 0 ? 'text-slate-300 dark:text-slate-600' : 'text-right'}>
                  {v === null ? '·' : Number.isNaN(v) ? '■' : v === 0 ? '0' : txtNum(v, lang, 4)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pages({ b, lang, printMode }: { b: Extract<Block, { type: 'pages' }>; lang: Lang; printMode: boolean }) {
  const [page, setPage] = useState(0);
  if (printMode) {
    return (
      <div>
        <h4 className="mt-3 text-sm font-semibold">{b.title}</h4>
        {b.pages.map((p, i) => (
          <Blocks key={i} blocks={p.blocks} lang={lang} printMode />
        ))}
      </div>
    );
  }
  const p = b.pages[Math.min(page, b.pages.length - 1)];
  return (
    <details className="my-2 rounded border border-slate-200 dark:border-slate-700">
      <summary className="cursor-pointer px-2 py-1 text-sm font-medium">
        {b.title} <span className="text-xs font-normal text-slate-500">({b.pages.length} ×)</span>
      </summary>
      <div className="p-2">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <button type="button" className="rounded border px-2 py-0.5 disabled:opacity-40" disabled={page === 0} onClick={() => setPage(page - 1)}>
            ‹
          </button>
          <select value={page} onChange={(e) => setPage(Number(e.target.value))} className="rounded border bg-transparent px-1 py-0.5" aria-label={b.title}>
            {b.pages.map((pp, i) => (
              <option key={i} value={i}>
                {i + 1}: {pp.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded border px-2 py-0.5 disabled:opacity-40"
            disabled={page >= b.pages.length - 1}
            onClick={() => setPage(page + 1)}
          >
            ›
          </button>
        </div>
        <Blocks blocks={p.blocks} lang={lang} printMode={false} />
      </div>
    </details>
  );
}

export function Blocks({ blocks, lang, printMode }: { blocks: Block[]; lang: Lang; printMode: boolean }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h':
            return b.level === 2 ? (
              <h2 key={i} id={b.id} className="mt-6 border-b border-slate-200 pb-1 text-lg font-semibold dark:border-slate-700">
                {b.text}
              </h2>
            ) : (
              <h3 key={i} className="mt-4 text-base font-semibold">
                {b.text}
              </h3>
            );
          case 'p':
            return <Para key={i} text={b.text} />;
          case 'tex':
            return <Tex key={i} src={b.tex} />;
          case 'table':
            return (
              <div key={i} className="my-2 max-w-full overflow-x-auto">
                <table className="text-xs">
                  <thead>
                    <tr>
                      {b.head.map((h, j) => (
                        <th key={j}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="num">
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td key={k} style={b.align?.[k] === 'l' || (k === 0 && !b.align) ? { textAlign: 'left' } : undefined}>
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'matrix':
            return <MatrixTable key={i} b={b} lang={lang} />;
          case 'collapse':
            return printMode ? (
              <div key={i}>
                <h4 className="mt-3 text-sm font-semibold">{b.title}</h4>
                <Blocks blocks={b.blocks} lang={lang} printMode />
              </div>
            ) : (
              <details key={i} open={b.open} className="my-2 rounded border border-slate-200 dark:border-slate-700">
                <summary className="cursor-pointer px-2 py-1 text-sm font-medium">{b.title}</summary>
                <div className="px-2 pb-2">
                  <Blocks blocks={b.blocks} lang={lang} printMode={false} />
                </div>
              </details>
            );
          case 'pages':
            return <Pages key={i} b={b} lang={lang} printMode={printMode} />;
        }
      })}
    </>
  );
}

export function ReportBody({ report, lang, printMode = false }: { report: Report; lang: Lang; printMode?: boolean }) {
  return (
    <div className="report">
      <Blocks blocks={report.blocks} lang={lang} printMode={printMode} />
    </div>
  );
}
