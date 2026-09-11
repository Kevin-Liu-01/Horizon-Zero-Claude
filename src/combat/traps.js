import * as THREE from 'three';
import { AMMO, tieDownCount } from './weapons.js';

/**
 * ROPECASTER + TRIPCASTER — `combat-roster-missing` /
 * `missing-systems-traps-ropecaster-tools`. Both are SET-UP weapons: neither
 * deals meaningful damage, both change where the fight happens.
 *
 *   Ropecaster  Each rope stakes the machine to the ground. At
 *               `tieDownCount(kind)` ropes (2 for a Watcher, 5 for a
 *               Thunderjaw) it is PINNED — `forceState('downed')`, which is
 *               the same window machine-ai opens for a Critical Hit, held for
 *               as long as the ropes last. Ropes are consumed by the pin and
 *               snap when it ends.
 *
 *   Tripcaster  Two shots make one wire. The first plants an anchor, the
 *               second closes the span (<= `span` m) and spends the ammo. A
 *               machine crossing the wire detonates the payload. Wires are
 *               placed, not thrown, so the wheel shows the placement state
 *               (`traps.placing`) and the world shows a dashed preview.
 *
 * Published on `ctx.combat.traps`:
 *   placing            null | { anchor: Vector3, ammo, span }
 *   wires / ropes      live counts
 *   tiedCount(machine) ropes currently on it
 *   fireRope(origin, dir) / placeWire(point)     (combat drives these)
 *   audit()            { ropes, wires, pins, trips }
 * Events: 'rope-attached' { machine, ropes, need }, 'machine-tied' { machine },
 *         'trap-placed' { kind, a, b }, 'trap-triggered' { kind, machine }
 *
 * Everything is pooled: 24 rope segments, 8 wires, no per-frame allocation.
 */

const ROPE_MAX = 24;
const WIRE_MAX = 8;
const WIRE_H = 0.55;          // metres above ground the wire is strung
const TRIP_R = 0.9;           // how close a machine's body axis must pass

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);
const _ray = { origin: new THREE.Vector3(), direction: new THREE.Vector3() };

const ropeMat = new THREE.MeshStandardMaterial({
  color: 0xc8b183, roughness: 0.9, metalness: 0.0,
});
const stakeMat = new THREE.MeshStandardMaterial({
  color: 0x6a5638, roughness: 0.85, metalness: 0.05,
});
const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 5, 1);
const stakeGeo = new THREE.ConeGeometry(0.055, 0.34, 6);

function setSegment(mesh, a, b, r) {
  _mid.addVectors(a, b).multiplyScalar(0.5);
  _d.subVectors(b, a);
  const len = Math.max(1e-5, _d.length());
  mesh.position.copy(_mid);
  mesh.scale.set(r, len, r);
  mesh.quaternion.setFromUnitVectors(_Y, _d.multiplyScalar(1 / len));
}

