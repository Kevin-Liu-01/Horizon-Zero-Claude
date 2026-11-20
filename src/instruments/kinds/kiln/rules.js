import { KILN_DOOR, KILN_COUPLING, KILN_COUPLING_SIDE } from './form.js';
import { KILN_CUES } from './cues.js';

/**
 * THE KILN'S RULES (M3 wave 1, area C; bible §7.4 #10, §8.3; rows IK2, IK3, IK4 of the M3 brief). Simulation time,
 * no three and no scene, so the Node rows (tools/gates/instruments/m3/kiln.test.mjs) and the live kind (its behaviour
 * wave) run the same code. Numbers marked * are starting values, frozen on their first Node run.
 *
 * THE FIREBOX DOOR (IK2). Brine on the HOT door springs it open and staggers the Kiln for `staggerS` (2.0 s): a window
 * for Pry and precision on the firebox. The damage multiplier is exactly 1.0 in the window (bible §8.3: Seized and the
 * door take no multiplier). "On the door" means: a Brine Pot's mist that holds the door's centre AND stands on the
 * door's side of its plane (the hull shields the door from mist behind or beside it), or a Brine-Gourd arrow whose
 * flight crosses the door's box. A cold door (never plugged in, or cooled `coolS` after it unplugged) does nothing,
 * nor does Brine anywhere else on the hull. A sprung door does not spring again until it has shut.
 *
 * PLUGGED IN (IK3). It walks to the nearest `hot` wellhead that nothing holds (a quenched one is never chosen; the
 * wellheads seam of area A, src/world/sites/kilnyards-layout.js: records { id, x, z, state, plugged, kilnStand }), to
 * the stand the seam keeps for a Kiln (`kilnStand`: its centre and yaw; without one, `standM` short of the wellhead),
 * turns square to the stand, couples its hose (`coupleS`; the seam's `plugIn(id, 'kiln')` through `world.plugIn`) and
 * stands plugged: it does not turn while plugged and it does not leave on its own (`plugMinS` or more: the stealth
 * window). A plugged Kiln does not shell (it must
 * unplug first: `unplugS`). If its wellhead is quenched it unplugs and looks for another; with none left it stands
 * idle. The door is hot while it is coupling or plugged and for `coolS` after.
 *
 * THE MORTAR (IK4). `planVolley` lays three shells at a target 25-60 m off; each shell lobs over a top of at least
 * `lobTopMinM`, so its shadow and whistle (`shellWarning`: from the top to the impact) lead its impact by at least
 * `warnS`. No shell lands inside a dwelling ring or within `personR` of a person: a landing that would is pushed out
 * past the ring or re-aimed (up to `reaimTries` scatter draws); if any of the three still cannot land clear, the Kiln
 * HOLDS FIRE (no volley: a volley is always three shells). It never shells a target standing inside a dwelling ring.
 *
 * THE YARDS' SPAWNS (IK3). `KilnSpawner` puts one Kiln on the site every `respawnH` site-clock hours while fewer than
 * `cap` live and any wellhead is hot: four quenched, none.
 */

export const KILN_RULES = Object.freeze({
  walk: 1.1, turnRate: 0.45,            // m/s; rad/s
  standM: 4.85,                         // * its centre this far from the wellhead when it couples (no seam stand): the
                                        //   seam's own 4.9 m (hose 3.2 m plus half its 3.4 m width), less the stop's 5 cm
  hoseM: 3.2,                           // the seam's hose run (kilnStand.hose): the coupling stands within it of the head
  coupleS: 1.5, unplugS: 1.5,           // *
  plugMinS: 120,                        // * IK3: it stands at least this long plugged in
  coolS: 30,                            // * the door stays hot this long after it unplugs
  staggerS: 2.0, damageK: 1.0,          // IK2
  doorFrontPad: 0.25,                   // a mist centre up to this far behind the door's plane still reaches its face
  mortar: Object.freeze({ minR: 25, maxR: 60, shells: 3, gapS: 0.6, scatterM: 3.0, lobTopMinM: 10, lobTopK: 0.35, warnS: 1.2, personR: 2.0, ringPadM: 1.0,
    reaimTries: 8,                      // * scatter draws per shell before it holds fire
    shadowR0: 2.4, shadowR1: 0.7 }),    // * the landing shadow's radius at the top and at impact (m)
  respawnH: 6, cap: 2,                  // * site-clock hours; live Kilns at the Yards (Q4's default: two, one awake)
  g: 9.81,
});

