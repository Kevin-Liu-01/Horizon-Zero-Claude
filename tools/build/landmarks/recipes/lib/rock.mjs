/**
 * CALIMA landmark recipes — shared rock kit (world-props, W1). Node only, no
 * DOM; three r169 + tools/build/lib/hs.mjs. Original work: nothing is read.
 *
 * Everything here writes into an hs.mjs `Bucket` (vertex colour = albedo, the
 * 8x1 palette = roughness/metalness), so a whole sea stack, arch or plug is ONE
 * material and one draw. Rock reads as rock through three things, all baked
 * per vertex: strata (each slab is its own tone from a biome palette row), the
 * ledge lip (tops lighter: salt, guano, dust) and 1:8 vertical varnish streaks
 * (darker runs down every face). The look spec's W-03 strata chunk (world-
 * ground) adds the same bands in the ground shader; these assets carry theirs
 * in the mesh so they read with no shader dependency.
 *
 * Deterministic: every random draw comes from an `rng(seed)` passed in.
 */
import { THREE, Bucket } from '../../../lib/hs.mjs';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Hash-based value noise in 3-D, 0..1 (deterministic, no tables). */
function hash(ix, iy, iz) {
  let h = (ix * 374761393 + iy * 668265263 + iz * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);
export function vnoise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);
  let v = 0;
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
    v += w * hash(ix + dx, iy + dy, iz + dz);
  }
  return v;
}
export function fbm3(x, y, z, oct = 3) {
  let a = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { a += amp * vnoise3(x * f, y * f, z * f); n += amp; amp *= 0.5; f *= 2.03; }
  return a / n;
}

/** Strata palette rows (sRGB), bible §9.1 + ROUND5-LOOK W-03 (Flank row). */
export const STRATA = Object.freeze({
  sea: [0x3a3a3f, 0x4a4542, 0x8c6a48, 0x2e2d31, 0x5b4636, 0x7a3b2a, 0x403d3d, 0xb8a890],
  tuff: [0x7a3b2a, 0x8e3b23, 0x9a5a3a, 0x6b3426, 0x8c6a48, 0xa4683f],
  plug: [0x4a4648, 0x3a3a3f, 0x56504a, 0x45403c, 0x5e5650],
});

/**
 * Colour function for a rock face: ledge tops pale (salt / dust), undersides
 * dark, vertical varnish streaks, a wet dark band below `wetY`.
 */
export function rockShade({ seed = 1, streak = 0.22, lip = 0.28, wetY = -1e9, wetK = 0.55, dust = 0 } = {}) {
  return (p, n, k) => {
    let m = k;
    if (n.y > 0.55) m *= 1 + lip * (n.y - 0.55) / 0.45;                     // the ledge lip
    if (n.y < -0.3) m *= 0.78;                                               // overhangs
    const s = vnoise3(p.x * 0.9 + seed, p.y * 0.11, p.z * 0.9 - seed);      // 1:8 vertical streaks
    if (Math.abs(n.y) < 0.6) m *= 1 - streak * Math.max(0, s - 0.45) / 0.55;
    m *= 0.9 + 0.2 * fbm3(p.x * 0.35, p.y * 0.35, p.z * 0.35, 2);
    if (p.y < wetY) m *= wetK + (1 - wetK) * Math.max(0, Math.min(1, (p.y - wetY + 2.5) / 2.5));
    if (dust > 0 && n.y > 0.4) m *= 1 + dust;
    return m;
  };
}

/**
 * One irregular slab: a noisy polygon in plan, extruded `thick` up from y0,
 * bevelled, with creased normals. Returns the geometry (caller adds it).
 *   r       mean plan radius; aspect x:z; yaw rotation; jag 0..1 outline noise
 *   lean    [dx, dz] shift of the top face (a leaning slab)
 */
export function slabGeo({ cx = 0, cz = 0, y0 = 0, thick = 2, r = 4, aspect = 1, yaw = 0, jag = 0.2,
  seed = 1, sides = 14, bevel = 0.25, lean = [0, 0], rough = 0.12 } = {}) {
  const shape = new THREE.Shape();
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const k = 1 + jag * (vnoise3(Math.cos(a) * 1.6 + seed, Math.sin(a) * 1.6, seed * 0.37) - 0.5) * 2
      + jag * 0.5 * (vnoise3(Math.cos(a) * 4.1, Math.sin(a) * 4.1 + seed, 3.3) - 0.5);
    const x = Math.cos(a) * r * aspect * k, y = Math.sin(a) * r * k;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const bv = Math.min(bevel, thick * 0.3, r * 0.2);
  let g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.05, thick - 2 * bv), bevelEnabled: bv > 0.01, bevelThickness: bv, bevelSize: bv,
    bevelSegments: 1, curveSegments: 1, steps: Math.max(1, Math.round(thick / 2.2)),
  });
  g.rotateX(-Math.PI / 2);                      // extrusion +Z -> +Y
  g.translate(0, bv, 0);                        // bottom at 0
  // roughen + lean (before the yaw so the lean is in the slab frame)
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const t = thick > 0 ? y / thick : 0;
    x += lean[0] * t; z += lean[1] * t;
    const n = (fbm3(x * 0.45 + seed, y * 0.45, z * 0.45 - seed, 2) - 0.5) * 2;
    const rr = Math.hypot(x, z) || 1;
    x += (x / rr) * n * rough * r; z += (z / rr) * n * rough * r;
    y += n * rough * 0.35 * Math.min(thick, 2);
    P.setXYZ(i, x, y, z);
  }
  g.rotateY(yaw);
  g.translate(cx, y0, cz);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const merged = toCreasedNormals(g, THREE.MathUtils.degToRad(42));
  g.dispose();
  return merged;
}

