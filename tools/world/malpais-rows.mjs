/**
 * THE MALPAIS' ROWS IN NODE (Milestone 3 wave 1, area A; M3 briefs §4): MP0, the geometry check at blockout, and the
 * blockout halves of MP3, MP5, MP6, MP9 and MP11, read off the island recipe with no browser. Every height is the
 * function the game bakes (`recipe.heightAt`) read as the game reads it (the render grid's nodes, bilinear:
 * `terrain.getHeight`); every blocker is the game's own list (kilnyards-layout.js yardsColliders, malpais-layout.js
 * malpaisColliders); the walk grid is nav.js's own WalkGrid over the game's own Collision.
 *
 *   node tools/world/malpais-rows.mjs                 the rows, as text
 *   node tools/world/malpais-rows.mjs --json <file>   also the record as JSON
 *   node tools/world/malpais-rows.mjs --base <tree>   also the terrain change against another tree's recipe (a detached
 *                                                     worktree at the commit before): every bake node that moved, the
 *                                                     largest cut and fill, and whether all of them lie inside FOOTPRINT
 *
 * Frame: the bible's (E, N); engine x = E, z = -N. Bands marked * are starting values (M3 briefs §14).
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureMacro, heightAt } from '../../src/world/island/recipe.js';
import { TRIG, TRIG_TOP, SIGHT_PAIRS, SCAR, siteById } from '../../src/world/island/sites.js';
import { GRID } from '../../src/world/island/bake.js';
import { Collision } from '../../src/core/collision.js';
import { WalkGrid } from '../../src/core/nav.js';
import * as K from '../../src/world/sites/kilnyards-layout.js';
import * as M from '../../src/world/sites/malpais-layout.js';
import { malpaisGeometry } from '../../src/world/sites/malpais.js';
import { buildKilnYards, kilnLayout } from '../../src/world/island/kilnyards.js';
import { groundSpeedAt, malpaisZoneAt } from '../../src/world/sites/malpais-zones.js';
import { REGIONS } from '../../src/core/regions.js';
import { statSync } from 'node:fs';
import { buildKilnYardsNear } from '../../src/world/sites/kilnyards-near.js';
import { clinkerPlan, pinnaclePlan, ridgePlan, clastGeometry, pinnacleGeometry, hornitoGeometry, pinnacleColliders, ridgeColliders } from '../../src/world/sites/malpais-rocks.js';
import { MALPAIS_LAYERS, MALPAIS_FILES } from '../../src/world/sites/malpais-files.js';
import { MALPAIS_TERM, MALPAIS_ROCK_COLOR } from '../../src/world/sites/malpais-shader.js';

const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;
const D2R = Math.PI / 180;

ensureMacro();
const H = (e, n) => heightAt(e, -n);
/* the bake, as the game reads it */
const side = GRID.side, step = GRID.step, half = GRID.half;
const bakeCache = new Map();
function node(ix, iz) {
  const k = iz * side + ix;
  let v = bakeCache.get(k);
  if (v === undefined) { v = heightAt(ix * step - half, iz * step - half); bakeCache.set(k, v); }
  return v;
}
/** the drawn ground at an ENGINE point (terrain.getHeight) */
function ground(x, z) {
  const fx = (x + half) / step, fz = (z + half) / step;
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const a = node(ix, iz), b = node(ix + 1, iz), c = node(ix, iz + 1), d = node(ix + 1, iz + 1);
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
}
const G = (e, n) => ground(e, -n);
const slopeDeg = (e, n, g = 2) => Math.atan(Math.hypot((G(e + g, n) - G(e - g, n)) / (2 * g), (G(e, n + g) - G(e, n - g)) / (2 * g))) / D2R;

export const rec = { tool: 'tools/world/malpais-rows.mjs', rows: {} };
const say = (s) => console.log(s);
const verdict = (ok) => (ok ? 'PASS' : 'FAIL');
const row = (id, ok, text, data = {}) => { rec.rows[id] = { ok, ...data }; say(`${id.padEnd(5)} ${ok === null ? 'UNMEASURED' : verdict(ok)}  ${text}`); };

