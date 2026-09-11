import * as THREE from 'three';
import { engageCfg, span } from './tables.js';

/**
 * Engage locomotion — `machine-ai-02` ("statues between attacks"),
 * `machine-ai-01` (obstacle avoidance), `machine-ai-15`, `machine-ai-18`.
 *
 * Between attacks a machine now holds a standoff BAND and works it: closing
 * when the player backs off, giving ground when she crowds it, circling
 * broadside the rest of the time, and backing off after a whiffed attack.
 * Steering runs through `ctx.nav.steer()` when the spatial lane is installed,
 * so it walks around trunks and rocks instead of into them; without `ctx.nav`
 * it degrades to the raw direction and still moves.
 *
 * The band and the flavour constants live in `ai/tables.js` — a species is
 * `orbit` / `stalker` / `bruiser` / `artillery` / `skittish` / `pack` /
 * `harrier`, and the state machine is shared.
 */

const _dir = new THREE.Vector3();
const _to = new THREE.Vector3();

export class Engage {
  constructor(machine) {
    this.m = machine;
    this.cfg = engageCfg(machine.kind);
    this.mode = 'close';
    this.orbitDir = Math.random() < 0.5 ? 1 : -1;
    this.flipT = span(this.cfg.orbitFlip);
    // the RING is the radius it wants this cycle, re-rolled inside the band on
    // every direction flip. A predator that always holds the same radius reads
    // as a turntable and only ever has one move in range; varying it is both
    // better-looking and what puts close moves AND long moves on the table.
    this.ring = span(this.cfg.band);   // replaced by _pickRing() on each flip
    this.missT = 0;
    /** Radius it is walking to because the current one has no move (A41b). */
    this.hole = null;
    this.repathT = 0;
    this.path = null;
    this.node = 0;
    this.travelled = 0;
    this._jitterT = 0;
    this._jitter = 0;
  }

  /** A whiffed attack backs the machine off before it tries again. */
  noteMiss() { this.missT = this.cfg.missRecover; }

  /** An attack just ended: re-choose the ring for whatever comes next. */
  repick() {
    this.ring = this._pickRing();
    this.flipT = span(this.cfg.orbitFlip);
  }

  /**
   * The radii this footwork can actually HOLD — the ring window.
   *
   * `lo` is not `band[0]`: ringing exactly on band[0] sits on the `back`
   * threshold, so the orbit spends its whole budget pumping in and out of the
   * retreat mode instead of walking the arc, and half a hysteresis of
   * clearance is the cheapest fix. That clamp is also the reason the window
   * has to be PUBLISHED to the picker rather than applied after it: a move
   * whose row ends inside the clamp can be wanted forever and legal never.
   * See `AttackPicker._reachable` for the fight that produced this method.
   */
  _ringWindow() {
    const c = this.cfg;
    return [Math.min(c.band[1], c.band[0] + (c.hyst ?? 0.6) * 0.5), c.band[1]];
  }

  /**
   * Choose this cycle's orbit radius: the range the move-picker wants, so the
   * machine sets up its next attack instead of circling at whatever radius it
   * happened to settle on.
   *
   * While the picker still has a move it has NOT shown this fight, the wanted
   * range is taken WITHOUT a dice roll — that is what makes the whole moveset
   * appear deterministically (A41 wants >= 3 distinct attacks in 25 s and used
   * to flake when the machine spent the window inside pounce range and never
   * backed out to charge distance). Once every move has been on screen, the
   * roll comes back so the spacing is not a metronome.
   *
   * The range asked for is `ringPlan(lo, hi)` — the wanted range CONSTRAINED
   * to the window this footwork can hold — and the machine tells the picker
   * which move the ring is for, so a move that keeps winning the arrangement
   * and never firing eventually gives the ring up.
   */
  _pickRing() {
    const c = this.cfg;
    const picker = this.m.ai?.picker;
    const [lo, hi] = this._ringWindow();
    // ask for a range that sets up a move ARRANGEABLE FROM THIS WINDOW: the
    // answer is then a radius the chosen row is legal at, by construction.
    const plan = picker?.ringPlan?.(lo, hi) || null;
    const want = plan ? plan.ring : null;
    const take = want != null && (picker?.hasFresh?.(lo, hi) || Math.random() < 0.8);
    // tell the picker what this ring is FOR, so a move that keeps winning the
    // arrangement and never firing gives the ring up (SCORING.arrangeGiveUp)
    if (picker?.noteArranged) picker.noteArranged(take && plan ? plan.id : null);
    let r = take ? want : span(c.band);
    r = THREE.MathUtils.clamp(r, lo, hi);
    // ...and never ring inside a range NOTHING can reach. A band wider than the
    // moveset used to let the dice park a machine in a hole for a whole orbit
    // cycle (the Strider's 10-22 m band over a 4.2-15 m dead zone).
    if (picker && !picker.coveredAt(r)) {
      const safe = picker.nearestCovered(r);
      if (safe != null) r = safe;
    }
    return r;
  }

