#!/usr/bin/env node
/**
 * A-hour-two, THE SKELETON (Milestone 3 §3.6, area E's HT0 and HT1): hour two as three legs (4, 5, 6: the first hour's
 * numbering continues), each from the real title, driven by input, beat by beat. Wave 1 builds it before the content so
 * every one of the 27 beats FAILS BY NAME (its quest not wired, then the first missing piece of src/game/hour2/plan.js
 * NEEDS), and records hp, the hour, the weather, the region and its numbers from the first day.
 *
 *   node tools/gates/systems/hour-two.mjs --port 5284 [--legs 4,5,6] [--label hour-two] [--leg-budget 600]
 *        [--chain] [--handoff <a run's report.json>]
 *
 * THE STARTS (rule 13: a driver is tested from two starts, and a beat that passes only from its fixture fails):
 *   fixture    each leg from tools/gates/systems/hour-two-fixtures.mjs fixture(leg) (leg 4's is the first hour's end
 *              while A-first-hour is not 28/28 chained; then the record leg 3 writes)
 *   --chain    each leg after the first from the record the leg before left in its store (the handoff save)
 *   --handoff  each leg from the record the leg before it left in an earlier run (that run's report.json carries every
 *              leg's `endRecord`): the handoff start without replaying the leg before
 * Each leg is one Chrome launch with nothing else in it (the machine-wide slot1), its own Vite on --port from THIS tree.
 *
 * A BEAT PASSES only when its stage is reached: `ctx.quests[quest].report().reached` holds the beat's id (the world
 * beats, quest null, read their own state: the weather is trade and flyable() says so; the Hand Net is held). Until
 * then each beat fails with `why` = "not built: <the first missing need>" (all missing needs listed in its numbers), or
 * "no driver" (rule 14) once everything it needs is there. Wave 1 drives nothing: the runner never writes a position or
 * a stage; the fixture goes into localStorage before the title boots, as a save on disk does, and CONTINUE is pressed.
 * Every presented frame over 33 and 50 ms is counted per leg (screenshots apart), as first-hour.mjs counts them.
 *
 * M3 WAVE 3 (area E): LEG 6's DRIVERS, by input only (keys held and released, the look turned as a mouse turns it; the
 * runner never writes a position, a stage or a count): 'oro-yards' (the walk to Oro on the nav grid, E, the scene played
 * through), 'climb' (the walk up to the Yards' south-west corner), 'plugged' (to 5 m south of the wellhead a Kiln is
 * plugged into, out of the shelf's eye; back off and again if seen), 'quench-1'..'quench-4' (the belt filled at the quench
 * tank when it is empty, 6 m south of the plugged head, the look on the head's foot, F: a Brine Pot's pendulum cast; up to
 * four casts a head) and 'yards-quiet' (wait). Every other beat has no driver and fails by name. A beat reached while a
 * need is missing (the Yards' Kilns and Spindle are grey stand-ins until area C's kinds stand there) is a PASS with its
 * missing needs listed and `standIn` set.
 *
 * Output: <review>/runs/<utc>-<commit>-<label>/report.json (never the repo): per leg its start, its beats
 *   { leg, beat, ok, why, missing, hp, t, hour, weather, at {x, z}, region, budgetS, numbers }, its end record, and
 *   `beats: "passed/of"` per leg and for the run.
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
import { fixture } from './hour-two-fixtures.mjs';
import * as SH from './slice-hour.mjs';
import { DRIVE4 } from '../kite/glass-line-drive.mjs';   // (M3 wave 3, area B: leg 4's drivers, the smallest change)
import { WELLHEADS, apronPoint } from '../../../src/world/sites/kilnyards-layout.js';
import { BEATS, NEEDS, PLACES, LEGS as ALL_LEGS, LEG_CAP_S, beatsOfLeg } from '../../../src/game/hour2/plan.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = guardPort(flag('--port'));
if (PORT === 5173) throw new Error('5173 is never used');
const LEGS = (flag('--legs', '4,5,6') || '').split(',').map((s) => Number(s.trim())).filter((n) => ALL_LEGS.includes(n));
const LABEL = flag('--label', 'hour-two');
const LEG_BUDGET_S = Number(flag('--leg-budget', LEG_CAP_S));
const CHAIN = args.includes('--chain');
const HANDOFF = flag('--handoff');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[hour-two ${new Date().toISOString().slice(11, 19)}]`, ...a);
const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return '?'; } };
const commit = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no').length > 0;
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const runDir = path.join(RUNS, `${stamp}-${commit}-${LABEL}`);
assertOutsideRepo(runDir, REPO);
const portOpen = (p) => new Promise((r) => { const s = net.connect(p, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });

/** --handoff: the end record of each leg of an earlier run, by leg */
const handoffs = (() => {
  if (!HANDOFF) return {};
  if (!existsSync(HANDOFF)) throw new Error(`--handoff ${HANDOFF}: no such report`);
  const r = JSON.parse(readFileSync(HANDOFF, 'utf8'));
  return Object.fromEntries((r.legs || []).filter((l) => l.endRecordFull).map((l) => [l.leg, l.endRecordFull]));
})();

