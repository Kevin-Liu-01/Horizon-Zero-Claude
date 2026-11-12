#!/usr/bin/env node
/**
 * CALIMA — the SOUNDING RING (world-props W1; moved here from
 * tools/build/landmarks/gen-sounding-ring.mjs under the plan §1.2 grant, W-05).
 * Original work: no third-party asset is read.
 *
 *   node tools/build/landmarks/recipes/sounding-ring.mjs [--out <dir>]
 *     -> public/models/landmarks/sounding-ring.glb
 *
 * THE SOUNDING RING (bible §8.3, ROUND5-LOOK W-05): a survey gyroscope the
 * Datum left standing on the storm beach. Two nested gimbal rings of glazed
 * ceramic panels on bronze flanges: the OUTER ring 34 m across (outer edge;
 * 2.0 m deep section on a 16 m mean radius), standing 20 deg off vertical
 * (bar 15-25), its foot set 0.8 m into a basalt cradle; the INNER ring 22 m
 * across, hung on two trunnions and turned 52 deg about them. The outer ring is
 * broken through its upper-left quadrant and the broken panels lie in the
 * shingle below. A dim lantern core rides a spindle across the inner ring.
 * Three cable stays run to basalt anchor blocks. Never a stone portal: every
 * surface is glaze, bronze, graphite or basalt, and the sky shows through it.
 *
 * Frame: metres, +Y up, the ring's face normal on +Z (the runtime yaws +Z
 * toward the Pans' viewers), the lean takes the top toward -Z. Origin = the
 * ground point under the ring's centre.
 *
 * Two materials (hull palette + lamp), one mesh each: two draws + one caster.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  THREE, Bucket, V, strut, ball, rbox, cable, lathe, rng,
} from '../../lib/hs.mjs';
import { writeGLB } from '../../lib/glb.mjs';
import { slab, rockShade, vnoise3 } from './lib/rock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const LANE = 'world-props';
export const RECIPE = 'tools/build/landmarks/recipes/sounding-ring.mjs';
export const OUTPUTS = ['public/models/landmarks/sounding-ring.glb'];

/** The design numbers the gates read back from `asset.extras.r5Ring`. */
export const RING = Object.freeze({
  outerMid: 16.0, outerW: 2.0, outerD: 1.6,      // outer edge 17.0 -> 34 m diameter
  innerMid: 10.3, innerW: 1.4, innerD: 1.0,      // outer edge 11.0 -> 22 m diameter
  tiltDeg: 20, sink: 0.8, innerTurnDeg: 52,
  break0: 3.55, break1: 4.35,                    // the missing arc (lathe phi, rad): upper left
});

