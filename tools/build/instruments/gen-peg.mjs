#!/usr/bin/env node
/**
 * CALIMA — the PEG generator (instruments; BIBLE §7.4 #1, BUILD M1.4d). Original work: no third-party asset is read.
 * Built from the shared hull kit (`parts/kit.mjs`, M1.4a), the Plumb's maker.
 *
 *   node tools/build/instruments/gen-peg.mjs [--out <dir>]
 *     -> public/models/instruments/peg.glb   (hull + the peg rack tool; a small kind ships no LOD1)
 *
 * THE SWARM THAT DRAWS THE LINES (small; role `swarm`; Q11 default (a)). A four-legged WHITE-ENAMEL CANISTER lying
 * along its walk: four enamel plates riveted over a gunmetal core between two tarnished-brass hoops, a domed enamel
 * front cap on a riveted brass flange, a gunmetal rear cap with a brass hatch, a thin survey band (flat ink) and a
 * brass serial. On its back a PISTON MALLET: a brass A-frame mast at the rear carries the gunmetal arm (the `mallet`
 * bone) that reaches forward past the front cap, a piston from the back drives it, and a brass hammer hangs from its
 * end over the ground where the peg goes. On each flank a brass rail holds a RACK of survey pegs (vermilion caps as
 * flat ink, white shanks, steel points): the tool, Pry -> bronze pins. The LAMP is a small kit lamp drum seated on
 * the canister's front-left shoulder under an enamel hood (the `head` bone swivels it): never centred on the round
 * cap (a centred lens on a round end read as a camera lens and as one eye), no lens on a neck, no studs or pairs
 * that could read as a face. A slender BRASS RANGING POLE rises from a clamp on the rear-right shoulder to 1.90 m
 * with engraved ink rings every 0.25 m and a ball-and-spike finial, so a swarm reads as a row of walking poles.
 * Four short legs: gunmetal struts, enamel greaves, brass knee bosses, disc feet. Body about 1.15 x 0.72 x 0.9 m.
 *
 * Bones: pelvis, head (the lamp turret), mallet + 4 legs x 3 = 15.
 * Space: metres, +Y up, +Z forward, y = 0 at the feet; written centred on its bounding box in x and z (the loader
 * recentres every model on its box centre, so sockets must be written in that frame: gen-plumb.mjs fix 1b).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { V, strut, ball, rbox, torus, plate, lathe, basis, at, AXIS_Z, AXIS_X } from '../lib/hs.mjs';
import {
  THREE, C, KBucket, mergeLabelled, finish, writeInstrument, solveKnee, numeralUV, BAND, bandV,
  resetKitStats, rivet, rivetRing, lampDrum,
} from './parts/kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const LANE = 'instruments';
export const RECIPE = 'tools/build/instruments/gen-peg.mjs';
export const OUTPUTS = ['public/models/instruments/peg.glb'];

/** Design constants (before the recentre). */
export const PEG = Object.freeze({
  axisY: 0.50, bodyR: 0.24, z0: -0.46, len: 0.80,          // the canister: axis height, radius, rear end, barrel length
  dome: 0.17,                                              // the front cap's depth
  lampX: -0.16, lampY: 0.80, lampBackZ: 0.25, lampR: 0.10, lampDepth: 0.12,
  pivY: 0.88, pivZ: -0.34, armZ: 0.55,                     // the mallet: pivot at the mast head, the arm's end
  hamR: 0.065, hamLen: 0.16, hamDrop: 0.17,                 // the hammer under the arm's end
  poleX: 0.165, poleZ: -0.40, poleTop: 1.90,               // the ranging pole
});

