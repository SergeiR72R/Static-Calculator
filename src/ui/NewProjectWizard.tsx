import { useState } from 'react';
import { Dialog } from 'radix-ui';
import type { AnalysisSettings, Material, SectionDef } from '../core/types';
import { TEMPLATE_IDS, templateModel, type TemplateId } from '../core/defaults';
import { createProject } from '../core/project';
import { sectionLabel } from '../sections/properties';
import { designStrength } from '../sections/materials';
import { serializeProject } from '../state/persist';
import { useStore } from '../state/store';
import { LANGS } from '../i18n';
import { Button, NumberField, SelectField, SwitchField, TextField, cx, downloadBlob } from './common';
import { useFmt } from './hooks';
import { IconBeamLogo, IconDownload, IconX } from './icons';
import { MaterialEditor, SectionEditor, SectionSketch } from './inputs/SectionEditor';

type Step = 'prefs' | 'project' | 'system' | 'section' | 'analysis' | 'summary';

/** Small pictogram of a template system */
function MiniSystem({ id }: { id: TemplateId }) {
  const m = templateModel(id);
  const W = 120;
  const x = (v: number) => 8 + (v / m.L) * (W - 16);
  const y = 16;
  return (
    <svg width={W} height={34} viewBox={`0 0 ${W} 34`} aria-hidden className="text-slate-700 dark:text-slate-200">
      <line x1={x(0)} x2={x(m.L)} y1={y} y2={y} stroke="currentColor" strokeWidth={2.5} />
      {m.supports.map((s) => {
        const px = x(s.x);
        if (s.type === 'fixed') return <line key={s.id} x1={px} x2={px} y1={y - 9} y2={y + 9} stroke="var(--support)" strokeWidth={3} />;
        if (s.type === 'spring')
          return <path key={s.id} d={`M${px},${y + 2}l0,2l4,2l-8,3l8,3l-4,2l0,3`} stroke="var(--support)" fill="none" strokeWidth={1.4} />;
        return (
          <path key={s.id} d={`M${px},${y + 1.5}l-5,8h10z`} fill="none" stroke="var(--support)" strokeWidth={1.4} />
        );
      })}
      {m.hinges.map((h) => (
        <circle key={h.id} cx={x(h.x)} cy={y} r={3} fill="var(--surface)" stroke="currentColor" strokeWidth={1.4} />
      ))}
    </svg>
  );
}

export function NewProjectWizard() {
  const open = useStore((s) => s.wizard.open);
  const firstRun = useStore((s) => s.wizard.firstRun);
  // unmounted while closed, so every opening starts from the user's defaults
  return open ? <WizardDialog firstRun={firstRun} /> : null;
}

