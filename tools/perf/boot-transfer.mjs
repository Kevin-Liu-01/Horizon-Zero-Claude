#!/usr/bin/env node
/**
 * THE FIRST LOAD, MEASURED IN THE BUILT GAME (TECH §9: first load <= 60 MB; the cap means the bytes fetched before
 * she is under control). Row `P-boot-transfer`:
 *
 *   tools/perf/clean-measure.sh <commit> <port> node tools/perf/boot-transfer.mjs --port <port> [--continues stall,plumb-2]
 *
 * It builds the game (vite build), serves dist/ with vite preview on the lane port, takes the one Chrome slot, and in a
 * fresh profile with the HTTP cache disabled (every byte goes over the wire, CDP Network: requestWillBeSent wallTime,
 * loadingFinished encodedDataLength) plays each case from page load:
 *
 *   new-game          the title, a key, NEW GAME, the first difficulty;
 *   continue:<from>   a save written first (tools/gates/systems/first-hour-fixtures.mjs fixture(2, { from }): 'stall' is
 *                     inside Ninewalls in the Holds with the kit, 'plumb-2' on the Holds' terraces by the herd; 'seal-1'
 *                     is built here from 'stall': "The Scar" one stage on (the Screed stalled), the checkpoint the stall
 *                     writes, with her SEAL1_AHEAD m ahead of the re-spawned Screed on its line, where it charges on its
 *                     first step), the page opened again, then the title, a key, CONTINUE and the marked slot.
 *
 * Input is a player's: the key on the title is a key press and every menu item is clicked with the mouse (puppeteer's
 * element click: pointer and mouse events), so the audio context and the boot bank start where a player's would (the
 * first click). Before 2026-11-20 the row clicked menu items through the DOM (no pointer events): the boot bank then
 * started at game-start, and 3.5 MB of boot audio fell after control.
 *
 * Control is the frame two frames after `game-start` (the state 'playing', as tools/perf/exit-bar.mjs times it). For
 * each case: the requests started before control (files, bytes), whether any of them is a deferred file (the game's
 * ledger's own deferred set: the audio's late bank, never before control, and the Holds people streamed by her distance,
 * never in a New Game's), the late bank's log after control
 * (GameAudio.lateAudit(): started, every set decoded, first asks and leads, any miss), the presented frames over 33 and
 * 50 ms in the WATCH_S after control, and (New Game) the earliest a first-hour cue can be asked: the sprint time from the
 * spawn to the nearest ground each late place's weight reaches 0.01 (the director's own weights), against the time its
 * rows were decoded.
 *
 * The deferred set is the shipped ledger's (tools/tier0/budgets.mjs deferredFiles over budgets.json shipped.deferred),
 * so the row checks the very files the ledger leaves out of the first load. The report lists every file fetched before
 * control and every shipped public/ file that was not (the ledger's first load counts both).
 *
 * PASS: every case <= 60 MB before control (decimal megabytes, 60e6 bytes: the unit the shipped ledger grades the
 * first load in too) and no deferred file requested before control; the late bank starts after control and decodes
 * whole; New Game: no late set asked before its decode and every place's rows decoded before she can reach it; every
 * case: no late ONE-SHOT asked before its decode, and every tell asked for in the watch (the Screed's charge, the
 * trample's and the Plumb's wind-ups: each `playAt` of a tell set) had its buffer decoded; Continue at 'seal-1': the
 * Screed charged and its charge got a voice. A Continue's late LOOPS (beds and idles fading in in its
 * first second) are reported with their lateness, not graded.
 *
 * Writes <runs>/<UTC stamp>-<commit>-boot-transfer/report.json (outside the repo). Never port 5173.
 */
