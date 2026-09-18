import * as THREE from 'three';
import { SITE, span } from './tables.js';
import { safeEmit } from './emit.js';

/**
 * MachineSite lifecycle — `perf-tech-08` ("corpses never despawn"),
 * `progression-003` (site respawn).
 *
 * Every spawn is remembered as a SITE: kind, anchor, and the options it was
 * built with. A wreck then walks a four-stage lifecycle instead of sitting in
 * the scene forever:
 *
 *   0-10 s   dying   — the death crumple + loot beacon (unchanged)
 *   10 s     freeze  — animation, FX and shadow casting stop; `update()` is a
 *                      no-op from here, so 8 wrecks cost nothing per frame
 *   70 s     fade    — the wreck dissolves over 12 s (25 s if it was looted)
 *   82 s     dispose — removed from the scene, machine-owned materials freed,
 *                      the loot interactable unregistered, the roster entry
 *                      dropped, and a respawn scheduled 5-7 min out
 *
 * Geometry is deliberately NOT disposed when it belongs to the shared source
 * asset — every clone of a species points at the same buffers, so disposing
 * them would blank every other machine of that kind. Only per-machine
 * procedural geometry (component meshes) and per-machine cloned materials go.
 */

const _protected = new Map();   // kind -> Set<BufferGeometry>

/**
 * Keyed on `machine.modelKind`, NOT on `machine.kind`: an expansion species
 * riding a donor chassis (see `Machine.modelKind`) shares the DONOR's buffers,
 * so a Broadhead disposed under its own name would free every Strider's
 * geometry. Measured the hard way once already with the shared-asset rule.
 */
function protectedGeos(ctx, kind) {
  let s = _protected.get(kind);
  if (s) return s;
  s = new Set();
  const src = ctx.assets?.models?.[kind]?.root;
  if (src) src.traverse((o) => { if (o.geometry) s.add(o.geometry); });
  _protected.set(kind, s);
  return s;
}

export class SiteManager {
  constructor(machines) {
    this.machines = machines;
    this.ctx = machines.ctx;
    this.sites = [];            // { id, kind, x, z, opts, machine, respawnAt }
    this.wrecks = [];           // { m, age, phase, site }
    this.clock = 0;
    this.disposed = 0;
    this.respawned = 0;
    this._nextId = 1;
  }

  /**
   * Remember how to rebuild this spawn later — PLACEMENT ONLY.
   *
   * `kind` and `modelKind` are stripped before they are stored (fix round 1).
   * A site already carries its `kind` in its own field, and WHICH SCULPT that
   * kind wears is a question only `Machines._resolveKind` may answer, at the
   * moment of the respawn. Storing the answer froze it: a machine spawned on a
   * donor chassis wrote `modelKind: <donor>` into its site, and after
   * `machines.registerKind()` retired that chassis the replay still handed the
   * donor string back to `spawn()`, which used to spread caller options last.
   * The respawned "Broadhead" was a Strider with a Broadhead's brain, and no
   * audit could see it. `spawn()` also overrides identity from the resolver
   * now; this is the same rule enforced at the other end, so a site record
   * written by any future path is inert rather than merely outvoted.
   */
  note(machine, kind, x, z, opts) {
    const placement = { ...(opts || {}) };
    for (const key of ['kind', 'modelKind', '_site', '_placement']) delete placement[key];
    const site = {
      id: this._nextId++, kind, x, z,
      opts: placement,
      machine, respawnAt: 0, pending: false,
    };
    machine._site = site;
    this.sites.push(site);
    return site;
  }

  onKilled(machine) {
    if (machine._wreck) return;
    machine._wreck = { m: machine, age: 0, phase: 'dying', site: machine._site || null };
    this.wrecks.push(machine._wreck);
    // oldest-first cap so a long fight cannot pile up wrecks
    if (this.wrecks.length > SITE.maxWrecks) {
      const victim = this.wrecks.find((w) => w.phase !== 'gone');
      if (victim) victim.age = Math.max(victim.age, SITE.fadeStart);
    }
  }

  /** Debug/gate hook: age every wreck by `seconds` and run the lifecycle. */
  advance(seconds, step = 1) {
    for (let t = 0; t < seconds; t += step) this.update(step);
    return this.audit();
  }

