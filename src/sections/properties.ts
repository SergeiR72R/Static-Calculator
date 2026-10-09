import type { SectionDef } from '../core/types';
import { findCatalogEntry } from './catalog';
import { findPeriProduct, periDims, periOutline, periSI } from './peri';

/** Cross-section properties in SI (m, m², m⁴, m³). z measured downwards from the top edge. */
export interface SectionProps {
  A: number;
  /** I_y about the strong axis */
  I: number;
  /** centroid distance from the top edge */
  zc: number;
  /** distance centroid → top fibre */
  zTop: number;
  /** distance centroid → bottom fibre */
  zBot: number;
  Wtop: number;
  Wbot: number;
  /** shear area A_s (A_v,z) */
  As: number;
  /** first moment of area at the neutral axis (0 = unknown) */
  S: number;
  /** width at the neutral axis (0 = unknown) */
  bNA: number;
  /** overall height and width (0 = unknown) */
  h: number;
  b: number;
  /** nominal mass per length from a catalog table, kg/m (undefined for parametric) */
  tableMass?: number;
  /** fixed self weight mass per length, kg/m (system components; overrides ρ·A) */
  fixedMass?: number;
}

/** Mass per length used for the self weight, kg/m */
export function lineMass(p: SectionProps, rho: number): number {
  return p.fixedMass ?? rho * p.A;
}

const cm2 = 1e-4;
const cm3 = 1e-6;
const cm4 = 1e-8;
const mm = 1e-3;

function symmetric(A: number, I: number, h: number, b: number, As: number, S: number, bNA: number): SectionProps {
  const z = h / 2;
  return { A, I, zc: z, zTop: z, zBot: z, Wtop: I / z, Wbot: I / z, As, S, bNA, h, b };
}

/** Properties of a doubly symmetric I-shape (also valid for a channel about its strong axis) */
export function flangedProps(h: number, b: number, tw: number, tf: number): SectionProps {
  const hw = h - 2 * tf;
  const A = 2 * b * tf + hw * tw;
  const I = (b * h ** 3 - (b - tw) * hw ** 3) / 12;
  const S = (b * tf * (h - tf)) / 2 + (tw * (hw / 2) ** 2) / 2;
  return symmetric(A, I, h, b, hw * tw, S, tw);
}

export function teeProps(h: number, b: number, tw: number, tf: number): SectionProps {
  const hw = h - tf;
  const Af = b * tf;
  const Aw = tw * hw;
  const A = Af + Aw;
  const zc = (Af * (tf / 2) + Aw * (tf + hw / 2)) / A;
  const I = (b * tf ** 3) / 12 + Af * (zc - tf / 2) ** 2 + (tw * hw ** 3) / 12 + Aw * (tf + hw / 2 - zc) ** 2;
  let S: number;
  let bNA: number;
  if (zc >= tf) {
    S = Af * (zc - tf / 2) + (tw * (zc - tf) ** 2) / 2;
    bNA = tw;
  } else {
    S = (b * (tf - zc) ** 2) / 2 + Aw * (tf + hw / 2 - zc);
    bNA = b;
  }
  const zTop = zc;
  const zBot = h - zc;
  return { A, I, zc, zTop, zBot, Wtop: I / zTop, Wbot: I / zBot, As: Aw, S, bNA, h, b };
}

export function sectionProps(def: SectionDef): SectionProps {
  switch (def.kind) {
    case 'rect': {
      const { b, h } = def;
      const A = b * h;
      return symmetric(A, (b * h ** 3) / 12, h, b, (5 / 6) * A, (b * h * h) / 8, b);
    }
    case 'circle': {
      const { D } = def;
      const A = (Math.PI * D * D) / 4;
      return symmetric(A, (Math.PI * D ** 4) / 64, D, D, 0.9 * A, D ** 3 / 12, D);
    }
    case 'tube': {
      const { D, t } = def;
      const d = D - 2 * t;
      const A = (Math.PI * (D * D - d * d)) / 4;
      const I = (Math.PI * (D ** 4 - d ** 4)) / 64;
      return symmetric(A, I, D, D, (2 * A) / Math.PI, (D ** 3 - d ** 3) / 12, 2 * t);
    }
    case 'box': {
      const { b, h, t } = def;
      const bi = b - 2 * t;
      const hi = h - 2 * t;
      const A = b * h - bi * hi;
      const I = (b * h ** 3 - bi * hi ** 3) / 12;
      return symmetric(A, I, h, b, (A * h) / (b + h), (b * h * h) / 8 - (bi * hi * hi) / 8, 2 * t);
    }
    case 'weldedI':
    case 'channel':
      return flangedProps(def.h, def.b, def.tw, def.tf);
    case 'tee':
      return teeProps(def.h, def.b, def.tw, def.tf);
    case 'manual': {
      const { A, I } = def;
      const Wtop = def.Wtop > 0 ? def.Wtop : 0;
      const Wbot = def.Wbot > 0 ? def.Wbot : Wtop;
      const zTop = Wtop > 0 ? I / Wtop : 0;
      const zBot = Wbot > 0 ? I / Wbot : 0;
      return {
        A,
        I,
        zc: zTop,
        zTop,
        zBot,
        Wtop: Wtop || Wbot,
        Wbot,
        As: def.As > 0 ? def.As : A,
        S: 0,
        bNA: 0,
        h: zTop + zBot,
        b: 0,
      };
    }
    case 'peri': {
      const pr = findPeriProduct(def.product);
      if (!pr) return { A: 0, I: 0, zc: 0, zTop: 0, zBot: 0, Wtop: 0, Wbot: 0, As: 0, S: 0, bNA: 0, h: 0, b: 0 };
      const { A, I } = periSI(pr);
      const { h, b } = periDims(pr);
      const s = pr.shape;
      // shear area: web(s); S / b unknown (no τ check, the PERI check governs)
      const As = s.type === 'girder' ? s.tw * mm * h : 2 * s.tw * mm * h;
      const p = symmetric(A, I, h, b, As, 0, 0);
      p.fixedMass = pr.mass;
      p.tableMass = pr.mass;
      return p;
    }
    case 'catalog': {
      const e = findCatalogEntry(def.family, def.name);
      if (!e) {
        return { A: 0, I: 0, zc: 0, zTop: 0, zBot: 0, Wtop: 0, Wbot: 0, As: 0, S: 0, bNA: 0, h: 0, b: 0 };
      }
      const h = e.h * mm;
      const p = symmetric(
        e.A * cm2,
        e.Iy * cm4,
        h,
        e.b * mm,
        e.Avz * cm2,
        e.Sy * cm3,
        e.shape === 'box' ? 2 * (e.t ?? 0) * mm : e.shape === 'tube' ? 2 * (e.t ?? 0) * mm : (e.tw ?? 0) * mm,
      );
      // use tabulated W (consistent with I/(h/2) up to rounding)
      p.Wtop = e.Wy * cm3;
      p.Wbot = e.Wy * cm3;
      p.tableMass = e.G;
      return p;
    }
  }
}

