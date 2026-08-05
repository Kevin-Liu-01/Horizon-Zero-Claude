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
    impact: 6, tear: 150, element: 'none', elementAmount: 0,
    // tight burst: strips 1-2 neighbouring parts, never the far side
    drawScaled: false, projectile: 'arrow', speed: 52,
    aoe: { radius: 2.2, impact: 0, tear: 110 }, burst: 'tear',
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
};

export const WEAPON_DEFS = [
  {
    id: 'hunter-bow', name: 'Hunter Bow', slot: 1,
    drawTime: 0.7, aimFov: 44, ammoTypes: ['hunter', 'hardpoint', 'fire'],
  },
  {
    id: 'sharpshot-bow', name: 'Sharpshot Bow', slot: 2,
    drawTime: 1.2, aimFov: 38, ammoTypes: ['precision', 'tearblast'],
  },
  {
    id: 'war-bow', name: 'War Bow', slot: 3,
    drawTime: 0.5, aimFov: 46, ammoTypes: ['shock', 'freeze'],
  },
  {
    id: 'blast-sling', name: 'Blast Sling', slot: 4,
    drawTime: 0.45, aimFov: 55, noZoom: true, lob: true,
    ammoTypes: ['blast-bomb'],
  },
];

export const DISC_LAUNCHER_DEF = {
  id: 'disc-launcher', name: 'Disc Launcher', slot: 0,
  drawTime: 0, aimFov: 46, heavy: true, ammoTypes: ['disc'],
  fireCooldown: 0.55, shots: 8,
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
  };
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">${P[id] ?? P.hunter}</svg>`;
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
  };
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">${P[id] ?? P['metal-shards']}</svg>`;
}

export function itemName(id) {
  return ITEMS[id]?.name ?? id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
