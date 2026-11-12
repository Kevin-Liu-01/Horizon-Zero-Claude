#!/usr/bin/env node
/**
 * CALIMA — the survey marks: TRIG PILLAR and BENCHMARK pad (world-props W1;
 * bible §8.4-§8.5). Original work: nothing is read.
 *
 *   node tools/build/landmarks/recipes/survey-marks.mjs [--out <dir>]
 *     -> public/models/landmarks/survey-marks.glb   (nodes: trig-pillar, benchmark)
 *
 * TRIG PILLAR (6 on the island): a 4 m white survey pillar. A lime-washed
 * octagonal drum 3.0 m tall and 3.8 m across, coped, with one survey-vermilion
 * band (flat ink, never emissive), climbed by three 1 m stone steps on its +Z
 * side (`ClimbUp_1m` x 3; A-trig-pillars times it), and on the drum's deck the
 * 1.0 m observing pillar whose bronze forced-centring plate is the pillar's top
 * (TRIG_TOP = 4 m). Beside the plate stands a 3.6 m signal mast with crossed
 * vanes, so a pillar reads on the skyline from 400 m. Frame: origin = ground
 * under the drum's centre, steps toward +Z.
 *
 * BENCHMARK (12): a lime-washed survey pad 2.4 m square standing 0.30 m proud
 * with a 1.8 m skirt below (it sits on slopes), a bronze bench disc with the
 * broad arrow, three tripod sockets, and a banded staff post.
 *
 * One palette material for both (one draw each, instanced at runtime).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THREE, Bucket, V, strut, ball, rbox, rng } from '../../lib/hs.mjs';
import { writeGLB } from '../../lib/glb.mjs';
import { slab, rockShade, vnoise3 } from './lib/rock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const LANE = 'world-props';
export const RECIPE = 'tools/build/landmarks/recipes/survey-marks.mjs';
export const OUTPUTS = ['public/models/landmarks/survey-marks.glb'];

/** Pillar geometry the runtime colliders and the gates read (asset extras `r5Trig`). */
export const TRIG = Object.freeze({
  drumR: 1.9, drumH: 3.0, headR: 0.34, top: 4.0,
  steps: [{ h: 1, z0: 4.3, z1: 5.5 }, { h: 2, z0: 3.1, z1: 4.3 }, { h: 3, z0: 1.55, z1: 3.1 }], stepHalfW: 0.95,
  mast: { x: -1.15, z: -0.75, h: 3.6 },
});
export const BENCH = Object.freeze({ half: 1.2, proud: 0.3, skirt: 1.8 });

