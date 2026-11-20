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
 * WAVE 3: the quests are wired (src/game/hour.js publishes ctx.quests). Leg 2 also drives the herd beat (she walks to the
 * lee side of the nearest Tiller from the terrace Plumb and keeps to it); leg 3 drives the re-survey by input (onto
 * B1's pad, V, the look onto each mark's plate as slice-hour's aimPoint steers it, T, held about 5 s each, the last
 * held until the arc closes) and waits for the line to come off the walls. A beat that fails stops the driving of the
 * beats after it in that leg (each is still probed and named).
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
import * as SH from './slice-hour.mjs';
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
const LEG_BUDGET_S = Number(flag('--leg-budget', 720));
// (wave 4) --chain: each leg after the first starts from the record the leg before it left in its store (leg 1's is the
// slice run's newest record, which slice-hour.mjs writes into its report), CONTINUE pressed on it: the save carried
// across the hour, a launch a leg. Without it a leg run alone starts from its fixture.
const CHAIN = args.includes('--chain');
// (M2 fix wave) --from <beat>: leg 2 alone from a mid-leg record (first-hour-fixtures.mjs fixture(2, { from }): 'plumb-2'),
// as the checkpoint at that stage's start writes it; the beats before it are not run (a lane's probe, never the row)
const FROM = flag('--from');
// (M2 fix wave 2) --start-hp N [--start-gourd G]: the fixture's vitals set before it is written (a lane's probe of the
// careful start, restIfLow; never the row)
const START_HP = flag('--start-hp') != null ? Number(flag('--start-hp')) : null;
const START_GOURD = flag('--start-gourd') != null ? Number(flag('--start-gourd')) : null;
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
  // where leg 3's fixture stands her: south of the walls on the Scar's side (first-hour-fixtures.mjs fixture(3))
  southGate: { x: NW.x + 8, z: NW.z + 40 },
  kilnYards: (() => { const s = siteById('kiln-yards'); return { x: s.x, z: s.z }; })(),
};

