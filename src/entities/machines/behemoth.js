import * as THREE from 'three';
import { Machine, rollLoot, glowTexture } from './machine.js';
import { forceLoaderMesh, canisterMesh, cargoMesh, pulseGlow, rockMesh } from './parts.js';

/**
 * Behemoth: territorial transport-class heavyweight (static sculpt; HZD
 * level 25). Only aggros inside its home territory. Charge with knockback,
 * ground-slam shockwave, and the signature GRAVITY BOULDER THROW — levitates
 * a rock with its purple-glowing Force Loaders and hurls it. Components per
 * research doc 3.7: neck Force Loaders x2 (torn = gravity attacks disabled),
 * belly Cargo Hold (torn = loot crate drops), haunch Freeze Canisters x2.
 */

const _bv = new THREE.Vector3();
const _bY = new THREE.Vector3(0, 1, 0);

export class Behemoth extends Machine {
  constructor(ctx, manager, opts) {
    const spawn = opts.spawn;
    super(ctx, manager, {
      kind: 'behemoth',
      displayName: 'Behemoth',
      rigged: false,
      yawFix: Math.PI, // model faces -Z in asset space
      maxHealth: 800, // spec v2 retune
      armor: 0.35,
      level: 25,
      elemResist: 'shock', // research 3.1
      walkSpeed: 1.7,
      runSpeed: 6.2,
      turnRate: 1.6,
      sightRange: 45,
      sightHalf: THREE.MathUtils.degToRad(55),
      hearRange: 32,
      eyeHeight: 3.4,
      attackRange: 26,
      bodyRadius: 2.3,
      territory: { x: spawn.x, z: spawn.z, r: 70 },
      ...opts,
    });

    const h = this.height;        // 4.5
    const len = this.size.z;      // length along asset z
    const w = this.size.x;
    // eyes: low head at the front
    this.addEye(this.body, 0.42, h * 0.54, len * 0.37, 0.4, 0.08);
    this.addEye(this.body, -0.42, h * 0.54, len * 0.37, 0.4, 0.08);
    // weak points: side cargo sacks
    this.addWeakPoint('sack-l', this.body, w * 0.38, h * 0.52, -len * 0.12, 0.95);
    this.addWeakPoint('sack-r', this.body, -w * 0.38, h * 0.52, -len * 0.12, 0.95);

    // --- components (research 3.7)
    // 1. Force Loaders x2 (neck sides): glowing purple-blue anti-gravity
    //    discs. Torn -> gravity/rock attacks disabled (the Behemoth payoff).
    for (const side of [1, -1]) {
      this.addPart({
        name: side > 0 ? 'force-loader-r' : 'force-loader-l',
        displayName: 'Force Loader',
        mesh: forceLoaderMesh({ r: 0.42, color: 0x8f7bff }),
        pos: [side * w * 0.55, h * 0.68, len * 0.28],
        snap: true, snapTarget: [0, h * 0.62, len * 0.24],
        tearHp: 45, linkedAttack: 'gravity', settleY: 0.16,
        loot: [{ id: 'metal-shards', n: 8 }, { id: 'sparker', n: 1 }],
        update: (dt, t, p) => pulseGlow(p.mesh.children[0], t, 3.2),
      });
    }
    // 2. Cargo Hold (belly): torn -> the whole container drops as a loot
    //    pinata (Transport-class flavor).
    this.addPart({
      name: 'cargo-hold', displayName: 'Cargo Hold',
      mesh: cargoMesh(),
      pos: [0, -0.5, -len * 0.08], snap: true, snapTarget: [0, h * 0.6, -len * 0.08],
      orient: false, // half-slotted into the belly, clamps implied

      tearHp: 60, settleY: 0.62,
      loot: [
        { id: 'metal-shards', n: 30 }, { id: 'echo-shell', n: 2 },
        { id: 'chillwater', n: 2 }, { id: 'sparker', n: 2 },
      ],
    });
    // 3. Freeze Canisters x2 (haunches): freeze hit -> freeze explosion +
    //    BRITTLE; tear -> lootable Chillwater.
    for (const side of [1, -1]) {
      this.addPart({
        name: side > 0 ? 'freeze-canister-r' : 'freeze-canister-l',
        displayName: 'Freeze Canister',
        mesh: canisterMesh({ color: 0x63e8ff, r: 0.22, h: 0.62 }),
        pos: [side * w * 0.52, h * 0.6, -len * 0.3],
        snap: true, snapTarget: [0, h * 0.52, -len * 0.28],
        tearHp: 40, elemental: 'freeze', settleY: 0.3,
        loot: [{ id: 'chillwater', n: 2 }],
        update: (dt, t, p) => pulseGlow(p.mesh.children[0], t, 3.6),
      });
    }

    // corpse loot (research loot table)
    this.lootTable = rollLoot([
      { id: 'metal-shards', min: 45, max: 65 },
      { id: 'chillwater', min: 2, max: 3 },
      { id: 'echo-shell', min: 2, max: 3 },
      { id: 'sparker', min: 1, max: 2 },
      { id: 'machine-heart', n: 1, chance: 0.5 },
    ]);

    this._gait = Math.random() * Math.PI * 2;
    this._slamCd = 3;
    this._boulderCd = 5;
    this._dustClock = 0;
    this._chargeDir = new THREE.Vector3();
  }

