/** Minimal single-byte encoders for the DXF code pages ANSI_1252 (Western) and ANSI_1251 (Cyrillic). */

const CP1252_HIGH: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

const CP1251_DECODE_80_BF = [
  0x0402, 0x0403, 0x201a, 0x0453, 0x201e, 0x2026, 0x2020, 0x2021, 0x20ac, 0x2030, 0x0409, 0x2039, 0x040a, 0x040c, 0x040b, 0x040f,
  0x0452, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, -1, 0x2122, 0x0459, 0x203a, 0x045a, 0x045c, 0x045b, 0x045f,
  0x00a0, 0x040e, 0x045e, 0x0408, 0x00a4, 0x0490, 0x00a6, 0x00a7, 0x0401, 0x00a9, 0x0404, 0x00ab, 0x00ac, 0x00ad, 0x00ae, 0x0407,
  0x00b0, 0x00b1, 0x0406, 0x0456, 0x0491, 0x00b5, 0x00b6, 0x00b7, 0x0451, 0x2116, 0x0454, 0x00bb, 0x0458, 0x0405, 0x0455, 0x0457,
];
const CP1251_HIGH: Record<number, number> = {};
CP1251_DECODE_80_BF.forEach((cp, i) => {
  if (cp >= 0) CP1251_HIGH[cp] = 0x80 + i;
});
for (let i = 0; i < 64; i++) CP1251_HIGH[0x0410 + i] = 0xc0 + i;

export type DxfCodepage = 'ANSI_1252' | 'ANSI_1251';

function byteOf(cp: number, page: DxfCodepage): number | undefined {
  if (cp < 0x80) return cp;
  if (page === 'ANSI_1252') {
    if (cp >= 0xa0 && cp <= 0xff) return cp;
    return CP1252_HIGH[cp];
  }
  return CP1251_HIGH[cp];
}

/** Replace characters that are not representable in the code page by the DXF escape \U+XXXX */
export function escapeForCodepage(s: string, page: DxfCodepage): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (byteOf(cp, page) !== undefined) out += ch;
    else out += `\\U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return out;
}

/** Encode a string that only contains representable characters (see escapeForCodepage) */
export function encodeCodepage(s: string, page: DxfCodepage): Uint8Array {
  const bytes: number[] = [];
  for (const ch of s) {
    const b = byteOf(ch.codePointAt(0)!, page);
    bytes.push(b ?? 0x3f);
  }
  return Uint8Array.from(bytes);
}

/** Decoder (tests) */
export function decodeCodepage(bytes: Uint8Array, page: DxfCodepage): string {
  const rev = new Map<number, number>();
  if (page === 'ANSI_1252') for (const [cp, b] of Object.entries(CP1252_HIGH)) rev.set(b, Number(cp));
  else for (const [cp, b] of Object.entries(CP1251_HIGH)) rev.set(b, Number(cp));
  let s = '';
  for (const b of bytes) {
    if (b < 0x80) s += String.fromCharCode(b);
    else if (page === 'ANSI_1252' && b >= 0xa0) s += String.fromCharCode(b);
    else s += String.fromCodePoint(rev.get(b) ?? 0x3f);
  }
  return s;
}
