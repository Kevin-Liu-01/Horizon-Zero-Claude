import * as THREE from 'three';

/* ---------------- Simplex noise (Stefan Gustavson's public-domain impl) -------- */
const GRAD3 = [
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
];

export class SimplexNoise {
  constructor(seed = 1337) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed >>> 0;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 255; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise2D(xin, yin) {
    const { perm, permMod12 } = this;
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1];
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const g = GRAD3[permMod12[ii + perm[jj]]];
      t0 *= t0;
      n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const g = GRAD3[permMod12[ii + i1 + perm[jj + j1]]];
      t1 *= t1;
      n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const g = GRAD3[permMod12[ii + 1 + perm[jj + 1]]];
      t2 *= t2;
      n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  }

  /** Fractal Brownian motion. */
  fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2D(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}

/* ------------------------------- Terrain --------------------------------- */

export const WORLD_SIZE = 720;         // playable square, meters
export const WORLD_HALF = WORLD_SIZE / 2;

/**
 * Heightfield terrain: analytic height function sampled both by the mesh and
 * by gameplay queries, so they always agree.
 */
export class Terrain {
  constructor(ctx) {
    this.ctx = ctx;
    this.noise = new SimplexNoise(20770228);
    this.grassNoise = new SimplexNoise(41);

    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this._buildMesh();
    ctx.scene.add(this.group);
  }

  /** Analytic terrain height at world (x, z). */
  getHeight(x, z) {
    const n = this.noise;
    // Broad rolling hills
    let h = n.fbm(x * 0.0035, z * 0.0035, 4) * 9;
    // Medium undulation
    h += n.fbm(x * 0.012 + 100, z * 0.012 - 60, 3) * 2.2;
    // Rim mountains: rise sharply outside 78% of world radius
    const r = Math.sqrt(x * x + z * z);
    const rim = THREE.MathUtils.smoothstep(r, WORLD_HALF * 0.78, WORLD_HALF * 1.08);
    h += rim * (46 + n.fbm(x * 0.008 + 31, z * 0.008 + 7, 4) * 22);
    // Gentle valley basin toward the center
    h -= (1 - THREE.MathUtils.smoothstep(r, 0, WORLD_HALF * 0.5)) * 2.5;
    return h;
  }

  getNormal(x, z, out = new THREE.Vector3()) {
    const e = 0.75;
    const hL = this.getHeight(x - e, z), hR = this.getHeight(x + e, z);
    const hD = this.getHeight(x, z - e), hU = this.getHeight(x, z + e);
    out.set(hL - hR, 2 * e, hD - hU).normalize();
    return out;
  }

  /** Density of tall (stealth) grass at a point, 0..1. */
  tallGrassDensity(x, z) {
    const v = this.grassNoise.fbm(x * 0.016, z * 0.016, 2);
    return THREE.MathUtils.smoothstep(v, 0.12, 0.42);
  }

  isInTallGrass(x, z) {
    return this.tallGrassDensity(x, z) > 0.45;
  }

  _buildMesh() {
    const segs = 360;
    const geo = new THREE.PlaneGeometry(WORLD_SIZE * 1.35, WORLD_SIZE * 1.35, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const cGrass = new THREE.Color('#7a8b3f');
    const cDry = new THREE.Color('#a99354');
    const cDirt = new THREE.Color('#6e5a3e');
    const cRock = new THREE.Color('#7d7a72');
    const cSnow = new THREE.Color('#d8d8da');
    const tmp = new THREE.Color();
    const nrm = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.getHeight(x, z);
      pos.setY(i, h);

      this.getNormal(x, z, nrm);
      const slope = 1 - nrm.y; // 0 flat, ->1 steep
      const dryness = this.grassNoise.fbm(x * 0.01 + 9, z * 0.01 - 4, 2) * 0.5 + 0.5;
      const rim = THREE.MathUtils.smoothstep(Math.hypot(x, z), WORLD_HALF * 0.78, WORLD_HALF * 1.02);

      tmp.copy(cGrass).lerp(cDry, dryness * 0.85);
      if (slope > 0.12) tmp.lerp(cDirt, THREE.MathUtils.smoothstep(slope, 0.12, 0.3));
      if (slope > 0.28) tmp.lerp(cRock, THREE.MathUtils.smoothstep(slope, 0.28, 0.5));
      // rim mountains read as rock banding into snowcaps, not khaki lumps
      tmp.lerp(cRock, rim * 0.75);
      if (h > 34) tmp.lerp(cRock, 0.5);
      const snowLine = 40 - rim * 10;
      if (h > snowLine) tmp.lerp(cSnow, THREE.MathUtils.smoothstep(h, snowLine, snowLine + 22));

      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
    });
    // Cheap world-space value-noise breakup so the ground isn't smooth clay.
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <worldpos_vertex>',
          '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWPos;
float thash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float tnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(thash(i),thash(i+vec2(1,0)),f.x),
             mix(thash(i+vec2(0,1)),thash(i+vec2(1,1)),f.x),f.y);
}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  float dn = tnoise(vWPos.xz * 0.9) * 0.6 + tnoise(vWPos.xz * 0.16) * 0.4;
  diffuseColor.rgb *= 0.88 + dn * 0.24;                       // macro mottling
  diffuseColor.rgb *= 0.94 + tnoise(vWPos.xz * 7.0) * 0.12;   // fine grain
}`);
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain-mesh';
    this.group.add(this.mesh);
  }

  update() {}
}
