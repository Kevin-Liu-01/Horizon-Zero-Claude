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
  row: 'A-first-hour', chain: CHAIN, commit, dirty, tree: REPO, port: PORT, startedAt: new Date().toISOString(), legs: [], beats: null,
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
      if (!n.screedKind) missing.push('no Screed kind registered');
      else if (!n.screeds) missing.push('no Screed stood up on the walls');
      else missing.push('the Screed fight is not driven by this runner yet (its rules are graded in Node: tools/instruments/screed-fight.test.mjs)');
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
const where = () => { const C = window.__CTX__, p = C.player; return { state: C.state, x: p.position.x, y: p.position.y, z: p.position.z, hp: Math.round(p.health ?? 0), dead: !!document.querySelector('.mn-death.show') }; };

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
      const tl = live('tiller').sort((a, b) => Math.hypot(a.position.x - P.x, a.position.z - P.z) - Math.hypot(b.position.x - P.x, b.position.z - P.z))[0];
      if (!tl) return { why: 'no Tiller' };
      const dx = tl.position.x - plumb.position.x, dz = tl.position.z - plumb.position.z, L = Math.hypot(dx, dz) || 1;
      return { x: tl.position.x + dx / L * 3.2, z: tl.position.z + dz / L * 3.2, d: +Math.hypot(tl.position.x - P.x, tl.position.z - P.z).toFixed(1), lee: H.lastLee };
    });
    tries.push(pt);
    if (!pt.x) { await sleep(500); continue; }
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
    await page.evaluate(aimPoint, last.x, last.y, last.z, 0.5);
    await sleep(250);
  }
  const rep = await page.evaluate(() => window.__CTX__.systemsGame.hour.resurvey.report());
  return { ok: !!rep.done, onPad, wallS: +((Date.now() - t0) / 1000).toFixed(1), log, report: rep };
}


/* ------------------------------------------------------------------ wave 4: the rest of the hour, by input */

const scarNow = () => window.__CTX__.quests?.['the-scar']?.current?.()?.id ?? (window.__CTX__.quests?.['the-scar']?.done ? 'done' : null);
const tgNow = () => window.__CTX__.quests?.['true-ground']?.current?.()?.id ?? (window.__CTX__.quests?.['true-ground']?.done ? 'done' : null);

/** THE SECOND PLUMB: toppled as the slice's topple is (slice-hour.mjs fight(): the vial, Reed arrows, the stands it scans). */
async function driveTopple(page, K) {
  await page.evaluate(() => { window.__probeQuest = 'the-scar'; });
  try {
    const T = await page.evaluate(() => window.__CTX__.systemsGame.A.terrace);
    const w = await walkPath(page, T, 34, 60);
    const f = await SH.fight(page, K, 'plumb', 'vial', () => 'plumb-2', { stand: 28, maxS: 150, tolDeg: 0.08, reach: 220 });
    return { walk: { ok: w.ok, why: w.why ?? null }, ok: f.ok, why: f.why ?? null, fired: f.fired, scans: (f.scans || []).length };
  } finally { await page.evaluate(() => { window.__probeQuest = null; }); }
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
  const w = await walkPath(page, A, 2.4, 60);
  await sleep(400);
  await SH.holdE(page, K, 500);
  await sleep(400);
  await page.evaluate(() => { window.__probeQuest = 'the-scar'; });
  try { await SH.playScene(page, K, 60); } finally { await page.evaluate(() => { window.__probeQuest = null; }); }
  const r = await waitReached(page, SCAR_ID, 'oro', 6000);
  return { walk: { ok: w.ok, why: w.why ?? null }, reached: r.ok, kit: await page.evaluate(() => ({ gaff: !!window.__CTX__.player?.hero?.kit?.gaff, given: !!window.__CTX__.systemsGame?.hour?._kitGiven })) };
}

