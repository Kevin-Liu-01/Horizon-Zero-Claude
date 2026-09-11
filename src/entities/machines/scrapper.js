import * as THREE from 'three';
import { Machine, rollLoot, glowTexture } from './machine.js';
import { radarMesh, powerCellMesh, pulseGlow } from './parts.js';
import { buildRig } from './autorig.js';
import { GaitController } from './gait.js';
import { attachRigRuntime, updateRigLOD } from './rig/lod.js';
import { snapSockets } from './rig/sockets.js';
import { buildShell, hideSculpt, SCRAPPER_SHELL } from './rig/shells.js';

/**
 * Scrapper: T1 pack scavenger (roster-v2 §4 — hyena role, recast onto the
 * Robocat biped chassis). Waddling lope patrol with a RADAR SCAN PAUSE every
 * ~20 s (dorsal dish spins up, ping rings, detects moving prey), pack
 * flanking on attack, mouth LASER BURST at range and a claw swipe up close.
 * Components: back radar (tear = scanning blinded, detection cut) and a
 * power cell between the haunches (shock detonation = self-stun AoE).
 * Sensor: the yellow helmet eyes were converted to the state-color sensor by
 * the style pass (variety-assets.js).
 *
 * Model: Robocat.glb (Jordan Hill, CC-BY 3.0), display stand excised at
 * preprocess. Static -> autorig biped (2-leg spec fitted to the sculpt).
 */

/**
 * ROUND 4 (`machine-rig-01`, gate `V26`): the Scrapper is a QUADRUPED.
 *
 * The licensed sculpt is an upright chrome biped ("Robocat"), which is why the
 * audit read it as "a chrome sphere on legs". The kitbash shell
 * (`rig/shells.js` SCRAPPER_SHELL) draws the whole animal on this rig and the
 * sculpt is retired underneath it (`hideSculpt`).
 *
 * ROUND-4 FIX ROUND 2 — the art pass V26 and A47 both asked for. Two defects
 * were fixed together, and they are worth writing down because both are
 * invisible in a bind-pose screenshot:
 *
 * 1. **A 0.52 rad `scrapper-tilt` group.** It existed to pitch the upright
 *    donor sculpt onto a horizontal torso — but the sculpt is not drawn any
 *    more, so all it did was leave every shell geometry's LOCAL axes 30 deg
 *    off the world. Gate `A47` grades a corpse on its mesh AABBs, and a box
 *    around tilted geometry hangs 0.77-0.80 m below the geometry itself
 *    (measured: box -0.21 m vs lowest posed vertex +0.53 m), which made A47
 *    and its posed-hull twin A47b mutually infeasible. The tilt is gone; the
 *    rig below IS the horizontal torso.
 *
 * 2. **The trunk was bound to the legs.** `buildRig` weights a vertex to the
 *    nearest capsule and gives leg capsules a 1.6x boost, with `legGateY` as
 *    the only hard cut — and this rig's gate was 0.92, ABOVE the entire
 *    machine, so it cut nothing. The trunk plates are 0.42 m wide over hips
 *    only 0.42 m apart, so their outer corners sat 0.03 m from the thigh
 *    capsule axis and every one of them bound to a THIGH. At rest that is
 *    invisible; the moment the gait swung a thigh 77 deg it tore the body
 *    open, which is the "fan of intersecting flat plates ... no legs of any
 *    kind are readable" a judge graded. The fix is the geometry the Sawtooth
 *    already has and this species did not: the trunk rides ABOVE the hips
 *    (spine y 1.02-1.08 over hips at 0.86-0.88), the stance is wider than the
 *    trunk is (hips at x 0.30 against a 0.21 half-width), `legGateY` sits just
 *    under the hips, and `legInboard` keeps the soft underbelly — which hangs
 *    below the gate — off the legs as well. See `autorig.js`.
 *
 * Body space: +Z forward, head low and forward, hips rear, everything level.
 */
