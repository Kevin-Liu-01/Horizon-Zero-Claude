/**
 * Keyboard + pointer-lock mouse input.
 * Consumers read `input.keys`, `input.mouse`, or register action callbacks.
 */
export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.mouse = { dx: 0, dy: 0, buttons: 0, wheel: 0 };
    this.pointerLocked = false;
    this.enabled = false;
    this._downHandlers = new Map(); // code -> Set<fn>
    this._upHandlers = new Map();

    window.addEventListener('keydown', (e) => {
      if (!this.enabled || e.repeat) return;
      this.keys.add(e.code);
      this._downHandlers.get(e.code)?.forEach((fn) => fn(e));
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
  }

  requestPointerLock() {
    this.dom.requestPointerLock?.({ unadjustedMovement: true })?.catch?.(() => {
      this.dom.requestPointerLock();
    });
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
