import * as THREE from 'three';

/**
 * Fire-and-forget GPU particle pool: spawn writes into a ring buffer of
 * per-instance attributes; the vertex shader integrates position from
 * (birth, vel, drag, gravity) so live particles cost zero CPU per frame.
 *
 * Implemented as camera-billboarded instanced quads (not POINTS) because
 * gl_PointSize/gl_PointCoord are unreliable on some ANGLE backends, and
 * quads give true world-space sizes with no point-size clamp.
 */
const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uGravity;
  uniform float uDrag;
  attribute vec3 iPos;
  attribute vec3 iVel;
  attribute vec3 iColor;
  attribute float iBirth;
  attribute float iLife;
  attribute float iSize;
  attribute float iStretch;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    float age = max(uTime - iBirth, 0.0);
    float k = age / iLife;
    vFade = clamp(1.0 - k, 0.0, 1.0);
    // analytic drag integration keeps fast sparks from flying forever
    vec3 p = iPos + iVel * (1.0 - exp(-uDrag * age)) / uDrag;
    p.y -= 0.5 * uGravity * age * age / (1.0 + uDrag * age * 0.6);
    vColor = iColor;
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float s = iSize * (0.55 + 0.45 * vFade) * step(k, 1.0);
    // velocity-aligned elongation in view space -> hot streak sparks
    vec3 vel = iVel * exp(-uDrag * age);
    vel.y -= uGravity * age / (1.0 + uDrag * age * 0.6);
    vec2 vv = (modelViewMatrix * vec4(vel, 0.0)).xy;
    float vl = length(vv);
    vec2 ax = vl > 1e-4 ? vv / vl : vec2(1.0, 0.0);
    vec2 ay = vec2(-ax.y, ax.x);
    float elong = 1.0 + iStretch * min(vl * 0.25, 5.0);
    mv.xy += (ax * (position.x * elong) + ay * position.y) * s;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform float uOpacity;
  uniform float uCore;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    if (vFade <= 0.0) discard;
    vec2 q = vUv * 2.0 - 1.0;
    float d = dot(q, q);
    if (d > 1.0) discard;
    float a = 1.0 - d;
    a *= a;
    // white-hot pinpoint falling off to the tint color (uCore=0 -> flat tint)
    vec3 col = mix(vColor, vec3(1.0, 0.97, 0.86), uCore * pow(1.0 - d, 6.0));
    gl_FragColor = vec4(col, a * vFade * uOpacity);
  }
`;

const _rand = new THREE.Vector3();
const _dir = new THREE.Vector3();

export class ParticlePool {
  constructor(scene, {
    max = 320,
    gravity = 9.8,
    drag = 1.8,
    blending = THREE.AdditiveBlending,
    opacity = 1,
    core = 0,
  } = {}) {
    this.max = max;
    this.cursor = 0;
    this._time = 0;
    this._dirty = false;

    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    geo.instanceCount = max;

    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aBirth = new THREE.InstancedBufferAttribute(new Float32Array(max).fill(-1e4), 1);
    this.aLife = new THREE.InstancedBufferAttribute(new Float32Array(max).fill(1), 1);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.aStretch = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iVel', this.aVel);
    geo.setAttribute('iColor', this.aCol);
    geo.setAttribute('iBirth', this.aBirth);
    geo.setAttribute('iLife', this.aLife);
    geo.setAttribute('iSize', this.aSize);
    geo.setAttribute('iStretch', this.aStretch);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uGravity: { value: gravity },
        uDrag: { value: drag },
        uOpacity: { value: opacity },
        uCore: { value: core },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      blending,
      transparent: true,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.raycast = () => {};
    scene.add(this.mesh);
  }

  emit(x, y, z, vx, vy, vz, r, g, b, size, life, stretch = 0) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.max;
    this.aPos.setXYZ(i, x, y, z);
    this.aVel.setXYZ(i, vx, vy, vz);
    this.aCol.setXYZ(i, r, g, b);
    this.aBirth.setX(i, this._time);
    this.aLife.setX(i, Math.max(0.01, life));
    this.aSize.setX(i, size);
    this.aStretch.setX(i, stretch);
    this._dirty = true;
  }

  /**
   * Cone burst around `normal` at `point`.
   * colors: array of [r,g,b]; speed/size/life/stretch: [min,max] ranges.
   * stretch > 0 elongates the quad along its screen-space velocity (streaks).
   */
  burst(point, normal, {
    count = 12,
    speed = [2, 6],
    spread = 0.8,
    size = [0.08, 0.18],
    life = [0.25, 0.55],
    colors = [[1, 0.8, 0.5]],
    stretch = [0, 0],
  } = {}) {
    for (let i = 0; i < count; i++) {
      _rand.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize().multiplyScalar(spread);
      _dir.copy(normal).add(_rand).normalize();
      const sp = speed[0] + Math.random() * (speed[1] - speed[0]);
      const c = colors[(Math.random() * colors.length) | 0];
      this.emit(
        point.x, point.y, point.z,
        _dir.x * sp, _dir.y * sp, _dir.z * sp,
        c[0], c[1], c[2],
        size[0] + Math.random() * (size[1] - size[0]),
        life[0] + Math.random() * (life[1] - life[0]),
        stretch[0] + Math.random() * (stretch[1] - stretch[0]),
      );
    }
  }

  update(t) {
    this._time = t;
    this.material.uniforms.uTime.value = t;
    if (this._dirty) {
      this.aPos.needsUpdate = true;
      this.aVel.needsUpdate = true;
      this.aCol.needsUpdate = true;
      this.aBirth.needsUpdate = true;
      this.aLife.needsUpdate = true;
      this.aSize.needsUpdate = true;
      this.aStretch.needsUpdate = true;
      this._dirty = false;
    }
  }
}
