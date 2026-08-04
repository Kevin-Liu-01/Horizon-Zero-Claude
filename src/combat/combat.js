import * as THREE from 'three';
import { ParticlePool } from './particles.js';
import { ArrowPool } from './arrows.js';
import { Bow } from './bow.js';

/**
 * Bow combat: draw/loose, arrow projectiles, aim assist, aim FOV zoom,
 * hit FX (sparks / dirt / hitstop / camera kick). Emits 'arrow-fired' and
 * 'arrow-hit' per the interface contract.
 */

const DRAW_TIME = 0.9;       // seconds to full draw
const MIN_LOOSE = 0.15;      // below this, release cancels
const FOV_HIP = 55;
const FOV_AIM = 44;

// saturated hot-metal oranges; the spark pool normal-blends with a white-hot
// core so these hues hold up against bright sky instead of washing out
const SPARK_COLORS = [
  [1.0, 0.55, 0.08], [1.0, 0.40, 0.03], [1.0, 0.68, 0.16], [0.95, 0.28, 0.01],
];
const SHOCK_COLORS = [[0.30, 0.80, 1.0], [0.55, 0.90, 1.0], [0.15, 0.55, 1.0]];
const EMBER_COLORS = [[1.0, 0.50, 0.10], [1.0, 0.32, 0.05], [1.0, 0.70, 0.22]];
const DIRT_COLORS = [[0.42, 0.34, 0.22], [0.52, 0.43, 0.28], [0.35, 0.28, 0.18]];

const _zero = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _chest = new THREE.Vector3();
const _pbDir = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _aimDir = new THREE.Vector3();
const _neg = new THREE.Vector3();
const _spawn = new THREE.Vector3();
const _fireDir = new THREE.Vector3();
const _p = new THREE.Vector3();
const _oc = new THREE.Vector3();
const _wp = new THREE.Vector3();
const _ws = new THREE.Vector3();
const _wq = new THREE.Quaternion();
const _qDes = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _ray = new THREE.Raycaster();

const AIM_RADII = { watcher: 2.6, sawtooth: 3.6, behemoth: 5.2, thunderjaw: 10 };
const AIM_CY = { watcher: 1.0, sawtooth: 1.2, behemoth: 2.2, thunderjaw: 3.6 };
const AIM_MAGNET = 1.15; // soft-lock: max miss distance (m) the assist absorbs

export class Combat {
  constructor(ctx) {
    this.ctx = ctx;

    // --- public contract surface
    this.arrowType = 'hunter';                 // 'hunter' | 'fire' | 'shock'
    this.arrowCounts = { hunter: Infinity, fire: 24, shock: 24 };
    this.drawStrength = 0;                     // 0..1, animator reads this
    this.aimPoint = new THREE.Vector3();       // camera-ray world hit (crosshair-true)

    // --- FX pools (GPU-integrated instanced quads; 3 draw calls total)
    this.sparks = new ParticlePool(ctx.scene, {
      max: 320, gravity: 13, drag: 2.4, opacity: 1,
      blending: THREE.NormalBlending, core: 0.35,
    });
    this.trail = new ParticlePool(ctx.scene, { max: 512, gravity: 0.4, drag: 4.5, opacity: 0.55 });
    this.dirt = new ParticlePool(ctx.scene, {
      max: 256, gravity: 6.5, drag: 1.7, blending: THREE.NormalBlending, opacity: 0.85,
    });

    this.arrows = new ArrowPool(ctx, this.trail);
    this.arrows.onImpact = (hit) => this._onImpact(hit);

    // --- bow, parented to the left hand (defensive: animator may be a stub)
    this.bow = new Bow();
    this.bow.group.visible = false;
    const anim = ctx.player?.animator;
    let node = null;
    try { node = anim?.handAttach?.('l') ?? null; } catch { node = null; }
    if (!node) node = anim?.bones?.['hand_l_014'] ?? null;
    if (!node) {
      node = new THREE.Group();
      node.position.set(0.3, 1.32, 0.22); // hand height fallback on the model root
      (ctx.player?.model ?? ctx.scene).add(node);
    }
    node.add(this.bow.group);
    this._bowNode = node;

    // --- state
    this._drawing = false;
    this._bowVis = 0;
    this._nockType = 'hunter';
    this._lastT = 0;
    this._hsActive = false;   // hitstop
    this._hsEnd = 0;

    ctx.input.onDown('Digit1', () => { this.arrowType = 'hunter'; });
    ctx.input.onDown('Digit2', () => { this.arrowType = 'fire'; });
    ctx.input.onDown('Digit3', () => { this.arrowType = 'shock'; });

    ctx.events.on('player-died', () => this._reset());
  }

