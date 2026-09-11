/**
 * Weapon + ammo catalog for the HZD-accuracy overhaul (spec v2 weapons
 * contract, tuned from docs/research/mechanics.md).
 *
 * Damage channels per hit: { impact, tear, element, elementAmount }.
 * `drawScaled` ammo scales impact/tear/speed with draw strength
 * (underdrawn ≈ 25% — faithful to "can fire underdrawn for reduced damage").
 */

export const ITEMS = {
  'ridge-wood': { name: 'Ridge-Wood', color: '#b08d57' },
  'metal-shards': { name: 'Metal Shards', color: '#c8d4dc' },
  'blaze': { name: 'Blaze', color: '#ff7a1e' },
  'sparker': { name: 'Sparker', color: '#57c8ff' },
  'chillwater': { name: 'Chillwater', color: '#bfe6ff' },
  'echo-shell': { name: 'Echo Shell', color: '#6fd6e8' },
  'wire': { name: 'Wire', color: '#c9a86a' },
  'blastpaste': { name: 'Blastpaste', color: '#e8762c' },
};

export const AMMO = {
  'hunter': {
    id: 'hunter', name: 'Hunter Arrow', weapon: 'hunter-bow',
    impact: 30, tear: 10, element: 'none', elementAmount: 0,
    drawScaled: true, projectile: 'arrow', speed: 62,
    start: 40, cap: 100, batch: 10,
    recipe: [['ridge-wood', 2], ['metal-shards', 1]],
    color: '#e8d9b0',
  },
  'hardpoint': {
    id: 'hardpoint', name: 'Hardpoint Arrow', weapon: 'hunter-bow',
    impact: 55, tear: 60, element: 'none', elementAmount: 0,
    drawScaled: true, projectile: 'arrow', speed: 56,
    start: 15, cap: 50, batch: 5,
    recipe: [['ridge-wood', 2], ['metal-shards', 5]],
    color: '#ffb45e',
  },
  'fire': {
    id: 'fire', name: 'Fire Arrow', weapon: 'hunter-bow',
    impact: 12, tear: 4, element: 'fire', elementAmount: 50,
    drawScaled: false, projectile: 'arrow', speed: 54,
    start: 10, cap: 40, batch: 5,
    recipe: [['ridge-wood', 2], ['blaze', 1]],
    color: '#ff7a1e',
  },
  'precision': {
    id: 'precision', name: 'Precision Arrow', weapon: 'sharpshot-bow',
    impact: 90, tear: 40, element: 'none', elementAmount: 0,
    drawScaled: true, projectile: 'arrow', speed: 84,
    start: 8, cap: 25, batch: 3,
    recipe: [['ridge-wood', 4], ['metal-shards', 10]],
    color: '#9fe8ff',
  },
  'tearblast': {
    id: 'tearblast', name: 'Tearblast Arrow', weapon: 'sharpshot-bow',
    /**
     * `combat-tearblast-canon`. Canon Tearblast is a compressed-air charge:
     * it does NO impact damage at all ("pure tear = silent" — no body damage
     * number, no hitstop, no weak-spot multiplier), it LATCHES to what it hits
     * and blows `fuse` seconds later, and the burst strips at most `tearCap`
     * components. Everything about it is authored here, not in combat.js.
     */
    impact: 0, tear: 150, element: 'none', elementAmount: 0,
    // tight burst: strips 1-3 neighbouring parts, never the far side
    drawScaled: false, projectile: 'arrow', speed: 52,
    aoe: { radius: 2.2, impact: 0, tear: 110 }, burst: 'tear',
    fuse: 0.8, tearCap: 3, silent: true,
    start: 4, cap: 10, batch: 2,
    recipe: [['ridge-wood', 4], ['echo-shell', 2]],
    color: '#6fd6e8',
  },
  'shock': {
    id: 'shock', name: 'Shock Arrow', weapon: 'war-bow',
    impact: 10, tear: 4, element: 'shock', elementAmount: 60,
    drawScaled: false, projectile: 'arrow', speed: 52,
    start: 12, cap: 40, batch: 5,
    recipe: [['ridge-wood', 2], ['sparker', 1]],
    color: '#57c8ff',
  },
  'freeze': {
    id: 'freeze', name: 'Freeze Arrow', weapon: 'war-bow',
    impact: 10, tear: 4, element: 'freeze', elementAmount: 60,
    drawScaled: false, projectile: 'arrow', speed: 52,
    start: 12, cap: 40, batch: 5,
    recipe: [['ridge-wood', 2], ['chillwater', 1]],
    color: '#bfe6ff',
  },
  'blast-bomb': {
    id: 'blast-bomb', name: 'Blast Bomb', weapon: 'blast-sling',
    impact: 0, tear: 0, element: 'none', elementAmount: 0,
    drawScaled: false, projectile: 'bomb', speed: 17, lob: true,
    aoe: { radius: 3.8, impact: 70, tear: 30 }, burst: 'blast',
    start: 6, cap: 20, batch: 3,
    recipe: [['ridge-wood', 3], ['metal-shards', 10]],
    color: '#ff9a3c',
  },
  'disc': {
    id: 'disc', name: 'Explosive Disc', weapon: 'disc-launcher',
    impact: 0, tear: 0, element: 'none', elementAmount: 0,
    drawScaled: false, projectile: 'disc', speed: 34,
    aoe: { radius: 5.2, impact: 110, tear: 45 }, burst: 'blast',
    start: 0, cap: 8, batch: 0, recipe: null,
    color: '#ff5a30',
  },

  /* ----------------------- Ropecaster (combat-roster-missing) -------------
   * Canon: ropes do no damage. Enough of them PIN the machine to the ground,
   * which is the whole point — a tied Thunderjaw is a free Critical Hit and a
   * free tear window. `ropes` is how many it takes on a small machine; the
   * scale-up per class lives in TIE_DOWN below.
   */
  'rope': {
    id: 'rope', name: 'Rope', weapon: 'ropecaster',
    impact: 0, tear: 0, element: 'none', elementAmount: 0,
    drawScaled: false, projectile: 'rope', speed: 44, silent: true,
    tie: 1, tieHold: 6.5,
    start: 8, cap: 20, batch: 4,
    recipe: [['ridge-wood', 2], ['wire', 2]],
    color: '#d8c08a',
  },

  /* ----------------------- Tripcaster (combat-roster-missing) -------------
   * Two shots make one wire: the first plants an anchor, the second closes the
   * span. A machine crossing it detonates the payload. `trap: 'wire'` is what
   * combat/traps.js keys on; the wheel shows the placement state from it.
   */
  'tripwire-blast': {
    id: 'tripwire-blast', name: 'Blast Wire', weapon: 'tripcaster',
    impact: 0, tear: 0, element: 'none', elementAmount: 0,
    drawScaled: false, projectile: 'wire', speed: 40, trap: 'wire',
    aoe: { radius: 4.0, impact: 85, tear: 35 }, burst: 'blast',
    span: 14, life: 90,
    start: 4, cap: 12, batch: 2,
    recipe: [['wire', 2], ['blastpaste', 1]],
    color: '#ff9a3c',
  },
  'tripwire-shock': {
    id: 'tripwire-shock', name: 'Shock Wire', weapon: 'tripcaster',
    impact: 0, tear: 0, element: 'shock', elementAmount: 90,
    drawScaled: false, projectile: 'wire', speed: 40, trap: 'wire',
    aoe: { radius: 3.2, impact: 12, tear: 0 }, burst: 'shock',
    span: 14, life: 90,
    start: 4, cap: 12, batch: 2,
    recipe: [['wire', 2], ['sparker', 1]],
    color: '#57c8ff',
  },
};

