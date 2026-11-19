import { Routines } from './routines.js';
import { Lookout } from './lookout.js';
import {
  CENTRE, OUTER_R, PLACES, DWELLINGS, WALLS, polar, dirOf, tangentOf, dwellingPlace,
} from '../../settlements/ninewalls-layout.js';

/**
 * CALIMA · THE HOLDS PEOPLE AT NINEWALLS (M2 wave 3, area B; BUILD M2.7, M2.13; briefs §5 NW7-NW9). `ctx.people.holds`.
 *
 * THE CAST (NW7): Tube Smith Oro, three Pit Farmers, two Tiller-Followers (young farmhands: the adolescent build is cut, bible
 * §8.9's fallback), two Cochineal Pickers, each their own GLB (tools/build/recipes/npc/lib/archetypes.mjs HOLDS_CAST), no two
 * faces alike, all on the Holds' one outfit atlas. They stand in the world only while she is near the village: spawned when
 * she comes within SPAWN_R of its centre (one person a beat, so no frame takes two GLB clones), despawned past DESPAWN_R
 * (their archetypes released with them). Never in a ?shot film (a frame stages its own: tools/frames/stagings/settlements.mjs).
 *
 * THE ROUTINES (NW8, the M1.5d log rows at Ninewalls): the Saltrow routines' engine (./routines.js) on a walk grid of its own
 * over the village and the herd's slope to the west (NINEWALLS_WALK, the island bake's heights and the village's colliders:
 * the nine walls, the dwellings, the trunk, the counter, the cistern, the tube mouth's jambs; the Brazier's plinth as a
 * disc). Each loop is a list of { act, at, face, clip, dur } at real places:
 *   Oro          at the forge in the tube mouth: hammers at the anvil, quenches at the trough, sorts the bronze bars, a word
 *                over the counter. He never leaves the forecourt: the quest finds him at ORO_ANCHOR.
 *   farmers      sow, water and harvest the plots on the terraces between the inner walls; draw water at the cistern; a drink;
 *                a word under the tree
 *   followers    with no herd near: fill the seed bag at a door, sow a plot, lean on the innermost wall; with a herd on the
 *                slope (a living Tiller within HERD_R): THEY TRAIL IT, 6-12 m* behind its last hull (TRAIL), sowing and
 *                gathering in its furrow, jogging to catch up when it pulls away
 *   pickers      pick at the terrace ends where the walls stop (the cactus beds), carry to the counter, sort at a door
 * Two in-game hours at Ninewalls: each person changes activity 3 or more times; nobody stands still over 90 s outside a work
 * clip; 0 legs through collision; never the bind pose (tools/build/recipes/npc/holds-routines.test.mjs).
 *
 * UNDER ATTACK (NW9): while a Screed is within ALARM_R of the centre (it walks in at 1.4 m/s, so the people have about 40 s
 * before it is at the outer wall) everyone drops their work and goes to the shelter spot farthest from its THREAT LINES: the
 * line it would charge along on its heading and, while she is within SHELTER.reach of it, the line to her (a wind-up turns it
 * onto her), both from its centre. The
 * spots are the dwellings' doors and the tube mouth's throat, all well inside the walls a charge stalls on. Each second the
 * choice is checked; a person whose spot comes within SHELTER.keep of a threat line moves to a better one. People have no
 * hit table: nobody dies. When no Screed has been within ALARM_R for SHELTER.calm seconds, everyone goes back to work.
 *
 * THE LOOKOUT RULE IN THE HOLDS (BUILD M1.5d's row at Ninewalls: the warning within 3 s at 80 m): every one of them watches;
 * an Instrument is measured from the nearest; that one stops, turns to it and calls; the herd is never called (./lookout.js).
 *
 * ORO'S DIALOGUE STAGING: while a scene's card names 'oro' (the presenter's card, systems'), the people system holds him
 * (index.js `_beat`): he stops, turns to face her (`faceToTalk`) and talks, his face looking at hers (faces.js); when the
 * card closes his loop goes on from its next step.
 */
