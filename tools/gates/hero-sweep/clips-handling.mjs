/**
 * M1a weapons step 1 — the handling clips for `session.mjs --clips` (merged into its CLIP_DEFS). Every clip is on
 * SIMULATION time (`sim: true`: 60 frames a second of sim time, each also written at quarter speed from the same frames).
 * `lens`: riding her, `a` deg round her from her front (+ to her LEFT), `d` m out, `h` m up, aimed `look` m over her
 * feet; null = the game's own chase camera. `js` runs in the page with `C` (ctx), `p` (player) and `w(s)` (advance s
 * seconds of sim time, a frame captured each step). The grabbing hand faces the lens.
 */
const RESET = `const mel = C.combat.melee; mel.aimLock = 0; C.combat._holsterT = 0;`;
/** key 1 / key 2 as the player presses them (ui/quickslots.js select: the same calls the key handler makes) */
const K1 = `C.quickslots.select(1);`, K2 = `C.quickslots.select(2);`;
export const CLIPS = {
  // 1. the bow off her back and back on (the 8 s timer's stow, its calm tempo): left-rear three-quarter
  hBow: { sim: true, frame: 'F16', pose: 'idle', lens: { a: 140, d: 2.3, h: 1.25, look: 1.0, fov: 40 },
    js: `${RESET} await w(0.3); ${K1} await w(1.3); C.combat._holsterT = 0.001; await w(1.3);` },
  // 2. the lance drawn (key 2) and put back (B): left-front three-quarter
  hLance: { sim: true, frame: 'F16', pose: 'idle', lens: { a: 50, d: 2.6, h: 1.25, look: 1.0, fov: 40 },
    js: `${RESET} await w(0.3); ${K2} await w(1.4); mel.holsterLance(); await w(1.2);` },
  // 3. the swaps: bow out, key 2, then key 1: her left side
  hSwap: { sim: true, frame: 'F16', pose: 'idle', lens: { a: 90, d: 2.7, h: 1.2, look: 1.0, fov: 40 },
    js: `${RESET} ${K1} await w(1.0); ${K2} await w(1.4); ${K1} await w(1.6);` },
  // 4. RMB from stowed into a full draw and the loose: the existing draw lens
  hAim: { sim: true, frame: 'F16', pose: 'idle', aimLens: true, lens: { a: -50, d: 2.5, h: 1.35, look: 1.2, fov: 40 },
    js: `${RESET} await w(0.2); C.input.mouse.buttons |= 4; await w(0.6); C.input.mouse.buttons |= 1; await w(1.4); C.input.mouse.buttons &= ~1; await w(0.5); C.input.mouse.buttons &= ~4; await w(0.4);` },
  // 5. a click from holstered into light 1
  hClick: { sim: true, frame: 'F16', pose: 'idle', lens: { a: 60, d: 2.8, h: 1.2, look: 1.0, fov: 42 },
    js: `${RESET} await w(0.3); C.input.mouse.buttons |= 1; await w(0.1); C.input.mouse.buttons &= ~1; await w(1.3);` },
  // 6. the hand, close (0.8 m): the grab at the bow's limb, then at the lance's haft
  hHandBow: { sim: true, frame: 'F16', pose: 'idle', lens: { a: 150, d: 0.85, h: 1.05, look: 0.98, fov: 45 },
    js: `${RESET} await w(0.2); ${K1} await w(0.7); C.combat._holsterT = 0.001; await w(0.8);` },
  hHandLance: { sim: true, frame: 'F16', pose: 'idle', lens: { a: 115, d: 0.9, h: 0.95, look: 0.9, fov: 45 },
    js: `${RESET} await w(0.2); ${K2} await w(0.7); mel.holsterLance(); await w(0.8);` },
  // 7. all six transitions from behind her (M1a weapons fix 1, the judge: the staged game camera showed her in profile,
  //    "brief ruling 2 is not met"; a lens riding her from straight behind at the chase camera's height and distance)
  hChase: { sim: true, frame: 'F16', pose: 'idle', lens: { a: 180, d: 3.4, h: 1.7, look: 1.15, fov: 50 },
    js: `${RESET} await w(0.3); ${K1} await w(1.0); C.combat._holsterT = 0.001; await w(0.9); ${K2} await w(1.0); mel.holsterLance(); await w(0.9); ${K1} await w(0.9); ${K2} await w(1.2); ${K1} await w(1.3);` },
  // 8. at a jog: both swaps, a sprint stow, and each held carry at a run
  hJog: { sim: true, frame: 'F15', pose: 'idle', lens: { a: 'side', d: 3.0, h: 1.1, look: 0.95, fov: 42 },
    js: `${RESET} C.input.keys.add('KeyW'); await w(0.6); ${K1} await w(1.2); ${K2} await w(1.4); ${K1} await w(2.2); ${K2} await w(1.0); C.input.keys.add('ShiftLeft'); await w(2.0);` },
  /* 8b. (M1a weapons fix 1, the judge: "the required five seconds of each held carry at a run were not filmed") the bow
   *     held at a run for five seconds (key 1, the timer kept up), then the lance held at a run for five (key 2 held) */
  hHeld: { sim: true, frame: 'F15', pose: 'idle', lens: { a: 'side', d: 3.0, h: 1.1, look: 0.95, fov: 42 },
    js: `${RESET} C.input.keys.add('KeyW'); await w(0.6); ${K1} for (let i = 0; i < 10; i++) { C.combat.noteCombatAction?.(); await w(0.5); } ${K2} mel.drawLance(30); await w(5.5);` },
  /* 10. (M1a weapons round 2) the interrupts, close on the hands from her left front (1.9 m): a stow asked mid-draw (the
   *     draw holds its course to the guard, then stows), the draw asked again mid-stow (it turns back at the point of
   *     the draw that holds the lance where the stow had it), then the bow asked mid-stow of the lance (key 1) */
  hIntr: { sim: true, frame: 'F16', pose: 'idle', lens: { a: 45, d: 1.9, h: 1.2, look: 1.0, fov: 42 },
    js: `${RESET} await w(0.3); ${K2} await w(0.15); mel.holsterLance(); await w(0.9); mel.drawLance(); await w(0.9); mel.holsterLance(); await w(0.18); ${K1} await w(1.4);` },
  /* 9. a roll during each draw, once before the grip and once after: the bow (key 1, the roll at 0.08 s and at 0.30 s)
   *    and the lance (key 2, at 0.03 s and at 0.20 s); her left side */
  hRoll: { sim: true, frame: 'F16', pose: 'idle', lens: { a: 90, d: 3.4, h: 1.2, look: 0.9, fov: 46 },
    js: `${RESET} await w(0.3); ${K1} await w(0.08); p.dodge(); await w(1.4); C.combat._holsterT = 0.001; await w(1.2); ${K1} await w(0.30); p.dodge(); await w(1.4); C.combat._holsterT = 0.001; await w(1.2); ${K2} await w(0.03); p.dodge(); await w(1.4); mel.holsterLance(); await w(1.0); ${K2} await w(0.20); p.dodge(); await w(1.4); mel.holsterLance(); await w(1.0);` },
};
