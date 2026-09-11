import * as THREE from 'three';
import './hud.css';
import { LOOT_POPUP } from './inventory.js';

/**
 * ===========================================================================
 * SHELL-HUD — the presentation layer (Round 4, lane `shell-hud`, port 5214)
 * ===========================================================================
 * Owns `src/ui/hud.js`, `src/ui/hud.css`, `index.html`. Reads other lanes'
 * published surfaces and NEVER writes to them:
 *
 *   ctx.progression   level/xp/skillPoints, quests.*, getMarkers(), events
 *                     `banner` / `xp-gained` / `level-up` / `quest-*`
 *   ctx.items.tools   slots[], index, cooldown, useKey, cycleKeys  (ui-11)
 *   ctx.combat        activeWeapon, activeAmmo, ammo, drawStrength,
 *                     nockProgress, weaponDrawn, concentration, craft
 *   ctx.machines      list[], m.state/suspicion/detectFill/elemental
 *   ctx.focus         tags (Set<Machine>), scanTarget
 *   ctx.player        health/maxHealth, pouch/maxPouch, crouching, inTallGrass
 *
 * Round 4 findings closed here (docs/ROUND4-AUDIT.md §2):
 *   ui-04 compass truth      · ui-05 quest tracker + banners
 *   ui-06 projected machine bars (cap 3) · ui-07 red 4-segment health + pouch
 *   ui-08 weapon silhouettes + dots + bracket reticle
 *   ui-11 tools strip        · ui-12 stealth eye     · ui-15 --hud-scale
 *   ui-16 projected prompt   · ui-17 tutorial cards  · ui-19 Conc veil, no kill feed
 *   progression-012 +XP pops · camera-feel-13 (HUD side: hudScale setting)
 *   stealth-awareness-indicator-fidelity · onboarding-loop-objective-guidance
 *   /-stealth-feedback /-crafting-feedback /-healing-readability
 *   combat-concentration-presentation · combat-hit-feedback-faint (numbers)
 *
 * Gates: `A71-compass-truth`, `A71b-hud-scale-floor`, `A71c-hud-surfaces`,
 * `V37-hud-language` (tools/gates.round4.shell-hud.mjs) plus the Round-3
 * `A1` / `A9` / `A10` / `V10-hud-language` which must keep passing.
 *
 * Debug probe: `window.__HUD_DEBUG__` (lootSurfaces / compass / surfaces /
 * scale / tips). Gates read it; nothing in the game does.
 */

const RAD2DEG = 180 / Math.PI;

/** Legacy kill chain — only the victory trigger survives (progression owns quests). */
const QUEST = [
  { kind: 'watcher', need: 4, title: 'THIN THE HERD', detail: 'Destroy the Watchers prowling the meadow' },
  { kind: 'sawtooth', need: 2, title: 'FANGS OF THE VALLEY', detail: 'Bring down both Sawtooths' },
  { kind: 'behemoth', need: 1, title: 'THE BULL', detail: 'Topple the Behemoth in the hills' },
  { kind: 'thunderjaw', need: 1, title: 'SHADOW OF THE APEX', detail: 'Slay the Thunderjaw' },
];

const LEVELS = { watcher: 5, sawtooth: 15, behemoth: 25, thunderjaw: 27 };

// canon status durations (research: triggered buildup becomes a countdown ring)
const ELEM_TRIG = { fire: 8, shock: 3, freeze: 8 };
const DEATH_OVERLAY_DELAY = 1400; // ms — let the crumple play before the card
const COMBAT_IDLE_S = 4;          // dynamic HUD: weapon widget hides after this
const VITALS_IDLE_S = 4;          // dynamic HUD: full health bar hides after this
const TRACK_IDLE_S = 26;          // dynamic HUD: quest tracker recedes after this
const GHOST_HOLD_S = 0.45;        // damage-delta ghost lingers before draining
const GHOST_DRAIN = 55;           // ghost drain rate, % of bar per second
// toast suppression window after the take-all popup claimed a loot event (ms)
const LOOT_CLAIM_MS = 400;

/** ui-06: never more than three projected machine bars on screen at once. */
const MHB_CAP = 3;
const MHB_HOLD_S = 5;             // seconds a bar survives after its last hit
const MHB_RANGE = 120;            // metres past which a bar is not worth drawing

/** stealth-awareness-indicator-fidelity: show from a whisper of suspicion. */
const AWARE_MIN_SUSPICION = 0.04;
const AWARE_EDGE_MARGIN = 44;

/**
 * ui-15 — HUD scale. `--hud-scale` is a unitless multiplier applied to every
 * size in hud.css; the 11 px floor is enforced *in CSS* with `max(11px, …)` so
 * a small viewport (or a user who dialled the slider down) can never produce
 * unreadable type. The clamp lives here because CSS cannot divide a length by
 * a length, so a pure-CSS `clamp()` on a viewport RATIO is not expressible.
 */
const HUD_SCALE_MIN = 0.85;
const HUD_SCALE_MAX = 1.9;
const HUD_REF_W = 1600;
const HUD_REF_H = 900;

const TIP_STORE = 'hzc.hud.tips.v4';

/* ------------------------------ glyph library ------------------------------ */
/* Flat "tribal glyph" icons per docs/research/ui.md — inline SVG, currentColor. */

const P = (d, extra = '') => `<path d="${d}" ${extra}/>`;
const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"';

const GLYPHS = {
  arrow: P('M12 1 L16 8 H13.4 V16 H10.6 V8 H8 Z') + P('M9.2 17.5 H14.8 L12 22.5 Z'),
  hardpoint: P('M12 1 L17.4 9 H14 V14.6 H10 V9 H6.6 Z') + P('M8.4 16.8 H15.6 L12 23 Z'),
  precision: P('M12 0.5 L15 6.2 H13.1 V17.6 H10.9 V6.2 H9 Z') + P('M9.6 19 H14.4 L12 23.5 Z'),
  fire: P('M12 2 C14.2 6 17 8.4 17 13 A5 5 0 0 1 7 13 C7 9.8 9.2 8.6 9.8 6 C10.9 7.6 11.6 9 12 10.6 C12.9 8.2 11.4 5.2 12 2 Z'),
  shock: P('M13.2 2 L5 13.4 H10 L8.2 22 L19 9.2 H12.6 Z'),
  freeze: P('M12 2 V22 M3.3 7 L20.7 17 M20.7 7 L3.3 17 M12 2 L9.5 4.5 M12 2 L14.5 4.5 M12 22 L9.5 19.5 M12 22 L14.5 19.5', STROKE),
  tearblast: P('M12 2 L13.7 8.6 L19.6 5.4 L15.4 10.6 L22 12 L15.4 13.4 L19.6 18.6 L13.7 15.4 L12 22 L10.3 15.4 L4.4 18.6 L8.6 13.4 L2 12 L8.6 10.6 L4.4 5.4 L10.3 8.6 Z'),
  blast: '<circle cx="11" cy="14.5" r="7"/>' + P('M11 7.5 V5 C11 3 13 2.2 14.6 3.4 M17.5 2 L19 4.2 M20.5 6 L18 6.4', STROKE),
  disc: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="12" cy="12" r="3.2"/>',
  shard: P('M12 2 L19 12 L12 22 L5 12 Z'),
  wood: P('M5 20 L17 5 M9 21 L19 9 M13.4 9.4 L16 12', STROKE),
  droplet: P('M12 2 C15 8 19 11 19 15 A7 7 0 0 1 5 15 C5 11 9 8 12 2 Z'),
  leaf: P('M12 22 C4.5 16 5 6 20 3 C20.5 14 16 20 12 22 Z') + P('M12 21 C12.6 15 14 9.5 17.6 5.8', 'fill="none" stroke="rgba(10,14,12,0.6)" stroke-width="1.4"'),
  shell: '<circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="1.5"/>',
  wire: P('M3 12 C3 8 8 8 8 12 C8 16 12 16 12 12 C12 8 16 8 16 12 C16 16 21 16 21 12', STROKE),
  lens: '<circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.4"/>',
  core: P('M12 3 L19 7.5 V16.5 L12 21 L5 16.5 V7.5 Z') + '<circle cx="12" cy="12" r="2.6" fill="rgba(10,14,12,0.6)"/>',
  rock: P('M4 15.5 L8.4 5.8 L16.6 4.6 L21 12.4 L16 20 L7 19.4 Z') + P('M8.4 5.8 L11.6 12.6 L21 12.4 M11.6 12.6 L7 19.4', 'fill="none" stroke="rgba(10,14,12,0.55)" stroke-width="1.3"'),
  flask: P('M9.4 2 H14.6 V8 L19.4 17.6 A2.6 2.6 0 0 1 17 21.6 H7 A2.6 2.6 0 0 1 4.6 17.6 L9.4 8 Z') + P('M7.1 13.6 H16.9', 'fill="none" stroke="rgba(10,14,12,0.5)" stroke-width="1.6"'),
  trap: P('M3 17 H21 M6 17 L6 12 M18 17 V12 M6 12 L12 8 L18 12', STROKE) + P('M9.6 17 L12 12.6 L14.4 17 Z'),
};

