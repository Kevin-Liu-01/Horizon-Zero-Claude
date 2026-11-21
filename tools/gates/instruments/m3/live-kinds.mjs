// M3 wave 3c, area C: THE LIVE KINDS IN THE GAME, A PAGE ROW AND THEIR FRAMES. One short Chrome session on this tree's
// Vite (--port, 127.0.0.1, nice -n 10), the machine-wide slot (tools/chrome-slot.mjs), torn down on every exit path.
//
// Part 1, the Yards (leg 6's start: tools/gates/systems/hour-two-fixtures.mjs fixture(6), continued as the hour-two runner
// boots). "The Kiln Yards" is put on its 'climb' stage (its spine restored there; the quest stands the encounter on a
// record continued in that stage) and the encounter stands up as the live kinds (src/instruments/kinds/kiln/yards.js).
//   - frames: the plugged Kiln beside Brea; the awake Kiln and its Spindle escort beside Brea; Brine on the plugged
//     Kiln's hot door and the fire behind it, close; the Davit beside Brea once it has come in
//   - THE ENCOUNTER RULE, A PAGE ROW (Q4, R7): the four heads quenched in turn by Brine Pots landed on the plugged head
//     ('pot-landed', the quest's own quench law), the game running at x3; on every frame the live Kilns that are awake
//     are counted (the encounter's 'awake' and 'going'). PASS: 0 frames with two awake, all four quenched, the Yards
//     quiet, the Davit in from the third wellhead and following.
//   - IK2 on the page: the door's stagger (sim seconds from 'door-sprung' to 'door-shut', from the encounter's clock).
// Part 2, MOORING (leg 4's start: fixture(4)). "A Line Over the Glass" runs and the live Sonde stands at MOORING.
//   - frames: the moored Sonde on its tether beside Brea, level with its hull; then adrift after the cut
//   - the quest's own cut: the spine put on its 'tether' stage and glassLine._cutTether() (what the stake's prompt calls):
//     the cut must go through the live Sonde (stats.tether.live) found within 60 m of the Ring; then its drift off the
//     wind's downwind bearing and the time to the ground (IK7: within 10 deg; inside 60 s), the game at x3.
// Writes <review>/runs/<utc>-<commit>-<label>/ (run.json and PNGs).
//   node tools/gates/instruments/m3/live-kinds.mjs --port 5283 [--label m3c-live] [--only yards|sonde]
import puppeteer from 'puppeteer';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { takeMachineSlot, releaseMachineSlot } from '../../../chrome-slot.mjs';
import { RUNS, assertOutsideRepo } from '../../../frames/paths.mjs';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../../../chrome-profile.mjs';
import { fixture } from '../../systems/hour-two-fixtures.mjs';
import { apronPoint, apronUV } from '../../../../src/world/sites/kilnyards-layout.js';
import { ISLAND_SCALE as SC } from '../../../../src/world/island/extent.js';

