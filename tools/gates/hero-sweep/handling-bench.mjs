/**
 * M1a weapons step 1 — the handling bench, in Node: Brea dressed (`bench.mjs makeBench`, the real animator, the game's
 * HeroRig with the stow kit, the real `Melee`), stepped at 60 Hz of sim time through the draws, stows and swaps, every
 * step recorded (`handling-row.mjs` documents the record) and graded by `handling-row.mjs gradeCase`.
 *
 *   node tools/gates/hero-sweep/handling-bench.mjs [--only bowUnstow,swap12,...] [--json out.json] [--log out.json]
 *
 * Stand-in (the page does it for real): combat's bow. The bench builds the held Sabina's three nested nodes as
 * combat.js builds them (group on hand_l; model 0.1 m under, canted 0.22 rad; mesh at the grip offsets), places it in
 * the hand each step as `_placeInHand`'s carry branch does, then calls the animator's `bowPathPose` exactly where combat
 * does; `weaponDrawn` follows combat's `_updateWield` rule (the 8 s holster timer, never with the lance out). Key 1 and
 * key 2 are `quickslots.select`'s calls. Interrupt injection (W10) is not in this bench yet.
 */
import path from 'path';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { makeBench, step, reset, SPEEDS } from './bench.mjs';
import { buildSweep } from './measure.mjs';
import { THREE } from './load.mjs';
import { gradeCase } from './handling-row.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const D = 180 / Math.PI;

const R = await makeBench({ melee: true });
const M = buildSweep(R, THREE);
const { an, model } = R;
const NEW = typeof an.handlingInfo === 'function';
const { SOCKETS } = await import(path.join(ROOT, 'src/hero/sockets.js'));

/* ---- combat's bow, stood in (combat.js constructor, `_initStow`, `_placeInHand` carry branch, `_updateWield`) */
const node = an.handAttach('l');
const group = new THREE.Group(), mdl = new THREE.Group(), mesh = new THREE.Object3D();
mdl.rotation.z = 0.22; mdl.position.y = -0.1; mesh.position.set(0, 0.095, 0.035);
group.add(mdl); mdl.add(mesh); node.add(group); group.visible = false;
const bowModel = { group, model: mdl, mesh, setDraw() {}, setArrowType() {} };
const C = R.combat;
C.bow = bowModel; C._bowNode = node; C._models = { 'sabina-bow': bowModel };
{
  // _initStow (the bind pose: now, before any step)
  const bone = an.bones?.spine_03_08 ?? an.b.spine2.bone;
  model.updateMatrixWorld(true);
  const mP = new THREE.Vector3(), mQ = new THREE.Quaternion(), mS = new THREE.Vector3();
  model.matrixWorld.decompose(mP, mQ, mS);
  const grip = new THREE.Vector3(0.10, 1.30, -0.17).applyQuaternion(mQ).add(mP);
  const qChar = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  qChar.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.62));
  qChar.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.10));
  const qDes = mQ.clone().multiply(qChar);
  const pos = grip.applyMatrix4(new THREE.Matrix4().copy(bone.matrixWorld).invert());
  const bQ = new THREE.Quaternion(); bone.matrixWorld.decompose(new THREE.Vector3(), bQ, new THREE.Vector3());
  C._stow = { bone, pos, quat: bQ.invert().multiply(qDes) };
}
const emu = { holsterT: 0, palmL: null };
const _wp = new THREE.Vector3(), _wq = new THREE.Quaternion(), _ws = new THREE.Vector3(), _qd = new THREE.Quaternion(), _e = new THREE.Euler();
function placeInHand() {
  if (group.parent !== node) node.add(group);
  group.visible = true;
  node.updateWorldMatrix(true, false);
  node.matrixWorld.decompose(_wp, _wq, _ws);
  if (emu.palmL === null) { emu.palmL = undefined; for (const c of node.children) if (c.isBone && /^middle_01/.test(c.name)) { emu.palmL = c.position.clone().multiplyScalar(0.7); break; } }
  if (emu.palmL) group.position.copy(emu.palmL); else group.position.set(0, 0, 0);
  const p = R.player;
  let run = p.moveSpeed / 6; if (!(run > 0)) run = 0; else if (run > 1) run = 1;
  _e.set(0.92, (p.heading || 0) + 0.12 + 0.18 * run, 0.2 - 0.1 * run, 'YXZ');
  _qd.setFromEuler(_e);
  _wq.invert(); group.quaternion.copy(_wq.multiply(_qd));
  group.scale.set(1 / _ws.x, 1 / _ws.y, 1 / _ws.z);
}
function placeOnBack() {
  const st = C._stow;
  if (group.parent !== st.bone) st.bone.add(group);
  group.position.copy(st.pos); group.quaternion.copy(st.quat);
  st.bone.updateWorldMatrix(true, false); _ws.setFromMatrixScale(st.bone.matrixWorld);
  group.scale.set(1 / _ws.x, 1 / _ws.y, 1 / _ws.z);
  // (combat's procedural bow on her back is hidden: the kit's Sabina is the one she wears; hero/index.js)
  group.visible = false;
}
/** combat.update's weapon part, after the player (animator, hero rig) and melee, as the page orders it */
function combatStep(dt) {
  const mel = R.melee;
  const lanceOut = !!mel.lanceInHand || (NEW && mel.stance === 'draw');
  if (R.player.aiming) emu.holsterT = 8; else emu.holsterT = Math.max(0, emu.holsterT - dt);
  C.weaponDrawn = !lanceOut && (R.player.aiming || emu.holsterT > 0);
  const pathHand = an.bowInHand ? an.bowInHand() : null;
  const wield = pathHand ?? C.weaponDrawn;
  if (wield) { placeInHand(); if (pathHand !== null) an.bowPathPose?.(group); } else placeOnBack();
}
const key1 = () => { R.melee.holsterLance(true); if (NEW) emu.holsterT = 8; };    // quickslots.select(1) (+ noteCombatAction: NEW)
const key2 = () => { R.melee.drawLance(); };                                     // quickslots.select(2)
const fwd = (speed) => { const p = R.player; p.velocity.set(Math.sin(p.heading) * speed, 0, Math.cos(p.heading) * speed); p.moveSpeed = speed; };
function tick(speed = 0) { if (speed) fwd(speed); step(R); combatStep(1 / 60); }