/** The Holds' cast, as the build's HOLDS_CAST (the game cannot import the build). */
export const HOLDS_CAST = Object.freeze(['oro', 'pit-farmer', 'pit-farmer-2', 'pit-farmer-3', 'tiller-follower', 'tiller-follower-2', 'cochineal-picker', 'cochineal-picker-2']);
/** Spawned within SPAWN_R of the village's centre (m; T1 stands 227 m off, Saltrow 256 m: neither brings them in), gone past DESPAWN_R. */
export const SPAWN_R = 180, DESPAWN_R = 300;
/** A Screed this near the centre sends everyone to shelter (m); the bar (NW9): nobody within 10 m of its charge line. */
export const ALARM_R = OUTER_R + 60;
export const SHELTER = Object.freeze({ keep: 12, better: 6, calm: 8, recheck: 1, line: 28.5, reach: 35 });
/** A herd is near when a living Tiller is within HERD_R of the centre; the youths keep TRAIL.at m behind its last hull. */
export const HERD_R = 160;
export const TRAIL = Object.freeze({ at: 7, band: [6, 12], jogOver: 3, recheck: 0.5, moveM: 2.0 });

/**
 * The people's walk grid over Ninewalls and the herd's slope to its west (HERD_SLOPE, area A's blockout: bible E -140..-65,
 * N -205..-145): 216 x 156 m, ~33 ms to build once in Node. The Brazier's plinth has no collider: a disc.
 */
export const NINEWALLS_WALK = Object.freeze({
  box: Object.freeze({ id: 'ninewalls', x0: CENTRE.x - 142, z0: CENTRE.z - 82, x1: CENTRE.x + 74, z1: CENTRE.z + 74 }),
  discs: Object.freeze([Object.freeze({ x: PLACES.brazier.x, z: PLACES.brazier.z, r: 0.9 })]),
  // the walker's radius on this grid: a path is marched against the NEAREST cell, up to half a cell's diagonal (0.354 m) from
  // the point marched, so a 0.32 m margin let a leg pass 0.22 m from a wall's end or a house's corner (the first Node log:
  // 7 of 128 legs); 0.32 + 0.354 keeps every point of every leg 0.32 m or more off every collider
  radius: 0.68,
});

/** A point in the tube mouth's frame: u along its face, v away from the centre (into the hill). */
function mouth(u, v) {
  const M = PLACES.tubeMouth, tg = tangentOf(M.b), out = dirOf(M.b);
  return { x: M.x + tg.x * u + out.x * v, z: M.z + tg.z * u + out.z * v };
}
/** A dwelling's door step: its front (toward the tree, turned by its twist), `out` m in front of the wall. */
function doorOf(id, out = 1.15) {
  const d = DWELLINGS.find((q) => q.id === id), p = dwellingPlace(d);
  return { x: p.x + Math.sin(p.ry) * (d.d / 2 + out), z: p.z + Math.cos(p.ry) * (d.d / 2 + out), house: { x: p.x, z: p.z } };
}
/** On the terrace inside wall `id` (between it and the next wall in), at bearing b, `k` of the way in from its low face. */
function terrace(id, b, k = 0.5) {
  const i = WALLS.findIndex((w) => w.id === id), w = WALLS[i], inner = WALLS[i + 1];
  const r0 = w.r - w.t / 2, r1 = inner ? inner.r + inner.t / 2 : r0 - 6;
  return polar(b, r0 - (r0 - r1) * k);
}
const toward = (p, q, d) => { const L = Math.hypot(q.x - p.x, q.z - p.z) || 1; return { x: p.x + (q.x - p.x) / L * d, z: p.z + (q.z - p.z) / L * d }; };

