import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * THE BRAZIER — the object (BUILD M1.6c; BIBLE 17): a basalt bowl on three stones beside a cistern. Systems' own
 * new file under src/world/settlements/ (the settlement host is another lane's). The rules and the rest flow are
 * src/game/brazier/; this file only builds and animates what stands in the world.
 *
 *   const b = buildBrazier({ terrain, x, z, yaw, cistern: true })
 *   b.group         add to the scene
 *   b.setState({ kindled, burning })   ash, coals or flame
 *   b.update(t, camera, dayK)          flame billboard faces the camera; light flickers (no allocation)
 *   b.seat          { x, y, z, yaw } where Brea sits: the seat block 1.6 m off the bowl on bearing 200, facing it
 *   b.dispose()
 *
 * Draws: stones + bowl + cistern merged into ONE mesh (vertex colours over a painted basalt map with its relief), the
 * ash-and-coal disc (glowing cracks), the flame (three tongues on one billboard), the pool of light on the ground.
 * Light: `sharedLight` (one shadow-free point light for all Braziers, the one fire light the host carried before;
 * the host's own pit is hidden while this stands, see src/game/brazier/braziers.js). `claimLight()` parks it here.
 */
const BASALT = new THREE.Color('#4a4644');
const BASALT_HI = new THREE.Color('#5c5753');
const RIM = new THREE.Color('#8a8279');
const WATER = new THREE.Color('#1d2b2e');

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

/** A rough stone: a low-poly icosahedron with its vertices pushed in and out. */
function stone(r, rng, squash = 0.7) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.82 + rng() * 0.3;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * squash, p.getZ(i) * k);
  }
  g.computeVertexNormals();
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

/** Basalt (vesicular, sun-dulled) and ash-and-coal surfaces, painted once on small canvases (browser only). */
let _tex = null;
function surfaces() {
  if (_tex !== null) return _tex;
  _tex = { basalt: null, coal: null };
  if (typeof document === 'undefined') return _tex;
  const rng = rngOf(91);
  const canvas = (n) => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };
  // basalt: grey-brown speckle, pale weathering, dark vesicles with a lit lip
  const b = canvas(256), g = b.getContext('2d');
  g.fillStyle = '#7d7975'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 95 + rng() * 80 | 0;
    g.fillStyle = `rgba(${v},${v - 4},${v - 9},${0.25 + rng() * 0.4})`;
    g.fillRect(rng() * 256, rng() * 256, 1 + rng() * 3, 1 + rng() * 3);
  }
  for (let i = 0; i < 260; i++) {
    const x = rng() * 256, y = rng() * 256, r = 0.8 + rng() * rng() * 4.5;
    g.fillStyle = 'rgba(160,152,142,0.55)'; g.beginPath(); g.arc(x + 0.6, y - 0.6, r, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(28,26,26,0.9)'; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
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
  const mk = (cv) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
  _tex.basalt = mk(b);
  _tex.basalt.colorSpace = THREE.SRGBColorSpace;
  _tex.coal = mk(c);
  _tex.coal.colorSpace = THREE.SRGBColorSpace;
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

  const parts = [];
  // three stones, 120 degrees apart, the bowl's feet
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const g = stone(0.16 + rng() * 0.03, rng, 0.75);
    g.translate(Math.cos(a) * 0.27, 0.1, Math.sin(a) * 0.27);
    parts.push(tint(g, BASALT_HI, 0.12, rng));
  }
  // the basalt bowl: a lathe, thick-lipped, open to the sky
  const prof = [
    [0.0, 0.0], [0.16, 0.0], [0.24, 0.02], [0.31, 0.06], [0.37, 0.1], [0.41, 0.15], [0.44, 0.21], [0.455, 0.25], [0.45, 0.28],
    [0.42, 0.29], [0.385, 0.27], [0.35, 0.22], [0.3, 0.17], [0.22, 0.135], [0.12, 0.12], [0.0, 0.12],
  ].map(([r, h]) => new THREE.Vector2(r, h));
  const bowl = new THREE.LatheGeometry(prof, 30);
  bowl.translate(0, 0.2, 0);
  const bp = bowl.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const a = Math.atan2(bp.getZ(i), bp.getX(i));
    const k = 1 + 0.025 * Math.sin(a * 5 + 1.3) + 0.018 * Math.sin(a * 11 + 0.4) + (rng() - 0.5) * 0.02;
    bp.setXYZ(i, bp.getX(i) * k, bp.getY(i) * (1 + (rng() - 0.5) * 0.03), bp.getZ(i) * k);
  }
  bowl.computeVertexNormals();
  parts.push(tint(bowl, BASALT, 0.1, rng));

  // the seat: a flat basalt block 1.6 m off the bowl on bearing 200 (where F30 stands her), its top 0.42 m up, the
  // height the seated pose (player.ride's 'sitIdle') rests its pelvis on
  const SEAT_B = 200 * Math.PI / 180, SEAT_D = 1.6, SEAT_H = 0.42;
  const sw = { x: x + Math.sin(SEAT_B) * SEAT_D, z: z - Math.cos(SEAT_B) * SEAT_D };
  {
    const c = Math.cos(yaw), sn = Math.sin(yaw), dx = sw.x - x, dz = sw.z - z;
    const lx = dx * c - dz * sn, lz = dx * sn + dz * c;            // world -> group frame (inverse of rotation.y)
    const g = new THREE.CylinderGeometry(0.21, 0.26, SEAT_H + 0.08, 7, 1);
    const gp = g.attributes.position;
    for (let i = 0; i < gp.count; i++) { const k = 0.9 + rng() * 0.2; gp.setXYZ(i, gp.getX(i) * k, gp.getY(i), gp.getZ(i) * k); }
    g.computeVertexNormals();
    g.translate(lx, gy(sw.x, sw.z) - y0 + (SEAT_H + 0.08) / 2 - 0.08, lz);
    parts.push(tint(g, BASALT_HI, 0.1, rng));
  }

  // the cistern beside it: a low ring of dressed stones round dark water, 2.3 m off, never on Brea's spawn
  let cisternAt = null;
  if (cistern) {
    const cx = -1.6, cz = 1.7;
    cisternAt = { x: cx, z: cz, r: 0.95 };
    const ring = 11;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2;
      const g = new THREE.BoxGeometry(0.48, 0.36 + rng() * 0.06, 0.26);
      g.rotateY(-a);
      g.translate(cx + Math.cos(a) * 0.95, 0.17, cz + Math.sin(a) * 0.95);
      parts.push(tint(g, RIM, 0.14, rng));
    }
    const w = new THREE.CircleGeometry(0.86, 18);
    w.rotateX(-Math.PI / 2);
    w.translate(cx, 0.24, cz);
    parts.push(tint(w, WATER, 0.02, rng));
  }
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  const tex = surfaces();
  // basalt: the vertex colours carry each part's tone, the map its vesicles and speckle, the same map its relief
  const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0,
    map: tex.basalt, bumpMap: tex.basalt, bumpScale: 2.2 });
  const body = new THREE.Mesh(geo, stoneMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

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
  const seat = { x: sw.x, z: sw.z, y: gy(sw.x, sw.z) + SEAT_H, yaw: Math.atan2(x - sw.x, z - sw.z) };

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
      coal.geometry.dispose(); coalMat.dispose();
      flameGeo.dispose(); flameMat.dispose();
      poolGeo.dispose(); poolMat.dispose();
    },
  };
}
