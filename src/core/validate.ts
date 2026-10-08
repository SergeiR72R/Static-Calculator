import type { BeamModel, Issue, SectionDef } from './types';
import { X_TOL } from './types';
import { sectionProps } from '../sections/properties';
import { findCatalogEntry } from '../sections/catalog';

const err = (path: string, key: string, params?: Issue['params']): Issue => ({ path, key, params, severity: 'error' });

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function sectionGeometryIssues(def: SectionDef, base: string): Issue[] {
  const out: Issue[] = [];
  const pos = (name: string, v: number) => {
    if (!finite(v) || v <= 0) out.push(err(`${base}.${name}`, 'err.positive'));
  };
  switch (def.kind) {
    case 'rect':
      pos('b', def.b);
      pos('h', def.h);
      break;
    case 'circle':
      pos('D', def.D);
      break;
    case 'tube':
      pos('D', def.D);
      pos('t', def.t);
      if (def.t * 2 >= def.D) out.push(err(`${base}.t`, 'err.wallTooThick'));
      break;
    case 'box':
      pos('b', def.b);
      pos('h', def.h);
      pos('t', def.t);
      if (def.t * 2 >= Math.min(def.b, def.h)) out.push(err(`${base}.t`, 'err.wallTooThick'));
      break;
    case 'weldedI':
    case 'channel':
      pos('h', def.h);
      pos('b', def.b);
      pos('tw', def.tw);
      pos('tf', def.tf);
      if (def.tf * 2 >= def.h) out.push(err(`${base}.tf`, 'err.wallTooThick'));
      if (def.tw > def.b) out.push(err(`${base}.tw`, 'err.wallTooThick'));
      break;
    case 'tee':
      pos('h', def.h);
      pos('b', def.b);
      pos('tw', def.tw);
      pos('tf', def.tf);
      if (def.tf >= def.h) out.push(err(`${base}.tf`, 'err.wallTooThick'));
      if (def.tw > def.b) out.push(err(`${base}.tw`, 'err.wallTooThick'));
      break;
    case 'manual':
      pos('A', def.A);
      pos('I', def.I);
      if (!finite(def.Wtop) || def.Wtop < 0) out.push(err(`${base}.Wtop`, 'err.nonNegative'));
      if (!finite(def.Wbot) || def.Wbot < 0) out.push(err(`${base}.Wbot`, 'err.nonNegative'));
      if (!finite(def.As) || def.As < 0) out.push(err(`${base}.As`, 'err.nonNegative'));
      break;
    case 'catalog':
      if (!findCatalogEntry(def.family, def.name)) out.push(err(`${base}.name`, 'err.unknownSection'));
      break;
  }
  return out;
}

