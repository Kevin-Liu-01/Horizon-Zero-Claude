#!/usr/bin/env node
/**
 * ROUND 5 PIPELINE PROOF — one ORIGINAL machine-creature, generated in node.
 *
 *   node tools/r5-poc/gen-creature.mjs
 *     -> public/models/r5-poc/tiller.glb      (hull + sensor, 2 materials)
 *     -> tools/r5-poc/out/tiller.stats.json   (tris, bytes, ms, rig)
 *
 * DESIGN LANGUAGE ("field instruments", not animals): the TILLER is a
 * six-legged soil-survey walker. Body = three lathe-turned glazed-ceramic
 * segments on bronze gimbal rings; head = a theodolite sensor DRUM on a yoke
 * with a rangefinder; back = a seed hopper with a lantern core and two
 * radiator fans; tail = a coring auger; legs = telescoping pistons on
 * disc pads. Palette: bone glaze, oxblood bands, verdigris trim, graphite.
 *
 * THE RIG IS AUTHORED WITH THE MESH. Every piece is emitted into a
 * per-bone bucket, so the GLB carries a `_BONE` vertex attribute (the
 * generator's own truth about which bone owns which vertex) and the
 * autorig spec (`asset.extras.r5Rig`) is computed from the same numbers
 * that placed the limbs. The species seeds `skinIndex/skinWeight` from
 * `_BONE` through autorig's existing per-geometry cache (`rigKind`), or
 * leaves it out to fall back to autorig's capsule capture (measured both).
 */
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  THREE, Bucket, V, strut, ball, rbox, torus, cable, plate, lathe, basis,
  AXIS_Z, AXIS_X, at,
} from './lib/hs.mjs';
import { writeGLB } from './lib/glb.mjs';

const T0 = performance.now();
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT_GLB = `${ROOT}public/models/r5-poc/tiller.glb`;
const OUT_STATS = `${ROOT}tools/r5-poc/out/tiller.stats.json`;

/* ---------------------------- palette (sRGB) ---------------------------- */
const BONE = 0xe7dccb;     // bone-white glaze
const OXBLOOD = 0x7a2a20;  // oxblood glaze band
const VERDI = 0x4d8b78;    // verdigris copper
const BRONZE = 0xb18a52;
const GRAPH = 0x2a2d32;
const RUBBER = 0x1b1a19;
const CHROME = 0xc9ccd0;
const LAMP = 0x1a1208;     // sensor glass albedo (emissive does the work)

/* ------------------------- per-bone buckets ------------------------------ */
// Each bone gets its own hull + sensor bucket so the `_BONE` label is exact.
const BONES = [];          // names in label order
const hull = new Map();    // bone -> Bucket
const lamp = new Map();
function H(bone) { if (!hull.has(bone)) { hull.set(bone, new Bucket(`hull:${bone}`)); if (!BONES.includes(bone)) BONES.push(bone); } return hull.get(bone); }
function L(bone) { if (!lamp.has(bone)) { lamp.set(bone, new Bucket(`lamp:${bone}`)); if (!BONES.includes(bone)) BONES.push(bone); } return lamp.get(bone); }

/* ------------------------------ body ------------------------------------ */
const AXIS_Y = 1.78;   // body centre line height
const P = (r, h, surf, tone) => ({ r, h, surf, tone });

/** One turned body segment along +Z (or -Z), 6 glaze panels over a graphite core. */
function segment(bone, z0, len, rMax, opts = {}) {
  const k = (h) => h * len;
  const band = opts.band ?? 0.5;
  const tp = opts.taper ?? 0.9;
  const prof = [
    P(0, 0, 'patina', VERDI),
    P(rMax * 0.62, 0, 'patina', VERDI),
    P(rMax * 0.86, k(0.035), 'glaze', BONE),
    P(rMax * 0.97, k(0.12), 'glaze', BONE),
    P(rMax, k(band - 0.12), 'graphite', GRAPH),          // groove (panel line)
    P(rMax * 0.965, k(band - 0.11), 'graphite', GRAPH),
    P(rMax * 0.965, k(band - 0.08), 'glaze', BONE),
    P(rMax, k(band - 0.07), 'glaze', OXBLOOD),            // oxblood band
    P(rMax, k(band + 0.07), 'glaze', BONE),
    P(rMax * tp, k(0.8), 'glaze', BONE),
    P(rMax * tp * 0.84, k(0.94), 'bronze', BRONZE),
    P(rMax * tp * 0.70, k(0.985), 'patina', VERDI),
    P(rMax * tp * 0.40, k(1.0), 'patina', VERDI),
    P(0, k(1.0), 'graphite', GRAPH),
  ];
  const m = at(0, AXIS_Y, z0, opts.dir === -1 ? new THREE.Matrix4().makeRotationX(-Math.PI / 2) : AXIS_Z.clone());
  lathe(H(bone), prof, m, { segs: 36, panels: 6, gap: 2.2, wear: 0.35, phiStart: Math.PI / 6 });
  // graphite core under the panel seams: the SAME profile, 6 % smaller
  lathe(H(bone), prof.slice(1, -1).map((q) => P(q.r * 0.94, q.h)), m, { segs: 18, surf: 'graphite', tone: GRAPH, wear: 0.1 });
}