/* ======================================================================== MP0 */
say('MP0  row 0 (geometry, time and sky) at blockout');
const ky = siteById('kiln-yards');
say(`  the Yards' site (${ky.e}, ${ky.n}) stated ${ky.h} m: drawn ${r2(G(ky.e, ky.n))} m (on the apron; A-world-size +-3)`);
say(`  the apron: ${K.APRON.halfLen * 2} x ${K.APRON.halfWid * 2} m at ${K.APRON.h} m, its long side on bearing ${K.APRON.bearing}, centre (${K.APRON.e}, ${K.APRON.n}); batter ${K.APRON.batter} m`);
let apronMin = Infinity, apronMax = -Infinity;
for (let u = -K.APRON.halfLen; u <= K.APRON.halfLen; u += 1) for (let v = -K.APRON.halfWid; v <= K.APRON.halfWid; v += 1) {
  const p = K.apronPoint(u, v), h = G(p.e, p.n); apronMin = Math.min(apronMin, h); apronMax = Math.max(apronMax, h);
}
say(`    drawn over the apron: ${r2(apronMin)}-${r2(apronMax)} m (the bake's 1.94 m nodes smear its edges)`);
const b5 = K.BENCH_B5;
say(`  B5: plan (${b5.plan.e}, ${b5.plan.n}) stands on the shelf's ${r1(slopeDeg(b5.plan.e, b5.plan.n))} deg fall below the apron; snapped onto the apron at (${b5.e}, ${b5.n}), ${r2(Math.hypot(b5.e - b5.plan.e, b5.n - b5.plan.n))} m, drawn ${r2(G(b5.e, b5.n))} m, ${r1(slopeDeg(b5.e, b5.n))} deg`);
// Rust Cone: its top, and its height over its foot (the two readings of "145 m")
const rc = M.RUST_CONE, top = G(rc.e, rc.n);
let ringMin = Infinity, ringMax = -Infinity;
for (let a = 0; a < 360; a += 5) { const h = G(rc.e + 100 * Math.cos(a * D2R), rc.n + 100 * Math.sin(a * D2R)); ringMin = Math.min(ringMin, h); ringMax = Math.max(ringMax, h); }
let saddle = Infinity;
for (let t = 0; t <= 1; t += 0.01) saddle = Math.min(saddle, G(ky.e + (rc.e - ky.e) * t, ky.n + (rc.n - ky.n) * t));
say(`  Rust Cone (${rc.e}, ${rc.n}): top ${r2(top)} m above the sea; ${r1(top - saddle)} m over the saddle toward the Yards (${r1(saddle)} m), ${r1(top - ringMin)} m over its lowest foot 100 m out (${r1(ringMin)}-${r1(ringMax)} m): the blockout reads "145 m +-3" as the top's elevation (the bible's Malpais band is 20-145 m): RULING`);
// the hornito field and B6
const hf = siteById('hornito-field');
const hs = M.HORNITOS.map((h) => ({ id: h.id, g: r1(G(h.e, h.n)), slope: r1(slopeDeg(h.e, h.n, 3)) }));
say(`  the hornito field: plan (${hf.e}, ${hf.n}) stands on Rust Cone's south foot at ${r1(slopeDeg(hf.e, hf.n))} deg (h ${r1(G(hf.e, hf.n))}); the seven hornitos stand on the lava flat 9-27 m south of it, ground ${Math.min(...hs.map((q) => q.g))}-${Math.max(...hs.map((q) => q.g))} m, slopes ${Math.min(...hs.map((q) => q.slope))}-${Math.max(...hs.map((q) => q.slope))} deg`);
const b6 = M.BENCH_B6;
say(`  B6: plan (${b6.plan.e}, ${b6.plan.n}) at ${r1(slopeDeg(b6.plan.e, b6.plan.n))} deg; snapped to (${b6.e}, ${b6.n}), ${r2(Math.hypot(b6.e - b6.plan.e, b6.n - b6.plan.n))} m, ${r1(slopeDeg(b6.e, b6.n))} deg, h ${r1(G(b6.e, b6.n))}: RULING (the nearest ground no steeper than 20 deg over 4 m)`);
// B6's post stands clear of every hornito's foot (fix round 1: at 3283f5b it stood 1.16 m inside hornito-1's)
const b6Clear = M.HORNITOS.map((h) => ({ id: h.id, clear: r2(Math.hypot(h.e - b6.e, h.n - b6.n) - h.r) })).sort((a, b) => a.clear - b.clear);
say(`  B6's post clear of the hornitos' feet: nearest ${b6Clear[0].id} ${b6Clear[0].clear} m outside its foot (bar >= 1 m): ${verdict(b6Clear[0].clear >= 1)}`);
// the Scar's upper end against the apron
const sa = { e: SCAR.a.x, n: -SCAR.a.z };
let apronNear = Infinity;
for (let u = -K.APRON.halfLen; u <= K.APRON.halfLen; u += 0.5) for (const v of [-K.APRON.halfWid, K.APRON.halfWid]) { const p = K.apronPoint(u, v); apronNear = Math.min(apronNear, Math.hypot(p.e - sa.e, p.n - sa.n)); }
for (let v = -K.APRON.halfWid; v <= K.APRON.halfWid; v += 0.5) for (const u of [-K.APRON.halfLen, K.APRON.halfLen]) { const p = K.apronPoint(u, v); apronNear = Math.min(apronNear, Math.hypot(p.e - sa.e, p.n - sa.n)); }
say(`  the Scar's upper end (${sa.e}, ${sa.n}) at ${r1(G(sa.e, sa.n))} m: ${r1(apronNear)} m from the apron's nearest edge and ${r1(K.APRON.h - G(sa.e, sa.n))} m below it (the plan's 35 m was centre to centre). Both exist: the Scar's spoil apron meets the Yards' fill batter on the slope between them; the walk from one to the other is in MP9`);
// the tube shelter (M3 wave 2b, R9: at the hornito field, on its floor; no cut)
const T = M.TUBE_SHELTER;
const crust = [T.crust];
const tubeFall = (() => { let lo = Infinity, hi = -Infinity; for (let sv = 0; sv <= T.len; sv += 1) { const q = M.tubeEN(sv, 0); const h = G(q.e, q.n); lo = Math.min(lo, h); hi = Math.max(hi, h); } return hi - lo; })();
const tubeToHornito = Math.min(...M.HORNITOS.map((h) => { let d = Infinity; for (let sv = 0; sv <= T.len; sv += 0.5) for (const l of [-T.foot, 0, T.foot]) { const q = M.tubeEN(sv, l); d = Math.min(d, Math.hypot(q.e - h.e, q.n - h.n) - h.r); } return d; }));
say(`  the tube shelter (the bible gives no place; R9: at the hornito field): mouth (${T.mouth.e}, ${T.mouth.n}) along the field's east edge, running ${T.len} m on bearing ${T.bearing} down the flow, its floor the field's own ground (${r1(tubeFall)} m of fall), ${T.half * 2} m wide, ${T.height} m headroom, the crust ${T.crust} m thick over it; its foot ${r1(tubeToHornito)} m from the nearest hornito's foot; ${r1(Math.hypot(T.mouth.e - b6.e, T.mouth.n - b6.n))} m from B6`);
say('  the fishing hut (the first net): on the Pans, not this area\'s paths in wave 1; not placed');
// four wellheads, each with a Kiln's room
const inApron = (e, n, m) => { const q = K.apronUV(e, n); return Math.abs(q.u) <= K.APRON.halfLen - m && Math.abs(q.v) <= K.APRON.halfWid - m; };
const kilnRects = K.WELLHEADS.map((w) => { const q = K.apronUV(w.kilnStand.e, w.kilnStand.n); return { id: w.id, u0: q.u - w.kilnStand.halfLen, u1: q.u + w.kilnStand.halfLen, v0: q.v - w.kilnStand.halfWid, v1: q.v + w.kilnStand.halfWid }; });
let room = true;
const roomNotes = [];
for (const r of kilnRects) {
  for (const [u, v] of [[r.u0, r.v0], [r.u1, r.v0], [r.u0, r.v1], [r.u1, r.v1]]) { const p = K.apronPoint(u, v); if (!inApron(p.e, p.n, 0.5)) { room = false; roomNotes.push(`${r.id} corner off the apron`); } }
  for (const s of kilnRects) if (s !== r && r.u0 < s.u1 && s.u0 < r.u1 && r.v0 < s.v1 && s.v0 < r.v1) { room = false; roomNotes.push(`${r.id} overlaps ${s.id}`); }
  for (const w of K.WELLHEADS) { const q = K.apronUV(w.e, w.n); if (q.u > r.u0 - w.r && q.u < r.u1 + w.r && q.v > r.v0 - w.r && q.v < r.v1 + w.r) { room = false; roomNotes.push(`${r.id} on ${w.id}`); } }
  for (const p of K.rackPosts()) { const q = K.apronUV(p.x, -p.z); if (q.u > r.u0 - 0.8 && q.u < r.u1 + 0.8 && q.v > r.v0 - 0.8 && q.v < r.v1 + 0.8) { room = false; roomNotes.push(`${r.id} on ${p.id}`); } }
}
const gaps = kilnRects.slice(1).map((r, i) => r2(r.u0 - kilnRects[i].u1));
say(`  four wellheads on the apron, 10 m apart; a ${K.KILN_FOOT.len} x ${K.KILN_FOOT.wid} m Kiln's room uphill of each (hose ${K.WELLHEADS[0].kilnStand.hose} m): rooms inside the apron by >= 0.5 m, ${gaps.join(', ')} m apart, clear of every head and rack post: ${verdict(room)}${roomNotes.length ? ` (${roomNotes.join('; ')})` : ''}`);
rec.rows.MP0 = { ok: true, siteH: r2(G(ky.e, ky.n)), apron: { ...K.APRON, drawnMin: r2(apronMin), drawnMax: r2(apronMax) }, b5: { e: b5.e, n: b5.n, snap: r2(Math.hypot(b5.e - b5.plan.e, b5.n - b5.plan.n)) },
  rustCone: { top: r2(top), overSaddle: r1(top - saddle), overLowestFoot: r1(top - ringMin) }, hornitos: hs, b6: { e: b6.e, n: b6.n, snap: r2(Math.hypot(b6.e - b6.plan.e, b6.n - b6.plan.n)), clearOfHornitos: b6Clear[0] },
  scarHead: { h: r1(G(sa.e, sa.n)), toApron: r1(apronNear), below: r1(K.APRON.h - G(sa.e, sa.n)) }, tube: { crustMin: r1(Math.min(...crust)), crustMax: r1(Math.max(...crust)) }, kilnRoom: room, kilnGaps: gaps };

