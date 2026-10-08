import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { analyze } from '../core/analysis';
import { computeView } from '../core/results';
import { runChecks } from '../core/checks';
import { TEMPLATE_IDS, templateModel, udl } from '../core/defaults';
import { buildReport, texNum, type Block } from './build';
import { reportToHtml, reportToMarkdown } from './exporters';

function flat(blocks: Block[]): Block[] {
  return blocks.flatMap((b) => (b.type === 'collapse' ? [b, ...flat(b.blocks)] : b.type === 'pages' ? [b, ...b.pages.flatMap((p) => flat(p.blocks))] : [b]));
}

describe('step-by-step report', () => {
  for (const id of TEMPLATE_IDS) {
    it(`${id}: all sections, valid KaTeX, all languages`, () => {
      const m = templateModel(id);
      m.settings.selfWeight = true;
      const an = analyze(m);
      const vr = computeView(an, { type: 'combo', id: 'ULS1' })!;
      for (const lang of ['de', 'en', 'ru'] as const) {
        const r = buildReport(an, { lang, view: { type: 'combo', id: 'ULS1' }, checks: runChecks(an, vr) })!;
        const heads = r.blocks.filter((b) => b.type === 'h' && b.level === 2);
        expect(heads).toHaveLength(9);
        for (const b of flat(r.blocks)) {
          if (b.type !== 'tex') continue;
          expect(() => katex.renderToString(b.tex, { throwOnError: true, displayMode: true }), b.tex).not.toThrow();
        }
        expect(reportToHtml(r, lang, 'T')).toContain('<h2>');
        expect(reportToHtml(r, lang, 'T')).toContain('src="data:image/png;base64,');
        expect(reportToMarkdown(r, lang, 'T')).toContain('$$');
      }
    });
  }

  it('large models are paginated', () => {
    const m = templateModel('simple');
    for (let i = 0; i < 60; i++) m.loads.push(udl('G', i * 0.1, i * 0.1 + 0.05, 1));
    const an = analyze(m);
    const r = buildReport(an, { lang: 'de', view: { type: 'case', id: 'G' } })!;
    expect(an.mesh!.elements.length).toBeGreaterThanOrEqual(50);
    expect(r.blocks.some((b) => b.type === 'pages')).toBe(true);
  });

  it('statically determinate beam includes the hand calculation', () => {
    const an = analyze(templateModel('gerber'));
    const r = buildReport(an, { lang: 'de', view: { type: 'case', id: 'G' } })!;
    const text = JSON.stringify(r.blocks);
    expect(text).toContain('Statisch bestimmtes System');
    const an2 = analyze(templateModel('twoSpan'));
    expect(JSON.stringify(buildReport(an2, { lang: 'de', view: { type: 'case', id: 'G' } })!.blocks)).toContain('1-fach statisch unbestimmt');
  });

  it('TeX numbers use the locale decimal separator', () => {
    expect(texNum(1234.5, 'de')).toBe('1234{,}5');
    expect(texNum(1234.5, 'en')).toBe('1234.5');
    expect(texNum(2.1e11, 'de')).toBe('2{,}1 \\cdot 10^{11}');
    expect(texNum(-3.3e-6, 'en')).toBe('-3.3 \\cdot 10^{-6}');
  });
});