// abdomen + mid ride the pelvis bone, the thorax rides the chest bone
segment('pelvis', -0.54, 1.08, 0.46, { band: 0.45, taper: 0.62, dir: -1 }); // abdomen: z -0.54..-1.62
segment('pelvis', -0.50, 0.78, 0.50, { band: 0.5, taper: 0.96 });            // mid: z -0.50..0.28
segment('chest', 0.31, 1.00, 0.45, { band: 0.42, taper: 0.78 });             // thorax: z 0.31..1.31

// gimbal rings + bolt heads at the two joints
for (const [z, bone] of [[-0.52, 'pelvis'], [0.295, 'chest']]) {
  torus(H(bone), V(0, AXIS_Y, z), 0.40, 0.052, 'z', { surf: 'bronze', tone: BRONZE, wear: 0.5, tube: 8, radial: 32 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const c = V(Math.sin(a) * 0.40, AXIS_Y + Math.cos(a) * 0.40, z);
    const n = V(Math.sin(a), Math.cos(a), 0);
    strut(H(bone), c.clone().addScaledVector(n, 0.03), c.clone().addScaledVector(n, 0.07), 0.018, 0.016,
      { surf: 'graphite', tone: GRAPH, sides: 6 });
  }
}
// three ribs on the abdomen (the auger housing's cooling collar)
for (let i = 0; i < 3; i++) {
  torus(H('pelvis'), V(0, AXIS_Y, -1.12 - i * 0.12), 0.43 - i * 0.03, 0.022, 'z', { surf: 'patina', tone: VERDI, tube: 6, radial: 32 });
}

// keel (underbelly spine) — graphite
rbox(H('pelvis'), V(0, AXIS_Y - 0.42, -0.55), [0.30, 0.12, 1.9], 0.05, { surf: 'graphite', tone: GRAPH, wear: 0.2 });
rbox(H('chest'), V(0, AXIS_Y - 0.40, 0.78), [0.26, 0.10, 0.9], 0.04, { surf: 'graphite', tone: GRAPH, wear: 0.2 });

// thorax side vents (greeble): five slats per side on a verdigris plate
for (const s of [1, -1]) {
  for (let i = 0; i < 5; i++) {
    rbox(H('chest'), V(s * 0.432, AXIS_Y - 0.10 + i * 0.045, 0.70), [0.03, 0.022, 0.26], 0.008,
      { surf: 'graphite', tone: GRAPH, rot: [0, 0, s * -0.2] });
  }
  rbox(H('chest'), V(s * 0.43, AXIS_Y - 0.01, 0.70), [0.02, 0.27, 0.32], 0.01, { surf: 'patina', tone: VERDI, rot: [0, 0, s * -0.2] });
}

/* ------------------------------ hopper ----------------------------------- */
const HOP = V(0, AXIS_Y + 0.43, 0.0);
lathe(H('pelvis'), [
  P(0, 0, 'graphite', GRAPH), P(0.21, 0, 'graphite', GRAPH),
  P(0.23, 0.05, 'glaze', BONE), P(0.27, 0.16, 'glaze', OXBLOOD), P(0.30, 0.25, 'glaze', BONE),
  P(0.335, 0.28, 'bronze', BRONZE), P(0.34, 0.31, 'bronze', BRONZE), P(0.30, 0.32, 'graphite', GRAPH),
  P(0.26, 0.14, 'graphite', GRAPH), P(0, 0.14, 'graphite', GRAPH),
], at(HOP.x, HOP.y, HOP.z), { segs: 32, wear: 0.4, crease: 30 });
ball(L('pelvis'), V(HOP.x, HOP.y + 0.24, HOP.z), 0.11, { surf: 'lamp', tone: LAMP, w: 14, h: 10 });
for (let i = 0; i < 4; i++) {
  const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
  cable(H('pelvis'), [
    V(HOP.x + Math.sin(a) * 0.25, HOP.y + 0.15, HOP.z + Math.cos(a) * 0.25),
    V(HOP.x + Math.sin(a) * 0.17, HOP.y + 0.36, HOP.z + Math.cos(a) * 0.17),
    V(HOP.x, HOP.y + 0.42, HOP.z),
  ], 0.012, { surf: 'bronze', tone: BRONZE, segs: 8, radial: 5 });
}
// radiator fans: five fins per side, fanned out
for (const s of [1, -1]) {
  for (let i = 0; i < 5; i++) {
    const z = -0.32 + i * 0.13;
    const lean = s * (0.45 + i * 0.04);
    const m = new THREE.Matrix4().compose(V(s * 0.30, AXIS_Y + 0.36, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -lean)), V(1, 1, 1));
    plate(H('pelvis'), [[-0.02, -0.05], [0.18 * s, -0.02], [0.24 * s, 0.10], [0.0, 0.17]],
      0.018, 0.006, m, { surf: i === 2 ? 'patina' : 'bronze', tone: i === 2 ? VERDI : BRONZE, wear: 0.6 });
  }
}

