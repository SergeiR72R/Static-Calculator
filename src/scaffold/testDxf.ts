/**
 * Test helper: writes a DXF in the structure of PERI CAD (custom part entities, part types in
 * OBJECTS, "Line" display blocks). Geometry of the system lines as in the PERI CAD part library.
 */
import type { V3 } from './pericad';

interface Art {
  article: string;
  name: string;
  desc: string;
  layer: string;
  lines: [V3, V3][];
  circles?: V3[];
  rosettes?: V3[];
}

const ROS = (z: number): V3 => [0.08, 0.08, z];

export const ARTS: Record<string, Art> = {
  UVB: { article: '100014', name: 'UVB 24', desc: 'Basisstiel UVB 24', layer: 'PERI_UP_UVB', lines: [[[0.08, 0.08, 0.24], [0.08, 0.08, 0]]], circles: [[0.08, 0.08, 0.12]] },
  UVR: { article: '100009', name: 'UVR 200', desc: 'Vertikalstiel UVR 200', layer: 'PERI_UP_UVR', lines: [[[0.08, 0.08, 0], [0.08, 0.08, 2.16]]], rosettes: [ROS(0.38), ROS(0.88), ROS(1.38), ROS(1.88)] },
  UH: {
    article: '114645',
    name: 'UH 200 +',
    desc: 'Horizontalriegel UH 200 Plus',
    layer: 'PERI_UP_UH',
    lines: [
      [[0, 0.015, 0.03], [1.916, 0.015, 0.03]],
      [[0, 0.015, 0.03], [0, 0.015, -0.06]],
      [[1.916, 0.015, 0.03], [1.916, 0.015, -0.06]],
    ],
  },
  UDG: {
    article: '124109',
    name: 'Stahlbelag UDG 25x200',
    desc: 'Stahlbelag UDG 25 x 200',
    layer: 'PERI_UP_UDG',
    lines: [
      [[0, 1.95, 0.063], [0, 0, 0.063]],
      [[0, 0, 0.063], [0.245, 0, 0.063]],
      [[0.245, 0, 0.063], [0.245, 1.95, 0.063]],
      [[0.245, 1.95, 0.063], [0, 1.95, 0.063]],
    ],
  },
  END: {
    article: '124805',
    name: 'Endelement ULS 50 FLEX',
    desc: 'Endelement ULS 50 Flex',
    layer: 'PERI_ULS',
    lines: [
      [[-0.0102, 0.015, 0.4318], [-0.0102, 0.015, 0.53]],
      [[0.426858, 0.015, 0.53], [-0.0102, 0.015, 0.53]],
      [[-0.0102, 0.015, -0.0682], [-0.0102, 0.015, 0.03]],
      [[0.426858, 0.015, 0.03], [-0.0102, 0.015, 0.03]],
      [[0.331358, 0.015, 0.53], [0.331358, 0.015, 0.03]],
      [[0.081358, 0.015, 0.53], [0.081358, 0.015, 0.03]],
      [[0.133441, 0.015, 0.53], [0.279273, 0.015, 0.03]],
    ],
  },
  CONN: {
    article: '124806',
    name: 'Verbinder ULS FLEX',
    desc: 'Verbinder ULS Flex',
    layer: 'PERI_ULS',
    lines: [
      [[0.02415, 0.02415, 0], [0.02415, 0.02415, 0.71]],
      [[-0.16585, 0.02415, 0.66], [-0.00035, 0.02415, 0.66]],
      [[-0.15585, 0.02415, 0.16], [0.00965, 0.02415, 0.16]],
      [[0.20415, 0.02415, 0.16], [0.04865, 0.02415, 0.16]],
      [[0.21415, 0.02415, 0.66], [0.05865, 0.02415, 0.66]],
    ],
    rosettes: [
      [-0.02415, 0.02415, -0.125],
      [-0.02415, 0.02415, -0.625],
    ],
  },
  E150: {
    article: '124781',
    name: 'Zwischenelement ULS 150 FLEX',
    desc: 'Zwischenelement ULS 150 Flex',
    layer: 'PERI_ULS',
    lines: [
      [[0, 0.015, 0.53], [1.441, 0.015, 0.53]],
      [[0, 0.015, 0.03], [1.441, 0.015, 0.03]],
      [[0.0955, 0.015, 0.53], [0.0955, 0.015, 0.03]],
      [[1.3455, 0.015, 0.53], [1.3455, 0.015, 0.03]],
      [[0.141283, 0.015, 0.53], [0.429725, 0.015, 0.03]],
      [[0.507799, 0.015, 0.03], [0.796241, 0.015, 0.53]],
      [[0.890157, 0.015, 0.53], [1.304382, 0.015, 0.03]],
    ],
  },
  UBK: { article: '100573', name: 'UBK 200/200', desc: 'Knotendiagonale UBK 200/200', layer: '0', lines: [[[0, 0.05, 0], [1.834, 0.05, 2]]] },
  UCM: {
    article: '112676',
    name: 'UCM 50 mit Zapfen',
    desc: 'Konsole UCM 50 mit Zapfen',
    layer: 'PERI_UP_UZM',
    lines: [
      [[0.5, 0.015, -0.065], [0.5, 0.015, 0.12]],
      [[0, 0.015, 0.06], [0.5, 0.015, 0.06]],
      [[0, 0.015, 0], [0, 0.015, 0.06]],
      [[0.353, 0.015, 0.06], [0, 0.015, -0.368]],
      [[0.125, 0.015, -0.217], [0.125, 0.015, 0.06]],
    ],
  },
  // base jack UJB 50 as the display block of PERI CAD: base plate 15 × 15 cm from the origin, spindle 0.505 m
  UJB: {
    article: '100412',
    name: '100412',
    desc: '',
    layer: '0',
    lines: [
      [[0, 0, 0], [0.15, 0, 0]],
      [[0.15, 0, 0], [0.15, 0.15, 0]],
      [[0.15, 0.15, 0], [0, 0.15, 0]],
      [[0, 0.15, 0], [0, 0, 0]],
      [[0.075, 0.075, 0], [0.075, 0.075, 0.505]],
    ],
  },
  TUBE: { article: '026411', name: 'TUBE 1m', desc: 'Gerüstrohr 48,3x3,2mm 1m vz', layer: 'PERI_TUBE', lines: [[[0, 0, 0], [1, 0, 0]]] },
  TUBE2: { article: '026412', name: 'TUBE 2m', desc: 'Gerüstrohr 48,3x3,2mm 2m vz', layer: 'PERI_TUBE', lines: [[[0, 0, 0], [2, 0, 0]]] },
  RA: { article: '017020', name: 'RA 48/48', desc: 'Normalkupplung RA Ø48/48mm vz', layer: 'PERI_Coupler', lines: [], circles: [[0.076, 0.05, 0.05]] },
  UEC: { article: '113726', name: 'UEC', desc: 'Flanschkupplung UEC', layer: '0', lines: [[[0.074, 0.032, 0.113], [0.019, 0.032, 0.113]]], circles: [[-0.032, 0.032, -0.019]] },
};

