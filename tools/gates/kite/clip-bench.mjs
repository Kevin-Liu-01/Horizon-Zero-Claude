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
// M3 area B fix round 1 (the judge's FIX LIST 1, 4): EVERY step is graded, on BOTH reads: the clips, the step the state
// turns 'none', her fall after an airborne fold (hangPose.js's after-layer holds her hands in front while she falls) and
// the hand-back to her own pose on the ground, until the kite's layer is off. Nothing is skipped. Beside them: each
// wrist's move in one step (char frame; W1's wrist bar 0.08 m a step outside a swing, handling.js RATE.wristM) and,
// while a hand holds the bar, its palm (0.7 of wrist to middle knuckle, as the handling rows read a palm) to the grip's
// centreline (KF4: "the roll's hand-off obeys W1's palm and wrist bars"; W1's palm bar is 0.010 m off its socket).
// WAVE 2b (the roll carried by her hand; the fold off her face):
//  - KEVIN'S BAR, BINDING, on every step: the M1.3f sweep's own read (tools/gates/hero-sweep/measure.mjs: no hand or
//    forearm point behind the skull, over the crown or at the nape; none above its own shoulder AND behind the head's
//    planes), no wrist above the head bone, no elbow above its shoulder, and no wrist behind either head plane within
//    0.30 m of the head bone's height (the hand-back's rule). Wave 1's strict read (no wrist behind the head's frontal
//    plane at ANY height) is still counted and reported: the take and the seat put the right hand at the small of her
//    back, 0.4-0.5 m under her head, behind that plane by design (as the lance's and bow's stow do); every such step is
//    listed by its height under the head, and the strict read must hold on every other step.
//  - THE PALM ON ITS SOCKET on every step a hand holds (the clip's own `hold`: the bar's grip, or the roll's carry socket
//    kiteClips.js ROLL_TAKE), not wave 2's windows of the clip; and the hand's palm at the take, before the roll is
//    placed from it (how far the roll is pulled off its mount by the hand: the pop).
//  - NO ROLL WITHOUT A HAND: every step the kite moves (> 2 mm or 0.5 deg, on her back's frame: spine_02, which the
//    mount rides) with no hand holding it.
//  - THE FACE: the kite's vertices in the column in front of her face (head-bone frame: +-0.10 m of its x, from 0.06 under
//    it to 0.24 over it, from 0.02 to 1.2 m in front of it); a step with any is a face crossing.
//  - The right forearm and hand against the stowed kit on the back reach (m, < 0 inside it).
import { writeFileSync } from 'node:fs';
import { makeBench, step, reset } from '../hero-sweep/bench.mjs';
import { buildSweep } from '../hero-sweep/measure.mjs';
import { THREE } from '../hero-sweep/load.mjs';
import { buildSurveyKite, placeKite } from '../../../src/entities/anim/kite/surveyKite.js';
import { createFlightBody, openAt, stepFlight, KITE } from '../../../src/game/kite/flight.js';
import { CLIP_S, ROLL_MOUNT } from '../../../src/entities/anim/kite/kiteClips.js';
import { KITE_RECIPE } from '../../../src/entities/anim/kite/surveyKite.js';
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
// the stowed kit on her back and hips (the lance, the bow's mount, the quiver: one skinned mesh), every 3rd vertex
let KIT = null; R.model.traverse((o) => { if (!KIT && o.isSkinnedMesh && o.userData?.heroPart === 'stowkit') KIT = o; });
const kitV = V(), rA = V(), rB = V(), rQ = new THREE.Quaternion(), rootQ = new THREE.Quaternion();
/** the furled roll's nearest approach to the stowed kit (m, surface to vertex), or null when the kite is open */
function rollToKit(info) {
  if (!KIT || !info || info.kite.furl > 0.05) return null;
  root.getWorldQuaternion(rootQ); rQ.fromArray(info.kite.quat).premultiply(rootQ);
  const c = root.localToWorld(V().fromArray(info.kite.pos)), ax = V(1, 0, 0).applyQuaternion(rQ).multiplyScalar(0.475);
  rA.copy(c).sub(ax); rB.copy(c).add(ax); seg.set(rA, rB);
  let m = Infinity;
  for (let i = 0, n = KIT.geometry.attributes.position.count; i < n; i += 3) { KIT.getVertexPosition(i, kitV); KIT.localToWorld(kitV); seg.closestPointToPoint(kitV, true, tmp2); m = Math.min(m, kitV.distanceTo(tmp2) - 0.06); }
  return m;
}
const MID = { L: R.model.getObjectByName('middle_01_l'), R: R.model.getObjectByName('middle_01_r') };
const lastW = { L: null, R: null };
const gq = new THREE.Quaternion(), gA = V(), gB = V(), gC = V();
const TRUNK = ['pelvis', 'spine1', 'spine2', 'spine3', 'spine4', 'spine5', 'neck1'].filter((k) => b[k]);

