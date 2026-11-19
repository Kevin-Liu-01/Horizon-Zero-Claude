/**
 * CALIMA · the clay pots (Milestone 2 area D, wave 3; bible §8.1 "Pots (clay, pendulum cast)", §8.3, §13 rule 5 "Pots
 * are pendulum casts ... at waist-to-chest height; no overhand throw exists"; KT3, KT5).
 *
 *   Brine Pot   a pale mist, 3 m, 8 s: Seized (joints lock, seized parts come off with one Pry or hook-rip)
 *   Cinder Pot  a fire pool, 2.5 m, 6 s: Charred (burn over time)
 *   Dust Pot    a dust cloud, 3.5 m, 6 s: Clouded (lamps blinded; the sightline through it is broken)
 * Carry cap 3 in all (bible "Carry caps": pots 3). Oro hands over two Brine and one Cinder at 0:35; Dust is made.
 *
 * THE CAST is a pendulum: the right hand takes the pot from the belt at her back (beside the lumbar), swings it down and
 * back past her hip, then forward and up, and lets go at or below her chest. The pot's flight is a plain ballistic arc
 * from the hand at the release; the launch speed is solved for the aimed point (`castVelocity`), so it lands where
 * the reticle is. Rules only, no THREE: the Node twin (src/combat/kit-m2.test.mjs) and the game run this file.
 */

export const G = 9.81;

/** The three pots: the element, its colour (bible §8.3; nothing violet), the field's radius and life. */
export const POTS = Object.freeze({
  brine: Object.freeze({ id: 'brine', word: 'BRINE POT', element: 'brine', colour: '#BDE6E3', radius: 3.0, lifeS: 8, field: 'mist' }),
  cinder: Object.freeze({ id: 'cinder', word: 'CINDER POT', element: 'cinder', colour: '#FF7A1A', radius: 2.5, lifeS: 6, field: 'pool' }),
  dust: Object.freeze({ id: 'dust', word: 'DUST POT', element: 'dust', colour: '#C98B4E', radius: 3.5, lifeS: 6, field: 'cloud' }),
});
export const POT_ORDER = Object.freeze(['brine', 'cinder', 'dust']);
export const POT_CAP = 3;

/**
 * The cast's phases (sim seconds; request to release 0.533 s, KT3 band 0.45-0.65):
 *   T take     the right hand reaches back to the belt beside the lumbar and closes on the pot's neck cord
 *   B back     the pendulum's back swing: down past her hip, the arm straight, the pot behind her thigh
 *   F forward  the swing forward and up: the hip turns into it first, the shoulder after
 *   R release  the fingers open with the hand in front of her, at or below her chest
 *   O follow   the arm follows through low and comes back to her side
 */
export const POT_CAST = Object.freeze({
  phases: Object.freeze([['T', 0.20], ['B', 0.15], ['F', 0.183], ['R', 0.0], ['O', 0.30]]),
  releaseAt: 0.533,
  total: 0.833,
  /** the arc's launch angle above level (deg): an underarm lob */
  angleDeg: 38,
  /** the aimed range (m): nearer is cast at the near bound, farther clamped to the far one */
  minRange: 2, maxRange: 16,
});

/** The phase of the cast at `t` s: [name, k 0..1]. */
export function castPhase(t, out = ['', 0]) {
  let a = 0;
  for (const [n, d] of POT_CAST.phases) {
    if (t < a + d || d === 0 && t <= a) { out[0] = n; out[1] = d > 0 ? (t - a) / d : 1; return out; }
    a += d;
  }
  out[0] = 'O'; out[1] = 1;
  return out;
}

/**
 * The launch velocity from the release point `from` to land on `to` (world, y up) at the cast's angle, raised if the
 * target stands too high for it. Into `out` {x, y, z}; returns null when it cannot reach.
 */
export function castVelocity(from, to, out = { x: 0, y: 0, z: 0 }, angleDeg = POT_CAST.angleDeg) {
  const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) { out.x = 0; out.z = 0; out.y = 0; return out; }
  let th = angleDeg * Math.PI / 180;
  // the arc must rise above the target's height: dy < d tan(th)
  for (let i = 0; i < 8 && d * Math.tan(th) - dy < 0.05 * d; i++) th = Math.min(1.3, th + 0.08);
  const den = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) - dy);
  if (!(den > 0)) return null;
  const v = Math.sqrt(G * d * d / den);
  const h = v * Math.cos(th);
  out.x = dx / d * h; out.z = dz / d * h; out.y = v * Math.sin(th);
  return out;
}

