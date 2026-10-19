import * as THREE from 'three';
import { Squads } from './squad.js';
import { REST_SITE } from '../../../world/island/sites.js';
import { PLAY_RADIUS, EXTENT } from '../../../world/island/extent.js';

const ANCHOR_RIM = PLAY_RADIUS + EXTENT.anchorRim;

/**
 * ================== MACHINE DOCTRINE HOST (kind-agnostic) ==================
 *
 * Round 5 (instruments-core W0a). This file used to carry nine Round-4 kinds'
 * rows inline. It now owns only the MACHINERY those rows plugged into — the
 * shape `docs/ROUND5-INVENTORY.md` §1.3 says to keep:
 *
 *   registerDoctrine(kind, row)   one call per kind, from the kind's owner
 *   installDoctrine(m, opts)      per machine, from `Machines._spawnCls`
 *   installExpansionDoctrine(machines)   the ONE manager-side part-torn hook
 *   spawnExpansion(machines)      walks SPAWN_PLAN (rows added by owners)
 *   siteAnchor(ctx, plan)         POI -> site, camp keep-out, rim clamp
 *   doctrineAudit(machines)       live count per registered kind + squads
 *
 * A doctrine row (every field optional):
 *
 *   {
 *     body,        // stat block spread into the spawn opts (BODY[kind])
 *     chassis,     // donor kind whose class carries this kind until its own
 *                  // class is registered (CHASSIS[kind])
 *     components,  // (m) => void   functional parts hung on at spawn
 *     herd,        // true -> the ONE shared stampede (Squads.alarmHerd/stepFlee)
 *     reband,      // { partName: [lo, hi] }  standoff band after that tear
 *     install,     // (m, opts) => void   anything else, per machine
 *     spawn,       // [{ n, x, z, route, poi, herd?, basking?, convoy?,
 *                  //    escort?: { kind, n, radius }, routePoints?, territory? }]
 *   }
 *
 * The legacy kinds register from `machines/legacy.js` (deleted at the W2
 * exit); Instrument kinds register through `src/instruments/registry.js`.
 * Everything hung on a machine here is a closure over THAT machine and is
 * released by `Squads.forget` + `SiteManager.dispose` (`A90-memory-stability`):
 * no timers, no DOM, no scene objects, no listeners on the root bus.
 */

const _v = new THREE.Vector3();

/** Which existing class carries each kind until its own ships (donor kind). */
export const CHASSIS = {};
/** Body/stat block per kind. */
export const BODY = {};
/** Spawn layout rows, in registration order. */
export const SPAWN_PLAN = [];

const DOCTRINES = new Map();

/**
 * Register one kind's doctrine. First writer wins (a second call for the same
 * kind is ignored unless `replace`). Returns whether the row was written.
 */
export function registerDoctrine(kind, row = {}, { replace = false } = {}) {
  if (!kind) return false;
  if (DOCTRINES.has(kind) && !replace) return false;
  if (replace) unregisterDoctrine(kind);
  DOCTRINES.set(kind, row);
  if (row.body) BODY[kind] = row.body;
  if (row.chassis) CHASSIS[kind] = row.chassis;
  for (const plan of row.spawn || []) SPAWN_PLAN.push({ kind, ...plan });
  return true;
}

/** Drop every row of a kind (doctrine, body, chassis, spawn plan). */
export function unregisterDoctrine(kind) {
  const had = DOCTRINES.delete(kind);
  delete BODY[kind];
  delete CHASSIS[kind];
  for (let i = SPAWN_PLAN.length - 1; i >= 0; i--) if (SPAWN_PLAN[i].kind === kind) SPAWN_PLAN.splice(i, 1);
  return had;
}

/** Kinds with a registered doctrine row. */
export const doctrineKinds = () => [...DOCTRINES.keys()];

/**
 * A ranged kind whose ranged rows can be TORN OFF re-bands on the tear: strip
 * the gun and the outer half of the band becomes a range with no answer, which
 * `AttackPicker.coveredAt()` reports as a hole and `Engage` then spends the
 * fight walking out of. Closing it by CHANGING THE BAND is the doctrine; it is
 * one row per kind (`reband`).
 *
 * `machine.engageCfg` is the memoised per-kind config object shared by every
 * machine of that kind, so the re-band is written onto a per-MACHINE clone
 * (`ai.engage.cfg`) and never leaks to its siblings.
 */
