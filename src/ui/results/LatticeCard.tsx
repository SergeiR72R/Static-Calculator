import { useMemo, useState } from 'react';
import { analyzeLattice, latticeOf, latticeView, type LatticeAnalysis, type LatticeViewResult } from '../../core/lattice';
import { MEMBER_SAMPLES } from '../../core/frame2d';
import type { LatticeMember } from '../../sections/lattice';
import { useStore } from '../../state/store';
import { Card, cx } from '../common';
import { useFmt, useResults, type XScale } from '../hooks';
import { etaColor } from './LatticeDiagram';

export type LatticeField = 'N' | 'M' | 'sigma' | 'eta';
const FIELDS: LatticeField[] = ['N', 'M', 'sigma', 'eta'];

const TENSION = '#dc2626';
const COMPRESSION = '#2563eb';

/** Values of a member along its length (k = 0 … MEMBER_SAMPLES−1): [max, min] */
function memberValues(la: LatticeAnalysis, r: LatticeViewResult, k: number, field: LatticeField): [number[], number[]] {
  const m = la.model.members[k];
  const S = MEMBER_SAMPLES;
  const idx = Array.from({ length: S }, (_, s) => k * S + s);
  if (field === 'N') return [idx.map(() => r.Nmax[k]), idx.map(() => r.Nmin[k])];
  if (field === 'M') return [idx.map((i) => r.Mmax[i]), idx.map((i) => r.Mmin[i])];
  // σ at the extreme fibre: N/A ± |M|/W
  const A = m.sec.A;
  const W = m.sec.Wel;
  const sig = (N: number, M: number, sgn: 1 | -1) => N / A + (sgn * Math.abs(M)) / W;
  const mx = idx.map((i) => Math.max(sig(r.Nmax[k], r.Mmax[i], 1), sig(r.Nmax[k], r.Mmin[i], 1)));
  const mn = idx.map((i) => Math.min(sig(r.Nmin[k], r.Mmax[i], -1), sig(r.Nmin[k], r.Mmin[i], -1)));
  return [mx, mn];
}

/**
 * Lattice girder as a 2D member model: member force diagrams (N, M, σ) or utilisation η on every
 * chord, diagonal and vertical, support reactions at the bearings, standards with couplers.
 */
