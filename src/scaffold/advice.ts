/**
 * Plain answer of the scaffold analysis for the designer: does the scaffold work, what has to be put
 * right in the model first, and what to change in the scaffold where it does not work.
 *
 * Preliminary design: utilisation up to 70 % works, 70 … 100 % is to be confirmed by the structural
 * engineer (the comparison with PERI ForceControl shows deviations of that order), above 100 % it does
 * not work.
 */
import type { CheckKind, ScaffoldResult } from './analysis';
import type { ImportAudit, ModelNote, ScaffoldModel } from './model';
import type { ScaffoldIssue } from './structure';

/** utilisation up to which the scaffold works without doubt / from which it does not */
export const ETA_OK = 0.7;
export const ETA_FAIL = 1;

/**
 * 'model': the model has to be put right before the result means anything; 'fail': does not work;
 * 'check': works with little reserve (to the structural engineer); 'ok': works
 */
export type Verdict = 'model' | 'fail' | 'check' | 'ok';

export interface Finding {
  /** i18n key under scaffold.advice.fix / scaffold.advice.do */
  key: string;
  /** 'block': the result is not reliable; 'fail': does not work; 'warn': to be checked; 'info' */
  level: 'block' | 'fail' | 'warn' | 'info';
  parts: string[];
  params?: Record<string, string | number>;
}

export interface Assessment {
  verdict: Verdict;
  /** largest utilisation of all checks */
  maxEta: number;
  /** what has to be put right in the model (drawing, fixings, input) */
  fix: Finding[];
  /** what to change in the scaffold so that it works */
  todo: Finding[];
}

export interface AssessInput {
  issues: ScaffoldIssue[];
  /** result of the analysis and the model it belongs to; null before the first run */
  result: ScaffoldResult | null;
  notes?: ModelNote[];
  audit?: ImportAudit;
  defects?: ScaffoldModel['defects'];
  /** lattice girders checked in the beam calculator */
  girders?: { key: string; eta: number; parts: string[] }[];
  /**
   * outdoors without a maximum wind, and why: no site ('site' or true), no wind zone found for it
   * ('zone'), no wind map for its country ('vb0'), q_p entered as 0 ('qp')
   */
  noMaxWind?: boolean | 'site' | 'zone' | 'vb0' | 'qp';
  /** height and smallest width of the scaffold in plan, m */
  height?: number;
  width?: number;
  /** anchors of the drawing and fixings set by the user */
  held?: number;
}

/** checks answered by the same measure */
const GROUPS: { key: string; checks: CheckKind[] }[] = [
  { key: 'stability', checks: ['stability', 'unstable'] },
  { key: 'uplift', checks: ['uplift'] },
  { key: 'node', checks: ['conn', 'node', 'rosette'] },
  { key: 'standard', checks: ['tube', 'buckling', 'joint'] },
  { key: 'ledger', checks: ['ledger'] },
  { key: 'bracket', checks: ['bracket'] },
  { key: 'diagonal', checks: ['diagonal'] },
  { key: 'jack', checks: ['jack'] },
  { key: 'tie', checks: ['anchor', 'fixing', 'scaffoldTube'] },
  // tubes on couplers between standards (bracing, a tube instead of a ledger): no anchors
  { key: 'coupler', checks: ['coupler'] },
  { key: 'deck', checks: ['deck'] },
];

/** issues of the import that have to be put right in the drawing, and notes of the model of that kind */
const ISSUE_FIX = new Set(['duplicate', 'noGeometry', 'aecParts', 'exportedGroups', 'ledgerOneEndDecked', 'noDiagonals', 'healCheck', 'unknownParts']);
const NOTE_FIX = new Set(['ledgerLoose', 'diagonalFree', 'diagonalType', 'tubeFree', 'bracketFree', 'floating', 'deckNoSupport', 'columnHanging', 'spliceFree', 'userLoadIgnored', 'fixingIgnored', 'jackLong']);

/** direction (x / y) of most of the combinations, if it is clear */
function mainDir(combos: string[]): 'x' | 'y' | null {
  let x = 0;
  let y = 0;
  for (const c of combos) {
    if (/x$/.test(c)) x++;
    else if (/y$/.test(c)) y++;
  }
  const n = x + y;
  if (!n) return null;
  return x >= 0.75 * n ? 'x' : y >= 0.75 * n ? 'y' : null;
}

