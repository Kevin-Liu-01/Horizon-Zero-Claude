/**
 * THE SLICE COMBAT KIT (BUILD M1.6j; BIBLE §7.3, §7.4, §8.2, §8.3, §9.7). Rules only: no DOM, no THREE, no ctx. The
 * live halves are combat.js (the damage words on an arrow, Steady and the bow's sway), melee.js (Pry with the lance,
 * Undercut, the Felling blow) and the Alidade's take-a-bearing (src/ui/sighting.js). node --test walks this file
 * (tools/gates/systems/kit.test.mjs); the page rows are tools/gates/systems/kit-probe-page.mjs.
 *
 * THE TWO DAMAGE WORDS (bible §8.3: "Player damage words: Blunt and Pry").
 *   Blunt   the Reed arrow: body damage; it never takes a tool off (0 tear on any part).
 *   Pry     the Barbed arrow and the lance's Pry (E on a downed Instrument): tears tools off; on a DOWN Instrument
 *           (a toppled Plumb, any kind in its downed window) the tool it strikes comes off in one hit.
 *
 * STEADY (bible §8.3, §8.4 "Bow numbers"): a breath-hold armed by a fresh press of Shift while aiming. Sway is exactly 0
 * for 4 s, then 2 s of shake, then the breath is out. Innate, no cooldown (a fresh press while aiming always arms a
 * full breath), and NO SLOW MOTION (the world runs at 1.0 throughout; the Round-4 Concentration slowed it to 0.35).
 *
 * THE SWAY. While she aims, the bow breathes: the shot leaves the nock turned by the sway (yaw, pitch) off the line
 * the hairs hold. A slow breath (BREATH, two incommensurate sines), a tremble that grows after 3 s at full draw, and
 * Steady's shake. The sway turns only the shot the player looses (combat.js `_fire` from the draw-and-release path);
 * a row that fires `_fire()` directly is not turned.
 *
 * WEAK-POINT RULES for the slice's three kinds (bible §7.4). The instruments lane built the parts; the rules read:
 *   Peg    the lamp: any hit kills (kinds/peg.js, mult 8).
 *   Plumb  the level vial: two hits and it topples for 4 s (kinds/plumb.js TOPPLE); the lamp drum: a precise hit
 *          darkens it 6 s (machine.js LAMP_DARK_S); the bob: Pry on the toppled Plumb removes it in one hit (here).
 *   Gauge  a ballast tank: a hit punctures it and the Gauge lists, -40 % speed (here, the first puncture only);
 *          the four knee seals are precision's (the Sighting Bow, not in the slice).
 */

/** The damage word of each ammo the slice carries (the rest keep their Round-4 channels). */
export const WORDS = Object.freeze({ hunter: 'blunt', hardpoint: 'pry', precision: 'blunt' });

export const wordOf = (ammoId) => WORDS[ammoId] ?? null;

/** Steady: 4 s of no sway, then 2 s of shake (bible). */
export const STEADY = Object.freeze({ holdS: 4, shakeS: 2, refillS: 1.5 });

/**
 * The bow's sway while aiming (degrees, the angle the shot leaves the hairs by).
 *   breath   the resting breath: pitch and yaw sines (periods 3.7 s and 5.3 s)
 *   tremble  added after `trembleAt` s at full draw, reaching its amplitude `trembleRamp` s later
 *   shake    Steady's last 2 s
 */
export const SWAY = Object.freeze({
  breathPitchDeg: 0.32, breathYawDeg: 0.22, breathPitchS: 3.7, breathYawS: 5.3,
  trembleAt: 3, trembleRamp: 1.6, trembleDeg: 0.25, trembleHz: 7.3,
  shakeDeg: 0.6, shakeHz: 9.1,
});

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Steady's phase at `t` s since it was armed: 'hold' (sway 0), 'shake', or 'out'. */
export function steadyPhase(t) {
  if (!(t >= 0)) return 'out';
  if (t < STEADY.holdS) return 'hold';
  if (t < STEADY.holdS + STEADY.shakeS) return 'shake';
  return 'out';
}

