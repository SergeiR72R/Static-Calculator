import { describe, expect, it } from 'vitest';
import { builtinUserDefaults, createProject, scaleModel } from './project';
import { templateModel } from './defaults';
import { analyze } from './analysis';
import { materialPreset } from '../sections/materials';

describe('new project', () => {
  it('scales the template geometry to the chosen length', () => {
    const m = scaleModel(templateModel('gerber'), 7);
    expect(m.L).toBe(7);
    expect(m.supports.map((s) => s.x)).toEqual([0, 3, 7]);
    expect(m.hinges[0].x).toBe(3.75);
    expect(m.segments[0].x2).toBe(7);
  });

  it('creates a project with name, author, section, material and settings', () => {
    const d = builtinUserDefaults();
    const m = createProject(
      {
        ...d,
        name: '  Halle 3, Pfette  ',
        author: 'M. Muster',
        description: 'Dachpfette Achse B',
        template: 'twoSpan',
        L: 12,
        material: materialPreset('C24'),
        section: { kind: 'rect', b: 0.12, h: 0.24 },
        settings: { ...d.settings, selfWeight: true, deflLimitSpan: 300 },
      },
      new Date('2026-10-08T10:00:00Z'),
    );
    expect(m.name).toBe('Halle 3, Pfette');
    expect(m.author).toBe('M. Muster');
    expect(m.description).toBe('Dachpfette Achse B');
    expect(m.createdAt).toBe('2026-10-08T10:00:00.000Z');
    expect(m.loads).toHaveLength(0);
    expect(m.supports.map((s) => s.x)).toEqual([0, 6, 12]);
    expect(m.segments[0].material.preset).toBe('C24');
    expect(m.segments[0].section).toEqual({ kind: 'rect', b: 0.12, h: 0.24 });
    expect(m.settings.selfWeight).toBe(true);
    expect(m.settings.deflLimitSpan).toBe(300);
    // the new project is valid and can be analysed (self weight acts in G)
    const an = analyze(m);
    expect(an.ok).toBe(true);
  });

  it('templates contain no loads', () => {
    const m = createProject({ ...builtinUserDefaults(), name: 'A', description: '', template: 'gerber', L: 10 });
    expect(m.loads).toHaveLength(0);
    expect(m.hinges).toHaveLength(1);
    expect(analyze(m).ok).toBe(true);
  });
});