  chooseAttack(dist) {
    if (dist < 12 && this._slamCd <= 0) {
      this._slamCd = 7;
      return {
        kind: 'slam',
        windup: 0.8, strike: 0.3, recover: 1.2, cooldown: 1.6,
        onStrike: () => {
          this.spawnShockRing(this.position.x, this.position.z, 14, 0.85, 25, 9);
        },
        onUpdate: (a) => {
          if (a.phase === 'windup') {
            this.body.rotation.x = -0.5 * a.phaseT;          // rear up
            this.body.position.y = a.phaseT * 0.9;
          } else if (a.phase === 'strike') {
            this.body.rotation.x = -0.5 + a.phaseT * 0.62;   // crash down
            this.body.position.y = (1 - a.phaseT) * 0.9;
          } else {
            this.body.rotation.x = 0.12 * (1 - a.phaseT);
            this.body.position.y = 0;
          }
        },
        cleanup: () => { this.body.rotation.x = 0; this.body.position.y = 0; },
      };
    }
    // gravity boulder throw — REQUIRES an attached Force Loader (research:
    // tearing them off strips the Behemoth down to a charge-and-stomp brute)
    if (dist > 11 && dist < 42 && this._boulderCd <= 0 && !this.attackDisabled('gravity')) {
      this._boulderCd = 9;
      return this._gravityBoulder();
    }
    if (dist > 6 && dist < this.attackRange * 1.6) {
      const runT = THREE.MathUtils.clamp(dist / 13, 0.7, 2.4);
      return {
        kind: 'charge',
        windup: 0.85, strike: runT, recover: 1.1, cooldown: 4.5,
        onWindup: () => { this._chargeHit = false; this._dustClock = 0; },
        onStrike: () => {
          const p = this.ctx.player;
          if (p) this.heading = Math.atan2(
            p.position.x - this.position.x, p.position.z - this.position.z,
          );
        },
        onUpdate: (a, dt) => {
          if (a.phase === 'windup') {
            // telegraph: rear back, eyes flare, hooves scrape up dust
            const paw = Math.abs(Math.sin(a.phaseT * Math.PI * 2.5)) * 0.09;
            this.body.rotation.x = -0.2 * Math.sin(a.phaseT * Math.PI) + paw;
            this._eyeFlare = 1.6;
            this._dustClock -= dt;
            if (this._dustClock <= 0 && !this.lowLOD) {
              this._dustClock = 0.1;
              const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
              const side = (Math.random() - 0.5) * this.bodyRadius * 1.6;
              const px = this.position.x + fx * this.bodyRadius * 0.9 - fz * side;
              const pz = this.position.z + fz * this.bodyRadius * 0.9 + fx * side;
              this._dustPuff(px, this.ctx.terrain.getHeight(px, pz) + 0.5, pz,
                1.1 + Math.random() * 0.7);
            }
          } else if (a.phase === 'strike') {
            const p = this.ctx.player;
            if (p) {
              // committed charge: only mild homing, dodging sidesteps it
              const want = Math.atan2(
                p.position.x - this.position.x, p.position.z - this.position.z,
              );
              let d = want - this.heading;
              while (d > Math.PI) d -= Math.PI * 2;
              while (d < -Math.PI) d += Math.PI * 2;
              this.heading += THREE.MathUtils.clamp(d, -0.65 * dt, 0.65 * dt);
            }
            const step = 12.5 * dt;
            this.moveRoot(Math.sin(this.heading) * step, Math.cos(this.heading) * step);
            this._gait += step * (Math.PI / 2.4);
            this.body.rotation.x = -0.06;
            if (!this._chargeHit && p) {
              const dd = Math.hypot(
                p.position.x - this.position.x, p.position.z - this.position.z,
              );
              // stop the run BEFORE embedding in the player, then hit
              if (dd < this.bodyRadius + 2) {
                this._chargeHit = true;
                this.damagePlayer(30, this.bodyRadius + 2.6);
                this.knockbackPlayer(14);
                a.t = a.windup + a.strike; // stop the run on impact
              }
            }
          } else {
            this.body.rotation.x = 0;
          }
        },
        cleanup: () => { this.body.rotation.x = 0; },
      };
    }
    return null;
  }

  /** Ticked from Machine.update() — runs even under lowLOD/stun. */
  tickCooldowns(dt) {
    this._slamCd -= dt;
    this._boulderCd -= dt;
  }

