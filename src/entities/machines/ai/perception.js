import * as THREE from 'three';
import { perceptionCfg, NOISE } from './tables.js';
import { safeEmit } from './emit.js';
import { aiRandom } from './rng.js';
import { perceptionScale, weatherName } from '../../../instruments/lib/weather.js';

/**
 * Perception — the honest senses of a machine.
 *
 * Closes `machine-ai-03/04/05/06/12`, `stealth-hidden-radius-and-proximity-bubble`,
 * `stealth-omniscient-pursuit`, `stealth-hearing-stimuli`, `machine-ai-19`.
 *
 * What changed from Round 3, in one list:
 *  - detection FILLS over time as `f(1/d^2) * cone * pose * motion` instead of
 *    snapping to 1 the frame you enter the cone;
 *  - the 360-degree `dist < bodyRadius + 4` bubble is GONE. A short peripheral
 *    arc replaces it, and a machine keeps a real blind spot behind it;
 *  - crouching in tall grass collapses sight to ~1.6 m (was 8 m);
 *  - line of sight tests props/rocks/ruins through `ctx.collision.occluded`,
 *    not just the heightfield;
 *  - hearing arrives as STIMULI on a bus (footsteps, impacts, lures), each
 *    carrying its own position — so `lastKnown` is where the NOISE was, never
 *    where the player secretly is;
 *  - an unseen hit plants suspicion at the reconstructed SHOT ORIGIN.
 *
 * Nothing in here ever reads `player.position` to set `lastKnown` unless the
 * player was actually seen this tick. That single rule is the stealth pillar.
 */

const _eye = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _d = new THREE.Vector3();
/** States whose detection build-up a perk may NOT touch (bible §4.7: "hostile unchanged"). */
const HOSTILE_STATES = new Set(['alert', 'attack', 'stagger', 'downed']);

export class Perception {
  constructor(machine) {
    this.m = machine;
    this.cfg = perceptionCfg(machine.kind);
    // through the lane seam (`ai/rng.js`) rather than `Math.random`: the tick
    // PHASE decides which sim step a duel's sightline is sampled on, which is
    // enough to change a fight over broken ground (judge-machine-ai-r2-r1 §2).
    this.acc = aiRandom() * this.cfg.tick;      // stagger the ticks
    this.scanT = aiRandom() * this.cfg.scanPeriod;
    this.scanOffset = 0;
    this.visible = false;
    this.visibleT = 0;          // seconds of continuous sight
    this.lastSeenAt = -999;
    this.lastStimulus = null;   // { x, z, kind, t }
    this.hearAcc = 0;
    this._hearPos = new THREE.Vector3();
    this._hearStrength = 0;
    this._hearKind = null;
    this.omniActive = false;
    this._losT = 0;
    this._losCached = false;
    this._scanEmit = 0;
  }

  /**
   * The sweep is capped at half the focus half-angle: a machine's scan widens
   * where it is looking, it must never swing a target that is DEAD AHEAD out
   * of the cone (that would make detection stutter and `A39`'s 3-4 s curve
   * meaningless).
   */
  _sweepScale() {
    const cap = this.m.sightHalf * 0.5;
    const a = Math.abs(this.cfg.scanSweep) || 1e-6;
    return Math.min(1, cap / a);
  }

  /** Peripheral+focus cone weight for a bearing, 0 when it cannot be seen. */
  _coneWeight(dot, dist, hidden) {
    const c = this.cfg;
    const m = this.m;
    const ms = m.sc;
    // focus cone: the machine's authored sight half-angle, plus the sweep
    const focus = Math.cos(Math.min(Math.PI, m.sightHalf + c.focusPad));
    if (dot >= focus) return 1;
    if (hidden && !c.hiddenPeriph) return 0;
    const range = hidden ? c.hiddenPeriph : c.periphRange;
    if (dist > range) return 0;
    const periph = Math.cos(THREE.MathUtils.degToRad(c.periphDeg));
    if (dot < periph) return 0;               // the blind spot behind it
    return c.periphWeight;
  }

