import { SONDE_ROSTER, SONDE_KEEL, SONDE_POST } from './form.js';
import { SONDE_CUES } from './cues.js';

/**
 * THE SONDE'S RULES (M3 wave 1, area C; bible §7.4 #8; row IK7 of the M3 brief). Simulation time, no scene: the Node
 * rows (tools/gates/instruments/m3/sonde.test.mjs) and the live kind run the same code. Numbers marked * are starting
 * values.
 *
 * MOORED. It holds within `tetherM` (18 m) of its post, measured as the tether runs: from the shackle on the post's top
 * to the keel ring under the gondola. The envelope's lift keeps the tether TAUT (judge, d695cc9: a 16 m run drawn
 * straight on an 18 m tether left 2 m of slack unaccounted): its keel rides the sphere of `tautM` round the shackle,
 * straight up in still air and blown down toward `minAltM` over the shackle as the wind reaches `leanMps`, its fans
 * holding its place at `fanMps` and its nose into the wind (`heading`); the tether never stretches (a pull past 18 m
 * is taken back to 18). In calima its gondola winch reels the tether in to `calimaAltM` (6 m), still taut, and it
 * hunts by sound (the behaviour wave's).
 * BROUGHT DOWN. Three punctures of the envelope, or Cinder on it (it burns), bring it down at `fallMps`. A net that
 * fouls its fans sinks it: it reaches the ground `fanSinkS` (6 s) after the foul.
 * CUT LOOSE. A cut tether sets it adrift: it goes with the wind (downwind, `driftK` of the wind's speed) and sinks at
 * `adriftSinkMps`, so it crashes inside `crashMaxS` (60 s) on its bearing (IK7: within 10 deg of the wind's).
 * THE FLARE. At night a flare Flags her (bible §15: every Instrument within 60 m knows her position for 8 s); by day it
 * drops none.
 * HER KITE. It sees her at double range while she glides (the flight seam of M3 briefs §3.2: `player.flight`).
 *
 * The wind is the wind seam's (M3 briefs §3.2; sky-look's `windAt`): { speed m/s, fromDeg } with fromDeg the compass
 * bearing it blows FROM (the trade: from 045). World axes: x = east, z = -north.
 * @typedef {'none' | 'opening' | 'gliding' | 'folding' | 'landing'} FlightState
 * @typedef {{ speed: number, fromDeg: number }} Wind
 */

export const SONDE_RULES = Object.freeze({
  tetherM: SONDE_ROSTER.tetherM,
  tautM: SONDE_ROSTER.tetherM - 0.05,   // the run it holds: the tether taut, 5 cm short of its length
  minAltM: 10,                  // * the keel over the shackle when blown down at `leanMps` or more
  calimaAltM: 6,                // IK7* (the keel over the shackle; the winch reels the line in, still taut)
  fanMps: 2.0,                  // * how fast its fans move it to its moored place
  leanMps: 8,                   // * wind speed at which it is blown down to minAltM
  punctures: 3,
  fallMps: 4.0,                 // * brought down
  fanSinkS: 6,                  // IK7*
  driftK: 0.9,                  // * of the wind's speed, adrift
  adriftSinkMps: 0.35,          // *
  crashMaxS: 60,                // IK7*
  sightM: 40,                   // * its sight range, on foot
  kiteRangeK: 2,                // bible: it sees a kite-flying Brea at double range
  flareFlagS: 8,                // bible §15 Flagged
});

/** The unit vector (x, z) the wind blows TOWARD. */
export function downwind(wind) {
  const b = ((wind?.fromDeg ?? 45) + 180) * Math.PI / 180;
  return { x: Math.sin(b), z: -Math.cos(b) };
}

/** Compass bearing (deg, 0..360) of the offset (dx, dz). */
export const bearingOf = (dx, dz) => ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360;

/**
 * Where it moors for a wind (the keel's offset from the shackle: up, and downwind) on its taut tether. Still air: straight
 * up at `tautM`; at `leanMps` and over: blown down to `minAltM`. In calima: the line reeled in to `calimaAltM` up.
 */
export function mooredOffset(wind, calima = false) {
  const R = SONDE_RULES, k = Math.min(1, (wind?.speed ?? 0) / R.leanMps);
  if (calima) { const lean = R.calimaAltM * 0.5 * k; return { alt: R.calimaAltM, lean, lineM: Math.hypot(R.calimaAltM, lean) }; }
  const lean = Math.sqrt(R.tautM ** 2 - R.minAltM ** 2) * k;
  return { alt: Math.sqrt(R.tautM ** 2 - lean ** 2), lean, lineM: R.tautM };
}

/** The Sonde's sight range given her flight state (IK7 and the flight seam: double while she glides). */
export function sondeSightM(flight, base = SONDE_RULES.sightM) {
  return flight === 'gliding' ? base * SONDE_RULES.kiteRangeK : base;
}

export class SondeBrain {
  /** `post` { x, y, z }: the anchor post's foot. It starts moored over the post at its hover height. */
  constructor({ post = { x: 0, y: 0, z: 0 } } = {}) {
    this.post = { ...post };
    /** yaw (0 faces +z; the page's rotation.y): its nose into the wind, so the keel ring leads toward the post */
    this.heading = 0;
    this.x = post.x; this.z = post.z; this.y = post.y + SONDE_POST.h + SONDE_RULES.tautM - SONDE_KEEL[1];
    /** 'moored' | 'adrift' | 'sinking' | 'falling' | 'down' */
    this.state = 'moored';
    this.tethered = true;
    this.punctures = 0;
    this.fouled = false;
    this.t = 0; this.downAt = null; this.cutAt = null; this.fouledAt = null; this._sinkMps = 0;
    this.events = [];
  }

