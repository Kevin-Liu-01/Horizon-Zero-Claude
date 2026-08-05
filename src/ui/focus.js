import * as THREE from 'three';
import './focus.css';

/**
 * Focus v2 (HZD-accurate): V TOGGLES Focus — no time limit.
 * While on: activation pulse (ground ring + wave), persistent violet
 * through-wall machine silhouettes, cool purple screen tint, YELLOW additive
 * shells on weak/tearable machine.parts (linger 6s after Focus off, canon),
 * glowing ground-hugging patrol path lines with flowing dashes, a Chakra
 * Petch holo info card after 0.4s crosshair dwell (name / LV / elemental
 * weakness glyphs / component count), T tags the crosshair machine with a
 * persistent screen-projected yellow diamond marker (edge-clamped, distance
 * in meters) until that machine dies, and green-cyan glow points over GATHER
 * interactables (pooled, 40 nearest).
 *
 * Cross-builder reads are all defensive: machine.parts / route / kind,
 * ctx.interactables.list, terrain.getHeight may land in any order.
 * Emits: 'focus-on', 'focus-off' (+ legacy 'focus-pulse' on activation).
 * Consumes: 'player-died', 'machine-killed'.
 */

const WAVE_SPEED = 130;  // m/s expansion of the activation scan wave
const WAVE_LIFE = 1.5;   // seconds the activation wave stays visible
const RING_SEGS = 96;
const RING_WIDTH = 3.2;

const PART_LINGER = 6.0;   // canon: component highlight persists ~6s after Focus
const PART_FADE = 1.2;     // tail of the linger window spent fading
const PART_CAP = 40;       // max yellow overlay meshes alive at once
const PART_RANGE = 150;    // only shell parts on machines within this range

const PATH_RANGE = 220;    // patrol lines drawn for machines within this range
const VIOLET_RANGE = 180;  // through-wall silhouettes only within Focus range (canon-ish)
const PATH_STEP = 2.4;     // meters between terrain samples along the line
const PATH_WIDTH = 0.85;   // ribbon width in meters

const GATHER_CAP = 40;     // pooled glow points over GATHER nodes
const GATHER_TICK = 0.25;  // seconds between gather/parts registry polls

const CARD_DWELL = 0.4;    // crosshair-on-machine seconds before the card shows
const CARD_GRACE = 0.35;   // off-target seconds before the card fades

// Canon HZD data (docs/research/machines.md)
const LEVELS = { watcher: 5, redeye: 10, sawtooth: 15, behemoth: 25, thunderjaw: 27 };
const CLASSES = {
  watcher: 'RECON', redeye: 'RECON', sawtooth: 'COMBAT',
  behemoth: 'TRANSPORT', thunderjaw: 'COMBAT',
};
// Elemental weaknesses: sawtooth burns (fire-weak body + chest Blaze canister),
// behemoth's haunch freeze sacs make freeze the intended accelerator,
// thunderjaw carries both blaze + freeze canisters. Watchers have none.
const WEAKNESS = {
  watcher: [], redeye: [],
  sawtooth: ['fire'],
  behemoth: ['freeze'],
  thunderjaw: ['fire', 'freeze'],
};
const RESIST = { behemoth: ['shock'], thunderjaw: ['shock'] };

