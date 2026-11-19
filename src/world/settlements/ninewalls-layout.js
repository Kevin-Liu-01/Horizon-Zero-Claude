import { ISLAND_SCALE as S } from '../island/extent.js';
import { SCAR, siteById } from '../island/sites.js';

/**
 * THE NINE WALLS AND NINEWALLS' BLOCKOUT (M2 seam, owner: settlements; BUILD M2.2, BIBLE §8.4 "Ninewalls", §11.2
 * "The Scar"). Plain frozen data and pure maths, no three, so node, a worker or any lane can load it. Callers only
 * call:
 *   instruments  the Screed's stall and its cut (`segmentHitsWall`, `setWallCut`)
 *   systems      fail-soft writes `cut`; true ground clears `painted`; the save takes `wallsSave()` ({ get, set })
 *   world        the terrain under the walls (`WALLS`, `CENTRE`, `OUTER_R`)
 *   sight        the occluder list (`wallOccluders(ground)`, shapes in src/instruments/lib/sight.js's own form)
 *   people       the places (`PLACES`) and the dwellings (`DWELLINGS`), for routines (wave 3)
 *
 * Frame: engine x = E, z = -N (island/sites.js). A bearing is compass degrees (0 north, 90 east) about CENTRE; a
 * wall's arc runs clockwise from `from` to `to`. The walls are crescents whose backs face north-east (the trade wind
 * and the hill above), the village in their lee. They are counted from the outside in: wall-1 is the outermost, the
 * first a Screed coming down the Scar from the north-east meets; "the third wall" of the fail-soft is wall-3.
 *
 * The outer three stand wide enough for a 6.5 x 3.6 m Screed to stand between them and charge 25 m along a chord
 * (NW0, tools/build/settlements/ninewalls-rows.mjs); the inner six stand close, as the Holds build them. The old
 * Scar's cut runs past the south-east: the arcs of the outer walls end where its berm begins (`SCAR_CLEAR` off its
 * centreline), so the first Screed's work is on the skyline beside the village.
 *
 * Heights are above each wall's own foot: a wall follows the ground it stands on. A cut wall stands to the top of
 * its Datum Line.
 *
 * @typedef {'whole' | 'cut'} WallState
 * @typedef {object} Wall
 * @property {string} id         'wall-1' (the outermost, the first the Screed meets) .. 'wall-9' (the innermost)
 * @property {number} order      1..9, the order a Screed coming in from the north-east meets them
 * @property {{x: number, z: number}} c   the arc's centre (engine metres)
 * @property {number} r          the arc's radius to the wall's centreline (m)
 * @property {number} from       the arc's first bearing (deg)
 * @property {number} to         the arc's last bearing (deg), clockwise from `from`
 * @property {number} t          the wall's thickness (m)
 * @property {number} h          the wall's height above its foot, whole (m)
 * @property {number} lineH      the Datum Line's centre above the wall's foot (m); a cut wall stands to the line's top
 * @property {number} lineW      the Datum Line's height (m)
 * @property {boolean} painted0  the line is on this wall at a new game
 *
 * @typedef {Record<string, { state: WallState, painted: boolean }>} WallSave   what the save keeps, per wall id
 */

const D2R = Math.PI / 180;
const site = siteById('ninewalls');

/** The village's centre: the dragon tree (bible §8.4: Ninewalls at E -11, N -213, 71 m). */
export const CENTRE = Object.freeze({ x: site ? site.x : -11 * S, z: site ? site.z : 213 * S, h: site ? site.h : 71 });

/** Bearing b (deg) to a unit vector in the engine frame. */
export const dirOf = (b) => ({ x: Math.sin(b * D2R), z: -Math.cos(b * D2R) });
/** A point at bearing b, r metres from CENTRE (or from c). */
export function polar(b, r, c = CENTRE) { const d = dirOf(b); return { x: c.x + d.x * r, z: c.z + d.z * r }; }
/** The compass bearing (deg, 0..360) of a point from CENTRE (or from c). */
export function bearingOf(x, z, c = CENTRE) { const b = Math.atan2(x - c.x, -(z - c.z)) / D2R; return (b + 360) % 360; }

/** How far a wall keeps off the old Scar's centreline (m): half its 25 m, a 3 m berm, a metre of shoulder. */
export const SCAR_CLEAR = SCAR.width / 2 + 4;

