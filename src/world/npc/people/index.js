import * as THREE from 'three';
import { REST_SITE } from '../../island/sites.js';
import { NpcBank } from './bank.js';
import { Person } from './person.js';
import { FaceDirector } from './faces.js';
import { Routines } from './routines.js';
import { TEXT } from '../../../game/text.js';

/**
 * CALIMA · the people of the island (settlements, W1 by R56 + R57 c; bible §6; plan §4.1, §4.2). Every
 * near-tier NPC is built like Brea (tools/build/recipes/npc/**) and this is what puts them in the world.
 *
 * PUBLISHED — `ctx.people`
 *   ready                     true once the staged group stands
 *   list                      the live Person records
 *   archetypes                the archetype ids this build ships
 *   spawn(id, opts)           Promise<Person> { x, z, yaw, seed, height, script }
 *   despawn(person)           disposes its mixer + skeleton and releases its archetype and atlases
 *   stage(opts)               Promise: stand a group at the neutral place near REST ({ faction, count })
 *   cast                      the slice's cast (M1.5c): Lantern-Keeper Mise and the unnamed Pan Houses people
 *   stageCast(place)          Promise: stand the slice's cast at `place` ({ x, z, r }) the way stage() stands a group
 *   clearStage()              despawn the whole group
 *   stagePlace                { x, z, r, y } the neutral place (found on the live terrain)
 *   tierAt(person, tier)      force a tier for a gate (null: back to distance)
 *   info()                    draws, casters, tris, atlases, per person
 *   faces                     M1.5f: the faces' director (./faces.js): Brea's face and every near person's, dialogue and gaze
 *   routines                  M1.5d: the Saltrow crew's and the lamp keeper's daily loops (./routines.js)
 *   dispose()
 *
 * TIERS (R56). The nearest 6 within 18 m are near tier; then LOD1 to 35 m; LOD2 beyond; hidden past 90 m;
 * the mixer drops to 30 Hz on LOD1, 15 Hz on LOD2; chains freeze off the near tier; the nearest 4 cast.
 * The scene child is named `people`: the draw ledger's `npcs` owner.
 *
 * MEMORY: per-frame allocation is zero (preallocated order array, no closures in the loop), and every
 * object here has a dispose path: a despawned person's skeleton, its archetype when its last person
 * goes, a faction atlas when its last archetype goes (A-npc-dispose, A-npc-atlas-resident).
 */
const NEAR_R = 18, MID_R = 35, HIDE_R = 90, MAX_NEAR = 6, MAX_CAST = 4, HYST = 1;
/**
 * The W1 group loads when she comes within STREAM_IN of it and then stays for the session: it is one group of ten at a neutral
 * place, hidden past 90 m (no draw), and a group that came and went as she crossed the island changed the scene's object count
 * in the middle of the A90 family's workloads (A90-memory-stability-expansion: nothing outside a machine root may change).
 * Load and unload per settlement, atlases and all, is W2's (`A-settlement-dispose`, `A-npc-atlas-resident`'s walk form);
 * `stage()` / `clearStage()` already dispose everything (`A-npc-dispose`, `A-npc-atlas-resident`).
 */
const STREAM_IN = 130;
export const ARCHETYPE_IDS = ['salt-raker', 'guild-matron', 'salt-porter', 'boat-caulker', 'lantern-keeper', 'pit-farmer', 'tiller-follower', 'cochineal-picker', 'tube-smith'];
const PAN_IDS = ARCHETYPE_IDS.slice(0, 5), HOLDS_IDS = ARCHETYPE_IDS.slice(5);
/**
 * M2 wave 2: the named people a quest or a frame spawns by id (`spawn('oro')`), each its own GLB under public/models/npc/.
 * Not archetypes: no staged group or cast draws on them, so the slice's world is unchanged. Tube Smith Oro
 * (tools/build/recipes/npc/lib/archetypes.mjs 'oro') stands at the tube mouth from wave 3 (the Holds people's routines).
 */
