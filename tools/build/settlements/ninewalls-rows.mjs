/**
 * NINEWALLS' ROW 0 AND THE WALL DATA ROWS, in Node (M2 wave 1, area B; no Chrome, no three).
 *
 *   node tools/build/settlements/ninewalls-rows.mjs [--json <out.json>] [--natural]
 *
 * NW0, the geometry check (M2 briefs §5), RESTATED TO THE TERRACES (the orchestrator's ruling 4 after the wave 1
 * blockout: "Ninewalls stands on terraces, each crescent wall a riser; NW0's pad clause is restated to the terraces"):
 * measured on the island recipe as it stands (src/world/island/recipe.js heightAt, which carries Ninewalls' own ground,
 * src/world/settlements/ninewalls-ground.js; `--natural` measures the hillside before it, as the blockout stood):
 *   (a) the fight: between the outer three walls a 6.5 x 3.6 m Screed stands and charges 25 m: the longest straight
 *       run of its 3.6 m body (plus 0.5 m clear each side) inside each annulus and inside both walls' spans, cross-
 *       checked with the seam's own segmentHitsWall; the ground's grade along and across that run; the radial run
 *       outside wall-1 (where the Screed comes in) and its grade
 *   (b) roofs below wall-top: each dwelling's roof against its own wall height (relative) and against the innermost
 *       wall's top at the nearest point of its arc (absolute)
 *   (c) the nine countable from the Rise: F34's lens (tools/frames/stagings/settlements.mjs), each wall's stations
 *       projected to the 1600 x 900 frame and ray-tested against the ground, the other walls, the dwellings and the
 *       tree; a wall counts when at least a fifth of its stations in frame show 4 px or more of face
 *   plus the site: the Scar's berm clear of every wall, B1 and the Rise outside the outer wall, the trig rays from T2
 *   clear of every wall, the walk in (the open south-west).
 * NW3: every wall's colliders, occluder pieces and (M2 wave 2) the kit's mesh cover its arc to within 0.1 m, the occluder
 * list holds all nine.
 * NW4 (its Node half): from the road's end in the village, every place reachable on foot on a 0.5 m walk grid as the game's
 * (src/core/nav.js WALK, over the ground at the bake's 1.94 m nodes as terrain.getHeight reads it: a cell steeper than 0.75 shut, every collider of the village standing 0.25-1.9 m over the ground
 * grown by 0.32 m): the tube mouth, the cistern, its Brazier, the counter, the third wall's niche; no two adjacent
 * rooflines equal (NW0 (b)).
 */
import { writeFileSync } from 'node:fs';
import { heightAt } from '../../../src/world/island/recipe.js';
import { SCAR, TRIG, TRIG_TOP, siteById } from '../../../src/world/island/sites.js';
import { BENCHMARKS } from '../../../src/world/sites/layout.js';
import { B1 as HOLDS_B1 } from '../../../src/world/holds/blockout.js';
import { ISLAND_SCALE } from '../../../src/world/island/extent.js';
import { GRID } from '../../../src/world/island/bake.js';
import { ninewallsNatural, ninewallsGroundTables, wallFaces, bankOf } from '../../../src/world/settlements/ninewalls-ground.js';
import { wallsGeometry, townGeometry } from '../../../src/world/settlements/ninewalls-kit.js';
import { segmentHit } from '../../../src/instruments/lib/sight.js';
import {
  WALLS, OUTER_R, CENTRE, DWELLINGS, PLACES, SCAR_CLEAR, polar, bearingOf, dirOf, inSpan, stations, wallBoxes,
  segmentHitsWall, wallOccluders, dwellingPlace, scarDistance, rooflineCheck, ninewallsColliders, topOf, wallSides, ROAD, TERRACE,
} from '../../../src/world/settlements/ninewalls-layout.js';
import { FRAMES } from '../../../tools/frames/stagings/settlements.mjs';

const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const NATURAL = args.includes('--natural');
const D2R = Math.PI / 180;
const r2 = (x) => Math.round(x * 100) / 100, r1 = (x) => Math.round(x * 10) / 10;
heightAt(0, 0);   // the recipe's grids and Ninewalls' tables
/** The ground: the recipe as built (the terraces, pads and road on it), or (--natural) the hillside before them. */
const ground = NATURAL ? (x, z) => ninewallsNatural(x, z) : (x, z) => heightAt(x, z);

const SCREED = { L: 6.5, W: 3.6, charge: 25, clear: 0.5 };
const out = { ground: NATURAL ? 'the hillside before Ninewalls\' ground (ninewallsNatural)' : 'island recipe heightAt (with the terraces, pads and road)', walls: [], nw0: {}, nw3: {} };

/* ---------------------------------------------------------------- the walls */
for (const w of WALLS) {
  const st = stations(w, 1);
  const g = st.map((s) => ground(s.x, s.z));
  out.walls.push({ id: w.id, r: w.r, from: w.from, to: w.to, length: r1((w.to - w.from) * D2R * w.r), h: w.h, painted: w.painted0,
    footMin: r1(Math.min(...g)), footMax: r1(Math.max(...g)), scarMin: r1(Math.min(...st.map((s) => scarDistance(s.x, s.z)))) });
}

