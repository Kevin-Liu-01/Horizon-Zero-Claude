import { streetPoint, CONES, HARBOUR, BREAKWATER_LAMP, breakwaterPoint, STREET } from '../../settlements/saltrow-layout.js';
import { siteById } from '../../island/sites.js';
import { Lookout } from './lookout.js';

/**
 * CALIMA · daily routines for the slice's cast (people; BUILD M1.5d, first part). `ctx.people.routines`.
 *
 * The Saltrow crew (src/world/settlements/saltrow.js CREW: two rakers, a porter and two caulkers, each spawned once at one
 * task) is adopted here once the town stands, and the second lantern-keeper is spawned to keep the breakwater lamp. Each
 * person then works a loop of activities at real places, walking between them on waypoints that keep to the street's
 * middle and the open ground below it:
 *   rakers     rake a pan at the town's edge, carry the basket to the right-hand cone and tip it, now and then a drink
 *   porters    load a basket at a cone, carry it up the street on the shoulder, set it down at a door, back down, a word
 *   caulkers   at the boat ramp: caulk kneeling, rock the hull, look along the seam; one goes up to the street for pitch
 *   keeper     by day at the harbour: a word with the caulkers, a rest on the beach, a call to the boats; from 18:30 to 06:00 lights the breakwater lamp from the
 *              beach at the mole's root, watches the water along the beach and calls, comes back to tend the lamp
 * A step is { act, at, face, clip, dur: [lo, hi] }; `act` is what the log counts (walking between is 'walk').
 * Mise is the quest's (src/game/runtime.js stands her at her anchor) and is not driven here.
 *
 * In a ?shot film nothing is adopted or spawned (the crew stands as settlements staged it; no frame moves) unless
 * `force` is set by a probe. Every person keeps a clip at all times: the first step's clip plays the moment a person is
 * adopted or spawned, and a walk plays the person's own walk clip.
 */
const D2R = Math.PI / 180;
const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k });
const off = (p, bearingDeg, d) => ({ x: p.x + Math.sin(bearingDeg * D2R) * d, z: p.z - Math.cos(bearingDeg * D2R) * d });

/** The places, from the town's layout (world x, z). */
export function places() {
  const foot = streetPoint(0, 0), pans = siteById('salt-pans');
  const toPans = Math.atan2(pans.x - foot.x, -(pans.z - foot.z)) / D2R;   // bearing from the street's foot to the pans
  const coneR = CONES[0], coneL = CONES[1];
  const ramp = HARBOUR.ramp, rb = ramp.bearing;
  // the boat's place: hauled up on the ramp, 2 m down from its top (the slipway runs on into the sea); its length along the ramp
  const boat = off(ramp, rb, 2);
  const bw = HARBOUR.breakwater.bearing;
  return {
    foot, pans,
    // the pan edge below the town, along the line to the pans: 14-24 m out from the street's foot
    panA: off(foot, toPans - 8, 15), panB: off(foot, toPans + 6, 19), panC: off(foot, toPans - 2, 24),
    // the right-hand cone: a tipping place on its pan side
    coneTip: off(coneR, toPans - 40, coneR.r + 0.9), coneTip2: off(coneR, toPans - 80, coneR.r + 1.0), coneR, coneL,
    coneLoad: off(coneL, STREET.bearing + 90, coneL.r + 0.9),   // on the street side (the pan side is Brea's house)
    // up the street: a door step on the right (r2) and one on the left (l2)
    // (l2's door has its balcony's posts in front of it: the second basket goes to r3's door)
    stepR2: streetPoint(24.0, 1.9), stepR3: streetPoint(31.0, 1.6), stepL1: streetPoint(13.0, -1.9),
    midStreet: (s) => streetPoint(s, 0),
    // the harbour
    ramp, boat, boatL: off(boat, rb - 90, 1.2), boatR: off(boat, rb + 90, 1.2), stern: off(boat, rb + 180, 2.4),
    // the way down to the harbour from the street's foot: across the open pan edge, clear of Brea's house and the pan-edge
    // house west of the foot (w1: on a straight 235 deg line the walk grazed its corner)
    harbourWay: [off(foot, 218, 20), off(foot, 233, 55)],
    // the lamp is lit from the beach beside the mole's root (a person walks the ground, never the deck); the water watched
    // from the beach a few metres along it
    // (measured on the island's own heights, src/world/island/recipe.js heightAt: the lamp's column stands at -0.5 m on the
    // mole; the dry beach is the 30-120 deg side of it; at 1281757 the watch and the call stood in the sea)
    lamp: BREAKWATER_LAMP, lampStand: off(BREAKWATER_LAMP, 60, 4.0), beachWatch: off(BREAKWATER_LAMP, 100, 9.0),
    beachCall: off(BREAKWATER_LAMP, 40, 7.0), beachRest: off(BREAKWATER_LAMP, 75, 12.0), sea: breakwaterPoint(30, 0),
    toPans,
  };
}

