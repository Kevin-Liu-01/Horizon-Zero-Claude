/**
 * SETTINGS  —  lane `shell-ui` (bible §9.7, gates A72, A72b; the rebind list closes
 * `A-input-actions`' settings clause, R38)
 * ===========================================================================
 * One persisted settings store, one apply path, one panel. The store is NOT a second
 * source of truth: every value lands on an object another lane already reads:
 *
 *   ctx.settings.*          `player.js` reads `fov`, `cameraShake`, `cameraSmoothing`;
 *                           `input.js` reads `sensitivity`, `padSensitivity`, `invertY`,
 *                           `padDeadzone` (`ctx.input.settings === ctx.settings`).
 *   ctx.audio.setVolume()   the audio lane owns the six bus gains; we drive its setter.
 *   ctx.input.bind()        the input's own rebind path and its `cal.binds.v5` key.
 *   CSS custom properties   `--hud-scale` and the semantic `--cal-c-*` colours.
 *
 * Persistence is `localStorage['cal.settings.v5']`, written on every change and read
 * once at install, BEFORE the first look sample and after `Player`'s constructor has
 * seeded its `??=` defaults (`A72-settings-persist` reloads the page to prove it).
 *
 * Values this lane cannot honestly apply alone are stored and marked `pending`, and the
 * panel prints that, so the screen never claims an effect it does not have.
 */

import { ACTIONS, ACTION_PAD, DEFAULT_BINDS } from '../core/input.js';
import { installReach } from './reach.js';

const STORE_KEY = 'cal.settings.v5';

/**
 * The accessibility palettes, re-pointing only the semantic `--cal-c-*` colours the whole UI reads: staff + margin,
 * weak point, Pry, wary and hostile pips, gain. Okabe-Ito derived, then moved (M1.6m, tools/reach/cvd.mjs) until
 * every two of those, the calm lamp and the selection line are at least 15 dE2000 apart as a player with that type
 * sees them (Machado 2009, severity 1.0); calm and the selection differ in shape (an iris, a line).
 */
export const PALETTES = {
  off: null,
  protanopia: {
    '--cal-c-staff': '#B07100', '--cal-c-weak': '#006AB2', '--cal-c-pry': '#14A4FD',
    '--cal-c-wary': '#F0E442', '--cal-c-hostile': '#CD7D9B', '--cal-c-good': '#5CB672',
  },
  deuteranopia: {
    '--cal-c-staff': '#D58300', '--cal-c-weak': '#0072B2', '--cal-c-pry': '#4DA9E0',
    '--cal-c-wary': '#F8E65E', '--cal-c-hostile': '#CA6A98', '--cal-c-good': '#746559',
  },
  tritanopia: {
    '--cal-c-staff': '#DA640F', '--cal-c-weak': '#209760', '--cal-c-pry': '#B70018',
    '--cal-c-wary': '#B38B7E', '--cal-c-hostile': '#A03F6C', '--cal-c-good': '#70CE8F',
  },
};

const AUDIO_BUSES = ['master', 'music', 'sfx', 'ambience', 'voice', 'ui'];

/**
 * The schema IS the panel: order, grouping, labels, ranges and the apply rule
 * all live here so a new setting is one row, not four edits.
 *
 * kind:  'slider' | 'toggle' | 'choice'
 * apply: (value, ctx, store) — runs on load and on every change.
 */
