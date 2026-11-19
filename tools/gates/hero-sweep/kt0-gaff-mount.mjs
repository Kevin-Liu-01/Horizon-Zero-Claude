/**
 * Milestone 2 area D, KT0 (the geometry check, row 0): with the Boat Gaff stowed at the left rear hip, do the bow's
 * and the lance's left-hand takes, her arms and her legs keep clear of it? Node, Brea dressed (`bench.mjs makeBench`,
 * the real animator, the game's HeroRig with the stow kit and the real `Melee`), stepped at 60 Hz of sim time.
 *
 *   node tools/gates/hero-sweep/kt0-gaff-mount.mjs [--mount <id>] [--search] [--json out.json]
 *
 * The stowed gaff is a capsule (its haft) rigid on `pelvis`, from its grip end to its hook end, given in the pelvis's
 * frame as character-space points at her idle (her +x is her left, +z her forward, y up from the soles). Every
 * step of each scenario records the least clear distance (surface to surface) from that capsule to:
 *   handL, handR       the palm and the fingers (a 0.045 m capsule from the wrist to 0.12 m past it)
 *   forearmL/R         elbow to wrist (r 0.040)
 *   thighL/R, calfL/R  thigh to calf, calf to foot (r 0.075, 0.055)
 *   hips               her hips and buttocks at her idle (an elliptic cylinder, HIPS)
 *   lance, bow         the stowed or moving lance (its butt to its tip, r 0.022) and bow (both tips, r 0.025)
 * Scenarios: idle, walk, jog, sprint, crouch walk, the bow's unstow and stow (ask), the lance's draw and stow (ask),
 * swap 1 to 2 at a jog, and the lance draw from a crouch: the bow-and-lance scenarios of KT0's baseline.
 *
 * `--search` grades every mount in MOUNTS and prints the best (the largest least clearance over all scenarios and
 * bodies); the mount the armory recipe builds is `MOUNTS[CHOSEN]`.
 */
import path from 'path';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { makeBench, step, reset, SPEEDS } from './bench.mjs';
import { THREE } from './load.mjs';

const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

/** the gaff's haft radius as stowed (m) and its hook's reach off the haft (m, a sphere at the hook end) */
export const GAFF_R = 0.016, HOOK_R = 0.05;
/** Her hips and buttocks at her idle, character space (m): an elliptic cylinder (the outfit's belts and sash over them). */
export const HIPS = { a: 0.185, b: 0.135, z: -0.015, y0: 0.72, y1: 1.12 };
/**
 * Candidate mounts: [grip end, hook end] in character space at the bind (m). The gaff hangs from the slung belt's
 * frog at the left hip, the grip end up and forward of the frog where the right hand crosses to it, the hook end
 * down and back.
 */
export const MOUNTS = {
  // the sword's carry: the grip forward of the hip at the slung belt, the haft back and down past the hip's side
  swordLow: [[0.175, 0.95, 0.15], [0.245, 0.50, -0.36]],
  swordFlat: [[0.17, 0.92, 0.18], [0.25, 0.62, -0.42]],
  // steeper: the haft down the side of the thigh, the hook behind the knee's height
  sideSteep: [[0.215, 0.98, 0.10], [0.245, 0.30, -0.12]],
  sideMid: [[0.205, 0.96, 0.13], [0.26, 0.40, -0.22]],
  // hooked over the slung belt at the rear of the hip, the haft down the back of the thigh
  rearHang: [[0.20, 0.30, -0.18], [0.19, 0.95, -0.15]],
  outerMid: [[0.225, 0.93, 0.12], [0.285, 0.42, -0.24]],
  outerLow: [[0.235, 0.86, 0.14], [0.29, 0.38, -0.20]],
  // behind the hip, low on the slung belt, the haft down and out behind the left thigh
  hipBackLow: [[0.17, 0.82, -0.12], [0.30, 0.40, -0.28]],
  // the chosen one (M2 wave 2): beside the sacrum on the slung belt's left half, hanging behind the left buttock and calf
  rearLeft: [[0.06, 0.82, -0.15], [0.07, 0.24, -0.15]],
  // ...but no hand reaches rearLeft's grip from her idle (the right shoulder 0.70 m off it, the left 0.64; reach 0.47): the
  // mounts the right hand reaches (grip within 0.47 m of its shoulder), searched (--reach), and the one taken: the back of
  // the belt just right of her spine, the haft down behind her right buttock and thigh
  rearRight: [[-0.04, 1.04, -0.20], [-0.15, 0.46, -0.17]],
};
export const CHOSEN = 'rearRight';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** closest distance between segments p0-p1 and q0-q1 */
export function segSeg(p0, p1, q0, q1) {
  const u = sub(p1, p0), v = sub(q1, q0), w = sub(p0, q0);
  const a = dot(u, u), b = dot(u, v), c = dot(v, v), d = dot(u, w), e = dot(v, w), D = a * c - b * b;
  let s = 0, t = 0;
  if (D > 1e-12) s = Math.max(0, Math.min(1, (b * e - c * d) / D));
  t = c > 1e-12 ? (b * s + e) / c : 0;
  if (t < 0) { t = 0; s = a > 1e-12 ? Math.max(0, Math.min(1, -d / a)) : 0; } else if (t > 1) { t = 1; s = a > 1e-12 ? Math.max(0, Math.min(1, (b - d) / a)) : 0; }
  const P = [p0[0] + u[0] * s, p0[1] + u[1] * s, p0[2] + u[2] * s], Q = [q0[0] + v[0] * t, q0[1] + v[1] * t, q0[2] + v[2] * t];
  return Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]);
}