import puppeteer from 'puppeteer';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../chrome-profile.mjs';
import { takeMachineSlot, releaseMachineSlot } from '../chrome-slot.mjs';
import { MANIFEST, LATE_BYTES, BOOT_BYTES } from '../../src/audio/manifest.js';
import { fixture } from '../gates/systems/first-hour-fixtures.mjs';
import { QuestSpine } from '../../src/game/quest/spine.js';
import { SCAR_STAGES, SCAR_ID, SCAR_REWARD, FAIL_SOFT, TRUE_GROUND_ID, TRUE_GROUND_STAGES, TRUE_GROUND_REWARD } from '../../src/game/quest/scar-plan.js';
import { CENTRE as NW_CENTRE, OUTER_R as NW_OUTER_R } from '../../src/world/settlements/ninewalls-layout.js';
import { heightAt } from '../../src/world/island/recipe.js';
import { questStrings } from '../gates/systems/lib.mjs';
import { deferredFiles, loadBudgets } from '../tier0/budgets.mjs';
import { listFiles, sizeOf } from '../tier0/lib/files.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = guardPort(flag('--port'));
if (!PORT || PORT === 5173) throw new Error('boot-transfer: --port <lane port> is required (never 5173)');
const CONTINUES = flag('--continues', 'stall,plumb-2').split(',').map((s) => s.trim()).filter(Boolean);
const WATCH_S = Number(flag('--watch-s', 12));
const CAP_BYTES = 60e6;
const SPRINT_MS = 8.2;
const SEAL1_AHEAD = 15;     // m ahead of the re-spawned Screed on its line (its charge band is 7-24 m, src/instruments/kinds/screed-rules.js)
/** The tell sets: a blow's warning (src/audio/m2/cues.js `tell`, the attack table's wind-ups; all boot rows). */
const TELLS = new Set(['screed/charge', 'tiller/trample', 'plumb/bob', 'peg/rush', 'inst/windup']);
const LOOP_SET = new Set(MANIFEST.filter((r) => r.loop).map((r) => r.set));      // her sprint (m/s; src/audio/audio.js footstep scale, A28b canon band top)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const utc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const log = (...a) => console.log(`[boot-transfer ${new Date().toISOString().slice(11, 19)}]`, ...a);
const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return null; } };

const commit = git('rev-parse', '--short', 'HEAD');
const dirty = (git('status', '--porcelain', '--untracked-files=no') || '').split('\n').filter(Boolean);
const stamp = utc().replace(/[-:]/g, '');
const OUT = path.join(os.homedir(), '.calima-r5/review/runs', `${stamp}-${commit}-boot-transfer`);
if (path.resolve(OUT).startsWith(REPO + path.sep)) throw new Error('the run directory goes outside the repo');
mkdirSync(OUT, { recursive: true });
const LEDGER = await deferredFiles(REPO, loadBudgets(REPO).shipped.deferred || []);
if (LEDGER.errors.length) throw new Error(`boot-transfer: the ledger's deferred set: ${LEDGER.errors.join('; ')}`);
/** '/audio/holds/x.ogg' -> the module that defers it */
const DEFERRED = new Map([...LEDGER.files].map(([f, mod]) => [f.replace(/^public/, ''), mod]));
/** the late bank's files ('control': never before control in any case); the rest are 'region' (never in New Game's) */
const AFTER_CONTROL = new Set([...LEDGER.files].filter(([f]) => LEDGER.when.get(f) === 'control').map(([f]) => f.replace(/^public/, '')));
const SHIPPED = listFiles(REPO, ['public']).map((f) => ({ path: f.replace(/^public/, ''), bytes: sizeOf(REPO, f) }));
const run = {
  row: 'P-boot-transfer', tool: 'tools/perf/boot-transfer.mjs', commit, clean: dirty.length === 0, dirty: dirty.slice(0, 20),
  tree: process.env.CLEAN_TREE || REPO, via: process.env.CLEAN_TREE ? 'tools/perf/clean-measure.sh' : 'in place', port: PORT, startedAt: utc(),
  capBytes: CAP_BYTES, ledger: { deferredFiles: DEFERRED.size, afterControlFiles: AFTER_CONTROL.size, deferredFrom: [...new Set(DEFERRED.values())], lateBytes: LATE_BYTES, bootAudioBytes: BOOT_BYTES,
    shippedFiles: SHIPPED.length, shippedBytes: SHIPPED.reduce((a, f) => a + f.bytes, 0) }, cases: [], console: [],
};
const save = () => writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(run, null, 1));