export function LatticeCard({ sx }: { sx: XScale }) {
  const fmt = useFmt();
  const { an, checks } = useResults();
  const view = useStore((s) => s.view);
  const cursorX = useStore((s) => s.cursorX);
  const setCursor = useStore((s) => s.setCursor);
  const [field, setField] = useState<LatticeField>('N');
  const [hover, setHover] = useState<number | null>(null);
  const la = useMemo(() => (an.ok && latticeOf(an.model) ? analyzeLattice(an) : null), [an]);
  const r = useMemo(() => (la && !la.error ? latticeView(an, la, view.type === 'envelope' ? { type: 'envelope' } : view) : null), [an, la, view]);
  if (!la || la.error || !r) return null;
  const lm = la.model;
  const peri = checks?.peri.find((p) => p.method === 'lattice');
  const etas = peri?.lattice?.members.map((m) => m.eta) ?? [];

  // geometry: true scale in x, the height at least 110 px
  const pxPerM = (sx.px(lm.L) - sx.px(0)) / lm.L;
  const hPx = Math.max(150, Math.min(240, lm.h * pxPerM));
  const top = 86;
  const X = (x: number) => sx.px(x);
  const Z = (z: number) => top + ((lm.h - z) / lm.h) * hPx;
  const H = top + hPx + 110;

  // values and scale of the diagrams
  const vals = lm.members.map((_, k) => (field === 'eta' ? null : memberValues(la, r, k, field)));
  let vmax = 0;
  for (const v of vals) if (v) for (const a of [...v[0], ...v[1]]) vmax = Math.max(vmax, Math.abs(a));
  // chords: 24 px; web members: limited by the spacing of the web members so that the bands do not overlap
  const webX = lm.members.filter((m) => !(m.role === 'top' || m.role === 'bottom')).map((m) => X((lm.nodes[m.i].x + lm.nodes[m.j].x) / 2)).sort((a, b) => a - b);
  let gap = Infinity;
  for (let i = 1; i < webX.length; i++) if (webX[i] - webX[i - 1] > 1) gap = Math.min(gap, webX[i] - webX[i - 1]);
  const amp = 24;
  const ampWeb = Math.max(5, Math.min(amp, 0.42 * (Number.isFinite(gap) ? gap : 40)));
  let vChord = 0;
  let vWeb = 0;
  lm.members.forEach((m, k) => {
    const v = vals[k];
    if (!v) return;
    const a = Math.max(...v[0].map(Math.abs), ...v[1].map(Math.abs));
    if (m.role === 'top' || m.role === 'bottom') vChord = Math.max(vChord, a);
    else vWeb = Math.max(vWeb, a);
  });
  // one common scale (values comparable): the tighter of both limits
  const scale = vmax > 0 ? Math.min(vChord > 0 ? amp / vChord : Infinity, vWeb > 0 ? ampWeb / vWeb : Infinity, amp / vmax) : 0;
  const q = field === 'N' ? 'force' : field === 'M' ? 'moment' : 'stress';
  const unitVal = (v: number) => fmt.q(v, q);

  /** polygon of a member diagram: offsets perpendicular to the member on screen */
  const diagram = (m: LatticeMember, vs: number[]) => {
    const a = lm.nodes[m.i];
    const b = lm.nodes[m.j];
    const x1 = X(a.x);
    const y1 = Z(a.z);
    const x2 = X(b.x);
    const y2 = Z(b.z);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    // normal pointing "up / left" of the member direction
    let nx = (y2 - y1) / len;
    let ny = -(x2 - x1) / len;
    if (ny > 0 || (Math.abs(ny) < 1e-9 && nx > 0)) {
      nx = -nx;
      ny = -ny;
    }
    // M: positive (sagging) towards the bottom fibre; N, σ on the bottom chord: outwards (down)
    if (field === 'M' || m.role === 'bottom') {
      nx = -nx;
      ny = -ny;
    }
    const pts: [number, number][] = [[x1, y1]];
    vs.forEach((v, s) => {
      const t = s / (vs.length - 1);
      pts.push([x1 + (x2 - x1) * t + nx * v * scale, y1 + (y2 - y1) * t + ny * v * scale]);
    });
    pts.push([x2, y2]);
    return pts.map((p) => p.map((c) => c.toFixed(1)).join(',')).join(' ');
  };

  const sign = (v: number) => (v >= 0 ? TENSION : COMPRESSION);
  // labels: every web member, chord extremes
  const labels: { x: number; y: number; text: string; color: string }[] = [];
  if (field !== 'eta') {
    const chordBest: Record<string, { k: number; v: number }> = {};
    lm.members.forEach((m, k) => {
      const v = vals[k]!;
      const ext = [...v[0], ...v[1]].reduce((p, c) => (Math.abs(c) > Math.abs(p) ? c : p), 0);
      if (Math.abs(ext) < vmax * 1e-3) return;
      const a = lm.nodes[m.i];
      const b = lm.nodes[m.j];
      if (m.role === 'top' || m.role === 'bottom') {
        for (const key of [`${m.role}+`, `${m.role}-`]) {
          const vv = key.endsWith('+') ? Math.max(...v[0]) : Math.min(...v[1]);
          const cur = chordBest[key];
          if ((key.endsWith('+') ? vv > 0 : vv < 0) && (!cur || Math.abs(vv) > Math.abs(cur.v))) chordBest[key] = { k, v: vv };
        }
      } else if (field !== 'M') {
        const text = r.kind === 'envelope' && Math.abs(r.Nmax[k] - r.Nmin[k]) > vmax * 1e-3 ? `${fmt.num(fmt.val(v[1][0], q), 1)}…${fmt.num(fmt.val(v[0][0], q), 1)}` : fmt.num(fmt.val(ext, q), 1);
        labels.push({ x: (X(a.x) + X(b.x)) / 2, y: (Z(a.z) + Z(b.z)) / 2, text, color: sign(ext) });
      }
    });
    for (const [key, { k, v }] of Object.entries(chordBest)) {
      const m = lm.members[k];
      const a = lm.nodes[m.i];
      const b = lm.nodes[m.j];
      const yy = m.role === 'top' ? Z(lm.h) - amp - 6 : Z(0) + amp + 14;
      labels.push({ x: (X(a.x) + X(b.x)) / 2, y: key.startsWith('top') ? yy - (key.endsWith('-') ? 0 : 10) : yy + (key.endsWith('-') ? 10 : 0), text: unitVal(v), color: sign(v) });
    }
  }

  // labels without overlaps: largest values first
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const shown = labels
    .map((l) => ({ ...l, abs: Math.abs(Number(l.text.replace(/[^0-9,.−-]/g, '').replace('−', '-').replace(',', '.').split('…').pop())) || 0 }))
    .sort((a, b) => b.abs - a.abs)
    .filter((l) => {
      const w = l.text.length * 5.2 + 4;
      const box = { x0: l.x - w / 2, x1: l.x + w / 2, y0: l.y - 9, y1: l.y + 2 };
      if (placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) return false;
      placed.push(box);
      return true;
    });
  const hm = hover !== null ? lm.members[hover] : null;
  const supports = la.supports;
  const conns = lm.members.filter((m) => m.role === 'conn').map((m) => lm.nodes[m.i].x);

  return (
    <Card
      testId="lattice-card"
      title={`${fmt.t('lattice.title')}: ${lm.name}`}
      actions={
        <div className="flex gap-1 text-xs" role="group" aria-label={fmt.t('lattice.field')}>
          {FIELDS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={field === f}
              data-testid={`lattice-field-${f}`}
              onClick={() => setField(f)}
              className={cx('rounded px-2 py-1', field === f ? 'bg-accent-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200')}
            >
              {fmt.t(`lattice.fields.${f}`)}
            </button>
          ))}
        </div>
      }
    >
      <div className="-mx-3 overflow-hidden" dir="ltr">
        <svg
          width={sx.width}
          height={H}
          className="block select-none"
          data-testid="lattice-2d"
          onPointerMove={(e) => {
            const rc = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const x = sx.x(e.clientX - rc.left);
            setCursor(x >= 0 && x <= lm.L ? x : null);
          }}
          onPointerLeave={() => {
            setCursor(null);
            setHover(null);
          }}
        >
          {/* standards (supports) with couplers / ledger heads */}
          {supports.map((s) => (
            <g key={s.supportId} data-testid={`lattice-standard-${s.supportId}`}>
              <line x1={X(s.x)} x2={X(s.x)} y1={Z(lm.h) - 30} y2={Z(0) + 30} stroke="var(--muted)" strokeWidth={6} strokeOpacity={0.35} />
              {[0, lm.h].map((z) => (
                <rect key={z} x={X(s.x) - 5} y={Z(z) - 5} width={10} height={10} rx={2} fill={lm.bearing === 'head' ? '#0ea5e9' : '#f59e0b'} stroke="#334155" strokeWidth={0.8} />
              ))}
            </g>
          ))}
          {/* diagrams */}
          {field !== 'eta' &&
            lm.members.map((m, k) => {
              const v = vals[k]!;
              const both = r.kind === 'envelope';
              const ext = [...v[0], ...v[1]].reduce((p, c) => (Math.abs(c) > Math.abs(p) ? c : p), 0);
              return (
                <g key={`d${k}`} opacity={hover === null || hover === k ? 1 : 0.35}>
                  <polygon points={diagram(m, v[0])} fill={field === 'M' ? 'var(--diag-m, #16a34a)' : sign(both ? Math.max(...v[0]) : ext)} fillOpacity={0.25} stroke={field === 'M' ? 'var(--diag-m, #16a34a)' : sign(both ? Math.max(...v[0]) : ext)} strokeWidth={0.8} />
                  {both && <polygon points={diagram(m, v[1])} fill={field === 'M' ? 'var(--diag-m, #16a34a)' : sign(Math.min(...v[1]))} fillOpacity={0.18} stroke={field === 'M' ? 'var(--diag-m, #16a34a)' : sign(Math.min(...v[1]))} strokeWidth={0.6} strokeDasharray="3 2" />}
                </g>
              );
            })}
          {/* members */}
          {lm.members.map((m, k) => {
            const a = lm.nodes[m.i];
            const b = lm.nodes[m.j];
            const chord = m.role === 'top' || m.role === 'bottom';
            const color = field === 'eta' ? etaColor(etas[k] ?? 0) : 'var(--beam)';
            return (
              <line
                key={`m${k}`}
                x1={X(a.x)}
                y1={Z(a.z)}
                x2={X(b.x)}
                y2={Z(b.z)}
                stroke={color}
                strokeWidth={field === 'eta' ? (chord ? 4 : 3) : chord ? 2.4 : 1.6}
                strokeLinecap="round"
                onPointerEnter={() => setHover(k)}
                data-testid={`lattice-2d-member-${k}`}
              />
            );
          })}
          {/* hinges of the pin-ended members */}
          {lm.members
            .filter((m) => m.hinged)
            .flatMap((m) => [m.i, m.j])
            .filter((n, i, arr) => arr.indexOf(n) === i)
            .map((n) => (
              <circle key={`h${n}`} cx={X(lm.nodes[n].x)} cy={Z(lm.nodes[n].z)} r={1.8} fill="var(--surface, #fff)" stroke="var(--beam)" strokeWidth={0.8} />
            ))}
          {shown.map((l, i) => (
            <text key={`l${i}`} x={l.x} y={l.y} fontSize="9" textAnchor="middle" className="svg-text num" style={{ fill: l.color, paintOrder: 'stroke', stroke: 'var(--surface, #fff)', strokeWidth: 3 }}>
              {l.text}
            </text>
          ))}
          {/* support reactions (global axes, R_z ↓ +): arrows towards the girder for compression */}
          {supports.map((s, si) =>
            s.nodes.map((n, c) => {
              // close supports: staggered rows
              const row = supports.slice(0, si).filter((p) => Math.abs(X(p.x) - X(s.x)) < 130).length;
              const Rup = r.kind === 'single' ? r.Rmax[3 * n + 1] : Math.abs(r.Rmax[3 * n + 1]) >= Math.abs(r.Rmin[3 * n + 1]) ? r.Rmax[3 * n + 1] : r.Rmin[3 * n + 1];
              if (Math.abs(Rup) < 1e-6) return null;
              const y0 = c === 0 ? Z(0) + 58 + row * 11 : Z(lm.h) - 50 - row * 11;
              const up = Rup > 0;
              const left = X(s.x) < sx.width / 2;
              const xA = X(s.x) + (left ? -10 : 10);
              const txt = r.kind === 'envelope' ? `${fmt.num(fmt.val(-r.Rmax[3 * n + 1], 'force'), 1)}…${fmt.q(-r.Rmin[3 * n + 1], 'force')}` : fmt.q(-Rup, 'force');
              return (
                <g key={`R${s.supportId}${c}`} data-testid={`lattice-reaction-${s.supportId}-${c}`}>
                  <line x1={xA} x2={xA} y1={y0 + (up ? 12 : -12)} y2={y0 - (up ? 12 : -12)} stroke="#7c3aed" strokeWidth={1.6} />
                  <path d={up ? `M ${xA} ${y0 - 14} l -4 6 h 8 z` : `M ${xA} ${y0 + 14} l -4 -6 h 8 z`} fill="#7c3aed" />
                  <text x={xA + (left ? 5 : -5)} y={c === 0 ? y0 + 24 : y0 - 16} fontSize="9" textAnchor={left ? 'start' : 'end'} className="svg-text num" style={{ fill: '#7c3aed' }}>
                    R_z = {txt}
                  </text>
                </g>
              );
            }),
          )}
          {/* connectors ULS Flex */}
          {conns.map((x) => (
            <text key={`c${x}`} x={X(x)} y={Z(0) + 50} fontSize="8" textAnchor="middle" className="svg-text" style={{ fill: 'var(--muted)' }}>
              ▲
            </text>
          ))}
          {cursorX !== null && <line x1={X(cursorX)} x2={X(cursorX)} y1={10} y2={H - 10} stroke="var(--cursor)" strokeWidth={1} strokeDasharray="3 3" />}
        </svg>
      </div>
      <div className="mt-1 min-h-[1.2rem] text-[11px] tabular-nums text-slate-600 dark:text-slate-300" data-testid="lattice-2d-hover">
        {hm && hover !== null ? (
          <>
            <span className="font-sans">{fmt.t(`kpi.lattice.${hm.role}`)} </span>
            <bdi dir="ltr">
              {`${hm.sec.name} · x = ${fmt.q(lm.nodes[hm.i].x, 'length')} … ${fmt.q(lm.nodes[hm.j].x, 'length')} · N = ${
                r.kind === 'envelope' ? `${fmt.q(r.Nmin[hover], 'force')} … ${fmt.q(r.Nmax[hover], 'force')}` : fmt.q(r.Nmax[hover], 'force')
              }${hm.hinged ? '' : ` · |M|max = ${fmt.q(Math.max(...Array.from({ length: MEMBER_SAMPLES }, (_, s) => Math.max(Math.abs(r.Mmax[hover * MEMBER_SAMPLES + s]), Math.abs(r.Mmin[hover * MEMBER_SAMPLES + s])))), 'moment')}`}${
                etas[hover] !== undefined ? ` · η = ${fmt.num(etas[hover] * 100, 1)} %` : ''
              }`}
            </bdi>
          </>
        ) : (
          <span className="text-slate-500">{fmt.t('lattice.hint')}</span>
        )}
      </div>
      <p className="text-[10px] text-slate-500">
        {fmt.t(field === 'eta' ? 'lattice.legendEta' : field === 'M' ? 'lattice.legendM' : 'lattice.legendN')} {fmt.t(lm.bearing === 'head' ? 'lattice.legendHead' : 'lattice.legendCoupler')}
      </p>
    </Card>
  );
}
