import * as THREE from 'three';
import { attackTable, SCORING } from './tables.js';
import { aiRandom } from './rng.js';

/**
 * Scored attack selection — `machine-ai-08` ("fixed attack ladder"),
 * `machine-ai-09` (planted windups), `machine-ai-19` (TJ canon).
 *
 * Round 3 picked moves with an if-ladder inside each species file, so a
 * Sawtooth at 8 m ALWAYS pounced and a Thunderjaw only ever showed its laser
 * under 40 % health. Selection now scores every legal move from
 * `ai/tables.js` and picks the best, with a repeat penalty (variety), a miss
 * penalty (it stops re-throwing what just whiffed) and a band bonus.
 *
 * Three kinds of row coexist so the rich authored poses in the species files
 * keep working while the missing canon moves get added around them:
 *   authored: 'species'  — whatever `machine.chooseAttack(dist)` returns
 *   authored: '_method'  — a direct call into the species' own builder
 *   generic:  'charge'…  — built here from `params`
 */

const _v = new THREE.Vector3();

/* --------------------------------------------------------------------- */
/* generic move library                                                   */
/* --------------------------------------------------------------------- */

/** Quick committed dash + a front-arc strike. */
function lunge(m, p) {
  return {
    kind: p.id, windup: p.windup, strike: p.strike, recover: p.recover,
    // `cooldown` is the machine's GLOBAL gap before its next move of any kind;
    // the row's own `cd` (in ai/tables.js) is what gates re-using THIS move.
    cooldown: p.gap ?? 1.5, track: true, needsHit: true, plant: true,
    onStrike: (a) => {
      if (m.damagePlayer(p.damage, p.range, 0.1)) a.hit = true;
    },
    onUpdate: (a, dt) => {
      const pose = poseOf(m);
      if (a.phase === 'strike' && p.dash) {
        const step = (p.dash / p.strike) * dt;
        m.moveRoot(Math.sin(m.heading) * step, Math.cos(m.heading) * step);
        m.aiPose.lunge = 1 - a.phaseT;
        if (pose) {
          // legs gather under the body, chest extends, jaws lead
          const k = Math.sin(Math.min(1, a.phaseT) * Math.PI);
          pose.tuck = 0.75 * k;
          pose.crouch = 0.22 * (1 - a.phaseT);
          pose.spineRear = 0.2 * k;
          pose.headPitch = 0.3 * k;
          const n = fronts(pose);
          for (let i = 0; i < n; i++) pose.legLift[i] = k;
        }
        if (!a.hit && m.damagePlayer(p.damage, p.range, 0.1)) a.hit = true;
      } else if (a.phase === 'windup') {
        m.aiPose.coil = a.phaseT;
        if (pose) {
          pose.crouch = 0.5 * a.phaseT;        // load the haunches
          pose.spineRear = -0.16 * a.phaseT;   // nose dips onto the target
          pose.headPitch = -0.1 * a.phaseT;
        }
      } else {
        m.aiPose.coil = 0;
        m.aiPose.lunge = Math.max(0, 1 - a.phaseT * 2);
        if (pose) {
          const f = Math.max(0, 1 - a.phaseT * 1.6);
          pose.tuck = 0.35 * f;
          pose.crouch = 0.28 * f;
          pose.spineRear = 0.12 * f;
          pose.headPitch = 0.18 * f;
          const n = fronts(pose);
          for (let i = 0; i < n; i++) pose.legLift[i] = 0;
        }
      }
    },
    cleanup: () => { m.aiPose.coil = 0; m.aiPose.lunge = 0; clearPose(poseOf(m)); },
  };
}

/** Committed running charge: locks a direction, ploughs through, overshoots. */
function charge(m, p) {
  const dir = new THREE.Vector3();
  return {
    kind: p.id, windup: p.windup, strike: p.strike, recover: p.recover,
    cooldown: p.gap ?? 1.6, track: true, needsHit: true, plant: 'windup',
    onWindup: () => { m.aiPose.coil = 1; },
    onStrike: (a) => {
      const pl = m.ctx.player;
      dir.set(Math.sin(m.heading), 0, Math.cos(m.heading));
      if (pl) {
        dir.set(pl.position.x - m.position.x, 0, pl.position.z - m.position.z);
        if (dir.lengthSq() > 0.01) dir.normalize();
        m.heading = Math.atan2(dir.x, dir.z);
      }
      a.hit = false;
    },
    onUpdate: (a, dt) => {
      const pose = poseOf(m);
      if (a.phase === 'windup') {
        m.aiPose.coil = a.phaseT;
        m._speed = THREE.MathUtils.damp(m._speed, 0, 9, dt);
        if (pose) {
          // dig in: shoulders drop, head comes down into the ram line
          pose.crouch = 0.42 * a.phaseT;
          pose.spineRear = -0.22 * a.phaseT;
          pose.headPitch = 0.28 * a.phaseT;
          const n = fronts(pose);
          for (let i = 0; i < n; i++) pose.legLift[i] = 0.3 * a.phaseT * (i === 0 ? 1 : 0.4);
        }
      } else if (a.phase === 'strike') {
        m.aiPose.coil = 0;
        m.aiPose.charge = 1;
        const step = p.speed * dt;
        m.moveRoot(dir.x * step, dir.z * step);
        m._speed = p.speed;             // the gait must gallop, not skate
        if (pose) {
          // head held low and level through the plough; the gallop owns the legs
          pose.crouch = 0.18;
          pose.spineRear = -0.14;
          pose.headPitch = 0.34;
          const n = fronts(pose);
          for (let i = 0; i < n; i++) pose.legLift[i] = 0;
        }
        if (!a.hit && m.damagePlayer(p.damage, p.range, 0)) {
          a.hit = true;
          if (p.knock) m.knockbackPlayer(p.knock);
        }
      } else {
        m.aiPose.charge = Math.max(0, 1 - a.phaseT * 2);
        m._speed = THREE.MathUtils.damp(m._speed, 0, 3, dt);
        if (pose) {
          const f = Math.max(0, 1 - a.phaseT * 1.5);
          pose.crouch = 0.18 * f;
          pose.spineRear = -0.1 * f;
          pose.headPitch = 0.3 * f;
        }
      }
    },
    cleanup: () => { m.aiPose.coil = 0; m.aiPose.charge = 0; clearPose(poseOf(m)); },
  };
}

