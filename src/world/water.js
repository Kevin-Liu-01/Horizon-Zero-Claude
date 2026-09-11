import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { riverCenterX, riverHalfWidth } from './terrain.js';

/**
 * ROUND 4 — lane `world-ground`, finding `world-10` ("static reflection-less
 * puddles"). The channel now carries a real braided stream:
 *
 *   - a continuous RIBBON down the centre of the cut, its surface solved from
 *     the drawn bed so it is always in the water-worn part of the channel and
 *     always below the banks. Where the bed rises (the ford, the gravel bars)
 *     the ribbon pinches shut on its own — that is the braid.
 *   - the deep POOLS the Round-3 build had, kept as data (`water.pools` is the
 *     glinthawk flock's contract and gate V8's anchor) and widened into the
 *     ribbon so they read as slack water rather than separate discs.
 *   - sky reflection taken from `world-light`'s own aerial-perspective colours
 *     (hzcFogHorizon / hzcFogZenith / hzcFogSun), so the water reflects THIS
 *     sky at THIS hour instead of a hard-coded blue.
 *   - refraction: the view ray is bent at the surface and the bed is shaded
 *     through it, with Beer–Lambert extinction by depth. No second render
 *     target — a `Reflector`/`Refractor` pass would double the scene's draw
 *     calls against a 350 budget.
 *   - shore foam that tracks the real waterline, and riffle whitewater wherever
 *     the bed drops fast under the surface.
 *
 * PUBLISHED (world-ground):
 *   water.pools           [{ x, z, level, rx, rz }]   (unchanged contract)
 *   water.levelAt(x, z)   surface height, or null off the water
 *   water.depthAt(x, z)   metres of water, 0 off the water
 *   water.flowAt(x, z, out) unit XZ flow direction (for the wade push / audio)
 *
 * One draw for the whole waterway, one for the reeds. Per-frame cost is a
 * single time uniform.
 */

