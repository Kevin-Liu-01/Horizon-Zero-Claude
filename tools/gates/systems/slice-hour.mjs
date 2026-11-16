#!/usr/bin/env node
/**
 * A-slice-hour, FIRST SKELETON (BUILD M1b exit 1; M1.6a): an input-driven run of "Raker's Morning" from the real
 * title (press a key, NEW GAME, the first Tolerance) that reports how far it gets, beat by beat. One Chrome
 * session (the machine-wide slot1, PROCESS 6), which also films the systems' frames (`--frames`, staged by the
 * Frame Set's own tools/frames/page.mjs) and runs the live save rows, so a turn needs one launch.
 *
 *   node tools/gates/systems/slice-hour.mjs --port 5278 [--frames F30,F20] [--budget 840] [--label systems]
 *
 * WHAT DRIVES THE RUN. Keys and mouse buttons only, as a player presses them: W and Shift to move, Space to hop a
 * lip, E to talk, rake, cut and sit, V for the Alidade, R to make arrows, 1 for the bow, RMB to aim, LMB to draw and
 * loose, Shift to Steady, digits for dialogue stations. The LOOK is the one stand-in: the runner writes
 * `player.camYaw` / `camPitch` (what the mouse writes), because a headless page has no pointer lock; an aimed shot
 * steers that look onto the target by reading the camera's own direction back each frame (aimPoint). It never writes
 * a position, never calls the spine, never skips a beat: a beat it cannot play is where the report stops ("no script
 * jumps"). A death is played as a player plays it: the death card, RETURN TO THE LAST BRAZIER, and on (death-rule row).
 *
 * Live rows in the same session (the node --test rows are tools/gates/systems/*.test.mjs):
 *   brazier-dialog   at the cistern on New Game: the dialog's words are four of the bible's six, with a forecast
 *   brazier-refusal  STAGED on the frames page: a real Plumb spawned by the machines system, its AI state set to
 *                    suspicious (wary) and alert (hostile) at 25 m, suspicious at 80 m, patrol at 300 m; the dialog the Brazier
 *                    opens, read off the page after a real E hold, and the rules' mode (src/game/brazier)
 *   death-rule       if Brea dies in the run: the stage before, the stage after RETURN TO THE LAST BRAZIER, and where she
 *                    stands against the Brazier of her last rest
 *   save-reload      right after New Game: quit (the document unloaded), the game opened again in the same tab,
 *                    CONTINUE on the title: the same stage, satchel, place and hour as the record; the run plays on
 *   save-continue    the same after the run, on the run's newest record. A diagnosis is polled while the title is
 *                    awaited (see reloadContinue: a new tab got no animation frames and the title sat in 'idle')
 *   death-staged     with --death-at <stage>: the death is staged there (her own takeDamage), then played as above;
 *                    the death-rule row records the stand-up at the Brazier (full health, the stage kept, the satchel
 *                    and Gourd of the newest record, within 3 m of the Brazier of her last rest)
 *   site-clock       after the run (M1.6n): the dyke Plumb (the quest's own) killed if it still stands, its wreck aged
 *                    out, 13 hours put on the site clock (STAGED), the clock swept: the dyke Plumb must not return; a
 *                    control Plumb spawned 150 m behind the camera and cleared the same way must
 *
 * Output: a run dir under ~/.calima-r5/review/runs/ (never the repo): report.json, the frames, step shots.
 */
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFrameSet } from '../../frames/frameset.mjs';
import { stageFrame, unstageFrame } from '../../frames/page.mjs';
import { RUNS, assertOutsideRepo } from '../../frames/paths.mjs';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../../chrome-profile.mjs';
import { takeMachineSlot, releaseMachineSlot } from '../../chrome-slot.mjs';
import { runKit } from './kit-probe-page.mjs';
import { installPad, padKeys, padState, uiChoose, stickFace, stickRelease } from '../../reach/pad-driver.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = guardPort(flag('--port'));
const FRAMES = (flag('--frames', 'F30,F20') || '').split(',').map((s) => s.trim()).filter(Boolean);
const BUDGET_S = Number(flag('--budget', 840));
const RESERVE_S = Number(flag('--reserve', 150));   // kept back from the budget for the save-continue row and the close
const LABEL = flag('--label', 'systems-slice-hour');
const KIT = !args.includes('--no-kit');   // M1.6j: the kit's verb rows on the frames page (kit-probe-page.mjs)
const NO_RUN = args.includes('--no-run');  // the frames and rows only
const RUN_ONLY = args.includes('--run-only');  // the run and its save rows only (no frames page)
// --pad (M1.6m, engine lane): the run is driven by a synthetic pad in the page (tools/reach/pad-driver.mjs): every key
// and mouse button the run presses is the pad's control for it, and the menus are walked with the D-pad and A
const PAD = args.includes('--pad');
// --probe <served path> (round 2): a page module whose probe(frame) runs after each frame's shot (as film.mjs --probe),
// so the reed rows (tools/gates/systems/reed-probe-page.mjs on F31 and F03) share this one Chrome session
const PROBE = flag('--probe');
// fix round: --wear <armour id> [--wear-at <frame id>]: she puts it on (as film.mjs --wear) before that frame (the first
// if no --wear-at), so the frames before it film her as the run starts her; --no-refusal skips the staged brazier-refusal
// row; --kit-only <ids> runs only those kit rows (a fix round re-runs only the failed rows)
const WEAR = flag('--wear');
const WEAR_AT = flag('--wear-at');
const NO_REFUSAL = args.includes('--no-refusal');
const KIT_ONLY = flag('--kit-only') ? new Set(flag('--kit-only').split(',').map((x) => x.trim())) : null;
// M1b round 3: --death-at <stage>: when the run reaches that stage, Brea is killed (STAGED: her own takeDamage, the
// real death path after it) and the run plays the death as a player does (the card, RETURN TO THE LAST BRAZIER) and on
// to the end: the death-rule row on demand, mid-slice. --no-site-clock skips the site-clock row after the run
const DEATH_AT = flag('--death-at');
// fix round 1: --death-after: the death is staged AFTER the run has reached the reward and its site-clock row (so the
// run itself stays a clean input-driven run), by the dyke Plumb's kind as the cause (FIX LIST 5: the card and the HUD
// read 'STAGED' when the cause was the harness's string); --kit-repeat N runs the kit page N times
const DEATH_AFTER = args.includes('--death-after');
const KIT_REPEAT = Math.max(1, Number(flag('--kit-repeat', 1)) | 0);
const SITE_CLOCK = !args.includes('--no-site-clock');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[slice-hour ${new Date().toISOString().slice(11, 19)}]`, ...a);
const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return '?'; } };
const commit = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no').length > 0;
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const runDir = path.join(RUNS, `${stamp}-${commit}-${LABEL}`);
assertOutsideRepo(runDir, REPO);
const portOpen = (p) => new Promise((r) => { const s = net.connect(p, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });

const report = { row: 'A-slice-hour (skeleton)', commit, dirty, tree: REPO, port: PORT, startedAt: new Date().toISOString(), frames: [], beats: [], rows: {}, console: [], stoppedAt: null, why: null };
let vite = null, browser = null, profile = null;
let T0 = Date.now();   // reset when the Chrome slot is taken: the budget is Chrome's time, not the wait for the slot
const spent = () => (Date.now() - T0) / 1000;

async function shot(page, name) {
  try {
    const buf = await page.screenshot({ type: 'png' });
    await sharp(buf).resize(1600, 900, { fit: 'fill' }).jpeg({ quality: 82 }).toFile(path.join(runDir, `${name}.jpg`));
    return `${name}.jpg`;
  } catch (e) { return null; }
}

/* ------------------------------------------------------------- in-page */

const probe = () => {
  const C = window.__CTX__, g = C?.systemsGame, s = C?.spine, p = C?.player;
  const cur = s?.current?.();
  const a = cur?.anchor ? g?.A?.[cur.anchor] : null;
  const busy = !!g?.present?.busy;
  return {
    state: C?.state, stage: cur?.id ?? (s?.done ? 'reward' : null), type: cur?.type ?? null, npc: cur?.npc ?? null,
    anchor: a ? { x: a.x, z: a.z } : null, up: cur?.up ?? 0, radius: cur?.radius ?? 3,
    p: p ? { x: p.position.x, y: p.position.y, z: p.position.z, g: C.terrain?.getHeight?.(p.position.x, p.position.z) ?? 0 } : null,
    busy, stations: busy ? document.querySelectorAll('#cal-sys .sys-st').length : 0,
    bz: busy ? [...document.querySelectorAll('#cal-sys .sys-row')].map((r) => r.firstChild?.textContent ?? '') : [],
    bzForecast: busy ? [...document.querySelectorAll('#cal-sys .sys-row small')].map((r) => r.textContent) : [],
    note: document.querySelector('.cal-track-obj')?.textContent ?? null,
    sighting: !!C?.sighting?.on, report: s?.report?.(), salt: C?.inventory?.count?.('metal-shards') ?? null,
    hp: p ? Math.round(p.health) : null, gourd: p ? Math.round(p.gourd ?? 0) : null, ammo: C?.combat?.ammo?.hunter ?? null, barbed: C?.combat?.ammo?.hardpoint ?? null,
    ammoId: C?.combat?.activeWeapon?.activeAmmo ?? null, py: p ? p.position.y : null,
    deathCard: !!document.querySelector('.mn-death.show'),
  };
};

/* in-page: the live Instruments of a kind, nearest first, with the world point a shot should take */
const targetsOf = (kind, part) => {
  const C = window.__CTX__, p = C.player.position;
  const V = C.camera.position.constructor, v = new V();
  const out = [];
  for (const m of (C.machines?.list || [])) {
    if (!m || m.alive === false || m._disposed || m.kind !== kind || !m.position) continue;
    let o = null;
    if (part === 'lamp') o = m._lampWp?.obj ?? m.weakPoints?.find((w) => w.name === 'lamp')?.obj;
    else if (part === 'vial') o = m._vialWp?.obj ?? m.weakPoints?.find((w) => w.name === 'vial')?.obj;
    else if (part === 'bob') o = m._bob?.attached !== false ? m._bob?.mesh : null;
    if (o) o.getWorldPosition(v); else v.set(m.position.x, m.position.y + 0.9, m.position.z);
    // the arrow falls (combat/arrows.js: g 9.8, the Reed arrow 62 m/s at full draw): hold over by that fall. Without
    // it, 30 shots at 29 m with the look within 0.35 deg of the lamp all passed under it (f90d2b0)
    const dh = Math.hypot(v.x - p.x, v.z - p.z), tf = dh / 62;
    out.push({ i: C.machines.list.indexOf(m), x: v.x, y: v.y + 0.5 * 9.8 * tf * tf, z: v.z, d: Math.hypot(m.position.x - p.x, m.position.z - p.z),
      state: m.state, hp: Math.round(m.health ?? 0), down: (m._toppleT ?? -1) > 0, part: !!o });
  }
  return out.sort((a, b) => a.d - b.d);
};

/** in-page: steer the look (camYaw / camPitch, what the mouse writes) until the camera's own ray is on (x, y, z). */
async function aimPoint(x, y, z, tolDeg = 0.35) {
  const C = window.__CTX__, p = C.player, cam = C.camera;
  const V = cam.position.constructor;
  const dir = new V(), pos = new V();
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const read = () => {
    cam.getWorldPosition(pos); cam.getWorldDirection(dir);
    const tx = x - pos.x, ty = y - pos.y, tz = z - pos.z, L = Math.hypot(tx, ty, tz) || 1;
    const yT = Math.atan2(-tx, -tz), yC = Math.atan2(-dir.x, -dir.z);
    const pT = Math.asin(ty / L), pC = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    return { dy: wrap(yT - yC), dp: pT - pC, err: Math.hypot(wrap(yT - yC) * Math.cos(pT), pT - pC) * 180 / Math.PI, L };
  };
  let r = read();
  for (let i = 0; i < 12 && r.err > tolDeg; i++) {
    p.camYaw += r.dy;
    p.camPitch -= r.dp;   // camPitch grows downward (player.js: -0.8 is the look-up)
    await raf(); await raf();
    const r2 = read();
    if (Math.abs(r2.dp) > Math.abs(r.dp) * 1.5 && Math.abs(r.dp) > 0.01) { p.camPitch += 2 * r.dp; await raf(); await raf(); }
    r = read();
  }
  return { err: +r.err.toFixed(2), dist: +r.L.toFixed(1) };
}

/**
 * in-page: steer the look until the arrow THE GAME WOULD LOOSE NOW meets the part. The game looses from the bow's nock
 * toward the reticle's WORLD point (combat._updateAimPoint: the camera ray's first hull or ground hit) and flies it in
 * arrows._stepFly; what a player corrects by watching their arrows, the runner reads ahead.
 *
 * M1b: ON THE GAME'S OWN BALLISTIC SOLUTION. At 6fa199d the runner flew its own copy of the flight at a fixed 1/60 s
 * against a vial standing still: 6 of 6 shots "predicted" 0.026-0.031 m off the glass and 0 hit, and the Plumb's health
 * never moved (no hull was struck at all). Two things were wrong with the copy: the Plumb walks its survey route at
 * 1.1 m/s (0.55 m in a 0.5 s flight at 30 m), and the game steps an arrow on the frame's sub-step (1/60 s at 60 fps,
 * 1/90 at 45: 0.18 m of drop at 53 m between the two). Now the flight is the game's: `combat.arrows.predict` (the same
 * step, the same hull sweep, the same ground march; checked against fired arrows to the millimetre), on the sub-step
 * the engine is taking (engine.simTime / engine.steps over 8 frames), swept in the frame of the Plumb as it walks
 * (its root's velocity over those frames). The goal moves by the miss until the flight passes within 1 cm of the
 * aim point; if something else is met first, the next point along the glass's axis is tried. Only the look moves
 * (camYaw / camPitch, through window.__aimPoint); the shot is still loosed by the LMB.
 */
async function solveShot(mi, part, tolDeg) {
  const C = window.__CTX__, cb = C.combat, m = C.machines.list[mi], E = C.engine;
  if (!m || m.alive === false) return null;
  const V = C.camera.position.constructor;
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  // the target's motion and the engine's sub-step, measured (8 frames): the ROOT's walk. (M1b round 3 tried the part's own
  // node at 4c5384a and e30af7b's parent: an attacking Plumb's vial reads 3.7 m/s as it turns, a rotation the linear ride
  // cannot carry, and the hull sweep in that riding frame then read its head across every line: 13 stands 'masked')
  const p0 = m.position.clone(), s0 = E.simTime, dts = [];
  let sPrev = s0;
  for (let i = 0; i < 8; i++) { await raf(); const st = E.steps || 0; if (st > 0 && E.simTime > sPrev) dts.push((E.simTime - sPrev) / st); sPrev = E.simTime; }
  const span = E.simTime - s0;
  const ride = span > 0.02 ? { x: (m.position.x - p0.x) / span, y: 0, z: (m.position.z - p0.z) / span } : { x: 0, y: 0, z: 0 };
  dts.sort((a, b) => a - b);
  const dt = dts.length ? dts[dts.length >> 1] : 1 / 60;
  const lat = 2 * (span > 0 ? span / 8 : 1 / 60);
  const want = part === 'vial' ? 'weak:vial' : part === 'bob' ? 'bob' : part === 'lamp' ? 'weak:lamp' : null;
  const aims = [];
  if (part === 'vial' && m._vialWp?.obj) {
    const w = m._vialWp, c = w.obj.getWorldPosition(new V());
    if (w.axis && w.half > 0) for (const u of [0, 0.45, -0.45, 0.8, -0.8]) aims.push(w.axis.clone().multiplyScalar(w.half * u).applyMatrix4(w.obj.matrixWorld));
    else aims.push(c);
  } else if (part === 'bob' && m._bob?.mesh && m._bob.attached !== false) {
    // M1b: the bob's own middle (its mesh's origin is the top it hangs from, inside the tail: de71979's Barbed arrow
    // met rig_tail2), then points up its upper side (a toppled Plumb's bob lies on the ground: bab1f0c's kit Barbed
    // arrows met the ground first)
    const c = new V(); let n = 0;
    m._bob.mesh.traverse((o) => { if (o.isMesh && o.geometry) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); c.add(o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld)); n++; } });
    if (n) c.multiplyScalar(1 / n); else m._bob.mesh.getWorldPosition(c);
    // M1b fix round: points ON the bob a flight from her nock reaches first (bab1f0c's kit row: the Barbed arrow at the
    // bob's middle, and 7 cm up it, met the ground, then nothing): its vertices drawn 35 % in toward the middle, each
    // flown on the game's gravity from the nock (the ground march and the hulls' exact sweep, as scanStands does),
    // the clear ones nearest the middle first; the middle and its upper side after them
    const HH = C.hitHulls, T = C.terrain, nk = new V();
    try { cb.bow.getNockWorld(1, nk); } catch { nk.copy(C.player.position); nk.y += 1.45; }
    const cand = [];
    m._bob.mesh.updateMatrixWorld(true);
    m._bob.mesh.traverse((o) => {
      const pa = o.isMesh && o.geometry?.attributes?.position;
      if (!pa) return;
      const step = Math.max(1, Math.floor(pa.count / 48));
      for (let i = 0; i < pa.count; i += step) {
        const q = new V().fromBufferAttribute(pa, i);
        if (o.isSkinnedMesh && o.applyBoneTransform) o.applyBoneTransform(i, q);
        q.applyMatrix4(o.matrixWorld);
        cand.push(q.lerp(c, 0.35));
      }
    });
    const ray = { origin: new V(), direction: new V() }, a = new V(), b = new V(), g = cb.arrows?.gravity ?? 9.8;
    const clearTo = (aim) => {
      const L = nk.distanceTo(aim), tf = L / 56, NS = 12;
      a.copy(nk);
      for (let i = 1; i <= NS; i++) {
        const u = i / NS, t = u * tf;
        b.lerpVectors(nk, aim, u); b.y += 0.5 * g * t * (tf - t);
        if (i < NS && b.y < T.getHeight(b.x, b.z)) return false;
        ray.origin.copy(a); ray.direction.subVectors(b, a);
        const sl = ray.direction.length(); ray.direction.multiplyScalar(1 / sl);
        const h = HH?.raycast?.(ray, { far: sl + (i === NS ? 0.08 : 0), exact: true });
        if (h && h.hit) return h.machine === m && /bob/i.test(h.name || h.part?.name || '');
        a.copy(b);
      }
      return false;
    };
    const ok = cand.filter((q) => clearTo(q)).sort((p, q) => p.distanceTo(c) - q.distanceTo(c));
    for (const q of ok.slice(0, 3)) aims.push(q);
    for (const up of [0, 0.07]) aims.push(c.clone().setY(c.y + up));
  } else {
    const o = part === 'lamp' ? (m._lampWp?.obj ?? m.weakPoints?.find((w) => w.name === 'lamp')?.obj) : part === 'bob' ? (m._bob?.attached !== false ? m._bob?.mesh : null) : null;
    aims.push(o ? o.getWorldPosition(new V()) : new V(m.position.x, m.position.y + 0.9, m.position.z));
  }
  const sp = new V(), dir = new V();
  // the aims were read now; each solve iteration takes two frames, so the aim is carried along by the ride
  const t0 = E.simTime;
  const predict = (aim) => {
    cb._updateAimPoint();
    cb.bow.getNockWorld(cb.drawStrength, sp);
    const def = cb.ammoDefs[cb.activeWeapon?.activeAmmo ?? 'hunter'] ?? cb.ammoDefs.hunter;
    const speed = cb._computeShot(def, cb.drawStrength, sp, dir);
    // + the release: the LMB the runner lets go after this solve reaches the game a frame or two later
    const k = E.simTime - t0 + lat, at = { x: aim.x + ride.x * k, y: aim.y + ride.y * k, z: aim.z + ride.z * k };
    const r = cb.arrows.predict(sp, dir, speed, { dt, maxT: 1.6, ride, aim: at });
    return { miss: new V(r.dx, r.dy, r.dz), d: r.d, first: r.hit ? (r.machine === m ? r.hit : r.hit === 'ground' ? 'ground' : `other:${r.machine?.kind ?? '?'}`) : null, t: r.tAim, at };
  };
  let out = null;
  for (let ai = 0; ai < aims.length; ai++) {
    const aim = aims[ai];
    // the first look: the aim point where it will be when the arrow arrives (lead), the drop held over
    const tf0 = sp.copy(aim).distanceTo(C.camera.position) / 62;
    const goal = new V(aim.x + ride.x * tf0, aim.y + ride.y * tf0 + 0.5 * 9.8 * tf0 * tf0, aim.z + ride.z * tf0);
    let r = null, err = null;
    for (let it = 0; it < 8; it++) {
      err = (await window.__aimPoint(goal.x, goal.y, goal.z, tolDeg)).err;
      await raf();
      r = predict(aim);
      if (r.d < 0.01) break;
      goal.sub(r.miss);
    }
    const met = want && r.first && (want === 'bob' ? /bob/i.test(r.first) : r.first === want);
    out = { aimIdx: ai, err, missM: +r.d.toFixed(3), first: r.first, ds: +cb.drawStrength.toFixed(2), dt: +dt.toFixed(4),
      ride: +Math.hypot(ride.x, ride.y, ride.z).toFixed(2), tf: r.t != null ? +r.t.toFixed(3) : null, steady: cb.steady?.phase ?? null, sway: +(cb.sway?.deg ?? 0).toFixed(3) };
    if (!want || met) return { ...out, clear: true };
  }
  return { ...out, clear: false };
}

/**
 * in-page (closing round): where can a player stand to see the Plumb's level vial? At c455362 the topple stepped round
 * the Plumb 20 deg at a time on a 28 m circle from wherever the ditch left her, on the dyke's lee side below its crest,
 * and the vial was masked from all 7 stands. This scans the ground round the Plumb (every 15 deg at 12-30 m) as a
 * player would look for an opening: from each open nav cell (ctx.nav: slope, water, colliders) it flies the arrow the
 * game would loose at full draw (a parabola from the nock's height to the glass, the game's own gravity) and asks what
 * it meets first, segment by segment: the terrain (the arrow's own ground test) and the Instruments' hulls
 * (hitHulls.raycast, exact, the arrow sweep). A stand counts the glass points (centre and +-45 % along the tube) the
 * flight reaches first. Ranked by that count, then by the walk from where she is. Read-only: it moves nothing.
 */
function scanStands(mi, avoid = [], dists = [12, 15, 18, 22, 26, 30], pts = null) {
  const C = window.__CTX__, m = C.machines.list[mi], wp = m?._vialWp;
  if (!m || m.alive === false || !wp?.obj) return null;
  const V = C.camera.position.constructor, N = C.nav, T = C.terrain, HH = C.hitHulls, P = C.player.position, cb = C.combat;
  let nockH = 1.45;
  try { const nk = new V(); cb.bow.getNockWorld(1, nk); const h = nk.y - P.y; if (h > 0.8 && h < 2.2) nockH = h; } catch { /* the default */ }
  const g = cb?.arrows?.gravity ?? 9.8;
  const aims = [];
  if (wp.axis && wp.half > 0) for (const u of [0, 0.45, -0.45]) aims.push(wp.axis.clone().multiplyScalar(wp.half * u).applyMatrix4(wp.obj.matrixWorld));
  else aims.push(wp.obj.getWorldPosition(new V()));
  const c = aims[0];
  const ray = { origin: new V(), direction: new V() }, a = new V(), b = new V(), o = new V();
  const out = [], why = {};
  // M1b: `pts` (the lee ditch's own stands) are tested instead of the ring round the Plumb
  const cand = [];
  if (pts) for (const q of pts) cand.push({ gx: q.x, gz: q.z, deg: Math.round(Math.atan2(q.x - c.x, q.z - c.z) * 180 / Math.PI), d: +Math.hypot(q.x - c.x, q.z - c.z).toFixed(1), tag: q.tag });
  else for (let deg = 0; deg < 360; deg += 15) for (const d of dists) { const ang = deg * Math.PI / 180; cand.push({ gx: c.x + Math.sin(ang) * d, gz: c.z + Math.cos(ang) * d, deg, d }); }
  for (const { gx, gz, deg, d, tag } of cand) {
    {
      if (avoid.some((q) => Math.hypot(q.x - gx, q.z - gz) < 4)) { why.tried = (why.tried || 0) + 1; continue; }
      if (N?.blockedAt?.(gx, gz)) { why.blocked = (why.blocked || 0) + 1; continue; }
      const gy = T.getHeight(gx, gz);
      o.set(gx, gy + nockH, gz);
      let clear = 0, first = null;
      for (const aim of aims) {
        const L = o.distanceTo(aim), tf = L / 62, NS = 12;
        let hit = null;
        a.copy(o);
        for (let i = 1; i <= NS && !hit; i++) {
          const u = i / NS, t = u * tf;
          b.lerpVectors(o, aim, u); b.y += 0.5 * g * t * (tf - t);
          if (i < NS && b.y < T.getHeight(b.x, b.z)) { hit = 'ground'; break; }
          ray.origin.copy(a); ray.direction.subVectors(b, a);
          const sl = ray.direction.length();
          ray.direction.multiplyScalar(1 / sl);
          const h = HH?.raycast?.(ray, { far: sl + (i === NS ? 0.25 : 0), exact: true });
          if (h && h.hit) hit = h.machine === m ? (h.name || h.part?.name || 'hull') : `other:${h.machine?.kind ?? '?'}`;
          a.copy(b);
        }
        if (hit === 'weak:vial') clear++;
        else if (!first) first = hit || 'nothing';
      }
      if (!clear) { why[first] = (why[first] || 0) + 1; continue; }
      out.push({ x: +gx.toFixed(2), z: +gz.toFixed(2), deg, d, clear, of: aims.length, walk: +Math.hypot(gx - P.x, gz - P.z).toFixed(1), dy: +(c.y - gy).toFixed(2), ...(tag != null ? { tag } : {}) });
    }
  }
  out.sort((p, q) => (q.clear - p.clear) || (p.walk - q.walk));
  return { stands: out.slice(0, 6), open: out.length, of: cand.length, masked: why, vial: { x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2) }, nockH: +nockH.toFixed(2) };
}

/** in-page (M1b): wait up to `ms` for the machine to stand (its root under 0.12 m/s over 10 frames); what it read. */
async function waitStill(mi, ms) {
  const C = window.__CTX__, m = C.machines.list[mi], E = C.engine;
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const t0 = performance.now();
  let v = null;
  while (m && m.alive !== false) {
    const p = m.position.clone(), s = E.simTime;
    for (let i = 0; i < 10; i++) await raf();
    const span = E.simTime - s;
    v = span > 0.02 ? Math.hypot(m.position.x - p.x, m.position.z - p.z) / span : 0;
    // M1b round 3: and not while it staggers from the last hit (4c5384a: a shot loosed into the stagger after the first vial
    // hit, read as a hit on the vial, met nothing)
    if ((v < 0.12 && m.state !== 'stagger') || performance.now() - t0 > ms) break;
  }
  return { waitedS: +((performance.now() - t0) / 1000).toFixed(1), speed: v == null ? null : +v.toFixed(2), state: m?.state ?? null };
}

function face(x, z) {
  const p = window.__CTX__.player;
  p.camYaw = Math.atan2(-(x - p.position.x), -(z - p.position.z));
}

async function aimAt(id) {
  const t = window.__CTX__.systemsGame.targets[id];
  if (!t) return { ok: false };
  const r = await window.__aimPoint(t.x, t.y, t.z, 0.3);
  return { ok: r.err <= t.tol, angle: r.err, tol: t.tol };
}

/* -------------------------------------------------------------- driver */

const keys = (page) => (PAD ? padKeys(page) : {
  down: (k) => page.keyboard.down(k), up: (k) => page.keyboard.up(k),
  tap: async (k, ms = 120) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); },
  mouse: (button, isDown) => (isDown ? page.mouse.down({ button }) : page.mouse.up({ button })),
});

// M1.6m round 2 (engine lane, the smallest change): with --pad, every 'talk' walk is steered by the RIGHT STICK
// (stickFace sets axis 2 each step, as a player holds it); every other walk still sets the look directly
async function walkTo(page, K, target, radius, { up = 0, maxS = 150, sprint = true, stick = false } = {}) {
  const t0 = Date.now();
  let best = Infinity, bestAt = Date.now(), hop = 0;
  await K.down('KeyW'); if (sprint) await K.down('ShiftLeft');
  try {
    for (;;) {
      const s = await page.evaluate(probe);
      if (s.state === 'dead' || s.state === 'death-menu' || s.deathCard) return { ok: false, why: 'died' };
      if (s.busy) return { ok: true, interrupted: true };
      if (s.state !== 'playing') return { ok: false, why: `the game left play (state ${s.state})` };
      const dx = s.p.x - target.x, dz = s.p.z - target.z, d = Math.hypot(dx, dz);
      if (d <= radius && (!up || s.p.y - s.p.g >= 0 || true)) {
        if (!up) return { ok: true, d };
        const h = s.p.y - (await page.evaluate((x, z) => window.__CTX__.terrain.getHeight(x, z), target.x, target.z));
        if (h >= up) return { ok: true, d, h };
      }
      if (d < best - 0.5) { best = d; bestAt = Date.now(); }
      if (Date.now() - bestAt > 4000) { await K.tap('Space', 90); hop++; bestAt = Date.now(); if (hop > 12) return { ok: false, why: `stuck ${d.toFixed(1)} m short`, d }; }
      if ((Date.now() - t0) / 1000 > maxS) return { ok: false, why: `timed out ${d.toFixed(1)} m short`, d };
      if (stick) await stickFace(page, target.x, target.z); else await page.evaluate(face, target.x, target.z);
      await sleep(120);
    }
  } finally { if (stick) await stickRelease(page); if (sprint) await K.up('ShiftLeft'); await K.up('KeyW'); }
}

/**
 * M1.6j: a long leg is walked along the game's own nav grid (ctx.nav.path, 2 m cells: slope, water, colliders), as a
 * player picks a way round a wall: one waypoint at a time, the look turned to each (5f4bf42: straight from T1 to the
 * station she ran into the Organ Shelf's blocks and stuck 101 m short). Straight when the grid has no path.
 */
async function walkPath(page, K, target, radius, opts = {}) {
  const pts = await page.evaluate((tx, tz) => {
    const C = window.__CTX__, N = C.nav, P = C.player.position;
    if (!N?.path) return null;
    const V = P.constructor;
    const path = N.path(new V(P.x, 0, P.z), new V(tx, 0, tz));
    if (!path || !path.length) return null;
    // thin to a waypoint every ~8 m (and every turn of more than 25 deg)
    const out = [];
    let last = { x: P.x, z: P.z }, lastDir = null;
    for (let i = 0; i < path.length; i++) {
      const q = path[i], dx = q.x - last.x, dz = q.z - last.z, d = Math.hypot(dx, dz);
      const dir = Math.atan2(dx, dz);
      const turn = lastDir == null ? 0 : Math.abs(Math.atan2(Math.sin(dir - lastDir), Math.cos(dir - lastDir)));
      if (d >= 8 || (turn > 0.44 && d > 2.5) || i === path.length - 1) { out.push({ x: q.x, z: q.z }); last = q; lastDir = dir; }
    }
    return out;
  }, target.x, target.z);
  if (!pts) return { ...(await walkTo(page, K, target, radius, opts)), nav: false };
  let legs = 0;
  for (const w of pts.slice(0, -1)) {
    const r = await walkTo(page, K, w, 2.2, { ...opts, maxS: 40 });
    legs++;
    if (!r.ok || r.interrupted) return { ...r, nav: true, legs, of: pts.length };
  }
  const r = await walkTo(page, K, target, radius, opts);
  return { ...r, nav: true, legs: legs + 1, of: pts.length };
}

/**
 * The stalk along the lee ditch (round 2): W held toward the target while the ditch's rush leans (its bed's drawn lean
 * above its lull value: the cue the canes give a player), let go while it stands. Crouched (the caller's C). The look
 * is turned to the target each step, as walkTo does.
 */
async function stalkTo(page, K, target, radius, maxS = 200) {
  const t0 = Date.now();
  let held = false, waits = 0, waitS = 0, tw = 0, best = Infinity, bestAt = Date.now(), hop = 0, leanSince = 0;
  const leaning = () => page.evaluate(() => {
    const C = window.__CTX__, R = C.reeds;
    const bed = R?.mask?.bedAt?.(C.player.position.x, C.player.position.z)?.id ?? 12;
    return (R?.draw?.uLean?.value?.[bed] ?? 1) > 0.235;
  });
  try {
    for (;;) {
      const s = await page.evaluate(probe);
      if (s.state === 'dead' || s.state === 'death-menu' || s.deathCard) return { ok: false, why: 'died' };
      if (s.busy) return { ok: true, interrupted: true, waits, waitS: +waitS.toFixed(1) };
      if (s.stage !== 'ditch') return { ok: true, waits, waitS: +waitS.toFixed(1) };
      const d = Math.hypot(s.p.x - target.x, s.p.z - target.z);
      if (d <= radius) return { ok: true, d, waits, waitS: +waitS.toFixed(1) };
      if ((Date.now() - t0) / 1000 > maxS) return { ok: false, why: `stalk timed out ${d.toFixed(1)} m short`, d, waits };
      // the canes lean 0.8 s before the gust reaches 4 m/s: she waits a beat more (1.0 s of lean) before she moves, and
      // stops the moment they stand (0.8 s before the lull)
      const lean = await leaning();
      if (lean && !leanSince) leanSince = Date.now();
      if (!lean) leanSince = 0;
      const go = lean && Date.now() - leanSince >= 1000;
      if (go && !held) { await K.down('KeyW'); held = true; if (tw) { waitS += (Date.now() - tw) / 1000; tw = 0; } }
      if (!go && held) { await K.up('KeyW'); held = false; waits++; tw = Date.now(); bestAt = Date.now(); }
      if (held) {
        if (d < best - 0.5) { best = d; bestAt = Date.now(); }
        if (Date.now() - bestAt > 4000) { await K.tap('Space', 90); hop++; bestAt = Date.now(); if (hop > 12) return { ok: false, why: `stuck ${d.toFixed(1)} m short`, d }; }
      }
      await page.evaluate(face, target.x, target.z);
      await sleep(100);
    }
  } finally { if (held) await K.up('KeyW'); }
}

async function playScene(page, K, maxN = 40) {
  for (let i = 0; i < maxN; i++) {
    const s = await page.evaluate(probe);
    if (!s.busy) return true;
    if (s.stations > 0) await K.tap(`Digit${s.stations}`);   // the exit station is listed last
    else await K.tap('Space');
    await sleep(260);
  }
  return false;
}

async function holdE(page, K, ms = 650) { await K.down('KeyE'); await sleep(ms); await K.up('KeyE'); await sleep(220); }

/**
 * M1b fix round: DRINK, as a player does (hold Q: the gourd into health, 16 hp/s, player.js). At 6fa199d she came off
 * the Peg line on 14 hp with 60 in the gourd and walked into the ditch's fight on it (topple: died); at 9cae8d6 she
 * died at the line with the gourd full. Held until `to` hp, the gourd empty, or `maxMs`.
 */
const drinks = [];
async function drink(page, K, to = 90, maxMs = 6000) {
  let s = await page.evaluate(probe);
  if (s.hp == null || s.hp >= to || (s.gourd ?? 0) < 1) return null;
  const r = { stage: s.stage, hp0: s.hp, gourd0: s.gourd };
  const t0 = Date.now();
  await K.down('KeyQ');
  try {
    while (Date.now() - t0 < maxMs) {
      await sleep(200);
      s = await page.evaluate(probe);
      if (s.state === 'dead' || s.deathCard || s.hp >= to || (s.gourd ?? 0) < 1) break;
    }
  } finally { await K.up('KeyQ'); }
  Object.assign(r, { hp1: s.hp, gourd1: s.gourd, ms: Date.now() - t0 });
  drinks.push(r);
  return r;
}

let lampsFight = null;
/**
 * M1b round 3: the farthest stand the topple shoots the Plumb's vial from (m). Fix round 1 (FIX LIST 1): 17, was 24.
 * Across the lane's 9 slice runs at 4c5384a..f35bc3c, vial arrows loosed from 20 m or more struck it 1 time in 45 (every
 * one predicted on it); from under 20 m 12 of 19. The kit's vial-range row measures why; until it passes, the runner
 * stands where the shots land. VIAL_BACK_D is where it backs out to when the Plumb closes inside 9 m.
 */
const VIAL_MAX_D = 17;
const VIAL_RING = [13, 15, 17];
const VIAL_BACK_D = 15;
const shots = [];

/** Bow in hand (slot 1) and Reed arrows on the string; make arrows (hold R) when fewer than 4. */
async function readyBow(page, K) {
  let a = (await page.evaluate(probe)).ammo;
  for (let i = 0; i < 3 && a != null && a < 4; i++) { await K.down('KeyR'); await sleep(1700); await K.up('KeyR'); await sleep(300); a = (await page.evaluate(probe)).ammo; }
  await K.tap('Digit1');
  await sleep(250);
  return a;
}

/**
 * Shoot `part` on the nearest live `kind` until the stage moves on (`stageDone()` names the stage that must close),
 * or, with `all`, until none of that kind is left within 70 m. Brea stands off at `stand` m: she walks in to it,
 * and backs out when one closes inside 9 m. Every shot: RMB held, the look steered onto the part, Shift (Steady),
 * LMB drawn for 1.0 s with the look kept on the part, then loosed.
 */
async function fight(page, K, kind, part, stageDone, { stand = 22, maxS = 100, all = false, ammo = 'hunter', backOut = true, drawMs = 1000, tolDeg = 0.35, reach = 70, near = null, nearR = 0, untilDown = false, whileDown = false, breakOffHp = 0 } = {}) {
  const t0 = Date.now();
  const stage0 = (await page.evaluate(probe)).stage;
  let fired = 0, aimed = false, blocked = 0, stand0 = null, ditchScans = null;
  const tried = [];
  const scans = [];
  await page.mouse.move(800, 450);
  if (ammo === 'hunter') await readyBow(page, K); else { await K.tap('Digit1'); await sleep(150); }
  // the arrow as a player picks it: X (and Z) cycle the bow's ammo (M1.6j: Barbed is the ranged Pry)
  for (let i = 0; i < 4 && (await page.evaluate(probe)).ammoId !== ammo; i++) { await K.tap('KeyX'); await sleep(150); }
  // puppeteer throws on releasing a button it does not hold: every release is guarded
  const up = async (button) => { try { await K.mouse(button, false); } catch { /* not held */ } };
  const release = async () => { if (aimed) { await K.up('ShiftLeft'); await up('left'); await up('right'); aimed = false; } };
  try {
    for (;;) {
      const s = await page.evaluate(probe);
      if (s.state === 'dead' || s.state === 'death-menu' || s.deathCard) return { ok: false, why: 'died', fired };
      if (stageDone && s.stage !== stage0) return { ok: true, fired, ...(scans.length ? { scans } : {}), ...(ditchScans ? { ditchScans } : {}) };
      if ((Date.now() - t0) / 1000 > maxS) return { ok: !!all, why: `${kind} ${part}: not done in ${maxS} s (${fired} arrows)`, fired, ...(scans.length ? { scans } : {}) };
      if (s.busy) { await release(); await playScene(page, K); continue; }
      // the whole line (all): every live one within 220 m is walked to; one target: the nearest within 70 m
      // `near` (M1b): only those within nearR of that point (the swarm that stands where she crosses)
      const T = (await page.evaluate(targetsOf, kind, part)).filter((t) => t.d < (all ? 220 : reach) && (!near || Math.hypot(t.x - near.x, t.z - near.z) <= nearR));
      if (!T.length) return { ok: !!all, why: all ? null : `no live ${kind} within ${reach} m`, fired };
      const t = T[0];
      // M1b fix round: the pry beat's two halves (the vial until it is down; the bob while it is down)
      // fix round 1 (FIX LIST 8): the topple's still, the moment the run sees the Plumb down (F25's state), before she lowers the bow
      if (untilDown && t.down) { const toppleShot = await shot(page, 'b-13-topple'); await release(); return { ok: true, fired, down: true, toppleShot, ...(scans.length ? { scans } : {}) }; }
      if (whileDown && !t.down) { await release(); return { ok: false, why: `${kind} stood up`, fired, stoodUp: true }; }
      // M1b fix round: drink between shots (never in the 4 s a Plumb is down: they are the Pry's), and on the Peg line
      // break off and cross when the gourd is dry and the staff low (the lamps are the stage's optional count)
      if (!whileDown && s.hp != null && s.hp < 55 && (s.gourd ?? 0) >= 1) { await release(); await drink(page, K, 92); continue; }
      if (breakOffHp && s.hp != null && s.hp < breakOffHp && (s.gourd ?? 0) < 1) { await release(); return { ok: true, fired, brokeOff: s.hp, ...(scans.length ? { scans } : {}) }; }
      // the vial (closing round): she goes to a stand the scan finds open (scanStands), not round a fixed circle
      if (part === 'vial' && !stand0) {
        await release();
        // M1b: the lee ditch's own stands first (the rush line the stalk came down, every 3 m past the stage's stand
        // toward the station): where a player who came down the ditch would stand to shoot. The ring round the Plumb
        // (12-30 m, every 15 deg) only when none of them sees the glass
        const ditchPts = await page.evaluate(() => {
          const A = window.__CTX__.systemsGame.A, H = A.ditchHead, D = A.ditch;
          if (!H || !D) return null;
          const L = Math.hypot(D.x - H.x, D.z - H.z) || 1, ux = (D.x - H.x) / L, uz = (D.z - H.z) / L, out = [];
          for (let s = -6; s <= L + 24; s += 3) out.push({ x: H.x + ux * s, z: H.z + uz * s, tag: +(s - L).toFixed(0) });
          return out;
        });
        let sc = null;
        if (ditchPts) {
          const dsc = await page.evaluate(scanStands, t.i, tried, undefined, ditchPts.filter((q) => { const d = Math.hypot(q.x - t.x, q.z - t.z); return d >= 10 && d <= VIAL_MAX_D; }));
          if (dsc) { (ditchScans ||= []).push({ of: dsc.of, open: dsc.open, masked: dsc.masked, stands: dsc.stands.slice(0, 3) }); if (dsc.stands[0] && dsc.stands[0].clear >= 2) sc = dsc; }
        }
        if (!sc) sc = await page.evaluate(scanStands, t.i, tried, VIAL_RING);
        scans.push(sc && { open: sc.open, masked: sc.masked, vial: sc.vial, nockH: sc.nockH, best: sc.stands[0] ?? null, from: { x: +s.p.x.toFixed(1), z: +s.p.z.toFixed(1) } });
        const best = sc?.stands?.[0];
        if (!best) return { ok: false, why: `${kind} ${part}: no open stand found round it (${JSON.stringify(sc?.masked ?? {})})`, fired, scans };
        stand0 = best;
        tried.push({ x: best.x, z: best.z });
        const w = best.walk > 30 ? await walkPath(page, K, best, 1.5, { maxS: 60, sprint: true }) : await walkTo(page, K, best, 1.5, { maxS: 30, sprint: best.walk > 8 });
        if (w.why === 'died') return { ok: false, why: 'died', fired, scans };
        continue;
      }
      // M1b round 3: the vial is shot from VIAL_MAX_D at most. At a8c0b83 fifteen vial shots from 33-57 m (flights of
      // 0.6-0.93 s, the solve itself 3-8 cm off a glass 4.5 cm in radius) were loosed and met nothing at all; every shot
      // from 11-22 m in the same build's runs struck the vial. When the Plumb's walk has taken it past that, scan again
      if (part === 'vial' && stand0 && t.d > VIAL_MAX_D + 3) { await release(); stand0 = null; continue; }
      if (part !== 'vial' && t.d > stand + 6) {
        await release();
        const k = (t.d - stand) / t.d;
        await walkTo(page, K, { x: s.p.x + (t.x - s.p.x) * k, z: s.p.z + (t.z - s.p.z) * k }, 3, { maxS: 25 });
        continue;
      }
      if (backOut && t.d < 9 && kind !== 'peg') {
        if (part === 'vial') {
          // it closed on her (M1b round 3): from inside 9 m its head masks the vial (4c5384a: seven stands at 9-13 m, each
          // masked by rig_head when she got there). Back out to 18 m, then scan again from there
          await release();
          const k = VIAL_BACK_D / Math.max(1, t.d);
          await walkTo(page, K, { x: t.x + (s.p.x - t.x) * k, z: t.z + (s.p.z - t.z) * k }, 3, { maxS: 12 });
          stand0 = null; continue;
        }
        await release();
        const k = stand / Math.max(1, t.d);
        await walkTo(page, K, { x: t.x + (s.p.x - t.x) * k, z: t.z + (s.p.z - t.z) * k }, 3, { maxS: 12 });
        continue;
      }
      const have = ammo === 'hardpoint' ? s.barbed : s.ammo;
      if ((have ?? 0) < 1) { await release(); if (ammo !== 'hunter') return { ok: false, why: `no ${ammo} arrows left`, fired }; await readyBow(page, K); if ((await page.evaluate(probe)).ammo < 1) return { ok: false, why: 'no arrows to make', fired }; continue; }
      if (!aimed) { await K.mouse('right', true); await sleep(380); aimed = true; }
      // M1b: a player looses on the Plumb while it stands for a reading (8-15 s at each survey station), not while it
      // walks: the runner holds the aim (no draw, no Steady spent) up to 9 s for it to stop; the solve leads it if not
      const still = part === 'vial' ? await page.evaluate(waitStill, t.i, 9000) : null;
      const hp0 = await page.evaluate((i) => { const m = window.__CTX__.machines.list[i]; return m ? { vial: m._vialHits ?? null, hp: Math.round(m.health) } : null; }, t.i);
      // M1.6j Steady: a fresh breath for every shot (Shift let go and pressed again while aiming: 4 s of no sway)
      await K.up('ShiftLeft'); await sleep(50); await K.down('ShiftLeft'); await sleep(60);
      let a = await page.evaluate(aimPoint, t.x, t.y, t.z, tolDeg);
      await K.mouse('left', true);
      const tD = Date.now();
      // the draw: the look solved onto the part for the arrow the game would loose now (solveShot), re-solved until the
      // draw is full and the time is up (the nock moves with the draw)
      let sol = null;
      // M1b fix round: a lamp shot is held (drawn, the look re-solved) up to 1.5 s more while the flight the game would
      // loose meets something else first (6fa199d: 9 of 27 Peg shots were loosed on a flight the runner itself read as
      // 'ground' or the Peg's pelvis; 6 Pegs took 27 arrows)
      while (Date.now() - tD < drawMs || (sol && sol.ds < 0.99 && Date.now() - tD < drawMs + 800) || (part === 'lamp' && sol && !sol.clear && Date.now() - tD < drawMs + 1500)) {
        sol = await page.evaluate(solveShot, t.i, part, tolDeg);
        if (!sol) break;
      }
      if (sol && !sol.clear && part !== 'bob' && part !== 'lamp') {
        // every point along the part is masked from here by something else: step round it (20 deg) and draw again
        await up('left'); await release();
        blocked++;
        const s2 = await page.evaluate(probe);
        shots.push({ kind, part, blocked: true, d: +t.d.toFixed(1), at: { x: +s2.p.x.toFixed(1), z: +s2.p.z.toFixed(1) }, predicted: { first: sol.first, missM: sol.missM, aimIdx: sol.aimIdx, ds: sol.ds }, aimErr: sol.err });
        if (blocked > (part === 'vial' ? 12 : 6)) return { ok: false, why: `${kind} ${part}: masked from every stand tried (${blocked})`, fired, scans, ditchScans };
        if (part === 'vial') {
          // the next open stand the scan finds; masked at close range (its head before the vial), back out to 18 m first
          if (t.d < 13) { const k = VIAL_BACK_D / Math.max(1, t.d); await walkTo(page, K, { x: t.x + (s2.p.x - t.x) * k, z: t.z + (s2.p.z - t.z) * k }, 3, { maxS: 12 }); }
          stand0 = null; continue;
        }
        const ang = Math.atan2(s2.p.x - t.x, s2.p.z - t.z) + (blocked % 2 ? 0.35 : -0.7);
        await walkTo(page, K, { x: t.x + Math.sin(ang) * stand, z: t.z + Math.cos(ang) * stand }, 2.5, { maxS: 15, sprint: false });
        continue;
      }
      // the release follows the last solve at once (the steady phase and sway are read in the solve itself)
      const sw = { st: sol?.steady ?? null, sway: sol?.sway ?? null };
      // M1b round 3: was an arrow loosed, and what did it meet (at 9f8bc85 sixteen vial shots read as hits left the
      // Plumb's health at 190: not one arrow met it anywhere)
      const loose = await page.evaluate(() => { const C = window.__CTX__;
        if (!window.__shotHook) { window.__shotHook = true; window.__shotEv = [];
          C.events.on('arrow-fired', () => window.__shotEv.push({ n: 'fired' }));
          C.events.on('arrow-hit', (e) => window.__shotEv.push({ n: 'hit', kind: e?.machine?.kind ?? null, weak: !!e?.weak, dmg: Math.round(e?.damage ?? 0), pt: e?.point ? [+e.point.x.toFixed(2), +e.point.y.toFixed(2), +e.point.z.toFixed(2)] : null })); }
        window.__shotEv.length = 0;
        return { ready: C.player?.animator?.looseReady?.() ?? null, ds: +(C.combat?.drawStrength ?? 0).toFixed(2), ammo: C.combat?.ammo?.[C.combat?.activeWeapon?.activeAmmo ?? 'hunter'] ?? null }; });
      await up('left');
      fired++;
      await sleep(Math.max(520, 1000 * (sol?.tf ?? 0) + 250));
      loose.events = await page.evaluate(() => (window.__shotEv || []).slice(0, 6));
      loose.ammoAfter = await page.evaluate(() => { const C = window.__CTX__; return C.combat?.ammo?.[C.combat?.activeWeapon?.activeAmmo ?? 'hunter'] ?? null; });
      const hp1 = await page.evaluate((i) => { const m = window.__CTX__.machines.list[i]; return m ? { vial: m._vialHits ?? null, hp: Math.round(m.health), down: (m._toppleT ?? -1) >= 0 } : null; }, t.i);
      shots.push({ kind, part, ammo, d: +t.d.toFixed(1), aimErr: sol?.err ?? a.err, predicted: sol && { first: sol.first, missM: sol.missM, aimIdx: sol.aimIdx, ds: sol.ds, dt: sol.dt, ride: sol.ride, tf: sol.tf }, still, hpBefore: t.hp, down: t.down, steady: sw.st, swayDeg: sw.sway,
        vialHits: hp1 && hp0 ? [hp0.vial, hp1.down ? 'topple' : hp1.vial] : null, hpAfter: hp1?.hp ?? null, loose });
    }
  } finally { await release(); }
}

async function beat(page, K, s) {
  const st = s.stage;
  if (s.type === 'goto') {
    if (s.up) {
      // a pillar is climbed by its three 1 m steps (src/world/sites/survey.js): come at it from the steps' side
      const ap = await page.evaluate((x, z) => {
        const P = window.__CTX__.props?.survey?.pillars || [];
        let best = null, bd = Infinity;
        for (const p of P) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
        return best ? { x: best.x + Math.sin(best.yaw) * 8, z: best.z + Math.cos(best.yaw) * 8, cx: best.x, cz: best.z } : null;
      }, s.anchor.x, s.anchor.z);
      if (ap) {
        const r0 = await walkTo(page, K, ap, 1.5);
        if (!r0.ok) return { ...r0, why: `approach to the steps: ${r0.why}` };
        const r1 = await walkTo(page, K, { x: ap.cx, z: ap.cz }, 1.2, { up: s.up, maxS: 60 });
        return r1;
      }
    }
    const top = await page.evaluate(() => { const P = window.__CTX__.player.position; return P.y - window.__CTX__.terrain.getHeight(P.x, P.z); });
    if (top > 2) {
      // on a pillar: down its three steps (a 4 m drop off the top hurts)
      const ap = await page.evaluate(() => {
        const C = window.__CTX__, q = C.player.position, P = C.props?.survey?.pillars || [];
        let best = null, bd = Infinity;
        for (const p of P) { const d = Math.hypot(p.x - q.x, p.z - q.z); if (d < bd) { bd = d; best = p; } }
        return best ? { x: best.x + Math.sin(best.yaw) * 8, z: best.z + Math.cos(best.yaw) * 8 } : null;
      });
      if (ap) await walkTo(page, K, ap, 2.0, { maxS: 30 });
    }
    if (st === 'cross') {
      // the Peg line: put out the lamps from 18 m before crossing (the optional count, the kill objective live).
      // M1b: the swarm that stands where she crosses (within 40 m of the line's middle), not all nine: the nine are three
      // swarms of three 53 m apart now (game/runtime.js), and at 9cae8d6 walking the whole 178 m line to each swarm in
      // turn killed her (22 arrows, 100 -> 0)
      const mid = await page.evaluate(() => window.__CTX__.systemsGame.A.transect);
      // fix round: she drinks under 55 hp between shots, and breaks off to cross under 30 hp with the gourd dry
      await drink(page, K, 95);
      const f = await fight(page, K, 'peg', 'lamp', null, { stand: 18, maxS: 120, all: true, near: mid, nearR: 40, breakOffHp: 30 });
      if (f.why === 'died') return f;
      lampsFight = f;
    }
    if (st === 'ditch') {
      // "come down on the Plumb through the lee ditch": crouched, at a walk (C toggles the crouch), as a player stalks
      // it; sprinting in stood her 9 m from it in the open and it killed her (f90d2b0, 7ae0fd0)
      // 5f4bf42: crouched all the way from T1 she stuck 101 m short (no hop over the shelf's lips while crouched):
      // she runs down off the shelf to 45 m from the station, then stalks
      // M1b round 2: the stalk is IN the lee ditch (reedmask.js DITCH: junco on the station's dyke's lee side). She runs
      // down off the shelf to the ditch's north-east end (A.ditchHead, about 75 m from the station), drops into the rush
      // crouched, and walks along it to the stage's stand 16 m from the station while the rush leans (a gust: the
      // player's cue, the drawn lean of the ditch's bed), stopping where it stands up (a lull: only stillness hides)
      const A = await page.evaluate(() => window.__CTX__.systemsGame.A);
      let leg0 = null;
      if (A.ditchHead) {
        leg0 = await walkPath(page, K, A.ditchHead, 3, { maxS: 120 });
        if (!leg0.ok) return { ...leg0, why: `run down to the ditch's head: ${leg0.why}` };
      } else {
        const st0 = A.station, p0 = (await page.evaluate(probe)).p, d0 = Math.hypot(p0.x - st0.x, p0.z - st0.z);
        if (d0 > 50) {
          const k = 45 / d0;
          leg0 = await walkPath(page, K, { x: st0.x + (p0.x - st0.x) * k, z: st0.z + (p0.z - st0.z) * k }, 3, { maxS: 120 });
          if (!leg0.ok) return { ...leg0, why: `run down to 45 m from the station: ${leg0.why}` };
        }
      }
      // fix round: a full staff before the stalk (6fa199d walked into the ditch's fight on 14 hp and died there)
      await drink(page, K, 98);
      const crouched = await page.evaluate(() => !!window.__CTX__.player.crouching);
      if (!crouched) await K.tap('KeyC');
      // what she walks in on the stalk (M1.6e reed cover): frames hidden by the rule, the cover kinds under her, and the
      // frames she was seen moving (in cover in a lull, or out of cover) by the Plumb's suspicion
      await page.evaluate(() => { const C = window.__CTX__, R = (window.__stalk = { n: 0, hidden: 0, inCover: 0, kinds: {}, susMax: 0, on: true }); const f = () => { if (!R.on) return; const p = C.player; R.n++; if (p.reedHidden) R.hidden++; if ((p.reedCover ?? 0) >= 0.45 && (p.reedKind === 1 || p.reedKind === 2)) R.inCover++; const k = p.reedKind ?? 0; R.kinds[k] = (R.kinds[k] || 0) + 1; const pl = C.systemsGame?.spawned?.plumb?.[0]; if (pl) R.susMax = Math.max(R.susMax, pl.suspicion ?? 0); requestAnimationFrame(f); }; requestAnimationFrame(f); });
      const r = A.ditchHead ? await stalkTo(page, K, s.anchor, Math.max(1.5, s.radius - 1), 200) : await walkPath(page, K, s.anchor, Math.max(1.5, s.radius - 1), { sprint: false, maxS: 200 });
      const stalk = await page.evaluate(() => { const R = window.__stalk; R.on = false; return { frames: R.n, hidden: R.hidden, inCover: R.inCover, kinds: R.kinds, susMax: +R.susMax.toFixed(3) }; });
      if (await page.evaluate(() => !!window.__CTX__.player.crouching)) await K.tap('KeyC');
      await sleep(300);
      await playScene(page, K);
      return { ...r, leg0: leg0 && { nav: leg0.nav, legs: leg0.legs }, stalk };
    }
    const r = await walkTo(page, K, s.anchor, Math.max(1.5, s.radius - 1), { up: s.up });
    await sleep(300);
    await playScene(page, K);
    return r;
  }
  if (s.type === 'talk') {
    // the prompt's radius is 3.0; round 1 walked into Mise at 2.0. A long way (the return from the station) on the nav grid
    const far = s.p && s.anchor ? Math.hypot(s.p.x - s.anchor.x, s.p.z - s.anchor.z) : 0;
    const r = far > 30 ? await walkPath(page, K, s.anchor, 2.5, { stick: PAD }) : await walkTo(page, K, s.anchor, 2.5, { stick: PAD });
    if (!r.ok) return r;
    await holdE(page, K, 500);
    await sleep(300);
    await playScene(page, K);
    return { ok: true };
  }
  if (s.type === 'gather') {
    if (st === 'make') {
      for (let i = 0; i < 3; i++) { await K.down('KeyR'); await sleep(1700); await K.up('KeyR'); await sleep(400); if ((await page.evaluate(probe)).stage !== st) return { ok: true }; }
      return { ok: false, why: 'hold R made no Reed arrows' };
    }
    const r = await walkTo(page, K, s.anchor, 2.5);
    if (!r.ok) return r;
    for (let i = 0; i < 16; i++) { await holdE(page, K); await playScene(page, K); if ((await page.evaluate(probe)).stage !== st) return { ok: true }; }
    return { ok: false, why: 'gathering did not complete' };
  }
  if (s.type === 'sight' || s.type === 'survey') {
    if (s.type === 'sight') { const r = await walkTo(page, K, s.anchor, 40); if (!r.ok) return r; }
    await playScene(page, K);
    if (!(await page.evaluate(probe)).sighting) await K.tap('KeyV');
    await sleep(500);
    const ids = s.type === 'sight' ? ['gauge'] : ['T2', 'T6'];
    const aims = [];
    for (const id of ids) { aims.push({ id, ...(await page.evaluate(aimAt, id)) }); await sleep(1600); }
    if ((await page.evaluate(probe)).sighting) await K.tap('KeyV');
    await sleep(300);
    await playScene(page, K);
    return { ok: (await page.evaluate(probe)).stage !== st, aims };
  }
  if (s.type === 'kill') {
    // eeddcb4: 21 Steady shots at 9-18 m (sway 0, the look within 0.35 deg) and no vial hit (the head's rings stand
    // round the glass at that elevation; it killed her): from 28 m, flatter, the look held within 0.08 deg (4 cm)
    if (st === 'topple') return fight(page, K, 'plumb', 'vial', () => 'topple', { stand: 28, maxS: 110, tolDeg: 0.08, reach: 220 });
    // Pry the bob while it is down (the card): a Barbed arrow is the ranged Pry, from where she stands (no walk-in in the
    // 4 s it is down); E with the lance is the near one, taken when it lies within reach
    if (st === 'pry') {
      const near = await page.evaluate(() => !!window.__CTX__.combat?.melee?.pryTarget);
      if (near) { await holdE(page, K, 450); await sleep(900); if ((await page.evaluate(probe)).stage !== st) return { ok: true, how: 'lance' }; }
      // fix round: up to three cycles of [the vial with Reed arrows until it is down] -> [Barbed on the bob while it is
      // down]: a Plumb that stands up again before the bob comes off is toppled again, as a player would (at bab1f0c's
      // kit row two Barbed arrows missed the lying bob and it stood up; the live beat then shot Barbed at a standing bob)
      const cycles = [];
      for (let cy = 0; cy < 3; cy++) {
        const T0 = (await page.evaluate(targetsOf, 'plumb', 'vial')).filter((t) => t.d < 220);
        if (!T0.length) return { ok: false, why: 'no live plumb to pry', cycles, how: 'barbed' };
        if (!T0[0].down) {
          const v = await fight(page, K, 'plumb', 'vial', () => 'pry', { stand: 28, maxS: 80, tolDeg: 0.08, reach: 220, untilDown: true });
          cycles.push({ vial: { ok: v.ok, fired: v.fired, why: v.why ?? null } });
          if (v.why === 'died') return { ...v, cycles, how: 'barbed' };
          if (!v.down) { if ((await page.evaluate(probe)).stage !== st) return { ok: true, cycles, how: 'barbed' }; continue; }
        }
        const f = await fight(page, K, 'plumb', 'bob', () => 'pry', { stand: 28, maxS: 30, ammo: 'hardpoint', backOut: false, drawMs: 760, tolDeg: 0.1, reach: 220, whileDown: true });
        cycles.push({ barbed: { ok: f.ok, fired: f.fired, why: f.why ?? null } });
        if (f.why === 'died') return { ...f, cycles, how: 'barbed' };
        if ((await page.evaluate(probe)).stage !== st) return { ok: true, cycles, how: 'barbed' };
      }
      return { ok: false, why: 'the bob still on after three topples', cycles, how: 'barbed' };
    }
    return { ok: false, why: `unknown kill beat ${st}` };
  }
  return { ok: false, why: `unknown beat type ${s.type}` };
}

