import * as THREE from 'three';

const PULSE_DUR = 3.0;   // total highlight window (contract: 3s)
const WAVE_SPEED = 130;  // m/s expansion of the scan wall
const WAVE_LIFE = 1.5;   // seconds the wave stays visible

/**
 * Focus scan (Q): an expanding blue scan wall sweeps out from the player and
 * every machine it passes gets an additive purple fresnel shell rendered
 * through terrain (depthTest off) for the rest of the 3s window.
 * Machines may still be the stub manager — everything is read defensively.
 */
export class FocusSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this._time = 0;
    this._origin = new THREE.Vector3();
    this._entries = []; // { machine, mat, meshes[], delay }
    this._v = new THREE.Vector3();

    this._wave = this._buildWave();
    this._wave.visible = false;
    ctx.scene.add(this._wave);

    ctx.input.onDown('KeyQ', () => {
      if (ctx.state === 'playing' || ctx.params?.has('shot')) this.pulse();
    });
  }

  /** Public + used by the screenshot harness: trigger a scan pulse. */
  pulse() {
    if (this.active && this._time < PULSE_DUR - 0.4) return;
    this._teardown();
    this.active = true;
    this._time = 0;
    const p = this.ctx.player;
    if (p) this._origin.copy(p.position);
    this._wave.position.copy(this._origin);
    this._wave.scale.set(2, 1, 2);
    this._wave.visible = true;
    this._buildHighlights();
    this.ctx.events.emit('focus-pulse');
  }

  /* ------------------------------ scan wave -------------------------------- */

  _buildWave() {
    // open cylinder wall, bright at the ground, fading upward
    const geo = new THREE.CylinderGeometry(1, 1, 9, 96, 1, true);
    geo.translate(0, 2.6, 0);
    this._waveMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: {
        uFade: { value: 0 },
        uColor: { value: new THREE.Color('#3fb4e8') },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uFade;
        uniform vec3 uColor;
        void main() {
          float band = pow(1.0 - vUv.y, 3.2);
          gl_FragColor = vec4(uColor * (0.5 + 0.9 * band), band * uFade);
        }`,
    });
    const mesh = new THREE.Mesh(geo, this._waveMat);
    mesh.renderOrder = 9989;
    mesh.frustumCulled = false;
    return mesh;
  }

  /* --------------------------- machine highlights -------------------------- */

  _fresnelMat() {
    // Skinning chunks are no-ops on static meshes; on SkinnedMesh overlays the
    // renderer defines USE_SKINNING automatically so the shell follows bones.
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false, // reads through terrain / occluders
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      fog: false,
      uniforms: {
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color('#8f6fff') },
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <skinning_pars_vertex>
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          #include <skinbase_vertex>
          #include <beginnormal_vertex>
          #include <skinnormal_vertex>
          vec3 transformed = vec3(position);
          #include <skinning_vertex>
          vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
          vN = normalize(normalMatrix * objectNormal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vV;
        uniform float uOpacity;
        uniform vec3 uColor;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
          gl_FragColor = vec4(uColor * (0.4 + 1.1 * f), (0.16 + 0.8 * f) * uOpacity);
        }`,
    });
  }

  _buildHighlights() {
    const list = this.ctx.machines?.list;
    if (!Array.isArray(list)) return;
    for (const m of list) {
      if (!m || m.alive === false || !m.root) continue;
      const mat = this._fresnelMat();
      const meshes = [];
      const sources = [];
      m.root.traverse((o) => {
        if ((o.isMesh || o.isSkinnedMesh) && !o.userData.__focusOverlay) sources.push(o);
      });
      for (const o of sources) {
        let overlay;
        if (o.isSkinnedMesh) {
          overlay = new THREE.SkinnedMesh(o.geometry, mat);
          overlay.bindMode = o.bindMode;
          overlay.bind(o.skeleton, o.bindMatrix);
        } else {
          overlay = new THREE.Mesh(o.geometry, mat);
        }
        overlay.userData.__focusOverlay = true;
        overlay.frustumCulled = false;
        overlay.castShadow = false;
        overlay.receiveShadow = false;
        overlay.renderOrder = 9990;
        overlay.matrixAutoUpdate = false; // identity local: rides its source mesh
        o.add(overlay);
        meshes.push(overlay);
      }
      if (!meshes.length) { mat.dispose(); continue; }
      const pos = m.position ?? m.root.position;
      const dist = this._v.copy(pos).sub(this._origin).length();
      this._entries.push({
        machine: m, mat, meshes,
        delay: Math.min(dist / WAVE_SPEED, 1.6),
        // distant machines get a hotter shell or the additive glow washes
        // out against the bright fog
        boost: 1 + Math.min(2.5, dist / 60),
      });
    }
  }

  _teardown() {
    for (const e of this._entries) {
      for (const mesh of e.meshes) {
        mesh.parent?.remove(mesh);
        mesh.userData.__focusOverlay = false;
      }
      e.mat.dispose();
    }
    this._entries.length = 0;
    this._wave.visible = false;
  }

  /* --------------------------------- frame --------------------------------- */

  update(dt, t) {
    if (!this.active) return;
    this._time += dt;
    const tt = this._time;

    if (tt < WAVE_LIFE) {
      const r = 2 + WAVE_SPEED * tt;
      this._wave.scale.set(r, 1, r);
      this._waveMat.uniforms.uFade.value = 0.42 * Math.max(0, 1 - tt / WAVE_LIFE);
    } else if (this._wave.visible) {
      this._wave.visible = false;
    }

    for (const e of this._entries) {
      const k = tt - e.delay;
      let o = 0;
      if (k > 0) {
        const fadeIn = Math.min(1, k / 0.25);
        const fadeOut = Math.max(0, Math.min(1, (PULSE_DUR - tt) / 0.6));
        const dim = e.machine.alive === false ? 0.3 : 1;
        o = fadeIn * fadeOut * dim * (0.85 + 0.15 * Math.sin(tt * 6));
      }
      e.mat.uniforms.uOpacity.value = o * e.boost;
    }

    if (tt >= PULSE_DUR) {
      this._teardown();
      this.active = false;
    }
  }
}
