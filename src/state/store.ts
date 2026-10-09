import { create } from 'zustand';
import type { BeamModel, Id } from '../core/types';
import type { ResultView } from '../core/results';
import { defaultModel, templateModel, type TemplateId } from '../core/defaults';
import type { Lang } from '../units/format';
import type { UnitSystem } from '../units/units';
import { modelFromHash, normalizeModel, storage } from './persist';
import { builtinUserDefaults, type UserDefaults } from '../core/project';

export type Selection = { kind: 'support' | 'hinge' | 'load' | 'segment'; id: Id } | null;
export type InputTab = 'beam' | 'supports' | 'loads' | 'cases' | 'settings';
export type MainTab = 'results' | 'report';

export interface Prefs {
  lang: Lang;
  units: UnitSystem;
  decimals: number;
  theme: 'light' | 'dark';
  /** plot side of positive (sagging) moments: 'bottom' = tension fibre side */
  momentSide: 'bottom' | 'top';
  /** snapping step for dragging, m */
  snap: number;
  showDeformed: boolean;
  /** deformed shape magnification relative to automatic scale */
  deformScale: number;
  /** include step-by-step report in print */
  printReport: boolean;
  /** CSV sampling step, m */
  csvStep: number;
  /** DXF diagram scales: mm per display unit */
  dxfScale: { N: number; V: number; M: number; w: number };
}

export const DEFAULT_PREFS: Prefs = {
  lang: 'de',
  units: 'metric',
  decimals: 2,
  theme: 'light',
  momentSide: 'bottom',
  snap: 0.05,
  showDeformed: true,
  deformScale: 1,
  printReport: false,
  csvStep: 0.1,
  dxfScale: { N: 20, V: 20, M: 20, w: 50 },
};

interface History {
  past: BeamModel[];
  future: BeamModel[];
  /** coalescing of consecutive edits of the same field */
  lastKey: string | null;
  lastTime: number;
}

export interface AppState extends Prefs {
  model: BeamModel;
  history: History;
  /** model snapshot at the start of a drag operation */
  dragBase: BeamModel | null;
  view: ResultView;
  selection: Selection;
  cursorX: number | null;
  inputTab: InputTab;
  mainTab: MainTab;
  /** transient notification (i18n key) */
  toast: { key: string; params?: Record<string, string | number> } | null;
  /** new-project wizard; firstRun = first start on this computer (includes the preferences step) */
  wizard: { open: boolean; firstRun: boolean };
  /** defaults for new projects chosen by the user */
  userDefaults: UserDefaults;

  setPrefs: (p: Partial<Prefs>) => void;
  /** apply an update to a copy of the model and push it on the undo stack */
  update: (fn: (draft: BeamModel) => void, coalesceKey?: string) => void;
  /** replace the whole model (template, file, link) */
  loadModel: (m: BeamModel) => void;
  loadTemplate: (id: TemplateId) => void;
  undo: () => void;
  redo: () => void;
  beginDrag: () => void;
  dragUpdate: (fn: (draft: BeamModel) => void) => void;
  endDrag: () => void;
  setView: (v: ResultView) => void;
  select: (s: Selection) => void;
  setCursor: (x: number | null) => void;
  setInputTab: (t: InputTab) => void;
  setMainTab: (t: MainTab) => void;
  showToast: (key: string, params?: Record<string, string | number>) => void;
  openWizard: () => void;
  /** close the wizard; marks the first start as done */
  closeWizard: () => void;
  setUserDefaults: (d: UserDefaults) => void;
}

const MODEL_KEY = 'balken.model';
const ONBOARDED_KEY = 'balken.onboarded';
const DEFAULTS_KEY = 'balken.defaults';
const PREFS_KEY = 'balken.prefs';
const LANG_KEY = 'balken.lang';
const THEME_KEY = 'balken.theme';
const HISTORY_LIMIT = 200;