/** The Screed, as the runner sees it: where it stands, its heading, the fight's own report. */
const screedNow = () => {
  const C = window.__CTX__, P = C.player.position;
  const m = (C.machines?.list || []).find((q) => q && q.kind === 'screed' && q.alive !== false && !q._disposed);
  if (!m) return null;
  const f = m.fight?.() ?? {};
  const h = m.brain?.heading ?? 0;
  const seals = Object.entries(f.seals || {}).filter(([, v]) => v !== 'off').map(([k]) => k);
  return { i: C.machines.list.indexOf(m), x: m.position.x, z: m.position.z, heading: h, fx: Math.sin(h), fz: Math.cos(h), phase: f.phase ?? null, mode: f.mode ?? null,
    sealsLeft: seals, seals: f.seals, cuts: (f.cuts || []).length, stalls: (f.stalls || []).length, failSoft: !!f.failSoft,
    d: Math.hypot(m.position.x - P.x, m.position.z - P.z), px: P.x, pz: P.z, hp: Math.round(C.player.health),
    // her side of its heading (+ right) and how far in front of it she stands
    ahead: (P.x - m.position.x) * Math.sin(h) + (P.z - m.position.z) * Math.cos(h), side: (P.x - m.position.x) * Math.cos(h) - (P.z - m.position.z) * Math.sin(h),
    stage: window.__CTX__.quests['the-scar'].current()?.id ?? 'done' };
};

/** One arrow on a part of machine i: RMB, Steady, the draw with the look on the game's own flight, loosed. */
async function looseOn(page, K, i, part, { drawMs = 850, tolDeg = 0.12 } = {}) {
  await K.mouse('right', true); await sleep(320);
  await K.up('ShiftLeft'); await sleep(40); await K.down('ShiftLeft'); await sleep(50);
  await K.mouse('left', true);
  const t0 = Date.now();
  let sol = null;
  try {
    while (Date.now() - t0 < drawMs || (sol && sol.ds < 0.99 && Date.now() - t0 < drawMs + 700)) {
      sol = await page.evaluate(SH.solveShot, i, part, tolDeg);
      if (!sol) break;
    }
  } finally {
    try { await K.mouse('left', false); } catch { /* */ }
    await sleep(Math.max(450, 1000 * (sol?.tf ?? 0) + 200));
    await K.up('ShiftLeft');
    try { await K.mouse('right', false); } catch { /* */ }
  }
  return sol ? { first: sol.first, missM: sol.missM, clear: sol.clear, ds: sol.ds } : null;
}

/**
 * THE SCREED BY INPUT (stall, seal-1, seal-2), the wall trick as the Node twin plays it (tools/instruments/screed-fight
 * .test.mjs): out of the village to 10 m in front of it, between it and the outer wall; a 5 m sidestep in its wind-up;
 * its charge meets the wall and stalls; then arrows on the ram seals from beside it (two each), the nearest first.
 */
