import * as THREE from 'three';
import { itemDef } from './items.js';

/**
 * TOOLS & POTIONS QUICK-SLOTS  —  lane `focus-items` (port 5212)
 * ===========================================================================
 * Closes the `focus-items` half of `ui-11` ("no tool quick-slots") and
 * `missing-systems-007` (potions/tools). `shell-hud` owns the bottom-left
 * strip's pixels; this module owns its DATA and its behaviour, so the strip is
 * a pure render of a published object and the two lanes never fight.
 *
 * ---------------------------------------------------------------------------
 * PUBLISHED — `ctx.items.tools`
 * ---------------------------------------------------------------------------
 *   slots      -> [{ id, name, glyph, color, rarity, count, cap, ready,
 *                    blocked }]      (stable order; count is live)
 *   index      -> selected slot index
 *   active     -> the selected slot object, or null
 *   select(i)  -> bool               cycle(+1 | -1) -> slot
 *   use()      -> bool               (F, or the strip's own button)
 *   cooldown   -> 0..1 remaining fraction on the active slot
 *   useKey     -> 'KeyF'             (what the strip should print)
 *   audit()    -> a flat object for gates
 *
 * EVENTS
 *   'tool-selected' { id, index, name }
 *   'tool-used'     { id, name, count }
 *   'tool-blocked'  { id, reason }
 *   'tool-throw'    { id, from:Vector3, to:Vector3, flight }   (animator hook)
 *
 * KEYS  F use · [ / ] cycle · 1..3 direct select.
 * F is ignored while mounted — `machines.overrides` owns F for dismount.
 *
 * The thrown rock is one pooled InstancedMesh (6 in flight max, one draw
 * call) with zero per-frame allocation.
 */

const SLOT_IDS = ['rock', 'potion-vigor', 'trap-shock'];
const ROCK_POOL = 6;
const THROW_RANGE = 16;      // metres down the aim ray
const THROW_SPEED = 22;      // m/s launch speed of the lob
/** The wire ammo `combat.traps` recognises (weapons.js AMMO, `trap: 'wire'`). */
const WIRE_AMMO = 'tripwire-shock';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);

export class Tools {
  constructor(ctx, inventory) {
    this.ctx = ctx;
    this.inventory = inventory;
    this.useKey = 'KeyF';
    // shell-hud prints these on the strip's chevrons. NOT digits: 1-4 are
    // combat's weapon slots (SPEC §10) and input fires every handler bound
    // to a code, so a shared digit would drive both systems at once.
    this.cycleKeys = ['BracketLeft', 'BracketRight'];

    this.index = 0;
    this._cd = 0;
    this._cdMax = 1;

    this.slots = SLOT_IDS.map((id) => {
      const def = itemDef(id);
      return {
        id, name: def.name, glyph: def.glyph, color: def.color,
        rarity: def.rarity ?? 'common',
        count: 0, cap: 0, ready: false, blocked: null,
      };
    });

    this._buildRocks();
    this._bind();
    this.refresh();
  }

  get active() { return this.slots[this.index] ?? null; }
  get cooldown() { return this._cdMax > 0 ? Math.max(0, this._cd / this._cdMax) : 0; }

  /* -------------------------------------------------------------- input */

  _bind() {
    const ctx = this.ctx;
    const live = () => ctx.state === 'playing' || ctx.params?.has('shot');
    ctx.input.onDown('KeyF', () => {
      // F belongs to dismount while riding — machine-ai owns that binding
      if (ctx.machines?.mounted || ctx.player?.mounted) return;
      if (live()) this.use();
    });
    ctx.input.onDown('BracketRight', () => { if (live()) this.cycle(1); });
    ctx.input.onDown('BracketLeft', () => { if (live()) this.cycle(-1); });
    // NO Digit1-3 here. SPEC.md §10 assigns 1-4 to the weapon slots and
    // `combat` already owns Digit1..Digit6; input stores handlers in a Set,
    // so a digit bound twice fires BOTH systems off one keypress (pressing 3
    // for the War Bow would silently re-arm F to the trap). Tools cycle on
    // [ / ] and fire on `useKey`; direct tool digits need a SPEC amendment
    // and a matching change in combat, which is not this lane's file.
  }

  /* ------------------------------------------------------------ selection */

  select(i) {
    if (!(i >= 0 && i < this.slots.length) || i === this.index) return false;
    this.index = i;
    const s = this.active;
    this.ctx.events?.emit?.('tool-selected', { id: s.id, index: i, name: s.name });
    return true;
  }

  cycle(dir = 1) {
    const n = this.slots.length;
    this.index = ((this.index + (dir >= 0 ? 1 : -1)) % n + n) % n;
    const s = this.active;
    this.ctx.events?.emit?.('tool-selected', { id: s.id, index: this.index, name: s.name });
    return s;
  }

