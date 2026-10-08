import type { BeamModel } from '../core/types';
import type { ResultView } from '../core/results';
import type { Fmt } from './hooks';
import { caseLabel } from './inputs/Editors';
import { comboLabel } from './inputs/Panels';

export function viewLabel(fmt: Fmt, model: BeamModel, view: ResultView): string {
  if (view.type === 'envelope') return fmt.t('results.envelopeOption');
  if (view.type === 'case') return `${fmt.t('results.case')}: ${caseLabel(fmt, model, view.id)}`;
  const c = model.combinations.find((k) => k.id === view.id);
  return c ? `${fmt.t('results.combo')}: ${comboLabel(fmt, model, c)}` : '';
}