/** rotation (row major 3 × 3) with the local x axis along +x, +y or −x */
const ROT = {
  x: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  y: [0, -1, 0, 1, 0, 0, 0, 0, 1],
  nx: [-1, 0, 0, 0, -1, 0, 0, 0, 1],
};

export interface TestPart {
  art: keyof typeof ARTS;
  rot: keyof typeof ROT;
  t: V3;
}

/**
 * Two bays of 2 m × one bay of 2 m, decks at +2.23 m, upper level bridged by two ULS Flex girders
 * 50 + 150 + 150 + 50 (4.00 m) at y = 0 and y = 2 carrying a deck; the middle standards end at
 * +2.50 m. Standard axes at x ∈ {0, 2, 4}, y ∈ {0, 2}.
 */
export function towerParts(): TestPart[] {
  const P: TestPart[] = [];
  const std = (ax: number, ay: number, art: 'UVB' | 'UVR', z: number) => P.push({ art, rot: 'y', t: [ax + 0.08, ay - 0.08, z] });
  for (const ax of [0, 2, 4])
    for (const ay of [0, 2]) {
      std(ax, ay, 'UVB', 0.1);
      std(ax, ay, 'UVR', 0.34);
      if (ax !== 2) std(ax, ay, 'UVR', 2.34);
    }
  const ledX = (ax: number, ay: number, z: number) => P.push({ art: 'UH', rot: 'x', t: [ax + 0.042, ay - 0.015, z] });
  const ledY = (ax: number, ay: number, z: number) => P.push({ art: 'UH', rot: 'y', t: [ax + 0.015, ay + 0.042, z] });
  for (const z of [0.22, 2.22]) {
    for (const ax of [0, 2]) for (const ay of [0, 2]) ledX(ax, ay, z);
    for (const ax of [0, 2, 4]) ledY(ax, 0, z);
  }
  ledY(0, 0, 4.22);
  ledY(4, 0, 4.22);
  // decks at +2.23 m (along x, spanning in y)
  for (let k = 0; k < 16; k++) P.push({ art: 'UDG', rot: 'x', t: [0.003 + 0.25 * k, 0.025, 2.233] });
  // ULS Flex girders
  for (const ay of [0, 2]) {
    P.push({ art: 'END', rot: 'x', t: [0.044, ay - 0.015, 3.72] });
    P.push({ art: 'END', rot: 'nx', t: [4 - 0.044, ay + 0.015, 3.72] });
    for (const c of [0.5, 2, 3.5]) P.push({ art: 'CONN', rot: 'x', t: [c - 0.02415, ay - 0.02415, 3.59] });
    for (const c of [0.5, 2]) P.push({ art: 'E150', rot: 'x', t: [c + 0.03, ay - 0.015, 3.72] });
  }
  // decks on the girders
  for (let k = 0; k < 16; k++) P.push({ art: 'UDG', rot: 'x', t: [0.003 + 0.25 * k, 0.025, 4.233] });
  return P;
}

