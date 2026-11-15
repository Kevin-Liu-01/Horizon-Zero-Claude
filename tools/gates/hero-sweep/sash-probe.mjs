/**
 * M1a regfix 2 (hero-anim, F15 / F19 / M1.2e): THE SASH PANELS' ANGLE, IN THE PAGE. One Chrome session (the shared slot,
 * the memory guard, Vite on --port under nice, 127.0.0.1) that stages the Frame Set's own F15 (the run) and F19 (the
 * lance heavy at contact) with tools/frames/page.mjs and reads, per sash panel, the angle of its chord (root -> hem tip,
 * the bones as drawn) BELOW HORIZONTAL (90 = hanging plumb, 0 = level), which way it points (fwd: + ahead of her, -
 * behind; side: + to her left), and its lowest segment's angle (the curl); on every animation frame of the pose and on
 * the frozen frame the film shoots. Optionally the M1.2e wind row (hero-sweep.mjs A-sweep-wind) on the same page.
 *
 *   node tools/gates/hero-sweep/sash-probe.mjs --port 5274 [--roots label=/abs/tree,...] [--variants file.json]
 *        [--frames F15,F19] [--wind] [--shots <dir outside the repo>] [--out <file outside the repo>] [--budget <s>]
 *
 * --roots: each tree is served in turn on the same port (a detached worktree at the anchor, then this tree); default
 * this tree. --variants: [{ name, set: { <panel class field>: value } }] applied in the page to the panel chains' class
 * (a value of null deletes the field) before its frames; default one variant, the tree as it is. Nothing is written
 * inside the repo.
 */
import puppeteer from 'puppeteer';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFrameSet } from '../../frames/frameset.mjs';
import { stageFrame, unstageFrame } from '../../frames/page.mjs';
import { SLOTS } from '../../frames/paths.mjs';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../../chrome-profile.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const utc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const log = (...a) => console.log(`[sash-probe ${new Date().toISOString().slice(11, 19)}]`, ...a);
const PORT = guardPort(flag('--port'));
if (PORT === 5173) throw new Error('port 5173 is the owner preview: never');
const BUDGET_S = Number(flag('--budget', 840));
const ROOTS = (flag('--roots') || `tree=${REPO}`).split(',').map((s) => { const i = s.indexOf('='); return { label: s.slice(0, i), dir: s.slice(i + 1) }; });
const VARIANTS = flag('--variants') ? JSON.parse(readFileSync(flag('--variants'), 'utf8')) : [{ name: 'as-is', set: {} }];
const SHOTS = flag('--shots');
const OUT = flag('--out');
for (const p of [SHOTS, OUT].filter(Boolean)) if (path.resolve(p).startsWith(REPO + path.sep)) throw new Error(`${p} is inside the repo`);
const WIND = args.includes('--wind');
const set = loadFrameSet();
const frames = (flag('--frames') || 'F15,F19').split(',').map((id) => set.frames.find((f) => f.id === id)).filter(Boolean);   // an id twice is staged twice
let windAssert = null;
if (WIND) windAssert = (await import('../hero-sweep.mjs')).GATES.find((g) => g.id === 'A-sweep-wind').assert;