function loadPrefs(): Prefs {
  const p: Prefs = { ...DEFAULT_PREFS, dxfScale: { ...DEFAULT_PREFS.dxfScale } };
  const raw = storage.get(PREFS_KEY);
  if (raw) {
    try {
      Object.assign(p, JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }
  // language: German on first start, regardless of the browser language
  const lang = storage.get(LANG_KEY);
  p.lang = lang === 'ru' || lang === 'en' || lang === 'de' || lang === 'he' ? lang : 'de';
  const theme = storage.get(THEME_KEY);
  if (theme === 'dark' || theme === 'light') p.theme = theme;
  else if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) p.theme = 'dark';
  return p;
}

function savePrefs(s: AppState) {
  const p: Partial<Prefs> = {
    units: s.units,
    decimals: s.decimals,
    momentSide: s.momentSide,
    snap: s.snap,
    showDeformed: s.showDeformed,
    deformScale: s.deformScale,
    printReport: s.printReport,
    csvStep: s.csvStep,
    dxfScale: s.dxfScale,
  };
  storage.set(PREFS_KEY, JSON.stringify(p));
  storage.set(LANG_KEY, s.lang);
  storage.set(THEME_KEY, s.theme);
}

/** Initial model: share link in the URL > autosave > default template */
function initialModel(): { model: BeamModel; fromLink: boolean } {
  if (typeof window !== 'undefined') {
    try {
      const m = modelFromHash(window.location.hash);
      if (m) {
        // the model is autosaved from now on; without the hash a reload opens the edited project
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        return { model: m, fromLink: true };
      }
    } catch {
      /* invalid link → fall through */
    }
  }
  const raw = storage.get(MODEL_KEY);
  if (raw) {
    try {
      return { model: normalizeModel(JSON.parse(raw)), fromLink: false };
    } catch {
      /* ignore */
    }
  }
  return { model: defaultModel(), fromLink: false };
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

function fixView(model: BeamModel, view: ResultView): ResultView {
  if (view.type === 'case' && !model.loadCases.some((c) => c.id === view.id)) return { type: 'combo', id: model.combinations[0]?.id ?? '' };
  if (view.type === 'combo' && !model.combinations.some((c) => c.id === view.id))
    return model.combinations.length ? { type: 'combo', id: model.combinations[0].id } : { type: 'case', id: model.loadCases[0]?.id ?? 'G' };
  return view;
}

const init = initialModel();

/** First start on this computer: nothing saved yet and not opened via a share link */
const firstRun = !init.fromLink && !storage.get(ONBOARDED_KEY) && !storage.get(MODEL_KEY);

function loadUserDefaults(): UserDefaults {
  const d = builtinUserDefaults();
  const raw = storage.get(DEFAULTS_KEY);
  if (!raw) return d;
  try {
    const p = JSON.parse(raw) as Partial<UserDefaults>;
    return { ...d, ...p, settings: { ...d.settings, ...(p.settings ?? {}) } };
  } catch {
    return d;
  }
}

export const useStore = create<AppState>()((set, get) => ({
  ...loadPrefs(),
  model: init.model,
  history: { past: [], future: [], lastKey: null, lastTime: 0 },
  dragBase: null,
  view: init.model.combinations.length ? { type: 'combo', id: init.model.combinations[0].id } : { type: 'case', id: 'G' },
  selection: null,
  cursorX: null,
  inputTab: 'beam',
  mainTab: 'results',
  toast: init.fromLink ? { key: 'toast.loadedFromLink' } : null,
  wizard: { open: firstRun, firstRun },
  userDefaults: loadUserDefaults(),

  setPrefs: (p) => {
    set(p);
    savePrefs(get());
  },
  update: (fn, coalesceKey) => {
    const s = get();
    const draft = clone(s.model);
    fn(draft);
    const now = Date.now();
    const coalesce = coalesceKey && s.history.lastKey === coalesceKey && now - s.history.lastTime < 2000;
    const past = coalesce ? s.history.past : [...s.history.past, s.model].slice(-HISTORY_LIMIT);
    set({
      model: draft,
      history: { past, future: [], lastKey: coalesceKey ?? null, lastTime: now },
      view: fixView(draft, s.view),
    });
  },
  loadModel: (m) => {
    const s = get();
    set({
      model: m,
      history: { past: [...s.history.past, s.model].slice(-HISTORY_LIMIT), future: [], lastKey: null, lastTime: 0 },
      view: m.combinations.length ? { type: 'combo', id: m.combinations[0].id } : { type: 'case', id: m.loadCases[0]?.id ?? 'G' },
      selection: null,
    });
  },
  loadTemplate: (id) => get().loadModel(templateModel(id)),
  undo: () => {
    const s = get();
    const prev = s.history.past[s.history.past.length - 1];
    if (!prev) return;
    set({
      model: prev,
      history: { past: s.history.past.slice(0, -1), future: [s.model, ...s.history.future], lastKey: null, lastTime: 0 },
      view: fixView(prev, s.view),
    });
  },
  redo: () => {
    const s = get();
    const next = s.history.future[0];
    if (!next) return;
    set({
      model: next,
      history: { past: [...s.history.past, s.model], future: s.history.future.slice(1), lastKey: null, lastTime: 0 },
      view: fixView(next, s.view),
    });
  },
  beginDrag: () => set({ dragBase: get().model }),
  dragUpdate: (fn) => {
    const draft = clone(get().model);
    fn(draft);
    set({ model: draft });
  },
  endDrag: () => {
    const s = get();
    if (!s.dragBase) return;
    if (s.dragBase !== s.model) {
      set({
        history: { past: [...s.history.past, s.dragBase].slice(-HISTORY_LIMIT), future: [], lastKey: null, lastTime: 0 },
      });
    }
    set({ dragBase: null });
  },
  setView: (v) => set({ view: v }),
  select: (sel) => set({ selection: sel }),
  setCursor: (x) => set({ cursorX: x }),
  setInputTab: (t) => set({ inputTab: t }),
  setMainTab: (t) => set({ mainTab: t }),
  showToast: (key, params) => set({ toast: { key, params } }),
  openWizard: () => set({ wizard: { open: true, firstRun: false } }),
  closeWizard: () => {
    storage.set(ONBOARDED_KEY, '1');
    set({ wizard: { open: false, firstRun: false } });
  },
  setUserDefaults: (d) => {
    storage.set(DEFAULTS_KEY, JSON.stringify(d));
    set({ userDefaults: d });
  },
}));

// autosave (debounced, flushed when the page is hidden or closed so no edit gets lost)
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let dirty = false;
function flushSave() {
  clearTimeout(saveTimer);
  if (!dirty) return;
  dirty = false;
  storage.set(MODEL_KEY, JSON.stringify(useStore.getState().model));
}
useStore.subscribe((s, prev) => {
  if (s.model === prev.model) return;
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 300);
});
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
}