export const SCHEMA = [
  /* ---------------------------------------------------------------- GRAPHICS (BIBLE 18 "Settings: graphics") */
  { group: 'GRAPHICS', page: 'graphics', rows: [
    // the engine's own tiers (engine.setQuality). A ?q= page parameter (the gates, the filmer) always wins, and the
    // shipped tier is never re-applied over itself: only a tier the player chose is applied
    { id: 'tier', kind: 'choice', label: 'Tier', dflt: 'high',
      options: [['high', 'HIGH'], ['medium', 'MEDIUM'], ['low', 'LOW']],
      apply: (v, ctx) => {
        if (ctx.params?.has?.('q')) return;
        const e = ctx.engine;
        if (e?.setQuality && e.quality !== v && (v !== 'high' || e.quality === 'medium' || e.quality === 'low')) e.setQuality(v);
      } },
    { id: 'resScale', kind: 'slider', label: 'Resolution scale', min: 0.5, max: 1, step: 0.05, dflt: 1, pending: true,
      fmt: (v) => `${Math.round(v * 100)}%`, apply: (v, ctx) => { ctx.settings.resScale = v; } },
    { id: 'shadows', kind: 'choice', label: 'Shadows', dflt: 'on', pending: true,
      options: [['on', 'ON'], ['off', 'OFF']], apply: (v, ctx) => { ctx.settings.shadows = v; } },
    { id: 'motionBlur', kind: 'toggle', label: 'Motion blur', dflt: false, pending: true,
      apply: (v, ctx) => { ctx.settings.motionBlur = !!v; } },
    // dflt 55 = player.js FOV_BASE: the neutral position is the value the build ships with
    { id: 'fov', kind: 'slider', label: 'Field of view', min: 50, max: 95, step: 1, dflt: 55,
      fmt: (v) => `${v | 0}°`, apply: (v, ctx) => { ctx.settings.fov = v; } },
    { id: 'cameraShake', kind: 'slider', label: 'Camera shake', min: 0, max: 1.5, step: 0.05, dflt: 1,
      fmt: (v) => `${Math.round(v * 100)}%`,
      apply: (v, ctx, s) => { ctx.settings.cameraShake = s.get('reducedMotion') ? 0 : v; } },
    // LIVE (M1.6m): player.js scales the sprint's widening of the view by this
    { id: 'fovPunch', kind: 'slider', label: 'FOV punch', min: 0, max: 1.5, step: 0.05, dflt: 1,
      fmt: (v) => `${Math.round(v * 100)}%`, apply: (v, ctx) => { ctx.settings.fovPunch = v; } },
    // LIVE: the output pass reads engine.look.vignette every frame; OFF holds it at 0, ON hands the look's value back
    { id: 'vignette', kind: 'toggle', label: 'Vignette', dflt: true,
      apply: (v, ctx) => {
        const L = ctx.engine?.look;
        if (!L) return;
        if (!v) { if (L._vignetteHeld == null) L._vignetteHeld = L.vignette; L.vignette = 0; }
        else if (L._vignetteHeld != null) { L.vignette = L._vignetteHeld; L._vignetteHeld = null; }
      } },
    { id: 'reducedMotion', kind: 'toggle', label: 'Reduced motion', dflt: false,
      note: 'Stills the camera shake, the compass inertia and every UI animation.',
      apply: (v, ctx, s) => {
        ctx.settings.reducedMotion = !!v;
        ctx.settings.cameraShake = v ? 0 : s.get('cameraShake');
        document.body.classList.toggle('cal-reduced-motion', !!v);
      } },
  ] },
  /* ---------------------------------------------------------------- CONTROLS (BIBLE 18 "Settings: controls") */
  { group: 'CONTROLS', page: 'controls', rows: [
    { id: 'sensitivity', kind: 'slider', label: 'Look sensitivity', min: 0.25, max: 3, step: 0.05, dflt: 1,
      fmt: (v) => `${v.toFixed(2)}×`, apply: (v, ctx) => { ctx.settings.sensitivity = v; } },
    { id: 'padSensitivity', kind: 'slider', label: 'Gamepad sensitivity', min: 0.25, max: 3, step: 0.05, dflt: 1,
      fmt: (v) => `${v.toFixed(2)}×`, apply: (v, ctx) => { ctx.settings.padSensitivity = v; } },
    { id: 'invertY', kind: 'toggle', label: 'Invert vertical look', dflt: false,
      apply: (v, ctx) => { ctx.settings.invertY = !!v; } },
    { id: 'padDeadzone', kind: 'slider', label: 'Stick deadzone', min: 0.05, max: 0.4, step: 0.01, dflt: 0.16,
      fmt: (v) => v.toFixed(2), apply: (v, ctx) => { ctx.settings.padDeadzone = v; } },
    { id: 'cameraSmoothing', kind: 'slider', label: 'Camera smoothing', min: 0, max: 1.5, step: 0.05, dflt: 1,
      fmt: (v) => `${Math.round(v * 100)}%`, apply: (v, ctx) => { ctx.settings.cameraSmoothing = v; } },
    // BIBLE 18: hold or toggle for aim, Steady and re-survey. LIVE (M1.6m): src/core/input.js latches the control in
    // TOGGLE (a press holds it, the next press lets go); Steady lets go with the aim, re-survey when its hold is done
    { id: 'holdAim', kind: 'choice', label: 'Aim', dflt: 'hold',
      options: [['hold', 'HOLD'], ['toggle', 'TOGGLE']],
      apply: (v, ctx) => { ctx.settings.holdAim = v; } },
    { id: 'holdSteady', kind: 'choice', label: 'Steady', dflt: 'hold',
      options: [['hold', 'HOLD'], ['toggle', 'TOGGLE']],
      note: 'Toggle: one press while aiming steadies her until the breath runs out or the aim drops.',
      apply: (v, ctx) => { ctx.settings.holdSteady = v; } },
    { id: 'holdResurvey', kind: 'choice', label: 'Re-survey', dflt: 'hold',
      options: [['hold', 'HOLD'], ['toggle', 'TOGGLE']],
      note: 'Toggle: one press at a benchmark holds the 15 s re-survey; a second press stops it.',
      apply: (v, ctx) => { ctx.settings.holdResurvey = v; } },
    // LIVE: `menu.js` releases the crouch on the KeyC up-edge when this reads 'hold'.
    { id: 'holdCrouch', kind: 'choice', label: 'Crouch', dflt: 'toggle',
      options: [['hold', 'HOLD'], ['toggle', 'TOGGLE']],
      note: 'Toggle is the default; HOLD releases her on key-up.',
      apply: (v, ctx) => { ctx.settings.holdCrouch = v; } },
  ] },
  /* ---------------------------------------------------------------- READING (BIBLE 18 "Settings: reading") */
  { group: 'READING', page: 'reading', rows: [
    // LIVE: the field-turn subtitle and the dialogue lower-third read these body classes (src/ui/glass.css)
    { id: 'subtitles', kind: 'toggle', label: 'Subtitles', dflt: true,
      note: 'With the speaker\'s name.',
      apply: (v) => { document.body.classList.toggle('cal-subs-off', !v); } },
    { id: 'subSize', kind: 'choice', label: 'Subtitle size', dflt: 'm',
      options: [['s', 'SMALL'], ['m', 'MEDIUM'], ['l', 'LARGE']],
      apply: (v) => { for (const k of ['s', 'm', 'l']) document.body.classList.toggle(`cal-subs-${k}`, v === k); } },
    { id: 'subBacking', kind: 'toggle', label: 'Subtitle backing', dflt: false,
      apply: (v) => { document.body.classList.toggle('cal-subs-back', !!v); } },
    // LIVE: every menu surface scales with the window (`--ui-z`, menu.js); this multiplies it
    { id: 'uiScale', kind: 'slider', label: 'UI scale', min: 0.8, max: 1.3, step: 0.05, dflt: 1,
      fmt: (v) => `${Math.round(v * 100)}%`,
      apply: (v, ctx) => { ctx.settings.uiScale = v; ctx.menus?._applyZoom?.(); } },
    // `hud.setHudScale(mult)` folds this into its viewport auto scale and writes `--hud-scale`
    { id: 'hudScale', kind: 'slider', label: 'HUD scale', min: 0.8, max: 1.4, step: 0.05, dflt: 1,
      fmt: (v) => `${Math.round(v * 100)}%`,
      apply: (v, ctx) => {
        ctx.settings.hudScale = v;
        ctx.hud?.setHudScale?.(v);
        document.documentElement.style.setProperty('--hud-scale-pref', String(v));
      } },
    { id: 'colourblind', kind: 'choice', label: 'Colour palette', dflt: 'off',
      options: [['off', 'DEFAULT'], ['protanopia', 'PROTAN'], ['deuteranopia', 'DEUTAN'], ['tritanopia', 'TRITAN']],
      apply: (v) => applyPalette(v) },
    { id: 'menuTips', kind: 'toggle', label: 'Show menu tips', dflt: true,
      apply: (v, ctx) => { ctx.settings.menuTips = !!v; } },
  ] },
  { group: 'AUDIO', page: 'audio', rows: AUDIO_BUSES.map((bus) => ({
    id: `vol_${bus}`, kind: 'slider', label: bus === 'ui' ? 'Interface' : bus === 'sfx' ? 'Effects' : bus[0].toUpperCase() + bus.slice(1),
    // defaults mirror audio/buses.js DEFAULT_VOLUMES exactly
    min: 0, max: 1, step: 0.02,
    dflt: { master: 0.85, music: 0.8, sfx: 1.0, ambience: 0.9, voice: 1.0, ui: 0.8 }[bus],
    fmt: (v) => `${Math.round(v * 100)}%`,
    apply: (v, ctx) => { ctx.audio?.setVolume?.(bus, v); },
  })).concat([
    { id: 'muted', kind: 'toggle', label: 'Mute all', dflt: false,
      apply: (v, ctx) => { ctx.audio?.setMuted?.(!!v); } },
  ]) },
];

