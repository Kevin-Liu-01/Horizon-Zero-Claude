// M3 area B, KF0 (row 0: geometry, time and sky) on the blockout, in Node: the flight law (src/game/kite/flight.js) on
// the island's own height, the environment's trade wind and area A's lift field (world.mjs).
//   node tools/gates/kite/row0.mjs [--json <file>]
// (a) the test flight, T1 to the Sounding Ring: the track-holding glide ratio (the crab into the cross-wind), the one
//     launch height (flight.js openHeightOffTop: a jump off the pillar, Space at 0.35 s; area A's lift rows read the
//     same function), flown holding the ground track in the steady trade (area A's wind) and in the environment's own
//     noisy trade; then by the Organ Shelf road's lift;
// (b) the Scar's 7 posts: the drop along the line and a downwind glide from its upper end, on the line and on the lip;
// (c) BUILD's "60 m altitude over the Pans": from EVERY launch point (the six trig tops), every bearing (2 deg) and the
//     track to Saltrow, the most height over the Pans' ground; and F51's staging (the glide frozen 20 s in);
// (d) the furled roll and the bow on the back's diagonal: a wave-2 row (its bench is named below), UNMEASURED here.
import { writeFileSync } from 'node:fs';
import { TRIG, TRIG_TOP, SITES, SCAR } from '../../../src/world/island/sites.js';
import { RegionMap } from '../../../src/core/regions.js';
import { WIND_ROADS, streams } from '../../../src/game/kite/roads.js';
import { glideRatio, trackGlide, openHeightOffTop, dirBearing, KITE } from '../../../src/game/kite/flight.js';
import { islandWorld, islandLift, heightAt, fly, steadyWind } from './world.mjs';

const args = process.argv.slice(2);
const out = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const r2 = (v) => +v.toFixed(2);
const r1 = (v) => +v.toFixed(1);
const site = (id) => SITES.find((s) => s.id === id);
const bearingTo = (a, b) => dirBearing(b.x - a.x, b.z - a.z);
const world = islandWorld();
const steadyWorld = islandWorld({ windAt: steadyWind(5.5, 45) });
const regions = new RegionMap().build();
const wrap = (d) => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
/** the hand on the bar: turn the GROUND TRACK (the velocity's bearing) toward a goal (as area A's lift rows fly it) */
const holdTrack = (goal) => (f) => {
  if (!(f.vx || f.vz)) return {};
  const want = Math.atan2(goal.x - f.x, -(goal.z - f.z)), have = Math.atan2(f.vx, -f.vz);
  return { bank: Math.max(-1, Math.min(1, wrap(want - have) * 3)) };
};

/** F51's staging (tools/frames/stagings/m3-kite.mjs reads it): a real launch, frozen 20 s into the glide */
export const F51_GLIDE = Object.freeze({ from: 'T2', headingDeg: 218, seconds: 20 });

const R = { at: new Date().toISOString(), law: { air: KITE.air, sink: KITE.sink, windK: KITE.windK, liftCapM: KITE.liftCapM, openAboveTopM: r2(openHeightOffTop(0)) }, lift: 'area A src/world/island/lift.js liftAt (the trade)' };