/* ---- the kit's stowed bow: its top end and its line in spine_02's frame (once, at the first reset's pose) */
let KIT = null;
function kitInit() {
  const kit = R.hero.kit, m = kit.meshes[0], sp = an.b.spine2.bone;
  const P = m.geometry.getAttribute('_piece'), pos = m.geometry.getAttribute('position');
  model.updateMatrixWorld(true);
  const pts = []; const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { if ((Math.round(P.getX(i)) & 2) === 0) continue; m.getVertexPosition(i, v); m.localToWorld(v); pts.push(sp.worldToLocal(v.clone())); }
  const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  let far = 0, A = null; for (const p of pts) { const d = p.distanceTo(c); if (d > far) { far = d; A = p; } }
  let far2 = 0, B = null; for (const p of pts) { const d = p.distanceTo(A); if (d > far2) { far2 = d; B = p; } }
  const wA = sp.localToWorld(A.clone()), wB = sp.localToWorld(B.clone());
  KIT = wA.y > wB.y ? { top: A, low: B } : { top: B, low: A };
}

/* ---- the step record */
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _inv = new THREE.Matrix4(), _sp = new THREE.Matrix4();
const ch = (bone, off = null) => { if (off) { bone.updateWorldMatrix(true, false); _v.copy(off).applyMatrix4(bone.matrixWorld); } else bone.getWorldPosition(_v); return _v.applyMatrix4(_inv).toArray(); };
const chW = (w) => _v.copy(w).applyMatrix4(_inv).toArray();
const toSp = (c) => _v.fromArray(c).applyMatrix4(model.matrixWorld).applyMatrix4(_sp).toArray();
const yawOf = (bone) => { an._liveW(bone, _q); _v.set(0, 0, 1).applyQuaternion(_q); return Math.atan2(_v.x, _v.z) * D; };
const segPt = (p, a, c) => { const ab = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const t = Math.max(0, Math.min(1, (ab[0] * ap[0] + ab[1] * ap[1] + ab[2] * ap[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1)));
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t); };
/** segment-segment distance by sampling the first (11 points; a gate-free self check) */
const segSeg = (a0, a1, b0, b1) => { let m = 9; for (let i = 0; i <= 10; i++) { const t = i / 10; m = Math.min(m, segPt([a0[0] + (a1[0] - a0[0]) * t, a0[1] + (a1[1] - a0[1]) * t, a0[2] + (a1[2] - a0[2]) * t], b0, b1)); } return m; };
function wristAngles(s) {
  const b = an.b, up = s === 'L' ? b.loArmL : b.loArmR, ha = s === 'L' ? b.handL : b.handR;
  const el = new THREE.Vector3(), wr = new THREE.Vector3(), kn = new THREE.Vector3();
  an._charOf(up.bone, el); an._charOf(ha.bone, wr);
  const mid = ha.bone.children.find((c) => /^middle_01/.test(c.name));
  if (!mid) return [0, 0];
  an._charOf(mid, kn);
  const f = wr.clone().sub(el).normalize(), h = kn.clone().sub(wr).normalize();
  an._liveW(ha.bone, _q);
  const g = (s === 'L' ? an.melee?.gripDirLL : an.melee?.gripDirL)?.clone().applyQuaternion(_q) ?? new THREE.Vector3(0, 0, 1);
  const n = h.clone().cross(g).normalize();
  const n2 = n.clone().addScaledVector(f, -n.dot(f)).normalize(), g2 = f.clone().cross(n2);
  return [Math.atan2(h.dot(n2), h.dot(f)) * D, Math.atan2(h.dot(g2), h.dot(f)) * D];
}
function record(t) {
  model.updateMatrixWorld(true);
  _inv.copy(model.matrixWorld).invert();
  const b = an.b, sp = b.spine2.bone; sp.updateWorldMatrix(true, false); _sp.copy(sp.matrixWorld).invert();
  const kit = R.hero.kit, ml = an.melee, mel = R.melee;
  const r = { t: +t.toFixed(4) };
  // the bow
  const held = group.visible && group.parent === node;
  r.bowVis = held ? 'held' : (kit.hidden & 2) ? 'none' : 'kit';
  if (held) {
    mesh.updateWorldMatrix(true, false);
    const at = (p) => chW(_v.fromArray(p).applyMatrix4(mesh.matrixWorld));
    r.bowTip = at(SOCKETS.bow.tip); r.bowLimb = at(SOCKETS.bow.limb.p); r.bowGrip = at(SOCKETS.bow.grip.p);
    const lo = at([0, -0.6, 0]), hi = at([0, 0.6, 0]); r.bowAxis = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  } else {
    r.bowTip = chW(sp.localToWorld(_v.copy(KIT.top))); const lo = chW(sp.localToWorld(_v.copy(KIT.low)));
    r.bowAxis = [r.bowTip[0] - lo[0], r.bowTip[1] - lo[1], r.bowTip[2] - lo[2]]; r.bowLimb = null; r.bowGrip = null;
  }
  r.bowTipSp = toSp(r.bowTip);
  r.bowLowSp = toSp([r.bowTip[0] - r.bowAxis[0], r.bowTip[1] - r.bowAxis[1], r.bowTip[2] - r.bowAxis[2]]);
  const H = NEW ? an.handlingInfo() : null;
  r.bowOwner = held ? 'handL' : 'carry';
  r.bowSock = H?.bow?.sockChar ? H.bow.sockChar.slice() : null;
  r.bowS = H ? H.bow.s : null; r.bowPhase = H ? H.bow.phase : (an._bp?.mode ? `m${an._bp.mode}` : '');
  r.curlL = H ? H.bow.curl : null;
  r.bowReady = NEW ? (H.bow.mode === 0 && held) : (!!an._bp && an._bp.mode === 0 && held);
  r.bowHome = NEW ? (H.bow.mode === 0 && !held) : (!!an._bp && an._bp.mode === 0 && !held);
  // the lance
  const lp = ml?.lance;
  const lanceHeldVis = !!lp && (lp.parent !== ml.socketBone || !!ml._lc?.on);
  if (lanceHeldVis) {
    lp.updateWorldMatrix(true, false);
    r.lanceButt = chW(_v.set(0, 0, 0).applyMatrix4(lp.matrixWorld)); r.lanceTip = chW(_v.set(0, 0, ml._localLen).applyMatrix4(lp.matrixWorld));
    r.lanceVis = 'held';
  } else { r.lanceButt = kit.carry.butt.toArray(); r.lanceTip = kit.carry.tip.toArray(); r.lanceVis = (kit.hidden & 1) ? 'none' : 'kit'; }
  r.lanceTipSp = toSp(r.lanceTip);
  const lHold = !!ml?._lc?.on && (ml._lc.hold ?? 0) > 0.5 && (NEW ? ml.lanceOwnedL?.() ?? true : true);
  r.lanceOwner = ml?._held ? (lHold ? 'both' : 'handR') : lHold && lanceHeldVis ? 'handL' : 'carry';
  if (NEW && typeof ml?.lanceOwner === 'function') r.lanceOwner = ml.lanceOwner();
  r.stance = mel.stance; r.swing = !!mel.active;
  // (A104's own reading of the haft against the hair, the layer's debug: the holster's bar is 0.02 m)
  { const dm = an.debugMelee?.(); r.hairClear = dm && typeof dm.hairClear === 'number' ? dm.hairClear : null; }
  /* M1a weapons step 2: the visible haft's clearance of her axial bones (A104's list: head, neck, spine, pelvis) and of
   * her thighs (bone to segment, char m), and the bone it is nearest */
  r.lanceAxialM = null; r.lanceAxialBone = null; r.lanceThighM = null;
  if (r.lanceVis === 'held') {
    for (const k of ['head', 'neck1', 'neck2', 'spine5', 'spine4', 'spine3', 'spine2', 'spine1', 'pelvis']) {
      const e = b[k]; if (!e) continue; const d = segPt(ch(e.bone), r.lanceButt, r.lanceTip);
      if (r.lanceAxialM == null || d < r.lanceAxialM) { r.lanceAxialM = +d.toFixed(4); r.lanceAxialBone = k; }
    }
    for (const [a, c] of [[b.thighL, b.calfL], [b.thighR, b.calfR]]) {
      if (!a || !c) continue; const d = segSeg(ch(a.bone), ch(c.bone), r.lanceButt, r.lanceTip);
      if (r.lanceThighM == null || d < r.lanceThighM) r.lanceThighM = +d.toFixed(4);
    }
  }
  // the arms
  const pal = (s) => { const hb = s === 'L' ? b.handL.bone : b.handR.bone; const off = s === 'L' ? ml.palmOffLL : ml.palmOffL; return ch(hb, off); };
  r.palmL = pal('L'); r.palmR = pal('R');
  // (the bow's palm is combat's: 0.7 of the way from the wrist to the middle knuckle, where the carried bow's group sits)
  r.palmBowL = emu.palmL ? ch(b.handL.bone, emu.palmL) : r.palmL;
  r.wristL = ch(b.handL.bone); r.wristR = ch(b.handR.bone); r.elbowL = ch(b.loArmL.bone); r.elbowR = ch(b.loArmR.bone); r.shL = ch(b.upArmL.bone); r.shR = ch(b.upArmR.bone);
  an._liveW(b.handL.bone, _q); r.gripAxL = ml.gripDirLL.clone().applyQuaternion(_q).toArray();
  [r.wristFlexL, r.wristDevL] = wristAngles('L');
  r.kneeY = Math.min(ch(b.calfL.bone)[1], ch(b.calfR.bone)[1]);
  r.spineYaw = yawOf(sp); r.headYaw = yawOf(b.head.bone);
  // (M1a weapons step 2, W11's step-2 clauses: the pelvis's yaw and the shoulder line's, char deg)
  r.pelvisYaw = yawOf(b.pelvis.bone);
  r.shoulderYaw = Math.atan2(-(r.shL[2] - r.shR[2]), r.shL[0] - r.shR[0]) * D;
  r.aimW = an.aimWeight ?? 0; r.aimGate = H ? H.aimGate : 1;
  return r;
}

