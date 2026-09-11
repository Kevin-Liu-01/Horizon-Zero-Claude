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
 *     a pad button adds/removes its mapped `KeyboardEvent.code` in `keys` and
 *     fires the same `onDown`/`onUp` handlers, and the triggers drive
 *     `mouse.buttons`, so aim, fire, the weapon wheel, the crouch toggle and
 *     every existing `input.isDown('…')` consumer work on a controller with no
 *     changes anywhere else.
 *
 * `settings` is assigned by `Player` (it owns ctx.settings defaults); until
 * then the defaults below apply.  Nothing here reads ctx, so Input stays
 * constructible from `main.js` with one argument (that file is frozen).
 */

/** Xbox/standard-mapping button index -> KeyboardEvent.code we synthesise. */
const PAD_BUTTONS = {
  0: 'Space',        // A      jump
  1: 'ControlLeft',  // B      dodge
  2: 'KeyE',         // X      interact
  3: 'KeyV',         // Y      focus
  4: 'KeyQ',         // LB     heal (hold)
  5: 'Tab',          // RB     weapon wheel (hold)
  8: 'KeyI',         // Back   inventory
  9: 'Escape',       // Start  pause
  10: 'ShiftLeft',   // L3     sprint (hold)
  11: 'KeyC',        // R3     crouch toggle
  12: 'KeyR',        // D-up   craft/reload
  13: 'KeyT',        // D-down tag
  14: 'KeyZ',        // D-left  cycle ammo -
  15: 'KeyX',        // D-right cycle ammo +
};
/** Triggers drive mouse buttons so combat/aim need no pad-specific code. */
const PAD_TRIGGER = { 6: 2, 7: 0 };   // LT -> RMB (aim), RT -> LMB (draw/fire)
const TRIGGER_ON = 0.55;
const TRIGGER_OFF = 0.35;

/** Default action -> code table.  `settings.binds` overrides entries by name. */
const DEFAULT_BINDS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', dodge: 'ControlLeft', sprint: 'ShiftLeft', walk: 'AltLeft',
  crouch: 'KeyC', heal: 'KeyQ', interact: 'KeyE', focus: 'KeyV',
};

const DEFAULTS = {
  sensitivity: 1,
  padSensitivity: 1,
  invertY: false,
  padDeadzone: 0.16,
  padLookRate: 2.9,   // rad/s at full stick before sensitivity
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
    this.binds = { ...DEFAULT_BINDS };

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
    this._padDown = new Set();
    this._padTrig = new Set();

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      // keep game keys from stealing browser focus / scrolling while playing
      if (e.code === 'Tab' || e.code === 'Space' || e.code === 'KeyI') e.preventDefault();
      if (e.repeat) return;
      this._press(e.code, e);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (!this.enabled) return;
      this._upHandlers.get(e.code)?.forEach((fn) => fn(e));
    });
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this.mouse.buttons |= 1 << e.button;
      this._pressT.set(`Mouse${e.button}`, this._clock);
      this._downHandlers.get(`Mouse${e.button}`)?.forEach((fn) => fn(e));
    });
    document.addEventListener('mouseup', (e) => {
      this.mouse.buttons &= ~(1 << e.button);
      if (!this.enabled) return;
      this._upHandlers.get(`Mouse${e.button}`)?.forEach((fn) => fn(e));
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
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if (this.gamepad.index === e.gamepad.index) this._padClear();
    });
  }

  /* ------------------------------ settings ------------------------------ */

  opt(name) {
    const s = this.settings;
    const v = s ? s[name] : undefined;
    return v === undefined || v === null ? DEFAULTS[name] : v;
  }

  /** Rebind one action (`settings.binds` is honoured first, then this). */
  bind(action, code) { this.binds[action] = code; }
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

  _padClear() {
    const g = this.gamepad;
    for (const code of this._padDown) {
      this.keys.delete(code);
      this._upHandlers.get(code)?.forEach((fn) => fn({ code, gamepad: true }));
    }
    this._padDown.clear();
    for (const b of this._padTrig) this.mouse.buttons &= ~(1 << b);
    this._padTrig.clear();
    g.connected = false; g.index = -1; g.id = '';
    g.axes.lx = g.axes.ly = g.axes.rx = g.axes.ry = 0;
    g.look.x = g.look.y = 0; g.move.x = g.move.y = 0;
    g.lt = g.rt = 0;
    g.buttons.clear();
  }

  /**
   * Poll the pad and merge the analog move intent.  Called once per simulation
   * slice by `Player.update` with that slice's REAL dt, so a frame split into
   * sub-steps still turns the camera by exactly one frame's worth.
   */
  poll(realDt = 0) {
    this._clock += realDt;
    const g = this.gamepad;

    // ---- WASD first: `move` must be right even with no pad attached
    let mx = (this.keys.has(this.codeFor('right')) ? 1 : 0) - (this.keys.has(this.codeFor('left')) ? 1 : 0);
    let my = (this.keys.has(this.codeFor('forward')) ? 1 : 0) - (this.keys.has(this.codeFor('back')) ? 1 : 0);

    // `navigator.getGamepads()` allocates a fresh array on every call, so with
    // no pad attached (the overwhelmingly common case) it is scanned twice a
    // second instead of 60 times: nothing is missed but the connect edge, and
    // that is what a 0.5 s scan is for. Once a pad answers it is polled every
    // slice, because the look axis needs every frame.
    this._padScan = (this._padScan | 0) + 1;
    const scan = this.enabled && typeof navigator !== 'undefined' && navigator.getGamepads
      && (g.connected || this._padScan % 30 === 0);
    const pads = scan ? navigator.getGamepads() : null;
    let pad = null;
    if (pads) {
      if (g.index >= 0 && pads[g.index]) pad = pads[g.index];
      else for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; g.index = i; break; }
    }
    if (!pad) {
      if (g.connected && scan) this._padClear();
      this.move.x = mx; this.move.y = my;
      const l = Math.hypot(mx, my);
      if (l > 1) { this.move.x = mx / l; this.move.y = my / l; }
      return;
    }

    g.connected = true;
    g.id = pad.id || g.id;
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

    // ---- buttons -> synthesised key codes (same path as the keyboard)
    const btns = pad.buttons || [];
    g.buttons.clear();
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      const on = typeof b === 'object' ? (b.pressed || b.value > 0.6) : b > 0.6;
      if (on) g.buttons.add(i);
      const trig = PAD_TRIGGER[i];
      if (trig !== undefined) {
        const v = typeof b === 'object' ? b.value : b;
        if (i === 6) g.lt = v; else g.rt = v;
        const held = this._padTrig.has(i);
        if (!held && v >= TRIGGER_ON) {
          this._padTrig.add(i);
          this.mouse.buttons |= 1 << trig;
          this._pressT.set(`Mouse${trig}`, this._clock);
          this._downHandlers.get(`Mouse${trig}`)?.forEach((fn) => fn({ gamepad: true }));
        } else if (held && v <= TRIGGER_OFF) {
          this._padTrig.delete(i);
          this.mouse.buttons &= ~(1 << trig);
          this._upHandlers.get(`Mouse${trig}`)?.forEach((fn) => fn({ gamepad: true }));
        }
        continue;
      }
      const code = PAD_BUTTONS[i];
      if (!code) continue;
      const held = this._padDown.has(code);
      if (on && !held) { this._padDown.add(code); this._press(code, { code, gamepad: true }); }
      else if (!on && held) {
        this._padDown.delete(code);
        this.keys.delete(code);
        this._upHandlers.get(code)?.forEach((fn) => fn({ code, gamepad: true }));
      }
    }
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
