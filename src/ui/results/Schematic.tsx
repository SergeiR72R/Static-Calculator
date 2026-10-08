import { useMemo, useRef, useState } from 'react';
import { Popover } from 'radix-ui';
import type { BeamModel, Id, Load, Support } from '../../core/types';
import { useStore, type Selection } from '../../state/store';
import { useFmt, useResults, type Fmt, type XScale } from '../hooks';
import { HingeEditor, LoadEditor, SupportEditor, loadKindLabel } from '../inputs/Editors';
import { IconX } from '../icons';
import { cx } from '../common';

const LEVEL_H = 30;

/** Assign distributed loads to non-overlapping levels */
function levels(loads: Load[]): Map<Id, number> {
  const res = new Map<Id, number>();
  const ends: number[] = [];
  const dl = loads.filter((l) => l.kind === 'dist').sort((a, b) => (a.kind === 'dist' && b.kind === 'dist' ? a.x1 - b.x1 : 0));
  for (const l of dl) {
    if (l.kind !== 'dist') continue;
    let lv = ends.findIndex((e) => e <= l.x1 + 1e-9);
    if (lv < 0) {
      lv = ends.length;
      ends.push(l.x2);
    } else ends[lv] = l.x2;
    res.set(l.id, lv);
  }
  return res;
}

function activeFactor(model: BeamModel, view: ReturnType<typeof useStore.getState>['view'], caseId: Id): boolean {
  if (view.type === 'case') return view.id === caseId;
  if (view.type === 'combo') return !!model.combinations.find((c) => c.id === view.id)?.factors[caseId];
  return model.combinations.some((c) => c.inEnvelope && c.factors[caseId]);
}

export function SupportSymbol({ s, x, y, L }: { s: Support; x: number; y: number; L: number }) {
  const hatch = (x1: number, x2: number, yy: number, dir = 1) => {
    const lines = [];
    for (let xx = x1; xx <= x2 - 3; xx += 5) lines.push(<line key={xx} x1={xx + 4} y1={yy} x2={xx} y2={yy + 5 * dir} />);
    return lines;
  };
  const st = { stroke: 'var(--support)', strokeWidth: 1.6, fill: 'none' } as const;
  switch (s.type) {
    case 'fixed': {
      if (s.x <= 1e-9 || s.x >= L - 1e-9) {
        const d = s.x <= 1e-9 ? -1 : 1;
        const lines = [];
        for (let yy = y - 16; yy <= y + 12; yy += 5) lines.push(<line key={yy} x1={x} y1={yy + 4} x2={x + 6 * d} y2={yy} />);
        return (
          <g {...st}>
            <line x1={x} y1={y - 18} x2={x} y2={y + 18} strokeWidth={2.4} />
            {lines}
          </g>
        );
      }
      return (
        <g {...st}>
          <rect x={x - 9} y={y - 12} width={18} height={24} fill="var(--surface)" fillOpacity={0.4} />
          <line x1={x - 14} y1={y + 12} x2={x + 14} y2={y + 12} />
          {hatch(x - 14, x + 14, y + 12)}
        </g>
      );
    }
    case 'pinned':
      return (
        <g {...st}>
          <path d={`M${x},${y + 2}L${x - 9},${y + 16}L${x + 9},${y + 16}Z`} fill="var(--surface)" />
          <line x1={x - 14} y1={y + 16} x2={x + 14} y2={y + 16} />
          {hatch(x - 14, x + 14, y + 16)}
        </g>
      );
    case 'roller':
      return (
        <g {...st}>
          <path d={`M${x},${y + 2}L${x - 9},${y + 15}L${x + 9},${y + 15}Z`} fill="var(--surface)" />
          <line x1={x - 13} y1={y + 18} x2={x + 13} y2={y + 18} />
          <line x1={x - 14} y1={y + 22} x2={x + 14} y2={y + 22} />
          {hatch(x - 14, x + 14, y + 22)}
        </g>
      );
    case 'slider':
      return (
        <g {...st}>
          <rect x={x - 8} y={y - 6} width={16} height={12} fill="var(--surface)" fillOpacity={0.3} />
          <line x1={x - 8} y1={y + 6} x2={x - 8} y2={y + 22} />
          <line x1={x + 8} y1={y + 6} x2={x + 8} y2={y + 22} />
          <line x1={x - 14} y1={y + 22} x2={x + 14} y2={y + 22} />
          {hatch(x - 14, x + 14, y + 22)}
        </g>
      );
    case 'spring': {
      const parts = [];
      if (s.kw > 0) {
        let d = `M${x},${y + 2}l0,3`;
        for (let i = 0; i < 4; i++) d += `l6,2l-12,2l6,0`;
        d += `l0,3`;
        parts.push(<path key="w" d={d} />);
        parts.push(<line key="wb" x1={x - 12} y1={y + 24} x2={x + 12} y2={y + 24} />);
        parts.push(<g key="wh">{hatch(x - 12, x + 12, y + 24)}</g>);
      }
      if (s.ku > 0) {
        let d = `M${x - 4},${y + 8}l-3,0`;
        for (let i = 0; i < 3; i++) d += `l-2,-5l-2,10l-2,-5`;
        d += `l-3,0`;
        parts.push(<path key="u" d={d} />);
        parts.push(<line key="ub" x1={x - 28} y1={y + 2} x2={x - 28} y2={y + 14} />);
      }
      if (s.kt > 0) {
        parts.push(<path key="t" d={`M${x + 3},${y}a7,7 0 1,1 6,8l6,8`} />);
      }
      return <g {...st}>{parts}</g>;
    }
  }
}

