import catalogJson from './catalog.json';
import type { CatalogFamily } from '../core/types';

/** Raw catalog entry (table units: mm, cm², cm⁴, cm³, kg/m) */
export interface CatalogEntry {
  name: string;
  shape: 'I' | 'U' | 'box' | 'tube';
  h: number;
  b: number;
  tw?: number;
  tf?: number;
  t?: number;
  D?: number;
  r?: number;
  A: number;
  Iy: number;
  Wy: number;
  Sy: number;
  Avz: number;
  G: number;
}

export const CATALOG = catalogJson as Record<CatalogFamily, CatalogEntry[]>;

export const CATALOG_FAMILIES: CatalogFamily[] = ['IPE', 'HEA', 'HEB', 'HEM', 'UPE', 'UPN', 'SHS', 'RHS', 'CHS'];

export function findCatalogEntry(family: CatalogFamily, name: string): CatalogEntry | undefined {
  return CATALOG[family]?.find((e) => e.name === name);
}
