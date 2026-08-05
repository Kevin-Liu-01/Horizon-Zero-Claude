import * as THREE from 'three';
import { Machine, rollLoot, glowTexture } from './machine.js';
import {
  radarMesh, discLauncherMesh, tailTipMesh, plateMesh, cannonMesh,
  canisterMesh, coreMesh, pulseGlow,
} from './parts.js';

/**
 * Thunderjaw: apex boss (HZD level 27). Stomp shockwave, tail sweep,
 * jaw-cannon tracer bursts, arcing disc-launcher projectiles, and the
 * ENRAGE-gated mouth laser sweep (health < 40%, canon cue). Components per
 * research doc 4.3/4.7: back Radar (sees through grass until torn; tearing
 * halves detection), Disc Launchers x2 above the hips (torn -> heavy-weapon
 * PICKUPS — the franchise's signature moment), mandibular Cannons x2 (torn
 * -> cannon bursts gone), tail tip (torn -> no tail attacks), Blaze/Freeze
 * canisters (belly flank / throat), and the canon armor-strip loop: heart +
 * head plates hide DISABLED weak points that come online (glowing core
 * exposed) when the plate is torn off.
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
      // Round-1 shipped -PI/2 ("faces +X") — verified WRONG by heading-0
      // screenshot: the sculpt's snout runs along asset -Z (length axis z),
      // so it strafed sideways. PI puts the head on body +Z.
      yawFix: Math.PI,
      maxHealth: 1800, // spec v2 retune
      armor: 0.3,
      level: 27,
      elemResist: 'shock', // research 4.1
      walkSpeed: 3.4,
      runSpeed: 6.5,
      turnRate: 1.15,
      sightRange: 62,
      sightHalf: THREE.MathUtils.degToRad(60),
      hearRange: 42,
      // RADAR: sees crouched players in grass at range (research 0.3) —
      // tear the radar off to get stealth back
      stealthRange: 34,
      eyeHeight: 3.6, // canon 9.4 m scale: head rides at ~0.38 h
      attackRange: 55,
      bodyRadius: 4,
      ...opts,
    });

    const h = this.height;       // 9.4 (canon; tail crest peak)
    const len = this.size.z;     // ~12.9 along asset z -> body Z after yawFix
    const w = this.size.x;       // ~6.3 across the leg stance
    // head sensor eyes (head rides LOW on this sculpt; tail is the h peak)
    this.addEye(this.body, 0.45, h * 0.38, len * 0.44, 0.6, 0.11);
    this.addEye(this.body, -0.45, h * 0.38, len * 0.44, 0.6, 0.11);
    // anchors
    this._mouth = new THREE.Object3D();
    this._mouth.position.set(0, h * 0.32, len * 0.46);
    this.body.add(this._mouth);
    this._launcher = new THREE.Object3D();
    this._launcher.position.set(0, h * 0.62, -len * 0.18);
    this.body.add(this._launcher);

    // weak points — kept small and OFF the center-mass aim line so lazy
    // torso shots don't score weak hits. Heart + head sensor start DISABLED
    // under armor plates (canon strip loop, research 4.3): tear the plate to
    // bring the weak point online.
    this._wpHead = this.addWeakPoint('head sensor', this.body, 0, h * 0.38, len * 0.44, 0.95);
    this._wpHead.enabled = false;
    this._wpHeart = this.addWeakPoint('heart', this.body, 0, h * 0.25, len * 0.24, 0.85);
    this._wpHeart.enabled = false;
    this.addWeakPoint('tail tip', this.body, 0, h * 0.85, -len * 0.42, 0.8);

    // --- components (research 4.7)
    // 1. Radar (top of back): rotating fin; while attached the Thunderjaw
    //    sees through tall grass. Torn -> detection range halves.
    const radarM = radarMesh();
    this.addPart({
      name: 'radar', displayName: 'Radar',
      mesh: radarM,
      pos: [0, h * 1.3, -len * 0.05], snap: true,
      snapTarget: [0, h * 0.2, -len * 0.05], orient: false,
      tearHp: 80, settleY: 0.5,
      loot: [{ id: 'echo-shell', n: 2 }, { id: 'wire', n: 3 }],
      update: (dt) => { radarM.userData.fin.rotation.y += dt * 1.7; },
      onTorn: () => {
        this.sightRange *= 0.5;
        this.hearRange *= 0.5;
        this.stealthRange = 8; // grass hides the player again
      },
    });
    // 2. Disc Launchers x2 (above each hip): tear off -> physics drop ->
    //    PICK UP as a heavy weapon (weapons system reads pickupWeapon flag).
    this._launcherParts = [];
    for (const side of [1, -1]) {
      this._launcherParts.push(this.addPart({
        name: side > 0 ? 'disc-launcher-r' : 'disc-launcher-l',
        displayName: 'Disc Launcher',
        mesh: discLauncherMesh(),
        pos: [side * w * 0.28, h * 1.2, -len * 0.18], snap: true,
        snapTarget: [side * w * 0.06, h * 0.3, -len * 0.18], orient: false,
        rot: [0, side * 0.18, 0],
        tearHp: 100, linkedAttack: 'disc', pickupWeapon: 'disc-launcher',
        settleY: 0.42, sparkleWhileTorn: true, loot: [],
        update: (dt, t, p) => pulseGlow(p.mesh.children[0], t, 2.6),
      }));
    }
    // 3. Tail tip: torn -> tail attacks disabled.
    this.addPart({
      name: 'tail-tip', displayName: 'Tail',
      mesh: tailTipMesh(),
      // the sculpt's tail curl defeats hull rays — placed visually on the
      // upcurved crest, spike tilted to continue the curve
      pos: [0.4, h * 0.74, -len * 0.28], snap: false,
      rot: [0.6, 0, 0],
      tearHp: 90, linkedAttack: 'tail', settleY: 0.3,
      loot: [{ id: 'metal-shards', n: 15 }, { id: 'wire', n: 2 }],
    });
    // 4. Mandibular cannons x2 (research 4.3): jaw-side tracer guns. Torn
    //    off -> the cannon burst attack is gone (mid-range pressure relief).
    this._cannonParts = [];
    for (const side of [1, -1]) {
      this._cannonParts.push(this.addPart({
        name: side > 0 ? 'cannon-r' : 'cannon-l', displayName: 'Cannon',
        mesh: cannonMesh(),
        // authored directly (hull snap converges on the snout centerline)
        pos: [side * 0.82, h * 0.3, len * 0.42], snap: false,
        rot: [0, side * 0.07, 0], // slight outward toe
        tearHp: 70, linkedAttack: 'cannon', settleY: 0.24,
        loot: [{ id: 'metal-shards', n: 8 }, { id: 'wire', n: 1 }],
      }));
    }
    // 5. Elemental canisters (research 4.3): blaze on the belly flank,
    //    freeze at the throat — matching-element hits detonate on the boss.
    this.addPart({
      name: 'blaze-canister', displayName: 'Blaze Canister',
      mesh: canisterMesh({ color: 0xff7a1e, r: 0.26, h: 0.78 }),
      pos: [w * 0.32, h * 0.28, len * 0.04], snap: true,
      snapTarget: [0, h * 0.3, len * 0.04],
      tearHp: 55, elemental: 'blaze', settleY: 0.3,
      loot: [{ id: 'blaze', n: 3 }],
      update: (dt, t, p) => pulseGlow(p.mesh.children[0], t, 3.4),
    });
    this.addPart({
      name: 'freeze-canister', displayName: 'Freeze Canister',
      mesh: canisterMesh({ color: 0x63e8ff, r: 0.24, h: 0.7 }),
      pos: [0, h * 0.22, len * 0.38], snap: true,
      snapTarget: [0, h * 0.32, len * 0.22],
      tearHp: 55, elemental: 'freeze', settleY: 0.3,
      loot: [{ id: 'chillwater', n: 2 }],
      update: (dt, t, p) => pulseGlow(p.mesh.children[0], t, 3.8),
    });
    // 6. Armor plates (nod to the real 93). The HEART and HEAD plates sit
    //    exactly over the disabled weak points: tearing one exposes a small
    //    glowing core and switches the weak point ON (canon armor-strip
    //    loop). Two more hip/thigh shells expose bonus-impact under-plate.
    const coverPlate = (name, wp, coreColor, pos, rot) => {
      // authored directly over the weak-point anchor (hull snap converges on
      // the snout); the hidden weak point is re-seated exactly under the plate
      wp.obj.position.set(pos[0], pos[1], pos[2]);
      this.addPart({
        name, displayName: 'Armor Plate',
        mesh: plateMesh({ w: 1.15, l: 1.5, t: 0.13, color: 0xc9ced4 }),
        pos, snap: false, rot,
        tearHp: 55, settleY: 0.14,
        loot: [{ id: 'metal-shards', n: 6 }],
        onTorn: (part, m) => {
          wp.enabled = true; // weak point comes online
          // exposed core: small emissive machine-gut left in the socket
          const core = coreMesh({ color: coreColor, r: 0.34 });
          m.addPart({
            name: `${name}-core`,
            displayName: wp.name === 'heart' ? 'Heart' : 'Data Nexus',
            mesh: core,
            pos: [part.anchor.x, part.anchor.y, part.anchor.z],
            snap: false, orient: false,
            tearHp: Infinity, weak: true, weakMult: 3,
            update: (dt2, t2, p2) => pulseGlow(p2.mesh.children[0], t2, 6),
          });
        },
      });
    };
    // heart: low chest, plate face angled forward-down; head: snout top
    coverPlate('heart-plate', this._wpHeart, 0xff9a3d,
      [0, h * 0.26, len * 0.3], [1.25, 0, 0]);
    coverPlate('head-plate', this._wpHead, 0x9fd8ff,
      [0, h * 0.44, len * 0.42], [0.4, 0, 0]);
    const plateSpots = [[1, -0.18, 0.42], [-1, -0.18, 0.42]];
    for (let i = 0; i < plateSpots.length; i++) {
      const [sx, sz, sy] = plateSpots[i];
      this.addPart({
        name: `armor-plate-${i + 1}`, displayName: 'Armor Plate',
        mesh: plateMesh({ w: 1.05, l: 1.4, t: 0.12, color: 0xc9ced4 }),
        pos: [sx * w * 0.55, h * sy, len * sz], snap: true,
        snapTarget: [sx * -w * 0.1, h * sy, len * sz],
        tearHp: 50, settleY: 0.14,
        loot: [{ id: 'metal-shards', n: 6 }],
        onTorn: (part, m) => {
          m.addWeakPoint('exposed', m.body,
            part.anchor.x, part.anchor.y, part.anchor.z, 1.1, 1.3);
        },
      });
    }

    // corpse loot (research loot table — the apex prize)
    this.lootTable = rollLoot([
      { id: 'metal-shards', min: 90, max: 130 },
      { id: 'blaze', min: 3, max: 4 },
      { id: 'chillwater', min: 2, max: 3 },
      { id: 'sparker', min: 2, max: 3 },
      { id: 'echo-shell', min: 3, max: 4 },
      { id: 'machine-heart', n: 1 },
    ]);

    this._gait = Math.random() * Math.PI * 2;
    this._lastStep = 0;
    this._cdStomp = 2;
    this._cdLaser = 4;
    this._cdDisc = 7;
    this._cdCannon = 4;
    this._cdTail = 3;
    this._discAlt = 0;
    this._cannonAlt = 0;
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
    if (this._playerBehind() && dist < 15 && this._cdTail <= 0
        && !this.attackDisabled('tail')) {
      this._cdTail = 6;
      return this._tailSweep();
    }
    if (dist < 11 && this._cdStomp <= 0) {
      this._cdStomp = 6;
      return this._stomp();
    }
    // ENRAGE cue (canon): the mouth laser only comes out under 40% health
    if (dist > 13 && dist < 65 && this._cdLaser <= 0
        && this.health < this.maxHealth * 0.4) {
      this._cdLaser = 9.5;
      return this._laser(dist);
    }
    if (dist > 16 && dist < 90 && this._cdDisc <= 0
        && !this.attackDisabled('disc')) {
      this._cdDisc = 8.5;
      return this._discs();
    }
    // jaw cannon tracer burst (research 4.4): mid-range pressure that keeps
    // the fight honest after the disc launchers are torn off
    if (dist > 13 && dist < 70 && this._cdCannon <= 0
        && !this.attackDisabled('cannon')) {
      this._cdCannon = 7;
      return this._cannonBurst(dist);
    }
    return null;
  }

  /* --------------------------- stomp --------------------------- */

  _stomp() {
    return {
      kind: 'stomp',
      windup: 0.85, strike: 0.25, recover: 1.2, cooldown: 1.2,
      onStrike: () => {
        // damage ladder (research 5): apex hits 35-55
        this.spawnShockRing(this.position.x, this.position.z, 12, 0.8, 40, 8);
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
        this.damagePlayer(45, 15); // full-circle rear hit, checked once
        this.knockbackPlayer(12);
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
              this.ctx.events.emit('player-damage', { amount: 8, from: this });
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

  /* --------------------------- jaw cannons --------------------------- */

  /** Single cannon tracer: fast glowing bolt from a live cannon muzzle to a
   *  ground point; sparks on impact, 8 dmg within 1.2 m of the player. */
  _fireTracer(target, burst) {
    const live = this._cannonParts?.filter((cp) => cp.attached) ?? [];
    if (live.length) {
      this._cannonAlt = (this._cannonAlt + 1) % live.length;
      const muzzle = live[this._cannonAlt].mesh.children[0]?.userData?.muzzle;
      (muzzle ?? live[this._cannonAlt].mesh).getWorldPosition(_v);
    } else {
      this._mouth.getWorldPosition(_v);
    }
    const start = _v.clone();
    const vel = new THREE.Vector3().subVectors(target, start);
    const dist = vel.length();
    vel.normalize().multiplyScalar(60);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffc46b, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const bolt = new THREE.Mesh(_beamGeo, mat);
    const L = 1.6; // tracer streak length
    bolt.scale.set(0.05, L, 0.05);
    bolt.position.copy(start);
    _v2.copy(vel).normalize();
    bolt.quaternion.setFromUnitVectors(_Y, _v2);
    this.ctx.scene.add(bolt);
    let flown = 0;
    const terrain = this.ctx.terrain;
    this._fx.push({
      update: (dt) => {
        const step = 60 * dt;
        flown += step;
        bolt.position.addScaledVector(vel, dt);
        const p = this.ctx.player;
        let hitPlayer = false;
        if (p && burst.hits < 5) { // cap a full burst at 40 dmg
          const dx = bolt.position.x - p.position.x;
          const dy = bolt.position.y - (p.position.y + 1.0);
          const dz = bolt.position.z - p.position.z;
          hitPlayer = dx * dx + dy * dy + dz * dz < 1.45;
        }
        const gy = terrain.getHeight(bolt.position.x, bolt.position.z);
        if (hitPlayer || bolt.position.y <= gy + 0.1 || flown >= dist + 4) {
          if (hitPlayer) {
            burst.hits += 1;
            this.ctx.events.emit('player-damage', { amount: 8, from: this });
          }
          _v.set(bolt.position.x, Math.max(bolt.position.y, gy) + 0.25, bolt.position.z);
          this._sparkBurst(_v, 6, 0xffc46b);
          if (!hitPlayer) this._dustPuff(bolt.position.x, gy + 0.3, bolt.position.z, 0.6);
          this.ctx.scene.remove(bolt);
          mat.dispose();
          return false;
        }
        return true;
      },
    });
  }

  /**
   * Cannon Burst (research 4.4 "lead-up"): tracers walk fire from short of
   * the player up onto them over ~1.5 s. Dodge sideways to break the walk.
   * Gone entirely once both jaw cannons are torn off.
   */
  _cannonBurst(dist) {
    const burst = { hits: 0 };
    let fired = 0;
    const total = 12;
    const from = new THREE.Vector3();
    const target = new THREE.Vector3();
    return {
      kind: 'cannon',
      windup: 0.7, strike: 1.55, recover: 0.7, cooldown: 2,
      onStrike: () => {
        const p = this.ctx.player;
        if (p) {
          // walk-up origin: 40% of the way out, biased short
          from.copy(p.position).sub(this.position).multiplyScalar(0.45).add(this.position);
        } else {
          from.set(
            this.position.x + Math.sin(this.heading) * dist * 0.5, 0,
            this.position.z + Math.cos(this.heading) * dist * 0.5,
          );
        }
        from.y = this.ctx.terrain.getHeight(from.x, from.z);
      },
      onUpdate: (a, dt) => {
        if (a.phase === 'windup') {
          this.body.rotation.x = 0.05 * a.phaseT; // muzzle dips as jaw braces
          this._eyeFlare = 0.8 + a.phaseT;
        } else if (a.phase === 'strike') {
          const due = Math.min(total, Math.floor(a.phaseT * total) + 1);
          while (fired < due) {
            fired += 1;
            const k = fired / total; // walk 0 -> 1 toward the live player pos
            const p = this.ctx.player;
            if (p) {
              target.lerpVectors(from, p.position, Math.min(1, k * 1.25));
              target.y = p.position.y * Math.min(1, k * 1.25)
                + from.y * (1 - Math.min(1, k * 1.25));
            } else {
              target.copy(from);
            }
            target.x += (Math.random() - 0.5) * 1.4;
            target.z += (Math.random() - 0.5) * 1.4;
            target.y += 0.6;
            this._fireTracer(target, burst);
          }
        } else {
          this.body.rotation.x = 0.05 * (1 - a.phaseT);
        }
      },
      cleanup: () => { this.body.rotation.x = 0; },
    };
  }

  /* --------------------------- disc launcher --------------------------- */

  _fireDisc(lateral = 0) {
    const p = this.ctx.player;
    // fire from a live launcher part (alternating); fall back to the spine
    // anchor if both were torn mid-volley
    const live = this._launcherParts?.filter((lp) => lp.attached) ?? [];
    if (live.length) {
      this._discAlt = (this._discAlt + 1) % live.length;
      live[this._discAlt].mesh.getWorldPosition(_v);
    } else {
      this._launcher.getWorldPosition(_v);
    }
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
            this.ctx.events.emit('player-damage', { amount: 35, from: this });
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
    // volley scales with surviving launchers: 2 -> 3 discs, 1 -> 2 discs
    const launchers = this._launcherParts?.filter((lp) => lp.attached).length ?? 2;
    const volley = 1 + launchers;
    return {
      kind: 'disc',
      windup: 0.6, strike: 1.1, recover: 0.7, cooldown: 1.8,
      onUpdate: (a) => {
        if (a.phase === 'windup') {
          this.body.rotation.x = -0.08 * a.phaseT;
        } else if (a.phase === 'strike') {
          this.body.rotation.x = -0.08;
          const due = Math.floor(a.phaseT * volley) + 1;
          while (fired < due && fired < volley) {
            fired += 1;
            // fan: left / center / right ('machine-attack' already emitted
            // once by _startAttack — do NOT re-emit per disc)
            this._fireDisc((fired - (volley + 1) / 2) * 2.4 + (Math.random() - 0.5) * 0.8);
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
    this._cdCannon -= dt;
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
