import type { AnalysisSettings, BeamModel, Material, SectionDef } from './types';
import { DEFAULT_SETTINGS, defaultSection, templateModel, type TemplateId } from './defaults';
import { materialPreset } from '../sections/materials';

/** Options collected by the "new project" wizard */
export interface NewProjectOptions {
  name: string;
  author: string;
  description: string;
  template: TemplateId;
  /** beam length, m */
  L: number;
  material: Material;
  section: SectionDef;
  settings: AnalysisSettings;
}

/** Defaults the user chose for new projects (stored in the browser) */
export interface UserDefaults {
  author: string;
  template: TemplateId;
  L: number;
  material: Material;
  section: SectionDef;
  settings: AnalysisSettings;
}

export function builtinUserDefaults(): UserDefaults {
  return {
    author: '',
    template: 'simple',
    L: 6,
    material: materialPreset('S235'),
    section: defaultSection(),
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** Scale all positions of a model to a new beam length (proportional geometry) */
export function scaleModel(m: BeamModel, L: number): BeamModel {
  const f = L / m.L;
  const r = (x: number) => Math.round(x * f * 1e6) / 1e6;
  m.L = L;
  for (const s of m.segments) {
    s.x1 = r(s.x1);
    s.x2 = r(s.x2);
  }
  if (m.segments.length) m.segments[m.segments.length - 1].x2 = L;
  for (const s of m.supports) s.x = r(s.x);
  for (const h of m.hinges) h.x = r(h.x);
  for (const l of m.loads) {
    if (l.kind === 'dist') {
      l.x1 = r(l.x1);
      l.x2 = r(l.x2);
    } else l.x = r(l.x);
  }
  return m;
}

/** Build a new project from the wizard options */
export function createProject(o: NewProjectOptions, now = new Date()): BeamModel {
  const m = scaleModel(templateModel(o.template), o.L);
  m.name = o.name.trim();
  if (o.author.trim()) m.author = o.author.trim();
  if (o.description.trim()) m.description = o.description.trim();
  m.createdAt = now.toISOString();
  for (const s of m.segments) {
    s.material = structuredClone(o.material);
    s.section = structuredClone(o.section);
  }
  // the template may switch pattern loading on (three-span beam); the user's choice wins
  m.settings = { ...o.settings };
  return m;
}
