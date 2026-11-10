import { useStore } from '../../state/store';
import { useScaffold } from '../../scaffold/store';
import { parsePeriCadDxf } from '../../scaffold/pericad';

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
