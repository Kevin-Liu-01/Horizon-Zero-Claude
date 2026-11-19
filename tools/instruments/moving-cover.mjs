/**
 * IN3, MOVING COVER (M2 wave 3, area C; M2 briefs §6): the Node twin of the page row, on simulation time.
 *   node tools/instruments/moving-cover.mjs [--json]
 *
 * The game's own Perception (src/entities/machines/ai/perception.js: the cone, the fill, hasLOS with the sight
 * occluders) on a Plumb standing on a terrace Ht m above the herd's ground, its lamp 2.5 m over its feet (plumb.js), its
 * perception row as plumb.js registers it (read from the kind's source). A Tiller file of three walks its bearing at
 * the herd's walk (1.5 m/s, 5.0 m of clear space stern to bow, tiller-herd.js FILE); each hull publishes its built
 * form's sight occluders every step exactly as kinds/tiller.js does (blockout.js `hullShapes`, form `built`). Brea walks
 * with the middle hull, crouched, at the herd's speed, in its lee: on the Plumb's sightline through the hull, s m beyond
 * its far edge (`place`).
 *
 * Ten lee walks (Ht 4-12 m, D 18-40 m from the Plumb to the file, the file's bearing 50-90 deg to the Plumb's line,
 * her place along the hull and off its flank varied): the Plumb faces her the whole walk (its worst case), and every
 * walk lasts 12 s. A DETECTION is a perception tick that sees her (the cover is broken: her suspicion starts to fill);
 * when the Plumb turns suspicious (suspicion >= susEnter) is reported beside it, not graded (at 40 m a crouched walker
 * fills a Plumb's 0.5 in about 5 s whatever the cover). Bars (IN3): 0 detections in the lee; the same ten walks OUT OF
 * THE SHADOW, 3 m short of the hull on the same sightline (nothing between her and the Plumb; behind the hull the shadow
 * of a 2.2 m hull from a lamp 6.5-14.5 m up reaches 4-14 m, so "3 m further out" on the lee side is still inside it):
 * detected within 4 s in 10 of 10.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
import * as THREE from 'three';

register(new URL('../gates/hero-sweep/vite-stub.mjs', import.meta.url));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { Perception } = await import(path.join(ROOT, 'src/entities/machines/ai/perception.js'));
const { registerKindTables, perceptionCfg } = await import(path.join(ROOT, 'src/entities/machines/ai/tables.js'));
const { HOT } = await import(path.join(ROOT, 'src/instruments/lib/hot.js'));
const { setOccluder, clearOccluders } = await import(path.join(ROOT, 'src/instruments/lib/sight.js'));
const { hullShapes, hullShapesInto } = await import(path.join(ROOT, 'src/instruments/lib/blockout.js'));
const { FILE } = await import(path.join(ROOT, 'src/instruments/kinds/tiller-herd.js'));

const DT = 1 / 60, WALK = 1.5, SECS = 12, D2R = Math.PI / 180;

/** plumb.js's perception row and sight numbers, read from its source (the bench cannot drift from the kind). */
function plumbRow() {
  const src = fs.readFileSync(path.join(ROOT, 'src/instruments/kinds/plumb.js'), 'utf8');
  const m = src.match(/perception: (\{[^}]*\})/);
  const perception = m ? Function(`return (${m[1]})`)() : {};
  const sightRange = Number((src.match(/sightRange: ([\d.]+)/) || [])[1] ?? 48);
  const sightHalfDeg = Number((src.match(/sightHalf: THREE\.MathUtils\.degToRad\(([\d.]+)\)/) || [])[1] ?? 50);
  return { perception, sightRange, sightHalf: sightHalfDeg * D2R, eyeHeight: 2.5 };
}

const ROW = plumbRow();
registerKindTables('plumb', { perception: ROW.perception }, { replace: true });

function flatTerrain(y = 0) { return { getHeight: () => y, heightFast: () => y }; }

/**
 * One walk. `out` m added to her offset off the lee flank (0 = in the lee, 3 = out of the shadow).
 * Returns { seenTicks, firstSeenS, detectedS (suspicion >= susEnter), maxSuspicion }.
 */
