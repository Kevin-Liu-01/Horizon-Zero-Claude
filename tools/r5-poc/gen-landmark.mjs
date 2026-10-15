#!/usr/bin/env node
/**
 * ROUND 5 PIPELINE PROOF — one landmark, generated with the same kit as the
 * creature (tools/r5-poc/lib/hs.mjs).
 *
 *   node tools/r5-poc/gen-landmark.mjs  ->  public/models/r5-poc/sounding-ring.glb
 *
 * THE SOUNDING RING: a fallen survey gyroscope, two nested gimbal rings
 * (outer 26 m, inner 17 m) of glazed ceramic panels on bronze flanges, the
 * outer ring broken through one quadrant with its panels lying in the salt,
 * a dim lantern core hung on the inner ring's trunnions, three cable stays
 * to basalt anchor blocks. Two materials (hull palette + lamp), one mesh
 * each: two draw calls plus its shadow caster.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  THREE, Bucket, V, strut, ball, rbox, cable, plate, lathe, at, rng,
} from './lib/hs.mjs';
import { writeGLB } from './lib/glb.mjs';

const T0 = performance.now();
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BONE = 0xe7dccb, OXBLOOD = 0x7a2a20, VERDI = 0x4d8b78, BRONZE = 0xb18a52, GRAPH = 0x2a2d32;
const BASALT = 0x3b3a38, LAMP = 0x1a1208;
const P = (r, h, surf, tone) => ({ r, h, surf, tone });
const hull = new Bucket('ring-hull');
const lamp = new Bucket('ring-lamp');
const R = rng(7);

/** Ring cross-section (closed loop in r,h) swept about local +Y. */
function ringSection(Rm, w, d, glazeTone) {
  const a = Rm - w / 2, b = Rm + w / 2, h = d / 2, bv = 0.12;
  return [
    P(a + bv, -h, 'graphite', GRAPH), P(b - bv, -h, 'bronze', BRONZE), P(b, -h + bv, 'glaze', glazeTone),
    P(b, -0.10, 'glaze', OXBLOOD), P(b, 0.10, 'glaze', glazeTone), P(b, h - bv, 'bronze', BRONZE),
    P(b - bv, h, 'glaze', glazeTone), P(a + bv, h, 'graphite', GRAPH), P(a, h - bv, 'graphite', GRAPH),
    P(a, -h + bv, 'graphite', GRAPH), P(a + bv, -h, 'graphite', GRAPH),
  ];
}

/** One gimbal ring in the frame `m` (ring axis = local +Y). arcs: [[phi0, phi1], ...]. */
function gimbal(m, Rm, w, d, arcs, panelDeg = 15) {
  for (const [p0, p1] of arcs) {
    const len = p1 - p0;
    const panels = Math.max(1, Math.round(THREE.MathUtils.radToDeg(len) / panelDeg));
    lathe(hull, ringSection(Rm, w, d, BONE), m, {
      segs: panels * 4, panels, gap: 0.6, phiStart: p0, phiLength: len, wear: 0.5, crease: 30,
    });
    // bronze flanges at each panel joint
    for (let i = 0; i <= panels; i++) {
      const phi = p0 + (i / panels) * len;
      const flange = [P(Rm - w / 2 - 0.08, -d / 2 - 0.06, 'bronze', BRONZE), P(Rm + w / 2 + 0.1, -d / 2 - 0.06, 'bronze', BRONZE),
        P(Rm + w / 2 + 0.1, d / 2 + 0.06, 'bronze', BRONZE), P(Rm - w / 2 - 0.08, d / 2 + 0.06, 'bronze', BRONZE),
        P(Rm - w / 2 - 0.08, -d / 2 - 0.06, 'bronze', BRONZE)];
      lathe(hull, flange, m, { segs: 1, phiStart: phi - 0.006, phiLength: 0.012, wear: 0.6 });
    }
  }
}