/** The places the loops use (engine x, z). Pure: no world, so the Node log and the game read the same points. */
export function holdsPlaces() {
  const T = PLACES.tree, Cq = PLACES.cistern;
  return {
    // the forge (ninewalls-kit.js tubeMouth: the anvil at u 0.52 v -2.2, the trough at u 3.5 v -1.4, the bars at u -1.66 v -0.8)
    anvil: mouth(0.52, -2.2), oroAnvil: mouth(0.52, -3.15), trough: mouth(3.5, -1.4), oroTrough: mouth(3.5, -2.45),
    bars: mouth(-1.66, -0.8), oroBars: mouth(-1.66, -1.85), throat: mouth(0, 1.2),
    counter: polar(57, 16.6), counterFront: polar(57, 15.1), counterBack: polar(57, 17.9),
    // the cistern's rim on its open side (its frame on the 0.6 rad axis, the Brazier's plinth to the south-west) and the tree's foot
    cistern: { x: Cq.x, z: Cq.z }, cisternE: toward(Cq, polar(150, 6), Cq.r + 0.85),
    tree: { x: T.x, z: T.z }, treeSW: toward(T, polar(215, 6), T.trunkR + 1.3), treeS: toward(T, polar(175, 6), T.trunkR + 1.4),
    treeE: toward(T, polar(95, 6), T.trunkR + 1.3),
    // the plots: inside the innermost wall east of the tree, on the terraces of the next two where the arcs run on to 145 deg,
    // and the yard west of the tree between the houses (dug with the same ash)
    plotA: terrace('wall-9', 120, 0.55), plotB: terrace('wall-8', 132, 0.55), plotD: terrace('wall-9', 100, 0.55),
    plotE: terrace('wall-8', 108, 0.55), yardW: polar(272, 14.5), yardW2: polar(262, 12.2),
    // the cactus beds at the terraces' ends where the walls stop (bearing 145 and past)
    bedA: polar(150, 36.5), bedC: polar(156, 32),
    // the doors (shelter, the seed bags, the sorting)
    doors: Object.fromEntries(DWELLINGS.map((d) => [d.id, doorOf(d.id)])),
    // the innermost wall's low face, where a youth leans (Idle_Rail_Loop) looking out over the village
    railB: polar(100, 26 - 1.6),
  };
}

/** The anvil spot: where the quest finds Oro (systems' 'oro' anchor). */
export const ORO_ANCHOR = Object.freeze(holdsPlaces().oroAnvil);

/**
 * The loops. dur [lo, hi] s. Ninewalls' midday clock runs two game hours in about 168 s of play and people walk at their clip's
 * 0.65-0.75 m/s, so each loop keeps to one quarter of the village (no leg over about 25 m on the walk grid) and every step is short.
 */
function holdsLoops(P) {
  const D = P.doors;
  return {
    oro: { day: [
      { act: 'hammer', at: P.oroAnvil, face: P.anvil, clip: 'TreeChopping_Loop', dur: [22, 32] },
      { act: 'quench', at: P.oroTrough, face: P.trough, clip: 'PickUp_Table', dur: [5, 7] },
      { act: 'hammer', at: P.oroAnvil, face: P.anvil, clip: 'TreeChopping_Loop', dur: [18, 26] },
      { act: 'sort', at: P.oroBars, face: P.bars, clip: 'Chest_Open', dur: [6, 9] },
      { act: 'talk', at: P.counterBack, face: P.counterFront, clip: 'Idle_Talking_Loop', dur: [10, 14] },
    ] },
    // the east plots inside the innermost wall
    'pit-farmer': { day: [
      { act: 'sow', at: P.plotA, face: polar(120, 0), clip: 'Farm_PlantSeed', dur: [14, 20] },
      { act: 'harvest', at: P.plotD, face: polar(100, 0), clip: 'Farm_Harvest', dur: [14, 20] },
      { act: 'fetch', at: D.d8, face: D.d8.house, clip: 'PickUp_Table', dur: [5, 7] },
      { act: 'water', at: P.plotA, face: polar(120, 0), clip: 'Farm_Watering', dur: [12, 16] },
    ] },
    // the south-east terrace inside the eighth wall
    'pit-farmer-2': { day: [
      { act: 'harvest', at: P.plotB, face: polar(132, 0), clip: 'Farm_Harvest', dur: [14, 20] },
      { act: 'sow', at: P.plotE, face: polar(108, 0), clip: 'Farm_PlantSeed', dur: [14, 20] },
      { act: 'water', at: P.plotB, face: polar(132, 0), clip: 'Farm_Watering', dur: [12, 16] },
      { act: 'fetch', at: D.d8, face: D.d8.house, clip: 'PickUp_Table', dur: [5, 7] },
    ] },
    // the cistern and the yard west of the tree
    'pit-farmer-3': { day: [
      { act: 'draw', at: P.cisternE, face: P.cistern, clip: 'PickUp_Table', dur: [5, 7] },
      { act: 'water', at: P.yardW, face: polar(272, 30), clip: 'Farm_Watering', dur: [12, 16] },
      { act: 'talk', at: P.treeS, face: P.treeSW, clip: 'Idle_Talking_Loop', dur: [8, 12] },
      { act: 'harvest', at: P.yardW2, face: polar(262, 30), clip: 'Farm_Harvest', dur: [12, 18] },
    ] },
    'tiller-follower': { trail: true, day: [
      { act: 'fill', at: D.d8, face: D.d8.house, clip: 'PickUp_Table', dur: [5, 7] },
      { act: 'sow', at: P.plotD, face: polar(100, 0), clip: 'Farm_PlantSeed', dur: [12, 18] },
      { act: 'lean', at: P.railB, face: polar(100, 0), clip: 'Idle_Rail_Loop', dur: [8, 12] },
      { act: 'sow', at: P.plotA, face: polar(120, 0), clip: 'Farm_PlantSeed', dur: [12, 18] },
    ] },
    'tiller-follower-2': { trail: true, day: [
      { act: 'fill', at: D.d9, face: D.d9.house, clip: 'PickUp_Table', dur: [5, 7] },
      { act: 'lean', at: P.cisternE, face: P.cistern, clip: 'Idle_Rail_Loop', dur: [8, 12] },
      { act: 'talk', at: P.treeSW, face: P.treeS, clip: 'Idle_Talking_Loop', dur: [8, 12] },
      { act: 'sow', at: P.yardW2, face: polar(262, 30), clip: 'Farm_PlantSeed', dur: [12, 16] },
    ] },
    // the cactus beds south-east, the cochineal taken to the house by the plots
    'cochineal-picker': { day: [
      { act: 'pick', at: P.bedA, face: polar(150, 60), clip: 'PickUp_Table', dur: [12, 18] },
      { act: 'scrape', at: P.bedC, face: polar(156, 60), clip: 'Interact', dur: [10, 14] },
      { act: 'carry', at: D.d8, face: D.d8.house, clip: 'PickUp_Table', dur: [5, 7] },
    ] },
    // the dye house work in the core: sorting at a door, the counter, a word under the tree
    'cochineal-picker-2': { day: [
      { act: 'sort', at: D.d7, face: D.d7.house, clip: 'Interact', dur: [10, 14] },
      { act: 'carry', at: P.counterFront, face: P.counterBack, clip: 'PickUp_Table', dur: [5, 7] },
      { act: 'sort', at: D.d6, face: D.d6.house, clip: 'Interact', dur: [10, 14] },
      { act: 'talk', at: P.treeE, face: P.treeS, clip: 'Idle_Talking_Loop', dur: [8, 12] },
    ] },
  };
}

