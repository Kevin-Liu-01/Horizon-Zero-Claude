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
 * jumps"). A death is played as a player plays it: the death card, RELOAD THE LAST ENTRY, and on (death-rule row).
 *
 * Live rows in the same session (the node --test rows are tools/gates/systems/*.test.mjs):
 *   brazier-dialog   at the cistern on New Game: the dialog's words are four of the bible's six, with a forecast
 *   brazier-refusal  STAGED on the frames page: a real Plumb spawned by the machines system, its AI state set to
 *                    suspicious (wary) and alert (hostile) at 25 m, suspicious at 80 m, patrol at 300 m; the dialog the Brazier
 *                    opens, read off the page after a real E hold, and the rules' mode (src/game/brazier)
 *   death-rule       if Brea dies in the run: the stage before, the stage after RELOAD THE LAST ENTRY, and where she
 *                    stands against the Brazier of her last rest
 *   save-reload      right after New Game: quit (the document unloaded), the game opened again in the same tab,
 *                    CONTINUE on the title: the same stage, satchel, place and hour as the record; the run plays on
 *   save-continue    the same after the run, on the run's newest record. A diagnosis is polled while the title is
 *                    awaited (see reloadContinue: a new tab got no animation frames and the title sat in 'idle')
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

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = guardPort(flag('--port'));
const FRAMES = (flag('--frames', 'F30,F20') || '').split(',').map((s) => s.trim()).filter(Boolean);
const BUDGET_S = Number(flag('--budget', 840));
const LABEL = flag('--label', 'systems-slice-hour');
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
const T0 = Date.now();
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
    hp: p ? Math.round(p.health) : null, ammo: C?.combat?.ammo?.hunter ?? null,
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

const keys = (page) => ({
  down: (k) => page.keyboard.down(k), up: (k) => page.keyboard.up(k),
  tap: async (k, ms = 120) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); },
});

async function walkTo(page, K, target, radius, { up = 0, maxS = 150, sprint = true } = {}) {
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
      await page.evaluate(face, target.x, target.z);
      await sleep(120);
    }
  } finally { if (sprint) await K.up('ShiftLeft'); await K.up('KeyW'); }
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

let lampsFight = null;
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
async function fight(page, K, kind, part, stageDone, { stand = 22, maxS = 100, all = false } = {}) {
  const t0 = Date.now();
  const stage0 = (await page.evaluate(probe)).stage;
  let fired = 0, aimed = false;
  await page.mouse.move(800, 450);
  await readyBow(page, K);
  // puppeteer throws on releasing a button it does not hold: every release is guarded
  const up = async (button) => { try { await page.mouse.up({ button }); } catch { /* not held */ } };
  const release = async () => { if (aimed) { await K.up('ShiftLeft'); await up('left'); await up('right'); aimed = false; } };
  try {
    for (;;) {
      const s = await page.evaluate(probe);
      if (s.state === 'dead' || s.state === 'death-menu' || s.deathCard) return { ok: false, why: 'died', fired };
      if (stageDone && s.stage !== stage0) return { ok: true, fired };
      if ((Date.now() - t0) / 1000 > maxS) return { ok: !!all, why: `${kind} ${part}: not done in ${maxS} s (${fired} arrows)`, fired };
      if (s.busy) { await release(); await playScene(page, K); continue; }
      // the whole line (all): every live one within 220 m is walked to; one target: the nearest within 70 m
      const T = (await page.evaluate(targetsOf, kind, part)).filter((t) => t.d < (all ? 220 : 70));
      if (!T.length) return { ok: !!all, why: all ? null : `no live ${kind} within 70 m`, fired };
      const t = T[0];
      if (t.d > stand + 6) {
        await release();
        const k = (t.d - stand) / t.d;
        await walkTo(page, K, { x: s.p.x + (t.x - s.p.x) * k, z: s.p.z + (t.z - s.p.z) * k }, 3, { maxS: 25 });
        continue;
      }
      if (t.d < 9 && kind !== 'peg') {
        await release();
        const k = stand / Math.max(1, t.d);
        await walkTo(page, K, { x: t.x + (s.p.x - t.x) * k, z: t.z + (s.p.z - t.z) * k }, 3, { maxS: 12 });
        continue;
      }
      if ((s.ammo ?? 0) < 1) { await release(); await readyBow(page, K); if ((await page.evaluate(probe)).ammo < 1) return { ok: false, why: 'no arrows to make', fired }; continue; }
      if (!aimed) { await page.mouse.down({ button: 'right' }); await sleep(380); await K.down('ShiftLeft'); aimed = true; }
      let a = await page.evaluate(aimPoint, t.x, t.y, t.z, 0.35);
      await page.mouse.down({ button: 'left' });
      const tD = Date.now();
      while (Date.now() - tD < 1000) {
        const now = (await page.evaluate(targetsOf, kind, part)).find((q) => q.i === t.i);
        if (!now) break;
        a = await page.evaluate(aimPoint, now.x, now.y, now.z, 0.35);
      }
      await up('left');
      fired++;
      shots.push({ kind, part, d: +t.d.toFixed(1), aimErr: a.err, hpBefore: t.hp });
      await sleep(380);
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
      // the Peg line: put out the lamps from 26 m before crossing (the optional count, the kill objective live)
      const f = await fight(page, K, 'peg', 'lamp', null, { stand: 18, maxS: 120, all: true });
      if (f.why === 'died') return f;
      lampsFight = f;
    }
    if (st === 'ditch') {
      // "come down on the Plumb through the lee ditch": crouched, at a walk (C toggles the crouch), as a player stalks
      // it; sprinting in stood her 9 m from it in the open and it killed her (f90d2b0, 7ae0fd0)
      const crouched = await page.evaluate(() => !!window.__CTX__.player.crouching);
      if (!crouched) await K.tap('KeyC');
      const r = await walkTo(page, K, s.anchor, Math.max(1.5, s.radius - 1), { sprint: false, maxS: 200 });
      if (await page.evaluate(() => !!window.__CTX__.player.crouching)) await K.tap('KeyC');
      await sleep(300);
      await playScene(page, K);
      return r;
    }
    const r = await walkTo(page, K, s.anchor, Math.max(1.5, s.radius - 1), { up: s.up });
    await sleep(300);
    await playScene(page, K);
    return r;
  }
  if (s.type === 'talk') {
    const r = await walkTo(page, K, s.anchor, 2.5);   // the prompt's radius is 3.0; round 1 walked into Mise at 2.0
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
    if (st === 'topple') return fight(page, K, 'plumb', 'vial', () => 'topple', { stand: 20, maxS: 110 });
    if (st === 'pry') return fight(page, K, 'plumb', 'bob', () => 'pry', { stand: 16, maxS: 90 });
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
async function reloadContinue(page, tag) {
  const before = await page.evaluate(() => {
    const C = window.__CTX__, s = C.progression.saves;
    const n = s.store.continueSlot();
    const rec = n ? s.store.latest(n) : null;
    return rec ? { slot: n, stage: rec.quest?.order?.at?.(-1)?.id ?? null, idx: rec.quest?.idx, started: !!rec.quest?.started, salt: rec.satchel['metal-shards'] ?? 0,
      hour: rec.hour, x: rec.position.x, z: rec.position.z, kind: rec.kind, reason: rec.reason, v: rec.v,
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
  if (await page.evaluate(() => window.__CTX__.menus.titleStage === 'press')) await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__CTX__?.menus?.titleStage === 'menu', { timeout: 30000, polling: 50 }).catch(() => {});
  await sleep(300);
  row.titleShot = await shot(page, `${tag}-title`);
  row.titleSave = await page.evaluate(() => document.querySelector('.mn-title-save')?.textContent ?? null);
  const hadContinue = await page.evaluate(() => { const b = [...document.querySelectorAll('.mn-title-item')].find((x) => /CONTINUE/.test(x.textContent)); if (!b || b.disabled) return false; b.click(); return true; });
  await page.waitForFunction(() => window.__CTX__?.state === 'playing', { timeout: 60000, polling: 50 }).catch(() => {});
  await sleep(1500);
  const after = await page.evaluate(() => {
    const C = window.__CTX__, sp = C.spine, p = C.player;
    return { state: C.state, idx: sp.idx, started: sp.started, stage: sp.order.at(-1)?.id ?? null, current: sp.current()?.id ?? null, salt: C.inventory.count('metal-shards'),
      hour: +C.environment.time.toFixed(3), x: +p.position.x.toFixed(3), z: +p.position.z.toFixed(3),
      note: document.querySelector('.cal-track-obj')?.textContent ?? null, loadedFrom: C.progression.saves.loadedFrom };
  });
  Object.assign(row, {
    after, hadContinue,
    pass: !!before && hadContinue && after.state === 'playing' && before.idx === after.idx && before.started === after.started && before.salt === after.salt
      && Math.abs(before.hour - after.hour) < 0.05 && Math.hypot(before.x - after.x, before.z - after.z) < 1.0,
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
  {
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
      try {
        const staged = await page.evaluate(stageFrame, f, { settleMs: 2600 });
        const buf = await page.screenshot({ type: 'png' });
        await sharp(buf).resize(1600, 900, { fit: 'fill' }).png().toFile(path.join(runDir, `${id}.png`));
        await page.evaluate(unstageFrame);
        report.frames.push({ id, ok: true, file: `${id}.png`, standIns: staged.standIns ?? [] });
        log(`${id} filmed`);
      } catch (e) { report.frames.push({ id, ok: false, error: String(e?.message || e).slice(0, 300) }); }
    }
    /* brazier-refusal, STAGED (see the header): a real Plumb at 25 m and 80 m in three AI states */
    try {
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
            // hold the AI state for the whole E press (its own brain would otherwise walk it on)
            const hold = setInterval(() => { m.state = state; }, 16);
            m.state = state;
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
          await page.evaluate(() => clearInterval(window.__holdState));
          cases.push(c);
        }
      }
      const six = 'THE LAMPS ARE UP. NO REST HERE.';
      const want = (c) => (c.dist <= 60 && (c.state === 'suspicious' || c.state === 'alert'));
      report.rows['brazier-refusal'] = { staged: true, ...prep, cases,
        pass: cases.length === 4 && cases.every((c) => (want(c) ? c.mode === 'refused' && c.page.text.includes(six) : c.mode === 'rest' && !c.page.text.includes(six))) };
      log(`brazier-refusal: ${cases.map((c) => `${c.dist}m ${c.state} ${c.lamp} -> ${c.mode}`).join('; ')}`);
    } catch (e) { report.rows['brazier-refusal'] = { error: String(e?.message || e).slice(0, 300) }; }
    await page.close();
  }

  /* ---- B. the run, from the real title, in a clean profile context ---- */
  const bctx = await browser.createBrowserContext();
  const page = await bctx.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.25 });
  page.on('console', (m) => { if (m.type() === 'error') report.console.push({ at: 'run', text: m.text().slice(0, 300) }); });
  page.on('pageerror', (e) => report.console.push({ at: 'run', text: `pageerror: ${String(e).slice(0, 300)}` }));
  const K = keys(page);
  await page.evaluateOnNewDocument(`window.__aimPoint = ${aimPoint.toString()};`);
  await page.evaluateOnNewDocument(() => { window.__raf = 0; const tick = () => { window.__raf++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__CTX__?.state === 'title' && window.__CTX__?.menus?.titleStage === 'press', { timeout: 240000, polling: 100 });
  await sleep(500);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__CTX__?.menus?.titleStage === 'menu', { timeout: 60000, polling: 50 });
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll('.mn-title-item')].find((x) => /NEW GAME/.test(x.textContent))?.click());
  await page.waitForSelector('.mn-diff', { timeout: 20000 });
  await page.evaluate(() => document.querySelector('.mn-diff').click());
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

  let last = null, tries = 0, deaths = 0;
  while (spent() < BUDGET_S - 150) {
    const s = await page.evaluate(probe);
    if (s.state === 'dead' || s.state === 'death-menu' || s.deathCard) {
      // played as a player plays it: the death card, then RELOAD THE LAST ENTRY (the one death rule, M1.6f)
      deaths++;
      const pre = await page.evaluate(() => { const C = window.__CTX__; return { stage: C.spine.current()?.id ?? null, idx: C.spine.idx, reached: C.spine.order.map((o) => o.id), lastRest: C.braziers.lastRest, salt: C.inventory.count('metal-shards') }; });
      await page.waitForFunction(() => !!document.querySelector('.mn-death.show .mn-death-opt'), { timeout: 15000, polling: 100 }).catch(() => {});
      await sleep(600);
      const card = await page.evaluate(() => ({ title: document.querySelector('.mn-death-title')?.textContent ?? null, opts: [...document.querySelectorAll('.mn-death-opt b')].map((b) => b.textContent) }));
      const cardShot = await shot(page, `d${deaths}-death-card`);
      if (deaths > 2) { report.stoppedAt = s.stage; report.why = `Brea died ${deaths} times`; break; }
      const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('.mn-death-opt')].find((x) => /RELOAD THE LAST ENTRY/.test(x.textContent)); if (!b) return false; b.click(); return true; });
      await page.waitForFunction(() => window.__CTX__?.state === 'playing', { timeout: 20000, polling: 100 }).catch(() => {});
      await sleep(1500);
      const post = await page.evaluate(() => { const C = window.__CTX__, P = C.player.position, R = C.braziers.lastRest; return { stage: C.spine.current()?.id ?? null, idx: C.spine.idx, reached: C.spine.order.map((o) => o.id), state: C.state, hp: Math.round(C.player.health), salt: C.inventory.count('metal-shards'), fromRest: R ? +Math.hypot(P.x - R.x, P.z - R.z).toFixed(2) : null, rest: R?.id ?? null }; });
      const row = { death: deaths, at: s.stage, card, clicked, pre, post, cardShot, shot: await shot(page, `d${deaths}-stood-up`),
        pass: clicked && post.state === 'playing' && post.idx === pre.idx && post.fromRest != null && post.fromRest < 3 };
      (report.rows['death-rule'] ||= []).push(row);
      log(`death ${deaths} at ${s.stage}: stood up ${post.fromRest} m from ${post.rest}, stage ${pre.stage} -> ${post.stage}`);
      last = null; tries = 0;
      continue;
    }
    if (!s.stage && !s.report?.started) { report.stoppedAt = null; report.why = 'no quest running (the continued game did not restore it)'; break; }
    if (!s.stage || s.stage === 'reward') { report.stoppedAt = 'reward'; report.why = 'quest done'; break; }
    if (s.busy) { await playScene(page, K); continue; }
    if (s.stage === last) tries++; else tries = 0;
    if (tries > 1) { report.stoppedAt = s.stage; report.why = report.beats.at(-1)?.why || 'no progress'; break; }
    last = s.stage;
    const b0 = Date.now();
    log(`beat ${s.stage} (${s.type})`);
    const r = await beat(page, K, s);
    const after = await page.evaluate(probe);
    const row = { stage: s.stage, type: s.type, ok: after.stage !== s.stage, seconds: +((Date.now() - b0) / 1000).toFixed(1), ...r, note: s.note, hp: after.hp };
    if (s.stage === 'cross' && lampsFight) row.lamps = lampsFight;
    if (row.ok) row.shot = await shot(page, `b-${String(report.beats.length + 2).padStart(2, '0')}-${s.stage}`);
    report.beats.push(row);
    if (r.why === 'died') continue;
    if (!row.ok && r.ok === false) { report.stoppedAt = s.stage; report.why = r.why; break; }
  }
  if (!report.stoppedAt) { report.stoppedAt = (await page.evaluate(probe)).stage; report.why = 'Chrome budget'; }
  const fin = await page.evaluate(probe);
  report.spine = fin.report;
  report.shots = shots;
  report.anchors = await page.evaluate(() => window.__CTX__.systemsGame.A);
  report.stopShot = await shot(page, 'b-stop');

  // save-continue row: what the store holds, then QUIT (the document is unloaded), the same tab opened again on the
  // game, CONTINUE on the title: the same stage, satchel, place and hour
  report.rows['save-continue'] = await reloadContinue(page, 'c');
  await bctx.close();
} catch (e) {
  report.error = String(e?.stack || e).slice(0, 1200);
  log('error', report.error);
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
