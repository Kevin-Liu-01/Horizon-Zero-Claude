#!/usr/bin/env node
/**
 * CALIMA — the TILLER generator (instruments; BIBLE §7.4 #3; M2 wave 2 "the look"). Original work: no third-party
 * asset is read. Built from the shared hull kit (`parts/kit.mjs`, M1.4a) and the plated shell (`parts/shell.mjs`), the
 * maker of the Plumb, the Peg and the Gauge.
 *
 *   node tools/build/instruments/gen-tiller.mjs [--out <dir>]
 *     -> public/models/instruments/tiller.glb   (hull, vial glass, the auger as a tool, LOD1 caster)
 *
 * THE CORRECTED TILLER (owner question Q1's default and the wave 1 ruling 7: "the Tiller that plays becomes the
 * corrected form in wave 2, so the herd gives cover"). The M1 body was three turned segments on a 1.30 m keel with
 * its drum lamp on a neck; the sightline passed under its belly (IN0: 0 m of her lee walk hidden in 29 of 32 cases).
 * This is the default form IN0 chose, finished (2.7 m, about 4.4 x 1.8 m):
 *   - a long PLATED HULL lofted on rounded sections, 1.34 m wide, belly 1.25 m, a crowned deck to 2.40 m: white enamel
 *     plates over gunmetal seams, brass rivets down every plate edge, a brass rubbing strake along each flank, the
 *     serial "06" in brass numerals on the bow flanks;
 *   - a DUST SKIRT of riveted enamel plates hanging from both flanks to 0.5 m over the ground (brass foot strips), and
 *     a bow and a stern plate to 0.9 m: the hull's sight shadow (src/instruments/lib/blockout.js form `built`);
 *   - SIX HIGH-KNEED STILTS outside the skirt (gunmetal thighs under enamel greaves, brass knee hubs at 2.0 m, enamel
 *     shins with a vermilion graduation, gunmetal pistons, riveted disc feet), alternating tripod;
 *   - at the bow the LAMP: a kit lamp drum (brass bezel, the vernier on its face) in a gunmetal U-yoke on a graduated
 *     brass turret ring set on a chin shelf: a theodolite's drum on the hull, never on a neck (the `head` bone turns
 *     it in its yoke);
 *   - on the crown a turned enamel SEED HOPPER with a brass rim (the vernier) and a pale-ice LEVEL VIAL in a brass
 *     cradle under a tilted gyroscope ring; aft two ANTENNAE with spike finials to 2.70 m, the taller carrying a small
 *     faded orchil BANNER on a yard;
 *   - at the stern a turned collar and the coring AUGER (a tool node on `tail2`: Pry tears it off).
 *
 * The rig keeps the M1 Tiller's bone set and order (pelvis, chest, neck, head, tail1, tail2, six legs x 3), so the
 * kind file, the gait, the herd and every staged row read the same skeleton. The GLB carries a `_BONE` attribute per
 * vertex and the autorig spec in `asset.extras.r5Rig`; `r5Size` is the design box [x, y, z] in metres.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { V, strut, ball, rbox, torus, plate, lathe, basis, at, AXIS_Z, cable } from '../lib/hs.mjs';
import {
  THREE, C, KBucket, mergeLabelled, finish, writeInstrument, solveKnee, numeralUV, lod1From, BAND, bandV,
  resetKitStats, rivet, rivetRing, lampDrum, limbRing, gyroRing, antenna, banner, levelVial,
} from './parts/kit.mjs';
import { loftShell, surveyLeg, skirtPlate } from './parts/shell.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const LANE = 'instruments';
export const RECIPE = 'tools/build/instruments/gen-tiller.mjs';
export const OUTPUTS = ['public/models/instruments/tiller.glb'];

/** The banner: the Gauge's sun-bleached orchil with a pale linen hem (it reads against basalt and crust by value). */
const BANNER_PALE = 0xa392ab;
/** A slightly dustier enamel for the belly plates (they sit in the hull's own shade). */
const ENAMEL_LOW = 0xd8cdb8;