const SUN_DIR = new THREE.Vector3(-0.55, 0.38, -0.72).normalize();
const Z0 = -238, Z1 = 238, ZSTEP = 2;
const SURFACE_LIFT = 0.32;   // metres of water over the smoothed bed

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

    this._stations = this._solveChannel();
    this.pools = this._findPools();
    this._widenAtPools();
    if (this._stations.length) {
      this._buildWater();
      this._buildReeds();
    }
    ctx.scene.add(this.group);
  }

  /* ------------------------------ the solve ------------------------------ */

  /**
   * March the channel and solve, per 2 m station: centre, bed floor, water
   * surface and the two waterline banks. This is the single source of truth
   * for the mesh, `depthAt`, the foam band and the reed line.
   */
  _solveChannel() {
    const terrain = this.ctx.terrain;
    const gy = (x, z) => (terrain.heightFast ? terrain.heightFast(x, z) : terrain.getHeight(x, z));
    const raw = [];
    for (let z = Z0; z <= Z1; z += ZSTEP) {
      const cx = riverCenterX(z);
      const hw = riverHalfWidth(z);
      if (Math.hypot(cx, z) > 262) { raw.push(null); continue; }
      // lowest drawn point across the inner half of the cut
      let bed = Infinity, bx = cx;
      for (let t = -0.62; t <= 0.62; t += 0.08) {
        const x = cx + t * hw;
        const y = gy(x, z);
        if (y < bed) { bed = y; bx = x; }
      }
      raw.push({ z, cx: bx, hw, bed });
    }

    // smooth the bed profile over ±12 m so the surface is a water table, not a
    // copy of every pebble in the heightfield
    const W = 6;
    const st = [];
    for (let i = 0; i < raw.length; i++) {
      const r = raw[i];
      if (!r) continue;
      let sum = 0, n = 0;
      for (let k = -W; k <= W; k++) {
        const q = raw[i + k];
        if (!q) continue;
        const wgt = 1 - Math.abs(k) / (W + 1);
        sum += q.bed * wgt; n += wgt;
      }
      const level = sum / n + SURFACE_LIFT;
      st.push({ z: r.z, cx: r.cx, hw: r.hw, bed: r.bed, level, wl: 0, wr: 0, extra: 0 });
    }

    // waterline: march out from the centre until the ground breaks the surface
    for (const s of st) {
      const solve = (dir) => {
        const lim = s.hw * 1.18;
        let d = 0;
        for (let t = 0.25; t <= lim; t += 0.25) {
          if (gy(s.cx + dir * t, s.z) > s.level) break;
          d = t;
        }
        return d;
      };
      s.wl = solve(-1);
      s.wr = solve(1);
    }
    // downstream direction (for flow scroll + riffles): whichever end is higher
    const first = st[0], last = st[st.length - 1];
    this._flowSign = (first && last && first.level > last.level) ? 1 : -1;
    return st;
  }

  /**
   * The deepest slack reaches. Same contract the Round-3 build published: the
   * glinthawk flock circles `pools[0..1]` and gate V8 frames `pools[0]`.
   */
  _findPools() {
    const st = this._stations;
    if (!st.length) return [];
    const scored = st
      .map((s, i) => ({ i, s, depth: s.level - s.bed }))
      .filter((e) => Math.hypot(e.s.cx, e.s.z) < 244);
    scored.sort((a, b) => b.depth - a.depth);
    const pools = [];
    for (const e of scored) {
      if (pools.length >= 5) break;
      if (pools.some((p) => Math.abs(p.z - e.s.z) < 62)) continue;
      pools.push({
        x: e.s.cx, z: e.s.z,
        level: e.s.level,
        rx: Math.max(3.2, e.s.hw * 0.55),
        rz: Math.max(6, e.s.hw * 1.05),
        _i: e.i,
      });
    }
    pools.sort((a, b) => b.z - a.z);
    return pools;
  }

  /** Slack water: the ribbon opens out where a pool sits. */
  _widenAtPools() {
    const st = this._stations;
    for (const p of this.pools) {
      const span = Math.max(3, Math.round(p.rz / ZSTEP));
      for (let k = -span; k <= span; k++) {
        const s = st[p._i + k];
        if (!s) continue;
        const f = 1 - Math.abs(k) / (span + 1);
        s.extra = Math.max(s.extra, p.rx * 0.9 * f * f);
      }
    }
  }

  /* ------------------------------ queries -------------------------------- */

  _stationAt(z) {
    const st = this._stations;
    if (!st.length) return null;
    const f = (z - st[0].z) / ZSTEP;
    const i = Math.floor(f);
    if (i < 0 || i >= st.length - 1) return null;
    return { a: st[i], b: st[i + 1], t: f - i };
  }

  /** Surface height at (x,z), or null when the point is not on the water. */
  levelAt(x, z) {
    const e = this._stationAt(z);
    if (!e) return null;
    const { a, b, t } = e;
    const cx = a.cx + (b.cx - a.cx) * t;
    const level = a.level + (b.level - a.level) * t;
    const d = x - cx;
    const wl = (a.wl + a.extra) + ((b.wl + b.extra) - (a.wl + a.extra)) * t;
    const wr = (a.wr + a.extra) + ((b.wr + b.extra) - (a.wr + a.extra)) * t;
    if (d < -wl || d > wr) return null;
    return level;
  }

  /** Metres of standing water at (x,z); 0 on dry ground. */
  depthAt(x, z) {
    const level = this.levelAt(x, z);
    if (level === null) return 0;
    const terrain = this.ctx.terrain;
    const g = terrain.heightFast ? terrain.heightFast(x, z) : terrain.getHeight(x, z);
    return Math.max(0, level - g);
  }

  /** Unit XZ flow direction — downstream along the channel. */
  flowAt(x, z, out = new THREE.Vector3()) {
    const e = this._stationAt(z);
    if (!e) return out.set(0, 0, 0);
    const { a, b } = e;
    const dz = (b.z - a.z) * this._flowSign;
    const dx = (b.cx - a.cx) * this._flowSign;
    return out.set(dx, 0, dz).normalize();
  }

  /* ------------------------------- the mesh ------------------------------ */

  _buildWater() {
    const st = this._stations;
    const positions = [];
    const uvs = [];
    const info = [];     // x: depth at the vertex, y: distance to the shore
    const index = [];
    // 5 columns across so the ribbon can hug a meander without shearing
    const COLS = 5;
    let arc = 0;
    let prevC = null;
    const rows = [];
    for (let i = 0; i < st.length; i++) {
      const s = st[i];
      const wl = s.wl + s.extra, wr = s.wr + s.extra;
      if (wl + wr < 0.5) { rows.push(null); prevC = null; continue; }
      if (prevC) arc += Math.hypot(s.cx - prevC[0], s.z - prevC[1]);
      prevC = [s.cx, s.z];
      const base = positions.length / 3;
      for (let c = 0; c < COLS; c++) {
        const u = c / (COLS - 1);              // 0..1 across
        const off = -wl + (wl + wr) * u;
        const x = s.cx + off;
        positions.push(x, s.level, s.z);
        uvs.push(u, arc * 0.25);
        const shore = Math.min(off + wl, wr - off) / Math.max(0.6, (wl + wr) * 0.5);
        info.push(Math.max(0.02, s.level - s.bed), Math.min(1, shore));
      }
      rows.push(base);
    }
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1];
      if (a === null || b === null) continue;
      for (let c = 0; c < COLS - 1; c++) {
        index.push(a + c, b + c, a + c + 1, a + c + 1, b + c, b + c + 1);
      }
    }
    if (!index.length) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(info), 2));
    geo.setIndex(index);
    geo.computeVertexNormals();

    this._waterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      // fog:true makes three's refreshFogUniforms write fogColor/fogDensity
      // (FogExp2) or fogNear/fogFar (Fog) into these uniforms every frame —
      // without UniformsLib.fog merged in, that read of `.value` on undefined
      // threw inside Engine.render and black-screened the whole game.
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 },
        uSunDir: { value: SUN_DIR.clone() },
        uFlow: { value: new THREE.Vector2(0, this._flowSign) },
        uDeep: { value: new THREE.Color('#16241d') },
        uSilt: { value: new THREE.Color('#6f6248') },
        uSky: { value: new THREE.Color('#7d97a0') },
        uWarm: { value: new THREE.Color('#d9b384') },
      }]),
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        varying vec3 vWPos;
        varying vec2 vUv;
        varying vec2 vInfo;
        attribute vec2 aInfo;
        void main() {
          vUv = uv;
          vInfo = aInfo;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWPos = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        varying vec3 vWPos;
        varying vec2 vUv;
        varying vec2 vInfo;
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform vec2 uFlow;
        uniform vec3 uDeep;
        uniform vec3 uSilt;
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
          float depth = vInfo.x;
          float shore = vInfo.y;

          // --- surface: two ripple fields advected DOWNSTREAM ---------------
          vec2 fl = normalize(uFlow + vec2(1e-4));
          vec2 p1 = vWPos.xz * 1.9  - fl * uTime * 0.9;
          vec2 p2 = vWPos.xz * 4.6  - fl * uTime * 1.7 + 11.0;
          vec2 p3 = vWPos.xz * 0.55 - fl * uTime * 0.25;
          float w1 = noise(p1), w2 = noise(p2), w3 = noise(p3);
          float chop = 0.35 + 0.65 * smoothstep(0.05, 0.9, depth);
          vec3 n = normalize(vec3(
            ((w1 - 0.5) * 0.55 + (w2 - 0.5) * 0.40 + (w3 - 0.5) * 0.22) * chop,
            1.0,
            ((w2 - 0.5) * 0.52 - (w1 - 0.5) * 0.30 + (w3 - 0.5) * 0.18) * chop
          ));

          vec3 view = normalize(cameraPosition - vWPos);
          float fres = pow(1.0 - max(dot(view, n), 0.0), 4.0);
          fres = clamp(0.03 + 0.97 * fres, 0.0, 1.0);

          // --- refraction: bend the ray, shade the bed through it -----------
          vec3 rdir = refract(-view, n, 0.75);
          vec2 bedUv = vWPos.xz + rdir.xz * depth * 1.35;
          float peb = noise(bedUv * 2.4) * 0.6 + noise(bedUv * 7.5) * 0.4;
          vec3 bed = uSilt * (0.45 + 0.85 * peb);
          // caustic banding on the bed where the surface focuses light
          float caus = smoothstep(0.55, 1.0, noise(bedUv * 3.1 - fl * uTime * 0.6)
                                            + noise(bedUv * 5.7 + fl * uTime * 0.4) * 0.6);
          bed += vec3(0.9, 0.85, 0.6) * caus * 0.22 * (1.0 - smoothstep(0.2, 1.1, depth));
          // Beer-Lambert extinction: red dies first, so shallow reads sandy and
          // deep reads bottle-green
          vec3 ext = exp(-vec3(2.6, 1.25, 1.7) * depth * 1.7);
          vec3 through = mix(uDeep, bed, ext);

          // --- sky reflection, taken from world-light's aerial colours -------
          vec3 rv = reflect(-view, n);
          vec3 sky = uSky;
          vec3 warm = uWarm;
          #ifdef USE_FOG
            float up = clamp(rv.y * 1.8 + 0.08, 0.0, 1.0);
            sky = mix(hzcFogHorizon, hzcFogZenith, up * up);
            warm = hzcFogSun;
            float sd = max(dot(rv, hzcSunDir), 0.0);
            sky += warm * pow(sd, 6.0) * 0.55;
          #endif
          vec3 col = mix(through, sky, fres);

          // --- sun glint -----------------------------------------------------
          vec3 sdir = uSunDir;
          #ifdef USE_FOG
            sdir = hzcSunDir;
          #endif
          vec3 hv = normalize(view + normalize(sdir));
          float spec = pow(max(dot(n, hv), 0.0), 220.0);
          col += vec3(1.0, 0.82, 0.55) * spec * 2.1;

          // --- riffles + shore foam ------------------------------------------
          float riffle = smoothstep(0.24, 0.0, depth)
            * smoothstep(0.45, 0.85, noise(vWPos.xz * 3.4 - fl * uTime * 2.2));
          float lace = smoothstep(0.55, 1.0,
            noise(vWPos.xz * 6.0 - fl * uTime * 1.4) * 0.6 + noise(vWPos.xz * 13.0 + uTime * 0.7) * 0.4);
          /* "shore" is 0 at the waterline and 1 mid-channel, so a foam band of
           * "shore < 0.42" is the outer 42 % of EACH bank — 84 % of a 26 m
           * channel under lace. Filmed from the bank the river read as a solid
           * milky sheet with no water in it. A real foam line is a metre or so
           * of the margin: 0.20, and the whitening pulled back so the
           * Beer-Lambert body and the sky reflection survive underneath it. */
          float foam = (1.0 - smoothstep(0.03, 0.20, shore)) * lace;
          float white = clamp(riffle * 0.85 + foam * 0.95, 0.0, 1.0);
          col = mix(col, vec3(0.93, 0.95, 0.94), white * 0.62);

          float a = clamp(0.34 + fres * 0.62 + white * 0.6 + smoothstep(0.0, 0.5, depth) * 0.35, 0.0, 0.97);
          a *= smoothstep(0.0, 0.10, shore);
          gl_FragColor = vec4(col, a);
          #include <fog_fragment>
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, this._waterMat);
    mesh.name = 'river-ribbon';
    mesh.renderOrder = 1;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.mesh = mesh;
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
    const gy = (x, z) => (terrain.heightFast ? terrain.heightFast(x, z) : terrain.getHeight(x, z));
    const rng = mulberry32(90210);
    const geo = this._reedGeometry();
    const items = [];
    // reeds line the whole waterway now, thickest in the slack pools
    for (let i = 0; i < this._stations.length; i += 2) {
      const s = this._stations[i];
      const wl = s.wl + s.extra, wr = s.wr + s.extra;
      if (wl + wr < 1.2) continue;
      const density = 0.55 + (s.extra > 0.5 ? 0.9 : 0);
      const n = Math.round(density * (1 + rng() * 2));
      for (let k = 0; k < n; k++) {
        const side = rng() < 0.5 ? -1 : 1;
        const w = side < 0 ? wl : wr;
        const off = side * w * (0.72 + rng() * 0.5);
        const x = s.cx + off;
        const z = s.z + (rng() - 0.5) * 2;
        const h = gy(x, z);
        if (h < s.level - 0.45 || h > s.level + 0.85) continue;
        items.push({
          x, z, y: Math.min(h, s.level) - 0.04,
          s: 0.75 + rng() * 0.55, yaw: rng() * Math.PI * 2,
        });
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
    this.reedCount = items.length;
  }

  update(dt, t) {
    if (this._waterMat) this._waterMat.uniforms.uTime.value = t;
    if (this._uTime) this._uTime.value = t;
  }
}
