import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { WORLD_HALF, SimplexNoise } from './terrain.js';

/**
 * Golden-hour sky, sun light, fog, clouds. The heart of the HZD look.
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
  }

  _buildRidges() {
    const group = new THREE.Group();
    group.name = 'far-ridges';
    const noise = new SimplexNoise(777);
    const rings = [
      { r: 620, h: 120, color: '#8d8874', opacity: 1 },
      { r: 900, h: 170, color: '#98948a', opacity: 1 },
    ];
    for (const ring of rings) {
      const segs = 160;
      const pos = [];
      const idx = [];
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const x = Math.cos(a) * ring.r, z = Math.sin(a) * ring.r;
        const peak = ring.h * (0.45 + 0.55 * (noise.fbm(Math.cos(a) * 2.3 + ring.r, Math.sin(a) * 2.3, 3) * 0.5 + 0.5));
        pos.push(x, -8, z, x, peak, z);
        if (i < segs) {
          const b = i * 2;
          idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mat = new THREE.MeshBasicMaterial({
        color: ring.color,
        side: THREE.DoubleSide,
        fog: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
    }
    return group;
  }

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
          float h = clamp(d.y, -0.05, 1.0);

          // gradient: warm saturated horizon -> deep blue zenith
          vec3 horizon = vec3(0.96, 0.70, 0.42);
          vec3 mid     = vec3(0.55, 0.66, 0.82);
          vec3 zenith  = vec3(0.16, 0.34, 0.62);
          vec3 col = mix(horizon, mid, smoothstep(0.0, 0.30, h));
          col = mix(col, zenith, smoothstep(0.26, 0.85, h));

          // sun: tight legible disc + restrained saturated glow
          float sunD = max(dot(d, normalize(uSunDir)), 0.0);
          col += vec3(1.0, 0.68, 0.34) * pow(sunD, 1500.0) * 2.2;  // disc
          col += vec3(1.0, 0.55, 0.24) * pow(sunD, 24.0) * 0.20;   // inner glow
          col += vec3(0.9, 0.48, 0.24) * pow(sunD, 5.0) * 0.08;    // wide haze

          // clouds: drifting fbm with real luminance contrast + sunlit edges
          if (d.y > 0.02) {
            vec2 uv = d.xz / (d.y + 0.18);
            vec2 drift = vec2(uTime * 0.006, uTime * 0.002);
            float c = fbm(uv * 1.6 + drift);
            float cover = smoothstep(0.40, 0.70, c) * smoothstep(0.9, 0.22, d.y);
            float shade = fbm(uv * 3.4 + drift * 1.7);
            vec3 lit    = vec3(1.06, 0.92, 0.74);   // sun-warmed tops
            vec3 shadow = vec3(0.52, 0.54, 0.60);   // cool undersides
            vec3 cloudCol = mix(lit, shadow, smoothstep(0.3, 0.75, shade));
            cloudCol += vec3(1.0, 0.6, 0.3) * pow(sunD, 3.0) * 0.25;
            col = mix(col, cloudCol, cover * 0.8);
          }

          gl_FragColor = vec4(min(col, vec3(1.6)), 1.0);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'sky';
    return mesh;
  }

  update(dt, t) {
    this.sky.material.uniforms.uTime.value = t;
    // Shadow frustum follows the player so shadows stay crisp near the action.
    const p = this.ctx.player?.position;
    if (p) {
      this.sun.target.position.set(p.x, p.y, p.z);
      this.sun.position.copy(this.sunDir).multiplyScalar(300).add(this.sun.target.position);
      this.sky.position.set(p.x, 0, p.z);
    }
  }
}
