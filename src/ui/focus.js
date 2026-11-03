import * as THREE from 'three';
import './focus.css';
import { itemDef, rarityDef } from '../items/items.js';
import { fieldWord, cardParts } from './tips.js';
import { itemIcon } from './inventory.js';

/**
 * THE ALIDADE — the Sighting overlay (lane `shell-ui`, bible §9.7, §10.3; replaces
 * the Round-4 scan). Raising the alidade does not change the world: a sepia paper
 * vignette at most 20 % at the corners, a crosshair with stadia hairlines, bearing
 * and distance readouts, weak points as cobalt-ink rings, components as dashed ink
 * outlines with leader lines to named chips, transects as white dashes on the
 * ground. Not violet, not teal, not holographic. `A-sighting`, `V36-sighting-scan`.
 *
 * PUBLISHED — `ctx.sighting`
 *   on · toggle(force?) · tags (Map machine -> marker el)   Flagged Instruments
 *   scanTarget      -> the Instrument under the crosshair, or null
 *   components(m)   -> [{ name, weak, tearable, torn, elemental, loot[] }]
 *   audit()         -> one flat object every gate in this lane reads
 * EVENTS  'sighting-on' · 'sighting-off' · 'sighting-pulse' · 'machine-tagged'
 * CONSUMES 'player-died', 'machine-killed'.
 *
 * V toggles the alidade, with no time limit. T Flags the Instrument under the
 * crosshair; a Flagged Instrument keeps its screen-projected mark (edge-clamped,
 * metres) until it dies, and its bearing on the circle. Component shells linger 6 s
 * after the alidade comes down.
 *
 * Cross-lane reads are all defensive: machine.parts / weakPoints / route / kind,
 * ctx.interactables.list and terrain.getHeight may land in any order.
 */

const RING_LIFE = 0.7;     // seconds the raising sweep stays visible
const RING_SPEED = 90;     // m/s the sweep expands
const RING_SEGS = 96;
const RING_WIDTH = 0.42;   // metres: a surveyor's chain, not a wall of light

const PART_LINGER = 6.0;   // component outlines persist ~6 s after the alidade comes down
const PART_FADE = 1.2;     // tail of the linger window spent fading
const PART_CAP = 40;       // max outline meshes alive at once
const PART_RANGE = 150;    // only outline parts on Instruments within this range

const PATH_RANGE = 220;    // transects drawn for Instruments within this range
const HULL_RANGE = 120;    // the drawn figure: only Instruments within this range
const HULL_MESHES_NEAR = 8;  // mask draws per Instrument inside HULL_NEAR metres
const HULL_MESHES_FAR = 3;   // ...and beyond it
const HULL_NEAR = 50;
const PATH_WIDTH = 0.5;    // the transect's ribbon in metres: a fine chain line and its station ticks

const GATHER_CAP = 40;     // pooled survey marks over gather nodes
const GATHER_TICK = 0.25;  // seconds between gather/parts registry polls

const CARD_DWELL = 0.4;    // crosshair-on-Instrument seconds before the card shows
const CARD_GRACE = 0.35;   // off-target seconds before the card fades

const LABEL_CAP = 10;      // pooled component chips on screen at once
const LABEL_RANGE = 70;    // only label parts on Instruments this close
const RING_CAP = 12;       // pooled weak-point rings
const REVEAL_CAP = 12;     // pooled reveal chips ON SCREEN at once
/**
 * Candidates kept per poll. Visibility decides which twelve draw; distance only
 * decides the order they are tried in.
 */
const REVEAL_SRC_CAP = 48;
const REVEAL_RANGE = 85;   // metres the alidade reads a lootable / Field Book at
const REVEAL_TICK = 0.2;   // seconds between interactable registry polls

/* on-screen placement: a chip points AT a thing, so it cannot be clamped without
 * lying; one that cannot fit is skipped and the slot goes to the next candidate. */
const VIEW_MARGIN = 8;     // px a label box must reach inside the frame
const VIEW_FRAC = 0.6;     // ...and this much of its width must be inside
const PLABEL_GAP = 34;     // the leader's run from anchor to chip
const PLABEL_W = 190;      // widest name + loot text
const PLABEL_H = 11;       // half-height
const PLABEL_MID = PLABEL_GAP + PLABEL_W * 0.5;  // anchor -> box centre
const REVEAL_HW = 105;     // .calf-reveal is centred: half its widest box
const REVEAL_H = 22;       // ...and it sits fully ABOVE its anchor
const SPLINE_STEP = 1.1;   // metres between Catmull-Rom samples on the ribbon
/**
 * AI states in which an Instrument is actually walking its route. Everything else is
 * a non-route mover, and drawing it a tidy loop it is not walking is a lie the
 * player will act on.
 */
const ROUTE_STATES = new Set(['patrol', 'return', 'idle', 'graze']);

/** Bible §5.8: the element words on a card. Engine channel -> player word. */
const ELEM_WORD = { blaze: 'CINDER', fire: 'CINDER', freeze: 'BRINE', chill: 'BRINE', shock: 'DUST', spark: 'DUST' };

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();
/** Reused projection result — the label loops must not allocate. */
const _screen = { x: 0, y: 0 };

let _markTex = null;
/** A gather node's mark through the alidade: a small survey cross. */
function markTexture() {
  if (_markTex) return _markTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 32, 32);
  g.fillStyle = 'rgba(38,52,63,0.9)';
  g.fillRect(14, 4, 4, 24); g.fillRect(4, 14, 24, 4);
  g.fillStyle = '#fff';
  g.fillRect(15, 5, 2, 22); g.fillRect(5, 15, 22, 2);
  _markTex = new THREE.CanvasTexture(c);
  _markTex.minFilter = THREE.LinearFilter;
  _markTex.generateMipmaps = false;
  return _markTex;
}

/** The overlay shell's vertex stage (skinning chunks are no-ops on static meshes). */
const SHELL_VS = /* glsl */ `
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
  }`;

