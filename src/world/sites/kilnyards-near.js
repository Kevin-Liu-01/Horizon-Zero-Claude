import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchAerial, patchDeck } from '../island/aerial.js';
import { YARDS, WELLHEADS, rackPosts } from './kilnyards-layout.js';
import { rng } from '../island/recipe.js';

/**
 * THE KILN YARDS' NEAR FORM (Milestone 3 wave 2, area A: the Yards' kit; BIBLE §3.3 "ruined geothermal plant: two tiled
 * cooling-tower stubs 22-28 m, 3-5 flue stacks, pipe racks, glowing man-made wellheads"; the BOARD Yards panel for form
 * only). Built on the Malpais' approach (./malpais-region.js), while the far form (src/world/island/kilnyards.js, 2 draws,
 * seen from the Holds and the Malpais edge) is hidden; the far form comes back when the region is departed. Both read
 * one layout (./kilnyards-layout.js): the same towers, stacks, racks and four wellheads in the same places (MP5).
 *
 * The material language is the far form's and the Holds' (weathered tile, rust brick, grey steel, the wellheads' dark
 * bodies; albedo in the island's range, linear 0.02-0.09) with its detail drawn in the shader from each surface's own
 * coordinates in metres (`aKit`: kind, u, v): tile courses on the towers, brick courses on the stacks, rust on the steel,
 * cast concrete on the pads; each pattern fades to its mean where it falls under a pixel, so it never shimmers.
 *   - a tower stub: a double shell (outer tile, inner soot), its rim broken in small teeth with the wall's thickness
 *     showing, standing on a ring beam over an open colonnade of raking legs (the air inlet), fallen tiles at its foot;
 *   - a flue stack: brick on a cast plinth, three steel collar bands, soot at the top;
 *   - a pipe rack: H-section posts with cross-arms and a brace, three pipes with flanges every 6 m;
 *   - a wellhead: a cast pad, the body, a flanged spool and a gate valve with its handwheel, and the cap: the one thing
 *     that glows, bone-gold #F2EAD3 (MP1: only wellheads and Kilns glow).
 *
 *   const ky = buildKilnYardsNear({ ground })   ky.group (2 draws) · ky.counts · ky.materials · ky.dispose()
 */
const TILE = new THREE.Color(0x55574f), TILE_DARK = new THREE.Color(0x3a3b37), SOOT = new THREE.Color(0x1f1d1b),
  BRICK = new THREE.Color(0x4a3026), BRICK_SOOT = new THREE.Color(0x221d1b), STEEL = new THREE.Color(0x3d3f40),
  RUST = new THREE.Color(0x4a2e22), HEAD = new THREE.Color(0x2f2c2a), CONCRETE = new THREE.Color(0x4b4944);
const GLOW = 0xf2ead3;
/** aKit.x: the surface's pattern */
export const KIT = Object.freeze({ none: 0, tile: 1, brick: 2, steel: 3, soot: 4, concrete: 5 });

/** Paint a geometry: colour and aKit (kind, u, v) per vertex from a function of its position. */
function paint(geo, fn) {
  const p = geo.attributes.position, n = p.count, c = new Float32Array(n * 3), k = new Float32Array(n * 3), col = new THREE.Color(), kit = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), col, kit);
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
    k[i * 3] = kit[0]; k[i * 3 + 1] = kit[1]; k[i * 3 + 2] = kit[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  geo.setAttribute('aKit', new THREE.BufferAttribute(k, 3));
  return geo;
}
const flat = (g) => (g.index ? g.toNonIndexed() : g);