/**
 * QUIT AND CONTINUE (M1.6f): read the record Continue will load, unload the document (about:blank: the game is gone,
 * only localStorage stays), open the game again IN THE SAME TAB, press a key, CONTINUE, and compare the live state
 * with the record. The same tab, not a new one: at f90d2b0 and before, the save-continue row closed the tab and
 * opened another, whose title sat in 'idle' for 120 s with no error (3 of 3 runs): the new tab got no animation
 * frames, so the game's frame loop and the title's presentation loop never ran. A diagnosis is polled while the
 * title is awaited (animation frames counted from document start, visibility, focus, context loss).
 */
/** fix round 1: the mean luminance (0-255) of the page's middle band (30-70 % of its height), from a screenshot. */
async function lumBand(page) {
  try {
    const buf = await page.screenshot({ type: 'png' });
    const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
    let sum = 0, n = 0;
    for (let y = Math.floor(info.height * 0.3); y < Math.floor(info.height * 0.7); y++) for (let x = 0; x < info.width; x++) { sum += data[y * info.width + x]; n++; }
    return n ? +(sum / n).toFixed(1) : null;
  } catch { return null; }
}

async function reloadContinue(page, tag) {
  const before = await page.evaluate(() => {
    const C = window.__CTX__, s = C.progression.saves;
    const n = s.store.continueSlot();
    const rec = n ? s.store.latest(n) : null;
    return rec ? { slot: n, stage: rec.quest?.order?.at?.(-1)?.id ?? null, idx: rec.quest?.idx, started: !!rec.quest?.started, salt: rec.satchel['metal-shards'] ?? 0,
      hour: rec.hour, x: rec.position.x, y: rec.position.y, z: rec.position.z, kind: rec.kind, reason: rec.reason, v: rec.v,
      keys: Object.keys(localStorage).filter((k) => k.startsWith('cal.v6')) } : null;
  });
  const tC = Date.now();
  await page.goto('about:blank', { waitUntil: 'load', timeout: 30000 });
  await sleep(400);
  await page.bringToFront();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const diag = [];
  let titled = false;
  for (let i = 0; i < 60 && !titled; i++) {
    const d = await page.evaluate(() => ({ ctx: !!window.__CTX__, state: window.__CTX__?.state ?? null, stage: window.__CTX__?.menus?.titleStage ?? null,
      load: document.getElementById('load-label')?.dataset?.step ?? null, errs: (window.__GAME__?.systemErrors || []).map((e) => `${e.key}: ${e.message}`).slice(0, 4),
      raf: window.__raf ?? null, vis: document.visibilityState, focus: document.hasFocus(), titleBuilt: !!window.__CTX__?.menus?._titleBuilt,
      host: !!document.querySelector('#title .title-inner'), glLost: window.__CTX__?.engine?.renderer?.getContext?.()?.isContextLost?.() ?? null,
      frames: window.__CTX__?.engine?.frames ?? null })).catch((e) => ({ evalError: String(e).slice(0, 120) }));
    d.t = Math.round((Date.now() - tC) / 1000);
    diag.push(d);
    titled = d.state === 'title' && /press|menu/.test(d.stage || '');
    if (!titled) await sleep(2000);
  }
  const row = { before, diag: diag.filter((d, i) => i % 5 === 0 || i === diag.length - 1), bootS: Math.round((Date.now() - tC) / 1000), sameTab: true };
  if (!titled) {
    row.pass = false;
    row.why = 'the title never came on the second boot (diag holds what the page showed)';
    row.shot = await shot(page, `${tag}-no-title`);
    return row;
  }
  await sleep(400);
  if (await page.evaluate(() => window.__CTX__.menus.titleStage === 'press')) { if (PAD) await padKeys(page).tap('Enter'); else await page.keyboard.press('Enter'); }
  await page.waitForFunction(() => window.__CTX__?.menus?.titleStage === 'menu', { timeout: 30000, polling: 50 }).catch(() => {});
  await sleep(300);
  row.titleShot = await shot(page, `${tag}-title`);
  row.titleSave = await page.evaluate(() => document.querySelector('.mn-title-save')?.textContent ?? null);
  const hadContinue = PAD
    ? !!(await uiChoose(page, /CONTINUE/, { sel: '.mn-title-item' })) && (await sleep(600), !!(await uiChoose(page, /CONTINUE/, { sel: '.gs-slot.cont .gs-slot-go' })))
    : await page.evaluate(() => { const b = [...document.querySelectorAll('.mn-title-item')].find((x) => /CONTINUE/.test(x.textContent)); if (!b || b.disabled) return false; b.click();
    // M1.6g2 (BIBLE 18): CONTINUE opens the three slot cards; the marked one is the slot Continue loads
    const go = document.querySelector('.gs-slot.cont .gs-slot-go'); if (!go) return false; go.click(); return true; });
  await page.waitForFunction(() => window.__CTX__?.state === 'playing', { timeout: 60000, polling: 50 }).catch(() => {});
  await sleep(1500);
  // (eeddcb4: the frame was detached under this read once, after a death and RELOAD earlier in the run: wait and read again)
  const readAfter = () => page.evaluate(() => {
    const C = window.__CTX__, sp = C.spine, p = C.player;
    return { state: C.state, idx: sp.idx, started: sp.started, stage: sp.order.at(-1)?.id ?? null, current: sp.current()?.id ?? null, salt: C.inventory.count('metal-shards'),
      hour: +C.environment.time.toFixed(3), x: +p.position.x.toFixed(3), y: +p.position.y.toFixed(3), z: +p.position.z.toFixed(3),
      note: document.querySelector('.cal-track-obj')?.textContent ?? null, loadedFrom: C.progression.saves.loadedFrom };
  });
  let after;
  try { after = await readAfter(); } catch (e) {
    row.retried = String(e?.message || e).slice(0, 120);
    await page.waitForFunction(() => window.__CTX__?.state === 'playing', { timeout: 60000, polling: 100 }).catch(() => {});
    await sleep(1000);
    after = await readAfter();
  }
  const dxz = before ? +Math.hypot(before.x - after.x, before.z - after.z).toFixed(3) : null;
  const dy = before && Number.isFinite(before.y) ? +(after.y - before.y).toFixed(3) : null;
  // fix round 1 (FIX LIST 6): the row grades the picture too. At f35bc3c the T1 continue was black under the HUD in 3 of
  // 9 lane runs (the middle band's mean luminance 8.3/255) and passed on position. The bar: the middle band (30-70 % of
  // the height) at >= 10/255 when the row's shot is taken (1.5 s after play resumes). If it is under, the page is read
  // every 0.5 s for 8 s more (what the renderer, the camera and the element over the canvas are), for the cause
  const pic = await lumBand(page);
  row.picture = { lum: pic, bar: 10 };
  if (pic != null && pic < 10) {
    const t0 = Date.now(), seen = [];
    while (Date.now() - t0 < 8000) {
      await sleep(500);
      const l = await lumBand(page);
      const d = await page.evaluate(() => { const C = window.__CTX__, E = C?.engine, R = E?.renderer, cam = C?.camera, P = C?.player?.position, cv = R?.domElement, cs = cv ? getComputedStyle(cv) : null;
        const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        return { state: C?.state, frames: E?.frames ?? null, calls: R?.info?.render?.calls ?? null, tris: R?.info?.render?.triangles ?? null, lost: R?.getContext?.()?.isContextLost?.() ?? null,
          cam: cam ? [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)] : null, camGround: cam && C.terrain ? +(cam.position.y - C.terrain.getHeight(cam.position.x, cam.position.z)).toFixed(2) : null,
          her: P ? [+P.x.toFixed(2), +P.y.toFixed(2), +P.z.toFixed(2)] : null, near: cam?.near ?? null, far: cam?.far ?? null, exposure: R?.toneMappingExposure ?? null,
          canvas: cs ? { display: cs.display, opacity: cs.opacity, visibility: cs.visibility } : null, over: top ? `${top.tagName.toLowerCase()}.${String(top.className || '').slice(0, 60)}` : null }; }).catch((e) => ({ evalError: String(e).slice(0, 120) }));
      seen.push({ t: +((Date.now() - t0) / 1000 + 1.5).toFixed(1), lum: l, ...d });
      if (l != null && l >= 10 && row.picture.pictureAfterS == null) row.picture.pictureAfterS = seen.at(-1).t;
    }
    row.picture.seen = seen.filter((x, i) => i % 2 === 0 || i === seen.length - 1);
    row.picture.laterShot = await shot(page, `${tag}-continued-later`);
  }
  row.picture.ok = pic != null && pic >= 10;
  Object.assign(row, {
    after, hadContinue, dxz, dy,
    pass: !!before && hadContinue && after.state === 'playing' && before.idx === after.idx && before.started === after.started && before.salt === after.salt
      && Math.abs(before.hour - after.hour) < 0.05 && dxz < 1.0 && (dy == null || Math.abs(dy) < 0.5) && row.picture.ok,
    shot: await shot(page, `${tag}-continued`),
  });
  return row;
}