/**
 * Ropes needed to pin a machine, by class. `combat-roster-missing`: a Watcher
 * goes down to two, a Thunderjaw takes five — which is why the Ropecaster is a
 * setup weapon and not a stun button.
 */
export const TIE_DOWN = {
  default: 3,
  watcher: 2, strider: 2, scrapper: 2, glinthawk: 2,
  longleg: 3, sawtooth: 3,
  behemoth: 5, thunderjaw: 5,
};
export const tieDownCount = (kind) => TIE_DOWN[kind] ?? TIE_DOWN.default;

/**
 * `nockTime` (combat-no-nock-delay) — seconds Aloy needs to pull an arrow from
 * the quiver and seat it on the string. It runs on the AIM RAISE and again
 * after every loose, and the string physically cannot bend until it expires
 * (`combat.nockLanded`). Two consequences, both deliberate:
 *   - shot-to-shot on the hunter bow is nockTime + drawTime = 1.12 s, not the
 *     0.714 s the audit measured (gate A51-nock-gap);
 *   - the string never bends with nothing on it, because the animator's quiver
 *     flourish and this timer are the same beat (docs/ROUND4-CHARACTER.md §9.5).
 *
 * `stats` is what the wheel's stat bars read: 0..1, purely presentational.
 */
export const WEAPON_DEFS = [
  {
    id: 'hunter-bow', name: 'Hunter Bow', slot: 1,
    drawTime: 0.7, nockTime: 0.42, aimFov: 44,
    ammoTypes: ['hunter', 'hardpoint', 'fire'],
    stats: { damage: 0.42, speed: 0.72, range: 0.55, tear: 0.3 },
  },
  {
    id: 'sharpshot-bow', name: 'Sharpshot Bow', slot: 2,
    // `world-02`/`combat-weapon-models-neon`: canon sharpshot zoom is a true
    // scope — 28-30 deg of FOV, not the 38 it shipped with.
    drawTime: 1.2, nockTime: 0.62, aimFov: 29,
    ammoTypes: ['precision', 'tearblast'],
    stats: { damage: 0.86, speed: 0.3, range: 1.0, tear: 0.75 },
  },
  {
    id: 'war-bow', name: 'War Bow', slot: 3,
    drawTime: 0.5, nockTime: 0.34, aimFov: 46,
    ammoTypes: ['shock', 'freeze'],
    stats: { damage: 0.2, speed: 0.9, range: 0.45, tear: 0.12 },
  },
  {
    id: 'blast-sling', name: 'Blast Sling', slot: 4,
    drawTime: 0.45, nockTime: 0.5, aimFov: 55, noZoom: true, lob: true,
    ammoTypes: ['blast-bomb'],
    stats: { damage: 0.78, speed: 0.6, range: 0.3, tear: 0.42 },
  },
  {
    id: 'ropecaster', name: 'Ropecaster', slot: 5,
    drawTime: 0.85, nockTime: 0.55, aimFov: 42,
    ammoTypes: ['rope'],
    stats: { damage: 0, speed: 0.45, range: 0.6, tear: 0 },
  },
  {
    id: 'tripcaster', name: 'Tripcaster', slot: 6,
    drawTime: 0.4, nockTime: 0.45, aimFov: 50, noZoom: true, place: true,
    ammoTypes: ['tripwire-blast', 'tripwire-shock'],
    stats: { damage: 0.65, speed: 0.7, range: 0.35, tear: 0.28 },
  },
];