const SCRAPPER_RIG = {
  spine: [
    { name: 'pelvis', pos: [0, 1.02, -0.42], r: 0.40 },
    { name: 'spine', pos: [0, 1.08, -0.02], r: 0.42 },
    { name: 'chest', pos: [0, 1.08, 0.38], r: 0.40 },
    { name: 'head', pos: [0, 0.90, 0.80], r: 0.32, tip: [0, 0.74, 1.12] },
  ],
  // NO TAIL. docs/research/roster-v2.md:50 is explicit — "Quadruped, humped,
  // no tail" — and the cable tuft this rig used to carry was the last V26
  // artefact left on the species: its far half bound to `tail1` while the near
  // half bound to the pelvis, so the moment the fidget swung the tail joint
  // the cone tore off the rump and read as a spike floating behind the machine.
  tail: [],
  /**
   * Leg capsules may only claim geometry BELOW the hips (`legGateY`) and no
   * more than `legInboard` metres inboard of their own hip. Between them the
   * trunk plates (high, and only 0.17 m from the sagittal plane) and the
   * underbelly muscle (low, but 0.165 m inboard of the hips) both stay on the
   * spine, while the thigh plates — 0.11 m inboard at their innermost, and
   * below the gate — stay on the leg. See the header.
   */
  legGateY: 0.80,
  legInboard: 0.13,
  legs: [
    { id: 'LF', parent: 'chest', hinge: -1, hip: [-0.30, 0.88, 0.34], knee: [-0.31, 0.50, 0.52], ankle: [-0.32, 0.22, 0.38], toe: [-0.32, 0.04, 0.56], r: 0.16, restFoot: [-0.32, 0.56] },
    { id: 'RF', parent: 'chest', hinge: -1, hip: [0.30, 0.88, 0.34], knee: [0.31, 0.50, 0.52], ankle: [0.32, 0.22, 0.38], toe: [0.32, 0.04, 0.56], r: 0.16, restFoot: [0.32, 0.56] },
    { id: 'LH', parent: 'pelvis', hinge: 1, hip: [-0.28, 0.86, -0.40], knee: [-0.30, 0.48, -0.60], ankle: [-0.32, 0.22, -0.44], toe: [-0.32, 0.04, -0.24], r: 0.17, restFoot: [-0.32, -0.24] },
    { id: 'RH', parent: 'pelvis', hinge: 1, hip: [0.28, 0.86, -0.40], knee: [0.30, 0.48, -0.60], ankle: [0.32, 0.22, -0.44], toe: [0.32, 0.04, -0.24], r: 0.17, restFoot: [0.32, -0.24] },
  ],
};

const _v = new THREE.Vector3();

