#!/usr/bin/env node
/**
 * CALIMA — the GAUGE generator (instruments; BIBLE §7.4 #4, BUILD M1.4e). Original work: no third-party asset is
 * read. Built from the shared hull kit (`parts/kit.mjs`, M1.4a), the Plumb's and the Peg's maker.
 *
 *   node tools/build/instruments/gen-gauge.mjs [--out <dir>]
 *     -> public/models/instruments/gauge.glb   (hull, lantern glass, the float ring and sluice gate, LOD1 caster)
 *
 * THE TIDE KEEPER (medium, 3.2 x 2.6 x 5.5 m; role `keeper`; neutral). A lighthouse on stilts:
 *   - FOUR VERY LONG THIN STILTS: a gunmetal thigh under an enamel greave from the drum's underside out to a knee SEAL
 *     (a gunmetal collar between two brass rings: the bible's four knee seals, 1.5 m up, so it wades to 1.2 m with
 *     them dry), then a long graduated enamel shin (the family's thin vermilion graduations) to a disc foot;
 *   - a SQUAT FLOAT DRUM on them, 0.8 m tall and 1.64 m across: six riveted enamel plates over gunmetal seams, two
 *     brass hoops, a shallow enamel keel dome, a celadon WATERLINE band round its foot (the bible's one glaze accent),
 *     two enamel BALLAST TANKS slung on its flanks (weak points), a brass BRINE PUMP and SLUICE NOZZLE on its front
 *     right with a hinged gate at the mouth, a small kit LAMP DRUM on its front-left shoulder (the `head` bone swivels
 *     it; never centred, never on a neck), and a brass deck rail round its top;
 *   - the MAST: a graduated enamel staff (the tide staff) with a sliding brass FLOAT RING that rides up it to the tide
 *     it reads; a brass yard across it hung with two small FADED ORCHIL BANNERS; then the LANTERN-GLASS COLUMN (pale
 *     ice glass, lit from inside: the only emissive surface) in six brass mullions with a gyroscope ring round it, a
 *     brass roof and a spike finial to 5.50 m.
 * Design source (private sheet, not named here): the lantern column of the board's tall banner-hung design, carried
 * on the bible's float drum and stilts.
 *
 * Bones: pelvis (the drum and everything on it), head (the lamp turret) + 4 legs x 3 = 14. The float ring and the
 * gate are TOOL nodes (unskinned): the kind file hangs them on the pelvis and moves them (`kinds/gauge.js`).
 * Space: metres, +Y up, +Z forward, y = 0 at the feet; written centred on its bounding box in x and z.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { V, strut, ball, rbox, torus, plate, lathe, basis, at, AXIS_Z } from '../lib/hs.mjs';
import {
  THREE, C, KBucket, mergeLabelled, finish, writeInstrument, solveKnee, numeralUV, lod1From,
  resetKitStats, rivet, rivetRing, lampDrum, limbRing, gyroRing, staff, antenna, banner,
} from './parts/kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const LANE = 'instruments';
export const RECIPE = 'tools/build/instruments/gen-gauge.mjs';
export const OUTPUTS = ['public/models/instruments/gauge.glb'];

/**
 * The Gauge's banners (fix round 1: at C.BANNER, L* about 41, they read as mauve smudges against the basalt cliff in
 * F23-gauge): the same faded orchil, sun-bleached to about L* 62 (C* about 12, still under Brea's violet by the banner
 * rule), with a pale linen hem band so each one separates from the rock by value.
 */
const BANNER_PALE = 0xa392ab;

/** Design constants (before the recentre). */
export const GAUGE = Object.freeze({
  drumY0: 2.40, drumH: 0.80, drumR: 0.82, keel: 0.16,      // the float drum: cylinder foot, height, radius; keel dome depth
  band: 0.12,                                               // the celadon waterline band at the drum's foot
  tankX: 0.99, tankY: 2.66, tankR: 0.17, tankLen: 1.0,      // the two ballast tanks on the flanks
  lampX: -0.42, lampY: 3.40, lampBackZ: 0.74, lampR: 0.15, lampDepth: 0.16,   // on the drum's rim (shoulder), outboard of the rail
  trunnionZ: 0.60,                                          // its trunnion on the deck, inside the rail
  pumpX: 0.36,                                              // the brine pump and nozzle (front right)
  mast0: 3.20, mast1: 4.40, mastR: 0.075,                   // the graduated tide staff
  floatY: 3.34, floatR: 0.14,                               // the float ring's rest (its centre) on the staff
  yardY: 4.30, yardHalf: 0.62,                              // the banner yard
  glass0: 4.48, glass1: 5.02, glassR: 0.17,                 // the lantern glass
  roof: 5.22, top: 5.50,                                    // the roof's peak, the finial's spike
  hipR: 0.52, hipY: 2.34, footX: 1.15, footZ: 1.45,         // stilts: hip corner, foot corner
  thigh: 1.0, shin: 1.78,                                   // thigh and shin lengths
});

