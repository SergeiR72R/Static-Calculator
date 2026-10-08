// Test fixtures only (not used by the application): template systems with sample loads.
import type { BeamModel, Load } from './types';
import { pointLoad, templateModel, udl, type TemplateId } from './defaults';

const SAMPLE_LOADS: Record<TemplateId, () => Load[]> = {
  cantilever: () => [udl('G', 0, 3, 2), pointLoad('Q', 3, 10)],
  simple: () => [udl('G', 0, 6, 5), udl('Q', 0, 6, 3)],
  twoSpan: () => [udl('G', 0, 10, 5), udl('Q', 0, 10, 4)],
  threeSpan: () => [udl('G', 0, 15, 5), udl('Q', 0, 15, 4)],
  gerber: () => [udl('G', 0, 14, 5), udl('Q', 0, 14, 3), pointLoad('Q', 10.5, 15)],
  elastic: () => [udl('G', 0, 8, 5), udl('Q', 2, 6, 10)],
};

export function exampleModel(id: TemplateId): BeamModel {
  const m = templateModel(id);
  m.loads = SAMPLE_LOADS[id]();
  return m;
}