export const DISC_LAUNCHER_DEF = {
  id: 'disc-launcher', name: 'Disc Launcher', slot: 0,
  drawTime: 0, nockTime: 0, aimFov: 46, heavy: true, ammoTypes: ['disc'],
  fireCooldown: 0.55, shots: 8,
  stats: { damage: 1.0, speed: 0.5, range: 0.7, tear: 0.6 },
};

/**
 * The spear (combat-melee-missing). Light chains three hits; heavy is a single
 * committed overhead that staggers. `crit` is the Critical Hit multiplier used
 * on a DOWNED machine (machine-ai publishes `state === 'downed'`).
 */
export const MELEE = {
  light: {
    damage: [26, 30, 42], tear: [6, 6, 14],
    windup: [0.10, 0.09, 0.12], strike: [0.10, 0.09, 0.12], recover: [0.26, 0.24, 0.40],
    reach: 2.7, arcDeg: 110, step: 0.55, comboWindow: 0.62,
  },
  heavy: {
    damage: 78, tear: 46,
    windup: 0.34, strike: 0.14, recover: 0.52,
    reach: 3.1, arcDeg: 140, step: 0.9, chargeTime: 0.28,
  },
  /** Silent Strike (stealth-silent-strike / combat-melee-missing). */
  silent: {
    range: 2.0, rearDot: -0.15, label: 'SILENT STRIKE', hold: 0.2,
    /** These die outright; everything else takes `heavyFrac` of max health. */
    instant: ['watcher', 'strider', 'scrapper', 'glinthawk'],
    heavyFrac: 0.55, tear: 90,
  },
  /** Critical Hit on a downed machine. */
  crit: { frac: 0.4, label: 'CRITICAL HIT' },
  noise: { light: 'noise', heavy: 'impact' },
};