/** Add a slab with its strata tone and the shared rock shading. */
export function slab(bucket, opts, shade) {
  const g = slabGeo(opts);
  bucket.add(g, { surf: 'bisque', tone: opts.tone ?? 0x3a3a3f, wear: opts.wear ?? 0.9, colorFn: shade });
  g.dispose();
}

/**
 * A sea stack of stacked strata slabs (look spec W-04): 8-20 slabs 1.5-6 m
 * thick, each inset or outset 0.2-1.2 m, a plan radius that tapers with
 * height, windward fins, an optional caprock. Base sinks to `foot` (below the
 * sea) and is flared; a pale surf collar sits at the waterline.
 */
export function seaStack(bucket, R, { height = 40, base = 8, seed = 1, caprock = false, fins = 2, foot = -14,
  aspect = 0.8, twin = false, palette = STRATA.sea } = {}) {
  const shade = rockShade({ seed, wetY: 1.2, wetK: 0.5 });
  let y = foot, i = 0;
  const top = height;
  while (y < top - 0.8 && i < 40) {
    const t = Math.max(0, y) / height;
    const thick = Math.min(top - y, y < 0 ? 4 + R() * 3 : 1.5 + R() * 4.5);
    const taper = 1 - 0.55 * Math.pow(t, 1.3);
    const out = (R() - 0.45) * 2.2;                                  // inset / outset 0.2-1.2 m
    const r = Math.max(1.4, base * taper + out + (y < 0 ? (-y) * 0.18 : 0));
    const cx = (R() - 0.5) * 0.8 + (twin && t > 0.55 ? -base * 0.3 : 0);
    slab(bucket, { cx, cz: (R() - 0.5) * 0.8, y0: y, thick: thick + 0.15, r, aspect: aspect + (R() - 0.5) * 0.15,
      yaw: R() * Math.PI, jag: 0.22, seed: seed * 31 + i, tone: palette[(i * 3 + seed) % palette.length], bevel: 0.35, rough: 0.09,
      lean: [(R() - 0.5) * 0.6, (R() - 0.5) * 0.6] }, shade);
    if (twin && t > 0.55) {
      slab(bucket, { cx: base * 0.42, cz: (R() - 0.5), y0: y, thick: thick * 0.9, r: r * 0.55, aspect: 0.8,
        yaw: R() * Math.PI, jag: 0.25, seed: seed * 53 + i, tone: palette[(i * 3 + seed + 1) % palette.length], bevel: 0.3, rough: 0.1 }, shade);
    }
    y += thick; i++;
  }
  // windward fins: thin blades on the -x face (the trade wind's side), stepping up
  for (let f = 0; f < fins; f++) {
    const fy = foot + 6 + R() * height * 0.55;
    const fh = height * (0.18 + R() * 0.22);
    const t = Math.max(0, fy) / height;
    const r = base * (1 - 0.55 * t);
    const ang = Math.PI + (R() - 0.5) * 1.2;
    slab(bucket, { cx: Math.cos(ang) * r * 0.85, cz: Math.sin(ang) * r * 0.85, y0: fy, thick: fh, r: r * 0.32, aspect: 0.32,
      yaw: -ang, jag: 0.3, seed: seed * 97 + f, tone: palette[(f + 2) % palette.length], bevel: 0.2, rough: 0.12 }, shade);
  }
  if (caprock) {
    const r = base * 0.62;
    slab(bucket, { cx: 0, cz: 0, y0: y - 0.4, thick: 2.2, r, aspect: 1.05, yaw: R() * 3, jag: 0.16, seed: seed * 7 + 99,
      tone: 0x2e2d31, bevel: 0.45, rough: 0.06 }, rockShade({ seed, lip: 0.4 }));
  }
  // surf collar: a ragged pale band of wet rock + foam at the waterline
  const collar = new THREE.TorusGeometry(base * 1.05, 0.9, 5, 28);
  collar.rotateX(Math.PI / 2);
  const P = collar.attributes.position;
  for (let k = 0; k < P.count; k++) {
    const x = P.getX(k), z = P.getZ(k);
    const n = fbm3(x * 0.3 + seed, 0, z * 0.3, 2);
    P.setXYZ(k, x * (0.95 + n * 0.25), P.getY(k) * (0.6 + n) + 0.15, z * (0.95 + n * 0.25));
  }
  collar.computeVertexNormals();
  bucket.add(collar, { surf: 'bisque', tone: 0xe9ebe6, wear: 0.4, colorFn: (p, n, k) => k * (0.85 + 0.3 * vnoise3(p.x, p.y * 3, p.z)) });
  collar.dispose();
  return y;
}