function WizardDialog({ firstRun }: { firstRun: boolean }) {
  const fmt = useFmt();
  const st = useStore();
  const d = st.userDefaults;
  const steps: Step[] = firstRun ? ['prefs', 'project', 'system', 'section', 'analysis', 'summary'] : ['project', 'system', 'section', 'analysis', 'summary'];
  const [stepIdx, setStepIdx] = useState(0);
  const [name, setName] = useState('');
  const [author, setAuthor] = useState(d.author);
  const [description, setDescription] = useState('');
  const [template, setTemplate] = useState<TemplateId>(d.template);
  const [L, setL] = useState(d.L);
  const [withLoads, setWithLoads] = useState(d.withLoads);
  const [material, setMaterial] = useState<Material>(structuredClone(d.material));
  const [section, setSection] = useState<SectionDef>(structuredClone(d.section));
  const [settings, setSettings] = useState<AnalysisSettings>({ ...d.settings });
  const [saveDefaults, setSaveDefaults] = useState(true);
  const step = steps[stepIdx];

  const nameOk = name.trim().length > 0;
  const lOk = Number.isFinite(L) && L > 0;
  const canNext = step === 'project' ? nameOk : step === 'system' ? lOk : true;

  const finish = () => {
    const m = createProject({ name, author, description, template, L, withLoads, material, section, settings });
    st.loadModel(m);
    if (saveDefaults) st.setUserDefaults({ author: author.trim(), template, L, withLoads, material, section, settings });
    st.closeWizard();
    st.setInputTab('beam');
    st.setMainTab('results');
    st.showToast('toast.projectCreated', { name: m.name });
  };
  const skip = () => st.closeWizard();

  const setS = (p: Partial<AnalysisSettings>) => setSettings((s) => ({ ...s, ...p }));

  return (
    <Dialog.Root open onOpenChange={(o) => !o && !firstRun && st.closeWizard()}>
      <Dialog.Portal>
        <Dialog.Overlay className="no-print fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[2px]" />
        <Dialog.Content
          data-testid="wizard"
          onEscapeKeyDown={(e) => firstRun && e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className="no-print fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[min(46rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
            <span className="text-accent-700 dark:text-accent-400">
              <IconBeamLogo />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold">{firstRun ? fmt.t('wizard.titleFirst') : fmt.t('wizard.title')}</Dialog.Title>
              <Dialog.Description className="text-xs text-slate-500 dark:text-slate-400">
                {fmt.t('wizard.stepOf', { n: stepIdx + 1, total: steps.length })} · {fmt.t(`wizard.steps.${step}`)}
              </Dialog.Description>
            </div>
            {!firstRun && (
              <Dialog.Close className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={fmt.t('common.close')}>
                <IconX />
              </Dialog.Close>
            )}
          </div>

          {/* step indicator */}
          <ol className="flex gap-1 px-5 pt-3" aria-label={fmt.t('wizard.progress')}>
            {steps.map((s, i) => (
              <li key={s} className="flex-1">
                <button
                  type="button"
                  disabled={i > stepIdx}
                  onClick={() => setStepIdx(i)}
                  aria-current={i === stepIdx ? 'step' : undefined}
                  className={cx(
                    'h-1.5 w-full rounded-full',
                    i < stepIdx ? 'bg-accent-500' : i === stepIdx ? 'bg-accent-700' : 'bg-slate-200 dark:bg-slate-700',
                  )}
                  title={fmt.t(`wizard.steps.${s}`)}
                />
              </li>
            ))}
          </ol>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {step === 'prefs' && (
              <div className="space-y-4" data-testid="wizard-step-prefs">
                <p className="text-sm">{fmt.t('wizard.welcome')}</p>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">{fmt.t('header.language')}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {LANGS.map((l) => (
                      <button
                        key={l}
                        type="button"
                        data-testid={`wizard-lang-${l}`}
                        aria-pressed={st.lang === l}
                        onClick={() => st.setPrefs({ lang: l })}
                        className={cx(
                          'rounded-lg border px-3 py-2 text-sm',
                          st.lang === l ? 'border-accent-600 bg-accent-50 font-semibold dark:bg-accent-900/30' : 'border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800',
                        )}
                      >
                        {fmt.t(`lang.${l}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <SelectField
                    label={fmt.t('header.units')}
                    value={st.units}
                    testId="wizard-units"
                    options={[
                      { value: 'metric', label: `${fmt.t('header.metric')} (m, kN, MPa)` },
                      { value: 'imperial', label: `${fmt.t('header.imperial')} (ft, kip, ksi)` },
                    ]}
                    onChange={(u) => st.setPrefs({ units: u })}
                  />
                  <SelectField
                    label={fmt.t('wizard.theme')}
                    value={st.theme}
                    options={[
                      { value: 'light', label: fmt.t('wizard.light') },
                      { value: 'dark', label: fmt.t('wizard.dark') },
                    ]}
                    onChange={(theme) => st.setPrefs({ theme })}
                  />
                  <NumberField
                    label={fmt.t('settings.decimals')}
                    value={st.decimals}
                    onChange={(v) => st.setPrefs({ decimals: Math.max(0, Math.min(6, Math.round(v))) })}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{fmt.t('wizard.prefsHint')}</p>
              </div>
            )}

            {step === 'project' && (
              <div className="space-y-3" data-testid="wizard-step-project">
                <div>
                  <TextField label={`${fmt.t('beam.name')} *`} value={name} placeholder={fmt.t('wizard.namePlaceholder')} onChange={setName} testId="wizard-name" />
                  {!nameOk && <p className="mt-0.5 text-[11px] text-slate-500">{fmt.t('wizard.nameRequired')}</p>}
                </div>
                <TextField label={fmt.t('beam.author')} value={author} onChange={setAuthor} testId="wizard-author" />
                <label className="block">
                  <span className="mb-0.5 block text-[11px] font-medium text-slate-500 dark:text-slate-400">{fmt.t('beam.description')}</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-sm outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 dark:border-slate-600 dark:bg-slate-900"
                  />
                </label>
              </div>
            )}

            {step === 'system' && (
              <div className="space-y-3" data-testid="wizard-step-system">
                <p className="text-sm">{fmt.t('wizard.systemIntro')}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={fmt.t('header.templates')}>
                  {TEMPLATE_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={template === id}
                      data-testid={`wizard-template-${id}`}
                      onClick={() => {
                        setTemplate(id);
                        setL(templateModel(id).L);
                      }}
                      className={cx(
                        'flex flex-col items-center gap-1 rounded-lg border p-2 text-xs',
                        template === id ? 'border-accent-600 bg-accent-50 font-semibold dark:bg-accent-900/30' : 'border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800',
                      )}
                    >
                      <MiniSystem id={id} />
                      {fmt.t(`templates.${id}`)}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <NumberField label={fmt.t('beam.length')} value={L} q="length" onChange={setL} testId="wizard-length" />
                  <div className="pt-4">
                    <SwitchField checked={withLoads} onChange={setWithLoads} label={fmt.t('wizard.withLoads')} testId="wizard-with-loads" />
                  </div>
                </div>
                {!lOk && <p className="text-[11px] text-red-600">{fmt.t('err.positive')}</p>}
                <p className="text-xs text-slate-500 dark:text-slate-400">{fmt.t('wizard.systemHint')}</p>
              </div>
            )}

            {step === 'section' && (
              <div className="grid gap-4 md:grid-cols-2" data-testid="wizard-step-section">
                <div className="space-y-3">
                  <SectionEditor def={section} onChange={setSection} base="wizard.section" />
                  <SectionSketch def={section} rho={material.rho} />
                </div>
                <MaterialEditor m={material} onChange={setMaterial} base="wizard.material" />
              </div>
            )}

            {step === 'analysis' && (
              <div className="space-y-3" data-testid="wizard-step-analysis">
                <SelectField
                  label={fmt.t('settings.theory')}
                  value={settings.theory}
                  options={[
                    { value: 'euler', label: fmt.t('settings.euler') },
                    { value: 'timoshenko', label: fmt.t('settings.timoshenko') },
                  ]}
                  onChange={(theory) => setS({ theory })}
                />
                <SwitchField checked={settings.selfWeight} onChange={(v) => setS({ selfWeight: v })} label={fmt.t('settings.selfWeight')} hint={fmt.t('settings.selfWeightHint')} />
                <SwitchField
                  checked={settings.patternLoading}
                  onChange={(v) => setS({ patternLoading: v })}
                  label={fmt.t('settings.patternLoading')}
                  hint={fmt.t('settings.patternLoadingHint')}
                />
                <SwitchField checked={settings.shearCheck} onChange={(v) => setS({ shearCheck: v })} label={fmt.t('settings.shearCheck')} />
                <div className="grid grid-cols-2 gap-3">
                  <NumberField label={fmt.t('settings.deflLimitSpan')} value={settings.deflLimitSpan} onChange={(v) => setS({ deflLimitSpan: v })} />
                  <NumberField label={fmt.t('settings.deflLimitCantilever')} value={settings.deflLimitCantilever} onChange={(v) => setS({ deflLimitCantilever: v })} />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{fmt.t('wizard.combosHint')}</p>
              </div>
            )}

            {step === 'summary' && (
              <div className="space-y-3" data-testid="wizard-step-summary">
                <table className="w-full text-sm">
                  <tbody>
                    {(
                      [
                        [fmt.t('beam.name'), name.trim()],
                        [fmt.t('beam.author'), author.trim() || '–'],
                        [fmt.t('wizard.system'), `${fmt.t(`templates.${template}`)}, L = ${fmt.q(L, 'length')}${withLoads ? ` · ${fmt.t('wizard.withLoadsShort')}` : ''}`],
                        [fmt.t('section.label'), sectionLabel(section)],
                        [fmt.t('material.label'), `${fmt.t(`material.preset.${material.preset}`)}, f_d = ${fmt.q(designStrength(material), 'stress')}`],
                        [fmt.t('settings.theory'), fmt.t(settings.theory === 'euler' ? 'settings.euler' : 'settings.timoshenko')],
                        [fmt.t('settings.selfWeight'), settings.selfWeight ? fmt.t('common.yes') : fmt.t('common.no')],
                        [fmt.t('settings.limits'), `L/${fmt.num(settings.deflLimitSpan, 0)} · L/${fmt.num(settings.deflLimitCantilever, 0)}`],
                      ] as [string, string][]
                    ).map(([k, v]) => (
                      <tr key={k} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-1 pr-3 text-slate-500 dark:text-slate-400">{k}</td>
                        <td className="py-1">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <SwitchField checked={saveDefaults} onChange={setSaveDefaults} label={fmt.t('wizard.saveDefaults')} hint={fmt.t('wizard.saveDefaultsHint')} />
                {!firstRun && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    <p>{fmt.t('wizard.replaceWarning', { name: st.model.name || fmt.t('wizard.unnamed') })}</p>
                    <Button
                      size="sm"
                      className="mt-1.5"
                      data-testid="wizard-save-current"
                      onClick={() => downloadBlob(serializeProject(st.model), `${(st.model.name || 'balken').replace(/[^\w\-äöüÄÖÜß]+/g, '_')}.json`, 'application/json')}
                    >
                      <IconDownload /> {fmt.t('wizard.saveCurrent')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
            {firstRun ? (
              <Button variant="ghost" onClick={skip} data-testid="wizard-skip">
                {fmt.t('wizard.skip')}
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => st.closeWizard()} data-testid="wizard-cancel">
                {fmt.t('wizard.cancel')}
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              {stepIdx > 0 && (
                <Button onClick={() => setStepIdx(stepIdx - 1)} data-testid="wizard-back">
                  {fmt.t('wizard.back')}
                </Button>
              )}
              {step !== 'summary' ? (
                <Button variant="primary" disabled={!canNext} onClick={() => setStepIdx(stepIdx + 1)} data-testid="wizard-next">
                  {fmt.t('wizard.next')}
                </Button>
              ) : (
                <Button variant="primary" onClick={finish} data-testid="wizard-create">
                  {fmt.t('wizard.create')}
                </Button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
