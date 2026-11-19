/**
 * SAVE v6 — the format (BUILD M1.6f; BIBLE 17 "Rest and save"). Pure: no DOM, no ctx; storage is passed in, so
 * node --test runs every rule (tools/gates/systems/save-v6.test.mjs).
 *
 * A record carries its version number (`v: 6`) and everything the slice needs to stand back up:
 *   quest stages (the spine's serialize), satchel, ammo, position, revealed triangles, lit Braziers and the last
 *   rest, Tolerance, loadout; plus the hour and weather, vitals, the site clock (`sites`, M1.6n) and the legacy
 *   systems' own blob (`legacy`).
 *
 * Three slots. Each has two records: the NAMED save (written by a rest at a Brazier) and the silent CHECKPOINT
 * (a completed quest stage, a closed triangle, a re-surveyed benchmark). Keys:
 *   cal.v6.slot<N>.named · cal.v6.slot<N>.checkpoint · cal.v6.meta
 *
 * OLDER SAVES (BIBLE 17): a record written by an earlier format is not migrated, not read and never deleted. It is
 * found under its own key (any `cal.*` key whose record has no `v` or a `v` below 6, or a key named for v1-v5),
 * Continue is hidden for it and the title shows `OLDER SAVE · NOT READABLE BY THIS BUILD`. Every later format ships
 * a one-step migration from this one (`MIGRATIONS`, empty while 6 is the newest).
 *
 * THE ONE DEATH RULE: death returns Brea to the Brazier of her last rest; the world and satchel are those of the
 * NEWEST record, named or checkpoint. `deathRecord(named, checkpoint)` builds exactly that.
 */
import { normaliseAreas } from './fields.js';

export const VERSION = 6;
export const SLOTS = 3;
export const KEY_PREFIX = 'cal.v6';
export const META_KEY = `${KEY_PREFIX}.meta`;
/** Every later format adds `{ from: 6, to: 7, up(record) }` here. */
export const MIGRATIONS = Object.freeze([]);

export const REQUIRED = Object.freeze([
  'quest', 'satchel', 'ammo', 'position', 'triangles', 'braziers', 'tolerance', 'loadout',
]);