/* (a) the test flight */
{
  const T1 = TRIG.find((t) => t.id === 'T1'), ring = site('sounding-ring');
  const g = heightAt(T1.x, T1.z), launchY = openHeightOffTop(g + TRIG_TOP);
  const ringY = heightAt(ring.x, ring.z), dist = Math.hypot(ring.x - T1.x, ring.z - T1.z), brg = bearingTo(T1, ring);
  const tg = trackGlide(brg, 5.5);
  const need = dist / tg.ratio, have = launchY - ringY;
  const flyTo = (w) => {
    const s = fly(w, { x: T1.x, y: launchY, z: T1.z, headingDeg: tg.headingDeg, steer: holdTrack(ring), maxS: 90 });
    const d = Math.hypot(ring.x - s.f.x, ring.z - s.f.z);
    return { landedM_fromRingCentre: r2(d), landedE: r1(s.f.x), landedN: r1(-s.f.z), landedGround: r2(heightAt(s.f.x, s.f.z)), t: s.t, onTheRise: heightAt(s.f.x, s.f.z) >= ringY - 1 && d < 66 };
  };
  // by the Organ Shelf road: work the posts' lift (back and forth along them) until 60 s or the cap, then for the Ring
  const posts = WIND_ROADS['organ-shelf'];
  let leg = posts.reduce((b, p, i) => (Math.hypot(p.x - T1.x, p.z - T1.z) < Math.hypot(posts[b].x - T1.x, posts[b].z - T1.z) ? i : b), 0), dirn = 1, phase = 'road';
  const liftOnPosts = posts.map((p) => ({ id: p.id, ground: r2(heightAt(p.x, p.z)), lift: [3, 10, 20, 30].map((a) => r2(islandLift(p.x, heightAt(p.x, p.z) + a, p.z))) }));
  const road = (f, t) => {
    if (phase === 'road' && (t > 60 || f.y >= launchY + KITE.liftCapM - 0.5)) phase = 'ring';
    if (phase === 'ring') return holdTrack(ring)(f);
    const p = posts[leg];
    if (Math.hypot(p.x - f.x, p.z - f.z) < 6) { leg += dirn; if (leg >= posts.length || leg < 0) { dirn = -dirn; leg += 2 * dirn; } }
    return holdTrack(posts[leg])(f);
  };
  let liftS = 0, maxLift = 0;
  const v = fly(world, { x: T1.x, y: launchY, z: T1.z, headingDeg: bearingTo(T1, posts[leg]), steer: road, maxS: 180,
    onStep: (f) => { if (f.lift > 0) { liftS += 1 / 60; maxLift = Math.max(maxLift, f.lift); } } });
  const vShort = Math.hypot(ring.x - v.f.x, ring.z - v.f.z);
  R.a = {
    T1: { e: T1.e, n: T1.n, ground: r2(g), top: r2(g + TRIG_TOP), launchY: r2(launchY), launch: 'a jump off the pillar, Space at 0.35 s (flight.js openHeightOffTop: top + 1.50 m)' },
    ring: { ground: r2(ringY), riseR: 66 },
    distM: r2(dist), bearing: r2(brg),
    glideHoldingTrack: r2(tg.ratio), crabDeg: r2(tg.crabDeg), headingFlownDeg: r2(tg.headingDeg), glideOnHeadingNoCrab: r2(glideRatio(brg, 5.5)),
    heightNeededM: r2(need), heightHaveM: r2(have), shortM: r2(need - have),
    straightSteadyTrade: flyTo(steadyWorld),
    straightGameWind: flyTo(world),
    byOrganShelfRoad: { liftAtPosts_3_10_20_30mAGL: liftOnPosts, postsStreaming: posts.filter((p) => streams(p, islandLift, heightAt)).length, maxY: v.maxY, gainM: r2(v.maxY - launchY), liftSeconds: r2(liftS), maxLift: r2(maxLift), landedM_fromRingCentre: r2(vShort), t: v.t, onTheRise: heightAt(v.f.x, v.f.z) >= ringY - 1 && vShort < 66 },
  };
}

/* (b) the Scar */
{
  const A = SCAR.a, B = SCAR.b, L = Math.hypot(B.x - A.x, B.z - A.z), ux = (B.x - A.x) / L, uz = (B.z - A.z) / L;
  const hA = heightAt(A.x, A.z), hB = heightAt(B.x, B.z), brg = dirBearing(ux, uz);
  const profile = [];
  for (let k = 0; k <= 1.0001; k += 0.1) profile.push(r2(heightAt(A.x + ux * L * k, A.z + uz * L * k)));
  const need = L / trackGlide(brg, 5.5).ratio;
  const along = (side) => {
    // north-west lip: the right of the line going SW
    const nx = -uz * side * 15, nz = ux * side * 15;
    const x0 = A.x + nx, z0 = A.z + nz, y0 = openHeightOffTop(heightAt(x0, z0) + 3);
    const steer = (f) => { const tx = f.x - x0, tz = f.z - z0; const off = (tx * -uz + tz * ux); const want = Math.atan2(ux, -uz) - Math.max(-0.5, Math.min(0.5, off * 0.05)); return { bank: Math.max(-1, Math.min(1, wrap(want - f.heading) * 3)) }; };
    let minAgl = Infinity, minAt = 0, aglAtEnd = null;
    const r = fly(world, { x: x0, y: y0, z: z0, headingDeg: brg, steer, maxS: 120, onStep: (f) => {
      const k = ((f.x - A.x) * ux + (f.z - A.z) * uz) / L;
      if (k <= 1 && f.agl < minAgl) { minAgl = f.agl; minAt = k; }
      if (k >= 1 && aglAtEnd === null) aglAtEnd = f.agl;
    } });
    const k = ((r.f.x - A.x) * ux + (r.f.z - A.z) * uz) / L;
    return { launchY: r2(y0), landedAtK: r2(k), landedM: r2(k * L), t: r.t, minAglOverTheScar: r2(minAgl), minAglAtK: r2(minAt), aglPassingTheLowerEnd: aglAtEnd === null ? null : r2(aglAtEnd) };
  };
  R.b = { lengthM: r2(L), bearing: r2(brg), upperGround: r2(hA), lowerGround: r2(hB), dropM: r2(hA - hB), heightNeededM: r2(need), profileEvery10pct: profile,
    postsStreaming: WIND_ROADS.scar.filter((p) => streams(p, islandLift, heightAt)).length,
    glideOnTheLine: along(0), glideOnTheNorthWestLip: along(1) };
}

