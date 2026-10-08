import LZString from 'lz-string';
import type { BeamModel } from '../core/types';
import { MODEL_SCHEMA_VERSION } from '../core/types';
import { DEFAULT_SETTINGS, defaultCombinations, defaultLoadCases } from '../core/defaults';

/** JSON project file envelope with schema version */
export interface ProjectFile {
  format: 'balkenrechner-project';
  schema: number;
  savedAt: string;
  model: BeamModel;
}

export function serializeProject(model: BeamModel): string {
  const file: ProjectFile = {
    format: 'balkenrechner-project',
    schema: MODEL_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    model,
  };
  return JSON.stringify(file, null, 2);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate and migrate a parsed model object. Throws an Error with an i18n key as message
 * if the structure is invalid.
 */
export function normalizeModel(raw: unknown): BeamModel {
  if (!isObj(raw)) throw new Error('file.invalid');
  const m = raw as Partial<BeamModel>;
  if (typeof m.schema === 'number' && m.schema > MODEL_SCHEMA_VERSION) throw new Error('file.newerSchema');
  if (typeof m.L !== 'number' || !Array.isArray(m.segments) || !Array.isArray(m.supports) || !Array.isArray(m.loads))
    throw new Error('file.invalid');
  return {
    schema: MODEL_SCHEMA_VERSION,
    name: typeof m.name === 'string' ? m.name : '',
    ...(typeof m.author === 'string' ? { author: m.author } : {}),
    ...(typeof m.description === 'string' ? { description: m.description } : {}),
    ...(typeof m.createdAt === 'string' ? { createdAt: m.createdAt } : {}),
    L: m.L,
    segments: m.segments,
    supports: m.supports.map((s) => {
      const d: Partial<typeof s> = s;
      return { ...s, ku: d.ku ?? 0, kw: d.kw ?? 0, kt: d.kt ?? 0, du: d.du ?? 0, dw: d.dw ?? 0, dt: d.dt ?? 0, settlementCase: d.settlementCase ?? 'G' };
    }),
    hinges: Array.isArray(m.hinges) ? m.hinges : [],
    loads: m.loads,
    loadCases: Array.isArray(m.loadCases) && m.loadCases.length ? m.loadCases : defaultLoadCases(),
    combinations: Array.isArray(m.combinations) ? m.combinations : defaultCombinations(),
    settings: { ...DEFAULT_SETTINGS, ...(isObj(m.settings) ? m.settings : {}) },
  };
}

export function parseProject(text: string): BeamModel {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('file.invalid');
  }
  if (isObj(data) && data.format === 'balkenrechner-project') {
    if (typeof data.schema === 'number' && data.schema > MODEL_SCHEMA_VERSION) throw new Error('file.newerSchema');
    return normalizeModel(data.model);
  }
  return normalizeModel(data);
}

/** Model → compressed URL fragment value */
export function encodeModelForUrl(model: BeamModel): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(model));
}

export function decodeModelFromUrl(s: string): BeamModel {
  const json = LZString.decompressFromEncodedURIComponent(s);
  if (!json) throw new Error('file.invalid');
  return parseProject(json);
}

export function shareUrl(model: BeamModel, base: string): string {
  const u = base.split('#')[0];
  return `${u}#m=${encodeModelForUrl(model)}`;
}

export function modelFromHash(hash: string): BeamModel | null {
  const m = /[#&]m=([^&]+)/.exec(hash);
  if (!m) return null;
  return decodeModelFromUrl(m[1]);
}

/** Safe localStorage access (private mode, quota) */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
};
