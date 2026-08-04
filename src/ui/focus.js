import * as THREE from 'three';

const PULSE_DUR = 3.0;   // total highlight window (contract: 3s)
const WAVE_SPEED = 130;  // m/s expansion of the scan wave
const WAVE_LIFE = 1.5;   // seconds the wave stays visible
const RING_SEGS = 96;    // radial segments of the ground ring
const RING_WIDTH = 3.2;  // meters, trailing band behind the wave front

/**
 * Focus scan (Q): a bright ground-hugging ring sweeps out from the player
 * (vertices sample the terrain heightfield so it rides the hills), backed by
 * a short vertical energy wall. Every machine gets an additive purple fresnel
 * shell rendered through terrain (depthTest off) for the rest of the 3s
 * window, while a fullscreen CSS tint cools/desaturates the scene.
 * Machines may still be the stub manager — everything is read defensively.
 */
export class FocusSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this._time = 0;
    this._origin = new THREE.Vector3();
    this._entries = []; // { machine, mat, meshes[], delay, boost }
    this._v = new THREE.Vector3();

    this._wave = this._buildWave();
    this._wave.visible = false;
    ctx.scene.add(this._wave);

    this._ring = this._buildRing();
    this._ring.visible = false;
    ctx.scene.add(this._ring);

    // Fullscreen cool-tint overlay while the Focus window is open. Lives as
    // the FIRST child of #hud so every HUD element draws above it.
    this._tint = document.createElement('div');
    this._tint.className = 'hzc-focus-tint';
    document.getElementById('hud')?.prepend(this._tint);

    ctx.input.onDown('KeyQ', () => {
      if (ctx.state === 'playing' || ctx.params?.has('shot')) this.pulse();
    });

    // Death ends the scan immediately — no highlights over the death screen.
    ctx.events.on('player-died', () => this.abort());
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
    this._ring.visible = true;
    this._updateRing(2.5);
    this._tint.classList.add('on');
    this._buildHighlights();
    this.ctx.events.emit('focus-pulse');
  }

  /** Cancel the pulse and remove every overlay (used on player death). */
  abort() {
    this._teardown();
    this.active = false;
  }

  /* ------------------------------ scan wave -------------------------------- */

  _buildWave() {
    // open cylinder wall, bright at the ground, fading upward
    const geo = new THREE.CylinderGeometry(1, 1, 6.5, 96, 1, true);
    geo.translate(0, 1.6, 0);
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
          float band = pow(1.0 - vUv.y, 2.6);
          gl_FragColor = vec4(uColor * (0.6 + 1.1 * band), band * uFade);
        }`,
    });
    const mesh = new THREE.Mesh(geo, this._waveMat);
    mesh.renderOrder = 9989;
    mesh.frustumCulled = false;
    return mesh;
  }

  /* --------------------- ground-hugging expanding ring ---------------------- */

  _buildRing() {
    // Annulus strip whose vertices are rewritten in world space every frame,
    // sampling terrain.getHeight so the band drapes over the hills.
    const verts = (RING_SEGS + 1) * 2;
    const pos = new Float32Array(verts * 3);
    const uv = new Float32Array(verts * 2);
    const idx = [];
    for (let i = 0; i <= RING_SEGS; i++) {
      uv[(i * 2) * 2] = i / RING_SEGS;      uv[(i * 2) * 2 + 1] = 0; // inner
      uv[(i * 2 + 1) * 2] = i / RING_SEGS;  uv[(i * 2 + 1) * 2 + 1] = 1; // outer
      if (i < RING_SEGS) {
        const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
        idx.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this._ringPos = geo.getAttribute('position');

    this._ringMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false, // reads over ridgelines so the sweep never vanishes
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
          float k = pow(vUv.y, 2.2); // hot leading edge, soft trailing tail
          vec3 col = mix(uColor, vec3(0.55, 0.9, 1.0), k * 0.4);
          gl_FragColor = vec4(col * (0.3 + 1.1 * k), k * uFade);
        }`,
    });
    const mesh = new THREE.Mesh(geo, this._ringMat);
    mesh.renderOrder = 9988;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false; // vertices are written in world space
    return mesh;
  }

  _updateRing(r) {
    const terrain = this.ctx.terrain;
    const pos = this._ringPos.array;
    const ox = this._origin.x, oz = this._origin.z;
    const rIn = Math.max(0.1, r - RING_WIDTH);
    for (let i = 0; i <= RING_SEGS; i++) {
      const a = (i / RING_SEGS) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      let x = ox + c * rIn, z = oz + s * rIn;
      let j = i * 6;
      pos[j] = x;
      pos[j + 1] = (terrain?.getHeight?.(x, z) ?? this._origin.y) + 0.22;
      pos[j + 2] = z;
      x = ox + c * r; z = oz + s * r;
      j += 3;
      pos[j] = x;
      pos[j + 1] = (terrain?.getHeight?.(x, z) ?? this._origin.y) + 0.22;
      pos[j + 2] = z;
    }
    this._ringPos.needsUpdate = true;
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
        uColor: { value: new THREE.Color('#9d7bff') },
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
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.4);
          gl_FragColor = vec4(uColor * (0.7 + 1.0 * f), (0.55 + 0.45 * f) * uOpacity);
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
      let sources = [];
      m.root.traverse((o) => {
        if ((o.isMesh || o.isSkinnedMesh) && !o.userData.__focusOverlay) sources.push(o);
      });
      // Draw-call budget: shell only the largest parts — the hull carries the
      // glow silhouette; rivets and cables aren't worth a draw call each.
      if (sources.length > 6) {
        for (const o of sources) {
          if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        }
        sources.sort((a, b) =>
          b.geometry.boundingSphere.radius - a.geometry.boundingSphere.radius);
        sources = sources.slice(0, 6);
      }
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
      // Distant machines get a hotter shell or the additive glow washes out
      // against the bright fog. Alpha clamps at 1, so the distance boost has
      // to go into the COLOR too — white-hot core far away, pure purple near.
      const boost = 1 + Math.min(2.5, dist / 45);
      mat.uniforms.uColor.value.multiplyScalar(1 + 0.45 * (boost - 1));
      this._entries.push({
        machine: m, mat, meshes,
        delay: Math.min(dist / WAVE_SPEED, 1.6),
        boost,
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
    this._ring.visible = false;
    this._tint.classList.remove('on');
  }

  /* --------------------------------- frame --------------------------------- */

  update(dt, t) {
    if (!this.active) return;
    this._time += dt;
    const tt = this._time;

    if (tt < WAVE_LIFE) {
      const r = 2 + WAVE_SPEED * tt;
      const fade = Math.max(0, 1 - tt / WAVE_LIFE);
      this._wave.scale.set(r, 1, r);
      this._waveMat.uniforms.uFade.value = 0.55 * fade;
      this._updateRing(r);
      this._ringMat.uniforms.uFade.value = 0.85 * fade;
    } else {
      if (this._wave.visible) this._wave.visible = false;
      if (this._ring.visible) this._ring.visible = false;
    }

    // release the tint slightly early so the CSS fade lands with the window
    if (tt > PULSE_DUR - 0.45) this._tint.classList.remove('on');

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