/**
 * Fly a pot from `from` at velocity `v` over ground `groundY(x, z)` at `dt` steps until it lands; returns
 * { x, y, z, t } of the landing (the first step below the ground, back-interpolated) or null after `maxS`.
 */
export function flyPot(from, v, groundY, dt = 1 / 60, maxS = 4) {
  let x = from.x, y = from.y, z = from.z, vy = v.y;
  for (let t = 0; t < maxS; t += dt) {
    const nx = x + v.x * dt, nz = z + v.z * dt;
    const ny = y + vy * dt - 0.5 * G * dt * dt;
    vy -= G * dt;
    const g = groundY(nx, nz);
    if (ny <= g) {
      const g0 = groundY(x, z), a = (y - g0) / Math.max(1e-6, (y - g0) - (ny - g));
      return { x: x + (nx - x) * a, y: g, z: z + (nz - z) * a, t: t + dt * a };
    }
    x = nx; y = ny; z = nz;
  }
  return null;
}

/** The aimed point clamped to the cast's range from `from` (a point on the ground; `groundY` gives its height). */
export function clampAim(from, to, groundY, out = { x: 0, y: 0, z: 0 }) {
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz) || 1e-6;
  const k = Math.max(POT_CAST.minRange, Math.min(POT_CAST.maxRange, d)) / d;
  out.x = from.x + dx * k; out.z = from.z + dz * k; out.y = groundY(out.x, out.z);
  return out;
}

/**
 * The belt (counts per pot, the type the wheel has selected; cap 3 in all). `take()` spends one of the selected type.
 */
export class PotBelt {
  constructor() {
    this.count = { brine: 0, cinder: 0, dust: 0 };
    this.selected = 'brine';
    this.owned = false;
  }

  get total() { return this.count.brine + this.count.cinder + this.count.dust; }

  /** Add `n` of `id` up to the cap; returns how many went in. */
  add(id, n = 1) {
    if (!POTS[id]) return 0;
    const k = Math.max(0, Math.min(n | 0, POT_CAP - this.total));
    this.count[id] += k;
    if (k && !this.count[this.selected]) this.selected = id;
    this.owned = this.owned || k > 0;
    return k;
  }

  /** The mouse wheel: the next type she carries (skips the empty ones; stays when none). */
  cycle(dir = 1) {
    const i0 = POT_ORDER.indexOf(this.selected);
    for (let s = 1; s <= POT_ORDER.length; s++) {
      const id = POT_ORDER[(i0 + dir * s + POT_ORDER.length * 4) % POT_ORDER.length];
      if (this.count[id] > 0) { this.selected = id; return id; }
    }
    return this.selected;
  }

  /** Spend one of the selected type; returns its id, or null when there is none. */
  take() {
    let id = this.selected;
    if (!(this.count[id] > 0)) id = POT_ORDER.find((k) => this.count[k] > 0) ?? null;
    if (!id) return null;
    this.count[id]--;
    this.selected = id;
    if (!this.count[id]) this.cycle(1);
    return id;
  }
}

/**
 * One field on the ground: a Brine mist, a Cinder pool or a Dust cloud. `contains(x, y, z)` for the machines it
 * reaches; `left` seconds.
 */
export class PotField {
  constructor(id, at) {
    const P = POTS[id];
    this.id = id; this.def = P;
    this.x = at.x; this.y = at.y; this.z = at.z;
    this.r = P.radius; this.left = P.lifeS; this.age = 0;
  }

  get alive() { return this.left > 1e-6; }

  step(dt) { this.age += dt; this.left = Math.max(0, this.left - dt); }

  /** Is the point inside the field (a flat disc for the pool, a squat dome for the mist and the cloud)? */
  contains(x, y, z, pad = 0) {
    const dx = x - this.x, dz = z - this.z, R = this.r + pad;
    if (dx * dx + dz * dz > R * R) return false;
    const top = this.def.field === 'pool' ? 1.2 : this.r * 1.1;
    return y >= this.y - 1 && y <= this.y + top;
  }
}

