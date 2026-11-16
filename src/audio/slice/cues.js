/**
 * THE SLICE'S CUE LIST (BUILD M1.6k; TECH §14). One row per distinct cue (a set: one or more variants of one sound).
 *
 *   set      the bank's set id; its folder under public/audio/ is the part before the last '/'
 *   recipe   [group, name] in ./recipes.js (null: an existing file set kept as it is, `keep`)
 *   n        variants rendered (seeds 1..n)
 *   ch       1 mono point source · 2 stereo (beds, music)
 *   loop     a seamless loop
 *   bus      one of the six buses (TECH §14): ambience · sfx (world) · inst (Instruments) · brea · ui · music
 *   range    m: the distance at which the cue must still be heard over its place's bed (TECH §14 attenuation:
 *            inverse distance, reference 2 m). 0: heard at the listener (2D: UI, music, Brea's own breath)
 *   place    the bed it is heard over in the audibility row: 'pans' | 'saltrow' | 'shore'
 *   peak     dBFS the file is normalised to (point sources); beds and music use `lufs` (file loudness)
 *   gain     the cue's level in the mix (linear, applied at play; > 1 is allowed: distance takes it back)
 *   on       what plays it (documentation; src/audio/slice/director.js and src/audio/audio.js hold the wiring)
 *   counted  false for rows that are not part of the slice's 30-cue count (kept Brea efforts, generic fallbacks)
 *
 * The folder names are the slice's own: nothing on disk carries a Round-4 set name (`FOLDERS` is the allowlist the
 * row tools/gates/audio/slice-audio.test.mjs holds the disk to).
 */
export const BUSES = ['ambience', 'sfx', 'inst', 'brea', 'ui', 'music'];

/** Every folder public/audio/ may contain (the allowlist the disk is held to). */
export const FOLDERS = ['amb', 'foot', 'cloth', 'gear', 'bow', 'lance', 'alidade', 'lamp', 'plumb', 'peg', 'gauge', 'inst', 'mstep', 'saltrow', 'brazier', 'ui', 'music', 'brea'];

const P = (o) => Object.assign({ n: 1, ch: 1, loop: false, peak: -1, gain: 1, place: 'pans', counted: true }, o);