  _freeze(m) {
    m._frozen = true;
    m.root.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) { o.castShadow = false; o.receiveShadow = false; }
    });
    /**
     * The FX list is what keeps a corpse allocating, so it goes — but DROPPING
     * it is not the same as tearing it down. FX meshes are parented to the
     * scene, not to `m.root`, so `_fx.length = 0` used to orphan every effect
     * still in flight (fix round 1). `disposeFx(true)` removes and frees them
     * and keeps only the loot beam, which is meant to outlive the crumple.
     */
    m.disposeFx(true);
  }

  _fadeMaterials(m, k) {
    if (!m._fadeMats) {
      m._fadeMats = [];
      m.root.traverse((o) => {
        if (!o.isMesh && !o.isSkinnedMesh) return;
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const mat of mats) m._fadeMats.push({ mat, o0: mat.opacity ?? 1, tr: mat.transparent });
      });
    }
    for (const f of m._fadeMats) {
      f.mat.transparent = true;
      f.mat.depthWrite = k > 0.6;
      f.mat.opacity = f.o0 * k;
    }
  }

  dispose(m) {
    const ctx = this.ctx;
    if (m._disposed) return;
    m._disposed = true;
    // loot + crit prompts
    if (m._lootEntry) ctx.interactables?.unregister?.(m._lootEntry);
    m.ai?.reactions?._closeCrit?.();
    const keep = protectedGeos(ctx, m.modelKind || m.kind);
    m.root.traverse((o) => {
      if (o.geometry && !keep.has(o.geometry)) o.geometry.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const mat of mats) mat.dispose?.();
    });
    m.root.parent?.remove(m.root);
    // ...and every squad-side reference to it (herd member list, convoy roster,
    // basking site, corruption victims) — see `Squads.forget`
    this.machines.squads?.forget?.(m);
    /**
     * ...and the FX meshes, which are children of the SCENE, not of `root`.
     * The loot beacon is the one that always survived: a cyan pillar left
     * standing in an empty meadow, retaining the whole disposed Machine
     * through `beam.userData.machine`. `disposeFx(false)` takes the beam, any
     * effect still in flight, and the wreck's torn-part debris with it.
     */
    m.disposeFx(false);
    ctx.hitHulls?.dispose?.(m);
    this._forgetCollider(m);
    const i = this.machines.list.indexOf(m);
    if (i >= 0) this.machines.list.splice(i, 1);
    this.disposed++;
    // schedule the site to repopulate
    const site = m._site;
    if (site) {
      site.machine = null;
      site.pending = true;
      site.respawnAt = this.clock + span(SITE.respawn);
    }
    safeEmit(ctx, 'machine-disposed', { kind: m.kind, site: site ? site.id : null });
  }

  /**
   * `spatial` keys its dynamic machine capsules off `machines.list`; a machine
   * that leaves the list would otherwise leave an inert collider behind. There
   * is no public "forget this ref" call yet (requested in the lane report), so
   * this drops it defensively and never throws if the internals move.
   */
  _forgetCollider(m) {
    const C = this.ctx.collision;
    if (!C) return;
    try {
      const map = C._machineMap;
      const rec = map?.get?.(m);
      if (rec) {
        const ids = [rec.body?.id, rec.cam?.id].filter((v) => v !== undefined);
        if (ids.length && C.unregister) C.unregister(ids);
        map.delete(m);
      }
    } catch { /* spatial internals moved — the collider is already inert */ }
  }

  update(dt) {
    this.clock += dt;
    const p = this.ctx.player;

    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      const m = w.m;
      if (m._disposed) { this.wrecks.splice(i, 1); continue; }
      w.age += dt;

      if (w.phase === 'dying' && w.age >= SITE.freeze) {
        w.phase = 'frozen';
        this._freeze(m);
      }
      const looted = m._looted;
      // a FROZEN wreck never ticks its FX, so the beam cannot fade itself out
      // when the pile is emptied — the lifecycle takes it instead
      if (looted && m._frozen && m._beaconMesh) m.dropBeacon();
      const fadeAt = looted ? Math.min(SITE.fadeStart, w.age + SITE.keepLooted) : SITE.fadeStart;
      const farAway = p && m.position.distanceToSquared(p.position) > SITE.farDispose * SITE.farDispose;
      if (w.phase === 'frozen' && (w.age >= fadeAt || (farAway && w.age > SITE.freeze))) {
        w.phase = 'fading';
        w.fadeT = 0;
      }
      if (w.phase === 'fading') {
        w.fadeT += dt;
        const k = 1 - Math.min(1, w.fadeT / SITE.fadeTime);
        this._fadeMaterials(m, k);
        if (k <= 0) {
          w.phase = 'gone';
          this.dispose(m);
          this.wrecks.splice(i, 1);
        }
      }
    }

    // respawn scheduling
    for (const s of this.sites) {
      if (!s.pending || s.machine) continue;
      if (this.clock < s.respawnAt) continue;
      if (p) {
        const dx = p.position.x - s.x, dz = p.position.z - s.z;
        if (dx * dx + dz * dz < SITE.respawnMinDist * SITE.respawnMinDist) continue;
      }
      const m = this.machines.spawn(s.kind, s.x, s.z, { ...s.opts, _site: s });
      if (m) {
        s.machine = m;
        s.pending = false;
        this.respawned++;
        safeEmit(this.ctx, 'machine-respawned', { machine: m, site: s.id });
      } else {
        s.respawnAt = this.clock + 30;   // model not ready — try again shortly
      }
    }
  }

  audit() {
    return {
      sites: this.sites.length,
      pending: this.sites.filter((s) => s.pending).length,
      wrecks: this.wrecks.length,
      phases: this.wrecks.map((w) => w.phase),
      disposed: this.disposed,
      respawned: this.respawned,
      clock: +this.clock.toFixed(1),
      nextRespawnIn: Math.max(0, Math.round(
        Math.min(...this.sites.filter((s) => s.pending).map((s) => s.respawnAt - this.clock), Infinity))),
    };
  }
}

export { SITE };
