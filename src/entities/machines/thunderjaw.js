import * as THREE from 'three';
import { Machine, glowTexture } from './machine.js';

/**
 * Thunderjaw: apex boss. Stomp shockwave, tail sweep, telegraphed mouth
 * laser sweep, arcing disc-launcher projectiles. Weak points: head sensor,
 * chest core, tail tip.
 */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);
const _beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
const _discGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 14); // flat sawblade disc

export class Thunderjaw extends Machine {
  constructor(ctx, manager, opts) {
    super(ctx, manager, {
      kind: 'thunderjaw',
      displayName: 'Thunderjaw',
      rigged: false,
      yawFix: -Math.PI / 2, // model faces +X in asset space
      maxHealth: 1200,
      armor: 0.3,
      walkSpeed: 3.4,
      runSpeed: 6.5,
      turnRate: 1.15,
      sightRange: 62,
      sightHalf: THREE.MathUtils.degToRad(60),
      hearRange: 42,
      stealthRange: 10,
      eyeHeight: 5.2,
      attackRange: 55,
      bodyRadius: 4,
      ...opts,
    });

    const h = this.height;       // 7.5
    const len = this.size.x;     // ~15 along asset x -> body +Z
    // head sensor eyes
    this.addEye(this.body, 0.5, h * 0.46, len * 0.45, 0.6, 0.11);
    this.addEye(this.body, -0.5, h * 0.46, len * 0.45, 0.6, 0.11);
    // anchors
    this._mouth = new THREE.Object3D();
    this._mouth.position.set(0, h * 0.44, len * 0.46);
    this.body.add(this._mouth);
    this._launcher = new THREE.Object3D();
    this._launcher.position.set(0, h * 0.78, -len * 0.05);
    this.body.add(this._launcher);

    // weak points — kept small and OFF the center-mass aim line so lazy
    // torso shots don't score weak hits (head high, core low on the belly)
    // anchor must sit ON the snout mesh (h*0.55 floats ~2.7m off it) or aimed
    // head shots can never resolve inside the weak radius
    this.addWeakPoint('head sensor', this.body, 0, h * 0.44, len * 0.46, 0.95);
    this.addWeakPoint('chest core', this.body, 0, h * 0.25, len * 0.24, 0.85);
    this.addWeakPoint('tail tip', this.body, 0, h * 0.62, -len * 0.45, 0.8);

    this._gait = Math.random() * Math.PI * 2;
    this._lastStep = 0;
    this._cdStomp = 2;
    this._cdLaser = 4;
    this._cdDisc = 7;
    this._cdTail = 3;
  }

  _playerBehind() {
    const p = this.ctx.player;
    if (!p) return false;
    _v.subVectors(p.position, this.position);
    const d = Math.hypot(_v.x, _v.z);
    if (d < 0.1) return false;
    const dot = (_v.x * Math.sin(this.heading) + _v.z * Math.cos(this.heading)) / d;
    return dot < -0.25;
  }

  chooseAttack(dist) {
    if (this._playerBehind() && dist < 15 && this._cdTail <= 0) {
      this._cdTail = 6;
      return this._tailSweep();
    }
    if (dist < 11 && this._cdStomp <= 0) {
      this._cdStomp = 6;
      return this._stomp();
    }
    if (dist > 13 && dist < 65 && this._cdLaser <= 0) {
      this._cdLaser = 9.5;
      return this._laser(dist);
    }
    if (dist > 16 && dist < 90 && this._cdDisc <= 0) {
      this._cdDisc = 8.5;
      return this._discs();
    }
    return null;
  }

  /* --------------------------- stomp --------------------------- */