export function slotKey(slot, kind = 'named') {
  const n = Math.max(1, Math.min(SLOTS, slot | 0 || 1));
  if (kind !== 'named' && kind !== 'checkpoint') throw new Error(`unknown record kind ${kind}`);
  return `${KEY_PREFIX}.slot${n}.${kind}`;
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const r3 = (v) => Math.round(num(v) * 1000) / 1000;
const counts = (o) => {
  const out = {};
  for (const k of Object.keys(o || {}).sort()) { const n = num(o[k]); if (n > 0) out[k] = n; }
  return out;
};

/**
 * Build a v6 record from a plain state object. Everything is copied and normalised, so a record is JSON-stable:
 * build(read(write(build(s)))) deep-equals build(s).
 */
export function makeRecord(s, { kind = 'named', reason = 'manual', slot = 1, savedAt = Date.now() } = {}) {
  const p = s.position || {};
  const lr = s.braziers?.lastRest || null;
  return {
    v: VERSION,
    kind,
    reason: String(reason),
    slot: slot | 0 || 1,
    savedAt: num(savedAt),
    hour: r3(s.hour ?? 7),
    weather: String(s.weather ?? 'trade'),
    place: String(s.place ?? ''),
    quest: s.quest ? JSON.parse(JSON.stringify(s.quest)) : null,
    satchel: counts(s.satchel),
    ammo: counts(s.ammo),
    position: { x: r3(p.x), y: r3(p.y), z: r3(p.z), yaw: r3(p.yaw), pitch: r3(p.pitch), heading: r3(p.heading) },
    vitals: {
      health: r3(s.vitals?.health ?? 100), maxHealth: r3(s.vitals?.maxHealth ?? 100),
      gourd: r3(s.vitals?.gourd ?? 0), maxGourd: r3(s.vitals?.maxGourd ?? 0),
    },
    triangles: [...new Set((s.triangles || []).map(String))].sort(),
    braziers: {
      lit: [...new Set((s.braziers?.lit || []).map(String))].sort(),
      ash: [...new Set((s.braziers?.ash || []).map(String))].sort(),
      unlocked: [...new Set((s.braziers?.unlocked || []).map(String))].sort(),
      lastRest: lr ? { id: String(lr.id), x: r3(lr.x), y: r3(lr.y), z: r3(lr.z), yaw: r3(lr.yaw), hour: r3(lr.hour) } : null,
    },
    tolerance: String(s.tolerance ?? 'standard'),
    loadout: {
      weapon: s.loadout?.weapon ?? null,
      activeAmmo: { ...(s.loadout?.activeAmmo || {}) },
      rung: String(s.loadout?.rung ?? 'starter'),
      wear: s.loadout?.wear == null ? null : String(s.loadout.wear),
      quick: Array.isArray(s.loadout?.quick) ? s.loadout.quick.map((q) => (q == null ? null : String(q))) : [],
    },
    // the site clock (M1.6n, src/game/sites/clock.js serialize): its hours and the cleared sites; optional, so a v6
    // record written before it reads as a fresh clock
    sites: s.sites ? JSON.parse(JSON.stringify(s.sites)) : null,
    // Milestone 2's area fields (./fields.js: walls, benchmarks, kit, region truth, the M2 quests); optional, so a
    // slice record (none written) carries forward with every one of them fresh (Q5)
    areas: normaliseAreas(s.areas),
    legacy: s.legacy ?? null,
  };
}

/** 'ok' | 'older' | 'corrupt' | 'none' for a raw stored string. */
export function classify(raw) {
  if (raw == null || raw === '') return 'none';
  let d;
  try { d = JSON.parse(raw); } catch { return 'corrupt'; }
  if (!d || typeof d !== 'object') return 'corrupt';
  const v = Number(d.v);
  if (!Number.isFinite(v) || v < VERSION) return 'older';
  if (v > VERSION) return 'corrupt';   // written by a newer build: not ours to read either
  for (const k of REQUIRED) if (!(k in d)) return 'corrupt';
  return 'ok';
}

/** Parse a stored string into a v6 record, or null (never throws). */
export function parse(raw) {
  if (classify(raw) !== 'ok') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** The newer of two records (by savedAt; a named save wins a tie, it is the deliberate one). */
export function newest(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  if (b.savedAt > a.savedAt) return b;
  if (a.savedAt > b.savedAt) return a;
  return a.kind === 'named' ? a : b;
}

/**
 * THE ONE DEATH RULE. The world and satchel of the newest record; Brea standing at the Brazier of her last rest
 * (from the newest record that names one), at full health; the hour is the one she died at (death is not a rest).
 */
export function deathRecord(named, checkpoint, { hour = null } = {}) {
  const base = newest(named, checkpoint);
  if (!base) return null;
  const out = JSON.parse(JSON.stringify(base));
  const lr = base.braziers?.lastRest ?? named?.braziers?.lastRest ?? checkpoint?.braziers?.lastRest ?? null;
  if (lr) {
    out.position = { ...out.position, x: lr.x, y: lr.y, z: lr.z, yaw: lr.yaw ?? out.position.yaw };
    out.braziers = { ...out.braziers, lastRest: { ...lr } };
  }
  out.vitals = { ...out.vitals, health: out.vitals.maxHealth };
  if (hour != null) out.hour = r3(hour);
  out.reason = 'death';
  return out;
}

/** Keys in `storage` that hold an older save (never cal.v6.*). Storage: { length, key(i), getItem(k) }. */
export function olderSaves(storage) {
  const out = [];
  if (!storage) return out;
  let n = 0;
  try { n = storage.length | 0; } catch { return out; }
  for (let i = 0; i < n; i++) {
    let k = null;
    try { k = storage.key(i); } catch { continue; }
    if (!k || !k.startsWith('cal.') || k.startsWith(`${KEY_PREFIX}.`)) continue;
    if (/^cal\.(binds|meta|settings|audio|ui)\b/.test(k)) continue;
    if (/^cal\.meta\.v\d+$/.test(k)) continue;
    let raw = null;
    try { raw = storage.getItem(k); } catch { continue; }
    const named = /^cal\.(save|checkpoint)\.v[0-5]$/.test(k) || /^cal\.(save|checkpoint)$/.test(k);
    if (named || (classify(raw) === 'older' && /save|checkpoint/.test(k))) out.push(k);
  }
  return out.sort();
}

/** A slot card's header (BIBLE 18 "Continue and save slots": place, hour, Order, hectares, the last rest). */
export function slotInfo(rec) {
  if (!rec) return null;
  return {
    slot: rec.slot, kind: rec.kind, savedAt: rec.savedAt, hour: rec.hour, place: rec.place,
    lastRest: rec.braziers?.lastRest?.id ?? null, triangles: rec.triangles.length,
    stage: rec.quest?.done ? 'done' : (rec.quest?.order?.at?.(-1)?.id ?? null),
  };
}

/** HH:MM from a decimal hour. */
export function hhmm(h) {
  const t = ((num(h) % 24) + 24) % 24;
  let hh = Math.floor(t), mm = Math.round((t - hh) * 60);
  if (mm === 60) { hh = (hh + 1) % 24; mm = 0; }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