/* ----------------------------- outer ring -------------------------------- */
// tilted 68 deg off vertical so it leans, sunk ~3 m into the pan
const OUTER_R = 13.0;
const outerM = new THREE.Matrix4().compose(V(0, 9.6, 0),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.36, 0.25, 0.0, 'YXZ')), V(1, 1, 1));
const BREAK0 = 3.75, BREAK1 = 4.75;     // the missing quadrant (rad)
gimbal(outerM, OUTER_R, 1.5, 1.1, [[0, BREAK0], [BREAK1, Math.PI * 2]]);

// fallen outer panels, lying in the salt below the break
for (let i = 0; i < 4; i++) {
  const phi = BREAK0 + 0.12 + i * 0.23;
  const lay = new THREE.Matrix4().compose(
    V(-7.5 + i * 2.6 + R() * 0.8, 0.25 + R() * 0.2, 8.5 + R() * 3.0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05 + R() * 0.25, R() * Math.PI, 0.35 + R() * 0.5)),
    V(1, 1, 1));
  // bring the arc (centred on phi at radius R) to the origin, then lay it down
  const piece = lay.multiply(new THREE.Matrix4().makeTranslation(0, 0, -OUTER_R))
    .multiply(new THREE.Matrix4().makeRotationY(-(phi + 0.1)));
  lathe(hull, ringSection(OUTER_R, 1.5, 1.1, BONE), piece,
    { segs: 4, phiStart: phi, phiLength: 0.2, wear: 0.7 });
}

/* ----------------------------- inner ring -------------------------------- */
// hangs from two trunnions on the outer ring, rotated about the trunnion axis
const INNER_R = 8.6;
const innerLocal = new THREE.Matrix4().makeRotationX(0.95);   // about the trunnion (local X)
const innerM = outerM.clone().multiply(innerLocal);
gimbal(innerM, INNER_R, 1.0, 0.8, [[0, Math.PI * 2]], 20);
// trunnion pins between the rings (local X axis of the outer frame)
for (const s of [1, -1]) {
  const a = V(s * (INNER_R + 0.4), 0, 0).applyMatrix4(outerM);
  const b = V(s * (OUTER_R - 0.7), 0, 0).applyMatrix4(outerM);
  strut(hull, a, b, 0.45, 0.45, { surf: 'graphite', tone: GRAPH, sides: 16 });
  strut(hull, b.clone().lerp(a, -0.05), b.clone().lerp(a, 0.12), 0.75, 0.75, { surf: 'bronze', tone: BRONZE, sides: 20, wear: 0.6 });
}

/* ----------------------------- lantern core ------------------------------ */
// on a spindle across the inner ring; the glass is the lamp material
{
  const a = V(0, 0, -INNER_R + 0.5).applyMatrix4(innerM);
  const b = V(0, 0, INNER_R - 0.5).applyMatrix4(innerM);
  const c = a.clone().lerp(b, 0.5);
  strut(hull, a, b, 0.22, 0.22, { surf: 'graphite', tone: GRAPH, sides: 14 });
  lathe(hull, [
    P(0, -2.2, 'bronze', BRONZE), P(1.0, -1.9, 'bronze', BRONZE), P(1.55, -1.1, 'glaze', OXBLOOD),
    P(1.6, -0.9, 'patina', VERDI), P(1.6, 0.9, 'patina', VERDI), P(1.55, 1.1, 'glaze', OXBLOOD),
    P(1.0, 1.9, 'bronze', BRONZE), P(0, 2.2, 'bronze', BRONZE),
  ], new THREE.Matrix4().compose(c, new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()), V(1, 1, 1)),
  { segs: 24, panels: 8, gap: 9, wear: 0.5 });
  ball(lamp, c, 1.25, { surf: 'lamp', tone: LAMP, w: 24, h: 16 });
}