/* ------------------------------ neck + head ------------------------------ */
const NECK = V(0, AXIS_Y + 0.20, 1.28);
const DRUM = V(0, AXIS_Y + 0.50, 1.58);
for (const s of [1, -1]) {
  const a = V(s * 0.30, NECK.y, NECK.z), b = V(s * 0.30, DRUM.y, DRUM.z);
  const d = b.clone().sub(a);
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), d.clone().normalize()), V(1, 1, 1));
  rbox(H('neck'), V(0, 0, 0), [0.05, 0.11, d.length() + 0.14], 0.02, { surf: 'glaze', tone: BONE, wear: 0.4, matrix: m });
  rbox(H('neck'), V(0, -0.075, 0), [0.03, 0.03, d.length() + 0.04], 0.008, { surf: 'patina', tone: VERDI, matrix: m });
}
strut(H('neck'), V(-0.31, NECK.y, NECK.z), V(0.31, NECK.y, NECK.z), 0.055, 0.055, { surf: 'graphite', tone: GRAPH, sides: 12 });
// neck column from the thorax nose up to the yoke pivot
strut(H('neck'), V(0, AXIS_Y + 0.02, 1.22), V(0, NECK.y + 0.02, NECK.z), 0.09, 0.07, { surf: 'graphite', tone: GRAPH, sides: 12 });
for (const s of [1, -1]) {
  cable(H('neck'), [V(s * 0.12, AXIS_Y + 0.36, 1.02), V(s * 0.15, AXIS_Y + 0.50, 1.22), V(s * 0.11, DRUM.y + 0.10, DRUM.z - 0.18)], 0.022,
    { surf: 'rubber', tone: RUBBER, segs: 10, radial: 6 });
}
// sensor drum (axis X), oxblood survey band
lathe(H('head'), [
  P(0, 0, 'graphite', GRAPH), P(0.19, 0, 'graphite', GRAPH), P(0.215, 0.03, 'glaze', BONE),
  P(0.225, 0.13, 'glaze', BONE), P(0.228, 0.15, 'glaze', OXBLOOD), P(0.228, 0.24, 'glaze', BONE),
  P(0.225, 0.40, 'glaze', BONE), P(0.205, 0.46, 'patina', VERDI), P(0.17, 0.48, 'graphite', GRAPH),
  P(0, 0.48, 'graphite', GRAPH),
], at(DRUM.x - 0.24, DRUM.y, DRUM.z, AXIS_X.clone()), { segs: 32, wear: 0.4 });
for (const s of [1, -1]) {
  strut(H('head'), V(s * 0.24, DRUM.y, DRUM.z), V(s * 0.33, DRUM.y, DRUM.z), 0.075, 0.075,
    { surf: 'bronze', tone: BRONZE, sides: 14 });
}
const LENSES = [[0, 0.0, 0.085], [-0.14, -0.05, 0.045], [0.14, -0.05, 0.045]];
for (const [x, y, r] of LENSES) {
  const c = V(DRUM.x + x, DRUM.y + y, DRUM.z + 0.212 - (Math.abs(x) > 0 ? 0.02 : 0));
  torus(H('head'), c.clone().add(V(0, 0, 0.012)), r + 0.012, 0.014, 'z', { surf: 'bronze', tone: BRONZE, tube: 6, radial: 20 });
  strut(H('head'), c.clone().add(V(0, 0, -0.03)), c.clone().add(V(0, 0, 0.01)), r + 0.02, r + 0.02, { surf: 'graphite', tone: GRAPH, sides: 16 });
  const g = new THREE.SphereGeometry(r, 16, 10);
  g.scale(1, 1, 0.45);
  L('head').add(g, { matrix: at(c.x, c.y, c.z + 0.012), surf: 'lamp', tone: LAMP });
  g.dispose();
}
// rangefinder tube on top
const RF_Y = DRUM.y + 0.25;
strut(H('head'), V(0, RF_Y, DRUM.z - 0.12), V(0, RF_Y, DRUM.z + 0.40), 0.045, 0.04, { surf: 'graphite', tone: GRAPH, sides: 12 });
for (const z of [DRUM.z - 0.03, DRUM.z + 0.27]) strut(H('head'), V(0, RF_Y, z), V(0, RF_Y, z + 0.03), 0.055, 0.055, { surf: 'bronze', tone: BRONZE, sides: 12 });
rbox(H('head'), V(0, DRUM.y + 0.18, DRUM.z), [0.08, 0.10, 0.12], 0.02, { surf: 'graphite', tone: GRAPH });
ball(L('head'), V(0, RF_Y, DRUM.z + 0.405), 0.03, { surf: 'lamp', tone: LAMP });
plate(H('head'), [[0, 0], [0.16, 0], [0.04, 0.12]], 0.012, 0.004,
  new THREE.Matrix4().compose(V(0, RF_Y + 0.02, DRUM.z - 0.1), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), V(1, 1, 1)),
  { surf: 'bronze', tone: BRONZE, wear: 0.6 });
