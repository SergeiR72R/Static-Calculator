// Generates src/sections/catalog.json from nominal dimensions.
// Rolled I and parallel-flange channel properties follow the usual table formulas
// (root radius fillets included); UPN (tapered flanges) uses tabulated values (DIN 1026-1).
// Hollow sections: EN 10219 cold-formed corner radii (SHS/RHS), EN 10210/10219 CHS.
// Units in the JSON: mm, cm², cm⁴, cm³, kg/m.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PI = Math.PI;
const round = (v, d = 4) => Number(v.toPrecision(d + 1));

// --- rolled I sections (IPE, HEA, HEB, HEM): [name, h, b, tw, tf, r]
const IPE = [
  [80, 80, 46, 3.8, 5.2, 5], [100, 100, 55, 4.1, 5.7, 7], [120, 120, 64, 4.4, 6.3, 7],
  [140, 140, 73, 4.7, 6.9, 7], [160, 160, 82, 5.0, 7.4, 9], [180, 180, 91, 5.3, 8.0, 9],
  [200, 200, 100, 5.6, 8.5, 12], [220, 220, 110, 5.9, 9.2, 12], [240, 240, 120, 6.2, 9.8, 15],
  [270, 270, 135, 6.6, 10.2, 15], [300, 300, 150, 7.1, 10.7, 15], [330, 330, 160, 7.5, 11.5, 18],
  [360, 360, 170, 8.0, 12.7, 18], [400, 400, 180, 8.6, 13.5, 21], [450, 450, 190, 9.4, 14.6, 21],
  [500, 500, 200, 10.2, 16.0, 21], [550, 550, 210, 11.1, 17.2, 24], [600, 600, 220, 12.0, 19.0, 24],
];
const HEA = [
  [100, 96, 100, 5, 8, 12], [120, 114, 120, 5, 8, 12], [140, 133, 140, 5.5, 8.5, 12],
  [160, 152, 160, 6, 9, 15], [180, 171, 180, 6, 9.5, 15], [200, 190, 200, 6.5, 10, 18],
  [220, 210, 220, 7, 11, 18], [240, 230, 240, 7.5, 12, 21], [260, 250, 260, 7.5, 12.5, 24],
  [280, 270, 280, 8, 13, 24], [300, 290, 300, 8.5, 14, 27], [320, 310, 300, 9, 15.5, 27],
  [340, 330, 300, 9.5, 16.5, 27], [360, 350, 300, 10, 17.5, 27], [400, 390, 300, 11, 19, 27],
  [450, 440, 300, 11.5, 21, 27], [500, 490, 300, 12, 23, 27], [550, 540, 300, 12.5, 24, 27],
  [600, 590, 300, 13, 25, 27], [650, 640, 300, 13.5, 26, 27], [700, 690, 300, 14.5, 27, 27],
  [800, 790, 300, 15, 28, 30], [900, 890, 300, 16, 30, 30], [1000, 990, 300, 16.5, 31, 30],
];
const HEB = [
  [100, 100, 100, 6, 10, 12], [120, 120, 120, 6.5, 11, 12], [140, 140, 140, 7, 12, 12],
  [160, 160, 160, 8, 13, 15], [180, 180, 180, 8.5, 14, 15], [200, 200, 200, 9, 15, 18],
  [220, 220, 220, 9.5, 16, 18], [240, 240, 240, 10, 17, 21], [260, 260, 260, 10, 17.5, 24],
  [280, 280, 280, 10.5, 18, 24], [300, 300, 300, 11, 19, 27], [320, 320, 300, 11.5, 20.5, 27],
  [340, 340, 300, 12, 21.5, 27], [360, 360, 300, 12.5, 22.5, 27], [400, 400, 300, 13.5, 24, 27],
  [450, 450, 300, 14, 26, 27], [500, 500, 300, 14.5, 28, 27], [550, 550, 300, 15, 29, 27],
  [600, 600, 300, 15.5, 30, 27], [650, 650, 300, 16, 31, 27], [700, 700, 300, 17, 32, 27],
  [800, 800, 300, 17.5, 33, 30], [900, 900, 300, 18.5, 35, 30], [1000, 1000, 300, 19, 36, 30],
];
const HEM = [
  [100, 120, 106, 12, 20, 12], [120, 140, 126, 12.5, 21, 12], [140, 160, 146, 13, 22, 12],
  [160, 180, 166, 14, 23, 15], [180, 200, 186, 14.5, 24, 15], [200, 220, 206, 15, 25, 18],
  [220, 240, 226, 15.5, 26, 18], [240, 270, 248, 18, 32, 21], [260, 290, 268, 18, 32.5, 24],
  [280, 310, 288, 18.5, 33, 24], [300, 340, 310, 21, 39, 27], [320, 359, 309, 21, 40, 27],
  [340, 377, 309, 21, 40, 27], [360, 395, 308, 21, 40, 27], [400, 432, 307, 21, 40, 27],
  [450, 478, 307, 21, 40, 27], [500, 524, 306, 21, 40, 27], [550, 572, 306, 21, 40, 27],
  [600, 620, 305, 21, 40, 27], [650, 668, 305, 21, 40, 27], [700, 716, 304, 21, 40, 27],
  [800, 814, 303, 21, 40, 30], [900, 910, 302, 21, 40, 30], [1000, 1008, 302, 21, 40, 30],
];
// --- UPE (parallel flanges): [name, h, b, tw, tf, r]
const UPE = [
  [80, 80, 50, 4.0, 7.0, 10], [100, 100, 55, 4.5, 7.5, 10], [120, 120, 60, 5.0, 8.0, 12],
  [140, 140, 65, 5.0, 9.0, 12], [160, 160, 70, 5.5, 9.5, 12], [180, 180, 75, 5.5, 10.5, 12],
  [200, 200, 80, 6.0, 11.0, 13], [220, 220, 85, 6.5, 12.0, 13], [240, 240, 90, 7.0, 12.5, 15],
  [270, 270, 95, 7.5, 13.5, 15], [300, 300, 100, 9.5, 15.0, 15], [330, 330, 105, 11.0, 16.0, 18],
  [360, 360, 110, 12.0, 17.0, 18], [400, 400, 115, 13.5, 18.0, 18],
];
// --- UPN (tapered flanges, tabulated): [name, h, b, tw, tf(mean), r1, A cm², Iy cm⁴, Wy cm³]
const UPN = [
  [80, 80, 45, 6, 8, 8, 11.0, 106, 26.5], [100, 100, 50, 6, 8.5, 8.5, 13.5, 206, 41.2],
  [120, 120, 55, 7, 9, 9, 17.0, 364, 60.7], [140, 140, 60, 7, 10, 10, 20.4, 605, 86.4],
  [160, 160, 65, 7.5, 10.5, 10.5, 24.0, 925, 116], [180, 180, 70, 8, 11, 11, 28.0, 1350, 150],
  [200, 200, 75, 8.5, 11.5, 11.5, 32.2, 1910, 191], [220, 220, 80, 9, 12.5, 12.5, 37.4, 2690, 245],
  [240, 240, 85, 9.5, 13, 13, 42.3, 3600, 300], [260, 260, 90, 10, 14, 14, 48.3, 4820, 371],
  [280, 280, 95, 10, 15, 15, 53.3, 6280, 448], [300, 300, 100, 10, 16, 16, 58.8, 8030, 535],
  [320, 320, 100, 14, 17.5, 17.5, 75.8, 10870, 679], [350, 350, 100, 14, 16, 16, 77.3, 12840, 734],
  [380, 380, 102, 13.5, 16, 16, 80.4, 15760, 829], [400, 400, 110, 14, 18, 18, 91.5, 20350, 1020],
];
const SHS = [
  [40, 3], [40, 4], [50, 3], [50, 4], [50, 5], [60, 3], [60, 4], [60, 5], [70, 4], [70, 5],
  [80, 4], [80, 5], [80, 6], [90, 5], [100, 4], [100, 5], [100, 6], [100, 8], [120, 5], [120, 6],
  [120, 8], [140, 5], [140, 6], [140, 8], [150, 6], [150, 8], [150, 10], [160, 6], [160, 8],
  [180, 8], [180, 10], [200, 6], [200, 8], [200, 10], [250, 8], [250, 10], [300, 10], [300, 12.5],
];
// RHS: [h, b, t] — h is the height (strong axis bending)
const RHS = [
  [60, 40, 3], [60, 40, 4], [80, 40, 3], [80, 40, 4], [100, 50, 4], [100, 50, 5], [100, 60, 4],
  [120, 60, 4], [120, 60, 5], [120, 80, 5], [140, 80, 5], [150, 100, 5], [150, 100, 6],
  [160, 80, 5], [180, 100, 6], [200, 100, 6], [200, 100, 8], [200, 120, 8], [250, 150, 8],
  [300, 200, 10],
];
const CHS = [
  [33.7, 3.2], [42.4, 3.2], [48.3, 3.2], [48.3, 4], [60.3, 3.2], [60.3, 4], [76.1, 3.2],
  [76.1, 4], [88.9, 4], [88.9, 5], [101.6, 4], [114.3, 4], [114.3, 5], [139.7, 5], [168.3, 5],
  [168.3, 6.3], [193.7, 6.3], [219.1, 6.3], [219.1, 8], [244.5, 8], [273, 8], [323.9, 8],
  [323.9, 10],
];

