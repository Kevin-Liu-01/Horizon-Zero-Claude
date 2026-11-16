/**
 * HIT FEEL (BUILD M1.3e): what a landed hit does to the world for the next fraction of a second. Combat-owned; one
 * instance (`combat.hitFeel`), fed by `combat.impactFeedback` (arrows, traps and the lance all come through it).
 *
 *   FREEZE   the hit-stop, capped: at most HS.cap (100 ms asked, under 120 held) for one hit and HS.window (180 ms)
 *            of freeze in any 1 s.
 *            ONE budget for every source: the lance's ring (melee.js `_hsS` / `_hsE`, P-05) is the ledger, and an
 *            arrow's freeze is cut to what the last second left and written into the same ring, so the lance's own
 *            `_hitstopFor` sees it. The freeze itself is `engine.requestTimeScale('hitstop', 0.03)`, released by
 *            combat's real-clock deadline (`_hsEnd`), as before.
 *   KICK     the struck body jolts AWAY from the blow: the gait's flinch channel (gait.js `pose.hit` / `pose.hitDir`:
 *            pitch and roll over the spine chain, decaying at 6.5/s), on every hit and not only above 4 % of its
 *            health (machine-ai's flinch threshold, whose event nothing consumed). The amount is KICK.min (a plink)
 *            up to 1 with the share of health the hit took; the direction is the blow's own (the arrow's flight, the
 *            lance from her chest to the point) in the body's frame.
 *            Fix round 1: and the whole rig ROCKS away from the blow about its feet (the rig root, which nothing else
 *            writes: KICK.tiltDeg x the amount, more on a short body, up in KICK.rise and back at KICK.decay/s on the real
 *            clock, so it is settled inside 0.4 s; the legs' IK keeps the feet planted). The gait's channel alone did
 *            not move a struck part for a blow from the front: its pitch away from the blow (-0.38 x the amount at the
 *            head) and its wince (the head's droop, +0.35 x the amount) cancel there, and at bab1f0c the row's struck
 *            part moved less in 80 ms than its own idle fidget did in 0.4 s.
 *   PUNCH    the lens widens by at most FOV.max (1.6 deg) and comes back: up in FOV.rise, back over FOV.fall (real
 *            time, so the freeze cannot hold it). Folded into combat's aim FOV ease as an offset (`fovPunch`).
 *   FLASH    the hull's warm flash (`machine.flashPart`, instruments' lib/hull.js), which shows for at most three
 *            rendered frames. The lance flashes its own hit (melee.js), so a lance hit is not flashed twice.
 *   LIGHT    the environment's pooled impact light (`environment.borrowLight`, eyeLights[1]: the light count never
 *            changes, 0 recompiles), set 0.35 m off the struck surface along its normal, warm, falling to 0 over
 *            LIGHT.ms of real time.
 *
 * `last` keeps the numbers of the newest hit and `freezes` the newest freezes (start, end, asked, given) for the
 * gate row (tools/gates/systems/kit-probe-page.mjs, hit-feel). Allocation-free per hit except the light's lease.
 */
import * as THREE from 'three';

// cap: what one hit may ask (s); it is released by the first frame past its end, so it is held up to a frame longer:
// 0.100 + a 16.7 ms frame stays under the 120 ms bar
export const HS = Object.freeze({ cap: 0.100, window: 0.180, min: 0.020, late: 0.007, slack: 0.016, scale: 0.03 });
export const KICK = Object.freeze({ min: 0.3, perShare: 2.2, tiltDeg: 3, refH: 2.5, rise: 0.03, decay: 10, life: 0.7 });
export const FOV = Object.freeze({ max: 1.6, base: 0.6, perK: 1.4, rise: 0.035, fall: 0.2 });
export const LIGHT = Object.freeze({ ms: 110, base: 14, perK: 26, off: 0.35, color: '#FFB070', distance: 6 });

const _d = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _UP = new THREE.Vector3(0, 1, 0);