/** The figure mask's vertex stage: position only, through the bones when there are bones. */
const MASK_VS = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  void main() {
    #include <skinbase_vertex>
    vec3 transformed = vec3(position);
    #include <skinning_vertex>
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }`;

/**
 * THE DRAWN FIGURE (R54: the Fresnel shells read as white static on small geometry).
 * The mask holds coverage, R the whole Instrument, G its components, filtered: the 0.5
 * iso-line of a bilinear mask is a smooth contour at sub-texel accuracy. `abs(cov - 0.5) /
 * |grad cov|` is the distance to it, so the line is the same width whatever the Instrument's
 * shape. The Instrument is a dashed paper hairline on an ink casing; a component is ink with
 * a paper tooth between the dashes. No glow, no fill but a trace of ink.
 */
const FIGURE_FS = /* glsl */ `
  uniform sampler2D uMask;
  uniform vec2 uRes;
  uniform vec2 uTexel;
  uniform float uScale;   // target px per mask texel
  uniform float uDash;    // dash period in target px
  uniform float uLine;    // half line width in target px
  uniform float uHull;
  uniform float uPart;
  uniform vec3 uInk;
  uniform vec3 uPaper;
  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    vec3 c3 = texture2D(uMask, uv).rgb;
    float her = smoothstep(0.3, 0.7, c3.b);      // she stands in front of what she reads
    if (her > 0.995) discard;
    vec2 c = c3.rg;
    vec2 l = texture2D(uMask, uv - vec2(uTexel.x, 0.0)).rg;
    vec2 r = texture2D(uMask, uv + vec2(uTexel.x, 0.0)).rg;
    vec2 d = texture2D(uMask, uv - vec2(0.0, uTexel.y)).rg;
    vec2 u = texture2D(uMask, uv + vec2(0.0, uTexel.y)).rg;
    vec2 gH = vec2(r.r - l.r, u.r - d.r) * 0.5;
    vec2 gP = vec2(r.g - l.g, u.g - d.g) * 0.5;
    float aH = length(gH), aP = length(gP);
    float dH = aH > 0.02 ? abs(c.r - 0.5) / aH * uScale : 1e4;
    float dP = aP > 0.02 ? abs(c.g - 0.5) / aP * uScale : 1e4;
    float lineH = 1.0 - smoothstep(uLine, uLine + 1.0, dH);
    float caseH = 1.0 - smoothstep(uLine + 0.8, uLine + 2.0, dH);
    float lineP = 1.0 - smoothstep(uLine + 0.3, uLine + 1.3, dP);
    float caseP = 1.0 - smoothstep(uLine + 1.1, uLine + 2.3, dP);
    // a checker turned 22.5 degrees cuts a contour into dashes in every direction
    vec2 q = gl_FragCoord.xy / uDash;
    q = vec2(q.x * 0.924 + q.y * 0.383, q.y * 0.924 - q.x * 0.383);
    float dash = (fract(q.x) < 0.5) == (fract(q.y) < 0.5) ? 1.0 : 0.0;

    vec3 col = uInk;
    float a = step(0.5, c.r) * 0.07 * uHull;                       // a trace of ink inside the figure
    float hull = dash * uHull;
    if (caseH * hull > 0.0) { a = max(a, caseH * hull * 0.66); }
    if (lineH * hull > 0.0) { col = mix(col, uPaper, lineH); a = max(a, lineH * hull * 0.96); }
    float part = uPart;
    if (caseP * part > 0.0) {
      vec3 tooth = mix(uPaper, uInk, dash);                        // ink, the paper between
      col = mix(col, uPaper, caseP);
      col = mix(col, tooth, lineP);
      a = max(a, max(caseP * 0.72, lineP * 0.98) * part);
    }
    a *= 1.0 - her;
    if (a <= 0.003) discard;
    gl_FragColor = vec4(col, a);
  }`;

const _clear = new THREE.Color();

/** Nearest-first order for the component-shell budget (see `_refreshParts`). */
const _byNearest = (a, b) => a.__sightD2 - b.__sightD2;

export class SightingSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.on = false;        // the alidade is raised
    this.active = false;    // legacy alias: mirrors .on
    this._waveT = 99;       // time since raising (drives the sweep)
    this._origin = new THREE.Vector3();

    // the drawn figure: Map machine -> { meshes[] }, in a mask of their own
    this._hulls = new Map();
    this._hullK = 0;        // master fade 0..1 for the figure
    this._hullPoll = 0;
    this._buildFigure();

    // component outlines: Map part -> { meshes[], machine }
    this._parts = new Map();
    this._partCount = 0;
    this._offT = Infinity;  // time since the alidade came down (drives the linger)
    this._partPoll = 0;

    // transects: Map machine -> { mesh, mat }
    this._paths = new Map();
    this._pathSamples = 0;   // samples on the most recently splined ribbon
    this._pathWaypoints = 0; // waypoints that ribbon was built from
    this._pathSkipped = 0;   // machines skipped because they left their route
    this.hoverPart = null;   // component name nearest the crosshair
    this._rangeT = 0;        // 5 Hz: the range under the crosshair
    this._rangeM = -1;
    this._lastBrg = -1;
    this._lastDst = -2;
    this._compCache = { machine: null, t: 0, rows: [] };
    this._cardRect = null;

    // tagged machines: Map machine -> marker element
    this._tags = new Map();

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

    // V raises the alidade
    ctx.input.onDown('KeyV', () => {
      if (ctx.state === 'playing' || ctx.params?.has('shot')) this.toggle();
    });
    // T Flags the Instrument under the crosshair while the alidade is up
    ctx.input.onDown('KeyT', () => {
      if (!(ctx.state === 'playing' || ctx.params?.has('shot'))) return;
      if (this.on) this.tagTarget();
    });

    ctx.events.on('player-died', () => this.abort());
    ctx.events.on('machine-killed', (e) => this._onMachineKilled(e?.machine));
  }

  /* ------------------------------- public API ------------------------------ */

  /** Flagged Instruments (Map machine -> marker el). The HUD and the map read this. */
  get tags() { return this._tags; }

  /** Raise or lower the alidade. Pass true/false to force a state. */
  toggle(force) {
    const want = force === undefined ? !this.on : !!force;
    if (want === this.on) return;
    this.on = want;
    this.active = want;
    if (want) this._activate();
    else this._deactivate();
  }

  /** Legacy surface: a pulse raises the alidade. */
  pulse() {
    if (this.on) { this._firePulse(); return; }
    this.toggle(true);
  }

  /** Kill everything instantly (player death) — no overlays over death UI. */
  abort() {
    if (this.on) {
      this.on = false;
      this.active = false;
      this.ctx.events.emit('sighting-off');
    }
    this._tint.classList.remove('on');
    this._reticle.classList.remove('on');
    document.body.classList.remove('cal-sighting');
    this._hideCard(true);
    this._ring.visible = false;
    this._gather.visible = false;
    this._disposeHulls();
    this._disposeParts();
    this._disposePaths();
    this._offT = Infinity;
  }

  /** Flag / un-Flag the Instrument under the crosshair (T with the alidade up). */
  tagTarget() {
    const m = this._target ?? this._pickTarget();
    if (!m) return;
    if (this._tags.has(m)) {
      this._tags.get(m)?.remove();
      this._tags.delete(m);
      return;
    }
    const el = document.createElement('div');
    el.className = 'calf-tag';
    el.innerHTML = '<div class="calf-pennant"></div><div class="calf-dist"></div>';
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
    document.body.classList.add('cal-sighting');
    this._lastBrg = -1;
    this._lastDst = -2;
    this._rangeT = 0;
    this._figure.visible = true;
    this._buildHeroShells();
    this._buildHulls();
    this._buildPaths();
    this._gather.visible = true;
    this._gatherPoll = 0;   // refresh immediately
    this._partPoll = 0;
    this.ctx.events.emit('sighting-on');
    this.ctx.events.emit('sighting-pulse');
  }

  _deactivate() {
    this._offT = 0;         // outlines linger from this moment
    this._tint.classList.remove('on');
    this._reticle.classList.remove('on');
    document.body.classList.remove('cal-sighting');
    this._hideCard();
    this._ring.visible = false;
    this._gather.visible = false;
    this._disposePaths();
    this.ctx.events.emit('sighting-off');
  }

  _firePulse() {
    const p = this.ctx.player;
    if (p?.position) this._origin.copy(p.position);
    this._waveT = 0;
    this._ring.visible = true;
    this._updateRing(2.5);
  }

  /* ------------------------------- DOM layer ------------------------------- */

  _buildDom() {
    // the sepia paper vignette: first #hud child so HUD text sits above it
    this._tint = document.createElement('div');
    this._tint.className = 'calf-tint';
    (document.getElementById('hud') ?? document.body).prepend(this._tint);

    // card + marks live in their own fixed layer UNDER #hud
    this._layer = document.createElement('div');
    this._layer.id = 'calf-layer';
    document.body.appendChild(this._layer);

    // the ink layer: weak-point rings and leader lines, one SVG, pooled shapes
    const NS = 'http://www.w3.org/2000/svg';
    this._ink = document.createElementNS(NS, 'svg');
    this._ink.setAttribute('class', 'calf-ink');
    this._layer.appendChild(this._ink);
    const pool = (cls, tag, n) => Array.from({ length: n }, () => {
      const e = document.createElementNS(NS, tag);
      e.setAttribute('class', cls);
      e.style.display = 'none';
      this._ink.appendChild(e);
      return e;
    });
    this._leaderU = pool('calf-leader-u', 'polyline', LABEL_CAP + 1);
    this._leaders = pool('calf-leader', 'polyline', LABEL_CAP + 1);
    this._ringsU = pool('calf-ring-u', 'circle', RING_CAP);
    this._rings = pool('calf-ring', 'circle', RING_CAP);
    this._ringsLive = 0;
    this._ringRec = Array.from({ length: RING_CAP }, () => ({ x: 0, y: 0, r: 0, name: '' }));

    // the alidade's crosshair: stadia hairlines, graduated, engraved
    this._reticle = document.createElement('div');
    this._reticle.className = 'calf-reticle';
    let ticks = '';
    for (let i = 1; i <= 8; i++) {
      const x = 40 + i * 28, h = i % 4 === 0 ? 9 : 5;
      ticks += `M${x} ${-h}V${h}M${-x} ${-h}V${h}`;
    }
    const d = 'M-264 0H-26M26 0H264M0 26V180M0 -26V-180'                // the hairs, broken at the centre
      + 'M-34 -74H34M-34 74H34M-16 -38H16M-16 38H16'                    // the stadia, two pairs
      + 'M-6 0H6M0 -6V6' + ticks;                                       // the centre cross + the graduated limb
    this._reticle.innerHTML =
      `<svg viewBox="-280 -190 560 380" aria-hidden="true"><path class="u" d="${d}"/><path class="t" d="${d}"/></svg>`
      + '<div class="calf-read"><div class="calf-read-row"><span>BRG</span><b class="calf-brg">000</b></div>'
      + '<div class="calf-read-row"><span>DST</span><b class="calf-dst">---</b><i>m</i></div></div>';
    this._layer.appendChild(this._reticle);
    this._brgEl = this._reticle.querySelector('.calf-brg');
    this._dstEl = this._reticle.querySelector('.calf-dst');

    this._card = document.createElement('div');
    this._card.className = 'calf-card';
    this._layer.appendChild(this._card);

    // pooled component chips: no element churn while the alidade sweeps across a herd
    this._labelPool = [];
    for (let i = 0; i < LABEL_CAP; i++) {
      const el = document.createElement('div');
      el.className = 'calf-plabel';
      el.innerHTML = '<span class="calf-pname"></span><span class="calf-ploot"></span>';
      this._layer.appendChild(el);
      this._labelPool.push({
        el, name: el.querySelector('.calf-pname'), loot: el.querySelector('.calf-ploot'),
      });
    }
    // live rows are REUSED records, never fresh objects: this runs every frame
    this._labelsLive = [];
    this._labelRec = [];
    for (let i = 0; i < LABEL_CAP; i++) {
      this._labelRec.push({ name: '', x: 0, y: 0, ax: 0, ay: 0, flip: false, loot: 0, weak: false, tearable: false, machine: '', slot: null });
    }
    this._partOrder = [];   // scratch: machines sorted nearest-first per poll
    this._labelSlots = [];
    for (let i = 0; i < LABEL_CAP; i++) this._labelSlots.push({ x: 0, y: 0 });

    // pooled LOOT / FIELD BOOK / GATHER chips, projected onto the interactable itself
    this._revealPool = [];
    for (let i = 0; i < REVEAL_CAP; i++) {
      const el = document.createElement('div');
      el.className = 'calf-reveal';
      el.innerHTML = '<i class="calf-rmark"></i>'
        + '<span class="calf-rkind"></span><span class="calf-rname"></span>';
      this._layer.appendChild(el);
      this._revealPool.push({
        el, kind: el.querySelector('.calf-rkind'), name: el.querySelector('.calf-rname'),
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

  /* ------------------------------ the raising sweep ------------------------ */

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

    // one white dashed hairline running out over the ground, like a chain being paid out
    this._ringMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false,
      side: THREE.DoubleSide, fog: false,
      uniforms: { uFade: { value: 0 }, uColor: { value: new THREE.Color('#F1EEE6') } },
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
          float dash = step(0.5, fract(vUv.x * 96.0));
          gl_FragColor = vec4(uColor, dash * uFade);
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

  /* ----------------------------- the drawn figure --------------------------- */

  /**
   * One half-resolution coverage mask and one full-frame contour pass (`FIGURE_FS`). The
   * mask is drawn from inside the pass's own `onBeforeRender`, as a Reflector does, so it
   * uses this frame's camera and bones. The target exists while a figure is on the sheet:
   * `_releaseFigure()` frees it when the alidade is down and its linger has run out.
   */
  _buildFigure() {
    this._maskScene = new THREE.Scene();
    this._maskScene.name = 'sighting-figure-mask';
    const maskMat = (rgb) => new THREE.ShaderMaterial({
      vertexShader: MASK_VS,
      fragmentShader: `void main() { gl_FragColor = vec4(${rgb}, 1.0); }`,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this._hullMaskMat = maskMat('1.0, 0.0, 0.0');
    this._partMaskMat = maskMat('1.0, 1.0, 0.0');
    this._heroMaskMat = maskMat('0.0, 0.0, 1.0');   // Brea: nothing the alidade draws goes over her
    this._heroShells = [];

    this._figureRT = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false, samples: 0,
    });
    this._figureRT.texture.name = 'sighting-figure-mask';
    this.ctx.engine?.registerRenderTarget?.('shell-ui sighting figure mask', this._figureRT);

    this._figureMat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uMask: { value: this._figureRT.texture },
        uRes: { value: new THREE.Vector2(1, 1) },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uScale: { value: 2 },
        uDash: { value: 9 },
        uLine: { value: 0.55 },
        uHull: { value: 0 },
        uPart: { value: 0 },
        uInk: { value: new THREE.Color('#26343F') },
        uPaper: { value: new THREE.Color('#F1EEE6') },
      },
      vertexShader: 'void main() { gl_Position = vec4(uv, 0.0, 1.0); }',
      fragmentShader: FIGURE_FS,
    });
    // `position` is all zeros, so anything but this material (a normal pass) draws nothing
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([-1, -1, 3, -1, -1, 3]), 2));
    this._figure = new THREE.Mesh(geo, this._figureMat);
    this._figure.name = 'sighting-figure';
    this._figure.frustumCulled = false;
    this._figure.renderOrder = 9984;   // first of the alidade's layers: the transects read its mask
    this._figure.visible = false;
    this._figureDone = false;
    this._figure.onBeforeRender = (renderer, _scene, camera) => this._renderFigureMask(renderer, camera);
    this.ctx.scene.add(this._figure);
  }

  _renderFigureMask(renderer, camera) {
    if (this._figureDone) return;
    this._figureDone = true;
    const cur = renderer.getRenderTarget();
    const w = cur ? cur.width : renderer.domElement.width;
    const h = cur ? cur.height : renderer.domElement.height;
    const mw = Math.max(2, w >> 1), mh = Math.max(2, h >> 1);
    const rt = this._figureRT;
    if (rt.width !== mw || rt.height !== mh) rt.setSize(mw, mh);
    const u = this._figureMat.uniforms;
    u.uRes.value.set(w, h);
    u.uTexel.value.set(1 / mw, 1 / mh);
    u.uScale.value = w / mw;
    const dpr = renderer.domElement.clientWidth > 0 ? w / renderer.domElement.clientWidth : 1;
    u.uDash.value = 11 * dpr;
    u.uLine.value = 0.8 * dpr;

    // the source's world matrix is current here: the main pass has already updated the graph
    for (const e of this._hulls.values()) {
      for (const mesh of e.meshes) {
        const src = mesh.userData.__src;
        mesh.visible = !!src?.parent;
        if (mesh.visible) { mesh.matrix.copy(src.matrixWorld); mesh.matrixWorldNeedsUpdate = true; }
      }
    }
    for (const e of this._parts.values()) {
      for (const mesh of e.meshes) {
        const src = mesh.userData.__src;
        mesh.visible = !!src?.parent;
        if (mesh.visible) { mesh.matrix.copy(src.matrixWorld); mesh.matrixWorldNeedsUpdate = true; }
      }
    }
    const model = this.ctx.player?.model;
    for (const mesh of this._heroShells) {
      const src = mesh.userData.__src;
      mesh.visible = !!src?.parent && src.visible && model?.visible !== false;
      if (mesh.visible) { mesh.matrix.copy(src.matrixWorld); mesh.matrixWorldNeedsUpdate = true; }
    }

    renderer.getClearColor(_clear);
    const clearA = renderer.getClearAlpha();
    const autoClear = renderer.autoClear;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.autoClear = false;
    renderer.render(this._maskScene, camera);
    renderer.autoClear = autoClear;
    renderer.setClearColor(_clear, clearA);
    renderer.setRenderTarget(cur);
  }

  /** Brea's own meshes (kit included), rebuilt each time the alidade comes up: she may have changed what she carries. */
  _buildHeroShells() {
    this._clearHeroShells();
    const model = this.ctx.player?.model;
    if (!model) return;
    model.traverse((o) => {
      if (this._heroShells.length >= 12) return;
      if (!(o.isMesh || o.isSkinnedMesh) || o.isInstancedMesh || o.userData.__sightOverlay) return;
      this._heroShells.push(this._overlayFor(o, this._heroMaskMat));
    });
  }

  _clearHeroShells() {
    for (const mesh of this._heroShells) mesh.parent?.remove(mesh);
    this._heroShells.length = 0;
  }

  /** Nothing on the sheet: the pass stops and the mask's memory goes back. */
  _releaseFigure() {
    if (this.on || this._hulls.size || this._parts.size) return;
    this._clearHeroShells();
    this._figure.visible = false;
    this._figureRT.dispose();
  }

  /**
   * A shell in the figure's mask, on its source's geometry and bones. It rides the source's
   * world matrix (`_renderFigureMask`) because the source can sit under a holder group that
   * `rig/lod.js` hides by tier, and a figure must not vanish at the range the alidade reads from.
   */
  _overlayFor(src, mat) {
    let overlay;
    if (src.isSkinnedMesh) {
      overlay = new THREE.SkinnedMesh(src.geometry, mat);
      overlay.bindMode = src.bindMode;
      overlay.bind(src.skeleton, src.bindMatrix);
    } else {
      overlay = new THREE.Mesh(src.geometry, mat);
    }
    overlay.userData.__sightOverlay = true;
    overlay.userData.__src = src;
    overlay.raycast = () => {}; // FX shell, not a hitbox: combat rays must hit the real part
    overlay.frustumCulled = false;
    overlay.castShadow = false;
    overlay.receiveShadow = false;
    overlay.matrixAutoUpdate = false;
    src.updateWorldMatrix(true, false);
    overlay.matrix.copy(src.matrixWorld);
    overlay.matrixWorldNeedsUpdate = true;
    this._maskScene.add(overlay);
    return overlay;
  }

  _buildHulls() {
    const list = this.ctx.machines?.list;
    if (!Array.isArray(list)) return;
    const p = this.ctx.player;
    // prune the figures of Instruments that left range or are gone
    if (p?.position) {
      for (const [m, e] of this._hulls) {
        if (m?._disposed || m?.alive === false || (m?.position
          && m.position.distanceToSquared(p.position) > (HULL_RANGE * 1.2) ** 2)) {
          for (const mesh of e.meshes) mesh.parent?.remove(mesh);
          this._hulls.delete(m);
        }
      }
    }
    for (const m of list) this._addHull(m);
  }

  _addHull(m) {
    if (!m || m.alive === false || !m.root || this._hulls.has(m)) return;
    const p = this.ctx.player;
    if (p?.position && m.position
      && m.position.distanceToSquared(p.position) > HULL_RANGE * HULL_RANGE) return;
    let sources = [];
    m.root.traverse((o) => {
      // skip other shells and instanced kit; components keep their own outline
      if ((o.isMesh || o.isSkinnedMesh) && !o.isInstancedMesh && !o.userData.__sightOverlay
        && !o.userData.part) sources.push(o);
    });
    // Draw-call budget: the largest meshes make the silhouette; far Instruments get fewer.
    const pos0 = m.position ?? m.root.position;
    const distNow = p?.position ? Math.hypot(
      pos0.x - p.position.x, pos0.z - p.position.z) : 0;
    const cap = distNow > HULL_NEAR ? HULL_MESHES_FAR : HULL_MESHES_NEAR;
    if (sources.length > cap) {
      for (const o of sources) {
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      }
      sources.sort((a, b) =>
        b.geometry.boundingSphere.radius - a.geometry.boundingSphere.radius);
      sources = sources.slice(0, cap);
    }
    const meshes = [];
    for (const o of sources) meshes.push(this._overlayFor(o, this._hullMaskMat));
    if (!meshes.length) return;
    this._hulls.set(m, { meshes });
    this._figure.visible = true;
  }

  _disposeHulls() {
    for (const e of this._hulls.values()) {
      for (const mesh of e.meshes) mesh.parent?.remove(mesh);
    }
    this._hulls.clear();
    this._hullK = 0;
    this._releaseFigure();
  }

  /* ------------------------------ component outlines ------------------------ */

  /** Poll machine.parts (lands from the machines builder in any order). */
  _refreshParts() {
    const list = this.ctx.machines?.list;
    const p = this.ctx.player;

    // drop shells whose part detached / machine died
    for (const [part, e] of this._parts) {
      // `_disposed` matters because the shells hang off the SCENE, not off the part:
      // an Instrument torn out of the world does not take its overlays with it.
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

    // NEAREST FIRST: the shells are a fixed 40-mesh budget and the list is in spawn
    // order. Sorted into a scratch array reused across polls (GATHER_TICK, not per frame).
    const near = this._partOrder;
    near.length = 0;
    for (const m of list) {
      if (!m || m.alive === false || !Array.isArray(m.parts)) continue;
      const d2 = p?.position && m.position
        ? m.position.distanceToSquared(p.position) : 0;
      if (d2 > PART_RANGE * PART_RANGE) continue;
      near.push(m);
      m.__sightD2 = d2;
    }
    near.sort(_byNearest);

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
          meshes.push(this._overlayFor(node, this._partMaskMat));
        } else if (node.traverse) {
          let n = 0;
          node.traverse((o) => {
            if (n >= 3 || !(o.isMesh || o.isSkinnedMesh) || o.userData.__sightOverlay) return;
            meshes.push(this._overlayFor(o, this._partMaskMat));
            n++;
          });
        }
        if (meshes.length) {
          this._parts.set(part, { meshes, machine: m });
          this._partCount += meshes.length;
          this._figure.visible = true;
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
    this._figureMat.uniforms.uPart.value = 0;
    this._releaseFigure();
  }

  /* ------------------------------- the transects ---------------------------- */

  /** Bible §9.7: "transects as white dashes on the ground". Paper white, an ink edge, no glow. */
  _pathMat() {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.NormalBlending, side: THREE.DoubleSide, fog: false,
      uniforms: {
        uTime: { value: 0 },
        uFade: { value: 0 },
        uPaper: { value: new THREE.Color('#F1EEE6') },
        uInk: { value: new THREE.Color('#26343F') },
        uMask: { value: this._figureRT.texture },
        uRes: this._figureMat.uniforms.uRes,       // shared: written once a frame by the mask pass
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorld;
        void main() {
          vUv = uv; // uv.x = metres along the loop, uv.y = 0..1 across
          vWorld = position; // ribbon geometry is authored in world space
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorld;
        uniform float uTime;
        uniform float uFade;
        uniform vec3 uPaper;
        uniform vec3 uInk;
        uniform sampler2D uMask;
        uniform vec2 uRes;
        void main() {
          // a surveyor's chain line: fine dashes 0.9 m long on a 1.5 m pace, walking slowly,
          // and a station tick across the ribbon every 7.5 m, which stays put as a chainage does
          float m = fract((vUv.x - uTime * 0.35) / 1.5);
          float dash = step(m, 0.6);
          float edge = abs(vUv.y * 2.0 - 1.0);
          float fw = max(fwidth(edge), 0.001);
          float dCam = distance(vWorld, cameraPosition);
          // the line holds about a pixel at range instead of breaking into sparkle
          float lineW = max(0.17, fw * 0.8);
          float core = 1.0 - smoothstep(lineW, lineW + fw, edge);
          float halo = 1.0 - smoothstep(lineW + fw, lineW + fw * 2.6, edge);
          float st = fract(vUv.x / 7.5);
          float stw = max(0.0045, fwidth(vUv.x) * 0.9 / 7.5);
          float tick = (1.0 - smoothstep(stw, stw * 1.6, min(st, 1.0 - st))) * (1.0 - smoothstep(0.86, 0.98, edge));
          float far = 1.0 - smoothstep(95.0, 125.0, dCam);          // gone past ~120 m
          float nearK = smoothstep(2.0, 6.0, dCam);                 // never a slab across the foreground
          // seen almost edge-on several loops stack into a band: fade with the grazing angle
          float tilt = smoothstep(0.03, 0.14, abs(normalize(cameraPosition - vWorld).y));
          float line = max(core * dash, tick);
          float a = max(line * 0.96, max(halo * dash, tick) * 0.42);
          vec3 col = mix(uInk, uPaper, line);
          float her = texture2D(uMask, gl_FragCoord.xy / uRes).b;   // the line passes behind her
          float total = a * uFade * far * tilt * nearK * (1.0 - smoothstep(0.3, 0.7, her));
          if (total <= 0.003) discard;
          gl_FragColor = vec4(col, total);
        }`,
    });
  }

  /** Is this Instrument actually walking its route? A fighting one is not: no line for it. */
  _walksRoute(m) {
    if (!m || m.alive === false) return false;
    if (m.downed) return false;
    const st = m.ai?.state ?? m.state ?? null;
    if (typeof st === 'string' && st) return ROUTE_STATES.has(st);
    return true; // no published state: trust the route it carries
  }

  /**
   * Catmull-Rom through the waypoints: a route drawn as raw segments reads as a
   * polygon nothing could walk. The loop is closed, so every sample has neighbours.
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
      // skip non-route movers: no ribbon rather than one it is not following
      if (!this._walksRoute(m)) { this._pathSkipped++; continue; }

      // spline the closed waypoint loop
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
        // just above the ground, clear of its curvature between samples
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
      map: markTexture(),
      color: new THREE.Color('#F1EEE6'),
      size: 0.9,
      transparent: true,
      opacity: 0.86,
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

  /* ----------------------------------- the card ----------------------------- */

  /**
   * `TILLER · SOIL CORE · TRANSECT 14` in Chakra Petch caps with a graduated bar
   * (bible §9.7), then what the alidade reads off it: lamp, elements, and the named
   * component list with what each one drops. A page of the book, pinned to the right
   * of the frame, with a leader to the Instrument.
   */
  _cardHTML(m) {
    const c = cardParts(m);
    const comps = this.componentRows(m);
    const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const rows = comps.map((r) => {
      const tags = [];
      if (r.weak) tags.push('<i class="calf-tag-weak">WEAK</i>');
      if (r.tearable) tags.push('<i class="calf-tag-pry">PRY</i>');
      if (r.elemental) tags.push(`<i class="calf-tag-el">${ELEM_WORD[r.elemental] ?? String(r.elemental).toUpperCase()}</i>`);
      const loot = r.loot.map((l) =>
        `<span class="calf-loot-chip"><i>${itemIcon(l.id)}</i>${esc(fieldWord(l.name).toUpperCase())}${l.n > 1 ? ` ×${l.n}` : ''}</span>`,
      ).join('');
      return `<div class="calf-comp-row${r.torn ? ' torn' : ''}">
          <span class="calf-comp-name">${esc(r.name)}${r.count > 1 ? `<em>×${r.count}</em>` : ''}</span>
          <span class="calf-comp-tags">${tags.join('')}</span>
          ${loot ? `<span class="calf-comp-loot">${loot}</span>` : ''}
        </div>`;
    }).join('');
    const intact = comps.reduce((n, r) => n + (r.count - r.tornCount), 0);
    const total = comps.reduce((n, r) => n + r.count, 0);
    const word = (e) => ELEM_WORD[e] ?? String(e).toUpperCase();
    const carried = Array.isArray(m.lootTable) && m.lootTable.length
      ? m.lootTable.map((l) => `<span class="calf-loot-chip"><i>${itemIcon(l.id)}</i>${esc(fieldWord(itemDef(l.id).name).toUpperCase())}${l.n > 1 ? ` ×${l.n}` : ''}</span>`).join('')
      : '';
    return `
      <div class="calf-name">${esc(c.name)}</div>
      <div class="calf-class"><span>${esc(c.work)}</span><span>${esc(c.line)}</span></div>
      <div class="calf-bar"><i class="calf-bar-fill"></i><i class="calf-bar-ticks"></i></div>
      <div class="calf-row"><span class="calf-lbl">LAMP</span><span class="calf-lamp"><span class="cal-iris"><i></i></span><b class="calf-lamp-w"></b></span></div>
      ${m.elemWeak ? `<div class="calf-row"><span class="calf-lbl">WEAK TO</span><b>${word(m.elemWeak)}</b></div>` : ''}
      ${m.elemResist ? `<div class="calf-row"><span class="calf-lbl">RESISTS</span><b>${word(m.elemResist)}</b></div>` : ''}
      ${comps.length ? `
        <div class="calf-comp-head">
          <span class="calf-lbl">COMPONENTS</span>
          <span class="calf-comp-n">${intact} / ${total}</span>
        </div>
        <div class="calf-comp-list">${rows}</div>` : ''}
      ${carried ? `<div class="calf-comp-head"><span class="calf-lbl">CARRIES</span></div><div class="calf-comp-loot">${carried}</div>` : ''}
    `;
  }

  /**
   * Named component rows for one Instrument: the data behind the card AND the
   * in-world chips. Reads the published parts contract, plus any weak point no part
   * already accounts for (the lamp), so a kind that ships new parts is described
   * correctly with no change here.
   */
  components(m) {
    const out = [];
    const parts = Array.isArray(m?.parts) ? m.parts : [];
    const wps = Array.isArray(m?.weakPoints) ? m.weakPoints : [];
    for (const w of wps) {
      if (!w?.obj || w.enabled === false) continue;
      const taken = parts.some((p) => p && (p.weakPoint === w || p.name === w.name));
      if (taken) continue;
      out.push({
        part: { mesh: w.obj, radius: w.radius }, name: fieldWord(String(w.name ?? 'WEAK POINT').replace(/[-_]/g, ' ')).toUpperCase(),
        weak: true, tearable: false, torn: false, elemental: null, loot: [], lootText: '',
      });
    }
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
        name: fieldWord(String(p.displayName ?? p.name ?? 'COMPONENT').replace(/[-_]/g, ' ')).toUpperCase(),
        weak: !!p.weak,
        tearable,
        torn: p.attached === false,
        elemental: p.elemental ?? null,
        loot,
        // precomputed so the per-frame label pass never maps/joins
        lootText: loot.map((l) => fieldWord(l.name).toUpperCase()).join(' · '),
      });
    }
    return out;
  }

  /**
   * The same components collapsed by name for the card: three identical rows is a
   * list that scrolls off the page instead of a list that reads, so "BLADE ×3".
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
      this._cardBarM = null;
      this._cardLamp = null;
      this._card.innerHTML = this._cardHTML(m);
    }
    this._card.classList.add('show');
  }

  _hideCard(instant = false) {
    this._card.classList.remove('show');
    this._leaders[LABEL_CAP].style.display = 'none';
    this._leaderU[LABEL_CAP].style.display = 'none';
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
      this._syncCardLive(this._dwellM);
      // the page stays pinned to the right of the frame (stable to read); a leader runs to the Instrument
      const m = this._dwellM;
      const leader = this._leaders[LABEL_CAP], under = this._leaderU[LABEL_CAP];
      _v.copy(m.position);
      _v.y += (m.height ?? 2.4) * 0.72;
      _v.project(this.ctx.camera);
      const w = window.innerWidth, h = window.innerHeight;
      const rect = this._cardRect;
      if (_v.z < 1 && rect) {
        const sx = (_v.x * 0.5 + 0.5) * w;
        const sy = (-_v.y * 0.5 + 0.5) * h;
        const x1 = rect.left, y1 = rect.top + 14;
        if (sx > 0 && sx < x1 - 8 && sy > 0 && sy < h) {
          const pts = `${x1.toFixed(0)},${y1.toFixed(0)} ${(x1 - 22).toFixed(0)},${y1.toFixed(0)} ${sx.toFixed(0)},${sy.toFixed(0)}`;
          leader.setAttribute('points', pts); under.setAttribute('points', pts);
          leader.style.display = ''; under.style.display = '';
        } else { leader.style.display = 'none'; under.style.display = 'none'; }
      } else { leader.style.display = 'none'; under.style.display = 'none'; }
    } else {
      this._leaders[LABEL_CAP].style.display = 'none';
      this._leaderU[LABEL_CAP].style.display = 'none';
      if (this._cardM && this._graceT > CARD_GRACE) this._hideCard();
    }
  }

  /** The two live values on the card: its bar and its lamp. Numeric dirty checks, no strings per frame. */
  _syncCardLive(m) {
    const frac = Math.max(0, Math.min(1, (m.health ?? 0) / (m.maxHealth || 1)));
    const q = Math.round(frac * 100);
    if (this._cardBarQ !== q || this._cardBarM !== m) {
      this._cardBarQ = q; this._cardBarM = m;
      const fill = this._card.querySelector('.calf-bar-fill');
      if (fill) fill.style.transform = `scaleX(${(q / 100).toFixed(2)})`;
    }
    const s = m.lampState ?? 'calm';
    if (this._cardLamp !== s) {
      this._cardLamp = s;
      const lamp = this._card.querySelector('.calf-lamp');
      if (lamp) {
        lamp.dataset.s = s;
        const w = lamp.querySelector('.calf-lamp-w');
        if (w) w.textContent = s.toUpperCase();
      }
    }
  }

  /* ------------------------------- Flagged marks ---------------------------- */

  _onMachineKilled(m) {
    if (!m) return;
    const el = this._tags.get(m);
    if (el) { el.remove(); this._tags.delete(m); }
    // the rims dim via the alive check; drop its transect outright
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
        const di = Math.round(m.position.distanceTo(p.position));
        if (el.__di !== di) { el.__di = di; distEl.textContent = `${String(di).padStart(3, '0')} m`; }
      }
    }
  }

  /* ------------------------- in-world component chips ----------------------- */

  /**
   * Project a world point to an ANCHOR the placement solve may use. false when the
   * point is behind the camera OR outside the viewport: a perspective projection is
   * only meaningful inside the frustum, and noise would move chips the player CAN see.
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

  /** Would a chip at these bounds be readable? Mostly inside, nearly all of it in y (chips stack along y). */
  _boxOnScreen(left, top, right, bottom) {
    const w = window.innerWidth, h = window.innerHeight;
    const vx = Math.min(right, w - VIEW_MARGIN) - Math.max(left, VIEW_MARGIN);
    const vy = Math.min(bottom, h - VIEW_MARGIN) - Math.max(top, VIEW_MARGIN);
    return vx >= (right - left) * VIEW_FRAC && vy >= (bottom - top) * 0.9;
  }

  /** The Instrument whose components get chips: the crosshair target, else the nearest in range. */
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

  /** `components()` allocates and the chip pass is per frame, so it reads a 0.3 s cache. */
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
    let nRings = 0;
    const m = this.on ? this._labelSubject() : null;
    const p = this.ctx.player;
    if (m && p?.position && m.position
      && m.position.distanceTo(p.position) <= LABEL_RANGE) {
      const cx = window.innerWidth * 0.5;
      const cy = window.innerHeight * 0.5;
      let hoverBest = Infinity;
      let hoverIdx = -1;
      // components cluster, so each chip is nudged clear of the ones already placed
      // (12 tries, then it does not draw). The leader keeps it tied to its anchor.
      const placed = this._labelSlots;   // preallocated seats, count below
      let nPlaced = 0;
      // a chip that would land inside the card flips to the Instrument's other side.
      // `_cardRect` is sampled once per frame BEFORE any DOM writes.
      const cardRect = this._cardRect;
      for (const c of this._cachedComponents(m, dt)) {
        if (live.length >= LABEL_CAP) break;
        if (c.torn) continue;
        const node = c.part.mesh;
        if (!node) continue;
        node.getWorldPosition(_v);
        if (!this._project(_v, _screen)) continue;
        const ax = _screen.x, ay = _screen.y;
        // weak points wear a cobalt ring, sized by what the shot has to hit
        if (c.weak && nRings < RING_CAP) {
          const rWorld = c.part.radius ?? 0.25;
          const pxPerM = window.innerHeight / (2 * Math.tan(this.ctx.camera.fov * 0.5 * Math.PI / 180))
            / Math.max(1, _v.distanceTo(this.ctx.camera.position));
          const r = Math.min(64, Math.max(8, rWorld * pxPerM));
          const rec = this._ringRec[nRings];
          rec.x = ax; rec.y = ay; rec.r = r; rec.name = c.name;
          const cr = this._rings[nRings], cu = this._ringsU[nRings];
          const xs = ax.toFixed(1), ys = ay.toFixed(1), rs = r.toFixed(1);
          cr.setAttribute('cx', xs); cr.setAttribute('cy', ys); cr.setAttribute('r', rs);
          cu.setAttribute('cx', xs); cu.setAttribute('cy', ys); cu.setAttribute('r', rs);
          cr.style.display = ''; cu.style.display = '';
          nRings++;
        }
        // The chip hangs to ONE side of its anchor, chosen before the de-overlap
        // solve: off the card, and off the right edge when there is room on the left.
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
        // the leader: anchor, out to the chip's edge
        {
          const lx = _screen.x + (flip ? -PLABEL_GAP : PLABEL_GAP);
          const pts = `${ax.toFixed(0)},${ay.toFixed(0)} ${lx.toFixed(0)},${_screen.y.toFixed(0)}`;
          const li = this._leaders[live.length], lu = this._leaderU[live.length];
          li.setAttribute('points', pts); lu.setAttribute('points', pts);
          li.style.display = ''; lu.style.display = '';
        }
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
        rec.name = c.name; rec.x = _screen.x; rec.y = _screen.y; rec.ax = ax; rec.ay = ay; rec.flip = flip;
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
      if (this._leaders[i].style.display !== 'none') {
        this._leaders[i].style.display = 'none';
        this._leaderU[i].style.display = 'none';
      }
    }
    for (let i = nRings; i < RING_CAP; i++) {
      if (this._rings[i].style.display !== 'none') {
        this._rings[i].style.display = 'none';
        this._ringsU[i].style.display = 'none';
      }
    }
    this._ringsLive = nRings;
  }

  /* ---------------------- LOOT / FIELD BOOK reveals (A63) ------------------- */

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
      if (e.datapoint) kind = 'FIELD BOOK';
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
        name: fieldWord(inter.sourceName ? inter.sourceName(e) : (e.label ?? '')),
        // derived once per poll, not once per frame
        cls: `calf-reveal k-${kind.replace(/\s+/g, '-').toLowerCase()}`,
        rarColor: `var(--cal-r-${rarity})`,
      });
    }
    // Sorted by distance, NOT cut to the twelve that draw: `_updateReveals` fills the
    // pool from the nearest candidate actually on screen.
    src.sort((a, b) => a.d2 - b.d2);
    if (src.length > REVEAL_SRC_CAP) src.length = REVEAL_SRC_CAP;
  }

  _updateReveals() {
    const live = this._revealsLive;
    live.length = 0;
    if (this.on) {
      // a reveal that lands on the card is dropped; every reveal takes a SEAT, nudged
      // clear of the seats already taken (the component-chip pass seeds the list), and
      // one that cannot find a seat in 12 tries does not draw.
      const cardRect = this._cardRect;
      const placed = this._revealSlots;
      let nPlaced = 0;
      for (const l of this._labelsLive) {
        if (nPlaced >= placed.length) break;
        const seat = placed[nPlaced++];
        // a chip hangs to ONE side of its anchor, so seat its rough CENTRE
        seat.x = l.x + (l.flip ? -PLABEL_MID : PLABEL_MID);
        seat.y = l.y;
      }
      // card bounds unrolled into plain numbers (no closure per frame)
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
              // kind + name: up to ~190 px wide, ~20 px tall, both centred on the anchor
              if (Math.abs(_screen.y - q.y) < 22 && Math.abs(_screen.x - q.x) < 190) {
                ok = false;
                break;
              }
            }
          }
          if (ok) break;
          _screen.y -= 22;             // stack upward, away from the pickup
          // off the top of the frame: this one does not draw
          if (_screen.y - REVEAL_H < VIEW_MARGIN) { ok = false; break; }
        }
        if (!ok) continue;
        if (nPlaced < placed.length) {
          const seat = placed[nPlaced++];
          seat.x = _screen.x; seat.y = _screen.y;
        }
        const slot = this._revealPool[live.length];
        // only touch the DOM when the value changed: position moves every frame
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

  /** The Instrument currently under the crosshair (null when the alidade is down). */
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
      shells: { parts: this._parts.size, machines: this._hulls.size },
      rings: this._ringRec.slice(0, this._ringsLive).map((r) => ({ name: r.name, x: Math.round(r.x), y: Math.round(r.y), r: +r.r.toFixed(1) })),
      leaders: this._leaders.filter((l) => l.style.display !== 'none').length,
      readouts: { bearing: this._brgEl.textContent, distance: this._dstEl.textContent },
      paths: {
        count: this._paths.size,
        // derived: a splined ribbon carries many more samples than waypoints
        splined: this._pathSamples > this._pathWaypoints * 3,
        samples: this._pathSamples,
        waypoints: this._pathWaypoints,
        skipped: this._pathSkipped,
      },
      vignette: this._vignette(),
    };
  }

  /**
   * Measured vignette strength (bible §9.7: at most 20 %). Reads the live computed
   * style, so the number can never drift from the CSS that ships.
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

  /* -------------------------------- readouts -------------------------------- */

  /**
   * Bearing and range under the crosshair. The bearing is integer-checked; the range
   * marches the camera ray over the heightfield at 5 Hz (or reads the target's), and
   * only touches the DOM when the metre changes.
   */
  _updateReadouts(dt) {
    const p = this.ctx.player;
    if (!p) return;
    const b = Math.round((((-p.camYaw * 180 / Math.PI) % 360) + 360) % 360) % 360;
    if (b !== this._lastBrg) {
      this._lastBrg = b;
      this._brgEl.textContent = String(b).padStart(3, '0');
    }
    this._rangeT -= dt;
    if (this._rangeT > 0) return;
    this._rangeT = 0.2;
    const cam = this.ctx.camera, T = this.ctx.terrain;
    let range = -1;
    if (this._target?.position) range = this._target.position.distanceTo(cam.position);
    else if (cam && T?.getHeight) {
      cam.getWorldDirection(_dir);
      const ox = cam.position.x, oy = cam.position.y, oz = cam.position.z;
      for (let d = 4; d <= 400; d += 4) {
        if (oy + _dir.y * d < T.getHeight(ox + _dir.x * d, oz + _dir.z * d)) { range = d; break; }
      }
    }
    const q = Math.round(range);
    if (q !== this._lastDst) {
      this._lastDst = q;
      this._dstEl.textContent = q < 0 ? '---' : String(q).padStart(3, '0');
    }
  }

  /* ---------------------------------- frame -------------------------------- */

  update(dt, t) {
    const ctx = this.ctx;
    const inShot = !!ctx.params?.has('shot');
    const live = ctx.state === 'playing' || inShot;
    const domVisible = live || (ctx.state === 'title' && inShot);
    this._layer.style.display = domVisible ? '' : 'none';

    // --- the raising sweep: one dashed hairline over the ground ---
    if (this._waveT < RING_LIFE) {
      this._waveT += dt;
      const tt = this._waveT;
      if (tt < RING_LIFE) {
        this._updateRing(2 + RING_SPEED * tt);
        this._ringMat.uniforms.uFade.value = 0.8 * (1 - tt / RING_LIFE);
      } else {
        this._ring.visible = false;
      }
    } else if (this._ring.visible) {
      this._ring.visible = false;
    }

    // --- the drawn figure ---
    this._figureDone = false;
    const wantK = this.on ? 1 : 0;
    if (this._hullK !== wantK || this._hulls.size) {
      this._hullK = THREE.MathUtils.clamp(
        this._hullK + (wantK ? dt / 0.3 : -dt / 0.35), 0, 1);
      this._figureMat.uniforms.uHull.value = this._hullK;
      if (this._hullK <= 0 && !this.on) this._disposeHulls();
    }
    if (this.on) {
      this._hullPoll -= dt;
      if (this._hullPoll <= 0) {
        this._hullPoll = 1.0;
        this._buildHulls(); // pick up Instruments that spawned after raising
        this._buildPaths(); // ... and their transects
      }
    }

    // --- component outlines (+ a 6 s linger after the alidade comes down) ---
    this._partPoll -= dt;
    if (this._partPoll <= 0 && (this.on || this._parts.size)) {
      this._partPoll = GATHER_TICK;
      this._refreshParts();
    }
    if (this.on) {
      this._figureMat.uniforms.uPart.value = 1;
    } else if (this._parts.size) {
      this._offT += dt;
      if (this._offT >= PART_LINGER) this._disposeParts();
      else this._figureMat.uniforms.uPart.value = Math.min(1, (PART_LINGER - this._offT) / PART_FADE);
    } else if (this._figure.visible && !this._hulls.size) {
      this._releaseFigure();
    }

    // --- transects (fade out from under an Instrument that leaves one) ---
    if (this._paths.size) {
      for (const [m, e] of this._paths) {
        e.mat.uniforms.uTime.value = t;
        const want = this.on && this._walksRoute(m);
        const f = THREE.MathUtils.clamp(
          e.mat.uniforms.uFade.value + (want ? dt / 0.4 : -dt / 0.25), 0, 1);
        e.mat.uniforms.uFade.value = f;
        e.mesh.visible = f > 0.01 && m.alive !== false;
        // fully faded and off-route: drop it, it rebuilds when the Instrument walks again
        if (f <= 0 && !want) {
          this.ctx.scene.remove(e.mesh);
          e.mesh.geometry.dispose();
          e.mat.dispose();
          this._paths.delete(m);
        }
      }
    }

    // --- gather marks ---
    if (this.on) {
      this._gatherPoll -= dt;
      if (this._gatherPoll <= 0) {
        this._gatherPoll = GATHER_TICK;
        this._refreshGather();
      }
      this._updateReadouts(dt);
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

    // --- DOM: the card + component chips + reveals + Flagged marks ---
    // one rect read per frame, BEFORE anything writes a style, so the passes never reflow
    this._cardRect = this._card.classList.contains('show')
      ? this._card.getBoundingClientRect() : null;
    this._updateCard(dt);
    this._updatePartLabels(dt);
    this._updateReveals();
    this._updateTags();
  }

  /** Every runtime object this system holds, for the page's teardown. */
  dispose() {
    this.abort();
    for (const el of this._tags.values()) el.remove();
    this._tags.clear();
    this.ctx.scene.remove(this._figure);
    this._figure.geometry.dispose();
    this._figureMat.dispose();
    this._hullMaskMat.dispose();
    this._partMaskMat.dispose();
    this._heroMaskMat.dispose();
    this.ctx.engine?.unregisterRenderTarget?.(this._figureRT);
    this._figureRT.dispose();
    this.ctx.scene.remove(this._ring);
    this._ring.geometry.dispose();
    this._ringMat.dispose();
    this.ctx.scene.remove(this._gather);
    this._tint.remove();
    this._layer.remove();
  }
}

/** main.js imports this name (one line for the orchestrator at W2; the class is `SightingSystem`). */
export { SightingSystem as FocusSystem };
