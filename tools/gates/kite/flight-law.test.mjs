// M3 area B (M3.1), the Survey Kite's law in Node: one row per band of the M3 briefs' area B (KF2-KF8, the Node half).
// The law is src/game/kite/flight.js, stepped on the game's own height and wind and area A's lift field (world.mjs).
// Browser-free:  node --test tools/gates/kite/flight-law.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KITE, FLIGHT_STATES, canOpen, flyableIn, createFlightBody, openAt, stepFlight, landingDamage, glideRatio, readOut,
  sightRangeMul, weaponVerbsAllowed, GROUNDED_NOTE, trackGlide, openHeightOffTop, groundedDownTime,
} from '../../../src/game/kite/flight.js';
import { readFileSync } from 'node:fs';
import { liftAt, setLiftSource } from '../../../src/game/kite/lift.js';
import { WIND_ROADS, ROAD_COUNTS, LINE_POSTS, POST_HEIGHT_M, streams } from '../../../src/game/kite/roads.js';
import { flatWorld, steadyWind, gameWind, islandWorld, islandLift, heightAt, fly, WEATHER, WORLD_LIFT, faceAt, waterDepthAt } from './world.mjs';

const near = (v, want, tol, what) => assert.ok(Math.abs(v - want) <= tol, `${what}: ${v} not within ${want} +- ${tol}`);

/** Glide over flat ground from high up: forward speed through the air, sink, and the ratio over the ground. */
function glide(world, headingDeg, seconds = 40) {
  const f = createFlightBody();
  let s = openAt(f, { x: 0, y: 2000, z: 0, headingDeg, groundY: 0 });
  const dt = 1 / 60;
  while (s !== 'gliding') s = stepFlight(s, f, {}, world, dt);
  const x0 = f.x, z0 = f.z, y0 = f.y;
  for (let i = 0; i < seconds * 60; i++) s = stepFlight(s, f, {}, world, dt);
  const d = Math.hypot(f.x - x0, f.z - z0), h = y0 - f.y;
  return { ratio: d / h, ground: d / seconds, sink: h / seconds, state: s };
}

test('seam: the five flight states, in the brief\'s order', () => {
  assert.deepEqual([...FLIGHT_STATES], ['none', 'opening', 'gliding', 'folding', 'landing']);
});

test('KF2 still air: 7.5 m/s +-0.2 forward, 1.5 m/s +-0.1 sink, glide 5:1 +-0.3', () => {
  const g = glide(flatWorld({ windAt: steadyWind(0) }), 90);
  near(g.ground, 7.5, 0.2, 'forward'); near(g.sink, 1.5, 0.1, 'sink'); near(g.ratio, 5, 0.3, 'glide');
  assert.equal(g.state, 'gliding');
});

test('KF2 the trade (5.5 m/s from 045, the environment\'s own table): downwind 6.5:1 +-0.4, upwind 3.5:1 +-0.3', () => {
  const ms = WEATHER.trade.windMS;
  assert.equal(ms, 5.5);
  const w = flatWorld({ windAt: steadyWind(ms, 45) });
  const down = glide(w, 225), up = glide(w, 45);
  near(down.ratio, 6.5, 0.4, 'downwind'); near(up.ratio, 3.5, 0.3, 'upwind');
  near(glideRatio(225, ms), down.ratio, 0.01, 'closed form downwind');
  // the same on the environment's own windAt (its noise along the wind is +-22 %): the mean over 40 s holds the band
  const gw = gameWind();
  const gdown = glide(flatWorld({ windAt: gw.windAt }), 225), gup = glide(flatWorld({ windAt: gw.windAt }), 45);
  near(gdown.ratio, 6.5, 0.4, 'downwind, game wind'); near(gup.ratio, 3.5, 0.3, 'upwind, game wind');
});

