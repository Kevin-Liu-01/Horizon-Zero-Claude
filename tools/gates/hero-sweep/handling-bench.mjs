/**
 * M1a weapons step 1 — the handling bench, in Node: Brea dressed (`bench.mjs makeBench`, the real animator, the game's
 * HeroRig with the stow kit, the real `Melee`), stepped at 60 Hz of sim time through the draws, stows and swaps, every
 * step recorded (`handling-row.mjs` documents the record) and graded by `handling-row.mjs gradeCase`.
 *
 *   node tools/gates/hero-sweep/handling-bench.mjs [--only bowUnstow,swap12,...] [--json out.json] [--log out.json]
 *        [--jobs 4] [--w10] [--w10-only lanceDraw,...]
 *
 * M1a weapons fix 1 (the judge: "each case's reset leaks state into the next; the same commit gives 144-171 deg by
 * order"): EVERY case runs in its own Node process (`--case <name>`, spawned by this file), built fresh, so a case
 * gives the same numbers alone, in a subset and in the full run. W10 (`--w10`) runs one process per sequence,
 * interrupt and injection step: roll, aim, strike and the opposite request at every step of every sequence.
 *
 * Stand-in (the page does it for real): combat's bow. The bench builds the held Sabina's three nested nodes as
 * combat.js builds them (group on hand_l; model 0.1 m under, canted 0.22 rad; mesh at the grip offsets), places it in
 * the hand each step as `_placeInHand`'s carry branch does, then calls the animator's `bowPathPose` exactly where combat
 * does; `weaponDrawn` follows combat's `_updateWield` rule (the 8 s holster timer, never with the lance out). Key 1 and
 * key 2 are `quickslots.select`'s calls. Combat's nock (0.42 s from the raise, `_updateNock`) and draw (`aiming && lmb`,
 * `drawStrength` over 0.70 s, loosable over MIN_LOOSE 0.02 with `an.looseReady()`) are stood in the same way, and the
 * aimed bow is placed as `_placeInHand`'s aimed branch places it (down `an.bowAimDir`).
 */
import path from 'path';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'fs';
import { spawn } from 'child_process';
import os from 'os';
import { fileURLToPath } from 'url';
import { makeBench, step, reset, SPEEDS } from './bench.mjs';
import { buildSweep } from './measure.mjs';
import { THREE } from './load.mjs';
import { gradeCase, gradeInterrupt } from './handling-row.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const D = 180 / Math.PI;