const report = {
  row: 'A-first-hour', chain: CHAIN, from: FROM, commit, dirty, tree: REPO, port: PORT, startedAt: new Date().toISOString(), legs: [], beats: null,
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
      n.lee = C.systemsGame?.hour?.lastLee ?? null;
      if (!n.tillersNearNinewalls) missing.push('no Tiller herd in the Holds');
      else missing.push('never in a hull\'s shadow from the terrace Plumb\'s lamp (herd-lee)');
      break;
    }
    case 'plumb-2': {
      n.plumbsNearNinewalls = within(live('plumb'), places.ninewalls, 200);
      if (!n.plumbsNearNinewalls) missing.push('no second Plumb on the terrace above Ninewalls');
      else missing.push('the terrace Plumb not toppled (the runner has no topple driver for it yet: slice-hour.mjs fight() is the one that works)');
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
      n.oro = list.some((x) => x.archetype === 'oro' || /oro/i.test(String(x.id ?? x.spec?.id ?? '')));
      if (!n.oro) missing.push('Oro not standing at the tube mouth');
      n.kit = ['gaff', 'windwall', 'brine-pot', 'cinder-pot'].map((id) => [id, C.inventory?.count?.(id) ?? 0]);
      break;
    }
    case 'stall': case 'seal-1': case 'seal-2': {
      n.screedKind = can('screed'); n.screeds = live('screed').length;
      const sc = live('screed')[0];
      const f = sc?.fight?.() ?? null;
      if (f) { n.fight = { mode: f.mode, phase: f.phase, stalls: f.stalls.map((x) => x.by), cuts: f.cuts, seals: f.seals, failSoft: f.failSoft, at: f.at }; }
      if (!n.screedKind) missing.push('no Screed kind registered');
      else if (!n.screeds && !reached.includes('stall')) missing.push('no Screed stood up on the walls');
      else if (f?.failSoft) missing.push(`fail-soft: the Screed cut ${f.cuts.length} walls (${f.cuts.join(', ')})`);
      else missing.push(`stage '${beat}' not reached (stalls ${f ? f.stalls.length : '?'}, seals ${f ? JSON.stringify(f.seals) : '?'})`);
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
      n.resurvey = C.systemsGame?.hour?.resurvey?.report?.() ?? null;
      if (!n.resurveyUi) missing.push('no re-survey overlay');
      else if (!n.resurvey?.done) missing.push(`the re-survey did not close (arc ${n.resurvey?.arc ?? '?'} s, ${n.resurvey?.taken ?? 0} of 3 bearings)`);
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
const where = () => { const C = window.__CTX__, p = C.player, dc = document.querySelector('.mn-death.show'); return { state: C.state, x: p.position.x, y: p.position.y, z: p.position.z, hp: Math.round(p.health ?? 0), dead: !!dc, cause: dc ? ((dc.innerText || '').match(/felled by[^\n]*/i)?.[0] ?? 'died') : null }; };

/* ------------------------------------------------------------------ driving */

async function walkTo(page, target, radius, maxS, { sprint = true } = {}) {
  const t0 = Date.now();
  let best = Infinity, bestAt = Date.now(), hops = 0;
  await page.keyboard.down('KeyW'); if (sprint) await page.keyboard.down('ShiftLeft');
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
  } finally { if (sprint) await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW'); }
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

/**
 * (M2 fix wave 2) A walk that tries again, as a player who walked into a corner turns round: up to three tries from
 * wherever the last one stopped (the nav grid, then the village's road and the grid, then the grid), a drink under 50
 * between them (`K` given). At bff2a10 a 60 s walk from Benchmark 1 to the Ninewalls Brazier stopped 60.2 m short and
 * leg 3 stopped at 'rest-noon'; at 4fe5177 the walk to Oro stopped 51.5 m short.
 */
async function walkSure(page, target, radius, maxS, K = null) {
  const tries = [];
  let w = null;
  for (let i = 0; i < 3; i++) {
    if (K && (await page.evaluate(where)).hp < 50) await SH.drink(page, K, 92);
    w = i === 1 ? await walkRoad(page, target, radius, maxS) : await walkPath(page, target, radius, maxS);
    tries.push({ ok: w.ok, why: w.why ?? null, s: w.s ?? null });
    if (w.ok || w.why === 'died' || /left play/.test(w.why || '')) break;
  }
  return { ...w, tries };
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
  // (M3 fix wave, HR8 "never under 25") her hp on every presented frame in play, not only at the beats: the leg's lowest
  // and when, the lowest since the beat before (`beatMin`, reset by the runner as each beat's drive begins), frames under 25
  const HP = (window.__hp = { n: 0, min: Infinity, minT: null, beatMin: Infinity, under25: 0, t0: performance.now() });
  const tick = (t) => {
    const C = window.__CTX__, L = document.getElementById('loading'), sheet = !!L && !L.classList.contains('hidden');
    const playing = C?.state === 'playing' && !sheet;
    const hp = playing ? C.player?.health : null;
    if (typeof hp === 'number' && Number.isFinite(hp)) {
      HP.n++; if (hp < HP.min) { HP.min = hp; HP.minT = +((t - HP.t0) / 1000).toFixed(1); }
      if (hp < HP.beatMin) HP.beatMin = hp;
      if (hp < 25) HP.under25++;
    }
    if (H.last && playing && H.was) {
      const d = t - H.last;
      if (H.pause || H.skip) { if (!H.pause) H.skip = false; } else { H.n++; if (d > H.max) H.max = d; if (d > 33.4) H.over33++; if (d > 50) H.over50++; }
    }
    H.was = playing; H.last = t; requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const qidOf = (leg) => (leg === 2 ? SCAR_ID : TRUE_GROUND_ID);

async function waitReached(page, qid, beat, ms) {
  const t0 = Date.now();
  for (;;) {
    const ok = await page.evaluate((q, b) => !!window.__CTX__.quests?.[q]?.report?.().reached?.includes(b), qid, beat);
    if (ok) return { ok: true, s: +((Date.now() - t0) / 1000).toFixed(1) };
    if (Date.now() - t0 > ms) return { ok: false, s: +((Date.now() - t0) / 1000).toFixed(1) };
    await sleep(200);
  }
}

/** in-page: steer the look (camYaw / camPitch, what the mouse writes) until the camera's own ray is on (x, y, z). As slice-hour's. */
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
    p.camPitch -= r.dp;
    await raf(); await raf();
    const r2 = read();
    if (Math.abs(r2.dp) > Math.abs(r.dp) * 1.5 && Math.abs(r.dp) > 0.01) { p.camPitch += 2 * r.dp; await raf(); await raf(); }
    r = read();
  }
  return { err: +r.err.toFixed(2), dist: +r.L.toFixed(1) };
}

/**
 * THE HERD BEAT: walk (no sprint) to the lee side of the nearest Tiller from the terrace Plumb, 3 m behind its hull on
 * the line from the Plumb, and keep to it as it walks, until "The Scar" reaches 'herd' or the time is up.
 */
async function driveLee(page, maxS) {
  const t0 = Date.now(), tries = [];
  for (;;) {
    if (await page.evaluate(() => !!window.__CTX__.quests?.['the-scar']?.report?.().reached?.includes('herd'))) return { ok: true, s: +((Date.now() - t0) / 1000).toFixed(1), tries: tries.length, last: tries.at(-1) ?? null };
    if ((Date.now() - t0) / 1000 > maxS) return { ok: false, why: 'no lee reached in time', s: maxS, tries: tries.length, last: tries.at(-1) ?? null };
    const pt = await page.evaluate(() => {
      const C = window.__CTX__, P = C.player.position, H = C.systemsGame?.hour;
      const live = (k) => (C.machines?.list || []).filter((m) => m && m.alive !== false && !m._disposed && m.kind === k);
      const T = H?.sys?.A?.terrace;
      const plumb = live('plumb').filter((m) => T && Math.hypot(m.position.x - T.x, m.position.z - T.z) < 40)[0];
      if (!plumb) return { why: 'no terrace Plumb' };
      // (wave 4) a lee point OFF ITS LINE: at f2a7b10 she stood 3.2 m behind the nearest hull on the Plumb's ray, in the
      // Tiller's own path, and it felled her (run 20261119T175300Z-f2a7b10-systems-w4-leg2, the card: "Stand off its line").
      // Each hull's lee point is scored by its walk from her plus a heavy cost when the point lies ahead of that hull
      // within 3 m of its heading line; the point is 3.6 m behind the hull's centre on the ray from the lamp
      let best = null;
      for (const tl of live('tiller')) {
        const dx = tl.position.x - plumb.position.x, dz = tl.position.z - plumb.position.z, L = Math.hypot(dx, dz) || 1;
        const x = tl.position.x + dx / L * 3.6, z = tl.position.z + dz / L * 3.6;
        const h = tl.sc?.heading ?? tl.heading ?? tl.rotation?.y ?? 0, fx = Math.sin(h), fz = Math.cos(h);
        const ahead = (x - tl.position.x) * fx + (z - tl.position.z) * fz, lat = Math.abs((x - tl.position.x) * fz - (z - tl.position.z) * fx);
        const inLine = ahead > -1 && lat < 3.0;
        const score = Math.hypot(x - P.x, z - P.z) + (inLine ? 200 : 0);
        if (!best || score < best.score) best = { x, z, score, inLine, d: +Math.hypot(tl.position.x - P.x, tl.position.z - P.z).toFixed(1) };
      }
      if (!best) return { why: 'no Tiller' };
      return { x: best.x, z: best.z, d: best.d, inLine: best.inLine, lee: H.lastLee };
    });
    tries.push(pt);
    if (!pt.x) { await sleep(500); continue; }
    const st = await page.evaluate(where);
    if (st.dead) return { ok: false, why: 'died', s: +((Date.now() - t0) / 1000).toFixed(1), tries: tries.length, last: pt };
    if (st.hp < 50) await SH.drink(page, SH.keys(page), 90);
    if (pt.inLine) { await sleep(400); continue; }   // every hull's lee lies in its own path now: wait for one to turn
    if (Math.hypot(pt.x - (await page.evaluate(where)).x, pt.z - (await page.evaluate(where)).z) > 25) await walkPath(page, pt, 4, 30);
    else await walkTo(page, pt, 1.2, 4, { sprint: false });
    await sleep(300);
  }
}

/**
 * THE RE-SURVEY BY INPUT: onto Benchmark 1's pad, V (the Alidade), then for each of the three marks the look steered onto
 * its plate and T pressed, held there ~5 s; the last mark held until the arc closes. Reports the rule's own numbers.
 */
async function driveResurvey(page) {
  const pad = await page.evaluate(() => window.__CTX__.systemsGame?.A?.b1 ?? null);
  if (!pad) return { ok: false, why: 'no pad' };
  const onPad = await walkTo(page, pad, 1.0, 20, { sprint: false });
  await sleep(600);
  // (wave 4) a full staff before the hold: the three Pegs that come to look hit her through it (350540a leg 3: 72 -> 0 hp
  // at 13.7 s of the arc, run 20261119T175642Z-350540a-systems-w4-leg3c); she drinks again under 40 during it
  const K = SH.keys(page);
  const drinks = [];
  // (M2 fix wave) she does not fight them first: the hold is the beat, the lookers come and take turns at her
  // (src/game/resurvey/live.js TURNS). At fa45e47 putting their lamps out from the pad first cost 21 hp before the hold
  // began (72 -> 51) and they hammered her blind through it (51 -> 34)
  const lookers = null;
  const d0 = await SH.drink(page, K, 98); if (d0) drinks.push(d0);
  const lowDrink = async () => { const h = (await page.evaluate(where)).hp; if (h < 40) { const d = await SH.drink(page, K, 85, 3000); if (d) drinks.push(d); if (!(await page.evaluate(() => !!window.__CTX__.sighting?.on))) { await page.keyboard.press('KeyV'); await sleep(700); } } };
  const on = await page.evaluate(() => !!window.__CTX__.sighting?.on);
  if (!on) { await page.keyboard.press('KeyV'); await sleep(900); }
  const marks = await page.evaluate(() => (window.__CTX__.systemsGame?.hour?.resurvey?.R?.marks || []).map((m) => ({ id: m.id, x: m.x, y: m.y1 - 0.3, z: m.z })));
  if (!marks.length) return { ok: false, why: 'the re-survey is not armed', onPad };
  const log = [];
  const t0 = Date.now();
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    const a = await page.evaluate(aimPoint, m.x, m.y, m.z, 0.3);
    await sleep(150);
    await page.keyboard.press('KeyT');
    await sleep(150);
    const holdMs = i < marks.length - 1 ? 5200 : 9000;
    const th = Date.now();
    while (Date.now() - th < holdMs) {
      await page.evaluate(aimPoint, m.x, m.y, m.z, 0.5);
      const r = await page.evaluate(() => window.__CTX__.systemsGame.hour.resurvey.report());
      if (r.done) break;
      if (!r.bearings.find((b) => b.id === m.id)) { await page.keyboard.press('KeyT'); }
      await lowDrink();
      await sleep(250);
    }
    const r = await page.evaluate(() => window.__CTX__.systemsGame.hour.resurvey.report());
    log.push({ mark: m.id, aimErr: a.err, arc: r.arc, taken: r.taken, err: r.err, hp: (await page.evaluate(where)).hp });
    if (r.done) break;
  }
  // hold the last mark until the arc is full (up to 10 s more)
  const last = marks.at(-1);
  for (let k = 0; k < 40; k++) {
    const r = await page.evaluate(() => window.__CTX__.systemsGame.hour.resurvey.report());
    if (r.done) break;
    await lowDrink();
    await page.evaluate(aimPoint, last.x, last.y, last.z, 0.5);
    await sleep(250);
  }
  const rep = await page.evaluate(() => window.__CTX__.systemsGame.hour.resurvey.report());
  return { ok: !!rep.done, onPad, wallS: +((Date.now() - t0) / 1000).toFixed(1), log, report: rep, drinks, lookers };
}


/* ------------------------------------------------------------------ wave 4: the rest of the hour, by input */

const scarNow = () => window.__CTX__.quests?.['the-scar']?.current?.()?.id ?? (window.__CTX__.quests?.['the-scar']?.done ? 'done' : null);
const tgNow = () => window.__CTX__.quests?.['true-ground']?.current?.()?.id ?? (window.__CTX__.quests?.['true-ground']?.done ? 'done' : null);

/**
 * THE SECOND PLUMB, AS A CAREFUL PLAYER TOPPLES IT (M2 fix wave). At fa45e47 leg 2 died at 'plumb-2' in all three exit
 * runs (97-106 hp: Plumb 42-75, Tiller 64, Peg 22) and fired 0-1 arrows: from the herd's lee she walked round the terrace
 * to its far side (75 deg, 26 m), in the open 20 m from the Plumb and across the herd's file, and was felled on the way.
 * Now: out of the herd's way first (12 m from every hull, off every hull's bearing: tiller-herd.js BEARING), then the
 * slice's own topple (the vial from 10-15 m, a drink under 55, out to 14 m when it closes) from stands that are off the
 * herd's bearing and 12 m from its hulls, walked to on a line that keeps 8 m from them (window.__standPts, the stands
 * slice-hour.mjs fight() takes when a caller gives them). The terrace Plumb reads her before it strikes (src/game/hour.js
 * TERRACE).
 */
const herdSafeSrc = () => {
  // in-page: is (x, z) clear of the herd? 12 m from every hull and off each hull's bearing strip (lat 4 m, -6 .. 40 m ahead)
  window.__herdSafe = (x, z, near = 12, lat = 4) => {
    const C = window.__CTX__;
    for (const m of C.machines?.list || []) {
      if (!m || m.kind !== 'tiller' || m.alive === false || m._disposed) continue;
      const dx = x - m.position.x, dz = z - m.position.z;
      if (Math.hypot(dx, dz) < near) return false;
      const h = m.sc?.heading ?? m.heading ?? 0, fx = Math.sin(h), fz = Math.cos(h);
      const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      if (along > -6 && along < 40 && side < lat) return false;
    }
    return true;
  };
  // (M2 fix wave 2) the first 5 m of a walk are hers to leave the hull she stands by: at 02f7125 the chained topple began
  // in a hull's lee 3.6 m behind it, every line's first sample (her own place) failed the 8 m clearance, and three scans
  // of 144 stands found none
  window.__herdSafeLine = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az) || 1;
    for (let k = 1; k <= 10; k++) { const u = k / 10; if (u * L < 5) continue; if (!window.__herdSafe(ax + (bx - ax) * u, az + (bz - az) * u, 8, 3)) return false; }
    return true;
  };
  window.__standPts = (ti) => {
    const C = window.__CTX__, P = C.player.position, t = C.machines.list[ti];
    if (!t) return [];
    const out = [];
    for (let deg = 0; deg < 360; deg += 10) for (const d of [10.5, 12, 13.5, 15]) {
      const a = deg * Math.PI / 180, x = t.position.x + Math.sin(a) * d, z = t.position.z + Math.cos(a) * d;
      if (window.__herdSafe(x, z) && window.__herdSafeLine(P.x, P.z, x, z)) out.push({ x, z, tag: deg });
    }
    window.__standLog = (window.__standLog || []).concat([{ n: out.length, from: { x: +P.x.toFixed(1), z: +P.z.toFixed(1) } }]).slice(-8);
    return out;
  };
  window.__standOnly = true;
};