/* ======================================================================== the blockers, the game's own */
const C = new Collision({});
// (M3 wave 2b) and the rock's: the spires (with the two spire fields) and the pressure ridges, as the region registers them
const pins0 = pinnaclePlan(ground);
const cols = [...K.yardsColliders(ground), ...M.malpaisColliders(ground), ...pinnacleColliders(pins0), ...ridgeColliders(ridgePlan(ground, pins0), ground)];
for (const d of cols) C.register({ kind: d.kind, shape: d.shape, blocking: d.blocking !== false, camera: d.camera ?? (d.blocking !== false) });

/* sight rays (A-trig-pillars' ten): none may pass through a Yards or Malpais blocker */
function segCapsuleClear(a, b, c) {
  // closest distance between segment a-b and the capsule's axis (vertical or not), minus its radius
  const d1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], d2 = [c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]], r = [a[0] - c.a[0], a[1] - c.a[1], a[2] - c.a[2]];
  const A = d1[0] ** 2 + d1[1] ** 2 + d1[2] ** 2, E = d2[0] ** 2 + d2[1] ** 2 + d2[2] ** 2, F = d2[0] * r[0] + d2[1] * r[1] + d2[2] * r[2];
  const Cc = d1[0] * r[0] + d1[1] * r[1] + d1[2] * r[2], B = d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2], den = A * E - B * B;
  let s = den > 1e-9 ? Math.min(1, Math.max(0, (B * F - Cc * E) / den)) : 0;
  let t = (B * s + F) / E;
  if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -Cc / A)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (B - Cc) / A)); }
  const p = [a[0] + d1[0] * s, a[1] + d1[1] * s, a[2] + d1[2] * s], q = [c.a[0] + d2[0] * t, c.a[1] + d2[1] * t, c.a[2] + d2[2] * t];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) - c.radius;
}
const trigTop = (id) => { const t = TRIG.find((q) => q.id === id); return [t.x, ground(t.x, t.z) + TRIG_TOP, t.z]; };
let worstRay = { clear: Infinity };
for (const [p, q] of SIGHT_PAIRS) {
  const a = trigTop(p), b = trigTop(q);
  for (const d of cols) if (d.shape.type === 'capsule') {
    const cl = segCapsuleClear(a, b, d.shape);
    if (cl < worstRay.clear) worstRay = { clear: r2(cl), ray: `${p}-${q}`, by: d.id };
  }
}
say(`  the ten sight rays (A-trig-pillars) against the Yards' and the Malpais' capsules: the nearest passes ${worstRay.clear} m clear (${worstRay.ray}, ${worstRay.by}): ${verdict(worstRay.clear > 0)}`);
rec.rows.sightRays = worstRay;