const fwd = (R, speed) => { const p = R.player; p.velocity.set(Math.sin(p.heading) * speed, 0, Math.cos(p.heading) * speed); p.moveSpeed = speed; };
const halt = (R) => { R.player.velocity.set(0, 0, 0); R.player.moveSpeed = 0; };
/** the scenarios: each calls S() on every graded step */
export const SCEN = {
  idle: (R, S) => { for (let i = 0; i < 120; i++) { step(R); S(); } },
  walk: (R, S) => { for (let i = 0; i < 150; i++) { fwd(R, SPEEDS.walk); step(R); if (i > 30) S(); } halt(R); },
  jog: (R, S) => { for (let i = 0; i < 180; i++) { fwd(R, SPEEDS.jog); step(R); if (i > 30) S(); } halt(R); },
  sprint: (R, S) => { R.player.sprinting = true; for (let i = 0; i < 180; i++) { fwd(R, SPEEDS.sprint); step(R); if (i > 30) S(); } R.player.sprinting = false; halt(R); },
  crouch: (R, S) => { R.player.crouching = true; for (let i = 0; i < 40; i++) step(R); for (let i = 0; i < 120; i++) { fwd(R, SPEEDS.crouch); step(R); S(); } halt(R); R.player.crouching = false; for (let i = 0; i < 30; i++) step(R); },
  bowUnstow: (R, S) => { R.combat.weaponDrawn = 'bow'; for (let i = 0; i < 60; i++) { step(R); S(); } },
  bowStow: (R, S) => { R.combat.weaponDrawn = 'bow'; for (let i = 0; i < 60; i++) step(R); R.combat.weaponDrawn = false; for (let i = 0; i < 60; i++) { step(R); S(); } },
  lanceDraw: (R, S) => { R.melee.drawLance(); for (let i = 0; i < 60; i++) { step(R); S(); } },
  lanceStow: (R, S) => { R.melee.drawLance(); for (let i = 0; i < 60; i++) step(R); R.melee.holsterLance(); for (let i = 0; i < 60; i++) { step(R); S(); } },
  lanceDrawCrouch: (R, S) => { R.player.crouching = true; for (let i = 0; i < 40; i++) step(R); R.melee.drawLance(); for (let i = 0; i < 60; i++) { step(R); S(); } R.melee.holsterLance(); for (let i = 0; i < 60; i++) { step(R); S(); } R.player.crouching = false; },
  swap12Jog: (R, S) => { R.combat.weaponDrawn = 'bow'; for (let i = 0; i < 60; i++) { fwd(R, SPEEDS.jog); step(R); } R.combat.weaponDrawn = false; R.melee.drawLance(); for (let i = 0; i < 70; i++) { fwd(R, SPEEDS.jog); step(R); S(); } halt(R); },
};