/** The settings pages, in order (BIBLE 18: GRAPHICS, CONTROLS with REBIND and RESET, READING; and the sound). */
export const PAGES = [['graphics', 'GRAPHICS'], ['controls', 'CONTROLS'], ['reading', 'READING'], ['audio', 'AUDIO']];

function applyPalette(name) {
  const root = document.documentElement;
  for (const key of Object.keys(PALETTES.protanopia)) root.style.removeProperty(key);
  const p = PALETTES[name];
  if (!p) return;
  for (const [k, v] of Object.entries(p)) root.style.setProperty(k, v);
}

const ROWS = SCHEMA.flatMap((g) => g.rows);
const ROW_BY_ID = new Map(ROWS.map((r) => [r.id, r]));

export class SettingsStore {
  constructor(ctx) {
    this.ctx = ctx;
    this.values = Object.create(null);
    for (const r of ROWS) this.values[r.id] = r.dflt;
    this._saveT = 0;
    this._listeners = new Set();
    this._load();
    installReach(ctx);   // M1.6m: the input layer's pad and latches read the game through these hooks
    /**
     * The audio lane keeps its own persisted volumes; if it already restored a
     * value that this store has never been told about (first run after the
     * audio lane landed), adopt ITS number rather than stamping a default over
     * a slider the player already moved.
     */
    const vols = ctx.audio?.volumes?.();
    if (vols && !this._stored) {
      for (const bus of AUDIO_BUSES) {
        if (typeof vols[bus] === 'number') this.values[`vol_${bus}`] = vols[bus];
      }
      if (typeof vols.muted === 'boolean') this.values.muted = vols.muted;
    }
    this.applyAll();
  }

