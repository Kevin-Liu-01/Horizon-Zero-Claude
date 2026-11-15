/**
 * M1a r2 fix (hero-anim) — hero-anim's kept and lane rows for `session.mjs --extra-rows`, as `tools/gates.mjs`
 * registers them: each row from its lane file with the M1a freeze's RESTATED patches applied (the same rule as
 * gates.mjs `restate`: a patch that no longer applies is a red runner row), and the studio taken out of the page
 * first (kept-stack `NO_STUDIO`, as `--kept-stack` does). So the rows run in hero-anim's one Chrome session, on
 * one boot, with the frames and the sweep rows. Pick rows with `--extra-only`.
 */
import { RESTATED, NO_STUDIO } from '../kept-stack.mjs';
import { GATES as MELEE } from '../../gates.r5.melee.mjs';
import { GATES as BODY } from '../../gates.r5.hero-body.mjs';

const restatedById = new Map(RESTATED.map((x) => [x.id, x]));
const restate = (g) => {
  const r = restatedById.get(g.id);
  if (!r) return g;
  if (r.row) return { ...r.row, restated: r.why };
  let body = String(g.assert);
  const missed = r.patches.filter(([from]) => !body.includes(from)).map(([from]) => from.slice(0, 80));
  if (missed.length) return { id: g.id, kind: 'action', lane: 'kept-stack', title: `${g.id}: the restatement no longer applies`, assert: `({ pass: false, detail: ${JSON.stringify({ reason: 'restated patch did not apply', missed })} })` };
  for (const [from, to] of r.patches) body = body.split(from).join(to);
  return { ...g, assert: body, restated: r.why };
};
const IDS = ['A107-draw-arm-path', 'A104-melee-self-clear', 'A105-melee-while-moving', 'A32-draw-ramp', 'A-draw-elbow-level', 'A16-draw-anchor', 'A17-draw-beats',
  // (M1a r3: the visual rows the round-2 review failed, filmed by session.mjs on a fresh page each, not graded)
  'V1-sprint-frame', 'V3-crouch-stalk', 'V13-aim-strafe', 'V-traversal'];
const all = [...MELEE, ...BODY];
export const GATES = IDS.map((id) => all.find((g) => g.id === id)).filter(Boolean).map(restate)
  .map((g) => ({ ...g, setup: `${NO_STUDIO}; ${g.setup || ''}` }));