test('KF2 holding a track: the crab into the cross-wind; T1 to the Ring (track 283) is 5.62:1, the Node law agrees', () => {
  const g = trackGlide(283.02, 5.5);
  near(g.ratio, 5.62, 0.01, 'track ratio'); near(g.crabDeg, 14.41, 0.05, 'crab');
  // straight downwind and upwind there is no crab: the track ratio is the heading ratio
  near(trackGlide(225, 5.5).ratio, glideRatio(225, 5.5), 1e-9, 'downwind'); near(trackGlide(45, 5.5).ratio, glideRatio(45, 5.5), 1e-9, 'upwind');
  // stepped: flying the returned heading in the steady trade, the ground track is the bearing asked for
  const f = createFlightBody(), w = flatWorld({ windAt: steadyWind(5.5) });
  let s = openAt(f, { x: 0, y: 3000, z: 0, headingDeg: g.headingDeg, groundY: 0 });
  while (s === 'opening') s = stepFlight(s, f, {}, w, 1 / 60);
  const x0 = f.x, z0 = f.z, y0 = f.y;
  for (let i = 0; i < 1200; i++) s = stepFlight(s, f, {}, w, 1 / 60);
  const trk = (Math.atan2(f.x - x0, -(f.z - z0)) * 180 / Math.PI + 360) % 360;
  near(trk, 283.02, 0.05, 'track flown'); near(Math.hypot(f.x - x0, f.z - z0) / (y0 - f.y), 5.62, 0.01, 'ratio flown');
});

test('the launch: off a 4 m top she jumps and opens 1.50 m over it at 0.35 s (a step off is 2.65 m over the foot: under 3 m clear)', () => {
  near(openHeightOffTop(10) - 10, 1.496, 0.001, 'jump at the open');
  const stepOff = 4 - 0.5 * KITE.gravity * KITE.openAirborneS ** 2;
  assert.equal(canOpen({ airborneS: KITE.openAirborneS, clearM: stepOff }).ok, false, `a step off: ${stepOff.toFixed(2)} m clear`);
  assert.equal(canOpen({ airborneS: KITE.openAirborneS, clearM: openHeightOffTop(4) }).ok, true, 'a jump off');
});

test('KF3 lift (area A\'s law, src/world/island/lift.js, on the island): +0.5 to +1.5 m/s over windward faces of 25 deg or more within 40 m below; 0 over flat ground, gentler faces, lee faces, water, and more than 40 m up', () => {
  const R = (a) => a * Math.PI / 180;
  const n = { lift: 0, flat: 0, lee: 0, gentle: 0, sea: 0, high: 0 };
  const f = { h: 0, slopeDeg: 0, aspect: { x: 0, z: 0 }, sea: false };
  const from = { x: Math.sin(R(45)), z: -Math.cos(R(45)) };
  for (let x = -480; x <= 480; x += 8) for (let z = -480; z <= 480; z += 8) {
    faceAt(x, z, f);
    const v = islandLift(x, f.h + 5, z);
    if (v > 0) { n.lift++; assert.ok(v >= WORLD_LIFT.min - 1e-9 && v <= WORLD_LIFT.max + 1e-9, `${v} at ${x},${z}`); assert.ok(f.slopeDeg >= 25 && !f.sea, `${x},${z}`); }
    if (f.sea) { n.sea++; assert.equal(v, 0, `water ${x},${z}`); continue; }
    if (f.slopeDeg < 2) { n.flat++; assert.equal(v, 0, `flat ${x},${z}`); }
    else if (f.slopeDeg < 25) { n.gentle++; assert.equal(v, 0, `gentle ${x},${z}`); }
    else if (f.aspect.x * from.x + f.aspect.z * from.z < 0) { n.lee++; assert.equal(v, 0, `lee ${x},${z}`); }
    if (v > 0) { n.high++; assert.equal(islandLift(x, f.h + 41, z), 0, `41 m up ${x},${z}`); }
  }
  for (const k of Object.keys(n)) assert.ok(n[k] > 0, `no ${k} cells sampled: ${JSON.stringify(n)}`);
});

test('KF3 the cap: in steady lift she never climbs above launch height + 25 m; with no lift she never climbs', () => {
  const w = flatWorld({ liftAt: () => 1.5 });
  const r = fly(w, { x: 0, y: 40, z: 0, headingDeg: 0, maxS: 90 });
  assert.ok(r.maxY <= 40 + KITE.liftCapM + 1e-6, `max ${r.maxY}`);
  assert.ok(r.maxY >= 40 + KITE.liftCapM - 0.5, `she reaches the cap (${r.maxY})`);
  const n = fly(flatWorld(), { x: 0, y: 40, z: 0, headingDeg: 0, maxS: 10 });
  assert.ok(n.maxY <= 40 + 1e-9);
});

