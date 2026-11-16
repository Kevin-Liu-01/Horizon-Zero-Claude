/**
 * Keyboard + pointer-lock mouse + Gamepad input.  Lane: `player-control`.
 *
 * Round 4 (camera-feel-13 "no options, no gamepad"):
 *   · an ACTION layer (`binds`) so every consumer can ask for an intent rather
 *     than a scancode, and a settings panel can rebind one without touching
 *     the consumer;
 *   · a PRESS BUFFER — `pressedWithin(code, s)` / `consume(code)` — so a dodge
 *     or a jump pressed 0.2 s before the controller could accept it still
 *     fires (dodge-iframes wants a 0.25 s buffer);
 *   · the **Gamepad API**, mapped onto the SAME code path as the keyboard:
 *     a pad button is a synthetic keydown / keyup of its mapped
 *     `KeyboardEvent.code` on window (M1.6m: so the hub, the dialogue and the
 *     title hear it too), and the triggers drive `mouse.buttons`, so aim,
 *     fire, the crouch toggle and every existing `input.isDown('…')` consumer
 *     work on a controller with no changes anywhere else. Out of play the pad
 *     walks the page's controls (uiFocus / uiPress);
 *   · M1.6m HOLD OR TOGGLE for aim, Steady and re-survey (the latches).
 *
 * `settings` is assigned by `Player` (it owns ctx.settings defaults); until
 * then the defaults below apply.  Nothing here reads ctx, so Input stays
 * constructible from `main.js` with one argument (that file is frozen).
 */

/**
 * THE PAD (M1.6m; BIBLE §12 "Gamepad"). Standard-mapping button index -> the KeyboardEvent.code it stands for in
 * play. A pad button is delivered as a synthetic `keydown` / `keyup` on `window`, so every listener that reads the
 * keyboard (this layer's own handlers, the hub, the dialogue presenter, the settings' rebind) hears the pad with no
 * pad code of its own. A function entry picks its code at the press from the game's context (`input.hooks`), and the
 * release goes to the same code.
 *
 *   A jump (plant the Windwall while guarding) · B dodge, fold the kite · X interact, climb, re-survey, sit
 *   Y hook-rip and make (R) · LB Kit Rack (hold) · RB cast · Select map · Start hub · L3 sprint, Steady while aiming
 *   R3 crouch (take a bearing while Sighting) · D-up Alidade · D-down Gourd (hold) · D-left whistle (arrow type -
 *   while aiming) · D-right quick slots: tap cycles, hold quick-makes (arrow type + while aiming)
 *   LT aim or guard (RMB) · RT loose, strike (LMB)
 */
const PAD_PLAY = {
  0: (h) => (h.guarding?.() ? 'KeyX' : 'Space'),
  1: 'ControlLeft',
  2: 'KeyE',
  3: 'KeyR',
  4: 'Tab',
  5: 'KeyF',
  8: 'KeyM',
  9: 'Escape',
  10: 'ShiftLeft',
  11: (h) => (h.sighting?.() ? 'KeyT' : 'KeyC'),
  12: 'KeyV',
  13: 'KeyQ',
  14: (h, inp) => (inp.mouseDown(2) ? 'KeyZ' : 'KeyG'),
  15: (h, inp) => (inp.mouseDown(2) ? 'KeyX' : 'slot'),
};
/**
 * Out of play (the title, a menu, the hub, a dialogue, the death card) the pad drives the page: the D-pad and the
 * left stick move the focus between the visible controls (`input.uiFocus`), A presses the focused one (Enter when
 * none is), B and Start back out (Escape), LB and RB cycle the hub's tabs (Q, E).
 */