export const CUES = [
  /* footsteps on seven surfaces (25 m): terrain.surfaceAt -> SURFACE_SET in audio.js */
  P({ set: 'foot/gravel', recipe: ['FOOT', 'gravel'], n: 4, bus: 'brea', range: 25, gain: 1.0, on: 'a step on the salt crust (salt and shale emit gravel)' }),
  P({ set: 'foot/dirt', recipe: ['FOOT', 'dirt'], n: 4, bus: 'brea', range: 25, gain: 0.95, on: 'a step on black sand' }),
  P({ set: 'foot/rock', recipe: ['FOOT', 'rock'], n: 4, bus: 'brea', range: 25, gain: 1.0, on: 'a step on basalt' }),
  P({ set: 'foot/water', recipe: ['FOOT', 'water'], n: 4, bus: 'brea', range: 25, gain: 1.1, place: 'shore', on: 'a step in the shallows; a splash on landing in water' }),
  P({ set: 'foot/silt', recipe: ['FOOT', 'silt'], n: 4, bus: 'brea', range: 25, gain: 1.05, on: 'a step in brine silt' }),
  P({ set: 'foot/cobble', recipe: ['FOOT', 'cobble'], n: 4, bus: 'brea', range: 25, gain: 0.95, place: 'shore', on: 'a step on shingle and the street' }),
  P({ set: 'foot/grass', recipe: ['FOOT', 'grass'], n: 4, bus: 'brea', range: 25, gain: 0.75, on: 'a step in the meadow' }),
  /* cloth and gear (Brea's foley) */
  P({ set: 'cloth/brush', recipe: ['CLOTH', 'brush'], n: 4, bus: 'brea', range: 10, gain: 0.55, on: 'every other step, a turn, crouch' }),
  P({ set: 'cloth/flap', recipe: ['CLOTH', 'flap'], n: 3, bus: 'brea', range: 12, gain: 0.9, on: 'sprint steps, a hop, a landing: the wrap flaps' }),
  P({ set: 'gear/light', recipe: ['GEAR', 'light'], n: 2, bus: 'brea', range: 12, gain: 0.6, on: 'the quiver on a crouch and on sprint steps' }),
  P({ set: 'gear/heavy', recipe: ['GEAR', 'heavy'], n: 2, bus: 'brea', range: 15, gain: 0.85, on: 'the lance haft on a landing' }),
  /* the bow */
  P({ set: 'bow/nock', recipe: ['BOW', 'nock'], n: 2, bus: 'brea', range: 8, gain: 0.4, on: 'an arrow nocked' }),
  P({ set: 'bow/draw', recipe: ['BOW', 'draw'], bus: 'brea', range: 10, gain: 0.55, on: 'the draw begins' }),
  P({ set: 'bow/creak', recipe: ['BOW', 'creak'], loop: true, bus: 'brea', range: 8, gain: 0.9, on: 'held at draw: the limbs creak (level follows the draw)' }),
  P({ set: 'bow/loose', recipe: ['BOW', 'loose'], n: 3, bus: 'brea', range: 20, gain: 0.85, on: 'the arrow loosed' }),
  P({ set: 'bow/flyby', recipe: ['BOW', 'flyby'], n: 2, bus: 'brea', range: 15, gain: 0.35, on: 'the arrow leaving' }),
  P({ set: 'bow/hit', recipe: ['BOW', 'hit'], n: 3, bus: 'sfx', range: 40, gain: 1.7, on: 'an arrow strikes an Instrument' }),
  P({ set: 'bow/hit-weak', recipe: ['BOW', 'hitWeak'], n: 2, bus: 'sfx', range: 40, gain: 1.2, on: 'an arrow strikes a weak point' }),
  P({ set: 'bow/miss', recipe: ['BOW', 'miss'], n: 3, bus: 'sfx', range: 30, gain: 1.6, on: 'an arrow strikes the ground' }),
  P({ set: 'bow/empty', recipe: ['BOW', 'empty'], bus: 'brea', range: 8, gain: 0.4, counted: false, on: 'a dry loose with no arrows' }),
  /* the lance */
  P({ set: 'lance/draw', recipe: ['LANCE', 'draw'], bus: 'brea', range: 10, gain: 0.55, on: 'the lance taken off her back (stance draw)' }),
  P({ set: 'lance/swing', recipe: ['LANCE', 'swing'], n: 3, bus: 'brea', range: 15, gain: 0.6, on: 'every swing, hit or miss (melee strike phase)' }),
  P({ set: 'lance/hit', recipe: ['LANCE', 'hit'], n: 3, bus: 'sfx', range: 25, gain: 1.7, on: 'a light lance hit' }),
  P({ set: 'lance/heavy', recipe: ['LANCE', 'heavy'], n: 2, bus: 'sfx', range: 30, gain: 1.5, on: 'a heavy, a Critical, a felling blow, an Undercut' }),
  P({ set: 'lance/pry', recipe: ['LANCE', 'pry'], bus: 'sfx', range: 30, gain: 1.0, on: 'Pry: a part torn off' }),
  /* the Alidade */
  P({ set: 'alidade/raise', recipe: ['ALIDADE', 'raise'], bus: 'brea', range: 8, gain: 0.4, on: 'the Alidade raised (sighting-on)' }),
  P({ set: 'alidade/bearing', recipe: ['ALIDADE', 'bearing'], bus: 'brea', range: 10, gain: 0.45, on: 'a bearing taken (the tag event)' }),
  /* lamp chirps: one per state, on every lamp-state change (40 m, the distance the lamps read by eye) */
  P({ set: 'lamp/calm', recipe: ['LAMP', 'calm'], bus: 'inst', range: 40, gain: 1.6, on: 'a lamp turns calm' }),
  P({ set: 'lamp/wary', recipe: ['LAMP', 'wary'], bus: 'inst', range: 40, gain: 1.7, on: 'a lamp turns wary' }),
  P({ set: 'lamp/hostile', recipe: ['LAMP', 'hostile'], bus: 'inst', range: 40, gain: 1.8, on: 'a lamp turns hostile' }),
  P({ set: 'lamp/dark', recipe: ['LAMP', 'dark'], bus: 'inst', range: 40, gain: 1.6, on: 'a lamp goes dark' }),
  /* the Plumb */
  P({ set: 'plumb/gyro', recipe: ['PLUMB', 'gyro'], loop: true, bus: 'inst', range: 30, gain: 1.4, on: 'idle bed: its gyros (the servo-loop slot, by kind)' }),
  P({ set: 'plumb/servo', recipe: ['PLUMB', 'servo'], n: 3, bus: 'inst', range: 30, gain: 1.45, on: 'its footfalls (a leg servo)' }),
  P({ set: 'plumb/chime', recipe: ['PLUMB', 'chime'], bus: 'inst', range: 80, gain: 3.6, on: 'plumb-chime' }),
  P({ set: 'plumb/vial', recipe: ['PLUMB', 'vial'], n: 2, bus: 'inst', range: 40, gain: 1.3, on: 'an arrow in the level vial (a weak hit on a Plumb)' }),
  P({ set: 'plumb/topple', recipe: ['PLUMB', 'topple'], bus: 'inst', range: 80, gain: 3.5, on: 'plumb-topple' }),
  P({ set: 'plumb/bob', recipe: ['PLUMB', 'bob'], n: 2, bus: 'inst', range: 30, gain: 1.75, on: 'Pendulum and Bob Drop wind-ups' }),
  /* the Peg */
  P({ set: 'peg/mallet', recipe: ['PEG', 'mallet'], n: 3, bus: 'inst', range: 40, gain: 1.7, on: 'the mallet attack strike' }),
  P({ set: 'peg/shot', recipe: ['PEG', 'shot'], n: 2, bus: 'inst', range: 40, gain: 1.7, on: 'Peg Shot strike' }),
  P({ set: 'peg/rush', recipe: ['PEG', 'rush'], bus: 'inst', range: 30, gain: 1.0, on: 'Swarm Rush wind-up' }),
  P({ set: 'peg/idle', recipe: ['PEG', 'idle'], loop: true, bus: 'inst', range: 15, gain: 1.5, on: 'idle bed: its escapement' }),
  /* the Gauge */
  P({ set: 'gauge/sluice', recipe: ['GAUGE', 'sluice'], loop: true, bus: 'sfx', range: 80, gain: 5.4, on: 'while Sluice 3 runs (gauge-sluice open)' }),
  P({ set: 'gauge/gate', recipe: ['GAUGE', 'gate'], bus: 'sfx', range: 80, gain: 2.6, on: 'the sluice gate opens or shuts' }),
  P({ set: 'gauge/stilt', recipe: ['GAUGE', 'stilt'], n: 3, bus: 'inst', range: 50, gain: 4.6, on: 'its footfalls (a stilt step)' }),
  P({ set: 'gauge/float', recipe: ['GAUGE', 'float'], bus: 'inst', range: 40, gain: 1.1, on: 'the float ring moves a tenth on the staff' }),
  P({ set: 'gauge/idle', recipe: ['GAUGE', 'idle'], loop: true, bus: 'inst', range: 20, gain: 3.4, on: 'idle bed: its brine pump' }),
  /* Instruments in general (kinds without their own cue) */
  P({ set: 'inst/servo', recipe: ['INST', 'servo'], loop: true, bus: 'inst', range: 30, gain: 0.4, counted: false, on: 'idle bed for a kind with none' }),
  P({ set: 'inst/windup', recipe: ['INST', 'windup'], bus: 'inst', range: 30, gain: 0.9, counted: false, on: 'an attack wind-up (kinds without their own)' }),
  P({ set: 'inst/strike', recipe: ['INST', 'strike'], n: 2, bus: 'inst', range: 40, gain: 1.0, counted: false, on: 'an attack lands (kinds without their own)' }),
  P({ set: 'inst/stagger', recipe: ['INST', 'stagger'], bus: 'inst', range: 40, gain: 1.25, on: 'machine-stagger' }),
  P({ set: 'inst/powerdown', recipe: ['INST', 'powerdown'], bus: 'inst', range: 60, gain: 2.0, on: 'machine-killed' }),
  P({ set: 'inst/collapse', recipe: ['INST', 'collapse'], bus: 'inst', range: 80, gain: 3.2, on: 'machine-death-impact' }),
  P({ set: 'mstep/light', recipe: ['MSTEP', 'light'], n: 3, bus: 'inst', range: 25, gain: 0.7, counted: false, on: 'footfall, light class' }),
  P({ set: 'mstep/medium', recipe: ['MSTEP', 'medium'], n: 3, bus: 'inst', range: 40, gain: 0.9, counted: false, on: 'footfall, medium class' }),
  P({ set: 'mstep/heavy', recipe: ['MSTEP', 'heavy'], n: 3, bus: 'inst', range: 60, gain: 1.2, counted: false, on: 'footfall, heavy class' }),
  /* places: ambience beds and their layers */
  P({ set: 'amb/pans', bed: true, recipe: ['AMB', 'pans'], ch: 2, loop: true, bus: 'ambience', range: 0, lufs: -20, gain: 0.5, on: 'the bed on the Pans and the meadow' }),
  P({ set: 'amb/trade', bed: true, recipe: ['AMB', 'trade'], ch: 2, loop: true, bus: 'ambience', range: 0, lufs: -20, gain: 0.32, on: 'the trade wind layer (follows the wind)' }),
  P({ set: 'amb/saltrow', bed: true, recipe: ['AMB', 'saltrow'], ch: 2, loop: true, bus: 'ambience', range: 0, lufs: -20, gain: 0.5, place: 'saltrow', on: 'the bed in Saltrow' }),
  P({ set: 'amb/shore', bed: true, recipe: ['AMB', 'shore'], ch: 2, loop: true, bus: 'ambience', range: 0, lufs: -20, gain: 0.55, place: 'shore', on: 'surf, keyed to the distance from the waterline' }),
  P({ set: 'amb/cane-gust', recipe: ['AMB', 'caneGust'], ch: 2, loop: true, bus: 'ambience', range: 15, lufs: -20, gain: 0.9, on: 'wind in cane, the gust: rises 0.8 s before cover opens' }),
  P({ set: 'amb/cane-lull', recipe: ['AMB', 'caneLull'], ch: 2, loop: true, bus: 'ambience', range: 8, lufs: -28, gain: 0.6, on: 'wind in cane, the lull' }),
  P({ set: 'amb/gull', recipe: ['AMB', 'gull'], n: 3, bus: 'ambience', range: 120, gain: 4.8, place: 'shore', on: 'gulls over the shore and the harbour' }),
  P({ set: 'saltrow/bell', recipe: ['SALTROW', 'bell'], bus: 'sfx', range: 300, gain: 21, on: 'the guild bell on the hour' }),
  P({ set: 'saltrow/pump', recipe: ['SALTROW', 'pump'], loop: true, bus: 'sfx', range: 60, gain: 3.8, on: 'each wind pump turning (positional loop)' }),
  P({ set: 'saltrow/rake', recipe: ['SALTROW', 'rake'], n: 3, bus: 'sfx', range: 30, gain: 1.2, place: 'saltrow', on: 'rakers on the salt rows; Brea raking' }),
  P({ set: 'saltrow/shovel', recipe: ['SALTROW', 'shovel'], n: 2, bus: 'sfx', range: 30, gain: 1.2, place: 'saltrow', on: 'salt cones being worked' }),
  P({ set: 'saltrow/cart', recipe: ['SALTROW', 'cart'], bus: 'sfx', range: 40, gain: 2.0, place: 'saltrow', on: 'the salt cart' }),
  P({ set: 'saltrow/hammer', recipe: ['SALTROW', 'hammer'], n: 2, bus: 'sfx', range: 60, gain: 2.6, place: 'saltrow', on: 'work at the harbour' }),
  P({ set: 'brazier/kindle', recipe: ['BRAZIER', 'kindle'], bus: 'sfx', range: 20, gain: 1.0, on: 'brazier-kindled' }),
  P({ set: 'brazier/burn', recipe: ['BRAZIER', 'burn'], loop: true, bus: 'sfx', range: 15, gain: 1.6, on: 'a lit Brazier (positional loop)' }),
  P({ set: 'brazier/rest', recipe: ['BRAZIER', 'rest'], bus: 'sfx', range: 0, gain: 0.25, on: 'brazier-rest-start' }),
  /* UI: glass ticks */
  P({ set: 'ui/tick', recipe: ['UI', 'tick'], bus: 'ui', range: 0, gain: 0.3, peak: -3, on: 'ui-nav' }),
  P({ set: 'ui/select', recipe: ['UI', 'select'], bus: 'ui', range: 0, gain: 0.32, peak: -3, on: 'ui-confirm' }),
  P({ set: 'ui/back', recipe: ['UI', 'back'], bus: 'ui', range: 0, gain: 0.3, peak: -3, on: 'ui-back' }),
  P({ set: 'ui/error', recipe: ['UI', 'error'], bus: 'ui', range: 0, gain: 0.3, peak: -3, on: 'ui-error' }),
  P({ set: 'ui/tab', recipe: ['UI', 'tab'], bus: 'ui', range: 0, gain: 0.3, peak: -3, on: 'a hub tab (ui-nav with a tab)' }),
  P({ set: 'ui/map', recipe: ['UI', 'map'], bus: 'ui', range: 0, gain: 0.32, peak: -3, on: 'the map opened (ui-open hub on the map tab, the map tab)' }),
  P({ set: 'ui/open', recipe: ['UI', 'open'], bus: 'ui', range: 0, gain: 0.3, peak: -3, on: 'ui-open, inventory-open, wheel-open' }),
  P({ set: 'ui/close', recipe: ['UI', 'close'], bus: 'ui', range: 0, gain: 0.3, peak: -3, on: 'ui-close, inventory-close, wheel-close' }),
  P({ set: 'ui/triangle', recipe: ['UI', 'triangle'], bus: 'ui', range: 0, gain: 0.4, peak: -3, on: 'triangle-closed' }),
  P({ set: 'ui/save', recipe: ['UI', 'save'], bus: 'ui', range: 0, gain: 0.35, peak: -3, on: 'save-written' }),
  /* music: one cue (the Pans theme) in four phase-locked stems, the ratchet and pedal its tension layer */
  P({ set: 'music/strings', recipe: ['MUSIC', 'strings'], ch: 2, loop: true, bus: 'music', range: 0, lufs: -22, gain: 1, on: 'the Pans theme: plucked strings' }),
  P({ set: 'music/whistle', recipe: ['MUSIC', 'whistle'], ch: 2, loop: true, bus: 'music', range: 0, lufs: -22, gain: 1, counted: false, on: 'the Pans theme: the whistle line' }),
  P({ set: 'music/pedal', recipe: ['MUSIC', 'pedal'], ch: 2, loop: true, bus: 'music', range: 0, lufs: -24, gain: 1, counted: false, on: 'tension layer: the pedal' }),
  P({ set: 'music/ratchet', recipe: ['MUSIC', 'ratchet'], ch: 2, loop: true, bus: 'music', range: 0, lufs: -22, gain: 1, on: 'tension layer: the ratchet, while lamps are up' }),
  /* Brea's efforts: the renamed existing set, kept until Milestone 3 regenerates it (TECH §14 voice) */
  ...['breath-hard', 'breath-in', 'breath-out', 'effort', 'effort-hard', 'hurt'].map((k) => P({
    set: `brea/${k}`, recipe: null, keep: true, bus: 'brea', range: 0, gain: 0.9, counted: false, on: 'Brea\'s breath and efforts (kept set)',
  })),
];

export const CUE_BY_SET = new Map(CUES.map((c) => [c.set, c]));

/** The distinct cues the slice counts toward "30 or more". */
export const COUNTED = CUES.filter((c) => c.counted);

/** Files a row ships (`<set>.ogg`, or `<set>-<k>.ogg` for k = 1..n). */
export function filesOf(c) {
  if (c.n <= 1) return [`${c.set}.ogg`];
  return Array.from({ length: c.n }, (_, k) => `${c.set}-${k + 1}.ogg`);
}
