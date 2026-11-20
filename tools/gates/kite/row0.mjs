// M3 area B, KF0 (row 0: geometry, time and sky) on the blockout, in Node: the flight law (src/game/kite/flight.js) on
// the island's own height, the environment's own trade wind and the lift seam's stub (world.mjs).
//   node tools/gates/kite/row0.mjs [--json <file>]
// (a) the test flight, T1 to the Sounding Ring: straight, and by the Organ Shelf road's lift first;
// (b) the Scar's 7 posts: the drop along the line and a downwind glide from its upper end, on the line and on the lip;
// (c) BUILD's "60 m altitude over the Pans": the most height over the Pans' ground she can carry in from the Holds;
// (d) the furled roll and the bow on the back's diagonal: needs the roll's mesh (wave 2): UNMEASURED here.
import { writeFileSync } from 'node:fs';
import { TRIG, TRIG_TOP, SITES, SCAR } from '../../../src/world/island/sites.js';
import { RegionMap } from '../../../src/core/regions.js';
import { WIND_ROADS, streams } from '../../../src/game/kite/roads.js';
import { glideRatio, dirBearing, KITE } from '../../../src/game/kite/flight.js';
import { islandWorld, islandLift, heightAt, fly } from './world.mjs';

const args = process.argv.slice(2);
const out = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const r2 = (v) => +v.toFixed(2);
const site = (id) => SITES.find((s) => s.id === id);
const bearingTo = (a, b) => dirBearing(b.x - a.x, b.z - a.z);
const world = islandWorld();
const regions = new RegionMap().build();
/** jumping off a 4 m pillar's edge: Space at 0.35 s of air is about 1.4 m over the top (the jump's 1.5 m peak at 0.37 s) */
const JUMP_AT_OPEN = 1.4;

const R = { at: new Date().toISOString(), law: { air: KITE.air, sink: KITE.sink, windK: KITE.windK, liftCapM: KITE.liftCapM }, lift: 'stub (src/game/kite/lift.js makeRidgeLift on recipe heightAt); area A\'s src/world/island/lift.js not in the tree' };

/* (a) the test flight */
{
  const T1 = TRIG.find((t) => t.id === 'T1'), ring = site('sounding-ring');
  const g = heightAt(T1.x, T1.z), launchY = g + TRIG_TOP + JUMP_AT_OPEN;
  const ringY = heightAt(ring.x, ring.z), dist = Math.hypot(ring.x - T1.x, ring.z - T1.z), brg = bearingTo(T1, ring);
  const ratio = glideRatio(brg, 5.5);
  const need = dist / ratio, have = launchY - ringY;
  // straight, steering at the Ring all the way (the wind sets her off her line otherwise)
  const toRing = (f) => { const want = Math.atan2(ring.x - f.x, -(ring.z - f.z)); let d = want - f.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return { bank: Math.max(-1, Math.min(1, d * 3)) }; };
  const s = fly(world, { x: T1.x, y: launchY, z: T1.z, headingDeg: brg, steer: toRing, maxS: 90 });
  const short = Math.hypot(ring.x - s.f.x, ring.z - s.f.z);
  // by the Organ Shelf road: work the posts' lift (back and forth along them) until 60 s or the cap, then for the Ring
  const posts = WIND_ROADS['organ-shelf'];
  // start at the post nearest T1, then work the line end to end and back
  let leg = posts.reduce((b, p, i) => (Math.hypot(p.x - T1.x, p.z - T1.z) < Math.hypot(posts[b].x - T1.x, posts[b].z - T1.z) ? i : b), 0), dirn = 1, phase = 'road';
  const liftOnPosts = posts.map((p) => ({ id: p.id, ground: r2(heightAt(p.x, p.z)), lift: [3, 10, 20, 30].map((a) => r2(islandLift(p.x, heightAt(p.x, p.z) + a, p.z))) }));
  const road = (f, t) => {
    if (phase === 'road' && (t > 60 || f.y >= launchY + KITE.liftCapM - 0.5)) phase = 'ring';
    if (phase === 'ring') return toRing(f);
    const p = posts[leg];
    if (Math.hypot(p.x - f.x, p.z - f.z) < 6) { leg += dirn; if (leg >= posts.length || leg < 0) { dirn = -dirn; leg += 2 * dirn; } }
    const q = posts[leg];
    const want = Math.atan2(q.x - f.x, -(q.z - f.z)); let d = want - f.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    return { bank: Math.max(-1, Math.min(1, d * 3)) };
  };
  let liftS = 0, maxLift = 0;
  const v = fly(world, { x: T1.x, y: launchY, z: T1.z, headingDeg: bearingTo(T1, posts[leg]), steer: road, maxS: 180,
    onStep: (f) => { if (f.lift > 0) { liftS += 1 / 60; maxLift = Math.max(maxLift, f.lift); } } });
  const vShort = Math.hypot(ring.x - v.f.x, ring.z - v.f.z);
  R.a = {
    T1: { e: T1.e, n: T1.n, ground: r2(g), launchY: r2(launchY) }, ring: { ground: r2(ringY), riseR: 66 },
    distM: r2(dist), bearing: r2(brg), glideOverGround: r2(ratio), heightNeededM: r2(need), heightHaveM: r2(have),
    straight: { landedM_fromRingCentre: r2(short), landedGround: r2(heightAt(s.f.x, s.f.z)), t: s.t, onTheRise: heightAt(s.f.x, s.f.z) >= ringY - 1 && short < 66 },
    byOrganShelfRoad: { liftAtPosts_3_10_20_30mAGL: liftOnPosts, postsStreaming: posts.filter((p) => streams(p, islandLift, heightAt)).length, maxY: v.maxY, gainM: r2(v.maxY - launchY), liftSeconds: r2(liftS), maxLift: r2(maxLift), landedM_fromRingCentre: r2(vShort), t: v.t, onTheRise: heightAt(v.f.x, v.f.z) >= ringY - 1 && vShort < 66 },
  };
}