const PAD_UI = { 0: 'Enter', 1: 'Escape', 9: 'Escape', 4: 'KeyQ', 5: 'KeyE', 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight' };
/** Triggers drive mouse buttons so combat/aim need no pad-specific code. */
const PAD_TRIGGER = { 6: 2, 7: 0 };   // LT -> RMB (aim), RT -> LMB (draw/fire)
const TRIGGER_ON = 0.55;
const TRIGGER_OFF = 0.35;
/** D-right: a press shorter than this is a tap (cycle the slot); held past it, the slot in hand is held (quick-make). */
const SLOT_TAP_S = 0.25;
/** Out of play, a held D-pad direction repeats after this, then every UI_REPEAT_S. */
const UI_DELAY_S = 0.42;
const UI_REPEAT_S = 0.13;
/** What a code is called in a synthetic event's `key` (the listeners read `code`; `key` only for completeness). */
const KEY_OF = { Space: ' ', Enter: 'Enter', Escape: 'Escape', Tab: 'Tab', ShiftLeft: 'Shift', ControlLeft: 'Control',
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };
const keyOf = (code) => KEY_OF[code] ?? (/^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : /^Digit\d$/.test(code) ? code.slice(5) : code);

/** Default action -> code table.  `settings.binds` overrides entries by name. */
export const DEFAULT_BINDS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', dodge: 'ControlLeft', sprint: 'ShiftLeft', walk: 'AltLeft',
  crouch: 'KeyC', heal: 'KeyQ', interact: 'KeyE', focus: 'KeyV',
  plant: 'KeyX', cast: 'KeyF', tool: 'KeyR', slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4',
};
/**
 * Action -> its pad control (BIBLE §12 "Gamepad"), for the settings page's REBIND list. `bN` is a button; `bN@x`
 * is that button in a context (guard, sight, aim); `bN~` is a tap that cycles.
 */
export const ACTION_PAD = {
  jump: 'b0', dodge: 'b1', interact: 'b2', tool: 'b3', cast: 'b5', sprint: 'b10', crouch: 'b11',
  focus: 'b12', heal: 'b13', plant: 'b0@guard', slot1: 'b15~', slot2: 'b15~', slot3: 'b15~', slot4: 'b15~',
};
export const ACTIONS = Object.keys(DEFAULT_BINDS);

/**
 * HOLD OR TOGGLE (BIBLE §18 "Settings: controls": aim, Steady and re-survey). In TOGGLE a press latches the control
 * down and the next press lets it go; the release in between is not delivered. Steady latches only while she aims and
 * lets go with the aim; re-survey latches E only while `hooks.longHold()` names a long hold (a benchmark's 15 s) and
 * lets go when that hold is no longer the one in front of her (done, or she walked off).
 */
const LATCH_AIM = 'Mouse2';
const DEFAULTS = {
  sensitivity: 1,
  padSensitivity: 1,
  invertY: false,
  padDeadzone: 0.16,
  padLookRate: 2.9,   // rad/s at full stick before sensitivity
  holdAim: 'hold',
  holdSteady: 'hold',
  holdResurvey: 'hold',
};

