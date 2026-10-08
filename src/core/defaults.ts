import type {
  AnalysisSettings,
  BeamModel,
  Combination,
  Hinge,
  Id,
  Load,
  LoadCase,
  Material,
  SectionDef,
  Segment,
  Support,
  SupportType,
} from './types';
import { MODEL_SCHEMA_VERSION } from './types';
import { materialPreset } from '../sections/materials';

let counter = 0;
/** Short unique id */
export function uid(prefix = 'i'): Id {
  counter = (counter + 1) % 1e9;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export const DEFAULT_SETTINGS: AnalysisSettings = {
  theory: 'euler',
  selfWeight: false,
  patternLoading: false,
  deflLimitSpan: 250,
  deflLimitCantilever: 125,
  shearCheck: false,
};

export function defaultLoadCases(): LoadCase[] {
  return [
    { id: 'G', name: '', category: 'G' },
    { id: 'Q', name: '', category: 'Q' },
    { id: 'S', name: '', category: 'S' },
    { id: 'W', name: '', category: 'W' },
  ];
}

/** DIN EN 1990 presets (editable): GZT 1,35·G + 1,5·Q; 1,0·G + 1,5·Q; GZG 1,0·G + 1,0·Q */
export function defaultCombinations(): Combination[] {
  return [
    { id: 'ULS1', name: '', type: 'ULS', factors: { G: 1.35, Q: 1.5 }, inEnvelope: true },
    { id: 'ULS2', name: '', type: 'ULS', factors: { G: 1.0, Q: 1.5 }, inEnvelope: true },
    { id: 'SLS1', name: '', type: 'SLS', factors: { G: 1.0, Q: 1.0 }, inEnvelope: false },
  ];
}

export function defaultSection(): SectionDef {
  return { kind: 'catalog', family: 'IPE', name: 'IPE 240' };
}

export function makeSegment(x1: number, x2: number, section: SectionDef = defaultSection(), material: Material = materialPreset('S235')): Segment {
  return { id: uid('s'), x1, x2, section, material };
}

export function makeSupport(type: SupportType, x: number, extra: Partial<Support> = {}): Support {
  return { id: uid('a'), type, x, ku: 0, kw: 0, kt: 0, du: 0, dw: 0, dt: 0, settlementCase: 'G', ...extra };
}

export function makeHinge(x: number): Hinge {
  return { id: uid('h'), x };
}

const kN = 1e3;

export function udl(caseId: Id, x1: number, x2: number, q1kN: number, q2kN = q1kN, dir: 'z' | 'x' = 'z'): Load {
  return { id: uid('l'), kind: 'dist', caseId, dir, x1, x2, q1: q1kN * kN, q2: q2kN * kN };
}

export function pointLoad(caseId: Id, x: number, PkN: number, angle = 90): Load {
  return { id: uid('l'), kind: 'point', caseId, x, P: PkN * kN, angle };
}

export function momentLoad(caseId: Id, x: number, MkNm: number, hingeSide: 'left' | 'right' = 'left'): Load {
  return { id: uid('l'), kind: 'moment', caseId, x, M: MkNm * kN, hingeSide };
}

export function baseModel(L: number, name = ''): BeamModel {
  return {
    schema: MODEL_SCHEMA_VERSION,
    name,
    L,
    segments: [makeSegment(0, L)],
    supports: [],
    hinges: [],
    loads: [],
    loadCases: defaultLoadCases(),
    combinations: defaultCombinations(),
    settings: { ...DEFAULT_SETTINGS },
  };
}

export type TemplateId = 'cantilever' | 'simple' | 'twoSpan' | 'threeSpan' | 'gerber' | 'elastic';

export const TEMPLATE_IDS: TemplateId[] = ['simple', 'cantilever', 'twoSpan', 'threeSpan', 'gerber', 'elastic'];

/** Structural system of a template: length, supports and hinges (no loads) */
export function templateModel(id: TemplateId): BeamModel {
  switch (id) {
    case 'cantilever': {
      const m = baseModel(3);
      m.supports = [makeSupport('fixed', 0)];
      return m;
    }
    case 'simple': {
      const m = baseModel(6);
      m.supports = [makeSupport('pinned', 0), makeSupport('roller', 6)];
      return m;
    }
    case 'twoSpan': {
      const m = baseModel(10);
      m.supports = [makeSupport('pinned', 0), makeSupport('roller', 5), makeSupport('roller', 10)];
      return m;
    }
    case 'threeSpan': {
      const m = baseModel(15);
      m.supports = [
        makeSupport('pinned', 0),
        makeSupport('roller', 5),
        makeSupport('roller', 10),
        makeSupport('roller', 15),
      ];
      m.settings.patternLoading = true;
      return m;
    }
    case 'gerber': {
      const m = baseModel(14);
      m.supports = [makeSupport('pinned', 0), makeSupport('roller', 6), makeSupport('roller', 14)];
      m.hinges = [makeHinge(7.5)];
      return m;
    }
    case 'elastic': {
      const m = baseModel(8);
      const k = 5000 * kN; // 5000 kN/m
      m.supports = [0, 2, 4, 6, 8].map((x, i) =>
        makeSupport('spring', x, { kw: k, ku: i === 0 ? 1e6 * kN : 0 }),
      );
      return m;
    }
  }
}

export function defaultModel(): BeamModel {
  return templateModel('simple');
}