/**
 * The sway (radians) at clock `t`. `s`: { aiming, holdFull (s at full draw), steadyT (s since Steady armed, or -1) }.
 * Writes `out.yaw`, `out.pitch`, `out.deg` (the angle) and returns `out`. Exactly 0 in Steady's hold.
 */
export function swayAt(t, s, out = { yaw: 0, pitch: 0, deg: 0 }) {
  out.yaw = 0; out.pitch = 0; out.deg = 0;
  if (!s || !s.aiming) return out;
  const st = s.steadyT ?? -1;
  const ph = st >= 0 ? steadyPhase(st) : 'out';
  if (ph === 'hold') return out;
  let p, y;
  if (ph === 'shake') {
    // the breath let go: a fast shake that grows over the first half second
    const k = ss(0, 0.5, st - STEADY.holdS) * SWAY.shakeDeg;
    p = k * Math.sin(TAU * SWAY.shakeHz * t) * 0.8;
    y = k * Math.sin(TAU * SWAY.shakeHz * 1.37 * t + 0.9) * 0.6;
  } else {
    p = SWAY.breathPitchDeg * Math.sin(TAU * t / SWAY.breathPitchS + 0.4);
    y = SWAY.breathYawDeg * Math.sin(TAU * t / SWAY.breathYawS + 1.3);
    const tr = ss(SWAY.trembleAt, SWAY.trembleAt + SWAY.trembleRamp, s.holdFull ?? 0) * SWAY.trembleDeg;
    if (tr > 0) { p += tr * Math.sin(TAU * SWAY.trembleHz * t); y += tr * 0.7 * Math.sin(TAU * SWAY.trembleHz * 1.21 * t + 2.1); }
  }
  out.pitch = p * DEG;
  out.yaw = y * DEG;
  out.deg = Math.hypot(p, y);
  return out;
}

/**
 * Steady as a small state machine (combat.js holds one; the Node rows drive one).
 *   step(dt, { aiming, shiftDown, playing }) -> this
 * `active`, `t` (s since armed), `phase`, `gauge` (1 -> 0 over the 6 s; the HUD's breath meter reads it).
 * Arms only on a Shift PRESS that happens while she is already aiming (A53: a Shift held from a sprint has no edge).
 */
export class Steady {
  constructor() { this.active = false; this.gauge = 1; this.t = -1; this.phase = 'out'; this._prev = false; this.arms = 0; }

  step(dt, { aiming = false, shiftDown = false, playing = true } = {}) {
    const edge = shiftDown && !this._prev;
    this._prev = shiftDown;
    const len = STEADY.holdS + STEADY.shakeS;
    if (edge && playing && aiming) {
      // no cooldown: a fresh press while aiming is a fresh breath
      this.active = true; this.t = 0; this.gauge = 1; this.arms++;
      this.phase = 'hold';
      return this;
    }
    if (this.active) {
      this.t += dt;
      this.gauge = Math.max(0, 1 - this.t / len);
      this.phase = steadyPhase(this.t);
      if (!(playing && aiming && shiftDown) || this.phase === 'out') {
        this.active = false;
        this.phase = 'out';
      }
      return this;
    }
    this.t = -1;
    this.gauge = Math.min(1, this.gauge + dt / STEADY.refillS);
    return this;
  }
}

/* ------------------------------------------------------------ the words */

/** Is the Instrument down (a toppled Plumb, or any kind in its downed window)? */
export function isDown(m) {
  if (!m || m.alive === false) return false;
  if (typeof m._toppleT === 'number' && m._toppleT >= 0) return true;
  const r = m.ai?.reactions;
  return !!(r && r.downedT > 0);
}

/**
 * The tear an arrow's word puts on the part it struck.
 *   Blunt: 0 on every part.
 *   Pry:   the part's whole remaining tear on a down Instrument (one hit), else the ammo's own tear.
 * `baseTear` is the ammo's tear already scaled by draw. Unknown words keep `baseTear`.
 */
export function tearFor(word, m, part, baseTear) {
  if (word === 'blunt') return 0;
  if (word === 'pry' && part && part.tearable && part.attached !== false && Number.isFinite(part.tearHp) && isDown(m)) {
    return Math.max(baseTear, part.tearHp + 1);
  }
  return baseTear;
}