  /* -------------------------------------------------------------- storage */

  _load() {
    this._stored = false;
    let raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch { /* private mode */ }
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return;
      for (const r of ROWS) {
        const v = saved[r.id];
        if (v === undefined) continue;
        this.values[r.id] = this._coerce(r, v);
      }
      this._stored = true;
    } catch { /* corrupt payload: defaults stand */ }
  }

  _coerce(row, v) {
    if (row.kind === 'toggle') return !!v;
    if (row.kind === 'choice') return row.options.some(([id]) => id === v) ? v : row.dflt;
    const n = Number(v);
    if (!Number.isFinite(n)) return row.dflt;
    return Math.min(row.max, Math.max(row.min, n));
  }

  save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.values)); } catch { /* ignore */ }
  }

  /* ---------------------------------------------------------------- api */

  get(id) { return this.values[id]; }

  /** Set + apply + persist + notify. Returns the coerced value. */
  set(id, value) {
    const row = ROW_BY_ID.get(id);
    if (!row) return undefined;
    const v = this._coerce(row, value);
    this.values[id] = v;
    this._applyRow(row);
    // A setting that feeds another setting's apply rule (reducedMotion gates
    // cameraShake) re-runs the dependant so the pair can never disagree.
    if (id === 'reducedMotion') this._applyRow(ROW_BY_ID.get('cameraShake'));
    this.save();
    this._notify(id, v);
    return v;
  }

  reset() {
    for (const r of ROWS) this.values[r.id] = r.dflt;
    this.applyAll();
    this.save();
    this._notify('*', null);
  }

  applyAll() {
    for (const r of ROWS) this._applyRow(r);
  }

  _applyRow(row) {
    if (!row) return;
    try { row.apply?.(this.values[row.id], this.ctx, this); }
    catch (err) { console.warn(`[settings] ${row.id}:`, err?.message || err); }
  }

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

  _notify(id, value) {
    for (const fn of this._listeners) {
      try { fn(id, value); } catch (err) { console.warn('[settings] listener:', err?.message || err); }
    }
    try { this.ctx.events?.emit?.('settings-changed', { id, value, values: { ...this.values } }); }
    catch { /* events.js walks its set unguarded — never let it unwind a click */ }
  }

  /** Everything a gate needs in one object. */
  audit() {
    return {
      stored: this._stored,
      values: { ...this.values },
      applied: {
        sensitivity: this.ctx.settings?.sensitivity,
        invertY: this.ctx.settings?.invertY,
        fov: this.ctx.settings?.fov,
        cameraShake: this.ctx.settings?.cameraShake,
        reducedMotion: this.ctx.settings?.reducedMotion,
        inputIsCtxSettings: this.ctx.input?.settings === this.ctx.settings,
        hudScale: this.ctx.settings?.hudScale,
        hudScaleVar: (this.ctx.hud?.rootEl ?? document.getElementById('hud'))?.style
          ?.getPropertyValue?.('--hud-scale')?.trim?.() ?? '',
        accent: getComputedStyle(document.documentElement).getPropertyValue('--cal-c-weak').trim(),
        audio: this.ctx.audio?.volumes?.() ?? null,
      },
      raw: (() => { try { return localStorage.getItem(STORE_KEY); } catch { return null; } })(),
    };
  }
}