/** Distance (m) of a point from the Scar's centreline (an infinite line through its two ends). */
export function scarDistance(x, z) {
  const ax = SCAR.a.x, az = SCAR.a.z, dx = SCAR.b.x - ax, dz = SCAR.b.z - az, L = Math.hypot(dx, dz);
  return Math.abs((x - ax) * dz - (z - az) * dx) / L;
}

/** The arcs' bearings before the Scar trims them: a crescent of 200 deg with its back to the north-east. */
export const ARC = Object.freeze({ facing: 45, from: -55, to: 145 });

/** Radii of the nine centrelines (m), outside in. The inner six 4.2 m apart; the outer three wide (NW0 (a)). */
const RADII = [67.2, 59.7, 52.0, 47.0, 42.8, 38.6, 34.4, 30.2, 26.0];
const THICK = 0.9, HEIGHT = 2.4, LINE_H = 1.15, LINE_W = 0.25;
/** The walls the second Plumb has painted by the time she reaches Ninewalls (F34: the line on three or more). */
const PAINTED0 = new Set([1, 2, 3, 4]);

/** The last bearing (deg) of an arc of radius r that keeps SCAR_CLEAR off the Scar (searched at 0.1 deg). */
function trimmed(r, from, to) {
  let b = to;
  const ok = (bb) => { const p = polar(bb, r); return scarDistance(p.x, p.z) >= SCAR_CLEAR + THICK / 2; };
  while (b > from && !ok(b)) b -= 0.1;
  let a = from;
  while (a < b && !ok(a)) a += 0.1;
  return [Math.round(a * 10) / 10, Math.round(b * 10) / 10];
}

/** @type {ReadonlyArray<Wall>} */
export const WALLS = Object.freeze(RADII.map((r, i) => {
  const [from, to] = trimmed(r * S, ARC.from, ARC.to);
  return Object.freeze({
    id: `wall-${i + 1}`, order: i + 1, c: Object.freeze({ x: CENTRE.x, z: CENTRE.z }), r: r * S, from, to,
    t: THICK, h: HEIGHT, lineH: LINE_H, lineW: LINE_W, painted0: PAINTED0.has(i + 1),
  });
}));

/** The outermost wall's outer face from the centre (m): what the terrain must give room for. */
export const OUTER_R = WALLS[0].r + THICK / 2;

/** @param {string} id @returns {Wall | null} */
export function wallById(id) { return WALLS.find((w) => w.id === id) || null; }

/** The wall's top above its foot in a state. */
export const topOf = (w, state = 'whole') => (state === 'cut' ? w.lineH + w.lineW / 2 : w.h);

/* ---------------------------------------------------------------- state */

const _state = new Map(), _painted = new Map(), _fns = new Set();
function reset0() { for (const w of WALLS) { _state.set(w.id, 'whole'); _painted.set(w.id, w.painted0); } }
reset0();
const tell = (id) => { for (const f of _fns) { try { f(id); } catch (e) { console.warn('[ninewalls] a wall listener threw', e); } } };

/** @param {string} id @returns {{ state: WallState, painted: boolean } | null} */
export function wallState(id) { return _state.has(id) ? { state: _state.get(id), painted: _painted.get(id) } : null; }

/** @param {string} id */
export function setWallCut(id) { if (_state.has(id) && _state.get(id) !== 'cut') { _state.set(id, 'cut'); tell(id); } }

/** @param {string} id @param {boolean} on */
export function setPainted(id, on) { if (_painted.has(id) && _painted.get(id) !== !!on) { _painted.set(id, !!on); tell(id); } }

/** A new game: every wall whole, the line where the Plumb put it. */
export function resetWalls() { reset0(); tell(null); }

/** Listen for any wall's state change (id, or null for a reset or a load). @param {(id: string | null) => void} fn @returns {() => void} unsubscribe */
export function onWallChange(fn) { _fns.add(fn); return () => _fns.delete(fn); }

/**
 * The save's pair, in the shape src/game/save/fields.js declares for 'walls': { [wallId]: { state, painted } }.
 * `set(null)` (a record without the field: a slice save carried forward, Q5) is a new game's walls.
 * @returns {{ get: () => WallSave, set: (v: WallSave | null) => void }}
 */
