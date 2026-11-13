#!/usr/bin/env node
/**
 * CALIMA — the salt-field WIND PUMP (world-props W1; bible §8.3/§8.6, ROUND5-LOOK
 * W-05: 9-12 m towers with 6 m rotors, turning). Original work: nothing is read.
 *
 *   node tools/build/landmarks/recipes/wind-pump.mjs [--out <dir>]
 *     -> public/models/landmarks/wind-pump.glb
 *
 * A multi-blade pump of the kind that lifts seawater into the pans: a lime-
 * washed stone cistern with a trough and a spout, a tapering four-leg lattice
 * tower 9.6 m tall with girts, X bracing and a ladder, a railed deck, the gear
 * head, a pump rod down the middle, an 18-blade rotor 6.0 m across on two rim
 * rings, and a tail vane.
 *
 * Two nodes, one palette material: `pump-tower` (static) and `pump-rotor`,
 * built about the hub with its axis on +Z so the runtime spins it about its own
 * local Z. `asset.extras.r5Pump.hub` is the hub's position in the tower frame.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THREE, Bucket, V, strut, ball, rbox, torus, cable, rng } from '../../lib/hs.mjs';
import { writeGLB } from '../../lib/glb.mjs';
import { vnoise3 } from './lib/rock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const LANE = 'world-props';
export const RECIPE = 'tools/build/landmarks/recipes/wind-pump.mjs';
export const OUTPUTS = ['public/models/landmarks/wind-pump.glb'];

export const PUMP = Object.freeze({ towerH: 9.6, baseHalf: 1.55, topHalf: 0.42, rotorR: 3.0, blades: 18, hub: [0, 10.55, 0.95] });

export async function build({ out = ROOT } = {}) {
  const STEEL = 0x8a8d8b, RUST = 0x7b4a2e, LIME = 0xe8e3d6, STONE = 0x6d6760, BLADE = 0xddd7c8, OXBLOOD = 0x6e2421, GRAPH = 0x2b2c30, BRONZE = 0xa07a3f;
  const tower = new Bucket('pump-tower');
  const rotor = new Bucket('pump-rotor');
  const R = rng(19);
  // galvanised steel with rust where water stands (joints low on the tower, undersides)
  const rusty = (p, n, k) => {
    const r = vnoise3(p.x * 2.1, p.y * 1.3, p.z * 2.1);
    return k * (0.82 + 0.3 * r) * (n.y < -0.2 ? 0.8 : 1);
  };
  const H = PUMP.towerH, B = PUMP.baseHalf, T = PUMP.topHalf;
  const legAt = (sx, sz, y) => { const t = y / H; const h = B + (T - B) * t; return V(sx * h, y + 0.9, sz * h); };

  /* --------------------------------- cistern -------------------------------- */
  rbox(tower, V(0, 0.35, 0), [3.9, 1.3, 3.9], 0.12, { surf: 'bisque', tone: LIME, wear: 1.1 });
  rbox(tower, V(0, 0.95, 0), [3.5, 0.12, 3.5], 0.04, { surf: 'bisque', tone: 0xd8d2c2, wear: 0.9, segs: 1 });
  // the trough off one side with a spout into it
  rbox(tower, V(2.75, 0.32, 0.6), [1.6, 0.62, 1.0], 0.08, { surf: 'bisque', tone: LIME, wear: 1.2, segs: 1 });
  rbox(tower, V(2.75, 0.56, 0.6), [1.35, 0.1, 0.78], 0.02, { surf: 'glaze', tone: 0x2f5560, wear: 0.2, segs: 1 });   // brine in the trough
  strut(tower, V(0.5, 1.6, 0.2), V(2.2, 1.35, 0.55), 0.07, 0.07, { surf: 'graphite', tone: STEEL, sides: 8, colorFn: rusty });
  // stone footing courses (dark) under the render
  for (let i = 0; i < 10; i++) rbox(tower, V((R() - 0.5) * 3.8, -0.15 + R() * 0.15, (R() - 0.5) * 3.8), [0.5 + R() * 0.5, 0.3, 0.4 + R() * 0.4], 0.06, { surf: 'bisque', tone: STONE, rot: [0, R() * 3, 0], wear: 1, segs: 1 });

  /* --------------------------------- tower ---------------------------------- */
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (const [sx, sz] of corners) {
    strut(tower, legAt(sx, sz, 0), legAt(sx, sz, H), 0.075, 0.06, { surf: 'graphite', tone: STEEL, sides: 4, colorFn: rusty });
    rbox(tower, legAt(sx, sz, 0).add(V(0, -0.05, 0)), [0.3, 0.12, 0.3], 0.02, { surf: 'graphite', tone: RUST, segs: 1 });   // foot plate
  }
  const levels = [0, 1.7, 3.3, 4.8, 6.2, 7.5, 8.6, H];
  for (let l = 0; l < levels.length; l++) {
    const y = levels[l];
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c], [bx, bz] = corners[(c + 1) % 4];
      if (l > 0) strut(tower, legAt(ax, az, y), legAt(bx, bz, y), 0.04, 0.04, { surf: 'graphite', tone: STEEL, sides: 4, colorFn: rusty });
      if (l < levels.length - 1) {
        const y1 = levels[l + 1];
        strut(tower, legAt(ax, az, y), legAt(bx, bz, y1), 0.022, 0.022, { surf: 'graphite', tone: STEEL, sides: 4, colorFn: rusty });
        strut(tower, legAt(bx, bz, y), legAt(ax, az, y1), 0.022, 0.022, { surf: 'graphite', tone: STEEL, sides: 4, colorFn: rusty });
      }
    }
  }
  // ladder up the +x+z leg's outside
  {
    const a0 = legAt(1, 1, 0.3).add(V(0.25, 0, 0.25)), a1 = legAt(1, 1, H - 0.2).add(V(0.25, 0, 0.25));
    const side = V(0.2, 0, -0.2);
    strut(tower, a0.clone().add(side), a1.clone().add(side), 0.025, 0.025, { surf: 'graphite', tone: STEEL, sides: 4 });
    strut(tower, a0.clone().sub(side), a1.clone().sub(side), 0.025, 0.025, { surf: 'graphite', tone: STEEL, sides: 4 });
    for (let i = 0; i < 26; i++) {
      const p = a0.clone().lerp(a1, i / 25);
      strut(tower, p.clone().add(side), p.clone().sub(side), 0.016, 0.016, { surf: 'graphite', tone: STEEL, sides: 3 });
    }
  }
  // deck + railing
  const topY = H + 0.9;
  rbox(tower, V(0, topY + 0.05, 0), [1.7, 0.08, 1.7], 0.02, { surf: 'graphite', tone: 0x6c5a48, wear: 0.9, segs: 1 });
  for (const [sx, sz] of corners) strut(tower, V(sx * 0.82, topY, sz * 0.82), V(sx * 0.82, topY + 0.85, sz * 0.82), 0.025, 0.025, { surf: 'graphite', tone: STEEL, sides: 4 });
  for (let c = 0; c < 4; c++) {
    const [ax, az] = corners[c], [bx, bz] = corners[(c + 1) % 4];
    strut(tower, V(ax * 0.82, topY + 0.85, az * 0.82), V(bx * 0.82, topY + 0.85, bz * 0.82), 0.02, 0.02, { surf: 'graphite', tone: STEEL, sides: 4 });
  }
  // gear head on a turntable, tail boom + vane, pump rod
  const hub = V(...PUMP.hub);
  strut(tower, V(0, topY + 0.05, 0), V(0, topY + 0.35, 0), 0.32, 0.32, { surf: 'graphite', tone: GRAPH, sides: 12 });
  rbox(tower, V(0, hub.y, 0.25), [0.62, 0.62, 1.15], 0.1, { surf: 'graphite', tone: 0x555652, wear: 0.9 });
  strut(tower, V(0, hub.y, 0.75), hub.clone().add(V(0, 0, -0.05)), 0.12, 0.12, { surf: 'bronze', tone: BRONZE, sides: 10 });
  const vane0 = V(0, hub.y + 0.05, -0.3), vane1 = V(0, hub.y + 0.25, -3.1);
  strut(tower, vane0, vane1, 0.05, 0.04, { surf: 'graphite', tone: STEEL, sides: 6 });
  strut(tower, V(0, hub.y - 0.2, -0.2), V(0, hub.y + 0.15, -2.2), 0.025, 0.025, { surf: 'graphite', tone: STEEL, sides: 4 });
  {
    const shape = new THREE.Shape([[0, -0.45], [2.3, -0.75], [2.4, 0.95], [0, 0.55]].map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
    g.rotateY(Math.PI / 2); g.translate(-0.02, hub.y + 0.2, -2.05);
    tower.add(g, { surf: 'graphite', tone: BLADE, wear: 1.2, colorFn: (p, n, k) => k * (p.z < -3.95 ? 0.42 : 1) * (0.85 + 0.3 * vnoise3(p.y * 3, p.z * 3, 1)) });
    g.dispose();
    const band = new THREE.BoxGeometry(0.05, 1.5, 0.22); band.translate(0, hub.y + 0.27, -4.1);
    tower.add(band, { surf: 'glaze', tone: OXBLOOD, wear: 0.6 }); band.dispose();
  }
  strut(tower, V(0, hub.y - 0.3, 0.1), V(0, 1.1, 0.1), 0.03, 0.03, { surf: 'graphite', tone: 0x4a4b48, sides: 5 });   // pump rod
  strut(tower, V(0, 0.95, 0.1), V(0, 1.75, 0.1), 0.13, 0.13, { surf: 'graphite', tone: GRAPH, sides: 10 });          // pump head

  /* --------------------------------- rotor ---------------------------------- */
  const RR = PUMP.rotorR;
  ball(rotor, V(0, 0, 0.18), 0.28, { surf: 'bronze', tone: BRONZE, w: 10, h: 6 });
  torus(rotor, V(0, 0, 0), RR * 0.62, 0.035, 'z', { surf: 'graphite', tone: STEEL, radial: 40, tube: 4, colorFn: rusty });
  torus(rotor, V(0, 0, 0), RR - 0.06, 0.04, 'z', { surf: 'graphite', tone: STEEL, radial: 48, tube: 4, colorFn: rusty });
  for (let s = 0; s < 6; s++) {
    const a = (s / 6) * Math.PI * 2;
    strut(rotor, V(0, 0, 0.1), V(Math.cos(a) * (RR - 0.05), Math.sin(a) * (RR - 0.05), 0), 0.025, 0.02, { surf: 'graphite', tone: STEEL, sides: 4 });
  }
  for (let b = 0; b < PUMP.blades; b++) {
    const a = (b / PUMP.blades) * Math.PI * 2;
    // a curved sheet blade from r 0.55 to RR, chord widening outward, twisted ~30 deg
    const g = new THREE.BufferGeometry();
    const pos = [];
    const N = 4;
    const ptAt = (t, s) => {
      const r = 0.55 + (RR - 0.55) * t;
      const chord = 0.18 + 0.42 * t;
      const tw = THREE.MathUtils.degToRad(38 - 14 * t);
      const u = (s - 0.5) * chord;
      const lx = r, ly = u * Math.cos(tw), lz = u * Math.sin(tw) + 0.04 * Math.sin(s * Math.PI);   // cupped
      const c = Math.cos(a), sn = Math.sin(a);
      return [lx * c - ly * sn, lx * sn + ly * c, lz];
    };
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const p00 = ptAt(t0, 0), p01 = ptAt(t0, 1), p10 = ptAt(t1, 0), p11 = ptAt(t1, 1);
      pos.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);   // front
      pos.push(...p00, ...p11, ...p10, ...p00, ...p01, ...p11);   // back
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    rotor.add(g, { surf: 'graphite', tone: b % 6 === 0 ? 0xc9c1ae : BLADE, wear: 1.1, colorFn: (p, n, k) => k * (0.8 + 0.35 * vnoise3(p.x * 4, p.y * 4, b)) });
    g.dispose();
  }

  const box = tower.bounds(new THREE.Box3());
  const rbx = rotor.bounds(new THREE.Box3());
  const stats = await writeGLB([
    { bucket: tower, material: { name: 'r5-pump' } },
    { bucket: rotor, material: { name: 'r5-pump' } },
  ], {
    file: path.join(out, OUTPUTS[0]),
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    extras: {
      r5Generator: { name: RECIPE, design: 'wind-pump', licence: 'original work (generated)' },
      r5Pump: { ...PUMP, rotorDiameter: +(rbx.max.x - rbx.min.x).toFixed(2) },
    },
  });
  return { landmark: 'wind-pump', ...stats, reference: undefined, kb: +(stats.bytes / 1024).toFixed(1),
    towerTris: tower.triangles, rotorTris: rotor.triangles,
    size: box.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)), rotorSize: rbx.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  console.log(JSON.stringify(await build({ out: i > 0 ? path.resolve(process.argv[i + 1]) : ROOT })));
}
