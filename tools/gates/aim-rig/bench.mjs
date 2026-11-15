/**
 * M1.3b (hero-anim) — the aim rig's offline bench: Brea's real animator in Node (`load.mjs`), driven through
 * every cell of the stance x move x yaw matrix, graded on the M1.3b bars. No browser. The same bars are
 * graded in the page by `tools/gates/aim-rig.mjs`; this bench exists so the rig is right before a browser
 * is spent on it.
 *
 *   node tools/gates/aim-rig/bench.mjs [--cells stand.still.0,crouch.strafeL.sweep6] [--json out.json] [--old]
 *
 * `--old` grades the aim as it was before the constraint rig (the rig's switch off).
 *
 * What it stands in for, and how (the page does these for real):
 * - player.js: heading turns onto the camera at 12 rad/s while aiming; the move is the aim sidestep
 *   (1.35 m/s, crouched 1.05) in the heading's frame; the lens orbits a 1.45 m pivot (1.06 crouched) at
 *   1.75 m (aiming).
 * - combat.js: the aim point is the lens ray's hit on flat ground or 40 m out; the draw builds over 0.7 s
 *   once the arrow is on; the bow hangs off the left hand, +Z on the line from the hand to the aim point
 *   (`_placeInHand`), the Sabina's nock at (0, 0.018, restZ - draw * pull) under a 0.22 rad cant, 0.1 m
 *   under the hand.
 */
import { loadBrea, makeRig, THREE } from './load.mjs';
import { writeFileSync } from 'fs';
import { buildMeasure } from './measure.mjs';

const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OLD = args.includes('--old');
/** --flow: print A-draw-elbow-level's flow readings per cell (`flow`) */
const FLOW = args.includes('--flow');
/** --old-string: the string linear in combat's draw to 1 (before M1a r3) */
const OLD_STRING = args.includes('--old-string');
const TRACE = process.env.TRACE || null;

export const STANCES = ['stand', 'crouch'];
export const MOVES = ['still', 'strafeL', 'strafeR', 'fwd', 'back'];
/** yaw: `0` the camera held; `sweepN` a camera yaw sweep at N rad/s, 1.2 rad each way and back (whole periods, from 1.0 s), through the full draw and the loose */
export const YAWS = ['0', 'sweep3', 'sweep8'];
export const PITCHES = [-1.15, -0.55, 0, 0.75, 1.02];

const MOVE_DIR = { still: null, strafeL: [1, 0], strafeR: [-1, 0], fwd: [0, 1], back: [0, -1] };

