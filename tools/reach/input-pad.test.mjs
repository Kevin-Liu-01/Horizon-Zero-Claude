// M1.6m: the input layer's pad mapping, its page mode and the HOLD / TOGGLE latches (src/core/input.js), in Node with
// a minimal window (an EventTarget), a synthetic pad and no animation frame (the pad frame is stepped by hand).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';

class KE extends Event {
  constructor(type, o = {}) { super(type, o); this.code = o.code; this.key = o.key; this.repeat = false; }
}
const P = { buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
globalThis.window = new EventTarget();
globalThis.document = new EventTarget();
setMaxListeners(100, window, document);
globalThis.KeyboardEvent = KE;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [{ id: 'test pad', index: 0, connected: true, axes: P.axes.slice(), buttons: P.buttons.map((b) => ({ ...b })) }] } });
const { Input } = await import('../../src/core/input.js');

const make = (hooks = {}) => {
  const inp = new Input(null);
  inp.enabled = true;
  inp.settings = {};
  inp.hooks = { ui: () => false, ...hooks };
  const keys = [];
  window.addEventListener('keydown', (e) => keys.push(e.code));
  return { inp, keys };
};
const set = (i, v) => { P.buttons[i] = { pressed: v > 0.5, value: v }; };
let now = 1000;
const step = (inp, s = 0.016) => { now += s * 1000; inp._padFrame(s); };
const realNow = performance.now.bind(performance);
performance.now = () => now;

test('in play: the D-pad and the face buttons are the BIBLE 12 verbs (synthetic keys on window)', () => {
  const { inp, keys } = make({ sighting: () => false });
  for (let i = 0; i < 31; i++) step(inp);   // the 0.5 s scan finds the pad
  assert.ok(inp.gamepad.connected);
  const tap = (b) => { set(b, 1); step(inp); set(b, 0); step(inp); };
  tap(12); tap(13); tap(14); tap(3); tap(5); tap(4); tap(2); tap(0); tap(1); tap(8); tap(9); tap(11);
  assert.deepEqual(keys, ['KeyV', 'KeyQ', 'KeyG', 'KeyR', 'KeyF', 'Tab', 'KeyE', 'Space', 'ControlLeft', 'KeyM', 'Escape', 'KeyC']);
  assert.ok(!inp.keys.size, 'every key came up');
});

test('R3 takes a bearing while Sighting; A plants while guarding; the D-pad is the arrow type with LT held', () => {
  let sighting = true, guarding = true;
  const { inp, keys } = make({ sighting: () => sighting, guarding: () => guarding });
  for (let i = 0; i < 31; i++) step(inp);
  const tap = (b) => { set(b, 1); step(inp); set(b, 0); step(inp); };
  tap(11); tap(0);
  sighting = false; guarding = false;
  set(6, 1); step(inp);
  assert.ok(inp.mouseDown(2), 'LT is the aim');
  tap(15); tap(14);
  set(6, 0); step(inp);
  assert.ok(!inp.mouseDown(2));
  assert.deepEqual(keys, ['KeyT', 'KeyX', 'KeyX', 'KeyZ']);
});

test('D-right: a tap cycles to the next earned slot; a hold holds the slot in hand', () => {
  const { inp, keys } = make({ slots: () => ({ active: 1, list: [1, 2] }) });
  for (let i = 0; i < 31; i++) step(inp);
  set(15, 1); step(inp, 0.1); set(15, 0); step(inp);
  assert.deepEqual(keys, ['Digit2']);
  set(15, 1); for (let i = 0; i < 20; i++) step(inp, 0.05);
  assert.ok(inp.keys.has('Digit1'), 'held past 0.25 s: slot 1 is down (quick-make runs on it)');
  set(15, 0); step(inp);
  assert.ok(!inp.keys.has('Digit1'));
});

test('out of play: A is Enter with nothing focused, B is Escape, LB and RB turn the tabs', () => {
  const { inp, keys } = make({ ui: () => true });
  inp.uiTargets = () => [];   // no DOM here
  for (let i = 0; i < 31; i++) step(inp);
  const tap = (b) => { set(b, 1); step(inp); set(b, 0); step(inp); };
  tap(0); tap(1); tap(4); tap(5); tap(9);
  assert.deepEqual(keys, ['Enter', 'Escape', 'KeyQ', 'KeyE', 'Escape']);
});

test('TOGGLE aim: a press holds the aim, the next lets it go; HOLD releases with the button', () => {
  const { inp } = make();
  inp.settings.holdAim = 'toggle';
  inp._buttonDown(2, {}); inp._buttonUp(2, {});
  assert.ok(inp.mouseDown(2));
  inp._buttonDown(2, {}); inp._buttonUp(2, {});
  assert.ok(!inp.mouseDown(2));
  inp.settings.holdAim = 'hold';
  inp._buttonDown(2, {}); inp._buttonUp(2, {});
  assert.ok(!inp.mouseDown(2));
});

test('TOGGLE Steady latches Shift only while aiming and lets go with the aim', () => {
  const { inp } = make();
  inp.settings.holdSteady = 'toggle';
  window.dispatchEvent(new KE('keydown', { code: 'ShiftLeft' })); window.dispatchEvent(new KE('keyup', { code: 'ShiftLeft' }));
  assert.ok(!inp.isDown('ShiftLeft'), 'not aiming: Shift is a plain key (sprint)');
  inp._buttonDown(2, {});
  window.dispatchEvent(new KE('keydown', { code: 'ShiftLeft' })); window.dispatchEvent(new KE('keyup', { code: 'ShiftLeft' }));
  assert.ok(inp.isDown('ShiftLeft'), 'aiming: one press holds Steady');
  inp._buttonUp(2, {});
  inp.poll(0.016);
  assert.ok(!inp.isDown('ShiftLeft'), 'the aim dropped: Steady let go');
});

test('TOGGLE re-survey latches E only at a long hold and lets go when that hold is gone', () => {
  let hold = { hold: 15 };
  const { inp } = make({ longHold: () => hold });
  inp.settings.holdResurvey = 'toggle';
  window.dispatchEvent(new KE('keydown', { code: 'KeyE' })); window.dispatchEvent(new KE('keyup', { code: 'KeyE' }));
  assert.ok(inp.isDown('KeyE'));
  hold = null; inp.poll(0.016);
  assert.ok(!inp.isDown('KeyE'), 'the hold fired or she walked off: E let go');
  window.dispatchEvent(new KE('keydown', { code: 'KeyE' })); window.dispatchEvent(new KE('keyup', { code: 'KeyE' }));
  assert.ok(!inp.isDown('KeyE'), 'no long hold in front of her: E is a plain press');
  performance.now = realNow;
});