/** The loops. Faces: a point the person turns to at the step. */
function loops(P) {
  const S = STREET.bearing;
  return {
    'salt-raker': { day: [
      { act: 'rake', at: P.panA, face: off(P.panA, P.toPans, 3), clip: 'Farm_Harvest', dur: [32, 46] },
      { act: 'carry', at: P.coneTip, face: P.coneR, clip: 'PickUp_Table', dur: [5, 7] },
      { act: 'rake', at: P.panB, face: off(P.panB, P.toPans, 3), clip: 'Farm_Harvest', dur: [32, 46] },
      { act: 'carry', at: P.coneTip, face: P.coneR, clip: 'PickUp_Table', dur: [5, 7] },
      { act: 'drink', at: off(P.coneTip, S + 90, 2.2), face: P.foot, clip: 'Consume', dur: [7, 10] },
    ] },
    'salt-raker-2': { day: [
      { act: 'rake', at: P.panC, face: off(P.panC, P.toPans, 3), clip: 'Farm_Harvest', dur: [30, 44] },
      { act: 'carry', at: P.coneTip2, face: P.coneR, clip: 'PickUp_Table', dur: [5, 7] },
      { act: 'drink', at: off(P.coneTip2, P.toPans, 2.4), face: P.panC, clip: 'Consume', dur: [6, 9] },
      { act: 'rake', at: P.panA, face: off(P.panA, P.toPans + 20, 3), clip: 'Farm_Harvest', dur: [30, 44] },
      { act: 'carry', at: P.coneTip2, face: P.coneR, clip: 'PickUp_Table', dur: [5, 7] },
    ] },
    'salt-porter': { day: [
      { act: 'load', at: P.coneLoad, face: P.coneL, clip: 'PickUp_Table', dur: [5, 7] },
      { act: 'unload', at: P.stepR2, face: streetPoint(24.0, 3.6), clip: 'PickUp_Table', dur: [5, 7], via: [P.midStreet(2), P.midStreet(24)] },
      { act: 'talk', at: streetPoint(11.0, 1.2), face: streetPoint(11.0, -1.2), clip: 'Idle_Talking_Loop', dur: [12, 20], via: [P.midStreet(24), P.midStreet(11)] },
      { act: 'load', at: P.coneLoad, face: P.coneL, clip: 'PickUp_Table', dur: [5, 7], via: [P.midStreet(2)] },
      { act: 'unload', at: P.stepR3, face: streetPoint(31.0, 3.2), clip: 'PickUp_Table', dur: [5, 7], via: [P.midStreet(2), P.midStreet(31)] },
      { act: 'rest', at: streetPoint(5.0, 1.6), face: P.panA, clip: 'Idle_Loop', dur: [10, 16], via: [P.midStreet(31), P.midStreet(5)] },
    ] },
    'boat-caulker': { day: [
      { act: 'caulk', at: P.boatL, face: P.boat, clip: 'Fixing_Kneeling', dur: [30, 42] },
      { act: 'rock', at: P.stern, face: P.boat, clip: 'Push_Loop', dur: [8, 12] },
      { act: 'inspect', at: off(P.boatL, HARBOUR.ramp.bearing, 1.5), face: P.boat, clip: 'Interact', dur: [5, 7] },
      { act: 'caulk', at: off(P.boatL, HARBOUR.ramp.bearing + 180, 1.0), face: P.boat, clip: 'Fixing_Kneeling', dur: [30, 42] },
      { act: 'drink', at: off(P.ramp, HARBOUR.ramp.bearing - 120, 3), face: P.boat, clip: 'Consume', dur: [6, 9] },
    ] },
    'boat-caulker-2': { day: [
      { act: 'caulk', at: P.boatR, face: P.boat, clip: 'Fixing_Kneeling', dur: [28, 40] },
      { act: 'inspect', at: off(P.boatR, HARBOUR.ramp.bearing, 1.6), face: P.boat, clip: 'Interact', dur: [5, 7] },
      { act: 'rock', at: P.stern, face: P.boat, clip: 'Push_Loop', dur: [8, 12] },
      { act: 'caulk', at: off(P.boatR, HARBOUR.ramp.bearing + 180, 1.0), face: P.boat, clip: 'Fixing_Kneeling', dur: [28, 40] },
      { act: 'fetch', at: P.stepL1, face: streetPoint(13.0, -3.6), clip: 'PickUp_Table', dur: [5, 7], via: [P.harbourWay[1], P.harbourWay[0], P.midStreet(0), P.midStreet(13)] },
      { act: 'rock', at: P.stern, face: P.boat, clip: 'Push_Loop', dur: [8, 12], via: [P.midStreet(13), P.midStreet(0), P.harbourWay[0], P.harbourWay[1]] },
    ] },
    'lantern-keeper-2': {
      // the keeper keeps to the harbour: a word with the caulkers at the ramp, a rest on the beach, a call to the boats
      day: [
        { act: 'talk', at: off(P.ramp, HARBOUR.ramp.bearing + 90, 4.0), face: P.boat, clip: 'Idle_Talking_Loop', dur: [14, 22] },
        { act: 'rest', at: P.beachRest, face: P.sea, clip: 'Idle_Loop', dur: [10, 16] },
        { act: 'call', at: P.beachCall, face: P.sea, clip: 'Idle_Rail_Call', dur: [5, 7] },
      ],
      night: [
        { act: 'light', at: P.lampStand, face: P.lamp, clip: 'Idle_Lantern_Loop', dur: [14, 20], via: [P.midStreet(0), P.harbourWay[0], P.harbourWay[1]] },
        { act: 'watch', at: P.beachWatch, face: P.sea, clip: 'Idle_FoldArms_Loop', dur: [24, 34] },
        { act: 'call', at: P.beachCall, face: P.sea, clip: 'Idle_Rail_Call', dur: [5, 7] },
        { act: 'tend', at: P.lampStand, face: P.lamp, clip: 'Idle_Lantern_Loop', dur: [12, 18] },
      ],
      nightFrom: 18.5, nightTo: 6.0,
    },
  };
}