function walk(w, out, occlude = true) {
  clearOccluders();
  const cfg = perceptionCfg('plumb');
  // the file: three hulls along bearing `yaw` through the origin; the middle hull at the origin at t = 0
  const yaw = w.fileYaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
  const spacing = FILE.gap;            // centre spacing (hull + 5.0 m clear)
  const hulls = [-1, 0, 1].map((i) => ({ x: -fx * spacing * i, z: -fz * spacing * i, shapes: null, slot: `tiller:${i + 2}:` }));
  // the Plumb: D m from the file's line on the side `side`, Ht m up; it faces her throughout
  const rx = fz, rz = -fx;            // the file's right (x right, z forward: right = (cos yaw, -sin yaw))
  const side = w.side;                // which flank faces the Plumb (+1 right, -1 left)
  const plumbPos = new THREE.Vector3(rx * side * w.D + fx * w.along0, w.Ht, rz * side * w.D + fz * w.along0);
  const m = {
    kind: 'plumb', position: plumbPos, eyeHeight: ROW.eyeHeight, sightRange: ROW.sightRange, sightHalf: ROW.sightHalf,
    alive: true, state: 'patrol', lowLOD: false, parts: [], lastKnown: new THREE.Vector3(), manager: null,
    sc: { heading: 0, lampDarkT: 0, playerDist: 0, suspicion: 0, _unseenT: 0, _stateT: 0, scanOffset: 0, detectFill: 0 },
    ctx: { terrain: flatTerrain(0) },
  };
  const per = new Perception(m);
  const brea = new THREE.Vector3();
  HOT.terrain = flatTerrain(0); HOT.collision = null; HOT.pOk = 1; HOT.pHealth = 100; HOT.pCrouch = 1; HOT.pReedHide = 0;
  HOT.pMoveSpeed = WALK; HOT.ppos = brea; HOT.simTime = 0;
  let seenTicks = 0, firstSeenS = null, detectedS = null, maxS = 0;
  for (let i = 0; i < SECS / DT; i++) {
    const t = i * DT;
    HOT.simTime = t;
    for (const h of hulls) {
      const x = h.x + fx * WALK * t, z = h.z + fz * WALK * t;
      if (!h.shapes) { h.shapes = hullShapes('tiller', x, z, yaw, 'built', 0); if (occlude) h.shapes.forEach((s, k) => setOccluder(h.slot + k, s)); }
      else hullShapesInto('tiller', x, z, yaw, 'built', 0, h.shapes);
    }
    // Brea, ON THE PLUMB'S SIGHTLINE through the middle hull (moving cover is the hull BETWEEN her and the Plumb; with
    // the file walking on, the Plumb sees the hull obliquely, so "the far flank" is not the shadow): her place is the
    // hull's centre (`w.alongHull` m along it) plus, along the horizontal line from the Plumb through that point, the
    // hull's half-extent on that line and s m more (the lee); out of the shadow (out > 0) it is `out` m off the hull on
    // the Plumb's side of it, on the same line
    const cx = fx * WALK * t + fx * w.alongHull, cz = fz * WALK * t + fz * w.alongHull;
    place(brea, cx, cz, plumbPos, yaw, out > 0 ? -(out) : w.s);
    // the Plumb faces her (its worst case): the cone's heading straight at her
    m.sc.heading = Math.atan2(brea.x - plumbPos.x, brea.z - plumbPos.z);
    m.sc._stateT = t;
    per.update(DT);
    if (per._tickVisible && per.acc === 0) { seenTicks++; if (firstSeenS === null) firstSeenS = +t.toFixed(2); }
    if (m.sc.suspicion > maxS) maxS = m.sc.suspicion;
    if (detectedS === null && m.sc.suspicion >= cfg.susEnter) detectedS = +t.toFixed(2);
  }
  clearOccluders();
  return { seenTicks, firstSeenS, detectedS, maxSuspicion: +maxS.toFixed(3) };
}