/**
 * The species' own pose channels, when it has a procedural gait. Generic moves
 * drive the SAME fields the authored species attacks drive (`sawtooth.js`'s
 * swipe writes `spineYaw`/`legLift`/`crouch`/`headPitch`), so a table-built
 * move is visible on the rig instead of being pure root motion. This is a READ
 * of `machine-rig`'s structure — every write is undone in `cleanup()`.
 */
function poseOf(m) {
  const p = m.gait && m.gait.pose;
  // `legLift` is a Float32Array — gait.js allocates `new Float32Array(legs)` —
  // and `Array.isArray` is FALSE for typed arrays, so the original guard
  // returned null for every rigged species and made every pose track below
  // dead code (the moves were pure root motion). Duck-type the channel instead.
  return p && p.legLift && p.legLift.length ? p : null;
}

/** How many front limbs a generic move may claim (rig order: fronts first). */
function fronts(pose) { return Math.min(2, pose.legLift.length); }

function clearPose(pose) {
  if (!pose) return;
  pose.spineYaw = 0;
  pose.headPitch = 0;
  pose.headYaw = 0;
  pose.crouch = 0;
  pose.spineRear = 0;
  pose.tailYaw = 0;
  pose.tailLift = 0;
  pose.tuck = 0;
  for (let i = 0; i < pose.legLift.length; i++) pose.legLift[i] = 0;
}

/**
 * Multi-slash flurry — the Sawtooth's canon **Berserker Fury** (roster-v2 §4,
 * `machine-ai-08`). A loaded crouch, then N alternating paw slashes that each
 * step the body forward a little and each roll their own front-arc damage
 * check, then a settle. Unlike `lunge` it does not commit to one dash, so it
 * reads as a frenzy rather than a pounce.
 */
function flurry(m, p) {
  const arcCos = Math.cos(THREE.MathUtils.degToRad((p.arcDeg ?? 140) * 0.5));
  const hits = Math.max(1, p.hits ?? 3);
  const per = (p.damage ?? 30) / hits;
  const reach = p.range ?? 4.5;
  let done = 0, pending = false, lastSwing = 0;
  return {
    kind: p.id, windup: p.windup, strike: p.strike, recover: p.recover,
    // planted through windup and recover, free to run through the strike —
    // the flurry CLOSES the gap (its band reaches 10 m, its paws reach 4.6)
    cooldown: p.gap ?? 1.4, track: true, needsHit: true, plant: 'windup',
    onStrike: (a) => { done = 0; pending = false; a.hit = false; },
    onUpdate: (a, dt) => {
      const pose = poseOf(m);
      if (a.phase === 'windup') {
        if (pose) {
          pose.crouch = 0.55 * a.phaseT;      // hindquarters load
          pose.headPitch = 0.2 * a.phaseT;
          pose.spineRear = -0.12 * a.phaseT;
        }
        m.aiPose.coil = a.phaseT;
      } else if (a.phase === 'strike') {
        m.aiPose.coil = 0;
        // each slash: alternate paw, swing the spine across, close, roll damage
        const k = a.phaseT * hits;
        const idx = Math.min(hits - 1, Math.floor(k));
        const local = k - idx;
        const side = idx % 2 === 0 ? 1 : -1;
        // run her down: the row is legal out to 10 m but the paws reach 4.6, so
        // a flurry that stood still simply whiffed three times from 8 m
        const pl = m.ctx.player;
        if (p.close && pl) {
          const dx = pl.position.x - m.position.x, dz = pl.position.z - m.position.z;
          const d = Math.hypot(dx, dz) || 1;
          const want = reach * 0.7;
          if (d > want) {
            const step = Math.min(p.close * dt, d - want);
            m.moveRoot((dx / d) * step, (dz / d) * step);
            m.heading = Math.atan2(dx / d, dz / d);
            m._speed = p.close;            // the gait must run, not skate
          } else {
            m._speed = THREE.MathUtils.damp(m._speed, 0, 8, dt);
          }
        }
        // a slash stays PENDING until it lands or the next one is due, so the
        // first swing of a closing flurry is not wasted on the approach
        if (done <= idx) { done = idx + 1; pending = true; }
        if (pending && m.damagePlayer(per, reach, arcCos)) { pending = false; a.hit = true; }
        m.aiPose.sweep = side * Math.sin(local * Math.PI);
        if (pose) {
          const swing = side * Math.sin(local * Math.PI);
          lastSwing = swing * 0.75;
          pose.spineYaw = lastSwing;
          pose.legLift[side > 0 ? 0 : Math.min(1, pose.legLift.length - 1)] =
            Math.max(0, Math.sin(local * Math.PI));
          pose.legLift[side > 0 ? Math.min(1, pose.legLift.length - 1) : 0] = 0;
          pose.crouch = 0.55 - 0.3 * a.phaseT;
          pose.headPitch = 0.2 - 0.34 * local;
        }
      } else {
        // the gait consumes and clears `pose` every frame, so the settle has to
        // be written from the LAST swing value, not read back off the channel
        const f = Math.max(0, 1 - a.phaseT);
        m.aiPose.sweep = 0;
        if (pose) {
          pose.spineYaw = lastSwing * f;
          pose.crouch = 0.25 * f;
          pose.headPitch = 0.1 * f;
          pose.legLift[0] = 0;
          if (pose.legLift.length > 1) pose.legLift[1] = 0;
        }
      }
    },
    cleanup: () => { m.aiPose.coil = 0; m.aiPose.sweep = 0; clearPose(poseOf(m)); },
  };
}