export function rebandMachine(m, band, archetype = null) {
  const eng = m.ai?.engage;
  if (!eng || !band) return false;
  if (eng.cfg === m.engageCfg) eng.cfg = { ...m.engageCfg };   // per-machine copy
  eng.cfg.band = band.slice();
  if (archetype) eng.cfg.archetype = archetype;
  eng._heldHi = Math.max(4, band[1] * 1.5);
  eng.ring = eng._pickRing();
  return true;
}

/**
 * Install the per-machine doctrine for a newly spawned machine. Called from
 * `Machines._spawnCls` for every kind with a registered row, including
 * respawns, so a site that repopulates gets its doctrine back.
 */
export function installDoctrine(m, opts = {}) {
  const kind = m.kind;
  const row = DOCTRINES.get(kind);
  if (!row) return false;

  row.components?.(m);

  // ---- herds: one shared stampede, one rearguard ------------------------
  if (row.herd) {
    // the base Machine holds `herd` for every species, but a class that
    // builds its own is still honoured, and membership is idempotent
    if (!m.herd && opts.herd) m.herd = opts.herd;
    if (m.herd) {
      if (m.herd.members && !m.herd.members.includes(m)) m.herd.members.push(m);
      m.onAlerted = () => { Squads.alarmHerd(m); };
      m._flee = (dt) => Squads.stepFlee(m, dt);
      /**
       * ...and the stampede has to OWN the frame. `Machine._engageFrame`
       * already hands it `_flee`, but `alert` is a separate state; a class
       * that does not override `_stateAlert` would stand in `alert` while its
       * herd ran.
       */
      const baseAlert = m._stateAlert.bind(m);
      m._stateAlert = (dt) => {
        if (m._fleeing && Squads.stepFlee(m, dt)) return;
        baseAlert(dt);
      };
    }
  }

  if (row.reband) {
    m._onPartTorn = (part) => rebandMachine(m, row.reband[part.name]);
  }

  row.install?.(m, opts);

  const calm = opts.eyeCalm || row.body?.eyeCalm;
  if (calm) {
    m._eyeCalm = new THREE.Color(calm);
    m._eyeColor.copy(m._eyeCalm);
  }
  return true;
}

/**
 * Manager-side install: one listener for the part-tear hook the doctrine needs.
 *
 * ONE listener for the whole manager, not one per machine — a per-machine
 * subscription to a long-lived bus is the exact shape `A90-memory-stability`
 * punishes, because the bus then retains every machine that ever existed.
 * This one is registered once, keyed by the event payload, and never removed
 * because the manager outlives the world.
 */
export function installExpansionDoctrine(machines) {
  const ctx = machines.ctx;
  ctx.events.on('part-torn', ({ machine, part }) => {
    machine?._onPartTorn?.(part);
  });
  return machines;
}

/* ====================================================================== */
/* SPAWN LAYOUT                                                           */
/* ====================================================================== */

/**
 * Where a site actually goes: the published world-props POI when there is one,
 * else the measured fallback. Never inside the camp keep-out and never outside
 * the `_route` rim clamp (EXTENT.routeRim) — both are re-checked here because a
 * POI list this lane does not own could put a machine in the camp.
 */
export function siteAnchor(ctx, plan) {
  const out = { x: plan.x, z: plan.z, from: 'casting-v4' };
  const sites = ctx.worldSites;
  const list = Array.isArray(sites) ? sites : (sites && typeof sites.list === 'function' ? sites.list() : null);
  if (list && plan.poi) {
    const hit = list.find((s) => s && (s.id === plan.poi || s.name === plan.poi || s.poi === plan.poi));
    if (hit && Number.isFinite(hit.x) && Number.isFinite(hit.z)) {
      out.x = hit.x; out.z = hit.z; out.from = 'world-props:' + plan.poi;
    }
  }
  // camp keep-out (the same circle `Machines._route` respects)
  const dx = out.x - REST_SITE.x, dz = out.z - REST_SITE.z;
  const d = Math.hypot(dx, dz);
  if (d < 46) {
    out.x = REST_SITE.x + (dx / (d || 1)) * 46;
    out.z = REST_SITE.z + (dz / (d || 1)) * 46;
    out.clamped = 'camp';
  }
  const r = Math.hypot(out.x, out.z);
  if (r > ANCHOR_RIM) { out.x *= ANCHOR_RIM / r; out.z *= ANCHOR_RIM / r; out.clamped = 'rim'; }
  return out;
}