/* ---------------------------------------------------------------- (a) the fight annuli */
/** Every placement of the body's run inside the annulus (inner, outer), one per 1 deg of bearing: the longest at it. */
function chords(inner, outer) {
  // the body's rectangle: its inner long edge on a chord at distance p from the centre, perpendicular to bearing beta
  const pIn = inner.r + inner.t / 2 + SCREED.clear, rOutMax = outer.r - outer.t / 2 - SCREED.clear, list = [];
  for (let beta = Math.ceil(Math.max(inner.from, outer.from)); beta <= Math.min(inner.to, outer.to); beta += 1) {
    let best = null;
    for (let p = pIn; p + SCREED.W <= rOutMax; p += 0.1) {
      const half = Math.sqrt(Math.max(0, rOutMax * rOutMax - (p + SCREED.W) ** 2));
      // the run's two ends must stay inside both arcs' spans (the bearings of its four corners)
      let L = 2 * half;
      const fits = (LL) => [-1, 1].every((sg) => [p, p + SCREED.W].every((q) => {
        const b = beta + sg * Math.atan2(LL / 2, q) / D2R;
        return inSpan(inner, b) && inSpan(outer, b);
      }));
      while (L > 0 && !fits(L)) L -= 0.25;
      if (!best || L > best.L) best = { L, beta, p };
    }
    if (best && best.L > 0) list.push(measureChord(best));
  }
  return list;
}
/** A placement's 25 m charge from one end, cross-checked with the seam's segmentHitsWall; its ground along and across. */
function measureChord(best) {
  const d = dirOf(best.beta), t = dirOf(best.beta + 90), q = best.p + SCREED.W / 2;
  const mid = { x: CENTRE.x + d.x * q, z: CENTRE.z + d.z * q };
  const run = Math.min(SCREED.charge, best.L - SCREED.L);
  const a = { x: mid.x - t.x * (best.L / 2 - SCREED.L / 2), z: mid.z - t.z * (best.L / 2 - SCREED.L / 2) };
  const b = { x: a.x + t.x * run, z: a.z + t.z * run };
  const hit = segmentHitsWall(a.x, a.z, b.x, b.z, SCREED.W / 2, { includeCut: true });
  const ga = ground(a.x, a.z), gb = ground(b.x, b.z);
  const side = { x: mid.x + d.x * 2, z: mid.z + d.z * 2 }, side0 = { x: mid.x - d.x * 2, z: mid.z - d.z * 2 };
  return { L: r1(best.L), beta: r1(best.beta), chordFromCentre: r1(best.p), run: r1(run), runClear: !hit, hit,
    gradeAlongDeg: r1(Math.atan2(Math.abs(gb - ga), run) / D2R), gradeAcrossDeg: r1(Math.atan2(Math.abs(ground(side.x, side.z) - ground(side0.x, side0.z)), 4) / D2R) };
}
const need = SCREED.charge + SCREED.L;
/** The steepest ground a charge may run on (deg): a starting value*, the Screed's own bar is area C's (IN0). */
const MAX_CHARGE_GRADE = 8;
const ann = [[WALLS[1], WALLS[0]], [WALLS[2], WALLS[1]]].map(([inn, outr]) => {
  const all = chords(inn, outr), ok = all.filter((c) => c.L >= need && c.runClear);
  const longest = all.slice().sort((p, q) => q.L - p.L)[0] || { L: 0 };
  const flattest = ok.slice().sort((p, q) => p.gradeAlongDeg - q.gradeAlongDeg)[0] || null;
  const level = ok.filter((c) => c.gradeAlongDeg <= MAX_CHARGE_GRADE && c.gradeAcrossDeg <= MAX_CHARGE_GRADE);
  return { between: `${outr.id}..${inn.id}`, clearGap: r2(outr.r - inn.r - (outr.t + inn.t) / 2), need, longest, flattest,
    fitBearings: ok.length, levelBearings: level.length, levelSpan: level.length ? [level[0].beta, level[level.length - 1].beta] : null,
    fits: ok.length > 0, pass: level.length > 0 };
});
// the run in from outside wall-1 along its back (bearing 45): free ground for the charge, and its grade
const inR = OUTER_R + SCREED.W / 2 + SCREED.clear, inA = polar(45, inR + need), inB = polar(45, inR);
const hitIn = segmentHitsWall(inA.x, inA.z, inB.x, inB.z, SCREED.W / 2, { includeCut: true });
const radial = { from: r1(inR + need), to: r1(inR), clear: !hitIn,
  gradeDeg: r1(Math.atan2(ground(inA.x, inA.z) - ground(inB.x, inB.z), need) / D2R), groundOut: r1(ground(inA.x, inA.z)), groundIn: r1(ground(inB.x, inB.z)) };
out.nw0.a = { screed: SCREED, maxChargeGradeDeg: MAX_CHARGE_GRADE, annuli: ann, radialIn: radial,
  fits: ann.every((x) => x.fits), pass: ann.every((x) => x.pass) };
// the run in (the hillside outside wall-1, outside any pad) is reported, not graded: the Screed's approach is area C's (IN0)

/* ---------------------------------------------------------------- the ground under the village */
{
  const sl = [];
  for (let x = CENTRE.x - OUTER_R; x <= CENTRE.x + OUTER_R; x += 2) for (let z = CENTRE.z - OUTER_R; z <= CENTRE.z + OUTER_R; z += 2) {
    if (Math.hypot(x - CENTRE.x, z - CENTRE.z) > OUTER_R) continue;
    const gx = (ground(x + 1, z) - ground(x - 1, z)) / 2, gz = (ground(x, z + 1) - ground(x, z - 1)) / 2;
    sl.push(Math.atan(Math.hypot(gx, gz)) / D2R);
  }
  sl.sort((a, b) => a - b);
  const core = [];
  for (const d of DWELLINGS) { const p = dwellingPlace(d); const gx = (ground(p.x + 1, p.z) - ground(p.x - 1, p.z)) / 2, gz = (ground(p.x, p.z + 1) - ground(p.x, p.z - 1)) / 2; core.push(Math.atan(Math.hypot(gx, gz)) / D2R); }
  out.nw0.slope = { overDisc: { median: r1(sl[sl.length >> 1]), p90: r1(sl[Math.floor(sl.length * 0.9)]), max: r1(sl[sl.length - 1]),
    over20: r2(sl.filter((v) => v > 20).length / sl.length), over28: r2(sl.filter((v) => v > 28).length / sl.length) },
    underDwellings: { median: r1(core.sort((a, b) => a - b)[core.length >> 1]), max: r1(Math.max(...core)) } };
}

