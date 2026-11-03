/**
 * TIPS + WORDS  —  lane `shell-ui` (Round 5, W1; bible §8.9, §9.7, §10.3)
 * ===========================================================================
 * Three things every field-book surface reads, kept in one file so the words
 * cannot drift between screens:
 *
 *   TUTORIAL_CARDS   the 18 one-shot cards of bible §8.9, in the bible's order,
 *                    with its text verbatim (`A71e-tutorial-cards` parses the
 *                    bible's table and compares). `hud.js` shows them;
 *                    `progression` (W3) raises the beat-bound ones through
 *                    `ctx.hud.showTip(id)`.
 *   TIPS             the lines on the SHELL (title, each hub page, the death
 *                    card), where a player has stopped and is reading.
 *   fieldWord(text)  the W1 presentation bridge. Engine catalogue names (item
 *                    ids, the wreck label) are renamed by their owners at W2
 *                    (combat-kit `items.js`) and W3 (progression), but the
 *                    field-book UI ships now, so every string another lane
 *                    hands the UI goes through this before it is painted. When
 *                    the owners have renamed, each row simply stops matching;
 *                    the table is deleted at shell-ui's W2 exit.
 *
 * Rotation is deterministic per context (index-based, not random) so a
 * screenshot gate sees the same line twice.
 */

/* ------------------------------------------------------------------ words */

const WORD_ROWS = [
  [/\bmetal[ -]shards?\b/gi, 'Salt'],
  [/\bshards?\b/gi, 'Salt'],
  [/\bridge[ -]?wood\b/gi, 'Juniper'],
  [/\bchillwater\b/gi, 'Brine'],
  [/\bblaze\b/gi, 'Cinder Resin'],
  [/\bsparker\b/gi, 'Calima Dust'],
  [/\bbraided wire\b/gi, 'Bronze Cable'],
  [/\bwire\b/gi, 'Cord'],
  [/\bmedicinal herbs?\b/gi, 'Fog-Water'],
  [/\bmedicine\b/gi, 'Gourd'],
  [/\bmachine (heart|core)\b/gi, 'Escapement'],
  [/\b(\w+) lens\b/gi, '$1 Lampglass'],
  [/\bhunter bow\b/gi, 'Sabina Bow'],
  [/\bsharpshot bow\b/gi, 'Sighting Bow'],
  [/\bwar bow\b/gi, 'Cane Recurve'],
  [/\bhunter arrows?\b/gi, 'Reed Arrow'],
  [/\bhardpoint arrows?\b/gi, 'Barbed Arrow'],
  [/\bprecision arrows?\b/gi, 'Sighting Arrow'],
  [/\btearblast arrows?\b/gi, 'Barbed Arrow'],
  [/\bblast sling\b/gi, 'Pots'],
  [/\bropecaster\b/gi, 'Cast Net'],
  [/\bspear\b/gi, 'Lance'],
  [/\bdatapoints?\b/gi, 'Field Book'],
  [/\bsupply crate\b/gi, 'Salt Cache'],
  [/\bsupply cache\b/gi, 'Salt Cache'],
  [/\bmachines\b/gi, 'Instruments'],
  [/\bmachine\b/gi, 'Instrument'],
  [/\btear\b/gi, 'Pry'],
  [/\bimpact\b/gi, 'Blunt'],
  [/\bbrittle\b/gi, 'Seized'],
  [/\bcamp\b/gi, 'Cistern'],
];

/** Keep the case of the source: an upper-case label stays upper-case. */
function caseLike(src, rep) {
  return src === src.toUpperCase() && /[A-Z]/.test(src) ? rep.toUpperCase() : rep;
}

/** Engine name -> the bible's player word (§10.3). Pure; cheap; never per frame. */
export function fieldWord(text) {
  let s = String(text ?? '');
  for (const [re, rep] of WORD_ROWS) {
    s = s.replace(re, (m, g1) => caseLike(m, g1 ? rep.replace('$1', g1) : rep));
  }
  return s;
}

/* ------------------------------------------------------- the Instrument card */

/** What each kind's work is, for its card (bible §7.4). A kind may publish `cardWork` / `cardLine` itself. */
const CARD_WORK = {
  peg: 'LINE STAKE', plumb: 'LEVEL BOB', tiller: 'SOIL CORE', gauge: 'SLUICE', sickle: 'BOUNDARY CUT',
  spindle: 'STRING LINE', davit: 'REPAIR HOIST', sonde: 'TETHER SOUNDING', screed: 'CUT AND FILL',
  kiln: 'GLAZE RAM', dredge: 'BED CUTTER', transit: 'BASELINE',
};

/** The card's three words: `TILLER`, `SOIL CORE`, `TRANSECT 14` (bible §9.7). Stable for one Instrument. */
export function cardParts(m) {
  const name = fieldWord(String(m?.displayName ?? m?.kind ?? 'Instrument')).toUpperCase();
  const work = String(m?.cardWork ?? CARD_WORK[m?.kind] ?? 'SURVEY').toUpperCase();
  if (m && m.__transect == null) {
    const pos = m.position ?? m.root?.position;
    m.__transect = pos ? (Math.abs(Math.round(pos.x * 3 + pos.z * 7)) % 39) + 1 : 1;
  }
  return { name, work, line: `TRANSECT ${String(m?.__transect ?? 1).padStart(2, '0')}` };
}