/** run every scenario once, recording the bones the gaff is graded against, per step, in the pelvis's frame */
export async function recordBodies({ built = null } = {}) {
  const R = await makeBench({ melee: true });
  const bones = {};
  R.model.traverse((o) => { if (o.isBone && !bones[o.name]) bones[o.name] = o; });
  const need = ['pelvis', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r', 'middle_01_l', 'middle_01_r'];
  for (const n of need) if (!bones[n]) throw new Error(`kt0: no bone ${n}`);
  // the pelvis's bind frame in character space: from the first idle step (reset first)
  reset(R);
  const inv = new THREE.Matrix4(), mP = new THREE.Matrix4(), v = new THREE.Vector3();
  const charOf = (b) => { b.getWorldPosition(v); R.model.worldToLocal(v); return [v.x, v.y, v.z]; };
  // the lance and the bow as drawn: the stow kit's capsules are read off the hero rig each step
  const lanceSeg = () => {
    const m = R.melee?.lance?.group;
    if (R.melee?.lanceInHand && m?.visible) { const a = new THREE.Vector3(0, 0, 0).applyMatrix4(m.matrixWorld), b = new THREE.Vector3(0, 0, R.melee.lance.length || 1.55).applyMatrix4(m.matrixWorld); R.model.worldToLocal(a); R.model.worldToLocal(b); return [[a.x, a.y, a.z], [b.x, b.y, b.z]]; }
    return null;
  };
  const out = {};
  // `built`: the built kit-oro.glb bound to her (src/hero/parts.js bindPart, as the game binds it); the stowed gaff's two
  // end vertices (the farthest apart of its piece) are recorded each step, so the BUILT gaff is graded, not the mount
  let gv = null;
  if (built) {
    const { readFileSync } = await import('fs');
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
    const { HeroOroKit } = await import('../../../src/hero/orokit.js');
    await MeshoptDecoder.ready;
    const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
    const b = readFileSync(built);
    const gl = await new Promise((res, rej) => L.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), '', res, rej));
    // the game's own binding and hanger (src/hero/orokit.js), on the bench's Brea; solved where HeroRig.update runs it
    const oro = new HeroOroKit({ model: R.model, ctx: R.ctx, get animator() { return R.an; } });
    oro.entry = { root: gl.scene };
    oro.attach();
    oro.owned.gaff = true; oro._apply();
    const hu = R.hero.update.bind(R.hero);
    R.hero.update = (dt) => { hu(dt); oro.solve(dt); };
    R.oro = oro;
    const m = oro.meshes[0];
    R.model.updateMatrixWorld(true); m.skeleton.update();
    const P = m.geometry.getAttribute('_piece'), n = m.geometry.getAttribute('position').count;
    const ids = []; for (let i = 0; i < n; i++) if ((Math.round(P.getX(i)) & 1)) ids.push(i);
    const w = new THREE.Vector3(), mi = new THREE.Matrix4().copy(R.model.matrixWorld).invert();
    const at = (i) => { mi.copy(R.model.matrixWorld).invert(); m.getVertexPosition(i, w); m.localToWorld(w); w.applyMatrix4(mi); return w.toArray(); };
    const pts = ids.map(at);
    let a = 0, far = -1; for (let k = 0; k < pts.length; k++) { const d = Math.hypot(...sub(pts[k], pts[0])); if (d > far) { far = d; a = k; } }
    let c = 0; far = -1; for (let k = 0; k < pts.length; k++) { const d = Math.hypot(...sub(pts[k], pts[a])); if (d > far) { far = d; c = k; } }
    gv = { m, at, top: pts[a][1] > pts[c][1] ? ids[a] : ids[c], low: pts[a][1] > pts[c][1] ? ids[c] : ids[a], len: far };
    out.__built = { len: +far.toFixed(4), top: at(gv.top).map((x) => +x.toFixed(4)), low: at(gv.low).map((x) => +x.toFixed(4)) };
  }
  // the frame the mounts are authored in: the pelvis at her idle (after the reset's 90 steps), character space
  const modelInv0 = new THREE.Matrix4().copy(R.model.matrixWorld).invert();
  const pelIdle = new THREE.Matrix4().copy(modelInv0).multiply(bones.pelvis.matrixWorld);
  const thighIdle = new THREE.Matrix4().copy(modelInv0).multiply(bones.thigh_l.matrixWorld);
  const modelInv = new THREE.Matrix4();
  for (const [name, run] of Object.entries(SCEN)) {
    if (name.startsWith('__')) continue;
    reset(R);
    const L = [];
    run(R, () => {
      // (the animator moved the bones after the step's matrix update: bring every world matrix up to this step's pose)
      R.model.updateMatrixWorld(true);
      modelInv.copy(R.model.matrixWorld).invert();
      mP.copy(modelInv).multiply(bones.pelvis.matrixWorld);       // pelvis now, char space
      // (char point at the bind) -> (pelvis local, by the bind) -> (char now): T = mP * pelvisBoneBindLocal
      const r = { t: R.t, pelM: mP.toArray(), thighM: new THREE.Matrix4().copy(modelInv).multiply(bones.thigh_l.matrixWorld).toArray() };
      for (const n of need) r[n] = charOf(bones[n]);
      const ls = lanceSeg(); if (ls) r.lanceHeld = ls;
      if (gv) { gv.m.skeleton.update(); r.gaffBuilt = [gv.at(gv.top), gv.at(gv.low)]; r.gaffShove = R.oro?._g?.shove ?? 0; }
      // the stowed lance (the kit's carry solve, char space) while its piece is drawn: the bob is its low end
      const kit = R.hero?.kit;
      if (kit?.carry && !(kit.hidden & 1)) { const bu = kit.carry.butt, tp = kit.carry.tip; r.lanceKit = [[bu.x, bu.y, bu.z], [tp.x, tp.y, tp.z]];
        const d = [tp.x - bu.x, tp.y - bu.y, tp.z - bu.z], l = Math.hypot(...d) || 1; r.bob = [[bu.x, bu.y, bu.z], [bu.x + d[0] / l * 0.11, bu.y + d[1] / l * 0.11, bu.z + d[2] / l * 0.11]]; }
      L.push(r);
    });
    out[name] = L;
  }
  // a mount point rides the pelvis: p_now = pelvisNow * inv(pelvisIdle) * p_idle
  return { log: out, bindBone: pelIdle.toArray(), thighIdle: thighIdle.toArray() };
}

