import { useId, type ReactNode } from 'react';
import { KIND_COLOR } from '../../scaffold/catalog';
import type { CatalogPart, DesignKind } from '../../designer/catalog';

/** colour of a designer part kind (as in the 3D view of the scaffold mode) */
export const DESIGN_COLOR: Record<DesignKind, string> = {
  standard: KIND_COLOR.standard,
  base: KIND_COLOR.base,
  jack: KIND_COLOR.jack,
  ledger: KIND_COLOR.ledger,
  bracket: KIND_COLOR.bracket,
  diagonal: KIND_COLOR.diagonal,
  tube: KIND_COLOR.tube,
  spigot: '#0891b2',
};

const EDGE = '#475569';

/**
 * Picture of a catalogue part: galvanised tubes with their light, rosettes, wedge heads, the thread
 * and wing nut of a base jack, brackets with their strut and spigot, couplers. Drawn by the program
 * (no photos of PERI), proportions of the part kind; standards with their number of rosettes.
 */
export function PartIcon({ part, size = 48 }: { part: CatalogPart; size?: number }) {
  const uid = useId().replace(/:/g, '');
  const gv = `gv${uid}`;
  const gh = `gh${uid}`;
  const gr = `gr${uid}`;
  const gp = `gp${uid}`;
  const th = `th${uid}`;
  // a vertical tube, a horizontal one, a rosette, a wedge head (pointing in x by dir)
  const tubeV = (x: number, y0: number, y1: number, w = 6) => <rect x={x - w / 2} y={y0} width={w} height={y1 - y0} rx={1} fill={`url(#${gv})`} stroke={EDGE} strokeWidth={0.5} />;
  const tubeH = (x0: number, x1: number, y: number, h = 5) => <rect x={x0} y={y - h / 2} width={x1 - x0} height={h} rx={1} fill={`url(#${gh})`} stroke={EDGE} strokeWidth={0.5} />;
  const rosette = (x: number, y: number, k: number) => (
    <g key={k}>
      <ellipse cx={x} cy={y + 0.6} rx={9} ry={2.6} fill="#64748b" />
      <ellipse cx={x} cy={y} rx={9} ry={2.4} fill={`url(#${gr})`} stroke={EDGE} strokeWidth={0.4} />
      {[-6, -2.2, 2.2, 6].map((o) => (
        <ellipse key={o} cx={x + o} cy={y + (Math.abs(o) > 4 ? -0.2 : 0.5)} rx={0.9} ry={0.55} fill="#334155" />
      ))}
    </g>
  );
  const head = (x: number, y: number, dir: 1 | -1) => (
    <g>
      <path d={`M ${x} ${y - 4} L ${x + dir * 6} ${y - 3} L ${x + dir * 6} ${y + 3} L ${x} ${y + 4} Z`} fill="#94a3b8" stroke={EDGE} strokeWidth={0.5} />
      <rect x={x + dir * 2 - 1} y={y - 7} width={2} height={14} rx={0.6} fill="#cbd5e1" stroke={EDGE} strokeWidth={0.5} />
    </g>
  );
  const coupler = (x: number, y: number) => (
    <g>
      <rect x={x - 4} y={y - 5} width={8} height={10} rx={2} fill="#a8a29e" stroke="#57534e" strokeWidth={0.6} />
      <circle cx={x} cy={y} r={1.6} fill="#57534e" />
      <rect x={x + 3.5} y={y - 1} width={3} height={2} fill="#78716c" />
    </g>
  );

  let body: ReactNode;
  switch (part.kind) {
    case 'standard': {
      const n = Math.max(1, Math.min(part.rosettes?.length ?? 1, 8));
      const top = part.spigot ? 9 : 4;
      const bot = 60;
      const pitch = (bot - top - 6) / n;
      body = (
        <>
          {part.spigot && (
            <>
              <rect x={30} y={3} width={4} height={8} rx={0.8} fill={`url(#${gv})`} stroke={EDGE} strokeWidth={0.5} />
              <circle cx={32} cy={6} r={0.8} fill="#334155" />
            </>
          )}
          {tubeV(32, top, bot)}
          {!part.spigot && <rect x={28.5} y={3} width={7} height={2} rx={0.5} fill="#94a3b8" stroke={EDGE} strokeWidth={0.4} />}
          {Array.from({ length: n }, (_, k) => rosette(32, bot - 6 - (k + 0.5) * pitch + pitch / 2 - 1, k))}
        </>
      );
      break;
    }
    case 'base':
      body = (
        <>
          <rect x={30} y={10} width={4} height={10} rx={0.8} fill={`url(#${gv})`} stroke={EDGE} strokeWidth={0.5} />
          {tubeV(32, 18, 54, 7)}
          {rosette(32, 34, 0)}
          <rect x={27} y={52} width={10} height={5} rx={1} fill="#94a3b8" stroke={EDGE} strokeWidth={0.5} />
        </>
      );
      break;
    case 'jack': {
      const long = part.L > 0.6;
      const y0 = long ? 4 : 12;
      body = (
        <>
          <rect x={29} y={y0} width={6} height={50 - y0} fill={`url(#${th})`} stroke={EDGE} strokeWidth={0.5} />
          {/* wing nut */}
          <g transform={`translate(0 ${long ? 0 : 6})`}>
            <rect x={24} y={22} width={16} height={6} rx={1.5} fill="#78716c" stroke="#44403c" strokeWidth={0.5} />
            <path d="M 24 24 L 16 21 L 16 27 L 24 26 Z M 40 24 L 48 21 L 48 27 L 40 26 Z" fill="#a8a29e" stroke="#44403c" strokeWidth={0.5} />
          </g>
          {/* base plate in perspective */}
          <path d="M 14 54 L 50 54 L 56 60 L 8 60 Z" fill={`url(#${gp})`} stroke={EDGE} strokeWidth={0.6} />
          <rect x={28} y={51} width={8} height={3.5} fill="#94a3b8" stroke={EDGE} strokeWidth={0.4} />
        </>
      );
      break;
    }
    case 'ledger': {
      const reinforced = /UHV/.test(part.name);
      const y = reinforced ? 22 : 32;
      body = (
        <>
          {tubeH(9, 55, y, 6)}
          {head(9, y, -1)}
          {head(55, y, 1)}
          {reinforced && (
            <>
              {tubeH(14, 50, 44, 4)}
              {[18, 32, 46].map((x) => (
                <line key={x} x1={x} y1={y + 3} x2={x} y2={42} stroke="#94a3b8" strokeWidth={2.4} />
              ))}
              <line x1={18} y1={42} x2={32} y2={y + 3} stroke="#94a3b8" strokeWidth={2} />
              <line x1={46} y1={42} x2={32} y2={y + 3} stroke="#94a3b8" strokeWidth={2} />
            </>
          )}
        </>
      );
      break;
    }
    case 'bracket': {
      const short = part.L < 0.4;
      const x1 = short ? 34 : 54;
      body = (
        <>
          {tubeV(8, 6, 58, 6)}
          {rosette(8, 24, 0)}
          {tubeH(14, x1, 22, 5)}
          {head(14, 22, -1)}
          {!short && (
            <line x1={11} y1={50} x2={42} y2={24} stroke="#94a3b8" strokeWidth={4} strokeLinecap="round" />
          )}
          {part.bracketSpigot && (
            <>
              <rect x={x1 - 2} y={8} width={4} height={14} rx={0.8} fill={`url(#${gv})`} stroke={EDGE} strokeWidth={0.5} />
              <circle cx={x1} cy={12} r={0.8} fill="#334155" />
            </>
          )}
        </>
      );
      break;
    }
    case 'diagonal': {
      const r = part.H && part.L ? Math.atan2(part.H, part.L) : Math.PI / 4;
      const deg = (-r * 180) / Math.PI;
      body = (
        <g transform={`rotate(${deg} 32 32)`}>
          {tubeH(8, 56, 32, 5)}
          {head(8, 32, -1)}
          {head(56, 32, 1)}
        </g>
      );
      break;
    }
    case 'tube':
      body = (
        <>
          {tubeV(14, 4, 60, 6)}
          {tubeV(50, 4, 60, 6)}
          {tubeH(6, 58, 30, 5)}
          {coupler(14, 30)}
          {coupler(50, 30)}
        </>
      );
      break;
    case 'spigot':
      body = (
        <>
          {tubeH(6, 58, 44, 6)}
          <path d="M 24 38 L 40 38 L 40 50 L 36 50 L 36 42 L 28 42 L 28 50 L 24 50 Z" fill="#94a3b8" stroke={EDGE} strokeWidth={0.6} />
          <rect x={30} y={12} width={4} height={27} rx={0.8} fill={`url(#${gv})`} stroke={EDGE} strokeWidth={0.5} />
          <circle cx={32} cy={18} r={0.8} fill="#334155" />
          {/^UHA/.test(part.name) && <rect x={20} y={46} width={24} height={8} rx={1} fill="#cbd5e1" stroke={EDGE} strokeWidth={0.5} />}
        </>
      );
      break;
  }

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="shrink-0 rounded bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900" aria-hidden data-testid="designer-icon">
      <defs>
        <linearGradient id={gv} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#7c8794" />
          <stop offset="0.35" stopColor="#eef2f6" />
          <stop offset="0.6" stopColor="#c3cad3" />
          <stop offset="1" stopColor="#6b7480" />
        </linearGradient>
        <linearGradient id={gh} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#7c8794" />
          <stop offset="0.35" stopColor="#eef2f6" />
          <stop offset="0.6" stopColor="#c3cad3" />
          <stop offset="1" stopColor="#6b7480" />
        </linearGradient>
        <linearGradient id={gr} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f1f5f9" />
          <stop offset="1" stopColor="#94a3b8" />
        </linearGradient>
        <linearGradient id={gp} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#e2e8f0" />
          <stop offset="1" stopColor="#64748b" />
        </linearGradient>
        <pattern id={th} width="6" height="2.2" patternUnits="userSpaceOnUse">
          <rect width="6" height="2.2" fill="#b6bec8" />
          <line x1="0" y1="2.2" x2="6" y2="0.4" stroke="#6b7480" strokeWidth="0.7" />
        </pattern>
      </defs>
      {body}
    </svg>
  );
}
