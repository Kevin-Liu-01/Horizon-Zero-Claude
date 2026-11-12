import { _st, moveTowardS } from '../../entities/machines/machine.js';
import { PLAY_RADIUS, EXTENT } from '../../world/island/extent.js';
import { HOT } from '../lib/hot.js';

/**
 * THE HERD IN FILE, AND THE CHIME'S RIPPLE (instruments-a W1; bible §7.4 #3:
 * "herds of 3-6 core the soil every few metres on one bearing ... on a Plumb chime
 * the herd flashes lamps in sequence (a readable ripple) and flees in file";
 * gate `A-herd-ripple`). A helper module of the Tiller kind (no default export:
 * the registry skips it).
 *
 * IN FILE. A herd (the doctrine's shared `herd` object) carries a `HerdFile`: the
 * leader (its first living member) walks its own coring route; every other member
 * follows the leader's breadcrumbs at `FILE.gap` metres per rank, at walk speed
 * when calm and run speed in flight. The crumbs are one preallocated ring (x, z
 * every `FILE.crumbM` metres of the leader's travel): following them puts every
 * follower on the leader's own path, turns included.
 *
 * THE RIPPLE. A Plumb raises the event `plumb-chime` { machine, x, z } when it
 * goes alert. One listener per manager (`HerdRipple`) finds the herds within
 * `FILE.rippleR` and, nearest member first, flashes each lamp `FILE.stepS` apart
 * (`machines.lamps.telegraph`: steady 1.6x, pinhole) — a readable ripple down the
 * herd — then alarms the herd away from the chime. The flight is the file again.
 *
 * Per frame: allocation-free (numbers, the preallocated ring, the shared `_st`
 * steering scratch). Per herd: one HerdFile; per manager: one listener, never
 * re-registered.
 */
export const FILE = Object.freeze({
  gap: 5.2, crumbM: 0.8, cap: 384, rippleR: 45, stepS: 0.28, flashS: 0.24, fleeS: 14,
});
const FLEE_RIM = PLAY_RADIUS + EXTENT.fleeRim;

export class HerdFile {
  constructor(herd) {
    this.herd = herd;
    this.cx = new Float32Array(FILE.cap);
    this.cz = new Float32Array(FILE.cap);
    this.head = -1;          // index of the newest crumb
    this.count = 0;
    this.leader = null;
    this.order = [];         // living members, leader first (rebuilt when membership changes)
    this._n = -1;
    this.fleeing = false;
    this.alarmT = 0.5; this.alarmT = -1;
  }

  /** Leader first, then the members in the order they joined (stable ranks). */
  refresh() {
    const ms = this.herd.members || [];
    let alive = 0;
    for (let i = 0; i < ms.length; i++) if (ms[i].alive && !ms[i]._disposed) alive++;
    if (alive === this._n && this.leader && this.leader.alive && !this.leader._disposed) return;
    this._n = alive;
    this.order.length = 0;
    for (let i = 0; i < ms.length; i++) if (ms[i].alive && !ms[i]._disposed) this.order.push(ms[i]);
    const lead = this.order[0] || null;
    if (lead !== this.leader) { this.leader = lead; this.count = 0; this.head = -1; }
  }

  /** The leader's breadcrumb, one every FILE.crumbM metres. */
  record(x, z) {
    if (this.count > 0) {
      const dx = x - this.cx[this.head], dz = z - this.cz[this.head];
      if (dx * dx + dz * dz < FILE.crumbM * FILE.crumbM) return;
    }
    this.head = (this.head + 1) % FILE.cap;
    this.cx[this.head] = x; this.cz[this.head] = z;
    if (this.count < FILE.cap) this.count++;
  }

  rankOf(m) { return this.order.indexOf(m); }
}

/** One frame of a follower: toward the leader's crumb FILE.gap x rank metres back. Returns whether it owned the frame. */
export function fileStep(m, f, dt, speed) {
  f.refresh();
  const rank = f.rankOf(m);
  if (rank <= 0 || f.count === 0) return false;
  let back = Math.round((rank * FILE.gap) / FILE.crumbM);
  if (back > f.count - 1) back = f.count - 1;
  const i = (f.head - back + FILE.cap) % FILE.cap;
  const tx = f.cx[i], tz = f.cz[i];
  const p = m.position, dx = tx - p.x, dz = tz - p.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  // catch up when behind the slot, ease in at it (a file, not a pile-up)
  const k = d > 3 ? 1.35 : d > 0.6 ? 0.6 + 0.25 * d : d * 1.0;
  _st.x = tx; _st.z = tz; _st.speed = speed * k;
  if (d > 0.05) moveTowardS(m, dt);
  else { const sc = m.sc; sc._speed += (0 - sc._speed) * (1 - Math.exp(-6 * dt)); }
  return true;
}