  /** True when the machine's own sensors have an unobstructed line. */
  hasLOS(target) {
    const m = this.m;
    const ms = m.sc;
    const ctx = m.ctx;
    const t = ctx.terrain;
    const y0 = m.position.y + m.eyeHeight;
    const y1 = target.y + this.cfg.targetEyeY;
    for (let i = 1; i <= 3; i++) {
      const k = i / 4;
      const x = m.position.x + (target.x - m.position.x) * k;
      const z = m.position.z + (target.z - m.position.z) * k;
      if (t.getHeight(x, z) > y0 + (y1 - y0) * k + 1.2) return false;
    }
    // machine-ai-04: trunks, big rocks, ruins and tents break the sightline
    const C = ctx.collision;
    _eye.set(m.position.x, y0, m.position.z);
    _tgt.set(target.x, y1, target.z);
    if (C && C.occluded && C.occluded(_eye, _tgt)) return false;
    // a Dust cloud (a Dust Pot, W2) blinds the line as well (bible §5.8 Clouded)
    const H = m.manager?.perception;
    if (H && H.dustBetween(_eye, _tgt)) return false;
    return true;
  }

  /** Motion multiplier from the player's own speed. */
  _motion(p) {
    const c = this.cfg;
    const s = p.moveSpeed ?? 0;
    if (s < 0.5) return c.motionStill;
    if (s < 4.2) return c.motionWalk;
    return c.motionRun;
  }

  /** A stimulus reached this machine (footstep, impact, lure, alarm). */
  hear(x, z, strength, kind) {
    if (strength <= this._hearStrength && this._hearKind !== 'lure') return;
    this._hearPos.set(x, 0, z);
    this._hearStrength = Math.max(this._hearStrength, strength);
    this._hearKind = kind;
  }

  /**
   * `machine-ai-03` — a hit the machine did not see points it at the SHOT
   * ORIGIN with partial suspicion. It never reveals the player's position.
   */
  unseenHit(ox, oz, strengthScale = 1) {
    const c = this.cfg;
    const m = this.m;
    const ms = m.sc;
    const j = c.unseenJitter;
    m.lastKnown.set(
      ox + (aiRandom() - 0.5) * 2 * j, 0,
      oz + (aiRandom() - 0.5) * 2 * j,
    );
    m.lastKnown.y = m.ctx.terrain.getHeight(m.lastKnown.x, m.lastKnown.z);
    ms.suspicion = Math.max(ms.suspicion, c.unseenHit * strengthScale);
    ms._unseenT = 0.001;
    this.lastStimulus = { x: m.lastKnown.x, z: m.lastKnown.z, kind: 'hit' };
  }

  /** Omnidirectional sensor (Thunderjaw radar) — canon, per species. */
  _omni(dist) {
    const o = this.cfg.omni;
    if (!o) return 0;
    if (o.part) {
      let ok = false;
      for (const p of this.m.parts) {
        if (p.name === o.part) { ok = p.attached; break; }
      }
      if (!ok) return 0;
    }
    return dist <= o.radius ? o.weight : 0;
  }

