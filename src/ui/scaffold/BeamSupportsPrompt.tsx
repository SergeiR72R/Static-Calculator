import { useMemo, useState } from 'react';
import { beamEndFixings, beamsWithoutSupports, type BeamEnd } from '../../scaffold/beamSupports';
import { useScaffold } from '../../scaffold/store';
import type { ScaffoldStructure } from '../../scaffold/structure';
import { Button, Card } from '../common';
import { useFmt, type Fmt } from '../hooks';

/** the beam ends without supports in the drawing (with the fixings already set) */
export function useBeamEnds(st: ScaffoldStructure): BeamEnd[] {
  const sc = useScaffold();
  return useMemo(() => beamsWithoutSupports(st, { suspended: sc.supportsManual, fixings: sc.fixings }), [st, sc.supportsManual, sc.fixings]);
}

/** name of the support proposed at a beam end */
export function beamEndName(t: Fmt['t'], e: BeamEnd): string {
  return t('scaffold.beamEnds.fixName', { name: e.name, end: t(e.at === 0 ? 'scaffold.beamEnds.start' : 'scaffold.beamEnds.end') });
}

/**
 * Asked once a drawing is open: beams (SRU / RCS) without supports in it — supported at their ends? The
 * supports so set are fixings by hand: in "Fixings" they can be removed, moved or others added.
 */
export function BeamSupportsPrompt({ st }: { st: ScaffoldStructure }) {
  const fmt = useFmt();
  const sc = useScaffold();
  const ends = useBeamEnds(st);
  // "later": asked again with the next drawing (or the next visit)
  const [later, setLater] = useState<string | null>(null);
  const beams = new Set(ends.map((e) => e.part));
  if (sc.beamEnds !== 'auto' || !beams.size || later === sc.doc?.fileName) return null;
  const yes = () => {
    sc.addFixings(beamEndFixings(ends, (e) => beamEndName(fmt.t, e)));
    sc.setBeamEnds('user');
    sc.select([...beams]);
  };
  return (
    <Card className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40" testId="scaffold-beam-prompt">
      <p className="text-sm font-semibold">{fmt.t('scaffold.beamEnds.question', { n: beams.size })}</p>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{fmt.t('scaffold.beamEnds.explain')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={yes} data-testid="scaffold-beam-yes">
          {fmt.t('scaffold.beamEnds.yes', { n: ends.length })}
        </Button>
        <Button size="sm" onClick={() => sc.setBeamEnds('user')} data-testid="scaffold-beam-no">
          {fmt.t('scaffold.beamEnds.no')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setLater(sc.doc?.fileName ?? '')} data-testid="scaffold-beam-later">
          {fmt.t('scaffold.beamEnds.later')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => sc.select([...beams])} data-testid="scaffold-beam-show">
          {fmt.t('scaffold.beamEnds.show')}
        </Button>
      </div>
    </Card>
  );
}
