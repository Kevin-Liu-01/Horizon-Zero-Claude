/**
 * Studio pose + expression driver for Aloy. Lane `studio`
 * (`missing-systems-photo-mode`, `player-anim-17-studio-cannot-film-hit-death`).
 *
 * TWO CHANNELS, BOTH THROUGH PUBLISHED CONTRACTS — this file never edits and
 * never monkey-patches `src/entities/playerAnimator.js`:
 *
 * 1. POSES are ClipLayer one-shots. `LocomotionBlend` wraps every Aloy clip in
 *    a `ClipLayer` (anim-core) whose weight and `scrub()` are authored by the
 *    animator every frame from its hit / air / act channels. The sanctioned way
 *    to start one is therefore the animator's own EVENT inputs — `player-damage`
 *    (hitChest/hitHead by damage class), `player-jump` / `player-land`
 *    (jumpStart/jumpLoop/jumpLand), `item-gained` (pickup), `override-node`
 *    (interact) — plus `player.dodge()` for the roll layer and `takeDamage()`
 *    for the death layer. Writing `loco.actSlot` directly would be clobbered on
 *    the next frame; these are not.
 *
 * 2. GAZE + LIDS are a post-pose overlay applied through anim-core `BoneSpace`
 *    (`animator.space`) in `Studio.interpolate()` — i.e. after every system has
 *    updated and before `engine.render()`, so it lands on the frame that is
 *    actually photographed. It is an ABSOLUTE solve on the live pose (exactly
 *    the shape of `playerAnimator._lookAt`), so it composes with, rather than
 *    fights, the animator's own damped look-at.
 *
 * `filmDamage()` is the answer to `player-anim-17`: `Player.takeDamage`,
 * `jump()` and `dodge()` all early-out unless `ctx.state === 'playing'`, so the
 * studio hands them a one-call window of that state and takes it back. Those
 * three guards live in `src/entities/player.js`, which this lane does not own.
 */
import * as THREE from 'three';

const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _q4 = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _fwd = new THREE.Vector3();

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, lambda, dt) => THREE.MathUtils.damp(a, b, lambda, dt);

/**
 * Pose buttons. `hp` is a FRACTION of max health: the animator classes a hit as
 * light / stagger / knockdown at 0.10 and 0.26 of max, and those three classes
 * pick hitChest, hitChest and hitHead respectively.
 */
export const POSES = [
  { id: 'idle', label: 'Idle', kind: 'clear' },
  { id: 'hitLight', label: 'Hit', kind: 'damage', hp: 0.05 },
  { id: 'hitStagger', label: 'Stagger', kind: 'damage', hp: 0.15 },
  { id: 'knockdown', label: 'Knockdown', kind: 'damage', hp: 0.30 },
  { id: 'roll', label: 'Roll', kind: 'dodge' },
  { id: 'jump', label: 'Jump', kind: 'jump' },
  { id: 'land', label: 'Land', kind: 'land', fall: 4.5 },
  { id: 'pickup', label: 'Pick up', kind: 'event', event: 'item-gained' },
  { id: 'interact', label: 'Interact', kind: 'event', event: 'override-node' },
  { id: 'crouch', label: 'Crouch', kind: 'crouch' },
  { id: 'death', label: 'Death', kind: 'death' },
];

/** Expression presets: upper-lid and lower-lid closure, 0..1 (negative = wide). */
export const EXPRESSIONS = [
  { id: 'neutral', label: 'Neutral', up: 0, lo: 0 },
  { id: 'squint', label: 'Squint', up: 0.55, lo: 0.35 },
  { id: 'narrow', label: 'Narrow', up: 0.34, lo: 0.10 },
  { id: 'wide', label: 'Wide', up: -0.42, lo: -0.20 },
  { id: 'closed', label: 'Closed', up: 1, lo: 1 },
];

export const GAZES = ['auto', 'camera', 'ahead', 'free'];

export class PoseDirector {
  constructor(ctx) {
    this.ctx = ctx;
    /** @type {'auto'|'camera'|'ahead'|'free'} */
    this.gaze = 'auto';
    this.gazeWeight = 1;
    this.gazeYaw = 0;             // radians, char space, `free` only
    this.gazePitch = 0;
    this.expression = 'neutral';
    this.expressionAmt = 1;
    this.hideAloy = false;
    this._up = 0;                  // damped lid state
    this._lo = 0;
    this._gw = 0;
    this._yaw = 0;
    this._pitch = 0;
    this._hidden = false;
  }

  get animator() { return this.ctx.player?.animator ?? null; }

  /* --------------------------------------------------------------- poses */