const CASE = flag('--case');
const SELF = fileURLToPath(import.meta.url);
/* ---- the parent: one child process a case (and a W10 run), at most --jobs at once */
if (!CASE) {
  const { CASE_NAMES, W10_SEQS, W10_KINDS } = await import('./handling-cases.mjs');
  const jobs = Math.max(1, Number(flag('--jobs', 4)));
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'hbench-'));
  const runChild = (extra) => new Promise((res) => {
    const logF = path.join(tmp, `${extra.join('_').replace(/[^\w]/g, '_')}.json`);
    const ch = spawn(process.execPath, [SELF, ...extra, '--log-to', logF], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    ch.stdout.on('data', (d) => { out += d; }); ch.stderr.on('data', (d) => { err += d; });
    ch.on('close', (code) => {
      const line = out.split('\n').find((l) => l.startsWith('@@RESULT '));
      let r = null; try { r = line ? JSON.parse(line.slice(9)) : null; } catch { r = null; }
      let log = null; try { log = JSON.parse(readFileSync(logF, 'utf8')); } catch { log = null; }
      res({ r, log, code, err: r ? '' : err.slice(-2000) });
    });
  });
  const pool = async (tasks) => { const out = new Array(tasks.length); let k = 0; await Promise.all(Array.from({ length: jobs }, async () => { while (k < tasks.length) { const i = k++; out[i] = await tasks[i](); } })); return out; };
  const only = flag('--only') ? flag('--only').split(',') : (flag('--w10') ? [] : CASE_NAMES);
  const out = { commit: flag('--commit', '?'), process: 'one Node process a case', cases: {} };
  const logs = {};
  const res = await pool(only.map((name) => () => runChild(['--case', name])));
  only.forEach((name, i) => {
    const { r, log, err } = res[i];
    if (!r) { console.log(`${name.padEnd(15)} ERROR\n${err}`); out.cases[name] = { error: err }; return; }
    out.newHandling = r.newHandling; out.cases[name] = r.g; logs[name] = log;
    const g = r.g;
    console.log(`${name.padEnd(15)} ${g.fails.length ? 'FAIL' : 'pass'}  ${JSON.stringify({ ev: g.events, W7: g.W7 })}`);
    for (const f of g.fails) console.log(`    - ${f}`);
  });
  if (flag('--w10')) {
    const seqs = flag('--w10-only') ? flag('--w10-only').split(',') : W10_SEQS;
    const tasks = [], keys = [];
    for (const sq of seqs) {
      // the sequence's own length first (to its W7 end, at most its record): every step of it gets each interrupt
      /* M1a weapons round 3 (W10 restated, the wave 3 ruling: "the 0.06 m per step bar applies to a jump against the
       * sequence's own planned motion (the rendered wrist against where the authored path puts it that step), not to the
       * authored path's own speed"): the same run also records the sequence UNINTERRUPTED over the interrupt runs' length
       * (the authored path, step by step), and each interrupt run is graded against it */
      const n = Math.round(Number(flag('--w10-steps', 0)) || 0);
      const ref = await runChild(['--case', sq, '--w10-len', '--w10-ref']);
      const steps = n || Math.round(ref.r?.len ?? 30);
      const refF = path.join(tmp, `ref_${sq}.json`);
      writeFileSync(refF, JSON.stringify((ref.log || []).map((r) => ({ t: r.t, wristL: r.wristL, wristR: r.wristR }))));
      /* (...and the interrupt's own authored motion: the same interrupt from the case's start state with the sequence never
       *  asked for, injected at its step 0; a jump is graded against whichever of the two authored paths the rendered
       *  wrist follows more closely that step, so neither path's own speed counts, and a cut between them does) */
      for (const kind of W10_KINDS) {
        const iref = await runChild(['--case', sq, '--w10-iref', kind]);
        const irefF = path.join(tmp, `iref_${sq}_${kind}.json`);
        writeFileSync(irefF, JSON.stringify((iref.log || []).map((r) => ({ t: r.t, wristL: r.wristL, wristR: r.wristR }))));
        for (let k = 0; k <= steps; k++) { keys.push([sq, kind, k]); tasks.push(() => runChild(['--case', sq, '--inject', `${kind}@${k}`, '--ref', refF, '--iref', irefF])); }
      }
    }
    console.log(`W10: ${tasks.length} runs, ${jobs} at once`);
    const R10 = await pool(tasks);
    const w10 = {};
    keys.forEach(([sq, kind, k], i) => {
      const r = R10[i].r; const e = (w10[`${sq}/${kind}`] ??= { runs: 0, fails: 0, worstWristM: 0, worstAt: null, failList: [] });
      e.runs++;
      if (!r) { e.fails++; e.failList.push(`@${k}: no result`); return; }
      const w = r.w10;
      if (w.jumpAcrossM > e.worstWristM) { e.worstWristM = w.jumpAcrossM; e.worstAt = k; }
      e.worstRawM = Math.max(e.worstRawM || 0, w.wristAcrossM);
      if (w.fails.length) { e.fails++; if (e.failList.length < 6) e.failList.push(`@${k}: ${w.fails.join('; ')}`); }
    });
    let tot = 0, bad = 0;
    for (const [key, e] of Object.entries(w10)) { tot += e.runs; bad += e.fails; e.worstWristM = +e.worstWristM.toFixed(4); console.log(`W10 ${key.padEnd(24)} ${e.fails ? 'FAIL' : 'pass'} ${e.fails}/${e.runs} runs fail; worst jump against the planned path ${e.worstWristM} m @${e.worstAt} (raw wrist step ${+(e.worstRawM || 0).toFixed(4)} m)`); for (const f of e.failList) console.log(`    - ${f}`); }
    out.W10 = { runs: tot, failRuns: bad, bySeq: w10 };
    console.log(`W10: ${bad} of ${tot} runs fail`);
  }
  rmSync(tmp, { recursive: true, force: true });
  if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(out, null, 1));
  if (flag('--log')) writeFileSync(flag('--log'), JSON.stringify(logs));
  process.exit(0);
}

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
const emu = { holsterT: 0, palmL: null, nockT: 0.42, wasAim: false, nockLanded: false, drawing: false, loosable: false };
const _wp = new THREE.Vector3(), _wq = new THREE.Quaternion(), _ws = new THREE.Vector3(), _qd = new THREE.Quaternion(), _e = new THREE.Euler();
const _aimD = new THREE.Vector3(), _mL = new THREE.Matrix4(), _zero = new THREE.Vector3(), _upY = new THREE.Vector3(0, 1, 0);
function placeInHand(aiming = false) {
  if (group.parent !== node) node.add(group);
  group.visible = true;
  node.updateWorldMatrix(true, false);
  node.matrixWorld.decompose(_wp, _wq, _ws);
  if (emu.palmL === null) { emu.palmL = undefined; for (const c of node.children) if (c.isBone && /^middle_01/.test(c.name)) { emu.palmL = c.position.clone().multiplyScalar(0.7); break; } }
  if (!aiming && emu.palmL) group.position.copy(emu.palmL); else group.position.set(0, 0, 0);
  const p = R.player;
  if (aiming) {
    // (_placeInHand's aimed branch: down the constraint rig's own arrow, else her forward)
    if (!an.bowAimDir?.(_aimD)) _aimD.set(Math.sin(p.heading || 0), 0, Math.cos(p.heading || 0));
    _aimD.normalize();
    _mL.lookAt(_zero, _aimD.clone().negate(), _upY);
    _qd.setFromRotationMatrix(_mL);
  } else {
    let run = p.moveSpeed / 6; if (!(run > 0)) run = 0; else if (run > 1) run = 1;
    _e.set(0.92, (p.heading || 0) + 0.12 + 0.18 * run, 0.2 - 0.1 * run, 'YXZ');
    _qd.setFromEuler(_e);
  }
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
  const mel = R.melee, p = R.player;
  const lanceOut = !!mel.lanceInHand || (NEW && mel.stance === 'draw');
  // (_updateNock: the arrow lands on the string 0.42 s after the raise; lowered, it goes back in the quiver)
  if (!p.aiming) { emu.nockT = 0.42; emu.nockLanded = false; emu.wasAim = false; }
  else {
    if (!emu.wasAim) { emu.nockT = 0.42; emu.wasAim = true; }
    // (M1a weapons round 3: combat holds the nock's clock while the animator's aim gate is shut, `bowAimGate`)
    if (an.bowNockHold ? an.bowNockHold(0.42) : (an.bowAimGate && an.bowAimGate() < 1)) emu.nockT = 0.42;
    emu.nockT = Math.max(0, emu.nockT - dt); emu.nockLanded = emu.nockT <= 0;
  }
  C.nockLanded = emu.nockLanded; C.nockProgress = p.aiming ? 1 - emu.nockT / 0.42 : 0;
  // (the draw: aiming with LMB held arms it the step after the nock lands, then 0.70 s to full)
  const lmb = !!(R.ctx.input.mouse.buttons & 1);
  if (p.aiming && lmb) {
    if (!emu.drawing && emu.nockLanded) { emu.drawing = true; C.drawStrength = 0; }
    else if (emu.drawing) C.drawStrength = Math.min(1, C.drawStrength + dt / 0.70);
  } else { emu.drawing = false; C.drawStrength = 0; }
  emu.loosable = emu.drawing && C.drawStrength > 0.02 && (!an.looseReady || an.looseReady());
  if (p.aiming) emu.holsterT = 8; else emu.holsterT = Math.max(0, emu.holsterT - dt);
  C.weaponDrawn = !lanceOut && (p.aiming || emu.holsterT > 0);
  const pathHand = an.bowInHand ? an.bowInHand() : null;
  const wield = pathHand ?? C.weaponDrawn;
  if (wield) { placeInHand(p.aiming); if (pathHand !== null) an.bowPathPose?.(group); } else placeOnBack();
}
const key1 = () => { R.melee.holsterLance(true); if (NEW) emu.holsterT = 8; };    // quickslots.select(1) (+ noteCombatAction: NEW)
const key2 = () => { R.melee.drawLance(); };                                     // quickslots.select(2)
const fwd = (speed) => { const p = R.player; p.velocity.set(Math.sin(p.heading) * speed, 0, Math.cos(p.heading) * speed); p.moveSpeed = speed; };
function tick(speed = 0) { if (speed) fwd(speed); step(R); combatStep(1 / 60); }