export class Scrapper extends Machine {
  constructor(ctx, manager, opts) {
    super(ctx, manager, {
      kind: 'scrapper',
      displayName: 'Scrapper',
      rigged: false,
      yawFix: -Math.PI / 2, // sculpt faces +X
      maxHealth: 120,
      armor: 0.05,
      level: 6,
      walkSpeed: 2.3,
      runSpeed: 6,
      turnRate: 3.2,
      sightRange: 34,
      hearRange: 24,
      eyeHeight: 1.05,
      attackRange: 26, // laser burst envelope; melee gates on real distance
      bodyRadius: 0.7,
      ...opts,
    });

    this._flank = opts.flank ?? 0; // -1 | 0 | 1 — pack spread on approach
    this._scanT = 8 + Math.random() * 12;
    this._scanning = 0;
    this._pingClock = 0;
    this._cdLaser = 2 + Math.random() * 2;
    this._cdClaw = 1;

    // mouth anchor for the laser (added pre-rig -> reparents onto the head bone)
    this._muzzle = new THREE.Object3D();
    this._muzzle.position.set(0, 0.80, 1.02);
    this.body.add(this._muzzle);

    this.addEye(this.body, 0.10, 0.97, 0.94, 0.20, 0, 0.5);
    this.addEye(this.body, -0.10, 0.97, 0.94, 0.20, 0, 0.5);
    this.addWeakPoint('head', this.body, 0, 0.92, 0.88, 0.28, 2.5);

    // --- components (roster-v2 §4 Scrapper)
    // 1. Radar dish on the jetpack: spins during scan pauses. Torn ->
    //    scanning blinded + detection cut.
    const radar = radarMesh({ accent: 0x9fd8ff });
    radar.scale.setScalar(0.3);
    this._radarPart = this.addPart({
      name: 'radar', displayName: 'Radar',
      mesh: radar,
      pos: [0, 1.22, -0.06], snap: false, orient: false,
      tearHp: 25, settleY: 0.2,
      loot: [{ id: 'echo-shell', n: 1 }, { id: 'wire', n: 1 }],
      update: (dt) => {
        radar.userData.fin.rotation.y += dt * (this._scanning > 0 ? 11 : 1.3);
      },
      onTorn: () => {
        this.sightRange *= 0.65;
        this._scanT = Infinity; // scanning blinded
        this._scanning = 0;
      },
    });
    // 2. Power cell between the haunches: shock detonation = self-stun AoE.
    this.addPart({
      name: 'power-cell', displayName: 'Power Cell',
      mesh: (() => { const c = powerCellMesh({ color: 0xffd23d }); c.scale.setScalar(0.62); return c; })(),
      pos: [0, 1.04, -0.54], snap: true, snapTarget: [0, 0.94, -0.34],
      tearHp: 20, elemental: 'shock', settleY: 0.18,
      loot: [{ id: 'sparker', n: 2 }],
      update: (dt, t, p) => pulseGlow(p.mesh.children[0], t, 5),
    });

    this.lootTable = rollLoot([
      { id: 'metal-shards', min: 8, max: 14 },
      { id: 'wire', min: 1, max: 2 },
      { id: 'sparker', min: 1, max: 2 },
      { id: 'echo-shell', n: 1, chance: 0.5 },
    ]);

    // --- silhouette pass: front legs, low head, dorsal plate (V26)
    buildShell(this, SCRAPPER_SHELL, { rig: SCRAPPER_RIG });
    attachRigRuntime(this);

    // --- auto-rig + four-legged scavenger lope
    buildRig(this, SCRAPPER_RIG);
    this.gait = new GaitController(this, this.rig, {
      // lateral-sequence walk, then a bounding lope with real suspension
      walk: { stride: 0.62, duty: 0.62, lift: 0.10, offsets: { LF: 0, RH: 0.25, RF: 0.5, LH: 0.75 } },
      run: { stride: 1.25, duty: 0.40, lift: 0.24, offsets: { LF: 0.06, RF: 0, LH: 0.56, RH: 0.5 } },
      runRef: 6,
      rollAmp: 0.1,     // comic little waddle
      impactAmp: 0.05,
      breatheRate: 1.7,
      stepDustSpeed: 4.5,
      turnRadius: 0.5,
      lookClampYaw: 1.1,
      fidgets: [
        { name: 'sniff', head: -0.30, spine: 0.07, dur: 1.4 },
        { name: 'scan-up', head: 0.34, dur: 1.2 },
        { name: 'tail-twitch', tail: 0.30, dur: 0.8 },
      ],
      stanceFlex: 0.05, // legs bind near full extension — keep IK headroom
    });
    this.gait.update(0.016, 0);
    // the SHELL is the machine now (machine-rig-01): retire the donor
    // sculpt AFTER the rig binds and the merge pass runs, and BEFORE the
    // socket proxy is built, so the hull every gate measures is the shell
    hideSculpt(this);
    snapSockets(this);          // bone-space sockets sit ON the hull (A44)
    this._deathRoll = 0.55; // small chassis tips right over
    this._deathSink = 0.05;
  }

  onDeathPose(k, deathT) {
    this.gait.deathPose(k, deathT, 'quad');
  }

  tickCooldowns(dt) {
    this._cdLaser -= dt;
    this._cdClaw -= dt;
    if (this.state === 'patrol' || this.state === 'return') this._scanT -= dt;
  }

  /* --------------------- radar scan pause --------------------- */

  _statePatrol(dt) {
    if (this._scanning > 0) {
      this._scanning -= dt;
      this._speed = THREE.MathUtils.damp(this._speed, 0, 8, dt);
      this.heading += dt * 0.55; // slow sweep in place
      this._pingClock -= dt;
      if (this._pingClock <= 0 && !this.lowLOD) {
        this._pingClock = 0.9;
        this._pingRing();
        // radar actually detects: moving human-sized objects (roster)
        const p = this.ctx.player;
        if (p && p.moveSpeed > 0.5 && this.playerDist < 24) {
          this.suspicion = Math.min(1.2, this.suspicion + 0.45);
          this.lastKnown.copy(p.position);
        }
      }
      return;
    }
    super._statePatrol(dt);
    if (this._scanT <= 0 && this._radarPart.attached) {
      this._scanT = 16 + Math.random() * 9;
      this._scanning = 3.2;
      this._eyeFlare = 1.5;
    }
  }

