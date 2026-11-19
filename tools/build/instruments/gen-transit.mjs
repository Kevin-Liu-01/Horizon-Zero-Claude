#!/usr/bin/env node
/**
 * CALIMA — the TRANSIT'S FAR FORM generator (instruments; BIBLE §7.4 #12; M2 wave 4 "the hour", area C). Original
 * work: no third-party asset is read. Built from the shared hull kit (`parts/kit.mjs`).
 *
 *   node tools/build/instruments/gen-transit.mjs [--out <dir>]
 *     -> public/models/instruments/transit-far.glb   (ONE mesh, one material: no glass, no LOD, no rig)
 *
 * WHAT THE FIRST HOUR SEES (bible 11.2 0:55; M2 briefs §6 wave 4: "three pale staff legs and the drum in haze, one
 * mesh, no behaviour, never against a low sun"). The colossus (BIBLE §7.4 #12, 22 m, 14 x 14 m) as it stands on the
 * Malpais shelf about a hundred metres off in calima at noon: the read is its SILHOUETTE and its VALUE, so every part
 * is sized for 100-180 m and nothing is finer than about 0.1 m:
 *   - THREE 20 m GRADUATED STAFF LEGS splayed from the tripod head (18.7 m) to brass foot shoes on a 7 m radius: white
 *     enamel with bold vermilion graduations every 2 m (a levelling staff's, at the far form's scale) and three gunmetal
 *     knee-seal collars on each (the fight's nine seals, at 5.5, 10.5 and 15.5 m of each leg);
 *   - the brass TRIPOD HEAD, and under it THREE PLUMBS hung folded on cables, ready to drop (a gyroscope-sphere head and
 *     its folded tripod as one long cone);
 *   - the HOUSE-SIZED DRUM (r 2.5 m) on the head, enamel with brass bands, a RING OF FIVE LAMP drums round it (their
 *     faces bone-gold: the far form draws no lamp of its own; nothing here is emissive);
 *   - two STANDARDS on the drum carrying the 9 m TELESCOPE across them (its axis 21.25 m up), the vertical circle on the
 *     right standard, and the great LEVEL VIAL slung outside the drum in a brass cage: glass and a bubble, unlit by day
 *     (bible: "nothing glows inside the body");
 *   - a mast with a faded orchil pennant to 22.0 m, and three long pennants (1 x 3 m) from the head (the banner rule).
 * No head, no neck, no eye, no animal part; never climbable (it is scenery: no collider, no climb volume).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { V, strut, ball, lathe, torus } from '../lib/hs.mjs';
import { THREE, C, KBucket, finish, writeInstrument, resetKitStats, banner } from './parts/kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const LANE = 'instruments';
export const RECIPE = 'tools/build/instruments/gen-transit.mjs';
export const OUTPUTS = ['public/models/instruments/transit-far.glb'];

/** The far form's design numbers (m). TOP is the roster height (BIBLE §7.4: 14 x 14 x 22). */
export const TRANSIT = Object.freeze({
  footR: 7.0, headY: 18.7, headAttachR: 1.15, legR0: 0.34, legR1: 0.24, gradEvery: 2.0, gradLen: 0.3, seals: [5.5, 10.5, 15.5],
  drumR: 2.5, drum0: 19.3, drum1: 20.6, lamps: 5, lampY: 19.95, lampR: 0.3,
  standX: 1.55, scopeY: 21.25, scopeR: 0.6, scopeL: 9.0, top: 22.0,
  plumbs: 3, plumbHang: 2.6, plumbR: 0.55,
});
const BANNER_PALE = 0xa392ab;
const LAMP_FACE = 0xf2ead3;   // the calm lamp's bone-gold, as a painted face (no emissive on the far form)