async function driveTopple(page, K, { maxS = 420 } = {}) {
  await page.evaluate(() => { window.__probeQuest = 'the-scar'; });
  await page.evaluate(herdSafeSrc);
  const out = { steps: [], waits: [], moves: [] };
  const t0 = Date.now(), T = () => +((Date.now() - t0) / 1000).toFixed(1);
  const shot0 = SH.shotLog().length;
  // out of the herd's way: the nearest point (rings of 6-26 m round her) clear of every hull and its bearing
  const away = () => page.evaluate(() => {
    const C = window.__CTX__, P = C.player.position;
    if (window.__herdSafe(P.x, P.z)) return null;
    let best = null;
    for (const r of [6, 10, 14, 20, 26]) for (let deg = 0; deg < 360; deg += 20) {
      const a = deg * Math.PI / 180, x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r;
      if (C.nav?.blockedAt?.(x, z)) continue;
      if (!window.__herdSafe(x, z) || !window.__herdSafeLine(P.x, P.z, x, z)) continue;
      if (!best || r < best.r) best = { x, z, r };
    }
    return best;
  });
  // another place to wait: 20-26 m from the terrace Plumb on its side away from the herd's middle, clear of the herd
  const elsewhere = () => page.evaluate(() => {
    const C = window.__CTX__, P = C.player.position;
    const live = (k) => (C.machines?.list || []).filter((m) => m && m.alive !== false && !m._disposed && m.kind === k);
    const T = C.systemsGame?.hour?.sys?.A?.terrace;
    const pl = live('plumb').filter((m) => T && Math.hypot(m.position.x - T.x, m.position.z - T.z) < 60)[0];
    const herd = live('tiller');
    if (!pl || !herd.length) return null;
    const hx = herd.reduce((a, m) => a + m.position.x, 0) / herd.length, hz = herd.reduce((a, m) => a + m.position.z, 0) / herd.length;
    const base = Math.atan2(pl.position.x - hx, pl.position.z - hz);
    let best = null;
    for (const off of [0, 25, -25, 50, -50, 75, -75]) for (const d of [20, 23, 26]) {
      const a = base + off * Math.PI / 180, x = pl.position.x + Math.sin(a) * d, z = pl.position.z + Math.cos(a) * d;
      if (C.nav?.blockedAt?.(x, z) || !window.__herdSafe(x, z)) continue;
      const score = Math.abs(off) + Math.hypot(x - P.x, z - P.z) * 0.2;
      if (!best || score < best.score) best = { x, z, off, d, score };
    }
    return best;
  });
  try {
    const a0 = await away();
    if (a0) { const w = await walkTo(page, a0, 2, 12, { sprint: false }); out.steps.push({ away: { r: a0.r, ok: w.ok, why: w.why ?? null } }); }
    out.drink = await SH.drink(page, K, 98);
    // THE HERD IN THE WAY (M2 fix wave 2): when no stand is clear of the herd she does not give up while she lives. She
    // waits for it to walk on (it walks its line up and back, tiller-herd.js), leaves its way, and after 20 s without a
    // stand walks to another place on the Plumb's far side from it; each wait is up to 60 s, and she waits again
    let noStandFrom = null, movedAt = 0, threats = 0;
    for (;;) {
      if (await page.evaluate(() => !!window.__CTX__.quests['the-scar'].report().reached.includes('plumb-2'))) { out.ok = true; break; }
      const st = await page.evaluate(where);
      if (st.dead || st.state === 'dead') { out.ok = false; out.why = 'died'; break; }
      if (T() > maxS) { out.ok = false; out.why = `not toppled in ${maxS} s (${out.waits.length} waits for the herd)`; break; }
      const f = await SH.fight(page, K, 'plumb', 'vial', () => 'plumb-2', { stand: 14, maxS: Math.max(20, Math.min(150, maxS - T())), tolDeg: 0.08, reach: 220, threat: { kind: 'tiller', r: 16 } });
      out.steps.push({ t: T(), ok: f.ok, why: f.why ?? null, fired: f.fired, scans: (f.scans || []).length, lastScan: f.ditchScans?.at(-1) ?? f.scans?.at(-1) ?? null });
      if (f.ok) { out.ok = true; break; }
      if (f.why === 'died') { out.ok = false; out.why = 'died'; break; }
      if (f.threat) {
        // (M2 fix wave 2) a Tiller turned on her: out past the herd's leash (hour.js _herdLeash: its line's middle, half
        // its length + the leash), on her side of the line's middle, by the nav grid; there she waits up to 25 s for no
        // Tiller to stand alert within 25 m (a drink under 55), then goes on with the topple. At e04e963 chained run 2 a
        // 22 m sprint from a Tiller at 7.8 m was not enough: it came on and the herd took 100 hp in 13 s (dead at plumb-2)
        threats++;
        const th = f.threat;
        const pt = await page.evaluate((tx, tz) => {
          const C = window.__CTX__, P = C.player.position;
          const blocked = (x, z) => !!C.nav?.blockedAt?.(x, z);
          const herd = (C.machines?.list || []).find((m) => m && m.kind === 'tiller' && m.alive !== false && !m._disposed && m.territory);
          if (herd) {
            const tr = herd.territory, R = tr.r + (herd.ai?.engage?.cfg?.leash ?? 150) + 18;
            if (R < 140) {
              const base = Math.atan2(P.x - tr.x, P.z - tr.z);
              for (const off of [0, 20, -20, 40, -40, 60, -60]) { const a = base + off * Math.PI / 180, x = tr.x + Math.sin(a) * R, z = tr.z + Math.cos(a) * R; if (!blocked(x, z)) return { x, z, R: +R.toFixed(1), off, beyond: true }; }
            }
          }
          const base = Math.atan2(P.x - tx, P.z - tz);
          for (const off of [0, 25, -25, 50, -50, 80, -80]) { const a = base + off * Math.PI / 180, x = tx + Math.sin(a) * 30, z = tz + Math.cos(a) * 30; if (!blocked(x, z)) return { x, z, off, d: 30 }; }
          return null;
        }, th.x, th.z);
        const w = pt ? await walkPath(page, pt, 3, 35) : { ok: false, why: 'no open ground' };
        const tw = Date.now();
        let calm = false;
        while (Date.now() - tw < 25000) {
          const near = await page.evaluate(() => { const C = window.__CTX__, P = C.player.position; return (C.machines?.list || []).filter((m) => m && m.kind === 'tiller' && m.alive !== false && !m._disposed && (m.state === 'alert' || m.state === 'attack') && Math.hypot(m.position.x - P.x, m.position.z - P.z) < 25).length; });
          if (!near) { calm = true; break; }
          if ((await page.evaluate(where)).dead) break;
          await sleep(1000);
        }
        out.moves.push({ t: T(), threat: th, to: pt ? { beyond: !!pt.beyond, R: pt.R ?? null, off: pt.off } : null, ok: w.ok, why: w.why ?? null, calm, waitedS: +((Date.now() - tw) / 1000).toFixed(1), hp: (await page.evaluate(where)).hp });
        if ((await page.evaluate(where)).hp < 55) await SH.drink(page, K, 92);
        continue;
      }
      if (!/no open stand|masked from every stand|stood up/.test(f.why || '')) { noStandFrom = null; continue; }
      noStandFrom ??= Date.now();
      const waited = (Date.now() - noStandFrom) / 1000;
      const a = await away();
      if (a) { const w = await walkTo(page, a, 2, 10, { sprint: false }); out.moves.push({ t: T(), away: a.r, ok: w.ok }); }
      else if (waited > 20 && Date.now() - movedAt > 20000) {
        const e = await elsewhere();
        movedAt = Date.now();
        if (e) { const w = await walkPath(page, e, 2.5, 40); out.moves.push({ t: T(), elsewhere: { off: e.off, d: e.d }, ok: w.ok, why: w.why ?? null }); }
      } else await sleep(2000);
      if (waited > 60) { out.waits.push({ t: T(), s: +waited.toFixed(1) }); noStandFrom = Date.now(); }
    }
    if (noStandFrom) out.waits.push({ t: T(), s: +((Date.now() - noStandFrom) / 1000).toFixed(1), open: true });
    out.why ??= null;
    out.fired = out.steps.reduce((a, q) => a + (q.fired || 0), 0);
    out.threats = threats;
    // every arrow of this topple as fight() logged it: range, the Plumb's state, the predicted first hit, the vial's count
    out.shots = SH.shotLog().slice(shot0).map((q) => ({ part: q.part, state: q.state ?? null, d: q.d, blocked: !!q.blocked, first: q.predicted?.first ?? null, missM: q.predicted?.missM ?? null, vial: q.vialHits ?? null, still: q.still ?? null }));
    out.cause = (await page.evaluate(where)).cause;
    out.stands = await page.evaluate(() => window.__standLog || null);
    out.rule = await page.evaluate(() => window.__CTX__.systemsGame?.hour?.terraceRule ?? null);
    return out;
  } finally { await page.evaluate(() => { window.__probeQuest = null; window.__standPts = undefined; window.__standOnly = false; }); }
}

/** BARBED ARROWS: the bow in hand, X until the Barbed arrow is on the string, R held (the quick-make), as a player makes them. */
async function driveBarbed(page, K) {
  await K.tap('Digit1'); await sleep(250);
  const ammoId = () => page.evaluate(() => window.__CTX__.combat?.activeWeapon?.activeAmmo ?? null);
  for (let i = 0; i < 5 && (await ammoId()) !== 'hardpoint'; i++) { await K.tap('KeyX'); await sleep(180); }
  const on = await ammoId();
  const before = await page.evaluate(() => window.__CTX__.combat?.ammo?.hardpoint ?? null);
  const why = await page.evaluate(() => window.__CTX__.combat?.craftBlocker?.('hardpoint') ?? window.__CTX__.combat?.canCraft?.('hardpoint') ?? null).catch(() => null);
  for (let i = 0; i < 2; i++) {
    await K.down('KeyR'); await sleep(1800); await K.up('KeyR'); await sleep(400);
    if (await page.evaluate(() => !!window.__CTX__.quests['the-scar'].report().reached.includes('barbed'))) break;
  }
  const after = await page.evaluate(() => window.__CTX__.combat?.ammo?.hardpoint ?? null);
  // back to the Reed arrow for what follows
  for (let i = 0; i < 5 && (await ammoId()) !== 'hunter'; i++) { await K.tap('KeyX'); await sleep(180); }
  return { selected: on, canCraft: why, before, after };
}

/** ORO: to the tube mouth, E, his scene played through (Space, and the exit station). */
async function driveOro(page, K) {
  const A = await page.evaluate(() => window.__CTX__.systemsGame.A.oro);
  // (M2 fix wave 2) up to three tries, the village's road on the second, a drink under 50 between them: at 4fe5177
  // chained run 1 the one 60 s walk from the terrace stopped 51.5 m short while the stood-up terrace Plumb's Sightline
  // took her 75 -> 25, and the leg stopped at 'oro'
  const w = await walkSure(page, A, 2.4, 60, K);
  const tries = w.tries;
  await sleep(400);
  await SH.holdE(page, K, 500);
  await sleep(400);
  await page.evaluate(() => { window.__probeQuest = 'the-scar'; });
  try { await SH.playScene(page, K, 60); } finally { await page.evaluate(() => { window.__probeQuest = null; }); }
  const r = await waitReached(page, SCAR_ID, 'oro', 6000);
  return { walk: { ok: w.ok, why: w.why ?? null, tries }, reached: r.ok, kit: await page.evaluate(() => ({ gaff: !!window.__CTX__.player?.hero?.kit?.gaff, given: !!window.__CTX__.systemsGame?.hour?._kitGiven })) };
}

/**
 * The Screed, as the runner sees it, against Ninewalls' walls (the walls seam's own module: the page's instance, so its
 * cut state is the game's): where it and she stand from the village's centre (r, compass bearing), its heading, the
 * fight's own report, and the first whole wall between them (a charge at her meets it and stalls).
 */
