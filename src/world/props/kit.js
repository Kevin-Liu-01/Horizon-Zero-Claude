import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplexNoise } from '../terrain.js';

/**
 * ROUND 4 — lane `world-props`. Shared geometry kit for the landmark,
 * settlement, activity-site and fauna builders.
 *
 * Everything in this lane is built the same way the Round-2/3 props were:
 * plain BufferGeometries painted with per-vertex colour, merged into a handful
 * of meshes per site, one material family each. Two rules keep the draw budget
 * honest (`perf-tech-02`, `A21-real-draw-calls`):
 *
 *   1. ONE merged mesh per site per material family — never one mesh per beam.
 *      A site is a frustum-cullable unit, so a vista that sees two of the seven
 *      megastructures pays for two, not seven.
 *   2. Material objects are shared across sites (`materials()` below), so the
 *      renderer sorts them into one state bucket even when the meshes differ.
 *
 * No allocation happens after construction: every builder here runs once,
 * during `new Props()` / `new Camp()`.
 */

export { SimplexNoise };

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** Deterministic RNG — screenshots and gates must reproduce between runs. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function composeMat(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(
    _v1.set(x, y, z),
    _q.setFromEuler(_e.set(rx, ry, rz)),
    _v2.set(sx, sy, sz),
  );
}

