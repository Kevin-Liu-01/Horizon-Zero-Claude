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
 *   b.seat          { x, z, yaw } where Brea sits, 1.1 m off the bowl, facing it
 *   b.dispose()
 *
 * Draws: stones + bowl + cistern merged into ONE mesh (vertex colours), the ash/coal disc, the flame quad.
 * Light: `sharedLight` (one shadow-free point light for all Braziers, the one fire light the host carried before;
 * the host's own pit is hidden while this stands, see src/game/brazier/braziers.js). `claimLight()` parks it here.
 */
const BASALT = new THREE.Color('#2b2a2c');
const BASALT_HI = new THREE.Color('#3b3836');
const RIM = new THREE.Color('#57524c');
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
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FLAME_FS = /* glsl */`
uniform float uTime; uniform float uK;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 p = vUv; float y = p.y;
  float w = 0.34 * (1.0 - y) * (0.8 + 0.2 * sin(uTime * 7.0 + y * 6.0));
  float x = abs(p.x - 0.5 + 0.06 * (n(vec2(y * 4.0, uTime * 2.3)) - 0.5) * y * 2.0);
  float body = smoothstep(w, w * 0.35, x) * smoothstep(1.0, 0.25, y + 0.25 * n(vec2(p.x * 6.0, uTime * 3.0 - y * 5.0)));
  if (body < 0.01) discard;
  vec3 hot = vec3(1.0, 0.86, 0.55), mid = vec3(1.0, 0.52, 0.16), top = vec3(0.75, 0.22, 0.06);
  vec3 c = mix(hot, mid, smoothstep(0.05, 0.45, y)); c = mix(c, top, smoothstep(0.45, 0.9, y));
  gl_FragColor = vec4(c * body * uK * 1.6, body * uK);
}`;

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
    [0.0, 0.0], [0.16, 0.0], [0.3, 0.05], [0.4, 0.14], [0.44, 0.24], [0.43, 0.27], [0.37, 0.25], [0.3, 0.17], [0.16, 0.12], [0.0, 0.12],
  ].map(([r, h]) => new THREE.Vector2(r, h));
  const bowl = new THREE.LatheGeometry(prof, 14);
  bowl.translate(0, 0.2, 0);
  const bp = bowl.attributes.position;
  for (let i = 0; i < bp.count; i++) { const k = 1 + (rng() - 0.5) * 0.05; bp.setXYZ(i, bp.getX(i) * k, bp.getY(i), bp.getZ(i) * k); }
  bowl.computeVertexNormals();
  parts.push(tint(bowl, BASALT, 0.1, rng));

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
  const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
  const body = new THREE.Mesh(geo, stoneMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // ash / coals in the bowl
  const coalMat = new THREE.MeshStandardMaterial({ color: '#6d6862', roughness: 1, emissive: new THREE.Color('#ff5a1a'), emissiveIntensity: 0 });
  const coal = new THREE.Mesh(new THREE.CircleGeometry(0.3, 14), coalMat);
  coal.rotation.x = -Math.PI / 2;
  coal.position.y = 0.335;
  group.add(coal);

  // the flame: one camera-facing quad (a crossed pair drew as streaks edge-on, F30 round 1)
  const flameMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uK: { value: 0 } },
    vertexShader: FLAME_VS, fragmentShader: FLAME_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const flameGeo = new THREE.PlaneGeometry(0.62, 0.95);
  flameGeo.translate(0, 0.475, 0);
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.y = 0.32;
  flame.renderOrder = 2;
  flame.frustumCulled = false;
  group.add(flame);

  // one fire light for every Brazier (a second point light would recompile and re-cost every lit material):
  // the caller owns it and parks it at the burning Brazier nearest Brea (src/game/brazier/braziers.js)
  const light = sharedLight ?? null;

  const state = { kindled: false, burning: false, k: 0 };
  const seatA = yaw + Math.PI * 0.75;
  const seat = { x: x + Math.sin(seatA) * 1.1, z: z + Math.cos(seatA) * 1.1, yaw: seatA + Math.PI };

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
      light.position.set(x, y0 + 0.95, z);
    },
    update(t, camera, dayK = 1) {
      const want = state.burning ? 1 : 0;
      state.k += (want - state.k) * 0.08;
      flameMat.uniforms.uTime.value = t;
      flameMat.uniforms.uK.value = state.k;
      const f = 1 + 0.13 * Math.sin(t * 11.3) + 0.08 * Math.sin(t * 23.7 + 1.3);
      if (light && light.userData.owner === group) light.intensity = 18 * state.k * f * dayK;
      coalMat.emissiveIntensity = state.kindled ? (0.15 + 1.6 * state.k) * f : 0;
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
    },
  };
}
