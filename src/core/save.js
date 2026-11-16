/**
 * SAVE / CHECKPOINT / CONTINUE — save v6 (BUILD M1.6f; BIBLE 17). Lane `systems`.
 * ---------------------------------------------------------------------------
 * The format, the three slots, the older-save rule and the one death rule are pure modules under
 * src/game/save/ (format.js, store.js) with their own node --test rows (tools/gates/systems/save-v6.test.mjs).
 * This file is the bridge to the live game: it reads the run off ctx into a v6 record and puts a record back.
 *
 *   SLOT.main / SLOT.checkpoint   the ACTIVE slot's named save and silent checkpoint (keys follow the active slot)
 *   SLOT.meta                     cal.v6.meta (active slot, Tolerance)
 *
 * What a record holds (format.js REQUIRED): quest stages (ctx.spine), satchel, ammo, position, revealed
 * triangles, lit Braziers and the last rest (ctx.braziers), Tolerance, loadout; plus the hour and weather, vitals,
 * and `legacy` (progression.serialize() and the machine roster, for the systems that still keep their own state).
 *
 * Design rules kept from v5: a snapshot is plain JSON; every storage call is wrapped (localStorage throws in
 * locked-down browsers: failures are `{ ok:false }` and a `save-error` event, never an exception or a
 * console.error); restore is idempotent and order-safe, so the death path and the load path are the same code.
 *
 * Published API (also `ctx.progression.saves`):
 *   snapshot(reason) · write(key, reason) · read(key) · apply(record, opts) · has(key) · clear(key) · info(key)
 *   meta() · writeMeta(patch) · deathRecord(hour) · olderSaves() · slots() · useSlot(n) · store
 * Events: save-written, save-loaded, save-error.
 */
import { VERSION, META_KEY, slotKey, makeRecord, slotInfo, parse, classify } from '../game/save/format.js';
import { SaveStore, MemoryStorage } from '../game/save/store.js';

export const SAVE_VERSION = VERSION;

/* -------------------------------------------------------------------------- */
/* storage — every call survives a locked-down browser                         */
/* -------------------------------------------------------------------------- */

function browserStorage() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = '__cal_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

const _memory = new MemoryStorage();
/** localStorage, or a memory map when storage is locked (a run stays internally consistent). */
const STORAGE = browserStorage() ?? _memory;
const STORE = new SaveStore(STORAGE);

export function rawRead(key) { try { return STORAGE.getItem(key); } catch { return null; } }
export function rawWrite(key, value) {
  try { STORAGE.setItem(key, value); return { ok: STORAGE !== _memory, error: STORAGE === _memory ? 'localStorage unavailable (memory only)' : undefined }; }
  catch (err) { return { ok: false, error: String(err?.message || err) }; }
}
export function rawClear(key) { try { STORAGE.removeItem(key); } catch { /* nothing to do */ } }

/** Keys follow the active slot, so `progression`'s SLOT.main / SLOT.checkpoint calls need no change. */
export const SLOT = Object.freeze({
  get main() { return slotKey(STORE.active, 'named'); },
  get checkpoint() { return slotKey(STORE.active, 'checkpoint'); },
  meta: META_KEY,
});

const kindOf = (key) => (String(key).endsWith('.checkpoint') ? 'checkpoint' : 'named');
const slotOf = (key) => Number(/slot(\d)/.exec(String(key))?.[1]) || STORE.active;
const r3 = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n) * 1000) / 1000 : 0);

export class SaveSystem {
  constructor(ctx, progression) {
    this.ctx = ctx;
    this.prog = progression;
    this.store = STORE;
    this.lastError = null;
    this.lastWrite = 0;
    this.loadedFrom = null;
    this.writes = { named: 0, checkpoint: 0 };
  }

  _emit(type, payload) {
    if (this.prog?._emit) { this.prog._emit(type, payload); return; }
    try { this.ctx.events?.emit?.(type, payload); } catch { /* foreign listener */ }
  }

  /* ------------------------------ snapshot ------------------------------- */