  /**
   * Run `fn` with `ctx.state` temporarily back at 'playing'.
   *
   * `player-anim-17`: the studio could not film a hit or a death because
   * `takeDamage` / `jump` / `dodge` all read `ctx.state !== 'playing'` and
   * returned. Those guards are correct for the pause menu and they belong to
   * `player-control`; this is the studio opening a one-call window instead of
   * asking another lane to weaken them.
   *
   * If `fn` leaves the state somewhere else on purpose — `_die()` sets 'dead'
   * so the death clip and the crumple play — that state is LEFT ALONE and the
   * caller is told, so `Studio.update()` can take the world back when the
   * respawn timer hands it to 'playing' again.
   *
   * @returns {boolean} true when the state was handed on (a death was filmed)
   */
  asPlaying(fn) {
    const ctx = this.ctx;
    const prev = ctx.state;
    if (prev === 'playing') { fn(); return false; }
    ctx.state = 'playing';
    let threw = null;
    try { fn(); } catch (err) { threw = err; }
    const handed = ctx.state !== 'playing';   // fn moved it itself (death)
    if (!handed) ctx.state = prev;
    if (threw) console.warn('[studio] pose trigger threw:', threw);
    return handed;
  }

  /**
   * Fire one pose. Returns `{ ok, detail }` so the panel can say why a pose was
   * refused instead of doing nothing (the Round 3 cast buttons' whole problem).
   */
  play(id) {
    const p = this.ctx.player;
    const def = POSES.find((d) => d.id === id);
    if (!def) return { ok: false, detail: `no pose "${id}"` };
    if (!p) return { ok: false, detail: 'no player' };
    const ev = this.ctx.events;
    let handed = false;
    switch (def.kind) {
      case 'clear':
        p.setCrouch?.(false);
        this._clearChannels();
        break;
      case 'damage':
        // the ANIMATOR reacts to `player-damage` (its own listener, no state
        // guard); the PLAYER only takes the hit inside the window
        handed = this.asPlaying(() => {
          ev.emit('player-damage', { amount: (p.maxHealth ?? 100) * def.hp, from: this._inFront() });
        });
        break;
      case 'dodge':
        handed = this.asPlaying(() => p.dodge?.());
        break;
      case 'jump':
        handed = this.asPlaying(() => p.jump?.());
        break;
      case 'land':
        ev.emit('player-land', { fall: def.fall });
        break;
      case 'event':
        ev.emit(def.event, { studio: true });
        break;
      case 'crouch':
        p.setCrouch?.(!p.crouching);
        break;
      case 'death':
        handed = this.asPlaying(() => p.takeDamage?.((p.maxHealth ?? 100) + 50, this._inFront()));
        break;
      default:
        return { ok: false, detail: 'unhandled pose kind' };
    }
    return { ok: true, detail: def.label, handedState: handed };
  }

  /** Cancel whatever one-shot is running and stand her up. */
  _clearChannels() {
    const a = this.animator;
    if (!a) return;
    // the animator's own release path: end the timelines, let the damped
    // weights fall out on the next frames. No layer is touched directly.
    if (a._hitT !== undefined) a._hitT = 1;
    if (a._actT !== undefined) a._actT = 1;
    if (a._airT !== undefined) a._airT = 1;
  }

  /** A source position 3 m in front of her, so hit reacts fold the right way. */
  _inFront() {
    const p = this.ctx.player;
    const h = p?.heading ?? 0;
    _v1.copy(p.position);
    _v1.x += Math.sin(h) * 3;
    _v1.z += Math.cos(h) * 3;
    return { position: _v1 };
  }

  /* ---------------------------------------------------------- appearance */

  setHidden(on) {
    const model = this.ctx.player?.model;
    if (!model) return;
    this.hideAloy = !!on;
    this._hidden = !!on;
    model.visible = !on;
  }

  /** Always called on exit: nothing the studio hid stays hidden. */
  restore() {
    if (this._hidden) this.setHidden(false);
    this._gw = 0;
    this._up = 0;
    this._lo = 0;
  }

  /* --------------------------------------------------------------- gaze */