for (let i = 0; i < 3; i++) ball(L('chest'), V(0, AXIS_Y + 0.452, 0.50 + i * 0.12), 0.022, { surf: 'lamp', tone: LAMP });

/* ------------------------------ tail (auger) ----------------------------- */
const TAIL0 = V(0, AXIS_Y - 0.03, -1.58), TAIL1 = V(0, AXIS_Y - 0.12, -2.00), TIP = V(0, AXIS_Y - 0.34, -2.48);
function latheAlong(bucket, a, b, prof, opts) {
  const d = b.clone().sub(a).normalize();
  const m = new THREE.Matrix4().compose(a, new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d), V(1, 1, 1));
  lathe(bucket, prof, m, opts);
}
latheAlong(H('tail1'), TAIL0, TAIL1, [
  P(0, 0, 'graphite', GRAPH), P(0.24, 0, 'graphite', GRAPH), P(0.255, 0.05, 'glaze', BONE),
  P(0.23, 0.26, 'graphite', GRAPH), P(0.215, 0.28, 'glaze', OXBLOOD), P(0.18, 0.40, 'patina', VERDI),
  P(0.12, 0.45, 'graphite', GRAPH), P(0, 0.45, 'graphite', GRAPH),
], { segs: 28, wear: 0.4, panels: 4, gap: 2.5 });
{
  const prof = [P(0, 0, 'graphite', GRAPH), P(0.11, 0, 'graphite', GRAPH)];
  const len = TIP.distanceTo(TAIL1);
  for (let i = 0; i < 7; i++) {
    const h = 0.04 + (i / 7) * (len - 0.1);
    const r = 0.12 * (1 - i / 8);
    prof.push(P(r, h, 'bronze', BRONZE), P(r * 0.7, h + 0.035, 'chrome', CHROME));
  }
  prof.push(P(0, len, 'chrome', CHROME));
  latheAlong(H('tail2'), TAIL1, TIP, prof, { segs: 16, wear: 0.5, crease: 25 });
}

