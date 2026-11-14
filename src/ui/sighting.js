import * as THREE from 'three';
import './sighting.css';
import { itemDef, rarityDef } from '../items/items.js';
import { fieldWord, cardParts } from './tips.js';
import { itemIcon, bookHeading } from './inventory.js';

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
 * THE OVERLAY IS DRAWN AFTER THE COMPOSER (`engine.onAfterRender`), on the finished frame at
 * display resolution: no grade, bloom or AO touches a hairline, and the scene's depth texture
 * is free to read. Draw budget raised (R61 d, at most 30, `A-sighting-draws`): figure 1, the
 * sighted Instrument <= 6 + <= 6 components, the nearest others <= 3 x 2, Brea <= 6, transects
 * <= 2, gather marks 1, the raising sweep 1: 29 at the very worst.
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
const PART_CAP = 6;        // component outlines alive at once: the sighted Instrument's, never a herd's (R61 d)
const PART_RANGE = 150;    // only outline parts on Instruments within this range

const PATH_RANGE = 180;    // transects drawn for Instruments within this range
const PATH_CAP = 2;        // the sighted Instrument's transect and the nearest other's: a herd's thirteen read as road paint
const PATH_OTHER = 0.5;    // the other transect's weight against the sighted one's

const HULL_RANGE = 120;    // the sighted Instrument's figure: only inside this range
const HULL_MESHES = 6;     // mask draws for the sighted Instrument
const HERO_MESHES = 6;     // ...and for Brea: every skinned mesh first, then what she holds, largest first
const QUIET_CAP = 3;       // the others drawn at all: the nearest, as a quiet solid hairline
const QUIET_MESHES = 2;    // ...their largest meshes only
const QUIET_RANGE = 70;
const SUBJECT_HOLD = 0.75; // seconds the figure stays on its Instrument before it may change

const GATHER_CAP = 40;     // pooled survey marks over gather nodes
const GATHER_TICK = 0.25;  // seconds between gather/parts registry polls

const CARD_DWELL = 0.4;    // crosshair-on-Instrument seconds before the card shows
const CARD_GRACE = 0.35;   // off-target seconds before the card fades

const LABEL_CAP = 10;      // pooled component chips on screen at once
const LABEL_RANGE = 70;    // only label parts on Instruments this close
const RING_CAP = 12;       // pooled weak-point rings
const REVEAL_CAP = 8;      // pooled reveal chips ON SCREEN at once
const REVEAL_TEXT_RANGE = 25;   // U-02: words only for finds this close...
const REVEAL_TEXT_FRAC = 0.22;  // ...and this near the crosshair (fraction of the width), two at most
const REVEAL_TICK_CAP = 12;     // the rest are 6 px ink ticks
/**
 * Candidates kept per poll. Visibility decides which twelve draw; distance only
 * decides the order they are tried in.
 */
const REVEAL_SRC_CAP = 48;
const REVEAL_RANGE = 60;   // metres the alidade reads a lootable / Field Book at
const REVEAL_TICK = 0.2;   // seconds between interactable registry polls

/* on-screen placement: a chip points AT a thing, so it cannot be clamped without
 * lying; one that cannot fit is skipped and the slot goes to the next candidate. */
const VIEW_MARGIN = 8;     // px a label box must reach inside the frame
const VIEW_FRAC = 0.6;     // ...and this much of its width must be inside
const PLABEL_GAP = 34;     // the leader's run from anchor to chip
const PLABEL_W = 190;      // widest name + loot text
const PLABEL_H = 11;       // half-height
const PLABEL_MID = PLABEL_GAP + PLABEL_W * 0.5;  // anchor -> box centre
const OBJ_HW = 30;          // the HUD's objective mark (arrow over its metres): half its box, CSS px
const OBJ_HH = 22;
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
 * She stands in front of what she reads: her real meshes hold the mask's blue channel, and nothing
 * the alidade draws goes over them. `uKnock` is 0 only for the negative control of
 * `A-sighting-over-brea`.
 */
const HER_GLSL = /* glsl */ `
  uniform sampler2D uMask;
  uniform vec2 uRes;
  uniform float uKnock;
  float notHer(vec2 uv) {
    if (uKnock < 0.5) return 1.0;
    return 1.0 - smoothstep(0.2, 0.55, texture2D(uMask, uv).b);
  }`;

/**
 * THE DRAWN FIGURE (R54: Fresnel rims and a screen-space dash pattern read as static and
 * crumbs on small geometry). The mask is half-resolution with 4x MSAA, so a thin strut carries
 * real coverage; R is the sighted Instrument, G its components, A the quiet others, B Brea.
 *
 * A band is a dilation, not an iso-line: `d1`, `d2`, `d3` are the mask dilated by rings of radius
 * 0.8, 2.2 and 3.4 px, so a strut one pixel wide is a solid line and never a row of flecks. The
 * paper core lies between d1 and d2, the ink casing runs from the edge out to d3, so the
 * line holds on sunlit grass as it does on dark ground.
 *
 * The dash is anchored on the Instrument, not on the screen: polar angle around its projected
 * centre plus radius, in target pixels (`uCentre`, `uDashN`, `uDash`), so a long contour and a
 * radial one both cut at the same pace and the pattern travels with the Instrument. A raise pays
 * the dashes out from nothing; lowering takes them back in.
 *
 * Cover, off the scene's own depth (`uFrontZ`): something standing between the lens and the
 * Instrument leaves the line at a quiet 38 %, so the figure still reads through grass and trunks.
 */
const FIGURE_FS = /* glsl */ `
  uniform sampler2D uDepth;
  uniform float uNear;
  uniform float uFar;
  uniform vec2 uPx;       // one target pixel in uv
  uniform float uK;       // target px per 1600x900 px
  uniform vec2 uCentre;   // the sighted Instrument's centre, target px, y up
  uniform float uDash;    // dash period, target px
  uniform float uDashN;   // whole dashes around it, so the angle closes without a seam
  uniform float uFrontZ;  // anything nearer than this stands in front of the sighted Instrument
  uniform float uHerFront; // 1 while she is nearer than it
  uniform float uHull;
  uniform float uPart;
  uniform float uQuiet;
  uniform vec3 uInk;
  uniform vec3 uPaper;
  ${HER_GLSL}
  const vec2 D8[8] = vec2[8](vec2(1.0, 0.0), vec2(0.7071, 0.7071), vec2(0.0, 1.0), vec2(-0.7071, 0.7071),
                             vec2(-1.0, 0.0), vec2(-0.7071, -0.7071), vec2(0.0, -1.0), vec2(0.7071, -0.7071));
  vec4 ring(vec2 uv, float r) {
    vec4 m = vec4(0.0);
    for (int i = 0; i < 8; i++) m = max(m, texture2D(uMask, uv + D8[i] * r * uPx));
    return m;
  }
  float cov(float x) { return smoothstep(0.32, 0.62, x); }
  void main() {
    vec2 uv = gl_FragCoord.xy * uPx;
    float r3 = 3.4 * uK;
    vec4 d3 = ring(uv, r3);
    vec4 c0 = texture2D(uMask, uv);
    d3 = max(d3, c0);
    if (d3.r + d3.g + d3.a < 0.03) discard;             // most of the frame: nine taps and out
    vec4 d1 = max(c0, ring(uv, 0.8 * uK));
    vec4 d2 = max(d1, ring(uv, 2.2 * uK));
    d3 = max(d3, d2);

    // the dash, on the Instrument
    vec2 q = gl_FragCoord.xy - uCentre;
    float ph = atan(q.y, q.x) / 6.28318530718 * uDashN + length(q) / uDash;
    float f = fract(ph);
    float soft = 1.1 / uDash;
    float on = 0.64 * uHull;
    float dash = smoothstep(0.0, soft, f) * (1.0 - smoothstep(on, on + soft, f));

    // what stands in front of it
    float her = notHer(uv);
    float zd = texture2D(uDepth, uv).r * 2.0 - 1.0;
    float s = 2.0 * uNear * uFar / (uFar + uNear - zd * (uFar - uNear));
    float covered = uKnock < 0.5 ? 0.0 : 1.0 - smoothstep(uFrontZ - 0.12, uFrontZ + 0.12, s);
    float clear = mix(1.0, her, uHerFront) * (1.0 - covered * 0.62);

    // the sighted Instrument: paper on an ink casing
    float hullIn = cov(c0.r);
    float inkH = cov(d3.r) * (1.0 - hullIn) * dash * clear;
    float papH = (cov(d2.r) - cov(d1.r)) * dash * clear;
    // its components: ink with a paper tooth, inside the figure
    float partIn = cov(c0.g);
    float papP = cov(d3.g) * (1.0 - partIn) * uPart * clear;
    float inkP = cov(d2.g) * (1.0 - partIn) * dash * uPart * clear;
    // the others: a solid hairline, quiet, never over her; ink-led, so a second Instrument reads as a
    // pencilled note on the sheet, not as an x-ray (r1 gate judge)
    float inkQ = cov(d3.a) * (1.0 - cov(c0.a)) * uQuiet * her * 0.38;
    float papQ = (cov(d2.a) - cov(d1.a)) * uQuiet * her * 0.24;

    float aInk = max(inkH * 0.8, max(inkQ, inkP * 0.96));
    float aPap = max(papH * 0.98, max(papQ, papP * 0.5 * (1.0 - inkP)));
    float a = aPap + aInk * (1.0 - aPap);
    if (a <= 0.003) discard;
    vec3 col = mix(uInk, uPaper, aPap / a);
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }`;