const faceTmp = V(), kq = new THREE.Quaternion(), kp = V(), lastK = { p: V(), q: new THREE.Quaternion(), ok: false };
const bkP = V(), bkQ = new THREE.Quaternion(), bkQi = new THREE.Quaternion();
/** one step's read */
function read() {
  M.begin('step'); M.sample({ arms: true }); const sw = M.end();
  const h = M.hangCheck();
  R.model.updateMatrixWorld(true);
  b.head.bone.getWorldPosition(hb);
  fwd.set(Math.sin(p.heading), 0, Math.cos(p.heading));
  const r = { L: {}, R: {} };
  for (const s of ['L', 'R']) {
    const w = b[`hand${s}`].bone.getWorldPosition(V()), e = an._charOf(b[`loArm${s}`].bone, V()), sh = an._charOf(b[`upArm${s}`].bone, V());
    const hc = h[s.toLowerCase()];
    const wc = an._charOf(b[`hand${s}`].bone, V());
    const wStep = lastW[s] ? wc.distanceTo(lastW[s]) : 0; lastW[s] = wc;
    r[s] = { frontHeadFrame: hc.front, frontFacing: tmp.subVectors(w, hb).dot(fwd), belowHead: hc.belowHeadBoneM, elbowOver: e.y - sh.y, wStep, palmToGrip: null, palmToSocket: null, hold: null };
  }
  r.sweep = { behind: sw.behind, plane: sw.plane, behindAt: sw.behindAt, planeAt: sw.planeAt };
  // the palm on the bar's grip (char frame), while the clip has that hand on the bar
  {
    const I = an.hangPoseInfo(), P = an._kitePose, kst = an._kiteFl?.state;
    if (I && P && kst && kst !== 'none') {
      gq.fromArray(I.kite.quat);
      for (const s of ['L', 'R']) {
        const H = P[s.toLowerCase()];
        const onBar = H.w > 0.99 && H.curl > 0.99 && (I.kite.clip === 'glide' || I.kite.clip === 'reef' || (I.kite.clip === 'open' && I.kite.phase >= 0.6) || ((I.kite.clip === 'fold' || I.kite.clip === 'land') && I.kite.phase < 0.3));
        if (!onBar) continue;
        const sx = s === 'L' ? 1 : -1, g = KITE_RECIPE.grip * (0.97 + 0.03 * I.kite.furl);
        gA.set(sx * (g - KITE_RECIPE.gripLen / 2), 0, 0).applyQuaternion(gq).add(gC.fromArray(I.kite.pos));
        gB.set(sx * (g + KITE_RECIPE.gripLen / 2), 0, 0).applyQuaternion(gq).add(gC);
        const wc = an._charOf(b[`hand${s}`].bone, V()), mc = an._charOf(MID[s], V()), palm = wc.lerp(mc, 0.7);
        seg.set(gA, gB); seg.closestPointToPoint(palm, true, tmp2);
        r[s].palmToGrip = palm.distanceTo(tmp2);
      }
    }
  }
  // (wave 2b) the palm on its socket, every step the clip says a hand holds: the bar's grip (its centreline, gripLen long)
  // or the roll's carry socket (a point); the kite as placed (hangPoseInfo().kite)
  {
    const I = an.hangPoseInfo(), kst = an._kiteFl?.state;
    if (I && kst && kst !== 'none') {
      kq.fromArray(I.kite.quat); kp.fromArray(I.kite.pos);
      for (const s of ['L', 'R']) {
        const hold = I.kite.hold[s.toLowerCase()];
        r[s].hold = hold;
        if (!hold) continue;
        const loc = V().fromArray(I.kite.loc[s.toLowerCase()]);
        const wc = an._charOf(b[`hand${s}`].bone, V()), mc = an._charOf(MID[s], V()), palm = wc.lerp(mc, 0.7);
        if (hold === 'bar') {
          gA.copy(loc).addScaledVector(V(1, 0, 0), -KITE_RECIPE.gripLen / 2).applyQuaternion(kq).add(kp);
          gB.copy(loc).addScaledVector(V(1, 0, 0), KITE_RECIPE.gripLen / 2).applyQuaternion(kq).add(kp);
          seg.set(gA, gB); seg.closestPointToPoint(palm, true, tmp2); r[s].palmToSocket = palm.distanceTo(tmp2);
        } else r[s].palmToSocket = palm.distanceTo(loc.applyQuaternion(kq).add(kp));
      }
      r.carry = I.kite.carry; r.two = I.kite.two; r.planOff = kp.distanceTo(V().fromArray(I.kite.plan)); r.backR = I.kite.back.r; r.backL = I.kite.back.l;
      // the kite's move this step (char frame) and whether a hand held it
      // (on her back's frame, spine_02: the mount rides her back, so a roll on its mount moves with her and not of itself)
      an._charOf(b.spine2.bone, bkP); an._liveW(b.spine2.bone, bkQ); bkQi.copy(bkQ).invert();
      kp.sub(bkP).applyQuaternion(bkQi); kq.premultiply(bkQi);
      const mv = lastK.ok ? kp.distanceTo(lastK.p) : 0, rot = lastK.ok ? 2 * Math.acos(Math.min(1, Math.abs(kq.dot(lastK.q)))) * 180 / Math.PI : 0;
      r.kiteMove = mv; r.kiteRot = rot; r.handHeld = !!(I.kite.hold.l || I.kite.hold.r) || I.kite.carry > 0;
      lastK.p.copy(kp); lastK.q.copy(kq); lastK.ok = true;
    } else lastK.ok = false;
  }
  // (wave 2b) the right forearm and hand against the stowed kit while the hand is on the back reach
  r.armKit = null;
  if (KIT && (r.backR)) {
    const el = b.loArmR.bone.getWorldPosition(V()), wr = b.handR.bone.getWorldPosition(V()), kn = MID.R.getWorldPosition(V());
    let m = Infinity, pc = null;
    const PC = KIT.geometry.getAttribute('_piece');
    for (let i = 0, n = KIT.geometry.attributes.position.count; i < n; i += 3) {
      KIT.getVertexPosition(i, kitV); KIT.localToWorld(kitV);
      seg.set(el, wr); seg.closestPointToPoint(kitV, true, tmp2); let d = kitV.distanceTo(tmp2) - 0.035;
      seg.set(wr, kn); seg.closestPointToPoint(kitV, true, tmp2); d = Math.min(d, kitV.distanceTo(tmp2) - 0.03);
      if (d < m) { m = d; pc = PC ? Math.round(PC.getX(i)) : null; }
    }
    r.armKit = m; r.armKitPiece = pc;
  }
  // the kite: nearest vertex to the head's sphere and to the trunk
  const info = an.hangPoseInfo();
  let headClear = Infinity, trunkClear = Infinity, faceN = 0, faceMin = Infinity;
  if (info && an._kiteFl?.state !== 'none') {
    placeKite(K, root, info);
    const mw = K.mesh.matrixWorld;
    head.copy(hb).add(tmp.set(0, 0.1, 0));
    const tr = TRUNK.map((k) => b[k].bone.getWorldPosition(V()));
    const hcF = an._charOf(b.head.bone, V());
    for (let i = 0; i < pos.count; i += 2) {
      tmp.fromBufferAttribute(pos, i).applyMatrix4(mw);
      // (the face's column, char frame)
      root.worldToLocal(faceTmp.copy(tmp)).sub(hcF);
      if (Math.abs(faceTmp.x) <= 0.10 && faceTmp.y >= -0.06 && faceTmp.y <= 0.24 && faceTmp.z >= 0.02 && faceTmp.z <= 1.2) faceN++;
      if (faceTmp.z >= 0.02 && faceTmp.z <= 1.2) faceMin = Math.min(faceMin, Math.max(0, Math.abs(faceTmp.x) - 0.10) + Math.max(0, faceTmp.y - 0.24, -0.06 - faceTmp.y));
      headClear = Math.min(headClear, tmp.distanceTo(head) - 0.12);
      for (let j = 0; j + 1 < tr.length; j++) { seg.set(tr[j], tr[j + 1]); seg.closestPointToPoint(tmp, true, tmp2); trunkClear = Math.min(trunkClear, tmp.distanceTo(tmp2) - 0.16); }
    }
  }
  const hc = an._charOf(b.head.bone, V());
  // the hips against the chest (deg, about the vertical): the thighs' line against the upper arms' line; and how far
  // apart the knees stand in height (a knee raised in the jump's pose)
  const tL = an._charOf(b.thighL.bone, V()), tR = an._charOf(b.thighR.bone, V()), sL = an._charOf(b.upArmL.bone, V()), sR = an._charOf(b.upArmR.bone, V());
  const kL = an._charOf(b.calfL.bone, V()), kR = an._charOf(b.calfR.bone, V());
  const hipYaw = Math.atan2(tL.z - tR.z, tL.x - tR.x), chestYaw = Math.atan2(sL.z - sR.z, sL.x - sR.x);
  let hipsVsChest = (hipYaw - chestYaw) * 180 / Math.PI; hipsVsChest = ((hipsVsChest + 540) % 360) - 180;
  const kneeDy = Math.abs(kL.y - kR.y);
  const kit = an._kiteFl?.state !== 'none' ? rollToKit(info) : null;
  return { ...r, hipsVsChest, kneeDy, headClear, trunkClear, kit, faceN, faceMin, headChar: [r3(hc.x), r3(hc.y), r3(hc.z)], kitePos: info?.kite?.pos?.map(r3) ?? null, clip: info?.kite?.clip ?? null, phase: info?.kite?.phase ?? null, furl: info?.kite?.furl ?? null };
}