export const NAMED_IDS = ['oro'];
/**
 * M1.5c — the slice's cast (tools/build/recipes/npc/lib/archetypes.mjs CAST): Lantern-Keeper Mise ('lantern-keeper') and seven unnamed
 * Pan Houses people of archetypes 1, 3, 4 and 5 (the Harvester, Trader, Sailor and Healer callings), each with a face and head set of
 * their own. Where they stand and what they do in Saltrow is the settlements' (M1.5a) and the routines' (M1.5d); the W1 group above
 * is unchanged, so no kept row's world changes with them.
 */
export const SLICE_CAST = ['lantern-keeper', 'salt-raker', 'salt-raker-2', 'salt-porter', 'salt-porter-2', 'boat-caulker', 'boat-caulker-2', 'lantern-keeper-2'];

const _cam = new THREE.Vector3();
const _probe = new THREE.Vector3();
/** Clips never played as an idle beat: the lookout's warning gesture (src/world/npc/people/lookout.js plays it for a real warning). */
const NOT_IDLE = new Set(['Idle_Rail_Call']);

export class PeopleSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.bank = new NpcBank(ctx);
    this.faces = new FaceDirector(ctx);
    this.routines = new Routines(this);
    // the lookout's lines are writing's (src/game/text/barks/saltrow.json, set 'lookout'; the last is the all-clear)
    this.routines.lookout.lines = TEXT.barks?.sets?.find((x) => x.id === 'lookout')?.lines || null;
    this._breaFaceT = 0;
    this.list = [];
    this.archetypes = ARCHETYPE_IDS;
    this.named = NAMED_IDS;
    this.cast = SLICE_CAST;
    this.group = new THREE.Group();
    this.group.name = 'people';
    ctx.scene?.add(this.group);
    this.ready = false;
    this.staged = [];
    this.stagePlace = null;
    this.order = [];
    this.autoStage = true;
    this.windFallback = { x: -3.9, z: 3.9, gust: 0.35, flutter: 0.32 };
    this._forced = new Map();
    this._streamT = 2;
    this._dt = 0;
    this._loading = false;
    // the fetches start with the rest site, so the group stands before the game's first frame on any box that can run it
    if (this.autoStage && ctx.terrain) {
      this._loading = true;
      this.stage().catch((e) => console.warn('[people] staging failed', e)).finally(() => { this._loading = false; });
    }
  }

  /** The flattest clear patch in a ring around REST_SITE: neutral ground, nothing Saltrow or Ninewalls owns. */
  findStage({ r0 = REST_SITE.r + 12, r1 = REST_SITE.r + 60, radius = 9 } = {}) {
    const T = this.ctx.terrain;
    const cx = REST_SITE.x, cz = REST_SITE.z;
    let best = null;
    if (!T) return { x: cx, z: cz, r: radius, y: 0 };
    for (let a = 0; a < 24; a++) {
      for (let r = r0; r <= r1; r += 6) {
        const x = cx + Math.cos(a / 24 * Math.PI * 2) * r, z = cz + Math.sin(a / 24 * Math.PI * 2) * r;
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < 9; i++) {
          const k = i / 8 * Math.PI * 2, rr = i === 8 ? 0 : radius;
          const h = T.getHeight(x + Math.cos(k) * rr, z + Math.sin(k) * rr);
          lo = Math.min(lo, h); hi = Math.max(hi, h);
        }
        let blocked = 0;
        const Cl = this.ctx.collision;
        if (Cl?.resolveCapsule) {
          for (let i = 0; i < 9; i++) {
            const k = i / 8 * Math.PI * 2, rr = i === 8 ? 0 : radius * 0.8;
            _probe.set(x + Math.cos(k) * rr, lo, z + Math.sin(k) * rr);
            if (Cl.resolveCapsule(_probe, 1.1, 1.7, { passes: 1, filter: (c) => c.blocking })?.hit) blocked++;
          }
        }
        // never in the sea, whatever island this is
        const sea = this.ctx.water?.seaLevel ?? T.seaLevel;
        const wet = sea != null && lo < sea + 0.3 ? 20 : 0;
        const score = (hi - lo) + blocked * 1.5 + wet + r * 0.002;
        if (!best || score < best.score) best = { x, z, r: radius, y: T.getHeight(x, z), score, spread: hi - lo };
      }
    }
    return best;
  }

  async spawn(id, opts = {}) {
    await this.bank.loadClips();
    const entry = await this.bank.acquire(id);
    const p = new Person(this, entry, opts);
    this.group.add(p.group);
    this.list.push(p);
    this.order.push(p);
    // (M1.5d fix round) a person stands in a clip from the moment they land: with no clip a spawned person held the bind pose until
    // the first idle beat (8 s; the c8daf8a log caught Mise and Ansel, spawned by the quest's staging, in it for 33 samples).
    // A caller that has its own clip (a stage script, the routines, a film actor) plays it over this one
    if (!p.current) this._nextBeat(p);
    return p;
  }

  despawn(p) {
    const i = this.list.indexOf(p);
    if (i < 0) return;
    this.list.splice(i, 1);
    const j = this.order.indexOf(p);
    if (j >= 0) this.order.splice(j, 1);
    const k = this.staged.indexOf(p);
    if (k >= 0) this.staged.splice(k, 1);
    this._forced.delete(p);
    this.routines.remove(p);
    const id = p.archetype;
    p.dispose();
    this.bank.release(id);
  }

  /** Stand a group: `ids` (default nine archetypes + a second raker = 10), walkers on a circuit, the rest at work. */
  async stage({ ids = null, place = null, faction = null } = {}) {
    const P = place || this.stagePlace || (this.stagePlace = this.findStage());
    const list = ids || (faction === 'pan' ? PAN_IDS : faction === 'holds' ? HOLDS_IDS : [...ARCHETYPE_IDS, 'salt-raker']);
    const n = list.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      const ring = P.r * (i % 2 ? 0.45 : 0.72);
      const x = P.x + Math.cos(a) * ring, z = P.z + Math.sin(a) * ring;
      const seed = 101 + i * 37;
      const p = await this.spawn(list[i], { x, z, yaw: a + Math.PI, seed, script: this._scriptFor(i, a, P) });
      out.push(p);
      this.staged.push(p);
      this._startScript(p);
    }
    this.ready = true;
    return out;
  }

  clearStage() { for (const p of this.staged.slice()) this.despawn(p); this.ready = false; }

  /** M1.5c: the slice's cast stood at `place` ({ x, z, r }, found on the live terrain by the caller), scripted as stage() scripts a group. */
  stageCast(place) { return this.stage({ ids: SLICE_CAST, place: { y: 0, ...place } }); }

  /** Idle clips + (for every other person) a walk between two stops on the ring: ≥ 3 clips each, ≥ 4 walkers. */
  _scriptFor(i, a, P) {
    const walker = i % 2 === 0;
    const stops = [];
    if (walker) for (let k = 0; k < 3; k++) { const b = a + (k + 1) * 0.85; stops.push({ x: P.x + Math.cos(b) * P.r * 0.72, z: P.z + Math.sin(b) * P.r * 0.72 }); }
    return { walker, stops, stop: 0, i };
  }

  _startScript(p) {
    const clips = p.spec.clips?.stage || p.spec.clips?.idle || ['Idle_Loop'];
    p.scriptI = p.seed % clips.length;
    this._nextBeat(p);
  }

  _nextBeat(p) {
    const clips = p.spec.clips?.stage || p.spec.clips?.idle || ['Idle_Loop'];
    // (M1.5d fix round 2) never the lookout's warning gesture as an idle: Mise's cycle passed through Idle_Rail_Call, a
    // false alarm about every 27 s (the keeper's lookout plays it when an Instrument comes within 80 m)
    let name = clips[p.scriptI % clips.length];
    for (let k = 0; k < clips.length && NOT_IDLE.has(name); k++) name = clips[++p.scriptI % clips.length];
    if (NOT_IDLE.has(name)) name = 'Idle_Loop';
    p.scriptI++;
    p.stopWalk();
    const dur = p.play(name, { offset: ((p.seed * 0.137) % 1), fade: 0.4 }) || 2.5;
    p.showProps(this._propsFor(p, name));
    p._beatEnd = Math.max(6, Math.ceil(7 / dur) * dur);
    p._beatT = 0;
    p.lean = 0;
    p._beatKind = 'idle';
  }

  /** What a person has out for a clip: a tool in the hand for the work it is for, otherwise stowed. `name` 'walk' = walking. */
  _propsFor(p, name) {
    const has = p.props, carry = p.spec.clips?.carry;
    const work = /Harvest|Chopping|Fixing|Push/.test(name);
    const list = [];
    // `clips.hand`: the clips this person's hand tool is for (the farmer's can is for the watering, not the harvest)
    const handFor = p.spec.clips?.hand;
    if (has.prop_hand && (handFor ? handFor.includes(name) : carry === 'cane' ? name === 'walk' : work)) list.push('prop_hand');
    if (has.prop_back && !(carry === 'rake' && work)) list.push('prop_back');
    if (has.prop_hip && !work) list.push('prop_hip');
    if (has.prop_shoulder) list.push('prop_shoulder');
    if (has.prop_lamp && /Lantern/.test(name)) list.push('prop_lamp');
    return list;
  }

  _beat(p) {
    const dt = this._dt;
    if (p.frozen) return;
    // (M1b closing fix) a quest scene with this person in its cast (the presenter's card; src/game/runtime.js people) stops
    // their work and holds them in talk; when the scene closes their beats go on from the next
    const SG = this.ctx.systemsGame, card = SG?.present?.card;
    if (card && SG.people && (card.cast || [card.who]).some((w) => SG.people[w] === p)) {
      if (!p._talkHeld) { p._talkHeld = true; p.stopWalk(); p.play('Idle_Talking_Loop', { fade: 0.3 }); p.showProps(this._propsFor(p, 'Idle_Talking_Loop')); }
      return;
    }
    if (p._talkHeld) { p._talkHeld = false; this._nextBeat(p); return; }
    if (p.walking) return;
    p._beatT += dt;
    if (p._beatT < (p._beatEnd || 8)) return;
    const S = p.script;
    if (S?.walker && S.stops.length) {
      const q = S.stops[S.stop++ % S.stops.length];
      p.showProps(this._propsFor(p, 'walk'));
      p.walkTo(q.x, q.z, () => this._nextBeat(p));
      p._beatKind = 'walk';
      return;
    }
    // (M1.5d fix round 2) a person with no script (the quest's Mise and Ansel) keeps a short routine round where they stand
    const T = !S && this.routines.live() ? this._tether(p) : null;
    if (T && (T.n++ % 2) === 1) {
      const q = T.stops[T.i++ % T.stops.length], g = p.group.position;
      this.routines.recordLeg(p.archetype, 'tether', T.grid, [{ x: g.x, z: g.z }, { x: q.x, z: q.z }]);
      p.showProps(this._propsFor(p, 'walk'));
      p.walkTo(q.x, q.z, () => this._nextBeat(p));
      p._beatKind = 'walk';
      return;
    }
    this._nextBeat(p);
  }

  /**
   * (M1.5d fix round 2) THE ANCHOR'S SHORT ROUTINE for a person with no script of their own: src/game/runtime.js stands
   * Mise and Ansel at their quest anchors and the idle beats ran them on one spot for two in-game hours (the 731b21a log:
   * walkedM 0, 36 clip flips). Every other beat they walk 2.4-3.4 m to a spot beside the anchor, stand a beat there, and
   * walk back; two spots on opposite sides when both are open. Home is the anchor, or the walk grid's open cell nearest it
   * (within 3 m) when the anchor's own cell is shut. A spot is open when the walk grid round it holds it and the
   * straight leg from home to it (`lineOpen`), or, off every walk grid, when a 0.25 m capsule marched along the leg every 0.25 m
   * touches no static blocking collider and no water. None open: they stand at the anchor as before. Made once, on the
   * first beat that asks, from where they stand then. Live only (`routines.live()`): in a ?shot film they stand.
   */
  _tether(p) {
    if (p._tether !== undefined) return p._tether;
    p._tether = null;
    const R = this.routines;
    R.grid?.();
    const g = p.group.position;
    let ax = g.x, az = g.z;
    const G = this.ctx.nav?.walkGridAt?.(ax, az) || null;
    // (the 85a4b8c film: Mise's anchor is the shore's last dry step, a cell the walk grid shuts, so no spot was open from
    // it and she never moved) the routine's home is the open cell nearest the anchor, within 3 m
    if (G) {
      const i = G.nearestOpen(ax, az, 6);
      if (i < 0 || Math.hypot(G.wx(i) - ax, G.wz(i) - az) > 3) { p._tetherNo = 'no open walk-grid cell within 3 m'; return null; }
      ax = G.wx(i); az = G.wz(i);
    }
    const moved = Math.hypot(ax - g.x, az - g.z) > 0.35;
    const why = [];
    const open = (x, z) => {
      if (G) return G.contains(x, z, G.cell) && !G.blockedAt(x, z) && G.lineOpen(ax, az, x, z);
      const Cl = this.ctx.collision, W = this.ctx.water, T = this.ctx.terrain;
      if (!Cl?.resolveCapsule || !T) return false;
      const L = Math.hypot(x - ax, z - az), n = Math.max(1, Math.ceil(L / 0.25));
      // (from the first step off the spot they stand on: the spot itself is where the quest put them)
      for (let k = 1; k <= n; k++) {
        const px = ax + (x - ax) * k / n, pz = az + (z - az) * k / n;
        _probe.set(px, T.getHeight(px, pz), pz);
        const hit = Cl.resolveCapsule(_probe, 0.25, 1.6, { passes: 1, filter: (c) => c.blocking && c.kind !== 'npc' && !c.dynamic });
        if (hit?.hit) { why.push(`${k}/${n} ${hit.collider?.kind || 'collider'}${hit.collider?.id != null ? '#' + hit.collider.id : ''}`); return false; }
        if (W?.depthAt && W.depthAt(px, pz) > 0.02) { why.push(`${k}/${n} water ${W.depthAt(px, pz).toFixed(2)}`); return false; }
      }
      return true;
    };
    const stops = [];
    const a0 = ((p.seed || 7) * 0.618) % (Math.PI * 2);
    for (let side = 0; side < 2; side++) {
      for (let k = 0; k < 8; k++) {
        const a = a0 + side * Math.PI + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.35, r = 3.4 - (k % 3) * 0.5;
        const x = ax + Math.sin(a) * r, z = az + Math.cos(a) * r;
        if (open(x, z)) { stops.push({ x, z }); break; }
      }
    }
    if (!stops.length) { p._tetherNo = G ? 'no open spot on the walk grid' : `no open spot off the grid at (${ax.toFixed(1)}, ${az.toFixed(1)}): ${why.slice(0, 16).join('; ')}`; return null; }
    const home = { x: ax, z: az };
    const loop = stops.length > 1 ? [stops[0], home, stops[1], home] : [stops[0], home];
    // off the grid's open cells where they stand: home first
    if (moved) loop.unshift(loop.pop());
    p._tether = { anchor: home, grid: !!G, stops: loop, i: 0, n: 0 };
    return p._tether;
  }

  /** Force a tier for a gate (null: back to distance). */
  tierAt(p, tier) { if (tier === null) this._forced.delete(p); else this._forced.set(p, tier); }

  /** The staged group stands once she comes near it (see STREAM_IN). */
  _stream(dt) {
    this._streamT -= dt;
    if (this._streamT > 0 || !this.autoStage || !this.stagePlace || this._loading) return;
    this._streamT = 1;
    const pl = this.ctx.player;
    if (!pl) return;
    const ddx = pl.position.x - this.stagePlace.x, ddz = pl.position.z - this.stagePlace.z, d = Math.sqrt(ddx * ddx + ddz * ddz);
    if (!this.ready && d < STREAM_IN) {
      this._loading = true;
      this.stage().catch((e) => console.warn('[people] staging failed', e)).finally(() => { this._loading = false; });
    }
  }

  update(dt, t) {
    // (the frame's dt rides in a field the people read: a number passed to a call that is not inlined is boxed, A-alloc-rate)
    this._dt = dt;
    this._stream(dt);
    // M1.5f: Brea's face, once her body stands (tried twice a second until it is there)
    if (!this.faces.brea && !this.faces.breaError && (this._breaFaceT -= dt) <= 0) { this._breaFaceT = 0.5; this.faces.installBrea(); }
    this.routines.update(dt);
    const list = this.order;
    const n = list.length;
    if (!n) return;
    this.bank.tickFill(dt);
    const cam = this.ctx.camera;
    if (cam) _cam.setFromMatrixPosition(cam.matrixWorld);
    // nearest first: insertion sort on an almost sorted list, no allocation
    for (let i = 0; i < n; i++) {
      const p = list[i];
      const dx = p.group.position.x - _cam.x, dy = p.group.position.y - _cam.y, dz = p.group.position.z - _cam.z;
      p.distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    for (let i = 1; i < n; i++) {
      const p = list[i];
      let j = i - 1;
      while (j >= 0 && list[j].distance > p.distance) { list[j + 1] = list[j]; j--; }
      list[j + 1] = p;
    }
    const wind = this.ctx.player?.animator?.wind || this.windFallback;
    let nearCount = 0, cast = 0;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      let tier;
      const forced = this._forced.size ? this._forced.get(p) : undefined;
      if (forced !== undefined) tier = forced;
      else {
        const d = p.distance;
        const nearR = NEAR_R + (p.tier === 0 ? HYST : -HYST), midR = MID_R + (p.tier === 1 ? HYST : -HYST);
        if (d > HIDE_R) tier = -1;
        else if (d < nearR && nearCount < MAX_NEAR) tier = 0;
        else if (d < midR) tier = 1;
        else tier = 2;
      }
      if (tier === 0) nearCount++;
      this._beat(p);
      const moved = p.update(tier, wind);
      p.setCasting(tier >= 0 && cast < MAX_CAST && p.distance < MID_R && ++cast > 0);
      if (tier === 0 && moved) {
        p.root.updateWorldMatrix(true, true);
        p.chains.dt = p._stepNow;   // the pose's own tick (every frame near, 30 Hz past 8 m), so the cloth keeps time
        p.chains.update(wind);
      }
    }
    void t;
  }

  info() {
    let draws = 0, tris = 0, casters = 0;
    const rows = [];
    for (const p of this.list) {
      const r = p.info();
      draws += r.draws; tris += r.tris; if (r.casting) casters++;
      rows.push({ id: p.id, archetype: p.archetype, ...r, distance: +p.distance.toFixed(2), clip: p.current?.getClip().name || null, travelled: +p.travelled.toFixed(2), clips: [...p.clipCount], walking: !!p.walking });
    }
    return { count: this.list.length, draws, casters, tris, shadowDraws: casters * 3, atlases: this.bank.residentAtlases(), archetypes: [...this.bank.entries.keys()], people: rows };
  }

  dispose() {
    for (const p of this.list.slice()) this.despawn(p);
    this.faces.dispose();
    this.bank.dispose();
    this.group.removeFromParent();
  }
}

export function installPeople(ctx) {
  const sys = new PeopleSystem(ctx);
  ctx.people = sys;
  return sys;
}