/** A transect: a fat line in screen space, so no camera distance turns it into a slab. */
const PATH_VS = /* glsl */ `
  attribute vec3 aPrev;
  attribute vec3 aNext;
  uniform vec2 uRes;
  uniform float uK;
  varying float vD;
  varying float vE;
  varying float vZ;
  varying float vTilt;
  void main() {
    vD = uv.x;                      // metres along the loop
    vE = uv.y * 2.0 - 1.0;          // across it
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vZ = -mv.z;
    vec4 c = projectionMatrix * mv;
    vec4 a = projectionMatrix * modelViewMatrix * vec4(aPrev, 1.0);
    vec4 b = projectionMatrix * modelViewMatrix * vec4(aNext, 1.0);
    vTilt = 0.0;
    if (c.w < 0.5 || a.w < 0.5 || b.w < 0.5) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }  // at the camera: the near fade has it
    vec2 d = (b.xy / b.w - a.xy / a.w) * uRes;
    vec2 n = vec2(-d.y, d.x) / max(length(d), 1e-3);
    gl_Position = vec4(c.xy / c.w + n * vE * 5.0 * uK * 2.0 / uRes, 0.0, 1.0);
    // seen almost edge-on, the far side of a loop stacks on the near side: fade with the grazing angle
    vTilt = smoothstep(0.012, 0.06, abs(normalize(cameraPosition - position).y));
  }`;

/**
 * A surveyor's chain line: a 1.5 px paper core on an ink casing, dashes 0.9 m long on a 1.5 m pace
 * walking slowly, and a station tick every 7.5 m, which stays put as a chainage does.
 */