/** The apron's (u, v) metres to engine (x, z) and back (the seam's frame: lenses and marks stay on the yard's floor). */
const AP = (u, v) => { const p = apronPoint(u, v); return { x: p.e * SC, z: -p.n * SC }; };
const UV = (x, z) => apronUV(x / SC, -z / SC, { u: 0, v: 0 });

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[m3c-live ${new Date().toISOString().slice(11, 19)}]`, ...a);
const PORT = guardPort(flag('--port'));
if (PORT === 5173) throw new Error('port 5173 is the owner preview: never');
const LABEL = flag('--label', 'm3c-live');
const ONLY = flag('--only', null);
const commit = (() => { try { return execFileSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return '?'; } })();
const dirty = (() => { try { return execFileSync('git', ['-C', REPO, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim().length > 0; } catch { return true; } })();
const BUDGET_S = 600;

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

const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/[-:]/g, '');
const runDir = path.join(RUNS, `${stamp}-${commit}-${LABEL}`);
assertOutsideRepo(runDir, REPO);
const out = { commit, cleanTree: !dirty, tree: REPO, port: PORT, shots: [], console: [], errors: [], yards: null, sonde: null };

/* ------------------------------------------------------------------ page helpers (run in the page) */
const LENS = async ({ eye, at, fov = 50 }) => {
  const C = window.__CTX__, p = C.player, E = C.engine, cam = C.camera;
  E.requestTimeScale('studio', 0);
  const upd0 = p._updateCamera, fov0 = cam.fov;
  p._updateCamera = function () { cam.position.set(eye.x, eye.y, eye.z); cam.lookAt(at.x, at.y, at.z); if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); } cam.updateMatrixWorld(); };
  p._updateCamera();
  window.__unlens = () => { p._updateCamera = upd0; cam.fov = fov0; cam.updateProjectionMatrix(); E.requestTimeScale('studio', null); };
  await new Promise((r) => { let k = 0; const f = () => (++k >= 8 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  return true;
};
/** Brea set down at (x, z) facing (fx, fz), still. */
const PLACE = ({ x, z, fx, fz }) => {
  const C = window.__CTX__, p = C.player;
  p.position.set(x, 0, z); p.velocity?.set?.(0, 0, 0); p._snapToGround?.();
  const h = Math.atan2(fx - x, fz - z); p.heading = h;
  return { x: +p.position.x.toFixed(2), y: +p.position.y.toFixed(2), z: +p.position.z.toFixed(2), hp: C.player.health ?? null };
};
const frames = (n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });

async function boot(page, leg) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__CTX__?.state === 'title' && !!window.__CTX__?.progression?.saves?.store, { timeout: 180000, polling: 200 });
  const wrote = await page.evaluate((r) => { const st = window.__CTX__.progression.saves.store; st.setActive(1); return st.write(r); }, fixture(leg));
  if (!wrote?.ok) throw new Error(`start record not written: ${JSON.stringify(wrote)}`);
  await page.goto('about:blank', { waitUntil: 'load', timeout: 30000 });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__CTX__?.state === 'title' && window.__CTX__?.menus?.titleStage === 'press', { timeout: 180000, polling: 100 });
  await sleep(500);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__CTX__?.menus?.titleStage === 'menu', { timeout: 60000, polling: 50 });
  await sleep(300);
  await page.evaluate(() => { [...document.querySelectorAll('.mn-title-item')].find((x) => /CONTINUE/.test(x.textContent))?.click(); document.querySelector('.gs-slot.cont .gs-slot-go')?.click(); });
  await page.waitForFunction(() => window.__CTX__?.state === 'playing', { timeout: 60000, polling: 50 });
}

async function shoot(page, name, lens, note) {
  await page.evaluate(LENS, lens);
  await sleep(250);
  writeFileSync(path.join(runDir, `${name}.png`), await page.screenshot({ type: 'png' }));
  await page.evaluate(() => window.__unlens?.());
  out.shots.push({ name, lens, note });
  log(`shot ${name}`);
}

/* ------------------------------------------------------------------ part 1: the Yards */
async function yards(page) {
  const R = { phase: 'boot' };
  out.yards = R;
  await boot(page, 6);
  // the quest on 'climb': its spine restored there (the stages before it done), and the record's stand-up asked for
  R.climb = await page.evaluate(() => {
    const C = window.__CTX__, Q = C.hour2?.kilnYards || Object.values(C.hour2 || {}).find((q) => q?.spine?.qid === 'kiln-yards');
    if (!Q) return { ok: false, why: 'no kiln-yards quest on ctx.hour2' };
    window.__KY__ = Q;
    const sp = Q.spine, d = sp.serialize(), i = sp.stages.findIndex((s) => s.id === 'climb');
    d.started = true; d.done = false; d.idx = i;
    sp.stages.forEach((s, k) => { d.stages[s.id] = [k < i ? 'done' : k === i ? 'active' : 'pending', 0, 0, 0]; });
    sp.restore(d);
    Q._restored = true;
    return { ok: true, stage: sp.current()?.id };
  });
  if (!R.climb.ok) throw new Error(R.climb.why);
  await page.waitForFunction(() => !!window.__KY__?.live?.ready || !!window.__KY__?.live?.failed, { timeout: 90000, polling: 250 });
  R.standUp = await page.evaluate(() => { const Q = window.__KY__; return { live: Q.live?.report?.(), yards: Q.Y?.report?.(), standinsHidden: !!Q._standinsHidden, machines: (window.__CTX__.machines.list || []).filter((m) => ['kiln', 'spindle', 'davit'].includes(m.kind)).map((m) => m.kind) }; });
  log(`stood up: ${JSON.stringify(R.standUp.machines)} failed=${R.standUp.live?.failed}`);
  if (!R.standUp.live?.ready) throw new Error(`live kinds not ready: ${R.standUp.live?.failed}`);
  // the frame sampler (the page row): every rendered frame, the live Kilns awake and the encounter's own count
  await page.evaluate(() => {
    const Q = window.__KY__, S = window.__ROW__ = { frames: 0, twoAwake: 0, maxAwake: 0, maxEnc: 0, davitD: [], t0: performance.now(), sprung: null, shut: null, events: [] };
    const ev = window.__CTX__.events;
    ev.on('kiln:door-sprung', (e) => { if (S.sprung === null) S.sprung = Q.Y?.t ?? null; S.events.push(['sprung', Q.Y?.t]); });
    ev.on('wellhead-quenched', (e) => S.events.push(['quenched', e?.n, e?.id, Q.Y?.t]));
    ev.on('yards-quiet', () => S.events.push(['quiet', Q.Y?.t]));
    const f = () => {
      const L = Q.live;
      if (L?.ready) {
        const ks = L.kilns.filter((m) => m.alive !== false);
        const a = ks.filter((m) => m.awake).length;
        S.frames++; if (a > S.maxAwake) S.maxAwake = a; if (a >= 2) S.twoAwake++;
        const ae = Q.Y?.awake?.() ?? 0; if (ae > S.maxEnc) S.maxEnc = ae;
        if (S.sprung !== null && S.shut === null) { const k = ks.find((m) => m.brain.door === 'sprung'); if (!k) S.shut = Q.Y?.t ?? null; }
        if (L.davit && S.frames % 30 === 0) {
          const d = L.davit, near = Math.min(...ks.map((m) => Math.hypot(m.position.x - d.position.x, m.position.z - d.position.z)));
          S.davitD.push(+near.toFixed(2));
        }
      }
      if (!window.__ROW_STOP__) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  // the plugged one couples (1.5 s) and plugs; then the frames
  await page.waitForFunction(() => window.__KY__.Y.kilns.some((k) => k.role === 'plugged'), { timeout: 60000, polling: 200 });
  const K = await page.evaluate(() => {
    const Q = window.__KY__, L = Q.live, k = L.kilns.find((m) => Q.Y.kilns[m.yardsIndex].role === 'plugged'), a = L.kilns.find((m) => m !== k);
    const S = L.spindle;
    const g = (m) => ({ x: m.position.x, y: m.position.y, z: m.position.z, h: m.heading });
    return { plugged: g(k), awake: g(a), spindle: S ? g(S) : null, door: k.brain.doorWorld(), H: k.height };
  });
  R.poses = K;
  const P = K.plugged;
  // 1) the plugged Kiln at its wellhead, Brea 6 m off its front on the apron; the lens from the apron's middle
  const pu = UV(P.x, P.z);
  const b1 = AP(pu.u + 6, pu.v + 1.5);
  R.brea1 = await page.evaluate(PLACE, { ...b1, fx: P.x, fz: P.z });
  await sleep(5000);   // the Continue toast fades
  const e1 = AP(pu.u + 12, pu.v - 9), m1 = AP(pu.u + 2.5, pu.v);
  await shoot(page, 'kiln-plugged-brea', { eye: { x: e1.x, y: P.y + 2.6, z: e1.z }, at: { x: m1.x, y: P.y + 2.2, z: m1.z }, fov: 46 }, 'the plugged Kiln at its wellhead (lamp calm), its hose on the head, Brea 6 m off its front');
  // 2) the awake Kiln and the Spindle escort on the shelf, Brea 12 m west of them on it; the lens from the apron
  const A = K.awake, S = K.spindle || A;
  const au = UV((A.x + S.x) / 2, (A.z + S.z) / 2);
  const b2 = AP(au.u - 12, Math.min(au.v, 12.5));
  R.brea2 = await page.evaluate(PLACE, { ...b2, fx: (A.x + S.x) / 2, fz: (A.z + S.z) / 2 });
  await page.evaluate(frames, 10);
  const e2 = AP(au.u - 6, au.v - 16), m2 = AP(au.u - 5, au.v);
  await shoot(page, 'kiln-awake-spindle-brea', { eye: { x: e2.x, y: A.y + 3.0, z: e2.z }, at: { x: m2.x, y: A.y + 2.2, z: m2.z }, fov: 52 }, 'the awake Kiln on the shelf (lamp wary) and its grey Spindle escort, Brea 12 m west of them');
  // 3) Brine on the plugged Kiln's hot door (a pot landing 1.2 m in front of it): the door springs; the fire behind it
  const f = [Math.sin(P.h), Math.cos(P.h)], rt = [Math.cos(P.h), -Math.sin(P.h)];
  R.brea3 = await page.evaluate(PLACE, { x: b1.x, z: b1.z, fx: P.x, fz: P.z });
  R.brine = await page.evaluate((D, h) => {
    const C = window.__CTX__, at = { x: D.x + Math.sin(h) * 1.2, y: C.terrain.getHeight(D.x, D.z), z: D.z + Math.cos(h) * 1.2 };
    C.events.emit('pot-landed', { id: 'brine', at, by: 'm3c-row' });
    const L = window.__KY__.live;
    return { at, sprung: L.kilns.map((m) => m.brain.door), stats: { ...L.stats, spawned: undefined } };
  }, K.door, P.h);
  await sleep(350);
  const D = K.door;
  await shoot(page, 'kiln-door-fire', { eye: { x: D.x + f[0] * 3.0 + rt[0] * 1.1, y: P.y + D.y + 0.25, z: D.z + f[1] * 3.0 + rt[1] * 1.1 }, at: { x: D.x, y: P.y + D.y - 0.05, z: D.z }, fov: 32 }, 'Brine on the hot door: the door sprung on its hinge and the coal bed behind it');
  await shoot(page, 'kiln-door-fire-brea', { eye: { x: e1.x, y: P.y + 2.2, z: e1.z }, at: { x: m1.x, y: P.y + 1.8, z: m1.z }, fov: 40 }, 'the sprung door and its fire at Brea\'s scale');
  await page.waitForFunction(() => window.__ROW__.shut !== null, { timeout: 30000, polling: 100 }).catch(() => {});
  // the quench run at x3: Brea out of the encounter's sight (the yard's west end, 40 m off)
  const W0 = await page.evaluate(() => window.__KY__.wellheads().map((w) => ({ id: w.id, x: w.x, z: w.z })));
  const away = { x: W0[0].x - 38, z: W0[0].z + 6 };
  await page.evaluate(PLACE, { ...away, fx: W0[0].x, fz: W0[0].z });
  await page.evaluate(() => window.__CTX__.engine.requestTimeScale('m3c', 3));
  R.quench = [];
  for (let n = 1; n <= 4; n++) {
    const ok = await page.waitForFunction(() => window.__KY__.wellheads().some((w) => w.plugged && w.state === 'hot'), { timeout: 90000, polling: 200 }).then(() => true).catch(() => false);
    if (!ok) { R.quench.push({ n, why: 'no Kiln plugged into a hot head within 90 s' }); break; }
    const q = await page.evaluate((m3) => {
      const C = window.__CTX__, Q = window.__KY__, w = Q.wellheads().find((x) => x.plugged && x.state === 'hot');
      C.events.emit('pot-landed', { id: 'brine', at: { x: w.x + 0.6, y: C.terrain.getHeight(w.x, w.z), z: w.z }, by: 'm3c-row' });
      return { n: m3, id: w.id, quenched: Q.wellheads().filter((x) => x.state !== 'hot').length, t: +(Q.Y.t).toFixed(1), awakeLive: Q.live.awakeNow };
    }, n);
    R.quench.push(q);
    log(`quench ${n}: ${JSON.stringify(q)}`);
    if (n === 2) {
      // the Davit comes in from the third wellhead: let it walk to its place and film it beside Brea
      await page.waitForFunction(() => !!window.__KY__.live.davit, { timeout: 20000, polling: 200 }).catch(() => {});
      await sleep(9000);
      const Dv = await page.evaluate(() => { const d = window.__KY__.live.davit; return d ? { x: d.position.x, y: d.position.y, z: d.position.z, h: d.heading, state: d.brain.state, plates: d.brain.plates } : null; });
      R.davit = Dv;
      if (Dv) {
        await page.evaluate(() => window.__CTX__.engine.requestTimeScale('m3c', null));
        const du = UV(Dv.x, Dv.z);
        const b4 = AP(du.u - 6, du.v - 2.5);
        await page.evaluate(PLACE, { ...b4, fx: Dv.x, fz: Dv.z });
        await page.evaluate(frames, 10);
        const e4 = AP(du.u - 6, du.v - 15), m4 = AP(du.u - 3, du.v - 1.2);
        await shoot(page, 'davit-brea', { eye: { x: e4.x, y: Dv.y + 2.4, z: e4.z }, at: { x: m4.x, y: Dv.y + 1.9, z: m4.z }, fov: 44 }, 'the Davit in from the third wellhead (its cab lantern upright on the roof corner), Brea 6 m off it');
        const fd = [Math.sin(Dv.h), Math.cos(Dv.h)];
        await shoot(page, 'davit-front', { eye: { x: Dv.x + fd[0] * 9, y: Dv.y + 2.0, z: Dv.z + fd[1] * 9 }, at: { x: Dv.x, y: Dv.y + 2.0, z: Dv.z }, fov: 34 }, 'the Davit nose-on: the cab face plain, the lantern above its right corner');
        await page.evaluate(PLACE, { ...away, fx: W0[0].x, fz: W0[0].z });
        await page.evaluate(() => window.__CTX__.engine.requestTimeScale('m3c', 3));
      }
    }
  }
  await page.waitForFunction(() => window.__KY__.Y?.quiet, { timeout: 60000, polling: 250 }).catch(() => {});
  await sleep(1500);
  await page.evaluate(() => { window.__ROW_STOP__ = true; window.__CTX__.engine.requestTimeScale('m3c', null); });
  R.row = await page.evaluate(() => ({ ...window.__ROW__, davitD: undefined, davitDist: window.__ROW__.davitD }));
  R.end = await page.evaluate(() => { const Q = window.__KY__; return { live: Q.live?.report?.(), yards: Q.Y?.report?.(), stage: Q.spine.current()?.id ?? null, reached: Q.spine.report().reached, hp: window.__CTX__.player.health ?? null }; });
  const row = R.row, dd = row.davitDist || [];
  R.verdict = {
    encounterRule: row.twoAwake === 0 && row.maxAwake <= 1 && row.frames > 300 ? 'PASS' : 'FAIL',
    frames: row.frames, twoAwakeFrames: row.twoAwake, maxAwakeLive: row.maxAwake, maxAwakeEncounter: row.maxEnc,
    quenched: R.end.yards?.wells?.filter((w) => w.state !== 'hot').length ?? null, quiet: !!R.end.yards?.quiet,
    staggerS: row.sprung !== null && row.shut !== null ? +(row.shut - row.sprung).toFixed(3) : null,
    davitIn: R.end.live?.stats?.davitIn ?? null, davitFollow: dd.length ? { n: dd.length, median: dd.slice().sort((a, b) => a - b)[dd.length >> 1], min: Math.min(...dd), max: Math.max(...dd) } : null,
  };
  log(`yards verdict ${JSON.stringify(R.verdict)}`);
}

/* ------------------------------------------------------------------ part 2: the Sonde at MOORING */
async function sonde(page) {
  const R = { phase: 'boot' };
  out.sonde = R;
  await boot(page, 4);
  await page.waitForFunction(() => !!window.__CTX__.hour2?.glassLine?.report?.().sondeLive, { timeout: 90000, polling: 250 });
  await sleep(6000);    // its fans take it to its moored place on the taut line
  R.moored = await page.evaluate(() => {
    const C = window.__CTX__, G = C.hour2.glassLine, m = (C.machines.list || []).find((q) => q.kind === 'sonde');
    window.__SONDE__ = m;
    return { quest: G.report(), sonde: m?.report?.(), fromRing: G.A?.sonde ? +Math.hypot(m.position.x - G.A.sonde.x, m.position.z - G.A.sonde.z).toFixed(2) : null, standIn: !!G.standIn };
  });
  log(`moored: ${JSON.stringify(R.moored.sonde)}`);
  const So = R.moored.sonde, post = So.post, hull = So.hull;
  // Brea 6 m off the post, on the side away from the hull's lean; the lens 30 m further out, low, up at the hull
  const lx = hull.x - post.x, lz = hull.z - post.z, Ll = Math.hypot(lx, lz) || 1;
  const sx = -lz / Ll, sz = lx / Ll;
  const b = { x: post.x + sx * 6, z: post.z + sz * 6 };
  R.brea = await page.evaluate(PLACE, { ...b, fx: post.x, fz: post.z });
  await page.evaluate(frames, 20);
  await shoot(page, 'sonde-moored-brea', { eye: { x: post.x + sx * 34, y: post.y + 3.0, z: post.z + sz * 34 }, at: { x: (post.x + hull.x) / 2, y: (post.y + hull.y) / 2 + 1, z: (post.z + hull.z) / 2 }, fov: 50 }, 'the live Sonde moored at MOORING on its banded 18 m tether over its post, Brea 6 m off the post');
  await shoot(page, 'sonde-moored-level', { eye: { x: hull.x + sx * 11 + (lx / Ll) * 3, y: hull.y + 1.2, z: hull.z + sz * 11 + (lz / Ll) * 3 }, at: { x: hull.x, y: hull.y + 1.4, z: hull.z }, fov: 42 }, 'level with the hull, 11 m off its side (the lantern at the gondola\'s port bow)');
  // the quest's own cut: its spine on 'tether', then what the stake's prompt calls
  R.cut = await page.evaluate(() => {
    const G = window.__CTX__.hour2.glassLine, sp = G.spine, d = sp.serialize(), i = sp.stages.findIndex((s) => s.id === 'tether');
    d.started = true; d.done = false; d.idx = i;
    sp.stages.forEach((s, k) => { d.stages[s.id] = [k < i ? 'done' : k === i ? 'active' : 'pending', 0, 0, 0]; });
    sp.restore(d);
    G._cutTether();
    return { stage: sp.current()?.id, tether: G.stats.tether, sonde: window.__SONDE__.report() };
  });
  log(`cut: ${JSON.stringify(R.cut.tether)}`);
  await page.evaluate(() => window.__CTX__.engine.requestTimeScale('m3c', 3));
  await sleep(6500);   // ~20 s of sim
  const mid = await page.evaluate(() => window.__SONDE__.report());
  R.adrift20 = mid;
  await page.evaluate(() => window.__CTX__.engine.requestTimeScale('m3c', null));
  const H = mid.hull;
  R.brea2 = await page.evaluate(PLACE, { x: post.x + sx * 6, z: post.z + sz * 6, fx: H.x, fz: H.z });
  await page.evaluate(frames, 10);
  { const dx = H.x - post.x, dz = H.z - post.z, L = Math.hypot(dx, dz) || 1;
    await shoot(page, 'sonde-adrift', { eye: { x: H.x - (dz / L) * 16 - (dx / L) * 6, y: H.y + 2.0, z: H.z + (dx / L) * 16 - (dz / L) * 6 }, at: { x: H.x, y: H.y + 1.2, z: H.z }, fov: 44 }, 'the Sonde adrift downwind after the quest\'s cut, the tail of its cut line hanging'); }
  await page.evaluate(() => window.__CTX__.engine.requestTimeScale('m3c', 3));
  await page.waitForFunction(() => window.__SONDE__.rules.state === 'down', { timeout: 40000, polling: 200 }).catch(() => {});
  await page.evaluate(() => window.__CTX__.engine.requestTimeScale('m3c', null));
  R.end = await page.evaluate(() => ({ sonde: window.__SONDE__.report(), quest: window.__CTX__.hour2.glassLine.report() }));
  const e = R.end.sonde;
  R.verdict = {
    liveAtRing: !!R.moored.quest.sondeLive && !R.moored.standIn, fromRingM: R.moored.fromRing, tetherM: So.tetherM, altOverPost: So.altOverPost,
    cutByQuestOnLive: R.cut.tether?.live === true && R.cut.stage !== 'tether', driftOffDeg: e.drift?.offDeg ?? null, driftM: e.drift?.metres ?? null,
    downInS: e.downInS, wind: e.wind,
  };
  log(`sonde verdict ${JSON.stringify(R.verdict)}`);
}

/* ------------------------------------------------------------------ the session */
if (await portOpen(PORT)) { console.error(`port ${PORT} is in use`); process.exit(3); }
const slot = await takeMachineSlot({ who: `m3c ${PORT}`, log });
if (!slot.ok) { console.error('SLOT-NOT-AVAILABLE', slot.why); process.exit(4); }
const t0 = Date.now();
const watchdog = setTimeout(async () => { log('WATCHDOG'); await teardown(); out.errors.push('watchdog'); writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(out, null, 1)); process.exit(5); }, (BUDGET_S + 30) * 1000);
watchdog.unref();
try {
  mkdirSync(runDir, { recursive: true });
  vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
  for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
  if (!(await portOpen(PORT))) throw new Error(`vite did not open port ${PORT}`);
  installProfileCleanup();
  profile = profileDir(PORT);
  browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') out.console.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => out.console.push('pageerror: ' + String(e).slice(0, 300)));
  if (!ONLY || ONLY === 'yards') { try { await yards(page); } catch (e) { out.errors.push('yards: ' + String(e?.stack || e).slice(0, 600)); log('yards error', String(e?.message || e)); } }
  if (!ONLY || ONLY === 'sonde') { try { await sonde(page); } catch (e) { out.errors.push('sonde: ' + String(e?.stack || e).slice(0, 600)); log('sonde error', String(e?.message || e)); } }
} catch (e) { out.errors.push(String(e?.stack || e).slice(0, 600)); log('error', String(e?.message || e)); }
out.chromeSeconds = Math.round((Date.now() - t0) / 1000);
await teardown();
writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(out, null, 1));
log(`run dir ${runDir} (${out.chromeSeconds} s of Chrome)`);
