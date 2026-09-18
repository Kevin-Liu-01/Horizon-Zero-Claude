import * as THREE from 'three';
import { ECOSYSTEM, span } from './tables.js';
import { safeEmit } from './emit.js';

/**
 * Squad + ecosystem behaviour — `machine-ai-07` (herd doctrine is a one-shot
 * dead flag), `machine-ai-14` (no ecosystem behaviour), `strider-07`.
 *
 *  - HERD DOCTRINE RESET: `herd.alarmed` used to latch true forever, so a herd
 *    could stampede exactly once per session and never post a rearguard again.
 *    It now clears once the whole herd has been calm for `calmTime`, and the
 *    rearguard is re-picked among the LIVING whenever the current one dies.
 *  - ESCORTS: the two Watchers that shadow the Strider herd hold slots on a
 *    ring around it instead of walking an unrelated patrol loop, and they
 *    re-space themselves as members die.
 *  - SCAVENGERS: Scrappers within 90 m of a fresh wreck break patrol, lope to
 *    it and pick at it for 8-16 s. That is the Scrapper's entire canon role.
 */

const _v = new THREE.Vector3();
/** A corrupted machine's IDLE sensor colour (see `Machine._eyeCalm`). */
const CORRUPT_EYE = new THREE.Color('#ff2413');

export class Squads {
  constructor(machines) {
    this.machines = machines;
    this.ctx = machines.ctx;
    this.herds = [];
    this.convoys = [];     // Shell-Walker columns (registerConvoy)
    this.baskings = [];    // Snapmaw pool sites (registerBasking)
    this.wrecks = [];      // { x, z, t } fresh kills for scavengers
    this.calmTime = 12;
    this._t = 0;
  }

  registerHerd(herd) {
    if (!herd || this.herds.includes(herd)) return herd;
    herd._calmT = 0;
    this.herds.push(herd);
    return herd;
  }

  /**
   * SQUAD MEMBERSHIP IS PLACEMENT, AND PLACEMENT IS WHAT A SITE REMEMBERS
   * (fix round 2).
   *
   * `ai/sites.js` repopulates a spot by replaying the OPTIONS the first spawn
   * was built from. `herd` survived that round trip only because
   * `ai/doctrine.js` happens to pass it as a spawn option; `convoy`, `basking`
   * and the escort ring are all attached AFTER `spawn()` returns, by the
   * register/assign calls below, so none of them ever reached `opts` and none
   * was ever stored. `Squads.forget` then spliced the dead member out and
   * nothing put the respawn back: measured, ONE dispose/respawn cycle per
   * machine took `convoyMembers 2 -> 0`, `baskingMembers 2 -> 0` and the
   * escort ring from 4 slots to 2, permanently, with both machines alive and
   * no gate signal (`A100` only ever ran at boot).
   *
   * So whatever attaches a squad also writes the handle back into the member's
   * site record, here, in one line. The site is the only thing that outlives
   * the machine.
   */
  _remember(machine, key, value) {
    const site = machine && machine._site;
    if (!site || !site.opts) return value;
    site.opts[key] = value;
    return value;
  }