/* ---------------------------------------------------------------- main */

try {
  mkdirSync(runDir, { recursive: true });
  if (await portOpen(PORT)) throw new Error(`port ${PORT} already in use`);
  const slot = await takeMachineSlot({ who: `systems slice-hour ${PORT}`, waitS: 1800, log });
  if (!slot.ok) throw new Error(slot.why);
  T0 = Date.now();
  report.slotTakenAt = new Date().toISOString();
  vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
  for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
  if (!(await portOpen(PORT))) throw new Error(`vite did not open ${PORT}`);
  installProfileCleanup();
  profile = profileDir(PORT);
  browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000,
    // a page the browser thinks is hidden or occluded gets no requestAnimationFrame: the frame loop never runs and the
    // title never leaves 'idle' (the f90d2b0 save-continue diagnosis: state 'title', stage 'idle', 0 errors, 120 s)
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
  report.chrome = await browser.version();

  /* ---- A. the systems' frames, staged by the Frame Set's own page.mjs ---- */
  // --run-only (M1b): no frames page at all (no frames, no staged rows, no kit): one game loaded in the session, not
  // two, for a machine short of memory
  if (!RUN_ONLY) {
    const set = loadFrameSet();
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.25 });
    page.on('console', (m) => { if (m.type() === 'error') report.console.push({ at: 'frames', text: m.text().slice(0, 300) }); });
    page.on('pageerror', (e) => report.console.push({ at: 'frames', text: `pageerror: ${String(e).slice(0, 300)}` }));
    await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction('window.__READY__ === true', { timeout: 240000, polling: 500 });
    await sleep(6000);
    for (const id of FRAMES) {
      const f = set.frames.find((x) => x.id === id);
      if (!f) { report.frames.push({ id, ok: false, error: 'not in the Frame Set' }); continue; }
      if (WEAR && !report.wear && (!WEAR_AT || WEAR_AT === id)) {
        report.wear = await page.evaluate(async (wid) => {
          const C = window.__CTX__, L = C?.player?.hero?.loadout;
          if (!L?.equipArmor) return { error: 'no loadout' };
          if (C.systemsGame && wid === 'pan-2') C.systemsGame.rung = 'scout';
          const info = await L.equipArmor(wid);
          C.player.hero.update?.(0);
          return { at: null, armorId: L.armorId, perk: L.perk, row: info?.row ?? null, flagDuration: C.machines?.perception?.flagDuration ?? null };
        }, WEAR).catch((e) => ({ error: String(e?.message || e).slice(0, 200) }));
        report.wear.at = id;
        log(`wearing ${WEAR} from ${id}: ${JSON.stringify(report.wear)}`);
      }
      try {
        const staged = await page.evaluate(stageFrame, f, { settleMs: 2600 });
        const buf = await page.screenshot({ type: 'png' });
        await sharp(buf).resize(1600, 900, { fit: 'fill' }).png().toFile(path.join(runDir, `${id}.png`));
        let pr = null;
        if (PROBE) {
          try { pr = await page.evaluate(async (url, fr) => (await import(url)).probe(fr), PROBE, f); }
          catch (e) { pr = { error: String(e?.message || e).slice(0, 400) }; }
          log(`${id} probe: ${JSON.stringify(pr).slice(0, 300)}`);
        }
        await page.evaluate(unstageFrame);
        report.frames.push({ id, ok: true, file: `${id}.png`, standIns: staged.standIns ?? [], ...(pr ? { probe: pr } : {}) });
        log(`${id} filmed`);
      } catch (e) { report.frames.push({ id, ok: false, error: String(e?.message || e).slice(0, 300) }); }
    }
    /* brazier-refusal, STAGED (see the header): a real Plumb at 25 m and 80 m in three AI states */
    if (!NO_REFUSAL) try {
      const prep = await page.evaluate(async () => {
        const C = window.__CTX__, B = C.braziers, home = B.byId('cistern');
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        if (!home) return { error: 'no home Brazier' };
        if (!B.lit.has('cistern')) B.lit.add('cistern');
        B.ash.delete('cistern'); B._sync();
        const seat = home.obj.seat, p = C.player;
        p.position.set(seat.x, 0, seat.z); p.velocity?.set?.(0, 0, 0); p._snapToGround?.();
        p.camYaw = Math.atan2(-(home.obj.position.x - seat.x), -(home.obj.position.z - seat.z));
        await sleep(600);
        const kinds = C.machines?.instrumentKinds || {};
        const kind = kinds.plumb ? 'plumb' : kinds.peg ? 'peg' : null;
        if (!kind) return { error: 'no plumb or peg kind registered' };
        const hx = home.obj.position.x, hz = home.obj.position.z;
        const m = C.machines.spawn(kind, hx + 25, hz, {});
        if (!m) return { error: `spawn ${kind} refused` };
        // staged: its brain is switched off so the state the row writes is the state the Brazier reads (f90d2b0: at
        // 25 m its own perception walked 'suspicious' on between writes and the page showed the rest rows)
        if (m.ai?.tick) m.ai.tick = () => {};
        // closing round: the state machine runs in the machine's own update (machine.js: _stateSuspicious walks a
        // 'suspicious' whose suspicion is under 0.06 on to 'return' in the next frame), so at c455362 the 25 m wary
        // case read 'refused' from the runner and the E press a frame later opened the rest rows. While a case is
        // staged, every update ends with the staged state and a suspicion that holds it (0.6 wary, 1 hostile): the
        // Brazier reads it the same in every frame, as it would a Plumb that stays wary
        const upd = m.update.bind(m);
        m.update = (dt, t) => {
          upd(dt, t);
          const st = window.__stagedState;
          if (!st || m.alive === false) return;
          const sus = st === 'suspicious' ? 0.6 : st === 'alert' ? 1 : 0;
          if (m.sc) m.sc.suspicion = sus; else m.suspicion = sus;
          if (m.state !== st) m.state = st;
        };
        window.__refusalM = m;
        return { kind, spawned: true };
      });
      const cases = [];
      if (prep.spawned) {
        // the calm control stands the Plumb 300 m off: at 25 m its own brain sees her and walks 'patrol' on to alert
        // between the runner's writes (7ae0fd0: the patrol case read the refusal on the page)
        for (const [dist, state] of [[25, 'suspicious'], [25, 'alert'], [80, 'suspicious'], [300, 'patrol']]) {
          for (let k = 0; k < 3 && await page.evaluate(() => !!window.__CTX__.systemsGame?.present?.busy); k++) { await page.keyboard.press('Escape'); await sleep(300); }
          const c = await page.evaluate(async (dist, state) => {
            const C = window.__CTX__, B = C.braziers, home = B.byId('cistern'), m = window.__refusalM;
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            m.position.set(home.obj.position.x + dist, C.terrain.getHeight(home.obj.position.x + dist, home.obj.position.z), home.obj.position.z);
            // hold the AI state for the whole E press (its own brain would otherwise walk it on): set once through the
            // machine's own setState, then re-asserted at the end of each of its updates (see the spawn above)
            window.__stagedState = state;
            m.setState?.(state);
            const sus0 = state === 'suspicious' ? 0.6 : state === 'alert' ? 1 : 0;
            if (m.sc) m.sc.suspicion = sus0; else m.suspicion = sus0;
            m.state = state;
            const hold = setInterval(() => { m.state = state; }, 16);
            await sleep(700);
            const d = B.dialog('cistern');
            const lamp = B.machinesNear().find((x) => Math.abs(x.x - m.position.x) < 0.01)?.lamp ?? null;
            window.__holdState = hold;
            return { dist, state, lamp, mode: d?.mode ?? null, line: d?.line ?? null, rows: (d?.rows || []).map((r) => r.label) };
          }, dist, state);
          // the E press as a player makes it: sit, the dialog opens, read its words off the page, Escape
          await page.keyboard.down('KeyE'); await sleep(650); await page.keyboard.up('KeyE'); await sleep(500);
          c.page = await page.evaluate(() => ({ open: !!window.__CTX__.systemsGame?.present?.busy, text: (document.querySelector('#cal-sys')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 240) }));
          c.shot = await shot(page, `r-refusal-${c.dist}m-${c.state}`);
          await page.keyboard.press('Escape'); await sleep(400);
          await page.evaluate(() => { clearInterval(window.__holdState); window.__stagedState = null; });
          cases.push(c);
        }
      }
      const six = 'THE LAMPS ARE UP. NO REST HERE.';
      const want = (c) => (c.dist <= 60 && (c.state === 'suspicious' || c.state === 'alert'));
      report.rows['brazier-refusal'] = { staged: true, ...prep, cases,
        // a refusal shows the bible's one line and no rest row; a rest shows the four rows and not the line
        pass: cases.length === 4 && cases.every((c) => (want(c)
          ? c.mode === 'refused' && c.page.open && c.page.text.includes(six) && !/REST UNTIL/.test(c.page.text)
          : c.mode === 'rest' && c.page.open && !c.page.text.includes(six) && (c.page.text.match(/REST UNTIL/g) || []).length === 4)) };
      log(`brazier-refusal: ${cases.map((c) => `${c.dist}m ${c.state} ${c.lamp} -> ${c.mode}`).join('; ')}`);
    } catch (e) { report.rows['brazier-refusal'] = { error: String(e?.message || e).slice(0, 300) }; }
    /* the kit's verb rows (M1.6j), staged on the same page */
    if (KIT) {
      try {
        await page.evaluate(`window.__aimPoint = ${aimPoint.toString()};`);
        report.rows.kit = await runKit(page, { sleep, log, only: KIT_ONLY });
        // fix round 1 (FIX LIST 3): --kit-repeat N runs the kit page N times in this one session (each repeat after the
        // first without the vial-range row, which is 30 shots), so a row's stability is measured, not one green run
        for (let r = 2; r <= KIT_REPEAT; r++) report.rows[`kit${r}`] = await runKit(page, { sleep, log: (...a) => log(`[kit ${r}]`, ...a), only: KIT_ONLY, skip: new Set(['vial-range']) });
      } catch (e) { report.rows.kit = { error: String(e?.message || e).slice(0, 300) }; }
    }
    await page.close();
  }
  if (NO_RUN) throw Object.assign(new Error('--no-run'), { noRun: true });

  /* ---- B. the run, from the real title, in a clean profile context ---- */
  const bctx = await browser.createBrowserContext();
  const page = await bctx.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.25 });
  page.on('console', (m) => { if (m.type() === 'error') report.console.push({ at: 'run', text: m.text().slice(0, 300) }); });
  page.on('pageerror', (e) => report.console.push({ at: 'run', text: `pageerror: ${String(e).slice(0, 300)}` }));
  const K = keys(page);
  if (PAD) { await page.evaluateOnNewDocument(installPad); report.input = 'pad'; }
  await page.evaluateOnNewDocument(`window.__aimPoint = ${aimPoint.toString()};`);
  await page.evaluateOnNewDocument(() => { window.__raf = 0; const tick = () => { window.__raf++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  // M1b: at bab1f0c the run's page sat 240 s short of the title's 'press' with no console error (the frames page had
  // booted in the same session): what it was doing is recorded, and the page is loaded once more before giving up
  const atPress = () => page.waitForFunction(() => window.__CTX__?.state === 'title' && window.__CTX__?.menus?.titleStage === 'press', { timeout: 150000, polling: 100 });
  try { await atPress(); } catch (e) {
    report.titleWait = await page.evaluate(() => ({ ctx: !!window.__CTX__, state: window.__CTX__?.state ?? null, stage: window.__CTX__?.menus?.titleStage ?? null,
      load: document.querySelector('#loading, .loading, .mn-load')?.textContent?.slice(0, 120) ?? null, raf: window.__raf ?? null, vis: document.visibilityState })).catch((x) => ({ evalError: String(x).slice(0, 200) }));
    log(`title not reached in 150 s: ${JSON.stringify(report.titleWait)}; loading the page again`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 });
    await atPress();
  }
  await sleep(500);
  if (PAD) await K.tap('Enter'); else await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__CTX__?.menus?.titleStage === 'menu', { timeout: 60000, polling: 50 });
  await sleep(300);
  if (PAD) report.padNewGame = await uiChoose(page, /NEW GAME/, { sel: '.mn-title-item' });
  else await page.evaluate(() => [...document.querySelectorAll('.mn-title-item')].find((x) => /NEW GAME/.test(x.textContent))?.click());
  await page.waitForSelector('.mn-diff', { timeout: 20000 });
  if (PAD) { await sleep(500); report.padBegin = await uiChoose(page, /BEGIN/, { sel: '.mn-diff' }); }
  else await page.evaluate(() => document.querySelector('.mn-diff').click());
  await page.waitForFunction(() => window.__CTX__?.state === 'playing' && window.__CTX__?.spine?.started, { timeout: 60000, polling: 50 });
  await sleep(2500);
  const s0 = await page.evaluate(probe);
  report.start = { hour: await page.evaluate(() => window.__CTX__.environment.time), stage: s0.stage, note: s0.note };
  await shot(page, 'b00-new-game');

  // brazier-dialog row: she wakes 3.9 m from the cistern Brazier; walk to it, sit, read the dialog, stand without resting
  const bzAt = await page.evaluate(() => { const b = window.__CTX__.braziers.byId('cistern'); return b ? { x: b.obj.position.x, z: b.obj.position.z } : null; });
  if (bzAt) { await walkTo(page, K, bzAt, 1.6, { maxS: 20 }); await sleep(400); }
  await holdE(page, K, 600);
  await sleep(500);
  const bz = await page.evaluate(probe);
  report.rows['brazier-dialog'] = { rows: bz.bz, forecast: bz.bzForecast, shot: await shot(page, 'b01-brazier-dialog') };
  if (bz.busy) await K.tap('Escape');
  await sleep(400);

  // save-reload row, early (so the row is reached whatever the run does later): the New Game's named save, quit,
  // reopen in the same tab, CONTINUE; the run then plays on from the continued game
  report.rows['save-reload'] = await reloadContinue(page, 'b02-reload');
  log(`save-reload: ${report.rows['save-reload'].pass ? 'PASS' : 'FAIL'} (${report.rows['save-reload'].why ?? `boot ${report.rows['save-reload'].bootS} s`})`);
  if (!report.rows['save-reload'].pass && (await page.evaluate(() => window.__CTX__?.state)) !== 'playing') throw new Error('save-reload left the game off play: the run cannot go on');

  let last = null, tries = 0, deaths = 0, stagedDeath = false;
  // a death, played as a player plays it (in the run, and once more after it with --death-after)
  const playDeath = async (s) => {
      deaths++;
      // played as a player plays it: the death card, then RETURN TO THE LAST BRAZIER (the one death rule, M1.6f; BIBLE 13's two stations, M1.6g2)
      // fix round (the judge at 24419e9: the row did not check the satchel): the newest record (BIBLE 13: "the world and
      // satchel as of the newest record"), read before the card is answered, is what she must stand up with
      const pre = await page.evaluate(() => { const C = window.__CTX__, S = C.progression.saves.store, n = S.continueSlot(), rec = n ? S.latest(n) : null;
        return { stage: C.spine.current()?.id ?? null, idx: C.spine.idx, reached: C.spine.order.map((o) => o.id), lastRest: C.braziers.lastRest, salt: C.inventory.count('metal-shards'), gourd: Math.round(C.player.gourd ?? 0),
          record: rec ? { kind: rec.kind, reason: rec.reason, salt: rec.satchel?.['metal-shards'] ?? 0, satchel: rec.satchel, gourd: Math.round(rec.vitals?.gourd ?? 0), ammo: rec.ammo } : null }; });
      await page.waitForFunction(() => !!document.querySelector('.mn-death.show .mn-death-opt'), { timeout: 15000, polling: 100 }).catch(() => {});
      await sleep(600);
      const card = await page.evaluate(() => ({ title: document.querySelector('.mn-death-title')?.textContent ?? null, opts: [...document.querySelectorAll('.mn-death-opt b')].map((b) => b.textContent),
        cause: (document.querySelector('.mn-death')?.innerText || '').match(/felled by[^\n]*|the island took her/i)?.[0] ?? null }));
      const cardShot = await shot(page, `d${deaths}-death-card`);
      if (deaths > 2) { report.stoppedAt = s.stage; report.why = `Brea died ${deaths} times`; return 'stop'; }
      const clicked = PAD ? !!(await uiChoose(page, /RETURN TO THE LAST BRAZIER/, { sel: '.mn-death-opt' }))
        : await page.evaluate(() => { const b = [...document.querySelectorAll('.mn-death-opt')].find((x) => /RETURN TO THE LAST BRAZIER/.test(x.textContent)); if (!b) return false; b.click(); return true; });
      await page.waitForFunction(() => window.__CTX__?.state === 'playing', { timeout: 20000, polling: 100 }).catch(() => {});
      await sleep(1500);
      const post = await page.evaluate(() => { const C = window.__CTX__, P = C.player.position, R = C.braziers.lastRest; return { stage: C.spine.current()?.id ?? null, idx: C.spine.idx, reached: C.spine.order.map((o) => o.id), state: C.state, hp: Math.round(C.player.health), maxHp: Math.round(C.player.maxHealth), salt: C.inventory.count('metal-shards'), gourd: Math.round(C.player.gourd ?? 0),
        satchel: Object.fromEntries(Object.keys(C.progression.saves.store.latest(C.progression.saves.store.continueSlot())?.satchel || {}).map((k) => [k, C.inventory.count(k)])),
        fromRest: R ? +Math.hypot(P.x - R.x, P.z - R.z).toFixed(2) : null, rest: R?.id ?? null }; });
      post.hudCause = await page.evaluate(() => (document.body.innerText || '').match(/KILLED BY [^\n]*|CHECKPOINT RESTORED/)?.[0] ?? null).catch(() => null);
      const rec = pre.record;
      const satchelKept = !!rec && Object.entries(rec.satchel || {}).every(([k, v]) => (post.satchel?.[k] ?? 0) === v) && post.salt === rec.salt;
      const gourdKept = !!rec && Math.abs(post.gourd - rec.gourd) <= 1;
      const row = { death: deaths, at: s.stage, staged: report.rows['death-staged']?.at === s.stage && !report.rows['death-staged'].played, card, clicked, pre, post, satchelKept, gourdKept, cardShot, shot: await shot(page, `d${deaths}-stood-up`),
        // she stands up at the Brazier of her last rest at full health (format.js deathRecord), on the stage she died on
        hpFull: post.hp >= post.maxHp - 0.5,
        pass: clicked && post.state === 'playing' && post.idx === pre.idx && post.fromRest != null && post.fromRest < 3 && satchelKept && gourdKept && post.hp >= post.maxHp - 0.5 };
      if (row.staged) report.rows['death-staged'].played = true;
      (report.rows['death-rule'] ||= []).push(row);
      log(`death ${deaths} at ${s.stage}: stood up ${post.fromRest} m from ${post.rest}, stage ${pre.stage} -> ${post.stage}`);
      return row;
  };
  // the staged death (--death-at, --death-after): her own damage path (player.takeDamage -> _die), so the card, the park and
  // the respawn are the game's; the cause is a Plumb (the nearest live one, else the kind's own name), sent as an
  // Instrument's blow is ('player-damage' with from), so the card and the HUD name it as they name a real death
  const stageDeath = (at) => page.evaluate((at) => { const C = window.__CTX__, P = C.player, p = P.position;
    let from = null, bd = Infinity;
    for (const m of (C.machines?.list || [])) { if (m && m.kind === 'plumb' && m.alive !== false) { const d = Math.hypot(m.position.x - p.x, m.position.z - p.z); if (d < bd) { bd = d; from = m; } } }
    if (!from) from = { kind: 'plumb', displayName: C.machines?.instrumentKinds?.plumb?.displayName ?? 'Plumb' };
    const hp = Math.round(P.health), amount = P.health + 50;
    C.events.emit('player-damage', { amount, from });
    P.takeDamage(amount, from);
    return { at, hpBefore: hp, hpAfter: Math.round(P.health), state: C.state, cause: from.displayName ?? from.kind, causeLive: bd < Infinity ? +bd.toFixed(1) : null }; }, at);
  while (spent() < BUDGET_S - RESERVE_S) {
    const s = await page.evaluate(probe);
    if (s.state === 'dead' || s.state === 'death-menu' || s.deathCard) {
      if ((await playDeath(s)) === 'stop') break;
      last = null; tries = 0;
      continue;
    }
    if (!s.stage && !s.report?.started) { report.stoppedAt = null; report.why = 'no quest running (the continued game did not restore it)'; break; }
    if (!s.stage || s.stage === 'reward') { report.stoppedAt = 'reward'; report.why = 'quest done'; break; }
    if (s.busy) { await playScene(page, K); continue; }
    if (s.stage === last) tries++; else tries = 0;
    if (tries > 1) { report.stoppedAt = s.stage; report.why = report.beats.at(-1)?.why || 'no progress'; break; }
    last = s.stage;
    if (DEATH_AT && s.stage === DEATH_AT && !stagedDeath) {
      // the staged death: her own damage path (player.takeDamage -> _die), so the card, the park and the respawn are the game's
      stagedDeath = true;
      report.rows['death-staged'] = await stageDeath(s.stage);
      log(`death staged at ${s.stage}: ${JSON.stringify(report.rows['death-staged'])}`);
      await page.waitForFunction(() => window.__CTX__.state === 'dead' || window.__CTX__.state === 'death-menu' || !!document.querySelector('.mn-death.show'), { timeout: 10000, polling: 100 }).catch(() => {});
      last = null; tries = 0;
      continue;
    }
    const b0 = Date.now();
    log(`beat ${s.stage} (${s.type})`);
    const r = await beat(page, K, s);
    const after = await page.evaluate(probe);
    const row = { stage: s.stage, type: s.type, ok: after.stage !== s.stage, seconds: +((Date.now() - b0) / 1000).toFixed(1), ...r, note: s.note, hp: after.hp };
    // (people M1.3h, the smallest change: which of Brea's slice verbs have started so far, and the last refusal of each)
    row.verbs = await page.evaluate(() => { const I = window.__CTX__?.player?.animator?.verbInfo?.(); return I ? { counts: { ...I.counts }, refused: { ...I.refused }, last: I.name } : null; }).catch(() => null);
    if (s.stage === 'cross' && lampsFight) row.lamps = lampsFight;
    // (no still after the topple: the 4 s it lies down are the Pry's)
    if (row.ok && s.stage !== 'topple') row.shot = await shot(page, `b-${String(report.beats.length + 2).padStart(2, '0')}-${s.stage}`);
    report.beats.push(row);
    // M1.6j save-continue ON A STRUCTURE: the record the sight stage wrote stands her on T1's deck (5f4bf42: Continue put
    // her 2.2 m off it); quit, reopen, CONTINUE there, and play on from the continued game
    if (row.ok && s.stage === 'sight' && !report.rows['save-t1']) {
      report.rows['save-t1'] = await reloadContinue(page, 'b-t1');
      log(`save-t1: ${report.rows['save-t1'].pass ? 'PASS' : 'FAIL'} ${JSON.stringify({ dxz: report.rows['save-t1'].dxz, dy: report.rows['save-t1'].dy })}`);
      if ((await page.evaluate(() => window.__CTX__?.state)) !== 'playing') { report.stoppedAt = 'ditch'; report.why = 'the continue on T1 left the game off play'; break; }
    }
    if (r.why === 'died') continue;
    if (!row.ok && r.ok === false) { report.stoppedAt = s.stage; report.why = r.why; break; }
  }
  if (!report.stoppedAt) { report.stoppedAt = (await page.evaluate(probe)).stage; report.why = 'Chrome budget'; }
  const fin = await page.evaluate(probe);
  report.spine = fin.report;
  report.shots = shots;
  report.drinks = drinks;
  // fix round: the reward, live (M1.6l: the Scout is the reward of Raker's Morning): what she wears when the run ends
  report.reward = await page.evaluate(() => { const C = window.__CTX__, L = C.player?.hero?.loadout;
    return { armor: L?.armorId ?? null, perk: L?.perk ?? null, rung: C.systemsGame?.rung ?? null, flagDuration: C.machines?.perception?.flagDuration ?? null, rewarded: !!C.spine?.rewarded, done: !!C.spine?.done }; }).catch((e) => ({ error: String(e).slice(0, 160) }));
  report.anchors = await page.evaluate(() => window.__CTX__.systemsGame.A);
  if (DEATH_AT && report.rows['death-staged']) {
    const ds = report.rows['death-staged'], dr = (report.rows['death-rule'] || []).find((r) => r.staged);
    ds.row = dr ? { pass: dr.pass, fromRest: dr.post.fromRest, rest: dr.post.rest, hp: dr.post.hp, stage: dr.post.stage, satchelKept: dr.satchelKept, gourdKept: dr.gourdKept } : null;
    ds.pass = !!dr?.pass && report.stoppedAt === 'reward';
  }
  if (SITE_CLOCK) {
    report.rows['site-clock'] = await page.evaluate(async () => {
      const C = window.__CTX__, R = C.siteRefill, K = C.siteClock, A = C.systemsGame?.A, M = C.machines;
      if (!R || !K || !A || !M?.sites) return { error: 'no site clock in this build' };
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const st = A.station, V = C.player.position.constructor;
      const kill = (m) => { try { m.takeDamage({ impact: 1e7, tear: 0, point: null, object: null, dir: { x: 0, y: 0, z: 1 }, seen: true }); } catch { /* */ } };
      const dykeSites = () => M.sites.sites.filter((s) => s && s.kind === 'plumb' && s.questOwned && Math.hypot(s.x - st.x, s.z - st.z) < 3);
      const row = { questDone: !!C.spine?.done, hours0: +K.hours.toFixed(3) };
      row.dykeBefore = dykeSites().map((s) => ({ id: s.id, pending: s.pending, alive: !!s.machine && s.machine.alive !== false }));
      // STAGED: the dyke Plumb killed if it still stands (the run walks away from it), a control Plumb spawned 150 m behind
      // the camera and killed, and both wrecks aged out by the machines' own debug hook (SiteManager.advance)
      for (const s of dykeSites()) if (s.machine && s.machine.alive !== false) kill(s.machine);
      const cd = new V(); C.camera.getWorldDirection(cd); cd.y = 0; cd.normalize();
      // on dry ground: straight behind, then turned up to 40 deg either way, 150 m then 120 m off
      const P = C.player.position;
      let cx = null, cz = null;
      for (const d of [150, 120]) for (const a of [0, 20, -20, 40, -40]) {
        if (cx != null) break;
        const r = a * Math.PI / 180, bx = -(cd.x * Math.cos(r) - cd.z * Math.sin(r)), bz = -(cd.x * Math.sin(r) + cd.z * Math.cos(r));
        const x = P.x + bx * d, z = P.z + bz * d;
        if ((C.terrain?.getHeight?.(x, z) ?? -1) > 0.5) { cx = x; cz = z; }
      }
      row.control = cx != null ? { x: +cx.toFixed(1), z: +cz.toFixed(1), fromHer: +Math.hypot(cx - P.x, cz - P.z).toFixed(1) } : { error: 'no dry ground behind her' };
      const ctl = cx != null ? M.spawn('plumb', cx, cz, {}) : null;
      if (ctl?.ai) ctl.ai.tick = () => {};
      await sleep(300);
      if (ctl) kill(ctl);
      await sleep(300);
      M.sites.advance(100, 1);
      const ids = () => ({ dyke: dykeSites().map((s) => s.id), ctl: ctl?._site?.id ?? null });
      const at = (id) => { const s = M.sites.sites.find((x) => x.id === id); return s ? { id, pending: s.pending, back: !!s.machine && s.machine.alive !== false, respawnAt: Number.isFinite(s.respawnAt) ? +s.respawnAt.toFixed(1) : String(s.respawnAt), verdict: K.verdict(id, R.world) } : null; };
      const I = ids();
      row.beforeClock = { dyke: I.dyke.map(at), ctl: at(I.ctl) };
      K.advance(13);   // STAGED: 13 hours on the site clock
      row.swept = R.sweep();
      row.afterClock = { hours: +K.hours.toFixed(3), dyke: I.dyke.map(at), ctl: at(I.ctl) };
      row.log = R.log.slice(-4);
      row.pass = row.questDone && I.dyke.length >= 1 && row.afterClock.dyke.every((d) => d && d.pending && !d.back && d.verdict.why === 'quest')
        && !!row.afterClock.ctl && row.afterClock.ctl.back && !row.beforeClock.ctl?.back;
      row.bar = 'after the quest and 13 h on the site clock: the dyke Plumb is not back (the quest\'s own); a cleared site Plumb 150 m behind her is';
      return row;
    }).catch((e) => ({ error: String(e?.message || e).slice(0, 300) }));
    log(`site-clock: ${report.rows['site-clock'].pass ? 'PASS' : 'FAIL'} ${JSON.stringify(report.rows['site-clock']).slice(0, 400)}`);
  }
  // fix round 1 (FIX LIST 5): the death row, staged after the clean run (see --death-after)
  if (DEATH_AFTER && (await page.evaluate(() => window.__CTX__?.state)) === 'playing') {
    try {
      report.rows['death-staged'] = await stageDeath('after-run');
      log(`death staged after the run: ${JSON.stringify(report.rows['death-staged'])}`);
      await page.waitForFunction(() => window.__CTX__.state === 'dead' || window.__CTX__.state === 'death-menu' || !!document.querySelector('.mn-death.show'), { timeout: 10000, polling: 100 }).catch(() => {});
      const ds = report.rows['death-staged'];
      const dr = await playDeath({ ...(await page.evaluate(probe)), stage: 'after-run' });
      ds.played = true;
      if (dr && dr !== 'stop') { dr.staged = true; ds.row = { pass: dr.pass, fromRest: dr.post.fromRest, rest: dr.post.rest, hp: dr.post.hp, stage: dr.post.stage, satchelKept: dr.satchelKept, gourdKept: dr.gourdKept, cardCause: dr.card.cause, hudCause: dr.post.hudCause };
        ds.pass = !!dr.pass && !/STAGED/i.test(`${dr.card.cause} ${dr.post.hudCause}`); }
      log(`death-after: ${ds.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(ds.row ?? {})}`);
    } catch (e) { report.rows['death-staged'] = { error: String(e?.message || e).slice(0, 300) }; }
  }
  report.stopShot = await shot(page, 'b-stop');
  if (PAD) report.pad = { ...(await padState(page)), presses: await page.evaluate(() => window.__pad?.presses ?? null), stickSteps: await page.evaluate(() => window.__pad?.stickSteps ?? 0), keyboardUsed: false };

  // save-continue row: what the store holds, then QUIT (the document is unloaded), the same tab opened again on the
  // game, CONTINUE on the title: the same stage, satchel, place and hour
  report.rows['save-continue'] = await reloadContinue(page, 'c');
  await bctx.close();
} catch (e) {
  if (!e?.noRun) {
    report.error = String(e?.stack || e).slice(0, 1200);
    log('error', report.error);
  }
} finally {
  report.chromeSeconds = Math.round(spent());
  try { await browser?.close(); } catch { /* */ }
  if (profile) disposeProfile(profile);
  if (vite) { try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* */ } }
  releaseMachineSlot(log);
  try { mkdirSync(runDir, { recursive: true }); writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2)); } catch { /* */ }
  log(`report: ${path.join(runDir, 'report.json')}`);
  log(`reached: ${(report.spine?.reached || []).join(' > ') || 'nothing'}; stopped at ${report.stoppedAt} (${report.why})`);
  process.exit(report.error ? 1 : 0);
}
