import katex from 'katex';
import type { Block, Report } from './build';
import { txtNum } from './build';
import type { Lang } from '../units/format';

const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.css';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mathHtml(src: string, display: boolean): string {
  return katex.renderToString(src, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'htmlAndMathml' });
}

function inline(text: string): string {
  return text
    .split(/(\$[^$]+\$)/g)
    .map((p) => (p.startsWith('$') && p.endsWith('$') ? mathHtml(p.slice(1, -1), false) : esc(p)))
    .join('');
}

function matrixHtml(b: Extract<Block, { type: 'matrix' }>, lang: Lang): string {
  const cell = (v: number | null) => (v === null ? '·' : Number.isNaN(v) ? '■' : v === 0 ? '0' : txtNum(v, lang, 4));
  return `<table class="m"><thead><tr><th></th>${b.colLabels.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.data
    .map((r, i) => `<tr><th>${esc(b.rowLabels[i])}</th>${r.map((v) => `<td>${cell(v)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

function blocksHtml(blocks: Block[], lang: Lang): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case 'h':
          return `<h${b.level}>${esc(b.text)}</h${b.level}>`;
        case 'p':
          return `<p>${inline(b.text)}</p>`;
        case 'tex':
          return `<div class="tex">${mathHtml(b.tex, true)}</div>`;
        case 'table':
          return `<table><thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows
            .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
            .join('')}</tbody></table>`;
        case 'matrix':
          return matrixHtml(b, lang);
        case 'collapse':
          return `<details${b.open ? ' open' : ''}><summary>${esc(b.title)}</summary>${blocksHtml(b.blocks, lang)}</details>`;
        case 'pages':
          return `<details><summary>${esc(b.title)}</summary>${b.pages
            .map((p, i) => `<details><summary>${i + 1}: ${esc(p.label)}</summary>${blocksHtml(p.blocks, lang)}</details>`)
            .join('')}</details>`;
      }
    })
    .join('\n');
}

export function reportToHtml(report: Report, lang: Lang, heading: string): string {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(heading)}</title>
<link rel="stylesheet" href="${KATEX_CSS}">
<style>
body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem;color:#0f172a;line-height:1.45}
h1{font-size:1.5rem}h2{border-bottom:1px solid #cbd5e1;padding-bottom:.2rem;margin-top:2rem}
table{border-collapse:collapse;margin:.5rem 0;font-size:.8rem;font-variant-numeric:tabular-nums}
th,td{border:1px solid #cbd5e1;padding:2px 6px;text-align:right}th{background:#f1f5f9}
table.m td,table.m th{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.7rem;border:none;padding:0 4px}
details{border:1px solid #e2e8f0;border-radius:4px;padding:.3rem .6rem;margin:.4rem 0}summary{cursor:pointer;font-weight:600}
.tex{overflow-x:auto}
</style>
</head>
<body>
<h1>${esc(heading)}</h1>
<p>${esc(report.loadSetLabel)}</p>
${blocksHtml(report.blocks, lang)}
</body>
</html>
`;
}

function mdCell(s: string) {
  return s.replace(/\|/g, '\\|');
}

function blocksMd(blocks: Block[], lang: Lang, depth = 0): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'h':
        out.push(`${'#'.repeat(b.level)} ${b.text}`, '');
        break;
      case 'p':
        out.push(b.text, '');
        break;
      case 'tex':
        out.push('$$', b.tex.replace(/\n/g, ' '), '$$', '');
        break;
      case 'table':
        out.push(`| ${b.head.map(mdCell).join(' | ')} |`, `|${b.head.map(() => ' ---: ').join('|')}|`);
        for (const r of b.rows) out.push(`| ${r.map(mdCell).join(' | ')} |`);
        out.push('');
        break;
      case 'matrix': {
        const cell = (v: number | null) => (v === null ? '·' : Number.isNaN(v) ? '■' : v === 0 ? '0' : txtNum(v, lang, 4));
        out.push(`| | ${b.colLabels.map(mdCell).join(' | ')} |`, `|---|${b.colLabels.map(() => '---:').join('|')}|`);
        b.data.forEach((r, i) => out.push(`| **${mdCell(b.rowLabels[i])}** | ${r.map(cell).join(' | ')} |`));
        out.push('');
        break;
      }
      case 'collapse':
        out.push(`**${b.title}**`, '', blocksMd(b.blocks, lang, depth + 1));
        break;
      case 'pages':
        out.push(`**${b.title}**`, '');
        b.pages.forEach((p, i) => out.push(`*${i + 1}: ${p.label}*`, '', blocksMd(p.blocks, lang, depth + 1)));
        break;
    }
  }
  return out.join('\n');
}

export function reportToMarkdown(report: Report, lang: Lang, heading: string): string {
  return `# ${heading}\n\n${report.loadSetLabel}\n\n${blocksMd(report.blocks, lang)}\n`;
}