const screedNow = async () => {
  const W = await import('/src/world/settlements/ninewalls-layout.js');
  const C = window.__CTX__, P = C.player.position;
  const m = (C.machines?.list || []).find((q) => q && q.kind === 'screed' && q.alive !== false && !q._disposed);
  if (!m) return null;
  const f = m.fight?.() ?? {};
  const h = m.brain?.heading ?? 0;
  const seals = Object.entries(f.seals || {}).filter(([, v]) => v !== 'off').map(([k]) => k);
  const wall = W.segmentHitsWall(m.position.x, m.position.z, P.x, P.z, 0);
  const cs = W.CENTRE, w1 = W.WALLS[0], w2 = W.WALLS[1];
  const q = window.__CTX__.quests['the-scar'];
  return { i: C.machines.list.indexOf(m), x: m.position.x, z: m.position.z, heading: h, fx: Math.sin(h), fz: Math.cos(h), phase: f.phase ?? null, mode: f.mode ?? null,
    sealsLeft: seals, seals: f.seals, hits: { sealL: m.brain?.parts?.sealL?.hits ?? null, sealR: m.brain?.parts?.sealR?.hits ?? null }, cuts: (f.cuts || []).length, stalls: (f.stalls || []).length, stallBy: (f.stalls || []).map((x) => x.by), failSoft: !!f.failSoft,
    backT: +(m.fightRules?.backT ?? 0).toFixed(2), cd: +(m.fightRules?.cd ?? 0).toFixed(2),
    d: Math.hypot(m.position.x - P.x, m.position.z - P.z), px: P.x, pz: P.z, hp: Math.round(C.player.health),
    // her side of its heading (+ right) and how far in front of it she stands
    ahead: (P.x - m.position.x) * Math.sin(h) + (P.z - m.position.z) * Math.cos(h), side: (P.x - m.position.x) * Math.cos(h) - (P.z - m.position.z) * Math.sin(h),
    rS: Math.hypot(m.position.x - cs.x, m.position.z - cs.z), bS: W.bearingOf(m.position.x, m.position.z), rP: Math.hypot(P.x - cs.x, P.z - cs.z), bP: W.bearingOf(P.x, P.z),
    between: wall?.id ?? null,
    // corridor 1/2 (between the outer wall and the second): its two faces and where its arcs end
    c12: { cx: cs.x, cz: cs.z, rIn: w2.r + w2.t / 2, rOut: w1.r - w1.t / 2, end: Math.min(w1.to, w2.to), end2: Math.max(w1.to, w2.to), from: Math.max(w1.from, w2.from) },
    stage: q.current()?.id ?? 'done', reached: q.report().reached };
};

/** in-page: a point at compass bearing b, r m from Ninewalls' centre (the walls seam's polar) */
const polarNW = async (b, r) => { const W = await import('/src/world/settlements/ninewalls-layout.js'); const p = W.polar(b, r); return { x: p.x, z: p.z }; };

/** Is she in the Screed's line (where its charge goes)? */
const inLineOf = (S) => S.ahead > -2 && S.ahead < 28 && Math.abs(S.side) < 4.2;

/**
 * May she loose on a seal now? Nothing whole between them, it near, its front toward her (the rams face its heading),
 * and never with a charge able to come: in 'come' and walking, within its charge band and cone with its cooldown run
 * (at the third probe a shot loosed in its walk took 1.5 s, its wind-up came inside it and the blade took 32 hp).
 */
const mayShoot = (S) => {
  if (!S || !S.sealsLeft.length || S.between || S.d >= 24 || S.phase === 'windup' || S.phase === 'charge') return false;
  const ang = Math.abs(Math.atan2(S.side, S.ahead));
  const facing = S.ahead > 0.5 && ang < ((S.phase === 'stall' || S.backT > 0) ? 1.6 : 1.2);
  const chargeable = S.mode === 'come' && S.phase === 'walk' && S.backT <= 0 && S.cd < 2.0 && S.d > 5.5 && S.d < 26 && ang < 0.8;
  return facing && !chargeable && (S.phase === 'stall' || S.backT > 0 || S.mode === 'done' || !inLineOf(S));
};

/**
 * (M3 fix wave, area E) A CLEAR LINE TO A SEAL. At ddc31c1 every chained run ended fail-soft: in the wall-2 stall she
 * stood beside the Screed (2.6 m ahead of its centre, 5.5 m to its left), and from there the far seal sits behind the
 * near one: the straight line from her nock to it passes 0.2-0.3 m from the near seal's centre (the seals are 1.9 m
 * apart across its front, 1.6 m ahead of its centre). The game's flight was solved onto the far seal (first: its weak
 * sphere, 1 cm) and the arrow met the near ram, every run (hits 0.19-0.23 m from the near seal: the near one's hit, or
 * once it was off, a wasted arrow). A line is CLEAR here when the game's own ballistic solution meets that seal first
 * AND the line from her nock and the one from the lens both pass the other seal (on or off: its ram is still there)
 * by at least SEAL_MARGIN.
 * in-page: per seal, where it is, its state, and those two margins from where she stands now (or from `stand`, her
 * nock and lens carried there as they sit about her now, turned to face the seal).
 */
// 0.45 m: the near seal's hit counts within 0.266 m of its centre, and at ddc31c1 the real arrow strayed up to about
// 0.2 m from the solved line beside it; at f5c955a (probe e-stall-p1) lines of 1.18-1.31 m all struck the far seal
const SEAL_MARGIN = 0.45;
// a stand's margins are read from her nock and lens carried there; at f5c955a one read 0.71 m and gave 0.45 m once she
// stood there with the bow raised, so a stand must clear the bar by this much more
const STAND_SLACK = 0.4;
const sealGeom = (mi, stand = null) => {
  const C = window.__CTX__, m = C.machines.list[mi], P = C.player.position, cb = C.combat, T = C.terrain;
  if (!m || !m._sealW) return null;
  const V = C.camera.position.constructor;
  const nk = new V(), cam = new V(), dir = new V();
  try { cb.bow.getNockWorld(1, nk); } catch { nk.set(P.x, P.y + 1.45, P.z); }
  if (!(nk.y - P.y > 0.6 && nk.y - P.y < 2.4)) nk.set(P.x, P.y + 1.45, P.z);
  C.camera.getWorldPosition(cam); C.camera.getWorldDirection(dir);
  const seals = {};
  for (const w of m._sealW) seals[w.name] = { c: w.obj.getWorldPosition(new V()), r: w.radius, on: w.enabled !== false };
  // her nock and lens about her, in the frame of the look (forward f, right r, up): carried to `stand` facing the seal
  const f0 = Math.atan2(dir.x, dir.z);
  const local = (q) => { const dx = q.x - P.x, dz = q.z - P.z; return { a: dx * Math.sin(f0) + dz * Math.cos(f0), s: dx * Math.cos(f0) - dz * Math.sin(f0), y: q.y - P.y }; };
  const nL = local(nk), cL = local(cam);
  const segDist = (o, t, q) => {
    const dx = t.x - o.x, dy = t.y - o.y, dz = t.z - o.z, L2 = dx * dx + dy * dy + dz * dz;
    const u = L2 > 1e-9 ? Math.max(0, Math.min(1, ((q.x - o.x) * dx + (q.y - o.y) * dy + (q.z - o.z) * dz) / L2)) : 0;
    return Math.hypot(o.x + dx * u - q.x, o.y + dy * u - q.y, o.z + dz * u - q.z);
  };
  const out = { at: stand ? [+stand.x.toFixed(2), +stand.z.toFixed(2)] : [+P.x.toFixed(2), +P.z.toFixed(2)] };
  const sy = stand ? T.getHeight(stand.x, stand.z) : P.y;
  for (const [name, s] of Object.entries(seals)) {
    const other = Object.entries(seals).find(([k]) => k !== name)?.[1];
    let o1 = nk, o2 = cam;
    if (stand) {
      const f = Math.atan2(s.c.x - stand.x, s.c.z - stand.z), sf = Math.sin(f), cf = Math.cos(f);
      const at = (L) => new V(stand.x + sf * L.a + cf * L.s, sy + L.y, stand.z + cf * L.a - sf * L.s);
      o1 = at(nL); o2 = at(cL);
    }
    out[name] = { on: s.on, c: [+s.c.x.toFixed(2), +s.c.y.toFixed(2), +s.c.z.toFixed(2)],
      mNock: other ? +segDist(o1, s.c, other.c).toFixed(3) : 9, mLens: other ? +segDist(o2, s.c, other.c).toFixed(3) : 9,
      nock: [o1.x, o1.y, o1.z], lens: [o2.x, o2.y, o2.z] };
    out[name].margin = Math.min(out[name].mNock, out[name].mLens);
  }
  return out;
};

/**
 * in-page: A STAND WITH A CLEAR LINE to one of `parts` (the seals still on), as a player steps round for a better
 * angle: points 2.4-7 m to either side of the Screed and 1-8 m ahead of its centre, on her side of every wall (whole
 * or cut: the walk there and the line from there to the Screed cross none), on ground within 1.5 m of hers, clear of
 * its body and its blade box, never where mayShoot holds the bow (in its cone, 0.8 rad, beyond 5.5 m while it walks, or
 * not facing it), each line passing the other seal by SEAL_MARGIN + STAND_SLACK (sealGeom's margins, carried to the stand); the nearest walk wins.
 * Returns { stand, part, margin, d, n (candidates), why } or { stand: null, best (the widest margin seen), n, why }.
 */
