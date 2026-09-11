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
 * `asPlaying()` is the answer to `player-anim-17`: `Player.takeDamage`,
 * `jump()` and `dodge()` all early-out unless `ctx.state === 'playing'`, so the
 * studio hands them a one-call window of that state and takes it back. Those
 * three guards live in `src/entities/player.js`, which this lane does not own.
 *
 * The DEATH pose is the exception and deliberately so: it stages `ctx.state`
 * and health directly instead of running the game's death pipeline, because
 * that pipeline (respawn timer, death card, canvas grade, 'death-menu' park)
 * destroys the very shot it is asked for. See `case 'death'` for the trace.
 *
 * KNOWN CROSS-LANE GAP (`player-anim`, measured not guessed): the death clip is
 * 2.375 s long and its FINAL frame snaps back to a standing pose — scrubbing
 * through it takes the head from world-Y -1.13 (down) to +0.20 (upright) inside
 * the last 0.04 s. `ClipLayer.scrub()` clamps to `duration - 1e-4`, so a death
 * held past the clip parks on that bad frame and Aloy stands up. It is visible
 * in gameplay too, merely hidden there by the death card arriving at 1.15 s.
 * The studio does not paper over it: the fix is the clip's tail or a hold frame
 * in `LocomotionBlend`, both of which live in `player-anim`. Until then a held
 * death shot is composed with TIME at 0, which stops `_dieT` with the world.
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
    /**
     * UNDO BUFFER for the FIXED-ANGLE writes (eyes + lids). Keyed by bone;
     * at most six entries, all allocated once. See `_undoFixed`.
     */
    this._fixed = new Map();
    /**
     * The staged hit's source, allocated once. `position` aliases the scratch
     * vector `_inFront()` fills; `displayName` is what `progression` and
     * `shell-menus` print when a staged hit turns out to be fatal.
     */
    this._src = { position: _v1, displayName: 'the studio', kind: 'studio' };
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
        /*
         * A DEATH POSE IS STAGED, NOT SUFFERED. This used to route through
         * `takeDamage` inside an `asPlaying` window, which reached `_die()` and
         * with it the entire death PIPELINE: a `player-died` broadcast, a 3.2 s
         * wall-clock respawn that heals and teleports her to camp, and (since
         * `shell-menus` landed) a card, a grayscale grade on the render canvas
         * and a park onto `ctx.state = 'death-menu'`.
         *
         * That pipeline does not just clutter the shot, it DESTROYS it. The
         * animator scrubs the crumple off `_dieT`, which it resets whenever
         * `ctx.state === 'dead'` goes false for a single tick — and both the
         * card's park and the respawn do exactly that, each from outside the
         * frame loop where the studio could pre-empt them. Traced live: two
         * restarts per shot, `_dieT` sawtoothing 0.54 -> 0.08 -> 0.53 -> 0.08,
         * so the clip never got past its first half second and every death shot
         * came out with Aloy standing upright four seconds after the button.
         *
         * The animator needs ONE thing for the crumple: `ctx.state === 'dead'`.
         * So the pose sets exactly that and the health it reads from, and the
         * pipeline is never armed — no timer to fight, no card to suppress, no
         * checkpoint spent, nothing emitted (this lane is a pure consumer).
         * `Studio._holdState()` holds the state and pins the subject; "Idle"
         * and `exit()` release both. The HIT poses above still go through
         * `takeDamage` inside the window, which is the half of `player-anim-17`
         * that is genuinely about a guard refusing the studio.
         */
        p.health = 0;
        this.ctx.state = 'dead';
        handed = true;
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

  /**
   * A source position 3 m in front of her, so hit reacts fold the right way.
   *
   * IT NEEDS A NAME, NOT JUST A POSITION. `progression` reads the source of a
   * fatal hit as `from.displayName ?? from.kind ?? String(from)`
   * (src/core/progression.js) and paints it on the death banner and the death
   * card. Every real emitter passes a Machine, which has both; this passed a
   * bare `{ position }`, so a knockdown chip at low health stamped
   * `KILLED BY [OBJECT OBJECT]` across the photograph — caught on film, not in
   * a gate, because the studio's own Death pose deliberately arms no pipeline
   * and the three HIT chips are the only path in this lane that can reach one.
   * Naming the source is the whole fix, and it is honest: the photographer
   * staged that hit.
   *
   * The object is allocated once (`_src`) alongside the scratch vector it
   * carries, so a held chip cannot litter.
   */
  _inFront() {
    const p = this.ctx.player;
    const h = p?.heading ?? 0;
    _v1.copy(p.position);
    _v1.x += Math.sin(h) * 3;
    _v1.z += Math.cos(h) * 3;
    return this._src;
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
    /*
     * Hand the face back exactly as it was found. A photographer who leaves
     * while the world is STILL FROZEN would otherwise leave the last frame's
     * eye and lid deltas baked into a rig whose animator is about to resume
     * from them — nothing would ever wipe them, because nothing wrote those
     * bones while time was stopped. See `_undoFixed`.
     */
    this._undoFixed();
    this._fixed.clear();
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
    this._undoFixed();
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
        if (b.eyeL) { space.rotChar(this._mark(b.eyeL), 'y', ey, true); space.rotChar(b.eyeL, 'x', -ep, true); }
        if (b.eyeR) { space.rotChar(this._mark(b.eyeR), 'y', ey, true); space.rotChar(b.eyeR, 'x', -ep, true); }
      }
    }

    if (Math.abs(this._up) > 0.002 || Math.abs(this._lo) > 0.002) {
      // same axis + sign convention as playerAnimator's blink
      if (b.lidUL) space.rotChar(this._mark(b.lidUL), 'x', 0.42 * this._up, true);
      if (b.lidUR) space.rotChar(this._mark(b.lidUR), 'x', 0.42 * this._up, true);
      if (b.lidLL) space.rotChar(this._mark(b.lidLL), 'x', -0.16 * this._lo, true);
      if (b.lidLR) space.rotChar(this._mark(b.lidLR), 'x', -0.16 * this._lo, true);
    }
    this._sealFixed();
  }

  /*
   * ------------------------------------------------------------------------
   * THE OVERLAY MUST SURVIVE A FROZEN WORLD, AND ONE HALF OF IT DID NOT.
   *
   * `BoneSpace.rotChar` MULTIPLIES into `bone.quaternion`. In gameplay that is
   * safe only because the animator re-evaluates every bone from its clips each
   * frame, wiping the previous frame's delta before this overlay adds the next
   * one. The animator runs on SIM dt. This overlay runs on REAL dt — it has to,
   * or gaze and lids would freeze solid with the world — so at `timeScale 0`
   * nothing resets the bone and each frame's delta lands on the last one.
   *
   * Measured, lid `rotation.x` with `narrow` held and time at 0:
   *   running -0.038 | +0.4s -0.609 | +0.8s -1.180 | +1.2s -1.752 | +2.0s -2.895
   * ~1.4 rad/s of runaway. Two seconds of composing a shot — which is the whole
   * job — swung the lids a third of a turn and shut them over the eyes as flat
   * plates. It is invisible in motion and ruins every frozen portrait, i.e. it
   * only appears in exactly the mode this lane exists to ship.
   *
   * The GAZE half was already immune and it is worth saying why, because it is
   * the reason this took a measurement to find rather than a read: `_lookAt`
   * solves the RESIDUAL error between where the head points and where it should
   * (`setFromUnitVectors(current, want)`), so re-running it on its own output
   * asks for a rotation of zero. An absolute solve is idempotent by
   * construction. The eye and lid writes are fixed angles and are not.
   *
   * Rather than convert those to absolute solves (they have no rest reference
   * of their own to solve against — the animator's blink writes the same bones
   * the same way), the overlay keeps an undo buffer: what the bone held before
   * we wrote, and what we left it as. Next frame, if the bone is STILL what we
   * left, nobody else has written it (the world is frozen) and we put the old
   * value back before adding the new delta. If it has changed, the animator ran
   * and its pose is the new base — we take it and leave it alone. So the same
   * code is correct frozen, running, and on the frame time resumes.
   * ------------------------------------------------------------------------
   */

  /**
   * Undo the previous frame's fixed-angle writes, but ONLY on bones nothing
   * else has touched since. Runs before any write, so the deltas below always
   * land on a clean base.
   */
  _undoFixed() {
    for (const r of this._fixed.values()) {
      // |dot| because q and -q are the same rotation
      if (r.armed && Math.abs(r.bone.quaternion.dot(r.post)) > 1 - 1e-9) {
        r.bone.quaternion.copy(r.pre);
      }
      r.armed = false;
      r.touched = false;
    }
  }

  /**
   * Snapshot a bone's pre-overlay orientation, once per frame, and hand the
   * entry straight back so it can wrap the first `rotChar` argument at the
   * call site.
   * @param {object} e anim-core bone entry (or a bare bone)
   */
  _mark(e) {
    const bone = e.bone || e;
    let r = this._fixed.get(bone);
    if (!r) {
      r = {
        bone,
        pre: new THREE.Quaternion(),
        post: new THREE.Quaternion(),
        armed: false,
        touched: false,
      };
      this._fixed.set(bone, r);
    }
    if (!r.touched) { r.pre.copy(bone.quaternion); r.touched = true; }
    return e;
  }

  /** Record what this frame left behind, so the next one can recognise it. */
  _sealFixed() {
    for (const r of this._fixed.values()) {
      if (r.touched) { r.post.copy(r.bone.quaternion); r.armed = true; }
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
      /*
       * The death crumple's own weight. `playerAnimator` damps `_deadW` toward
       * `ctx.state === 'dead'` and every death pose — clip layer or procedural
       * fallback — is gated on it, so it is the one number that says whether a
       * filmed death is actually ON THE CHARACTER rather than merely recorded
       * in her health. Published because a gate asking "did the Death button do
       * anything" has to read the pose, not the bookkeeping: the studio shipped
       * a death that dropped her health to 0 and left her standing in `idle`.
       */
      deadW: a?._deadW ?? null,
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