/* ------------------------------ legs ------------------------------------- */
/**
 * HIGH-KNEE STILT LEGS. Thigh 0.85 m, shin 1.70 m: the shin is longer than
 * the hip-to-ankle chord, so the knee sits AT or ABOVE the hip. The bind
 * knee is solved with the SAME two-bone construction GaitController uses
 * (hinge pole +/-Z in the body frame), so what is modelled is exactly the
 * pose the IK holds at rest — no first-frame pop, no plate that rotates
 * away from where it was drawn.
 */
const L1 = 0.85, L2 = 1.70;
const HIP_Y = AXIS_Y - 0.20;
function solveKnee(Hp, A, hinge) {
  const D = A.clone().sub(Hp);
  const d = D.length();
  D.divideScalar(d);
  const n = new THREE.Vector3().crossVectors(D, V(0, 0, hinge)).normalize();
  const cosA = THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const dir = D.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(n, Math.acos(cosA)));
  return Hp.clone().addScaledVector(dir, L1);
}
const LEGS = [];
const LEG_DEF = [
  // row, hip z, ankle x, ankle z, hinge (+1 = knee apex forward), parent
  ['F', 0.86, 0.88, 1.50, 1, 'chest'],
  ['M', -0.02, 0.94, -0.02, -1, 'pelvis'],
  ['H', -0.86, 0.88, -1.50, -1, 'pelvis'],
];
for (const [row, hz, ax, az, hinge, parent] of LEG_DEF) {
  for (const s of [1, -1]) {
    const id = (s > 0 ? 'R' : 'L') + row;
    const Hp = V(s * 0.55, HIP_Y, hz);
    const A = V(s * ax, 0.15, az);
    const K = solveKnee(Hp, A, hinge);
    const Tt = A.clone().add(V(s * 0.02, -0.13, 0.15));
    LEGS.push({ id, parent, hinge, hip: Hp, knee: K, ankle: A, toe: Tt, s });
  }
}
function frameOn(a, b, s) {
  const d = b.clone().sub(a).normalize();
  const out = V(s, 0, 0).addScaledVector(d, -d.x * s).normalize();
  const w = new THREE.Vector3().crossVectors(d, out).normalize();
  return { d, out, w };
}
for (const Lg of LEGS) {
  const { s, hip: Hp, knee: K, ankle: A } = Lg;
  const thigh = `${Lg.id}_thigh`, shin = `${Lg.id}_shin`, foot = `${Lg.id}_foot`;
  // hip cowl stays on the BODY; the hip ball rides the thigh
  lathe(H(Lg.parent), [
    P(0, 0, 'graphite', GRAPH), P(0.215, 0, 'patina', VERDI), P(0.215, 0.03, 'glaze', BONE),
    P(0.18, 0.10, 'glaze', BONE), P(0.10, 0.145, 'glaze', OXBLOOD), P(0, 0.16, 'glaze', OXBLOOD),
  ], at(Hp.x, HIP_Y + 0.11, Hp.z), { segs: 24, wear: 0.45 });
  ball(H(thigh), Hp, 0.10, { surf: 'graphite', tone: GRAPH });

  // knee hub axis: perpendicular to the leg plane
  const axle = new THREE.Vector3().crossVectors(K.clone().sub(Hp), A.clone().sub(K)).normalize();
  if (axle.x * s < 0) axle.negate();
  // thigh: graphite arm + ceramic armour over a verdigris under-plate + oxblood stripe
  const f1 = frameOn(Hp, K, s);
  const l1 = Hp.distanceTo(K);
  strut(H(thigh), Hp, K, 0.085, 0.07, { surf: 'graphite', tone: GRAPH, sides: 10 });
  const th = [[-0.085, 0.06], [0.085, 0.06], [0.065, l1 * 0.88], [-0.055, l1 * 0.84]];
  plate(H(thigh), th.map(([x, y]) => [x * 1.14, y - 0.01]), 0.012, 0.004,
    basis(f1.w, f1.d, f1.out, Hp.clone().addScaledVector(f1.out, 0.078)), { surf: 'patina', tone: VERDI, wear: 0.4 });
  plate(H(thigh), th, 0.032, 0.012,
    basis(f1.w, f1.d, f1.out, Hp.clone().addScaledVector(f1.out, 0.1)), { surf: 'glaze', tone: BONE, wear: 0.45 });
  plate(H(thigh), [[-0.02, 0.10], [0.02, 0.10], [0.02, l1 * 0.78], [-0.02, l1 * 0.78]], 0.006, 0.002,
    basis(f1.w, f1.d, f1.out, Hp.clone().addScaledVector(f1.out, 0.119)), { surf: 'glaze', tone: OXBLOOD, wear: 0.2 });
  // knee hub (thigh owns it; the shin pivots inside)
  strut(H(thigh), K.clone().addScaledVector(axle, -0.10), K.clone().addScaledVector(axle, 0.10), 0.095, 0.095,
    { surf: 'graphite', tone: GRAPH, sides: 16 });
  for (const e of [1, -1]) {
    strut(H(thigh), K.clone().addScaledVector(axle, e * 0.10), K.clone().addScaledVector(axle, e * 0.125), 0.075, 0.06,
      { surf: 'bronze', tone: BRONZE, sides: 16 });
  }

  // shin: ceramic sleeve over the upper third, graphite tube, chrome piston
  const f2 = frameOn(K, A, s);
  const P30 = K.clone().lerp(A, 0.32), P62 = K.clone().lerp(A, 0.62);
  strut(H(shin), K, P30, 0.072, 0.064, { surf: 'glaze', tone: BONE, sides: 12, wear: 0.4 });
  strut(H(shin), P30, P62, 0.056, 0.05, { surf: 'graphite', tone: GRAPH, sides: 10 });
  for (const q of [P30, P62]) {
    strut(H(shin), q.clone().addScaledVector(f2.d, -0.02), q.clone().addScaledVector(f2.d, 0.025), 0.068, 0.064,
      { surf: 'bronze', tone: BRONZE, sides: 12 });
  }
  strut(H(shin), K.clone().lerp(A, 0.58), A, 0.03, 0.03, { surf: 'chrome', tone: CHROME, sides: 10 });
  plate(H(shin), [[-0.03, 0.10], [0.03, 0.10], [0.022, 0.48], [-0.022, 0.46]], 0.012, 0.005,
    basis(f2.w, f2.d, f2.out, K.clone().addScaledVector(f2.out, 0.068)), { surf: 'glaze', tone: OXBLOOD, wear: 0.5 });

  // foot: ankle ball, pin, rubber disc pad, three bronze toes + heel spur
  ball(H(foot), A, 0.058, { surf: 'graphite', tone: GRAPH });
  const PAD = V(A.x, 0, A.z + 0.03);
  strut(H(foot), A, V(PAD.x, 0.085, PAD.z), 0.04, 0.05, { surf: 'graphite', tone: GRAPH, sides: 10 });
  lathe(H(foot), [
    P(0, 0, 'rubber', RUBBER), P(0.15, 0, 'rubber', RUBBER), P(0.16, 0.03, 'bronze', BRONZE),
    P(0.14, 0.07, 'bronze', BRONZE), P(0.07, 0.095, 'graphite', GRAPH), P(0, 0.10, 'graphite', GRAPH),
  ], at(PAD.x, PAD.y, PAD.z), { segs: 20, wear: 0.5 });
  for (const ang of [-0.75, 0, 0.75, Math.PI]) {
    const dir = V(Math.sin(ang), 0, Math.cos(ang));
    const c = PAD.clone().addScaledVector(dir, ang === Math.PI ? 0.15 : 0.17).add(V(0, 0.035, 0));
    rbox(H(foot), c, [0.05, 0.05, ang === Math.PI ? 0.06 : 0.09], 0.015,
      { surf: 'bronze', tone: BRONZE, wear: 0.7, rot: [0, ang, 0] });
  }
}

