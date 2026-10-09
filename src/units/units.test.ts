import { describe, expect, it } from 'vitest';
import { UNITS, fromSI, toSI, type Quantity } from './units';
import { formatInput, formatNumber, parseNumber } from './format';

const quantities = Object.keys(UNITS.metric) as Quantity[];

describe('units', () => {
  it('round trip Metric → Imperial → Metric without drift', () => {
    const values = [1, 0.1, 12.345, 6.789e-5, 210e9, 1e-12, 3.3333333333];
    for (const q of quantities) {
      for (const v of values) {
        // value typed in metric
        const si = toSI(v, q, 'metric');
        let x = si;
        for (let i = 0; i < 50; i++) {
          const imp = fromSI(x, q, 'imperial');
          x = toSI(imp, q, 'imperial');
          const met = fromSI(x, q, 'metric');
          x = toSI(met, q, 'metric');
        }
        expect(Math.abs(x - si) / Math.abs(si)).toBeLessThan(1e-13);
        expect(Math.abs(fromSI(x, q, 'metric') - v) / v).toBeLessThan(1e-13);
      }
    }
  });

  it('known conversion factors', () => {
    expect(fromSI(1, 'length', 'imperial')).toBeCloseTo(3.280839895, 9);
    expect(fromSI(1000, 'force', 'imperial')).toBeCloseTo(0.224808943, 9);
    expect(fromSI(1e6, 'stress', 'imperial')).toBeCloseTo(0.1450377377, 9);
    expect(fromSI(1e-8, 'inertia', 'imperial')).toBeCloseTo(0.0240250961, 9);
    expect(fromSI(1000, 'moment', 'imperial')).toBeCloseTo(0.737562149, 9);
    expect(fromSI(1000, 'lineLoad', 'imperial')).toBeCloseTo(0.0685217659, 9);
  });
});

describe('number formatting', () => {
  it('locale formats', () => {
    expect(formatNumber(1234.56, 'de')).toBe('1.234,56');
    expect(formatNumber(1234.56, 'ru').replace(/\s/g, ' ')).toBe('1 234,56');
    expect(formatNumber(1234.56, 'en')).toBe('1,234.56');
    expect(formatNumber(-0.0001, 'de', 3)).toBe('−0,00010');
    expect(formatNumber(-0, 'en')).toBe('0.00');
    expect(formatNumber(-0.001, 'en', 2)).toBe('−0.0010');
    expect(formatNumber(NaN, 'en')).toBe('–');
  });

  it('input formatting has no grouping and trims zeros', () => {
    expect(formatInput(1234.5, 'de')).toBe('1234,5');
    expect(formatInput(1234.5, 'en')).toBe('1234.5');
    expect(formatInput(2, 'ru')).toBe('2');
    expect(formatInput(0.1 + 0.2, 'en')).toBe('0.3');
  });

  it('parses comma and point as decimal separator', () => {
    expect(parseNumber('1,5')).toBe(1.5);
    expect(parseNumber('1.5')).toBe(1.5);
    expect(parseNumber(' -2,25 ')).toBe(-2.25);
    expect(parseNumber('−3')).toBe(-3);
    expect(parseNumber('1 234,5')).toBe(1234.5);
    expect(parseNumber('1 234,5')).toBe(1234.5);
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('1,234.5')).toBe(1234.5);
    expect(parseNumber('2e3')).toBe(2000);
    expect(parseNumber('2,5E-3')).toBe(0.0025);
    expect(parseNumber('.5')).toBe(0.5);
    expect(parseNumber('abc')).toBeNaN();
    expect(parseNumber('')).toBeNaN();
    expect(parseNumber('1,2,3')).toBeNaN();
  });
});

describe('Hebrew (he-IL)', () => {
  it('decimal point, proper minus sign, no bidi control marks', () => {
    expect(formatNumber(-41.11, 'he')).toBe('−41.11');
    expect(formatNumber(1234.5, 'he')).toBe('1,234.50');
    expect(formatNumber(-1e-14, 'he')).not.toMatch(/[‎‏]/);
    expect(formatNumber(-1e-15, 'he')).toBe('0.000000000000');
    expect(formatInput(-2.5, 'he')).toBe('-2.5');
    expect(parseNumber(formatInput(-2.5, 'he'))).toBe(-2.5);
  });
});
