#!/usr/bin/env node
/**
 * CALIMA — the STATIC SCRIPTED GAUGE (world-props W1; plan §2 row, bible §7.4
 * GAUGE + §8.9 beat 0:05 and its E19 fallback). Original work: nothing is read.
 *
 *   node tools/build/landmarks/recipes/gauge-static.mjs [--out <dir>]
 *     -> public/models/landmarks/gauge-static.glb
 *
 * Until instruments-b's living Gauge lands (W2), the first-hour beat needs one
 * standing in the pans that opens Sluice 3 when Brea arrives. Its silhouette is
 * the bible's: a lighthouse on stilts. A squat bone-glaze float drum with a
 * verdigris waterline band and an oxblood band, on four very long thin stilts
 * with knee seals and disc pads; a graduated staff mast (0-6 m, staff white
 * with survey-vermilion ticks) with a sliding float ring; a bronze sluice
 * nozzle low on its seaward side; the brine pump and the mast as components;
 * one lamp. No head, no eyes (bible §7).
 *
 * Nodes: `gauge-body` (static), `gauge-float` (the ring, origin on the mast
 * axis: the runtime slides it up the staff with the tide), `gauge-gate` (the
 * sluice leaf, origin on its hinge: the runtime swings it open), `gauge-lamp`
 * (emissive). Frame: origin = the ground between the stilt pads, nozzle on +X.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THREE, Bucket, V, strut, ball, rbox, torus, lathe, rng } from '../../lib/hs.mjs';
import { writeGLB } from '../../lib/glb.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const LANE = 'world-props';
export const RECIPE = 'tools/build/landmarks/recipes/gauge-static.mjs';
export const OUTPUTS = ['public/models/landmarks/gauge-static.glb'];

export const GAUGE = Object.freeze({
  drumY: 5.3, drumR: 1.55, mast0: 6.25, mastLen: 6.0, ringR: 0.44,
  hinge: [1.7, 1.15, 0], lamp: [0, 5.55, 1.62], feet: [[1.95, 1.95], [-1.95, 1.95], [-1.95, -1.95], [1.95, -1.95]],
});

export async function build({ out = ROOT } = {}) {
  const BONE = 0xe6dcc8, CELADON = 0xa9c4b0, OXBLOOD = 0x6e2421, BRONZE = 0xa07a3f, VERDI = 0x4f8f7e, GRAPH = 0x2b2c30, VERM = 0xd2452e, STAFF = 0xf1eee6;
  const P = (r, h, surf, tone) => ({ r, h, surf, tone });
  const body = new Bucket('gauge-body');
  const ring = new Bucket('gauge-float');
  const gate = new Bucket('gauge-gate');
  const lamp = new Bucket('gauge-lamp');
  const R = rng(43);
  const G = GAUGE;

  /* stilts: splayed, with knee seals at mid height and disc pads */
  for (const [fx, fz] of G.feet) {
    const foot = V(fx, 0.12, fz), knee = V(fx * 0.72, 2.6, fz * 0.72), hip = V(fx * 0.46, G.drumY - 0.55, fz * 0.46);
    strut(body, foot, knee, 0.075, 0.085, { surf: 'graphite', tone: GRAPH, sides: 10 });
    strut(body, knee, hip, 0.085, 0.1, { surf: 'glaze', tone: BONE, sides: 10, wear: 0.7 });
    strut(body, knee.clone().add(V(0, -0.14, 0)), knee.clone().add(V(0, 0.14, 0)), 0.15, 0.15, { surf: 'rubber', tone: 0x2a2624, sides: 12 });   // knee seal
    strut(body, V(fx, 0.0, fz), V(fx, 0.12, fz), 0.36, 0.3, { surf: 'bronze', tone: BRONZE, sides: 14, wear: 0.8 });                          // pad
    ball(body, hip, 0.16, { surf: 'bronze', tone: BRONZE, w: 10, h: 6 });
  }
  // cross-ties between the stilts (graphite rods)
  for (let i = 0; i < 4; i++) {
    const [ax, az] = G.feet[i], [bx, bz] = G.feet[(i + 1) % 4];
    strut(body, V(ax * 0.72, 2.6, az * 0.72), V(bx * 0.72, 2.6, bz * 0.72), 0.03, 0.03, { surf: 'graphite', tone: GRAPH, sides: 5 });
  }

  /* the float drum: squat, glazed, a verdigris waterline band low and an oxblood band */
  lathe(body, [
    P(0, -0.85, 'bronze', BRONZE), P(0.9, -0.82, 'bronze', BRONZE), P(1.42, -0.62, 'patina', VERDI), P(G.drumR, -0.38, 'patina', VERDI),
    P(G.drumR, -0.22, 'glaze', BONE), P(G.drumR, 0.18, 'glaze', OXBLOOD), P(G.drumR, 0.3, 'glaze', BONE),
    P(G.drumR - 0.05, 0.62, 'glaze', BONE), P(1.2, 0.86, 'bronze', BRONZE), P(0.55, 0.98, 'glaze', CELADON), P(0, 1.02, 'glaze', CELADON),
  ], new THREE.Matrix4().makeTranslation(0, G.drumY, 0), { segs: 40, panels: 8, gap: 1.2, wear: 0.55, crease: 32 });
  // ballast tanks (vial-class weak points) under the drum
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    lathe(body, [P(0, -0.32, 'glaze', CELADON), P(0.26, -0.28, 'glaze', CELADON), P(0.3, 0.2, 'glaze', CELADON), P(0, 0.26, 'bronze', BRONZE)],
      new THREE.Matrix4().makeTranslation(Math.cos(a) * 0.95, G.drumY - 1.05, Math.sin(a) * 0.95), { segs: 14, wear: 0.4 });
  }
  // the brine pump: a bronze housing on the drum's back with two pipe runs down into the cell
  rbox(body, V(-1.25, G.drumY + 0.35, 0), [0.6, 0.7, 0.9], 0.08, { surf: 'bronze', tone: BRONZE, wear: 0.8 });
  strut(body, V(-1.5, G.drumY + 0.1, 0.22), V(-1.85, 0.2, 0.5), 0.07, 0.07, { surf: 'patina', tone: VERDI, sides: 8 });
  strut(body, V(-1.5, G.drumY + 0.1, -0.22), V(-1.85, 0.2, -0.5), 0.07, 0.07, { surf: 'patina', tone: VERDI, sides: 8 });
  // the sluice: a bronze pipe from the drum down the +X side to a nozzle box low over the cell
  strut(body, V(1.35, G.drumY - 0.3, 0), V(1.62, 1.45, 0), 0.14, 0.14, { surf: 'bronze', tone: BRONZE, sides: 12, wear: 0.7 });
  rbox(body, V(1.7, 1.15, 0), [0.42, 0.7, 0.62], 0.06, { surf: 'bronze', tone: BRONZE, wear: 0.9 });
  lathe(body, [P(0.22, 0, 'bronze', BRONZE), P(0.16, 0.38, 'bronze', BRONZE), P(0.1, 0.42, 'graphite', GRAPH)],
    new THREE.Matrix4().makeTranslation(1.92, 0.95, 0).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2)), { segs: 14 });
  // the sluice leaf (its own node, hinged on the box's top edge)
  rbox(gate, V(0.02, -0.28, 0), [0.06, 0.52, 0.5], 0.02, { surf: 'patina', tone: VERDI, wear: 0.9, segs: 1 });
  strut(gate, V(0, 0, -0.27), V(0, 0, 0.27), 0.035, 0.035, { surf: 'bronze', tone: BRONZE, sides: 8 });

  /* the graduated staff mast 0-6 m: staff white, vermilion ticks every 0.2 m, a long tick each metre */
  strut(body, V(0, G.mast0 - 0.25, 0), V(0, G.mast0 + G.mastLen, 0), 0.09, 0.075, { surf: 'bisque', tone: STAFF, sides: 10, wear: 0.4 });
  for (let k = 0; k <= 30; k++) {
    const y = G.mast0 + k * 0.2, long = k % 5 === 0;
    const g = new THREE.BoxGeometry(long ? 0.26 : 0.14, long ? 0.06 : 0.035, 0.03);
    g.translate(long ? 0.13 : 0.07 + 0.02, y, 0.08);
    body.add(g, { surf: 'bisque', tone: VERM, wear: 0.3 }); g.dispose();
    const g2 = g.clone(); g2.rotateY(Math.PI); body.add(g2, { surf: 'bisque', tone: VERM, wear: 0.3 }); g2.dispose();
  }
  ball(body, V(0, G.mast0 + G.mastLen + 0.08, 0), 0.12, { surf: 'bronze', tone: BRONZE, w: 10, h: 6 });
  // the float ring (own node; origin on the mast axis)
  torus(ring, V(0, 0, 0), G.ringR, 0.11, 'y', { surf: 'patina', tone: VERDI, radial: 24, tube: 8, wear: 0.5 });
  torus(ring, V(0, 0.09, 0), G.ringR - 0.02, 0.05, 'y', { surf: 'bronze', tone: BRONZE, radial: 24, tube: 5 });

  /* one lamp on the drum's face (+Z): calm by default */
  {
    const [lx, ly, lz] = G.lamp;
    lathe(body, [P(0.34, 0, 'bronze', BRONZE), P(0.36, 0.14, 'bronze', BRONZE), P(0.3, 0.18, 'graphite', GRAPH)],
      new THREE.Matrix4().makeTranslation(lx, ly, lz - 0.06).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), { segs: 18 });
    ball(lamp, V(lx, ly, lz + 0.08), 0.24, { surf: 'lamp', tone: 0x222018, w: 16, h: 10 });
  }

  const stats = await writeGLB([
    { bucket: body, material: { name: 'r5-gauge-hull' } },
    { bucket: ring, material: { name: 'r5-gauge-hull' } },
    { bucket: gate, material: { name: 'r5-gauge-hull' } },
    { bucket: lamp, material: { name: 'r5-gauge-lamp', emissive: [0.95, 0.92, 0.83], baseColor: [0.02, 0.02, 0.02, 1] } },
  ], {
    file: path.join(out, OUTPUTS[0]),
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    extras: { r5Generator: { name: RECIPE, design: 'gauge-static', licence: 'original work (generated)' }, r5Gauge: GAUGE },
  });
  const box = body.bounds(new THREE.Box3());
  return { landmark: 'gauge-static', ...stats, reference: undefined, kb: +(stats.bytes / 1024).toFixed(1),
    bodyTris: body.triangles, size: box.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  console.log(JSON.stringify(await build({ out: i > 0 ? path.resolve(process.argv[i + 1]) : ROOT })));
}
