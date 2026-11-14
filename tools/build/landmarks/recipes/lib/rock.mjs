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
import { THREE, Bucket, SURF, PALETTE_W } from '../../../lib/hs.mjs';
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
  plug: [0x6b625a, 0x726860, 0x5f5750, 0x776c62, 0x655c54],
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
  seed = 1, sides = 14, bevel = 0.25, lean = [0, 0], rough = 0.12, outline = null } = {}) {
  const shape = new THREE.Shape();
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const k = outline ? outline(a) * (1 + jag * (vnoise3(Math.cos(a) * 3.1 + seed, Math.sin(a) * 3.1, seed * 0.37) - 0.5))
      : 1 + jag * (vnoise3(Math.cos(a) * 1.6 + seed, Math.sin(a) * 1.6, seed * 0.37) - 0.5) * 2
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
  const shade = rockShade({ seed, wetY: 1.2, wetK: 0.5, streak: 0.3 });
  // ONE plan outline for the whole stack (buttresses and re-entrants run top to bottom, so
  // it reads as one mass of rock with bedding across it, not a pile of plates)
  const outline = (a) => 1 + 0.34 * (vnoise3(Math.cos(a) * 1.25 + seed, Math.sin(a) * 1.25, 7.1) - 0.5) * 2
    + 0.16 * (vnoise3(Math.cos(a) * 3.6, Math.sin(a) * 3.6 + seed, 2.2) - 0.5) * 2;
  // bedding: mostly basalt greys, an occasional tuff / ochre band
  const bedTone = (i) => {
    const h = vnoise3(i * 0.73 + seed, 0.5, 3.3);
    return h > 0.9 ? palette[5] : h > 0.82 ? palette[4] : palette[[0, 1, 3, 6, 0, 3][i % 6]];
  };
  let y = foot, i = 0;
  const top = height;
  let lx = 0, lz = 0;
  const lean = [(R() - 0.5) * 0.08, (R() - 0.5) * 0.08];
  while (y < top - 0.8 && i < 40) {
    const t = Math.max(0, y) / height;
    const thick = Math.min(top - y, y < 0 ? 4 + R() * 3 : 2.5 + R() * 4.5);
    const taper = 1 - 0.5 * Math.pow(t, 1.4);
    const ledge = R() < 0.18 ? 0.25 + R() * 0.55 : (R() - 0.5) * 0.35;       // mostly flush, a ledge now and then
    const notch = y > 1.2 && y < 4 ? 0.9 : 1;                                  // the wave-cut notch just above the surf
    const r = Math.max(1.4, (base * taper + ledge + (y < 0 ? (-y) * 0.15 : 0)) * notch);
    lx += lean[0] * thick; lz += lean[1] * thick;
    const cx = lx + (twin && t > 0.55 ? -base * 0.3 : 0);
    // each bed: the stack's plan turned a little and scaled a little (beds weather back unevenly), with
    // rough, non-planar faces, so the stack reads as one rock mass and never as stacked cylinders
    slab(bucket, { cx: cx + (R() - 0.5) * 0.9, cz: lz + (R() - 0.5) * 0.9, y0: y, thick: thick + 0.1, r: r * (0.92 + R() * 0.16), aspect: aspect * (0.94 + R() * 0.12), outline,
      yaw: (R() - 0.5) * 0.5, jag: 0.22, seed: seed * 31 + i, tone: bedTone(i), bevel: 0.06, rough: 0.16, sides: 26 }, shade);
    if (twin && t > 0.55) {
      slab(bucket, { cx: lx + base * 0.42, cz: lz, y0: y, thick: thick * 0.95, r: r * 0.55, aspect: 0.85, outline,
        yaw: 1.3, jag: 0.15, seed: seed * 53 + i, tone: bedTone(i + 1), bevel: 0.1, rough: 0.08, sides: 16 }, shade);
    }
    y += thick; i++;
  }
  // windward fins: thin blades on the -x face (the trade wind's side), stepping up
  for (let f = 0; f < fins; f++) {
    const fy = foot + 6 + R() * height * 0.55;
    const fh = height * (0.2 + R() * 0.25);
    const t = Math.max(0, fy) / height;
    const r = base * (1 - 0.5 * t);
    const ang = Math.PI + (R() - 0.5) * 1.2;
    slab(bucket, { cx: Math.cos(ang) * r * 0.9, cz: Math.sin(ang) * r * 0.9, y0: fy, thick: fh, r: r * 0.3, aspect: 0.3,
      yaw: -ang, jag: 0.3, seed: seed * 97 + f, tone: palette[[0, 3][f % 2]], bevel: 0.08, rough: 0.12, sides: 10 }, shade);
  }
  if (caprock) {
    const r = base * 0.6;
    slab(bucket, { cx: lx, cz: lz, y0: y - 0.4, thick: 2.2, r, aspect: aspect * 1.08, yaw: 0.4, jag: 0.16, seed: seed * 7 + 99, outline,
      tone: 0x2e2d31, bevel: 0.15, rough: 0.06, sides: 18 }, rockShade({ seed, lip: 0.4 }));
  }
  // the foot: a skirt of fallen blocks and wave-washed ledges spreading into the sea, so the stack
  // stands IN the water (a clean cylinder meeting a flat sea reads as floating from 500 m)
  const skirtShade = rockShade({ seed: seed + 5, wetY: 1.4, wetK: 0.42, lip: 0.15 });
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + R() * 0.35;
    const o = outline(a);
    const rr = base * o * (1.0 + R() * 0.35);
    slab(bucket, { cx: lx * 0.2 + Math.cos(a) * rr, cz: lz * 0.2 + Math.sin(a) * rr * aspect, y0: -2.5, thick: 2.6 + R() * 2.2, r: 1.2 + R() * base * 0.22,
      aspect: 0.8 + R() * 0.5, yaw: R() * 6, jag: 0.4, seed: seed * 211 + k, tone: palette[[0, 3, 6][k % 3]], bevel: 0.12, rough: 0.16, sides: 8 }, skirtShade);
  }
  // surf collar: a ragged band of foam round the skirt at the waterline (pale, broken, low)
  const collar = new THREE.TorusGeometry(base * 1.3, 1.15, 4, 44);
  collar.rotateX(Math.PI / 2);
  const P = collar.attributes.position;
  for (let k = 0; k < P.count; k++) {
    const x = P.getX(k), z = P.getZ(k), a = Math.atan2(z, x);
    const o = outline(a);
    const n = fbm3(x * 0.4 + seed, 0, z * 0.4, 2);
    const kk = o * (0.98 + 0.22 * n);
    P.setXYZ(k, x * kk, Math.max(-0.2, P.getY(k) * (0.45 + n * 0.7)) + 0.18, z * kk * aspect);
  }
  collar.computeVertexNormals();
  bucket.add(collar, { surf: 'bisque', tone: 0xfafbf8, wear: 0.2, colorFn: (p, n, k) => k * (0.95 + 0.2 * vnoise3(p.x * 1.3, p.y * 4, p.z * 1.3)) * (n.y > 0.3 ? 1.25 : 1) });
  collar.dispose();
  return y;
}