export function cardLine(m) {
  if (m?.cardLine) return String(m.cardLine).toUpperCase();
  const c = cardParts(m);
  return `${c.name} · ${c.work} · ${c.line}`;
}

/* ---------------------------------------------------------- tutorial cards */

/**
 * Bible §8.9, "Tutorial cards", in order, beat by beat. `text` is the bible's
 * line verbatim; `title` / `body` are its two halves (a card is a title plus
 * one line in Plex on field-book paper). `when` raises the cards the HUD can
 * observe for itself; `beat` is where progression's first-hour chain (W3) calls
 * `ctx.hud.showTip(id)`.
 */
export const TUTORIAL_CARDS = [
  { id: 'move', beat: '0:00', text: 'Move', title: 'MOVE', body: 'WASD walks.', keys: ['W', 'A', 'S', 'D'],
    when: (h) => h._t > 2.5 },
  { id: 'sprint', beat: '0:00', text: 'Sprint (Shift)', title: 'SPRINT', body: 'Hold Shift.', keys: ['SHIFT'],
    when: (h) => h._t > 9 },
  { id: 'interact', beat: '0:00', text: 'Interact (E): rake the pan', title: 'INTERACT', body: 'E: rake the pan.', keys: ['E'],
    when: (h) => !!h.ctx.interactables?.current },
  { id: 'sighting', beat: '0:05', text: 'Sighting (V): raise the Alidade; read a mark', title: 'SIGHTING', body: 'V: raise the Alidade; read a mark.', keys: ['V', 'T'],
    when: (h) => h._nearestInstrumentDist < 60 },
  { id: 'bow', beat: '0:10', text: 'Bow: RMB draw, LMB loose', title: 'BOW', body: 'RMB draw, LMB loose.', keys: ['RMB', 'LMB'],
    when: (h) => !!h.ctx.player?.aiming },
  { id: 'barbed', beat: '0:10', text: 'Barbed arrows Pry', title: 'BARBED ARROWS', body: 'Barbed arrows Pry.', keys: ['Z', 'X'] },
  { id: 'transects', beat: '0:10', text: 'Transects: crossing a live peg line near a Plumb gets you Flagged', title: 'TRANSECTS', body: 'Crossing a live peg line near a Plumb gets you Flagged.', keys: [] },
  { id: 'steady', beat: '0:10', text: 'Steady: hold Shift while aiming', title: 'STEADY', body: 'Hold Shift while aiming.', keys: ['SHIFT'],
    when: (h) => !!h.ctx.player?.aiming && h._aimT > 3 },
  { id: 'climb', beat: '0:18', text: 'Climb (E at a ledge)', title: 'CLIMB', body: 'E at a ledge.', keys: ['E'] },
  { id: 'triangulate', beat: '0:18', text: 'Triangulate: from a pillar, sight two others', title: 'TRIANGULATE', body: 'From a pillar, sight two others.', keys: ['V'] },
  { id: 'weak-points', beat: '0:25', text: 'Weak points: the level vial', title: 'WEAK POINTS', body: 'The level vial.', keys: [] },
  { id: 'pry-bob', beat: '0:25', text: 'Pry the bob', title: 'PRY', body: 'Pry the bob.', keys: [] },
  { id: 'undercut', beat: '0:25', text: 'Undercut (E behind an unaware Instrument)', title: 'UNDERCUT', body: 'E behind an unaware Instrument.', keys: ['E'] },
  { id: 'lance', beat: '0:35', text: 'Lance: LMB light, hold for heavy', title: 'LANCE', body: 'LMB light, hold for heavy.', keys: ['LMB'],
    when: (h) => h._nearestHostileDist < 6 },
  { id: 'windwall', beat: '0:35', text: 'Windwall: RMB guard, parry by timing, X to plant', title: 'WINDWALL', body: 'RMB guard, parry by timing, X to plant.', keys: ['RMB', 'X'] },
  { id: 'pots', beat: '0:35', text: 'Pots: F tap to lob, hold to cast', title: 'POTS', body: 'F tap to lob, hold to cast.', keys: ['F'] },
  { id: 'benchmarks', beat: '0:45', text: 'Benchmarks: hold E for 15 s to re-survey', title: 'BENCHMARKS', body: 'Hold E for 15 s to re-survey.', keys: ['E'] },
  { id: 'calima', beat: '0:55', text: 'Calima: Instruments see half as far', title: 'CALIMA', body: 'Instruments see half as far.', keys: [],
    when: (h) => h.ctx.environment?.weather === 'calima' },
];

/* -------------------------------------------------------------- shell lines */

