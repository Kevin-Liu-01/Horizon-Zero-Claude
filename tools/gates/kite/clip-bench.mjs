// M3 area B, wave 2: THE KITE'S CLIPS graded in Node on Brea dressed (her real animator stepped at 60 Hz: the hero
// sweep's bench), every step of the open, the glide, the banks, the fold, the landing's fold and the forced reef (R5),
// driven by the flight law itself (src/game/kite/flight.js stepFlight: the state and the seconds in it go to
// animator.setKiteFlight, as the page will). The Survey Kite (src/entities/anim/kite/surveyKite.js) is placed and furled
// from the hang's solve on every step. No browser.
//   node tools/gates/kite/clip-bench.mjs [--json <file>]
// The owner's bar (binding): never an arm or a hand behind the head. KF1: 0 steps with a wrist behind the head plane or
// above head height, or an elbow above its shoulder joint; no hand passes behind the head in the open or the fold.
// Graded on two reads of "behind the head plane", both must hold: the head's own frontal plane through the skull's
// centre (the hero sweep's `hangCheck`, wave 1's static row) and the vertical plane through the head bone square to
// her facing (the page's read in tools/frames/stagings/m3-kite.mjs). Also read: the kite's and the roll's nearest
// vertex to her head (a 0.12 m sphere at the skull's centre) and to her trunk (pelvis to neck, 0.16 m round).
import { writeFileSync } from 'node:fs';
import { makeBench, step, reset } from '../hero-sweep/bench.mjs';
import { buildSweep } from '../hero-sweep/measure.mjs';
import { THREE } from '../hero-sweep/load.mjs';
import { buildSurveyKite, placeKite } from '../../../src/entities/anim/kite/surveyKite.js';
import { createFlightBody, openAt, stepFlight, KITE } from '../../../src/game/kite/flight.js';
import { CLIP_S } from '../../../src/entities/anim/kite/kiteClips.js';
import { flatWorld } from './world.mjs';

const args = process.argv.slice(2);
const out = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const r3 = (v) => +v.toFixed(3);

// the clips' lengths are the law's
for (const [k, v] of [['open', KITE.openS], ['fold', KITE.foldS], ['land', KITE.landS]]) if (Math.abs(CLIP_S[k] - v) > 1e-9) throw new Error(`kiteClips CLIP_S.${k} ${CLIP_S[k]} is not the law's ${v}`);

const R = await makeBench();
const M = buildSweep(R, THREE);
const an = R.an, b = an.b, p = R.player;
const root = an.space?.root || R.model;
const K = buildSurveyKite({ furl: 0 });
root.add(K.group);
const V = () => new THREE.Vector3();
const tmp = V(), tmp2 = V(), head = V(), hb = V(), fwd = V(), seg = new THREE.Line3();
const pos = K.mesh.geometry.attributes.position;
const TRUNK = ['pelvis', 'spine1', 'spine2', 'spine3', 'spine4', 'spine5', 'neck1'].filter((k) => b[k]);

/** one step's read */
function read() {
  const h = M.hangCheck();
  R.model.updateMatrixWorld(true);
  b.head.bone.getWorldPosition(hb);
  fwd.set(Math.sin(p.heading), 0, Math.cos(p.heading));
  const r = { L: {}, R: {} };
  for (const s of ['L', 'R']) {
    const w = b[`hand${s}`].bone.getWorldPosition(V()), e = an._charOf(b[`loArm${s}`].bone, V()), sh = an._charOf(b[`upArm${s}`].bone, V());
    const hc = h[s.toLowerCase()];
    r[s] = { frontHeadFrame: hc.front, frontFacing: tmp.subVectors(w, hb).dot(fwd), belowHead: hc.belowHeadBoneM, elbowOver: e.y - sh.y };
  }
  // the kite: nearest vertex to the head's sphere and to the trunk
  const info = an.hangPoseInfo();
  let headClear = Infinity, trunkClear = Infinity;
  if (info && an._kiteFl?.state !== 'none') {
    placeKite(K, root, info);
    const mw = K.mesh.matrixWorld;
    head.copy(hb).add(tmp.set(0, 0.1, 0));
    const tr = TRUNK.map((k) => b[k].bone.getWorldPosition(V()));
    for (let i = 0; i < pos.count; i += 2) {
      tmp.fromBufferAttribute(pos, i).applyMatrix4(mw);
      headClear = Math.min(headClear, tmp.distanceTo(head) - 0.12);
      for (let j = 0; j + 1 < tr.length; j++) { seg.set(tr[j], tr[j + 1]); seg.closestPointToPoint(tmp, true, tmp2); trunkClear = Math.min(trunkClear, tmp.distanceTo(tmp2) - 0.16); }
    }
  }
  const hc = an._charOf(b.head.bone, V());
  return { ...r, headClear, trunkClear, headChar: [r3(hc.x), r3(hc.y), r3(hc.z)], kitePos: info?.kite?.pos?.map(r3) ?? null, clip: info?.kite?.clip ?? null, phase: info?.kite?.phase ?? null, furl: info?.kite?.furl ?? null };
}