/* =====================================================================================================
 * M1.1c: BEDDED LOFTS. A stack is one continuous rock mass lofted bed by bed: every bed is its own ring
 * loft (so its tone ends at a crisp bedding plane), its radius follows the stack's taper, one lobed plan
 * outline that runs top to bottom (buttresses and gullies), a slow lean and a 3-D noise field, and its
 * own profile: a HARD bed (a lava flow: dark, resistant) bulges out to a lip; a SOFT bed (tuff and ash:
 * pale, weak) is eaten back into a concave notch. Where two beds meet at different radii a horizontal
 * annulus closes the step (a ledge top, or the underside of an overhang). The result has no straight
 * vertical run: within a bed the profile curves, and between beds it steps.
 * ===================================================================================================== */

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Bed tones by lithology (sRGB): hard flows dark, soft tuffs and ashes light, a red scoria now and then. */
export const BEDS = Object.freeze({
  flow: [0x2c2a2d, 0x333137, 0x3a3739, 0x2f2c2b],
  scoria: [0x56302a, 0x5f3429, 0x5a3127],
  tuff: [0x84705a, 0x8c765e, 0x957e64, 0x7e6b57],
  ash: [0xa69a88, 0xae9f8b, 0x9d917f],
});

/**
 * The bed sequence from `foot` to `top`: alternating hard (flow, or scoria one time in four) and soft
 * (tuff, or pale ash one time in three) beds, thicknesses `thin`..`thick` above the sea, so a stack of
 * 40 m carries 10-16 beds. Returns [{ y0, y1, hard, tone, off }] (off: the bed's relief in m).
 */
