import * as THREE from 'three';
import { WORLD_HALF } from './terrain.js';

/**
 * Golden-hour sky, sun light, fog, clouds. The heart of the HZD look.
 */
export class Environment {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene } = ctx;

    // --- Fog: warm atmospheric haze
    scene.fog = new THREE.FogExp2('#c9b28a', 0.0016);

    // --- Sun
    const sunDir = new THREE.Vector3(-0.55, 0.38, -0.72).normalize();
    this.sunDir = sunDir;

    const sun = new THREE.DirectionalLight('#ffd9a3', 3.2);
    sun.position.copy(sunDir).multiplyScalar(300);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 50;
    sun.shadow.camera.far = 620;
    const ext = 90;
    sun.shadow.camera.left = -ext;
    sun.shadow.camera.right = ext;
    sun.shadow.camera.top = ext;
    sun.shadow.camera.bottom = -ext;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    // --- Ambient fill
    const hemi = new THREE.HemisphereLight('#a8c4e0', '#8a7351', 0.85);
    scene.add(hemi);

    // --- Sky dome
    this.sky = this._buildSky();
    scene.add(this.sky);
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

          // gradient: warm horizon -> steel blue zenith
          vec3 horizon = vec3(0.98, 0.78, 0.52);
          vec3 mid     = vec3(0.62, 0.71, 0.82);
          vec3 zenith  = vec3(0.25, 0.42, 0.64);
          vec3 col = mix(horizon, mid, smoothstep(0.0, 0.28, h));
          col = mix(col, zenith, smoothstep(0.25, 0.85, h));

          // sun disc + glow
          float sunD = max(dot(d, normalize(uSunDir)), 0.0);
          col += vec3(1.0, 0.72, 0.42) * pow(sunD, 350.0) * 6.0;  // disc
          col += vec3(1.0, 0.62, 0.30) * pow(sunD, 18.0) * 0.55;  // inner glow
          col += vec3(0.9, 0.55, 0.30) * pow(sunD, 4.0) * 0.22;   // wide haze

          // clouds: slow drifting fbm bands
          if (d.y > 0.02) {
            vec2 uv = d.xz / (d.y + 0.18);
            float c = fbm(uv * 1.6 + vec2(uTime * 0.006, uTime * 0.002));
            float cover = smoothstep(0.52, 0.78, c) * smoothstep(0.9, 0.25, d.y);
            vec3 cloudCol = mix(vec3(1.0, 0.9, 0.78), vec3(0.75, 0.72, 0.72), c);
            col = mix(col, cloudCol, cover * 0.65);
          }

          gl_FragColor = vec4(col, 1.0);
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