/** World point of a body-frame point of a hull at (x, y, z) facing `heading` (yaw 0 faces +z). */
export function bodyToWorld(x, y, z, heading, p, out = { x: 0, y: 0, z: 0 }) {
  const s = Math.sin(heading), c = Math.cos(heading);
  out.x = x + p[0] * c + p[2] * s; out.y = y + p[1]; out.z = z - p[0] * s + p[2] * c;
  return out;
}

/** The nearest hot wellhead that nothing holds (or that `heldId` is, its own), from (x, z); null when there is none. */
export function chooseWellhead(wellheads, x, z, heldId = null) {
  let best = null, bd = Infinity;
  for (const w of wellheads || []) {
    if (!w || w.state !== 'hot') continue;
    if (w.plugged && w.id !== heldId) continue;
    const d = Math.hypot(w.x - x, w.z - z);
    if (d < bd) { bd = d; best = w; }
  }
  return best;
}

let _ids = 0;

export class KilnBrain {
  constructor({ x = 0, y = 0, z = 0, heading = 0, id = null } = {}) {
    this.id = id ?? `kiln-${++_ids}`;
    this.x = x; this.y = y; this.z = z; this.heading = heading;
    /** 'idle' | 'walking' | 'coupling' | 'plugged' | 'unplugging' | 'awake' */
    this.state = 'idle';
    this.stateT = 0;
    this.well = null;            // the wellhead record it is going to or holds (matched by id)
    this.stand = null;           // { x, z, heading } it stands at for that wellhead
    this._mine = false;          // it holds the wellhead's plug
    this.door = 'shut';          // 'shut' | 'sprung'
    this.staggerT = 0;
    this.hotT = 0;               // seconds of heat left after it unplugs
    this.plugT = 0;              // seconds plugged in, this time
    this.events = [];
  }

  /** Every event carries its cue id (./cues.js: the Cues seam; IK8), and every state change is an event. */
  _ev(type, p) { this.events.push({ type, ...(p || {}), cue: KILN_CUES.event[type] ?? null }); }
  _set(s) { const from = this.state; this.state = s; this.stateT = 0; if (from !== s) this.events.push({ type: 'state', from, to: s, cue: KILN_CUES.state[s] ?? null }); }

  get staggered() { return this.staggerT > 0; }
  get plugged() { return this.state === 'plugged'; }

  /** Is the firebox door hot (coupling or plugged in, or cooling)? */
  doorHot() { return this.state === 'coupling' || this.state === 'plugged' || this.state === 'unplugging' || this.hotT > 0; }

  /** IK2: the damage multiplier on any part, any time (the door's window included): exactly 1. */
  damageK() { return KILN_RULES.damageK; }

  /** The door's centre in the world. */
  doorWorld(out) { return bodyToWorld(this.x, this.y, this.z, this.heading, KILN_DOOR.c, out); }

  /** Does a Brine mist `field` ({ x, y, z, contains(x, y, z) }: src/combat/pots.js PotField) reach the door's face? */
  mistOnDoor(field) {
    if (!field) return false;
    const d = this.doorWorld();
    if (typeof field.contains === 'function' ? !field.contains(d.x, d.y, d.z) : Math.hypot(field.x - d.x, field.z - d.z) > field.r) return false;
    const nx = Math.sin(this.heading), nz = Math.cos(this.heading);
    return (field.x - d.x) * nx + (field.z - d.z) * nz >= -KILN_RULES.doorFrontPad;
  }