const report = {
  row: 'A-hour-two', wave: 3, chain: CHAIN, handoff: HANDOFF, commit, dirty, tree: REPO, port: PORT, startedAt: new Date().toISOString(),
  legs: [], beats: null, places: PLACES,
};

/* ------------------------------------------------------------------ in-page */

const where = () => {
  const C = window.__CTX__, p = C.player, dc = document.querySelector('.mn-death.show');
  return { state: C.state, x: p.position.x, y: p.position.y, z: p.position.z, hp: Math.round(p.health ?? 0), dead: !!dc };
};

/** What the page holds for a beat (serialised: no closure). `needs` is [[id, probe source]]. */
const beatProbe = (b, needs) => {
  const C = window.__CTX__, P = C.player, M = C.machines, E = C.environment;
  const missing = [];
  for (const [id, src] of needs) {
    let ok = false;
    try { ok = !!new Function('C', 'P', 'M', 'E', `return (${src});`)(C, P, M, E); } catch { ok = false; }
    if (!ok) missing.push(id);
  }
  let reached = false;
  const n = {};
  if (b.quest) {
    try { reached = !!C.quests?.[b.quest]?.report?.().reached?.includes(b.id); } catch { reached = false; }
  } else if (b.id === 'weather-clears') {
    n.weather = E?.weather ?? null;
    n.flyable = typeof E?.flyable === 'function' ? !!E.flyable() : null;
    reached = n.weather === 'trade' && n.flyable === true;
  } else if (b.id === 'hand-net') {
    n.handNet = C.satchel?.count?.('hand-net') ?? C.items?.count?.('hand-net') ?? null;
    reached = (n.handNet ?? 0) > 0;
  }
  const R = C.engine?.regionStatus?.();
  const p = P.position;
  return {
    ok: reached, missing, numbers: n,
    hp: Math.round(P.health ?? 0), hour: +(E?.time ?? 0).toFixed(2), weather: E?.weather ?? null,
    at: { x: +p.x.toFixed(1), z: +p.z.toFixed(1) }, region: R?.current ?? null,
    quests: Object.keys(C.quests || {}),
  };
};

/* ------------------------------------------------------------------ leg 6's drivers (M3 wave 3) */

const enp = (p) => ({ x: +p.e.toFixed(2), z: +(-p.n).toFixed(2) });
const YARDS_SW = enp(apronPoint(-21, -7.5));
const TANK = enp(apronPoint(-22.5, -6.5));
const WELL_AT = Object.fromEntries(WELLHEADS.map((w) => [w.id, { x: w.x, z: w.z }]));
/** n m south of a wellhead, across the bench (the apron's -v: engine (+0.0872, +0.9962)) */
const southOf = (id, n) => ({ x: WELL_AT[id].x + 0.0872 * n, z: WELL_AT[id].z + 0.9962 * n });