let KITF = null;
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
  // (M1a weapons fix round 1: the sequence's kit frame, estimated here once, off the same pose: the W2 reading of the stowed bow)
  if (NEW && typeof an._bowKitInit === 'function') { an._bowPathState?.(); an._bowKitInit(); const B = an._bp; if (B?.kit) KITF = { q: B.kitQ.clone(), o: B.kitO.clone(), s: B.kitS }; }
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
const DBG = process.env.HB_DBG ? new Function('an', 'ml', 'mel', 'B', 'H', `return (${process.env.HB_DBG});`) : null;
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
    /* M1a weapons fix round 1 (W2 at the bow's grip and release): the SAME points as the held bow's (SOCKETS.bow.tip and the
     * mesh's [0, +-0.6, 0]), placed on the stowed bow by the sequence's own kit frame (carryStow `_bowKitNow`, `_bowPt`).
     * Round 2 compared the kit piece's farthest vertices with the held bow's socket tip: the 0.0416-0.0437 m "jump" at
     * every grip lay along the stave (-0.0436 of 0.0437 m) between two different points (the axes 1.448 m and 1.163 m long).
     * The farthest-vertex reading is kept as bowTipKitVtx. */
    r.bowTipKitVtx = r.bowTip;
    // (the kit frame is the sequence's estimate off the posed kit, re-taken at each request: it moved 0.0076 m between the
    //  reset's estimate and the request's. One snapshot a case, the first the bench sees, so the stowed bow reads still)
    const B = an._bp;
    if (B?.kit && B.kitQ && B.kitO && !KITF) KITF = { q: B.kitQ.clone(), o: B.kitO.clone(), s: B.kitS };
    if (KITF) {
      // (in spine_02's own units, as the kit is: carryStow `_bowKitInit` keeps kitO there and kitS in metres a mesh unit)
      sp.updateWorldMatrix(true, false); _ws.setFromMatrixScale(sp.matrixWorld);
      const u = _ws.x / (model.getWorldScale(_v).x || 1);
      const at = (x, y, z) => chW(sp.localToWorld(new THREE.Vector3(x, y, z).multiplyScalar(KITF.s / u).applyQuaternion(KITF.q).add(KITF.o)));
      const T = SOCKETS.bow.tip;
      r.bowTip = at(T[0], T[1], T[2]);
      const hi = at(0, 0.6, 0), lo2 = at(0, -0.6, 0);
      r.bowAxis = [hi[0] - lo2[0], hi[1] - lo2[1], hi[2] - lo2[2]];
    }
  }
  r.bowTipSp = toSp(r.bowTip);
  r.bowLowSp = toSp([r.bowTip[0] - r.bowAxis[0], r.bowTip[1] - r.bowAxis[1], r.bowTip[2] - r.bowAxis[2]]);
  const H = NEW ? an.handlingInfo() : null;
  r.bowOwner = held ? 'handL' : 'carry';
  r.bowSock = H?.bow?.sockChar ? H.bow.sockChar.slice() : null;
  r.bowS = H ? H.bow.s : null; r.bowPhase = H ? H.bow.phase : (an._bp?.mode ? `m${an._bp.mode}` : '');
  r.curlL = H ? H.bow.curl : null;
  // (M1a weapons round 3: the bow's hand-over to combat's placement, 0 posed from the fist .. 1 combat's: the raised aim)
  r.bowAimK = H ? (H.bow.aimK ?? 0) : 0;
  // (M1a weapons round 3, the reverse take and the two-hand regrip: which grip holds the bow, the handling's socket normal,
  //  the right hand on the upper limb)
  r.bowGripKind = H ? (H.bow.gripKind ?? null) : null;
  r.bowSockNH = H?.bow?.sockN ? H.bow.sockN.slice() : null;
  r.rightHold = H ? !!H.bow.rightHold : false; r.rightMiss = H ? H.bow.rightMiss ?? null : null;
  // (M1a weapons fix round 1, FIX LIST 12: the drawn palm against the plan's socket, the kit bow's at the keeper)
  r.bowPalmMiss = H && H.bow.palmMiss != null ? +H.bow.palmMiss.toFixed(5) : null; r.bowAtKeeper = H ? !!H.bow.atKeeper : false;
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
  /* ---- M1a weapons fix 1 (the judge's FIX LIST 2: grade every frozen clause) */
  // the events as stamped (sim s) and this step's sim time, so a row can tell an owner change AT an event from one outside
  r.simT = H ? H.simT : null; r.bowGripAt = H ? H.bow.gripAt : null; r.bowReleaseAt = H ? H.bow.releaseAt : null;
  // the fingers (char): every joint and the tip (the 03 bone's end, its own length again past it x 0.85)
  const fing = (list) => { const o = []; for (let i = 0; i + 2 < list.length; i += 3) { const a = ch(list[i].bone), b2 = ch(list[i + 1].bone), c = ch(list[i + 2].bone); o.push([a, b2, c, [c[0] + (c[0] - b2[0]) * 0.85, c[1] + (c[1] - b2[1]) * 0.85, c[2] + (c[2] - b2[2]) * 0.85]]); } return o; };
  r.fingL = fing(an._fingerL || []); r.fingR = fing(an._fingerR || []);
  // the palm normal (char): the way the four fingers' first segments bend (01 to 02) off the line wrist to knuckle, summed
  // over the four (the palm side; graded once the fingers are closed)
  const pn = (F, wr) => { if (F.length < 4) return null; const n = [0, 0, 0]; for (let i = 0; i < 4; i++) { const kn = F[i][0], j2 = F[i][1]; const f = [kn[0] - wr[0], kn[1] - wr[1], kn[2] - wr[2]], fl = Math.hypot(...f) || 1; const fu = f.map((x) => x / fl); const d = [j2[0] - kn[0], j2[1] - kn[1], j2[2] - kn[2]]; const k = d[0] * fu[0] + d[1] * fu[1] + d[2] * fu[2]; for (let a = 0; a < 3; a++) n[a] += d[a] - fu[a] * k; } const nl = Math.hypot(...n); return nl > 1e-5 ? n.map((x) => x / nl) : null; };
  r.palmNL = pn(r.fingL, r.wristL); r.palmNR = pn(r.fingR, r.wristR);
  // the held bow's centreline about the sockets and its surface radius there (char m; sockets.js r, read off the mesh)
  if (held) {
    mesh.updateWorldMatrix(true, false);
    const at = (p) => chW(_v.fromArray(p).applyMatrix4(mesh.matrixWorld));
    const L0 = SOCKETS.bow.limb.p, G0 = SOCKETS.bow.grip.p;
    r.bowLineA = at([L0[0], L0[1] - 0.20, L0[2]]); r.bowLineB = at([G0[0], G0[1] + 0.12, G0[2]]);
    r.bowLimbC = at(L0); r.bowGripC = at(G0);
    _ws.setFromMatrixScale(mesh.matrixWorld); const ms = _ws.x / (model.getWorldScale(_v).x || 1);
    r.bowRLimb = SOCKETS.bow.limb.r * ms; r.bowRGrip = SOCKETS.bow.grip.r * ms;
    // (the socket frame's normal: from the palm point toward the centreline, sockets.js's palm offset square to the axis)
    // (M1a weapons round 2: each socket has its own palm side, sockets.js: the limb's at the take, the grip's on the riser;
    //  the one nearer the slide is the frame; the slide itself is not graded for the normal, the fingers are open there)
    const P = (H?.bow?.s ?? 1) < 0.5 && SOCKETS.bow.limb.palm ? SOCKETS.bow.limb.palm : SOCKETS.bow.palm; const nm = [-P[0], 0, -P[2]];
    const a0 = at([0, 0, 0]), a1 = at(nm); r.bowSockN = [a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]];
  }
  // the lance's three sockets on the visible haft (char)
  { const len = SOCKETS.lance.tip[1], d = [r.lanceTip[0] - r.lanceButt[0], r.lanceTip[1] - r.lanceButt[1], r.lanceTip[2] - r.lanceButt[2]];
    const pt = (y) => [r.lanceButt[0] + d[0] * y / len, r.lanceButt[1] + d[1] * y / len, r.lanceButt[2] + d[2] * y / len];
    r.lanceSockButt = pt(SOCKETS.lance.butt.p[1]); r.lanceSockGrip = pt(SOCKETS.lance.grip.p[1]); r.lanceSockFore = pt(SOCKETS.lance.fore.p[1]); }
  // W8: the draw hand to the quiver (char), the arrow on the string (combat's nock), loosable (combat's draw and the rig)
  { const q = an._quivT || an.T?.quiverHip; r.handToQuiver = q ? Math.hypot(r.palmR[0] - q.x, r.palmR[1] - q.y, r.palmR[2] - q.z) : null; }
  r.aiming = !!R.player.aiming; r.nockLanded = !!emu.nockLanded; r.loosable = !!emu.loosable; r.drawS = +(C.drawStrength || 0).toFixed(4);
  r.dodging = !!R.player.dodging;
  // the fingers' curl as drawn (deg, mean over the four fingers of the bends at 01-02 and 02-03), the feet (char), the reach additive
  const cg = (F, wr) => { if (!F.length) return null; let s2 = 0; for (const [a, b2, c] of F) { const d0 = [a[0] - wr[0], a[1] - wr[1], a[2] - wr[2]], d1 = [b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]], d2 = [c[0] - b2[0], c[1] - b2[1], c[2] - b2[2]]; const an2 = (u, w2) => Math.acos(Math.max(-1, Math.min(1, (u[0] * w2[0] + u[1] * w2[1] + u[2] * w2[2]) / ((Math.hypot(...u) * Math.hypot(...w2)) || 1)))) * D; s2 += an2(d0, d1) + an2(d1, d2); } return +(s2 / F.length).toFixed(2); };
  r.curlGeoL = cg(r.fingL, r.wristL); r.curlGeoR = cg(r.fingR, r.wristR);
  r.footL = b.footL ? ch(b.footL.bone) : null; r.footR = b.footR ? ch(b.footR.bone) : null;
  r.reachYaw = H && typeof H.bow.yaw === 'number' ? +(H.bow.yaw * D).toFixed(3) : 0;
  // (a debugging probe: HB_DBG names an expression over an, ml, mel, B (carryStow's sequence), H; its value is kept as r.dbg)
  if (DBG) { try { r.dbg = DBG(an, ml, mel, an._bp, H); } catch (e) { r.dbg = String(e); } }
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
  /* M1a weapons fix round 1 (A101's from-holstered rows at a jog and a sprint: 0.60 / 0.58 s in the page at ff3afb9, R5
   * 0.25-0.35; the Node click was idle only) */
  clickJog: { kind: 'click', tempo: 'ask', jog: true, pre: () => { for (let i = 0; i < 60; i++) tick(SPEEDS.jog); }, go: () => { R.ctx.input.mouse.buttons = 1; }, secs: 0.9, speed: SPEEDS.jog, each: (i) => { if (i === 3) R.ctx.input.mouse.buttons = 0; } },
  clickSprint: { kind: 'click', tempo: 'ask', jog: true, pre: () => { R.player.sprinting = true; for (let i = 0; i < 60; i++) tick(SPEEDS.sprint); }, go: () => { R.ctx.input.mouse.buttons = 1; }, secs: 0.9, speed: SPEEDS.sprint, each: (i) => { if (i === 3) R.ctx.input.mouse.buttons = 0; }, post: () => { R.player.sprinting = false; } },
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

