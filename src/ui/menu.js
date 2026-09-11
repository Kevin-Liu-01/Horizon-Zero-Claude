/**
 * SHELL / MENUS  —  lane `shell-menus`  (port 5215)
 * ===========================================================================
 * The frame around the game: title flow, tabbed pause hub, world map, death and
 * victory cards, settings, credits.
 *
 * Findings closed here: `ui-01` (pause was one Resume button), `ui-02` (no map),
 * `ui-13` (victory soft-locked the session, death lasted 0.7 s), `ui-18` (title
 * was a button and a keybind wall), `progression-003` (shell half: save /
 * continue / no-reload endgame), `progression-014` (title menu + difficulty),
 * `camera-feel-13` (settings-driven sensitivity / invert / FOV),
 * `audio-14` (persisted volume sliders), `missing-systems-accessibility`
 * (HUD scale, colourblind palettes, reduced motion, hold-vs-toggle),
 * `missing-systems-title-save-campfire-flow` and the shell half of
 * `onboarding-loop-title-screen` / `-death-no-stakes`.
 *
 * ---------------------------------------------------------------- ownership
 * This lane owns `src/ui/{menu,map,settings,tips}.js` and `src/style.css`. It
 * touches no other lane's file, and the three places where it has to cooperate
 * with someone else's pixels are all done through published surfaces:
 *
 *   · the hub ROUTES to the owning lane's panel — `progression.openQuestLog()`,
 *     `openSkills()`, `items.openInventory(pocket)`, `items.openNotebook()` —
 *     and keeps its own tab bar above them, so the tabs stay live while the
 *     lane's screen is up. Nothing is re-implemented here.
 *   · `shell-hud` already yields: `hud.js` returns early from its pause card,
 *     death card and victory card when `ctx.menus` exists. The CSS rule in this
 *     lane's own `style.css` (keyed on `body.hzc-menus`) is the belt to that
 *     brace — remove the install and the Round-3 shell comes back untouched.
 *   · the waypoint is published as data (`ctx.menus.waypoint` +
 *     `waypoint-set` / `waypoint-cleared`) for `shell-hud`'s compass, and
 *     drawn by this lane's own beacon ONLY while that lane has no
 *     `hud.setWaypoint` (see map.js).
 *
 * -------------------------------------------------------------- state model
 * `main.js` simulates `playing | title | dead | victory | studio`; anything else
 * freezes the world. That is the whole pause mechanism and this lane uses it as
 * published:
 *
 *   'paused'      the hub (the same value the Round-3 HUD used, so its own
 *                 Escape handler stays consistent with ours)
 *   'death-menu'  the death card. NOT 'dead' — and that is load-bearing:
 *                 `player._die()` schedules a 3.2 s `setTimeout` respawn that
 *                 begins `if (this.ctx.state !== 'dead') return;`. Parking the
 *                 state elsewhere is what turns the auto-respawn into a CHOICE
 *                 (`A69-death-choice`) without editing player.js.
 *   'victory'     kept for exactly 3 s, then handed back to 'playing'
 *                 (`A68-no-softlock`).
 *
 * ------------------------------------------------------------------- input
 * Every menu key is read in the WINDOW CAPTURE phase, before `input.js`'s own
 * window listener, and consumed with `stopImmediatePropagation()` when this
 * lane acts on it. Two reasons: `input.enabled` is false on the title screen
 * (so `input.onDown` cannot see the "press any key"), and `KeyI` / `KeyJ` /
 * `KeyK` already have owners whose handlers would toggle the panel back shut
 * the moment the hub opened it.
 */

import { SettingsStore, SettingsPanel } from './settings.js';
import { WorldMap, WaypointBeacon } from './map.js';
import { Tips } from './tips.js';