const sealStand = async (mi, parts, margin, slack) => {
  const W = await import('/src/world/settlements/ninewalls-layout.js');
  const C = window.__CTX__, m = C.machines.list[mi], P = C.player.position, T = C.terrain;
  if (!m) return { stand: null, why: 'no Screed' };
  const h = m.brain?.heading ?? m.heading, fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
  const walking = (m.brain?.phase === 'walk') && !((m.fightRules?.backT ?? 0) > 0);
  const geom = window.__sealGeom, HH = C.hitHulls, V = C.camera.position.constructor;
  const why = { wall: 0, ground: 0, body: 0, cone: 0, margin: 0, line: 0 };
  const ray = { origin: new V(), direction: new V() };
  const first = (o, t, exact) => {
    ray.origin.set(o[0], o[1], o[2]); ray.direction.set(t[0] - o[0], t[1] - o[1], t[2] - o[2]);
    const L = ray.direction.length(); ray.direction.multiplyScalar(1 / L);
    const h = HH?.raycast?.(ray, { far: L + 0.3, exact });
    return h && h.hit ? { name: h.name || 'hull', m: h.machine === m, d: h.distance, L } : { name: null, d: Infinity, L };
  };
  const lineTo = (g, p) => {
    const q = g?.[p];
    if (!q || !HH?.raycast) return !HH?.raycast;
    const a = first(q.nock, q.c, true), b = first(q.lens, q.c, false);
    return a.name === `weak:${p}` && !(b.name && b.d < b.L - 0.6);
  };
  let best = null, bestSeen = null, n = 0;
  for (let a = 1; a <= 8.01; a += 0.5) {
    for (let s0 = 2.4; s0 <= 7.01; s0 += 0.5) {
      for (const sg of [-1, 1]) {
        const s = s0 * sg, x = m.position.x + fx * a + rx * s, z = m.position.z + fz * a + rz * s;
        n++;
        if (Math.abs(T.getHeight(x, z) - P.y) > 1.5) { why.ground++; continue; }
        if (W.segmentHitsWall(P.x, P.z, x, z, 0.45, { includeCut: true }) || W.segmentHitsWall(m.position.x, m.position.z, x, z, 0, {})) { why.wall++; continue; }
        // the walk there keeps 2.6 m off its centre, and the stand is off its blade box (3.6 m ahead, 2.2 m to a side)
        const dx = x - P.x, dz = z - P.z, L2 = dx * dx + dz * dz, u = L2 > 1e-6 ? Math.max(0, Math.min(1, ((m.position.x - P.x) * dx + (m.position.z - P.z) * dz) / L2)) : 0;
        if (Math.hypot(P.x + dx * u - m.position.x, P.z + dz * u - m.position.z) < 2.6 || (a < 4.2 && Math.abs(s) < 2.4)) { why.body++; continue; }
        const d = Math.hypot(x - m.position.x, z - m.position.z), ang = Math.abs(Math.atan2(s, a));
        // (mayShoot's own 'chargeable': no arrow is loosed there while it walks)
        if (walking && d > 5.5 && ang < 0.8) { why.cone++; continue; }
        // and mayShoot's 'facing': in front of it, within 1.2 rad of its heading while it walks (1.6 stalled or backing)
        if (!(a > 0.5 && ang < (walking ? 1.2 : 1.6))) { why.facing = (why.facing || 0) + 1; continue; }
        const g = geom(mi, { x, z });
        for (const p of parts) {
          const mg = g?.[p]?.margin ?? 0;
          if (!bestSeen || mg > bestSeen.margin) bestSeen = { part: p, margin: mg, a, s, at: [+x.toFixed(1), +z.toFixed(1)] };
          if (mg < margin + slack) { why.margin++; continue; }
          // the straight line from there meets that seal's own sphere first (the moldboard stands 1.4 m tall in front of
          // the seals at 1.34 m; the flight's drop over 8 m is 2 cm), and the lens's line meets no hull short of it
          if (!lineTo(g, p)) { why.line++; continue; }
          const walk = Math.sqrt(L2);
          if (walk > 7) { why.far = (why.far || 0) + 1; continue; }
          if (!best || walk < best.d) best = { stand: { x, z }, part: p, margin: mg, d: +walk.toFixed(1), a, s };
        }
      }
    }
  }
  return best ? { ...best, n, why } : { stand: null, best: bestSeen, n, why };
};

/**
 * A VOLLEY ON THE SEALS: the bow kept raised (RMB held) while she may shoot, each arrow on the first seal the game's own
 * flight reaches from here (solveShot), Steady taken fresh, drawn until full, loosed only if the flight still meets that
 * seal first; a blocked draw is let down (RMB let go before LMB: combat.js keeps the arrow) and the bow raised again.
 * It ends when no seal is clear for 0.7 s, she may no longer shoot, or `maxS` runs out. Raised during its charge (she
 * is out of its line) so the first arrow leaves as the stall begins. At 72b3f5e (chain1) the wall-2 stall gave three
 * clean hits in 5.2 s, one arrow at a time with the bow lowered between them; both seals take four.
 */
async function volley(page, K, stage, maxS = 8) {
  const t0 = Date.now(), shots = [];
  let blocked = null, drawing = false, td = 0, needStand = false;
  const draw = async () => { if (drawing) return; await K.up('ShiftLeft'); await sleep(30); await K.down('ShiftLeft'); await sleep(30); await K.mouse('left', true); drawing = true; td = Date.now(); };
  await K.mouse('right', true); await sleep(200);
  try {
    while ((Date.now() - t0) / 1000 < maxS) {
      const S = await page.evaluate(screedNow);
      if (!S || (S.stage !== 'seal-1' && S.stage !== 'seal-2')) break;
      // its charge, she out of its line: the arrow nocked and drawn, held full for the stall
      if (S.phase === 'charge' && !inLineOf(S) && S.sealsLeft.length) { await draw(); await sleep(40); continue; }
      if (!mayShoot(S)) break;
      // (M3 fix wave) only a seal with a CLEAR LINE (sealGeom: both lines pass the other seal by SEAL_MARGIN) and the
      // game's flight on it first; the far seal first when both are clear (its line closes as the Screed comes on), else
      // the near one. At ddc31c1 the far seal was tried first from beside it and the arrows met the near ram (the near
      // seal's hit, or once it was off, nothing). No clear line: the volley ends and the drive steps to a stand
      const near = S.side >= 0 ? 'sealR' : 'sealL', far = near === 'sealR' ? 'sealL' : 'sealR';
      const G = await page.evaluate((i) => window.__sealGeom(i), S.i);
      const order = (S.sealsLeft.length === 2 ? [far, near] : S.sealsLeft.slice()).filter((p) => (G?.[p]?.margin ?? 0) >= SEAL_MARGIN);
      let part = null, sol = null;
      for (const p of order) { const q = await page.evaluate(SH.solveShot, S.i, p, 0.12); if (q && q.first === `weak:${p}`) { part = p; sol = q; break; } }
      if (!part) {
        blocked ??= Date.now();
        if (!order.length || Date.now() - blocked > 700) { shots.push({ t: +((Date.now() - t0) / 1000).toFixed(1), none: true, phase: S.phase, margins: G ? Object.fromEntries(S.sealsLeft.map((p) => [p, G[p]?.margin ?? null])) : null }); needStand = true; break; }
        continue;
      }
      blocked = null;
      await draw();
      while (Date.now() - td < 1600) { sol = await page.evaluate(SH.solveShot, S.i, part, 0.12); if (!sol || (sol.ds >= 0.99 && Date.now() - td > 300)) break; }
      const G2 = await page.evaluate((i) => window.__sealGeom(i), S.i);
      const rec = { t: +((Date.now() - t0) / 1000).toFixed(1), part, phase: S.phase, d: +S.d.toFixed(1), side: +S.side.toFixed(1), hitsBefore: S.hits, first: sol?.first ?? null, missM: sol?.missM ?? null, ds: sol?.ds ?? null,
        mNock: G2?.[part]?.mNock ?? null, mLens: G2?.[part]?.mLens ?? null };
      if (sol && sol.first === `weak:${part}` && (G2?.[part]?.margin ?? 0) >= SEAL_MARGIN) { await K.mouse('left', false); rec.fired = true; await sleep(100); }
      else { await K.mouse('right', false); await sleep(30); await K.mouse('left', false); await sleep(30); await K.mouse('right', true); await sleep(200); rec.letDown = true; }
      drawing = false;
      shots.push(rec);
    }
  } finally {
    if (drawing) { try { await K.mouse('right', false); } catch { /* */ } await sleep(30); }
    try { await K.mouse('left', false); } catch { /* not held */ }
    await K.up('ShiftLeft');
    try { await K.mouse('right', false); } catch { /* not held */ }
  }
  await sleep(250);
  const hits = await page.evaluate((n) => window.__screedHits.slice(-n), Math.max(1, shots.filter((q) => q.fired).length));
  return { shots, hits, needStand, s: +((Date.now() - t0) / 1000).toFixed(1) };
}

/**
 * THE SCREED BY INPUT (M2 fix wave 2: stall, seal-1, seal-2), as a player on Ninewalls' terraces plays it. At 02f7125 the
 * runner walked at a point 10 m in front of the Screed, outside the outer wall: from Oro (inside the ninth wall) that is
 * round the walls' ends, it engaged her at 45 m on the way, walked in and cut three walls in 60 s with no charge
 * (fail-soft: stall, seal-1 and seal-2 not reached). Now:
 *   STALL   she goes out round the south end of the inner walls and into the corridor between the outer wall and the
 *           second (its east mouth, by the Scar), and along it toward the Screed's bearing: the Screed engages, she
 *           stands 7-24 m in front of it with the whole outer wall between them, and its charge at her meets the wall.
 *   SEALS   it backs off, cuts the outer wall and comes into her corridor. She waits off its line, 4-6 m to one side
 *           and 8-12 m in front of it; in its wind-up she steps 5 m further out of its line, and the charge meets the
 *           second wall beside her. In that stall, and while it backs off, an arrow on the nearest seal on her side,
 *           two each (screed-rules.js IN6), the near one first; with no wall between them she shoots it walking too.
 */
