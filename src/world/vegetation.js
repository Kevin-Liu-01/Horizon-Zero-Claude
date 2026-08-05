import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplexNoise, pathFactor } from './terrain.js';

/**
 * Vegetation: chunked GPU-instanced wind-swaying grass (red-gold stealth
 * patches driven by terrain.tallGrassDensity + green-gold filler), instanced
 * low-poly pines clustered on hillsides, and deformed instanced boulders.
 *
 * Grass renders in two tiers so the meadow reads to the horizon without a
 * "grass ring" around the camera:
 *   - near tier: dense 48 m chunks, full-detail tufts, fades out 118..150 m
 *   - far tier: four 192 m chunks of sparse (~18%) but ~2x bigger cheap
 *     tufts, cross-fading in 100..138 m and sinking away 258..306 m
 * Far chunks cost at most 16 extra draws (usually ~6 after frustum culling)
 * and never render into the shadow map.
 *
 * Everything is built once at construction; per-frame work is only a time
 * uniform and a distance-visibility flag per near grass chunk (no buffer
 * rebuilds, no allocations).
 */

const CHUNK = 48;                 // meters per near grass chunk
const GRID = 15;                  // near chunks per axis, covers ±360 m
const GRASS_MAX_R = 336;          // no grass beyond playable rim
const CULL_DIST = 174;            // near chunk-center cull (blades fade out by 140)
const CULL_DIST_SQ = CULL_DIST * CULL_DIST;
const CANDIDATES_PER_CHUNK = 3300; // slightly wider tufts keep coverage cheap
const FAR_CHUNK = 192;            // far-LOD chunk size (4x near side keeps draws low)
const FAR_GRID = 4;               // 4x4 far chunks cover ±384 m
const FAR_CANDIDATES = 7800;      // ~15% of near density, tufts ~2x bigger
const NEAR_FADE = [-2, -1, 108, 140];   // vec4: fade-in lo/hi, fade-out lo/hi
const FAR_FADE = [96, 136, 258, 306];
const CAMP = { x: 22, z: 30 };

/* ----------------------------- deterministic RNG --------------------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------ shader snippets ---------------------------- */
// We apply instanceMatrix ourselves in begin_vertex (so wind bending happens in
// world-aligned space), so downstream chunks must NOT apply it again.
const PROJECT_NO_INSTANCE = /* glsl */ `
vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
gl_Position = projectionMatrix * mvPosition;
`;

const WORLDPOS_NO_INSTANCE = /* glsl */ `
vec4 worldPosition = modelMatrix * vec4( transformed, 1.0 );
`;

const GRASS_VERT_HEAD = /* glsl */ `
#include <common>
uniform float uTime;
uniform vec2 uWindDir;
uniform vec4 uFade; // x..y: fade in over distance, z..w: fade out
attribute vec2 aInfo; // x: phase, y: flexibility
varying float vBladeY;
`;

const GRASS_VERT_BODY = /* glsl */ `
vec3 transformed = ( instanceMatrix * vec4( position, 1.0 ) ).xyz;
vBladeY = uv.y;
vec3 iOrigin = instanceMatrix[3].xyz;
vec3 iWorld = ( modelMatrix * vec4( iOrigin, 1.0 ) ).xyz;

// distance window: blades rise out of / sink into the ground at the tier edges
float dCam = distance( iWorld, cameraPosition );
float fade = smoothstep( uFade.x, uFade.y, dCam )
           * ( 1.0 - smoothstep( uFade.z, uFade.w, dCam ) );
transformed.y = mix( iOrigin.y, transformed.y, fade );

// coherent gust field travelling along the wind + slow cross-swell
vec2 wxz = iWorld.xz;
float gust = sin( dot( wxz, uWindDir ) * 0.060 - uTime * 1.65 )
           + 0.55 * sin( dot( wxz, vec2( -uWindDir.y, uWindDir.x ) ) * 0.021 + uTime * 0.53 )
           + 0.30 * sin( uTime * 0.95 + wxz.x * 0.013 );
gust = clamp( gust * 0.5 + 0.5, 0.0, 1.2 );

// per-instance bend-direction jitter (±0.5 rad) so blades don't comb uniformly
float bja = fract( aInfo.x * 0.15915 ) - 0.5;
float bc = cos( bja ), bs = sin( bja );
vec2 bDir = vec2( uWindDir.x * bc - uWindDir.y * bs,
                  uWindDir.x * bs + uWindDir.y * bc );

float hh = uv.y * uv.y; // stiff root, floppy tip
float sway = ( 0.10 + 0.34 * gust * gust ) * aInfo.y;
vec2 bend = bDir * sway
          + vec2( -bDir.y, bDir.x ) * ( sin( uTime * 3.1 + aInfo.x ) * 0.05 * aInfo.y );
transformed.xz += bend * hh * fade;
transformed.y -= dot( bend, bend ) * 0.35 * hh;
`;

