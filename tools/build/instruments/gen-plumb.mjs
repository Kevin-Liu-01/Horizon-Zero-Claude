#!/usr/bin/env node
/**
 * CALIMA — the PLUMB generator (instruments-a, W1; bible §7.4 #2). Original
 * work: no third-party asset is read.
 *
 *   node tools/build/instruments/gen-plumb.mjs [--out <dir>] [--scale <k>]
 *     -> public/models/instruments/plumb.glb   (hull + sensor; a small kind ships no LOD1: ROUND5-LOOK I-04 gives it cascade 0 only)
 *
 * THE WALKING THEODOLITE (small; the sentry, role `sentry`). Three long staff
 * legs painted as levelling staffs (vermilion / staff-white E pattern, black
 * 1 cm ticks through the shared decal atlas) meet in bronze clevises at a
 * bronze tripod head with a tribrach and three levelling screws; a celadon
 * lamp drum on a short mast turns 360 degrees (the gait's head look); two
 * bronze standards carry the sighting telescope on its trunnion, a graduated
 * vertical circle, and on top the glowing LEVEL VIAL (its weak point: two hits
 * and it cannot find level, so it topples); a bronze plumb bob hangs from the
 * head on 1.2 m of cable — a 2-bone tail the kind file swings as a pendulum.
 * Bible size 2.4 x 2.4 x 3.4 m, <= 15 k tris, <= 18 bones (14 here). The bob is
 * a TOOL (bible §7.3: Pry tears it off; no melee after): its own unlabelled node
 * `plumb-bob`, mounted by the kind file on the `tail2` bone as a component.
 *
 * THE `scale` PARAM (bible: "the same generator at scale 3x and 6.5x walks
 * hull-hidden before the Transit exists"). Every length the generator writes —
 * geometry, rig spec, sockets, r5Size — is multiplied by `scale` at the end,
 * and nothing else depends on it, so a Plumb at scale k is exactly the scale-1
 * Plumb scaled by k. The runtime applies the same param through
 * `src/instruments/kinds/plumb.js` (`opts.scale`), using `scaleRig` from the
 * shared kit, so `A-plumb-scale` grades the generator's own rig at 3 and 6.5
 * without shipping two more GLBs. `--scale` writes a scaled file for review.
 *
 * Space: metres, +Y up, +Z forward (the front leg points down +Z; the lamp
 * looks forward), y = 0 at the feet.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { V, strut, ball, rbox, torus, cable, plate, lathe, basis, at, AXIS_Z, AXIS_X } from '../lib/hs.mjs';
import {
  THREE, C, KBucket, mergeLabelled, finish, lod1From, writeInstrument, solveKnee, scaleRig,
  BAND, bandV, wrapDecal, ringDecal, numeralUV,
} from './parts/kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const LANE = 'instruments-a';
export const RECIPE = 'tools/build/instruments/gen-plumb.mjs';
export const OUTPUTS = ['public/models/instruments/plumb.glb'];

/** Design constants the kind file mirrors (scale 1). */
export const PLUMB = Object.freeze({
  headY: 2.28, mastTop: 2.66, drumY: 2.90, drumR: 0.26, lampR: 0.19,
  vialY: 3.28, bobTopY: 1.08, legSpreadR: 1.24,
});