const RADII = { handL: 0.045, handR: 0.045, forearmL: 0.040, forearmR: 0.040, thighL: 0.075, calfL: 0.055, thighR: 0.075, calfR: 0.055, lanceHeld: 0.022, lanceKit: 0.016, bob: 0.045 };
/** grade one mount over the recorded steps: least clearance per body over every scenario */
export function gradeMount(mount, rec, { joint = 'pelvis', built = false } = {}) {
  const B = new THREE.Matrix4().fromArray(joint === 'thigh_l' ? rec.thighIdle : rec.bindBone), Binv = B.clone().invert();
  const g0 = new THREE.Vector3(...(mount?.[0] ?? [0, 0, 0])).applyMatrix4(Binv), g1 = new THREE.Vector3(...(mount?.[1] ?? [0, 0, 0])).applyMatrix4(Binv);
  const M = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3();
  const res = {};
  const worst = {};
  for (const [scen, L] of Object.entries(rec.log)) {
    if (scen.startsWith('__')) continue;
    const s = {};
    for (const r of L) {
      M.fromArray(joint === 'thigh_l' ? r.thighM : r.pelM);
      a.copy(g0).applyMatrix4(M); b.copy(g1).applyMatrix4(M);
      const G0 = built ? r.gaffBuilt[0] : [a.x, a.y, a.z], G1 = built ? r.gaffBuilt[1] : [b.x, b.y, b.z];
      const ext = (w, m) => { const d = sub(m, w), l = Math.hypot(...d) || 1; return [m[0] + d[0] / l * 0.04, m[1] + d[1] / l * 0.04, m[2] + d[2] / l * 0.04]; };
      const segs = {
        handL: [r.hand_l, ext(r.hand_l, r.middle_01_l)], handR: [r.hand_r, ext(r.hand_r, r.middle_01_r)],
        forearmL: [r.lowerarm_l, r.hand_l], forearmR: [r.lowerarm_r, r.hand_r],
        thighL: [r.thigh_l, r.calf_l], calfL: [r.calf_l, r.foot_l], thighR: [r.thigh_r, r.calf_r], calfR: [r.calf_r, r.foot_r],
      };
      if (r.lanceHeld) segs.lanceHeld = r.lanceHeld;
      if (r.lanceKit) { segs.lanceKit = r.lanceKit; segs.bob = r.bob; }
      for (const [k, [p, q]] of Object.entries(segs)) {
        const d = segSeg(p, q, G0, G1) - RADII[k] - GAFF_R;
        if (!(k in s) || d < s[k].d) s[k] = { d: +d.toFixed(4), t: +r.t.toFixed(3) };
        if (!(k in worst) || d < worst[k].d) worst[k] = { d: +d.toFixed(4), scen, t: +r.t.toFixed(3) };
      }
    }
    res[scen] = s;
  }
  // her hips and buttocks, which the capsules above do not hold: an elliptic cylinder in the pelvis's idle frame
  // (half-width HIPS.a, half-depth HIPS.b about z HIPS.z, from y HIPS.y0 to HIPS.y1), sampled along the haft at her idle
  if (mount) {
    let hip = 9;
    for (let i = 0; i <= 20; i++) {
      const f = i / 20, p = [mount[0][0] + (mount[1][0] - mount[0][0]) * f, mount[0][1] + (mount[1][1] - mount[0][1]) * f, mount[0][2] + (mount[1][2] - mount[0][2]) * f];
      if (p[1] < HIPS.y0 || p[1] > HIPS.y1) continue;
      const e = Math.hypot(p[0] / HIPS.a, (p[2] - HIPS.z) / HIPS.b);
      // (radial gap, approximately: the ellipse's radius along the point's bearing)
      const rr = Math.hypot(p[0], p[2] - HIPS.z), re = rr / (e || 1);
      hip = Math.min(hip, rr - re - GAFF_R);
    }
    worst.hips = { d: +hip.toFixed(4), scen: 'idle', t: 0 };
  }
  const least = Math.min(...Object.values(worst).map((w) => w.d));
  return { mount, least: +least.toFixed(4), worst, perScenario: res };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const quiet = console.log; console.log = () => {};
  const rec = await recordBodies({ built: flag('--built') });
  console.log = quiet;
  if (flag('--built')) {
    const g = gradeMount(null, rec, { built: true });
    console.log('built', JSON.stringify(rec.log.__built));
    console.log(`built      least ${g.least.toFixed(3)} m  ` + Object.entries(g.worst).map(([k, w]) => `${k} ${w.d.toFixed(3)} (${w.scen} ${w.t})`).join('  '));
    if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify({ row: 'KT0', commit: flag('--commit', '?'), built: rec.log.__built, grade: g }, null, 1));
    process.exit(0);
  }
  if (args.includes('--free')) {
    const best = freeSearch(rec, { n: Number(flag('--n', 4000)), len: Number(flag('--len', 0.62)) });
    for (const b of best) console.log(b.least.toFixed(3), JSON.stringify(b.mount), Object.entries(b.worst).map(([k, w]) => `${k} ${w.d.toFixed(3)} ${w.scen}`).join(' '));
    process.exit(0);
  }
  const ids = args.includes('--search') ? Object.keys(MOUNTS) : [flag('--mount', CHOSEN)];
  const out = { row: 'KT0', commit: flag('--commit', '?'), gaffR: GAFF_R, mounts: {} };
  for (const id of ids) {
    const g = gradeMount(MOUNTS[id], rec);
    out.mounts[id] = g;
    console.log(`${id.padEnd(10)} least ${g.least.toFixed(3)} m  ` + Object.entries(g.worst).map(([k, w]) => `${k} ${w.d.toFixed(3)} (${w.scen} ${w.t})`).join('  '));
  }
  if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(out, null, 1));
  process.exit(0);
}