  _reset() {
    this._drawing = false;
    this.drawStrength = 0;
    if (this._hsActive) { this.ctx.engine.timeScale = 1; this._hsActive = false; }
  }

  _hasAmmo(type) { return (this.arrowCounts[type] ?? 0) > 0; }

  update(dt, t) {
    const ctx = this.ctx;
    const realDt = Math.min(0.05, Math.max(0, t - this._lastT));
    this._lastT = t;

    this.sparks.update(t);
    this.trail.update(t);
    this.dirt.update(t);

    // hitstop restore runs on REAL time so timeScale can never wedge low
    if (this._hsActive && t >= this._hsEnd) {
      ctx.engine.timeScale = 1;
      this._hsActive = false;
    }

    const playing = ctx.state === 'playing' || ctx.params.has('shot');
    const player = ctx.player;
    const aiming = playing && !!player?.aiming;

    // --- aim FOV zoom (real dt so hitstop doesn't freeze the ease)
    const cam = ctx.camera;
    const targetFov = aiming ? FOV_AIM : FOV_HIP;
    const f = THREE.MathUtils.damp(cam.fov, targetFov, 9, realDt);
    if (Math.abs(f - cam.fov) > 0.0005) {
      cam.fov = f;
      cam.updateProjectionMatrix();
    }

    if (aiming) this._updateAimPoint();

    // --- draw / loose
    const lmb = playing && ctx.input.mouseDown(0);
    if (aiming && lmb) {
      if (!this._drawing && this._hasAmmo(this.arrowType)) {
        this._drawing = true;
        this.drawStrength = 0;
      }
      if (this._drawing) {
        this.drawStrength = Math.min(1, this.drawStrength + dt / DRAW_TIME);
      }
    } else {
      if (this._drawing && aiming && this.drawStrength > MIN_LOOSE) this._fire();
      this._drawing = false;
      this.drawStrength = 0;
    }
    if (player) player.drawStrength = this.drawStrength; // contract: animator reads it

    // --- bow visibility (scale-in) + world-space orientation while aiming
    this._bowVis = THREE.MathUtils.damp(this._bowVis, aiming ? 1 : 0, 14, realDt);
    const vis = this._bowVis;
    this.bow.group.visible = vis > 0.02;
    if (this.bow.group.visible) {
      if (this._nockType !== this.arrowType) {
        this.bow.setArrowType(this.arrowType);
        this._nockType = this.arrowType;
      }
      this.bow.setDraw(this.drawStrength, this._hasAmmo(this.arrowType));

      const node = this._bowNode;
      node.updateWorldMatrix(true, false);
      node.matrixWorld.decompose(_wp, _wq, _ws);
      _aimDir.subVectors(this.aimPoint, _wp);
      if (!aiming || _aimDir.lengthSq() < 0.25) cam.getWorldDirection(_aimDir);
      _aimDir.normalize();
      _m.lookAt(_zero, _neg.copy(_aimDir).negate(), _up); // basis +Z = aim dir
      _qDes.setFromRotationMatrix(_m);
      _wq.invert();
      this.bow.group.quaternion.copy(_wq.multiply(_qDes));
      // cancel skeleton scale so the bow stays in meters; vis drives scale-in
      this.bow.group.scale.set(
        vis / Math.max(1e-6, _ws.x),
        vis / Math.max(1e-6, _ws.y),
        vis / Math.max(1e-6, _ws.z),
      );
    }

    this.arrows.update(dt, t);
  }

  /* --------------------------- aim assist ray ---------------------------- */

