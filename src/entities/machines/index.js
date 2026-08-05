import * as THREE from 'three';
import { Watcher } from './watcher.js';
import { Sawtooth } from './sawtooth.js';
import { Behemoth } from './behemoth.js';
import { Thunderjaw } from './thunderjaw.js';

/**
 * Machine ecosystem manager: spawns the herd layout, runs the update loop
 * with distance LOD, broadcasts watcher alerts, keeps machines separated.
 */

const CAMP = { x: 22, z: 30, r: 25 };
const LOD_DIST = 250;
const LOD_TICK = 0.25;

const _v = new THREE.Vector3();

export class Machines {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];

    const route = (cx, cz, r, n, seed = 0) => {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = seed + (i / n) * Math.PI * 2;
        const rr = r * (0.7 + 0.3 * Math.sin(a * 2.7 + seed));
        let x = cx + Math.sin(a) * rr;
        let z = cz + Math.cos(a) * rr;
        // keep waypoints out of the hunter camp
        const dx = x - CAMP.x, dz = z - CAMP.z;
        const d = Math.hypot(dx, dz);
        if (d < CAMP.r + 6) {
          x = CAMP.x + (dx / (d || 1)) * (CAMP.r + 6);
          z = CAMP.z + (dz / (d || 1)) * (CAMP.r + 6);
        }
        // ... and inside the playable valley
        const wr = Math.hypot(x, z);
        if (wr > 310) { x *= 310 / wr; z *= 310 / wr; }
        pts.push(new THREE.Vector3(x, 0, z));
      }
      return pts;
    };

    const spawn = (Cls, x, z, opts = {}) => {
      const m = new Cls(ctx, this, {
        spawn: { x, z },
        ...opts,
      });
      this.list.push(m);
      return m;
    };

    // --- SPEC layout: 4 watchers on patrol routes, 2 sawtooths,
    //     1 territorial behemoth, thunderjaw alone in the far south.
    spawn(Watcher, -30, -40, { route: route(-30, -40, 26, 5, 0.4), heading: 0.8 });
    spawn(Watcher, -60, 10, { route: route(-60, 14, 30, 5, 1.7), heading: -0.5 });
    spawn(Watcher, 40, -70, { route: route(44, -74, 24, 4, 3.1), heading: 2.2 });
    spawn(Watcher, 90, 30, { route: route(88, 34, 28, 5, 4.9), heading: 3.0 });
    spawn(Sawtooth, -110, -90, { route: route(-110, -90, 34, 4, 0.9), heading: 0.4 });
    spawn(Sawtooth, 120, -130, { route: route(118, -128, 30, 4, 2.2), heading: -2.0 });
    spawn(Behemoth, -160, 90, { route: route(-160, 90, 26, 5, 1.2), heading: 1.2 });
    spawn(Thunderjaw, 30, -220, { route: route(30, -220, 42, 5, 0.2), heading: 0.2 });

    // calm everything down when the player respawns at the campfire
    ctx.events.on('player-respawn', () => {
      for (const m of this.list) {
        if (!m.alive) continue;
        m.suspicion = 0;
        m._unseenT = 99;
        m._cancelAttack();
        if (m.state !== 'patrol') m.setState('return');
      }
    });
  }

  /** Watcher chirp: pull nearby machines into the fight. */
  alertNearby(source, radius) {
    const p = this.ctx.player;
    for (const m of this.list) {
      if (m === source || !m.alive) continue;
      if (m.state === 'attack' || m.state === 'alert' || m.state === 'dead') continue;
      if (m.position.distanceToSquared(source.position) > radius * radius) continue;
      if (m.territory && p) {
        const dx = p.position.x - m.territory.x, dz = p.position.z - m.territory.z;
        if (dx * dx + dz * dz > m.territory.r * m.territory.r) continue;
      }
      m.suspicion = 1;
      m._unseenT = 0;
      if (p) m.lastKnown.copy(p.position);
      m.setState('alert');
    }
  }

  update(dt, t) {
    const p = this.ctx.player;
    for (const m of this.list) {
      if (p) {
        const far = m.position.distanceToSquared(p.position) > LOD_DIST * LOD_DIST;
        m.lowLOD = far;
        // part meshes are sub-pixel beyond LOD range — drop their draw calls
        if (far !== m._partsHidden) {
          m._partsHidden = far;
          for (const part of m.parts) {
            if (part.attached) part.mesh.visible = !far;
          }
        }
        if (far) {
          // coarse tick: batch time and step a few times per second
          m._lodAccum = (m._lodAccum ?? 0) + dt;
          if (m._lodAccum < LOD_TICK) continue;
          m.update(Math.min(m._lodAccum, 0.4), t);
          m._lodAccum = 0;
          continue;
        }
      }
      m.update(dt, t);
    }

    // hard standoff: machines never interpenetrate the player — in EVERY
    // state (patrol/return wander included: a behemoth must not stroll
    // through an idle Aloy) and along the whole BODY, not just the center:
    // long machines are treated as a capsule (rear / center / snout spheres,
    // spaced by standoffHalfLen) so snouts and tails can't sweep through her.
    if (p) {
      for (const m of this.list) {
        if (!m.alive) continue;
        const min = m.bodyRadius + 0.6;
        const L = m.standoffHalfLen ?? 0;
        const fx = Math.sin(m.heading), fz = Math.cos(m.heading);
        for (let s = -1; s <= 1; s++) {
          const off = s * L;
          _v.set(
            m.position.x + fx * off - p.position.x, 0,
            m.position.z + fz * off - p.position.z,
          );
          const d2 = _v.lengthSq();
          if (d2 < min * min && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            _v.multiplyScalar((min - d) / d);
            m.moveRoot(_v.x, _v.z);
          }
          if (L === 0) break;
        }
      }
    }

    // soft separation so machines don't interpenetrate
    const n = this.list.length;
    for (let i = 0; i < n; i++) {
      const a = this.list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.list[j];
        if (!b.alive) continue;
        _v.subVectors(b.position, a.position);
        _v.y = 0;
        const min = a.bodyRadius + b.bodyRadius;
        const d2 = _v.lengthSq();
        if (d2 > min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        _v.multiplyScalar(((min - d) / d) * 0.5);
        b.moveRoot(_v.x, _v.z);
        a.moveRoot(-_v.x, -_v.z);
      }
    }
  }
}
