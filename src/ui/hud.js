import * as THREE from 'three';
import './hud.css';
import { LOOT_POPUP, itemIcon, itemPlayerName } from './inventory.js';
import { TUTORIAL_CARDS, fieldWord, cardLine, cardParts } from './tips.js';
import { COMPASS_PIP } from '../instruments/lamps.js';
import { ITEMS } from '../items/items.js';

/** The one currency (U-19): the catalogue's own `currency` tag, so no item id is spelled here. */
const CURRENCY_ID = Object.keys(ITEMS).find((id) => ITEMS[id]?.tags?.includes('currency')) ?? null;

/**
 * ===========================================================================
 * THE FIELD-BOOK HUD — lane `shell-ui` (Round 5, W1; bible §9.7, plan R55, R57)
 * ===========================================================================
 * The play surface reads as engraved surveying instruments: a levelling staff
 * for health, a theodolite circle for the compass, a spirit-level vial for
 * exposure, a hairline breath meter for Steady, paper chips for everything that
 * has to be read as words. Right angles, hairlines, graduated ticks; Chakra
 * Petch for labels, IBM Plex Mono for every numeral and every running line.
 * Nothing hexagonal, nothing rounded, no smoked glass.
 *
 * Reads other lanes' published surfaces and never writes to them:
 *   ctx.progression   tracked quest, getMarkers(), events `banner` / `quest-*`
 *   ctx.items.tools   slots[], index, cooldown, useKey, cycleKeys
 *   ctx.combat        activeWeapon, activeAmmo, ammo, drawStrength,
 *                     nockProgress, steady { active, gauge }, craft
 *   ctx.machines      list[], m.state / suspicion / lampState / elemental,
 *                     m.parts; event `flagged` / `flag-ended` (perception)
 *   ctx.sighting      tags (Map<Machine, el>), scanTarget
 *   ctx.player        health / maxHealth, gourd / maxGourd, crouching, inTallGrass
 *
 * Invariants this file has broken before; each has a gate:
 *   1. `interactables.current` is `{ entry, label, holdProgress }`: the world
 *      position is on `.entry` (`A71f-interact-anchor`).
 *   2. The vitals' 4 s hide and the tracker's 26 s hide are independent timers
 *      and never share an opacity: the tracker is a SIBLING of `.cal-vitals`
 *      (`A71g-tracker-live`).
 *   3. The world-projected layer is scaled ONCE, by the JS transform; its sheet
 *      resets `--s` to 1. Its multiplier is `_wscale` (`_scale` floored at 1)
 *      because its base type IS the 11 px floor (`A71b-hud-scale-floor`).
 *   4. A world-projected element is anchored by its own transform and nothing
 *      else (`A71c-hud-surfaces`, `A71h-mhb-melee-clear`).
 *
 * MEMORY. Per-frame paths allocate nothing: the compass is ONE transform on one
 * prebuilt strip (the Round-4 ribbon wrote ~70 strings a frame); readouts come
 * from preallocated tables (`BEARING_STR`, `SCALE_X`, `CLIP_R`); slow panels
 * sample at 10 Hz with numeric dirty checks. Every listener is on ctx.events,
 * which outlives this object; DOM goes with #hud.
 *
 * PUBLISHED:
 *   ctx.hud.setHudScale(mult)   0.7-2, clamped (settings binds its slider to it)
 *   ctx.hud.showTip(id | card)  a one-shot card: an id of TUTORIAL_CARDS, or
 *                               { id, title, body, keys }. false if already shown.
 *   event `tutorial-tip`        the same, for lanes without a ctx handle
 *   ctx.hud.setWaypoint(wp|null)  { x, z, label }; rides the theodolite circle
 *   ctx.hud.setPaused(on)       routes to the hub
 *
 * Debug probe `window.__HUD_DEBUG__`: lootSurfaces / compass / surfaces / scale /
 * tips / cards. Gates read it; nothing in the game does.
 */

const RAD2DEG = 180 / Math.PI;

// status durations: a triggered build-up becomes a countdown on its gauge
const ELEM_TRIG = { fire: 8, shock: 3, freeze: 8 };
const ELEM_LABEL = { fire: 'C', shock: 'D', freeze: 'B' };   // Cinder, Dust, Brine (bible §5.8)
const COMBAT_IDLE_S = 4;          // dynamic HUD: kit tag hides after this
const VITALS_IDLE_S = 4;          // dynamic HUD: full health staff hides after this
const TRACK_IDLE_S = 26;          // dynamic HUD: the field note recedes after this
const VIAL_IDLE_S = 4;            // U-02: the exposure vial hides after this long UNSEEN
const GHOST_HOLD_S = 0.45;        // damage-delta ghost lingers before draining
const GHOST_DRAIN = 55;           // ghost drain rate, % of bar per second
const LOOT_CLAIM_MS = 400;        // toast suppression after the take-all popup claimed a loot event
const PROMPT_H = 1.1;             // metres above an interactable the [E] prompt rides

/** Never more than three projected Instrument plates on screen at once. */
const MHB_CAP = 3;
const MHB_HOLD_S = 5;             // seconds a plate survives after its last hit
const MHB_RANGE = 120;            // metres past which a plate is not worth drawing
const MHB_W = 280;                // the plate's base width (CSS); `TILLER · SOIL CORE · TRANSECT 14` on one line
const MHB_W_COMPACT = 150;        // U-02: the others' plates, name and bar only
/**
 * The melee clamp is in PAINTED pixels, and the two things it has to clear scale
 * by different multipliers: the HUD furniture with `_scale`, the plate with
 * `_wscale`. Bases are measured at --hud-scale 1:
 *   MHB_TOP_BASE 96   the circle's numerals + gap
 *   MHB_EYE_BASE 142  the exposure vial's bottom + gap
 *   MHB_SAFE_L 412    the top-left column's right edge + gap
 */
const MHB_TOP_BASE = 96;
const MHB_EYE_BASE = 142;
const MHB_PLATE_H = 41;
const MHB_SAFE_L = 412;
const MHB_COL_B = 178;            // the column's foot with the field note up
const MHB_GAP = 4;                // what the plate resolver leaves between two plates
const MHB_EYE_HALF = 70;

const AWARE_MIN_SUSPICION = 0.04;
const AWARE_EDGE_MARGIN = 44;

/**
 * HUD scale. `--hud-scale` is a unitless multiplier applied to every size in
 * hud.css; the 11 px floor is enforced IN CSS with `max(11px, ...)`. The clamp is
 * here because CSS cannot divide a length by a length.
 */
const HUD_SCALE_MIN = 0.85;
const HUD_SCALE_MAX = 2.4;
/** The world layer's base type IS the floor, so its transform may not go under 1. */
const WORLD_SCALE_MIN = 1;
const HUD_REF_W = 1600;
const HUD_REF_H = 900;

const TIP_STORE = 'cal.hud.tips.v5';

/* ------------------------------ theodolite circle ------------------------- */

const STRIP_FROM = -100;          // the strip runs -100° .. 460°, so any bearing +- the window stays on it
const STRIP_TO = 460;
const PX_PER_DEG = 3.6;
const STRIP_W = 640;              // base width of the visible window
const COMPASS_HALF_DEG = 80;      // pips are drawn inside this (the window's ends fade)
const COMPASS_SPRING_K = 150;     // the limb's inertia: under-damped, a little overshoot
const COMPASS_SPRING_C = 19;
const PIP_LABEL_PX = 36;          // two marks closer than this share one distance reading

/** 000 .. 359, preallocated: the readout never builds a string. */
const BEARING_STR = Array.from({ length: 360 }, (_, i) => String(i).padStart(3, '0'));
/**
 * translate3d(x,0,0) strings by half-pixel, built once each. The strip and the pips move
 * every frame the camera turns; this keeps that path free of string churn. Bounded by the
 * strip's width in half-pixels, and cleared when the HUD scale changes.
 */
const TX_MEMO = new Map();
/**
 * A projected element moves by two transforms: X on a zero-size wrapper (`txString`), Y on the
 * element itself, by whole pixel, built once per y and cleared with TX_MEMO when the scale changes.
 * So a plate, a mark or a damage number in flight writes strings it already has. Whole pixels
 * also keep their type crisp.
 */
const PLATE_Y = new Map(), CENTRE_Y = new Map(), AWARE_Y = new Map(), DMG_Y = new Map();
function plateY(y, ws) {
  let v = PLATE_Y.get(y);
  if (v === undefined) { v = `translateY(${y}px) scale(${ws.toFixed(3)}) translate(-50%, -100%)`; PLATE_Y.set(y, v); }
  return v;
}
function centreY(y, ws) {
  let v = CENTRE_Y.get(y);
  if (v === undefined) { v = `translateY(${y}px) translate(-50%,-50%) scale(${ws.toFixed(3)})`; CENTRE_Y.set(y, v); }
  return v;
}
function awareY(y, sc) {
  let v = AWARE_Y.get(y);
  if (v === undefined) { v = `translateY(${y}px) scale(${sc.toFixed(2)})`; AWARE_Y.set(y, v); }
  return v;
}
/**
 * A damage number's Y and its pop-in, in ONE transform: the pop scales about the number's own
 * bottom centre (`transform-origin: 50% 100%` in hud.css), never about the layer's corner, so a
 * number that is still popping already stands where `_dmgClear` put it.
 */
function dmgY(y, si) {
  const key = y * 16 + si;
  let v = DMG_Y.get(key);
  if (v === undefined) { v = `translateY(${y}px) translate(-50%,-100%) scale(${POP_STR[si]})`; DMG_Y.set(key, v); }
  return v;
}
/** Math.hypot takes rest arguments and allocates for them; this runs per Instrument per frame. */
const len2 = (a, b) => Math.sqrt(a * a + b * b);
/** Number strings for the two per-element style values a damage number animates. */
const OPACITY_STR = Array.from({ length: 21 }, (_, i) => (i / 20).toFixed(2));
const POP_STR = Array.from({ length: 11 }, (_, i) => (0.82 + 0.018 * i).toFixed(3));
const ELEM_KEYS = ['fire', 'freeze', 'shock'];
function txString(x) {
  const k = Math.round(x * 2);
  let v = TX_MEMO.get(k);
  if (v === undefined) { v = `translate3d(${k / 2}px,0,0)`; TX_MEMO.set(k, v); }
  return v;
}

/** Transform and clip strings for 0..100 %, preallocated (the fills never build one). */
const SCALE_X = Array.from({ length: 101 }, (_, i) => `scaleX(${(i / 100).toFixed(2)})`);
const SCALE_Y = Array.from({ length: 101 }, (_, i) => `scaleY(${(i / 100).toFixed(2)})`);
const CLIP_R = Array.from({ length: 101 }, (_, i) => `inset(0 ${100 - i}% 0 0)`);

/**
 * The strip: one SVG, built once, translated by one transform. A baseline with the
 * ticks hanging from it, every 5°; numerals every 30°; the four cardinal letters
 * under their numerals.
 */
function buildStrip() {
  const W = (STRIP_TO - STRIP_FROM) * PX_PER_DEG;
  const base = 14;                 // the limb's y in the strip: the cardinals ride above it, the marks' band stays clear under the numerals
  let t5 = '', t10 = '', t30 = '', nums = '', cards = '';
  for (let a = STRIP_FROM; a <= STRIP_TO; a += 5) {
    const x = ((a - STRIP_FROM) * PX_PER_DEG).toFixed(1);
    const norm = ((a % 360) + 360) % 360;
    if (norm % 30 === 0) {
      t30 += `M${x} ${base}V${base + 14}`;
      const cls = norm === 0 ? 'n north' : 'n';
      nums += `<text class="${cls}" x="${x}" y="${base + 28}">${BEARING_STR[norm]}</text>`;
      const c = norm === 0 ? 'N' : norm === 90 ? 'E' : norm === 180 ? 'S' : norm === 270 ? 'W' : '';
      if (c) cards += `<text class="${norm === 0 ? 'c north' : 'c'}" x="${x}" y="${base - 3}">${c}</text>`;
    } else if (norm % 10 === 0) t10 += `M${x} ${base}V${base + 9}`;
    else t5 += `M${x} ${base}V${base + 5}`;
  }
  const line = `M0 ${base}H${W.toFixed(0)}`;
  return `<svg class="cal-strip" viewBox="0 0 ${W.toFixed(0)} 52" width="${W.toFixed(0)}" height="52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
    + `<path class="u" d="${line}${t5}${t10}${t30}"/>`
    + `<path class="t line" d="${line}"/><path class="t t5" d="${t5}"/><path class="t t10" d="${t10}"/><path class="t t30" d="${t30}"/>`
    + nums + cards + '</svg>';
}

/* ------------------------------ glyph library ------------------------------ */

const P = (d, extra = '') => `<path d="${d}" ${extra}/>`;
const LINE = 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" stroke-linejoin="miter"';
const FINE = 'fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="square"';

/** Kit silhouettes, engraved: one line weight, ink on the kit tag's paper. 40x64 viewBox. */
const KIT_ART = {
  bow: P('M16 3 C30 14 33 27 33 32 C33 37 30 50 16 61', LINE)
    + P('M16 3 V61', FINE)
    + P('M28 29 H35 V35 H28 Z', 'fill="currentColor"')
    + P('M4 32 H37', FINE) + P('M37 32 L33 29.5 M37 32 L33 34.5', FINE),
  lance: P('M20 2 L25 15 L20 20 L15 15 Z', 'fill="currentColor"')
    + P('M20 18 V62', LINE) + P('M15 24 H25', LINE) + P('M17 56 H23 M17 60 H23', FINE),
  gaff: P('M14 62 V14 C14 5 28 5 28 14 C28 20 21 21 21 16', LINE) + P('M9 44 H19', FINE),
  windwall: P('M6 18 C14 8 26 8 34 18 L31 44 C25 52 15 52 9 44 Z', LINE) + P('M20 11 V50 M12 26 H28 M12 36 H28', FINE),
  pot: P('M15 12 H25 L24 19 C33 22 34 40 26 47 H14 C6 40 7 22 16 19 Z', LINE) + P('M13 30 H27', FINE),
  net: P('M4 18 C14 8 26 8 36 18 L30 50 H10 Z', LINE) + P('M13 14 L18 50 M27 14 L22 50 M7 30 H33 M9 41 H31', FINE),
};
const kitArtFor = (id) => {
  const s = String(id ?? '');
  const key = /lance|spear/i.test(s) ? 'lance' : /gaff/i.test(s) ? 'gaff' : /windwall/i.test(s) ? 'windwall'
    : /pot|sling/i.test(s) ? 'pot' : /net|caster/i.test(s) ? 'net' : 'bow';
  return `<svg viewBox="0 0 40 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${KIT_ART[key]}</svg>`;
};

