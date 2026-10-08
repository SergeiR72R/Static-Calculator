import type { Material, MaterialPreset } from '../core/types';

const MPa = 1e6;
/** f_v,k = f_y/√3, rounded to 0.01 MPa */
const fv = (fyMPa: number) => (Math.round((fyMPa / Math.sqrt(3)) * 100) / 100) * MPa;

/** Material presets (express check only, not a code check). */
export const MATERIAL_PRESETS: Record<Exclude<MaterialPreset, 'custom'>, Material> = {
  S235: { preset: 'S235', E: 210000 * MPa, G: 81000 * MPa, rho: 7850, fk: 235 * MPa, fvk: fv(235), gammaM: 1.0, kmod: 1 },
  S355: { preset: 'S355', E: 210000 * MPa, G: 81000 * MPa, rho: 7850, fk: 355 * MPa, fvk: fv(355), gammaM: 1.0, kmod: 1 },
  AW6060: { preset: 'AW6060', E: 70000 * MPa, G: 27000 * MPa, rho: 2700, fk: 140 * MPa, fvk: fv(140), gammaM: 1.1, kmod: 1 },
  C24: { preset: 'C24', E: 11000 * MPa, G: 690 * MPa, rho: 420, fk: 24 * MPa, fvk: 4.0 * MPa, gammaM: 1.3, kmod: 0.8 },
};

export const MATERIAL_ORDER: MaterialPreset[] = ['S235', 'S355', 'AW6060', 'C24', 'custom'];

export function materialPreset(p: MaterialPreset): Material {
  if (p === 'custom') return { ...MATERIAL_PRESETS.S235, preset: 'custom' };
  return { ...MATERIAL_PRESETS[p] };
}

/** design strength f_d = k_mod · f_k / γ_M */
export function designStrength(m: Material): number {
  return (m.kmod * m.fk) / m.gammaM;
}

/** design shear strength f_v,d = k_mod · f_v,k / γ_M */
export function designShearStrength(m: Material): number {
  return (m.kmod * m.fvk) / m.gammaM;
}

export function isTimber(m: Material): boolean {
  return m.preset === 'C24';
}