/** Validate the model before analysis. Returns field-level issues (errors and warnings). */
export function validateModel(model: BeamModel): Issue[] {
  const issues: Issue[] = [];
  const L = model.L;
  if (!finite(L) || L <= 0) {
    issues.push(err('L', 'err.positive'));
    return issues;
  }
  const inRange = (path: string, x: number) => {
    if (!finite(x)) issues.push(err(path, 'err.number'));
    else if (x < -X_TOL || x > L + X_TOL) issues.push(err(path, 'err.range', { min: 0, max: L }));
  };
  const caseIds = new Set(model.loadCases.map((c) => c.id));

  // segments
  if (!model.segments.length) issues.push(err('segments', 'err.noSegments'));
  const segs = [...model.segments].sort((a, b) => a.x1 - b.x1);
  let cursor = 0;
  for (const s of segs) {
    const base = `segments.${s.id}`;
    inRange(`${base}.x1`, s.x1);
    inRange(`${base}.x2`, s.x2);
    if (finite(s.x1) && finite(s.x2) && s.x1 >= s.x2 - X_TOL) issues.push(err(`${base}.x2`, 'err.order'));
    if (Math.abs(s.x1 - cursor) > 1e-6) issues.push(err(`${base}.x1`, 'err.segmentGap', { x: cursor }));
    cursor = s.x2;
    const geo = sectionGeometryIssues(s.section, `${base}.section`);
    issues.push(...geo);
    if (!geo.length) {
      const p = sectionProps(s.section);
      if (!(p.A > 0)) issues.push(err(`${base}.section.A`, 'err.positive'));
      if (!(p.I > 0)) issues.push(err(`${base}.section.I`, 'err.positive'));
    }
    const m = s.material;
    if (!finite(m.E) || m.E <= 0) issues.push(err(`${base}.material.E`, 'err.positive'));
    if (model.settings.theory === 'timoshenko' && (!finite(m.G) || m.G <= 0))
      issues.push(err(`${base}.material.G`, 'err.positive'));
    if (!finite(m.rho) || m.rho < 0) issues.push(err(`${base}.material.rho`, 'err.nonNegative'));
    if (!finite(m.fk) || m.fk <= 0) issues.push(err(`${base}.material.fk`, 'err.positive'));
    if (!finite(m.gammaM) || m.gammaM <= 0) issues.push(err(`${base}.material.gammaM`, 'err.positive'));
    if (!finite(m.kmod) || m.kmod <= 0) issues.push(err(`${base}.material.kmod`, 'err.positive'));
  }
  if (segs.length && Math.abs(cursor - L) > 1e-6) {
    issues.push(err(`segments.${segs[segs.length - 1].id}.x2`, 'err.segmentEnd', { x: L }));
  }

  for (const s of model.supports) {
    const base = `supports.${s.id}`;
    inRange(`${base}.x`, s.x);
    if (s.type === 'spring') {
      for (const k of ['ku', 'kw', 'kt'] as const)
        if (!finite(s[k]) || s[k] < 0) issues.push(err(`${base}.${k}`, 'err.nonNegative'));
      if (s.ku === 0 && s.kw === 0 && s.kt === 0)
        issues.push({ path: `${base}.kw`, key: 'warn.springZero', severity: 'warning' });
    }
    for (const k of ['du', 'dw', 'dt'] as const) if (!finite(s[k])) issues.push(err(`${base}.${k}`, 'err.number'));
  }
  const supByX = new Map<string, string>();
  for (const s of model.supports) {
    const key = s.x.toFixed(9);
    if (supByX.has(key)) issues.push({ path: `supports.${s.id}.x`, key: 'warn.duplicateSupport', severity: 'warning' });
    supByX.set(key, s.id);
  }
  for (const h of model.hinges) inRange(`hinges.${h.id}.x`, h.x);

  for (const l of model.loads) {
    const base = `loads.${l.id}`;
    if (!caseIds.has(l.caseId)) issues.push(err(`${base}.caseId`, 'err.unknownCase'));
    if (l.kind === 'point') {
      inRange(`${base}.x`, l.x);
      if (!finite(l.P)) issues.push(err(`${base}.P`, 'err.number'));
      if (!finite(l.angle)) issues.push(err(`${base}.angle`, 'err.number'));
    } else if (l.kind === 'moment') {
      inRange(`${base}.x`, l.x);
      if (!finite(l.M)) issues.push(err(`${base}.M`, 'err.number'));
    } else {
      inRange(`${base}.x1`, l.x1);
      inRange(`${base}.x2`, l.x2);
      if (finite(l.x1) && finite(l.x2) && l.x1 >= l.x2 - X_TOL) issues.push(err(`${base}.x2`, 'err.order'));
      if (!finite(l.q1)) issues.push(err(`${base}.q1`, 'err.number'));
      if (!finite(l.q2)) issues.push(err(`${base}.q2`, 'err.number'));
    }
  }
  for (const c of model.combinations) {
    for (const [cid, f] of Object.entries(c.factors)) {
      if (!finite(f)) issues.push(err(`combinations.${c.id}.factors.${cid}`, 'err.number'));
    }
  }
  const st = model.settings;
  if (!finite(st.deflLimitSpan) || st.deflLimitSpan <= 0) issues.push(err('settings.deflLimitSpan', 'err.positive'));
  if (!finite(st.deflLimitCantilever) || st.deflLimitCantilever <= 0)
    issues.push(err('settings.deflLimitCantilever', 'err.positive'));
  if (st.selfWeight && !model.loadCases.some((c) => c.category === 'G'))
    issues.push({ path: 'settings.selfWeight', key: 'warn.noGCase', severity: 'warning' });
  return issues;
}
