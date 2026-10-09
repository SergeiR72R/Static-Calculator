/**
 * Step-by-step report ("Rechenweg / Debug"): structured blocks (text, KaTeX formulas, tables,
 * numeric matrices) generated from the analysis of one load set. Rendering is done by
 * ReportView (screen/print), reportToHtml and reportToMarkdown (downloads).
 */
import type { Analysis, LinearResult, Prepared } from '../core/analysis';
import { dirCos, equivalentNodalLoads, localStiffness, shearParam } from '../core/element';
import { equilibrium, evalElement, reactionVector } from '../core/postprocess';
import { combinationResult } from '../core/results';
import type { ResultView } from '../core/results';
import type { Checks } from '../core/checks';
import { findPeriProduct } from '../sections/peri';
import { handCalculation, handMoment } from '../core/handcalc';
import type { BeamModel, Id, SectionDef } from '../core/types';
import { G_ACC } from '../core/types';
import { sectionProps } from '../sections/properties';
import { findCatalogEntry } from '../sections/catalog';
import { designStrength } from '../sections/materials';
import { translate, type TParams } from '../i18n';
import { formatNumber, type Lang } from '../units/format';

export type Block =
  | { type: 'h'; level: 2 | 3; text: string; id?: string }
  | { type: 'p'; text: string }
  | { type: 'tex'; tex: string }
  | { type: 'table'; head: string[]; rows: string[][]; align?: ('l' | 'r')[] }
  /** numeric matrix; null = structural zero, NaN = non-zero marker (portrait) */
  | { type: 'matrix'; title?: string; rowLabels: string[]; colLabels: string[]; data: (number | null)[][] }
  | { type: 'collapse'; title: string; blocks: Block[]; open?: boolean }
  | { type: 'pages'; title: string; pages: { label: string; blocks: Block[] }[] };

export interface ReportOptions {
  lang: Lang;
  view: ResultView;
  /** number of elements from which large blocks are paginated */
  pageThreshold?: number;
  checks?: Checks | null;
}

export interface Report {
  title: string;
  loadSetLabel: string;
  blocks: Block[];
}

/** Number formatting for TeX: locale decimal separator ({,} in math), ×10^k for large/small values */
export function texNum(v: number, lang: Lang, sig = 5): string {
  if (!Number.isFinite(v)) return '\\text{–}';
  if (v === 0 || Math.abs(v) < 1e-300) return '0';
  const a = Math.abs(v);
  const e = Math.floor(Math.log10(a));
  let s: string;
  if (e >= 6 || e <= -4) {
    let mant = v / 10 ** e;
    let ee = e;
    if (Math.abs(Number(mant.toPrecision(sig))) >= 10) {
      mant /= 10;
      ee += 1;
    }
    s = `${trimNum(mant.toPrecision(sig), lang)} \\cdot 10^{${ee}}`;
  } else {
    const dec = Math.max(0, sig - 1 - e);
    s = trimNum(v.toFixed(Math.min(dec, 10)), lang);
  }
  return s.replace(/^-/, '-');
}

function trimNum(s: string, lang: Lang): string {
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return lang === 'en' ? s : s.replace('.', '{,}');
}

/** Plain text number (tables) */
export function txtNum(v: number, lang: Lang, sig = 5): string {
  if (!Number.isFinite(v)) return '–';
  if (v === 0) return '0';
  const a = Math.abs(v);
  const e = Math.floor(Math.log10(a));
  if (e >= 6 || e <= -4) {
    const m = v / 10 ** e;
    const sup = String(e).replace(/[-0-9]/g, (c) => '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'['-0123456789'.indexOf(c)]);
    return `${formatNumber(Number(m.toPrecision(sig)), lang, sig - 1, false).replace(/([,.]\d*?)0+$/, '$1').replace(/[,.]$/, '')}·10${sup}`;
  }
  const dec = Math.max(0, Math.min(10, sig - 1 - e));
  const s = formatNumber(v, lang, dec, false);
  const sep = lang === 'en' ? '.' : ',';
  return s.includes(sep) ? s.replace(/0+$/, '').replace(new RegExp(`\\${sep}$`), '') : s;
}

export function reportLoadSet(model: BeamModel, view: ResultView): { factors: Record<Id, number>; kind: 'case' | 'combo' | 'envelope'; id: Id } {
  if (view.type === 'case') return { factors: { [view.id]: 1 }, kind: 'case', id: view.id };
  if (view.type === 'combo') {
    const c = model.combinations.find((k) => k.id === view.id);
    return { factors: c ? { ...c.factors } : {}, kind: 'combo', id: view.id };
  }
  const c = model.combinations.find((k) => k.inEnvelope) ?? model.combinations[0];
  return { factors: c ? { ...c.factors } : {}, kind: 'envelope', id: c?.id ?? '' };
}

const DOF_TEX: Record<string, string> = { u: 'u', w: 'w', t: '\\theta' };

function dofLabel(prep: Prepared, d: number, tex = false): string {
  const k = prep.dof.kind[d];
  const n = prep.dof.nodeOf[d] + 1;
  const side = prep.dof.side[d];
  if (tex) return `${DOF_TEX[k]}_{${n}${side ? ',' + side : ''}}`;
  return `${k === 't' ? 'θ' : k}${n}${side}`;
}