/**
 * Wide arc swipe. `arcDeg >= 180` measures the arc against the machine's BACK
 * (`damagePlayerArc`), for a species that actually has a tail to swing — the
 * Thunderjaw's authored `_tailSweep` is the canon user; the Sawtooth is
 * explicitly tail-less (roster-v2 §3) and no longer has a rear move here.
 */
function sweep(m, p) {
  const arcCos = Math.cos(THREE.MathUtils.degToRad((p.arcDeg ?? 180) * 0.5));
  return {
    kind: p.id, windup: p.windup, strike: p.strike, recover: p.recover,
    cooldown: p.gap ?? 1.5, track: false, needsHit: true, plant: true,
    onStrike: (a) => {
      // rear arcs measure against the BACK of the machine
      const rear = (p.arcDeg ?? 180) >= 180;
      const ok = rear
        ? m.damagePlayerArc(p.damage, p.range, m.heading + Math.PI, arcCos)
        : m.damagePlayer(p.damage, p.range, arcCos);
      if (ok) { a.hit = true; if (p.knock) m.knockbackPlayer(p.knock); }
    },
    onUpdate: (a) => {
      // one signed swing value drives both the published channel and the rig:
      // wind back through the windup, whip across the strike, settle after
      let s;
      if (a.phase === 'windup') s = -a.phaseT;
      else if (a.phase === 'strike') s = -1 + a.phaseT * 2.2;
      else s = (1 - a.phaseT) * 1.2;
      m.aiPose.sweep = s;
      const pose = poseOf(m);
      if (!pose) return;
      const rear = (p.arcDeg ?? 180) >= 180;
      if (rear) {
        // the tail chain IS the weapon (thunderjaw); the torso counter-rotates
        pose.tailYaw = s * 0.95;
        pose.tailLift = 0.22 * Math.abs(s);
        pose.spineYaw = s * -0.22;
      } else {
        // a shoulder check: torso leads, the outside foreleg comes across
        pose.spineYaw = s * 0.62;
        pose.crouch = 0.2 * Math.abs(s);
        const n = fronts(pose);
        const lead = s > 0 ? 0 : Math.min(1, n - 1);
        for (let i = 0; i < n; i++) pose.legLift[i] = 0;
        pose.legLift[lead] = Math.max(0, Math.abs(s) - 0.25);
      }
      pose.headYaw = s * 0.3;
    },
    cleanup: () => { m.aiPose.sweep = 0; clearPose(poseOf(m)); },
  };
}

/** Heavy overhead slam with a ground shockwave. */
function slam(m, p) {
  return {
    kind: p.id, windup: p.windup, strike: p.strike, recover: p.recover,
    cooldown: p.gap ?? 1.8, track: true, needsHit: false, plant: true,
    onStrike: (a) => {
      m.spawnShockRing(m.position.x, m.position.z, p.ring ?? 10, 0.8, p.damage, p.radius ?? 8);
      a.hit = true;
    },
    onUpdate: (a) => {
      const pose = poseOf(m);
      if (a.phase === 'windup') {
        m.aiPose.rear = a.phaseT;
        if (pose) {
          // rear up: spine pitches back, head lifts, both forelegs leave the floor
          pose.spineRear = 0.55 * a.phaseT;
          pose.headPitch = -0.34 * a.phaseT;
          const n = fronts(pose);
          for (let i = 0; i < n; i++) pose.legLift[i] = a.phaseT;
        }
      } else if (a.phase === 'strike') {
        m.aiPose.rear = 1 - a.phaseT;
        if (pose) {
          const f = 1 - a.phaseT;
          pose.spineRear = 0.55 * f - 0.26 * a.phaseT;   // whips down past level
          pose.headPitch = -0.34 * f + 0.42 * a.phaseT;
          pose.crouch = 0.4 * a.phaseT;
          const n = fronts(pose);
          for (let i = 0; i < n; i++) pose.legLift[i] = f;
        }
      } else {
        m.aiPose.rear = 0;
        if (pose) {
          const f = Math.max(0, 1 - a.phaseT * 1.4);
          pose.crouch = 0.4 * f;
          pose.spineRear = -0.26 * f;
          pose.headPitch = 0.42 * f;
          const n = fronts(pose);
          for (let i = 0; i < n; i++) pose.legLift[i] = 0;
        }
      }
    },
    cleanup: () => { m.aiPose.rear = 0; clearPose(poseOf(m)); },
  };
}

const GENERIC = { lunge, charge, sweep, slam, flurry };

/* --------------------------------------------------------------------- */
/* picker                                                                 */
/* --------------------------------------------------------------------- */

