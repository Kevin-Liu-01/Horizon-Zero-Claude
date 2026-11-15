/**
 * M1.3d (hero-anim) — the lance's offline bench: Brea's real animator (`../aim-rig/load.mjs`) and the real
 * `Melee` state machine (`src/combat/melee.js`) in Node, no browser, graded on the M1.3d bars by
 * `measure.mjs` (the function the page rows send as source). It is not a gate: the gates run in the page.
 *
 *   node tools/gates/melee-body/bench.mjs [--only guard,heavy,heavyHold,undercut,lights] [--json out.json] [--trace heavy]
 *
 * Stand-ins (the page does these for real): the clock is a 60 Hz step and `performance.now()` follows it;
 * one step is one rendered frame (`renderer.info.render.frame`); no machine, so every swing resolves at its
 * contact fraction (the hit is the first strike step at or past `CONTACT_K`); the lance prop has no mesh (the
 * layer poses its group, which is what is measured); the ground is flat at 0. Order per step as `main.js`: the animator, then combat.
 */
import { loadBrea, makeRig, THREE } from '../aim-rig/load.mjs';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildMeleeMeasure } from './measure.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

let simMs = 1000;
const perf = globalThis.performance;
Object.defineProperty(perf, 'now', { value: () => simMs, configurable: true, writable: true });

export async function makeMeleeRig() {
  const log = console.log, table = console.table, warn = console.warn;
  console.log = () => {}; console.table = () => {}; console.warn = () => {};
  const A = await loadBrea();
  const R = await makeRig(A);
  const { Melee } = await import(path.join(ROOT, 'src/combat/melee.js'));
  const keys = new Set();
  const input = { keys, mouse: { buttons: 0 }, mouseDown(i) { return !!(this.mouse.buttons & (1 << i)); } };
  R.input = input;
  const ctx = R.ctx;
  Object.assign(ctx, {
    input, machines: { list: [], roles: {}, noise() {} }, interactables: { register() {} },
    renderer: { info: { render: { frame: 0 } } }, engine: { timeScale: 1, simTime: 0, requestTimeScale() {} },
    hitHulls: { raycast() { return null; } }, settings: {},
    terrain: { getHeight() { return 0; }, getNormal(x, z, out) { return (out || new THREE.Vector3()).set(0, 1, 0); } },
  });
  R.player.addRecoil = () => {};
  R.player.mantling = false;
  const melee = new Melee(ctx, R.combat);
  R.combat.melee = melee;
  R.combat.weaponDrawn = 'lance';
  R.melee = melee;
  console.log = log; console.table = table; console.warn = warn;
  R.t = 0;
  return R;
}

/** One 1/60 s rendered frame: the animator, then combat (main.js's order). */
export function step(R, dt = 1 / 60) {
  const { player: p, an, model, melee, ctx } = R;
  ctx.renderer.info.render.frame++;
  simMs += dt * 1000;
  R.t += dt; ctx.engine.simTime = R.t;
  p.position.addScaledVector(p.velocity, dt);
  model.position.copy(p.position); model.rotation.y = p.heading;
  model.updateMatrixWorld(true);
  an.update(dt, R.t);
  melee.update(dt, true);
  // the melee drive's velocity is the controller's to integrate; a bench with no controller lets it decay
  p.velocity.multiplyScalar(0.8);
}

function reset(R) {
  const { player: p, melee } = R;
  p.position.set(0, 0, 0); p.velocity.set(0, 0, 0); p.heading = 0; p.camYaw = Math.PI; p.camPitch = 0;
  p.aiming = false; p.crouching = false; p.moveSpeed = 0; p.dodging = false;
  melee.aimLock = 0;
  R.input.mouse.buttons = 0; R.input.keys.clear();
  for (let i = 0; i < 30; i++) step(R);
}

/** Draw the lance and stand in the guard for `sec`. */
function toGuard(R, sec = 0.8) {
  R.melee.drawLance(30);
  const n = Math.round(sec * 60);
  for (let i = 0; i < n; i++) step(R);
}