/* M1a weapons fix 1 (the judge's FIX LIST 3): the missing rows' cases. W8: RMB from stowed with LMB held, to a loose-ready
 * draw (and W7's RMB-to-loosable). W9 from every start state: empty (bowUnstow, lanceDraw are key 1 and key 2 from
 * empty), mid-draw and mid-stow. The bow's asked stow is swap 1 to 2's first half (key 2; graded there). */
const rmb = () => { R.player.aiming = true; R.ctx.input.mouse.buttons = 1; };
Object.assign(CASES, {
  rmbFromStowed: { kind: 'aim', tempo: 'ask', pre: () => {}, go: rmb, secs: 1.6, post: () => { R.player.aiming = false; } },
  key1MidLanceDraw: { kind: 'swap21', tempo: 'ask', w9: 'bow', pre: () => {}, go: key2, secs: 1.6, each: (i) => { if (i === 9) key1(); } },
  key2MidBowUnstow: { kind: 'swap12', tempo: 'ask', w9: 'lance', pre: () => {}, go: () => { emu.holsterT = 8; }, secs: 1.6, each: (i) => { if (i === 9) key2(); } },
  key2MidBowStow: { kind: 'swap12', tempo: 'ask', w9: 'lance', pre: () => settleBowOut(), go: () => { emu.holsterT = 0; }, secs: 1.6, each: (i) => { if (i === 12) key2(); } },
  key1MidLanceStow: { kind: 'swap21', tempo: 'ask', w9: 'bow', pre: () => settleLanceOut(), go: () => R.melee.holsterLance(), secs: 1.6, each: (i) => { if (i === 9) key1(); } },
});
CASES.bowUnstow.w9 = 'bow'; CASES.lanceDraw.w9 = 'lance'; CASES.swap12.w9 = 'lance'; CASES.swap21.w9 = 'bow';
CASES.swap12Jog.w9 = 'lance'; CASES.swap21Jog.w9 = 'bow';
{ const { CASE_NAMES } = await import('./handling-cases.mjs'); for (const n of CASE_NAMES) if (!CASES[n]) throw new Error(`handling-cases.mjs names ${n}, the bench has no such case`); }