export class AttackPicker {
  constructor(machine) {
    this.m = machine;
    this.rows = attackTable(machine.kind);
    this.cd = new Map();          // row id -> seconds remaining
    this.lastId = null;
    this.streak = 0;
    this.missed = new Map();      // row id -> seconds of miss memory left
    this.used = new Set();        // distinct ids used this life (A41 evidence)
    /**
     * Rows that were LEGAL and still built nothing (`authored: 'species'` with
     * the species' own ladder offering nothing at all this frame). A phantom
     * row is a range band that exists in the table and not in the world, which
     * is exactly the Strider dead zone; the tables are fixed, but a species
     * whose ladder narrows again would silently re-open one. Coverage queries
     * skip phantoms, so `Engage` walks out of the hole instead of standing in
     * it. A row un-phantoms the moment its species does offer the move.
     */
    this.phantom = new Set();
    /**
     * Moves the footwork has GIVEN UP arranging for, and the seconds of
     * give-up left. See `SCORING.arrangeGiveUp`: a row that has been the
     * standoff ring's reason for `arrangeGiveUp` seconds without once firing
     * is a row holding the machine hostage, whatever the reason, and it stops
     * being arrangeable until it either fires or the hold expires. Selection
     * is untouched — a stalled move still fires the instant it is legal and
     * wins the descent, which is exactly how it un-stalls itself.
     */
    this.stalled = new Map();
    /**
     * Moves whose RING the machine could not see from, and the seconds of
     * hold left (`SCORING.blindHold`). Written only by
     * `Engage._giveUpBlind` through `noteBlindRing`. A soft, short
     * de-prioritisation of the ARRANGEMENT — never of the move: see
     * `_bestArrangeable`, which falls back to this set when it is the only
     * thing left, and `pick()`, which clears the entry the moment it fires.
     */
    this.blind = new Map();
    this._arrangedId = null;    // what the ring is currently set up for
    this._arrangedT = 0;        // ...and for how many seconds
    this.rowById = new Map();   // id -> row, so lookups allocate nothing
    for (const row of this.rows) this.rowById.set(row.id, row);
    // scratch for `pick()`'s score-then-descend; never reallocated
    this._score2 = new Float64Array(this.rows.length);
    this._open = new Uint8Array(this.rows.length);
  }

  tick(dt) {
    for (const [k, v] of this.cd) {
      const n = v - dt;
      if (n <= 0) this.cd.delete(k); else this.cd.set(k, n);
    }
    for (const [k, v] of this.missed) {
      const n = v - dt;
      if (n <= 0) this.missed.delete(k); else this.missed.set(k, n);
    }
    for (const [k, v] of this.stalled) {
      const n = v - dt;
      if (n <= 0) this.stalled.delete(k); else this.stalled.set(k, n);
    }
    for (const [k, v] of this.blind) {
      const n = v - dt;
      if (n <= 0) this.blind.delete(k); else this.blind.set(k, n);
    }
    if (this._arrangedId) {
      this._arrangedT += dt;
      if (this._arrangedT >= SCORING.arrangeGiveUp) {
        this.stalled.set(this._arrangedId, SCORING.stallHold);
        this._arrangedId = null;
        this._arrangedT = 0;
      }
    }
  }

  /**
   * `Engage` reporting which move it just set the standoff ring up for. The
   * clock only restarts when the ANSWER changes, so re-choosing the same move
   * on every orbit flip — the hostage case — keeps accumulating.
   */
  noteArranged(id) {
    if (id === this._arrangedId) return;
    this._arrangedId = id || null;
    this._arrangedT = 0;
  }

  /** PUBLISHED: the move the standoff ring is currently set up for, or null. */
  get arrangedId() { return this._arrangedId; }

  /**
   * `Engage` reporting that it swept a whole blind hold at the ring it was
   * holding for `id` and never recovered the sightline — see
   * `SCORING.blindHold` and `Engage._giveUpBlind`. `ring` is the radius it
   * failed at, kept for the HUD and the gate report.
   */
  noteBlindRing(id, ring = null) {
    if (!id) return;
    this.blind.set(id, SCORING.blindHold);
    this._blindRingAt = ring;
    if (this._arrangedId === id) { this._arrangedId = null; this._arrangedT = 0; }
  }

  /** PUBLISHED (gates + HUD): `[[id, secondsLeft], ...]`. ALLOCATES. */
  blindRings() { return [...this.blind.entries()].map(([k, v]) => [k, +v.toFixed(2)]); }

  _playerBehind() {
    const p = this.m.ctx.player;
    if (!p) return false;
    _v.set(p.position.x - this.m.position.x, 0, p.position.z - this.m.position.z);
    const d = Math.hypot(_v.x, _v.z);
    if (d < 0.1) return false;
    return (_v.x * Math.sin(this.m.heading) + _v.z * Math.cos(this.m.heading)) / d < -0.15;
  }

  _partAttached(name) {
    for (const p of this.m.parts) if (p.name === name) return p.attached;
    return true;
  }

  _legal(row, dist) {
    const m = this.m;
    if (dist < row.min || dist > row.max) return false;
    if (this.cd.has(row.id)) return false;
    if (row.needPart && !this._partAttached(row.needPart)) return false;
    if (m.attackDisabled(row.id)) return false;
    if (row.arc === 'rear' && !this._playerBehind()) return false;
    return true;
  }