/** Step until the swing ends (and `after` s more), sampling; returns the contact time (first strike step at
 *  or past the hit fraction, or the undercut's resolve). */
function runSwing(R, M, maxSec = 2.5, after = 0.25) {
  const { melee } = R;
  let contactT = null, n = 0;
  const hit0 = melee._stats.hits + melee._stats.outOfReach + melee._stats.silent;
  let wasStruck = false, began = false;
  while (n++ < maxSec * 60) {
    step(R);
    M.sample(R.t);
    if (contactT == null && melee.phase === 'strike' && melee._struck && !wasStruck) contactT = R.t;
    wasStruck = melee._struck && melee.phase === 'strike';
    if (melee.stance === 'swing') began = true;
    if (began && !melee.active && melee.stance !== 'swing') break;
  }
  for (let i = 0; i < after * 60; i++) { step(R); M.sample(R.t); }
  return { contactT, hits: melee._stats.hits + melee._stats.outOfReach + melee._stats.silent - hit0 };
}

const CASES = {
  guard(R, M) {
    reset(R); toGuard(R, 0.6);
    M.begin();
    for (let i = 0; i < 60; i++) { step(R); M.sample(R.t); }
    return { guard: M.guard() };
  },
  heavy(R, M) {
    reset(R); toGuard(R);
    M.begin();
    R.melee.swing({ heavy: true });
    const r = runSwing(R, M);
    return { swing: M.swing('heavy', r.contactT), guard: M.guard() };
  },
  /** the input path: LMB held past the charge time (the light's cock turns into the heavy) */
  heavyHold(R, M) {
    reset(R); toGuard(R);
    M.begin();
    R.input.mouse.buttons |= 1;
    // hold past the charge time (0.28 s) and 0.4 s more: the held light turns into the heavy, then let go
    for (let n = 0; n < 42; n++) { step(R); M.sample(R.t); }
    R.input.mouse.buttons &= ~1;
    const r = runSwing(R, M);
    return { swing: M.swing('heavy', r.contactT) };
  },
  undercut(R, M) {
    reset(R); toGuard(R);
    M.begin();
    // the prompt's action, without a machine: what `undercut()` does once its target is legal
    const mel = R.melee;
    mel.swing({ undercut: true });
    const r = runSwing(R, M);
    const id = M.samples().some((s) => s.beat === 'undercut') ? 'undercut' : 'light-3';
    return { swing: M.swing(id, r.contactT) };
  },
  /** BIBLE §5.3: "a low two-handed thrust from a crouch": the lance in her hands, crouched */
  undercutCrouch(R, M) {
    reset(R); toGuard(R);
    R.player.crouching = true;
    for (let i = 0; i < 40; i++) step(R);
    M.begin();
    R.melee.swing({ undercut: true });
    const r = runSwing(R, M, 3.0);
    const out = { swing: M.swing('undercut', r.contactT), crouchW: +(R.an._crouchW || 0).toFixed(2) };
    R.player.crouching = false;
    for (let i = 0; i < 30; i++) step(R);
    return out;
  },
  /** ...and with the lance on her back (the bench has no stow kit: the crouched draw is not representative) */
  undercutCrouchHolstered(R, M) {
    reset(R);
    R.player.crouching = true;
    for (let i = 0; i < 40; i++) step(R);
    M.begin();
    R.melee.drawLance(2.4); R.melee.swing({ undercut: true });
    const r = runSwing(R, M, 3.0);
    const out = { swing: M.swing('undercut', r.contactT), crouchW: +(R.an._crouchW || 0).toFixed(2) };
    R.player.crouching = false;
    for (let i = 0; i < 30; i++) step(R);
    return out;
  },
  undercutHolstered(R, M) {
    reset(R);
    M.begin();
    const mel = R.melee;
    mel.drawLance(2.4); mel.swing({ undercut: true });
    const r = runSwing(R, M, 3.0);
    const id = M.samples().some((s) => s.beat === 'undercut') ? 'undercut' : 'light-3';
    return { swing: M.swing(id, r.contactT) };
  },
  lights(R, M) {
    reset(R); toGuard(R);
    const out = {};
    for (const i of [0, 1, 2]) {
      M.begin();
      R.melee.combo = i; R.melee._comboT = 1;
      R.melee.swing({ heavy: false });
      const r = runSwing(R, M);
      out[`light-${i + 1}`] = M.swing(`light-${i + 1}`, r.contactT);
    }
    return out;
  },
};