/* ---------------------------------------------------------------- (b) roofs below wall-top */
const inner = WALLS[WALLS.length - 1];
const roofs = DWELLINGS.map((d) => {
  const p = dwellingPlace(d), gy = ground(p.x, p.z), roof = gy + d.h;
  // the nearest point of the innermost wall's arc
  const b = bearingOf(p.x, p.z), bb = inSpan(inner, b) ? b : (Math.abs(((b - inner.to + 540) % 360) - 180) < Math.abs(((b - inner.from + 540) % 360) - 180) ? inner.to : inner.from);
  const q = polar(bb, inner.r), wallTop = wallSides(inner, ground, { ...q, b: bb }).hi + inner.h;
  return { id: d.id, roofAbove: d.h, roofY: r2(roof), innerWallTopY: r2(wallTop), relative: d.h < inner.h, absolute: roof < wallTop };
});
out.nw0.b = { roofs, relative: roofs.filter((r) => r.relative).length, absolute: roofs.filter((r) => r.absolute).length,
  both: roofs.filter((r) => r.relative && r.absolute).length, bar: 12, rooflinesEqual: rooflineCheck() };
out.nw0.b.pass = out.nw0.b.both >= 12 && !out.nw0.b.rooflinesEqual.length;

/* ---------------------------------------------------------------- (c) countable from the Rise (F34's lens) */
const F34 = FRAMES.find((f) => f.id === 'F34');
const VW = 1600, VH = 900;
function lensOf(f) {
  const c = f.camera, at = { x: f.at.en[0], z: -f.at.en[1] };
  const pos = { x: at.x, y: ground(at.x, at.z) + c.eye, z: at.z };
  const fw = dirOf(f.bearing), pit = (c.pitch || 0) * D2R;
  const F = { x: fw.x * Math.cos(pit), y: Math.sin(pit), z: fw.z * Math.cos(pit) };
  const R = { x: -fw.z, y: 0, z: fw.x }; // right hand: (fw x up) in this frame
  const rl = Math.hypot(R.x, R.z); R.x /= rl; R.z /= rl;
  const U = { x: R.y * F.z - R.z * F.y, y: R.z * F.x - R.x * F.z, z: R.x * F.y - R.y * F.x };
  if (U.y < 0) { U.x = -U.x; U.y = -U.y; U.z = -U.z; }
  const fy = 1 / Math.tan((c.fov / 2) * D2R), aspect = VW / VH;
  return { pos, F, R, U, project(x, y, z) {
    const vx = x - pos.x, vy = y - pos.y, vz = z - pos.z;
    const zc = vx * F.x + vy * F.y + vz * F.z;
    if (zc <= 0.1) return null;
    const xc = vx * R.x + vy * R.y + vz * R.z, yc = vx * U.x + vy * U.y + vz * U.z;
    return { px: VW / 2 + (xc / zc) * fy / aspect * VW / 2, py: VH / 2 - (yc / zc) * fy * VH / 2, depth: zc };
  } };
}
const lens = lensOf(F34);
const boxShapes = WALLS.map((w) => wallBoxes(w, ground).map((s) => ({ type: 'box', cx: s.x, cy: (s.y0 + s.y1) / 2, cz: s.z, hx: s.len / 2, hy: (s.y1 - s.y0) / 2, hz: w.t / 2, yaw: s.ry })));
const houseShapes = DWELLINGS.map((d) => { const p = dwellingPlace(d), g = ground(p.x, p.z); return { type: 'box', cx: p.x, cy: g + (d.h - d.sink) / 2, cz: p.z, hx: d.w / 2, hy: (d.h + d.sink) / 2, hz: d.d / 2, yaw: p.ry }; });
const T = PLACES.tree, gT = ground(T.x, T.z);
const treeShapes = [{ type: 'cyl', cx: T.x, cz: T.z, r: T.trunkR, y0: gT, y1: gT + T.crown }, { type: 'cyl', cx: T.x, cz: T.z, r: T.canopyR, y0: gT + T.crown, y1: gT + T.top }];
function terrainBlocks(a, b) {
  const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), n = Math.ceil(L / 0.5);
  for (let i = 1; i < n - 1; i++) {
    const t = i / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
    if (ground(x, z) > y + 0.02) return true;
  }
  return false;
}
function visible(x, y, z, skipWall) {
  const a = lens.pos;
  if (terrainBlocks(a, { x, y, z })) return false;
  // stop the ray 0.6 m short of the point so the wall's own segment is not the blocker
  const L = Math.hypot(x - a.x, y - a.y, z - a.z), k = Math.max(0, (L - 0.6) / L);
  const bx = a.x + (x - a.x) * k, by = a.y + (y - a.y) * k, bz = a.z + (z - a.z) * k;
  for (let i = 0; i < boxShapes.length; i++) {
    for (const s of boxShapes[i]) {
      if (i === skipWall && Math.hypot(s.cx - x, s.cz - z) < 2) continue;
      if (segmentHit(s, a.x, a.y, a.z, bx, by, bz) >= 0) return false;
    }
  }
  for (const s of [...houseShapes, ...treeShapes]) if (segmentHit(s, a.x, a.y, a.z, bx, by, bz) >= 0) return false;
  return true;
}
const count = WALLS.map((w, wi) => {
  const top = topOf(w, 'whole');
  let inFrame = 0, shown = 0;
  const pxs = [];
  for (const s of stations(w, 0.75)) {
    // the face toward the lens: the centreline offset by half the thickness toward it
    const d = dirOf(s.b), toward = (lens.pos.x - s.x) * d.x + (lens.pos.z - s.z) * d.z > 0 ? 1 : -1;
    const fx = s.x + d.x * toward * (w.t / 2 + 0.01), fz = s.z + d.z * toward * (w.t / 2 + 0.01);
    const g = ground(s.x, s.z), yTop = g + top;
    const pt = lens.project(fx, yTop, fz);
    if (!pt || pt.px < 0 || pt.px > VW || pt.py < 0 || pt.py > VH) continue;
    inFrame++;
    let lowest = null;
    for (let k = 0; k <= 8; k++) {
      const y = yTop - (top * k) / 8;
      if (y < ground(fx, fz)) break;
      if (visible(fx, y, fz, wi)) lowest = y; else if (lowest != null) break;
    }
    if (lowest == null) continue;
    const top2 = (() => { for (let k = 0; k <= 8; k++) { const y = yTop - (top * k) / 8; if (visible(fx, y, fz, wi)) return y; } return lowest; })();
    const pa = lens.project(fx, top2, fz), pb = lens.project(fx, lowest, fz);
    const px = pa && pb ? Math.abs(pb.py - pa.py) : 0;
    pxs.push(px);
    if (px >= 4) shown++;
  }
  pxs.sort((a, b) => a - b);
  const share = inFrame ? shown / inFrame : 0;
  return { id: w.id, inFrame, shown, share: r2(share), facePxMedian: pxs.length ? r1(pxs[pxs.length >> 1]) : 0, countable: share >= 0.2 };
});
const roofsSeen = DWELLINGS.filter((d) => { const p = dwellingPlace(d), g = ground(p.x, p.z), pt = lens.project(p.x, g + d.h + 0.05, p.z);
  return pt && pt.px >= 0 && pt.px <= VW && pt.py >= 0 && pt.py <= VH && visible(p.x, g + d.h + 0.05, p.z, -1); }).length;