function portFree(p) { return new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(p, '127.0.0.1'); }); }
let server = null;
function stopServer() { if (!server) return; try { process.kill(-server.pid, 'SIGTERM'); } catch { /* */ } server = null; }
process.on('exit', stopServer);

/** In the page from its first script: the wall-clock moment of `game-start` and of control (two frames later). */
const hookControl = () => {
  const iv = setInterval(() => {
    const C = window.__CTX__;
    if (!C?.events?.on) return;
    clearInterval(iv);
    C.events.on('game-start', () => {
      if (window.__gameStartWall) return;
      window.__gameStartWall = Date.now();
      requestAnimationFrame(() => requestAnimationFrame(() => { window.__controlWall = Date.now(); }));
    });
    // the tells: every playAt of a tell set, and whether it got a voice (a set not decoded gets none)
    window.__tells = [];
    window.__events = { 'screed-charge': 0, 'screed-engage': 0 };
    for (const n of Object.keys(window.__events)) C.events.on(n, () => { window.__events[n]++; });
    const wrap = setInterval(() => {
      const A = C.audio;
      if (!A?.playAt) return;
      clearInterval(wrap);
      const orig = A.playAt.bind(A);
      const T = new Set(['screed/charge', 'tiller/trample', 'plumb/bob', 'peg/rush', 'inst/windup']);
      A.playAt = (set, ...rest) => {
        const v = orig(set, ...rest);
        if (T.has(set) && window.__tells.length < 64) window.__tells.push({ set, voiced: !!v, wall: Date.now(), decoded: !!A.bank?.peek?.(set) });
        return v;
      };
    }, 2);
  }, 2);
};

/** In the page after control: presented frames for `s` seconds, and the late bank's log at the end. */
const watchAfter = async (s) => {
  const raf = () => new Promise((r) => requestAnimationFrame((t) => r(t)));
  const iv = [];
  let last = await raf();
  const end = last + s * 1000;
  while (last < end) { const t = await raf(); iv.push(t - last); last = t; }
  const A = window.__CTX__.audio;
  return { frames: iv.length, over33: iv.filter((v) => v > 33.4).length, over50: iv.filter((v) => v > 50).length, worstMs: +Math.max(...iv).toFixed(1),
    late: A?.lateAudit ? A.lateAudit() : null, bankLate: !!A?.bankLate, ctxState: A?.ac?.state ?? null,
    tells: (window.__tells || []).slice(), events: { ...(window.__events || {}) } };
};

/** In the page: how soon she can reach each late place from where she stands (the director's own weights). */
const reachOf = (sprint) => {
  const C = window.__CTX__, H = C.audio?.hour, p = C.player;
  if (!H || !p) return null;
  const x0 = p.position.x, z0 = p.position.z;
  const best = { holds: null, ninewalls: null, scar: null, malpais: null };
  const probe = { position: { x: 0, y: 0, z: 0 } };
  for (let r = 0; r <= 900; r += 4) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / 4));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 2 * Math.PI;
      probe.position.x = x0 + Math.cos(a) * r; probe.position.z = z0 + Math.sin(a) * r;
      H._zoneTargets(probe);
      for (const place of Object.keys(best)) if (best[place] == null && H.placeWeight(place) > 0.01) best[place] = r;
    }
    if (Object.values(best).every((v) => v != null)) break;
  }
  H._zoneTargets(p);
  const out = {};
  for (const [k, d] of Object.entries(best)) out[k] = { m: d, sprintS: d == null ? null : +(d / sprint).toFixed(1) };
  return { from: { x: +x0.toFixed(1), z: +z0.toFixed(1) }, places: out };
};

