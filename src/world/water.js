import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WORLD_SIZE, riverCenterX, riverHalfWidth } from './terrain.js';

/**
 * Standing water for the dried river: a few shallow pools left in the deepest
 * cuts of the channel, with a cheap animated shader (scrolling normal
 * perturbation + fresnel + sun glint + soft radial edge fade) and rings of
 * reeds/cattails hugging the pool shores.
 *
 * All pools merge into ONE mesh (one draw); reeds are one InstancedMesh.
 * Per-frame cost: a single time uniform.
 */

const SUN_DIR = new THREE.Vector3(-0.55, 0.38, -0.72).normalize();

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RiverWater {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'river-water';

    this.pools = this._findPools();
    if (this.pools.length) {
      this._buildWater();
      this._buildReeds();
    }
    ctx.scene.add(this.group);
  }

  /**
   * Walk the channel centerline and keep the lowest local minima of the bed —
   * the spots where a real river would leave standing water.
   */
  _findPools() {
    const terrain = this.ctx.terrain;
    const samples = [];
    for (let z = -232; z <= 232; z += 2) {
      const x = riverCenterX(z);
      if (Math.hypot(x, z) > 244) continue; // stay where the channel is fully cut
      samples.push({ x, z, y: terrain.getHeight(x, z), hw: riverHalfWidth(z) });
    }
    // local minima with a ±9-sample (18 m) window
    const minima = [];
    for (let i = 9; i < samples.length - 9; i++) {
      let ok = true;
      for (let k = -9; k <= 9 && ok; k++) {
        if (samples[i + k].y < samples[i].y) ok = false;
      }
      if (ok) minima.push(samples[i]);
    }
    minima.sort((a, b) => a.y - b.y);

    // The rendered terrain interpolates linearly between grid vertices
    // (972 m / 500 segs ≈ 1.94 m spacing), so the DRAWN floor of a narrow
    // cut sits above the analytic minimum. Anchor each pool on the lowest
    // actual mesh NODE nearby so the surface is guaranteed to break ground.
    const size = WORLD_SIZE * 1.35;
    const step = size / 500;
    const snap = (v) => Math.round((v + size / 2) / step) * step - size / 2;
    const pools = [];
    for (const m of minima) {
      if (pools.length >= 5) break;
      if (pools.some((p) => Math.abs(p.z - m.z) < 62)) continue;
      let bx = snap(m.x), bz = snap(m.z), by = Infinity;
      for (let iz = -2; iz <= 2; iz++) {
        for (let ix = -2; ix <= 2; ix++) {
          const nx = snap(m.x) + ix * step, nz = snap(m.z) + iz * step;
          const ny = terrain.getHeight(nx, nz);
          if (ny < by) { by = ny; bx = nx; bz = nz; }
        }
      }
      pools.push({
        x: bx, z: bz,
        level: by + 0.3,
        rx: m.hw * 0.5,
        rz: m.hw * 1.05,
      });
    }
    return pools;
  }

  _buildWater() {
    const geos = [];
    for (const p of this.pools) {
      const g = new THREE.CircleGeometry(1, 28);
      g.rotateX(-Math.PI / 2);
      g.scale(p.rx, 1, p.rz);
      g.translate(p.x, p.level, p.z);
      geos.push(g);
    }
    const geo = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();

    this._waterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: SUN_DIR },
        uDeep: { value: new THREE.Color('#1c2a22') },
        uSky: { value: new THREE.Color('#7d97a0') },
        uWarm: { value: new THREE.Color('#d9b384') },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWPos;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vWPos;
        varying vec2 vUv;
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform vec3 uDeep;
        uniform vec3 uSky;
        uniform vec3 uWarm;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){
          vec2 i=floor(p), f=fract(p);
          f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                     mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
        }

        void main() {
          // scrolling ripple field -> perturbed surface normal
          vec2 p1 = vWPos.xz * 1.35 + uTime * vec2(0.052, 0.031);
          vec2 p2 = vWPos.xz * 2.9  - uTime * vec2(0.037, 0.058);
          float w1 = noise(p1), w2 = noise(p2);
          vec3 n = normalize(vec3(
            (w1 - 0.5) * 0.42 + (w2 - 0.5) * 0.26,
            1.0,
            (w2 - 0.5) * 0.40 - (w1 - 0.5) * 0.22
          ));

          vec3 view = normalize(cameraPosition - vWPos);
          float fres = pow(1.0 - max(dot(view, n), 0.0), 3.0);

          // sky reflection warms toward the sun's bearing; keep the body
          // dark tea-green so pools read as standing water, not spilled milk
          vec3 refl = mix(uSky, uWarm, 0.3 + 0.4 * fres);
          vec3 col = mix(uDeep, refl, 0.18 + fres * 0.5);

          // sun glint
          vec3 hv = normalize(view + normalize(uSunDir));
          float spec = pow(max(dot(n, hv), 0.0), 130.0);
          col += vec3(1.0, 0.75, 0.45) * spec * 1.5;

          // ripple sparkle (very subtle luma variance)
          col *= 0.96 + 0.08 * w2;

          // soft shoreline: fade alpha toward the ellipse rim
          float radial = length(vUv - 0.5) * 2.0;
          float a = (1.0 - smoothstep(0.6, 0.99, radial)) * 0.93;
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, this._waterMat);
    mesh.name = 'river-pools';
    mesh.renderOrder = 1;
    mesh.receiveShadow = false;
    this.group.add(mesh);
  }

  /* ------------------------------- reeds -------------------------------- */

  _reedGeometry() {
    // a clump: 5 tapered blades + 2 cattail stalks with brown seed heads
    const rng = mulberry32(4451);
    const parts = [];
    const paint = (g, c0, c1) => {
      const pos = g.attributes.position;
      const arr = new Float32Array(pos.count * 3);
      const cA = new THREE.Color(c0), cB = new THREE.Color(c1), t = new THREE.Color();
      // color by height fraction stored in uv.y
      const uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        t.copy(cA).lerp(cB, THREE.MathUtils.clamp(uv.getY(i), 0, 1));
        const j = 1 + (rng() - 0.5) * 0.14;
        arr[i * 3] = t.r * j; arr[i * 3 + 1] = t.g * j; arr[i * 3 + 2] = t.b * j;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return g;
    };

    for (let b = 0; b < 5; b++) {
      const hgt = 0.9 + rng() * 0.7;
      const g = new THREE.PlaneGeometry(0.055, hgt, 1, 3);
      g.translate(0, hgt / 2, 0);
      // taper + slight lean
      const pos = g.attributes.position;
      const uv = g.attributes.uv;
      const lean = (rng() - 0.5) * 0.35;
      for (let i = 0; i < pos.count; i++) {
        const f = pos.getY(i) / hgt;
        uv.setY(i, f);
        pos.setX(i, pos.getX(i) * (1 - f * 0.8) + lean * f * f);
        pos.setZ(i, pos.getZ(i) + lean * 0.4 * f);
      }
      g.rotateY(rng() * Math.PI * 2);
      g.translate((rng() - 0.5) * 0.24, 0, (rng() - 0.5) * 0.24);
      parts.push(paint(g, '#4d5b2a', '#9a9a55'));
    }
    for (let s = 0; s < 2; s++) {
      const hgt = 1.25 + rng() * 0.45;
      const stalk = new THREE.CylinderGeometry(0.011, 0.02, hgt, 5);
      stalk.translate(0, hgt / 2, 0);
      const suv = stalk.attributes.uv;
      const spos = stalk.attributes.position;
      for (let i = 0; i < spos.count; i++) suv.setY(i, spos.getY(i) / hgt);
      const head = new THREE.CapsuleGeometry(0.041, 0.22, 3, 7);
      head.translate(0, hgt - 0.05, 0);
      const huv = head.attributes.uv;
      for (let i = 0; i < huv.count; i++) huv.setY(i, 1);
      const tilt = (rng() - 0.5) * 0.22;
      const ox = (rng() - 0.5) * 0.3, oz = (rng() - 0.5) * 0.3;
      stalk.rotateZ(tilt); stalk.translate(ox, 0, oz);
      head.rotateZ(tilt); head.translate(ox, 0, oz);
      parts.push(paint(stalk, '#5d6435', '#8b8a50'));
      parts.push(paint(head, '#4f3320', '#4f3320'));
    }
    return mergeGeometries(parts, false);
  }

  _buildReeds() {
    const terrain = this.ctx.terrain;
    const rng = mulberry32(90210);
    const geo = this._reedGeometry();
    const items = [];
    for (const p of this.pools) {
      const n = 20 + (rng() * 8 | 0);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng() * 0.5;
        const k = 0.8 + rng() * 0.6;
        const x = p.x + Math.cos(a) * p.rx * k;
        const z = p.z + Math.sin(a) * p.rz * k;
        const h = terrain.getHeight(x, z);
        // shore band only: shin-deep in the water up to just above the level
        if (h < p.level - 0.25 || h > p.level + 0.75) continue;
        items.push({ x, z, y: Math.min(h, p.level) - 0.04, s: 0.75 + rng() * 0.5, yaw: rng() * Math.PI * 2 });
      }
    }
    if (!items.length) { geo.dispose(); return; }

    this._uTime = { value: 0 };
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const uT = this._uTime;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uT;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', /* glsl */ `
          vec3 transformed = ( instanceMatrix * vec4( position, 1.0 ) ).xyz;
          {
            vec3 iOrigin = instanceMatrix[3].xyz;
            float ph = iOrigin.x * 0.83 + iOrigin.z * 0.61;
            float sway = sin(uTime * 1.45 + ph) * 0.55 + sin(uTime * 2.6 + ph * 1.7) * 0.25;
            float hh = uv.y * uv.y;
            transformed.xz += vec2(0.82, 0.57) * sway * 0.075 * hh;
          }
        `)
        .replace('#include <project_vertex>', /* glsl */ `
          vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
          gl_Position = projectionMatrix * mvPosition;
        `)
        .replace('#include <worldpos_vertex>', /* glsl */ `
          vec4 worldPosition = modelMatrix * vec4( transformed, 1.0 );
        `);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\nnormal = normalize( vNormal );',
      );
    };

    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      e.set(0, it.yaw, 0);
      q.setFromEuler(e);
      v.set(it.x, it.y, it.z);
      sc.setScalar(it.s);
      m.compose(v, q, sc);
      mesh.setMatrixAt(i, m);
    }
    mesh.name = 'pool-reeds';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // instances span the channel
    this.group.add(mesh);
  }

  update(dt, t) {
    if (this._waterMat) this._waterMat.uniforms.uTime.value = t;
    if (this._uTime) this._uTime.value = t;
  }
}