export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.mouse = { dx: 0, dy: 0, buttons: 0, wheel: 0 };
    this.pointerLocked = false;
    this.enabled = false;
    this._downHandlers = new Map(); // code -> Set<fn>
    this._upHandlers = new Map();

    /** Assigned by Player from ctx.settings; defaults until then. */
    this.settings = null;
    /**
     * The game's context for the pad and the latches, installed by src/ui/reach.js (this file reads no ctx):
     * ui() the page has the pad (not in play) · sighting() · guarding() · slots() { active, list } for D-right ·
     * longHold() the interaction a toggled E would hold (null when none).
     */
    this.hooks = {};
    this.binds = { ...DEFAULT_BINDS };
    try { Object.assign(this.binds, JSON.parse(localStorage.getItem('cal.binds.v5') || '{}')); } catch { /* none */ }

    /** code -> wallclock seconds of the most recent press (the press buffer). */
    this._pressT = new Map();
    this._clock = 0;

    /** Analog move intent, merged from WASD and the left stick. */
    this.move = { x: 0, y: 0 };

    this.gamepad = {
      connected: false, id: '', index: -1,
      axes: { lx: 0, ly: 0, rx: 0, ry: 0 },
      look: { x: 0, y: 0 },     // -1..1, already dead-zoned
      move: { x: 0, y: 0 },
      buttons: new Set(),
      lt: 0, rt: 0,
    };
    /** pad button index -> { code, ui, t0, slot } of the press it made (the release goes to the same code) */
    this._padHeld = new Map();
    this._padTrig = new Set();
    this._padScan = 0;
    /** latched controls (TOGGLE): code -> { why, keep() } */
    this._latch = new Map();
    /** the pad's log for a gate: the last 40 presses as { b, code, ui, t } */
    this.padLog = [];
    /** set while a synthetic pad event is being delivered (the keydown listener below reads it) */
    this._synth = false;

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      // keep game keys from stealing browser focus / scrolling while playing
      if (e.code === 'Tab' || e.code === 'Space' || e.code === 'KeyI') e.preventDefault();
      if (e.repeat) return;
      if (this._toggleDown(e.code)) return;
      this._press(e.code, e);
    });
    window.addEventListener('keyup', (e) => {
      if (this._latch.has(e.code)) return;   // latched (TOGGLE): the release is not delivered
      this.keys.delete(e.code);
      if (!this.enabled) return;
      this._upHandlers.get(e.code)?.forEach((fn) => fn(e));
    });
    window.addEventListener('blur', () => { this.keys.clear(); this._latch.clear(); });

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this._buttonDown(e.button, e);
    });
    document.addEventListener('mouseup', (e) => {
      this._buttonUp(e.button, e);
    });
    document.addEventListener('wheel', (e) => {
      if (this.enabled) this.mouse.wheel += e.deltaY;
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement != null;
    });

    window.addEventListener('gamepadconnected', (e) => {
      this.gamepad.index = e.gamepad.index;
      this.gamepad.id = e.gamepad.id || '';
      this._padScan = 0;
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if (this.gamepad.index === e.gamepad.index) this._padClear();
    });

    // the pad's buttons are read on their own animation frame, so the pad works in every state: the game only polls
    // (below) while the world runs, and a dialogue, the hub or the death card is exactly when it does not
    if (typeof requestAnimationFrame === 'function') {
      let last = 0;
      const loop = (t) => {
        const dt = last ? Math.min(0.1, Math.max(0, (t - last) / 1000)) : 0;
        last = t;
        try { this._padFrame(dt); } catch (err) { if (!this._padErr) { this._padErr = true; console.warn('[input] pad:', err); } }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  /* ------------------------------ settings ------------------------------ */

  opt(name) {
    const s = this.settings;
    const v = s ? s[name] : undefined;
    return v === undefined || v === null ? DEFAULTS[name] : v;
  }

  /** Rebind one action (`settings.binds` is honoured first, then this). */
  bind(action, code) {
    this.binds[action] = code;
    const o = {}; for (const k of ACTIONS) if (this.binds[k] !== DEFAULT_BINDS[k]) o[k] = this.binds[k];
    try { localStorage.setItem('cal.binds.v5', JSON.stringify(o)); } catch { /* private mode */ }
  }
  codeFor(action) {
    const s = this.settings && this.settings.binds;
    return (s && s[action]) || this.binds[action] || null;
  }
  actionDown(action) {
    const c = this.codeFor(action);
    return c ? this.keys.has(c) : false;
  }

  /* --------------------------- press plumbing --------------------------- */

  _press(code, ev) {
    this.keys.add(code);
    this._pressT.set(code, this._clock);
    this._downHandlers.get(code)?.forEach((fn) => fn(ev));
  }

  _buttonDown(b, ev) {
    const code = `Mouse${b}`;
    if (code === LATCH_AIM && this.opt('holdAim') === 'toggle') {
      if (this._latch.has(code)) { this._latch.delete(code); this._buttonRelease(b, ev); return; }
      this._latch.set(code, { why: 'aim', keep: null });
    }
    this.mouse.buttons |= 1 << b;
    this._pressT.set(code, this._clock);
    this._downHandlers.get(code)?.forEach((fn) => fn(ev));
  }

  _buttonUp(b, ev) {
    if (this._latch.has(`Mouse${b}`)) return;   // latched (TOGGLE aim)
    this._buttonRelease(b, ev);
  }

  _buttonRelease(b, ev) {
    this.mouse.buttons &= ~(1 << b);
    if (!this.enabled) return;
    this._upHandlers.get(`Mouse${b}`)?.forEach((fn) => fn(ev));
  }

  /**
   * TOGGLE for Steady and re-survey, on a key's down edge. Returns true when the press was a toggle's second press
   * (the latch let go: the key's up is delivered, the down is not).
   */
  _toggleDown(code) {
    const L = this._latch.get(code);
    if (L) { this._release(code); return true; }
    const steady = this.codeFor('sprint') || 'ShiftLeft';
    if (code === steady && this.opt('holdSteady') === 'toggle' && this.mouseDown(2)) {
      this._latch.set(code, { why: 'steady', keep: () => this.mouseDown(2) });
    } else if (code === (this.codeFor('interact') || 'KeyE') && this.opt('holdResurvey') === 'toggle') {
      const hold = this.hooks.longHold?.();
      if (hold) this._latch.set(code, { why: 'resurvey', keep: () => this.hooks.longHold?.() === hold });
    }
    return false;
  }

  /** Let a latched key go: its up is delivered as if the key came up now. */
  _release(code) {
    this._latch.delete(code);
    if (code.startsWith('Mouse')) { this._buttonRelease(Number(code.slice(5)), { code, latch: true }); return; }
    this.keys.delete(code);
    if (this.enabled) this._upHandlers.get(code)?.forEach((fn) => fn({ code, latch: true }));
  }

  /** Latches whose reason has passed let go (Steady with the aim; re-survey when its hold is done or left). */
  _keepLatches() {
    if (!this._latch.size) return;
    const out = this._uiMode();   // a menu, a dialogue or the death card lets every latch go
    for (const [code, L] of this._latch) {
      if (out) { this._release(code); continue; }
      if (L.keep && !L.keep()) this._release(code);
      else if (L.why === 'aim' && this.opt('holdAim') !== 'toggle') this._release(code);
    }
  }

  /** What the latches hold now (a gate reads it). */
  latches() { return [...this._latch].map(([code, L]) => ({ code, why: L.why })); }

  /** Monotonic input clock in seconds (real time, never scaled). */
  get now() { return this._clock; }

  /** Seconds since `code` was last pressed (Infinity if never). */
  sincePress(code) {
    const t = this._pressT.get(code);
    return t === undefined ? Infinity : this._clock - t;
  }
  /** Was `code` pressed within the last `window` seconds and not consumed? */
  pressedWithin(code, window = 0.25) { return this.sincePress(code) <= window; }
  /** Eat a buffered press so it cannot fire twice. */
  consume(code) { this._pressT.delete(code); }

  /* ------------------------------ gamepad ------------------------------- */

  /** A synthetic key event on window: every keyboard listener hears the pad as a key. */
  _emitKey(type, code) {
    let ev;
    try { ev = new KeyboardEvent(type, { code, key: keyOf(code), bubbles: true, cancelable: true }); } catch { return; }
    ev.gamepad = true;
    window.dispatchEvent(ev);
  }

  _padClear() {
    const g = this.gamepad;
    for (const [, h] of this._padHeld) if (h.code && h.sent) this._emitKey('keyup', h.code);
    this._padHeld.clear();
    for (const b of this._padTrig) this._buttonRelease(PAD_TRIGGER[b], { gamepad: true });
    this._padTrig.clear();
    g.connected = false; g.index = -1; g.id = '';
    g.axes.lx = g.axes.ly = g.axes.rx = g.axes.ry = 0;
    g.look.x = g.look.y = 0; g.move.x = g.move.y = 0;
    g.lt = g.rt = 0;
    g.buttons.clear();
  }

  /** The pad, or null. `navigator.getGamepads()` allocates, so with none attached it is scanned twice a second. */
  _readPad() {
    const g = this.gamepad;
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    this._padScan = (this._padScan | 0) + 1;
    if (!g.connected && this._padScan % 30 !== 1) return null;
    const pads = navigator.getGamepads();
    let pad = null;
    if (pads) {
      if (g.index >= 0 && pads[g.index] && pads[g.index].connected !== false) pad = pads[g.index];
      else for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected !== false) { pad = pads[i]; g.index = i; break; }
    }
    if (!pad) { if (g.connected) this._padClear(); return null; }
    g.connected = true;
    g.id = pad.id || g.id;
    return pad;
  }

  /** Is the page (not the world) the pad's? */
  _uiMode() {
    const f = this.hooks.ui;
    return f ? !!f() : !this.enabled;
  }

  /**
   * One animation frame of the pad's buttons: edges become synthetic keys (in play: PAD_PLAY; out of play: PAD_UI and
   * the focus), the triggers become mouse buttons, D-right's tap-or-hold resolves, a held D-pad repeats in a menu.
   */
  _padFrame(dt) {
    const pad = this._readPad();
    if (!pad) return;
    const g = this.gamepad;
    const ui = this._uiMode();
    const btns = pad.buttons || [];
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    g.buttons.clear();
    // the left stick as a D-pad out of play (menus are walked with either)
    const ax = pad.axes || [];
    const stickDir = ui ? (Math.abs(ax[1] ?? 0) > 0.6 ? ((ax[1] > 0) ? 13 : 12) : Math.abs(ax[0] ?? 0) > 0.6 ? ((ax[0] > 0) ? 15 : 14) : -1) : -1;
    const n = Math.max(btns.length, 17);
    for (let i = 0; i < n; i++) {
      const b = btns[i];
      let on = b == null ? false : typeof b === 'object' ? (b.pressed || b.value > 0.6) : b > 0.6;
      if (i === stickDir) on = true;
      if (on) g.buttons.add(i);
      const trig = PAD_TRIGGER[i];
      if (trig !== undefined) {
        const v = b == null ? 0 : typeof b === 'object' ? b.value : b;
        if (i === 6) g.lt = v; else g.rt = v;
        const held = this._padTrig.has(i);
        if (!held && v >= TRIGGER_ON && !ui && this.enabled) {
          this._padTrig.add(i);
          this._buttonDown(trig, { gamepad: true, button: trig });
          this._log(i, `Mouse${trig}`, false);
        } else if (held && (v <= TRIGGER_OFF || ui)) {
          this._padTrig.delete(i);
          this._buttonUp(trig, { gamepad: true, button: trig });
        }
        continue;
      }
      const h = this._padHeld.get(i);
      if (on && !h) this._padDown(i, ui, now);
      else if (!on && h) this._padUp(i, h);
      else if (on && h) this._padHold(i, h, now);
    }
  }

  _log(b, code, ui) {
    this.padLog.push({ b, code, ui, t: +this._clock.toFixed(3) });
    if (this.padLog.length > 40) this.padLog.shift();
  }

  _padDown(i, ui, now) {
    const h = { code: null, ui, t0: now, tRep: now + UI_DELAY_S, sent: false, slot: false };
    this._padHeld.set(i, h);
    if (ui) {
      const code = PAD_UI[i];
      if (!code) return;
      h.code = code;
      this._log(i, code, true);
      if (code === 'Enter' && this.uiPress()) return;   // the focused control was pressed
      if (code.startsWith('Arrow') && this.uiFocus(code)) return;
      this._emitKey('keydown', code); h.sent = true;
      return;
    }
    let code = PAD_PLAY[i];
    if (typeof code === 'function') code = code(this.hooks, this);
    if (!code) return;
    if (code === 'slot') { h.slot = true; this._log(i, 'slot', false); return; }   // resolved on release or at SLOT_TAP_S
    h.code = code;
    this._log(i, code, false);
    this._emitKey('keydown', code); h.sent = true;
  }

  _padHold(i, h, now) {
    if (h.slot && !h.code && now - h.t0 >= SLOT_TAP_S) {
      // held: the slot in hand is held down (quick-make runs on its own 1.2 s)
      const s = this.hooks.slots?.();
      const n = s?.active ?? 1;
      h.code = `Digit${n}`;
      this._log(i, h.code, false);
      this._emitKey('keydown', h.code); h.sent = true;
    } else if (h.ui && h.code && h.code.startsWith('Arrow') && now >= h.tRep) {
      h.tRep = now + UI_REPEAT_S;
      if (!this.uiFocus(h.code)) this._emitKey('keydown', h.code);
    }
  }

  _padUp(i, h) {
    this._padHeld.delete(i);
    if (h.slot && !h.code) {
      // a tap: the next earned slot after the one in hand
      const s = this.hooks.slots?.();
      const list = s?.list?.length ? s.list : [1, 2];
      const k = list.indexOf(s?.active ?? list[0]);
      const code = `Digit${list[(k + 1) % list.length]}`;
      this._log(i, code, false);
      this._emitKey('keydown', code);
      this._emitKey('keyup', code);
      return;
    }
    if (h.code && h.sent) this._emitKey('keyup', h.code);
  }

  /* ------------------------------ the page (out of play) ------------------------------ */

  /** Every control the pad can reach now: visible, enabled, and the topmost thing at its own centre. */
  uiTargets() {
    if (typeof document === 'undefined') return [];
    const sel = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [role="button"], .sys-st';
    const out = [];
    for (const e of document.querySelectorAll(sel)) {
      if (e.classList.contains('disabled') || e.closest('.hidden')) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
      const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
      const top = document.elementFromPoint(cx, cy);
      if (!top || (top !== e && !e.contains(top) && !top.contains(e))) continue;
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || +cs.opacity < 0.05 || cs.pointerEvents === 'none') continue;
      out.push({ e, r, cx, cy });
    }
    return out;
  }

  /** The focused control, if it is still one the pad can reach. */
  _uiCurrent(list) {
    const f = this._uiFocused;
    return f && list.some((t) => t.e === f) ? f : null;
  }

  /**
   * Move the focus one step in an arrow's direction (spatial: the nearest control that way, the off-axis distance
   * counted twice). A focused range slider takes left and right as its own steps. Returns false when nothing moved
   * (the arrow is then delivered as a key: the Character page's rung picker reads it).
   */
  uiFocus(code) {
    const list = this.uiTargets();
    if (!list.length) return false;
    const cur = this._uiCurrent(list);
    if (cur && cur.tagName === 'INPUT' && cur.type === 'range' && (code === 'ArrowLeft' || code === 'ArrowRight')) {
      const step = Number(cur.step) || 1, v = Number(cur.value) + (code === 'ArrowRight' ? step : -step);
      cur.value = String(Math.min(Number(cur.max), Math.max(Number(cur.min), v)));
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      cur.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    if (!cur) { this._uiSet(list[0].e); return true; }
    const c = list.find((t) => t.e === cur);
    const [dx, dy] = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[code] || [0, 0];
    let best = null, bestS = Infinity;
    for (const t of list) {
      if (t.e === cur) continue;
      const vx = t.cx - c.cx, vy = t.cy - c.cy;
      const along = vx * dx + vy * dy;
      if (along <= 2) continue;
      const off = Math.abs(vx * dy - vy * dx);
      const s = along + 2 * off;
      if (s < bestS) { bestS = s; best = t.e; }
    }
    if (!best) return false;
    this._uiSet(best);
    return true;
  }

  _uiSet(e) {
    this._uiFocused?.classList?.remove('cal-pad-focus');
    this._uiFocused = e;
    e.classList.add('cal-pad-focus');
    try { e.focus({ preventScroll: false }); } catch { /* not focusable: the class marks it */ }
    try { e.scrollIntoView({ block: 'nearest' }); } catch { /* */ }
  }

  /** A presses the focused control. Returns false when none is focused (A is then Enter). */
  uiPress() {
    const list = this.uiTargets();
    const cur = this._uiCurrent(list);
    if (!cur) return false;
    cur.click();
    return true;
  }

  /**
   * Poll the pad's sticks and merge the analog move intent.  Called once per simulation
   * slice by `Player.update` with that slice's REAL dt, so a frame split into
   * sub-steps still turns the camera by exactly one frame's worth.
   */
  poll(realDt = 0) {
    this._clock += realDt;
    const g = this.gamepad;
    this._keepLatches();

    // ---- WASD first: `move` must be right even with no pad attached
    let mx = (this.keys.has(this.codeFor('right')) ? 1 : 0) - (this.keys.has(this.codeFor('left')) ? 1 : 0);
    let my = (this.keys.has(this.codeFor('forward')) ? 1 : 0) - (this.keys.has(this.codeFor('back')) ? 1 : 0);

    // the pad's buttons are read on their own frame (_padFrame); the sticks are read here, every slice, once one is
    // connected (the look axis needs every frame)
    let pad = null;
    if (g.connected && this.enabled && typeof navigator !== 'undefined' && navigator.getGamepads) {
      const pads = navigator.getGamepads();
      pad = pads && g.index >= 0 ? pads[g.index] : null;
    }
    if (!pad || this._uiMode()) {
      g.move.x = g.move.y = g.look.x = g.look.y = 0;
      this.move.x = mx; this.move.y = my;
      const l = Math.hypot(mx, my);
      if (l > 1) { this.move.x = mx / l; this.move.y = my / l; }
      return;
    }

    const dz = this.opt('padDeadzone');
    const ax = pad.axes || [];
    const curve = (v) => {
      const a = Math.abs(v);
      if (a <= dz) return 0;
      const k = (a - dz) / (1 - dz);
      return Math.sign(v) * k * k;   // square response: fine control near centre
    };
    g.axes.lx = curve(ax[0] ?? 0); g.axes.ly = curve(ax[1] ?? 0);
    g.axes.rx = curve(ax[2] ?? 0); g.axes.ry = curve(ax[3] ?? 0);
    g.move.x = g.axes.lx; g.move.y = -g.axes.ly;
    g.look.x = g.axes.rx; g.look.y = g.axes.ry;

    // stick wins when it is pushed further than the keys
    if (Math.hypot(g.move.x, g.move.y) > Math.hypot(mx, my)) { mx = g.move.x; my = g.move.y; }
    this.move.x = mx; this.move.y = my;
    const l = Math.hypot(mx, my);
    if (l > 1) { this.move.x = mx / l; this.move.y = my / l; }
  }

  /** Camera delta for this slice, in radians, sensitivity + invert applied. */
  lookDelta(out, realDt = 0) {
    const sens = 0.0023 * this.opt('sensitivity');
    const inv = this.opt('invertY') ? -1 : 1;
    let x = this.mouse.dx * sens;
    let y = this.mouse.dy * sens * inv;
    const g = this.gamepad;
    if (g.connected) {
      const rate = this.opt('padLookRate') * this.opt('padSensitivity') * realDt;
      x += g.look.x * rate;
      y += g.look.y * rate * inv;
    }
    out.x = x; out.y = y;
    return out;
  }

  requestPointerLock() {
    try {
      const p = this.dom.requestPointerLock?.({ unadjustedMovement: true });
      p?.catch?.(() => {
        try {
          const q = this.dom.requestPointerLock();
          q?.catch?.(() => {}); // no user activation — a later click will re-lock
        } catch { /* ignore */ }
      });
    } catch { /* ignore */ }
  }
  exitPointerLock() {
    document.exitPointerLock?.();
  }

  isDown(code) { return this.keys.has(code); }
  mouseDown(button = 0) { return (this.mouse.buttons & (1 << button)) !== 0; }

  onDown(code, fn) {
    if (!this._downHandlers.has(code)) this._downHandlers.set(code, new Set());
    this._downHandlers.get(code).add(fn);
  }
  onUp(code, fn) {
    if (!this._upHandlers.has(code)) this._upHandlers.set(code, new Set());
    this._upHandlers.get(code).add(fn);
  }

  /** Call once per frame AFTER all systems have read the deltas. */
  endFrame() {
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
  }
}