const el = (tag, cls, parent, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  if (parent) parent.appendChild(n);
  return n;
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Hub tabs. `open` delegates to the owning lane; absent = rendered here. */
const TABS = [
  { id: 'map', key: 'KeyM', hint: 'M', label: 'MAP' },
  { id: 'quests', key: 'KeyJ', hint: 'J', label: 'QUESTS',
    open: (ctx) => ctx.progression?.openQuestLog?.() },
  { id: 'inventory', key: 'KeyI', hint: 'I', label: 'INVENTORY',
    open: (ctx) => ctx.items?.openInventory?.('resources') },
  { id: 'crafting', key: 'KeyO', hint: 'O', label: 'CRAFTING',
    open: (ctx) => ctx.items?.openInventory?.('crafting') },
  { id: 'skills', key: 'KeyK', hint: 'K', label: 'SKILLS',
    open: (ctx) => ctx.progression?.openSkills?.() },
  { id: 'notebook', key: 'KeyN', hint: 'N', label: 'NOTEBOOK',
    open: (ctx) => ctx.items?.openNotebook?.() },
  { id: 'settings', key: 'Comma', hint: ',', label: 'SETTINGS' },
];
const TAB_BY_ID = new Map(TABS.map((t) => [t.id, t]));
const TAB_BY_KEY = new Map(TABS.map((t) => [t.key, t]));

/** States another lane's panel parks on — the hub stays open behind them. */
const PANEL_STATES = ['quests', 'dialogue', 'trade', 'campfire', 'skills', 'inventory'];

const DEATH_HOLD_S = 1.15;    // let the crumple play before the card takes over
const VICTORY_S = 3.0;        // ui-13: banner, then the valley is yours again
const GRAY_RAMP_S = 1.6;
const CAMP = { x: 18, z: 26 };
const START_ANG = 3.7;        // title dolly: the sector that frames best (see _dolly)

/**
 * Credits rows. Provenance is copied from the manifests that are the source of
 * truth — `models-staging/MANIFEST.md`, `public/audio/MANIFEST.md`,
 * `public/anims/LICENSE` and README.md's own Credits section. Nothing here is
 * invented: a row exists only if one of those backs it.
 */
const CREDITS = [
  { head: 'HORIZON ZERO CLAUDE', rows: [
    ['An unaffiliated homage', 'Horizon Zero Dawn is © Guerrilla Games / Sony Interactive Entertainment'],
    ['Built with', 'Claude Code — agent fleets, literal gates and film loops'],
  ] },
  { head: 'ENGINE', rows: [
    ['three.js r169', 'MIT'],
    ['three-mesh-bvh', 'MIT — collision, navigation and hit hulls'],
    ['Vite', 'MIT'],
  ] },
  { head: 'MACHINE MODELS  ·  CC-BY 3.0', rows: [
    ['“Mechanical Horse” — jake young', 'poly.pizza/m/d4bayjeM1aD  ·  Strider donor'],
    ['“Robocat” — Jordan Hill', 'poly.pizza/m/d78wyEWCmTC  ·  Scrapper donor'],
    ['“Velocirobot” — Hoai Nguyen', 'poly.pizza/m/4XsUYx8ON1T  ·  Watcher / Sawtooth donor'],
    ['“MechQuadruped” — 3Donimus', 'poly.pizza/m/5x1hRpbmdfo  ·  Behemoth donor'],
  ] },
  { head: 'MACHINE MODELS  ·  CC0 1.0', rows: [
    ['“Robot Enemy Flying”, Animated Mech, Ultimate Monsters — Quaternius', 'quaternius.com  ·  Glinthawk, Longleg, Thunderjaw donors'],
    ['Fox — PixelMannen, tomkranis, @AsoboStudio, @scurest', 'Khronos glTF-Sample-Assets  ·  CC0 model, CC-BY 4.0 rig / conversion  ·  rig-pipeline reference'],
  ] },
  { head: 'ANIMATION', rows: [
    ['AnimationLibrary_Godot_Standard — 46 clips', 'CC0 1.0  ·  public/anims/LICENSE  ·  retargeted onto Aloy at boot'],
  ] },
  { head: 'AUDIO  ·  CC0 1.0', rows: [
    // counted live: the bank grew from 58 sets to 95 between two waves and a
    // hard-coded number in a credits screen is a licence claim that goes stale.
    [() => {
      const n = window.__CTX__?.audio?.bank?.size;
      return n ? `${n} cues loaded, synthesized by this repository` : 'Synthesized by this repository';
    }, 'public/audio/MANIFEST.md  ·  tools/audio-bank.mjs + audio-recipes.js'],
    ['No third-party audio is bundled', 'no attribution, share-alike or non-commercial obligation in the tree'],
  ] },
  { head: 'TYPEFACES  ·  SIL OPEN FONT LICENSE', rows: [
    ['Julius Sans One — LatinoType', 'wordmark and display'],
    ['Michroma · Orbitron · Rajdhani · Chakra Petch', 'interface, stingers, Focus'],
  ] },
  { head: 'CHARACTER & MACHINE SCULPTS (ROUND 1)', rows: [
    ['Sketchfab fan-art rigs — Aloy, Watcher, Sawtooth, Thunderjaw, Behemoth', 'used as fan-art in a non-commercial tech demo — see README.md “Credits”'],
  ] },
];

/* ========================================================================= */

export class Menus {
  constructor(ctx) {
    this.ctx = ctx;
    ctx.menus = this;

    this.settings = new SettingsStore(ctx);
    this.tips = new Tips(ctx);
    this.map = new WorldMap(ctx, this);
    this.settingsPanel = new SettingsPanel(ctx, this.settings);
    this.beacon = new WaypointBeacon(ctx, this.map);

    this.hubOpen = false;
    this.tab = 'map';
    this.delegated = null;      // tab whose owning lane currently has the screen
    this.modal = null;          // 'credits' | 'manual' | 'difficulty' | 'settings'
    this.titleStage = 'idle';   // 'press' -> 'dolly' -> 'menu'
    this.deathState = null;     // 'ramp' | 'choice' | null
    this.deathKiller = null;
    this.gray = 0;
    this.grayPeak = 0;
    this._deathT = 0;
    this._victoryT = -1;
    this._titleT = 0;
    this._dollyT = 0;
    this._lastState = ctx.state;
    this._log = [];             // audit trail for gates

    this._build();
    this._bindKeys();
    this._bindEvents();
    document.body.classList.add('hzc-menus');

    // presentation loop: must run while the simulation is frozen
    this._raf = (now) => {
      try { this._present(now); } catch (err) { console.warn('[menus] present:', err?.message || err); }
      this._rafId = requestAnimationFrame(this._raf);
    };
    this._rafLast = performance.now();
    this._rafId = requestAnimationFrame(this._raf);

    if (ctx.state === 'title') this._enterTitle();
  }

  /* ===================================================================== */
  /* DOM                                                                   */
  /* ===================================================================== */

  _build() {
    this.root = el('div', 'hzc-menus-root', document.body);
    this.root.id = 'hzc-menus';

    /* ---- hub ---- */
    this.hub = el('div', 'mn-hub', this.root);
    el('div', 'mn-hub-scrim', this.hub);
    const shell = el('div', 'mn-hub-shell', this.hub);

    const head = el('header', 'mn-hub-head', shell);
    const brand = el('div', 'mn-hub-brand', head);
    el('div', 'mn-hub-kicker', brand, 'HORIZON ZERO CLAUDE');
    this._hubTitle = el('div', 'mn-hub-title', brand, 'MAP');
    this._tabsEl = el('nav', 'mn-tabs', head);
    this._tabBtns = new Map();
    for (const t of TABS) {
      const b = el('button', 'mn-tab', this._tabsEl, `<span>${t.label}</span><kbd>${t.hint}</kbd>`);
      b.dataset.tab = t.id;
      b.addEventListener('click', () => this.setTab(t.id));
      this._tabBtns.set(t.id, b);
    }
    this._hubStatus = el('div', 'mn-hub-status', head);

    this.hubBody = el('div', 'mn-hub-body', shell);

    const foot = el('footer', 'mn-hub-foot', shell);
    this._tipEl = el('div', 'mn-tip', foot);
    const acts = el('div', 'mn-hub-acts', foot);
    this._mkBtn(acts, 'SAVE', () => this.saveGame(), 'small');
    this._mkBtn(acts, 'CREDITS', () => this.openModal('credits'), 'small');
    this._mkBtn(acts, 'FIELD MANUAL', () => this.openModal('manual'), 'small');
    this._mkBtn(acts, 'QUIT TO TITLE', () => this.quitToTitle(), 'small danger');
    this._mkBtn(acts, 'RESUME', () => this.closeHub(), 'small primary');

    /* ---- death ---- */
    this.deathEl = el('div', 'mn-death', this.root);
    const dInner = el('div', 'mn-death-inner', this.deathEl);
    el('div', 'mn-death-kicker', dInner, 'THE VALLEY TAKES ITS OWN');
    el('div', 'mn-death-title', dInner, 'YOU DIED');
    this._deathKillerEl = el('div', 'mn-death-killer', dInner);
    el('div', 'mn-death-rule', dInner);
    this._deathTip = el('div', 'mn-death-tip', dInner);
    this._deathOpts = el('div', 'mn-death-opts', dInner);

    /* ---- victory ---- */
    this.victoryEl = el('div', 'mn-victory', this.root);
    const vInner = el('div', 'mn-victory-inner', this.victoryEl);
    el('div', 'mn-victory-kicker', vInner, 'QUEST COMPLETE');
    el('div', 'mn-victory-title', vInner, 'VALLEY RECLAIMED');
    el('div', 'mn-death-rule', vInner);
    el('div', 'mn-victory-sub', vInner, 'THE HUNT GOES ON — RETURNING YOU TO THE VALLEY');
    this._victoryBar = el('div', 'mn-victory-bar', vInner);
    this._victoryFill = el('i', null, this._victoryBar);

    /* ---- modal (credits / manual / difficulty / settings) ---- */
    this.modalEl = el('div', 'mn-modal', this.root);
    const mShell = el('div', 'mn-modal-shell', this.modalEl);
    const mHead = el('header', 'mn-modal-head', mShell);
    this._modalTitle = el('div', 'mn-modal-title', mHead, 'CREDITS');
    const mClose = el('button', 'mn-x', mHead, '✕');
    mClose.addEventListener('click', () => this.closeModal());
    this.modalBody = el('div', 'mn-modal-body', mShell);
    this.modalEl.addEventListener('mousedown', (e) => { if (e.target === this.modalEl) this.closeModal(); });
  }

  _mkBtn(parent, label, fn, cls = '') {
    const b = el('button', `mn-btn ${cls}`.trim(), parent, label);
    b.addEventListener('click', (e) => { e.preventDefault(); this._emit('ui-confirm', { label }); fn(); });
    return b;
  }

  /* ===================================================================== */
  /* title flow  (ui-18, onboarding-loop-title-screen)                      */
  /* ===================================================================== */

  _enterTitle() {
    const host = document.querySelector('#title .title-inner');
    if (!host) return;
    if (this._titleBuilt) { this._refreshTitle(); return; }
    this._titleBuilt = true;
    document.body.classList.add('hzc-title-live');

    // ONE logo (V38): the wordmark that already lives in index.html is kept and
    // everything else is rebuilt around it. The keybind wall moves wholesale
    // into the Field Manual modal — nothing is deleted — and #btn-start stays in
    // the DOM because main.js binds a click listener to it after we run.
    const wall = host.querySelector('.keybinds-panel');
    if (wall) { wall.remove(); this._manualNode = wall; }
    document.getElementById('btn-start')?.classList.add('mn-hidden');

    this.titleEl = el('div', 'mn-title', host);
    this._pressEl = el('div', 'mn-title-press', this.titleEl, '<span>PRESS ANY KEY</span>');
    this.titleMenu = el('nav', 'mn-title-menu', this.titleEl);
    this._titleTip = el('div', 'mn-title-tip', this.titleEl);
    this._titleSave = el('div', 'mn-title-save', this.titleEl);

    this._refreshTitle();
    this.titleStage = 'press';
    this._titleT = 0;
    this._dollyT = 0;
  }

  _refreshTitle() {
    if (!this.titleMenu) return;
    this.titleMenu.innerHTML = '';
    const prog = this.ctx.progression;
    const info = prog?.hasSave?.() ? prog.saveInfo?.() : null;
    const items = [
      { label: 'CONTINUE', disabled: !info, fn: () => this.continueGame() },
      { label: 'NEW GAME', fn: () => this.openModal('difficulty') },
      { label: 'SETTINGS', fn: () => this.openModal('settings') },
      { label: 'FIELD MANUAL', fn: () => this.openModal('manual') },
      { label: 'CREDITS', fn: () => this.openModal('credits') },
    ];
    for (const it of items) {
      const b = el('button', `mn-title-item${it.disabled ? ' disabled' : ''}`, this.titleMenu, it.label);
      if (it.disabled) b.disabled = true;
      else b.addEventListener('click', () => { this._emit('ui-confirm', { label: it.label }); it.fn(); });
    }
    this._titleSave.textContent = info
      ? `LAST SAVE · LEVEL ${info.level ?? 1} · ${String(info.quest || 'THE VALLEY').toUpperCase()}`
      : 'NO SAVED HUNT — START A NEW ONE';
    if (this._titleTip) this._titleTip.innerHTML = this.tips.peek('title');
  }

  /** Any key (or click) on the title starts the dolly and reveals the menu. */
  _titleAdvance() {
    if (this.titleStage !== 'press') return false;
    this.titleStage = 'dolly';
    this._titleT = 0;
    this.titleEl?.classList.add('lit');
    this._emit('ui-open', { screen: 'title-menu' });
    return true;
  }

  /**
   * The scripted aerial dolly. Runs in `update()` because 'title' is one of the
   * live states, and writes the camera LAST in the frame (this system is
   * appended to `game.systems` after `Player`), so the chase camera does not
   * fight it. Pure trigonometry on the existing camera — no allocation per
   * frame, nothing added to the scene.
   *
   * FRAMING IS THE WHOLE SHOT (V38, judged on film). The first cut put the
   * camera 118 m up and aimed it at a point 12 m above the camp: a 27° stare
   * straight down that pushed the horizon and the entire sky out of frame, so
   * the title read as a muddy top-down diorama with a menu on it. A landscape
   * needs a horizon, so the pitch is the authored quantity here, not the look
   * target — hold it at 8.5–12° and the horizon lands a third of the way down
   * the frame, with sky behind the wordmark and the valley under the menu. The
   * look point is then derived from the pitch (`lookY = camY - reach·tan θ`)
   * instead of the other way round, which is what keeps the composition steady
   * while the height, the radius and the terrain under the camera all change.
   */
  _dolly(dt) {
    const cam = this.ctx.camera;
    const terrain = this.ctx.terrain;
    if (!cam) return;
    this._dollyT += dt;
    const t = this._dollyT;

    // the menu fades in 1.1 s into the move, so the vista is already travelling
    // when the buttons arrive
    if (this.titleStage === 'dolly' && t > 1.1) {
      this.titleStage = 'menu';
      this.titleEl?.classList.add('menu-in');
    }

    // a slow arc over the valley that descends toward the camp once a key is hit
    const closing = this.titleStage === 'press' ? 0 : clamp(t / 9, 0, 1);
    const ease = closing * closing * (3 - 2 * closing);
    // START_ANG is a composition choice, not a default: filmed at eight points
    // around the ring, this is the sector that puts the Tallneck's silhouette
    // on the right third, sky in the rim's notches above the wordmark, and
    // Mother's Watch under the menu column.
    const ang = START_ANG + t * 0.026 + ease * 0.09;
    const radius = 150 - ease * 34;
    const cx = CAMP.x + Math.sin(ang) * radius;
    const cz = CAMP.z + Math.cos(ang) * radius;
    const ground = terrain?.getHeight ? terrain.getHeight(cx, cz) : 0;
    /**
     * ALTITUDE, measured from the ground the camera is actually over so the arc
     * keeps its height as it crosses the hills — and kept LOW on purpose.
     * Filmed at 118 m and at 105 m the valley reads as a beige contour map:
     * everything the world lanes built (autumn meadow, tree silhouettes, the
     * palisade, the campfire smoke) is below the resolution of the shot and the
     * only things left are haze and the rim. At ~30 m the same frame has a
     * foreground, Mother's Watch is a legible subject, and the rim ring becomes
     * a backdrop instead of the subject. Sky is what the bowl cannot give from
     * the inside — a 150–350 m rim at 400 m is 25–40° tall from anywhere in
     * here — so the composition spends its top band on the rim's notches rather
     * than pretending to a horizon it does not have.
     */
    const camY = ground + 32 - ease * 7;
    cam.position.set(cx, camY, cz);
    // 6° of tilt: meadow under the menu, camp on the third, rim behind the logo
    const pitch = (6 + ease * 2.5) * (Math.PI / 180);
    const reach = radius * 1.05;
    cam.lookAt(CAMP.x, camY - reach * Math.tan(pitch), CAMP.z);
    cam.updateMatrixWorld();
  }

  continueGame() {
    const prog = this.ctx.progression;
    this._startGame();
    const res = prog?.continueGame?.();
    this._log.push({ what: 'continue', ok: !!res?.ok });
    return res;
  }

  newGame(difficulty) {
    this.ctx.progression?.newGame?.(difficulty);
    this.map.fog.clear();
    this.map.clearWaypoint();
    this._startGame();
    this._log.push({ what: 'new-game', difficulty: difficulty || null });
  }

  /** Hand off to main.js's own start path so nothing about it is duplicated. */
  _startGame() {
    this.closeModal();
    document.body.classList.remove('hzc-title-live');
    const btn = document.getElementById('btn-start');
    if (btn) btn.click();
    else this.ctx.game?.start?.(!this.ctx.params?.has?.('shot'));
    this.titleStage = 'idle';
  }

  quitToTitle() {
    const ctx = this.ctx;
    this.closeHub(true);
    this._hideDeath();
    this.closeModal();
    ctx.input?.exitPointerLock?.();
    // a corpse must not be what "Continue" resumes into
    const p = ctx.player;
    if (p && p.health <= 0) { p.health = p.maxHealth; p.position.set(CAMP.x, 0, CAMP.z); p._snapToGround?.(); }
    document.getElementById('hud')?.classList.add('hidden');
    document.getElementById('title')?.classList.remove('hidden');
    ctx.state = 'title';
    this._titleBuilt = false;
    this._enterTitle();
    this._emit('ui-back', { screen: 'title' });
    this._log.push({ what: 'quit-to-title' });
  }

  /* ===================================================================== */
  /* pause hub  (ui-01)                                                    */
  /* ===================================================================== */

  openHub(tab = this.tab) {
    const ctx = this.ctx;
    if (this.hubOpen) { this.setTab(tab); return true; }
    if (ctx.state !== 'playing' && ctx.state !== 'paused' && !PANEL_STATES.includes(ctx.state)) return false;
    this.hubOpen = true;
    ctx.state = 'paused';
    ctx.input?.exitPointerLock?.();
    this.hub.classList.add('show');
    document.body.classList.add('hzc-hub-open');
    this.setTab(tab, true);
    this._emit('ui-open', { screen: 'hub', tab: this.tab });
    return true;
  }

  closeHub(silent = false) {
    if (!this.hubOpen) return false;
    const ctx = this.ctx;
    this.hubOpen = false;
    this._closeDelegated();
    this.hub.classList.remove('show');
    this.hub.classList.remove('delegated');
    document.body.classList.remove('hzc-hub-open');
    this._clearBody();
    if (ctx.state === 'paused' || PANEL_STATES.includes(ctx.state)) ctx.state = 'playing';
    if (!silent) {
      this._emit('ui-close', { screen: 'hub' });
      if (!ctx.params?.has?.('shot')) ctx.input?.requestPointerLock?.();
    }
    return true;
  }

  toggleHub() { return this.hubOpen ? this.closeHub() : this.openHub(); }

  setTab(id, force = false) {
    const tab = TAB_BY_ID.get(id);
    if (!tab) return false;
    if (!this.hubOpen) { this.openHub(id); return true; }
    if (this.tab === id && !force && this.delegated === id) return true;

    this.tab = id;
    for (const [tid, b] of this._tabBtns) b.classList.toggle('on', tid === id);
    this._hubTitle.textContent = tab.label;
    if (this.settings.get('menuTips')) this._tipEl.innerHTML = this.tips.pick(id);
    else this._tipEl.textContent = '';

    if (this.delegated && this.delegated !== id) this._closeDelegated();
    this._clearBody();

    if (tab.open) {
      // The owning lane's panel refuses to open unless ctx.state is 'playing'
      // (or one of its own). Hand the state over for exactly one synchronous
      // call — no frame runs in between — and take it back if the lane declines.
      const prev = this.ctx.state;
      this.ctx.state = 'playing';
      let ok = false;
      try { ok = tab.open(this.ctx) !== false; }
      catch (err) { console.warn(`[menus] ${id} panel:`, err?.message || err); }
      if (PANEL_STATES.includes(this.ctx.state)) {
        this.delegated = id;
        this.hub.classList.add('delegated');
        this.ctx.input?.exitPointerLock?.();
      } else {
        this.ctx.state = prev === 'playing' ? 'paused' : prev;
        this.hub.classList.remove('delegated');
        this._placeholder(tab, ok);
      }
    } else {
      this.hub.classList.remove('delegated');
      if (id === 'map') this.map.mount(this.hubBody);
      else if (id === 'settings') this.settingsPanel.mount(this.hubBody);
    }
    this._paintStatus();
    this._emit('ui-nav', { tab: id });
    return true;
  }

  _placeholder(tab, tried) {
    el('div', 'mn-empty', this.hubBody,
      `<b>${tab.label}</b><span>${tried
        ? 'This screen belongs to a system that has not finished loading.'
        : 'This screen is not available in this session.'}</span>`);
  }

  _clearBody() {
    if (this.settingsPanel.root?.parentNode === this.hubBody) this.settingsPanel.dispose();
    if (this.map.root?.parentNode === this.hubBody) this.map.unmount();
    this.hubBody.innerHTML = '';
  }

  /** Close whichever lane panel we opened, without disturbing the hub. */
  _closeDelegated() {
    if (!this.delegated) return;
    const ctx = this.ctx;
    this.delegated = null;
    try {
      if (ctx.state === 'inventory') ctx.items?.screen?.close?.();
      else if (ctx.state === 'skills') ctx.progression?.skillsUI?.close?.();
      else if (PANEL_STATES.includes(ctx.state)) ctx.progression?.ui?.close?.();
    } catch (err) { console.warn('[menus] close panel:', err?.message || err); }
    this.hub.classList.remove('delegated');
    if (this.hubOpen && ctx.state === 'playing') ctx.state = 'paused';
  }

  /**
   * A lane panel closed itself (Escape, click-outside, its own key). It sets
   * `ctx.state = 'playing'` and asks for pointer lock on the way out — if the
   * hub is still up, take both back and show the map again.
   */
  _afterPanelClosed() {
    if (!this.hubOpen) return;
    const ctx = this.ctx;
    if (PANEL_STATES.includes(ctx.state)) return;   // moved to another panel
    this.delegated = null;
    this.hub.classList.remove('delegated');
    if (ctx.state === 'playing') ctx.state = 'paused';
    ctx.input?.exitPointerLock?.();
    if (TAB_BY_ID.get(this.tab)?.open) this.setTab('map', true);
  }

  _paintStatus() {
    if (!this._hubStatus) return;
    const prog = this.ctx.progression;
    const p = this.ctx.player;
    const bits = [];
    if (prog) bits.push(`<b>LVL ${prog.level}</b>`, `${prog.skillPoints} SP`);
    if (p) bits.push(`${Math.round(p.health)}/${Math.round(p.maxHealth)} HP`);
    const shards = this.ctx.inventory?.count?.('metal-shards');
    if (shards != null) bits.push(`${shards} SHARDS`);
    this._hubStatus.innerHTML = bits.join('<i>·</i>');
  }

  saveGame() {
    const res = this.ctx.progression?.save?.('menu');
    this._emit('ui-confirm', { label: 'SAVE' });
    this._log.push({ what: 'save', ok: !!res });
    this._refreshTitle();
    return res;
  }

  /* ===================================================================== */
  /* modals                                                                */
  /* ===================================================================== */

  openModal(kind) {
    this.modal = kind;
    this.modalBody.innerHTML = '';
    this.modalEl.classList.add('show');
    if (kind === 'credits') {
      this._modalTitle.textContent = 'CREDITS';
      for (const sec of CREDITS) {
        const s = el('section', 'mn-cred-sec', this.modalBody);
        el('h4', null, s, sec.head);
        for (const [a, b] of sec.rows) {
          const r = el('div', 'mn-cred-row', s);
          el('span', 'mn-cred-a', r, typeof a === 'function' ? a() : a);
          el('span', 'mn-cred-b', r, typeof b === 'function' ? b() : b);
        }
      }
      el('div', 'mn-set-note', this.modalBody,
        'Full manifests: <code>models-staging/MANIFEST.md</code> · <code>public/audio/MANIFEST.md</code> · <code>public/anims/LICENSE</code>');
    } else if (kind === 'manual') {
      this._modalTitle.textContent = 'FIELD MANUAL';
      if (this._manualNode) this.modalBody.appendChild(this._manualNode);
      else el('div', 'mn-empty', this.modalBody, '<b>FIELD MANUAL</b><span>Controls are listed on the title screen.</span>');
    } else if (kind === 'settings') {
      this._modalTitle.textContent = 'SETTINGS';
      this.settingsPanel.mount(this.modalBody);
    } else if (kind === 'difficulty') {
      this._modalTitle.textContent = 'NEW GAME';
      const list = this.ctx.progression?.DIFFICULTIES || [{ id: 'normal', name: 'Normal' }];
      el('p', 'mn-modal-lead', this.modalBody,
        'Difficulty scales the damage you take and deal, the loot machines drop and how fast they notice you. It can be changed later.');
      for (const d of list) {
        const row = el('button', 'mn-diff', this.modalBody);
        el('b', null, row, String(d.name).toUpperCase());
        el('span', null, row,
          `DAMAGE TAKEN ×${(d.damageIn ?? 1).toFixed(2)} · DAMAGE DEALT ×${(d.damageOut ?? 1).toFixed(2)} · XP ×${(d.xp ?? 1).toFixed(2)}`);
        row.addEventListener('click', () => this.newGame(d.id));
      }
    }
    this._emit('ui-open', { screen: kind });
    return true;
  }

  closeModal() {
    if (!this.modal) return false;
    // the manual node is on loan from the title screen — keep it alive
    if (this.modal === 'manual' && this._manualNode?.parentNode === this.modalBody) {
      this.modalBody.removeChild(this._manualNode);
    }
    if (this.modal === 'settings' && this.settingsPanel.root?.parentNode === this.modalBody) {
      this.settingsPanel.dispose();
    }
    this.modal = null;
    this.modalEl.classList.remove('show');
    this.modalBody.innerHTML = '';
    this._emit('ui-back', {});
    return true;
  }

  /* ===================================================================== */
  /* death  (ui-13, onboarding-loop-death-no-stakes, progression-019)       */
  /* ===================================================================== */

  _onDeath() {
    if (this.deathState) return;
    if (this._victoryT >= 0) return;          // victory owns the screen
    this.deathState = 'ramp';
    this._deathT = 0;
    this.gray = 0;
    this.grayPeak = 0;
    this.deathKiller = this.ctx.progression?.lastKiller ?? this._lastDamageFrom ?? null;
    this.closeModal();
    if (this.hubOpen) this.closeHub(true);
    document.body.classList.add('hzc-dead');
    this._log.push({ what: 'death', killer: this.deathKiller });
  }

  _showDeathChoice() {
    if (this.deathState === 'choice') return;
    this.deathState = 'choice';
    const ctx = this.ctx;
    // Park OFF 'dead' so player._die()'s 3.2 s auto-respawn returns early: the
    // player chooses when to come back (A69), and the world stops simulating
    // under the card.
    if (ctx.state === 'dead') ctx.state = 'death-menu';
    ctx.input?.exitPointerLock?.();

    const killer = this.deathKiller ?? ctx.progression?.lastKiller ?? this._lastDamageFrom ?? null;
    this.deathKiller = killer;
    this._deathKillerEl.innerHTML = killer
      ? `KILLED BY <b>${String(killer).toUpperCase()}</b>`
      : 'THE VALLEY CLAIMED YOU';
    this._deathTip.innerHTML = this.tips.forDeath(killer);

    const prog = ctx.progression;
    const info = prog?.hasSave?.() ? prog.saveInfo?.() : null;
    this._deathOpts.innerHTML = '';
    const opts = [
      { label: 'RELOAD CHECKPOINT',
        sub: info ? `LEVEL ${info.level ?? 1} · ${String(info.reason || 'checkpoint').toUpperCase()}` : 'NO SAVE — RESPAWN AT CAMP',
        fn: () => this.respawn('checkpoint') },
      { label: 'RESPAWN AT CAMP', sub: 'KEEP CHECKPOINT PROGRESS · START AT MOTHER’S WATCH',
        fn: () => this.respawn('camp') },
      { label: 'QUIT TO TITLE', sub: 'THE HUNT WAITS', fn: () => this.quitToTitle() },
    ];
    for (const o of opts) {
      const b = el('button', 'mn-death-opt', this._deathOpts);
      el('b', null, b, o.label);
      el('span', null, b, o.sub);
      b.addEventListener('click', () => { this._emit('ui-confirm', { label: o.label }); o.fn(); });
    }
    this.deathEl.classList.add('show');
    this._emit('ui-open', { screen: 'death', killer });
  }

  /**
   * `mode`:
   *   'checkpoint' — emit `player-respawn`; `progression` restores the
   *                  checkpoint it wrote (position, health, pouch, inventory).
   *   'camp'       — the same, then move her to camp on the next microtask so
   *                  the restore does not put her back where she died.
   *
   * THE CORPSE THAT WALKED (found on film, `shots/sm-a69.png` probe). Health is
   * set to full BEFORE the emit, and then `progression`'s `player-respawn`
   * handler restores the checkpoint — including `health` — over the top of it.
   * A checkpoint written while the player was already down (`machine-respawned`
   * writes one on its own schedule) therefore restores 0 HP, and the death card
   * hands back a player at zero who can never die again because nothing
   * re-enters `_die()` until the next damage tick. The restore is correct to
   * own health in general (respawning at the 40 HP you saved with is the
   * point), so the guard is narrow: only a non-positive restore is overridden,
   * and only on the frame after the restore has run.
   */
  respawn(mode = 'checkpoint') {
    const ctx = this.ctx;
    const p = ctx.player;
    this._hideDeath();
    ctx.state = 'playing';
    if (p) {
      p.health = p.maxHealth;
      p.velocity?.set?.(0, 0, 0);
      if (mode === 'camp') { p.position.set(CAMP.x, 0, CAMP.z); p._snapToGround?.(); }
    }
    ctx.events?.emit?.('player-respawn', { source: 'menus', mode });
    if (p) {
      queueMicrotask(() => {
        if (mode === 'camp') { p.position.set(CAMP.x, 0, CAMP.z); p._snapToGround?.(); }
        if (!(p.health > 0)) {
          p.health = p.maxHealth;
          ctx.events?.emit?.('player-hurt', { health: p.health, max: p.maxHealth });
        }
      });
    }
    if (!ctx.params?.has?.('shot')) ctx.input?.requestPointerLock?.();
    this._log.push({ what: 'respawn', mode });
    return true;
  }

  _hideDeath() {
    this.deathState = null;
    this.deathEl.classList.remove('show');
    document.body.classList.remove('hzc-dead');
    this.gray = 0;
    this._applyGray(0);
  }

  _applyGray(k) {
    const canvas = this.ctx.renderer?.domElement;
    if (!canvas) return;
    if (k <= 0.001) { canvas.style.filter = ''; return; }
    canvas.style.filter =
      `grayscale(${k.toFixed(3)}) brightness(${(1 - 0.35 * k).toFixed(3)}) contrast(${(1 + 0.12 * k).toFixed(3)})`;
  }

  /* ===================================================================== */
  /* victory  (ui-13 / A68)                                                */
  /* ===================================================================== */

  _onVictory() {
    if (this._victoryT >= 0) return;
    this._victoryT = 0;
    this.closeModal();
    if (this.hubOpen) this.closeHub(true);
    this._hideDeath();
    this.victoryEl.classList.add('show');
    this.ctx.input?.exitPointerLock?.();
    this._emit('ui-open', { screen: 'victory' });
    this._log.push({ what: 'victory' });
  }

  _resumeFromVictory() {
    const ctx = this.ctx;
    this._victoryT = -1;
    this.victoryEl.classList.remove('show');
    /**
     * The Round-3 HUD latches `_victoryShown` and re-asserts `state='victory'`
     * from its own `player-respawn` guard, so leaving the latch set turns the
     * NEXT death into the same soft-lock. `progression._resumeAfterVictory()`
     * does this cleanup only while `ctx.menus` is absent — it is ours now.
     */
    try {
      const hudRoot = ctx.hud?.rootEl ?? document.getElementById('hud');
      hudRoot?.classList?.remove('endgame');
      hudRoot?.querySelectorAll?.('.show').forEach((n) => {
        if (/victory|death/i.test(n.className)) n.classList.remove('show');
      });
      if (ctx.hud && ctx.hud._victoryShown) ctx.hud._victoryShown = false;
    } catch { /* the HUD moved on */ }
    if (ctx.state === 'victory') ctx.state = 'playing';
    if (!ctx.params?.has?.('shot')) ctx.input?.requestPointerLock?.();
    // progression emits `victory-resume` from its own 3.2 s timer; only speak
    // for it when that lane is absent, so nobody hears the event twice.
    if (!ctx.progression) this._emit('victory-resume', {});
    this._emit('ui-close', { screen: 'victory' });
    this._log.push({ what: 'victory-resume' });
  }

  /* ===================================================================== */
  /* input                                                                 */
  /* ===================================================================== */

  _bindKeys() {
    this._onKey = (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const ctx = this.ctx;
      const code = e.code;

      // --- title: any key advances, then the menu owns navigation ---
      if (ctx.state === 'title') {
        if (this.modal) {
          if (code === 'Escape') { this.closeModal(); this._consume(e); }
          return;
        }
        if (this.titleStage === 'press') {
          if (this._titleAdvance()) this._consume(e);
          return;
        }
        if (code === 'Enter' || code === 'Space') {
          const first = this.titleMenu?.querySelector('.mn-title-item:not(.disabled)');
          if (first) { first.click(); this._consume(e); }
        }
        return;
      }

      // --- death card: only its own buttons ---
      if (this.deathState === 'choice') {
        if (code === 'Escape') this._consume(e);
        return;
      }

      if (this.modal) {
        if (code === 'Escape') { this.closeModal(); this._consume(e); }
        return;
      }

      if (code === 'Escape') {
        // A lane panel is up: let ITS handler close it, then re-park the hub.
        if (this.hubOpen && this.delegated) return;
        if (this.hubOpen) { this.closeHub(); this._consume(e); return; }
        if (ctx.state === 'playing' || ctx.state === 'paused') {
          this.openHub();
          this._consume(e);
        }
        return;
      }

      const tab = TAB_BY_KEY.get(code);
      if (!tab) return;
      if (this.hubOpen) {
        // second press on the tab that is already showing = back to the map
        if (this.tab === tab.id && this.delegated === tab.id) this.setTab('map', true);
        else this.setTab(tab.id);
        this._consume(e);
        return;
      }
      // M opens the hub straight onto the map from play; the other keys belong
      // to their own lanes while the hub is closed.
      if (tab.id === 'map' && ctx.state === 'playing') {
        this.openHub('map');
        this._consume(e);
      }
    };
    window.addEventListener('keydown', this._onKey, true);

    /**
     * HOLD-VS-TOGGLE, the half of it this lane can honestly deliver.
     *
     * `player.js` binds `KeyC` down → `toggleCrouch()` and never looks at the
     * key again, so crouch is a toggle and the accessibility finding's "hold"
     * option would have been a dead radio button. This lane cannot edit
     * player.js — but `setCrouch(v)` is published, so HOLD is one keyup away:
     * the down edge still toggles her in through the owning lane's own path,
     * and this releases her on the up edge. Nothing is intercepted and nothing
     * is duplicated; in TOGGLE mode (the default) this listener does nothing at
     * all. Aim and sprint cannot be done this way — both are read as raw
     * `isDown` state inside player.js's update — and stay marked STORED in the
     * panel until `player-control` reads `settings.holdAim` / `holdSprint`
     * (docs/ROUND4-SHELL-MENUS.md §Requests).
     */
    this._onKeyUp = (e) => {
      if (e.code !== 'KeyC') return;
      const ctx = this.ctx;
      if (this.settings.get('holdCrouch') !== 'hold') return;
      if (ctx.state !== 'playing' && !ctx.params?.has?.('shot')) return;
      const p = ctx.player;
      if (p?.crouching) p.setCrouch?.(false);
    };
    window.addEventListener('keyup', this._onKeyUp, true);

    this._onClickAnywhere = () => {
      if (this.ctx.state === 'title' && this.titleStage === 'press') this._titleAdvance();
    };
    window.addEventListener('mousedown', this._onClickAnywhere, true);
  }

  _consume(e) {
    e.preventDefault?.();
    e.stopPropagation?.();
    e.stopImmediatePropagation?.();
  }

  /* ===================================================================== */
  /* events                                                                */
  /* ===================================================================== */

  _bindEvents() {
    const ev = this.ctx.events;
    if (!ev?.on) return;
    const on = (name, fn) => ev.on(name, (payload) => {
      try { fn(payload); } catch (err) { console.warn(`[menus] ${name}:`, err?.message || err); }
    });
    on('player-died', () => this._onDeath());
    on('victory', () => this._onVictory());
    on('player-damage', (e) => {
      if (e?.from) this._lastDamageFrom = e.from?.displayName ?? e.from?.kind ?? String(e.from);
    });
    on('game-start', () => {
      document.body.classList.remove('hzc-title-live');
      this._refreshTitle();
    });
    for (const name of ['inventory-close', 'ui-close']) {
      on(name, () => setTimeout(() => this._afterPanelClosed(), 0));
    }
    on('checkpoint-loaded', () => this._hideDeath());
  }

  _emit(name, payload) {
    try { this.ctx.events?.emit?.(name, payload); }
    catch (err) { console.warn(`[menus] emit ${name}:`, err?.message || err); }
  }

  /* ===================================================================== */
  /* frame                                                                 */
  /* ===================================================================== */

  /**
   * Simulation slice — only runs in the live states, and only for things that
   * belong to the world: the title camera and the fog the player's feet reveal.
   *
   * NO CARD TIMER LIVES HERE. They used to, and both were wrong for it:
   *
   *   · `dt` is SIMULATED time. `main.js` bounds a frame to 0.05 s across at
   *     most 3 sub-steps, so on a frame slower than 50 ms the simulation
   *     deliberately falls behind the wall clock — measured at 0.9× during a
   *     gate run, which turned "a 3 second banner" into 4.2 real seconds and
   *     failed `A68` on a build that was working. `engine.timeScale` (studio
   *     freeze, Concentration slow-mo, hitstop) scales it further: a hitstop on
   *     the killing blow would stretch the victory card.
   *   · the death card's own hold was counted TWICE — once here and once in
   *     `_present()`, which also runs while `state === 'dead'` — so the 1.15 s
   *     crumple window was really ~0.6 s.
   *
   * A card the player is waiting on is measured in seconds they can feel. Both
   * timers now run once, on the real clock, in `_present()`.
   */
  update(dt) {
    const ctx = this.ctx;
    const state = ctx.state;

    if (state === 'title') {
      if (!this._titleBuilt) this._enterTitle();
      this._titleT += dt;
      this._dolly(dt);
    }

    if (state === 'playing') {
      this.map.track(dt);
      if (this._lastState !== 'playing') this._paintStatus();
    }

    this._lastState = state;
  }

  /**
   * Presentation slice — runs on rAF, so it keeps working while the hub or the
   * death card has the world frozen (`update()` is not called then).
   */
  _present(now) {
    const dtReal = Math.min(0.1, (now - this._rafLast) / 1000);
    this._rafLast = now;

    // grayscale ramp: starts on death, holds under the card, released on respawn
    const wantGray = this.deathState ? 1 : 0;
    if (this.gray !== wantGray) {
      const rate = dtReal / GRAY_RAMP_S;
      this.gray = wantGray > this.gray ? Math.min(wantGray, this.gray + rate)
        : Math.max(wantGray, this.gray - rate * 2.5);
      this.grayPeak = Math.max(this.grayPeak, this.gray);
      this._applyGray(this.gray);
    }

    /**
     * THE TWO CARD TIMERS, counted once each, on the wall clock (see
     * `update()` for why they are not in the simulation slice). This loop runs
     * whatever the world is doing — frozen under the hub, frozen under the
     * death card, or in hitstop — so the promise "the banner lasts three
     * seconds" is one the shell can actually keep.
     */
    if (this.deathState === 'ramp') {
      this._deathT += dtReal;
      if (this._deathT >= DEATH_HOLD_S) this._showDeathChoice();
    }
    if (this._victoryT >= 0) {
      this._victoryT += dtReal;
      const k = clamp(this._victoryT / VICTORY_S, 0, 1);
      if (this._victoryFill) this._victoryFill.style.width = `${(k * 100).toFixed(1)}%`;
      if (this._victoryT >= VICTORY_S) this._resumeFromVictory();
    }

    this.beacon.update(now);

    if (this.hubOpen && this.tab === 'map' && this.map.canvas && !this.map.bake.ready) this.map.draw();
    if (this.hubOpen && (now - (this._statusT || 0)) > 700) {
      this._statusT = now;
      this._paintStatus();
    }
  }

  /* ===================================================================== */
  /* diagnostics                                                           */
  /* ===================================================================== */

  audit() {
    const ctx = this.ctx;
    const vis = (n) => {
      if (!n) return false;
      const r = n.getBoundingClientRect();
      return r.width > 2 && r.height > 2 && +getComputedStyle(n).opacity > 0.05;
    };
    const logos = [...document.querySelectorAll('.hzc-logo')].filter(vis);
    return {
      installed: true,
      state: ctx.state,
      hubOpen: this.hubOpen,
      tab: this.tab,
      delegated: this.delegated,
      tabs: TABS.map((t) => t.id),
      tabsVisible: vis(this._tabsEl),
      modal: this.modal,
      title: {
        stage: this.titleStage,
        built: !!this._titleBuilt,
        menuVisible: vis(this.titleMenu),
        menuItems: this.titleMenu ? this.titleMenu.childElementCount : 0,
        pressVisible: vis(this._pressEl),
        logos: logos.length,
        keybindWallInTitle: !!document.querySelector('#title .keybinds-panel'),
        camera: ctx.camera ? {
          x: +ctx.camera.position.x.toFixed(2),
          y: +ctx.camera.position.y.toFixed(2),
          z: +ctx.camera.position.z.toFixed(2),
        } : null,
      },
      death: {
        state: this.deathState,
        visible: vis(this.deathEl),
        options: this._deathOpts ? this._deathOpts.childElementCount : 0,
        killer: this.deathKiller,
        killerText: this._deathKillerEl?.textContent ?? '',
        gray: +this.gray.toFixed(3),
        grayPeak: +this.grayPeak.toFixed(3),
        canvasFilter: ctx.renderer?.domElement?.style?.filter ?? '',
      },
      victory: { t: +this._victoryT.toFixed(2), visible: vis(this.victoryEl) },
      map: this.map.audit(),
      beacon: this.beacon.audit(),
      settings: this.settings.audit(),
      tips: this.tips.audit(),
      log: this._log.slice(-16),
    };
  }

  dispose() {
    cancelAnimationFrame(this._rafId);
    window.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('keyup', this._onKeyUp, true);
    window.removeEventListener('mousedown', this._onClickAnywhere, true);
    this.beacon.dispose();
    this.root?.remove();
    document.body.classList.remove('hzc-menus', 'hzc-hub-open', 'hzc-dead', 'hzc-title-live');
    if (this.ctx.menus === this) this.ctx.menus = null;
  }
}

/* ========================================================================= */
/* install                                                                   */
/* ========================================================================= */

/**
 * Idempotent. Registers the system LAST in `game.systems` so its title dolly is
 * the final camera write of the frame (`Player` writes the chase camera in its
 * own update; three renders after every system has run).
 *
 * `core-platform` is asked to call this from `main.js` beside
 * `installProgression(ctx)`; until that line lands, `src/ui/menu.js` is loaded
 * by a module tag in `index.html` and self-installs off `window.__CTX__`.
 */
export function installMenus(ctx) {
  if (!ctx) return null;
  if (ctx.menus) return ctx.menus;
  const menus = new Menus(ctx);
  const systems = ctx.game?.systems;
  if (Array.isArray(systems) && !systems.includes(menus)) systems.push(menus);
  return menus;
}

/**
 * Self-boot for the module tag. Waits for `main.js` to publish the context and
 * installs exactly once; a later `installMenus(ctx)` from main.js is a no-op
 * that returns the same instance.
 */
export function autoInstall() {
  if (typeof window === 'undefined') return;
  if (window.__HZC_MENUS_BOOT__) return;
  window.__HZC_MENUS_BOOT__ = true;
  let tries = 0;
  const tick = () => {
    const ctx = window.__CTX__;
    if (ctx?.player && ctx.events) { installMenus(ctx); return; }
    if (++tries > 3000) return;   // ~50 s at 60 Hz: the boot failed, not us
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

autoInstall();