  /** Expanding radar ping ring above the dish. */
  _pingRing() {
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(), color: 0x9fd8ff, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const s = new THREE.Sprite(mat);
    this._radarPart.mesh.getWorldPosition(_v);
    s.position.copy(_v);
    s.position.y += 0.35;
    s.scale.setScalar(0.4);
    this.ctx.scene.add(s);
    let t = 0;
    this._fx.push({
      update: (dt) => {
        t += dt;
        const k = t / 0.8;
        s.scale.setScalar(0.4 + k * 7);
        mat.opacity = 0.55 * (1 - k);
        if (k >= 1) { this.ctx.scene.remove(s); mat.dispose(); return false; }
        return true;
      },
    });
  }

  /* --------------------- pack flanking --------------------- */

  _stateAttack(dt) {
    if (this._attack) { this._updateAttack(dt); return; }
    this._attackCd -= dt;
    const p = this.ctx.player;
    if (!p) { this.setState('return'); return; }
    if (this._unseenT > 4.5) { this.setState('search'); return; }
    const dist = this.playerDist;
    if (dist > 7) {
      // flank: approach a point offset to the player's side, collapsing the
      // offset as the pack closes in — three scrappers arrive on three arcs
      _v.set(p.position.x - this.position.x, 0, p.position.z - this.position.z).normalize();
      const off = this._flank * THREE.MathUtils.clamp(dist * 0.45, 2, 7);
      this._moveToward(
        p.position.x + -_v.z * off,
        p.position.z + _v.x * off,
        this.runSpeed, dt,
      );
    } else {
      this._face(p.position.x, p.position.z, dt);
      this._speed = THREE.MathUtils.damp(this._speed, 0, 8, dt);
    }
    if (this._attackCd <= 0) {
      const a = this.chooseAttack?.(dist);
      if (a) this._startAttack(a);
    }
  }

  /* --------------------- attacks --------------------- */

  chooseAttack(dist) {
    if (dist < 3.4 && this._cdClaw <= 0) {
      this._cdClaw = 2.4;
      return this._clawSwipe();
    }
    if (dist > 7 && dist < 29 && this._cdLaser <= 0) {
      this._cdLaser = 6;
      return this._laserBurst();
    }
    return null;
  }

  /** Laser Burst 8-29 m (roster): mouth glows, then a stagger of red bolts. */
  _laserBurst() {
    let fired = 0;
    const total = 7;
    const burst = { hits: 0 };
    return {
      kind: 'laser',
      windup: 0.55, strike: 0.75, recover: 0.8, cooldown: 2,
      onUpdate: (a) => {
        if (a.phase === 'windup') {
          this._eyeFlare = 0.8 + a.phaseT * 2.2;
          this.gait.pose.headPitch = -0.15 * a.phaseT; // head rears to aim
        } else if (a.phase === 'strike') {
          this.gait.pose.headPitch = 0.06;
          const due = Math.min(total, Math.floor(a.phaseT * total) + 1);
          while (fired < due) {
            fired += 1;
            this._fireLaserBolt(burst);
          }
        } else {
          this.gait.pose.headPitch = 0;
        }
      },
      cleanup: () => { this.gait.pose.headPitch = 0; },
    };
  }

