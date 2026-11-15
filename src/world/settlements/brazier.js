import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SEAT, CISTERN, offsetOn } from './brazier-spots.js';

/**
 * THE BRAZIER — the object (BUILD M1.6c; BIBLE 17): a basalt bowl on three stones beside a cistern. Systems' own
 * new file under src/world/settlements/ (the settlement host is another lane's). The rules and the rest flow are
 * src/game/brazier/; this file only builds and animates what stands in the world.
 *
 *   const b = buildBrazier({ terrain, x, z, yaw, cistern: true })
 *   b.group         add to the scene
 *   b.setState({ kindled, burning })   ash, coals or flame
 *   b.update(t, camera, dayK)          flame billboard faces the camera; light flickers (no allocation)
 *   b.seat          { x, y, z, yaw } where Brea sits: the seat stone 1.6 m off the bowl on bearing 200, facing it
 *   b.cistern       { x, z, r } the cistern's centre and outer radius (world)
 *   b.dispose()
 *
 * Draws: the feet stones, the bowl and the seat merged into ONE basalt mesh (vertex colours over a painted basalt map
 * with its soft relief); the cistern's masonry wall (one lathe, its own dressed-stone map) and its water; the
 * ash-and-coal disc (glowing cracks); the flame (three tongues on one billboard); the pool of light on the ground.
 * Where the seat and the cistern stand is ./brazier-spots.js (SEAT, CISTERN: world bearings from the bowl).
 * Light: `sharedLight` (one shadow-free point light for all Braziers, the one fire light the host carried before;
 * the host's own pit is hidden while this stands, see src/game/brazier/braziers.js). `claimLight()` parks it here.
 */
const BASALT = new THREE.Color('#4a4644');
const BASALT_HI = new THREE.Color('#57524e');
const WATER = new THREE.Color('#14201f');

/**
 * Seamless UVs from the position (u = x + z/2, v = y + z/2, per metre x k): the icosahedron's and the cylinder's own
 * UVs have seams, and the relief map's slope across a seam drew the feet stones as black shards (f90d2b0 F30).
 */
function uvPlanar(geo, k) {
  const p = geo.attributes.position, uv = geo.attributes.uv;
  if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i) * 0.5) * k, (p.getY(i) + p.getZ(i) * 0.5) * k);
  return geo;
}

function tint(geo, color, jitter, rng) {
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = 1 + (rng() * 2 - 1) * jitter;
    c[i * 3] = color.r * k; c[i * 3 + 1] = color.g * k; c[i * 3 + 2] = color.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (geo.index) return geo.toNonIndexed();
  return geo;
}

function rngOf(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * A field stone, SMOOTH and SEATED (39f7533 F30: the feet were low-poly icosahedra, flat-shaded, and read as black
 * facets): a subdivided sphere welded so its normals are shared, pushed in and out by a few low waves on its
 * direction (a lumpy cobble, no spikes), squashed, flattened underneath and sunk `sink` of its height into the
 * ground, so it sits in the ground instead of balancing on a point. `flatTop` (m above its base) cuts a seat face.
 */
function boulder(rx, ry, rz, rng, { detail = 3, sink = 0.28, flatTop = null, lump = 0.13 } = {}) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const waves = [];
  for (let i = 0; i < 5; i++) {
    const a = rng() * Math.PI * 2, b = Math.acos(rng() * 2 - 1);
    waves.push({ x: Math.sin(b) * Math.cos(a), y: Math.cos(b), z: Math.sin(b) * Math.sin(a), f: 1.4 + rng() * 2.2, ph: rng() * 6.283, amp: lump / (1 + i * 0.6) });
  }
  const p = g.attributes.position;
  const base = -ry * (1 - 2 * sink);           // the ground line in the stone's frame (sink of its height below it)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let k = 1;
    for (const w of waves) k += w.amp * Math.sin((x * w.x + y * w.y + z * w.z) * w.f + w.ph);
    let px = x * rx * k, py = y * ry * k, pz = z * rz * k;
    if (flatTop != null && py - base > flatTop) py = base + flatTop + (py - base - flatTop) * 0.08;
    p.setXYZ(i, px, py - base, pz);
  }
  g.computeVertexNormals();
  // planar UVs need a uv attribute to write into
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
  return g;
}