export async function build({ out = ROOT, file = null, noDust = false } = {}) {
  resetKitStats();
  const P = (r, h, surf, tone) => ({ r, h, surf, tone });
  const BONES = [];
  const hull = new Map();
  const H = (b) => { if (!hull.has(b)) { hull.set(b, new KBucket(`hull:${b}`)); if (!BONES.includes(b)) BONES.push(b); } return hull.get(b); };
  const AY = PEG.axisY, R = PEG.bodyR, L = PEG.len, Z0 = PEG.z0, Z1 = Z0 + L;
  const M = at(0, AY, Z0, AXIS_Z.clone());          // lathe +Y along +Z from the rear end

  /* ------------------------------- the canister ----------------------------- */
  // the gunmetal core shows only in the plate seams: a narrow gunmetal strip under each seam (nothing hidden is built)
  for (let k = 0; k < 4; k++) {
    lathe(H('pelvis'), [P(R * 0.955, 0.004, 'graphite', C.GUNMETAL), P(R * 0.955, L - 0.004, 'graphite', C.GUNMETAL)],
      M, { segs: 2, phiStart: Math.PI / 4 + (k * Math.PI) / 2 - THREE.MathUtils.degToRad(5), phiLength: THREE.MathUtils.degToRad(10), wear: 0.3 });
  }
  // four enamel plates, 3-degree seams, turned lips at both ends; the seams at 45 degrees (none along the top)
  lathe(H('pelvis'), [P(R * 0.95, 0.004, 'glaze', C.ENAMEL), P(R, 0.02, 'glaze', C.ENAMEL), P(R, L * 0.5, 'glaze', C.ENAMEL), P(R, L - 0.02, 'glaze', C.ENAMEL), P(R * 0.95, L - 0.004, 'glaze', C.ENAMEL)],
    M, { segs: 40, panels: 4, gap: 3, phiStart: Math.PI / 4, wear: 0.35, crease: 50 });
  // the survey band: a thin vermilion / white ink strip round the barrel's middle (the shared atlas, uv1)
  {
    const mk = H('pelvis').mark();
    lathe(H('pelvis'), [P(R + 0.0015, L * 0.47, 'glaze', C.STAFF), P(R + 0.0015, L * 0.53, 'glaze', C.STAFF)], M, { segs: 40, wear: 0.2 });
    H('pelvis').decalSince(mk, { frame: M, uPeriod: 8, fn: (p) => [(Math.atan2(p.x, p.z) / (2 * Math.PI) + 0.5) * 8, bandV(BAND.bands)] });
  }
  // two brass hoops, each with a radial rivet course (2 cm domes)
  for (const f of [0.2, 0.8]) {
    const c = V(0, AY, Z0 + L * f);
    lathe(H('pelvis'), [P(R - 0.002, -0.022, 'bronze', C.BRASS), P(R + 0.010, -0.018, 'bronze', C.BRASS), P(R + 0.012, 0.018, 'bronze', C.BRASS), P(R - 0.002, 0.022, 'bronze', C.BRASS)],
      at(c.x, c.y, c.z, AXIS_Z.clone()), { segs: 40, wear: 0.6, crease: 30 });
    rivetRing(H('pelvis'), c, V(0, 0, 1), R + 0.012, 14, 0.01, { radial: true, phase: 0.11 });
  }
  // the front cap: a domed enamel end on a riveted brass flange
  {
    const Mf = at(0, AY, Z1, AXIS_Z.clone());
    lathe(H('pelvis'), [P(R + 0.016, -0.01, 'bronze', C.BRASS), P(R + 0.016, 0.016, 'bronze', C.BRASS), P(R * 0.97, 0.02, 'glaze', C.ENAMEL)], Mf, { segs: 40, wear: 0.6, crease: 30 });
    const D = PEG.dome;
    lathe(H('pelvis'), [P(R * 0.97, 0.02, 'glaze', C.ENAMEL), P(R * 0.93, 0.02 + D * 0.35, 'glaze', C.ENAMEL), P(R * 0.78, 0.02 + D * 0.68, 'glaze', C.ENAMEL),
      P(R * 0.48, 0.02 + D * 0.92, 'glaze', C.ENAMEL), P(0, 0.02 + D, 'glaze', C.ENAMEL)], Mf, { segs: 40, wear: 0.3, crease: 50 });
    rivetRing(H('pelvis'), V(0, AY, Z1 + 0.017), V(0, 0, 1), R + 0.004, 12, 0.009, { phase: 0.2 });
  }
  // the rear cap: a shallow enamel dome on a brass flange, a small square brass hatch low on it (a round dark end with a
  // round brass hatch read as a lens from behind)
  {
    const Mr = at(0, AY, Z0, new THREE.Matrix4().makeRotationX(-Math.PI / 2));   // lathe +Y toward -Z
    lathe(H('pelvis'), [P(R + 0.014, -0.01, 'bronze', C.BRASS), P(R + 0.014, 0.014, 'bronze', C.BRASS), P(R * 0.97, 0.018, 'glaze', C.ENAMEL)], Mr, { segs: 40, wear: 0.6, crease: 30 });
    lathe(H('pelvis'), [P(R * 0.97, 0.018, 'glaze', C.ENAMEL), P(R * 0.88, 0.045, 'glaze', C.ENAMEL), P(R * 0.6, 0.07, 'glaze', C.ENAMEL), P(0, 0.08, 'glaze', C.ENAMEL)], Mr, { segs: 40, wear: 0.35, crease: 50 });
    rivetRing(H('pelvis'), V(0, AY, Z0 - 0.015), V(0, 0, -1), R + 0.002, 10, 0.009, { phase: 0.3 });
    const hc = V(0.05, AY - 0.08, Z0 - 0.074);
    plate(H('pelvis'), [[-0.06, -0.045], [0.06, -0.045], [0.06, 0.045], [-0.06, 0.045]], 0.008, 0.003, basis(V(-1, 0, 0), V(0, 1, 0), V(0, 0, -1), hc), { surf: 'bronze', tone: C.BRASS, wear: 0.6 });
    for (const [u, v] of [[-0.045, -0.032], [0.045, -0.032], [0.045, 0.032], [-0.045, 0.032]]) rivet(H('pelvis'), hc.clone().add(V(-u, v, -0.008)), V(0, 0, -1), 0.008);
  }
  // the keel skid under the belly
  rbox(H('pelvis'), V(0, AY - R - 0.006, Z0 + L * 0.45), [0.09, 0.035, 0.56], 0.012, { surf: 'graphite', tone: C.GUNMETAL, wear: 0.4 });
  // a brass serial plate on each flank ("31", engraved)
  for (const s of [-1, 1]) for (const [j, dgt] of [[0, 3], [1, 1]]) {
    const c = V(s * (R + 0.006), AY + 0.10, Z0 + L * 0.33 + j * 0.05 * -s);
    const Mp = basis(V(0, 0, -s), V(0, 1, 0), V(s, 0, 0), c);
    const mk = H('pelvis').mark();
    plate(H('pelvis'), [[-0.022, -0.032], [0.022, -0.032], [0.022, 0.032], [-0.022, 0.032]], 0.004, 0, Mp, { surf: 'bronze', tone: C.STAFF, wear: 0.1 });
    H('pelvis').decalSince(mk, { frame: Mp, fn: (p) => numeralUV(dgt, (p.x + 0.022) / 0.044, 1 - (p.y + 0.032) / 0.064) });
  }

  /* ------------------------- the lamp turret (head bone) --------------------- */
  // a small kit lamp drum on the front-left shoulder, axis forward, on a gunmetal saddle; an enamel hood over it
  const LB = V(PEG.lampX, PEG.lampY, PEG.lampBackZ);
  const dr = lampDrum(H('head'), LB, V(0, 0, 1), { r: PEG.lampR, depth: PEG.lampDepth, ticks: 12 });
  plate(H('head'), [[-0.085, 0], [0.085, 0], [0.06, 0.05], [-0.06, 0.05]], 0.01, 0.003,
    basis(V(1, 0, 0), V(0, 0.3, 1).normalize(), V(0, 1, -0.3).normalize(), V(PEG.lampX, PEG.lampY + PEG.lampR * 1.04, PEG.lampBackZ + PEG.lampDepth - 0.04)), { surf: 'glaze', tone: C.ENAMEL, wear: 0.4 });
  // the turret ring it swivels on, bolted to the shell
  const TR = V(PEG.lampX * 0.8, AY + Math.sqrt(R * R - (PEG.lampX * 0.8) ** 2) - 0.01, PEG.lampBackZ + PEG.lampDepth * 0.45);
  lathe(H('pelvis'), [P(0.07, -0.02, 'graphite', C.GUNMETAL), P(0.075, 0.0, 'bronze', C.BRASS), P(0.07, 0.016, 'bronze', C.BRASS), P(0, 0.018, 'graphite', C.GUNMETAL)],
    at(TR.x, TR.y, TR.z), { segs: 18, wear: 0.6 });
  rivetRing(H('pelvis'), TR.clone().add(V(0, 0.017, 0)), V(0, 1, 0), 0.058, 6, 0.008);
  strut(H('head'), TR.clone().add(V(0, 0.01, 0)), V(PEG.lampX, PEG.lampY - PEG.lampR * 0.7, TR.z), 0.03, 0.026, { surf: 'graphite', tone: C.GUNMETAL, sides: 10 });

  /* -------------------------------- the mallet ------------------------------- */
  const PIV = V(0, PEG.pivY, PEG.pivZ);
  const MB = V(0, AY + R * 0.92, PEG.pivZ);
  for (const s of [-1, 1]) {
    strut(H('pelvis'), V(s * 0.12, AY + R * 0.7, PEG.pivZ + 0.09), PIV.clone().add(V(s * 0.035, -0.02, 0)), 0.016, 0.013, { surf: 'bronze', tone: C.BRASS, sides: 8, wear: 0.6 });
    strut(H('pelvis'), V(s * 0.12, AY + R * 0.7, PEG.pivZ - 0.09), PIV.clone().add(V(s * 0.035, -0.02, 0)), 0.016, 0.013, { surf: 'bronze', tone: C.BRASS, sides: 8, wear: 0.6 });
    rivet(H('pelvis'), V(s * 0.12, AY + R * 0.7 + 0.01, PEG.pivZ + 0.09), V(s, 0.6, 0).normalize(), 0.009);
  }
  strut(H('pelvis'), MB, PIV.clone().add(V(0, -0.03, 0)), 0.024, 0.02, { surf: 'graphite', tone: C.GUNMETAL, sides: 10 });
  strut(H('pelvis'), V(-0.055, PIV.y, PIV.z), V(0.055, PIV.y, PIV.z), 0.026, 0.026, { surf: 'graphite', tone: C.GUNMETAL, sides: 10 });
  // the piston on the back drives the arm
  const ARM_END = V(0, PEG.pivY - 0.02, PEG.armZ);
  // the piston: a brass cylinder raked forward from a gunmetal clevis on the back; its steel rod drives the arm
  const PB = V(0, AY + R * 0.97, 0.06), PT = PB.clone().add(V(0, 0.07, -0.09));
  strut(H('pelvis'), V(-0.03, PB.y, PB.z), V(0.03, PB.y, PB.z), 0.02, 0.02, { surf: 'graphite', tone: C.GUNMETAL, sides: 10 });
  strut(H('pelvis'), PB, PT, 0.03, 0.028, { surf: 'bronze', tone: C.BRASS, sides: 12, wear: 0.6 });
  torus(H('pelvis'), PT, 0.03, 0.006, 'y', { surf: 'graphite', tone: C.GUNMETAL, tube: 5, radial: 14 });
  // the arm: a gunmetal spar clad in an enamel beam
  strut(H('mallet'), PIV, ARM_END, 0.022, 0.018, { surf: 'graphite', tone: C.GUNMETAL, sides: 8 });
  strut(H('mallet'), PT, PIV.clone().lerp(ARM_END, 0.30), 0.012, 0.012, { surf: 'graphite', tone: C.CHROME, sides: 8 });
  // an enamel cover plate along the arm, two rivets
  rbox(H('mallet'), PIV.clone().lerp(ARM_END, 0.55), [0.06, 0.05, 0.46], 0.012, { surf: 'glaze', tone: C.ENAMEL, wear: 0.4 });
  for (const f of [0.36, 0.55, 0.74]) for (const sx of [-1, 1]) rivet(H('mallet'), PIV.clone().lerp(ARM_END, f).add(V(sx * 0.031, 0, 0)), V(sx, 0, 0), 0.008);
  // the hammer: a stem and an octagonal brass head across the walk, an enamel band
  strut(H('mallet'), ARM_END, ARM_END.clone().add(V(0, -PEG.hamDrop + PEG.hamR, 0)), 0.015, 0.015, { surf: 'graphite', tone: C.GUNMETAL, sides: 8 });
  const HAM = ARM_END.clone().add(V(0, -PEG.hamDrop, 0));
  const hl = PEG.hamLen, hr = PEG.hamR;
  lathe(H('mallet'), [
    P(0, 0, 'bronze', C.BRASS), P(hr * 0.8, 0, 'bronze', C.BRASS), P(hr, hl * 0.1, 'bronze', C.BRASS), P(hr, hl * 0.4, 'bronze', C.BRASS),
    P(hr * 1.02, hl * 0.42, 'glaze', C.ENAMEL), P(hr * 1.02, hl * 0.58, 'glaze', C.ENAMEL), P(hr, hl * 0.6, 'bronze', C.BRASS), P(hr, hl * 0.9, 'bronze', C.BRASS),
    P(hr * 0.8, hl, 'bronze', C.BRASS), P(0, hl, 'bronze', C.BRASS),
  ], at(-hl / 2, HAM.y, HAM.z, AXIS_X.clone()), { segs: 8, wear: 0.6, crease: 30 });   // an octagonal brass head (a dark round face read as a lens)

  /* ------------------------------ the ranging pole --------------------------- */
  // brass, 1.90 m: a clamp on the rear-right shoulder, engraved ink rings every 0.25 m, a ball-and-spike finial
  const PX = PEG.poleX, PZ = PEG.poleZ, PY0 = AY + Math.sqrt(R * R - PX * PX) - 0.02, TOP = PEG.poleTop;
  lathe(H('pelvis'), [P(0, 0, 'graphite', C.GUNMETAL), P(0.034, 0, 'graphite', C.GUNMETAL), P(0.034, 0.07, 'bronze', C.BRASS), P(0.024, 0.09, 'bronze', C.BRASS), P(0, 0.09, 'bronze', C.BRASS)],
    at(PX, PY0, PZ), { segs: 14, wear: 0.6 });
  rivetRing(H('pelvis'), V(PX, PY0 + 0.035, PZ), V(0, 1, 0), 0.034, 4, 0.008, { radial: true, phase: 0.4 });
  const FIN = TOP - 0.11;
  strut(H('pelvis'), V(PX, PY0 + 0.06, PZ), V(PX, FIN, PZ), 0.014, 0.011, { surf: 'bronze', tone: C.BRASS, sides: 8, wear: 0.45 });
  for (let y = 1.0; y < FIN - 0.05; y += 0.25) strut(H('pelvis'), V(PX, y, PZ), V(PX, y + 0.022, PZ), 0.0135, 0.0135, { surf: 'graphite', tone: C.INK, sides: 8, wear: 0.2 });
  ball(H('pelvis'), V(PX, FIN, PZ), 0.024, { surf: 'bronze', tone: C.BRASS, w: 10, h: 7 });
  strut(H('pelvis'), V(PX, FIN, PZ), V(PX, TOP, PZ), 0.012, 0.0015, { surf: 'bronze', tone: C.BRASS, sides: 8, wear: 0.4 });

  /* ------------------------------- the peg racks ----------------------------- */
  const RACK = new KBucket('peg-rack');
  for (const s of [-1, 1]) {
    const xAt = (y) => s * (R + 0.035 + (y - (AY - 0.12)) / 0.32 * 0.06);
    rbox(RACK, V(xAt(AY - 0.03), AY - 0.03, Z0 + L * 0.42), [0.026, 0.026, 0.40], 0.007, { surf: 'bronze', tone: C.BRASS, wear: 0.6 });
    rbox(RACK, V(xAt(AY + 0.12), AY + 0.12, Z0 + L * 0.42), [0.026, 0.022, 0.40], 0.007, { surf: 'bronze', tone: C.BRASS, wear: 0.6 });
    for (const zz of [Z0 + L * 0.42 - 0.2, Z0 + L * 0.42 + 0.2]) for (const yy of [AY - 0.03, AY + 0.12]) rivet(RACK, V(xAt(yy) + s * 0.013, yy, zz), V(s, 0, 0), 0.008);
    for (let i = 0; i < 4; i++) {
      const z = Z0 + L * 0.42 - 0.135 + i * 0.09;
      const P3 = (y) => V(xAt(y), y, z);
      strut(RACK, P3(AY + 0.20), P3(AY + 0.155), 0.017, 0.017, { surf: 'glaze', tone: C.VERM, sides: 8 });     // the cap (flat ink)
      strut(RACK, P3(AY + 0.155), P3(AY - 0.07), 0.011, 0.011, { surf: 'glaze', tone: C.ENAMEL, sides: 6 });
      strut(RACK, P3(AY - 0.07), P3(AY - 0.12), 0.011, 0.002, { surf: 'graphite', tone: C.CHROME, sides: 6 });
    }
  }

  /* ----------------------------------- legs ---------------------------------- */
  const L1 = 0.2, L2 = 0.23;
  const LEGS = [];
  for (const [row, hz, az, hinge] of [['F', 0.17, 0.25, 1], ['H', -0.33, -0.41, -1]]) {
    for (const s of [1, -1]) {
      const id = (s > 0 ? 'R' : 'L') + row;
      const hip = V(s * 0.17, AY - 0.1, hz);
      const ankle = V(s * 0.29, 0.07, az);
      const knee = solveKnee(hip, ankle, hinge, L1, L2);
      const toe = ankle.clone().add(V(s * 0.01, -0.06, 0.06));
      LEGS.push({ id, hinge, hip, knee, ankle, toe, s });
    }
  }
  for (const Lg of LEGS) {
    const thigh = `${Lg.id}_thigh`, shin = `${Lg.id}_shin`, foot = `${Lg.id}_foot`;
    lathe(H('pelvis'), [P(0, 0, 'graphite', C.GUNMETAL), P(0.07, 0, 'bronze', C.BRASS), P(0.066, 0.035, 'bronze', C.BRASS), P(0, 0.045, 'graphite', C.GUNMETAL)],
      at(Lg.hip.x + Lg.s * 0.005, Lg.hip.y, Lg.hip.z, new THREE.Matrix4().makeRotationZ(-Lg.s * Math.PI / 2)), { segs: 14, wear: 0.5 });
    ball(H(thigh), Lg.hip, 0.048, { surf: 'graphite', tone: C.GUNMETAL, w: 10, h: 7 });
    strut(H(thigh), Lg.hip, Lg.knee, 0.036, 0.03, { surf: 'graphite', tone: C.GUNMETAL, sides: 8 });
    strut(H(thigh), Lg.hip.clone().lerp(Lg.knee, 0.18), Lg.hip.clone().lerp(Lg.knee, 0.8), 0.048, 0.04, { surf: 'glaze', tone: C.ENAMEL, sides: 8, wear: 0.4 });
    const axle = new THREE.Vector3().crossVectors(Lg.knee.clone().sub(Lg.hip), Lg.ankle.clone().sub(Lg.knee)).normalize();
    strut(H(thigh), Lg.knee.clone().addScaledVector(axle, -0.042), Lg.knee.clone().addScaledVector(axle, 0.042), 0.036, 0.036, { surf: 'bronze', tone: C.BRASS, sides: 10, wear: 0.6 });
    strut(H(shin), Lg.knee, Lg.ankle, 0.026, 0.021, { surf: 'graphite', tone: C.GUNMETAL, sides: 8 });
    strut(H(shin), Lg.knee.clone().lerp(Lg.ankle, 0.42), Lg.knee.clone().lerp(Lg.ankle, 0.5), 0.03, 0.03, { surf: 'bronze', tone: C.BRASS, sides: 8, wear: 0.6 });
    ball(H(foot), Lg.ankle, 0.028, { surf: 'graphite', tone: C.GUNMETAL, w: 8, h: 6 });
    const pad = V(Lg.ankle.x, 0, Lg.ankle.z + 0.02);
    lathe(H(foot), [P(0, 0, 'rubber', C.RUBBER), P(0.066, 0, 'rubber', C.RUBBER), P(0.07, 0.016, 'bronze', C.BRASS), P(0.038, 0.048, 'bronze', C.BRASS), P(0, 0.052, 'graphite', C.GUNMETAL)],
      at(pad.x, pad.y, pad.z), { segs: 12, wear: 0.6 });
    strut(H(foot), Lg.ankle, V(pad.x, 0.044, pad.z), 0.02, 0.018, { surf: 'graphite', tone: C.GUNMETAL, sides: 8 });
  }

  /* --------------------------------- recentre -------------------------------- */
  const all = [...hull.values(), RACK];
  const box = new THREE.Box3();
  for (const b of all) b.bounds(box);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, y0 = box.min.y;
  for (const b of all) b.translate(-cx, -y0, -cz);
  const sh = (v) => [+(v.x - cx).toFixed(4), +(v.y - y0).toFixed(4), +(v.z - cz).toFixed(4)];
  const size = box.getSize(new THREE.Vector3());
  // the body box without the pole (BIBLE §7.4: 1.1 x 0.6 x 0.9 body)
  const body = new THREE.Box3();
  {
    const pole = H('pelvis');
    for (const b of all) {
      for (let i = 0; i < b.pos.length; i += 3) {
        const x = b.pos[i] + cx, y = b.pos[i + 1] + y0, z = b.pos[i + 2] + cz;
        if (b === pole && Math.hypot(x - PX, z - PZ) < 0.04 && y > PY0 + 0.09) continue;
        body.expandByPoint(new THREE.Vector3(x, y, z));
      }
    }
  }

  const rigSpec = {
    spine: [
      { name: 'pelvis', pos: sh(V(0, AY, Z0 + L * 0.42)), r: 0.34 },
      { name: 'head', pos: sh(TR), r: 0.14, tip: sh(V(PEG.lampX, PEG.lampY, PEG.lampBackZ + PEG.lampDepth + 0.1)) },
    ],
    tail: [{ name: 'mallet', pos: sh(PIV), r: 0.12 }],
    legGateY: +(AY - 0.04 - y0).toFixed(4),
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
  const sockets = {
    lamp: sh(dr.face), lampR: +dr.radius.toFixed(4),
    mallet: sh(HAM), strike: sh(HAM.clone().add(V(0, -hr, 0))),
    rack: sh(V(R + 0.05, AY + 0.05, Z0 + L * 0.42)), rackRoot: sh(V(0, AY + 0.05, Z0 + L * 0.42)),
    poleTop: sh(V(PX, TOP, PZ)), poleFoot: sh(V(PX, PY0, PZ)),
    top: sh(V(PX, TOP, PZ)),
    bodyTop: +(body.max.y - y0).toFixed(4),
  };

  const hullAll = mergeLabelled(hull, BONE_ORDER, 'peg-hull');
  const fin = finish(hullAll, { occluders: [RACK], rays: 28, dist: 0.4, footBand: noDust ? 0 : 0.4, lamps: [], verdigris: 0.3 });
  finish(RACK, { occluders: [hullAll], rays: 28, dist: 0.4, footBand: noDust ? 0 : 0.4, lamps: [], verdigris: 0.3 });

  const target = file || path.join(out, OUTPUTS[0]);
  const stats = await writeInstrument([
    { bucket: hullAll, role: 'hull', material: { name: 'r5-peg-hull' } },
    { bucket: RACK, role: 'tool', material: { name: 'r5-peg-hull', anchor: sockets.rackRoot } },
  ], {
    file: target,
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    extras: {
      r5Rig: rigSpec, r5BoneOrder: BONE_ORDER,
      r5Size: [+size.x.toFixed(4), +size.y.toFixed(4), +size.z.toFixed(4)],
      r5Body: [+(body.max.x - body.min.x).toFixed(4), +(body.max.y - body.min.y).toFixed(4), +(body.max.z - body.min.z).toFixed(4)],
      r5Sockets: sockets,
      r5Generator: { name: RECIPE, design: 'peg', kit: 'M1.4a', licence: 'original work (generated), no third-party assets' },
    },
  });
  return {
    kind: 'peg', file: path.relative(out, target), bytes: stats.bytes, tris: stats.tris, meshTris: stats.meshTris, verts: stats.verts,
    materials: stats.materials, textures: stats.textures, bones: BONE_ORDER.length, legs: LEGS.length, aoMean: +fin.aoMean.toFixed(3),
    size: { x: +size.x.toFixed(3), y: +size.y.toFixed(3), z: +size.z.toFixed(3) },
    body: { x: +(body.max.x - body.min.x).toFixed(3), y: +(body.max.y - body.min.y).toFixed(3), z: +(body.max.z - body.min.z).toFixed(3) },
    _buckets: { hullAll, rack: RACK, sockets, size },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const r = await build({ out: i >= 0 ? path.resolve(process.argv[i + 1]) : ROOT });
  delete r._buckets;
  console.log(JSON.stringify(r));
}