export function wallsSave() {
  return {
    get: () => Object.fromEntries(WALLS.map((w) => [w.id, { state: _state.get(w.id), painted: _painted.get(w.id) }])),
    set: (v) => {
      reset0();
      if (v && typeof v === 'object') {
        for (const w of WALLS) {
          const r = v[w.id];
          if (!r) continue;
          if (r.state === 'cut' || r.state === 'whole') _state.set(w.id, r.state);
          if (typeof r.painted === 'boolean') _painted.set(w.id, r.painted);
        }
      }
      tell(null);
    },
  };
}

/* ---------------------------------------------------------------- geometry */

/** Is bearing b (deg) inside the wall's span, padded by `padDeg`? */
export function inSpan(w, b, padDeg = 0) {
  let x = b - (w.from - padDeg);
  x -= Math.floor(x / 360) * 360;
  return x <= (w.to - w.from) + 2 * padDeg + 1e-9;
}

/** Stations along a wall's centreline at most `step` m apart: [{ b, x, z }], both ends included. */
export function stations(w, step = 1.25) {
  const span = w.to - w.from, n = Math.max(1, Math.ceil((span * D2R * w.r) / step)), out = [];
  for (let i = 0; i <= n; i++) { const b = w.from + span * i / n; const p = polar(b, w.r, w.c); out.push({ b, x: p.x, z: p.z }); }
  return out;
}

/** The wall's tangent (the direction of increasing bearing) at bearing b: three's rotation.y of a box laid along it is -b. */
export const tangentOf = (b) => ({ x: Math.cos(b * D2R), z: Math.sin(b * D2R) });

/**
 * The wall as yaw boxes along its centreline, each at most `step` m long, its foot at the lowest ground under it less
 * `sink`, its top at the centre's ground plus the wall's top in its state. `ry` is three's rotation.y (local +x along
 * the wall, local +z toward the centre); the collision world takes yaw = -ry, sight.js's box takes yaw = ry.
 * @returns {Array<{ id: string, x: number, z: number, y0: number, y1: number, len: number, ry: number, b: number }>}
 */
export function wallBoxes(w, ground, { step = 2.5, sink = 0.3, state = null } = {}) {
  const st = stations(w, step), top = topOf(w, state || _state.get(w.id) || 'whole'), out = [];
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i], c = st[i + 1], b = (a.b + c.b) / 2, m = polar(b, w.r, w.c);
    const len = Math.hypot(c.x - a.x, c.z - a.z) + 0.02;
    const g = Math.min(ground(a.x, a.z), ground(c.x, c.z), ground(m.x, m.z));
    out.push({ id: w.id, x: m.x, z: m.z, y0: g - sink, y1: ground(m.x, m.z) + top, len, ry: -b * D2R, b });
  }
  return out;
}

/**
 * The first wall a straight move from a to b strikes, for a body of half-width `pad` (m): the Screed's charge. Each
 * wall is an annular band (its thickness plus `pad` each side) over its span, with round ends. Cut walls do not stop
 * a charge unless `includeCut`.
 * @returns {{ id: string, t: number, x: number, z: number } | null}
 */
export function segmentHitsWall(ax, az, bx, bz, pad = 0, { includeCut = false } = {}) {
  const dx = bx - ax, dz = bz - az;
  let best = null;
  for (const w of WALLS) {
    if (!includeCut && _state.get(w.id) === 'cut') continue;
    const rIn = w.r - w.t / 2 - pad, rOut = w.r + w.t / 2 + pad, capR = w.t / 2 + pad;
    const ends = [polar(w.from, w.r, w.c), polar(w.to, w.r, w.c)];
    const inside = (t) => {
      const x = ax + dx * t, z = az + dz * t, rr = Math.hypot(x - w.c.x, z - w.c.z);
      if (rr >= rIn && rr <= rOut && inSpan(w, bearingOf(x, z, w.c))) return true;
      return ends.some((e) => Math.hypot(x - e.x, z - e.z) <= capR);
    };
    const cands = [0];
    const circ = (cx, cz, r) => {
      const ox = ax - cx, oz = az - cz, A = dx * dx + dz * dz, B = 2 * (ox * dx + oz * dz), C = ox * ox + oz * oz - r * r;
      if (A < 1e-12) return;
      const disc = B * B - 4 * A * C;
      if (disc < 0) return;
      const q = Math.sqrt(disc);
      cands.push((-B - q) / (2 * A), (-B + q) / (2 * A));
    };
    circ(w.c.x, w.c.z, rIn); circ(w.c.x, w.c.z, rOut);
    for (const e of ends) circ(e.x, e.z, capR);
    let tHit = null;
    for (const t of cands.filter((t) => t >= 0 && t <= 1).sort((p, q) => p - q)) {
      if (inside(Math.min(1, t + 1e-6))) { tHit = t; break; }
    }
    if (tHit != null && (!best || tHit < best.t)) best = { id: w.id, t: tHit, x: ax + dx * tHit, z: az + dz * tHit };
  }
  return best;
}

