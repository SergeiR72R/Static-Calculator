import { describe, expect, it } from 'vitest';
import { analyze } from '../../core/analysis';
import { computeView } from '../../core/results';
import { exampleModel } from '../../core/examples';
import { autoSectionScale, buildBeamMesh, fieldValue, heatColor, sectionLoops } from './beamMesh';
import { sectionProps } from '../../sections/properties';

describe('3D beam mesh and heat map', () => {
  const an = analyze(exampleModel('simple'));
  const vr = computeView(an, { type: 'combo', id: 'ULS1' })!;

  it('section loops are centred on the centroid', () => {
    const l = sectionLoops({ kind: 'catalog', family: 'IPE', name: 'IPE 240' });
    const zs = l.outer.map((p) => p[1]);
    expect(Math.min(...zs)).toBeCloseTo(-0.12, 9);
    expect(Math.max(...zs)).toBeCloseTo(0.12, 9);
    expect(l.outer).toHaveLength(12);
    const t = sectionLoops({ kind: 'tee', h: 0.2, b: 0.2, tw: 0.01, tf: 0.02 });
    const p = sectionProps({ kind: 'tee', h: 0.2, b: 0.2, tw: 0.01, tf: 0.02 });
    expect(Math.min(...t.outer.map((q) => q[1]))).toBeCloseTo(-p.zTop, 9);
    const tube = sectionLoops({ kind: 'tube', D: 0.1, t: 0.01 });
    expect(tube.holes).toHaveLength(1);
  });

  it('bending stress is tension at the bottom for a sagging moment', () => {
    const p = sectionProps({ kind: 'rect', b: 0.1, h: 0.2 });
    expect(fieldValue('sigma', 0, 0, 1000, 0, 0.1, p, 235e6)).toBeCloseTo(1000 / p.Wbot, 6);
    expect(fieldValue('sigma', 0, 0, 1000, 0, -0.1, p, 235e6)).toBeCloseTo(-1000 / p.Wtop, 6);
    expect(fieldValue('eta', 0, 0, 1000, 0, -0.1, p, 235e6)).toBeCloseTo(1000 / p.Wtop / 235e6, 9);
  });

  it('stress range of the mesh equals ± M_max / W', () => {
    const m = buildBeamMesh(an, vr, { field: 'sigma', sectionScale: 1, deformed: false });
    const W = an.mesh!.elements[0].section.Wtop;
    const Mmax = vr.extremes.M.max.value;
    expect(m.range.max).toBeCloseTo(Mmax / W, 0);
    expect(m.range.min).toBeCloseTo(-Mmax / W, 0);
    expect(m.positions.length % 3).toBe(0);
    expect(m.colors.length).toBe(m.positions.length);
    expect(Math.max(...m.indices)).toBeLessThan(m.positions.length / 3);
    expect(m.indices.length % 3).toBe(0);
  });

  it('utilisation scale has red at 100 %', () => {
    const m = buildBeamMesh(an, vr, { field: 'eta', sectionScale: 1, deformed: false });
    expect(m.range.min).toBe(0);
    expect(m.range.max).toBeGreaterThanOrEqual(1);
    const red = heatColor(1, m.range);
    expect(red[0]).toBeGreaterThan(0.8);
  });

  it('deformed shape and section exaggeration', () => {
    const m = buildBeamMesh(an, vr, { field: 'w', sectionScale: 5, deformed: true });
    expect(m.deformFactor).toBeGreaterThan(0);
    expect(m.height).toBeCloseTo(0.24 * 5, 6);
    expect(autoSectionScale(6, 0.24)).toBe(2);
    expect(autoSectionScale(1, 0.24)).toBe(1);
  });
});