const yardsNow = () => {
  const C = window.__CTX__, Q = C.hour2?.kilnYards, r = Q?.report?.(), K = C.combat?.pots, P = C.player.position;
  return { stage: Q?.spine?.current?.()?.id ?? null, reached: Q?.spine?.report?.().reached ?? [], yards: r?.yards ?? null, quenched: r?.quenched ?? 0,
    brine: K?.belt?.count?.brine ?? 0, potsOwned: !!K?.belt?.owned, casting: !!(K?.casting || K?.flying), p: { x: +P.x.toFixed(1), z: +P.z.toFixed(1) },
    hp: Math.round(C.player.health ?? 0), busy: !!C.systemsGame?.present?.busy, state: C.state, stats: r?.stats ?? null };
};
const reachedIn = (page, id) => page.evaluate((i) => !!window.__CTX__.quests?.['kiln-yards']?.report?.().reached?.includes(i), id);
async function waitUntil(page, test, ms, every = 250) {
  const t0 = Date.now();
  for (;;) { const v = await test(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(every); }
}
const pluggedWell = (st) => (st.yards?.wells || []).find((w) => w.plugged && w.state === 'hot')?.id ?? null;

async function fillAtTank(page, K) {
  const w = await SH.walkPath(page, K, TANK, 2.2, { maxS: 60 });
  await SH.holdE(page, K, 500);
  await sleep(400);
  return { walk: w.ok, brine: (await page.evaluate(yardsNow)).brine };
}

/** One cast of the selected pot (Brine first) at the foot of wellhead `id`, from where she stands. */
async function castAt(page, K, id) {
  const at = WELL_AT[id];
  const y = await page.evaluate((x, z) => window.__CTX__.terrain?.getHeight?.(x, z) ?? 143, at.x, at.z);
  const aim = await page.evaluate(SH.aimPoint, at.x, y, at.z, 0.4);
  await K.tap('KeyF', 90);
  const before = (await page.evaluate(yardsNow)).quenched;
  const landed = await waitUntil(page, async () => { const s = await page.evaluate(yardsNow); return !s.casting && s.quenched >= before ? s : null; }, 4000, 200);
  await sleep(300);
  return { aim, landed: !!landed };
}

const DRIVE = {
  'oro-yards': async (page, K, b, maxS) => {
    const A = await page.evaluate(() => window.__CTX__.systemsGame?.A?.oro ?? null);
    if (!A) return { ok: false, why: 'no Oro anchor (systemsGame.A.oro)' };
    const w = await SH.walkPath(page, K, A, 2.4, { maxS });
    await sleep(300);
    await SH.holdE(page, K, 500);
    await sleep(500);
    const played = await SH.playScene(page, K, 60);
    return { walk: { ok: w.ok, why: w.why ?? null, d: w.d ?? null }, played };
  },
  climb: async (page, K, b, maxS) => {
    const w = await SH.walkPath(page, K, YARDS_SW, 3, { maxS });
    return { walk: { ok: w.ok, why: w.why ?? null, d: w.d ?? null }, at: (await page.evaluate(yardsNow)).p };
  },
  plugged: async (page, K, b, maxS) => {
    const t0 = Date.now(), tries = [];
    while ((Date.now() - t0) / 1000 < maxS && !(await reachedIn(page, 'plugged'))) {
      const st = await page.evaluate(yardsNow);
      const id = pluggedWell(st);
      if (!id) { await sleep(1000); continue; }
      const w = await SH.walkTo(page, K, southOf(id, 5), 1.2, { maxS: 30, sprint: false });
      await sleep(1200);
      const after = await page.evaluate(yardsNow);
      tries.push({ well: id, walk: w.ok, seen: after.yards?.seen ?? null, by: after.yards?.seenBy ?? null });
      if (!(await reachedIn(page, 'plugged')) && after.yards?.seen) { await SH.walkTo(page, K, YARDS_SW, 3, { maxS: 30 }); await sleep(4000); }
    }
    return { tries };
  },
  'yards-quiet': async (page) => ({ waited: !!(await waitUntil(page, () => reachedIn(page, 'yards-quiet'), 30000)) }),
};
for (const n of [1, 2, 3, 4]) {
  DRIVE[`quench-${n}`] = async (page, K, b, maxS) => {
    const t0 = Date.now(), casts = [], fills = [];
    while ((Date.now() - t0) / 1000 < maxS && !(await reachedIn(page, `quench-${n}`))) {
      let st = await page.evaluate(yardsNow);
      if (st.brine < 1) { fills.push(await fillAtTank(page, K)); st = await page.evaluate(yardsNow); if (st.brine < 1) return { casts, fills, why: 'no Brine after the tank' }; }
      const id = await waitUntil(page, async () => pluggedWell(await page.evaluate(yardsNow)), 60000, 500);
      if (!id) return { casts, fills, why: 'no Kiln plugged in within 60 s' };
      const tries = casts.filter((c) => c.well === id).length;
      await SH.walkTo(page, K, southOf(id, tries >= 2 ? 4 : 6), 1.0, { maxS: 40, sprint: false });
      await sleep(400);
      const c = await castAt(page, K, id);
      const s2 = await page.evaluate(yardsNow);
      casts.push({ well: id, from: s2.p, ...c, quenched: s2.quenched, miss: s2.stats?.brineMisses?.at(-1) ?? null });
      if (casts.length > 8) break;
    }
    return { casts, fills };
  };
}

// (M3 wave 3, area B) leg 4, "A Line Over the Glass": tools/gates/kite/glass-line-drive.mjs
Object.assign(DRIVE, DRIVE4);

/** Presented-frame intervals while playing with the loading sheet closed; screenshots apart (first-hour.mjs's). */
function installHitch() {
  const H = (window.__hitch = { n: 0, max: 0, over33: 0, over50: 0, pause: 0, skip: false, last: 0, was: false });
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

async function shot(page, runDirPath, name) {
  try {
    await page.evaluate(() => { if (window.__hitch) window.__hitch.pause++; });
    const buf = await page.screenshot({ type: 'png' });
    await page.evaluate(() => { if (window.__hitch) { window.__hitch.pause--; window.__hitch.skip = true; } });
    await sharp(buf).resize(1600, 900, { fit: 'fill' }).jpeg({ quality: 82 }).toFile(path.join(runDirPath, `${name}.jpg`));
    return `${name}.jpg`;
  } catch { return null; }
}

async function boot(page, rec) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__CTX__?.state === 'title' && !!window.__CTX__?.progression?.saves?.store, { timeout: 180000, polling: 200 });
  const wrote = await page.evaluate((r) => { const st = window.__CTX__.progression.saves.store; st.setActive(1); return st.write(r); }, rec);
  if (!wrote?.ok) throw new Error(`start record not written: ${JSON.stringify(wrote)}`);
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
}