out.nw0.c = { lens: { at: F34.at.en, eye: F34.camera.eye, y: r1(lens.pos.y), bearing: F34.bearing, pitch: F34.camera.pitch, fov: F34.camera.fov,
  toCentre: r1(Math.hypot(lens.pos.x - CENTRE.x, lens.pos.z - CENTRE.z)) }, walls: count, countable: count.filter((c) => c.countable).length, roofsSeen,
  pass: count.every((c) => c.countable) };

/* ---------------------------------------------------------------- (d) the terraces */
{
  const G = ninewallsGroundTables();
  const rings = [];
  for (let j = 0; j < WALLS.length - 1; j++) {
    const outer = WALLS[j], inner = WALLS[j + 1];
    // the level part of the ring at each bearing: clear of the ledge and bank of whichever wall's low side is in it
    let worst = 0, n = 0, along = [], narrow = Infinity;
    let ra = inner.r + inner.t / 2, rb = outer.r - outer.t / 2;
    for (let b = 0; b < 360; b += 1) {
      const W = Math.min(G.w[j][b], G.w[j + 1][b]);
      if (W < 0.999) continue;
      const fi = wallFaces(j + 1, b), fo = wallFaces(j, b);
      ra = inner.r + inner.t / 2 + (fi.outer < fi.inner ? TERRACE.ledge + bankOf(fi.inner - fi.outer) : 0) + 0.15;
      rb = outer.r - outer.t / 2 - (fo.inner < fo.outer ? TERRACE.ledge + bankOf(fo.outer - fo.inner) : 0) - 0.15;
      narrow = Math.min(narrow, rb - ra);
      if (rb - ra < 0.3) continue;
      const rr = [ra, (ra + rb) / 2, rb];
      const hs = rr.map((r) => { const p = polar(b, r); return ground(p.x, p.z); });
      const fall = Math.atan2(Math.max(...hs) - Math.min(...hs), rb - ra) / D2R;
      worst = Math.max(worst, fall); n++;
      const rm = (ra + rb) / 2, p0 = polar(b, rm), p1 = polar(b + 1, rm);
      if (Math.min(G.w[j][(b + 1) % 360], G.w[j + 1][(b + 1) % 360]) >= 0.999) along.push(Math.abs(Math.atan2(ground(p1.x, p1.z) - ground(p0.x, p0.z), rm * D2R) / D2R));
    }
    along.sort((a, b) => a - b);
    rings.push({ ring: `${outer.id}..${inner.id}`, levelledBearings: n, levelWidthMin: r2(narrow), crossFallMaxDeg: r1(worst), alongMedianDeg: along.length ? r1(along[along.length >> 1]) : null, alongMaxDeg: along.length ? r1(along.at(-1)) : null });
  }
  const risers = WALLS.map((w, k) => {
    const hs = [];
    for (let b = 0; b < 360; b += 2) { if (G.w[k][b] < 0.999) continue; const f = wallFaces(k, b); hs.push(Math.abs(f.outer - f.inner)); }
    hs.sort((a, b) => a - b);
    return { id: w.id, median: hs.length ? r2(hs[hs.length >> 1]) : 0, max: hs.length ? r2(hs.at(-1)) : 0 };
  });
  // cut and fill against the hillside, over the village's disc (2 m grid)
  let cut = 0, fill = 0, cutMax = 0, fillMax = 0, cells = 0;
  for (let x = CENTRE.x - OUTER_R - 4; x <= CENTRE.x + OUTER_R + 4; x += 2) for (let z = CENTRE.z - OUTER_R - 4; z <= CENTRE.z + OUTER_R + 4; z += 2) {
    if (Math.hypot(x - CENTRE.x, z - CENTRE.z) > OUTER_R + 4) continue;
    const d = heightAt(x, z) - ninewallsNatural(x, z);
    if (d < 0) { cut -= d * 4; cutMax = Math.max(cutMax, -d); } else { fill += d * 4; fillMax = Math.max(fillMax, d); }
    cells++;
  }
  const BAR_CROSS = 2;
  out.nw0.d = { rings, risers, cutM3: Math.round(cut), fillM3: Math.round(fill), cutMax: r2(cutMax), fillMax: r2(fillMax), crossFallBarDeg: BAR_CROSS,
    pass: !NATURAL && rings.every((q) => q.levelledBearings > 0 && q.crossFallMaxDeg <= BAR_CROSS) };
}