function arrowHead(x: number, y: number, dx: number, dy: number, size = 7) {
  const n = Math.hypot(dx, dy) || 1;
  const ux = dx / n;
  const uy = dy / n;
  const bx = x - ux * size;
  const by = y - uy * size;
  return `M${x},${y}L${bx - uy * size * 0.45},${by + ux * size * 0.45}L${bx + uy * size * 0.45},${by - ux * size * 0.45}Z`;
}

function LoadGlyph({ l, sx, beamY, lv, qmax, fmt, dim }: { l: Load; sx: XScale; beamY: number; lv: number; qmax: number; fmt: Fmt; dim: boolean }) {
  const color = dim ? 'var(--load-dim)' : 'var(--load)';
  const common = { stroke: color, fill: 'none', strokeWidth: 1.5 } as const;
  if (l.kind === 'point') {
    const a = (l.angle * Math.PI) / 180;
    let dx = Math.cos(a);
    let dy = Math.sin(a);
    if (l.P < 0) {
      dx = -dx;
      dy = -dy;
    }
    const x = sx.px(l.x);
    const y = beamY - 3;
    const len = 46;
    const tx = x - dx * len;
    const ty = y - dy * len;
    return (
      <g>
        <line x1={tx} y1={ty} x2={x - dx * 6} y2={y - dy * 6} {...common} strokeWidth={2} />
        <path d={arrowHead(x, y, dx, dy, 9)} fill={color} stroke="none" />
        <text x={tx + (dx >= 0 ? -4 : 4)} y={ty - 4} fontSize="11" textAnchor={dx >= 0 ? 'end' : 'start'} className="svg-text num" style={{ fill: color }}>
          {fmt.q(Math.abs(l.P), 'force', 1)}
          {Math.abs(l.angle - 90) > 1e-9 ? ` ∠${fmt.num(l.angle, 0)}°` : ''}
        </text>
      </g>
    );
  }
  if (l.kind === 'moment') {
    const x = sx.px(l.x);
    const r = 15;
    const cw = l.M >= 0;
    // arc from 200° to −70° (screen), arrow at the end
    const a0 = (-160 * Math.PI) / 180;
    const a1 = (110 * Math.PI) / 180;
    const p0 = [x + r * Math.cos(a0), beamY + r * Math.sin(a0)];
    const p1 = [x + r * Math.cos(a1), beamY + r * Math.sin(a1)];
    const d = `M${p0[0]},${p0[1]}A${r},${r} 0 1,1 ${p1[0]},${p1[1]}`;
    // tangent direction at end for clockwise travel (increasing screen angle)
    const tip = cw ? p1 : p0;
    const ang = cw ? a1 : a0;
    const tdx = cw ? -Math.sin(ang) : Math.sin(ang);
    const tdy = cw ? Math.cos(ang) : -Math.cos(ang);
    return (
      <g>
        <path d={d} {...common} strokeWidth={1.8} />
        <path d={arrowHead(tip[0], tip[1], tdx, tdy, 8)} fill={color} />
        <text x={x + r + 3} y={beamY - r - 2} fontSize="11" className="svg-text num" style={{ fill: color }}>
          {fmt.q(Math.abs(l.M), 'moment', 1)} {cw ? '↻' : '↺'}
        </text>
      </g>
    );
  }
  const x1 = sx.px(l.x1);
  const x2 = sx.px(l.x2);
  const base = beamY - 6 - lv * LEVEL_H;
  const hmax = LEVEL_H - 10;
  const h = (q: number) => (qmax > 0 ? (Math.abs(q) / qmax) * hmax : 0) * Math.sign(q || 1);
  const h1 = Math.max(Math.abs(h(l.q1)), 2);
  const h2 = Math.max(Math.abs(h(l.q2)), 2);
  if (l.dir === 'x') {
    const y = base - 4;
    const arrows = [];
    const n = Math.max(1, Math.floor((x2 - x1) / 26));
    const sgn = l.q1 + l.q2 >= 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const xa = x1 + ((i + 0.5) * (x2 - x1)) / n;
      arrows.push(<line key={i} x1={xa - 7 * sgn} y1={y} x2={xa + 3 * sgn} y2={y} {...common} />);
      arrows.push(<path key={`h${i}`} d={arrowHead(xa + 7 * sgn, y, sgn, 0, 6)} fill={color} />);
    }
    return (
      <g>
        <line x1={x1} y1={y + 5} x2={x2} y2={y + 5} {...common} strokeDasharray="2 2" />
        {arrows}
        <text x={(x1 + x2) / 2} y={y - 5} fontSize="10.5" textAnchor="middle" className="svg-text num" style={{ fill: color }}>
          p = {fmt.q(l.q1, 'lineLoad', 1)}
          {l.q2 !== l.q1 ? ` … ${fmt.num(fmt.val(l.q2, 'lineLoad'), 1)}` : ''}
        </text>
      </g>
    );
  }
  const yTop1 = base - h1;
  const yTop2 = base - h2;
  const up = l.q1 + l.q2 < 0;
  const arrows = [];
  const n = Math.max(1, Math.floor((x2 - x1) / 18));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const xa = x1 + t * (x2 - x1);
    const yt = yTop1 + t * (yTop2 - yTop1);
    if (base - yt < 4) continue;
    arrows.push(<line key={i} x1={xa} y1={yt} x2={xa} y2={base} {...common} strokeWidth={0.9} />);
    arrows.push(<path key={`h${i}`} d={up ? arrowHead(xa, yt, 0, -1, 5) : arrowHead(xa, base, 0, 1, 5)} fill={color} />);
  }
  return (
    <g>
      <path d={`M${x1},${base}L${x1},${yTop1}L${x2},${yTop2}L${x2},${base}`} {...common} fill={color} fillOpacity={0.08} />
      {arrows}
      <text x={x1 + 2} y={yTop1 - 3} fontSize="10.5" className="svg-text num" style={{ fill: color }}>
        {fmt.q(l.q1, 'lineLoad', 1)}
      </text>
      {l.q2 !== l.q1 && (
        <text x={x2 - 2} y={yTop2 - 3} fontSize="10.5" textAnchor="end" className="svg-text num" style={{ fill: color }}>
          {fmt.num(fmt.val(l.q2, 'lineLoad'), 1)}
        </text>
      )}
    </g>
  );
}

