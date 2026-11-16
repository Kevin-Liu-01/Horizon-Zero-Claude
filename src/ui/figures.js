/**
 * THE RUNG FIGURES (M1.6i; BIBLE §8.4, §18 "Character": eight rung cards, locked = black silhouette).
 *
 * One front-view figure per rung, drawn from BIBLE §8.4's "look" column, so each rung reads as its own silhouette
 * at card size: the wrap and its tail on every rung (§8.4: every rung keeps her wrap and tail), then
 *   1 STARTER    sash panels and a crossed harness
 *   2 SCOUT      a woven palm hat, a one-side shoulder guard, a long panel skirt
 *   3 RECKONER   a cowl, a slung satchel, shoulder scutes, a tabard with a pale lower panel
 *   4 VEIL       a hood over the wrap, a long coat with a frayed hem
 *   5 PIONEER    a wide quilted coat, a crescent gorget, a tool belt, greaves
 *   6 VANGUARD   tile pauldrons on both shoulders, a long tabard
 *   7 ARCANE     layered robes to the ground, a belt medallion
 *   8 CELESTIAL  tile rows, stepped pauldrons, long panels, a small lampglass at the sternum
 * A rung she can wear is drawn in its own colours (the card's swatches); a locked rung is one black shape.
 * Pure strings: no DOM, no three.
 */

const BODY = {
  legs: 'M29 68 L51 68 L50 82 L49 150 L50 154 L41 154 L41 150 L40 92 L39 150 L39 154 L30 154 L31 150 L30 82 Z',
  torso: 'M27 30 L53 30 L51 70 L29 70 Z',
  arms: 'M27 31 L22 33 L18 80 L22 82 L25 52 L28 41 Z M53 31 L58 33 L62 80 L58 82 L55 52 L52 41 Z',
  neck: 'M37 23 h6 v8 h-6 Z',
  head: 'M40 9.5 a7.5 7.5 0 1 0 0.01 0 Z',
  wrap: 'M32 18 C31 6 49 6 48 18 C45 13.5 35 13.5 32 18 Z',
  tail: 'M47 13 C54 18 55 29 52 42 L49.5 41 C51.5 30 50.5 21 45.5 16 Z',
};

/** Per rung: [part, path, colour slot] drawn over the body. Slots: 0 violet, 1 cloth, 2 leather, 3 dark, 4 straw. */
const EXTRA = {
  starter: [
    ['sash', 'M32 67 L39 67 L38.5 102 L32.5 99 Z M41 67 L48 67 L47.5 99 L41.5 102 Z', 0],
    ['harness', 'M28 32 L50 66 L48 68 L27 35 Z M52 32 L30 66 L32 68 L53 35 Z', 2],
    ['belt', 'M29 64 h22 v5 h-22 Z', 2],
  ],
  scout: [
    ['skirt', 'M28 66 L52 66 L57 130 L42 130 L40 104 L38 130 L23 130 Z', 0],
    ['vest', 'M29 30 L51 30 L50 64 L30 64 Z', 1],
    ['guard', 'M22 28 L34 27 L33 41 L20 40 Z', 2],
    ['hat', 'M22 14 L58 14 L52 9.5 L46 3.5 L34 3.5 L28 9.5 Z', 4],
  ],
  reckoner: [
    ['tabard', 'M33 33 L47 33 L48.5 108 L31.5 108 Z', 0],
    ['lower', 'M32 86 L48 86 L48.5 108 L31.5 108 Z', 1],
    ['scutes', 'M20 29 L31 28 L30 36 L19 37 Z M60 29 L49 28 L50 36 L61 37 Z', 3],
    ['satchel', 'M50 60 h13 v15 h-13 Z M50 31 L52 31 L57 60 L55 60 Z', 2],
    ['cowl', 'M29 21 C29 31 51 31 51 21 L55 33 L25 33 Z', 0],
    ['shins', 'M30 118 h9 v26 h-9 Z M41 118 h9 v26 h-9 Z', 3],
  ],
  veil: [
    ['coat', 'M25 29 L55 29 L59 142 L55 137 L51 143 L47 137 L43 143 L39 137 L35 143 L31 137 L27 143 L21 142 Z', 3],
    ['veil', 'M34 17 h12 v8 l-6 3 l-6 -3 Z', 2],
    ['hood', 'M30 21 C28 2 52 2 50 21 L54 31 L26 31 Z', 3],
  ],
  pioneer: [
    ['coat', 'M23 29 L57 29 L59 114 L21 114 Z', 1],
    ['quilt', 'M24 44 h32 M24 58 h33 M23 72 h34 M22 86 h36 M22 100 h36', 3],
    ['belt', 'M22 76 h36 v6 h-36 Z', 2],
    ['gorget', 'M31 26 C34 35 46 35 49 26 L52 31 C47 40 33 40 28 31 Z', 2],
    ['greaves', 'M30 120 h9 v28 h-9 Z M41 120 h9 v28 h-9 Z', 2],
  ],
  vanguard: [
    ['plates', 'M28 31 L52 31 L50 66 L30 66 Z', 3],
    ['tabard', 'M34 38 L46 38 L47.5 124 L32.5 124 Z', 0],
    ['pauldrons', 'M17 27 L33 26 L33 42 L15 41 Z M63 27 L47 26 L47 42 L65 41 Z', 2],
    ['greaves', 'M30 112 h9 v38 h-9 Z M41 112 h9 v38 h-9 Z', 3],
  ],
  arcane: [
    ['robe', 'M27 30 L53 30 L61 150 L19 150 Z', 0],
    ['panels', 'M30 66 L37 66 L35 150 L26 150 Z M50 66 L43 66 L45 150 L54 150 Z', 1],
    ['tiles', 'M29 31 L51 31 L50 62 L30 62 Z', 3],
    ['medallion', 'M40 63 a5 5 0 1 0 0.01 0 Z', 2],
  ],
  celestial: [
    ['panels', 'M28 64 L52 64 L60 152 L44 152 L40 116 L36 152 L20 152 Z', 0],
    ['tiles', 'M28 30 L52 30 L50 66 L30 66 Z', 1],
    ['rows', 'M29 39 h22 M29 48 h22 M30 57 h20', 3],
    ['pauldrons', 'M18 26 L33 25 L33 34 L16 35 Z M17 34 L32 34 L31 43 L16 43 Z M62 26 L47 25 L47 34 L64 35 Z M63 34 L48 34 L49 43 L64 43 Z', 1],
    ['lampglass', 'M40 36 a3 3 0 1 0 0.01 0 Z', 2],
  ],
};