/** A player's click on the first element under `sel` whose text matches `re` (puppeteer's element click: mouse events). */
async function clickOn(page, sel, re = null) {
  for (let i = 0; i < 100; i++) {
    for (const h of await page.$$(sel)) {
      const ok = await h.evaluate((el, src) => {
        if (src && !new RegExp(src).test(el.textContent)) return false;
        if (el.disabled) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }, re ? re.source : null);
      if (ok) { await h.click(); return true; }
    }
    await sleep(100);
  }
  throw new Error(`no clickable ${sel}${re ? ` ${re}` : ''}`);
}

/** "The Scar" walked to the stage after `through` and one more event list (the save the next stage's checkpoint writes). */
function scarAt(through, more) {
  const scar = new QuestSpine({ strings: questStrings(SCAR_ID), id: SCAR_ID, stages: SCAR_STAGES, reward: SCAR_REWARD, triangles: {}, closingCard: null, failSoft: FAIL_SOFT }).start();
  const probe = { near: () => false, aim: () => false, bearing: () => 0 };
  const EV = { walk: [['region-enter', { region: 'holds' }]], herd: [['herd-lee', { inShadow: true }]], 'plumb-2': [['plumb-topple', { kind: 'plumb' }]],
    barbed: [['ammo-crafted', { ammo: 'hardpoint', n: 6 }]], oro: [['talk', 'oro'], ['scene-done', { scene: 'hand-over', exit: true }]], stall: [['screed-stalled', {}]] };
  for (const id of [...through, ...more]) for (const [ev, e] of EV[id]) { if (ev === 'talk') scar.talk(e); else scar.notify(ev, e); scar.update(0.1, probe); }
  const at = scar.current()?.id;
  const want = SCAR_STAGES[through.length + more.length]?.id;
  if (at !== want) throw new Error(`seal-1 record: "The Scar" is at ${at}, not ${want}`);
  const tg = new QuestSpine({ strings: questStrings(TRUE_GROUND_ID), id: TRUE_GROUND_ID, stages: TRUE_GROUND_STAGES, reward: TRUE_GROUND_REWARD, triangles: {}, closingCard: null });
  return { [SCAR_ID]: scar.serialize(), [TRUE_GROUND_ID]: tg.serialize() };
}

/** The record a Continue reads: the fixture's, or (seal-1) the stall record one stage on with her on the Screed's line. */
function recordFor(from) {
  if (from !== 'seal-1') return fixture(2, { from });
  const r = fixture(2, { from: 'stall' });
  // hour.js _spawn('screed'): OUTER_R + 14 m from the centre at bearing 45 degrees, heading for the centre
  const rr = NW_OUTER_R + 14, b = Math.PI / 4;
  const at = { x: NW_CENTRE.x + Math.sin(b) * rr, z: NW_CENTRE.z - Math.cos(b) * rr };
  const dx = NW_CENTRE.x - at.x, dz = NW_CENTRE.z - at.z, d = Math.hypot(dx, dz);
  const x = at.x + (dx / d) * SEAL1_AHEAD, z = at.z + (dz / d) * SEAL1_AHEAD;
  const heading = Math.atan2(-dx, -dz);
  r.reason = 'the-scar:stage:seal-1';
  r.position = { x: +x.toFixed(3), y: +(heightAt(x, z) + 0.05).toFixed(3), z: +z.toFixed(3), yaw: +heading.toFixed(3), pitch: 0, heading: +heading.toFixed(3) };
  r.areas = { ...r.areas, quests: scarAt(['walk', 'herd', 'plumb-2', 'barbed', 'oro'], ['stall']) };
  return r;
}

async function title(page) {
  await page.waitForFunction(() => window.__CTX__?.state === 'title' && window.__CTX__?.menus?.titleStage === 'press', { timeout: 180000, polling: 50 });
  await sleep(400);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__CTX__?.menus?.titleStage === 'menu', { timeout: 60000, polling: 25 });
  await sleep(300);
}