/* ---- W10: an interrupt injected at step k of a sequence (`--inject kind@k`) */
const OPP = { bowUnstow: () => { emu.holsterT = 0; }, bowStowTimer: () => { emu.holsterT = 8; }, lanceDraw: () => R.melee.holsterLance(), lanceStowAsk: () => R.melee.drawLance(), lanceStowTimer: () => R.melee.drawLance(), swap12: key1, swap21: key2 };
const IREF = flag('--w10-iref');
const inj = flag('--inject') ? { kind: flag('--inject').split('@')[0], at: Number(flag('--inject').split('@')[1]) } : IREF ? { kind: IREF, at: 0 } : null;
let rollK = -1;
function inject(i) {
  if (!inj) return;
  if (i === inj.at) {
    if (inj.kind === 'roll') { R.player.dodging = true; rollK = 0; }
    else if (inj.kind === 'aim') R.player.aiming = true;
    else if (inj.kind === 'strike') R.ctx.input.mouse.buttons = 1;
    else if (inj.kind === 'opposite') OPP[CASE]?.();
  }
  if (inj.kind === 'strike' && i === inj.at + 3) R.ctx.input.mouse.buttons = 0;
  if (rollK >= 0) {
    const N = Math.round(0.82 * 60); rollK++;
    R.player.dodgeK = Math.min(1, rollK / N);
    const p = R.player; p.velocity.set(Math.sin(p.heading) * 3.4 / 0.82, 0, Math.cos(p.heading) * 3.4 / 0.82); p.moveSpeed = 3.4 / 0.82;
    if (rollK > N) { p.dodging = false; p.dodgeK = 1; rollK = -1; p.velocity.set(0, 0, 0); p.moveSpeed = 0; }
  }
}

