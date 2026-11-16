/**
 * THE SITE CLOCK — rules (BUILD M1.6n; BIBLE §17 "Sites refill on a clock"). Pure: no DOM, no three, no ctx, so
 * node --test runs every clause (tools/gates/systems/site-clock.test.mjs). The live half that reads the world and
 * puts an Instrument back on its site is ./refill.js.
 *
 *   1. A cleared site stays clear for REFILL_HOURS (12) in-game hours on the site clock: hours played plus hours slept.
 *   2. Measuring kinds (Peg, Plumb, Tiller, Sonde) return in any region.
 *   3. Correcting kinds (Screed, Kiln, Sickle, Spindle, Davit) return only where the ground is still in error. A kind
 *      the bible names in neither list (the Gauge, the Dredge, the Transit, a legacy kind) is held to this rule too:
 *      nothing the bible does not say may return on true ground.
 *   4. Nothing returns within NEAR_M (80) metres of Brea,
 *   5. or inside her view (the camera's frustum, to its far plane, widened by VIEW_MARGIN_DEG).
 *   6. Nothing returns at a site inside true ground that a quest has emptied.
 *   7. What a quest spawned for itself is the quest's, not a site's (the slice's Peg swarms and the dyke Plumb): it
 *      never returns on the clock. The quest puts it back itself if a Continue lands on a stage that needs it
 *      (src/game/runtime.js restoreQuest), so after the quest it is gone for good.
 *
 * The clock is a number of hours that only goes forward. A record carries it (`serialize`), so a site cleared at
 * hour 3 of a run is still 9 hours from returning after a Continue.
 */
export const REFILL_HOURS = 12;
export const NEAR_M = 80;
export const VIEW_MARGIN_DEG = 6;
export const MEASURING = Object.freeze(['peg', 'plumb', 'tiller', 'sonde']);
export const CORRECTING = Object.freeze(['screed', 'kiln', 'sickle', 'spindle', 'davit']);

/** 'measuring' | 'correcting' | 'other' (an unlisted kind returns by the correcting rule). */
export function kindClass(kind) {
  const k = String(kind || '').toLowerCase();
  if (MEASURING.includes(k)) return 'measuring';
  if (CORRECTING.includes(k)) return 'correcting';
  return 'other';
}

/**
 * Is the world point inside the camera's view? cam: { x, y, z, dx, dy, dz (forward, any length), fov (vertical,
 * degrees), aspect, far }. The frustum is taken as the cone through its corners (half-angle from the vertical and
 * horizontal half-fovs) plus `margin` degrees, so a site at the frame's edge counts as seen. `lift` raises the
 * point to the middle of a standing Instrument.
 */
export function inView(cam, p, { margin = VIEW_MARGIN_DEG, lift = 1.2 } = {}) {
  if (!cam || !p) return false;
  const vx = p.x - cam.x, vy = (p.y ?? cam.y) + lift - cam.y, vz = p.z - cam.z;
  const d = Math.hypot(vx, vy, vz);
  if (d < 1e-6) return true;
  if (Number.isFinite(cam.far) && d > cam.far) return false;
  const fl = Math.hypot(cam.dx, cam.dy, cam.dz) || 1;
  const cos = (vx * cam.dx + vy * cam.dy + vz * cam.dz) / (d * fl);
  const tv = Math.tan(((cam.fov ?? 60) * Math.PI) / 360);
  const half = Math.atan(Math.hypot(tv, tv * (cam.aspect ?? 16 / 9))) + (margin * Math.PI) / 180;
  return cos >= Math.cos(Math.min(Math.PI, half));
}

/**
 * Is the ground at (x, z) still in error? `datum` is the live `ctx.datum` when world-ground publishes one
 * ({ inError(x, z) } or { trueAt(x, z) } or { regions() -> [{ id, x, z, r, true }], regionTrue(id) }). With no datum
 * the whole island is in error (BIBLE §10: everything built after the Datum counts as error until re-surveyed).
 */