async function oneCase(browser, kind, from) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.25 });
  page.on('console', (m) => { if (m.type() === 'error') run.console.push({ case: kind, text: m.text().slice(0, 300) }); });
  page.on('pageerror', (e) => run.console.push({ case: kind, text: 'pageerror: ' + String(e).slice(0, 300) }));
  const cdp = await page.target().createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.evaluateOnNewDocument(hookControl);
  const rec = { case: kind + (from ? `:${from}` : ''), pass: null };
  if (kind === 'continue') {
    // the save first (its own page load, not measured), then the page opened again
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__CTX__?.state === 'title' && !!window.__CTX__?.progression?.saves?.store, { timeout: 180000, polling: 100 });
    const save = { ...recordFor(from), savedAt: Date.now() };
    const wrote = await page.evaluate((r) => { const st = window.__CTX__.progression.saves.store; st.setActive(1); return st.write(r); }, save);
    if (!wrote?.ok) throw new Error(`fixture ${from} not written: ${JSON.stringify(wrote)}`);
    rec.save = { from, position: save.position, hour: save.hour };
    await page.goto('about:blank', { waitUntil: 'load', timeout: 30000 });
  }
  const reqs = new Map();
  const onSent = (e) => { if (!reqs.has(e.requestId)) reqs.set(e.requestId, { url: e.request.url, wall: e.wallTime * 1000, bytes: 0, done: false }); };
  const onDone = (e) => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength || 0; r.done = true; } };
  const onFail = (e) => { const r = reqs.get(e.requestId); if (r) { r.failed = e.errorText; r.done = true; } };
  cdp.on('Network.requestWillBeSent', onSent);
  cdp.on('Network.loadingFinished', onDone);
  cdp.on('Network.loadingFailed', onFail);
  const tNav = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await title(page);
  if (kind === 'new-game') {
    await clickOn(page, '.mn-title-item', /NEW GAME/);
    await clickOn(page, '.mn-diff');
  } else {
    await clickOn(page, '.mn-title-item', /CONTINUE/);
    await clickOn(page, '.gs-slot.cont .gs-slot-go');
  }
  await page.waitForFunction(() => window.__CTX__?.state === 'playing' && !!window.__controlWall, { timeout: 60000, polling: 10 });
  const { gs, ctl } = await page.evaluate(() => ({ gs: window.__gameStartWall, ctl: window.__controlWall }));
  const w = await page.evaluate(watchAfter, WATCH_S);
  // where she stands now and how soon she can reach each late place
  rec.where = await page.evaluate(() => { const C = window.__CTX__, p = C.player.position; return { x: +p.x.toFixed(1), z: +p.z.toFixed(1), region: C.regions?.tracker?.current ?? null }; });
  if (kind === 'new-game') rec.reach = await page.evaluate(reachOf, SPRINT_MS);
  cdp.off('Network.requestWillBeSent', onSent);
  cdp.off('Network.loadingFinished', onDone);
  cdp.off('Network.loadingFailed', onFail);

  const all = [...reqs.values()];
  const pathOf = (u) => { try { return decodeURIComponent(new URL(u).pathname); } catch { return u; } };
  const before = all.filter((r) => r.wall < ctl);
  const after = all.filter((r) => r.wall >= ctl);
  const sum = (a) => a.reduce((s, r) => s + r.bytes, 0);
  const deferredBefore = before.filter((r) => DEFERRED.has(pathOf(r.url))).map((r) => ({ file: pathOf(r.url), msBeforeControl: Math.round(ctl - r.wall) }));
  const deferredAfter = after.filter((r) => AFTER_CONTROL.has(pathOf(r.url)));
  const firstDeferred = deferredAfter.length ? Math.min(...deferredAfter.map((r) => r.wall)) : null;
  const byKind = {};
  for (const r of before) { const ext = (pathOf(r.url).match(/\.([a-z0-9]+)$/i)?.[1] || 'other').toLowerCase(); byKind[ext] = (byKind[ext] || 0) + r.bytes; }
  rec.timing = { navToGameStartS: +((gs - tNav) / 1000).toFixed(2), gameStartToControlMs: ctl - gs };
  const got = new Set(before.map((r) => pathOf(r.url)));
  const notYet = SHIPPED.filter((f) => !got.has(f.path));
  const byDir = {};
  for (const f of notYet) { const k = f.path.split('/').slice(0, 3).join('/'); byDir[k] = (byDir[k] || 0) + f.bytes; }
  rec.shippedNotBeforeControl = { files: notYet.length, mb: +(sum(notYet) / 1e6).toFixed(2), deferred: notYet.filter((f) => DEFERRED.has(f.path)).length,
    byDirMb: Object.fromEntries(Object.entries(byDir).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / 1e6).toFixed(3)])),
    list: notYet.sort((a, b) => b.bytes - a.bytes).map((f) => `${f.path} ${f.bytes}${DEFERRED.has(f.path) ? ' (deferred)' : ''}`) };
  rec.beforeControl = {
    list: before.map((r) => `${pathOf(r.url)} ${r.bytes}${r.done ? '' : ' (in flight)'}`),
    files: before.length, bytes: sum(before), mb: +(sum(before) / 1e6).toFixed(2), mib: +(sum(before) / 1048576).toFixed(2),
    stillInFlightAtControl: before.filter((r) => !r.done).length, failed: before.filter((r) => r.failed).length,
    byKindMb: Object.fromEntries(Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / 1e6).toFixed(2)])),
    deferredFiles: deferredBefore.length, deferred: deferredBefore.slice(0, 10),
    afterControlFiles: deferredBefore.filter((d) => AFTER_CONTROL.has(d.file)).length,
    regionFiles: deferredBefore.filter((d) => !AFTER_CONTROL.has(d.file)).length,
  };
  rec.afterControl = {
    seconds: WATCH_S, files: after.length, mb: +(sum(after) / 1e6).toFixed(2),
    deferredFiles: deferredAfter.length, deferredMb: +(sum(deferredAfter) / 1e6).toFixed(3),
    firstDeferredMsAfterControl: firstDeferred == null ? null : Math.round(firstDeferred - ctl),
    lastDeferredMsAfterControl: deferredAfter.length ? Math.round(Math.max(...deferredAfter.map((r) => r.wall)) - ctl) : null,
  };
  const L = w.late;
  rec.frames = { frames: w.frames, over33: w.over33, over50: w.over50, worstMs: w.worstMs, audioContext: w.ctxState };
  rec.late = L ? { state: L.state, rows: L.rows, decoded: L.decoded, megabytes: L.megabytes, startedS: L.startedS, lastDecodedS: L.lastDecodedS, doneS: L.doneS,
    nearKinds: L.nearKinds ?? null, asked: L.asked, missed: L.missed, missedOneShots: L.missed.filter((m) => !LOOP_SET.has(m.set)),
    missedLoops: L.missed.filter((m) => LOOP_SET.has(m.set)), minLeadS: L.minLeadS, asks: L.sets.filter((s) => s.asks > 0) } : null;
  rec.tells = { events: w.events, played: w.tells.length, silent: w.tells.filter((t) => !t.voiced).length,
    log: w.tells.slice(0, 16).map((t) => ({ set: t.set, voiced: t.voiced, decoded: t.decoded, msAfterControl: t.wall - ctl })) };
  if (rec.reach && L) {
    const placeOf = {};
    const { MANIFEST } = await import('../../src/audio/manifest.js');
    for (const r of MANIFEST) if (r.load === 'late') placeOf[r.set] = r.place;
    rec.leadByPlace = {};
    for (const [place, v] of Object.entries(rec.reach.places)) {
      const sets = L.sets.filter((s) => placeOf[s.set] === place);
      const dec = sets.every((s) => s.decodedS != null) ? Math.max(...sets.map((s) => s.decodedS)) : null;
      rec.leadByPlace[place] = { reachS: v.sprintS, decodedS: dec, leadS: v.sprintS != null && dec != null ? +(v.sprintS - dec).toFixed(1) : null };
    }
  }
  const late = rec.late;
  rec.checks = {
    underCap: rec.beforeControl.bytes <= CAP_BYTES,
    // New Game: no deferred file at all before control; a Continue: none of the late bank's (a Continue inside a region
    // may stream that region's files before control: they are in its bytes, under the cap)
    noDeferredBeforeControl: kind === 'new-game' ? rec.beforeControl.deferredFiles === 0 : rec.beforeControl.afterControlFiles === 0,
    lateAfterControl: !!late && late.startedS != null && late.startedS >= 0 && rec.afterControl.firstDeferredMsAfterControl != null && rec.afterControl.firstDeferredMsAfterControl >= 0,
    lateWhole: !!late && late.state === 'done' && late.decoded === late.rows && rec.afterControl.deferredFiles === AFTER_CONTROL.size,
    noOneShotMiss: !!late && late.missedOneShots.length === 0,
    tellsDecoded: w.tells.every((t) => t.decoded),
  };
  if (from === 'seal-1') rec.checks.chargeHeard = w.events['screed-charge'] > 0 && w.tells.some((t) => t.set === 'screed/charge' && t.voiced);
  if (kind === 'new-game') {
    rec.checks.noMiss = !!late && late.missed.length === 0;
    rec.checks.decodedBeforeReach = !!rec.leadByPlace && Object.values(rec.leadByPlace).every((v) => v.leadS == null || v.leadS > 0) && Object.values(rec.leadByPlace).some((v) => v.leadS != null);
  }
  rec.pass = Object.values(rec.checks).every(Boolean);
  await page.close();
  return rec;
}

