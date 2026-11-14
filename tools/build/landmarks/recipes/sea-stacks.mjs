#!/usr/bin/env node
/**
 * CALIMA — the Pans' skyline rock (world-props W1; ROUND5-LOOK W-04, R66 m).
 * Original work: no third-party asset is read.
 *
 *   node tools/build/landmarks/recipes/sea-stacks.mjs [--out <dir>]
 *     -> public/models/landmarks/sea-stacks.glb
 *
 * Six nodes, one hull material each (one draw per node, instanced at runtime by
 * src/world/sites/landmarks.js). M1.1c: the stacks are BEDDED LOFTS (lib/rock.mjs
 * needleStack): 10-20 beds above the sea, dark hard flows that stand out to a lip
 * and pale soft tuffs and ashes eaten back into notches, on one lobed plan that
 * drifts with height, tapering to broken pinnacles. tools/build/landmarks/
 * rock-check.mjs measures their outlines (the cylinder-bundle rule).
 *   stack-a   needle stack (40 m design height, base r 7)
 *   stack-b   twin-spired needle (46 m, base r 9, split at 58 %)
 *   stack-c   squat stack (28 m, base r 8)
 *   sea-arch  a stratified arch, 42 m span, 31 m high, open 22 m x 16 m
 *   roque-plug    the 58 m volcanic plug on the caldera's west rim: lofted
 *                 columnar-jointed drums, fluted by 22 columns offset tier by
 *                 tier, a broken crown of two-drum stubs, a talus apron
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
import { needleStack, loftBeds, bedSequence, bedShade, BEDS, slab, rockShade, fbm3, vnoise3, STRATA } from './lib/rock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const LANE = 'world-props';
export const RECIPE = 'tools/build/landmarks/recipes/sea-stacks.mjs';
export const OUTPUTS = ['public/models/landmarks/sea-stacks.glb'];

/** Design heights (m above the sea / ground) the runtime reads from extras. */
export const DESIGN = Object.freeze({
  'stack-a': 40, 'stack-b': 46, 'stack-c': 28, 'sea-arch': 31, 'roque-plug': 58, 'roque-needle': 28,
});

/**
 * A stratified arch (M1.1c): beds 1.2-2.6 m thick spanning two legs, the opening an ellipse cut bed by
 * bed. Hard flows (dark) stand out 0.4-0.9 m past the arch's mean plan, soft tuffs (pale) are eaten back
 * 0.3-0.6 m, so its outline steps every bed and no vertical run reaches 3 m.
 */
function seaArch(bucket, R) {
  const L = 42, D = 12, H = 31, OW = 11, OH = 16, foot = -14;
  const shade = rockShade({ seed: 5, wetY: 1.2, wetK: 0.5, streak: 0.3 });
  const beds = bedSequence(R, { foot, top: H, thin: 1.0, thick: 1.9 });
  let i = 0;
  for (const b of beds) {
    const y = b.y0, thick = b.y1 - b.y0;
    const ym = y + thick * 0.5;
    const taper = 1 - 0.25 * Math.max(0, ym) / H;
    const rel = b.hard ? b.off : -b.off;
    const len = L * taper + rel * 3 + (R() - 0.5) * 4, dep = D * taper + rel * 2.2 + (R() - 0.5) * 1.8;
    const open = ym < OH ? OW * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, ym) / OH, 2))) - rel * 0.6 : 0;
    const legs = open > 0.8 ? [[-len / 2, -open], [open, len / 2]] : [[-len / 2, len / 2]];
    for (const [a, c] of legs) {
      const w = c - a;
      slab(bucket, { cx: (a + c) / 2 + (R() - 0.5) * 1.2, cz: (R() - 0.5) * 1.4, y0: y, thick: thick + 0.06, r: dep / 2, aspect: w / dep,
        yaw: (R() - 0.5) * 0.06, jag: 0.34, seed: 400 + i * 7 + (a < 0 ? 0 : 3), tone: b.tone, bevel: 0.14, rough: 0.2, sides: 22, wear: 0.9 }, shade);
    }
    i++;
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
 * The Roque plug (M1.1c): a volcanic neck lofted drum by drum (columnar-jointed lava, 3-7 m drums, each
 * bulging to a lip or eaten back at its joint), its plan a lobed mass fluted by `cols` columns that twist
 * a little up the neck, leaning, waisted below the crown; the crown broken into hex column stubs of five
 * or more heights with tilted, broken tops; a talus apron of fallen column drums and blocks.
 */