/* ------------------------------------------------------------------ the towers */
function towerNear(t, seed) {
  const R = rng(0x70e1 + seed * 31);
  const base = 3.4, thick = 0.38, H = t.h;
  // the shell's profile, foot (at the ring beam) to the broken top: it narrows all the way (a stub is the lower shell)
  const prof = (y) => t.r1 + (t.r0 * 0.94 - t.r1) * Math.pow(1 - (y - base) / (H - base), 1.6);
  const pts = [];
  const N = 18;
  for (let i = 0; i <= N; i++) { const y = base + (H - base) * (i / N); pts.push(new THREE.Vector2(prof(y), y)); }
  for (let i = N; i >= 0; i--) { const y = base + (H - base) * (i / N); pts.push(new THREE.Vector2(prof(y) - thick, y)); }
  const shell0 = new THREE.LatheGeometry(pts, 44);
  // the broken rim: many small teeth within the top 12 %, both walls clipped alike so the wall's thickness shows
  const p = shell0.attributes.position;
  const bite = (a) => (Math.sin(a * 5 + seed) * 0.5 + 0.5) * 0.06 + (Math.sin(a * 13.7 + seed * 2.1) * 0.5 + 0.5) * 0.04 + (Math.sin(a * 29.3 + seed * 0.7) * 0.5 + 0.5) * 0.025;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < H * 0.84) continue;
    const a = Math.atan2(p.getZ(i), p.getX(i));
    p.setY(i, Math.min(y, H * (1 - bite(a))));
  }
  shell0.computeVertexNormals();
  const shell = flat(shell0);
  paint(shell, (x, y, z, c, k) => {
    const r = Math.hypot(x, z), a = Math.atan2(z, x), outer = r > prof(Math.max(base, Math.min(H, y))) - thick * 0.5;
    if (outer) {
      const streak = Math.sin(a * 11 + seed) * 0.5 + 0.5;
      c.copy(TILE).lerp(TILE_DARK, 0.45 * streak * (1 - (y - base) / (H - base)));
      k[0] = KIT.tile; k[1] = a * r; k[2] = y;
    } else { c.copy(SOOT).lerp(TILE_DARK, 0.3 * (y - base) / (H - base)); k[0] = KIT.soot; k[1] = a * r; k[2] = y; }
  });
  const parts = [shell];
  // the ring beam the shell stands on
  const beam = flat(new THREE.CylinderGeometry(prof(base) + 0.15, prof(base) + 0.25, 0.7, 44, 1, true));
  beam.translate(0, base - 0.25, 0);
  parts.push(paint(beam, (x, y, z, c, k) => { c.copy(CONCRETE).multiplyScalar(0.85); k[0] = KIT.concrete; k[1] = Math.atan2(z, x) * prof(base); k[2] = y; }));
  // the colonnade: raking legs in pairs (an X between neighbours), ground to beam
  const legs = 22;
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2, a2 = a + Math.PI / legs, rb = prof(base) - thick * 0.5;
    for (const [f, tA] of [[a, a2], [a2, a]]) {
      const x0 = Math.cos(f) * (rb + 0.4), z0 = Math.sin(f) * (rb + 0.4), x1 = Math.cos(tA) * rb, z1 = Math.sin(tA) * rb;
      const L = Math.hypot(x1 - x0, base - 0.6 + 1.0, z1 - z0);
      const g = new THREE.BoxGeometry(0.34, L, 0.34);
      g.translate(0, L / 2, 0);
      const dir = new THREE.Vector3(x1 - x0, base - 0.6 + 1.0, z1 - z0).normalize();
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
      g.translate(x0, -1.0, z0);
      parts.push(paint(flat(g), (x, y, z, c, k) => { c.copy(CONCRETE).multiplyScalar(0.8); k[0] = KIT.concrete; k[1] = x + z; k[2] = y; }));
    }
  }
  // fallen tiles and shell pieces at its foot, outside the colonnade
  for (let i = 0; i < 70; i++) {
    const a = R() * Math.PI * 2, d = t.r0 + 0.5 + R() * 6;
    const s = 0.5 + R() * 1.3;
    const g = new THREE.BoxGeometry(s * 1.2, 0.08 + R() * 0.1, s * 0.6);
    g.rotateZ((R() - 0.5) * 0.5); g.rotateX((R() - 0.5) * 0.5); g.rotateY(R() * Math.PI);
    g.translate(Math.cos(a) * d, 0.05, Math.sin(a) * d);
    const tone = 0.7 + R() * 0.5;
    parts.push(paint(flat(g), (x, y, z, c, k) => { c.copy(TILE).multiplyScalar(tone); k[0] = KIT.none; }));
  }
  return parts;
}

