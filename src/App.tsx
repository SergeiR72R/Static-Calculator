import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Direction, Tabs, Tooltip } from 'radix-ui';
import { analyze } from './core/analysis';
import { computeView } from './core/results';
import { runChecks } from './core/checks';
import { useStore, type InputTab, type MainTab } from './state/store';
import { ResultsContext, useFmt } from './ui/hooks';
import { Header } from './ui/Header';
import { BeamPanel } from './ui/inputs/BeamPanel';
import { CasesPanel, LoadsPanel, SettingsPanel, SupportsPanel } from './ui/inputs/Panels';
import { ResultsPanel, ResultsToolbar } from './ui/results/ResultsPanel';
import { ReportTab } from './ui/ReportTab';
import { PrintReport } from './ui/PrintReport';
import { NewProjectWizard } from './ui/NewProjectWizard';
import { BRAND } from './ui/Brand';
import { cx } from './ui/common';
import { isRtl } from './units/format';

const INPUT_TABS: InputTab[] = ['beam', 'supports', 'loads', 'cases', 'settings'];

function Toast() {
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => useStore.setState({ toast: null }), 3500);
    return () => clearTimeout(id);
  }, [toast]);
  if (!toast) return null;
  return (
    <div role="status" className="no-print fixed bottom-4 right-4 z-50 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900" data-testid="toast">
      {fmt.t(toast.key, toast.params)}
    </div>
  );
}

export function App() {
  const fmt = useFmt();
  const model = useStore((s) => s.model);
  const view = useStore((s) => s.view);
  const theme = useStore((s) => s.theme);
  const lang = useStore((s) => s.lang);
  const inputTab = useStore((s) => s.inputTab);
  const mainTab = useStore((s) => s.mainTab);
  const selection = useStore((s) => s.selection);
  const [printing, setPrinting] = useState(false);

  const an = useMemo(() => analyze(model), [model]);
  const vr = useMemo(() => computeView(an, view), [an, view]);
  const checks = useMemo(() => (vr ? runChecks(an, vr) : null), [an, vr]);
  const ctx = useMemo(() => ({ an, vr, checks }), [an, vr, checks]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr';
    document.title = `${fmt.t('app.title')} – ${BRAND.name}`;
  }, [lang, fmt]);

  useEffect(() => {
    if (!selection) return;
    useStore.getState().setInputTab(selection.kind === 'load' ? 'loads' : selection.kind === 'segment' ? 'beam' : 'supports');
  }, [selection]);

  // undo / redo shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        useStore.getState().undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        useStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // print report is only rendered while printing
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  return (
    <ResultsContext.Provider value={ctx}>
      <Direction.Provider dir={isRtl(lang) ? 'rtl' : 'ltr'}>
      <Tooltip.Provider>
        <div className="flex min-h-full flex-col">
          <Header />
          <div className="no-print border-b border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 md:hidden dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {fmt.t('app.mobileViewOnly')}
          </div>
          <main className="no-print grid flex-1 grid-cols-1 md:grid-cols-[minmax(320px,400px)_1fr] lg:grid-cols-[minmax(360px,440px)_1fr]">
            <aside className="hidden border-e border-slate-200 bg-slate-100/60 md:block dark:border-slate-800 dark:bg-slate-900/40" aria-label={fmt.t('app.input')}>
              <Tabs.Root value={inputTab} onValueChange={(v) => useStore.getState().setInputTab(v as InputTab)} className="flex h-full flex-col">
                <Tabs.List className="sticky top-[53px] z-20 flex border-b border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" aria-label={fmt.t('app.input')}>
                  {INPUT_TABS.map((tb) => (
                    <Tabs.Trigger
                      key={tb}
                      value={tb}
                      data-testid={`tab-${tb}`}
                      className="flex-1 border-b-2 border-transparent px-1 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 data-[state=active]:border-lime-400 data-[state=active]:text-accent-700 dark:text-slate-300 dark:data-[state=active]:text-accent-200"
                    >
                      {fmt.t(`tabs.${tb}`)}
                    </Tabs.Trigger>
                  ))}
                </Tabs.List>
                <div className="p-3">
                  <Tabs.Content value="beam">
                    <BeamPanel />
                  </Tabs.Content>
                  <Tabs.Content value="supports">
                    <SupportsPanel />
                  </Tabs.Content>
                  <Tabs.Content value="loads">
                    <LoadsPanel />
                  </Tabs.Content>
                  <Tabs.Content value="cases">
                    <CasesPanel />
                  </Tabs.Content>
                  <Tabs.Content value="settings">
                    <SettingsPanel />
                  </Tabs.Content>
                </div>
              </Tabs.Root>
            </aside>
            <section className="min-w-0" aria-label={fmt.t('app.results')}>
              <Tabs.Root value={mainTab} onValueChange={(v) => useStore.getState().setMainTab(v as MainTab)}>
                <div className="sticky top-[53px] z-20 bg-slate-50/95 backdrop-blur dark:bg-slate-950/95">
                  <Tabs.List className="flex gap-1 px-3 pt-2" aria-label={fmt.t('app.results')}>
                    {(['results', 'report'] as const).map((tb) => (
                      <Tabs.Trigger
                        key={tb}
                        value={tb}
                        data-testid={`main-tab-${tb}`}
                        className={cx(
                          'rounded-t-md border border-b-0 border-transparent px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300',
                          'data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900 dark:data-[state=active]:border-slate-800 dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-white',
                        )}
                      >
                        {fmt.t(`tabs.${tb}`)}
                      </Tabs.Trigger>
                    ))}
                  </Tabs.List>
                  <div className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <ResultsToolbar />
                  </div>
                </div>
                <div className="p-3">
                  <Tabs.Content value="results">
                    <ResultsPanel />
                  </Tabs.Content>
                  <Tabs.Content value="report">{mainTab === 'report' && <ReportTab />}</Tabs.Content>
                </div>
              </Tabs.Root>
            </section>
          </main>
          <footer className="no-print flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span className="font-semibold">
              <span className="text-accent-700 dark:text-accent-300">pro</span>
              <span className="text-lime-600 dark:text-lime-400">maintain</span>
            </span>
            <span className="italic">{BRAND.tagline}</span>
            <span className="hidden sm:inline">·</span>
            <span>{fmt.t('app.footer')}</span>
          </footer>
          {printing && <PrintReport />}
          <NewProjectWizard />
          <Toast />
        </div>
      </Tooltip.Provider>
      </Direction.Provider>
    </ResultsContext.Provider>
  );
}