  /** The run as plain state (format.makeRecord turns it into a record). */
  state() {
    const ctx = this.ctx;
    const p = ctx.player;
    const satchel = {};
    if (ctx.inventory?.counts) for (const [id, n] of ctx.inventory.counts) if (n > 0) satchel[id] = n;
    const combat = ctx.combat;
    const ammo = {}, activeAmmo = {};
    if (combat) {
      for (const id in (combat.ammo || {})) ammo[id] = combat.ammo[id];
      for (const w of (combat.weapons || [])) if (w?.id && w.activeAmmo) activeAmmo[w.id] = w.activeAmmo;
    }
    const sys = ctx.systemsGame;
    const br = ctx.braziers?.serialize?.() ?? { lit: [], lastRest: null };
    return {
      hour: ctx.environment?.time ?? 7,
      weather: ctx.environment?.weather ?? 'trade',
      place: sys?.placeName?.() ?? '',
      quest: ctx.spine?.serialize?.() ?? null,
      satchel,
      ammo,
      position: p ? { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.camYaw ?? 0, pitch: p.camPitch ?? 0, heading: p.heading ?? 0 } : {},
      vitals: p ? { health: p.health, maxHealth: p.maxHealth, gourd: p.gourd, maxGourd: p.maxGourd } : {},
      triangles: ctx.spine ? [...ctx.spine.triangles] : [],
      braziers: br,
      tolerance: this.prog?._difficulty ?? this.meta().difficulty ?? 'standard',
      loadout: {
        weapon: combat?.activeWeapon?.id ?? null,
        activeAmmo,
        rung: sys?.rung ?? 'starter',
        wear: ctx.player?.hero?.loadout?.armorId ?? null,
        quick: (ctx.quickslots?.slots ?? []).map((s) => (s?.earned ? s.kind : null)),
      },
      legacy: { prog: this.prog?.serialize?.() ?? null, roster: this._rosterSnapshot() },
    };
  }

  snapshot(reason = 'manual', key = SLOT.main) {
    return makeRecord(this.state(), { kind: kindOf(key), reason, slot: slotOf(key), savedAt: Date.now() });
  }

  _rosterSnapshot() {
    const out = [];
    const list = this.ctx.machines?.list;
    if (!Array.isArray(list)) return out;
    for (const m of list) {
      if (!m || !m.alive || m._disposed) continue;
      out.push({ site: m._site?.id ?? null, kind: m.kind, x: r3(m.position.x), z: r3(m.position.z), hp: r3(m.health), max: r3(m.maxHealth) });
    }
    out.sort((a, b) => (a.site ?? 1e9) - (b.site ?? 1e9));
    return out;
  }

  static rosterKey(roster) {
    return (roster || []).map((r) => `${r.site ?? 'x'}:${r.kind}`).sort().join(',');
  }

  /* -------------------------------- write -------------------------------- */

  write(key = SLOT.main, reason = 'manual') {
    let rec;
    try { rec = this.snapshot(reason, key); } catch (err) {
      this.lastError = String(err?.message || err);
      this._emit('save-error', { slot: key, error: this.lastError });
      return { ok: false, bytes: 0, error: this.lastError };
    }
    const res = this.store.write(rec);
    this.lastWrite = Date.now();
    if (res.ok) this.writes[rec.kind]++;
    if (!res.ok) { this.lastError = res.error; this._emit('save-error', { slot: key, error: res.error }); }
    this._emit('save-written', { slot: key, kind: rec.kind, reason, bytes: res.bytes, ok: res.ok, error: res.error ?? null });
    return { ok: res.ok, bytes: res.bytes, error: res.error ?? null };
  }

  read(key = SLOT.main) { return parse(rawRead(key)); }
  status(key = SLOT.main) { return classify(rawRead(key)); }
  has(key = SLOT.main) { return !!this.read(key); }
  clear(key = SLOT.main) { rawClear(key); }

  info(key = SLOT.main) {
    const d = this.read(key);
    if (!d) return null;
    return { ...slotInfo(d), reason: d.reason, level: 1, quest: d.quest?.id ?? null, difficulty: d.tolerance };
  }

  /** The three slot cards (BIBLE 18). */
  slots() { return this.store.slots(); }
  useSlot(n) { return this.store.setActive(n); }
  /** Keys of older saves (left in storage; the title says OLDER SAVE for them). */
  olderSaves() { return this.store.older(); }

  /* --------------------------------- meta -------------------------------- */

  meta() {
    const m = this.store.meta();
    return { hasSave: !!this.store.continueSlot(), lastSave: m.lastAt ?? 0, difficulty: m.difficulty ?? 'standard', ...m };
  }

  writeMeta(patch) { return this.store.writeMeta(patch); }

  /* ------------------------------- death --------------------------------- */

  /** THE ONE DEATH RULE (format.deathRecord): the newest record's world, Brea at her last rest. */
  deathRecord(hour = this.ctx.environment?.time ?? null) {
    return this.store.forDeath(this.store.active, { hour });
  }

  /* -------------------------------- apply -------------------------------- */