export function bedSequence(R, { foot = -14, top = 40, thin = 1.4, thick = 3.6, relief = 1 } = {}) {
  const beds = [];
  let y = foot, hard = R() < 0.5, i = 0;
  while (y < top - 0.3 && i < 80) {
    // flows are massive or thin, ashes mostly thin: the sequence never reads as even stripes
    const t = Math.min(top - y, y < -1 ? 4 + R() * 3 : (hard ? thin + Math.pow(R(), 0.8) * (thick * 1.5 - thin) : thin * 0.45 + R() * (thick - thin) * 0.55));
    const tone = hard ? (R() < 0.25 ? BEDS.scoria[(R() * 3) | 0] : BEDS.flow[(R() * 4) | 0])
      : (R() < 0.34 ? BEDS.ash[(R() * 3) | 0] : BEDS.tuff[(R() * 4) | 0]);
    beds.push({ y0: y, y1: y + t, hard, tone, off: relief * (hard ? 0.2 + R() * 0.45 : 0.15 + R() * 0.35),
      slope: relief * (R() - 0.5) * 1.1, mid: 0.35 + R() * 0.3, jx: relief * (R() - 0.5) * 0.6, jz: relief * (R() - 0.5) * 0.6 });
    y += t; hard = !hard; i++;
  }
  return beds;
}

/**
 * Loft one rock column bed by bed into `bucket`.
 *   beds      bedSequence()
 *   radius    (y) -> mean plan radius at height y (the taper, pinnacle, waist)
 *   centre    (y) -> [x, z] (lean and curvature)
 *   outline   (a, y) -> plan-shape factor about 1 (lobes, flutes)
 *   seg       radial segments; dy target ring spacing
 *   noise     amplitude of the 3-D displacement (m), at two scales
 *   shade     colour function (p, n, k, bed, u) -> k
 *   cap       close the top: 'apex' (a pinnacle), 'flat' (a cap), or none
 */