export const FIGURE_IDS = Object.freeze(Object.keys(EXTRA));

const LOCKED_FILL = '#0B0A0E';
const SKIN = '#7A4E3A';

/**
 * The figure for a rung as an SVG string. `swatches` colours it (violet, cloth, leather, dark); `locked` draws one
 * black silhouette (the same outline, every part the one fill).
 * @param {string} id
 * @param {{ swatches?: string[], locked?: boolean }} [o]
 */
export function figureSvg(id, { swatches = [], locked = false } = {}) {
  const ex = EXTRA[id] || EXTRA.starter;
  const col = (slot) => (locked ? LOCKED_FILL : (swatches[slot] ?? '#D9CFBA'));
  const line = (part) => part === 'quilt' || part === 'rows';
  const p = (d, fill, cls) => `<path class="${cls}" d="${d}" fill="${fill}"/>`;
  const s = (d, stroke, cls) => `<path class="${cls}" d="${d}" fill="none" stroke="${stroke}" stroke-width="1.2"/>`;
  const dark = locked ? LOCKED_FILL : (swatches[3] ?? '#3B3A36');
  const cloth = locked ? LOCKED_FILL : (swatches[1] ?? '#D9CFBA');
  let out = '';
  out += p(BODY.legs, dark, 'fg-legs');
  out += p(BODY.torso, cloth, 'fg-torso');
  out += p(BODY.arms, locked ? LOCKED_FILL : SKIN, 'fg-arms');
  out += p(BODY.neck, locked ? LOCKED_FILL : SKIN, 'fg-neck');
  // what goes under the head (coats, skirts, plates), then the head, the wrap and its tail, then the headwear
  const over = new Set(['hat', 'hood', 'cowl', 'veil']);
  for (const [part, d, slot] of ex) if (!over.has(part)) out += line(part) && !locked ? s(d, col(slot), `fg-${part}`) : (line(part) ? '' : p(d, col(slot), `fg-${part}`));
  out += p(BODY.head, locked ? LOCKED_FILL : SKIN, 'fg-head');
  out += p(BODY.tail, locked ? LOCKED_FILL : (swatches[0] ?? '#6B3F73'), 'fg-tail');
  out += p(BODY.wrap, locked ? LOCKED_FILL : (swatches[0] ?? '#6B3F73'), 'fg-wrap');
  for (const [part, d, slot] of ex) if (over.has(part)) out += p(d, col(slot), `fg-${part}`);
  return `<svg class="ch-fig${locked ? ' locked' : ''}" viewBox="0 0 80 160" aria-hidden="true" data-rung="${id}">${out}</svg>`;
}