/* ---------------------------------------------------------------- (e) the walk in */
{
  let L = 0, gradeMax = 0, crossMax = 0, crossTurn = 0, devMax = 0;
  const seg = [];
  // cumulative arc length at each point, to tell a hairpin's inside (another part of the road within reach, far along it)
  const AL = [0]; for (let i = 1; i < ROAD.length; i++) AL.push(AL[i - 1] + Math.hypot(ROAD[i][0] - ROAD[i - 1][0], ROAD[i][1] - ROAD[i - 1][1]));
  const nearTurn = (x, z, s0) => ROAD.some((q, i) => Math.abs(AL[i] - s0) > 6 && Math.hypot(q[0] - x, q[1] - z) < 2 * TERRACE.roadHalf + 3);
  for (let i = 0; i + 1 < ROAD.length; i++) {
    const a = ROAD[i], c = ROAD[i + 1], l = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.max(1, Math.ceil(l));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const x0 = a[0] + (c[0] - a[0]) * t0, z0 = a[1] + (c[1] - a[1]) * t0, x1 = a[0] + (c[0] - a[0]) * t1, z1 = a[1] + (c[1] - a[1]) * t1;
      const g0 = ground(x0, z0), g1 = ground(x1, z1), dl = l / n;
      const gr = Math.atan2(g1 - g0, dl) / D2R;
      gradeMax = Math.max(gradeMax, Math.abs(gr));
      // across: 1.5 m either side of the centreline
      const ux = (c[0] - a[0]) / l, uz = (c[1] - a[1]) / l;
      const gl = ground(x0 - uz * 1.5, z0 + ux * 1.5), grr = ground(x0 + uz * 1.5, z0 - ux * 1.5);
      const cf = Math.atan2(Math.abs(gl - grr), 3) / D2R;
      if (nearTurn(x0, z0, AL[i] + l * t0)) crossTurn = Math.max(crossTurn, cf); else crossMax = Math.max(crossMax, cf);
      devMax = Math.max(devMax, Math.abs(ninewallsNatural(x0, z0) - (a[2] + (c[2] - a[2]) * t0)));
      seg.push({ dl, gr });
      L += dl;
    }
  }
  // her sprint (player.js: 6.75 m/s on the flat, A3) scaled by _gradeScale's uphill law, surface normal from the grade
  const SPRINT = 6.75;
  const pace = (grDeg) => { const g = Math.sin(Math.abs(grDeg) * D2R), flat = Math.max(0.35, Math.cos(grDeg * D2R)); return SPRINT * flat * (grDeg > 0 ? Math.min(1, Math.max(0.26, 1 - g * 1.45)) : Math.min(1.14, 1 + g * 0.22)); };
  let tRoad = 0; for (const q of seg) tRoad += q.dl / pace(q.gr);
  // leg 2's fixture (first-hour-fixtures.mjs sliceEnd: Brea at the cistern's rest, 262.6, 217.6) to the road's foot on the flat
  const FIX = { x: -262.647, z: 217.625 }, foot = ROAD[0], end = ROAD.at(-1);
  const dFlat = Math.hypot(foot[0] - FIX.x, foot[1] - FIX.z), tFlat = dFlat / SPRINT;
  const endR = Math.hypot(end[0] - CENTRE.x, end[1] - CENTRE.z);
  // the straight climb the blockout's run took (the fall line of the west face), at the same law
  let tDirect = 0, dDirect = 0;
  { const a = { x: -111.6, z: 214.8 }, b = { x: CENTRE.x - 30, z: CENTRE.z }, n = 60;
    for (let k = 0; k < n; k++) { const x0 = a.x + (b.x - a.x) * k / n, z0 = a.z + (b.z - a.z) * k / n, x1 = a.x + (b.x - a.x) * (k + 1) / n, z1 = a.z + (b.z - a.z) * (k + 1) / n, dl = Math.hypot(x1 - x0, z1 - z0);
      tDirect += dl / pace(Math.atan2(ground(x1, z1) - ground(x0, z0), dl) / D2R); dDirect += dl; } }
  out.nw0.e = { road: { points: ROAD.length, length: r1(L), gradeMaxDeg: r1(gradeMax), crossFallMaxDeg: r1(crossMax), crossFallHairpinsDeg: r1(crossTurn), offNaturalMax: r2(devMax), endToCentre: r1(endR) },
    walk: { fromFixtureFlat: r1(dFlat), seconds: r1(tFlat + tRoad), flatS: r1(tFlat), roadS: r1(tRoad), directClimb: { m: r1(dDirect), s: r1(tDirect) } },
    pass: !NATURAL && gradeMax <= 15 && crossMax <= 8 && endR <= 30 && tFlat + tRoad <= 120 };
}

/* ---------------------------------------------------------------- the site */
const bm1 = BENCHMARKS.find((b) => b.id === 'bm-01');
const B1 = { x: bm1.x, z: bm1.z };
const B1h = { x: HOLDS_B1.e * ISLAND_SCALE, z: -HOLDS_B1.n * ISLAND_SCALE };
const t2 = TRIG.find((t) => t.id === 'T2');
const rise = { toCentre: r1(Math.hypot(t2.x - CENTRE.x, t2.z - CENTRE.z)), outside: Math.hypot(t2.x - CENTRE.x, t2.z - CENTRE.z) > OUTER_R + 5, groundT2: r1(ground(t2.x, t2.z)) };
const trigRays = [['T1', 'T2'], ['T2', 'T3'], ['T2', 'T6']].map(([p, q]) => {
  const A = TRIG.find((t) => t.id === p), B = TRIG.find((t) => t.id === q);
  const a = { x: A.x, y: ground(A.x, A.z) + TRIG_TOP, z: A.z }, b = { x: B.x, y: ground(B.x, B.z) + TRIG_TOP, z: B.z };
  const hits = boxShapes.flat().filter((s) => segmentHit(s, a.x, a.y, a.z, b.x, b.y, b.z) >= 0).length;
  return { pair: `${p}-${q}`, wallHits: hits };
});
const scar = { clear: SCAR_CLEAR, minWall: Math.min(...out.walls.map((w) => w.scarMin)), pass: out.walls.every((w) => w.scarMin >= SCAR_CLEAR) };
out.site = {
  centreGround: r1(ground(CENTRE.x, CENTRE.z)), statedH: CENTRE.h, outerR: OUTER_R, rise, scar, trigRays,
  b1: { layout: B1, holds: B1h, agree: Math.hypot(B1.x - B1h.x, B1.z - B1h.z) < 0.05, bible: Math.hypot(B1.x - 12, B1.z - 282) < 0.05,
    toCentre: r1(Math.hypot(B1.x - CENTRE.x, B1.z - CENTRE.z)), toNearestWall: r1(Math.min(...WALLS.flatMap((w) => stations(w, 1).map((p) => Math.hypot(p.x - B1.x, p.z - B1.z) - w.t / 2)))), scarDist: r1(scarDistance(B1.x, B1.z)),
    groundMoved: r2(heightAt(B1.x, B1.z) - ninewallsNatural(B1.x, B1.z)) },
  openSide: { from: Math.max(...WALLS.map((w) => w.to)), to: 360 + Math.min(...WALLS.map((w) => w.from)) },
  groundRing: [10, 26, 47, 67].map((r) => ({ r, ...Object.fromEntries([0, 45, 90, 135, 180, 225, 270, 315].map((b) => { const p = polar(b, r); return [b, r1(ground(p.x, p.z))]; })) })),
};

