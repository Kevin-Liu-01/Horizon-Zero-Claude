import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplexNoise } from './terrain.js';

/**
 * Vegetation: chunked GPU-instanced wind-swaying grass (red-gold stealth
 * patches driven by terrain.tallGrassDensity + green-gold filler), instanced
 * low-poly pines clustered on hillsides, and deformed instanced boulders.
 *
 * Everything is built once at construction; per-frame work is only a time
 * uniform and a distance-visibility flag per grass chunk (no buffer rebuilds,
 * no allocations).
 */

const CHUNK = 48;                 // meters per grass chunk
const GRID = 15;                  // chunks per axis, covers ±360 m
const GRASS_MAX_R = 336;          // no grass beyond playable rim
const CULL_DIST = 170;            // chunk-center cull (blades fade out by 136)
const CULL_DIST_SQ = CULL_DIST * CULL_DIST;
const CANDIDATES_PER_CHUNK = 4200;
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
attribute vec2 aInfo; // x: phase, y: flexibility
varying float vBladeY;
`;

const GRASS_VERT_BODY = /* glsl */ `
vec3 transformed = ( instanceMatrix * vec4( position, 1.0 ) ).xyz;
vBladeY = uv.y;
vec3 iOrigin = instanceMatrix[3].xyz;
vec3 iWorld = ( modelMatrix * vec4( iOrigin, 1.0 ) ).xyz;

// distance fade: blades sink into the ground approaching the cull ring
float dCam = distance( iWorld, cameraPosition );
float fade = 1.0 - smoothstep( 112.0, 136.0, dCam );
transformed.y = mix( iOrigin.y, transformed.y, fade );

// coherent gust field travelling along the wind + slow cross-swell
vec2 wxz = iWorld.xz;
float gust = sin( dot( wxz, uWindDir ) * 0.060 - uTime * 1.65 )
           + 0.55 * sin( dot( wxz, vec2( -uWindDir.y, uWindDir.x ) ) * 0.021 + uTime * 0.53 )
           + 0.30 * sin( uTime * 0.95 + wxz.x * 0.013 );
gust = clamp( gust * 0.5 + 0.5, 0.0, 1.2 );