async function runLeg(leg, startRec, startName) {
  const L = { leg, from: startName, beats: [], rows: {}, console: [], error: null };
  let vite = null, browser = null, profile = null, slotTaken = false;
  const t0 = Date.now();
  try {
    for (let i = 0; i < 60 && (await portOpen(PORT)); i++) await sleep(500);
    if (await portOpen(PORT)) throw new Error(`port ${PORT} already in use`);
    const slot = await takeMachineSlot({ who: `int e+f hour-two leg ${leg} ${PORT}`, waitS: 1800, log });
    if (!slot.ok) throw new Error(slot.why);
    slotTaken = true;
    L.slotTakenAt = new Date().toISOString();
    L.slotWaitS = Math.round((Date.now() - t0) / 1000);
    const tC = Date.now();   // the leg's cap and its Chrome seconds count from the slot, not from the wait for it
    vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
    for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
    if (!(await portOpen(PORT))) throw new Error(`vite did not open ${PORT}`);
    installProfileCleanup();
    profile = profileDir(PORT);
    browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000,
      args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940',
        '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.25 });
    page.on('console', (m) => { if (m.type() === 'error') L.console.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => L.console.push(`pageerror: ${String(e).slice(0, 300)}`));
    await page.evaluateOnNewDocument(installHitch);
    const rec = { ...startRec, savedAt: Date.now() };
    await boot(page, rec);
    const tPlay = Date.now();
    const K = SH.keys(page);
    const T = () => +((Date.now() - tPlay) / 1000).toFixed(1);
    L.start = { ...(await page.evaluate(where)), hour: await page.evaluate(() => window.__CTX__.environment.time), weather: await page.evaluate(() => window.__CTX__.environment.weather),
      regions: await page.evaluate(() => window.__CTX__.engine.regionStatus?.() ?? null), recordAt: rec.position, shot: await shot(page, runDir, `l${leg}-00-continued`) };
    // row 0 (HT0): is WALK THE LINE offered here (leg 4 starts at 0:55)? The game's own travel seam (hour.js ctx.travel):
    // its nodes and its answer for B1, and the nearest live Instrument that is alert or attacking (the 60 m refusal)
    L.travel = await page.evaluate(() => {
      const C = window.__CTX__, T = C.travel, p = C.player.position;
      let near = null;
      for (const m of C.machines?.list || []) {
        if (!m || m.alive === false || !m.position) continue;
        const d = Math.hypot(m.position.x - p.x, m.position.z - p.z);
        if (!near || d < near.m) near = { kind: m.kind, state: m.state, m: +d.toFixed(1) };
      }
      const wary = (C.machines?.list || []).filter((m) => m && m.alive !== false && m.position && (m.state === 'alert' || m.state === 'attack'))
        .map((m) => +Math.hypot(m.position.x - p.x, m.position.z - p.z).toFixed(1)).sort((a, b) => a - b);
      return { seam: !!T, nodes: T?.nodes?.() ?? null, canWalkB1: T ? (T.canWalk('bm-01') ?? 'offered') : null, nearestInstrument: near, waryWithin60: wary.filter((d) => d < 60).length, nearestWaryM: wary[0] ?? null };
    }).catch((e) => ({ error: String(e).slice(0, 200) }));
    log(`leg ${leg} start: WALK THE LINE to B1 ${JSON.stringify(L.travel)}`);
    L.rows.continued = { pass: Math.hypot(L.start.x - rec.position.x, L.start.z - rec.position.z) < 0.5 && Math.abs(L.start.hour - rec.hour) < 0.05,
      dxz: +Math.hypot(L.start.x - rec.position.x, L.start.z - rec.position.z).toFixed(3), hour: +L.start.hour.toFixed(3), recordHour: rec.hour };
    let k = 0;
    for (const b of beatsOfLeg(leg)) {
      if ((Date.now() - tC) / 1000 > LEG_BUDGET_S) { L.beats.push({ leg, beat: b.id, ok: false, why: `not run: the leg's ${LEG_BUDGET_S} s cap` }); continue; }
      const needs = b.needs.map((id) => [id, NEEDS[id].probe]);
      let driven = null;
      if (DRIVE[b.id]) {
        const maxS = Math.max(60, b.budgetS * 2);
        const tD = Date.now();
        try { driven = await DRIVE[b.id](page, K, b, maxS); } catch (e) { driven = { error: String(e?.message || e).slice(0, 300) }; }
        driven.s = +((Date.now() - tD) / 1000).toFixed(1);
        log(`leg ${leg} ${b.id}: driven in ${driven.s} s ${JSON.stringify(driven).slice(0, 300)}`);
      }
      const pr = await page.evaluate(beatProbe, { id: b.id, quest: b.quest }, needs);
      // wave 1: no beat has a driver. A beat whose needs are all there and that is not reached fails "no driver" (rule 14)
      const why = pr.ok ? null : pr.missing.length ? `not built: ${NEEDS[pr.missing[0]].what}`
        : driven ? `driven, not reached: ${JSON.stringify(driven).slice(0, 200)}` : `no driver: every need is there, the beat is not driven yet (rule 14)`;
      const row = { leg, beat: b.id, ok: pr.ok, why, missing: pr.missing, hp: pr.hp, t: T(), hour: pr.hour, weather: pr.weather, at: pr.at, region: pr.region,
        budgetS: b.budgetS, danger: b.danger ?? null, numbers: { ...pr.numbers, quests: pr.quests, ...(driven ? { driven } : {}), ...(pr.ok && pr.missing.length ? { standIn: true } : {}) } };
      if (driven) row.numbers.yards = await page.evaluate(yardsNow).catch(() => null);
      if (k === 0 || driven) row.shot = await shot(page, runDir, `l${leg}-${String(k + 1).padStart(2, '0')}-${b.id}`);
      k++;
      L.beats.push(row);
      log(`leg ${leg} ${b.id}: ${row.ok ? 'PASS' : 'FAIL'} hp ${row.hp} ${row.why ? `(${row.why.slice(0, 140)})` : ''}`);
    }
    // what a player would see if the leg sat still for 20 s (the world, the weather's own clock): the hitch counter runs
    await sleep(20000);
    L.hitch = await page.evaluate(() => { const H = window.__hitch; return { frames: H.n, maxMs: +H.max.toFixed(1), over33: H.over33, over50: H.over50 }; });
    L.after20s = { ...(await page.evaluate(where)), hour: await page.evaluate(() => +window.__CTX__.environment.time.toFixed(3)), weather: await page.evaluate(() => window.__CTX__.environment.weather) };
    L.endRecordFull = await page.evaluate(() => { const S = window.__CTX__.progression.saves.store, n = S.continueSlot(); return n ? S.latest(n) : null; }).catch(() => null);
    L.endRecordAt = L.endRecordFull ? { kind: L.endRecordFull.kind, reason: L.endRecordFull.reason, hour: L.endRecordFull.hour, x: L.endRecordFull.position?.x, z: L.endRecordFull.position?.z } : null;
    L.end = { ...(await page.evaluate(where)), systemErrors: await page.evaluate(() => (window.__GAME__?.systemErrors || []).map((e) => `${e.key}: ${e.message}`).slice(0, 8)) };
  } catch (e) {
    L.error = String(e?.stack || e).slice(0, 1200);
    log(`leg ${leg} error: ${L.error.slice(0, 300)}`);
  } finally {
    L.chromeSeconds = Math.round((Date.now() - t0) / 1000) - (L.slotWaitS ?? 0);
    try { await browser?.close(); } catch { /* */ }
    if (profile) disposeProfile(profile);
    if (vite) { try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* */ } }
    if (slotTaken) releaseMachineSlot(log);
  }
  for (const b of beatsOfLeg(leg)) if (!L.beats.some((x) => x.beat === b.id)) L.beats.push({ leg, beat: b.id, ok: false, why: L.error ? `not run: the leg stopped (${L.error.slice(0, 100)})` : 'not run' });
  L.passed = `${L.beats.filter((b) => b.ok).length}/${beatsOfLeg(leg).length}`;
  return L;
}