/**
 * F36's street at work (the lens 15 m south-south-west of the tree, looking on bearing 20): five of the cast at work in that
 * lens, from 8.5 m (the cistern) to 21 m (the door of d5 past the tree).
 */
export const AT_WORK = Object.freeze([
  // (the first film at c5e75eb: four of five in the lens, all four upright, so the street read as people standing about; Oro at
  // the anvil is behind the slope from this lens) each now in a clip that bends to its work, at the clip's deepest point
  { id: 'pit-farmer-3', place: 'cisternE', face: 'cistern', clip: 'PickUp_Table', offset: 0.5 },
  { id: 'cochineal-picker', place: 'treeSW', face: 'tree', clip: 'Farm_Harvest', offset: 0.45 },
  { id: 'tiller-follower-2', place: 'door:d2', face: 'house:d2', clip: 'Farm_PlantSeed', offset: 0.5 },
  { id: 'cochineal-picker-2', place: 'door:d1', face: 'house:d1', clip: 'Fixing_Kneeling', offset: 0.4 },
  { id: 'pit-farmer-2', place: 'door:d5', face: 'house:d5', clip: 'Farm_Harvest', offset: 0.55 },
].map((w) => Object.freeze(w)));

/** Shelter spots: every dwelling's door and the tube mouth's throat (the village keeps indoors while a Screed is on the walls). */
function shelterSpots(P) {
  const out = Object.values(P.doors).map((d) => ({ x: d.x, z: d.z, face: d.house }));
  out.push({ x: P.throat.x, z: P.throat.z, face: polar(PLACES.tubeMouth.b, 40) });
  return out;
}

/** Squared distance from (px, pz) to the segment a-b. */
function seg2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  let t = L2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + dx * t - px, ez = az + dz * t - pz;
  return ex * ex + ez * ez;
}

/** A Screed's heading (rad, atan2(dx, dz)): its rules' brain when it has one, else its own. */
export function screedHeading(m) {
  const B = m.brain || m.rules || null;
  if (B && Number.isFinite(B.lockedHeading) && (B.phase === 'charge' || B.phase === 'windup')) return B.lockedHeading;
  if (B && Number.isFinite(B.heading)) return B.heading;
  if (Number.isFinite(m.heading)) return m.heading;
  return m.root?.rotation?.y ?? m.yaw ?? 0;
}

