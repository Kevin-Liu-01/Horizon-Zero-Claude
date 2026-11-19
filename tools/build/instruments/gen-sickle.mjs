#!/usr/bin/env node
/**
 * CALIMA — the SICKLE generator (instruments; BIBLE §7.4 #5; M2 wave 2 "the look"). Original work: no third-party
 * asset is read. Built from the shared hull kit (`parts/kit.mjs`) and the plated shell (`parts/shell.mjs`).
 *
 *   node tools/build/instruments/gen-sickle.mjs [--out <dir>]
 *     -> public/models/instruments/sickle.glb   (hull, the coolant flask's glass, LOD1 caster)
 *
 * THE SICKLE (medium, 3.6 x 1.4 x 1.7 m; role `flanker` from its behaviour wave). No board design: drawn fresh in
 * the shared language (owner question Q3's default), on the grey silhouette of wave 1:
 *   - a LOW WEDGE BODY lofted on rounded sections, rising to its shoulder over the forelegs: white enamel plates over
 *     gunmetal seams, brass rivets, a brass strake;
 *   - FOUR RAKED-BACK LEGS (the knees behind the hips), gunmetal and enamel, brass knee hubs, disc feet;
 *   - at the front the HUB: a turned enamel cowl with an oxblood glaze band (the bible's hub cowl), the brass HUB
 *     BEARING exposed at its nose (the weak point of the Clearcut wind-up), and the two curved bronze BLADES that
 *     scissor on it (satin edges);
 *   - ONE LAMP: a small kit lamp drum on a brass bracket ON the body's right shoulder, hooded (it reads as a slit from
 *     above), its iris drawn by the lamp system at the drum's face (wave 1's floating lamp is gone: the drum is the
 *     anchor and it sits on the plates);
 *   - the COOLANT FLASK on its back: a pale-ice level vial in a brass cradle; one antenna with a spike finial to 1.70 m.
 * No head, no neck, no eye, no animal part.
 *
 * Bones (rig-ready for the behaviour wave): pelvis (rear body), chest (fore body, lamp, flask), neck (the cowl), head
 * (the hub and blades) + 4 legs x 3. The GLB carries `_BONE` and the autorig spec in `asset.extras.r5Rig`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { V, strut, ball, rbox, plate, lathe, basis, at, cable } from '../lib/hs.mjs';
import {
  THREE, C, KBucket, mergeLabelled, finish, writeInstrument, solveKnee, lod1From,
  resetKitStats, rivet, rivetRing, lampDrum, antenna, levelVial, limbRing,
} from './parts/kit.mjs';
import { loftShell, surveyLeg } from './parts/shell.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const LANE = 'instruments';
export const RECIPE = 'tools/build/instruments/gen-sickle.mjs';
export const OUTPUTS = ['public/models/instruments/sickle.glb'];

export const SICKLE = Object.freeze({
  sections: [
    { z: -1.22, w: 0.2, yb: 0.88, ym: 0.95, yt: 1.03, n: 2.4 },
    { z: -0.95, w: 0.38, yb: 0.77, ym: 0.93, yt: 1.09, n: 2.8 },
    { z: -0.3, w: 0.49, yb: 0.72, ym: 0.93, yt: 1.15, n: 3 },
    { z: 0.42, w: 0.47, yb: 0.74, ym: 0.96, yt: 1.25, n: 3 },
    { z: 0.86, w: 0.34, yb: 0.82, ym: 1.0, yt: 1.22, n: 2.8 },
    { z: 1.02, w: 0.2, yb: 0.9, ym: 1.02, yt: 1.12, n: 2.4 },
  ],
  split: -0.15,
  hub: [0, 1.0, 1.02], cowlLen: 0.3, cowlR: 0.25, bearingR: 0.13,
  bladeZ: [1.5, 1.56], bladeR: 0.8,
  lamp: [0.2, 1.36, 0.6], lampR: 0.095, lampDepth: 0.15,
  hipX: 0.42, hipY: 0.86, footX: 0.6, footY: 0.1, frontFoot: 0.32, hindFoot: -1.84, rake: 0.32, thigh: 0.6, shin: 0.78, pad: 0.1,
  top: 1.70,
});

export async function build({ out = ROOT, file = null, preview = false } = {}) {
  resetKitStats();
  const S = SICKLE;
  const P = (r, h, surf, tone) => ({ r, h, surf, tone });
  const hull = new Map(), glass = new Map();
  const H = (b) => { if (!hull.has(b)) hull.set(b, new KBucket(`hull:${b}`)); return hull.get(b); };
  const GL = (b) => { if (!glass.has(b)) glass.set(b, new KBucket(`glass:${b}`)); return glass.get(b); };

  /* ------------------------------- the wedge body ---------------------------- */
  const so = { seamsU: [0.1, 0.26, 0.42, 0.58, 0.74, 0.9], seamsZ: [-0.7, S.split, 0.5], rivetEvery: 0.2, uSteps: 40, zStep: 0.1 };
  const skin = loftShell(H('pelvis'), S.sections, { ...so, zMax: S.split, caps: [true, false] });
  loftShell(H('chest'), S.sections, { ...so, zMin: S.split, caps: [false, true] });
  for (const s of [1, -1]) {
    for (const [bone, za, zb] of [['pelvis', -1.0, S.split - 0.02], ['chest', S.split + 0.02, 0.85]]) {
      const pts = [];
      for (let k = 0; k <= 10; k++) { const z = za + (zb - za) * k / 10, q = skin.at(s > 0 ? 0.25 : 0.75, z); pts.push(q.p.clone().addScaledVector(q.n, 0.01)); }
      cable(H(bone), pts, 0.016, { surf: 'bronze', tone: C.BRASS, segs: 18, radial: 5, wear: 0.6 });
    }
  }
  rbox(H('pelvis'), V(0, 0.715, -0.55), [0.2, 0.05, 1.1], 0.015, { surf: 'graphite', tone: C.GUNMETAL, wear: 0.2 });

  /* ------------------------------- the hub, its cowl and the blades ------------- */
  const HUB = V(...S.hub);
  const Mz = (p) => at(p.x, p.y, p.z, new THREE.Matrix4().makeRotationX(Math.PI / 2));   // a lathe along +Z
  lathe(H('neck'), [
    P(0, 0, 'graphite', C.GUNMETAL), P(S.cowlR * 0.8, 0, 'graphite', C.GUNMETAL), P(S.cowlR, 0.03, 'glaze', C.ENAMEL),
    P(S.cowlR * 1.01, 0.11, 'glaze', C.OXBLOOD), P(S.cowlR * 1.01, 0.145, 'glaze', C.ENAMEL), P(S.cowlR, 0.2, 'glaze', C.ENAMEL),
    P(S.cowlR * 0.94, S.cowlLen - 0.03, 'bronze', C.BRASS), P(S.cowlR * 0.82, S.cowlLen, 'bronze', C.BRASS), P(S.bearingR * 1.1, S.cowlLen, 'graphite', C.GUNMETAL),
  ], Mz(HUB), { segs: 32, wear: 0.4, crease: 30, panels: 4, gap: 2 });
  rivetRing(H('neck'), HUB.clone().add(V(0, 0, 0.215)), V(0, 0, 1), S.cowlR * 0.99, 12, 0.009, { radial: true });
  // the hub bearing (head): a brass race and a gunmetal spindle nose, exposed in front of the cowl
  const B0 = HUB.clone().add(V(0, 0, S.cowlLen));
  lathe(H('head'), [
    P(0, -0.02, 'graphite', C.GUNMETAL), P(S.bearingR, -0.02, 'bronze', C.BRASS), P(S.bearingR * 1.05, 0.04, 'bronze', C.BRASS),
    P(S.bearingR * 0.9, 0.09, 'bronze', C.BRASS), P(S.bearingR * 0.6, 0.1, 'graphite', C.GUNMETAL), P(S.bearingR * 0.45, 0.24, 'graphite', C.GUNMETAL),
    P(S.bearingR * 0.12, 0.36, 'bronze', C.BRASS), P(0, 0.37, 'bronze', C.BRASS),
  ], Mz(B0), { segs: 24, wear: 0.6, crease: 30 });
  rivetRing(H('head'), B0.clone().add(V(0, 0, 0.09)), V(0, 0, 1), S.bearingR * 0.72, 8, 0.009);
  // two curved blades: crescents in the plane square to the hub axis, one sweeping up and out to the left, one down
  // and out to the right (the scissor), each a bronze sheet with a satin edge, riveted to a gunmetal root plate
  const blade = (z, a0, sweep) => {
    // a sickle: the back (convex) edge an arc from the root out to the tip; the cutting edge inside it, the blade
    // 0.15 m wide at the root tapering to a point
    const R = S.bladeR, n = 12, back = [], cut = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n, a = a0 + sweep * t, r = 0.16 + (R - 0.16) * Math.sin(t * Math.PI * 0.5);
      const w = 0.15 * (1 - t) + 0.006;
      back.push([Math.cos(a) * r, Math.sin(a) * r]);
      const ai = a - Math.sign(sweep) * w / Math.max(0.2, r) * 0.35;
      cut.push([Math.cos(ai) * (r - w), Math.sin(ai) * (r - w)]);
    }
    const pts = [...back, ...cut.slice(0, -1).reverse()];
    const M = at(HUB.x, HUB.y, z);
    plate(H('head'), pts, 0.022, 0.005, M, { surf: 'bronze', tone: 0xb08a4a, wear: 0.7 });
    // the satin cutting edge along the inner curve
    cable(H('head'), cut.map(([x, y]) => V(HUB.x + x, HUB.y + y, z)), 0.006, { surf: 'chrome', tone: C.CHROME, segs: 24, radial: 4 });
    // the root: a gunmetal clamp on the bearing and two rivets
    const ra = a0 + sweep * 0.04;
    rbox(H('head'), V(HUB.x + Math.cos(ra) * 0.15, HUB.y + Math.sin(ra) * 0.15, z), [0.14, 0.1, 0.045], 0.012, { surf: 'graphite', tone: C.GUNMETAL, rot: [0, 0, ra] });
    for (const f of [0.12, 0.19]) rivet(H('head'), V(HUB.x + Math.cos(ra) * f, HUB.y + Math.sin(ra) * f, z + 0.024), V(0, 0, 1), 0.01);
  };
  blade(S.bladeZ[0], Math.PI * 0.58, 1.75);     // up and out to the left, curling down
  blade(S.bladeZ[1], -Math.PI * 0.42, 1.75);    // down and out to the right, curling up

  /* ------------------------------- the lamp, on the body ------------------------ */
  const LB = V(...S.lamp);
  // its brass bracket: a saddle on the shoulder plates, a trunnion block under the drum
  const sh = skin.at(0.07, LB.z);
  rbox(H('chest'), V(LB.x, (sh.p.y + LB.y - S.lampR) / 2, LB.z + 0.06), [0.16, Math.max(0.04, LB.y - S.lampR - sh.p.y + 0.04), 0.16], 0.012, { surf: 'bronze', tone: C.BRASS, wear: 0.6 });
  limbRing(H('chest'), at(LB.x, sh.p.y + 0.01, LB.z + 0.06), 0.05, 0.11, 0.014, { ticks: 12 });
  const dr = lampDrum(H('chest'), LB, V(0, 0, 1), { r: S.lampR, depth: S.lampDepth, ticks: 12 });
  // the hood: an enamel visor over the drum, riveted (a slit from above)
  plate(H('chest'), [[-0.11, 0], [0.11, 0], [0.085, 0.11], [-0.085, 0.11]], 0.012, 0.003,
    basis(V(-1, 0, 0), V(0, 0.12, 1).normalize(), V(0, 1, -0.12).normalize(), V(LB.x, LB.y + S.lampR * 1.02, LB.z + S.lampDepth - 0.1)), { surf: 'glaze', tone: C.ENAMEL, wear: 0.4 });
  for (const s of [1, -1]) rivet(H('chest'), V(LB.x + s * 0.07, LB.y + S.lampR * 1.04 + 0.012, LB.z + S.lampDepth - 0.06), V(0, 1, 0), 0.009);

  /* ------------------------------- the flask, the antenna ----------------------- */
  const crown = (z) => skin.at(0, z).p;
  const FC = crown(-0.62).clone().add(V(0, 0.1, 0));
  const vial = levelVial(H('chest'), GL('chest'), FC, V(0, 0, 1), { len: 0.36, r: 0.06 });
  for (const f of [-0.13, 0.13]) {
    const c = FC.clone().add(V(0, 0, f));
    lathe(H('chest'), [P(0.068, -0.012, 'bronze', C.BRASS), P(0.075, 0, 'bronze', C.BRASS), P(0.068, 0.012, 'bronze', C.BRASS)], Mz(c.clone().add(V(0, 0, -0.012))), { segs: 16, wear: 0.6 });
    strut(H('chest'), c.clone().add(V(0.05, -0.04, 0)), V(0.12, crown(-0.62 + f).y - 0.01, c.z), 0.012, 0.012, { surf: 'bronze', tone: C.BRASS, sides: 6 });
    strut(H('chest'), c.clone().add(V(-0.05, -0.04, 0)), V(-0.12, crown(-0.62 + f).y - 0.01, c.z), 0.012, 0.012, { surf: 'bronze', tone: C.BRASS, sides: 6 });
  }
  {
    const z = -0.95, q = skin.at(0.06, z), base = q.p.clone().add(V(0, -0.02, 0));
    lathe(H('pelvis'), [P(0, 0, 'bronze', C.BRASS), P(0.04, 0, 'bronze', C.BRASS), P(0.035, 0.035, 'bronze', C.BRASS), P(0.02, 0.05, 'bronze', C.BRASS)], at(base.x, base.y, base.z), { segs: 10, wear: 0.6 });
    antenna(H('pelvis'), base.clone().add(V(0, 0.04, 0)), V(base.x, S.top, base.z - 0.05), { r: 0.01, finial: 0.09, cross: 0.04 });
  }

  /* ------------------------------- the legs ------------------------------------- */
  const LEGS = [];
  for (const [row, fz, parent] of [['F', S.frontFoot, 'chest'], ['H', S.hindFoot, 'pelvis']]) {
    for (const s of [1, -1]) {
      const id = (s > 0 ? 'R' : 'L') + row;
      const hip = V(s * S.hipX, S.hipY, fz + S.rake + (row === 'H' ? 0.55 : 0)), ankle = V(s * S.footX, S.footY, fz);
      const knee = solveKnee(hip, ankle, -1, S.thigh, row === 'H' ? S.shin + 0.25 : S.shin);
      const toe = ankle.clone().add(V(s * 0.02, -0.08, 0.08));
      LEGS.push({ id, parent, hinge: -1, hip, knee, ankle, toe, s, zs: Math.sign(fz) || 1 });
    }
  }
  for (const Lg of LEGS) surveyLeg(H, Lg, { thighR: 0.045, shinR: 0.036, shin: 'enamel', pad: S.pad, boss: Lg.parent, padSegs: 14 });

  /* ------------------------------- recentre, rig, write ------------------------- */
  const all = [...hull.values(), ...glass.values()];
  const box = new THREE.Box3();
  for (const b of all) b.bounds(box);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, y0 = box.min.y;
  for (const b of all) b.translate(-cx, -y0, -cz);
  const shf = (v) => [+(v.x - cx).toFixed(4), +(v.y - y0).toFixed(4), +(v.z - cz).toFixed(4)];
  const size = box.getSize(new THREE.Vector3());
  const rigSpec = {
    spine: [
      { name: 'pelvis', pos: shf(V(0, 0.95, -0.7)), r: 0.5 },
      { name: 'chest', pos: shf(V(0, 0.97, S.split)), r: 0.5 },
      { name: 'neck', pos: shf(HUB), r: 0.26 },
      { name: 'head', pos: shf(B0), r: 0.2, tip: shf(B0.clone().add(V(0, 0, 0.3))) },
    ],
    tail: [],
    legGateY: +(S.hipY + 0.35 - y0).toFixed(4),
    legInboard: 0.3,
    legs: LEGS.map((Lg) => ({ id: Lg.id, parent: Lg.parent, hinge: Lg.hinge, hip: shf(Lg.hip), knee: shf(Lg.knee), ankle: shf(Lg.ankle), toe: shf(Lg.toe), r: 0.14, restFoot: [shf(Lg.ankle)[0], shf(Lg.ankle)[2]] })),
  };
  const BONE_ORDER = [...rigSpec.spine.map((s) => s.name), ...rigSpec.legs.flatMap((l) => [`${l.id}_thigh`, `${l.id}_shin`, `${l.id}_foot`])];
  const sockets = {
    lamp: shf(dr.face), lampR: +dr.radius.toFixed(4),
    hub: shf(B0.clone().add(V(0, 0, 0.05))), hubR: S.bearingR,
    blades: [shf(V(HUB.x, HUB.y, S.bladeZ[0])), shf(V(HUB.x, HUB.y, S.bladeZ[1]))], bladeR: S.bladeR,
    flask: shf(FC), flaskLen: vial.len, flaskR: vial.r,
    top: +size.y.toFixed(4),
    shift: [+(-cx).toFixed(4), +(-y0).toFixed(4), +(-cz).toFixed(4)],
  };
  const hullAll = mergeLabelled(hull, BONE_ORDER, 'sickle-hull');
  const glassAll = mergeLabelled(glass, BONE_ORDER, 'sickle-flask');
  const fin = finish(hullAll, { occluders: [glassAll], rays: 28, dist: 0.35, footBand: 0.45, lamps: [], verdigris: 0.3 });
  const lod1 = await lod1From(hullAll, 0.3, 'sickle-lod1');
  const ICE = new THREE.Color(C.ICE);
  const target = file || path.join(out, OUTPUTS[0]);
  const stats = await writeInstrument([
    { bucket: hullAll, role: 'hull', material: { name: 'r5-sickle-hull' } },
    { bucket: glassAll, role: 'sensor', material: { name: 'r5-sickle-flask-glass', emissive: [ICE.r, ICE.g, ICE.b], baseColor: [0.07, 0.11, 0.12, 1] } },
    { bucket: lod1, role: 'lod1', material: { name: 'r5-sickle-hull' } },
  ], {
    file: target,
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    extras: {
      r5Rig: rigSpec, r5BoneOrder: BONE_ORDER,
      r5Size: [+size.x.toFixed(4), +size.y.toFixed(4), +size.z.toFixed(4)],
      r5Sockets: sockets,
      r5Generator: { name: RECIPE, design: 'sickle', kit: 'M1.4a', licence: 'original work (generated), no third-party assets' },
    },
  });
  const res = {
    kind: 'sickle', file: path.relative(out, target), bytes: stats.bytes, tris: stats.tris, meshTris: stats.meshTris, verts: stats.verts,
    materials: stats.materials, textures: stats.textures, bones: BONE_ORDER.length, legs: LEGS.length, aoMean: +fin.aoMean.toFixed(3),
    size: { x: +size.x.toFixed(3), y: +size.y.toFixed(3), z: +size.z.toFixed(3) },
  };
  if (preview) res._buckets = { hull: [hullAll], glass: [glassAll], lamps: [{ at: sockets.lamp, r: dr.radius }], size };
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  console.log(JSON.stringify(await build({ out: i >= 0 ? path.resolve(process.argv[i + 1]) : ROOT })));
}