test('KF4 the open: 0 of 10 below 0.35 s airborne or under 3 m clear, 10 of 10 above both; open 400-600 ms, fold <= 400 ms', () => {
  let low = 0, high = 0;
  for (let i = 0; i < 10; i++) {
    if (canOpen({ airborneS: 0.34 * i / 9, clearM: 10 }).ok) low++;
    if (canOpen({ airborneS: 1, clearM: 2.99 * i / 9 }).ok) low++;
    if (canOpen({ airborneS: 0.35 + i * 0.2, clearM: 3 + i * 4 }).ok) high++;
  }
  assert.equal(low, 0); assert.equal(high, 10);
  assert.equal(canOpen({ airborneS: 1, clearM: 9, state: 'gliding' }).ok, false, 'not while already open');
  assert.ok(KITE.openS >= 0.4 && KITE.openS <= 0.6, `open ${KITE.openS}`);
  assert.ok(KITE.foldS <= 0.4, `fold ${KITE.foldS}`);
  // stepped: the open reaches 'gliding' at KITE.openS; the fold reaches 'none' (hands free) at KITE.foldS
  const w = flatWorld();
  const f = createFlightBody();
  let s = openAt(f, { x: 0, y: 50, z: 0, headingDeg: 0, groundY: 0 }), t = 0;
  while (s === 'opening') { s = stepFlight(s, f, {}, w, 1 / 60); t += 1 / 60; }
  near(t, KITE.openS, 1 / 60 + 1e-9, 'open time'); assert.equal(s, 'gliding');
  s = stepFlight(s, f, { fold: true }, w, 1 / 60); t = 0;
  while (s === 'folding') { s = stepFlight(s, f, {}, w, 1 / 60); t += 1 / 60; }
  assert.equal(s, 'none'); assert.ok(t <= 0.4, `fold ${t}`);
});

test('KF5 grounded: calima and squall open 0 of 10, with a field note in the bible\'s words; an open kite is down inside 5 s, undamaged, from up to 80 m', () => {
  assert.equal(flyableIn('trade'), true); assert.equal(flyableIn('fogbank'), true);
  const bible = readFileSync(new URL('../../../docs/BIBLE.md', import.meta.url), 'utf8');
  // the notes' words are the bible's: §3.2's weather table ("grounds the Survey Kite") and §16's kite row
  const SOURCE = { table: 'grounds the Survey Kite', kite: 'Calima and squalls ground it.' };
  for (const words of Object.values(SOURCE)) assert.ok(bible.includes(words), `the bible says "${words}"`);
  for (const note of Object.values(GROUNDED_NOTE)) assert.ok(note.includes(SOURCE.table), note);
  for (const wx of ['calima', 'squall']) {
    let opens = 0;
    for (let i = 0; i < 10; i++) { const r = canOpen({ airborneS: 0.5 + i, clearM: 5 + i * 5, weather: wx }); if (r.ok) opens++; else { assert.equal(r.why, 'weather'); assert.ok(r.note && r.note === GROUNDED_NOTE[wx]); } }
    assert.equal(opens, 0, wx);
  }
  for (const agl of [3, 10, 25, 40, 60, 70, 80]) {
    let wx = 'trade';
    const w = flatWorld({ flyable: () => flyableIn(wx) });
    const f = createFlightBody();
    let s = openAt(f, { x: 0, y: agl, z: 0, headingDeg: 0, groundY: 0 });
    while (s === 'opening') s = stepFlight(s, f, {}, w, 1 / 60);
    // the climb is not in this world; give her the height back at the moment calima arrives
    f.y = agl; wx = 'calima';
    let t = 0;
    while (s === 'gliding' && t < 30) { s = stepFlight(s, f, {}, w, 1 / 60); t += 1 / 60; }
    assert.equal(s, 'landing', `${agl} m`);
    assert.ok(t <= KITE.groundedDownS, `${agl} m AGL: down in ${t.toFixed(2)} s`);
    assert.ok(f.landVs <= KITE.safeLandVs && f.landDamage === 0, `${agl} m: ${f.landVs} m/s, ${f.landDamage} hp`);
    near(t, groundedDownTime(agl), 0.12, `${agl} m: stepped against the closed form`);
  }
});

