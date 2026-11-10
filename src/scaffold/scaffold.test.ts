import { describe, expect, it } from 'vitest';
import { parsePeriCadDxf, ScaffoldImportError } from './pericad';
import { analyzeScaffold, girderBeamModel } from './structure';
import { classifyPart } from './catalog';
import { periDxf, towerParts, type TestPart } from './testDxf';
import { beamSummary } from '../ui/batch/summary';

const tower = (edit?: (p: TestPart[]) => void, scale = 1) => {
  const parts = towerParts();
  edit?.(parts);
  return parsePeriCadDxf(periDxf(parts, scale), 'tower.dxf');
};

describe('PERI CAD DXF reader', () => {
  it('reads parts, articles, placements and the system lines', () => {
    const doc = tower();
    expect(doc.parts.length).toBe(towerParts().length);
    const uvr = doc.parts.find((p) => p.article === '100009')!;
    expect(uvr.name).toBe('UVR 200');
    expect(uvr.desc).toBe('Vertikalstiel UVR 200');
    expect(uvr.layer).toBe('PERI_UP_UVR');
    expect(doc.geom['100009'].lines).toHaveLength(1);
    // rosettes via nested INSERT of the rosette block
    expect(doc.geom['100009'].rosettes.map((r) => r[2])).toEqual([0.38, 0.88, 1.38, 1.88]);
    expect(doc.geom['100014'].rosettes).toHaveLength(1);
  });

  it('drawings in millimetres give the same geometry in metres', () => {
    const a = analyzeScaffold(tower());
    const b = analyzeScaffold(tower(undefined, 1000));
    expect(b.girders.map((g) => [g.L, g.supports, g.loads])).toEqual(a.girders.map((g) => [g.L, g.supports, g.loads]));
    expect(b.max[2]).toBeCloseTo(a.max[2], 6);
  });

  it('rejects DWG, foreign DXF and DXF without PERI parts with a message key', () => {
    const err = (t: string) => {
      try {
        parsePeriCadDxf(t);
      } catch (e) {
        return e instanceof ScaffoldImportError ? e.message : 'other';
      }
      return null;
    };
    expect(err('AC1032\u0000\u0000binary')).toBe('scaffold.err.dwg');
    expect(err('hello world\nfoo')).toBe('scaffold.err.format');
    expect(err('  0\r\nSECTION\r\n  2\r\nENTITIES\r\n  0\r\nLINE\r\n  0\r\nENDSEC\r\n  0\r\nEOF\r\n')).toBe('scaffold.err.noParts');
  });
});

describe('part kinds', () => {
  it('recognises PERI UP parts by article and name', () => {
    expect(classifyPart('124781', 'Zwischenelement ULS 150 FLEX')).toEqual({ kind: 'flexElement', flexLength: 1.5 });
    expect(classifyPart('x', 'Zwischenelement ULS 125 FLEX').flexLength).toBe(1.25);
    expect(classifyPart('124805', 'Endelement ULS 50 FLEX').kind).toBe('flexEnd');
    expect(classifyPart('x', 'Gitterträger ULS 70 625').girder).toBe('ULS70');
    expect(classifyPart('x', 'ULA 50 HD 425').girder).toBe('ULA50HD');
    expect(classifyPart('x', 'UBL 200/200', 'Vertikaldiagonale UBL').kind).toBe('diagonal');
    expect(classifyPart('x', 'UCB 73', 'Konsole UCB').kind).toBe('bracket');
    expect(classifyPart('x', 'Stahlbelag UDG 25x150').kind).toBe('deck');
  });
});

