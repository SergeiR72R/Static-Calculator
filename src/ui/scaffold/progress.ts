import { create } from 'zustand';

/**
 * Progress of a long task of the scaffold mode (opening a drawing, the analysis): phase as an i18n key
 * with its parameters, share done 0…1 (null: not known, the bar runs to and fro).
 */
export interface Progress {
  phase: string;
  params?: Record<string, string | number>;
  frac: number | null;
}

export const useProgress = create<{ load: Progress | null; calc: Progress | null; setLoad: (p: Progress | null) => void; setCalc: (p: Progress | null) => void }>((set) => ({
  load: null,
  calc: null,
  setLoad: (load) => set({ load }),
  setCalc: (calc) => set({ calc }),
}));
