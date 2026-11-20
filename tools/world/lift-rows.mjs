/**
 * THE LIFT ROWS IN NODE (Milestone 3 wave 1, area A with area B; M3 briefs §4 row 0 "liftAt along all three post
 * lines", §5 KF0 (a) the test flight and (b) the Scar's 7 posts, KF3, KF7). Reads the game's own law
 * (src/world/island/lift.js liftAt over recipe.heightAt): no copy of it here.
 *
 *   node tools/world/lift-rows.mjs [--json <file>]
 *
 * The flight is area B's own law (src/game/kite/flight.js stepFlight; rule 21: a twin imports the game's module), stepped
 * on this lift field, the recipe's ground and the trade (5.5 m/s from 045, environment.js's mean; its gusts aside), with
 * a steering hand that holds the ground track on the goal. Where the law is absent (an older tree) BIBLE §12's numbers
 * stand in (KF2: 7.5 m/s through the air, 1.5 m/s of sink, the wind adding 0.4 x its speed).
 * The line-posts are area B's (src/game/kite/roads.js WIND_ROADS): each is read by its own `streams()`; the bible's
 * lines are read too, for the ruling.
 */
import { writeFileSync } from 'node:fs';
import { ensureMacro, heightAt } from '../../src/world/island/recipe.js';
import { TRIG, TRIG_TOP, SCAR, siteById } from '../../src/world/island/sites.js';
import { liftAt, faceAt, strengthOf, LIFT, TRADE } from '../../src/world/island/lift.js';
import { SCAR_LINE, scarPoint, scarFloor } from '../../src/world/holds/blockout.js';
let FL = null, ROADS = null;
try { FL = await import('../../src/game/kite/flight.js'); } catch { /* area B's law is not in this tree */ }
try { ROADS = await import('../../src/game/kite/roads.js'); } catch { /* nor its posts */ }

const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;
const D2R = Math.PI / 180;
ensureMacro();
const H = (e, n) => heightAt(e, -n);
const lift = (e, n, y, launchY) => liftAt(e, y, -n, launchY != null ? { launchY } : null);
const rec = { tool: 'tools/world/lift-rows.mjs', law: { ...LIFT }, wind: { ...TRADE }, rows: {} };
const say = (s) => console.log(s);

/** BIBLE §12 (KF2), per second: the kite's ground velocity (E, N) holding a ground track on `bearing`, in the trade. */
export const KITE = Object.freeze({ air: 7.5, sink: 1.5, windShare: 0.4, open: { airborne: 0.35, clear: 3 } });
const WIND = { e: TRADE.x, n: -TRADE.z };   // the trade in (E, N), m/s: toward 225
function groundVel(bearing) {
  const t = { e: Math.sin(bearing * D2R), n: Math.cos(bearing * D2R) }, p = { e: t.n, n: -t.e };
  const d = { e: WIND.e * KITE.windShare, n: WIND.n * KITE.windShare };
  const b = -(d.e * p.e + d.n * p.n) / KITE.air;            // the crab: the air heading's share across the track
  if (Math.abs(b) >= 1) return null;
  const a = Math.sqrt(1 - b * b);
  const speed = KITE.air * a + (d.e * t.e + d.n * t.n);
  return { e: t.e * speed, n: t.n * speed, speed };
}

/** A straight glide from (e, n, y) on a ground track to a goal; lift by the law, capped at launchY + 25. */
function glide(from, goal, launchY, stopR = 17) {
  const brg = Math.atan2(goal.e - from.e, goal.n - from.n) / D2R;
  const v = groundVel(brg);
  let e = from.e, n = from.n, y = from.y, t = 0, liftS = 0, maxLift = 0;
  const dt = 0.05;
  for (; t < 120; t += dt) {
    const L = lift(e, n, y, launchY);
    liftS += L * dt; maxLift = Math.max(maxLift, L);
    y += (L - KITE.sink) * dt; e += v.e * dt; n += v.n * dt;
    const g = Math.max(0, H(e, n));
    if (y <= g) return { arrived: false, e: r1(e), n: r1(n), t: r1(t), distLeft: r1(Math.hypot(goal.e - e, goal.n - n)), speed: r2(v.speed), bearing: r1((brg + 360) % 360), liftGain: r1(liftS), maxLift: r2(maxLift) };
    if (Math.hypot(goal.e - e, goal.n - n) <= stopR) return { arrived: true, e: r1(e), n: r1(n), y: r1(y), over: r1(y - g), t: r1(t), speed: r2(v.speed), bearing: r1((brg + 360) % 360), liftGain: r1(liftS), maxLift: r2(maxLift) };
  }
  return { arrived: false, t: r1(t) };
}

