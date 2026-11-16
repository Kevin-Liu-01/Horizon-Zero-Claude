/**
 * A SYNTHETIC PAD IN THE PAGE (BUILD M1.6m: "the slice run completes on a pad"). The page's `navigator.getGamepads()`
 * answers one standard-mapping pad whose buttons and sticks the runner sets; src/core/input.js reads it exactly as it
 * reads a real one (no game code knows it is synthetic). The driver translates what a keyboard runner presses into
 * what a pad player presses, and walks the menus with the D-pad and A (the input layer's own focus), never a click.
 *
 *   await page.evaluateOnNewDocument(installPad);         // before the game's first frame, on every document
 *   const K = padKeys(page);                               // the same { down, up, tap } as a keyboard driver, plus
 *   await K.mouse('right', true)                           //   LT / RT for the mouse buttons
 *   await uiChoose(page, /NEW GAME/)                       //   focus the control whose text matches, press A
 *
 * Mapping (BIBLE §12 "Gamepad", src/core/input.js PAD_PLAY): W = left stick forward, Shift = L3, Space = A, E = X,
 * R = Y, Q = D-down (the Gourd), V = D-up (the Alidade), C = R3, T = R3 while Sighting, F = RB, Escape = Start in play
 * and B out of it, Enter = A; X (arrow type) = D-right with LT held; Digit n = D-right (a tap cycles the slot, a short
 * hold readies the slot in hand); Digit n in a dialogue = the D-pad onto station n, then A; RMB = LT, LMB = RT.
 */

/** In the page (evaluateOnNewDocument): the pad and its controls (`window.__pad`). */
export function installPad() {
  const mk = () => ({ pressed: false, touched: false, value: 0 });
  const P = window.__pad = { on: !window.__padOff, buttons: Array.from({ length: 17 }, mk), axes: [0, 0, 0, 0], t: 0, presses: 0 };
  P.set = (i, v) => { const b = P.buttons[i]; const was = b.pressed; b.value = v; b.pressed = v > 0.5; b.touched = v > 0; if (!was && b.pressed) P.presses++; P.t = performance.now(); };
  P.axis = (i, v) => { P.axes[i] = v; P.t = performance.now(); };
  // as Chrome does: a fresh snapshot each call
  const snap = () => ({ id: 'CALIMA synthetic pad (STANDARD GAMEPAD Vendor: 0000 Product: 0000)', index: 0, connected: true, mapping: 'standard',
    timestamp: P.t, axes: P.axes.slice(), buttons: P.buttons.map((b) => ({ pressed: b.pressed, touched: b.touched, value: b.value })) });
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [P.on ? snap() : null, null, null, null] });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
export const PAD = B;

const setB = (page, i, v) => page.evaluate((a, b) => window.__pad.set(a, b), i, v);
const setAxis = (page, i, v) => page.evaluate((a, b) => window.__pad.axis(a, b), i, v);
/** One frame of the page's own, so the input layer's pad frame sees an edge (two, to be sure under load). */
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
const press = async (page, i, ms = 120) => { await setB(page, i, 1); await frame(page); await sleep(ms); await setB(page, i, 0); await frame(page); };
const uiMode = (page) => page.evaluate(() => !!window.__CTX__?.input?._uiMode?.());

/** The pad's state the runner reads back (the input layer's own log of what each press became). */
export const padState = (page) => page.evaluate(() => ({ log: window.__CTX__?.input?.padLog?.slice(-12) ?? [], connected: !!window.__CTX__?.input?.gamepad?.connected,
  focus: document.querySelector('.cal-pad-focus')?.textContent?.trim()?.slice(0, 60) ?? null }));

/**
 * Focus the control whose text matches `re` with the D-pad (down, then right, then up), and press A. Returns the text
 * pressed, or null (nothing matched within `max` steps).
 */
export async function uiChoose(page, re, { max = 14, pressA = true, sel = null } = {}) {
  const src = re.source, flags = re.flags;
  const focused = () => page.evaluate((s, f, q) => { const e = document.querySelector('.cal-pad-focus');
    return e && new RegExp(s, f).test(e.textContent) && (!q || e.matches(q)) ? e.textContent.trim() : null; }, src, flags, sel);
  for (const dir of [B.DOWN, B.RIGHT, B.UP, B.LEFT]) {
    for (let i = 0; i < max; i++) {
      const t = await focused();
      if (t) { if (pressA) { await press(page, B.A); } return t; }
      const before = await page.evaluate(() => document.querySelector('.cal-pad-focus')?.textContent ?? null);
      await press(page, dir, 90);
      await sleep(60);
      const after = await page.evaluate(() => document.querySelector('.cal-pad-focus')?.textContent ?? null);
      if (after === before && i > 0) break;   // the end of this direction
    }
  }
  return null;
}

