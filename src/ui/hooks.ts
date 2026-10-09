import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { translate, type TParams } from '../i18n';
import { formatInput, formatNumber, isRtl, type Lang } from '../units/format';
import { fromSI, toSI, unitSymbol, type Quantity, type UnitSystem } from '../units/units';
import type { Analysis } from '../core/analysis';
import type { ViewResult } from '../core/results';
import type { Checks } from '../core/checks';
import type { Issue } from '../core/types';

export interface Fmt {
  lang: Lang;
  units: UnitSystem;
  decimals: number;
  t: (key: string, params?: TParams) => string;
  /** plain number in locale format */
  num: (v: number, decimals?: number) => string;
  /** SI value → "12,35 kN·m" */
  q: (vSI: number, q: Quantity, decimals?: number) => string;
  /** SI value → number in display units */
  val: (vSI: number, q: Quantity) => number;
  /** display value → SI */
  si: (v: number, q: Quantity) => number;
  unit: (q: Quantity) => string;
  input: (vSI: number, q: Quantity) => string;
  /** localized issue text */
  issue: (i: Issue) => string;
}

export function makeFmt(lang: Lang, units: UnitSystem, decimals: number): Fmt {
  const t = (key: string, params?: TParams) => translate(lang, key, params);
  // right-to-left UI: numbers (with sign and unit) between left-to-right marks, so that the sign
  // stays in front and "L = 10.00 m" or "0.00–5.00 m" read as one left-to-right run
  const iso = isRtl(lang) ? (s: string) => `\u200e${s}\u200e` : (s: string) => s;
  const fmt: Fmt = {
    lang,
    units,
    decimals,
    t,
    num: (v, d) => iso(formatNumber(v, lang, d ?? decimals)),
    q: (v, q, d) => {
      const u = unitSymbol(q, units);
      return iso(`${formatNumber(fromSI(v, q, units), lang, d ?? decimals)}${u ? ' ' + u : ''}`);
    },
    val: (v, q) => fromSI(v, q, units),
    si: (v, q) => toSI(v, q, units),
    unit: (q) => unitSymbol(q, units),
    input: (v, q) => formatInput(fromSI(v, q, units), lang),
    issue: (i) => {
      const p: TParams = {};
      for (const [k, v] of Object.entries(i.params ?? {})) {
        if (typeof v === 'number' && (k === 'x' || k === 'x1' || k === 'x2' || k === 'min' || k === 'max'))
          p[k] = fmt.q(v, 'length');
        else if (k === 'dof' && typeof v === 'string') p[k] = t(`dof.${v}`);
        else if (typeof v === 'number') p[k] = iso(formatNumber(v, lang, decimals));
        else p[k] = v;
      }
      return t(i.key, p);
    },
  };
  return fmt;
}

export function useFmt(): Fmt {
  const lang = useStore((s) => s.lang);
  const units = useStore((s) => s.units);
  const decimals = useStore((s) => s.decimals);
  return useMemo(() => makeFmt(lang, units, decimals), [lang, units, decimals]);
}

export function useT() {
  return useFmt().t;
}

export interface ResultsCtx {
  an: Analysis;
  vr: ViewResult | null;
  checks: Checks | null;
}

export const ResultsContext = createContext<ResultsCtx | null>(null);

export function useResults(): ResultsCtx {
  const c = useContext(ResultsContext);
  if (!c) throw new Error('ResultsContext missing');
  return c;
}

/** Issues (errors and warnings) attached to a model path */
export function useFieldIssues(path: string | undefined): Issue[] {
  const { an } = useResults();
  return useMemo(() => {
    if (!path) return [];
    return [...an.errors, ...an.warnings].filter((i) => i.path === path);
  }, [an, path]);
}

/** Element width via ResizeObserver */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(Math.floor(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Horizontal scale shared by the schematic and all diagrams (synchronous x axis) */
export interface XScale {
  width: number;
  left: number;
  right: number;
  L: number;
  px: (x: number) => number;
  x: (px: number) => number;
}

export function makeXScale(width: number, L: number): XScale {
  const left = 56;
  const right = 40;
  const span = Math.max(1, width - left - right);
  return {
    width,
    left,
    right,
    L,
    px: (x) => left + (x / L) * span,
    x: (p) => ((p - left) / span) * L,
  };
}