/* (c) the most height over the Pans' ground, from every launch point */
{
  const salt = site('saltrow');
  const rows = [];
  let best = { aglOverPans: 0 };
  for (const T of TRIG) {
    const y0 = openHeightOffTop(heightAt(T.x, T.z) + TRIG_TOP);
    // every bearing, flown straight (no hand on the bar)
    let bAny = { agl: 0, brg: null };
    let n60 = 0;
    for (let b = 0; b < 360; b += 2) {
      let m = 0;
      fly(world, { x: T.x, y: y0, z: T.z, headingDeg: b, maxS: 400, onStep: (f) => { if (regions.regionAt(f.x, f.z) === 'pans' && f.agl > m) m = f.agl; } });
      if (m > bAny.agl) bAny = { agl: m, brg: b };
      if (m >= 60) n60++;
    }
    // holding the track to Saltrow
    let maxP = 0, firstP = null;
    const r = fly(world, { x: T.x, y: y0, z: T.z, headingDeg: trackGlide(bearingTo(T, salt), 5.5)?.headingDeg ?? bearingTo(T, salt), steer: holdTrack(salt), maxS: 400, onStep: (f, t) => {
      if (regions.regionAt(f.x, f.z) === 'pans') { if (firstP === null) firstP = { agl: r1(f.agl), t: r1(t) }; maxP = Math.max(maxP, f.agl); } } });
    const row = { from: T.id, name: T.name, launchY: r2(y0), maxAglOverPans_anyBearing: r1(bAny.agl), atBearing: bAny.brg, bearingsReaching60mOverPans: n60,
      toSaltrow: { entersPans: firstP, maxAglOverPans: r1(maxP), flightS: r.t } };
    rows.push(row);
    if (bAny.agl > best.aglOverPans) best = { aglOverPans: r1(bAny.agl), from: T.id, bearing: bAny.brg };
  }
  // F51's staging: the glide frozen 20 s in
  const T = TRIG.find((t) => t.id === F51_GLIDE.from), y0 = openHeightOffTop(heightAt(T.x, T.z) + TRIG_TOP);
  let at = null;
  fly(world, { x: T.x, y: y0, z: T.z, headingDeg: F51_GLIDE.headingDeg, maxS: F51_GLIDE.seconds + 1, onStep: (f, t) => {
    if (!at && t >= F51_GLIDE.seconds - 1e-9) at = { t: r2(t), region: regions.regionAt(f.x, f.z), agl: r1(f.agl), y: r1(f.y), e: r1(f.x), n: r1(-f.z), headingDeg: r1(((f.heading * 180 / Math.PI) % 360 + 360) % 360) };
  } });
  const ring = site('sounding-ring'), saltrow = site('saltrow');
  if (at) {
    const look = (s) => ({ distM: r1(Math.hypot(s.x - at.e, s.z + at.n)), bearing: r1(dirBearing(s.x - at.e, s.z + at.n)), depressionDeg: r1(Math.atan2(at.y - heightAt(s.x, s.z), Math.hypot(s.x - at.e, s.z + at.n)) * 180 / Math.PI) });
    at.ring = look(ring); at.saltrow = look(saltrow);
  }
  R.c = { bar: '60 m over the Pans (BUILD M3.1)', reachable: best.aglOverPans >= 60, best, fromEveryTrig: rows, F51: { ...F51_GLIDE, launchY: r2(y0), at20s: at } };
}

R.d = { status: 'UNMEASURED (wave 2)', bench: 'tools/gates/kite/open-bench.mjs (wave 2): the furled roll (armory kite-survey.mjs, 0.95 x 0.12 m) in the survey case on the bow\'s diagonal; the open from the case\'s lower flap with the bow stowed and with it in hand; rows: roll-to-bow and roll-to-quiver clearance >= 0 at every step, no hand above the shoulder' };

console.log(JSON.stringify(R, null, 2));
if (out) writeFileSync(out, JSON.stringify(R, null, 2));