async function driveScreed(page, K, stage, maxS = 120) {
  const t0 = Date.now(), log = [];
  const T = () => +((Date.now() - t0) / 1000).toFixed(1);
  let shots = 0, lastPhase = null, sidestepS = -1, approach = null;
  const standLog = [];
  const note = (S, extra = {}) => log.push({ t: T(), phase: S.phase, mode: S.mode, d: +S.d.toFixed(1), ahead: +S.ahead.toFixed(1), side: +S.side.toFixed(1), rS: +S.rS.toFixed(1), bS: +S.bS.toFixed(1), rP: +S.rP.toFixed(1), bP: +S.bP.toFixed(1), between: S.between, hp: S.hp, cuts: S.cuts, stalls: S.stalls, seals: S.seals, ...extra });
  if (stage !== 'stall') await SH.readyBow(page, K); else { await K.tap('Digit1'); await sleep(200); }
  // every arrow that meets the Screed: where, against each seal's own place (screed.js takeDamage counts a hit within
  // the seal's radius + 0.05 m)
  await page.evaluate(() => {
    if (window.__screedHits) return;
    window.__screedHits = [];
    const C = window.__CTX__, V = C.camera.position.constructor;
    C.events.on('arrow-hit', (e) => {
      const m = e.machine;
      if (!m || m.kind !== 'screed') return;
      const near = {};
      for (const w of m._sealW || []) { const q = w.obj.getWorldPosition(new V()); near[w.name] = +q.distanceTo(e.point).toFixed(3); }
      window.__screedHits.push({ t: +(performance.now() / 1000).toFixed(1), weak: !!e.weak, dmg: Math.round(e.damage ?? 0), near, r: +((m._sealW?.[0]?.radius ?? 0) + 0.05).toFixed(3) });
    });
  });
  const done = (S) => (stage === 'stall' ? S.stage !== 'stall' : (S.stage !== 'seal-1' && S.stage !== 'seal-2'));
  for (;;) {
    const S = await page.evaluate(screedNow);
    if (!S) return { ok: false, why: 'no Screed', log: log.slice(-40) };
    if (done(S)) { note(S, { end: true, hits: S.hits }); return { ok: true, s: T(), shots, arrowHits: await page.evaluate(() => window.__screedHits.slice(-12)), log: log.slice(-40), cuts: S.cuts, stalls: S.stalls, stallBy: S.stallBy, failSoft: S.failSoft, approach, stands: standLog.slice(-20) }; }
    if (T() > maxS) { note(S, { timeout: true }); return { ok: false, why: `${stage}: not done in ${maxS} s (phase ${S.phase}, seals ${JSON.stringify(S.seals)}, cuts ${S.cuts})`, shots, log: log.slice(-40), approach, stands: standLog.slice(-20) }; }
    const st = await page.evaluate(where);
    if (st.dead || st.state === 'dead') return { ok: false, why: 'died', log: log.slice(-40), approach };
    if (S.phase !== lastPhase) { note(S); lastPhase = S.phase; }
    const C12 = S.c12, rMid = (C12.rIn + C12.rOut) / 2;
    if (stage === 'stall') {
      // out of the village and into corridor 1/2 by its east mouth, then along it to 4 deg past the Screed's bearing
      if (!approach) {
        approach = { mouth: await page.evaluate(polarNW, (C12.end + C12.end2) / 2, rMid), tries: [] };
        // (M2 fix wave 2) tried again from where a try stopped (walkSure), a drink under 50 first
        approach.walk = await walkSure(page, approach.mouth, 3, 90, K);
        approach.tries = approach.walk.tries;
        approach.at = { t: T(), rP: +S.rP.toFixed(1), bP: +S.bP.toFixed(1) };
        const S2 = await page.evaluate(screedNow);
        note(S2, { mouth: true, walk: approach.walk.ok });
        continue;
      }
      if (S.phase === 'windup' || S.phase === 'charge' || S.phase === 'stall') { await sleep(120); continue; }
      const want = S.bS + 4;
      if (S.bP - want > 2.5) {
        const b = Math.max(want, S.bP - 6);
        await walkTo(page, await page.evaluate(polarNW, b, rMid), 1.6, 3);
      } else await sleep(150);
      continue;
    }
    // seal-1 / seal-2
    // a drink under 50 when the gourd holds one (SH.drink answers null at once on an empty gourd: at f0053bc final2 she
    // asked again every pass with 41 hp and a dry gourd, stood still after the first stall and the Screed cut three walls)
    if (st.hp < 50 && S.phase !== 'windup' && S.phase !== 'charge' && (await SH.drink(page, K, 92, 3500))) continue;
    const inLine = inLineOf(S);
    if (S.phase === 'charge') {
      // out of its line while it runs: the bow up, the first arrow ready for the stall
      if (!inLine && !S.between && S.sealsLeft.length && S.d < 24) { const v = await volley(page, K, stage); shots += v.shots.filter((q) => q.fired).length; log.push({ t: T(), volley: v }); }
      else await sleep(80);
      continue;
    }
    if (S.phase === 'windup' && !S.between && inLine && sidestepS !== S.stalls * 100 + S.cuts) {
      // its wind-up (1.2 s): 5 m further out of its line, square to its heading, to the side she already leans to
      sidestepS = S.stalls * 100 + S.cuts;
      // to the side she leans to, unless that step leaves the corridor's floor (a wall stops her short, in its path)
      const at = (sg) => ({ x: S.px + S.fz * sg * 5.5, z: S.pz - S.fx * sg * 5.5 });
      const onFloor = (q) => { const r = Math.hypot(q.x - C12.cx, q.z - C12.cz); return r > C12.rIn + 0.6 && r < C12.rOut - 0.8; };
      let sgn = S.side >= 0 ? 1 : -1;
      if (S.rP > C12.rIn - 0.5 && S.rP < C12.rOut + 0.5 && !onFloor(at(sgn)) && onFloor(at(-sgn))) sgn = -sgn;
      // (M3 fix wave) and up to 3 m further along its heading, as far as the corridor's floor goes: the charge stops on the
      // second wall, so the further she stands along its line, the further in front of its seals she is in the stall. At
      // 2e0a3cd (probe e-stall-p2) she stood 2.8 m ahead of its centre, 5.6 m to a side: the far seal's line passed the near
      // one by 0.21-0.36 m (a stand 2.8 m further on had 0.89 m), and only one arrow reached it before it walked on
      const fwd = (q, k) => ({ x: q.x + S.fx * k, z: q.z + S.fz * k });
      const k = [3, 2.5, 2, 1.5, 1, 0.5, 0].find((kk) => onFloor(fwd(at(sgn), kk)) && (kk === 0 || onFloor(fwd(at(sgn), kk / 2)))) ?? 0;
      await walkTo(page, fwd(at(sgn), k), 0.8, 2.0);
      note(await page.evaluate(screedNow), { sidestep: true, fwd: k });
      continue;
    }
    if (!S.sealsLeft.length) { await sleep(200); continue; }
    if (mayShoot(S)) {
      const v = await volley(page, K, stage);
      shots += v.shots.filter((q) => q.fired).length;
      log.push({ t: T(), volley: v });
      if (v.needStand) {
        // (M3 fix wave) no clear line to a seal still on from here: a stand that has one, if a player can reach it
        const S2 = await page.evaluate(screedNow);
        if (S2 && S2.sealsLeft.length) {
          const st = await page.evaluate(sealStand, S2.i, S2.sealsLeft, SEAL_MARGIN, STAND_SLACK);
          const rec = { t: T(), stand: st.stand ? { part: st.part, margin: +st.margin.toFixed(3), d: st.d, a: st.a, s: st.s } : null, best: st.best ?? null, why: st.why, phase: S2.phase, backT: S2.backT };
          standLog.push(rec);
          if (st.stand) { rec.walk = await walkTo(page, st.stand, 0.5, 3, { sprint: st.d > 3 }); continue; }
        }
        // none: stand still while it is stalled or backing off (its front opens as it backs), else the ambush below
        if (S2 && (S2.phase === 'stall' || S2.backT > 0)) { await sleep(150); continue; }
      } else if (!v.shots.some((q) => q.fired)) await sleep(150);
      if (!v.needStand) continue;
    }
    // (M3 fix wave) after the seal stall, while it walks: a stand with a clear line (out of its cone, facing it) before the
    // ambush. At f5c955a (probe e-stall-p1) the far seal took one arrow as it backed off; when its line closed she went
    // back to the ambush point, it walked on and cut wall-2 and wall-3
    if (S.stalls >= 2 && S.phase === 'walk' && !S.between) {
      const st = await page.evaluate(sealStand, S.i, S.sealsLeft, SEAL_MARGIN, STAND_SLACK);
      const rec = { t: T(), stand: st.stand ? { part: st.part, margin: +st.margin.toFixed(3), d: st.d, a: st.a, s: st.s } : null, best: st.best ?? null, why: st.why, phase: S.phase, backT: S.backT, walking: true };
      standLog.push(rec);
      if (st.stand) { rec.walk = await walkTo(page, st.stand, 0.5, 3, { sprint: st.d > 3 }); continue; }
    }
    // the ambush point: 10 m in front of it and 5 m to one side, kept on corridor 1/2's floor while it is outside or in it
    const sgn = S.side >= 0 ? 1 : -1, rx = S.fz * sgn, rz = -S.fx * sgn;
    let gx = S.x + S.fx * 10 + rx * 5, gz = S.z + S.fz * 10 + rz * 5;
    if (S.rS > C12.rIn - 1) {
      const W = await page.evaluate(async (x, z) => { const W = await import('/src/world/settlements/ninewalls-layout.js'); return { b: W.bearingOf(x, z), r: Math.hypot(x - W.CENTRE.x, z - W.CENTRE.z) }; }, gx, gz);
      const r = Math.min(C12.rOut - 2.2, Math.max(C12.rIn + 1.3, W.r));
      const q = await page.evaluate(polarNW, W.b, r); gx = q.x; gz = q.z;
    }
    if (Math.hypot(gx - S.px, gz - S.pz) > 1.6) await walkTo(page, { x: gx, z: gz }, 1.2, 2.2);
    else { await page.evaluate(face, S.x, S.z); await sleep(120); }
  }
}