/* ------------------------------------------------------------------ the stacks */
function stackNear(s, i) {
  const parts = [];
  const top = s.r * 0.82;
  const body = flat(new THREE.CylinderGeometry(top, s.r, s.h, 18, 10, true));
  body.translate(0, s.h / 2, 0);
  // the shortest stack is broken off: its top ragged
  if (i === 3) {
    const p = body.attributes.position;
    for (let k = 0; k < p.count; k++) if (p.getY(k) > s.h * 0.95) { const a = Math.atan2(p.getZ(k), p.getX(k)); p.setY(k, s.h * (0.9 + 0.08 * (Math.sin(a * 4 + 1) * 0.5 + 0.5))); }
    body.computeVertexNormals();
  }
  parts.push(paint(body, (x, y, z, c, k) => {
    c.copy(BRICK).lerp(BRICK_SOOT, THREE.MathUtils.smoothstep(y / s.h, 0.72, 1.0));
    k[0] = KIT.brick; k[1] = Math.atan2(z, x) * s.r; k[2] = y;
  }));
  // the lip inside the top, so the open top reads as a flue, not a tube end
  const inner = flat(new THREE.CylinderGeometry(top * 0.86, top * 0.9, 2.0, 18, 1, true));
  inner.translate(0, s.h * (i === 3 ? 0.9 : 1) - 1.0, 0);
  parts.push(paint(inner, (x, y, z, c, k) => { c.copy(SOOT); k[0] = KIT.soot; k[1] = 0; k[2] = y; }));
  // the cast plinth
  const pl = flat(new THREE.BoxGeometry(s.r * 2.6, 2.4, s.r * 2.6));
  pl.translate(0, 0.6, 0);
  parts.push(paint(pl, (x, y, z, c, k) => { c.copy(CONCRETE); k[0] = KIT.concrete; k[1] = x + z * 0.7; k[2] = y; }));
  // three steel collar bands
  for (const f of [0.3, 0.58, 0.86]) {
    if (i === 3 && f > 0.8) continue;
    const r = s.r + (top - s.r) * f + 0.05;
    const band = flat(new THREE.CylinderGeometry(r, r, 0.22, 18, 1, true));
    band.translate(0, s.h * f, 0);
    parts.push(paint(band, (x, y, z, c, k) => { c.copy(STEEL).lerp(RUST, 0.5); k[0] = KIT.steel; k[1] = Math.atan2(z, x) * r; k[2] = y; }));
  }
  return parts;
}