export class HitFeel {
  constructor(ctx, combat) {
    this.ctx = ctx;
    this.combat = combat;
    this._pT = -1e9;        // the punch's start (s, performance clock)
    this._pA = 0;           // its peak (deg)
    this._light = null;
    this._lT = -1e9;
    this._lI = 0;
    this.last = null;
    this.freezes = [];
    this._rocks = [];       // { m, node, base (quaternion), axis (node's parent frame), amp (rad), t0 }
  }

  /** The rig rocks away from the blow (see KICK): `dirW` the blow's horizontal direction in the world, `kick` 0..1. */
  _rock(m, dirW, kick, now) {
    const node = m?.rig?.root, par = node?.parent;
    if (!node || !par) return;
    // the tilt's axis: up x the blow, so the top moves along the blow; in the parent's frame
    _ax.crossVectors(_UP, dirW);
    if (_ax.lengthSq() < 1e-10) return;
    _ax.normalize();
    par.getWorldQuaternion(_q).invert();
    _ax.applyQuaternion(_q);
    const h = Math.max(0.5, m.height ?? KICK.refH);
    const amp = THREE.MathUtils.degToRad(KICK.tiltDeg) * kick * Math.max(1, KICK.refH / h);
    let r = null;
    for (const x of this._rocks) if (x.m === m) { r = x; break; }
    if (!r) { r = { m, node, base: node.quaternion.clone(), axis: new THREE.Vector3(), amp: 0, t0: 0 }; this._rocks.push(r); }
    r.axis.copy(_ax);
    r.amp = amp;
    r.t0 = now;
  }

  _updateRocks(now) {
    const R = this._rocks;
    for (let i = R.length - 1; i >= 0; i--) {
      const r = R[i], t = now - r.t0;
      if (r.m.alive === false || r.m._disposed || t >= KICK.life || !r.node.parent) {
        if (r.node.parent) r.node.quaternion.copy(r.base);
        R.splice(i, 1);
        continue;
      }
      const a = t < KICK.rise ? Math.sin((t / KICK.rise) * Math.PI / 2) : Math.exp(-(t - KICK.rise) * KICK.decay);
      _q.setFromAxisAngle(r.axis, r.amp * a);
      r.node.quaternion.copy(r.base).premultiply(_q);
    }
  }

  /** What the last second's freezes leave (s), counted on the lance's ring (see the header). */
  freezeLeft(now) {
    const m = this.combat.melee;
    if (!m?._hsS) return HS.window;
    const from = now - 1;
    let used = 0;
    for (let i = 0; i < 8; i++) {
      const a = m._hsS[i] > from ? m._hsS[i] : from;
      const b = m._hsE[i] < now ? m._hsE[i] : now;
      if (b > a) used += b - a + HS.slack;
    }
    return HS.window - used - HS.slack;
  }

  /** Freeze the world for `dur` s (cut to the cap and to the 1 s budget); returns what was given (0: none). */
  freeze(dur) {
    const c = this.combat, e = this.ctx.engine;
    if (!e?.requestTimeScale) return 0;
    const now = performance.now() / 1000;
    const asked = dur;
    if (dur > HS.cap) dur = HS.cap;
    const left = this.freezeLeft(now);
    if (dur > left) dur = left;
    if (!(dur >= HS.min)) { this._note(now, now, asked, 0); return 0; }
    let end = now + dur - HS.late;
    if (c._hsActive && c._hsEnd > end) end = c._hsEnd;   // a freeze already running past it is kept
    const m = c.melee;
    if (m?._hsS) {
      const j = (m._hsI + 7) & 7;
      if (m._hsE[j] > now) m._hsE[j] = now;   // the running one is cut where this starts (the ring never counts twice)
      m._hsS[m._hsI] = now;
      m._hsE[m._hsI] = end;
      m._hsI = (m._hsI + 1) & 7;
    }
    e.requestTimeScale('hitstop', HS.scale);
    c._hsActive = true;
    c._hsEnd = end;
    this._note(now, end, asked, dur);
    return dur;
  }

