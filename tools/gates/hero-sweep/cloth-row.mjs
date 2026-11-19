/**
 * The cloth lane's page rows for `session.mjs --extra-rows` (owned by the cloth lane, brief §2).
 *
 * C-crowd-cost (step 2, TECH 9 with the Saltrow crowd in view): reads what clips-cloth.mjs's `cCrowd` clip measured
 * (run the session with `--clips-first` so the clip comes before the rows): the game step's real time a frame on the
 * sim-time slate, the people near, each near person's cloth ring (cloth/strands.js) and Brea's. Bars: a near person's
 * cloth mean <= 0.02 ms; all cloth (Brea + people) <= 0.30 ms; the step reported against the 16.7 ms frame (the GPU is not
 * read here: tools/perf/attrib.mjs is its own session).
 */
import { NO_STUDIO } from '../kept-stack.mjs';
import { GATES as BODY } from '../../gates.r5.hero-body.mjs';
import { GATES as MELEE } from '../../gates.r5.melee.mjs';

/** (fix round 1) The kept rows C12 names that read the cloth (the kept `dyn_` bones and chains), from their own lane files
 *  as they stand (none is restated in kept-stack.mjs), with the studio out first as `--kept-stack` runs them; not edited
 *  here, only gathered so the cloth lane's one session runs them: pick with `--extra-only`. */
const KEPT = ['A33-hair-bounce', 'A33-rig-finite', 'A34-chains-driven', 'A-wrap-clear', 'A-tail-legible', 'A100-lance-holster'];
const keptRows = KEPT.map((id) => [...BODY, ...MELEE].find((g) => g.id === id)).filter(Boolean).map((g) => ({ ...g, setup: `${NO_STUDIO}; ${g.setup || ''}` }));

export const GATES = [
  ...keptRows,
  {
    id: 'C-crowd-cost', kind: 'action', lane: 'cloth', timeout: 20000,
    title: 'Cloth cost with the Saltrow crowd in view (F22 staging): a near person <= 0.02 ms mean, all cloth <= 0.30 ms',
    setup: '',
    assert: `(() => {
      const s = window.__crowdStats;
      if (!s) return { pass: false, detail: { reason: 'no cCrowd clip ran before this row (session --clips-first --clips cCrowd)' } };
      const per = s.people.map((q) => q.timing?.mean || 0), worst = per.length ? Math.max(...per) : 0;
      const all = (s.brea?.mean || 0) + s.peopleMeanSum;
      return { pass: s.people.length > 0 && worst <= 0.02 && all <= 0.30, detail: { ...s, worstPersonMs: +worst.toFixed(4), allClothMs: +all.toFixed(4) } };
    })()`,
  },
  // (cloth round 6) the Holds people (F36's street at work) and Oro (F37) on the same bars, from the cHolds and cOro clips
  ...[['C-holds-cost', '__holdsStats', 'cHolds', 'the Holds people at work in view (F36 staging)'], ['C-oro-apron', '__oroStats', 'cOro', "Oro beside her (F37 staging), his apron on the solver"]].map(([id, key, clip, what]) => ({
    id, kind: 'action', lane: 'cloth', timeout: 20000,
    title: `Cloth cost with ${what}: a near person <= 0.02 ms mean, all cloth <= 0.30 ms` + (id === 'C-oro-apron' ? '; his apron chains on the shared solver' : ''),
    setup: '',
    assert: `(() => {
      const s = window.${key};
      if (!s) return { pass: false, detail: { reason: 'no ${clip} clip ran before this row (session --clips-first --clips ${clip})' } };
      const per = s.people.map((q) => q.timing?.mean || 0), worst = per.length ? Math.max(...per) : 0;
      const all = (s.brea?.mean || 0) + s.peopleMeanSum;
      const oro = (s.cast || []).find((q) => /oro/.test(q.arch || q.id || ''));
      const apron = !!(oro && Array.isArray(oro.strands) && oro.strands.some((n) => /apron/.test(n)));
      const ok = s.people.length > 0 && worst <= 0.02 && all <= 0.30 && (${id === 'C-oro-apron'} ? apron : true);
      return { pass: ok, detail: { ...s, worstPersonMs: +worst.toFixed(4), allClothMs: +all.toFixed(4), oroApronOnSolver: apron } };
    })()`,
  })),
];