export class Traps {
  constructor(ctx, combat) {
    this.ctx = ctx;
    this.combat = combat;
    this.placing = null;
    this._stats = { ropes: 0, wires: 0, pins: 0, trips: 0 };

    /* --------------------------- rope pool ---------------------------- */
    this._ropes = [];
    for (let i = 0; i < ROPE_MAX; i++) {
      const line = new THREE.Mesh(unitCyl, ropeMat);
      const stake = new THREE.Mesh(stakeGeo, stakeMat);
      line.visible = false;
      stake.visible = false;
      line.raycast = () => {};
      stake.raycast = () => {};
      line.castShadow = false;
      ctx.scene.add(line, stake);
      this._ropes.push({
        line, stake, live: false, t: 0, hold: 6,
        machine: null, local: new THREE.Vector3(), anchor: new THREE.Vector3(),
      });
    }

    /* --------------------------- wire pool ---------------------------- */
    this._wires = [];
    for (let i = 0; i < WIRE_MAX; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x101418, emissive: 0xff9a3c, emissiveIntensity: 2.2,
        roughness: 0.5, transparent: true, opacity: 0.95,
      });
      const line = new THREE.Mesh(unitCyl, mat);
      const s0 = new THREE.Mesh(stakeGeo, stakeMat);
      const s1 = new THREE.Mesh(stakeGeo, stakeMat);
      line.visible = s0.visible = s1.visible = false;
      line.raycast = s0.raycast = s1.raycast = () => {};
      ctx.scene.add(line, s0, s1);
      this._wires.push({
        line, mat, s0, s1, live: false, t: 0, life: 90, ammo: null,
        a: new THREE.Vector3(), b: new THREE.Vector3(), armed: 0,
      });
    }

    /* ------------------------ placement preview ----------------------- */
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
    pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this._preview = new THREE.LineSegments(pg, new THREE.LineDashedMaterial({
      color: 0xffd34d, dashSize: 0.28, gapSize: 0.2, transparent: true,
      opacity: 0.9, depthWrite: false, toneMapped: false,
    }));
    this._preview.visible = false;
    this._preview.frustumCulled = false;
    this._preview.raycast = () => {};
    this._preview.renderOrder = 14;
    ctx.scene.add(this._preview);
    this._previewStake = new THREE.Mesh(stakeGeo, stakeMat);
    this._previewStake.visible = false;
    this._previewStake.raycast = () => {};
    ctx.scene.add(this._previewStake);

    ctx.events.on('player-died', () => this.clearPlacement());
  }

  audit() {
    return {
      ...this._stats,
      liveRopes: this._ropes.filter((r) => r.live).length,
      liveWires: this._wires.filter((w) => w.live).length,
      placing: !!this.placing,
    };
  }

  get wires() { return this._wires.filter((w) => w.live).length; }
  get ropes() { return this._ropes.filter((r) => r.live).length; }

  tiedCount(m) {
    let n = 0;
    for (const r of this._ropes) if (r.live && r.machine === m) n++;
    return n;
  }

  /* =========================== ROPECASTER ============================= */

  /**
   * Hitscan rope. Returns the machine it caught, or null. Combat spends the
   * ammo on the shot, not on the catch, exactly like a missed arrow.
   */
  fireRope(origin, dir, def) {
    const ctx = this.ctx;
    _ray.origin.copy(origin);
    _ray.direction.copy(dir).normalize();
    let m = null;
    _p.copy(origin).addScaledVector(_ray.direction, 60);
    const hulls = ctx.hitHulls;
    if (hulls && hulls.raycast) {
      const h = hulls.raycast(_ray, { far: 60 });
      if (h && h.hit) { m = h.machine || null; _p.set(h.x, h.y, h.z); }
    }
    if (!m) return null;

    const slot = this._ropeSlot();
    slot.live = true;
    slot.t = 0;
    slot.hold = def?.tieHold ?? 6.5;
    slot.machine = m;
    slot.local.copy(_p);
    m.root.updateWorldMatrix(true, false);
    m.root.worldToLocal(slot.local);
    // the stake lands between shooter and target, a body-length short
    _d.subVectors(_p, origin).setY(0).normalize();
    slot.anchor.copy(_p).addScaledVector(_d, -((m.bodyRadius ?? 1) + 1.6));
    slot.anchor.y = ctx.terrain ? ctx.terrain.getHeight(slot.anchor.x, slot.anchor.z) : 0;
    slot.stake.position.copy(slot.anchor);
    slot.stake.position.y += 0.14;
    slot.stake.rotation.set(0.2 * (Math.random() - 0.5), Math.random() * 6.28, 0.2 * (Math.random() - 0.5));
    slot.stake.visible = true;
    slot.line.visible = true;
    this._stats.ropes++;

    const n = this.tiedCount(m);
    const need = tieDownCount(m.kind);
    ctx.events.emit('rope-attached', { machine: m, ropes: n, need });
    // a rope makes a dull thud, not a bang
    try { ctx.machines?.noise?.({ x: _p.x, z: _p.z, kind: 'noise', strength: 0.4 }); } catch { /* */ }
    if (n >= need) this._pin(m);
    return m;
  }

  _ropeSlot() {
    let free = null, oldest = null;
    for (const r of this._ropes) {
      if (!r.live) { free = r; break; }
      if (!oldest || r.t > oldest.t) oldest = r;
    }
    const s = free ?? oldest;
    if (s.live) this._dropRope(s);
    return s;
  }

  _dropRope(r) {
    r.live = false;
    r.machine = null;
    r.line.visible = false;
    r.stake.visible = false;
  }

  /**
   * The pin. `forceState('downed')` is machine.js's documented testability
   * hook and the ONLY public route into the downed window — it cancels the
   * current attack, plants the machine and opens machine-ai's Critical Hit
   * prompt, which is exactly what a tie-down is in HZD.
   */
  _pin(m) {
    if (!m || m.alive === false) return;
    if (m.state === 'downed') return;
    try { m.forceState('downed'); } catch { return; }
    this._stats.pins++;
    this.ctx.events.emit('machine-tied', { machine: m, ropes: this.tiedCount(m) });
  }

  /* ============================ TRIPCASTER ============================= */

  /** Begin or close a wire at `point` (a world position on the ground). */
  placeWire(point, ammoId) {
    const def = AMMO[ammoId];
    if (!def || def.trap !== 'wire') return null;
    const ctx = this.ctx;
    const gy = ctx.terrain ? ctx.terrain.getHeight(point.x, point.z) : point.y;

    if (!this.placing || this.placing.ammo !== ammoId) {
      this.placing = { anchor: new THREE.Vector3(point.x, gy, point.z), ammo: ammoId, span: def.span ?? 14 };
      this._previewStake.position.set(point.x, gy + 0.14, point.z);
      this._previewStake.visible = true;
      return { placed: false, anchor: this.placing.anchor };
    }

    _a.copy(this.placing.anchor);
    _b.set(point.x, gy, point.z);
    const len = _a.distanceTo(_b);
    if (len < 1.2) return { placed: false, tooShort: true, anchor: _a };
    if (len > (def.span ?? 14)) {
      // out of span: the new point becomes the anchor instead of failing
      this.placing.anchor.copy(_b);
      this._previewStake.position.set(_b.x, _b.y + 0.14, _b.z);
      return { placed: false, tooFar: true, anchor: _b };
    }

    const w = this._wireSlot();
    w.live = true;
    w.t = 0;
    w.life = def.life ?? 90;
    w.ammo = ammoId;
    w.armed = 0.6;                    // brief arming delay so you can step away
    w.a.copy(_a); w.a.y += WIRE_H;
    w.b.copy(_b); w.b.y += WIRE_H;
    w.mat.emissive.set(def.color ?? '#ff9a3c');
    setSegment(w.line, w.a, w.b, 0.012);
    w.line.visible = true;
    w.s0.position.set(_a.x, _a.y + 0.14, _a.z);
    w.s1.position.set(_b.x, _b.y + 0.14, _b.z);
    w.s0.visible = w.s1.visible = true;
    this._stats.wires++;

    this.clearPlacement();
    this.ctx.events.emit('trap-placed', { kind: ammoId, a: w.a.clone(), b: w.b.clone() });
    return { placed: true, a: w.a, b: w.b };
  }

  clearPlacement() {
    this.placing = null;
    this._preview.visible = false;
    this._previewStake.visible = false;
  }

  _wireSlot() {
    let free = null, oldest = null;
    for (const w of this._wires) {
      if (!w.live) { free = w; break; }
      if (!oldest || w.t > oldest.t) oldest = w;
    }
    const s = free ?? oldest;
    if (s.live) this._killWire(s);
    return s;
  }

  _killWire(w) {
    w.live = false;
    w.line.visible = false;
    w.s0.visible = false;
    w.s1.visible = false;
  }

  /* ============================== update =============================== */

  update(dt, aimPoint, activeAmmo) {
    this._updateRopes(dt);
    this._updateWires(dt);
    this._updatePreview(aimPoint, activeAmmo);
  }

  _updateRopes(dt) {
    for (const r of this._ropes) {
      if (!r.live) continue;
      const m = r.machine;
      if (!m || m.alive === false || m._disposed) { this._dropRope(r); continue; }
      r.t += dt;
      if (r.t > r.hold) { this._dropRope(r); continue; }
      // follow the machine: the rope end is stored in ITS local space
      _p.copy(r.local);
      m.root.updateWorldMatrix(true, false);
      m.root.localToWorld(_p);
      setSegment(r.line, r.anchor, _p, 0.014);
      // hold the pin for as long as the ropes last
      if (this.tiedCount(m) >= tieDownCount(m.kind)
        && m.state !== 'downed' && m.state !== 'dead' && r.t > 0.2) {
        this._pin(m);
      }
    }
  }

  _updateWires(dt) {
    const list = this.ctx.machines?.list;
    for (const w of this._wires) {
      if (!w.live) continue;
      w.t += dt;
      w.armed = Math.max(0, w.armed - dt);
      if (w.t > w.life) { this._killWire(w); continue; }
      // fade out over the last 6 s so it never vanishes mid-frame
      const left = w.life - w.t;
      w.mat.opacity = left < 6 ? Math.max(0.1, left / 6) : 0.95;
      w.mat.emissiveIntensity = 1.4 + 0.8 * Math.sin(w.t * 3.1);
      if (w.armed > 0 || !list) continue;

      for (const m of list) {
        if (!m || m.alive === false || !m.root || m._disposed) continue;
        // the machine's legs sweep a cylinder; the wire is a segment
        const r = (m.bodyRadius ?? 1) * 0.9 + TRIP_R;
        if (distPointSeg2(m.position, w.a, w.b) > r * r) continue;
        // ...and it must be low enough to catch (a Glinthawk in the air is not)
        const gy = this.ctx.terrain ? this.ctx.terrain.getHeight(m.position.x, m.position.z) : 0;
        if (m.position.y - gy > 2.2) continue;
        this._trigger(w, m);
        break;
      }
    }
  }

  _trigger(w, m) {
    const def = AMMO[w.ammo];
    _mid.addVectors(w.a, w.b).multiplyScalar(0.5);
    // blow at the point the machine actually crossed, not at the midpoint
    closestOnSeg(m.position, w.a, w.b, _p);
    this._stats.trips++;
    this._killWire(w);
    this.ctx.events.emit('trap-triggered', { kind: w.ammo, machine: m, point: _p.clone() });
    this.combat?.detonate?.(_p, def, m);
  }

  _updatePreview(aimPoint, activeAmmo) {
    const pl = this.placing;
    if (!pl || !aimPoint || pl.ammo !== activeAmmo) {
      if (this._preview.visible) this._preview.visible = false;
      if (!pl) this._previewStake.visible = false;
      return;
    }
    const gy = this.ctx.terrain ? this.ctx.terrain.getHeight(aimPoint.x, aimPoint.z) : aimPoint.y;
    const attr = this._preview.geometry.attributes.position;
    attr.setXYZ(0, pl.anchor.x, pl.anchor.y + WIRE_H, pl.anchor.z);
    attr.setXYZ(1, aimPoint.x, gy + WIRE_H, aimPoint.z);
    attr.needsUpdate = true;
    this._preview.computeLineDistances();
    const len = Math.hypot(aimPoint.x - pl.anchor.x, aimPoint.z - pl.anchor.z);
    this._preview.material.color.set(len > pl.span ? 0xb03a2e : 0xffd34d);
    this._preview.visible = true;
    this._previewStake.visible = true;
  }
}

/* ------------------------------- geometry --------------------------------- */

function closestOnSeg(p, a, b, out) {
  _d.subVectors(b, a);
  const l2 = _d.lengthSq();
  if (l2 < 1e-8) return out.copy(a);
  const t = THREE.MathUtils.clamp(
    ((p.x - a.x) * _d.x + (p.z - a.z) * _d.z) / l2, 0, 1);
  return out.copy(a).addScaledVector(_d, t);
}

/** Squared XZ distance from `p` to segment ab. */
function distPointSeg2(p, a, b) {
  closestOnSeg(p, a, b, _p);
  const dx = p.x - _p.x, dz = p.z - _p.z;
  return dx * dx + dz * dz;
}
