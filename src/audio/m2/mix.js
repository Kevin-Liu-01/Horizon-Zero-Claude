/**
 * THE FIRST HOUR'S MIX RULES (Milestone 2 audio). One table read by the game (./director.js, ../slice/director.js,
 * ../audio.js) and by the offline rows (tools/gates/audio/hour-audio.test.mjs, tools/gates/audio/hour-walk.mjs), so the
 * walk the rows render and the walk the player hears use the same numbers. Pure: no Web Audio, no THREE, no DOM.
 *
 *   ZONE           the zones on the regions seam: each built region's weight from its signed depth on the region map
 *                  (src/core/regions.js `map.depth`, a call), crossfaded over the seam's own hysteresis band (so the
 *                  crossing's `leave` fires with the left bed at or under half and its `enter` with the new one at or
 *                  over half), then smoothed in time; the sub-zones inside the Holds (Ninewalls by the distance to the
 *                  village's centre, the Scar by the distance to its centreline) and the Malpais edge by its depth.
 *   bedLevels()    the six place beds' levels (and the slice's Pans, Saltrow and trade multipliers) from the zone
 *                  weights and the calima.
 *   CALIMA_FAR     calima at noon: "the wind thins, the far sounds drop": a one-shot past `near` loses up to `dropDb`
 *                  by `far`, scaled by the weather's calima weight.
 *   TRAMPLE        the trample tell's timing rule (heard at the wind-up; the herd-trample's own table is the Tiller's).
 */
import { HYSTERESIS_M } from '../../core/regions.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

export const ZONE = Object.freeze({
  /** The built regions whose beds the zones crossfade (every other region falls back to the Holds' bed). */
  regions: Object.freeze(['pans', 'holds', 'malpais']),
  /** The crossfade band (m) about a region's edge: the seam's hysteresis (enter and leave fire at its two sides). */
  band: HYSTERESIS_M,
  /** Time constant (s) of the region weights (a crossing heard over about 3 tau). */
  tau: 1.2,
  /** Time constant (s) of the sub-zones. */
  subTau: 1.0,
  /** Ninewalls: full inside `full` m of the village's centre, gone past `gone` (its outer wall is at 67.65 m). */
  ninewalls: Object.freeze({ full: 72, gone: 110 }),
  /** The Scar: full within `full` m of its centreline, gone past `gone`; `ends` m past either end of its line. */
  scar: Object.freeze({ full: 16.5, gone: 45, ends: 20 }),
  /** The Malpais edge: its bed rises from `from` m outside the Malpais (signed depth) and is full at `full`. */
  malpaisEdge: Object.freeze({ from: -70, full: -5 }),
});

/**
 * A region's crossfade weight from its signed depth (m, > 0 inside): 0 at band/2 outside, 1 at band/2 inside, linear
 * (equal-gain beds, so a linear sum keeps the bed's loudness through a crossing).
 */
export function regionWeight(depth, band = ZONE.band) {
  if (!Number.isFinite(depth)) return depth > 0 ? 1 : 0;
  return clamp(0.5 + depth / band, 0, 1);
}

/** Ninewalls' sub-zone weight at distance `d` (m) from the village's centre. */
export function ninewallsWeight(d) { return 1 - smooth(ZONE.ninewalls.full, ZONE.ninewalls.gone, d); }

/**
 * The Scar's sub-zone weight at (x, z): by the distance to its centreline, inside its length (and `ends` past it).
 * `scar` is { a: {x, z}, b: {x, z} } (src/world/island/sites.js SCAR).
 */
export function scarWeight(x, z, scar) {
  const ax = scar.a.x, az = scar.a.z, dx = scar.b.x - ax, dz = scar.b.z - az, L = Math.hypot(dx, dz);
  const t = ((x - ax) * dx + (z - az) * dz) / L;                // along the line, m from a
  const off = Math.abs((x - ax) * dz - (z - az) * dx) / L;      // across it
  const along = t < 0 ? -t : t > L ? t - L : 0;
  if (along > ZONE.scar.ends) return 0;
  return 1 - smooth(ZONE.scar.full, ZONE.scar.gone, off);
}

/** The Malpais edge's weight from the Malpais' signed depth (m). */
export function malpaisEdgeWeight(depth) { return smooth(ZONE.malpaisEdge.from, ZONE.malpaisEdge.full, depth); }