/** Weapon silhouettes (ui-08) — flat tribal-glyph shapes, 40×64 viewBox. */
const WEAPON_ART = {
  'hunter-bow':
    P('M20 3 C31 13 33.5 27 33.5 32 C33.5 37 31 51 20 61', 'fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"')
    + P('M20 3 L20 61', 'fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.85"')
    + P('M28.6 27.4 H34.4 V36.6 H28.6 Z'),
  'sharpshot-bow':
    P('M20 1 C33 12 35.5 27 35.5 32 C35.5 37 33 52 20 63', 'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"')
    + P('M20 1 L20 63', 'fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.85"')
    + P('M30 28 H36 V36 H30 Z')
    + '<circle cx="26" cy="32" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  'war-bow':
    P('M20 5 C33 14 35 27 35 32 C35 37 33 50 20 59', 'fill="none" stroke="currentColor" stroke-width="4.4" stroke-linecap="round"')
    + P('M20 5 L20 59', 'fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.85"')
    + P('M24.4 14 C30 20 31 27 31 32 C31 37 30 44 24.4 50', 'fill="none" stroke="currentColor" stroke-width="1.7" opacity="0.75"')
    + P('M29.4 27 H35.6 V37 H29.4 Z'),
  'blast-sling':
    P('M11 6 L20 30 L29 6', 'fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"')
    + P('M20 30 L13 45 M20 30 L27 45', 'fill="none" stroke="currentColor" stroke-width="1.6"')
    + '<circle cx="20" cy="51" r="7.2"/>',
  'ropecaster':
    P('M6 22 H34 V30 H6 Z')
    + P('M8 26 L2 42 M32 26 L38 42', 'fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"')
    + P('M14 30 H26 V44 H14 Z', 'opacity="0.8"')
    + P('M2 42 C12 50 28 50 38 42', 'fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.75"'),
  'tripcaster':
    P('M8 20 H32 V34 H8 Z')
    + P('M12 20 V10 M28 20 V10', 'fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"')
    + P('M12 10 L28 10', 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3"')
    + P('M16 34 H24 V48 H16 Z'),
  'disc-launcher':
    '<circle cx="20" cy="24" r="11" fill="none" stroke="currentColor" stroke-width="3.4"/>'
    + '<circle cx="20" cy="24" r="3.4"/>'
    + P('M15 34 H25 V52 H15 Z'),
};

function svgIcon(glyph, color) {
  const body = GLYPHS[glyph] ?? GLYPHS.shard;
  return `<svg viewBox="0 0 24 24" style="color:${color}" fill="currentColor" ` +
    `xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

function weaponArt(id) {
  const body = WEAPON_ART[id] ?? WEAPON_ART['hunter-bow'];
  return `<svg viewBox="0 0 40 64" fill="currentColor" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

/* ammo id -> glyph + color + display name (v2 roster + round-1 fallbacks) */
function ammoLook(id) {
  const s = String(id ?? 'hunter').toLowerCase();
  if (s.includes('hardpoint')) return { glyph: 'hardpoint', color: '#efe6d5', name: 'Hardpoint Arrow' };
  if (s.includes('precision')) return { glyph: 'precision', color: '#ffd34d', name: 'Precision Arrow' };
  if (s.includes('tear')) return { glyph: 'tearblast', color: '#9adfe8', name: 'Tearblast Arrow' };
  if (s.includes('fire')) return { glyph: 'fire', color: '#f0a03c', name: 'Fire Arrow' };
  if (s.includes('shock')) return { glyph: 'shock', color: '#4fa3e3', name: 'Shock Arrow' };
  if (s.includes('freeze') || s.includes('chill')) return { glyph: 'freeze', color: '#59c1c6', name: 'Freeze Arrow' };
  if (s.includes('blast') || s.includes('bomb')) return { glyph: 'blast', color: '#e8762c', name: 'Blast Bomb' };
  if (s.includes('rope')) return { glyph: 'wire', color: '#c9a86a', name: 'Rope' };
  if (s.includes('trip') || s.includes('wire')) return { glyph: 'wire', color: '#e8762c', name: 'Trip Wire' };
  if (s.includes('disc')) return { glyph: 'disc', color: '#c8a24b', name: 'Disc' };
  return { glyph: 'arrow', color: '#efe6d5', name: 'Hunter Arrow' };
}

/* item id -> glyph + color + display name (items builder catalog wins if present) */
const ITEMS = {
  'metal-shards': { glyph: 'shard', color: '#c9d4d8', name: 'Metal Shards' },
  'ridge-wood': { glyph: 'wood', color: '#b08a5a', name: 'Ridge-Wood' },
  'blaze': { glyph: 'fire', color: '#f0a03c', name: 'Blaze' },
  'chillwater': { glyph: 'droplet', color: '#59c1c6', name: 'Chillwater' },
  'sparker': { glyph: 'shock', color: '#4fa3e3', name: 'Sparker' },
  'echo-shell': { glyph: 'shell', color: '#8f7be8', name: 'Echo Shell' },
  'wire': { glyph: 'wire', color: '#9aa4a8', name: 'Wire' },
  'watcher-lens': { glyph: 'lens', color: '#4ec9b0', name: 'Watcher Lens' },
  'machine-heart': { glyph: 'core', color: '#3d7bd9', name: 'Machine Heart' },
  'machine-core': { glyph: 'core', color: '#3d7bd9', name: 'Machine Core' },
  'medicinal-herb': { glyph: 'leaf', color: '#7fb069', name: 'Medicinal Herb' },
  'blastpaste': { glyph: 'blast', color: '#e8762c', name: 'Blastpaste' },
  'rock': { glyph: 'rock', color: '#b9bfc4', name: 'Rock' },
  'potion-vigor': { glyph: 'flask', color: '#7fb069', name: 'Vigour Draught' },
  'trap-shock': { glyph: 'trap', color: '#4fa3e3', name: 'Shock Wire Trap' },
};

function prettify(id) {
  return String(id).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** `KeyF` / `BracketLeft` / `Digit1` → the glyph a player reads on a key cap. */
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

/**
 * ui-17 / onboarding-loop-no-tutorial-hunt — the one-shot contextual card
 * queue. Each entry fires at most once per save (persisted in localStorage),
 * when `when(hud)` first returns true. `keys` render as <kbd> glyphs.
 */
const TIPS = [
  { id: 'move', keys: ['W', 'A', 'S', 'D', 'SHIFT'], title: 'MOVE', body: 'WASD walks. Hold SHIFT to sprint.',
    when: (h) => h._t > 2.5 },
  { id: 'focus', keys: ['V', 'T'], title: 'THE FOCUS', body: 'Tap V to scan. Look at a machine and press T to tag it — tagged machines show on the compass.',
    when: (h) => h._nearestHostileDist < 60 },
  { id: 'aim', keys: ['RMB', 'LMB'], title: 'DRAW THE BOW', body: 'Hold RMB to aim, hold LMB to draw, release to loose. A full draw hits hardest.',
    when: (h) => h.ctx.player?.aiming },
  { id: 'conc', keys: ['SHIFT'], title: 'CONCENTRATION', body: 'Tap SHIFT while aiming to slow time. The gauge beside the reticle is what you are spending.',
    when: (h) => h.ctx.player?.aiming && h._t > 8 },
  { id: 'stealth', keys: ['C'], title: 'TALL GRASS HIDES YOU', body: 'Crouch in grass and a machine has to be almost on top of you to see you.',
    when: (h) => h.ctx.player?.inTallGrass },
  { id: 'spear', keys: ['LMB'], title: 'THE SPEAR', body: 'LMB with the bow lowered swings the spear. Behind an unaware machine it is a Silent Strike.',
    when: (h) => h._nearestHostileDist < 6 },
  { id: 'heal', keys: ['Q'], title: 'MEDICINE POUCH', body: 'Hold Q to sip. The green bar under your health is what you have left.',
    when: (h) => (h.ctx.player?.health ?? 100) < (h.ctx.player?.maxHealth ?? 100) * 0.62 },
  { id: 'craft', keys: ['R'], title: 'CRAFT ON THE MOVE', body: 'Hold R to craft the ammo you have selected out of your resources.',
    when: (h) => h._ammoEmpty },
  { id: 'tools', keys: ['F', '[', ']'], title: 'TOOLS', body: 'F uses the selected tool. [ and ] cycle the strip.',
    when: (h) => h._toolsReady && h._t > 16 },
  { id: 'skills', keys: ['K'], title: 'SKILL POINT', body: 'You have a point to spend. Press K to open the skill trees.',
    when: (h) => (h.ctx.progression?.skillPoints ?? 0) > 0 },
  { id: 'log', keys: ['J'], title: 'THE HUNT', body: 'J opens the quest log. The tracked objective sits under your health.',
    when: (h) => !!h.ctx.progression?.tracked && h._t > 12 },
];

export class HUD {
  constructor(ctx) {
    this.ctx = ctx;
    this.rootEl = document.getElementById('hud');

    this._vw = window.innerWidth;
    this._vh = window.innerHeight;
    this._scale = 1;
    this._t = 0;

    this._v = new THREE.Vector3(); // scratch for projections
    this._v2 = new THREE.Vector3();

    // compass window: ±70° visible, mapped across 480px (edges masked out)
    this._halfWinDeg = 70;
    this._pxPerDeg = 3.35;

    // dirty-check caches so per-frame DOM writes only happen on change
    this._lastHp = -1;
    this._lastHpNum = -1;
    this._lastLow = null;
    this._lastPouch = -1;
    this._lastPouchPips = -1;
    this._lastPouchHint = null;
    this._lastHealing = null;
    this._lastIdle = null;
    this._lastAim = null;
    this._lastWpnSig = '';
    this._lastConcSig = '';
    this._lastIntSig = '';
    this._lastBearing = -1;
    this._lastVin = -1;
    this._lastElemSig = '';
    this._lastToolSig = '';
    this._lastXpSig = '';
    this._lastTrackSig = '';
    this._lastEyeSig = '';
    this._lastObjDiamond = '';
    this._lastNock = -1;

    this._hurtFlash = 0;
    this._deathTimer = 0;          // pending death-overlay setTimeout handle

    // damage-delta ghosting (health) & dynamic-HUD vitals timer
    this._hpGhostW = -1;
    this._hpGhostHold = 0;
    this._vitalsIdleT = VITALS_IDLE_S + 1; // boots hidden: full health at spawn
    this._trackIdleT = 0;
    this._reveal = 0;              // hold-H "show HUD" reveal, 0..1

    // Concentration veil ramp (combat-concentration-presentation)
    this._concVeil = 0;
    this._concOn = false;
    this._lastVeil = -1;

    // item toasts buffer one microtask so the take-all popup (shown later in
    // the same synchronous loot stack) can claim the event — see inventory.js
    this._pendingItems = [];
    this._itemFlushQueued = false;

    this._pips = new Map();        // machine -> compass pip element
    this._questPips = [];          // pooled gold objective pips
    this._awares = new Map();      // machine -> awareness indicator entry
    this._attackFlash = new Map(); // machine -> remaining flash seconds
    this._elemTrigs = new Map();   // machine -> { fire|shock|freeze: secondsLeft }
    this._engaged = new Map();     // machine -> seconds of bar time left (ui-06)
    this._mhbSlots = [];           // pooled projected machine bars
    this._mhbPick = [null, null, null];   // preallocated cap-3 selection
    this._mhbPickW = [0, 0, 0];
    this._anyHostile = false;      // any machine alert/attack this frame
    this._nearestHostileDist = Infinity;
    this._combatIdleT = 0;         // seconds since last combat-ish activity
    this._lastWpnIdle = null;
    this._ammoEmpty = false;
    this._toolsReady = false;

    // quest sequencer — progression owns the chain; this only fires victory
    this._killCounts = Object.create(null);
    this._stage = 0;
    this._victoryFired = false;
    this._victoryShown = false;
    this._lastObjTitle = null;

    // tutorial card queue
    this._tipSeen = this._loadTips();
    this._tipQueue = [];
    this._tipT = 0;
    this._tipGap = 0;

    this._slowT = 0;               // 10 Hz sampler for the signature-string panels
    this._trackIdle = null;
    this._trackSampleT = 0;
    this._lastWid = null;
    this._lastCraftSig = '';

    this._build();
    this._applyScale();
    this._bindEvents();
    this._renderTracker(true);

    /**
     * Gate contract. `lootSurfaces` is Round 3's `A10`; the rest is Round 4's
     * `A71*` / `V37` reading the same numbers the pixels were drawn from.
     */
    window.__HUD_DEBUG__ = {
      lootSurfaces: () => ({
        popupVisible: !!LOOT_POPUP.instance?.visible,
        toastCount: this._itemsEl ? this._itemsEl.childElementCount : 0,
      }),
      compass: () => this._compassAudit(),
      surfaces: () => this._surfaceAudit(),
      scale: () => this._scaleAudit(),
      tips: () => ({ seen: [...this._tipSeen], queued: this._tipQueue.map((t) => t.id) }),
      showTip: (id) => this._queueTip(TIPS.find((t) => t.id === id)),
      resetTips: () => { this._tipSeen.clear(); this._saveTips(); },
    };
  }

  /* --------------------------------- DOM ---------------------------------- */

  _build() {
    const root = this.rootEl;

    /**
     * combat-concentration-presentation. The desaturate needs `mix-blend-mode`
     * against the CANVAS, and #hud (z-index 40, position fixed) is its own
     * stacking context — a blend inside it can only see #hud's own transparent
     * background. So the veil is a body-level sibling at z-index 38: below
     * #hud (40) and Focus's glass (39), above #app. `player-anim`'s NOHUD
     * recipe hides every body child but #app, so gate films are unaffected.
     */
    const veil = document.createElement('div');
    veil.id = 'hzc-veil';
    veil.innerHTML = '<div class="hzc-veil-sat"></div><div class="hzc-veil-tint"></div>';
    document.body.appendChild(veil);
    this._veilEl = veil;
    this._veilSat = veil.firstChild;
    this._veilTint = veil.lastChild;

    this._vignette = div('hzc-vignette', root);
    // watcher flash-bang overlay ('watcher-flash' when close + facing it)
    this._wflash = div('hzc-wflash', root);

    /* ---------------- top-left vitals: health, pouch, tracker -------------- */
    const tl = div('hzc-topleft', root);
    this._topleftEl = tl;

    const hrow = div('hzc-healthrow', tl);
    const hb = div('hzc-healthbar', hrow);
    this._healthGhost = div('hzc-healthghost', hb);
    this._healthFill = div('hzc-healthfill', hb);
    // ui-07: FOUR segments, divided by three hairline ticks
    for (const pct of [25, 50, 75]) {
      const seg = div('hzc-health-seg', hb);
      seg.style.left = pct + '%';
    }
    this._healthNum = div('hzc-health-num', hrow, '<b>100</b><span>/100</span>');

    const pr = div('hzc-pouchrow', tl);
    this._pouchRow = pr;
    const pbar = div('hzc-pouchbar', pr);
    this._pouchFill = div('hzc-pouchfill', pbar);
    this._pouchPips = div('hzc-pouchpips', pr);
    this._pouchKey = document.createElement('kbd');
    this._pouchKey.className = 'hzc-pouch-key';
    this._pouchKey.textContent = 'Q';
    pr.appendChild(this._pouchKey);

    // ui-05: quest tracker UNDER the vitals, not top-right
    const tr = div('hzc-track', tl);
    this._trackEl = tr;
    div('hzc-track-kicker', tr, 'THE HUNT');
    this._trackTitle = div('hzc-track-title', tr);
    this._trackObj = div('hzc-track-obj', tr);
    this._trackMeta = div('hzc-track-meta', tr);

    /* ------------------------------- compass ------------------------------ */
    const comp = div('hzc-compass', root);
    const win = div('hzc-compass-window', comp);
    const track = div('hzc-compass-track', win);
    this._ticks = [];
    for (let a = 0; a < 360; a += 15) {
      if (a % 45 === 0) continue;
      this._ticks.push({ a, el: div('hzc-tick', track), label: false, vis: null });
    }
    const dirs = [
      [0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'],
      [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'],
    ];
    for (const [a, n] of dirs) {
      let cls = 'hzc-cdir';
      if (n.length === 1) cls += ' main';
      if (n === 'N') cls += ' north';
      this._ticks.push({ a, el: div(cls, track, n), label: true, vis: null });
    }
    this._pipLayer = div('hzc-compass-pips', win);
    div('hzc-compass-caret', comp);
    this._bearingEl = div('hzc-bearing', comp, '000');

    // ui-12: stealth eye, directly under the compass
    const eye = div('hzc-eye', root);
    this._eyeEl = eye;
    eye.innerHTML =
      '<svg viewBox="0 0 44 26" xmlns="http://www.w3.org/2000/svg">'
      + '<path class="lid" d="M2 13 C10 3 34 3 42 13 C34 23 10 23 2 13 Z"/>'
      + '<circle class="iris" cx="22" cy="13" r="5.6"/>'
      + '<circle class="pupil" cx="22" cy="13" r="2.3"/>'
      + '<path class="closed" d="M4 13 C12 19 32 19 40 13"/>'
      + '</svg>'
      + '<div class="hzc-eye-bars"><i></i><i></i><i></i></div>'
      + '<div class="hzc-eye-label">HIDDEN</div>';
    this._eyeLabel = eye.querySelector('.hzc-eye-label');
    this._eyeBars = eye.querySelector('.hzc-eye-bars');

    /* --------------- projected layers (machine bars, markers) ------------- */
    this._worldLayer = div('hzc-world', root);
    for (let i = 0; i < MHB_CAP; i++) this._mhbSlots.push(this._makeMhb());

    // in-world objective diamond with metres (onboarding-loop-objective-guidance)
    this._objDiamond = div('hzc-objmark', this._worldLayer,
      '<div class="hzc-objmark-d"><svg viewBox="0 0 24 24"><polygon points="12,1 23,12 12,23 1,12"/></svg></div>'
      + '<div class="hzc-objmark-dist">0m</div>'
      + '<div class="hzc-objmark-label"></div>');
    this._objDiamondDist = this._objDiamond.querySelector('.hzc-objmark-dist');
    this._objDiamondLabel = this._objDiamond.querySelector('.hzc-objmark-label');

    // awareness indicator layer (screen-projected, edge-clamped)
    this._awareLayer = div('hzc-awares', root);

    /* ------------------------------ reticle ------------------------------- */
    // ui-08 bracket reticle: four corner brackets that converge with draw, a
    // centre dot, and the draw-progress ring behind them. Every stroke is
    // doubled (dark under, light over) so it reads on sky and on chrome.
    const cross = div('hzc-cross', root);
    this._crossEl = cross;
    this._dotEl = div('hzc-dot', cross);
    this._brackets = div('hzc-brk', cross);
    for (const c of ['tl', 'tr', 'bl', 'br']) div('hzc-brk-a ' + c, this._brackets);
    this._ring = div('hzc-ring', cross);
    this._ring.innerHTML =
      '<svg viewBox="0 0 72 72">' +
      '<circle class="track-under" cx="36" cy="36" r="26"/>' +
      '<circle class="track" cx="36" cy="36" r="26"/>' +
      '<circle class="prog-under" cx="36" cy="36" r="26" transform="rotate(-90 36 36)"/>' +
      '<circle class="prog" cx="36" cy="36" r="26" transform="rotate(-90 36 36)"/>' +
      '</svg>';
    this._prog = this._ring.querySelector('.prog');
    this._progUnder = this._ring.querySelector('.prog-under');
    this._ringC = 2 * Math.PI * 26;
    for (const el of [this._prog, this._progUnder]) {
      el.style.strokeDasharray = this._ringC.toFixed(2);
      el.style.strokeDashoffset = this._ringC.toFixed(2);
    }
    // re-nock pip: the arrow is still travelling to the string (combat.nockProgress)
    this._nockEl = div('hzc-nock', cross);
    this._nockFill = div('hzc-nock-fill', this._nockEl);
    // Concentration gauge: thin yellow vertical drain bar beside the reticle
    this._concEl = div('hzc-conc', cross);
    this._concFill = div('hzc-conc-fill', this._concEl);

    /* ------------------------- interaction prompt ------------------------- */
    // ui-16: projected AT the interactable, not screen-fixed
    this._intEl = div('hzc-interact', this._worldLayer);
    this._intRing = div('hzc-int-ring', this._intEl);
    const intKey = document.createElement('kbd');
    intKey.className = 'hzc-int-key';
    intKey.textContent = 'E';
    this._intRing.appendChild(intKey);
    this._intLabel = div('hzc-int-label', this._intEl, 'LOOT');

    /* ----------------------- bottom-left: tools strip --------------------- */
    // ui-11 — data and behaviour belong to `ctx.items.tools`; this owns pixels.
    const tools = div('hzc-tools', root);
    this._toolsEl = tools;
    this._toolPrev = div('hzc-tool-chev prev', tools, '<span>‹</span><kbd>[</kbd>');
    this._toolRow = div('hzc-tool-row', tools);
    this._toolNext = div('hzc-tool-chev next', tools, '<kbd>]</kbd><span>›</span>');
    this._toolSlots = [];

    /* --------------------- bottom-centre: XP + level pip ------------------ */
    const xp = div('hzc-xp', root);
    this._xpEl = xp;
    this._xpPip = div('hzc-xp-pip', xp, '<span>1</span>');
    const xpw = div('hzc-xp-wrap', xp);
    const xpl = div('hzc-xp-label', xpw);
    this._xpLeft = document.createElement('span');
    this._xpLeft.textContent = 'LEVEL 1';
    this._xpRight = document.createElement('span');
    this._xpRight.textContent = '0 / 100 XP';
    xpl.append(this._xpLeft, this._xpRight);
    const xpb = div('hzc-xp-bar', xpw);
    this._xpFill = div('hzc-xp-fill', xpb);
    this._xpPoints = div('hzc-xp-points', xp);
    // +XP pops (progression-012) replace the kill feed entirely
    this._xpPops = div('hzc-xp-pops', root);

    /* -------------------------- bottom-right: weapon ---------------------- */
    const wpn = div('hzc-weapon', root);
    this._wpnEl = wpn;
    const wtop = div('hzc-wpn-top', wpn);
    this._wpnName = div('hzc-wpn-name', wtop, 'HUNTER BOW');
    this._wpnDots = div('hzc-wpn-dots', wtop);
    const wrow = div('hzc-wpn-row', wpn);
    this._wpnArt = div('hzc-wpn-art', wrow, weaponArt('hunter-bow'));
    const wmid = div('hzc-wpn-mid', wrow);
    this._wpnAmmoName = div('hzc-wpn-ammoname', wmid, 'HUNTER ARROW');
    const wcount = div('hzc-wpn-countrow', wmid);
    this._wpnGlyph = div('hzc-wpn-glyph', wcount, svgIcon('arrow', '#efe6d5'));
    this._wpnCount = div('hzc-wpn-count', wcount, '∞');
    // craft hold (onboarding-loop-crafting-feedback)
    this._craftEl = div('hzc-craft', wpn,
      '<kbd>R</kbd><div class="hzc-craft-bar"><i></i></div><span>CRAFT</span>');
    this._craftFill = this._craftEl.querySelector('i');
    this._craftLabel = this._craftEl.querySelector('span');

    // item pickup toasts (bottom-right stack, above the weapon HUD)
    this._itemsEl = div('hzc-items', root);

    /* --------------------------- damage numbers --------------------------- */
    const dl = div('hzc-dmglayer', root);
    this._dmgPool = [];
    for (let i = 0; i < 24; i++) {
      this._dmgPool.push({
        el: div('hzc-dmg', dl),
        active: false, age: 0, dur: 1, drift: 0,
        world: new THREE.Vector3(),
      });
    }

    /* ------------------------- banners + tutorial ------------------------- */
    this._bannerEl = div('hzc-banners', root);
    this._tipEl = div('hzc-tip', root);
    this._tipEl.innerHTML =
      '<div class="hzc-bracket tl"></div><div class="hzc-bracket br"></div>'
      + '<div class="hzc-tip-title"></div><div class="hzc-tip-keys"></div>'
      + '<div class="hzc-tip-body"></div>';
    this._tipTitle = this._tipEl.querySelector('.hzc-tip-title');
    this._tipKeys = this._tipEl.querySelector('.hzc-tip-keys');
    this._tipBody = this._tipEl.querySelector('.hzc-tip-body');

    /* ----------------------------- end screens ---------------------------- */
    this._deathEl = div('hzc-death', root);
    div('hzc-death-title', this._deathEl, 'YOU DIED');
    div('hzc-death-rule', this._deathEl);
    div('hzc-death-sub', this._deathEl, 'THE CAMPFIRE REKINDLES YOUR SPARK');

    this._victoryEl = div('hzc-victory', root);
    div('hzc-victory-kicker', this._victoryEl, 'QUEST COMPLETED');
    div('hzc-victory-title', this._victoryEl, 'VALLEY RECLAIMED');
    div('hzc-victory-line', this._victoryEl);
    div('hzc-victory-sub', this._victoryEl, 'EVERY MACHINE LIES SILENT · THE HUNT IS OVER');

    // pause menu (only HUD child with pointer events) — `shell-menus` replaces
    // this with the tabbed hub; until then it is the bridge that was here.
    this._pauseEl = div('hzc-pause', root);
    const pi = div('hzc-pause-inner', this._pauseEl);
    for (const c of ['tl', 'tr', 'bl', 'br']) div('hzc-bracket ' + c, pi);
    div('hzc-pause-kicker', pi, 'THE HUNT HOLDS');
    div('hzc-pause-title', pi, 'PAUSED');
    div('hzc-pause-rule', pi);
    const btn = document.createElement('button');
    btn.className = 'hzc-btn';
    btn.textContent = 'RESUME THE HUNT';
    btn.addEventListener('click', () => this.setPaused(false));
    pi.appendChild(btn);
    div('hzc-pause-hints', pi,
      '<div><b>WASD</b> Move</div><div><b>SHIFT</b> Sprint · Concentration (aim)</div>' +
      '<div><b>C</b> Crouch</div><div><b>SPACE / CTRL</b> Dodge roll</div>' +
      '<div><b>RMB</b> Aim</div><div><b>LMB</b> Draw / loose · Spear</div>' +
      '<div><b>TAB</b> Weapon wheel (hold)</div><div><b>1–6</b> Weapon quick-slots</div>' +
      '<div><b>Z / X</b> Cycle ammo</div><div><b>V</b> Focus</div>' +
      '<div><b>T</b> Tag machine (Focus)</div><div><b>E</b> Interact (hold)</div>' +
      '<div><b>Q</b> Medicine (hold)</div><div><b>R</b> Craft ammo (hold)</div>' +
      '<div><b>F</b> Use tool · <b>[ ]</b> Cycle</div><div><b>G</b> Whistle</div>' +
      '<div><b>H</b> Show HUD (hold)</div><div><b>I</b> Inventory · <b>J</b> Quests · <b>K</b> Skills</div>' +
      '<div><b>ESC</b> Pause</div>');
  }

  /** One pooled projected machine bar (ui-06): plate, name+LV, bar, elem rings. */
  _makeMhb() {
    const el = div('hzc-mhb', this._worldLayer);
    const plate = div('hzc-mhb-plate', el);
    const head = div('hzc-mhb-head', plate);
    const aware = div('hzc-mhb-aware', head,
      '<div class="hzc-mhb-aware-circle"></div>'
      + '<div class="hzc-mhb-aware-diamond"><svg viewBox="0 0 30 30">'
      + '<polygon points="15,1 18.4,9.2 26,5.6 21.4,12.6 29,15 21.4,17.4 26,24.4 18.4,20.8 15,29 11.6,20.8 4,24.4 8.6,17.4 1,15 8.6,12.6 4,5.6 11.6,9.2"/>'
      + '</svg></div>');
    const name = div('hzc-mhb-name', head, 'MACHINE');
    const bar = div('hzc-mhb-bar', plate);
    const ghost = div('hzc-mhb-ghost', bar);
    const fill = div('hzc-mhb-fill', bar);
    const elems = div('hzc-mhb-elems', el);
    const elemEls = {};
    for (const e of ['fire', 'shock', 'freeze']) {
      const row = div('hzc-elem', elems);
      row.dataset.e = e;
      const ring = div('hzc-elem-ring', row);
      div('hzc-elem-ic', ring, svgIcon(e, 'currentColor'));
      elemEls[e] = { row, ring, w: -1, trig: null, shown: null };
    }
    return {
      el, plate, aware, awareCircle: aware.firstChild, name, ghost, fill, elemEls,
      m: null, vis: null, nameSig: '', w: -1, ghostW: -1, ghostHold: 0,
      awareSig: '', elemSig: '',
    };
  }

  /* ------------------------------ HUD scale -------------------------------- */

  /**
   * ui-15 / camera-feel-13. `--hud-scale` tracks the viewport against the
   * 1600×900 reference frame, clamped to [0.85, 1.9], times the player's
   * `ctx.settings.hudScale`. Every text rule in hud.css is `max(11px, …)`, so
   * the floor is a CSS guarantee rather than a promise made here.
   */
  _applyScale() {
    const s = this.ctx.settings || (this.ctx.settings = {});
    s.hudScale ??= 1;
    const fit = Math.min(this._vw / HUD_REF_W, this._vh / HUD_REF_H);
    const auto = Math.min(HUD_SCALE_MAX, Math.max(HUD_SCALE_MIN, fit));
    const v = Math.min(2.6, Math.max(0.7, auto * (Number(s.hudScale) || 1)));
    if (Math.abs(v - this._scale) < 0.001) return;
    this._scale = v;
    this.rootEl.style.setProperty('--hud-scale', v.toFixed(3));
  }

  /** Published for `shell-menus`' settings screen (camera-feel-13). */
  setHudScale(mult) {
    const s = this.ctx.settings || (this.ctx.settings = {});
    s.hudScale = Math.min(2, Math.max(0.7, Number(mult) || 1));
    this._applyScale();
    return s.hudScale;
  }

  _scaleAudit() {
    const probe = [
      ['health', this._healthNum],
      ['track', this._trackObj],
      ['bearing', this._bearingEl],
      ['ammoName', this._wpnAmmoName],
      ['xpLabel', this._xpLeft],
      ['toolCount', this._toolRow.querySelector('.hzc-tool-n')],
      ['eye', this._eyeLabel],
      ['tip', this._tipBody],
    ];
    const fonts = {};
    let min = Infinity;
    for (const [k, el] of probe) {
      if (!el) continue;
      const px = parseFloat(getComputedStyle(el).fontSize) || 0;
      fonts[k] = +px.toFixed(2);
      if (px > 0) min = Math.min(min, px);
    }
    return {
      scale: +this._scale.toFixed(3),
      setting: this.ctx.settings?.hudScale ?? 1,
      vw: this._vw, vh: this._vh,
      minFontPx: Number.isFinite(min) ? +min.toFixed(2) : null,
      fonts,
    };
  }

  /* -------------------------------- events -------------------------------- */

  _bindEvents() {
    const ctx = this.ctx;
    const raw = ctx.events;
    /**
     * `src/core/events.js` walks its subscriber set unguarded, so a DOM hiccup
     * in here would unwind whoever emitted — including `machine-killed` inside
     * the machine loop. Every listener this lane installs is isolated.
     */
    const on = (name, fn) => raw.on(name, (e) => {
      try { fn(e); } catch (err) { console.warn(`[hud] ${name}:`, err?.message || err); }
    });
    this._on = on;

    // machine-damaged carries the v2 payload extensions (tear/tornPart);
    // it is the single source for damage numbers so hits never double-pop.
    on('machine-damaged', (e) => {
      const m = e?.machine;
      if (!m) return;
      this._combatIdleT = 0;
      const rec = this._engage(m);
      rec.hold = MHB_HOLD_S;
      rec.ghostHold = GHOST_HOLD_S;
      rec.hit = performance.now();
      this._spawnDamage(e);
      // status triggered -> start a local countdown (fire 8s / shock 3s /
      // freeze 8s); the buildup meter renders it FULL->empty in triggered style
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
    on('inventory-full', (e) => this._flash(`${String(e?.name ?? 'POCKET').toUpperCase()} FULL`, 'warn'));
    on('herb-gathered', () => { this._pouchRow.classList.remove('pulse'); void this._pouchRow.offsetWidth; this._pouchRow.classList.add('pulse'); });
    on('ammo-crafted', (e) => this._flash(`+${e?.n ?? 1} ${String(ammoLook(e?.ammo).name).toUpperCase()}`, 'good'));
    on('item-crafted', (e) => this._flash(`+${e?.n ?? 1} ${String(e?.name ?? 'ITEM').toUpperCase()}`, 'good'));
    on('tool-blocked', (e) => this._flash(String(e?.reason ?? 'NOT READY').toUpperCase(), 'warn'));
    on('player-hurt', () => {
      this._hurtFlash = Math.min(1.2, this._hurtFlash + 0.75);
      this._hpGhostHold = GHOST_HOLD_S; // red damage-delta ghost on the bar
      this._combatIdleT = 0;
    });
    // watcher blind-flash: white screen hit when close + facing the machine
    on('watcher-flash', (e) => this._watcherFlash(e));
    on('player-died', () => {
      if (this._victoryShown) return; // victory owns the screen — no death card
      // vignette hits immediately; the overlay waits so the crumple can play
      this._hurtFlash = Math.min(1.4, this._hurtFlash + 1.0);
      clearTimeout(this._deathTimer);
      this._deathTimer = setTimeout(() => {
        if (this._victoryShown || this.ctx.state !== 'dead') return;
        if (this.ctx.menus) return;                 // shell-menus owns the card
        this._deathEl.classList.add('show');
      }, DEATH_OVERLAY_DELAY);
    });
    on('player-respawn', () => {
      clearTimeout(this._deathTimer);
      this._deathEl.classList.remove('show');
      this._hurtFlash = 0;
      this._vignette.style.opacity = '0';
      this._lastVin = 0;
      if (this._victoryShown) {
        this.ctx.state = 'victory';
        this.ctx.input.exitPointerLock();
      }
    });
    on('checkpoint-loaded', () => {
      clearTimeout(this._deathTimer);
      this._deathEl.classList.remove('show');
      this._hurtFlash = 0;
    });
    on('victory', () => this._showVictory());
    on('victory-resume', () => {
      this._victoryEl.classList.remove('show');
      this.rootEl.classList.remove('endgame');
    });
    on('game-start', () => this._renderTracker(true));

    /* ---------------- progression: banners, XP, quest tracker -------------- */
    on('banner', (e) => this._banner(e?.title, e?.detail, e?.kind));
    on('xp-gained', (e) => {
      if ((e?.amount ?? 0) > 0) this._xpPop(e.amount, e.reason);
      this._lastXpSig = '';
    });
    on('level-up', () => {
      this._lastXpSig = '';
      this._xpPip.classList.remove('bump');
      void this._xpPip.offsetWidth;
      this._xpPip.classList.add('bump');
      this._emitUi('ui-confirm');
    });
    on('skill-unlocked', () => { this._lastXpSig = ''; });
    for (const n of ['quest-started', 'quest-objective', 'quest-complete', 'quest-tracked', 'objective-changed']) {
      on(n, () => { this._trackIdleT = 0; this._renderTracker(true); });
    }

    /* ------------------------------ tools strip --------------------------- */
    on('tool-selected', () => { this._lastToolSig = ''; this._emitUi('ui-nav'); });
    on('tool-used', () => { this._lastToolSig = ''; });

    /* --------------------------- Concentration veil ----------------------- */
    on('concentration-start', () => { this._concOn = true; });
    on('concentration-end', () => { this._concOn = false; });

    /* ------------------------------- input -------------------------------- */
    ctx.input.onDown('Escape', () => {
      if (this.ctx.menus) return;                   // shell-menus owns the hub
      if (this.ctx.state === 'playing') this.setPaused(true);
      else if (this.ctx.state === 'paused') this.setPaused(false);
    });
    // Browsers exit pointer lock on Esc without delivering the keydown —
    // treat any lock loss during play as a pause request.
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement == null &&
          this.ctx.state === 'playing' &&
          this.ctx.game?.started &&
          !this.ctx.menus &&
          !this.ctx.params.has('shot')) {
        this.setPaused(true);
      }
    });
    // Esc-unpause can't re-acquire pointer lock (no user activation, and
    // browsers enforce a cooldown after Esc). Any click while playing and
    // unlocked counts as the activation we need to restore mouse-look.
    document.addEventListener('mousedown', () => {
      if (this.ctx.state === 'playing' &&
          !this.ctx.input.pointerLocked &&
          !this.ctx.params.has('shot')) {
        this.ctx.input.requestPointerLock();
      }
    });

    /**
     * ui-07 / research §2 "Holding a show-HUD key temporarily reveals hidden
     * elements". H is unbound everywhere else in the build (checked against
     * every `input.onDown` call site) and it is the canon letter.
     */
    ctx.input.onDown('KeyH', () => { this._trackIdleT = 0; });
  }

  _emitUi(name) {
    try { this.ctx.events?.emit?.(name, {}); } catch { /* audio not up yet */ }
  }

  /* -------------------------- engaged-machine book -------------------------- */

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

  /* ------------------------------ pause menu ------------------------------- */

  setPaused(on) {
    const ctx = this.ctx;
    if (on) {
      if (ctx.state !== 'playing') return;
      ctx.state = 'paused';
      this._pauseEl.classList.add('show');
      ctx.input.exitPointerLock();
      this._emitUi('ui-open');
    } else {
      if (ctx.state !== 'paused') return;
      ctx.state = 'playing';
      this._pauseEl.classList.remove('show');
      if (!ctx.params.has('shot')) ctx.input.requestPointerLock();
      this._emitUi('ui-close');
    }
  }

  /* --------------------------- victory sequencer --------------------------- */

  /**
   * `progression` owns the quest chain; the only thing that still lives here is
   * the VICTORY trigger, because nothing else in the build emits it (grep:
   * `progression.js` only *listens* for `victory`). Killing the Thunderjaw —
   * or completing the legacy chain — is still what ends the hunt.
   */
  _onKill(e) {
    const m = e?.machine ?? e ?? {};
    const kind = m.kind ?? 'machine';
    this._killCounts[kind] = (this._killCounts[kind] || 0) + 1;

    this._engaged.delete(m);
    this._attackFlash.delete(m);
    this._elemTrigs.delete(m);

    while (this._stage < QUEST.length &&
           (this._killCounts[QUEST[this._stage].kind] || 0) >= QUEST[this._stage].need) {
      this._stage++;
    }
    if (!this._victoryFired && (kind === 'thunderjaw' || this._stage >= QUEST.length)) {
      this._victoryFired = true;
      // let the kill explosion breathe before the fanfare
      setTimeout(() => this.ctx.events.emit('victory'), 1400);
    }
  }

  _showVictory() {
    this._victoryFired = true;
    this._victoryShown = true;
    clearTimeout(this._deathTimer);
    this._pauseEl.classList.remove('show');
    this._deathEl.classList.remove('show');
    if (this.ctx.menus) return;                     // shell-menus owns the card
    this._victoryEl.classList.add('show');
    // hide every gameplay HUD layer under the overlay (see hud.css)
    this.rootEl.classList.add('endgame');
    this.ctx.state = 'victory';
    this.ctx.input.exitPointerLock();
  }

  /* ------------------------------- banners --------------------------------- */

  /** ui-05 — centre banners, rendered from `progression`'s `banner` event. */
  _banner(title, detail, kind = 'info') {
    if (!title) return;
    const b = div(`hzc-banner k-${kind}`, this._bannerEl);
    div('b-title', b, String(title));
    if (detail) div('b-detail', b, String(detail));
    div('b-rule', b);
    setTimeout(() => b.remove(), 3900);
    while (this._bannerEl.childElementCount > 3) this._bannerEl.firstElementChild.remove();
    this._emitUi(kind === 'death' ? 'ui-error' : 'ui-confirm');
  }

  /** Small centre-bottom flash for craft / pocket-full / tool-blocked. */
  _flash(text, kind = 'info') {
    const el = div(`hzc-flash k-${kind}`, this._xpPops, String(text));
    setTimeout(() => el.remove(), 1900);
    while (this._xpPops.childElementCount > 5) this._xpPops.firstElementChild.remove();
  }

  /** progression-012 — the kill feed is gone; this is what replaced it. */
  _xpPop(amount, reason) {
    const el = div('hzc-xppop', this._xpPops,
      `+${amount}<span>XP</span>${reason === 'quest' ? '<i>QUEST</i>' : ''}`);
    setTimeout(() => el.remove(), 1750);
    while (this._xpPops.childElementCount > 5) this._xpPops.firstElementChild.remove();
  }

  /* ------------------------------ item toasts ------------------------------ */

  /**
   * Loot-flow decision (round 3): a loot event that opened the take-all popup
   * renders the POPUP ONLY; item toasts serve auto-pickups and gathers.
   * interactables.js emits 'item-gained' BEFORE it calls popup.show() in the
   * same synchronous stack, so toasts are buffered one microtask and dropped
   * when the popup claimed their ids. (Gate `A10-loot-single-render`.)
   */
  _itemToast(e) {
    let id = e?.id ?? e?.item?.id ?? (typeof e?.item === 'string' ? e.item : null);
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
    const inv = this.ctx.inventory;
    const cat = inv?.catalog ?? inv?.items;
    const entry = cat instanceof Map ? cat.get(id) : cat?.[id];
    const local = ITEMS[id] ?? {};
    const name = entry?.name ?? e?.name ?? local.name ?? prettify(id);
    const color = e?.rarityColor ?? entry?.color ?? e?.color ?? local.color ?? '#efe6d5';
    const glyphKey = entry?.glyph && GLYPHS[entry.glyph] ? entry.glyph : local.glyph;
    const icon = glyphKey ? svgIcon(glyphKey, color)
      : e?.glyph ? `<span class="hzc-item-tg" style="color:${color}">${e.glyph}</span>`
        : svgIcon('shard', color);

    // merge into the newest row when the same item streams in
    const last = this._itemsEl.lastChild;
    if (last && last.dataset.id === id) {
      n += Number(last.dataset.n) || 0;
      last.remove();
    }
    const el = document.createElement('div');
    el.className = 'hzc-item';
    el.dataset.id = id;
    el.dataset.n = String(n);
    el.innerHTML = `${icon}<span>${name}</span><b>${n > 0 ? '×' + n : ''}</b>`;
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
    slot.el.className = 'hzc-dmg' + (cls ? ' ' + cls : '');
    slot.el.style.fontSize = px.toFixed(1) + 'px';
    slot.el.style.visibility = 'visible';
  }

  /**
   * combat-hit-feedback-faint. The number is sized by how much of the target it
   * took off, and a WEAK-POINT hit never renders below 18 px — the audit's
   * literal floor, checked by `A71c-hud-surfaces`.
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
      const px = e.weak ? Math.max(18, base * 1.28) : Math.max(14, base);
      this._popNumber(point, String(dmg), e.weak ? 'weak' : '', e.weak ? 1.15 : 0.92,
        Math.min(52, px));
    }
    if (e.tornPart) {
      this._v2.copy(point);
      this._v2.y += 0.42;
      this._popNumber(this._v2, '+TEAR', 'tear', 1.25, Math.max(18, 22 * s));
    }
  }

  _updateDamageNumbers(dt) {
    const cam = this.ctx.camera;
    const v = this._v;
    for (const d of this._dmgPool) {
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
      const x = (v.x * 0.5 + 0.5) * this._vw + d.drift * rise;
      const y = (-v.y * 0.5 + 0.5) * this._vh - 44 * rise;
      const s = k < 0.14 ? 0.82 + 0.18 * (k / 0.14) : 1;
      d.el.style.transform =
        `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%,-100%) scale(${s.toFixed(3)})`;
      const o = k < 0.1 ? k / 0.1 : k > 0.62 ? (1 - k) / 0.38 : 1;
      d.el.style.opacity = o.toFixed(2);
    }
  }

  /* ------------------------------ frame update ----------------------------- */

  update(dt, t) {
    const p = this.ctx.player;
    if (!p) return;
    if (this._vw !== window.innerWidth || this._vh !== window.innerHeight) {
      this._vw = window.innerWidth;
      this._vh = window.innerHeight;
      this._applyScale();
    }
    this._t += dt;
    this._scanMachines(dt, p);
    this._updateHealth(dt, p);
    this._updateCompass(p);
    this._updateAwareness(dt, p);
    this._updateMachineBars(dt);
    this._updateReticle(p);
    this._updateCombatIdle(dt, p);
    this._updateInteract();
    this._updateObjectiveMark(p);
    this._updateDamageNumbers(dt);
    this._updateVignette(dt, t, p);
    this._updateConcVeil(dt);

    /**
     * Everything below builds a dirty-check SIGNATURE STRING, which is an
     * allocation. At 60 fps that is real garbage for panels a player cannot
     * read changing faster than they can blink, so they run on a 10 Hz
     * sampler. Anything that has to track the camera (projection, reticle,
     * bars, numbers) stays above, per frame.
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
    this._updateXp();
    this._updateTips(sdt);
  }

  /**
   * ONE pass over `machines.list` per frame that every consumer below reads
   * from: hostility, distance, and the cap-3 bar election. No allocation — the
   * pick arrays are preallocated and overwritten in place.
   */
  _scanMachines(dt, p) {
    this._anyHostile = false;
    this._nearestHostileDist = Infinity;
    for (let i = 0; i < MHB_CAP; i++) { this._mhbPick[i] = null; this._mhbPickW[i] = -1; }

    // decay attack-flash + elemental countdowns + engagement holds
    if (this._attackFlash.size) {
      for (const [m, ttl] of this._attackFlash) {
        const left = ttl - dt;
        if (left <= 0) this._attackFlash.delete(m);
        else this._attackFlash.set(m, left);
      }
    }
    if (this._elemTrigs.size) {
      for (const [mm, rec] of this._elemTrigs) {
        let any = false;
        for (const k in rec) {
          rec[k] -= dt;
          if (rec[k] <= 0) delete rec[k];
          else any = true;
        }
        if (!any || mm.alive === false) this._elemTrigs.delete(mm);
      }
    }

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
      const dist = Math.hypot(dx, dz);
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

  /** Weapon panel + reticle dot recede when holstered & out of combat ~4s. */
  _updateCombatIdle(dt, p) {
    const c = this.ctx.combat;
    const engaged = !!p.aiming
      || (c?.drawStrength ?? 0) > 0.02
      || !!c?.concentration?.active
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

  /* --------------------------- watcher blind-flash -------------------------- */

  _watcherFlash(e) {
    const m = e?.machine;
    const p = this.ctx.player;
    if (!m?.position || !p?.position) return;
    const dx = m.position.x - p.position.x;
    const dz = m.position.z - p.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 12) return;
    const inv = dist > 0.001 ? 1 / dist : 0;
    const facing = (dx * -Math.sin(p.camYaw) + dz * -Math.cos(p.camYaw)) * inv;
    if (facing < 0.2) return;
    const el = this._wflash;
    el.classList.remove('show');
    void el.offsetWidth; // restart the 1.5s animation
    el.classList.add('show');
  }

  /* --------------------------- health + pouch ------------------------------ */

  /**
   * ui-07 / onboarding-loop-healing-readability. RED four-segment bar with HP
   * numerals, GREEN pouch directly under it with `+` pips for stored medicine
   * past 100 %, a Q prompt the moment sipping would help, and a hold-H reveal
   * that overrides the dynamic hide.
   */
  _updateHealth(dt, p) {
    const hp = clamp01(p.health / p.maxHealth);
    const w = Math.round(hp * 200) / 2; // 0.5% granularity
    if (w !== this._lastHp) {
      this._lastHp = w;
      this._healthFill.style.width = w + '%';
      const low = hp < 0.32;
      if (low !== this._lastLow) {
        this._lastLow = low;
        this._healthFill.classList.toggle('low', low);
        this._topleftEl.classList.toggle('low', low);
      }
    }
    const hpNum = Math.max(0, Math.round(p.health));
    if (hpNum !== this._lastHpNum) {
      this._lastHpNum = hpNum;
      this._healthNum.innerHTML = `<b>${hpNum}</b><span>/${Math.round(p.maxHealth)}</span>`;
    }

    // red damage-delta ghost: holds at pre-hit width, then drains to the fill
    let gw = this._hpGhostW;
    if (gw < 0 || gw < w) gw = w;
    else if (gw > w) {
      if (this._hpGhostHold > 0) this._hpGhostHold -= dt;
      else gw = Math.max(w, gw - GHOST_DRAIN * dt);
    }
    const gq = Math.round(gw * 2) / 2;
    if (gq !== this._hpGhostW) {
      this._hpGhostW = gq;
      this._healthGhost.style.width = gq + '%';
    }

    const maxPouch = p.maxPouch || 100;
    const raw = p.pouch ?? 0;
    const pouch = clamp01(raw / maxPouch);
    const pw = Math.round(pouch * 100);
    if (pw !== this._lastPouch) {
      this._lastPouch = pw;
      this._pouchFill.style.width = pw + '%';
    }
    // canon: green "+" pips for stored medicine beyond one full pouch
    const pips = Math.max(0, Math.min(4, Math.floor(raw / maxPouch)));
    if (pips !== this._lastPouchPips) {
      this._lastPouchPips = pips;
      this._pouchPips.textContent = pips > 0 ? '+'.repeat(pips) : '';
    }
    const healing = !!p.healing;
    if (healing !== this._lastHealing) {
      this._lastHealing = healing;
      this._pouchRow.classList.toggle('healing', healing);
      this._topleftEl.classList.toggle('healing', healing);
    }
    const hint = raw > 0.5 && p.health < p.maxHealth * 0.92;
    if (hint !== this._lastPouchHint) {
      this._lastPouchHint = hint;
      this._pouchKey.classList.toggle('show', hint);
    }

    // hold-H reveal (research §2) beats the dynamic hide
    const held = !!this.ctx.input?.keys?.has?.('KeyH');
    this._reveal = held ? 1 : Math.max(0, this._reveal - dt * 3);
    const engaged = hp < 0.999 || healing || this._hurtFlash > 0.02
      || this._anyHostile || gq > w + 0.25 || this._reveal > 0.01;
    if (engaged) this._vitalsIdleT = 0;
    else this._vitalsIdleT += dt;
    const idle = this._vitalsIdleT > VITALS_IDLE_S;
    if (idle !== this._lastIdle) {
      this._lastIdle = idle;
      this._topleftEl.classList.toggle('idle', idle);
    }
    this.rootEl.classList.toggle('reveal', this._reveal > 0.01);
  }

  /* ---------------------------- quest tracker ------------------------------ */

  /** ui-05 — reads `ctx.progression`, falls back to the legacy kill chain. */
  _renderTracker(force) {
    const prog = this.ctx.progression;
    let title = null, obj = null, meta = '';
    if (prog?.tracked) {
      const s = prog.state(prog.tracked);
      if (s && s.status === 'active') {
        title = s.title;
        const o = s.current;
        obj = o ? o.label : 'Return to Varl';
        if (o && o.need > 1) meta = `${o.have} / ${o.need}`;
        else if (s.progress != null) meta = `${Math.round(s.progress * 100)}%`;
      }
    }
    if (!title && this._stage < QUEST.length) {
      const s = QUEST[this._stage];
      title = s.title;
      obj = s.detail;
      meta = `${Math.min(this._killCounts[s.kind] || 0, s.need)} / ${s.need}`;
    }
    const sig = `${title}|${obj}|${meta}`;
    if (!force && sig === this._lastTrackSig) return;
    const bump = this._lastTrackSig && this._lastTrackSig.split('|')[1] !== obj;
    this._lastTrackSig = sig;
    if (!title) { this._trackEl.classList.add('off'); return; }
    this._trackEl.classList.remove('off');
    this._trackTitle.textContent = String(title).toUpperCase();
    this._trackObj.textContent = String(obj ?? '');
    this._trackMeta.textContent = meta;
    this._trackMeta.style.display = meta ? '' : 'none';
    if (bump) {
      this._trackEl.classList.remove('bump');
      void this._trackEl.offsetWidth;
      this._trackEl.classList.add('bump');
    }
    if (title !== this._lastObjTitle) {
      this._lastObjTitle = title;
      if (!this.ctx.progression) {
        // legacy chain only: progression emits its own objective-changed
        this.ctx.events.emit('objective-changed', { title, detail: obj });
      }
    }
  }

  /** Dynamic hide: the tracker recedes when nothing has changed for a while. */
  _updateTracker(dt) {
    this._renderTracker(false);
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
   * ui-04 COMPASS TRUTH. A pip is drawn for a machine only when the player has
   * EARNED that information:
   *   · it is Focus-tagged (`ctx.focus.tags`), or
   *   · it is the target of the tracked quest objective, or
   *   · it is currently fighting her (alert/attack, or hit in the last 5 s).
   * Everything else — the 320 m radar sweep this used to be — is gone. Quest
   * markers from `progression.getMarkers()` ride the same ribbon in gold.
   * Gate: `A71-compass-truth`.
   */
  _updateCompass(p) {
    const camB = norm360(-p.camYaw * RAD2DEG);

    for (const tk of this._ticks) {
      const d = wrap180(tk.a - camB);
      if (Math.abs(d) > this._halfWinDeg) {
        if (tk.vis !== false) { tk.el.style.visibility = 'hidden'; tk.vis = false; }
        continue;
      }
      if (tk.vis !== true) { tk.el.style.visibility = 'visible'; tk.vis = true; }
      const x = (d * this._pxPerDeg).toFixed(1);
      tk.el.style.transform = tk.label
        ? `translateX(calc(${x}px - 50%))`
        : `translateX(${x}px)`;
    }

    const bi = Math.round(camB) % 360;
    if (bi !== this._lastBearing) {
      this._lastBearing = bi;
      this._bearingEl.textContent = String(bi).padStart(3, '0');
    }

    this._questKind = this._trackedKillKind();
    const list = this.ctx.machines?.list;
    if (Array.isArray(list)) {
      const tags = this.ctx.focus?.tags;
      let questTarget = null;
      if (this._questKind) {
        let bd = Infinity;
        for (const m of list) {
          if (m.kind !== this._questKind || m.alive === false) continue;
          const pos = m.position ?? m.root?.position;
          if (!pos) continue;
          const dx = pos.x - p.position.x, dz = pos.z - p.position.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < bd) { bd = d2; questTarget = m; }
        }
      }
      this._questTarget = questTarget;

      let shown = 0;
      for (const m of list) {
        const tagged = !!tags?.has?.(m);
        const isQuest = m === questTarget;
        const fighting = this._engaged.has(m)
          || (m.alive !== false && (m.state === 'alert' || m.state === 'attack'));
        const earned = tagged || isQuest || fighting;
        let pip = this._pips.get(m);
        if (!earned) {
          if (pip && pip.vis !== false) { pip.el.style.visibility = 'hidden'; pip.vis = false; }
          continue;
        }
        if (!pip) {
          const el = div('hzc-pip', this._pipLayer);
          div('hzc-pip-d', el);
          pip = { el, lab: div('hzc-pip-dist', el), s: null, vis: null, dist: -1, k: null };
          this._pips.set(m, pip);
        }
        const pos = m.position ?? m.root?.position;
        if (!pos || m.alive === false) {
          if (pip.vis !== false) { pip.el.style.visibility = 'hidden'; pip.vis = false; }
          continue;
        }
        const dx = pos.x - p.position.x;
        const dz = pos.z - p.position.z;
        const dist = Math.hypot(dx, dz);
        const d = wrap180(Math.atan2(dx, -dz) * RAD2DEG - camB);
        if (dist > 320 || Math.abs(d) > this._halfWinDeg) {
          if (pip.vis !== false) { pip.el.style.visibility = 'hidden'; pip.vis = false; }
          continue;
        }
        if (pip.vis !== true) { pip.el.style.visibility = 'visible'; pip.vis = true; }
        shown++;
        pip.el.style.transform = `translateX(${(d * this._pxPerDeg).toFixed(1)}px)`;
        pip.el.style.opacity = Math.max(0.42, Math.min(1, 1.25 - dist / 300)).toFixed(2);
        const s = (m.state === 'alert' || m.state === 'attack') ? 'hostile'
          : (m.state === 'suspicious' || m.state === 'search') ? 'wary' : 'calm';
        if (pip.s !== s) { pip.s = s; pip.el.dataset.s = s; }
        const k = tagged ? 'tag' : isQuest ? 'quest' : 'fight';
        if (pip.k !== k) { pip.k = k; pip.el.dataset.k = k; }
        const di = Math.round(dist);
        if (di !== pip.dist) { pip.dist = di; pip.lab.textContent = di + 'm'; }
      }
      this._pipCount = shown;
    }

    this._updateQuestPips(p, camB);
  }

  /** Which machine kind, if any, the tracked objective is asking her to hunt. */
  _trackedKillKind() {
    const prog = this.ctx.progression;
    if (prog?.tracked) {
      const s = prog.state(prog.tracked);
      const o = s?.current;
      if (o && (o.type === 'kill' || o.type === 'scan')) {
        const def = prog.def?.(prog.tracked);
        const raw = def?.objectives?.find((x) => x.id === o.id);
        if (raw?.kind) return raw.kind;
      }
      return null;
    }
    return this._stage < QUEST.length ? QUEST[this._stage].kind : null;
  }

  /** Gold quest-marker pips on the compass ribbon (progression.getMarkers). */
  _updateQuestPips(p, camB) {
    const marks = this.ctx.progression?.getMarkers?.();
    const n = Array.isArray(marks) ? Math.min(marks.length, 6) : 0;
    while (this._questPips.length < n) {
      const el = div('hzc-pip qm', this._pipLayer);
      div('hzc-pip-d', el);
      this._questPips.push({ el, lab: div('hzc-pip-dist', el), dist: -1, vis: null });
    }
    for (let i = 0; i < this._questPips.length; i++) {
      const q = this._questPips[i];
      const mk = i < n ? marks[i] : null;
      if (!mk) {
        if (q.vis !== false) { q.el.style.visibility = 'hidden'; q.vis = false; }
        continue;
      }
      const dx = mk.x - p.position.x, dz = mk.z - p.position.z;
      const dist = Math.hypot(dx, dz);
      const d = wrap180(Math.atan2(dx, -dz) * RAD2DEG - camB);
      if (Math.abs(d) > this._halfWinDeg) {
        if (q.vis !== false) { q.el.style.visibility = 'hidden'; q.vis = false; }
        continue;
      }
      if (q.vis !== true) { q.el.style.visibility = 'visible'; q.vis = true; }
      q.el.style.transform = `translateX(${(d * this._pxPerDeg).toFixed(1)}px)`;
      q.el.dataset.tracked = mk.tracked ? '1' : '0';
      const di = Math.round(dist);
      if (di !== q.dist) { q.dist = di; q.lab.textContent = di + 'm'; }
    }
  }

  _compassAudit() {
    let pips = 0, quest = 0;
    for (const [, pip] of this._pips) if (pip.vis) pips++;
    for (const q of this._questPips) if (q.vis) quest++;
    const tags = this.ctx.focus?.tags;
    const list = this.ctx.machines?.list ?? [];
    return {
      machinePips: pips,
      questPips: quest,
      tagCount: tags?.size ?? 0,
      machinesInWindow: list.length,
      hostile: list.filter((m) => m.alive !== false && (m.state === 'alert' || m.state === 'attack')).length,
      engaged: this._engaged.size,
      questKind: this._questKind ?? null,
    };
  }

  /* ------------------------------ stealth eye ------------------------------- */

  /**
   * ui-12 / onboarding-loop-stealth-feedback. The eye is the answer to "can
   * they see me right now": it opens with the strongest live detection fill on
   * any machine, and CLOSES when she is crouched in tall grass with nothing
   * actively filling. Sound lines rise with how loudly she is moving.
   */
  _updateStealth(dt, p) {
    let fill = 0;
    let seen = false;
    const list = this.ctx.machines?.list;
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (m.alive === false) continue;
        if (m.state === 'alert' || m.state === 'attack') { fill = 1; seen = true; break; }
        const s = m.suspicion ?? 0;
        if (s > fill) fill = s;
        if ((m.detectFill ?? 0) > 0) seen = true;
      }
    }
    fill = clamp01(fill);
    const hidden = !!(p.crouching && p.inTallGrass) && fill < 0.05;
    const noise = clamp01((p.moveSpeed ?? 0) / 7) * (p.crouching ? 0.35 : 1);
    const mode = fill >= 0.999 ? 'seen' : hidden ? 'hidden' : fill > AWARE_MIN_SUSPICION ? 'watch' : 'clear';
    const sig = `${mode}|${(fill * 12) | 0}|${(noise * 3) | 0}`;
    if (sig === this._lastEyeSig) return;
    this._lastEyeSig = sig;
    this._eyeEl.dataset.m = mode;
    this._eyeEl.style.setProperty('--open', fill.toFixed(2));
    this._eyeLabel.textContent = mode === 'seen' ? 'SPOTTED'
      : mode === 'watch' ? 'SEEN…' : mode === 'hidden' ? 'HIDDEN' : 'UNSEEN';
    const bars = this._eyeBars.children;
    const lit = Math.round(noise * 3);
    for (let i = 0; i < bars.length; i++) bars[i].classList.toggle('on', i < lit);
  }

  /* ------------------------ awareness indicators ---------------------------- */

  _awareEntry(m) {
    let a = this._awares.get(m);
    if (!a) {
      const el = div('hzc-aware', this._awareLayer);
      div('hzc-aware-circle', el);
      div('hzc-aware-diamond', el,
        '<svg viewBox="0 0 30 30"><polygon points="15,1 18.4,9.2 26,5.6 21.4,12.6 29,15 21.4,17.4 26,24.4 18.4,20.8 15,29 11.6,20.8 4,24.4 8.6,17.4 1,15 8.6,12.6 4,5.6 11.6,9.2"/></svg>');
      a = { el, circle: el.firstChild, mode: null, frac: -1, vis: null, edge: null, chirped: false };
      this._awares.set(m, a);
    }
    return a;
  }

  /**
   * stealth-awareness-indicator-fidelity — the indicator now appears from
   * `suspicion > 0.04` (it used to wait for the `suspicious` STATE, which is
   * `susEnter = 0.5`, i.e. half the detection was invisible), it is 26 px, and
   * the first frame it appears emits a UI chirp on the audio bus.
   */
  _updateAwareness(dt, p) {
    const list = this.ctx.machines?.list;
    if (!Array.isArray(list)) return;
    const cam = this.ctx.camera;
    const v = this._v;

    for (const m of list) {
      const a = this._awareEntry(m);

      let mode = null;
      let frac = 0;
      if (m.alive !== false) {
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
      if (behind) { // mirror through screen center so the clamp points backward
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
      a.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${this._scale.toFixed(2)})`;
      if (a.mode !== mode) { a.mode = mode; a.el.dataset.m = mode; a.frac = -1; }
      if (mode === 'fill' && Math.abs(frac - a.frac) > 0.02) {
        a.frac = frac;
        a.circle.style.background =
          `conic-gradient(var(--hzc-yellow) ${(frac * 100).toFixed(0)}%, rgba(8, 10, 12, 0.35) 0)`;
      }
    }
  }

  /* --------------------- projected machine health bars ---------------------- */

  /**
   * ui-06 — the boss bar is gone. Every engaged machine (cap 3, elected in
   * `_scanMachines`) carries its own plate above its head with name + LV, a
   * damage-delta ghost, and its elemental rings beside it.
   */
  _updateMachineBars(dt) {
    const cam = this.ctx.camera;
    for (let i = 0; i < MHB_CAP; i++) {
      const slot = this._mhbSlots[i];
      const m = this._mhbPick[i];
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
      const x = (this._v.x * 0.5 + 0.5) * this._vw;
      const y = (-this._v.y * 0.5 + 0.5) * this._vh;
      if (x < -160 || x > this._vw + 160 || y < -80 || y > this._vh + 80) {
        if (slot.vis !== false) { slot.el.style.visibility = 'hidden'; slot.vis = false; }
        continue;
      }
      if (slot.vis !== true) { slot.el.style.visibility = 'visible'; slot.vis = true; }
      slot.el.style.transform =
        `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${this._scale.toFixed(2)})`;

      if (slot.m !== m) {
        slot.m = m;
        slot.w = -1; slot.ghostW = -1; slot.elemSig = ''; slot.awareSig = '';
        const name = String(m.displayName ?? m.kind ?? 'MACHINE').toUpperCase();
        const lv = m.level ?? LEVELS[m.kind];
        slot.name.innerHTML = lv != null
          ? `<span class="nm">${name}</span><span class="lv">LV ${lv}</span>`
          : `<span class="nm">${name}</span>`;
      }

      const frac = clamp01((m.health ?? 0) / (m.maxHealth || 1));
      const w = Math.round(frac * 200) / 2;
      if (w !== slot.w) { slot.w = w; slot.fill.style.width = w + '%'; }

      const rec = this._engaged.get(m);
      let gw = slot.ghostW;
      if (gw < 0 || gw < w) gw = w;
      else if (gw > w) {
        if (rec && rec.ghostHold > 0) { /* hold */ }
        else gw = Math.max(w, gw - GHOST_DRAIN * dt);
      }
      const gq = Math.round(gw * 2) / 2;
      if (gq !== slot.ghostW) { slot.ghostW = gq; slot.ghost.style.width = gq + '%'; }

      this._renderAware(slot, m);
      this._renderElems(slot, m);
    }
  }

  _renderAware(slot, m) {
    let aMode = 'calm';
    let aFrac = 0;
    if (m.alive !== false) {
      if (this._attackFlash.has(m)) aMode = 'attack';
      else if (m.state === 'alert' || m.state === 'attack') aMode = 'alert';
      else if ((m.suspicion ?? 0) > AWARE_MIN_SUSPICION) {
        aMode = 'fill';
        aFrac = clamp01(m.suspicion ?? 0);
      }
    }
    const sig = aMode + ((aFrac * 20) | 0);
    if (sig === slot.awareSig) return;
    slot.awareSig = sig;
    slot.aware.dataset.m = aMode;
    if (aMode === 'fill') {
      slot.awareCircle.style.background =
        `conic-gradient(var(--hzc-yellow) ${(aFrac * 100).toFixed(0)}%, rgba(8, 10, 12, 0.4) 0)`;
    }
  }

  _renderElems(slot, m) {
    const el = m.elemental;
    const trigRec = this._elemTrigs.get(m);
    let sig = '';
    for (const k of ['fire', 'shock', 'freeze']) {
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
      sig += k + (val * 50 | 0) + (trig ? 'T' : '');
      const e = slot.elemEls[k];
      const shown = val > 0.02 || trig;
      if (shown !== e.shown) { e.shown = shown; e.row.classList.toggle('show', shown); }
      if (!shown) continue;
      const pw = Math.round(val * 100);
      if (pw !== e.w || trig !== e.trig) {
        e.w = pw;
        const col = trig ? 'var(--hzc-ring-cd)' : 'var(--c)';
        e.ring.style.background =
          `conic-gradient(${col} ${pw}%, rgba(10, 13, 16, 0.68) 0)`;
      }
      if (trig !== e.trig) { e.trig = trig; e.row.classList.toggle('triggered', trig); }
    }
    slot.elemSig = sig;
    this._lastElemSig = sig;
  }

  /* ----------------- reticle: brackets, draw ring, gauges ------------------- */

  _updateReticle(p) {
    const aiming = !!p.aiming;
    if (aiming !== this._lastAim) {
      this._lastAim = aiming;
      this._ring.classList.toggle('show', aiming);
      this._brackets.classList.toggle('show', aiming);
      if (!aiming && this._lastConcSig !== 'off') {
        this._lastConcSig = 'off';
        this._concEl.classList.remove('show', 'active');
      }
    }
    if (!aiming) {
      if (this._lastNock !== -1) { this._lastNock = -1; this._nockEl.classList.remove('show'); }
      return;
    }

    const c = this.ctx.combat;
    const dsRaw = c?.drawStrength;
    const ds = typeof dsRaw === 'number' ? clamp01(dsRaw) : 0;
    const off = (this._ringC * (1 - ds)).toFixed(1);
    this._prog.style.strokeDashoffset = off;
    this._progUnder.style.strokeDashoffset = off;
    this._prog.classList.toggle('full', ds > 0.985);
    // ui-08: the brackets close as the draw tightens
    this._brackets.style.setProperty('--spread', (16 - 9 * ds).toFixed(2) + 'px');

    // re-nock pip — the arrow is still travelling from the quiver (combat §1)
    const landed = c?.nockLanded;
    const np = landed === false ? clamp01(c?.nockProgress ?? 0) : -1;
    const nq = np < 0 ? -1 : (np * 20) | 0;
    if (nq !== this._lastNock) {
      this._lastNock = nq;
      this._nockEl.classList.toggle('show', nq >= 0);
      if (nq >= 0) this._nockFill.style.width = (np * 100).toFixed(0) + '%';
    }

    const conc = c?.concentration;
    const gauge = clamp01(conc?.gauge ?? 1);
    const active = !!conc?.active;
    const show = gauge < 0.995 || active;
    const sig = show ? `${(gauge * 100) | 0}|${active ? 1 : 0}` : 'off';
    if (sig !== this._lastConcSig) {
      this._lastConcSig = sig;
      this._concEl.classList.toggle('show', show);
      this._concEl.classList.toggle('active', active);
      if (show) this._concFill.style.height = ((gauge * 100) | 0) + '%';
    }
  }

  /* ------------------------------ weapon HUD -------------------------------- */

  /**
   * ui-08 — silhouette + ammo/mod dots + count. The dot row is the weapon's
   * ammo roster (the active one filled): the build has no mod system yet, so
   * drawing empty "mod slots" would be inventing UI for data that does not
   * exist. It reads `weapon.mods` first, so the row becomes real mod dots the
   * moment `combat` publishes them.
   */
  _updateWeapon() {
    const c = this.ctx.combat;
    const w = c?.activeWeapon;

    let ammo = c?.activeAmmo ?? w?.activeAmmo ?? c?.arrowType ?? 'hunter';
    let ammoObj = null;
    if (ammo && typeof ammo === 'object') {
      ammoObj = ammo;
      ammo = ammo.id ?? ammo.name ?? 'hunter';
    }
    if (typeof ammo === 'number') ammo = ['hunter', 'fire', 'shock'][ammo] ?? 'hunter';
    if (!ammoObj && Array.isArray(w?.ammoTypes)) {
      ammoObj = w.ammoTypes.find((a) => a && typeof a === 'object' && (a.id === ammo || a.name === ammo)) ?? null;
    }

    let count = ammoObj?.count;
    if (count == null && typeof c?.ammoCount === 'function') count = c.ammoCount(ammo);
    if (count == null) {
      count = c?.ammo?.[ammo] ?? c?.counts?.[ammo] ?? c?.ammoCounts?.[ammo] ?? c?.arrowCounts?.[ammo];
    }
    if (count == null && String(ammo) === 'hunter') count = Infinity;
    this._ammoEmpty = typeof count === 'number' && count <= 0;

    const wid = String(w?.id ?? 'hunter-bow');
    const wName = String(w?.name ?? w?.displayName ?? 'Hunter Bow').toUpperCase();
    const look = ammoLook(ammo);
    const ammoName = String(
      (ammoObj && typeof ammoObj === 'object' ? ammoObj.name : null) ?? look.name,
    ).toUpperCase();
    const countText = count === Infinity ? '∞' : count == null ? '—' : String(count | 0);

    const dots = Array.isArray(w?.mods) ? w.mods
      : Array.isArray(w?.ammoTypes) ? w.ammoTypes : [];
    const dotSig = dots.map((d) => (typeof d === 'string' ? d : d?.id ?? '')).join(',');

    const sig = `${wid}|${wName}|${ammo}|${countText}|${ammoName}|${dotSig}`;
    if (sig === this._lastWpnSig) return;
    this._lastWpnSig = sig;

    if (this._lastWid !== wid) {
      this._lastWid = wid;
      this._wpnArt.innerHTML = weaponArt(wid);
    }
    this._wpnName.textContent = wName;
    this._wpnAmmoName.textContent = ammoName;
    this._wpnAmmoName.style.color = look.color;
    this._wpnCount.textContent = countText;
    this._wpnCount.classList.toggle('empty', this._ammoEmpty);
    this._wpnGlyph.innerHTML = svgIcon(look.glyph, look.color);

    let html = '';
    for (const d of dots) {
      const id = typeof d === 'string' ? d : d?.id ?? '';
      const l = ammoLook(id);
      const on = id === ammo;
      html += `<i class="${on ? 'on' : ''}" style="--c:${l.color}"></i>`;
    }
    this._wpnDots.innerHTML = html;
  }

  /* ------------------------------ tools strip -------------------------------- */

  /** ui-11 — pixels only; `ctx.items.tools` owns the data and the behaviour. */
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
    let sig = `${idx}|${cd}|${keyGlyph(tools.useKey)}`;
    for (const s of tools.slots) sig += `|${s.id}:${s.count}:${s.ready ? 1 : 0}:${s.blocked ? 1 : 0}`;
    if (sig === this._lastToolSig) return;
    this._lastToolSig = sig;
    this._toolsEl.classList.add('show');

    while (this._toolSlots.length < tools.slots.length) {
      const el = div('hzc-tool', this._toolRow);
      const ic = div('hzc-tool-ic', el);
      const n = div('hzc-tool-n', el);
      const key = document.createElement('kbd');
      key.className = 'hzc-tool-key';
      el.appendChild(key);
      const sweep = div('hzc-tool-cd', el);
      this._toolSlots.push({ el, ic, n, key, sweep, sig: '' });
    }
    for (let i = 0; i < this._toolSlots.length; i++) {
      const t = this._toolSlots[i];
      const s = tools.slots[i];
      if (!s) { t.el.style.display = 'none'; continue; }
      t.el.style.display = '';
      const active = i === idx;
      const local = ITEMS[s.id] ?? {};
      const glyph = (s.glyph && GLYPHS[s.glyph]) ? s.glyph : local.glyph ?? 'shard';
      const color = s.rarityColor ?? s.color ?? local.color ?? '#efe6d5';
      const isig = `${glyph}|${color}`;
      if (t.sig !== isig) { t.sig = isig; t.ic.innerHTML = svgIcon(glyph, color); }
      t.n.textContent = s.count == null ? '' : String(s.count);
      t.el.classList.toggle('active', active);
      t.el.classList.toggle('empty', !s.count);
      t.el.classList.toggle('blocked', !!s.blocked);
      t.el.title = s.name ?? '';
      if (active) {
        t.key.textContent = keyGlyph(tools.useKey);
        t.key.style.display = '';
        const c = clamp01(tools.cooldown ?? 0);
        t.sweep.style.background = c > 0.001
          ? `conic-gradient(rgba(10,13,16,0.72) ${(c * 100).toFixed(0)}%, transparent 0)`
          : 'none';
      } else {
        t.key.style.display = 'none';
        t.sweep.style.background = 'none';
      }
    }
    const ck = Array.isArray(tools.cycleKeys) ? tools.cycleKeys : ['BracketLeft', 'BracketRight'];
    this._toolPrev.querySelector('kbd').textContent = keyGlyph(ck[0]);
    this._toolNext.querySelector('kbd').textContent = keyGlyph(ck[1]);
  }

  /* ------------------------------ craft hold -------------------------------- */

  /**
   * onboarding-loop-crafting-feedback — the hold-R state machine lives in
   * `combat.craft`; this draws its fill, and says WHY when it is blocked.
   */
  _updateCraft() {
    const c = this.ctx.combat?.craft;
    if (!c) {
      if (this._lastCraftSig !== 'off') { this._lastCraftSig = 'off'; this._craftEl.style.display = 'none'; }
      return;
    }
    this._craftEl.style.display = '';
    const prog = clamp01(c.progress ?? 0);
    const sig = `${c.holding ? 1 : 0}|${(prog * 20) | 0}|${c.ok ? 1 : 0}|${c.blocker ?? ''}`;
    if (sig === this._lastCraftSig) return;
    this._lastCraftSig = sig;
    this._craftEl.classList.toggle('on', !!c.holding);
    this._craftFill.style.width = (prog * 100).toFixed(0) + '%';
    this._craftFill.style.background = c.ok === false ? 'var(--hzc-alert)' : 'var(--hzc-yellow)';
    this._craftLabel.textContent = c.holding && c.blocker
      ? String(c.blocker).toUpperCase()
      : 'CRAFT';
  }

  /* --------------------------- XP bar + level pip ---------------------------- */

  _updateXp() {
    const prog = this.ctx.progression;
    if (!prog) {
      if (this._lastXpSig !== 'off') { this._lastXpSig = 'off'; this._xpEl.classList.remove('show'); }
      return;
    }
    const next = prog.xpToNext;
    const finite = Number.isFinite(next);
    const pct = finite ? clamp01(prog.xpIntoLevel / next) : 1;
    const sig = `${prog.level}|${prog.xpIntoLevel}|${finite ? next : 'max'}|${prog.skillPoints}`;
    if (sig === this._lastXpSig) return;
    this._lastXpSig = sig;
    this._xpEl.classList.add('show');
    this._xpPip.firstChild.textContent = String(prog.level);
    this._xpLeft.textContent = `LEVEL ${prog.level}`;
    this._xpRight.textContent = finite ? `${prog.xpIntoLevel} / ${next} XP` : 'MAX';
    this._xpFill.style.width = (pct * 100).toFixed(1) + '%';
    const sp = prog.skillPoints | 0;
    this._xpPoints.style.display = sp > 0 ? '' : 'none';
    if (sp > 0) this._xpPoints.innerHTML = `◆ ${sp} SKILL POINT${sp > 1 ? 'S' : ''} <kbd>K</kbd>`;
  }

  /* --------------------------- interaction prompt --------------------------- */

  /** ui-16 — the prompt is projected AT the interactable, not screen-fixed. */
  _updateInteract() {
    const cur = this.ctx.interactables?.current;
    if (!cur) {
      if (this._lastIntSig !== 'off') {
        this._lastIntSig = 'off';
        this._intEl.classList.remove('show');
      }
      return;
    }
    const label = String(cur.label ?? 'INTERACT').toUpperCase();
    const prog = clamp01(cur.holdProgress ?? cur.progress ?? 0);

    // project onto the entry when it carries a world position; else park it
    // where it always was (screen centre-bottom) so nothing regresses
    const pos = cur.position ?? cur.point ?? cur.object?.position ?? cur.mesh?.position;
    let placed = false;
    if (pos && Number.isFinite(pos.x)) {
      this._v.set(pos.x, (pos.y ?? 0) + (cur.promptHeight ?? 1.1), pos.z).project(this.ctx.camera);
      if (this._v.z <= 1) {
        const x = (this._v.x * 0.5 + 0.5) * this._vw;
        const y = (-this._v.y * 0.5 + 0.5) * this._vh;
        if (x > -60 && x < this._vw + 60 && y > -40 && y < this._vh + 40) {
          this._intEl.style.transform =
            `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%,-50%) scale(${this._scale.toFixed(2)})`;
          placed = true;
        }
      }
    }
    if (!placed) {
      this._intEl.style.transform =
        `translate(${(this._vw * 0.5).toFixed(1)}px, ${(this._vh * 0.66).toFixed(1)}px) `
        + `translate(-50%,-50%) scale(${this._scale.toFixed(2)})`;
    }

    const sig = `${label}|${(prog * 50) | 0}|${placed ? 1 : 0}`;
    if (sig === this._lastIntSig) return;
    this._lastIntSig = sig;
    this._intEl.classList.add('show');
    this._intLabel.textContent = label;
    this._intRing.style.background =
      `conic-gradient(var(--hzc-yellow) ${(prog * 100).toFixed(0)}%, rgba(239, 230, 213, 0.18) 0)`;
  }

  /* ---------------------- in-world objective diamond ------------------------- */

  /**
   * onboarding-loop-objective-guidance — a gold diamond over the tracked
   * objective with its distance in metres, edge-clamped when off screen so it
   * always points at where she is supposed to go.
   */
  _updateObjectiveMark(p) {
    const prog = this.ctx.progression;
    let mk = null;
    const marks = prog?.getMarkers?.();
    if (Array.isArray(marks)) {
      for (const m of marks) { if (m.tracked) { mk = m; break; } }
      if (!mk && marks.length) mk = marks[0];
    }
    let wx, wy, wz, label;
    if (mk) {
      wx = mk.x; wy = (mk.y ?? 0) + 2.2; wz = mk.z; label = mk.label ?? '';
    } else if (this._questTarget) {
      const q = this._questTarget.position ?? this._questTarget.root?.position;
      if (!q) { this._objDiamond.classList.remove('show'); return; }
      wx = q.x; wy = q.y + (this._questTarget.height ?? 2.2) + 1.8; wz = q.z;
      label = String(this._questTarget.displayName ?? this._questTarget.kind ?? '').toUpperCase();
    } else {
      if (this._lastObjDiamond !== 'off') {
        this._lastObjDiamond = 'off';
        this._objDiamond.classList.remove('show');
      }
      return;
    }

    const dist = Math.hypot(wx - p.position.x, wz - p.position.z);
    this._v.set(wx, wy, wz).project(this.ctx.camera);
    const behind = this._v.z > 1;
    let x = (this._v.x * 0.5 + 0.5) * this._vw;
    let y = (-this._v.y * 0.5 + 0.5) * this._vh;
    if (behind) { x = this._vw - x; y = this._vh - y; }
    const mgn = 58;
    const off = behind || x < mgn || x > this._vw - mgn || y < mgn || y > this._vh - mgn;
    if (off) {
      const cx = this._vw / 2, cy = this._vh / 2;
      const dx = x - cx;
      const dy = behind ? Math.abs(y - cy) + cy * 0.35 : y - cy;
      const k = Math.min(
        (cx - mgn) / Math.max(1e-4, Math.abs(dx)),
        (cy - mgn) / Math.max(1e-4, Math.abs(dy)),
      );
      x = cx + dx * k;
      y = cy + dy * k;
    }
    this._objDiamond.classList.add('show');
    this._objDiamond.classList.toggle('edge', off);
    this._objDiamond.style.transform =
      `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%,-50%) scale(${this._scale.toFixed(2)})`;
    const di = Math.round(dist);
    const sig = `${di}|${label}|${off ? 1 : 0}`;
    if (sig === this._lastObjDiamond) return;
    this._lastObjDiamond = sig;
    this._objDiamondDist.textContent = di + 'm';
    this._objDiamondLabel.textContent = label;
  }

  /* ------------------------- vignette + Conc veil ---------------------------- */

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

  /**
   * ui-19 / combat-concentration-presentation — Concentration desaturates the
   * world, cools it, and pulls a vignette in. The ramp is real-time (a 0.22 s
   * attack, 0.34 s release) and it is driven off the `concentration-start` /
   * `-end` events with a poll on `combat.concentration.active` as the belt.
   */
  _updateConcVeil(dt) {
    const active = this._concOn || !!this.ctx.combat?.concentration?.active;
    const target = active ? 1 : 0;
    const rate = active ? 1 / 0.22 : 1 / 0.34;
    if (this._concVeil < target) this._concVeil = Math.min(target, this._concVeil + rate * dt);
    else if (this._concVeil > target) this._concVeil = Math.max(target, this._concVeil - rate * dt);
    const q = Math.round(this._concVeil * 50) / 50;
    if (q === this._lastVeil) return;
    this._lastVeil = q;
    const on = q > 0.001;
    this._veilEl.classList.toggle('on', on);
    if (!on) return;
    this._veilSat.style.opacity = (q * 0.72).toFixed(3);
    this._veilTint.style.opacity = q.toFixed(3);
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
   * ui-17 — a one-shot contextual card per mechanic, gated on the mechanic
   * actually being reachable. Cards never stack: one shows for 6.5 s, the next
   * follows 0.8 s later.
   */
  _updateTips(dt) {
    if (this.ctx.state !== 'playing') return;
    for (const tip of TIPS) {
      if (this._tipSeen.has(tip.id)) continue;
      let ok = false;
      try { ok = !!tip.when(this); } catch { ok = false; }
      if (ok) this._queueTip(tip);
    }
    if (this._tipT > 0) {
      this._tipT -= dt;
      if (this._tipT <= 0) this._tipEl.classList.remove('show');
      return;
    }
    if (this._tipGap > 0) { this._tipGap -= dt; return; }
    const tip = this._tipQueue.shift();
    if (!tip) return;
    this._tipTitle.textContent = tip.title;
    this._tipBody.textContent = tip.body;
    this._tipKeys.innerHTML = tip.keys.map((k) => `<kbd>${k}</kbd>`).join('');
    this._tipEl.classList.add('show');
    this._tipT = 6.5;
    this._tipGap = 0.8;
    this._emitUi('ui-nav');
  }

  /* -------------------------------- audits ----------------------------------- */

  /** Everything `V37-hud-language` / `A71c-hud-surfaces` grade, as numbers. */
  _surfaceAudit() {
    const vis = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.04) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && r.right > 0 && r.bottom > 0
        && r.left < this._vw && r.top < this._vh;
    };
    const bars = this._mhbSlots.filter((s) => s.vis && vis(s.el));
    const dmgLive = this._dmgPool.filter((d) => d.active);
    return {
      health: {
        visible: vis(this._topleftEl),
        pct: this._lastHp,
        numerals: this._healthNum.textContent.trim(),
        segments: this._topleftEl.querySelectorAll('.hzc-health-seg').length + 1,
        fillColor: getComputedStyle(this._healthFill).backgroundColor,
      },
      pouch: { visible: vis(this._pouchRow), pct: this._lastPouch, pips: this._lastPouchPips,
        color: getComputedStyle(this._pouchFill).backgroundColor },
      tracker: { visible: vis(this._trackEl), text: this._trackObj.textContent },
      compass: this._compassAudit(),
      eye: { visible: vis(this._eyeEl), mode: this._eyeEl.dataset.m ?? null,
        label: this._eyeLabel.textContent },
      machineBars: { visible: bars.length, cap: MHB_CAP, engaged: this._engaged.size,
        names: bars.map((s) => s.name.textContent) },
      tools: { visible: vis(this._toolsEl), slots: this._toolSlots.filter((t) => t.el.style.display !== 'none').length,
        index: this.ctx.items?.tools?.index ?? -1, useKey: keyGlyph(this.ctx.items?.tools?.useKey) },
      xp: { visible: vis(this._xpEl), level: this.ctx.progression?.level ?? null,
        text: this._xpRight.textContent },
      weapon: { visible: vis(this._wpnEl), name: this._wpnName.textContent,
        dots: this._wpnDots.childElementCount, art: this._wpnArt.querySelector('svg') != null },
      reticle: { visible: vis(this._crossEl), aiming: !!this.ctx.player?.aiming,
        brackets: this._brackets.classList.contains('show') },
      concentration: { veil: +this._concVeil.toFixed(2), on: this._veilEl.classList.contains('on') },
      damageNumbers: {
        live: dmgLive.length,
        px: dmgLive.map((d) => Math.round(parseFloat(getComputedStyle(d.el).fontSize) || 0)),
        weakPx: dmgLive.filter((d) => d.el.classList.contains('weak'))
          .map((d) => Math.round(parseFloat(getComputedStyle(d.el).fontSize) || 0)),
      },
      banners: this._bannerEl.childElementCount,
      xpPops: this._xpPops.childElementCount,
      tip: { visible: vis(this._tipEl), title: this._tipTitle.textContent },
      killFeed: document.querySelectorAll('.hzc-toast').length,
      scale: this._scaleAudit(),
    };
  }
}