/** Bring an open kite down from `agl` over flat ground: the seconds and the touchdown. */
function bringDown(agl) {
  let wx = 'trade';
  const w = flatWorld({ flyable: () => flyableIn(wx) });
  const f = createFlightBody();
  let s = openAt(f, { x: 0, y: agl, z: 0, headingDeg: 0, groundY: 0 });
  while (s === 'opening') s = stepFlight(s, f, {}, w, 1 / 60);
  f.y = agl; wx = 'calima';
  let t = 0, maxVs = 0;
  while (s === 'gliding' && t < 60) { s = stepFlight(s, f, {}, w, 1 / 60); t += 1 / 60; maxVs = Math.max(maxVs, -f.vy); }
  return { s, t, f, maxVs };
}

test('KF5 grounded from every height the island allows (to 275 m: its highest ground, a pillar, the jump and the lift cap): down undamaged, no faster than a fall', () => {
  for (const agl of [100, 130, 160, 200, 207, 240, 275]) {
    const r = bringDown(agl);
    assert.equal(r.s, 'landing', `${agl} m`);
    assert.ok(r.f.landVs <= KITE.safeLandVs && r.f.landDamage === 0, `${agl} m: ${r.f.landVs} m/s`);
    assert.ok(r.maxVs <= KITE.downMaxVs + 1e-9, `${agl} m: ${r.maxVs} m/s`);
    near(r.t, groundedDownTime(agl), 0.12, `${agl} m`);
  }
});

test('KF5 grounded from 200 m or more inside 5 s', { todo: 'FAIL, RULING: 5 s from 200 m needs a 40 m/s mean descent (275 m in 5 s is a free fall at the game\'s 22 m/s^2, landing at 110 m/s); the law brings her down in 9.9 s from 200 m, 13.0 s from 275 m (5 s is met to 80 m)' }, () => {
  const r = bringDown(200);
  assert.ok(r.t <= 5, `200 m: ${r.t.toFixed(2)} s`);
});

test('KF6 landing: a glide lands at <= 3 m/s with 0 damage; above it the existing fall rule; no landing past the 1.1 m contour', () => {
  const r = fly(flatWorld({ windAt: steadyWind(5.5) }), { x: 0, y: 12, z: 0, headingDeg: 225, maxS: 60 });
  assert.equal(r.state, 'landing');
  assert.ok(r.f.landVs <= KITE.safeLandVs, `${r.f.landVs}`); assert.equal(r.f.landDamage, 0);
  assert.equal(landingDamage(3), 0); assert.equal(landingDamage(8), 0, 'a 1.45 m fall is free by the player\'s rule');
  assert.equal(landingDamage(13), 0, 'a 3.8 m fall is free');
  assert.ok(landingDamage(15) > 0 && landingDamage(15) < 100, `${landingDamage(15)}`);
  assert.ok(landingDamage(21) > 100, 'over a 9 m fall kills');
});

/** A shore: land west of x = 0, the sea floor falling 0.1 m a metre east of it (the 1.1 m contour at x = 11). */
const shore = (g = (x) => (x < 0 ? 0.5 : -0.1 * x)) => ({ ...flatWorld(), groundAt: (x) => g(x), waterDepthAt: (x) => Math.max(0, -g(x)) });
/** fly until she stands again (landing done, or the carry and run-out over) */
function flyOut(world, o) {
  const f = createFlightBody();
  let s = openAt(f, { ...o, groundY: world.groundAt(o.x, o.z) }), t = 0, landedAt = null, turned = false;
  while (s !== 'none' && t < 120) { s = stepFlight(s, f, o.input || {}, world, 1 / 60); t += 1 / 60; if (s === 'landing' && !landedAt) landedAt = { x: f.x, depth: world.waterDepthAt(f.x, f.z) }; if (f.waterTurn) turned = true; }
  return { s, f, t, landedAt, turned, depth: world.waterDepthAt(f.x, f.z) };
}

