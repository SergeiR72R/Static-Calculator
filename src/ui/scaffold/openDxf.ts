import { useStore } from '../../state/store';
import { useScaffold } from '../../scaffold/store';
import { parsePeriCadDxf } from '../../scaffold/pericad';
import { mergePeriExport, parsePeriExport } from '../../scaffold/periExport';
import lsp from '../../../tools/PERIEXPORT.lsp?raw';

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
  try {
    const text = new TextDecoder('utf-8').decode(await f.arrayBuffer());
    const doc = parsePeriCadDxf(text, f.name);
    useScaffold.getState().setDoc(doc);
    if (app.appMode !== 'scaffold') app.setPrefs({ appMode: 'scaffold' });
    app.showToast('scaffold.loaded', { n: doc.parts.length });
    return true;
  } catch (e) {
    app.showToast(e instanceof Error && e.message.startsWith('scaffold.') ? e.message : 'scaffold.err.read');
    return false;
  }
}

/** The PERIEXPORT file of AutoCAD (older PERI CAD parts) added to the open drawing. */
export async function openExportFile(f: File): Promise<boolean> {
  const app = useStore.getState();
  const sc = useScaffold.getState();
  const ex = parsePeriExport(await readText(f));
  if (!ex) {
    app.showToast('scaffold.export.errFormat');
    return false;
  }
  if (!sc.doc) {
    app.showToast('scaffold.export.errNoDxf');
    return false;
  }
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