/* ---- the guard and the slot (as film.mjs) */
function memory() {
  let free = 0, level = '?';
  try { free = Number(/free percentage:\s*(\d+)%/.exec(execFileSync('memory_pressure', ['-Q'], { encoding: 'utf8' }))?.[1] || 0); } catch { /* */ }
  try { level = execFileSync('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], { encoding: 'utf8' }).trim(); } catch { /* */ }
  return { free, level, ok: free >= 50 && level === '1' };
}
const SLOT = path.join(SLOTS, 'slot1');
let slotHeld = false;
const releaseSlot = () => { if (slotHeld) { try { rmSync(SLOT, { recursive: true, force: true }); } catch { /* */ } slotHeld = false; log('slot released'); } };
async function takeSlot(waitS = 1800) {
  const until = Date.now() + waitS * 1000;
  for (let said = 0; Date.now() < until; said++) {
    const m = memory();
    if (m.ok) {
      try { mkdirSync(SLOT); slotHeld = true; } catch { /* held */ }
      if (slotHeld) { writeFileSync(path.join(SLOT, 'owner.txt'), `int hero-anim ${process.pid} ${utc()}\n`); log(`slot taken (memory ${m.free} % free, level ${m.level})`); return true; }
    }
    if (!(said % 6)) log(`waiting: memory ${m.free} % free, level ${m.level}`);
    await sleep(5000);
  }
  return false;
}
const portOn = (p, host) => new Promise((r) => { const s = net.connect(p, host); s.once('connect', () => { s.destroy(); r(true); }); s.once('error', () => r(false)); });
const portOpen = async (p) => (await portOn(p, '127.0.0.1')) || (await portOn(p, '::1'));
let vite = null, browser = null, profile = null;
const stopVite = async () => { if (vite) { try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* */ } vite = null; for (let i = 0; i < 40 && (await portOpen(PORT)); i++) await sleep(250); } };
async function teardown() {
  try { await browser?.close(); } catch { try { browser?.process()?.kill('SIGKILL'); } catch { /* */ } }
  browser = null;
  await stopVite();
  if (profile) { try { disposeProfile(profile); } catch { /* */ } profile = null; }
  releaseSlot();
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, async () => { log(`${sig}: tearing down`); await teardown(); process.exit(130); });
process.on('exit', () => { releaseSlot(); if (vite) { try { process.kill(-vite.pid, 'SIGKILL'); } catch { /* */ } } });

/* ---- page code */
const APPLY = (setv) => {
  const an = window.__CTX__.player.animator;
  const S = new Set(an._chains.filter((c) => c.cls.name === 'panel').map((c) => c.cls));
  window.__panelCls0 ||= [...S].map((o) => [o, { ...o }]);
  for (const [o, o0] of window.__panelCls0) { for (const k of Object.keys(o)) delete o[k]; Object.assign(o, o0); }
  for (const o of S) for (const k in setv) { if (setv[k] === null) delete o[k]; else o[k] = setv[k]; }
  const o = [...S][0];
  return { classes: S.size, cls: Object.fromEntries(Object.entries(o).filter(([k]) => k !== 're')) };
};
/* the hero back to a clean idle before the wind row (as session.mjs RESET_HERO: a lance left in her hands by F19 lifted
 * the left panel in the row) */
const RESET = async () => {
  const C = window.__CTX__, p = C.player, cmb = C.combat, E = C.engine;
  C.input.keys.clear(); C.input.mouse.buttons = 0;
  try { if (p.crouching) p.setCrouch?.(false); } catch { /* */ }
  try { const m = cmb?.melee; if (m) { if (m.phase && m.phase !== 'idle') { try { m._endSwing?.(); } catch { /* */ } } m.active = false; m.phase = 'idle'; m.heavy = false; m.aimLock = null; if (m.stance !== 'holstered' && m.stance !== 'holster') m.holsterLance?.(true); } } catch { /* */ }
  try { p.velocity?.set?.(0, 0, 0); } catch { /* */ }
  if (cmb) { cmb._holsterT = 0; cmb._drawing = false; }
  E.requestTimeScale?.('studio', null);
  const w0 = performance.now();
  while (performance.now() - w0 < 2500) { if (!cmb?.weaponDrawn && !cmb?.melee?.lanceInHand && (cmb?.melee?.stance ?? 'holstered') === 'holstered') break; if (cmb) cmb._holsterT = 0; await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 50); }); }
  return { lance: !!cmb?.melee?.lanceInHand, stance: cmb?.melee?.stance ?? null, ms: Math.round(performance.now() - w0) };
};
const SAMPLER_ON = () => {
  const C = window.__CTX__, p = C.player, an = p.animator, E = C.engine;
  const V3 = p.position.constructor, r = new V3(), q = new V3(), u = new V3();
  const panels = an._chains.filter((c) => c.cls.name === 'panel');
  const nm = (c) => c.links[0].name.replace(/^dyn_|_01$/g, '');
  const read = () => {
    const H = p.heading, fx = Math.sin(H), fz = Math.cos(H), lx = fz, lz = -fx;   // forward, her left
    const o = {};
    for (const c of panels) {
      const N = c.N;
      c.links[0].bone.getWorldPosition(r);
      q.copy(c.tipOff).applyMatrix4(c.links[N - 1].bone.matrixWorld);
      c.links[N - 1].bone.getWorldPosition(u);
      const dx = q.x - r.x, dy = q.y - r.y, dz = q.z - r.z, h = Math.hypot(dx, dz);
      const ex = q.x - u.x, ey = q.y - u.y, ez = q.z - u.z;
      o[nm(c)] = {
        below: +(Math.atan2(-dy, h) * 180 / Math.PI).toFixed(1),
        fwd: +((dx * fx + dz * fz)).toFixed(3), left: +((dx * lx + dz * lz)).toFixed(3), len: +Math.hypot(dx, dy, dz).toFixed(3),
        hemBelow: +(Math.atan2(-ey, Math.hypot(ex, ez)) * 180 / Math.PI).toFixed(1),
        rootV: +Math.hypot(c.animVel[0], c.animVel[1], c.animVel[2]).toFixed(2), mvK: c.mvK == null ? null : +c.mvK.toFixed(2),
      };
    }
    return o;
  };
  window.__spRead = read;
  const S = window.__sp = { on: true, rows: [] };
  const mel = C.combat?.melee;
  const tick = () => {
    if (!S.on) return;
    S.rows.push({ t: +E.simTime.toFixed(3), v: +Math.hypot(p.velocity.x, p.velocity.z).toFixed(2), mel: mel ? (mel.active ? `${mel.heavy ? 'H' : 'L'}:${mel.phase}` : mel.stance) : null, ts: E.timeScale ?? null, panels: read() });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return panels.map(nm);
};
const SAMPLER_OFF = () => { const S = window.__sp; S.on = false; return { rows: S.rows, frozen: window.__spRead() }; };

const summarize = (fid, rec) => {
  const rows = rec.rows;
  const pick = fid === 'F15' ? rows.filter((r) => r.v > 2.5) : rows.filter((r) => r.mel && /^H:/.test(r.mel));
  const out = { frozen: rec.frozen, n: pick.length };
  const names = Object.keys(rec.frozen || {});
  for (const k of names) {
    const a = pick.map((r) => r.panels[k]?.below).filter(Number.isFinite).sort((x, y) => x - y);
    const f = pick.map((r) => r.panels[k]?.fwd).filter(Number.isFinite).sort((x, y) => x - y);
    const rv = pick.map((r) => r.panels[k]?.rootV).filter(Number.isFinite).sort((x, y) => x - y);
    const mk = pick.map((r) => r.panels[k]?.mvK).filter(Number.isFinite).sort((x, y) => x - y);
    const q = (b, x) => (b.length ? b[Math.min(b.length - 1, Math.floor(x * b.length))] : null);
    out[k] = { belowMin: q(a, 0), belowP10: q(a, 0.1), belowMed: q(a, 0.5), belowP90: q(a, 0.9), belowMax: q(a, 1), under20: a.length ? +(a.filter((x) => x < 20).length / a.length).toFixed(2) : null, fwdMed: q(f, 0.5), fwdMin: q(f, 0), fwdMax: q(f, 1), rootVMed: q(rv, 0.5), rootVMax: q(rv, 1), mvKMed: q(mk, 0.5) };
  }
  // the idle before the pose (standing root speed)
  const idle = rows.filter((r) => r.v < 0.05 && !(r.mel && /^[HL]:/.test(r.mel)));
  out.idleRootVMax = Math.max(0, ...idle.flatMap((r) => Object.values(r.panels).map((x) => x.rootV)));
  return out;
};

/* ---- run */
if (await portOpen(PORT)) { console.error(`port ${PORT} is in use`); process.exit(3); }
if (!(await takeSlot())) { console.error('SLOT-NOT-AVAILABLE'); process.exit(4); }
const result = { startedAt: utc(), port: PORT, roots: [] };
let t0 = 0;
try {
  installProfileCleanup();
  profile = profileDir(PORT);
  const vp = set.viewport || { width: 1600, height: 900, dpr: 1.25 };
  browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${vp.width},${vp.height + 40}`] });
  t0 = Date.now();
  for (const R of ROOTS) {
    if ((Date.now() - t0) / 1000 > BUDGET_S) { result.roots.push({ ...R, error: 'budget' }); continue; }
    const commit = (() => { try { return execFileSync('git', ['-C', R.dir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return '?'; } })();
    const dirty = (() => { try { return execFileSync('git', ['-C', R.dir, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim().length > 0; } catch { return null; } })();
    const RR = { ...R, commit, dirty, variants: [], console: [] };
    result.roots.push(RR);
    vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: R.dir, stdio: 'ignore', detached: true });
    for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
    if (!(await portOpen(PORT))) throw new Error(`vite did not open port ${PORT} for ${R.label}`);
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr || 1 });
    await page.evaluateOnNewDocument(() => {
      const Real = window.WebSocket;
      function Dead() { const t = new EventTarget(); t.readyState = 1; t.protocol = 'vite-hmr'; t.send = () => {}; t.close = () => { t.readyState = 3; };
        setTimeout(() => { const ev = new Event('open'); t.dispatchEvent(ev); if (typeof t.onopen === 'function') t.onopen(ev); }, 0); return t; }
      window.WebSocket = function (url, protocols) { const p = Array.isArray(protocols) ? protocols[0] : protocols;
        if (p === 'vite-hmr' || (typeof url === 'string' && url.includes('vite'))) return Dead(); return new Real(url, protocols); };
      window.WebSocket.prototype = Real.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
    });
    page.on('console', (m) => { if (m.type() === 'error') RR.console.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => RR.console.push('pageerror: ' + String(e).slice(0, 300)));
    await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction('window.__READY__ === true', { timeout: 240000, polling: 500 });
    await sleep(5000);
    log(`${R.label} (${commit}${dirty ? ', dirty' : ''}) booted`);
    const vars = /^anchor/.test(R.label) ? [{ name: 'anchor', set: {} }] : VARIANTS;
    for (const V of vars) {
      if ((Date.now() - t0) / 1000 > BUDGET_S) { RR.variants.push({ name: V.name, error: 'budget' }); continue; }
      const VR = { name: V.name, set: V.set, frames: {} };
      RR.variants.push(VR);
      try {
        VR.cls = await page.evaluate(APPLY, V.set || {});
        if (windAssert) {
          VR.windReset = await page.evaluate(RESET);
          await page.evaluate('__CTX__.input.enabled = true;');
          const w = await page.evaluate(windAssert);
          VR.wind = w;
          log(`${R.label}/${V.name} wind: ${w.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(w.detail?.fails || [])}`);
        }
        let fi = 0;
        for (const f of frames) {
          const key = VR.frames[f.id] ? `${f.id}#${++fi}` : f.id;
          await page.evaluate(SAMPLER_ON);
          await page.evaluate(stageFrame, f, { settleMs: 2600 });
          const rec = await page.evaluate(SAMPLER_OFF);
          if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${R.label}-${V.name}-${key.replace('#', '-')}.png`) }); }
          await page.evaluate(unstageFrame);
          VR.frames[key] = summarize(f.id, rec);
          const fr = VR.frames[key].frozen, sm = VR.frames[key];
          log(`${R.label}/${V.name} ${key}: ` + Object.entries(fr).map(([k, v]) => `${k} ${v.below} (fwd ${v.fwd}, hem ${v.hemBelow}; med ${sm[k]?.belowMed}, p10 ${sm[k]?.belowP10}, <20 ${sm[k]?.under20})`).join('; '));
        }
      } catch (e) { VR.error = String(e?.message || e).slice(0, 400); log(`${R.label}/${V.name} error: ${VR.error}`); }
    }
    await page.close();
    await stopVite();
  }
  result.chromeSeconds = Math.round((Date.now() - t0) / 1000);
} catch (e) {
  result.error = String(e?.stack || e).slice(0, 800);
} finally {
  await teardown();
  result.endedAt = utc();
  const txt = JSON.stringify(result, null, 1);
  if (OUT) writeFileSync(OUT, txt); else console.log(txt);
  log(`done in ${result.chromeSeconds ?? '?'} s of Chrome${OUT ? ': ' + OUT : ''}`);
}
