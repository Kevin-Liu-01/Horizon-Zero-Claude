#!/usr/bin/env node
/**
 * CALIMA — the PEG generator (instruments-a, W1; bible §7.4 #1). Original
 * work: no third-party asset is read.
 *
 *   node tools/build/instruments/gen-peg.mjs [--out <dir>]
 *     -> public/models/instruments/peg.glb   (hull + sensor; a small kind ships no LOD1: ROUND5-LOOK I-04 gives it cascade 0 only)
 *
 * THE SWARM THAT DRAWS THE LINES (small; role `swarm`). A milk churn on four
 * legs: a bone-glaze cylinder on its side with oxblood hoops and a vermilion /
 * staff-white survey band, a bronze lamp collar at the front with one lamp
 * under a visor, short bronze legs on disc pads, a PISTON MALLET on its back
 * (a pile-driver arm on a bronze A-frame, the hammer head hanging over the
 * lamp: the arm is the `mallet` bone, so the Mallet attack and the peg-driving
 * idle swing the real head), and a rack of five vermilion/white survey pegs in
 * a bronze rail on each flank. Bible size 1.1 x 0.6 x 0.9 m, <= 8 k tris.
 * Bones: pelvis, head, mallet + 4 legs x 3 = 15 (bible 14; class cap 20 — the
 * mallet bone is what makes V27's "the working end does the work" true).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { V, strut, ball, rbox, torus, plate, lathe, basis, at, AXIS_Z, AXIS_X } from '../lib/hs.mjs';
import {
  THREE, C, KBucket, mergeLabelled, finish, lod1From, writeInstrument, solveKnee, numeralUV, BAND, bandV,
} from './parts/kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const LANE = 'instruments-a';
export const RECIPE = 'tools/build/instruments/gen-peg.mjs';
export const OUTPUTS = ['public/models/instruments/peg.glb'];

export const PEG = Object.freeze({ axisY: 0.50, bodyR: 0.215, z0: -0.56, z1: 0.30, lampR: 0.095, lampZ: 0.445 });

export async function build({ out = ROOT, file = null } = {}) {
  const P = (r, h, surf, tone) => ({ r, h, surf, tone });
  const BONES = [];
  const hull = new Map(), lamp = new Map();
  const H = (b) => { if (!hull.has(b)) { hull.set(b, new KBucket(`hull:${b}`)); if (!BONES.includes(b)) BONES.push(b); } return hull.get(b); };
  const L = (b) => { if (!lamp.has(b)) { lamp.set(b, new KBucket(`lamp:${b}`)); if (!BONES.includes(b)) BONES.push(b); } return lamp.get(b); };
  const AY = PEG.axisY, R = PEG.bodyR;

  /* --------------------------------- the churn ----------------------------- */
  const len = PEG.z1 - PEG.z0;
  const k = (f) => f * len;
  const M = at(0, AY, PEG.z0, AXIS_Z.clone());
  {
    const mk = H('pelvis').mark();
    lathe(H('pelvis'), [
      P(0, 0, 'bronze', C.BRONZE), P(R * 0.55, 0, 'bronze', C.BRONZE), P(R * 0.7, k(0.01), 'graphite', C.GRAPH),
      P(R * 0.88, k(0.02), 'glaze', C.BONE), P(R * 0.98, k(0.06), 'glaze', C.BONE),
      P(R, k(0.12), 'glaze', C.OXBLOOD), P(R, k(0.17), 'glaze', C.BONE),
      P(R * 1.01, k(0.40), 'glaze', C.STAFF), P(R * 1.01, k(0.56), 'glaze', C.STAFF),     // the survey band (decal)
      P(R, k(0.57), 'glaze', C.BONE), P(R, k(0.78), 'glaze', C.OXBLOOD), P(R, k(0.83), 'glaze', C.BONE),
      P(R * 0.92, k(0.95), 'glaze', C.BONE), P(R * 0.74, k(1.0), 'bronze', C.BRONZE), P(R * 0.62, k(1.0), 'graphite', C.GRAPH),
      P(0, k(1.0), 'graphite', C.GRAPH),
    ], M, { segs: 28, panels: 3, gap: 2.2, wear: 0.45, phiStart: Math.PI / 3 });
    // the survey band: vermilion / white halves wrapping the drum (the shared atlas, uv1)
    H('pelvis').decalSince(mk, { frame: M, uPeriod: 6, fn: (p) => {
      const f = p.y / len;
      return f < 0.40 || f > 0.56 ? null : [(Math.atan2(p.x, p.z) / (2 * Math.PI) + 0.5) * 6, bandV(BAND.bands)];
    } });
  }
  lathe(H('pelvis'), [P(R * 0.95, 0, 'graphite', C.GRAPH), P(R * 0.95, k(1.0), 'graphite', C.GRAPH)], M, { segs: 14, wear: 0.1 });
  // hoops: bronze straps over the glaze, bolted
  for (const f of [0.22, 0.70]) torus(H('pelvis'), V(0, AY, PEG.z0 + k(f)), R + 0.012, 0.012, 'z', { surf: 'bronze', tone: C.BRONZE, tube: 6, radial: 28, wear: 0.6 });
  // the keel skid under the belly
  rbox(H('pelvis'), V(0, AY - R - 0.005, -0.12), [0.10, 0.04, 0.66], 0.015, { surf: 'graphite', tone: C.GRAPH, wear: 0.4 });
  // a brass serial on each flank ("31")
  for (const s of [-1, 1]) for (const [j, dgt] of [[0, 3], [1, 1]]) {
    const c = V(s * (R + 0.008), AY + 0.06, -0.40 + j * 0.05 * -s);
    const Mp = basis(V(0, 0, -s), V(0, 1, 0), V(s, 0, 0), c);
    const mk = H('pelvis').mark();
    plate(H('pelvis'), [[-0.022, -0.032], [0.022, -0.032], [0.022, 0.032], [-0.022, 0.032]], 0.004, 0, Mp, { surf: 'bronze', tone: C.STAFF, wear: 0.1 });
    H('pelvis').decalSince(mk, { frame: Mp, fn: (p) => numeralUV(dgt, (p.x + 0.022) / 0.044, 1 - (p.y + 0.032) / 0.064) });
  }

  /* --------------------------- head: lamp collar --------------------------- */
  const HZ = PEG.z1;
  lathe(H('head'), [
    P(0, 0, 'graphite', C.GRAPH), P(0.14, 0, 'bronze', C.BRONZE), P(0.15, 0.03, 'bronze', C.BRONZE), P(0.14, 0.08, 'patina', C.VERDI),
    P(0.135, 0.12, 'bronze', C.BRONZE), P(0.125, 0.135, 'graphite', C.GRAPH), P(0, 0.135, 'graphite', C.GRAPH),
  ], at(0, AY + 0.02, HZ, AXIS_Z.clone()), { segs: 24, wear: 0.5, crease: 30 });
  // the visor over the lamp
  plate(H('head'), [[-0.13, 0], [0.13, 0], [0.10, 0.10], [-0.10, 0.10]], 0.012, 0.004,
    basis(V(1, 0, 0), V(0, 0.2, 1).normalize(), V(0, 1, -0.2).normalize(), V(0, AY + 0.14, HZ + 0.05)), { surf: 'bronze', tone: C.BRONZE, wear: 0.6 });
  // the front bumper ring, two small sighting studs
  torus(H('head'), V(0, AY + 0.02, HZ + 0.13), 0.13, 0.012, 'z', { surf: 'graphite', tone: C.GRAPH, tube: 6, radial: 24 });
  for (const s of [-1, 1]) ball(L('head'), V(s * 0.085, AY + 0.11, HZ + 0.12), 0.012, { surf: 'lamp', tone: C.LAMP, w: 8, h: 6 });

  /* -------------------------------- the mallet ----------------------------- */
  const PIV = V(0, AY + R + 0.10, -0.34);
  // the A-frame on the back (pelvis)
  for (const s of [-1, 1]) {
    strut(H('pelvis'), V(s * 0.12, AY + R * 0.75, -0.44), V(s * 0.04, PIV.y, PIV.z), 0.018, 0.016, { surf: 'bronze', tone: C.BRONZE, sides: 8, wear: 0.6 });
    strut(H('pelvis'), V(s * 0.12, AY + R * 0.75, -0.22), V(s * 0.04, PIV.y, PIV.z), 0.018, 0.016, { surf: 'bronze', tone: C.BRONZE, sides: 8, wear: 0.6 });
  }
  strut(H('pelvis'), V(-0.06, PIV.y, PIV.z), V(0.06, PIV.y, PIV.z), 0.026, 0.026, { surf: 'graphite', tone: C.GRAPH, sides: 10 });
  // the piston cylinder on the back (body), its rod rides the arm
  strut(H('pelvis'), V(0, AY + R * 0.9, -0.02), V(0, AY + R + 0.08, 0.08), 0.032, 0.03, { surf: 'graphite', tone: C.GRAPH, sides: 10 });
  const ARM_END = V(0, AY + R + 0.17, 0.30);
  strut(H('mallet'), PIV, ARM_END, 0.028, 0.022, { surf: 'graphite', tone: C.GRAPH, sides: 8 });
  strut(H('mallet'), V(0, AY + R + 0.08, 0.08), PIV.clone().lerp(ARM_END, 0.62), 0.014, 0.014, { surf: 'graphite', tone: C.CHROME, sides: 8 });
  rbox(H('mallet'), PIV.clone().lerp(ARM_END, 0.5), [0.07, 0.035, 0.24], 0.01, { surf: 'glaze', tone: C.OXBLOOD, wear: 0.4, rot: [-0.18, 0, 0] });
  // the hammer head: a bronze drum across, vermilion-banded faces
  lathe(H('mallet'), [
    P(0, 0, 'glaze', C.VERM), P(0.062, 0, 'glaze', C.VERM), P(0.066, 0.02, 'bronze', C.BRONZE), P(0.07, 0.08, 'bronze', C.BRONZE),
    P(0.07, 0.10, 'patina', C.VERDI), P(0.07, 0.12, 'bronze', C.BRONZE), P(0.066, 0.18, 'bronze', C.BRONZE), P(0.062, 0.20, 'glaze', C.VERM), P(0, 0.20, 'glaze', C.VERM),
  ], at(-0.10, ARM_END.y - 0.03, ARM_END.z, AXIS_X.clone()), { segs: 18, wear: 0.6, crease: 30 });

  /* ------------------------------- the peg racks --------------------------- */
  // the tool (bible §7.4: "peg rack (Pry -> bronze pins)"): its own node, mounted on the pelvis as a component
  const RACK = new KBucket('peg-rack');
  for (const s of [-1, 1]) {
    rbox(RACK, V(s * (R + 0.03), AY - 0.02, -0.12), [0.03, 0.03, 0.50], 0.008, { surf: 'bronze', tone: C.BRONZE, wear: 0.6 });
    rbox(RACK, V(s * (R + 0.03), AY + 0.13, -0.12), [0.03, 0.025, 0.50], 0.008, { surf: 'bronze', tone: C.BRONZE, wear: 0.6 });
    for (let i = 0; i < 5; i++) {
      const z = -0.32 + i * 0.10;
      const x = s * (R + 0.05);
      // a survey peg: vermilion head, white shank, vermilion band, a steel point
      strut(RACK, V(x, AY + 0.20, z), V(x, AY + 0.15, z), 0.017, 0.017, { surf: 'glaze', tone: C.VERM, sides: 8 });
      strut(RACK, V(x, AY + 0.15, z), V(x, AY - 0.06, z), 0.011, 0.011, { surf: 'glaze', tone: C.STAFF, sides: 6 });
      strut(RACK, V(x, AY + 0.04, z), V(x, AY + 0.0, z), 0.0115, 0.0115, { surf: 'glaze', tone: C.VERM, sides: 6 });
      strut(RACK, V(x, AY - 0.06, z), V(x, AY - 0.11, z), 0.011, 0.002, { surf: 'graphite', tone: C.CHROME, sides: 6 });
    }
  }

  /* ---------------------------------- legs --------------------------------- */
  const L1 = 0.23, L2 = 0.27;
  const LEGS = [];
  const LEG_DEF = [['F', 0.18, 0.25, 1], ['H', -0.34, -0.42, -1]];
  for (const [row, hz, az, hinge] of LEG_DEF) {
    for (const s of [1, -1]) {
      const id = (s > 0 ? 'R' : 'L') + row;
      const hip = V(s * 0.16, AY - 0.08, hz);
      const ankle = V(s * 0.25, 0.07, az);
      const knee = solveKnee(hip, ankle, hinge, L1, L2);
      const toe = ankle.clone().add(V(s * 0.01, -0.06, 0.06));
      LEGS.push({ id, hinge, hip, knee, ankle, toe, s });
    }
  }
  for (const Lg of LEGS) {
    const thigh = `${Lg.id}_thigh`, shin = `${Lg.id}_shin`, foot = `${Lg.id}_foot`;
    // hip boss stays on the body
    lathe(H('pelvis'), [P(0, 0, 'graphite', C.GRAPH), P(0.075, 0, 'bronze', C.BRONZE), P(0.07, 0.04, 'bronze', C.BRONZE), P(0, 0.05, 'patina', C.VERDI)],
      at(Lg.hip.x + Lg.s * 0.005, Lg.hip.y, Lg.hip.z, new THREE.Matrix4().makeRotationZ(-Lg.s * Math.PI / 2)), { segs: 14, wear: 0.5 });
    ball(H(thigh), Lg.hip, 0.05, { surf: 'graphite', tone: C.GRAPH, w: 10, h: 7 });
    strut(H(thigh), Lg.hip, Lg.knee, 0.042, 0.034, { surf: 'bronze', tone: C.BRONZE, sides: 8, wear: 0.6 });
    // a glaze greave over the thigh
    strut(H(thigh), Lg.hip.clone().lerp(Lg.knee, 0.15), Lg.hip.clone().lerp(Lg.knee, 0.8), 0.05, 0.043, { surf: 'glaze', tone: C.BONE, sides: 8, wear: 0.5 });
    const axle = new THREE.Vector3().crossVectors(Lg.knee.clone().sub(Lg.hip), Lg.ankle.clone().sub(Lg.knee)).normalize();
    strut(H(thigh), Lg.knee.clone().addScaledVector(axle, -0.045), Lg.knee.clone().addScaledVector(axle, 0.045), 0.04, 0.04, { surf: 'graphite', tone: C.GRAPH, sides: 10 });
    strut(H(shin), Lg.knee, Lg.ankle, 0.028, 0.022, { surf: 'graphite', tone: C.GRAPH, sides: 8 });
    strut(H(shin), Lg.knee.clone().lerp(Lg.ankle, 0.1), Lg.knee.clone().lerp(Lg.ankle, 0.55), 0.034, 0.03, { surf: 'bronze', tone: C.BRONZE, sides: 8, wear: 0.6 });
    ball(H(foot), Lg.ankle, 0.03, { surf: 'graphite', tone: C.GRAPH, w: 8, h: 6 });
    const pad = V(Lg.ankle.x, 0, Lg.ankle.z + 0.02);
    lathe(H(foot), [P(0, 0, 'rubber', C.RUBBER), P(0.07, 0, 'rubber', C.RUBBER), P(0.075, 0.018, 'bronze', C.BRONZE), P(0.04, 0.05, 'bronze', C.BRONZE), P(0, 0.055, 'graphite', C.GRAPH)],
      at(pad.x, pad.y, pad.z), { segs: 12, wear: 0.6 });
    strut(H(foot), Lg.ankle, V(pad.x, 0.045, pad.z), 0.022, 0.02, { surf: 'graphite', tone: C.GRAPH, sides: 8 });
  }

  /* ------------------------------- recentre -------------------------------- */
  const all = [...hull.values(), ...lamp.values(), RACK];
  const box = new THREE.Box3();
  for (const b of all) b.bounds(box);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, y0 = box.min.y;
  for (const b of all) b.translate(-cx, -y0, -cz);
  const sh = (v) => [+(v.x - cx).toFixed(4), +(v.y - y0).toFixed(4), +(v.z - cz).toFixed(4)];
  const size = box.getSize(new THREE.Vector3());

  const rigSpec = {
    spine: [
      { name: 'pelvis', pos: sh(V(0, AY, -0.12)), r: 0.34 },
      { name: 'head', pos: sh(V(0, AY + 0.02, HZ)), r: 0.18, tip: sh(V(0, AY + 0.02, HZ + 0.2)) },
    ],
    tail: [{ name: 'mallet', pos: sh(PIV), r: 0.12 }],
    legGateY: +(AY - 0.02 - y0).toFixed(4),
    legInboard: 0.10,
    legs: LEGS.map((Lg) => ({
      id: Lg.id, parent: 'pelvis', hinge: Lg.hinge,
      hip: sh(Lg.hip), knee: sh(Lg.knee), ankle: sh(Lg.ankle), toe: sh(Lg.toe),
      r: 0.09, restFoot: [sh(Lg.ankle)[0], sh(Lg.ankle)[2]],
    })),
  };
  const BONE_ORDER = [
    ...rigSpec.spine.map((s) => s.name), ...rigSpec.tail.map((s) => s.name),
    ...rigSpec.legs.flatMap((l) => [`${l.id}_thigh`, `${l.id}_shin`, `${l.id}_foot`]),
  ];
  const LAMP_AT = sh(V(0, AY + 0.02, PEG.lampZ));
  const sockets = { lens: LAMP_AT, mallet: sh(V(0, ARM_END.y - 0.03, ARM_END.z)), rack: sh(V(R + 0.05, AY + 0.05, -0.12)), rackRoot: sh(V(0, AY + 0.05, -0.12)) };

  const hullAll = mergeLabelled(hull, BONE_ORDER, 'peg-hull');
  const lampAll = mergeLabelled(lamp, BONE_ORDER, 'peg-sensor');
  const fin = finish(hullAll, { occluders: [lampAll, RACK], rays: 28, dist: 0.4, footBand: 0.3, lamps: [{ at: LAMP_AT, r: PEG.lampR }] });
  finish(RACK, { occluders: [hullAll], rays: 28, dist: 0.4, footBand: 0.3 });

  const target = file || path.join(out, OUTPUTS[0]);
  const stats = await writeInstrument([
    { bucket: hullAll, role: 'hull', material: { name: 'r5-peg-hull' } },
    { bucket: lampAll, role: 'sensor', material: { name: 'r5-peg-sensor-lens', emissive: [1.0, 0.86, 0.6], baseColor: [0.02, 0.015, 0.01, 1] } },
    { bucket: RACK, role: 'tool', material: { name: 'r5-peg-hull', anchor: sockets.rackRoot } },
  ], {
    file: target,
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    extras: {
      r5Rig: rigSpec, r5BoneOrder: BONE_ORDER,
      r5Size: [+size.x.toFixed(4), +size.y.toFixed(4), +size.z.toFixed(4)],
      r5Sockets: sockets,
      r5Generator: { name: RECIPE, design: 'peg', licence: 'original work (generated), no third-party assets' },
    },
  });
  return {
    kind: 'peg', file: path.relative(out, target), bytes: stats.bytes, tris: stats.tris, meshTris: stats.meshTris, verts: stats.verts,
    materials: stats.materials, textures: stats.textures, bones: BONE_ORDER.length, legs: LEGS.length, aoMean: +fin.aoMean.toFixed(3),
    size: { x: +size.x.toFixed(3), y: +size.y.toFixed(3), z: +size.z.toFixed(3) },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  console.log(JSON.stringify(await build({ out: i >= 0 ? path.resolve(process.argv[i + 1]) : ROOT })));
}