/* ---- the one case this process runs */
const c = CASES[CASE];
if (!c) { console.log(`@@RESULT ${JSON.stringify({ error: `no case ${CASE}` })}`); process.exit(1); }
reset(R); emu.holsterT = 0; for (let i = 0; i < 40; i++) tick();
kitInit();
c.pre();
// (the sequence's kit frame as it stands at the request, after the lead-in: a jog's pose is not the reset's)
if (NEW && an._bp && typeof an._bowKitInit === 'function' && (an._bp.mode ?? 0) === 0 && an._bp.owner !== 'handL') { an._bowKitInit(); if (an._bp.kit) KITF = { q: an._bp.kitQ.clone(), o: an._bp.kitO.clone(), s: an._bp.kitS }; }
const spd = c.speed ?? (c.jog ? SPEEDS.jog : 0);
M.begin(CASE);
if (!IREF) c.go();
const L = [];
const N = Math.round((c.secs + (inj || args.includes('--w10-ref') ? 0.6 : 0)) * 60);
for (let i = 0; i < N; i++) {
  c.each?.(i);
  inject(i);
  tick(R.player.dodging ? 0 : spd);
  M.sample({ T: +((i + 1) / 60).toFixed(3) });
  const r = record((i + 1) / 60);
  L.push(r);
}
const m = M.end();
L[L.length - 1].behind = m.behind; L[L.length - 1].plane = m.plane;
c.post?.();
const g = gradeCase(c.kind, L, { tempo: c.tempo, jog: !!c.jog, w9: c.w9 ?? null, name: CASE, lanceR: { butt: SOCKETS.lance.butt.r, grip: SOCKETS.lance.grip.r, fore: SOCKETS.lance.fore.r } });
g.measure = { behind: m.behind, plane: m.plane, overShoulder: m.overShoulder, behindAt: m.behindAt, planeAt: m.planeAt };
const res = { newHandling: NEW, g };
if (flag('--w10-len') !== null || args.includes('--w10-len')) {
  const w = g.W7 || {}; const t = w.lanceReadyS ?? w.bowReadyS ?? w.bowStowS ?? w.lanceStowS ?? c.secs;
  res.len = Math.round(Math.min(c.secs, t) * 60);
}
if (inj && !IREF) res.w10 = gradeInterrupt(L, inj.at, g, flag('--ref') ? JSON.parse(readFileSync(flag('--ref'), 'utf8')) : null, flag('--iref') ? JSON.parse(readFileSync(flag('--iref'), 'utf8')) : null);
if (flag('--log-to')) writeFileSync(flag('--log-to'), JSON.stringify(L));
console.log(`@@RESULT ${JSON.stringify(res)}`);
process.exit(0);
