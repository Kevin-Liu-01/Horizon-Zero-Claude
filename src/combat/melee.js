import * as THREE from 'three';
import { buildSpear } from './bow.js';
import { MELEE } from './weapons.js';

/**
 * THE SPEAR — `combat-melee-missing` (audit §1 #4, a blocker in four
 * independent audits), plus `stealth-silent-strike-missing` and the melee half
 * of `machine-ai-10`'s Critical Hit.
 *
 * Before this file, LMB outside aim was dead input: Aloy carried a spear she
 * could not swing, so every stealth approach, every shock-stun and every
 * downed machine had no payoff. Three moves live here:
 *
 *   LIGHT   tap LMB (unaimed) — a three-hit chain, 26 / 30 / 42 impact, the
 *           third one wide and staggering. Chains inside `comboWindow`.
 *   HEAVY   hold LMB past `heavy.chargeTime` — one committed overhead,
 *           78 impact / 46 tear, wide arc, always a flinch.
 *   SILENT  E on an UNAWARE machine within 2 m, from behind or crouched.
 *   STRIKE  Instant kill on the small classes, 55 % of max health otherwise.
 *
 * A swing landing on a machine in `downed` (published by `machine-ai`) is a
 * CRITICAL HIT: `crit.frac` of max health and a `critical-hit` event.
 *
 * Published on `ctx.combat.melee`:
 *   active / phase ('idle'|'windup'|'strike'|'recover') / heavy / combo
 *   silentTarget            the machine the prompt is offered on, or null
 *   swing({ heavy })        fire a swing (gates + scripted beats)
 *   silentStrike()          execute the prompt right now; -> result | null
 *   audit()                 { swings, hits, silent, crits }
 * Events: 'melee-hit' { machine, damage, heavy, combo, point, killed },
 *         'silent-strike' { machine, killed, damage },
 *         'critical-hit'  { machine, damage }   (shared with machine-ai)
 *
 * Cost: ONE `ctx.hitHulls.raycast` per strike frame (not per frame), plus
 * O(roster) distance/dot arithmetic. Nothing allocates in the hot path.
 */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _chest = new THREE.Vector3();
const _pt = new THREE.Vector3();
const _n = new THREE.Vector3();
const _hitDir = new THREE.Vector3();
const _ray = { origin: new THREE.Vector3(), direction: new THREE.Vector3() };
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
/** Scratch for `surfaceGap`: the point on the standoff SEGMENT nearest the
 *  query (y unused). */
const _axis = new THREE.Vector3();

/** Aware = it already knows something is wrong and is looking for you. */
const AWARE_STATES = new Set(['alert', 'attack']);
/** States where a Silent Strike is not the right verb. */
const NO_SNEAK_STATES = new Set(['dead', 'downed', 'stagger', 'overridden']);

/**
 * DISTANCE TO THE SILHOUETTE, not to the navel.
 *
 * Every reach number in this file used to be centre-to-centre minus a fudged
 * fraction of `bodyRadius`, and that silently made two moves impossible. A
 * machine's blocking collider (`collision._syncMachines`) is a CAPSULE swept
 * along its heading: `standoffHalfLen` either side of the centre, inflated by
 * `bodyRadius + machinePad`, and the player's own capsule adds its radius on
 * top. Measured on port 5208, a crouched Aloy pressed against the BACK of a
 * Watcher stands 3.35 m from its centre — the collider will not let her any
 * closer — while `MELEE.silent.range` is 2.0 m centre-to-centre. The Silent
 * Strike prompt could therefore never appear on any machine, and the spear
 * could not reach a Thunderjaw at all (its standoff segment is far longer).
 *
 * This returns the gap between `(x, z)` and the machine's OUTER SHELL: the
 * distance to its standoff segment, less `bodyRadius`. Pressed against a
 * Watcher that is ~0.95 m; a step back is ~1.9 m; two steps is out of range —
 * which is what "2 m from the machine" is supposed to mean.
 */
