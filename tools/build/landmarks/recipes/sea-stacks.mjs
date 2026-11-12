#!/usr/bin/env node
/**
 * CALIMA — the Pans' skyline rock (world-props W1; ROUND5-LOOK W-04, R66 m).
 * Original work: no third-party asset is read.
 *
 *   node tools/build/landmarks/recipes/sea-stacks.mjs [--out <dir>]
 *     -> public/models/landmarks/sea-stacks.glb
 *
 * Six nodes, one hull material each (one draw per node, instanced at runtime by
 * src/world/sites/skyline.js):
 *   stack-a   slender stack with a caprock (40 m design height, base r 7)
 *   stack-b   twin-spired stack with windward fins (46 m, base r 9)
 *   stack-c   squat broken stack (28 m, base r 8)
 *   sea-arch  a stratified arch, 42 m span, 31 m high, open 22 m x 16 m
 *   roque-plug    the 58 m volcanic plug on the caldera's west rim: fluted
 *                 (columnar-jointed) drums with ledges, a broken crown, talus
 *   roque-needle  its 28 m companion needle
 * Stacks and the arch stand in the sea (their feet go to -14 m and carry a pale
 * surf collar at the waterline); the plug and needle stand on land and are the
 * only ones that get colliders. Heights are design heights: the runtime scales
 * each instance uniformly (strata thickness stays in the 1.5-6 m band).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THREE, Bucket, rng } from '../../lib/hs.mjs';
import { writeGLB } from '../../lib/glb.mjs';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seaStack, slab, rockShade, fbm3, vnoise3, STRATA } from './lib/rock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const LANE = 'world-props';
export const RECIPE = 'tools/build/landmarks/recipes/sea-stacks.mjs';
export const OUTPUTS = ['public/models/landmarks/sea-stacks.glb'];

/** Design heights (m above the sea / ground) the runtime reads from extras. */
export const DESIGN = Object.freeze({
  'stack-a': 40, 'stack-b': 46, 'stack-c': 28, 'sea-arch': 31, 'roque-plug': 58, 'roque-needle': 28,
});

/** A stratified arch: layers spanning two legs, the opening an ellipse cut layer by layer. */
function seaArch(bucket, R) {
  const L = 42, D = 12, H = 31, OW = 11, OH = 16, foot = -14;
  const shade = rockShade({ seed: 5, wetY: 1.2, wetK: 0.5 });
  let y = foot, i = 0;
  while (y < H - 0.6) {
    const thick = Math.min(H - y, y < 0 ? 5 : 1.6 + R() * 3.4);
    const ym = y + thick * 0.5;
    const taper = 1 - 0.25 * Math.max(0, ym) / H;
    const len = L * taper + (R() - 0.5) * 3, dep = D * taper + (R() - 0.5) * 1.5;
    const open = ym < OH ? OW * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, ym) / OH, 2))) : 0;
    const tone = STRATA.sea[(i * 5 + 1) % STRATA.sea.length];
    const legs = open > 0.8 ? [[-len / 2, -open], [open, len / 2]] : [[-len / 2, len / 2]];
    for (const [a, b] of legs) {
      const w = b - a;
      slab(bucket, { cx: (a + b) / 2, cz: (R() - 0.5) * 0.6, y0: y, thick: thick + 0.12, r: dep / 2, aspect: w / dep,
        yaw: 0, jag: 0.16, seed: 400 + i * 7 + (a < 0 ? 0 : 3), tone, bevel: 0.35, rough: 0.07, sides: 16 }, shade);
    }
    y += thick; i++;
  }
  // surf collars at both feet
  for (const sx of [-1, 1]) {
    const collar = new THREE.TorusGeometry(7.5, 0.9, 5, 24);
    collar.rotateX(Math.PI / 2);
    collar.scale(1.2, 1, 0.75);
    collar.translate(sx * (L / 2 - 8), 0.2, 0);
    bucket.add(collar, { surf: 'bisque', tone: 0xe9ebe6, wear: 0.4 });
    collar.dispose();
  }
}

/**
 * A fluted volcanic plug: drums whose plan is a star of columns (columnar
 * jointing), each drum turned a little and stepped in, ledges between them,
 * the crown broken into column stubs of different heights, talus at the foot.
 */
