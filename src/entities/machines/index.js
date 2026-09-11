import * as THREE from 'three';
import { Watcher } from './watcher.js';
import { Sawtooth } from './sawtooth.js';
import { Behemoth } from './behemoth.js';
import { Thunderjaw } from './thunderjaw.js';
import { Strider } from './strider.js';
import { Scrapper } from './scrapper.js';
import { Glinthawk } from './glinthawk.js';
import { Longleg } from './longleg.js';
import { loadVarietyModels } from './variety-assets.js';
import { installMachineAI } from './ai/index.js';
import { ECOSYSTEM } from './ai/tables.js';

/**
 * Machine ecosystem manager: spawns the herd layout, runs the update loop
 * with distance LOD, broadcasts watcher alerts, keeps machines separated.
 *
 * Round 3 adds the variety wave (strider/scrapper/glinthawk/longleg): their
 * models load asynchronously (assets.js is frozen — see variety-assets.js),
 * so those spawns are deferred a few seconds behind boot. It also exposes
 * the animation-studio cast contract: `kinds` + `spawn(kind, x, z)`.
 */

const CAMP = { x: 22, z: 30, r: 25 };
const LOD_DIST = 250;
const LOD_TICK = 0.25;

const _v = new THREE.Vector3();

export class Machines {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];

    // AI services: stimulus bus, site lifecycle, squad doctrine, override
    installMachineAI(this);
    this._shots = [];      // recent shot origins (see shotOrigin())
    this._shotSeq = 0;
    ctx.events.on('arrow-fired', () => this._noteShot());

    this._registry = {
      watcher: Watcher,
      sawtooth: Sawtooth,
      behemoth: Behemoth,
      thunderjaw: Thunderjaw,
      strider: Strider,
      scrapper: Scrapper,
      glinthawk: Glinthawk,
      longleg: Longleg,
    };

    // --- SPEC layout: 4 watchers on patrol routes, 2 sawtooths,
    //     1 territorial behemoth, thunderjaw alone in the far south.
    this._spawnCls(Watcher, -30, -40, { route: this._route(-30, -40, 26, 5, 0.4), heading: 0.8 });
    this._spawnCls(Watcher, -60, 10, { route: this._route(-60, 14, 30, 5, 1.7), heading: -0.5 });
    this._spawnCls(Watcher, 40, -70, { route: this._route(44, -74, 24, 4, 3.1), heading: 2.2 });
    this._spawnCls(Watcher, 90, 30, { route: this._route(88, 34, 28, 5, 4.9), heading: 3.0 });
    this._spawnCls(Sawtooth, -110, -90, { route: this._route(-110, -90, 34, 4, 0.9), heading: 0.4 });
    this._spawnCls(Sawtooth, 120, -130, { route: this._route(118, -128, 30, 4, 2.2), heading: -2.0 });
    this._spawnCls(Behemoth, -160, 90, { route: this._route(-160, 90, 26, 5, 1.2), heading: 1.2 });
    this._spawnCls(Thunderjaw, 30, -220, { route: this._route(30, -220, 42, 5, 0.2), heading: 0.2 });

    // --- Round 3 cast contract (animation studio): all constructible kinds
    this.kinds = Object.keys(this._registry);
    this.varietyReady = false;
    loadVarietyModels(ctx)
      .then(() => {
        this.varietyReady = true;
        this._spawnVariety();
      })
      .catch((err) => console.error('[machines] variety model load failed:', err));

    // calm everything down when the player respawns at the campfire
    ctx.events.on('player-respawn', () => {
      for (const m of this.list) {
        if (!m.alive || m._disposed) continue;
        if (m.state === 'overridden') continue;
        m.suspicion = 0;
        m._unseenT = 99;
        m._cancelAttack();
        m.ai?.search.stop();
        m.ai?.engage.reset();
        if (m.ai) m.ai.lureT = 0;
        if (m.state !== 'patrol') m.setState('return');
      }
      // machine-ai-07: a respawn also un-latches every herd alarm
      for (const h of this.squads.herds) {
        h.alarmed = false; h.rearguard = null; h._calmT = 0;
        for (const mm of h.members) { mm._fleeing = false; mm._fleeT = 0; }
      }
    });
  }

  /** Waypoint ring around (cx,cz), warped, kept out of camp + world rim. */
  _route(cx, cz, r, n, seed = 0) {
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
  }

  _spawnCls(Cls, x, z, opts = {}) {
    const m = new Cls(this.ctx, this, { spawn: { x, z }, ...opts });
    this.list.push(m);
    // MachineSite: remember how to repopulate this spot after the wreck goes
    if (opts._site) { opts._site.machine = m; m._site = opts._site; }
    else this.sites.note(m, m.kind, x, z, opts);
    return m;
  }

  /**
   * `machine-ai-03` support — where did that arrow come from?
   *
   * The honest answer is "where the bow was when it was loosed", which is what
   * this records on `arrow-fired`. It is NOT `player.position`: by the time an
   * arrow lands she has moved, and the whole point of the finding is that a
   * machine must investigate the SHOT, not track the shooter. `combat` may
   * instead pass `hit.origin` and this is skipped entirely.
   */
  _noteShot() {
    const p = this.ctx.player;
    if (!p) return;
    this._shots.push({ x: p.position.x, y: p.position.y, z: p.position.z, seq: ++this._shotSeq });
    if (this._shots.length > 8) this._shots.shift();
  }

  /** Best-guess origin for a hit: explicit, else matched against recent shots. */
  shotOrigin(hit) {
    if (hit && hit.origin) return hit.origin;
    if (!this._shots.length) return null;
    if (!hit || !hit.point || !hit.dir) return this._shots[this._shots.length - 1];
    let best = null, bestDot = 0.55;
    for (let i = this._shots.length - 1; i >= 0; i--) {
      const s = this._shots[i];
      const dx = hit.point.x - s.x, dz = hit.point.z - s.z;
      const l = Math.hypot(dx, dz);
      if (l < 0.5) { best = s; break; }
      const dl = Math.hypot(hit.dir.x, hit.dir.z) || 1;
      const dot = (dx / l) * (hit.dir.x / dl) + (dz / l) * (hit.dir.z / dl);
      if (dot > bestDot) { bestDot = dot; best = s; }
    }
    return best || this._shots[this._shots.length - 1];
  }

  /**
   * Cast-panel contract: construct a `kind` machine at (x, z), push it into
   * the live list and return it. Returns null (with a console warn) for
   * unknown kinds or while a variety model is still loading.
   */
  spawn(kind, x, z, opts = {}) {
    const Cls = this._registry[kind];
    if (!Cls) {
      console.warn(`[machines] spawn: unknown kind '${kind}'`);
      return null;
    }
    if (!this.ctx.assets.models[kind]) {
      console.warn(`[machines] spawn: '${kind}' model not loaded yet`);
      return null;
    }
    return this._spawnCls(Cls, x, z, {
      route: opts.route ?? this._route(x, z, 22, 4, Math.random() * 6),
      ...opts,
    });
  }

  /** Deferred Round-3 population (casting-v3.md spawn plan). */
  _spawnVariety() {
    // --- Strider herd x6 in the west meadow across the dried river, with a
    //     2-Watcher escort circuit (roster-v2 §2 herd doctrine).
    const HC = { x: -205, z: -55 };
    const herd = {
      center: new THREE.Vector3(HC.x, 0, HC.z),
      vector: new THREE.Vector3(0, 0, 1),
      alarmed: false,
      rearguard: null,
      members: [],
    };
    this._striderHerd = herd;
    this.squads.registerHerd(herd);   // machine-ai-07: the alarm flag RESETS
    const spots = [[-12, -8], [8, -14], [-3, 6], [14, 4], [-18, 12], [4, 18]];
    for (let i = 0; i < spots.length; i++) {
      this.spawn('strider', HC.x + spots[i][0], HC.z + spots[i][1], {
        herd,
        route: this._route(HC.x, HC.z, 18 + (i % 3) * 6, 4, i * 1.7),
        heading: Math.random() * Math.PI * 2,
      });
    }
    // machine-ai-14: the two Watchers ESCORT the herd — they hold slots on a
    // ring around it and re-space as members die, instead of walking an
    // unrelated loop that happens to be nearby.
    const guards = [];
    for (const seed of [0.9, 3.9]) {
      guards.push(this._spawnCls(Watcher,
        HC.x + Math.sin(seed) * 30, HC.z + Math.cos(seed) * 30,
        { route: this._route(HC.x, HC.z, 32, 6, seed), heading: seed }));
    }
    this.squads.assignEscorts(HC, guards, ECOSYSTEM.escort.watcher.radius);

    // --- Scrapper pack x3 at the rusted-hull ruin (~135,-35): loping
    //     circuits, flanking arcs assigned across the pack.
    const packSpots = [[135, -35, 0], [143, -28, 1], [127, -26, -1]];
    for (let i = 0; i < packSpots.length; i++) {
      const [x, z, flank] = packSpots[i];
      this.spawn('scrapper', x, z, {
        flank,
        route: this._route(135, -32, 15, 4, i * 2.1),
        heading: Math.random() * Math.PI * 2,
      });
    }

    // --- Glinthawk flock x3 circling above the riverbed pools (sequential
    //     dives via the shared flock token).
    const pools = this.ctx.environment?.water?.pools ?? [];
    const flock = { diver: null };
    for (let i = 0; i < 3; i++) {
      const pool = pools.length
        ? pools[i % Math.min(pools.length, 2)]
        : { x: -122, z: -60 }; // contract gap fallback: river channel center
      this.spawn('glinthawk', pool.x + (i - 1) * 9, pool.z + (i % 2) * 10, {
        flock,
        pool: { x: pool.x, z: pool.z },
        phase: i * 2.1,
      });
    }

    // --- Longleg x2 on the SE rocky shelf (shelfFactor landform).
    this.spawn('longleg', 150, 95, { route: this._route(150, 95, 26, 5, 0.7), heading: -2.2 });
    this.spawn('longleg', 174, 60, { route: this._route(174, 60, 22, 4, 2.9), heading: 2.8 });
  }

  /**
   * Watcher chirp / Longleg recon ping.
   *
   * `machine-ai-06` + `stealth-alarm-leaks-position`: this used to hand every
   * recipient `player.position` and full red alert, so one chirp made an
   * entire valley omniscient. It now routes through the alarm doctrine in
   * `ai/stimulus.js` — recipients converge on the CALLER in `search`, eyes
   * yellow, and only their own senses can turn that red.
   */
  alertNearby(source, radius) {
    return this.stimulus.alarm(source, radius);
  }

  update(dt, t) {
    const p = this.ctx.player;
    // world stimuli (player footsteps), corpse lifecycle, squad doctrine
    this.stimulus.update(dt);
    this.sites.update(dt);
    this.squads.update(dt);
    this.overrides.update(dt);

    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      if (m._disposed) continue;
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
        if (!m.alive || m._disposed || m.mountedBy) continue;
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