async function main() {
  const log = console.log, table = console.table, warn = console.warn;
  console.log = () => {}; console.table = () => {}; console.warn = () => {};
  const A = await loadBrea();
  const R = await makeRig(A);
  console.log = log; console.table = table; console.warn = warn;
  if (OLD) R.an.T.cRig = null;
  const M = buildMeasure(R, THREE);
  R.M = M;
  const want = flag('--cells');
  const cells = [];
  for (const s of STANCES) for (const m of MOVES) for (const y of YAWS) cells.push(`${s}.${m}.${y}`);
  const list = want ? want.split(',') : cells;
  const pitches = flag('--pitches') ? flag('--pitches').split(',').map(Number) : PITCHES;
  const out = [];
  const t0 = Date.now();
  for (const id of list) {
    for (const pitch of pitches) {
      const r = await runCell(R, M, id, pitch);
      out.push(r);
      const f = (r.fails.length ? 'FAIL ' + r.fails.join('; ') : 'pass') + (FLOW ? `  flow ${JSON.stringify(r.flow)}` : '');
      const K = r.kept; log(`${id.padEnd(22)} p${String(pitch).padStart(5)}  [kept: elbC ${K.elbowCharMax.toFixed(3)} wnF ${K.wristNockFull.toFixed(3)} wnR ${K.wristNockRamp.toFixed(3)} hc ${K.headClearMin.toFixed(2)} hu ${K.handHeadUnitMin.toFixed(2)} q ${K.quiverMin.toFixed(3)} rear ${K.looseRear.toFixed(3)}]  knuckle ${r.knuckleJaw.toFixed(3)}  elbowH [${r.elbowH[0].toFixed(3)},${r.elbowH[1].toFixed(3)}]  elbowBack ${r.elbowBack.toFixed(3)}  bowChest ${r.bowChest.toFixed(3)}  handNock ${r.handNock.toFixed(3)}  wrapIn ${r.wrapIn}  behind ${r.behind}  verify ${r.verifyFails}  ${f}`);
    }
  }
  const nf = out.filter((r) => r.fails.length).length;
  log(`\n${out.length} cells, ${out.length - nf} pass, ${nf} fail, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(out, null, 1));
}

/** Reset her to standing, unaimed, at the origin facing +Z, and settle. */
export function reset(R) {
  const { player: p, combat: c, an } = R;
  p.position.set(0, 0, 0); p.velocity.set(0, 0, 0); p.heading = 0; p.camYaw = Math.PI; p.camPitch = 0;
  p.aiming = false; p.crouching = false; p.crouchAim = false; p.moveSpeed = 0; p.dodging = false;
  c.drawStrength = 0; p.drawStrength = 0;
  R.t = R.t ?? 0;
  for (let i = 0; i < 40; i++) step(R, 1 / 60);
  an.resetAimAudit?.();
}

/** One 1/60 s step of the stand-ins and the real animator. */
export function step(R, dt, cam = null) {
  const { player: p, combat: c, an, model, camera } = R;
  R.t += dt;
  // player.js: heading onto the camera while aiming (AIM_TURN 12 rad/s)
  if (p.aiming) {
    let g = p.camYaw + Math.PI - p.heading; g -= Math.round(g / (2 * Math.PI)) * 2 * Math.PI;
    const mx = 12 * dt; p.heading += Math.max(-mx, Math.min(mx, g));
  }
  if (cam?.move) {
    const sp = p.crouching ? 1.05 : 1.35;
    const [lx, lz] = cam.move;
    const s = Math.sin(p.heading), co = Math.cos(p.heading);
    // local +X is her left (char +X): world = rotY(heading) * local
    p.velocity.set(lx * co + lz * s, 0, -lx * s + lz * co).multiplyScalar(sp);
    p.moveSpeed = sp;
  } else { p.velocity.set(0, 0, 0); p.moveSpeed = 0; }
  p.position.addScaledVector(p.velocity, dt);
  model.position.copy(p.position); model.rotation.y = p.heading;
  model.updateMatrixWorld(true);
  // the lens: pivot 1.45 (1.06 crouched), boom 1.75 aiming / 2.8, behind along camYaw
  // (crouch-aiming steeply down the pivot stands PIVOT_CROUCH_STEEP 0.14 higher, player.js)
  const steep = p.crouching && p.aiming ? 0.14 * Math.min(1, Math.max(0, (p.camPitch - 0.5) / 0.5)) : 0;
  const piv = new THREE.Vector3(p.position.x, p.position.y + (p.crouching ? 1.06 + steep : 1.45), p.position.z);
  const pb = Math.min(p.camPitch, 1.4);
  const dir = new THREE.Vector3(Math.sin(p.camYaw) * Math.cos(pb), Math.sin(pb), Math.cos(p.camYaw) * Math.cos(pb));
  camera.position.copy(piv).addScaledVector(dir, p.aiming ? 1.75 : 2.8);
  camera.lookAt(piv);
  camera.updateMatrixWorld(true);
  // combat: the aim point (flat ground or 40 m), the draw
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  let dist = 40;
  if (fwd.y < -1e-3) dist = Math.min(dist, -camera.position.y / fwd.y);
  c.aimPoint.copy(camera.position).addScaledVector(fwd, dist);
  p.drawStrength = c.drawStrength;
  an.update(dt, R.t);
  placeBow(R);
}

/** combat._placeInHand while aiming (the base WeaponModel frame of the Sabina). */
function placeBow(R) {
  const { combat: c, an, player: p } = R;
  const bow = c.bow;
  if (!bow) return;
  const node = an.handAttach('l');
  if (bow.group.parent !== node) node.add(bow.group);
  node.updateWorldMatrix(true, false);
  const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
  node.matrixWorld.decompose(wp, wq, ws);
  const ad = new THREE.Vector3();
  if (!an.bowAimDir?.(ad)) { ad.subVectors(c.aimPoint, wp); if (ad.lengthSq() < 0.25) R.camera.getWorldDirection(ad); }
  ad.normalize();
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), ad.clone().negate(), new THREE.Vector3(0, 1, 0));
  const qd = new THREE.Quaternion().setFromRotationMatrix(m);
  bow.group.quaternion.copy(wq.invert().multiply(qd));
  bow.group.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z);
  bow.group.updateWorldMatrix(true, true);
  bow.draw = p.aiming ? c.drawStrength : 0;
}

export function makeBow(R) {
  const group = new THREE.Group(), model = new THREE.Group();
  model.rotation.z = 0.22; model.position.y = -0.1; group.add(model);
  const restZ = 0.055, pull = +(0.527 + restZ).toFixed(4);
  const nockLocal = new THREE.Object3D(); model.add(nockLocal);
  // (M1a r3: the Sabina's string reaches the anchor at combat's draw `fullAt`, src/combat/bow.js stringDraw)
  const fullAt = OLD_STRING ? 1 : 0.9;
  const stringDraw = (d) => (d >= fullAt ? 1 : d <= 0 ? 0 : d / fullAt);
  return {
    group, model, restZ, pull, fullAt, stringDraw, draw: 0,
    /** the string's nocking point, world (= the nocked arrow's nock: the Sabina carries it there) */
    getNockWorld(draw, out) { nockLocal.position.set(0, 0.018, restZ - stringDraw(draw) * pull); nockLocal.updateWorldMatrix(true, false); return out.setFromMatrixPosition(nockLocal.matrixWorld); },
  };
}

/**
 * One cell at one pitch: aim at 0.0 s, the arrow on and the draw from 0.25 s (full at ~0.95 s), held to 2.2 s,
 * loosed, re-nocked and drawn again to 3.6 s, aim released, 0.6 s out. The yaw sweeps run 1.0-2.2 s.
 */
async function runCell(R, M, id, pitch) {
  const [stance, move, yaw] = id.split('.');
  const { player: p, combat: c, an } = R;
  if (!c.bow) { c.bow = makeBow(R); }
  reset(R);
  p.camPitch = pitch;
  if (stance === 'crouch') { p.crouching = true; for (let i = 0; i < 40; i++) step(R, 1 / 60); }
  const mv = MOVE_DIR[move];
  if (mv) for (let i = 0; i < 30; i++) step(R, 1 / 60, { move: mv });
  M.begin();
  const FL = { prev: null, stepMax: 0, stepAt: null, looseT: null, lH: -9, lE: -9, fullE: -9, raiseMax: 0, raiseAt: null, kn90: 0, kn90At: null, rear: 0, h0: null };
  const sweep = yaw.startsWith('sweep') ? +yaw.slice(5) : 0;
  const yaw0 = p.camYaw;
  const dt = 1 / 60;
  let T = 0, drawing = false, loosed = 0;
  const END = 4.2;
  while (T < END) {
    T += dt;
    p.aiming = T < 3.6;
    p.crouchAim = p.crouching && p.aiming;
    // the draw: 0.7 s; loose at 2.2 s; the re-nock 0.35 s; the second draw from 2.6 s
    const lmb = (T > 0.25 && T < 2.2) || (T > 2.6 && T < 3.55);
    if (p.aiming && lmb) { if (!drawing) { drawing = true; c.drawStrength = 0; } else c.drawStrength = Math.min(1, c.drawStrength + dt / 0.7); }
    else { if (drawing && p.aiming && c.drawStrength > 0.02) { loosed++; R.events.emit('arrow-fired', {}); M.loose(T); } drawing = false; c.drawStrength = 0; }
    // the sweep runs whole periods (out 1.2 rad, back past centre, home), so it never cuts the camera
    const per = sweep ? 4 * 1.2 / sweep : 0, sEnd = sweep ? 1.0 + per * Math.max(1, Math.round(1.2 / per)) : 0;
    if (sweep && T > 1.0 && T < sEnd) {
      const ph = (T - 1.0) * sweep, A = 1.2;
      const tri = (x) => { const m = x % (4 * A); return m < A ? m : m < 3 * A ? 2 * A - m : m - 4 * A; };
      p.camYaw = yaw0 + tri(ph);
    } else if (sweep && T >= sEnd) p.camYaw = yaw0;
    step(R, dt, { move: mv });
    M.sample({ T, aiming: p.aiming, draw: c.drawStrength });
    flow(R, FL, T, c.drawStrength, loosed);
    if (TRACE && TRACE === `${id}:${pitch}` && T < +(process.env.TRACE_T || 0.7)) {
      const v = (x) => x.toArray().map((n) => +n.toFixed(2));
      const un = (n) => { const o = new THREE.Vector3(); an._charOf(an.bones[n], o); an._cRigHead(); return v(an._cRigUnit(o)); };
      const hf = new THREE.Vector3(0, 0, 1).applyQuaternion(an._liveW(an.b.head.bone, new THREE.Quaternion()).multiply(an.b.head.invW));
      const C = an._cr || {};
      console.log(T.toFixed(3), 'tw', (C.twist ?? 0).toFixed(3), 'twT', (C.tw ?? 0).toFixed(3), 'gd', (C.gripDef ?? 0).toFixed(3), 'd', C.d ? v(C.d) : '', 'aimW', an._aimW.toFixed(2), 'w', (C.w ?? 0).toFixed(2), 'q', an._quiverT.toFixed(2), 'draw', an._drawS.toFixed(2), 'def', (C.gripDef ?? 0).toFixed(3), 'headFwd', v(hf), 'hand_l', un('hand_l'), 'tip_l', un('middle_04_leaf_l'), 'lo_l', un('lowerarm_l'), 'hand_r', un('hand_r'), 'idx_r', un('index_01_r'), 'G', C.grip ? (an._cRigHead(), v(an._cRigUnit(C.grip.clone()))) : '');
    }
  }
  const r = M.end();
  r.id = id; r.pitch = pitch; r.loosed = loosed;
  // M1a r2 fix: A-draw-elbow-level's flow clauses read here as the page row reads them (an.debugArm, an.behindHead):
  // the elbow and the wrist step relative to the draw shoulder (<= 0.06 m a sim step) from the aim on, the hand
  // in front of the back of the skull (< 0) and the elbow <= 0.20 m behind it through the loose's 0.3 s, and the
  // elbow at the full draw before the first loose. Reported beside the M1.3b bars, not graded into `fails`.
  r.flow = { armStepMaxM: +FL.stepMax.toFixed(4), armStepAt: FL.stepAt, raiseStepMaxM: +FL.raiseMax.toFixed(4), raiseAt: FL.raiseAt,
    looseHandBehindSkull: +FL.lH.toFixed(4), looseElbowBehindSkull: +FL.lE.toFixed(4), fullElbowBehindSkull: +FL.fullE.toFixed(4),
    // (M1a r3: A32's reading, the index knuckle to the jaw-corner anchor on every step with combat's draw >= 0.9
    //  before the first loose; A17's, the wrist's char -z travel in the 0.26 s after the loose)
    knuckleJaw90: +FL.kn90.toFixed(4), knuckleJaw90At: FL.kn90At, looseRearM: +FL.rear.toFixed(4) };
  return r;
}

/** One sim step of the flow readings (see `runCell`). */
function flow(R, FL, T, draw, loosed) {
  const { an, player: p } = R;
  if (!p.aiming || !an.debugArm) { FL.prev = null; return; }
  const Q = an.debugArm('r');
  const sh = new THREE.Vector3(Q.shoulder.x, Q.shoulder.y, Q.shoulder.z), el = new THREE.Vector3(Q.elbow.x, Q.elbow.y, Q.elbow.z), ha = new THREE.Vector3(Q.hand.x, Q.hand.y, Q.hand.z);
  const eR = el.clone().sub(sh), hR = ha.clone().sub(sh);
  if (FL.prev) {
    const de = eR.distanceTo(FL.prev.e), dh = hR.distanceTo(FL.prev.h), m = Math.max(de, dh);
    const at = `${T.toFixed(3)}s ${de >= dh ? 'elbow' : 'wrist'}`;
    if (m > FL.stepMax) { FL.stepMax = m; FL.stepAt = at; }
    if (T < 1.0 && m > FL.raiseMax) { FL.raiseMax = m; FL.raiseAt = at; }
  }
  if (process.env.FLOW_TRACE && T < +process.env.FLOW_TRACE && T > +(process.env.FLOW_FROM || 0)) { const C = an._cr || {}; console.error(T.toFixed(3), "w", (C.w ?? 0).toFixed(3), "aimW", an._aimW.toFixed(3), "q", an._quiverT.toFixed(2), "draw", draw.toFixed(2), "e", eR.toArray().map((v) => v.toFixed(3)).join(","), "h", hR.toArray().map((v) => v.toFixed(3)).join(","), "step", FL.prev ? Math.max(eR.distanceTo(FL.prev.e), hR.distanceTo(FL.prev.h)).toFixed(3) : "-", "estep", FL.prev ? eR.distanceTo(FL.prev.e).toFixed(3) : "-", "elbLim", (C.elbLim ?? 0).toFixed(3), "rigE", C.lastE ? C.lastE.toArray().map((v) => v.toFixed(3)).join(",") : "-"); }
  FL.prev = { e: eR, h: hR };
  if (loosed >= 1 && FL.looseT == null) FL.looseT = T;
  if (FL.looseT != null && T - FL.looseT <= 0.3 + 1e-6) {
    FL.lH = Math.max(FL.lH, an.behindHead(ha)); FL.lE = Math.max(FL.lE, an.behindHead(el));
    if (process.env.LOOSE_TRACE) console.error('loose', (T - FL.looseT).toFixed(3), 'hand', an.behindHead(ha).toFixed(4), 'rear', FL.h0 ? (FL.h0.z - ha.z).toFixed(4) : '-', 'y', ha.y.toFixed(3), 'held', (an._cr?.wristHeld ?? 0).toFixed(2), 'elbow', an.behindHead(el).toFixed(4), 'looseT', an._looseT.toFixed(2), 'q', an._quiverT.toFixed(2), 'hold', (an._cr?.hold ?? 0).toFixed(2), 'w', (an._cr?.w ?? 0).toFixed(2));
  }
  if (!loosed && draw >= 0.999) FL.fullE = Math.max(FL.fullE, an.behindHead(el));
  if (!loosed && draw >= 0.9) {
    const kn = new THREE.Vector3(); an._charOf(an.bones.index_01_r, kn);
    const kj = kn.distanceTo(R.M.jawChar(new THREE.Vector3()));
    if (kj > FL.kn90) { FL.kn90 = kj; FL.kn90At = `${T.toFixed(3)}s draw ${draw.toFixed(2)}`; }
  }
  if (!loosed) FL.h0 = ha.clone();
  if (FL.looseT != null && T - FL.looseT <= 0.26 + 1e-6 && FL.h0) FL.rear = Math.max(FL.rear, FL.h0.z - ha.z);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