/**
 * Fly a scenario by the law, posing her from its state each step; then, when the flight state turns 'none', keep
 * stepping: her fall (an airborne fold: the page's gravity, 22 m/s^2, from the height the fold ended at) and her hands'
 * hand-back on the ground, until the kite's layer is off (at most 2.5 s). Every step is recorded and graded.
 */
function scenario(name, { airborne = true, y = 30, input = () => ({}), weather = () => 'trade', maxS = 20, preSteps = 21 }) {
  reset(R);
  lastW.L = null; lastW.R = null;
  const f = createFlightBody(), world = flatWorld({ flyable: () => !['calima', 'squall'].includes(weather(tt)) });
  let tt = 0;
  if (airborne) { R.ctx.events?.emit?.('player-jump', { v0: 5 }); p.grounded = false; }
  // the jump's 0.35 s before Space may open it (not the kite's: not graded)
  for (let i = 0; i < preSteps; i++) { if (airborne) p.grounded = false; step(R); }
  p.grounded = false;
  let s = openAt(f, { x: 0, y, z: 0, headingDeg: 0, groundY: 0 });
  const steps = [];
  let landed = false;
  while (tt < maxS) {
    an.setKiteFlight(s, f.t, { bank: input(tt, s).bank || 0, forced: !!f.forced });
    step(R);
    const r = read();
    const gr = p.grounded !== false;
    steps.push({ t: r3(tt), state: s, phaseOf: s === 'none' ? 'none' : 'clip', grounded: gr, ...r, ...(s === 'none' ? { clip: gr ? 'after-ground' : 'after-air', phase: 0, afterW: r3(an.kiteAfterWeight()) } : {}) });
    if (s === 'landing' && !landed) { landed = true; p.grounded = true; R.ctx.events?.emit?.('player-land', { fall: 0.5 }); }
    if (s === 'none') break;
    s = stepFlight(s, f, input(tt, s), world, 1 / 60);
    tt += 1 / 60;
  }
  // after the fold: she falls from where it ended (if it ended in the air), lands, and her hands go back to her own pose
  const h0 = Math.max(0, f.y - 0), fallS = landed ? 0 : Math.sqrt((2 * h0) / KITE.gravity);
  let ta = 0, fell = false, after = 0, offAt = -1;
  while (ta < fallS + 2.5) {
    ta += 1 / 60; tt += 1 / 60;
    if (!fell && ta >= fallS) { fell = true; p.grounded = true; R.ctx.events?.emit?.('player-land', { fall: Math.min(9, h0) }); }
    else if (!fell) p.grounded = false;
    an.setKiteFlight('none');
    step(R);
    const aw = an.kiteAfterWeight ? an.kiteAfterWeight() : 0;
    const r = read();
    steps.push({ t: r3(tt), state: 'none', phaseOf: fell ? 'after-ground' : 'after-air', grounded: fell, afterW: r3(aw), ...r, clip: fell ? 'after-ground' : 'after-air', phase: r3(ta) });
    after++;
    // (on: 0.5 s more after the layer is off, her own pose alone: the reference the hand-back is graded against)
    if (fell && aw <= 0 && ta > fallS + 0.05) { if (offAt < 0) offAt = ta; if (ta - offAt >= 0.5) break; }
  }
  for (let i = 0; i < 10; i++) step(R);
  p.grounded = true;
  return { name, steps, foldEndY: r3(h0), fallS: r3(fallS), afterSteps: after };
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
  // (wave 2b: opened 1.2 s into a fall, her own pose the fall's tuck, not the jump's rise: the page's film held her so)
  scenario('open late in a long fall (the fall\'s tuck under it), glide, fold', { preSteps: 72, input: (t) => ({ fold: t >= 2 }) }),
];