/** The built hull's half-extents (blockout.js `built`: 1.36 m over the skirt, 3.28 m long). */
export const HULL_HALF = Object.freeze({ w: 0.68, l: 1.64 });

/**
 * Her place on the line from the Plumb (eye at `pl`) through the hull point (cx, cz) of a hull facing `yaw`: `d` m beyond
 * the hull's edge on that line (d > 0: the lee, behind it), or -d m short of the near edge (d < 0: on the Plumb's side).
 * Written into `out` (x, z; y 0). Shared with the page row's staging (the same arithmetic, inlined there).
 */
export function place(out, cx, cz, pl, yaw, d) {
  let ux = cx - pl.x, uz = cz - pl.z;
  const L = Math.hypot(ux, uz) || 1; ux /= L; uz /= L;
  // the hull's half-extent along u: its frame is forward (sin yaw, cos yaw), right (cos yaw, -sin yaw)
  const uf = Math.abs(ux * Math.sin(yaw) + uz * Math.cos(yaw)), ur = Math.abs(ux * Math.cos(yaw) - uz * Math.sin(yaw));
  const edge = Math.min(ur > 1e-6 ? HULL_HALF.w / ur : 1e9, uf > 1e-6 ? HULL_HALF.l / uf : 1e9);
  const k = d >= 0 ? edge + d : -(edge - d);
  out.x = cx + ux * k; out.z = cz + uz * k; out.y = 0;
  return out;
}

/** The ten walks (deterministic). */
export const WALKS = Array.from({ length: 10 }, (_, k) => ({
  Ht: [4, 8, 12][k % 3], D: 18 + (k * 22) / 9, fileYaw: (50 + (k * 40) / 9) * D2R, side: k % 2 ? 1 : -1,
  alongHull: [-0.6, 0, 0.6, -0.3, 0.3][k % 5], s: [0.6, 0.8, 1.0][k % 3], along0: [-4, 0, 4, 2, -2][k % 5],
}));

export function runMovingCover() {
  const lee = WALKS.map((w) => ({ ...w, ...walk(w, 0) }));
  const open = WALKS.map((w) => ({ ...w, ...walk(w, 3) }));
  // the control: the same lee walks with the hulls' occluders unpublished (the M1 game): each must be seen, or the
  // walks prove nothing about the cover
  const control = WALKS.map((w) => ({ ...w, ...walk(w, 0, false) }));
  const controlSeen = control.filter((r) => r.seenTicks > 0).length;
  const leeDetections = lee.filter((r) => r.seenTicks > 0 || r.maxSuspicion > 0).length;
  const openDetected4s = open.filter((r) => r.firstSeenS !== null && r.firstSeenS <= 4).length;
  return { pass: leeDetections === 0 && openDetected4s === 10 && controlSeen === 10, leeDetections, openDetected4s, controlSeen, lee, open,
    plumb: { sightRange: ROW.sightRange, sightHalfDeg: +(ROW.sightHalf / D2R).toFixed(1), perception: ROW.perception } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = runMovingCover();
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else {
    const f = (o) => `Ht ${o.Ht} D ${o.D.toFixed(1)} bearing ${(o.fileYaw / D2R).toFixed(0)} s ${o.s}: seen ticks ${o.seenTicks}, first seen ${o.firstSeenS ?? '-'} s, suspicious at ${o.detectedS ?? '-'} s, max ${o.maxSuspicion}`;
    console.log('IN3 lee walks (crouched, the hull between her and the Plumb):'); r.lee.forEach((o) => console.log('  ' + f(o)));
    console.log('IN3 the same walks 3 m out of the shadow:'); r.open.forEach((o) => console.log('  ' + f(o)));
    console.log(`${r.pass ? 'PASS' : 'FAIL'} lee detections ${r.leeDetections} of 10 (bar 0); out of the shadow detected within 4 s ${r.openDetected4s} of 10 (bar 10); control (no occluders) seen in ${r.controlSeen} of 10`);
  }
  process.exitCode = r.pass ? 0 : 1;
}