  /**
   * Post-pose overlay: neck/head look-at + eyelid expression, applied on the
   * LIVE pose through anim-core BoneSpace. Runs from `Studio.interpolate()`
   * with REAL dt, so it keeps working with the world frozen at timeScale 0.
   */
  apply(realDt) {
    const a = this.animator;
    if (!a?.space || !a.b) return;
    const b = a.b;
    const space = a.space;
    const wantW = this.gaze === 'auto' ? 0 : clamp(this.gazeWeight, 0, 1);
    this._gw = damp(this._gw, wantW, 7, realDt);

    const ex = EXPRESSIONS.find((e) => e.id === this.expression) ?? EXPRESSIONS[0];
    const amt = clamp(this.expressionAmt, 0, 1);
    this._up = damp(this._up, ex.up * amt, 9, realDt);
    this._lo = damp(this._lo, ex.lo * amt, 9, realDt);

    if (this._gw > 0.004 && b.head && b.neck1) {
      space.syncFrame();
      if (this._resolveDir(_fwd)) {
        // clamp exactly the way the animator does: she does not crane round
        const yaw = clamp(Math.atan2(_fwd.x, _fwd.z), -0.95, 0.95);
        const pitch = clamp(Math.asin(clamp(_fwd.y, -1, 1)), -0.42, 0.42);
        this._yaw = damp(this._yaw, yaw, 8, realDt);
        this._pitch = damp(this._pitch, pitch, 8, realDt);
        const cp = Math.cos(this._pitch);
        _v3.set(Math.sin(this._yaw) * cp, Math.sin(this._pitch), Math.cos(this._yaw) * cp);
        this._lookAt(space, b, _v3, this._gw);
        // eyes lead by a few degrees, same convention as the animator
        const ey = clamp(this._yaw * 0.55, -0.42, 0.42) * this._gw;
        const ep = clamp(this._pitch * 0.5, -0.28, 0.28) * this._gw;
        if (b.eyeL) { space.rotChar(b.eyeL, 'y', ey, true); space.rotChar(b.eyeL, 'x', -ep, true); }
        if (b.eyeR) { space.rotChar(b.eyeR, 'y', ey, true); space.rotChar(b.eyeR, 'x', -ep, true); }
      }
    }

    if (Math.abs(this._up) > 0.002 || Math.abs(this._lo) > 0.002) {
      // same axis + sign convention as playerAnimator's blink
      if (b.lidUL) space.rotChar(b.lidUL, 'x', 0.42 * this._up, true);
      if (b.lidUR) space.rotChar(b.lidUR, 'x', 0.42 * this._up, true);
      if (b.lidLL) space.rotChar(b.lidLL, 'x', -0.16 * this._lo, true);
      if (b.lidLR) space.rotChar(b.lidLR, 'x', -0.16 * this._lo, true);
    }
  }

  /** Char-space unit direction the head should meet. False = nothing to do. */
  _resolveDir(out) {
    const a = this.animator;
    const model = a?.model ?? this.ctx.player?.model;
    if (!model) return false;
    if (this.gaze === 'free') {
      const cp = Math.cos(this.gazePitch);
      out.set(Math.sin(this.gazeYaw) * cp, Math.sin(this.gazePitch), Math.cos(this.gazeYaw) * cp);
      return true;
    }
    if (this.gaze === 'ahead') { out.set(0, 0, 1); return true; }
    // 'camera': look AT the lens, not along its forward (that is the animator's
    // default and it points her AWAY from the photographer)
    const cam = this.ctx.camera;
    if (!cam || !a?.b?.head) return false;
    _v2.copy(cam.position);
    model.worldToLocal(_v2);
    a.space.charPos(a.b.head.bone, _v1);
    out.copy(_v2).sub(_v1);
    if (out.lengthSq() < 1e-6) return false;
    out.normalize();
    return true;
  }

  /** Rotate neck (35 %) + head (65 %) so the head's live forward meets `dir`. */
  _lookAt(space, b, dir, w) {
    space.charQ(b.head.bone, _q4);
    _q2.copy(_q4).multiply(b.head.invW);
    _v1.set(0, 0, 1).applyQuaternion(_q2);
    _q3.setFromUnitVectors(_v1, dir);
    _qi.identity();
    _q1.copy(_q3).slerp(_qi, 1 - 0.35 * w);
    space.rotCharQ(b.neck1, _q1, false);
    // recompute after the neck moved: the head's residual error is what is left
    space.charQ(b.head.bone, _q4);
    _q2.copy(_q4).multiply(b.head.invW);
    _v1.set(0, 0, 1).applyQuaternion(_q2);
    _q3.setFromUnitVectors(_v1, dir);
    _q1.copy(_q3).slerp(_qi, 1 - w);
    space.rotCharQ(b.head, _q1, false);
  }

  /** Diagnostics for gates / the report. */
  debug() {
    const a = this.animator;
    return {
      gaze: this.gaze,
      gazeW: +this._gw.toFixed(3),
      yaw: +this._yaw.toFixed(3),
      pitch: +this._pitch.toFixed(3),
      expression: this.expression,
      lidUp: +this._up.toFixed(3),
      lidLo: +this._lo.toFixed(3),
      hidden: this._hidden,
      hitSlot: a?._hitSlot ?? null,
      airSlot: a?._airSlot ?? null,
      actSlot: a?._actSlot ?? null,
      layers: a?.loco?.set
        ? Object.entries(a.loco.set.layers)
          .filter(([, l]) => l.weight > 0.01)
          .map(([k, l]) => `${k}:${l.weight.toFixed(2)}`)
        : null,
    };
  }
}
