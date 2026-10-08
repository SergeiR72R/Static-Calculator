import { useMemo } from 'react';
import type { Field } from '../../core/postprocess';
import { valuesAt, type ViewResult } from '../../core/results';
import type { Analysis } from '../../core/analysis';
import type { Quantity } from '../../units/units';
import { useStore } from '../../state/store';
import { useFmt, useResults, type Fmt, type XScale } from '../hooks';

export interface DiagramSpec {
  field: Field;
  q: Quantity;
  color: string;
  /** +1: positive values drawn upwards */
  sign: 1 | -1;
}

export function diagramSpecs(momentSide: 'bottom' | 'top'): DiagramSpec[] {
  return [
    { field: 'N', q: 'force', color: 'var(--diag-N)', sign: 1 },
    { field: 'V', q: 'force', color: 'var(--diag-V)', sign: 1 },
    { field: 'M', q: 'moment', color: 'var(--diag-M)', sign: momentSide === 'bottom' ? -1 : 1 },
    { field: 'w', q: 'deflection', color: 'var(--diag-w)', sign: -1 },
    { field: 'sigma', q: 'stress', color: 'var(--diag-sigma)', sign: 1 },
  ];
}

/** Localized diagram title, e.g. "Querkraft V" / "Поперечная сила Q" */
export function fieldTitle(fmt: Fmt, f: Field): string {
  return `${fmt.t(`diag.${f}`)} ${fmt.t(`sym.${f}`)}`;
}

function nice(fmt: Fmt, v: number, q: Quantity) {
  return fmt.num(fmt.val(v, q));
}

export function Diagram({ spec, vr, an, sx, height = 108 }: { spec: DiagramSpec; vr: ViewResult; an: Analysis; sx: XScale; height?: number }) {
  const fmt = useFmt();
  const cursorX = useStore((s) => s.cursorX);
  const setCursor = useStore((s) => s.setCursor);
  const { field, sign, color, q } = spec;
  const g = vr.grid;
  const mx = vr.max[field];
  const mn = vr.min[field];
  const env = vr.kind === 'envelope' && field !== 'sigma';
  const pad = 16;
  const geo = useMemo(() => {
    let a = 0;
    let b = 0;
    for (let i = 0; i < mx.length; i++) {
      for (const v of [mx[i], mn[i]]) {
        if (!Number.isFinite(v)) continue;
        const p = sign * v;
        if (p < a) a = p;
        if (p > b) b = p;
      }
    }
    // numerical noise floor (display units)
    const tiny = fmt.val(Math.max(Math.abs(a), Math.abs(b)), q) < 1e-6;
    const k = tiny ? 0 : (height - 2 * pad) / (b - a);
    const y = (v: number) => (tiny ? height / 2 : pad + (b - sign * v) * k);
    const y0 = tiny ? height / 2 : y(0);
    const curve = (arr: Float64Array) => {
      let d = '';
      for (let i = 0; i < arr.length; i++) d += `${i ? 'L' : 'M'}${sx.px(g.x[i]).toFixed(1)},${y(arr[i]).toFixed(1)}`;
      return d;
    };
    const fill = (arr: Float64Array) => {
      const c = curve(arr);
      return `${c}L${sx.px(g.x[g.x.length - 1]).toFixed(1)},${y0.toFixed(1)}L${sx.px(g.x[0]).toFixed(1)},${y0.toFixed(1)}Z`;
    };
    return { y, y0, tiny, maxPath: curve(mx), minPath: curve(mn), maxFill: fill(mx), minFill: fill(mn) };
  }, [mx, mn, sign, height, g, sx, fmt, q]);

  // labels: extremes and values at supports, placed without overlap
  const labels = useMemo(() => {
    if (geo.tiny) return [];
    const ex = vr.extremes[field];
    const cands: { x: number; v: number; key: string; strong: boolean }[] = [];
    const scale = Math.max(Math.abs(ex.max.value) || 0, Math.abs(ex.min.value) || 0);
    const shown = (v: number) => Math.abs(fmt.val(v, q)) >= 0.5 * 10 ** -fmt.decimals;
    if (Number.isFinite(ex.max.value) && shown(ex.max.value)) cands.push({ x: ex.max.x, v: ex.max.value, key: 'max', strong: true });
    if (Number.isFinite(ex.min.value) && shown(ex.min.value) && Math.abs(ex.min.value - ex.max.value) > 1e-9 * scale)
      cands.push({ x: ex.min.x, v: ex.min.value, key: 'min', strong: true });
    if (field === 'V' || field === 'M' || field === 'N') {
      for (const s of an.model.supports) {
        const r = valuesAt(an, vr, s.x);
        const vals = vr.kind === 'single' ? [r.left[field], r.right[field]] : [r.left[field], r.leftMin?.[field] ?? r.left[field]];
        for (const [i, v] of vals.entries()) {
          if (Math.abs(v) < 0.02 * scale || !shown(v)) continue;
          if (cands.some((o) => Math.abs(o.x - s.x) < 1e-9 * an.model.L && Math.abs(o.v - v) < 1e-6 * scale)) continue;
          cands.push({ x: s.x, v, key: `s${s.id}${i}`, strong: false });
        }
      }
    }
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const out: { x: number; v: number; key: string; strong: boolean; tx: number; ty: number; anchor: 'start' | 'middle' | 'end'; text: string }[] = [];
    for (const c of cands) {
      const px = sx.px(c.x);
      const py = geo.y(c.v);
      const text = nice(fmt, c.v, q);
      const w = text.length * (c.strong ? 6.2 : 5.6);
      const below = py > geo.y0 + 0.5;
      const options: [number, number][] = [
        [0, below ? 11 : -4],
        [0, below ? -4 : 11],
        [w / 2 + 6, below ? 11 : -4],
        [-(w / 2 + 6), below ? 11 : -4],
        [w / 2 + 6, below ? -4 : 11],
        [-(w / 2 + 6), below ? -4 : 11],
      ];
      for (const [dx, dy] of options) {
        let tx = px + dx;
        tx = Math.min(Math.max(tx, sx.left + w / 2), sx.width - w / 2 - 2);
        const ty = Math.min(Math.max(py + dy, 10), height - 2);
        const box = { x0: tx - w / 2, x1: tx + w / 2, y0: ty - 9, y1: ty + 1 };
        if (placed.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) continue;
        placed.push(box);
        out.push({ ...c, tx, ty, anchor: 'middle', text });
        break;
      }
    }
    return out;
  }, [vr, field, an, geo, sx, fmt, q, height]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = sx.x(e.clientX - r.left);
    setCursor(x >= 0 && x <= an.model.L ? x : null);
  };

  return (
    <div className="print-avoid-break">
      <svg
        width={sx.width}
        height={height}
        className="block touch-none"
        role="img"
        aria-label={fieldTitle(fmt, field)}
        data-testid={`diagram-${field}`}
        onPointerMove={onMove}
        onPointerLeave={() => setCursor(null)}
      >
        <text x={6} y={12} fontSize="11" fontWeight={600} className="svg-text">
          {fmt.t(`sym.${field}`)}
        </text>
        <text x={6} y={24} fontSize="9.5" className="svg-text" style={{ fill: 'var(--muted)' }}>
          [{fmt.unit(q)}]
        </text>
        <line x1={sx.px(0)} x2={sx.px(an.model.L)} y1={geo.y0} y2={geo.y0} stroke="var(--axis)" strokeWidth={1} />
        {env ? (
          <>
            <path d={geo.maxFill} fill={color} fillOpacity={0.14} />
            <path d={geo.minFill} fill={color} fillOpacity={0.14} />
            <path d={geo.maxPath} fill="none" stroke={color} strokeWidth={1.6} />
            <path d={geo.minPath} fill="none" stroke={color} strokeWidth={1.6} strokeDasharray="5 2" />
          </>
        ) : (
          <>
            <path d={geo.maxFill} fill={color} fillOpacity={0.18} />
            <path d={geo.maxPath} fill="none" stroke={color} strokeWidth={1.7} data-testid={`diagram-path-${field}`} />
          </>
        )}
        {labels.map((l) => (
          <g key={l.key}>
            <circle cx={sx.px(l.x)} cy={geo.y(l.v)} r={l.strong ? 2.6 : 2} fill={color} />
            <text
              x={l.tx}
              y={l.ty}
              fontSize={l.strong ? 10.5 : 9.5}
              fontWeight={l.strong ? 600 : 400}
              textAnchor={l.anchor}
              className="svg-text num"
              data-testid={l.strong ? `extreme-${field}-${l.key}` : undefined}
            >
              {l.text}
            </text>
          </g>
        ))}
        {cursorX !== null && (
          <line x1={sx.px(cursorX)} x2={sx.px(cursorX)} y1={0} y2={height} stroke="var(--cursor)" strokeWidth={1} strokeDasharray="3 3" pointerEvents="none" />
        )}
      </svg>
    </div>
  );
}