function plug(bucket, R, { height = 58, base = 9.5, seed = 3, cols = 22 } = {}) {
  const shade = rockShade({ seed, streak: 0.3, lip: 0.35 });
  const pal = STRATA.plug;
  let y = -6, d = 0;
  const top = height - 7;
  while (y < top) {
    const thick = Math.min(top - y, 5 + R() * 4.5);
    const t = Math.max(0, y) / height;
    const r = base * (1 - 0.42 * Math.pow(t, 0.9)) + (R() - 0.5) * 0.6;
    const twist = d * 0.11 + R() * 0.05;
    // the drum: a star polygon (alternate radii) = vertical flutes
    const shape = new THREE.Shape();
    const n = cols * 2;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + twist;
      const rr = r * (k % 2 ? 0.86 : 1.0) * (1 + 0.1 * (vnoise3(Math.cos(a) * 2 + seed, Math.sin(a) * 2, d) - 0.5));
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr * 0.9;
      if (k === 0) shape.moveTo(x, z); else shape.lineTo(x, z);
    }
    shape.closePath();
    let g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.3, bevelSegments: 1, curveSegments: 1, steps: 2 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y + 0.35, 0);
    const P = g.attributes.position;
    for (let k = 0; k < P.count; k++) {
      const x = P.getX(k), yy = P.getY(k), z = P.getZ(k);
      const nn = (fbm3(x * 0.3 + seed, yy * 0.08, z * 0.3, 2) - 0.5) * 2;
      const rr = Math.hypot(x, z) || 1;
      P.setXYZ(k, x + (x / rr) * nn * 0.6, yy, z + (z / rr) * nn * 0.6);
    }
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    const cg = toCreased(g);
    bucket.add(cg, { surf: 'bisque', tone: pal[d % pal.length], wear: 0.9, colorFn: shade });
    cg.dispose(); g.dispose();
    // a ledge: a thin outset lip at the drum's top on part of the circumference
    if (R() < 0.75) {
      slab(bucket, { cx: (R() - 0.5) * 1.2, cz: (R() - 0.5) * 1.2, y0: y + thick - 0.5, thick: 0.9, r: r * 1.08, aspect: 1, yaw: R() * 6,
        jag: 0.35, seed: seed * 11 + d, tone: 0x5e5650, bevel: 0.2, rough: 0.12 }, rockShade({ seed, lip: 0.45 }));
    }
    y += thick; d++;
  }
  // the crown: column stubs of different heights
  const rTop = base * (1 - 0.42 * Math.pow(top / height, 0.9));
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + R() * 0.4;
    const rr = k === 0 ? 0 : rTop * (0.35 + R() * 0.45);
    const ch = 2 + R() * 6.5 * (k === 0 ? 1.2 : 1);
    const g = new THREE.CylinderGeometry(rTop * 0.26, rTop * 0.3, ch, 6, 1);
    g.translate(Math.cos(a) * rr, y + ch / 2 - 0.2, Math.sin(a) * rr);
    bucket.add(g, { surf: 'bisque', tone: pal[(k + 1) % pal.length], wear: 0.9, colorFn: shade });
    g.dispose();
  }
  // talus apron
  for (let k = 0; k < 26; k++) {
    const a = R() * Math.PI * 2, rr = base * (0.95 + R() * 0.75);
    slab(bucket, { cx: Math.cos(a) * rr, cz: Math.sin(a) * rr, y0: -1.2 + R() * 0.8, thick: 0.8 + R() * 2.2, r: 0.8 + R() * 2.4,
      aspect: 0.7 + R() * 0.6, yaw: R() * 6, jag: 0.4, seed: seed * 101 + k, tone: pal[k % pal.length], bevel: 0.2, rough: 0.18 }, shade);
  }
  return y;
}

const toCreased = (g) => toCreasedNormals(g, THREE.MathUtils.degToRad(40));

export async function build({ out = ROOT } = {}) {
  const parts = [];
  const mk = (name, fn) => {
    const b = new Bucket(name);
    fn(b);
    const box = b.bounds(new THREE.Box3());
    parts.push({ bucket: b, material: { name: `r5-${name}` }, box });
  };
  mk('stack-a', (b) => seaStack(b, rng(11), { height: 40, base: 7, seed: 11, caprock: true, fins: 2, aspect: 0.78 }));
  mk('stack-b', (b) => seaStack(b, rng(23), { height: 46, base: 9, seed: 23, twin: true, fins: 3, aspect: 0.72 }));
  mk('stack-c', (b) => seaStack(b, rng(37), { height: 28, base: 8, seed: 37, fins: 1, aspect: 0.9 }));
  mk('sea-arch', (b) => seaArch(b, rng(41)));
  mk('roque-plug', (b) => plug(b, rng(53), { height: 58, base: 9.5, seed: 53, cols: 22 }));
  mk('roque-needle', (b) => plug(b, rng(67), { height: 28, base: 4.6, seed: 67, cols: 12 }));
  const stats = await writeGLB(parts.map(({ bucket, material }) => ({ bucket, material })), {
    file: path.join(out, OUTPUTS[0]),
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    extras: {
      r5Generator: { name: RECIPE, design: 'pans-skyline-rock', licence: 'original work (generated)' },
      r5Design: DESIGN,
      r5Tris: Object.fromEntries(parts.map((p) => [p.bucket.name, p.bucket.triangles])),
    },
  });
  return { landmark: 'sea-stacks', ...stats, reference: undefined, kb: +(stats.bytes / 1024).toFixed(1),
    nodes: parts.map((p) => ({ name: p.bucket.name, tris: p.bucket.triangles,
      size: p.box.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(1)) })) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  console.log(JSON.stringify(await build({ out: i > 0 ? path.resolve(process.argv[i + 1]) : ROOT }), null, 1));
}
