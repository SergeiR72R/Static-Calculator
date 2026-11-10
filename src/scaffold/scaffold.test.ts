import { describe, expect, it } from 'vitest';
import { parsePeriCadDxf, ScaffoldImportError } from './pericad';
import { analyzeScaffold, girderBeamModel } from './structure';
import { classifyPart } from './catalog';
import { PARTS_DB_SIZE, findPart } from './weights';
import { periDxf, towerParts, type TestPart } from './testDxf';
import { beamSummary } from '../ui/batch/summary';

const tower = (edit?: (p: TestPart[]) => void, scale = 1, yUp = false) => {
  const parts = towerParts();
  edit?.(parts);
  return parsePeriCadDxf(periDxf(parts, scale, yUp), 'tower.dxf');
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

  it('drawings modelled with the y axis up are turned upright', () => {
    const a = analyzeScaffold(tower());
    const b = analyzeScaffold(tower(undefined, 1, true));
    expect(b.columns).toHaveLength(6);
    expect(b.girders.map((g) => [g.L, g.supports, g.loads, g.zTop])).toEqual(a.girders.map((g) => [g.L, g.supports, g.loads, g.zTop]));
    expect(b.max[2] - b.min[2]).toBeCloseTo(a.max[2] - a.min[2], 6);
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
    expect(classifyPart('103929', 'SRU 272', 'Stahlriegel SRU 272 U120').kind).toBe('beam');
    expect(classifyPart('109471', 'RCS 498', 'Kletterschiene RCS 498').kind).toBe('beam');
    expect(classifyPart('026413', 'TUBE 3m', 'Gerüstrohr 48,3x3,2mm 3m vz').kind).toBe('tube');
    expect(classifyPart('017020', 'RA 48/48', 'Normalkupplung RA Ø48/48mm vz').kind).toBe('coupler');
    expect(classifyPart('113726', 'UEC', 'Flanschkupplung UEC').kind).toBe('coupler');
    expect(classifyPart('106183', 'Main Beam Clamp HD 70 mm, galv.', 'Trägerklammer HD 70mm vz').kind).toBe('clamp');
    expect(classifyPart('110160', 'UPY 150', 'Bordblech Stahl UPY 150').kind).toBe('toeboard');
    expect(classifyPart('101731', 'UHA', 'Riegelaufnahme UHA').kind).toBe('accessory');
    expect(classifyPart('130681', 'UH Zapfen', 'UH-Zapfen-2').kind).toBe('accessory');
    expect(classifyPart('112676', 'UCM 50 mit Zapfen', 'Konsole UCM 50 mit Zapfen').kind).toBe('bracket');
    expect(classifyPart('100000', 'UVH 100', 'Kopfstiel UVH 100').kind).toBe('standard');
    expect(classifyPart('114818', 'UBH FLEX 100x100', 'H-Diagonale UBH Flex 100/100').kind).toBe('diagonal');
  });

  it('parts database of the PERI catalogue: kinds and weights by article or name', () => {
    expect(PARTS_DB_SIZE).toBeGreaterThan(400);
    // article of the drawing (1xxxxx) and of the catalogue (4xxxxx) are the same part
    expect(findPart('100009')).toMatchObject({ kg: 10, name: 'Vertikalstiel UVR 200' });
    expect(findPart('400013')?.kg).toBe(19.2);
    expect(findPart('100013')?.name).toBe('Vertikalstiel UVR 400');
    // unknown article: by the name written in the drawing
    expect(findPart('999999', 'UBK 300/200', 'Knotendiagonale UBK 300/200(Preis auf Anfrage)')?.kg).toBe(10.3);
    expect(findPart('999999', 'Stahlbelag UDG 25x100', '')?.kg).toBe(6.63);
    expect(findPart('999999', 'Unbekannt')).toBeUndefined();
    // short names of the drawing are classified with the catalogue name
    expect(classifyPart('x', 'UAS 75x250/200', 'Gerüsttreppe UAS 75 x 250/200, Alu').kind).toBe('stair');
    expect(classifyPart('x', 'UAH', 'Treppengeländer UAH').kind).toBe('guard');
    expect(classifyPart('x', 'Klemmrosette 90°').kind).toBe('accessory');
    expect(classifyPart('x', 'ULT 32').kind).toBe('accessory');
    expect(classifyPart('x', 'RR 60/48').kind).toBe('coupler');
    expect(classifyPart('x', 'M10x70').kind).toBe('accessory');
    expect(classifyPart('x', 'Rohrverbinder 48,3').kind).toBe('accessory');
    expect(classifyPart('x', 'UAC 75x250-L', 'Leitergangstafel UAC 75 x 250-L').kind).toBe('deck');
    expect(classifyPart('x', 'UJB 38-80/55', 'Fußspindel UJB 38-80/55').kind).toBe('jack');
    expect(classifyPart('x', 'UVR 400', 'Vertikalstiel UVR 400').kind).toBe('standard');
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

  it('anchors: tube with a coupler at a standard and a flange coupler at the structure', () => {
    const s = analyzeScaffold(
      tower((p) => {
        // standard axis (0, 0); tube 1 m outwards in −x at +1.20 m, coupler at the standard, flange coupler at the end
        p.push({ art: 'TUBE', rot: 'nx', t: [-0.06, 0, 1.2] });
        p.push({ art: 'RA', rot: 'x', t: [-0.06, 0, 1.2] });
        p.push({ art: 'UEC', rot: 'x', t: [-1.06, 0, 1.2] });
        // brace between two standards: no anchor
        p.push({ art: 'TUBE2', rot: 'x', t: [0, 0.06, 1.6] });
        p.push({ art: 'RA', rot: 'x', t: [0, 0.06, 1.6] });
      }),
    );
    expect(s.anchors).toHaveLength(1);
    expect(s.anchors[0].length).toBeCloseTo(1, 6);
    expect(s.anchors[0].flange).toHaveLength(1);
    expect(s.parts.filter((w) => w.cls.kind === 'anchor')).toHaveLength(1);
    expect(s.issues.find((i) => i.key === 'anchors')?.params).toEqual({ n: 1 });
  });

  it('parts list with weights from the PERI parts list', () => {
    expect(st.bom.find((b) => b.article === '100009')).toMatchObject({ weight: 10, count: 10 });
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

  // three brackets at the rosettes +2.22 m, each with a standard on its tip
  const withBrackets = (p: TestPart[]) => {
    p.push({ art: 'UCM', rot: 'x', t: [4, -0.015, 2.22] }, { art: 'UVR', rot: 'y', t: [4.5 + 0.08, -0.08, 2.34] });
    p.push({ art: 'UCM', rot: 'x', t: [4, 2 - 0.015, 2.22] }, { art: 'UVR', rot: 'y', t: [4.5 + 0.08, 2 - 0.08, 2.34] });
    p.push({ art: 'UCM', rot: 'nx', t: [0, 0.015, 2.22] }, { art: 'UVR', rot: 'y', t: [-0.5 + 0.08, -0.08, 2.34] });
  };

  it('a moved bracket takes the standard on its tip with it', () => {
    const base = analyzeScaffold(tower(withBrackets), { tol: 0 });
    let kb = -1;
    const s = analyzeScaffold(
      tower((p) => {
        withBrackets(p);
        kb = p.findIndex((x) => x.art === 'UCM');
        // bracket and its standard drawn 2.5 cm beside the rosette
        shift(p[kb], [0.015, 0.02, -0.01]);
        shift(p[kb + 1], [0.015, 0.02, -0.01]);
      }),
    );
    expect(s.moves.map((m) => m.reason).sort()).toEqual(['end', 'follow']);
    for (const k of [kb, kb + 1]) pos(s, k).forEach((v, i) => expect(v).toBeCloseTo(pos(base, k)[i], 6));
    expect(s.issues.map((i) => i.key)).not.toContain('healCheck');
  });

  it('too many parts would have to follow: nothing is moved, the group is reported', () => {
    let kb = -1;
    const edit = (p: TestPart[]) => {
      withBrackets(p);
      kb = p.findIndex((x) => x.art === 'UCM');
      shift(p[kb], [0.015, 0.02, -0.01]);
      shift(p[kb + 1], [0.015, 0.02, -0.01]);
    };
    const raw = analyzeScaffold(tower(edit), { tol: 0 });
    const s = analyzeScaffold(tower(edit), { tol: 0.05, maxFollow: 0 });
    expect(s.moves).toHaveLength(0);
    const c = s.issues.find((i) => i.key === 'healCheck')!;
    expect(c.severity).toBe('warning');
    expect(c.parts).toHaveLength(2);
    expect(c.params).toMatchObject({ name: 'UCM 50 mit Zapfen', n: 1 });
    for (const k of [kb, kb + 1]) pos(s, k).forEach((v, i) => expect(v).toBeCloseTo(pos(raw, k)[i], 9));
  });

  it('tolerance 0 switches the snapping off', () => {
    const s = analyzeScaffold(tower((p) => shift(p.find((x) => x.art === 'UVR')!, [0.02, 0, 0])), { tol: 0 });
    expect(s.moves).toHaveLength(0);
  });
});