  /** Anchor the soft leash measures against. */
  _anchor() {
    const m = this.m;
    return m.territory ? m.territory : { x: m.spawnPos.x, z: m.spawnPos.z };
  }

  /** Is the machine dragged too far from home? (soft leash, machine-ai-18) */
  leashed() {
    const a = this._anchor();
    const dx = this.m.position.x - a.x, dz = this.m.position.z - a.z;
    const r = (this.m.territory ? this.m.territory.r : 0) + (this.cfg.leash ?? 150);
    return dx * dx + dz * dz > r * r;
  }

  /**
   * One frame of combat footwork toward `tx,tz` (normally the player).
   * Returns the mode it chose.
   */
  update(dt, tx, tz) {
    const m = this.m;
    const c = this.cfg;
    const band = c.band;

    this.missT = Math.max(0, this.missT - dt);
    this.flipT -= dt;
    if (this.flipT <= 0) {
      this.flipT = span(c.orbitFlip);
      this.orbitDir = -this.orbitDir;
      this.ring = this._pickRing();
    }
    this._jitterT -= dt;
    if (this._jitterT <= 0) {
      this._jitterT = 0.8 + Math.random() * 1.2;
      this._jitter = (Math.random() - 0.5) * 2 * c.jitter;
    }

    _to.set(tx - m.position.x, 0, tz - m.position.z);
    const dist = Math.hypot(_to.x, _to.z) || 0.001;
    _to.x /= dist; _to.z /= dist;

    /**
     * Mode choice with HYSTERESIS. A bare `dist < band[0] -> back` flipped
     * back/orbit every frame once a duel settled on the inner edge of the band
     * (a stalker whose best move is a 3.4 m paw swipe rings at exactly
     * band[0]), which cancels its own travel out and reads as a jitter.
     * `back` is now entered below band[0] and only left above band[0] + hyst;
     * `close` is entered above band[1] and only left below band[1] - hyst.
     */
    const h = c.hyst ?? 0.6;
    const wasBack = this.mode === 'back', wasClose = this.mode === 'close';
    let mode;
    if (this.missT > 0) mode = 'back';
    else if (dist > band[1] - (wasClose ? h : 0)) mode = 'close';
    else if (dist < band[0] + (wasBack ? h : 0)) mode = 'back';
    else mode = 'orbit';
    // an artillery species that has been crowded commits to opening the range
    if (c.archetype === 'artillery' && dist < band[0] * 0.8) mode = 'back';
    // a skittish species never closes on its own
    if (c.archetype === 'skittish' && mode === 'close' && dist < band[1] * 1.6) mode = 'orbit';

    /**
     * DEAD-ZONE ESCAPE (`A41b-attack-coverage`). Standing at a range where no
     * move in the table can fire is the one thing the footwork must never do —
     * it is what made a Strider hold 12.5 m and throw nothing for a whole
     * fight. This overrides every mode above, including the archetype rules:
     * a machine with nothing to throw closes or gives ground until it has
     * something, and `this.hole` records the radius it is heading for so the
     * gate (and the debug HUD) can see the decision rather than infer it.
     */
    const picker = this.m.ai?.picker;
    this.hole = null;
    if (picker && !picker.coveredAt(dist)) {
      const want = picker.nearestCovered(dist);
      if (want != null) {
        this.hole = want;
        this.ring = want;
        mode = dist > want ? 'close' : 'back';
      }
    }
    this.mode = mode;

    let speed;
    if (mode === 'close') {
      _dir.set(_to.x, 0, _to.z);
      speed = m.runSpeed * c.closeSpeed;
    } else if (mode === 'back') {
      _dir.set(-_to.x, 0, -_to.z);
      speed = m.runSpeed * c.backSpeed;
    } else {
      /**
       * Circle: tangent, plus a radial nudge that holds this cycle's ring.
       *
       * URGENCY (FIX ROUND 2). The ring is not decoration — it is the range
       * the machine's NEXT move needs (`_pickRing`), so a ring it never
       * arrives at is a move it never throws. With a flat `orbitSpeed` and a
       * (dist - ring)/4 nudge, a slow species drifted toward its ring at a
       * metre or two a second and its attack cooldown came back up first,
       * every time: a Behemoth that had decided on a boulder at 12 m threw
       * `slam`/`charge` five times from 8-10 m instead, and a Scrapper that
       * wanted its 7 m laser was dragged back inside 5 m by its own lunges.
       * Both read as "two moves and a treadmill".
       *
       * So the further the ring is, the straighter and faster the machine
       * goes to it: the tangent is folded away and the speed lerps from
       * `orbitSpeed` toward `closeSpeed`. Inside a metre of the ring nothing
       * changes and it circles exactly as before.
       */
      const dr = dist - this.ring;
      const radial = THREE.MathUtils.clamp(dr / 3, -1, 1);
      const urgency = Math.min(1, Math.max(0, (Math.abs(dr) - 1) / 3));
      const tan = 1 - 0.6 * urgency;
      const tanX = -_to.z * this.orbitDir, tanZ = _to.x * this.orbitDir;
      _dir.set(
        tanX * tan + _to.x * radial + tanX * this._jitter, 0,
        tanZ * tan + _to.z * radial + tanZ * this._jitter,
      );
      const l = Math.hypot(_dir.x, _dir.z) || 1;
      _dir.x /= l; _dir.z /= l;
      speed = m.runSpeed * (c.orbitSpeed + (c.closeSpeed - c.orbitSpeed) * 0.8 * urgency);
    }

    // machine-ai-01: whisker steering around what the navgrid knows about
    const nav = m.ctx.nav;
    if (nav && nav.steer && nav.ready) {
      nav.steer(m.position, _dir, _dir, { radius: m.bodyRadius, look: 6 });
    }

    // face the target while manoeuvring (predators circle you nose-on)
    const faceX = c.strafeFace ? tx : m.position.x + _dir.x * 4;
    const faceZ = c.strafeFace ? tz : m.position.z + _dir.z * 4;
    const moved = m._steerAlong(_dir.x, _dir.z, faceX, faceZ, speed, dt);
    this.travelled += moved;
    return mode;
  }

