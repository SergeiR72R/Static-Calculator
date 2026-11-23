/**
 * Settings of the enclosure (tent) mode, saved in the browser. The drawing is the one of the scaffold
 * mode (PERI CAD DXF + PERIEXPORT).
 */
import { create } from 'zustand';
import { storage } from '../state/persist';
import type { ExposureDE } from '../scaffold/wind';
import { DEFAULT_CPE, type Cpe, type Friction, type SnowZone, type StandingDuration, type StandingMeasures } from './tent';

export interface TentOpts {
  /** geometry by hand (null: from the drawing), m / m² */
  L: number | null;
  B: number | null;
  hLow: number | null;
  hHigh: number | null;
  roofArea: number | null;
  /** wind: zone of Germany, exposure, height (null: high eave), standing time; q_p by hand (N/m², null: computed) */
  windZone: number;
  exposure: ExposureDE;
  z: number | null;
  duration: StandingDuration;
  measures: StandingMeasures;
  qpManual: number | null;
  /** snow: zone, altitude (m), μ1 (null: by the pitch), C_e, C_t; s by hand (N/m², null: computed) */
  snowZone: SnowZone;
  altitude: number;
  mu1: number | null;
  ce: number;
  ct: number;
  snowManual: number | null;
  /** self weight: cladding of the roof (N/m², added to the roof parts), further weight (cladding of the walls, ballast, N), G by hand */
  roofCladding: number;
  extraG: number;
  gRoofManual: number | null;
  GkManual: number | null;
  cpe: Cpe;
  friction: Friction;
  mu: number | null;
  gammaMu: number;
  /** spacing of the purlins and of the lateral restraints of the girder chords, m */
  purlin: number;
  restraint: number;
}

export const DEFAULT_TENT: TentOpts = {
  L: null,
  B: null,
  hLow: null,
  hHigh: null,
  roofArea: null,
  windZone: 1,
  exposure: 'inland',
  z: null,
  duration: '24m',
  measures: 'none',
  qpManual: null,
  snowZone: '1',
  altitude: 200,
  mu1: null,
  ce: 1,
  ct: 1,
  snowManual: null,
  roofCladding: 0,
  extraG: 0,
  gRoofManual: null,
  GkManual: null,
  cpe: DEFAULT_CPE,
  friction: 'timber',
  mu: null,
  gammaMu: 1.3,
  purlin: 2,
  restraint: 2.5,
};

const KEY = 'balken.tent';

function load(): TentOpts {
  try {
    const o = JSON.parse(storage.get(KEY) ?? 'null') as Partial<TentOpts> | null;
    if (!o || typeof o !== 'object') return DEFAULT_TENT;
    return { ...DEFAULT_TENT, ...o, cpe: { ...DEFAULT_CPE, ...(o.cpe ?? {}) } };
  } catch {
    return DEFAULT_TENT;
  }
}

interface TentState extends TentOpts {
  set: (p: Partial<TentOpts>) => void;
  reset: () => void;
}

export const useTent = create<TentState>()((set, get) => ({
  ...load(),
  set: (p) => {
    set(p);
    const { set: _s, reset: _r, ...o } = get();
    storage.trySet(KEY, JSON.stringify(o));
  },
  reset: () => {
    set(DEFAULT_TENT);
    storage.remove(KEY);
  },
}));