async function driveScreed(page, K, stage, maxS = 120) {
  const t0 = Date.now(), log = [];
  let sidestepped = false, shots = 0, lastPhase = null;
  await K.tap('Digit1'); await sleep(200);
  for (;;) {
    const S = await page.evaluate(screedNow);
    if (!S) return { ok: false, why: 'no Screed', log };
    if (S.stage !== stage) return { ok: true, s: +((Date.now() - t0) / 1000).toFixed(1), shots, log: log.slice(-12), cuts: S.cuts, stalls: S.stalls };
    if ((Date.now() - t0) / 1000 > maxS) return { ok: false, why: `${stage}: not done in ${maxS} s (phase ${S.phase}, seals ${JSON.stringify(S.seals)}, cuts ${S.cuts})`, shots, log: log.slice(-12) };
    const st = await page.evaluate(where);
    if (st.dead || st.state === 'dead') return { ok: false, why: 'died', log };
    if (S.phase !== lastPhase) { log.push({ t: +((Date.now() - t0) / 1000).toFixed(1), phase: S.phase, mode: S.mode, d: +S.d.toFixed(1), ahead: +S.ahead.toFixed(1), side: +S.side.toFixed(1), hp: S.hp, cuts: S.cuts }); lastPhase = S.phase; }
    if (S.phase !== 'windup' && S.phase !== 'charge') sidestepped = false;
    if (st.hp < 45) await SH.drink(page, K, 92);
    // its wind-up: step out of its line, 5 m to the side she already leans to
    if ((S.phase === 'windup' || S.phase === 'charge') && Math.abs(S.side) < 4 && S.ahead > 0 && !sidestepped) {
      sidestepped = true;
      const sgn = S.side >= 0 ? 1 : -1, rx = S.fz * sgn, rz = -S.fx * sgn;
      await walkTo(page, { x: S.px + rx * 5.5, z: S.pz + rz * 5.5 }, 0.8, 2.2);
      continue;
    }
    if (stage === 'stall') {
      // in front of it, 10 m, on its line, while it walks (or waits)
      if (S.phase === 'walk' || S.phase === 'wait' || S.phase == null) {
        const goal = { x: S.x + S.fx * 10, z: S.z + S.fz * 10 };
        const dg = Math.hypot(goal.x - S.px, goal.z - S.pz);
        if (dg > 2.2) { if (dg > 25) await walkPath(page, goal, 2, 12); else await walkTo(page, goal, 1.5, 4); }
        else await sleep(150);
        // face it (the charge reads her in front; the look does not matter to it, but she watches it)
        await page.evaluate(face, S.x, S.z);
      } else await sleep(100);
      continue;
    }
    // seal-1 / seal-2: beside it, not in its line, and an arrow on the nearest seal not off
    if (!S.sealsLeft.length) { await sleep(200); continue; }
    if (Math.abs(S.side) < 4 && S.ahead > 0 && S.ahead < 26 && S.phase !== 'stall') {
      const sgn = S.side >= 0 ? 1 : -1;
      await walkTo(page, { x: S.x + S.fx * 8 + S.fz * sgn * 7, z: S.z + S.fz * 8 - S.fx * sgn * 7 }, 1.2, 3);
      continue;
    }
    if (S.d > 22) { await walkTo(page, { x: S.x + S.fx * 8 + S.fz * 7, z: S.z + S.fz * 8 - S.fx * 7 }, 2, 6); continue; }
    const part = S.sealsLeft.length === 2 ? (S.side >= 0 ? 'sealR' : 'sealL') : S.sealsLeft[0];
    const r = await looseOn(page, K, S.i, part);
    shots++;
    log.push({ t: +((Date.now() - t0) / 1000).toFixed(1), shot: part, phase: S.phase, d: +S.d.toFixed(1), ...(r || {}) });
  }
}

/** THE REST AT NINEWALLS: to the Brazier, E held to kindle it, E to sit; the dialog's selected row read off the page; Enter. */
async function driveRest(page, K) {
  const A = await page.evaluate(() => { const b = window.__CTX__.braziers?.byId?.('ninewalls'); return b ? { x: b.obj.position.x, z: b.obj.position.z, seat: b.obj.seat ? { x: b.obj.seat.x, z: b.obj.seat.z } : null } : null; });
  if (!A) return { ok: false, why: 'no Ninewalls Brazier' };
  const w = await walkPath(page, A.seat ?? A, 1.6, 60);
  const out = { walk: { ok: w.ok, why: w.why ?? null } };
  const mode = () => page.evaluate(() => window.__CTX__.braziers.dialog('ninewalls')?.mode ?? null);
  out.mode0 = await mode();
  if (out.mode0 === 'kindle') { await SH.holdE(page, K, 2400); await sleep(400); out.kindled = await page.evaluate(() => window.__CTX__.braziers.lit.has('ninewalls')); }
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
  out.namedSave = !!out.saves1 && out.saves1.kind === 'named' && out.saves1.reason === 'brazier' && out.saves1.savedAt !== out.saves0?.savedAt;
  // she stands up from the seat
  await K.tap('KeyW'); await sleep(300);
  return out;
}