const GLYPH_SVG = {
  fire: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1.1 4.2-4 6.4-4 10.4a4 4 0 0 0 8 0c0-1.6-.9-2.7-1.3-4.2C17.6 9.8 19 12.2 19 14.8A7 7 0 0 1 5 14.8C5 9.4 10.6 7.3 12 2z"/></svg>',
  freeze: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17M12 2l-2.4 2.4M12 2l2.4 2.4M12 22l-2.4-2.4M12 22l2.4-2.4M3.3 7l3.3.9M3.3 7l.9-3.3M20.7 17l-3.3-.9M20.7 17l-.9 3.3M20.7 7l-.9-3.3M20.7 7l-3.3.9M3.3 17l.9 3.3M3.3 17l3.3-.9"/></svg>',
  shock: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 2 4.5 14h5.2l-1.9 8 9.7-12.6h-5.4L13.5 2z"/></svg>',
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();

let _dotTex = null;
function dotTexture() {
  if (_dotTex) return _dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.7)');
  grad.addColorStop(0.65, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  _dotTex = new THREE.CanvasTexture(c);
  return _dotTex;
}

export class FocusSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.on = false;        // Focus mode toggle state
    this.active = false;    // legacy alias (round-1 consumers) — mirrors .on
    this._waveT = 99;       // time since activation (drives pulse anim)
    this._origin = new THREE.Vector3();

    // violet through-wall shells: Map machine -> { mat, meshes[], delay, boost }
    this._violet = new Map();
    this._violetK = 0;      // master fade 0..1 for the violet layer
    this._violetPoll = 0;

    // yellow part shells: Map part -> { meshes[], machine }
    this._parts = new Map();
    this._partMat = this._yellowMat();
    this._partCount = 0;
    this._offT = Infinity;  // time since Focus turned off (drives linger)
    this._partPoll = 0;

    // patrol path ribbons: Map machine -> { mesh, mat }
    this._paths = new Map();

    // tagged machines: Map machine -> marker element
    this._tags = new Map();

    this._wave = this._buildWave();
    this._wave.visible = false;
    ctx.scene.add(this._wave);
    this._ring = this._buildRing();
    this._ring.visible = false;
    ctx.scene.add(this._ring);

    this._gather = this._buildGatherPoints();
    this._gather.visible = false;
    ctx.scene.add(this._gather);
    this._gatherPoll = 0;

    this._buildDom();

    // card targeting state
    this._target = null;    // machine currently under the crosshair
    this._dwellM = null;
    this._dwellT = 0;
    this._cardM = null;     // machine the card is populated for
    this._graceT = 0;

    // V toggles Focus (Q is the medicine pouch now — owned by player.js)
    ctx.input.onDown('KeyV', () => {
      if (ctx.state === 'playing' || ctx.params?.has('shot')) this.toggle();
    });
    // T tags the machine under the crosshair while Focus is active
    ctx.input.onDown('KeyT', () => {
      if (!(ctx.state === 'playing' || ctx.params?.has('shot'))) return;
      if (this.on) this.tagTarget();
    });

    ctx.events.on('player-died', () => this.abort());
    ctx.events.on('machine-killed', (e) => this._onMachineKilled(e?.machine));
  }

  /* ------------------------------- public API ------------------------------ */

  /** Toggle Focus mode. Pass true/false to force a state. */
  toggle(force) {
    const want = force === undefined ? !this.on : !!force;
    if (want === this.on) return;
    this.on = want;
    this.active = want;
    if (want) this._activate();
    else this._deactivate();
  }

  /** Legacy round-1 surface: a pulse now just switches Focus on. */
  pulse() {
    if (this.on) { this._firePulse(); return; }
    this.toggle(true);
  }

  /** Kill everything instantly (player death) — no overlays over death UI. */
  abort() {
    if (this.on) {
      this.on = false;
      this.active = false;
      this.ctx.events.emit('focus-off');
    }
    this._tint.classList.remove('on');
    this._reticle.classList.remove('on');
    this._hideCard(true);
    this._wave.visible = false;
    this._ring.visible = false;
    this._gather.visible = false;
    this._disposeViolet();
    this._disposeParts();
    this._disposePaths();
    this._offT = Infinity;
  }

  /** Tag/untag the machine under the crosshair (T while Focus on). */
  tagTarget() {
    const m = this._target ?? this._pickTarget();
    if (!m) return;
    if (this._tags.has(m)) {
      this._tags.get(m)?.remove();
      this._tags.delete(m);
      return;
    }
    const el = document.createElement('div');
    el.className = 'hzcf-tag';
    el.innerHTML = '<div class="hzcf-diamond"></div><div class="hzcf-dist"></div>';
    this._layer.appendChild(el);
    this._tags.set(m, el);
    this.ctx.events.emit('machine-tagged', { machine: m });
  }

  /* ------------------------------ on/off flow ------------------------------ */

  _activate() {
    this._offT = Infinity;
    this._firePulse();
    this._tint.classList.add('on');
    this._reticle.classList.add('on');
    this._buildViolet();
    this._buildPaths();
    this._gather.visible = true;
    this._gatherPoll = 0;   // refresh immediately
    this._partPoll = 0;
    this.ctx.events.emit('focus-on');
    this.ctx.events.emit('focus-pulse'); // legacy: round-1 audio hook
  }

  _deactivate() {
    this._offT = 0;         // parts linger from this moment
    this._tint.classList.remove('on');
    this._reticle.classList.remove('on');
    this._hideCard();
    this._wave.visible = false;
    this._ring.visible = false;
    this._gather.visible = false;
    this._disposePaths();
    this.ctx.events.emit('focus-off');
  }

  _firePulse() {
    const p = this.ctx.player;
    if (p?.position) this._origin.copy(p.position);
    this._waveT = 0;
    this._wave.position.copy(this._origin);
    this._wave.scale.set(2, 1, 2);
    this._wave.visible = true;
    this._ring.visible = true;
    this._updateRing(2.5);
  }

  /* ------------------------------- DOM layer ------------------------------- */

  _buildDom() {
    // cool/purple fullscreen tint — first #hud child so HUD text sits above it
    this._tint = document.createElement('div');
    this._tint.className = 'hzcf-tint';
    (document.getElementById('hud') ?? document.body).prepend(this._tint);

    // card + markers live in their own fixed layer UNDER #hud
    this._layer = document.createElement('div');
    this._layer.id = 'hzcf-layer';
    document.body.appendChild(this._layer);

    this._reticle = document.createElement('div');
    this._reticle.className = 'hzcf-reticle';
    this._layer.appendChild(this._reticle);

    this._card = document.createElement('div');
    this._card.className = 'hzcf-card';
    this._layer.appendChild(this._card);
  }

  /* --------------------------- activation wave/ring ------------------------ */

  _buildWave() {
    const geo = new THREE.CylinderGeometry(1, 1, 6.5, 96, 1, true);
    geo.translate(0, 1.6, 0);
    this._waveMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: {
        uFade: { value: 0 },
        uColor: { value: new THREE.Color('#8f7be8') },
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

  _buildRing() {
    const verts = (RING_SEGS + 1) * 2;
    const pos = new Float32Array(verts * 3);
    const uv = new Float32Array(verts * 2);
    const idx = [];
    for (let i = 0; i <= RING_SEGS; i++) {
      uv[(i * 2) * 2] = i / RING_SEGS;      uv[(i * 2) * 2 + 1] = 0;
      uv[(i * 2 + 1) * 2] = i / RING_SEGS;  uv[(i * 2 + 1) * 2 + 1] = 1;
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
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: {
        uFade: { value: 0 },
        uColor: { value: new THREE.Color('#7b5cd6') },
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
          float k = pow(vUv.y, 2.2);
          vec3 col = mix(uColor, vec3(0.75, 0.65, 1.0), k * 0.45);
          gl_FragColor = vec4(col * (0.3 + 1.1 * k), k * uFade);
        }`,
    });
    const mesh = new THREE.Mesh(geo, this._ringMat);
    mesh.renderOrder = 9988;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
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

  /* --------------------- violet through-wall silhouettes ------------------- */

  _fresnelMat(colorHex) {
    // Skinning chunks are no-ops on static meshes; SkinnedMesh overlays get
    // USE_SKINNING from the renderer so the shell follows bones.
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, side: THREE.FrontSide, fog: false,
      uniforms: {
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color(colorHex) },
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

  _overlayFor(src, mat, order) {
    let overlay;
    if (src.isSkinnedMesh) {
      overlay = new THREE.SkinnedMesh(src.geometry, mat);
      overlay.bindMode = src.bindMode;
      overlay.bind(src.skeleton, src.bindMatrix);
    } else {
      overlay = new THREE.Mesh(src.geometry, mat);
    }
    overlay.userData.__focusOverlay = true;
    overlay.raycast = () => {}; // FX shell, not a hitbox — combat rays must hit the real part
    overlay.frustumCulled = false;
    overlay.castShadow = false;
    overlay.receiveShadow = false;
    overlay.renderOrder = order;
    overlay.matrixAutoUpdate = false; // identity local: rides its source mesh
    src.add(overlay);
    return overlay;
  }

  _buildViolet() {
    const list = this.ctx.machines?.list;
    if (!Array.isArray(list)) return;
    const p = this.ctx.player;
    // prune silhouettes on machines that left Focus range (draw-call budget)
    if (p?.position) {
      for (const [m, e] of this._violet) {
        if (m?.position
          && m.position.distanceToSquared(p.position) > (VIOLET_RANGE * 1.2) ** 2) {
          for (const mesh of e.meshes) mesh.parent?.remove(mesh);
          e.mat.dispose();
          this._violet.delete(m);
        }
      }
    }
    for (const m of list) this._addVioletEntry(m);
  }

  _addVioletEntry(m) {
    if (!m || m.alive === false || !m.root || this._violet.has(m)) return;
    const p = this.ctx.player;
    if (p?.position && m.position
      && m.position.distanceToSquared(p.position) > VIOLET_RANGE * VIOLET_RANGE) return;
    const mat = this._fresnelMat('#9d7bff');
    const meshes = [];
    let sources = [];
    m.root.traverse((o) => {
      // skip other overlays AND component add-ons: parts glow YELLOW, and
      // additive violet underneath would wash them out to white
      if ((o.isMesh || o.isSkinnedMesh) && !o.userData.__focusOverlay
        && !o.userData.part) sources.push(o);
    });
    // Draw-call budget: shell only the largest parts — the hull carries the
    // silhouette; rivets/cables aren't worth a draw call each. Far machines
    // read as a blob anyway, so they get fewer shells.
    const pos0 = m.position ?? m.root.position;
    const distNow = p?.position ? Math.hypot(
      pos0.x - p.position.x, pos0.z - p.position.z) : 0;
    const cap = distNow > 70 ? 3 : 6;
    if (sources.length > cap) {
      for (const o of sources) {
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      }
      sources.sort((a, b) =>
        b.geometry.boundingSphere.radius - a.geometry.boundingSphere.radius);
      sources = sources.slice(0, cap);
    }
    for (const o of sources) meshes.push(this._overlayFor(o, mat, 9990));
    if (!meshes.length) { mat.dispose(); return; }
    const pos = m.position ?? m.root.position;
    const dist = _v.copy(pos).sub(this._origin).length();
    // Distant machines need a hotter shell or additive glow washes out in fog.
    const boost = 1 + Math.min(2.5, dist / 45);
    mat.uniforms.uColor.value.multiplyScalar(1 + 0.45 * (boost - 1));
    this._violet.set(m, {
      mat, meshes,
      delay: Math.min(dist / WAVE_SPEED, 1.6),
      boost,
    });
  }

  _disposeViolet() {
    for (const e of this._violet.values()) {
      for (const mesh of e.meshes) mesh.parent?.remove(mesh);
      e.mat.dispose();
    }
    this._violet.clear();
    this._violetK = 0;
  }

  /* ----------------------- yellow component highlights --------------------- */

  _yellowMat() {
    const mat = this._fresnelMat('#ffcf3f');
    // NORMAL blending (not additive): components must read SOLID YELLOW even
    // over the violet hull shell / emissive canisters — additive washes white
    mat.blending = THREE.NormalBlending;
    mat.fragmentShader = /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      uniform float uOpacity;
      uniform vec3 uColor;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.2);
        gl_FragColor = vec4(uColor * (0.85 + 0.65 * f), (0.62 + 0.38 * f) * uOpacity);
      }`;
    return mat;
  }

  /** Poll machine.parts (lands from the machines builder in any order). */
  _refreshParts() {
    const list = this.ctx.machines?.list;
    const p = this.ctx.player;

    // drop shells whose part detached / machine died
    for (const [part, e] of this._parts) {
      if (part?.attached === false || e.machine?.alive === false) {
        for (const mesh of e.meshes) mesh.parent?.remove(mesh);
        this._partCount -= e.meshes.length;
        this._parts.delete(part);
      }
    }
    if (!this.on || !Array.isArray(list)) return;

    for (const m of list) {
      if (!m || m.alive === false) continue;
      const parts = m.parts;
      if (!Array.isArray(parts)) continue;
      if (p?.position && m.position
        && m.position.distanceToSquared(p.position) > PART_RANGE * PART_RANGE) continue;
      for (const part of parts) {
        if (!part || part.attached === false || this._parts.has(part)) continue;
        const tearable = typeof part.tearable === 'boolean'
          ? part.tearable : (part.tearHp ?? 0) > 0;
        if (!part.weak && !tearable) continue;
        const node = part.mesh;
        if (!node) continue;
        if (this._partCount >= PART_CAP) return;
        const meshes = [];
        if (node.isMesh || node.isSkinnedMesh) {
          meshes.push(this._overlayFor(node, this._partMat, 9992));
        } else if (node.traverse) {
          let n = 0;
          node.traverse((o) => {
            if (n >= 3 || !(o.isMesh || o.isSkinnedMesh) || o.userData.__focusOverlay) return;
            meshes.push(this._overlayFor(o, this._partMat, 9992));
            n++;
          });
        }
        if (meshes.length) {
          this._parts.set(part, { meshes, machine: m });
          this._partCount += meshes.length;
        }
      }
    }
  }

  _disposeParts() {
    for (const e of this._parts.values()) {
      for (const mesh of e.meshes) mesh.parent?.remove(mesh);
    }
    this._parts.clear();
    this._partCount = 0;
    this._partMat.uniforms.uOpacity.value = 0;
  }

  /* ----------------------------- patrol path lines ------------------------- */

  _pathMat() {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: {
        uTime: { value: 0 },
        uFade: { value: 0 },
        uColorA: { value: new THREE.Color('#6a5ae0') },
        uColorB: { value: new THREE.Color('#9c8cff') },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv; // uv.x = meters along the loop, uv.y = 0..1 across
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uFade;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        void main() {
          // flowing dashes: ~3.4m cycle marching along the route
          float m = fract(vUv.x / 3.4 - uTime * 0.5);
          float dash = smoothstep(0.52, 0.30, abs(m - 0.42));
          float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
          float soft = across * across;
          vec3 col = mix(uColorA, uColorB, dash) * (0.9 + 2.1 * dash);
          gl_FragColor = vec4(col, (0.22 + 0.78 * dash) * soft * uFade);
        }`,
    });
  }

  _buildPaths() {
    const list = this.ctx.machines?.list;
    if (!Array.isArray(list)) return;
    const terrain = this.ctx.terrain;
    const p = this.ctx.player;
    for (const m of list) {
      if (!m || m.alive === false || this._paths.has(m)) continue;
      const route = m.route;
      if (!Array.isArray(route) || route.length < 2) continue;
      if (p?.position && m.position
        && m.position.distanceToSquared(p.position) > PATH_RANGE * PATH_RANGE) continue;

      // resample the closed waypoint loop at PATH_STEP intervals
      const pts = [];
      let total = 0;
      for (let i = 0; i < route.length; i++) {
        const a = route[i];
        const b = route[(i + 1) % route.length];
        const ax = a?.x ?? 0, az = a?.z ?? 0;
        const bx = b?.x ?? 0, bz = b?.z ?? 0;
        const len = Math.hypot(bx - ax, bz - az);
        const steps = Math.max(1, Math.ceil(len / PATH_STEP));
        for (let s = 0; s < steps; s++) {
          const k = s / steps;
          pts.push({ x: ax + (bx - ax) * k, z: az + (bz - az) * k, d: 0 });
        }
        total += len;
      }
      if (pts.length < 3 || total < 4) continue;
      // cumulative distance for the dash flow
      for (let i = 1; i < pts.length; i++) {
        pts[i].d = pts[i - 1].d
          + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      }

      const n = pts.length + 1; // + closing segment back to pts[0]
      const pos = new Float32Array(n * 2 * 3);
      const uv = new Float32Array(n * 2 * 2);
      const idx = [];
      const hw = PATH_WIDTH / 2;
      for (let i = 0; i < n; i++) {
        const cur = pts[i % pts.length];
        const nxt = pts[(i + 1) % pts.length];
        const prv = pts[(i - 1 + pts.length) % pts.length];
        let dx = nxt.x - prv.x, dz = nxt.z - prv.z;
        const dl = Math.hypot(dx, dz) || 1;
        dx /= dl; dz /= dl;
        const px = -dz, pz = dx; // XZ perpendicular
        const y = (terrain?.getHeight?.(cur.x, cur.z) ?? 0) + 0.18;
        const d = i < pts.length ? cur.d : cur.d + total; // wrap distance
        const j = i * 6;
        pos[j] = cur.x + px * hw;     pos[j + 1] = y; pos[j + 2] = cur.z + pz * hw;
        pos[j + 3] = cur.x - px * hw; pos[j + 4] = y; pos[j + 5] = cur.z - pz * hw;
        const k = i * 4;
        uv[k] = d;     uv[k + 1] = 0;
        uv[k + 2] = d; uv[k + 3] = 1;
        if (i < n - 1) {
          const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, e = i * 2 + 3;
          idx.push(a, b, c, b, e, c);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const mat = this._pathMat();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 9985;
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false; // vertices are world-space
      this.ctx.scene.add(mesh);
      this._paths.set(m, { mesh, mat });
    }
  }

  _disposePaths() {
    for (const e of this._paths.values()) {
      this.ctx.scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mat.dispose();
    }
    this._paths.clear();
  }

  /* ------------------------------ gather glow ------------------------------ */

  _buildGatherPoints() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(GATHER_CAP * 3), 3));
    geo.setDrawRange(0, 0);
    this._gatherMat = new THREE.PointsMaterial({
      map: dotTexture(),
      color: new THREE.Color('#4ec9b0'),
      size: 1.5,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      sizeAttenuation: true,
      toneMapped: false,
    });
    const pts = new THREE.Points(geo, this._gatherMat);
    pts.renderOrder = 9984;
    pts.frustumCulled = false;
    return pts;
  }

  _refreshGather() {
    const list = this.ctx.interactables?.list;
    const geo = this._gather.geometry;
    if (!Array.isArray(list) || !list.length) { geo.setDrawRange(0, 0); return; }
    const p = this.ctx.player;
    const px = p?.position?.x ?? 0, pz = p?.position?.z ?? 0;
    const nodes = [];
    for (const e of list) {
      if (!e || e.consumed || e.label !== 'GATHER') continue;
      const ep = e.position;
      if (!ep || typeof ep.x !== 'number') continue;
      const dx = ep.x - px, dz = (ep.z ?? 0) - pz;
      nodes.push({ e, d2: dx * dx + dz * dz });
    }
    nodes.sort((a, b) => a.d2 - b.d2);
    const n = Math.min(nodes.length, GATHER_CAP);
    const arr = geo.attributes.position.array;
    const terrain = this.ctx.terrain;
    for (let i = 0; i < n; i++) {
      const ep = nodes[i].e.position;
      const gy = terrain?.getHeight?.(ep.x, ep.z ?? 0);
      // trust the node's own y only when it looks intentional (crates etc.);
      // y=0/undefined means "on the ground" — snap to the heightfield
      let y = (typeof ep.y === 'number' && ep.y !== 0) ? ep.y : (gy ?? 0);
      if (gy != null) y = Math.max(y, gy); // never below the terrain
      arr[i * 3] = ep.x;
      arr[i * 3 + 1] = y + 0.55;
      arr[i * 3 + 2] = ep.z ?? 0;
    }
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true;
  }

  /* --------------------------- crosshair targeting ------------------------- */

  _pickTarget() {
    const cam = this.ctx.camera;
    const list = this.ctx.machines?.list;
    if (!cam || !Array.isArray(list)) return null;
    cam.getWorldDirection(_dir);
    let best = null;
    let bestScore = Infinity;
    for (const m of list) {
      if (!m || m.alive === false || !m.position) continue;
      _v.copy(m.position);
      _v.y += (m.height ?? 2.4) * 0.55;
      _v.sub(cam.position);
      const along = _v.dot(_dir);
      if (along < 2 || along > 240) continue;
      const perp = Math.sqrt(Math.max(0, _v.lengthSq() - along * along));
      const r = Math.max(2.4, (m.bodyRadius ?? 1.4) * 2.1, (m.height ?? 2) * 0.75);
      if (perp > r) continue;
      const score = perp / r + along * 0.0012;
      if (score < bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  /* -------------------------------- info card ------------------------------ */

  _cardHTML(m) {
    const kind = m.kind ?? '';
    const name = String(m.displayName ?? kind ?? 'MACHINE').toUpperCase();
    const lv = LEVELS[kind] ?? '?';
    const cls = CLASSES[kind] ?? 'UNKNOWN CLASS';

    // canon weaknesses + any elemental canisters the parts contract exposes
    const weak = new Set(WEAKNESS[kind] ?? []);
    if (Array.isArray(m.parts)) {
      for (const p of m.parts) {
        if (!p || p.attached === false) continue;
        if (p.elemental === 'blaze') weak.add('fire');
        else if (p.elemental === 'freeze') weak.add('freeze');
      }
    }
    const glyphs = [...weak].map((w) =>
      `<span class="hzcf-glyph hzcf-g-${w}" title="${w}">${GLYPH_SVG[w] ?? ''}</span>`
    ).join('') || '<span class="hzcf-g-none">—</span>';

    const resist = (RESIST[kind] ?? []).map((w) =>
      `<span class="hzcf-glyph hzcf-g-${w}">${GLYPH_SVG[w] ?? ''}</span>`
    ).join('');

    const nComp = Array.isArray(m.parts)
      ? m.parts.filter((p) => p && p.attached !== false).length
      : (m.weakPoints?.length ?? 0);

    return `
      <div class="hzcf-card-accent"></div>
      <div class="hzcf-card-head">
        <span class="hzcf-name">${name}</span>
        <span class="hzcf-lv">LV ${lv}</span>
      </div>
      <div class="hzcf-class">${cls}</div>
      <div class="hzcf-div"></div>
      <div class="hzcf-row"><span class="hzcf-lbl">WEAK</span>${glyphs}</div>
      ${resist ? `<div class="hzcf-row"><span class="hzcf-lbl">RESIST</span>${resist}</div>` : ''}
      ${nComp > 0 ? `<div class="hzcf-row hzcf-comp"><span class="hzcf-comp-n">${nComp}</span> COMPONENTS</div>` : ''}
    `;
  }

  _showCard(m) {
    if (this._cardM !== m) {
      this._cardM = m;
      this._card.innerHTML = this._cardHTML(m);
    }
    this._card.classList.add('show');
  }

  _hideCard(instant = false) {
    this._card.classList.remove('show');
    this._cardM = null;
    this._dwellM = null;
    this._dwellT = 0;
    if (instant) this._card.style.opacity = '';
  }

  _updateCard(dt) {
    if (!this.on) { if (this._cardM) this._hideCard(); return; }
    this._target = this._pickTarget();
    const t = this._target;

    if (t) {
      if (this._dwellM === t) this._dwellT += dt;
      else { this._dwellM = t; this._dwellT = 0; }
      this._graceT = 0;
    } else {
      this._graceT += dt;
      if (this._graceT > CARD_GRACE) { this._dwellM = null; this._dwellT = 0; }
    }

    const show = this._dwellM && (this._dwellT >= CARD_DWELL || this._cardM === this._dwellM);
    if (show) {
      this._showCard(this._dwellM);
      // pin the card beside the machine on screen
      const m = this._dwellM;
      const cam = this.ctx.camera;
      _v.copy(m.position);
      _v.y += (m.height ?? 2.4) * 0.8;
      _v.project(cam);
      if (_v.z < 1) {
        const w = window.innerWidth, h = window.innerHeight;
        const sx = (_v.x * 0.5 + 0.5) * w;
        const sy = (-_v.y * 0.5 + 0.5) * h;
        const left = Math.min(Math.max(sx + 46, 12), w - 266);
        const top = Math.min(Math.max(sy - 70, 12), h - 200);
        this._card.style.left = `${left}px`;
        this._card.style.top = `${top}px`;
      }
    } else if (this._cardM && this._graceT > CARD_GRACE) {
      this._hideCard();
    }
  }

  /* -------------------------------- tag markers ---------------------------- */

  _onMachineKilled(m) {
    if (!m) return;
    const el = this._tags.get(m);
    if (el) { el.remove(); this._tags.delete(m); }
    // violet shells dim via alive check; drop its patrol line outright
    const path = this._paths.get(m);
    if (path) {
      this.ctx.scene.remove(path.mesh);
      path.mesh.geometry.dispose();
      path.mat.dispose();
      this._paths.delete(m);
    }
  }

  _updateTags() {
    if (!this._tags.size) return;
    const cam = this.ctx.camera;
    const p = this.ctx.player;
    if (!cam) return;
    const w = window.innerWidth, h = window.innerHeight;
    const mgn = 34;
    for (const [m, el] of this._tags) {
      if (!m || m.alive === false || !m.position) {
        el.remove();
        this._tags.delete(m);
        continue;
      }
      _v.copy(m.position);
      _v.y += (m.height ?? 2.4) + 1.1;
      _v2.copy(_v).sub(cam.position);
      cam.getWorldDirection(_dir);
      const behind = _v2.dot(_dir) < 0;
      _v.project(cam);
      let sx = (_v.x * 0.5 + 0.5) * w;
      let sy = (-_v.y * 0.5 + 0.5) * h;
      if (behind) { sx = w - sx; sy = h - mgn; } // flip + park at bottom edge
      const clamped = behind || sx < mgn || sx > w - mgn || sy < mgn || sy > h - mgn;
      sx = Math.min(Math.max(sx, mgn), w - mgn);
      sy = Math.min(Math.max(sy, mgn), h - mgn);
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
      el.classList.toggle('clamped', clamped);
      const distEl = el.lastElementChild;
      if (distEl && p?.position) {
        distEl.textContent = `${Math.round(m.position.distanceTo(p.position))}m`;
      }
    }
  }

  /* ---------------------------------- frame -------------------------------- */

  update(dt, t) {
    const ctx = this.ctx;
    const inShot = !!ctx.params?.has('shot');
    const live = ctx.state === 'playing' || inShot;
    const domVisible = live || (ctx.state === 'title' && inShot);
    this._layer.style.display = domVisible ? '' : 'none';

    // --- activation pulse (wave + ground ring) ---
    if (this._waveT < WAVE_LIFE) {
      this._waveT += dt;
      const tt = this._waveT;
      if (tt < WAVE_LIFE) {
        const r = 2 + WAVE_SPEED * tt;
        const fade = Math.max(0, 1 - tt / WAVE_LIFE);
        this._wave.scale.set(r, 1, r);
        this._waveMat.uniforms.uFade.value = 0.5 * fade;
        this._updateRing(r);
        this._ringMat.uniforms.uFade.value = 0.85 * fade;
      } else {
        this._wave.visible = false;
        this._ring.visible = false;
      }
    } else if (this._wave.visible) {
      this._wave.visible = false;
      this._ring.visible = false;
    }

    // --- violet through-wall layer ---
    const wantK = this.on ? 1 : 0;
    if (this._violetK !== wantK || this._violet.size) {
      this._violetK = THREE.MathUtils.clamp(
        this._violetK + (wantK ? dt / 0.3 : -dt / 0.35), 0, 1);
      if (this._violetK <= 0 && !this.on) {
        this._disposeViolet();
      } else {
        const pulse = 0.85 + 0.15 * Math.sin(t * 6);
        for (const [m, e] of this._violet) {
          const k = this._waveT - e.delay;
          const fadeIn = k > 0 ? Math.min(1, k / 0.25) : 0;
          const dim = m.alive === false ? 0.28 : 1;
          e.mat.uniforms.uOpacity.value =
            fadeIn * this._violetK * dim * pulse * e.boost;
        }
      }
    }
    if (this.on) {
      this._violetPoll -= dt;
      if (this._violetPoll <= 0) {
        this._violetPoll = 1.0;
        this._buildViolet(); // pick up machines that spawned after activation
        this._buildPaths();  // ... and their patrol routes
      }
    }

    // --- yellow component shells (+ canon 6s linger after Focus off) ---
    this._partPoll -= dt;
    if (this._partPoll <= 0 && (this.on || this._parts.size)) {
      this._partPoll = GATHER_TICK;
      this._refreshParts();
    }
    if (this.on) {
      this._partMat.uniforms.uOpacity.value = 0.92 + 0.08 * Math.sin(t * 5);
    } else if (this._parts.size) {
      this._offT += dt;
      if (this._offT >= PART_LINGER) this._disposeParts();
      else {
        const fade = Math.min(1, (PART_LINGER - this._offT) / PART_FADE);
        this._partMat.uniforms.uOpacity.value = fade * (0.92 + 0.08 * Math.sin(t * 5));
      }
    }

    // --- patrol path flow ---
    if (this._paths.size) {
      for (const [m, e] of this._paths) {
        e.mat.uniforms.uTime.value = t;
        e.mat.uniforms.uFade.value = THREE.MathUtils.clamp(
          e.mat.uniforms.uFade.value + (this.on ? dt / 0.4 : -dt / 0.25), 0, 1);
        e.mesh.visible = e.mat.uniforms.uFade.value > 0.01 && m.alive !== false;
      }
    }

    // --- gather-node glow ---
    if (this.on) {
      this._gatherPoll -= dt;
      if (this._gatherPoll <= 0) {
        this._gatherPoll = GATHER_TICK;
        this._refreshGather();
      }
      this._gatherMat.opacity = 0.55 + 0.22 * Math.sin(t * 3.2);
      this._gatherMat.size = 1.35 + 0.25 * Math.sin(t * 3.2);
    }

    // --- DOM: info card + tag markers ---
    this._updateCard(dt);
    this._updateTags();
  }
}