  _score(row, dist) {
    let s = row.score;
    if (this.lastId === row.id) s *= SCORING.repeatPenalty * (this.streak > 1 ? SCORING.streakPenalty : 1);
    if (this.missed.has(row.id)) s *= SCORING.missPenalty;
    if (!this.used.has(row.id)) s *= SCORING.freshBonus;   // show the whole moveset
    const mid = (row.min + row.max) * 0.5;
    const spread = Math.max(1, (row.max - row.min) * 0.5);
    s *= 1 + SCORING.bandBonus * (1 - Math.min(1, Math.abs(dist - mid) / spread));
    s *= 1 + (aiRandom() - 0.5) * 2 * SCORING.randomness;
    // ...and the hard tier LAST, past the jitter: an unused legal move always
    // outranks a used one, so a fight shows the whole moveset deterministically
    if (!this.used.has(row.id)) s += SCORING.freshTier;
    return s;
  }

  /** Build the attack object for a winning row, or null. */
  _build(row, dist, speciesAttack) {
    const m = this.m;
    if (row.generic) {
      const fn = GENERIC[row.generic];
      if (!fn) return null;
      return fn(m, { id: row.id, cd: row.cd, ...(row.params || {}) });
    }
    if (row.authored === 'species') {
      return speciesAttack && speciesAttack.kind === row.id ? speciesAttack : null;
    }
    if (typeof row.authored === 'string') {
      const fn = m[row.authored];
      if (typeof fn !== 'function') return null;
      return row.pass === 'dist' ? fn.call(m, dist) : fn.call(m);
    }
    return null;
  }

  /**
   * Choose the next move. `speciesAttack` is whatever the species' own
   * `chooseAttack(dist)` offered this frame (may be null).
   *
   * Rows are tried in descending score and only the WINNER is built. The old
   * loop built every row that was leading at the time it was reached, which
   * (a) ran a species builder for moves that never fired and (b) burned that
   * move's `cdField` on the species — a Thunderjaw could lose its laser to a
   * cannon it chose instead. Building lazily also means the phantom check
   * below sees a row's real buildability, not a scoring accident.
   */
  /**
   * Is the machine mid-SETUP for a move it has not shown yet, and still out of
   * its range? Then it declines this window rather than spending it on a move
   * the fight has already seen. See `SCORING.setupPatience` for the bounds —
   * fresh move only, never the opening move, never longer than that many
   * seconds. `_arrangedT` is reset by `noteArranged` whenever the footwork
   * changes its mind, so the wait tracks one intention, not the clock.
   */
  _holdingSetup(dist) {
    const id = this._arrangedId;
    if (!id || this.used.has(id)) return false;
    if (!this.used.size) return false;                 // never delay the opener
    if (this._arrangedT >= SCORING.setupPatience) return false;
    if (this.cd.has(id) || this.stalled.has(id)) return false;
    const row = this.rowById.get(id);
    if (!row) return false;
    if (dist >= row.min && dist <= row.max) return false;   // already there: throw it
    return true;
  }

  pick(dist, speciesAttack) {
    if (this._holdingSetup(dist)) return null;
    const rows = this.rows;
    let best = null, bestRow = null;
    // score every legal row ONCE into the scratch buffers (`_score` rolls a
    // die, so re-scoring inside the descent would shuffle the ladder), then
    // walk them in descending order. No allocation: both buffers are per-
    // picker and sized to the table at construction.
    const score = this._score2, open = this._open;
    for (let i = 0; i < rows.length; i++) {
      const legal = this._legal(rows[i], dist);
      open[i] = legal ? 1 : 0;
      score[i] = legal ? this._score(rows[i], dist) : -Infinity;
    }
    for (let guard = rows.length; guard-- > 0;) {
      let bi = -1, bs = -Infinity;
      for (let i = 0; i < rows.length; i++) {
        if (!open[i] || score[i] <= bs) continue;
        bi = i; bs = score[i];
      }
      if (bi < 0) break;
      open[bi] = 0;
      const row = rows[bi];
      const a = this._build(row, dist, speciesAttack);
      if (a) {
        if (row.authored === 'species') this.phantom.delete(row.id);
        best = a; bestRow = row;
        break;
      }
      // a 'species' row that is in range with the ladder offering NOTHING is a
      // hole in the moveset, not a scoring loss — remember it (see
      // `this.phantom`). A row that lost only because the ladder offered a
      // DIFFERENT move this frame is fine and is not marked.
      if (row.authored === 'species' && !speciesAttack) this.phantom.add(row.id);
    }
    // no table row fired: fall back to whatever the species wanted
    if (!best && speciesAttack) {
      best = speciesAttack;
      bestRow = rows.find((r) => r.id === speciesAttack.kind) || null;
    }
    if (!best) return null;

    const id = bestRow ? bestRow.id : (best.kind || 'attack');
    best.kind = best.kind || id;
    best.rowId = id;
    // the species' own cooldown field, set only for the move that actually
    // fires (`_build` no longer touches it)
    if (bestRow && bestRow.cdField) this.m[bestRow.cdField] = bestRow.cd;
    this.cd.set(id, (bestRow?.cd ?? best.cooldown ?? 2.5));
    this.streak = this.lastId === id ? this.streak + 1 : 0;
    this.lastId = id;
    this.used.add(id);
    // a move that fires has kept its promise: it is not holding the ring, and
    // whatever the ground did to its sightline a moment ago, it just worked
    this.stalled.delete(id);
    this.blind.delete(id);
    if (this._arrangedId === id) { this._arrangedId = null; this._arrangedT = 0; }
    return best;
  }