  /**
   * ...AND THE OTHER HALF: RE-ATTACH ON THE WAY BACK IN.
   *
   * Called from `Machines._spawnCls` for every machine, boot and respawn
   * alike, once the site is wired. A boot spawn carries no squad yet and this
   * is a no-op; a respawn arrives with the handles `_remember` stored, so the
   * membership push, the carrier re-election and the basking calm-reset all
   * happen in the one place instead of in each species' constructor.
   *
   * Idempotent by construction (`includes` before every push), because
   * `installDoctrine` already re-adds a herd member and must not double-list
   * it — a herd listed twice is how the rearguard count came out as 2 of 3.
   */
  adopt(machine) {
    if (!machine) return machine;
    const h = machine.herd;
    if (h) {
      this.registerHerd(h);
      if (h.members && !h.members.includes(machine)) h.members.push(machine);
      this._remember(machine, 'herd', h);
    }
    const c = machine.convoy;
    if (c) {
      this.registerConvoy(c);                    // no-op when already known
      if (!c.members.includes(machine)) c.members.push(machine);
      const car = c.carrier;
      if (!car || !car.alive || car._disposed) this._electCarrier(c);
      this._remember(machine, 'convoy', c);
    }
    const b = machine.basking;
    if (b) {
      this.registerBasking(b);
      if (!b.members.includes(machine)) b.members.push(machine);
      /**
       * A pool whose whole pair was killed keeps `alarmed = true` for ever,
       * and `installDoctrine`'s Snapmaw `onStateChange` returns early on an
       * alarmed site — so the replacement pair could never wake together
       * again even once its membership was restored. The flag belongs to the
       * EPISODE, not to the site: a pool with nothing hot in it is calm.
       */
      if (!b.members.some((o) => o !== machine && o.alive && !o._disposed && o.suspicion > 0.3)) {
        b.alarmed = false;
        b._calmT = 0;
      }
      this._remember(machine, 'basking', b);
    }
    if (machine.escort) this._remember(machine, 'escort', machine.escort);
    return machine;
  }

  /**
   * THE ONE WAY TO PUT A MACHINE IN A SQUAD AFTER IT HAS SPAWNED.
   *
   * `field` is 'herd' | 'convoy' | 'basking'. `spawnExpansion` used to do
   * `basking.members.push(m); m.basking = basking;` by hand — which is how the
   * Snapmaw pool stayed invisible to the site record even after `_remember`
   * existed: the raw push never touched it, so the pool still emptied on the
   * first respawn while the convoy (registered through `registerConvoy`) came
   * back. Anything that hands a machine a squad goes through here now, and
   * `adopt` does the membership push, the carrier election and the write-back.
   */
  join(machine, squad, field) {
    if (!machine || !squad) return machine;
    machine[field] = squad;
    return this.adopt(machine);
  }

  /**
   * CONVOY DOCTRINE (casting-v4.md §2.5 — the Shell-Walker, engine ask 4).
   *
   * A herd FLEES and posts one rearguard. A convoy does the opposite and it is
   * the whole read of a Shell-Walker column: on alarm the escorts close ranks
   * AROUND the carrier — the member still holding the cargo crate — and fight
   * outward from it, while the carrier itself backs away along the route. Kill
   * the carrier, or tear its crate off, and the convoy has nothing to defend
   * and reverts to ordinary combat doctrine.
   *
   * `convoy = { members, route, defend }`. `defend` is the part name that
   * marks the carrier ('cargo'); the carrier is re-elected among the living
   * whenever the current one dies or loses that part, exactly as
   * `_updateHerds` re-posts a dead rearguard.
   */
  registerConvoy(convoy) {
    if (!convoy || this.convoys.includes(convoy)) return convoy;
    convoy.alarmed = false;
    convoy._calmT = 0;
    convoy.carrier = null;
    convoy.members = convoy.members || [];
    convoy.defend = convoy.defend || 'cargo';
    convoy.radius = convoy.radius ?? 9;
    this.convoys.push(convoy);
    this._electCarrier(convoy);
    for (const m of convoy.members) { m.convoy = convoy; this._remember(m, 'convoy', convoy); }
    return convoy;
  }

  /**
   * BASKING SITES (casting-v4.md §2.3 — Snapmaw pairs).
   *
   * 2-4 Snapmaws hold a pool and do nothing else: they lie motionless on the
   * bank in `patrol` (the `basking` fidget) and, when one of them wakes up,
   * the site wakes with it — but they do NOT converge on a caller the way an
   * alarm recipient does. They slide into the water and come at the player
   * from it. `site = { x, z, water, members }`.
   */
  registerBasking(site) {
    if (!site || this.baskings.includes(site)) return site;
    site.members = site.members || [];
    site.alarmed = false;
    site._calmT = 0;
    this.baskings.push(site);
    for (const m of site.members) { m.basking = site; this._remember(m, 'basking', site); }
    return site;
  }

