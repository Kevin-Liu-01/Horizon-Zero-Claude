/**
 * THE SLICE'S MIX (BUILD M1.6k; TECH §14 "buses", "loudness", "attenuation", "music"). One table read by the game
 * (src/audio/audio.js, ./director.js) and by the offline rows (tools/gates/audio/*), so the walk the rows render and
 * the walk the player hears use the same numbers.
 *
 *   BUS_TRIM     the six buses' trims (applied on each bus's own gain node, under the player's sliders)
 *   ATTEN        inverse distance, reference 2 m (rolloff 1), and the air's high-cut with distance
 *   MUSIC        music sits 8 dB under the ambience in calm play and ducks a further 6 dB while any Instrument is
 *                hostile (its tension layer comes up inside that)
 *   LIMITER      the master's safety limiter: above the walk's loudest moments, so it does not shape the mix
 */
export const BUS_TRIM = Object.freeze({ ambience: 0.55, sfx: 0.71, inst: 0.67, brea: 0.63, ui: 0.71, music: 0.79 });

export const ATTEN = Object.freeze({ ref: 2, rolloff: 1, max: 600, airHalf: 110, airMax: 21000, airMin: 180 });

/**
 * The near cap: a one-shot's level after the distance law never exceeds this (the cue's gain is clipped at play time
 * by its distance, as a per-cue reference distance would): the Plumb's topple must carry 80 m without a collapse at
 * 3 m tearing through the master.
 */
export const NEAR_CAP = 1.0;

/** A one-shot's voice gain at distance d: its gain, capped so gain x distanceGain(d) <= NEAR_CAP. */
export function cappedGain(g, d) {
  if (!(d > 0)) return g;
  const dg = distanceGain(d);
  return Math.min(g, NEAR_CAP / dg);
}

/** Distance gain (Web Audio's 'inverse' model). */
export function distanceGain(d, a = ATTEN) {
  const dd = Math.min(Math.max(d, a.ref), a.max);
  return a.ref / (a.ref + a.rolloff * (dd - a.ref));
}

/** The air's high-cut at distance d (Hz), occlusion `occ` 0..1. */
export function airCutoff(d, occ = 0, a = ATTEN) {
  const open = a.airMax * Math.pow(0.5, d / a.airHalf);
  const closed = 520 * Math.pow(0.5, d / (a.airHalf * 4));
  const v = open * (1 - occ) + closed * occ;
  return v < a.airMin ? a.airMin : v > a.airMax ? a.airMax : v;
}

export const MUSIC = Object.freeze({
  /** dB the music's loudness sits under the ambience's in calm play. */
  underAmbienceDb: 8,
  /** dB the music ducks while any Instrument within 120 m is hostile. */
  hostileDuckDb: 6,
  /** The music bus trim that puts the calm theme 8 dB under the Pans bed (set from the rows' measurement). */
  trim: 0.21,
});

export const LIMITER = Object.freeze({ threshold: -3, knee: 0, ratio: 20, attack: 0.002, release: 0.2 });

/**
 * Ambience levels by place (bed gains on the ambience bus, before the trim): the selector cross-fades these.
 * `shore` is keyed to the distance from the waterline: full at <= 15 m, gone by 140 m.
 */
export const BEDS = Object.freeze({
  pans: 1, saltrow: 1, shore: 1,
  shoreFull: 15, shoreGone: 140,
});

/** The shore bed's level at `d` m from the waterline. */
export function shoreLevel(d) {
  if (!(d >= 0)) return 0;
  if (d <= BEDS.shoreFull) return 1;
  if (d >= BEDS.shoreGone) return 0;
  const k = (d - BEDS.shoreFull) / (BEDS.shoreGone - BEDS.shoreFull);
  return Math.pow(1 - k, 2);
}

/**
 * How far ahead (s) the cane bed reads its bed's gust clock: the lean's own lead (src/game/reeds/gust.js GUST.lead,
 * 0.8 s) plus a quarter second, so that the gust is HEARD (6 dB over the lull) at least 0.8 s before the wind at the
 * bed reaches 4 m/s and cover opens, once the layer's rise and its smoothing are counted (row gust-lead-0.8).
 */
export const CANE_LEAD = 1.05;

/**
 * The cane bed's gust and lull levels from the bed's wind CANE_LEAD s ahead: the gust layer rises from the instant
 * that wind passes 3.2 m/s and is full by 4.5.
 */
export function caneLevels(windAhead) {
  const k = Math.max(0, Math.min(1, (windAhead - 3.2) / 1.3));
  const g = k * k * (3 - 2 * k);
  return { gust: g, lull: 1 - 0.7 * g };
}

/**
 * Brea's foley levels (multiplied by each set's row gain), shared by the game's footstep path and the walk render.
 *   step       every footfall, by normalised speed (speed / 8.2 m/s) and crouch
 *   cloth      the wrap's brush on every other footfall; a flap on sprint steps (every fourth)
 *   gear       the quiver on every third sprint step
 */
export const FOLEY = Object.freeze({
  step: (speedN, crouched) => (crouched ? 0.45 : 0.6 + 0.4 * speedN),
  cloth: (speedN, crouched) => (crouched ? 0.7 : 0.55 + 0.45 * speedN),
  flapFrom: 0.72,
  gear: (speedN) => 0.5 + 0.5 * speedN,
});

/** The bow: draw-creak level from the draw (0..1) and whether it is still rising. */
export function creakLevel(draw, rising) {
  if (draw <= 0.03) return 0;
  return rising ? 0.45 + 0.55 * draw : 0.25 + 0.25 * draw;
}

/** The lamp chirp is heard within this range (m); beyond it a change is not voiced (and is not counted). */
export const CHIRP_RANGE = 120;

/** The cane bed's level by the distance (m) to the nearest reed: full within 3 m, gone at 36 m. */
export function caneNear(d) {
  if (d <= 3) return 1;
  const k = 1 - (d - 3) / 33;
  return k <= 0 ? 0 : Math.pow(k, 1.5);
}