/**
 * The waypoints a person takes from `from` to a step: its `via` in order, less the leading ones that lie farther from the
 * place than the person already is (a keeper at the lamp does not walk up to the street to come back down to it).
 */
export function wayOf(from, step) {
  const via = step.via || [], at = step.at;
  const d0 = Math.hypot(at.x - from.x, at.z - from.z);
  let k = 0;
  while (k < via.length && Math.hypot(at.x - via[k].x, at.z - via[k].z) >= d0) k++;
  return [...via.slice(k), at];
}

/** A clip's name without the body's prefix ('F|Farm_Harvest' -> 'Farm_Harvest'). */
export const bareClip = (name) => (name ? name.replace(/^[FM]\|/, '') : name);

/** Clips that count as work or seated (stationary inside them is the work, not standing about). Bare names. */
export const WORK_CLIPS = new Set(['Farm_Harvest', 'Fixing_Kneeling', 'Push_Loop', 'PickUp_Table', 'Interact', 'Idle_Lantern_Loop',
  'Idle_Rail_Loop', 'Idle_Rail_Call', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'TreeChopping_Loop', 'Farm_Watering', 'Farm_PlantSeed', 'Chest_Open']);

export class Routines {
  constructor(sys) {
    this.sys = sys;
    this.ctx = sys.ctx;
    this.force = false;
    /** a clock of its own (game hours) instead of environment.time: a log's seam */
    this.hourOf = null;
    this.P = null;
    this.L = null;
    this.list = [];           // { person, id, R: loop record, k, step, phase: 'go'|'do', t, end, path, act, seed }
    this._adopted = new Set();
    this._keeper = null;
    this._checkT = 0;
    /** M1.5d: the keeper's warning when an Instrument comes within 80 m (lookout.js; the people system hands it the lines) */
    this.lookout = new Lookout(this);
  }

  live() { return this.force || !this.ctx.params?.has?.('shot'); }

  /** Night for the lamp: from nightFrom to nightTo (environment.time, game hours). */
  _night(R) {
    const h = this.hourOf ? this.hourOf() : this.ctx.environment?.time;
    if (h == null || !R.night) return false;
    return R.nightFrom > R.nightTo ? (h >= R.nightFrom || h < R.nightTo) : (h >= R.nightFrom && h < R.nightTo);
  }

  _rand(e) { e.seed = (e.seed * 16807) % 2147483647; return (e.seed - 1) / 2147483646; }

  adopt(person, id) {
    if (!person || this._adopted.has(person)) return null;
    if (!this.L) { this.P = places(); this.L = loops(this.P); }
    const R = this.L[id];
    if (!R) return null;
    this._adopted.add(person);
    person._beatT = 0; person._beatEnd = Infinity;   // the people system's idle beats stay off
    const e = { person, id, R, k: 0, step: null, phase: 'do', t: 0, end: 0, path: [], act: 'start', seed: (person.seed || 7) * 7919 % 2147483647 || 7, night: null };
    this.list.push(e);
    // the first step: walked to from where they stand (the clip runs while they go)
    this._next(e, true);
    return e;
  }