export function loftBeds(bucket, { beds, radius, centre, outline, seg = 40, dy = 0.45, noise = 0.9, seed = 1, shade, cap = 'apex', capRise = 0.6 }) {
  const TAU = Math.PI * 2;
  const P = (a, y, prof, b) => {
    let [cx, cz] = centre(y);
    if (b) { cx += b.jx || 0; cz += b.jz || 0; }                               // each bed sits a little off the last
    const ca = Math.cos(a), sa = Math.sin(a);
    const r0 = radius(y);
    let r = r0 * outline(a, y) + prof;
    const bx = cx + ca * r, bz = cz + sa * r;
    // two-scale 3-D noise, radial (scaled down where the column is thin, so a needle never pinches through)
    const k = Math.min(1, 0.45 + r0 / 4);
    const n0 = (fbm3(ca * 1.3 + seed, y * 0.035, sa * 1.3 - seed, 2) - 0.5) * 2;          // the plan drifts with height
    const n1 = (fbm3(bx * 0.16 + seed, y * 0.11, bz * 0.16 - seed, 3) - 0.5) * 2;
    const n2 = (fbm3(bx * 0.7 - seed, y * 0.4 + 3.1, bz * 0.7, 2) - 0.5) * 2;
    r = Math.max(0.25, r * (1 + 0.32 * n0) + (n1 * noise * 1.5 + n2 * noise * 0.8) * k);
    return [cx + ca * r, y, cz + sa * r];
  };
  // a hard bed is a cliff with a chamfered lip; a soft bed a shallow notch (never a rounded tyre)
  const profile = (b, u) => b.hard
    ? b.off * (0.7 + 0.3 * ss(0, 0.35, u)) - b.off * 0.8 * ss(0.86, 1, u) + (b.slope || 0) * (u - 0.5)
      - (b.y1 - b.y0 > 2.6 ? 0.45 * Math.exp(-Math.pow((u - (b.mid ?? 0.5)) / 0.09, 2)) : 0)   // a massive flow's own parting
    : -b.off * Math.pow(Math.sin(Math.PI * u), 0.5) * 0.8;
  const pos = [], nor = [], col = [];
  const tone = new THREE.Color();
  const emit = (a, b, c, na, nb, nc, ka, kb, kc, t) => {
    pos.push(...a, ...b, ...c); nor.push(...na, ...nb, ...nc);
    tone.set(t);
    for (const k of [ka, kb, kc]) { const kk = Math.min(1.5, Math.max(0.4, k)); col.push(tone.r * kk, tone.g * kk, tone.b * kk); }
  };
  const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const kOf = (p, n, b, u) => shade ? shade(p, n, 1, b, u) : 1;
  let prevTop = null, prevBed = null;
  for (const b of beds) {
    const rows = Math.max(3, Math.ceil((b.y1 - b.y0) / dy));
    const grid = [];
    for (let j = 0; j <= rows; j++) {
      const u = j / rows, y = b.y0 + (b.y1 - b.y0) * u;
      const ring = [];
      for (let i = 0; i < seg; i++) ring.push(P((i / seg) * TAU, y, profile(b, u), b));
      grid.push(ring);
    }
    // normals by central differences (wrapping round, one-sided at the bed's ends)
    const N = grid.map((ring, j) => ring.map((p, i) => {
      const da = sub(ring[(i + 1) % seg], ring[(i + seg - 1) % seg]);
      const dv = sub(grid[Math.min(rows, j + 1)][i], grid[Math.max(0, j - 1)][i]);
      return nrm(cross(dv, da));
    }));
    const K = grid.map((ring, j) => ring.map((p, i) => kOf({ x: p[0], y: p[1], z: p[2] }, { x: N[j][i][0], y: N[j][i][1], z: N[j][i][2] }, b, j / rows)));
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < seg; i++) {
        const i2 = (i + 1) % seg;
        const a = grid[j][i], bb = grid[j][i2], c = grid[j + 1][i2], d = grid[j + 1][i];
        // outward winding: (a, c, b) and (a, d, c) face +radial for counter-clockwise a (x = cos, z = sin)
        emit(a, c, bb, N[j][i], N[j + 1][i2], N[j][i2], K[j][i], K[j + 1][i2], K[j][i2], b.tone);
        emit(a, d, c, N[j][i], N[j + 1][i], N[j + 1][i2], K[j][i], K[j + 1][i], K[j + 1][i2], b.tone);
      }
    }
    // the step between the previous bed's top ring and this bed's bottom ring (same heights, two radii)
    if (prevTop) {
      const bot = grid[0];
      for (let i = 0; i < seg; i++) {
        const i2 = (i + 1) % seg;
        const lo = prevTop[i], lo2 = prevTop[i2], hi = bot[i], hi2 = bot[i2];
        // which way the step faces: up when the lower bed stands out (a ledge), down under an overhang
        const rl = Math.hypot(lo[0], lo[2]), rh = Math.hypot(hi[0], hi[2]);
        const up = rl > rh;
        const n = up ? [0, 1, 0] : [0, -1, 0];
        const owner = up ? prevBed : b;
        const k = up ? 1.28 : 0.62;                       // ledge tops catch dust and light; undersides are dark
        // one winding serves both: its face normal follows the sign of (outer radius - inner radius)
        emit(lo, hi2, lo2, n, n, n, k, k, k, owner.tone); emit(lo, hi, hi2, n, n, n, k, k, k, owner.tone);
      }
    }
    prevTop = grid[rows]; prevBed = b;
  }
  if (cap && prevTop) {
    const top = prevBed.y1;
    const [cx, cz] = centre(top);
    const rr = radius(top);
    const apex = cap === 'apex' ? [cx + (fbm3(seed, 1, 2) - 0.5) * rr * 0.6, top + rr * capRise, cz + (fbm3(2, seed, 1) - 0.5) * rr * 0.6] : [cx, top + 0.15, cz];
    for (let i = 0; i < prevTop.length; i++) {
      const a = prevTop[i], b2 = prevTop[(i + 1) % prevTop.length];
      const n = nrm(cross(sub(b2, a), sub(apex, a)));
      const nn = n[1] < 0 ? [-n[0], -n[1], -n[2]] : n;
      emit(a, apex, b2, nn, nn, nn, 1.2, 1.3, 1.2, prevBed.tone);
    }
  }
  // colours are final (linear): straight into the bucket, on the stone palette texel
  const u = (SURF.bisque.slot + 0.5) / PALETTE_W;
  for (let i = 0; i < pos.length; i++) { bucket.pos.push(pos[i]); bucket.nor.push(nor[i]); bucket.col.push(col[i]); }
  for (let i = 0; i < pos.length / 3; i++) bucket.uv.push(u, 0.5);
  bucket.pieces++;
}

