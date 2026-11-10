/**
 * State of the scaffold mode (PERI CAD import): the drawing, load and snapping options, selection.
 * Saved in the browser like the beam project, independently of it.
 */
import { create } from 'zustand';
import { storage } from '../state/persist';
import type { ScaffoldDoc } from './pericad';

const KEY = 'balken.scaffold';
const OPT_KEY = 'balken.scaffoldOpts';

export interface ScaffoldOpts {
  /** service class EN 12811-1 (1…6) */
  loadClass: number;
  /** self weight of the decks, N/m² */
  g: number;
  /** snapping tolerance, m */
  tol: number;
}

export const DEFAULT_SCAFFOLD_OPTS: ScaffoldOpts = { loadClass: 3, g: 300, tol: 0.05 };

export interface ScaffoldState extends ScaffoldOpts {
  doc: ScaffoldDoc | null;
  /** selected parts (3D, lists) */
  selected: string[];
  /** selected girder key */
  girder: string | null;
  /** beam list created from this drawing: id and signature of drawing + options */
  batchRef: { id: string; sig: string } | null;
  setDoc: (doc: ScaffoldDoc | null) => void;
  setOpts: (o: Partial<ScaffoldOpts>) => void;
  select: (parts: string[], girder?: string | null) => void;
  setBatchRef: (r: { id: string; sig: string } | null) => void;
}

function loadDoc(): ScaffoldDoc | null {
  const raw = storage.get(KEY);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as ScaffoldDoc;
    return Array.isArray(d.parts) && d.geom ? d : null;
  } catch {
    return null;
  }
}

function loadOpts(): ScaffoldOpts & { batchRef: ScaffoldState['batchRef'] } {
  const o = { ...DEFAULT_SCAFFOLD_OPTS, batchRef: null };
  try {
    const saved = JSON.parse(storage.get(OPT_KEY) ?? '{}');
    // options of version 1: deck self weight was the old default 0.20 kN/m² → new default
    if (!saved.v) delete saved.g;
    delete saved.v;
    Object.assign(o, saved);
  } catch {
    /* ignore */
  }
  return o;
}

function save(s: ScaffoldState) {
  storage.set(OPT_KEY, JSON.stringify({ v: 2, loadClass: s.loadClass, g: s.g, tol: s.tol, batchRef: s.batchRef }));
}

export const useScaffold = create<ScaffoldState>()((set, get) => ({
  ...loadOpts(),
  doc: loadDoc(),
  selected: [],
  girder: null,
  setDoc: (doc) => {
    set({ doc, selected: [], girder: null, batchRef: null });
    save(get());
    if (doc) storage.set(KEY, JSON.stringify(doc));
    else storage.remove(KEY);
  },
  setOpts: (o) => {
    set(o);
    save(get());
  },
  select: (parts, girder = null) => set({ selected: parts, girder }),
  setBatchRef: (r) => {
    set({ batchRef: r });
    save(get());
  },
}));
