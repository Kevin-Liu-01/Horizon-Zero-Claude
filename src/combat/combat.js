import * as THREE from 'three';
import { ParticlePool } from './particles.js';
import { ArrowPool, BombPool } from './arrows.js';
import { buildWeaponModel } from './bow.js';
import { AMMO, WEAPON_DEFS, DISC_LAUNCHER_DEF } from './weapons.js';

/**
 * Weapon system v2 (spec "Weapons contract"): 4-weapon roster with distinct
 * draw feel, three-channel damage (impact / tear / elemental), ammo economy +
 * craft-anywhere, Concentration slow-mo, blast-sling lobbed bombs with a
 * dotted trajectory preview, and the Disc Launcher heavy pickup.
 *
 * Public surface (other builders code against this blind):
 *   weapons: Weapon[]           activeWeapon, setWeapon(slotOrId)
 *   cycleAmmo(dir), selectAmmo(weaponId, ammoId)
 *   craftAmmo(ammoId?), recipeStatus(ammoId), ammoCount(id), ammo {id:n}
 *   arrowCounts (legacy alias of ammo), arrowType (legacy)
 *   drawStrength 0..1, aimPoint, bow (active model), ammoDefs
 *   concentration { active, gauge 0..1 }
 *   grantWeapon('disc-launcher', shots)
 * Events: 'arrow-fired' {type, drawStrength, weapon}, 'arrow-hit' {...},
 *   'weapon-switch' {weapon}, 'ammo-crafted' {ammo, n},
 *   'concentration-start' / 'concentration-end'.
 */

const MIN_LOOSE = 0.15;      // below this, release cancels
const FOV_HIP = 55;
const CONC_TIME = 6;         // seconds of Concentration drain (and refill)
const CONC_TIMESCALE = 0.35;

// Stowed carry (HZD: Aloy always wears her bow diagonally across the back).
// Offsets are in character space (+Z forward, y up from feet, +X = her left),
// converted into spine-bone space once at bind pose in _initStow().
const STOW_POS = { x: 0.10, y: 1.30, z: -0.17 }; // grip up-left on the back
const STOW_TILT = -0.62;  // roll about the back normal: limbs run diagonal
const STOW_LEAN = -0.10;  // hug the back plane slightly

// saturated hot-metal oranges; the spark pool normal-blends with a white-hot
// core so these hues hold up against bright sky instead of washing out
const SPARK_COLORS = [
  [1.0, 0.55, 0.08], [1.0, 0.40, 0.03], [1.0, 0.68, 0.16], [0.95, 0.28, 0.01],
];
const SHOCK_COLORS = [[0.30, 0.80, 1.0], [0.55, 0.90, 1.0], [0.15, 0.55, 1.0]];
const FREEZE_COLORS = [[0.75, 0.90, 1.0], [0.88, 0.96, 1.0], [0.55, 0.80, 1.0]];
const TEAR_COLORS = [[0.35, 0.95, 0.9], [0.6, 1.0, 0.95], [0.2, 0.7, 0.75]];
const EMBER_COLORS = [[1.0, 0.50, 0.10], [1.0, 0.32, 0.05], [1.0, 0.70, 0.22]];
const DIRT_COLORS = [[0.42, 0.34, 0.22], [0.52, 0.43, 0.28], [0.35, 0.28, 0.18]];
const SMOKE_COLORS = [[0.30, 0.27, 0.24], [0.22, 0.20, 0.18], [0.38, 0.34, 0.30]];

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
const _pw = new THREE.Vector3();
const _simP = new THREE.Vector3();
const _simV = new THREE.Vector3();
const _losDir = new THREE.Vector3();
const _wq = new THREE.Quaternion();
const _qDes = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _ray = new THREE.Raycaster();

const AIM_RADII = { watcher: 2.6, sawtooth: 3.6, behemoth: 5.2, thunderjaw: 10 };
const AIM_CY = { watcher: 1.0, sawtooth: 1.2, behemoth: 2.2, thunderjaw: 3.6 };
const AIM_MAGNET = 1.15; // soft-lock: max miss distance (m) the assist absorbs

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/* --------------------- pooled explosion ring / flash ---------------------- */

class BlastFxPool {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    for (let i = 0; i < 3; i++) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffd9a0, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      ring.raycast = () => {};
      const flashMat = new THREE.MeshBasicMaterial({
        color: 0xffe8c0, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      });
      const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), flashMat);
      flash.visible = false;
      flash.raycast = () => {};
      scene.add(ring, flash);
      this.items.push({ ring, ringMat, flash, flashMat, t: 1e9, dur: 0.5, radius: 3 });
    }
    this.cursor = 0;
  }

  spawn(point, groundY, radius, color) {
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    it.t = 0;
    it.dur = 0.45;
    it.radius = radius;
    it.ringMat.color.set(color);
    it.flashMat.color.set(color);
    it.ring.position.set(point.x, groundY + 0.25, point.z);
    it.flash.position.copy(point);
    it.ring.visible = true;
    it.flash.visible = true;
  }

  update(dt) {
    for (const it of this.items) {
      if (it.t > it.dur) {
        if (it.ring.visible) { it.ring.visible = false; it.flash.visible = false; }
        continue;
      }
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      const r = 0.4 + (it.radius - 0.4) * Math.pow(k, 0.55);
      it.ring.scale.set(r, r, 2.4);
      it.ringMat.opacity = 0.85 * (1 - k);
      const fr = 0.3 + it.radius * 0.55 * Math.pow(k, 0.4);
      it.flash.scale.setScalar(fr);
      it.flashMat.opacity = 0.7 * (1 - k) * (1 - k);
    }
  }
}

