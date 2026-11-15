/**
 * M1a regfix 3 (hero-anim) — melee's `A-stow-clearance` for `session.mjs --extra-rows`, run on its own FRESH page:
 * the row as tools/gates.r5.melee.mjs writes it (its bars untouched), with
 *  - the studio taken out of the page first (kept-stack `NO_STUDIO`, as kept-rows.mjs does for its rows: on a freshly
 *    booted page the studio is still a system; every earlier pass of this row ran after a kept row had removed it);
 *  - its timeout 300 s (it walks 1392 frames of chase sweep; on a fresh page at 662fb68 it ran past its own 150 s);
 *  - a progress mark in the page (`window.__rowProg`: the leg it is in, the yaw, the frames drawn since it began), so
 *    a row cut by its timeout says where it was (session.mjs reads it into the row's detail).
 */
import { NO_STUDIO } from '../kept-stack.mjs';
import { GATES as MELEE } from '../../gates.r5.melee.mjs';

const src = MELEE.find((g) => g.id === 'A-stow-clearance');
const PATCHES = [
  ['const runFor = async (tag, sec) => {',
    'const __f0 = C.renderer?.info?.render?.frame ?? 0, __t0 = performance.now(); const __prog = (o) => { window.__rowProg = { ...o, frames: (C.renderer?.info?.render?.frame ?? 0) - __f0, s: +((performance.now() - __t0) / 1000).toFixed(1) }; }; const runFor = async (tag, sec) => { __prog({ leg: tag });'],
  ['p.camYaw = (y / 24) * Math.PI * 2;', 'p.camYaw = (y / 24) * Math.PI * 2; __prog({ leg: moving ? "running sweep" : "standing sweep", yaw: y });'],
];
let body = String(src.assert);
const missed = PATCHES.filter(([from]) => !body.includes(from)).map(([from]) => from.slice(0, 60));
for (const [from, to] of PATCHES) body = body.split(from).join(to);
export const GATES = [missed.length
  ? { id: 'A-stow-clearance', kind: 'action', lane: 'hero-anim', title: src.title, assert: `({ pass: false, detail: ${JSON.stringify({ reason: 'progress patch did not apply', missed })} })` }
  : { ...src, timeout: 300000, assert: body, setup: `${NO_STUDIO}; window.__rowProg = null; ${src.setup || ''}` }];
