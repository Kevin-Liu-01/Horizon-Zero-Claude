// M3 area B (M3.1), the Survey Kite's law in Node: one row per band of the M3 briefs' area B (KF2-KF8, the Node half).
// The law is src/game/kite/flight.js, stepped on the game's own height, wind and the lift seam's stub (world.mjs).
// Browser-free:  node --test tools/gates/kite/flight-law.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KITE, FLIGHT_STATES, canOpen, flyableIn, createFlightBody, openAt, stepFlight, landingDamage, glideRatio, readOut,
  sightRangeMul, weaponVerbsAllowed, GROUNDED_NOTE,
} from '../../../src/game/kite/flight.js';
import { makeRidgeLift, LIFT, liftAt, setLiftSource } from '../../../src/game/kite/lift.js';
import { WIND_ROADS, ROAD_COUNTS, LINE_POSTS, POST_HEIGHT_M, streams } from '../../../src/game/kite/roads.js';
import { flatWorld, steadyWind, gameWind, islandWorld, islandLift, heightAt, fly, WEATHER } from './world.mjs';

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

/** a synthetic island: a windward face of `deg` rising to the SW across x+z = 0, flat at 10 m before it */
const faceWorld = (deg, { faceDown = false } = {}) => {
  const t = Math.tan(deg * Math.PI / 180);
  // along the wind (toward SW, (-1, 1)/sqrt2) the ground climbs at `deg` over 30 m, then a plateau
  const h = (x, z) => { const s = (-x + z) / Math.SQRT2; const u = faceDown ? -s : s; return 10 + Math.max(0, Math.min(30, u)) * t; };
  return h;
};

test('KF3 lift: +0.5 to +1.5 m/s over a windward face of 25 deg or more within 40 m below; 0 over flat ground, under 25 deg, in the lee, over water', () => {
  for (const deg of [25.5, 30, 40, 50]) {
    const L = makeRidgeLift(faceWorld(deg));
    // over the face's foot and over its brow, within 40 m above the face
    const vals = [[-5, 5, 20], [-10, 10, 30], [-20, 20, 45]].map(([x, z, y]) => L(x, y, z));
    for (const v of vals) assert.ok(v >= LIFT.min && v <= LIFT.max, `${deg} deg: ${vals}`);
  }
  assert.equal(makeRidgeLift(() => 10)(0, 20, 0), 0, 'flat');
  assert.equal(makeRidgeLift(faceWorld(20))(0, 20, 0), 0, 'a 20 deg face');
  assert.equal(makeRidgeLift(faceWorld(35, { faceDown: true }))(-25, 15, 25), 0, 'the lee: a face that looks away from the wind');
  assert.equal(makeRidgeLift(faceWorld(35))(0, 60, 0) , 0, 'more than 40 m over the face');
  assert.equal(makeRidgeLift((x, z) => (x > 0 ? -2 : 30))(5, 10, 0), 0, 'over water');
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

test('KF5 grounded: calima and squall open 0 of 10, with a field note; an open kite is down inside 5 s, undamaged', () => {
  assert.equal(flyableIn('trade'), true); assert.equal(flyableIn('fogbank'), true);
  for (const wx of ['calima', 'squall']) {
    let opens = 0;
    for (let i = 0; i < 10; i++) { const r = canOpen({ airborneS: 0.5 + i, clearM: 5 + i * 5, weather: wx }); if (r.ok) opens++; else { assert.equal(r.why, 'weather'); assert.ok(r.note && r.note === GROUNDED_NOTE[wx]); } }
    assert.equal(opens, 0, wx);
  }
  for (const agl of [3, 10, 25, 40, 60]) {
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
  }
});

test('KF6 landing: a glide lands at <= 3 m/s with 0 damage; above it the existing fall rule; no landing past the 1.1 m contour', () => {
  const r = fly(flatWorld({ windAt: steadyWind(5.5) }), { x: 0, y: 12, z: 0, headingDeg: 225, maxS: 60 });
  assert.equal(r.state, 'landing');
  assert.ok(r.f.landVs <= KITE.safeLandVs, `${r.f.landVs}`); assert.equal(r.f.landDamage, 0);
  assert.equal(landingDamage(3), 0); assert.equal(landingDamage(8), 0, 'a 1.45 m fall is free by the player\'s rule');
  assert.equal(landingDamage(13), 0, 'a 3.8 m fall is free');
  assert.ok(landingDamage(15) > 0 && landingDamage(15) < 100, `${landingDamage(15)}`);
  assert.ok(landingDamage(21) > 100, 'over a 9 m fall kills');
  const water = { ...flatWorld(), waterDepthAt: () => 1.5 };
  const wr = fly(water, { x: 0, y: 8, z: 0, headingDeg: 0, maxS: 30 });
  assert.equal(wr.f.refusedWater, true);
});

test('KF7 the wind roads: 5, 7 and 6 posts of 3 m, the cloth streams iff liftAt > 0 at the top, never in calima', () => {
  for (const [road, n] of Object.entries(ROAD_COUNTS)) assert.equal(WIND_ROADS[road].length, n, road);
  assert.equal(LINE_POSTS.length, 18);
  for (const p of LINE_POSTS) assert.equal(p.heightM, POST_HEIGHT_M);
  for (const p of LINE_POSTS) {
    const on = islandLift(p.x, heightAt(p.x, p.z) + p.heightM, p.z) > 0;
    assert.equal(streams(p, islandLift, heightAt), on, p.id);
    assert.equal(streams(p, islandLift, heightAt, false), false, `${p.id} in calima`);
  }
});

test('KF7 the Organ Shelf road: all 5 posts stream on the stub lift', () => {
  const on = WIND_ROADS['organ-shelf'].filter((p) => streams(p, islandLift, heightAt));
  assert.equal(on.length, 5, on.map((p) => p.id).join());
});

test('KF7 the caldera road: all 6 posts stream on the stub lift (the caldera is not built: blockout ground)', () => {
  const on = WIND_ROADS.caldera.filter((p) => streams(p, islandLift, heightAt));
  assert.equal(on.length, 6, on.map((p) => p.id).join());
});

test('KF7 the Scar road: its 7 posts stream', { todo: 'MP0/KF0 ruling: the Scar runs on bearing 225, straight downwind; its lip faces across the wind and makes no lift by the one law (brief §1)' }, () => {
  const on = WIND_ROADS.scar.filter((p) => streams(p, islandLift, heightAt));
  assert.equal(on.length, 7, `${on.length} of 7 stream`);
});

test('KF8 seen and disarmed: sight x2.0 while airborne under the kite, x1.0 the step she lands; no weapon verb unless flight is none', () => {
  assert.equal(sightRangeMul('gliding'), 2.0); assert.equal(sightRangeMul('landing'), 1.0); assert.equal(sightRangeMul('none'), 1.0);
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

test('the island world steps: a glide off T1 over the Pans lands, undamaged', () => {
  const w = islandWorld();
  const g = heightAt(-187, 357);
  const r = fly(w, { x: -187, y: g + 4 + 1.5, z: 357, headingDeg: 283, maxS: 60 });
  assert.equal(r.state, 'landing'); assert.equal(r.f.landDamage, 0);
});