/** THE REST AT NINEWALLS: to the Brazier, E held to kindle it, E to sit; the dialog's selected row read off the page; Enter. */
async function driveRest(page, K) {
  const A = await page.evaluate(() => { const b = window.__CTX__.braziers?.byId?.('ninewalls'); return b ? { x: b.obj.position.x, z: b.obj.position.z, seat: b.obj.seat ? { x: b.obj.seat.x, z: b.obj.seat.z } : null } : null; });
  if (!A) return { ok: false, why: 'no Ninewalls Brazier' };
  const out = {};
  // (M2 fix wave) the Instruments that came to look stand down when the mark is taken (src/game/hour.js: docile, back
  // on their loop): she does not fight them on the way. At fa45e47 run 2 putting their lamps out cost 31 -> 4 hp here
  out.lookers = await page.evaluate(() => (window.__CTX__.systemsGame?.hour?.spawned?.lookers || []).filter((m) => m && m.alive !== false && !m._disposed).map((m) => ({ state: m.state, docile: !!m.docile })));
  // to the bowl itself (its prompt's radius is 2.6 m; f2a7b10 stopped by the seat 3 m off with no prompt up)
  // (M2 fix wave 2) by the south gate (the way she came from it to Benchmark 1): at 37ca861 chained run 3 every try of
  // the nav grid's line from the pad stopped 57 m short against the slope below the walls, and the road's 128.6 m short
  out.gate = null;
  if (Math.hypot(A.x - (await page.evaluate(where)).x, A.z - (await page.evaluate(where)).z) > 40) {
    const g = await walkSure(page, PLACES.southGate, 4, 60, K);
    out.gate = { ok: g.ok, why: g.why ?? null, tries: g.tries };
  }
  const w = await walkSure(page, A, 1.3, 60, K);
  out.walk = { ok: w.ok, why: w.why ?? null, tries: w.tries };
  await sleep(300);
  const prompt = () => page.evaluate(() => window.__CTX__.interactables?.current?.label ?? null);
  out.prompt0 = await prompt();
  const mode = () => page.evaluate(() => window.__CTX__.braziers.dialog('ninewalls')?.mode ?? null);
  out.mode0 = await mode();
  if (out.mode0 === 'kindle') {
    for (let i = 0; i < 3 && !(await page.evaluate(() => window.__CTX__.braziers.lit.has('ninewalls'))); i++) { await SH.holdE(page, K, 2600); await sleep(400); }
    out.kindled = await page.evaluate(() => window.__CTX__.braziers.lit.has('ninewalls'));
    out.prompt1 = await prompt();
  }
  out.mode1 = await mode();
  if (out.mode1 === 'refused') {
    out.refusedBy = await page.evaluate(() => window.__CTX__.braziers.dialog('ninewalls')?.by ?? null);
    // a careful player waits for the lamps to settle (up to 20 s), then tries again
    for (let i = 0; i < 20 && (await mode()) === 'refused'; i++) await sleep(1000);
  }
  await SH.holdE(page, K, 600);
  await sleep(500);
  out.dialog = await page.evaluate(() => ({ open: !!window.__CTX__.systemsGame?.present?.busy, rows: [...document.querySelectorAll('#cal-sys .sys-row')].map((r) => ({ label: r.firstChild?.textContent ?? '', sel: r.classList.contains('sel'), forecast: r.querySelector('small')?.textContent ?? '' })), refuse: document.querySelector('#cal-sys .sys-refuse')?.textContent ?? null }));
  out.shot = await shot(page, 'l3-rest-dialog');
  out.hour0 = await page.evaluate(() => +window.__CTX__.environment.time.toFixed(3));
  out.saves0 = await page.evaluate(() => { const S = window.__CTX__.progression.saves.store, n = S.continueSlot(); const r = n ? S.latest(n) : null; return r ? { kind: r.kind, reason: r.reason, savedAt: r.savedAt } : null; });
  await K.tap('Enter');
  for (let i = 0; i < 30; i++) { await sleep(300); if (await page.evaluate(() => !window.__CTX__.braziers.resting && !window.__CTX__.systemsGame.present.busy)) break; }
  await sleep(800);
  out.hour1 = await page.evaluate(() => +window.__CTX__.environment.time.toFixed(3));
  out.saves1 = await page.evaluate(() => { const S = window.__CTX__.progression.saves.store, n = S.continueSlot(); const r = n ? S.latest(n) : null; return r ? { kind: r.kind, reason: r.reason, savedAt: r.savedAt, hour: r.hour } : null; });
  // the rest writes the NAMED record; the stage after it writes its checkpoint at once, so the newest is that checkpoint
  out.named1 = await page.evaluate(() => { const S = window.__CTX__.progression.saves.store, n = S.continueSlot(); const r = n ? S.read(n, 'named') : null; return r ? { kind: r.kind, reason: r.reason, savedAt: r.savedAt, hour: r.hour } : null; });
  out.namedSave = !!out.named1 && out.named1.reason === 'brazier' && out.named1.savedAt > (out.saves0?.savedAt ?? 0);
  // she stands up from the seat
  await K.tap('KeyW'); await sleep(300);
  return out;
}

/**
 * (M2 fix wave 2) A CAREFUL START: leg 2 begins where the slice ended, at Saltrow. Under 60 hp she drinks; still under 60
 * with the gourd dry, she rests at her cistern's Brazier first (the dialog's first row, dawn: a rest refills the
 * gourds, BIBLE 17) and drinks to full. At d25575a chained run 3 the slice ended at 11 hp with a dry gourd, she set out
 * for the Holds like that and the terrace Plumb's Sightline killed her on the way to Oro.
 */
async function restIfLow(page, K) {
  const s0 = await page.evaluate(SH.probe);
  if (s0.hp == null || s0.hp >= 60) return null;
  const out = { hp0: s0.hp, gourd0: s0.gourd ?? null, hour0: await page.evaluate(() => +window.__CTX__.environment.time.toFixed(3)) };
  out.drink0 = await SH.drink(page, K, 98);
  if ((await page.evaluate(SH.probe)).hp >= 60) return out;
  const A = await page.evaluate(() => { const b = window.__CTX__.braziers?.byId?.('cistern'); return b ? { x: b.obj.position.x, z: b.obj.position.z } : null; });
  if (!A) return { ...out, why: 'no cistern Brazier' };
  const w = await walkSure(page, A, 1.3, 60, null);
  out.walk = { ok: w.ok, why: w.why ?? null, tries: w.tries };
  await sleep(300);
  await SH.holdE(page, K, 600);
  await sleep(600);
  out.dialog = await page.evaluate(() => ({ open: !!window.__CTX__.systemsGame?.present?.busy, rows: [...document.querySelectorAll('#cal-sys .sys-row')].map((r) => ({ label: r.firstChild?.textContent ?? '', sel: r.classList.contains('sel') })) }));
  await K.tap('Enter');
  for (let i = 0; i < 40; i++) { await sleep(300); if (await page.evaluate(() => !window.__CTX__.braziers.resting && !window.__CTX__.systemsGame.present.busy)) break; }
  await sleep(800);
  await K.tap('KeyW'); await sleep(300);
  out.drink1 = await SH.drink(page, K, 98, 9000);
  const s1 = await page.evaluate(SH.probe);
  Object.assign(out, { hp1: s1.hp, gourd1: s1.gourd ?? null, hour1: await page.evaluate(() => +window.__CTX__.environment.time.toFixed(3)) });
  return out;
}

/** CALIMA AT NOON, AND THE CROSSING: the weather read until it is calima (asked for at noon), then to the Malpais edge. */
async function driveCross(page) {
  const out = {};
  const t0 = Date.now();
  // (M2 fix wave) she sets off at once (the calima is asked for the first frame of the window and comes on as she walks):
  // at fa45e47 the walk to the edge was 64 s of play, 0.78 game hours, and the window is one hour
  for (let i = 0; i < 4; i++) { const w = await page.evaluate(() => ({ asked: window.__CTX__.systemsGame?.hour?._calimaAsked ?? null, weather: window.__CTX__.environment.weather, calimaW: +(window.__CTX__.environment.weatherParams?.calima ?? 0).toFixed(2), hour: +window.__CTX__.environment.time.toFixed(3) })); out.weather = w; if (w.asked) break; await sleep(500); }
  out.askedAfterS = +((Date.now() - t0) / 1000).toFixed(1);
  const at = await page.evaluate(() => { const H = window.__CTX__.systemsGame?.hour; H?._malpaisEdge?.(); return window.__CTX__.systemsGame.A['malpais-edge'] ?? null; });
  if (!at) return { ...out, ok: false, why: 'no Malpais edge anchor' };
  out.anchor = at;
  out.walk = await walkSure(page, at, 4, 120);
  out.reached = await waitReached(page, TRUE_GROUND_ID, 'calima-cross', 6000);
  out.calimaW = await page.evaluate(() => +(window.__CTX__.environment.weatherParams?.calima ?? 0).toFixed(2));
  out.shot = await shot(page, 'l3-calima-edge');
  return out;
}

/** READ THE TRANSIT: the Alidade up (V), the look onto the far form's head and held; the card read off the page. */
async function driveTransit(page, K) {
  const out = {};
  const head = await page.evaluate(() => { const H = window.__CTX__.systemsGame?.hour; const f = H?._transitFar?.(); return f?.head ? { x: f.head.x, y: f.head.y, z: f.head.z, standIn: !!f.standIn } : null; });
  if (!head) return { ok: false, why: 'no far form to read' };
  out.far = head;
  if (!(await page.evaluate(() => !!window.__CTX__.sighting?.on))) { await K.tap('KeyV'); await sleep(900); }
  for (let i = 0; i < 12; i++) {
    out.aim = await page.evaluate(aimPoint, head.x, head.y, head.z, 0.5);
    await sleep(250);
    if (await page.evaluate(() => !!window.__CTX__.quests['true-ground'].report().reached.includes('read-transit'))) break;
  }
  out.card = await page.evaluate(() => ({ line: document.querySelector('#cal-sys .sys-far b')?.textContent ?? null, on: !!document.querySelector('#cal-sys .sys-far.on'), hour: +window.__CTX__.environment.time.toFixed(3) }));
  out.shot = await shot(page, 'l3-transit-card');
  if (await page.evaluate(() => !!window.__CTX__.sighting?.on)) { await K.tap('KeyV'); await sleep(300); }
  return out;
}

/* ------------------------------------------------------------------ one leg in its own launch */

async function boot(page, leg, startRec = null) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__CTX__?.state === 'title' && !!window.__CTX__?.progression?.saves?.store, { timeout: 180000, polling: 200 });
  // the fixture, written as a save on disk is: into the store, then the game opened again (the title reads it at boot)
  const rec = startRec ? { ...startRec, savedAt: Date.now() } : { ...fixture(leg, leg === 2 && FROM ? { from: FROM } : {}), savedAt: Date.now() };
  if (!startRec && START_HP != null) rec.vitals = { ...rec.vitals, health: START_HP, ...(START_GOURD != null ? { gourd: START_GOURD } : {}) };
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