// Root->tip gradient: dark earthy base (fake AO) to warm bright tip.
const GRASS_FRAG_GRAD = /* glsl */ `
float grad = smoothstep( 0.0, 0.8, vBladeY );
diffuseColor.rgb *= mix( vec3( 0.34, 0.27, 0.19 ), vec3( 1.18, 1.06, 0.92 ), grad );
`;

const TREE_VERT_HEAD = /* glsl */ `
#include <common>
uniform float uTime;
uniform vec2 uWindDir;
`;

const TREE_VERT_BODY = /* glsl */ `
vec3 transformed = ( instanceMatrix * vec4( position, 1.0 ) ).xyz;
vec3 iOrigin = instanceMatrix[3].xyz;
float phase = iOrigin.x * 0.37 + iOrigin.z * 0.61;
float hFrac = clamp( ( transformed.y - iOrigin.y ) / 9.0, 0.0, 1.4 );
float swayT = sin( uTime * 1.05 + phase ) + 0.4 * sin( uTime * 2.3 + phase * 1.7 );
transformed.xz += uWindDir * swayT * 0.05 * hFrac * hFrac;
`;

export class Vegetation {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    ctx.scene.add(this.group);

    // shared wind state (uniform objects shared across all vegetation shaders)
    this.windDir = new THREE.Vector2(0.82, 0.57).normalize();
    this._uTime = { value: 0 };
    this._uWindDir = { value: this.windDir };
    this.gustLevel = 0; // 0..1 at the player, for audio rustle

    this._chunks = [];
    this._noise = new SimplexNoise(9042);

