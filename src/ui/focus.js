import * as THREE from 'three';
import './focus.css';
import { itemDef, rarityDef } from '../items/items.js';

/**
 * Focus v3 — lane `focus-items` (port 5212). Round 4 closes on this file:
 *   ui-10                      component ROWS with part names + their loot,
 *                              in-world yellow part labels, lighter tint
 *   ui-16 (focus half)         reveals are projected onto the world thing
 *   missing-systems-focus-…    datapoint reveals feeding the Notebook
 *   stealth-focus-path-fidelity splined patrol ribbons, non-route movers
 *                              skipped instead of drawn a loop they ignore
 *   onboarding-loop-loot-feel  LOOT reveals carry the source name + rarity
 *
 * PUBLISHED — `ctx.focus`
 *   on · toggle(force?) · tags (Map machine -> marker el)
 *   scanTarget      -> the machine under the crosshair, or null
 *   components(m)   -> [{ name, weak, tearable, torn, elemental, loot[] }]
 *   audit()         -> one flat object every gate in this lane reads
 * EVENTS  'focus-on' · 'focus-off' · 'focus-pulse' · 'machine-tagged'
 *
 * Focus v2 behaviour (kept): V TOGGLES Focus — no time limit.
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
const PATH_WIDTH = 1.15;   // ribbon width in meters (reads through grass cards)

const GATHER_CAP = 40;     // pooled glow points over GATHER nodes
const GATHER_TICK = 0.25;  // seconds between gather/parts registry polls

const CARD_DWELL = 0.4;    // crosshair-on-machine seconds before the card shows
const CARD_GRACE = 0.35;   // off-target seconds before the card fades

// --- ui-10: in-world component labels -------------------------------------
const LABEL_CAP = 10;      // pooled yellow part labels on screen at once
const LABEL_RANGE = 70;    // only label parts on machines this close
// --- ui-16 / A63: loot + datapoint reveals ---------------------------------
const REVEAL_CAP = 12;     // pooled reveal labels ON SCREEN at once
/**
 * Candidates kept per poll. Round 1 cut this list to REVEAL_CAP by DISTANCE
 * before anything knew what was visible, so a near pickup 80° off-axis burned
 * a slot the player could never see while a farther one in front of them was
 * never considered. Visibility now decides which twelve draw; distance only
 * decides the order they are tried in.
 */
const REVEAL_SRC_CAP = 48;
const REVEAL_RANGE = 85;   // metres Focus reads a lootable / record at
const REVEAL_TICK = 0.2;   // seconds between interactable registry polls

/* --- on-screen placement (round 2) ---------------------------------------
 * A label is only "drawn" if the player can read it. `_updateTags()` clamps
 * its markers to the frame edge because a marker is an arrow to something
 * off screen; a component label or a reveal points AT a thing, so it cannot
 * be clamped without lying — it is skipped instead, and the pool slot goes to
 * the next candidate. These are the box extents the placement solve uses.  */
const VIEW_MARGIN = 8;     // px a label box must reach inside the frame
const VIEW_FRAC = 0.6;     // ...and this much of its width must be inside
const PLABEL_GAP = 10;     // .hzcf-plabel translate(10px) off its anchor
const PLABEL_W = 190;      // widest name + loot chip at 10px/0.14em
const PLABEL_H = 11;       // half-height
const PLABEL_MID = PLABEL_GAP + PLABEL_W * 0.5;  // anchor -> box centre
const REVEAL_HW = 105;     // .hzcf-reveal is centred: half its widest box
const REVEAL_H = 22;       // ...and it sits fully ABOVE its anchor
// --- stealth-focus-path-fidelity ------------------------------------------
const SPLINE_STEP = 1.1;   // metres between Catmull-Rom samples on the ribbon
/**
 * AI states in which a machine is actually walking its route. `machine-ai`
 * publishes patrol · return · suspicious · search · alert · attack · stagger ·
 * downed · overridden · dead; only the first two follow the route, so those
 * are the two that get a ribbon. (`idle`/`graze` are accepted as forward
 * compatibility for a herd state that lane may add.) Everything else is a
 * non-route mover — `stealth-focus-path-fidelity`: drawing it a tidy loop it
 * is not walking is a lie the player will act on.
 */
const ROUTE_STATES = new Set(['patrol', 'return', 'idle', 'graze']);

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
/** Reused projection result — the label loops must not allocate. */
const _screen = { x: 0, y: 0 };

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