/** Design constants (before the recentre). */
export const TILLER = Object.freeze({
  sections: [
    { z: -1.78, w: 0.36, yb: 1.48, ym: 1.70, yt: 1.92, n: 2.6 },
    { z: -1.55, w: 0.56, yb: 1.32, ym: 1.68, yt: 2.12, n: 2.8 },
    { z: -0.95, w: 0.66, yb: 1.26, ym: 1.66, yt: 2.33, n: 3 },
    { z: 0.00, w: 0.67, yb: 1.25, ym: 1.66, yt: 2.40, n: 3 },
    { z: 0.95, w: 0.66, yb: 1.26, ym: 1.66, yt: 2.31, n: 3 },
    { z: 1.45, w: 0.58, yb: 1.32, ym: 1.68, yt: 2.10, n: 2.8 },
    { z: 1.68, w: 0.42, yb: 1.44, ym: 1.70, yt: 1.94, n: 2.6 },
  ],
  split: 0.3,                                   // the pelvis / chest seam
  skirtX: 0.665, skirtTop: 1.42, skirtBot: 0.5, skirtEnd: 0.66, skirtD: 0.03,
  endPlateBot: 0.9,
  hipX: 0.75, hipY: 1.62, hipZ: 1.15, footX: 0.80, footZ: 1.48, footY: 0.13, thigh: 0.6, shin: 1.95, pad: 0.12,
  chinY: 1.54, chinZ0: 1.52, chinZ1: 2.02,
  drumC: [0, 1.86, 1.70], drumR: 0.19, drumDepth: 0.26,
  hopperZ: -0.15, mastZ: -1.22, top: 2.70,
});