/* ======================================================================== KF0 (a): T1 to the Sounding Ring */
const t1 = TRIG.find((t) => t.id === 'T1'), ring = siteById('sounding-ring');
const t1g = H(t1.e, t1.n), t1top = t1g + TRIG_TOP;
// (area B, M3-B fix round 1, the smallest change here: the one launch height both lanes read, area B's
//  flight.js openHeightOffTop: a jump off the pillar, Space at 0.35 s, at the game's 22 m/s^2. A step off a 4 m pillar
//  is 2.65 m over its foot at 0.35 s, under the 3 m clear, so the open is refused; the old line here read 9.81 m/s^2)
const openY = FL?.openHeightOffTop ? FL.openHeightOffTop(t1top) : t1top - 0.5 * 9.81 * KITE.open.airborne ** 2;
const fall = t1top - openY;
const ringTop = H(ring.e, ring.n);
const d = Math.hypot(ring.e - t1.e, ring.n - t1.n), brg = (Math.atan2(ring.e - t1.e, ring.n - t1.n) / D2R + 360) % 360;
const gv = groundVel(brg);
const need = (d - 17) / gv.speed * KITE.sink;          // still-air sink over the track to the Ring's near rim (17 m: half its 34 m)
say('KF0 (a)  the test flight: T1 as built to the Sounding Ring, the trade from 045 at 5.5 m/s');
say(`  T1 (${t1.e}, ${t1.n}): ground ${r2(t1g)} m, top ${r2(t1top)} m (TRIG_TOP ${TRIG_TOP}); the kite opens at the earliest ${KITE.open.airborne} s ${fall < 0 ? `after a jump off the top, ${r2(-fall)} m over it` : `off the top, ${r2(fall)} m down`}: ${r2(openY)} m, ${r2(openY - t1g)} m over the pillar's foot (bar >= ${KITE.open.clear}: ${openY - t1g >= KITE.open.clear ? 'clear' : 'NOT clear'})`);
say(`  the Ring (${ring.e}, ${ring.n}) on its rise at ${r2(ringTop)} m: ${r1(d)} m on bearing ${r1(brg)}; over the ground ${r2(gv.speed)} m/s, so ${r1((d - 17) / gv.speed)} s and ${r1(need)} m of sink to its near rim: the flight needs ${r1(ringTop + need)} m at the open and has ${r2(openY)} m`);
/** Area B's law, stepped: open at (from) on the goal's bearing, a hand on the bar holding the ground track on the goal. */
function flyLaw(from, goal) {
  const f = FL.createFlightBody(), gAt = (x, z) => Math.max(0, heightAt(x, z));
  const world = { windAt: (x, z, out) => { out.x = TRADE.x; out.z = TRADE.z; return Math.hypot(TRADE.x, TRADE.z); }, liftAt: (x, y, z) => liftAt(x, y, z), groundAt: gAt, flyable: () => true };
  let st = FL.openAt(f, { x: from.e, y: from.y, z: -from.n, headingDeg: (Math.atan2(goal.e - from.e, goal.n - from.n) / D2R + 360) % 360, groundY: gAt(from.e, -from.n) });
  let liftS = 0, maxLift = 0, t = 0;
  const dt = 1 / 60;
  for (; t < 120 && st !== 'none'; t += dt) {
    // the hand: turn the ground track (the velocity's bearing) toward the goal
    const want = Math.atan2(goal.e - f.x, goal.n + f.z), have = Math.atan2(f.vx, -f.vz);
    let err = want - have; while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI;
    const before = st;
    st = FL.stepFlight(st, f, { bank: (f.vx || f.vz) ? Math.max(-1, Math.min(1, err * 3)) : 0 }, world, dt);
    liftS += Math.max(0, f.lift) * dt; maxLift = Math.max(maxLift, f.lift);
    if (Math.hypot(goal.e - f.x, goal.n + f.z) <= 17 && st === 'gliding') return { arrived: true, e: r1(f.x), n: r1(-f.z), y: r1(f.y), over: r1(f.agl), t: r1(t), liftGain: r1(liftS), maxLift: r2(maxLift), law: 'src/game/kite/flight.js' };
    if (before === 'gliding' && st === 'landing') return { arrived: false, e: r1(f.x), n: r1(-f.z), t: r1(t), distLeft: r1(Math.hypot(goal.e - f.x, goal.n + f.z)), landVs: r2(f.landVs), liftGain: r1(liftS), maxLift: r2(maxLift), law: 'src/game/kite/flight.js' };
  }
  return { arrived: false, t: r1(t), law: 'src/game/kite/flight.js' };
}
const straight = FL ? flyLaw({ e: t1.e, n: t1.n, y: openY }, { e: ring.e, n: ring.n }) : glide({ e: t1.e, n: t1.n, y: openY }, { e: ring.e, n: ring.n }, t1top);
if (!FL) straight.law = 'BIBLE §12 numbers (no flight law in this tree)';
say(`  a glide by ${straight.law} (the hand holding the track on the Ring; lift where the face below gives it): ${straight.arrived ? `ARRIVES ${straight.over} m over the rise` : `lands at (${straight.e}, ${straight.n}) after ${straight.t} s, ${straight.distLeft} m short of the Ring's centre`}; lift met on the way ${straight.liftGain} m (the most ${straight.maxLift} m/s)`);
// the ridge-lift road near T1: the windward faces (>= 25 deg, facing the trade) of the Organ Shelf within 120 m of T1
let cells = 0, best = null;
const near = [];
for (let e = t1.e - 120; e <= t1.e + 120; e += 4) for (let n = t1.n - 120; n <= t1.n + 120; n += 4) {
  const f = faceAt(e, -n), s = strengthOf(f, TRADE);
  if (s > 0 && f.h > 0.3) { cells++; near.push({ e, n, s, h: f.h }); if (!best || s > best.s) best = { e, n, s: r2(s), h: r1(f.h), slope: r1(f.slopeDeg) }; }
}
// the largest connected band (4 m cells, 8-neighbour)
const key = (e, n) => `${e},${n}`, set = new Map(near.map((c) => [key(c.e, c.n), c]));
let band = [];
for (const c of near) {
  if (c.seen) continue;
  const comp = [], st = [c]; c.seen = true;
  while (st.length) { const q = st.pop(); comp.push(q); for (let de = -4; de <= 4; de += 4) for (let dn = -4; dn <= 4; dn += 4) { const r = set.get(key(q.e + de, q.n + dn)); if (r && !r.seen) { r.seen = true; st.push(r); } } }
  if (comp.length > band.length) band = comp;
}
let bandLen = 0;
for (const a of band) for (const b of band) bandLen = Math.max(bandLen, Math.hypot(a.e - b.e, a.n - b.n));
const bandTop = band.length ? Math.max(...band.map((c) => c.h)) : 0;
const bandNear = band.length ? band.reduce((m, c) => (Math.hypot(c.e - t1.e, c.n - t1.n) < m.d ? { d: Math.hypot(c.e - t1.e, c.n - t1.n), c } : m), { d: Infinity }) : null;
say(`  the lift within 120 m of T1: ${cells} windward cells of 4 m (>= ${LIFT.MIN_DEG} deg, facing within ${LIFT.WINDWARD_DEG} deg of 045); the largest band ${band.length} cells, ${r1(bandLen)} m end to end, its ground up to ${r1(bandTop)} m, its nearest cell ${bandNear ? `${r1(bandNear.d)} m from T1 at (${bandNear.c.e}, ${bandNear.c.n})` : 'none'}; the strongest ${best ? `${best.s} m/s at (${best.e}, ${best.n}), ${best.slope} deg` : 'none'}`);
// the steepest face near T1 that looks into the wind (the law's 25 deg is the bar it misses by)
let steep = null;
for (let e = t1.e - 120; e <= t1.e + 120; e += 4) for (let n = t1.n - 120; n <= t1.n + 120; n += 4) {
  const f = faceAt(e, -n), a = (f.aspect.x * -TRADE.x + f.aspect.z * -TRADE.z) / Math.hypot(TRADE.x, TRADE.z);
  if (a >= Math.cos(LIFT.WINDWARD_DEG * D2R) && f.h > 0.3 && (!steep || f.slopeDeg > steep.slope)) steep = { e, n, slope: r1(f.slopeDeg), h: r1(f.h) };
}
say(`  the steepest face within 120 m of T1 that looks into the trade: ${steep ? `${steep.slope} deg at (${steep.e}, ${steep.n}), ground ${steep.h} m` : 'none'} (the law asks ${LIFT.MIN_DEG}: the Organ Shelf's columns are props, its table's edges in the terrain are gentler)`);
rec.rows.steepestNearT1 = steep;
// can the band lift her to the ceiling? Soaring needs the band under her (<= 40 m below) up to launch + 25
const ceiling = t1top + LIFT.ceiling;
const soarTop = band.length ? Math.min(ceiling, bandTop + LIFT.below) : openY;
let closesSoaring = false, soarGlide = null;
if (band.length && bandNear) {
  // from the band's cell nearest the Ring at the height soaring reaches
  const c = band.reduce((m, q) => (Math.hypot(q.e - ring.e, q.n - ring.n) < m.d ? { d: Math.hypot(q.e - ring.e, q.n - ring.n), q } : m), { d: Infinity }).q;
  soarGlide = glide({ e: c.e, n: c.n, y: soarTop }, { e: ring.e, n: ring.n }, t1top);
  closesSoaring = soarGlide.arrived;
}
say(`  if she can beat back and forth in that band (area B's driver), the law lets her climb to ${r1(soarTop)} m (the ceiling ${r1(ceiling)}, the band's ground + ${LIFT.below}); from its cell nearest the Ring that glide ${soarGlide ? (soarGlide.arrived ? `ARRIVES ${soarGlide.over} m over the rise` : `lands ${soarGlide.distLeft} m short`) : 'cannot start (no band)'}`);
const closes = straight.arrived;
say(`  DOES THE TEST FLIGHT CLOSE FROM T1'S BUILT HEIGHT? ${closes ? 'YES' : 'NO'}: ${closes ? '' : `a straight glide from ${r2(openY)} m needs ${r1(ringTop + need)} m (short by ${r1(ringTop + need - openY)} m)`}${!closes ? `; with ridge lift on the Shelf: ${closesSoaring ? 'yes, if the driver can soar the band' : 'no'}` : ''}`);
rec.rows.testFlight = { t1: { ground: r2(t1g), top: r2(t1top), openY: r2(openY) }, ring: { top: r2(ringTop), dist: r1(d), bearing: r1(brg) }, groundSpeed: r2(gv.speed), needAtOpen: r1(ringTop + need), straight, band: { cells: band.length, len: r1(bandLen), groundTop: r1(bandTop), nearestToT1: bandNear ? r1(bandNear.d) : null, strongest: best }, soarTop: r1(soarTop), soarGlide, closes, closesSoaring };

/* ======================================================================== KF0 (b), KF7: the three wind roads on the bible's lines */
say('KF7  the wind roads read on the bible\'s lines (the posts are area B\'s): liftAt at a post\'s top (3 m) and at 10, 20 and 40 m over its foot');
function road(name, pts) {
  const out = pts.map((p) => {
    const g = H(p.e, p.n), f = faceAt(p.e, -p.n);
    return { e: r1(p.e), n: r1(p.n), g: r1(g), slope: r1(f.slopeDeg), faces: r1((Math.atan2(f.aspect.x, -f.aspect.z) / D2R + 360) % 360), post: r2(lift(p.e, p.n, g + 3)), at10: r2(lift(p.e, p.n, g + 10)), at20: r2(lift(p.e, p.n, g + 20)), at40: r2(lift(p.e, p.n, g + 39.9)) };
  });
  const on = out.filter((q) => q.post > 0).length;
  say(`  ${name}: ${on} of ${out.length} posts in lift (streamer streams); per post [lift at 3 m] (slope, the face's bearing): ${out.map((q) => `${q.post} (${q.slope} deg, ${q.faces})`).join('; ')}`);
  return { name, posts: out, inLift: on };
}
// the Scar's north lip: the north-west berm's crest (v < 0), 7 stations along its length
const lip = -(SCAR_LINE.half + SCAR_LINE.BERM_IN);
const scarPosts = [];
for (let k = 0; k < 7; k++) { const u = SCAR_LINE.len * (k + 0.5) / 7, p = scarPoint(u, lip); scarPosts.push(p); }
const scarRoad = road('the Scar\'s north lip (7)', scarPosts);
const drop = scarFloor(0, 0) - scarFloor(SCAR_LINE.len, 0);
const need74 = SCAR_LINE.len / 6.5;
say(`  the Scar runs on bearing 225 with the wind: its floor falls ${r1(drop)} m over ${r1(SCAR_LINE.len)} m (a downwind glide at 6.5:1 needs ${r1(need74)} m): ${drop >= need74 ? 'the drop carries a glide' : 'the drop does NOT carry a glide alone'}; launched from the Yards' apron (143 m) over the Scar's head (${r1(scarFloor(0, 0))} m) there are ${r1(143 - scarFloor(SCAR_LINE.len, 0))} m to its foot`);
// the Organ Shelf rim: 5 posts on its windward (north-east) edge nearest T1, from the band
const shelfPosts = band.length ? band.slice().sort((a, b) => Math.hypot(a.e - t1.e, a.n - t1.n) - Math.hypot(b.e - t1.e, b.n - t1.n)).filter((c, i, arr) => arr.slice(0, i).every((q) => Math.hypot(q.e - c.e, q.n - c.n) >= 10)).slice(0, 5) : [];
const shelfRoad = road('the Organ Shelf rim (5, on the band nearest T1, >= 10 m apart)', shelfPosts.length ? shelfPosts : [{ e: t1.e, n: t1.n }]);
// the caldera's windward wall: the outer north-east flank, 6 stations on bearings 15-75 from the caldera's centre where the slope is steepest
const cc = { e: 30, n: 100 };
const caldPosts = [];
for (let k = 0; k < 6; k++) {
  const b = (15 + k * 12) * D2R;
  let bestP = null, bs = -1;
  for (let r = 60; r <= 220; r += 4) { const e = cc.e + Math.sin(b) * r, n = cc.n + Math.cos(b) * r, f = faceAt(e, -n), s = strengthOf(f, TRADE); if (s > bs) { bs = s; bestP = { e, n }; } }
  caldPosts.push(bestP);
}
const caldRoad = road('the caldera\'s windward wall (6, the strongest face on bearings 15-75 from the caldera)', caldPosts);
rec.rows.roads = { scar: scarRoad, scarDrop: r1(drop), scarNeed: r1(need74), shelf: shelfRoad, caldera: caldRoad };
if (ROADS) {
  const gAt = (x, z) => heightAt(x, z);
  const per = {};
  for (const [road, list] of Object.entries(ROADS.WIND_ROADS)) {
    per[road] = list.map((p) => ({ id: p.id, e: p.e, n: p.n, streams: ROADS.streams(p, liftAt, gAt), lift: r2(liftAt(p.x, gAt(p.x, p.z) + p.heightM, p.z)), slope: r1(faceAt(p.x, p.z).slopeDeg) }));
    say(`  area B's posts (src/game/kite/roads.js), ${road}: ${per[road].filter((q) => q.streams).length} of ${list.length} stream; lift at each post's top ${per[road].map((q) => q.lift).join(', ')} (slopes ${per[road].map((q) => q.slope).join(', ')} deg)`);
  }
  rec.rows.posts = per;
}

/* ======================================================================== KF3's laws, read on the island */
let flatLift = 0, seaLift = 0, leeLift = 0, n = 0, maxS = 0, minS = Infinity;
for (let e = -480; e <= 480; e += 8) for (let nn = -480; nn <= 480; nn += 8) {
  const f = faceAt(e, -nn), y = f.h + 10, L = liftAt(e, y, -nn);
  n++;
  if (L > 0) { maxS = Math.max(maxS, L); minS = Math.min(minS, L); }
  if (f.slopeDeg < LIFT.MIN_DEG && L > 0) flatLift++;
  if (f.sea && L > 0) seaLift++;
  if ((f.aspect.x * -TRADE.x + f.aspect.z * -TRADE.z) < 0 && L > 0) leeLift++;
}
const kf3 = flatLift === 0 && seaLift === 0 && leeLift === 0 && minS >= LIFT.min && maxS <= LIFT.max;
say(`KF3  the law on the whole island (8 m samples, 10 m up): lift ${r2(minS)}-${r2(maxS)} m/s where there is any (bar 0.5-1.5); over ground under ${LIFT.MIN_DEG} deg ${flatLift}, over the sea ${seaLift}, on a lee face ${leeLift} (bar 0 each); never at or above launch + ${LIFT.ceiling}: by the law's first line: ${kf3 ? 'PASS' : 'FAIL'}`);
rec.rows.KF3 = { ok: kf3, min: r2(minS), max: r2(maxS), flatLift, seaLift, leeLift, samples: n };

if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(rec, null, 1));