/** Uniform tint with per-vertex luminance jitter. Returns the geometry. */
export function tint(geo, color, jitter = 0.06, rng = Math.random) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) {
    const j = 1 + (rng() * 2 - 1) * jitter;
    arr[i * 3] = _c.r * j; arr[i * 3 + 1] = _c.g * j; arr[i * 3 + 2] = _c.b * j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * Rust painter for old-world steel: streaked oxide, scoured highlights on the
 * worn edges, moss/lichen creeping up from `mossBelow` metres of local Y.
 * `noise` is a shared SimplexNoise so the streaks agree across a structure.
 */
export function paintRust(geo, seed, noise, mossBelow = 1.2, weathered = 1) {
  const p = geo.attributes.position;
  const arr = new Float32Array(p.count * 3);
  const cRust = new THREE.Color('#4a2917');
  const cRust2 = new THREE.Color('#7d4526');
  const cWorn = new THREE.Color('#9c8a72');
  const cMoss = new THREE.Color('#44562a');
  const rng = mulberry32(seed);
  for (let i = 0; i < p.count; i++) {
    const lx = p.getX(i), ly = p.getY(i), lz = p.getZ(i);
    const streak = noise.fbm(lx * 0.5 + seed, ly * 1.6 - lz * 0.4, 2) * 0.5 + 0.5;
    _c.copy(cRust).lerp(cRust2, streak * weathered);
    if (rng() < 0.09) _c.lerp(cWorn, 0.35 + rng() * 0.35);
    if (ly < mossBelow) {
      _c.lerp(cMoss, THREE.MathUtils.clamp((mossBelow - ly) * 0.22, 0, 0.5) * (0.35 + 0.65 * streak));
    }
    const j = (rng() - 0.5) * 0.07;
    arr[i * 3] = _c.r + j; arr[i * 3 + 1] = _c.g + j; arr[i * 3 + 2] = _c.b + j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * Weathered pre-Fall concrete: stained, algae at the base, rebar-brown flecks.
 *
 * THE PALETTE IS DELIBERATELY DARK, and it was measured, not chosen. The first
 * pass used #8d897d / #63604f — plausible fresh concrete, and at midday under
 * `world-light`'s sun those albedos tone-map to near white. At 150-300 m the
 * aerial haze then lifts them the rest of the way to the colour of the rim
 * cliffs behind, and `V34-midground`'s contact sheet showed a viaduct and a
 * cooling tower that the RAYS could find and an eye could not. Sixty years of
 * rain on a structure nobody washes is dark grey-brown, so darkening is both
 * the truthful answer and the one that puts a silhouette back in the frame.
 */
export function paintConcrete(geo, seed, noise, mossBelow = 1.0) {
  const p = geo.attributes.position;
  const arr = new Float32Array(p.count * 3);
  const cA = new THREE.Color('#6a665c');
  const cB = new THREE.Color('#413f36');
  const cMoss = new THREE.Color('#3d4a26');
  const cStain = new THREE.Color('#4e3d2a');
  const rng = mulberry32(seed);
  for (let i = 0; i < p.count; i++) {
    const ly = p.getY(i);
    const stain = noise.fbm(p.getX(i) * 0.35 + seed, ly * 0.6 + p.getZ(i) * 0.3, 3) * 0.5 + 0.5;
    _c.copy(cA).lerp(cB, stain);
    // vertical rust weeping below the exposed steel
    const weep = Math.max(0, noise.noise2D(p.getX(i) * 1.4 + seed * 0.3, p.getZ(i) * 1.4));
    _c2.copy(cStain);
    _c.lerp(_c2, weep * 0.35);
    if (ly < mossBelow) _c.lerp(cMoss, THREE.MathUtils.clamp((mossBelow - ly) * 0.35, 0, 0.55));
    const j = (rng() - 0.5) * 0.06;
    arr[i * 3] = _c.r + j; arr[i * 3 + 1] = _c.g + j; arr[i * 3 + 2] = _c.b + j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Bare rock painter for cliff/arch/cave meshes: strata bands + talus dust. */
export function paintRock(geo, seed, noise) {
  const p = geo.attributes.position;
  const nor = geo.attributes.normal;
  const arr = new Float32Array(p.count * 3);
  const cA = new THREE.Color('#7a7367');
  const cB = new THREE.Color('#5a5449');
  const cWarm = new THREE.Color('#8b7a5f');
  const cMoss = new THREE.Color('#54622f');
  const rng = mulberry32(seed);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const band = Math.sin(y * 1.7 + noise.fbm(p.getX(i) * 0.25, p.getZ(i) * 0.25, 2) * 2.4) * 0.5 + 0.5;
    _c.copy(cA).lerp(cB, band * 0.85);
    _c.lerp(cWarm, noise.fbm(p.getX(i) * 0.09 + seed, p.getZ(i) * 0.09, 2) * 0.5 + 0.5);
    if (nor && nor.getY(i) > 0.55) _c.lerp(cMoss, 0.22 + 0.2 * band);
    const j = (rng() - 0.5) * 0.07;
    arr[i * 3] = _c.r + j; arr[i * 3 + 1] = _c.g + j; arr[i * 3 + 2] = _c.b + j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * How many height segments a member needs so its triangles stay small in XZ.
 *
 * `nav` stamps a mesh collider PER TRIANGLE but blocks the triangle's whole
 * padded XZ bounding box (src/core/nav.js `_triStamp`). A one-segment cylinder
 * has side quads that run its entire length, so an 8 m ridge beam 3 m off the
 * ground used to blank a 10 x 10 m square of the navgrid — that is what sealed
 * the hunter camp and made `nav.path(camp -> anywhere)` return null in gate
 * A25b. Only the HORIZONTAL run matters: a vertical post's box is already
 * small, so palisade logs still cost one segment and nothing gets heavier for
 * the 496 of them.
 */
function heightSegs(a, b) {
  const horiz = Math.hypot(b[0] - a[0], b[2] - a[2]);
  return Math.max(1, Math.min(16, Math.round(horiz / 0.9)));
}

/** Tapered cylinder from point a to point b (arrays), painted flat `color`. */
export function tube(list, a, b, r0, r1, color, radial = 6, jitter = 0.06, rng = Math.random) {
  const len = _v1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).length();
  if (!(len > 1e-4)) return null;
  const geo = new THREE.CylinderGeometry(r1, r0, len, radial, heightSegs(a, b));
  _q.setFromUnitVectors(UP, _v1.normalize());
  const m = new THREE.Matrix4().compose(
    _v2.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2),
    _q, new THREE.Vector3(1, 1, 1),
  );
  tint(geo, color, jitter, rng);
  geo.applyMatrix4(m);
  if (list) list.push(geo);
  return geo;
}

/**
 * A steel member from a to b, painted with the rust shader-free painter rather
 * than a flat tint. Same signature as `tube` but takes the shared noise.
 */
export function rustTube(list, a, b, r0, r1, seed, noise, radial = 6) {
  const len = _v1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).length();
  if (!(len > 1e-4)) return null;
  const geo = new THREE.CylinderGeometry(r1, r0, len, radial, heightSegs(a, b));
  paintRust(geo, seed, noise, 1.5);
  _q.setFromUnitVectors(UP, _v1.normalize());
  const m = new THREE.Matrix4().compose(
    _v2.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2),
    _q, new THREE.Vector3(1, 1, 1),
  );
  geo.applyMatrix4(m);
  if (list) list.push(geo);
  return geo;
}

/**
 * I-beam profile extruded along local Y, length L.
 * Segmented along L for the same reason `tube` is (see heightSegs): a 22 m
 * deck girder laid flat used to be three triangles 22 m wide, and `nav` blanks
 * a triangle's whole padded XZ box — four of those under one viaduct bay wiped
 * ~7000 m of the navgrid.
 */
export function iBeam(L, w = 0.6, fl = 0.55, th = 0.09) {
  const seg = Math.max(1, Math.min(24, Math.round(L / 1.2)));
  const web = new THREE.BoxGeometry(th, L, w - th * 2, 1, seg, 1);
  const f1 = new THREE.BoxGeometry(fl, L, th, 1, seg, 1).translate(0, 0, w / 2 - th / 2);
  const f2 = new THREE.BoxGeometry(fl, L, th, 1, seg, 1).translate(0, 0, -w / 2 + th / 2);
  return mergeGeometries([web, f1, f2]);
}

/** Lattice truss box along local Y: 4 chords + X bracing on all four faces. */
export function truss(L, w, chordR, seed, noise, bays = null) {
  const parts = [];
  const n = bays ?? Math.max(2, Math.round(L / (w * 1.15)));
  const half = w / 2;
  const legs = [[-half, -half], [half, -half], [half, half], [-half, half]];
  for (const [lx, lz] of legs) {
    rustTube(parts, [lx, 0, lz], [lx, L, lz], chordR, chordR, seed + lx * 7 + lz * 3, noise, 5);
  }
  const braceR = chordR * 0.34;
  for (let i = 0; i < n; i++) {
    const y0 = (i / n) * L, y1 = ((i + 1) / n) * L;
    for (let f = 0; f < 4; f++) {
      const [ax, az] = legs[f], [bx, bz] = legs[(f + 1) % 4];
      const up = i % 2 === 0;
      rustTube(parts, [ax, up ? y0 : y1, az], [bx, up ? y1 : y0, bz], braceR, braceR, seed + i * 13 + f, noise, 4);
    }
    // horizontal ring every other bay
    if (i % 2 === 1) {
      for (let f = 0; f < 4; f++) {
        const [ax, az] = legs[f], [bx, bz] = legs[(f + 1) % 4];
        rustTube(parts, [ax, y1, az], [bx, y1, bz], braceR, braceR, seed + i * 29 + f, noise, 4);
      }
    }
  }
  return parts;
}

/**
 * Merge a bucket of geometries into ONE mesh on the shared attribute set.
 * Returns null for an empty bucket. Disposes the sources.
 */
export function bake(geos, material, { name, castShadow = true, receiveShadow = true } = {}) {
  if (!geos || !geos.length) return null;
  const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  // mergeGeometries requires an IDENTICAL attribute set on every piece — keep
  // only the attributes present on ALL of them (a single piece without 'color'
  // or 'uv' used to fail the whole bucket at that index and drop the site).
  const common = ['position', 'normal', 'uv', 'color'].filter((nm) => flat.every((g) => g.getAttribute(nm)));
  const keepList = flat.map((g) => {
    const keep = new THREE.BufferGeometry();
    for (const nm of common) keep.setAttribute(nm, g.getAttribute(nm));
    return keep;
  });
  const merged = mergeGeometries(keepList, false);
  for (let i = 0; i < flat.length; i++) if (flat[i] !== geos[i]) flat[i].dispose();
  for (const g of geos) g.dispose();
  if (!merged) return null;
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.name = name;
  return mesh;
}

/**
 * The three material families every structure in this lane draws with. One
 * instance each, shared by every site, created lazily so a module that imports
 * the kit without building anything costs nothing.
 */
let _mats = null;
export function materials() {
  if (_mats) return _mats;
  _mats = {
    /** Rusted old-world steel: beams, plate, gantries, the Tallneck shell. */
    metal: new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.66, metalness: 0.5, side: THREE.DoubleSide,
    }),
    /**
     * Concrete, stone, timber: decks, pylons, palisades, talus.
     *
     * `side: DoubleSide`, and that is a RENDERING FIX, not a modelling choice.
     * Measured on port 5211 against the shipped hunter camp: a merged,
     * vertex-coloured, SINGLE-sided `MeshStandardMaterial` in this scene draws
     * its vertex colours as WHITE. Same geometry, same `USE_COLOR` in the
     * program cache key (mask bit 11 set on both), same colour attribute — the
     * only variable that changes the result is `side`. `hide` and `metal` below
     * were already `DoubleSide` and were the only two kit families whose
     * colours survived; `matte` and `rock` were `FrontSide` and bleached every
     * palisade, viaduct deck and cliff in the valley to bone. Setting every
     * vertex colour of a merged palisade to pure RED changed nothing until the
     * side flag flipped. Costs no draw calls (same mesh, same material) and
     * only the back faces that fail the depth test.
     *
     * The underlying cause is below this lane's line — the fog/CSM chunk
     * surgery in `world-light`'s `patchShaderChunks()` is the only thing in the
     * build that rewrites the lighting path globally — and it is written up for
     * that lane in docs/ROUND4-WORLD-PROPS.md. This is the fix that puts the
     * colour back today without touching another lane's file.
     */
    matte: new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.96, metalness: 0, side: THREE.DoubleSide,
    }),
    /** Flat-shaded stone for arches, cliff faces and boulders. */
    rock: new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, metalness: 0, flatShading: true,
      side: THREE.DoubleSide,
    }),
    /** Hide, cloth, thatch, timber — the settlement's warm family. */
    hide: new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide,
    }),
  };
  return _mats;
}

/**
 * Release the shared material singletons (MEMORY RULE). Call this only after
 * every mesh that draws with them is gone — `Props.dispose()` does exactly
 * that. The next `materials()` rebuilds them, so a teardown/rebuild cycle is
 * safe rather than merely survivable.
 */
export function disposeMaterials() {
  if (!_mats) return;
  for (const m of Object.values(_mats)) m.dispose();
  _mats = null;
}

/**
 * Displace a geometry's vertices with fbm noise so a primitive stops reading as
 * a primitive. `amp` is metres, `freq` cycles per metre.
 */
export function roughen(geo, noise, amp, freq, seed = 0) {
  const p = geo.attributes.position;
  const v = _v1;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = noise.fbm(v.x * freq + seed, v.z * freq - v.y * freq * 0.6, 3);
    p.setXYZ(i, v.x + d * amp, v.y + d * amp * 0.45, v.z + d * amp);
  }
  geo.computeVertexNormals();
  return geo;
}