  /**
   * Long-haul pursuit toward a remembered point (never the live player).
   * Repaths through `ctx.nav` at most every `repath` seconds.
   */
  pursue(dt, tx, tz, speed) {
    const m = this.m;
    const nav = m.ctx.nav;
    this.repathT -= dt;
    if (nav && nav.ready && nav.path) {
      const far = Math.hypot(tx - m.position.x, tz - m.position.z) > 14;
      if (far && (this.repathT <= 0 || !this.path)) {
        this.repathT = this.cfg.repath;
        this.path = nav.path(m.position, { x: tx, y: m.position.y, z: tz }) || null;
        this.node = 0;
      }
      if (this.path && this.node < this.path.length) {
        const wp = this.path[this.node];
        const d = Math.hypot(wp.x - m.position.x, wp.z - m.position.z);
        if (d < 2.5) { this.node++; }
        else {
          _dir.set(wp.x - m.position.x, 0, wp.z - m.position.z);
          const l = Math.hypot(_dir.x, _dir.z) || 1;
          _dir.x /= l; _dir.z /= l;
          if (nav.steer) nav.steer(m.position, _dir, _dir, { radius: m.bodyRadius, look: 6 });
          return m._steerAlong(_dir.x, _dir.z,
            m.position.x + _dir.x * 4, m.position.z + _dir.z * 4, speed, dt);
        }
      }
    }
    _dir.set(tx - m.position.x, 0, tz - m.position.z);
    const l = Math.hypot(_dir.x, _dir.z) || 1;
    _dir.x /= l; _dir.z /= l;
    if (nav && nav.ready && nav.steer) {
      nav.steer(m.position, _dir, _dir, { radius: m.bodyRadius, look: 6 });
    }
    return m._steerAlong(_dir.x, _dir.z,
      m.position.x + _dir.x * 4, m.position.z + _dir.z * 4, speed, dt);
  }

  reset() {
    this.path = null; this.node = 0; this.repathT = 0; this.missT = 0;
    // the ring is no longer set up for anything, so the give-up clock on
    // whatever it WAS set up for stops here rather than running through a
    // patrol and stalling that move at the start of the next fight
    this.m.ai?.picker?.noteArranged?.(null);
  }
}
