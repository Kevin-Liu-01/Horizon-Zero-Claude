#!/usr/bin/env node
/**
 * CALIMA — the PLUMB generator (instruments; BIBLE §7.4 #2, BUILD M1.4c). Original work: no third-party asset is
 * read. Built from the shared hull kit (`parts/kit.mjs`, M1.4a).
 *
 *   node tools/build/instruments/gen-plumb.mjs [--out <dir>] [--scale <k>]
 *     -> public/models/instruments/plumb.glb   (hull + vial glass + two tools: the bob and the lamp drum)
 *
 * THE SENTRY, 3.4 m. Three long graduated staff legs (white enamel, thin vermilion and white graduations and black
 * ticks as flat ink) hang from gunmetal clevises under a brass tripod head with a tribrach and levelling screws. A
 * short gunmetal mast carries the head: a GYROSCOPE SPHERE of six white-enamel lune plates riveted over a gunmetal
 * core, girdled by a brass equatorial ring (vernier engraved, enamel flange tabs, two side wings) and crossed by two
 * brass gyroscope rings on gunmetal pivots. The LAMP DRUM sits in the ring's front opening (an enamel barrel, a
 * brass bezel with its vernier, the iris at its face; a sighting telescope and the limb circle beside it: never a
 * lens on a neck). On top, in a brass cradle, the LEVEL VIAL: a 0.30 m pale-ice glass tube with a bubble, the
 * weak point (two hits and it cannot find level: it topples). Two antennae with spike finials rise behind it to
 * 3.40 m. A brass PLUMB BOB hangs from the tripod head on 1.2 m of cable (a 2-bone tail the kind file swings). A
 * small faded orchil banner hangs at the back. The dust band is the kit's lowest 0.6 m.
 *
 * Tools (BIBLE §7.3 "Tool ... Pry tears it off"): the bob (`plumb-bob`, on `tail2`) and the lamp drum
 * (`plumb-drum`, on `head`; torn off, the Plumb has no lamp and cannot Flag). Each is its own unlabelled node.
 *
 * THE `scale` PARAM: every length written (geometry, rig, sockets, r5Size) is multiplied by `scale` at the end, so
 * a Plumb at scale k is the scale-1 Plumb scaled by k; the runtime applies the same through `scaleRig`.
 *
 * Space: metres, +Y up, +Z forward (the front leg and the lamp look down +Z), y = 0 at the feet.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { V, strut, ball, rbox, torus, cable, plate, lathe, basis, at } from '../lib/hs.mjs';
import {
  THREE, C, KBucket, mergeLabelled, finish, writeInstrument, solveKnee, scaleRig, numeralUV,
  resetKitStats, rivet, rivetRing, enamelSphere, limbRing, gyroRing, lampDrum, levelVial, staff, antenna, banner,
} from './parts/kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const LANE = 'instruments';
export const RECIPE = 'tools/build/instruments/gen-plumb.mjs';
export const OUTPUTS = ['public/models/instruments/plumb.glb'];

/** Design constants (scale 1). */
export const PLUMB = Object.freeze({
  headY: 1.90,          // top of the tripod head plate
  sphereY: 2.48, sphereR: 0.42,
  ringIn: 0.425, ringOut: 0.55,
  // the lamp drum rides OUTBOARD on the ring's right trunnion, off the sphere's axis (M1.4a fix 1: a round lit lens
  // centred on the white sphere read as one eye from the front; IP-PRIVATE §P2 bans faces)
  drumX: 0.80, drumY: 0.03, drumBackZ: -0.07, drumR: 0.19, drumDepth: 0.19,
  vialY: 3.21, vialLen: 0.30, vialR: 0.045,
  top: 3.40,
  // fix 1: the bob hangs on a short cable so it shows above the meadow (on 1.2 m it hung at 0.1-0.5 m, in the grass)
  cable: 0.30, bobLen: 0.44, bobR: 1.25,
  legSpreadR: 1.20,
});

