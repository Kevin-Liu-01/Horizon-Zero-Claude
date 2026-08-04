import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Base Machine: state machine, perception, terrain-conforming steering,
 * part damage (weak points / armor / burn / stun), state-colored sensor glow,
 * death FX. Subclasses supply model config, procedural animation and attacks.
 */

const CAMP = { x: 22, z: 30, r: 25 };
const WORLD_LIMIT = 318;

export const EYE_COLORS = {
  calm: new THREE.Color('#38c6ff'),
  wary: new THREE.Color('#ffb31f'),
  hostile: new THREE.Color('#ff2413'),
  dead: new THREE.Color('#050505'),
};

// shared scratch (never allocate in hot loops)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _UP = new THREE.Vector3(0, 1, 0);

let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

const _ringGeo = new THREE.TorusGeometry(1, 0.09, 8, 48);
const _ringGeoSoft = new THREE.TorusGeometry(1, 0.16, 8, 48);
const _sphereGeo = new THREE.SphereGeometry(1, 10, 8);

export class Machine {
  constructor(ctx, manager, opts) {
    this.ctx = ctx;
    this.manager = manager;

    this.kind = opts.kind;
    this.displayName = opts.displayName;
    this.maxHealth = opts.maxHealth;
    this.health = this.maxHealth;
    this.armor = opts.armor ?? 0;
    this.alive = true;
    this.state = 'patrol';

    // steering / senses config
    this.walkSpeed = opts.walkSpeed ?? 2;
    this.runSpeed = opts.runSpeed ?? 6;
    this.turnRate = opts.turnRate ?? 2.2;
    this.sightRange = opts.sightRange ?? 40;
    this.sightHalf = opts.sightHalf ?? THREE.MathUtils.degToRad(50);
    this.hearRange = opts.hearRange ?? 26;
    this.stealthRange = opts.stealthRange ?? 8;
    this.eyeHeight = opts.eyeHeight ?? 1.5;
    this.attackRange = opts.attackRange ?? 3;
    this.bodyRadius = opts.bodyRadius ?? 1.2;
    this.territory = opts.territory ?? null; // { x, z, r }
    this.alignToTerrain = opts.alignToTerrain ?? true;

    // model
    const src = ctx.assets.models[this.kind];
    this.size = src.size;
    this.height = src.size.y;
    this.root = new THREE.Group();
    this.root.name = `${this.kind}-machine`;
    this.position = this.root.position;
    // body: procedural bob/sway/pitch in gameplay space (+Z forward);
    // holder: fixed yaw correction so every model faces +Z at heading 0.
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.holder = new THREE.Group();
    this.holder.rotation.y = opts.yawFix ?? 0;
    this.body.add(this.holder);
    this.model = opts.rigged ? skeletonClone(src.root) : src.root.clone();
    this.holder.add(this.model);

    // metal sanity: metalness-heavy PBR with no env goes jet-black in shadow.
    // Modest clamps (lead adds a scene env map in parallel) keep plates readable.
    this.model.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.metalness !== undefined) m.metalness = Math.min(m.metalness, 0.7);
        if (m.roughness !== undefined) m.roughness = Math.max(m.roughness, 0.35);
      }
    });

    const spawn = opts.spawn;
    this.spawnPos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.position.set(spawn.x, ctx.terrain.getHeight(spawn.x, spawn.z), spawn.z);
    this.heading = opts.heading ?? Math.random() * Math.PI * 2;

    this.route = opts.route ?? [this.spawnPos.clone()];
    this._wpIndex = 0;
    this._waitT = 0;

    // perception state
    this.suspicion = 0;
    this.lastKnown = new THREE.Vector3();
    this.playerDist = 999;
    this._visible = false;
    this._unseenT = 99;
    this._perceptClock = Math.random() * 0.13;

    // combat state
    this.stunT = 0;
    this.burnT = 0;
    this._burnDps = 0;
    this._burnAnchor = new THREE.Vector3(); // body-local stuck-arrow point
    this._burnAnchorSet = false;
    this._arcClock = 0;
    this._eyeFlare = 0; // one-frame sensor flare (attack telegraphs)
    this._attack = null;
    this._attackCd = 1 + Math.random() * 2;
    this._speed = 0;
    this._accelPitch = 0;
    this._stateT = 0;
    this._alertEpisode = false;
    this._airborne = false;

    // death
    this._deathT = 0;
    this._deathSide = Math.random() < 0.5 ? 1 : -1;
    this._deathRoll = 0.9 + Math.random() * 0.3;
    this._deathTwist = (Math.random() - 0.5) * 0.9;
    this._beaconSpawned = false;

    // sensors / glow
    this._eyeColor = EYE_COLORS.calm.clone();
    this._eyeMats = [];   // sprite/basic materials fully colored by state
    this._emisMats = [];  // model emissive materials tinted by state
    this._collectEmissive();

    this.weakPoints = [];
    this._fx = [];
    this._flameClock = 0;
    this.lowLOD = false;

    this._normal = new THREE.Vector3(0, 1, 0);

    this.root.traverse((o) => { o.userData.machine = this; });
    ctx.scene.add(this.root);
  }

  /* ------------------------- setup helpers ------------------------- */

  _collectEmissive() {
    const seen = new Map();
    this.model.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.emissive) return;
      const m = o.material;
      const glows = m.emissiveMap || m.emissive.r + m.emissive.g + m.emissive.b > 0.05;
      if (!glows) return;
      if (!seen.has(m)) {
        const c = m.clone();
        // Flat emissive (no map) = sensor/glow bits -> full state color.
        // Lens/lamp materials: drop the (blue) emissive map so flat state
        // color shows. Body strips keep their map and only pulse intensity.
        const n = (m.name || '').toLowerCase();
        if (!m.emissiveMap) {
          this._eyeMats.push({ mat: c, base: 1.6, kind: 'emissive' });
        } else if (n.includes('lense') || n.includes('lens') || n.includes('light')) {
          c.emissiveMap = null;
          this._eyeMats.push({ mat: c, base: 2.2, kind: 'emissive' });
        } else {
          this._emisMats.push(c);
        }
        seen.set(m, c);
      }
      o.material = seen.get(m);
    });
  }

  /** Uniform world scale of a node (bones live in a scaled subtree). */
  _worldScale(node) {
    node.updateWorldMatrix(true, false);
    node.getWorldScale(_v3);
    return Math.max(_v3.x, 1e-6);
  }

  /** Add a state-colored glow sprite (+ optional solid core) at a local offset
   *  given in METERS (world units), regardless of the parent's scale. */
  addEye(parent, x, y, z, scale = 0.4, core = 0) {
    const s = this._worldScale(parent);
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(), blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true, toneMapped: false,
    });
    const spr = new THREE.Sprite(mat);
    spr.position.set(x / s, y / s, z / s);
    spr.scale.setScalar(scale / s);
    spr.userData.machine = this;
    spr.raycast = () => {}; // glow is FX, not a hitbox (weak hits must hit the model)
    parent.add(spr);
    this._eyeMats.push({ mat, base: 1, kind: 'sprite' });
    if (core > 0) {
      const cm = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true });
      const mesh = new THREE.Mesh(_sphereGeo, cm);
      mesh.scale.setScalar(core / s);
      mesh.position.set(x / s, y / s, z / s);
      mesh.userData.machine = this;
      mesh.raycast = () => {};
      parent.add(mesh);
      this._eyeMats.push({ mat: cm, base: 1, kind: 'basic' });
    }
    return spr;
  }

  /** Weak-point sphere. Offset in meters; radius is in world meters. */
  addWeakPoint(name, parent, x, y, z, radius, mult = 3) {
    const s = this._worldScale(parent);
    const obj = new THREE.Object3D();
    obj.position.set(x / s, y / s, z / s);
    obj.userData.machine = this;
    parent.add(obj);
    this.weakPoints.push({ name, obj, radius, mult });
    return obj;
  }

  /** Testability: spawn wireframe markers at weak points for screenshots. */
  debugWeakPoints() {
    for (const wp of this.weakPoints) {
      const s = this._worldScale(wp.obj);
      const m = new THREE.Mesh(
        _sphereGeo,
        new THREE.MeshBasicMaterial({ color: 0xff30e0, wireframe: true, toneMapped: false }),
      );
      m.scale.setScalar(wp.radius / s);
      wp.obj.add(m);
    }
  }

  /* ------------------------- damage contract ------------------------- */

  takeDamage(hit) {
    if (!this.alive) return { damage: 0, weak: false, killed: false };
    let weak = false;
    if (hit.point) {
      for (const wp of this.weakPoints) {
        wp.obj.getWorldPosition(_v1);
        if (_v1.distanceToSquared(hit.point) <= wp.radius * wp.radius) { weak = true; break; }
      }
    }
    const mult = weak ? 3 : 1 - this.armor;
    const damage = (hit.baseDamage ?? 10) * mult;
    this.health = Math.max(0, this.health - damage);

    if (hit.type === 'fire') {
      this.burnT = 4; this._burnDps = 5;
      if (hit.point) {
        this._burnAnchor.copy(hit.point);
        this.body.worldToLocal(this._burnAnchor);
        this._burnAnchorSet = true;
      }
    }
    if (hit.type === 'shock') { this.stunT = Math.max(this.stunT, 2.5); this._cancelAttack(); }

    // getting shot always reveals the shooter's rough position
    this.suspicion = 1;
    this._unseenT = 0;
    if (this.ctx.player) this.lastKnown.copy(this.ctx.player.position);

    this.ctx.events.emit('machine-damaged', { machine: this, damage, weak, point: hit.point });

    let killed = false;
    if (this.health <= 0) { killed = true; this._die(); }
    else if (this.state === 'patrol' || this.state === 'suspicious'
          || this.state === 'search' || this.state === 'return') {
      this.setState('alert');
    }
    return { damage, weak, killed };
  }

  _die() {
    if (this.state === 'dead') return;
    this.alive = false;
    this._cancelAttack();
    this.burnT = 0;
    this.stunT = 0;
    this._deathT = 0;
    this.setState('dead');
    _v1.copy(this.position); _v1.y += this.height * 0.55;
    this._sparkBurst(_v1, 46);
    this._smokeBurst(_v1, 10);
    this.ctx.events.emit('machine-killed', { machine: this });
  }

  /* ------------------------- state machine ------------------------- */

  setState(name) {
    if (this.state === name) return;
    const wasCalm = this.state === 'patrol' || this.state === 'return' || this.state === 'suspicious';
    this.state = name;
    this._stateT = 0;
    if ((name === 'alert' || name === 'attack') && !this._alertEpisode) {
      this._alertEpisode = true;
      this.ctx.events.emit('machine-alerted', { machine: this });
      this.onAlerted?.(wasCalm);
    }
    if (name === 'patrol' || name === 'return') this._alertEpisode = false;
    this.onStateChange?.(name);
  }

  /** Testability hook: force a state; wires up sensible targets. */
  forceState(name) {
    const p = this.ctx.player;
    if (name === 'dead') { this.health = 0; this._die(); return; }
    if (name === 'alert' || name === 'attack' || name === 'search' || name === 'suspicious') {
      this.suspicion = name === 'suspicious' ? 0.6 : name === 'search' ? 0.5 : 1;
      this._unseenT = 0;
      if (p) this.lastKnown.copy(p.position);
    }
    this._attackCd = 0;
    this.setState(name);
  }

  update(dt, t) {
    if (this.state === 'dead') {
      this._updateDeath(dt);
      this._updateFx(dt);
      this._updateEyes(dt, t);
      return;
    }

    // attack-timer cooldowns tick unconditionally (lowLOD coarse steps and
    // stun must not freeze them — subclasses implement tickCooldowns)
    this.tickCooldowns?.(dt);

    // burn DoT ticks even while stunned — sustained flames + smoke at the
    // stuck-arrow point (SPEC: "orange flame particles")
    if (this.burnT > 0) {
      this.burnT -= dt;
      this.health -= this._burnDps * dt;
      this._flameClock -= dt;
      if (this._flameClock <= 0 && !this.lowLOD) {
        this._flameClock = 0.07;
        if (this._burnAnchorSet) {
          _v1.copy(this._burnAnchor);
          this.body.localToWorld(_v1);
        } else {
          _v1.copy(this.position);
          _v1.y += this.height * 0.5;
        }
        _v1.x += (Math.random() - 0.5) * 0.25;
        _v1.y += (Math.random() - 0.5) * 0.2;
        _v1.z += (Math.random() - 0.5) * 0.25;
        this._flamePuff(_v1);
        if (Math.random() < 0.3) this._burnSmoke(_v1);
      }
      if (this.health <= 0) { this._die(); return; }
    }

    if (this.stunT > 0) {
      this.stunT -= dt;
      // shock: frozen — shiver + jittering electric arcs (SPEC: "electric arcs")
      this.body.position.x = (Math.random() - 0.5) * 0.035;
      this._arcClock -= dt;
      if (this._arcClock <= 0 && !this.lowLOD) {
        this._arcClock = 0.09;
        this._arcFlash();
      }
      this._speed = 0;
      this._conform(dt);
      this._updateFx(dt);
      this._updateEyes(dt, t);
      return;
    }
    this.body.position.x = 0;

    this._stateT += dt;
    this._perceive(dt);

    switch (this.state) {
      case 'patrol': this._statePatrol(dt); break;
      case 'suspicious': this._stateSuspicious(dt); break;
      case 'alert': this._stateAlert(dt); break;
      case 'attack': this._stateAttack(dt); break;
      case 'search': this._stateSearch(dt); break;
      case 'return': this._stateReturn(dt); break;
    }

    this._conform(dt);
    if (!this.lowLOD) this.animate?.(dt, t);
    this._updateFx(dt);
    this._updateEyes(dt, t);
  }

  _statePatrol(dt) {
    if (this.suspicion > 0.28) { this.setState('suspicious'); return; }
    if (this._waitT > 0) { this._waitT -= dt; this._speed = THREE.MathUtils.damp(this._speed, 0, 6, dt); return; }
    const wp = this.route[this._wpIndex];
    const d = this._moveToward(wp.x, wp.z, this.walkSpeed, dt);
    if (d < this.bodyRadius + 0.6) {
      this._wpIndex = (this._wpIndex + 1) % this.route.length;
      this._waitT = 1.2 + Math.random() * 2.4;
    }
  }

  _stateSuspicious(dt) {
    if (this.suspicion >= 1) { this.setState('alert'); return; }
    if (this.suspicion < 0.06) { this.setState('return'); return; }
    // face the stimulus, then creep toward it
    if (this._stateT < 1.1) {
      this._face(this.lastKnown.x, this.lastKnown.z, dt);
      this._speed = THREE.MathUtils.damp(this._speed, 0, 6, dt);
    } else {
      const d = this._moveToward(this.lastKnown.x, this.lastKnown.z, this.walkSpeed * 0.55, dt);
      if (d < 2.5) this.suspicion = Math.max(0, this.suspicion - dt * 0.35);
    }
  }

  _stateAlert(dt) {
    const p = this.ctx.player;
    if (p) this._face(p.position.x, p.position.z, dt);
    this._speed = THREE.MathUtils.damp(this._speed, 0, 6, dt);
    if (this._stateT > 0.65) this.setState('attack');
  }

  _stateAttack(dt) {
    if (this._attack) { this._updateAttack(dt); return; }
    this._attackCd -= dt;
    const p = this.ctx.player;
    if (!p) { this.setState('return'); return; }
    if (this._unseenT > 4.5) { this.setState('search'); return; }
    if (this.territory) {
      const dx = p.position.x - this.territory.x, dz = p.position.z - this.territory.z;
      if (dx * dx + dz * dz > (this.territory.r * 1.35) ** 2) { this.setState('return'); return; }
    }
    const dist = this.playerDist;
    if (dist > this.attackRange * 0.85) {
      this._moveToward(p.position.x, p.position.z, this.runSpeed, dt);
    } else {
      this._face(p.position.x, p.position.z, dt);
      this._speed = THREE.MathUtils.damp(this._speed, 0, 8, dt);
    }
    if (this._attackCd <= 0) {
      const a = this.chooseAttack?.(dist);
      if (a) this._startAttack(a);
    }
  }

  _stateSearch(dt) {
    if (this.suspicion >= 1) { this.setState('alert'); return; }
    const d = this._moveToward(this.lastKnown.x, this.lastKnown.z, this.walkSpeed * 1.35, dt);
    if (d < 2.2) {
      // look around
      this._speed = THREE.MathUtils.damp(this._speed, 0, 6, dt);
      this.heading += Math.sin(this._stateT * 1.4) * dt * 1.1;
    }
    if (this._stateT > 7) this.setState('return');
  }

  _stateReturn(dt) {
    if (this.suspicion >= 1) { this.setState('alert'); return; }
    if (this.suspicion > 0.5) { this.setState('suspicious'); return; }
    const wp = this.route[this._wpIndex];
    const d = this._moveToward(wp.x, wp.z, this.walkSpeed * 1.25, dt);
    if (d < this.bodyRadius + 1) {
      this.suspicion = 0;
      this.setState('patrol');
    }
  }

  /* ------------------------- attacks ------------------------- */

  _startAttack(a) {
    a.t = 0;
    a.struck = false;
    a.phase = 'windup';
    this._attack = a;
    this.ctx.events.emit('machine-attack', { machine: this, kind: a.kind });
    a.onWindup?.(a);
  }

  _updateAttack(dt) {
    const a = this._attack;
    a.t += dt;
    const w = a.windup, s = a.strike, r = a.recover;
    if (a.t < w) {
      a.phase = 'windup'; a.phaseT = a.t / w;
      if (a.track !== false) {
        const p = this.ctx.player;
        if (p) this._face(p.position.x, p.position.z, dt);
      }
    } else if (a.t < w + s) {
      if (!a.struck) { a.struck = true; a.onStrike?.(a); }
      a.phase = 'strike'; a.phaseT = (a.t - w) / s;
    } else {
      a.phase = 'recover'; a.phaseT = (a.t - w - s) / r;
    }
    a.onUpdate?.(a, dt);
    if (a.t >= w + s + r) {
      a.cleanup?.(a);
      this._attackCd = a.cooldown ?? 2.5;
      this._attack = null;
    }
  }

  _cancelAttack() {
    if (!this._attack) return;
    this._attack.cleanup?.(this._attack);
    this._attack = null;
    this._attackCd = Math.max(this._attackCd, 1.2);
  }

  /** Deal damage to the player if within range (and optionally in front arc). */
  damagePlayer(amount, maxRange, arcCos = -2) {
    const p = this.ctx.player;
    if (!p) return false;
    _v1.subVectors(p.position, this.position);
    const d = Math.hypot(_v1.x, _v1.z);
    if (d > maxRange) return false;
    if (arcCos > -1.5 && d > 0.01) {
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      if ((_v1.x * fx + _v1.z * fz) / d < arcCos) return false;
    }
    this.ctx.events.emit('player-damage', { amount, from: this });
    return true;
  }

  knockbackPlayer(strength) {
    const p = this.ctx.player;
    if (!p || p.dodging) return;
    _v1.subVectors(p.position, this.position);
    _v1.y = 0;
    if (_v1.lengthSq() < 0.01) _v1.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    _v1.normalize();
    p.velocity.x += _v1.x * strength;
    p.velocity.z += _v1.z * strength;
  }

  /* ------------------------- perception ------------------------- */

  _perceive(dt) {
    const p = this.ctx.player;
    if (!p) return;
    _v1.subVectors(p.position, this.position);
    const dist = Math.hypot(_v1.x, _v1.z);
    this.playerDist = dist;

    this._perceptClock -= dt;
    if (this._perceptClock > 0) return;
    const pd = 0.12;
    this._perceptClock += pd;

    let visible = false;
    let heard = false;
    const playerAlive = p.health > 0;

    if (playerAlive) {
      let allowed = true;
      if (this.territory && this.state !== 'attack' && this.state !== 'alert') {
        const dx = p.position.x - this.territory.x, dz = p.position.z - this.territory.z;
        allowed = dx * dx + dz * dz < this.territory.r * this.territory.r;
      }
      if (allowed) {
        const stealthed = p.crouching && p.inTallGrass;
        const maxSee = stealthed ? this.stealthRange : this.sightRange;
        if (dist < maxSee) {
          const close = dist < this.bodyRadius + 4; // proximity sense, no cone
          let inCone = close;
          if (!inCone && dist > 0.01) {
            const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
            inCone = (_v1.x * fx + _v1.z * fz) / dist > Math.cos(this.sightHalf);
          }
          if (inCone && this._hasLOS(p.position)) visible = true;
        }
        // hearing: movement noise radius
        let noiseR = 0;
        if (p.moveSpeed > 0.5) noiseR = p.crouching ? 5 : p.moveSpeed > 7 ? 30 : 15;
        heard = noiseR > 0 && dist < Math.min(noiseR, this.hearRange);
      }
    }

    if (visible) {
      this.suspicion = Math.min(1.2, this.suspicion + pd * (0.55 + 2.4 * (1 - dist / this.sightRange)));
      this.lastKnown.copy(p.position);
      this._unseenT = 0;
    } else {
      if (heard) {
        this.suspicion = Math.min(this.state === 'attack' ? 1.2 : 0.95, this.suspicion + pd * 0.55);
        this.lastKnown.copy(p.position);
        if (this.state === 'attack') this._unseenT = Math.min(this._unseenT, 1.5);
      } else {
        this.suspicion = Math.max(0, this.suspicion - pd * 0.1);
      }
      this._unseenT += pd;
    }
    this._visible = visible;
  }

  _hasLOS(target) {
    // cheap terrain occlusion: sample the sightline against the heightfield
    const t = this.ctx.terrain;
    const y0 = this.position.y + this.eyeHeight;
    const y1 = target.y + 1.2;
    for (let i = 1; i <= 3; i++) {
      const k = i / 4;
      const x = this.position.x + (target.x - this.position.x) * k;
      const z = this.position.z + (target.z - this.position.z) * k;
      if (t.getHeight(x, z) > y0 + (y1 - y0) * k + 1.2) return false;
    }
    return true;
  }

  /* ------------------------- steering ------------------------- */

  _turnToward(want, dt) {
    let d = want - this.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const step = THREE.MathUtils.clamp(d, -this.turnRate * dt, this.turnRate * dt);
    this.heading += step;
    return d;
  }

  _face(x, z, dt) {
    return this._turnToward(Math.atan2(x - this.position.x, z - this.position.z), dt);
  }

  _moveToward(x, z, speed, dt) {
    const dx = x - this.position.x, dz = z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) return dist;
    const diff = this._turnToward(Math.atan2(dx, dz), dt);
    const align = Math.cos(diff);
    const target = align > 0.25 ? speed * THREE.MathUtils.clamp(align, 0, 1) : 0;
    this._speed = THREE.MathUtils.damp(this._speed, target, 5, dt);
    const step = Math.min(this._speed * dt, dist);
    this._applyStep(Math.sin(this.heading) * step, Math.cos(this.heading) * step);
    return dist;
  }

  /** Move the root directly (attack root-motion). Respects camp/world limits. */
  moveRoot(dx, dz) {
    this._applyStep(dx, dz);
  }

  _applyStep(dx, dz) {
    let nx = this.position.x + dx;
    let nz = this.position.z + dz;
    // hunter camp is a safe zone
    const cx = nx - CAMP.x, cz = nz - CAMP.z;
    const cd = Math.hypot(cx, cz);
    const minR = CAMP.r + this.bodyRadius;
    if (cd < minR && cd > 0.001) {
      nx = CAMP.x + (cx / cd) * minR;
      nz = CAMP.z + (cz / cd) * minR;
    }
    const r = Math.hypot(nx, nz);
    if (r > WORLD_LIMIT) { nx *= WORLD_LIMIT / r; nz *= WORLD_LIMIT / r; }
    this.position.x = nx;
    this.position.z = nz;
  }

  _conform(dt) {
    const t = this.ctx.terrain;
    const gy = t.getHeight(this.position.x, this.position.z);
    if (!this._airborne) {
      this.position.y = Math.abs(this.position.y - gy) > 4
        ? gy : THREE.MathUtils.damp(this.position.y, gy, 12, dt);
    }
    if (this.alignToTerrain) {
      t.getNormal(this.position.x, this.position.z, _v2);
      this._normal.lerp(_v2, Math.min(1, dt * 3.5)).normalize();
    } else {
      this._normal.lerp(_UP, Math.min(1, dt * 3.5)).normalize();
    }
    _q1.setFromUnitVectors(_UP, this._normal);
    _q2.setFromAxisAngle(_UP, this.heading);
    this.root.quaternion.copy(_q1).multiply(_q2);
    // smoothed acceleration → pitch cue for subclass body motion
    this._accelPitch = THREE.MathUtils.damp(this._accelPitch, this._speed, 4, dt);
  }

  /* ------------------------- death / fx ------------------------- */

  _updateDeath(dt) {
    this._deathT += dt;
    const k = THREE.MathUtils.smoothstep(Math.min(this._deathT / 1.15, 1), 0, 1);
    // crash onto the side with a yaw twist — a wreck, not a parked machine
    this.body.rotation.z = this._deathSide * this._deathRoll * k;
    this.body.rotation.x = 0.15 * k;
    this.body.rotation.y = this._deathTwist * k;
    this.body.position.y = -this.height * 0.1 * k;
    this.onDeathPose?.(k); // subclass crumple (bones etc.)
    if (!this._beaconSpawned && this._deathT > 1.4) {
      this._beaconSpawned = true;
      this._spawnBeacon();
    }
  }

  _spawnBeacon() {
    const h = Math.max(4, this.height * 1.4);
    const geo = new THREE.CylinderGeometry(0.09, 0.16, h, 8, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x7fe8ff, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(geo, mat);
    beam.position.set(this.position.x, this.position.y + h / 2, this.position.z);
    beam.userData.machine = this;
    this.ctx.scene.add(beam);
    let t = 0;
    this._fx.push({
      update: (dt2) => {
        t += dt2;
        // fade out as the camera walks up so it never becomes a screen-tall slab
        const cam = this.ctx.camera;
        let fade = 1;
        if (cam) {
          const d = Math.hypot(
            cam.position.x - beam.position.x, cam.position.z - beam.position.z,
          );
          fade = THREE.MathUtils.smoothstep(d, 3.5, 11);
        }
        mat.opacity = (0.22 + Math.sin(t * 2.4) * 0.1) * fade;
        return true; // persistent loot beacon
      },
    });
  }

  _sparkBurst(worldPos, n) {
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 7 + 2;
      const sp = Math.random() * 6 + 1.5;
      vel[i * 3] = Math.cos(a) * sp;
      vel[i * 3 + 1] = up;
      vel[i * 3 + 2] = Math.sin(a) * sp;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffc061, size: 0.14, transparent: true, opacity: 1,
      map: glowTexture(), // soft round sparks, not bare squares
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.position.copy(worldPos);
    this.ctx.scene.add(pts);
    let life = 0;
    this._fx.push({
      update: (dt) => {
        life += dt;
        const arr = geo.attributes.position.array;
        for (let i = 0; i < n; i++) {
          vel[i * 3 + 1] -= 16 * dt;
          arr[i * 3] += vel[i * 3] * dt;
          arr[i * 3 + 1] += vel[i * 3 + 1] * dt;
          arr[i * 3 + 2] += vel[i * 3 + 2] * dt;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 1 - life / 1.1;
        if (life > 1.1) {
          this.ctx.scene.remove(pts); geo.dispose(); mat.dispose();
          return false;
        }
        return true;
      },
    });
  }

  _smokeBurst(worldPos, n) {
    // warm-gray wisps, capped near bodyRadius so smoke never blots the screen
    const cap = Math.max(0.9, this.bodyRadius);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({
        map: glowTexture(), color: 0x56493d, transparent: true,
        opacity: 0.0, depthWrite: false,
      });
      const s = new THREE.Sprite(mat);
      s.position.set(
        worldPos.x + (Math.random() - 0.5) * this.bodyRadius * 1.4,
        worldPos.y + (Math.random() - 0.3) * 1.2,
        worldPos.z + (Math.random() - 0.5) * this.bodyRadius * 1.4,
      );
      const scale0 = cap * (0.35 + Math.random() * 0.25);
      s.scale.setScalar(scale0);
      this.ctx.scene.add(s);
      const rise = 0.6 + Math.random() * 0.9;
      const dur = 1.3 + Math.random() * 1.1;
      const delay = Math.random() * 0.5;
      let t = -delay;
      this._fx.push({
        update: (dt) => {
          t += dt;
          if (t < 0) return true;
          const k = t / dur;
          s.position.y += rise * dt;
          s.scale.setScalar(scale0 + k * cap * 0.7);
          mat.opacity = 0.24 * Math.sin(Math.min(k, 1) * Math.PI);
          if (k >= 1) { this.ctx.scene.remove(s); mat.dispose(); return false; }
          return true;
        },
      });
    }
  }

  _flamePuff(worldPos) {
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xff7a1e, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const s = new THREE.Sprite(mat);
    s.position.copy(worldPos);
    s.scale.setScalar(0.5 + Math.random() * 0.4);
    this.ctx.scene.add(s);
    let t = 0;
    this._fx.push({
      update: (dt) => {
        t += dt;
        s.position.y += dt * 1.6;
        s.scale.multiplyScalar(1 - dt * 0.8);
        mat.opacity = 0.85 * (1 - t / 0.55);
        mat.color.lerp(EYE_COLORS.hostile, dt * 2);
        if (t > 0.55) { this.ctx.scene.remove(s); mat.dispose(); return false; }
        return true;
      },
    });
  }

  /** Sooty wisp rising off a burning part. */
  _burnSmoke(worldPos) {
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(), color: 0x4a4038, transparent: true, opacity: 0.22,
      depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    s.position.copy(worldPos);
    s.position.y += 0.25;
    const scale0 = 0.35 + Math.random() * 0.25;
    s.scale.setScalar(scale0);
    this.ctx.scene.add(s);
    let t = 0;
    const dur = 0.9;
    this._fx.push({
      update: (dt) => {
        t += dt;
        s.position.y += dt * 1.1;
        s.scale.setScalar(scale0 + (t / dur) * 0.7);
        mat.opacity = 0.22 * (1 - t / dur);
        if (t > dur) { this.ctx.scene.remove(s); mat.dispose(); return false; }
        return true;
      },
    });
  }

  /** Jittering electric arc streak across the body while shock-stunned. */
  _arcFlash() {
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xbfe8ff, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      rotation: Math.random() * Math.PI,
    });
    const s = new THREE.Sprite(mat);
    s.position.set(
      this.position.x + (Math.random() - 0.5) * this.bodyRadius * 1.5,
      this.position.y + this.height * (0.25 + Math.random() * 0.6),
      this.position.z + (Math.random() - 0.5) * this.bodyRadius * 1.5,
    );
    // elongated thin sprite reads as an arc streak
    const L = 0.5 + Math.random() * this.bodyRadius * 0.8;
    s.scale.set(L, 0.09 + Math.random() * 0.08, 1);
    this.ctx.scene.add(s);
    let t = 0;
    this._fx.push({
      update: (dt) => {
        t += dt;
        mat.rotation += dt * 20 * (Math.random() - 0.5);
        mat.opacity = Math.random() < 0.4 ? 0.2 : 0.95;
        if (t > 0.12) { this.ctx.scene.remove(s); mat.dispose(); return false; }
        return true;
      },
    });
  }

  /** Kicked-up ground dust (charge scrapes, landings). Non-additive earth puff. */
  _dustPuff(x, y, z, scale0 = 0.8) {
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(), color: 0x6f5637, transparent: true, opacity: 0,
      depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z);
    s.scale.setScalar(scale0);
    this.ctx.scene.add(s);
    let t = 0;
    const dur = 0.9 + Math.random() * 0.4;
    this._fx.push({
      update: (dt) => {
        t += dt;
        const k = t / dur;
        s.position.y += dt * 0.7;
        s.scale.setScalar(scale0 * (1 + k * 1.3));
        // fast ramp-in, slow settle — stays readable most of its life
        mat.opacity = 0.62 * Math.min(1, k * 4) * (1 - k * k);
        if (k >= 1) { this.ctx.scene.remove(s); mat.dispose(); return false; }
        return true;
      },
    });
  }

  /** Expanding radial shockwave ring; damages the player once at impact radius. */
  spawnShockRing(cx, cz, maxR, dur, damage, dmgRadius) {
    const y = this.ctx.terrain.getHeight(cx, cz) + 0.35;
    // hot core ring: white-hot fading to orange, holds bright until late so it
    // still reads at dodge distance
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfff3d8, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const ring = new THREE.Mesh(_ringGeo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, y, cz);
    this.ctx.scene.add(ring);
    // trailing ground-dust ring just behind the wavefront
    const dringMat = new THREE.MeshBasicMaterial({
      color: 0x9a8262, transparent: true, opacity: 0.4,
      depthWrite: false,
    });
    const dring = new THREE.Mesh(_ringGeoSoft, dringMat);
    dring.rotation.x = -Math.PI / 2;
    dring.position.set(cx, y - 0.05, cz);
    this.ctx.scene.add(dring);
    // central dust plume
    const dmat = new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xc9a878, transparent: true, opacity: 0.5, depthWrite: false,
    });
    const dust = new THREE.Sprite(dmat);
    dust.position.set(cx, y + 0.6, cz);
    dust.scale.setScalar(2);
    this.ctx.scene.add(dust);
    const _hot = new THREE.Color(0xfff3d8);
    const _cool = new THREE.Color(0xff7a24);
    let t = 0;
    let dealt = false;
    this._fx.push({
      update: (dt) => {
        t += dt;
        const k = Math.min(t / dur, 1);
        const r = 0.6 + (maxR - 0.6) * k;
        ring.scale.set(r, r, 2.2 + k * 4.5);
        mat.color.copy(_hot).lerp(_cool, Math.min(1, k * 1.6));
        mat.opacity = k < 0.7 ? 0.9 : 0.9 * (1 - (k - 0.7) / 0.3);
        const rd = Math.max(0.4, r * 0.82);
        dring.scale.set(rd, rd, 2.6 + k * 5);
        dringMat.opacity = k < 0.6 ? 0.38 : 0.38 * (1 - (k - 0.6) / 0.4);
        dust.scale.setScalar(2 + k * maxR * 1.2);
        dmat.opacity = 0.5 * (1 - k);
        if (!dealt && damage > 0) {
          const p = this.ctx.player;
          if (p) {
            const d = Math.hypot(p.position.x - cx, p.position.z - cz);
            if (d <= r + 0.6 && d <= dmgRadius) {
              dealt = true;
              this.ctx.events.emit('player-damage', { amount: damage, from: this });
            } else if (r > d + 1.2) {
              dealt = true; // wave passed the player without touching them
            }
          }
        }
        if (k >= 1) {
          this.ctx.scene.remove(ring); this.ctx.scene.remove(dust);
          this.ctx.scene.remove(dring);
          mat.dispose(); dmat.dispose(); dringMat.dispose();
          return false;
        }
        return true;
      },
    });
  }

  _updateFx(dt) {
    const fx = this._fx;
    for (let i = fx.length - 1; i >= 0; i--) {
      if (!fx[i].update(dt)) fx.splice(i, 1);
    }
  }

  /* ------------------------- sensor glow ------------------------- */

  _updateEyes(dt, t) {
    let target;
    let pulse = 1;
    switch (this.state) {
      case 'dead': target = EYE_COLORS.dead; pulse = Math.max(0, 1 - this._deathT * 1.5) * (Math.random() < 0.3 ? 1 : 0.15); break;
      case 'suspicious':
      case 'search': target = EYE_COLORS.wary; pulse = 0.85 + 0.3 * Math.sin(t * 7); break;
      case 'alert':
      case 'attack': target = EYE_COLORS.hostile; pulse = 1.1 + 0.15 * Math.sin(t * 11); break;
      default: target = EYE_COLORS.calm; pulse = 0.85 + 0.2 * Math.sin(t * 2.1);
    }
    if (this.stunT > 0) pulse = Math.random() < 0.5 ? 1.6 : 0.2;
    if (this._eyeFlare > 0) { pulse *= 1 + this._eyeFlare; this._eyeFlare = 0; }
    this._eyeColor.lerp(target, Math.min(1, dt * 7));

    for (const e of this._eyeMats) {
      if (e.kind === 'sprite' || e.kind === 'basic') {
        e.mat.color.copy(this._eyeColor).multiplyScalar(pulse);
        // solid eye cores would linger as black balls on a dead machine
        if (e.kind === 'basic') e.mat.opacity = this.state === 'dead' ? 0 : 1;
      } else {
        e.mat.emissive.copy(this._eyeColor);
        e.mat.emissiveIntensity = e.base * pulse;
      }
    }
    for (const m of this._emisMats) m.emissiveIntensity = 0.6 + pulse * 0.7;
  }
}