/**
 * THE CISTERN (BIBLE 17: "a basalt bowl on three stones beside a stone cistern"): a round, hand-built tank of dressed
 * stone in lime mortar, its wall 0.5 m above the ground and sunk below it, a coping lip that overhangs a little, and
 * the inner wall down to the water. One lathe (no box blocks: 39f7533 stood eleven dark boxes round a disc, and they
 * read as blocks in F05 and F30). UVs: u wraps a whole number of masonry tiles round the ring (no seam), v follows the
 * profile's own length, so the courses run level on the outer wall and the coping reads as its top stones.
 */
function cisternGeometry(rng) {
  const P = [
    [1.02, -0.32], [1.02, 0.4], [1.06, 0.41], [1.07, 0.44], [1.07, 0.5], [1.05, 0.53], [1.0, 0.55], [0.86, 0.55],
    [0.82, 0.53], [0.8, 0.5], [0.8, 0.5], [0.79, 0.12],
  ];
  const SEG = 48, N = 6;             // 6 tiles of masonry round the ring: 1.07 m each on the outer wall
  const prof = P.map(([r, h]) => new THREE.Vector2(r, h));
  const g = new THREE.LatheGeometry(prof, SEG);
  const pos = g.attributes.position, uv = g.attributes.uv;
  // path length along the profile (the masonry's v)
  const L = [0];
  for (let j = 1; j < P.length; j++) L.push(L[j - 1] + Math.hypot(P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1]));
  // hand-built: the ring wanders a few centimetres, periodically, so the seam's two columns stay one
  const w1 = rng() * 6.283, w2 = rng() * 6.283;
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const k = 1 + 0.012 * Math.sin(a * 3 + w1) + 0.008 * Math.sin(a * 7 + w2);
    for (let j = 0; j < P.length; j++) {
      const n = i * P.length + j;
      pos.setX(n, pos.getX(n) * k); pos.setZ(n, pos.getZ(n) * k);
      uv.setXY(n, (i / SEG) * N, L[j] / 0.42);
    }
  }
  g.computeVertexNormals();
  // the lathe's first and last columns are one seam: share their normals
  const nrm = g.attributes.normal;
  for (let j = 0; j < P.length; j++) {
    const a = j, b = SEG * P.length + j;
    const x = nrm.getX(a) + nrm.getX(b), y = nrm.getY(a) + nrm.getY(b), z = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(a, x / l, y / l, z / l); nrm.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}

