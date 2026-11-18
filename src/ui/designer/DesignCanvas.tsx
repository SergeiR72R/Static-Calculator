import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { byArticle } from '../../designer/catalog';
import { anchorAngle, cat, designDoc, ends, hit, rosettes, seats, sideLines, snap, standards, tubePoint, type Candidate, type Design, type Placed } from '../../designer/design';
import { useDesigner } from '../../designer/store';
import { useFmt } from '../hooks';
import { DESIGN_COLOR } from './PartIcon';

/** the tool of the canvas: select, a catalogue part (article), a tube on couplers, an anchor */
export type Tool = { kind: 'select' } | { kind: 'part'; article: string } | { kind: 'tube' } | { kind: 'anchor' } | { kind: 'paste' };

/** side of the wall from the point of the anchor to the pointer: left (180°) or right (0°) */
const angleTo = (p: { x: number; z: number }, x: number) => (x < p.x ? 180 : 0);

/** anchor: a tie from the standard in its direction to the building (hatched) */
function AnchorMark({ id, x, y, angle, on, ghost }: { id: string; x: number; y: number; angle: number; on?: boolean; ghost?: boolean }) {
  const r = (angle * Math.PI) / 180;
  const ux = Math.cos(r);
  const uy = -Math.sin(r);
  const L = 28;
  const ex = x + ux * L;
  const ey = y + uy * L;
  // the wall across the tie, hatched on the far side
  const px = -uy;
  const py = ux;
  const color = ghost ? '#16a34a' : '#e11d48';
  return (
    <g data-testid={ghost ? 'designer-anchor-ghost' : `designer-anchor-${id}`} data-angle={angle} opacity={ghost ? 0.8 : 1}>
      {on && <line x1={x} y1={y} x2={ex} y2={ey} stroke="#d946ef" strokeWidth={8} strokeOpacity={0.3} />}
      <line x1={x} y1={y} x2={ex} y2={ey} stroke={color} strokeWidth={2.5} strokeDasharray={ghost ? '5 3' : undefined} />
      <circle cx={x} cy={y} r={3} fill={color} />
      <line x1={ex - px * 10} y1={ey - py * 10} x2={ex + px * 10} y2={ey + py * 10} stroke={color} strokeWidth={2.5} />
      {[-7, 0, 7].map((o) => (
        <line key={o} x1={ex + px * o} y1={ey + py * o} x2={ex + px * o + ux * 6 - px * 4} y2={ey + py * o + uy * 6 - py * 4} stroke={color} strokeWidth={1} />
      ))}
      {id && (
        <text x={ex + ux * 12} y={ey + uy * 12 + 3} textAnchor={ux < -0.3 ? 'end' : ux > 0.3 ? 'start' : 'middle'} className="text-[10px] font-semibold" fill={color}>
          {id}
        </text>
      )}
    </g>
  );
}

const etaColor = (eta: number) => (eta > 1 ? '#dc2626' : eta > 0.7 ? '#f59e0b' : '#16a34a');

interface View {
  /** world point at the centre of the canvas and pixels per metre */
  cx: number;
  cz: number;
  s: number;
}

function fit(d: Design, w: number, h: number): View {
  const pts = d.parts.flatMap((p) => {
    const e = ends(p);
    return [
      [e[0], e[1]],
      [e[2], e[3]],
    ];
  });
  if (!pts.length) return { cx: 1, cz: 2, s: Math.min(w / 4, h / 5) };
  const xs = pts.map((p) => p[0]);
  const zs = [...pts.map((p) => p[1]), 0];
  const x0 = Math.min(...xs) - 1;
  const x1 = Math.max(...xs) + 1;
  const z0 = Math.min(...zs) - 0.4;
  const z1 = Math.max(...zs) + 0.8;
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, s: Math.min(w / (x1 - x0), h / (z1 - z0), 400) };
}

/**
 * Side view of the section: grid and ground, the parts from their system geometry, decks with their
 * field width and working load, anchors and supports; the part of the tool follows the pointer,
 * snapped (green) or not placeable (red). With a result: the parts coloured by their utilisation.
 */
