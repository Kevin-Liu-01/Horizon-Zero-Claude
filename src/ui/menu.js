/**
 * THE GLASS SHELL  —  lane `ui` (BIBLE 18; BUILD M1.6g2)
 * ===========================================================================
 * The frame around the game: title flow, the hub (full-width dark glass, top tabs with a lilac underline, the
 * page, a foot with the last rest), the map, settings, Continue and the three slots, the death card, the
 * context-lost card, credits and the Field Manual. Every menu surface is glass (src/ui/glass.css).
 *
 * ---------------------------------------------------------------- ownership
 * The hub ROUTES to the owning lane's panel (`progression.openQuestLog()`,
 * `openSkills()`, `items.openInventory(pocket)`, `items.openNotebook()`) and keeps its
 * margin, head and foot above them; the panel sits in the page body (see
 * `body.cal-hub-open` in style.css and inventory.css). Nothing is re-implemented here.
 * The waypoint is published as data (`ctx.menus.map.waypoint` + `waypoint-set` /
 * `waypoint-cleared`) and rides the theodolite circle (`ctx.hud.setWaypoint`).
 *
 * -------------------------------------------------------------- state model
 * `main.js` simulates `playing | title | dead | victory | studio`; anything else
 * freezes the world. That is the whole pause mechanism:
 *
 *   'paused'      the hub
 *   'death-menu'  the death page. NOT 'dead', and that is load-bearing:
 *                 `player._die()` schedules a 3.2 s `setTimeout` respawn that begins
 *                 `if (this.ctx.state !== 'dead') return;`. Parking the state elsewhere
 *                 is what turns the auto-respawn into a CHOICE (`A69-death-choice`).
 *   'victory'     kept for exactly 3 s, then handed back to 'playing' (`A68-no-softlock`).
 *
 * ------------------------------------------------------------------- input
 * Every menu key is read in the WINDOW CAPTURE phase, before `input.js`'s own window
 * listener, and consumed with `stopImmediatePropagation()` when this lane acts on it:
 * `input.enabled` is false on the title screen, and `KeyI` / `KeyJ` / `KeyK` already
 * have owners whose handlers would toggle the panel back shut.
 */

import { SettingsStore, SettingsPanel } from './settings.js';
import { WorldMap, WaypointBeacon } from './map.js';
import { Tips, fieldWord } from './tips.js';
import { REST } from '../world/island/sites.js';
import { TitleStage, buildTitle, fillStations, saveLine, fillTolerance, fillExtras, MENU_AT_S, TITLE_HOUR, TITLE_TEXT, underSheet } from './title.js';
import { MakingLedger } from './making.js';
import './glass.css';
import { fillSlots, fillManualCards, ContextCard, RESUME_FLAG } from './slots.js';