/** CALIMA AT NOON, AND THE CROSSING: the weather read until it is calima (asked for at noon), then to the Malpais edge. */
async function driveCross(page) {
  const out = {};
  const t0 = Date.now();
  for (let i = 0; i < 40; i++) { const w = await page.evaluate(() => ({ asked: window.__CTX__.systemsGame?.hour?._calimaAsked ?? null, weather: window.__CTX__.environment.weather, calimaW: +(window.__CTX__.environment.weatherParams?.calima ?? 0).toFixed(2) })); out.weather = w; if (w.weather === 'calima') break; await sleep(500); }
  out.askedAfterS = +((Date.now() - t0) / 1000).toFixed(1);
  const at = await page.evaluate(() => { const H = window.__CTX__.systemsGame?.hour; H?._malpaisEdge?.(); return window.__CTX__.systemsGame.A['malpais-edge'] ?? null; });
  if (!at) return { ...out, ok: false, why: 'no Malpais edge anchor' };
  out.anchor = at;
  out.walk = await walkPath(page, at, 4, 120);
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
  const rec = startRec ? { ...startRec, savedAt: Date.now() } : { ...fixture(leg), savedAt: Date.now() };
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
    const K = SH.keys(page);
    const rec = await boot(page, leg, startRec);
    const tPlay = Date.now();
    const T = () => +((Date.now() - tPlay) / 1000).toFixed(1);
    // the crossings the regions seam fires from here on
    await page.evaluate(() => { window.__regionEv = []; const C = window.__CTX__; for (const k of ['enter', 'leave', 'approach', 'depart']) C.events.on(`region-${k}`, (e) => window.__regionEv.push({ k, region: e.region, t: +(performance.now() / 1000).toFixed(2), depth: e.depth })); window.__t0 = performance.now() / 1000; });
    L.start = { ...(await page.evaluate(where)), hour: await page.evaluate(() => window.__CTX__.environment.time), regions: await page.evaluate(() => window.__CTX__.engine.regionStatus?.() ?? null), fixtureAt: rec.position, shot: await shot(page, `l${leg}-00-continued`) };
    L.rows.continued = { pass: Math.hypot(L.start.x - rec.position.x, L.start.z - rec.position.z) < 0.5 && Math.abs(L.start.hour - rec.hour) < 0.05,
      dxz: +Math.hypot(L.start.x - rec.position.x, L.start.z - rec.position.z).toFixed(3), hour: +L.start.hour.toFixed(3) };
    const stages = beatsOf(leg);
    const qid = leg === 2 ? SCAR_ID : TRUE_GROUND_ID;
    let k = 0, driveOn = true;
    for (const st of stages) {
      if ((Date.now() - tC) / 1000 > LEG_BUDGET_S) { L.beats.push({ leg, beat: st.id, ok: false, why: `not run: the leg's ${LEG_BUDGET_S} s cap` }); continue; }
      const bt0 = T();
      const played = {};
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
        played.walk = await walkPath(page, PLACES.b1, 4, 90);
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
        played.screed = await driveScreed(page, K, st.id, st.id === 'stall' ? 150 : 120);
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
      const pr = await page.evaluate(beatProbe, st.id, qid, PLACES, TRANSIT_CARD);
      const b = { leg, beat: st.id, ok: pr.ok, why: pr.why, hp: pr.hp, t: T(), seconds: +(T() - bt0).toFixed(1), hour: pr.hour, at: pr.at, region: pr.region, numbers: { ...pr.numbers, ...played } };
      b.shot = await shot(page, `l${leg}-${String(++k).padStart(2, '0')}-${st.id}`);
      L.beats.push(b);
      log(`leg ${leg} ${st.id}: ${b.ok ? 'PASS' : 'FAIL'} hp ${b.hp} t ${b.t} s ${b.why ? `(${b.why.slice(0, 160)})` : ''}`);
      if (st.id === 'survey' && played.alidade?.on) { await page.keyboard.press('KeyV'); await sleep(400); }
      // a beat that did not pass stops the leg's driving: the beats after it wait on it (each still probed and named)
      if (!b.ok) driveOn = false;
    }
    L.hitch = await page.evaluate(() => { const H = window.__hitch; return { frames: H.n, maxMs: +H.max.toFixed(1), over33: H.over33, over50: H.over50 }; });
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
  writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2));
  log(`report: ${path.join(runDir, 'report.json')}`);
  for (const l of report.legs) log(`leg ${l.leg}: ${l.passed}${l.error ? ` (error: ${l.error.slice(0, 120)})` : ''}`);
  log(`beats ${report.beats}; ${report.chromeSeconds} s of Chrome`);
}