/**
 * How close (m) a point comes to a Screed's threat: the charge line on its heading (SHELTER.line: its 25 m run and its blade's
 * 3.25 m front, plus a margin), the line to her, and its body's ring.
 */
export function threatDistance(x, z, m, player) {
  const px = m.position.x, pz = m.position.z, h = screedHeading(m), L = SHELTER.line;
  let d2 = seg2(x, z, px, pz, px + Math.sin(h) * L, pz + Math.cos(h) * L);
  // the line to her only while she is in its reach (a wind-up needs her within about a charge's length)
  if (player) {
    const dx = player.x - px, dz = player.z - pz, D = Math.hypot(dx, dz) || 1;
    if (D <= SHELTER.reach) d2 = Math.min(d2, seg2(x, z, px, pz, px + dx / D * L, pz + dz / D * L));
  }
  // (both lines start at its centre, so they hold its body's ring too)
  return Math.sqrt(d2);
}

/** The Routines engine on Ninewalls' places, with the shelter, the herd trail and the Holds' lookout. */
export class HoldsRoutines extends Routines {
  constructor(sys, home) {
    super(sys);
    this.home = home;
    this.lookout = new Lookout(this, null, { all: true, ignore: new Set(['tiller']), group: true, who: (e) => (e.person?.spec?.name || 'NINEWALLS').toUpperCase() });
    this.alarm = false;
    this._calmT = 0;
    this._alarmT = 0;
    this._screeds = [];
    this._herd = null;         // { last: {x, z}, heading } when a herd is near
    this._herdT = 0;
    this._herdSeen = new Map(); // tiller -> last { x, z } (the heading from its own motion, when it has none)
    this.shelters = null;
    this.stats = { alarms: 0, shelterMoves: 0, trailSteps: 0, jogs: 0 };
  }

  _ensure() { if (!this.L) { this.P = holdsPlaces(); this.L = holdsLoops(this.P); this.shelters = shelterSpots(this.P); } }

  /** The walk grid over Ninewalls (built once the village's colliders stand). */
  grid() {
    if (this._grid) return this._grid;
    const nav = this.ctx.nav, nw = this.ctx.settlements?.ninewalls;
    if (!nav?.addWalkGrid || !this.ctx.terrain || !nw || !(nw.stats?.colliders > 0)) return null;
    this._grid = nav.walkGrid(NINEWALLS_WALK.box.id) || nav.addWalkGrid(NINEWALLS_WALK.box, { discs: NINEWALLS_WALK.discs, radius: NINEWALLS_WALK.radius });
    return this._grid;
  }

  /** The cast the Holds people spawned, adopted once each. */
  _gather() {
    for (const [id, p] of this.home.persons) if (p && !this._adopted.has(p)) this.adopt(p, id);
  }

  _next(e, first = false) {
    if (this.alarm && !first) { this._toShelter(e); return; }
    if (e.R.trail && this._herd && !first) { this._toTrail(e); return; }
    e.trailing = false;
    super._next(e, first);
  }

  _walkTo(e, step) {
    e.step = step;
    e.phase = 'go';
    e.path = this.route(e, e.person.group.position, step);
    this._go(e);
  }

  /* ---------------------------------------------------------------- NW9: under attack */

  _threat(x, z) {
    let d = Infinity;
    const pl = this.ctx.player?.position || null;
    for (let i = 0; i < this._screeds.length; i++) d = Math.min(d, threatDistance(x, z, this._screeds[i], pl));
    return d;
  }

  _pickShelter(e) {
    const G = this._grid;
    let best = null, bd = -1;
    for (const s of this.shelters) {
      if (G && G.blockedAt(s.x, s.z)) continue;
      const d = this._threat(s.x, s.z);
      // a little for the walk: the nearer of two equally safe spots
      const score = d - 0.02 * Math.hypot(s.x - e.person.group.position.x, s.z - e.person.group.position.z);
      if (score > bd) { bd = score; best = s; }
    }
    return best || this.shelters[0];
  }

  _toShelter(e) {
    const s = this._pickShelter(e);
    e.shelter = s;
    e.trailing = false;
    e.person.gaitOverride = null;
    this._walkTo(e, { act: 'shelter', at: s, face: s.face, clip: 'Idle_FoldArms_Loop', dur: [1e6, 1e6] });
  }

