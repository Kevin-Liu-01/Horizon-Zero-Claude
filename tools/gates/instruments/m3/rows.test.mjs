// M3 wave 1, area C (instruments): rows IK1-IK7 of the M3 brief and the Clouded seam, in Node (Tier 0, no browser), on
// the game's own modules (src/instruments/kinds/{kiln,spindle,davit,sonde}/, src/combat/status.js, lib/kindkit.js).
// The numbers are printed by ./report.mjs; ./measure.mjs is where each row is measured.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROWS } from './measure.mjs';

const TITLES = {
  IK1: 'IK1 sizes and classes: Kiln 5.5, Spindle 3.8, Davit 4.2, Sonde 3.0 m (+-0.1, W and L too); large, medium, medium, small; under the class triangle caps',
  'IK1-read': 'wave 2, the originality read as geometry (proxies for the wave-1 review\'s four risks): no round flat face of 0.25 m or more to the front or back lens, the lamp off the centre line (>= 0.1 m) and at most 0.6 of the height',
  'Q4-R7': 'Q4 under ruling R7 (provisional): "a plugged, still Kiln does not count as an awake large kind for the encounter rule (it is the stealth window); never two awake" (the brief\'s default, kept: "Two Kilns at the Yards, one awake at a time ... Never two awake"): 40 fights, never two awake, the encounter rule ok on every step',
  'IK1-never': 'the never list at blockout: one lamp each, no head/neck/eye/face/tail part, nothing emissive, knees in the sagittal plane, weak points >= 0.25 m; three plates countable',
  IK2: 'IK2 the firebox door: Brine (pot or arrow) on the hot door staggers 2.0 s +-0.2 at damage x1.0; cold door or elsewhere 0 of 10',
  IK3: 'IK3 plugged in: a quenched wellhead never chosen; it stands >= 120 s and never turns while plugged; four quenched, 0 spawns in 24 h',
  IK4: 'IK4 the mortar: three-shell volleys only at 25-60 m; each shell warned >= 1.2 s; 0 in a dwelling ring or on a person; a plugged Kiln does not shell',
  IK5: 'IK5 the Spindle: 10/10 frontal arrows deflected, 0/10 from behind; Brine half speed; Dust stops it and exposes the bearing 2.0 s +-0.2; thrust reaches 9 m; escort 6-9 m',
  IK6: 'IK6 the Davit: re-seats an off part in 4.0 s +-0.3; three plates, one fewer per repair or plate shot; a Pried winch, 0 repairs; about 20 m behind a large kind',
  IK7: 'IK7 the Sonde: within 18 m of its post; 3 punctures or Cinder bring it down; fouled fans sink it in 6 s; a cut tether drifts within 10 deg downwind, crash < 60 s; calima 6 m; a night flare Flags; range x2 while she glides',
  'IK8-cues': 'IK8 voices: each kind fires a cue id (the Cues seam) on every state change and event, every state reached; 0 direct file plays',
  CLOUDED: 'Clouded (src/combat/status.js, typed): lamps dark 6 s, the lock broken, the alert reset, the kind answers through onStatus',
};

for (const [id, fn] of Object.entries(ROWS)) {
  test(TITLES[id] || id, async () => {
    const r = await fn();
    assert.ok(r.ok, `${id}: ${JSON.stringify(r)}`);
  });
}