/* =====================================================================================================================
 * THE LIVE KIT (the game's half; Node never builds it). `ctx.combat.pots` (ensurePots):
 *   pots.grant({ brine, cinder, dust })   the hand-over (bible 0:35: two Brine, one Cinder)
 *   pots.cast(aim)                        F: start the cast at the aimed ground point (world); false when none or busy
 *   pots.release(handWorld)               the animator's potLayer at the release step (the hand's world point)
 *   pots.step(dt)                         sim time: the cast's clock, the pots in flight, the fields and what they do
 *   pots.casting                          { t, id, released, aim } while a cast runs (the layer reads it)
 * The pots and fields are drawn by `PotView` (lazy; one shared clay material, the fields' own translucent ones).
 * ===================================================================================================================== */
import * as THREE from 'three';
import { StatusBook, ELEMENT_STATUS } from './status.js';

const CLAY = 0xB07A52;
/** The pot's lathe (m): base, belly, shoulder, neck, lip; 0.12 m tall. */
const POT_PROFILE = [[0.0, 0.0], [0.030, 0.004], [0.046, 0.030], [0.048, 0.055], [0.040, 0.080], [0.020, 0.096], [0.017, 0.106], [0.022, 0.114], [0.0, 0.118]];

/** One pot's geometry with its band (the element's colour) as vertex colours. */
function potGeometry(id) {
  const pts = POT_PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 10);
  const col = new THREE.Color(CLAY), band = new THREE.Color(POTS[id].colour), c = new Float32Array(g.attributes.position.count * 3);
  const py = g.attributes.position;
  for (let i = 0; i < py.count; i++) {
    const y = py.getY(i);
    const k = y > 0.074 && y < 0.098 ? band : col;   // the shoulder band, painted in the element's colour
    c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.translate(0, -0.055, 0);   // its origin at the belly's centre (the hand's grip)
  return g;
}

export class PotView {
  constructor(ctx) {
    this.ctx = ctx;
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
    this.geo = { brine: potGeometry('brine'), cinder: potGeometry('cinder'), dust: potGeometry('dust') };
    /** the pot in her hand and the one in flight (one at a time) */
    this.held = new THREE.Mesh(this.geo.brine, this.mat); this.held.name = 'held-pot'; this.held.visible = false; this.held.castShadow = true;
    this.fly = new THREE.Mesh(this.geo.brine, this.mat); this.fly.name = 'flying-pot'; this.fly.visible = false; this.fly.castShadow = true;
    ctx.scene?.add(this.fly);
    this.fieldMeshes = [];
  }

  setHeld(id, hand) {
    const m = this.held;
    if (!id || !hand) { m.visible = false; return; }
    if (m.geometry !== this.geo[id]) m.geometry = this.geo[id];
    if (m.parent !== hand) hand.add(m);
    hand.updateWorldMatrix(true, false);
    const s = new THREE.Vector3().setFromMatrixScale(hand.matrixWorld).x || 1;
    m.scale.setScalar(1 / s);
    // in the palm: a little out from the palm toward the fingers (the hand's +Y) and in front of it
    m.position.set(0, 0.075 / s, 0.03 / s);
    m.visible = true;
  }

  field(f) {
    const P = f.def;
    let mesh;
    if (P.field === 'pool') {
      mesh = new THREE.Mesh(new THREE.CircleGeometry(f.r, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: P.colour, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
      mesh.position.set(f.x, f.y + 0.04, f.z);
    } else {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(f.r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: P.colour, transparent: true, opacity: P.field === 'cloud' ? 0.42 : 0.30, depthWrite: false }));
      mesh.position.set(f.x, f.y - 0.1, f.z);
      mesh.scale.set(1, P.field === 'cloud' ? 0.8 : 0.55, 1);
    }
    mesh.name = `pot-field-${f.id}`;
    mesh.renderOrder = 2;
    this.ctx.scene?.add(mesh);
    f.mesh = mesh;
    f.op0 = mesh.material.opacity;
  }