/* ------------------------------------------------------------------ the racks */
function rackNear(r, ground) {
  const A = { x: r.a.x, z: r.a.z }, B = { x: r.b.x, z: r.b.z };
  const ga = ground(A.x, A.z), gb = ground(B.x, B.z);
  const L = Math.hypot(B.x - A.x, B.z - A.z), ang = Math.atan2(B.z - A.z, B.x - A.x), slope = Math.atan2(gb - ga, L), Ls = Math.hypot(L, gb - ga);
  const parts = [];
  const place = (g) => { g.rotateY(-ang); g.translate(A.x, ga, A.z); return g; };
  // three pipes, flanges every 6 m
  for (const [oy, oz, rr] of [[4.2, -0.5, 0.35], [4.2, 0.5, 0.35], [4.95, 0, 0.28]]) {
    const pipe = flat(new THREE.CylinderGeometry(rr, rr, Ls, 12, 1, true));
    pipe.rotateZ(Math.PI / 2); pipe.translate(Ls / 2, 0, oz); pipe.rotateZ(slope); pipe.translate(0, oy, 0);
    parts.push(paint(place(pipe), (x, y, z, c, k) => { c.copy(STEEL); k[0] = KIT.steel; k[1] = x * 0.7 + z * 0.7; k[2] = y; }));
    for (let s = 3; s < Ls - 1; s += 6) {
      const fl = flat(new THREE.CylinderGeometry(rr + 0.12, rr + 0.12, 0.14, 12));
      fl.rotateZ(Math.PI / 2); fl.translate(s, 0, oz); fl.rotateZ(slope); fl.translate(0, oy, 0);
      parts.push(paint(place(fl), (x, y, z, c, k) => { c.copy(STEEL).lerp(RUST, 0.6); k[0] = KIT.steel; k[1] = x + z; k[2] = y; }));
    }
  }
  for (const p of rackPosts().filter((q) => q.rack === r.id)) {
    const t = Math.min(1, Math.max(0, ((p.x - A.x) * (B.x - A.x) + (p.z - A.z) * (B.z - A.z)) / (L * L)));
    const top = ga + (gb - ga) * t + 3.95, g0 = ground(p.x, p.z) - 0.3, hgt = Math.max(0.5, top - g0);
    const post = [];
    // an H-section: two flanges and the web, then the cross-arm the pipes sit on and a knee brace
    for (const dz of [-0.16, 0.16]) { const f = new THREE.BoxGeometry(0.34, hgt, 0.04); f.translate(0, hgt / 2, dz); post.push(f); }
    const web = new THREE.BoxGeometry(0.04, hgt, 0.3); web.translate(0, hgt / 2, 0); post.push(web);
    const arm = new THREE.BoxGeometry(0.26, 0.24, 1.9); arm.translate(0, hgt + 0.02, 0); post.push(arm);
    const br = new THREE.BoxGeometry(0.08, 1.3, 0.08); br.rotateX(0.75); br.translate(0, hgt - 0.6, 0.42); post.push(br);
    for (const g of post) {
      g.rotateY(-ang); g.translate(p.x, g0, p.z);
      parts.push(paint(flat(g), (x, y, z, c, k) => { c.copy(STEEL).lerp(RUST, 0.35); k[0] = KIT.steel; k[1] = x * 0.6 - z * 0.8; k[2] = y; }));
    }
  }
  return parts;
}

/* ------------------------------------------------------------------ the wellheads */
function wellheadNear(w, ground) {
  const g0 = ground(w.x, w.z), parts = [], glow = [];
  const at = (g) => { g.translate(w.x, g0 - 0.1, w.z); return g; };
  const pad = flat(new THREE.BoxGeometry(2.6, 0.3, 2.6)); pad.translate(0, 0.05, 0);
  parts.push(paint(at(pad), (x, y, z, c, k) => { c.copy(CONCRETE); k[0] = KIT.concrete; k[1] = x + 0.3 * z; k[2] = z - 0.3 * x; }));
  const body = flat(new THREE.CylinderGeometry(0.75, 0.95, 1.6, 16)); body.translate(0, 0.8, 0);
  parts.push(paint(at(body), (x, y, z, c, k) => { c.copy(HEAD); k[0] = KIT.steel; k[1] = Math.atan2(z - w.z, x - w.x) * 0.85; k[2] = y; }));
  for (const [y, r, h] of [[0.18, 1.02, 0.12], [1.15, 0.86, 0.1]]) {
    const f = flat(new THREE.CylinderGeometry(r, r, h, 16)); f.translate(0, y, 0);
    parts.push(paint(at(f), (x, yy, z, c, k) => { c.copy(STEEL).lerp(RUST, 0.55); k[0] = KIT.steel; k[1] = x + z; k[2] = yy; }));
  }
  // the gate valve on the body's downhill side, and its handwheel
  const valve = flat(new THREE.BoxGeometry(0.42, 0.5, 0.42)); valve.translate(0, 1.0, -1.05);
  parts.push(paint(at(valve), (x, y, z, c, k) => { c.copy(STEEL); k[0] = KIT.steel; k[1] = x; k[2] = y; }));
  const stem = flat(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6)); stem.translate(0, 1.5, -1.05);
  parts.push(paint(at(stem), (x, y, z, c, k) => { c.copy(STEEL); k[0] = KIT.steel; k[1] = x; k[2] = y; }));
  const wheel = flat(new THREE.TorusGeometry(0.3, 0.035, 5, 16)); wheel.rotateX(Math.PI / 2); wheel.translate(0, 1.76, -1.05);
  parts.push(paint(at(wheel), (x, y, z, c, k) => { c.copy(RUST); k[0] = KIT.steel; k[1] = x; k[2] = z; }));
  const spoke = flat(new THREE.BoxGeometry(0.6, 0.03, 0.03)); spoke.translate(0, 1.76, -1.05);
  parts.push(paint(at(spoke), (x, y, z, c, k) => { c.copy(RUST); k[0] = KIT.steel; k[1] = x; k[2] = z; }));
  // the cap: the far form's ring, in the same place (MP5: mesh and data within 0.1 m)
  const cap = new THREE.TorusGeometry(0.62, 0.12, 6, 18); cap.rotateX(Math.PI / 2); cap.translate(0, 1.62, 0);
  glow.push(at(cap));
  return { parts, glow };
}

