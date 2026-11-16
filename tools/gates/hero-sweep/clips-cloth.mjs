/**
 * The cloth lane's clips for `session.mjs --clips` (merged into its CLIP_DEFS; the weapons brief's seam). Owned by the
 * cloth lane from the weapons lane's first commit on. Same format as clips-handling.mjs: every clip on SIMULATION time
 * (`sim: true`, 60 frames a second of sim time, each also written at quarter speed from the same frames); `lens` rides
 * her (`a` deg round her from her front, + to her left, or 'side' / '3q'; `d` m out, `h` m up, aimed `look` m over her
 * feet), null = the game's own chase camera.
 *
 * M1a cloth step 1 (the brief's 4.3): run-stop, turn on the spot, roll, landing, gust, crouch-walk, studio still, sprint
 * side-on, the heavy lunge, and the chase camera. Each starts by putting the cloth where the clip wants it: `G2` the grid
 * solver (cloth/rig.js, as `?cloth=2`), `G0` today's chains; the `...Old` clips are today's cloth at the same staging,
 * for the side-by-side. The grid cloth is reset on the clip's first pose (its deterministic reset).
 */
const G2 = `p.animator.setClothMode?.(2); await w(1 / 60); p.animator.clothReset?.(0);`;
const G0 = `p.animator.setClothMode?.(0); await w(0.5);`;
/** the world's wind at her held at `ms` m/s along its own bearing (environment.windAt scaled), restored by `UNWIND` */
const WIND = (ms) => `{ const E = C.environment; if (E && !E.__wa0) { E.__wa0 = E.windAt; } if (E) E.windAt = function (x, z, out) { const s = E.__wa0.call(E, x, z, out); const k = s > 1e-3 ? (${ms}) / s : 0; if (out) { out.x *= k; out.z *= k; } return s * k; }; }`;
const UNWIND = `{ const E = C.environment; if (E && E.__wa0) { E.windAt = E.__wa0; delete E.__wa0; } }`;
/** a turn on the spot: her heading (and the facing latch) swept by `deg` over `s` seconds */
const TURN = (deg, s) => `{ const n = Math.round(${s} * 60), d = (${deg}) * Math.PI / 180 / n; for (let i = 0; i < n; i++) { p.heading += d; if ('_faceX' in p) { p._faceX = p._candX = Math.sin(p.heading); p._faceZ = p._candZ = Math.cos(p.heading); } await w(1 / 60); } }`;

const runStop = (g) => `${g} await w(0.3); C.input.keys.add('KeyW'); await w(0.6); C.input.keys.add('ShiftLeft'); await w(1.6); C.input.keys.clear(); await w(2.0);`;
const gust = (g) => `${g} ${WIND(5.5)} await w(1.2); ${WIND(7.2)} await w(0.6); ${WIND(9)} await w(1.4); ${WIND(7.2)} await w(0.6); ${WIND(5.5)} await w(1.4); ${UNWIND}`;
const still = (g) => `${g} ${WIND(0)} await w(3.0); ${UNWIND}`;

export const CLIPS = {
  // 1. run-stop: a sprint, released (player.js's own deceleration), side lens
  cRunStop: { sim: true, frame: 'F15', pose: 'idle', lens: { a: 'side', d: 3.2, h: 1.0, look: 0.9, fov: 40 }, js: runStop(G2) },
  cRunStopOld: { sim: true, frame: 'F15', pose: 'idle', lens: { a: 'side', d: 3.2, h: 1.0, look: 0.9, fov: 40 }, js: runStop(G0) },
  // 2. a 180 deg turn on the spot in 0.5 s, three-quarter back
  cTurn: { sim: true, frame: 'F02', pose: 'idle', lens: { a: 150, d: 2.6, h: 1.1, look: 0.9, fov: 40 }, js: `${G2} await w(0.5); ${TURN(180, 0.5)} await w(1.4);` },
  // 3. a roll from a jog, side lens
  cRoll: { sim: true, frame: 'F15', pose: 'idle', lens: { a: 'side', d: 3.4, h: 1.0, look: 0.8, fov: 42 }, js: `${G2} C.input.keys.add('KeyW'); await w(0.8); p.dodge?.(); await w(1.0); C.input.keys.clear(); await w(1.0);` },
  // 4. a jump and its landing standing (the page has no 1.2 m drop at a frame's place: the jump's own fall)
  cLand: { sim: true, frame: 'F15', pose: 'idle', lens: { a: 'side', d: 3.0, h: 1.0, look: 0.9, fov: 40 }, js: `${G2} await w(0.4); p.jump?.(); await w(1.2); p.jump?.(); await w(1.4);` },
  // 5. the gust, standing: 5.5 m/s rising to 9 and back, three-quarter back
  cGust: { sim: true, frame: 'F02', pose: 'idle', lens: { a: 140, d: 2.6, h: 1.1, look: 0.9, fov: 40 }, js: gust(G2) },
  cGustOld: { sim: true, frame: 'F02', pose: 'idle', lens: { a: 140, d: 2.6, h: 1.1, look: 0.9, fov: 40 }, js: gust(G0) },
  // 6. the crouch-walk, three-quarter front
  cCrouchWalk: { sim: true, frame: 'F18', pose: 'idle', lens: { a: '3q', q: 50, d: 2.6, h: 0.9, look: 0.7, fov: 40 }, js: `${G2} p.setCrouch?.(true); await w(0.6); C.input.keys.add('KeyW'); await w(2.4); C.input.keys.clear(); await w(0.8);` },
  // 7. the studio still: still air, three-quarter front at the studio place
  cStill: { sim: true, frame: 'F08', pose: 'idle', lens: { a: 35, d: 2.4, h: 1.2, look: 1.0, fov: 40 }, js: still(G2) },
  cStillOld: { sim: true, frame: 'F08', pose: 'idle', lens: { a: 35, d: 2.4, h: 1.2, look: 1.0, fov: 40 }, js: still(G0) },
  // 8. the sprint side-on (F15's staging)
  cSprint: { sim: true, frame: 'F15', pose: 'idle', lens: { a: 'side', d: 3.0, h: 1.0, look: 0.9, fov: 40 }, js: `${G2} C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft'); await w(3.0); C.input.keys.clear();` },
  // 9. the heavy lunge (F19's staging)
  cLunge: { sim: true, frame: 'F19', pose: 'idle', lens: { a: '3q', q: 70, d: 3.1, h: 1.2, look: 1.0, fov: 42 }, js: `${G2} const mel = C.combat.melee; mel.aimLock = 0; mel.drawLance(30); await w(1.2); C.input.mouse.buttons |= 1; await w(0.9); C.input.mouse.buttons &= ~1; await w(1.2);` },
  // 10. run, sprint and turns through the game's chase camera
  cChase: { sim: true, frame: 'F15', pose: 'idle', lens: null, js: `${G2} C.input.keys.add('KeyW'); await w(1.2); C.input.keys.add('ShiftLeft'); await w(1.5); C.input.keys.delete('ShiftLeft'); C.input.keys.add('KeyD'); await w(0.8); C.input.keys.delete('KeyD'); C.input.keys.add('KeyA'); await w(0.8); C.input.keys.clear(); await w(1.2);` },
};