type DragKind = 'x' | 'x1' | 'x2' | 'body';
interface DragState {
  sel: NonNullable<Selection>;
  kind: DragKind;
  startPx: number;
  startX: number;
  startX1: number;
  startX2: number;
  moved: boolean;
  clientX: number;
  clientY: number;
}

export function Schematic({ sx }: { sx: XScale }) {
  const fmt = useFmt();
  const model = useStore((s) => s.model);
  const view = useStore((s) => s.view);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const cursorX = useStore((s) => s.cursorX);
  const setCursor = useStore((s) => s.setCursor);
  const snap = useStore((s) => s.snap);
  const showDeformed = useStore((s) => s.showDeformed);
  const deformScale = useStore((s) => s.deformScale);
  const beginDrag = useStore((s) => s.beginDrag);
  const dragUpdate = useStore((s) => s.dragUpdate);
  const endDrag = useStore((s) => s.endDrag);
  const { vr } = useResults();
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<DragState | null>(null);
  const [popover, setPopover] = useState<{ x: number; y: number } | null>(null);

  const lvMap = useMemo(() => levels(model.loads), [model.loads]);
  const nLevels = Math.max(0, ...[...lvMap.values()].map((v) => v + 1));
  const hasPoint = model.loads.some((l) => l.kind === 'point' || l.kind === 'moment');
  const topArea = Math.max(hasPoint ? 64 : 30, nLevels * LEVEL_H + 26);
  const beamY = topArea + 8;
  const H = beamY + 86;
  const qmax = Math.max(1e-9, ...model.loads.map((l) => (l.kind === 'dist' ? Math.max(Math.abs(l.q1), Math.abs(l.q2)) : 0)));

  const pts = useMemo(() => {
    const xs = [0, model.L, ...model.supports.map((s) => s.x), ...model.hinges.map((h) => h.x)];
    for (const l of model.loads) {
      if (l.kind === 'dist') xs.push(l.x1, l.x2);
      else xs.push(l.x);
    }
    const u = [...new Set(xs.filter((x) => x >= 0 && x <= model.L).map((x) => Math.round(x * 1e6) / 1e6))].sort((a, b) => a - b);
    return u;
  }, [model]);

  // deformed shape
  let deformPath = '';
  let deformFactor = 0;
  if (showDeformed && vr) {
    let wmax = 0;
    const w = vr.kind === 'single' ? vr.max.w : vr.max.w.map((v, i) => (Math.abs(v) >= Math.abs(vr.min.w[i]) ? v : vr.min.w[i]));
    for (const v of w) wmax = Math.max(wmax, Math.abs(v));
    if (wmax > 0) {
      const amp = 28 * deformScale;
      const k = amp / wmax;
      const pxPerM = (sx.px(model.L) - sx.px(0)) / model.L;
      deformFactor = k / pxPerM;
      deformPath = Array.from(vr.grid.x, (x, i) => `${i ? 'L' : 'M'}${sx.px(x).toFixed(1)},${(beamY + w[i] * k).toFixed(1)}`).join('');
    }
  }

  const toX = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return sx.x(clientX - r.left);
  };
  const snapX = (x: number) => Math.min(model.L, Math.max(0, Math.round(x / snap) * snap));

  const startDrag = (e: React.PointerEvent, sel: NonNullable<Selection>, kind: DragKind, x: number, x1 = 0, x2 = 0) => {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { sel, kind, startPx: e.clientX, startX: x, startX1: x1, startX2: x2, moved: false, clientX: e.clientX, clientY: e.clientY };
    beginDrag();
  };

  const onMove = (e: React.PointerEvent) => {
    const x = toX(e.clientX);
    setCursor(x >= 0 && x <= model.L ? x : null);
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.startPx) > 3) d.moved = true;
    if (!d.moved) return;
    const dx = x - toX(d.startPx);
    dragUpdate((m) => {
      if (d.sel.kind === 'support') {
        const s = m.supports.find((k) => k.id === d.sel.id);
        if (s) s.x = snapX(d.startX + dx);
      } else if (d.sel.kind === 'hinge') {
        const h = m.hinges.find((k) => k.id === d.sel.id);
        if (h) h.x = snapX(d.startX + dx);
      } else if (d.sel.kind === 'load') {
        const l = m.loads.find((k) => k.id === d.sel.id);
        if (!l) return;
        if (l.kind !== 'dist') l.x = snapX(d.startX + dx);
        else if (d.kind === 'x1') l.x1 = Math.min(snapX(d.startX1 + dx), l.x2 - snap);
        else if (d.kind === 'x2') l.x2 = Math.max(snapX(d.startX2 + dx), l.x1 + snap);
        else {
          const len = d.startX2 - d.startX1;
          const nx1 = Math.min(Math.max(0, snapX(d.startX1 + dx)), m.L - len);
          l.x1 = nx1;
          l.x2 = Math.round((nx1 + len) * 1e9) / 1e9;
        }
      }
    });
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    endDrag();
    if (d && !d.moved) {
      select(d.sel);
      const r = svgRef.current!.getBoundingClientRect();
      setPopover({ x: e.clientX - r.left, y: e.clientY - r.top });
    }
  };

  const isSel = (kind: string, id: Id) => selection?.kind === kind && selection.id === id;
  const selected = selection
    ? selection.kind === 'support'
      ? model.supports.find((s) => s.id === selection.id)
      : selection.kind === 'hinge'
        ? model.hinges.find((h) => h.id === selection.id)
        : selection.kind === 'load'
          ? model.loads.find((l) => l.id === selection.id)
          : undefined
    : undefined;

  const hitProps = (sel: NonNullable<Selection>, x: number, kind: DragKind = 'x', x1 = 0, x2 = 0) => ({
    onPointerDown: (e: React.PointerEvent) => startDrag(e, sel, kind, x, x1, x2),
    style: { cursor: kind === 'x1' || kind === 'x2' ? 'ew-resize' : 'grab' } as React.CSSProperties,
    role: 'button',
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        select(sel);
        setPopover({ x: sx.px(x), y: beamY });
      }
    },
  });

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        width={sx.width}
        height={H}
        className="block touch-none select-none"
        data-testid="schematic"
        role="img"
        aria-label={fmt.t('schematic.label')}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => !drag.current && setCursor(null)}
      >
        {/* distributed loads first (background) */}
        {model.loads
          .filter((l) => l.kind === 'dist')
          .map((l) => {
            if (l.kind !== 'dist') return null;
            const lv = lvMap.get(l.id) ?? 0;
            const base = beamY - 6 - lv * LEVEL_H;
            const sel: NonNullable<Selection> = { kind: 'load', id: l.id };
            return (
              <g key={l.id} data-testid={`glyph-load-${l.id}`} className={cx(isSel('load', l.id) && 'drop-shadow-[0_0_3px_var(--cursor)]')}>
                <LoadGlyph l={l} sx={sx} beamY={beamY} lv={lv} qmax={qmax} fmt={fmt} dim={!activeFactor(model, view, l.caseId)} />
                <rect
                  x={sx.px(l.x1) + 5}
                  y={base - LEVEL_H + 6}
                  width={Math.max(0, sx.px(l.x2) - sx.px(l.x1) - 10)}
                  height={LEVEL_H - 6}
                  fill="transparent"
                  aria-label={`${loadKindLabel(fmt, l)} ${fmt.q(l.x1, 'length')} – ${fmt.q(l.x2, 'length')}`}
                  {...hitProps(sel, l.x1, 'body', l.x1, l.x2)}
                />
                <rect x={sx.px(l.x1) - 5} y={base - LEVEL_H + 6} width={10} height={LEVEL_H - 6} fill="transparent" {...hitProps(sel, l.x1, 'x1', l.x1, l.x2)} aria-label="x₁" />
                <rect x={sx.px(l.x2) - 5} y={base - LEVEL_H + 6} width={10} height={LEVEL_H - 6} fill="transparent" {...hitProps(sel, l.x2, 'x2', l.x1, l.x2)} aria-label="x₂" />
              </g>
            );
          })}

        {/* beam */}
        {[...model.segments]
          .sort((a, b) => a.x1 - b.x1)
          .map((s, i) => (
            <g key={s.id}>
              <line x1={sx.px(s.x1)} x2={sx.px(s.x2)} y1={beamY} y2={beamY} stroke="var(--beam)" strokeWidth={i % 2 ? 5 : 4} strokeLinecap="butt" />
              {i > 0 && <line x1={sx.px(s.x1)} x2={sx.px(s.x1)} y1={beamY - 7} y2={beamY + 7} stroke="var(--muted)" strokeWidth={1} />}
            </g>
          ))}

        {/* deformed shape */}
        {deformPath && (
          <g>
            <path d={deformPath} fill="none" stroke="var(--diag-w)" strokeWidth={1.6} strokeDasharray="5 3" />
            <text x={sx.width - sx.right} y={H - 6} fontSize="10" textAnchor="end" className="svg-text" style={{ fill: 'var(--muted)' }}>
              {fmt.t('schematic.deformed', { f: fmt.num(deformFactor, 0) })}
            </text>
          </g>
        )}

        {/* supports */}
        {model.supports.map((s) => (
          <g
            key={s.id}
            data-testid={`glyph-support-${s.id}`}
            aria-label={`${fmt.t(`support.types.${s.type}`)} x = ${fmt.q(s.x, 'length')}`}
            className={cx(isSel('support', s.id) && 'drop-shadow-[0_0_3px_var(--cursor)]')}
            {...hitProps({ kind: 'support', id: s.id }, s.x)}
          >
            <rect x={sx.px(s.x) - 14} y={beamY - 4} width={28} height={30} fill="transparent" />
            <SupportSymbol s={s} x={sx.px(s.x)} y={beamY} L={model.L} />
          </g>
        ))}

        {/* hinges */}
        {model.hinges.map((h) => (
          <g key={h.id} data-testid={`glyph-hinge-${h.id}`} aria-label={`${fmt.t('hinge.single')} x = ${fmt.q(h.x, 'length')}`} {...hitProps({ kind: 'hinge', id: h.id }, h.x)}>
            <circle cx={sx.px(h.x)} cy={beamY} r={9} fill="transparent" />
            <circle
              cx={sx.px(h.x)}
              cy={beamY}
              r={4.5}
              fill="var(--surface)"
              stroke={isSel('hinge', h.id) ? 'var(--cursor)' : 'var(--beam)'}
              strokeWidth={1.8}
            />
          </g>
        ))}

        {/* point loads and moments */}
        {model.loads
          .filter((l) => l.kind !== 'dist')
          .map((l) => {
            return (
              <g
                key={l.id}
                data-testid={`glyph-load-${l.id}`}
                aria-label={`${loadKindLabel(fmt, l)} x = ${fmt.q(l.x, 'length')}`}
                className={cx(isSel('load', l.id) && 'drop-shadow-[0_0_3px_var(--cursor)]')}
                {...hitProps({ kind: 'load', id: l.id }, l.x)}
              >
                <rect x={sx.px(l.x) - 10} y={beamY - 52} width={20} height={50} fill="transparent" />
                <LoadGlyph l={l} sx={sx} beamY={beamY} lv={0} qmax={qmax} fmt={fmt} dim={!activeFactor(model, view, l.caseId)} />
              </g>
            );
          })}

        {/* dimension chain */}
        <g stroke="var(--muted)" strokeWidth={0.8}>
          <line x1={sx.px(0)} x2={sx.px(model.L)} y1={beamY + 44} y2={beamY + 44} />
          {pts.map((x) => (
            <line key={x} x1={sx.px(x)} x2={sx.px(x)} y1={beamY + 39} y2={beamY + 49} />
          ))}
        </g>
        {pts.slice(1).map((x, i) => {
          const a = pts[i];
          const w = sx.px(x) - sx.px(a);
          if (w < 26) return null;
          return (
            <text key={x} x={(sx.px(a) + sx.px(x)) / 2} y={beamY + 41} fontSize="10" textAnchor="middle" className="svg-text num" style={{ fill: 'var(--muted)' }}>
              {fmt.num(fmt.val(x - a, 'length'), w < 50 ? 1 : 2)}
            </text>
          );
        })}
        <text x={(sx.px(0) + sx.px(model.L)) / 2} y={beamY + 64} fontSize="11" textAnchor="middle" className="svg-text num">
          L = {fmt.q(model.L, 'length')}
        </text>
        {/* axes legend */}
        <g transform={`translate(${8},${beamY - 22})`} fontSize="9" className="svg-text" style={{ fill: 'var(--muted)' }}>
          <path d="M0,0h18M18,0l-4,-3v6z" stroke="var(--muted)" fill="var(--muted)" />
          <text x={20} y={3}>
            x
          </text>
          <path d="M0,0v18M0,18l-3,-4h6z" stroke="var(--muted)" fill="var(--muted)" />
          <text x={3} y={26}>
            z
          </text>
        </g>

        {cursorX !== null && (
          <line x1={sx.px(cursorX)} x2={sx.px(cursorX)} y1={4} y2={H - 4} stroke="var(--cursor)" strokeWidth={1} strokeDasharray="3 3" pointerEvents="none" />
        )}
      </svg>
      <Popover.Root open={!!popover && !!selected} onOpenChange={(o) => !o && setPopover(null)}>
        <Popover.Anchor asChild>
          <div className="pointer-events-none absolute h-0 w-0" style={{ left: popover?.x ?? 0, top: popover?.y ?? 0 }} />
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            sideOffset={8}
            collisionPadding={8}
            className="no-print z-40 w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            data-testid="element-popover"
          >
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold">
                {selection?.kind === 'support' && selected && 'type' in selected && fmt.t(`support.types.${(selected as Support).type}`)}
                {selection?.kind === 'hinge' && fmt.t('hinge.single')}
                {selection?.kind === 'load' && selected && 'kind' in selected && loadKindLabel(fmt, selected as Load)}
              </h4>
              <Popover.Close className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={fmt.t('common.close')}>
                <IconX />
              </Popover.Close>
            </div>
            {selection?.kind === 'support' && selected && <SupportEditor s={selected as Support} />}
            {selection?.kind === 'hinge' && selected && <HingeEditor h={selected as { id: Id; x: number }} />}
            {selection?.kind === 'load' && selected && <LoadEditor l={selected as Load} />}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