test('KF6 no landing past the 1.1 m contour: off a shore out to sea she turns for the shallows and stands at or inside the contour', () => {
  const w = shore();
  for (const [y, heading, bank] of [[8, 90, 0], [20, 90, 0], [6, 60, 0.2], [30, 120, -0.1], [3.5, 90, 0]]) {
    const r = flyOut(w, { x: -2, y, z: 0, headingDeg: heading, input: { bank } });
    assert.equal(r.s, 'none', `${y} m ${heading}`);
    assert.ok(r.depth <= KITE.waterContourM + 1e-9, `${y} m on ${heading}: she stands in ${r.depth.toFixed(2)} m of water at x ${r.f.x.toFixed(1)}`);
    assert.equal(r.f.landDamage, 0);
  }
  // a run-out that would carry her past the contour stops at it
  const r = flyOut(w, { x: 8, y: 2.5, z: 0, headingDeg: 90 });
  assert.ok(r.depth <= KITE.waterContourM + 1e-9, `run-out: ${r.depth.toFixed(2)} m`);
});

test('KF6 the current: a touchdown on deep water (the turn could not save it) is carried back to the contour', () => {
  // a steep shelf: 5 m of water a metre past the beach, so the low turn has no room; a gale from the west
  const g = (x) => (x < 0 ? 0.5 : -5);
  const w = { ...shore(g), windAt: steadyWind(18, 270) };
  const r = flyOut(w, { x: -1, y: 9, z: 0, headingDeg: 90 });
  assert.ok(r.landedAt && r.landedAt.depth > KITE.waterContourM, `she came down on deep water (${r.landedAt?.depth})`);
  assert.equal(r.f.refusedWater, true);
  assert.ok(r.depth <= KITE.waterContourM + 1e-9, `carried to ${r.f.x.toFixed(1)}: ${r.depth.toFixed(2)} m`);
});

test('KF6 on the island: off the black-sand beach out to sea (south), she stands at or inside the contour', () => {
  const w = islandWorld();
  for (const [e, n, brg] of [[-187, -420, 180], [-187, -420, 200], [-250, -380, 170], [-300, -360, 200]]) {
    const x = e, z = -n, g = heightAt(x, z);
    const r = flyOut(w, { x, y: Math.max(g, 0) + 12, z, headingDeg: brg });
    assert.equal(r.s, 'none');
    assert.ok(waterDepthAt(r.f.x, r.f.z) <= KITE.waterContourM + 1e-9, `(${e}, ${n}) on ${brg}: ${waterDepthAt(r.f.x, r.f.z).toFixed(2)} m at (${r.f.x.toFixed(1)}, ${(-r.f.z).toFixed(1)})`);
  }
});

test('KF7 the wind roads: 5, 7 and 6 posts of 3 m', () => {
  for (const [road, n] of Object.entries(ROAD_COUNTS)) assert.equal(WIND_ROADS[road].length, n, road);
  assert.equal(LINE_POSTS.length, 18);
  for (const p of LINE_POSTS) assert.equal(p.heightM, POST_HEIGHT_M);
});

test('KF7 the cloth streams iff liftAt > 0 at the post\'s TOP, on the ground under it, never in calima (a fixture with known answers)', () => {
  // the ground steps from 10 m (x < 0) to 30 m (x >= 0); lift only in a 1 m band at 13 m and at 33 m (a post's top on
  // each step), and only for z < 0. Five posts with their answers worked by hand: a law that reads the foot, a fixed
  // height, the wrong step, or ignores liftAt fails it
  const groundAt = (x) => (x < 0 ? 10 : 30);
  const liftAt = (x, y, z) => (z < 0 && (Math.abs(y - 13) < 0.5 || Math.abs(y - 33) < 0.5) ? 0.8 : 0);
  const P = (x, z, heightM = POST_HEIGHT_M) => ({ id: `fx ${x},${z}`, road: 'scar', i: 0, e: x, n: -z, x, z, heightM });
  const cases = [[P(-5, -5), true], [P(5, -5), true], [P(-5, 5), false], [P(5, 5), false], [P(-5, -5, 1), false]];
  for (const [p, want] of cases) {
    assert.equal(streams(p, liftAt, groundAt), want, p.id + ` h ${p.heightM}`);
    assert.equal(streams(p, liftAt, groundAt, false), false, `${p.id} in calima`);
  }
});