  update(dt) {
    const m = this.m;
    const ms = m.sc;
    const c = this.cfg;
    const p = m.ctx.player;

    // sensor sweep: the cone itself scans while the machine is calm, which is
    // what stops the peripheral arc from being a static bubble
    const calm = m.state === 'patrol' || m.state === 'return' || m.state === 'suspicious';
    this.scanT += dt;
    const want = calm ? Math.sin((this.scanT / c.scanPeriod) * Math.PI * 2) * c.scanSweep : 0;
    this.scanOffset = THREE.MathUtils.damp(this.scanOffset, want, 4, dt);
    ms.scanOffset = this.scanOffset;
    if (calm && !m.lowLOD) {
      this._scanEmit -= dt;
      if (this._scanEmit <= 0) {
        this._scanEmit = c.scanPeriod * 0.5;
        safeEmit(m.ctx, 'machine-scan', { machine: m, sweep: this.scanOffset });
      }
    }

    this.acc += dt;
    if (this.acc < c.tick) return;
    const pd = this.acc;
    this.acc = 0;

    let visible = false;
    let fill = 0;
    let dist = 999;

    if (p && p.health > 0 && m.alive) {
      _d.set(p.position.x - m.position.x, 0, p.position.z - m.position.z);
      dist = Math.sqrt(_d.x * _d.x + _d.z * _d.z);
      ms.playerDist = dist;

      const hidden = !!(p.crouching && p.inTallGrass);
      const omniW = this._omni(dist);
      const ignoreStealth = omniW > 0 && c.omni && c.omni.ignoreStealth;
      /**
       * WEATHER (instruments-core W0b, bible §2.3, `A-perception-weather`):
       * calima and fog banks halve an Instrument's sight range, night is
       * x0.7 — `machines.perception.sightScale`, read once per frame from
       * `environment` (`src/instruments/lib/weather.js`). A darkened lamp
       * (`lampDarkT`, a precise hit on the lamp, bible §7.3) sees nothing.
       */
      const H = m.manager?.perception;
      const blind = (ms.lampDarkT || 0) > 0;
      const maxSee = blind ? 0 : (hidden && !ignoreStealth) ? c.hiddenRange : m.sightRange * (H ? H.sightScale : 1);

      if (dist < maxSee || omniW > 0) {
        let w = 0;
        if (dist < maxSee) {
          const dir = ms.heading + this.scanOffset * this._sweepScale();
          const fx = Math.sin(dir), fz = Math.cos(dir);
          const dot = dist > 0.01 ? (_d.x * fx + _d.z * fz) / dist : 1;
          w = this._coneWeight(dot, dist, hidden && !ignoreStealth);
          /**
           * Engaged contact (see PERCEPTION.engagedRange in ai/tables.js): a
           * machine that is ALREADY in the fight does not lose a player it is
           * grappling with just because its body swung past her. Gated on
           * `attack` state, so it can never START a detection, and still LOS-
           * gated below — the stealth pillar (cone + build-up + occluders +
           * grass) is exactly as it was for every machine that has not yet
           * found her.
           */
          if (m.state === 'attack' && dist <= c.engagedRange) {
            const gw = c.engagedWeight ?? 1;
            if (gw > w) w = gw;
          }
        }
        if (omniW > w && !blind) w = omniW;
        if (w > 0 && this.hasLOS(p.position)) {
          visible = true;
          const pose = p.crouching ? c.poseCrouch : c.poseStand;
          const dd = dist / c.d0;
          fill = (c.gain / (1 + dd * dd)) * w * pose * this._motion(p);
          // perk hook `perception.detectMul` (bible §4.7 "Read as true"):
          // the build-up of a machine that has not yet found her; hostile is unchanged
          if (H && !HOSTILE_STATES.has(m.state)) fill *= H.detectMul;
        }
      }
    }

    if (visible) {
      ms.suspicion = Math.min(1.25, ms.suspicion + fill * pd);
      m.lastKnown.copy(p.position);
      ms._unseenT = 0;
      this.visibleT += pd;
      this.lastSeenAt = ms._stateT;
      this.lastStimulus = null;
    } else {
      this.visibleT = 0;
      ms._unseenT += pd;
      if (this._hearStrength > 0) {
        // hearing raises suspicion toward — but never past — the alert line
        const cap = m.state === 'attack' ? 1.25 : c.hearCap;
        ms.suspicion = Math.min(cap, ms.suspicion + c.hearGain * this._hearStrength * pd);
        if (ms.suspicion < c.alertAt || this._hearKind === 'lure') {
          m.lastKnown.copy(this._hearPos);
          m.lastKnown.y = m.ctx.terrain.getHeight(m.lastKnown.x, m.lastKnown.z);
        }
        this.lastStimulus = { x: this._hearPos.x, z: this._hearPos.z, kind: this._hearKind };
        if (m.state === 'attack') ms._unseenT = Math.min(ms._unseenT, 1.5);
      } else {
        const rate = m.state === 'search' || m.state === 'suspicious' ? c.decay : c.decayCalm;
        ms.suspicion = Math.max(0, ms.suspicion - rate * pd);
      }
    }
    this._hearStrength = 0;
    this._hearKind = null;
    this.visible = visible;
    m._visible = visible;
    ms.detectFill = fill;
  }
}

/** Player locomotion noise profile for the stimulus bus. */
export function playerNoise(p) {
  const n = NOISE.player;
  const s = p.moveSpeed ?? 0;
  if (s < n.minSpeed) return null;
  if (p.crouching) return n.crouch;
  if (s > 7) return n.sprint;
  if (s > 4.2) return n.jog;
  return n.walk;
}

