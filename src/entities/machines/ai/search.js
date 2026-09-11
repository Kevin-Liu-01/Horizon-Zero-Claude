import * as THREE from 'three';
import { SEARCH, span } from './tables.js';
import { safeEmit } from './emit.js';

/**
 * Search sweeps — `machine-ai-11`, `stealth-search-behaviour-shallow`.
 *
 * Round 3's search was "walk to lastKnown, wiggle, give up after 7 s". This
 * builds a real 12-20 s sweep: 4 points around the last contact, biased onto
 * the tall grass and hard cover a hider would actually use, walked in order
 * with a look-around dwell at each. Bumping into the player during a sweep
 * reveals her (that is the honest reward for holding still in the wrong spot).
 */

const _c = new THREE.Vector3();

export class Search {
  constructor(machine) {
    this.m = machine;
    this.points = [];
    this.index = 0;
    this.dwellT = 0;
    this.timeLeft = 0;
    this.active = false;
    this.lookPhase = 0;
  }

  /** Score a candidate sweep point: cover is interesting, open ground is not. */
  _score(x, z) {
    const m = this.m;
    let s = 0.2 + Math.random() * 0.2;
    const t = m.ctx.terrain;
    if (t.tallGrassDensity) s += t.tallGrassDensity(x, z) * SEARCH.grassBias * 2;
    const C = m.ctx.collision;
    if (C && C.sphereQuery) {
      const hits = C.sphereQuery(x, t.getHeight(x, z) + 1, z, 3.5, this._out || (this._out = []),
        (c) => c.kind === 'tree' || c.kind === 'rock' || c.kind === 'ruin');
      if (hits && hits.length) s += Math.min(0.8, hits.length * 0.25);
    }
    return s;
  }

  /** Build the sweep around `lastKnown` and start it. */
  begin(fromAlarm = false) {
    const m = this.m;
    this.points.length = 0;
    const cx = m.lastKnown.x, cz = m.lastKnown.z;
    const n = SEARCH.points;
    const cand = [];
    for (let i = 0; i < n * 3; i++) {
      const a = (i / (n * 3)) * Math.PI * 2 + Math.random() * 0.4;
      const r = span(SEARCH.radius);
      const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      const rr = Math.hypot(x, z);
      if (rr > 310) continue;
      cand.push({ x, z, a, s: this._score(x, z) });
    }
    cand.sort((p, q) => q.s - p.s);
    // keep the best few, but spread them so the sweep covers ground
    for (const c of cand) {
      if (this.points.length >= n) break;
      let ok = true;
      for (const q of this.points) {
        if (Math.hypot(q.x - c.x, q.z - c.z) < 7) { ok = false; break; }
      }
      if (ok) this.points.push(c);
    }
    if (!this.points.length) this.points.push({ x: cx, z: cz, s: 0 });
    // walk them in angular order so the machine does not zig-zag
    this.points.sort((p, q) => p.a - q.a);
    this.index = 0;
    this.dwellT = 0;
    this._reachedFirst = false;
    this.timeLeft = span(SEARCH.duration) * (fromAlarm ? 1.15 : 1);
    this.active = true;
    this.lookPhase = Math.random() * Math.PI * 2;
  }

  /** @returns true while the sweep is still running. */
  update(dt) {
    const m = this.m;
    if (!this.active) return false;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) { this.active = false; return false; }

    // first leg always heads for the contact point itself
    const target = this.index === 0 && this.dwellT <= 0 && !this._reachedFirst
      ? m.lastKnown : (this.points[this.index] || m.lastKnown);

    if (this.dwellT > 0) {
      this.dwellT -= dt;
      m._speed = THREE.MathUtils.damp(m._speed, 0, 6, dt);
      this.lookPhase += dt * 1.5;
      m.heading += Math.cos(this.lookPhase) * dt * SEARCH.lookSweep;
      if (this.dwellT <= 0) {
        this.index = (this.index + 1) % this.points.length;
        safeEmit(m.ctx, 'machine-scan', { machine: m, sweep: 1, search: true });
      }
      return true;
    }

    const speed = m.walkSpeed * 1.45;
    m.ai.engage.pursue(dt, target.x, target.z, speed);
    _c.set(target.x - m.position.x, 0, target.z - m.position.z);
    if (Math.hypot(_c.x, _c.z) < SEARCH.arrive) {
      this._reachedFirst = true;
      this.dwellT = span(SEARCH.dwell);
      m.ai.engage.reset();
    }
    return true;
  }

  stop() { this.active = false; this._reachedFirst = false; }
}
