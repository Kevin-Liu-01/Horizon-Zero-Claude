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
  // 7. all six transitions through the game's chase camera
  hChase: { sim: true, frame: 'F16', pose: 'idle', lens: null,
    js: `${RESET} await w(0.3); ${K1} await w(1.0); C.combat._holsterT = 0.001; await w(0.9); ${K2} await w(1.0); mel.holsterLance(); await w(0.9); ${K1} await w(0.9); ${K2} await w(1.2); ${K1} await w(1.3);` },
  // 8. at a jog: both swaps, a sprint stow, and each held carry at a run
  hJog: { sim: true, frame: 'F15', pose: 'idle', lens: { a: 'side', d: 3.0, h: 1.1, look: 0.95, fov: 42 },
    js: `${RESET} C.input.keys.add('KeyW'); await w(0.6); ${K1} await w(1.2); ${K2} await w(1.4); ${K1} await w(2.2); ${K2} await w(1.0); C.input.keys.add('ShiftLeft'); await w(2.0);` },
};
