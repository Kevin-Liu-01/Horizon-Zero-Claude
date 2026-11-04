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

import { ACTIONS, ACTION_PAD } from '../core/input.js';

const STORE_KEY = 'cal.settings.v5';

/**
 * Okabe-Ito derived palettes, re-pointing only the semantic `--cal-c-*` colours the
 * whole UI reads: staff + margin, weak point, Pry, wary and hostile pips, gain.
 */
export const PALETTES = {
  off: null,
  protanopia: {
    '--cal-c-staff': '#E69F00', '--cal-c-weak': '#0072B2', '--cal-c-pry': '#56B4E9',
    '--cal-c-wary': '#F0E442', '--cal-c-hostile': '#CC79A7', '--cal-c-good': '#6FCE8E',
  },
  deuteranopia: {
    '--cal-c-staff': '#E08A00', '--cal-c-weak': '#0072B2', '--cal-c-pry': '#4FA8DD',
    '--cal-c-wary': '#F5E35B', '--cal-c-hostile': '#C07EC0', '--cal-c-good': '#56B4E9',
  },
  tritanopia: {
    '--cal-c-staff': '#D55E00', '--cal-c-weak': '#1FA06A', '--cal-c-pry': '#B3201F',
    '--cal-c-wary': '#E8654F', '--cal-c-hostile': '#D0417A', '--cal-c-good': '#6FCE8E',
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
  { group: 'CONTROLS', rows: [
    { id: 'sensitivity', kind: 'slider', label: 'Look sensitivity', min: 0.25, max: 3, step: 0.05, dflt: 1,
      fmt: (v) => `${v.toFixed(2)}×`, apply: (v, ctx) => { ctx.settings.sensitivity = v; } },
    { id: 'padSensitivity', kind: 'slider', label: 'Gamepad sensitivity', min: 0.25, max: 3, step: 0.05, dflt: 1,
      fmt: (v) => `${v.toFixed(2)}×`, apply: (v, ctx) => { ctx.settings.padSensitivity = v; } },
    { id: 'invertY', kind: 'toggle', label: 'Invert vertical look', dflt: false,
      apply: (v, ctx) => { ctx.settings.invertY = !!v; } },
    { id: 'padDeadzone', kind: 'slider', label: 'Stick deadzone', min: 0.05, max: 0.4, step: 0.01, dflt: 0.16,
      fmt: (v) => v.toFixed(2), apply: (v, ctx) => { ctx.settings.padDeadzone = v; } },
    { id: 'holdAim', kind: 'choice', label: 'Aim', dflt: 'hold', pending: true,
      options: [['hold', 'HOLD'], ['toggle', 'TOGGLE']],
      apply: (v, ctx) => { ctx.settings.holdAim = v; } },
    { id: 'holdSprint', kind: 'choice', label: 'Sprint', dflt: 'hold', pending: true,
      options: [['hold', 'HOLD'], ['toggle', 'TOGGLE']],
      apply: (v, ctx) => { ctx.settings.holdSprint = v; } },
    // LIVE: `menu.js` releases the crouch on the KeyC up-edge when this reads 'hold'.
    { id: 'holdCrouch', kind: 'choice', label: 'Crouch', dflt: 'toggle',
      options: [['hold', 'HOLD'], ['toggle', 'TOGGLE']],
      note: 'Toggle is the default; HOLD releases her on key-up.',
      apply: (v, ctx) => { ctx.settings.holdCrouch = v; } },
  ] },
  { group: 'CAMERA', rows: [
    // dflt 55 = player.js FOV_BASE: the neutral position is the value the build ships with
    { id: 'fov', kind: 'slider', label: 'Field of view', min: 50, max: 95, step: 1, dflt: 55,
      fmt: (v) => `${v | 0}°`, apply: (v, ctx) => { ctx.settings.fov = v; } },
    { id: 'cameraShake', kind: 'slider', label: 'Camera shake', min: 0, max: 1.5, step: 0.05, dflt: 1,
      fmt: (v) => `${Math.round(v * 100)}%`,
      apply: (v, ctx, s) => { ctx.settings.cameraShake = s.get('reducedMotion') ? 0 : v; } },
    { id: 'cameraSmoothing', kind: 'slider', label: 'Camera smoothing', min: 0, max: 1.5, step: 0.05, dflt: 1,
      fmt: (v) => `${Math.round(v * 100)}%`, apply: (v, ctx) => { ctx.settings.cameraSmoothing = v; } },
  ] },
  { group: 'INTERFACE', rows: [
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
    { id: 'reducedMotion', kind: 'toggle', label: 'Reduced motion', dflt: false,
      note: 'Stills the camera shake, the compass inertia and every UI animation.',
      apply: (v, ctx, s) => {
        ctx.settings.reducedMotion = !!v;
        ctx.settings.cameraShake = v ? 0 : s.get('cameraShake');
        document.body.classList.toggle('cal-reduced-motion', !!v);
      } },
    { id: 'menuTips', kind: 'toggle', label: 'Show menu tips', dflt: true,
      apply: (v, ctx) => { ctx.settings.menuTips = !!v; } },
  ] },
  { group: 'AUDIO', rows: AUDIO_BUSES.map((bus) => ({
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
const PAD_WORD = { b5: 'RB', b12: 'UP', b13: 'DOWN', b14: 'LEFT', b15: 'RIGHT', b16: 'HOME' };
const padWord = (pad) => String(pad).split('+').map((b) => PAD_WORD[b] ?? b.toUpperCase()).join(' + ');
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

  mount(host) {
    this.root = el('div', 'mn-settings', host);
    this._rowEls.clear();
    // three columns: how it handles, how it sounds and restores, the keys. Every row on the page.
    const colA = el('div', 'mn-set-col', this.root);
    const colB = el('div', 'mn-set-col', this.root);
    const colC = el('div', 'mn-set-col', this.root);
    for (const group of SCHEMA) {
      const sec = el('section', 'mn-set-group', group.group === 'AUDIO' ? colB : colA);
      el('h3', 'mn-set-title', sec, group.group);
      for (const row of group.rows) this._buildRow(sec, row);
    }
    this._buildBinds(colC);
    const foot = el('div', 'mn-set-foot', colB);
    const reset = el('button', 'mn-btn small', foot, 'RESTORE DEFAULTS');
    reset.addEventListener('click', () => { this.store.reset(); this.refresh(); });
    el('div', 'mn-set-note', foot,
      'Saved to this browser as <code>cal.settings.v5</code> — restored on the next launch.');
    return this.root;
  }

  _buildRow(sec, row) {
    const r = el('div', `mn-set-row ${row.kind}`, sec);
    const label = el('label', 'mn-set-label', r, row.label);
    if (row.pending) el('span', 'mn-set-pending', label, 'NOT LIVE YET');
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
    el('h3', 'mn-set-title', sec, 'KEYS');
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
