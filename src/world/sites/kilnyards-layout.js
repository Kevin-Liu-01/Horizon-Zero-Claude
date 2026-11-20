/**
 * THE KILN YARDS' LAYOUT AND THE WELLHEADS SEAM (Milestone 3 wave 1, area A; M3 briefs §3.2 "Wellheads", BIBLE §3.3:
 * "the Kiln Yards (ruined geothermal plant: two tiled cooling-tower stubs 22-28 m, 3-5 flue stacks, pipe racks, glowing
 * man-made wellheads)", BUILD M3.3: four wellheads). Owner: world. Everyone else only calls.
 *
 * Plain frozen data and a little state, importing only the island's site table: safe from any module, worker or node.
 * Frame: the bible's (E, N) in metres from the island's centre; the engine is x = E, z = -N (sites.js). Every record
 * carries both, so the bible stays greppable and the engine reads x, z.
 *
 * THE APRON. The Yards' site (219, -27) stands where the Malpais shelf breaks south at 33-37 deg, so the plant stands
 * on a bench cut into it: APRON, a 48 x 20 m level rectangle at 143 m whose long side follows the contour (bearing 85),
 * cut about 7 m into the shelf on its north side and filled about 7 m on its south (chosen in Node for the least
 * earthwork that keeps the site on it; tools/world/malpais-rows.mjs MP0 prints it). The island recipe levels it
 * (./malpais-ground.js); the towers and the stacks stand on the shelf's gentle ground north of the cut.
 *
 * THE WELLHEADS SEAM. Four records { id, e, n, x, z, state, plugged }: `state` 'hot' or 'quenched', `plugged` the kind
 * plugged in ('kiln') or null. Callers: instruments (a Kiln's plug and its hose: `kilnStand` is where its 5.0 x 3.4 m
 * body stands), combat (a Brine Pot within QUENCH_R quenches: `setQuenched`), systems (the quest; spawns end at four:
 * `allQuenched`), audio (`onWellheadChange`), save (`wellheadsSave`, the field systems registers).
 *
 *   WELLHEADS                 the four, frozen (positions only); wellheads() -> live records
 *   wellheadState(id)         { id, state, plugged } | null
 *   setQuenched(id)           hot -> quenched (once; a quenched wellhead never heats again in a save)
 *   plugIn(id, kind) / unplug(id)    a Kiln plugs into a hot wellhead only; quenching unplugs it
 *   hotWellheads() / quenchedCount() / allQuenched()
 *   nearestWellhead(x, z, maxR)      the nearest record within maxR (engine m), or null
 *   onWellheadChange(fn)      fn(id | null) on any change (null: a reset or a load); returns unsubscribe
 *   wellheadsSave()           { get, set } in the shape of src/game/save/fields.js: { [id]: { state, plugged } }
 *   resetWellheads()          a new game: four hot, nothing plugged
 *
 *   APRON, YARDS (towers, stacks, racks), BENCH_B5, YARDS_WALK (the walk grid's box for area C's kinds and the runner)
 *   yardsColliders(ground)    the static blockers, in collision.register's shape (box, capsule)
 *   apronUV(e, n) / apronPoint(u, v)   the apron's own frame (u along bearing 85, v across, + north)
 *
 * Bands marked * are starting values (M3 briefs §14), confirmed or replaced on the first Node run.
 */
import { siteById } from '../island/sites.js';
import { ISLAND_SCALE as S } from '../island/extent.js';

const D2R = Math.PI / 180;

/** The bench: centre (E, N), the long side's bearing, half-length and half-width (m), its level (m), the batter (m). */
export const APRON = Object.freeze({
  e: 200, n: -25, bearing: 85, halfLen: 24, halfWid: 10, h: 143.0, batter: 7,
});
const UE = Math.sin(APRON.bearing * D2R), UN = Math.cos(APRON.bearing * D2R);   // u: along the bench (E by N)
const VE = -UN, VN = UE;                                                          // v: across it, + toward the shelf (N)

/** (E, N) of the apron's point (u, v). */
export function apronPoint(u, v) { return { e: APRON.e + u * UE + v * VE, n: APRON.n + u * UN + v * VN }; }
/** (u, v) of an authored point in the apron's frame. */
export function apronUV(e, n, out = { u: 0, v: 0 }) {
  const de = e - APRON.e, dn = n - APRON.n;
  out.u = de * UE + dn * UN; out.v = de * VE + dn * VN;
  return out;
}
const rec = (id, p, extra = {}) => Object.freeze({ id, e: +p.e.toFixed(2), n: +p.n.toFixed(2), x: +(p.e * S).toFixed(2), z: +(-p.n * S).toFixed(2), ...extra });

/**
 * The yaw (rad) that turns a body's local +x onto the apron's u axis, in collision.register's box convention (local +x
 * goes to world (cos yaw, sin yaw) in x, z); a THREE object takes rotation.y = -yaw.
 */