/** Geometric outline for the section sketch, in m, origin at top-left of the bounding box */
export type Outline =
  | { type: 'poly'; outer: [number, number][]; inner?: [number, number][]; /** further solid parts */ parts?: [number, number][][] }
  | { type: 'circle'; D: number; d: number }
  | { type: 'none' };

export function sectionOutline(def: SectionDef): Outline {
  const I = (h: number, b: number, tw: number, tf: number): Outline => {
    const x0 = (b - tw) / 2;
    return {
      type: 'poly',
      outer: [
        [0, 0], [b, 0], [b, tf], [x0 + tw, tf], [x0 + tw, h - tf], [b, h - tf], [b, h],
        [0, h], [0, h - tf], [x0, h - tf], [x0, tf], [0, tf],
      ],
    };
  };
  const U = (h: number, b: number, tw: number, tf: number): Outline => ({
    type: 'poly',
    outer: [[0, 0], [b, 0], [b, tf], [tw, tf], [tw, h - tf], [b, h - tf], [b, h], [0, h]],
  });
  switch (def.kind) {
    case 'rect':
      return { type: 'poly', outer: [[0, 0], [def.b, 0], [def.b, def.h], [0, def.h]] };
    case 'circle':
      return { type: 'circle', D: def.D, d: 0 };
    case 'tube':
      return { type: 'circle', D: def.D, d: def.D - 2 * def.t };
    case 'box': {
      const { b, h, t } = def;
      return {
        type: 'poly',
        outer: [[0, 0], [b, 0], [b, h], [0, h]],
        inner: [[t, t], [b - t, t], [b - t, h - t], [t, h - t]],
      };
    }
    case 'weldedI':
      return I(def.h, def.b, def.tw, def.tf);
    case 'channel':
      return U(def.h, def.b, def.tw, def.tf);
    case 'tee': {
      const { h, b, tw, tf } = def;
      const x0 = (b - tw) / 2;
      return {
        type: 'poly',
        outer: [[0, 0], [b, 0], [b, tf], [x0 + tw, tf], [x0 + tw, h], [x0, h], [x0, tf], [0, tf]],
      };
    }
    case 'catalog': {
      const e = findCatalogEntry(def.family, def.name);
      if (!e) return { type: 'none' };
      const h = e.h * mm;
      const b = e.b * mm;
      if (e.shape === 'I') return I(h, b, (e.tw ?? 0) * mm, (e.tf ?? 0) * mm);
      if (e.shape === 'U') return U(h, b, (e.tw ?? 0) * mm, (e.tf ?? 0) * mm);
      if (e.shape === 'tube') return { type: 'circle', D: h, d: h - 2 * (e.t ?? 0) * mm };
      const t = (e.t ?? 0) * mm;
      return {
        type: 'poly',
        outer: [[0, 0], [b, 0], [b, h], [0, h]],
        inner: [[t, t], [b - t, t], [b - t, h - t], [t, h - t]],
      };
    }
    case 'peri': {
      const pr = findPeriProduct(def.product);
      if (!pr) return { type: 'none' };
      const [outer, ...parts] = periOutline(pr);
      return parts.length ? { type: 'poly', outer, parts } : { type: 'poly', outer };
    }
    case 'manual':
      return { type: 'none' };
  }
}

/** Human-readable label of a section definition (dimensions in mm) */
export function sectionLabel(def: SectionDef): string {
  const f = (v: number) => String(Math.round(v * 1e4) / 10);
  switch (def.kind) {
    case 'catalog':
      return def.name;
    case 'peri':
      return findPeriProduct(def.product)?.name ?? def.product;
    case 'rect':
      return `□ ${f(def.b)}×${f(def.h)}`;
    case 'circle':
      return `● Ø${f(def.D)}`;
    case 'tube':
      return `○ Ø${f(def.D)}×${f(def.t)}`;
    case 'box':
      return `▭ ${f(def.h)}×${f(def.b)}×${f(def.t)}`;
    case 'weldedI':
      return `I ${f(def.h)}×${f(def.b)}×${f(def.tw)}/${f(def.tf)}`;
    case 'tee':
      return `T ${f(def.h)}×${f(def.b)}×${f(def.tw)}/${f(def.tf)}`;
    case 'channel':
      return `U ${f(def.h)}×${f(def.b)}×${f(def.tw)}/${f(def.tf)}`;
    case 'manual':
      return 'A, I';
  }
}