  _alarmTick(dt) {
    this._alarmT -= dt;
    if (this._alarmT > 0) return;
    this._alarmT = SHELTER.recheck;
    const L = this.ctx.machines?.list || [];
    this._screeds.length = 0;
    for (let i = 0; i < L.length; i++) {
      const m = L[i];
      if (!m || m.kind !== 'screed' || m._disposed || m.alive === false || !m.position) continue;
      if (Math.hypot(m.position.x - CENTRE.x, m.position.z - CENTRE.z) <= ALARM_R) this._screeds.push(m);
    }
    if (this._screeds.length) {
      this._calmT = 0;
      if (!this.alarm) { this.alarm = true; this.stats.alarms++; for (const e of this.list) if (!e.person._talkHeld) this._toShelter(e); return; }
      // a spot a threat line has come near: a better one
      for (const e of this.list) {
        if (e.person._talkHeld || !e.shelter) continue;
        if (e.phase === 'do') e.person.gaitOverride = null;
        const cur = this._threat(e.shelter.x, e.shelter.z);
        if (cur >= SHELTER.keep) continue;
        const s = this._pickShelter(e);
        if (s !== e.shelter && this._threat(s.x, s.z) > cur + SHELTER.better) { this.stats.shelterMoves++; this._toShelter(e); }
      }
    } else if (this.alarm && (this._calmT += SHELTER.recheck) >= SHELTER.calm) {
      this.alarm = false;
      for (const e of this.list) { e.shelter = null; if (!e.person._talkHeld) this._next(e); }
    }
  }

  /* ---------------------------------------------------------------- the youths behind the herd */

  /** The herd near the village: its last hull and heading (the file's own order when the herd has one), or null. */
  _herdTick(dt) {
    this._herdT -= dt;
    if (this._herdT > 0) return;
    this._herdT = TRAIL.recheck;
    const L = this.ctx.machines?.list || [];
    const near = [];
    for (let i = 0; i < L.length; i++) {
      const m = L[i];
      if (!m || m.kind !== 'tiller' || m._disposed || m.alive === false || !m.position) continue;
      if (Math.hypot(m.position.x - CENTRE.x, m.position.z - CENTRE.z) <= HERD_R) near.push(m);
    }
    if (!near.length) { this._herd = null; this._herdSeen.clear(); return; }
    // the heading: the file's leader's own (its motion since the last check, else its yaw)
    const order = near[0].herd?.file?.order?.filter((m) => near.includes(m));
    const file = order && order.length ? order : near;
    let hx = 0, hz = 0;
    for (const m of file) {
      const was = this._herdSeen.get(m);
      if (was) { hx += m.position.x - was.x; hz += m.position.z - was.z; }
      this._herdSeen.set(m, { x: m.position.x, z: m.position.z });
    }
    if (Math.hypot(hx, hz) < 0.05) {
      const y = file[0].root?.rotation?.y ?? file[0].yaw ?? this._herd?.heading ?? 0;
      hx = Math.sin(y); hz = Math.cos(y);
    }
    const h = Math.atan2(hx, hz), sx = Math.sin(h), sz = Math.cos(h);
    // the last hull: the file's last, or the one farthest back along the heading
    let last = order && order.length ? order[order.length - 1] : null;
    if (!last) { let lo = Infinity; for (const m of near) { const k = m.position.x * sx + m.position.z * sz; if (k < lo) { lo = k; last = m; } } }
    const at = { x: last.position.x - sx * TRAIL.at, z: last.position.z - sz * TRAIL.at };
    const G = this._grid;
    if (G && (!G.contains(at.x, at.z, G.cell) || G.blockedAt(at.x, at.z))) {
      const i = G.nearestOpen(at.x, at.z, 8);
      if (i < 0) { this._herd = null; return; }
      at.x = G.wx(i); at.z = G.wz(i);
    }
    this._herd = { last, lastAt: { x: last.position.x, z: last.position.z }, heading: h, at };
    // a trailing youth whose mark has moved on re-routes; one with no herd before starts trailing now
    for (const e of this.list) {
      if (!e.R.trail || this.alarm || e.person._talkHeld) continue;
      if (!e.trailing) { this._toTrail(e); continue; }
      const s = e.step;
      if (s && Math.hypot(s.at.x - at.x, s.at.z - at.z) > TRAIL.moveM && e.phase === 'go') this._toTrail(e);
    }
  }

