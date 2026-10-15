/**
 * ROUND 5 · human-pipeline proof — the EXISTING name-free gates, re-run on the
 * CC0 UBC heroine (`?poc=human`). Same assert bodies, same bars; only the id
 * (suffix `@poc-human`) and the URL flag differ. Gates that read Aloy bone or
 * chain names (A11, A16, A35, A19, A33-hair-bounce, A34, A104 …) are left out
 * on purpose: they need re-staging through the rig profile first.
 *
 *   node tools/gates.mjs --port 5240 --extra tools/r5-poc/gates.r5-poc-human.mjs \
 *     --only A1-boot-clean@poc-human,A9-perf-budget@poc-human,A12-clip-driven@poc-human,\
 *            A13-no-skate@poc-human,A15-foot-flat@poc-human,A33-rig-finite@poc-human
 */
import { GATES as BASE } from '../gates.config.mjs';

const PICK = ['A1-boot-clean', 'A9-perf-budget', 'A12-clip-driven', 'A13-no-skate', 'A15-foot-flat', 'A33-rig-finite'];

export const GATES = BASE
  .filter((g) => PICK.includes(g.id))
  .map((g) => ({
    ...g,
    id: `${g.id}@poc-human`,
    lane: 'r5-poc-human',
    params: [g.params, 'poc=human'].filter(Boolean).join('&'),
  }));
