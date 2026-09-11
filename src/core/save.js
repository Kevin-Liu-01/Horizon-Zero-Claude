/**
 * SAVE / CHECKPOINT / CONTINUE  —  lane `progression`
 * ---------------------------------------------------------------------------
 * `progression-003` ("victory ends the session; no respawn; no save"),
 * `progression-019` ("death has no consequence"),
 * `missing-systems-title-save-campfire-flow`,
 * `onboarding-loop-death-no-stakes`.
 *
 * Round 3 had no persistence of any kind: closing the tab lost the run, dying
 * refilled the medicine pouch for free and teleported Aloy to the camp with no
 * cost, and winning required a page reload. This module is the whole of the
 * persistence contract:
 *
 *   SLOT.main        the player's campfire save   ("Continue" on the title)
 *   SLOT.checkpoint  the autosave death rolls back to
 *   SLOT.meta        difficulty + last-played, readable WITHOUT a full save
 *
 * Design rules, all of them learned from the audit:
 *
 * 1. **A snapshot is plain JSON and nothing else.** No THREE objects, no
 *    machine references, no functions. Every consumer re-resolves by id, so a
 *    save written before another lane reshapes its runtime still loads.
 * 2. **Every storage call is wrapped.** `localStorage` throws outright in
 *    Safari private mode and in some headless configurations; a save system
 *    that can take the frame loop down is worse than no save system. Failures
 *    surface as `{ ok:false, error }` and as a `save-error` event — never as an
 *    exception and never as a `console.error` (that is the gate runner's
 *    hard-fail channel).
 * 3. **Restore is idempotent and order-safe.** `apply()` may run on a fresh
 *    boot (Continue) or over a live world (death → checkpoint). Both paths run
 *    the same code, so the death path can never drift from the load path.
 * 4. **The alive-set is keyed by MachineSite id**, not by object identity.
 *    `machine-ai` already remembers every spawn as a site (`ai/sites.js`), and
 *    a site id survives a page reload because the roster is built in a fixed
 *    order. Machines the save says are dead are disposed on load; machines the
 *    save says are alive but that are missing are re-spawned at their site.
 *
 * Published API (also reachable as `ctx.progression.saves`):
 *   save.snapshot(reason)        -> plain object
 *   save.write(slot, reason)     -> { ok, bytes, error? }
 *   save.read(slot)              -> data | null
 *   save.apply(data, opts)       -> { ok, applied[], error? }
 *   save.has(slot) / save.clear(slot) / save.info(slot)
 *   save.meta() / save.writeMeta(patch)
 * Events: `save-written`, `save-loaded`, `save-error`, `checkpoint-loaded`.
 */

export const SAVE_VERSION = 4;

export const SLOT = {
  main: 'hzc.save.v4',
  checkpoint: 'hzc.checkpoint.v4',
  meta: 'hzc.meta.v4',
};

/* -------------------------------------------------------------------------- */
/* storage — every call survives a locked-down browser                         */
/* -------------------------------------------------------------------------- */

/** @returns {Storage|null} */
function store() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    // Presence is not permission: Safari private mode throws on setItem only.
    const probe = '__hzc_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** In-memory fallback so a run is still internally consistent with no storage. */
const _memory = new Map();

export function rawRead(key) {
  const s = store();
  try {
    const v = s ? s.getItem(key) : _memory.get(key);
    return v == null ? null : v;
  } catch {
    return _memory.get(key) ?? null;
  }
}