/* ------------------------------------------------------------------ the material */
const KIT_PARS = /* glsl */ `
#include <common>
varying vec3 vKit;
float kitHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`;
const KIT_VERT = /* glsl */ `
#include <common>
attribute vec3 aKit;
varying vec3 vKit;
`;
/* the kit's detail from each surface's own metres; a pattern under a pixel fades to its mean (`fade`) */
const KIT_COLOR = /* glsl */ `
#include <color_fragment>
{
  float kind = floor(vKit.x + 0.5);
  vec2 p = vKit.yz;
  vec2 fw = max(fwidth(p), vec2(1e-4));
  float m = 1.0;
  if (kind == 1.0) {
    // weathered tile in courses 0.6 m, staggered, 1.2 m long; a missing patch shows the dark render behind
    vec2 ts = vec2(1.2, 0.6);
    float row = floor(p.y / ts.y);
    vec2 q = vec2(p.x / ts.x + 0.5 * mod(row, 2.0), p.y / ts.y);
    vec2 f = fract(q), id = floor(q);
    vec2 aw = fw / ts;
    float fade = 1.0 - smoothstep(0.12, 0.4, max(aw.x, aw.y));
    vec2 e = smoothstep(vec2(0.0), aw * 1.5 + 0.03, f) * smoothstep(vec2(0.0), aw * 1.5 + 0.03, 1.0 - f);
    float grout = 1.0 - e.x * e.y;
    float h = kitHash(id), h2 = kitHash(floor(id / vec2(3.0, 4.0)) + 7.0);
    float lost = step(0.86, h2) * step(0.35, h);
    float t = mix(0.82 + 0.34 * h, 0.42, grout);
    t = mix(t, 0.38, lost);
    m = mix(0.93, t, fade);
    // rain streaks down from the courses
    m *= 0.88 + 0.12 * kitHash(vec2(floor(p.x * 1.7), 3.0));
  } else if (kind == 2.0) {
    vec2 ts = vec2(0.44, 0.15);
    float row = floor(p.y / ts.y);
    vec2 q = vec2(p.x / ts.x + 0.5 * mod(row, 2.0), p.y / ts.y);
    vec2 f = fract(q), id = floor(q);
    vec2 aw = fw / ts;
    float fade = 1.0 - smoothstep(0.15, 0.45, max(aw.x, aw.y));
    vec2 e = smoothstep(vec2(0.0), aw * 1.5 + 0.06, f) * smoothstep(vec2(0.0), aw * 1.5 + 0.06, 1.0 - f);
    float t = mix(0.8 + 0.36 * kitHash(id), 0.55, 1.0 - e.x * e.y);
    m = mix(0.92, t, fade);
  } else if (kind == 3.0) {
    // steel: rust blooms and runs, a metre or so
    float r1 = kitHash(floor(p * 1.3)), r2 = kitHash(floor(p * 3.1) + 3.0);
    float fade = 1.0 - smoothstep(0.2, 0.6, max(fw.x, fw.y) * 3.1);
    m = mix(1.0, 0.8 + 0.4 * r1 * r2, fade);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.25, 0.85, 0.7), 0.4 * step(0.6, r1) * fade);
  } else if (kind == 5.0) {
    float fade = 1.0 - smoothstep(0.2, 0.6, max(fw.x, fw.y) * 2.0);
    m = mix(1.0, 0.86 + 0.24 * kitHash(floor(p * 2.0)), fade);
  }
  diffuseColor.rgb *= m;
}
`;