  /** The convoy member still carrying the crate, or the healthiest living one. */
  _electCarrier(c) {
    let best = null, bestHp = -1;
    for (const m of c.members) {
      if (!m.alive || m._disposed) continue;
      const part = m.parts.find((pp) => pp.name === c.defend);
      if (part && part.attached) { c.carrier = m; return m; }
      if (m.health > bestHp) { bestHp = m.health; best = m; }
    }
    c.carrier = best;
    return best;
  }

  /**
   * THE SHARED HERD ALARM (casting-v4.md §5.5 — "extract the Strider's
   * `onAlerted` rather than copy it a third time").
   *
   * Broadhead and Grazer herds have the identical doctrine and this is it, in
   * one place: the first alert of an episode fixes the stampede vector
   * (threat -> through the meadow, away), elects the member NEAREST the threat
   * as the single rearguard, and sets everyone else running. A later alert
   * from a member that is not the rearguard just extends its own run.
   *
   * `strider.js` still carries its own copy — that file belongs to
   * `machine-rig` and this lane does not edit it. When that lane is next in
   * the file, `onAlerted() { Squads.alarmHerd(this); }` is the whole change
   * and the behaviour is identical (this helper was written from it).
   */
  static alarmHerd(m) {
    const h = m.herd;
    if (!h) return false;
    const p = m.ctx.player;
    if (!h.alarmed) {
      h.alarmed = true;
      h.vector.set(
        h.center.x - (p?.position.x ?? m.position.x), 0,
        h.center.z - (p?.position.z ?? m.position.z),
      );
      if (h.vector.lengthSq() < 1) h.vector.set(0, 0, -1);
      h.vector.normalize();
      let rg = m, best = Infinity;
      for (const o of h.members) {
        if (!o.alive || o._disposed) continue;
        const d = p ? o.position.distanceToSquared(p.position) : 0;
        if (d < best) { best = d; rg = o; }
      }
      h.rearguard = rg;
      for (const o of h.members) {
        if (!o.alive || o._disposed) continue;
        o.suspicion = 1;
        o._unseenT = 0;
        if (p) o.lastKnown.copy(p.position);
        if (o !== rg) { o._fleeing = true; o._fleeT = 12 + Math.random() * 4; }
        if (o.state !== 'alert' && o.state !== 'attack') o.setState('alert');
      }
    } else if (h.rearguard !== m) {
      m._fleeing = true;
      m._fleeT = Math.max(m._fleeT || 0, 10);
    }
    return true;
  }

  /**
   * One frame of stampede — the Strider's `_flee`, shared. Gallops along the
   * herd vector, bends tangentially at the valley rim instead of piling into
   * it, and calms down once the clock runs out and the threat is far.
   * Returns whether it owned the frame.
   */
  static stepFlee(m, dt) {
    const h = m.herd;
    if (!h) { m._fleeing = false; return false; }
    m._fleeT -= dt;
    let dx = h.vector.x, dz = h.vector.z;
    const px = m.position.x, pz = m.position.z;
    const r = Math.hypot(px, pz);
    if (r > 285) {
      const side = (px * dz - pz * dx) >= 0 ? 1 : -1;
      dx = (-pz / r) * side; dz = (px / r) * side;
    }
    m._moveToward(px + dx * 30, pz + dz * 30, m.runSpeed, dt);
    const p = m.ctx.player;
    if (m._fleeT <= 0 && (!p || m.playerDist > 65)) {
      m._fleeing = false;
      m.suspicion = 0;
      m._unseenT = 99;
      m.setState('return');
    }
    return true;
  }

  /**
   * Called from `Machine._statePatrol` when `machine.convoy` is set and the
   * convoy is calm: the column walks its shared route in file, spaced behind
   * the carrier. Returns whether it owned the frame.
   */
  static stepConvoy(m, dt) {
    const c = m.convoy;
    if (!c || c.alarmed) return false;
    const lead = c.carrier;
    if (!lead || lead === m) return false;      // the carrier walks its own route
    const i = c.members.indexOf(m);
    const gap = 6 + i * 2.5;
    const bx = lead.position.x - Math.sin(lead.heading) * gap;
    const bz = lead.position.z - Math.cos(lead.heading) * gap;
    m._moveToward(bx, bz, m.walkSpeed, dt);
    return true;
  }