    const t0 = performance.now();
    this._buildGrass();
    this._buildFarGrass();
    this._buildTrees();
    this._buildRocks();
    this.buildMs = performance.now() - t0;
  }

  /* -------------------------------- grass -------------------------------- */

  /**
   * Tuft geometry: `blades` blades fanned around the origin. Each blade is a
   * tapering strip through `heights` rows (`halfW` half-widths per row, last
   * row is the tip vertex).
   */
  _tuftGeometry({ blades, heights, halfW, seed, spread, hBase, hVar }) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const index = [];
    const rng = mulberry32(seed);
    const rows = heights.length;

    for (let b = 0; b < blades; b++) {
      const yaw = b * (Math.PI * 2 / blades) + rng() * 0.8;
      const sy = hBase + rng() * hVar;
      const ox = (rng() - 0.5) * spread;
      const oz = (rng() - 0.5) * spread;
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
      const base = positions.length / 3;
      // blade normal tilted slightly off vertical so orientation modulates light
      const nx = sinY * 0.2, nz = cosY * 0.2;
      const nl = Math.hypot(nx, 1, nz);

      for (let i = 0; i < rows; i++) {
        const h = heights[i];
        const preBend = 0.17 * h * h; // natural forward arc, splayed outward
        const w = halfW[i];
        const verts = i < rows - 1 ? [-w, w] : [0];
        for (const vx of verts) {
          const lx = vx, lz = preBend;
          positions.push(
            ox + (lx * cosY + lz * sinY),
            h * sy,
            oz + (-lx * sinY + lz * cosY),
          );
          normals.push(nx / nl, 1 / nl, nz / nl);
          uvs.push(vx < 0 ? 0 : 1, h);
        }
      }
      // paired rows form quads; the single last vertex caps the tip
      for (let i = 0; i < rows - 2; i++) {
        const r0 = base + i * 2;
        index.push(r0, r0 + 1, r0 + 2, r0 + 2, r0 + 1, r0 + 3);
      }
      const t = base + (rows - 2) * 2;
      index.push(t, t + 1, t + 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.setIndex(index);
    return geo;
  }

  _grassMaterial(fade) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const uFade = { value: new THREE.Vector4(fade[0], fade[1], fade[2], fade[3]) };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this._uTime;
      shader.uniforms.uWindDir = this._uWindDir;
      shader.uniforms.uFade = uFade;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', GRASS_VERT_HEAD)
        .replace('#include <begin_vertex>', GRASS_VERT_BODY)
        .replace('#include <project_vertex>', PROJECT_NO_INSTANCE)
        .replace('#include <worldpos_vertex>', WORLDPOS_NO_INSTANCE);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vBladeY;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + GRASS_FRAG_GRAD)
        // thin blades: light back faces like front faces (no black ribbons)
        .replace(
          '#include <normal_fragment_begin>',
          '#include <normal_fragment_begin>\nnormal = normalize( vNormal );',
        );
    };
    return mat;
  }

  /**
   * Shared per-chunk scatter/instancing for both grass tiers.
   * cfg: { chunk, grid, candidates, geo, mat, sMul, hMul, namePrefix, cull }
   */
  _buildGrassTier(cfg) {
    const terrain = this.ctx.terrain;
    const baseGeo = cfg.geo;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eul = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();

    const half = (cfg.grid * cfg.chunk) / 2;
    let total = 0;

    for (let ci = 0; ci < cfg.grid; ci++) {
      for (let cj = 0; cj < cfg.grid; cj++) {
        const cx = -half + (ci + 0.5) * cfg.chunk;
        const cz = -half + (cj + 0.5) * cfg.chunk;
        const cr = Math.hypot(cx, cz);
        if (cr > GRASS_MAX_R + cfg.chunk) continue;

        const rng = mulberry32(ci * 7919 + cj * 104729 + cfg.seed);
        const items = []; // {x,z,y,yaw,sx,sy,r,g,b,phase,flex}
        let minY = Infinity, maxY = -Infinity;

        for (let k = 0; k < cfg.candidates; k++) {
          const x = cx + (rng() - 0.5) * cfg.chunk;
          const z = cz + (rng() - 0.5) * cfg.chunk;
          if (x * x + z * z > GRASS_MAX_R * GRASS_MAX_R) continue;
          // trampled clearing around the hunter camp
          const cdx = x - CAMP.x, cdz = z - CAMP.z;
          if (cdx * cdx + cdz * cdz < 121) continue;

          const tall = terrain.tallGrassDensity(x, z);
          const isTall = tall > 0.3 && rng() < tall * 1.3;
          if (!isTall && rng() > 0.68) continue;
          // worn dirt paths stay bare (tall grass already thinned by terrain)
          if (pathFactor(x, z) > 0.25 + rng() * 0.4) continue;

          const h = terrain.getHeight(x, z);
          if (h > 30) continue; // rocky heights
          const gx = (terrain.getHeight(x + 0.7, z) - h) / 0.7;
          const gz = (terrain.getHeight(x, z + 0.7) - h) / 0.7;
          const slope2 = gx * gx + gz * gz;
          if (slope2 > (isTall ? 0.3 : 0.2)) continue; // steep = bare

          const slopeSink = Math.sqrt(slope2) * 0.12;
          const y = h - 0.05 - slopeSink;
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);

          // large swathes of hue drift so the field isn't one flat color
          const swathe = this._noise.fbm(x * 0.02, z * 0.02, 2) * 0.5 + 0.5;
          let sy, sx, flex;
          if (isTall) {
            sy = (1.0 + rng() * 0.5) * cfg.hMul;
            sx = (1.0 + rng() * 0.55) * cfg.sMul;
            flex = 0.8 + rng() * 0.35;
            // HZD red-gold stealth grass: rust -> luminous orange-gold swathes
            col.setHSL(
              0.03 + swathe * 0.05 + rng() * 0.025,
              0.6 + rng() * 0.15,
              0.42 + swathe * 0.12 + rng() * 0.1,
              THREE.SRGBColorSpace,
            );
          } else {
            sy = (0.45 + rng() * 0.38) * cfg.hMul;
            sx = (0.9 + rng() * 0.5) * cfg.sMul;
            flex = 0.4 + rng() * 0.2;
            // dry green-gold filler
            col.setHSL(
              0.09 + swathe * 0.06 + rng() * 0.03,
              0.38 + rng() * 0.18,
              0.4 + swathe * 0.1 + rng() * 0.1,
              THREE.SRGBColorSpace,
            );
          }
          items.push({
            x: x - cx, z: z - cz, y,
            yaw: rng() * Math.PI * 2,
            sx, sy,
            r: col.r, g: col.g, b: col.b,
            phase: rng() * 6.283, flex,
          });
        }

        if (items.length === 0) continue;
        total += items.length;

        // per-chunk geometry sharing the base vertex buffers
        const geo = new THREE.BufferGeometry();
        geo.setIndex(baseGeo.index);
        geo.setAttribute('position', baseGeo.attributes.position);
        geo.setAttribute('normal', baseGeo.attributes.normal);
        geo.setAttribute('uv', baseGeo.attributes.uv);
        const info = new Float32Array(items.length * 2);
        for (let i = 0; i < items.length; i++) {
          info[i * 2] = items[i].phase;
          info[i * 2 + 1] = items[i].flex;
        }
        geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 2));

        const mesh = new THREE.InstancedMesh(geo, cfg.mat, items.length);
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          pos.set(it.x, it.y, it.z);
          eul.set(0, it.yaw, 0);
          q.setFromEuler(eul);
          scl.set(it.sx, it.sy, it.sx);
          m.compose(pos, q, scl);
          mesh.setMatrixAt(i, m);
          col.setRGB(it.r, it.g, it.b);
          mesh.setColorAt(i, col);
        }

        // bounds: local xz within ±chunk/2, y spans terrain heights + blade tops
        const cy = (minY + maxY) / 2;
        const ry = (maxY - minY) / 2 + 2.2 * cfg.hMul;
        geo.boundingSphere = new THREE.Sphere(
          new THREE.Vector3(0, cy, 0),
          Math.hypot(cfg.chunk * 0.7072, ry),
        );

        mesh.name = `${cfg.namePrefix}-${ci}-${cj}`;
        mesh.position.set(cx, 0, cz);
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.visible = !cfg.cull; // culled tiers start hidden until update()
        this.group.add(mesh);
        if (cfg.cull) this._chunks.push({ mesh, x: cx, z: cz });
      }
    }
    return total;
  }

  _buildGrass() {
    this._grassMat = this._grassMaterial(NEAR_FADE);
    this.grassCount = this._buildGrassTier({
      chunk: CHUNK,
      grid: GRID,
      candidates: CANDIDATES_PER_CHUNK,
      seed: 17,
      geo: this._tuftGeometry({
        blades: 4,
        heights: [0, 0.26, 0.52, 0.78, 1.0],
        halfW: [0.034, 0.030, 0.023, 0.013, 0],
        seed: 1234, spread: 0.27, hBase: 0.72, hVar: 0.42,
      }),
      mat: this._grassMat,
      sMul: 1.14, hMul: 1,
      namePrefix: 'grass-chunk',
      cull: true,
    });
  }

  _buildFarGrass() {
    // sparse far tier: bigger, cheaper tufts carrying the meadow to ~300 m.
    // Few large chunks -> few draws; frustum culling handles visibility.
    this._grassFarMat = this._grassMaterial(FAR_FADE);
    this.farGrassCount = this._buildGrassTier({
      chunk: FAR_CHUNK,
      grid: FAR_GRID,
      candidates: FAR_CANDIDATES,
      seed: 40503,
      geo: this._tuftGeometry({
        blades: 3,
        heights: [0, 0.5, 1.0],
        halfW: [0.06, 0.035, 0],
        seed: 977, spread: 0.42, hBase: 0.95, hVar: 0.6,
      }),
      mat: this._grassFarMat,
      sMul: 1.5, hMul: 1.55,
      namePrefix: 'grass-far',
      cull: false,
    });
  }

  /* -------------------------------- trees -------------------------------- */

  _pineGeometry(seed, height, layers) {
    const rng = mulberry32(seed);
    const noise = new SimplexNoise(seed * 17 + 3);
    const parts = [];
    const paint = (geo, color, jitter) => {
      const n = geo.attributes.position.count;
      const arr = new Float32Array(n * 3);
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        c.copy(color);
        const j = (rng() - 0.5) * jitter;
        c.r = THREE.MathUtils.clamp(c.r + j, 0, 1);
        c.g = THREE.MathUtils.clamp(c.g + j, 0, 1);
        c.b = THREE.MathUtils.clamp(c.b + j * 0.7, 0, 1);
        arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return geo;
    };

    const trunkH = height * 0.24;
    const trunk = new THREE.CylinderGeometry(0.13, 0.32, trunkH * 1.5, 7);
    trunk.translate(0, trunkH * 0.75, 0);
    parts.push(paint(trunk, new THREE.Color('#5c4531'), 0.06));

    const cBase = new THREE.Color('#465c2b');
    const cTop = new THREE.Color('#6d7631'); // sunburnt warmer top
    const tmp = new THREE.Color();
    const canopyStart = trunkH * 1.0;
    const canopySpan = height - canopyStart;
    for (let i = 0; i < layers; i++) {
      const f = i / (layers - 1);
      const r = (height * 0.23) * (1.0 - f * 0.8) * (0.8 + rng() * 0.5) + 0.2;
      const lh = (canopySpan / layers) * 2.7;
      const cone = new THREE.ConeGeometry(r, lh, 12, 2);

      // noise-displace the shell so rims break into irregular branch clumps
      // instead of hard flat rings (apex untouched, rim fully displaced)
      const so = rng() * 37 + seed * 0.7;
      const cp = cone.attributes.position;
      for (let vi = 0; vi < cp.count; vi++) {
        const vx = cp.getX(vi), vy = cp.getY(vi), vz = cp.getZ(vi);
        const rr = Math.hypot(vx, vz);
        const ang = Math.atan2(vz, vx);
        const yf = THREE.MathUtils.clamp(0.5 - vy / lh, 0, 1);
        const n1 = noise.fbm(Math.cos(ang) * 1.3 + so, Math.sin(ang) * 1.3 - so, 2);
        const n2 = noise.noise2D(ang * 2.1 + so, vy * 1.7 + so * 0.6);
        const d = THREE.MathUtils.clamp(1 + (0.36 * n1 + 0.18 * n2) * yf, 0.56, 1.5);
        const yj = noise.noise2D(Math.cos(ang) * 2.2 + so * 1.7, Math.sin(ang) * 2.2 - so)
          * 0.2 * lh * yf;
        cp.setXYZ(vi, vx * d, vy + yj, vz * d);
      }
      cone.computeVertexNormals();

      cone.rotateY(rng() * Math.PI);
      // slight droop tilt per layer
      cone.rotateZ((rng() - 0.5) * 0.06);
      cone.translate(
        (rng() - 0.5) * 0.3,
        canopyStart + canopySpan * f * 0.78 + lh * 0.33,
        (rng() - 0.5) * 0.3,
      );

      // vertex colors: darker toward the trunk, brighter warm branch tips so
      // the shaded side keeps readable foliage detail instead of going black
      tmp.copy(cBase).lerp(cTop, f * (0.55 + rng() * 0.3));
      const n = cp.count;
      const arr = new Float32Array(n * 3);
      const rMax = r * 1.35;
      for (let vi = 0; vi < n; vi++) {
        const rr = Math.hypot(cp.getX(vi), cp.getZ(vi));
        const rim = THREE.MathUtils.clamp(rr / rMax, 0, 1);
        const k = 0.72 + 0.5 * rim + (rng() - 0.5) * 0.09;
        arr[vi * 3] = THREE.MathUtils.clamp(tmp.r * k * 1.06, 0, 1);
        arr[vi * 3 + 1] = THREE.MathUtils.clamp(tmp.g * k, 0, 1);
        arr[vi * 3 + 2] = THREE.MathUtils.clamp(tmp.b * k * 0.9, 0, 1);
      }
      cone.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      parts.push(cone);
    }
    return mergeGeometries(parts);
  }

  _buildTrees() {
    const terrain = this.ctx.terrain;
    const forest = new SimplexNoise(777);
    const variants = [
      this._pineGeometry(11, 8.5, 6),
      this._pineGeometry(23, 11, 7),
      this._pineGeometry(37, 13.5, 8),
      this._pineGeometry(53, 7.2, 5),
      this._pineGeometry(71, 12.2, 7),
    ];
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
      // faint moss-green ambient lift so the shade side isn't near-black
      emissive: '#1a2110',
      emissiveIntensity: 0.7,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this._uTime;
      shader.uniforms.uWindDir = this._uWindDir;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', TREE_VERT_HEAD)
        .replace('#include <begin_vertex>', TREE_VERT_BODY)
        .replace('#include <project_vertex>', PROJECT_NO_INSTANCE)
        .replace('#include <worldpos_vertex>', WORLDPOS_NO_INSTANCE);
    };
    this._treeMat = mat;

    const rng = mulberry32(50421);
    const placed = variants.map(() => []);
    const all = [];
    const TARGET = 500;
    let count = 0;
    for (let a = 0; a < 20000 && count < TARGET; a++) {
      const r = Math.sqrt(THREE.MathUtils.lerp(60 * 60, 330 * 330, rng()));
      const ang = rng() * Math.PI * 2;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;

      if (forest.fbm(x * 0.006, z * 0.006, 3) < 0.06) continue; // clusters only
      const h = terrain.getHeight(x, z);
      if (h > 34) continue; // no pines on high rock
      const gx = (terrain.getHeight(x + 0.9, z) - h) / 0.9;
      const gz = (terrain.getHeight(x, z + 0.9) - h) / 0.9;
      const slope = Math.hypot(gx, gz);
      if (slope > 0.62) continue; // no pines on cliffs
      // prefer hillsides: thin out the flat meadow floor
      if (slope < 0.07 && h < 5 && rng() < 0.75) continue;
      if (Math.hypot(x - CAMP.x, z - CAMP.z) < 16) continue;
      // min spacing so trunks don't intersect
      let crowded = false;
      for (let i = 0; i < all.length; i++) {
        const dx = all[i].x - x, dz = all[i].z - z;
        if (dx * dx + dz * dz < 16) { crowded = true; break; }
      }
      if (crowded) continue;

      const v = Math.min(variants.length - 1, (rng() * variants.length) | 0);
      all.push({ x, z });
      placed[v].push({
        x, z, y: h - 0.18,
        yaw: rng() * Math.PI * 2,
        s: 0.72 + rng() * 0.72,
        tx: (rng() - 0.5) * 0.07, tz: (rng() - 0.5) * 0.07,
        tint: 0.85 + rng() * 0.32,
        warm: rng() * 0.18,
      });
      count++;
    }
    this.treeCount = count;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eul = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();

    for (let v = 0; v < variants.length; v++) {
      const list = placed[v];
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(variants[v], mat, list.length);
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        pos.set(it.x, it.y, it.z);
        eul.set(it.tx, it.yaw, it.tz);
        q.setFromEuler(eul);
        scl.setScalar(it.s);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
        col.setRGB(it.tint + it.warm * 0.5, it.tint, it.tint - it.warm * 0.3);
        mesh.setColorAt(i, col);
      }
      mesh.name = `pines-${v}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // instances span the world
      this.group.add(mesh);
    }
  }

  /* -------------------------------- rocks -------------------------------- */

  _rockGeometry(seed) {
    const rng = mulberry32(seed);
    const n = new SimplexNoise(seed * 31 + 5);
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const p = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const d = 0.68
        + 0.4 * (n.fbm(v.x * 1.2 + seed, v.y * 1.2 - v.z * 0.9, 3) * 0.5 + 0.5)
        + 0.1 * n.noise2D(v.x * 3.5 - v.z * 2.8, v.y * 3.3 + seed);
      v.multiplyScalar(d);
      v.y *= 0.72; // squat boulders
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();

    // strong dirt/ochre soil stain climbing from the buried base so rocks
    // read as bedded into the meadow rather than dropped gray props
    const colors = new Float32Array(p.count * 3);
    const cRock = new THREE.Color('#6e685a');
    const cDirt = new THREE.Color('#6f4e26');
    const tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      tmp.copy(cRock).lerp(cDirt, THREE.MathUtils.clamp(0.72 - y * 1.1, 0, 0.92));
      const j = (rng() - 0.5) * 0.07;
      colors[i * 3] = tmp.r + j; colors[i * 3 + 1] = tmp.g + j; colors[i * 3 + 2] = tmp.b + j;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }

  _buildRocks() {
    const terrain = this.ctx.terrain;
    const variants = [this._rockGeometry(3), this._rockGeometry(8), this._rockGeometry(21)];
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });

    const rng = mulberry32(88771);
    // per variant: [smallRocks, bigRocks] — small rocks skip the shadow pass
    const placed = [[[], []], [[], []], [[], []]];
    const TARGET = 300;
    let count = 0;
    for (let a = 0; a < 6000 && count < TARGET; a++) {
      const r = Math.sqrt(rng()) * 338;
      const ang = rng() * Math.PI * 2;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      const h = terrain.getHeight(x, z);
      if (h > 45) continue;
      const gx = (terrain.getHeight(x + 0.8, z) - h) / 0.8;
      const gz = (terrain.getHeight(x, z + 0.8) - h) / 0.8;
      const slope = Math.hypot(gx, gz);
      if (slope > 0.85) continue;
      // fewer rocks in flat meadow, more on hills
      if (slope < 0.08 && h < 6 && rng() < 0.6) continue;
      if (Math.hypot(x - CAMP.x, z - CAMP.z) < 10) continue;

      const big = rng();
      const s = 0.45 + big * big * 2.3; // mostly small, occasional boulders
      const v = Math.min(2, (rng() * 3) | 0);
      placed[v][s < 1.05 ? 0 : 1].push({
        x, z, y: h - s * 0.4, // sunk deep so they emerge from the soil
        yaw: rng() * Math.PI * 2,
        s, sy: s * (0.85 + rng() * 0.5),
        tx: (rng() - 0.5) * 0.3, tz: (rng() - 0.5) * 0.3,
        tint: 0.74 + rng() * 0.24,
      });
      count++;
    }
    this.rockCount = count;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eul = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();

    for (let v = 0; v < 3; v++) {
      for (let size = 0; size < 2; size++) {
        const list = placed[v][size];
        if (!list.length) continue;
        const mesh = new THREE.InstancedMesh(variants[v], mat, list.length);
        for (let i = 0; i < list.length; i++) {
          const it = list[i];
          pos.set(it.x, it.y, it.z);
          eul.set(it.tx, it.yaw, it.tz);
          q.setFromEuler(eul);
          scl.set(it.s, it.sy, it.s);
          m.compose(pos, q, scl);
          mesh.setMatrixAt(i, m);
          col.setScalar(it.tint);
          mesh.setColorAt(i, col);
        }
        mesh.name = `rocks-${size ? 'big' : 'small'}-${v}`;
        mesh.castShadow = size === 1; // small scatter rocks don't cast
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        this.group.add(mesh);
      }
    }
  }

  /* ------------------------------- runtime ------------------------------- */

  /** Coherent gust strength 0..1 at world (x,z), matches the shader field. */
  windAt(x, z, t = this._uTime.value) {
    const w = this.windDir;
    const g = Math.sin((x * w.x + z * w.y) * 0.06 - t * 1.65)
      + 0.55 * Math.sin((x * -w.y + z * w.x) * 0.021 + t * 0.53)
      + 0.30 * Math.sin(t * 0.95 + x * 0.013);
    return THREE.MathUtils.clamp(g * 0.5 + 0.5, 0, 1);
  }

  update(dt, t) {
    this._uTime.value = t;

    const cam = this.ctx.camera.position;
    const chunks = this._chunks;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const dx = c.x - cam.x, dz = c.z - cam.z;
      c.mesh.visible = dx * dx + dz * dz < CULL_DIST_SQ;
    }

    const p = this.ctx.player; // built after us; lazy lookup
    if (p) this.gustLevel = this.windAt(p.position.x, p.position.z, t);
  }
}