/** Fly a scenario by the law, posing her from its state each step; grade every step whose state is not 'none'. */
function scenario(name, { airborne = true, y = 30, input = () => ({}), weather = () => 'trade', maxS = 20 }) {
  reset(R);
  const f = createFlightBody(), world = flatWorld({ flyable: () => !['calima', 'squall'].includes(weather(tt)) });
  let tt = 0;
  if (airborne) { R.ctx.events?.emit?.('player-jump', { v0: 5 }); p.grounded = false; }
  // the jump's 0.35 s before Space may open it (not the kite's: not graded)
  for (let i = 0; i < 21; i++) step(R);
  let s = openAt(f, { x: 0, y, z: 0, headingDeg: 0, groundY: 0 });
  const steps = [];
  let landed = false;
  while (tt < maxS) {
    an.setKiteFlight(s, f.t, { bank: input(tt, s).bank || 0, forced: !!f.forced });
    step(R);
    const r = read();
    steps.push({ t: r3(tt), state: s, ...r });
    if (s === 'landing' && !landed) { landed = true; p.grounded = true; R.ctx.events?.emit?.('player-land', { fall: 0.5 }); }
    if (s === 'none') break;
    s = stepFlight(s, f, input(tt, s), world, 1 / 60);
    tt += 1 / 60;
  }
  an.setKiteFlight('none');
  for (let i = 0; i < 10; i++) step(R);
  p.grounded = true;
  return { name, steps };
}

const ramp = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const S = [
  scenario('open, glide, bank left, bank right, fold (airborne)', { input: (t) => ({
    bank: t < 1.5 ? 0 : t < 3 ? -ramp(t, 1.5, 2) : t < 5 ? -1 + 2 * ramp(t, 3, 4) : 1 - ramp(t, 5, 5.5), fold: t >= 6 }) }),
  scenario('open, glide, bank, fold (from standing: the idle under it)', { airborne: false, input: (t) => ({ bank: t > 1 && t < 2.5 ? 0.6 : 0, fold: t >= 3 }) }),
  scenario('open at 4 m, glide, flare, landing', { y: 4, maxS: 10 }),
  scenario('fold at 3 m', { y: 3.5, input: (t) => ({ fold: t >= 0.55 }) }),
  scenario('calima mid-glide: the forced fold (R5 reef) to the ground', { y: 25, weather: (t) => (t > 1.2 ? 'calima' : 'trade'), maxS: 12 }),
  scenario('calima mid-open: the forced fold from the open', { y: 25, weather: (t) => (t > 0.25 ? 'calima' : 'trade'), maxS: 12 }),
];