export function assessScaffold(inp: AssessInput): Assessment {
  const fix: Finding[] = [];
  const todo: Finding[] = [];
  const res = inp.result;

  // ---- the model
  for (const d of inp.defects ?? []) fix.push({ key: 'defect', level: 'block', parts: d.parts, params: { n: d.parts.length } });
  if (res) {
    const mech = res.combos.filter((c) => !c.ok).map((c) => c.name);
    if (mech.length) fix.push({ key: 'mechanism', level: 'block', parts: res.unstable, params: { names: mech.join(', ') } });
    else if (res.unstable.length) fix.push({ key: 'unheld', level: 'block', parts: res.unstable, params: { n: res.unstable.length } });
    const open = res.combos.filter((c) => c.ok && !c.converged).map((c) => c.name);
    if (open.length) fix.push({ key: 'notConverged', level: 'warn', parts: [], params: { names: open.join(', ') } });
  }
  for (const l of inp.audit?.listed ?? []) {
    if (l.fate === 'noWeight') continue;
    fix.push({ key: l.fate === 'loose' ? 'loose' : 'lost', level: 'warn', parts: l.parts, params: { n: l.parts.length, name: l.name } });
  }
  // parts drawn twice: one remark for all of them
  const dup = inp.issues.filter((i) => i.key === 'duplicate');
  if (dup.length) {
    const names = [...new Set(dup.map((i) => String(i.params?.name ?? '')))].filter(Boolean);
    fix.push({ key: 'duplicates', level: 'warn', parts: dup.flatMap((i) => i.parts), params: { n: dup.length, names: names.slice(0, 4).join(', ') + (names.length > 4 ? ' …' : '') } });
  }
  for (const i of inp.issues) {
    if (i.key === 'duplicate') continue;
    if (!ISSUE_FIX.has(i.key) || (i.severity !== 'warning' && i.key !== 'unknownParts')) continue;
    fix.push({ key: `issue.${i.key}`, level: 'warn', parts: i.parts, params: i.params as Record<string, string | number> });
  }
  for (const n of inp.notes ?? []) {
    if (!NOTE_FIX.has(n.key)) continue;
    // loose ledgers and free diagonals are in the audit already
    if (inp.audit?.listed.some((l) => l.fate === 'loose') && (n.key === 'ledgerLoose' || n.key === 'diagonalFree' || n.key === 'tubeFree' || n.key === 'bracketFree')) continue;
    fix.push({ key: `note.${n.key}`, level: 'warn', parts: n.parts, params: { ...n.params, n: n.parts.length } });
  }
  if (inp.noMaxWind) {
    const key = { site: 'noMaxWind', zone: 'noWindZone', vb0: 'noVb0', qp: 'noQp' }[inp.noMaxWind === true ? 'site' : inp.noMaxWind];
    fix.push({ key, level: 'warn', parts: [] });
  }
  // slender and not held: it will overturn without ties or ballast
  const slender = inp.height && inp.width ? inp.height / Math.max(inp.width, 0.1) : 0;
  if (slender > 3 && !inp.held) fix.push({ key: 'slender', level: res ? 'warn' : 'info', parts: [], params: { r: Math.round(slender * 10) / 10 } });

  // ---- the scaffold
  let maxEta = 0;
  if (res) {
    const lost = res.combos.filter((c) => c.stability?.length);
    if (lost.length) {
      const parts = [...new Set(lost.flatMap((c) => c.stability!))];
      const dir = mainDir(lost.map((c) => c.name));
      todo.push({ key: 'stabilityLost', level: 'fail', parts, params: { names: lost.map((c) => c.name).join(', '), ...(dir ? { dir } : {}) } });
    }
    for (const g of GROUPS) {
      const cs = res.checks.filter((c) => g.checks.includes(c.check));
      if (!cs.length) continue;
      const max = cs.reduce((m, c) => Math.max(m, c.eta), 0);
      // mechanisms and lost stability are reported above
      if (g.key === 'stability') continue;
      maxEta = Math.max(maxEta, max);
      const bad = cs.filter((c) => c.eta > ETA_FAIL);
      const near = cs.filter((c) => c.eta > ETA_OK && c.eta <= ETA_FAIL);
      const list = bad.length ? bad : near;
      if (!list.length) continue;
      const dir = mainDir(list.map((c) => c.combo));
      // ledgers bent out of service (no or a part of the service load): by the sway under the wind
      const sway = g.key === 'ledger' && list.every((c) => /^[RS] /.test(c.combo));
      todo.push({
        key: sway ? 'ledgerSway' : g.key,
        level: bad.length ? 'fail' : 'warn',
        parts: [...new Set(list.map((c) => c.part))],
        params: { n: new Set(list.map((c) => c.part)).size, eta: Math.round(max * 100), ...(dir ? { dir } : {}) },
      });
    }
    // bases lifting off is allowed, but tells that the scaffold rocks
    const lifted = res.bases.filter((b) => b.lifted);
    if (lifted.length && !todo.some((t) => t.key === 'uplift')) todo.push({ key: 'lifted', level: 'info', parts: lifted.map((b) => b.part), params: { n: lifted.length } });
    // sway
    const dh = res.combos.reduce((m, c) => (c.ok ? Math.max(m, c.dh) : m), 0);
    if (inp.height && dh > inp.height / 100) todo.push({ key: 'sway', level: 'warn', parts: [], params: { mm: Math.round(dh * 1000), ratio: Math.round(inp.height / dh) } });
  }
  for (const g of inp.girders ?? []) {
    if (!(g.eta > ETA_OK)) continue;
    maxEta = Math.max(maxEta, g.eta);
    todo.push({ key: 'girder', level: g.eta > ETA_FAIL ? 'fail' : 'warn', parts: g.parts, params: { name: g.key, eta: Math.round(g.eta * 100) } });
  }
  const order = { block: 0, fail: 1, warn: 2, info: 3 };
  fix.sort((a, b) => order[a.level] - order[b.level]);
  // lost stability first, then by the utilisation
  const rank = (t: Finding) => (t.key === 'stabilityLost' ? Infinity : Number(t.params?.eta ?? 0));
  todo.sort((a, b) => order[a.level] - order[b.level] || rank(b) - rank(a));

  // several failures from the horizontal load in one direction: say the common cause first
  const failing = todo.filter((t) => t.level === 'fail' && t.params?.dir);
  for (const d of ['x', 'y'] as const) {
    const n = failing.filter((t) => t.params!.dir === d).length;
    const other = failing.length - n;
    if (n >= 2 && n > other && todo.some((t) => t.key === 'stabilityLost' || t.key === 'sway' || t.key === 'uplift')) {
      todo.unshift({ key: 'rootHorizontal', level: 'fail', parts: [], params: { axis: d.toUpperCase() } });
      break;
    }
  }
  // the verdict follows the scaffold; remarks on the model that do not block are shown beside it
  const verdict: Verdict = fix.some((f) => f.level === 'block') ? 'model' : todo.some((t) => t.level === 'fail') ? 'fail' : todo.some((t) => t.level === 'warn') ? 'check' : 'ok';
  return { verdict, maxEta, fix, todo };
}