/* ========================================================================= */
/* panel                                                                     */
/* ========================================================================= */

const el = (tag, cls, parent, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  if (parent) parent.appendChild(n);
  return n;
};

/** Player words for `input.js`'s action names (bible §5.9). */
const BIND_WORD = {
  forward: 'Forward', back: 'Back', left: 'Left', right: 'Right', jump: 'Jump and mantle', dodge: 'Dodge roll',
  sprint: 'Sprint / Steady', walk: 'Walk', crouch: 'Crouch', heal: 'Drink from the Gourd', interact: 'Interact',
  focus: 'Raise the Alidade', plant: 'Plant the Windwall', cast: 'Cast', tool: 'Hook-rip', slot1: 'Quick slot 1', slot2: 'Quick slot 2',
  slot3: 'Quick slot 3', slot4: 'Quick slot 4',
};
/** Pad words for input.js's ACTION_PAD (`bN`, `bN@context`, `bN~` a tap that cycles). */
const PAD_WORD = { b0: 'A', b1: 'B', b2: 'X', b3: 'Y', b4: 'LB', b5: 'RB', b8: 'SELECT', b9: 'START', b10: 'L3', b11: 'R3',
  b12: 'UP', b13: 'DOWN', b14: 'LEFT', b15: 'RIGHT' };
