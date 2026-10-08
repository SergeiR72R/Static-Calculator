import de from './de.json';
import en from './en.json';
import ru from './ru.json';
import type { Lang } from '../units/format';

type Dict = { [k: string]: string | Dict };

export const DICTIONARIES: Record<Lang, Dict> = { de, en, ru };

export const LANGS: Lang[] = ['de', 'en', 'ru'];

function lookup(dict: Dict, key: string): string | undefined {
  let cur: string | Dict | undefined = dict;
  for (const part of key.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export type TParams = Record<string, string | number>;

/** Translate a key; `{name}` placeholders are replaced by params. Falls back to German, then the key. */
export function translate(lang: Lang, key: string, params?: TParams): string {
  const s = lookup(DICTIONARIES[lang], key) ?? lookup(DICTIONARIES.de, key) ?? key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

export function hasKey(lang: Lang, key: string): boolean {
  return lookup(DICTIONARIES[lang], key) !== undefined;
}

/** All leaf keys of a dictionary (dot notation) */
export function allKeys(d: Dict, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.push(p);
    else out.push(...allKeys(v, p));
  }
  return out;
}