export function errorAt(datum, x, z) {
  if (!datum) return true;
  if (typeof datum.inError === 'function') return !!datum.inError(x, z);
  if (typeof datum.trueAt === 'function') return !datum.trueAt(x, z);
  const regions = typeof datum.regions === 'function' ? datum.regions() : null;
  if (Array.isArray(regions)) {
    for (const r of regions) {
      if (!r) continue;
      const isTrue = !!r.true || !!datum.regionTrue?.(r.id);
      if (isTrue && Math.hypot(x - r.x, z - r.z) <= (r.r ?? 60)) return false;
    }
  }
  return true;
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const r3 = (v) => Math.round(num(v) * 1000) / 1000;

export class SiteClock {
  constructor({ refill = REFILL_HOURS, near = NEAR_M } = {}) {
    this.refill = refill;
    this.near = near;
    this.hours = 0;
    /** site id -> { id, kind, x, z, at (clock hour cleared), quest (the quest's own spawn), emptiedBy (quest id) } */
    this.cleared = new Map();
  }

  /** Hours played or slept. The clock never runs backwards; a non-finite or negative step is ignored. */
  advance(h) {
    const d = Number(h);
    if (Number.isFinite(d) && d > 0) this.hours += d;
    return this.hours;
  }

  /**
   * A site's Instrument is gone. site: { id, kind, x, z }. opts.quest: it was the quest's own spawn (clause 7);
   * opts.emptiedBy: the quest whose stage killed it (clause 6). Clearing an already-cleared site keeps its first hour.
   */
  clear(site, { at = this.hours, quest = false, emptiedBy = null } = {}) {
    if (!site || site.id == null) return null;
    const had = this.cleared.get(site.id);
    const e = {
      id: site.id, kind: String(site.kind ?? had?.kind ?? ''), x: num(site.x, had?.x), z: num(site.z, had?.z),
      at: had ? had.at : num(at, this.hours), quest: !!(quest || had?.quest), emptiedBy: emptiedBy ?? had?.emptiedBy ?? null,
    };
    this.cleared.set(site.id, e);
    return e;
  }

  get(id) { return this.cleared.get(id) ?? null; }
  /** The site is filled again (or no longer exists). */
  forget(id) { return this.cleared.delete(id); }

  /**
   * May the site's Instrument return now? world: { player: {x, z} | null, inView(x, z) -> bool, inError(x, z) -> bool }.
   * Returns { ok, why } with why one of: 'unknown', 'quest', 'quest-true', 'clock', 'true-ground', 'near', 'view', 'ok'.
   */
  verdict(id, world = {}) {
    const e = this.cleared.get(id);
    if (!e) return { ok: false, why: 'unknown' };
    if (e.quest) return { ok: false, why: 'quest' };
    const err = world.inError ? !!world.inError(e.x, e.z) : true;
    if (e.emptiedBy && !err) return { ok: false, why: 'quest-true' };
    if (this.hours < e.at + this.refill) return { ok: false, why: 'clock', left: r3(e.at + this.refill - this.hours) };
    if (kindClass(e.kind) !== 'measuring' && !err) return { ok: false, why: 'true-ground' };
    const p = world.player;
    if (p && Math.hypot(p.x - e.x, p.z - e.z) < this.near) return { ok: false, why: 'near' };
    if (world.inView && world.inView(e.x, e.z)) return { ok: false, why: 'view' };
    return { ok: true, why: 'ok' };
  }

  /** Every cleared site that may return now (ids). */
  due(world = {}) {
    const out = [];
    for (const id of this.cleared.keys()) if (this.verdict(id, world).ok) out.push(id);
    return out;
  }

  /** Plain JSON for a save record. */
  serialize() {
    const cleared = [...this.cleared.values()]
      .sort((a, b) => (a.id > b.id ? 1 : a.id < b.id ? -1 : 0))
      .map((e) => [e.id, e.kind, r3(e.x), r3(e.z), r3(e.at), e.quest ? 1 : 0, e.emptiedBy]);
    return { hours: r3(this.hours), cleared };
  }

  /** Put a record's clock back (a missing or malformed blob leaves a fresh clock at 0). */
  restore(o) {
    this.hours = 0;
    this.cleared.clear();
    if (!o || typeof o !== 'object') return this;
    this.hours = Math.max(0, num(o.hours));
    for (const row of Array.isArray(o.cleared) ? o.cleared : []) {
      if (!Array.isArray(row) || row[0] == null) continue;
      const [id, kind, x, z, at, quest, emptiedBy] = row;
      this.cleared.set(id, { id, kind: String(kind ?? ''), x: num(x), z: num(z), at: num(at), quest: !!quest, emptiedBy: emptiedBy ?? null });
    }
    return this;
  }
}