/* ------------------------------------------------------------------ main */

mkdirSync(runDir, { recursive: true });
try {
  let carry = null;
  for (const leg of LEGS) {
    let start = null, name = null;
    if (CHAIN && carry) { start = carry; name = `the record leg ${leg - 1} left in this run (${carry.kind} '${carry.reason}', hour ${carry.hour})`; }
    else if (HANDOFF && handoffs[leg - 1]) { start = handoffs[leg - 1]; name = `the record leg ${leg - 1} left in ${HANDOFF}`; }
    else if (HANDOFF && leg > 4) { report.legs.push({ leg, from: 'handoff', error: `no end record of leg ${leg - 1} in ${HANDOFF}`, beats: beatsOfLeg(leg).map((b) => ({ leg, beat: b.id, ok: false, why: 'not run: no handoff save' })), passed: `0/${beatsOfLeg(leg).length}` }); continue; }
    else { start = fixture(leg); name = `fixture(${leg})`; }
    log(`leg ${leg} from ${name}`);
    const L = await runLeg(leg, start, name);
    carry = L.endRecordFull ?? null;
    report.legs.push(L);
    writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2));
  }
} finally {
  const all = report.legs.flatMap((l) => l.beats || []);
  const want = BEATS.filter((b) => LEGS.includes(b.leg)).length;
  report.beats = `${all.filter((b) => b.ok).length}/${want}`;
  report.chromeSeconds = report.legs.reduce((s, l) => s + (l.chromeSeconds || 0), 0);
  writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2));
  log(`report: ${path.join(runDir, 'report.json')}`);
  for (const l of report.legs) log(`leg ${l.leg}: ${l.passed}${l.error ? ` (error: ${l.error.slice(0, 120)})` : ''}`);
  log(`beats ${report.beats}; ${report.chromeSeconds} s of Chrome`);
}