/** Nearest-first order for the component-shell budget (see `_refreshParts`). */
const _byFocusD2 = (a, b) => a.__focusD2 - b.__focusD2;

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
    this._pathSamples = 0;   // samples on the most recently splined ribbon
    this._pathWaypoints = 0; // waypoints that ribbon was built from
    this._pathSkipped = 0;   // machines skipped because they left their route
    this.hoverPart = null;   // component name nearest the crosshair (A62)
    this._compCache = { machine: null, t: 0, rows: [] };
    this._cardRect = null;

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

  /** Tagged machines (Map machine -> marker el). HUD reads this to hang
   *  distance labels on tagged-machine compass pips. Read-only. */
  get tags() { return this._tags; }

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

    // ui-10 — pooled in-world component labels (yellow, named). Pooled and
    // reused: no element churn while the scan sweeps across a herd.
    this._labelPool = [];
    for (let i = 0; i < LABEL_CAP; i++) {
      const el = document.createElement('div');
      el.className = 'hzcf-plabel';
      el.innerHTML = '<i class="hzcf-pdot"></i><span class="hzcf-pname"></span>'
        + '<span class="hzcf-ploot"></span>';
      this._layer.appendChild(el);
      this._labelPool.push({
        el, name: el.querySelector('.hzcf-pname'), loot: el.querySelector('.hzcf-ploot'),
      });
    }
    // live rows are REUSED records, never fresh objects: this runs every frame
    this._labelsLive = [];
    this._labelRec = [];
    for (let i = 0; i < LABEL_CAP; i++) {
      this._labelRec.push({ name: '', x: 0, y: 0, loot: 0, weak: false, tearable: false, machine: '', slot: null });
    }
    this._partOrder = [];   // scratch: machines sorted nearest-first per poll
    this._labelSlots = [];
    for (let i = 0; i < LABEL_CAP; i++) this._labelSlots.push({ x: 0, y: 0 });

    // A63 — pooled LOOT / DATAPOINT / GATHER reveals, projected onto the
    // interactable itself (ui-16), never pinned to a screen corner.
    this._revealPool = [];
    for (let i = 0; i < REVEAL_CAP; i++) {
      const el = document.createElement('div');
      el.className = 'hzcf-reveal';
      el.innerHTML = '<i class="hzcf-rmark"></i>'
        + '<span class="hzcf-rkind"></span><span class="hzcf-rname"></span>';
      this._layer.appendChild(el);
      this._revealPool.push({
        el, kind: el.querySelector('.hzcf-rkind'), name: el.querySelector('.hzcf-rname'),
      });
    }
    this._revealsLive = [];
    this._revealRec = [];
    for (let i = 0; i < REVEAL_CAP; i++) {
      this._revealRec.push({ kind: '', name: '', rarity: '', x: 0, y: 0, dist: 0 });
    }
    // de-overlap seats: reveals must not stack on each other OR on a part
    // label, so the seat list is seeded with the labels placed this frame.
    this._revealSlots = [];
    for (let i = 0; i < REVEAL_CAP + LABEL_CAP; i++) this._revealSlots.push({ x: 0, y: 0 });
    this._revealSrc = [];   // polled candidate entries (rebuilt on REVEAL_TICK)
    this._revealPoll = 0;
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
        uColor: { value: new THREE.Color('#7b5cff') }, // reference pulse hex
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
          float band = pow(max(0.0, 1.0 - vUv.y), 3.8);
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
        uColor: { value: new THREE.Color('#7b5cff') },
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
          // reference pulse gradient: #7B5CFF base -> #4AC8FF at the crest
          float k = pow(max(0.0, vUv.y), 2.2);
          vec3 col = mix(uColor, vec3(0.29, 0.784, 1.0), k * 0.6);
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
      // NORMAL, not additive. Up to 6 shells stack on one machine and the
      // Wave-0 bloom pass smears whatever they sum to: additive drove the
      // hull to flat white (38 % near-white pixels over the Sawtooth) and
      // the silhouette read as a blob. Normal blending converges on the
      // violet instead of on white however many shells overlap.
      blending: THREE.NormalBlending, side: THREE.FrontSide, fog: false,
      uniforms: {
        uOpacity: { value: 0 },
        uBoost: { value: 1 },   // distance punch — rim/alpha ONLY, never colour
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
        uniform float uBoost;
        uniform vec3 uColor;
        void main() {
          float f = pow(max(0.0, 1.0 - abs(dot(normalize(vN), normalize(vV)))), 1.6);
          // fill stays UNDER 1.0 so the tone-mapped bloom cannot clip it to
          // white; the rim is what the distance boost brightens.
          vec3 col = uColor * (0.50 + 0.50 * min(1.0, f * uBoost));
          // A machine wears up to SIX of these shells and they all draw with
          // depthTest off, so a per-shell alpha of a is really 1-(1-a)^6 on
          // screen: 0.4 each reads as 0.95 and the hull turns into a flat
          // blob. Keep the FILL near-zero (6 x 0.02 ~= 0.12 tint, the hull
          // stays legible) and put the light in the RIM, which is what draws
          // the silhouette through terrain anyway.
          float a = (0.02 + 0.46 * pow(f, 1.9) * uBoost) * uOpacity;
          gl_FragColor = vec4(col, clamp(a, 0.0, 0.80));
        }`,
    });
  }

  /**
   * @param detach  Parent the shell to the SCENE and drive its world matrix
   *   from the source instead of hanging it under the source.
   *
   *   Component shells have to detach. `machine.parts[].mesh` is a holder
   *   Group that `entities/machines/rig/lod.js` hides by LOD tier (all parts
   *   past ~H*14 m, decorative ones past ~H*6), and a hidden ancestor takes
   *   the whole subtree out of the render — so a shell parented to the part
   *   silently stopped drawing at exactly the 15 m the scan gate films from.
   *   That is machine-rig's call to make about its own geometry; the Focus
   *   highlight just must not depend on it. Reparenting keeps the shell alive
   *   and, because the real part is hidden, it reads as the solid yellow
   *   component HZD draws.
   */
  _overlayFor(src, mat, order, detach = false) {
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
    if (detach) {
      const host = this.ctx.scene ?? src.parent;
      overlay.userData.__src = src;
      src.updateWorldMatrix(true, false);
      overlay.matrix.copy(src.matrixWorld);
      overlay.matrixWorldNeedsUpdate = true;
      host.add(overlay);
    } else {
      src.add(overlay);
    }
    return overlay;
  }

  /**
   * Detached component shells ride their source's world matrix. ~40 meshes
   * at most (PART_CAP), only while Focus is up or lingering, and the copy is
   * into a preallocated Matrix4 — no per-frame allocation.
   */
  _syncDetached() {
    for (const e of this._parts.values()) {
      for (const mesh of e.meshes) {
        const src = mesh.userData.__src;
        if (!src) continue;
        src.updateWorldMatrix(true, false);
        mesh.matrix.copy(src.matrixWorld);
        mesh.matrixWorldNeedsUpdate = true;
      }
    }
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
    // violet, not the pure blue of the machine-glow hex: docs/research/ui.md
    // calls for a VIOLET holographic silhouette and #5a7bff read as blue.
    const mat = this._fresnelMat('#8b7bff');
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
    // Distant machines need a denser shell or the glow washes out in fog.
    // This is a RIM/ALPHA punch only (uBoost, clamped in the shader): scaling
    // the colour or the opacity by it is what blew the hull out to white.
    const boost = 1 + Math.min(0.8, dist / 90);
    mat.uniforms.uBoost.value = boost;
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
    const mat = this._fresnelMat('#ffd34d'); // reference component hex
    // NORMAL blending (not additive): components must read SOLID YELLOW even
    // over the violet hull shell / emissive canisters — additive washes white
    mat.blending = THREE.NormalBlending;
    mat.fragmentShader = /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      uniform float uOpacity;
      uniform vec3 uColor;
      void main() {
        float f = pow(max(0.0, 1.0 - abs(dot(normalize(vN), normalize(vV)))), 1.2);
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
      // `_disposed` matters now that the shells hang off the SCENE, not off
      // the part: a machine that is torn out of the world no longer takes its
      // overlays with it, so they have to be reaped explicitly or they stay
      // floating in the meadow.
      const gone = p?.position && e.machine?.position
        && e.machine.position.distanceToSquared(p.position) > PART_RANGE * PART_RANGE;
      if (part?.attached === false || e.machine?.alive === false || gone
        || e.machine?._disposed || !e.meshes[0]?.userData.__src?.parent) {
        for (const mesh of e.meshes) mesh.parent?.remove(mesh);
        this._partCount -= e.meshes.length;
        this._parts.delete(part);
      }
    }
    if (!this.on || !Array.isArray(list)) return;

    // NEAREST FIRST. The shells are a fixed 40-mesh budget and the machine
    // list is in spawn order, so a Watcher 140 m away used to eat the slots
    // the Sawtooth under the crosshair needed. Sorted into a scratch array
    // reused across polls — this runs on GATHER_TICK, never per frame.
    const near = this._partOrder;
    near.length = 0;
    for (const m of list) {
      if (!m || m.alive === false || !Array.isArray(m.parts)) continue;
      const d2 = p?.position && m.position
        ? m.position.distanceToSquared(p.position) : 0;
      if (d2 > PART_RANGE * PART_RANGE) continue;
      near.push(m);
      m.__focusD2 = d2;
    }
    near.sort(_byFocusD2);

    for (const m of near) {
      const parts = m.parts;
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
          meshes.push(this._overlayFor(node, this._partMat, 9992, true));
        } else if (node.traverse) {
          let n = 0;
          node.traverse((o) => {
            if (n >= 3 || !(o.isMesh || o.isSkinnedMesh) || o.userData.__focusOverlay) return;
            meshes.push(this._overlayFor(o, this._partMat, 9992, true));
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
    // Round 3 depth-tested these so terrain could occlude them. That was right
    // for terrain and wrong for everything else: once world-ground shipped
    // real grass cards the ribbon vanished under them completely, which is the
    // opposite of what `stealth-focus-path-fidelity` is for — the route is the
    // information the player is turning Focus ON to get. It is a hologram now,
    // like the machine shells: depthTest:false, with the distance dim and the
    // hard cut past ~120 m carrying the "no x-ray streaks at vista angles"
    // half of the original concern.
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: {
        uTime: { value: 0 },
        uFade: { value: 0 },
        uColorA: { value: new THREE.Color('#9b6bff') }, // reference path hex
        uColorB: { value: new THREE.Color('#a980ff') },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorld;
        void main() {
          vUv = uv; // uv.x = meters along the loop, uv.y = 0..1 across
          vWorld = position; // ribbon geometry is authored in world space
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorld;
        uniform float uTime;
        uniform float uFade;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        void main() {
          // flowing ARROWED dashes: ~3.4m cycle marching along the route.
          // The across-offset skews each dash into a chevron whose apex leads
          // in the direction of travel (arrowheads, not plain ticks).
          float edge = abs(vUv.y * 2.0 - 1.0);
          float m = fract((vUv.x - edge * 0.85) / 3.4 - uTime * 0.5);
          float dash = smoothstep(0.50, 0.32, abs(m - 0.42));
          float across = 1.0 - edge;
          float soft = across * across;
          float dCam = distance(vWorld, cameraPosition);
          float dim = mix(1.0, 0.62, smoothstep(20.0, 110.0, dCam)); // legible near, quiet far
          float far = 1.0 - smoothstep(95.0, 125.0, dCam);          // gone past ~120m
          // Grazing-angle fade. The ribbon lies flat on the ground; seen
          // almost edge-on, several loops stack into a violet haze band across
          // the horizon -- which is the full-screen wash ui-10 exists to kill.
          // Fade it as the view direction flattens toward the ground plane.
          float graze = abs(normalize(cameraPosition - vWorld).y);
          float tilt = smoothstep(0.03, 0.16, graze);
          vec3 col = mix(uColorA, uColorB, dash) * (0.9 + 1.5 * dash);
          gl_FragColor = vec4(col * 1.35, (0.30 + 0.85 * dash) * soft * uFade * dim * far * tilt);
        }`,
    });
  }

  /**
   * `stealth-focus-path-fidelity` — is this machine actually walking its
   * route? A Sawtooth mid-fight is not, and drawing it a tidy patrol loop is
   * a lie the player will act on. Anything alerted / attacking / searching /
   * overridden / mounted is skipped, and the ribbon fades out from under it.
   */
  _walksRoute(m) {
    if (!m || m.alive === false) return false;
    if (m.mountedBy || m.overridden || m.downed) return false;
    const st = m.ai?.state ?? m.state ?? null;
    if (typeof st === 'string' && st) return ROUTE_STATES.has(st);
    return true; // no published state: trust the route it carries
  }

  /**
   * Centripetal Catmull-Rom through the waypoints — the finding was that a
   * route drawn as raw segments reads as a polygon nothing could walk. The
   * loop is closed, so every sample has real neighbours on both sides.
   */
  _splineRoute(route) {
    const n = route.length;
    const pts = [];
    const P = (i) => route[((i % n) + n) % n];
    for (let i = 0; i < n; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const seg = Math.hypot((p2.x ?? 0) - (p1.x ?? 0), (p2.z ?? 0) - (p1.z ?? 0));
      const steps = Math.max(2, Math.ceil(seg / SPLINE_STEP));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const t2 = t * t, t3 = t2 * t;
        // uniform Catmull-Rom basis (tension 0.5)
        const b0 = -0.5 * t3 + t2 - 0.5 * t;
        const b1 = 1.5 * t3 - 2.5 * t2 + 1;
        const b2 = -1.5 * t3 + 2 * t2 + 0.5 * t;
        const b3 = 0.5 * t3 - 0.5 * t2;
        pts.push({
          x: (p0.x ?? 0) * b0 + (p1.x ?? 0) * b1 + (p2.x ?? 0) * b2 + (p3.x ?? 0) * b3,
          z: (p0.z ?? 0) * b0 + (p1.z ?? 0) * b1 + (p2.z ?? 0) * b2 + (p3.z ?? 0) * b3,
          d: 0,
        });
      }
    }
    return pts;
  }

  _buildPaths() {
    const list = this.ctx.machines?.list;
    if (!Array.isArray(list)) return;
    const terrain = this.ctx.terrain;
    const p = this.ctx.player;
    this._pathSkipped = 0;
    for (const m of list) {
      if (!m || m.alive === false || this._paths.has(m)) continue;
      const route = m.route;
      if (!Array.isArray(route) || route.length < 2) continue;
      if (p?.position && m.position
        && m.position.distanceToSquared(p.position) > PATH_RANGE * PATH_RANGE) continue;
      // skip non-route movers: a machine that has left its patrol gets no
      // ribbon at all rather than a ribbon it is not following
      if (!this._walksRoute(m)) { this._pathSkipped++; continue; }

      // spline the closed waypoint loop (stealth-focus-path-fidelity)
      const pts = this._splineRoute(route);
      let total = 0;
      if (pts.length < 4) continue;
      // cumulative distance for the dash flow
      for (let i = 1; i < pts.length; i++) {
        pts[i].d = pts[i - 1].d
          + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      }
      total = pts[pts.length - 1].d
        + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z);
      if (total < 4) continue;
      this._pathSamples = pts.length;
      this._pathWaypoints = route.length;

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
        // 0.3m above ground: segments depth-test now, so keep them clear of
        // terrain curvature between samples without looking like they float
        const y = (terrain?.getHeight?.(cur.x, cur.z) ?? 0) + 0.14;
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

    // ui-10 — the component LIST. This is the whole finding: a count told the
    // player nothing, so every component now names itself, says what it is
    // (weak point / tearable / elemental) and says what it drops.
    const comps = this.componentRows(m);
    const rows = comps.map((c) => {
      const tags = [];
      if (c.weak) tags.push('<i class="hzcf-tag-weak">WEAK</i>');
      if (c.tearable) tags.push('<i class="hzcf-tag-tear">TEAR</i>');
      if (c.elemental) tags.push(`<i class="hzcf-tag-el hzcf-g-${c.elemental === 'blaze' ? 'fire' : 'freeze'}">${c.elemental === 'blaze' ? 'BLAZE' : 'FREEZE'}</i>`);
      const loot = c.loot.map((l) =>
        `<span class="hzcf-loot-chip" style="--chip:${l.color}">`
        + `<i>${l.glyph}</i>${l.name.toUpperCase()}${l.n > 1 ? ` ×${l.n}` : ''}</span>`
      ).join('');
      return `<div class="hzcf-comp-row${c.torn ? ' torn' : ''}">
          <span class="hzcf-comp-name">${c.name}${c.count > 1 ? `<em>×${c.count}</em>` : ''}</span>
          <span class="hzcf-comp-tags">${tags.join('')}</span>
          ${loot ? `<span class="hzcf-comp-loot">${loot}</span>` : ''}
        </div>`;
    }).join('');
    const intact = comps.reduce((n, c) => n + (c.count - c.tornCount), 0);
    const total = comps.reduce((n, c) => n + c.count, 0);

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
      ${comps.length ? `
        <div class="hzcf-div"></div>
        <div class="hzcf-comp-head">
          <span class="hzcf-lbl">COMPONENTS</span>
          <span class="hzcf-comp-n">${intact} / ${total}</span>
        </div>
        <div class="hzcf-comp-list">${rows}</div>` : ''}
    `;
  }

  /**
   * Named component rows for one machine — the data behind the card AND the
   * in-world labels. Reads only the published parts contract, so a species
   * that ships new parts is described correctly with no change here.
   */
  components(m) {
    const parts = Array.isArray(m?.parts) ? m.parts : null;
    if (!parts) return [];
    const out = [];
    for (const p of parts) {
      if (!p) continue;
      const tearable = typeof p.tearable === 'boolean' ? p.tearable : (p.tearHp ?? 0) > 0;
      if (!p.weak && !tearable && !p.elemental) continue;
      const loot = [];
      for (const l of (Array.isArray(p.loot) ? p.loot : [])) {
        if (!l?.id) continue;
        const def = itemDef(l.id);
        loot.push({
          id: l.id, n: l.n ?? l.count ?? 1, name: def.name,
          glyph: def.glyph, color: def.color,
          rarity: def.rarity ?? 'common',
          rarityColor: rarityDef(def.rarity).color,
        });
      }
      out.push({
        part: p,
        name: String(p.displayName ?? p.name ?? 'COMPONENT').replace(/[-_]/g, ' ').toUpperCase(),
        weak: !!p.weak,
        tearable,
        torn: p.attached === false,
        elemental: p.elemental ?? null,
        loot,
        // precomputed so the per-frame label pass never maps/joins
        lootText: loot.map((l) => l.name.toUpperCase()).join(' · '),
      });
    }
    return out;
  }

  /**
   * The same components collapsed by name for the card. A Sawtooth carries
   * three identical antennae; three identical rows is a list that scrolls off
   * the panel instead of a list that reads, so they become "ANTENNA ×3".
   */
  componentRows(m) {
    const rows = [];
    const byKey = new Map();
    for (const c of this.components(m)) {
      const key = `${c.name}|${c.weak}|${c.tearable}|${c.elemental}`;
      let row = byKey.get(key);
      if (!row) {
        row = { ...c, count: 0, tornCount: 0 };
        byKey.set(key, row);
        rows.push(row);
      }
      row.count++;
      if (c.torn) row.tornCount++;
      row.torn = row.tornCount === row.count;
    }
    return rows;
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
        // clamp against the card's MEASURED height: the component list made it
        // tall enough to run off the bottom of the frame on a Thunderjaw
        const cw = this._card.offsetWidth || 252;
        const ch = this._card.offsetHeight || 200;
        const left = Math.min(Math.max(sx + 46, 12), w - cw - 14);
        const top = Math.min(Math.max(sy - 70, 12), h - ch - 14);
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

  /* --------------------- in-world component labels (ui-10) ----------------- */

  /**
   * Project a world point to an ANCHOR the placement solve may use. Returns
   * false when the point is behind the camera OR when the anchor falls
   * outside the viewport.
   *
   * Round 1 tested only "behind the camera", so a pickup ~75° off-axis
   * projected to x = 2407 in a 1600 px frame, was styled, positioned, counted
   * by `audit()` and ate one of the twelve reveal slots — invisible, but paid
   * for three times over. A perspective projection is only meaningful inside
   * the frustum; outside it the numbers are noise, and feeding noise into the
   * de-overlap solve moves labels the player CAN see.
   */
  _project(v, out) {
    const cam = this.ctx.camera;
    _v2.copy(v).sub(cam.position);
    cam.getWorldDirection(_dir);
    if (_v2.dot(_dir) <= 0.25) return false;
    _v2.copy(v).project(cam);
    if (_v2.z >= 1) return false;
    const x = (_v2.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_v2.y * 0.5 + 0.5) * window.innerHeight;
    if (x < VIEW_MARGIN || x > window.innerWidth - VIEW_MARGIN) return false;
    if (y < VIEW_MARGIN || y > window.innerHeight - VIEW_MARGIN) return false;
    out.x = x;
    out.y = y;
    return true;
  }

  /**
   * Would a label box drawn at these screen bounds actually be readable?
   * Mostly-inside, not merely touching: half a label hanging past the edge
   * reads as a glitch. Vertically it has to fit almost entirely, because the
   * de-overlap passes stack labels along Y and that is the axis they can walk
   * off.
   */
  _boxOnScreen(left, top, right, bottom) {
    const w = window.innerWidth, h = window.innerHeight;
    const vx = Math.min(right, w - VIEW_MARGIN) - Math.max(left, VIEW_MARGIN);
    const vy = Math.min(bottom, h - VIEW_MARGIN) - Math.max(top, VIEW_MARGIN);
    return vx >= (right - left) * VIEW_FRAC && vy >= (bottom - top) * 0.9;
  }

  /** The machine whose components get labelled: the crosshair target, else
   *  the nearest living machine inside label range. */
  _labelSubject() {
    if (this._target) return this._target;
    const list = this.ctx.machines?.list;
    const p = this.ctx.player;
    if (!Array.isArray(list) || !p?.position) return null;
    let best = null;
    let bestD = LABEL_RANGE * LABEL_RANGE;
    for (const m of list) {
      if (!m || m.alive === false || !m.position) continue;
      const d = m.position.distanceToSquared(p.position);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  }

  /**
   * `components()` builds fresh rows, and the label pass runs every frame —
   * so it reads through a small cache instead (re-derived when the subject
   * changes or 0.3 s has passed, which is also when a part can have been torn
   * off). Keeps the 60 fps path allocation-free.
   */
  _cachedComponents(m, dt) {
    const c = this._compCache;
    c.t -= dt;
    if (c.machine !== m || c.t <= 0) {
      c.machine = m;
      c.t = 0.3;
      c.rows = this.components(m);
    }
    return c.rows;
  }

  _updatePartLabels(dt) {
    const live = this._labelsLive;
    live.length = 0;
    const m = this.on ? this._labelSubject() : null;
    const p = this.ctx.player;
    if (m && p?.position && m.position
      && m.position.distanceTo(p.position) <= LABEL_RANGE) {
      const cx = window.innerWidth * 0.5;
      const cy = window.innerHeight * 0.5;
      let hoverBest = Infinity;
      let hoverIdx = -1;
      // ui-10: components cluster on a machine, so raw projection stacked
      // three antenna labels on top of each other. Nudge each new label clear
      // of the ones already placed (12 tries, then drop it) — HZD does the
      // same: labels never overlap, and the ones that cannot fit do not draw.
      const placed = this._labelSlots;   // preallocated seats, count below
      let nPlaced = 0;
      // ...and keep them out from under the scan card, which parks on the
      // same machine: a label that would land inside the card flips to the
      // machine's other side instead of being read through holo glass.
      // `_cardRect` is sampled once per frame BEFORE any DOM writes, so this
      // never forces a synchronous layout.
      const cardRect = this._cardRect;
      for (const c of this._cachedComponents(m, dt)) {
        if (live.length >= LABEL_CAP) break;
        if (c.torn) continue;
        const node = c.part.mesh;
        if (!node) continue;
        node.getWorldPosition(_v);
        if (!this._project(_v, _screen)) continue;
        // The label hangs to ONE side of its anchor, so the side is chosen
        // before the de-overlap solve: off the card, and off the right edge
        // when there is room on the left. A candidate whose box cannot fit
        // either way is skipped — `continue`, not `break`, so its pool slot
        // goes to a component that IS on screen.
        let flip = !!cardRect
          && _screen.x > cardRect.left - 210 && _screen.x < cardRect.right
          && _screen.y > cardRect.top - 16 && _screen.y < cardRect.bottom + 16;
        if (!flip
          && !this._boxOnScreen(_screen.x + PLABEL_GAP, _screen.y - PLABEL_H,
            _screen.x + PLABEL_GAP + PLABEL_W, _screen.y + PLABEL_H)
          && this._boxOnScreen(_screen.x - PLABEL_GAP - PLABEL_W, _screen.y - PLABEL_H,
            _screen.x - PLABEL_GAP, _screen.y + PLABEL_H)) flip = true;
        const bl = flip ? -PLABEL_GAP - PLABEL_W : PLABEL_GAP;
        const br = flip ? -PLABEL_GAP : PLABEL_GAP + PLABEL_W;
        // horizontal fit is fixed once the side is chosen; only Y moves below
        if (!this._boxOnScreen(_screen.x + bl, _screen.y - PLABEL_H,
          _screen.x + br, _screen.y + PLABEL_H)) continue;
        let ok = true;
        for (let t = 0; t < 12; t++) {
          ok = true;
          for (let i = 0; i < nPlaced; i++) {
            const q = placed[i];
            if (Math.abs(_screen.y - q.y) < 17 && Math.abs(_screen.x - q.x) < 150) {
              ok = false;
              break;
            }
          }
          if (ok) break;
          _screen.y += 18;   // stacking walks the label DOWN the frame...
          // ...so re-test the edge it can walk off
          if (_screen.y + PLABEL_H > window.innerHeight - VIEW_MARGIN) { ok = false; break; }
        }
        if (!ok) continue;
        const seat = placed[nPlaced++];
        seat.x = _screen.x; seat.y = _screen.y;
        const slot = this._labelPool[live.length];
        slot.el.classList.toggle('flip', flip);
        if (slot.lastName !== c.name) { slot.name.textContent = c.name; slot.lastName = c.name; }
        const n = c.loot.length;
        if (slot.lastLoot !== c.lootText) {
          slot.loot.textContent = c.lootText;
          slot.lastLoot = c.lootText;
        }
        slot.el.classList.toggle('has-loot', n > 0);
        slot.el.classList.toggle('is-weak', c.weak);
        slot.el.style.left = `${Math.round(_screen.x)}px`;
        slot.el.style.top = `${Math.round(_screen.y)}px`;
        slot.el.style.display = '';
        const d = Math.hypot(_screen.x - cx, _screen.y - cy);
        if (d < hoverBest) { hoverBest = d; hoverIdx = live.length; }
        const rec = this._labelRec[live.length];
        rec.name = c.name; rec.x = _screen.x; rec.y = _screen.y;
        rec.loot = c.loot.length; rec.weak = c.weak; rec.tearable = c.tearable;
        rec.machine = m.kind ?? ''; rec.slot = slot;
        live.push(rec);
      }
      this.hoverPart = null;
      for (let i = 0; i < live.length; i++) {
        const on = i === hoverIdx && hoverBest < 140;
        live[i].slot.el.classList.toggle('hovered', on);
        if (on) this.hoverPart = live[i].name;
      }
    } else {
      this.hoverPart = null;
    }
    for (let i = live.length; i < this._labelPool.length; i++) {
      this._labelPool[i].el.style.display = 'none';
    }
  }

  /* --------------------- LOOT / DATAPOINT reveals (A63) -------------------- */

  /** Rebuild the candidate list from the interactable registry (polled). */
  _refreshReveals() {
    const src = this._revealSrc;
    src.length = 0;
    const inter = this.ctx.interactables;
    const list = inter?.list;
    const p = this.ctx.player;
    if (!Array.isArray(list) || !p?.position) return;
    const px = p.position.x, pz = p.position.z;
    for (const e of list) {
      if (!e || e.removed || e.consumed || e.disabled) continue;
      const pos = e.position;
      if (!pos || typeof pos.x !== 'number') continue;
      const dx = pos.x - px, dz = (pos.z ?? 0) - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 > REVEAL_RANGE * REVEAL_RANGE) continue;
      let kind = null;
      if (e.datapoint) kind = 'DATAPOINT';
      else if (e.pickupWeapon) kind = 'PICK UP';
      else if (Array.isArray(e.loot) && e.loot.length) kind = 'LOOT';
      else if (e.label === 'GATHER') kind = 'GATHER';
      if (!kind) continue;
      // rarity frame comes from the best thing inside (loot-feel)
      let rarity = 'common';
      let rank = -1;
      for (const l of (Array.isArray(e.loot) ? e.loot : [])) {
        const r = rarityDef(itemDef(l?.id).rarity);
        if (r.rank > rank) { rank = r.rank; rarity = r.id; }
      }
      if (kind === 'GATHER' && e.gatherNode?.itemId) {
        rarity = rarityDef(itemDef(e.gatherNode.itemId).rarity).id;
      }
      if (kind === 'PICK UP') rarity = 'legendary';
      src.push({
        entry: e, kind, d2, rarity,
        name: inter.sourceName ? inter.sourceName(e) : (e.label ?? ''),
        // derived once per poll, not once per frame
        cls: `hzcf-reveal k-${kind.replace(/\s+/g, '-').toLowerCase()}`,
        rarColor: rarityDef(rarity).color,
      });
    }
    // Sorted by distance, but NOT cut to the twelve that draw: `_updateReveals`
    // fills the pool from the nearest candidate that is actually on screen, so
    // a near-but-off-frame pickup no longer costs a farther visible one its
    // slot. The list is capped only to bound the per-frame walk.
    src.sort((a, b) => a.d2 - b.d2);
    if (src.length > REVEAL_SRC_CAP) src.length = REVEAL_SRC_CAP;
  }

  _updateReveals() {
    const live = this._revealsLive;
    live.length = 0;
    if (this.on) {
      // a reveal that lands on the scan card is unreadable through it and
      // hides the component list underneath — drop it, the world is full of
      // other things to reveal
      const cardRect = this._cardRect;
      // V36 fails on "labels stacked on top of each other". Two herbs a metre
      // apart project a couple of pixels apart, so every reveal takes a SEAT
      // and is nudged clear of the seats already taken — the part-label pass
      // (which ran first) seeds the list, so a reveal never lands under a
      // component label either. A reveal that cannot find a seat in 12 tries
      // does not draw: HZD never renders one label through another.
      const placed = this._revealSlots;
      let nPlaced = 0;
      for (const l of this._labelsLive) {
        if (nPlaced >= placed.length) break;
        const seat = placed[nPlaced++];
        // a component label hangs to ONE side of its anchor (or the other
        // when it flips clear of the card), so seat its rough CENTRE — the
        // anchor itself is an edge. classList is a cheap read; offsetWidth
        // would force a synchronous layout in the middle of the frame.
        seat.x = l.x + (l.slot?.el.classList.contains('flip') ? -PLABEL_MID : PLABEL_MID);
        seat.y = l.y;
      }
      // card bounds unrolled into plain numbers: this runs every frame, and a
      // closure per frame is a closure per frame
      const cL = cardRect ? cardRect.left - 90 : 1, cR = cardRect ? cardRect.right + 90 : -1;
      const cT = cardRect ? cardRect.top - 14 : 1, cB = cardRect ? cardRect.bottom + 14 : -1;
      for (const c of this._revealSrc) {
        if (live.length >= REVEAL_CAP) break;
        const e = c.entry;
        if (!e || e.removed || e.consumed) continue;
        const pos = e.position;
        if (!pos) continue;
        _v.set(pos.x ?? 0, (pos.y ?? 0) + (e.datapoint ? 1.7 : 0.75), pos.z ?? 0);
        if (!this._project(_v, _screen)) continue;
        // the box is centred on the anchor and sits above it: horizontal fit
        // is decided once, and only Y moves in the solve below
        if (!this._boxOnScreen(_screen.x - REVEAL_HW, _screen.y - REVEAL_H,
          _screen.x + REVEAL_HW, _screen.y)) continue;
        let ok = true;
        for (let t = 0; t < 12; t++) {
          ok = !(_screen.x > cL && _screen.x < cR && _screen.y > cT && _screen.y < cB);
          if (ok) {
            for (let i = 0; i < nPlaced; i++) {
              const q = placed[i];
              // a reveal box is kind + name: up to ~190 px wide, ~20 px tall,
              // and both are centred on the anchor, so this is the real
              // half-width sum, not a guess
              if (Math.abs(_screen.y - q.y) < 22 && Math.abs(_screen.x - q.x) < 190) {
                ok = false;
                break;
              }
            }
          }
          if (ok) break;
          _screen.y -= 22;             // stack upward, away from the pickup
          // off the top of the frame: this one does not draw, and the slot
          // stays free for the next candidate
          if (_screen.y - REVEAL_H < VIEW_MARGIN) { ok = false; break; }
        }
        if (!ok) continue;
        if (nPlaced < placed.length) {
          const seat = placed[nPlaced++];
          seat.x = _screen.x; seat.y = _screen.y;
        }
        const slot = this._revealPool[live.length];
        // only touch the DOM when the value actually changed: position moves
        // every frame, text and colour almost never do
        if (slot.lastKind !== c.kind) { slot.kind.textContent = c.kind; slot.lastKind = c.kind; }
        if (slot.lastName !== c.name) { slot.name.textContent = c.name; slot.lastName = c.name; }
        if (slot.lastCls !== c.cls) { slot.el.className = c.cls; slot.lastCls = c.cls; }
        if (slot.lastRar !== c.rarColor) {
          slot.el.style.setProperty('--rar', c.rarColor);
          slot.lastRar = c.rarColor;
        }
        slot.el.style.left = `${Math.round(_screen.x)}px`;
        slot.el.style.top = `${Math.round(_screen.y)}px`;
        slot.el.style.display = '';
        const rec = this._revealRec[live.length];
        rec.kind = c.kind; rec.name = c.name; rec.rarity = c.rarity;
        rec.x = _screen.x; rec.y = _screen.y; rec.dist = Math.sqrt(c.d2);
        live.push(rec);
      }
    }
    for (let i = live.length; i < this._revealPool.length; i++) {
      this._revealPool[i].el.style.display = 'none';
    }
  }

  /* --------------------------------- audit --------------------------------- */

  /** The machine currently under the crosshair (null when Focus is off). */
  get scanTarget() { return this.on ? this._target : null; }

  /** One flat object every gate in this lane reads. Never throws. */
  audit() {
    const m = this._cardM ?? this._target;
    const comps = m ? this.componentRows(m) : [];
    return {
      on: this.on,
      target: m ? (m.kind ?? '') : null,
      cardVisible: this._card.classList.contains('show'),
      card: m ? {
        machine: m.kind ?? '',
        name: String(m.displayName ?? m.kind ?? '').toUpperCase(),
        components: comps.map((c) => ({
          name: c.name, count: c.count, weak: c.weak, tearable: c.tearable,
          torn: c.torn, elemental: c.elemental,
          loot: c.loot.map((l) => ({ id: l.id, n: l.n, name: l.name })),
        })),
        parts: comps.reduce((n, c) => n + c.count, 0),
        withLoot: comps.filter((c) => c.loot.length).length,
      } : null,
      partLabels: this._labelsLive.map((l) => ({
        name: l.name, x: Math.round(l.x), y: Math.round(l.y),
        loot: l.loot, weak: l.weak, machine: l.machine,
      })),
      hoverPart: this.hoverPart ?? null,
      reveals: this._revealsLive.map((r) => ({
        kind: r.kind, name: r.name, rarity: r.rarity,
        x: Math.round(r.x), y: Math.round(r.y), dist: +r.dist.toFixed(1),
      })),
      // every entry above is placed on screen by construction (`_project` +
      // `_boxOnScreen`); these two let a gate prove it rather than trust it
      revealCandidates: this._revealSrc.length,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      shells: { parts: this._parts.size, machines: this._violet.size },
      paths: {
        count: this._paths.size,
        // derived, not asserted: a splined ribbon carries many more samples
        // than the route has waypoints (a raw polyline would carry exactly as
        // many corners as waypoints)
        splined: this._pathSamples > this._pathWaypoints * 3,
        samples: this._pathSamples,
        waypoints: this._pathWaypoints,
        skipped: this._pathSkipped,
      },
      vignette: this._vignette(),
    };
  }

  /**
   * Measured tint strength (V36 asks for ≤20 %). Reads the live computed
   * style so the number can never drift from the CSS that ships.
   */
  _vignette() {
    let center = 0;
    let edge = 0;
    try {
      const cs = getComputedStyle(this._tint);
      const nums = (cs.backgroundImage.match(/rgba?\([^)]*\)/g) || [])
        .map((s) => {
          const parts = s.replace(/rgba?\(|\)/g, '').split(',').map((x) => parseFloat(x));
          return parts.length > 3 ? parts[3] : 1;
        });
      for (const a of nums) edge = Math.max(edge, a);
      center = nums.length ? nums[0] : 0;
      const op = parseFloat(cs.opacity);
      if (Number.isFinite(op) && this.on) { center *= op; edge *= op; }
    } catch { /* computed style unavailable in a headless snapshot */ }
    return { centerAlpha: +center.toFixed(3), maxAlpha: +edge.toFixed(3) };
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
        // ui-10: the wall was reading as a purple slab across the frame.
        // Keep the sweep legible without draining the world's colour.
        this._waveMat.uniforms.uFade.value = 0.26 * fade;
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
          // clamped: alpha is an alpha, not a brightness knob
          e.mat.uniforms.uOpacity.value =
            Math.min(1, fadeIn * this._violetK * dim * pulse);
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
    if (this._parts.size) this._syncDetached();
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

    // --- patrol path flow (fades out from under a machine that leaves it) ---
    if (this._paths.size) {
      for (const [m, e] of this._paths) {
        e.mat.uniforms.uTime.value = t;
        const want = this.on && this._walksRoute(m);
        const f = THREE.MathUtils.clamp(
          e.mat.uniforms.uFade.value + (want ? dt / 0.4 : -dt / 0.25), 0, 1);
        e.mat.uniforms.uFade.value = f;
        e.mesh.visible = f > 0.01 && m.alive !== false;
        // fully faded and off-route: drop it so it rebuilds when the machine
        // goes back to patrolling (and so a corpse never keeps a loop)
        if (f <= 0 && !want) {
          this.ctx.scene.remove(e.mesh);
          e.mesh.geometry.dispose();
          e.mat.dispose();
          this._paths.delete(m);
        }
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

    // --- reveals: poll the interactable registry, project every frame ---
    if (this.on) {
      this._revealPoll -= dt;
      if (this._revealPoll <= 0) {
        this._revealPoll = REVEAL_TICK;
        this._refreshReveals();
      }
    } else if (this._revealSrc.length) {
      this._revealSrc.length = 0;
    }

    // --- DOM: info card + component labels + reveals + tag markers ---
    // one rect read per frame, taken BEFORE anything writes a style this
    // frame, so the label/reveal passes never trigger a forced reflow
    this._cardRect = this._card.classList.contains('show')
      ? this._card.getBoundingClientRect() : null;
    this._updateCard(dt);
    this._updatePartLabels(dt);
    this._updateReveals();
    this._updateTags();
  }
}
