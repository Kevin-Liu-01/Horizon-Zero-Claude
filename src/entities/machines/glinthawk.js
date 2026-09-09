import * as THREE from 'three';
import { Machine, rollLoot, glowTexture } from './machine.js';
import { canisterMesh, pulseGlow } from './parts.js';

/**
 * Glinthawk: T2 flying acquisition machine (roster-v2 §4). The flock soars
 * lazy circles above the riverbed pools; on alarm they orbit the player and
 * take SEQUENTIAL dives — a metallic screech telegraph, then a claw swoop —
 * with freeze-spit lobs from the hover for whoever doesn't hold the dive
 * token. Weak to fire: one Burn forces a grounding (crit window, downed weak
 * point online). Death is a real fall out of the sky.
 *
 * Model: RobotEnemyFlying.glb (Quaternius, CC0) — the first NATIVE
 * AnimationMixer machine in the codebase: clip layers (Idle flap, Attack,
 * Shoot, Dead) blended with procedural hover bob, bank and pitch on the
 * body group. The red mono-eye material was sensor-tagged by the style pass.
 */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Glinthawk extends Machine {
  constructor(ctx, manager, opts) {
    super(ctx, manager, {
      kind: 'glinthawk',
      displayName: 'Glinthawk',
      rigged: true, // native skeleton -> SkeletonUtils clone
      yawFix: 0,
      maxHealth: 140,
      armor: 0,
      level: 8,
      elemWeak: 'fire', // canon: one burn drops it
      walkSpeed: 5,     // cruise
      runSpeed: 10,     // pursuit
      turnRate: 1.7,
      sightRange: 60,
      sightHalf: THREE.MathUtils.degToRad(85), // wide aerial scan
      hearRange: 30,
      eyeHeight: 0.6,
      attackRange: 30,
      bodyRadius: 1.0,
      alignToTerrain: false,
      ...opts,
    });

    this.flock = opts.flock ?? { diver: null };
    this.pool = opts.pool ?? { x: this.position.x, z: this.position.z };
    this._phase = opts.phase ?? Math.random() * 6;
    this._airborne = true;    // Machine._conform leaves y to the flight model
    this._alt = 14;
    this._downT = 0;          // burn-forced grounding timer
    this._cdSpit = 3;
    this._cdDive = 2 + Math.random() * 3;
    this._fallV = 0;
    this._crashed = false;
    this._bank = 0;
    this._pitch = 0;
    this._lastHead = this.heading;

    // seed altitude so the flock doesn't clip terrain on frame one
    this.position.y = ctx.terrain.getHeight(this.position.x, this.position.z) + this._alt;

    // --- AnimationMixer over the cloned skeleton (clips bind by node name)
    const src = ctx.assets.models.glinthawk;
    this.mixer = new THREE.AnimationMixer(this.model);
    this._act = {};
    for (const clip of src.animations ?? []) {
      const short = clip.name.split('|').pop();
      const action = this.mixer.clipAction(clip);
      if (short === 'Idle') {
        action.play(); // wing-flap base layer
      } else if (short === 'Attack' || short === 'Shoot' || short === 'Dead') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this._act[short] = action;
    }

    // sensor: the red mono-eye material is already state-wired (style pass);
    // add the soft halo + weak point on the eye
    this.addEye(this.body, 0, 0.62, 0.6, 0.42, 0, 0.5);
    this.addWeakPoint('eye', this.body, 0, 0.62, 0.62, 0.3, 3);
    // downed crit window (burn grounding): big body weak point, off in flight
    this._wpDowned = this.addWeakPoint('exposed core', this.body, 0, 0.55, 0, 1.1, 2);
    this._wpDowned.enabled = false;

    // --- freeze sac (chest, pale-blue glow): freeze-element hits detonate
    // it; torn = freeze spit disabled (roster). Fragile on purpose.
    this.addPart({
      name: 'freeze-sac', displayName: 'Freeze Sac',
      mesh: canisterMesh({ color: 0x9fe8ff, r: 0.1, h: 0.26 }),
      pos: [0, 0.42, 0.5], snap: true, snapTarget: [0, 0.55, 0],
      tearHp: 14, elemental: 'freeze', settleY: 0.16,
      weak: true, weakMult: 2,
      linkedAttack: 'freeze-spit',
      loot: [{ id: 'chillwater', n: 2 }],
      update: (dt, t, p) => pulseGlow(p.mesh.children[0], t, 3.2),
    });

    this.lootTable = rollLoot([
      { id: 'metal-shards', min: 10, max: 16 },
      { id: 'chillwater', min: 1, max: 2 },
      { id: 'wire', min: 1, max: 2 },
      { id: 'echo-shell', n: 1, chance: 0.35 },
    ]);
  }

  tickCooldowns(dt) {
    this._cdSpit -= dt;
    this._cdDive -= dt;
  }

  /* ---------------------- flight steering ---------------------- */

  /** Fly toward a circle waypoint around `cx,cz` (lead angle keeps it moving). */
  _orbit(cx, cz, radius, speed, dt, lead = 0.4) {
    const ang = Math.atan2(this.position.x - cx, this.position.z - cz) + lead;
    this._moveToward(
      cx + Math.sin(ang) * radius,
      cz + Math.cos(ang) * radius,
      speed, dt,
    );
  }

  /** Damp altitude toward ground+want (flight model owns position.y). */
  _fly(want, dt, rate = 1.6) {
    const g = this.ctx.terrain.getHeight(this.position.x, this.position.z);
    this.position.y = THREE.MathUtils.damp(this.position.y, g + want, rate, dt);
  }

  _statePatrol(dt) {
    if (this.suspicion > 0.28) { this.setState('suspicious'); return; }
    this._soar = (this._soar ?? 0) + dt;
    this._orbit(this.pool.x, this.pool.z, 20, this.walkSpeed, dt);
    this._fly(13 + Math.sin(this._soar * 0.25 + this._phase) * 3, dt);
  }

  _stateSuspicious(dt) {
    // circle tighter over the stimulus, drop a little to look
    this._orbit(this.lastKnown.x, this.lastKnown.z, 14, this.walkSpeed, dt);
    this._fly(10, dt);
    if (this.suspicion >= 1) { this.setState('alert'); return; }
    if (this.suspicion < 0.06) this.setState('return');
  }

  _stateAlert(dt) {
    const p = this.ctx.player;
    if (p) this._face(p.position.x, p.position.z, dt);
    this._fly(11, dt);
    if (this._stateT > 0.6) this.setState('attack');
  }

  _stateAttack(dt) {
    if (this._attack) { this._updateAttack(dt); return; }
    this._attackCd -= dt;
    const p = this.ctx.player;
    if (!p) { this.setState('return'); return; }
    if (this._unseenT > 6) { this.setState('search'); return; }
    if (this._downT > 0) {
      // burn-grounded: flop toward the player at hop speed, crit window open
      this._moveToward(p.position.x, p.position.z, 1.4, dt);
      return;
    }
    this._orbit(p.position.x, p.position.z, 17, this.runSpeed * 0.8, dt);
    this._fly(11 + Math.sin(this._stateT * 0.7) * 2, dt);
    if (this._attackCd <= 0) {
      const a = this.chooseAttack(this.playerDist);
      if (a) this._startAttack(a);
    }
  }

  _stateSearch(dt) {
    this._orbit(this.lastKnown.x, this.lastKnown.z, 16, this.walkSpeed, dt);
    this._fly(13, dt);
    if (this.suspicion >= 1) { this.setState('alert'); return; }
    if (this._stateT > 8) this.setState('return');
  }

  _stateReturn(dt) {
    if (this.suspicion >= 1) { this.setState('alert'); return; }
    const dx = this.pool.x - this.position.x, dz = this.pool.z - this.position.z;
    if (Math.hypot(dx, dz) > 24) {
      this._moveToward(this.pool.x, this.pool.z, this.walkSpeed, dt);
    } else {
      this.suspicion = 0;
      this.setState('patrol');
    }
    this._fly(13, dt);
  }

  /* ---------------------- attacks ---------------------- */

  chooseAttack(dist) {
    if (this._downT > 0) return null; // grounded: no attacks, pure crit window
    // sequential dives: one flock token
    if (this.flock.diver === null && this._cdDive <= 0 && dist < 34) {
      this.flock.diver = this;
      this._cdDive = 5 + Math.random() * 3;
      return this._dive();
    }
    if (dist > 9 && dist < 30 && this._cdSpit <= 0 && !this.attackDisabled('freeze-spit')) {
      this._cdSpit = 6.5;
      return this._freezeSpit();
    }
    return null;
  }

  /** Screech telegraph, then a committed claw swoop through the player. */
  _dive() {
    const start = new THREE.Vector3();
    const target = new THREE.Vector3();
    return {
      kind: 'dive',
      windup: 0.95, strike: 1.05, recover: 1.3, cooldown: 2.5,
      onWindup: () => {
        // metallic screech: flare + one-shot Attack clip + audio event
        this._eyeFlare = 3;
        this._oneShot('Attack', 0.4);
        this.ctx.events.emit('machine-attack', { machine: this, kind: 'screech' });
      },
      onStrike: () => {
        const p = this.ctx.player;
        start.copy(this.position);
        if (p) {
          target.set(
            p.position.x + p.velocity.x * 0.5,
            p.position.y + 1.0,
            p.position.z + p.velocity.z * 0.5,
          );
        } else {
          target.set(
            this.position.x + Math.sin(this.heading) * 18,
            this.position.y - 10,
            this.position.z + Math.cos(this.heading) * 18,
          );
        }
        this.heading = Math.atan2(target.x - start.x, target.z - start.z);
      },
      onUpdate: (a, dt) => {
        if (a.phase === 'windup') {
          // stall up before the plunge
          this.position.y += dt * 2.4;
          this._pitch = THREE.MathUtils.damp(this._pitch, -0.35, 8, dt);
        } else if (a.phase === 'strike') {
          const u = a.phaseT;
          // swoop: through the target point at u≈0.72, then pull up
          const swoop = Math.sin(Math.PI * Math.min(1, u / 0.72) * 0.5); // 0->1
          _v.lerpVectors(start, target, u);
          const over = Math.max(0, (u - 0.72) / 0.28);
          this.position.x = _v.x;
          this.position.z = _v.z;
          this.position.y = THREE.MathUtils.lerp(start.y, target.y, swoop)
            + over * over * 6; // climb out
          this._pitch = 0.55 - over * 1.0;
          if (u > 0.55 && u < 0.9 && !a.hit) {
            const p = this.ctx.player;
            if (p && this.playerDist < 2.7
              && Math.abs(this.position.y - p.position.y - 1) < 2) {
              a.hit = true;
              this.damagePlayer(20, 3.2);
              this.knockbackPlayer(8);
            }
          }
          // wind shear FX
          if (Math.random() < dt * 8 && !this.lowLOD) {
            this._dustPuff(this.position.x, this.position.y - 0.6, this.position.z, 0.4);
          }
        } else {
          this.position.y += dt * 5.5; // climb back to the orbit band
          this._pitch = THREE.MathUtils.damp(this._pitch, -0.2, 5, dt);
        }
      },
      cleanup: () => {
        this.flock.diver = null;
        this._pitch = 0;
      },
    };
  }

  /** 4-lob freeze spit from the hover (disabled once the sac is gone). */
  _freezeSpit() {
    let fired = 0;
    return {
      kind: 'freeze-spit',
      windup: 0.6, strike: 0.45, recover: 0.8, cooldown: 2,
      onWindup: () => {
        this._oneShot('Shoot', 0.3);
        this._eyeFlare = 1.6;
      },
      onUpdate: (a) => {
        if (a.phase !== 'strike') return;
        const due = Math.min(4, Math.floor(a.phaseT * 4) + 1);
        while (fired < due) {
          fired += 1;
          this._lobFreeze(fired);
        }
      },
    };
  }

  _lobFreeze(i) {
    const p = this.ctx.player;
    _v.copy(this.position);
    _v.y -= 0.3;
    const start = _v.clone();
    const tgt = p
      ? new THREE.Vector3(
        p.position.x + p.velocity.x * (0.4 + i * 0.15) + (Math.random() - 0.5) * 2.2,
        p.position.y,
        p.position.z + p.velocity.z * (0.4 + i * 0.15) + (Math.random() - 0.5) * 2.2,
      )
      : start.clone().add(new THREE.Vector3(0, -8, 6));
    const T = 0.9;
    const g = -22;
    const vel = new THREE.Vector3(
      (tgt.x - start.x) / T,
      (tgt.y - start.y) / T - 0.5 * g * T,
      (tgt.z - start.z) / T,
    );
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xaef2ff, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(0.4);
    s.position.copy(start);
    this.ctx.scene.add(s);
    let t = 0;
    const terrain = this.ctx.terrain;
    this._fx.push({
      update: (dt) => {
        t += dt;
        vel.y += g * dt;
        s.position.addScaledVector(vel, dt);
        const gy = terrain.getHeight(s.position.x, s.position.z);
        const p2 = this.ctx.player;
        const near = p2 && s.position.distanceToSquared(p2.position) < 1.8;
        if (near || s.position.y <= gy + 0.1 || t > 2.4) {
          // ice burst: chill patch + shatter glints
          _v2.set(s.position.x, Math.max(s.position.y, gy) + 0.3, s.position.z);
          this._sparkBurst(_v2, 8, 0xbfefff);
          if (p2 && Math.hypot(p2.position.x - s.position.x, p2.position.z - s.position.z) < 1.9) {
            this.ctx.events.emit('player-damage', { amount: 7, from: this });
          }
          this.ctx.scene.remove(s);
          mat.dispose();
          return false;
        }
        return true;
      },
    });
  }

  /** Fade a one-shot clip in over the base flap layer. */
  _oneShot(name, fade = 0.25) {
    const a = this._act[name];
    if (!a) return;
    a.reset();
    a.setEffectiveWeight(1);
    a.fadeIn(fade);
    a.play();
    const idle = this._act.Idle;
    if (idle) {
      idle.crossFadeTo?.(a, fade, false);
      // restore the flap after the one-shot ends
      setTimeout(() => {
        if (this.alive && this._act.Idle) {
          a.fadeOut(0.3);
          idle.reset();
          idle.fadeIn(0.3);
          idle.play();
        }
      }, (a.getClip().duration / (a.timeScale || 1)) * 1000);
    }
  }

  /* ---------------------- burn = drop (crit) ---------------------- */

  animate(dt, t) {
    if (this.state === 'dead') return;
    this.mixer.update(dt);

    // canon fire weakness: burning wings can't hold altitude
    if (this.burnT > 0 && this._downT <= 0 && this.alive) {
      this._downT = 7;
      this._cancelAttack();
      if (this.flock.diver === this) this.flock.diver = null;
      this._wpDowned.enabled = true;
      this.stunT = Math.max(this.stunT, 1.2); // crash shock
    }
    if (this._downT > 0) {
      this._downT -= dt;
      // drop hard to the ground; flop there (Walk clip would fight Idle —
      // keep the flap but slow, reads as struggling wings)
      const g = this.ctx.terrain.getHeight(this.position.x, this.position.z);
      this.position.y = Math.max(g + 0.35,
        this.position.y - dt * 11);
      if (this._act.Idle) this._act.Idle.timeScale = 0.5;
      if (this._downT <= 0 || (this.burnT <= 0 && this._downT < 4)) {
        this._downT = 0;
        this._wpDowned.enabled = false;
        if (this._act.Idle) this._act.Idle.timeScale = 1.2;
      }
    }

    // procedural soar: bank into the turn, pitch with climb, hover bob
    let dh = this.heading - this._lastHead;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this._lastHead = this.heading;
    const turnRate = dt > 0 ? dh / dt : 0;
    this._bank = THREE.MathUtils.damp(this._bank, THREE.MathUtils.clamp(-turnRate * 0.55, -0.55, 0.55), 4, dt);
    this.body.rotation.z = this._bank;
    this.body.rotation.x = this._pitch;
    if (!this._attack) {
      this._pitch = THREE.MathUtils.damp(this._pitch, 0, 3, dt);
      this.body.position.y = Math.sin(t * 2.1 + this._phase) * 0.14;
    }
    // flap harder when chasing
    if (this._act.Idle && this._downT <= 0) {
      this._act.Idle.timeScale = 1.05 + this._speed * 0.055;
    }
  }

  /* ---------------------- death: fall out of the sky ---------------------- */

  onStateChange(name) {
    if (name === 'dead') {
      const dead = this._act.Dead;
      if (dead) {
        this._act.Idle?.fadeOut(0.2);
        this._act.Attack?.fadeOut(0.1);
        this._act.Shoot?.fadeOut(0.1);
        dead.reset();
        dead.fadeIn(0.15);
        dead.play();
      }
      this._fallV = 2;
      this._crashed = this.position.y
        <= this.ctx.terrain.getHeight(this.position.x, this.position.z) + 0.6;
    }
  }

  /** Bespoke death: tumble, crash, settle — then the loot beacon. */
  _updateDeath(dt) {
    this._deathT += dt;
    this.mixer.update(dt);
    const g = this.ctx.terrain.getHeight(this.position.x, this.position.z);
    if (!this._crashed) {
      this._fallV += 24 * dt;
      this.position.y -= this._fallV * dt;
      this.body.rotation.z += dt * 3.2 * this._deathSide;
      this.body.rotation.x += dt * 1.1;
      if (Math.random() < dt * 14) {
        _v.copy(this.position);
        _v.y += 0.2;
        this._burnSmoke(_v);
      }
      if (this.position.y <= g + 0.3) {
        this.position.y = g + 0.3;
        this._crashed = true;
        this._crashT = this._deathT;
        _v.copy(this.position);
        this._sparkBurst(_v, 30);
        this._smokeBurst(_v, 6);
        this._dustPuff(this.position.x, g + 0.3, this.position.z, 1.4);
        this.spawnShockRing(this.position.x, this.position.z, 3, 0.35, 0, 0);
      }
    } else {
      // settle into the wreck roll
      this.position.y = THREE.MathUtils.damp(this.position.y, g + 0.22, 6, dt);
      this.body.rotation.z = THREE.MathUtils.damp(
        this.body.rotation.z, 1.15 * this._deathSide, 4, dt);
      this.body.rotation.x = THREE.MathUtils.damp(this.body.rotation.x, 0.2, 4, dt);
      if (!this._beaconSpawned && this._deathT > (this._crashT ?? 0) + 0.9) {
        this._beaconSpawned = true;
        this._spawnBeacon();
      }
    }
  }

  /** Flyer: no walking feet to report (gate A6 skips non-walkers). */
  debugFeet() {
    return [];
  }
}
