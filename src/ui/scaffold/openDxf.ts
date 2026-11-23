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
async function parseHere(f: File, allowEmpty: boolean): Promise<ScaffoldDoc> {
  const setLoad = useProgress.getState().setLoad;
  setLoad({ phase: 'scaffold.progress.parse', frac: null });
  await frame();
  return parsePeriCadDxf(new TextDecoder('utf-8').decode(await f.arrayBuffer()), f.name, undefined, { allowEmpty });
}

/** the DXF read in a worker, with the progress of reading and parsing */
function parseInWorker(f: File, allowEmpty: boolean): Promise<ScaffoldDoc> {
  const setLoad = useProgress.getState().setLoad;
  let w: Worker;
  try {
    w = new DxfWorker();
  } catch {
    return parseHere(f, allowEmpty);
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
      parseHere(f, allowEmpty).then(resolve, reject);
    };
    w.postMessage({ file: f, allowEmpty });
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

/** the parts of the PERIEXPORT files added to a drawing; null (with a message) if a file is not an export */
async function withExports(doc: ScaffoldDoc, txt: File[]): Promise<ScaffoldDoc | null> {
  let d = doc;
  for (const f of txt) {
    const ex = parsePeriExport(await readText(f));
    if (!ex) {
      useProgress.getState().setLoad(null);
      useStore.getState().showToast('scaffold.export.errFormat');
      return null;
    }
    d = mergePeriExport(d, ex, f.name);
  }
  return d;
}

/**
 * Read a DXF of PERI CAD with its PERIEXPORT files (…_peri.txt) and make it the drawing of the scaffold
 * mode (part of the lazily loaded scaffold mode). The drawing is shown once all its files are read.
 */
export async function openDxfFile(f: File, txt: File[] = []): Promise<boolean> {
  const app = useStore.getState();
  if (/\.dwg$/i.test(f.name)) {
    app.showToast('scaffold.err.dwg');
    return false;
  }
  const { setLoad } = useProgress.getState();
  try {
    setLoad({ phase: 'scaffold.progress.read', frac: 0 });
    // a drawing of parts of the older kind only: its parts come from the export
    let doc = await parseInWorker(f, txt.length > 0);
    if (txt.length) {
      setLoad({ phase: 'scaffold.progress.export', frac: null });
      await frame();
      const d = await withExports(doc, txt);
      if (!d) return false;
      doc = d;
      if (!doc.parts.length) throw new ScaffoldImportError('scaffold.export.empty');
    }
    // the structure is worked out while the page renders the new drawing (the bar stays until then)
    setLoad({ phase: 'scaffold.progress.structure', frac: null });
    await frame();
    useScaffold.getState().setDoc(doc);
    // the enclosure mode works on the same drawing
    if (app.appMode !== 'scaffold' && app.appMode !== 'tent') app.setPrefs({ appMode: 'scaffold' });
    // old-kind parts not in the DXF and no export file with it: ask for the …_peri.txt
    if (txt.length) app.showToast('scaffold.export.loadedBoth', { n: doc.parts.length, m: doc.exported?.added ?? 0 });
    else if (doc.aecParts) app.showToast('scaffold.export.missing', { n: doc.parts.length, m: doc.aecParts });
    else app.showToast('scaffold.loaded', { n: doc.parts.length });
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
  if (!sc.doc) {
    app.showToast('scaffold.export.errNoDxf');
    return false;
  }
  useProgress.getState().setLoad({ phase: 'scaffold.progress.export', frac: null });
  await frame();
  const doc = await withExports(sc.doc, [f]);
  if (!doc) return false;
  useProgress.getState().setLoad({ phase: 'scaffold.progress.structure', frac: null });
  await frame();
  sc.setDoc(doc);
  app.showToast('scaffold.export.loaded', { n: doc.exported?.added ?? 0 });
  return true;
}

/** Several files at once: the DXF with its export files, or export files for the open drawing. */
export async function openScaffoldFiles(files: File[]): Promise<void> {
  const dxf = files.filter((f) => !/\.txt$/i.test(f.name));
  const txt = files.filter((f) => /\.txt$/i.test(f.name));
  if (dxf.length) {
    await openDxfFile(dxf[0], txt);
    return;
  }
  for (const f of txt) if (!(await openExportFile(f))) return;
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