/**
 * The nine walls as sight occluders in src/instruments/lib/sight.js's 'arc' form, one piece wherever the ground under
 * the wall changes by `maxRise` m or less; a piece spans its lowest foot to its lowest top, so it never blocks above
 * the wall. Slots are 'ninewalls:wall-3:2'. `a0, a1` are radians of atan2(dx, dz) about the centre (sight.js's own
 * angle; a compass bearing b is pi - b).
 * @returns {Array<{ slot: string, id: string, shape: { type: 'arc', cx: number, cz: number, r: number, thick: number, a0: number, a1: number, y0: number, y1: number } }>}
 */
export function wallOccluders(ground, { maxRise = 0.5, step = 1.0 } = {}) {
  const out = [];
  for (const w of WALLS) {
    const st = stations(w, step), top = topOf(w, _state.get(w.id));
    const gs = st.map((s) => ground(s.x, s.z));
    let i0 = 0, k = 0;
    while (i0 < st.length - 1) {
      let lo = gs[i0], hi = gs[i0], i1 = i0 + 1;
      while (i1 < st.length) {
        const l2 = Math.min(lo, gs[i1]), h2 = Math.max(hi, gs[i1]);
        if (h2 - l2 > maxRise && i1 > i0 + 1) break;
        lo = l2; hi = h2; i1++;
      }
      i1 = Math.min(i1, st.length) - 1;
      const b0 = st[i0].b, b1 = st[i1].b;
      out.push({ slot: `ninewalls:${w.id}:${k++}`, id: w.id, shape: {
        type: 'arc', cx: w.c.x, cz: w.c.z, r: w.r, thick: w.t, a0: Math.PI - b1 * D2R, a1: Math.PI - b0 * D2R, y0: lo - 0.3, y1: lo + top,
      } });
      i0 = i1;
    }
  }
  return out;
}

/* ---------------------------------------------------------------- the village */

/**
 * The dwellings (about 16, bible §8.4), sunk into the lapilli inside the innermost wall, their fronts to the tree.
 * Record: id, bearing b and radius r from CENTRE, footprint w (across the front) x d, h the roof's top above the
 * ground at its centre, sink the floor below it. No two neighbours in a ring share a roof height (NW4).
 */
const D = (id, b, r, w, d, h, sink = 1.1) => Object.freeze({ id, b, r: r * S, w, d, h, sink });
export const DWELLINGS = Object.freeze([
  // the inner ring, round the tree; the lane to the tube mouth (north-east) and the cistern (south-west) left open
  D('d1', 102, 11.5, 6.0, 4.8, 1.75), D('d2', 150, 11.5, 6.4, 5.0, 1.45), D('d3', 292, 11.5, 5.6, 4.6, 1.85),
  D('d4', 338, 11.5, 6.2, 5.0, 1.55), D('d5', 22, 12.0, 5.8, 4.6, 1.95),
  // the outer ring, inside the innermost wall
  D('d6', 95, 19.0, 6.6, 5.2, 1.6), D('d7', 119, 19.0, 6.0, 5.0, 2.0), D('d8', 143, 19.0, 6.8, 5.4, 1.5),
  D('d9', 167, 19.0, 6.2, 5.0, 1.85), D('d10', 191, 19.0, 5.8, 4.8, 1.55),
  D('d11', 266, 19.0, 6.4, 5.2, 1.9), D('d12', 290, 19.0, 6.0, 5.0, 1.45), D('d13', 314, 19.0, 6.6, 5.2, 1.8),
  D('d14', 338, 19.0, 6.0, 4.8, 1.5), D('d15', 2, 19.0, 6.4, 5.0, 2.05), D('d16', 26, 19.5, 5.8, 4.8, 1.65),
]);

/** A dwelling's world placement: centre, three's rotation.y (local +z, its front, toward the tree). */
export function dwellingPlace(d) {
  const p = polar(d.b, d.r);
  return { x: p.x, z: p.z, ry: Math.atan2(CENTRE.x - p.x, CENTRE.z - p.z) };
}