/** The keyboard runner's { down, up, tap } on the pad, and `mouse(button, down)` for the triggers. */
export function padKeys(page) {
  const held = new Set();
  const slotOf = () => page.evaluate(() => window.__CTX__?.quickslots?.activeSlot ?? 1);
  const sighting = () => page.evaluate(() => !!window.__CTX__?.sighting?.on);
  const map = async (code) => {
    switch (code) {
      case 'KeyW': return { axis: 1, v: -1 };
      case 'KeyS': return { axis: 1, v: 1 };
      case 'KeyA': return { axis: 0, v: -1 };
      case 'KeyD': return { axis: 0, v: 1 };
      case 'ShiftLeft': return { b: B.L3 };
      case 'Space': return { b: B.A };
      case 'KeyE': return { b: B.X };
      case 'KeyR': return { b: B.Y };
      case 'KeyQ': return { b: B.DOWN };
      case 'KeyV': return { b: B.UP };
      case 'KeyC': return { b: B.R3 };
      case 'KeyT': return { b: B.R3 };
      case 'KeyF': return { b: B.RB };
      case 'ControlLeft': return { b: B.B };
      case 'Enter': return { b: B.A };
      case 'Escape': return { b: (await uiMode(page)) ? B.B : B.START };
      default: return null;
    }
  };
  const down = async (code) => {
    const m = await map(code);
    if (!m) throw new Error(`pad driver: no pad control for ${code}`);
    if (code === 'KeyT' && !(await sighting())) throw new Error('pad driver: T is R3 only while Sighting');
    if (m.axis !== undefined) await setAxis(page, m.axis, m.v); else await setB(page, m.b, 1);
    held.add(code);
    await frame(page);
  };
  const up = async (code) => {
    const m = await map(code);
    if (!m) return;
    if (m.axis !== undefined) await setAxis(page, m.axis, 0); else await setB(page, m.b, 0);
    held.delete(code);
    await frame(page);
  };
  const tap = async (code, ms = 120) => {
    // Digit n: in a dialogue the D-pad onto station n, then A; in play D-right (a tap cycles, a short hold readies)
    const dg = /^Digit([1-4])$/.exec(code);
    if (dg) {
      const n = Number(dg[1]);
      if (await uiMode(page)) {
        const ok = await page.evaluate(() => document.querySelectorAll('#cal-sys .sys-st').length);
        if (ok) {
          const want = await page.evaluate((k) => document.querySelectorAll('#cal-sys .sys-st')[k - 1]?.textContent ?? null, n);
          if (want) { await uiChoose(page, new RegExp(want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); return; }
        }
        return;
      }
      const cur = await slotOf();
      if (cur === n) { await setB(page, B.RIGHT, 1); await frame(page); await sleep(420); await setB(page, B.RIGHT, 0); await frame(page); return; }
      for (let i = 0; i < 4 && (await slotOf()) !== n; i++) { await press(page, B.RIGHT, 90); await sleep(250); }
      return;
    }
    // X (and Z): the arrow type, on D-right (D-left) with LT held, as a pad player cycles it
    if (code === 'KeyX' || code === 'KeyZ') {
      const aimed = await page.evaluate(() => !!window.__CTX__?.input?.mouseDown?.(2));
      if (!aimed) { await setB(page, B.LT, 1); await frame(page); await sleep(160); }
      await press(page, code === 'KeyX' ? B.RIGHT : B.LEFT, 100);
      if (!aimed) { await setB(page, B.LT, 0); await frame(page); }
      return;
    }
    await down(code); await sleep(ms); await up(code);
  };
  const mouse = async (button, isDown) => {
    const b = button === 'right' ? B.LT : button === 'left' ? B.RT : null;
    if (b == null) return;
    await setB(page, b, isDown ? 1 : 0);
    await frame(page);
  };
  return { down, up, tap, mouse, pad: true, held };
}

/**
 * Round 2 (the judge's fix list 5): the look by the RIGHT STICK. One steering step toward a ground point: the stick's x
 * (axis 2) is set so the camera's yaw closes the error over about one step (player.js turns `camYaw -= look.x * rate`,
 * input.js squares the stick past its deadzone, so the square is undone here). The runner calls it every ~120 ms while
 * she walks, as a player holds the stick, and `stickRelease` centres it. Returns the yaw error it steered on (rad).
 */
export async function stickFace(page, x, z, stepS = 0.15) {
  return page.evaluate((tx, tz, step) => {
    const C = window.__CTX__, p = C.player, P = window.__pad, I = C.input;
    const want = Math.atan2(-(tx - p.position.x), -(tz - p.position.z));
    const err = Math.atan2(Math.sin(want - p.camYaw), Math.cos(want - p.camYaw));
    const dz = I.opt?.('padDeadzone') ?? 0.15;
    const rate = (I.opt?.('padLookRate') ?? 2.9) * (I.opt?.('padSensitivity') ?? 1);
    const mag = Math.min(1, Math.abs(err) / Math.max(0.05, rate * step));
    const k = mag < 0.01 ? 0 : dz + (1 - dz) * Math.sqrt(mag);
    P.axis(2, -Math.sign(err) * k);
    P.stickSteps = (P.stickSteps || 0) + 1;
    return +err.toFixed(4);
  }, x, z, stepS);
}
export const stickRelease = (page) => page.evaluate(() => { window.__pad.axis(2, 0); window.__pad.axis(3, 0); });