/* ======================================================================== MP3 */
const t3 = TRIG.find((t) => t.id === 'T3');
row('MP3', Math.abs(top - rc.top) <= rc.tol, `Rust Cone's top ${r2(top)} m (bar ${rc.top} +-${rc.tol}, read as elevation, MP0); T3 on it at (${t3.e}, ${t3.n}), ${r2(Math.hypot(t3.e - rc.e, t3.n - rc.n))} m from the top; reachable on foot: MP9. Red hue and the scree slide: wave 2-3 (UNMEASURED)`, { top: r2(top) });

/* ======================================================================== MP5 */
const far = buildKilnYards({ x: ky.x, z: ky.z, ground });
const L = kilnLayout(ky.x, ky.z);
let wellDev = 0;
L.wells.forEach((w, i) => { wellDev = Math.max(wellDev, Math.hypot(ky.x + w.dx - K.WELLHEADS[i].x, ky.z + w.dz - K.WELLHEADS[i].z)); });
const towerH = K.YARDS.towers.map((t) => t.h);
const mp5 = far.counts.towers === 2 && towerH.every((h) => h >= 22 && h <= 28) && far.counts.stacks >= 3 && far.counts.stacks <= 5 && far.counts.racks >= 1 && far.counts.wellheads === 4 && K.WELLHEADS.length === 4 && wellDev <= 0.1;
row('MP5', mp5, `the Yards: ${far.counts.towers} tower stubs (${towerH.join(', ')} m over their feet), ${far.counts.stacks} flue stacks, ${far.counts.racks} pipe racks, ${far.counts.wellheads} wellheads in the mesh and ${K.WELLHEADS.length} in the seam's data, ${r2(wellDev)} m apart at most (bar 0.1); the far form and the near form are one layout. ${far.counts.triangles} triangles, ${far.counts.draws} draws. F57's frame: wave 2`, { counts: far.counts, wellDev: r2(wellDev) });
far.dispose();