export async function build({ out = ROOT, scale = 1, file = null } = {}) {
  const P = (r, h, surf, tone) => ({ r, h, surf, tone });
  const BONES = [];
  const hull = new Map(), lamp = new Map();
  const H = (b) => { if (!hull.has(b)) { hull.set(b, new KBucket(`hull:${b}`)); if (!BONES.includes(b)) BONES.push(b); } return hull.get(b); };
  const L = (b) => { if (!lamp.has(b)) { lamp.set(b, new KBucket(`lamp:${b}`)); if (!BONES.includes(b)) BONES.push(b); } return lamp.get(b); };
  const { headY: HEAD_Y, drumY: DRUM_Y, drumR: DRUM_R } = PLUMB;

  /* ----------------------------- tripod head ------------------------------ */
  // the head plate: bronze, a graphite underside cone the bob cable leaves from
  lathe(H('pelvis'), [
    P(0, -0.20, 'graphite', C.GRAPH), P(0.05, -0.20, 'graphite', C.GRAPH), P(0.12, -0.12, 'graphite', C.GRAPH),
    P(0.22, -0.06, 'bronze', C.BRONZE), P(0.31, -0.03, 'bronze', C.BRONZE), P(0.32, 0.00, 'bronze', C.BRONZE),
    P(0.31, 0.04, 'patina', C.VERDI), P(0.27, 0.06, 'bronze', C.BRONZE), P(0.20, 0.07, 'graphite', C.GRAPH),
    P(0.20, 0.10, 'bronze', C.BRONZE), P(0, 0.10, 'bronze', C.BRONZE),
  ], at(0, HEAD_Y, 0), { segs: 36, wear: 0.5, crease: 30 });
  // the tribrach: a triangular bronze plate with a levelling screw at each corner (knurled graphite knob)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
    const x = Math.sin(a) * 0.17, z = Math.cos(a) * 0.17;
    strut(H('pelvis'), V(x, HEAD_Y + 0.10, z), V(x, HEAD_Y + 0.20, z), 0.018, 0.018, { surf: 'bronze', tone: C.BRONZE, sides: 8 });
    strut(H('pelvis'), V(x, HEAD_Y + 0.115, z), V(x, HEAD_Y + 0.15, z), 0.042, 0.042, { surf: 'graphite', tone: C.GRAPH, sides: 12, wear: 0.6 });
  }
  plate(H('pelvis'), [[0, 0.22], [0.19, -0.11], [-0.19, -0.11]], 0.03, 0.01,
    basis(V(1, 0, 0), V(0, 0, -1), V(0, 1, 0), V(0, HEAD_Y + 0.215, 0)), { surf: 'bronze', tone: C.BRONZE, wear: 0.6 });
  // three clevis lugs on the rim; the legs hang from their pins
  const LEG_AZ = [['MF', 0, 1], ['LH', -2 * Math.PI / 3, -1], ['RH', 2 * Math.PI / 3, -1]];
  for (const [, a] of LEG_AZ) {
    const out_ = V(Math.sin(a), 0, Math.cos(a)), tan = V(Math.cos(a), 0, -Math.sin(a));
    const c = V(0, HEAD_Y - 0.02, 0).addScaledVector(out_, 0.29);
    for (const s of [-1, 1]) {
      rbox(H('pelvis'), V(0, 0, 0), [0.022, 0.12, 0.11], 0.008,
        { surf: 'bronze', tone: C.BRONZE, wear: 0.6, matrix: basis(tan, V(0, 1, 0), out_, c.clone().addScaledVector(tan, s * 0.055)) });
    }
  }

  /* ---------------------------------- legs --------------------------------- */
  const L1 = 0.70, L2 = 1.74;   // chord 2.35 m: the knee sits just proud of the staff line
  const LEGS = [];
  for (const [id, a, hinge] of LEG_AZ) {
    const out_ = V(Math.sin(a), 0, Math.cos(a));
    const hip = V(0, HEAD_Y - 0.05, 0).addScaledVector(out_, 0.29);
    const ankle = V(0, 0.10, 0).addScaledVector(out_, PLUMB.legSpreadR);
    const knee = solveKnee(hip, ankle, hinge, L1, L2);
    const toe = ankle.clone().add(V(0, -0.09, 0)).addScaledVector(out_, 0.06);
    LEGS.push({ id, a, hinge, hip, knee, ankle, toe, out: out_ });
  }
  for (const Lg of LEGS) {
    const thigh = `${Lg.id}_thigh`, shin = `${Lg.id}_shin`, foot = `${Lg.id}_foot`;
    const tan = V(Math.cos(Lg.a), 0, -Math.sin(Lg.a));
    // the clevis pin (thigh owns it)
    strut(H(thigh), Lg.hip.clone().addScaledVector(tan, -0.085), Lg.hip.clone().addScaledVector(tan, 0.085), 0.022, 0.022,
      { surf: 'graphite', tone: C.GRAPH, sides: 10 });
    // upper section: twin cheeks (a survey tripod's double rail), staff white with a vermilion band, bronze-capped
    const d1 = Lg.knee.clone().sub(Lg.hip);
    const len1 = d1.length(); d1.normalize();
    const { x: tx, z: w } = frameY(d1, tan);
    for (const s of [-1, 1]) {
      const c = Lg.hip.clone().addScaledVector(d1, len1 * 0.5).addScaledVector(tx, s * 0.035);
      const M = basis(tx, d1, w, c);
      rbox(H(thigh), V(0, 0, 0), [0.03, len1 * 0.92, 0.05], 0.009, { surf: 'glaze', tone: C.STAFF, wear: 0.3, matrix: M, segs: 1 });
      // one vermilion band per cheek (geometry: a box has no vertices mid-length for a decal to land on)
      rbox(H(thigh), V(0, len1 * 0.2, 0), [0.034, len1 * 0.14, 0.054], 0.008, { surf: 'glaze', tone: C.VERM, wear: 0.2, matrix: M, segs: 1 });
    }
    for (const f of [0.08, 0.93]) {
      const c = Lg.hip.clone().addScaledVector(d1, len1 * f);
      rbox(H(thigh), V(0, 0, 0), [0.115, 0.06, 0.065], 0.012, { surf: 'bronze', tone: C.BRONZE, wear: 0.7, matrix: basis(tx, d1, w, c) });
    }
    // the knee: a bronze clamp collar with a wing screw (sagittal pin)
    strut(H(thigh), Lg.knee.clone().addScaledVector(tan, -0.07), Lg.knee.clone().addScaledVector(tan, 0.07), 0.045, 0.045,
      { surf: 'graphite', tone: C.GRAPH, sides: 12 });
    const ws = Lg.knee.clone().addScaledVector(w, 0.06);
    strut(H(thigh), Lg.knee, ws, 0.012, 0.012, { surf: 'bronze', tone: C.BRONZE, sides: 6 });
    { const f = frameY(w, tan); plate(H(thigh), [[-0.05, -0.015], [0.05, -0.015], [0.04, 0.015], [-0.04, 0.015]], 0.012, 0.003,
      basis(f.x, f.y, f.z, ws), { surf: 'bronze', tone: C.BRONZE, wear: 0.6 }); }
    // the shin: the levelling staff (octagonal, staff white x the E-pattern decal), a bronze sliding collar
    const d2 = Lg.ankle.clone().sub(Lg.knee);
    const len2 = d2.length(); d2.normalize();
    const s0 = Lg.knee.clone().addScaledVector(d2, 0.03), s1 = Lg.knee.clone().addScaledVector(d2, len2 * 0.86);
    {
      const { m: M } = alongY(s0, s1);
      const mk = H(shin).mark();
      strut(H(shin), s0, s1, 0.042, 0.033, { surf: 'glaze', tone: C.STAFF, sides: 8, wear: 0.25 });
      H(shin).decalSince(mk, { frame: M, fn: (p) => [((p.y + s0.distanceTo(s1) / 2) / 0.4), bandV(BAND.staff, ((((Math.atan2(p.x, p.z) / (2 * Math.PI) + 0.5 + Lg.a / (2 * Math.PI)) % 1) + 1) % 1) * 0.95 + 0.02)] });
    }
    for (const f of [0.0, 0.42]) {
      const c = Lg.knee.clone().addScaledVector(d2, len2 * f + 0.02);
      strut(H(shin), c, c.clone().addScaledVector(d2, 0.06), 0.05, 0.048, { surf: 'bronze', tone: C.BRONZE, sides: 10, wear: 0.6 });
    }
    // the shoe: bronze ferrule, a steel point and a graphite disc pad (foot owns it)
    const fa = Lg.ankle;
    strut(H(shin), s1, fa.clone().addScaledVector(d2, -0.02), 0.034, 0.03, { surf: 'bronze', tone: C.BRONZE, sides: 10, wear: 0.6 });
    ball(H(foot), fa, 0.04, { surf: 'graphite', tone: C.GRAPH });
    const pad = V(fa.x, 0, fa.z).addScaledVector(Lg.out, 0.03);
    lathe(H(foot), [
      P(0, 0, 'rubber', C.RUBBER), P(0.085, 0, 'rubber', C.RUBBER), P(0.09, 0.02, 'bronze', C.BRONZE),
      P(0.06, 0.05, 'bronze', C.BRONZE), P(0.03, 0.06, 'graphite', C.GRAPH), P(0, 0.065, 'graphite', C.GRAPH),
    ], at(pad.x, pad.y, pad.z), { segs: 16, wear: 0.6 });
    strut(H(foot), fa, V(pad.x, 0.055, pad.z), 0.03, 0.025, { surf: 'graphite', tone: C.GRAPH, sides: 8 });
    // the spur: a steel point behind the pad (the staff's shoe)
    strut(H(foot), V(pad.x, 0.05, pad.z).addScaledVector(Lg.out, 0.05), V(pad.x, 0.0, pad.z).addScaledVector(Lg.out, 0.12), 0.016, 0.004,
      { surf: 'graphite', tone: C.CHROME, sides: 6 });
  }

  /* ------------------------------ mast + drum ------------------------------ */
  strut(H('neck'), V(0, HEAD_Y + 0.21, 0), V(0, PLUMB.mastTop, 0), 0.062, 0.055, { surf: 'graphite', tone: C.GRAPH, sides: 16 });
  torus(H('neck'), V(0, HEAD_Y + 0.30, 0), 0.068, 0.014, 'y', { surf: 'bronze', tone: C.BRONZE, tube: 6, radial: 20 });
  // the horizontal circle under the drum: a bronze disc engraved with the vernier (uv1)
  {
    const M = at(0, PLUMB.mastTop - 0.02, 0);
    const mk = H('head').mark();
    lathe(H('head'), [
      P(0, 0, 'graphite', C.GRAPH), P(0.29, 0, 'bronze', C.BRONZE), P(0.30, 0.025, 'bronze', C.BRONZE),
      P(0.27, 0.04, 'bronze', C.BRONZE), P(0, 0.04, 'bronze', C.BRONZE),
    ], M, { segs: 48, wear: 0.4, crease: 25 });
    H('head').decalSince(mk, { frame: M, uPeriod: 8, fn: (p) => (p.y > 0.003 && Math.hypot(p.x, p.z) > 0.26 ? [(Math.atan2(p.x, p.z) / (2 * Math.PI) + 0.5) * 8, bandV(BAND.vernier, 0.35)] : null) });
  }
  // the lamp drum: celadon glaze over bronze, an oxblood band, panel seams; the lamp face sits in its front
  const D0 = DRUM_Y - 0.21, D1 = DRUM_Y + 0.21;
  lathe(H('head'), [
    P(0, 0, 'graphite', C.GRAPH), P(DRUM_R - 0.03, 0, 'bronze', C.BRONZE), P(DRUM_R, 0.03, 'glaze', C.CELADON),
    P(DRUM_R + 0.005, 0.12, 'glaze', C.CELADON), P(DRUM_R + 0.005, 0.135, 'glaze', C.OXBLOOD), P(DRUM_R + 0.005, 0.175, 'glaze', C.OXBLOOD),
    P(DRUM_R + 0.005, 0.19, 'glaze', C.CELADON), P(DRUM_R, 0.39, 'glaze', C.CELADON), P(DRUM_R - 0.02, 0.42, 'bronze', C.BRONZE),
    P(0.12, 0.43, 'bronze', C.BRONZE), P(0, 0.43, 'graphite', C.GRAPH),
  ], at(0, D0, 0), { segs: 40, panels: 4, gap: 1.8, wear: 0.45, phiStart: Math.PI / 4 });
  lathe(H('head'), [P(DRUM_R - 0.02, 0, 'graphite', C.GRAPH), P(DRUM_R - 0.02, 0.42, 'graphite', C.GRAPH)], at(0, D0, 0), { segs: 20, wear: 0.1 });
  // the hood over the lamp: a bronze visor plate
  plate(H('head'), [[-0.2, 0], [0.2, 0], [0.16, 0.12], [-0.16, 0.12]], 0.015, 0.005,
    basis(V(1, 0, 0), V(0, 0.35, 1).normalize(), V(0, 1, -0.35).normalize(), V(0, D1 - 0.03, DRUM_R - 0.02)), { surf: 'bronze', tone: C.BRONZE, wear: 0.6 });
  // a serial on the drum's back: "06" engraved in brass (the decal numerals)
  for (const [k, dgt] of [[-1, 0], [1, 6]]) {
    const c = V(k * 0.045, DRUM_Y + 0.02, -DRUM_R - 0.006);
    const M = basis(V(-1, 0, 0), V(0, 1, 0), V(0, 0, -1), c);
    const mk = H('head').mark();
    plate(H('head'), [[-0.035, -0.05], [0.035, -0.05], [0.035, 0.05], [-0.035, 0.05]], 0.006, 0.0, M, { surf: 'bronze', tone: C.STAFF, wear: 0.1 });
    H('head').decalSince(mk, { frame: M, fn: (p) => numeralUV(dgt, (p.x + 0.035) / 0.07, 1 - (p.y + 0.05) / 0.1) });
  }
  // the standards: two bronze uprights carrying the telescope trunnion
  const STD_Y0 = D1, STD_Y1 = D1 + 0.17;
  for (const s of [-1, 1]) {
    plate(H('head'), [[-0.06, 0], [0.06, 0], [0.03, 0.2], [-0.03, 0.2]], 0.025, 0.006,
      basis(V(0, 0, 1), V(0, 1, 0), V(s, 0, 0), V(s * 0.17, STD_Y0 - 0.01, 0)), { surf: 'bronze', tone: C.BRONZE, wear: 0.6 });
  }
  strut(H('head'), V(-0.19, STD_Y1, 0), V(0.19, STD_Y1, 0), 0.022, 0.022, { surf: 'graphite', tone: C.GRAPH, sides: 10 });
  // the vertical circle on the right standard (vernier engraved)
  {
    const M = at(0.20, STD_Y1, 0, AXIS_X.clone());
    const mk = H('head').mark();
    lathe(H('head'), [P(0, 0, 'graphite', C.GRAPH), P(0.12, 0, 'bronze', C.BRONZE), P(0.125, 0.02, 'bronze', C.BRONZE), P(0, 0.02, 'bronze', C.BRONZE)], M, { segs: 32, wear: 0.4 });
    H('head').decalSince(mk, { frame: M, uPeriod: 4, fn: (p) => (Math.hypot(p.x, p.z) > 0.09 ? [(Math.atan2(p.x, p.z) / (2 * Math.PI) + 0.5) * 4, bandV(BAND.vernier, 0.3)] : null) });
  }
  // the telescope: graphite tube, bronze objective + eyepiece rings, on the trunnion
  strut(H('head'), V(0, STD_Y1, -0.28), V(0, STD_Y1, 0.30), 0.042, 0.052, { surf: 'graphite', tone: C.GRAPH, sides: 16 });
  for (const z of [-0.28, 0.0, 0.27]) strut(H('head'), V(0, STD_Y1, z), V(0, STD_Y1, z + 0.035), 0.058, 0.058, { surf: 'bronze', tone: C.BRONZE, sides: 16, wear: 0.6 });
  ball(L('head'), V(0, STD_Y1, 0.31), 0.04, { surf: 'lamp', tone: C.LAMP, w: 12, h: 8 });
  // THE LEVEL VIAL: a glass tube in a bronze cradle across the top — the joint weak point, glowing
  const VY = PLUMB.vialY;
  for (const s of [-1, 1]) {
    strut(H('head'), V(s * 0.15, STD_Y1 + 0.03, 0), V(s * 0.15, VY, 0), 0.016, 0.016, { surf: 'bronze', tone: C.BRONZE, sides: 8 });
    strut(H('head'), V(s * 0.205, VY, 0), V(s * 0.17, VY, 0), 0.062, 0.062, { surf: 'bronze', tone: C.BRONZE, sides: 16, wear: 0.6 });
  }
  rbox(H('head'), V(0, VY - 0.06, 0), [0.40, 0.025, 0.09], 0.008, { surf: 'bronze', tone: C.BRONZE, wear: 0.6 });
  strut(L('head'), V(-0.17, VY, 0), V(0.17, VY, 0), 0.05, 0.05, { surf: 'lamp', tone: C.LAMP, sides: 16 });
  // graduation rings on the vial (graphite hairlines)
  for (const x of [-0.04, 0.04]) torus(H('head'), V(x, VY, 0), 0.052, 0.005, 'x', { surf: 'graphite', tone: C.GRAPH, tube: 4, radial: 16 });

  /* --------------------------------- the bob ------------------------------- */
  const T0 = V(0, HEAD_Y - 0.20, 0), T1 = V(0, HEAD_Y - 0.80, 0), BOB = V(0, PLUMB.bobTopY, 0);
  cable(H('tail1'), [T0, V(0, (T0.y + T1.y) / 2, 0.001), T1], 0.009, { surf: 'graphite', tone: C.GRAPH, segs: 4, radial: 5 });
  cable(H('tail2'), [T1, V(0, (T1.y + BOB.y) / 2, 0.001), BOB.clone().add(V(0, 0.03, 0))], 0.009, { surf: 'graphite', tone: C.GRAPH, segs: 4, radial: 5 });
  const bob = new KBucket('plumb-bob');
  lathe(bob, [
    P(0, -0.40, 'graphite', C.CHROME), P(0.012, -0.38, 'bronze', C.BRONZE), P(0.07, -0.25, 'bronze', C.BRONZE),
    P(0.125, -0.12, 'bronze', C.BRONZE), P(0.13, -0.08, 'glaze', C.OXBLOOD), P(0.13, -0.05, 'bronze', C.BRONZE),
    P(0.10, 0.0, 'bronze', C.BRONZE), P(0.04, 0.02, 'patina', C.VERDI), P(0.03, 0.04, 'bronze', C.BRONZE), P(0, 0.045, 'bronze', C.BRONZE),
  ], at(BOB.x, BOB.y, BOB.z), { segs: 24, wear: 0.6, crease: 30 });

  /* ------------------------------- recentre -------------------------------- */
  const all = [...hull.values(), ...lamp.values(), bob];
  const box = new THREE.Box3();
  for (const b of all) b.bounds(box);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, y0 = box.min.y;
  for (const b of all) b.translate(-cx, -y0, -cz);
  const sh = (v) => [+(v.x - cx).toFixed(4), +(v.y - y0).toFixed(4), +(v.z - cz).toFixed(4)];
  const size = box.getSize(new THREE.Vector3());

  const rigSpec = {
    spine: [
      { name: 'pelvis', pos: sh(V(0, HEAD_Y, 0)), r: 0.40 },
      { name: 'neck', pos: sh(V(0, HEAD_Y + 0.22, 0)), r: 0.12 },
      { name: 'head', pos: sh(V(0, DRUM_Y, 0)), r: 0.42, tip: sh(V(0, DRUM_Y, 0.45)) },
    ],
    tail: [
      { name: 'tail1', pos: sh(T0), r: 0.08 },
      { name: 'tail2', pos: sh(T1), r: 0.16 },
    ],
    legGateY: +(HEAD_Y - 0.10 - y0).toFixed(4),
    legInboard: 0.18,
    legs: LEGS.map((Lg) => ({
      id: Lg.id, parent: 'pelvis', hinge: Lg.hinge,
      hip: sh(Lg.hip), knee: sh(Lg.knee), ankle: sh(Lg.ankle), toe: sh(Lg.toe),
      r: 0.14, restFoot: [sh(Lg.ankle)[0], sh(Lg.ankle)[2]],
    })),
  };
  const BONE_ORDER = [
    ...rigSpec.spine.map((s) => s.name), ...rigSpec.tail.map((s) => s.name),
    ...rigSpec.legs.flatMap((l) => [`${l.id}_thigh`, `${l.id}_shin`, `${l.id}_foot`]),
  ];
  const LAMP_AT = sh(V(0, DRUM_Y, DRUM_R + 0.012));
  const sockets = {
    lens: LAMP_AT,
    vial: sh(V(0, VY, 0)),
    bob: sh(V(0, BOB.y - 0.15, 0)),
    bobTop: sh(BOB),
    drum: sh(V(0, DRUM_Y, 0)),
    head: sh(V(0, HEAD_Y, 0)),
  };

  const hullAll = mergeLabelled(hull, BONE_ORDER, 'plumb-hull');
  const lampAll = mergeLabelled(lamp, BONE_ORDER, 'plumb-sensor');
  const fin = finish(hullAll, {
    occluders: [lampAll, bob], rays: 28, dist: 0.4, footBand: 0.6,
    lamps: [{ at: LAMP_AT, r: PLUMB.lampR }, { at: sockets.vial, r: 0.06 }],
  });
  finish(bob, { occluders: [hullAll], rays: 28, dist: 0.4, footBand: 0.6 });

  // the scale param: one multiply over every length written (see the header)
  let rig = rigSpec, sk = sockets, sz = size;
  if (scale !== 1) {
    for (const b of [hullAll, lampAll, bob]) b.scale(scale);
    rig = scaleRig(rigSpec, scale);
    sk = Object.fromEntries(Object.entries(sockets).map(([k, v]) => [k, v.map((x) => +(x * scale).toFixed(4))]));
    sz = size.clone().multiplyScalar(scale);
  }

  const target = file || path.join(out, OUTPUTS[0]);
  const stats = await writeInstrument([
    { bucket: hullAll, role: 'hull', material: { name: 'r5-plumb-hull' } },
    { bucket: lampAll, role: 'sensor', material: { name: 'r5-plumb-sensor-lens', emissive: [0.95, 1.0, 0.62], baseColor: [0.02, 0.02, 0.012, 1] } },
    { bucket: bob, role: 'tool', material: { name: 'r5-plumb-hull', anchor: sk.bobTop } },
  ], {
    file: target,
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    extras: {
      r5Rig: rig, r5BoneOrder: BONE_ORDER,
      r5Size: [+sz.x.toFixed(4), +sz.y.toFixed(4), +sz.z.toFixed(4)],
      r5Sockets: sk, r5Scale: scale,
      r5Generator: { name: RECIPE, design: 'plumb', scale, licence: 'original work (generated), no third-party assets' },
    },
  });
  return {
    kind: 'plumb', file: path.relative(out, target), bytes: stats.bytes, tris: stats.tris, meshTris: stats.meshTris, verts: stats.verts,
    materials: stats.materials, textures: stats.textures, bones: BONE_ORDER.length, legs: LEGS.length, aoMean: +fin.aoMean.toFixed(3),
    size: { x: +sz.x.toFixed(3), y: +sz.y.toFixed(3), z: +sz.z.toFixed(3) },
  };
}

/** An orthonormal frame whose +Y is `d` and whose +X leans toward `hint` (x × y = z). */
function frameY(d, hint) {
  const y = d.clone().normalize();
  const x = hint.clone().addScaledVector(y, -hint.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  return { x, y, z };
}

/** local alongY without importing hs internals twice */
function alongY(a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  return { m: new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)), len: d.length() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  const outDir = arg('--out') ? path.resolve(arg('--out')) : ROOT;
  const scale = arg('--scale') ? +arg('--scale') : 1;
  const file = scale !== 1 ? path.join(outDir, `plumb-s${scale}.glb`) : null;
  console.log(JSON.stringify(await build({ out: outDir, scale, file })));
}