  /** Convoy escorts hold a tight ring on the carrier and fight outward. */
  _updateConvoys(dt) {
    for (const c of this.convoys) {
      const living = c.members.filter((m) => m.alive && !m._disposed);
      if (!living.length) { c.alarmed = false; c.carrier = null; continue; }
      const carrier = c.carrier;
      if (!carrier || !carrier.alive || carrier._disposed
        || !carrier.parts.some((pp) => pp.name === c.defend && pp.attached)) {
        this._electCarrier(c);
      }
      let hot = false;
      for (const m of living) if (m.suspicion > 0.3) { hot = true; break; }
      c.alarmed = hot ? true : c.alarmed;
      if (hot) c._calmT = 0; else c._calmT = (c._calmT || 0) + dt;
      if (c.alarmed && c._calmT > this.calmTime) { c.alarmed = false; continue; }
      if (!c.alarmed || !c.carrier) continue;
      // close ranks: every non-carrier takes a slot on a tight ring around it,
      // as an `escort` anchor the existing footwork already understands
      const others = living.filter((m) => m !== c.carrier);
      for (let i = 0; i < others.length; i++) {
        const g = others[i];
        g.escort = g.escort || { slot: (i / Math.max(1, others.length)) * Math.PI * 2, phase: 0, radius: c.radius };
        g.escort.x = c.carrier.position.x;
        g.escort.z = c.carrier.position.z;
        g.escort.radius = c.radius;
      }
    }
  }

  /**
   * CORRUPTION (casting-v4.md §2.6 — the Corruptor, "the highest-risk
   * behaviour in the expansion").
   *
   * A Corruptor turns nearby machines against everything. This reuses the
   * OVERRIDE machinery with the polarity flipped rather than writing a second
   * machine-vs-machine targeting path: a corrupted victim is hyper-aggressive,
   * burns the hostile sensor colour, and `overrideCfg` refuses it, so the
   * Spear cannot take it back.
   *
   * HARD CAPPED at `ECOSYSTEM.corruption.max` concurrent victims per
   * Corruptor, which the card asks for by name: an uncapped radius turns one
   * machine into a valley-wide cascade that no gate would catch before a judge
   * did. Victims are released the moment their Corruptor dies.
   */
  _updateCorruption(dt) {
    const cfg = ECOSYSTEM.corruption;
    if (!cfg) return;
    for (const m of this.machines.list) {
      if (!m._corruptor) continue;
      const live = m._corruptor.victims.filter((v) => v.alive && !v._disposed && v.corrupted);
      m._corruptor.victims = live;
      if (!m.alive || m._disposed) {           // the source is gone: release them
        for (const v of live) this.uncorrupt(v);
        m._corruptor.victims = [];
        continue;
      }
      m._corruptor.t -= dt;
      if (m._corruptor.t > 0) continue;
      m._corruptor.t = cfg.period;
      if (live.length >= cfg.max) continue;
      if (m.state === 'patrol' || m.state === 'return') continue;
      const r2 = cfg.radius * cfg.radius;
      for (const v of this.machines.list) {
        if (v === m || !v.alive || v._disposed) continue;
        if (v.corrupted || v.docile || v.state === 'overridden') continue;
        if (v.kind === m.kind) continue;                 // it does not eat its own
        if (v.position.distanceToSquared(m.position) > r2) continue;
        this.corrupt(v, m);
        break;                                            // one per period
      }
    }
  }

  /** Flip a machine to the corrupted flavour of the override machinery. */
  corrupt(v, source) {
    if (v.corrupted || v.docile) return false;
    v.corrupted = true;
    v._corruptedBy = source;
    v._eyeCalm = CORRUPT_EYE;
    v.suspicion = 1;
    v._unseenT = 0;
    const p = this.ctx.player;
    if (p) v.lastKnown.copy(p.position);
    if (v.state !== 'attack') v.setState('alert');
    source._corruptor.victims.push(v);
    safeEmit(this.ctx, 'machine-corrupted', { machine: v, source });
    return true;
  }