export const APRON_YAW = Math.atan2(-UN, UE);   // the engine direction of u is (UE, -UN)

/** A Kiln's body (BIBLE §7.4 kind 10: 5.0 x 3.4 x 5.5 m), the room each wellhead keeps for one. */
export const KILN_FOOT = Object.freeze({ len: 5.0, wid: 3.4 });
/** Brine within this many metres of a wellhead quenches it (*; HT3, combat). */
export const QUENCH_R = 3;

/** The four wellheads (BUILD M3.3), 10 m apart on the bench's downhill half; each keeps a Kiln's room uphill of it. */
export const WELLHEADS = Object.freeze([-15, -5, 5, 15].map((u, i) => {
  const p = apronPoint(u, -3), k = apronPoint(u, 1.9);
  return rec(`wh-${i + 1}`, p, {
    r: 0.95, h: 1.6,
    // the Kiln's body: centre, half extents along u and v, its yaw (engine), the hose's run from the body to the head
    kilnStand: Object.freeze({ e: +k.e.toFixed(2), n: +k.n.toFixed(2), x: +(k.e * S).toFixed(2), z: +(-k.n * S).toFixed(2),
      halfLen: KILN_FOOT.len / 2, halfWid: KILN_FOOT.wid / 2, yaw: APRON_YAW, hose: 3.2 }),
  });
}));

/** Benchmark 5 (BIBLE §3.4 "the wellhead apron of the Kiln Yards", plan (226, -36)): snapped onto the bench's SE quarter. */
export const BENCH_B5 = rec('B5', apronPoint(21, -7), { plan: Object.freeze({ e: 226, n: -36 }) });

/**
 * The plant (BIBLE §3.3): two tiled tower stubs on the shelf's gentle ground north of the cut (7-21 deg), four brick
 * flue stacks in a row 8 m beyond the cut's crest, three pipe racks (the bench's manifold, and one to each tower).
 * Tower A stands 13.6 m off the T3-T4 sight ray (sites.js SIGHT_PAIRS), its foot's radius 11: the ray stays open.
 * r0 the stub's foot radius, r1 its broken top's, h its height over its foot; a stack's r and h; a rack's two ends.
 */
const stack = (u, r, h) => rec(`stack-${u}`, apronPoint(u, 18), { r, h });
export const YARDS = Object.freeze({
  towers: Object.freeze([
    rec('tower-a', { e: 210, n: 10 }, { r0: 11, r1: 7.6, h: 26 }),
    rec('tower-b', { e: 188, n: 16 }, { r0: 9.6, r1: 6.8, h: 22.5 }),
  ]),
  stacks: Object.freeze([stack(-4, 1.25, 29), stack(4, 1.05, 21), stack(12, 1.15, 25), stack(20, 0.95, 18)]),
  racks: Object.freeze([
    Object.freeze({ id: 'rack-manifold', a: rec('a', apronPoint(-18, 7)), b: rec('b', apronPoint(18, 7)) }),
    Object.freeze({ id: 'rack-b', a: rec('a', apronPoint(-8, 7)), b: rec('b', { e: 191, n: 5 }) }),
    Object.freeze({ id: 'rack-a', a: rec('a', apronPoint(12, 7)), b: rec('b', { e: 211, n: -2 }) }),
  ]),
  /** a rack's pipes run at 4.2-4.9 m on posts every RACK_POST m (*) */
  rackPost: 7, rackPipeY: 4.2, rackPostHalf: Object.freeze([0.18, 0.8]),
});

/** The site record (sites.js), for callers that want the Yards' name and stated height. */
export const SITE = siteById('kiln-yards');

/**
 * The walk grid's box for the Yards (nav.js WalkGrid; area C's Kilns, Spindle and Davit, the hour-two runner): the
 * bench, the shelf to the towers and the stacks, and the west approach along the 143 m contour.
 */
export const YARDS_WALK = Object.freeze({
  box: Object.freeze({ id: 'kiln-yards', x0: 160 * S, z0: -24 * S, x1: 240 * S, z1: 48 * S }),
  discs: Object.freeze([]),
  radius: 0.68,
});

/* ---------------------------------------------------------------- the static blockers */

/**
 * The Yards' colliders in collision.register's shape: each tower and stack a vertical capsule, each wellhead a capsule,
 * each rack post a yawed box. `ground(x, z)` is the drawn terrain (engine frame) at run time, the recipe in Node.
 * @param {(x: number, z: number) => number} ground
 * @returns {Array<{ kind: string, id: string, shape: object }>}
 */