const el = (tag, cls, parent, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  if (parent) parent.appendChild(n);
  return n;
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** HH:MM from a decimal hour. */
const hhmm = (h) => {
  const t = ((Number(h) || 0) % 24 + 24) % 24;
  let hh = Math.floor(t), mm = Math.round((t - hh) * 60);
  if (mm === 60) { mm = 0; hh = (hh + 1) % 24; }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

/** Hub tabs. `open` delegates to the owning lane; absent = rendered here. */
const TABS = [
  { id: 'map', key: 'KeyM', hint: 'M', label: 'MAP' },
  { id: 'quests', key: 'KeyJ', hint: 'J', label: 'FIELD LOG',
    open: (ctx) => ctx.progression?.openQuestLog?.() },
  { id: 'inventory', key: 'KeyI', hint: 'I', label: 'SATCHEL',
    open: (ctx) => ctx.items?.openInventory?.('resources') },
  // M1.6d: the Making ledger is this lane's own page (src/ui/making.js), mounted in the hub body
  { id: 'crafting', key: 'KeyO', hint: 'O', label: 'MAKING' },
  { id: 'skills', key: 'KeyK', hint: 'K', label: 'SKILLS',
    open: (ctx) => ctx.progression?.openSkills?.() },
  { id: 'notebook', key: 'KeyN', hint: 'N', label: 'FIELD BOOKS',
    open: (ctx) => ctx.items?.openNotebook?.() },
  { id: 'settings', key: 'Comma', hint: ',', label: 'SETTINGS' },
];
const TAB_BY_ID = new Map(TABS.map((t) => [t.id, t]));
const TAB_BY_KEY = new Map(TABS.map((t) => [t.key, t]));

/** States another lane's panel parks on — the hub stays open behind them. */
const PANEL_STATES = ['quests', 'dialogue', 'trade', 'brazier', 'skills', 'inventory'];

const DEATH_HOLD_S = 1.15;    // let the crumple play before the card takes over
const VICTORY_S = 3.0;        // ui-13: banner, then the valley is yours again
const GRAY_RAMP_S = 1.6;
const REST_PT = { x: REST.x, z: REST.z };

/**
 * Credits (brand, W0b; plan §10.2). Two kinds of row, kept apart on purpose:
 *
 *   CREDITS_LICENSED  every licence row that needs credit, GENERATED between the
 *                     markers by `node tools/lint/credits-sync.mjs` from
 *                     `tools/licences/credits.mjs` (public/LICENSES.json). Never
 *                     edit it by hand; `--check` fails on drift, and
 *                     A-licence-manifest reads each CC-BY / MIT attribution from
 *                     this file verbatim.
 *   the project rows  what the project is and how its audio is made; not
 *                     licence claims.
 */
// <credits:generated>
const CREDITS_LICENSED = [
  { head: 'CODE (MIT)', rows: [
    ['meshoptimizer decoder © 2016–2022 Arseny Kapoulkine (MIT)', ''],
    ['three-mesh-bvh © 2018 Garrett Johnson (MIT)', ''],
    ['three.js © 2010–2024 three.js authors (MIT)', ''],
  ] },
  { head: 'TYPEFACES (SIL OPEN FONT LICENSE 1.1)', rows: [
    ['Chakra Petch — Cadson Demak (https://fonts.google.com/specimen/Chakra+Petch)', ''],
    ['IBM Plex Mono — IBM Corp. (Mike Abbink, Bold Monday) (https://fonts.google.com/specimen/IBM+Plex+Mono)', ''],
  ] },
  { head: 'THANKS (CC0, NO ATTRIBUTION REQUIRED)', rows: [
    ['Armory: Pan Whites II, III and Ash Wraps I: re-cut MCO Peasant pieces (CC0) + procedural garment pieces, project-original paint — CALIMA project, Quaternius (MCO Fantasy, CC0) (https://quaternius.itch.io/)', ''],
    ['Modular Character Outfits - Fantasy [Standard] — Quaternius (https://quaternius.itch.io/modular-character-outfits-fantasy)', ''],
    ['Universal Animation Library [Standard] (Godot export) — Quaternius (https://quaternius.itch.io/universal-animation-library)', ''],
    ['Universal Animation Library 2 [Standard] — Quaternius (https://quaternius.itch.io/universal-animation-library-2)', ''],
    ['Universal Base Characters [Standard] — Quaternius (https://quaternius.itch.io/universal-base-characters)', ''],
  ] },
];
// </credits:generated>
const CREDITS = [
  { head: 'CALIMA', rows: [
    ['An original game', 'Orchil, its Instruments and its people are original to CALIMA'],
    ['Built with', 'Claude Code: parallel agents, literal tests, filmed checks'],
  ] },
  ...CREDITS_LICENSED,
  { head: 'AUDIO  ·  SYNTHESIZED', rows: [
    // counted live: a hard-coded number in a credits screen is a licence claim that goes stale
    [() => {
      const n = window.__CTX__?.audio?.bank?.size;
      return n ? `${n} cues loaded, synthesized by this repository` : 'Synthesized by this repository';
    }, 'public/audio/MANIFEST.md  ·  tools/audio-bank.mjs + audio-recipes.js'],
    ['No third-party audio is bundled', 'no attribution, share-alike or non-commercial obligation in the tree'],
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
    this.making = new MakingLedger(ctx);
    this.titleStageShot = new TitleStage(ctx);

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
    /** What the title shot last authored (M1.6h, src/ui/title.js `TitleStage.info`), for `audit().title.dolly`. */
    this._dollyInfo = this.titleStageShot.info;
    this._lastState = ctx.state;
    /**
     * Audit trail for gates — CAPPED (`memory-attribution`). `audit()` only
     * ever publishes `slice(-16)`, but the array itself was unbounded: every
     * death, save, respawn and quit appended forever. Measured at +3 over 30
     * kills, which is nothing per kill and unbounded per session. 64 is four
     * times what anything reads.
     */
    this._log = [];
    this._logCap = 64;

    this._applyZoom();
    this._onResize = () => this._applyZoom();
    window.addEventListener('resize', this._onResize);

    this._build();
    this._bindKeys();
    this._bindEvents();
    // BIBLE 18 "Context lost": DISPLAY RESET · RESUMING (src/ui/slots.js)
    this.contextCard = new ContextCard(this);
    // M1.6g2: the glass shell (src/ui/glass.css) is scoped under this class
    document.body.classList.add('cal-menus', 'cal-gs');

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

  /** The menus keep their proportions at any window: `--ui-z` drives CSS `zoom` on every menu surface. */
  _applyZoom() {
    // READING's UI scale (src/ui/settings.js `uiScale`) multiplies the window's own
    const z = clamp(Math.min(window.innerWidth / 1600, window.innerHeight / 900), 0.75, 2.6) * (this.ctx.settings?.uiScale ?? 1);
    document.documentElement.style.setProperty('--ui-z', z.toFixed(3));
  }

  _build() {
    this.root = el('div', 'cal-menus-root', document.body);
    this.root.id = 'cal-menus';

    /* ---- the hub (M1.6g2, BIBLE 18): full-width glass; top tabs with a lilac underline; the page; a foot ---- */
    this.hub = el('div', 'mn-hub', this.root);
    el('div', 'mn-hub-scrim', this.hub);
    const shell = el('div', 'mn-hub-shell', this.hub);

    const head = el('header', 'mn-hub-head', shell);
    el('div', 'mn-hub-brand', head, 'CALIMA');
    this._tabsEl = el('nav', 'mn-tabs', head);
    this._tabBtns = new Map();
    TABS.forEach((t) => {
      const b = el('button', 'mn-tab', this._tabsEl, `<span>${t.label}</span><kbd>${t.hint}</kbd>`);
      b.dataset.tab = t.id;
      b.addEventListener('click', () => this.setTab(t.id));
      this._tabBtns.set(t.id, b);
    });
    this._hubStatus = el('div', 'mn-hub-status', head);

    // the page's own line: its name, then the field data a surveyor heads a page with
    const sub = el('div', 'mn-hub-sub', shell);
    this._hubTitle = el('div', 'mn-hub-title', sub, 'MAP');
    this._marginData = el('div', 'mn-hub-data', sub);

    this.hubBody = el('div', 'mn-hub-body', shell);

    const foot = el('footer', 'mn-hub-foot', shell);
    this._tipEl = el('div', 'mn-tip', foot);
    // BIBLE 17: the foot reads LAST REST · place · hour, and offers SAVE only within 12 m of a lit Brazier
    this._restEl = el('div', 'mn-hub-rest', foot);
    const acts = el('div', 'mn-hub-acts', foot);
    this._saveBtn = this._mkBtn(acts, 'SAVE', () => this.saveGame(), 'small');
    this._mkBtn(acts, 'FIELD MANUAL', () => this.openModal('manual'), 'small');
    this._mkBtn(acts, 'QUIT TO TITLE', () => this.quitToTitle(), 'small danger');
    this._mkBtn(acts, 'RESUME', () => this.closeHub(), 'small primary');

    /* ---- death (BIBLE 13, 18): one glass card, THE LINE IS LOST, two stations ---- */
    this.deathEl = el('div', 'mn-death', this.root);
    const dInner = el('div', 'mn-death-inner', this.deathEl);
    // M1.6f (systems): the bible's death line, from src/game/text/ui/systems.json
    el('div', 'mn-death-title', dInner, this.ctx?.systemsGame?.S?.systems?.death?.title ?? 'THE LINE IS LOST');
    this._deathKillerEl = el('div', 'mn-death-killer', dInner);
    el('div', 'mn-death-rule', dInner);
    this._deathTip = el('div', 'mn-death-tip', dInner);
    this._deathOpts = el('div', 'mn-death-opts', dInner);

    /* ---- victory ---- */
    this.victoryEl = el('div', 'mn-victory', this.root);
    const vInner = el('div', 'mn-victory-inner cal-page', this.victoryEl);
    el('div', 'mn-victory-kicker', vInner, 'FIELD BOOK');
    el('div', 'mn-victory-title', vInner, 'SURVEY CLOSED');
    el('div', 'mn-victory-sub', vInner, 'The island is still there. Returning you to it.');
    this._victoryBar = el('div', 'mn-victory-bar', vInner);
    this._victoryFill = el('i', null, this._victoryBar);

    /* ---- modal (credits / manual / new game / settings) ---- */
    this.modalEl = el('div', 'mn-modal', this.root);
    const mShell = el('div', 'mn-modal-shell cal-page', this.modalEl);
    const mHead = el('header', 'mn-modal-head', mShell);
    this._modalTitle = el('div', 'mn-modal-title', mHead, 'CREDITS');
    const mClose = el('button', 'mn-x', mHead, 'ESC');
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
    this._muteFieldLines();
    if (this._titleBuilt) { this._refreshTitle(); return; }
    this._titleBuilt = true;
    // a QUIT TO TITLE rebuilds the block: drop the previous visit's
    this.titleEl?.remove();
    this._titleNodes?.tag?.remove();
    this._titleNodes?.scrim?.remove();

    // ONE wordmark (V38): the one index.html holds is kept; the keybind wall moves into the
    // Field Manual modal (EXTRAS) and #btn-start stays in the DOM, hidden (main.js clicks it to start)
    const wall = host.querySelector('.keybinds-panel');
    if (wall) { wall.remove(); this._manualNode = wall; }
    document.getElementById('btn-start')?.classList.add('mn-hidden');

    const n = this._titleNodes = buildTitle(host);
    this.titleEl = n.root;
    this._pressEl = n.press;
    this.titleMenu = n.menu;
    this._titleSave = n.save;
    this._refreshTitle();

    // the shot (M1.6h): her at her cistern, 18:40, the lens solved; nothing searched
    this.titleStageShot.begin({ station: this._titleStation ?? null });
    this._titleHead = this.titleStageShot.solved;
    this.titleStage = 'press';
    this._titleT = 0;
    this._dollyT = 0;
    this.titleStageShot.place(null);
    // a graphics reset that could not restore reloaded the page: Continue runs by itself (src/ui/slots.js)
    let resume = false;
    try { resume = sessionStorage.getItem(RESUME_FLAG) === '1'; sessionStorage.removeItem(RESUME_FLAG); } catch { /* storage off */ }
    if (resume && this.ctx.progression?.hasSave?.()) queueMicrotask(() => underSheet(() => this.continueGame()));
  }

  _refreshTitle() {
    if (!this.titleMenu) return;
    const prog = this.ctx.progression;
    const info = prog?.hasSave?.() ? prog.saveInfo?.() : null;
    const older = !info && prog?.olderSaves?.().length ? (this.ctx.systemsGame?.S?.systems?.save?.older ?? null) : null;
    fillStations(this.titleMenu, {
      // M1.6f: an older-format save hides CONTINUE and is named on the save line (BIBLE 17)
      showContinue: !!info || !older,
      canContinue: !!info,
      fns: {
        // the start's work runs behind the Loading sheet, which closes on warm frames (M1.6h)
        // BIBLE 18 "Continue and save slots": CONTINUE opens the three slot cards
        continue: () => this.openModal('slots'),
        newGame: () => this.openModal('difficulty'),
        settings: () => this.openModal('settings'),
        extras: () => this.openModal('extras'),
        quit: () => this._titleQuit(),
      },
      onPick: (label) => this._emit('ui-confirm', { label }),
    });
    this._titleSave.textContent = saveLine(info, older);
  }

  /**
   * No field turn speaks on the title (M1.6h fix round 1: at 273e302 a QUIT TO TITLE 6 s into play put Brea's
   * "The house kite's up already." under the wordmark). The quest only turns while playing; what it queued before
   * the title is dropped here, and title.css hides the subtitle line while `body.cal-t2` stands. The presenter is
   * the systems lane's (src/game/present.js): its queue is read through optional fields, nothing is added to it.
   */
  _muteFieldLines() {
    const P = this.ctx.systemsGame?.present;
    if (!P || P.headless) return;
    if (Array.isArray(P._subQ)) P._subQ.length = 0;
    if (typeof P._subT === 'number') P._subT = 0;
    P.subt?.classList?.remove('on');
  }

  /** Any key (or click) on the title starts the dolly and reveals the stations. */
  _titleAdvance() {
    if (this.titleStage !== 'press') return false;
    this.titleStage = 'dolly';
    this._titleT = 0;
    this.titleEl?.classList.add('lit');
    this._emit('ui-open', { screen: 'title-menu' });
    return true;
  }

  /** QUIT: a browser tab cannot close itself; the stations fold away and the title waits for a key again. */
  _titleQuit() {
    this.closeModal();
    this.titleStage = 'press';
    this._titleT = 0;
    this.titleEl?.classList.remove('lit', 'menu-in');
    this._emit('ui-back', { screen: 'title' });
  }

  /** Re-solve the title shot with other frame numbers (tuning and gates); returns the solved shot. */
  _titleReframe(opts = {}) {
    const T = this.titleStageShot;
    if (opts.station !== undefined) this._titleStation = opts.station;
    Object.assign(T.frame, opts.frame || {});
    if (opts.station !== undefined) { T.leave(); T.begin({ station: this._titleStation }); }
    this._titleHead = T.solve();
    T.place(this.titleStage === 'press' ? null : this._titleT);
    return T.audit();
  }

  /**
   * Leave the title: hand back the clock, the hour and the lens the title borrowed. Idempotent: the
   * start path and the `game-start` event both call it, so a start that bypasses the menu still cleans up.
   */
  _titleLeave() {
    this.titleStageShot.leave();
    this._titleHead = null;
    document.body.classList.remove('cal-t2');
  }

  /**
   * The title's lens, every simulation step while the title stands (this system runs after `Player`,
   * so its camera write is the frame's). The stations arrive MENU_AT_S after the press.
   */
  _dolly(dt) {
    if (!this._titleHead) { this.titleStageShot.begin({ station: this._titleStation ?? null }); this._titleHead = this.titleStageShot.solved; }
    this._dollyT += dt;
    const since = this._titleT;
    if (this.titleStage === 'dolly' && since > MENU_AT_S) {
      this.titleStage = 'menu';
      this.titleEl?.classList.add('menu-in');
    }
    this.titleStageShot.place(this.titleStage === 'press' ? null : since);
  }

  continueGame() {
    const prog = this.ctx.progression;
    this._startGame();
    const res = prog?.continueGame?.();
    this._log.push({ what: 'continue', ok: !!res?.ok });
    this._trimLog();
    return res;
  }

  newGame(difficulty) {
    const p = this.ctx.player;
    if (p) { p.position.set(REST_PT.x, p.position.y, REST_PT.z); p._snapToGround?.(); }
    this.ctx.progression?.newGame?.(difficulty);
    this.map.fog.clear();
    this.map.setTriangles([]);
    this.map.clearWaypoint();
    this._startGame();
    this._log.push({ what: 'new-game', difficulty: difficulty || null });
    this._trimLog();
  }

  /** Hand off to main.js's own start path so nothing about it is duplicated. */
  _startGame() {
    this.closeModal();
    this._titleLeave();
    document.body.classList.remove('cal-title-live');
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
    if (p && p.health <= 0) { p.health = p.maxHealth; p.position.set(REST_PT.x, 0, REST_PT.z); p._snapToGround?.(); }
    document.getElementById('hud')?.classList.add('hidden');
    document.getElementById('title')?.classList.remove('hidden');
    ctx.state = 'title';
    this._titleBuilt = false;
    this._titleHead = null;
    this.titleStageShot.leave();
    this._enterTitle();
    this._emit('ui-back', { screen: 'title' });
    this._log.push({ what: 'quit-to-title' });
    this._trimLog();
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
    document.body.classList.add('cal-hub-open');
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
    document.body.classList.remove('cal-hub-open');
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
    this.hub.dataset.tab = id;
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
      else if (id === 'crafting') this.making.mount(this.hubBody);
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
    if (this.making.root?.parentNode === this.hubBody) this.making.unmount();
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
    const p = this.ctx.player;
    const rd = (label, v) => `<span>${label}</span> <b>${v}</b>`;
    const pad = (n) => String(Math.max(0, Math.round(n))).padStart(3, '0');
    const bits = [];
    if (p) bits.push(rd('HEALTH', `${pad(p.health)}/${Math.round(p.maxHealth)}`), rd('GOURD', pad(p.gourd ?? 0)));
    const salt = this.ctx.inventory?.count?.('metal-shards');
    if (salt != null) bits.push(rd('SALT', pad(salt)));
    this._hubStatus.innerHTML = bits.map((b) => `<div>${b}</div>`).join('');

    // the field data: hour, weather, where she stands, which way she faces
    const env = this.ctx.environment;
    const rows = [];
    if (Number.isFinite(env?.time)) {
      const hh = Math.floor(env.time) % 24, mm = Math.floor((env.time % 1) * 60);
      rows.push(['HOUR', `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`]);
    }
    if (env?.weather) rows.push(['SKY', String(env.weather).toUpperCase(), 'word']);
    if (p) {
      const coord = (v) => `${v < 0 ? '-' : ''}${String(Math.abs(Math.round(v))).padStart(3, '0')}`;
      const brg = Math.round((((-(p.camYaw ?? 0) * 180 / Math.PI) % 360) + 360) % 360) % 360;
      rows.push(['E', coord(p.position.x)], ['N', coord(-p.position.z)], ['BRG', String(brg).padStart(3, '0')]);
    }
    this._marginData.innerHTML = rows.map(([k, v, c]) => `<span>${k}</span><b${c ? ` class="${c}"` : ''}>${v}</b>`).join('');

    this._paintFoot();
  }

  /** The words of the systems lane (src/game/text/ui/systems.json), when it is installed. */
  get _sysText() { return this.ctx.systemsGame?.S?.systems ?? null; }

  /** The last rest's Brazier, by its name (BIBLE 17), or ''. */
  _restPlace() {
    const lr = this.ctx.braziers?.lastRest;
    if (!lr) return '';
    return this._sysText?.brazier?.names?.[lr.id] ?? '';
  }

  /** A lit Brazier within 12 m of her (BIBLE 17: the hub offers SAVE only there). */
  _nearLitBrazier() {
    const B = this.ctx.braziers, p = this.ctx.player?.position;
    if (!B?.list || !p) return false;
    for (const b of B.list) {
      if (!B.lit?.has?.(b.id) || !b.obj?.position) continue;
      if (Math.hypot(b.obj.position.x - p.x, b.obj.position.z - p.z) <= 12) return true;
    }
    return false;
  }

  /** The hub foot: LAST REST · place · hour, and SAVE only by a lit Brazier. */
  _paintFoot() {
    const lr = this.ctx.braziers?.lastRest;
    const place = this._restPlace();
    const tpl = this._sysText?.save?.lastRest ?? 'LAST REST · {place} · {hour}';
    this._restEl.textContent = lr && place
      ? tpl.replace('{place}', place).replace('{hour}', hhmm(lr.hour))
      : '';
    // without the systems lane (a bare page) there is no Brazier to stand by: SAVE stays as it was
    const gated = !!this.ctx.braziers?.list;
    this._saveBtn.classList.toggle('mn-hidden', gated && !this._nearLitBrazier());
  }

  saveGame() {
    const res = this.ctx.progression?.save?.('menu');
    this._emit('ui-confirm', { label: 'SAVE' });
    this._log.push({ what: 'save', ok: !!res });
    this._trimLog();
    this._refreshTitle();
    return res;
  }

  /* ===================================================================== */
  /* modals                                                                */
  /* ===================================================================== */

  openModal(kind) {
    if (this.modal && this.modal !== kind) this.closeModal();
    this.modal = kind;
    this.modalBody.innerHTML = '';
    this.modalEl.classList.add('show');
    // M1.6h: the New Game card and EXTRAS are glass cards over the title (src/ui/title.css)
    this.modalEl.classList.toggle('t2-glass', kind === 'difficulty' || kind === 'extras');
    this.modalEl.dataset.kind = kind;
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
        'Full manifest: <code>public/LICENSES.json</code> · licence texts: <code>public/licences/</code> and <code>public/fonts/*-OFL.txt</code>');
    } else if (kind === 'manual') {
      this._modalTitle.textContent = 'FIELD MANUAL';
      this._manualNode ??= document.querySelector('.keybinds-panel');
      // BIBLE 18 "Extras": the Field Manual is the tutorial cards, then the keys
      fillManualCards(this.modalBody, this._manualNode);
    } else if (kind === 'slots') {
      this._modalTitle.textContent = 'CONTINUE';
      this._slots = fillSlots(this.modalBody, {
        menus: this,
        onContinue: (n) => {
          this.ctx.progression?.saves?.useSlot?.(n);
          this.closeModal();
          underSheet(() => this.continueGame());
        },
      });
    } else if (kind === 'settings') {
      this._modalTitle.textContent = 'SETTINGS';
      this.settingsPanel.mount(this.modalBody);
    } else if (kind === 'difficulty') {
      // New Game: one glass card, Tolerance (BIBLE 13, 18: LOOSE · STANDARD · FINE · BEGIN)
      this._modalTitle.textContent = TITLE_TEXT.tolerance.head;
      const list = this.ctx.progression?.DIFFICULTIES || [{ id: 'standard', name: 'Standard' }];
      const cur = this.ctx.progression?.difficulty ?? 'standard';
      this._tolerance = fillTolerance(this.modalBody, list, (id) => { this.closeModal(); underSheet(() => this.newGame(id)); }, cur);
    } else if (kind === 'extras') {
      this._modalTitle.textContent = TITLE_TEXT.extras.head;
      fillExtras(this.modalBody, { manual: () => this.openModal('manual'), credits: () => this.openModal('credits') });
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
    this.modalEl.classList.remove('show', 't2-glass');
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
    document.body.classList.add('cal-dead');
    this._log.push({ what: 'death', killer: this.deathKiller });
    this._trimLog();
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
      ? `felled by <b>${fieldWord(String(killer)).toUpperCase()}</b>`
      : 'the island took her';
    this._deathTip.innerHTML = this.tips.forDeath(killer);

    // BIBLE 13: exactly two stations. RETURN TO THE LAST BRAZIER is the one death rule (BIBLE 17): the newest
    // record's world and satchel, Brea standing at the Brazier of her last rest, at the hour of her death
    // (progression.loadCheckpoint('death') over src/game/save's deathRecord).
    const place = this._restPlace();
    this._deathOpts.innerHTML = '';
    const opts = [
      { label: 'RETURN TO THE LAST BRAZIER', sub: place || '', fn: () => this.respawn('checkpoint') },
      { label: 'QUIT TO TITLE', sub: '', fn: () => this.quitToTitle() },
    ];
    opts.forEach((o, i) => {
      const b = el('button', 'mn-death-opt', this._deathOpts);
      el('span', 'cal-stn', b, String(i + 1));
      el('b', null, b, o.label);
      if (o.sub) el('span', null, b, o.sub);
      b.addEventListener('click', () => { this._emit('ui-confirm', { label: o.label }); o.fn(); });
    });
    this.deathEl.classList.add('show');
    this._emit('ui-open', { screen: 'death', killer });
  }

  /**
   * `mode`:
   *   'checkpoint' — emit `player-respawn`; `progression` restores the
   *                  checkpoint it wrote (position, health, pouch, inventory).
   *   'rest site'       — the same, then move her to rest site on the next microtask so
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
   * point), so the guard is narrow: only a non-positive restore,
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
      if (mode === 'rest') { p.position.set(REST_PT.x, 0, REST_PT.z); p._snapToGround?.(); }
    }
    ctx.events?.emit?.('player-respawn', { source: 'menus', mode });
    if (p) {
      queueMicrotask(() => {
        if (mode === 'rest') { p.position.set(REST_PT.x, 0, REST_PT.z); p._snapToGround?.(); }
        if (!(p.health > 0)) {
          p.health = p.maxHealth;
          ctx.events?.emit?.('player-hurt', { health: p.health, max: p.maxHealth });
        }
      });
    }
    if (!ctx.params?.has?.('shot')) ctx.input?.requestPointerLock?.();
    this._log.push({ what: 'respawn', mode });
    this._trimLog();
    return true;
  }

  _hideDeath() {
    this.deathState = null;
    this.deathEl.classList.remove('show');
    document.body.classList.remove('cal-dead');
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
    this._trimLog();
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
    this._trimLog();
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

      // BIBLE 12: Q and E cycle the hub tabs
      if (this.hubOpen && (code === 'KeyQ' || code === 'KeyE')) {
        const i = TABS.findIndex((t) => t.id === this.tab);
        const n = TABS.length;
        this.setTab(TABS[(i + (code === 'KeyE' ? 1 : n - 1)) % n].id);
        this._consume(e);
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
      if ((tab.id === 'map' || tab.id === 'crafting') && ctx.state === 'playing') {
        this.openHub(tab.id);
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
      this._titleLeave();
      document.body.classList.remove('cal-title-live');
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

  /** Keep the shell audit trail bounded (see `_logCap`). */
  _trimLog() {
    const over = this._log.length - this._logCap;
    if (over > 0) this._log.splice(0, over);
  }

  audit() {
    const ctx = this.ctx;
    // the Loading sheet stands over the title until it closes on warm frames (src/ui/title.js): what it covers is not seen
    const sheet = document.getElementById('loading');
    const sheetUp = !!sheet && !sheet.classList.contains('hidden') && getComputedStyle(sheet).display !== 'none';
    const vis = (n) => {
      if (!n) return false;
      if (sheetUp && !sheet.contains(n)) return false;
      const r = n.getBoundingClientRect();
      return r.width > 2 && r.height > 2 && +getComputedStyle(n).opacity > 0.05;
    };
    const logos = [...document.querySelectorAll('.cal-logo')].filter(vis);
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
        dolly: {
          since: +this._dollyInfo.since.toFixed(3),
          ease: +this._dollyInfo.ease.toFixed(4),
          radius: +this._dollyInfo.radius.toFixed(2),
          camY: +this._dollyInfo.camY.toFixed(2),
          pitchDeg: +this._dollyInfo.pitchDeg.toFixed(2),
          titleT: +this._titleT.toFixed(3),
          dollyT: +this._dollyT.toFixed(3),
        },
        shot: this.titleStageShot.audit(),
        clock: { held: this.titleStageShot._clockHeld != null, frozen: !!ctx.environment?.timeFrozen, handBack: this.titleStageShot._clockHeld,
          hour: ctx.environment?.time ?? null, titleHour: TITLE_HOUR, hourHandBack: this.titleStageShot._hourHeld },
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
      contextLost: this.contextCard?.audit?.() ?? null,
      slots: this.modal === 'slots' ? this._slots?.audit?.() ?? null : null,
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
    window.removeEventListener('resize', this._onResize);
    this.beacon.dispose();
    this.contextCard?.dispose();
    this.map.dispose();
    this.root?.remove();
    document.body.classList.remove('cal-menus', 'cal-gs', 'cal-hub-open', 'cal-dead', 'cal-title-live', 'cal-t2');
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
  if (window.__CAL_MENUS_BOOT__) return;
  window.__CAL_MENUS_BOOT__ = true;
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