const CLIPS = ['open', 'glide', 'fold', 'land', 'reef'];
const per = Object.fromEntries(CLIPS.map((c) => [c, { steps: 0, frontHeadFrame: Infinity, frontFacing: Infinity, belowHead: Infinity, elbowOver: -Infinity, headClear: Infinity, trunkClear: Infinity, worst: null }]));
let total = 0, bad = 0, badFacing = 0, handsFree = 0;
const badSteps = [], badFacingSteps = [];
for (const sc of S) for (const st of sc.steps) {
  if (st.state === 'none' || !per[st.clip]) continue;
  // the clip's last step (phase 1 of the fold or the landing's fold) is HANDS FREE: her own idle or fall pose, not the
  // kite's (her standing idle reads its right wrist 0.03 m behind the head-frame plane by itself); counted, not graded
  if ((st.clip === 'fold' || st.clip === 'land') && st.phase >= 0.999) { handsFree++; continue; }
  const P = per[st.clip];
  P.steps++; total++;
  let isBad = false, isBadF = false;
  for (const s of ['L', 'R']) {
    const x = st[s];
    if (x.frontHeadFrame < P.frontHeadFrame) { P.frontHeadFrame = x.frontHeadFrame; P.worst = { scenario: sc.name, t: st.t, side: s, phase: r3(st.phase) }; }
    P.frontFacing = Math.min(P.frontFacing, x.frontFacing); P.belowHead = Math.min(P.belowHead, x.belowHead); P.elbowOver = Math.max(P.elbowOver, x.elbowOver);
    // KF1 as the hero sweep and wave 1 grade it (the head-frame plane through the skull's centre)
    if (!(x.frontHeadFrame > 0 && x.belowHead >= 0 && x.elbowOver < 0)) isBad = true;
    if (!(x.frontFacing > 0)) isBadF = true;
  }
  if (Number.isFinite(st.headClear) && st.headClear < P.headClear) { P.headClear = st.headClear; P.headAt = { scenario: sc.name, t: st.t, phase: r3(st.phase), furl: r3(st.furl), head: st.headChar, kite: st.kitePos }; }
  if (Number.isFinite(st.trunkClear) && st.trunkClear < P.trunkClear) { P.trunkClear = st.trunkClear; P.trunkAt = { scenario: sc.name, t: st.t, phase: r3(st.phase), furl: r3(st.furl) }; }
  if (isBad) { bad++; if (badSteps.length < 12) badSteps.push({ scenario: sc.name, t: st.t, clip: st.clip, phase: r3(st.phase), L: st.L, R: st.R }); }
  if (isBadF) { badFacing++; if (badFacingSteps.length < 12) badFacingSteps.push({ scenario: sc.name, t: st.t, clip: st.clip, phase: r3(st.phase), L: r3(st.L.frontFacing), R: r3(st.R.frontFacing) }); }
}
const rows = {};
for (const c of CLIPS) { const P = per[c]; rows[c] = { steps: P.steps, minWristFront_headFrame_m: r3(P.frontHeadFrame), minWristFront_facing_m: r3(P.frontFacing), minWristBelowHeadBone_m: r3(P.belowHead), maxElbowOverShoulder_m: r3(P.elbowOver), kiteMinHeadClear_m: Number.isFinite(P.headClear) ? r3(P.headClear) : null, kiteMinTrunkClear_m: Number.isFinite(P.trunkClear) ? r3(P.trunkClear) : null, worstAt: P.worst, headAt: P.headAt ?? null, trunkAt: P.trunkAt ?? null }; }
let kiteClear = Infinity, rollClear = Infinity;
for (const c of CLIPS) { const P = per[c]; if (Number.isFinite(P.headClear)) kiteClear = Math.min(kiteClear, P.headClear); if (Number.isFinite(P.trunkClear)) rollClear = Math.min(rollClear, P.trunkClear); }
const res = { steps: total, badSteps: bad, pass: bad === 0 && total > 0, handsFreeSteps: handsFree,
  facing: { badSteps: badFacing, note: 'the stricter read (the vertical plane through the head BONE, square to her facing): fails only where a hand is being handed back to her own pose', first: badFacingSteps },
  kiteClearOfHead_m: r3(kiteClear), kiteClearOfTrunk_m: r3(rollClear), rows, firstBad: badSteps, scenarios: S.map((s) => ({ name: s.name, steps: s.steps.length, states: [...new Set(s.steps.map((x) => x.state))], clips: [...new Set(s.steps.map((x) => x.clip))] })),
  kite: { triangles: K.triangles, draws: K.draws } };
console.log(JSON.stringify(res, null, 1));
if (out) writeFileSync(out, JSON.stringify(res, null, 1));