  /** Recompute live counts/ready flags (cheap; called on the slot tick). */
  refresh() {
    const inv = this.inventory;
    const items = this.ctx.items;
    for (const s of this.slots) {
      s.count = inv.count(s.id);
      s.cap = items?.capacity ? items.capacity(s.id) : (itemDef(s.id).cap ?? 0);
      s.blocked = s.count > 0 ? null : 'NONE LEFT';
      s.ready = s.count > 0;
    }
    const a = this.active;
    if (a && this._cd > 0) { a.ready = false; a.blocked = 'READY SOON'; }
  }

  /* ------------------------------------------------------------------ use */

  use() {
    const s = this.active;
    if (!s) return false;
    if (this._cd > 0) {
      this.ctx.events?.emit?.('tool-blocked', { id: s.id, reason: 'READY SOON' });
      return false;
    }
    if (this.inventory.count(s.id) <= 0) {
      this.ctx.events?.emit?.('tool-blocked', { id: s.id, reason: 'NONE LEFT' });
      return false;
    }
    const fn = this[`_use_${s.id.replace(/-/g, '_')}`];
    if (typeof fn !== 'function') return false;
    const out = fn.call(this, s);
    if (!out?.ok) {
      this.ctx.events?.emit?.('tool-blocked', { id: s.id, reason: out?.reason ?? 'CANNOT USE' });
      return false;
    }
    this.inventory.take(s.id, 1);
    this._cdMax = out.cooldown ?? 0.9;
    this._cd = this._cdMax;
    this.refresh();
    this.ctx.events?.emit?.('tool-used', {
      id: s.id, name: s.name, count: this.inventory.count(s.id),
    });
    return true;
  }

  /** Rock: a thrown lure. Machines walk to the noise, not to you. */
  _use_rock() {
    const to = this._aimPoint(THROW_RANGE);
    const from = this._handPoint();
    const flight = this._launchRock(from, to);
    this.ctx.events?.emit?.('tool-throw', {
      id: 'rock', from: from.clone(), to: to.clone(), flight,
    });
    return { ok: true, cooldown: 0.8 };
  }

  /** Vigour Draught: fills the medicine pouch outright. */
  _use_potion_vigor() {
    const p = this.ctx.player;
    if (!p) return { ok: false, reason: 'NO POUCH' };
    if (p.pouch >= (p.maxPouch ?? 100) - 0.5) return { ok: false, reason: 'POUCH FULL' };
    p.addPouch?.((p.maxPouch ?? 100) - p.pouch);
    this.ctx.events?.emit?.('item-gained', {
      id: 'potion-vigor', count: 1, total: Math.round(p.pouch ?? 0),
      name: 'Pouch Refilled', glyph: '⚱', color: '#7fb069',
    });
    return { ok: true, cooldown: 1.4 };
  }

