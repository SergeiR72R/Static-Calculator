import { useStore } from '../state/store';
import { serializeProject } from '../state/persist';
import { serializeBatch } from '../state/batch';
import { downloadBlob } from './common';

export function fileBase(name: string) {
  return (name || 'balken').replace(/[^\w\-äöüÄÖÜß]+/g, '_').slice(0, 60);
}

/** Save the project as JSON: the whole beam list (one file with all beams and drawings) or the single beam */
export function saveProjectFile() {
  const st = useStore.getState();
  if (st.batch) {
    downloadBlob(serializeBatch(st.batch, st.batchImages), `${fileBase(st.batch.name.replace(/\.(xlsx|json)$/i, ''))}.json`, 'application/json');
    st.showToast('toast.listSaved', { n: st.batch.items.length });
  } else downloadBlob(serializeProject(st.model), `${fileBase(st.model.name)}.json`, 'application/json');
}
