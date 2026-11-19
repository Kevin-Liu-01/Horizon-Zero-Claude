#!/usr/bin/env node
/**
 * A-first-hour, THE SKELETON (Milestone 2 §3.6, area E's HR0 and HR1): the first hour as three legs, each from the real
 * title, driven by input, beat by beat. Wave 1 builds it before the content so every new beat FAILS BY NAME, and records
 * hp, time and its numbers, from the first day; a beat turns green when its quest stage does.
 *
 *   node tools/gates/systems/first-hour.mjs --port 5262 [--legs 1,2,3] [--label systems-fh] [--leg-budget 300]
 *
 * THE LEGS (each one Chrome launch with nothing else in it; one Chrome at a time, the machine-wide slot1):
 *   1  New Game -> the slice's 14 beats: tools/gates/systems/slice-hour.mjs --run-only, run as a child with its own
 *      launch; its report's beats are folded in unchanged ("the slice plays 14/14" is this leg)
 *   2  the save leg 1 wrote (alone: fixture(2), tools/gates/systems/first-hour-fixtures.mjs: the slice's end) ->
 *      walk, herd, plumb-2, barbed, oro, stall, seal-1, seal-2
 *   3  the save leg 2 wrote (alone: fixture(3), the checkpoint after the fight) ->
 *      scar, survey, fade, rest-noon, calima-cross, read-transit
 * Wave 1 runs legs 2 and 3 from their fixtures (leg 1's save is in its own profile, which is disposed); once per review
 * the three are chained in one launch (wave 4).
 *
 * A BEAT PASSES only when its quest stage (src/game/quest/scar-plan.js) is reached, read off the page as
 * `ctx.quests[questId].report().reached` (the interface the systems runtime publishes when "The Scar" and "True
 * Ground" are wired, wave 2). Until then each beat fails with the first missing piece named ("not built: ...") and its
 * numbers: what the page holds for it today. What is already playable is played by input: leg 2 WALKS from Saltrow to
 * Ninewalls along the nav grid (W, Shift, the look; the regions seam's region-enter is read on the way, with every
 * presented frame over 33 and 50 ms: EN1), leg 3 walks from the south gate to Benchmark 1 and raises the Alidade (V).
 * The runner never writes a position or a quest stage; the fixture is written into localStorage before the title
 * boots, as a save on disk is, and CONTINUE is pressed on the title.
 *
 * Output: <review>/runs/<utc>-<commit>-<label>/report.json (never the repo): per leg its beats, each
 *   { leg, beat, ok, why, hp, t (s since the leg's play began), hour, at {x, z}, region, numbers }
 * and `beats: "passed/of"` per leg and for the run.
 */
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNS, assertOutsideRepo } from '../../frames/paths.mjs';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../../chrome-profile.mjs';
import { takeMachineSlot, releaseMachineSlot } from '../../chrome-slot.mjs';
import { fixture } from './first-hour-fixtures.mjs';
import { SCAR_STAGES, TRUE_GROUND_STAGES, SCAR_ID, TRUE_GROUND_ID, TRANSIT_CARD, NEW_BEATS } from '../../../src/game/quest/scar-plan.js';
import { siteById, TRIG } from '../../../src/world/island/sites.js';
import { BENCHMARKS } from '../../../src/world/sites/layout.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = guardPort(flag('--port'));
if (PORT === 5173) throw new Error('5173 is never used');
const LEGS = (flag('--legs', '1,2,3') || '').split(',').map((s) => Number(s.trim())).filter((n) => [1, 2, 3].includes(n));
const LABEL = flag('--label', 'systems-first-hour');
const LEG_BUDGET_S = Number(flag('--leg-budget', 300));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[first-hour ${new Date().toISOString().slice(11, 19)}]`, ...a);
const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return '?'; } };
const commit = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no').length > 0;
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const runDir = path.join(RUNS, `${stamp}-${commit}-${LABEL}`);
assertOutsideRepo(runDir, REPO);
const portOpen = (p) => new Promise((r) => { const s = net.connect(p, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });

const NW = siteById('ninewalls');
const B1 = BENCHMARKS.find((b) => b.id === 'bm-01');
const T2 = TRIG.find((t) => t.id === 'T2');
const PLACES = {
  ninewalls: { x: NW.x, z: NW.z }, b1: { x: B1.x, z: B1.z }, t2: { x: T2.x, z: T2.z },
  kilnYards: (() => { const s = siteById('kiln-yards'); return { x: s.x, z: s.z }; })(),
};

const report = {
  row: 'A-first-hour (skeleton)', commit, dirty, tree: REPO, port: PORT, startedAt: new Date().toISOString(), legs: [], beats: null,
  newBeats: NEW_BEATS.length, places: PLACES,
};

/* ------------------------------------------------------------------ in-page */

/** What the page holds for a beat (serialised: no closure). Returns { why, numbers } — `why` null only when it passed. */
const beatProbe = (beat, questId, places, card) => {
  const C = window.__CTX__, p = C.player, M = C.machines, E = C.engine, env = C.environment;
  const P = p.position;
  const live = (kind) => (M?.list || []).filter((m) => m && m.alive !== false && !m._disposed && m.kind === kind);
  const within = (list, at, r) => list.filter((m) => Math.hypot(m.position.x - at.x, m.position.z - at.z) <= r).length;
  const can = (k) => { try { return !!M?.canSpawn?.(k); } catch { return false; } };
  const q = C.quests?.[questId];
  const reached = (() => { try { return q?.report?.().reached || []; } catch { return []; } })();
  const n = {};
  const missing = [];
  if (!q) missing.push(`no quest '${questId}' in this build (src/game/quest/scar-plan.js is not wired into the runtime)`);
  switch (beat) {
    case 'walk': {
      n.region = E.regionStatus?.()?.current ?? null;
      n.toNinewalls = +Math.hypot(P.x - places.ninewalls.x, P.z - places.ninewalls.z).toFixed(1);
      break;
    }
    case 'herd': {
      n.tillerKind = can('tiller'); n.tillersNearNinewalls = within(live('tiller'), places.ninewalls, 200);
      n.plumbsNearNinewalls = within(live('plumb'), places.ninewalls, 200);
      if (!n.tillersNearNinewalls) missing.push('no Tiller herd in the Holds (area C places it, wave 3)');
      break;
    }
    case 'plumb-2': {
      n.plumbsNearNinewalls = within(live('plumb'), places.ninewalls, 200);
      if (!n.plumbsNearNinewalls) missing.push('no second Plumb on the terrace above Ninewalls (areas C and E, wave 3)');
      break;
    }
    case 'barbed': {
      n.barbedAmmo = C.combat?.ammo?.barbed ?? null; n.hardpoint = C.combat?.ammo?.hardpoint ?? null;
      n.pegPins = C.inventory?.count?.('peg-pin') ?? null;
      if (n.barbedAmmo == null) missing.push('no Barbed arrow made from Peg pins (combat, the kit)');
      break;
    }
    case 'oro': {
      const list = C.people?.list || [];
      n.people = list.length;
      n.oro = list.some((x) => /oro/i.test(String(x.id ?? x.spec?.id ?? '')));
      if (!n.oro) missing.push('no Oro in this build (area B, wave 2)');
      n.kit = ['gaff', 'windwall', 'brine-pot', 'cinder-pot'].map((id) => [id, C.inventory?.count?.(id) ?? 0]);
      break;
    }
    case 'stall': case 'seal-1': case 'seal-2': {
      n.screedKind = can('screed'); n.screeds = live('screed').length;
      if (!n.screedKind) missing.push('no Screed kind registered (area C: the grey hull and its rules in Node, wave 1; live, wave 3)');
      break;
    }
    case 'scar': {
      n.toB1 = +Math.hypot(P.x - places.b1.x, P.z - places.b1.z).toFixed(1);
      break;
    }
    case 'survey': {
      n.sighting = !!C.sighting?.on; n.scanTarget = C.sighting?.scanTarget?.kind ?? C.sighting?.scanTarget?.id ?? null;
      n.toB1 = +Math.hypot(P.x - places.b1.x, P.z - places.b1.z).toFixed(1);
      n.resurveyUi = !!document.querySelector('.cal-resurvey, #cal-resurvey');
      if (!n.resurveyUi) missing.push('no re-survey (the 15 s hold, three bearings: systems and ui, wave 3)');
      break;
    }
    case 'fade': {
      n.painted = window.__wallsPainted ?? null;
      if (n.painted == null || n.painted > 0) missing.push(`the line is on ${n.painted ?? '?'} walls (true ground clears it after the re-survey, wave 3)`);
      break;
    }
    case 'rest-noon': {
      n.ninewallsBrazier = !!C.braziers?.byId?.('ninewalls');
      n.braziers = (C.braziers?.list || []).map((b) => b.id);
      if (!n.ninewallsBrazier) missing.push('no Ninewalls Brazier (systems and settlements, wave 4)');
      break;
    }
    case 'calima-cross': {
      n.weather = env?.weather ?? null; n.hour = env ? +env.time.toFixed(2) : null;
      n.region = E.regionStatus?.()?.current ?? null;
      try { n.toMalpais = +(-(C.regions?.map?.depth?.('malpais', P.x, P.z) ?? NaN)).toFixed(1); } catch { n.toMalpais = null; }
      if (n.weather !== 'calima') missing.push(`the weather is '${n.weather}': calima is not asked for at noon (systems asks sky-look, wave 4)`);
      break;
    }
    case 'read-transit': {
      n.transitKind = can('transit');
      n.cardWanted = card;
      if (!n.transitKind) missing.push('no Transit far form (instruments and sky-look, wave 4)');
      break;
    }
    default: missing.push(`no probe for beat '${beat}'`);
  }
  const ok = reached.includes(beat);
  return { ok, why: ok ? null : `not built: ${missing.join('; ') || `stage '${beat}' not reached`}`, numbers: n, hp: Math.round(p.health ?? 0), hour: env ? +env.time.toFixed(3) : null,
    at: { x: +P.x.toFixed(1), z: +P.z.toFixed(1) }, region: E.regionStatus?.()?.current ?? null, state: C.state };
};

const face = (x, z) => { const p = window.__CTX__.player; p.camYaw = Math.atan2(-(x - p.position.x), -(z - p.position.z)); };
const where = () => { const C = window.__CTX__, p = C.player; return { state: C.state, x: p.position.x, y: p.position.y, z: p.position.z, hp: Math.round(p.health ?? 0), dead: !!document.querySelector('.mn-death.show') }; };

/* ------------------------------------------------------------------ driving */

async function walkTo(page, target, radius, maxS) {
  const t0 = Date.now();
  let best = Infinity, bestAt = Date.now(), hops = 0;
  await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft');
  try {
    for (;;) {
      const s = await page.evaluate(where);
      if (s.dead || s.state === 'dead' || s.state === 'death-menu') return { ok: false, why: 'died', d: null };
      if (s.state !== 'playing') return { ok: false, why: `left play (state ${s.state})` };
      const d = Math.hypot(s.x - target.x, s.z - target.z);
      if (d <= radius) return { ok: true, d: +d.toFixed(1) };
      if (d < best - 0.5) { best = d; bestAt = Date.now(); }
      if (Date.now() - bestAt > 4000) { await page.keyboard.down('Space'); await sleep(90); await page.keyboard.up('Space'); hops++; bestAt = Date.now(); if (hops > 10) return { ok: false, why: `stuck ${d.toFixed(1)} m short`, d: +d.toFixed(1) }; }
      if ((Date.now() - t0) / 1000 > maxS) return { ok: false, why: `timed out ${d.toFixed(1)} m short`, d: +d.toFixed(1) };
      await page.evaluate(face, target.x, target.z);
      await sleep(120);
    }
  } finally { await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW'); }
}

/** Along the game's own nav grid (ctx.nav.path), a waypoint every ~8 m, as slice-hour walks a long leg. */
async function walkPath(page, target, radius, maxS = 150) {
  const t0 = Date.now();
  const pts = await page.evaluate((tx, tz) => {
    const C = window.__CTX__, N = C.nav, P = C.player.position;
    if (!N?.path) return null;
    const V = P.constructor, path = N.path(new V(P.x, 0, P.z), new V(tx, 0, tz));
    if (!path || !path.length) return null;
    const out = []; let last = { x: P.x, z: P.z }, lastDir = null;
    for (let i = 0; i < path.length; i++) {
      const q = path[i], dx = q.x - last.x, dz = q.z - last.z, d = Math.hypot(dx, dz), dir = Math.atan2(dx, dz);
      const turn = lastDir == null ? 0 : Math.abs(Math.atan2(Math.sin(dir - lastDir), Math.cos(dir - lastDir)));
      if (d >= 8 || (turn > 0.44 && d > 2.5) || i === path.length - 1) { out.push({ x: q.x, z: q.z }); last = q; lastDir = dir; }
    }
    return out;
  }, target.x, target.z);
  if (!pts) return { ...(await walkTo(page, target, radius, maxS)), nav: false, s: +((Date.now() - t0) / 1000).toFixed(1) };
  for (const w of pts.slice(0, -1)) {
    const left = maxS - (Date.now() - t0) / 1000;
    if (left <= 0) return { ok: false, why: 'timed out on the nav path', nav: true, s: +((Date.now() - t0) / 1000).toFixed(1) };
    const r = await walkTo(page, w, 2.2, Math.min(40, left));
    if (!r.ok) return { ...r, nav: true, of: pts.length, s: +((Date.now() - t0) / 1000).toFixed(1) };
  }
  const r = await walkTo(page, target, radius, Math.max(5, maxS - (Date.now() - t0) / 1000));
  return { ...r, nav: true, of: pts.length, s: +((Date.now() - t0) / 1000).toFixed(1) };
}

/** The village's published road when it has one (settlements.ninewalls.road, [x, z, h] points), else walkPath alone. */
async function walkRoad(page, target, radius, maxS = 150) {
  const t0 = Date.now();
  const road = await page.evaluate(() => { const R = window.__CTX__.settlements?.ninewalls?.road; return Array.isArray(R) && R.length > 1 ? R.map((p) => ({ x: p[0], z: p[1] })) : null; });
  if (!road) return { ...(await walkPath(page, target, radius, maxS)), road: false };
  const pts = [road[0]];
  for (const q of road) if (Math.hypot(q.x - pts.at(-1).x, q.z - pts.at(-1).z) >= 6) pts.push(q);
  pts.push(road.at(-1));
  const foot = await walkPath(page, pts[0], 3, Math.min(60, maxS));
  if (!foot.ok) return { ...foot, road: true, leg: 'to the road', s: +((Date.now() - t0) / 1000).toFixed(1) };
  for (const w of pts.slice(1)) {
    const left = maxS - (Date.now() - t0) / 1000;
    if (left <= 0) return { ok: false, why: 'timed out on the road', road: true, s: +((Date.now() - t0) / 1000).toFixed(1) };
    const r = await walkTo(page, w, 2.2, Math.min(20, left));
    if (!r.ok) return { ...r, road: true, leg: 'on the road', of: pts.length, s: +((Date.now() - t0) / 1000).toFixed(1) };
  }
  const r = await walkPath(page, target, radius, Math.max(5, maxS - (Date.now() - t0) / 1000));
  return { ...r, road: true, of: pts.length, s: +((Date.now() - t0) / 1000).toFixed(1) };
}

async function shot(page, name) {
  try {
    await page.evaluate(() => { if (window.__hitch) window.__hitch.pause++; });
    const buf = await page.screenshot({ type: 'png' });
    await page.evaluate(() => { if (window.__hitch) { window.__hitch.pause--; window.__hitch.skip = true; } });
    await sharp(buf).resize(1600, 900, { fit: 'fill' }).jpeg({ quality: 82 }).toFile(path.join(runDir, `${name}.jpg`));
    return `${name}.jpg`;
  } catch { return null; }
}

/** Presented-frame intervals while playing with the loading sheet closed (TECH 9.1's hitch lines); screenshots apart. */
function installHitch() {
  const H = (window.__hitch = { n: 0, max: 0, over33: 0, over50: 0, pause: 0, skip: false, last: 0, was: false, marks: [] });
  window.__hitchMark = (tag) => H.marks.push({ tag, n: H.n, over33: H.over33, over50: H.over50, max: H.max });
  const tick = (t) => {
    const C = window.__CTX__, L = document.getElementById('loading'), sheet = !!L && !L.classList.contains('hidden');
    const playing = C?.state === 'playing' && !sheet;
    if (H.last && playing && H.was) {
      const d = t - H.last;
      if (H.pause || H.skip) { if (!H.pause) H.skip = false; } else { H.n++; if (d > H.max) H.max = d; if (d > 33.4) H.over33++; if (d > 50) H.over50++; }
    }
    H.was = playing; H.last = t; requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ one leg in its own launch */

async function boot(page, leg) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__CTX__?.state === 'title' && !!window.__CTX__?.progression?.saves?.store, { timeout: 180000, polling: 200 });
  // the fixture, written as a save on disk is: into the store, then the game opened again (the title reads it at boot)
  const rec = { ...fixture(leg), savedAt: Date.now() };
  const wrote = await page.evaluate((r) => { const st = window.__CTX__.progression.saves.store; st.setActive(1); return st.write(r); }, rec);
  if (!wrote?.ok) throw new Error(`fixture ${leg} not written: ${JSON.stringify(wrote)}`);
  await page.goto('about:blank', { waitUntil: 'load', timeout: 30000 });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__CTX__?.state === 'title' && window.__CTX__?.menus?.titleStage === 'press', { timeout: 180000, polling: 100 });
  await sleep(500);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__CTX__?.menus?.titleStage === 'menu', { timeout: 60000, polling: 50 });
  await sleep(300);
  const cont = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.mn-title-item')].find((x) => /CONTINUE/.test(x.textContent));
    if (!b || b.disabled) return 'no CONTINUE on the title';
    b.click();
    const go = document.querySelector('.gs-slot.cont .gs-slot-go');
    if (!go) return 'no marked slot card';
    go.click();
    return null;
  });
  if (cont) throw new Error(`continue: ${cont}`);
  await page.waitForFunction(() => window.__CTX__?.state === 'playing', { timeout: 60000, polling: 50 });
  await sleep(2000);
  return rec;
}

async function runLeg(leg) {
  const L = { leg, from: `fixture(${leg})`, beats: [], rows: {}, console: [], error: null };
  let vite = null, browser = null, profile = null, slotTaken = false;
  const t0 = Date.now();
  try {
    // the leg before's Vite (its own, or slice-hour's) takes a few seconds to let the port go after its SIGTERM
    for (let i = 0; i < 60 && (await portOpen(PORT)); i++) await sleep(500);
    if (await portOpen(PORT)) throw new Error(`port ${PORT} already in use`);
    const slot = await takeMachineSlot({ who: `systems first-hour leg ${leg} ${PORT}`, waitS: 1800, log });
    if (!slot.ok) throw new Error(slot.why);
    slotTaken = true;
    L.slotTakenAt = new Date().toISOString();
    vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
    for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
    if (!(await portOpen(PORT))) throw new Error(`vite did not open ${PORT}`);
    installProfileCleanup();
    profile = profileDir(PORT);
    const tC = Date.now();
    browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000,
      args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940',
        '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.25 });
    page.on('console', (m) => { if (m.type() === 'error') L.console.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => L.console.push(`pageerror: ${String(e).slice(0, 300)}`));
    await page.evaluateOnNewDocument(installHitch);
    const rec = await boot(page, leg);
    const tPlay = Date.now();
    const T = () => +((Date.now() - tPlay) / 1000).toFixed(1);
    // the crossings the regions seam fires from here on
    await page.evaluate(() => { window.__regionEv = []; const C = window.__CTX__; for (const k of ['enter', 'leave', 'approach', 'depart']) C.events.on(`region-${k}`, (e) => window.__regionEv.push({ k, region: e.region, t: +(performance.now() / 1000).toFixed(2), depth: e.depth })); window.__t0 = performance.now() / 1000; });
    L.start = { ...(await page.evaluate(where)), hour: await page.evaluate(() => window.__CTX__.environment.time), regions: await page.evaluate(() => window.__CTX__.engine.regionStatus?.() ?? null), fixtureAt: rec.position, shot: await shot(page, `l${leg}-00-continued`) };
    L.rows.continued = { pass: Math.hypot(L.start.x - rec.position.x, L.start.z - rec.position.z) < 0.5 && Math.abs(L.start.hour - rec.hour) < 0.05,
      dxz: +Math.hypot(L.start.x - rec.position.x, L.start.z - rec.position.z).toFixed(3), hour: +L.start.hour.toFixed(3) };
    const stages = beatsOf(leg);
    const qid = leg === 2 ? SCAR_ID : TRUE_GROUND_ID;
    let k = 0;
    for (const st of stages) {
      if ((Date.now() - tC) / 1000 > LEG_BUDGET_S) { L.beats.push({ leg, beat: st.id, ok: false, why: `not run: the leg's ${LEG_BUDGET_S} s cap` }); continue; }
      const bt0 = T();
      const played = {};
      if (st.id === 'walk') {
        await page.evaluate(() => window.__hitchMark('walk-start'));
        // (M2 wave 2, area B, the smallest change: the walk in) Ninewalls publishes its road (settlements.ninewalls.road: the
        // west face's switchback, the bible's graded 256 m). She walks to its foot on the nav grid, up it point by point (about
        // every 6 m, as a player keeps to a road), then on to the village; with no road, the nav grid all the way as before
        played.walk = await walkRoad(page, PLACES.ninewalls, 30, 150);
        await page.evaluate(() => window.__hitchMark('walk-end'));
        played.hitch = await page.evaluate(() => { const M = window.__hitch.marks, a = M.at(-2), b = M.at(-1); return { frames: b.n - a.n, over33: b.over33 - a.over33, over50: b.over50 - a.over50, maxMsSoFar: +b.max.toFixed(1) }; });
        played.regionEvents = await page.evaluate(() => window.__regionEv.map((e) => ({ ...e, t: +(e.t - window.__t0).toFixed(1) })));
        const enter = played.regionEvents.find((e) => e.k === 'enter' && e.region === 'holds');
        played.enterHolds = enter ? { t: enter.t, depth: enter.depth } : null;
        played.approachHolds = played.regionEvents.find((e) => e.k === 'approach' && e.region === 'holds')?.t ?? null;
      } else if (st.id === 'scar') {
        played.walk = await walkPath(page, PLACES.b1, 4, 90);
      } else if (st.id === 'survey') {
        // the Alidade raised on the mark, held 2 s (the 15 s hold is the verb wave 3 builds)
        await page.keyboard.press('KeyV'); await sleep(2000);
        played.alidade = await page.evaluate(() => ({ on: !!window.__CTX__.sighting?.on }));
      } else if (st.id === 'fade') {
        await page.evaluate(async () => {
          try { const W = await import('/src/world/settlements/ninewalls-layout.js'); window.__wallsPainted = (W.WALLS || []).filter((w) => W.wallState?.(w.id)?.painted).length; } catch { window.__wallsPainted = null; }
        });
      }
      const pr = await page.evaluate(beatProbe, st.id, qid, PLACES, TRANSIT_CARD);
      const b = { leg, beat: st.id, ok: pr.ok, why: pr.why, hp: pr.hp, t: T(), seconds: +(T() - bt0).toFixed(1), hour: pr.hour, at: pr.at, region: pr.region, numbers: { ...pr.numbers, ...played } };
      b.shot = await shot(page, `l${leg}-${String(++k).padStart(2, '0')}-${st.id}`);
      L.beats.push(b);
      log(`leg ${leg} ${st.id}: ${b.ok ? 'PASS' : 'FAIL'} hp ${b.hp} t ${b.t} s ${b.why ? `(${b.why.slice(0, 160)})` : ''}`);
      if (st.id === 'survey' && played.alidade?.on) { await page.keyboard.press('KeyV'); await sleep(400); }
    }
    L.hitch = await page.evaluate(() => { const H = window.__hitch; return { frames: H.n, maxMs: +H.max.toFixed(1), over33: H.over33, over50: H.over50 }; });
    L.end = { ...(await page.evaluate(where)), regions: await page.evaluate(() => window.__CTX__.engine.regionStatus?.() ?? null), systemErrors: await page.evaluate(() => (window.__GAME__?.systemErrors || []).map((e) => `${e.key}: ${e.message}`).slice(0, 8)) };
  } catch (e) {
    L.error = String(e?.stack || e).slice(0, 1200);
    log(`leg ${leg} error: ${L.error.slice(0, 300)}`);
  } finally {
    L.chromeSeconds = Math.round((Date.now() - t0) / 1000);
    try { await browser?.close(); } catch { /* */ }
    if (profile) disposeProfile(profile);
    if (vite) { try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* */ } }
    if (slotTaken) releaseMachineSlot(log);
  }
  const done = L.beats.filter((b) => b.ok).length;
  L.passed = `${done}/${beatsOf(leg).length}`;
  return L;
}
const beatsOf = (leg) => (leg === 2 ? SCAR_STAGES : TRUE_GROUND_STAGES);