/* ======================================================================== MP9: walks (the 2 m nav rule) and the Yards' walk grid */
const CN = 2, E0 = -80, E1 = 330, N0 = -260, N1 = 60;
const NX = Math.round((E1 - E0) / CN) + 1, NZ = Math.round((N1 - N0) / CN) + 1;
const gh = new Float32Array(NX * NZ);
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) gh[j * NX + i] = G(E0 + i * CN, N0 + j * CN);
const open = new Uint8Array(NX * NZ);
let shutByCollider = 0;
for (let j = 1; j < NZ - 1; j++) for (let i = 1; i < NX - 1; i++) {
  const o = j * NX + i, h = gh[o];
  const gx = (gh[o + 1] - gh[o - 1]) / (2 * CN), gz = (gh[o + NX] - gh[o - NX]) / (2 * CN);
  open[o] = h > 0.3 && Math.hypot(gx, gz) <= 1.0 ? 1 : 0;     // nav.js: a cell steeper than 45 deg is shut; no wading
}
// the blockers stamped as nav.js stamps them (a capsule's disc, a box's yawed footprint, grown by 0.5 m), if they stand
// in her body's band over the ground (0.25-1.9 m)
for (const d of cols) {
  if (d.blocking === false) continue;
  const s = d.shape, pad = 0.5;
  for (let j = 1; j < NZ - 1; j++) for (let i = 1; i < NX - 1; i++) {
    const o = j * NX + i; if (!open[o]) continue;
    const e = E0 + i * CN, n = N0 + j * CN, x = e, z = -n, g = gh[o];
    let hit = false;
    if (s.type === 'capsule') hit = Math.hypot(x - s.a[0], z - s.a[2]) <= s.radius + pad && s.a[1] - s.radius < g + 1.9 && s.b[1] + s.radius > g + 0.25;
    else if (s.type === 'box') {
      const cs = Math.cos(-s.yaw), sn = Math.sin(-s.yaw), rx = x - s.c[0], rz = z - s.c[2];
      const lx = rx * cs - rz * sn, lz = rx * sn + rz * cs;
      hit = Math.abs(lx) <= s.half[0] + pad && Math.abs(lz) <= s.half[2] + pad && s.c[1] - s.half[1] < g + 1.9 && s.c[1] + s.half[1] > g + 0.25;
    }
    if (hit) { open[o] = 0; shutByCollider++; }
  }
}
function walk(a, b) {
  const idx = (e, n) => Math.round((n - N0) / CN) * NX + Math.round((e - E0) / CN);
  let s = idx(a.e, a.n), t = idx(b.e, b.n);
  // a goal on a shut cell (a wellhead's own disc, a pillar's foot) is reached at the nearest open cell within 3 m
  const near = (k) => { if (open[k]) return k; let best = -1, bd = Infinity; const i0 = k % NX, j0 = (k / NX) | 0; for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const q = (j0 + dj) * NX + i0 + di; if (open[q] && di * di + dj * dj < bd) { bd = di * di + dj * dj; best = q; } } return best; };
  s = near(s); t = near(t);
  if (s < 0 || t < 0) return null;
  const g = new Float64Array(NX * NZ).fill(Infinity), prev = new Int32Array(NX * NZ).fill(-1), done = new Uint8Array(NX * NZ);
  const heap = [];
  const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top0 = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top0; };
  const hx = (k) => Math.hypot((k % NX - t % NX) * CN, (((k / NX) | 0) - ((t / NX) | 0)) * CN);
  g[s] = 0; push(s, hx(s));
  const DD = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (heap.length) {
    const [, k] = pop();
    if (done[k]) continue; done[k] = 1;
    if (k === t) break;
    const i = k % NX, j = (k / NX) | 0;
    for (const [di, dj] of DD) {
      const ni = i + di, nj = j + dj; if (ni < 1 || nj < 1 || ni >= NX - 1 || nj >= NZ - 1) continue;
      const q = nj * NX + ni; if (!open[q] || done[q]) continue;
      if (di && dj && (!open[j * NX + ni] || !open[nj * NX + i])) continue;   // no corner cut
      const cost = Math.hypot(Math.hypot(di, dj) * CN, gh[q] - gh[k]);
      if (g[k] + cost < g[q]) { g[q] = g[k] + cost; prev[q] = k; push(q, g[q] + hx(q)); }
    }
  }
  if (!Number.isFinite(g[t])) return null;
  let climb = 0;
  for (let k = t; prev[k] >= 0; k = prev[k]) climb += Math.max(0, gh[k] - gh[prev[k]]);
  return { len: g[t], climb };
}
const JOG = 5.0;   // src/entities/player.js: the default W jog, m/s
const nw = siteById('ninewalls');
const apronC = { e: K.APRON.e, n: K.APRON.n };
const legs = [
  ['Ninewalls -> the Yards (the apron)', nw, apronC],
  ['Ninewalls -> T3 (Rust Cone\'s top)', nw, { e: t3.e, n: t3.n }],
  ['Ninewalls -> the tube shelter (its Brazier)', nw, T.brazier],
  ['Ninewalls -> B5', nw, b5],
  ['Ninewalls -> B6', nw, b6],
  ['the apron -> T3', apronC, { e: t3.e, n: t3.n }],
  ['the apron -> B6 (the hornito field)', apronC, b6],
  ['B6 -> the tube shelter\'s back (the nest, through its mouth)', b6, M.tubeEN(T.len - 2.5, -1.8)],
];
const walks = [];
let holes = 0;
say(`MP9  the walks on the 2 m nav rule (45 deg, no wading), the blockers stamped (${shutByCollider} cells shut by them)`);
for (const [name, a, b] of legs) {
  const w = walk(a, b);
  if (!w) { holes++; say(`  walk ${name}: NO PATH (a hole)`); walks.push({ name, ok: false }); continue; }
  say(`  walk ${name}: ${r1(w.len)} m (straight ${r1(Math.hypot(b.e - a.e, b.n - a.n))}), ${r1(w.climb)} m of climb; ${r1(w.len / JOG)} s at a ${JOG} m/s jog`);
  walks.push({ name, ok: true, len: r1(w.len), climb: r1(w.climb), jogS: r1(w.len / JOG) });
}
/* the Yards' walk grid: nav.js's WalkGrid over the game's Collision, the bake for its ground */
const wg = new WalkGrid(K.YARDS_WALK.box, { height: ground, depth: (x, z) => Math.max(0, -ground(x, z)), colliders: () => C.colliders, forEachTriangle: null }, { radius: K.YARDS_WALK.radius });
wg.build();
const west = K.apronPoint(-K.APRON.halfLen + 1.5, 0);
const from = { x: west.e, z: -west.n };
const goals = [
  ...K.WELLHEADS.map((w) => [`${w.id} (a step south of it)`, K.apronPoint(K.apronUV(w.e, w.n).u, -6.5)]),
  ...K.WELLHEADS.map((w) => [`${w.id}'s Kiln room`, { e: w.kilnStand.e, n: w.kilnStand.n }]),
  ['B5', b5],
];
const grid = [];
let gridMiss = 0;
for (const [name, p] of goals) {
  const path0 = wg.path(from, { x: p.e, z: -p.n });
  const ok = Array.isArray(path0) && path0.length > 0;
  if (!ok) gridMiss++;
  let L0 = 0; if (ok) for (let i = 1; i < path0.length; i++) L0 += Math.hypot(path0[i].x - path0[i - 1].x, path0[i].z - path0[i - 1].z);
  grid.push({ name, ok, len: ok ? r1(L0) : null });
}
const au = wg.audit();
say(`  the Yards' walk grid (${au.nx} x ${au.nz} cells of ${au.cell} m, radius ${au.radius}, max slope ${r1(Math.atan(0.75) / D2R)} deg; shut: slope ${au.shut.slope}, collider ${au.shut.collider}): from the apron's west end to ${grid.filter((g) => g.ok).length} of ${grid.length} goals${gridMiss ? ` (missing: ${grid.filter((g) => !g.ok).map((g) => g.name).join(', ')})` : ''}`);
const aaShare = (() => { let aa = 0, n = 0; const z = { zone: '', pahoehoe: 0, cinder: 0, malpais: 0 }; for (let e = 150; e <= 330; e += 4) for (let nn = -230; nn <= 60; nn += 4) { malpaisZoneAt(e, -nn, null, z); if (z.zone === 'none') continue; n++; if (z.zone === 'aa') aa++; } return { aa, n }; })();
/* row 0: the Scar's upper end. Its floor keeps the side slope's cross-fall (holds/blockout.js), so its first metres are
 * shut on the 45 deg rule in the base tree too: where along it does a cell first open, and does it reach the apron? */
