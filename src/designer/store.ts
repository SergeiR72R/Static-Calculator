/**
 * State of the designer: the section being drawn (saved in the browser), the undo history and the
 * last result of its analysis (with the section it belongs to).
 */
import { create } from 'zustand';
import { storage } from '../state/persist';
import type { ScaffoldResult } from '../scaffold/analysis';
import type { ModelNote } from '../scaffold/model';
import { DEFAULT_FAMILIES, FAMILIES } from './catalog';
import { DEFAULT_SETTINGS, emptyDesign, type Design, type DesignAnchor, type DesignSettings, type Placed } from './design';

const KEY = 'balken.designer';
const FAM_KEY = 'balken.designer.families';
const UNDO = 100;

export interface DesignRun {
  result: ScaffoldResult;
  notes: ModelNote[];
  /** the section it was calculated for */
  design: Design;
}

interface DesignerState {
  design: Design;
  past: Design[];
  future: Design[];
  run: DesignRun | null;
  /** parts copied (with the anchors of copied standards) */
  clipboard: { parts: Placed[]; anchors: DesignAnchor[] } | null;
  copy: (ids: string[]) => void;
  /** the copied parts moved by (dx, dz) into the section (one step of the history); their new ids */
  paste: (dx: number, dz: number) => string[];
  /** series of parts shown in the catalogue (FAMILIES) */
  families: string[];
  setFamilies: (f: string[]) => void;
  /** change the section (one step of the undo history) */
  edit: (f: (d: Design) => Design) => void;
  addPart: (p: Omit<Placed, 'id'>) => string;
  updatePart: (id: string, patch: Partial<Placed>) => void;
  removeParts: (ids: string[]) => void;
  addAnchor: (a: Omit<DesignAnchor, 'id'>) => void;
  removeAnchor: (id: string) => void;
  setSettings: (s: Partial<DesignSettings>) => void;
  setName: (name: string) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  load: (d: Design) => void;
  setRun: (r: DesignRun | null) => void;
}

function loadDesign(): Design {
  try {
    const d = JSON.parse(storage.get(KEY) ?? 'null') as Design | null;
    if (d && Array.isArray(d.parts)) return { ...emptyDesign(), ...d, anchors: d.anchors ?? [], settings: { ...DEFAULT_SETTINGS, ...d.settings } };
  } catch {
    /* ignore */
  }
  return emptyDesign();
}

function loadFamilies(): string[] {
  try {
    const f = JSON.parse(storage.get(FAM_KEY) ?? 'null') as string[] | null;
    if (Array.isArray(f)) return f.filter((x) => FAMILIES.some((y) => y.id === x));
  } catch {
    /* ignore */
  }
  return [...DEFAULT_FAMILIES];
}

const save = (d: Design) => {
  if (!storage.trySet(KEY, JSON.stringify(d))) storage.remove(KEY);
};

/** next free id with the prefix (D1, D2 …; A1 …) */
const nextId = (ids: string[], prefix: string) => {
  let n = 0;
  for (const id of ids) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(id);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `${prefix}${n + 1}`;
};

export const useDesigner = create<DesignerState>()((set, get) => ({
  design: loadDesign(),
  past: [],
  future: [],
  run: null,
  clipboard: null,
  copy: (ids) => {
    const d = get().design;
    const parts = d.parts.filter((p) => ids.includes(p.id));
    if (!parts.length) return;
    set({ clipboard: { parts: structuredClone(parts), anchors: structuredClone(d.anchors.filter((a) => ids.includes(a.part))) } });
  },
  paste: (dx, dz) => {
    const cb = get().clipboard;
    if (!cb) return [];
    const map = new Map<string, string>();
    const r = (v: number) => Math.round(v * 1000) / 1000;
    get().edit((d) => {
      const ids = d.parts.map((p) => p.id);
      const parts = cb.parts.map((p) => {
        const id = nextId(ids, 'D');
        ids.push(id);
        map.set(p.id, id);
        return { ...structuredClone(p), id, x: r(p.x + dx), z: r(p.z + dz), ...(p.x2 !== undefined ? { x2: r(p.x2 + dx), z2: r((p.z2 ?? p.z) + dz) } : {}) };
      });
      const aIds = d.anchors.map((a) => a.id);
      const anchors = cb.anchors.map((a) => {
        const id = nextId(aIds, 'A');
        aIds.push(id);
        return { ...a, id, part: map.get(a.part)!, z: r(a.z + dz) };
      });
      return { ...d, parts: [...d.parts, ...parts], anchors: [...d.anchors, ...anchors] };
    });
    return [...map.values()];
  },
  families: loadFamilies(),
  setFamilies: (families) => {
    storage.set(FAM_KEY, JSON.stringify(families));
    set({ families });
  },
  edit: (f) => {
    const d0 = get().design;
    const d = f(d0);
    if (d === d0) return;
    save(d);
    set({ design: d, past: [...get().past, d0].slice(-UNDO), future: [] });
  },
  addPart: (p) => {
    const id = nextId(
      get().design.parts.map((x) => x.id),
      'D',
    );
    get().edit((d) => ({ ...d, parts: [...d.parts, { ...p, id }] }));
    return id;
  },
  updatePart: (id, patch) => get().edit((d) => ({ ...d, parts: d.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
  removeParts: (ids) =>
    get().edit((d) => ({
      ...d,
      parts: d.parts.filter((p) => !ids.includes(p.id)),
      anchors: d.anchors.filter((a) => !ids.includes(a.part)),
    })),
  addAnchor: (a) =>
    get().edit((d) => ({
      ...d,
      anchors: [
        ...d.anchors,
        {
          ...a,
          id: nextId(
            d.anchors.map((x) => x.id),
            'A',
          ),
        },
      ],
    })),
  removeAnchor: (id) => get().edit((d) => ({ ...d, anchors: d.anchors.filter((a) => a.id !== id) })),
  setSettings: (s) => get().edit((d) => ({ ...d, settings: { ...d.settings, ...s } })),
  setName: (name) => get().edit((d) => ({ ...d, name })),
  undo: () => {
    const { past, design, future } = get();
    if (!past.length) return;
    const d = past[past.length - 1];
    save(d);
    set({ design: d, past: past.slice(0, -1), future: [design, ...future] });
  },
  redo: () => {
    const { past, design, future } = get();
    if (!future.length) return;
    const d = future[0];
    save(d);
    set({ design: d, past: [...past, design], future: future.slice(1) });
  },
  clear: () => get().edit(() => emptyDesign()),
  load: (d) => get().edit(() => ({ ...emptyDesign(), ...d, settings: { ...DEFAULT_SETTINGS, ...d.settings } })),
  setRun: (run) => set({ run }),
}));