  /**
   * Shock Wire Trap: spans one tripwire across the ground in front of Aloy
   * through `combat.traps` — the lane that owns wires owns the wire.
   */
  _use_trap_shock() {
    const traps = this.ctx.combat?.traps;
    if (typeof traps?.placeWire !== 'function') {
      return { ok: false, reason: 'NO PLACE FOR IT' };
    }
    const p = this.ctx.player;
    if (!p) return { ok: false, reason: 'NO PLACE FOR IT' };
    const cam = this.ctx.camera;
    cam.getWorldDirection(_dir);
    _dir.y = 0;
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, 1);
    _dir.normalize();
    const across = _v2.set(-_dir.z, 0, _dir.x); // XZ perpendicular
    const mid = _v.copy(p.position).addScaledVector(_dir, 4.5);
    const a = mid.clone().addScaledVector(across, -2.6);
    const b = mid.clone().addScaledVector(across, 2.6);
    const T = this.ctx.terrain;
    if (T) { a.y = T.getHeight(a.x, a.z); b.y = T.getHeight(b.x, b.z); }
    // `combat.traps.placeWire` is a two-step API: the first call plants the
    // anchor, the second closes the span. The tool does both in one press and
    // only spends the trap if the wire actually went up.
    let out = null;
    try {
      traps.clearPlacement?.();
      traps.placeWire(a, WIRE_AMMO);
      out = traps.placeWire(b, WIRE_AMMO);
    } catch {
      traps.clearPlacement?.();
      return { ok: false, reason: 'NO PLACE FOR IT' };
    }
    if (!out?.placed) {
      traps.clearPlacement?.();
      return { ok: false, reason: 'NO PLACE FOR IT' };
    }
    return { ok: true, cooldown: 1.6 };
  }

  /* ------------------------------------------------------- thrown rock FX */

  _buildRocks() {
    const geo = new THREE.DodecahedronGeometry(0.085, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8d867a, roughness: 0.95, metalness: 0.02,
    });
    this.rocks = new THREE.InstancedMesh(geo, mat, ROCK_POOL);
    this.rocks.name = 'thrown-rocks';
    this.rocks.frustumCulled = false;
    this.rocks.castShadow = false;
    this.rocks.receiveShadow = false;
    for (let i = 0; i < ROCK_POOL; i++) this.rocks.setMatrixAt(i, ZERO_M);
    this.rocks.instanceMatrix.needsUpdate = true;
    this.ctx.scene.add(this.rocks);
    /** Pre-allocated flight records — the hot loop never allocates. */
    this._flights = [];
    for (let i = 0; i < ROCK_POOL; i++) {
      this._flights.push({
        live: false, t: 0, ttl: 0,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        to: new THREE.Vector3(), spin: 0,
      });
    }
  }

  _handPoint() {
    const p = this.ctx.player;
    const cam = this.ctx.camera;
    _v2.copy(p?.position ?? cam.position);
    _v2.y += 1.45;
    cam.getWorldDirection(_dir);
    _v2.addScaledVector(_dir, 0.35);
    return _v2.clone();
  }

  /** Where the throw lands: down the aim ray, snapped to the heightfield. */
  _aimPoint(range) {
    const cam = this.ctx.camera;
    cam.getWorldDirection(_dir);
    const T = this.ctx.terrain;
    const o = cam.position;
    let hit = null;
    if (T) {
      let prev = 0;
      for (let s = 2; s <= range + 8; s += 1.5) {
        const x = o.x + _dir.x * s, y = o.y + _dir.y * s, z = o.z + _dir.z * s;
        if (y <= T.getHeight(x, z)) {
          let lo = prev, hi = s;
          for (let i = 0; i < 6; i++) {
            const mid = (lo + hi) * 0.5;
            const my = o.y + _dir.y * mid;
            if (my > T.getHeight(o.x + _dir.x * mid, o.z + _dir.z * mid)) lo = mid;
            else hi = mid;
          }
          hit = hi; break;
        }
        prev = s;
      }
    }
    const d = Math.min(range, hit ?? range);
    const out = new THREE.Vector3(o.x + _dir.x * d, 0, o.z + _dir.z * d);
    out.y = (T?.getHeight?.(out.x, out.z) ?? 0) + 0.08;
    return out;
  }

  _launchRock(from, to) {
    let f = null;
    let slot = -1;
    for (let i = 0; i < this._flights.length; i++) {
      if (!this._flights[i].live) { f = this._flights[i]; slot = i; break; }
    }
    if (!f) { f = this._flights[0]; slot = 0; }
    f.live = true;
    f.slot = slot;
    f.t = 0;
    f.pos.copy(from);
    f.to.copy(to);
    // ballistic solve for a lob that lands on `to` at THROW_SPEED horizontal
    const dx = to.x - from.x, dz = to.z - from.z;
    const flat = Math.max(0.4, Math.hypot(dx, dz));
    const tf = Math.min(1.8, flat / THROW_SPEED + 0.18);
    f.ttl = tf;
    const g = 22;
    f.vel.set(dx / tf, (to.y - from.y) / tf + 0.5 * g * tf, dz / tf);
    f.spin = 6 + Math.random() * 6;
    return tf;
  }

  /* ---------------------------------------------------------------- frame */

  update(dt) {
    if (this._cd > 0) {
      this._cd = Math.max(0, this._cd - dt);
      if (this._cd === 0) this.refresh();
    }
    this._tick = (this._tick ?? 0) - dt;
    if (this._tick <= 0) { this._tick = 0.2; this.refresh(); }

    const g = 22;
    let any = false;
    for (const f of this._flights) {
      if (!f.live) continue;
      any = true;
      f.t += dt;
      f.vel.y -= g * dt;
      f.pos.addScaledVector(f.vel, dt);
      const ground = this.ctx.terrain?.getHeight?.(f.pos.x, f.pos.z) ?? 0;
      if (f.t >= f.ttl || f.pos.y <= ground + 0.06) {
        f.live = false;
        this.rocks.setMatrixAt(f.slot, ZERO_M);
        this._land(f.pos.x, ground, f.pos.z);
        continue;
      }
      _q.setFromAxisAngle(_dir.set(0.4, 0.7, 0.6).normalize(), f.t * f.spin);
      _m.compose(f.pos, _q, _s);
      this.rocks.setMatrixAt(f.slot, _m);
    }
    if (any) this.rocks.instanceMatrix.needsUpdate = true;
  }

  /** Impact: one lure stimulus through machine-ai's published bus. */
  _land(x, y, z) {
    const M = this.ctx.machines;
    _v.set(x, y, z);
    let heard = 0;
    if (typeof M?.lure === 'function') heard = M.lure(_v, { kind: 'lure' }) ?? 0;
    else if (typeof M?.noise === 'function') {
      heard = M.noise({ pos: _v, kind: 'lure', radius: 26, strength: 0.7 }) ?? 0;
    } else if (typeof M?.stimulus?.emit === 'function') {
      heard = M.stimulus.emit({ pos: _v, kind: 'lure', radius: 26, strength: 0.7 }) ?? 0;
    }
    this.ctx.events?.emit?.('tool-landed', { id: 'rock', x, y, z, heard });
  }

  audit() {
    return {
      useKey: this.useKey,
      cycleKeys: this.cycleKeys,
      index: this.index,
      active: this.active?.id ?? null,
      cooldown: +this.cooldown.toFixed(3),
      slots: this.slots.map((s) => ({
        id: s.id, name: s.name, glyph: s.glyph, color: s.color,
        rarity: s.rarity, count: s.count, cap: s.cap, ready: s.ready,
      })),
    };
  }
}
