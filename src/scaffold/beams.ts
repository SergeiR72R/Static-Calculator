/**
 * Beams SRU / RCS of the scaffold as beam models for the beam calculator: the standards and ledgers
 * standing on a beam become point loads (envelope of the scaffold analysis), the standards under it
 * or its assumed end supports become supports.
 */
import type { BeamModel } from '../core/types';
import { baseModel, makeSupport, pointLoad } from '../core/defaults';
import { findPeriProduct, periMaterial } from '../sections/peri';
import { GAMMA_F, type BeamResult } from './analysis';

export interface ScaffoldBeam {
  key: string;
  designation: string;
  model: BeamModel;
  warnings: { key: string; params?: Record<string, string | number> }[];
  /** loads and their sum (design), N */
  loads: number;
  sum: number;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function scaffoldBeam(b: BeamResult, key: string, name: string, fileName = ''): ScaffoldBeam {
  const product = /RCS/i.test(name) ? 'RCS' : 'SRU120';
  const prod = findPeriProduct(product);
  // catalogue length next to the length in the drawing
  const L = prod ? prod.lengths.reduce((a, x) => (Math.abs(x - b.length) < Math.abs(a - b.length) ? x : a), prod.lengths[0]) : b.length;
  const len = Math.abs(L - b.length) <= 0.03 ? L : r3(b.length);
  const m = baseModel(len, `${key} ${name}`);
  m.segments[0].section = { kind: 'peri', product };
  m.segments[0].material = periMaterial(product);
  m.settings.selfWeight = true;
  const warnings: ScaffoldBeam['warnings'] = [];
  let sup = [...new Set(b.points.filter((p) => p.support).map((p) => r3(p.t * len)))].sort((x, y) => x - y);
  if (sup.length < 2) {
    sup = [0, len];
    warnings.push({ key: 'beamSupports' });
  }
  m.supports = sup.map((x, k) => makeSupport(k === 0 ? 'pinned' : 'roller', x));
  const loads = b.points.filter((p) => !p.support && p.F > 1);
  // design values of the scaffold analysis (γF = 1.5) as characteristic variable loads: 1.5·Q gives them back
  m.loads = loads.map((p) => pointLoad('Q', r3(p.t * len), p.F / GAMMA_F / 1e3));
  if (!loads.length) warnings.push({ key: 'beamNoLoads' });
  m.description = [fileName && `PERI CAD: ${fileName}`, key, `${loads.length} Lasten aus der Gerüstberechnung (Bemessungswerte / ${GAMMA_F})`].filter(Boolean).join(' · ');
  return { key, designation: name, model: m, warnings, loads: loads.length, sum: loads.reduce((s, p) => s + p.F, 0) };
}
