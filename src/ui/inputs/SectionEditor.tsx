import type { CatalogFamily, Material, MaterialPreset, SectionDef, SectionKind } from '../../core/types';
import { CATALOG, CATALOG_FAMILIES } from '../../sections/catalog';
import { sectionOutline, sectionProps, type SectionProps } from '../../sections/properties';
import { MATERIAL_ORDER, designStrength, materialPreset } from '../../sections/materials';
import { NumberField, SelectField } from '../common';
import { useFmt } from '../hooks';

const KINDS: SectionKind[] = ['catalog', 'rect', 'circle', 'tube', 'box', 'weldedI', 'tee', 'channel', 'manual'];

export function defaultSectionOfKind(kind: SectionKind): SectionDef {
  switch (kind) {
    case 'catalog':
      return { kind, family: 'IPE', name: 'IPE 240' };
    case 'rect':
      return { kind, b: 0.1, h: 0.2 };
    case 'circle':
      return { kind, D: 0.1 };
    case 'tube':
      return { kind, D: 0.1683, t: 0.0063 };
    case 'box':
      return { kind, b: 0.1, h: 0.2, t: 0.008 };
    case 'weldedI':
      return { kind, h: 0.4, b: 0.2, tw: 0.01, tf: 0.016 };
    case 'tee':
      return { kind, h: 0.2, b: 0.2, tw: 0.01, tf: 0.015 };
    case 'channel':
      return { kind, h: 0.2, b: 0.08, tw: 0.006, tf: 0.011 };
    case 'manual':
      return { kind, A: 3.912e-3, I: 3.892e-5, Wtop: 3.243e-4, Wbot: 3.243e-4, As: 0 };
  }
}

export function SectionEditor({ def, onChange, base }: { def: SectionDef; onChange: (d: SectionDef) => void; base: string }) {
  const fmt = useFmt();
  const dim = (key: string, value: number, label: string) => (
    <NumberField
      key={key}
      label={label}
      value={value}
      q="sectionDim"
      path={`${base}.${key}`}
      onChange={(v) => onChange({ ...def, [key]: v } as SectionDef)}
    />
  );
  return (
    <div className="space-y-2">
      <SelectField
        label={fmt.t('section.kindLabel')}
        value={def.kind}
        testId="section-kind"
        options={KINDS.map((k) => ({ value: k, label: fmt.t(`section.kind.${k}`) }))}
        onChange={(k) => onChange(defaultSectionOfKind(k))}
      />
      {def.kind === 'catalog' && (
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label={fmt.t('section.family')}
            value={def.family}
            options={CATALOG_FAMILIES.map((f) => ({ value: f, label: f }))}
            onChange={(f: CatalogFamily) => onChange({ kind: 'catalog', family: f, name: CATALOG[f][Math.min(4, CATALOG[f].length - 1)].name })}
          />
          <SelectField
            label={fmt.t('section.profile')}
            value={def.name}
            testId="section-profile"
            options={CATALOG[def.family].map((e) => ({ value: e.name, label: e.name }))}
            onChange={(n) => onChange({ ...def, name: n })}
          />
        </div>
      )}
      {def.kind === 'rect' && <div className="grid grid-cols-2 gap-2">{[dim('b', def.b, 'b'), dim('h', def.h, 'h')]}</div>}
      {def.kind === 'circle' && <div className="grid grid-cols-2 gap-2">{dim('D', def.D, 'D')}</div>}
      {def.kind === 'tube' && <div className="grid grid-cols-2 gap-2">{[dim('D', def.D, 'D'), dim('t', def.t, 't')]}</div>}
      {def.kind === 'box' && (
        <div className="grid grid-cols-3 gap-2">{[dim('h', def.h, 'h'), dim('b', def.b, 'b'), dim('t', def.t, 't')]}</div>
      )}
      {(def.kind === 'weldedI' || def.kind === 'tee' || def.kind === 'channel') && (
        <div className="grid grid-cols-4 gap-2">
          {[dim('h', def.h, 'h'), dim('b', def.b, 'b'), dim('tw', def.tw, 't_w'), dim('tf', def.tf, 't_f')]}
        </div>
      )}
      {def.kind === 'manual' && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="A" value={def.A} q="area" path={`${base}.A`} onChange={(v) => onChange({ ...def, A: v })} />
          <NumberField label={fmt.t('section.Iy')} value={def.I} q="inertia" path={`${base}.I`} onChange={(v) => onChange({ ...def, I: v })} />
          <NumberField label="W_o" value={def.Wtop} q="sectionModulus" path={`${base}.Wtop`} onChange={(v) => onChange({ ...def, Wtop: v })} />
          <NumberField label="W_u" value={def.Wbot} q="sectionModulus" path={`${base}.Wbot`} onChange={(v) => onChange({ ...def, Wbot: v })} />
          <NumberField label={fmt.t('section.As')} value={def.As} q="area" path={`${base}.As`} onChange={(v) => onChange({ ...def, As: v })} />
        </div>
      )}
    </div>
  );
}