  /** The crew from the town (adopted once) and the lamp keeper (spawned once): the town must stand first. */
  _gather() {
    const crew = this.ctx.settlements?.town?.crew;
    if (!crew) return;
    for (const c of crew) if (c.person && !this._adopted.has(c.person)) this.adopt(c.person, c.id);
    if (!this._keeper && this.ctx.settlements?.town?.loaded && this.sys.spawn) {
      this._keeper = 'loading';
      const P = this.P || (this.P = places());
      const at = streetPoint(2.0, -1.4);
      this.sys.spawn('lantern-keeper-2', { x: at.x, z: at.z, yaw: 0, seed: 377 }).then((p) => {
        this._keeper = p;
        if (!this.live()) return;
        this.adopt(p, 'lantern-keeper-2');
      }).catch(() => { this._keeper = 'failed'; });
      void P;
    }
  }

  _next(e, first = false) {
    const R = e.R;
    const night = this._night(R);
    const list = night ? R.night : R.day;
    if (night !== e.night) { e.night = night; e.k = 0; }
    const step = list[e.k % list.length];
    e.k++;
    e.step = step;
    const p = e.person;
    // the way: the step's waypoints, then the place
    e.path = wayOf(p.group.position, step);
    e.phase = 'go';
    if (first) {
      // start on the job: put them at the place, already at it
      p.setPosition(step.at.x, step.at.z);
      e.path = [];
    }
    this._go(e);
  }

  _go(e) {
    const p = e.person;
    // skip waypoints already within 1.5 m
    while (e.path.length > 1 && Math.hypot(e.path[0].x - p.group.position.x, e.path[0].z - p.group.position.z) < 1.5) e.path.shift();
    const q = e.path.shift();
    if (!q || Math.hypot(q.x - p.group.position.x, q.z - p.group.position.z) < 0.35) { this._arrive(e); return; }
    e.act = 'walk';
    e.goT = 0;
    e.goLimit = Math.hypot(q.x - p.group.position.x, q.z - p.group.position.z) / 0.4 + 10;
    p.showProps(this.sys._propsFor(p, 'walk'));
    p.walkTo(q.x, q.z, () => this._go(e));
  }

  _arrive(e) {
    const p = e.person, s = e.step;
    p.stopWalk();
    if (s.face) {
      const y = Math.atan2(s.face.x - p.group.position.x, s.face.z - p.group.position.z);
      p.yaw = y; p.group.rotation.y = y;
    }
    let d = p.play(s.clip, { fade: 0.4, offset: this._rand(e) });
    if (!d) d = p.play('Idle_Loop', { fade: 0.4 });
    p.showProps(this.sys._propsFor(p, s.clip));
    e.phase = 'do';
    e.act = s.act;
    e.clip = s.clip;
    e.t = 0;
    e.end = s.dur[0] + (s.dur[1] - s.dur[0]) * this._rand(e);
  }

  update(dt) {
    if (!this.live()) return;
    this._checkT -= dt;
    if (this._checkT <= 0) { this._checkT = 1; this._gather(); }
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (e.phase !== 'do') {
        // a walk that does not end: the leg's length at 0.4 m/s plus 10 s, then the person is put on the mark (counted)
        e.goT = (e.goT || 0) + dt;
        const W = e.person.walkTarget;
        if (W && e.goT > (e.goLimit || 60)) { e.stuck = (e.stuck || 0) + 1; e.person.setPosition(W.x, W.z); const then = W.then; e.person.stopWalk(); then?.(e.person); }
        continue;
      }
      e.t += dt;
      // the lamp: at the turn of night a keeper goes to it whatever they were doing
      const night = this._night(e.R);
      if (e.t >= e.end || (e.R.night && night !== e.night)) this._next(e);
    }
    this.lookout.update(dt);
  }

  /** The log's surface: per person what they are doing now. */
  info() {
    return this.list.map((e) => ({ id: e.id, act: e.act, stuck: e.stuck || 0, clip: bareClip(e.person.current?.getClip().name) || null, phase: e.phase, night: !!e.night, x: +e.person.group.position.x.toFixed(2), z: +e.person.group.position.z.toFixed(2) }));
  }

  remove(person) {
    const i = this.list.findIndex((e) => e.person === person);
    if (i >= 0) this.list.splice(i, 1);
    this._adopted.delete(person);
  }
}