/* ======================================================================= */
/* PERCEPTION HOOKS — the perk + weather + Flag + Dust-sight contract       */
/* ======================================================================= */

/**
 * `ctx.machines.perception` (instruments-core W0b; plan §3.2 "perception.detectMul,
 * perception.flagDuration, stimulus.addNoiseFilter, the perception occlusion flag
 * for Dust-sight outlines"; gates `A-perk-hooks`, `A-perception-weather`).
 *
 * Perks act ONLY through these fields (bible §4.1: armory never edits another
 * system). Consumers: armory W1/W3 (the perks), shell-ui W2 (draws the outline),
 * world-sky W1 (publishes `environment.perceptionScale`), combat-kit W2 (Dust Pots).
 *
 *   perception.detectMul      number, default 1. Multiplies the sight FILL RATE of
 *                             every Instrument that has not yet found her (calm and
 *                             wary states); hostile (alert/attack/stagger/downed)
 *                             is unchanged. "Read as true": 0.5.
 *   perception.flagDuration   seconds, default 8. How long a Flag (a sentry's
 *                             Sightline, bible §7.4) marks her. Read when the Flag
 *                             is raised. "Shrug": 3.
 *   perception.flagRadius     metres, default 60: every Instrument this close to
 *                             the flagging machine searches toward the mark.
 *   perception.flagPlayer(source) -> flag | null
 *                             raise (or refresh) the Flag. Called by `Machine`
 *                             when a machine whose perception row has
 *                             `flags: true` (or `machine.flagsOnSight`) goes alert
 *                             by SIGHT with a lit lamp; a darkened lamp cannot.
 *   perception.flag           { active, source, t0, until, duration, raised, ended }
 *                             (sim seconds on `perception.clock`)
 *   perception.sightScale     the weather x night multiplier on sight range this
 *                             frame (`lib/weather.js` perceptionScale)
 *   perception.weather        the weather name it was read from
 *   perception.addDustCloud({ x, y, z, r, seconds }) -> remover
 *                             a sphere of Dust (a Dust Pot): it blocks every
 *                             Instrument's line of sight through it and marks
 *                             Instruments behind it as dust-occluded
 *   perception.dustBetween(a, b) -> boolean   segment vs every live cloud
 *   perception.dustSight      boolean, default false: the "Dust-sight" perk
 *   machine.dustOccluded      THE OCCLUSION FLAG: true when Dust (a cloud on the
 *                             line from her eye, or calima beyond `calimaClear`
 *                             metres) hides this Instrument from the player.
 *                             Updated at 5 Hz.
 *   perception.outlined(m) -> boolean   dustSight && m.dustOccluded — what the
 *                             Sighting overlay (shell-ui W2) outlines
 *
 * Events: 'flagged' { source, duration } when a Flag is raised, 'flag-ended'
 * { duration, lasted } when it runs out. All per-frame work is allocation-free.
 */
export const FLAG = Object.freeze({ duration: 8, radius: 60 });
/** In calima, Instruments farther than this are behind the dust for the Dust-sight outline. */
export const CALIMA_CLEAR_M = 24;
const DUST_TICK = 0.2;
const _da = new THREE.Vector3();
const _db = new THREE.Vector3();

export class PerceptionHooks {
  constructor(machines) {
    this.machines = machines;
    this.ctx = machines.ctx;
    this.detectMul = 1;
    this.flagDuration = FLAG.duration;
    this.flagRadius = FLAG.radius;
    this.dustSight = false;
    this.calimaClear = CALIMA_CLEAR_M;
    this.sightScale = 1;
    this.weather = 'trade';
    this.clock = 0;
    this.flag = { active: false, source: null, t0: 0, until: 0, duration: 0, raised: 0, ended: 0 };
    this._clouds = [];
    this._dustT = 0;
  }

  /** Raise or refresh the Flag on the player. */
  flagPlayer(source) {
    const p = this.ctx.player;
    if (!p || p.health <= 0) return null;
    if (source && (source.lampDarkT || 0) > 0) return null;   // a dark lamp cannot Flag
    const f = this.flag;
    const d = Math.max(0, +this.flagDuration || 0);
    f.active = d > 0;
    f.source = source || null;
    f.t0 = this.clock;
    f.duration = d;
    f.until = this.clock + d;
    f.raised++;
    this._applyFlag(true);
    safeEmit(this.ctx, 'flagged', { source: f.source, duration: d });
    return f;
  }

