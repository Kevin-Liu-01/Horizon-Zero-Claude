import * as THREE from 'three';
import { REST_SITE } from '../../island/sites.js';
import { NpcBank } from './bank.js';
import { Person } from './person.js';

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
 *   clearStage()              despawn the whole group
 *   stagePlace                { x, z, r, y } the neutral place (found on the live terrain)
 *   tierAt(person, tier)      force a tier for a gate (null: back to distance)
 *   info()                    draws, casters, tris, atlases, per person
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
export const ARCHETYPE_IDS = ['salt-raker', 'guild-matron', 'salt-porter', 'boat-caulker', 'lantern-keeper', 'pit-farmer', 'tiller-follower', 'cochineal-picker', 'tube-smith'];
const PAN_IDS = ARCHETYPE_IDS.slice(0, 5), HOLDS_IDS = ARCHETYPE_IDS.slice(5);

const _cam = new THREE.Vector3();
const _probe = new THREE.Vector3();

export class PeopleSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.bank = new NpcBank(ctx);
    this.list = [];
    this.archetypes = ARCHETYPE_IDS;
    this.group = new THREE.Group();
    this.group.name = 'people';
    ctx.scene?.add(this.group);
    this.ready = false;
    this.staged = [];
    this.stagePlace = null;
    this.order = [];
    this.autoStage = true;
    this._wantStage = false;
    this._tick = 0;
    this._starting = false;
    this.windFallback = { x: -3.9, z: 3.9, gust: 0.35, flutter: 0.32 };
    this._forced = new Map();
  }

  /** The flattest clear patch in a ring around REST_SITE: neutral ground, nothing Saltrow or Ninewalls owns. */
  findStage({ r0 = 22, r1 = 60, radius = 9 } = {}) {
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
        const score = (hi - lo) + blocked * 1.5 + r * 0.002;
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

  /** Idle clips + (for every other person) a walk between two stops on the ring: ≥ 3 clips each, ≥ 4 walkers. */
  _scriptFor(i, a, P) {
    const walker = i % 2 === 0;
    const stops = [];
    if (walker) for (let k = 0; k < 3; k++) { const b = a + (k + 1) * 0.85; stops.push({ x: P.x + Math.cos(b) * P.r * 0.72, z: P.z + Math.sin(b) * P.r * 0.72 }); }
    return { walker, stops, stop: 0, i };
  }

  _startScript(p) {
    const clips = p.spec.clips?.idle || ['Idle_Loop'];
    p.scriptI = p.seed % clips.length;
    this._nextBeat(p);
  }

  _nextBeat(p) {
    const clips = p.spec.clips?.idle || ['Idle_Loop'];
    const name = clips[p.scriptI % clips.length];
    p.scriptI++;
    p.stopWalk();
    const dur = p.play(name, { offset: ((p.seed * 0.137) % 1), fade: 0.4 }) || 2.5;
    p.showProps(p.spec.clips?.carry || /Harvest|Chopping|Fixing|Lantern/.test(name) ? this._propsFor(p, name) : null);
    p._beatEnd = Math.max(6, Math.ceil(7 / dur) * dur);
    p._beatT = 0;
    p.lean = 0;
    p._beatKind = 'idle';
  }

  _propsFor(p, name) {
    const has = p.props;
    const list = [];
    if (has.prop_hand) {
      if (/Harvest|Chopping|Fixing|Push/.test(name) || p.spec.clips?.carry === 'cane') list.push('prop_hand');
    }
    if (has.prop_back && !list.includes('prop_hand')) list.push('prop_back');
    if (has.prop_hip && !list.includes('prop_hand')) list.push('prop_hip');
    if (has.prop_shoulder) list.push('prop_shoulder');
    if (has.prop_lamp && /Lantern/.test(name)) list.push('prop_lamp');
    return list;
  }

  _beat(p, dt) {
    if (p.frozen || p.walking) return;
    p._beatT = (p._beatT || 0) + dt;
    if (p._beatT < (p._beatEnd || 8)) return;
    const S = p.script;
    if (S?.walker && S.stops.length) {
      const q = S.stops[S.stop++ % S.stops.length];
      p.showProps(this._propsFor(p, 'walk'));
      p.walkTo(q.x, q.z, () => this._nextBeat(p));
      p._beatKind = 'walk';
      return;
    }
    this._nextBeat(p);
  }

  /** Force a tier for a gate (null: back to distance). */
  tierAt(p, tier) { if (tier === null) this._forced.delete(p); else this._forced.set(p, tier); }

  update(dt, t) {
    if (this.autoStage && !this._starting && this.ctx.player && this.ctx.terrain) {
      this._starting = true;
      // deferred: boot is not held up, and the group stands a beat after the game starts
      this.stage().catch((e) => console.warn('[people] staging failed', e));
    }
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
      p.distance = Math.hypot(dx, dy, dz);
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
      this._beat(p, dt);
      const moved = p.update(dt, tier, wind);
      p.setCasting(tier >= 0 && cast < MAX_CAST && p.distance < MID_R && ++cast > 0);
      if (tier === 0 && moved) {
        p.root.updateWorldMatrix(true, true);
        p.chains.update(dt, wind);
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
    this.bank.dispose();
    this.group.removeFromParent();
  }
}

export function installPeople(ctx) {
  const sys = new PeopleSystem(ctx);
  ctx.people = sys;
  return sys;
}