const FILLET_A = 1 - PI / 4; // area factor of a fillet r²
const FILLET_E = (10 - 3 * PI) / (12 - 3 * PI); // fillet centroid distance / r

function filletOwnI(r) {
  // second moment of area of a fillet (spandrel) about its own centroidal axis
  const Iqc = (PI * r ** 4) / 16 - ((PI * r * r) / 4) * ((4 * r) / (3 * PI)) ** 2;
  const IqcEdge = Iqc + ((PI * r * r) / 4) * (r - (4 * r) / (3 * PI)) ** 2;
  const Iedge = r ** 4 / 3 - IqcEdge;
  const e = FILLET_E * r;
  return Iedge - FILLET_A * r * r * e * e;
}

/** I or channel section with nFil fillets per flange-web junction pair (I: 4 total, channel: 2 total) */
function flanged(h, b, tw, tf, r, nFillets) {
  const hw = h - 2 * tf;
  const Af = FILLET_A * r * r;
  const A = 2 * b * tf + hw * tw + nFillets * Af;
  const d = hw / 2 - FILLET_E * r;
  const I = (b * h ** 3 - (b - tw) * hw ** 3) / 12 + nFillets * (filletOwnI(r) + Af * d * d);
  const S = (b * tf * (h - tf)) / 2 + (tw * (hw / 2) ** 2) / 2 + (nFillets / 2) * Af * d;
  const Av = nFillets === 4 ? A - 2 * b * tf + (tw + 2 * r) * tf : A - 2 * b * tf + (tw + r) * tf;
  return { A, I, W: I / (h / 2), S, Av };
}