/* ---- the cases: a lead-in (not recorded), the request at t = 0, then `secs` recorded */
function settleBowOut(speed = 0) { emu.holsterT = 8; for (let i = 0; i < 60; i++) tick(speed); }
function settleLanceOut(speed = 0) { R.melee.drawLance(30); for (let i = 0; i < 60; i++) tick(speed); }
const CASES = {
  bowUnstow: { kind: 'bowUnstow', tempo: 'ask', pre: () => {}, go: () => { emu.holsterT = 8; }, secs: 0.9 },
  bowStowTimer: { kind: 'bowStow', tempo: 'timer', pre: () => settleBowOut(), go: () => { emu.holsterT = 0; }, secs: 0.9 },
  lanceDraw: { kind: 'lanceDraw', tempo: 'ask', pre: () => {}, go: key2, secs: 0.8 },
  lanceStowAsk: { kind: 'lanceStow', tempo: 'ask', pre: () => settleLanceOut(), go: () => R.melee.holsterLance(), secs: 0.9 },
  lanceStowTimer: { kind: 'lanceStow', tempo: 'timer', pre: () => settleLanceOut(), go: () => { R.melee._readyT = 1e-4; }, secs: 0.9 },
  swap12: { kind: 'swap12', tempo: 'ask', pre: () => settleBowOut(), go: key2, secs: 1.2 },
  swap21: { kind: 'swap21', tempo: 'ask', pre: () => settleLanceOut(), go: key1, secs: 1.4 },
  swap12Jog: { kind: 'swap12', tempo: 'ask', jog: true, pre: () => settleBowOut(SPEEDS.jog), go: key2, secs: 1.2 },
  swap21Jog: { kind: 'swap21', tempo: 'ask', jog: true, pre: () => settleLanceOut(SPEEDS.jog), go: key1, secs: 1.4 },
  click: { kind: 'click', tempo: 'ask', pre: () => {}, go: () => { R.ctx.input.mouse.buttons = 1; }, secs: 0.7, each: (i) => { if (i === 3) R.ctx.input.mouse.buttons = 0; } },
  heldBowRun: { kind: 'held', tempo: 'ask', jog: true, pre: () => settleBowOut(SPEEDS.jog), go: () => { emu.holsterT = 30; }, secs: 2.0, speed: SPEEDS.jog },
  heldBowSprint: { kind: 'held', tempo: 'ask', jog: true, pre: () => { R.player.sprinting = true; settleBowOut(SPEEDS.sprint); }, go: () => { emu.holsterT = 30; }, secs: 2.0, speed: SPEEDS.sprint, post: () => { R.player.sprinting = false; } },
  heldLanceRun: { kind: 'held', tempo: 'ask', jog: true, pre: () => settleLanceOut(SPEEDS.jog), go: () => { R.melee._readyT = 30; }, secs: 2.0, speed: SPEEDS.jog },
  /* M1a weapons step 2 (the brief: "draws on the move (walk, run, crouch)"): the draws with her already walking, jogging
   * or crouched (a lead-in of 40 steps at that gait first) */
  lanceDrawWalk: { kind: 'lanceDraw', tempo: 'ask', pre: () => { for (let i = 0; i < 40; i++) tick(SPEEDS.walk); }, go: key2, secs: 0.8, speed: SPEEDS.walk },
  lanceDrawJog: { kind: 'lanceDraw', tempo: 'ask', jog: true, pre: () => { for (let i = 0; i < 40; i++) tick(SPEEDS.jog); }, go: key2, secs: 0.8, speed: SPEEDS.jog },
  lanceDrawCrouch: { kind: 'lanceDraw', tempo: 'ask', pre: () => { R.player.crouching = true; for (let i = 0; i < 40; i++) tick(0); }, go: key2, secs: 0.8, post: () => { R.player.crouching = false; } },
  bowUnstowWalk: { kind: 'bowUnstow', tempo: 'ask', pre: () => { for (let i = 0; i < 40; i++) tick(SPEEDS.walk); }, go: () => { emu.holsterT = 8; }, secs: 0.9, speed: SPEEDS.walk },
  bowUnstowJog: { kind: 'bowUnstow', tempo: 'ask', jog: true, pre: () => { for (let i = 0; i < 40; i++) tick(SPEEDS.jog); }, go: () => { emu.holsterT = 8; }, secs: 0.9, speed: SPEEDS.jog },
  bowUnstowCrouch: { kind: 'bowUnstow', tempo: 'ask', pre: () => { R.player.crouching = true; for (let i = 0; i < 40; i++) tick(0); }, go: () => { emu.holsterT = 8; }, secs: 0.9, post: () => { R.player.crouching = false; } },
};