function sectionDerivation(def: SectionDef, lang: Lang, t: (k: string, p?: TParams) => string): Block[] {
  const N = (v: number) => texNum(v, lang);
  const p = sectionProps(def);
  const out: Block[] = [];
  const fin = (): Block => ({
    type: 'tex',
    tex: `z_o = ${N(p.zTop)}\\,\\mathrm{m},\\; z_u = ${N(p.zBot)}\\,\\mathrm{m},\\; W_o = \\frac{I}{z_o} = ${N(p.Wtop)}\\,\\mathrm{m^3},\\; W_u = \\frac{I}{z_u} = ${N(p.Wbot)}\\,\\mathrm{m^3}`,
  });
  switch (def.kind) {
    case 'rect':
      out.push({ type: 'tex', tex: `A = b\\,h = ${N(def.b)} \\cdot ${N(def.h)} = ${N(p.A)}\\,\\mathrm{m^2}` });
      out.push({ type: 'tex', tex: `I_y = \\frac{b\\,h^3}{12} = \\frac{${N(def.b)} \\cdot ${N(def.h)}^3}{12} = ${N(p.I)}\\,\\mathrm{m^4}` });
      out.push({ type: 'tex', tex: `z_s = \\frac{h}{2} = ${N(p.zc)}\\,\\mathrm{m}` });
      break;
    case 'circle':
      out.push({ type: 'tex', tex: `A = \\frac{\\pi D^2}{4} = ${N(p.A)}\\,\\mathrm{m^2},\\quad I_y = \\frac{\\pi D^4}{64} = \\frac{\\pi \\cdot ${N(def.D)}^4}{64} = ${N(p.I)}\\,\\mathrm{m^4}` });
      break;
    case 'tube':
      out.push({
        type: 'tex',
        tex: `A = \\frac{\\pi (D^2 - d^2)}{4},\\; d = D - 2t = ${N(def.D - 2 * def.t)}\\,\\mathrm{m} \\Rightarrow A = ${N(p.A)}\\,\\mathrm{m^2}`,
      });
      out.push({ type: 'tex', tex: `I_y = \\frac{\\pi (D^4 - d^4)}{64} = ${N(p.I)}\\,\\mathrm{m^4}` });
      break;
    case 'box':
      out.push({ type: 'tex', tex: `A = b\\,h - (b-2t)(h-2t) = ${N(def.b)} \\cdot ${N(def.h)} - ${N(def.b - 2 * def.t)} \\cdot ${N(def.h - 2 * def.t)} = ${N(p.A)}\\,\\mathrm{m^2}` });
      out.push({ type: 'tex', tex: `I_y = \\frac{b h^3 - (b-2t)(h-2t)^3}{12} = ${N(p.I)}\\,\\mathrm{m^4}` });
      break;
    case 'weldedI':
    case 'channel':
      out.push({
        type: 'tex',
        tex: `A = 2\\,b\\,t_f + (h - 2t_f)\\,t_w = 2 \\cdot ${N(def.b)} \\cdot ${N(def.tf)} + ${N(def.h - 2 * def.tf)} \\cdot ${N(def.tw)} = ${N(p.A)}\\,\\mathrm{m^2}`,
      });
      out.push({ type: 'tex', tex: `I_y = \\frac{b h^3 - (b - t_w)(h - 2t_f)^3}{12} = ${N(p.I)}\\,\\mathrm{m^4},\\quad z_s = \\frac{h}{2} = ${N(p.zc)}\\,\\mathrm{m}` });
      break;
    case 'tee': {
      const hw = def.h - def.tf;
      out.push({ type: 'tex', tex: `A = b\\,t_f + t_w (h - t_f) = ${N(def.b * def.tf)} + ${N(def.tw * hw)} = ${N(p.A)}\\,\\mathrm{m^2}` });
      out.push({
        type: 'tex',
        tex: `z_s = \\frac{b t_f \\cdot t_f/2 + t_w h_w (t_f + h_w/2)}{A} = ${N(p.zc)}\\,\\mathrm{m}`,
      });
      out.push({
        type: 'tex',
        tex: `I_y = \\frac{b t_f^3}{12} + b t_f (z_s - \\tfrac{t_f}{2})^2 + \\frac{t_w h_w^3}{12} + t_w h_w (t_f + \\tfrac{h_w}{2} - z_s)^2 = ${N(p.I)}\\,\\mathrm{m^4}`,
      });
      break;
    }
    case 'catalog': {
      const e = findCatalogEntry(def.family, def.name);
      out.push({ type: 'p', text: t('report.catalogValues', { name: def.name }) });
      if (e)
        out.push({
          type: 'tex',
          tex: `A = ${N(p.A)}\\,\\mathrm{m^2},\\; I_y = ${N(p.I)}\\,\\mathrm{m^4},\\; W_{el,y} = ${N(p.Wtop)}\\,\\mathrm{m^3},\\; h = ${N(p.h)}\\,\\mathrm{m}`,
        });
      return out;
    }
    case 'peri': {
      const pr = findPeriProduct(def.product);
      out.push({ type: 'p', text: t('report.periValues', { name: pr?.name ?? def.product, src: pr?.source ?? '' }) });
      out.push({
        type: 'tex',
        tex: `A = ${N(p.A)}\\,\\mathrm{m^2},\\; I_y = ${N(p.I)}\\,\\mathrm{m^4},\\; h = ${N(p.h)}\\,\\mathrm{m},\\; g = ${N(pr?.mass ?? 0)}\\,\\mathrm{kg/m}`,
      });
      return out;
    }
    case 'manual':
      out.push({ type: 'p', text: t('report.manualSection') });
      out.push({ type: 'tex', tex: `A = ${N(p.A)}\\,\\mathrm{m^2},\\; I_y = ${N(p.I)}\\,\\mathrm{m^4}` });
      return out;
  }
  out.push(fin());
  return out;
}

const KE_TEX = `\\mathbf{K}_e = \\begin{bmatrix}
\\frac{EA}{L} & 0 & 0 & -\\frac{EA}{L} & 0 & 0 \\\\
0 & \\frac{12EI}{L^3} & \\frac{6EI}{L^2} & 0 & -\\frac{12EI}{L^3} & \\frac{6EI}{L^2} \\\\
0 & \\frac{6EI}{L^2} & \\frac{4EI}{L} & 0 & -\\frac{6EI}{L^2} & \\frac{2EI}{L} \\\\
-\\frac{EA}{L} & 0 & 0 & \\frac{EA}{L} & 0 & 0 \\\\
0 & -\\frac{12EI}{L^3} & -\\frac{6EI}{L^2} & 0 & \\frac{12EI}{L^3} & -\\frac{6EI}{L^2} \\\\
0 & \\frac{6EI}{L^2} & \\frac{2EI}{L} & 0 & -\\frac{6EI}{L^2} & \\frac{4EI}{L}
\\end{bmatrix}`;