const CLIPS = ['open', 'glide', 'fold', 'land', 'reef', 'after-air'];
const per = Object.fromEntries(CLIPS.map((c) => [c, { steps: 0, frontHeadFrame: Infinity, frontFacing: Infinity, belowHead: Infinity, elbowOver: -Infinity, headClear: Infinity, trunkClear: Infinity, worst: null }]));
let total = 0, bad = 0, badFacing = 0, handsFree = 0, ownPose = 0;
const byWhere = {}, overStep = []; let overStepN = 0;
let wStepMax = 0, wStepAt = null, palmMax = 0, palmAt = null, palmN = 0;
// wave 2b
const W2B = { binding: { steps: 0, bad: 0, first: [] }, strictBehind: { steps: 0, onBackReach: 0, offBackReach: 0, minUnderHeadM: Infinity, first: [] },
  socket: { n: 0, max: 0, at: null, over010: 0, byHold: {} }, noHand: { steps: 0, maxMoveM: 0, maxRotDeg: 0, at: null },
  face: { steps: 0, verts: 0, minGapM: Infinity, at: null, byClip: {} }, armKit: { steps: 0, min: Infinity, at: null }, take: [], planOffMax: {} };
const bindingBad = (st) => {
  if (st.sweep && (st.sweep.behind > 0 || st.sweep.plane > 0)) return 'sweep';
  for (const s of ['L', 'R']) {
    const x = st[s];
    if (x.belowHead < 0) return `${s} wrist over head`;
    if (x.elbowOver >= 0) return `${s} elbow over shoulder`;
    if ((x.frontHeadFrame <= 0 || x.frontFacing <= 0) && x.belowHead < 0.30) return `${s} behind a head plane within 0.30 m of its height`;
  }
  return null;
};
for (const sc of S) for (const st of sc.steps) {
  W2B.binding.steps++;
  const why = bindingBad(st);
  if (why) { W2B.binding.bad++; if (W2B.binding.first.length < 10) W2B.binding.first.push({ scenario: sc.name.slice(0, 44), t: st.t, clip: st.clip, phase: r3(st.phase ?? 0), why, sweep: st.sweep }); }
  for (const s of ['L', 'R']) {
    const x = st[s];
    if (x.frontHeadFrame <= 0 || x.frontFacing <= 0) {
      W2B.strictBehind.steps++;
      const back = x.belowHead >= 0.30;
      if (back) W2B.strictBehind.onBackReach++; else { W2B.strictBehind.offBackReach++; if (W2B.strictBehind.first.length < 10) W2B.strictBehind.first.push({ scenario: sc.name.slice(0, 44), t: st.t, clip: st.clip, phase: r3(st.phase ?? 0), side: s, front: r3(x.frontHeadFrame), facing: r3(x.frontFacing), under: r3(x.belowHead) }); }
      W2B.strictBehind.minUnderHeadM = Math.min(W2B.strictBehind.minUnderHeadM, x.belowHead);
    }
    if (x.palmToSocket != null) {
      const S2 = W2B.socket; S2.n++; if (x.palmToSocket > 0.010) S2.over010++;
      const bh = S2.byHold[`${st.clip}:${x.hold}`] || (S2.byHold[`${st.clip}:${x.hold}`] = { n: 0, max: 0 }); bh.n++; bh.max = Math.max(bh.max, x.palmToSocket);
      if (x.palmToSocket > S2.max) { S2.max = x.palmToSocket; S2.at = { scenario: sc.name.slice(0, 44), t: st.t, clip: st.clip, phase: r3(st.phase ?? 0), side: s, hold: x.hold }; }
    }
  }
  if (st.kiteMove != null && !st.handHeld && st.state !== 'none') {
    const N = W2B.noHand; if (st.kiteMove > 0.002 || st.kiteRot > 0.5) N.steps++;
    if (st.kiteMove > N.maxMoveM) { N.maxMoveM = st.kiteMove; N.at = { scenario: sc.name.slice(0, 44), t: st.t, clip: st.clip, phase: r3(st.phase ?? 0) }; }
    N.maxRotDeg = Math.max(N.maxRotDeg, st.kiteRot);
  }
  if (st.faceN > 0) { W2B.face.steps++; W2B.face.verts += st.faceN; const c = W2B.face.byClip[st.clip] || (W2B.face.byClip[st.clip] = { steps: 0, phases: [] }); c.steps++; if (c.phases.length < 12) c.phases.push(r3(st.phase ?? 0)); if (!W2B.face.at) W2B.face.at = { scenario: sc.name.slice(0, 44), t: st.t, clip: st.clip, phase: r3(st.phase ?? 0), n: st.faceN }; }
  if (Number.isFinite(st.faceMin)) W2B.face.minGapM = Math.min(W2B.face.minGapM, st.faceMin);
  if (st.armKit != null) { W2B.armKit.steps++; if (st.armKit < 0) { W2B.armKit.inside = (W2B.armKit.inside || 0) + 1; const k = `${st.clip}:${st.armKitPiece}`; (W2B.armKit.by || (W2B.armKit.by = {}))[k] = Math.min(W2B.armKit.by?.[k] ?? 0, r3(st.armKit)); } if (st.armKit < W2B.armKit.min) { W2B.armKit.min = st.armKit; W2B.armKit.at = { scenario: sc.name.slice(0, 44), t: st.t, clip: st.clip, phase: r3(st.phase ?? 0), piece: st.armKitPiece }; } }
  if (st.planOff != null) W2B.planOffMax[st.clip] = Math.max(W2B.planOffMax[st.clip] ?? 0, st.planOff);
}
// the take: the right palm's distance to the roll's socket on the mount on the step the hand closes (before the roll is
// placed from it), per scenario that opens from the mount
for (const sc of S) {
  const st = sc.steps.find((x) => x.clip === 'open' && x.carry > 0);
  if (st) W2B.take.push({ scenario: sc.name.slice(0, 44), t: st.t, phase: r3(st.phase), carry: r3(st.carry), rollOffMountM: r3(st.planOff ?? 0) });
}
const badSteps = [], badFacingSteps = [];
// THE HAND-BACK ON THE GROUND (fix round 1). On the ground after touchdown the after-layer hands each arm to her own pose
// (the idle, or the landing's recovery). Her own pose's right wrist reads behind both planes by itself (her idle: up to
// 0.13 m behind the head bone's vertical plane, 0.55 m under the head bone, at her hip): "idle hands fine" is the
// owner's own bar. So these steps are graded on both reads against HER OWN POSE's wrist on the scenario's first step the
// layer is off (no wrist further behind either plane than hers, +0.005 m), and on the owner's bar itself: no wrist
// behind either plane within 0.30 m of the head bone's height, no elbow over its shoulder. Counted and reported apart.
const ownOf = new Map();
for (const sc of S) {
  // her own pose: the least-in-front read of each wrist over the 0.5 s after the layer is off
  const off = sc.steps.filter((x) => x.clip === 'after-ground' && x.afterW === 0);
  if (!off.length) continue;
  const m = (s, k) => Math.min(...off.map((x) => x[s][k]));
  ownOf.set(sc, { n: off.length, L: { frontHeadFrame: m('L', 'frontHeadFrame'), frontFacing: m('L', 'frontFacing'), belowHead: m('L', 'belowHead') }, R: { frontHeadFrame: m('R', 'frontHeadFrame'), frontFacing: m('R', 'frontFacing'), belowHead: m('R', 'belowHead') } });
}
const HB = { steps: 0, bad: 0, behindReads: 0, worst: null, own: {} };
for (const sc of S) for (const st of sc.steps) {
  if (st.clip === 'after-ground' && st.afterW === 0) { HB.own0 = (HB.own0 || 0) + 1; continue; }   // the layer is off: her own pose
  if (st.clip === 'after-ground') {
    const own = ownOf.get(sc);
    HB.steps++;
    let isB = false, behind = false;
    // (wave 2b: the right hand comes round her hip from the mount at the small of her back, behind both planes at her
    //  waist, further behind them than her own pose's wrist: wave 2's clause "no further behind than her own pose" is
    //  counted (ownPoseClauseSteps) and the binding read is Kevin's bar as the clip steps grade it: the sweep's behind and
    //  plane, no wrist behind a plane within 0.30 m of the head's height, none over it, no elbow over its shoulder)
    if (st.sweep && (st.sweep.behind > 0 || st.sweep.plane > 0)) isB = true;
    for (const s of ['L', 'R']) {
      const x = st[s], o = own ? own[s] : null;
      if (x.frontHeadFrame <= 0 || x.frontFacing <= 0) behind = true;
      const ofH = o ? Math.min(0, o.frontHeadFrame) - 0.005 : 0, ofF = o ? Math.min(0, o.frontFacing) - 0.005 : 0;
      if (x.frontHeadFrame < ofH || x.frontFacing < ofF) HB.ownClause = (HB.ownClause || 0) + 1;
      if ((x.frontHeadFrame <= 0 || x.frontFacing <= 0) && x.belowHead < 0.30) isB = true;
      if (x.belowHead < 0 || x.elbowOver >= 0) isB = true;
      if (!HB.worst || x.frontFacing < HB.worst.frontFacing) HB.worst = { scenario: sc.name, t: st.t, side: s, frontFacing: r3(x.frontFacing), frontHeadFrame: r3(x.frontHeadFrame), belowHead: r3(x.belowHead), afterW: st.afterW, ownFacing: o ? r3(o.frontFacing) : null, ownHeadFrame: o ? r3(o.frontHeadFrame) : null };
    }
    if (behind) HB.behindReads++;
    if (isB) { HB.bad++; (HB.first || (HB.first = [])).length < 8 && HB.first.push({ scenario: sc.name.slice(0, 40), t: st.t, afterW: st.afterW, L: [r3(st.L.frontHeadFrame), r3(st.L.frontFacing), r3(st.L.belowHead), r3(st.L.elbowOver)], R: [r3(st.R.frontHeadFrame), r3(st.R.frontFacing), r3(st.R.belowHead), r3(st.R.elbowOver)] }); }
  }
}
for (const [sc, e] of ownOf) HB.own[sc.name] = { L: { facing: r3(e.L.frontFacing), headFrame: r3(e.L.frontHeadFrame), under: r3(e.L.belowHead) }, R: { facing: r3(e.R.frontFacing), headFrame: r3(e.R.frontHeadFrame), under: r3(e.R.belowHead) } };
for (const sc of S) for (const st of sc.steps) {
  if (st.clip === 'after-ground') continue;
  // (fix round 1: nothing is skipped; the step the state turns 'none' is graded as the after-layer's first)
  const clip = st.state === 'none' ? (st.grounded ? 'after-ground' : 'after-air') : st.clip;
  if (!per[clip]) throw new Error(`clip-bench: step with no clip (${sc.name} t ${st.t})`);
  if (st.state === 'none' && st.afterW === 0) ownPose++;
  const P = per[clip];
  for (const s of ['L', 'R']) {
    if (st[s].wStep > 0.08 && overStep.length < 40) overStep.push({ scenario: sc.name.slice(0, 40), t: st.t, clip, phase: r3(st.phase ?? 0), side: s, m: r3(st[s].wStep), state: st.state });
    if (st[s].wStep > 0.08) overStepN++;
    if (st[s].wStep > wStepMax) { wStepMax = st[s].wStep; wStepAt = { scenario: sc.name, t: st.t, clip, phase: r3(st.phase ?? 0), side: s }; }
    if (st[s].palmToSocket != null) { (P.palm || (P.palm = [])).push(st[s].palmToSocket); }
    if (st[s].palmToSocket != null) { palmN++; if (st[s].palmToSocket > palmMax) { palmMax = st[s].palmToSocket; palmAt = { scenario: sc.name, t: st.t, clip, phase: r3(st.phase ?? 0), side: s, hold: st[s].hold }; } }
  }
  P.wStep = Math.max(P.wStep ?? 0, st.L.wStep, st.R.wStep);
  if (clip === 'glide' || clip === 'reef') { P.hips = Math.max(P.hips ?? 0, Math.abs(st.hipsVsChest)); P.knee = Math.max(P.knee ?? 0, st.kneeDy); }
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
  if (st.kit != null && st.kit < (P.kit ?? Infinity)) { P.kit = st.kit; P.kitAt = { scenario: sc.name, t: st.t, phase: r3(st.phase) }; }
  if (isBad || isBadF) { const k = `${sc.name} | ${clip}`; const e = byWhere[k] || (byWhere[k] = { headFrame: 0, facing: 0, minUnderHead_m: Infinity }); if (isBad) e.headFrame++; if (isBadF) e.facing++; e.minUnderHead_m = r3(Math.min(e.minUnderHead_m, st.L.belowHead, st.R.belowHead)); }
  if (isBad) { bad++; if (badSteps.length < 12) badSteps.push({ scenario: sc.name, t: st.t, clip, phase: r3(st.phase), L: st.L, R: st.R }); }
  if (isBadF) { badFacing++; if (badFacingSteps.length < 12) badFacingSteps.push({ scenario: sc.name, t: st.t, clip, phase: r3(st.phase), L: r3(st.L.frontFacing), R: r3(st.R.frontFacing) }); }
}
const rows = {};
for (const c of CLIPS) { const P = per[c]; rows[c] = { steps: P.steps, minWristFront_headFrame_m: r3(P.frontHeadFrame), minWristFront_facing_m: r3(P.frontFacing), minWristBelowHeadBone_m: r3(P.belowHead), maxElbowOverShoulder_m: r3(P.elbowOver), kiteMinHeadClear_m: Number.isFinite(P.headClear) ? r3(P.headClear) : null, kiteMinTrunkClear_m: Number.isFinite(P.trunkClear) ? r3(P.trunkClear) : null, worstAt: P.worst, headAt: P.headAt ?? null, trunkAt: P.trunkAt ?? null, rollToStowKit_m: P.kit != null ? r3(P.kit) : null, rollToStowKitAt: P.kitAt ?? null, maxWristStep_m: r3(P.wStep ?? 0), maxHipsVsChest_deg: P.hips != null ? +P.hips.toFixed(1) : null, maxKneeHeightApart_m: P.knee != null ? r3(P.knee) : null, palmToGrip: P.palm ? (() => { const a = [...P.palm].sort((x, y) => x - y); return { n: a.length, p50: r3(a[a.length >> 1]), p95: r3(a[Math.floor(a.length * 0.95)]), max: r3(a.at(-1)), over010: a.filter((x) => x > 0.010).length }; })() : null }; }
let kiteClear = Infinity, rollClear = Infinity;
for (const c of CLIPS) { const P = per[c]; if (Number.isFinite(P.headClear)) kiteClear = Math.min(kiteClear, P.headClear); if (Number.isFinite(P.trunkClear)) rollClear = Math.min(rollClear, P.trunkClear); }
const w2b = {
  binding: { ...W2B.binding, pass: W2B.binding.bad === 0 && W2B.binding.steps > 0, note: "Kevin's bar as the M1.3f sweep reads it (behind 0, plane 0), no wrist over the head bone, no elbow over its shoulder, no wrist behind a head plane within 0.30 m of its height; every step of every scenario, the after-layer included" },
  strictBehind: { ...W2B.strictBehind, minUnderHeadM: r3(W2B.strictBehind.minUnderHeadM), passOffBackReach: W2B.strictBehind.offBackReach === 0, note: 'wrist-steps behind the head frontal plane or the facing plane at any height (wave 1 read): onBackReach = 0.30 m or more under the head bone (her hand round her hip and at the small of her back, by design); offBackReach = within 0.30 m of its height, and must be 0' },
  palmOnSocket: { n: W2B.socket.n, max_m: r3(W2B.socket.max), over010: W2B.socket.over010, at: W2B.socket.at, byHold: Object.fromEntries(Object.entries(W2B.socket.byHold).map(([k, v]) => [k, { n: v.n, max_m: r3(v.max) }])), bar_m: 0.010, pass: W2B.socket.over010 === 0 && W2B.socket.n > 0 },
  rollWithoutHand: { stepsMoved: W2B.noHand.steps, maxMoveM: r3(W2B.noHand.maxMoveM), maxRotDeg: +W2B.noHand.maxRotDeg.toFixed(2), at: W2B.noHand.at, pass: W2B.noHand.steps === 0 },
  face: { steps: W2B.face.steps, verts: W2B.face.verts, minGapM: r3(W2B.face.minGapM), first: W2B.face.at, byClip: W2B.face.byClip, pass: W2B.face.steps === 0 },
  armKitOnBackReach: { steps: W2B.armKit.steps, stepsInside: W2B.armKit.inside || 0, byClipPiece: W2B.armKit.by || {}, pieces: '1 lance, 2 bow, 4 quiver', minClearM: Number.isFinite(W2B.armKit.min) ? r3(W2B.armKit.min) : null, at: W2B.armKit.at },
  take: W2B.take, kitePlacedOffPlanMaxM: Object.fromEntries(Object.entries(W2B.planOffMax).map(([k, v]) => [k, r3(v)])),
};
const res = { wave2b: w2b, steps: total, badSteps: bad, pass: w2b.binding.pass && w2b.strictBehind.passOffBackReach && total > 0, strictKF1AllSteps: bad === 0 && badFacing === 0, headFramePass: bad === 0, facingPass: badFacing === 0, ownPoseStepsGraded: ownPose,
  facing: { badSteps: badFacing, note: 'the vertical plane through the head BONE, square to her facing: binding beside the head-frame plane (fix round 1)', first: badFacingSteps },
  failsByScenarioAndClip: byWhere,
  handBackOnGround: { ownPoseStepsNotKite: HB.own0 || 0, steps: HB.steps, bad: HB.bad, pass: HB.bad === 0 && HB.steps > 0, ownPoseClauseSteps: HB.ownClause || 0, stepsBehindAPlane: HB.behindReads, worst: HB.worst, firstBad: HB.first || [], herOwnPoseAtHandsFree: HB.own },
  wristStep: { max_m: r3(wStepMax), at: wStepAt, bar_m: 0.08, over: overStepN, first: overStep },
  palmOnGrip: { steps: palmN, max_m: r3(palmMax), at: palmAt, bar_m: 0.010 },
  kiteClearOfHead_m: r3(kiteClear), kiteClearOfTrunk_m: r3(rollClear), rows, firstBad: badSteps, scenarios: S.map((s) => ({ name: s.name, steps: s.steps.length, foldEndY: s.foldEndY, fallS: s.fallS, afterSteps: s.afterSteps, states: [...new Set(s.steps.map((x) => x.state))], clips: [...new Set(s.steps.map((x) => x.clip))] })),
  kite: { triangles: K.triangles, draws: K.draws } };
console.log(JSON.stringify(res, null, 1));
if (out) writeFileSync(out, JSON.stringify(res, null, 1));