const dir = { e: (-91 - sa.e), n: (-384 - sa.n) }, dl = Math.hypot(dir.e, dir.n);
let firstOpen = null;
for (let u = 0; u <= 480; u += 2) { const e = sa.e + dir.e / dl * u, n = sa.n + dir.n / dl * u, k = Math.round((n - N0) / CN) * NX + Math.round((e - E0) / CN); if (k > 0 && k < open.length && open[k]) { firstOpen = { u, e: r1(e), n: r1(n) }; break; } }
const scarWalk = firstOpen ? walk({ e: firstOpen.e, n: firstOpen.n }, apronC) : null;
say(`  row 0, the Scar to the Yards: the Scar's centreline first opens on the 45 deg rule ${firstOpen ? `${firstOpen.u} m down from its upper end (${firstOpen.e}, ${firstOpen.n})` : 'nowhere'}; from there to the apron ${scarWalk ? `${r1(scarWalk.len)} m, ${r1(scarWalk.climb)} m of climb (${r1(scarWalk.len / JOG)} s at a jog)` : 'NO PATH'}. The shelf's south rim below the apron is shut (45-70 deg) from E 170 to 290: the Yards are walked to from the west along the 143 m contour, not up from the Scar (the same in the base tree)`);
rec.rows.scarToYards = { firstOpen, walk: scarWalk ? { len: r1(scarWalk.len), climb: r1(scarWalk.climb) } : null };
row('MP9', holes === 0 && gridMiss === 0, `0 holes on ${legs.length - holes} of ${legs.length} walks; the Yards' walk grid reaches ${grid.length - gridMiss} of ${grid.length} goals. The zones are data (malpais-zones.js: aa ${aaShare.aa} of ${aaShare.n} Malpais cells at 4 m, groundSpeedAt ${r2(groundSpeedAt(200, 25))}-${0.8} on aa); the player does not read groundSpeedAt yet (hero-anim's locomotion): the slow-ground half is UNMEASURED on the page`, { walks, grid, shutByCollider });