try {
  if (!args.includes('--no-build')) {
    log('vite build');
    execFileSync('nice', ['-n', '10', 'npx', 'vite', 'build', '--logLevel', 'error'], { cwd: REPO, stdio: 'inherit' });
  }
  if (!(await portFree(PORT))) throw new Error(`port ${PORT} is taken: this tool runs its own server`);
  server = spawn('nice', ['-n', '10', 'npx', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
  for (let i = 0; i < 240; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/`); if (r.ok) break; } catch { /* */ } await sleep(250); }
  const slot = await takeMachineSlot({ who: `boot-transfer ${PORT}`, waitS: Number(flag('--slot-wait', 1800)), log });
  if (!slot.ok) throw new Error(slot.why);
  installProfileCleanup();
  const tC = Date.now();
  const profile = profileDir(PORT);
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
  try {
    for (const c of [['new-game', null], ...CONTINUES.map((f) => ['continue', f])]) {
      try {
        const rec = await oneCase(browser, c[0], c[1]);
        run.cases.push(rec);
        log(`${rec.case}: ${rec.beforeControl.mb} MB in ${rec.beforeControl.files} files before control, ${rec.beforeControl.deferredFiles} deferred; late ${rec.late?.decoded}/${rec.late?.rows} by ${rec.late?.lastDecodedS} s, missed ${rec.late?.missed?.length}; ${rec.pass ? 'PASS' : 'FAIL'}`);
      } catch (e) { run.cases.push({ case: c.join(':'), pass: false, error: String(e?.stack || e).slice(0, 600) }); log(`${c.join(':')}: ${e}`); }
      save();
    }
  } finally {
    try { await browser.close(); } catch { /* */ }
    disposeProfile(profile);
    releaseMachineSlot(log);
    run.chromeS = Math.round((Date.now() - tC) / 1000);
  }
} catch (e) {
  run.error = String(e?.stack || e).slice(0, 800);
} finally {
  stopServer();
  run.pass = run.cases.length > 0 && run.cases.every((c) => c.pass) && !run.error;
  run.finishedAt = utc();
  save();
  log(`${run.pass ? 'PASS' : 'FAIL'} P-boot-transfer at ${commit} (clean ${run.clean}): ${OUT}`);
  process.exitCode = run.pass ? 0 : 1;
}