/**
 * DXF text in the structure of PERI CAD; `scale` 1000 writes millimetres, `yUp` writes the drawing
 * with the y axis vertical (as PERI CAD drawings modelled in a rotated coordinate system).
 * `exploded`: parts of these kinds are written as older PERI CAD parts exploded in AutoCAD, i.e.
 * references of the display block "PERI_<article>_PartDisplayName_3D" (blocks in metres, scaled).
 */
export function periDxf(parts: TestPart[], scale = 1, yUp = false, exploded: (keyof typeof ARTS)[] = []): string {
  const out: string[] = [];
  const tag = (c: number, v: string | number) => out.push(String(c).padStart(3, ' '), String(v));
  let h = 0x100;
  const handle = () => (h++).toString(16).toUpperCase();
  const used = [...new Set(parts.map((p) => p.art))];
  const brHandle: Record<string, string> = {};
  const typeHandle: Record<string, string> = {};
  for (const a of used) {
    brHandle[a] = handle();
    typeHandle[a] = handle();
  }
  const blockName = (a: string) => `PERI_${ARTS[a].article}_PartDisplayName_Line`;
  tag(0, 'SECTION');
  tag(2, 'HEADER');
  tag(9, '$ACADVER');
  tag(1, 'AC1032');
  tag(9, '$INSUNITS');
  tag(70, 4);
  tag(0, 'ENDSEC');
  tag(0, 'SECTION');
  tag(2, 'TABLES');
  tag(0, 'TABLE');
  tag(2, 'BLOCK_RECORD');
  for (const a of used) {
    tag(0, 'BLOCK_RECORD');
    tag(5, brHandle[a]);
    tag(100, 'AcDbSymbolTableRecord');
    tag(100, 'AcDbBlockTableRecord');
    tag(2, blockName(a));
  }
  tag(0, 'ENDTAB');
  tag(0, 'ENDSEC');
  tag(0, 'SECTION');
  tag(2, 'BLOCKS');
  const pt = (c: number, p: V3, f = scale) => {
    tag(c, p[0] * f);
    tag(c + 10, p[1] * f);
    tag(c + 20, p[2] * f);
  };
  // rosette block
  tag(0, 'BLOCK');
  tag(5, handle());
  tag(2, '100001_Line');
  pt(10, [0, 0, 0]);
  tag(0, 'CIRCLE');
  tag(5, handle());
  pt(10, [0, 0, 0]);
  tag(40, 0.08 * scale);
  tag(0, 'ENDBLK');
  for (const a of used) {
    // display blocks of exploded parts are in metres
    const f = exploded.includes(a as keyof typeof ARTS) ? 1 : scale;
    tag(0, 'BLOCK');
    tag(5, handle());
    tag(2, blockName(a));
    pt(10, [0, 0, 0], f);
    for (const [p, q] of ARTS[a].lines) {
      tag(0, 'LINE');
      tag(5, handle());
      tag(8, '0');
      pt(10, p, f);
      pt(11, q, f);
    }
    for (const c of ARTS[a].circles ?? []) {
      tag(0, 'CIRCLE');
      tag(5, handle());
      pt(10, c, f);
      tag(40, 0.08 * f);
    }
    for (const r of ARTS[a].rosettes ?? []) {
      tag(0, 'INSERT');
      tag(5, handle());
      tag(2, '100001_Line');
      pt(10, r, f);
      if (f !== scale) for (const c of [41, 42, 43]) tag(c, f / scale);
    }
    tag(0, 'ENDBLK');
    if (f !== scale) {
      // the 3D view block the reference points to (its own geometry is not used)
      tag(0, 'BLOCK');
      tag(5, handle());
      tag(2, `PERI_${ARTS[a].article}_PartDisplayName_3D`);
      pt(10, [0, 0, 0], 1);
      tag(0, 'ENDBLK');
    }
  }
  tag(0, 'ENDSEC');
  tag(0, 'SECTION');
  tag(2, 'ENTITIES');
  for (const p of parts) {
    const R = ROT[p.rot];
    if (exploded.includes(p.art)) {
      tag(0, 'INSERT');
      tag(5, handle());
      tag(8, ARTS[p.art].layer);
      tag(2, `PERI_${ARTS[p.art].article}_PartDisplayName_3D`);
      pt(10, p.t);
      for (const c of [41, 42, 43]) tag(c, scale);
      tag(50, { x: 0, y: 90, nx: 180 }[p.rot]);
      continue;
    }
    tag(0, 'PERI_PARTS_AC_DB_CONSTRUCTED_SINGLE_PIECE');
    tag(5, handle());
    tag(330, '1F');
    tag(100, 'AcDbEntity');
    tag(8, ARTS[p.art].layer);
    tag(100, 'PERIAcDbEntity');
    tag(90, 1);
    tag(100, 'PERIAcDbAcadEntity');
    tag(90, 1);
    let m = [R[0], R[1], R[2], p.t[0] * scale, R[3], R[4], R[5], p.t[1] * scale, R[6], R[7], R[8], p.t[2] * scale, 0, 0, 0, 1];
    // y up: (x, y, z) → (x, z, −y)
    if (yUp) m = [...m.slice(0, 4), ...m.slice(8, 12), ...m.slice(4, 8).map((v) => -v), 0, 0, 0, 1];
    for (const v of m) tag(40, v);
    tag(100, 'PERIAcDbPart');
    tag(90, 1);
    tag(100, 'PERIAcDbConstructedPart');
    tag(90, 1);
    tag(340, typeHandle[p.art]);
    tag(100, 'PERIAcDbSinglePieceConstructedPart');
    tag(90, 1);
  }
  tag(0, 'ENDSEC');
  tag(0, 'SECTION');
  tag(2, 'OBJECTS');
  for (const a of used) {
    const A = ARTS[a];
    tag(0, 'PERI_PARTS_AC_DB_CONSTRUCTED_SINGLE_PIECE_INTRINSIC');
    tag(5, typeHandle[a]);
    tag(100, 'PERIAcDbIntrinsicPart');
    tag(90, 1);
    tag(1, A.article);
    tag(1, A.name);
    tag(40, 0.16);
    tag(1, A.layer);
    tag(1, A.name);
    tag(1, A.desc);
    tag(100, 'PERIAcDbSinglePieceIntrinsicPart');
    tag(90, 1);
    tag(1, 'Top');
    tag(340, '0');
    tag(1, 'Line');
    tag(340, brHandle[a]);
  }
  tag(0, 'ENDSEC');
  tag(0, 'EOF');
  return out.join('\r\n') + '\r\n';
}