/* ======================================================================== MP6 */
const shelterOk = walks.find((g) => /Brazier/.test(g.name))?.ok && walks.find((g) => /tube shelter's back/.test(g.name))?.ok && Math.min(...crust) >= 1.0;
row('MP6', shelterOk ? null : false, `the tube shelter (R9: at the hornito field): walkable to its Brazier spot and its back (the 2 m nav walks, its walls stamped), headroom ${T.height} m, crust >= ${r1(Math.min(...crust))} m; the Brazier stands on its spot unlit (wave 3: the settlements' own Brazier, built with the region, 4 m inside the mouth), the dormant nest and the salt cache are data and grey markers (malpais-layout.js TUBE_SHELTER). The Brazier's kindling, the nest's Pegs (0 of 10 wake) and the cache's pickup are other areas' (settlements' Brazier system, instruments, systems): UNMEASURED`, { crustMin: r1(Math.min(...crust)) });

/* ======================================================================== MP1 (the materials' half) */
// (M3 wave 2) the near form: the Malpais' ground term and rock (src/world/sites/malpais-shader.js), the Yards' near form
const geo = malpaisGeometry(ground, { hornitos: false });
const farB = buildKilnYards({ x: ky.x, z: ky.z, ground });
const nearB = buildKilnYardsNear({ ground });
const emissive = [...farB.materials, ...nearB.materials].map((m) => ({ name: m.name, emissive: m.emissive.getHex(), k: m.emissiveIntensity }));
const glowing = emissive.filter((m) => m.emissive !== 0 && m.k > 0).map((m) => m.name);
const termCold = !/emissive/i.test(MALPAIS_TERM) && !/emissive/i.test(MALPAIS_ROCK_COLOR);
row('MP1', null, `the materials: the ground's Malpais term and the rock write albedo, normal, roughness and AO only (${termCold ? 'no emissive in either' : 'EMISSIVE FOUND'}); the Yards' far and near ruins carry none; the glowing materials are ${glowing.join(', ')} (the wellheads' caps, #F2EAD3). The layers' albedo: tools/world/malpais-look.test.mjs (every texel <= linear 0.30). The night film of F56 (no terrain pixel brighter than the sky): UNMEASURED`, { emissive, termCold });

/* ======================================================================== MP11 */
const malp = REGIONS.find((r) => r.id === 'malpais');
const shipped = MALPAIS_FILES.reduce((s, f) => s + statSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../public', f)).size, 0);
const residentT = 2 * MALPAIS_LAYERS.ids.length * MALPAIS_LAYERS.size ** 2 * (4 / 3);
const cl = clinkerPlan(ground), pins = pinnaclePlan(ground);
const clastTris = clastGeometry().attributes.position.count / 3, pinTris = pinnacleGeometry(pins).attributes.position.count / 3, hornTris = hornitoGeometry(ground).attributes.position.count / 3;
const tris = Math.round(cl.n * clastTris + pinTris + hornTris + geo.attributes.position.count / 3 + nearB.counts.triangles);
const vbytes = cl.n * 64 + (pinTris + hornTris) * 3 * 24 + nearB.mesh.geometry.attributes.position.count * 56;
const zoneBytes = Math.ceil((512 - 40) / 2.5) * Math.ceil((448 + 376) / 2.5) * 4;
row('MP11', shipped <= 14e6 && residentT + zoneBytes + vbytes <= 16 * 2 ** 20, `shipped ${r2(shipped / 1e6)} MB in ${MALPAIS_FILES.length} files (${MALPAIS_FILES.join(', ')}; line 14 MB), fetched on approach('malpais') and in Tier 0's region set, so 0 Malpais bytes in the first load; resident about ${r2((residentT + zoneBytes + vbytes) / 2 ** 20)} MiB (the layers ${r2(residentT / 2 ** 20)} MiB at 8 bits a texel with mips, the zone map ${r2(zoneBytes / 2 ** 20)} MiB, vertex and instance arrays about ${r2(vbytes / 2 ** 20)} MiB; line 16 MiB). Built on approach, never at boot: ${cl.n} clasts (${clastTris} triangles each), ${pins.length} pinnacles, the hornitos, the tube's blockout and the Yards' near form (${nearB.counts.triangles} triangles): ${tris} triangles in all`, { shipped, residentT, zoneBytes, vbytes, tris, clasts: cl.n, pinnacles: pins.length });
nearB.dispose(); farB.dispose();

/* ======================================================================== the change against a base tree */
const BASE = flag('--base');
if (BASE) {
  const base = await import(pathToFileURL(path.resolve(BASE, 'src/world/island/recipe.js')).href);
  base.ensureMacro();
  let moved = 0, outside = 0, cut = 0, fill = 0, nodes = 0;
  let bb = [Infinity, -Infinity, Infinity, -Infinity];
  const F = M.FOOTPRINT;
  for (let iz = 0; iz < side; iz++) for (let ix = 0; ix < side; ix++) {
    const x = ix * step - half, z = iz * step - half;
    const a = base.heightAt(x, z), b = node(ix, iz); nodes++;
    if (a !== b) {
      moved++; cut = Math.max(cut, a - b); fill = Math.max(fill, b - a);
      const e = x, n = -z;
      bb = [Math.min(bb[0], e), Math.max(bb[1], e), Math.min(bb[2], n), Math.max(bb[3], n)];
      if (e < F.e0 || e > F.e1 || n < F.n0 || n > F.n1) outside++;
    }
  }
  say(`CHANGE against ${BASE}: ${moved} of ${nodes} bake nodes moved (cut up to ${r2(cut)} m, fill up to ${r2(fill)} m), inside E ${r1(bb[0])}..${r1(bb[1])}, N ${r1(bb[2])}..${r1(bb[3])}; ${outside} outside the footprint (E ${F.e0}..${F.e1}, N ${F.n0}..${F.n1}): ${verdict(outside === 0)}`);
  rec.change = { base: BASE, moved, nodes, cut: r2(cut), fill: r2(fill), box: bb.map(r1), outside };
}
rec.footprint = M.FOOTPRINT;
if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(rec, null, 1));