  /** Does an arrow's flight from a to b ({x, y, z}) cross the door's box? (slab test in the door's frame) */
  arrowOnDoor(a, b) {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    const loc = (p) => { const dx = p.x - this.x, dz = p.z - this.z; return [dx * c - dz * s, p.y - this.y, dx * s + dz * c]; };
    const A = loc(a), B = loc(b), C = KILN_DOOR.c, H = KILN_DOOR.half;
    let t0 = 0, t1 = 1;
    for (let k = 0; k < 3; k++) {
      const d = B[k] - A[k], lo = C[k] - H[k] - 0.02, hi = C[k] + H[k] + 0.02;
      if (Math.abs(d) < 1e-9) { if (A[k] < lo || A[k] > hi) return false; continue; }
      let ta = (lo - A[k]) / d, tb = (hi - A[k]) / d;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
    return true;
  }

  /**
   * Brine reaches the Kiln. `hit` is { kind: 'pot', field } or { kind: 'arrow', a, b }. Returns { stagger, why }.
   */
  brine(hit) {
    const onDoor = hit?.kind === 'arrow' ? this.arrowOnDoor(hit.a, hit.b) : this.mistOnDoor(hit?.field);
    if (!onDoor) return { stagger: false, why: 'not on the door' };
    if (!this.doorHot()) return { stagger: false, why: 'the door is cold' };
    if (this.door === 'sprung') return { stagger: false, why: 'the door is already sprung' };
    this.door = 'sprung';
    this.staggerT = KILN_RULES.staggerS;
    this._ev('door-sprung', { by: hit.kind });
    this._ev('stagger', { s: this.staggerT });
    return { stagger: true, why: 'the hot door sprang' };
  }

  /** It is struck or sees her: it wakes (a plugged Kiln unplugs first). */
  wake() {
    if (this.state === 'plugged' || this.state === 'coupling') { this._set('unplugging'); return true; }
    if (this.state === 'idle' || this.state === 'walking') { this._set('awake'); return true; }
    return false;
  }

  /** The wellhead record it holds, as `world` has it now (the seam hands out fresh copies). */
  _wellIn(W) { return this.well ? W.find((w) => w.id === this.well.id) || null : null; }

  _release(world) {
    if (this.well) { try { world?.unplug?.(this.well.id); } catch { /* the seam's */ } }
    this.well = null; this.stand = null;
  }

  /**
   * Where it stands for wellhead `w` and its heading: the seam's kilnStand (its length along the stand's u), else
   * `standM` from the head on its own side. Of the two headings along the stand it takes the one that turns its
   * coupling's flank (body +x: world (cos h, -sin h)) to the wellhead, so the hose's run is the seam's 3.2 m.
   */
  _standFor(w) {
    const S = w.kilnStand;
    let x, z, h0;
    if (S) {
      // the seam's box puts the body's length along local +x, which goes to world (cos yaw, sin yaw): the Kiln's +z
      x = S.x; z = S.z; h0 = Math.PI / 2 - (S.yaw ?? 0);
    } else {
      const dx = this.x - w.x, dz = this.z - w.z, d = Math.hypot(dx, dz) || 1;
      x = w.x + (dx / d) * KILN_RULES.standM; z = w.z + (dz / d) * KILN_RULES.standM;
      h0 = Math.atan2(dz, -dx);                 // forward (sin h, cos h) square to the line to the head
    }
    const side = (h) => KILN_COUPLING_SIDE * (Math.cos(h) * (w.x - x) - Math.sin(h) * (w.z - z));
    return { x, z, heading: side(h0) >= side(h0 + Math.PI) ? h0 : h0 + Math.PI };
  }

  /** The hose coupling's outer face in the world (where the hose meets the wellhead's). */
  couplingWorld(out) { return bodyToWorld(this.x, this.y, this.z, this.heading, KILN_COUPLING, out); }

  _turnTo(want, dt) {
    let e = want - this.heading; e = Math.atan2(Math.sin(e), Math.cos(e));
    this.heading += Math.max(-KILN_RULES.turnRate * dt, Math.min(KILN_RULES.turnRate * dt, e));
    return Math.abs(e);
  }

  /**
   * Sim time. `world` = { wellheads: [{ id, x, z, state: 'hot' | 'quenched', plugged, kilnStand? }], plugIn?(id, kind),
   * unplug?(id) } (the wellheads seam; without the two calls the records' `plugged` is written here).
   */
  step(dt, world = {}) {
    const R = KILN_RULES;
    this.stateT += dt;
    if (this.staggerT > 0) {
      this.staggerT = Math.max(0, this.staggerT - dt);
      if (this.staggerT === 0) { this.door = 'shut'; this._ev('door-shut'); }
      return;                                  // staggered: it does nothing else (it stays plugged if it was)
    }
    if (this.hotT > 0 && !(this.state === 'coupling' || this.state === 'plugged' || this.state === 'unplugging')) this.hotT = Math.max(0, this.hotT - dt);
    const W = world.wellheads || [];
    const held = this._wellIn(W);
    switch (this.state) {
      case 'idle': {
        const w = chooseWellhead(W, this.x, this.z);
        if (w) { this.well = w; this.stand = this._standFor(w); this._set('walking'); }
        break;
      }
      case 'walking': {
        if (!held || held.state !== 'hot' || held.plugged) { this.well = null; this.stand = null; this._set('idle'); break; }
        const S = this.stand, dx = S.x - this.x, dz = S.z - this.z, d = Math.hypot(dx, dz);
        if (d <= 0.05) { this._set('coupling'); break; }
        const e = this._turnTo(Math.atan2(dx, dz), dt);
        const v = e < 0.6 ? R.walk : R.walk * 0.3;
        const step = Math.min(v * dt, d);
        if (e < 1.2 || d < 0.6) { this.x += (dx / d) * step; this.z += (dz / d) * step; }
        break;
      }
      case 'coupling': {
        if (!held || held.state !== 'hot' || (held.plugged && !this._mine)) { this._mine = false; this._release(world); this.hotT = R.coolS; this._set('idle'); break; }
        // square to the stand, then the hose goes on
        if (this._turnTo(this.stand.heading, dt) > 1e-3) { this.stateT = 0; break; }
        this.heading = this.stand.heading;
        if (this.stateT >= R.coupleS) {
          const took = typeof world.plugIn === 'function' ? world.plugIn(held.id, 'kiln') !== false : (held.plugged = 'kiln', true);
          if (!took) { this._release(world); this._set('idle'); break; }
          this._mine = true; this.plugT = 0; this._set('plugged'); this._ev('plugged', { well: held.id });
        }
        break;
      }
      case 'plugged':
        // it does not turn and does not leave on its own
        this.plugT += dt;
        if (!held || held.state !== 'hot') { this._mine = false; this._release(world); this.hotT = R.coolS; this._ev('unplugged', { why: 'quenched' }); this._set('idle'); }
        break;
      case 'unplugging':
        if (this.stateT >= R.unplugS) {
          if (held && held.plugged && typeof world.unplug !== 'function') held.plugged = null;
          this._mine = false; this._release(world); this.hotT = R.coolS; this._ev('unplugged', { why: 'woken' }); this._set('awake');
        }
        break;
      default: break;                          // 'awake': the fight is the behaviour wave's (the mortar: planVolley)
    }
  }
}

/**
 * IK2's damage half: the live kind's `takeDamage` (its behaviour wave) is this call: the game's own damage path
 * (src/entities/machines/machine.js Machine#takeDamage, through `machine.takeDamage`) with the impact taken at the
 * brain's `damageK()`. The door is a stagger point, never a damage weak point (bible §8.3): its window multiplies
 * nothing, so a hit in the window does exactly what the same hit does out of it.
 */
export function kilnDamage(machine, brain, hit) {
  return machine.takeDamage({ ...hit, impact: (hit?.impact ?? 0) * brain.damageK() });
}

/** A seeded generator (the rows replay; the live kind passes its own). */
export function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/**
 * IK4: one volley from `from` ({x, z}) at `target` ({x, z}). `places` = { dwellings: [{ x, z, r }], people: [{ x, z }] }.
 * `plugged`: a plugged Kiln does not shell. Returns { ok, why, shells: [{ x, z, fireT, warnT, impactT, top }] }.
 */
export function planVolley(from, target, places = {}, rand = Math.random, { plugged = false } = {}) {
  const M = KILN_RULES.mortar, g = KILN_RULES.g;
  const out = { ok: false, why: '', shells: [] };
  out.cue = KILN_CUES.event['held-fire'];
  if (plugged) { out.why = 'plugged in: it must unplug first'; return out; }
  const d = Math.hypot(target.x - from.x, target.z - from.z);
  if (d < M.minR || d > M.maxR) { out.why = `out of band (${d.toFixed(1)} m; ${M.minR}-${M.maxR})`; return out; }
  const rings = places.dwellings || [], people = places.people || [];
  const inRing = (x, z, pad = 0) => rings.find((r) => Math.hypot(x - r.x, z - r.z) < r.r + pad) || null;
  if (inRing(target.x, target.z)) { out.why = 'she is inside a dwelling ring'; return out; }
  const nearPerson = (x, z) => people.some((p) => Math.hypot(x - p.x, z - p.z) < M.personR);
  /** A clear landing near the target: a scatter draw, pushed out of a ring; re-drawn while it is not clear. */
  const landing = () => {
    for (let k = 0; k < M.reaimTries; k++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * M.scatterM;
      let x = target.x + Math.cos(a) * r, z = target.z + Math.sin(a) * r;
      const ring = inRing(x, z, M.ringPadM);
      if (ring) {
        // pushed out past the ring along the line from its centre
        const ux = x - ring.x, uz = z - ring.z, L = Math.hypot(ux, uz) || 1;
        x = ring.x + (ux / L) * (ring.r + M.ringPadM); z = ring.z + (uz / L) * (ring.r + M.ringPadM);
        if (inRing(x, z)) continue;
      }
      if (nearPerson(x, z)) continue;         // never on a person: re-aimed
      return { x, z, tries: k + 1 };
    }
    return null;
  };
  let tries = 0;
  for (let i = 0; i < M.shells; i++) {
    const L = landing();
    if (!L) { out.shells.length = 0; out.why = 'holds fire: a shell cannot land clear of a person or a dwelling ring'; out.held = true; return out; }
    tries += L.tries;
    const { x, z } = L;
    const range = Math.hypot(x - from.x, z - from.z);
    const top = Math.max(M.lobTopMinM, range * M.lobTopK);
    const tUp = Math.sqrt((2 * top) / g), tDown = tUp;   // a lob between grounds of one height (the Yards' apron)
    const fireT = i * M.gapS;
    out.shells.push({ x, z, fireT, warnT: fireT + tUp, impactT: fireT + tUp + tDown, top, lead: tDown });
  }
  out.ok = out.shells.length === M.shells;
  out.cue = KILN_CUES.event.volley;
  out.reaimed = tries - M.shells;
  out.why = `${out.shells.length} shells at ${d.toFixed(1)} m${out.reaimed ? ` (${out.reaimed} re-aimed)` : ''}`;
  return out;
}

/**
 * IK4's warning, per shell at time `t` (the volley's clock): from the top of its lob (`warnT`) to its impact, a shadow
 * on its landing (radius `shadowR0` shrinking to `shadowR1`, darkness 0.35 to 1) and its whistle (cue `kiln/whistle`,
 * ./cues.js). Before the top and after the impact: none. Returns { shadow: { x, z, r, k } | null, whistle }.
 */
export function shellWarning(shell, t) {
  const M = KILN_RULES.mortar;
  if (!shell || t < shell.warnT || t >= shell.impactT) return { shadow: null, whistle: false, cue: null };
  const u = (t - shell.warnT) / Math.max(1e-6, shell.impactT - shell.warnT);
  return { shadow: { x: shell.x, z: shell.z, r: M.shadowR0 + (M.shadowR1 - M.shadowR0) * u, k: 0.35 + 0.65 * u }, whistle: true, cue: KILN_CUES.event.whistle };
}

/** IK3: the Yards' spawns on the site clock. */
export class KilnSpawner {
  constructor() { this.clockH = 0; this.nextH = KILN_RULES.respawnH; this.spawned = 0; }
  /** Advance `hours` of site clock; returns how many Kilns it spawns now. `live` = Kilns alive at the site. */
  step(hours, wellheads, live) {
    this.clockH += hours;
    let n = 0;
    while (this.clockH >= this.nextH) {
      this.nextH += KILN_RULES.respawnH;
      const anyHot = (wellheads || []).some((w) => w.state === 'hot');
      if (anyHot && live + n < KILN_RULES.cap) n++;
    }
    this.spawned += n;
    return n;
  }
}
