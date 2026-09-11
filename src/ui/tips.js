/**
 * TIPS  —  lane `shell-menus`  (onboarding-loop-*, ui-18 Field Manual)
 * ===========================================================================
 * The menu-side half of teaching the game. `shell-hud` owns the in-world
 * contextual card queue (`ui-17`); this owns the lines that appear on the
 * SHELL — the title screen, each hub tab, and the death card, where a player is
 * already stopped and reading.
 *
 * Every line names a mechanic that exists in this build and the key that drives
 * it, read from the owning lane where it publishes one (`items.tools.useKey`,
 * `tools.cycleKeys`) instead of being hard-coded — a tip that prints the wrong
 * key is worse than no tip.
 *
 * Rotation is deterministic per context (index-based, not random) so a
 * screenshot gate sees the same line twice, and so a player who reopens a tab
 * to re-read something finds it still there.
 */

/** tag: which shell surface a line belongs on. */
export const TIPS = [
  // --- combat -------------------------------------------------------------
  { tag: 'combat', text: 'Hold <kbd>RMB</kbd> to aim, <kbd>LMB</kbd> to draw. Release at full draw for the damage the shot is worth.' },
  { tag: 'combat', text: 'Tap <kbd>Shift</kbd> <em>while already aiming</em> for Concentration — time slows and the reticle steadies.' },
  { tag: 'combat', text: 'Tearblast arrows rip components off a hull. A machine that loses its weapon cannot use it against you.' },
  { tag: 'combat', text: 'Every machine has a weak point in a different element. Freeze makes a hull brittle; fire cooks a Blaze canister.' },
  { tag: 'combat', text: '<kbd>LMB</kbd> without aiming swings the spear. Light taps chain; hold for the heavy that staggers.' },
  // --- stealth ------------------------------------------------------------
  { tag: 'stealth', text: 'Tall grass hides you while crouched — <kbd>C</kbd> toggles the stalk and it survives aiming.' },
  { tag: 'stealth', text: 'A machine that hears something it cannot see goes to look. Throw a rock and be somewhere else.' },
  { tag: 'stealth', text: 'A Silent Strike from behind an unaware machine kills small ones outright.' },
  // --- focus / world ------------------------------------------------------
  { tag: 'focus', text: '<kbd>V</kbd> raises the Focus. <kbd>T</kbd> tags what is under the crosshair so you can track it through cover.' },
  { tag: 'focus', text: 'Focus reveals components, loot and patrol routes. Scan before you shoot, not after.' },
  { tag: 'focus', text: 'Old-World datapoints are scattered across the valley. The Notebook keeps every one you find.' },
  // --- survival -----------------------------------------------------------
  { tag: 'survival', text: 'Medicinal herbs fill the pouch; hold <kbd>Q</kbd> to spend it. The pouch does not refill on death.' },
  { tag: 'survival', text: 'Hold <kbd>R</kbd> to craft ammunition from what you are carrying. Ridge-wood and shards are the cheap half.' },
  { tag: 'survival', text: 'Rest at the campfire to save, pass the hours, and start the hunt in the light you want.' },
  // --- progression --------------------------------------------------------
  { tag: 'progression', text: 'Every kill, datapoint and objective pays XP. Levels buy skill points; skill points buy the hunt you prefer.' },
  { tag: 'progression', text: 'Shards are currency. Sell the lenses and hearts you will never use to the camp trader.' },
  { tag: 'progression', text: 'Track a quest in the Journal and its objective shows on the compass with the distance.' },
  // --- traversal ----------------------------------------------------------
  { tag: 'traversal', text: '<kbd>Space</kbd> jumps and mantles ledges; <kbd>Ctrl</kbd> rolls. A roll is only invulnerable in its middle.' },
  { tag: 'traversal', text: 'A fall over four metres hurts. Over nine, it kills.' },
];

const BY_TAG = TIPS.reduce((m, t) => { (m[t.tag] ||= []).push(t); return m; }, {});

/** Which tag each hub tab reads from. */
export const TAB_TIP_TAG = {
  map: 'traversal',
  quests: 'progression',
  inventory: 'survival',
  crafting: 'survival',
  skills: 'progression',
  notebook: 'focus',
  settings: 'focus',
  title: 'combat',
  death: 'combat',
};

/** Death lines keyed by what killed you, with a generic fallback. */
const DEATH_ADVICE = {
  watcher: 'A Watcher’s eye is its sensor and its weak point. Break it and the alarm never goes out.',
  strider: 'Striders bolt before they fight. Rope one down or take the shot before it turns.',
  scrapper: 'Scrappers hunt in threes. Break line of sight and take them one at a time.',
  sawtooth: 'A Sawtooth commits to its lunge. Roll late, then punish the recovery.',
  longleg: 'A Longleg’s scream calls the herd. Kill the sacs on its back before it opens its mouth.',
  glinthawk: 'Glinthawks freeze from above. Bring it down with ice or tear a wing.',
  behemoth: 'A Behemoth’s cargo clamps are exposed when it charges. Everything else is armour.',
  thunderjaw: 'Tear a Disc Launcher off a Thunderjaw and it becomes your gun. That is the whole fight.',
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
    return this._resolve(list[i].text);
  }

  /** Stable line for a context — the one a screenshot gate will see twice. */
  peek(context = 'title') {
    const tag = TAB_TIP_TAG[context] || context;
    const list = BY_TAG[tag] || TIPS;
    const i = Math.max(0, this._counters[tag] ?? 0) % list.length;
    return this._resolve(list[i].text);
  }

  forDeath(killer) {
    const key = String(killer || '').toLowerCase().replace(/[^a-z]/g, '');
    for (const k of Object.keys(DEATH_ADVICE)) if (key.includes(k)) return this._resolve(DEATH_ADVICE[k]);
    return this.pick('death');
  }

  /**
   * Substitute keys the owning lane publishes, so a rebind or a lane-side
   * change never leaves a lie on screen.
   */
  _resolve(text) {
    const tools = this.ctx.items?.tools;
    if (tools) {
      const use = String(tools.useKey || 'KeyF').replace(/^Key/, '');
      const cyc = (tools.cycleKeys || []).map((c) => c.replace('BracketLeft', '[').replace('BracketRight', ']'));
      text = text.replace(/\{tool\}/g, use).replace(/\{cycle\}/g, cyc.join(' / '));
    }
    return text;
  }

  audit() { return { enabled: this.enabled, tips: TIPS.length, counters: { ...this._counters } }; }
}