/* --------------------------------- combat --------------------------------- */

export class Combat {
  constructor(ctx) {
    this.ctx = ctx;

    // --- ammo economy
    this.ammoDefs = AMMO;
    this.ammo = {};
    for (const id in AMMO) this.ammo[id] = AMMO[id].start;
    this.arrowCounts = this.ammo; // legacy alias (round-1 HUD reads it)

    // --- weapon roster (spec v2 Weapon objects)
    this.weapons = WEAPON_DEFS.map((d) => {
      const w = {
        ...d,
        ammoTypes: d.ammoTypes.map((id) => AMMO[id]),
        activeAmmo: d.ammoTypes[0],
      };
      w.draw = () => { this._extDraw = true; };
      w.loose = () => { this._extDraw = false; };
      return w;
    });
    this._weaponIndex = 0;
    this._discWeapon = {
      ...DISC_LAUNCHER_DEF,
      ammoTypes: DISC_LAUNCHER_DEF.ammoTypes.map((id) => AMMO[id]),
      activeAmmo: 'disc',
      draw: () => {},
      loose: () => {},
    };
    this._disc = null;       // { shots } while the heavy weapon is held
    this._discDropT = 0;
    this._discCd = 0;

    // --- public state
    this.drawStrength = 0;                     // 0..1, animator reads this
    this.aimPoint = new THREE.Vector3();       // camera-ray world hit
    this.concentration = { active: false, gauge: 1 };

    // --- FX pools (GPU-instanced quads; few draw calls total)
    this.sparks = new ParticlePool(ctx.scene, {
      max: 400, gravity: 13, drag: 2.4, opacity: 1,
      blending: THREE.NormalBlending, core: 0.35,
    });
    this.trail = new ParticlePool(ctx.scene, { max: 512, gravity: 0.4, drag: 4.5, opacity: 0.55 });
    this.dirt = new ParticlePool(ctx.scene, {
      max: 256, gravity: 6.5, drag: 1.7, blending: THREE.NormalBlending, opacity: 0.85,
    });
    this.smoke = new ParticlePool(ctx.scene, {
      max: 160, gravity: -1.4, drag: 1.6, blending: THREE.NormalBlending, opacity: 0.42,
    });
    this.blastFx = new BlastFxPool(ctx.scene);

    this.arrows = new ArrowPool(ctx, this.trail);
    this.arrows.onImpact = (hit) => this._handleImpact(hit);
    this.bombs = new BombPool(ctx, this.trail, 8, 'blast-bomb');
    this.bombs.onImpact = (hit) => this._handleImpact(hit);
    this.discs = new BombPool(ctx, this.trail, 6, 'disc');
    this.discs.onImpact = (hit) => this._handleImpact(hit);

    // --- weapon models, parented to the left hand (defensive: animator stub)
    const anim = ctx.player?.animator;
    let node = null;
    try { node = anim?.handAttach?.('l') ?? null; } catch { node = null; }
    if (!node) node = anim?.bones?.['hand_l_014'] ?? null;
    if (!node) {
      node = new THREE.Group();
      node.position.set(0.3, 1.32, 0.22); // hand height fallback on the model root
      (ctx.player?.model ?? ctx.scene).add(node);
    }
    this._bowNode = node;
    this._models = {};
    for (const id of ['hunter-bow', 'sharpshot-bow', 'war-bow', 'blast-sling', 'disc-launcher']) {
      const model = buildWeaponModel(id);
      model.group.visible = false;
      node.add(model.group);
      this._models[id] = model;
    }
    this.bow = this._models['hunter-bow'];

    // stowed-carry calibration (bow across the back when not wielded) —
    // computed at bind pose, before the animator has posed the skeleton
    this._stow = null;
    this._initStow();

    // --- trajectory preview (blast sling): dotted arc + landing ring
    const MAXDOTS = 48;
    const trajGeo = new THREE.BufferGeometry();
    trajGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXDOTS * 3), 3));
    trajGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this._trajMax = MAXDOTS;
    this._trajPts = new THREE.Points(trajGeo, new THREE.PointsMaterial({
      color: 0xffe2b0, size: 0.22, sizeAttenuation: true, map: dotTexture(),
      transparent: true, opacity: 1, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this._trajPts.visible = false;
    this._trajPts.frustumCulled = false;
    this._trajPts.renderOrder = 15;
    this._trajPts.raycast = () => {};
    ctx.scene.add(this._trajPts);
    this._landRing = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.016, 6, 40),
      new THREE.MeshBasicMaterial({
        color: 0xd4581a, transparent: true, opacity: 0.85,
        depthWrite: false,
      }),
    );
    this._landRing.rotation.x = -Math.PI / 2;
    this._landRing.visible = false;
    this._landRing.raycast = () => {};
    ctx.scene.add(this._landRing);

    // --- state
    this._drawing = false;
    this._extDraw = false;
    this._bowVis = 0;
    this._nockType = null;
    this._lastT = 0;
    this._fxT = 0;            // scaled FX clock: slow-mo slows particles too
    this._hsActive = false;   // hitstop
    this._hsEnd = 0;
    this._lmbPrev = false;
    this._concHeldPrev = false;
    this._pickupClock = 0;

    // --- input (keybinds v2) — all gated by state so nothing equips/cycles
    //     underneath the pause menu / death screen
    const wheelOpen = () => !!ctx.wheel?.open;
    const inPlay = () => ctx.state === 'playing' || ctx.params.has('shot');
    for (let s = 1; s <= 4; s++) {
      ctx.input.onDown(`Digit${s}`, () => {
        if (wheelOpen()) ctx.wheel?.hoverSlot?.(s);
        else if (inPlay()) this.setWeapon(s);
      });
    }
    ctx.input.onDown('KeyZ', () => { if (!wheelOpen() && inPlay()) this.cycleAmmo(-1); });
    ctx.input.onDown('KeyX', () => { if (!wheelOpen() && inPlay()) this.cycleAmmo(1); });
    ctx.input.onDown('KeyR', () => {
      if (!wheelOpen() && this.ctx.state === 'playing') this.craftAmmo();
    });

    ctx.events.on('player-died', () => this._reset());
    // defensive cross-builder wiring: any of these grants the heavy weapon
    const grantFromEvent = (e) => {
      const id = e?.pickupWeapon ?? e?.weapon ?? e?.id;
      if (id === 'disc-launcher' || id?.id === 'disc-launcher') {
        this.grantWeapon('disc-launcher');
      }
    };
    ctx.events.on('weapon-pickup', grantFromEvent);
    ctx.events.on('pickup-weapon', grantFromEvent);
  }

  /* ------------------------- weapon / ammo surface ------------------------ */

  get activeWeapon() {
    return this._disc ? this._discWeapon : this.weapons[this._weaponIndex];
  }

  /** Legacy round-1 field: the active ammo id. */
  get arrowType() { return this.activeWeapon?.activeAmmo ?? 'hunter'; }
  set arrowType(id) {
    for (const w of this.weapons) {
      if (w.ammoTypes.some((a) => a?.id === id)) {
        this.setWeapon(w.id);
        w.activeAmmo = id;
        return;
      }
    }
  }

  ammoCount(id) { return this.ammo[id] ?? 0; }
  _hasAmmo(id) { return (this.ammo[id] ?? 0) > 0; }

  setWeapon(slotOrId, { silent = false } = {}) {
    if (slotOrId === 'disc-launcher' || slotOrId === 0) return; // pickup-only
    const idx = typeof slotOrId === 'number'
      ? this.weapons.findIndex((w) => w.slot === slotOrId)
      : this.weapons.findIndex((w) => w.id === slotOrId);
    if (idx < 0) return;
    const changed = idx !== this._weaponIndex || !!this._disc;
    if (this._disc) this._disc = null; // switching away drops the heavy weapon
    this._weaponIndex = idx;
    this._cancelDraw();
    this._applyWeaponModel();
    if (changed && !silent) {
      this.ctx.events.emit('weapon-switch', { weapon: this.activeWeapon });
    }
  }

  cycleAmmo(dir = 1, weapon = null) {
    const w = weapon ?? this.activeWeapon;
    if (!w || !Array.isArray(w.ammoTypes) || w.ammoTypes.length < 2) return w?.activeAmmo;
    const ids = w.ammoTypes.map((a) => a?.id).filter(Boolean);
    const i = Math.max(0, ids.indexOf(w.activeAmmo));
    w.activeAmmo = ids[(i + dir + ids.length) % ids.length];
    if (w === this.activeWeapon) this._cancelDraw();
    return w.activeAmmo;
  }

  selectAmmo(weaponId, ammoId) {
    const w = this.weapons.find((x) => x.id === weaponId)
      ?? (weaponId === 'disc-launcher' ? this._discWeapon : null);
    if (!w) return false;
    if (!w.ammoTypes.some((a) => a?.id === ammoId)) return false;
    w.activeAmmo = ammoId;
    return true;
  }

  /** Recipe availability for UI: [{ id, need, have, ok }]. */
  recipeStatus(ammoId) {
    const def = AMMO[ammoId];
    if (!def?.recipe) return [];
    const inv = this.ctx.inventory;
    return def.recipe.map(([id, need]) => {
      const have = (inv?.count) ? inv.count(id) : Infinity;
      return { id, need, have, ok: have >= need };
    });
  }

  canCraft(ammoId) {
    const def = AMMO[ammoId];
    if (!def?.recipe || !def.batch) return false;
    if ((this.ammo[ammoId] ?? 0) >= def.cap) return false;
    return this.recipeStatus(ammoId).every((r) => r.ok);
  }

  craftAmmo(ammoId = this.activeWeapon?.activeAmmo) {
    const def = AMMO[ammoId];
    if (!def?.recipe || !def.batch) return false;
    const before = this.ammo[ammoId] ?? 0;
    if (before >= def.cap) return false;
    const inv = this.ctx.inventory;
    if (inv?.count && inv?.take) {
      for (const [id, n] of def.recipe) if (inv.count(id) < n) return false;
      for (const [id, n] of def.recipe) inv.take(id, n);
    }
    const added = Math.min(def.batch, def.cap - before);
    this.ammo[ammoId] = before + added;
    this.ctx.events.emit('ammo-crafted', { ammo: ammoId, n: added });
    return true;
  }

  /** Heavy pickup weapons (Thunderjaw disc launcher). */
  grantWeapon(id = 'disc-launcher', shots = DISC_LAUNCHER_DEF.shots) {
    if (id !== 'disc-launcher') return false;
    this._disc = { shots };
    this.ammo.disc = shots;
    this._discDropT = 0;
    this._cancelDraw();
    this._applyWeaponModel();
    this.ctx.events.emit('weapon-switch', { weapon: this.activeWeapon });
    return true;
  }

  _dropDisc(emit = true) {
    if (!this._disc) return;
    this._disc = null;
    this.ammo.disc = 0;
    this._applyWeaponModel();
    if (emit) this.ctx.events.emit('weapon-switch', { weapon: this.activeWeapon });
  }

  _applyWeaponModel() {
    const id = this.activeWeapon?.id ?? 'hunter-bow';
    for (const key in this._models) {
      if (key !== id) this._models[key].group.visible = false;
    }
    this.bow = this._models[id] ?? this._models['hunter-bow'];
    this._nockType = null; // force re-nock
    this._bowVis = Math.min(this._bowVis, 0.35); // small re-equip pop
  }

  _cancelDraw() {
    this._drawing = false;
    this.drawStrength = 0;
  }

  _reset() {
    this._cancelDraw();
    this._extDraw = false;
    this._hsActive = false;
    if (this.concentration.active) {
      this.concentration.active = false;
      this.ctx.events.emit('concentration-end');
    }
    if (this._disc) this._dropDisc(true);
    // unconditional: death must never inherit concentration/hitstop slow-mo
    this.ctx.engine.timeScale = 1;
  }

  /**
   * Calibrate the stowed-carry transform: where the active bow sits on
   * Aloy's back (spine bone space) when not wielded. Computed from the bind
   * pose so it tracks the spine through idle/run/crouch afterwards.
   */
  _initStow() {
    if (this._stow) return this._stow;
    const anim = this.ctx.player?.animator;
    const bone = anim?.bones?.['spine_03_08'] ?? null;
    const root = this.ctx.player?.model ?? null;
    if (!bone || !root) return null;
    try {
      root.updateWorldMatrix(true, true);
      const mP = new THREE.Vector3();
      const mQ = new THREE.Quaternion();
      const mS = new THREE.Vector3();
      root.matrixWorld.decompose(mP, mQ, mS);
      // desired grip point, character space -> world (offsets are meters)
      const grip = new THREE.Vector3(STOW_POS.x, STOW_POS.y, STOW_POS.z)
        .applyQuaternion(mQ).add(mP);
      // desired orientation: flip so the string faces her back, then a
      // diagonal tilt (limbs across the back) and a slight lean into it
      const qChar = new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      qChar.premultiply(new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 0, 1), STOW_TILT));
      qChar.premultiply(new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(1, 0, 0), STOW_LEAN));
      const qDes = mQ.clone().multiply(qChar);
      // world -> spine-bone local
      const boneInv = new THREE.Matrix4().copy(bone.matrixWorld).invert();
      const pos = grip.applyMatrix4(boneInv);
      const bQ = new THREE.Quaternion();
      bone.matrixWorld.decompose(new THREE.Vector3(), bQ, new THREE.Vector3());
      const quat = bQ.invert().multiply(qDes);
      this._stow = { bone, pos, quat };
    } catch {
      this._stow = null;
    }
    return this._stow;
  }

  /* --------------------------------- update ------------------------------- */

  update(dt, t) {
    const ctx = this.ctx;
    const realDt = Math.min(0.05, Math.max(0, t - this._lastT));
    this._lastT = t;

    // FX clock is SCALED time: slow-mo slows sparks, hitstop freezes them
    this._fxT += dt;
    this.sparks.update(this._fxT);
    this.trail.update(this._fxT);
    this.dirt.update(this._fxT);
    this.smoke.update(this._fxT);
    this.blastFx.update(dt);

    const playing = ctx.state === 'playing' || ctx.params.has('shot');
    const player = ctx.player;
    const aiming = playing && !!player?.aiming;
    const w = this.activeWeapon;
    const isDisc = w?.id === 'disc-launcher';

    // --- Concentration (real-time meter; the world slows, Aloy doesn't)
    this._updateConcentration(realDt, playing, aiming);

    // --- time scale authority (wheel > hitstop > concentration > 1)
    const wheelOpen = !!ctx.wheel?.open;
    if (this._hsActive && t >= this._hsEnd) {
      this._hsActive = false;
      if (!wheelOpen) ctx.engine.timeScale = this._tsTarget();
    }
    if (!wheelOpen && !this._hsActive) {
      const target = this._tsTarget();
      ctx.engine.timeScale = Math.abs(ctx.engine.timeScale - target) < 0.002
        ? target
        : THREE.MathUtils.damp(ctx.engine.timeScale, target, 9, realDt);
    }

    // --- aim FOV zoom per weapon (real dt so hitstop doesn't freeze the ease)
    const cam = ctx.camera;
    const aimFov = (w?.noZoom) ? FOV_HIP : (w?.aimFov ?? 44);
    const targetFov = aiming ? aimFov : FOV_HIP;
    const f = THREE.MathUtils.damp(cam.fov, targetFov, 9, realDt);
    if (Math.abs(f - cam.fov) > 0.0005) {
      cam.fov = f;
      cam.updateProjectionMatrix();
    }

    if (aiming) this._updateAimPoint();

    // --- draw / loose (bows + sling) or direct fire (disc launcher)
    const lmb = playing && (ctx.input.mouseDown(0) || this._extDraw) && !wheelOpen;
    const ammoId = w?.activeAmmo ?? 'hunter';
    if (isDisc) {
      this._drawing = false;
      this.drawStrength = 0;
      this._discCd = Math.max(0, this._discCd - realDt);
      if (aiming && lmb && !this._lmbPrev && this._discCd <= 0 && this._hasAmmo('disc')) {
        this._fireDisc();
      }
      // drop when empty (after the last disc has left)
      if (this._disc && this._disc.shots <= 0) {
        this._discDropT += realDt;
        if (this._discDropT > 1.1) this._dropDisc(true);
      }
    } else {
      const drawTime = Math.max(0.2, w?.drawTime ?? 0.7);
      if (aiming && lmb) {
        if (!this._drawing && this._hasAmmo(ammoId)) {
          this._drawing = true;
          this.drawStrength = 0;
        }
        if (this._drawing) {
          // draw builds in REAL time — drawing at full speed inside
          // Concentration slow-mo is the signature HZD moment
          this.drawStrength = Math.min(1, this.drawStrength + realDt / drawTime);
        }
      } else {
        // opening the wheel mid-draw CANCELS the shot instead of loosing it
        if (this._drawing && aiming && !wheelOpen && this.drawStrength > MIN_LOOSE) this._fire();
        this._drawing = false;
        this.drawStrength = 0;
      }
    }
    this._lmbPrev = lmb;
    if (player) player.drawStrength = this.drawStrength; // animator contract

    // --- weapon model placement: in the left hand while wielded, stowed
    //     across the back (spine bone) otherwise — Aloy always carries her
    //     bow like in HZD. The 14/s fade crossfades hand <-> back at 0.5.
    const wield = aiming || (isDisc && playing);
    this._bowVis = THREE.MathUtils.damp(this._bowVis, wield ? 1 : 0, 14, realDt);
    const vis = this._bowVis;
    const model = this.bow;
    if (wield || vis > 0.5) {
      this._placeInHand(model, vis, aiming, ammoId, cam);
    } else {
      this._placeOnBack(model, 1 - vis, isDisc);
    }

    // --- trajectory preview (lobbed weapons while aiming)
    const showTraj = aiming && !!w?.lob && this._hasAmmo(ammoId);
    if (showTraj) this._updateTrajectory(ammoId);
    if (this._trajPts.visible !== showTraj) {
      this._trajPts.visible = showTraj;
      this._landRing.visible = showTraj;
    }

    this.arrows.update(dt, this._fxT);
    this.bombs.update(dt, this._fxT);
    this.discs.update(dt, this._fxT);

    // --- heavy-pickup coordination (machines/items builders land blind)
    this._pollWeaponPickups(realDt);
  }

  /** Wielded: parent to the hand attach, orient +Z at the aim point. */
  _placeInHand(model, vis, aiming, ammoId, cam) {
    const node = this._bowNode;
    if (model.group.parent !== node) {
      node.add(model.group);
      model.group.position.set(0, 0, 0); // stow path moves it; hand is origin
      this._nockType = null;
    }
    model.group.visible = vis > 0.02;
    if (!model.group.visible) return;
    if (this._nockType !== ammoId) {
      model.setArrowType?.(ammoId);
      this._nockType = ammoId;
    }
    model.setDraw(this.drawStrength, this._hasAmmo(ammoId));

    node.updateWorldMatrix(true, false);
    node.matrixWorld.decompose(_wp, _wq, _ws);
    _aimDir.subVectors(this.aimPoint, _wp);
    if (!aiming || _aimDir.lengthSq() < 0.25) cam.getWorldDirection(_aimDir);
    _aimDir.normalize();
    _m.lookAt(_zero, _neg.copy(_aimDir).negate(), _up); // basis +Z = aim dir
    _qDes.setFromRotationMatrix(_m);
    _wq.invert();
    model.group.quaternion.copy(_wq.multiply(_qDes));
    // cancel skeleton scale so the weapon stays in meters; vis = scale-in
    model.group.scale.set(
      vis / Math.max(1e-6, _ws.x),
      vis / Math.max(1e-6, _ws.y),
      vis / Math.max(1e-6, _ws.z),
    );
  }

  /** Unwielded: ride the spine bone, diagonal across the back (HZD carry). */
  _placeOnBack(model, stowVis, isDisc) {
    const st = this._initStow();
    // the disc launcher is carried in-hands only — never on the back
    if (!st || isDisc) {
      model.group.visible = false;
      return;
    }
    if (model.group.parent !== st.bone) {
      st.bone.add(model.group);
      this._nockType = null;
    }
    model.group.visible = stowVis > 0.02;
    if (!model.group.visible) return;
    model.setDraw(0, false); // stowed bows carry no nocked arrow
    model.group.position.copy(st.pos);
    model.group.quaternion.copy(st.quat);
    st.bone.updateWorldMatrix(true, false);
    _ws.setFromMatrixScale(st.bone.matrixWorld);
    model.group.scale.set(
      stowVis / Math.max(1e-6, _ws.x),
      stowVis / Math.max(1e-6, _ws.y),
      stowVis / Math.max(1e-6, _ws.z),
    );
  }

  _tsTarget() { return this.concentration.active ? CONC_TIMESCALE : 1; }

  _updateConcentration(realDt, playing, aiming) {
    const c = this.concentration;
    const held = playing && aiming && this.ctx.input.isDown('ShiftLeft');
    if (!c.active) {
      // rising edge only: gauge running dry forces a re-press
      if (held && !this._concHeldPrev && c.gauge > 0.05) {
        c.active = true;
        this.ctx.events.emit('concentration-start');
      } else {
        c.gauge = Math.min(1, c.gauge + realDt / CONC_TIME);
      }
    }
    if (c.active) {
      c.gauge -= realDt / CONC_TIME;
      if (!held || c.gauge <= 0) {
        c.gauge = Math.max(0, c.gauge);
        c.active = false;
        this.ctx.events.emit('concentration-end');
      }
    }
    this._concHeldPrev = held;
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
        if (_p.distanceTo(m.position) > r + 2.5) continue; // centers are at feet
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

  /** Direction + speed toward aimPoint with ballistic drop compensation. */
  _computeShot(def, ds, spawn, outDir) {
    const speed = def.projectile === 'arrow'
      ? def.speed * (def.drawScaled ? 0.55 + 0.45 * ds : 0.8 + 0.2 * ds)
      : def.speed;
    outDir.subVectors(this.aimPoint, spawn);
    const dist = outDir.length();
    if (dist > 1e-3) {
      const g = def.projectile === 'disc' ? 5.5 : 9.8;
      const tofCap = def.projectile === 'arrow' ? 1.1 : def.projectile === 'disc' ? 1.2 : 1.6;
      const tof = Math.min(dist / speed, tofCap);
      outDir.y += 0.5 * g * tof * tof * (1 + 0.05 * tof); // + slight drag allowance
    }
    this.ctx.camera.getWorldDirection(_camDir);
    if (outDir.lengthSq() < 1e-4 || outDir.dot(_camDir) <= 0) outDir.copy(_camDir);
    outDir.normalize();
    return speed;
  }

  _fire() {
    const type = this.activeWeapon?.activeAmmo ?? 'hunter';
    const def = AMMO[type];
    if (!def || !this._hasAmmo(type)) return;
    const ds = this.drawStrength;

    // point-blank guarantee: machines park in melee range, where the nock
    // spawns inside/behind their mesh and a single-sided raycast exits through
    // backfaces without ever hitting. Sweep chest -> aim direction BEFORE
    // spawning; a machine surface within ~2.6m becomes an immediate hit.
    if (this._pointBlankHit(type, def, ds)) return;

    this.bow.getNockWorld(ds, _spawn);
    const speed = this._computeShot(def, ds, _spawn, _fireDir);

    if (def.projectile === 'bomb') this.bombs.fire(_spawn, _fireDir, speed, type);
    else if (def.projectile === 'disc') this.discs.fire(_spawn, _fireDir, speed, type);
    else this.arrows.fire(_spawn, _fireDir, speed, type, ds);
    this._afterLoose(type, ds);
  }

  _fireDisc() {
    const def = AMMO.disc;
    this._discCd = DISC_LAUNCHER_DEF.fireCooldown;
    this.bow.getNockWorld(1, _spawn);
    const speed = this._computeShot(def, 1, _spawn, _fireDir);
    this.discs.fire(_spawn, _fireDir, speed, 'disc');
    this.ammo.disc = Math.max(0, (this.ammo.disc ?? 1) - 1);
    if (this._disc) this._disc.shots = this.ammo.disc;
    const p = this.ctx.player;
    if (p) {
      p.camPitch -= 0.02;
      p._shake = Math.min(1, (p._shake ?? 0) + 0.18);
    }
    this.ctx.events.emit('arrow-fired', {
      type: 'disc', drawStrength: 1, weapon: 'disc-launcher',
    });
  }

  _afterLoose(type, ds) {
    if (this.ammo[type] != null && Number.isFinite(this.ammo[type])) {
      this.ammo[type] = Math.max(0, this.ammo[type] - 1);
    }
    // camera kick scales with the weapon's heft
    const heavy = type === 'precision' || type === 'tearblast' || type === 'blast-bomb';
    const p = this.ctx.player;
    if (p) {
      p.camPitch -= (0.006 + 0.012 * ds) * (heavy ? 1.5 : 1);
      p.camYaw += (Math.random() - 0.5) * 0.004;
    }
    this.ctx.events.emit('arrow-fired', {
      type, drawStrength: ds, weapon: this.activeWeapon?.id ?? 'hunter-bow',
    });
  }

  /**
   * Segment-test chest -> aim point against nearby machines; if a surface is
   * within PB_RANGE, resolve the hit immediately. Returns true when consumed.
   */
  _pointBlankHit(type, def, ds) {
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

    if (def.projectile === 'arrow') {
      this.arrows.stickImmediate(bestHit.point, _pbDir, type, bestM);
    }
    this._afterLoose(type, ds);
    this._handleImpact({
      point: bestHit.point,
      normal: _neg.copy(_pbDir).negate(),
      dir: _pbDir,
      object: bestHit.object,
      machine: bestM,
      type,
      draw: ds,
    });
    return true;
  }

  /* ------------------------------- impacts ------------------------------- */

  _startHitstop() {
    if (this.ctx.wheel?.open) return; // never fight the wheel's slow-mo
    const e = this.ctx.engine;
    if (!this._hsActive) {
      e.timeScale = 0.02;
      this._hsActive = true;
    }
    this._hsEnd = this._lastT + 0.04; // 40ms of real time
  }

  /** Build the three-channel hit for machine.takeDamage (v2 + legacy). */
  _buildHit(def, ds, point, object, dir) {
    const k = def.drawScaled ? 0.25 + 0.75 * ds : 1;
    const impact = (def.impact ?? 0) * k;
    return {
      point: point.clone(),
      object,
      dir: dir.clone(),
      impact,
      tear: (def.tear ?? 0) * k,
      element: def.element ?? 'none',
      elementAmount: def.elementAmount ?? 0,
      type: def.id,
      // legacy round-1 field so an un-upgraded Machine never breaks
      baseDamage: impact,
      draw: ds,
    };
  }

  _handleImpact(hit) {
    const ctx = this.ctx;
    const def = AMMO[hit.type] ?? AMMO.hunter;
    const ds = hit.draw ?? 1;

    // resolve owning machine via userData.machine anywhere up the chain
    let machine = null;
    let o = hit.object;
    while (o) {
      if (o.userData?.machine) { machine = o.userData.machine; break; }
      o = o.parent;
    }
    if (!machine) machine = hit.machine ?? null;

    let damage = 0;
    let tearTotal = 0;
    let weak = false;
    let tornPart = null;
    let res = null;

    const explosive = def.burst === 'blast';
    if (!explosive && machine && typeof machine.takeDamage === 'function') {
      // defensive: machines land concurrently — a mid-integration throw must
      // never kill the combat frame
      try {
        res = machine.takeDamage(this._buildHit(def, ds, hit.point, hit.object, hit.dir));
      } catch { res = null; }
      damage += Math.round(res?.damage ?? (def.impact ?? 0) * (def.drawScaled ? 0.25 + 0.75 * ds : 1));
      tearTotal += res?.tear ?? 0;
      weak = !!res?.weak;
      tornPart = res?.tornPart ?? null;
    }

    // --- area effects
    if (def.aoe) {
      const aoeRes = this._applyAoE(hit.point, hit.dir, def, hit.object);
      damage += aoeRes.damage;
      tearTotal += aoeRes.tear;
      weak = weak || aoeRes.weak;
      tornPart = tornPart ?? aoeRes.tornPart;
      if (!machine) machine = aoeRes.machine;
    }

    // --- FX + feel
    this._impactFx(hit, def, machine, weak);

    ctx.events.emit('arrow-hit', {
      point: hit.point.clone(),
      machine,
      damage,
      weak,
      type: hit.type,
      tear: tearTotal,
      tornPart,
    });
  }

  /** AoE application: body impact once per machine + tear per part in range. */
  _applyAoE(point, dir, def, excludeObject) {
    const { radius, impact = 0, tear = 0 } = def.aoe;
    const machines = this.ctx.machines?.list;
    const out = { damage: 0, tear: 0, weak: false, machine: null, tornPart: null };
    if (!machines) return out;
    for (const m of machines) {
      if (!m || m.alive === false || !m.root || typeof m.takeDamage !== 'function') continue;
      const bodyR = AIM_RADII[m.kind] ?? 2.5;
      _oc.copy(m.position);
      _oc.y += AIM_CY[m.kind] ?? 1.2;
      const d = _oc.distanceTo(point);
      if (impact > 0 && d <= radius + bodyR) {
        const fall = THREE.MathUtils.clamp(1 - (d - bodyR * 0.4) / (radius + bodyR * 0.6), 0.3, 1);
        let res = null;
        try {
          res = m.takeDamage({
            point: point.clone(),
            object: null,
            dir: _neg.subVectors(_oc, point).normalize().clone(),
            impact: impact * fall,
            tear: 0,
            element: def.element ?? 'none',
            elementAmount: (def.elementAmount ?? 0) * fall,
            type: def.id,
            baseDamage: impact * fall,
            draw: 1,
          });
        } catch { res = null; }
        out.damage += Math.round(res?.damage ?? impact * fall);
        out.weak = out.weak || !!res?.weak;
        out.tornPart = out.tornPart ?? res?.tornPart ?? null;
        if (!out.machine) out.machine = m;
      }
      // tear burst rips at attached parts NEAR the impact only: tight radius
      // + rough line-of-sight so one tearblast can't strip far-side
      // components through a 15m machine's body
      if (tear > 0 && Array.isArray(m.parts)) {
        const tearR = Math.min(radius, 2.2);
        for (const part of m.parts) {
          if (!part || part.attached === false || !part.mesh || part.mesh === excludeObject) continue;
          try { part.mesh.getWorldPosition(_pw); } catch { continue; }
          const dd = _pw.distanceTo(point);
          if (dd > tearR) continue;
          // far-side rejection: skip parts buried beyond the impact surface
          // (roughly along the shot direction — no line of sight to the burst)
          if (dd > 0.7) {
            _losDir.subVectors(_pw, point).multiplyScalar(1 / dd);
            if (_losDir.dot(dir) > 0.55) continue;
          }
          const fall = THREE.MathUtils.clamp(1 - dd / (tearR * 1.15), 0.25, 1);
          let res = null;
          try {
            res = m.takeDamage({
              point: _pw.clone(),
              object: part.mesh,
              dir: dir.clone(),
              impact: 0,
              tear: tear * fall,
              element: 'none',
              elementAmount: 0,
              type: def.id,
              baseDamage: 0,
              draw: 1,
            });
          } catch { res = null; }
          out.tear += res?.tear ?? tear * fall;
          out.tornPart = out.tornPart ?? res?.tornPart ?? null;
          if (!out.machine) out.machine = m;
        }
      }
    }
    return out;
  }

  _impactFx(hit, def, machine, weak) {
    const ctx = this.ctx;
    const player = ctx.player;

    if (def.burst === 'blast') {
      // fireball: flash core, sparks, embers, rising smoke, ground ring
      const groundY = ctx.terrain?.getHeight(hit.point.x, hit.point.z) ?? hit.point.y;
      this.blastFx.spawn(hit.point, groundY, def.aoe?.radius ?? 3.5, 0xffc27a);
      this.sparks.burst(hit.point, _up, {
        count: 34, speed: [7, 19], spread: 1.0,
        size: [0.06, 0.16], life: [0.18, 0.45], colors: EMBER_COLORS,
        stretch: [2, 5],
      });
      this.sparks.burst(hit.point, _up, {
        count: 6, speed: [0.2, 1], spread: 1,
        size: [0.7, 1.6], life: [0.08, 0.2], colors: [[1, 0.9, 0.72]],
      });
      this.dirt.burst(hit.point, _up, {
        count: 20, speed: [3, 9], spread: 0.9,
        size: [0.4, 0.9], life: [0.5, 1.0], colors: DIRT_COLORS,
      });
      this.smoke.burst(hit.point, _up, {
        count: 12, speed: [0.8, 2.6], spread: 0.9,
        size: [0.7, 1.5], life: [0.9, 1.8], colors: SMOKE_COLORS,
      });
      if (player) {
        const d = player.position.distanceTo(hit.point);
        player._shake = Math.min(1, (player._shake ?? 0) + THREE.MathUtils.clamp(1.1 - d / 22, 0.12, 0.6));
      }
      if (weak) this._startHitstop();
      return;
    }

    if (def.burst === 'tear') {
      // compressed-air tearblast pop: cyan shock puff, no flame
      const groundY = ctx.terrain?.getHeight(hit.point.x, hit.point.z) ?? hit.point.y;
      this.blastFx.spawn(hit.point, groundY, def.aoe?.radius ?? 4, 0x9fe8e0);
      this.sparks.burst(hit.point, hit.normal ?? _up, {
        count: 26, speed: [6, 15], spread: 1.0,
        size: [0.05, 0.13], life: [0.14, 0.34], colors: TEAR_COLORS,
        stretch: [2, 4],
      });
      if (player) player._shake = Math.min(1, (player._shake ?? 0) + 0.15);
    }

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
      if (def.element === 'shock') {
        this.sparks.burst(hit.point, hit.normal, {
          count: 12, speed: [4, 10], spread: 0.9,
          size: [0.06, 0.16], life: [0.1, 0.3], colors: SHOCK_COLORS,
          stretch: [1, 3],
        });
      } else if (def.element === 'freeze') {
        this.sparks.burst(hit.point, hit.normal, {
          count: 14, speed: [2, 7], spread: 1.0,
          size: [0.05, 0.14], life: [0.2, 0.5], colors: FREEZE_COLORS,
        });
      }
      if (weak) {
        this._startHitstop(); // 40ms, restored on real time
        if (player) player._shake = Math.min(1, (player._shake ?? 0) + 0.22);
      } else if (player) {
        player._shake = Math.min(1, (player._shake ?? 0) + 0.05);
      }
    } else if (def.burst !== 'tear') {
      this.dirt.burst(hit.point, hit.normal ?? _up, {
        count: 14, speed: [0.8, 3.2], spread: 1.0,
        size: [0.35, 0.75], life: [0.35, 0.8], colors: DIRT_COLORS,
      });
      if (def.element === 'fire') {
        this.sparks.burst(hit.point, hit.normal ?? _up, {
          count: 8, speed: [1, 4], spread: 0.8,
          size: [0.06, 0.14], life: [0.2, 0.5], colors: EMBER_COLORS,
        });
      }
    }
  }

  /* -------------------------- trajectory preview -------------------------- */

  _updateTrajectory(ammoId) {
    const def = AMMO[ammoId] ?? AMMO['blast-bomb'];
    this.bow.getNockWorld(this.drawStrength, _spawn);
    const speed = this._computeShot(def, Math.max(this.drawStrength, 0.6), _spawn, _fireDir);
    _simP.copy(_spawn);
    _simV.copy(_fireDir).multiplyScalar(speed);
    const g = def.projectile === 'disc' ? 5.5 : 9.8;
    const h = 0.05;
    const attr = this._trajPts.geometry.attributes.position;
    const terr = this.ctx.terrain;
    let n = 0;
    let landed = false;
    for (let i = 0; i < 120 && n < this._trajMax; i++) {
      _simV.y -= g * h;
      _simV.multiplyScalar(Math.max(0, 1 - 0.05 * h));
      _simP.addScaledVector(_simV, h);
      const gy = terr ? terr.getHeight(_simP.x, _simP.z) : 0;
      if (_simP.y <= gy) {
        _simP.y = gy + 0.05;
        landed = true;
      }
      if ((i & 1) === 0 || landed) {
        attr.setXYZ(n, _simP.x, _simP.y, _simP.z);
        n++;
      }
      if (landed) break;
    }
    attr.needsUpdate = true;
    this._trajPts.geometry.setDrawRange(0, n);
    const r = def.aoe?.radius ?? 3.5;
    this._landRing.position.set(_simP.x, (_simP.y) + 0.12, _simP.z);
    this._landRing.scale.set(r, r, 1);
    this._landRing.material.opacity = landed ? 0.75 : 0.2;
  }

  /* ----------------------- heavy pickup coordination ---------------------- */

  _pollWeaponPickups(realDt) {
    this._pickupClock -= realDt;
    if (this._pickupClock > 0) return;
    this._pickupClock = 0.3;
    const list = this.ctx.interactables?.list;
    if (!Array.isArray(list)) return;
    for (const e of list) {
      if (!e || e.__hzcWeaponWrapped) continue;
      const wid = e.pickupWeapon ?? e.part?.pickupWeapon ?? e.userData?.pickupWeapon;
      if (wid !== 'disc-launcher') continue;
      e.__hzcWeaponWrapped = true;
      const orig = e.onInteract;
      const self = this;
      e.onInteract = function wrapped(...args) {
        try { orig?.apply(this, args); } catch { /* other builder's problem */ }
        self.grantWeapon('disc-launcher');
      };
    }
  }
}