  stepField(f) {
    const m = f.mesh;
    if (!m) return;
    // in over 0.25 s, out over the last 1 s; the pool flickers
    const k = Math.min(1, f.age / 0.25) * Math.min(1, f.left / 1.0);
    m.material.opacity = f.op0 * k * (f.def.field === 'pool' ? 0.85 + 0.15 * Math.sin(f.age * 23) : 1);
    if (f.def.field !== 'pool') { const g = 1 + 0.12 * Math.min(1, f.age / 1.5); m.scale.x = m.scale.z = g; }
  }

  dropField(f) {
    if (!f.mesh) return;
    f.mesh.removeFromParent(); f.mesh.geometry.dispose(); f.mesh.material.dispose(); f.mesh = null;
  }

  dispose() {
    this.held.removeFromParent(); this.fly.removeFromParent();
    for (const g of Object.values(this.geo)) g.dispose();
    this.mat.dispose();
  }
}

const _hp = new THREE.Vector3(), _pp = new THREE.Vector3();

export class PotKit {
  constructor(ctx) {
    this.ctx = ctx;
    this.belt = new PotBelt();
    this.casting = null;
    this.flying = null;
    this.fields = [];
    this.status = null;     // the combat's StatusBook (shared)
    this.view = null;
    this.casts = 0; this.landed = [];
    this.onLand = null;
  }

  get owned() { return this.belt.owned; }

  grant({ brine = 2, cinder = 1, dust = 0 } = {}) {
    this.belt.add('brine', brine); this.belt.add('cinder', cinder); this.belt.add('dust', dust);
    this.belt.owned = true;
    return this;
  }

  /** The cast's phase now ('T' | 'B' | 'F' | 'R' | 'O' | ''), and its share. */
  phase(out = ['', 0]) { if (!this.casting) { out[0] = ''; out[1] = 0; return out; } return castPhase(this.casting.t, out); }

  /** F: start a cast at the aimed point (world {x, y, z}); the pot is spent at the release. */
  cast(aim) {
    if (this.casting || this.flying || !(this.belt.total > 0)) return false;
    const id = this.belt.count[this.belt.selected] > 0 ? this.belt.selected : POT_ORDER.find((k) => this.belt.count[k] > 0);
    if (!id) return false;
    this.casting = { t: 0, id, released: false, aim: { x: aim.x, y: aim.y, z: aim.z } };
    this.casts++;
    return true;
  }

  cancel() { this.casting = null; this.view?.setHeld(null); }

  /** The animator's release: the pot leaves the hand at `hand` (world) for the aimed point. */
  release(hand) {
    const c = this.casting;
    if (!c || c.released) return false;
    const id = this.belt.take();
    c.released = true;
    if (!id) return false;
    const v = castVelocity(hand, c.aim);
    if (!v) return false;
    this.flying = { id, x: hand.x, y: hand.y, z: hand.z, vx: v.x, vy: v.y, vz: v.z, t: 0, aim: { ...c.aim }, from: { x: hand.x, y: hand.y, z: hand.z } };
    this.view?.setHeld(null);
    return true;
  }