/* (b) the Scar */
{
  const A = SCAR.a, B = SCAR.b, L = Math.hypot(B.x - A.x, B.z - A.z), ux = (B.x - A.x) / L, uz = (B.z - A.z) / L;
  const hA = heightAt(A.x, A.z), hB = heightAt(B.x, B.z), brg = dirBearing(ux, uz);
  const profile = [];
  for (let k = 0; k <= 1.0001; k += 0.1) profile.push(r2(heightAt(A.x + ux * L * k, A.z + uz * L * k)));
  const need = L / glideRatio(brg, 5.5);
  const along = (side) => {
    // north-west lip: the right of the line going SW
    const nx = -uz * side * 15, nz = ux * side * 15;
    const x0 = A.x + nx, z0 = A.z + nz, y0 = heightAt(x0, z0) + 3 + JUMP_AT_OPEN;
    const steer = (f) => { const tx = f.x - x0, tz = f.z - z0; const s = tx * ux + tz * uz; const off = (tx * -uz + tz * ux); const want = Math.atan2(ux, -uz) - Math.max(-0.5, Math.min(0.5, off * 0.05)); let d = want - f.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; void s; return { bank: Math.max(-1, Math.min(1, d * 3)) }; };
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

/* (c) the most height over the Pans' ground she carries in from the Holds */
{
  const T2 = TRIG.find((t) => t.id === 'T2'), salt = site('saltrow');
  const tries = [];
  for (const [name, p, h] of [['T2', T2, TRIG_TOP], ['the Scar upper end', SCAR.a, 3], ['Ninewalls', site('ninewalls'), 3]]) {
    const y0 = heightAt(p.x, p.z) + h + JUMP_AT_OPEN, brg = bearingTo(p, salt);
    let best = 0, firstPans = null;
    const steer = (f) => { const want = Math.atan2(salt.x - f.x, -(salt.z - f.z)); let d = want - f.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return { bank: Math.max(-1, Math.min(1, d * 3)) }; };
    fly(world, { x: p.x, y: y0, z: p.z, headingDeg: brg, steer, maxS: 240, onStep: (f) => { if (regions.regionAt(f.x, f.z) === 'pans') { if (firstPans === null) firstPans = f.agl; best = Math.max(best, f.agl); } } });
    tries.push({ from: name, launchY: r2(y0), aglEnteringPans: firstPans === null ? null : r2(firstPans), maxAglOverPans: r2(best) });
  }
  const T1 = TRIG.find((t) => t.id === 'T1');
  R.c = { fromTheHolds: tries, fromT1_capM: r2(heightAt(T1.x, T1.z) + TRIG_TOP + JUMP_AT_OPEN + KITE.liftCapM - heightAt(T1.x, T1.z)) };
}

R.d = { status: 'UNMEASURED', why: 'needs the furled roll\'s mesh and mount (wave 2: armory recipe kite-survey.mjs, sockets)' };

console.log(JSON.stringify(R, null, 2));
if (out) writeFileSync(out, JSON.stringify(R, null, 2));