export function yardsColliders(ground) {
  const out = [];
  const cap = (id, kind, x, z, r, h, sink = 0.6) => { const g = ground(x, z); out.push({ kind, id, shape: { type: 'capsule', a: [x, g - sink, z], b: [x, g + h, z], radius: r } }); };
  for (const t of YARDS.towers) cap(t.id, 'landmark', t.x, t.z, t.r0, t.h, 1.2);
  for (const s of YARDS.stacks) cap(s.id, 'landmark', s.x, s.z, s.r, s.h);
  for (const w of WELLHEADS) cap(w.id, 'prop', w.x, w.z, w.r, w.h, 0.1);
  for (const p of rackPosts()) {
    const g = ground(p.x, p.z);
    out.push({ kind: 'prop', id: p.id, shape: { type: 'box', c: [p.x, g + 2.2, p.z], half: [YARDS.rackPostHalf[0], 2.2, YARDS.rackPostHalf[1]], yaw: p.yaw } });
  }
  return out;
}

/** Every rack post: { id, x, z, yaw } (engine; yaw in the box convention above: local +x along the rack), a post every
 * YARDS.rackPost m along each rack, both ends included. */
export function rackPosts() {
  const out = [];
  for (const r of YARDS.racks) {
    const dx = r.b.x - r.a.x, dz = r.b.z - r.a.z, L = Math.hypot(dx, dz), n = Math.max(2, Math.round(L / YARDS.rackPost));
    const yaw = Math.atan2(dz, dx);
    for (let i = 0; i <= n; i++) out.push({ id: `${r.id}-${i}`, rack: r.id, x: r.a.x + dx * i / n, z: r.a.z + dz * i / n, yaw });
  }
  return out;
}

/* ---------------------------------------------------------------- the wellheads' state */

const _state = new Map(), _plug = new Map(), _fns = new Set();
function reset0() { for (const w of WELLHEADS) { _state.set(w.id, 'hot'); _plug.set(w.id, null); } }
reset0();
const tell = (id) => { for (const f of _fns) { try { f(id); } catch (e) { console.warn('[kiln-yards] a wellhead listener threw', e); } } };
const byId = Object.fromEntries(WELLHEADS.map((w) => [w.id, w]));

/** @param {string} id @returns {{ id: string, state: 'hot' | 'quenched', plugged: string | null } | null} */
export function wellheadState(id) { return byId[id] ? { id, state: _state.get(id), plugged: _plug.get(id) } : null; }

/** The four, live: { id, e, n, x, z, state, plugged, kilnStand }. */
export function wellheads() { return WELLHEADS.map((w) => ({ ...w, state: _state.get(w.id), plugged: _plug.get(w.id) })); }

/** Quench a hot wellhead (a Brine Pot within QUENCH_R): it stays quenched; anything plugged in is unplugged. */
export function setQuenched(id) {
  if (!byId[id] || _state.get(id) === 'quenched') return false;
  _state.set(id, 'quenched'); _plug.set(id, null); tell(id);
  return true;
}

/** A kind plugs its hose into a HOT wellhead with nothing in it. Returns whether it took. */
export function plugIn(id, kind = 'kiln') {
  if (!byId[id] || _state.get(id) !== 'hot' || _plug.get(id)) return false;
  _plug.set(id, kind); tell(id);
  return true;
}

/** Whatever is plugged in leaves. */
export function unplug(id) { if (byId[id] && _plug.get(id)) { _plug.set(id, null); tell(id); return true; } return false; }

export const hotWellheads = () => WELLHEADS.filter((w) => _state.get(w.id) === 'hot').map((w) => w.id);
export const quenchedCount = () => WELLHEADS.reduce((k, w) => k + (_state.get(w.id) === 'quenched' ? 1 : 0), 0);
export const allQuenched = () => quenchedCount() === WELLHEADS.length;

/** The nearest wellhead to an engine point within maxR (m), or null. */
export function nearestWellhead(x, z, maxR = Infinity) {
  let best = null, bd = maxR;
  for (const w of WELLHEADS) { const d = Math.hypot(w.x - x, w.z - z); if (d <= bd) { bd = d; best = w; } }
  return best ? { ...wellheadState(best.id), x: best.x, z: best.z, d: bd } : null;
}

/** Listen for any wellhead's change (id, or null for a reset or a load). @returns {() => void} unsubscribe */
export function onWellheadChange(fn) { _fns.add(fn); return () => _fns.delete(fn); }

/** A new game: four hot, nothing plugged. */
export function resetWellheads() { reset0(); tell(null); }

/**
 * The save's pair (src/game/save/fields.js shape): { [id]: { state, plugged } }. `set(null)` is a new game's wellheads.
 * A plugged kind is not carried (the Kilns re-plug from their own rules after a load); only the state is.
 */
export function wellheadsSave() {
  return {
    get: () => Object.fromEntries(WELLHEADS.map((w) => [w.id, { state: _state.get(w.id), plugged: _plug.get(w.id) }])),
    set: (v) => {
      reset0();
      if (v && typeof v === 'object') for (const w of WELLHEADS) { const r = v[w.id]; if (r && (r.state === 'hot' || r.state === 'quenched')) _state.set(w.id, r.state); }
      tell(null);
    },
  };
}