  _stomp() {
    return {
      kind: 'stomp',
      windup: 0.85, strike: 0.25, recover: 1.2, cooldown: 1.2,
      onStrike: () => {
        this.spawnShockRing(this.position.x, this.position.z, 12, 0.8, 25, 8);
      },
      onUpdate: (a) => {
        if (a.phase === 'windup') {
          this.body.rotation.x = -0.3 * a.phaseT;
          this.body.position.y = a.phaseT * 1.2;
        } else if (a.phase === 'strike') {
          this.body.rotation.x = -0.3 + a.phaseT * 0.38;
          this.body.position.y = (1 - a.phaseT) * 1.2;
        } else {
          this.body.rotation.x = 0.08 * (1 - a.phaseT);
          this.body.position.y = 0;
        }
      },
      cleanup: () => { this.body.rotation.x = 0; this.body.position.y = 0; },
    };
  }

  /* --------------------------- tail sweep --------------------------- */

  _tailSweep() {
    return {
      kind: 'tail',
      windup: 0.55, strike: 0.5, recover: 0.9, cooldown: 1.4,
      track: false,
      onStrike: () => {
        this.damagePlayer(20, 15); // full-circle rear hit, checked once
        this.knockbackPlayer(10);
      },
      onUpdate: (a) => {
        // whole body wheels around — tail lashes through the rear arc
        if (a.phase === 'windup') this.body.rotation.y = 0.45 * a.phaseT;
        else if (a.phase === 'strike') this.body.rotation.y = 0.45 - 1.9 * a.phaseT;
        else this.body.rotation.y = -1.45 * (1 - a.phaseT);
      },
      cleanup: () => { this.body.rotation.y = 0; },
    };
  }

  /* --------------------------- mouth laser --------------------------- */