function surfaceGap(m, x, z) {
  const L = m.standoffHalfLen ?? 0;
  const dx = x - m.position.x, dz = z - m.position.z;
  let d;
  if (L > 1e-3) {
    const fx = Math.sin(m.heading ?? 0), fz = Math.cos(m.heading ?? 0);
    const t = Math.max(-L, Math.min(L, dx * fx + dz * fz));
    _axis.set(m.position.x + fx * t, 0, m.position.z + fz * t);
    d = Math.hypot(x - _axis.x, z - _axis.z);
  } else {
    _axis.set(m.position.x, 0, m.position.z);
    d = Math.hypot(dx, dz);
  }
  return d - (m.bodyRadius ?? 1);
}

const SPARK_STEEL = [[1.0, 0.72, 0.28], [1.0, 0.5, 0.1], [0.95, 0.85, 0.6]];

export class Melee {
  constructor(ctx, combat) {
    this.ctx = ctx;
    this.combat = combat;

    this.active = false;
    this.phase = 'idle';
    this.heavy = false;
    this.combo = 0;
    this.silentTarget = null;
    this.lastSwingT = -99;

    this._t = 0;              // phase clock (real seconds)
    this._phaseEnd = 0;
    this._struck = false;
    this._chargeT = 0;
    this._charging = false;
    this._buffered = false;
    this._comboT = 0;
    this._visT = 0;           // spear draw-in 0..1
    this._scanT = 0;
    this._stats = { swings: 0, hits: 0, silent: 0, crits: 0 };

    /* ------------------------------ the model ---------------------------- */
    this.spear = buildSpear();
    this._attachSpear();
    this.spear.group.visible = false;

    // swing trail: one thin additive arc that sweeps with the blade
    const trailGeo = new THREE.RingGeometry(0.55, 1.65, 20, 1, -0.9, 1.8);
    this._trail = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({
      color: 0xfff0d0, transparent: true, opacity: 0, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this._trail.visible = false;
    this._trail.raycast = () => {};
    this._trail.renderOrder = 12;
    ctx.scene.add(this._trail);
    this._trailT = 1e9;

    /* --------------------------- SILENT STRIKE --------------------------- */
    // one persistent interactable, enabled/disabled per frame so the HUD
    // prompt appears and vanishes without churning the registry
    this._sneak = {
      position: new THREE.Vector3(),
      radius: MELEE.silent.range + 0.6,
      label: MELEE.silent.label,
      hold: MELEE.silent.hold,
      disabled: true,
      priority: 2,
      onInteract: () => this.silentStrike(),
    };
    ctx.interactables?.register?.(this._sneak);
    this._sneakRegistered = !!ctx.interactables;

    ctx.events.on('player-died', () => this._cancel());
  }

  /* ------------------------------- plumbing ------------------------------- */

  _attachSpear() {
    const anim = this.ctx.player?.animator;
    let node = null;
    try { node = anim?.handAttach?.('r') ?? null; } catch { node = null; }
    if (!node) node = anim?.bones?.['hand_r_045'] ?? null;
    if (!node) {
      node = new THREE.Group();
      node.position.set(-0.28, 1.28, 0.12);
      (this.ctx.player?.model ?? this.ctx.scene).add(node);
    }
    this._hand = node;
    node.add(this.spear.group);
  }

  audit() { return { ...this._stats }; }

  /* --------------------------------- input -------------------------------- */

  /**
   * Driven from `Combat.update` so there is exactly one owner of the LMB
   * meaning: aiming -> draw/loose, not aiming -> spear.
   */
  update(realDt, playing) {
    this._visT = Math.max(0, this._visT - realDt);
    this._comboT = Math.max(0, this._comboT - realDt);
    if (this._comboT <= 0 && !this.active) this.combo = 0;

    const ctx = this.ctx;
    const p = ctx.player;
    const aiming = !!p?.aiming;
    const wheelOpen = !!ctx.wheel?.open;
    const canSwing = playing && !aiming && !wheelOpen && !p?.mounted && (p?.health ?? 1) > 0;

    // --- charge / release
    const lmb = canSwing && ctx.input.mouseDown(0);
    if (lmb) {
      if (!this._charging && !this.active) { this._charging = true; this._chargeT = 0; }
      if (this._charging) {
        this._chargeT += realDt;
        // committed heavies fire on their own so a held button is never lost
        if (this._chargeT > 0.9) { this._charging = false; this.swing({ heavy: true }); }
      } else if (this.active && this.phase === 'recover' && !this._buffered) {
        this._buffered = true;                    // buffered chain input
      }
    } else if (this._charging) {
      const heavy = this._chargeT >= MELEE.heavy.chargeTime;
      this._charging = false;
      if (this.active) this._buffered = true;
      else this.swing({ heavy });
    }

    if (this.active) this._advance(realDt);
    this._poseSpear(realDt);
    this._updateTrail(realDt);

    // --- Silent Strike offer (10 Hz; it gates a prompt, not a hit)
    this._scanT -= realDt;
    if (this._scanT <= 0) {
      this._scanT = 0.1;
      this._scanSneak(canSwing || (playing && !wheelOpen));
    }
  }

  /* ------------------------------- the swing ------------------------------ */

  /** Public: fire a swing now. Returns false when one is already committed. */
  swing({ heavy = false } = {}) {
    if (this.active && this.phase !== 'recover') return false;
    const c = heavy ? MELEE.heavy : MELEE.light;
    const i = heavy ? 0 : Math.min(this.combo, MELEE.light.damage.length - 1);
    this.active = true;
    this.heavy = heavy;
    this._struck = false;
    this._buffered = false;
    this._t = 0;
    this._visT = 2.2;
    this.phase = 'windup';
    this._phaseEnd = heavy ? c.windup : c.windup[i];
    this._i = i;
    this._stats.swings++;
    this.lastSwingT = performance.now() / 1000;
    this.combat?.noteCombatAction?.();
    return true;
  }

  _cancel() {
    this.active = false;
    this.phase = 'idle';
    this._charging = false;
    this._buffered = false;
    this.combo = 0;
  }

  _advance(realDt) {
    const heavy = this.heavy;
    const c = heavy ? MELEE.heavy : MELEE.light;
    const i = this._i;
    this._t += realDt;
    if (this._t < this._phaseEnd) return;

    if (this.phase === 'windup') {
      this.phase = 'strike';
      this._t = 0;
      this._phaseEnd = heavy ? c.strike : c.strike[i];
      this._resolve();
      return;
    }
    if (this.phase === 'strike') {
      this.phase = 'recover';
      this._t = 0;
      this._phaseEnd = heavy ? c.recover : c.recover[i];
      return;
    }
    // recover done
    this.active = false;
    this.phase = 'idle';
    if (!heavy) {
      this.combo = (this.combo + 1) % MELEE.light.damage.length;
      this._comboT = MELEE.light.comboWindow;
    } else {
      this.combo = 0;
    }
    if (this._buffered) {
      this._buffered = false;
      this.swing({ heavy: false });
    }
  }

  /* ------------------------------- the hit -------------------------------- */

  _aimBasis() {
    const ctx = this.ctx;
    const p = ctx.player;
    _chest.copy(p.position);
    _chest.y += 1.28;
    ctx.camera.getWorldDirection(_dir);
    _dir.y *= 0.35;             // melee is a ground game; don't swing at the sky
    if (_dir.lengthSq() < 1e-6) _dir.set(Math.sin(p.heading), 0, Math.cos(p.heading));
    _dir.normalize();
  }

  /**
   * ONE hull ray down the swing line plus a cheap arc test on the roster.
   * The ray gives an exact surface point for sparks and part attribution; the
   * arc is what makes a spear feel like a spear and not a laser pointer.
   */
  _resolve() {
    const ctx = this.ctx;
    const p = ctx.player;
    if (!p) return;
    const heavy = this.heavy;
    const c = heavy ? MELEE.heavy : MELEE.light;
    const i = this._i;
    const reach = c.reach;
    const cosArc = Math.cos((c.arcDeg * 0.5) * Math.PI / 180);
    this._aimBasis();

    // 1. the precise line
    let machine = null;
    let object = null;
    _pt.copy(_chest).addScaledVector(_dir, reach);
    _n.copy(_dir).negate();
    const hulls = ctx.hitHulls;
    if (hulls && hulls.raycast) {
      _ray.origin.copy(_chest);
      _ray.direction.copy(_dir);
      const h = hulls.raycast(_ray, { far: reach + 1.2 });
      if (h && h.hit) {
        machine = h.machine || null;
        object = h.object || null;
        _pt.set(h.x, h.y, h.z);
        _n.set(h.nx, h.ny, h.nz);
      }
    }

    // 2. the arc — nearest machine whose BODY is inside the wedge
    if (!machine) {
      const list = ctx.machines?.list;
      let best = Infinity;
      if (list) {
        for (const m of list) {
          if (!m || m.alive === false || !m.root || m._disposed) continue;
          // gap to the SHELL (see surfaceGap): a spear that measured to the
          // navel could not touch anything bigger than a Strider
          const d = surfaceGap(m, _chest.x, _chest.z);
          if (d > reach || d > best) continue;
          // the wedge test still points at the body, so a swing at the sky
          // does not connect with something standing at her feet
          _v.copy(m.position);
          _v.y += (m.height ?? 2) * 0.45;
          _v2.subVectors(_v, _chest).normalize();
          if (_v2.dot(_dir) < cosArc) continue;
          best = d;
          machine = m;
        }
      }
      /**
       * THE IMPACT GOES ON THE MACHINE, NOT DOWN THE CAMERA RAY.
       *
       * Fix round 1. The arc used to place its impact at `_chest + _dir * d`,
       * where `d` is the gap `surfaceGap` measured along the PLAYER->MACHINE
       * line — a scalar used as a distance on a ray it was not measured on.
       * The two lines coincide only for a dead-on swing, and the hull ray
       * above already catches those: the arc exists precisely for the 15-70
       * deg off-axis swings a 110/140 deg wedge is supposed to land, so the
       * fallback IS the common path, not an edge case. Measured at 3.2 m from
       * a Watcher, a confirmed hit put its sparks, its chips and its damage
       * number 1.7 m (20 deg) to 1.8 m (40 deg) off the machine, out on the
       * grass by Aloy's shoulder — and `melee-hit.point` published the same
       * wrong spot to positional audio and to every other listener.
       *
       * Nor is the standoff CAPSULE the answer: it is a keep-out volume
       * (bodyRadius + standoffHalfLen, 2.46 m on a Watcher) around a mesh
       * whose nose is 1.0 m out, so a point on the capsule still floats 1.4 m
       * in front of the machine. The only thing that knows where the surface
       * is, is the surface. So once the wedge has CHOSEN a target, spend one
       * more hull query — aimed at that machine's body centre rather than
       * down the lens — and take its exact point and normal. The geometric
       * fallback (back off the body centre by its own radius) is only for the
       * frame where the hull is not loaded.
       *
       * `_flashTrail` keeps `_dir`: the SWING still reads along the camera,
       * only the HIT does not.
       */
      if (machine) {
        _v.copy(machine.position);
        _v.y += (machine.height ?? 2) * 0.45;
        _v2.subVectors(_v, _chest);
        const span = _v2.length() || 1;
        _v2.multiplyScalar(1 / span);
        let onHull = false;
        if (hulls && hulls.raycast) {
          _ray.origin.copy(_chest);
          _ray.direction.copy(_v2);
          const hb = hulls.raycast(_ray, { far: span + 1.5 });
          if (hb && hb.hit && hb.machine === machine) {
            object = hb.object || null;
            _pt.set(hb.x, hb.y, hb.z);
            _n.set(hb.nx, hb.ny, hb.nz);
            onHull = true;
          }
        }
        if (!onHull) {
          _pt.copy(_v).addScaledVector(_v2, -(machine.bodyRadius ?? 1) * 0.9);
          _n.copy(_v2).negate();
        }
      }
    }

    this._flashTrail(_chest, _dir, heavy);

    if (!machine || typeof machine.takeDamage !== 'function') {
      // a whiff still makes noise — machine-ai routes it as a stimulus
      this._noise(heavy ? 'impact' : 'noise', p.position, 0.55);
      return;
    }

    // 3. damage. A DOWNED machine takes a Critical Hit instead of a poke.
    const downed = machine.state === 'downed';
    let impact = heavy ? c.damage : c.damage[i];
    let tear = heavy ? c.tear : c.tear[i];
    let crit = false;
    if (downed) {
      impact = Math.max(impact, (machine.maxHealth ?? 100) * MELEE.crit.frac);
      tear = Math.max(tear, 60);
      crit = true;
    }

    // knockback/reaction direction: chest -> the point that was actually hit
    // (identical to `_dir` on the hull-ray path, correct on the arc path)
    _hitDir.subVectors(_pt, _chest);
    if (_hitDir.lengthSq() < 1e-6) _hitDir.copy(_dir); else _hitDir.normalize();
    let res = null;
    try {
      res = machine.takeDamage({
        point: _pt.clone(),
        object,
        dir: _hitDir.clone(),
        impact,
        tear,
        element: 'none',
        elementAmount: 0,
        type: heavy ? 'spear-heavy' : 'spear',
        baseDamage: impact,
        draw: 1,
        // melee is by definition seen — machine-ai keys its escalation on this
        seen: true,
      });
    } catch { res = null; }

    this._stats.hits++;
    if (crit) {
      this._stats.crits++;
      ctx.events.emit('critical-hit', { machine, damage: res?.damage ?? impact });
    }

    // 4. feedback — sparks scaled by what actually landed, hitstop, kick
    const dealt = res?.damage ?? impact;
    this.combat?.impactFeedback?.({
      point: _pt, normal: _n, machine, damage: dealt,
      weak: !!res?.weak, tear: res?.tear ?? 0, tornPart: res?.tornPart ?? null,
      kind: crit ? 'crit' : (heavy ? 'heavy' : 'light'),
      maxHealth: machine.maxHealth ?? 100,
      colors: SPARK_STEEL,
    });

    ctx.events.emit('melee-hit', {
      machine, damage: dealt, heavy, combo: i, crit,
      point: _pt.clone(), killed: !!res?.killed, tornPart: res?.tornPart ?? null,
    });
    this._noise(heavy ? 'impact' : 'noise', _pt, heavy ? 0.85 : 0.6);
  }

  _noise(kind, pos, strength) {
    try {
      this.ctx.machines?.noise?.({
        x: pos.x, z: pos.z, kind, strength, source: null,
      });
    } catch { /* machine-ai not up yet */ }
  }

  /* ---------------------------- SILENT STRIKE ----------------------------- */

  /** Is `m` a legal Silent Strike target from where the player stands? */
  _sneakOk(m) {
    const p = this.ctx.player;
    if (!m || m.alive === false || !m.root || m._disposed) return false;
    if (NO_SNEAK_STATES.has(m.state)) return false;
    if (AWARE_STATES.has(m.state)) return false;
    if ((m.suspicion ?? 0) >= 0.85) return false;
    // gap to the SHELL, not to the navel — the collider makes the second
    // measurement unsatisfiable (see surfaceGap)
    const d = surfaceGap(m, p.position.x, p.position.z);
    if (d > MELEE.silent.range) return false;
    // from BEHIND, or crouched (the two canon ways in)
    _v2.subVectors(p.position, m.position).setY(0).normalize();
    _dir.set(Math.sin(m.heading ?? 0), 0, Math.cos(m.heading ?? 0));
    const behind = _v2.dot(_dir) < MELEE.silent.rearDot;
    return behind || !!p.crouching;
  }

  _scanSneak(enabled) {
    const ctx = this.ctx;
    const p = ctx.player;
    let target = null;
    if (enabled && p && (p.health ?? 1) > 0) {
      const list = ctx.machines?.list;
      let best = Infinity;
      if (list) {
        for (const m of list) {
          if (!this._sneakOk(m)) continue;
          const d = m.position.distanceToSquared(p.position);
          if (d < best) { best = d; target = m; }
        }
      }
    }
    this.silentTarget = target;
    const s = this._sneak;
    if (!this._sneakRegistered && ctx.interactables?.register) {
      ctx.interactables.register(s);
      this._sneakRegistered = true;
    }
    if (target) {
      /**
       * The prompt sits on the machine's SHELL facing her, not at its centre.
       * `Interactables` selects on `|entry.position - player| <= entry.radius`,
       * so an entry pinned to the navel of a machine whose collider holds her
       * 3.35 m away is never in range no matter what `_sneakOk` decided —
       * the offer would be legal and still invisible. Same lesson as
       * `surfaceGap` above, one layer up.
       */
      _v2.subVectors(p.position, target.position).setY(0);
      if (_v2.lengthSq() < 1e-6) _v2.set(0, 0, 1);
      _v2.normalize().multiplyScalar(target.bodyRadius ?? 1);
      s.position.copy(target.position).add(_v2);
      s.position.y = p.position.y + 0.6;
      s.radius = MELEE.silent.range + (target.standoffHalfLen ?? 0) + 1.0;
      s.disabled = false;
      s.machine = target;
    } else {
      s.disabled = true;
      s.machine = null;
    }
  }

  /**
   * Execute the strike. Small classes die outright (canon); anything bigger
   * takes `heavyFrac` of max health and a stagger, which is the HZD behaviour
   * of "you hurt it badly and it now knows exactly where you are".
   */
  silentStrike() {
    const m = this.silentTarget;
    if (!m || !this._sneakOk(m)) return null;
    const cfg = MELEE.silent;
    const instant = cfg.instant.includes(m.kind);
    const dmg = instant
      ? (m.health ?? 1) * 4 + 1000
      : (m.maxHealth ?? 100) * cfg.heavyFrac;

    _pt.copy(m.position);
    _pt.y += (m.height ?? 2) * 0.62;
    _hitDir.subVectors(m.position, this.ctx.player.position).setY(0).normalize();
    _n.copy(_hitDir).negate();

    let res = null;
    try {
      res = m.takeDamage({
        point: _pt.clone(), object: null, dir: _hitDir.clone(),
        impact: dmg, tear: cfg.tear, element: 'none', elementAmount: 0,
        type: 'silent-strike', baseDamage: dmg, draw: 1, seen: true,
      });
    } catch { res = null; }

    this._stats.silent++;
    this._visT = 2.2;
    this.combat?.noteCombatAction?.();
    this.combat?.impactFeedback?.({
      point: _pt, normal: _n, machine: m, damage: res?.damage ?? dmg,
      weak: true, tear: cfg.tear, kind: 'silent',
      maxHealth: m.maxHealth ?? 100, colors: SPARK_STEEL,
    });
    this.silentTarget = null;
    this._sneak.disabled = true;

    const out = { machine: m, killed: !!res?.killed || m.alive === false, damage: res?.damage ?? dmg };
    this.ctx.events.emit('silent-strike', out);
    // a kill from behind is quiet; a wounded machine screams
    this._noise(out.killed ? 'noise' : 'impact', _pt, out.killed ? 0.3 : 0.9);
    return out;
  }

  /* ------------------------------ presentation ---------------------------- */

  /** Where the spear sits: stowed behind the shoulder, or mid-swing. */
  _poseSpear(realDt) {
    const g = this.spear.group;
    const show = this._visT > 0;
    if (g.visible !== show) g.visible = show;
    if (!show) return;

    // cancel the skeleton's scale so the spear stays in metres
    this._hand.updateWorldMatrix(true, false);
    _v.setFromMatrixScale(this._hand.matrixWorld);
    const inv = 1 / Math.max(1e-6, _v.x);
    g.scale.set(inv, inv, inv);

    // grip point: 38 % up the haft, so it balances in her fist
    const grip = -this.spear.length * 0.38;
    let pitch = -0.35;
    let yaw = 0.15;
    let roll = 0;
    let fwd = 0;

    if (this.active) {
      const k = Math.min(1, this._t / Math.max(1e-3, this._phaseEnd));
      if (this.phase === 'windup') {
        const e = k * k;
        pitch = -0.35 - (this.heavy ? 1.5 : 0.9) * e;
        yaw = 0.15 + (this.heavy ? 0.5 : 0.85) * e;
        fwd = -0.12 * e;
      } else if (this.phase === 'strike') {
        const e = Math.pow(k, 0.45);
        pitch = -0.35 - (this.heavy ? 1.5 : 0.9) * (1 - e) + (this.heavy ? 1.35 : 0.5) * e;
        yaw = 0.15 + (this.heavy ? 0.5 : 0.85) * (1 - e) - (this.heavy ? 0.6 : 1.05) * e;
        fwd = -0.12 * (1 - e) + (this.heavy ? 0.34 : 0.26) * e;
        roll = (this.heavy ? 0.2 : -0.35) * e;
      } else {
        const e = 1 - k;
        pitch = -0.35 + (this.heavy ? 1.35 : 0.5) * e;
        yaw = 0.15 - (this.heavy ? 0.6 : 1.05) * e;
        fwd = (this.heavy ? 0.34 : 0.26) * e;
        roll = (this.heavy ? 0.2 : -0.35) * e;
      }
      // the third light hit and every heavy come across the body
      if (!this.heavy && this._i === 2) yaw = -yaw;
    } else {
      // rest carry: angled back over the shoulder, blade up
      pitch = -1.15;
      yaw = 0.42;
      roll = 0.2;
    }

    _e.set(pitch, yaw, roll, 'YXZ');
    _q.setFromEuler(_e);
    g.quaternion.copy(_q);
    _v2.set(0, 0, grip + fwd).applyQuaternion(_q);
    g.position.copy(_v2);
  }

  _flashTrail(origin, dir, heavy) {
    const t = this._trail;
    t.visible = true;
    this._trailT = 0;
    this._trailDur = heavy ? 0.18 : 0.12;
    this._trailScale = heavy ? 1.25 : 0.95;
    _v.copy(origin).addScaledVector(dir, heavy ? 1.5 : 1.25);
    t.position.copy(_v);
    // face the camera-ish plane the swing sweeps through
    _e.set(0, Math.atan2(dir.x, dir.z), heavy ? -0.55 : 0.75, 'YXZ');
    t.quaternion.setFromEuler(_e);
    t.rotateX(Math.PI / 2);
    t.material.opacity = 0.9;
  }

  _updateTrail(realDt) {
    if (!this._trail.visible) return;
    this._trailT += realDt;
    const k = this._trailT / (this._trailDur || 0.12);
    if (k >= 1) { this._trail.visible = false; return; }
    const s = this._trailScale * (0.7 + 0.55 * k);
    this._trail.scale.set(s, s, s);
    this._trail.material.opacity = 0.9 * (1 - k) * (1 - k);
  }
}
