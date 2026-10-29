import { useState } from 'react';
import type { LatticeCheckView } from '../../core/checks';
import { useFmt } from '../hooks';

/** colour of a utilisation (green → amber → red) */
export function etaColor(eta: number): string {
  if (!(eta >= 0)) return '#94a3b8';
  if (eta > 1) return '#dc2626';
  if (eta > 0.9) return '#f97316';
  if (eta > 0.7) return '#eab308';
  return '#16a34a';
}

/**
 * Member model of a lattice girder: members coloured by their utilisation η (all ULS combinations),
 * supports, lateral restraints of the top chord; hover: section, N, η.
 */
export function LatticeDiagram({ v }: { v: LatticeCheckView }) {
  const fmt = useFmt();
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const pad = 14;
  // vertical exaggeration so that short girders stay readable
  const sx = (W - 2 * pad) / Math.max(v.L, 1e-6);
  const sz = Math.min(sx * 1.6, 70 / Math.max(v.h, 1e-6));
  const H = v.h * sz + 2 * pad + 16;
  const X = (x: number) => pad + x * sx;
  const Z = (z: number) => pad + (v.h - z) * sz;
  const hm = hover !== null ? v.members[hover] : null;
  return (
    <div className="mt-1" data-testid="lattice-diagram" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={v.name}>
        {/* lateral restraints of the top chord */}
        {v.restraints.map((x, k) => (
          <line key={`r${k}`} x1={X(x)} x2={X(x)} y1={Z(v.h) - 9} y2={Z(v.h) - 3} stroke="#64748b" strokeWidth={1.5} />
        ))}
        {v.members.map((m, k) => {
          const a = v.nodes[m.i];
          const b = v.nodes[m.j];
          return (
            <line
              key={k}
              x1={X(a.x)}
              y1={Z(a.z)}
              x2={X(b.x)}
              y2={Z(b.z)}
              stroke={etaColor(m.eta)}
              strokeWidth={m.role === 'top' || m.role === 'bottom' ? 3 : 2}
              strokeLinecap="round"
              onMouseEnter={() => setHover(k)}
              onMouseLeave={() => setHover(null)}
              data-testid={`lattice-member-${k}`}
            >
              <title>{`${m.section}: N = ${fmt.q(m.N, 'force')}, η = ${fmt.num(m.eta * 100, 1)} %`}</title>
            </line>
          );
        })}
        {v.supports.map((x, k) => (
          <g key={`s${k}`}>
            <path d={`M ${X(x)} ${Z(0) + 3} l -6 9 h 12 z`} fill="none" stroke="#334155" strokeWidth={1.2} />
            <path d={`M ${X(x)} ${Z(v.h) + 3} l -4 6 h 8 z`} fill="none" stroke="#334155" strokeWidth={1} />
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
        {[
          ['≤ 70 %', 0.5],
          ['≤ 90 %', 0.8],
          ['≤ 100 %', 0.95],
          ['> 100 %', 1.1],
        ].map(([l, e]) => (
          <span key={l as string} className="inline-flex items-center gap-1">
            <span className="inline-block h-1.5 w-4 rounded" style={{ background: etaColor(e as number) }} />
            <bdi dir="ltr">{l}</bdi>
          </span>
        ))}
        <span>{fmt.t('kpi.lattice.restraints')}</span>
      </div>
      {hm && (
        <div className="text-[11px] tabular-nums text-slate-600 dark:text-slate-300" data-testid="lattice-hover">
          {fmt.t(`kpi.lattice.${hm.role}`)}: <bdi dir="ltr">{`${hm.section} · N = ${fmt.q(hm.N, 'force')} · η = ${fmt.num(hm.eta * 100, 1)} %`}</bdi>
        </div>
      )}
    </div>
  );
}