  _toTrail(e) {
    const H = this._herd;
    if (!H) { e.trailing = false; super._next(e); return; }
    e.trailing = true;
    e.trailK = (e.trailK || 0) + 1;
    const p = e.person.group.position, d = Math.hypot(p.x - H.at.x, p.z - H.at.z);
    // jog to catch up when the mark is more than a few steps off (the herd walks at 1.5 m/s, a walk is 0.7); walk the last of it
    if (d > TRAIL.jogOver) { if (e.person.gaitOverride !== 'Jog_Fwd_Loop') this.stats.jogs++; e.person.gaitOverride = 'Jog_Fwd_Loop'; }
    else e.person.gaitOverride = null;
    this.stats.trailSteps++;
    const sow = e.trailK % 2 === 1;
    // a short beat of work in the furrow (the hulls walk on; the next mark is taken as it ends)
    this._walkTo(e, { act: sow ? 'sow' : 'gather', at: { x: H.at.x, z: H.at.z }, face: H.lastAt, clip: sow ? 'Farm_PlantSeed' : 'PickUp_Table', dur: sow ? [2.5, 4] : [2, 3] });
  }

  update(dt) {
    if (!this.live()) return;
    this.grid();
    this._alarmTick(dt);
    this._herdTick(dt);
    super.update(dt);
  }

  info() {
    return super.info().map((r, i) => ({ ...r, shelter: !!this.list[i]?.shelter, trailing: !!this.list[i]?.trailing }));
  }
}

/** The Holds people: the cast streamed in and out with her distance, their routines, Oro's anchor and his dialogue turn. */
export class HoldsPeople {
  constructor(sys) {
    this.sys = sys;
    this.ctx = sys.ctx;
    /** id -> Person (the cast that stands now) */
    this.persons = new Map();
    this.routines = new HoldsRoutines(sys, this);
    this.state = 'out';        // out | loading | in | leaving
    this.force = false;        // a probe's: stream in a ?shot page too
    this._t = 0;
    this._queue = [];
    this.stats = { spawns: 0, despawns: 0, failed: 0 };
    this.anchors = { oro: ORO_ANCHOR };
  }

  live() { return this.force || !this.ctx.params?.has?.('shot'); }

  /** The person of a cast id standing now (the quest's and the faces' lookup), or null. */
  person(id) { return this.persons.get(id) || null; }
  anchor(id) { return this.anchors[id] || null; }

  /** A dialogue holds a named person: he turns to face her (index.js `_beat` calls this once, as the hold begins). */
  faceToTalk(p) {
    const pl = this.ctx.player?.position;
    if (!pl || !p?.group) return;
    const y = Math.atan2(pl.x - p.group.position.x, pl.z - p.group.position.z);
    p.yaw = y; p.group.rotation.y = y;
  }

  /** An 'oro' standing that is not ours: the one the quest stood at the tube mouth (src/game/hour.js _standOro), or null. */
  _questOro() {
    const L = this.sys.list || [];
    for (let i = 0; i < L.length; i++) if (L[i].archetype === 'oro' && L[i]._holds !== 'oro' && !L[i]._frame) return L[i];
    return null;
  }

  /** Take a person someone else stood (the quest's Oro) into the cast and its loop, in place of ours. */
  _take(id, p) {
    const mine = this.persons.get(id);
    if (mine && mine !== p) { this.routines.remove(mine); this.sys.despawn(mine); }
    this.persons.set(id, p);
    p._named = id === 'oro';
    p._holds = id;
    this.routines.adopt(p, id);
  }

  _spawnNext() {
    const id = this._queue.shift();
    if (!id) { this.state = 'in'; return; }
    // ONE ORO: the quest (systems) stands him at the tube mouth for the hand-over when the stage opens, and finds ours when
    // ours stands first (hour.js _standOro reads people.list for archetype 'oro'); if theirs stands first we take theirs
    if (id === 'oro') { const q = this._questOro(); if (q) { this._take('oro', q); this._t = 0.25; return; } }
    const loop = (this.routines._ensure(), this.routines.L[id]);
    const at = loop?.day?.[0]?.at || CENTRE;
    this.sys.spawn(id, { x: at.x, z: at.z, yaw: 0, seed: 401 + HOLDS_CAST.indexOf(id) * 31, id: `${id}#holds` }).then((p) => {
      if (this.state === 'leaving' || this.state === 'out') { this.sys.despawn(p); return; }
      this.persons.set(id, p);
      p._named = id === 'oro';
      p._holds = id;
      this.stats.spawns++;
      // on the job from the moment they stand (the first step's clip, at its place): no idle beat, no bind pose
      this.routines.adopt(p, id);
    }).catch((e) => { this.stats.failed++; console.warn('[people] the Holds cast: ' + id + ' did not spawn', e?.message || e); })
      .finally(() => { if (this.state === 'loading') this._t = 0.25; });
  }

