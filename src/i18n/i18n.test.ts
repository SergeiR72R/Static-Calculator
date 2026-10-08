import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DICTIONARIES, allKeys, hasKey, translate } from './index';

describe('localization', () => {
  const de = allKeys(DICTIONARIES.de).sort();
  const en = allKeys(DICTIONARIES.en).sort();
  const ru = allKeys(DICTIONARIES.ru).sort();

  it('all three languages have identical key sets', () => {
    expect(en.filter((k) => !de.includes(k))).toEqual([]);
    expect(ru.filter((k) => !de.includes(k))).toEqual([]);
    expect(de.filter((k) => !en.includes(k))).toEqual([]);
    expect(de.filter((k) => !ru.includes(k))).toEqual([]);
  });

  it('no empty translations and identical placeholders', () => {
    for (const k of de) {
      const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
      const d = translate('de', k);
      expect(d.length, k).toBeGreaterThan(0);
      expect(ph(translate('en', k)), k).toBe(ph(d));
      expect(ph(translate('ru', k)), k).toBe(ph(d));
    }
  });

  it('every static key used in the source exists', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) files.push(p);
      }
    };
    walk(join(__dirname, '..'));
    const missing: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) if (!hasKey('de', m[1])) missing.push(`${f}: ${m[1]}`);
      for (const m of src.matchAll(/key: '((?:err|warn|mech|toast|file)\.[a-zA-Z]+)'/g)) if (!hasKey('de', m[1])) missing.push(`${f}: ${m[1]}`);
      for (const m of src.matchAll(/'((?:err|warn|mech|file)\.[a-zA-Z]+)'/g)) if (!hasKey('de', m[1])) missing.push(`${f}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });

  it('dynamic key families are complete', () => {
    const fams: Record<string, string[]> = {
      'support.types': ['fixed', 'pinned', 'roller', 'slider', 'spring'],
      'section.kind': ['catalog', 'rect', 'circle', 'tube', 'box', 'weldedI', 'tee', 'channel', 'manual'],
      'material.preset': ['S235', 'S355', 'AW6060', 'C24', 'custom'],
      'material.fk': ['S235', 'S355', 'AW6060', 'C24', 'custom'],
      lc: ['G', 'Q', 'S', 'W', 'custom'],
      'lc.cat': ['G', 'Q', 'S', 'W', 'custom'],
      templates: ['simple', 'cantilever', 'twoSpan', 'threeSpan', 'gerber', 'elastic'],
      tabs: ['beam', 'supports', 'loads', 'cases', 'settings', 'results', 'report'],
      sym: ['N', 'V', 'M', 'w', 'theta', 'sigma', 'tau'],
      diag: ['N', 'V', 'M', 'w', 'theta', 'sigma', 'tau'],
      'report.reasons': ['start', 'end', 'support', 'hinge', 'pointLoad', 'moment', 'loadStart', 'loadEnd', 'segment'],
      'report.hand': ['springs', 'indeterminate', 'singular'],
      'report.loadSetKind': ['case', 'combo', 'envelope'],
      dof: ['u', 'w', 't'],
    };
    for (const [prefix, keys] of Object.entries(fams))
      for (const k of keys) for (const l of ['de', 'en', 'ru'] as const) expect(hasKey(l, `${prefix}.${k}`), `${l}:${prefix}.${k}`).toBe(true);
  });

  it('German terminology and Russian Q symbol', () => {
    expect(translate('de', 'diag.V')).toBe('Querkraft');
    expect(translate('de', 'support.types.fixed')).toBe('Einspannung');
    expect(translate('de', 'support.types.pinned')).toBe('Festlager');
    expect(translate('de', 'support.types.roller')).toBe('Loslager');
    expect(translate('de', 'hinge.single')).toBe('Gelenk');
    expect(translate('ru', 'sym.V')).toBe('Q');
    expect(translate('en', 'sym.V')).toBe('V');
  });
});