/**
 * The near form as jobs, each a few milliseconds (the region runs them inside a per-frame budget, so building the Yards
 * never holds a frame): each job returns { parts, glow } (geometries in place, painted). `finishKilnYardsNear` merges.
 */
export function kilnYardsNearJobs({ ground = () => 0 } = {}) {
  const jobs = [];
  YARDS.towers.forEach((t, i) => {
    jobs.push(() => {
      const g0 = ground(t.x, t.z) - 1.2;
      const parts = towerNear(t, i * 1.7 + 0.4);
      for (const g of parts) g.translate(t.x, g0, t.z);
      return { parts, glow: [] };
    });
  });
  YARDS.stacks.forEach((s, i) => jobs.push(() => { const g0 = ground(s.x, s.z) - 0.6; const parts = stackNear(s, i); for (const g of parts) g.translate(s.x, g0, s.z); return { parts, glow: [] }; }));
  for (const r of YARDS.racks) jobs.push(() => ({ parts: rackNear(r, ground), glow: [] }));
  jobs.push(() => { const parts = [], glow = []; for (const w of WELLHEADS) { const o = wellheadNear(w, ground); parts.push(...o.parts); glow.push(...o.glow); } return { parts, glow }; });
  return jobs;
}

export function buildKilnYardsNear({ ground = () => 0 } = {}) {
  return finishKilnYardsNear(kilnYardsNearJobs({ ground }).map((j) => j()));
}

/** Merge the jobs' results into the near form: two draws (the ruin, the wellheads' caps). */
export function finishKilnYardsNear(results) {
  const parts = results.flatMap((r) => r.parts), glow = results.flatMap((r) => r.glow);
  const geo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide });
  mat.name = 'kiln-yards-near';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', KIT_VERT).replace('#include <begin_vertex>', '#include <begin_vertex>\nvKit = aKit;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', KIT_PARS).replace('#include <color_fragment>', KIT_COLOR);
    patchAerial(shader); patchDeck(shader);
  };
  mat.customProgramCacheKey = () => 'cal-kiln-yards-near';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'kiln-yards-near';
  mesh.castShadow = true; mesh.receiveShadow = true;
  const glowGeo = mergeGeometries(glow.map((g) => (g.index ? g.toNonIndexed() : g)));
  for (const g of glow) g.dispose();
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x1a1816, emissive: GLOW, emissiveIntensity: 2.2, roughness: 0.6 });
  glowMat.name = 'kiln-yards-near-wellheads';
  glowMat.onBeforeCompile = (shader) => { patchAerial(shader); patchDeck(shader); };
  glowMat.customProgramCacheKey = () => 'cal-kiln-yards-near-glow';
  const caps = new THREE.Mesh(glowGeo, glowMat);
  caps.name = 'kiln-yards-near-wellheads';
  const group = new THREE.Group();
  group.name = 'kiln-yards-near';
  group.add(mesh, caps);
  const tri = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  return {
    group, mesh, caps,
    counts: { towers: YARDS.towers.length, stacks: YARDS.stacks.length, racks: YARDS.racks.length, wellheads: WELLHEADS.length, triangles: Math.round(tri(geo) + tri(glowGeo)), draws: 2 },
    materials: [mat, glowMat],
    dispose() { geo.dispose(); glowGeo.dispose(); mat.dispose(); glowMat.dispose(); group.parent?.remove(group); },
  };
}