  /** Sim time. */
  step(dt) {
    if (!(dt > 0)) return;
    const ctx = this.ctx;
    if (!this.view && ctx.scene) this.view = new PotView(ctx);
    const c = this.casting;
    if (c) {
      c.t += dt;
      // (no animator released it: the pot leaves from in front of her chest, so a cast is never lost)
      if (!c.released && c.t >= POT_CAST.releaseAt + 2 / 60) {
        const p = ctx.player?.position;
        if (p) { _hp.set(p.x + Math.sin(ctx.player.heading || 0) * 0.35, p.y + 1.1, p.z + Math.cos(ctx.player.heading || 0) * 0.35); this.release(_hp); }
        else c.released = true;
      }
      if (c.t >= POT_CAST.total) this.casting = null;
    }
    const f = this.flying;
    if (f) {
      const terr = ctx.terrain;
      const gy = (x, z) => terr?.getHeight?.(x, z) ?? 0;
      const nx = f.x + f.vx * dt, nz = f.z + f.vz * dt, ny = f.y + f.vy * dt - 0.5 * G * dt * dt;
      f.vy -= G * dt; f.t += dt;
      const g = gy(nx, nz);
      if (ny <= g || f.t > 4) {
        this.flying = null;
        if (this.view) this.view.fly.visible = false;
        this._land(f.id, { x: nx, y: g, z: nz }, f);
      } else {
        f.x = nx; f.y = ny; f.z = nz;
        const m = this.view?.fly;
        if (m) { if (m.geometry !== this.view.geo[f.id]) m.geometry = this.view.geo[f.id]; m.position.set(f.x, f.y, f.z); m.rotation.x += dt * 9; m.visible = true; }
      }
    }
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const F = this.fields[i];
      F.step(dt);
      this.view?.stepField(F);
      this._affect(F);
      if (!F.alive) { this.view?.dropField(F); this.fields.splice(i, 1); }
    }
  }

  _land(id, at, f) {
    const F = new PotField(id, at);
    F.hits = new Set();
    this.fields.push(F);
    this.view?.field(F);
    const miss = Math.hypot(at.x - f.aim.x, at.z - f.aim.z);
    const rec = { id, at: { x: +at.x.toFixed(2), y: +at.y.toFixed(2), z: +at.z.toFixed(2) }, aim: f.aim, missM: +miss.toFixed(3), range: +Math.hypot(at.x - f.from.x, at.z - f.from.z).toFixed(2), flightS: +f.t.toFixed(3) };
    this.landed.push(rec); if (this.landed.length > 16) this.landed.shift();
    // Dust: the sightline through the cloud is broken (the perception's own Dust clouds, src/entities/machines/ai)
    if (id === 'dust') { try { this.ctx.machines?.perception?.addDustCloud?.({ x: at.x, y: at.y + 1.2, z: at.z, r: F.r, seconds: F.left }); } catch { /* none */ } }
    try { this.onLand?.(rec, F); } catch { /* none */ }
    this.ctx.events?.emit?.('pot-landed', rec);
  }

  /** What a field does to the machines in it (each machine once per field; Brine seizes the parts inside it). */
  _affect(F) {
    const list = this.ctx.machines?.list;
    if (!list || !this.status) return;
    const id = ELEMENT_STATUS[F.def.element];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m || m.alive === false || m._disposed || F.hits.has(m)) continue;
      const pos = m.position;
      const pad = Math.max(0.5, (m.bodyRadius ?? 1) * 0.8);
      if (!F.contains(pos.x, pos.y + 0.5, pos.z, pad)) continue;
      F.hits.add(m);
      let parts = null;
      if (id === ELEMENT_STATUS.brine && Array.isArray(m.parts)) {
        parts = [];
        for (const p of m.parts) {
          if (!p || p.attached === false) continue;
          if (p.mesh?.getWorldPosition) { p.mesh.getWorldPosition(_pp); if (!F.contains(_pp.x, _pp.y, _pp.z, 0.6)) continue; }
          parts.push(p);
        }
      }
      // (a kind that answers its own parts: its seals inside the mist, by the kind's names, e.g. the Screed's sealL/sealR)
      let kitParts;
      if (id === ELEMENT_STATUS.brine && typeof m.kitBlow === 'function' && Array.isArray(m._sealW)) {
        kitParts = [];
        for (const w of m._sealW) { if (!w?.obj?.getWorldPosition) continue; w.obj.getWorldPosition(_pp); if (F.contains(_pp.x, _pp.y, _pp.z, 0.8)) kitParts.push(w.name); }
      }
      this.status.apply(m, id, { parts: parts ?? undefined, kitParts, at: { x: F.x, y: F.y, z: F.z } });
      this.ctx.events?.emit?.('pot-status', { kind: m.kind, pot: F.id, parts: parts ? parts.map((p) => p.name) : null });
    }
  }

  dispose() {
    for (const F of this.fields) this.view?.dropField(F);
    this.fields.length = 0;
    this.view?.dispose(); this.view = null;
  }
}

/** The one pot kit of this game, as ctx.combat.pots; the statuses' book as ctx.combat.status. */
export function ensurePots(ctx) {
  const host = ctx.combat || ctx;
  if (!host.status) host.status = new StatusBook();
  if (!host.pots) { host.pots = new PotKit(ctx); host.pots.status = host.status; }
  return host.pots;
}