  _updateAimPoint() {
    const ctx = this.ctx;
    const cam = ctx.camera;
    cam.getWorldDirection(_camDir);
    let best = 220;

    const terr = ctx.terrain;
    if (terr) {
      const step = 3;
      let prev = 0;
      for (let s = step; s <= 220; s += step) {
        _p.copy(cam.position).addScaledVector(_camDir, s);
        if (_p.y <= terr.getHeight(_p.x, _p.z)) {
          let lo = prev, hi = s;
          for (let i = 0; i < 7; i++) {
            const mid = (lo + hi) / 2;
            _p.copy(cam.position).addScaledVector(_camDir, mid);
            if (_p.y > terr.getHeight(_p.x, _p.z)) lo = mid; else hi = mid;
          }
          best = hi;
          break;
        }
        prev = s;
      }
    }

    const machines = ctx.machines?.list;
    let hitMachine = false;
    if (machines) {
      for (const m of machines) {
        if (m.alive === false || !m.root) continue;
        const r = AIM_RADII[m.kind] ?? 2.5;
        _oc.copy(m.position).sub(cam.position);
        const tAlong = _oc.dot(_camDir);
        if (tAlong < 0 || tAlong > best + r) continue;
        _p.copy(cam.position).addScaledVector(_camDir, tAlong);
        if (_p.distanceTo(m.position) > r + 2.5) continue; // generous: centers are at feet
        _ray.camera = cam; // machines may contain Sprites (eye glows)
        _ray.set(cam.position, _camDir);
        _ray.near = 0.1;
        _ray.far = best;
        const hits = _ray.intersectObject(m.root, true);
        if (hits.length && hits[0].distance < best) { best = hits[0].distance; hitMachine = true; }
      }

      // soft-lock magnetism: slim machines (watcher neck gaps etc.) let the
      // exact center ray slip through; if it hit nothing, snap to the machine
      // whose body center passes within AIM_MAGNET of the crosshair ray.
      if (!hitMachine) {
        let bestM = null, bestOff = AIM_MAGNET;
        for (const m of machines) {
          if (m.alive === false || !m.root) continue;
          _oc.copy(m.position);
          _oc.y += AIM_CY[m.kind] ?? 1.2;
          _oc.sub(cam.position);
          const tAlong = _oc.dot(_camDir);
          if (tAlong < 2 || tAlong > best + 2) continue;
          _p.copy(cam.position).addScaledVector(_camDir, tAlong);
          _oc.add(cam.position); // back to world center
          const off = _p.distanceTo(_oc);
          if (off < bestOff) { bestOff = off; bestM = m; }
        }
        if (bestM) {
          _oc.copy(bestM.position);
          _oc.y += AIM_CY[bestM.kind] ?? 1.2;
          _p.subVectors(_oc, cam.position).normalize();
          _ray.camera = cam;
          _ray.set(cam.position, _p);
          _ray.near = 0.1;
          _ray.far = best + (AIM_RADII[bestM.kind] ?? 2.5);
          const hits = _ray.intersectObject(bestM.root, true);
          if (hits.length) {
            this.aimPoint.copy(hits[0].point);
            return;
          }
        }
      }
    }

    this.aimPoint.copy(cam.position).addScaledVector(_camDir, best);
  }

  /* ------------------------------- firing -------------------------------- */

  _fire() {
    const ctx = this.ctx;
    const type = this.arrowType;
    if (!this._hasAmmo(type)) return;
    const ds = this.drawStrength;
    const baseDamage = type === 'hunter' ? 30 * ds : type === 'fire' ? 18 : 16;

    // --- point-blank guarantee: machines park in melee range, where the nock
    // spawns inside/behind their mesh and a single-sided raycast exits through
    // backfaces without ever hitting. Sweep chest -> aim direction BEFORE
    // spawning; a machine surface within ~2.6m becomes an immediate hit.
    if (this._pointBlankHit(type, baseDamage, ds)) return;

    const speed = 28 + ds * 34;
    this.bow.getNockWorld(ds, _spawn);
    _fireDir.subVectors(this.aimPoint, _spawn);
    // crosshair-true: compensate ballistic drop over the flight time.
    // tof capped so distant terrain aim points don't lob the arrow skyward.
    const dist = _fireDir.length();
    if (dist > 1e-3) {
      const tof = Math.min(dist / speed, 1.1);
      _fireDir.y += 0.5 * 9.8 * tof * tof * (1 + 0.05 * tof); // + slight drag allowance
    }
    ctx.camera.getWorldDirection(_camDir);
    if (_fireDir.lengthSq() < 1e-4 || _fireDir.dot(_camDir) <= 0) _fireDir.copy(_camDir);
    _fireDir.normalize();

    this.arrows.fire(_spawn, _fireDir, speed, type, baseDamage, ds);
    this._afterLoose(type, ds);
  }

  _afterLoose(type, ds) {
    if (type !== 'hunter') this.arrowCounts[type] -= 1;
    // tiny camera kick upward
    const p = this.ctx.player;
    if (p) {
      p.camPitch -= 0.006 + 0.012 * ds;
      p.camYaw += (Math.random() - 0.5) * 0.004;
    }
    this.ctx.events.emit('arrow-fired', { type, drawStrength: ds });
  }