/* ----------------------------- glyph plates ------------------------------ */
// survey glyphs (original): oxblood bars on the outer face, a 5-bit code per panel
for (let i = 0; i < 24; i++) {
  const phi = (i / 24) * Math.PI * 2 + 0.07;
  if (phi > BREAK0 - 0.05 && phi < BREAK1 + 0.05) continue;
  const bits = (i * 11 + 5) % 32;
  for (let k = 0; k < 5; k++) {
    if (!(bits & (1 << k))) continue;
    const local = V(Math.sin(phi) * (OUTER_R + 0.77), -0.42 + k * 0.21, Math.cos(phi) * (OUTER_R + 0.77));
    const tangent = V(Math.cos(phi), 0, -Math.sin(phi));
    const normal = V(Math.sin(phi), 0, Math.cos(phi));
    const m = new THREE.Matrix4().makeBasis(tangent, V(0, 1, 0), normal).setPosition(local).premultiply(outerM);
    rbox(hull, V(0, 0, 0), [0.7, 0.11, 0.05], 0.015, { surf: 'glaze', tone: OXBLOOD, matrix: m, wear: 0.3 });
  }
}

/* ----------------------------- stays + anchors --------------------------- */
// stays leave the ring at three live (unbroken) stations and run out and down to anchors
const STATIONS = [0.55, 1.95, 5.55];
const ringTop = STATIONS.map((phi) => V(Math.sin(phi) * (OUTER_R + 0.6), 0, Math.cos(phi) * (OUTER_R + 0.6)).applyMatrix4(outerM));
const anchors = ringTop.map((p) => V(p.x * 1.55, 0, p.z * 1.55));
anchors.forEach((A, i) => {
  rbox(hull, A.clone().add(V(0, 0.9, 0)), [2.6, 2.4, 2.2], 0.25, { surf: 'bisque', tone: BASALT, wear: 0.8, rot: [0, i * 0.7, 0] });
  rbox(hull, A.clone().add(V(0, 2.2, 0)), [1.2, 0.5, 1.2], 0.1, { surf: 'bronze', tone: BRONZE, wear: 0.7, rot: [0, i * 0.7, 0] });
  const top = ringTop[i];
  const mid = top.clone().lerp(A, 0.5); mid.y -= 1.8;               // catenary sag
  cable(hull, [top, mid, A.clone().add(V(0, 2.4, 0))], 0.12, { surf: 'graphite', tone: GRAPH, segs: 24, radial: 8 });
});

/* ----------------------------- finishing --------------------------------- */
const smf = THREE.MathUtils.smoothstep;
hull.shade((x, y) => 0.55 + 0.45 * smf(y, -1.0, 3.5));    // salt-line staining near the ground
const box = hull.bounds(new THREE.Box3());
lamp.bounds(box);

const stats = await writeGLB([
  { bucket: hull, material: { name: 'r5-ring-hull' } },
  { bucket: lamp, material: { name: 'r5-ring-lamp', emissive: [1.0, 0.72, 0.38], baseColor: [0.02, 0.015, 0.01, 1] } },
], { file: `${ROOT}public/models/r5-poc/sounding-ring.glb`,
  extras: { r5Generator: { name: 'tools/r5-poc/gen-landmark.mjs', design: 'sounding-ring', licence: 'original work (generated)' },
    r5Footprint: { anchors: anchors.map((a) => [a.x, a.z]), ringRadius: OUTER_R } } });
const T1 = performance.now();
const size = box.getSize(new THREE.Vector3());
const out = { landmark: 'sounding-ring', ...stats, kb: +(stats.bytes / 1024).toFixed(1),
  size: [+size.x.toFixed(1), +size.y.toFixed(1), +size.z.toFixed(1)], genMs: +(T1 - T0).toFixed(1) };
mkdirSync(`${ROOT}tools/r5-poc/out`, { recursive: true });
writeFileSync(`${ROOT}tools/r5-poc/out/landmark.stats.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