/* ---------------------------- finishing passes --------------------------- */
// grime: dust and soil climb the legs; the body underside is darker
const sm = THREE.MathUtils.smoothstep;
for (const b of hull.values()) {
  b.shade((x, y) => 0.56 + 0.44 * sm(y, 0.0, 1.1));
}

/* ------------------------------ recentre --------------------------------- */
const box = new THREE.Box3();
for (const b of [...hull.values(), ...lamp.values()]) b.bounds(box);
const cz = (box.min.z + box.max.z) / 2;
const cx = (box.min.x + box.max.x) / 2;
for (const b of [...hull.values(), ...lamp.values()]) b.translate(-cx, -box.min.y, -cz);
const shift = (v) => [+(v.x - cx).toFixed(4), +(v.y - box.min.y).toFixed(4), +(v.z - cz).toFixed(4)];
const size = box.getSize(new THREE.Vector3());

/* ------------------------------ rig spec --------------------------------- */
const rigSpec = {
  spine: [
    { name: 'pelvis', pos: shift(V(0, AXIS_Y, -1.08)), r: 0.95 },
    { name: 'chest', pos: shift(V(0, AXIS_Y, 0.295)), r: 0.75 },
    { name: 'neck', pos: shift(NECK), r: 0.42 },
    { name: 'head', pos: shift(DRUM), r: 0.45, tip: shift(V(0, DRUM.y, DRUM.z + 0.45)) },
  ],
  tail: [
    { name: 'tail1', pos: shift(TAIL0), r: 0.32 },
    { name: 'tail2', pos: shift(TAIL1), r: 0.28 },
  ],
  legGateY: +(HIP_Y + 0.42 - box.min.y).toFixed(4),   // above the knees (capsule baseline only)
  legInboard: 0.48,
  legs: LEGS.map((Lg) => ({
    id: Lg.id, parent: Lg.parent, hinge: Lg.hinge,
    hip: shift(Lg.hip), knee: shift(Lg.knee), ankle: shift(Lg.ankle), toe: shift(Lg.toe),
    r: 0.25, restFoot: [shift(Lg.ankle)[0], shift(Lg.ankle)[2]],
  })),
};
// autorig's boneList order: spine..., tail..., then (thigh, shin, foot) per leg
const BONE_ORDER = [
  ...rigSpec.spine.map((s) => s.name), ...rigSpec.tail.map((s) => s.name),
  ...rigSpec.legs.flatMap((l) => [`${l.id}_thigh`, `${l.id}_shin`, `${l.id}_foot`]),
];