describe('scaffold structure', () => {
  const st = analyzeScaffold(tower());

  it('finds the standards stacked on six axes', () => {
    expect(st.columns).toHaveLength(6);
    const mid = st.columns.filter((c) => Math.abs(c.x - 2) < 1e-6);
    expect(mid.map((c) => c.z1)).toEqual([2.5, 2.5]);
    expect(st.columns.filter((c) => Math.abs(c.x) < 1e-6).map((c) => c.z1)).toEqual([4.5, 4.5]);
  });

  it('assembles the ULS Flex girders from end elements, connectors and intermediate elements', () => {
    expect(st.girders).toHaveLength(2);
    for (const g of st.girders) {
      expect(g.product).toBe('ULSFLEX');
      expect(g.flex).toEqual([1.5, 1.5]);
      expect(g.L).toBe(4);
      expect(g.origin[0]).toBeCloseTo(0, 6);
      expect(g.zBottom).toBeCloseTo(3.75, 6);
      expect(g.zTop).toBeCloseTo(4.25, 6);
      // the middle standards end below the girder: supports only at the outer standards
      expect(g.supports).toEqual([0, 4]);
      expect(g.supportsAssumed).toBe(false);
      // decks 2.00 m across: half of the span on each girder, over the whole length
      expect(g.loads).toEqual([{ s1: 0, s2: 4, span: 2 }]);
      expect(g.warnings).toEqual([]);
    }
  });

  it('beam model of a girder: supports, deck loads per load class, PERI checks', () => {
    const m = girderBeamModel(st.girders[0], { p: 2000, g: 200 });
    expect(m.L).toBe(4);
    expect(m.segments[0].section).toMatchObject({ kind: 'peri', product: 'ULSFLEX', lattice: { flex: [1.5, 1.5] } });
    expect(m.supports.map((s) => [s.type, s.x])).toEqual([
      ['pinned', 0],
      ['roller', 4],
    ]);
    expect(m.loads.map((l) => (l.kind === 'dist' ? [l.caseId, l.x1, l.x2, l.q1] : null))).toEqual([
      ['G', 0, 4, 200],
      ['Q', 0, 4, 2000],
    ]);
    const s = beamSummary(m);
    expect(s.state).toBe('ok');
    expect(s.eta).toBeGreaterThan(0.4);
    expect(s.eta).toBeLessThan(0.7);
  });

  it('parts list and notes (no diagonals, duplicate)', () => {
    expect(st.bom.find((b) => b.article === '124109')!.count).toBe(32);
    expect(st.issues.map((i) => i.key)).toEqual(['noDiagonals']);
    const dup = analyzeScaffold(
      tower((p) => {
        p.push({ ...p.find((x) => x.art === 'UH')! });
      }),
    );
    expect(dup.issues.map((i) => i.key)).toContain('duplicate');
  });

  it('a girder without standards gets supports at its ends (marked as assumed)', () => {
    const s = analyzeScaffold(tower((p) => p.splice(0, p.length, ...p.filter((x) => !(x.art === 'UVR' && x.t[2] > 2)))));
    for (const g of s.girders) {
      expect(g.supportsAssumed).toBe(true);
      expect(g.supports).toEqual([0, 4]);
      expect(g.warnings.map((w) => w.key)).toContain('girderSupports');
    }
  });
});

describe('snapping of imprecisely placed parts', () => {
  const shift = (p: TestPart, d: [number, number, number]) => {
    p.t = [p.t[0] + d[0], p.t[1] + d[1], p.t[2] + d[2]];
  };
  const ref = analyzeScaffold(tower(), { tol: 0 });
  const pos = (s: ReturnType<typeof analyzeScaffold>, k: number) => {
    const m = s.parts[k].part.m;
    return [m[3], m[7], m[11]];
  };

  it('standards, ledgers and decks a few centimetres off are set into place', () => {
    const idx: number[] = [];
    const s = analyzeScaffold(
      tower((p) => {
        const uvr = p.findIndex((x) => x.art === 'UVR' && x.t[2] > 2);
        const uh = p.findIndex((x) => x.art === 'UH' && x.rot === 'y');
        const uhx = p.findIndex((x) => x.art === 'UH' && x.rot === 'x' && x.t[2] > 2);
        const udg = p.findIndex((x) => x.art === 'UDG');
        shift(p[uvr], [0.03, -0.02, 0.025]);
        shift(p[uh], [0.01, 0.02, -0.02]);
        shift(p[uhx], [-0.03, 0.015, 0.01]);
        shift(p[udg], [0, 0.03, 0.015]);
        idx.push(uvr, uh, uhx, udg);
      }),
    );
    expect(s.moves).toHaveLength(4);
    for (const k of idx) pos(s, k).forEach((v, i) => expect(v).toBeCloseTo(pos(ref, k)[i], 6));
    expect(s.issues.find((i) => i.key === 'healed')?.params).toMatchObject({ n: 4 });
    expect(s.issues.map((i) => i.key)).not.toContain('ledgerFree');
  });

  it('parts beyond the tolerance stay where they are (and are reported)', () => {
    const s = analyzeScaffold(
      tower((p) => {
        shift(p.find((x) => x.art === 'UH' && x.rot === 'x')!, [0.3, 0, 0]);
      }),
    );
    expect(s.moves).toHaveLength(0);
    expect(s.issues.map((i) => i.key)).toContain('ledgerFree');
  });

  it('tolerance 0 switches the snapping off', () => {
    const s = analyzeScaffold(tower((p) => shift(p.find((x) => x.art === 'UVR')!, [0.02, 0, 0])), { tol: 0 });
    expect(s.moves).toHaveLength(0);
  });
});