  _laser(dist) {
    const range = THREE.MathUtils.clamp(dist, 14, 58);
    // telegraph glow at the mouth
    const glowMat = new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xff2413, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const glow = new THREE.Sprite(glowMat);
    this._mouth.add(glow);

    // beam = white-hot core + soft outer glow; the core doubles as the thin
    // red aim ray that pre-traces the sweep line during windup
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xff2413, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const core = new THREE.Mesh(_beamGeo, coreMat);
    core.visible = false;
    this.ctx.scene.add(core);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xff3a20, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      side: THREE.DoubleSide,
    });
    const outer = new THREE.Mesh(_beamGeo, outerMat);
    outer.visible = false;
    this.ctx.scene.add(outer);

    let baseAngle = 0;
    let tick = 0;
    let sparkClock = 0;
    let hx = 0, hy = 0, hz = 0; // beam ground-hit point

    // place core (and optionally outer) from the mouth to the ground at ang
    const aimBeam = (ang, coreR, outerR) => {
      hx = this.position.x + Math.sin(ang) * range;
      hz = this.position.z + Math.cos(ang) * range;
      hy = this.ctx.terrain.getHeight(hx, hz) + 0.15;
      this._mouth.getWorldPosition(_v);
      _v2.set(hx, hy, hz);
      core.position.lerpVectors(_v, _v2, 0.5);
      const dir = _v2.sub(_v); // _v2 now = delta
      const L = dir.length();
      core.quaternion.setFromUnitVectors(_Y, dir.normalize());
      core.scale.set(coreR, L, coreR);
      if (outerR > 0) {
        outer.position.copy(core.position);
        outer.quaternion.copy(core.quaternion);
        outer.scale.set(outerR, L, outerR);
      }
    };

    return {
      kind: 'laser',
      windup: 1.0, strike: 1.7, recover: 0.8, cooldown: 2,
      onStrike: () => {
        const p = this.ctx.player;
        baseAngle = p
          ? Math.atan2(p.position.x - this.position.x, p.position.z - this.position.z)
          : this.heading;
      },
      onUpdate: (a, dt) => {
        if (a.phase === 'windup') {
          glow.scale.setScalar(0.4 + a.phaseT * 2.2);
          glowMat.opacity = a.phaseT * 0.9;
          // thin low-opacity aim ray traces the coming sweep, left to right
          const p = this.ctx.player;
          const predict = p
            ? Math.atan2(p.position.x - this.position.x, p.position.z - this.position.z)
            : this.heading;
          aimBeam(predict + (-0.42 + a.phaseT * 0.84), 0.035, 0);
          core.visible = true;
          coreMat.color.setHex(0xff2413);
          coreMat.opacity = 0.16 + a.phaseT * 0.14;
        } else if (a.phase === 'strike') {
          glow.scale.setScalar(2.2);
          glowMat.opacity = 0.9;
          core.visible = true;
          outer.visible = true;
          coreMat.color.setHex(0xfff6ec); // white-hot ~0.1m core
          coreMat.opacity = 0.95;
          outerMat.opacity = 0.3;
          // sweep across the player's position, left to right
          aimBeam(baseAngle + (-0.42 + a.phaseT * 0.84), 0.055, 0.32);
          // sparks spray off the ground-hit point
          sparkClock -= dt;
          if (sparkClock <= 0 && !this.lowLOD) {
            sparkClock = 0.17;
            _v.set(hx, hy + 0.25, hz);
            this._sparkBurst(_v, 10);
          }
          // periodic burn ticks while the beam is on the player
          tick -= dt;
          if (tick <= 0) {
            tick = 0.15;
            const p = this.ctx.player;
            if (p && Math.hypot(p.position.x - hx, p.position.z - hz) < 2.6) {
              this.ctx.events.emit('player-damage', { amount: 6, from: this });
            }
          }
        } else {
          coreMat.opacity *= Math.max(0, 1 - a.phaseT * 3);
          outerMat.opacity *= Math.max(0, 1 - a.phaseT * 3);
          glowMat.opacity *= Math.max(0, 1 - a.phaseT * 3);
          if (a.phaseT > 0.4) { core.visible = false; outer.visible = false; }
        }
      },
      cleanup: () => {
        this._mouth.remove(glow);
        this.ctx.scene.remove(core);
        this.ctx.scene.remove(outer);
        glowMat.dispose(); coreMat.dispose(); outerMat.dispose();
      },
    };
  }

  /* --------------------------- disc launcher --------------------------- */

  _fireDisc(lateral = 0) {
    const p = this.ctx.player;
    this._launcher.getWorldPosition(_v);
    const start = _v.clone();
    const target = p
      ? new THREE.Vector3(
        p.position.x + p.velocity.x * 0.9,
        p.position.y,
        p.position.z + p.velocity.z * 0.9,
      )
      : new THREE.Vector3(
        this.position.x + Math.sin(this.heading) * 30, this.position.y,
        this.position.z + Math.cos(this.heading) * 30,
      );
    // fan the volley: offset each disc perpendicular to the throw line
    if (lateral !== 0) {
      _v2.set(target.x - start.x, 0, target.z - start.z).normalize();
      target.x += -_v2.z * lateral;
      target.z += _v2.x * lateral;
    }
    const T = THREE.MathUtils.clamp(start.distanceTo(target) / 14, 1.3, 2.6);
    const g = -9.8;
    const vel = new THREE.Vector3(
      (target.x - start.x) / T,
      (target.y - start.y) / T - 0.5 * g * T,
      (target.z - start.z) / T,
    );

    const mat = new THREE.MeshBasicMaterial({ color: 0xff3820, toneMapped: false });
    const disc = new THREE.Mesh(_discGeo, mat);
    disc.position.copy(start);
    const glowMat = new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xff4028, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(0.9);
    disc.add(glow);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0xff5a20, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const trail = new THREE.Mesh(_beamGeo, trailMat);
    this.ctx.scene.add(disc);
    this.ctx.scene.add(trail);

    let t = 0;
    let smokeClock = 0;
    let spin = 0;
    const terrain = this.ctx.terrain;
    this._fx.push({
      update: (dt) => {
        t += dt;
        vel.y += g * dt;
        disc.position.x += vel.x * dt;
        disc.position.y += vel.y * dt;
        disc.position.z += vel.z * dt;
        // sawblade orientation: disc plane contains the velocity, spinning
        _v2.copy(vel).normalize();
        _v3.crossVectors(_v2, _Y);
        if (_v3.lengthSq() < 1e-4) _v3.set(1, 0, 0);
        _v3.normalize();
        disc.quaternion.setFromUnitVectors(_Y, _v3);
        spin += dt * 22;
        disc.rotateOnAxis(_Y, spin); // quaternion is rebuilt above, so spin is absolute
        // smoke trail puffs
        smokeClock -= dt;
        if (smokeClock <= 0 && !this.lowLOD) {
          smokeClock = 0.09;
          this._burnSmoke(disc.position);
        }
        // trail stretches back along velocity
        const L = Math.min(2.2, vel.length() * 0.16);
        trail.position.copy(disc.position).addScaledVector(_v2.copy(vel).normalize(), -L / 2);
        trail.quaternion.setFromUnitVectors(_Y, _v2);
        trail.scale.set(0.07, L, 0.07);
        const groundY = terrain.getHeight(disc.position.x, disc.position.z);
        const p = this.ctx.player;
        const nearPlayer = p && disc.position.distanceToSquared(p.position) < 1.6;
        if (disc.position.y <= groundY + 0.25 || nearPlayer || t > 4) {
          // detonate
          const px = disc.position.x, pz = disc.position.z;
          this.spawnShockRing(px, pz, 3.2, 0.4, 0, 0);
          if (p && Math.hypot(p.position.x - px, p.position.z - pz) < 2.6) {
            this.ctx.events.emit('player-damage', { amount: 15, from: this });
          }
          _v.set(px, groundY + 0.6, pz);
          this._sparkBurst(_v, 18);
          this.ctx.scene.remove(disc);
          this.ctx.scene.remove(trail);
          mat.dispose(); glowMat.dispose(); trailMat.dispose();
          return false;
        }
        return true;
      },
    });
  }

  _discs() {
    let fired = 0;
    return {
      kind: 'disc',
      windup: 0.6, strike: 1.1, recover: 0.7, cooldown: 1.8,
      onUpdate: (a) => {
        if (a.phase === 'windup') {
          this.body.rotation.x = -0.08 * a.phaseT;
        } else if (a.phase === 'strike') {
          this.body.rotation.x = -0.08;
          const due = Math.floor(a.phaseT * 3) + 1; // 3 discs across the phase
          while (fired < due && fired < 3) {
            fired += 1;
            // fan: left / center / right ('machine-attack' already emitted
            // once by _startAttack — do NOT re-emit per disc)
            this._fireDisc((fired - 2) * 2.4 + (Math.random() - 0.5) * 0.8);
          }
        } else {
          this.body.rotation.x = -0.08 * (1 - a.phaseT);
        }
      },
      cleanup: () => { this.body.rotation.x = 0; },
    };
  }

  /* --------------------------- locomotion --------------------------- */

  /** Ticked from Machine.update() — runs even under lowLOD/stun. */
  tickCooldowns(dt) {
    this._cdStomp -= dt;
    this._cdLaser -= dt;
    this._cdDisc -= dt;
    this._cdTail -= dt;
  }

  animate(dt, t) {
    if (this.state === 'dead') return;

    const speed = this._speed;
    const stride = 4.6;
    this._gait += dt * speed * (Math.PI / stride);
    const moveK = THREE.MathUtils.clamp(speed / 2.6, 0, 1);

    // heavy footstep events for audio/rumble — combat only, so calm patrol
    // half a map away doesn't flood the mixer with stomps
    const step = Math.floor(this._gait / Math.PI);
    if (step !== this._lastStep) {
      this._lastStep = step;
      const engaged = this.state === 'attack' || this.state === 'alert';
      if (engaged && moveK > 0.3 && this.playerDist < 140) {
        this.ctx.events.emit('machine-attack', { machine: this, kind: 'step' });
      }
    }

    if (!this._attack) {
      this.body.position.y = Math.abs(Math.sin(this._gait)) * 0.22 * moveK
        + Math.sin(t * 0.7) * 0.035;
      this.body.rotation.x = -(speed - this._accelPitch) * 0.012;
      this.body.rotation.z = Math.sin(this._gait) * 0.028 * moveK;
      this.body.rotation.y = 0;
    }
  }
}
