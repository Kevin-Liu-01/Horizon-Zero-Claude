/**
 * THE FIRST HOUR'S CUE LIST (Milestone 2 audio; TECH §14). The rows the slice's table (../slice/cues.js) did not have,
 * in the same shape (see that file for the fields), each marked `m2: true`; ../slice/cues.js appends them to `CUES`, so
 * the one builder (tools/gates/audio/build-bank.mjs), the one manifest and the one bank carry both.
 *
 *   place    the bed the cue is heard over in the audibility row: 'holds' (the terraces and the herd's slope),
 *            'ninewalls' (inside the walls: the forge, the work, the Screed fight), 'scar' (the cut, Benchmark 1),
 *            'malpais' (the edge). Their beds and levels are ./mix.js PLACE_BEDS.
 *
 *   load     'late' (the default here): fetched and decoded after New Game or Continue gives her control (GameAudio's late
 *            load, ../bank.js loadLate), so the first load carries only what the title and the first seconds need; the
 *            shipped ledger (tools/tier0/budgets.mjs) reads the same field from the manifest. 'boot': with the slice's bank,
 *            before control (the Kit Rack's UI clicks: the rack can be held open the moment she is under control).
 *
 * Ranges: TECH §14 names one of them, "Screed blade 150 m" (the charge, the stall and the cut are the blade's); every
 * other range here was CHOSEN by the audio lane and waits for approval (`rangeFrom`), as the slice's did.
 */
const P = (o) => Object.assign({ n: 1, ch: 1, loop: false, peak: -1, gain: 1, place: 'holds', counted: true, m2: true, load: 'late' }, o);

/** The folders the first hour adds under public/audio/ (the allowlist ../slice/cues.js FOLDERS extends with). */
export const M2_FOLDERS = ['holds', 'forge', 'rack', 'windwall', 'gaff', 'pot', 'tiller', 'screed'];

/** TECH §14's own range for the Screed's blade (m). */
export const M2_TECH_RANGES = Object.freeze({ 'screed/charge': 150, 'screed/stall': 150, 'screed/cut': 150 });

