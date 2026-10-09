/**
 * Data model of the beam calculator. All values are SI units (N, m, Pa, rad, kg).
 *
 * Sign conventions (shown in the UI as well):
 *  - x to the right, z (deflection) downwards positive (DIN convention)
 *  - force angle measured from +x clockwise, 90° = vertically downwards
 *  - distributed transverse load q > 0 acts downwards (+z), axial load p > 0 acts in +x
 *  - concentrated moment M > 0 and rotation θ = dw/dx > 0 are clockwise
 *  - internal forces: N > 0 tension, V > 0 acts in +z on the positive cut face,
 *    M > 0 sagging (tension at the bottom fibre)
 */

export type Id = string;

export type SupportType = 'fixed' | 'pinned' | 'roller' | 'slider' | 'spring';

export interface Support {
  id: Id;
  type: SupportType;
  x: number;
  /** spring stiffnesses (only used for type 'spring'); 0 = no spring. N/m, N/m, N·m/rad */
  ku: number;
  kw: number;
  kt: number;
  /** prescribed displacements (settlements) for restrained DOFs. m, m, rad */
  du: number;
  dw: number;
  dt: number;
  /** load case the settlement belongs to */
  settlementCase: Id;
}

export interface Hinge {
  id: Id;
  x: number;
}

export interface PointLoad {
  id: Id;
  kind: 'point';
  caseId: Id;
  x: number;
  /** magnitude in N */
  P: number;
  /** angle in degrees measured clockwise from +x (90 = downwards) */
  angle: number;
}

export interface MomentLoad {
  id: Id;
  kind: 'moment';
  caseId: Id;
  x: number;
  /** N·m, clockwise positive */
  M: number;
  /** side of a hinge the moment acts on (only relevant at a hinge) */
  hingeSide: 'left' | 'right';
}

export interface DistributedLoad {
  id: Id;
  kind: 'dist';
  caseId: Id;
  /** 'z' = transverse (positive downwards), 'x' = axial (positive in +x) */
  dir: 'z' | 'x';
  x1: number;
  x2: number;
  /** N/m at x1 and x2 */
  q1: number;
  q2: number;
}

export type Load = PointLoad | MomentLoad | DistributedLoad;

export type MaterialPreset = 'S235' | 'S355' | 'AW6060' | 'C24' | 'custom';

export interface Material {
  preset: MaterialPreset;
  /** Young's modulus, Pa */
  E: number;
  /** shear modulus, Pa */
  G: number;
  /** density, kg/m³ */
  rho: number;
  /** characteristic strength (f_y, f_0, f_m,k), Pa */
  fk: number;
  /** characteristic shear strength, Pa */
  fvk: number;
  /** partial factor γ_M */
  gammaM: number;
  /** modification factor k_mod (timber), 1 otherwise */
  kmod: number;
}

export type CatalogFamily = 'IPE' | 'HEA' | 'HEB' | 'HEM' | 'UPE' | 'UPN' | 'SHS' | 'RHS' | 'CHS';

/** PERI system components (see sections/peri.ts) */
export type PeriProductId = 'GT24' | 'VT20K' | 'SRU120' | 'RCS';

export type SectionDef =
  | { kind: 'catalog'; family: CatalogFamily; name: string }
  | { kind: 'peri'; product: PeriProductId }
  | { kind: 'rect'; b: number; h: number }
  | { kind: 'circle'; D: number }
  | { kind: 'tube'; D: number; t: number }
  | { kind: 'box'; b: number; h: number; t: number }
  | { kind: 'weldedI'; h: number; b: number; tw: number; tf: number }
  | { kind: 'tee'; h: number; b: number; tw: number; tf: number }
  | { kind: 'channel'; h: number; b: number; tw: number; tf: number }
  | {
      kind: 'manual';
      A: number;
      I: number;
      /** elastic section moduli; 0 = unknown */
      Wtop: number;
      Wbot: number;
      /** shear area, 0 = A */
      As: number;
    };

export type SectionKind = SectionDef['kind'];

export interface Segment {
  id: Id;
  x1: number;
  x2: number;
  material: Material;
  section: SectionDef;
}

export type LoadCategory = 'G' | 'Q' | 'S' | 'W' | 'custom';

export interface LoadCase {
  id: Id;
  /** user name; empty → localized default from category */
  name: string;
  category: LoadCategory;
}

export interface Combination {
  id: Id;
  /** user name; empty → generated from factors */
  name: string;
  type: 'ULS' | 'SLS';
  factors: Record<Id, number>;
  /** part of the envelope */
  inEnvelope: boolean;
}

export interface AnalysisSettings {
  theory: 'euler' | 'timoshenko';
  selfWeight: boolean;
  patternLoading: boolean;
  /** deflection limit L/x for spans */
  deflLimitSpan: number;
  /** deflection limit L/x for cantilevers */
  deflLimitCantilever: number;
  shearCheck: boolean;
}

export interface BeamModel {
  schema: number;
  name: string;
  /** engineer / author (optional) */
  author?: string;
  /** project description (optional) */
  description?: string;
  /** ISO timestamp of creation (optional) */
  createdAt?: string;
  L: number;
  segments: Segment[];
  supports: Support[];
  hinges: Hinge[];
  loads: Load[];
  loadCases: LoadCase[];
  combinations: Combination[];
  settings: AnalysisSettings;
}

export const MODEL_SCHEMA_VERSION = 1;

/** Validation / diagnostic message, localized via key + params */
export interface Issue {
  /** model path, e.g. "loads.l3.x1" (empty for global) */
  path: string;
  key: string;
  params?: Record<string, string | number>;
  severity: 'error' | 'warning';
}

export const G_ACC = 9.81;
/** merge tolerance for characteristic points, m */
export const X_TOL = 1e-9;