function prettify(id) {
  return String(id).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** `KeyF` / `BracketLeft` / `Digit1` -> the glyph a player reads on a key cap. */
function keyGlyph(code) {
  const s = String(code ?? '');
  if (/^Key[A-Z]$/.test(s)) return s.slice(3);
  if (/^Digit[0-9]$/.test(s)) return s.slice(5);
  const map = {
    BracketLeft: '[', BracketRight: ']', Space: 'SPACE', Tab: 'TAB', Escape: 'ESC',
    ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', ControlLeft: 'CTRL', ControlRight: 'CTRL',
    AltLeft: 'ALT', AltRight: 'ALT', Enter: 'ENTER', Comma: ',', Period: '.',
  };
  return map[s] ?? s.toUpperCase();
}

function wrap180(d) {
  d %= 360;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  return d;
}
function norm360(d) {
  d %= 360;
  return d < 0 ? d + 360 : d;
}
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function div(cls, parent, html) {
  const el = document.createElement('div');
  el.className = cls;
  if (html != null) el.innerHTML = html;
  parent.appendChild(el);
  return el;
}

/** The lamp state of an Instrument: its own lamp, else read off its AI state. */
function lampStateOf(m) {
  const s = m.lampState;
  if (s) return s;
  if (m.alive === false) return 'dark';
  if (m.state === 'alert' || m.state === 'attack') return 'hostile';
  if (m.state === 'suspicious' || m.state === 'search') return 'wary';
  return 'calm';
}

export class HUD {
  constructor(ctx) {
    this.ctx = ctx;
    this.rootEl = document.getElementById('hud');

    this._vw = window.innerWidth;
    this._vh = window.innerHeight;
    this._forceVw = 0;             // debug-only viewport override (see __HUD_DEBUG__)
    this._forceVh = 0;
    this._scale = 1;
    /** world-projected multiplier: `_scale` floored at WORLD_SCALE_MIN. */
    this._wscale = 1;
    this._t = 0;
    this._aimT = 0;

    this._v = new THREE.Vector3(); // scratch for projections
    this._v2 = new THREE.Vector3();

    // the theodolite: `_cAngle` is what the limb shows, chasing the camera on a spring
    this._halfWinDeg = COMPASS_HALF_DEG;
    this._pxPerDeg = PX_PER_DEG;
    this._cAngle = null;
    this._cVel = 0;
    this._lastStripX = NaN;
    this._flagged = false;
    this._lastFlag = null;
    this._waypoint = null;

    // dirty-check caches so per-frame DOM writes only happen on change
    this._lastHp = -1;
    this._lastHpNum = -1;
    this._lastLow = null;
    this._lastGourd = -1;
    this._lastGourdNum = -1;
    this._lastGourdHint = null;
    this._lastHealing = null;
    this._lastIdle = null;
    this._lastReveal = null;
    this._lastAim = null;
    this._lastDraw = -1;
    this._lastSpread = -1;
    this._lastBreath = -1;
    this._lastBreathOn = null;
    this._lastBreathActive = null;
    this._lastW = undefined;
    this._lastAmmoId = undefined;
    this._lastCount = undefined;
    this._lastDots = undefined;
    this._lastDotN = -1;
    this._lastIntLabel = '';
    this._lastIntHold = -1;
    this._lastIntOn = null;
    this._lastBearing = -1;
    this._lastVin = -1;
    this._lastToolSig = null;
    this._lastTrackSig = '';
    this._lastVialMode = '';
    this._lastVialBubble = -1;
    this._lastVialNoise = -1;
    this._lastObjDist = -1;
    this._lastObjLabel = null;
    this._lastObjOff = null;
    this._lastObjOn = false;
    this._lastNock = -1;

    this._hurtFlash = 0;

    // damage-delta ghost on the staff, dynamic-HUD vitals timer
    this._hpGhostW = -1;
    this._hpGhostHold = 0;
    this._vitalsIdleT = VITALS_IDLE_S + 1; // boots hidden: full health at spawn
    this._trackIdleT = 0;
    this._reveal = 0;              // hold-H "show HUD" reveal, 0..1

    // item toasts buffer one microtask so the take-all popup (shown later in
    // the same synchronous loot stack) can claim the event; see inventory.js
    this._pendingItems = [];
    this._itemFlushQueued = false;

    this._pips = new Map();        // machine -> compass pip element
    this._questPips = [];          // pooled site / objective marks on the circle
    this._awares = new Map();      // machine -> awareness rod entry
    this._attackFlash = new Map(); // machine -> remaining flash seconds
    this._elemTrigs = new Map();   // machine -> { fire|shock|freeze: secondsLeft }
    this._engaged = new Map();     // machine -> plate record
    this._mhbSlots = [];           // pooled projected plates
    this._mhbPick = [null, null, null];   // preallocated cap-3 selection
    this._mhbPickW = [0, 0, 0];
    this._mhbX = [NaN, NaN, NaN];  // the plate resolver's scratch: painted px, never reallocated
    this._mhbY = [0, 0, 0];
    this._mhbC = [0, 0, 0];
    this._mhbHW = [0, 0, 0];       // each plate's painted half width (full or compact)
    this._mhbBox = new Float32Array(MHB_CAP * 4);   // each engaged Instrument's screen box
    this._pipVis = [];             // the marks on the circle this frame (reused)
    this._scanDt = 0;
    this._decayFlash = (ttl, m) => {
      const left = ttl - this._scanDt;
      if (left <= 0) this._attackFlash.delete(m);
      else this._attackFlash.set(m, left);
    };
    this._decayTrig = (rec, mm) => {
      let any = false;
      for (let i = 0; i < ELEM_KEYS.length; i++) {
        const k = ELEM_KEYS[i], v = rec[k];
        if (v === undefined) continue;
        if (v - this._scanDt <= 0) rec[k] = undefined;
        else { rec[k] = v - this._scanDt; any = true; }
      }
      if (!any || mm.alive === false) this._elemTrigs.delete(mm);
    };
    this._objQx = NaN; this._objQy = NaN; this._intQx = NaN; this._intQy = NaN;
    this._anyHostile = false;      // any Instrument alert/attack this frame
    this._nearestHostileDist = Infinity;
    this._nearestInstrumentDist = Infinity;
    this._combatIdleT = 0;         // seconds since last combat-ish activity
    this._lastWpnIdle = null;
    this._ammoEmpty = false;
    this._toolsReady = false;

    /** Kept false: menu.js and A68 read this latch; the HUD no longer owns an end screen. */
    this._victoryShown = false;

    // tutorial card queue
    this._tipSeen = this._loadTips();
    this._tipQueue = [];
    this._tipT = 0;
    this._tipGap = 0;
    this._tipCur = null;           // the id of the card on screen
    this._staged = null;           // `stageNote`: a look film's staged beat (?shot only)

    this._slowT = 0;               // 10 Hz sampler for the signature-string panels
    this._marks = null;            // progression.getMarkers(), sampled at 4 Hz
    this._marksT = 0;
    this._siteMarks = null;        // discovered sites from the map page, sampled at 1 Hz
    this._siteMarksT = 0;
    this._trackIdle = null;
    this._lastWid = null;
    this._lastCraftOn = null;
    this._lastCraftFill = -1;
    this._lastCraftLabel = null;

    this._build();
    this._applyScale();
    this._bindEvents();
    this._renderTracker(true);

    /** Gate contract: the same numbers the pixels were drawn from. */
    window.__HUD_DEBUG__ = {
      lootSurfaces: () => ({
        popupVisible: !!LOOT_POPUP.instance?.visible,
        toastCount: this._itemsEl ? this._itemsEl.childElementCount : 0,
      }),
      compass: () => this._compassAudit(),
      surfaces: () => this._surfaceAudit(),
      scale: () => this._scaleAudit(),
      /** The runner pins 1600x900; other viewports are fed through `_applyScale`. */
      simulateViewport: (w, h) => {
        this._forceVw = w > 0 ? Math.round(w) : 0;
        this._forceVh = h > 0 ? Math.round(h) : 0;
        this._vw = this._forceVw || window.innerWidth;
        this._vh = this._forceVh || window.innerHeight;
        this._applyScale();
        return this._scaleAudit();
      },
      tips: () => ({ seen: [...this._tipSeen], queued: this._tipQueue.map((t) => t.id) }),
      cards: () => TUTORIAL_CARDS.map((c) => ({ id: c.id, beat: c.beat, text: c.text, title: c.title, body: c.body })),
      // same entry point the published `ctx.hud.showTip` uses
      showTip: (id) => this.showTip(id),
      resetTips: () => { this._tipSeen.clear(); this._saveTips(); },
    };
  }

  /* --------------------------------- DOM ---------------------------------- */

  _build() {
    const root = this.rootEl;

    this._vignette = div('cal-vignette', root);
    // a sentry's blind-flash when close and facing it (`watcher-flash`, machine.js)
    this._wflash = div('cal-wflash', root);

    /* ---------------- top-left: the staff, the gourd, the field note ------- */
    const tl = div('cal-topleft', root);
    this._topleftEl = tl;

    /**
     * The vitals' dynamic hide (4 s, full health) and the note's (26 s, no
     * objective change) are different timers on purpose, so they cannot share
     * an opacity: the vitals fade inside their own wrapper, and `.cal-track` is
     * its sibling. Gate: `A71g-tracker-live`.
     */
    const vitals = div('cal-vitals', tl);
    this._vitalsEl = vitals;

    const hrow = div('cal-staffrow', vitals);
    // the emblem (U-06): a broad arrow in a ring, the survey's own mark
    div('cal-emblem', hrow, '<svg viewBox="0 0 24 24" aria-hidden="true" data-shape="disc">'
      + '<circle class="u" cx="12" cy="12" r="10.4"/><circle class="t" cx="12" cy="12" r="10.4"/>'
      + '<path class="a" d="M12 6.5 V17.5 M12 6.5 L7.4 13 M12 6.5 L16.6 13"/></svg>');
    const staff = div('cal-staff', hrow);
    this._staffEl = staff;
    // the empty staff: its ticks stay on the scale, as a surveyor's staff would
    div('cal-staff-empty', staff, this._staffFace('cal-staff-svg empty'));
    this._healthGhost = div('cal-staff-ghost', staff);
    const fillClip = div('cal-staff-fill', staff, this._staffFace('cal-staff-svg'));
    this._healthFill = fillClip;
    // the reading index: a tick riding the top edge, settling on a spring curve when HP moves
    this._staffIndex = div('cal-staff-index', staff);
    this._healthNum = div('cal-staff-num cal-glass', hrow, '<b>100</b><span>/100</span>');

    // the hairline beneath the staff: there is no stamina system in the game, so it reads the gourd
    const gourdLine = div('cal-gourdline', vitals);
    this._gourdFill = div('cal-gourdline-fill', gourdLine);

    const pr = div('cal-chiprow', vitals);
    this._gourdRow = pr;
    const gourdChip = div('cal-chip cal-glass cal-gourd', pr,
      '<span class="cal-chip-l">GOURD</span><b class="cal-chip-n">060</b>');
    this._gourdChip = gourdChip;
    this._gourdNum = gourdChip.querySelector('.cal-chip-n');
    this._gourdKey = document.createElement('kbd');
    this._gourdKey.className = 'cal-gourd-key';
    this._gourdKey.textContent = 'Q';
    gourdChip.appendChild(this._gourdKey);
    // the one currency (U-06, U-19): salt, counted
    this._saltChip = div('cal-chip cal-glass cal-salt', pr, '<span class="cal-chip-l">SALT</span><b class="cal-chip-n">000</b>');
    this._saltNum = this._saltChip.querySelector('.cal-chip-n');
    this._lastSalt = -1;

    // the field note, UNDER the vitals
    const tr = div('cal-track cal-glass', tl);
    this._trackEl = tr;
    this._trackKicker = div('cal-track-kicker', tr, 'FIELD NOTE');
    this._trackTitle = div('cal-track-title', tr);
    this._trackObj = div('cal-track-obj', tr);
    this._trackMeta = div('cal-track-meta', tr);

    /* ------------------------- the theodolite circle ----------------------- */
    const comp = div('cal-compass', root);
    this._compEl = comp;
    const win = div('cal-compass-window', comp);
    this._stripEl = div('cal-compass-track', win, buildStrip());
    this._pipLayer = div('cal-compass-pips', comp);
    div('cal-compass-index', comp, '<svg viewBox="0 0 12 20" aria-hidden="true"><path d="M6 19 L1 8 H11 Z"/><path d="M6 0 V8"/></svg>');
    this._pennantEl = div('cal-pennant', comp, '<svg viewBox="0 0 22 22" aria-hidden="true"><path class="pole" d="M3 1 V21"/><path class="flag" d="M3 2 L20 7 L3 12 Z"/></svg>');
    this._bearingEl = div('cal-bearing cal-glass', comp, '<b>000</b>');
    this._bearingNum = this._bearingEl.firstChild;

    /* -------------------------- the exposure vial -------------------------- */
    /**
     * Stealth, read as a spirit level: the bubble sits dead centre while nothing
     * is on her, runs up the vial as the strongest live detection fills, and
     * lies under the far graduation when she is spotted. Three sound ticks rise
     * with how loudly she is moving.
     */
    const vial = div('cal-vial', root);
    this._eyeEl = vial;
    vial.innerHTML =
      '<div class="cal-vial-tube"><i class="cal-vial-mid"></i><i class="cal-vial-bubble"></i></div>'
      + '<div class="cal-vial-row"><span class="cal-eye-label">UNSEEN</span>'
      + '<span class="cal-eye-bars"><i></i><i></i><i></i></span></div>';
    this._eyeLabel = vial.querySelector('.cal-eye-label');
    this._eyeBars = vial.querySelector('.cal-eye-bars');
    this._vialBubble = vial.querySelector('.cal-vial-bubble');

    /* --------------- projected layers (plates, markers) -------------------- */
    this._worldLayer = div('cal-world', root);
    for (let i = 0; i < MHB_CAP; i++) this._mhbSlots.push(this._makeMhb());

    // the objective's broad arrow, with metres
    this._objWrap = div('cal-px', this._worldLayer);
    this._objDiamond = div('cal-objmark', this._objWrap,
      '<div class="cal-objmark-d"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="u" d="M12 22 V3 M12 22 L4 8 M12 22 L20 8"/><path class="t" d="M12 22 V3 M12 22 L4 8 M12 22 L20 8"/></svg></div>'
      + '<div class="cal-objmark-dist">0m</div>'
      + '<div class="cal-objmark-label"></div>');
    this._objDiamondDist = this._objDiamond.querySelector('.cal-objmark-dist');
    this._objDiamondLabel = this._objDiamond.querySelector('.cal-objmark-label');

    // awareness rods (screen-projected, edge-clamped)
    this._awareLayer = div('cal-awares', root);

    /* ------------------------------ reticle ------------------------------- */
    // An engraved crosshair: horizontal hairs, a vertical hair below, and two
    // stadia ticks that close on the centre as the draw tightens. Under it the
    // draw scale (ten graduations) and, while Steady, the breath meter.
    const cross = div('cal-cross', root);
    this._crossEl = cross;
    this._dotEl = div('cal-dot', cross);
    this._brackets = div('cal-stadia', cross);
    for (const c of ['hl', 'hr', 'vb', 'st', 'sb']) div('cal-hair ' + c, this._brackets);
    this._brkArm = this._brackets.firstElementChild;   // audit probe (0x0 parent)
    this._drawEl = div('cal-drawscale', cross);
    this._drawFill = div('cal-drawscale-fill', this._drawEl);
    // re-nock: the arrow is still travelling to the string (combat.nockProgress)
    this._nockEl = div('cal-nock', cross);
    this._nockFill = div('cal-nock-fill', this._nockEl);
    // Steady (bible §9.7): a hairline breath meter under the reticle. No veil, no desaturation.
    this._concEl = div('cal-breath', cross, '<div class="cal-breath-rule"><i></i></div><span class="cal-breath-l">BREATH</span>');
    this._concFill = this._concEl.querySelector('i');

    /* ------------------------- interaction prompt ------------------------- */
    this._intWrap = div('cal-px', this._worldLayer);
    this._intEl = div('cal-interact', this._intWrap);
    const intKey = document.createElement('kbd');
    intKey.className = 'cal-int-key';
    intKey.textContent = 'E';
    this._intEl.appendChild(intKey);
    this._intRing = div('cal-int-hold', this._intEl, '<i></i>');
    this._intHold = this._intRing.firstChild;
    this._intLabel = div('cal-int-label cal-glass', this._intEl, 'LOOT');

    /* ----------------------- bottom-left: tool chips ----------------------- */
    // data and behaviour belong to `ctx.items.tools`; this owns pixels.
    const tools = div('cal-tools', root);
    this._toolsEl = tools;
    this._toolPrev = div('cal-tool-chev prev', tools, '<kbd>[</kbd>');
    this._toolRow = div('cal-tool-row', tools);
    this._toolNext = div('cal-tool-chev next', tools, '<kbd>]</kbd>');
    this._toolSlots = [];

    // craft / blocked / pocket-full flashes, centre-low
    this._xpPops = div('cal-flashes', root);

    /* -------------------------- bottom-right: kit tag ---------------------- */
    const wpn = div('cal-weapon cal-glass', root);
    this._wpnEl = wpn;
    const wrow = div('cal-wpn-row', wpn);
    this._wpnArt = div('cal-wpn-art', wrow, kitArtFor('bow'));
    const wmid = div('cal-wpn-mid', wrow);
    this._wpnName = div('cal-wpn-name', wmid, 'SABINA BOW');
    this._wpnAmmoName = div('cal-wpn-ammoname', wmid, 'REED ARROW');
    this._wpnDots = div('cal-wpn-dots', wmid);
    const wcount = div('cal-wpn-countrow', wrow);
    this._wpnCount = div('cal-wpn-count', wcount, '012');
    // craft hold
    this._craftEl = div('cal-craft', wpn,
      '<kbd>R</kbd><div class="cal-craft-bar"><i></i></div><span>MAKE</span>');
    this._craftFill = this._craftEl.querySelector('i');
    this._craftLabel = this._craftEl.querySelector('span');

    // item pickup chips (bottom-right stack, above the kit tag)
    this._itemsEl = div('cal-items', root);

    /* --------------------------- damage numbers --------------------------- */
    const dl = div('cal-dmglayer', root);
    this._dmgPool = [];
    for (let i = 0; i < 24; i++) {
      const wrap = div('cal-px', dl);
      this._dmgPool.push({
        wrap, el: div('cal-dmg', wrap),
        active: false, age: 0, dur: 1, drift: 0, qx: NaN, qy: NaN, si: -1, hw: 0, hh: 0,
        world: new THREE.Vector3(),
      });
    }

    /* ------------------------- banners + cards ---------------------------- */
    this._bannerEl = div('cal-banners', root);
    this._tipEl = div('cal-tip cal-glass', root);
    this._tipEl.innerHTML =
      '<div class="cal-tip-title"></div><div class="cal-tip-body"></div><div class="cal-tip-keys"></div>';
    this._tipTitle = this._tipEl.querySelector('.cal-tip-title');
    this._tipKeys = this._tipEl.querySelector('.cal-tip-keys');
    this._tipBody = this._tipEl.querySelector('.cal-tip-body');
  }

  /**
   * One staff face: ten graduations, vermilion and paper, each cut as the E of a real
   * levelling staff lying on its side: a solid head with two slots out of its lower edge.
   */
  _staffFace(cls) {
    // U-06: 300 x 6, ten vermilion graduations (`.v`) with nine staff-white gaps (`.p`) between them
    let cells = '', gaps = '';
    for (let i = 0; i < 10; i++) {
      cells += `<rect class="v" x="${i * 30 + (i ? 1 : 0)}" y="0" width="${i ? 29 : 30}" height="6"/>`;
      if (i) gaps += `<rect class="p" x="${i * 30 - 1}" y="0" width="2" height="6"/>`;
    }
    return `<svg class="${cls}" viewBox="0 0 300 6" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${cells}${gaps}</svg>`;
  }

  /** One pooled projected plate: `NAME · WORK · TRANSECT nn`, a graduated bar, status gauges, a leader. */
  _makeMhb() {
    // two transforms, so a moving plate writes memoized strings (X on the wrapper, Y + scale on the plate)
    const wrap = div('cal-px', this._worldLayer);
    const el = div('cal-mhb', wrap);
    const plate = div('cal-mhb-plate cal-glass', el);
    const head = div('cal-mhb-head', plate);
    const aware = div('cal-iris', head, '<i></i>');
    const name = div('cal-mhb-name', head, 'INSTRUMENT');
    const bar = div('cal-mhb-bar', plate);
    const ghost = div('cal-mhb-ghost', bar);
    const fill = div('cal-mhb-fill', bar);
    div('cal-mhb-ticks', bar);
    const elems = div('cal-mhb-elems', plate);
    const elemEls = {};
    for (const e of ['fire', 'freeze', 'shock']) {
      const row = div('cal-elem', elems, `<span>${ELEM_LABEL[e]}</span><div class="cal-elem-rule"><i></i></div>`);
      row.dataset.e = e;
      elemEls[e] = { row, fill: row.querySelector('i'), w: -1, trig: null, shown: null };
    }
    div('cal-mhb-leader', el);
    return {
      wrap, el, plate, aware, name, ghost, fill, elemEls,
      m: null, vis: null, w: -1, ghostW: -1, clamped: null, nolead: null, awareS: '', h: 0, qx: NaN, qy: NaN, atk: false,
    };
  }

  /* ------------------------------ HUD scale -------------------------------- */

  /** `--hud-scale` tracks the viewport against 1600x900, clamped, times the player's preference. */
  _applyScale() {
    const s = this.ctx.settings || (this.ctx.settings = {});
    s.hudScale ??= 1;
    const fit = Math.min(this._vw / HUD_REF_W, this._vh / HUD_REF_H);
    const auto = Math.min(HUD_SCALE_MAX, Math.max(HUD_SCALE_MIN, fit));
    const v = Math.min(3, Math.max(0.7, auto * (Number(s.hudScale) || 1)));
    if (Math.abs(v - this._scale) < 0.001) return;
    this._scale = v;
    this._wscale = Math.max(WORLD_SCALE_MIN, v);
    this.rootEl.style.setProperty('--hud-scale', v.toFixed(3));
    TX_MEMO.clear();
    PLATE_Y.clear(); CENTRE_Y.clear(); AWARE_Y.clear();
    for (const slot of this._mhbSlots) { slot.qx = NaN; slot.qy = NaN; }
    for (const a of this._awares.values()) { a.qx = NaN; a.qy = NaN; }
    this._objQx = this._objQy = this._intQx = this._intQy = NaN;
    this._lastStripX = NaN;
  }

  /** Published for the settings page. */
  setHudScale(mult) {
    const s = this.ctx.settings || (this.ctx.settings = {});
    s.hudScale = Math.min(2, Math.max(0.7, Number(mult) || 1));
    this._applyScale();
    return s.hudScale;
  }

  /** Published: a waypoint rides the theodolite circle (`map.js` calls this). */
  setWaypoint(wp) {
    this._waypoint = wp && Number.isFinite(wp.x) ? wp : null;
    if (!this._wpPip) {
      const el = div('cal-pip wp', this._pipLayer);
      div('cal-pip-mark', el);
      this._wpPip = { el, lab: div('cal-pip-dist', el), dist: -1, vis: null };
    }
    if (!this._waypoint) { this._wpPip.el.style.visibility = 'hidden'; this._wpPip.vis = false; }
  }

  /** Published. A one-shot card: an id of TUTORIAL_CARDS or { id, title, body, keys }. */
  showTip(tip) {
    const id = typeof tip === 'string' ? tip : tip?.id;
    if (!id) return false;
    const built = TUTORIAL_CARDS.find((t) => t.id === id);
    // a bare id, or an object carrying nothing but one, means the built-in
    if (built && (typeof tip === 'string' || tip.title == null)) return this._queueTip(built);
    if (typeof tip === 'string') return false;         // unknown id, no card to show
    return this._queueTip({
      id: String(id),
      title: fieldWord(String(tip.title ?? '')).toUpperCase(),
      body: fieldWord(String(tip.body ?? '')),
      keys: Array.isArray(tip.keys) ? tip.keys.map((k) => keyGlyph(k)) : [],
    });
  }

  /**
   * Published (U-17), look films only: under `?shot=1` the field note carries a staged bible §8.9
   * beat instead of the tracked quest's own text, so a look frame prints CALIMA's quest words only.
   * `{ kicker, title, objective, meta? }`, or null to hand the note back to progression. Returns
   * false (and changes nothing) outside `?shot`, so play can never be staged.
   */
  stageNote(note) {
    if (!this.ctx.params?.has?.('shot')) return false;
    this._staged = note && (note.title || note.objective) ? {
      kicker: String(note.kicker ?? 'FIELD NOTE'),
      title: String(note.title ?? ''),
      objective: String(note.objective ?? ''),
      meta: String(note.meta ?? ''),
    } : null;
    this._trackIdleT = 0;
    this._lastObjLabel = null;
    this._renderTracker(true);
    return true;
  }

  /** How much bigger or smaller the browser PAINTED an element than it laid it out. */
  _paintScale(el) {
    let k = 1, seen = false;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const t = getComputedStyle(n).transform;
      if (!t || t === 'none') continue;
      const nums = t.slice(t.indexOf('(') + 1, -1).split(',').map((v) => parseFloat(v));
      const f = len2(nums[0], nums[1]);
      if (Number.isFinite(f) && f > 0) { k *= f; if (Math.abs(f - 1) > 1e-3) seen = true; }
    }
    return { k, seen };
  }

  /** The EFFECTIVE type size: the stylesheet's px times every transform up to the screen. */
  _scaleAudit() {
    const W = 'world';                    // scaled by `_wscale` in the transform
    const mhb = this._mhbSlots.find((m) => m.vis) ?? this._mhbSlots[0];
    const dmg = this._dmgPool.find((d) => d.active);
    const probe = [
      ['health', this._healthNum.querySelector('b')],
      ['healthMax', this._healthNum.querySelector('span')],
      ['gourd', this._gourdNum],
      ['gourdLabel', this._gourdChip.querySelector('.cal-chip-l')],
      ['track', this._trackObj],
      ['bearing', this._bearingNum],
      ['ammoName', this._wpnAmmoName],
      ['toolCount', this._toolRow.querySelector('.cal-tool-n')],
      ['eye', this._eyeLabel],
      ['tip', this._tipBody],
      ['breath', this._concEl.querySelector('.cal-breath-l')],
      ['pipDist', this._pipLayer.querySelector('.cal-pip-dist')],
      ['mhbName', mhb?.name, W],
      ['interact', this._intLabel, W],
      ['objDist', this._objDiamondDist, W],
      ['objLabel', this._objDiamondLabel, W],
      // the damage layer sizes each number inline (already scaled once)
      ['damage', dmg?.el, null],
    ];
    const fonts = {};
    const cssFonts = {};
    let min = Infinity;
    let minKey = null;
    for (const [k, el, layer] of probe) {
      if (!el) continue;
      const css = parseFloat(getComputedStyle(el).fontSize) || 0;
      const p = this._paintScale(el);
      const mult = p.seen ? p.k : (layer === W ? this._wscale : 1);
      const px = css * mult;
      cssFonts[k] = +css.toFixed(2);
      fonts[k] = +px.toFixed(2);
      if (px > 0 && px < min) { min = px; minKey = k; }
    }
    return {
      scale: +this._scale.toFixed(3),
      worldScale: +this._wscale.toFixed(3),
      setting: this.ctx.settings?.hudScale ?? 1,
      vw: this._vw, vh: this._vh,
      minFontPx: Number.isFinite(min) ? +min.toFixed(2) : null,
      minFontEl: minKey,
      fonts, cssFonts,
    };
  }

  /* -------------------------------- events -------------------------------- */

  _bindEvents() {
    const ctx = this.ctx;
    const raw = ctx.events;
    /**
     * `src/core/events.js` walks its subscriber set unguarded, so a DOM hiccup
     * in here would unwind whoever emitted. Every listener here is isolated.
     */
    const on = (name, fn) => raw.on(name, (e) => {
      try { fn(e); } catch (err) { console.warn(`[hud] ${name}:`, err?.message || err); }
    });
    this._on = on;

    // machine-damaged is the single source for damage numbers
    on('machine-damaged', (e) => {
      const m = e?.machine;
      if (!m) return;
      this._combatIdleT = 0;
      /** A hit landing is not calm: dealing damage pokes the vitals' 4 s window too. */
      this._vitalsIdleT = 0;
      const rec = this._engage(m);
      rec.hold = MHB_HOLD_S;
      rec.ghostHold = GHOST_HOLD_S;
      rec.hit = performance.now();
      this._spawnDamage(e);
      const trig = e.triggeredElement;
      if (trig && ELEM_TRIG[trig]) {
        let t = this._elemTrigs.get(m);
        if (!t) { t = {}; this._elemTrigs.set(m, t); }
        t[trig] = ELEM_TRIG[trig];
      }
    });
    on('machine-killed', (e) => this._onKill(e));
    on('machine-attack', (e) => {
      if (e?.machine) { this._attackFlash.set(e.machine, 1.35); this._engage(e.machine).hold = MHB_HOLD_S; }
      this._combatIdleT = 0;
    });
    on('machine-telegraph', (e) => {
      if (e?.machine) this._attackFlash.set(e.machine, 0.65);
      this._combatIdleT = 0;
    });
    on('machine-alerted', (e) => {
      this._combatIdleT = 0;
      if (e?.machine) this._engage(e.machine).hold = MHB_HOLD_S;
    });
    on('machine-state', (e) => {
      const m = e?.machine;
      if (!m) return;
      if (e.state === 'alert' || e.state === 'attack') this._engage(m).hold = MHB_HOLD_S;
    });
    on('machine-disposed', () => this._reapMachines());
    on('arrow-fired', () => { this._combatIdleT = 0; });
    on('item-gained', (e) => this._itemToast(e));
    on('inventory-full', (e) => this._flash(`${fieldWord(String(e?.name ?? 'POCKET')).toUpperCase()} FULL`, 'warn'));
    on('herb-gathered', () => { this._gourdChip.classList.remove('pulse'); void this._gourdChip.offsetWidth; this._gourdChip.classList.add('pulse'); });
    on('ammo-crafted', (e) => this._flash(`+${e?.n ?? 1} ${fieldWord(String(e?.name ?? e?.ammo ?? 'ARROW')).toUpperCase()}`, 'good'));
    on('item-crafted', (e) => this._flash(`+${e?.n ?? 1} ${fieldWord(String(e?.name ?? 'ITEM')).toUpperCase()}`, 'good'));
    on('tool-blocked', (e) => this._flash(fieldWord(String(e?.reason ?? 'NOT READY')).toUpperCase(), 'warn'));
    on('player-hurt', () => {
      this._hurtFlash = Math.min(1.2, this._hurtFlash + 0.75);
      this._hpGhostHold = GHOST_HOLD_S; // the ghost on the staff
      this._combatIdleT = 0;
    });
    on('watcher-flash', (e) => this._lampFlash(e));
    on('player-died', () => {
      this._hurtFlash = Math.min(1.4, this._hurtFlash + 1.0);
    });
    on('player-respawn', () => {
      this._hurtFlash = 0;
      this._vignette.style.opacity = '0';
      this._lastVin = 0;
    });
    on('checkpoint-loaded', () => { this._hurtFlash = 0; });
    on('game-start', () => this._renderTracker(true));

    /* --------------------- progression: banners, field note ---------------- */
    on('banner', (e) => this._banner(e?.title, e?.detail, e?.kind));
    for (const n of ['quest-started', 'quest-objective', 'quest-complete', 'quest-tracked', 'objective-changed']) {
      on(n, () => { this._trackIdleT = 0; this._renderTracker(true); });
    }
    // the event form of `ctx.hud.showTip`
    on('tutorial-tip', (e) => this.showTip(e?.tip ?? e));
    // the alidade answers the card that asked for it: raising it puts the SIGHTING card away, so
    // the card never stands beside the Instrument card it taught (r1 gate judge)
    on('sighting-on', () => {
      if (this._tipCur === 'sighting' && this._tipT > 0) this._dismissTip();
      for (let i = this._tipQueue.length - 1; i >= 0; i--) if (this._tipQueue[i].id === 'sighting') this._tipQueue.splice(i, 1);
    });

    /* --------------------------- tool chips -------------------------------- */
    on('tool-selected', () => { this._lastToolSig = null; this._emitUi('ui-nav'); });
    on('tool-used', () => { this._lastToolSig = null; });

    /* ---------------------------- Flagged ---------------------------------- */
    // the pennant over Brea's mark on the circle (perception.js)
    on('flagged', () => { this._flagged = true; });
    on('flag-ended', () => { this._flagged = false; });

    /* ------------------------------- input -------------------------------- */
    // Browsers exit pointer lock on Esc without delivering the keydown: any lock
    // loss during play opens the hub.
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement == null
          && this.ctx.state === 'playing'
          && this.ctx.game?.started
          && !this.ctx.params.has('shot')) {
        this.ctx.menus?.openHub?.();
      }
    });
    // Unpausing can't always re-acquire pointer lock (no user activation, and
    // browsers enforce a cooldown after Esc). Any click while playing and
    // unlocked counts as the activation we need to restore mouse-look.
    document.addEventListener('mousedown', () => {
      if (this.ctx.state === 'playing'
          && !this.ctx.input.pointerLocked
          && !this.ctx.params.has('shot')) {
        this.ctx.input.requestPointerLock();
      }
    });

    // H holds the HUD open (the dynamic hides stand aside).
    ctx.input.onDown('KeyH', () => { this._trackIdleT = 0; });
  }

  _emitUi(name) {
    try { this.ctx.events?.emit?.(name, {}); } catch { /* audio not up yet */ }
  }

  /* -------------------------- engaged-Instrument book ----------------------- */

  _engage(m) {
    let rec = this._engaged.get(m);
    if (!rec) {
      rec = { hold: 0, ghostHold: 0, ghostW: -1, hit: 0 };
      this._engaged.set(m, rec);
    }
    return rec;
  }

  _reapMachines() {
    const live = this.ctx.machines?.list;
    if (!Array.isArray(live)) return;
    const set = new Set(live);
    for (const [m, pip] of this._pips) {
      if (!set.has(m)) { pip.el.remove(); this._pips.delete(m); }
    }
    for (const [m, a] of this._awares) {
      if (!set.has(m)) { a.el.remove(); this._awares.delete(m); }
    }
    for (const m of this._engaged.keys()) if (!set.has(m)) this._engaged.delete(m);
    for (const m of this._elemTrigs.keys()) if (!set.has(m)) this._elemTrigs.delete(m);
    for (const m of this._attackFlash.keys()) if (!set.has(m)) this._attackFlash.delete(m);
  }

  /* ------------------------------ pause ------------------------------------ */

  /** The hub owns pause (menu.js); this routes the published call to it. */
  setPaused(on) {
    const ctx = this.ctx, m = ctx.menus;
    if (on) {
      if (ctx.state === 'playing') m?.openHub?.();
      return;
    }
    if (m?.hubOpen) { m.closeHub(); return; }
    if (ctx.state === 'paused') {
      ctx.state = 'playing';
      if (!ctx.params.has('shot')) ctx.input.requestPointerLock();
    }
  }

  _onKill(e) {
    const m = e?.machine ?? e ?? {};
    this._engaged.delete(m);
    this._attackFlash.delete(m);
    this._elemTrigs.delete(m);
  }

  /* ------------------------------- banners --------------------------------- */

  /** A paper band in the upper third, from progression's `banner` event. */
  _banner(title, detail, kind = 'info') {
    if (!title) return;
    const b = div(`cal-banner k-${kind}`, this._bannerEl);
    div('b-title', b).textContent = fieldWord(String(title));
    if (detail) div('b-detail', b).textContent = fieldWord(String(detail));
    setTimeout(() => b.remove(), 3900);
    while (this._bannerEl.childElementCount > 3) this._bannerEl.firstElementChild.remove();
    this._emitUi(kind === 'death' ? 'ui-error' : 'ui-confirm');
  }

  /** A short chip, centre-low: made / full / blocked. */
  _flash(text, kind = 'info') {
    const el = div(`cal-flash k-${kind}`, this._xpPops);
    el.textContent = String(text);
    setTimeout(() => el.remove(), 1900);
    while (this._xpPops.childElementCount > 5) this._xpPops.firstElementChild.remove();
  }

  /* ------------------------------ item chips -------------------------------- */

  /**
   * A loot event that opened the take-all popup renders the POPUP ONLY; chips
   * serve auto-pickups and gathers. interactables.js emits 'item-gained' BEFORE
   * it calls popup.show() in the same synchronous stack, so toasts are buffered
   * one microtask and dropped when the popup claimed their ids. Gate `A10`.
   */
  _itemToast(e) {
    const id = e?.id ?? e?.item?.id ?? (typeof e?.item === 'string' ? e.item : null);
    const n = e?.count ?? e?.n ?? e?.qty ?? 1;
    if (id == null) return;
    this._pendingItems.push({ id: String(id), n, e });
    if (!this._itemFlushQueued) {
      this._itemFlushQueued = true;
      queueMicrotask(() => this._flushItemToasts());
    }
  }

  _flushItemToasts() {
    this._itemFlushQueued = false;
    const pop = LOOT_POPUP.instance;
    const claimed = pop && pop.visible
      && (performance.now() - pop.shownAt) < LOOT_CLAIM_MS ? pop.shownIds : null;
    for (const it of this._pendingItems) {
      if (claimed && claimed.has(it.id)) continue; // popup owns this loot event
      this._renderItemToast(it.id, it.n, it.e);
    }
    this._pendingItems.length = 0;
  }

  _renderItemToast(id, n, e) {
    const name = itemPlayerName(id, e?.name);
    // merge into the newest row when the same item streams in
    const last = this._itemsEl.lastChild;
    if (last && last.dataset.id === id) {
      n += Number(last.dataset.n) || 0;
      last.remove();
    }
    const el = document.createElement('div');
    el.className = 'cal-item';
    el.dataset.id = id;
    el.dataset.n = String(n);
    el.innerHTML = `<i class="cal-item-ic">${itemIcon(id)}</i><span></span><b>${n > 0 ? '×' + n : ''}</b>`;
    el.querySelector('span').textContent = name;
    this._itemsEl.appendChild(el);
    while (this._itemsEl.children.length > 5) this._itemsEl.firstChild.remove();
    setTimeout(() => el.remove(), 3050);
  }

  /* ---------------------------- damage numbers ----------------------------- */

  _dmgSlot() {
    let slot = null, oldest = null;
    for (const c of this._dmgPool) {
      if (!c.active) { slot = c; break; }
      if (!oldest || c.age > oldest.age) oldest = c;
    }
    return slot ?? oldest;
  }

  _popNumber(point, text, cls, dur, px) {
    const slot = this._dmgSlot();
    slot.active = true;
    slot.age = 0;
    slot.dur = dur;
    slot.world.copy(point);
    slot.world.y += 0.15;
    slot.drift = (Math.random() - 0.5) * 40;
    slot.el.textContent = text;
    slot.el.className = 'cal-dmg' + (cls ? ' ' + cls : '');
    slot.el.style.fontSize = px.toFixed(1) + 'px';
    slot.el.style.visibility = 'visible';
    // the painted box, from Plex Mono's advance (0.6 em) and the chip's padding: read every frame, never measured
    slot.hw = (String(text).length * px * 0.6 + 12) * 0.5;
    slot.hh = (px + 6) * 0.5;
  }

  /**
   * Plex Mono (bible §9.7): paper-white for Blunt, a cobalt-on-paper chip for a
   * weak point (never below 18 px), carmine for Pry. Sized by how much of the
   * target the hit took off.
   */
  _spawnDamage(e) {
    if (!e) return;
    let point = e.point;
    if (!point && e.machine?.position) {
      this._v.copy(e.machine.position);
      this._v.y += (e.machine.height ?? 2) * 0.6;
      point = this._v;
    }
    if (!point) return;
    const dmg = Math.round(e.damage ?? 0);
    const maxH = e.machine?.maxHealth || 400;
    const frac = clamp01(dmg / maxH);
    const s = this._scale;
    if (dmg > 0) {
      const base = (15 + 30 * Math.pow(frac, 0.55)) * s;
      // 15 px, not 14: the pop-in curve opens at 0.82x
      const px = e.weak ? Math.max(18, base * 1.28) : Math.max(15, base);
      this._popNumber(point, String(dmg), e.weak ? 'weak' : '', e.weak ? 1.15 : 0.92,
        Math.min(52 * Math.max(1, s), px));
    }
    if (e.tornPart) {
      this._v2.copy(point);
      this._v2.y += 0.42;
      this._popNumber(this._v2, 'PRY', 'pry', 1.25, Math.max(18, 22 * s));
    }
  }

  _updateDamageNumbers(dt) {
    const cam = this.ctx.camera;
    const v = this._v;
    for (let i = 0; i < this._dmgPool.length; i++) {
      const d = this._dmgPool[i];
      if (!d.active) continue;
      d.age += dt;
      if (d.age >= d.dur) {
        d.active = false;
        d.el.style.visibility = 'hidden';
        continue;
      }
      v.copy(d.world).project(cam);
      if (v.z > 1 || v.z < -1) {
        d.el.style.visibility = 'hidden';
        continue;
      }
      d.el.style.visibility = 'visible';
      const k = d.age / d.dur;
      const rise = 1 - (1 - k) * (1 - k);
      this._dmgClear((v.x * 0.5 + 0.5) * this._vw + d.drift * rise, (-v.y * 0.5 + 0.5) * this._vh - 44 * rise, d.hw, d.hh);
      const qx = Math.round(this._dmgX), qy = Math.round(this._dmgY);
      if (qx !== d.qx) { d.qx = qx; d.wrap.style.transform = txString(qx); }
      const si = k < 0.14 ? Math.round((k / 0.14) * 10) : 10;
      if (qy !== d.qy || si !== d.si) { d.qy = qy; d.si = si; d.el.style.transform = dmgY(qy, si); }
      const o = k < 0.1 ? k / 0.1 : k > 0.62 ? (1 - k) / 0.38 : 1;
      d.el.style.opacity = OPACITY_STR[Math.round(o * 20)];
    }
  }

  /**
   * A number belongs to the part that was hit, but what she reads keeps its place: the circle with
   * the vial's word, the column and every plate. A number that would land on one steps clear of it,
   * by the same bounds the plates resolve against (`_updateMachineBars`, which runs first this frame).
   * Writes `_dmgX` and `_dmgY`: this runs per number per frame.
   */
  _dmgClear(x, y, hw, hh) {
    const sc = this._scale, gap = MHB_GAP * sc;
    // (x, y) is the number's bottom centre (`dmgY`)
    const h = hh * 2;
    // the whole circle across the top of the frame, and under its middle the vial
    if (y - h < MHB_TOP_BASE * sc) y = MHB_TOP_BASE * sc + h + gap;
    if (Math.abs(x - this._vw * 0.5) < MHB_EYE_HALF * sc + hw && y - h < MHB_EYE_BASE * sc) {
      y = MHB_EYE_BASE * sc + h + gap;
    }
    const colB = this._colFoot(sc);
    const colR = MHB_SAFE_L * sc;
    if (x - hw < colR && y - h < colB) {
      const toRight = colR + hw + gap - x, toBelow = colB + h + gap - y;
      if (toRight <= toBelow) x += toRight; else y += toBelow;
    }
    // a plate can sit under the circle, so the plates are tried after it, twice: stepping below one can land on the next
    const ws = this._wscale;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < MHB_CAP; i++) {
        const px = this._mhbX[i];
        if (px !== px) continue;
        const py = this._mhbY[i];
        const ph = (this._mhbSlots[i].h || MHB_PLATE_H) * ws;
        const halfW = this._mhbHW[i] || MHB_W * 0.5 * ws;
        if (Math.abs(x - px) < halfW + hw && y > py - ph && y - h < py) y = py + h + gap;
      }
    }
    this._dmgX = x;
    this._dmgY = y;
  }

  /* ------------------------------ frame update ----------------------------- */

  update(dt, t) {
    const p = this.ctx.player;
    if (!p) return;
    const vw = this._forceVw || window.innerWidth;
    const vh = this._forceVh || window.innerHeight;
    if (this._vw !== vw || this._vh !== vh) {
      this._vw = vw;
      this._vh = vh;
      this._applyScale();
    }
    this._t += dt;
    this._aimT = p.aiming ? this._aimT + dt : 0;
    this._marksT -= dt;
    if (this._marksT <= 0) {
      this._marksT = 0.25;
      this._marks = this.ctx.progression?.getMarkers?.() ?? null;
      this._questKind = this._trackedKillKind();
    }
    this._scanMachines(dt, p);
    this._updateHealth(dt, p);
    this._updateCompass(dt, p);
    this._updateAwareness(dt, p);
    this._updateMachineBars(dt);
    this._updateReticle(p);
    this._updateCombatIdle(dt, p);
    this._updateInteract();
    this._updateObjectiveMark(p);
    this._updateDamageNumbers(dt);
    this._updateVignette(dt, t, p);

    /**
     * Everything below builds a dirty-check signature, which is an allocation.
     * At 60 fps that is garbage for panels a player cannot read changing faster
     * than they can blink, so they run on a 10 Hz sampler.
     */
    this._slowT += dt;
    if (this._slowT < 0.1) return;
    const sdt = this._slowT;
    this._slowT = 0;
    this._updateTracker(sdt);
    this._updateStealth(sdt, p);
    this._updateWeapon();
    this._updateCraft();
    this._updateTools();
    this._updateSalt();
    this._updateTips(sdt);
  }

  /** The salt count beside the gourd: a string only when the number changes. */
  _updateSalt() {
    const n = CURRENCY_ID ? (this.ctx.inventory?.count?.(CURRENCY_ID) ?? 0) : 0;
    if (n === this._lastSalt) return;
    this._lastSalt = n;
    this._saltNum.textContent = String(n).padStart(3, '0');
  }

  /**
   * ONE pass over `machines.list` per frame that every consumer below reads
   * from: hostility, distance, and the cap-3 plate election. No allocation.
   */
  _scanMachines(dt, p) {
    this._anyHostile = false;
    this._nearestHostileDist = Infinity;
    this._nearestInstrumentDist = Infinity;
    for (let i = 0; i < MHB_CAP; i++) { this._mhbPick[i] = null; this._mhbPickW[i] = -1; }

    // decay attack-flash + status countdowns (prebuilt callbacks: no iterator, no key list)
    this._scanDt = dt;
    if (this._attackFlash.size) this._attackFlash.forEach(this._decayFlash);
    if (this._elemTrigs.size) this._elemTrigs.forEach(this._decayTrig);

    const list = this.ctx.machines?.list;
    if (!Array.isArray(list)) return;
    const px = p.position.x, pz = p.position.z;

    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const pos = m.position ?? m.root?.position;
      if (!pos) continue;
      const alive = m.alive !== false;
      const hostile = alive && (m.state === 'alert' || m.state === 'attack');
      const dx = pos.x - px, dz = pos.z - pz;
      const dist = len2(dx, dz);
      if (alive && dist < this._nearestInstrumentDist) this._nearestInstrumentDist = dist;
      if (hostile) {
        this._anyHostile = true;
        if (dist < this._nearestHostileDist) this._nearestHostileDist = dist;
      }

      const rec = this._engaged.get(m);
      if (rec) {
        if (hostile) rec.hold = MHB_HOLD_S;
        else rec.hold -= dt;
        if (rec.ghostHold > 0) rec.ghostHold -= dt;
        if (!alive || rec.hold <= 0 || dist > MHB_RANGE) { this._engaged.delete(m); continue; }

        // cap-3 election: most recently hit wins, then nearest
        const weight = rec.hit * 1e-3 + (1 - Math.min(1, dist / MHB_RANGE));
        for (let s = 0; s < MHB_CAP; s++) {
          if (weight > this._mhbPickW[s]) {
            for (let k = MHB_CAP - 1; k > s; k--) {
              this._mhbPick[k] = this._mhbPick[k - 1];
              this._mhbPickW[k] = this._mhbPickW[k - 1];
            }
            this._mhbPick[s] = m;
            this._mhbPickW[s] = weight;
            break;
          }
        }
      }
    }
  }

  /* ----------------------- dynamic HUD: combat idle ------------------------ */

  /** The kit tag and the reticle dot recede when out of combat for ~4 s. */
  _updateCombatIdle(dt, p) {
    const c = this.ctx.combat;
    const engaged = !!p.aiming
      || (c?.drawStrength ?? 0) > 0.02
      || !!c?.steady?.active
      || !!c?.weaponDrawn
      || !!this.ctx.wheel?.open
      || this._anyHostile
      || this._engaged.size > 0;
    if (engaged) this._combatIdleT = 0;
    else this._combatIdleT += dt;
    const idle = this._combatIdleT > COMBAT_IDLE_S;
    if (idle !== this._lastWpnIdle) {
      this._lastWpnIdle = idle;
      this._wpnEl.classList.toggle('idle', idle);
      this._dotEl.classList.toggle('idle', idle);
    }
  }

  /* --------------------------- lamp blind-flash ----------------------------- */

  _lampFlash(e) {
    const m = e?.machine;
    const p = this.ctx.player;
    if (!m?.position || !p?.position) return;
    const dx = m.position.x - p.position.x;
    const dz = m.position.z - p.position.z;
    const dist = len2(dx, dz);
    if (dist > 12) return;
    const inv = dist > 0.001 ? 1 / dist : 0;
    const facing = (dx * -Math.sin(p.camYaw) + dz * -Math.cos(p.camYaw)) * inv;
    if (facing < 0.2) return;
    const el = this._wflash;
    el.classList.remove('show');
    void el.offsetWidth; // restart the 1.5 s animation
    el.classList.add('show');
  }

  /* --------------------------- staff + gourd -------------------------------- */

  /**
   * The levelling staff (bible §9.7): alternating vermilion and paper
   * graduations at 10 %, damage eating from the right. The reading index settles
   * on a spring curve (CSS transition, no per-frame work). A hold-H reveal beats
   * the dynamic hide.
   */
  _updateHealth(dt, p) {
    const hp = clamp01(p.health / p.maxHealth);
    const w = Math.round(hp * 100);
    if (w !== this._lastHp) {
      this._lastHp = w;
      this._healthFill.style.clipPath = CLIP_R[w];
      this._staffIndex.style.left = w + '%';
      const low = hp < 0.32;
      if (low !== this._lastLow) {
        this._lastLow = low;
        this._topleftEl.classList.toggle('low', low);
      }
    }
    const hpNum = Math.max(0, Math.min(999, Math.round(p.health)));
    if (hpNum !== this._lastHpNum) {
      this._lastHpNum = hpNum;
      this._healthNum.firstChild.textContent = BEARING_STR[hpNum] ?? String(hpNum);
      this._healthNum.lastChild.textContent = '/' + Math.round(p.maxHealth);
    }

    // the ghost: holds at the pre-hit reading, then drains to the fill
    let gw = this._hpGhostW;
    if (gw < 0 || gw < w) gw = w;
    else if (gw > w) {
      if (this._hpGhostHold > 0) this._hpGhostHold -= dt;
      else gw = Math.max(w, gw - GHOST_DRAIN * dt);
    }
    const gq = Math.round(gw);
    if (gq !== this._hpGhostW) {
      this._hpGhostW = gq;
      this._healthGhost.style.transform = SCALE_X[gq];
    }

    const maxGourd = p.maxGourd || 100;
    const raw = p.gourd ?? 0;
    const gourd = clamp01(raw / maxGourd);
    const pw = Math.round(gourd * 100);
    if (pw !== this._lastGourd) {
      this._lastGourd = pw;
      this._gourdFill.style.transform = SCALE_X[pw];
    }
    const gn = Math.max(0, Math.min(999, Math.round(raw)));
    if (gn !== this._lastGourdNum) {
      this._lastGourdNum = gn;
      this._gourdNum.textContent = BEARING_STR[gn] ?? String(gn);
    }
    const healing = !!p.healing;
    if (healing !== this._lastHealing) {
      this._lastHealing = healing;
      this._gourdChip.classList.toggle('healing', healing);
      this._topleftEl.classList.toggle('healing', healing);
    }
    const hint = raw > 0.5 && p.health < p.maxHealth * 0.92;
    if (hint !== this._lastGourdHint) {
      this._lastGourdHint = hint;
      this._gourdKey.classList.toggle('show', hint);
    }

    const held = !!this.ctx.input?.keys?.has?.('KeyH');
    this._reveal = held ? 1 : Math.max(0, this._reveal - dt * 3);
    const engaged = hp < 0.999 || healing || this._hurtFlash > 0.02
      || this._anyHostile || this._engaged.size > 0
      || gq > w + 0.25 || this._reveal > 0.01;
    if (engaged) this._vitalsIdleT = 0;
    else this._vitalsIdleT += dt;
    const idle = this._vitalsIdleT > VITALS_IDLE_S;
    if (idle !== this._lastIdle) {
      this._lastIdle = idle;
      this._vitalsEl.classList.toggle('idle', idle);
    }
    const reveal = this._reveal > 0.01;
    if (reveal !== this._lastReveal) {
      this._lastReveal = reveal;
      this.rootEl.classList.toggle('reveal', reveal);
    }
  }

  /* ---------------------------- the field note ------------------------------ */

  /** Reads `ctx.progression` (real quest data lands with progression, W3). */
  _renderTracker(force) {
    const prog = this.ctx.progression;
    let title = null, obj = null, meta = '';
    const st = this._staged;
    const kick = st ? st.kicker : 'FIELD NOTE';
    if (this._trackKicker.textContent !== kick) this._trackKicker.textContent = kick;
    if (st) {
      title = st.title; obj = st.objective; meta = st.meta;
    } else if (prog?.tracked) {
      const s = prog.state(prog.tracked);
      if (s && s.status === 'active') {
        title = s.title;
        const o = s.current;
        obj = o ? o.label : 'Report back';
        if (o && o.need > 1) meta = `${o.have} / ${o.need}`;
        else if (s.progress > 0) meta = `${Math.round(s.progress * 100)}%`;
      }
    }
    const sig = `${title}|${obj}|${meta}`;
    if (!force && sig === this._lastTrackSig) return;
    const bump = this._lastTrackSig && this._lastTrackSig.split('|')[1] !== String(obj);
    this._lastTrackSig = sig;
    if (!title) { this._trackEl.classList.add('off'); return; }
    this._trackEl.classList.remove('off');
    this._trackTitle.textContent = fieldWord(String(title)).toUpperCase();
    this._trackObj.textContent = fieldWord(String(obj ?? ''));
    this._trackMeta.textContent = meta;
    this._trackMeta.style.display = meta ? '' : 'none';
    if (bump) {
      this._trackEl.classList.remove('bump');
      void this._trackEl.offsetWidth;
      this._trackEl.classList.add('bump');
    }
  }

  /** Dynamic hide: the note recedes when nothing has changed for a while. */
  _updateTracker(dt) {
    this._trackRenderT = (this._trackRenderT ?? 0) - dt;
    if (this._trackRenderT <= 0) {
      this._trackRenderT = 0.5;
      this._renderTracker(false);
      // one layout read at 2 Hz: where the column really ends (+ the resolver's gap)
      const off = this._trackEl.classList.contains('off');
      const el = off ? this._vitalsEl : this._trackEl;
      this._colFootPx = el.getBoundingClientRect().bottom + 8 * this._scale;
    }
    const busy = this._anyHostile || this._reveal > 0.01 || this._trackIdleT < TRACK_IDLE_S;
    this._trackIdleT += dt;
    const idle = !busy;
    if (idle !== this._trackIdle) {
      this._trackIdle = idle;
      this._trackEl.classList.toggle('idle', idle);
    }
  }

  /* -------------------------------- compass -------------------------------- */

  /**
   * THE THEODOLITE CIRCLE. Ticks every 5°, numerals every 30°, a 3-digit bearing
   * readout, and the limb has inertia: it chases the camera on an under-damped
   * spring and settles. ONE transform per frame on one prebuilt strip.
   *
   * COMPASS TRUTH (`A71-compass-truth`): an Instrument is on the circle only when
   * the player has EARNED it: Flagged in Sighting (`ctx.sighting.tags`), the
   * tracked objective's target, or fighting her. A ◆ in its lamp colour, its
   * iris at the lamp's aperture. Sites ride the same circle: settlement ■,
   * site ●, benchmark ▲.
   */
  _updateCompass(dt, p) {
    const camB = norm360(-p.camYaw * RAD2DEG);

    if (this._cAngle == null || this.ctx.settings?.reducedMotion) {
      this._cAngle = camB; this._cVel = 0;
    } else {
      // a spring on the shortest way round; dt is clamped so a hitch cannot ring it
      const h = Math.min(0.033, dt);
      const err = wrap180(camB - this._cAngle);
      if (Math.abs(err) > 90) { this._cAngle = camB; this._cVel = 0; }
      else {
        this._cVel += (COMPASS_SPRING_K * err - COMPASS_SPRING_C * this._cVel) * h;
        this._cAngle = norm360(this._cAngle + this._cVel * h);
      }
    }
    const x = (-(this._cAngle - STRIP_FROM) * PX_PER_DEG + STRIP_W * 0.5) * this._scale;
    if (Math.abs(x - this._lastStripX) >= 0.25 || this._lastStripX !== this._lastStripX) {
      this._lastStripX = x;
      this._stripEl.style.transform = txString(x);
    }

    const bi = Math.round(camB) % 360;
    if (bi !== this._lastBearing) {
      this._lastBearing = bi;
      this._bearingNum.textContent = BEARING_STR[bi];
    }

    const flag = this._flagged || !!this.ctx.machines?.perception?.flagActive;
    if (flag !== this._lastFlag) {
      this._lastFlag = flag;
      this._pennantEl.classList.toggle('show', flag);
    }

    const list = this.ctx.machines?.list;
    if (Array.isArray(list)) {
      const tags = this.ctx.sighting?.tags;
      let questTarget = null;
      if (this._questKind) {
        let bd = Infinity;
        for (let i = 0; i < list.length; i++) {
          const m = list[i];
          if (m.kind !== this._questKind || m.alive === false) continue;
          const pos = m.position ?? m.root?.position;
          if (!pos) continue;
          const dx = pos.x - p.position.x, dz = pos.z - p.position.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < bd) { bd = d2; questTarget = m; }
        }
      }
      this._questTarget = questTarget;

      const pipVis = this._pipVis;
      let pipN = 0;
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        const flagged = !!tags?.has?.(m);
        const isQuest = m === questTarget;
        const fighting = this._engaged.has(m)
          || (m.alive !== false && (m.state === 'alert' || m.state === 'attack'));
        const earned = flagged || isQuest || fighting;
        let pip = this._pips.get(m);
        if (!earned) {
          if (pip && pip.vis !== false) { pip.el.style.visibility = 'hidden'; pip.vis = false; }
          continue;
        }
        if (!pip) {
          const el = div('cal-pip', this._pipLayer);
          div('cal-iris', el, '<i></i>');
          pip = { el, lab: div('cal-pip-dist', el), s: null, vis: null, dist: -1, k: null, x: NaN, labOn: true };
          this._pips.set(m, pip);
        }
        const pos = m.position ?? m.root?.position;
        if (!pos || m.alive === false) {
          if (pip.vis !== false) { pip.el.style.visibility = 'hidden'; pip.vis = false; }
          continue;
        }
        const dx = pos.x - p.position.x;
        const dz = pos.z - p.position.z;
        const dist = len2(dx, dz);
        const d = wrap180(Math.atan2(dx, -dz) * RAD2DEG - this._cAngle);
        if (dist > 320 || Math.abs(d) > this._halfWinDeg) {
          if (pip.vis !== false) { pip.el.style.visibility = 'hidden'; pip.vis = false; }
          continue;
        }
        if (pip.vis !== true) { pip.el.style.visibility = 'visible'; pip.vis = true; }
        pipVis[pipN++] = pip;
        const px = d * PX_PER_DEG * this._scale;
        if (Math.abs(px - pip.x) >= 0.5 || pip.x !== pip.x) {
          pip.x = px;
          pip.el.style.transform = txString(px);
        }
        const s = lampStateOf(m);
        if (pip.s !== s) { pip.s = s; pip.el.dataset.s = s; }
        const k = flagged ? 'flag' : isQuest ? 'quest' : 'fight';
        if (pip.k !== k) { pip.k = k; pip.el.dataset.k = k; }
        const di = Math.round(dist);
        if (di !== pip.dist) { pip.dist = di; pip.lab.textContent = di < 360 ? BEARING_STR[di] : String(di); }
      }
      // marks that crowd share one reading: the nearest Instrument's
      const near = PIP_LABEL_PX * this._scale;
      for (let a = 0; a < pipN; a++) {
        const pa = pipVis[a];
        let show = true;
        for (let b = 0; b < pipN; b++) {
          if (a === b) continue;
          const pb = pipVis[b];
          if (Math.abs(pa.x - pb.x) < near && (pb.dist < pa.dist || (pb.dist === pa.dist && b < a))) { show = false; break; }
        }
        if (show !== pa.labOn) { pa.labOn = show; pa.lab.style.visibility = show ? '' : 'hidden'; }
      }
    }

    this._updateQuestPips(dt, p);
    this._updateWaypointPip(p);
  }

  /** Which Instrument kind, if any, the tracked objective is asking her to hunt. */
  _trackedKillKind() {
    const prog = this.ctx.progression;
    if (!prog?.tracked) return null;
    const s = prog.state(prog.tracked);
    const o = s?.current;
    if (o && (o.type === 'kill' || o.type === 'scan')) {
      const def = prog.def?.(prog.tracked);
      const raw = def?.objectives?.find((x) => x.id === o.id);
      if (raw?.kind) return raw.kind;
    }
    return null;
  }

  /** Objective and site marks on the circle: settlement ■, site ●, benchmark ▲ (pooled). */
  _updateQuestPips(dt, p) {
    this._siteMarksT -= dt;
    if (this._siteMarksT <= 0) {
      this._siteMarksT = 1;
      this._siteMarks = this.ctx.menus?.map?.compassMarks?.() ?? null;
    }
    const marks = this._marks;
    const sites = this._siteMarks;
    const nQ = Array.isArray(marks) ? Math.min(marks.length, 6) : 0;
    const nS = Array.isArray(sites) ? Math.min(sites.length, 8) : 0;
    const n = nQ + nS;
    while (this._questPips.length < n) {
      const el = div('cal-pip qm', this._pipLayer);
      div('cal-pip-mark', el);
      this._questPips.push({ el, lab: div('cal-pip-dist', el), dist: -1, vis: null, x: NaN, shape: '', tracked: null });
    }
    for (let i = 0; i < this._questPips.length; i++) {
      const q = this._questPips[i];
      const mk = i < nQ ? marks[i] : i < n ? sites[i - nQ] : null;
      if (!mk) {
        if (q.vis !== false) { q.el.style.visibility = 'hidden'; q.vis = false; }
        continue;
      }
      const dx = mk.x - p.position.x, dz = mk.z - p.position.z;
      const dist = len2(dx, dz);
      const d = wrap180(Math.atan2(dx, -dz) * RAD2DEG - this._cAngle);
      if (Math.abs(d) > this._halfWinDeg) {
        if (q.vis !== false) { q.el.style.visibility = 'hidden'; q.vis = false; }
        continue;
      }
      if (q.vis !== true) { q.el.style.visibility = 'visible'; q.vis = true; }
      const px = d * PX_PER_DEG * this._scale;
      if (Math.abs(px - q.x) >= 0.5 || q.x !== q.x) {
        q.x = px;
        q.el.style.transform = txString(px);
      }
      const shape = mk.shape ?? (mk.kind === 'settlement' || mk.kind === 'camp' ? 'settlement'
        : mk.kind === 'benchmark' ? 'benchmark' : i < nQ ? 'objective' : 'site');
      if (q.shape !== shape) { q.shape = shape; q.el.dataset.shape = shape; }
      const tr = i < nQ && !!mk.tracked;
      if (q.tracked !== tr) { q.tracked = tr; q.el.dataset.tracked = tr ? '1' : '0'; }
      const di = Math.round(dist);
      if (di !== q.dist) { q.dist = di; q.lab.textContent = di < 360 ? BEARING_STR[di] : String(di); }
    }
  }

  _updateWaypointPip(p) {
    const wp = this._waypoint, q = this._wpPip;
    if (!wp || !q) return;
    const dx = wp.x - p.position.x, dz = wp.z - p.position.z;
    const d = wrap180(Math.atan2(dx, -dz) * RAD2DEG - this._cAngle);
    const clamped = Math.max(-this._halfWinDeg, Math.min(this._halfWinDeg, d));
    if (q.vis !== true) { q.el.style.visibility = 'visible'; q.vis = true; }
    q.el.style.transform = txString(clamped * PX_PER_DEG * this._scale);
    const di = Math.round(len2(dx, dz));
    if (di !== q.dist) { q.dist = di; q.lab.textContent = String(di); }
  }

  _compassAudit() {
    let pips = 0, quest = 0;
    const styles = [];
    for (const [, pip] of this._pips) {
      if (!pip.vis) continue;
      pips++;
      const dia = pip.el.querySelector('.cal-iris');
      const hole = dia?.firstChild;
      const cs = hole ? getComputedStyle(hole) : null;
      styles.push({
        state: pip.s, kind: pip.k,
        color: cs?.backgroundColor ?? null,
        apertureCss: cs ? +(parseFloat(cs.width) / Math.max(0.01, dia.clientWidth)).toFixed(2) : null,
        token: COMPASS_PIP[pip.s] ?? null,
      });
    }
    for (const q of this._questPips) if (q.vis) quest++;
    const tags = this.ctx.sighting?.tags;
    const list = this.ctx.machines?.list ?? [];
    return {
      machinePips: pips,
      questPips: quest,
      tagCount: tags?.size ?? 0,
      machinesInWindow: list.length,
      hostile: list.filter((m) => m.alive !== false && (m.state === 'alert' || m.state === 'attack')).length,
      engaged: this._engaged.size,
      questKind: this._questKind ?? null,
      pipStyles: styles,
      bearing: this._bearingNum.textContent,
      flagged: this._pennantEl.classList.contains('show'),
      limb: +this._cAngle?.toFixed?.(2),
      waypoint: this._waypoint ? { x: this._waypoint.x, z: this._waypoint.z } : null,
    };
  }

  /* ------------------------------ the vial --------------------------------- */

  /**
   * The answer to "can they see me right now": the bubble runs off level with
   * the strongest live detection. HIDDEN (concealed) -> UNSEEN (in the open,
   * nobody looking) -> NOTICED (a meter is filling) -> SPOTTED (locked on).
   */
  _updateStealth(dt, p) {
    let fill = 0;
    const list = this.ctx.machines?.list;
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (m.alive === false) continue;
        if (m.state === 'alert' || m.state === 'attack') { fill = 1; break; }
        const s = m.suspicion ?? 0;
        if (s > fill) fill = s;
      }
    }
    fill = clamp01(fill);
    const hidden = !!(p.crouching && p.inTallGrass) && fill < 0.05;
    const noise = clamp01((p.moveSpeed ?? 0) / 7) * (p.crouching ? 0.35 : 1);
    const mode = fill >= 0.999 ? 'seen' : hidden ? 'hidden' : fill > AWARE_MIN_SUSPICION ? 'watch' : 'clear';
    // U-02: UNSEEN for 4 s and the vial puts itself away; any reading brings it back (hold H too)
    this._vialIdleT = mode === 'clear' ? (this._vialIdleT ?? 0) + dt : 0;
    const vialIdle = this._vialIdleT > VIAL_IDLE_S;
    if (vialIdle !== this._lastVialIdle) { this._lastVialIdle = vialIdle; this._eyeEl.classList.toggle('idle', vialIdle); }
    if (mode !== this._lastVialMode) {
      this._lastVialMode = mode;
      this._eyeEl.dataset.m = mode;
      this._eyeLabel.textContent = mode === 'seen' ? 'SPOTTED'
        : mode === 'watch' ? 'NOTICED' : mode === 'hidden' ? 'HIDDEN' : 'UNSEEN';
    }
    const b = (fill * 20) | 0;
    if (b !== this._lastVialBubble) {
      this._lastVialBubble = b;
      this._eyeEl.style.setProperty('--run', (b / 20).toFixed(2));
    }
    const lit = Math.round(noise * 3);
    if (lit !== this._lastVialNoise) {
      this._lastVialNoise = lit;
      const bars = this._eyeBars.children;
      for (let i = 0; i < bars.length; i++) bars[i].classList.toggle('on', i < lit);
    }
  }

  /* ------------------------ awareness rods ---------------------------------- */

  _awareEntry(m) {
    let a = this._awares.get(m);
    if (!a) {
      const wrap = div('cal-px', this._awareLayer);
      const el = div('cal-aware', wrap);
      const rod = div('cal-aware-rod', el, '<i></i>');
      div('cal-iris', el, '<i></i>');
      a = { wrap, el, fill: rod.firstChild, mode: null, frac: -1, vis: null, edge: null, chirped: false, s: '', qx: NaN, qy: NaN };
      this._awares.set(m, a);
    }
    return a;
  }

  /**
   * A small graduated rod over an Instrument that is starting to notice her: it
   * appears from `suspicion > 0.04`, fills as the detection does, and becomes the
   * lamp's iris when it has her. Edge-clamped when off screen.
   */
  _updateAwareness(dt, p) {
    const list = this.ctx.machines?.list;
    if (!Array.isArray(list)) return;
    const cam = this.ctx.camera;
    const v = this._v;

    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const a = this._awareEntry(m);

      let mode = null;
      let frac = 0;
      if (m.alive !== false && m !== this._mhbPick[0] && m !== this._mhbPick[1] && m !== this._mhbPick[2]) {
        const sus = clamp01(m.suspicion ?? 0);
        if (this._attackFlash.has(m)) {
          mode = 'attack';
        } else if (m.state === 'alert' || m.state === 'attack') {
          mode = 'alert';
        } else if (sus > AWARE_MIN_SUSPICION) {
          mode = 'fill';
          frac = sus;
        }
      }

      if (!mode) {
        if (a.vis !== false) { a.el.style.visibility = 'hidden'; a.vis = false; }
        a.chirped = false;
        continue;
      }

      const pos = m.position ?? m.root?.position;
      if (!pos) {
        if (a.vis !== false) { a.el.style.visibility = 'hidden'; a.vis = false; }
        continue;
      }
      v.set(pos.x, pos.y + (m.height ?? 2.2) + 0.7, pos.z).project(cam);
      const behind = v.z > 1;
      let x = (v.x * 0.5 + 0.5) * this._vw;
      let y = (-v.y * 0.5 + 0.5) * this._vh;
      if (behind) { // mirror through screen centre so the clamp points backward
        x = this._vw - x;
        y = this._vh - y;
      }
      const mgn = AWARE_EDGE_MARGIN;
      const edge = behind || x < mgn || x > this._vw - mgn || y < mgn || y > this._vh - mgn;
      if (edge) {
        const cx = this._vw / 2, cy = this._vh / 2;
        const dx = x - cx;
        const dy = behind ? Math.abs(y - cy) + cy * 0.4 : y - cy;
        const k = Math.min(
          (cx - mgn) / Math.max(1e-4, Math.abs(dx)),
          (cy - mgn) / Math.max(1e-4, Math.abs(dy)),
        );
        x = cx + dx * k;
        y = cy + dy * k;
      }

      if (a.vis !== true) {
        a.el.style.visibility = 'visible';
        a.vis = true;
        if (!a.chirped) { a.chirped = true; this._emitUi('ui-nav'); }
      }
      if (a.edge !== edge) { a.edge = edge; a.el.classList.toggle('edge', edge); }
      const qx = Math.round(x), qy = Math.round(y);
      if (qx !== a.qx) { a.qx = qx; a.wrap.style.transform = txString(qx); }
      if (qy !== a.qy) { a.qy = qy; a.el.style.transform = awareY(qy, this._scale); }
      if (a.mode !== mode) { a.mode = mode; a.el.dataset.m = mode; a.frac = -1; }
      const s = lampStateOf(m);
      if (a.s !== s) { a.s = s; a.el.dataset.s = s; }
      if (mode === 'fill' && Math.abs(frac - a.frac) > 0.02) {
        a.frac = frac;
        a.fill.style.transform = SCALE_Y[Math.round(frac * 100)];
      }
    }
  }

  /* --------------------- projected Instrument plates ------------------------ */

  /**
   * Every engaged Instrument (cap 3, elected in `_scanMachines`) carries its own
   * paper plate over its working end: its card line, a graduated bar with a ghost,
   * its status gauges, and a leader down to it.
   */
  _updateMachineBars(dt) {
    const cam = this.ctx.camera;
    const ws = this._wscale;
    const sc = this._scale;
    const X = this._mhbX, Y = this._mhbY, C = this._mhbC, HW = this._mhbHW, B = this._mhbBox;
    let any = false;

    /* 0. each engaged Instrument's own screen box (feet to head): no plate may cover one (r1 gate judge) */
    for (let i = 0; i < MHB_CAP; i++) {
      const m = this._mhbPick[i], o = i * 4;
      B[o] = 0; B[o + 2] = -1;
      const pos = m && (m.position ?? m.root?.position);
      if (!pos) continue;
      const h = m.height ?? 2.2;
      this._v.set(pos.x, pos.y, pos.z).project(cam);
      if (this._v.z > 1) continue;
      const fx = (this._v.x * 0.5 + 0.5) * this._vw, fy = (-this._v.y * 0.5 + 0.5) * this._vh;
      this._v.set(pos.x, pos.y + h, pos.z).project(cam);
      const ty = (-this._v.y * 0.5 + 0.5) * this._vh;
      const half = Math.max(h * 0.62, (m.bodyRadius ?? 1.2) * 1.4) * (fy - ty) / h;
      B[o] = fx - half; B[o + 1] = ty; B[o + 2] = fx + half; B[o + 3] = fy;
    }

    /* 1. where each plate wants to be, in painted pixels: bottom-centre on the head point.
       U-02: the most recently hit wears the full plate; the others a compact one */
    for (let i = 0; i < MHB_CAP; i++) {
      const slot = this._mhbSlots[i];
      const m = this._mhbPick[i];
      const compact = i > 0;
      if (slot.compact !== compact) {
        slot.compact = compact;
        slot.el.classList.toggle('compact', compact);
        slot.m = null; slot.h = 0;     // re-label at the new size
      }
      const halfW = (compact ? MHB_W_COMPACT : MHB_W) * 0.5 * ws;
      HW[i] = halfW;
      X[i] = NaN;
      if (!m) {
        if (slot.vis !== false) { slot.el.style.visibility = 'hidden'; slot.vis = false; slot.m = null; }
        continue;
      }
      const pos = m.position ?? m.root?.position;
      if (!pos) { slot.el.style.visibility = 'hidden'; slot.vis = false; continue; }
      const h = (m.height ?? 2.2);
      this._v.set(pos.x, pos.y + h + 1.05, pos.z).project(cam);
      if (this._v.z > 1) { // behind the camera
        if (slot.vis !== false) { slot.el.style.visibility = 'hidden'; slot.vis = false; }
        continue;
      }
      let x = (this._v.x * 0.5 + 0.5) * this._vw;
      let y = (-this._v.y * 0.5 + 0.5) * this._vh;
      // off the sides or the BOTTOM is out of frame; off the top is an Instrument standing over her
      if (x < -160 || x > this._vw + 160 || y > this._vh + 80) {
        if (slot.vis !== false) { slot.el.style.visibility = 'hidden'; slot.vis = false; }
        continue;
      }
      if (!slot.h) slot.h = slot.el.offsetHeight || MHB_PLATE_H;
      const plateH = slot.h * ws;
      const topFloor = MHB_TOP_BASE * sc + plateH;
      // bit 1: off its Instrument's axis or above the frame (the row's "clamped"); bit 2: stepped down its axis
      let moved = y < topFloor ? 1 : 0;
      if (moved) y = topFloor;
      // the fixed instruments keep their place: the column (the staff, the gourd, the note)...
      const colB = this._colFoot(sc);
      const colR = MHB_SAFE_L * sc;
      if (x - halfW < colR && y - plateH < colB) {
        const toRight = colR + halfW - x, toBelow = colB + plateH - y;
        if (toRight <= toBelow) { x += toRight; moved |= 1; } else { y += toBelow; moved |= 2; }
      }
      // ...and the circle with its vial
      if (Math.abs(x - this._vw * 0.5) < halfW + MHB_EYE_HALF * sc && y - plateH < MHB_EYE_BASE * sc) {
        y = MHB_EYE_BASE * sc + plateH;
        moved |= 2;
      }
      X[i] = x; Y[i] = y; C[i] = moved;
      any = true;
    }
    if (!any) return;

    /* 2. a plate never lies on another: the most recently hit holds its place, the others step
       up over it when there is sky above it, else down */
    const gap = MHB_GAP * sc;
    const topFloorK = MHB_TOP_BASE * sc;
    for (let i = 1; i < MHB_CAP; i++) {
      if (X[i] !== X[i]) continue;
      const hi = (this._mhbSlots[i].h || MHB_PLATE_H) * ws;
      for (let j = 0; j < i; j++) {
        if (X[j] !== X[j]) continue;
        const hj = (this._mhbSlots[j].h || MHB_PLATE_H) * ws;
        const overlapX = Math.abs(X[i] - X[j]) < HW[i] + HW[j] + gap;
        const overlapY = Y[i] > Y[j] - hj - gap && Y[i] - hi - gap < Y[j];
        if (overlapX && overlapY) {
          const up = Y[j] - hj - gap;
          if (up - hi >= topFloorK && this._plateFree(X[i], up, HW[i], hi)) Y[i] = up; else Y[i] = Y[j] + hi + gap;
          C[i] |= 2;
        }
      }
    }
    /* 2b. ...and never on an engaged Instrument: over its head when there is room, else to its nearer side */
    for (let i = 0; i < MHB_CAP; i++) {
      if (X[i] !== X[i]) continue;
      const hi = (this._mhbSlots[i].h || MHB_PLATE_H) * ws;
      for (let j = 0; j < MHB_CAP; j++) {
        const o = j * 4;
        if (B[o + 2] <= B[o]) continue;
        const l = X[i] - HW[i], r = X[i] + HW[i], t = Y[i] - hi, b = Y[i];
        if (r < B[o] || l > B[o + 2] || b < B[o + 1] || t > B[o + 3]) continue;
        const above = B[o + 1] - gap;
        const sideX = (X[i] < (B[o] + B[o + 2]) * 0.5) ? B[o] - HW[i] - gap : B[o + 2] + HW[i] + gap;
        if (above - hi >= topFloorK && this._plateFree(X[i], above, HW[i], hi)) C[i] |= 2, Y[i] = above;
        else if (this._plateFree(sideX, Y[i], HW[i], hi)) C[i] |= 1, X[i] = sideX;   // off its axis: "clamped"
        // else: the HUD's own instruments keep their place first
      }
    }
    /* 2c. last word: nothing above leaves a plate on the column or the circle */
    for (let i = 0; i < MHB_CAP; i++) {
      if (X[i] !== X[i]) continue;
      const hi = (this._mhbSlots[i].h || MHB_PLATE_H) * ws;
      const colB = this._colFoot(sc), colR = MHB_SAFE_L * sc;
      if (X[i] - HW[i] < colR && Y[i] - hi < colB) {
        const toRight = colR + HW[i] - X[i], toBelow = colB + hi - Y[i];
        if (toRight <= toBelow) { X[i] += toRight; C[i] |= 1; } else { Y[i] += toBelow; C[i] |= 2; }
      }
      if (Math.abs(X[i] - this._vw * 0.5) < HW[i] + MHB_EYE_HALF * sc && Y[i] - hi < MHB_EYE_BASE * sc) {
        Y[i] = MHB_EYE_BASE * sc + hi; C[i] |= 2;
      }
    }

    /* 3. paint */
    for (let i = 0; i < MHB_CAP; i++) {
      if (X[i] !== X[i]) continue;
      const slot = this._mhbSlots[i];
      const m = this._mhbPick[i];
      const clamped = (C[i] & 1) !== 0;
      if (clamped !== slot.clamped) slot.clamped = clamped;
      const nolead = C[i] !== 0;       // a plate that has left its anchor has no leader to draw
      if (nolead !== slot.nolead) {
        slot.nolead = nolead;
        slot.el.classList.toggle('clamped', nolead);
      }
      if (slot.vis !== true) { slot.el.style.visibility = 'visible'; slot.vis = true; }
      const qx = Math.round(X[i]), qy = Math.round(Y[i]);
      if (qx !== slot.qx) { slot.qx = qx; slot.wrap.style.transform = txString(qx); }
      if (qy !== slot.qy) { slot.qy = qy; slot.el.style.transform = plateY(qy, ws); }

      if (slot.m !== m) {
        slot.m = m;
        slot.w = -1; slot.ghostW = -1; slot.awareS = ''; slot.h = 0;
        slot.name.textContent = slot.compact ? cardParts(m).name : cardLine(m);
      }

      const frac = clamp01((m.health ?? 0) / (m.maxHealth || 1));
      const w = Math.round(frac * 100);
      if (w !== slot.w) { slot.w = w; slot.fill.style.transform = SCALE_X[w]; }

      const rec = this._engaged.get(m);
      let gw = slot.ghostW;
      if (gw < 0 || gw < w) gw = w;
      else if (gw > w) {
        if (rec && rec.ghostHold > 0) { /* hold */ }
        else gw = Math.max(w, gw - GHOST_DRAIN * dt);
      }
      const gq = Math.round(gw);
      if (gq !== slot.ghostW) { slot.ghostW = gq; slot.ghost.style.transform = SCALE_X[gq]; }

      const s = lampStateOf(m);
      if (s !== slot.awareS) { slot.awareS = s; slot.aware.dataset.s = s; }
      // the mark an Instrument with no plate wears for its attack flashes on the plate instead
      const atk = this._attackFlash.has(m);
      if (atk !== slot.atk) { slot.atk = atk; slot.el.classList.toggle('attack', atk); }
      this._renderElems(slot, m);
    }
  }

  /**
   * The top-left column's painted foot (the staff, the chips and the field note), measured at 2 Hz in
   * `_updateTracker`: the glass note grows with its objective's lines, so a fixed base let a plate
   * slide under a two-line note (V-hud-glass, W1 fix round 2). Never less than the old base.
   */
  _colFoot(sc) {
    const base = (this._trackEl.classList.contains('off') ? 90 : MHB_COL_B) * sc;
    return this._colFootPx > base ? this._colFootPx : base;
  }

  /** A plate (bottom-centre x, y; half width; height) clear of the column and of the circle with its vial. */
  _plateFree(x, y, hw, h) {
    const sc = this._scale;
    const colB = this._colFoot(sc), colR = MHB_SAFE_L * sc;
    if (x - hw < colR && y - h < colB) return false;
    if (Math.abs(x - this._vw * 0.5) < hw + MHB_EYE_HALF * sc && y - h < MHB_EYE_BASE * sc) return false;
    return x - hw > 0 && x + hw < this._vw && y - h >= MHB_TOP_BASE * sc;
  }

  _renderElems(slot, m) {
    const el = m.elemental;
    const trigRec = this._elemTrigs.get(m);
    for (let ei = 0; ei < ELEM_KEYS.length; ei++) {
      const k = ELEM_KEYS[ei];
      const raw = el ? el[k] : null;
      let val = typeof raw === 'number' ? raw : raw?.value ?? raw?.buildup ?? 0;
      if (val > 1.5) val /= 100; // 0..100 scale -> 0..1
      val = clamp01(val);
      let trig = !!(raw && typeof raw === 'object'
        ? (raw.triggered ?? raw.active) : val >= 0.999);
      const cd = trigRec ? trigRec[k] ?? 0 : 0;
      if (cd > 0) {
        val = clamp01(cd / ELEM_TRIG[k]); // draining countdown
        trig = true;
      }
      const e = slot.elemEls[k];
      const shown = val > 0.02 || trig;
      if (shown !== e.shown) { e.shown = shown; e.row.classList.toggle('show', shown); slot.h = 0; }
      if (!shown) continue;
      const pw = Math.round(val * 100);
      if (pw !== e.w) { e.w = pw; e.fill.style.transform = SCALE_X[pw]; }
      if (trig !== e.trig) { e.trig = trig; e.row.classList.toggle('triggered', trig); }
    }
  }

  /* ----------------- reticle: hairs, stadia, draw scale, breath -------------- */

  _updateReticle(p) {
    const aiming = !!p.aiming;
    if (aiming !== this._lastAim) {
      this._lastAim = aiming;
      this._drawEl.classList.toggle('show', aiming);
      this._brackets.classList.toggle('show', aiming);
      if (!aiming && this._lastBreathOn !== false) {
        this._lastBreathOn = false;
        this._concEl.classList.remove('show', 'active');
        this._lastBreathActive = false;
      }
    }
    if (!aiming) {
      if (this._lastNock !== -1) { this._lastNock = -1; this._nockEl.classList.remove('show'); }
      return;
    }

    const c = this.ctx.combat;
    const dsRaw = c?.drawStrength;
    const ds = typeof dsRaw === 'number' ? clamp01(dsRaw) : 0;
    const dq = Math.round(ds * 100);
    if (dq !== this._lastDraw) {
      this._lastDraw = dq;
      this._drawFill.style.clipPath = CLIP_R[dq];
      this._drawEl.classList.toggle('full', dq >= 99);
      // the stadia close on the centre as the draw tightens (a quarter-pixel at a time)
      const spread = Math.round((15 - 8 * ds) * 4) / 4;
      if (spread !== this._lastSpread) {
        this._lastSpread = spread;
        this._brackets.style.setProperty('--spread', spread + 'px');
      }
    }

    // re-nock: the arrow is still travelling from the quiver
    const landed = c?.nockLanded;
    const np = landed === false ? clamp01(c?.nockProgress ?? 0) : -1;
    const nq = np < 0 ? -1 : Math.round(np * 100);
    if (nq !== this._lastNock) {
      this._lastNock = nq;
      this._nockEl.classList.toggle('show', nq >= 0);
      if (nq >= 0) this._nockFill.style.transform = SCALE_X[nq];
    }

    // Steady: the breath meter. Shown while it is held or while the breath comes back.
    const steady = c?.steady;
    const gauge = clamp01(steady?.gauge ?? 1);
    const active = !!steady?.active;
    const show = gauge < 0.995 || active;
    if (show !== this._lastBreathOn) {
      this._lastBreathOn = show;
      this._concEl.classList.toggle('show', show);
    }
    if (active !== this._lastBreathActive) {
      this._lastBreathActive = active;
      this._concEl.classList.toggle('active', active);
    }
    const bq = Math.round(gauge * 100);
    if (bq !== this._lastBreath) {
      this._lastBreath = bq;
      this._concFill.style.transform = SCALE_X[bq];
    }
  }

  /* ------------------------------ the kit tag -------------------------------- */

  /** Silhouette, ammo ticks, a 3-digit count. Combat owns the data. */
  _updateWeapon() {
    const c = this.ctx.combat;
    const w = c?.activeWeapon;

    let ammo = c?.activeAmmo ?? w?.activeAmmo ?? c?.arrowType ?? 'reed';
    let ammoObj = null;
    if (ammo && typeof ammo === 'object') {
      ammoObj = ammo;
      ammo = ammo.id ?? ammo.name ?? 'reed';
    }
    if (typeof ammo === 'number') ammo = 'reed';
    if (!ammoObj && Array.isArray(w?.ammoTypes)) {
      ammoObj = w.ammoTypes.find((a) => a && typeof a === 'object' && (a.id === ammo || a.name === ammo)) ?? null;
    }

    let count = ammoObj?.count;
    if (count == null && typeof c?.ammoCount === 'function') count = c.ammoCount(ammo);
    if (count == null) {
      count = c?.ammo?.[ammo] ?? c?.counts?.[ammo] ?? c?.ammoCounts?.[ammo] ?? c?.arrowCounts?.[ammo];
    }
    this._ammoEmpty = typeof count === 'number' && count <= 0;

    const dots = Array.isArray(w?.mods) ? w.mods
      : Array.isArray(w?.ammoTypes) ? w.ammoTypes : null;
    // the dirty check is identity + numbers: nothing below runs until one of them moves
    if (w === this._lastW && ammo === this._lastAmmoId && count === this._lastCount
      && dots === this._lastDots && (dots?.length ?? 0) === this._lastDotN) return;
    this._lastW = w; this._lastAmmoId = ammo; this._lastCount = count;
    this._lastDots = dots; this._lastDotN = dots?.length ?? 0;

    const wid = String(w?.id ?? 'bow');
    const wName = fieldWord(String(w?.name ?? w?.displayName ?? 'Sabina Bow')).toUpperCase();
    const ammoName = fieldWord(String(
      (ammoObj && typeof ammoObj === 'object' ? ammoObj.name : null) ?? prettify(ammo),
    )).toUpperCase();
    const countText = count === Infinity || count == null ? '---' : String(count | 0).padStart(3, '0');

    if (this._lastWid !== wid) {
      this._lastWid = wid;
      this._wpnArt.innerHTML = kitArtFor(wid);
    }
    this._wpnName.textContent = wName;
    this._wpnAmmoName.textContent = ammoName;
    this._wpnCount.textContent = countText;
    this._wpnCount.classList.toggle('empty', this._ammoEmpty);

    let html = '';
    for (const d of dots ?? []) {
      const id = typeof d === 'string' ? d : d?.id ?? '';
      html += `<i class="${id === ammo ? 'on' : ''}"></i>`;
    }
    this._wpnDots.innerHTML = html;
  }

  /* ------------------------------ tool chips --------------------------------- */

  /** `ctx.items.tools` owns the data and the behaviour (the Kit Rack's slots land at combat-kit W2). */
  _updateTools() {
    const tools = this.ctx.items?.tools;
    if (!tools || !Array.isArray(tools.slots) || tools.slots.length === 0) {
      if (this._lastToolSig !== 'off') {
        this._lastToolSig = 'off';
        this._toolsEl.classList.remove('show');
        this._toolsReady = false;
      }
      return;
    }
    this._toolsReady = true;
    const idx = tools.index | 0;
    const cd = Math.round(clamp01(tools.cooldown ?? 0) * 20);
    // a rolling number, not a string: this samples at 10 Hz for the whole session
    let sig = idx * 31 + cd;
    for (let i = 0; i < tools.slots.length; i++) {
      const q = tools.slots[i];
      sig = (Math.imul(sig, 33) + (q.count | 0) * 4 + (q.ready ? 2 : 0) + (q.blocked ? 1 : 0)) | 0;
    }
    if (sig === this._lastToolSig) return;
    this._lastToolSig = sig;
    this._toolsEl.classList.add('show');

    while (this._toolSlots.length < tools.slots.length) {
      const el = div('cal-tool cal-glass', this._toolRow);
      const ic = div('cal-tool-ic', el);
      const n = div('cal-tool-n', el);
      const key = document.createElement('kbd');
      key.className = 'cal-tool-key';
      el.appendChild(key);
      const sweep = div('cal-tool-cd', el);
      this._toolSlots.push({ el, ic, n, key, sweep, sig: '' });
    }
    for (let i = 0; i < this._toolSlots.length; i++) {
      const t = this._toolSlots[i];
      const s = tools.slots[i];
      if (!s) { t.el.style.display = 'none'; continue; }
      t.el.style.display = '';
      const active = i === idx;
      if (t.sig !== s.id) { t.sig = s.id; t.ic.innerHTML = itemIcon(s.id); }
      t.n.textContent = s.count == null ? '' : String(s.count);
      t.el.classList.toggle('active', active);
      t.el.classList.toggle('empty', !s.count);
      t.el.classList.toggle('blocked', !!s.blocked);
      t.el.title = fieldWord(s.name ?? '');
      if (active) {
        t.key.textContent = keyGlyph(tools.useKey);
        t.key.style.display = '';
        t.sweep.style.transform = SCALE_Y[Math.round(clamp01(tools.cooldown ?? 0) * 100)];
      } else {
        t.key.style.display = 'none';
        t.sweep.style.transform = SCALE_Y[0];
      }
    }
    const ck = Array.isArray(tools.cycleKeys) ? tools.cycleKeys : ['BracketLeft', 'BracketRight'];
    this._toolPrev.querySelector('kbd').textContent = keyGlyph(ck[0]);
    this._toolNext.querySelector('kbd').textContent = keyGlyph(ck[1]);
  }

  /* ------------------------------ craft hold --------------------------------- */

  /** The hold-R state machine lives in `combat.craft`; this draws its fill and says why it is blocked. */
  _updateCraft() {
    const c = this.ctx.combat?.craft;
    if (!c) {
      if (this._lastCraftOn !== null) { this._lastCraftOn = null; this._craftEl.style.display = 'none'; }
      return;
    }
    const on = !!c.holding;
    if (on !== this._lastCraftOn) {
      this._lastCraftOn = on;
      this._craftEl.style.display = '';
      this._craftEl.classList.toggle('on', on);
    }
    const prog = Math.round(clamp01(c.progress ?? 0) * 100);
    if (prog !== this._lastCraftFill) {
      this._lastCraftFill = prog;
      this._craftFill.style.transform = SCALE_X[prog];
    }
    const blocked = on && c.blocker ? fieldWord(String(c.blocker)).toUpperCase() : 'MAKE';
    if (blocked !== this._lastCraftLabel) {
      this._lastCraftLabel = blocked;
      this._craftLabel.textContent = blocked;
      this._craftEl.classList.toggle('deny', c.ok === false);
    }
  }

  /* --------------------------- interaction prompt ---------------------------- */

  /** The prompt is projected AT the interactable (`A71f-interact-anchor`). */
  _updateInteract() {
    const cur = this.ctx.interactables?.current;
    if (!cur) {
      if (this._lastIntOn !== false) {
        this._lastIntOn = false;
        this._intEl.classList.remove('show');
      }
      return;
    }
    const ent = cur.entry ?? cur;
    const pos = ent.position ?? ent.point ?? ent.object?.position ?? ent.mesh?.position;
    let placed = false;
    if (pos && Number.isFinite(pos.x)) {
      this._v.set(pos.x, (pos.y ?? 0) + (ent.promptHeight ?? PROMPT_H), pos.z).project(this.ctx.camera);
      if (this._v.z <= 1) {
        const x = (this._v.x * 0.5 + 0.5) * this._vw;
        const y = (-this._v.y * 0.5 + 0.5) * this._vh;
        if (x > -60 && x < this._vw + 60 && y > -40 && y < this._vh + 40) {
          this._placeInteract(x, y);
          placed = true;
        }
      }
    }
    if (!placed) {
      this._placeInteract(this._vw * 0.5, this._vh * 0.66);
    }
    if (this._lastIntOn !== true) {
      this._lastIntOn = true;
      this._intEl.classList.add('show');
    }
    const raw = cur.label ?? 'INTERACT';
    if (raw !== this._lastIntLabel) {
      this._lastIntLabel = raw;
      this._intLabel.textContent = fieldWord(String(raw)).toUpperCase();
    }
    const prog = Math.round(clamp01(cur.holdProgress ?? cur.progress ?? 0) * 100);
    if (prog !== this._lastIntHold) {
      this._lastIntHold = prog;
      this._intHold.style.transform = SCALE_X[prog];
    }
  }

  _placeInteract(x, y) {
    const qx = Math.round(x), qy = Math.round(y);
    if (qx !== this._intQx) { this._intQx = qx; this._intWrap.style.transform = txString(qx); }
    if (qy !== this._intQy) { this._intQy = qy; this._intEl.style.transform = centreY(qy, this._wscale); }
  }

  /* ---------------------- the objective's broad arrow ------------------------ */

  /** Over the tracked objective, with its distance in metres, edge-clamped when off screen. */
  _updateObjectiveMark(p) {
    let mk = null;
    const marks = this._marks;
    if (Array.isArray(marks)) {
      for (let i = 0; i < marks.length; i++) if (marks[i].tracked) { mk = marks[i]; break; }
      if (!mk && marks.length) mk = marks[0];
    }
    let wx, wy, wz, label;
    if (mk) {
      wx = mk.x; wy = (mk.y ?? 0) + 2.2; wz = mk.z; label = mk.label ?? '';
    } else if (this._questTarget) {
      const q = this._questTarget.position ?? this._questTarget.root?.position;
      if (!q) { this._objDiamond.classList.remove('show'); this._lastObjOn = false; return; }
      wx = q.x; wy = q.y + (this._questTarget.height ?? 2.2) + 1.8; wz = q.z;
      label = this._questTarget.displayName ?? this._questTarget.kind ?? '';
    } else {
      if (this._lastObjOn) {
        this._lastObjOn = false;
        this._objDiamond.classList.remove('show');
      }
      return;
    }

    const dist = len2(wx - p.position.x, wz - p.position.z);
    this._v.set(wx, wy, wz).project(this.ctx.camera);
    const behind = this._v.z > 1;
    let x = (this._v.x * 0.5 + 0.5) * this._vw;
    let y = (-this._v.y * 0.5 + 0.5) * this._vh;
    if (behind) { x = this._vw - x; y = this._vh - y; }
    /** The clamp ring is asymmetric: the HUD owns the top and bottom of the screen. */
    const mgnX = 58, mgnT = 120 * this._scale, mgnB = 124 * this._scale;
    const off = behind || x < mgnX || x > this._vw - mgnX || y < mgnT || y > this._vh - mgnB;
    if (off) {
      const cx = this._vw / 2;
      const cy = (mgnT + (this._vh - mgnB)) / 2;
      const halfY = (this._vh - mgnB - mgnT) / 2;
      const dx = x - cx;
      const dy = behind ? Math.abs(y - cy) + halfY * 0.35 : y - cy;
      const k = Math.min(
        (cx - mgnX) / Math.max(1e-4, Math.abs(dx)),
        halfY / Math.max(1e-4, Math.abs(dy)),
      );
      x = cx + dx * k;
      y = cy + dy * k;
    }
    if (!this._lastObjOn) { this._lastObjOn = true; this._objDiamond.classList.add('show'); }
    if (off !== this._lastObjOff) { this._lastObjOff = off; this._objDiamond.classList.toggle('edge', off); }
    const qx = Math.round(x), qy = Math.round(y);
    if (qx !== this._objQx) { this._objQx = qx; this._objWrap.style.transform = txString(qx); }
    if (qy !== this._objQy) { this._objQy = qy; this._objDiamond.style.transform = centreY(qy, this._wscale); }
    const di = Math.round(dist);
    if (di !== this._lastObjDist) { this._lastObjDist = di; this._objDiamondDist.textContent = di + ' m'; }
    // a staged look film (`stageNote`) names no tracked quest's own mark
    if (this._staged) label = '';
    if (label !== this._lastObjLabel) {
      this._lastObjLabel = label;
      this._objDiamondLabel.textContent = fieldWord(String(label)).toUpperCase();
    }
  }

  /* ------------------------------- vignette --------------------------------- */

  _updateVignette(dt, t, p) {
    this._hurtFlash = Math.max(0, this._hurtFlash - dt * 0.9);
    const hp = p.health / p.maxHealth;
    const low = hp < 0.35 ? (0.35 - hp) / 0.35 : 0;
    const pulse = low > 0 ? low * (0.38 + 0.1 * Math.sin(t * 4.2)) : 0;
    const o = Math.min(0.92, this._hurtFlash * 0.8 + pulse);
    if (Math.abs(o - this._lastVin) > 0.008) {
      this._lastVin = o;
      this._vignette.style.opacity = o.toFixed(3);
    }
  }

  /* ------------------------------ tutorial cards ----------------------------- */

  _loadTips() {
    try {
      const raw = localStorage.getItem(TIP_STORE);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  }

  _saveTips() {
    try { localStorage.setItem(TIP_STORE, JSON.stringify([...this._tipSeen])); }
    catch { /* private mode */ }
  }

  _queueTip(tip) {
    if (!tip || this._tipSeen.has(tip.id)) return false;
    this._tipSeen.add(tip.id);
    this._saveTips();
    this._tipQueue.push(tip);
    return true;
  }

  /**
   * A one-shot card per mechanic, raised when the mechanic is reachable (bible
   * §8.9). Cards never stack: one shows for 6.5 s, the next follows 0.8 s later.
   */
  _updateTips(dt) {
    if (this.ctx.state !== 'playing') return;
    for (const tip of TUTORIAL_CARDS) {
      if (!tip.when || this._tipSeen.has(tip.id)) continue;
      let ok = false;
      try { ok = !!tip.when(this); } catch { ok = false; }
      if (ok) this._queueTip(tip);
    }
    if (this._tipT > 0) {
      this._tipT -= dt;
      if (this._tipT <= 0) this._dismissTip();
      return;
    }
    if (this._tipGap > 0) { this._tipGap -= dt; return; }
    const tip = this._tipQueue.shift();
    if (!tip) return;
    this._tipCur = tip.id;
    this._tipTitle.textContent = tip.title;
    this._tipBody.textContent = tip.body;
    this._tipKeys.innerHTML = tip.keys.map((k) => `<kbd>${k}</kbd>`).join('');
    this._tipEl.classList.add('show');
    this._tipT = 6.5;
    this._tipGap = 0.8;
    this._emitUi('ui-nav');
  }

  /** The card goes: one at a time, auto-dismissed (U-02: <= 1 card, <= 8 s). */
  _dismissTip() {
    this._tipT = 0;
    this._tipCur = null;
    this._tipEl.classList.remove('show');
  }

  /* -------------------------------- audits ----------------------------------- */

  /** Everything `V37-hud-language` / `A71c-hud-surfaces` grade, as numbers. */
  _surfaceAudit() {
    /** EFFECTIVE opacity: the product up the ancestor chain to <body>. */
    const eff = (el) => {
      let a = 1;
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
        a *= parseFloat(cs.opacity) || 0;
        if (a <= 0) return 0;
      }
      return a;
    };
    const vis = (el) => {
      if (!el || eff(el) < 0.04) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && r.right > 0 && r.bottom > 0
        && r.left < this._vw && r.top < this._vh;
    };
    /** painted box as [l, t, r, b]: integers, viewport pixels. */
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
    };
    const bars = this._mhbSlots.filter((s) => s.vis && vis(s.el));
    const dmgLive = this._dmgPool.filter((d) => d.active);
    const svg = this._healthFill.querySelector('svg');
    const cells = svg ? [...svg.querySelectorAll(':scope > rect.v')] : [];
    const allRects = svg ? [...svg.querySelectorAll(':scope > rect')] : [];
    return {
      health: {
        visible: vis(this._vitalsEl),
        pct: this._lastHp,
        numerals: this._healthNum.textContent.trim(),
        graduations: cells.length,
        graduationColors: [...new Set(allRects.map((c) => getComputedStyle(c).fill))],
        gaps: allRects.length - cells.length,
        widthPx: Math.round(this._staffEl.getBoundingClientRect().width),
        heightPx: +this._staffEl.getBoundingClientRect().height.toFixed(1),
        widthPct: +(this._healthFill.getBoundingClientRect().width
          / Math.max(1, this._staffEl.getBoundingClientRect().width) * 100).toFixed(1),
        clip: this._healthFill.style.clipPath,
        // the painted right edge of the reading, measured
        indexLeftPct: parseFloat(this._staffIndex.style.left) || 0,
        rect: rect(this._staffEl),
      },
      gourd: { visible: vis(this._gourdChip), pct: this._lastGourd, num: this._gourdNum.textContent,
        line: vis(this._gourdFill), rect: rect(this._gourdChip) },
      tracker: {
        visible: vis(this._trackEl),
        opacity: +eff(this._trackEl).toFixed(3),
        idle: !!this._trackIdle,
        rect: rect(this._trackEl),
        title: this._trackTitle.textContent,
        text: this._trackObj.textContent,
      },
      /**
       * Is the prompt actually ON the interactable? Projected here from the
       * published record's `.entry`, independently of what `_updateInteract`
       * believed, and compared against the painted rect.
       */
      interact: (() => {
        const cur = this.ctx.interactables?.current;
        const el = this._intEl;
        const shown = !!el && el.classList.contains('show') && vis(el);
        const out = { current: !!cur, visible: shown, label: this._intLabel.textContent,
          anchored: null, offsetPx: null, world: null, painted: null };
        const ent = cur ? (cur.entry ?? cur) : null;
        const pos = ent
          ? (ent.position ?? ent.point ?? ent.object?.position ?? ent.mesh?.position) : null;
        if (!pos || !Number.isFinite(pos.x)) return out;
        this._v.set(pos.x, (pos.y ?? 0) + (ent.promptHeight ?? PROMPT_H), pos.z)
          .project(this.ctx.camera);
        if (this._v.z > 1) return out;
        const sx = (this._v.x * 0.5 + 0.5) * this._vw;
        const sy = (-this._v.y * 0.5 + 0.5) * this._vh;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width * 0.5, cy = r.top + r.height * 0.5;
        out.world = [Math.round(sx), Math.round(sy)];
        out.painted = [Math.round(cx), Math.round(cy)];
        out.offsetPx = +len2(cx - sx, cy - sy).toFixed(1);
        out.anchored = shown && out.offsetPx < 24;
        return out;
      })(),
      compass: this._compassAudit(),
      eye: { visible: vis(this._eyeEl), mode: this._eyeEl.dataset.m ?? null,
        idle: this._eyeEl.classList.contains('idle'), idleS: +(this._vialIdleT ?? 0).toFixed(1),
        rect: rect(this._eyeEl), label: this._eyeLabel.textContent },
      /** Painted centre against an anchor re-projected from the Instrument itself. */
      machineBars: (() => {
        const cam = this.ctx.camera;
        const rows = bars.map((b) => {
          const r = b.plate.getBoundingClientRect();
          const row = {
            name: b.name.textContent, clamped: !!b.clamped,
            rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
            topPx: Math.round(r.top), bottomPx: Math.round(r.bottom),
            widthPx: Math.round(r.width),
            centerX: Math.round(r.left + r.width * 0.5),
            anchorX: null, dx: null,
          };
          const mm = b.m;
          const pp = mm ? (mm.position ?? mm.root?.position) : null;
          if (pp && cam) {
            this._v2.set(pp.x, pp.y + (mm.height ?? 2.2) + 1.05, pp.z).project(cam);
            if (this._v2.z <= 1) {
              row.anchorX = Math.round((this._v2.x * 0.5 + 0.5) * this._vw);
              row.dx = row.centerX - row.anchorX;
            }
          }
          return row;
        });
        const free = rows.filter((r) => !r.clamped && r.dx != null);
        return {
          visible: bars.length, cap: MHB_CAP, engaged: this._engaged.size, baseWidth: MHB_W,
          column: rect(this._topleftEl),
          rects: rows.map((r) => r.rect),
          names: rows.map((r) => r.name),
          clamped: rows.filter((r) => r.clamped).length,
          topPx: rows.map((r) => r.topPx),
          widthPx: rows.map((r) => r.widthPx),
          maxOffAxisPx: free.length ? Math.max(...free.map((r) => Math.abs(r.dx))) : null,
          bars: rows,
        };
      })(),
      tools: { visible: vis(this._toolsEl), slots: this._toolSlots.filter((t) => t.el.style.display !== 'none').length,
        index: this.ctx.items?.tools?.index ?? -1, useKey: keyGlyph(this.ctx.items?.tools?.useKey) },
      weapon: { visible: vis(this._wpnEl), name: this._wpnName.textContent, ammo: this._wpnAmmoName.textContent,
        count: this._wpnCount.textContent,
        dots: this._wpnDots.childElementCount, art: this._wpnArt.querySelector('svg') != null },
      reticle: (() => {
        // the arm is a hairline: 1 px tall on purpose, so its width is what says it is painted
        const brkOn = parseFloat(getComputedStyle(this._brackets).opacity) > 0.04
          && this._brkArm.getBoundingClientRect().width > 1;
        return {
          visible: vis(this._dotEl) || brkOn,
          dot: vis(this._dotEl),
          aiming: !!this.ctx.player?.aiming,
          brackets: brkOn,
          drawScale: vis(this._drawEl),
        };
      })(),
      /** The breath meter (`A71d-steady-breath-meter`): painted fill against its rule. */
      breath: (() => {
        const rule = this._concEl.querySelector('.cal-breath-rule');
        const rr = rule.getBoundingClientRect();
        const fr = this._concFill.getBoundingClientRect();
        return {
          visible: vis(this._concEl),
          active: this._concEl.classList.contains('active'),
          ruleW: +rr.width.toFixed(1), fillW: +fr.width.toFixed(1),
          fillFrac: rr.width > 0 ? +(fr.width / rr.width).toFixed(3) : 0,
          belowReticlePx: Math.round(rr.top - this._vh * 0.5),
          heightPx: +rr.height.toFixed(1),
        };
      })(),
      damageNumbers: {
        live: dmgLive.length,
        px: dmgLive.map((d) => Math.round(parseFloat(getComputedStyle(d.el).fontSize) || 0)),
        weakPx: dmgLive.filter((d) => d.el.classList.contains('weak'))
          .map((d) => Math.round(parseFloat(getComputedStyle(d.el).fontSize) || 0)),
        family: dmgLive[0] ? getComputedStyle(dmgLive[0].el).fontFamily : null,
      },
      banners: this._bannerEl.childElementCount,
      flashes: this._xpPops.childElementCount,
      tip: { visible: vis(this._tipEl), title: this._tipTitle.textContent, body: this._tipBody.textContent },
      killFeed: document.querySelectorAll('.cal-toast').length,
      scale: this._scaleAudit(),
    };
  }
}