export async function build({ out = ROOT, file = null, preview = false } = {}) {
  resetKitStats();
  const S = TRANSIT;
  const b = new KBucket('transit-far');
  const P = (r, h, surf, tone) => ({ r, h, surf, tone });
  const legA = [90, 210, 330].map((d) => (d * Math.PI) / 180);

  /* ------------------------------- the legs -------------------------------------- */
  for (const a of legA) {
    const ca = Math.cos(a), sa = Math.sin(a);
    const foot = V(ca * S.footR, 0.45, sa * S.footR);
    const top = V(ca * S.headAttachR, S.headY - 0.25, sa * S.headAttachR);
    const L = top.distanceTo(foot);
    const dir = top.clone().sub(foot).normalize();
    // white enamel with a vermilion band every gradEvery m (the staff's graduations at the far form's scale)
    let s = 0;
    while (s < L - 1e-3) {
      const inBand = (s % S.gradEvery) < S.gradLen - 1e-6 && s > 0.8;
      const next = Math.min(L, inBand ? s + S.gradLen : Math.floor(s / S.gradEvery) * S.gradEvery + S.gradEvery);
      const r0 = S.legR0 + (S.legR1 - S.legR0) * (s / L), r1 = S.legR0 + (S.legR1 - S.legR0) * (next / L);
      strut(b, foot.clone().addScaledVector(dir, s), foot.clone().addScaledVector(dir, next), r0, r1,
        { surf: 'glaze', tone: inBand ? C.VERM : C.ENAMEL, sides: 10 });
      s = next;
    }
    // the three knee seals: gunmetal collars between brass rings
    for (const at of S.seals) {
      const c = foot.clone().addScaledVector(dir, at);
      const r = S.legR0 + (S.legR1 - S.legR0) * (at / L);
      strut(b, c.clone().addScaledVector(dir, -0.28), c.clone().addScaledVector(dir, 0.28), r * 1.45, r * 1.45, { surf: 'rubber', tone: C.GUNMETAL, sides: 12 });
      for (const k of [-0.34, 0.34]) strut(b, c.clone().addScaledVector(dir, k - 0.05), c.clone().addScaledVector(dir, k + 0.05), r * 1.6, r * 1.6, { surf: 'bronze', tone: C.BRASS, sides: 12 });
    }
    // the foot shoe: a brass disc and a gunmetal ankle
    lathe(b, [P(0, 0, 'bronze', C.BRASS), P(0.95, 0, 'bronze', C.BRASS), P(0.95, 0.18, 'bronze', C.BRASS), P(0.6, 0.38, 'bronze', C.BRASS), P(0.42, 0.42, 'graphite', C.GUNMETAL), P(0, 0.42, 'graphite', C.GUNMETAL)],
      new THREE.Matrix4().makeTranslation(ca * S.footR, 0, sa * S.footR), { segs: 16 });
    strut(b, V(ca * S.footR, 0.38, sa * S.footR), foot.clone().addScaledVector(dir, 0.8), 0.42, S.legR0 * 1.2, { surf: 'graphite', tone: C.GUNMETAL, sides: 10 });
    // the clevis at the head
    ball(b, top, 0.42, { surf: 'bronze', tone: C.BRASS, w: 10, h: 6 });
  }

  /* ------------------------------- the tripod head and the hung Plumbs ----------- */
  lathe(b, [P(0, S.headY - 0.55, 'bronze', C.BRASS), P(1.25, S.headY - 0.55, 'bronze', C.BRASS), P(1.55, S.headY - 0.25, 'bronze', C.BRASS),
    P(1.55, S.headY + 0.25, 'bronze', C.BRASS), P(1.9, S.headY + 0.45, 'bronze', C.BRASS), P(1.9, S.drum0, 'bronze', C.BRASS), P(0, S.drum0, 'bronze', C.BRASS)],
    new THREE.Matrix4(), { segs: 28 });
  for (let i = 0; i < S.plumbs; i++) {
    const a = legA[i] + Math.PI / 3;
    const top = V(Math.cos(a) * 0.9, S.headY - 0.55, Math.sin(a) * 0.9);
    const hang = V(Math.cos(a) * 1.05, S.headY - 0.55 - S.plumbHang, Math.sin(a) * 1.05);
    strut(b, top, hang, 0.05, 0.05, { surf: 'graphite', tone: C.GUNMETAL, sides: 6 });
    // a folded Plumb: the gyroscope-sphere head over its folded tripod (one long cone), a brass ring at the waist
    ball(b, hang.clone().add(V(0, -S.plumbR * 0.8, 0)), S.plumbR, { surf: 'glaze', tone: C.ENAMEL, w: 12, h: 8 });
    torus(b, hang.clone().add(V(0, -S.plumbR * 0.8, 0)), S.plumbR * 1.08, 0.05, 'y', { surf: 'bronze', tone: C.BRASS, radial: 18 });
    strut(b, hang.clone().add(V(0, -S.plumbR * 1.5, 0)), hang.clone().add(V(0, -S.plumbR * 1.5 - 2.1, 0)), 0.34, 0.06, { surf: 'graphite', tone: C.GUNMETAL, sides: 9 });
  }

  /* ------------------------------- the drum, its lamps and the vial -------------- */
  lathe(b, [P(0, S.drum0, 'glaze', C.ENAMEL), P(S.drumR * 0.96, S.drum0, 'glaze', C.ENAMEL), P(S.drumR, S.drum0 + 0.12, 'glaze', C.ENAMEL),
    P(S.drumR, S.drum1 - 0.12, 'glaze', C.ENAMEL), P(S.drumR * 0.96, S.drum1, 'glaze', C.ENAMEL), P(S.drumR * 0.55, S.drum1 + 0.18, 'glaze', C.ENAMEL), P(0, S.drum1 + 0.2, 'glaze', C.ENAMEL)],
    new THREE.Matrix4(), { segs: 36 });
  for (const y of [S.drum0 + 0.16, S.drum1 - 0.16]) torus(b, V(0, y, 0), S.drumR + 0.02, 0.07, 'y', { surf: 'bronze', tone: C.BRASS, radial: 40 });
  for (let i = 0; i < S.lamps; i++) {
    const a = (i / S.lamps) * Math.PI * 2 + Math.PI / 2;
    const n = V(Math.cos(a), 0, Math.sin(a)), base = n.clone().multiplyScalar(S.drumR - 0.05).add(V(0, S.lampY, 0));
    const face = base.clone().addScaledVector(n, 0.36);
    strut(b, base, face, S.lampR * 1.15, S.lampR * 1.2, { surf: 'glaze', tone: C.ENAMEL, sides: 14 });
    strut(b, face.clone().addScaledVector(n, -0.04), face.clone().addScaledVector(n, 0.04), S.lampR * 1.3, S.lampR * 1.3, { surf: 'bronze', tone: C.BRASS, sides: 14 });
    strut(b, face.clone().addScaledVector(n, -0.02), face.clone().addScaledVector(n, 0.05), S.lampR * 0.95, S.lampR * 0.95, { surf: 'glaze', tone: LAMP_FACE, sides: 14 });
  }
  // the great level vial in its brass cage, slung outside the drum on the left (-x): glass and a bubble, unlit by day
  const vc = V(-(S.drumR + 0.75), S.drum1 - 0.35, 0), vl = 3.4;
  strut(b, vc.clone().add(V(0, 0, -vl / 2)), vc.clone().add(V(0, 0, vl / 2)), 0.26, 0.26, { surf: 'glaze', tone: C.ICE, sides: 14 });
  ball(b, vc.clone().add(V(0.05, 0.2, 0.35)), 0.12, { surf: 'glaze', tone: 0xf4f8f6, w: 8, h: 6 });
  for (const z of [-vl / 2, -vl / 6, vl / 6, vl / 2]) torus(b, vc.clone().add(V(0, 0, z)), 0.3, 0.04, 'z', { surf: 'bronze', tone: C.BRASS, radial: 16 });
  for (const [dy, dx] of [[0.3, 0], [-0.3, 0]]) strut(b, vc.clone().add(V(dx, dy, -vl / 2)), vc.clone().add(V(dx, dy, vl / 2)), 0.035, 0.035, { surf: 'bronze', tone: C.BRASS, sides: 6 });
  for (const z of [-vl / 3, vl / 3]) strut(b, vc.clone().add(V(0.3, 0, z)), V(-(S.drumR - 0.1), S.drum1 - 0.35, z), 0.06, 0.06, { surf: 'graphite', tone: C.GUNMETAL, sides: 6 });

  /* ------------------------------- the standards, the telescope, the circle ------ */
  for (const s of [1, -1]) {
    const x = s * S.standX;
    strut(b, V(x, S.drum1, -0.55), V(x, S.scopeY, -0.25), 0.16, 0.12, { surf: 'graphite', tone: C.GUNMETAL, sides: 8 });
    strut(b, V(x, S.drum1, 0.55), V(x, S.scopeY, 0.25), 0.16, 0.12, { surf: 'graphite', tone: C.GUNMETAL, sides: 8 });
    strut(b, V(x - 0.12 * s, S.scopeY, 0), V(x + 0.12 * s, S.scopeY, 0), 0.24, 0.24, { surf: 'bronze', tone: C.BRASS, sides: 12 });
  }
  strut(b, V(-S.standX, S.scopeY, 0), V(S.standX, S.scopeY, 0), 0.12, 0.12, { surf: 'bronze', tone: C.BRASS, sides: 10 });
  // the telescope along z: the eyepiece end (-z) narrow, the objective end (+z) a wider brass-ringed hood
  const Z0 = -S.scopeL * 0.42, Z1 = S.scopeL * 0.58;
  const scope = new THREE.Matrix4().makeRotationX(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0, S.scopeY, 0));
  lathe(b, [P(0, Z0 - 0.3, 'graphite', C.GUNMETAL), P(0.22, Z0 - 0.3, 'graphite', C.GUNMETAL), P(0.3, Z0, 'bronze', C.BRASS), P(S.scopeR * 0.75, Z0 + 0.3, 'glaze', C.ENAMEL),
    P(S.scopeR, 0.5, 'glaze', C.ENAMEL), P(S.scopeR * 1.05, Z1 - 1.2, 'glaze', C.ENAMEL), P(S.scopeR * 1.15, Z1 - 1.1, 'bronze', C.BRASS), P(S.scopeR * 1.15, Z1, 'bronze', C.BRASS),
    P(S.scopeR * 0.9, Z1, 'graphite', C.GUNMETAL), P(0, Z1 - 0.08, 'graphite', C.GUNMETAL)], scope, { segs: 24 });
  for (const z of [Z0 + 1.2, 0.0, Z1 - 2.4]) torus(b, V(0, S.scopeY, z), S.scopeR + 0.04, 0.05, 'z', { surf: 'bronze', tone: C.BRASS, radial: 24 });
  // the vertical circle on the right standard: a brass limb ring, edge-on to the telescope
  torus(b, V(S.standX + 0.32, S.scopeY, 0), 0.66, 0.07, 'x', { surf: 'bronze', tone: C.BRASS, radial: 36 });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    strut(b, V(S.standX + 0.32, S.scopeY, 0), V(S.standX + 0.32, S.scopeY + Math.sin(a) * 0.62, Math.cos(a) * 0.62), 0.04, 0.04, { surf: 'bronze', tone: C.BRASS, sides: 5 });
  }

  /* ------------------------------- the mast and its pennants (to TOP) ----------- */
  const m0 = V(0, S.drum1 + 0.2, -1.4), m1 = V(0, S.top, -1.4);
  strut(b, m0, m1.clone().add(V(0, -0.25, 0)), 0.07, 0.05, { surf: 'graphite', tone: C.GUNMETAL, sides: 8 });
  strut(b, m1.clone().add(V(0, -0.25, 0)), m1, 0.05, 0.004, { surf: 'bronze', tone: C.BRASS, sides: 8 });
  banner(b, V(0.0, S.top - 0.4, -1.4), V(0, 0, -1), { w: 0.9, h: 1.9, out: V(1, 0, 0), tone: BANNER_PALE, hem: C.STAFF });
  // three long survey pennants from the head's rim, one between each pair of legs (read at 100 m: 1 x 3 m)
  for (let i = 0; i < 3; i++) {
    const a = legA[i] + Math.PI / 3, n = V(Math.cos(a), 0, Math.sin(a));
    const top = n.clone().multiplyScalar(1.95).add(V(0, S.headY + 0.35, 0));
    banner(b, top, V(-n.z, 0, n.x), { w: 1.0, h: 3.0, out: n, tone: BANNER_PALE, hem: C.STAFF });
  }

  /* ------------------------------- write ---------------------------------------- */
  const box = new THREE.Box3();
  b.bounds(box);
  const size = box.getSize(new THREE.Vector3());
  const fin = finish(b, { rays: 28, dist: 0.9, footBand: 0.6, lamps: [], verdigris: 0.25 });
  const target = file || path.join(out, OUTPUTS[0]);
  const head = [0, +((S.drum0 + S.drum1) / 2).toFixed(3), 0];
  const stats = await writeInstrument([{ bucket: b, role: 'hull', material: { name: 'r5-transit-far' } }], {
    file: target,
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    extras: {
      r5Size: [+size.x.toFixed(4), +size.y.toFixed(4), +size.z.toFixed(4)],
      r5Far: { kind: 'transit', head, footR: S.footR, top: S.top, lamps: S.lamps, emissive: 0 },
      r5Generator: { name: RECIPE, design: 'transit-far', kit: 'M1.4a', licence: 'original work (generated), no third-party assets' },
    },
  });
  const res = {
    kind: 'transit-far', file: path.relative(out, target), bytes: stats.bytes, tris: stats.tris, meshes: stats.meshes, materials: stats.materials,
    textures: stats.textures, aoMean: +fin.aoMean.toFixed(3), size: { x: +size.x.toFixed(3), y: +size.y.toFixed(3), z: +size.z.toFixed(3) }, head,
  };
  if (preview) res._buckets = { hull: [b], glass: [], lamps: [], size };
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  console.log(JSON.stringify(await build({ out: i >= 0 ? path.resolve(process.argv[i + 1]) : ROOT })));
}