  /**
   * The standoff radius that would actually SET UP `row`: its band centre,
   * pulled into the overlap between the row's range and the footwork's own
   * band. `null` when there is no overlap — the engage layer can never park
   * the machine where that move is legal, so asking it to try would jam the
   * ring at an unreachable radius and starve every other move.
   *
   * `lo`/`hi` narrow that overlap to the radii the FOOTWORK CAN ACTUALLY HOLD
   * (`Engage._ringWindow()`), and passing them is what makes the answer honest
   * rather than merely arithmetically true.
   *
   * THE LIVELOCK (judge-machine-ai-followup-r1). `Engage._pickRing()` clamps
   * its ring away from the band's inner edge by half a hysteresis, so with the
   * Strider's band at 4.2 m the smallest ring it can hold is 4.5 m — 0.1 m
   * outside `front-kick`'s 4.4 m row. The unclamped overlap said 4.2 m, the
   * footwork stood at 4.5 m, the kick was never legal, never fired, never left
   * the fresh set, and so was re-arranged for on every single flip: the
   * machine held one radius for the whole fight and threw the ONE move legal
   * there. A dead zone reappearing as a stuck ring. With the window applied,
   * a row that no holdable ring can reach returns `null` here, drops out of
   * `_arrangeable`/`hasFresh`/`wantedRange`, and the next-best row is arranged
   * for instead — the livelock is not tuned away, it is unrepresentable.
   */
  _reachable(row, lo = null, hi = null) {
    const band = this.m.ai?.engage?.cfg?.band;
    const mid = (row.min + row.max) * 0.5;
    let rlo = row.min, rhi = row.max;
    if (band) { rlo = Math.max(rlo, band[0]); rhi = Math.min(rhi, band[1]); }
    if (lo != null) rlo = Math.max(rlo, lo);
    if (hi != null) rhi = Math.min(rhi, hi);
    if (rlo > rhi) return null;
    return THREE.MathUtils.clamp(mid, rlo, rhi);
  }

  /** Rows the footwork is allowed to arrange for (cooldown + reach + parts). */
  _arrangeable(row, lo = null, hi = null) {
    if (this.cd.has(row.id)) return false;
    if (row.arc === 'rear') return false;               // not ours to arrange
    if (this.phantom.has(row.id)) return false;         // in the table, not in the world
    if (this.stalled.has(row.id)) return false;         // held the ring and never fired
    if (row.needPart && !this._partAttached(row.needPart)) return false;
    if (this.m.attackDisabled(row.id)) return false;
    return this._reachable(row, lo, hi) != null;
  }

  /* ---------------- range coverage (the Strider dead zone) ------------- */

  /**
   * Can this row EVER fire at `dist`? Structure only — parts, disabled moves,
   * phantom rows and the range band. Cooldowns are deliberately ignored: a
   * move on cooldown is a pause, a range nothing covers is a hole.
   * `arc: 'rear'` rows are excluded because the machine cannot promise the
   * player will be behind it.
   */
  _covers(row, dist) {
    if (dist < row.min || dist > row.max) return false;
    if (row.arc === 'rear') return false;
    if (this.phantom.has(row.id)) return false;
    if (row.needPart && !this._partAttached(row.needPart)) return false;
    if (this.m.attackDisabled(row.id)) return false;
    return true;
  }

  /** Is there any move at all for this range? (`A41b-attack-coverage`) */
  coveredAt(dist) {
    for (const row of this.rows) if (this._covers(row, dist)) return true;
    return false;
  }

  /**
   * The nearest range that IS covered, or null when the moveset is empty.
   * `Engage` steers to this when it finds itself standing in a hole, which is
   * the "close or retreat into a valid band" half of the gate.
   */
  nearestCovered(dist) {
    let best = null, bestGap = Infinity;
    for (const row of this.rows) {
      if (row.arc === 'rear' || this.phantom.has(row.id)) continue;
      if (row.needPart && !this._partAttached(row.needPart)) continue;
      if (this.m.attackDisabled(row.id)) continue;
      // pull just INSIDE the row so a float edge is not a coin flip
      const pad = Math.min(0.35, (row.max - row.min) * 0.25);
      const want = dist < row.min ? row.min + pad
        : dist > row.max ? row.max - pad : dist;
      const gap = Math.abs(want - dist);
      if (gap < bestGap) { bestGap = gap; best = want; }
    }
    return best;
  }

  /**
   * Structural audit of the whole table: the holes inside `[0, reach]` where
   * no move can fire. `A41b-attack-coverage` asserts this is empty across each
   * species' engage band, and it is the check the Strider dead zone failed.
   * Off the hot path — the gate and the debug HUD call it, the sim does not.
   */
  coverage(step = 0.25) {
    let reach = 0;
    for (const row of this.rows) if (row.max > reach) reach = row.max;
    const holes = [];
    let open = null;
    for (let d = 0; d <= reach + 1e-6; d += step) {
      if (this.coveredAt(d)) {
        if (open) { holes.push([+open.toFixed(2), +(d - step).toFixed(2)]); open = null; }
      } else if (open == null) open = d;
    }
    if (open != null) holes.push([+open.toFixed(2), +reach.toFixed(2)]);
    return { reach: +reach.toFixed(2), holes, phantom: [...this.phantom] };
  }