  /** ...and back, when its Corruptor dies. */
  uncorrupt(v) {
    if (!v.corrupted) return;
    v.corrupted = false;
    v._corruptedBy = null;
    v._eyeCalm = undefined;
    if (v.alive && !v._disposed) { v.suspicion = 0; v._unseenT = 99; v.setState('return'); }
    safeEmit(this.ctx, 'machine-uncorrupted', { machine: v });
  }

  /** Slot escorts around a herd (or any anchor) at a fixed ring. */
  assignEscorts(anchor, guards, radius) {
    for (let i = 0; i < guards.length; i++) {
      const g = guards[i];
      g.escort = {
        x: anchor.x, z: anchor.z,
        radius,
        slot: (i / guards.length) * Math.PI * 2,
        phase: Math.random() * Math.PI * 2,
      };
      /**
       * The ring slot is placement too, and the third casualty of the same
       * defect: a respawned escort came back with `escort: null` and wandered
       * its patrol route instead of holding its arc of the ring. The SAME
       * object goes into the site, so the replacement inherits the slot rather
       * than being handed a fresh random phase. (Only the DELIBERATE ring is
       * remembered — the transient anchor `_updateConvoys` writes onto a
       * non-carrier during an alarm is combat state and dies with the fight.)
       */
      this._remember(g, 'escort', g.escort);
    }
  }

  noteKill(machine) {
    this.wrecks.push({ x: machine.position.x, z: machine.position.z, t: 0, kind: machine.kind });
    if (this.wrecks.length > 12) this.wrecks.shift();
    /**
     * A DEAD MACHINE RELEASES WHAT IT OWNED (`A90-memory-stability`). A
     * Corruptor that dies with victims would otherwise leave them corrupted
     * for ever, each one retaining the dead machine through `_corruptedBy`;
     * a dead convoy carrier would leave its escorts orbiting a corpse.
     */
    if (machine._corruptor) {
      for (const v of machine._corruptor.victims) this.uncorrupt(v);
      machine._corruptor.victims.length = 0;
    }
    if (machine.corrupted) this.uncorrupt(machine);
    const c = machine.convoy;
    if (c && c.carrier === machine) this._electCarrier(c);
  }

  /**
   * A machine is leaving the roster for good (`ai/sites.js:dispose`): drop
   * every squad-side reference to it, or a herd, convoy or basking site keeps
   * the whole disposed Machine alive through its member list — the exact
   * shape `A90-memory-stability` exists to catch. Called once per disposal.
   */
  forget(machine) {
    for (const h of this.herds) {
      const i = h.members ? h.members.indexOf(machine) : -1;
      if (i >= 0) h.members.splice(i, 1);
      if (h.rearguard === machine) h.rearguard = null;
    }
    for (const c of this.convoys) {
      const i = c.members.indexOf(machine);
      if (i >= 0) c.members.splice(i, 1);
      if (c.carrier === machine) this._electCarrier(c);
    }
    for (const b of this.baskings) {
      const i = b.members.indexOf(machine);
      if (i >= 0) b.members.splice(i, 1);
    }
    if (machine._corruptor) {
      for (const v of machine._corruptor.victims) this.uncorrupt(v);
      machine._corruptor.victims.length = 0;
      machine._corruptor = null;
    }
    if (machine.corrupted) this.uncorrupt(machine);
    machine.convoy = null;
    machine.basking = null;
    machine.herd = null;
    machine.escort = null;
    machine.scavenge = null;
  }

  _updateHerds(dt) {
    for (const h of this.herds) {
      const living = h.members.filter((m) => m.alive && !m._disposed);
      if (!living.length) { h.alarmed = false; h.rearguard = null; continue; }
      let hot = false;
      for (const m of living) if (m.suspicion > 0.3) { hot = true; break; }
      if (hot) h._calmT = 0;
      else h._calmT = (h._calmT || 0) + dt;

      // the rearguard died (or was overridden): post a new one immediately
      if (h.alarmed && (!h.rearguard || !h.rearguard.alive
        || h.rearguard._disposed || h.rearguard.state === 'overridden')) {
        const p = this.ctx.player;
        let best = null, bd = Infinity;
        for (const m of living) {
          if (m.state === 'overridden') continue;
          const d = p ? m.position.distanceToSquared(p.position) : 0;
          if (d < bd) { bd = d; best = m; }
        }
        h.rearguard = best;
        if (best) { best._fleeing = false; best._fleeT = 0; }
      }

      // machine-ai-07: the flag RESETS, so the herd can be spooked again
      if (h.alarmed && h._calmT > this.calmTime) {
        h.alarmed = false;
        h.rearguard = null;
        for (const m of living) { m._fleeing = false; m._fleeT = 0; }
      }
    }
  }

