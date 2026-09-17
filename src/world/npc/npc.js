import * as THREE from 'three';
import { NpcRigSource, NPC_CLIPS, B } from './npcRig.js';
import { buildNpcBody, resolveVariant, makeNpcMaterial, BODIES } from './npcBody.js';
import { NpcAnimator, measureGaits } from './npcAnim.js';
import { ROSTER, ROUTES, STATIONS, CAMP } from './waypoints.js';

/**
 * NPC SYSTEM — lane `npc` (port 5218). Owner of `src/world/npc/**`.
 *
 * Replaces the six baked mannequins `world-props` posed into the camp with a
 * living settlement: 13 named Nora across six body builds, each running its own
 * `AnimationMixer` over the CC0 Quaternius clip library, walking authored
 * routes, sitting on the fire logs, working the racks and the wood pile,
 * turning their heads to look at the player, and going to bed at night.
 *
 * PUBLISHED — `ctx.npcs`
 *   list            live records: { id, name, title, role, body, state, group, position, … }
 *   count           how many are alive
 *   byId(id)        one record
 *   nearest(p, max) the closest record within `max` metres, or null
 *   roster          the authored rows (id, name, title, lines) — dialogue data
 *                   for `progression` to hang quests and conversations on
 *   talkTo(id)      face the player, play a talk gesture, open `progression`'s
 *                   dialogue panel when that lane knows the id, and always emit
 *   stations        resolved world positions of the work stations
 *   debug()         the gate-facing snapshot (clips played, distance walked,
 *                   per-NPC state, mixer clocks, variant signature)
 *   dispose()
 *
 * EVENTS — `npc-talk` { id, name, title, role, lines }
 *          `npc-crowd-ready` { count, variants }
 *
 * MEMORY. Every runtime object this lane creates has a dispose path:
 * geometries, materials, skeletons, mixers, colliders and interactables are all
 * owned by a record in `this.list` and released by `dispose()`. Nothing is
 * created per frame — the update loop allocates zero.
 */

const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _lm = new THREE.Vector3();
const _mi = new THREE.Matrix4();

/** Colliders an NPC must not be depenetrated by: other actors. */
const NOT_ACTOR = (c) => c.blocking
  && c.kind !== 'npc' && c.kind !== 'machine' && c.kind !== 'machine-cam' && c.kind !== 'canopy';

/** People are not world geometry — own-property raycast keeps them out of
 * `collision.seedWorld()`, out of `A61`'s candidate walk and off the aim ray. */
