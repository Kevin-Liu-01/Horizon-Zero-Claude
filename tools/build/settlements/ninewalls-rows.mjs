/**
 * NINEWALLS' ROW 0 AND THE WALL DATA ROWS, in Node (M2 wave 1, area B; no Chrome, no three).
 *
 *   node tools/build/settlements/ninewalls-rows.mjs [--json <out.json>] [--flat]
 *
 * NW0, the geometry check at blockout (M2 briefs §5): the numbers the design assumes, measured on the blockout and on
 * the island recipe as it stands (src/world/island/recipe.js heightAt; `--flat` puts the village on a level pad at its
 * stated height instead, the ground area A would grade):
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
 * NW3 (its data half): every wall's colliders and occluder pieces cover its arc to within 0.1 m, the occluder list
 * holds all nine. The mesh half is the page's (wave 2).
 */
import { writeFileSync } from 'node:fs';
import { heightAt } from '../../../src/world/island/recipe.js';
import { SCAR, TRIG, TRIG_TOP, siteById } from '../../../src/world/island/sites.js';
import { segmentHit } from '../../../src/instruments/lib/sight.js';
import {
  WALLS, OUTER_R, CENTRE, DWELLINGS, PLACES, SCAR_CLEAR, polar, bearingOf, dirOf, inSpan, stations, wallBoxes,
  segmentHitsWall, wallOccluders, dwellingPlace, scarDistance, rooflineCheck, ninewallsColliders, topOf,
} from '../../../src/world/settlements/ninewalls-layout.js';
import { FRAMES } from '../../../tools/frames/stagings/settlements.mjs';

const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const FLAT = args.includes('--flat');
const D2R = Math.PI / 180;
const r2 = (x) => Math.round(x * 100) / 100, r1 = (x) => Math.round(x * 10) / 10;
const PAD_R = OUTER_R + 6;
/** The ground: the recipe, or (--flat) a level pad at the stated height out to PAD_R blended over 20 m. */
const ground = FLAT
  ? (x, z) => { const d = Math.hypot(x - CENTRE.x, z - CENTRE.z), k = Math.min(1, Math.max(0, (d - PAD_R) / 20)); return CENTRE.h * (1 - k) + heightAt(x, z) * k; }
  : (x, z) => heightAt(x, z);

const SCREED = { L: 6.5, W: 3.6, charge: 25, clear: 0.5 };
const out = { ground: FLAT ? `level pad at ${CENTRE.h} m to ${r1(PAD_R)} m` : 'island recipe heightAt', walls: [], nw0: {}, nw3: {} };

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
  const q = polar(bb, inner.r), wallTop = ground(q.x, q.z) + inner.h;
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

/* ---------------------------------------------------------------- the site */
const B1 = { x: 12, z: 282 };
const t2 = TRIG.find((t) => t.id === 'T2');
const rise = { toCentre: r1(Math.hypot(t2.x - CENTRE.x, t2.z - CENTRE.z)), outside: Math.hypot(t2.x - CENTRE.x, t2.z - CENTRE.z) > OUTER_R + 5, groundT2: r1(ground(t2.x, t2.z)) };
const trigRays = [['T1', 'T2'], ['T2', 'T3'], ['T2', 'T6']].map(([p, q]) => {
  const A = TRIG.find((t) => t.id === p), B = TRIG.find((t) => t.id === q);
  const a = { x: A.x, y: ground(A.x, A.z) + TRIG_TOP, z: A.z }, b = { x: B.x, y: ground(B.x, B.z) + TRIG_TOP, z: B.z };
  const hits = boxShapes.flat().filter((s) => segmentHit(s, a.x, a.y, a.z, b.x, b.y, b.z) >= 0).length;
  return { pair: `${p}-${q}`, wallHits: hits };
});
const scar = { clear: SCAR_CLEAR, minWall: Math.min(...out.walls.map((w) => w.scarMin)), pass: out.walls.every((w) => w.scarMin >= SCAR_CLEAR) };
const b1code = { x: 19, z: 243 }; // src/world/sites/layout.js bm-01 as it stands (area A reconciles it to the bible)
out.site = {
  centreGround: r1(ground(CENTRE.x, CENTRE.z)), statedH: CENTRE.h, outerR: OUTER_R, rise, scar, trigRays,
  b1Bible: { toCentre: r1(Math.hypot(B1.x - CENTRE.x, B1.z - CENTRE.z)), toNearestWall: r1(Math.min(...WALLS.flatMap((w) => stations(w, 1).map((p) => Math.hypot(p.x - B1.x, p.z - B1.z) - w.t / 2)))), scarDist: r1(scarDistance(B1.x, B1.z)) },
  b1Code: { toCentre: r1(Math.hypot(b1code.x - CENTRE.x, b1code.z - CENTRE.z)), scarDist: r1(scarDistance(b1code.x, b1code.z)) },
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
out.nw3 = { walls: nw3, occluderWalls: new Set(occ.map((o) => o.id)).size, occluderPieces: occ.length, colliders: cols.length,
  pass: nw3.every((w) => w.worstColliderGap <= 0.1 && w.worstOccluderGap <= 0.1) && new Set(occ.map((o) => o.id)).size === 9 };

out.nw0.pass = out.nw0.a.pass && out.nw0.b.pass && out.nw0.c.pass && scar.pass && trigRays.every((t) => !t.wallHits) && rise.outside;

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
console.log(`site: Scar clear >= ${SCAR_CLEAR} m (least ${scar.minWall}): ${yes(scar.pass)}; Rise ${rise.toCentre} m: ${yes(rise.outside)}; trig rays ${trigRays.map((t) => `${t.pair} ${t.wallHits}`).join(', ')}`);
console.log(`site: B1 (bible) ${out.site.b1Bible.toCentre} m from the centre, ${out.site.b1Bible.toNearestWall} m from the nearest wall, ${out.site.b1Bible.scarDist} m off the Scar's line; B1 (layout.js) ${out.site.b1Code.toCentre} m, ${out.site.b1Code.scarDist} m off the line`);
console.log(`NW3 (data): ${out.nw3.colliders} colliders, ${out.nw3.occluderPieces} occluder pieces over ${out.nw3.occluderWalls} walls; worst gaps ${Math.max(...nw3.map((w) => w.worstColliderGap))} / ${Math.max(...nw3.map((w) => w.worstOccluderGap))} m: ${yes(out.nw3.pass)}`);
console.log(`NW0: ${yes(out.nw0.pass)}`);
