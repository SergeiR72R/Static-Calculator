/**
 * Beam list ("Positionsliste"): several beams of one import (e.g. the AutoCAD export) in one
 * project. One beam is active and edited like a single project; every beam can be marked as
 * checked. A checked beam that is edited afterwards shows up as "changed after check".
 */
import type { BeamModel, Id } from '../core/types';
import { uid } from '../core/defaults';
import type { ImportWarning, ImportedBeam } from '../import/acad';
import { normalizeModel, parseProject } from './persist';
import { MODEL_SCHEMA_VERSION } from '../core/types';

export interface BatchItem {
  id: Id;
  /** position key, e.g. "B-003" */
  key: string;
  /** designation, e.g. "RCS 498" */
  designation: string;
  model: BeamModel;
  /** import notes (i18n keys below import.warn) */
  warnings: ImportWarning[];
  /** user confirmed the calculation */
  checked: boolean;
  /** model hash at confirmation (detects later edits) */
  checkedHash?: string;
  checkedAt?: string;
  hasImage: boolean;
}

export interface Batch {
  id: Id;
  /** source file name */
  name: string;
  importedAt: string;
  items: BatchItem[];
  active: Id;
}

export type ItemStatus = 'open' | 'checked' | 'changed';

/** JSON with sorted object keys (independent of property order after load / normalisation) */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v) ?? 'null';
}

/** FNV-1a hash of the canonical model JSON (short, stable) */
export function modelHash(m: BeamModel): string {
  const s = canonical(m);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function itemStatus(it: BatchItem): ItemStatus {
  if (!it.checked) return 'open';
  return it.checkedHash === modelHash(it.model) ? 'checked' : 'changed';
}

export function batchFromImport(name: string, beams: ImportedBeam[]): { batch: Batch; images: Record<Id, string> } {
  const images: Record<Id, string> = {};
  const items = beams.map((b): BatchItem => {
    const id = uid('b');
    if (b.image) images[id] = b.image;
    return { id, key: b.key, designation: b.designation, model: b.model, warnings: b.warnings, checked: false, hasImage: !!b.image };
  });
  return { batch: { id: uid('batch'), name, importedAt: new Date().toISOString(), items, active: items[0].id }, images };
}

export function setChecked(it: BatchItem, checked: boolean): BatchItem {
  return checked ? { ...it, checked, checkedHash: modelHash(it.model), checkedAt: new Date().toISOString() } : { ...it, checked: false, checkedHash: undefined, checkedAt: undefined };
}

/** JSON project file with the whole beam list (and the drawings) */
export interface BatchFile {
  format: 'balkenrechner-batch';
  schema: number;
  savedAt: string;
  batch: Batch;
  images: Record<Id, string>;
}

export function serializeBatch(batch: Batch, images: Record<Id, string>): string {
  const f: BatchFile = { format: 'balkenrechner-batch', schema: MODEL_SCHEMA_VERSION, savedAt: new Date().toISOString(), batch, images };
  return JSON.stringify(f);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validate a beam list read from a file or the local storage; throws Error('file.invalid') */
export function normalizeBatch(raw: unknown): Batch {
  if (!isObj(raw) || !Array.isArray(raw.items) || !raw.items.length) throw new Error('file.invalid');
  const items = raw.items.map((r): BatchItem => {
    if (!isObj(r)) throw new Error('file.invalid');
    return {
      id: typeof r.id === 'string' ? r.id : uid('b'),
      key: String(r.key ?? ''),
      designation: String(r.designation ?? ''),
      model: normalizeModel(r.model),
      warnings: Array.isArray(r.warnings) ? (r.warnings as ImportWarning[]) : [],
      checked: r.checked === true,
      checkedHash: typeof r.checkedHash === 'string' ? r.checkedHash : undefined,
      checkedAt: typeof r.checkedAt === 'string' ? r.checkedAt : undefined,
      hasImage: r.hasImage === true,
    };
  });
  const active = typeof raw.active === 'string' && items.some((i) => i.id === raw.active) ? raw.active : items[0].id;
  return {
    id: typeof raw.id === 'string' ? raw.id : uid('batch'),
    name: String(raw.name ?? ''),
    importedAt: typeof raw.importedAt === 'string' ? raw.importedAt : new Date().toISOString(),
    items,
    active,
  };
}

/** Images of a beam list kept in IndexedDB (too large for localStorage); best effort */
const DB = 'balkenrechner';
const STORE = 'images';
function db(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
export async function saveImages(batchId: Id, images: Record<Id, string>): Promise<void> {
  const d = await db();
  if (!d) return;
  try {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.objectStore(STORE).put(images, batchId);
  } catch {
    /* ignore */
  }
}
export async function loadImages(batchId: Id): Promise<Record<Id, string>> {
  const d = await db();
  if (!d) return {};
  return new Promise((resolve) => {
    try {
      const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(batchId);
      req.onsuccess = () => resolve((req.result as Record<Id, string>) ?? {});
      req.onerror = () => resolve({});
    } catch {
      resolve({});
    }
  });
}

/** Read a project file: single beam (classic) or beam list */
export function parseAnyProject(text: string): { kind: 'model'; model: BeamModel } | { kind: 'batch'; batch: Batch; images: Record<Id, string> } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('file.invalid');
  }
  if (isObj(data) && data.format === 'balkenrechner-batch') {
    if (typeof data.schema === 'number' && data.schema > MODEL_SCHEMA_VERSION) throw new Error('file.newerSchema');
    const images = isObj(data.images) ? (Object.fromEntries(Object.entries(data.images).filter(([, v]) => typeof v === 'string')) as Record<Id, string>) : {};
    return { kind: 'batch', batch: normalizeBatch(data.batch), images };
  }
  return { kind: 'model', model: parseProject(text) };
}