async function runLeg(leg, startRec = null) {
  const L = { leg, from: startRec ? `the record leg ${leg - 1} left (${startRec.kind} '${startRec.reason}', hour ${startRec.hour})` : `fixture(${leg})`, beats: [], rows: {}, console: [], error: null };
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
    await page.evaluateOnNewDocument(`window.__aimPoint = ${SH.aimPoint.toString()};`);
    await page.evaluateOnNewDocument(`window.__sealGeom = ${sealGeom.toString()};`);
    const K = SH.keys(page);
    const rec = await boot(page, leg, startRec);
    const tPlay = Date.now();
    const T = () => +((Date.now() - tPlay) / 1000).toFixed(1);
    // the crossings the regions seam fires from here on
    // what hurt her, and when (each 'player-damage' with its source's kind): a beat's numbers carry its share
    await page.evaluate(() => { const C = window.__CTX__; window.__dmg = []; C.events.on('player-damage', (e) => { const f = e?.from, P = C.player?.position; window.__dmg.push({ t: +(performance.now() / 1000).toFixed(1), kind: f?.kind ?? e?.source ?? e?.type ?? '?', n: Math.round(e?.amount ?? 0), atk: f?._attack?.kind ?? null, st: f?.state ?? null, d: f?.position && P ? +Math.hypot(f.position.x - P.x, f.position.z - P.z).toFixed(1) : null }); }); });
    await page.evaluate(() => { window.__regionEv = []; const C = window.__CTX__; for (const k of ['enter', 'leave', 'approach', 'depart']) C.events.on(`region-${k}`, (e) => window.__regionEv.push({ k, region: e.region, t: +(performance.now() / 1000).toFixed(2), depth: e.depth })); window.__t0 = performance.now() / 1000; });
    L.start = { ...(await page.evaluate(where)), hour: await page.evaluate(() => window.__CTX__.environment.time), regions: await page.evaluate(() => window.__CTX__.engine.regionStatus?.() ?? null), fixtureAt: rec.position, shot: await shot(page, `l${leg}-00-continued`) };
    L.rows.continued = { pass: Math.hypot(L.start.x - rec.position.x, L.start.z - rec.position.z) < 0.5 && Math.abs(L.start.hour - rec.hour) < 0.05,
      dxz: +Math.hypot(L.start.x - rec.position.x, L.start.z - rec.position.z).toFixed(3), hour: +L.start.hour.toFixed(3) };
    if (leg === 2 && !(FROM && !startRec)) L.prep = await restIfLow(page, K);
    const stages = beatsOf(leg);
    const qid = leg === 2 ? SCAR_ID : TRUE_GROUND_ID;
    let k = 0, driveOn = true;
    const skipTo = leg === 2 && FROM && !startRec ? stages.findIndex((q) => q.id === FROM) : -1;
    for (const st of stages) {
      if (skipTo > 0 && stages.indexOf(st) < skipTo) { L.beats.push({ leg, beat: st.id, ok: false, skipped: true, why: `not run: --from ${FROM}` }); continue; }
      if ((Date.now() - tC) / 1000 > LEG_BUDGET_S) { L.beats.push({ leg, beat: st.id, ok: false, why: `not run: the leg's ${LEG_BUDGET_S} s cap` }); continue; }
      const bt0 = T();
      const played = {};
      await page.evaluate(() => { if (window.__hp) window.__hp.beatMin = Infinity; });
      if (!driveOn) played.notDriven = 'a beat before it did not pass';
      else if (st.id === 'walk') {
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
        played.walk = await walkSure(page, PLACES.b1, 4, 90, K);
      } else if (st.id === 'herd') {
        played.lee = await driveLee(page, 60);
      } else if (st.id === 'survey') {
        played.resurvey = await driveResurvey(page);
        played.alidade = await page.evaluate(() => ({ on: !!window.__CTX__.sighting?.on }));
      } else if (st.id === 'plumb-2') {
        played.topple = await driveTopple(page, K);
      } else if (st.id === 'barbed') {
        played.barbed = await driveBarbed(page, K);
      } else if (st.id === 'oro') {
        played.oro = await driveOro(page, K);
      } else if (st.id === 'stall' || st.id === 'seal-1' || st.id === 'seal-2') {
        // the seals are one fight: seal-1's drive runs until both are off (or the fight ends), seal-2 reads what it did
        if (st.id !== 'seal-2' || !(await page.evaluate(() => window.__CTX__.quests['the-scar'].report().reached.includes('seal-2')))) played.screed = await driveScreed(page, K, st.id, st.id === 'stall' ? 150 : 120);
        if (st.id === 'seal-2') played.checkpoint = await waitReached(page, SCAR_ID, 'seal-2', 3000);
      } else if (st.id === 'rest-noon') {
        played.rest = await driveRest(page, K);
      } else if (st.id === 'calima-cross') {
        played.cross = await driveCross(page);
      } else if (st.id === 'read-transit') {
        played.transit = await driveTransit(page, K);
      } else if (st.id === 'fade') {
        // the line comes off the walls after the re-survey: wait for the stage (up to 8 s)
        played.fadeWait = await waitReached(page, qidOf(leg), 'fade', 8000);
        await page.evaluate(async () => {
          try { const W = await import('/src/world/settlements/ninewalls-layout.js'); window.__wallsPainted = (W.WALLS || []).filter((w) => W.wallState?.(w.id)?.painted).length; } catch { window.__wallsPainted = null; }
        });
      }
      played.hurt = await page.evaluate(() => { const D = window.__dmg.splice(0); const by = {}, atk = {}; for (const d of D) { by[d.kind] = (by[d.kind] || 0) + d.n; const k = `${d.kind}:${d.atk}`; atk[k] = (atk[k] || 0) + d.n; } return { by, atk, n: D.length, all: D.slice(-30) }; });
      const pr = await page.evaluate(beatProbe, st.id, qid, PLACES, TRANSIT_CARD);
      const hpMin = await page.evaluate(() => (window.__hp && Number.isFinite(window.__hp.beatMin) ? Math.round(window.__hp.beatMin) : null));
      const b = { leg, beat: st.id, ok: pr.ok, why: pr.why, hp: pr.hp, hpMin, t: T(), seconds: +(T() - bt0).toFixed(1), hour: pr.hour, at: pr.at, region: pr.region, numbers: { ...pr.numbers, ...played } };
      b.shot = await shot(page, `l${leg}-${String(++k).padStart(2, '0')}-${st.id}`);
      L.beats.push(b);
      log(`leg ${leg} ${st.id}: ${b.ok ? 'PASS' : 'FAIL'} hp ${b.hp} t ${b.t} s ${b.why ? `(${b.why.slice(0, 160)})` : ''}`);
      if (st.id === 'survey' && played.alidade?.on) { await page.keyboard.press('KeyV'); await sleep(400); }
      // a beat that did not pass stops the leg's driving: the beats after it wait on it (each still probed and named)
      if (!b.ok) driveOn = false;
    }
    L.hitch = await page.evaluate(() => { const H = window.__hitch; return { frames: H.n, maxMs: +H.max.toFixed(1), over33: H.over33, over50: H.over50 }; });
    // (M3 fix wave) HR8 between the beats: her lowest hp on any frame of the leg in play (window.__hp, installHitch)
    L.hp = await page.evaluate(() => { const P = window.__hp; return P ? { frames: P.n, min: Number.isFinite(P.min) ? Math.round(P.min) : null, minT: P.minT, under25Frames: P.under25 } : null; }).catch(() => null);
    // (M3 fix wave) the late audio bank's log from real play (GameAudio.lateAudit: every late set's decode and first ask,
    // the leads, any set asked for before it was decoded)
    L.lateAudit = await page.evaluate(() => window.__CTX__.audio?.lateAudit?.() ?? null).catch((e) => ({ error: String(e).slice(0, 200) }));
    // the record this leg leaves (the next leg's start with --chain): the store's newest, as CONTINUE would load it
    L.endRecord = await page.evaluate(() => { const S = window.__CTX__.progression.saves.store, n = S.continueSlot(); return n ? S.latest(n) : null; }).catch(() => null);
    L.endRecordAt = L.endRecord ? { kind: L.endRecord.kind, reason: L.endRecord.reason, hour: L.endRecord.hour, x: L.endRecord.position?.x, z: L.endRecord.position?.z } : null;
    L.hour = await page.evaluate(() => window.__CTX__.systemsGame?.hour?.report?.() ?? null).catch(() => null);
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
  L.passed = `${done}/${beatsOf(leg).length}${L.beats.some((b) => b.skipped) ? ` (from ${FROM})` : ''}`;
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
        L.beats = (r.beats || []).map((b) => ({ leg: 1, beat: b.stage, ok: !!b.ok, why: b.ok ? null : (b.why || r.why || 'stopped'), hp: b.hp ?? null, hpMin: b.hpMin ?? null, seconds: b.seconds ?? null }));
        L.hp = r.hp ?? null; L.lateAudit = r.lateAudit ?? null;
        L.reached = r.spine?.reached ?? null; L.stoppedAt = r.stoppedAt; L.why = r.why; L.hitch = r.hitch ?? null; L.rows = Object.fromEntries(Object.entries(r.rows || {}).map(([k, v]) => [k, v?.pass ?? v?.ok ?? null]));
        L.chromeSeconds = r.chromeSeconds ?? L.chromeSeconds;
        L.endRecord = r.finalRecord ?? null;
        L.endRecordAt = r.finalRecord ? { kind: r.finalRecord.kind, reason: r.finalRecord.reason, hour: r.finalRecord.hour } : null;
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
  let carry = null;
  for (const leg of LEGS) {
    log(`leg ${leg}${CHAIN && carry ? ' (from the record the leg before left)' : ''}`);
    const L = leg === 1 ? await runLeg1() : await runLeg(leg, CHAIN ? carry : null);
    carry = L.endRecord ?? null;
    if (L.endRecord) { L.endRecord = undefined; }
    report.legs.push(L);
    writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2));
  }
} finally {
  const all = report.legs.flatMap((l) => l.beats);
  const want = (LEGS.includes(1) ? 14 : 0) + (LEGS.includes(2) ? SCAR_STAGES.length : 0) + (LEGS.includes(3) ? TRUE_GROUND_STAGES.length : 0);
  report.beats = `${all.filter((b) => b.ok).length}/${want}`;
  report.chromeSeconds = report.legs.reduce((s, l) => s + (l.chromeSeconds || 0), 0);
  const lows = report.legs.map((l) => l.hp?.min).filter((v) => v != null);
  report.hr8 = { bar: 'hp never under 25 on any frame in play (HR8)', lowest: lows.length ? Math.min(...lows) : null, pass: lows.length === report.legs.length && lows.every((v) => v >= 25) };
  writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2));
  log(`report: ${path.join(runDir, 'report.json')}`);
  for (const l of report.legs) log(`leg ${l.leg}: ${l.passed}${l.error ? ` (error: ${l.error.slice(0, 120)})` : ''}; lowest hp ${l.hp?.min ?? '?'} (${l.hp?.under25Frames ?? '?'} frames under 25); late bank ${l.lateAudit ? `${l.lateAudit.state}, ${l.lateAudit.asked} asked, ${(l.lateAudit.missed || []).length} missed` : 'not read'}`);
  log(`beats ${report.beats}; ${report.chromeSeconds} s of Chrome; HR8 lowest hp ${report.hr8.lowest} (${report.hr8.pass ? 'PASS' : 'FAIL'})`);
}
