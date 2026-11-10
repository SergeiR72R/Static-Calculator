import { useStore } from '../../state/store';
import { useScaffold } from '../../scaffold/store';
import { parsePeriCadDxf, ScaffoldImportError, type ScaffoldDoc } from '../../scaffold/pericad';
import { mergePeriExport, parsePeriExport } from '../../scaffold/periExport';
import type { DxfWorkerMessage } from '../../scaffold/dxf.worker';
import DxfWorker from '../../scaffold/dxf.worker?worker&inline';
import lsp from '../../../tools/PERIEXPORT.lsp?raw';
import { useProgress } from './progress';

const frame = () => new Promise((r) => setTimeout(r, 30));

/** the DXF read on the page itself (no workers) */
async function parseHere(f: File): Promise<ScaffoldDoc> {
  const setLoad = useProgress.getState().setLoad;
  setLoad({ phase: 'scaffold.progress.parse', frac: null });
  await frame();
  return parsePeriCadDxf(new TextDecoder('utf-8').decode(await f.arrayBuffer()), f.name);
}

/** the DXF read in a worker, with the progress of reading and parsing */
function parseInWorker(f: File): Promise<ScaffoldDoc> {
  const setLoad = useProgress.getState().setLoad;
  let w: Worker;
  try {
    w = new DxfWorker();
  } catch {
    return parseHere(f);
  }
  return new Promise((resolve, reject) => {
    w.onmessage = (e: MessageEvent<DxfWorkerMessage>) => {
      const m = e.data;
      if (m.type === 'progress') setLoad({ phase: m.phase === 'read' ? 'scaffold.progress.read' : 'scaffold.progress.parse', frac: m.frac });
      else {
        w.terminate();
        if (m.type === 'done') resolve(m.doc);
        else reject(new ScaffoldImportError(m.key));
      }
    };
    w.onerror = (e) => {
      e.preventDefault();
      w.terminate();
      // the worker could not start (e.g. blocked): on the page
      parseHere(f).then(resolve, reject);
    };
    w.postMessage({ file: f });
  });
}

/** text of a file: UTF-8, else Windows-1252 (AutoLISP writes the ANSI code page) */
async function readText(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/** Read a DXF of PERI CAD and make it the drawing of the scaffold mode (part of the lazily loaded scaffold mode). */
export async function openDxfFile(f: File): Promise<boolean> {
  const app = useStore.getState();
  if (/\.dwg$/i.test(f.name)) {
    app.showToast('scaffold.err.dwg');
    return false;
  }
  const { setLoad } = useProgress.getState();
  try {
    setLoad({ phase: 'scaffold.progress.read', frac: 0 });
    const doc = await parseInWorker(f);
    // the structure is worked out while the page renders the new drawing (the bar stays until then)
    setLoad({ phase: 'scaffold.progress.structure', frac: null });
    await frame();
    useScaffold.getState().setDoc(doc);
    if (app.appMode !== 'scaffold') app.setPrefs({ appMode: 'scaffold' });
    app.showToast('scaffold.loaded', { n: doc.parts.length });
    return true;
  } catch (e) {
    setLoad(null);
    app.showToast(e instanceof Error && e.message.startsWith('scaffold.') ? e.message : 'scaffold.err.read');
    return false;
  }
}

/** The PERIEXPORT file of AutoCAD (older PERI CAD parts) added to the open drawing. */
export async function openExportFile(f: File): Promise<boolean> {
  const app = useStore.getState();
  const sc = useScaffold.getState();
  useProgress.getState().setLoad({ phase: 'scaffold.progress.export', frac: null });
  const ex = parsePeriExport(await readText(f));
  if (!ex) {
    useProgress.getState().setLoad(null);
    app.showToast('scaffold.export.errFormat');
    return false;
  }
  if (!sc.doc) {
    useProgress.getState().setLoad(null);
    app.showToast('scaffold.export.errNoDxf');
    return false;
  }
  useProgress.getState().setLoad({ phase: 'scaffold.progress.structure', frac: null });
  await frame();
  const doc = mergePeriExport(sc.doc, ex, f.name);
  sc.setDoc(doc);
  app.showToast('scaffold.export.loaded', { n: doc.exported?.added ?? 0 });
  return true;
}

/** Several files at once: the DXF first, then the export files. */
export async function openScaffoldFiles(files: File[]): Promise<void> {
  const dxf = files.filter((f) => !/\.txt$/i.test(f.name));
  const txt = files.filter((f) => /\.txt$/i.test(f.name));
  for (const f of dxf.slice(0, 1)) if (!(await openDxfFile(f))) return;
  for (const f of txt) await openExportFile(f);
}

/** The AutoLISP command PERIEXPORT as a file to save */
export function downloadExportScript() {
  const url = URL.createObjectURL(new Blob([lsp], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'PERIEXPORT.lsp';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