  _note(s, e, asked, given) {
    const f = this.freezes;
    if (f.length >= 16) f.shift();
    f.push({ s, e, asked, given });
  }

  /**
   * One landed hit. o = { machine, point, normal, dir?, object?, k (0..1 of the target this hit took), share (damage
   * / max health), melee (the lance: it flashes and freezes its own hit) }.
   */
  hit(o) {
    const m = o.machine, now = performance.now() / 1000;
    const k = Math.min(1, Math.max(0, o.k ?? 0));
    let kick = 0, hitDir = 0;
    /* KICK: the blow's direction in the body's frame (gait.js: pitch cos(hitDir), roll sin(hitDir); a blow from the
     * front, travelling against the heading, lifts the nose, one from her left rolls it to its right) */
    const pose = m?.gait?.pose;
    if (pose && m.alive !== false && o.point) {
      if (o.dir) _d.set(o.dir.x, 0, o.dir.z);
      else {
        const p = this.ctx.player?.position;
        _d.set(o.point.x - (p ? p.x : m.position.x), 0, o.point.z - (p ? p.z : m.position.z));
      }
      if (_d.lengthSq() > 1e-8) {
        const h = m.sc?.heading ?? m.heading ?? 0;
        hitDir = h - Math.atan2(_d.x, _d.z);
        kick = Math.min(1, KICK.min + KICK.perShare * Math.max(0, o.share ?? 0));
        if (kick > (pose.hit || 0)) { pose.hit = kick; pose.hitDir = hitDir; }
        this._rock(m, _d.normalize(), kick, now);
      }
    }
    /* PUNCH */
    const a = Math.min(FOV.max, FOV.base + FOV.perK * k);
    if (now - this._pT > FOV.rise || a > this._pA) { this._pT = now; this._pA = a; }
    /* FLASH (the lance flashes its own) */
    let flash = false;
    if (!o.melee && m && typeof m.flashPart === 'function') flash = !!m.flashPart(o.object ?? null, 0.6 + 0.4 * k);
    /* LIGHT */
    const env = this.ctx.environment;
    let lit = false;
    if (env?.borrowLight && o.point) {
      const l = env.borrowLight(LIGHT.ms);
      if (l) {
        const n = o.normal;
        l.position.set(o.point.x + (n ? n.x : 0) * LIGHT.off, o.point.y + (n ? n.y : 1) * LIGHT.off, o.point.z + (n ? n.z : 0) * LIGHT.off);
        l.color.set(LIGHT.color);
        l.distance = LIGHT.distance;
        l.decay = 2;
        this._lI = LIGHT.base + LIGHT.perK * k;
        l.intensity = this._lI;
        this._light = l;
        this._lT = now;
        lit = true;
      }
    }
    this.last = { t: now, kind: m?.kind ?? null, kick, hitDir, punchDeg: a, flash, light: lit, k };
  }

  /** The lens's punch now (deg). */
  fovPunch(now) {
    const t = now - this._pT;
    if (t < 0 || t >= FOV.rise + FOV.fall) return 0;
    if (t < FOV.rise) return this._pA * Math.sin((t / FOV.rise) * Math.PI / 2);
    const u = (t - FOV.rise) / FOV.fall;
    return this._pA * (1 - u * u * (3 - 2 * u));
  }

  /** Per frame (combat.update, real clock): the impact light falls to 0 and is let go. */
  update(now) {
    if (this._rocks.length) this._updateRocks(now);
    const l = this._light;
    if (!l) return;
    const u = (now - this._lT) / (LIGHT.ms / 1000);
    if (u >= 1) { l.intensity = 0; this._light = null; return; }
    const f = 1 - u;
    l.intensity = this._lI * f * f;
  }

  dispose() {
    for (const r of this._rocks) if (r.node.parent) r.node.quaternion.copy(r.base);
    this._rocks.length = 0;
    if (this._light) { this._light.intensity = 0; this._light = null; }
  }
}