export async function build({ out = ROOT, file = null, preview = false } = {}) {
  resetKitStats();
  const T = TILLER;
  const P = (r, h, surf, tone) => ({ r, h, surf, tone });
  const hull = new Map(), glass = new Map();
  const H = (b) => { if (!hull.has(b)) hull.set(b, new KBucket(`hull:${b}`)); return hull.get(b); };
  const GL = (b) => { if (!glass.has(b)) glass.set(b, new KBucket(`glass:${b}`)); return glass.get(b); };

  /* ------------------------------- the plated hull --------------------------- */
  const shellOpts = {
    seamsU: [0.06, 0.2, 0.33, 0.5, 0.67, 0.8, 0.94], seamsZ: [-1.2, -0.45, T.split, 1.05],
    rivetEvery: 0.25, uSteps: 44, zStep: 0.12,
    plateTone: (u0, u1) => ((u0 >= 0.33 && u1 <= 0.67) ? ENAMEL_LOW : C.ENAMEL),
  };
  const rear = loftShell(H('pelvis'), T.sections, { ...shellOpts, zMax: T.split, caps: [true, false] });
  loftShell(H('chest'), T.sections, { ...shellOpts, zMin: T.split, caps: [false, true] });
  const skin = rear;   // at(u, z) reads the whole run (the sections are shared)

  // the brass rubbing strake along each flank, just above the widest line
  for (const s of [1, -1]) {
    for (const [bone, za, zb] of [['pelvis', -1.62, T.split - 0.02], ['chest', T.split + 0.02, 1.56]]) {
      const pts = [];
      for (let k = 0; k <= 12; k++) {
        const z = za + (zb - za) * k / 12, q = skin.at(s > 0 ? 0.25 - 0.02 : 0.75 + 0.02, z);
        pts.push(q.p.clone().addScaledVector(q.n, 0.012));
      }
      cable(H(bone), pts, 0.02, { surf: 'bronze', tone: C.BRASS, segs: 24, radial: 6, wear: 0.6 });
    }
  }
  // brass hoops over the cross seams, crown to strake (the Gauge's hoops): the shell reads as riveted bands
  for (const [z, bone] of [[-1.2, 'pelvis'], [-0.45, 'pelvis'], [1.05, 'chest']]) {
    const pts = [];
    for (let k = 0; k <= 16; k++) {
      const u = 0.27 + (0.46 * k) / 16, q = skin.at((u + 0.5) % 1, z);   // over the crown, flank to flank
      pts.push(q.p.clone().addScaledVector(q.n, 0.01));
    }
    cable(H(bone), pts, 0.018, { surf: 'bronze', tone: C.BRASS, segs: 32, radial: 5, wear: 0.6 });
  }
  // the keel: a gunmetal strip under the belly
  rbox(H('pelvis'), V(0, 1.235, -0.72), [0.26, 0.06, 1.9], 0.02, { surf: 'graphite', tone: C.GUNMETAL, wear: 0.2 });
  rbox(H('chest'), V(0, 1.24, 0.85), [0.24, 0.06, 1.0], 0.02, { surf: 'graphite', tone: C.GUNMETAL, wear: 0.2 });

  // the serial "06" in brass numerals on each bow flank
  for (const s of [1, -1]) {
    const q = skin.at(s > 0 ? 0.2 : 0.8, 1.05);
    const n = q.n.clone().setY(0).normalize();
    for (const [j, dgt] of [[0, 0], [1, 6]]) {
      const c = q.p.clone().addScaledVector(n, 0.006).add(V(0, 0, (j - 0.5) * 0.08 * s));
      const Mp = basis(V(0, 0, s), V(0, 1, 0), n.clone(), c);
      const mk = H('chest').mark();
      plate(H('chest'), [[-0.034, -0.048], [0.034, -0.048], [0.034, 0.048], [-0.034, 0.048]], 0.006, 0, Mp, { surf: 'bronze', tone: C.STAFF, wear: 0.1 });
      H('chest').decalSince(mk, { frame: Mp, fn: (p) => numeralUV(dgt, (p.x + 0.034) / 0.068, 1 - (p.y + 0.048) / 0.096) });
    }
  }

  /* ------------------------------- the dust skirt ---------------------------- */
  // flank plates: three per side, hanging from a gunmetal rail under the strake (the stilts pass outside them)
  // the hem is a shallow arc: 0.5 m over the ground amidships, rising to `skirtEnd` at the bow and stern
  const hemAt = (z) => T.skirtBot + (T.skirtEnd - T.skirtBot) * Math.pow(Math.min(1, Math.abs(z) / 1.66), 2.2);
  const SK = [[-1.66, -0.58, 'pelvis', C.ENAMEL], [-0.54, T.split - 0.02, 'pelvis', ENAMEL_LOW], [T.split + 0.02, 0.62, 'chest', C.ENAMEL], [0.66, 1.62, 'chest', ENAMEL_LOW]];
  for (const s of [1, -1]) {
    for (const [za, zb, bone, tone] of SK) {
      const L = zb - za, mz = (za + zb) / 2, h = T.skirtTop - T.skirtBot;
      const M = basis(V(0, 0, s), V(0, 1, 0), V(s, 0, 0), V(s * T.skirtX, T.skirtBot + h / 2, mz));
      // the hem follows the arc (local x runs along +z on the right flank, -z on the left)
      const hem = [];
      for (let k = 0; k <= 6; k++) { const lx = -L / 2 + (L * k) / 6; hem.push([lx, hemAt(mz + s * lx) - T.skirtBot - h / 2]); }
      skirtPlate(H(bone), [...hem, [L / 2, h / 2], [-L / 2, h / 2]], M, { d: T.skirtD, every: 0.2, tone, foot: false, rows: 1 });
      // a brass hem strip along the arc
      for (let k = 0; k < 6; k++) {
        const a = new THREE.Vector3(hem[k][0], hem[k][1] + 0.012, 0).applyMatrix4(M), b = new THREE.Vector3(hem[k + 1][0], hem[k + 1][1] + 0.012, 0).applyMatrix4(M);
        strut(H(bone), a, b, T.skirtD * 0.75, T.skirtD * 0.75, { surf: 'bronze', tone: C.BRASS, sides: 8, wear: 0.6 });
      }
      // a gunmetal batten down each plate's middle (stiffener)
      strut(H(bone), new THREE.Vector3(0, hem[3][1] + 0.04, T.skirtD / 2 + 0.004).applyMatrix4(M), new THREE.Vector3(0, h / 2 - 0.05, T.skirtD / 2 + 0.004).applyMatrix4(M), 0.014, 0.014, { surf: 'graphite', tone: C.GUNMETAL, sides: 6 });
      // the hanger rail and two hangers to the hull
      strut(H(bone), V(s * (T.skirtX - 0.005), T.skirtTop - 0.01, za + 0.03), V(s * (T.skirtX - 0.005), T.skirtTop - 0.01, zb - 0.03), 0.022, 0.022, { surf: 'graphite', tone: C.GUNMETAL, sides: 8 });
      for (const f of [0.22, 0.78]) {
        const z = za + L * f, q = skin.at(s > 0 ? 0.31 : 0.69, z);
        strut(H(bone), V(s * (T.skirtX - 0.01), T.skirtTop - 0.02, z), q.p.clone().addScaledVector(q.n, -0.01), 0.018, 0.016, { surf: 'graphite', tone: C.GUNMETAL, sides: 6 });
      }
    }
  }
  // bow and stern plates to 0.9 m
  for (const [z, s, bone] of [[1.62, 1, 'chest'], [-1.66, -1, 'pelvis']]) {
    const w = 1.18, h = T.skirtTop - T.endPlateBot;
    const M = basis(V(-s, 0, 0), V(0, 1, 0), V(0, 0, s), V(0, T.endPlateBot + h / 2, z));
    skirtPlate(H(bone), [[-w / 2 + 0.08, -h / 2], [w / 2 - 0.08, -h / 2], [w / 2, -h / 2 + 0.06], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2 + 0.06]], M, { d: T.skirtD, every: 0.2, rows: 1 });
    strut(H(bone), V(-w / 2 + 0.02, T.skirtTop - 0.01, z - s * 0.01), V(w / 2 - 0.02, T.skirtTop - 0.01, z - s * 0.01), 0.02, 0.02, { surf: 'graphite', tone: C.GUNMETAL, sides: 8 });
  }

  /* ------------------------------- the bow: chin shelf, turret, lamp drum ------ */
  const CHZ = (T.chinZ0 + T.chinZ1) / 2;
  rbox(H('chest'), V(0, T.chinY, CHZ), [0.6, 0.07, T.chinZ1 - T.chinZ0], 0.02, { surf: 'glaze', tone: C.ENAMEL, wear: 0.4 });
  strut(H('chest'), V(-0.3, T.chinY - 0.035, T.chinZ1 - 0.01), V(0.3, T.chinY - 0.035, T.chinZ1 - 0.01), 0.016, 0.016, { surf: 'bronze', tone: C.BRASS, sides: 8, wear: 0.6 });
  for (const s of [1, -1]) strut(H('chest'), V(s * 0.24, T.chinY - 0.03, T.chinZ0 + 0.02), V(s * 0.16, 1.36, 1.5), 0.026, 0.022, { surf: 'graphite', tone: C.GUNMETAL, sides: 8 });
  const TUR = V(0, T.chinY + 0.04, T.drumC[2] + 0.12);
  limbRing(H('chest'), at(TUR.x, TUR.y, TUR.z), 0.12, 0.25, 0.022, { ticks: 24, faceSurf: 'bronze', faceTone: C.BRASS });
  rivetRing(H('chest'), TUR.clone().add(V(0, 0.012, 0)), V(0, 1, 0), 0.235, 10, 0.009);
  // the yoke (head bone): a gunmetal post, a cross bar, two enamel cheeks with brass trunnions
  const DR = V(...T.drumC), DC = DR.clone().add(V(0, 0, T.drumDepth / 2));
  strut(H('neck'), TUR.clone().add(V(0, 0.01, 0)), TUR.clone().add(V(0, 0.07, 0)), 0.07, 0.06, { surf: 'graphite', tone: C.GUNMETAL, sides: 14 });
  strut(H('head'), V(-0.27, TUR.y + 0.07, DC.z), V(0.27, TUR.y + 0.07, DC.z), 0.03, 0.03, { surf: 'graphite', tone: C.GUNMETAL, sides: 8 });
  for (const s of [1, -1]) {
    plate(H('head'), [[-0.07, -0.02], [0.07, -0.02], [0.05, 0.27], [-0.05, 0.27]], 0.024, 0.005,
      basis(V(0, 0, -s), V(0, 1, 0), V(s, 0, 0), V(s * 0.255, TUR.y + 0.07, DC.z)), { surf: 'glaze', tone: C.ENAMEL, wear: 0.45 });
    strut(H('head'), V(s * (T.drumR + 0.005), DC.y, DC.z), V(s * 0.285, DC.y, DC.z), 0.042, 0.042, { surf: 'bronze', tone: C.BRASS, sides: 12, wear: 0.6 });
    rivet(H('head'), V(s * 0.286, DC.y, DC.z), V(s, 0, 0), 0.012);
  }
  const dr = lampDrum(H('head'), DR, V(0, 0, 1), { r: T.drumR, depth: T.drumDepth, ticks: 16 });
  // a visor over the drum (enamel, riveted): shade for the iris in a low sun
  plate(H('head'), [[-0.17, 0], [0.17, 0], [0.13, 0.08], [-0.13, 0.08]], 0.012, 0.003,
    basis(V(-1, 0, 0), V(0, 0.25, 1).normalize(), V(0, 1, -0.25).normalize(), V(0, DR.y + T.drumR * 1.04, DR.z + T.drumDepth - 0.06)), { surf: 'glaze', tone: C.ENAMEL, wear: 0.4 });

  /* ------------------------------- the crown: hopper, vial, gyro, antennae ----- */
  const crown = (z) => skin.at(0, z).p;
  const HOP = crown(T.hopperZ).clone().add(V(0, -0.03, 0));
  const hopMk = H('pelvis').mark();
  lathe(H('pelvis'), [
    P(0, 0, 'graphite', C.GUNMETAL), P(0.26, 0, 'graphite', C.GUNMETAL), P(0.27, 0.04, 'glaze', C.ENAMEL),
    P(0.29, 0.10, 'glaze', C.ENAMEL), P(0.30, 0.13, 'bronze', C.BRASS), P(0.315, 0.16, 'bronze', C.BRASS),
    P(0.28, 0.17, 'graphite', C.GUNMETAL), P(0.22, 0.09, 'graphite', C.GUNMETAL), P(0, 0.09, 'graphite', C.GUNMETAL),
  ], at(HOP.x, HOP.y, HOP.z), { segs: 36, wear: 0.4, crease: 30 });
  H('pelvis').decalSince(hopMk, { frame: at(HOP.x, HOP.y, HOP.z), uPeriod: 6, fn: (p) => (p.y > 0.125 && p.y < 0.165 && Math.hypot(p.x, p.z) > 0.29
    ? [(Math.atan2(p.x, p.z) / (2 * Math.PI) + 0.5) * 6, bandV(BAND.vernier, 0.15 + (0.165 - p.y) / 0.04 * 0.7)] : null) });
  rivetRing(H('pelvis'), HOP.clone().add(V(0, 0.06, 0)), V(0, 1, 0), 0.282, 14, 0.009, { radial: true });
  // the level vial across the hopper's mouth in a brass cradle, a gyroscope ring round it
  const VC = HOP.clone().add(V(0, 0.2, 0));
  const vial = levelVial(H('pelvis'), GL('pelvis'), VC, V(1, 0, 0), { len: 0.34, r: 0.05 });
  for (const s of [1, -1]) {
    strut(H('pelvis'), V(s * 0.2, HOP.y + 0.16, HOP.z), V(s * 0.12, VC.y - 0.035, VC.z), 0.016, 0.014, { surf: 'bronze', tone: C.BRASS, sides: 6, wear: 0.6 });
  }
  gyroRing(H('pelvis'), VC, V(0, Math.cos(0.35), Math.sin(0.35)), 0.21, 0.013, { pivot: V(1, 0, 0), radial: 40 });
  // two antennae aft, the taller with a banner yard
  const A0 = crown(T.mastZ);
  for (const [x, top, cross] of [[0.14, T.top, 0.05], [-0.16, T.top - 0.16, 0]]) {
    const base = V(x, A0.y - 0.04, T.mastZ);
    lathe(H('pelvis'), [P(0, 0, 'bronze', C.BRASS), P(0.05, 0, 'bronze', C.BRASS), P(0.045, 0.04, 'bronze', C.BRASS), P(0.025, 0.06, 'bronze', C.BRASS)], at(base.x, base.y, base.z), { segs: 12, wear: 0.6 });
    antenna(H('pelvis'), base.clone().add(V(0, 0.05, 0)), V(x, top, T.mastZ), { r: 0.012, finial: 0.1, cross });
  }
  {
    const yz = T.mastZ, yy = 2.6;
    strut(H('pelvis'), V(0.14, yy, yz), V(0.14, yy, yz - 0.38), 0.009, 0.009, { surf: 'bronze', tone: C.BRASS, sides: 6, wear: 0.6 });
    banner(H('pelvis'), V(0.14, yy - 0.012, yz - 0.2), V(0, 0, -1), { w: 0.28, h: 0.34, out: V(1, 0, 0), tone: BANNER_PALE, hem: C.STAFF });
  }

  /* ------------------------------- the stern collar and the auger -------------- */
  const TAIL0 = V(0, 1.66, -1.74), TAIL1 = V(0, 1.6, -1.98), TIP = V(0, 1.4, -2.42);
  lathe(H('tail1'), [
    P(0, 0, 'graphite', C.GUNMETAL), P(0.25, 0, 'graphite', C.GUNMETAL), P(0.26, 0.03, 'glaze', C.ENAMEL), P(0.24, 0.13, 'glaze', C.ENAMEL),
    P(0.235, 0.15, 'bronze', C.BRASS), P(0.2, 0.2, 'bronze', C.BRASS), P(0.15, 0.24, 'graphite', C.GUNMETAL), P(0, 0.24, 'graphite', C.GUNMETAL),
  ], at(TAIL0.x, TAIL0.y, TAIL0.z, new THREE.Matrix4().makeRotationX(-Math.PI / 2)), { segs: 28, wear: 0.4, panels: 4, gap: 3 });
  rivetRing(H('tail1'), TAIL0.clone().add(V(0, 0, -0.16)), V(0, 0, -1), 0.236, 10, 0.009, { radial: true });
  const AUGER = new KBucket('tiller-auger');
  {
    const d = TIP.clone().sub(TAIL1), len = d.length();
    const m = new THREE.Matrix4().compose(TAIL1, new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()), V(1, 1, 1));
    const prof = [P(0, 0, 'graphite', C.GUNMETAL), P(0.11, 0, 'graphite', C.GUNMETAL), P(0.11, 0.04, 'bronze', C.BRASS)];
    for (let i = 0; i < 7; i++) {
      const h = 0.06 + (i / 7) * (len - 0.12), r = 0.115 * (1 - i / 8);
      prof.push(P(r, h, 'bronze', C.BRASS), P(r * 0.68, h + 0.035, 'graphite', C.CHROME));
    }
    prof.push(P(0, len, 'graphite', C.CHROME));
    lathe(AUGER, prof, m, { segs: 16, wear: 0.5, crease: 25 });
  }

  /* ------------------------------- the stilts --------------------------------- */
  const LEGS = [];
  for (const [row, hz, az, hinge, parent] of [['F', T.hipZ, T.footZ, 1, 'chest'], ['M', 0, 0, -1, 'pelvis'], ['H', -T.hipZ, -T.footZ, -1, 'pelvis']]) {
    for (const s of [1, -1]) {
      const id = (s > 0 ? 'R' : 'L') + row;
      const hip = V(s * T.hipX, T.hipY, hz), ankle = V(s * T.footX, T.footY, az);
      const knee = solveKnee(hip, ankle, hinge, T.thigh, T.shin);
      const toe = ankle.clone().add(V(s * 0.02, -0.11, 0.1));
      LEGS.push({ id, parent, hinge, hip, knee, ankle, toe, s, zs: Math.sign(az) });
    }
  }
  for (const Lg of LEGS) surveyLeg(H, Lg, { thighR: 0.052, shinR: 0.043, shin: 'enamel', pad: T.pad, boss: Lg.parent });

  /* ------------------------------- recentre ----------------------------------- */
  const all = [...hull.values(), ...glass.values(), AUGER];
  const box = new THREE.Box3();
  for (const b of all) b.bounds(box);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, y0 = box.min.y;
  for (const b of all) b.translate(-cx, -y0, -cz);
  const sh = (v) => [+(v.x - cx).toFixed(4), +(v.y - y0).toFixed(4), +(v.z - cz).toFixed(4)];
  const size = box.getSize(new THREE.Vector3());

  /* ------------------------------- rig spec ----------------------------------- */
  const rigSpec = {
    spine: [
      { name: 'pelvis', pos: sh(V(0, 1.7, -0.95)), r: 0.9 },
      { name: 'chest', pos: sh(V(0, 1.7, T.split)), r: 0.75 },
      { name: 'neck', pos: sh(TUR), r: 0.25 },
      { name: 'head', pos: sh(DC), r: 0.3, tip: sh(V(0, DC.y, DR.z + T.drumDepth + 0.2)) },
    ],
    tail: [
      { name: 'tail1', pos: sh(TAIL0), r: 0.3 },
      { name: 'tail2', pos: sh(TAIL1), r: 0.25 },
    ],
    legGateY: +(T.hipY + 0.5 - y0).toFixed(4),
    legInboard: 0.5,
    legs: LEGS.map((Lg) => ({
      id: Lg.id, parent: Lg.parent, hinge: Lg.hinge,
      hip: sh(Lg.hip), knee: sh(Lg.knee), ankle: sh(Lg.ankle), toe: sh(Lg.toe),
      r: 0.22, restFoot: [sh(Lg.ankle)[0], sh(Lg.ankle)[2]],
    })),
  };
  const BONE_ORDER = [
    ...rigSpec.spine.map((s) => s.name), ...rigSpec.tail.map((s) => s.name),
    ...rigSpec.legs.flatMap((l) => [`${l.id}_thigh`, `${l.id}_shin`, `${l.id}_foot`]),
  ];
  const sockets = {
    lens: sh(dr.face), lensR: +dr.radius.toFixed(4),
    lantern: sh(VC), vial: sh(VC), vialLen: vial.len, vialR: vial.r,
    hopper: sh(HOP.clone().add(V(0, 0.1, 0))),
    auger: sh(TIP), augerRoot: sh(TAIL1),
    skirt: { x: T.skirtX, top: +(T.skirtTop - y0).toFixed(4), bottom: +(T.skirtBot - y0).toFixed(4) },
    top: +(size.y).toFixed(4),
    /** design space -> body space (the recentre): body = design + shift (blockout.js form `built` is in body space) */
    shift: [+(-cx).toFixed(4), +(-y0).toFixed(4), +(-cz).toFixed(4)],
  };

  const hullAll = mergeLabelled(hull, BONE_ORDER, 'tiller-hull');
  const glassAll = mergeLabelled(glass, BONE_ORDER, 'tiller-vial');
  finish(AUGER, { occluders: [hullAll], rays: 28, dist: 0.4, footBand: 0, lamps: [], verdigris: 0.3 });
  const fin = finish(hullAll, { occluders: [glassAll, AUGER], rays: 28, dist: 0.4, footBand: 0.6, lamps: [], verdigris: 0.3 });
  const lod1 = await lod1From(hullAll, 0.3, 'tiller-lod1');   // I-04: LOD1 <= 40 % of LOD0

  const ICE = new THREE.Color(C.ICE);
  const target = file || path.join(out, OUTPUTS[0]);
  const stats = await writeInstrument([
    { bucket: hullAll, role: 'hull', material: { name: 'r5-tiller-hull' } },
    // the vial: pale-ice glass lit from inside, the only emissive surface (the lamp's iris is the lamp system's)
    { bucket: glassAll, role: 'sensor', material: { name: 'r5-tiller-vial-glass', emissive: [ICE.r, ICE.g, ICE.b], baseColor: [0.07, 0.11, 0.12, 1] } },
    { bucket: AUGER, role: 'tool', material: { name: 'r5-tiller-hull', anchor: sockets.augerRoot } },
    { bucket: lod1, role: 'lod1', material: { name: 'r5-tiller-hull' } },
  ], {
    file: target,
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    extras: {
      r5Rig: rigSpec, r5BoneOrder: BONE_ORDER,
      r5Size: [+size.x.toFixed(4), +size.y.toFixed(4), +size.z.toFixed(4)],
      r5Sockets: sockets,
      r5Generator: { name: RECIPE, design: 'tiller', form: 'built (M2 wave 2: the skirted six-stilt hull)', kit: 'M1.4a', licence: 'original work (generated), no third-party assets' },
    },
  });
  const res = {
    kind: 'tiller', file: path.relative(out, target), bytes: stats.bytes, tris: stats.tris, meshTris: stats.meshTris, verts: stats.verts,
    materials: stats.materials, textures: stats.textures, bones: BONE_ORDER.length, legs: LEGS.length, aoMean: +fin.aoMean.toFixed(3),
    size: { x: +size.x.toFixed(3), y: +size.y.toFixed(3), z: +size.z.toFixed(3) },
    knees: LEGS.map((Lg) => +(Lg.knee.y - y0).toFixed(3)),
  };
  if (preview) res._buckets = { hull: [hullAll, AUGER], glass: [glassAll], lamps: [{ at: sockets.lens, r: dr.radius }], size };
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const r = await build({ out: i >= 0 ? path.resolve(process.argv[i + 1]) : ROOT });
  console.log(JSON.stringify(r));
}
