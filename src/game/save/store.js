import { VERSION, SLOTS, META_KEY, slotKey, parse, classify, newest, deathRecord, olderSaves, slotInfo } from './format.js';

/**
 * SAVE v6 STORE — three slots of { named, checkpoint } over any Storage-shaped object
 * ({ getItem, setItem, removeItem, key, length }). Pure; `src/core/save.js` hands it localStorage (or a memory
 * map when storage is locked), node --test hands it a Map shim. Every call is total: failures come back as
 * { ok:false, error }, never as an exception.
 *
 *   write(record)               to record.slot / record.kind
 *   read(slot, kind)            v6 record or null
 *   latest(slot)                the newer of named and checkpoint
 *   forDeath(slot, opts)        format.deathRecord over the slot's two records
 *   slots()                     [{ slot, named, checkpoint }] headers for the three slot cards
 *   active / setActive(n)       the slot New Game and Continue use (kept in cal.v6.meta)
 *   erase(slot)                 removes that slot's two v6 records (never an older save)
 *   older()                     keys of older saves still in storage (left there; never deleted here)
 */
export class SaveStore {
  constructor(storage) {
    this.storage = storage;
    this.lastError = null;
  }

  _get(k) { try { return this.storage?.getItem(k) ?? null; } catch (e) { this.lastError = String(e?.message || e); return null; } }
  _set(k, v) {
    try { this.storage.setItem(k, v); return { ok: true }; }
    catch (e) { this.lastError = String(e?.message || e); return { ok: false, error: this.lastError }; }
  }
  _del(k) { try { this.storage?.removeItem(k); } catch { /* nothing to do */ } }

  meta() {
    try { return { active: 1, ...JSON.parse(this._get(META_KEY) || '{}') }; } catch { return { active: 1 }; }
  }
  writeMeta(patch) { const m = { ...this.meta(), ...patch, v: VERSION }; this._set(META_KEY, JSON.stringify(m)); return m; }

  get active() { const n = this.meta().active | 0; return n >= 1 && n <= SLOTS ? n : 1; }
  setActive(n) { this.writeMeta({ active: Math.max(1, Math.min(SLOTS, n | 0 || 1)) }); return this.active; }

  write(rec) {
    if (!rec || rec.v !== VERSION) return { ok: false, error: 'not a v6 record', bytes: 0 };
    let json;
    try { json = JSON.stringify(rec); } catch (e) { return { ok: false, error: String(e?.message || e), bytes: 0 }; }
    const res = this._set(slotKey(rec.slot, rec.kind), json);
    if (res.ok) this.writeMeta({ last: rec.slot, lastAt: rec.savedAt });
    return { ...res, bytes: json.length, key: slotKey(rec.slot, rec.kind) };
  }

  read(slot = this.active, kind = 'named') { return parse(this._get(slotKey(slot, kind))); }
  status(slot = this.active, kind = 'named') { return classify(this._get(slotKey(slot, kind))); }
  has(slot = this.active, kind = 'named') { return !!this.read(slot, kind); }

  latest(slot = this.active) { return newest(this.read(slot, 'named'), this.read(slot, 'checkpoint')); }

  forDeath(slot = this.active, opts = {}) {
    return deathRecord(this.read(slot, 'named'), this.read(slot, 'checkpoint'), opts);
  }

  slots() {
    const out = [];
    for (let n = 1; n <= SLOTS; n++) {
      out.push({ slot: n, named: slotInfo(this.read(n, 'named')), checkpoint: slotInfo(this.read(n, 'checkpoint')) });
    }
    return out;
  }

  /** The slot Continue loads: the active one if it holds a record, else the most recently written. */
  continueSlot() {
    if (this.latest(this.active)) return this.active;
    let best = null, at = -1;
    for (let n = 1; n <= SLOTS; n++) { const r = this.latest(n); if (r && r.savedAt > at) { best = n; at = r.savedAt; } }
    return best;
  }

  erase(slot) {
    this._del(slotKey(slot, 'named'));
    this._del(slotKey(slot, 'checkpoint'));
  }

  older() { return olderSaves(this.storage); }
}

/** A Storage-shaped Map, for node tests and for a browser with storage locked (memory only). */
export class MemoryStorage {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(String(k), String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
