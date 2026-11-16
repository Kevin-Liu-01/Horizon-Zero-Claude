/**
 * The cloth lane's page rows for `session.mjs --extra-rows` (owned by the cloth lane, brief §2).
 *
 * C-crowd-cost (step 2, TECH 9 with the Saltrow crowd in view): reads what clips-cloth.mjs's `cCrowd` clip measured
 * (run the session with `--clips-first` so the clip comes before the rows): the game step's real time a frame on the
 * sim-time slate, the people near, each near person's cloth ring (cloth/strands.js) and Brea's. Bars: a near person's
 * cloth mean <= 0.02 ms; all cloth (Brea + people) <= 0.30 ms; the step reported against the 16.7 ms frame (the GPU is not
 * read here: tools/perf/attrib.mjs is its own session).
 */
export const GATES = [
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
];