test('KF7 the Organ Shelf road: all 5 posts stream', { todo: 'FAIL, RULING (KF0 (a)): by area A\'s lift law no face of the Organ Shelf lifts in the trade (its steep faces look N, NW, W and S); 0 of 5 stream' }, () => {
  const on = WIND_ROADS['organ-shelf'].filter((p) => streams(p, islandLift, heightAt));
  assert.equal(on.length, 5, on.map((p) => p.id).join());
});

test('KF7 the caldera road: all 6 posts stream (the caldera is not built: blockout ground)', () => {
  const on = WIND_ROADS.caldera.filter((p) => streams(p, islandLift, heightAt));
  assert.equal(on.length, 6, on.map((p) => p.id).join());
});

test('KF7 the Scar road: its 7 posts stream', { todo: 'FAIL, RULING (MP0, KF0 (b)): the Scar runs on bearing 225, straight downwind; its lip faces across the wind and makes no lift by the one law (brief §1)' }, () => {
  const on = WIND_ROADS.scar.filter((p) => streams(p, islandLift, heightAt));
  assert.equal(on.length, 7, `${on.length} of 7 stream`);
});

test('KF8 seen and disarmed: sight x2.0 while gliding (the seam: brief 3.2, as area C reads it), x1.0 the step she lands; no weapon verb unless flight is none', () => {
  for (const s of FLIGHT_STATES) assert.equal(sightRangeMul(s), s === 'gliding' ? 2.0 : 1.0, s);
  // stepped: the multiplier is 2.0 on the last gliding step and 1.0 on the step she lands
  const f = createFlightBody(), w = flatWorld();
  let s = openAt(f, { x: 0, y: 6, z: 0, headingDeg: 0, groundY: 0 }), last = null;
  while (s !== 'landing') { last = s; s = stepFlight(s, f, {}, w, 1 / 60); }
  assert.equal(sightRangeMul(last), 2.0); assert.equal(sightRangeMul(s), 1.0);
  for (const s of FLIGHT_STATES) assert.equal(weaponVerbsAllowed(s), s === 'none', s);
});

test('the read-out: the wind bearing in three digits, its speed, the climb or sink', () => {
  const r = fly(flatWorld({ windAt: steadyWind(5.5, 45) }), { x: 0, y: 100, z: 0, headingDeg: 225, maxS: 3 });
  const o = readOut(r.f);
  assert.equal(o.windBearing, '045'); assert.equal(o.windMs, 6); assert.equal(o.lift, -1.5);
});

test('the lift seam: 0 until a source is set; the source is what it reads', () => {
  setLiftSource(null); assert.equal(liftAt(0, 0, 0), 0);
  setLiftSource(() => 0.8); assert.equal(liftAt(1, 2, 3), 0.8);
  setLiftSource(null);
});

test('F51 and F52 stand where the law puts her 20 s into the glide off T2 (tools/frames/stagings/m3-kite.mjs F51_AT)', async () => {
  const { F51_AT, FRAMES } = await import('../../frames/stagings/m3-kite.mjs');
  const { TRIG, TRIG_TOP } = await import('../../../src/world/island/sites.js');
  const T = TRIG.find((t) => t.id === F51_AT.from);
  const r = fly(islandWorld(), { x: T.x, y: openHeightOffTop(heightAt(T.x, T.z) + TRIG_TOP), z: T.z, headingDeg: F51_AT.headingDeg, maxS: F51_AT.seconds });
  near(r.f.x, F51_AT.e, 0.1, 'e'); near(-r.f.z, F51_AT.n, 0.1, 'n'); near(r.f.y, F51_AT.y, 0.1, 'y'); near(r.f.agl, F51_AT.agl, 0.1, 'agl');
  assert.equal(r.state, 'gliding');
  for (const f of FRAMES) { assert.deepEqual(f.at.en, [F51_AT.e, F51_AT.n], f.id); assert.equal(f.bearing, F51_AT.headingDeg, f.id); }
});

test('the island world steps: a glide off T1 over the Pans lands, undamaged', () => {
  const w = islandWorld();
  const g = heightAt(-187, 357);
  const r = fly(w, { x: -187, y: g + 4 + 1.5, z: 357, headingDeg: 283, maxS: 60 });
  assert.equal(r.state, 'landing'); assert.equal(r.f.landDamage, 0);
});