const only = flag('--only') ? flag('--only').split(',') : Object.keys(CASES);
const out = { commit: flag('--commit', '?'), newHandling: NEW, cases: {} };
const logs = {};
for (const name of only) {
  const c = CASES[name]; if (!c) continue;
  reset(R); emu.holsterT = 0; for (let i = 0; i < 40; i++) tick();
  if (!KIT) kitInit();
  c.pre();
  const spd = c.speed ?? (c.jog ? SPEEDS.jog : 0);
  M.begin(name);
  c.go();
  const L = [];
  const N = Math.round(c.secs * 60);
  for (let i = 0; i < N; i++) {
    c.each?.(i);
    tick(spd);
    M.sample({ T: +((i + 1) / 60).toFixed(3) });
    const r = record((i + 1) / 60);
    L.push(r);
  }
  // the head-plane counters per step: re-run measure on the log's own steps is not possible after the fact, so the
  // clip totals are attached to the last step (W6 sums them)
  const m = M.end();
  L[L.length - 1].behind = m.behind; L[L.length - 1].plane = m.plane;
  c.post?.();
  R.ctx.input.mouse.buttons = 0; R.player.sprinting = false;
  const g = gradeCase(c.kind, L, { tempo: c.tempo, jog: !!c.jog });
  g.measure = { behind: m.behind, plane: m.plane, overShoulder: m.overShoulder, behindAt: m.behindAt, planeAt: m.planeAt };
  out.cases[name] = g; logs[name] = L;
  console.log(`${name.padEnd(15)} ${g.fails.length ? 'FAIL' : 'pass'}  ${JSON.stringify({ ev: g.events, W7: g.W7 })}`);
  for (const f of g.fails) console.log(`    - ${f}`);
}
if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(out, null, 1));
if (flag('--log')) writeFileSync(flag('--log'), JSON.stringify(logs));