  /**
   * Restore a v6 record over the live world.
   * @param {{ world?:boolean, player?:boolean, quiet?:boolean }} [opts] `world:false` keeps the live machine roster
   *        (death: the fight she lost stays lost, nothing is re-populated mid-combat).
   */
  apply(data, opts = {}) {
    if (!data || data.v !== VERSION) return { ok: false, applied: [], error: 'no save / not a v6 record' };
    const ctx = this.ctx;
    const applied = [], fail = [];
    const step = (name, fn) => {
      try { fn(); applied.push(name); } catch (err) { fail.push(`${name}: ${String(err?.message || err)}`); }
    };

    if (opts.player !== false) {
      step('player', () => {
        const p = ctx.player;
        const s = data.position, v = data.vitals;
        if (!p || !s) return;
        if (Number.isFinite(v?.maxHealth) && v.maxHealth > 0) p.maxHealth = v.maxHealth;
        p.health = Math.min(p.maxHealth, Number.isFinite(v?.health) ? v.health : p.maxHealth);
        if (Number.isFinite(v?.maxGourd) && v.maxGourd > 0) p.maxGourd = v.maxGourd;
        p.gourd = Math.max(0, Math.min(p.maxGourd, v?.gourd ?? 0));
        p.position.set(s.x, s.y, s.z);
        if (Number.isFinite(s.yaw)) p.camYaw = s.yaw;
        if (Number.isFinite(s.pitch)) p.camPitch = s.pitch;
        if (Number.isFinite(s.heading)) p.heading = s.heading;
        p.velocity?.set?.(0, 0, 0);
        // the floor search starts at the RECORD's height (M1.6j): from the default 2 m over it the search ray (step-up +
        // 1.4 m long) stopped 0.6 m above a pillar's deck, she was set on the terrain inside the pillar, and the
        // collider pushed her 2.2 m off T1 (the save-continue row at 5f4bf42)
        p._snapToGround?.(Number.isFinite(s.y) ? s.y : undefined);
        this._emit('player-hurt', { health: p.health, max: p.maxHealth });
      });
    }

    step('satchel', () => {
      const inv = ctx.inventory;
      if (!inv?.counts) return;
      inv.counts.clear();
      for (const id in (data.satchel || {})) {
        const want = data.satchel[id];
        const cap = typeof inv.capacity === 'function' ? inv.capacity(id) : Infinity;
        inv.counts.set(id, Number.isFinite(cap) ? Math.min(want, cap) : want);
      }
    });

    step('ammo+loadout', () => {
      const combat = ctx.combat;
      if (!combat) return;
      for (const id in (combat.ammo || {})) combat.ammo[id] = data.ammo?.[id] ?? 0;
      for (const w of (combat.weapons || [])) {
        const want = data.loadout?.activeAmmo?.[w.id];
        if (want && w.ammoTypes?.some?.((a) => a?.id === want)) w.activeAmmo = want;
      }
      if (data.loadout?.weapon) combat.setWeapon?.(data.loadout.weapon, { silent: true });
      if (ctx.systemsGame) ctx.systemsGame.rung = data.loadout?.rung ?? 'starter';
      // the armour she had on (M1.6l): put back through armory's loadout, never one above the rung she owns
      const L = ctx.player?.hero?.loadout, want = data.loadout?.wear ?? 'pan-1';
      const owned = want === 'pan-1' || (want === 'pan-2' && (data.loadout?.rung ?? 'starter') !== 'starter');
      if (L?.equipArmor && owned && L.armorId !== want) L.equipArmor(want).catch((err) => console.warn('[save] wear:', err?.message || err));
    });

    step('hour+weather', () => {
      const env = ctx.environment;
      if (!env) return;
      if (Number.isFinite(data.hour)) env.setTime?.(data.hour);
      if (data.weather && data.weather !== env.weather) env.setWeather?.(data.weather, 0.2);
    });

    if (opts.world !== false) step('roster', () => this._applyRoster(data.legacy?.roster));

    step('progression', () => {
      if (data.legacy?.prog) this.prog?.deserialize?.(data.legacy.prog);
      if (data.tolerance && this.prog?._difficulty !== data.tolerance) this.prog?.setDifficulty?.(data.tolerance);
    });
    step('braziers', () => ctx.braziers?.restore?.(data.braziers));
    step('quest', () => ctx.systemsGame?.restoreQuest?.(data.quest, data.triangles));

    this.loadedFrom = data.reason ?? null;
    if (!opts.quiet) this._emit('save-loaded', { reason: data.reason, applied });
    return { ok: fail.length === 0, applied, error: fail.length ? fail.join(' | ') : null };
  }

  _applyRoster(roster) {
    if (!Array.isArray(roster)) return;
    const machines = this.ctx.machines;
    const sites = machines?.sites;
    if (!machines || !sites) return;
    const want = new Set();
    const hpBySite = new Map();
    for (const r of roster) if (r.site != null) { want.add(r.site); hpBySite.set(r.site, r); }
    for (let i = machines.list.length - 1; i >= 0; i--) {
      const m = machines.list[i];
      if (!m || m._disposed) continue;
      const id = m._site?.id ?? null;
      if (id == null || want.has(id)) continue;
      sites.dispose(m);
    }
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
    for (const m of machines.list) {
      const row = m._site ? hpBySite.get(m._site.id) : null;
      if (row && Number.isFinite(row.hp) && m.alive) m.health = Math.max(1, Math.min(m.maxHealth, row.hp));
    }
  }
}