/**
 * The places the quests and the people need (NW4). The tube mouth, the hall and the forge in the lava tube that runs
 * to the Jameo (island/sites.js TUBES 'ninewalls-jameo'); the counter at its mouth; the cistern and its Brazier
 * (`brazier-spots.js` takes the spot); the salt cache in a niche on the third wall's inner face; the dragon tree.
 */
export const PLACES = Object.freeze({
  tree: Object.freeze({ ...polar(0, 0), trunkR: 0.5, crown: 4.6, top: 7.4, canopyR: 3.6 }),
  tubeMouth: Object.freeze({ ...polar(62, 22.0), b: 62, w: 5.2, h: 3.0, depth: 3.0 }),
  counter: Object.freeze({ ...polar(50, 18.6), b: 50, w: 2.8, d: 0.8, h: 1.05 }),
  cistern: Object.freeze({ ...polar(218, 8.5), r: 2.2, h: 0.7 }),
  brazier: Object.freeze({ ...polar(218, 11.4), b: 218 }),
  niche: Object.freeze({ wall: 'wall-3', b: 104, ...polar(104, RADII[2] * S - THICK / 2 - 0.35), w: 1.2, h: 0.9, sill: 0.5 }),
});

/** The roofs whose neighbour in the same ring stands at the same height (within 0.05 m): none, by NW4. */
export function rooflineCheck() {
  const rings = new Map();
  for (const d of DWELLINGS) { const k = Math.round(d.r); if (!rings.has(k)) rings.set(k, []); rings.get(k).push(d); }
  const same = [];
  for (const list of rings.values()) {
    const s = list.slice().sort((a, b) => a.b - b.b);
    for (let i = 0; i < s.length; i++) {
      const a = s[i], b = s[(i + 1) % s.length];
      if (a !== b && Math.abs(a.h - b.h) < 0.05) same.push([a.id, b.id]);
    }
  }
  return same;
}

/**
 * Colliders as the collision world takes them (src/core/collision.js register): a yaw box per wall segment, a box per
 * dwelling, the counter, the tube mouth's jambs, capsules for the trunk and the cistern's kerb.
 */
export function ninewallsColliders(ground) {
  const out = [];
  for (const w of WALLS) for (const s of wallBoxes(w, ground)) {
    out.push({ kind: 'landmark', wall: w.id, shape: { type: 'box', c: [s.x, (s.y0 + s.y1) / 2, s.z], half: [s.len / 2, (s.y1 - s.y0) / 2, w.t / 2], yaw: -s.ry } });
  }
  for (const d of DWELLINGS) {
    const p = dwellingPlace(d), g = ground(p.x, p.z), y0 = g - d.sink, y1 = g + d.h;
    out.push({ kind: 'landmark', shape: { type: 'box', c: [p.x, (y0 + y1) / 2, p.z], half: [d.w / 2, (y1 - y0) / 2, d.d / 2], yaw: -p.ry } });
  }
  const T = PLACES.tree, gt = ground(T.x, T.z);
  out.push({ kind: 'prop', shape: { type: 'capsule', a: [T.x, gt, T.z], b: [T.x, gt + T.crown, T.z], radius: T.trunkR } });
  const K = PLACES.counter, gk = ground(K.x, K.z), kry = -K.b * D2R;
  out.push({ kind: 'prop', shape: { type: 'box', c: [K.x, gk + K.h / 2, K.z], half: [K.w / 2, K.h / 2, K.d / 2], yaw: -kry } });
  const C = PLACES.cistern, gc = ground(C.x, C.z);
  out.push({ kind: 'prop', shape: { type: 'capsule', a: [C.x, gc - 0.3, C.z], b: [C.x, gc + C.h, C.z], radius: C.r } });
  const M = PLACES.tubeMouth, tg = tangentOf(M.b);
  for (const s of [-1, 1]) {
    const x = M.x + tg.x * s * (M.w / 2 + 0.4), z = M.z + tg.z * s * (M.w / 2 + 0.4), g = ground(x, z);
    out.push({ kind: 'landmark', shape: { type: 'box', c: [x, g + M.h / 2, z], half: [0.4, M.h / 2 + 0.3, M.depth / 2], yaw: M.b * D2R } });
  }
  return out;
}
