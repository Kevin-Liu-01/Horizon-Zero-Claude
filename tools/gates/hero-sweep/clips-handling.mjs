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
  /* 6b. (M1a weapons round 3, the wave 3 ruling) the bow's reverse take at the small of her back, from behind her left
   *     (close), then the two-hand regrip in front of her hip from her front-left (close): key 1 out, the timer's stow
   *     back. The hands toward the lens in each */
  hTakeRev: { sim: true, frame: 'F16', pose: 'idle', lens: { a: 165, d: 1.0, h: 1.05, look: 0.98, fov: 45 },
    js: `${RESET} await w(0.2); ${K1} await w(0.8); C.combat._holsterT = 0.001; await w(1.0);` },
  hRegrip: { sim: true, frame: 'F16', pose: 'idle', lens: { a: 25, d: 1.15, h: 1.05, look: 0.98, fov: 45 },
    js: `${RESET} await w(0.2); ${K1} await w(0.8); C.combat._holsterT = 0.001; await w(1.0);` },
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
  /* 11. (M2 polish) the lance's pull, close from her front-right: the right fist takes the haft from the left in front of
   *     her left hip and carries it round her front to the guard (PULL_FRONT), twice */
  hPull: { sim: true, frame: 'F16', pose: 'idle', lens: { a: -35, d: 1.7, h: 1.15, look: 1.0, fov: 44 },
    js: `${RESET} await w(0.3); ${K2} await w(1.2); mel.holsterLance(); await w(1.1); ${K2} await w(1.2); mel.holsterLance(); await w(1.0);` },
  /* 13. (M2 fix wave 4, the new lance choreography: the haft slides through her left fist, the right takes the butt in front
   *     of her belly) close enough that the hands read: the draw (key 2) and the asked stow (B) from her front-left
   *     three-quarter at 1.7 m; the same from behind her left (the left fist's take at the keeper and the seat); the swaps
   *     from her left front at 2.0 m; the draw and the stow at a jog from her side at 2.3 m */
  hLanceNear: { sim: true, frame: 'F16', pose: 'idle', lens: { a: 35, d: 1.7, h: 1.15, look: 1.0, fov: 44 },
    js: `${RESET} await w(0.3); ${K2} await w(1.3); mel.holsterLance(); await w(1.2);` },
  hLanceBack: { sim: true, frame: 'F16', pose: 'idle', lens: { a: 150, d: 1.8, h: 1.2, look: 1.0, fov: 44 },
    js: `${RESET} await w(0.3); ${K2} await w(1.3); mel.holsterLance(); await w(1.2);` },
  hSwapNear: { sim: true, frame: 'F16', pose: 'idle', lens: { a: 55, d: 2.0, h: 1.15, look: 1.0, fov: 44 },
    js: `${RESET} ${K1} await w(1.0); ${K2} await w(1.6); ${K1} await w(1.8);` },
  hJogDraw: { sim: true, frame: 'F15', pose: 'idle', lens: { a: 'side', d: 2.3, h: 1.1, look: 0.95, fov: 42 },
    js: `${RESET} C.input.keys.add('KeyW'); await w(0.8); ${K2} await w(1.4); mel.holsterLance(); await w(1.4);` },
  /* 12. (M2 polish) the gaff in the loop, from her front: the hand-over (the gaff only), key 1 (the bow out), key 3 (the
   *     bow back on her back, then the gaff drawn by her right hand), key 1 (the gaff back on its hanger, then the bow),
   *     key 3 again, then the gaff stowed. Last of the clips: the kit stays granted in the page */
  hGaffBow: { sim: true, frame: 'F16', pose: 'idle', lens: { a: 15, d: 2.5, h: 1.15, look: 0.95, fov: 42 },
    js: `${RESET} await p.hero?.grantOroKit?.({ gaff: true, windwall: false, pots: 0 }); await w(0.4); ${K1} await w(1.0); C.quickslots.select(3); await w(1.3); ${K1} await w(1.4); C.quickslots.select(3); await w(1.3); C.combat.gaff?.stow?.(); await w(1.0);` },
};