  /**
   * Segment-test chest -> aim point against nearby machines; if a surface is
   * within PB_RANGE, plant a stuck arrow there and apply the hit immediately.
   * Returns true when the shot was consumed.
   */
  _pointBlankHit(type, baseDamage, ds) {
    const ctx = this.ctx;
    const player = ctx.player;
    const machines = ctx.machines?.list;
    if (!player || !machines) return false;

    const PB_RANGE = 2.6;
    _chest.copy(player.position);
    _chest.y += 1.35;
    _pbDir.subVectors(this.aimPoint, _chest);
    if (_pbDir.lengthSq() < 1e-6) ctx.camera.getWorldDirection(_pbDir);
    _pbDir.normalize();

    let bestD = PB_RANGE, bestHit = null, bestM = null;
    for (const m of machines) {
      if (m.alive === false || !m.root) continue;
      const r = AIM_RADII[m.kind] ?? 2.5;
      if (m.position.distanceTo(_chest) > r + PB_RANGE + 2) continue;
      _ray.camera = ctx.camera; // machines may contain Sprites (eye glows)
      _ray.set(_chest, _pbDir);
      _ray.near = 0;
      _ray.far = bestD;
      const hits = _ray.intersectObject(m.root, true);
      if (hits.length && hits[0].distance < bestD) {
        bestD = hits[0].distance;
        bestHit = hits[0];
        bestM = m;
      }
    }
    if (!bestHit) return false;

    this.arrows.stickImmediate(bestHit.point, _pbDir, type, bestM);
    this._afterLoose(type, ds);
    this._onImpact({
      point: bestHit.point,
      normal: _neg.copy(_pbDir).negate(),
      dir: _pbDir,
      object: bestHit.object,
      machine: bestM,
      type,
      baseDamage,
      draw: ds,
    });
    return true;
  }

  /* ------------------------------- impacts ------------------------------- */

  _startHitstop() {
    const e = this.ctx.engine;
    if (!this._hsActive) {
      e.timeScale = 0.02;
      this._hsActive = true;
    }
    this._hsEnd = this._lastT + 0.04; // 40ms of real time
  }

  _onImpact(hit) {
    const ctx = this.ctx;

    // resolve owning machine via userData.machine anywhere up the chain
    let machine = null;
    let o = hit.object;
    while (o) {
      if (o.userData?.machine) { machine = o.userData.machine; break; }
      o = o.parent;
    }
    if (!machine) machine = hit.machine ?? null;

    let res = null;
    if (machine && typeof machine.takeDamage === 'function') {
      res = machine.takeDamage({
        point: hit.point.clone(),
        object: hit.object,
        baseDamage: hit.baseDamage,
        type: hit.type,
        dir: hit.dir.clone(),
      });
    }
    const damage = machine ? Math.round(res?.damage ?? hit.baseDamage) : 0;
    const weak = !!res?.weak;
    const player = ctx.player;

    if (machine) {
      // fast, small, saturated grinder sparks — snappy, not confetti
      this.sparks.burst(hit.point, hit.normal, {
        count: weak ? 24 : 15,
        speed: [8, 16],
        spread: 0.55,
        size: [0.04, 0.12],
        life: [0.12, 0.3],
        colors: SPARK_COLORS,
      });
      // stretched streak variant: thin hot lines whipping off the plate
      this.sparks.burst(hit.point, hit.normal, {
        count: weak ? 14 : 9,
        speed: [10, 18],
        spread: 0.45,
        size: [0.028, 0.055],
        life: [0.1, 0.26],
        colors: SPARK_COLORS,
        stretch: [3, 6],
      });
      // short bright core flash so hits read at combat distance
      this.sparks.burst(hit.point, hit.normal, {
        count: 3, speed: [0.1, 0.6], spread: 1,
        size: [0.3, weak ? 0.7 : 0.5], life: [0.05, 0.11],
        colors: [[1, 0.9, 0.7]],
      });
      if (hit.type === 'shock') {
        this.sparks.burst(hit.point, hit.normal, {
          count: 12, speed: [4, 10], spread: 0.9,
          size: [0.06, 0.16], life: [0.1, 0.3], colors: SHOCK_COLORS,
          stretch: [1, 3],
        });
      }
      if (weak) {
        this._startHitstop(); // 40ms, restored on real time
        if (player) player._shake = Math.min(1, (player._shake ?? 0) + 0.22);
      } else if (player) {
        player._shake = Math.min(1, (player._shake ?? 0) + 0.05);
      }
    } else {
      this.dirt.burst(hit.point, hit.normal, {
        count: 14, speed: [0.8, 3.2], spread: 1.0,
        size: [0.35, 0.75], life: [0.35, 0.8], colors: DIRT_COLORS,
      });
      if (hit.type === 'fire') {
        this.sparks.burst(hit.point, hit.normal, {
          count: 8, speed: [1, 4], spread: 0.8,
          size: [0.06, 0.14], life: [0.2, 0.5], colors: EMBER_COLORS,
        });
      }
    }

    ctx.events.emit('arrow-hit', {
      point: hit.point.clone(),
      machine,
      damage,
      weak,
      type: hit.type,
    });
  }
}