/**
 * The bible's small class (§7.4 roster): an Undercut kills it outright. Read from the kind's DECLARED size class
 * (src/instruments/lib/sizeclass.js, on the kind's class), not from a list kept here: at 1d2de89 this was the
 * literal ['peg', 'plumb'], which a new small kind would have had to be added to by hand.
 */
export const isSmallKind = (m) => (m?.sizeClass ?? m?.constructor?.sizeClass ?? null) === 'small';

/** The lance's Pry (E on a down Instrument's tool): one hit takes the tool, and a little body damage. */
export const LANCE_PRY = Object.freeze({ reach: 3.2, hold: 0.3, impact: 12, label: 'PRY' });

/** A tool the lance can Pry from where she stands: the nearest attached tearable part within `reach` of `pos`. */
/**
 * M1b: the tool a kind's Pry goes for first (bible 11.2: "Pry the bob while it is down"): its score is halved. At
 * 6dda887 and bab1f0c the kit's lance-pry row stood her 1.7 m from a toppled Plumb's bob, facing it, and PRY took the
 * lamp drum, which lies beside the bob's line on the ground (the slice's pry stage waits for the bob only).
 */
export const PRY_FIRST = Object.freeze({ plumb: 'bob' });
const PRY_FIRST_K = 0.5;

export function pryablePart(m, pos, worldOf, reach = LANCE_PRY.reach, heading = null) {
  if (!isDown(m) || !Array.isArray(m.parts)) return null;
  // M1.6j fix 1: with her heading given, the tool she faces wins (distance x (2 - cos of its bearing off her facing):
  // ahead 1x, abeam 2x, behind 3x). Nearest alone, the live row stood her 1.7 m from a toppled Plumb's bob, facing it,
  // and PRY took the lamp drum beside her (eafbff2)
  const fx = heading == null ? 0 : Math.sin(heading), fz = heading == null ? 0 : Math.cos(heading);
  let best = null, bs = Infinity;
  const first = PRY_FIRST[m.kind] ?? null;
  for (const q of m.parts) {
    if (!q || q.attached === false || !q.tearable || !Number.isFinite(q.tearHp)) continue;
    const w = worldOf(q);
    if (!w) continue;
    const dx = w.x - pos.x, dz = w.z - pos.z, d2 = dx * dx + dz * dz;
    if (d2 > reach * reach) continue;
    const d = Math.sqrt(d2), c = heading == null || d < 1e-6 ? 1 : (dx * fx + dz * fz) / d;
    const sc = d * (2 - c) * (q.name === first ? PRY_FIRST_K : 1);
    if (sc < bs) { bs = sc; best = q; }
  }
  return best;
}

/* -------------------------------------------------------- weak points */

/** The Gauge's ballast tank (bible: "puncture -> lists, -40 % speed"). */
export const BALLAST = Object.freeze({ speedK: 0.6, listDeg: 6 });

/**
 * A hit landed on `m` at weak point `wpName` (the nearest weak point the hit touched, or null).
 * Returns what the rule did, or null. Applies to the Gauge's ballast tanks; the Peg's lamp and the Plumb's vial and
 * lamp are the kinds' own (see the header), reported as `rule` so the rows can name them.
 */
export function weakRule(m, wpName) {
  if (!m || !wpName) return null;
  if (m.kind === 'gauge' && wpName === 'ballast tank') {
    if (m._punctured) return { rule: 'gauge-ballast', first: false };
    m._punctured = true;
    if (typeof m.walkSpeed === 'number') { m._walkSpeed0 = m.walkSpeed; m.walkSpeed *= BALLAST.speedK; }
    m.listDeg = BALLAST.listDeg;
    return { rule: 'gauge-ballast', first: true, speedK: BALLAST.speedK };
  }
  if (m.kind === 'peg' && wpName === 'lamp') return { rule: 'peg-lamp' };
  if (m.kind === 'plumb' && (wpName === 'vial' || wpName === 'lamp')) return { rule: `plumb-${wpName}` };
  return null;
}

/** Take a bearing (bible §8.3): one Instrument at a time; its bearing in degrees from Brea (x = E, z = -N). */
export function bearingDeg(from, to) {
  return ((Math.atan2(to.x - from.x, -(to.z - from.z)) * 180 / Math.PI) + 360) % 360;
}
