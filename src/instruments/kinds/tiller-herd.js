import { _st, moveTowardS } from '../../entities/machines/machine.js';
import { HOT } from '../lib/hot.js';

/**
 * THE HERD IN FILE, AND THE CHIME'S RIPPLE (instruments-a W1; bible §7.4 #3:
 * "herds core the soil on one bearing ... it never flees: on a Plumb's chime it
 * closes file and keeps coring"; rows IN1 (Node twin
 * `tools/instruments/herd-file.test.mjs`) and `A-herd-ripple`). A helper module of
 * the Tiller kind (no default export: the registry skips it).
 *
 * M2 wave 1 (area C, IN1): THE HERD NEVER FLEES. The M1 flight in file on a chime
 * (`fileFlee`, `fleeS` 14 s) and the doctrine's shared stampede on an alert
 * (`Squads.alarmHerd` through `onAlerted`) are both gone for the Tiller: a grazing
 * herd whose sentry's alarm makes it flee is on the never list. On a chime the
 * lamps still ripple nearest-first; the leader halts to core for `closeS` while
 * every follower walks up to a `closeGap` slot (never above its walk), and the file
 * stays closed for `closedS`, on the same bearing.
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
 * herd — and the herd closes file where it stands, on its bearing.
 *
 * Per frame: allocation-free (numbers, the preallocated ring, the shared `_st`
 * steering scratch). Per herd: one HerdFile; per manager: one listener, never
 * re-registered.
 */
export const FILE = Object.freeze({
  gap: 5.2, crumbM: 0.8, cap: 384, rippleR: 45, stepS: 0.28, flashS: 0.24,
  /** IN1: the closed file's gap (band 3.5-4.5 m*), the leader's coring halt that lets the file close at walk, and how long it stays closed */
  closeGap: 4.1, closeS: 4.0, closedS: 30,
  /** crumbs ahead of the slot a follower steers at (3 x 0.8 m) */
  look: 3,
});

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
    this.gap = FILE.gap;
    this.holdUntil = 0.5; this.holdUntil = -1;      // sim time the leader's coring halt ends (IN1)
    this.closedUntil = 0.5; this.closedUntil = -1;  // sim time the closed file opens again
    this.chimes = 0;
  }

  /** The file's gap and its follower speed cap at sim time `now` (the closed file never asks more than walk). */
  tick(now) {
    if (this.closedUntil >= 0 && now >= this.closedUntil) { this.closedUntil = -1; this.gap = FILE.gap; }
    return this.closedUntil >= 0;
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

const simNow = (m) => (HOT.engine || m.ctx?.engine)?.simTime ?? 0;

/** One frame of a follower: toward the leader's crumb `f.gap` x rank metres back. Returns whether it owned the frame. */
export function fileStep(m, f, dt, speed) {
  f.refresh();
  const rank = f.rankOf(m);
  if (rank <= 0 || f.count === 0) return false;
  const closed = f.tick(simNow(m));
  // the slot: `f.gap` x rank metres back from the LEADER, walked along its crumbs by their real spacing (a crumb is
  // laid at >= crumbM, not at exactly crumbM) and interpolated inside the last span, so it slides with the leader
  const L = f.leader.position;
  let want = rank * f.gap, px0 = L.x, pz0 = L.z, b0 = 0, tx = f.cx[f.head], tz = f.cz[f.head];
  for (; b0 < f.count; b0++) {
    const ii = (f.head - b0 + FILE.cap) % FILE.cap, qx = f.cx[ii], qz = f.cz[ii];
    const sx = qx - px0, sz = qz - pz0, seg = Math.sqrt(sx * sx + sz * sz);
    if (seg >= want) { const u = seg > 1e-6 ? want / seg : 0; tx = px0 + sx * u; tz = pz0 + sz * u; break; }
    want -= seg; px0 = qx; pz0 = qz; tx = qx; tz = qz;
  }
  // steer at the crumb LOOK metres ahead of the slot (the path's bearing, never back to a slot just passed)
  let ba = (b0 < f.count ? b0 : f.count - 1) - FILE.look;
  if (ba < 0) ba = 0;
  const ia = (f.head - ba + FILE.cap) % FILE.cap;
  const sc = m.sc, p = m.position;
  // speed: the leader's pace plus a pull on the SIGNED along-track error to the slot (behind it: faster; past it:
  // slower, never a turn back), at most 1.35x walk in the open file and never more than walk in the closed one (IN1).
  // (M2 wave 1: the old law steered at the slot crumb itself, 1.35x walk far out and 0.6 + 0.25 d near, which held
  // every follower about 1.6 m behind its slot and stopped and started it each time the slot stepped a crumb.)
  const e = (tx - p.x) * Math.sin(sc.heading) + (tz - p.z) * Math.cos(sc.heading);
  let v = f.leader.sc._speed + 2.0 * e;
  const cap = closed ? speed : speed * 1.35;
  v = v < 0 ? 0 : v > cap ? cap : v;
  _st.x = f.cx[ia]; _st.z = f.cz[ia]; _st.speed = v;
  moveTowardS(m, dt);
  return true;
}

/** The leader's coring halt after a chime (IN1): it eases to a stop on its bearing. Returns whether it owned the frame. */
export function fileHold(m, f, dt) {
  if (f.holdUntil < 0) return false;
  if (simNow(m) >= f.holdUntil) { f.holdUntil = -1; return false; }
  const sc = m.sc;
  sc._speed += (0 - sc._speed) * (1 - Math.exp(-6 * dt));
  return true;
}

/** The per-manager chime listener: herds within FILE.rippleR flash in sequence, nearest first, and close file. */
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
      byDist.forEach((m, i) => { m._rippleAt = now + i * FILE.stepS; });
      // IN1: no alarm and no flight. The leader halts to core, the followers close up at walk, the bearing holds
      f.holdUntil = now + FILE.closeS;
      f.closedUntil = now + FILE.closedS;
      f.gap = FILE.closeGap;
      f.chimes++;
      this.ripples++;
      this.machines.ctx.events?.emit?.('herd-ripple', { herd: h, members: byDist.length, at: { x: e.x, z: e.z } });
    }
  }
}

/**
 * The doctrine `install(m)` row of the Tiller (after the herd block): the file and the ripple. The herd block's
 * stampede (`_flee`, `onAlerted` -> `Squads.alarmHerd`) is taken back off (IN1: the herd never flees); an alerted
 * member is left to its own alert and attack states.
 */
export function installHerdRipple(m) {
  const mgr = m.manager;
  if (mgr && !mgr._herdRipple) mgr._herdRipple = new HerdRipple(mgr);
  const h = m.herd;
  if (!h) return;
  if (!h.file) h.file = new HerdFile(h);
  // back to the constructor's own-field values (machine.js declares these slots; no shape change)
  m._flee = null;
  m._fleeing = false;
  m.onAlerted = null;
  m._stateAlert = Object.getPrototypeOf(m)._stateAlert;   // the class's alert state, not the herd block's wrapper
}

/** A member's ripple tick (from `Tiller.update`, only while `_rippleAt >= 0`): its flash at its time. */
export function rippleTick(m) {
  if (simNow(m) < m._rippleAt) return;
  m._rippleAt = -1;
  m.manager?.lamps?.telegraph(m, FILE.flashS, null);
}