  /**
   * Gravity Boulder Throw (research 3.4): force loaders glow, a boulder
   * levitates beside the neck wrapped in purple-blue gravity FX, then hurls
   * flat at the player. Committed at launch — dodge beats it.
   */
  _gravityBoulder() {
    const rock = rockMesh(0.6);
    const glowMat = new THREE.SpriteMaterial({
      map: glowTexture(), color: 0x8f7bff, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(2.4);
    glow.raycast = () => {};
    rock.add(glow);
    rock.visible = false;
    this.ctx.scene.add(rock);
    const start = new THREE.Vector3();
    let launched = false;

    return {
      kind: 'gravity-boulder',
      windup: 1.25, strike: 0.2, recover: 0.9, cooldown: 2,
      onWindup: () => {
        const side = Math.random() < 0.5 ? 1 : -1;
        _bv.set(side * (this.bodyRadius + 1.1), 0, this.bodyRadius * 0.7);
        _bv.applyAxisAngle(_bY, this.heading);
        start.set(this.position.x + _bv.x, 0, this.position.z + _bv.z);
        start.y = this.ctx.terrain.getHeight(start.x, start.z) + 0.4;
        rock.position.copy(start);
        rock.visible = true;
      },
      onUpdate: (a, dt) => {
        if (a.phase !== 'windup') return;
        // levitation: eased rise + wobble, loaders flare
        const k = a.phaseT;
        rock.position.y = start.y + k * k * (this.height * 0.7);
        rock.position.x = start.x + Math.sin(k * 9) * 0.12;
        rock.rotation.y += dt * 2.2;
        rock.rotation.x += dt * 0.9;
        glowMat.opacity = 0.4 + Math.sin(k * 22) * 0.18;
        this._eyeFlare = 1.2;
      },
      onStrike: () => {
        launched = true;
        const p = this.ctx.player;
        const tgt = _bv;
        if (p) {
          tgt.set(
            p.position.x + p.velocity.x * 0.45,
            p.position.y + 1.1,
            p.position.z + p.velocity.z * 0.45,
          );
        } else {
          tgt.set(
            this.position.x + Math.sin(this.heading) * 25,
            this.position.y + 1,
            this.position.z + Math.cos(this.heading) * 25,
          );
        }
        const vel = tgt.clone().sub(rock.position);
        const d = vel.length();
        vel.normalize().multiplyScalar(24);
        vel.y += d * 0.09; // slight lob so it flies flat-ish, not sinking
        let t = 0;
        const terrain = this.ctx.terrain;
        this._fx.push({
          update: (dt) => {
            t += dt;
            vel.y -= 7.5 * dt; // gravity-tech: falls slower than free rock
            rock.position.addScaledVector(vel, dt);
            rock.rotation.x += dt * 6;
            rock.rotation.z += dt * 4;
            const p2 = this.ctx.player;
            const gy = terrain.getHeight(rock.position.x, rock.position.z);
            const nearPlayer = p2
              && rock.position.distanceToSquared(p2.position) < 2.6;
            if (rock.position.y <= gy + 0.3 || nearPlayer || t > 4) {
              const px = rock.position.x, pz = rock.position.z;
              this.spawnShockRing(px, pz, 3.4, 0.42, 0, 0);
              if (p2 && Math.hypot(p2.position.x - px, p2.position.z - pz) < 2.8) {
                this.ctx.events.emit('player-damage', { amount: 25, from: this });
                this.knockbackPlayer(10);
              }
              _bv.set(px, gy + 0.5, pz);
              this._sparkBurst(_bv, 10, 0x9a8ce8);
              this._dustPuff(px, gy + 0.4, pz, 1.4);
              this.ctx.scene.remove(rock);
              rock.geometry.dispose();
              rock.material.dispose();
              glowMat.dispose();
              return false;
            }
            return true;
          },
        });
      },
      cleanup: () => {
        // interrupted before launch (stun/death): drop the rock cleanly
        if (!launched) {
          this.ctx.scene.remove(rock);
          rock.geometry.dispose();
          rock.material.dispose();
          glowMat.dispose();
        }
      },
    };
  }

  animate(dt, t) {
    if (this.state === 'dead') return;
    const speed = this._speed;
    const stride = 2.4;
    this._gait += dt * speed * (Math.PI / stride);
    const moveK = THREE.MathUtils.clamp(speed / 2, 0, 1);

    const inAttack = !!this._attack;
    if (!inAttack) {
      this.body.position.y = Math.abs(Math.sin(this._gait)) * 0.14 * moveK
        + Math.sin(t * 0.9) * 0.02;
      this.body.rotation.x = Math.sin(this._gait * 2) * 0.015 * moveK
        - (speed - this._accelPitch) * 0.02;
      this.body.rotation.z = Math.sin(this._gait) * 0.05 * moveK;
    } else {
      this.body.rotation.z = Math.sin(this._gait) * 0.05 * moveK;
    }
  }
}