const FLAME_VS = /* glsl */`
attribute float aSeed;
varying vec2 vUv; varying float vSeed;
void main() { vUv = uv; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
/**
 * The flame: three tongues of different height and phase, each a soft teardrop with a hot white root, an orange
 * body and a red tip, licked sideways by noise. Every edge fades (round 1 read as one soft cone in a rectangular
 * haze: the quad's flat base was cut where the body was widest).
 */
const FLAME_FS = /* glsl */`
uniform float uTime; uniform float uK;
varying vec2 vUv; varying float vSeed;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 p = vUv; float y = p.y;
  float t = uTime * (1.0 + 0.25 * vSeed) + vSeed * 17.0;
  float lick = (n(vec2(y * 3.0 + vSeed * 5.0, t * 2.1)) - 0.5) * 0.32 * y;
  float x = abs(p.x - 0.5 - lick);
  float w = 0.3 * pow(1.0 - y, 0.8) * (0.85 + 0.15 * sin(t * 6.0 + y * 7.0)) * smoothstep(0.0, 0.16, y);
  float tear = n(vec2(p.x * 7.0, t * 3.4 - y * 6.0));
  float top = 0.78 + 0.22 * n(vec2(vSeed * 3.0, t * 1.3));
  float body = smoothstep(w, w * 0.25, x) * smoothstep(top, top * 0.45, y + 0.22 * tear * y);
  body *= smoothstep(0.0, 0.07, y) * smoothstep(0.0, 0.12, 0.5 - abs(p.x - 0.5));
  if (body < 0.01) discard;
  vec3 root = vec3(1.0, 0.93, 0.74), hot = vec3(1.0, 0.7, 0.3), mid = vec3(0.98, 0.42, 0.1), tip = vec3(0.62, 0.14, 0.04);
  vec3 c = mix(root, hot, smoothstep(0.02, 0.2, y));
  c = mix(c, mid, smoothstep(0.2, 0.5, y));
  c = mix(c, tip, smoothstep(0.5, 0.85, y));
  float a = body * uK;
  gl_FragColor = vec4(c * a, a);
}`;

/** The fire's own pool of light on the trodden ground: warm, round, fading to nothing at 2.4 m (additive). */
const POOL_VS = /* glsl */`
varying vec2 vXZ;
void main() { vXZ = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const POOL_FS = /* glsl */`
uniform float uK; uniform float uR;
varying vec2 vXZ;
void main() {
  float d = length(vXZ) / uR;
  float f = pow(max(0.0, 1.0 - d), 2.2);
  gl_FragColor = vec4(vec3(1.0, 0.55, 0.22) * f * uK, 1.0);
}`;

/**
 * The painted surfaces (browser only), each painted once on a small canvas:
 *   basalt    vesicular, sun-dulled grey-brown: the bowl, its feet and the seat (with `basaltH`, its relief: soft
 *             pits only, so a stone never breaks into black facets under a low fire light)
 *   masonry   the cistern: three courses of dressed rubble (basalt and pale tuff) in weathered lime mortar per
 *             tile, joints drawn per course, worn edges (with `masonryH`: the joints sunk, each stone's face a little domed)
 *   coal      grey ash with glowing cracks (the same canvas is the emissive map)
 */
let _tex = null;
function surfaces() {
  if (_tex !== null) return _tex;
  _tex = { basalt: null, basaltH: null, masonry: null, masonryH: null, coal: null };
  if (typeof document === 'undefined') return _tex;
  const rng = rngOf(91);
  const canvas = (n, m = n) => { const c = document.createElement('canvas'); c.width = n; c.height = m; return c; };
  // basalt: grey-brown speckle, pale weathering, dark vesicles with a lit lip
  const b = canvas(256), g = b.getContext('2d');
  const bh = canvas(256), gh = bh.getContext('2d');
  g.fillStyle = '#7d7975'; g.fillRect(0, 0, 256, 256);
  gh.fillStyle = '#b0b0b0'; gh.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 95 + rng() * 80 | 0, x = rng() * 256, y = rng() * 256, w = 1 + rng() * 3, h = 1 + rng() * 3;
    g.fillStyle = `rgba(${v},${v - 4},${v - 9},${0.25 + rng() * 0.4})`;
    g.fillRect(x, y, w, h);
    gh.fillStyle = `rgba(${v + 40},${v + 40},${v + 40},0.18)`;
    gh.fillRect(x, y, w, h);
  }
  for (let i = 0; i < 220; i++) {
    const x = rng() * 256, y = rng() * 256, r = 0.8 + rng() * rng() * 3.6;
    g.fillStyle = 'rgba(160,152,142,0.5)'; g.beginPath(); g.arc(x + 0.6, y - 0.6, r, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(40,37,36,0.8)'; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    const pit = gh.createRadialGradient(x, y, 0, x, y, r * 1.4);
    pit.addColorStop(0, 'rgba(70,70,70,0.9)'); pit.addColorStop(1, 'rgba(176,176,176,0)');
    gh.fillStyle = pit; gh.beginPath(); gh.arc(x, y, r * 1.4, 0, 6.283); gh.fill();
  }

  // masonry: a 512 x 256 tile is three courses (0.13, 0.16, 0.13 m) of dressed rubble 0.15-0.3 m long, joints
  // drawn per course by the rng (no brick grid: 39f7533's first film of this lathe read as a regular brick well)
  const MW = 512, MH = 256, mc = canvas(MW, MH), mg = mc.getContext('2d'), mh = canvas(MW, MH), mhg = mh.getContext('2d');
  const M = MW;
  mg.fillStyle = '#9c9486'; mg.fillRect(0, 0, MW, MH);                     // weathered lime mortar
  mhg.fillStyle = '#3a3a3a'; mhg.fillRect(0, 0, MW, MH);                   // joints sunk
  const tones = [[86, 80, 75], [98, 91, 84], [74, 69, 66], [112, 102, 92], [92, 86, 82], [120, 108, 96], [80, 76, 74]];
  const courses = [[0, 80], [80, 176], [176, 256]];
  const J = 6;                                                               // joint width (px)
  const stoneAt = (x0, x1, y0, y1) => {
    const [r, gg, bb] = tones[(rng() * tones.length) | 0];
    const k = 0.88 + rng() * 0.24;
    const dy0 = (rng() - 0.5) * 6, dy1 = (rng() - 0.5) * 6;                 // a hand-laid course wanders
    const draw = (ox) => {
      const x = x0 + ox + J / 2, y = y0 + J / 2 + dy0, w = x1 - x0 - J, h = y1 - y0 - J - dy0 + dy1, rr = 10 + rng() * 10;
      const path = (c) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, rr); else c.rect(x, y, w, h); };
      mg.fillStyle = `rgb(${r * k | 0},${gg * k | 0},${bb * k | 0})`; path(mg); mg.fill();
      const grd = mg.createLinearGradient(0, y, 0, y + h);
      grd.addColorStop(0, 'rgba(255,248,236,0.08)'); grd.addColorStop(1, 'rgba(20,16,14,0.2)');
      mg.fillStyle = grd; path(mg); mg.fill();
      path(mhg);
      const hg = mhg.createRadialGradient(x + w / 2, y + h / 2, 2, x + w / 2, y + h / 2, Math.max(w, h) * 0.62);
      hg.addColorStop(0, '#e6e6e6'); hg.addColorStop(1, '#a0a0a0');
      mhg.fillStyle = hg; mhg.fill();
    };
    draw(0);
    if (x1 > M) draw(-M);                                                    // the stone that wraps the tile's edge
  };
  for (const [y0, y1] of courses) {
    const js = [rng() * 60 | 0];
    while (js[js.length - 1] < M - 150) js.push(js[js.length - 1] + 70 + (rng() * 70 | 0));
    for (let i = 0; i < js.length; i++) stoneAt(js[i], i + 1 < js.length ? js[i + 1] : js[0] + M, y0, y1);
  }
  // speckle and vesicles over the stones, grime in the joints
  for (let i = 0; i < 1800; i++) {
    const v = 60 + rng() * 90 | 0;
    mg.fillStyle = `rgba(${v},${v - 3},${v - 8},${0.2 + rng() * 0.3})`;
    mg.fillRect(rng() * MW, rng() * MH, 1 + rng() * 2, 1 + rng() * 2);
  }
  for (let i = 0; i < 90; i++) {
    const x = rng() * MW, y = rng() * MH, r = 0.8 + rng() * 2.2;
    mg.fillStyle = 'rgba(36,33,31,0.7)'; mg.beginPath(); mg.arc(x, y, r, 0, 6.283); mg.fill();
    mhg.fillStyle = 'rgba(90,90,90,0.8)'; mhg.beginPath(); mhg.arc(x, y, r, 0, 6.283); mhg.fill();
  }

  // ash and coal: grey ash with glowing cracks (the cracks are the emissive map)
  const c = canvas(128), k = c.getContext('2d');
  k.fillStyle = '#000'; k.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 46; i++) {
    let x = 64 + (rng() - 0.5) * 90, y = 64 + (rng() - 0.5) * 90;
    k.strokeStyle = `rgba(255,${120 + rng() * 90 | 0},40,${0.5 + rng() * 0.5})`;
    k.lineWidth = 0.8 + rng() * 2.2;
    k.beginPath(); k.moveTo(x, y);
    for (let j = 0; j < 4; j++) { x += (rng() - 0.5) * 22; y += (rng() - 0.5) * 22; k.lineTo(x, y); }
    k.stroke();
  }
  for (let i = 0; i < 70; i++) {
    k.fillStyle = `rgba(255,${150 + rng() * 80 | 0},60,${0.4 + rng() * 0.6})`;
    k.beginPath(); k.arc(64 + (rng() - 0.5) * 70, 64 + (rng() - 0.5) * 70, 1 + rng() * 3.5, 0, 6.283); k.fill();
  }
  const mk = (cv, color = true) => {
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  _tex.basalt = mk(b);
  _tex.basaltH = mk(bh, false);
  _tex.masonry = mk(mc);
  _tex.masonryH = mk(mh, false);
  _tex.coal = mk(c);
  return _tex;
}