const KE_TIMO_TEX = `\\Phi = \\frac{12\\,EI}{G A_s L^2},\\qquad k_{ww} = \\frac{12EI}{(1+\\Phi)L^3},\\; k_{w\\theta} = \\frac{6EI}{(1+\\Phi)L^2},\\; k_{\\theta\\theta} = \\frac{(4+\\Phi)EI}{(1+\\Phi)L},\\; k_{\\theta\\theta'} = \\frac{(2-\\Phi)EI}{(1+\\Phi)L}`;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Paginate a list of blocks per element when the model is large */
function paged(title: string, items: { label: string; blocks: Block[] }[], threshold: number, perPage: number, open = false): Block {
  if (items.length < threshold) return { type: 'collapse', title, open, blocks: items.flatMap((i) => i.blocks) };
  const pages = chunk(items, perPage).map((c) => ({
    label: `${c[0].label} … ${c[c.length - 1].label}`,
    blocks: c.flatMap((i) => i.blocks),
  }));
  return { type: 'pages', title, pages };
}

export function buildReport(an: Analysis, opt: ReportOptions): Report | null {
  if (!an.ok || !an.prep || !an.mesh) return null;
  const lang = opt.lang;
  const t = (k: string, p?: TParams) => translate(lang, k, p);
  const N = (v: number, sig = 5) => texNum(v, lang, sig);
  const T = (v: number, sig = 5) => txtNum(v, lang, sig);
  const prep = an.prep;
  const mesh = an.mesh;
  const model = an.model;
  const threshold = opt.pageThreshold ?? 50;
  const ls = reportLoadSet(model, opt.view);
  const lr: LinearResult = combinationResult(an, ls.factors);
  const caseName = (id: Id) => {
    const c = model.loadCases.find((k) => k.id === id);
    return c ? c.name || t(`lc.${c.category}`) : id;
  };
  const factorsText = Object.entries(ls.factors)
    .filter(([, f]) => f)
    .map(([id, f]) => `${T(f, 3)} · ${caseName(id)}`)
    .join(' + ');
  const loadSetLabel = ls.kind === 'case' ? caseName(ls.id) : factorsText || '0';
  const blocks: Block[] = [];
  const isTimo = model.settings.theory === 'timoshenko';

  // ───────────── 1 input data
  blocks.push({ type: 'h', level: 2, text: t('report.s1'), id: 'r1' });
  blocks.push({ type: 'p', text: t('report.siNote') });
  blocks.push({
    type: 'table',
    head: [t('report.quantity'), t('report.value')],
    align: ['l', 'r'],
    rows: [
      [t('beam.length'), `${T(model.L)} m`],
      [t('settings.theory'), t(isTimo ? 'settings.timoshenko' : 'settings.euler')],
      [t('settings.selfWeight'), model.settings.selfWeight ? t('common.yes') : t('common.no')],
    ],
  });
  model.segments.forEach((s, i) => {
    const sec: Block[] = [];
    sec.push({
      type: 'table',
      head: ['x₁ [m]', 'x₂ [m]', 'E [Pa]', 'G [Pa]', 'ρ [kg/m³]', 'f_k [Pa]', 'γ_M', 'k_mod'],
      rows: [[T(s.x1), T(s.x2), T(s.material.E), T(s.material.G), T(s.material.rho), T(s.material.fk), T(s.material.gammaM, 3), T(s.material.kmod, 3)]],
    });
    sec.push(...sectionDerivation(s.section, lang, t));
    if (model.settings.selfWeight) {
      const A = sectionProps(s.section).A;
      sec.push({
        type: 'tex',
        tex: `q_{sw} = \\rho\\,A\\,g = ${N(s.material.rho)} \\cdot ${N(A)} \\cdot ${N(G_ACC)} = ${N(s.material.rho * A * G_ACC)}\\,\\mathrm{N/m}`,
      });
    }
    blocks.push({ type: 'collapse', title: `${t('beam.segment')} ${i + 1}: ${t(`material.preset.${s.material.preset}`)}`, open: i === 0, blocks: sec });
  });
  blocks.push({ type: 'h', level: 3, text: t('support.title') });
  blocks.push({
    type: 'table',
    head: [t('support.type'), 'x [m]', 'k_u [N/m]', 'k_w [N/m]', 'k_θ [N·m/rad]', 'Δu [m]', 'Δw [m]', 'Δθ [rad]'],
    rows: model.supports.map((s) => [
      t(`support.types.${s.type}`),
      T(s.x),
      s.type === 'spring' ? T(s.ku) : '–',
      s.type === 'spring' ? T(s.kw) : '–',
      s.type === 'spring' ? T(s.kt) : '–',
      T(s.du),
      T(s.dw),
      T(s.dt),
    ]),
  });
  if (model.hinges.length) blocks.push({ type: 'p', text: `${t('hinge.title')}: ${model.hinges.map((h) => `x = ${T(h.x)} m`).join('; ')}` });
  blocks.push({ type: 'h', level: 3, text: t('report.loads') });
  blocks.push({
    type: 'table',
    head: [t('load.case'), t('report.loadType'), 'x / x₁ [m]', 'x₂ [m]', t('report.loadValues')],
    rows: model.loads.map((l) => {
      if (l.kind === 'point') {
        const [c, sn] = dirCos(l.angle);
        return [caseName(l.caseId), t('load.kinds.point'), T(l.x), '', `P = ${T(l.P)} N, α = ${T(l.angle, 4)}° → P_x = ${T(l.P * c)} N, P_z = ${T(l.P * sn)} N`];
      }
      if (l.kind === 'moment') return [caseName(l.caseId), t('load.kinds.moment'), T(l.x), '', `M = ${T(l.M)} N·m`];
      return [caseName(l.caseId), t(l.dir === 'x' ? 'load.kinds.axial' : 'load.kinds.dist'), T(l.x1), T(l.x2), `${l.dir === 'x' ? 'p' : 'q'}₁ = ${T(l.q1)} N/m, ${l.dir === 'x' ? 'p' : 'q'}₂ = ${T(l.q2)} N/m`];
    }),
  });
  blocks.push({ type: 'h', level: 3, text: t('report.loadSet') });
  blocks.push({ type: 'p', text: t(`report.loadSetKind.${ls.kind}`) });
  blocks.push({
    type: 'tex',
    tex: `E_d = \\sum_i \\gamma_i\\,E_i = ${
      Object.entries(ls.factors)
        .filter(([, f]) => f)
        .map(([id, f]) => `${N(f, 3)} \\cdot E_{\\text{${caseName(id).replace(/[{}\\$&#%_^~]/g, '')}}}`)
        .join(' + ') || '0'
    }`,
  });
  if (model.settings.patternLoading) blocks.push({ type: 'p', text: t('report.patternNote') });

  // ───────────── 2 discretisation
  blocks.push({ type: 'h', level: 2, text: t('report.s2'), id: 'r2' });
  blocks.push({ type: 'p', text: t('report.meshNote', { n: mesh.nodes.length, e: mesh.elements.length, d: prep.dof.n }) });
  blocks.push(
    paged(
      t('report.nodes'),
      chunk(mesh.nodes, 25).map((c) => ({
        label: `${c[0].index + 1}`,
        blocks: [
          {
            type: 'table',
            head: [t('report.node'), 'x [m]', t('report.reason')],
            align: ['r', 'r', 'l'],
            rows: c.map((nd) => [String(nd.index + 1), T(nd.x), nd.reasons.map((r) => t(`report.reasons.${r}`)).join(', ') + (nd.hinge ? ` (${t('hinge.single')})` : '')]),
          } as Block,
        ],
      })),
      3,
      1,
      true,
    ),
  );
  blocks.push(
    paged(
      t('report.elements'),
      chunk(mesh.elements, 25).map((c) => ({
        label: `${c[0].index + 1}`,
        blocks: [
          {
            type: 'table',
            head: [t('report.element'), t('report.nodesIJ'), 'L_e [m]', 'E [Pa]', 'I [m⁴]', 'A [m²]', ...(isTimo ? ['G·A_s [N]'] : [])],
            rows: c.map((e) => [
              String(e.index + 1),
              `${e.n1 + 1} – ${e.n2 + 1}`,
              T(e.L),
              T(e.material.E),
              T(e.section.I),
              T(e.section.A),
              ...(isTimo ? [T(e.props.GAs)] : []),
            ]),
          } as Block,
        ],
      })),
      3,
      1,
      true,
    ),
  );
  blocks.push(
    paged(
      t('report.dofTable'),
      chunk(mesh.nodes, 25).map((c) => ({
        label: `${c[0].index + 1}`,
        blocks: [
          {
            type: 'table',
            head: [t('report.node'), 'u', 'w', 'θ'],
            rows: c.map((nd) => {
              const d = prep.dof.node[nd.index];
              return [String(nd.index + 1), String(d.u + 1), String(d.w + 1), nd.hinge ? `${d.tL + 1} (L) / ${d.tR + 1} (R)` : String(d.tL + 1)];
            }),
          } as Block,
        ],
      })),
      3,
      1,
    ),
  );
  blocks.push(
    paged(
      t('report.connectivity'),
      chunk(mesh.elements, 25).map((c) => ({
        label: `${c[0].index + 1}`,
        blocks: [
          {
            type: 'table',
            head: [t('report.element'), 'u₁', 'w₁', 'θ₁', 'u₂', 'w₂', 'θ₂'],
            rows: c.map((e) => [String(e.index + 1), ...prep.dof.elem[e.index].map((d) => String(d + 1))]),
          } as Block,
        ],
      })),
      3,
      1,
    ),
  );
  if (mesh.nodes.some((n) => n.hinge)) blocks.push({ type: 'p', text: t('report.hingeMethod') });

  // ───────────── 3 element matrices
  blocks.push({ type: 'h', level: 2, text: t('report.s3'), id: 'r3' });
  blocks.push({ type: 'p', text: t('report.keIntro') });
  blocks.push({ type: 'tex', tex: KE_TEX });
  if (isTimo) blocks.push({ type: 'tex', tex: KE_TIMO_TEX });
  blocks.push({
    type: 'tex',
    tex: `\\mathbf{K}_e^{glob} = \\mathbf{T}^T \\mathbf{K}_e \\mathbf{T},\\quad \\mathbf{T} = \\begin{bmatrix} \\mathbf{R} & 0 \\\\ 0 & \\mathbf{R}\\end{bmatrix},\\; \\mathbf{R} = \\begin{bmatrix} \\cos\\beta & \\sin\\beta & 0 \\\\ -\\sin\\beta & \\cos\\beta & 0 \\\\ 0 & 0 & 1\\end{bmatrix},\\; \\beta = 0 \\Rightarrow \\mathbf{T} = \\mathbf{I}`,
  });
  const keItems = mesh.elements.map((e) => {
    const k = localStiffness(e.props);
    const g = prep.dof.elem[e.index];
    const lbl = g.map((d) => dofLabel(prep, d));
    return {
      label: String(e.index + 1),
      blocks: [
        {
          type: 'p',
          text: `${t('report.element')} ${e.index + 1}: L = ${T(e.L)} m, EA = ${T(e.props.EA)} N, EI = ${T(e.props.EI)} N·m²${isTimo ? `, Φ = ${T(shearParam(e.props))}` : ''}`,
        } as Block,
        { type: 'matrix', rowLabels: lbl, colLabels: lbl, data: k } as Block,
      ],
    };
  });
  blocks.push(paged(t('report.keNumeric'), keItems, threshold, 10));

  // ───────────── 4 global assembly
  blocks.push({ type: 'h', level: 2, text: t('report.s4'), id: 'r4' });
  blocks.push({ type: 'tex', tex: `\\mathbf{K} = \\sum_e \\mathbf{A}_e^T\\,\\mathbf{K}_e^{glob}\\,\\mathbf{A}_e,\\qquad n = ${prep.dof.n},\\; b = ${prep.K.bw}` });
  const n = prep.dof.n;
  const labels = Array.from({ length: n }, (_, d) => dofLabel(prep, d));
  if (n <= 90) {
    const portrait: (number | null)[][] = [];
    for (let i = 0; i < n; i++) {
      const row: (number | null)[] = [];
      for (let j = 0; j < n; j++) row.push(prep.K.get(i, j) !== 0 ? 1 : null);
      portrait.push(row);
    }
    blocks.push({ type: 'collapse', title: t('report.portrait'), blocks: [{ type: 'matrix', rowLabels: labels, colLabels: labels, data: portrait.map((r) => r.map((v) => (v ? NaN : null))) }] });
  } else blocks.push({ type: 'p', text: t('report.portraitBand', { b: prep.K.bw }) });
  // numeric K: band-wise pages of rows
  const rowsPerPage = 12;
  const kPages: { label: string; blocks: Block[] }[] = [];
  for (let r0 = 0; r0 < n; r0 += rowsPerPage) {
    const r1 = Math.min(n, r0 + rowsPerPage);
    const c0 = n <= 24 ? 0 : Math.max(0, r0 - prep.K.bw);
    const c1 = n <= 24 ? n : Math.min(n, r1 + prep.K.bw);
    const data: (number | null)[][] = [];
    for (let i = r0; i < r1; i++) {
      const row: (number | null)[] = [];
      for (let j = c0; j < c1; j++) row.push(prep.K.get(i, j));
      data.push(row);
    }
    kPages.push({
      label: `${labels[r0]} … ${labels[r1 - 1]}`,
      blocks: [{ type: 'matrix', rowLabels: labels.slice(r0, r1), colLabels: labels.slice(c0, c1), data }],
    });
  }
  blocks.push(
    n <= 24
      ? { type: 'collapse', title: t('report.kNumeric'), blocks: kPages.flatMap((p) => p.blocks) }
      : { type: 'pages', title: `${t('report.kNumeric')} (${t('report.bandwise')})`, pages: kPages },
  );
  // load vector
  blocks.push({ type: 'h', level: 3, text: t('report.loadVector') });
  blocks.push({ type: 'tex', tex: `\\mathbf{F} = \\mathbf{F}_{Knoten} + \\mathbf{F}_{\\ddot{a}q}` });
  const fRows: string[][] = [];
  for (let d = 0; d < n; d++) {
    if (lr.Fn[d] === 0 && lr.Fe[d] === 0) continue;
    fRows.push([labels[d], T(lr.Fn[d]), T(lr.Fe[d]), T(lr.Fn[d] + lr.Fe[d])]);
  }
  blocks.push(
    paged(
      t('report.loadVectorTable'),
      chunk(fRows, 30).map((c, i) => ({
        label: String(i + 1),
        blocks: [{ type: 'table', head: ['DOF', t('report.fNodal'), t('report.fEquiv'), 'F'], rows: c } as Block],
      })),
      3,
      1,
      true,
    ),
  );
  blocks.push({ type: 'p', text: t('report.equivIntro') });
  blocks.push({
    type: 'tex',
    tex: `F_1 = \\frac{L(7q_1 + 3q_2)}{20},\\; M_1 = \\frac{L^2(3q_1 + 2q_2)}{60},\\; F_2 = \\frac{L(3q_1 + 7q_2)}{20},\\; M_2 = -\\frac{L^2(2q_1 + 3q_2)}{60}`,
  });
  blocks.push({ type: 'tex', tex: `N_1 = \\frac{L(2p_1 + p_2)}{6},\\; N_2 = \\frac{L(p_1 + 2p_2)}{6}` });
  const eqItems = mesh.elements
    .filter((e) => lr.q1[e.index] || lr.q2[e.index] || lr.p1[e.index] || lr.p2[e.index])
    .map((e) => {
      const ei = e.index;
      const q1 = lr.q1[ei];
      const q2 = lr.q2[ei];
      const L = e.L;
      const r = equivalentNodalLoads(e.props, { q1, q2, p1: lr.p1[ei], p2: lr.p2[ei] });
      const bl: Block[] = [{ type: 'p', text: `${t('report.element')} ${ei + 1}: L = ${T(L)} m, q₁ = ${T(q1)} N/m, q₂ = ${T(q2)} N/m` }];
      if (q1 || q2) {
        bl.push({
          type: 'tex',
          tex: `F_1 = \\frac{${N(L)}\\,(7 \\cdot ${N(q1)} + 3 \\cdot ${N(q2)})}{20} = ${N(r[1])}\\,\\mathrm{N},\\quad M_1 = \\frac{${N(L)}^2 (3 \\cdot ${N(q1)} + 2 \\cdot ${N(q2)})}{60} = ${N(r[2])}\\,\\mathrm{N\\,m}`,
        });
        bl.push({
          type: 'tex',
          tex: `F_2 = \\frac{${N(L)}\\,(3 \\cdot ${N(q1)} + 7 \\cdot ${N(q2)})}{20} = ${N(r[4])}\\,\\mathrm{N},\\quad M_2 = -\\frac{${N(L)}^2 (2 \\cdot ${N(q1)} + 3 \\cdot ${N(q2)})}{60} = ${N(r[5])}\\,\\mathrm{N\\,m}`,
        });
        if (isTimo) bl.push({ type: 'p', text: t('report.timoEquiv') });
      }
      if (lr.p1[ei] || lr.p2[ei]) bl.push({ type: 'tex', tex: `N_1 = ${N(r[0])}\\,\\mathrm{N},\\; N_2 = ${N(r[3])}\\,\\mathrm{N}` });
      return { label: String(ei + 1), blocks: bl };
    });
  if (eqItems.length) blocks.push(paged(t('report.equivElements'), eqItems, threshold, 10));

  // ───────────── 5 boundary conditions and solution
  blocks.push({ type: 'h', level: 2, text: t('report.s5'), id: 'r5' });
  blocks.push({
    type: 'table',
    head: ['DOF', t('report.node'), 'x [m]', t('report.prescribed')],
    rows: prep.restraints.map((r) => [labels[r.dof], String(prep.dof.nodeOf[r.dof] + 1), T(mesh.nodes[prep.dof.nodeOf[r.dof]].x), T(lr.us[r.dof])]),
  });
  if (prep.springs.length)
    blocks.push({
      type: 'p',
      text: `${t('report.springsAdded')}: ${prep.springs.map((s) => `${labels[s.dof]}: k = ${T(s.k)}`).join('; ')}`,
    });
  blocks.push({ type: 'tex', tex: `\\mathbf{K}_{ff}\\,\\mathbf{u}_f = \\mathbf{F}_f - \\mathbf{K}_{fs}\\,\\mathbf{u}_s` });
  blocks.push({
    type: 'p',
    text: t('report.solverNote', {
      nf: prep.free.length,
      ns: prep.fixed.length,
      b: prep.Kff.bw,
      piv: T(prep.minRelPivot, 3),
    }),
  });
  blocks.push({ type: 'tex', tex: `\\kappa_1(\\mathbf{K}_{ff}) = \\lVert \\mathbf{K}_{ff} \\rVert_1 \\, \\lVert \\mathbf{K}_{ff}^{-1} \\rVert_1 \\approx ${N(prep.cond, 3)}` });
  blocks.push(
    paged(
      t('report.displacements'),
      chunk(mesh.nodes, 25).map((c) => ({
        label: `${c[0].index + 1}`,
        blocks: [
          {
            type: 'table',
            head: [t('report.node'), 'x [m]', 'u [m]', 'w [m]', 'θ [rad]'],
            rows: c.map((nd) => {
              const d = prep.dof.node[nd.index];
              return [
                String(nd.index + 1),
                T(nd.x),
                T(lr.u[d.u]),
                T(lr.u[d.w]),
                nd.hinge ? `${T(lr.u[d.tL])} (L) / ${T(lr.u[d.tR])} (R)` : T(lr.u[d.tL]),
              ];
            }),
          } as Block,
        ],
      })),
      3,
      1,
      true,
    ),
  );

  // ───────────── 6 reactions and equilibrium
  blocks.push({ type: 'h', level: 2, text: t('report.s6'), id: 'r6' });
  blocks.push({ type: 'tex', tex: `\\mathbf{R} = \\mathbf{K}\\,\\mathbf{u} - \\mathbf{F},\\qquad \\mathbf{F} = \\mathbf{F}_{Knoten} + \\mathbf{F}_{\\ddot{a}q}` });
  blocks.push({
    type: 'table',
    head: ['DOF', '(K·u)_i', 'F_i', 'R_i'],
    rows: prep.restraints.map((r) => {
      const Ku = lr.R[r.dof] + lr.Fn[r.dof] + lr.Fe[r.dof];
      return [labels[r.dof], T(Ku), T(lr.Fn[r.dof] + lr.Fe[r.dof]), T(lr.R[r.dof])];
    }),
  });
  if (prep.springs.length) {
    blocks.push({ type: 'tex', tex: `F_{Feder} = -k \\cdot u` });
    blocks.push({
      type: 'table',
      head: ['DOF', 'k', 'u', 'F'],
      rows: prep.springs.map((s, i) => [labels[s.dof], T(s.k), T(lr.u[s.dof]), T(lr.springF[i])]),
    });
  }
  const rv = reactionVector(prep, lr);
  blocks.push({
    type: 'table',
    head: [t('support.single'), 'x [m]', 'R_x [N] (→)', 'R_z [N] (↑)', 'M_R [N·m] (↻)'],
    rows: model.supports.map((s, i) => [t(`support.types.${s.type}`), T(s.x), T(rv[3 * i]), T(rv[3 * i + 1]), T(rv[3 * i + 2])]),
  });
  const eq = equilibrium(prep, lr);
  blocks.push({ type: 'p', text: t('report.equilibriumIntro') });
  const sumRu = prep.restraints.filter((r) => r.comp === 'u').reduce((s, r) => s + lr.R[r.dof], 0) + prep.springs.reduce((s, sp, i) => s + (sp.comp === 'u' ? lr.springF[i] : 0), 0);
  const sumRw = prep.restraints.filter((r) => r.comp === 'w').reduce((s, r) => s + lr.R[r.dof], 0) + prep.springs.reduce((s, sp, i) => s + (sp.comp === 'w' ? lr.springF[i] : 0), 0);
  const sumRm = eq.residual[2] - lr.sum[2];
  blocks.push({ type: 'tex', tex: `\\Sigma F_x = \\underbrace{${N(lr.sum[0])}}_{Lasten} + \\underbrace{${N(sumRu)}}_{R} = ${N(eq.residual[0], 3)}\\,\\mathrm{N}` });
  blocks.push({ type: 'tex', tex: `\\Sigma F_z = ${N(lr.sum[1])} + ${N(sumRw)} = ${N(eq.residual[1], 3)}\\,\\mathrm{N}` });
  blocks.push({ type: 'tex', tex: `\\Sigma M_O = ${N(lr.sum[2])} + ${N(sumRm)} = ${N(eq.residual[2], 3)}\\,\\mathrm{N\\,m}` });
  blocks.push({ type: 'p', text: t('report.residual', { r: T(Math.max(...eq.residual.map(Math.abs)) / Math.max(1e-30, eq.loadScale), 2) }) });

  // ───────────── 7 equations of the intervals
  blocks.push({ type: 'h', level: 2, text: t('report.s7'), id: 'r7' });
  blocks.push({ type: 'p', text: t('report.endForces') });
  blocks.push({ type: 'tex', tex: `\\mathbf{f}_e = \\mathbf{K}_e\\,\\mathbf{u}_e - \\mathbf{r}_e,\\qquad N_0 = -f_1,\\; V_0 = -f_2,\\; M_0 = f_3` });
  blocks.push({
    type: 'tex',
    tex: `\\begin{aligned} N(\\xi) &= N_0 - p_1\\xi - \\frac{(p_2 - p_1)\\,\\xi^2}{2L} \\\\ V(\\xi) &= V_0 - q_1\\xi - \\frac{(q_2 - q_1)\\,\\xi^2}{2L} \\\\ M(\\xi) &= M_0 + V_0\\xi - \\frac{q_1\\xi^2}{2} - \\frac{(q_2 - q_1)\\,\\xi^3}{6L} \\\\ w(\\xi) &= \\sum_{k} N_k(\\xi)\\,d_k + w_p(\\xi) = w_1 + \\theta_1\\xi - \\frac{1}{EI}\\Big(\\frac{M_0\\xi^2}{2} + \\frac{V_0\\xi^3}{6} - \\frac{q_1\\xi^4}{24} - \\frac{(q_2-q_1)\\xi^5}{120L}\\Big)${isTimo ? ' + \\frac{1}{GA_s}\\Big(V_0\\xi - \\frac{q_1\\xi^2}{2} - \\frac{(q_2-q_1)\\xi^3}{6L}\\Big)' : ''} \\end{aligned}`,
  });
  const poly = (c: number[], v = '\\xi') =>
    c
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a !== 0 && Number.isFinite(a))
      .map(({ a, i }, k) => {
        const s = N(Math.abs(a));
        const sign = a < 0 ? '-' : k ? '+' : '';
        return `${sign} ${s}${i ? `\\,${v}${i > 1 ? `^{${i}}` : ''}` : ''}`;
      })
      .join(' ') || '0';
  const eqnItems = mesh.elements.map((e) => {
    const ei = e.index;
    const L = e.L;
    const q1 = lr.q1[ei];
    const dq = lr.q2[ei] - q1;
    const p1 = lr.p1[ei];
    const dp = lr.p2[ei] - p1;
    const g = prep.dof.elem[ei];
    const EI = e.props.EI;
    const fs = Number.isFinite(e.props.GAs) ? 1 / e.props.GAs : 0;
    const N0 = lr.N0[ei];
    const V0 = lr.V0[ei];
    const M0 = lr.M0[ei];
    const w1 = lr.u[g[1]];
    const t1 = lr.u[g[2]];
    const wc = [w1, t1 + fs * V0, -M0 / (2 * EI) - (fs * q1) / 2, -V0 / (6 * EI) - (fs * dq) / (6 * L), q1 / (24 * EI), dq / (120 * L * EI)];
    // consistency check of the polynomial with the exact evaluation at ξ = L
    const end = evalElement(prep, lr, ei, L);
    return {
      label: String(ei + 1),
      blocks: [
        { type: 'p', text: `${t('report.element')} ${ei + 1}: ${T(e.x1)} m ≤ x ≤ ${T(e.x2)} m, ξ = x − ${T(e.x1)} m` } as Block,
        { type: 'tex', tex: `N_0 = ${N(N0)}\\,\\mathrm{N},\\; V_0 = ${N(V0)}\\,\\mathrm{N},\\; M_0 = ${N(M0)}\\,\\mathrm{N\\,m},\\; w_1 = ${N(w1)}\\,\\mathrm{m},\\; \\theta_1 = ${N(t1)}` } as Block,
        {
          type: 'tex',
          tex: `\\begin{aligned} N(\\xi) &= ${poly([N0, -p1, -dp / (2 * L)])} \\\\ V(\\xi) &= ${poly([V0, -q1, -dq / (2 * L)])} \\\\ M(\\xi) &= ${poly([M0, V0, -q1 / 2, -dq / (6 * L)])} \\\\ w(\\xi) &= ${poly(wc)} \\end{aligned}`,
        } as Block,
        { type: 'p', text: t('report.endCheck', { M: T(end.M), V: T(end.V), w: T(end.w) }) } as Block,
      ],
    };
  });
  blocks.push(paged(t('report.intervals'), eqnItems, threshold, 10, mesh.elements.length <= 6));

  // ───────────── 8 stresses and checks
  blocks.push({ type: 'h', level: 2, text: t('report.s8'), id: 'r8' });
  const ch = opt.checks;
  if (ch?.strength) {
    const s = ch.strength;
    const e = mesh.elements[s.elem];
    const W = Math.min(e.section.Wtop || Infinity, e.section.Wbot || Infinity);
    const m = e.material;
    blocks.push({ type: 'p', text: t(ch.strengthBasis === 'ULS' ? 'kpi.basisULS' : 'kpi.basisView') });
    blocks.push({
      type: 'tex',
      tex: `\\sigma = \\frac{|N|}{A} + \\frac{|M|}{W} = \\frac{${N(Math.abs(s.N))}}{${N(e.section.A)}} + \\frac{${N(Math.abs(s.M))}}{${N(W)}} = ${N(s.value)}\\,\\mathrm{Pa}\\quad (x = ${N(s.x)}\\,\\mathrm{m})`,
    });
    blocks.push({
      type: 'tex',
      tex: `f_d = \\frac{k_{mod}\\,f_k}{\\gamma_M} = \\frac{${N(m.kmod, 3)} \\cdot ${N(m.fk)}}{${N(m.gammaM, 3)}} = ${N(designStrength(m))}\\,\\mathrm{Pa},\\qquad \\eta = \\frac{\\sigma}{f_d} = ${N(s.eta * 100, 4)}\\,\\% \\;\\Rightarrow\\; \\text{${t(s.ok ? 'kpi.ok' : 'kpi.fail')}}`,
    });
  }
  if (ch?.shear) {
    const s = ch.shear;
    const e = mesh.elements[s.elem];
    blocks.push({
      type: 'tex',
      tex: `\\tau = \\frac{V\\,S}{I\\,b} = \\frac{${N(Math.abs(s.V))} \\cdot ${N(e.section.S)}}{${N(e.section.I)} \\cdot ${N(e.section.bNA)}} = ${N(s.value)}\\,\\mathrm{Pa},\\quad \\eta = ${N(s.eta * 100, 4)}\\,\\%`,
    });
  }
  for (const c of ch?.peri ?? []) {
    const pr = findPeriProduct(c.product);
    blocks.push({ type: 'p', text: `${pr?.name ?? c.product}: ${t(c.method === 'perm' ? 'report.periPerm' : 'report.periDesign')}` });
    blocks.push({ type: 'p', text: t(c.basis === 'ULS' ? 'kpi.basisULS' : c.basis === 'SLS' ? 'kpi.periBasisSLS' : 'kpi.basisView') });
    const perm = c.method === 'perm';
    for (const it of c.items) {
      const reg = it.region ? `\\;(${it.region})` : '';
      const ok = `\\;\\Rightarrow\\; \\text{${t(it.eta <= 1 ? 'kpi.ok' : 'kpi.fail')}}`;
      if (it.key === 'int' && it.parts) {
        const q = it.parts;
        blocks.push({
          type: 'tex',
          tex: `x = ${N(it.x)}\\,\\mathrm{m}${reg}:\\; m_y = ${N(q.my, 4)},\\; n = ${N(q.n, 4)},\\; v = ${N(q.v, 4)},\\; \\rho = ${N(q.rho, 4)}`,
        });
        blocks.push({
          type: 'tex',
          tex: `\\frac{m_y (1 - \\tfrac{a_w}{2})}{1 - n} = ${N(q.nm, 4)}${q.v > 0.5 ? `,\\; \\frac{m_y}{1-\\rho w_w} = ${N(q.vm, 4)},\\; \\frac{n}{1-\\rho a_w} = ${N(q.nv, 4)},\\; (n\\text{–}v\\text{–}m_y) = ${N(q.nvm, 4)}` : ''}\\;\\Rightarrow\\; \\eta = ${N(it.eta * 100, 4)}\\,\\%${ok}`,
        });
        continue;
      }
      const sym =
        it.key === 'M' ? (perm ? 'M \\le \\mathrm{perm}\\,M' : 'M_{Ed} \\le M_{Rd}') :
        it.key === 'V' ? (perm ? 'Q \\le \\mathrm{perm}\\,Q' : 'V_{Ed} \\le V_{Rd}') :
        it.key === 'N' ? 'N_{Ed} \\le N_{Rd}' :
        `R(x = ${N(it.x)}\\,\\mathrm{m}) \\le \\mathrm{perm}\\,${it.key === 'Rend' ? 'A' : 'B'}`;
      blocks.push({ type: 'tex', tex: `${sym}:\\; ${N(it.Ed)} \\le ${N(it.Rd)}${reg},\\; \\eta = ${N(it.eta * 100, 4)}\\,\\%${ok}` });
    }
  }
  if (ch) {
    blocks.push({ type: 'p', text: t(ch.deflectionBasis === 'SLS' ? 'kpi.basisSLS' : 'kpi.basisView') });
    for (const d of ch.deflection) {
      const Ls = d.span.x2 - d.span.x1;
      blocks.push({
        type: 'tex',
        tex: `\\text{${t(d.span.kind === 'cantilever' ? 'kpi.cantilever' : 'kpi.span')} } ${N(d.span.x1)}\\ldots${N(d.span.x2)}\\,\\mathrm{m}:\\quad |w| = ${N(Math.abs(d.w))}\\,\\mathrm{m} \\le \\frac{L}{${N(d.denominator, 4)}} = \\frac{${N(Ls)}}{${N(d.denominator, 4)}} = ${N(d.limit)}\\,\\mathrm{m},\\quad \\eta = ${N(d.eta * 100, 4)}\\,\\%`,
      });
    }
  }

  // ───────────── 9 hand calculation
  blocks.push({ type: 'h', level: 2, text: t('report.s9'), id: 'r9' });
  const hc = handCalculation(an, ls.factors);
  const nH = mesh.nodes.filter((nd) => nd.hinge).length;
  if (!hc.applicable) {
    blocks.push({ type: 'p', text: t(`report.hand.${hc.reason}`, { n: hc.degree }) });
  } else {
    blocks.push({ type: 'p', text: t('report.hand.intro', { r: hc.unknowns.length, h: nH }) });
    const uName = (i: number) => {
      const u = hc.unknowns[i];
      const si = model.supports.findIndex((s) => s.id === u.supportId);
      const letter = String.fromCharCode(65 + Math.max(0, si));
      return u.comp === 'u' ? `R_{x,${letter}}` : u.comp === 'w' ? `R_{z,${letter}}` : `M_{${letter}}`;
    };
    for (const e of hc.equations) {
      const terms = e.coef
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => c !== 0)
        .map(({ c, i }, k) => `${c < 0 ? '-' : k ? '+' : ''} ${Math.abs(c) === 1 ? '' : N(Math.abs(c)) + '\\cdot '}${uName(i)}`)
        .join(' ');
      const title =
        e.kind === 'Fx' ? '\\Sigma F_x = 0' : e.kind === 'Fz' ? '\\Sigma F_z = 0' : e.kind === 'M0' ? '\\Sigma M_{(x=0)} = 0' : `M(x = ${N(e.x ?? 0)}) = 0`;
      blocks.push({ type: 'tex', tex: `${title}:\\quad ${terms || '0'} ${e.rhs < 0 ? '-' : '+'} ${N(Math.abs(e.rhs))} = 0` });
    }
    blocks.push({ type: 'p', text: t('report.hand.signs') });
    const rvf = (i: number) => {
      const u = hc.unknowns[i];
      const si = model.supports.findIndex((s) => s.id === u.supportId);
      const r = prep.restraints.find((rr) => rr.supportId === u.supportId && rr.comp === u.comp);
      return { si, fem: r ? lr.R[r.dof] : NaN };
    };
    blocks.push({
      type: 'table',
      head: [t('report.unknown'), t('report.hand.hand'), 'FEM', 'Δ'],
      rows: hc.unknowns.map((_, i) => {
        const { fem } = rvf(i);
        return [uName(i).replace(/[{}]/g, '').replace('_', ' '), T(hc.solution[i]), T(fem), T(hc.solution[i] - fem, 2)];
      }),
    });
    const xs = [...new Set(mesh.nodes.map((nd) => nd.x))];
    const lrSingle = lr;
    const mRows = xs.map((x) => {
      const ei = Math.max(0, mesh.elements.findIndex((e) => x >= e.x1 - 1e-12 && x <= e.x2 + 1e-12 && (x < e.x2 - 1e-12 || e.index === mesh.elements.length - 1)));
      const eL = mesh.elements.findIndex((e) => Math.abs(e.x2 - x) < 1e-12);
      const eR = mesh.elements.findIndex((e) => Math.abs(e.x1 - x) < 1e-12);
      const femL = eL >= 0 ? evalElement(prep, lrSingle, eL, mesh.elements[eL].L).M : evalElement(prep, lrSingle, ei, 0).M;
      const femR = eR >= 0 ? evalElement(prep, lrSingle, eR, 0).M : femL;
      const hl = handMoment(hc, x, 'left');
      const hr = handMoment(hc, x, 'right');
      return [T(x), T(hl), T(femL), T(hr), T(femR), T(Math.max(Math.abs(hl - femL), Math.abs(hr - femR)), 2)];
    });
    blocks.push({ type: 'p', text: t('report.hand.sections') });
    blocks.push(
      paged(
        t('report.hand.sectionTable'),
        chunk(mRows, 25).map((c, i) => ({
          label: String(i + 1),
          blocks: [{ type: 'table', head: ['x [m]', 'M⁻ (Hand)', 'M⁻ (FEM)', 'M⁺ (Hand)', 'M⁺ (FEM)', '|Δ|'], rows: c } as Block],
        })),
        3,
        1,
        true,
      ),
    );
  }

  return { title: model.name || t('app.title'), loadSetLabel, blocks };
}