const NO_RAYCAST = () => {};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashId(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** 06:00–19:00 day · 19:00–22:30 evening · else night. */
function phaseOf(h) {
  if (h >= 6 && h < 19) return 'day';
  if (h >= 19 && h < 22.5) return 'evening';
  return 'night';
}

export class NpcSystem {
  constructor(ctx, opts = {}) {
    this.ctx = ctx;
    this.name = 'npcs';
    this.camp = opts.camp || ctx.camp || null;
    this.list = [];
    this.byId = new Map();
    /** live array of NPC transforms — what `camp.npcs` publishes */
    this.groups = [];
    this.roster = ROSTER;
    this.stations = {};
    this.ok = false;
    this.disposed = false;

    this.group = new THREE.Group();
    this.group.name = 'npc-crowd';

    this.src = NpcRigSource.shared(ctx.assets);
    if (!this.src) {
      console.warn('[npc] the Quaternius animation rig is not loaded — no crowd this boot');
      return;
    }
    this.gaits = measureGaits(this.src);
    ctx.scene.add(this.group);

    this._routes = new Map();
    this._phase = phaseOf(ctx.environment?.time ?? 17);
    this._shadowT = 0;
    this._lodOrder = [];

    /**
     * `camp._npcTime` compatibility. The crowd this lane replaces moved on ONE
     * shared uniform, and `V35-settlement` proves the idle is alive by writing
     * that clock and diffing real pixels. The clock is now the mixer clock, so
     * the same probe keeps working against a strictly stronger implementation:
     * writing `value` scrubs every NPC's mixer to that time and the pose that
     * comes back is a real animation frame, not a vertex-shader sine.
     */
    const self = this;
    this.npcClock = {
      driven: true,          // camp.js must not write wall time into this
      _v: 0,
      get value() { return this._v; },
      set value(v) { this._v = v; self._scrubTo(v); },
    };

    for (const row of ROSTER) this._spawn(row);
    this._assignHuts();
    this.ok = this.list.length > 0;

    this.variants = new Set(this.list.map((n) => n.body)).size;
    ctx.events?.emit?.('npc-crowd-ready', { count: this.list.length, variants: this.variants });
  }

  /* ====================================================================== */
  /*  SPAWN                                                                 */
  /* ====================================================================== */

  _spawn(row) {
    const rng = mulberry32(hashId(row.id));
    const V = resolveVariant(row, rng);
    let geo = null, mat = null, mesh = null;
    try {
      const { root, skeleton, byName } = this.src.instantiate();
      geo = buildNpcBody(this.src, V, rng);
      mat = makeNpcMaterial(V);
      mesh = new THREE.SkinnedMesh(geo, mat);
      mesh.name = `npc-${row.id}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.raycast = NO_RAYCAST;
      mesh.userData.npc = row.id;

      const g = new THREE.Group();
      g.name = `npc-${row.id}-root`;
      g.add(root);
      g.add(mesh);
      g.scale.setScalar(V.scale);
      this.group.add(g);
      mesh.bind(skeleton, new THREE.Matrix4());

      const anim = new NpcAnimator(this.src, g, byName, row.id);

      const n = {
        id: row.id, name: row.name, title: row.title || '', role: row.role,
        body: row.body, variant: V, row,
        group: g, mesh, skeleton, byName, anim, rng,
        position: g.position,
        state: 'idle', stateT: 1 + rng() * 2, phase: this._phase,
        route: null, routeName: row.route || null, routeIdx: 0, routeDir: row.reverse ? -1 : 1,
        station: row.station || null, errand: row.errand || null,
        speed: row.speed ?? 1, walked: 0, clips: anim.clipsPlayed,
        target: new THREE.Vector3(), lookVec: new THREE.Vector3(),
        yOffset: 0, seatY: 0, fidgetT: 3 + rng() * 6, tempT: 0,
        collider: null, colliderId: -1, entry: null, hut: null,
        errandT: 20 + rng() * 25, acc: 0, dist: 0, talkT: 0, sitMode: 0,
        progT: 0, blockedFor: 0, detour: 0, detourT: 0,
        progX: 0, progZ: 0, pushAcc: 0, pushed: 0,
        leg: null, legIdx: 0, repathT: 0,
      };
      anim.setStance(rng);
      anim.randomizePhase(rng);
      this.list.push(n);
      this.groups.push(g);
      this.byId.set(n.id, n);
      this._place(n);
      this._replan(n);
      return n;
    } catch (err) {
      console.warn(`[npc] "${row.id}" failed to build — skipped`, err);
      geo?.dispose?.();
      mat?.dispose?.();
      if (mesh?.parent) mesh.parent.remove(mesh);
      return null;
    }
  }

  /** Put a freshly built NPC on its opening mark. */
  _place(n) {
    const row = n.row;
    let x = CAMP.x, z = CAMP.z, face = null;
    if (row.station && STATIONS[row.station]) {
      const s = STATIONS[row.station];
      const off = row.standOff ?? (s.r ?? 1.1) + 0.35;
      const a = row.standBearing ?? Math.atan2(CAMP.x - s.x, CAMP.z - s.z);
      x = s.x + Math.sin(a) * off;
      z = s.z + Math.cos(a) * off;
      face = s.face ? [s.face[0], s.face[1]] : [s.x, s.z];
      if (s.seat) { x = s.x; z = s.z; face = s.face || [CAMP.x, CAMP.z]; }
    } else if (row.route) {
      /**
       * Resolve the ROUTE, not the literal table: a palisade patrol is defined
       * by bearings and has no `pts` until the settlement's own radius function
       * is sampled. The first cut read `ROUTES[name].pts[0]`, got undefined for
       * both lookouts, and dropped them on a random mark in the middle of camp
       * — measured: SONA spawned 0.65 m from the crates, jammed there, and
       * walked on the spot for the whole session (foot drift 0.67 m, the entire
       * step). Each walker also starts on its OWN node so two people on one
       * route are not standing inside each other at t = 0.
       */
      const r = this._route(row.route);
      if (r?.pts?.length) {
        n.routeIdx = Math.floor(n.rng() * r.pts.length) % r.pts.length;
        const p = r.pts[n.routeIdx];
        x = p[0]; z = p[1];
      } else {
        x = CAMP.x + (n.rng() - 0.5) * 8; z = CAMP.z + (n.rng() - 0.5) * 8;
      }
    }
    const clear = this._clearPoint(x, z);
    x = clear[0]; z = clear[1];
    n.group.position.set(x, this._groundY(x, z), z);
    if (face) n.group.rotation.y = Math.atan2(face[0] - x, face[1] - z);
    else n.group.rotation.y = n.rng() * Math.PI * 2;
  }

  _groundY(x, z) { return this.ctx.terrain?.getHeight?.(x, z) ?? 0; }

  /** Round-robin the huts so every non-lookout has somewhere to sleep. */
  _assignHuts() {
    const huts = this.camp?.huts || this.ctx.camp?.huts || [];
    if (!huts.length) return;
    let i = 0;
    for (const n of this.list) {
      const h = huts[i % huts.length];
      i++;
      const a = Math.atan2(CAMP.x - h.x, CAMP.z - h.z);
      n.hut = { x: h.x + Math.sin(a) * 0.55, z: h.z + Math.cos(a) * 0.55, id: h.id };
    }
  }

  /* ====================================================================== */
  /*  ROUTES                                                                */
  /* ====================================================================== */

  /**
   * Resolve a route's polyline once the collider set exists, pushing every
   * waypoint out of anything the settlement put there since it was authored.
   */
  _route(name) {
    const got = this._routes.get(name);
    if (got) return got;
    const def = ROUTES[name];
    if (!def) return null;
    const raw = [];
    if (def.ring) {
      /**
       * A PATROL RADIUS IS MEASURED, NOT ASSUMED.
       *
       * `palisadeRadius(a) - inset` is where the wall SAYS it is, and on the
       * west arc that disagreed with where the collider actually is by enough
       * to pin a lookout against the timber for her whole circuit (RENN, 8.8 m
       * of depenetration in 8 s, walking on the spot at (6.5, 34)). So the
       * radius is also probed: march out from the fire until something blocks
       * a 0.55 m capsule and stand 1.3 m short of it. The patrol then follows
       * whatever the settlement really built, huts and lean-tos included.
       */
      const radiusAt = this.camp?.settlement?.palisadeRadius;
      const [a0, a1] = def.ring;
      const N = 12;
      for (let i = 0; i < N; i++) {
        const a = a0 + (a1 - a0) * (i / (N - 1));
        const sx = Math.sin(a), sz = Math.cos(a);
        const nominal = (typeof radiusAt === 'function' ? radiusAt(a) : 15) - (def.inset ?? 2.9);
        let free = 26;
        if (this.ctx.collision) {
          for (let d = 4; d <= 26; d += 0.6) {
            if (this._blockedAt(CAMP.x + sx * d, CAMP.z + sz * d)) { free = d; break; }
          }
        }
        const R = Math.max(5.5, Math.min(nominal, free - 1.3));
        raw.push([CAMP.x + sx * R, CAMP.z + sz * R]);
      }
    } else {
      for (const p of def.pts) raw.push([p[0], p[1]]);
    }
    const pull = def.ring ? 7 : 4;
    let pts = raw.map((p) => this._clearPoint(p[0], p[1], pull)).filter(Boolean);
    if (pts.length < 2) return null;
    pts = this._validateRoute(pts, (def.mode || 'loop') === 'loop');
    const route = { pts, mode: def.mode || 'loop', name };
    // only cache once the world can actually be consulted, so a route asked for
    // during boot is re-resolved properly on the first real frame
    if (this.ctx.collision) this._routes.set(name, route);
    return route;
  }

  /**
   * A CLEAR WAYPOINT IS NOT A CLEAR ROUTE.
   *
   * Both ends of a leg can stand in the open with a hut's thatch across the
   * middle of it — measured: SONA's patrol ran both endpoints clear and drove
   * straight through hut-south's overhang at (30.2, 22.8) for a third of every
   * lap. Every leg is therefore walked in 0.8 m steps; the first sample that is
   * in contact is pulled clear and inserted as a real waypoint, so the polyline
   * bends around what the settlement built instead of grinding along it.
   */
  _validateRoute(pts, loop) {
    if (!this.ctx.collision || pts.length < 2) return pts;
    const out = [pts[0]];
    const n = pts.length;
    const legs = loop ? n : n - 1;
    for (let i = 0; i < legs && out.length < 28; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz);
      const steps = Math.max(1, Math.min(24, Math.ceil(L / 0.8)));
      let added = null;
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        const px = a[0] + dx * t, pz = a[1] + dz * t;
        if (!this._blockedAt(px, pz)) continue;
        const fix = this._clearPoint(px, pz, 8);
        if (!fix || this._blockedAt(fix[0], fix[1])) continue;
        if (added && Math.hypot(fix[0] - added[0], fix[1] - added[1]) < 1.2) continue;
        out.push(fix);
        added = fix;
      }
      if (!loop || i < legs - 1) out.push(b);
    }
    return out.length >= 2 ? out : pts;
  }

  /** Would a standing NPC be in contact here? */
  _blockedAt(x, z) {
    const C = this.ctx.collision;
    if (!C) return false;
    _p.set(x, this._groundY(x, z), z);
    return !!C.resolveCapsule(_p, 0.55, 1.7, { passes: 1, filter: NOT_ACTOR })?.hit;
  }

  /**
   * Nudge a point out of the static world, and PROVE it came out.
   *
   * One depenetration pass is not enough on this settlement: a waypoint that
   * lands inside the longhouse comes back pinned against an interior wall,
   * still in contact, and an NPC standing on it is shoved every frame for as
   * long as it stands there (measured: RENN, 12.75 m of push in 14 s on the
   * west arc, which the planted foot reports as 0.63 m of skate a step). So the
   * resolve is verified, and on failure the point walks back toward the camp
   * centre until it is genuinely clear.
   *
   * @returns {[number, number]|null} null when no clear point was found within
   *   `maxPull` metres — a ring route drops that bearing rather than patrol
   *   through a hut.
   */
  _clearPoint(x, z, maxPull = 0) {
    const C = this.ctx.collision;
    if (!C) return [x, z];
    const test = (px, pz) => {
      _p.set(px, this._groundY(px, pz), pz);
      const r = C.resolveCapsule(_p, 0.55, 1.7, { passes: 4, filter: NOT_ACTOR });
      return { hit: !!r?.hit, x: _p.x, z: _p.z };
    };
    let t = test(x, z);
    if (!t.hit) return [t.x, t.z];
    // it moved us; is the moved point itself clear?
    const t2 = test(t.x, t.z);
    if (!t2.hit) return [t2.x, t2.z];
    if (maxPull <= 0) return [t2.x, t2.z];
    const dx = CAMP.x - x, dz = CAMP.z - z;
    const L = Math.hypot(dx, dz) || 1;
    for (let d = 0.8; d <= maxPull; d += 0.8) {
      const q = test(x + (dx / L) * d, z + (dz / L) * d);
      if (!q.hit) return [q.x, q.z];
    }
    return null;
  }

  _stationSpot(name, off) {
    const s = STATIONS[name];
    if (!s) return null;
    const a = Math.atan2(CAMP.x - s.x, CAMP.z - s.z);
    const d = off ?? (s.r ?? 1.1) + 0.35;
    const p = this._clearPoint(s.x + Math.sin(a) * d, s.z + Math.cos(a) * d);
    this.stations[name] = { x: s.x, z: s.z, standX: p[0], standZ: p[1] };
    return p;
  }

  /* ====================================================================== */
  /*  BEHAVIOUR                                                             */
  /* ====================================================================== */

  _replan(n) {
    n.phase = this._phase;
    if (this._phase === 'night' && n.role !== 'lookout') return this._goSleep(n);
    switch (n.role) {
      case 'hunter':
      case 'lookout':
        return this._startWalk(n);
      case 'gatherer':
        return (n.rng() < 0.32 && n.station) ? this._goto(n, this._stationSpot(n.station), 'work')
          : this._startWalk(n);
      case 'worker':
        return this._startWork(n);
      case 'sitter':
        return this._goSit(n);
      case 'talker':
      default:
        return this._startIdle(n, 5 + n.rng() * 5);
    }
  }

  _startIdle(n, secs) {
    n.state = 'idle';
    n.stateT = secs;
    n.anim.play('idle', { fade: 0.3 });
    return n;
  }

  _startWalk(n) {
    const r = n.routeName ? this._route(n.routeName) : null;
    if (!r || r.pts.length < 2) return this._startIdle(n, 4 + n.rng() * 4);
    n.route = r;
    n.state = 'walk';
    n.stateT = 999;
    const gait = this._phase === 'night' ? 'walkFormal' : 'walk';
    n.anim.play(n.anim.has(gait) ? gait : 'walk', { fade: 0.3, rate: n.speed });
    this._aimAtNode(n);
    return n;
  }

  /** Walk to an arbitrary XZ, then enter `then`. */
  _goto(n, xz, then) {
    if (!xz) return this._startIdle(n, 4);
    n.state = 'goto';
    n.gotoThen = then;
    n.target.set(xz[0], 0, xz[1]);
    this._planLeg(n, n.target);
    n.stateT = 45;
    n.anim.play('walk', { fade: 0.3, rate: n.speed });
    return n;
  }

  _startWork(n) {
    const spot = n.station ? this._stationSpot(n.station, n.row.standOff) : null;
    if (spot) {
      const dx = n.group.position.x - spot[0], dz = n.group.position.z - spot[1];
      if (dx * dx + dz * dz > 1.6) return this._goto(n, spot, 'work');
      const s = STATIONS[n.station];
      if (s) n.group.rotation.y = Math.atan2(s.x - n.group.position.x, s.z - n.group.position.z);
    }
    n.state = 'work';
    n.stateT = 4 + n.rng() * 3;
    n.anim.play('idle', { fade: 0.25 });
    this._workBeat(n);
    return n;
  }

  /** One unit of visible labour at a station. */
  _workBeat(n) {
    const pool = n.row.work === 'push' ? ['push', 'interact', 'pickup']
      : n.row.work === 'jab' ? ['jab', 'interact', 'swordIdle']
        : n.role === 'worker' ? ['interact', 'pickup', 'fixing']
          : ['pickup', 'interact'];
    const slot = pool[Math.floor(n.rng() * pool.length) % pool.length];
    if (!n.anim.has(slot)) return;
    if (slot === 'push' || slot === 'swordIdle') {
      n.anim.play(slot, { fade: 0.3 });
      n.tempT = 4 + n.rng() * 3;
    } else {
      n.anim.once(slot, { fade: 0.22, rate: 0.85 + n.rng() * 0.35 });
    }
  }

  _goSit(n) {
    const s = STATIONS[n.station];
    if (!s) return this._startIdle(n, 6);
    const here = Math.hypot(n.group.position.x - s.x, n.group.position.z - s.z);
    if (here > 0.7) return this._goto(n, [s.x, s.z], 'sit');
    n.state = 'sit';
    n.stateT = 999;
    n.sitMode = 0;
    n.sitSwapT = 6 + n.rng() * 7;
    n.sitLeaveT = 40 + n.rng() * 40;
    const face = s.face || [CAMP.x, CAMP.z];
    n.group.rotation.y = Math.atan2(face[0] - n.group.position.x, face[1] - n.group.position.z);
    n.anim.once('sitEnter', {
      fade: 0.3,
      onDone: () => {
        n.anim.play(n.row.sitTalk ? 'sitTalk' : 'sitIdle', { fade: 0.3 });
        n.seatPending = true;
      },
    });
    return n;
  }

  _goSleep(n) {
    if (!n.hut) return this._startIdle(n, 20 + n.rng() * 20);
    const here = Math.hypot(n.group.position.x - n.hut.x, n.group.position.z - n.hut.z);
    if (here > 1.0) return this._goto(n, [n.hut.x, n.hut.z], 'sleep');
    n.state = 'sleep';
    n.stateT = 60;
    n.anim.play('crouchIdle', { fade: 0.6, rate: 0.55 });
    return n;
  }

  /**
   * Aim at the next route node THROUGH THE NAVGRID.
   *
   * Authored waypoints say where a person should end up; they cannot say how to
   * get there without walking through a hut, and hand-clearing the polyline
   * against the collider set only ever moved the grind somewhere else. `ctx.nav`
   * already owns that knowledge — a 2 m grid stamped with every static blocker
   * padded for a 1.2 m agent — so the leg between two nodes is a string-pulled
   * path through it, and the whiskers in `_steer` handle what the grid is too
   * coarse to see. A straight line is the fallback when the grid is still
   * building or the node is unreachable.
   */
  _aimAtNode(n) {
    const r = n.route;
    if (!r) return;
    const p = r.pts[n.routeIdx] || r.pts[0];
    n.target.set(p[0], 0, p[1]);
    this._planLeg(n, n.target);
  }

  _planLeg(n, dest) {
    n.leg = null;
    n.legIdx = 0;
    n.repathT = 1.6 + n.rng() * 0.8;
    const nav = this.ctx.nav;
    if (!nav?.ready) return;
    _p.set(n.group.position.x, n.group.position.y, n.group.position.z);
    _lm.set(dest.x, n.group.position.y, dest.z);
    let path = null;
    try { path = nav.path(_p, _lm); } catch { path = null; }
    if (path && path.length > 1) {
      n.leg = path.map((v) => [v.x, v.z]);
      n.legIdx = 1;   // [0] is where we already stand
    }
  }

  /** The point the walker is actually steering at this frame. */
  _legTarget(n) {
    if (n.leg && n.legIdx < n.leg.length) {
      const q = n.leg[n.legIdx];
      _lm.set(q[0], 0, q[1]);
      return _lm;
    }
    return n.target;
  }

  _advanceNode(n) {
    const r = n.route;
    if (!r) return true;
    const last = r.pts.length - 1;
    let end = false;
    if (r.mode === 'pingpong') {
      n.routeIdx += n.routeDir;
      if (n.routeIdx > last) { n.routeIdx = last - 1; n.routeDir = -1; end = true; }
      else if (n.routeIdx < 0) { n.routeIdx = 1; n.routeDir = 1; end = true; }
    } else {
      n.routeIdx = (n.routeIdx + 1) % r.pts.length;
      end = n.routeIdx === 0;
    }
    this._aimAtNode(n);
    return end;
  }

  /* ====================================================================== */
  /*  UPDATE                                                                */
  /* ====================================================================== */

  update(dt, t) {
    if (!this.ok || this.disposed) return;
    const ctx = this.ctx;
    const hour = ctx.environment?.time ?? 17;
    const phase = phaseOf(hour);
    if (phase !== this._phase) {
      this._phase = phase;
      for (const n of this.list) if (n.state !== 'goto') this._replan(n);
    }

    const cam = ctx.camera;
    const player = ctx.player;
    this._shadowT -= dt;
    const doShadow = this._shadowT <= 0;
    if (doShadow) this._shadowT = 0.5;

    for (let i = 0; i < this.list.length; i++) {
      const n = this.list[i];
      n.dist = cam ? n.group.position.distanceTo(cam.position) : 0;

      // LOD: everyone keeps animating (A96), the far half just at a lower rate.
      n.acc += dt;
      const step = n.dist > 140 ? 1 / 6 : n.dist > 70 ? 1 / 24 : 0;
      if (n.acc < step) continue;
      const d = n.acc;
      n.acc = 0;

      this._brain(n, d);
      this._look(n, player, d);
      const moved = n.anim.update(d);
      if (moved.x || moved.z) n.walked += Math.hypot(moved.x, moved.z);
      this._settle(n);
      this._watchProgress(n, d);
      this._ensureRegistered(n);
      this._syncCollider(n);
      if (n.entry) n.entry.position.copy(n.group.position).setY(n.group.position.y + 1.0);
    }

    if (doShadow) this._shadowLod();
  }

  /**
   * A WALKER THAT IS NOT GETTING ANYWHERE MUST NOT KEEP WALKING.
   *
   * The camp is dense, and an NPC pinned against a crate by `_settle`'s
   * depenetration still plays the walk loop: the body is held and the planted
   * foot is dragged a full step every cycle — the single worst thing this lane
   * can put on film, and exactly what `A97-npc-no-skate` measures. So progress
   * is metered against the gait's own nominal travel: fall behind and the NPC
   * first tries a sidestep, and if that fails it gives up on the node and
   * stands still until the route is walkable again.
   */
  _watchProgress(n, dt) {
    if (n.detourT > 0) n.detourT -= dt;
    if (n.state !== 'walk' && n.state !== 'goto') {
      n.progT = 0; n.blockedFor = 0;
      n.progX = n.group.position.x; n.progZ = n.group.position.z;
      return;
    }
    n.progT += dt;
    if (n.progT < 0.9) return;
    // REAL displacement. Metering the lock's own delta was useless: a body held
    // by the depenetration still consumes the clip at full rate, so the meter
    // read "walking fine" while the NPC stood in a wall.
    const gone = Math.hypot(n.group.position.x - n.progX, n.group.position.z - n.progZ);
    const want = n.anim.gaitSpeed(n.anim.current, n.speed) * n.progT * 0.40;
    // Grinding along a wall is skate even at full forward speed: the body is
    // being shoved sideways every frame and the planted foot goes with it. A
    // sustained shove counts as blocked no matter how fast the legs are moving.
    const grinding = n.pushAcc > 0.22 * n.progT;
    const stuck = gone < want || grinding;
    n.pushAcc = 0;
    n.progT = 0;
    n.progX = n.group.position.x; n.progZ = n.group.position.z;
    if (!stuck) { n.blockedFor = 0; return; }
    n.blockedFor++;
    if (n.blockedFor === 1) {
      this._planLeg(n, n.target);
      n.detour = (n.rng() < 0.5 ? 1 : -1) * 1.15;
      n.detourT = 1.5;
    }
    else if (n.blockedFor === 2) { n.detour = -n.detour; n.detourT = 1.5; }
    else {
      n.blockedFor = 0; n.detour = 0; n.detourT = 0;
      if (n.state === 'walk') { this._advanceNode(n); this._startIdle(n, 1.2 + n.rng() * 1.5); n.pendingWalk = true; }
      else this._startIdle(n, 2 + n.rng() * 2);
    }
  }

  _brain(n, dt) {
    n.stateT -= dt;
    if (n.tempT > 0) {
      n.tempT -= dt;
      if (n.tempT <= 0 && (n.state === 'work' || n.state === 'idle')) n.anim.play('idle', { fade: 0.35 });
    }
    if (n.talkT > 0) {
      n.talkT -= dt;
      if (n.talkT <= 0 && n.state === 'talk') this._replan(n);
      if (n.state === 'talk') return;
    }

    switch (n.state) {
      case 'walk': return this._tickWalk(n, dt);
      case 'goto': return this._tickGoto(n, dt);
      case 'idle': {
        this._fidget(n, dt);
        if (n.stateT <= 0) this._replan(n);
        return undefined;
      }
      case 'work': {
        if (n.stateT <= 0) {
          n.stateT = 3.5 + n.rng() * 3.5;
          this._workBeat(n);
          n.errandT -= 4;
          if (n.errandT <= 0 && n.errand) {
            n.errandT = 26 + n.rng() * 30;
            const spot = this._stationSpot(n.errand);
            if (spot) { n.returnTo = n.station; return this._goto(n, spot, 'errand'); }
          }
        }
        return undefined;
      }
      case 'errand': {
        if (n.stateT <= 0) {
          const back = this._stationSpot(n.returnTo || n.station, n.row.standOff);
          n.returnTo = null;
          return this._goto(n, back, 'work');
        }
        return undefined;
      }
      case 'sit': return this._tickSit(n, dt);
      case 'sleep': {
        if (n.stateT <= 0) { n.stateT = 40 + n.rng() * 40; n.anim.play('crouchIdle', { fade: 0.8, rate: 0.5 }); }
        return undefined;
      }
      default: {
        if (n.stateT <= 0) this._replan(n);
        return undefined;
      }
    }
  }

  _tickWalk(n, dt) {
    n.repathT -= dt;
    if (n.repathT <= 0 && n.leg) this._planLeg(n, n.target);
    const aim = this._legTarget(n);
    const legHop = aim !== n.target;
    const dist = this._steer(n, aim, dt);
    if (legHop) {
      if (dist < 0.75) n.legIdx++;
      const endDist = Math.hypot(n.target.x - n.group.position.x, n.target.z - n.group.position.z);
      if (endDist > 0.85) return;
    }
    if (dist < 0.85 || (legHop && n.legIdx >= (n.leg?.length ?? 0))) {
      const end = this._advanceNode(n);
      if (end || n.rng() < 0.12) {
        // Pause at the end of a leg: a quick look around, then back on the
        // route. The gesture fires HERE rather than waiting on the fidget
        // timer — a walker that only ever walks and idles plays two clips, and
        // `A96-npc-animated` asks every NPC for three.
        n.state = 'idle';
        n.stateT = 2.6 + n.rng() * 2.6;
        n.anim.play('idle', { fade: 0.3 });
        n.pendingWalk = true;
        const pool = n.role === 'gatherer' ? ['pickup', 'interact'] : ['interact', 'crouchIdle', 'jab'];
        const slot = pool[Math.floor(n.rng() * pool.length) % pool.length];
        if (n.anim.has(slot)) {
          if (slot === 'crouchIdle') { n.anim.play(slot, { fade: 0.3 }); n.tempT = 2.2; }
          else n.anim.once(slot, { fade: 0.22, rate: 0.9 + n.rng() * 0.3 });
        }
      }
    }
  }

  _tickGoto(n, dt) {
    n.repathT -= dt;
    if (n.repathT <= 0 && n.leg) this._planLeg(n, n.target);
    const aim = this._legTarget(n);
    if (aim !== n.target) {
      const hop = this._steer(n, aim, dt);
      if (hop < 0.75) n.legIdx++;
      const far = Math.hypot(n.target.x - n.group.position.x, n.target.z - n.group.position.z);
      if (far > 0.75 && n.stateT > 0 && n.legIdx < n.leg.length) return undefined;
    }
    const dist = this._steer(n, n.target, dt);
    if (dist < 0.75 || n.stateT <= 0) {
      const then = n.gotoThen;
      n.gotoThen = null;
      if (then === 'sit') return this._goSit(n);
      if (then === 'sleep') return this._goSleep(n);
      if (then === 'work') return this._startWork(n);
      if (then === 'errand') {
        n.state = 'errand';
        n.stateT = 6 + n.rng() * 5;
        n.anim.play('idle', { fade: 0.3 });
        this._workBeat(n);
        return undefined;
      }
      return this._startIdle(n, 3 + n.rng() * 3);
    }
    return undefined;
  }

  _tickSit(n, dt) {
    if (n.seatPending) { this._seat(n); n.seatPending = false; }
    n.sitSwapT -= dt;
    n.sitLeaveT -= dt;
    if (n.sitSwapT <= 0) {
      n.sitSwapT = 7 + n.rng() * 8;
      n.sitMode ^= 1;
      const slot = n.sitMode ? 'sitTalk' : 'sitIdle';
      if (n.anim.has(slot)) n.anim.play(slot, { fade: 0.45 });
    }
    if (n.sitLeaveT <= 0) {
      n.sitLeaveT = 60 + n.rng() * 40;
      n.state = 'idle';
      n.stateT = 5 + n.rng() * 4;
      n.yOffset = 0;
      n.anim.once('sitExit', { fade: 0.3, onDone: () => n.anim.play('idle', { fade: 0.3 }) });
    }
  }

  /**
   * Drop the sitting NPC so its pelvis meets the log instead of hovering over
   * it: the clip was authored for a chair of its own height, which is not the
   * height of a felled pine.
   */
  _seat(n) {
    const s = STATIONS[n.station];
    if (!s?.seat) return;
    const hips = n.byName.get(B.hips);
    if (!hips) return;
    n.group.updateMatrixWorld(true);
    const hipsY = hips.matrixWorld.elements[13] - n.group.position.y;
    const seatY = this._groundY(s.x, s.z) + (s.seatUp ?? 0.30);
    n.yOffset = THREE.MathUtils.clamp((seatY + 0.11) - (this._groundY(s.x, s.z) + hipsY), -0.30, 0.30);
  }

  _fidget(n, dt) {
    n.fidgetT -= dt;
    if (n.fidgetT > 0) return;
    n.fidgetT = 6 + n.rng() * 8;
    if (n.anim.busy) return;
    const pool = n.role === 'talker' ? ['idleTalk', 'interact', 'idleTalk', 'pickup']
      : n.role === 'lookout' || n.role === 'hunter' ? ['interact', 'crouchIdle', 'jab']
        : ['interact', 'pickup', 'idleTalk'];
    const slot = pool[Math.floor(n.rng() * pool.length) % pool.length];
    if (!n.anim.has(slot)) return;
    if (slot === 'idleTalk' || slot === 'crouchIdle') {
      n.anim.play(slot, { fade: 0.35, rate: 0.9 + n.rng() * 0.2 });
      n.tempT = 3.5 + n.rng() * 3;
    } else {
      n.anim.once(slot, { fade: 0.25, rate: 0.8 + n.rng() * 0.4 });
    }
    if (n.pendingWalk && n.stateT <= 0.1) { n.pendingWalk = false; this._startWalk(n); }
  }

  /**
   * Turn toward `target` and let the animator's foot lock do the travelling.
   * Returns the remaining XZ distance.
   */
  _steer(n, target, dt) {
    const g = n.group;
    _d.set(target.x - g.position.x, 0, target.z - g.position.z);
    const dist = _d.length();
    if (dist < 1e-4) return dist;
    _d.multiplyScalar(1 / dist);
    const nav = this.ctx.nav;
    if (nav?.ready && dist > 1.4) {
      try { nav.steer(g.position, _d, _d, { radius: 0.5, look: 3.0 }); } catch { /* grid busy */ }
      if (!(_d.lengthSq() > 1e-6)) _d.set(target.x - g.position.x, 0, target.z - g.position.z).normalize();
    }
    let want = Math.atan2(_d.x, _d.z);
    if (n.detourT > 0) want += n.detour;
    const err = wrapPi(want - g.rotation.y);
    const rate = 2.6 * dt;
    n.anim.turn(THREE.MathUtils.clamp(err, -rate, rate));
    return dist;
  }

  /** Ground conform + depenetration, with the foot lock's pivot kept honest. */
  _settle(n) {
    const g = n.group;
    const gy = this._groundY(g.position.x, g.position.z) + n.yOffset;
    g.position.y += (gy - g.position.y) * 0.45;
    const C = this.ctx.collision;
    if (!C) return;
    _p.copy(g.position);
    const r = C.resolveCapsule(_p, 0.30, 1.62 * (n.variant.scale || 1), { passes: 2, filter: NOT_ACTOR });
    if (r?.hit) {
      let dx = _p.x - g.position.x, dz = _p.z - g.position.z;
      // A shove is a shove, but it must not be a teleport: a deep one-frame
      // overlap (a prop registered late, a route resolved before the colliders
      // existed) would otherwise drag the planted foot a metre in one step.
      const mag = Math.hypot(dx, dz);
      const CAP = 0.05;
      if (mag > CAP) { const k = CAP / mag; dx *= k; dz *= k; _p.x = g.position.x + dx; _p.z = g.position.z + dz; }
      g.position.x = _p.x;
      g.position.z = _p.z;
      n.anim.shift(dx, dz);
      // metres of depenetration, for the grind detector in _watchProgress and
      // for the gates' honesty check. Two adds, no allocation.
      const push = Math.hypot(dx, dz);
      n.pushAcc += push;
      n.pushed += push;
    }
  }

  _look(n, player, dt) {
    if (!player) { n.anim.lookAt(null); return; }
    const g = n.group;
    const dx = player.position.x - g.position.x, dz = player.position.z - g.position.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 36) {
      n.lookVec.set(player.position.x, player.position.y + 1.42, player.position.z);
      n.anim.lookAt(n.lookVec);
      // close enough to be spoken to: turn the body and gesture
      if (d2 < 6.5 && n.state !== 'walk' && n.state !== 'goto' && n.state !== 'sit' && n.state !== 'sleep') {
        const want = Math.atan2(dx, dz);
        const err = wrapPi(want - g.rotation.y);
        g.rotation.y += THREE.MathUtils.clamp(err, -1.4 * dt, 1.4 * dt);
      }
    } else {
      n.anim.lookAt(null);
    }
  }

  /**
   * DRAW BUDGET (`A21-real-draw-calls`, `A9-perf-budget`).
   *
   * Measured on port 5218 at the spawn vista: the visible crowd costs 27 draws
   * — thirteen bodies plus their shadow casters across the CSM cascades. That
   * is the whole cost of the lane, and two levers keep it there:
   *   - only the nearest four cast a shadow, and only inside 30 m (past that a
   *     1.7 m person contributes nothing a shadow map can resolve);
   *   - past 70 m the body is not drawn at all. The MIXER STILL RUNS — the
   *     behaviour loop and `A96-npc-animated` are untouched — so a camp seen
   *     from the far side of the valley costs nothing but its simulation, and
   *     a scenario staged away from the camp (`A21`'s west herd and staged
   *     fight) pays this lane nothing at all.
   */
  _shadowLod() {
    const order = this._lodOrder;
    order.length = 0;
    for (let i = 0; i < this.list.length; i++) order.push(this.list[i]);
    order.sort((a, b) => a.dist - b.dist);
    for (let i = 0; i < order.length; i++) {
      const n = order[i];
      n.mesh.castShadow = i < 4 && n.dist < 30;
      n.mesh.visible = n.dist < 70;
    }
  }

  /* ---------------------------- registrations --------------------------- */

  _ensureRegistered(n) {
    const ctx = this.ctx;
    if (!n.entry && ctx.interactables && n.id !== 'varl') {
      const pos = new THREE.Vector3().copy(n.group.position);
      pos.y += 1.0;
      n.entry = ctx.interactables.register({
        position: pos, radius: 2.6, label: `TALK  ·  ${n.name}`, hold: 0.3,
        onInteract: () => this.talkTo(n.id),
      });
    }
    if (n.colliderId < 0 && ctx.collision) {
      const y = n.group.position.y;
      const id = ctx.collision.register({
        kind: 'npc', dynamic: true, ref: n, blocking: true, occluder: false, camera: false,
        shape: {
          type: 'capsule',
          a: [n.group.position.x, y + 0.25, n.group.position.z],
          b: [n.group.position.x, y + 1.45 * (n.variant.scale || 1), n.group.position.z],
          radius: 0.32,
        },
      });
      n.colliderId = id;
      n.collider = ctx.collision.byId?.get?.(id) || null;
    }
  }

  _syncCollider(n) {
    const c = n.collider;
    if (!c) return;
    const p = n.group.position;
    const top = n.state === 'sit' || n.state === 'sleep' ? 0.95 : 1.45 * (n.variant.scale || 1);
    c.ax = p.x; c.az = p.z; c.ay = p.y + 0.25;
    c.bx = p.x; c.bz = p.z; c.by = p.y + top;
    c.vertical = true;
    this.ctx.collision._bounds(c);
  }

  /* ====================================================================== */
  /*  PUBLIC API                                                            */
  /* ====================================================================== */

  get count() { return this.list.length; }

  nearest(pos, maxDist = 6) {
    let best = null, bd = maxDist * maxDist;
    for (const n of this.list) {
      const dx = n.group.position.x - pos.x, dz = n.group.position.z - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = n; }
    }
    return best;
  }

  /**
   * Face the player, play a talk gesture and hand off to whoever owns
   * conversation. `progression.talkTo` is called when that lane knows the id
   * (today: Varl); everyone else emits `npc-talk` with their authored lines, so
   * the progression-expansion lane can register them without touching this file.
   */
  talkTo(id) {
    const n = this.byId.get(id);
    if (!n) return false;
    const p = this.ctx.player;
    if (p) {
      n.group.rotation.y = Math.atan2(p.position.x - n.group.position.x, p.position.z - n.group.position.z);
      n.lookVec.set(p.position.x, p.position.y + 1.42, p.position.z);
      n.anim.lookAt(n.lookVec);
    }
    if (n.state === 'sit') {
      if (n.anim.has('sitTalk')) n.anim.play('sitTalk', { fade: 0.3 });
    } else {
      n.state = 'talk';
      n.talkT = 5.5;
      n.anim.play('idleTalk', { fade: 0.25 });
      n.anim.once('interact', { fade: 0.2, rate: 1.05 });
    }
    this.ctx.events?.emit?.('npc-talk', {
      id: n.id, name: n.name, title: n.title, role: n.role, lines: n.row.lines || [],
    });
    const prog = this.ctx.progression;
    if (prog?.talkTo && prog.NPCS && prog.NPCS[id]) prog.talkTo(id);
    return true;
  }

  /**
   * Hand and head landmarks per NPC, in character metres from the feet (scale
   * included, because a taller person's hand really is higher). Shaped exactly
   * like the baked crowd's so `V35-settlement` keeps measuring "no two of these
   * people are holding the same pose" — it just has thirteen live rigs to ask
   * instead of six frozen ones.
   */
  landmarks() {
    const out = [];
    for (const n of this.list) {
      const g = n.group;
      g.updateMatrixWorld(true);
      _mi.copy(g.matrixWorld).invert();
      const sc = g.scale.x || 1;
      const probe = (bone) => {
        if (!bone) return [0, 0, 0];
        _lm.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(_mi).multiplyScalar(sc);
        return [+_lm.x.toFixed(3), +_lm.y.toFixed(3), +_lm.z.toFixed(3)];
      };
      out.push({
        id: n.id,
        pose: `${n.state}:${n.anim?.current || 'idle'}`,
        localR: probe(n.byName.get(B.handR)),
        localL: probe(n.byName.get(B.handL)),
        localHead: probe(n.byName.get(B.head)),
      });
    }
    return out;
  }

  /** Drive every mixer to an absolute animation time (the published clock). */
  _scrubTo(v) {
    for (const n of this.list) {
      if (!n.anim) continue;
      try { n.anim.mixer.setTime(Math.max(0, v)); } catch { /* action cache churn */ }
      n.group.updateMatrixWorld(true);
    }
  }

  /** Everything the gates measure, in one page-context call. */
  debug() {
    return {
      count: this.list.length,
      variants: this.variants,
      phase: this._phase,
      gaits: this.gaits,
      walking: this.list.filter((n) => n.state === 'walk' || n.state === 'goto').length,
      npcs: this.list.map((n) => ({
        id: n.id, name: n.name, role: n.role, body: n.body, state: n.state,
        scale: +(n.variant.scale).toFixed(3),
        x: +n.group.position.x.toFixed(2), z: +n.group.position.z.toFixed(2),
        walked: +n.walked.toFixed(2),
        clips: [...n.clips],
        mixerTime: +n.anim.mixer.time.toFixed(3),
        layerTime: +n.anim.layers.time.toFixed(3),
        current: n.anim.current,
        verts: n.mesh.geometry.attributes.position.count,
        tris: (n.mesh.geometry.index?.count || 0) / 3,
        signature: this.signature(n),
        stuck: n.anim.stuck(),
        dist: +n.dist.toFixed(1),
      })),
    };
  }

  /** Mesh/material fingerprint — what `A95-npc-roster` counts as a variant. */
  signature(n) {
    const g = n.mesh.geometry;
    const col = g.attributes.color;
    // eight evenly spaced colour taps + the buffer sizes: two NPCs share this
    // only if they are genuinely the same body in the same clothes
    let h = (g.attributes.position.count * 2654435761) ^ ((g.index?.count || 0) * 40503);
    for (let k = 0; k < 8; k++) {
      const i = Math.floor((k / 8) * col.count);
      h = (h * 16777619) ^ (Math.round(col.getX(i) * 255) << 16)
        ^ (Math.round(col.getY(i) * 255) << 8) ^ Math.round(col.getZ(i) * 255);
      h |= 0;
    }
    return `${n.body}:${(h >>> 0).toString(36)}`;
  }

  /** Feet of every walking NPC, in `A13`'s shape — `A97` reads this. */
  walkingFeet() {
    const out = [];
    for (const n of this.list) {
      if (n.state !== 'walk' && n.state !== 'goto') continue;
      for (const f of n.anim.debugFeet()) {
        out.push({
          id: n.id, name: f.name, planted: f.planted, world: f.world,
          epoch: n.anim.lockEpoch, clip: n.anim.current, state: n.state,
        });
      }
    }
    return out;
  }

  /* ====================================================================== */
  /*  TEARDOWN                                                              */
  /* ====================================================================== */

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const ctx = this.ctx;
    for (const n of this.list) {
      try { n.anim.dispose(); } catch { /* already gone */ }
      if (n.entry && ctx.interactables) { try { ctx.interactables.unregister(n.entry); } catch { /* gone */ } }
      if (n.colliderId >= 0 && ctx.collision) { try { ctx.collision.unregister(n.colliderId); } catch { /* gone */ } }
      n.mesh.geometry.dispose();
      const m = n.mesh.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m.dispose();
      try { n.skeleton.dispose(); } catch { /* r169 always has it */ }
      n.group.clear();
      n.entry = null; n.collider = null; n.anim = null; n.mesh = null; n.skeleton = null;
    }
    this.list.length = 0;
    this.groups.length = 0;
    this.byId.clear();
    this._routes.clear();
    if (this.group.parent) this.group.parent.remove(this.group);
    this.group.clear();
    const sys = ctx.game?.systems;
    if (sys) {
      const i = sys.indexOf(this);
      if (i >= 0) sys.splice(i, 1);
    }
    if (ctx.npcs === this) ctx.npcs = null;
    this.ok = false;
  }
}

/**
 * Bring the crowd up and register it as a system. Called from `camp.js`'s NPC
 * placement section — the only line of that file this lane owns.
 */
export function installNpcs(ctx, opts = {}) {
  if (ctx.npcs?.dispose) ctx.npcs.dispose();
  const sys = new NpcSystem(ctx, opts);
  if (!sys.ok) return null;
  ctx.npcs = sys;
  if (ctx.game && Array.isArray(ctx.game.systems) && !ctx.game.systems.includes(sys)) {
    ctx.game.systems.push(sys);
  }
  return sys;
}

export { ROSTER, STATIONS, ROUTES, BODIES, NPC_CLIPS };