export const M2_CUES = [
  /* places: the zones' beds on the regions seam (./director.js crossfades them on enter and leave) */
  P({ set: 'amb/holds', bed: true, recipe: ['PLACE', 'holds'], ch: 2, loop: true, bus: 'ambience', range: 0, lufs: -20, gain: 0.45, place: 'holds', on: 'the Holds region (region-enter holds): the terraces, the pits, the herd\'s slope' }),
  P({ set: 'amb/ninewalls', bed: true, recipe: ['PLACE', 'ninewalls'], ch: 2, loop: true, bus: 'ambience', range: 0, lufs: -20, gain: 0.5, place: 'ninewalls', on: 'inside the nine walls (by the distance to the village\'s centre)' }),
  P({ set: 'amb/scar', bed: true, recipe: ['PLACE', 'scar'], ch: 2, loop: true, bus: 'ambience', range: 0, lufs: -20, gain: 0.45, place: 'scar', on: 'on the Scar (by the distance to its centreline)' }),
  P({ set: 'amb/malpais', bed: true, recipe: ['PLACE', 'malpais'], ch: 2, loop: true, bus: 'ambience', range: 0, lufs: -20, gain: 0.5, place: 'malpais', on: 'the Malpais edge (region-enter malpais; its signed depth on the regions map)' }),
  P({ set: 'amb/calima', bed: true, recipe: ['PLACE', 'calima'], ch: 2, loop: true, bus: 'ambience', range: 0, lufs: -20, gain: 0.5, place: 'holds', on: 'the calima\'s air (the weather\'s calima weight): the wind thins to a dust hiss' }),
  /* the Holds at work (ctx.people.holds: each person's act at their place) */
  P({ set: 'holds/hoe', recipe: ['HOLDS', 'hoe'], n: 3, bus: 'sfx', range: 30, gain: 1.4, place: 'ninewalls', on: 'a farmer at a pit (act harvest)' }),
  P({ set: 'holds/sow', recipe: ['HOLDS', 'sow'], n: 2, bus: 'sfx', range: 20, gain: 1.2, place: 'ninewalls', on: 'a plot sown (act sow)' }),
  P({ set: 'holds/water', recipe: ['HOLDS', 'water'], n: 2, bus: 'sfx', range: 20, gain: 1.2, place: 'ninewalls', on: 'a plot watered (act water)' }),
  P({ set: 'holds/bucket', recipe: ['HOLDS', 'bucket'], n: 2, bus: 'sfx', range: 30, gain: 1.5, place: 'ninewalls', on: 'a bucket at the cistern (acts draw, fill, fetch)' }),
  P({ set: 'holds/pick', recipe: ['HOLDS', 'pick'], n: 2, bus: 'sfx', range: 20, gain: 1.1, place: 'ninewalls', on: 'cochineal picked at the cactus beds (acts pick, scrape)' }),
  P({ set: 'holds/sort', recipe: ['HOLDS', 'sort'], n: 2, bus: 'sfx', range: 25, gain: 1.4, place: 'ninewalls', on: 'jars sorted at a door (act sort)' }),
  /* Oro's forge in the tube mouth */
  P({ set: 'forge/fire', recipe: ['FORGE', 'fire'], loop: true, bus: 'sfx', range: 20, gain: 1.8, place: 'ninewalls', on: 'the hearth (a positional loop within 60 m of the tube mouth)' }),
  P({ set: 'forge/bellows', recipe: ['FORGE', 'bellows'], bus: 'sfx', range: 25, gain: 1.6, place: 'ninewalls', on: 'the bellows, every 7-14 s while she is near the forge' }),
  P({ set: 'forge/anvil', recipe: ['FORGE', 'anvil'], n: 3, bus: 'sfx', range: 80, gain: 4.0, place: 'ninewalls', on: 'Oro at the anvil (act hammer)' }),
  P({ set: 'forge/quench', recipe: ['FORGE', 'quench'], bus: 'sfx', range: 30, gain: 1.6, place: 'ninewalls', on: 'Oro at the trough (act quench)' }),
  /* the Kit Rack (UI) */
  P({ set: 'rack/open', load: 'boot', recipe: ['RACK', 'open'], bus: 'ui', range: 0, gain: 0.32, peak: -3, on: 'the Kit Rack opens (hold Tab)' }),
  P({ set: 'rack/step', load: 'boot', recipe: ['RACK', 'step'], bus: 'ui', range: 0, gain: 0.28, peak: -3, on: 'the selection passes a sector' }),
  P({ set: 'rack/take', load: 'boot', recipe: ['RACK', 'take'], bus: 'ui', range: 0, gain: 0.32, peak: -3, on: 'let go: the sector taken' }),
  /* the Windwall */
  P({ set: 'windwall/open', recipe: ['WINDWALL', 'open'], bus: 'brea', range: 12, gain: 0.7, place: 'ninewalls', on: 'the fan opens (the guard comes up)' }),
  P({ set: 'windwall/shut', recipe: ['WINDWALL', 'shut'], bus: 'brea', range: 12, gain: 0.65, place: 'ninewalls', on: 'the fan folds' }),
  P({ set: 'windwall/plant', recipe: ['WINDWALL', 'plant'], bus: 'sfx', range: 30, gain: 1.4, place: 'ninewalls', on: 'windwall-planted' }),
  P({ set: 'windwall/block', recipe: ['WINDWALL', 'block'], n: 2, bus: 'sfx', range: 30, gain: 1.5, place: 'ninewalls', on: 'windwall-block (block)' }),
  P({ set: 'windwall/parry', recipe: ['WINDWALL', 'parry'], bus: 'sfx', range: 40, gain: 1.6, place: 'ninewalls', on: 'windwall-block (parry)' }),
  P({ set: 'windwall/bash', recipe: ['WINDWALL', 'bash'], n: 2, bus: 'sfx', range: 30, gain: 1.8, place: 'ninewalls', on: 'windwall-bash' }),
  /* the gaff */
  P({ set: 'gaff/swing', recipe: ['GAFF', 'swing'], n: 2, bus: 'brea', range: 12, gain: 0.6, place: 'ninewalls', on: 'a light or the hook-rip begins (the gaff verbs\' count)' }),
  P({ set: 'gaff/hit', recipe: ['GAFF', 'hit'], n: 2, bus: 'sfx', range: 30, gain: 1.6, place: 'ninewalls', on: 'gaff-hit (a light that lands)' }),
  P({ set: 'gaff/hook', recipe: ['GAFF', 'hook'], bus: 'sfx', range: 30, gain: 1.6, place: 'ninewalls', on: 'gaff-hit (the hook-rip\'s bite)' }),
  P({ set: 'gaff/rip', recipe: ['GAFF', 'rip'], bus: 'sfx', range: 50, gain: 2.2, place: 'ninewalls', on: 'gaff-hit with a part torn or a seal blown' }),
  /* the pots */
  P({ set: 'pot/throw', recipe: ['POT', 'throw'], bus: 'brea', range: 10, gain: 0.75, place: 'ninewalls', on: 'a pot leaves her hand (pots.flying)' }),
  P({ set: 'pot/break', recipe: ['POT', 'break'], n: 2, bus: 'sfx', range: 40, gain: 2.0, place: 'ninewalls', on: 'pot-landed (Brine, Dust)' }),
  P({ set: 'pot/cinder', recipe: ['POT', 'cinder'], bus: 'sfx', range: 40, gain: 2.0, place: 'ninewalls', on: 'pot-landed (Cinder)' }),
  P({ set: 'pot/seize', recipe: ['POT', 'seize'], bus: 'sfx', range: 30, gain: 1.5, place: 'ninewalls', on: 'pot-status (Brine takes a part)' }),
  /* the Tiller herd */
  P({ set: 'tiller/step', recipe: ['TILLER', 'step'], n: 3, bus: 'inst', range: 40, gain: 2.7, place: 'holds', on: 'its footfalls (a stilt)' }),
  P({ set: 'tiller/idle', recipe: ['TILLER', 'idle'], loop: true, bus: 'inst', range: 25, gain: 2.2, place: 'holds', on: 'idle bed: coring' }),
  P({ set: 'tiller/trample', recipe: ['TILLER', 'trample'], bus: 'inst', range: 60, gain: 4.5, place: 'holds', on: 'the trample tell: herd-trample\'s wind-up (heard before contact)' }),
  /* the Screed */
  P({ set: 'screed/step', recipe: ['SCREED', 'step'], n: 3, bus: 'inst', range: 80, gain: 4.5, place: 'ninewalls', on: 'its footfalls: the hull\'s layer over mstep/heavy' }),
  P({ set: 'screed/idle', recipe: ['SCREED', 'idle'], loop: true, bus: 'inst', range: 60, gain: 4.6, place: 'ninewalls', on: 'idle bed: the moldboard working' }),
  P({ set: 'screed/charge', recipe: ['SCREED', 'charge'], bus: 'inst', range: 150, gain: 12, place: 'ninewalls', on: 'screed-charge (the wind-up and the lock)' }),
  P({ set: 'screed/stall', recipe: ['SCREED', 'stall'], bus: 'inst', range: 150, gain: 14, place: 'ninewalls', on: 'screed-stalled, screed-stalled-rock' }),
  P({ set: 'screed/seal', recipe: ['SCREED', 'seal'], bus: 'inst', range: 60, gain: 4.0, place: 'ninewalls', on: 'seal-off' }),
  P({ set: 'screed/seize', recipe: ['SCREED', 'seize'], bus: 'inst', range: 40, gain: 2.4, place: 'ninewalls', on: 'screed-seized' }),
  P({ set: 'screed/cut', recipe: ['SCREED', 'cut'], bus: 'sfx', range: 150, gain: 14, place: 'ninewalls', on: 'screed-cut (a wall cut to the Datum Line)' }),
  /* the re-survey's Alidade */
  P({ set: 'alidade/hold', recipe: ['RESURVEY', 'hold'], loop: true, bus: 'brea', range: 0, gain: 0.25, place: 'scar', on: 'the re-survey\'s hold: up while the arc fills' }),
  P({ set: 'alidade/mark', recipe: ['RESURVEY', 'mark'], bus: 'brea', range: 0, gain: 0.5, place: 'scar', on: 'resurvey-bearing' }),
  P({ set: 'alidade/true', recipe: ['RESURVEY', 'true'], bus: 'brea', range: 0, gain: 0.55, place: 'scar', on: 'resurvey-done: true ground' }),
];