/**
 * Spawn the whole expansion roster. Called once, after the variety models are
 * loaded (the chassis species are among them). Returns an audit the gates and
 * the lane report read: what spawned, where it came from, and which kinds are
 * still riding a chassis.
 */
export function spawnExpansion(machines) {
  const ctx = machines.ctx;
  const audit = { spawned: 0, sites: [], chassis: [], skipped: [] };
  for (const plan of SPAWN_PLAN) {
    if (!machines.canSpawn(plan.kind)) { audit.skipped.push(plan.kind); continue; }
    const at = siteAnchor(ctx, plan);
    const rec = { kind: plan.kind, at: [+at.x.toFixed(1), +at.z.toFixed(1)], from: at.from, n: 0 };

    let herd = null;
    if (plan.herd) {
      herd = {
        center: new THREE.Vector3(at.x, 0, at.z),
        vector: new THREE.Vector3(0, 0, 1),
        alarmed: false, rearguard: null, members: [],
      };
      machines.squads.registerHerd(herd);
    }
    let basking = null;
    if (plan.basking) {
      basking = { x: at.x, z: at.z, members: [] };
      machines.squads.registerBasking(basking);
    }
    const convoyMembers = [];

    for (let i = 0; i < plan.n; i++) {
      const a = (i / Math.max(1, plan.n)) * Math.PI * 2 + 0.6;
      const rr = plan.n > 1 ? 7 + (i % 2) * 5 : 0;
      const m = machines.spawn(plan.kind, at.x + Math.sin(a) * rr, at.z + Math.cos(a) * rr, {
        herd,
        route: machines._route(at.x, at.z, plan.route, plan.routePoints ?? 4, i * 1.9),
        heading: a,
        territory: plan.territory ? { x: at.x, z: at.z, r: plan.territory } : null,
      });
      if (!m) continue;
      rec.n++;
      audit.spawned++;
      /**
       * NOT AN UNCONDITIONAL PUSH. The Strider chassis' own constructor
       * already does `if (this.herd) this.herd.members.push(this)`, so
       * appending here listed every member TWICE — which made the herd read
       * four strong with two machines and the "one rearguard, everyone else
       * runs" count come out as 2 of 3. When `machines-expansion` lands a
       * Broadhead class that does not self-register, this still adds it.
       */
      if (herd) machines.squads.join(m, herd, 'herd');
      /**
       * ...AND THE POOL GOES THROUGH THE SAME DOOR (fix round 2). This was
       * `basking.members.push(m); m.basking = basking;` — a raw attachment
       * that no MachineSite ever saw, so the pair's membership died on the
       * first respawn and the ambush never re-formed. `Squads.join` pushes,
       * elects, and writes the handle back into the site record.
       */
      if (basking) machines.squads.join(m, basking, 'basking');
      if (plan.convoy) convoyMembers.push(m);
    }

    if (plan.convoy && convoyMembers.length) {
      machines.squads.registerConvoy({
        members: convoyMembers,
        route: machines._route(at.x, at.z, plan.route, 4, 1.1),
        defend: 'cargo', radius: 9,
      });
    }

    // escorts hold SLOTS on a ring around the herd — not a widened alarm
    if (plan.escort && machines.canSpawn(plan.escort.kind)) {
      const guards = [];
      for (let i = 0; i < plan.escort.n; i++) {
        const seed = 0.9 + i * 2.6;
        const g = machines.spawn(plan.escort.kind,
          at.x + Math.sin(seed) * 30, at.z + Math.cos(seed) * 30,
          { route: machines._route(at.x, at.z, 32, 6, seed), heading: seed });
        if (g) { guards.push(g); audit.spawned++; }
      }
      if (guards.length) machines.squads.assignEscorts(at, guards, plan.escort.radius);
      rec.escorts = guards.length;
    }
    audit.sites.push(rec);
  }
  audit.chassis = machines.chassisAudit();
  return audit;
}

/** Everything a gate or the debug HUD needs to check this file's claims. */
export function doctrineAudit(machines) {
  const kinds = doctrineKinds();
  const out = { kinds, live: {}, squads: {} };
  for (const k of kinds) out.live[k] = 0;
  for (const m of machines.list) if (out.live[m.kind] !== undefined) out.live[m.kind]++;
  out.squads = {
    herds: machines.squads.herds.length,
    convoys: machines.squads.convoys.length,
    baskings: machines.squads.baskings.length,
  };
  return out;
}

export { _v as _doctrineScratch };