export async function build({ out = ROOT } = {}) {
  const BONE = 0xe7dccb, CELADON = 0xa9c4b0, OXBLOOD = 0x6e2421, VERDI = 0x4f8f7e, BRONZE = 0xa07a3f, GRAPH = 0x2b2c30;
  const BASALT = 0x3a3a3f, LAMP = 0x1a1208;
  const P = (r, h, surf, tone) => ({ r, h, surf, tone });
  const hull = new Bucket('ring-hull');
  const lamp = new Bucket('ring-lamp');
  const R = rng(7);
  const tilt = THREE.MathUtils.degToRad(RING.tiltDeg);
  const OUT_EDGE = RING.outerMid + RING.outerW / 2;
  const cy = OUT_EDGE * Math.cos(tilt) - RING.sink;

  /** Ring cross-section (closed loop in r,h) swept about local +Y; glaze faces, bronze lips, graphite inner face. */
  function ringSection(Rm, w, d, glaze) {
    const a = Rm - w / 2, b = Rm + w / 2, h = d / 2, bv = 0.14;
    return [
      P(a + bv, -h, 'glaze', 0xc9bfae), P(b - bv, -h, 'bronze', BRONZE), P(b, -h + bv, 'glaze', glaze),
      P(b, -0.12, 'glaze', OXBLOOD), P(b, 0.12, 'glaze', glaze), P(b, h - bv, 'bronze', BRONZE),
      P(b - bv, h, 'glaze', glaze), P(a + bv * 2, h, 'glaze', CELADON), P(a, h - bv, 'graphite', GRAPH),
      P(a, -h + bv, 'graphite', GRAPH), P(a + bv, -h, 'graphite', GRAPH),
    ];
  }
  /** One gimbal ring in frame `m` (ring axis = local +Y). */
  function gimbal(m, Rm, w, d, arcs, panelDeg, glaze) {
    for (const [p0, p1] of arcs) {
      const len = p1 - p0;
      const panels = Math.max(1, Math.round(THREE.MathUtils.radToDeg(len) / panelDeg));
      lathe(hull, ringSection(Rm, w, d, glaze), m, { segs: panels * 4, panels, gap: 0.45, phiStart: p0, phiLength: len, wear: 0.55, crease: 30 });
      for (let i = 0; i <= panels; i++) {
        const phi = p0 + (i / panels) * len;
        const fl = [P(Rm - w / 2 - 0.1, -d / 2 - 0.08, 'bronze', BRONZE), P(Rm + w / 2 + 0.14, -d / 2 - 0.08, 'bronze', BRONZE),
          P(Rm + w / 2 + 0.14, d / 2 + 0.08, 'bronze', BRONZE), P(Rm - w / 2 - 0.1, d / 2 + 0.08, 'bronze', BRONZE),
          P(Rm - w / 2 - 0.1, -d / 2 - 0.08, 'bronze', BRONZE)];
        lathe(hull, fl, m, { segs: 1, phiStart: phi - 0.007, phiLength: 0.014, wear: 0.7 });
        // a rivet head either side of every flange, both faces
        for (const s of [-1, 1]) {
          const lp = V(Math.sin(phi) * (Rm + w * 0.3), s * (d / 2 + 0.1), Math.cos(phi) * (Rm + w * 0.3)).applyMatrix4(m);
          ball(hull, lp, 0.1, { surf: 'bronze', tone: BRONZE, w: 5, h: 3, wear: 0.6 });
        }
      }
    }
  }
  const at = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

  /* ------------------------------ outer ring ------------------------------- */
  // lathe axis +Y -> ring face normal +Z (Rx 90), then lean the top back toward -Z
  const outerM = at(0, cy, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 - tilt));
  gimbal(outerM, RING.outerMid, RING.outerW, RING.outerD, [[0, RING.break0], [RING.break1, Math.PI * 2]], 9, BONE);
  // the broken ends: jagged stubs of the panel and a torn bronze strap
  for (const phi of [RING.break0, RING.break1]) {
    const c = V(Math.sin(phi) * RING.outerMid, 0, Math.cos(phi) * RING.outerMid).applyMatrix4(outerM);
    for (let k = 0; k < 4; k++) {
      rbox(hull, c.clone().add(V((R() - 0.5) * 1.4, (R() - 0.5) * 1.4, (R() - 0.5) * 1.0)), [0.5 + R() * 0.6, 0.3 + R() * 0.5, 0.4 + R() * 0.6], 0.05,
        { surf: k % 2 ? 'glaze' : 'bronze', tone: k % 2 ? BONE : BRONZE, rot: [R() * 3, R() * 3, R() * 3], wear: 0.9, segs: 1 });
    }
  }

  // the fallen panels, lying in the shingle under the break (left, in front)
  for (let i = 0; i < 5; i++) {
    const phi = RING.break0 + 0.08 + i * 0.16;
    const lay = new THREE.Matrix4().compose(
      V(-9.5 - i * 2.1 + (R() - 0.5) * 1.6, 0.35 + R() * 0.3, 5.5 + R() * 6.5),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.06 + R() * 0.3, R() * Math.PI, 0.25 + R() * 0.55)),
      V(1, 1, 1));
    const piece = lay.multiply(at(0, 0, -RING.outerMid)).multiply(new THREE.Matrix4().makeRotationY(-(phi + 0.07)));
    lathe(hull, ringSection(RING.outerMid, RING.outerW, RING.outerD, BONE), piece, { segs: 3, phiStart: phi, phiLength: 0.14, wear: 0.95 });
  }
  // shards of glaze and a bent flange strap in the shingle
  for (let i = 0; i < 14; i++) {
    rbox(hull, V(-6 - R() * 12, 0.08, 2 + R() * 12), [0.3 + R() * 0.9, 0.06 + R() * 0.08, 0.2 + R() * 0.6], 0.02,
      { surf: i % 3 ? 'glaze' : 'bronze', tone: i % 3 ? BONE : BRONZE, rot: [0, R() * 6, (R() - 0.5) * 0.4], wear: 1, segs: 1 });
  }

  /* ------------------------------ inner ring ------------------------------- */
  const turn = THREE.MathUtils.degToRad(RING.innerTurnDeg);
  const innerM = outerM.clone().multiply(new THREE.Matrix4().makeRotationX(turn));
  gimbal(innerM, RING.innerMid, RING.innerW, RING.innerD, [[0, Math.PI * 2]], 12, CELADON);
  // trunnions on the outer ring's local X axis (phi = +-90 deg), between the rings
  for (const s of [1, -1]) {
    const a = V(s * (RING.innerMid + RING.innerW / 2 + 0.05), 0, 0).applyMatrix4(outerM);
    const b = V(s * (RING.outerMid - RING.outerW / 2 - 0.05), 0, 0).applyMatrix4(outerM);
    strut(hull, a, b, 0.5, 0.5, { surf: 'graphite', tone: GRAPH, sides: 16 });
    for (const t of [0.12, 0.88]) {
      const c = a.clone().lerp(b, t);
      strut(hull, c.clone().lerp(a, 0.06), c.clone().lerp(b, 0.06), 0.85, 0.85, { surf: 'bronze', tone: BRONZE, sides: 20, wear: 0.65 });
    }
  }

  /* ------------------------------ lantern core ----------------------------- */
  {
    const a = V(0, 0, -RING.innerMid + 0.6).applyMatrix4(innerM);
    const b = V(0, 0, RING.innerMid - 0.6).applyMatrix4(innerM);
    const c = a.clone().lerp(b, 0.5);
    strut(hull, a, b, 0.26, 0.26, { surf: 'graphite', tone: GRAPH, sides: 14 });
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    lathe(hull, [
      P(0, -2.5, 'bronze', BRONZE), P(1.1, -2.2, 'bronze', BRONZE), P(1.75, -1.3, 'glaze', OXBLOOD),
      P(1.8, -1.05, 'patina', VERDI), P(1.8, 1.05, 'patina', VERDI), P(1.75, 1.3, 'glaze', OXBLOOD),
      P(1.1, 2.2, 'bronze', BRONZE), P(0, 2.5, 'bronze', BRONZE),
    ], new THREE.Matrix4().compose(c, q, V(1, 1, 1)), { segs: 32, panels: 8, gap: 10, wear: 0.55 });
    ball(lamp, c, 1.4, { surf: 'lamp', tone: LAMP, w: 24, h: 16 });
    // graduated collar on the spindle
    for (let k = -3; k <= 3; k++) {
      if (!k) continue;
      const p = c.clone().lerp(b, 0.12 + Math.abs(k) * 0.1 * Math.sign(k) * 0 + (k > 0 ? k * 0.1 : 0)).lerp(a, k < 0 ? -k * 0.1 : 0);
      strut(hull, p.clone().lerp(b, -0.008), p.clone().lerp(b, 0.008), 0.42, 0.42, { surf: k % 2 ? 'glaze' : 'bronze', tone: k % 2 ? OXBLOOD : BRONZE, sides: 14 });
    }
  }

  /* ------------------------------ glyph bars ------------------------------- */
  // survey code (original): oxblood bars on the outer rim, a 5-bit code per panel
  for (let i = 0; i < 40; i++) {
    const phi = (i / 40) * Math.PI * 2 + 0.05;
    if (phi > RING.break0 - 0.06 && phi < RING.break1 + 0.06) continue;
    const bits = (i * 11 + 5) % 32;
    for (let k = 0; k < 5; k++) {
      if (!(bits & (1 << k))) continue;
      const rr = RING.outerMid + RING.outerW / 2 + 0.03;
      const local = V(Math.sin(phi) * rr, -0.56 + k * 0.28, Math.cos(phi) * rr);
      const tangent = V(Math.cos(phi), 0, -Math.sin(phi));
      const normal = V(Math.sin(phi), 0, Math.cos(phi));
      const m = new THREE.Matrix4().makeBasis(tangent, V(0, 1, 0), normal).setPosition(local).premultiply(outerM);
      { const g = new THREE.BoxGeometry(0.95, 0.14, 0.06); hull.add(g, { surf: 'glaze', tone: OXBLOOD, matrix: m, wear: 0.35 }); g.dispose(); }
    }
  }

  /* ------------------------------ cradle ----------------------------------- */
  // the foot sits in a stepped basalt cradle with a bronze saddle; wedges either side
  const footZ = OUT_EDGE * Math.sin(tilt);          // the foot moves +Z as the top leans back
  const shade = rockShade({ seed: 7, streak: 0.18 });
  // a stepped bed of dressed basalt blocks (three courses), not one disc
  for (let c = 0; c < 3; c++) {
    const n = 7 - c * 2, w = 2.6 - c * 0.3;
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * w * 1.02 + (R() - 0.5) * 0.2;
      for (const zz of c === 2 ? [0] : [-1.3, 1.3]) {
        rbox(hull, V(x, -0.55 + c * 0.62 + 0.3, footZ + zz * (1 - c * 0.25)), [w, 0.62, 2.5 - c * 0.3], 0.08,
          { surf: 'bisque', tone: [BASALT, 0x2e2d31, 0x45423f][(k + c) % 3], wear: 1.1, rot: [0, (R() - 0.5) * 0.06, 0], segs: 1 });
      }
    }
  }
  for (const s of [-1, 1]) {
    rbox(hull, V(s * 2.9, 1.7, footZ), [1.6, 1.8, 2.6], 0.2, { surf: 'bronze', tone: BRONZE, wear: 0.8, rot: [tilt * 0.5, 0, s * 0.35] });
    slab(hull, { cx: s * 5.5, cz: footZ + (R() - 0.5), y0: -0.8, thick: 2.6, r: 1.6, aspect: 1.3, yaw: s * 0.4, jag: 0.25, seed: 75 + s, tone: BASALT, bevel: 0.25, rough: 0.08 }, shade);
  }

  /* ------------------------------ stays + anchors -------------------------- */
  const STATIONS = [1.25, 5.0, 2.55];               // live stations (lathe phi)
  const tops = STATIONS.map((phi) => V(Math.sin(phi) * (OUT_EDGE + 0.2), 0, Math.cos(phi) * (OUT_EDGE + 0.2)).applyMatrix4(outerM));
  const anchors = tops.map((p, i) => {
    const d = V(p.x, 0, p.z - footZ * 0.5); d.normalize().multiplyScalar(i === 2 ? 0 : 1);
    return i === 2 ? V(p.x * 0.4, 0, -19) : V(p.x * 1.65, 0, p.z * 1.2 + (i ? 4 : -3));
  });
  anchors.forEach((A, i) => {
    slab(hull, { cx: A.x, cz: A.z, y0: -0.6, thick: 2.2, r: 1.5, aspect: 1.2, yaw: i * 0.7, jag: 0.2, seed: 81 + i, tone: BASALT, bevel: 0.25, rough: 0.06 }, shade);
    rbox(hull, A.clone().add(V(0, 1.85, 0)), [1.1, 0.45, 1.1], 0.1, { surf: 'bronze', tone: BRONZE, wear: 0.7, rot: [0, i * 0.7, 0] });
    const top = tops[i];
    const mid = top.clone().lerp(A, 0.5); mid.y -= 1.6;
    cable(hull, [top, mid, A.clone().add(V(0, 2.05, 0))], 0.11, { surf: 'graphite', tone: GRAPH, segs: 28, radial: 7 });
  });

  /* ------------------------------ weathering ------------------------------- */
  const smf = THREE.MathUtils.smoothstep;
  // salt line near the shingle, and verdigris-dark drips under the lower half of the ring
  hull.shade((x, y, z) => (0.62 + 0.38 * smf(y, 0.2, 3.2)) * (1 - 0.12 * Math.max(0, vnoise3(x * 0.8, y * 0.15, z * 0.8) - 0.5) * 2 * smf(-y + cy, -2, 8)));
  const box = hull.bounds(new THREE.Box3());
  lamp.bounds(box);
  const stats = await writeGLB([
    { bucket: hull, material: { name: 'r5-ring-hull' } },
    { bucket: lamp, material: { name: 'r5-ring-lamp', emissive: [0.95, 0.86, 0.66], baseColor: [0.02, 0.018, 0.012, 1] } },
  ], {
    file: path.join(out, OUTPUTS[0]),
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    extras: {
      r5Generator: { name: RECIPE, design: 'sounding-ring', licence: 'original work (generated)' },
      r5Ring: { ...RING, centreY: +cy.toFixed(3), outerDiameter: 2 * OUT_EDGE, innerDiameter: 2 * (RING.innerMid + RING.innerW / 2), footZ: +footZ.toFixed(3) },
      r5Footprint: { anchors: anchors.map((a) => [+a.x.toFixed(2), +a.z.toFixed(2)]), cradle: [0, +footZ.toFixed(2), 4.6 * 1.9, 4.6] },
    },
  });
  const size = box.getSize(new THREE.Vector3());
  return { landmark: 'sounding-ring', ...stats, reference: undefined, kb: +(stats.bytes / 1024).toFixed(1),
    size: [+size.x.toFixed(1), +size.y.toFixed(1), +size.z.toFixed(1)], hullTris: hull.triangles, lampTris: lamp.triangles };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  console.log(JSON.stringify(await build({ out: i > 0 ? path.resolve(process.argv[i + 1]) : ROOT })));
}