function plug(bucket, R, { height = 58, base = 9.5, seed = 3, cols = 22 } = {}) {
  const pal = STRATA.plug;
  const top = height - 7;
  const beds = bedSequence(R, { foot: -6, top, thin: 1.6, thick: 3.6, relief: 1.1 })
    .map((b, i) => ({ ...b, tone: b.hard ? pal[(i * 3 + seed) % pal.length] : [0x5a524b, 0x6a6058, 0x7d7166][i % 3] }));
  const shade = bedShade({ seed, wetY: -99, streak: 0.34 });
  const L1 = (R() - 0.5) * 0.09, L2 = (R() - 0.5) * 0.09;
  const centre = (y) => [L1 * Math.max(0, y) + Math.sin(y * 0.05 + seed) * 0.7, L2 * Math.max(0, y)];
  const lobes = (a) => 1 + 0.3 * (vnoise3(Math.cos(a) * 1.2 + seed, Math.sin(a) * 1.2, 4.4) - 0.5) * 2
    + 0.12 * (vnoise3(Math.cos(a) * 3.3, Math.sin(a) * 3.3 + seed, 1.1) - 0.5) * 2;
  const outline = (a, y) => {
    const tw = a + y * 0.004;
    // the columns of each tier stand offset from the tier below (colonnade over entablature)
    const tier = Math.floor((y + 6) / 4.3);
    const f = Math.abs(Math.sin(tw * cols / 2 + tier * 1.7 + vnoise3(y * 0.08, seed, 1) * 0.8));
    return lobes(a) * (0.93 + 0.07 * Math.pow(f, 0.5)) * (1 - 0.12 * Math.abs(Math.sin(a)));
  };
  const radius = (y) => {
    const t = Math.max(0, y) / height;
    let r = base * (1 - 0.52 * Math.pow(t, 0.95));
    r *= 1 + (vnoise3(y * 0.07 + seed, 1.7, 0) - 0.5) * 0.18;                  // the neck swells and waists
    if (y < 0) r *= 1 + (-y) * 0.04;
    return r;
  };
  loftBeds(bucket, { beds, radius, centre, outline, seed, shade, noise: 1.0, seg: Math.max(40, cols * 3), cap: 'flat' });
  const [tx, tz] = centre(top), rTop = radius(top);
  // the crown: hex column stubs, five or more heights, tops tilted and broken
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2 + R() * 0.4;
    const rr = k === 0 ? 0 : rTop * (0.3 + R() * 0.5);
    const ch = (1.2 + R() * 7 * (k === 0 ? 1.2 : 1)) * Math.min(1, height / 58);
    let cr = rTop * (0.18 + R() * 0.1);
    let x = tx + Math.cos(a) * rr, z = tz + Math.sin(a) * rr, y = top - 0.4;
    // a stub over 2.4 m is two drums, the upper one jogged and narrower (a cross-joint), never one straight prism
    const drums = ch > 2.4 ? [ch * (0.4 + R() * 0.2)] : [ch];
    if (drums[0] < ch) drums.push(ch - drums[0]);
    drums.forEach((dh, di) => {
      const last = di === drums.length - 1;
      const cg = new THREE.CylinderGeometry(cr * 0.95, cr, dh, 6, 1);
      const P = cg.attributes.position;
      const sx = last ? (R() - 0.5) * 0.9 : (R() - 0.5) * 0.2, sz = last ? (R() - 0.5) * 0.9 : (R() - 0.5) * 0.2;   // a broken, tilted top
      for (let i = 0; i < P.count; i++) if (P.getY(i) > 0) P.setY(i, P.getY(i) + P.getX(i) * sx + P.getZ(i) * sz);
      cg.rotateZ((R() - 0.5) * 0.14);
      cg.rotateY(di * 0.4);
      cg.translate(x, y + dh / 2, z);
      cg.deleteAttribute('normal');
      const g2 = toCreased(cg.toNonIndexed());
      bucket.add(g2, { surf: 'bisque', tone: pal[(k + 1 + di) % pal.length], wear: 0.9, colorFn: rockShade({ seed: seed + k, lip: 0.35 }) });
      cg.dispose(); g2.dispose();
      y += dh - 0.05; x += (R() - 0.5) * cr * 0.5; z += (R() - 0.5) * cr * 0.5; cr *= 0.8 + R() * 0.1;
    });
  }
  // talus: fallen column drums (hex, lying) and blocks at the foot
  const shade2 = rockShade({ seed, streak: 0.2, lip: 0.3 });
  for (let k = 0; k < 26; k++) {
    const a = R() * Math.PI * 2, rr = base * (1.0 + R() * 0.7);
    if (k % 3 === 0) {
      const cr = base * (0.1 + R() * 0.06), len = 1.5 + R() * 3.5;
      const cg = new THREE.CylinderGeometry(cr, cr, len, 6, 1);
      cg.rotateZ(Math.PI / 2 + (R() - 0.5) * 0.5); cg.rotateY(R() * 6);
      cg.translate(Math.cos(a) * rr, cr * 0.6 - 0.8, Math.sin(a) * rr);
      const g2 = toCreased(cg.toNonIndexed());
      bucket.add(g2, { surf: 'bisque', tone: pal[k % pal.length], wear: 0.9, colorFn: shade2 });
      cg.dispose(); g2.dispose();
    } else {
      slab(bucket, { cx: Math.cos(a) * rr, cz: Math.sin(a) * rr, y0: -1.4 + R() * 0.6, thick: 1.2 + R() * 2.2, r: 0.8 + R() * 1.7,
        aspect: 0.75 + R() * 0.5, yaw: R() * 6, jag: 0.45, seed: seed * 101 + k, tone: pal[k % pal.length], bevel: 0.15, rough: 0.2, sides: 7 }, shade2);
    }
  }
  return top;
}

