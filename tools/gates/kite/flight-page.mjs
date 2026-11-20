// M3 area B, wave 3: FLIGHT ON THE PAGE, by input. One short Chrome session on this tree's Vite (--port, 127.0.0.1,
// nice -n 10), the machine guard and slot1 (tools/chrome-slot.mjs), torn down on every exit path. The game's own input
// (key events on the window, as a keyboard sends them: W, Space, A, D, C) flies the Survey Kite through the player's own
// update (src/hero/kiteFlight.js); nothing here moves her or poses her. Two flights:
//   1. T1 (the test flight, R3): she stands on T1's drum deck, 3 m up (the one staged thing: her place and facing, the hour and the
//      weather), runs off it with W, jumps (Space), opens the kite (Space again after 0.42 s), banks right then left (D, A),
//      then holds the track to the marked field by A and D, and lands on her feet; then a second launch that is folded by
//      C at about 3 m over the ground (KF1's "fold at 3 m").
//   2. The caldera's windward wall (KF3, the lift road): she stands on the rim at (78.6, -200.6) facing 045 (into the
//      trade), runs off it, opens it, and rides the wall's lift by A and D (along the wall, keeping 14-26 m over it).
// Every frame of every flight (rAF, the page's own frames) reads Kevin's bars on her bones (the clip film's read: each
// wrist against the head's facing plane and under the head bone, each elbow against its shoulder, R10's shoulder height
// for any wrist behind a plane), the law's state, height, lift and bank, and the frame time. Shots are taken frozen
// (the studio time scale at 0) at the clips' moments from close lenses, so hands read; the lens is the shot's own, put
// back after. Writes <review>/runs/<utc>-<commit>-<label>/ (run.json and PNGs), never inside the repo.
//   node tools/gates/kite/flight-page.mjs --port 5282 [--label kite-flight] [--only t1,fold,caldera]
import puppeteer from 'puppeteer';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { takeMachineSlot, releaseMachineSlot } from '../../chrome-slot.mjs';
import { RUNS, assertOutsideRepo } from '../../frames/paths.mjs';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../../chrome-profile.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const utc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const log = (...a) => console.log(`[kite-flight ${new Date().toISOString().slice(11, 19)}]`, ...a);
const PORT = guardPort(flag('--port'));
if (PORT === 5173) throw new Error('port 5173 is the owner preview: never');
const LABEL = flag('--label', 'kite-flight');
const ONLY = (flag('--only', 't1,fold,caldera') || '').split(',');
const commit = (() => { try { return execFileSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return '?'; } })();
const dirty = (() => { try { return execFileSync('git', ['-C', REPO, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim().length > 0; } catch { return true; } })();
const BUDGET_S = 780;

/* ------------------------------------------------------------------ in the page */

/** Install the page helpers: keys, the per-frame read, the staging of a start, the frozen lens. */
const INSTALL = () => {
  const C = window.__CTX__, p = C.player, E = C.engine;
  const V = p.position.constructor;
  const K = (window.__KF = { log: [], read: null, bars: null, lens: null });
  K.key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  K.tap = async (code) => { K.key(code, true); await K.frames(2); K.key(code, false); };
  K.frames = (n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  K.sim = () => E.simTime;
  K.waitSim = async (s, cap = 30000) => { const t0 = E.simTime, w0 = performance.now(); while (E.simTime - t0 < s && performance.now() - w0 < cap) await K.frames(1); };
  K.until = async (fn, cap = 60000) => { const w0 = performance.now(); while (!fn() && performance.now() - w0 < cap) await K.frames(1); return fn(); };
  // the bars on her bones, every frame (her facing from her heading; the head bone; char up is world up)
  const wp = (bone, out) => { bone.updateWorldMatrix(true, false); return out.setFromMatrixPosition(bone.matrixWorld); };
  const hd = new V(), w = new V(), e = new V(), sh = new V(), sh2 = new V(), fwd = new V();
  K.bars = { frames: 0, flyingFrames: 0, worst: { front: Infinity, under: Infinity, elbow: -Infinity }, bad: 0, badAt: [], behind: 0, behindAtOrAboveShoulder: 0, minUnderShoulder: Infinity };
  K.readBars = () => {
    const an = p.animator, b = an.b, fl = p.flight !== 'none', after = !!an._kiteAfter;
    if (!fl && !after) return null;
    wp(b.head.bone, hd); fwd.set(Math.sin(p.heading), 0, Math.cos(p.heading));
    const shY = Math.min(wp(b.upArmL.bone, sh).y, wp(b.upArmR.bone, sh2).y);
    const out = {};
    for (const s of ['L', 'R']) {
      wp(b[`hand${s}`].bone, w); wp(b[`loArm${s}`].bone, e); wp(b[`upArm${s}`].bone, sh);
      const front = w.clone().sub(hd).dot(fwd), under = hd.y - w.y, elbow = e.y - sh.y;
      out[s] = { front: +front.toFixed(3), under: +under.toFixed(3), elbow: +elbow.toFixed(3), underShoulder: +(shY - w.y).toFixed(3) };
    }
    return out;
  };
  let last = performance.now();
  K.trace = [];
  const tick = () => {
    const now = performance.now(), dtMs = now - last; last = now;
    const r = K.readBars();
    if (r) {
      const B = K.bars; B.frames++;
      const f = p.kite, st = p.flight;
      if (st !== 'none') B.flyingFrames++;
      let bad = null;
      for (const s of ['L', 'R']) {
        const x = r[s];
        B.worst.front = Math.min(B.worst.front, x.front); B.worst.under = Math.min(B.worst.under, x.under); B.worst.elbow = Math.max(B.worst.elbow, x.elbow);
        if (x.under < 0) bad = `${s} wrist over the head bone`;
        if (x.elbow >= 0) bad = `${s} elbow over its shoulder`;
        if (x.front <= 0) { B.behind++; B.minUnderShoulder = Math.min(B.minUnderShoulder, x.underShoulder); if (x.underShoulder <= 0) { B.behindAtOrAboveShoulder++; bad = `${s} wrist behind the head plane at or above her shoulder`; } }
      }
      if (bad) { B.bad++; if (B.badAt.length < 12) B.badAt.push({ why: bad, state: p.flight, t: +(f?.t ?? 0).toFixed(3), r }); }
      if (K.trace.length < 20000) K.trace.push([+(E.simTime).toFixed(3), st, +(f?.t ?? 0).toFixed(3), +p.position.x.toFixed(2), +p.position.y.toFixed(2), +p.position.z.toFixed(2), +(f?.agl ?? 0).toFixed(2), +(f?.lift ?? 0).toFixed(2), +(p.kitePilot?.bank ?? 0).toFixed(2), +dtMs.toFixed(1), Math.round(p.health)]);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return { ok: true, owned: !!p.kitePilot?.owned, pilot: !!p.kitePilot };
};

/** Stage a start: hour, weather, her place (x, z, y over the ground at `top`), her facing (a bearing) and the chase lens
 *  behind her. Nothing of the flight is staged. */
const START = async ({ x, z, top = null, bearing, hour = 17.75, back = 0, side = 0 }) => {
  const C = window.__CTX__, p = C.player, E = C.engine, env = C.environment, K = window.__KF;
  for (const c of ['KeyW', 'KeyA', 'KeyD', 'KeyC', 'Space']) K.key(c, false);
  C.input.keys.clear();
  if (C.state !== 'playing') C.state = 'playing';
  E.requestTimeScale('studio', null);
  env.setWeather('trade', 0); env.setTime(hour);
  try { E.setLookHour?.(hour, 'trade', null, { ev: false }); } catch (e) { /* */ }
  p.kitePilot.owned = true;
  // (a pillar: she stands on the drum's deck, `back` m behind its centre along the bearing and `side` m to its right,
  //  clear of the centring plate's head in the middle)
  const br = bearing * Math.PI / 180, dx = Math.sin(br), dz = -Math.cos(br);
  x = x - dx * back - dz * side; z = z - dz * back + dx * side;
  const g = C.terrain.getHeight(x, z), y = top != null ? C.terrain.getHeight(x + dx * back + dz * side, z + dz * back - dx * side) + top : g;
  p.position.set(x, y + 0.05, z); p.velocity.set(0, 0, 0);
  p._prevPos?.copy?.(p.position);
  p._snapToGround?.(y + 0.6);
  p.grounded = true;
  const H = Math.PI - bearing * Math.PI / 180;   // her yaw (flight.js: a bearing b faces (sin b, -cos b))
  p.heading = H; p.camYaw = -bearing * Math.PI / 180; p.camPitch = 0.12;
  await K.frames(45);
  K.bars = { frames: 0, flyingFrames: 0, worst: { front: Infinity, under: Infinity, elbow: -Infinity }, bad: 0, badAt: [], behind: 0, behindAtOrAboveShoulder: 0, minUnderShoulder: Infinity };
  K.trace = [];
  return { x: +p.position.x.toFixed(2), y: +p.position.y.toFixed(2), z: +p.position.z.toFixed(2), ground: +g.toFixed(2), standsOn: +(p.position.y - g).toFixed(2), grounded: p.grounded, heading: +H.toFixed(3) };
};

/** Run off the top and open the kite by input: W held, Space (the jump) at the edge, Space again `openAfter` s later. */
const LAUNCH = async ({ runS = 0.12, openAfter = 0.42 }) => {
  const C = window.__CTX__, p = C.player, K = window.__KF;
  K.key('KeyW', true);
  await K.waitSim(runS);
  await K.tap('Space');
  const t0 = K.sim();
  await K.until(() => !p.grounded, 3000);
  const air0 = K.sim();
  await K.waitSim(openAfter);
  await K.tap('Space');
  await K.frames(2);
  // (not yet: too soon or too low, the press does nothing; Space again every 0.1 s while she is in the air, as a player
  //  presses again, up to 1.6 s airborne)
  for (let i = 0; i < 12 && p.flight === 'none' && !p.grounded; i++) { await K.waitSim(0.1); await K.tap('Space'); await K.frames(2); }
  K.key('KeyW', false);
  return { jumped: !p.grounded, airborneS: +(K.sim() - air0).toFixed(3), flight: p.flight, open: p.kitePilot.last.open, refused: p.kitePilot.last.refused, sinceSpace: +(K.sim() - t0).toFixed(3) };
};

/** Wait for a clip point: the state and the seconds in it. */
const AT = async ({ state, t, cap = 30000 }) => {
  const p = window.__CTX__.player, K = window.__KF;
  const ok = await K.until(() => p.flight === state && p.kite.t >= t, cap);
  return { ok, state: p.flight, t: +p.kite.t.toFixed(3), agl: +p.kite.agl.toFixed(2), y: +p.position.y.toFixed(2) };
};

/** Hold the bar: key held for `s` sim seconds. */
const BANK = async ({ code, s }) => {
  const K = window.__KF; K.key(code, true); await K.waitSim(s); K.key(code, false); return { bank: +window.__CTX__.player.kitePilot.bank.toFixed(2) };
};

/** Steer by A and D (bang-bang, 8 deg dead band) toward a target until the flight is no longer gliding (or `stopIf`). */
const STEER = async ({ mode, target = null, until = 'landed', capS = 60, home = null }) => {
  const C = window.__CTX__, p = C.player, K = window.__KF, E = C.engine;
  const f = p.kite, t0 = E.simTime;
  let maxY = p.position.y, y0 = p.position.y, lifted = 0, kL = false, kR = false;
  const press = (l, r) => { if (l !== kL) { K.key('KeyA', l); kL = l; } if (r !== kR) { K.key('KeyD', r); kR = r; } };
  while (E.simTime - t0 < capS) {
    if (p.flight !== 'gliding' && p.flight !== 'opening') break;
    if (until === 'time' && E.simTime - t0 >= capS) break;
    let want;
    if (mode === 'track') { const dx = target.x - p.position.x, dz = target.z - p.position.z; want = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360; }
    else { // ridge: along the wall (135), off it when low (045), back onto it when high (225); home after `home` s
      want = home != null && E.simTime - t0 > home ? 225 : f.agl < 14 ? 45 : f.agl > 26 ? 225 : 135;
    }
    let hdg = (f.heading * 180 / Math.PI) % 360; if (hdg < 0) hdg += 360;
    let d = want - hdg; while (d > 180) d -= 360; while (d < -180) d += 360;
    press(d < -8, d > 8);
    if (p.position.y > maxY) maxY = p.position.y;
    if (f.lift > 0) lifted++;
    await K.frames(1);
  }
  press(false, false);
  return { state: p.flight, s: +(E.simTime - t0).toFixed(2), climbM: +(maxY - y0).toFixed(2), maxY: +maxY.toFixed(2), liftFrames: lifted, at: { x: +p.position.x.toFixed(1), y: +p.position.y.toFixed(1), z: +p.position.z.toFixed(1) }, agl: +f.agl.toFixed(2), lift: f.lift };
};

/** Freeze the sim and put a lens on her (orbit about her chest: yawRel from her facing, dist, height over her feet). */
const LENS = async ({ yawRel, dist, height, up = 1.2, fov = 50 }) => {
  const C = window.__CTX__, p = C.player, E = C.engine, K = window.__KF, cam = C.camera;
  E.requestTimeScale('studio', 0);
  await K.frames(2);
  const V = p.position.constructor, D = Math.PI / 180;
  const fw = new V(Math.sin(p.heading), 0, Math.cos(p.heading)), left = new V(fw.z, 0, -fw.x);
  const t = yawRel * D, d = fw.clone().multiplyScalar(Math.cos(t)).addScaledVector(left, Math.sin(t));
  const P0 = p.position.clone();
  const fov0 = cam.fov, upd0 = p._updateCamera;
  p._updateCamera = function () { cam.position.set(P0.x + d.x * dist, P0.y + height, P0.z + d.z * dist); cam.lookAt(P0.x, P0.y + up, P0.z); if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); } cam.updateMatrixWorld(); };
  p._updateCamera();
  K.unlens = () => { p._updateCamera = upd0; cam.fov = fov0; cam.updateProjectionMatrix(); E.requestTimeScale('studio', null); };
  // her occlusion fade off: drawn whole
  if ((p._fadeCur ?? 1) < 0.999 || (p.fade ?? 1) < 0.999) { p.fade = 1; p._fadeCur = 1; p._fadeApplied = -1; try { p._applyFade(1 / 60, performance.now() / 1000); } catch (e) { /* */ } }
  await K.frames(4);
  return { state: p.flight, t: +p.kite.t.toFixed(3), bars: K.readBars(), kite: p.animator.hangPoseInfo?.()?.kite ? { clip: p.animator.hangPoseInfo().kite.clip, phase: +p.animator.hangPoseInfo().kite.phase.toFixed(2), furl: +p.animator.hangPoseInfo().kite.furl.toFixed(2) } : null };
};
const UNLENS = async () => { const K = window.__KF; K.unlens?.(); K.unlens = null; await K.frames(1); return true; };

/** The run's numbers: the bars, the trace's frame times while flying, the last open and landing, her health. */
const SUMMARY = () => {
  const C = window.__CTX__, p = C.player, K = window.__KF, B = K.bars;
  const fly = K.trace.filter((r) => r[1] !== 'none');
  const dts = fly.map((r) => r[9]).slice(2);
  const sorted = [...dts].sort((a, b) => a - b);
  return { bars: { ...B, worst: { front: +B.worst.front.toFixed(3), under: +B.worst.under.toFixed(3), elbow: +B.worst.elbow.toFixed(3) }, minUnderShoulder: Number.isFinite(B.minUnderShoulder) ? +B.minUnderShoulder.toFixed(3) : null },
    frames: { flying: fly.length, medianMs: sorted.length ? sorted[sorted.length >> 1] : null, maxMs: sorted.length ? sorted.at(-1) : null, over33: dts.filter((d) => d > 33.4).length, over50: dts.filter((d) => d > 50).length },
    last: p.kitePilot.last, hp: Math.round(p.health), flight: p.flight, grounded: p.grounded, at: { x: +p.position.x.toFixed(2), y: +p.position.y.toFixed(2), z: +p.position.z.toFixed(2) },
    trace: K.trace.filter((_, i) => i % 6 === 0) };
};

/* ------------------------------------------------------------------ the session */

const portOn = (p, host) => new Promise((r) => { const s = net.connect(p, host); s.once('connect', () => { s.destroy(); r(true); }); s.once('error', () => r(false)); });
const portOpen = async (p) => (await portOn(p, '127.0.0.1')) || (await portOn(p, '::1'));
let vite = null, browser = null, profile = null;
async function teardown() {
  try { await browser?.close(); } catch { try { browser?.process()?.kill('SIGKILL'); } catch { /* */ } }
  browser = null;
  if (vite) { try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* */ } vite = null; }
  if (profile) { try { disposeProfile(profile); } catch { /* */ } profile = null; }
  releaseMachineSlot(log);
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, async () => { await teardown(); process.exit(130); });
process.on('exit', () => { releaseMachineSlot(log); if (vite) { try { process.kill(-vite.pid, 'SIGKILL'); } catch { /* */ } } });

const stamp = utc().replace(/[-:]/g, '');
const runDir = path.join(RUNS, `${stamp}-${commit}-${LABEL}`);
assertOutsideRepo(runDir, REPO);
const out = { commit, cleanTree: !dirty, tree: REPO, port: PORT, startedAt: utc(), flights: {}, shots: [], console: [], errors: [] };
if (await portOpen(PORT)) { console.error(`port ${PORT} is in use`); process.exit(3); }
const slot = await takeMachineSlot({ who: `kite ${PORT}`, log });
if (!slot.ok) { console.error('SLOT-NOT-AVAILABLE', slot.why); process.exit(4); }
const t0 = Date.now();
const watchdog = setTimeout(async () => { log('WATCHDOG'); out.errors.push('watchdog'); try { writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(out, null, 1)); } catch { /* */ } await teardown(); process.exit(5); }, (BUDGET_S + 30) * 1000);
watchdog.unref();
let page = null;
const shot = async (name, lens) => {
  const r = await page.evaluate(LENS, lens);
  await sleep(150);
  const file = `${name}.png`;
  writeFileSync(path.join(runDir, file), await page.screenshot({ type: 'png' }));
  await page.evaluate(UNLENS);
  out.shots.push({ name, file, lens, read: r });
  log(`shot ${name}: ${JSON.stringify(r.kite)} bars ${JSON.stringify(r.bars)}`);
  return r;
};
// the lenses: close on her right front, side-on, behind her right (the roll's road), and a wider chase from behind
const L = {
  front: { yawRel: 35, dist: 3.2, height: 1.9, up: 1.3, fov: 50 },
  side: { yawRel: 95, dist: 3.8, height: 1.7, up: 1.6, fov: 55 },
  rear: { yawRel: -150, dist: 2.6, height: 1.6, up: 1.15, fov: 50 },
  wide: { yawRel: 160, dist: 7.5, height: 3.2, up: 2.0, fov: 55 },
};
try {
  mkdirSync(runDir, { recursive: true });
  vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
  for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
  if (!(await portOpen(PORT))) throw new Error(`vite did not open port ${PORT}`);
  installProfileCleanup();
  profile = profileDir(PORT);
  browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
  page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') out.console.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => out.console.push('pageerror: ' + String(e).slice(0, 300)));
  await page.goto(`http://127.0.0.1:${PORT}/?shot=1&kite=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__READY__ === true', { timeout: 240000, polling: 500 });
  await sleep(4000);
  out.bootSeconds = Math.round((Date.now() - t0) / 1000);
  log(`booted in ${out.bootSeconds} s`);
  out.install = await page.evaluate(INSTALL);
  const S = await page.evaluate(async () => { const s = await import('/src/world/island/sites.js'); const r = await import('/src/game/kite/roads.js'); const T = s.TRIG.find((t) => t.id === 'T1'); return { T1: { x: T.x, z: T.z, top: s.TRIG_TOP }, field: r.TEST_FLIGHT.field, bearing: r.TEST_FLIGHT.bearing }; });

  if (ONLY.includes('t1')) {
    const F = (out.flights.t1 = {});
    // a step back from the pillar's centre so the run-off is the jump's own (the pillar is a 4 m cylinder)
    F.start = await page.evaluate(START, { x: S.T1.x, z: S.T1.z, top: 3, bearing: S.bearing, back: 1.0, side: 0.8 });
    log(`t1 start ${JSON.stringify(F.start)}`);
    F.launch = await page.evaluate(LAUNCH, { runS: 0.3, openAfter: 0.42 });
    log(`t1 launch ${JSON.stringify(F.launch)}`);
    if (F.launch.flight !== 'none') {
      await page.evaluate(AT, { state: 'opening', t: 0.27 }); await shot('t1-open-045-front', L.front);
      await page.evaluate(AT, { state: 'opening', t: 0.40 }); await shot('t1-open-068-rear', L.rear);
      await page.evaluate(AT, { state: 'opening', t: 0.54 }); await shot('t1-open-090-side', L.side);
      await page.evaluate(AT, { state: 'gliding', t: 0.6 });
      F.bankRight = await page.evaluate(BANK, { code: 'KeyD', s: 1.1 });
      await shot('t1-glide-turn-right-wide', L.wide);
      await shot('t1-glide-turn-right-front', L.front);
      F.bankLeft = await page.evaluate(BANK, { code: 'KeyA', s: 0.9 });
      await shot('t1-glide-side', L.side);
      F.steer = await page.evaluate(STEER, { mode: 'track', target: { x: S.field.x, z: S.field.z }, capS: 40 });
      log(`t1 steer ${JSON.stringify(F.steer)}`);
      if ((await page.evaluate(() => window.__CTX__.player.flight)) === 'landing') { await shot('t1-land-front', L.front); await shot('t1-land-side', L.side); }
      await page.evaluate(AT, { state: 'none', t: 0, cap: 5000 });
      await page.evaluate(() => window.__KF.waitSim(1.2));
    }
    F.summary = await page.evaluate(SUMMARY);
    log(`t1: land ${JSON.stringify(F.summary.last.land)} bars ${JSON.stringify(F.summary.bars.worst)} bad ${F.summary.bars.bad} frames ${JSON.stringify(F.summary.frames)}`);
  }
  if (ONLY.includes('fold') && (Date.now() - t0) / 1000 < BUDGET_S - 200) {
    const F = (out.flights.fold = {});
    F.start = await page.evaluate(START, { x: S.T1.x, z: S.T1.z, top: 3, bearing: S.bearing, back: 1.0, side: 0.8 });
    F.launch = await page.evaluate(LAUNCH, { runS: 0.3, openAfter: 0.42 });
    if (F.launch.flight !== 'none') {
      await page.evaluate(AT, { state: 'gliding', t: 0.3 });
      // fold when 3-3.5 m over the ground (KF1's "fold at 3 m")
      F.foldAt = await page.evaluate(async () => { const p = window.__CTX__.player, K = window.__KF; await K.until(() => p.flight !== 'gliding' || p.kite.agl <= 3.4, 30000); const a = +p.kite.agl.toFixed(2); await K.tap('KeyC'); await K.frames(2); return { agl: a, state: p.flight }; });
      log(`fold at ${JSON.stringify(F.foldAt)}`);
      if (F.foldAt.state === 'folding') {
        await page.evaluate(AT, { state: 'folding', t: 0.12 }); await shot('fold-030-front', L.front);
        await page.evaluate(AT, { state: 'folding', t: 0.23 }); await shot('fold-060-rear', L.rear);
        await page.evaluate(AT, { state: 'folding', t: 0.35 }); await shot('fold-090-rear', L.rear);
      }
      await page.evaluate(() => window.__KF.until(() => window.__CTX__.player.grounded, 8000));
      await page.evaluate(() => window.__KF.waitSim(1.5));
      await shot('fold-after-stowed-rear', L.rear);
    }
    F.summary = await page.evaluate(SUMMARY);
    log(`fold: hp ${F.summary.hp} bars ${JSON.stringify(F.summary.bars.worst)} bad ${F.summary.bars.bad}`);
  }
  if (ONLY.includes('caldera') && (Date.now() - t0) / 1000 < BUDGET_S - 150) {
    const F = (out.flights.caldera = {});
    F.start = await page.evaluate(START, { x: 78.6, z: -200.6, bearing: 45, hour: 17.5 });
    log(`caldera start ${JSON.stringify(F.start)}`);
    F.launch = await page.evaluate(LAUNCH, { runS: 0.15, openAfter: 0.6 });
    log(`caldera launch ${JSON.stringify(F.launch)}`);
    if (F.launch.flight !== 'none') {
      await page.evaluate(AT, { state: 'gliding', t: 0.2 });
      F.ridge1 = await page.evaluate(STEER, { mode: 'ridge', capS: 9 });
      await shot('caldera-lift-climb-wide', L.wide);
      await shot('caldera-lift-climb-front', L.front);
      F.ridge2 = await page.evaluate(STEER, { mode: 'ridge', capS: 12 });
      log(`caldera ridge ${JSON.stringify(F.ridge1)} ${JSON.stringify(F.ridge2)}`);
    }
    F.summary = await page.evaluate(SUMMARY);
    F.climbM = F.summary.trace.length ? +(Math.max(...F.summary.trace.map((r) => r[4])) - (F.launch.open?.y ?? F.summary.trace[0][4])).toFixed(2) : null;
    log(`caldera: climb ${F.climbM} m over the open; bars ${JSON.stringify(F.summary.bars.worst)} bad ${F.summary.bars.bad}`);
  }
} catch (e) { out.errors.push(String(e?.stack || e).slice(0, 600)); log('error', String(e?.message || e)); }
out.chromeSeconds = Math.round((Date.now() - t0) / 1000);
await teardown();
writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(out, null, 1));
log(`run dir ${runDir} (${out.chromeSeconds} s of Chrome)`);