/* ---------------------- merge per material, label bones ----------------- */
function mergeLabelled(map, name) {
  const out = new Bucket(name);
  const labels = [];
  for (const [bone, b] of map) {
    const idx = BONE_ORDER.indexOf(bone);
    if (idx < 0) throw new Error(`bone ${bone} not in rig spec`);
    out.pos.push(...b.pos); out.nor.push(...b.nor); out.col.push(...b.col); out.uv.push(...b.uv);
    for (let i = 0; i < b.pos.length / 3; i++) labels.push(idx);
  }
  out.labels = labels;
  return out;
}
const hullAll = mergeLabelled(hull, 'tiller-hull');
const lampAll = mergeLabelled(lamp, 'tiller-sensor');

const TGEN = performance.now();
const stats = await writeGLB([
  { bucket: hullAll, material: { name: 'r5-tiller-hull' } },
  { bucket: lampAll, material: { name: 'r5-tiller-sensor-lens', emissive: [1.0, 0.78, 0.45], baseColor: [0.02, 0.015, 0.01, 1] } },
], {
  file: OUT_GLB,
  labels: true,
  extras: {
    r5Rig: rigSpec, r5BoneOrder: BONE_ORDER,
    r5Size: [+size.x.toFixed(4), +size.y.toFixed(4), +size.z.toFixed(4)],
    r5Sockets: {
      lens: shift(V(DRUM.x, DRUM.y, DRUM.z + 0.24)),
      lantern: shift(V(HOP.x, HOP.y + 0.24, HOP.z)),
      hopper: shift(V(HOP.x, HOP.y + 0.1, HOP.z)),
      auger: shift(TIP),
    },
    r5Generator: { name: 'tools/r5-poc/gen-creature.mjs', design: 'tiller', licence: 'original work (generated), no third-party assets' },
  },
});
const T1 = performance.now();

const out = {
  kind: 'r5-tiller', file: 'public/models/r5-poc/tiller.glb',
  bytes: stats.bytes, kb: +(stats.bytes / 1024).toFixed(1),
  tris: stats.tris, verts: stats.verts, materials: stats.materials, textures: stats.textures,
  bones: BONE_ORDER.length, legs: LEGS.length,
  size: { x: +size.x.toFixed(3), y: +size.y.toFixed(3), z: +size.z.toFixed(3) },
  genMs: { build: +(TGEN - T0).toFixed(1), write: +(T1 - TGEN).toFixed(1), total: +(T1 - T0).toFixed(1) },
  rig: rigSpec,
};
mkdirSync(fileURLToPath(new URL('./out/', import.meta.url)), { recursive: true });
writeFileSync(OUT_STATS, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ...out, rig: undefined }, null, 1));