/** Rock shading for a bedded loft: varnish streaks, wet foot, lip and notch shadow, per-bed variation. */
export function bedShade({ seed = 1, wetY = 1.2, streak = 0.26 } = {}) {
  return (p, n, k, b, u) => {
    let m = k * (0.9 + 0.2 * vnoise3(b.y0 * 0.7 + seed, 0.3, 1.7));          // each bed its own tone within its class
    if (n.y > 0.5) m *= 1 + 0.3 * (n.y - 0.5) / 0.5;                          // dusty treads
    if (n.y < -0.35) m *= 0.72;                                               // undersides
    if (b.hard) m *= 0.9 + 0.12 * u;                                          // a flow is darker at its base
    else m *= 1 - 0.16 * Math.sin(Math.PI * u);                               // a notch holds shadow in its throat
    const s = vnoise3(p.x * 0.8 + seed, p.y * 0.09, p.z * 0.8 - seed);        // 1:8 varnish streaks down the faces
    if (Math.abs(n.y) < 0.6) m *= 1 - streak * Math.max(0, s - 0.5) / 0.5;
    m *= 0.92 + 0.16 * fbm3(p.x * 0.4, p.y * 0.4, p.z * 0.4, 2);
    if (p.y < wetY) m *= 0.5 + 0.5 * ss(wetY - 2.5, wetY, p.y);
    return m;
  };
}

/** A broken top: two or three tilted blocks, the last of the pinnacle's beds split and leaning. */
function crown(bucket, R, [cx, cz], r, top, seed, shade) {
  const sh = rockShade({ seed, lip: 0.3, streak: 0.2 });
  for (let k = 0; k < 3; k++) {
    const a = R() * Math.PI * 2, d = r * (0.2 + R() * 0.5);
    slab(bucket, { cx: cx + Math.cos(a) * d, cz: cz + Math.sin(a) * d, y0: top - 0.9 - R() * 0.8, thick: 0.9 + R() * 1.4, r: r * (0.45 + R() * 0.35),
      aspect: 0.6 + R() * 0.6, yaw: R() * 6, jag: 0.45, seed: seed * 7 + k, tone: [0x2c2a2d, 0x3a3739, 0x4f2d25][k], bevel: 0.1, rough: 0.22, sides: 7,
      lean: [(R() - 0.5) * 0.9, (R() - 0.5) * 0.9] }, sh);
  }
  void shade;
}

/**
 * M1.1c needle stack: a bedded loft (10-16 beds above the sea) on one lobed plan, tapering to a pinnacle
 * (or two, `spires: 2`), leaning and curving a little, with a wave-cut notch above the surf, a skirt of
 * fallen blocks and a surf collar at its foot.
 */