float hh = uv.y * uv.y; // stiff root, floppy tip
float sway = ( 0.10 + 0.34 * gust * gust ) * aInfo.y;
vec2 bend = uWindDir * sway
          + vec2( -uWindDir.y, uWindDir.x ) * ( sin( uTime * 3.1 + aInfo.x ) * 0.05 * aInfo.y );
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
    this._buildTrees();
    this._buildRocks();
    this.buildMs = performance.now() - t0;
  }

  /* -------------------------------- grass -------------------------------- */

  _tuftGeometry() {
    // 5 blades per tuft, each blade: 3 tapering quads + tip triangle (7 verts).
    const heights = [0, 0.36, 0.68, 1.0];
    const halfW = [0.05, 0.04, 0.024, 0];
    const positions = [];
    const normals = [];
    const uvs = [];
    const index = [];
    const rng = mulberry32(1234);
    const BLADES = 5;

    for (let b = 0; b < BLADES; b++) {
      const yaw = b * (Math.PI * 2 / BLADES) + rng() * 0.8;
      const sy = 0.72 + rng() * 0.42;
      const ox = (rng() - 0.5) * 0.24;
      const oz = (rng() - 0.5) * 0.24;
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
      const base = positions.length / 3;
      // blade normal tilted slightly off vertical so orientation modulates light
      const nx = sinY * 0.2, nz = cosY * 0.2;
      const nl = Math.hypot(nx, 1, nz);

      for (let i = 0; i < 4; i++) {
        const h = heights[i];
        const preBend = 0.17 * h * h; // natural forward arc, splayed outward
        const w = halfW[i];
        const verts = i < 3 ? [-w, w] : [0];
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
      // rows: (0,1) (2,3) (4,5) tip 6
      index.push(
        base, base + 1, base + 2, base + 2, base + 1, base + 3,
        base + 2, base + 3, base + 4, base + 4, base + 3, base + 5,
        base + 4, base + 5, base + 6,
      );
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.setIndex(index);
    return geo;
  }

  _grassMaterial() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this._uTime;
      shader.uniforms.uWindDir = this._uWindDir;
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

  _buildGrass() {
    const terrain = this.ctx.terrain;
    const baseGeo = this._tuftGeometry();
    const mat = this._grassMaterial();
    this._grassMat = mat;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eul = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();

    const half = (GRID * CHUNK) / 2;
    let total = 0;

    for (let ci = 0; ci < GRID; ci++) {
      for (let cj = 0; cj < GRID; cj++) {
        const cx = -half + (ci + 0.5) * CHUNK;
        const cz = -half + (cj + 0.5) * CHUNK;
        const cr = Math.hypot(cx, cz);
        if (cr > GRASS_MAX_R + CHUNK) continue;

        const rng = mulberry32(ci * 7919 + cj * 104729 + 17);
        const items = []; // {x,z,y,yaw,sx,sy,r,g,b,phase,flex}
        let minY = Infinity, maxY = -Infinity;

        for (let k = 0; k < CANDIDATES_PER_CHUNK; k++) {
          const x = cx + (rng() - 0.5) * CHUNK;
          const z = cz + (rng() - 0.5) * CHUNK;
          if (x * x + z * z > GRASS_MAX_R * GRASS_MAX_R) continue;
          // trampled clearing around the hunter camp
          const cdx = x - CAMP.x, cdz = z - CAMP.z;
          if (cdx * cdx + cdz * cdz < 121) continue;

          const tall = terrain.tallGrassDensity(x, z);
          const isTall = tall > 0.3 && rng() < tall * 1.45;
          if (!isTall && rng() > 0.68) continue;

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
            sy = 1.0 + rng() * 0.5;
            sx = 1.0 + rng() * 0.55;
            flex = 0.8 + rng() * 0.35;
            // HZD red-gold stealth grass: rust -> luminous orange-gold swathes
            col.setHSL(
              0.03 + swathe * 0.05 + rng() * 0.025,
              0.6 + rng() * 0.15,
              0.42 + swathe * 0.12 + rng() * 0.1,
              THREE.SRGBColorSpace,
            );
          } else {
            sy = 0.45 + rng() * 0.38;
            sx = 0.9 + rng() * 0.5;
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

        const mesh = new THREE.InstancedMesh(geo, mat, items.length);
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

        // bounds: local xz within ±CHUNK/2, y spans terrain heights + blade tops
        const cy = (minY + maxY) / 2;
        const ry = (maxY - minY) / 2 + 2.2;
        geo.boundingSphere = new THREE.Sphere(
          new THREE.Vector3(0, cy, 0),
          Math.hypot(CHUNK * 0.7072, ry),
        );

        mesh.name = `grass-chunk-${ci}-${cj}`;
        mesh.position.set(cx, 0, cz);
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.visible = false;
        this.group.add(mesh);
        this._chunks.push({ mesh, x: cx, z: cz });
      }
    }
    this.grassCount = total;
  }

  /* -------------------------------- trees -------------------------------- */

  _pineGeometry(seed, height, layers) {
    const rng = mulberry32(seed);
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
      const cone = new THREE.ConeGeometry(r, lh, 8);
      cone.rotateY(rng() * Math.PI);
      // slight droop tilt per layer
      cone.rotateZ((rng() - 0.5) * 0.06);
      cone.translate(
        (rng() - 0.5) * 0.3,
        canopyStart + canopySpan * f * 0.78 + lh * 0.33,
        (rng() - 0.5) * 0.3,
      );
      tmp.copy(cBase).lerp(cTop, f * (0.55 + rng() * 0.3));
      parts.push(paint(cone, tmp, 0.05));
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
    ];
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
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
    const placed = [[], [], []];
    const all = [];
    const TARGET = 320;
    let count = 0;
    for (let a = 0; a < 9000 && count < TARGET; a++) {
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

      const v = Math.min(2, (rng() * 3) | 0);
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

    for (let v = 0; v < 3; v++) {
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

    const colors = new Float32Array(p.count * 3);
    const cRock = new THREE.Color('#8a8478');
    const cDirt = new THREE.Color('#75634a');
    const tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      tmp.copy(cRock).lerp(cDirt, THREE.MathUtils.clamp(0.35 - y * 0.6, 0, 0.7));
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
    const placed = [[], [], []];
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
      placed[v].push({
        x, z, y: h - s * 0.28,
        yaw: rng() * Math.PI * 2,
        s, sy: s * (0.75 + rng() * 0.5),
        tx: (rng() - 0.5) * 0.3, tz: (rng() - 0.5) * 0.3,
        tint: 0.85 + rng() * 0.3,
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
      const list = placed[v];
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
      mesh.name = `rocks-${v}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
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
