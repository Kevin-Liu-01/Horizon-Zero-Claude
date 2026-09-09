import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { WORLD_HALF, SimplexNoise } from './terrain.js';
import { RiverWater } from './water.js';

/**
 * Golden-hour sky, sun light, fog, clouds, god rays, far ridges, bird flocks,
 * drifting pollen, and the dried-river water pools. The heart of the HZD look.
 */
export class Environment {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene } = ctx;

    // --- Fog: warm atmospheric haze (desaturated so distance reads cool, not milky)
    scene.fog = new THREE.FogExp2('#b3a696', 0.0007);

    // --- Neutral env reflections so machine metals never go pitch black
    const pmrem = new THREE.PMREMGenerator(ctx.renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.4;
    pmrem.dispose();

    // --- Sun
    const sunDir = new THREE.Vector3(-0.55, 0.38, -0.72).normalize();
    this.sunDir = sunDir;

    const sun = new THREE.DirectionalLight('#ffd9a3', 3.2);
    sun.position.copy(sunDir).multiplyScalar(300);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near = 50;
    sun.shadow.camera.far = 700;
    const ext = 150;
    sun.shadow.camera.left = -ext;
    sun.shadow.camera.right = ext;
    sun.shadow.camera.top = ext;
    sun.shadow.camera.bottom = -ext;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    // --- Ambient fill: strong warm bounce so backlit subjects don't go black
    const hemi = new THREE.HemisphereLight('#9fc0e2', '#a58a5e', 1.25);
    scene.add(hemi);

    // dim shadowless counter-fill opposite the sun (golden-hour sky bounce)
    const fill = new THREE.DirectionalLight('#ffe7c4', 0.5);
    fill.position.copy(sunDir).multiplyScalar(-220);
    fill.position.y = 140;
    scene.add(fill);
    scene.add(fill.target);
    this.fill = fill;

    // --- Sky dome
    this.sky = this._buildSky();
    scene.add(this.sky);

    // --- Distant ridge silhouettes beyond the playable rim (depth layering)
    this.ridges = this._buildRidges();
    scene.add(this.ridges);

    // --- Life & air
    this.birds = this._buildBirds();
    scene.add(this.birds);
    this.motes = this._buildMotes();
    scene.add(this.motes);

    // --- Standing water in the deepest cuts of the dried river
    this.water = new RiverWater(ctx);
  }

  /* --------------------------- far ridge rings --------------------------- */

  _buildRidges() {
    const group = new THREE.Group();
    group.name = 'far-ridges';
    const noise = new SimplexNoise(777);
    const SS = THREE.MathUtils.smoothstep;
    // three receding rings; colors pre-mixed toward the horizon sky (fog is
    // too thin at this range to do it for us) — farther = lighter/cooler
    const rings = [
      { r: 620, h: 132, base: '#b4a389', haze: '#d3c6b0', snowY: 78, seed: 0.0 },
      { r: 900, h: 188, base: '#c6bba6', haze: '#dcd3c1', snowY: 108, seed: 3.7 },
      { r: 1180, h: 244, base: '#d5cdbc', haze: '#e2dccd', snowY: 138, seed: 7.9 },
    ];
    const cBase = new THREE.Color(), cHaze = new THREE.Color(), cTmp = new THREE.Color();
    const cSnow = new THREE.Color('#e9edf0');
    const cWarm = new THREE.Color('#d8b183');
    const cCool = new THREE.Color('#9aa0b0');
    for (const ring of rings) {
      const segs = 220;
      const pos = [];
      const col = [];
      const idx = [];
      cBase.set(ring.base);
      cHaze.set(ring.haze);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const cs = Math.cos(a), sn = Math.sin(a);
        const x = cs * ring.r, z = sn * ring.r;
        // silhouette: rolling mass + bearing-gated jagged teeth so some spans
        // are sawtooth peaks and others long smooth saddles
        const mass = noise.fbm(cs * 2.3 + ring.r, sn * 2.3, 3) * 0.5 + 0.5;
        const sector = noise.fbm(cs * 1.6 + ring.seed, sn * 1.6 - ring.seed * 2, 2) * 0.5 + 0.5;
        const jag = SS(sector, 0.52, 0.82);
        const teeth = Math.abs(noise.noise2D(cs * (5.5 + 4 * jag) + 9, sn * (5.5 + 4 * jag) - 4));
        const peak = ring.h * (0.34 + 0.52 * mass + 0.38 * teeth * jag);
        const midY = peak * 0.52;

        // aspect: spans facing the low NW sun warm up, opposite spans cool
        const warm = Math.max(0, 0.607 * cs + 0.795 * sn);
        const cool = Math.max(0, -(0.607 * cs + 0.795 * sn));
        cTmp.copy(cBase)
          .lerp(cWarm, warm * 0.38)
          .lerp(cCool, cool * 0.22);

        // irregular snowline on the upper faces
        const snowLine = ring.snowY * (0.82 + 0.36 * (noise.fbm(cs * 2.9 - 7, sn * 2.9 + 2, 2) * 0.5 + 0.5));
        const snowK = SS(peak, snowLine, snowLine * 1.35);

        pos.push(x, -10, z, x, midY, z, x, peak, z);
        // base sinks into valley haze; mid = lit rock; top takes the snow
        col.push(cHaze.r, cHaze.g, cHaze.b);
        col.push(cTmp.r, cTmp.g, cTmp.b);
        const tr = cTmp.clone().lerp(cSnow, snowK * 0.85).multiplyScalar(1 + 0.06 * jag);
        col.push(tr.r, tr.g, tr.b);

        if (i < segs) {
          const b = i * 3;
          idx.push(b, b + 1, b + 3, b + 3, b + 1, b + 4);
          idx.push(b + 1, b + 2, b + 4, b + 4, b + 2, b + 5);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        fog: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
    }
    return group;
  }

  /* ------------------------------ bird flocks ---------------------------- */

  _buildBirds() {
    // Two distant flocks of chevron silhouettes circling on sine paths.
    // One mesh, one draw; all motion in the vertex shader (uTime only).
    const flocks = [
      { c: [-70, 92, 55], r: 78, n: 11, s: 0.9 },
      { c: [140, 120, -170], r: 130, n: 8, s: 1.6 },
    ];
    const pos = [];
    const bird = [];   // phase, radius, speed, flap
    const center = [];
    const idx = [];
    let vb = 0;
    const rand = (() => { let s = 511; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
    for (const f of flocks) {
      for (let b = 0; b < f.n; b++) {
        const phase = rand() * Math.PI * 2;
        const radius = f.r * (0.82 + rand() * 0.4);
        const speed = (0.055 + rand() * 0.03) * (rand() > 0.5 ? 1 : 1) ;
        const flap = 5.5 + rand() * 3.5;
        const sc = f.s * (0.8 + rand() * 0.5);
        // chevron: two swept-back wing triangles
        const wing = [
          [0, 0, 0.30], [-0.95, 0.02, -0.34], [0, 0, -0.10],
          [0, 0, 0.30], [0, 0, -0.10], [0.95, 0.02, -0.34],
        ];
        for (const [wx, wy, wz] of wing) {
          pos.push(wx * sc, wy * sc, wz * sc);
          bird.push(phase, radius, speed, flap);
          center.push(f.c[0], f.c[1], f.c[2]);
        }
        idx.push(vb, vb + 1, vb + 2, vb + 3, vb + 4, vb + 5);
        vb += 6;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aBird', new THREE.Float32BufferAttribute(bird, 4));
    geo.setAttribute('aCenter', new THREE.Float32BufferAttribute(center, 3));
    geo.setIndex(idx);

    this._birdMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec4 aBird;   // phase, radius, speed, flap
        attribute vec3 aCenter;
        uniform float uTime;
        void main() {
          float a = uTime * aBird.z * 6.2832 + aBird.x;
          vec3 c = aCenter + vec3(
            cos(a) * aBird.y,
            sin(uTime * 0.34 + aBird.x * 3.0) * 5.0 + sin(a * 2.0) * 2.2,
            sin(a) * aBird.y * 0.74
          );
          // wing flap: outboard verts beat about the body line
          float flap = sin(uTime * aBird.w + aBird.x * 7.0) * 0.8;
          vec3 local = vec3(position.x, position.y + abs(position.x) * flap, position.z);
          // orient along the travel tangent
          vec2 tng = normalize(vec2(-sin(a), cos(a) * 0.74));
          float yaw = atan(tng.x, tng.y);
          float cy = cos(yaw), sy = sin(yaw);
          vec3 p = vec3(local.x * cy + local.z * sy, local.y, -local.x * sy + local.z * cy);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(c + p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        void main() { gl_FragColor = vec4(0.13, 0.115, 0.10, 1.0); }
      `,
    });
    const mesh = new THREE.Mesh(geo, this._birdMat);
    mesh.name = 'bird-flocks';
    mesh.frustumCulled = false;
    return mesh;
  }

  /* ----------------------------- pollen motes ---------------------------- */

  _buildMotes() {
    // Golden dust drifting in a wrap-around box that follows the player.
    const N = 170;
    const rand = (() => { let s = 977; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (rand() - 0.5) * 24;
      pos[i * 3 + 1] = rand() * 9;
      pos[i * 3 + 2] = (rand() - 0.5) * 24;
      seed[i] = rand();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), 22);

    this._moteMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uFocal: { value: 800 },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime, uFocal;
        varying float vA;
        void main() {
          vec3 drift = vec3(
            uTime * (0.30 + aSeed * 0.25),
            -uTime * (0.045 + aSeed * 0.05),
            uTime * (0.18 + aSeed * 0.16)
          );
          vec3 p = mod(position + drift, vec3(24.0, 9.0, 24.0)) - vec3(12.0, 0.0, 12.0);
          p.x += sin(uTime * 0.9 + aSeed * 40.0) * 0.5;
          p.y += 0.6 + sin(uTime * 1.3 + aSeed * 21.0) * 0.35;
          p.z += cos(uTime * 0.7 + aSeed * 33.0) * 0.5;
          // fade toward the wrap-box walls so respawns never pop
          float edge = (1.0 - smoothstep(7.0, 11.5, length(p.xz))) * (1.0 - smoothstep(6.0, 8.8, p.y));
          vA = edge * (0.25 + 0.75 * fract(aSeed * 7.31));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp((0.028 + aSeed * 0.020) * uFocal / -mv.z, 1.0, 7.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float a = smoothstep(1.0, 0.15, length(uv)) * vA * 0.34;
          gl_FragColor = vec4(vec3(1.0, 0.86, 0.58) * a, a);
        }
      `,
    });
    const pts = new THREE.Points(geo, this._moteMat);
    pts.name = 'pollen-motes';
    pts.frustumCulled = false;
    return pts;
  }

  /* --------------------------------- sky --------------------------------- */

  _buildSky() {
    const geo = new THREE.SphereGeometry(1900, 32, 24);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uSunDir: { value: this.sunDir },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform vec3 uSunDir;
        uniform float uTime;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){
          vec2 i=floor(p), f=fract(p);
          f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                     mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
        }
        float fbm(vec2 p){
          float s=0., a=.5;
          for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.02; a*=.5; }
          return s;
        }

        void main() {
          vec3 d = normalize(vDir);
          vec3 sd = normalize(uSunDir);
          float h = clamp(d.y, -0.05, 1.0);

          // gradient: warm saturated horizon -> deep blue zenith, with the
          // golden-hour glow pooling around the sun's bearing
          vec3 horizon = vec3(0.95, 0.71, 0.44);
          vec3 mid     = vec3(0.56, 0.67, 0.83);
          vec3 zenith  = vec3(0.15, 0.33, 0.61);
          vec2 hz = normalize(d.xz + vec2(1e-5));
          vec2 sz = normalize(sd.xz);
          float az = max(dot(hz, sz), 0.0);
          horizon = mix(horizon, vec3(1.05, 0.60, 0.28), pow(az, 3.0) * 0.8);
          mid = mix(mid, vec3(0.85, 0.66, 0.53), pow(az, 4.0) * 0.5);
          vec3 col = mix(horizon, mid, smoothstep(0.0, 0.30, h));
          col = mix(col, zenith, smoothstep(0.26, 0.85, h));

          float sunD = max(dot(d, sd), 0.0);

          // high cirrus: long combed streaks, faint and warm-lit
          if (d.y > 0.06) {
            vec2 cuv = d.xz / (d.y + 0.42);
            vec2 ruv = vec2(cuv.x * 0.86 - cuv.y * 0.51, cuv.x * 0.51 + cuv.y * 0.86);
            float cir = fbm(vec2(ruv.x * 0.5, ruv.y * 3.2) + vec2(uTime * 0.005, 0.0));
            cir = smoothstep(0.52, 0.85, cir)
                * smoothstep(0.05, 0.28, d.y) * (1.0 - smoothstep(0.5, 0.85, d.y));
            col = mix(col, vec3(0.99, 0.90, 0.80), cir * 0.28);
          }

          // cumulus: domain-warped fbm — fewer, puffier masses. Sunlit rims
          // come from comparing density a step toward the sun.
          float cover = 0.0;
          if (d.y > 0.015) {
            vec2 uv = d.xz / (d.y + 0.18);
            vec2 drift = vec2(uTime * 0.0065, uTime * 0.0022);
            vec2 warp = vec2(fbm(uv * 0.85 + drift * 0.6),
                             fbm(uv * 0.85 + 7.31 - drift * 0.4)) - 0.5;
            vec2 cuv = uv * 1.22 + warp * 0.9 + drift;
            float c = fbm(cuv);
            cover = smoothstep(0.50, 0.75, c) * smoothstep(0.94, 0.18, d.y);
            if (cover > 0.002) {
              float cSun = fbm(cuv + sz * 0.10);
              float rimL  = clamp((c - cSun) * 4.5, 0.0, 1.0);  // thins toward sun = lit edge
              float shade = clamp((cSun - c) * 3.5, 0.0, 1.0);  // thickens toward sun = shadow
              float tex = fbm(cuv * 2.9 + drift * 1.6);
              vec3 lit    = vec3(1.12, 0.95, 0.76);
              vec3 body   = mix(vec3(0.94, 0.90, 0.86), vec3(0.60, 0.62, 0.68),
                                smoothstep(0.32, 0.78, tex));
              vec3 shadowC = vec3(0.45, 0.47, 0.55);
              vec3 cloudCol = mix(body, shadowC, shade * 0.85);
              cloudCol = mix(cloudCol, lit, rimL * 0.9);
              cloudCol += vec3(1.0, 0.62, 0.30) * pow(sunD, 3.0) * (0.28 + 0.55 * rimL);
              col = mix(col, cloudCol, cover * 0.9);
            }
          }

          // god rays: irregular warm spokes radiating from the sun, strongest
          // through the cloud gaps, gone where cover is thick
          {
            vec3 t1 = normalize(cross(sd, vec3(0.0, 1.0, 0.0)));
            vec3 t2 = cross(sd, t1);
            vec2 sp = vec2(dot(d, t1), dot(d, t2));
            float rad = length(sp);
            if (rad < 0.8) {
              vec2 sn2 = sp / max(rad, 1e-4);
              float spoke = noise(sn2 * 2.6 + 5.0) * 0.6 + noise(sn2 * 6.1 - 2.0) * 0.4;
              spoke = smoothstep(0.44, 0.8, spoke);
              float fall = smoothstep(0.78, 0.10, rad) * smoothstep(0.015, 0.10, rad);
              col += vec3(1.0, 0.60, 0.28) * spoke * fall * (1.0 - cover * 0.85) * 0.30;
            }
          }

          // sun: tight legible disc + restrained glow, dimmed behind cloud
          float occl = 1.0 - cover * 0.9;
          col += vec3(1.0, 0.68, 0.34) * pow(sunD, 1500.0) * 2.2 * occl;
          col += vec3(1.0, 0.55, 0.24) * pow(sunD, 24.0) * 0.22 * (0.4 + 0.6 * occl);
          col += vec3(0.9, 0.48, 0.24) * pow(sunD, 5.0) * 0.09;

          gl_FragColor = vec4(min(col, vec3(1.65)), 1.0);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'sky';
    return mesh;
  }

  update(dt, t) {
    this.sky.material.uniforms.uTime.value = t;
    this._birdMat.uniforms.uTime.value = t;
    this._moteMat.uniforms.uTime.value = t;
    this.water.update(dt, t);
    // perspective-correct mote point sizes
    this._moteMat.uniforms.uFocal.value = this.ctx.renderer.domElement.height /
      (2 * Math.tan(THREE.MathUtils.degToRad(this.ctx.camera.fov) / 2));
    // Shadow frustum follows the player so shadows stay crisp near the action.
    const p = this.ctx.player?.position;
    if (p) {
      this.sun.target.position.set(p.x, p.y, p.z);
      this.sun.position.copy(this.sunDir).multiplyScalar(300).add(this.sun.target.position);
      this.sky.position.set(p.x, 0, p.z);
      this.motes.position.set(p.x, p.y, p.z);
    }
  }
}