  /** Every event carries its cue id (./cues.js: the Cues seam; IK8), and every state change is an event. */
  _ev(type, p) { this.events.push({ type, ...(p || {}), cue: SONDE_CUES.event[type] ?? null }); }
  _set(s) { if (s === this.state) return; this.events.push({ type: 'state', from: this.state, to: s, cue: SONDE_CUES.state[s] ?? null }); this.state = s; }
  get flying() { return this.state !== 'down'; }
  /** The tether's two ends: the shackle on the post's top and the keel ring (the hull's y is its lowest point). */
  shackle() { return { x: this.post.x, y: this.post.y + SONDE_POST.h, z: this.post.z }; }
  keelY() { return this.y + SONDE_KEEL[1]; }
  /** The keel ring in the world (the tether's hull end), at its heading: the body frame of ./form.js turned by yaw. */
  keel(out = { x: 0, y: 0, z: 0 }) {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    out.x = this.x + SONDE_KEEL[0] * c + SONDE_KEEL[2] * s; out.y = this.y + SONDE_KEEL[1]; out.z = this.z - SONDE_KEEL[0] * s + SONDE_KEEL[2] * c;
    return out;
  }
  /** The tether's run, shackle to keel ring (m): a taut tether is drawn straight between these two points. */
  tetherDist() { const s = this.shackle(), k = this.keel(); return Math.hypot(k.x - s.x, k.y - s.y, k.z - s.z); }

  cutTether() { if (!this.tethered || !this.flying) return false; this.tethered = false; this.cutAt = this.t; if (this.state === 'moored') this._set('adrift'); this._ev('tether-cut'); return true; }

  puncture() {
    if (!this.flying) return false;
    this.punctures++;
    this._ev('puncture', { n: this.punctures });
    if (this.punctures >= SONDE_RULES.punctures) this._fall('punctured');
    return true;
  }

  cinder() { if (!this.flying) return false; this._fall('burning'); return true; }

  /** A net fouls its fans: it sinks and reaches the ground `fanSinkS` after (from wherever it is). */
  foulFans(groundY) {
    if (!this.flying || this.fouled) return false;
    this.fouled = true; this.fouledAt = this.t;
    if (this.state !== 'falling') { this._set('sinking'); this._sinkMps = Math.max(0.01, (this.y - (groundY ?? this.post.y)) / SONDE_RULES.fanSinkS); }
    this._ev('fans-fouled');
    return true;
  }

  _fall(why) { this._set('falling'); this._ev('brought-down', { why }); }

  /** At night it drops a flare that Flags her for `flareFlagS`; by day none. Returns { flagS } or null. */
  flare(env = {}) {
    if (!env.night || !this.flying || this.state === 'falling' || this.state === 'sinking') return null;
    this._ev('flare');
    return { flagS: SONDE_RULES.flareFlagS };
  }

  /** Sim time. env = { wind: Wind, calima: bool, groundY: (x, z) => y }. */
  step(dt, env = {}) {
    const R = SONDE_RULES, gy = env.groundY || (() => this.post.y);
    this.t += dt;
    if (this.state === 'down') return;
    const dw = downwind(env.wind), ws = env.wind?.speed ?? 0;
    if (ws > 0.05) this.heading = Math.atan2(-dw.x, -dw.z);   // nose into the wind
    if (this.state === 'moored') {
      // where its keel rides on the taut tether, and the hull's origin from that (the keel ring leads by its offset)
      const m = mooredOffset(env.wind, !!env.calima), s0 = Math.sin(this.heading), c0 = Math.cos(this.heading);
      const kx = this.post.x + dw.x * m.lean, kz = this.post.z + dw.z * m.lean, ky = this.post.y + SONDE_POST.h + m.alt;
      const tx = kx - (SONDE_KEEL[0] * c0 + SONDE_KEEL[2] * s0), tz = kz - (-SONDE_KEEL[0] * s0 + SONDE_KEEL[2] * c0), ty = ky - SONDE_KEEL[1];
      const dx = tx - this.x, dy = ty - this.y, dz = tz - this.z, d = Math.hypot(dx, dy, dz);
      if (d > 1e-6) { const s = Math.min(d, R.fanMps * dt); this.x += (dx / d) * s; this.y += (dy / d) * s; this.z += (dz / d) * s; }
    } else if (this.state === 'adrift') {
      this.x += dw.x * ws * R.driftK * dt; this.z += dw.z * ws * R.driftK * dt;
      this.y -= R.adriftSinkMps * dt;
    } else if (this.state === 'sinking') {
      if (!this.tethered) { this.x += dw.x * ws * R.driftK * dt; this.z += dw.z * ws * R.driftK * dt; }
      this.y -= this._sinkMps * dt;
    } else if (this.state === 'falling') {
      if (!this.tethered) { this.x += dw.x * ws * R.driftK * 0.5 * dt; this.z += dw.z * ws * R.driftK * 0.5 * dt; }
      this.y -= R.fallMps * dt;
    }
    // the tether never stretches past its length: the keel is taken back onto the 18 m sphere, the hull with it
    if (this.tethered) {
      const d = this.tetherDist();
      if (d > R.tetherM) {
        const s = this.shackle(), kp = this.keel(), k = R.tetherM / d;
        this.x += (s.x + (kp.x - s.x) * k) - kp.x; this.y += (s.y + (kp.y - s.y) * k) - kp.y; this.z += (s.z + (kp.z - s.z) * k) - kp.z;
      }
    }
    const g = gy(this.x, this.z);
    if (this.y <= g + 1e-6) { this.y = g; this._set('down'); this.downAt = this.t; this._ev('down', { at: { x: this.x, z: this.z } }); }
  }
}