const toCreased = (g) => toCreasedNormals(g, THREE.MathUtils.degToRad(40));

/** Every node's bucket (the GLB's six nodes), for the build and for the outline check. */
export function buildParts() {
  const parts = [];
  const mk = (name, fn) => {
    const b = new Bucket(name);
    const info = fn(b);
    const box = b.bounds(new THREE.Box3());
    parts.push({ bucket: b, material: { name: `r5-${name}` }, box, info });
  };
  // M1.1c needle stacks: bedded lofts, 10-16 beds above the sea, tapering to pinnacles
  mk('stack-a', (b) => needleStack(b, rng(11), { height: 40, base: 7, seed: 11, aspect: 0.8, needle: 0.62 }));
  mk('stack-b', (b) => needleStack(b, rng(23), { height: 46, base: 9, seed: 23, aspect: 0.74, spires: 2, needle: 0.5 }));
  mk('stack-c', (b) => needleStack(b, rng(37), { height: 28, base: 8, seed: 37, aspect: 0.9, needle: 0.45, thin: 1.7, thick: 3.6 }));   // placed at 0.71: beds 1.2-3.8 m
  mk('sea-arch', (b) => seaArch(b, rng(41)));
  mk('roque-plug', (b) => plug(b, rng(53), { height: 58, base: 9.5, seed: 53, cols: 22 }));
  mk('roque-needle', (b) => plug(b, rng(67), { height: 28, base: 4.6, seed: 67, cols: 12 }));
  return parts;
}

export async function build({ out = ROOT } = {}) {
  const parts = buildParts();
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