const PAD_CTX = { guard: 'WHILE GUARDING', sight: 'WHILE SIGHTING', aim: 'WHILE AIMING' };
const padWord = (pad) => String(pad).split('+').map((b) => {
  const m = /^(b\d+)(~)?(?:@(\w+))?$/.exec(b);
  if (!m) return b.toUpperCase();
  return [PAD_WORD[m[1]] ?? m[1].toUpperCase(), m[2] ? 'TAP' : '', m[3] ? PAD_CTX[m[3]] ?? m[3].toUpperCase() : ''].filter(Boolean).join(' ');
}).join(' + ');
const keyCap = (code) => String(code ?? '---').replace(/^Key/, '').replace(/^Digit/, '')
  .replace(/Left$|Right$/, (m) => (/^(Shift|Control|Alt)/.test(String(code)) ? '' : m)).toUpperCase();

/**
 * Renders the schema into `host`. Rebuilt on mount (cheap: ~20 rows) so the
 * panel can never show a stale value after a reset or a load.
 */
export class SettingsPanel {
  constructor(ctx, store) {
    this.ctx = ctx;
    this.store = store;
    this.root = null;
    this._rowEls = new Map();
    this._unsub = store.onChange((id) => { if (id === '*') this.refresh(); });
  }

  /**
   * The panel (M1.6g2): its pages as tabs across the top with the lilac underline (GRAPHICS · CONTROLS · READING ·
   * AUDIO), one page at a time. CONTROLS carries every key under REBIND, with RESET. Every row of every page is
   * built (hidden pages stay in the DOM), so a gate or a reader finds any control by its id on any page.
   */
  mount(host) {
    this.root = el('div', 'mn-settings gs-settings', host);
    this._rowEls.clear();
    const tabs = el('nav', 'gs-set-tabs', this.root);
    const pages = el('div', 'gs-set-pages', this.root);
    this._pages = new Map();
    this._pageBtns = new Map();
    for (const [id, word] of PAGES) {
      const b = el('button', 'gs-set-tab', tabs, word);
      b.dataset.page = id;
      b.addEventListener('click', () => this.showPage(id));
      this._pageBtns.set(id, b);
      this._pages.set(id, el('div', 'gs-set-page', pages));
    }
    for (const group of SCHEMA) {
      const page = this._pages.get(group.page) ?? this._pages.get('graphics');
      const sec = el('section', 'mn-set-group', page);
      el('h3', 'mn-set-title', sec, group.group);
      for (const row of group.rows) this._buildRow(sec, row);
      if (group.page === 'graphics' || group.page === 'reading') {
        el('div', 'mn-set-note gs-set-pend', page, 'A row marked STORED is kept for the next build; this one does not apply it yet.');
      }
    }
    this._buildBinds(this._pages.get('controls'));
    const foot = el('div', 'mn-set-foot', tabs);
    const reset = el('button', 'mn-btn small', foot, 'RESTORE DEFAULTS');
    reset.addEventListener('click', () => { this.store.reset(); this.refresh(); });
    this.showPage(this._page ?? 'graphics');
    return this.root;
  }

  showPage(id) {
    if (!this._pages?.has(id)) return false;
    this._page = id;
    for (const [k, n] of this._pages) n.classList.toggle('on', k === id);
    for (const [k, b] of this._pageBtns) b.classList.toggle('on', k === id);
    return true;
  }