/* ---------------------------------------------------------------- NW3, the data half */
const cols = ninewallsColliders(ground);
const occ = wallOccluders(ground);
const nw3 = WALLS.map((w) => {
  const boxes = cols.filter((c) => c.wall === w.id);
  const pieces = occ.filter((o) => o.id === w.id);
  let worstCol = 0, worstOcc = 0;
  for (const s of stations(w, 0.5)) {
    // the centreline point must sit inside some collider box (distance to the nearest box's footprint)
    let dmin = Infinity;
    for (const c of boxes) {
      const [cx, , cz] = c.shape.c, [hx, , hz] = c.shape.half, yaw = c.shape.yaw;
      const ox = s.x - cx, oz = s.z - cz, cy = Math.cos(-yaw), sy = Math.sin(-yaw);
      // collision's yaw box: three's rotation.y = -yaw, local +x along the wall
      const lx = ox * cy - oz * sy, lz = ox * sy + oz * cy;
      const ex = Math.max(0, Math.abs(lx) - hx), ez = Math.max(0, Math.abs(lz) - hz);
      dmin = Math.min(dmin, Math.hypot(ex, ez));
    }
    worstCol = Math.max(worstCol, dmin);
    const a = Math.PI - s.b * D2R;
    let inPiece = Infinity;
    for (const o of pieces) {
      const sh = o.shape;
      let x = a - sh.a0; x -= Math.floor(x / (2 * Math.PI)) * 2 * Math.PI;
      const span = sh.a1 - sh.a0;
      const da = x <= span + 1e-9 ? 0 : Math.min(x - span, 2 * Math.PI - x);
      inPiece = Math.min(inPiece, da * w.r);
    }
    worstOcc = Math.max(worstOcc, inPiece);
  }
  return { id: w.id, colliders: boxes.length, worstColliderGap: r2(worstCol), occluderPieces: pieces.length, worstOccluderGap: r2(worstOcc) };
});
// NW3's mesh half (M2 wave 2): the kit's wall mesh, built here on the recipe's ground as the game builds it on the drawn
// one; each wall's faces and coping (its vertices within t/2 + 0.1 of its arc) centred on its arc within 0.1 m
const wallSoup = wallsGeometry(ground, (id) => ({ state: 'whole', painted: WALLS.find((w) => w.id === id).painted0 }));
const town = townGeometry(ground, (x, z) => ninewallsNatural(x, z));
{
  const P = wallSoup.p;
  for (const row of nw3) {
    const w = WALLS.find((q) => q.id === row.id);
    let lo = Infinity, hi = -Infinity, n = 0, worstArc = 0;
    const byB = new Map();
    for (let i = 0; i < P.length; i += 3) {
      const rr = Math.hypot(P[i] - CENTRE.x, P[i + 2] - CENTRE.z);
      if (Math.abs(rr - w.r) > w.t / 2 + 0.1) continue;
      const b = Math.round(bearingOf(P[i], P[i + 2]));
      if (!inSpan(w, b, 0.5)) continue;
      const q = byB.get(b) || { lo: Infinity, hi: -Infinity }; q.lo = Math.min(q.lo, rr); q.hi = Math.max(q.hi, rr); byB.set(b, q); n++;
    }
    for (const q of byB.values()) if (q.hi - q.lo > w.t * 0.8) worstArc = Math.max(worstArc, Math.abs((q.lo + q.hi) / 2 - w.r));
    row.meshVerts = n; row.meshArcGap = r2(worstArc);
  }
}
out.kit = { wallTris: wallSoup.tris, townTris: town.soup.tris, draws: 2, rosettes: town.tips, kerbStones: town.kerb,
  budget: { tris: 110000, draws: 73, from: 'tools/perf/attrib-page.mjs standIns: 16 dwellings x 6000 tris x 4 draws + 9 walls x 1600 x 1' } };
out.nw3 = { walls: nw3, occluderWalls: new Set(occ.map((o) => o.id)).size, occluderPieces: occ.length, colliders: cols.length,
  pass: nw3.every((w) => w.worstColliderGap <= 0.1 && w.worstOccluderGap <= 0.1 && w.meshArcGap <= 0.1 && w.meshVerts > 0) && new Set(occ.map((o) => o.id)).size === 9 };