/** tag: which shell surface a line belongs on. */
export const TIPS = [
  // --- combat -------------------------------------------------------------
  { tag: 'combat', text: 'Hold <kbd>RMB</kbd> to aim, <kbd>LMB</kbd> to draw. Release at full draw for the damage the shot is worth.' },
  { tag: 'combat', text: 'Hold <kbd>Shift</kbd> <em>while already aiming</em> to Steady: a held breath, and the sway goes out of the bow.' },
  { tag: 'combat', text: 'Barbed arrows Pry. An Instrument that loses a tool cannot use what the tool did.' },
  { tag: 'combat', text: 'Read the lamp first: open and bone is calm, half-shut and green is wary, a magenta pinhole is on you.' },
  { tag: 'combat', text: '<kbd>LMB</kbd> without aiming swings the lance. Light strikes chain; hold for the heavy.' },
  // --- stealth ------------------------------------------------------------
  { tag: 'stealth', text: 'Tall cover hides you while crouched. <kbd>C</kbd> toggles the stalk and it survives aiming.' },
  { tag: 'stealth', text: 'An Instrument that hears something it cannot see goes to look. Whistle with <kbd>G</kbd> and be somewhere else.' },
  { tag: 'stealth', text: 'An Undercut from behind an unaware Instrument fells the small ones outright.' },
  // --- sighting / world ---------------------------------------------------
  { tag: 'sighting', text: '<kbd>V</kbd> raises the Alidade. <kbd>T</kbd> Flags what is on the crosshair, so its bearing stays on the circle.' },
  { tag: 'sighting', text: 'Sighting names components, what they drop and the transects they walk. Read before you loose, not after.' },
  { tag: 'sighting', text: 'Field Books lie where the first surveyors left them. Every one you find is kept here.' },
  // --- survival -----------------------------------------------------------
  { tag: 'survival', text: 'Fog-water fills the gourd; hold <kbd>Q</kbd> to drink. It does not refill when you fall.' },
  { tag: 'survival', text: 'Hold <kbd>R</kbd> to make ammunition from what you carry. Juniper and salt are the cheap half.' },
  { tag: 'survival', text: 'Rest at the cistern to save, pass the hours and start the day in the light you want.' },
  // --- progression --------------------------------------------------------
  { tag: 'progression', text: 'Salt is money. Sell the lampglass and escapements you will not use to the Guild.' },
  { tag: 'progression', text: 'Track an entry in the log and its bearing shows on the circle with the distance.' },
  // --- traversal ----------------------------------------------------------
  { tag: 'traversal', text: 'Climb a trig pillar and sight two others: the triangle between the three opens on this sheet.' },
  { tag: 'traversal', text: '<kbd>Space</kbd> jumps and mantles ledges; <kbd>Ctrl</kbd> rolls. A roll is only safe in its middle.' },
  { tag: 'traversal', text: 'A fall over four metres hurts. Over nine, it kills.' },
];

const BY_TAG = TIPS.reduce((m, t) => { (m[t.tag] ||= []).push(t); return m; }, {});

/** Which tag each hub page reads from. */
export const TAB_TIP_TAG = {
  map: 'traversal',
  quests: 'progression',
  inventory: 'survival',
  crafting: 'survival',
  skills: 'progression',
  notebook: 'sighting',
  settings: 'sighting',
  title: 'combat',
  death: 'combat',
};

/** Death lines by what felled her (bible §7.4 roster), with a generic fallback. */
const DEATH_ADVICE = {
  tiller: 'A Tiller tills what it is told to. Stand off its line and it may never turn to you.',
  plumb: 'The Plumb is the one that raises the alarm. Shoot the level vial before it reads you.',
  peg: 'Pegs are nothing alone. Do not cross a live line near whatever is listening to it.',
  sickle: 'Sickles flank. Keep a wall at your back and take them as they come round it.',
  screed: 'A Screed cannot stop quickly. Lure it into a crescent wall and strike while it is stunned.',
  gauge: 'The Gauge floods on its own clock. Read the tide before you stand in its pans.',
};

export class Tips {
  constructor(ctx) {
    this.ctx = ctx;
    this._counters = Object.create(null);
  }

  get enabled() { return this.ctx.settings?.menuTips !== false; }

  /** Next line for a context, rotating so a repeat visit teaches something new. */
  pick(context = 'title') {
    const tag = TAB_TIP_TAG[context] || context;
    const list = BY_TAG[tag] || TIPS;
    const i = (this._counters[tag] = (this._counters[tag] ?? -1) + 1) % list.length;
    return list[i].text;
  }

  /** Stable line for a context: the one a screenshot gate will see twice. */
  peek(context = 'title') {
    const tag = TAB_TIP_TAG[context] || context;
    const list = BY_TAG[tag] || TIPS;
    const i = Math.max(0, this._counters[tag] ?? 0) % list.length;
    return list[i].text;
  }

  forDeath(killer) {
    const key = String(killer || '').toLowerCase().replace(/[^a-z]/g, '');
    for (const k of Object.keys(DEATH_ADVICE)) if (key.includes(k)) return DEATH_ADVICE[k];
    return this.pick('death');
  }

  audit() { return { enabled: this.enabled, tips: TIPS.length, cards: TUTORIAL_CARDS.length, counters: { ...this._counters } }; }
}