export async function build({ out = ROOT } = {}) {
  const LIME = 0xebe6da, LIME2 = 0xd9d3c4, STONE = 0x77716a, VERM = 0xd2452e, STAFF = 0xf1eee6, BRONZE = 0xa07a3f, GRAPH = 0x2b2c30, BASALT = 0x3a3a3f;
  const R = rng(29);
  const limeShade = (p, n, k) => {
    // rain-streaked lime: darker runs under the coping, dirt splash at the foot
    const s = vnoise3(p.x * 2.2, p.y * 0.35, p.z * 2.2);
    let m = k * (0.9 + 0.12 * s);
    if (Math.abs(n.y) < 0.5) m *= 1 - 0.18 * Math.max(0, s - 0.55) / 0.45;
    m *= 0.78 + 0.22 * THREE.MathUtils.smoothstep(p.y, -0.1, 0.9);
    return m;
  };

  /* -------------------------------- trig pillar ------------------------------- */
  const trig = new Bucket('trig-pillar');
  const shade = rockShade({ seed: 3, streak: 0.15 });
  slab(trig, { cx: 0, cz: 1.0, y0: -0.7, thick: 0.85, r: 2.9, aspect: 1, yaw: 0.2, jag: 0.12, seed: 31, tone: BASALT, bevel: 0.2, rough: 0.05, sides: 12 }, shade);
  {
    const g = new THREE.CylinderGeometry(TRIG.drumR, TRIG.drumR * 1.04, TRIG.drumH, 8, 3);
    g.rotateY(Math.PI / 8); g.translate(0, TRIG.drumH / 2, 0);
    trig.add(g, { surf: 'bisque', tone: LIME, wear: 1.0, colorFn: limeShade }); g.dispose();
    // coping ring and a course line
    const c = new THREE.CylinderGeometry(TRIG.drumR + 0.1, TRIG.drumR + 0.1, 0.16, 8, 1);
    c.rotateY(Math.PI / 8); c.translate(0, TRIG.drumH - 0.04, 0);
    trig.add(c, { surf: 'bisque', tone: LIME2, wear: 0.8 }); c.dispose();
    const band = new THREE.CylinderGeometry(TRIG.drumR + 0.012, TRIG.drumR + 0.012, 0.26, 8, 1, true);
    band.rotateY(Math.PI / 8); band.translate(0, TRIG.drumH - 0.42, 0);
    trig.add(band, { surf: 'bisque', tone: VERM, wear: 0.7 }); band.dispose();
    const plinth = new THREE.CylinderGeometry(TRIG.drumR + 0.14, TRIG.drumR + 0.2, 0.32, 8, 1);
    plinth.rotateY(Math.PI / 8); plinth.translate(0, 0.12, 0);
    trig.add(plinth, { surf: 'bisque', tone: STONE, wear: 1.1 }); plinth.dispose();
  }
  // the observing pillar + forced-centring plate (the TOP)
  strut(trig, V(0, TRIG.drumH, 0), V(0, TRIG.top - 0.05, 0), TRIG.headR + 0.03, TRIG.headR, { surf: 'bisque', tone: LIME, sides: 12, wear: 0.9 });
  strut(trig, V(0, TRIG.top - 0.06, 0), V(0, TRIG.top, 0), 0.3, 0.3, { surf: 'bronze', tone: BRONZE, sides: 16, wear: 0.6 });
  strut(trig, V(0, TRIG.top, 0), V(0, TRIG.top + 0.07, 0), 0.04, 0.03, { surf: 'bronze', tone: BRONZE, sides: 8 });
  rbox(trig, V(0, TRIG.drumH + 0.5, TRIG.headR + 0.01), [0.22, 0.16, 0.03], 0.01, { surf: 'bronze', tone: BRONZE, segs: 1 });
  // the steps: three 1 m risers of lime-washed rubble toward +Z
  for (const s of TRIG.steps) {
    const d = s.z1 - s.z0;
    rbox(trig, V(0, s.h / 2 - 0.15, (s.z0 + s.z1) / 2 - 0.05), [TRIG.stepHalfW * 2, s.h + 0.3, d + 0.1], 0.07,
      { surf: 'bisque', tone: LIME2, wear: 1.2, colorFn: limeShade });
    // a worn stone tread on top of each riser
    rbox(trig, V(0, s.h + 0.02, (s.z0 + s.z1) / 2), [TRIG.stepHalfW * 2 + 0.06, 0.08, d + 0.04], 0.03, { surf: 'bisque', tone: STONE, wear: 1, segs: 1 });
  }
  // signal mast with crossed vanes (vermilion + staff white halves)
  {
    const m = TRIG.mast;
    strut(trig, V(m.x, TRIG.drumH, m.z), V(m.x, TRIG.drumH + m.h, m.z), 0.06, 0.045, { surf: 'graphite', tone: 0x55534e, sides: 8 });
    for (const yaw of [0, Math.PI / 2]) {
      for (const [side, tone] of [[1, VERM], [-1, STAFF]]) {
        const g = new THREE.BoxGeometry(0.42, 0.62, 0.03);
        g.translate(side * 0.23, 0, 0); g.rotateY(yaw); g.translate(m.x, TRIG.drumH + m.h - 0.5, m.z);
        trig.add(g, { surf: 'bisque', tone, wear: 0.6 }); g.dispose();
      }
    }
    ball(trig, V(m.x, TRIG.drumH + m.h + 0.05, m.z), 0.08, { surf: 'bronze', tone: BRONZE, w: 8, h: 5 });
  }

  /* --------------------------------- benchmark -------------------------------- */
  const bm = new Bucket('benchmark');
  rbox(bm, V(0, (BENCH.proud - BENCH.skirt) / 2, 0), [BENCH.half * 2, BENCH.proud + BENCH.skirt, BENCH.half * 2], 0.08, { surf: 'bisque', tone: LIME, wear: 1.1, colorFn: limeShade });
  rbox(bm, V(0, BENCH.proud + 0.02, 0), [BENCH.half * 2 - 0.3, 0.05, BENCH.half * 2 - 0.3], 0.02, { surf: 'bisque', tone: LIME2, wear: 0.8, segs: 1 });
  strut(bm, V(0, BENCH.proud, 0), V(0, BENCH.proud + 0.07, 0), 0.24, 0.22, { surf: 'bronze', tone: BRONZE, sides: 18, wear: 0.5 });
  // broad arrow incised in the disc: a shaft and two barbs, dark bronze
  for (const [x, z, w, d, yaw] of [[0, 0.03, 0.035, 0.26, 0], [-0.05, -0.08, 0.035, 0.14, -0.6], [0.05, -0.08, 0.035, 0.14, 0.6]]) {
    const g = new THREE.BoxGeometry(w, 0.02, d); g.rotateY(yaw); g.translate(x, BENCH.proud + 0.075, z);
    bm.add(g, { surf: 'graphite', tone: 0x3a2b1c, wear: 0.3 }); g.dispose();
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    strut(bm, V(Math.cos(a) * 0.78, BENCH.proud, Math.sin(a) * 0.78), V(Math.cos(a) * 0.78, BENCH.proud + 0.03, Math.sin(a) * 0.78), 0.07, 0.07, { surf: 'bronze', tone: BRONZE, sides: 10 });
  }
  // the banded staff post at one corner
  for (let b = 0; b < 6; b++) {
    const g = new THREE.BoxGeometry(0.12, 0.2, 0.12); g.translate(0.92, BENCH.proud + 0.1 + b * 0.2, 0.92);
    bm.add(g, { surf: 'bisque', tone: b % 2 ? STAFF : VERM, wear: 0.6 }); g.dispose();
  }
  rbox(bm, V(0.92, BENCH.proud + 1.25, 0.92), [0.18, 0.08, 0.18], 0.02, { surf: 'bronze', tone: BRONZE, segs: 1 });
  // lime-splashed stones round the pad
  for (let i = 0; i < 9; i++) {
    const a = R() * Math.PI * 2, r = 1.5 + R() * 0.7;
    slab(bm, { cx: Math.cos(a) * r, cz: Math.sin(a) * r, y0: -0.25, thick: 0.35 + R() * 0.3, r: 0.25 + R() * 0.25, aspect: 1, yaw: R() * 6, jag: 0.3, seed: 200 + i, tone: STONE, bevel: 0.05, rough: 0.12, sides: 7 }, shade);
  }

  const stats = await writeGLB([
    { bucket: trig, material: { name: 'r5-survey' } },
    { bucket: bm, material: { name: 'r5-survey' } },
  ], {
    file: path.join(out, OUTPUTS[0]),
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    extras: { r5Generator: { name: RECIPE, design: 'survey-marks', licence: 'original work (generated)' }, r5Trig: TRIG, r5Bench: BENCH },
  });
  return { landmark: 'survey-marks', ...stats, reference: undefined, kb: +(stats.bytes / 1024).toFixed(1), trigTris: trig.triangles, benchTris: bm.triangles,
    trigSize: trig.bounds(new THREE.Box3()).getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  console.log(JSON.stringify(await build({ out: i > 0 ? path.resolve(process.argv[i + 1]) : ROOT })));
}