/** One frame of flight in file (replaces the doctrine's parallel stampede). */
export function fileFlee(m, dt) {
  const h = m.herd, f = h ? h.file : null;
  if (!f) return false;
  f.refresh();
  m._fleeT -= dt;
  if (f.leader === m) {
    let dx = h.vector.x, dz = h.vector.z;
    const px = m.position.x, pz = m.position.z;
    const r = Math.sqrt(px * px + pz * pz);
    if (r > FLEE_RIM) {
      const side = (px * dz - pz * dx) >= 0 ? 1 : -1;
      dx = (-pz / r) * side; dz = (px / r) * side;
    }
    m._moveToward(px + dx * 30, pz + dz * 30, m.runSpeed, dt);
  } else if (!fileStep(m, f, dt, m.runSpeed)) {
    m._moveToward(m.position.x + h.vector.x * 30, m.position.z + h.vector.z * 30, m.runSpeed, dt);
  }
  if (m._fleeT <= 0 && (HOT.pOk !== 1 || m.playerDist > 65)) {
    m._fleeing = false;
    m.suspicion = 0;
    m._unseenT = 99;
    m.setState('return');
  }
  return true;
}

/** The per-manager chime listener: herds within FILE.rippleR flash in sequence, then flee in file. */
export class HerdRipple {
  constructor(machines) {
    this.machines = machines;
    this.ripples = 0;
    this._off = machines.ctx.events?.on?.('plumb-chime', (e) => this.onChime(e)) || null;
  }

  onChime(e) {
    const sq = this.machines.squads;
    const herds = sq ? sq.herds : null;
    if (!herds || !e) return;
    const now = (HOT.engine || this.machines.ctx.engine)?.simTime ?? 0;
    for (let hi = 0; hi < herds.length; hi++) {
      const h = herds[hi], f = h.file;
      if (!f || h.alarmed) continue;
      f.refresh();
      if (!f.order.length) continue;
      // nearest member to the chime first: the ripple runs down the herd away from the sound
      let near = 1e9;
      for (const m of f.order) { const d = Math.hypot(m.position.x - e.x, m.position.z - e.z); if (d < near) near = d; }
      if (near > FILE.rippleR) continue;
      const byDist = f.order.slice().sort((a, b) => Math.hypot(a.position.x - e.x, a.position.z - e.z) - Math.hypot(b.position.x - e.x, b.position.z - e.z));
      let cx = 0, cz = 0;
      for (const m of f.order) { cx += m.position.x; cz += m.position.z; }
      cx /= f.order.length; cz /= f.order.length;
      let vx = cx - e.x, vz = cz - e.z;
      const vl = Math.hypot(vx, vz) || 1;
      h.vector.set(vx / vl, 0, vz / vl);
      byDist.forEach((m, i) => { m._rippleAt = now + i * FILE.stepS; });
      f.alarmT = now + byDist.length * FILE.stepS + 0.1;
      this.ripples++;
      this.machines.ctx.events?.emit?.('herd-ripple', { herd: h, members: byDist.length, at: { x: e.x, z: e.z } });
    }
  }
}

/** The doctrine `install(m)` row of the Tiller (after the herd block): the file, the ripple, the file flight. */
export function installHerdRipple(m) {
  const mgr = m.manager;
  if (mgr && !mgr._herdRipple) mgr._herdRipple = new HerdRipple(mgr);
  const h = m.herd;
  if (!h) return;
  if (!h.file) h.file = new HerdFile(h);
  m._flee = (dt) => fileFlee(m, dt);
  const base = Object.getPrototypeOf(m)._stateAlert;
  m._stateAlert = (dt) => {
    if (m._fleeing && fileFlee(m, dt)) return;
    base.call(m, dt);
  };
}

/**
 * A member's ripple tick (from `Tiller.animate`, only while `_rippleAt >= 0`): its
 * flash at its time, and the herd's alarm after the last flash.
 */
export function rippleTick(m) {
  const now = (HOT.engine || m.ctx.engine)?.simTime ?? 0;
  if (now < m._rippleAt) return;
  m._rippleAt = -1;
  m.manager?.lamps?.telegraph(m, FILE.flashS, null);
  const h = m.herd, f = h ? h.file : null;
  if (!f || h.alarmed || f.alarmT < 0) return;
  // the last member's flash is the herd's alarm: everyone flees in file (no rearguard: a chime is not her)
  let last = true;
  for (const o of f.order) if (o._rippleAt >= 0) { last = false; break; }
  if (!last) return;
  h.alarmed = true;
  f.alarmT = -1;
  for (const o of f.order) {
    o._fleeing = true;
    o._fleeT = FILE.fleeS;
    o.suspicion = 1;
    o._unseenT = 0;
    if (o.state !== 'alert' && o.state !== 'attack') o.setState('alert');
  }
}