export function MaterialEditor({ m, onChange, base }: { m: Material; onChange: (m: Material) => void; base: string }) {
  const fmt = useFmt();
  const custom = m.preset === 'custom';
  const timber = m.preset === 'C24' || (custom && m.kmod !== 1);
  return (
    <div className="space-y-2">
      <SelectField
        label={fmt.t('material.label')}
        value={m.preset}
        testId="material-preset"
        options={MATERIAL_ORDER.map((p) => ({ value: p, label: fmt.t(`material.preset.${p}`) }))}
        onChange={(p: MaterialPreset) => onChange(p === 'custom' ? { ...m, preset: 'custom' } : materialPreset(p))}
      />
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="E" value={m.E} q="modulus" path={`${base}.E`} disabled={!custom} onChange={(v) => onChange({ ...m, E: v })} />
        <NumberField label="G" value={m.G} q="modulus" path={`${base}.G`} disabled={!custom} onChange={(v) => onChange({ ...m, G: v })} />
        <NumberField label="ρ" value={m.rho} q="density" path={`${base}.rho`} disabled={!custom} onChange={(v) => onChange({ ...m, rho: v })} />
        <NumberField label={fmt.t(`material.fk.${m.preset}`)} value={m.fk} q="stress" path={`${base}.fk`} onChange={(v) => onChange({ ...m, fk: v })} />
        <NumberField label={fmt.t('material.gammaM')} value={m.gammaM} path={`${base}.gammaM`} onChange={(v) => onChange({ ...m, gammaM: v })} />
        {timber || custom ? (
          <NumberField label="k_mod" value={m.kmod} path={`${base}.kmod`} onChange={(v) => onChange({ ...m, kmod: v })} />
        ) : (
          <div />
        )}
        <NumberField label={fmt.t('material.fvk')} value={m.fvk} q="stress" path={`${base}.fvk`} onChange={(v) => onChange({ ...m, fvk: v })} />
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        f_d = {timber ? 'k_mod·' : ''}f_k/γ_M = <span className="num">{fmt.q(designStrength(m), 'stress')}</span> — {fmt.t('material.expressNote')}
      </p>
    </div>
  );
}

/** Section sketch with dimensions and computed properties */
export function SectionSketch({ def, rho }: { def: SectionDef; rho: number }) {
  const fmt = useFmt();
  const o = sectionOutline(def);
  const p: SectionProps = sectionProps(def);
  const size = 150;
  const pad = 26;
  let body: React.ReactNode = null;
  let H = p.h;
  let B = p.b;
  if (o.type === 'circle') {
    H = B = o.D;
  }
  const sc = H > 0 && B > 0 ? (size - 2 * pad) / Math.max(H, B) : 0;
  const ox = pad + ((size - 2 * pad) - B * sc) / 2;
  const oy = pad;
  if (o.type === 'poly' && sc > 0) {
    const path = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${ox + x * sc},${oy + y * sc}`).join('') + 'Z';
    body = <path d={path(o.outer) + (o.inner ? path(o.inner) : '')} fillRule="evenodd" className="fill-slate-300 stroke-slate-700 dark:fill-slate-600 dark:stroke-slate-300" />;
  } else if (o.type === 'circle' && sc > 0) {
    const r = (o.D / 2) * sc;
    const ri = (o.d / 2) * sc;
    const cxp = ox + r;
    const cyp = oy + r;
    body = (
      <path
        d={`M${cxp - r},${cyp}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z${ri > 0 ? `M${cxp - ri},${cyp}a${ri},${ri} 0 1,0 ${2 * ri},0a${ri},${ri} 0 1,0 ${-2 * ri},0Z` : ''}`}
        fillRule="evenodd"
        className="fill-slate-300 stroke-slate-700 dark:fill-slate-600 dark:stroke-slate-300"
      />
    );
  }
  const mm = (v: number) => fmt.num(fmt.val(v, 'sectionDim'), fmt.units === 'metric' ? 1 : 2);
  const rows: [string, string][] = [
    ['A', fmt.q(p.A, 'area')],
    [fmt.t('section.IyStrong'), fmt.q(p.I, 'inertia')],
    ['z_s', fmt.q(p.zc, 'sectionDim')],
    ['z_o / z_u', `${fmt.num(fmt.val(p.zTop, 'sectionDim'))} / ${fmt.q(p.zBot, 'sectionDim')}`],
    ['W_o', fmt.q(p.Wtop, 'sectionModulus')],
    ['W_u', fmt.q(p.Wbot, 'sectionModulus')],
    ['A_s', fmt.q(p.As, 'area')],
    [fmt.t('section.mass'), fmt.q(p.tableMass ?? p.A * rho, 'massPerLength')],
  ];
  return (
    <div className="flex flex-wrap items-start gap-3" data-testid="section-sketch">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={fmt.t('section.sketch')}>
        {body}
        {sc > 0 && o.type !== 'none' && (
          <>
            {/* centroid axis */}
            <line x1={ox - 8} x2={ox + B * sc + 8} y1={oy + p.zc * sc} y2={oy + p.zc * sc} stroke="var(--cursor)" strokeDasharray="4 2" />
            <text x={ox + B * sc + 10} y={oy + p.zc * sc + 3} fontSize="9" className="svg-text">
              y
            </text>
            {/* dimensions */}
            <line x1={ox} x2={ox + B * sc} y1={oy - 10} y2={oy - 10} stroke="var(--muted)" />
            <text x={ox + (B * sc) / 2} y={oy - 13} fontSize="9" textAnchor="middle" className="svg-text">
              {o.type === 'circle' ? 'D = ' : 'b = '}
              {mm(B)}
            </text>
            <line x1={ox - 10} x2={ox - 10} y1={oy} y2={oy + H * sc} stroke="var(--muted)" />
            <text x={ox - 13} y={oy + (H * sc) / 2} fontSize="9" textAnchor="middle" className="svg-text" transform={`rotate(-90 ${ox - 13} ${oy + (H * sc) / 2})`}>
              h = {mm(H)}
            </text>
          </>
        )}
        {o.type === 'none' && (
          <text x={size / 2} y={size / 2} fontSize="11" textAnchor="middle" className="svg-text">
            {fmt.t('section.noSketch')}
          </text>
        )}
      </svg>
      <table className="text-xs">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="pr-3 text-slate-500 dark:text-slate-400">{k}</td>
              <td className="num text-right">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