  _despawnAll() {
    for (const [, p] of this.persons) { this.routines.remove(p); this.sys.despawn(p); this.stats.despawns++; }
    this.persons.clear();
    this.state = 'out';
  }

  update(dt) {
    if (!this.live()) return;
    // the walk grid (about 35 ms to build, once) is built while the title stands, never in play: built on the first route,
    // it fell in the middle of the walk in (first-hour leg 2 at d3edb33: one frame of 67 ms on the way to Ninewalls)
    if (!this._gridBuilt && this.ctx.state !== 'playing') {
      const G = this.routines.grid();
      if (G) { if (G.dirty) G.build(); this._gridBuilt = true; this.stats.gridMs = G.stats.buildMs; }
    }
    const pl = this.ctx.player?.position;
    if (pl) {
      const d = Math.hypot(pl.x - CENTRE.x, pl.z - CENTRE.z);
      if (this.state === 'out' && d < SPAWN_R) { this.state = 'loading'; this._queue = [...HOLDS_CAST]; this._t = 0; }
      else if ((this.state === 'in' || this.state === 'loading') && d > DESPAWN_R) { this.state = 'leaving'; this._queue = []; this._despawnAll(); }
    }
    if (this.state === 'loading' && (this._t -= dt) <= 0) { this._t = Infinity; this._spawnNext(); }
    // the quest's Oro and ours both asked for at once (their spawn resolving after ours): keep theirs, the one it holds
    if (this.state === 'in' && (this._dupT = (this._dupT || 0) - dt) <= 0) {
      this._dupT = 1;
      const q = this._questOro();
      if (q) this._take('oro', q);
    }
    this.routines.update(dt);
  }

  /**
   * A frame's people at work (tools/frames/stagings/settlements.mjs F36: "5 people at work"): each `{ id, place, face, clip }`
   * spawned at its loop's place, turned to its work and posed in its work clip, nothing driving them (a ?shot film). Resolves
   * to the people; `unstage()` takes them away.
   */
  async stageAtWork(list = AT_WORK) {
    const P = holdsPlaces(), out = [];
    this._staged = this._staged || [];
    for (const w of list) {
      const at = typeof w.place === 'string' ? (w.place.startsWith('door:') ? P.doors[w.place.slice(5)] : P[w.place]) : w.place;
      const face = typeof w.face === 'string' ? (w.face.startsWith('house:') ? P.doors[w.face.slice(6)].house : P[w.face]) : w.face;
      const p = await this.sys.spawn(w.id, { x: at.x, z: at.z, yaw: 0, seed: 401 + HOLDS_CAST.indexOf(w.id) * 31, id: `${w.id}#frame` });
      p.setPosition(at.x, at.z);
      if (face) { const y = Math.atan2(face.x - at.x, face.z - at.z); p.yaw = y; p.group.rotation.y = y; }
      p.stopWalk();
      // the people system's idle beats stay off (spawn() starts one, and after 6 s it played the archetype's idle over the
      // work clip: the films at c5e75eb and d3edb33 showed the two nearest upright)
      p._beatT = 0; p._beatEnd = Infinity;
      p.play(w.clip, { fade: 0, offset: w.offset ?? 0.35 });
      p.showProps(this.sys._propsFor(p, w.clip));
      p._frame = true;
      this._staged.push(p);
      out.push(p);
    }
    return out;
  }

  unstage() { for (const p of this._staged || []) this.sys.despawn(p); this._staged = []; }

  info() {
    return { state: this.state, cast: [...this.persons.keys()], alarm: this.routines.alarm, herd: !!this.routines._herd, stats: { ...this.stats, ...this.routines.stats },
      routines: this.routines.info(), lookout: { warnings: this.routines.lookout.warnings.slice(-8), nearest: this.routines.lookout.nearest } };
  }

  dispose() { this._despawnAll(); }
}