  _buildRow(sec, row) {
    const r = el('div', `mn-set-row ${row.kind}`, sec);
    const label = el('label', 'mn-set-label', r, row.label);
    // what the game does today, in the player's words: the toggle is stored, the body still holds
    if (row.pending) el('span', 'mn-set-pending', label, 'STORED');
    const ctrl = el('div', 'mn-set-ctrl', r);
    let read;

    if (row.kind === 'slider') {
      const input = el('input', 'mn-range', ctrl);
      input.type = 'range';
      input.min = String(row.min); input.max = String(row.max); input.step = String(row.step);
      input.id = `set-${row.id}`;
      const val = el('span', 'mn-set-val', ctrl);
      const paint = () => {
        const v = this.store.get(row.id);
        input.value = String(v);
        val.textContent = row.fmt ? row.fmt(v) : String(v);
        const k = (v - row.min) / (row.max - row.min);
        input.style.setProperty('--k', `${Math.round(k * 100)}%`);
      };
      input.addEventListener('input', () => { this.store.set(row.id, parseFloat(input.value)); paint(); });
      read = paint;
    } else if (row.kind === 'toggle') {
      const btn = el('button', 'mn-toggle', ctrl);
      btn.id = `set-${row.id}`;
      const paint = () => {
        const on = !!this.store.get(row.id);
        btn.classList.toggle('on', on);
        btn.textContent = on ? 'ON' : 'OFF';
        btn.setAttribute('aria-pressed', String(on));
      };
      btn.addEventListener('click', () => { this.store.set(row.id, !this.store.get(row.id)); paint(); this.refresh(); });
      read = paint;
    } else {
      const seg = el('div', 'mn-seg', ctrl);
      seg.id = `set-${row.id}`;
      const btns = row.options.map(([id, text]) => {
        const b = el('button', 'mn-seg-btn', seg, text);
        b.dataset.value = id;
        b.addEventListener('click', () => { this.store.set(row.id, id); read(); });
        return b;
      });
      read = () => {
        const v = this.store.get(row.id);
        for (const b of btns) b.classList.toggle('on', b.dataset.value === v);
      };
    }

    if (row.note) el('div', 'mn-set-hint', r, row.note);
    this._rowEls.set(row.id, read);
    read();
  }

  /**
   * THE KEYS: every action `input.js` names, rebindable through its own `bind()`.
   * Listing them here is `A-input-actions`' settings clause (R38). Click, then press.
   */
  _buildBinds(host) {
    const input = this.ctx.input;
    if (!input?.bind) return;
    const names = ACTIONS;
    const sec = el('section', 'mn-set-group mn-set-binds', host);
    sec.dataset.rebind = 'list';
    const bh = el('h3', 'mn-set-title gs-bind-head', sec, 'REBIND');
    const rst = el('button', 'mn-btn small', bh, 'RESET');
    rst.addEventListener('click', (e) => { e.stopPropagation(); this._resetBinds(); });
    el('div', 'mn-set-note', sec, 'Click a key, then press the new one. A gamepad button drives the key beside it.');
    const word = (a) => BIND_WORD[a] ?? a.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    for (const action of names) {
      const r = el('div', 'mn-set-row', sec);
      el('label', 'mn-set-label', r, word(action));
      const ctrl = el('div', 'mn-set-ctrl', r);
      if (ACTION_PAD[action]) el('span', 'mn-set-pad', ctrl, padWord(ACTION_PAD[action]));
      const btn = el('button', 'mn-bind', ctrl);
      btn.dataset.rebind = action;
      const paint = () => { btn.textContent = keyCap(input.codeFor(action)); btn.classList.remove('wait'); };
      btn.addEventListener('click', () => this._captureBind(action, btn, paint));
      this._rowEls.set(`bind:${action}`, paint);
      paint();
    }
  }

  /** RESET: every key back to the build's default. */
  _resetBinds() {
    const input = this.ctx.input;
    if (!input?.bind) return;
    for (const action of ACTIONS) if (DEFAULT_BINDS[action]) input.bind(action, DEFAULT_BINDS[action]);
    if (input.settings?.binds) input.settings.binds = {};
    this.refresh();
  }

  _captureBind(action, btn, paint) {
    if (this._capture) this._capture();
    btn.textContent = 'press a key';
    btn.classList.add('wait');
    const onKey = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      done();
      if (e.code !== 'Escape') this.ctx.input.bind(action, e.code);
      paint();
    };
    const done = () => {
      window.removeEventListener('keydown', onKey, true);
      this._capture = null;
    };
    this._capture = () => { done(); paint(); };
    window.addEventListener('keydown', onKey, true);
  }

  refresh() { for (const paint of this._rowEls.values()) paint(); }

  dispose() { this._capture?.(); this._unsub?.(); this.root?.remove(); this.root = null; }
}