/**
 * Inline SVG ammo glyphs (24×24, stroke/fill = currentColor) so the wheel and
 * HUD can render crisp icons without assets. Deliberately simple silhouettes.
 */
export function ammoIconSVG(id) {
  const P = {
    hunter: '<path d="M4 20 L17 7 M17 7 l-5 .8 M17 7 l-.8 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M4.5 16.2 l3.3 3.3 -2.2.7 -1.8-1.8z" fill="currentColor"/>',
    hardpoint: '<path d="M5 19 L15 9 M5 19 l2.6-.4 M5 19 l.4-2.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M13.4 10.6 L17 4 l3 3 -6.6 3.6z" fill="currentColor"/>',
    fire: '<path d="M12 3 C14 7 18 8.5 18 13.5 a6 6 0 0 1 -12 0 C6 10 9 9 9.5 5.5 10.5 7.5 12 8 12 3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 20 a3.2 3.2 0 0 1 -3.2-3.2 c0-2 1.8-2.5 2.4-4.3 1.4 1.2 4 2.3 4 4.3 A3.2 3.2 0 0 1 12 20z" fill="currentColor"/>',
    precision: '<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M12 2.5 v4 M12 17.5 v4 M2.5 12 h4 M17.5 12 h4" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/>',
    tearblast: '<path d="M12 3 l1.8 5.2 L19 6 l-3.2 4.4 L21 12 l-5.2 1.6 L19 18 l-5.2-1.2 L12 21 l-1.8-4.2 L5 18 l3.2-4.4 L3 12 l5.2-1.6 L5 6 l5.2 2.2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>',
    shock: '<path d="M13.5 2 L6 13.5 h5 L10.5 22 L18 10.5 h-5z" fill="currentColor"/>',
    freeze: '<path d="M12 2 v20 M3.3 7 l17.4 10 M20.7 7 L3.3 17 M12 5.5 l2.5-2 M12 5.5 l-2.5-2 M12 18.5 l2.5 2 M12 18.5 l-2.5 2 M5.5 8.2 l-3.1.6 M5.5 8.2 l-.6-3.1 M18.5 15.8 l3.1-.6 M18.5 15.8 l.6 3.1 M18.5 8.2 l3.1.6 M18.5 8.2 l.6-3.1 M5.5 15.8 l-3.1-.6 M5.5 15.8 l-.6 3.1" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>',
    'blast-bomb': '<circle cx="11" cy="14" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="11" cy="14" r="2.4" fill="currentColor"/><path d="M14.5 8.5 L17 5.5 M17 5.5 l1.6 1.6 M17 5.5 L15.4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M20 3 l.7 1.8 L22.5 5.5 l-1.8.7 L20 8 l-.7-1.8 L17.5 5.5 l1.8-.7z" fill="currentColor"/>',
    disc: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4.6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 3.5 v3 M12 17.5 v3 M3.5 12 h3 M17.5 12 h3" stroke="currentColor" stroke-width="1.3"/>',
    rope: '<path d="M4 6 c4 0 4 4 8 4 s4-4 8-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M4 12 c4 0 4 4 8 4 s4-4 8-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M8 18.5 h8 M10 18.5 v3 M14 18.5 v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    'tripwire-blast': '<path d="M3 8 h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M5 8 v-3 M19 8 v-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="15" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 15 l4.6 4.6 M12 15 l-4.6 4.6 M12 15 v5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    'tripwire-shock': '<path d="M3 8 h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M5 8 v-3 M19 8 v-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M13.4 10 L8.5 17 h3.2 L11 22 l4.9-7h-3.2z" fill="currentColor"/>',
  };
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">${P[id] ?? P.hunter}</svg>`;
}