export function needleStack(bucket, R, { height = 40, base = 7, seed = 1, foot = -14, aspect = 0.8, spires = 1,
  needle = 0.7, thin = 1.4, thick = 3.6, noise = 0.9, splitAt = 0.58 } = {}) {
  const shade = bedShade({ seed });
  const outline = (a, y) => {
    const tw = a + y * 0.006;                                                  // a slow twist up the stack
    return (1 + 0.3 * (vnoise3(Math.cos(tw) * 1.25 + seed, Math.sin(tw) * 1.25, 7.1) - 0.5) * 2
      + 0.14 * (vnoise3(Math.cos(tw) * 3.6, Math.sin(tw) * 3.6 + seed, 2.2 + y * 0.02) - 0.5) * 2)
      * (Math.abs(Math.sin(a)) * (aspect - 1) + 1);
  };
  const L1 = (R() - 0.5) * 0.07, L2 = (R() - 0.5) * 0.07, ph = R() * 6;
  const centre = (y) => [L1 * Math.max(0, y) + Math.sin(y * 0.09 + ph) * 0.8, L2 * Math.max(0, y) + Math.cos(y * 0.07 + ph) * 0.6];
  const taper = (y, H, b0) => {
    const t = Math.max(0, y) / H;
    let r = b0 * (1 - 0.5 * Math.pow(t, 1.2));
    r *= 1 - needle * Math.pow(ss(0.55, 1.02, t), 1.3);                        // the needle: the last third pinches in
    if (y > 0.6 && y < 3.6) r *= 0.9 + 0.1 * ss(0.6, 3.6, y);                 // the wave-cut notch
    if (y < 0) r *= 1 + (-y) * 0.012;                                          // flares under the sea
    return Math.max(0.5, r);
  };
  const beds = bedSequence(R, { foot, top: height, thin, thick });
  if (spires < 2) {
    loftBeds(bucket, { beds, radius: (y) => taper(y, height, base), centre, outline, seed, shade, noise, cap: 'apex', capRise: 0.35 });
    crown(bucket, R, centre(height), taper(height, height, base), height, seed, shade);
  } else {
    // the trunk to the split, then two spires from inside it (their beds continue the trunk's sequence)
    const ys = height * splitAt;
    const trunk = beds.filter((b) => b.y0 < ys).map((b) => ({ ...b, y1: Math.min(b.y1, ys) }));
    loftBeds(bucket, { beds: trunk, radius: (y) => taper(y, height, base), centre, outline, seed, shade, noise, cap: 'flat' });
    const r0 = taper(ys, height, base);
    for (const [s, hk, sk] of [[1, 1, 0.56], [-1, 0.8, 0.46]]) {
      const H2 = height * hk;
      const ang = 0.6 + seed;
      const ox = Math.cos(ang) * r0 * 0.48 * s, oz = Math.sin(ang) * r0 * 0.48 * s;
      const sp = beds.filter((b) => b.y1 > ys - 1.2 && b.y0 < H2).map((b) => ({ ...b, y0: Math.max(b.y0, ys - 1.2), y1: Math.min(b.y1, H2) }));
      const c2 = (y) => { const [cx, cz] = centre(y); const t = (y - ys) / (H2 - ys); return [cx + ox * (1 + t * 0.25), cz + oz * (1 + t * 0.25)]; };
      loftBeds(bucket, { beds: sp, radius: (y) => Math.max(0.45, r0 * sk * (1 - 0.75 * Math.pow(ss(ys, H2 * 1.02, y), 1.15))), centre: c2, outline, seed: seed + s * 13, shade, noise: noise * 0.8, seg: 30, cap: 'apex', capRise: 0.4 });
      crown(bucket, R, c2(H2), Math.max(0.45, r0 * sk * 0.25), H2, seed + s, shade);
    }
  }
  // the foot: fallen blocks and wave-washed ledges spreading into the sea
  const skirtShade = rockShade({ seed: seed + 5, wetY: 1.4, wetK: 0.42, lip: 0.15 });
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + R() * 0.35;
    const rr = base * outline(a, 0) * (1.0 + R() * 0.4);
    slab(bucket, { cx: Math.cos(a) * rr, cz: Math.sin(a) * rr, y0: -2.5, thick: 2.2 + R() * 2.4, r: 1.0 + R() * base * 0.2,
      aspect: 0.8 + R() * 0.5, yaw: R() * 6, jag: 0.4, seed: seed * 211 + k, tone: [0x2b2a2e, 0x34333a, 0x5e2c22, 0x3d3a3c][k % 4], bevel: 0.12, rough: 0.2, sides: 8 }, skirtShade);
  }
  // surf collar: a ragged band of foam round the foot at the waterline
  const collar = new THREE.TorusGeometry(base * 1.3, 1.15, 4, 44);
  collar.rotateX(Math.PI / 2);
  const P = collar.attributes.position;
  for (let k = 0; k < P.count; k++) {
    const x = P.getX(k), z = P.getZ(k), a = Math.atan2(z, x);
    const o = outline(a, 0);
    const n = fbm3(x * 0.4 + seed, 0, z * 0.4, 2);
    const kk = o * (0.98 + 0.22 * n);
    P.setXYZ(k, x * kk, Math.max(-0.2, P.getY(k) * (0.45 + n * 0.7)) + 0.18, z * kk);
  }
  collar.computeVertexNormals();
  bucket.add(collar, { surf: 'bisque', tone: 0xfafbf8, wear: 0.2, colorFn: (p, n, k) => k * (0.95 + 0.2 * vnoise3(p.x * 1.3, p.y * 4, p.z * 1.3)) * (n.y > 0.3 ? 1.25 : 1) });
  collar.dispose();
  return beds;
}
