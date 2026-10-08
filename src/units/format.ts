export type Lang = 'de' | 'ru' | 'en';

export const LANG_LOCALE: Record<Lang, string> = { de: 'de-DE', ru: 'ru-RU', en: 'en-US' };

const cache = new Map<string, Intl.NumberFormat>();

function nf(lang: Lang, decimals: number, grouping: boolean): Intl.NumberFormat {
  const key = `${lang}|${decimals}|${grouping}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LANG_LOCALE[lang], {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: grouping,
    });
    cache.set(key, f);
  }
  return f;
}

/**
 * Locale aware number formatting (de: 1.234,56; ru: 1 234,56; en: 1,234.56).
 * Very small non-zero values get additional decimals so that they do not show as 0.
 */
export function formatNumber(v: number, lang: Lang, decimals = 2, grouping = true): string {
  if (Number.isNaN(v)) return '–';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  let d = decimals;
  const a = Math.abs(v);
  if (a > 0 && a < 10 ** -decimals) d = Math.min(12, Math.ceil(-Math.log10(a)) + 1);
  let s = nf(lang, d, grouping).format(v);
  // normalise negative zero and use a proper minus sign
  if (/^-0([.,]0*)?$/.test(s)) s = s.slice(1);
  return s.replace(/^-/, '−');
}

/** Number for an input field: no grouping, locale decimal separator, trailing zeros trimmed */
export function formatInput(v: number, lang: Lang, maxDecimals = 6): string {
  if (!Number.isFinite(v)) return '';
  const r = Number(v.toPrecision(12));
  let s = nf(lang, maxDecimals, false).format(r);
  const sep = lang === 'en' ? '.' : ',';
  if (s.includes(sep)) s = s.replace(/0+$/, '').replace(new RegExp(`\\${sep}$`), '');
  if (s === '-0') s = '0';
  return s;
}

/**
 * Parse user input. Accepts comma and point as decimal separator, spaces (incl. NBSP)
 * as group separators, a unicode minus and exponents. If both separators occur, the
 * last one is the decimal separator. Returns NaN for invalid input.
 */
export function parseNumber(input: string): number {
  let s = input.trim().replace(/[\s\u00a0\u202f\u2009']/g, '').replace(/\u2212/g, '-');
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? ',' : '.';
    const other = dec === ',' ? '.' : ',';
    s = s.split(other).join('');
    if (dec === ',') s = s.replace(',', '.');
  } else if (lastComma >= 0) {
    if (s.indexOf(',') !== lastComma) return NaN;
    s = s.replace(',', '.');
  } else if (lastDot >= 0 && s.indexOf('.') !== lastDot) {
    return NaN;
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return NaN;
  return Number(s);
}