/**
 * The beds' levels (each multiplied by its row gain at play). `z` = { pans, holds, other, malpais (region weights,
 * smoothed), nine, scar, edge (sub-zones, smoothed), calima (0..1) }.
 *   pansK      multiplies the slice's Pans and Saltrow beds (src/audio/slice/director.js _places)
 *   tradeK     multiplies the slice's trade wind layer: it thins off the Pans and thins further in the calima
 *   holds, ninewalls, scar, malpais, calima   the first hour's beds
 */
export function bedLevels(z, out = {}) {
  const c = clamp(z.calima || 0, 0, 1);
  const holdsR = clamp((z.holds || 0) + (z.other || 0), 0, 1);
  const nine = clamp(z.nine || 0, 0, 1) * holdsR;
  const scar = clamp(z.scar || 0, 0, 1) * (1 - nine);
  const edge = Math.max(clamp(z.malpais || 0, 0, 1), clamp(z.edge || 0, 0, 1));
  out.pansK = clamp(z.pans ?? 1, 0, 1);
  out.tradeK = (0.6 + 0.4 * out.pansK) * (1 - 0.7 * c);
  out.holds = holdsR * (1 - 0.65 * nine) * (1 - 0.5 * scar) * (1 - 0.55 * edge) * (1 - 0.5 * c);
  out.ninewalls = nine * (1 - 0.35 * c);
  out.scar = scar * (1 - 0.5 * c);
  out.malpais = edge * (1 - 0.3 * c);
  out.calima = c;
  return out;
}

/**
 * The beds each first-hour place is heard over (the audibility rows: a cue at its range against these), at the
 * place's own zone weights in trade weather: the same bedLevels() the director plays. [set, level] pairs.
 */
export function placeBeds(place) {
  const Z = {
    holds: { pans: 0, holds: 1, nine: 0, scar: 0, edge: 0 },
    ninewalls: { pans: 0, holds: 1, nine: 1, scar: 0, edge: 0 },
    scar: { pans: 0, holds: 1, nine: 0, scar: 1, edge: 0 },
    malpais: { pans: 0, holds: 0, malpais: 1, nine: 0, scar: 0, edge: 1 },
  }[place];
  if (!Z) return null;
  const L = bedLevels({ ...Z, calima: 0 });
  const out = [['amb/trade', L.tradeK]];
  for (const [set, k] of [['amb/holds', L.holds], ['amb/ninewalls', L.ninewalls], ['amb/scar', L.scar], ['amb/malpais', L.malpais]]) if (k > 0.001) out.push([set, +k.toFixed(4)]);
  return out;
}

/** Calima at noon: the far sounds drop. A one-shot at `d` m under calima weight `k` (0..1) loses up to dropDb. */
export const CALIMA_FAR = Object.freeze({ near: 25, far: 120, dropDb: 12 });
export function calimaFarGain(d, k) {
  if (!(k > 0) || !(d > CALIMA_FAR.near)) return 1;
  const u = clamp((d - CALIMA_FAR.near) / (CALIMA_FAR.far - CALIMA_FAR.near), 0, 1);
  return Math.pow(10, (-CALIMA_FAR.dropDb * clamp(k, 0, 1) * u) / 20);
}

/**
 * The trample tell: played on the herd-trample's wind-up (machine-attack-phase 'windup'); it must be heard 1 s or more
 * before contact. `leadS` is the bar; `onsetS` the file's audible onset (its first 50 ms window over the bed: a hard
 * ratchet at 0 s, measured by the row on the shipped file).
 */
export const TRAMPLE = Object.freeze({ attack: 'herd-trample', set: 'tiller/trample', leadS: 1.0 });

/**
 * Contact time (s after the wind-up starts) of a generic charge (src/entities/machines/ai/attacks.js `charge`): the
 * wind-up, then the strike phase runs at `speed` m/s straight at where she was, and damage lands when she is within
 * `range`. `d0` the distance at the wind-up, `closing` her own speed toward it (m/s; 0 standing). Null: the strike
 * phase ends before contact (a miss).
 */
export function chargeContactS({ windup, strike, speed, range }, d0, closing = 0) {
  const gap = d0 - range;
  if (gap <= 0) return windup;
  const towardDuringWindup = closing * windup;
  const g = gap - towardDuringWindup;
  if (g <= 0) return windup;
  const t = g / (speed + closing);
  return t <= strike ? windup + t : null;
}