  /**
   * MOVE VARIETY ACROSS THE STANDOFF BAND (judge-machine-ai-followup-r0 §2).
   *
   * `coverage()` answers "is there a move here?". This answers "is it always
   * the SAME move?" — the failure that replaced the Strider dead zone once the
   * hole was closed by stretching one row over it. Walks the species' engage
   * band and reports, per non-rear row, how much of the band it covers and how
   * much of the band it is the ONLY answer for.
   *
   * `arc: 'rear'` rows are excluded (the footwork cannot promise the player is
   * behind the machine, so they are never an answer it can arrange), and so is
   * the phantom set by default: this is meant to be a reading of the TABLE,
   * not of one fight's luck. Pass `{ live: true }` to include phantom rows'
   * exclusion, i.e. to see what the machine can really do right now.
   *
   * Off the hot path: the gate and the debug HUD call it, the sim does not.
   *
   * @returns {{band:number[], width:number, distinct:number, ids:string[],
   *            sole:Object<string,number>, maxSoleFrac:number,
   *            maxSoleId:string|null, uncovered:number}}
   */
  bandProfile(step = 0.1, opts = {}) {
    const band = this.m.ai?.engage?.cfg?.band || [0, 0];
    const lo = band[0], hi = band[1];
    const width = Math.max(0, hi - lo);
    const live = !!opts.live;
    const rows = this.rows.filter((r) => {
      if (r.arc === 'rear') return false;
      if (live && this.phantom.has(r.id)) return false;
      if (r.needPart && !this._partAttached(r.needPart)) return false;
      if (this.m.attackDisabled(r.id)) return false;
      return true;
    });
    const span = new Map(), sole = new Map();
    let uncovered = 0, samples = 0;
    for (let d = lo; d <= hi + 1e-6; d += step) {
      samples++;
      let n = 0, last = null;
      for (const r of rows) {
        if (d < r.min || d > r.max) continue;
        n++; last = r.id;
        span.set(r.id, (span.get(r.id) || 0) + 1);
      }
      if (n === 0) uncovered++;
      else if (n === 1) sole.set(last, (sole.get(last) || 0) + 1);
    }
    const frac = (n) => (samples ? n / samples : 0);
    let maxSoleId = null, maxSoleFrac = 0;
    for (const [id, n] of sole) {
      if (frac(n) > maxSoleFrac) { maxSoleFrac = frac(n); maxSoleId = id; }
    }
    const out = {
      band: [lo, hi], width: +width.toFixed(2),
      distinct: span.size, ids: [...span.keys()],
      covers: {}, sole: {},
      maxSoleId, maxSoleFrac: +maxSoleFrac.toFixed(3),
      uncovered: +frac(uncovered).toFixed(3),
    };
    for (const [id, n] of span) out.covers[id] = +frac(n).toFixed(3);
    for (const [id, n] of sole) out.sole[id] = +frac(n).toFixed(3);
    return out;
  }

  /* ------------- band vs ring window (the livelock, directly) ---------- */

  /**
   * Is this row one the footwork OWES the fight? Structure only: non-rear,
   * its part still attached, not disabled by the species, and its `[min,max]`
   * actually intersects the engage band. Cooldown / phantom / stall are
   * deliberately NOT considered — those are moments, and this is a property
   * of the TABLE, which is the point: it does not move when the thing it is
   * measuring breaks.
   */
  _bandEligible(row) {
    if (row.arc === 'rear') return false;                 // never arranged for
    if (row.needPart && !this._partAttached(row.needPart)) return false;
    if (this.m.attackDisabled(row.id)) return false;
    const band = this.m.ai?.engage?.cfg?.band;
    if (!band) return false;
    return row.max >= band[0] && row.min <= band[1];
  }

  /**
   * THE DIRECT LIVELOCK INVARIANT (judge-machine-ai-followup-r2).
   *
   * How many rows reach into the engage band but NOT into the ring window the
   * footwork can actually hold. Such a row is a move the machine can want for
   * ever and never fire: the picker keeps arranging for it, the orbit keeps
   * walking to a radius it is out of range at, and the species collapses to
   * whatever else happens to be legal there. Measured three times — a Strider
   * `front-kick` capped at 4.4 m against a 4.5 m ring floor, a Scrapper `claw`
   * at 3.4 m against 3.3 m, a Longleg `jet-blast` cone at 7 m against 7.3 m.
   *
   * `_reachable` already clips by the band, so with the ring window passed in
   * this is non-zero exactly when some eligible row's `max` sits below
   * `band[0] + hyst/2`. Non-allocating; safe to sample per step.
   * @returns {number} 0 when healthy
   */
  bandBlocked(lo = null, hi = null) {
    let n = 0;
    for (const row of this.rows) {
      if (!this._bandEligible(row)) continue;
      if (this._reachable(row, lo, hi) == null) n++;
    }
    return n;
  }

  /** The ids `bandBlocked()` counted. Allocates; gates and the HUD only. */
  bandUnreachable(lo = null, hi = null) {
    const out = [];
    for (const row of this.rows) {
      if (!this._bandEligible(row)) continue;
      if (this._reachable(row, lo, hi) == null) out.push(row.id);
    }
    return out;
  }

  /**
   * THE BAND-INDEPENDENT MOVESET SIZE (judge-machine-ai-followup-r2, residue).
   *
   * How many moves this species owes a standoff fight, counted WITHOUT
   * consulting the engage band, the ring window, or anything else the
   * footwork can move. Non-rear (the machine cannot promise the player is
   * behind it), part still attached, not disabled by the species — structure
   * and nothing else.
   *
   * WHY NOT `bandProfile().distinct`. The r2 fix moved `A41c`'s variety bar
   * off ring reachability and onto the band, which closed three of the four
   * shapes the regression can take. It did not close the fourth: the ring
   * window IS the band (`[band[0] + hyst/2, band[1]]`), so a band floor that
   * climbs past a row's `max` drops that row out of `bandProfile()` AND out
   * of `bandBlocked()`'s eligibility at the same instant — the move leaves
   * the fight, the invariant stops watching it, and the bar falls by one to
   * meet what is left. Measured: pushing the Strider's band to `[4.95, 14]`
   * takes `front-kick` (row `[0, 4.6]`) out of the repertoire with
   * `blocked: 0` and the band bar dropping 3 -> 2, i.e. silently green.
   * Counting the TABLE cannot move with any of them.
   *
   * Off the hot path: gates and the debug HUD only.
   * @returns {number} non-rear rows this species can structurally still throw
   */
  movesetSize() {
    let n = 0;
    for (const row of this.rows) {
      if (row.arc === 'rear') continue;
      if (row.needPart && !this._partAttached(row.needPart)) continue;
      if (this.m.attackDisabled(row.id)) continue;
      n++;
    }
    return n;
  }