  _updateScavengers(dt) {
    const cfg = ECOSYSTEM.scavenger;
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      w.t += dt;
      if (w.t > cfg.window) { this.wrecks.splice(i, 1); continue; }
    }
    if (!this.wrecks.length) return;
    for (const m of this.machines.list) {
      if (!m.alive || m._disposed) continue;
      if (!cfg.kinds.includes(m.kind)) continue;
      if (m.state !== 'patrol' && m.state !== 'return') continue;
      if (m.scavenge) continue;
      for (const w of this.wrecks) {
        if (w.claimed >= 2) continue;
        const dx = w.x - m.position.x, dz = w.z - m.position.z;
        if (dx * dx + dz * dz > cfg.radius * cfg.radius) continue;
        w.claimed = (w.claimed || 0) + 1;
        m.scavenge = { x: w.x, z: w.z, dwell: 0, arrived: false, hold: span(cfg.dwell) };
        break;
      }
    }
  }

  /** Called from `Machine._statePatrol` when `machine.scavenge` is set. */
  static stepScavenge(m, dt) {
    const s = m.scavenge;
    const cfg = ECOSYSTEM.scavenger;
    if (!s) return false;
    if (!s.arrived) {
      const d = m._moveToward(s.x, s.z, m.walkSpeed * 1.4, dt);
      if (d < cfg.arrive) { s.arrived = true; safeEmit(m.ctx, 'machine-scavenge', { machine: m }); }
      return true;
    }
    s.dwell += dt;
    m._speed = THREE.MathUtils.damp(m._speed, 0, 6, dt);
    m.heading += Math.sin(s.dwell * 2.2) * dt * 0.9;
    m.aiPose.forage = 0.5 + 0.5 * Math.sin(s.dwell * 3.1);
    if (s.dwell > s.hold) { m.scavenge = null; m.aiPose.forage = 0; }
    return true;
  }

  /** Called from `Machine._statePatrol` when `machine.escort` is set. */
  static stepEscort(m, dt) {
    const e = m.escort;
    if (!e) return false;
    e.phase += dt * 0.12;
    const a = e.slot + e.phase;
    const x = e.x + Math.sin(a) * e.radius;
    const z = e.z + Math.cos(a) * e.radius;
    m._moveToward(x, z, m.walkSpeed, dt);
    return true;
  }

  /**
   * The basking pool's alarm is an EPISODE flag, exactly like the herd's
   * (`machine-ai-07`) and the convoy's: it latches on the first wake and has
   * to release again, or a pool that was spooked once is spooked for the rest
   * of the session and `installDoctrine`'s Snapmaw `onStateChange` — which
   * returns early on an alarmed site — can never wake the pair together again.
   */
  _updateBaskings(dt) {
    for (const b of this.baskings) {
      const living = b.members.filter((m) => m.alive && !m._disposed);
      if (!living.length) { b.alarmed = false; b._calmT = 0; continue; }
      let hot = false;
      for (const m of living) if (m.suspicion > 0.3) { hot = true; break; }
      if (hot) b._calmT = 0;
      else b._calmT = (b._calmT || 0) + dt;
      if (b.alarmed && b._calmT > this.calmTime) b.alarmed = false;
    }
  }

  update(dt) {
    this._updateHerds(dt);
    this._updateConvoys(dt);
    this._updateBaskings(dt);
    this._updateCorruption(dt);
    this._t += dt;
    if (this._t < 0.5) return;
    this._updateScavengers(this._t);
    this._t = 0;
  }
}

export { ECOSYSTEM };