  /** Every Instrument within the radius searches toward her while the Flag lasts. */
  _applyFlag(raise) {
    const f = this.flag;
    const p = this.ctx.player;
    const src = f.source;
    const cx = src ? src.position.x : p.position.x;
    const cz = src ? src.position.z : p.position.z;
    const r2 = this.flagRadius * this.flagRadius;
    for (const m of this.machines.list) {
      if (!m.alive || m._disposed || m.docile) continue;
      const dx = m.position.x - cx, dz = m.position.z - cz;
      if (dx * dx + dz * dz > r2) { if (m.flagMark === f) m.flagMark = null; continue; }
      m.flagMark = f;
      m.lastKnown.copy(p.position);
      m._unseenT = Math.min(m._unseenT, 0.001);
      if (raise && (m.state === 'patrol' || m.state === 'return' || m.state === 'suspicious')) {
        m.suspicion = Math.max(m.suspicion, m.perceptCfg?.susEnter ?? 0.5);
        m.ai?.beginSearch(true);
        m.setState('search');
      }
    }
  }

  _endFlag() {
    const f = this.flag;
    f.active = false;
    f.ended++;
    for (const m of this.machines.list) if (m.flagMark === f) m.flagMark = null;
    safeEmit(this.ctx, 'flag-ended', { duration: f.duration, lasted: +(this.clock - f.t0).toFixed(3) });
  }

  addDustCloud({ x = 0, y = 0, z = 0, r = 3, seconds = 10 } = {}) {
    const c = { x, y, z, r, until: this.clock + seconds };
    this._clouds.push(c);
    return () => { const i = this._clouds.indexOf(c); if (i >= 0) this._clouds.splice(i, 1); };
  }

  /** Does the segment a -> b pass through a live Dust cloud? */
  dustBetween(a, b) {
    const cl = this._clouds;
    if (!cl.length) return false;
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const L2 = abx * abx + aby * aby + abz * abz || 1e-9;
    for (let i = 0; i < cl.length; i++) {
      const c = cl[i];
      let t = ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = a.x + abx * t - c.x, dy = a.y + aby * t - c.y, dz = a.z + abz * t - c.z;
      if (dx * dx + dy * dy + dz * dz < c.r * c.r) return true;
    }
    return false;
  }

  outlined(m) { return !!(this.dustSight && m && m.dustOccluded); }

  _dustPass() {
    const p = this.ctx.player;
    if (!p) return;
    const calima = this.weather === 'calima';
    _da.set(p.position.x, p.position.y + 1.6, p.position.z);
    const c2 = this.calimaClear * this.calimaClear;
    for (const m of this.machines.list) {
      if (m._disposed) continue;
      _db.set(m.position.x, m.position.y + (m.height || 2) * 0.6, m.position.z);
      const dx = _db.x - _da.x, dz = _db.z - _da.z;
      m.dustOccluded = (calima && dx * dx + dz * dz > c2) || this.dustBetween(_da, _db);
    }
  }

  /** Once per sim step, from `Machines.update`. */
  update(dt) {
    this.clock += dt;
    const env = this.ctx.environment;
    this.sightScale = perceptionScale(env);
    this.weather = weatherName(env);
    const cl = this._clouds;
    for (let i = cl.length - 1; i >= 0; i--) if (cl[i].until <= this.clock) cl.splice(i, 1);
    const f = this.flag;
    if (f.active) {
      if (this.clock >= f.until - 1e-6) this._endFlag();
      else this._applyFlag(false);
    }
    this._dustT -= dt;
    if (this._dustT <= 0) { this._dustT = DUST_TICK; this._dustPass(); }
  }

  /** Gate/debug: one line of state. */
  audit() {
    const f = this.flag;
    return {
      detectMul: this.detectMul, flagDuration: this.flagDuration, dustSight: this.dustSight,
      sightScale: +this.sightScale.toFixed(3), weather: this.weather, clouds: this._clouds.length,
      flag: { active: f.active, raised: f.raised, ended: f.ended, duration: f.duration,
        age: f.active ? +(this.clock - f.t0).toFixed(3) : null },
      flagged: this.machines.list.filter((m) => m.flagMark === f).length,
    };
  }
}