  /** The ids `movesetSize()` counted. Allocates; gates and the HUD only. */
  movesetRows() {
    const out = [];
    for (const row of this.rows) {
      if (row.arc === 'rear') continue;
      if (row.needPart && !this._partAttached(row.needPart)) continue;
      if (this.m.attackDisabled(row.id)) continue;
      out.push(row.id);
    }
    return out;
  }

  /**
   * The highest-scoring row the footwork may arrange for inside the ring
   * window, with the same fresh-first tier `_score` uses. Shared by
   * `wantedRange` and `ringPlan` so the range the machine walks to and the
   * move it walked there for can never disagree.
   */
  _bestArrangeable(lo = null, hi = null) {
    const best = this._bestArrangeablePass(lo, hi, true);
    // FALLBACK (judge-machine-ai-r2-r1 §1). `blind` is a hint, not a veto: if
    // the only rows this window can set up are ones the machine just failed to
    // see from, it still arranges for the best of them rather than standing
    // there with no plan at all. The hint expires in `SCORING.blindHold`.
    return best || this._bestArrangeablePass(lo, hi, false);
  }

  /** One pass of `_bestArrangeable`; `skipBlind` honours the blind hint. */
  _bestArrangeablePass(lo, hi, skipBlind) {
    let best = null, bs = -1;
    for (const row of this.rows) {
      if (skipBlind && this.blind.has(row.id)) continue;
      if (!this._arrangeable(row, lo, hi)) continue;
      let s = row.score;
      if (this.lastId === row.id) s *= SCORING.repeatPenalty;
      if (this.missed.has(row.id)) s *= SCORING.missPenalty;
      // same hard tier as `_score`: the footwork sets up an UNSEEN move first
      if (!this.used.has(row.id)) s = s * SCORING.freshBonus + SCORING.freshTier;
      if (s > bs) { bs = s; best = row; }
    }
    return best;
  }

  /**
   * The range the machine WANTS to be at: the range that sets up the move it
   * would most like to throw next, ignoring the current distance. `Engage`
   * uses this to pick its orbit ring, so a Sawtooth that fancies a charge
   * actually backs off to charge distance instead of circling forever at
   * pounce range. This is what turns a scored table into a readable moveset.
   *
   * `lo`/`hi` are the window of radii the caller can actually hold; pass them
   * (Engage does) and the answer is guaranteed to be a radius the winning row
   * is LEGAL at. See `_reachable` for the livelock this closes.
   * @returns metres, or null when nothing is off cooldown.
   */
  wantedRange(lo = null, hi = null) {
    const best = this._bestArrangeable(lo, hi);
    return best ? this._reachable(best, lo, hi) : null;
  }

  /**
   * PUBLISHED (gates + debug HUD): what the footwork is currently setting up —
   * `{ id, ring, min, max, legal, blocked }` for the row `wantedRange(lo, hi)`
   * chose.
   *
   * HONESTY NOTE (judge-machine-ai-followup-r2). `legal` was published as THE
   * livelock invariant and it is not one: `_bestArrangeable` only returns rows
   * `_reachable` accepts, and `_reachable` only ever returns a value clamped
   * inside `[row.min, row.max]`, so `legal` is true by construction and a gate
   * asserting it is asserting a tautology. It is kept because it is still a
   * cheap self-consistency check on that construction (a future refactor that
   * lets the ring escape its own row trips it), but it is NOT the bar.
   *
   * `blocked` is the real one: the number of rows that reach into the engage
   * band while this ring window cannot set them up — see `bandBlocked()`, the
   * livelock asserted directly rather than through its symptom.
   * `A41c-sustained-variety` asserts `blocked === 0` on every sim step of
   * every species.
   */
  ringPlan(lo = null, hi = null) {
    const row = this._bestArrangeable(lo, hi);
    if (!row) return null;
    const ring = this._reachable(row, lo, hi);
    return {
      id: row.id, ring, min: row.min, max: row.max,
      legal: ring != null && ring >= row.min && ring <= row.max,
      blocked: this.bandBlocked(lo, hi),
    };
  }

  /**
   * Is there a move it has NOT shown this fight and could throw right now if
   * only it were at the right range? `Engage` uses this to stop rolling dice
   * on its orbit radius until the whole moveset has been on screen once.
   * Takes the same ring window as `wantedRange`: a fresh move no holdable ring
   * can set up is not a reason to keep taking the wanted range deterministic
   * (that was half of what kept the Strider pinned to one radius).
   */
  hasFresh(lo = null, hi = null) {
    for (const row of this.rows) {
      if (this.used.has(row.id)) continue;
      if (this._arrangeable(row, lo, hi)) return true;
    }
    return false;
  }

  /** Called when an attack finishes so a whiff is remembered. */
  finish(a) {
    if (!a || !a.needsHit) return;
    if (!a.hit) this.missed.set(a.rowId || a.kind, SCORING.missMemory);
  }
}