const PATH_FS = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uWeight;
  uniform float uK;
  uniform vec3 uPaper;
  uniform vec3 uInk;
  varying float vD;
  varying float vE;
  varying float vZ;
  varying float vTilt;
  ${HER_GLSL}
  void main() {
    float e = abs(vE) * 5.0 * uK;                     // target px from the centre line
    float core = 1.0 - smoothstep(0.75 * uK - 0.45, 0.75 * uK + 0.45, e);
    float cas = 1.0 - smoothstep(1.8 * uK - 0.45, 1.8 * uK + 0.45, e);
    float fw = max(fwidth(vD), 1e-4);                 // metres per target px
    float m = fract((vD - uTime * 0.35) / 1.5);
    float soft = fw / 1.5;
    float dash = smoothstep(0.0, soft, m) * (1.0 - smoothstep(0.6, 0.6 + soft, m));
    // a pace under 6 px cannot carry a dash: the line goes steady and lighter, never sparkle
    dash = mix(0.6, dash, smoothstep(6.0, 11.0, 1.5 / fw));
    float st = abs(fract(vD / 7.5 + 0.5) - 0.5) * 7.5;  // metres to the nearest station
    float tickK = 1.0 - smoothstep(40.0, 60.0, vZ);
    float tick = (1.0 - smoothstep(fw * uK * 0.5, fw * uK * 1.1, st)) * tickK;
    float tickCase = (1.0 - smoothstep(fw * uK * 1.3, fw * uK * 2.1, st)) * tickK;
    float paper = max(core * dash, tick);
    float ink = max(cas * dash, tickCase) * 0.62;
    float far = 1.0 - smoothstep(95.0, 125.0, vZ);    // gone past ~120 m
    float nearK = smoothstep(3.0, 7.5, vZ);           // never a slab across the foreground
    float k = uFade * uWeight * far * nearK * vTilt * notHer(gl_FragCoord.xy / uRes);
    float a = (paper * 0.96 + ink * (1.0 - paper * 0.96)) * k;
    if (a <= 0.003) discard;
    gl_FragColor = vec4(mix(uInk, uPaper, paper), a);
    #include <colorspace_fragment>
  }`;

const _clear = new THREE.Color();

/** Nearest-first order for the quiet others (see `_refreshFigure`). */
const _byNearest = (a, b) => a.__sightD2 - b.__sightD2;

const _trisOf = (o) => (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
/** Her mask's order: every skinned mesh, then the largest of the rest. */
/** One Liang-Barsky clip step on T = [t0, t1]; false when the segment misses the box. */
function _lbClip(T, p, q) {
  if (p === 0) return q >= 0;
  const r = q / p;
  if (p < 0) { if (r > T[1]) return false; if (r > T[0]) T[0] = r; } else { if (r < T[0]) return false; if (r < T[1]) T[1] = r; }
  return true;
}
const _heroRank = (a, b) => (b.isSkinnedMesh ? 1 : 0) - (a.isSkinnedMesh ? 1 : 0) || _trisOf(b) - _trisOf(a);

/** Really in the world: this object and every ancestor. `visible` alone says nothing about a hidden holder. */
function shownInWorld(o) {
  for (let a = o; a; a = a.parent) if (!a.visible) return false;
  return !!o?.parent;
}

export class SightingSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.on = false;        // the alidade is raised
    this.active = false;    // legacy alias: mirrors .on
    this._waveT = 99;       // time since raising (drives the sweep)
    this._origin = new THREE.Vector3();

    // the overlay's own scene: drawn on the finished frame (`_afterComposer`)
    this._overlayScene = new THREE.Scene();
    this._overlayScene.name = 'sighting-overlay';
    this._shared = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uK: { value: 1 },
      uMask: { value: null },   // the figure's mask (`_buildFigure`)
      uKnock: { value: 1 },
      uTime: { value: 0 },
      uInk: { value: new THREE.Color('#1C1B1E') },     // lapilli: mixes with green ground into nothing teal
      uPaper: { value: new THREE.Color('#F1EEE6') },
    };

    // the drawn figure: Map machine -> { meshes[], quiet }, in a mask of their own
    this._hulls = new Map();
    this._subject = null;   // the one Instrument drawn in full
    this._subjectHold = 0;
    this._quiet = [];       // scratch: the others drawn quietly, nearest first
    this._hullK = 0;        // master fade 0..1 for the figure
    this._hullPoll = 0;
    this._pathPoll = 0;
    this._dashN = 0;
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
    this._overlayScene.add(this._ring);

    this._gather = this._buildGatherPoints();
    this._gather.visible = false;
    this._overlayScene.add(this._gather);
    this._gatherPoll = 0;

    this._afterComposer = (engine) => this._drawOverlay(engine);
    ctx.engine?.onAfterRender?.push(this._afterComposer);

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
    this._refreshFigure();
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
    this._ink.setAttribute('data-shape', 'ring');   // weak-point rings: discs by role (A-glass-language-static)
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
    this._ringRec = Array.from({ length: RING_CAP }, () => ({ x: 0, y: 0, r: 0, name: '', qx: NaN, qy: NaN, qr: NaN }));
    this._leaderQ = new Int32Array((LABEL_CAP + 1) * 6).fill(-1);

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
      `<svg viewBox="-280 -190 560 380" aria-hidden="true"><path class="u" d="${d}"/><path class="t" d="${d}"/></svg>`;
    this._layer.appendChild(this._reticle);

    // the card: glass, pinned right. Its header carries the bearing and the range (U-02: the
    // floating readout box is gone); the body below is rebuilt when the subject changes.
    this._card = document.createElement('div');
    this._card.className = 'calf-card cal-glass';
    this._card.innerHTML = '<div class="calf-card-read"><span>BRG</span><b class="calf-brg">000</b>'
      + '<span>DST</span><b class="calf-dst">---</b><i>m</i></div><div class="calf-card-body"></div>';
    this._brgEl = this._card.querySelector('.calf-brg');
    this._dstEl = this._card.querySelector('.calf-dst');
    this._cardBody = this._card.querySelector('.calf-card-body');
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
    this._rvX = new Float32Array(REVEAL_SRC_CAP);   // pass 1 of `_updateReveals`: projected anchors
    this._rvY = new Float32Array(REVEAL_SRC_CAP);
    this._rvSel = new Uint8Array(REVEAL_SRC_CAP);
    this._tickPool = [];
    for (let i = 0; i < REVEAL_TICK_CAP; i++) {
      const el = document.createElement('i');
      el.className = 'calf-rtick';
      el.style.display = 'none';
      this._layer.appendChild(el);
      this._tickPool.push({ el, x: NaN, y: NaN, shown: false });
    }
    this._ticksLive = 0;
    this._hideBox = new Float32Array(12);
    this._herBox = new Float32Array(4);
    this._domKeepOff = true;        // false only for A-sighting-over-brea's negative control
    this._clipT = new Float32Array(2);
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
      uniforms: { ...this._shared, uFade: { value: 0 }, uColor: this._shared.uPaper },
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
        ${HER_GLSL}
        void main() {
          float dash = step(0.5, fract(vUv.x * 96.0));
          float a = dash * uFade * notHer(gl_FragCoord.xy / uRes);
          if (a <= 0.003) discard;
          gl_FragColor = vec4(uColor, a);
          #include <colorspace_fragment>
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
   * One half-resolution coverage mask and one contour pass (`FIGURE_FS`), both on the finished
   * frame. The target exists while a figure is on the sheet: `_releaseFigure()` frees it when the
   * alidade is down and its linger has run out.
   */
  _buildFigure() {
    this._maskScene = new THREE.Scene();
    this._maskScene.name = 'sighting-figure-mask';
    const maskMat = (rgba) => new THREE.ShaderMaterial({
      vertexShader: MASK_VS,
      fragmentShader: `void main() { gl_FragColor = vec4(${rgba}); }`,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this._hullMaskMat = maskMat('1.0, 0.0, 0.0, 0.0');
    this._partMaskMat = maskMat('1.0, 1.0, 0.0, 0.0');
    this._quietMaskMat = maskMat('0.0, 0.0, 0.0, 1.0');
    this._heroMaskMat = maskMat('0.0, 0.0, 1.0, 0.0');
    this._heroShells = new Map();   // her mesh -> its shell
    this._heroWant = [];            // scratch
    this._heroVisit = (o) => {
      if (o.isMesh && !o.isInstancedMesh && !o.userData.__sightOverlay && shownInWorld(o)) this._heroWant.push(o);
    };

    this._figureRT = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false, samples: 4,
    });
    this._figureRT.texture.name = 'sighting-figure-mask';
    this.ctx.engine?.registerRenderTarget?.('shell-ui sighting figure mask', this._figureRT);
    this._shared.uMask.value = this._figureRT.texture;

    this._figureMat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false,
      blending: THREE.NormalBlending,
      uniforms: {
        ...this._shared,
        uDepth: { value: null },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uPx: { value: new THREE.Vector2(1, 1) },
        uCentre: { value: new THREE.Vector2(0, 0) },
        uDash: { value: 11 },
        uDashN: { value: 12 },
        uFrontZ: { value: -1000 },
        uHerFront: { value: 1 },
        uHull: { value: 0 },
        uPart: { value: 0 },
        uQuiet: { value: 0 },
      },
      vertexShader: 'void main() { gl_Position = vec4(uv, 0.0, 1.0); }',
      fragmentShader: FIGURE_FS,
    });
    // a quad in clip space (the vertex stage reads `uv`), rewritten each frame round the figures on
    // screen: the pass is nine taps a pixel, and most of a frame holds nothing to draw
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(8), 2));
    geo.setIndex([0, 1, 2, 2, 1, 3]);
    this._figureQuad = geo.getAttribute('uv');
    this._quadBox = new Float32Array(4);
    this._figure = new THREE.Mesh(geo, this._figureMat);
    this._figure.name = 'sighting-figure';
    this._figure.frustumCulled = false;
    this._figure.renderOrder = 9990;   // last: its contour lies over the transects
    this._figure.visible = false;
    this._overlayScene.add(this._figure);
  }

  /** `engine.onAfterRender`: the overlay, on the frame the composer just finished. Nothing up: one branch. */
  _drawOverlay(engine) {
    const fig = this._figure.visible;
    if (!fig && !this._paths.size && !this._ring.visible && !this._gather.visible) return;
    const r = engine.renderer, cam = this.ctx.camera;
    const w = r.domElement.width, h = r.domElement.height;
    const U = this._shared;
    U.uRes.value.set(w, h);
    U.uK.value = Math.max(0.75, h / 900);
    cam.getWorldDirection(_dir);

    const clearA = r.getClearAlpha();
    const autoClear = r.autoClear;
    r.autoClear = false;
    r.getClearColor(_clear);
    if (fig) {
      const uF = this._figureMat.uniforms;
      uF.uDepth.value = engine.depthTexture;
      uF.uNear.value = cam.near;
      uF.uFar.value = cam.far;
      this._syncSubject(w, h, cam);
      this._fitFigureQuad(w, h, cam);
    }
    this._renderFigureMask(r, cam, w, h);
    r.setClearColor(_clear, clearA);
    r.setRenderTarget(null);
    r.render(this._overlayScene, cam);
    r.autoClear = autoClear;
  }

  /** The dash's anchor and what counts as in front of the sighted Instrument, for this frame's camera. */
  _syncSubject(w, h, cam) {
    const u = this._figureMat.uniforms, k = this._shared.uK.value;
    u.uPx.value.set(1 / w, 1 / h);
    u.uDash.value = 11 * k;
    u.uFrontZ.value = -1000;
    u.uHerFront.value = 1;
    const m = this._subject;
    const pos = m?.position ?? m?.root?.position;
    if (!pos) return;
    const mh = m.height ?? 2.4;
    _v.set(pos.x, pos.y + mh * 0.5, pos.z);
    const z = (_v.x - cam.position.x) * _dir.x + (_v.y - cam.position.y) * _dir.y + (_v.z - cam.position.z) * _dir.z;
    if (z <= 0.5) return;
    const bound = Math.max(mh * 0.6, (m.bodyRadius ?? 1.4) * 1.3);
    u.uFrontZ.value = z - bound;
    const her = this.ctx.player?.position;
    if (her) {
      const hz = (her.x - cam.position.x) * _dir.x + (her.y + 1 - cam.position.y) * _dir.y + (her.z - cam.position.z) * _dir.z;
      u.uHerFront.value = hz < z ? 1 : 0;   // an Instrument on top of her is drawn over her
    }
    _v.project(cam);
    u.uCentre.value.set((_v.x * 0.5 + 0.5) * w, (_v.y * 0.5 + 0.5) * h);
    // whole dashes around it, so the angle closes; held steady while the Instrument's size wobbles by less than a dash
    const rPx = bound * (h * 0.5 / Math.tan(cam.fov * Math.PI / 360)) / z;
    const n = Math.max(6, Math.round(6.2832 * rPx / u.uDash.value));
    if (Math.abs(n - this._dashN) > 1) this._dashN = n;
    u.uDashN.value = this._dashN;
  }

  /** The figure pass's quad: the union of what is drawn, projected, with a line's width to spare. */
  _fitFigureQuad(w, h, cam) {
    const q = this._quadBox;
    q[0] = 2; q[1] = 2; q[2] = -2; q[3] = -2;
    for (const m of this._hulls.keys()) this._takeBounds(m, w, h, cam);
    for (const e of this._parts.values()) this._takeBounds(e.machine, w, h, cam);
    const x0 = Math.max(-1, q[0]), y0 = Math.max(-1, q[1]), x1 = Math.min(1, q[2]), y1 = Math.min(1, q[3]);
    const none = x1 <= x0 || y1 <= y0;                      // nothing on screen: an empty quad
    const a = this._figureQuad.array;
    a[0] = none ? 0 : x0; a[1] = none ? 0 : y0;
    a[2] = none ? 0 : x1; a[3] = none ? 0 : y0;
    a[4] = none ? 0 : x0; a[5] = none ? 0 : y1;
    a[6] = none ? 0 : x1; a[7] = none ? 0 : y1;
    this._figureQuad.needsUpdate = true;
  }

  _takeBounds(m, w, h, cam) {
    const pos = m?.position ?? m?.root?.position;
    if (!pos) return;
    const q = this._quadBox;
    const mh = m.height ?? 2.4;
    const rad = Math.max(mh, (m.bodyRadius ?? 1.4) * 3);    // every kind's whole body, a stride included
    _v.set(pos.x, pos.y + mh * 0.5, pos.z);
    const z = (_v.x - cam.position.x) * _dir.x + (_v.y - cam.position.y) * _dir.y + (_v.z - cam.position.z) * _dir.z;
    if (z < rad + 0.5) {                                    // at the lens: the whole frame
      if (z > -rad) { q[0] = -1; q[1] = -1; q[2] = 1; q[3] = 1; }
      return;
    }
    const px = rad * (h * 0.5 / Math.tan(cam.fov * Math.PI / 360)) / z + 8 * this._shared.uK.value;
    const rx = px * 2 / w, ry = px * 2 / h;
    _v.project(cam);
    if (_v.x - rx < q[0]) q[0] = _v.x - rx;
    if (_v.x + rx > q[2]) q[2] = _v.x + rx;
    if (_v.y - ry < q[1]) q[1] = _v.y - ry;
    if (_v.y + ry > q[3]) q[3] = _v.y + ry;
  }

  _renderFigureMask(r, cam, w, h) {
    const mw = Math.max(2, w >> 1), mh = Math.max(2, h >> 1);
    const rt = this._figureRT;
    if (rt.width !== mw || rt.height !== mh) rt.setSize(mw, mh);
    // the source's world matrix is current here: the main pass has already updated the graph
    for (const e of this._hulls.values()) this._rideSources(e.meshes);
    for (const e of this._parts.values()) this._rideSources(e.meshes);
    for (const mesh of this._heroShells.values()) {
      const src = mesh.userData.__src;
      mesh.visible = shownInWorld(src);   // through every ancestor: hidden kit knocks out no air
      if (mesh.visible) { mesh.matrix.copy(src.matrixWorld); mesh.matrixWorldNeedsUpdate = true; }
    }
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    r.render(this._maskScene, cam);
  }

  _rideSources(meshes) {
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i], src = mesh.userData.__src;
      mesh.visible = !!src?.parent;
      if (mesh.visible) { mesh.matrix.copy(src.matrixWorld); mesh.matrixWorldNeedsUpdate = true; }
    }
  }

  /** The negative control of `A-sighting-over-brea`: false lets the overlay draw through her. */
  debugOcclusion(on) { this._shared.uKnock.value = on ? 1 : 0; this._domKeepOff = !!on; }

  /** Draws the raised alidade adds to the frame right now: the mask's, and the overlay's own. */
  overlayDraws() {
    let mask = 0, own = 0;
    for (const c of this._maskScene.children) if (c.visible) mask++;
    for (const c of this._overlayScene.children) if (c.visible) own++;
    return { mask, own, total: mask + own };
  }

  /**
   * Brea's real meshes for the mask: every skinned one first, then what she holds, largest first.
   * Polled while the alidade is up: she can unstow or swap what she carries.
   */
  _refreshHero() {
    const want = this._heroWant;
    want.length = 0;
    this.ctx.player?.model?.traverse(this._heroVisit);
    want.sort(_heroRank);
    if (want.length > HERO_MESHES) want.length = HERO_MESHES;
    for (const [src, mesh] of this._heroShells) {
      if (want.includes(src)) continue;
      mesh.parent?.remove(mesh);
      this._heroShells.delete(src);
    }
    for (let i = 0; i < want.length; i++) {
      if (!this._heroShells.has(want[i])) this._heroShells.set(want[i], this._overlayFor(want[i], this._heroMaskMat));
    }
  }

  _clearHero() {
    for (const mesh of this._heroShells.values()) mesh.parent?.remove(mesh);
    this._heroShells.clear();
  }

  /** Nothing on the sheet: the pass stops and the mask's memory goes back. */
  _releaseFigure() {
    if (this.on || this._hulls.size || this._parts.size) return;
    this._clearHero();
    this._figure.visible = false;
    this._figureRT.dispose();
  }

  /**
   * A shell in the figure's mask, on its source's geometry and bones. It rides the source's
   * world matrix (`_rideSources`) because the source can sit under a holder group that
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

  /**
   * Who is drawn. The Instrument under the crosshair (else the nearest) in full; the nearest
   * others as a quiet hairline; nobody else: a herd of outlines is what read as static.
   * Polled, reconciled in place: a shell is only built when the cast changes.
   */
  _refreshFigure() {
    this._refreshHero();
    const list = this.ctx.machines?.list;
    const p = this.ctx.player;
    if (!Array.isArray(list) || !p?.position) return;
    this._subjectHold -= GATHER_TICK;
    let want = this._labelSubject();
    if (want && want.position.distanceToSquared(p.position) > HULL_RANGE * HULL_RANGE) want = null;
    const cur = this._subject;
    if (cur?._disposed || cur?.alive === false) { this._subject = want; this._subjectHold = SUBJECT_HOLD; }
    else if (want !== cur && (!cur || this._subjectHold <= 0)) { this._subject = want; this._subjectHold = SUBJECT_HOLD; }
    const subject = this._subject;

    const quiet = this._quiet;
    quiet.length = 0;
    for (const m of list) {
      if (!m || m === subject || m.alive === false || !m.root || !m.position) continue;
      const d2 = m.position.distanceToSquared(p.position);
      if (d2 > QUIET_RANGE * QUIET_RANGE) continue;
      m.__sightD2 = d2;
      quiet.push(m);
    }
    quiet.sort(_byNearest);
    if (quiet.length > QUIET_CAP) quiet.length = QUIET_CAP;

    for (const [m, e] of this._hulls) {
      const stays = e.quiet ? quiet.includes(m) : m === subject;
      if (stays && !m._disposed && m.alive !== false) continue;
      for (const mesh of e.meshes) mesh.parent?.remove(mesh);
      this._hulls.delete(m);
    }
    if (subject) this._addHull(subject, false);
    for (let i = 0; i < quiet.length; i++) this._addHull(quiet[i], true);
    this._figure.visible = this._hulls.size > 0 || this._parts.size > 0;
  }

  _addHull(m, quiet) {
    if (!m || m.alive === false || !m.root || this._hulls.has(m)) return;
    let sources = [];
    m.root.traverse((o) => {
      // skip other shells and instanced kit; components keep their own outline
      if ((o.isMesh || o.isSkinnedMesh) && !o.isInstancedMesh && !o.userData.__sightOverlay
        && !o.userData.part) sources.push(o);
    });
    // Draw-call budget: the largest meshes make the silhouette
    const cap = quiet ? QUIET_MESHES : HULL_MESHES;
    if (sources.length > cap) {
      for (const o of sources) {
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      }
      sources.sort((a, b) =>
        b.geometry.boundingSphere.radius - a.geometry.boundingSphere.radius);
      sources = sources.slice(0, cap);
    }
    const mat = quiet ? this._quietMaskMat : this._hullMaskMat;
    const meshes = [];
    for (const o of sources) meshes.push(this._overlayFor(o, mat));
    if (meshes.length) this._hulls.set(m, { meshes, quiet });
  }

  _disposeHulls() {
    for (const e of this._hulls.values()) {
      for (const mesh of e.meshes) mesh.parent?.remove(mesh);
    }
    this._hulls.clear();
    this._subject = null;
    this._quiet.length = 0;
    this._hullK = 0;
    this._figureMat.uniforms.uHull.value = 0;
    this._figureMat.uniforms.uQuiet.value = 0;
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

    // the sighted Instrument's components, nothing else's (R61 d): a raised alidade is at most six
    const m = this._subject;
    for (const [part, e] of this._parts) {
      if (e.machine === m) continue;
      for (const mesh of e.meshes) mesh.parent?.remove(mesh);
      this._partCount -= e.meshes.length;
      this._parts.delete(part);
    }
    if (!m || m.alive === false || !Array.isArray(m.parts)) return;
    if (p?.position && m.position
      && m.position.distanceToSquared(p.position) > PART_RANGE * PART_RANGE) return;
    for (const part of m.parts) {
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
          if (n >= 2 || !(o.isMesh || o.isSkinnedMesh) || o.userData.__sightOverlay) return;
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
      uniforms: { ...this._shared, uFade: { value: 0 }, uWeight: { value: 1 } },
      vertexShader: PATH_VS,
      fragmentShader: PATH_FS,
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

  /**
   * Who gets a transect: the sighted Instrument, then the nearest other walking its route.
   * Anyone else's line fades out and is freed (`update`).
   */
  _buildPaths() {
    const list = this.ctx.machines?.list;
    if (!Array.isArray(list)) return;
    const p = this.ctx.player;
    this._pathSkipped = 0;
    const carries = (m) => m && m.alive !== false && Array.isArray(m.route) && m.route.length >= 2
      && !(p?.position && m.position && m.position.distanceToSquared(p.position) > PATH_RANGE * PATH_RANGE);
    const first = carries(this._subject) && this._walksRoute(this._subject) ? this._subject : null;
    let other = null, otherD = Infinity;
    for (const m of list) {
      if (m === first || !carries(m)) continue;
      // skip non-route movers: no ribbon rather than one it is not following
      if (!this._walksRoute(m)) { this._pathSkipped++; continue; }
      const d = p?.position && m.position ? m.position.distanceToSquared(p.position) : 0;
      if (d < otherD) { otherD = d; other = m; }
    }
    const a = first ?? other, b = first ? other : null;
    for (const [m, e] of this._paths) {
      e.want = m === a || (PATH_CAP > 1 && m === b);
      e.mat.uniforms.uWeight.value = m === a && first ? 1 : PATH_OTHER;
    }
    if (a && !this._paths.has(a)) this._buildPath(a, first ? 1 : PATH_OTHER);
    if (b && PATH_CAP > 1 && !this._paths.has(b)) this._buildPath(b, PATH_OTHER);
  }

  /** One closed loop as a strip of quads. The strip is expanded in screen space by `PATH_VS`. */
  _buildPath(m, weight) {
    const terrain = this.ctx.terrain;
    const pts = this._splineRoute(m.route);
    if (pts.length < 4) return;
    // cumulative distance for the dash flow
    for (let i = 1; i < pts.length; i++) {
      pts[i].d = pts[i - 1].d
        + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    }
    const total = pts[pts.length - 1].d
      + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z);
    if (total < 4) return;
    this._pathSamples = pts.length;
    this._pathWaypoints = m.route.length;
    // just above the ground, clear of its curvature between samples
    for (const q of pts) q.y = (terrain?.getHeight?.(q.x, q.z) ?? 0) + 0.14;

    const n = pts.length + 1; // + closing segment back to pts[0]
    const pos = new Float32Array(n * 6);
    const prev = new Float32Array(n * 6);
    const next = new Float32Array(n * 6);
    const uv = new Float32Array(n * 4);
    const idx = [];
    for (let i = 0; i < n; i++) {
      const cur = pts[i % pts.length];
      const nxt = pts[(i + 1) % pts.length];
      const prv = pts[(i - 1 + pts.length) % pts.length];
      const d = i < pts.length ? cur.d : cur.d + total; // wrap distance
      const j = i * 6;
      for (let side = 0; side < 2; side++) {
        const o = j + side * 3;
        pos[o] = cur.x; pos[o + 1] = cur.y; pos[o + 2] = cur.z;
        prev[o] = prv.x; prev[o + 1] = prv.y; prev[o + 2] = prv.z;
        next[o] = nxt.x; next[o + 1] = nxt.y; next[o + 2] = nxt.z;
      }
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
    geo.setAttribute('aPrev', new THREE.BufferAttribute(prev, 3));
    geo.setAttribute('aNext', new THREE.BufferAttribute(next, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = this._pathMat();
    mat.uniforms.uWeight.value = weight;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 9985;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false; // vertices are world-space
    this._overlayScene.add(mesh);
    this._paths.set(m, { mesh, mat, want: true });
  }

  _disposePaths() {
    for (const e of this._paths.values()) {
      this._overlayScene.remove(e.mesh);
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
    this._gatherMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false,
      uniforms: { ...this._shared, uMap: { value: markTexture() }, uColor: this._shared.uPaper },
      vertexShader: /* glsl */ `
        uniform float uK;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(0.9 * 900.0 * uK / max(-mv.z, 1.0), 9.0 * uK, 22.0 * uK);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        ${HER_GLSL}
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          float a = t.a * 0.86 * notHer(gl_FragCoord.xy / uRes);
          if (a <= 0.003) discard;
          gl_FragColor = vec4(t.rgb, a);
        }`,
    });
    const pts = new THREE.Points(geo, this._gatherMat);
    pts.renderOrder = 9986;
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
      // the reach is an angle as well as a size: about 0.24 rad off the line at any range out to 21 m,
      // so the card holds while the crosshair stands off the Instrument and her weapon clears its ring
      const r = Math.max(2.4, (m.bodyRadius ?? 1.4) * 2.1, (m.height ?? 2) * 0.75, Math.min(5, along * 0.24));
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
      this._cardBody.innerHTML = this._cardHTML(m);
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
      // the page stays pinned to the right of the frame (stable to read). U-02 / 1-TR: no leader
      // runs from it to the Instrument: the ring, its tag and the figure say which one it reads, and
      // a line across the frame was the r1 judge's finding (it crossed her shoulder)
      const leader = this._leaders[LABEL_CAP];
      if (leader.style.display !== 'none') { leader.style.display = 'none'; this._leaderU[LABEL_CAP].style.display = 'none'; }
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
      this._overlayScene.remove(path.mesh);
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
  /** Leader `i` through two or three points (x2 NaN: two). A string only when a whole pixel moves. */
  _setLeader(i, x0, y0, x1, y1, x2, y2) {
    const q = this._leaderQ, o = i * 6;
    const a = Math.round(x0), b = Math.round(y0), c = Math.round(x1), d = Math.round(y1);
    const e = x2 === x2 ? Math.round(x2) : -99999, f = y2 === y2 ? Math.round(y2) : -99999;
    const li = this._leaders[i], lu = this._leaderU[i];
    if (q[o] !== a || q[o + 1] !== b || q[o + 2] !== c || q[o + 3] !== d || q[o + 4] !== e || q[o + 5] !== f) {
      q[o] = a; q[o + 1] = b; q[o + 2] = c; q[o + 3] = d; q[o + 4] = e; q[o + 5] = f;
      const pts = e === -99999 ? a + ',' + b + ' ' + c + ',' + d : a + ',' + b + ' ' + c + ',' + d + ' ' + e + ',' + f;
      li.setAttribute('points', pts); lu.setAttribute('points', pts);
    }
    if (li.style.display === 'none') { li.style.display = ''; lu.style.display = ''; }
  }

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
        // a component behind her is not drawn at all: no ring, chip or leader over her (r1 gate judge)
        if (this._rectOnHer(ax - 2, ay - 2, ax + 2, ay + 2)) continue;
        // weak points wear a cobalt ring, sized by what the shot has to hit
        if (c.weak && nRings < RING_CAP) {
          const rWorld = c.part.radius ?? 0.25;
          const pxPerM = window.innerHeight / (2 * Math.tan(this.ctx.camera.fov * 0.5 * Math.PI / 180))
            / Math.max(1, _v.distanceTo(this.ctx.camera.position));
          const r = Math.min(64, Math.max(8, rWorld * pxPerM));
          // a ring whose casing would reach onto her is not drawn
          if (!this._rectOnHer(ax - r - 3, ay - r - 3, ax + r + 3, ay + r + 3)) {
            const rec = this._ringRec[nRings];
            rec.x = ax; rec.y = ay; rec.r = r; rec.name = c.name;
            // a string only when the half-pixel changes: a still frame allocates nothing here
            const qx = Math.round(ax * 2), qy = Math.round(ay * 2), qr = Math.round(r * 2);
            if (rec.qx !== qx || rec.qy !== qy || rec.qr !== qr) {
              rec.qx = qx; rec.qy = qy; rec.qr = qr;
              const cr = this._rings[nRings], cu = this._ringsU[nRings];
              const xs = String(qx / 2), ys = String(qy / 2), rs = String(qr / 2);
              cr.setAttribute('cx', xs); cr.setAttribute('cy', ys); cr.setAttribute('r', rs);
              cu.setAttribute('cx', xs); cu.setAttribute('cy', ys); cu.setAttribute('r', rs);
            }
            if (this._rings[nRings].style.display === 'none') { this._rings[nRings].style.display = ''; this._ringsU[nRings].style.display = ''; }
            nRings++;
          }
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
        // a chip that would lie on her takes the other side, and does not draw if both lie on her
        if (this._rectOnHer(_screen.x + (flip ? -PLABEL_GAP - PLABEL_W : 0), _screen.y - PLABEL_H,
          _screen.x + (flip ? 0 : PLABEL_GAP + PLABEL_W), _screen.y + PLABEL_H)) {
          flip = !flip;
          if (this._rectOnHer(_screen.x + (flip ? -PLABEL_GAP - PLABEL_W : 0), _screen.y - PLABEL_H,
            _screen.x + (flip ? 0 : PLABEL_GAP + PLABEL_W), _screen.y + PLABEL_H)) continue;
        }
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
        // stacked down the frame, the chip and its leader must still keep off her
        {
          const lx = _screen.x + (flip ? -PLABEL_GAP : PLABEL_GAP);
          if (this._rectOnHer(_screen.x + bl, _screen.y - PLABEL_H, _screen.x + br, _screen.y + PLABEL_H)
            || this._segOnHer(ax, ay, lx, _screen.y)) continue;
        }
        const seat = placed[nPlaced++];
        seat.x = _screen.x; seat.y = _screen.y;
        const slot = this._labelPool[live.length];
        if (slot.flip !== flip) { slot.flip = flip; slot.el.classList.toggle('flip', flip); }
        // the leader: anchor, out to the chip's edge; a string only when a pixel changes
        this._setLeader(live.length, ax, ay, _screen.x + (flip ? -PLABEL_GAP : PLABEL_GAP), _screen.y, NaN, NaN);
        if (slot.lastName !== c.name) { slot.name.textContent = c.name; slot.lastName = c.name; }
        const n = c.loot.length;
        if (slot.lastLoot !== c.lootText) {
          slot.loot.textContent = c.lootText;
          slot.lastLoot = c.lootText;
        }
        slot.el.classList.toggle('has-loot', n > 0);
        slot.el.classList.toggle('is-weak', c.weak);
        // a string only when the pixel changes: a still frame allocates nothing here
        const lx = Math.round(_screen.x), ly = Math.round(_screen.y);
        if (slot.lx !== lx) { slot.lx = lx; slot.el.style.left = lx + 'px'; }
        if (slot.ly !== ly) { slot.ly = ly; slot.el.style.top = ly + 'px'; }
        if (slot.shown !== true) { slot.shown = true; slot.el.style.display = ''; }
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
      if (this._labelPool[i].shown !== false) { this._labelPool[i].shown = false; this._labelPool[i].el.style.display = 'none'; }
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
      if (e.fieldbook) kind = 'FIELD BOOK';
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
        // a Field Book she has not read keeps its title: the alidade only sees what kind of record lies there
        name: e.fieldbook ? bookHeading(e.fieldbook.category)
          : fieldWord(inter.sourceName ? inter.sourceName(e) : (e.label ?? '')),
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

  /**
   * Three screen boxes reveals keep off this frame, as [left, top, right, bottom] x 3: Brea, the
   * sighted Instrument, and the HUD's objective mark with its metres (a chip must never print over
   * the distance she is walking to). A box that is not on screen is empty. No allocation: this runs
   * every frame.
   */
  _fitHideBoxes() {
    const b = this._hideBox;
    b.fill(0);
    const her = this.ctx.player?.position;
    if (her && this.ctx.player.model?.visible !== false) {
      // her real extent this frame (bones + what she holds), else the standing box
      if (this._fitHerBox()) { b[0] = this._herBox[0]; b[1] = this._herBox[1]; b[2] = this._herBox[2]; b[3] = this._herBox[3]; }
      else this._hideBoxFor(0, her, 1.8, 0.62);
    }
    const m = this._subject, pos = m?.position;
    if (pos) this._hideBoxFor(4, pos, m.height ?? 2.4, Math.max((m.height ?? 2.4) * 0.9, (m.bodyRadius ?? 1.4) * 2.2));
    const hud = this.ctx.hud;
    if (hud?._lastObjOn && hud._objQx === hud._objQx) {
      // the arrow over its metres, centred on (_objQx, _objQy), at the world layer's scale
      const ws = hud._wscale || 1, hw = OBJ_HW * ws, hh = OBJ_HH * ws;
      b[8] = hud._objQx - hw; b[9] = hud._objQy - hh; b[10] = hud._objQx + hw; b[11] = hud._objQy + hh;
    }
  }

  /**
   * Her screen box this frame, in CSS px, from the meshes her mask already holds: every bone of each
   * skinned mesh (the pose, not the bind box) and the eight corners of what she holds, padded by the
   * flesh and cloth around a bone. The DOM half of the alidade keeps off this box (r1 gate judge:
   * the rings, chips and leaders are drawn in the DOM, where the mask's knock-out cannot reach).
   * False when there is nothing to measure. No allocation.
   */
  _fitHerBox() {
    const hb = this._herBox;
    hb[0] = 1e9; hb[1] = 1e9; hb[2] = -1e9; hb[3] = -1e9;
    const cam = this.ctx.camera;
    if (!cam || !this._heroShells.size) { hb[2] = hb[0]; return false; }
    cam.getWorldDirection(_dir);
    let skel = null, n = 0, zMin = 1e9;
    for (const src of this._heroShells.keys()) {
      if (!shownInWorld(src)) continue;
      if (src.isSkinnedMesh && src.skeleton) {
        if (src.skeleton === skel) continue;
        skel = src.skeleton;
        const bones = skel.bones;
        for (let i = 0; i < bones.length; i++) {
          _v.setFromMatrixPosition(bones[i].matrixWorld);
          const z = this._herTake(_v, cam);
          if (z > 0) { n++; if (z < zMin) zMin = z; }
        }
      } else {
        const g = src.geometry;
        if (!g) continue;
        if (!g.boundingBox) g.computeBoundingBox();
        const bb = g.boundingBox;
        for (let c = 0; c < 8; c++) {
          _v.set(c & 1 ? bb.max.x : bb.min.x, c & 2 ? bb.max.y : bb.min.y, c & 4 ? bb.max.z : bb.min.z).applyMatrix4(src.matrixWorld);
          const z = this._herTake(_v, cam);
          if (z > 0) { n++; if (z < zMin) zMin = z; }
        }
      }
    }
    if (!n || hb[2] <= hb[0]) { hb[2] = hb[0]; return false; }
    // 0.18 m of hair, cloth and flesh round a bone, at her nearest depth
    const pad = 0.18 * window.innerHeight / (2 * Math.tan(cam.fov * Math.PI / 360)) / Math.max(0.5, zMin) + 3;
    hb[0] -= pad; hb[1] -= pad; hb[2] += pad; hb[3] += pad;
    return true;
  }

  /** One world point of her into `_herBox`; returns its depth along the view (<= 0: not taken). */
  _herTake(v, cam) {
    const z = (v.x - cam.position.x) * _dir.x + (v.y - cam.position.y) * _dir.y + (v.z - cam.position.z) * _dir.z;
    if (z <= 0.05) return 0;
    v.project(cam);
    const x = (v.x * 0.5 + 0.5) * window.innerWidth, y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const hb = this._herBox;
    if (x < hb[0]) hb[0] = x;
    if (x > hb[2]) hb[2] = x;
    if (y < hb[1]) hb[1] = y;
    if (y > hb[3]) hb[3] = y;
    return z;
  }

  /** Does the rectangle [l, t, r, b] (CSS px) touch her box? */
  _rectOnHer(l, t, r, b) {
    const h = this._hideBox;
    if (h[2] <= h[0] || this._domKeepOff === false) return false;
    return !(r < h[0] || l > h[2] || b < h[1] || t > h[3]);
  }

  /** Does the segment (x0, y0) -> (x1, y1) cross her box? Liang-Barsky, no allocation. */
  _segOnHer(x0, y0, x1, y1) {
    const h = this._hideBox;
    if (h[2] <= h[0] || this._domKeepOff === false) return false;
    const dx = x1 - x0, dy = y1 - y0;
    const T = this._clipT;
    T[0] = 0; T[1] = 1;
    return _lbClip(T, -dx, x0 - h[0]) && _lbClip(T, dx, h[2] - x0)
      && _lbClip(T, -dy, y0 - h[1]) && _lbClip(T, dy, h[3] - y0) && T[0] <= T[1];
  }

  _hideBoxFor(i, pos, height, halfW) {
    const b = this._hideBox, cam = this.ctx.camera, h = window.innerHeight, w = window.innerWidth;
    _v2.set(pos.x, pos.y, pos.z).project(cam);
    if (_v2.z >= 1) return;
    const fx = (_v2.x * 0.5 + 0.5) * w, fy = (-_v2.y * 0.5 + 0.5) * h;
    _v2.set(pos.x, pos.y + height, pos.z).project(cam);
    if (_v2.z >= 1) return;
    const ty = (-_v2.y * 0.5 + 0.5) * h, px = (fy - ty) / height;
    b[i] = fx - halfW * px; b[i + 1] = ty; b[i + 2] = fx + halfW * px; b[i + 3] = fy;
  }

  /** True when a reveal centred on `s` (above it) lies on hide box `n`. */
  _onHideBox(s, n) {
    const b = this._hideBox, i = n * 4, l = b[i], t = b[i + 1], r = b[i + 2], bt = b[i + 3];
    if (r <= l) return false;
    return !(s.x + REVEAL_HW * 0.9 < l || s.x - REVEAL_HW * 0.9 > r || s.y < t || s.y - REVEAL_H > bt);
  }

  /** A reveal (centred on `s`, above it) that lies on box `n` moves to the box's nearer side. */
  _stepClear(s, b, n) {
    const i = n * 4, l = b[i], t = b[i + 1], r = b[i + 2], bt = b[i + 3];
    if (r <= l) return;
    if (s.x + REVEAL_HW * 0.9 < l || s.x - REVEAL_HW * 0.9 > r || s.y < t || s.y - REVEAL_H > bt) return;
    s.x = s.x - l < r - s.x ? l - REVEAL_HW * 0.92 : r + REVEAL_HW * 0.92;
  }

  _updateReveals() {
    const live = this._revealsLive;
    live.length = 0;
    let nTicks = 0;
    if (this.on) {
      // the hide boxes were fitted once for this frame in update()
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
      /* U-02: words for at most two, the ones nearest the crosshair within 25 m and 0.22 W of it,
         finds before gathering; every other reveal on screen is a 6 px ink tick. Pass 1 projects
         each candidate once into preallocated arrays and elects the two. */
      const src = this._revealSrc, PX = this._rvX, PY = this._rvY, SEL = this._rvSel;
      const vw0 = window.innerWidth, cx0 = vw0 * 0.5, cy0 = window.innerHeight * 0.5, near = vw0 * REVEAL_TEXT_FRAC;
      let pick0 = -1, pick1 = -1, score0 = Infinity, score1 = Infinity;
      for (let i = 0; i < src.length; i++) {
        SEL[i] = 0;
        const c = src[i], e = c.entry, pos = e?.position;
        if (!e || e.removed || e.consumed || !pos) { PX[i] = NaN; continue; }
        _v.set(pos.x ?? 0, (pos.y ?? 0) + (e.fieldbook ? 1.7 : 0.75), pos.z ?? 0);
        if (!this._project(_v, _screen)) { PX[i] = NaN; continue; }
        PX[i] = _screen.x; PY[i] = _screen.y;
        const off = Math.hypot(_screen.x - cx0, _screen.y - cy0);
        if (c.d2 > REVEAL_TEXT_RANGE * REVEAL_TEXT_RANGE || off > near) continue;
        const score = off + (c.kind === 'GATHER' ? 1e5 : 0);
        if (score < score0) { pick1 = pick0; score1 = score0; pick0 = i; score0 = score; }
        else if (score < score1) { pick1 = i; score1 = score; }
      }
      if (pick0 >= 0) SEL[pick0] = 1;
      if (pick1 >= 0) SEL[pick1] = 1;
      for (let i = 0; i < src.length; i++) {
        if (PX[i] !== PX[i]) continue;
        if (!SEL[i]) {
          // the quiet ones: an ink tick on the find, never on her or under the card
          if (nTicks < REVEAL_TICK_CAP && !this._rectOnHer(PX[i] - 4, PY[i] - 4, PX[i] + 4, PY[i] + 4)
            && !(PX[i] > cL + 90 && PX[i] < cR - 90 && PY[i] > cT + 14 && PY[i] < cB - 14)) {
            const tk = this._tickPool[nTicks++];
            const tx = Math.round(PX[i]), ty = Math.round(PY[i]);
            if (tk.x !== tx || tk.y !== ty) { tk.x = tx; tk.y = ty; tk.el.style.transform = 'translate(' + tx + 'px,' + ty + 'px)'; }
            if (tk.shown !== true) { tk.shown = true; tk.el.style.display = ''; }
          }
          continue;
        }
        if (live.length >= REVEAL_CAP) break;
        const c = src[i];
        _screen.x = PX[i]; _screen.y = PY[i];
        // she and the sighted Instrument keep their place: a chip behind either steps out to the nearer side
        for (let b = 0; b < 2; b++) {
          this._stepClear(_screen, this._hideBox, 0);
          this._stepClear(_screen, this._hideBox, 1);
          this._stepClear(_screen, this._hideBox, 2);
        }
        // the box is centred on the anchor and sits above it: horizontal fit is decided once, and
        // only Y moves in the solve below. A chip whose anchor is in the frame is held wholly inside
        // it, never cut by the edge; one whose anchor has left the frame does not draw
        const vw = window.innerWidth;
        if (_screen.x < 0 || _screen.x > vw) continue;
        const held = Math.min(vw - VIEW_MARGIN - REVEAL_HW, Math.max(VIEW_MARGIN + REVEAL_HW, _screen.x));
        // held in from the edge, it must not land back on her, the subject or the objective mark
        if (held !== _screen.x) {
          _screen.x = held;
          if (this._onHideBox(_screen, 0) || this._onHideBox(_screen, 1) || this._onHideBox(_screen, 2)) continue;
        }
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
        // stacked up the frame, it must still keep off her
        if (this._rectOnHer(_screen.x - REVEAL_HW * 0.9, _screen.y - REVEAL_H, _screen.x + REVEAL_HW * 0.9, _screen.y)) continue;
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
        const lx = Math.round(_screen.x), ly = Math.round(_screen.y);
        if (slot.lx !== lx) { slot.lx = lx; slot.el.style.left = lx + 'px'; }
        if (slot.ly !== ly) { slot.ly = ly; slot.el.style.top = ly + 'px'; }
        if (slot.shown !== true) { slot.shown = true; slot.el.style.display = ''; }
        const rec = this._revealRec[live.length];
        rec.kind = c.kind; rec.name = c.name; rec.rarity = c.rarity;
        rec.x = _screen.x; rec.y = _screen.y; rec.dist = Math.sqrt(c.d2);
        live.push(rec);
      }
    }
    for (let i = live.length; i < this._revealPool.length; i++) {
      const slot = this._revealPool[i];
      if (slot.shown !== false) { slot.shown = false; slot.el.style.display = 'none'; }
    }
    this._ticksLive = nTicks;
    for (let i = nTicks; i < this._tickPool.length; i++) {
      const tk = this._tickPool[i];
      if (tk.shown !== false) { tk.shown = false; tk.el.style.display = 'none'; }
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
      figure: { subject: this._subject?.kind ?? null, quiet: this._quiet.length, draws: this.overlayDraws() },
      revealTicks: this._ticksLive,
      herBox: this._herBox[2] > this._herBox[0] ? [...this._herBox].map((v) => Math.round(v)) : null,
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
    // the range is hers, not the camera's (r0/r1 judges): from her eye to what the crosshair reads
    const cam = this.ctx.camera, T = this.ctx.terrain, pp = p.position;
    const ex = pp.x, ey = pp.y + 1.6, ez = pp.z;
    let range = -1;
    if (this._target?.position) {
      const tp = this._target.position;
      _v2.set(tp.x - ex, tp.y + (this._target.height ?? 2.4) * 0.5 - ey, tp.z - ez);
      range = _v2.length();
    } else if (cam && T?.getHeight) {
      cam.getWorldDirection(_dir);
      const ox = cam.position.x, oy = cam.position.y, oz = cam.position.z;
      let hit = -1;
      for (let d = 2; d <= 400; d += 2) {
        if (oy + _dir.y * d < T.getHeight(ox + _dir.x * d, oz + _dir.z * d)) { hit = d; break; }
      }
      if (hit > 0) {
        _v2.set(ox + _dir.x * hit - ex, oy + _dir.y * hit - ey, oz + _dir.z * hit - ez);
        range = _v2.length();
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
    this._shared.uTime.value = t;
    const wantK = this.on ? 1 : 0;
    if (this._hullK !== wantK || this._hulls.size) {
      this._hullK = THREE.MathUtils.clamp(
        this._hullK + (wantK ? dt / 0.3 : -dt / 0.35), 0, 1);
      const uF = this._figureMat.uniforms;
      uF.uHull.value = this._hullK;
      uF.uQuiet.value = this._hullK;
      if (this._hullK <= 0 && !this.on) this._disposeHulls();
    }
    if (this.on) {
      this._hullPoll -= dt;
      if (this._hullPoll <= 0) {
        this._hullPoll = GATHER_TICK;
        this._refreshFigure(); // who is drawn, and Instruments that spawned after raising
      }
      this._pathPoll -= dt;
      if (this._pathPoll <= 0) {
        this._pathPoll = 1.0;
        this._buildPaths();    // who carries a transect
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
        const want = this.on && e.want && this._walksRoute(m);
        const f = THREE.MathUtils.clamp(
          e.mat.uniforms.uFade.value + (want ? dt / 0.4 : -dt / 0.25), 0, 1);
        e.mat.uniforms.uFade.value = f;
        e.mesh.visible = f > 0.01 && m.alive !== false;
        // fully faded and off-route: drop it, it rebuilds when the Instrument walks again
        if (f <= 0 && !want) {
          this._overlayScene.remove(e.mesh);
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
    if (this.on) this._fitHideBoxes();
    else this._hideBox.fill(0);
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
    const hooks = this.ctx.engine?.onAfterRender;
    const hook = hooks ? hooks.indexOf(this._afterComposer) : -1;
    if (hook >= 0) hooks.splice(hook, 1);
    this._overlayScene.remove(this._figure);
    this._figure.geometry.dispose();
    this._figureMat.dispose();
    this._hullMaskMat.dispose();
    this._partMaskMat.dispose();
    this._quietMaskMat.dispose();
    this._heroMaskMat.dispose();
    this.ctx.engine?.unregisterRenderTarget?.(this._figureRT);
    this._figureRT.dispose();
    this._overlayScene.remove(this._ring);
    this._ring.geometry.dispose();
    this._ringMat.dispose();
    this._overlayScene.remove(this._gather);
    this._gather.geometry.dispose();
    this._gatherMat.dispose();
    _markTex?.dispose();
    _markTex = null;
    this._tint.remove();
    this._layer.remove();
  }
}

/** main.js imports this name (one line for the orchestrator at W2; the class is `SightingSystem`). */