export function DesignCanvas({
  tool,
  setTool,
  selected,
  setSelected,
  eta,
  points = [],
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
  selected: string[];
  setSelected: (ids: string[]) => void;
  eta: Map<string, number> | null;
  /** checks at a point: nodes of the rosettes and joints of the standards */
  points?: { x: number; z: number; eta: number; check: string; part: string }[];
}) {
  const fmt = useFmt();
  const dz = useDesigner();
  const d = dz.design;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [view, setView] = useState<View | null>(null);
  const [ptr, setPtr] = useState<{ x: number; z: number } | null>(null);
  const [tubeStart, setTubeStart] = useState<{ x: number; z: number } | null>(null);
  /** anchor being set: its point on the standard (the second click gives its direction) */
  const [anchorStart, setAnchorStart] = useState<{ x: number; z: number; std: string } | null>(null);
  const drag = useRef<{ x: number; y: number; v: View; moved: boolean; pan: boolean } | null>(null);
  /** rubber band of the selection (screen pixels) */
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const v = view ?? fit(d, size.w, size.h);
  const X = (x: number) => size.w / 2 + (x - v.cx) * v.s;
  const Y = (z: number) => size.h / 2 - (z - v.cz) * v.s;
  const toWorld = (px: number, py: number) => ({ x: v.cx + (px - size.w / 2) / v.s, z: v.cz - (py - size.h / 2) / v.s });

  const { lines, stds, ros } = useMemo(() => ({ lines: sideLines(designDoc(d).doc), stds: standards(d), ros: rosettes(d) }), [d]);
  const part = tool.kind === 'part' ? byArticle.get(tool.article) : undefined;
  const reach = Math.max(0.6, 30 / v.s);
  const cand: Candidate | null = useMemo(() => (part && ptr ? snap(d, part, ptr.x, ptr.z, reach) : null), [d, part, ptr, reach]);
  const ghost = useMemo(() => {
    if (!cand) return [];
    const g: Design = { ...d, parts: [{ ...cand.part, id: '_ghost' }], anchors: [] };
    return sideLines(designDoc(g).doc).get('_ghost') ?? [];
  }, [cand, d]);
  const tp = (tool.kind === 'tube' || tool.kind === 'anchor') && ptr ? tubePoint(d, ptr.x, ptr.z) : null;
  // pasting: the copied group by its lower left corner at the pointer, 0.25 m across and 0.5 m up (the
  // rosettes stay on the grid of the others)
  const clip = dz.clipboard;
  const pasteAt = useMemo(() => {
    if (tool.kind !== 'paste' || !clip || !ptr) return null;
    const x0 = Math.min(...clip.parts.flatMap((p) => [ends(p)[0], ends(p)[2]]));
    const z0 = Math.min(...clip.parts.flatMap((p) => [ends(p)[1], ends(p)[3]]));
    return { dx: Math.round((ptr.x - x0) / 0.25) * 0.25, dz: Math.round((ptr.z - z0) / 0.5) * 0.5 };
  }, [tool.kind, clip, ptr]);
  const pasteGhost = useMemo(() => {
    if (!pasteAt || !clip) return [];
    const parts = clip.parts.map((p) => ({ ...p, id: `_p${p.id}`, x: p.x + pasteAt.dx, z: p.z + pasteAt.dz, ...(p.x2 !== undefined ? { x2: p.x2 + pasteAt.dx, z2: (p.z2 ?? p.z) + pasteAt.dz } : {}) }));
    return [...sideLines(designDoc({ ...d, parts, anchors: [] }).doc).values()].flat();
  }, [pasteAt, clip, d]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, select, textarea')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selected.length) {
        e.preventDefault();
        dz.copy(selected);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && dz.clipboard) {
        e.preventDefault();
        setTool({ kind: 'paste' });
        return;
      }
      if (e.key === 'Escape') {
        setTubeStart(null);
        setAnchorStart(null);
        setTool({ kind: 'select' });
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length) {
        e.preventDefault();
        dz.removeParts(selected);
        setSelected([]);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        dz.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        dz.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, dz, setSelected, setTool]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };
  const click = (x: number, z: number, add: boolean) => {
    if (tool.kind === 'part') {
      // the snap at the point of the click (not the one drawn: the pointer may not have been redrawn yet)
      const c = part ? snap(d, part, x, z, reach) : null;
      if (!c?.ok) return;
      const id = dz.addPart(c.part);
      setSelected([id]);
    } else if (tool.kind === 'tube') {
      const q = tubePoint(d, x, z);
      if (!q) return;
      if (!tubeStart) setTubeStart({ x: q.x, z: q.z });
      else if (Math.hypot(q.x - tubeStart.x, q.z - tubeStart.z) > 0.2) {
        const id = dz.addPart({ article: '026415', x: tubeStart.x, z: tubeStart.z, x2: q.x, z2: q.z });
        setSelected([id]);
        setTubeStart(null);
      }
    } else if (tool.kind === 'paste') {
      if (!pasteAt) return;
      setSelected(dz.paste(pasteAt.dx, pasteAt.dz));
    } else if (tool.kind === 'anchor') {
      if (!anchorStart) {
        const q = tubePoint(d, x, z);
        if (q) setAnchorStart(q);
      } else {
        dz.addAnchor({ part: anchorStart.std, z: anchorStart.z, angle: angleTo(anchorStart, x) });
        setAnchorStart(null);
      }
    } else {
      const h = hit(d, x, z, Math.max(0.12, 8 / v.s));
      if (!h) setSelected([]);
      else if (add) setSelected(selected.includes(h.id) ? selected.filter((s) => s !== h.id) : [...selected, h.id]);
      else setSelected([h.id]);
    }
  };

  // drawing helpers
  const seg = (l: [number, number, number, number], k: number, color: string, w: number, extra: Record<string, unknown> = {}) => (
    <line key={k} x1={X(l[0])} y1={Y(l[1])} x2={X(l[2])} y2={Y(l[3])} stroke={color} strokeWidth={w} strokeLinecap="round" {...extra} />
  );
  const grid: ReactElement[] = [];
  {
    const w0 = toWorld(0, size.h);
    const w1 = toWorld(size.w, 0);
    const step = v.s > 120 ? 0.25 : v.s > 50 ? 0.5 : 1;
    for (let x = Math.ceil(w0.x / step) * step; x <= w1.x; x += step)
      grid.push(<line key={`gx${x}`} x1={X(x)} y1={0} x2={X(x)} y2={size.h} stroke="currentColor" strokeOpacity={Math.abs(x - Math.round(x)) < 1e-6 ? 0.16 : 0.07} />);
    for (let z = Math.ceil(w0.z / step) * step; z <= w1.z; z += step)
      grid.push(<line key={`gz${z}`} x1={0} y1={Y(z)} x2={size.w} y2={Y(z)} stroke="currentColor" strokeOpacity={Math.abs(z - Math.round(z)) < 1e-6 ? 0.16 : 0.07} />);
  }
  const partColor = (p: Placed) => {
    const e = eta?.get(p.id);
    return e !== undefined ? etaColor(e) : DESIGN_COLOR[cat(p).kind];
  };
  // supports: jack plates and standards on the ground
  const supports = [
    ...d.parts.filter((p) => cat(p)?.kind === 'jack').map((p) => ({ x: p.x, z: p.z })),
    ...stds.filter((s) => s.z0 <= 0.001 && !seats(d).some((q) => Math.abs(q.x - s.x) < 0.02 && Math.abs(q.z - s.z0) < 0.02)).map((s) => ({ x: s.x, z: s.z0 })),
  ];

  return (
    <div
      ref={box}
      className="relative h-[60vh] min-h-[420px] w-full touch-none overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-500 select-none dark:border-slate-700 dark:bg-slate-950"
      data-testid="designer-canvas"
      style={{ cursor: tool.kind === 'select' ? 'default' : 'crosshair' }}
      onPointerDown={(e) => {
        const { px, py } = local(e);
        // right or middle button: pan; left button on the empty drawing with the select tool: rubber band
        drag.current = { x: px, y: py, v, moved: false, pan: e.button !== 0 };
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const { px, py } = local(e);
        const g = drag.current;
        if (g && e.buttons) {
          if (Math.hypot(px - g.x, py - g.y) > 4) g.moved = true;
          if (g.moved && g.pan) setView({ ...g.v, cx: g.v.cx - (px - g.x) / g.v.s, cz: g.v.cz + (py - g.y) / g.v.s });
          else if (g.moved && tool.kind === 'select') setBand({ x0: g.x, y0: g.y, x1: px, y1: py });
        }
        setPtr(toWorld(px, py));
      }}
      onPointerUp={(e) => {
        const g = drag.current;
        drag.current = null;
        if (band) {
          // the parts lying wholly inside the band
          const a = toWorld(Math.min(band.x0, band.x1), Math.max(band.y0, band.y1));
          const b = toWorld(Math.max(band.x0, band.x1), Math.min(band.y0, band.y1));
          const inside = (x: number, z: number) => x >= a.x && x <= b.x && z >= a.z && z <= b.z;
          const ids = d.parts.filter((p) => {
            const [x0, z0, x1, z1] = ends(p);
            return inside(x0, z0) && inside(x1, z1);
          }).map((p) => p.id);
          setSelected(e.ctrlKey || e.shiftKey || e.metaKey ? [...new Set([...selected, ...ids])] : ids);
          setBand(null);
          return;
        }
        if (g?.moved || e.button !== 0) return;
        const { px, py } = local(e);
        const w = toWorld(px, py);
        click(w.x, w.z, e.ctrlKey || e.shiftKey || e.metaKey);
      }}
      onPointerLeave={() => setPtr(null)}
      onWheel={(e) => {
        const { px, py } = local(e);
        const w = toWorld(px, py);
        const s = Math.min(Math.max(v.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 20), 1500);
        setView({ s, cx: w.x - (px - size.w / 2) / s, cz: w.z + (py - size.h / 2) / s });
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg width={size.w} height={size.h} className="absolute inset-0" data-testid="designer-svg">
        {grid}
        {/* ground */}
        <line x1={0} y1={Y(0)} x2={size.w} y2={Y(0)} stroke="#78716c" strokeWidth={1.5} />
        <rect x={0} y={Y(0)} width={size.w} height={Math.max(size.h - Y(0), 0)} fill="#78716c" fillOpacity={0.06} />
        {/* decks with their field width and working load */}
        {d.parts
          .filter((p) => p.deck)
          .map((p) => {
            const [x0, z0, x1] = ends(p);
            const a = Math.min(x0, x1);
            const b = Math.max(x0, x1);
            const top = z0 + 0.09;
            return (
              <g key={`deck${p.id}`} data-testid={`designer-deck-${p.id}`}>
                <rect x={X(a)} y={Y(top)} width={(b - a) * v.s} height={Math.max(0.05 * v.s, 3)} fill={p.deck!.work ? '#93c5fd' : '#d6d3d1'} stroke="#78716c" strokeWidth={0.5} />
                {p.deck!.work &&
                  [0.2, 0.5, 0.8].map((t) => {
                    const x = a + t * (b - a);
                    return (
                      <g key={t}>
                        <line x1={X(x)} y1={Y(top + 0.35)} x2={X(x)} y2={Y(top + 0.06)} stroke="#2563eb" strokeWidth={1.3} />
                        <path d={`M ${X(x) - 3} ${Y(top + 0.12)} L ${X(x)} ${Y(top + 0.06)} L ${X(x) + 3} ${Y(top + 0.12)}`} fill="none" stroke="#2563eb" strokeWidth={1.3} />
                      </g>
                    );
                  })}
                {v.s > 60 && (
                  <text x={X((a + b) / 2)} y={Y(top) - 3 - (p.deck!.work ? 0.36 * v.s : 0)} textAnchor="middle" className="fill-slate-600 text-[10px] dark:fill-slate-300">
                    b = {fmt.num(p.deck!.width, 2)} m
                  </text>
                )}
              </g>
            );
          })}
        {/* parts */}
        {d.parts.map((p) => {
          const ls = lines.get(p.id) ?? [];
          const on = selected.includes(p.id);
          const k = cat(p)?.kind;
          const w = k === 'standard' || k === 'base' ? 4 : k === 'diagonal' || k === 'tube' ? 2.2 : 3;
          return (
            <g key={p.id} data-testid={`designer-part-${p.id}`} data-article={p.article} data-x={p.x} data-z={p.z}>
              {on && ls.map((l, i) => seg(l, i, '#d946ef', w + 6, { strokeOpacity: 0.35 }))}
              {ls.map((l, i) => seg(l, i, partColor(p), k === 'jack' && i < 4 ? 5 : w))}
            </g>
          );
        })}
        {/* rosettes */}
        {ros.map((r, k) => (
          <circle key={`r${k}`} cx={X(r.x)} cy={Y(r.z)} r={Math.max(2.5, Math.min(0.045 * v.s, 6))} fill="#fff" stroke="#334155" strokeWidth={1.2} />
        ))}
        {/* utilisation */}
        {eta &&
          v.s > 50 &&
          d.parts.map((p) => {
            const e = eta.get(p.id);
            if (e === undefined || e < 0.3) return null;
            const [x0, z0, x1, z1] = ends(p);
            return (
              <text key={`eta${p.id}`} x={X((x0 + x1) / 2) + 6} y={Y((z0 + z1) / 2) - 4} className="text-[10px] font-semibold" fill={etaColor(e)} data-testid={`designer-eta-${p.id}`}>
                {Math.round(e * 100)} %
              </text>
            );
          })}
        {/* nodes of the rosettes and joints of the standards, by their utilisation */}
        {points
          .filter((q) => q.eta >= 0.25)
          .map((q, k) => (
            <g key={`pt${k}`} data-testid={`designer-point-${q.check}-${q.part}`}>
              <circle cx={X(q.x)} cy={Y(q.z)} r={q.check === 'joint' ? 5 : 7} fill="none" stroke={etaColor(q.eta)} strokeWidth={2.5} />
              {v.s > 50 && q.eta >= 0.5 && (
                <text x={X(q.x) + (q.check === 'joint' ? 9 : -9)} y={Y(q.z) + (q.check === 'joint' ? -6 : 3)} textAnchor={q.check === 'joint' ? 'start' : 'end'} className="text-[10px] font-semibold" fill={etaColor(q.eta)}>
                  {fmt.t(q.check === 'joint' ? 'designer.pointJoint' : 'designer.pointNode')} {Math.round(q.eta * 100)} %
                </text>
              )}
            </g>
          ))}
        {/* supports */}
        {supports.map((s, k) => (
          <path key={`s${k}`} d={`M ${X(s.x)} ${Y(s.z)} l -7 11 h 14 z`} fill="none" stroke="#475569" strokeWidth={1.5} />
        ))}
        {/* anchors: from the standard towards the building, in their direction */}
        {d.anchors.map((a) => {
          const s = stds.find((q) => q.part.id === a.part);
          if (!s) return null;
          return <AnchorMark key={a.id} id={a.id} x={X(s.x)} y={Y(a.z)} angle={anchorAngle(d, a)} on={selected.includes(a.part)} />;
        })}
        {tool.kind === 'anchor' && anchorStart && ptr && <AnchorMark id="" x={X(anchorStart.x)} y={Y(anchorStart.z)} angle={angleTo(anchorStart, ptr.x)} ghost />}
        {/* the copied parts at the place of the pointer */}
        {pasteGhost.map((l, i) => seg(l, 1000 + i, '#16a34a', 3, { strokeOpacity: 0.7, strokeDasharray: '6 3' }))}
        {band && (
          <rect x={Math.min(band.x0, band.x1)} y={Math.min(band.y0, band.y1)} width={Math.abs(band.x1 - band.x0)} height={Math.abs(band.y1 - band.y0)} fill="#d946ef" fillOpacity={0.08} stroke="#d946ef" strokeDasharray="4 3" data-testid="designer-band" />
        )}
        {/* the part of the tool */}
        {ghost.map((l, i) => seg(l, i, cand?.ok ? '#16a34a' : '#dc2626', 3, { strokeOpacity: 0.75, strokeDasharray: '6 3' }))}
        {tool.kind === 'tube' && tubeStart && tp && seg([tubeStart.x, tubeStart.z, tp.x, tp.z], -1, '#16a34a', 2.5, { strokeDasharray: '6 3' })}
        {(tool.kind === 'tube' || tool.kind === 'anchor') && tp && <circle cx={X(tp.x)} cy={Y(tp.z)} r={6} fill="none" stroke={tool.kind === 'anchor' ? '#e11d48' : '#16a34a'} strokeWidth={2} />}
      </svg>
      <div className="pointer-events-none absolute bottom-2 start-2 rounded bg-white/85 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-900/85 dark:text-slate-300" data-testid="designer-hint">
        {ptr && (
          <span className="num me-2">
            x = {fmt.num(ptr.x, 2)} · z = {fmt.num(ptr.z, 2)} m
          </span>
        )}
        {fmt.t(
          tool.kind === 'part'
            ? part && !cand
              ? 'designer.hint.noSnap'
              : 'designer.hint.part'
            : tool.kind === 'paste'
              ? 'designer.hint.paste'
              : tool.kind === 'tube'
              ? tubeStart
                ? 'designer.hint.tube2'
                : 'designer.hint.tube1'
              : tool.kind === 'anchor'
                ? anchorStart
                  ? 'designer.hint.anchor2'
                  : 'designer.hint.anchor'
                : 'designer.hint.select',
        )}
      </div>
      <div className="absolute end-2 top-2 flex gap-1">
        <button type="button" className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" onClick={() => setView(null)} data-testid="designer-fit">
          {fmt.t('designer.fit')}
        </button>
      </div>
    </div>
  );
}