/* ---------------------------------------------------------------- NW4 (Node half): the places on foot */
{
  const CELL = 0.5, RAD = 0.32, HALF = 80, N = Math.round((2 * HALF) / CELL) + 1, X0 = CENTRE.x - HALF, Z0 = CENTRE.z - HALF;
  // the ground as the game draws it and its walk grid reads it: the recipe at the bake's 1.94 m nodes, bilinear between
  // (src/world/terrain.js getHeight; the recipe's ridged relief has creases sharper than any grid the game keeps)
  const GS = GRID.step, GH = GRID.half, nodes = new Map();
  const node = (ix, iz) => { const k = ix * 100003 + iz; let v = nodes.get(k); if (v === undefined) { v = ground(ix * GS - GH, iz * GS - GH); nodes.set(k, v); } return v; };
  const baked = (x, z) => { const fx = (x + GH) / GS, fz = (z + GH) / GS, ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const a = node(ix, iz) + (node(ix + 1, iz) - node(ix, iz)) * tx, b = node(ix, iz + 1) + (node(ix + 1, iz + 1) - node(ix, iz + 1)) * tx; return a + (b - a) * tz; };
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = baked(X0 + i * CELL, Z0 + j * CELL);
  const open = new Uint8Array(N * N);
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const h = H[j * N + i], gx = (H[j * N + i + 1] - h) / CELL, gz = (H[(j + 1) * N + i] - h) / CELL;
    open[j * N + i] = Math.hypot(gx, gz) <= 0.75 ? 1 : 0;
  }
  for (const c of cols) {
    const sh = c.shape;
    if (sh.type === 'box') {
      const [cx, cy, cz] = sh.c, [hx, hy, hz] = sh.half, yaw = sh.yaw || 0, co = Math.cos(-yaw), si = Math.sin(-yaw);
      const r = Math.hypot(hx, hz) + RAD;
      for (let j = Math.max(0, Math.floor((cz - r - Z0) / CELL)); j <= Math.min(N - 1, Math.ceil((cz + r - Z0) / CELL)); j++)
        for (let i = Math.max(0, Math.floor((cx - r - X0) / CELL)); i <= Math.min(N - 1, Math.ceil((cx + r - X0) / CELL)); i++) {
          const x = X0 + i * CELL, z = Z0 + j * CELL, ox = x - cx, oz = z - cz;
          const lx = ox * co - oz * si, lz = ox * si + oz * co;
          if (Math.abs(lx) > hx + RAD || Math.abs(lz) > hz + RAD) continue;
          const g = H[j * N + i];
          if (cy + hy < g + 0.25 || cy - hy > g + 1.9) continue;
          open[j * N + i] = 0;
        }
    } else if (sh.type === 'capsule') {
      const [ax, , az] = sh.a, r = sh.radius + RAD;
      for (let j = Math.max(0, Math.floor((az - r - Z0) / CELL)); j <= Math.min(N - 1, Math.ceil((az + r - Z0) / CELL)); j++)
        for (let i = Math.max(0, Math.floor((ax - r - X0) / CELL)); i <= Math.min(N - 1, Math.ceil((ax + r - X0) / CELL)); i++)
          if (Math.hypot(X0 + i * CELL - ax, Z0 + j * CELL - az) <= r) open[j * N + i] = 0;
    }
  }
  const idx = (x, z) => { const i = Math.round((x - X0) / CELL), j = Math.round((z - Z0) / CELL); return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i; };
  const nearestOpen = (x, z) => { let best = -1, bd = Infinity; for (let dj = -6; dj <= 6; dj++) for (let di = -6; di <= 6; di++) { const k = idx(x + di * CELL, z + dj * CELL); if (k >= 0 && open[k]) { const d = Math.hypot(di, dj); if (d < bd) { bd = d; best = k; } } } return best; };
  // from the village's own lane: the cistern's, 3 m past the road's end toward the cistern (the road is a bench cut into a
  // 30 deg hillside, its banks steeper than people walk, so the grid is entered where it runs out into the village)
  const end = ROAD.at(-1), cq = PLACES.cistern, dl = Math.hypot(cq.x - end[0], cq.z - end[1]);
  const s0 = nearestOpen(end[0] + (cq.x - end[0]) / dl * 3, end[1] + (cq.z - end[1]) / dl * 3);
  const dist = new Float64Array(N * N).fill(Infinity);
  // Dijkstra on 8 neighbours (a binary heap)
  const heap = [], push = (k, d) => { heap.push([d, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  if (s0 >= 0) { dist[s0] = 0; push(s0, 0); }
  const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
  while (heap.length) {
    const [d, k] = pop();
    if (d > dist[k]) continue;
    const i = k % N, j = (k / N) | 0;
    for (let q = 0; q < 8; q++) {
      const i2 = i + DI[q], j2 = j + DJ[q];
      if (i2 < 0 || j2 < 0 || i2 >= N || j2 >= N) continue;
      const k2 = j2 * N + i2;
      if (!open[k2]) continue;
      if (q >= 4 && (!open[j * N + i2] || !open[j2 * N + i])) continue;
      const nd = d + (q >= 4 ? Math.SQRT2 : 1) * CELL;
      if (nd < dist[k2]) { dist[k2] = nd; push(k2, nd); }
    }
  }
  const M = PLACES.tubeMouth, tg = dirOf(M.b + 180), Cq = PLACES.cistern, Kq = PLACES.counter, Bq = PLACES.brazier, Nq = PLACES.niche;
  const toward = (q, b, d) => { const v = dirOf(b); return { x: q.x + v.x * d, z: q.z + v.z * d }; };
  const targets = {
    tubeMouth: toward(M, M.b + 180, 2.4), cistern: toward(Cq, 218 + 180, Cq.r + 0.9), brazier: toward(Bq, 218, 1.2),
    counter: toward(Kq, Kq.b + 180, 1.3), niche: toward(Nq, Nq.b + 180, 0.9), tree: toward(PLACES.tree, 200, PLACES.tree.trunkR + 1.4),
  };
  const reach = Object.fromEntries(Object.entries(targets).map(([k, p]) => { const t = nearestOpen(p.x, p.z); return [k, { walkM: t >= 0 && Number.isFinite(dist[t]) ? r1(dist[t]) : null, snapM: t >= 0 ? r2(Math.hypot(X0 + (t % N) * CELL - p.x, Z0 + ((t / N) | 0) * CELL - p.z)) : null }]; }));
  out.nw4 = { from: 'the cistern\'s lane at the road\'s end', reach, rooflinesEqual: rooflineCheck().length, pass: Object.values(reach).every((q) => q.walkM != null) && rooflineCheck().length === 0 };
}
out.nw0.pass = out.nw0.a.pass && out.nw0.b.pass && out.nw0.c.pass && out.nw0.d.pass && out.nw0.e.pass && scar.pass && trigRays.every((t) => !t.wallHits) && rise.outside && out.site.b1.agree && out.site.b1.bible;

const J = flag('--json');
if (J) writeFileSync(J, JSON.stringify(out, null, 1));
const yes = (b) => (b ? 'PASS' : 'FAIL');
console.log(`ground: ${out.ground}; centre ${out.site.centreGround} m (stated ${CENTRE.h}); outer face ${r2(OUTER_R)} m`);
for (const w of out.walls) console.log(`  ${w.id} r ${w.r} ${w.from}..${w.to} deg ${w.length} m, foot ${w.footMin}..${w.footMax} m, Scar ${w.scarMin} m${w.painted ? ', painted' : ''}`);
for (const a of ann) console.log(`NW0 (a) ${a.between}: clear gap ${a.clearGap} m; a ${need} m body run fits at ${a.fitBearings} bearings (longest ${a.longest.L} m at ${a.longest.beta}); the flattest that fits: ${a.flattest ? `bearing ${a.flattest.beta}, grade along ${a.flattest.gradeAlongDeg} deg, across ${a.flattest.gradeAcrossDeg} deg` : 'none'}; on ground <= ${MAX_CHARGE_GRADE} deg both ways at ${a.levelBearings} bearings: ${yes(a.pass)}`);
console.log(`NW0 (a) the run in, outside wall-1 at bearing 45 (${radial.from} -> ${radial.to} m): ${radial.clear ? 'clear' : 'blocked'}, ${radial.gradeDeg} deg downhill toward the wall (${radial.groundOut} -> ${radial.groundIn} m)`);
console.log(`NW0 ground under the village (r <= ${r1(OUTER_R)} m): slope median ${out.nw0.slope.overDisc.median} deg, p90 ${out.nw0.slope.overDisc.p90}, max ${out.nw0.slope.overDisc.max}; over 20 deg ${out.nw0.slope.overDisc.over20}, over 28 deg (A-slide's cinder) ${out.nw0.slope.overDisc.over28}; under the dwellings median ${out.nw0.slope.underDwellings.median}, max ${out.nw0.slope.underDwellings.max} deg`);
console.log(`NW0 (b) roofs below wall-top: ${out.nw0.b.both} of ${DWELLINGS.length} (relative ${out.nw0.b.relative}, absolute ${out.nw0.b.absolute}); equal neighbours ${out.nw0.b.rooflinesEqual.length}: ${yes(out.nw0.b.pass)}`);
console.log(`NW0 (c) from F34's lens (${out.nw0.c.lens.toCentre} m from the centre, lens at ${out.nw0.c.lens.y} m): ${out.nw0.c.countable} of 9 countable; roofs seen ${roofsSeen}: ${yes(out.nw0.c.pass)}`);
for (const c of count) console.log(`  ${c.id}: ${c.shown} of ${c.inFrame} stations show >= 4 px (median ${c.facePxMedian} px)`);
{ const d = out.nw0.d; console.log(`NW0 (d) the terraces: ${d.rings.map((q) => `${q.ring} level at ${q.levelledBearings} deg (level width >= ${q.levelWidthMin} m), cross-fall <= ${q.crossFallMaxDeg} deg, along ${q.alongMedianDeg}/${q.alongMaxDeg} deg`).join('; ')}: ${yes(d.pass)}`);
  console.log(`NW0 (d) risers (high terrace less low, median / max m): ${d.risers.map((q) => `${q.id} ${q.median}/${q.max}`).join(', ')}; cut ${d.cutM3} m3 (<= ${d.cutMax} m), fill ${d.fillM3} m3 (<= ${d.fillMax} m)`); }
{ const e = out.nw0.e; console.log(`NW0 (e) the road: ${e.road.points} points, ${e.road.length} m, grade <= ${e.road.gradeMaxDeg} deg, cross-fall <= ${e.road.crossFallMaxDeg} deg on its legs (${e.road.crossFallHairpinsDeg} deg on a hairpin's inside), off the hillside <= ${e.road.offNaturalMax} m, ends ${e.road.endToCentre} m from the centre; the walk from leg 2's fixture ${e.walk.seconds} s at her sprint (flat ${e.walk.fromFixtureFlat} m ${e.walk.flatS} s, road ${e.walk.roadS} s; the fall line the blockout's run took: ${e.walk.directClimb.m} m in ${e.walk.directClimb.s} s): ${yes(e.pass)}`); }
console.log(`site: Scar clear >= ${SCAR_CLEAR} m (least ${scar.minWall}): ${yes(scar.pass)}; Rise ${rise.toCentre} m: ${yes(rise.outside)}; trig rays ${trigRays.map((t) => `${t.pair} ${t.wallHits}`).join(', ')}`);
{ const q = out.site.b1; console.log(`site: B1 (sites/layout.js bm-01 at ${q.layout.x}, ${q.layout.z}; the Holds' blockout ${r2(q.holds.x)}, ${r2(q.holds.z)}: ${q.agree ? 'agree' : 'DISAGREE'}, ${q.bible ? 'at' : 'NOT at'} the bible's E 12, N -282) ${q.toCentre} m from the centre, ${q.toNearestWall} m from the nearest wall, ${q.scarDist} m off the Scar's line; Ninewalls' ground moves it ${q.groundMoved} m`); }
console.log(`NW3: ${out.nw3.colliders} colliders, ${out.nw3.occluderPieces} occluder pieces over ${out.nw3.occluderWalls} walls; worst gaps to the arc: colliders ${Math.max(...nw3.map((w) => w.worstColliderGap))} m, occluders ${Math.max(...nw3.map((w) => w.worstOccluderGap))} m, the kit's mesh ${Math.max(...nw3.map((w) => w.meshArcGap))} m: ${yes(out.nw3.pass)}`);
console.log(`kit: walls ${out.kit.wallTris} tris, the houses, tree and places ${out.kit.townTris} tris, ${out.kit.draws} draws (the stand-in budget ${out.kit.budget.tris} tris, ${out.kit.budget.draws} draws); ${out.kit.rosettes} rosettes on the tree, ${out.kit.kerbStones} kerb stones`);
console.log(`NW4 (Node half), on foot from ${out.nw4.from}: ${Object.entries(out.nw4.reach).map(([k, q]) => `${k} ${q.walkM == null ? 'UNREACHABLE' : q.walkM + ' m'}`).join(', ')}; equal adjacent rooflines ${out.nw4.rooflinesEqual}: ${yes(out.nw4.pass)}`);
console.log(`NW0: ${yes(out.nw0.pass)}`);