/**
 * `--free`: a seeded search for the stowed haft with the most clearance: the grip end anywhere in a box round the
 * left hip, the haft `len` m long hanging down (y component <= -0.3). Prints the best ten (the recipe takes the
 * chosen mount from MOUNTS; this is how it was found).
 */
export function freeSearch(rec, { n = 4000, len = 0.62, seed = 7 } = {}) {
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const best = [];
  for (let i = 0; i < n; i++) {
    const p0 = [0.08 + 0.28 * rnd(), 0.78 + 0.30 * rnd(), -0.28 + 0.52 * rnd()];
    let d = [rnd() * 2 - 1, -0.3 - 0.7 * rnd(), rnd() * 2 - 1];
    const l = Math.hypot(...d); d = d.map((x) => x / l);
    const p1 = [p0[0] + d[0] * len, p0[1] + d[1] * len, p0[2] + d[2] * len];
    if (p1[1] < 0.22) continue;
    const g = gradeMount([p0, p1], rec);
    best.push({ least: g.least, mount: [p0.map((x) => +x.toFixed(3)), p1.map((x) => +x.toFixed(3))], worst: g.worst });
    best.sort((a, b) => b.least - a.least); if (best.length > 10) best.pop();
  }
  return best;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && args.includes('--free')) {
  // (the main block above exits first unless --free is given: see the guard there)
}