function roundedRect(B, H, r) {
  const Af = FILLET_A * r * r;
  const d = H / 2 - FILLET_E * r;
  return { A: B * H - 4 * Af, I: (B * H ** 3) / 12 - 4 * (filletOwnI(r) + Af * d * d) };
}

function hollowRect(h, b, t) {
  const ro = t <= 6 ? 2 * t : t <= 10 ? 2.5 * t : 3 * t;
  const ri = ro - t;
  const o = roundedRect(b, h, ro);
  const i = roundedRect(b - 2 * t, h - 2 * t, ri);
  const A = o.A - i.A;
  const I = o.I - i.I;
  const S = (b * h * h) / 8 - ((b - 2 * t) * (h - 2 * t) ** 2) / 8;
  return { A, I, W: I / (h / 2), S, Av: (A * h) / (b + h), ro };
}

const mm2cm2 = (v) => v / 100;
const mm4cm4 = (v) => v / 1e4;
const mm3cm3 = (v) => v / 1e3;
const massOf = (Acm2) => Acm2 * 0.785; // ρ = 7850 kg/m³

function entry(name, shape, dims, p) {
  const A = mm2cm2(p.A);
  return {
    name,
    shape,
    ...dims,
    A: round(A),
    Iy: round(mm4cm4(p.I)),
    Wy: round(mm3cm3(p.W)),
    Sy: round(mm3cm3(p.S)),
    Avz: round(mm2cm2(p.Av)),
    G: round(massOf(A), 3),
  };
}

const out = {};
for (const [fam, rows] of [['IPE', IPE], ['HEA', HEA], ['HEB', HEB], ['HEM', HEM]]) {
  out[fam] = rows.map(([n, h, b, tw, tf, r]) =>
    entry(`${fam} ${n}`, 'I', { h, b, tw, tf, r }, flanged(h, b, tw, tf, r, 4)),
  );
}
out.UPE = UPE.map(([n, h, b, tw, tf, r]) =>
  entry(`UPE ${n}`, 'U', { h, b, tw, tf, r }, flanged(h, b, tw, tf, r, 2)),
);
out.UPN = UPN.map(([n, h, b, tw, tf, r, A, Iy, Wy]) => {
  const approx = flanged(h, b, tw, tf, r, 2);
  return {
    name: `UPN ${n}`,
    shape: 'U',
    h, b, tw, tf, r,
    A, Iy, Wy,
    Sy: round(mm3cm3(approx.S)),
    Avz: round(mm2cm2(approx.Av)),
    G: round(massOf(A), 3),
  };
});
out.SHS = SHS.map(([b, t]) => {
  const p = hollowRect(b, b, t);
  return entry(`SHS ${b}x${b}x${t}`, 'box', { h: b, b, t, r: p.ro }, p);
});
out.RHS = RHS.map(([h, b, t]) => {
  const p = hollowRect(h, b, t);
  return entry(`RHS ${h}x${b}x${t}`, 'box', { h, b, t, r: p.ro }, p);
});
out.CHS = CHS.map(([D, t]) => {
  const d = D - 2 * t;
  const A = (PI * (D * D - d * d)) / 4;
  const I = (PI * (D ** 4 - d ** 4)) / 64;
  return entry(`CHS ${D}x${t}`, 'tube', { h: D, b: D, D, t }, {
    A, I, W: I / (D / 2), S: (D ** 3 - d ** 3) / 12, Av: (2 * A) / PI,
  });
});

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'sections', 'catalog.json');
writeFileSync(target, JSON.stringify(out, null, 1) + '\n');
console.log(`written ${target}`);
