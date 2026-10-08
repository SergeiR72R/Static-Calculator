/**
 * Unit systems. Internally everything is SI; conversion only happens at input and output,
 * therefore switching the unit system never changes stored values (no drift).
 */
export type UnitSystem = 'metric' | 'imperial';

export type Quantity =
  | 'length'
  | 'force'
  | 'moment'
  | 'lineLoad'
  | 'sectionDim'
  | 'stress'
  | 'modulus'
  | 'area'
  | 'inertia'
  | 'sectionModulus'
  | 'deflection'
  | 'density'
  | 'springTrans'
  | 'springRot'
  | 'angle'
  | 'rotation'
  | 'massPerLength'
  | 'factor';

export interface UnitDef {
  symbol: string;
  /** SI value = display value × factor */
  factor: number;
}

const FT = 0.3048;
const IN = 0.0254;
const KIP = 4448.2216152605;
const LB = 0.45359237;
const KSI = 6894757.293168361;

export const UNITS: Record<UnitSystem, Record<Quantity, UnitDef>> = {
  metric: {
    length: { symbol: 'm', factor: 1 },
    force: { symbol: 'kN', factor: 1e3 },
    moment: { symbol: 'kN·m', factor: 1e3 },
    lineLoad: { symbol: 'kN/m', factor: 1e3 },
    sectionDim: { symbol: 'mm', factor: 1e-3 },
    stress: { symbol: 'MPa', factor: 1e6 },
    modulus: { symbol: 'MPa', factor: 1e6 },
    area: { symbol: 'cm²', factor: 1e-4 },
    inertia: { symbol: 'cm⁴', factor: 1e-8 },
    sectionModulus: { symbol: 'cm³', factor: 1e-6 },
    deflection: { symbol: 'mm', factor: 1e-3 },
    density: { symbol: 'kg/m³', factor: 1 },
    springTrans: { symbol: 'kN/m', factor: 1e3 },
    springRot: { symbol: 'kN·m/rad', factor: 1e3 },
    angle: { symbol: '°', factor: 1 },
    rotation: { symbol: 'mrad', factor: 1e-3 },
    massPerLength: { symbol: 'kg/m', factor: 1 },
    factor: { symbol: '', factor: 1 },
  },
  imperial: {
    length: { symbol: 'ft', factor: FT },
    force: { symbol: 'kip', factor: KIP },
    moment: { symbol: 'kip·ft', factor: KIP * FT },
    lineLoad: { symbol: 'kip/ft', factor: KIP / FT },
    sectionDim: { symbol: 'in', factor: IN },
    stress: { symbol: 'ksi', factor: KSI },
    modulus: { symbol: 'ksi', factor: KSI },
    area: { symbol: 'in²', factor: IN ** 2 },
    inertia: { symbol: 'in⁴', factor: IN ** 4 },
    sectionModulus: { symbol: 'in³', factor: IN ** 3 },
    deflection: { symbol: 'in', factor: IN },
    density: { symbol: 'lb/ft³', factor: LB / FT ** 3 },
    springTrans: { symbol: 'kip/in', factor: KIP / IN },
    springRot: { symbol: 'kip·ft/rad', factor: KIP * FT },
    angle: { symbol: '°', factor: 1 },
    rotation: { symbol: 'mrad', factor: 1e-3 },
    massPerLength: { symbol: 'lb/ft', factor: LB / FT },
    factor: { symbol: '', factor: 1 },
  },
};

export function toSI(v: number, q: Quantity, sys: UnitSystem): number {
  return v * UNITS[sys][q].factor;
}

export function fromSI(v: number, q: Quantity, sys: UnitSystem): number {
  return v / UNITS[sys][q].factor;
}

export function unitSymbol(q: Quantity, sys: UnitSystem): string {
  return UNITS[sys][q].symbol;
}

/** Default snapping step for dragging in the schematic, SI (m) */
export function defaultSnap(sys: UnitSystem): number {
  return sys === 'metric' ? 0.05 : FT / 4;
}