export async function build({ out = ROOT, scale = 1, file = null, noDust = false } = {}) {
  resetKitStats();
  const P = (r, h, surf, tone) => ({ r, h, surf, tone });
  const BONES = [];
  const hull = new Map(), glass = new Map();
  const H = (b) => { if (!hull.has(b)) { hull.set(b, new KBucket(`hull:${b}`)); if (!BONES.includes(b)) BONES.push(b); } return hull.get(b); };
  const G = (b) => { if (!glass.has(b)) { glass.set(b, new KBucket(`glass:${b}`)); if (!BONES.includes(b)) BONES.push(b); } return glass.get(b); };
  const { headY: HEAD_Y, sphereY: SY, sphereR: SR } = PLUMB;
  const SC = V(0, SY, 0);

  /* ----------------------------- tripod head ------------------------------ */
  lathe(H('pelvis'), [
    P(0, -0.18, 'graphite', C.GUNMETAL), P(0.05, -0.18, 'graphite', C.GUNMETAL), P(0.12, -0.11, 'graphite', C.GUNMETAL),
    P(0.22, -0.06, 'glaze', C.ENAMEL), P(0.29, -0.035, 'glaze', C.ENAMEL), P(0.31, -0.012, 'glaze', C.ENAMEL), P(0.312, -0.004, 'bronze', C.BRASS),
    P(0.31, 0.02, 'bronze', C.BRASS), P(0.285, 0.04, 'glaze', C.ENAMEL), P(0.19, 0.055, 'glaze', C.ENAMEL),
    P(0.18, 0.08, 'glaze', C.ENAMEL), P(0, 0.08, 'glaze', C.ENAMEL),
  ], at(0, HEAD_Y - 0.05, 0), { segs: 36, wear: 0.5, crease: 30 });
  rivetRing(H('pelvis'), V(0, HEAD_Y - 0.015, 0), V(0, 1, 0), 0.22, 12, 0.01, { phase: 0.26 });
  // the tribrach: a triangular brass plate on three levelling screws (knurled gunmetal knobs)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
    const x = Math.sin(a) * 0.15, z = Math.cos(a) * 0.15;
    strut(H('pelvis'), V(x, HEAD_Y + 0.03, z), V(x, HEAD_Y + 0.12, z), 0.016, 0.016, { surf: 'bronze', tone: C.BRASS, sides: 8 });
    strut(H('pelvis'), V(x, HEAD_Y + 0.045, z), V(x, HEAD_Y + 0.08, z), 0.036, 0.036, { surf: 'graphite', tone: C.GUNMETAL, sides: 12, wear: 0.6 });
  }
  plate(H('pelvis'), [[0, 0.2], [0.17, -0.1], [-0.17, -0.1]], 0.025, 0.008,
    basis(V(1, 0, 0), V(0, 0, -1), V(0, 1, 0), V(0, HEAD_Y + 0.13, 0)), { surf: 'glaze', tone: C.ENAMEL, wear: 0.4 });
  // a serial on the head's rim, engraved: "06"
  for (const [k, dgt] of [[-1, 0], [1, 6]]) {
    const c = V(k * 0.035, HEAD_Y - 0.015, -0.312);
    const M = basis(V(-1, 0, 0), V(0, 1, 0), V(0, 0, -1), c);
    const mk = H('pelvis').mark();
    plate(H('pelvis'), [[-0.026, -0.022], [0.026, -0.022], [0.026, 0.022], [-0.026, 0.022]], 0.004, 0.0, M, { surf: 'bronze', tone: C.ENAMEL, wear: 0.1 });
    H('pelvis').decalSince(mk, { frame: M, fn: (p) => numeralUV(dgt, (p.x + 0.026) / 0.052, 1 - (p.y + 0.022) / 0.044) });
  }
  // three clevis lugs on the rim; the legs hang from their pins
  const LEG_AZ = [['MF', 0, 1], ['LH', -2 * Math.PI / 3, -1], ['RH', 2 * Math.PI / 3, -1]];
  for (const [, a] of LEG_AZ) {
    const out_ = V(Math.sin(a), 0, Math.cos(a)), tan = V(Math.cos(a), 0, -Math.sin(a));
    const c = V(0, HEAD_Y - 0.06, 0).addScaledVector(out_, 0.29);
    for (const s of [-1, 1]) {
      rbox(H('pelvis'), V(0, 0, 0), [0.02, 0.12, 0.1], 0.007,
        { surf: 'graphite', tone: C.GUNMETAL, wear: 0.5, segs: 1, matrix: basis(tan, V(0, 1, 0), out_, c.clone().addScaledVector(tan, s * 0.05)) });
    }
  }
  // the banner: a small faded orchil survey banner on the back of the head (BIBLE banner rule)
  banner(H('pelvis'), V(0, HEAD_Y - 0.07, -0.335), V(1, 0, 0), { w: 0.17, h: 0.40, out: V(0, 0, -1) });

  /* ---------------------------------- legs --------------------------------- */
  const L1 = 0.62, L2 = 1.42;
  const LEGS = [];
  for (const [id, a, hinge] of LEG_AZ) {
    const out_ = V(Math.sin(a), 0, Math.cos(a));
    const hip = V(0, HEAD_Y - 0.09, 0).addScaledVector(out_, 0.29);
    const ankle = V(0, 0.10, 0).addScaledVector(out_, PLUMB.legSpreadR);
    const knee = solveKnee(hip, ankle, hinge, L1, L2);
    const toe = ankle.clone().add(V(0, -0.09, 0)).addScaledVector(out_, 0.06);
    LEGS.push({ id, a, hinge, hip, knee, ankle, toe, out: out_ });
  }
  for (const Lg of LEGS) {
    const thigh = `${Lg.id}_thigh`, shin = `${Lg.id}_shin`, foot = `${Lg.id}_foot`;
    const tan = V(Math.cos(Lg.a), 0, -Math.sin(Lg.a));
    // the clevis pin (thigh owns it)
    strut(H(thigh), Lg.hip.clone().addScaledVector(tan, -0.075), Lg.hip.clone().addScaledVector(tan, 0.075), 0.02, 0.02, { surf: 'graphite', tone: C.GUNMETAL, sides: 10 });
    for (const s of [-1, 1]) rivet(H(thigh), Lg.hip.clone().addScaledVector(tan, s * 0.075), tan.clone().multiplyScalar(s), 0.012);
    // upper section: twin enamel cheeks (a survey tripod's double rail), brass clamp collars, rivets
    const d1 = Lg.knee.clone().sub(Lg.hip);
    const len1 = d1.length(); d1.normalize();
    const { x: tx, z: w } = frameY(d1, tan);
    for (const s of [-1, 1]) {
      const c = Lg.hip.clone().addScaledVector(d1, len1 * 0.5).addScaledVector(tx, s * 0.038);
      rbox(H(thigh), V(0, 0, 0), [0.034, len1 * 0.9, 0.062], 0.009, { surf: 'glaze', tone: C.ENAMEL, wear: 0.3, matrix: basis(tx, d1, w, c), segs: 1 });
    }
    for (const f of [0.1, 0.9]) {
      const c = Lg.hip.clone().addScaledVector(d1, len1 * f);
      rbox(H(thigh), V(0, 0, 0), [0.108, 0.05, 0.064], 0.01, { surf: 'bronze', tone: C.BRASS, wear: 0.7, segs: 1, matrix: basis(tx, d1, w, c) });
      for (const s of [-1, 1]) rivet(H(thigh), c.clone().addScaledVector(w, 0.032).addScaledVector(tx, s * 0.034), w, 0.009);
    }
    // the knee: a gunmetal joint with a brass wing screw
    strut(H(thigh), Lg.knee.clone().addScaledVector(tan, -0.065), Lg.knee.clone().addScaledVector(tan, 0.065), 0.042, 0.042, { surf: 'graphite', tone: C.GUNMETAL, sides: 12 });
    const ws = Lg.knee.clone().addScaledVector(w, 0.055);
    strut(H(thigh), Lg.knee, ws, 0.011, 0.011, { surf: 'bronze', tone: C.BRASS, sides: 6 });
    { const f = frameY(w, tan); plate(H(thigh), [[-0.045, -0.013], [0.045, -0.013], [0.035, 0.013], [-0.035, 0.013]], 0.01, 0.003, basis(f.x, f.y, f.z, ws), { surf: 'bronze', tone: C.BRASS, wear: 0.6 }); }
    // the shin: a graduated staff (white enamel, thin graduations; ticks on its outer face), brass sliding collars
    const d2 = Lg.ankle.clone().sub(Lg.knee);
    const len2 = d2.length(); d2.normalize();
    const s0 = Lg.knee.clone().addScaledVector(d2, 0.03), s1 = Lg.knee.clone().addScaledVector(d2, len2 * 0.95);
    staff(H(shin), s0, s1, 0.046, 0.036, { sides: 8, face: Lg.out, phase: 0.13 });
    for (const f of [0.44]) {   // one sliding collar per staff (fix 1: brass trim, not brass sleeves)
      const c = Lg.knee.clone().addScaledVector(d2, len2 * f + 0.02);
      strut(H(shin), c, c.clone().addScaledVector(d2, 0.04), 0.053, 0.051, { surf: 'bronze', tone: C.BRASS, sides: 10, wear: 0.6 });
      rivet(H(shin), c.clone().addScaledVector(d2, 0.02).addScaledVector(Lg.out, 0.052), Lg.out, 0.009);
    }
    // the shoe: brass ferrule, a gunmetal disc pad and a steel point (foot owns the pad)
    const fa = Lg.ankle;
    strut(H(shin), s1, fa.clone().addScaledVector(d2, -0.02), 0.038, 0.03, { surf: 'bronze', tone: C.BRASS, sides: 10, wear: 0.6 });
    ball(H(foot), fa, 0.038, { surf: 'graphite', tone: C.GUNMETAL });
    const pad = V(fa.x, 0, fa.z).addScaledVector(Lg.out, 0.03);
    lathe(H(foot), [
      P(0, 0, 'rubber', C.RUBBER), P(0.082, 0, 'rubber', C.RUBBER), P(0.087, 0.02, 'graphite', C.GUNMETAL),
      P(0.058, 0.048, 'graphite', C.GUNMETAL), P(0.03, 0.058, 'bronze', C.BRASS), P(0, 0.062, 'bronze', C.BRASS),
    ], at(pad.x, pad.y, pad.z), { segs: 16, wear: 0.6 });
    strut(H(foot), fa, V(pad.x, 0.055, pad.z), 0.028, 0.024, { surf: 'graphite', tone: C.GUNMETAL, sides: 8 });
    strut(H(foot), V(pad.x, 0.05, pad.z).addScaledVector(Lg.out, 0.05), V(pad.x, 0.0, pad.z).addScaledVector(Lg.out, 0.12), 0.015, 0.004,
      { surf: 'graphite', tone: C.CHROME, sides: 6 });
  }

  /* ------------------------------- the mast -------------------------------- */
  const MAST0 = HEAD_Y + 0.13, MAST1 = SY - SR + 0.02;
  // an enamel sleeve over the gunmetal mast (fix 1: the visible hull's enamel share had 0.8 points of margin)
  strut(H('neck'), V(0, MAST0, 0), V(0, MAST1 + 0.02, 0), 0.055, 0.05, { surf: 'glaze', tone: C.ENAMEL, sides: 16, wear: 0.4 });
  torus(H('neck'), V(0, MAST0 + 0.03, 0), 0.06, 0.012, 'y', { surf: 'bronze', tone: C.BRASS, tube: 6, radial: 20 });

  /* ------------------------- the gyroscope-sphere head --------------------- */
  const HD = H('head');
  // the horizontal limb circle under the sphere (vernier engraved)
  limbRing(HD, at(0, MAST1 + 0.005, 0), 0.06, 0.22, 0.03, { ticks: 8, faceSurf: 'glaze', faceTone: C.ENAMEL });
  // the shell: six enamel lunes over the gunmetal core, seams away from the lamp
  enamelSphere(HD, SC, SR, { panels: 6, gap: 3, latMin: -62, latMax: 62, phiStart: Math.PI / 6, segs: 48, coreSegs: [20, 12] });
  // pole bosses: brass rings that close the shell at top and bottom
  limbRing(HD, at(0, SY + SR * 0.86, 0), 0.03, 0.2, 0.035, { ticks: 6, vernier: false, faceSurf: 'glaze', faceTone: C.ENAMEL });
  limbRing(HD, at(0, SY - SR * 0.86, 0), 0.03, 0.2, 0.035, { ticks: 6, vernier: false, tone: C.GUNMETAL, surf: 'graphite', faceSurf: 'glaze', faceTone: C.ENAMEL });
  // the equatorial gimbal (ring, tabs, wings): its own node, mounted on the head as a fixed part, so the arrow sweep
  // fits it its own thin capsules (core/hitHulls.js fits a bone's capsules to cells of its whole skin: a ring and
  // wings on the head's skin made capsules that reached up past the vial)
  const GB = new KBucket('plumb-gimbal');
  // the two gyroscope rings: fixed parts too, each its own node (thin capsules round each ring)
  const GR1 = new KBucket('plumb-gyro-a'), GR2 = new KBucket('plumb-gyro-b');
  // the brass equatorial ring, closed all round (the drum is outboard on its right trunnion); its face engraved
  limbRing(GB, at(0, SY, 0), PLUMB.ringIn, PLUMB.ringOut, 0.05, { ticks: 24, segs: 64, faceSurf: 'glaze', faceTone: C.ENAMEL, outerSurf: 'glaze', outerTone: C.ENAMEL });
  // rivets round the ring's face
  rivetRing(GB, V(0, SY + 0.026, 0), V(0, 1, 0), (PLUMB.ringIn + PLUMB.ringOut) / 2, 30, 0.01);
  // flange tabs and two side wings on the ring (enamel plates, brass rivets)
  for (const [azDeg, len, wid] of [[55, 0.63, 0.13], [-55, 0.63, 0.13], [125, 0.63, 0.13], [-125, 0.63, 0.13], [-90, 0.71, 0.17], [180, 0.62, 0.12]]) {
    const az = THREE.MathUtils.degToRad(azDeg);
    const out_ = V(Math.sin(az), 0, Math.cos(az)), tan = V(Math.cos(az), 0, -Math.sin(az));
    // outline in (tan, out) with the plate's normal along +Y
    const Mp = basis(tan, out_.clone(), new THREE.Vector3().crossVectors(tan, out_), V(0, SY, 0));
    plate(GB, [[-wid / 2, PLUMB.ringOut - 0.04], [wid / 2, PLUMB.ringOut - 0.04], [wid * 0.32, len], [-wid * 0.32, len]], 0.028, 0.006, Mp,
      { surf: 'glaze', tone: C.ENAMEL, wear: 0.35 });
    const n = new THREE.Vector3().crossVectors(tan, out_).normalize();
    const up = n.y > 0 ? n : n.clone().negate();
    for (const r of [PLUMB.ringOut + 0.03, len - 0.035]) rivet(GB, V(0, SY, 0).addScaledVector(out_, r).addScaledVector(up, 0.016), up, 0.01);
  }
  // two gyroscope rings on gunmetal pivots, crossing behind and beside the drum
  {
    // tilted so neither ring's crown passes the vial: each top stands >= 0.09 m below the vial's centre line
    const t1 = THREE.MathUtils.degToRad(40);
    gyroRing(GR1, SC, V(0, -Math.sin(t1), Math.cos(t1)), 0.47, 0.012, { pivot: V(1, 0, 0) });
    const t2 = THREE.MathUtils.degToRad(55), l2 = THREE.MathUtils.degToRad(32);
    gyroRing(GR2, SC, V(Math.sin(t2) * Math.cos(l2), Math.sin(l2), Math.cos(t2) * Math.cos(l2)), 0.465, 0.010, { pivot: V(Math.cos(t2), 0, -Math.sin(t2)) });
  }
  const SCP = new KBucket('plumb-scope'), CR = new KBucket('plumb-crown'), MS = new KBucket('plumb-mast');
  // the sighting telescope beside the drum, on a brass bracket (visible instrument parts round the lamp)
  // (its own node: core/hitHulls.js fits a bone's capsules to cells of its whole skin, and a 7 cm tube beside a
  // 0.84 m sphere got a 0.2 m capsule that stopped arrows at the vial's height)
  {
    const TY = SY + 0.235, TX = 0.2;
    const zs = Math.sqrt(Math.max(0, SR * SR - TX * TX - 0.235 * 0.235));
    strut(SCP, V(TX, TY, zs - 0.06), V(TX, TY, zs + 0.27), 0.03, 0.036, { surf: 'graphite', tone: C.GUNMETAL, sides: 14 });
    for (const z of [zs - 0.06, zs + 0.1, zs + 0.24]) strut(SCP, V(TX, TY, z), V(TX, TY, z + 0.03), 0.044, 0.044, { surf: 'bronze', tone: C.BRASS, sides: 14, wear: 0.6 });
    ball(SCP, V(TX, TY, zs + 0.272), 0.03, { surf: 'glaze', tone: 0x2f3a36, w: 10, h: 6, wear: 0.05 });   // objective glass (dark)
    rbox(SCP, V(TX - 0.02, TY - 0.045, zs + 0.03), [0.03, 0.06, 0.1], 0.006, { surf: 'bronze', tone: C.BRASS, wear: 0.6 });
  }
  // THE LEVEL VIAL: the weak point, on two slender brass standards above the sphere's crown (a short mast topped by
  // the vial). Its cradle (caps, saddles, rings, bubble, crossbar) is its own node, the vial's hit volume (the kind file
  // mounts it as the `vial` part); the standards and the antennae are another (`plumb-mast`): thin capsules round each
  const VY = PLUMB.vialY;
  for (const s of [-1, 1]) {
    const x = s * 0.16, y0 = SY + Math.sqrt(SR * SR - x * x) - 0.03;
    strut(MS, V(x, y0, 0), V(x, VY - 0.045, 0), 0.016, 0.014, { surf: 'bronze', tone: C.BRASS, sides: 8 });
    rbox(CR, V(x, VY - 0.035, 0), [0.03, 0.03, 0.09], 0.006, { surf: 'bronze', tone: C.BRASS, wear: 0.6 });
  }
  rbox(CR, V(0, VY - 0.07, 0), [0.36, 0.02, 0.07], 0.006, { surf: 'bronze', tone: C.BRASS, wear: 0.6 });
  const vial = levelVial(CR, G('head'), V(0, VY, 0), V(1, 0, 0), { len: PLUMB.vialLen, r: PLUMB.vialR });
  // the antennae: one with a cross-arm and the 3.40 m finial, behind the vial; a shorter one off the crown
  antenna(MS, V(0, VY - 0.07, -0.085), V(0, PLUMB.top, -0.085), { r: 0.012, finial: 0.12, cross: 0.055 });
  antenna(MS, V(-0.175, VY - 0.07, -0.03), V(-0.19, 3.17, -0.04), { r: 0.009, finial: 0.07 });

  /* ------------------------------- the lamp drum (a tool) ------------------- */
  // a lantern on a trunnion OUTBOARD of the ring's right side, its axis along +Z: from the front the sphere shows a
  // closed enamel face with its gimbal ring across it, and the lamp stands off to one side (no face)
  const drum = new KBucket('plumb-drum');
  const DX = PLUMB.drumX, DY = SY + PLUMB.drumY;
  const DRUM_BACK = V(DX, DY, PLUMB.drumBackZ);
  const dr = lampDrum(drum, DRUM_BACK, V(0, 0, 1), { r: PLUMB.drumR, depth: PLUMB.drumDepth, ticks: 16 });
  // the drum's hood: an enamel visor over the iris (bow-shaped plate)
  plate(drum, [[-0.15, 0], [0.15, 0], [0.11, 0.07], [-0.11, 0.07]], 0.012, 0.004,
    basis(V(1, 0, 0), V(0, 0.3, 1).normalize(), V(0, 1, -0.3).normalize(), V(DX, DY + PLUMB.drumR * 1.02, PLUMB.drumBackZ + PLUMB.drumDepth - 0.05)), { surf: 'glaze', tone: C.ENAMEL, wear: 0.4 });
  // the trunnion: a brass yoke from the ring's outer wall to the drum's barrel (two arms and a pivot boss), on the gimbal
  {
    const zc = PLUMB.drumBackZ + PLUMB.drumDepth * 0.45, xr = PLUMB.ringOut - 0.02, xd = DX - PLUMB.drumR * 0.98;
    for (const s of [-1, 1]) strut(GB, V(xr, SY + s * 0.075, zc), V(xd + 0.01, DY + s * 0.075, zc), 0.018, 0.016, { surf: 'bronze', tone: C.BRASS, sides: 10, wear: 0.6 });
    strut(GB, V(xr - 0.01, SY, zc), V(xd + 0.015, DY, zc), 0.034, 0.034, { surf: 'graphite', tone: C.GUNMETAL, sides: 14, wear: 0.5 });
    for (const s of [-1, 1]) rivet(GB, V(xr + 0.03, SY + s * 0.075, zc + 0.018), V(0, 0, 1), 0.01);
  }

  /* --------------------------------- the bob ------------------------------- */
  const T0 = V(0, HEAD_Y - 0.23, 0), BOB = V(0, HEAD_Y - 0.23 - PLUMB.cable, 0), T1 = V(0, (T0.y + BOB.y) / 2, 0);
  const BH = PLUMB.bobLen / 0.36, BR = PLUMB.bobR;   // the bob's lathe is drawn at 0.36 m and scaled
  cable(H('tail1'), [T0, V(0, (T0.y + T1.y) / 2, 0.001), T1], 0.008, { surf: 'graphite', tone: C.GUNMETAL, segs: 4, radial: 5 });
  cable(H('tail2'), [T1, V(0, (T1.y + BOB.y) / 2, 0.001), BOB.clone().add(V(0, 0.03, 0))], 0.008, { surf: 'graphite', tone: C.GUNMETAL, segs: 4, radial: 5 });
  torus(H('tail2'), BOB.clone().add(V(0, 0.05, 0)), 0.028, 0.007, 'x', { surf: 'bronze', tone: C.BRASS, tube: 6, radial: 16, wear: 0.6 });
  strut(H('tail2'), BOB.clone().add(V(0, 0.09, 0)), BOB.clone().add(V(0, 0.035, 0)), 0.013, 0.017, { surf: 'bronze', tone: C.BRASS, sides: 8, wear: 0.6 });
  const bob = new KBucket('plumb-bob');
  // polished brass with one enamel band (the crop's signature brass bob), drawn at 0.36 m and scaled by BH, BR
  const Pb = (r, h, surf, tone) => P(r * BR, h * BH, surf, tone);
  lathe(bob, [
    Pb(0, -0.36, 'graphite', C.CHROME), Pb(0.012, -0.34, 'bronze', C.BRASS), Pb(0.03, -0.3, 'bronze', C.BRASS),
    Pb(0.105, -0.14, 'bronze', C.BRASS), Pb(0.12, -0.1, 'glaze', C.ENAMEL), Pb(0.12, -0.075, 'glaze', C.ENAMEL), Pb(0.125, -0.06, 'bronze', C.BRASS),
    Pb(0.11, -0.04, 'bronze', C.BRASS), Pb(0.095, -0.01, 'bronze', C.BRASS), Pb(0.04, 0.012, 'graphite', C.GUNMETAL), Pb(0.03, 0.035, 'bronze', C.BRASS), Pb(0, 0.042, 'bronze', C.BRASS),
  ], at(BOB.x, BOB.y, BOB.z), { segs: 24, wear: 0.35, crease: 30 });
  rivetRing(bob, BOB.clone().add(V(0, -0.068 * BH, 0)), V(0, 1, 0), 0.124 * BR, 8, 0.008, { radial: true });

  /* ------------------------------- recentre -------------------------------- */
  const all = [...hull.values(), ...glass.values(), bob, drum, GB, GR1, GR2, SCP, CR, MS];
  const box = new THREE.Box3();
  for (const b of all) b.bounds(box);
  const cx = (box.min.x + box.max.x) / 2, cz = 0, y0 = box.min.y;   // z stays on the head's axis (the lamp looks down +Z)
  for (const b of all) b.translate(-cx, -y0, -cz);
  const sh = (v) => [+(v.x - cx).toFixed(4), +(v.y - y0).toFixed(4), +(v.z - cz).toFixed(4)];
  const size = box.getSize(new THREE.Vector3());

  const rigSpec = {
    spine: [
      { name: 'pelvis', pos: sh(V(0, HEAD_Y, 0)), r: 0.4 },
      { name: 'neck', pos: sh(V(0, MAST0 + 0.02, 0)), r: 0.1 },
      { name: 'head', pos: sh(SC), r: 0.62, tip: sh(V(0, SY, 0.6)) },
    ],
    tail: [
      { name: 'tail1', pos: sh(T0), r: 0.08 },
      { name: 'tail2', pos: sh(T1), r: 0.16 },
    ],
    legGateY: +(HEAD_Y - 0.12 - y0).toFixed(4),
    legInboard: 0.18,
    legs: LEGS.map((Lg) => ({
      id: Lg.id, parent: 'pelvis', hinge: Lg.hinge,
      hip: sh(Lg.hip), knee: sh(Lg.knee), ankle: sh(Lg.ankle), toe: sh(Lg.toe),
      r: 0.13, restFoot: [sh(Lg.ankle)[0], sh(Lg.ankle)[2]],
    })),
  };
  const BONE_ORDER = [
    ...rigSpec.spine.map((s) => s.name), ...rigSpec.tail.map((s) => s.name),
    ...rigSpec.legs.flatMap((l) => [`${l.id}_thigh`, `${l.id}_shin`, `${l.id}_foot`]),
  ];
  const sockets = {
    lamp: sh(dr.face),
    lampR: +dr.radius.toFixed(4),
    vial: sh(V(0, VY, 0)),
    vialLen: vial.len, vialR: vial.r,
    bob: sh(V(0, BOB.y - 0.17 * BH, 0)),
    bobTop: sh(BOB),
    drum: sh(V(DX, DY, PLUMB.drumBackZ + PLUMB.drumDepth / 2)),
    drumBack: sh(DRUM_BACK),
    head: sh(SC),
    top: sh(V(0, PLUMB.top, -0.085)),
  };

  const hullAll = mergeLabelled(hull, BONE_ORDER, 'plumb-hull');
  const glassAll = mergeLabelled(glass, BONE_ORDER, 'plumb-vial');
  const fin = finish(hullAll, { occluders: [glassAll, bob, drum, GB, GR1, GR2, SCP, CR, MS], rays: 28, dist: 0.4, footBand: noDust ? 0 : 0.6, lamps: [], verdigris: 0.3 });
  finish(bob, { occluders: [hullAll], rays: 28, dist: 0.4, footBand: noDust ? 0 : 0.6, lamps: [], verdigris: 0.3 });
  finish(drum, { occluders: [hullAll], rays: 28, dist: 0.4, footBand: noDust ? 0 : 0.6, lamps: [], verdigris: 0.3 });
  for (const G of [GR1, GR2, SCP, CR, MS]) finish(G, { occluders: [hullAll, GB, glassAll], rays: 28, dist: 0.4, footBand: noDust ? 0 : 0.6, lamps: [], verdigris: 0.3 });
  finish(GB, { occluders: [hullAll, drum, GR1, GR2], rays: 28, dist: 0.4, footBand: noDust ? 0 : 0.6, lamps: [], verdigris: 0.3 });

  let rig = rigSpec, sk = sockets, sz = size;
  if (scale !== 1) {
    for (const b of [hullAll, glassAll, bob, drum, GB, GR1, GR2, SCP, CR, MS]) b.scale(scale);
    rig = scaleRig(rigSpec, scale);
    sk = Object.fromEntries(Object.entries(sockets).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => +(x * scale).toFixed(4)) : +(v * scale).toFixed(4)]));
    sz = size.clone().multiplyScalar(scale);
  }

  const target = file || path.join(out, OUTPUTS[0]);
  const ICE_LIN = new THREE.Color(C.ICE);   // linear (ColorManagement)
  const stats = await writeInstrument([
    { bucket: hullAll, role: 'hull', material: { name: 'r5-plumb-hull' } },
    // the vial: pale-ice glass lit from inside (emissive), the only emissive surface of the model; the lamp's iris is
    // drawn by the lamp system at the drum's face
    { bucket: glassAll, role: 'sensor', material: { name: 'r5-plumb-vial-glass', emissive: [ICE_LIN.r, ICE_LIN.g, ICE_LIN.b], baseColor: [0.62, 0.78, 0.76, 1] } },
    { bucket: bob, role: 'tool', material: { name: 'r5-plumb-hull', anchor: sk.bobTop } },
    { bucket: drum, role: 'tool', material: { name: 'r5-plumb-hull', anchor: sk.drumBack } },
    { bucket: GB, role: 'tool', material: { name: 'r5-plumb-hull', anchor: sk.head } },
    { bucket: GR1, role: 'tool', material: { name: 'r5-plumb-hull', anchor: sk.head } },
    { bucket: GR2, role: 'tool', material: { name: 'r5-plumb-hull', anchor: sk.head } },
    { bucket: SCP, role: 'tool', material: { name: 'r5-plumb-hull', anchor: sk.head } },
    { bucket: CR, role: 'tool', material: { name: 'r5-plumb-hull', anchor: sk.vial } },
    { bucket: MS, role: 'tool', material: { name: 'r5-plumb-hull', anchor: sk.head } },
  ], {
    file: target,
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    extras: {
      r5Rig: rig, r5BoneOrder: BONE_ORDER,
      r5Size: [+sz.x.toFixed(4), +sz.y.toFixed(4), +sz.z.toFixed(4)],
      r5Sockets: sk, r5Scale: scale,
      r5Generator: { name: RECIPE, design: 'plumb', kit: 'M1.4a', scale, licence: 'original work (generated), no third-party assets' },
    },
  });
  return {
    kind: 'plumb', file: path.relative(out, target), bytes: stats.bytes, tris: stats.tris, meshTris: stats.meshTris, verts: stats.verts,
    materials: stats.materials, textures: stats.textures, bones: BONE_ORDER.length, legs: LEGS.length, aoMean: +fin.aoMean.toFixed(3),
    size: { x: +sz.x.toFixed(3), y: +sz.y.toFixed(3), z: +sz.z.toFixed(3) },
    _buckets: { hullAll, glassAll, bob, drum, gimbal: GB, gyroA: GR1, gyroB: GR2, scope: SCP, crown: CR, mast: MS, sockets: sk, size: sz },
  };
}

/** An orthonormal frame whose +Y is `d` and whose +X leans toward `hint` (x × y = z). */
function frameY(d, hint) {
  const y = d.clone().normalize();
  const x = hint.clone().addScaledVector(y, -hint.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  return { x, y, z };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  const outDir = arg('--out') ? path.resolve(arg('--out')) : ROOT;
  const scale = arg('--scale') ? +arg('--scale') : 1;
  const file = scale !== 1 ? path.join(outDir, `plumb-s${scale}.glb`) : null;
  const r = await build({ out: outDir, scale, file });
  delete r._buckets;
  console.log(JSON.stringify(r));
}
