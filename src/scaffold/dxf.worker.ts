/// <reference lib="webworker" />
/**
 * Worker reading a DXF of PERI CAD: the file in pieces (progress by bytes), then the records
 * (progress by lines). The page stays responsive and shows the progress; the drawing comes back as data.
 */
import { parsePeriCadDxf, ScaffoldImportError, type ScaffoldDoc } from './pericad';

export type DxfWorkerMessage =
  | { type: 'progress'; phase: 'read' | 'parse'; frac: number }
  | { type: 'done'; doc: ScaffoldDoc }
  | { type: 'error'; key: string };

const post = (m: DxfWorkerMessage) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (e: MessageEvent<{ file: File }>) => {
  const { file } = e.data;
  try {
    // read in pieces: progress by bytes
    const parts: Uint8Array[] = [];
    let got = 0;
    let last = 0;
    const reader = file.stream().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      if (got - last > file.size / 100) {
        last = got;
        post({ type: 'progress', phase: 'read', frac: file.size ? got / file.size : 1 });
      }
    }
    const buf = new Uint8Array(got);
    let o = 0;
    for (const p of parts) {
      buf.set(p, o);
      o += p.length;
    }
    parts.length = 0;
    const text = new TextDecoder('utf-8').decode(buf);
    let lastP = -1;
    const doc = parsePeriCadDxf(text, file.name, (frac) => {
      if (frac - lastP >= 0.01) {
        lastP = frac;
        post({ type: 'progress', phase: 'parse', frac });
      }
    });
    post({ type: 'done', doc });
  } catch (err) {
    post({ type: 'error', key: err instanceof ScaffoldImportError ? err.message : 'scaffold.err.read' });
  }
};