/* ------------------------------------------------------------------ leg 1: the slice, as its own run */

function runLeg1() {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [path.join(REPO, 'tools/gates/systems/slice-hour.mjs'), '--port', String(PORT), '--run-only', '--label', `${LABEL}-leg1`], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    child.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
    child.on('close', (code) => {
      const m = /report: (\S+report\.json)/.exec(out);
      const L = { leg: 1, from: 'New Game', exit: code, chromeSeconds: Math.round((Date.now() - t0) / 1000), report: m ? m[1] : null, beats: [] };
      if (m && existsSync(m[1])) {
        const r = JSON.parse(readFileSync(m[1], 'utf8'));
        L.beats = (r.beats || []).map((b) => ({ leg: 1, beat: b.stage, ok: !!b.ok, why: b.ok ? null : (b.why || r.why || 'stopped'), hp: b.hp ?? null, seconds: b.seconds ?? null }));
        L.reached = r.spine?.reached ?? null; L.stoppedAt = r.stoppedAt; L.why = r.why; L.hitch = r.hitch ?? null; L.rows = Object.fromEntries(Object.entries(r.rows || {}).map(([k, v]) => [k, v?.pass ?? v?.ok ?? null]));
        L.chromeSeconds = r.chromeSeconds ?? L.chromeSeconds;
      }
      const ok = L.beats.filter((b) => b.ok).length;
      L.passed = `${ok}/14`;
      resolve(L);
    });
  });
}

/* ------------------------------------------------------------------ main */

mkdirSync(runDir, { recursive: true });
try {
  for (const leg of LEGS) {
    log(`leg ${leg}`);
    const L = leg === 1 ? await runLeg1() : await runLeg(leg);
    report.legs.push(L);
    writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2));
  }
} finally {
  const all = report.legs.flatMap((l) => l.beats);
  const want = (LEGS.includes(1) ? 14 : 0) + (LEGS.includes(2) ? SCAR_STAGES.length : 0) + (LEGS.includes(3) ? TRUE_GROUND_STAGES.length : 0);
  report.beats = `${all.filter((b) => b.ok).length}/${want}`;
  report.chromeSeconds = report.legs.reduce((s, l) => s + (l.chromeSeconds || 0), 0);
  writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2));
  log(`report: ${path.join(runDir, 'report.json')}`);
  for (const l of report.legs) log(`leg ${l.leg}: ${l.passed}${l.error ? ` (error: ${l.error.slice(0, 120)})` : ''}`);
  log(`beats ${report.beats}; ${report.chromeSeconds} s of Chrome`);
}
