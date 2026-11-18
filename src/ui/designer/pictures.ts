/**
 * Pictures of the PERI UP parts (drawings of the PERI catalogue, given by the user), inlined into the
 * page. Standards by their length and series (the "-2" parts look the same), ledgers by UH / UHV,
 * diagonals, base jacks and brackets UCM one picture each.
 */
import type { CatalogPart } from '../../designer/catalog';
import uvr50 from './pictures/uvr50.png?inline';
import uvr100 from './pictures/uvr100.png?inline';
import uvr150 from './pictures/uvr150.png?inline';
import uvr200 from './pictures/uvr200.png?inline';
import uvr300 from './pictures/uvr300.png?inline';
import uvh50 from './pictures/uvh50.png?inline';
import uvh100 from './pictures/uvh100.png?inline';
import uvh150 from './pictures/uvh150.png?inline';
import uvh200 from './pictures/uvh200.png?inline';
import uvh250 from './pictures/uvh250.png?inline';
import ubk from './pictures/ubk.png?inline';
import uh from './pictures/uh.png?inline';
import uhv from './pictures/uhv.png?inline';
import ujb from './pictures/ujb.png?inline';
import ucm from './pictures/ucm.png?inline';
import ucb from './pictures/ucb.png?inline';

const UVR: [number, string][] = [
  [0.5, uvr50],
  [1, uvr100],
  [1.5, uvr150],
  [2, uvr200],
  [3, uvr300],
];
const UVH: [number, string][] = [
  [0.5, uvh50],
  [1, uvh100],
  [1.5, uvh150],
  [2, uvh200],
  [2.5, uvh250],
];

/** picture of a standard: the nearest length of its series */
const nearest = (rows: [number, string][], L: number) => rows.reduce((a, b) => (Math.abs(b[0] - L) < Math.abs(a[0] - L) ? b : a))[1];

/** the picture of a catalogue part, or undefined (then it is drawn) */
export function partPicture(p: CatalogPart): string | undefined {
  switch (p.kind) {
    case 'standard':
      return nearest(p.spigot ? UVR : UVH, p.L);
    case 'jack':
      return ujb;
    case 'ledger':
      return /UHV/.test(p.name) ? uhv : uh;
    case 'diagonal':
      return ubk;
    case 'bracket':
      return p.L < 0.4 ? ucb : ucm;
    default:
      return undefined;
  }
}