/** The one shared fire light (shadow-free), for src/game/brazier/braziers.js, which may not import three. */
export function makeFireLight() {
  const light = new THREE.PointLight('#ff9550', 0, 22, 2);
  light.castShadow = false;
  return light;
}

/** A plain Vector3 for callers that may not import three (interactable positions). */
export const vec3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function buildBrazier({ terrain, x, z, yaw = 0, cistern = true, seed = 7, sharedLight = null }) {
  const rng = rngOf(seed);
  const gy = (px, pz) => terrain?.getHeight?.(px, pz) ?? 0;
  const y0 = gy(x, z);
  const group = new THREE.Group();
  group.name = 'brazier';
  group.position.set(x, y0, z);
  group.rotation.y = yaw;

  // world -> group frame (the inverse of rotation.y), for parts placed by a world bearing
  const cY = Math.cos(yaw), sY = Math.sin(yaw);
  const toLocal = (dx, dz) => ({ x: dx * cY - dz * sY, z: dx * sY + dz * cY });

  const parts = [];
  // three field stones, 120 degrees apart, the bowl's feet: smooth, seated in the ground, the bowl resting on them
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const r = 0.17 + rng() * 0.03;
    const g = boulder(r * 1.05, r * 0.9, r * 0.95, rng, { detail: 3, sink: 0.3, lump: 0.1 });
    g.rotateY(rng() * 6.283);
    g.translate(Math.cos(a) * 0.27, 0, Math.sin(a) * 0.27);
    parts.push(tint(uvPlanar(g, 2.2), BASALT_HI, 0.1, rng));
  }
  // the basalt bowl: a lathe, thick-lipped, open to the sky, its foot on the three stones
  const prof = [
    [0.0, 0.0], [0.16, 0.0], [0.24, 0.02], [0.31, 0.06], [0.37, 0.1], [0.41, 0.15], [0.44, 0.21], [0.455, 0.25], [0.45, 0.28],
    [0.42, 0.29], [0.385, 0.27], [0.35, 0.22], [0.3, 0.17], [0.22, 0.135], [0.12, 0.12], [0.0, 0.12],
  ].map(([r, h]) => new THREE.Vector2(r, h));
  const bowl = new THREE.LatheGeometry(prof, 36);
  bowl.translate(0, 0.2, 0);
  const bp = bowl.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const a = Math.atan2(bp.getZ(i), bp.getX(i));
    // periodic in the angle only, so the lathe's seam columns move together (no crack down the bowl)
    const k = 1 + 0.025 * Math.sin(a * 5 + 1.3) + 0.018 * Math.sin(a * 11 + 0.4);
    bp.setXYZ(i, bp.getX(i) * k, bp.getY(i), bp.getZ(i) * k);
  }
  bowl.computeVertexNormals();
  parts.push(tint(bowl, BASALT, 0.06, rng));

  // the seat: a flat-topped basalt boulder SEAT.dist m off the bowl on world bearing SEAT.bearing (where F30 sits
  // her), its top SEAT.height m up, the height the seated pose (player.ride's 'sitIdle') rests its pelvis on
  const so = offsetOn(SEAT.bearing, SEAT.dist);
  const sw = { x: x + so.x, z: z + so.z };
  {
    const l = toLocal(so.x, so.z);
    const g = boulder(0.34, 0.33, 0.29, rng, { detail: 3, sink: 0.26, flatTop: SEAT.height, lump: 0.08 });
    g.rotateY(rng() * 6.283);
    g.translate(l.x, gy(sw.x, sw.z) - y0, l.z);
    parts.push(tint(uvPlanar(g, 2.2), BASALT_HI, 0.08, rng));
  }

  // the cistern beside it (see cisternGeometry): its own masonry, never on Brea's spawn, the seat or the bowl
  let cisternAt = null, cisternGeo = null, waterGeo = null;
  if (cistern) {
    const co = offsetOn(CISTERN.bearing, CISTERN.dist), l = toLocal(co.x, co.z);
    const cy = gy(x + co.x, z + co.z) - y0;
    cisternAt = { x: x + co.x, z: z + co.z, r: CISTERN.r };
    cisternGeo = cisternGeometry(rng);
    cisternGeo.translate(l.x, cy, l.z);
    cisternGeo = tint(cisternGeo, new THREE.Color(1, 1, 1), 0.05, rng);
    waterGeo = new THREE.CircleGeometry(0.8, 40);
    waterGeo.rotateX(-Math.PI / 2);
    waterGeo.translate(l.x, cy + 0.3, l.z);
  }
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  const tex = surfaces();
  // basalt: the vertex colours carry each part's tone, the map its vesicles and speckle, its soft relief map the pits
  const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0,
    map: tex.basalt, bumpMap: tex.basaltH, bumpScale: 0.35 });
  const body = new THREE.Mesh(geo, stoneMat);
  body.name = 'brazier-basalt';
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  let wall = null, wallMat = null, water = null, waterMat = null;
  if (cisternGeo) {
    wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0,
      map: tex.masonry, bumpMap: tex.masonryH, bumpScale: 0.6 });
    wall = new THREE.Mesh(cisternGeo, wallMat);
    wall.name = 'brazier-cistern';
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
    // still, dark water a hand below the coping: glossy, so it carries the sky and the fire
    waterMat = new THREE.MeshStandardMaterial({ color: WATER, roughness: 0.06, metalness: 0.0 });
    water = new THREE.Mesh(waterGeo, waterMat);
    water.name = 'brazier-cistern-water';
    water.receiveShadow = true;
    group.add(water);
  }

  // ash / coals in the bowl
  // grey ash with glowing cracks and live coals (the same canvas is the map and the emissive map): no flat coral disc
  const coalMat = new THREE.MeshStandardMaterial({ color: '#8a847c', roughness: 1, map: tex.coal, emissiveMap: tex.coal,
    emissive: new THREE.Color('#ff6a24'), emissiveIntensity: 0 });
  const coalGeo = new THREE.CircleGeometry(0.32, 20);
  { const cp = coalGeo.attributes.position; for (let i = 1; i < cp.count; i++) cp.setZ(i, (rng() - 0.3) * 0.035); coalGeo.computeVertexNormals(); }
  const coal = new THREE.Mesh(coalGeo, coalMat);
  coal.rotation.x = -Math.PI / 2;
  coal.position.y = 0.335;
  group.add(coal);

  // the flame: three tongues side by side on one yaw billboard (a crossed pair drew as streaks edge-on, F30 round 1)
  const flameMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uK: { value: 0 } },
    vertexShader: FLAME_VS, fragmentShader: FLAME_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const tongues = [[0, 0.5, 0.92, 0.02], [-0.11, 0.38, 0.66, 0.37], [0.12, 0.36, 0.6, 0.71]].map(([ox, w, hgt, sd]) => {
    const g = new THREE.PlaneGeometry(w, hgt);
    g.translate(ox, hgt / 2, sd * 0.02);
    g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(4).fill(sd), 1));
    return g;
  });
  const flameGeo = mergeGeometries(tongues, false);
  for (const g of tongues) g.dispose();
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.y = 0.3;
  flame.renderOrder = 2;
  flame.frustumCulled = false;
  group.add(flame);

  // the pool of light on the trodden ground, draped on the terrain (the point light alone lit nothing visible, F30)
  const POOL_R = 2.4;
  const poolGeo = new THREE.CircleGeometry(POOL_R, 28, 0, Math.PI * 2);
  poolGeo.rotateX(-Math.PI / 2);
  {
    const pp = poolGeo.attributes.position;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    for (let i = 0; i < pp.count; i++) {
      const lx = pp.getX(i), lz = pp.getZ(i);
      const wx = x + lx * c + lz * sn, wz = z - lx * sn + lz * c;
      pp.setY(i, gy(wx, wz) - y0 + 0.035);
    }
  }
  const poolMat = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 }, uR: { value: POOL_R } }, vertexShader: POOL_VS, fragmentShader: POOL_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2,
  });
  const pool = new THREE.Mesh(poolGeo, poolMat);
  pool.renderOrder = 1;
  group.add(pool);

  // one fire light for every Brazier (a second point light would recompile and re-cost every lit material):
  // the caller owns it and parks it at the burning Brazier nearest Brea (src/game/brazier/braziers.js)
  const light = sharedLight ?? null;

  const state = { kindled: false, burning: false, k: 0 };
  // where she sits: on the seat block, facing the bowl (yaw: the heading toward the fire, atan2(dx, dz))
  const seat = { x: sw.x, z: sw.z, y: gy(sw.x, sw.z) + SEAT.height, yaw: Math.atan2(x - sw.x, z - sw.z) };

  return {
    group, seat, cistern: cisternAt, position: new THREE.Vector3(x, y0, z),
    setState({ kindled, burning }) {
      state.kindled = !!kindled;
      state.burning = !!burning && !!kindled;
      flame.visible = state.burning;
    },
    get state() { return { ...state }; },
    get burning() { return state.burning; },
    claimLight() {
      if (!light || light.userData.owner === group) return;
      light.userData.owner = group;
      light.position.set(x, y0 + 1.4, z);
    },
    update(t, camera, dayK = 1) {
      const want = state.burning ? 1 : 0;
      state.k += (want - state.k) * 0.08;
      // by day a fire is a faint shimmer (sky-look's fireDayK: 0.05 by day, 1 at night): the flame and coals scale
      // with it too, so a day frame (F20) never shows a white column and a lit disc (4945148 film)
      const day = 0.12 + 0.88 * Math.max(0, Math.min(1, dayK));
      flameMat.uniforms.uTime.value = t;
      flameMat.uniforms.uK.value = state.k * day;
      const f = 1 + 0.13 * Math.sin(t * 11.3) + 0.08 * Math.sin(t * 23.7 + 1.3);
      // 7, not 18: at 18 the blades within a metre blew out to white and her violet turned pink (F30 at 4945148)
      if (light && light.userData.owner === group) light.intensity = 7 * state.k * f * dayK;
      coalMat.emissiveIntensity = state.kindled ? (0.25 + 1.6 * state.k * day) * f : 0;
      // the pool only shows once the sun is down: by day (dayK 0.05) it is 0.02, at dusk and night up to 0.34
      poolMat.uniforms.uK.value = 0.34 * state.k * Math.max(0, Math.min(1, dayK)) * (0.9 + 0.1 * f);
      pool.visible = state.burning;
      if (camera && flame.visible) {
        // yaw-only billboard in the group's frame
        const dx = camera.position.x - group.position.x, dz = camera.position.z - group.position.z;
        flame.rotation.y = Math.atan2(dx, dz) - group.rotation.y;
      }
    },
    dispose() {
      group.removeFromParent();
      geo.dispose(); stoneMat.dispose();
      if (wall) { cisternGeo.dispose(); wallMat.dispose(); waterGeo.dispose(); waterMat.dispose(); }
      coal.geometry.dispose(); coalMat.dispose();
      flameGeo.dispose(); flameMat.dispose();
      poolGeo.dispose(); poolMat.dispose();
    },
  };
}