/**
 * Weapon silhouettes for the wheel (`ui-09`: "weapon art, not a text label").
 * 40x24 line drawings in the same stroke language as the ammo glyphs.
 */
export function weaponIconSVG(id) {
  const P = {
    'hunter-bow': '<path d="M13 2 C5 8 5 16 13 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M13 2 L11.5 4.5 M13 22 L11.5 19.5" stroke="currentColor" stroke-width="1.4"/><path d="M11.5 4.5 L11.5 19.5" stroke="currentColor" stroke-width="1" opacity="0.75"/><path d="M4 12 h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M20 12 l-3.4-1.7 M20 12 l-3.4 1.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    'sharpshot-bow': '<path d="M15 1.5 C6 8 6 16 15 22.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M13 4 L13 20" stroke="currentColor" stroke-width="0.9" opacity="0.75"/><circle cx="17.5" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M17.5 5 v6 M14.5 8 h6" stroke="currentColor" stroke-width="0.9"/><path d="M5 12 h15" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    'war-bow': '<path d="M12 3 C4 7 4 17 12 21" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M11 5 L11 19" stroke="currentColor" stroke-width="1" opacity="0.75"/><path d="M4 12 h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M16 12 l3 -2 l1 2 l-1 2z" fill="currentColor"/>',
    'blast-sling': '<path d="M12 21 V10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M12 10 L5 3 M12 10 L19 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5 3 C8 8 16 8 19 3" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="12" cy="7.5" r="2.6" fill="currentColor"/>',
    'ropecaster': '<path d="M3 18 h7 l4-9 h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="14" r="3.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M14 9 c2 1 4 1 6 0" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M17 5 c2 2 2 4 0 6" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    'tripcaster': '<path d="M3 16 h6 l3-6 h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 21 h20" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 2.5"/><path d="M4 21 v-3 M20 21 v-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="10" r="1.8" fill="currentColor"/>',
    'disc-launcher': '<rect x="3" y="9" width="14" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="18" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="12" r="1.4" fill="currentColor"/><path d="M6 15 v4 M6 19 h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    'spear': '<path d="M3 21 L15 9" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/><path d="M15 9 L21 3 l-1.4 5.4 L14.2 9.8z" fill="currentColor"/><path d="M8 16 l2 2" stroke="currentColor" stroke-width="1.3"/>',
  };
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">${P[id] ?? P['hunter-bow']}</svg>`;
}

/** Small resource glyphs for craft recipes in the wheel. */
export function itemIconSVG(id) {
  const P = {
    'ridge-wood': '<path d="M4 17 L17 6 M7 19 L20 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M9 9 l2 2 M13 13 l2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    'metal-shards': '<path d="M12 3 L16 10 12 21 8 10z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 3 v18" stroke="currentColor" stroke-width="1"/>',
    'blaze': '<rect x="8" y="7" width="8" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 7 V5 h4 v2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 10 c1.6 1.6 1.6 4 0 5.4 -1.6-1.4-1.6-3.8 0-5.4z" fill="currentColor"/>',
    'sparker': '<circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M13 8.5 L10 12.5 h2 L11 15.5 L14 11.5 h-2z" fill="currentColor"/>',
    'chillwater': '<path d="M12 3.5 C15 8 18 10.5 18 14.5 a6 6 0 0 1 -12 0 C6 10.5 9 8 12 3.5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 14 a2.5 2.5 0 0 0 2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    'echo-shell': '<path d="M5 12 a7 7 0 0 1 14 0 M8 12 a4 4 0 0 1 8 0 M11 12 a1 1 0 0 1 2 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M5 12 h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    'wire': '<path d="M3 9 c3 0 3 6 6 6 s3-6 6-6 3 6 6 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    'blastpaste': '<path d="M7 10 h10 l-1.4 9 a2 2 0 0 1 -2 1.8 h-3.2 a2 2 0 0 1 -2-1.8z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9.5 10 V7 h5 v3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 12.5 c1.6 1.8 1.6 4 0 5.4 -1.6-1.4-1.6-3.6 0-5.4z" fill="currentColor"/>',
  };
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">${P[id] ?? P['metal-shards']}</svg>`;
}

export function itemName(id) {
  return ITEMS[id]?.name ?? id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