export function rawWrite(key, value) {
  _memory.set(key, value);
  const s = store();
  if (!s) return { ok: false, error: 'localStorage unavailable (memory only)' };
  try {
    s.setItem(key, value);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export function rawClear(key) {
  _memory.delete(key);
  const s = store();
  try { s?.removeItem(key); } catch { /* nothing to do */ }
}

/* -------------------------------------------------------------------------- */

const round = (n, p = 3) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  const k = 10 ** p;
  return Math.round(v * k) / k;
};

export class SaveSystem {
  /**
   * @param {object} ctx        shared game ctx
   * @param {object} progression the Progression system (owner)
   */
  constructor(ctx, progression) {
    this.ctx = ctx;
    this.prog = progression;
    this.lastError = null;
    this.lastWrite = 0;
    this.loadedFrom = null;
  }

  /**
   * `src/core/events.js` walks its subscriber set unguarded, so one broken
   * listener anywhere unwinds the emitter. A save that half-wrote because an
   * unrelated system threw inside `save-written` is exactly the failure this
   * module exists to prevent; routing every emit through the owner's guard
   * keeps persistence total. See `Progression._emit`.
   */
  _emit(type, payload) {
    if (this.prog?._emit) { this.prog._emit(type, payload); return; }
    try { this.ctx.events?.emit?.(type, payload); } catch { /* foreign listener */ }
  }

  /* ------------------------------ snapshot ------------------------------- */

  /** A complete, JSON-safe picture of the run. */
  snapshot(reason = 'manual') {
    const ctx = this.ctx;
    const p = ctx.player;
    const prog = this.prog;

    const inv = {};
    if (ctx.inventory?.counts) {
      for (const [id, n] of ctx.inventory.counts) if (n > 0) inv[id] = n;
    }

    const ammo = {};
    const activeAmmo = {};
    let weaponId = null;
    const combat = ctx.combat;
    if (combat) {
      for (const id in (combat.ammo || {})) ammo[id] = combat.ammo[id];
      for (const w of (combat.weapons || [])) {
        if (w?.id && w.activeAmmo) activeAmmo[w.id] = w.activeAmmo;
      }
      weaponId = combat.activeWeapon?.id ?? null;
    }

    return {
      v: SAVE_VERSION,
      savedAt: Date.now(),
      reason,
      world: {
        hour: round(ctx.environment?.time ?? 8, 3),
        weather: ctx.environment?.weather ?? 'clear',
        roster: this._rosterSnapshot(),
      },
      player: p ? {
        x: round(p.position.x), y: round(p.position.y), z: round(p.position.z),
        camYaw: round(p.camYaw ?? 0, 4),
        camPitch: round(p.camPitch ?? 0, 4),
        heading: round(p.heading ?? 0, 4),
        health: round(p.health, 2),
        maxHealth: round(p.maxHealth, 2),
        pouch: round(p.pouch, 2),
        maxPouch: round(p.maxPouch, 2),
      } : null,
      prog: prog ? prog.serialize() : null,
      inventory: inv,
      combat: { ammo, activeAmmo, weaponId },
    };
  }

  /**
   * The alive-set. One row per LIVING machine, keyed by its MachineSite id so
   * the identity survives a reload. `siteId` may be null for anything spawned
   * outside the site system (studio casts); those rows are informational only
   * and are never re-spawned.
   */
  _rosterSnapshot() {
    const out = [];
    const list = this.ctx.machines?.list;
    if (!Array.isArray(list)) return out;
    for (const m of list) {
      if (!m || !m.alive || m._disposed) continue;
      out.push({
        site: m._site?.id ?? null,
        kind: m.kind,
        x: round(m.position.x, 2),
        z: round(m.position.z, 2),
        hp: round(m.health, 1),
        max: round(m.maxHealth, 1),
      });
    }
    out.sort((a, b) => (a.site ?? 1e9) - (b.site ?? 1e9));
    return out;
  }

  /** Stable comparable form of the alive-set — what gate A65 diffs. */
  static rosterKey(roster) {
    return (roster || [])
      .map((r) => `${r.site ?? 'x'}:${r.kind}`)
      .sort()
      .join(',');
  }

  /* -------------------------------- write -------------------------------- */

  write(slot = SLOT.main, reason = 'manual') {
    let json;
    try {
      json = JSON.stringify(this.snapshot(reason));
    } catch (err) {
      this.lastError = String(err?.message || err);
      this._emit('save-error', { slot, error: this.lastError });
      return { ok: false, bytes: 0, error: this.lastError };
    }
    const res = rawWrite(slot, json);
    this.lastWrite = Date.now();
    if (slot === SLOT.main) this.writeMeta({ lastSave: this.lastWrite, hasSave: true });
    if (!res.ok) {
      this.lastError = res.error;
      this._emit('save-error', { slot, error: res.error });
    }
    this._emit('save-written', {
      slot, reason, bytes: json.length, ok: res.ok, error: res.error ?? null,
    });
    return { ok: res.ok, bytes: json.length, error: res.error ?? null };
  }

  read(slot = SLOT.main) {
    const raw = rawRead(slot);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      if (data.v !== SAVE_VERSION) return null;   // a stale format is not a crash
      return data;
    } catch {
      return null;
    }
  }

  has(slot = SLOT.main) { return !!this.read(slot); }

  clear(slot = SLOT.main) {
    rawClear(slot);
    if (slot === SLOT.main) this.writeMeta({ hasSave: false, lastSave: 0 });
  }

  /** Cheap header for a title screen: no world restore, no parse of the roster. */
  info(slot = SLOT.main) {
    const d = this.read(slot);
    if (!d) return null;
    return {
      slot,
      savedAt: d.savedAt,
      reason: d.reason,
      level: d.prog?.level ?? 1,
      quest: d.prog?.quests?.tracked ?? null,
      hour: d.world?.hour ?? 8,
      difficulty: d.prog?.difficulty ?? 'normal',
      machines: (d.world?.roster || []).length,
    };
  }

  /* --------------------------------- meta -------------------------------- */

  meta() {
    const raw = rawRead(SLOT.meta);
    if (!raw) return { hasSave: false, lastSave: 0, difficulty: 'normal' };
    try { return { hasSave: false, lastSave: 0, difficulty: 'normal', ...JSON.parse(raw) }; }
    catch { return { hasSave: false, lastSave: 0, difficulty: 'normal' }; }
  }

  writeMeta(patch) {
    const next = { ...this.meta(), ...patch };
    rawWrite(SLOT.meta, JSON.stringify(next));
    return next;
  }

  /* -------------------------------- apply -------------------------------- */

  /**
   * Restore a snapshot over the live world.
   *
   * @param {object} data
   * @param {{ world?:boolean, player?:boolean, quiet?:boolean }} [opts]
   *        `world:false` skips the machine roster (death → checkpoint keeps the
   *        fight the player just lost, so the encounter is re-runnable but not
   *        re-populated from scratch mid-combat).
   */
  apply(data, opts = {}) {
    if (!data || data.v !== SAVE_VERSION) {
      return { ok: false, applied: [], error: 'no save / version mismatch' };
    }
    const ctx = this.ctx;
    const applied = [];
    const fail = [];
    const step = (name, fn) => {
      try { fn(); applied.push(name); }
      catch (err) { fail.push(`${name}: ${String(err?.message || err)}`); }
    };

    if (opts.player !== false) {
      step('player', () => {
        const p = ctx.player;
        const s = data.player;
        if (!p || !s) return;
        p.maxHealth = s.maxHealth ?? p.maxHealth;
        p.health = Math.min(p.maxHealth, s.health ?? p.maxHealth);
        p.maxPouch = s.maxPouch ?? p.maxPouch;
        // progression-019: NO free refill. The pouch is exactly what it was.
        p.pouch = Math.max(0, Math.min(p.maxPouch, s.pouch ?? 0));
        p.position.set(s.x ?? p.position.x, s.y ?? p.position.y, s.z ?? p.position.z);
        if (Number.isFinite(s.camYaw)) p.camYaw = s.camYaw;
        if (Number.isFinite(s.camPitch)) p.camPitch = s.camPitch;
        if (Number.isFinite(s.heading)) p.heading = s.heading;
        p.velocity?.set?.(0, 0, 0);
        p._snapToGround?.();
        this._emit('player-hurt', { health: p.health, max: p.maxHealth });
      });
    }

    /**
     * The counts Map is written directly rather than through `inventory.add`,
     * because `add` announces every item ('item-gained', toasts, the pickup
     * animation) and a restore is not a haul. It IS clamped to the pocket
     * capacity `focus-items` publishes: a save taken before a capacity upgrade
     * was refunded — or written by an older build — must not leave a stack
     * sitting above its own cap, where the inventory screen would draw a
     * >100 % bar and the next `add` would silently delete the excess.
     *
     * OPEN CROSS-LANE ITEM (requested in the lane report): `focus-items` owns
     * the purchased capacity TIERS, and there is no published serializer for
     * them, so a save restores the items but not an upgraded pocket. Publish
     * `items.serializeCapacities()` / `restoreCapacities(obj)` and this step
     * will carry them.
     */
    step('inventory', () => {
      const inv = ctx.inventory;
      if (!inv?.counts) return;
      inv.counts.clear();
      for (const id in (data.inventory || {})) {
        const want = data.inventory[id];
        const cap = typeof inv.capacity === 'function' ? inv.capacity(id) : Infinity;
        inv.counts.set(id, Number.isFinite(cap) ? Math.min(want, cap) : want);
      }
    });

    step('combat', () => {
      const combat = ctx.combat;
      const s = data.combat;
      if (!combat || !s) return;
      for (const id in (s.ammo || {})) {
        if (combat.ammo && id in combat.ammo) combat.ammo[id] = s.ammo[id];
      }
      for (const w of (combat.weapons || [])) {
        const want = s.activeAmmo?.[w.id];
        if (want && w.ammoTypes?.some?.((a) => a?.id === want)) w.activeAmmo = want;
      }
      if (s.weaponId) combat.setWeapon?.(s.weaponId, { silent: true });
    });

    step('world-time', () => {
      const env = ctx.environment;
      if (!env) return;
      if (Number.isFinite(data.world?.hour)) env.setTime?.(data.world.hour);
      if (data.world?.weather && data.world.weather !== env.weather) {
        env.setWeather?.(data.world.weather, 0.2);
      }
    });

    if (opts.world !== false) step('roster', () => this._applyRoster(data.world?.roster));

    step('progression', () => this.prog?.deserialize?.(data.prog));

    this.loadedFrom = data.reason ?? null;
    if (!opts.quiet) this._emit('save-loaded', { reason: data.reason, applied });
    return { ok: fail.length === 0, applied, error: fail.length ? fail.join(' | ') : null };
  }

  /**
   * Reconcile the live roster with the saved alive-set.
   *
   * Both directions matter and the audit only tests one of them, so this does
   * both: machines alive now that the save says were dead are disposed through
   * the site lifecycle (which also schedules their respawn, exactly as if they
   * had been killed), and sites the save says were populated but that are empty
   * now are re-spawned.
   */
  _applyRoster(roster) {
    if (!Array.isArray(roster)) return;
    const machines = this.ctx.machines;
    const sites = machines?.sites;
    if (!machines || !sites) return;

    const want = new Set();
    for (const r of roster) if (r.site != null) want.add(r.site);
    const hpBySite = new Map();
    for (const r of roster) if (r.site != null) hpBySite.set(r.site, r);

    // 1. anything alive that should not be
    for (let i = machines.list.length - 1; i >= 0; i--) {
      const m = machines.list[i];
      if (!m || m._disposed) continue;
      const id = m._site?.id ?? null;
      if (id == null) continue;              // studio cast / untracked spawn
      if (want.has(id)) continue;
      sites.dispose(m);
    }

    // 2. anything that should be alive but is not
    for (const site of sites.sites) {
      if (!want.has(site.id)) continue;
      if (site.machine && site.machine.alive && !site.machine._disposed) continue;
      const row = hpBySite.get(site.id);
      const m = machines.spawn(site.kind, site.x, site.z, { ...site.opts, _site: site });
      if (m) {
        site.machine = m;
        site.pending = false;
        if (row && Number.isFinite(row.hp)) m.health = Math.max(1, Math.min(m.maxHealth, row.hp));
      }
    }

    // 3. carry saved health onto the survivors
    for (const m of machines.list) {
      const row = m._site ? hpBySite.get(m._site.id) : null;
      if (row && Number.isFinite(row.hp) && m.alive) {
        m.health = Math.max(1, Math.min(m.maxHealth, row.hp));
      }
    }
  }
}