function fmtSwing(s) {
  if (!s) return 'no swing sampled';
  const P = s.palms, f = (x) => (x == null ? '  -  ' : x.toFixed(3));
  const pw = (w) => `${w} socket R ${f(P[w].rightSocket)} L ${f(P[w].leftSocket)} | shaft R ${f(P[w].right)} L ${f(P[w].left)} (meta ${f(P[w].rightMeta)}/${f(P[w].leftMeta)}, on ${P[w].leftOnMin.toFixed(2)}, n ${P[w].n})`;
  return `${s.beat}: lead ${f(s.leadHalf)} s (peak ${f(s.leadPeak)}, upper-arm ${f(s.leadHalfUpperArm)}); hip ${f(s.hip.from)}->${f(s.hip.to)} half@${f(s.hip.tHalf)}; sh ${f(s.sh.from)}->${f(s.sh.to)} half@${f(s.sh.tHalf)}; contact@${f(s.contactT)}\n   ${pw('windup')}\n   ${pw('contact')}\n   ${pw('follow')}\n   contact tipY ${f(s.contact.tipY)} level ${s.contact.levelDeg.toFixed(1)} deg thrust ${s.contact.thrustDeg == null ? '-' : s.contact.thrustDeg.toFixed(1)} deg pelvisY ${f(s.contact.pel[1])}`;
}

async function main() {
  const R = await makeMeleeRig();
  const M = buildMeleeMeasure({ an: R.an, model: R.model, melee: R.melee, marks: () => R.melee.lance }, THREE);
  const only = flag('--only') ? flag('--only').split(',') : Object.keys(CASES);
  const out = {};
  for (const id of only) {
    out[id] = CASES[id](R, M);
    const o = out[id];
    console.log(`\n== ${id}`);
    for (const [k, v] of Object.entries(o)) {
      if (k === 'crouchW') console.log(`crouch weight ${v}`);
      else if (k === 'guard') console.log(`guard: socket R ${v?.rightSocket.toFixed(3)} L ${v?.leftSocket.toFixed(3)} | shaft R ${v?.right.toFixed(3)} L ${v?.left.toFixed(3)} on ${v?.leftOnMin.toFixed(2)} tipY ${v?.tipY.toFixed(3)} tipZ ${v?.tipZ.toFixed(3)} bladeAhead ${v?.bladeAhead.toFixed(3)} dirY ${v?.dir[1].toFixed(3)} sR ${v?.sR.toFixed(3)} sL ${v?.sL.toFixed(3)}`);
      else console.log(fmtSwing(v));
    }
    if (flag('--trace') === id) {
      for (const s of M.samples()) console.log(s.T.toFixed(3), (s.stance || '').padEnd(7), (s.phase || '').padEnd(7), (s.beat || '').padEnd(8), s.k.toFixed(2), 'hip', s.hip.toFixed(3), 'sh', s.sh.toFixed(3), 'ua', s.ua.toFixed(3), 'dR', s.dR.toFixed(3), 'dL', s.dL.toFixed(3), 'kL', s.kL.toFixed(3), 'sL', s.sL.toFixed(3), 'lhW', s.lhW.toFixed(2), 'tip', s.tip.map((x) => x.toFixed(2)).join(','), 'pelY', s.pel[1].toFixed(3));
    }
  }
  if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(out, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