  _fireLaserBolt(burst) {
    const p = this.ctx.player;
    this._muzzle.getWorldPosition(_v);
    const start = _v.clone();
    const tgt = p
      ? new THREE.Vector3(
        p.position.x + p.velocity.x * 0.35 + (Math.random() - 0.5) * 1.1,
        p.position.y + 1.0 + (Math.random() - 0.5) * 0.5,
        p.position.z + p.velocity.z * 0.35 + (Math.random() - 0.5) * 1.1,
      )
      : new THREE.Vector3(
        start.x + Math.sin(this.heading) * 20, start.y,
        start.z + Math.cos(this.heading) * 20,
      );
    const vel = tgt.sub(start);
    const dist = vel.length();
    vel.normalize().multiplyScalar(46);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff4a2a, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const bolt = new THREE.Mesh(Scrapper._boltGeo, mat);
    bolt.scale.set(0.035, 0.9, 0.035);
    bolt.position.copy(start);
    _v.copy(vel).normalize();
    bolt.quaternion.setFromUnitVectors(Scrapper._up, _v);
    this.ctx.scene.add(bolt);
    let flown = 0;
    const terrain = this.ctx.terrain;
    this._fx.push({
      update: (dt) => {
        const step = 46 * dt;
        flown += step;
        bolt.position.addScaledVector(vel, dt);
        const p2 = this.ctx.player;
        let hit = false;
        if (p2 && burst.hits < 5) {
          const dx = bolt.position.x - p2.position.x;
          const dy = bolt.position.y - (p2.position.y + 1.0);
          const dz = bolt.position.z - p2.position.z;
          hit = dx * dx + dy * dy + dz * dz < 1.2;
        }
        const gy = terrain.getHeight(bolt.position.x, bolt.position.z);
        if (hit || bolt.position.y <= gy + 0.08 || flown > dist + 6) {
          if (hit) {
            burst.hits += 1;
            this.ctx.events.emit('player-damage', { amount: 4, from: this });
          }
          _v.set(bolt.position.x, Math.max(bolt.position.y, gy) + 0.15, bolt.position.z);
          this._sparkBurst(_v, 4, 0xff6a3a);
          this.ctx.scene.remove(bolt);
          mat.dispose();
          return false;
        }
        return true;
      },
    });
  }

  /** Claw swipe: torso wheels through, one big paw slap. */
  _clawSwipe() {
    return {
      kind: 'claw',
      windup: 0.38, strike: 0.16, recover: 0.6, cooldown: 1.4,
      onStrike: () => {
        if (this.damagePlayer(12, 3.8, 0.1)) this.knockbackPlayer(6);
      },
      onUpdate: (a) => {
        // AUTHORED LIMB KEYFRAMES (machine-rig-08, gate V27): LF rears off
        // the ground through the windup and slaps down on the strike, with
        // the snout dropping onto the target line.
        const pose = this.gait.pose;
        let y;
        if (a.phase === 'windup') y = a.phaseT * 0.5;
        else if (a.phase === 'strike') y = 0.5 - a.phaseT * 1.1;
        else y = -0.6 + 0.6 * a.phaseT;
        this.body.rotation.y = y * 0.5;
        pose.spineYaw = y * 0.7;
        if (a.phase === 'windup') {
          pose.legLift[0] = a.phaseT;
          pose.crouch = 0.15 + 0.3 * a.phaseT;
          pose.headPitch = 0.22 * a.phaseT;
        } else if (a.phase === 'strike') {
          pose.legLift[0] = Math.max(0, 1 - a.phaseT * 3);
          pose.crouch = 0.45 - 0.3 * a.phaseT;
          pose.headPitch = 0.22 - 0.4 * a.phaseT;
        } else {
          pose.legLift[0] = 0;
          pose.crouch = 0.15 * (1 - a.phaseT);
          pose.headPitch = -0.18 * (1 - a.phaseT);
        }
      },
      cleanup: () => {
        this.body.rotation.y = 0;
        const pose = this.gait.pose;
        pose.spineYaw = 0; pose.crouch = 0; pose.headPitch = 0; pose.legLift[0] = 0;
      },
    };
  }

  animate(dt, t) {
    if (this.state === 'dead') return;
    // perf-tech-04: LOD ring. Past ~40 body heights the rig runs phase-only
    // (machine-rig-17) so a tall machine still strides on the far ridge.
    if (updateRigLOD(this) >= 3) { this.gait.updateCheap(dt, t); return; }
    // scan pose: crane up, slight strut freeze handled in _statePatrol
    if (!this._attack) {
      const scanK = this._scanning > 0 ? 1 : 0;
      this.gait.pose.headPitch = THREE.MathUtils.damp(
        this.gait.pose.headPitch, -0.28 * scanK, 6, dt);
    }
    this.gait.update(dt, t);
  }
}

Scrapper._boltGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
Scrapper._up = new THREE.Vector3(0, 1, 0);