export async function build({ out = ROOT, file = null, noDust = false } = {}) {
  resetKitStats();
  const G = GAUGE;
  const P = (r, h, surf, tone) => ({ r, h, surf, tone });
  const BONES = [];
  const hull = new Map(), glass = new Map();
  const H = (b) => { if (!hull.has(b)) { hull.set(b, new KBucket(`hull:${b}`)); if (!BONES.includes(b)) BONES.push(b); } return hull.get(b); };
  const GL = (b) => { if (!glass.has(b)) glass.set(b, new KBucket(`glass:${b}`)); return glass.get(b); };
  const Y0 = G.drumY0, R = G.drumR, Y1 = Y0 + G.drumH;

  /* ------------------------------- the float drum ---------------------------- */
  const Mup = at(0, Y0, 0);
  // the gunmetal core shows only in the plate seams
  for (let k = 0; k < 6; k++) {
    lathe(H('pelvis'), [P(R * 0.96, G.band + 0.004, 'graphite', C.GUNMETAL), P(R * 0.96, G.drumH - 0.004, 'graphite', C.GUNMETAL)],
      Mup, { segs: 2, phiStart: Math.PI / 6 + (k * Math.PI) / 3 - THREE.MathUtils.degToRad(4), phiLength: THREE.MathUtils.degToRad(8), wear: 0.3 });
  }
  // six enamel plates above the waterline band, 3-degree seams, turned lips
  lathe(H('pelvis'), [P(R * 0.955, G.band + 0.004, 'glaze', C.ENAMEL), P(R, G.band + 0.03, 'glaze', C.ENAMEL), P(R, (G.band + G.drumH) / 2, 'glaze', C.ENAMEL),
    P(R, G.drumH - 0.03, 'glaze', C.ENAMEL), P(R * 0.955, G.drumH - 0.004, 'glaze', C.ENAMEL)],
  Mup, { segs: 60, panels: 6, gap: 3, phiStart: Math.PI / 6, wear: 0.35, crease: 50 });
  // the celadon waterline band (the drum's foot) and the shallow keel dome under it
  lathe(H('pelvis'), [P(R * 0.97, 0, 'glaze', C.CELADON), P(R * 1.005, 0.02, 'glaze', C.CELADON), P(R * 1.005, G.band - 0.01, 'glaze', C.CELADON), P(R * 0.96, G.band + 0.006, 'glaze', C.CELADON)],
    Mup, { segs: 60, wear: 0.5, crease: 40 });
  {
    const K = G.keel;
    lathe(H('pelvis'), [P(0, -K, 'glaze', C.ENAMEL), P(R * 0.42, -K * 0.92, 'glaze', C.ENAMEL), P(R * 0.74, -K * 0.62, 'glaze', C.ENAMEL), P(R * 0.92, -K * 0.25, 'glaze', C.ENAMEL), P(R * 0.97, 0, 'glaze', C.ENAMEL)],
      Mup, { segs: 48, wear: 0.4, crease: 50 });
    // a brass drain plug at the keel's foot
    lathe(H('pelvis'), [P(0, -K - 0.03, 'bronze', C.BRASS), P(0.05, -K - 0.025, 'bronze', C.BRASS), P(0.06, -K + 0.004, 'bronze', C.BRASS)], Mup, { segs: 8, wear: 0.6 });
  }
  // two brass hoops with radial rivet courses
  for (const y of [G.band + 0.05, G.drumH - 0.05]) {
    lathe(H('pelvis'), [P(R - 0.002, y - 0.024, 'bronze', C.BRASS), P(R + 0.012, y - 0.02, 'bronze', C.BRASS), P(R + 0.014, y + 0.02, 'bronze', C.BRASS), P(R - 0.002, y + 0.024, 'bronze', C.BRASS)],
      Mup, { segs: 60, wear: 0.6, crease: 30 });
    rivetRing(H('pelvis'), V(0, Y0 + y, 0), V(0, 1, 0), R + 0.014, 30, 0.01, { radial: true, phase: 0.05 });
  }
  // the deck: a flat enamel lid with a brass limb ring (graduated) and a rail of eight posts
  lathe(H('pelvis'), [P(R * 0.955, G.drumH - 0.004, 'glaze', C.ENAMEL), P(R * 0.9, G.drumH + 0.02, 'glaze', C.ENAMEL), P(0.2, G.drumH + 0.03, 'glaze', C.ENAMEL), P(0, G.drumH + 0.03, 'glaze', C.ENAMEL)],
    Mup, { segs: 48, wear: 0.35, crease: 40 });
  limbRing(H('pelvis'), at(0, Y1 + 0.035, 0), R * 0.62, R * 0.86, 0.02, { ticks: 24, faceSurf: 'bronze', faceTone: C.BRASS });
  const RAIL = R * 0.93, RAILH = 0.24;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const p = V(Math.sin(a) * RAIL, Y1 + 0.02, Math.cos(a) * RAIL);
    strut(H('pelvis'), p, p.clone().add(V(0, RAILH, 0)), 0.014, 0.012, { surf: 'bronze', tone: C.BRASS, sides: 6, wear: 0.6 });
  }
  torus(H('pelvis'), V(0, Y1 + RAILH + 0.02, 0), RAIL, 0.013, 'y', { surf: 'bronze', tone: C.BRASS, tube: 5, radial: 40, wear: 0.6 });
  torus(H('pelvis'), V(0, Y1 + RAILH * 0.5, 0), RAIL, 0.008, 'y', { surf: 'bronze', tone: C.BRASS, tube: 4, radial: 40, wear: 0.6 });
  // a brass serial plate on the back ("4")
  {
    const c = V(0, Y0 + 0.42, -(R + 0.004));
    const Mp = basis(V(-1, 0, 0), V(0, 1, 0), V(0, 0, -1), c);
    const mk = H('pelvis').mark();
    plate(H('pelvis'), [[-0.04, -0.055], [0.04, -0.055], [0.04, 0.055], [-0.04, 0.055]], 0.006, 0, Mp, { surf: 'bronze', tone: C.STAFF, wear: 0.1 });
    H('pelvis').decalSince(mk, { frame: Mp, fn: (p) => numeralUV(4, (p.x + 0.04) / 0.08, 1 - (p.y + 0.055) / 0.11) });
  }

  /* ------------------------------- the ballast tanks ------------------------- */
  const TANKS = [];
  for (const s of [-1, 1]) {
    const c = V(s * G.tankX, G.tankY, 0), L = G.tankLen, r = G.tankR;
    const Mt = at(c.x, c.y, c.z - L / 2, AXIS_Z.clone());
    lathe(H('pelvis'), [P(0, 0, 'bronze', C.BRASS), P(r * 0.55, 0.004, 'bronze', C.BRASS), P(r * 0.9, 0.04, 'bronze', C.BRASS), P(r, 0.08, 'glaze', C.ENAMEL),
      P(r, L - 0.08, 'glaze', C.ENAMEL), P(r * 0.9, L - 0.04, 'bronze', C.BRASS), P(r * 0.55, L - 0.004, 'bronze', C.BRASS), P(0, L, 'bronze', C.BRASS)],
    Mt, { segs: 24, wear: 0.4, crease: 35 });
    for (const f of [0.3, 0.7]) {
      const z = c.z - L / 2 + L * f;
      lathe(H('pelvis'), [P(r - 0.002, -0.016, 'bronze', C.BRASS), P(r + 0.01, -0.012, 'bronze', C.BRASS), P(r + 0.01, 0.012, 'bronze', C.BRASS), P(r - 0.002, 0.016, 'bronze', C.BRASS)],
        at(c.x, c.y, z, AXIS_Z.clone()), { segs: 24, wear: 0.6 });
      rivetRing(H('pelvis'), V(c.x, c.y, z), V(0, 0, 1), r + 0.01, 8, 0.009, { radial: true, phase: 0.2 });
      // the saddle strap that carries it on the drum
      strut(H('pelvis'), V(c.x - s * r * 0.6, c.y + r * 0.7, z), V(s * (R - 0.02), c.y + 0.22, z * 0.9), 0.022, 0.02, { surf: 'graphite', tone: C.GUNMETAL, sides: 6 });
      strut(H('pelvis'), V(c.x - s * r * 0.6, c.y - r * 0.7, z), V(s * (R - 0.04), c.y - 0.16, z * 0.9), 0.022, 0.02, { surf: 'graphite', tone: C.GUNMETAL, sides: 6 });
    }
    // a vent valve on top, engraved band of ink at mid-length
    strut(H('pelvis'), V(c.x, c.y + r - 0.01, c.z + 0.18), V(c.x, c.y + r + 0.05, c.z + 0.18), 0.02, 0.018, { surf: 'bronze', tone: C.BRASS, sides: 8, wear: 0.6 });
    torus(H('pelvis'), V(c.x, c.y + r + 0.055, c.z + 0.18), 0.03, 0.007, 'y', { surf: 'bronze', tone: C.BRASS, tube: 4, radial: 10 });
    TANKS.push(c);
  }

  /* ------------------------------- the lamp turret (head) -------------------- */
  const LB = V(G.lampX, G.lampY, G.lampBackZ);
  const dr = lampDrum(H('head'), LB, V(0, 0, 1), { r: G.lampR, depth: G.lampDepth, ticks: 16 });
  plate(H('head'), [[-0.13, 0], [0.13, 0], [0.09, 0.07], [-0.09, 0.07]], 0.012, 0.003,
    basis(V(-1, 0, 0), V(0, 0.3, 1).normalize(), V(0, 1, -0.3).normalize(), V(G.lampX, G.lampY + G.lampR * 1.05, G.lampBackZ + G.lampDepth - 0.05)), { surf: 'glaze', tone: C.ENAMEL, wear: 0.4 });
  // its trunnion: a gunmetal saddle on the deck at the drum's front-left shoulder, a brass turret ring; the lamp drum
  // stands on it over the rim, outboard of the rail (fix round 1: at mid-wall, between the ballast tanks' brass ends, it
  // read as a porthole "eye")
  const TR = V(G.lampX, Y1 + 0.05, G.trunnionZ);
  lathe(H('pelvis'), [P(0.09, -0.02, 'graphite', C.GUNMETAL), P(0.095, 0.0, 'bronze', C.BRASS), P(0.09, 0.018, 'bronze', C.BRASS), P(0, 0.02, 'graphite', C.GUNMETAL)],
    at(TR.x, TR.y, TR.z), { segs: 18, wear: 0.6 });
  rivetRing(H('pelvis'), TR.clone().add(V(0, 0.019, 0)), V(0, 1, 0), 0.075, 6, 0.008);
  strut(H('head'), TR.clone().add(V(0, 0.01, 0)), V(G.lampX, G.lampY - G.lampR * 0.75, G.lampBackZ + 0.03), 0.035, 0.03, { surf: 'graphite', tone: C.GUNMETAL, sides: 10 });

  /* ------------------------------- the brine pump and sluice nozzle ---------- */
  const PX = G.pumpX;
  const PZ = Math.sqrt(R * R - PX * PX);
  rbox(H('pelvis'), V(PX, Y0 + 0.30, PZ + 0.07), [0.34, 0.36, 0.2], 0.03, { surf: 'bronze', tone: C.BRASS, wear: 0.6 });
  for (const [u, v] of [[-0.13, -0.14], [0.13, -0.14], [0.13, 0.14], [-0.13, 0.14]]) rivet(H('pelvis'), V(PX + u, Y0 + 0.30 + v, PZ + 0.172), V(0, 0, 1), 0.009);
  // the pump's piston, raked up the drum
  strut(H('pelvis'), V(PX + 0.1, Y0 + 0.48, PZ + 0.06), V(PX + 0.18, Y0 + 0.7, PZ - 0.06), 0.03, 0.028, { surf: 'bronze', tone: C.BRASS, sides: 10, wear: 0.6 });
  strut(H('pelvis'), V(PX + 0.18, Y0 + 0.7, PZ - 0.06), V(PX + 0.22, Y0 + 0.8, PZ - 0.14), 0.012, 0.012, { surf: 'chrome', tone: C.CHROME, sides: 8 });
  // the nozzle: a brass tube out and down from the pump, a flared mouth
  const N0 = V(PX, Y0 + 0.22, PZ + 0.16), N1 = V(PX, Y0 - 0.06, PZ + 0.44);
  strut(H('pelvis'), N0, N1, 0.062, 0.07, { surf: 'bronze', tone: C.BRASS, sides: 14, wear: 0.6 });
  const nd = N1.clone().sub(N0).normalize();
  {
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), nd);
    const Mn = new THREE.Matrix4().compose(N1, q, new THREE.Vector3(1, 1, 1));
    lathe(H('pelvis'), [P(0.066, -0.01, 'bronze', C.BRASS), P(0.085, 0.02, 'bronze', C.BRASS), P(0.092, 0.04, 'bronze', C.BRASS), P(0.07, 0.042, 'graphite', C.GUNMETAL), P(0.06, 0.02, 'graphite', C.GUNMETAL)], Mn, { segs: 18, wear: 0.6 });
    const NM = N0.clone().lerp(N1, 0.5);
    strut(H('pelvis'), NM.clone().addScaledVector(nd, -0.012), NM.clone().addScaledVector(nd, 0.012), 0.078, 0.078, { surf: 'graphite', tone: C.GUNMETAL, sides: 14 });
  }
  const MOUTH = N1.clone().addScaledVector(nd, 0.042);
  // the gate: a brass leaf over the mouth on a hinge across its top (a TOOL node: the kind swings it open)
  const GATE = new KBucket('gauge-gate');
  const side = new THREE.Vector3().crossVectors(nd, V(0, 1, 0)).normalize();       // across the mouth
  const up = new THREE.Vector3().crossVectors(side, nd).normalize();             // the mouth's top
  const HINGE = MOUTH.clone().addScaledVector(up, 0.1).addScaledVector(nd, 0.012);
  {
    const Mg = basis(side.clone().negate(), up, nd, MOUTH.clone().addScaledVector(nd, 0.012));   // right-handed (side x up = -nd)
    lathe(GATE, [P(0, -0.008, 'bronze', C.BRASS), P(0.098, -0.008, 'bronze', C.BRASS), P(0.104, 0.0, 'bronze', C.BRASS), P(0.098, 0.01, 'bronze', C.BRASS), P(0.05, 0.016, 'bronze', C.BRASS), P(0, 0.018, 'bronze', C.BRASS)],
      Mg.clone().multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), { segs: 18, wear: 0.6 });
    strut(GATE, HINGE.clone().addScaledVector(side, -0.07), HINGE.clone().addScaledVector(side, 0.07), 0.016, 0.016, { surf: 'graphite', tone: C.GUNMETAL, sides: 8 });
    rivet(GATE, MOUTH.clone().addScaledVector(nd, 0.03), nd, 0.012);
  }

  /* ------------------------------- the mast: tide staff and float ring -------- */
  const M0 = V(0, G.mast0, 0), M1 = V(0, G.mast1, 0);
  // the staff's foot: a brass boss on the deck
  lathe(H('pelvis'), [P(0, Y1 + 0.03, 'bronze', C.BRASS), P(0.16, Y1 + 0.03, 'bronze', C.BRASS), P(0.15, Y1 + 0.07, 'bronze', C.BRASS), P(0.1, Y1 + 0.1, 'bronze', C.BRASS), P(0.085, Y1 + 0.14, 'bronze', C.BRASS)],
    at(0, 0, 0), { segs: 20, wear: 0.6 });
  rivetRing(H('pelvis'), V(0, Y1 + 0.045, 0), V(0, 1, 0), 0.14, 8, 0.009, { radial: true });
  staff(H('pelvis'), M0.clone().add(V(0, 0.12, 0)), M1, G.mastR, G.mastR * 0.88, { sides: 10, face: V(0, 0, 1) });
  // the float ring (TOOL node): a brass ring with an enamel band, two guide rollers on the staff
  const FLOAT = new KBucket('gauge-float');
  const FC = V(0, G.floatY, 0);
  lathe(FLOAT, [P(G.mastR + 0.012, -0.05, 'bronze', C.BRASS), P(G.floatR, -0.045, 'bronze', C.BRASS), P(G.floatR + 0.012, -0.03, 'glaze', C.ENAMEL),
    P(G.floatR + 0.012, 0.03, 'glaze', C.ENAMEL), P(G.floatR, 0.045, 'bronze', C.BRASS), P(G.mastR + 0.012, 0.05, 'bronze', C.BRASS), P(G.mastR + 0.006, 0, 'graphite', C.GUNMETAL), P(G.mastR + 0.012, -0.05, 'bronze', C.BRASS)],
  at(FC.x, FC.y, FC.z), { segs: 24, wear: 0.5, crease: 35 });
  rivetRing(FLOAT, FC, V(0, 1, 0), G.floatR + 0.012, 8, 0.009, { radial: true });
  // a vermilion index tick on the ring's front (flat ink): where the staff is read
  rbox(FLOAT, V(0, FC.y, G.floatR + 0.016), [0.03, 0.012, 0.008], 0.002, { surf: 'glaze', tone: C.VERM });
  // the yard and its two banners
  {
    const yl = V(-G.yardHalf, G.yardY, 0), yr = V(G.yardHalf, G.yardY, 0);
    strut(H('pelvis'), yl, yr, 0.016, 0.016, { surf: 'bronze', tone: C.BRASS, sides: 8, wear: 0.6 });
    lathe(H('pelvis'), [P(G.mastR + 0.03, -0.035, 'bronze', C.BRASS), P(G.mastR + 0.03, 0.035, 'bronze', C.BRASS)], at(0, G.yardY, 0), { segs: 14, wear: 0.6 });
    for (const s of [-1, 1]) {
      ball(H('pelvis'), V(s * G.yardHalf, G.yardY, 0), 0.026, { surf: 'bronze', tone: C.BRASS, w: 10, h: 6 });
      strut(H('pelvis'), V(s * G.yardHalf, G.yardY, 0), V(s * (G.yardHalf + 0.07), G.yardY, 0), 0.01, 0.0015, { surf: 'bronze', tone: C.BRASS, sides: 6 });
      // a stay from the staff to the yard end
      strut(H('pelvis'), V(0, G.yardY - 0.36, 0), V(s * G.yardHalf * 0.8, G.yardY - 0.01, 0), 0.006, 0.006, { surf: 'graphite', tone: C.GUNMETAL, sides: 5 });
      banner(H('pelvis'), V(s * G.yardHalf * 0.72, G.yardY - 0.035, 0.03), V(1, 0, 0), { w: 0.2, h: 0.74, out: V(0, 0, 1), tone: BANNER_PALE, hem: C.STAFF });
    }
  }

  /* ------------------------------- the lantern ------------------------------- */
  const GR = G.glassR;
  lathe(H('pelvis'), [P(G.mastR * 0.88, G.mast1 - 0.02, 'bronze', C.BRASS), P(GR + 0.04, G.glass0 - 0.05, 'bronze', C.BRASS), P(GR + 0.045, G.glass0 - 0.01, 'bronze', C.BRASS),
    P(GR + 0.02, G.glass0 + 0.01, 'bronze', C.BRASS), P(GR - 0.01, G.glass0 + 0.012, 'graphite', C.GUNMETAL)], at(0, 0, 0), { segs: 28, wear: 0.6, crease: 30 });
  rivetRing(H('pelvis'), V(0, G.glass0 - 0.03, 0), V(0, 1, 0), GR + 0.045, 10, 0.009, { radial: true });
  // the glass: a pale-ice column lit from inside (the sensor bucket); a slim inner staff shows as a darker core
  lathe(GL('pelvis'), [P(GR - 0.004, G.glass0 + 0.006, 'lamp', C.ICE), P(GR, G.glass0 + 0.03, 'lamp', C.ICE), P(GR, G.glass1 - 0.03, 'lamp', C.ICE), P(GR - 0.004, G.glass1 - 0.006, 'lamp', C.ICE)],
    at(0, 0, 0), { segs: 24, wear: 0, crease: 50 });
  // six brass mullions, three brass glazing bands
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.sin(a) * (GR + 0.008), z = Math.cos(a) * (GR + 0.008);
    strut(H('pelvis'), V(x, G.glass0, z), V(x, G.glass1, z), 0.014, 0.014, { surf: 'bronze', tone: C.BRASS, sides: 6, wear: 0.6 });
  }
  for (const f of [0.34, 0.67]) torus(H('pelvis'), V(0, G.glass0 + (G.glass1 - G.glass0) * f, 0), GR + 0.006, 0.006, 'y', { surf: 'bronze', tone: C.BRASS, tube: 4, radial: 30 });
  // the gyroscope ring round the lantern, tilted on two pivots (the family's gyroscope rings)
  {
    const tilt = THREE.MathUtils.degToRad(18);
    const ax = V(0, Math.cos(tilt), Math.sin(tilt));
    gyroRing(H('pelvis'), V(0, (G.glass0 + G.glass1) / 2, 0), ax, GR + 0.13, 0.016, { pivot: V(1, 0, 0), radial: 40 });
    for (const s of [-1, 1]) strut(H('pelvis'), V(s * (GR + 0.015), (G.glass0 + G.glass1) / 2, 0), V(s * (GR + 0.1), (G.glass0 + G.glass1) / 2, 0), 0.01, 0.01, { surf: 'graphite', tone: C.GUNMETAL, sides: 6 });
  }
  // the gallery cap and the roof
  lathe(H('pelvis'), [P(GR - 0.01, G.glass1 - 0.012, 'graphite', C.GUNMETAL), P(GR + 0.02, G.glass1 - 0.01, 'bronze', C.BRASS), P(GR + 0.05, G.glass1 + 0.02, 'bronze', C.BRASS),
    P(GR + 0.05, G.glass1 + 0.05, 'bronze', C.BRASS), P(GR + 0.035, G.glass1 + 0.06, 'glaze', C.ENAMEL), P(0.06, G.roof - 0.02, 'glaze', C.ENAMEL), P(0.035, G.roof, 'bronze', C.BRASS), P(0, G.roof + 0.004, 'bronze', C.BRASS)],
  at(0, 0, 0), { segs: 28, wear: 0.4, crease: 30 });
  rivetRing(H('pelvis'), V(0, G.glass1 + 0.035, 0), V(0, 1, 0), GR + 0.05, 10, 0.009, { radial: true, phase: 0.3 });
  antenna(H('pelvis'), V(0, G.roof - 0.01, 0), V(0, G.top, 0), { r: 0.012, finial: 0.1, cross: 0.06 });

  /* ------------------------------- the stilts -------------------------------- */
  const LEGS = [];
  for (const [row, hinge] of [['F', 1], ['H', -1]]) {
    for (const s of [1, -1]) {
      const zs = row === 'F' ? 1 : -1;
      const id = (s > 0 ? 'R' : 'L') + row;
      const hip = V(s * G.hipR, G.hipY, zs * G.hipR);
      const ankle = V(s * G.footX, 0.11, zs * G.footZ);
      const knee = solveKnee(hip, ankle, hinge, G.thigh, G.shin);
      const toe = ankle.clone().add(V(s * 0.02, -0.1, zs * 0.08));
      LEGS.push({ id, hinge, hip, knee, ankle, toe, s, zs });
    }
  }
  for (const Lg of LEGS) {
    const thigh = `${Lg.id}_thigh`, shin = `${Lg.id}_shin`, foot = `${Lg.id}_foot`;
    // the hip: a brass gimbal boss under the drum
    lathe(H('pelvis'), [P(0, 0.06, 'graphite', C.GUNMETAL), P(0.09, 0.06, 'bronze', C.BRASS), P(0.1, 0.02, 'bronze', C.BRASS), P(0.07, -0.02, 'graphite', C.GUNMETAL), P(0, -0.02, 'graphite', C.GUNMETAL)],
      at(Lg.hip.x, Lg.hip.y + 0.02, Lg.hip.z), { segs: 16, wear: 0.5 });
    ball(H(thigh), Lg.hip, 0.07, { surf: 'graphite', tone: C.GUNMETAL, w: 12, h: 8 });
    strut(H(thigh), Lg.hip, Lg.knee, 0.055, 0.048, { surf: 'graphite', tone: C.GUNMETAL, sides: 10 });
    strut(H(thigh), Lg.hip.clone().lerp(Lg.knee, 0.15), Lg.hip.clone().lerp(Lg.knee, 0.78), 0.074, 0.062, { surf: 'glaze', tone: C.ENAMEL, sides: 10, wear: 0.4 });
    const td = Lg.knee.clone().sub(Lg.hip).normalize();
    for (const f of [0.2, 0.73]) {
      const c = Lg.hip.clone().lerp(Lg.knee, f);
      strut(H(thigh), c.clone().addScaledVector(td, -0.012), c.clone().addScaledVector(td, 0.012), 0.082, 0.082, { surf: 'bronze', tone: C.BRASS, sides: 12, wear: 0.6 });
    }
    // the knee SEAL: a gunmetal collar between two brass rings, a brass axle boss each side
    const axle = new THREE.Vector3().crossVectors(Lg.knee.clone().sub(Lg.hip), Lg.ankle.clone().sub(Lg.knee)).normalize();
    ball(H(thigh), Lg.knee, 0.062, { surf: 'graphite', tone: C.GUNMETAL, w: 12, h: 8 });
    strut(H(thigh), Lg.knee.clone().addScaledVector(axle, -0.07), Lg.knee.clone().addScaledVector(axle, 0.07), 0.05, 0.05, { surf: 'bronze', tone: C.BRASS, sides: 12, wear: 0.6 });
    const sd = Lg.ankle.clone().sub(Lg.knee).normalize();
    const s0 = Lg.knee.clone().addScaledVector(sd, 0.05), s1 = Lg.knee.clone().addScaledVector(sd, 0.16);
    strut(H(shin), s0, s1, 0.058, 0.058, { surf: 'rubber', tone: C.GRAPH, sides: 12 });
    strut(H(shin), s0.clone().addScaledVector(sd, -0.012), s0.clone().addScaledVector(sd, 0.014), 0.066, 0.066, { surf: 'bronze', tone: C.BRASS, sides: 12, wear: 0.6 });
    strut(H(shin), s1.clone().addScaledVector(sd, -0.014), s1.clone().addScaledVector(sd, 0.012), 0.066, 0.066, { surf: 'bronze', tone: C.BRASS, sides: 12, wear: 0.6 });
    // the shin: a long graduated enamel stilt, gunmetal at its foot
    const sEnd = Lg.ankle.clone().addScaledVector(sd, -0.32);
    staff(H(shin), s1.clone().addScaledVector(sd, 0.012), sEnd, 0.044, 0.036, { sides: 8, face: V(Lg.s, 0, Lg.zs).normalize() });
    strut(H(shin), sEnd, Lg.ankle, 0.034, 0.028, { surf: 'graphite', tone: C.GUNMETAL, sides: 8 });
    strut(H(shin), sEnd.clone().addScaledVector(sd, -0.012), sEnd.clone().addScaledVector(sd, 0.02), 0.042, 0.042, { surf: 'bronze', tone: C.BRASS, sides: 8, wear: 0.6 });
    // the foot: a ball joint and a wide disc pad (it stands in mud and brine)
    ball(H(foot), Lg.ankle, 0.04, { surf: 'graphite', tone: C.GUNMETAL, w: 10, h: 6 });
    const pad = V(Lg.ankle.x, 0, Lg.ankle.z);
    lathe(H(foot), [P(0, 0, 'rubber', C.RUBBER), P(0.125, 0, 'rubber', C.RUBBER), P(0.13, 0.02, 'bronze', C.BRASS), P(0.09, 0.055, 'bronze', C.BRASS), P(0.04, 0.075, 'graphite', C.GUNMETAL), P(0, 0.078, 'graphite', C.GUNMETAL)],
      at(pad.x, pad.y, pad.z), { segs: 16, wear: 0.6 });
    rivetRing(H(foot), V(pad.x, 0.035, pad.z), V(0, 1, 0), 0.11, 6, 0.009, { radial: true });
    strut(H(foot), Lg.ankle, V(pad.x, 0.07, pad.z), 0.03, 0.03, { surf: 'graphite', tone: C.GUNMETAL, sides: 8 });
  }

  /* --------------------------------- recentre -------------------------------- */
  const all = [...hull.values(), ...glass.values(), FLOAT, GATE];
  const box = new THREE.Box3();
  for (const b of all) b.bounds(box);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, y0 = box.min.y;
  for (const b of all) b.translate(-cx, -y0, -cz);
  const sh = (v) => [+(v.x - cx).toFixed(4), +(v.y - y0).toFixed(4), +(v.z - cz).toFixed(4)];
  const size = box.getSize(new THREE.Vector3());

  const rigSpec = {
    spine: [
      { name: 'pelvis', pos: sh(V(0, Y0 + 0.4, 0)), r: 0.9 },
      { name: 'head', pos: sh(TR), r: 0.2, tip: sh(V(G.lampX, G.lampY, G.lampBackZ + G.lampDepth + 0.12)) },
    ],
    tail: [],
    legGateY: +(G.hipY - 0.05 - y0).toFixed(4),
    legInboard: 0.2,
    legs: LEGS.map((Lg) => ({
      id: Lg.id, parent: 'pelvis', hinge: Lg.hinge,
      hip: sh(Lg.hip), knee: sh(Lg.knee), ankle: sh(Lg.ankle), toe: sh(Lg.toe),
      r: 0.14, restFoot: [sh(Lg.ankle)[0], sh(Lg.ankle)[2]],
    })),
  };
  const BONE_ORDER = [
    ...rigSpec.spine.map((s) => s.name),
    ...rigSpec.legs.flatMap((l) => [`${l.id}_thigh`, `${l.id}_shin`, `${l.id}_foot`]),
  ];
  const sockets = {
    lamp: sh(dr.face), lampR: +dr.radius.toFixed(4),
    tanks: TANKS.map(sh), tankR: G.tankR, tankLen: G.tankLen,
    knees: LEGS.map((Lg) => sh(Lg.knee.clone().addScaledVector(Lg.ankle.clone().sub(Lg.knee).normalize(), 0.105))),
    kneeIds: LEGS.map((Lg) => Lg.id),
    mouth: sh(MOUTH), nozzleDir: [+nd.x.toFixed(4), +nd.y.toFixed(4), +nd.z.toFixed(4)], gateHinge: sh(HINGE), gateAxis: [+side.x.toFixed(4), +side.y.toFixed(4), +side.z.toFixed(4)],
    floatRest: sh(FC), floatTravel: +(G.mast1 - 0.1 - G.floatY).toFixed(4),
    mastFoot: sh(M0), mastTop: sh(M1), lantern: sh(V(0, (G.glass0 + G.glass1) / 2, 0)), lanternR: GR,
    pump: sh(V(PX, Y0 + 0.3, PZ + 0.07)),
    drumBottom: +(Y0 - G.keel - y0).toFixed(4), waterline: +(Y0 - y0).toFixed(4),
    top: sh(V(0, G.top, 0)),
  };

  const hullAll = mergeLabelled(hull, BONE_ORDER, 'gauge-hull');
  const glassAll = mergeLabelled(glass, BONE_ORDER, 'gauge-lantern');
  const fin = finish(hullAll, { occluders: [glassAll, FLOAT, GATE], rays: 28, dist: 0.4, footBand: noDust ? 0 : 0.6, lamps: [], verdigris: 0.3 });
  finish(FLOAT, { occluders: [hullAll], rays: 28, dist: 0.4, footBand: 0, lamps: [], verdigris: 0.3 });
  finish(GATE, { occluders: [hullAll], rays: 28, dist: 0.4, footBand: 0, lamps: [], verdigris: 0.3 });
  const lod1 = await lod1From(hullAll, 0.3, 'gauge-lod1');

  const target = file || path.join(out, OUTPUTS[0]);
  const ICE_LIN = new THREE.Color(C.ICE);   // linear (ColorManagement)
  // fix round 1: at base colour 0.62 0.78 0.76 the golden sun lit the glass's albedo past its own glow and it rendered
  // cream (#EBE4D3 in F23-gauge). A dark cold glass leaves the ice emissive (<= #D6F0EE) to carry the colour
  const GLASS_BASE = [0.07, 0.11, 0.12, 1];
  const stats = await writeInstrument([
    { bucket: hullAll, role: 'hull', material: { name: 'r5-gauge-hull' } },
    // the lantern: pale-ice glass lit from inside (emissive), the only emissive surface; the lamp's iris is drawn by
    // the lamp system at the drum's face
    { bucket: glassAll, role: 'sensor', material: { name: 'r5-gauge-lantern-glass', emissive: [ICE_LIN.r, ICE_LIN.g, ICE_LIN.b], baseColor: GLASS_BASE } },
    { bucket: FLOAT, role: 'tool', material: { name: 'r5-gauge-hull', anchor: sockets.floatRest } },
    { bucket: GATE, role: 'tool', material: { name: 'r5-gauge-hull', anchor: sockets.gateHinge } },
    { bucket: lod1, role: 'lod1', material: { name: 'r5-gauge-hull' } },
  ], {
    file: target,
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    extras: {
      r5Rig: rigSpec, r5BoneOrder: BONE_ORDER,
      r5Size: [+size.x.toFixed(4), +size.y.toFixed(4), +size.z.toFixed(4)],
      r5Sockets: sockets,
      r5Generator: { name: RECIPE, design: 'gauge', kit: 'M1.4a', licence: 'original work (generated), no third-party assets' },
    },
  });
  return {
    kind: 'gauge', file: path.relative(out, target), bytes: stats.bytes, tris: stats.tris, meshTris: stats.meshTris, verts: stats.verts,
    materials: stats.materials, textures: stats.textures, bones: BONE_ORDER.length, legs: LEGS.length, aoMean: +fin.aoMean.toFixed(3),
    size: { x: +size.x.toFixed(3), y: +size.y.toFixed(3), z: +size.z.toFixed(3) },
    _buckets: { hullAll, glassAll, float: FLOAT, gate: GATE, lod1, sockets, size },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const r = await build({ out: i >= 0 ? path.resolve(process.argv[i + 1]) : ROOT });
  delete r._buckets;
  console.log(JSON.stringify(r));
}