export function DiagramStack({ sx }: { sx: XScale }) {
  const { an, vr } = useResults();
  const momentSide = useStore((s) => s.momentSide);
  if (!vr) return null;
  return (
    <div className="divide-y divide-slate-200 dark:divide-slate-800">
      {diagramSpecs(momentSide).map((s) => (
        <Diagram key={s.field} spec={s} vr={vr} an={an} sx={sx} />
      ))}
    </div>
  );
}

/** Values of all diagrams at the cursor position (both values at jumps) */
export function CursorReadout() {
  const fmt = useFmt();
  const { an, vr } = useResults();
  const cursorX = useStore((s) => s.cursorX);
  const momentSide = useStore((s) => s.momentSide);
  if (!vr || cursorX === null) {
    return <div className="h-12 px-2 py-1 text-xs text-slate-500 dark:text-slate-400">{fmt.t('results.cursorHint')}</div>;
  }
  const r = valuesAt(an, vr, cursorX);
  const specs = diagramSpecs(momentSide);
  return (
    <div className="flex h-12 flex-wrap items-center gap-x-4 gap-y-0.5 px-2 py-1 text-xs" data-testid="cursor-readout">
      <span className="num font-semibold">x = {fmt.q(cursorX, 'length')}</span>
      {specs.map((s) => {
        const a = r.left[s.field];
        const b = r.right[s.field];
        const scale = Math.max(Math.abs(a), Math.abs(b), 1e-30);
        const jump = Math.abs(a - b) > 1e-7 * scale;
        let text: string;
        if (vr.kind === 'envelope' && r.leftMin && s.field !== 'sigma') {
          text = `${nice(fmt, r.leftMin[s.field], s.q)} … ${nice(fmt, a, s.q)}`;
        } else text = jump ? `${nice(fmt, a, s.q)} | ${nice(fmt, b, s.q)}` : nice(fmt, a, s.q);
        return (
          <span key={s.field} className="num">
            <span style={{ color: s.color }} className="font-semibold">
              {fmt.t(`sym.${s.field}`)}
            </span>{' '}
            = {text} {fmt.unit(s.q)}
          </span>
        );
      })}
    </div>
  );
}
