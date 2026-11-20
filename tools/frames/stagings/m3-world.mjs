/**
 * MILESTONE 3 WORLD STAGINGS (area A, the Malpais and the Kiln Yards; M3 briefs §3.3, wave 1 blockout). Merged by
 * tools/frames/stagings/index.mjs like every lane file; filmed only when named (`film.mjs --only F56,F57`).
 *
 *   FRAMES   F56, F57 and F58 as fixed lenses on the grey blockout (their look, their masked crops and their counted
 *            targets are wave 2-3), and F51-cost: F51's lens (60 m over the Pans, golden, the Ring and Saltrow below) with
 *            no kite and no Brea, so the world's cost from the flight frame is known at blockout. F51 itself (Brea under
 *            the kite) is area B's frame; this is a lane frame, never judged against a reference.
 *   MASKS    the accepted frames the Malpais' new things may be seen in, and the headrooms the computed masks are built
 *            from (tools/world/skyline-masks.mjs --region m3; M3 briefs §2 rule 19): the Malpais' ground (its look
 *            changes in wave 2), Rust Cone, the Yards' towers and stacks (to 29 m over the shelf), the hornitos and their
 *            steam (to 20 m), the tube shelter's crust.
 */
import { HORNITOS, TUBE_SHELTER, STEAM } from '../../../src/world/sites/malpais-layout.js';
import { heightAt } from '../../../src/world/island/recipe.js';

/* (M3 wave 2b, MP4) the steam as counted subjects: each plume a column of air over its foot, from 0.5 m over the rim or
 * the vent to 0.8 of its rise (the recipe's ground in Node; the page's drawn ground differs by centimetres) */
const steamShapes = (ids = null) => STEAM.filter((s) => !ids || ids.includes(s.id)).map((s) => ({ id: s.id, kind: 'cylinder', x: s.x, z: s.z, r: 2, h: s.h * 0.8, y0: +(heightAt(s.x, s.z) + s.base + 0.5).toFixed(2) }));

export const lane = 'm3-world';

/** @type {ReadonlyArray<object>} */
export const FRAMES = Object.freeze([
  {
    id: 'F51-cost', subject: "F51's lens at blockout: 60 m over the Pans, golden, the Ring and Saltrow below (no kite, no Brea)", in: 'M3', hour: 18.25, weather: 'trade',
    at: { en: [-200, -290] }, bearing: 280, camera: { mode: 'eye', eye: 60, pitch: -20, fov: 55 }, state: { pose: 'idle', hud: false },
    ref: { written: "lane frame (area A, wave 1): the world's cost from the flight frame's height before the kite exists; the Sounding Ring 22 deg left of centre, Saltrow 32 deg right, the salt field below. Measured only (GPU ms by the back-to-back readback), never judged" },
  },
  {
    id: 'F56', subject: "the Malpais from Rust Cone's south-west flank, above the hornito field (R2)", in: 'M3', hour: 17.75, weather: 'trade',
    /* M3 wave 2 (the orchestrator's ruling R2, provisional: "F56's lens moves to (250, -130) so Malpais ground shows; the
     * Scar is not in it"; the old text: "the Malpais from the Scar's upper end"). From (250, -130) the Scar's planed floor
     * runs 86 m west of the lens on bearings 233-360: every west-looking bearing shows it (Node ray count from the recipe,
     * 32 x 18 rays, fov 55: bearing 270 pitch 0 -> Malpais 54 %, the Scar 25 %). Facing 160 and pitched down 20 deg the
     * lens looks down Rust Cone's scree past the hornito field to the flow's sea front: Malpais ground 47 % of the rays
     * (Rust Cone's flank 27 %, the lava past 60 m 21 %), the sea 26 %, sky 21 %, the Scar 0 % (the subject check's Node
     * half: Malpais ground 51.5 % of the frame, 7 of 7 hornitos in the safe area: PASS) */
    /* M3 wave 2b (MP7: "F56 closer to its KEY 'Malpais' strip crop than the grey blockout was"): turned 18 deg right to 178
     * and up 1 deg to -19 (was 160 and -20). At 160 Rust Cone's own flank filled the left 40 % of the frame up close, its
     * scree a large repeating red pattern (the review at 9d1acc3: "further from its crop"). At 178 the cone's flank is 9 %
     * of the rays and the frame looks down over the spire field below the cone's foot (malpais-rocks.js SPIRE_FIELDS
     * 'cone-foot', 60-90 m out) and the steaming hornito field to the flow's sea front (Node ray count, 48 x 27 rays: Malpais
     * ground 38 %, the sea 38 %, sky 17 %, the Holds' coast 8 %; 55 spires' tops in the safe area and over the ground; the
     * subject check's Node half: Malpais ground 41.9 %, 5 of 7 hornitos, 7 of 11 plumes) */
    at: { en: [250, -130] }, bearing: 178, camera: { mode: 'eye', eye: 1.7, pitch: -19, fov: 55 }, state: { pose: 'idle', hud: false },
    /* its own subjects (rule 17; tools/frames/subjects.mjs's F56 row asks for Rust Cone's TOP in the lens, which no lens at
     * R2's point can hold without looking 57 deg up the cone's own flank: the top stands 69 m over the lens, 44 m off). R2's
     * frame: the Malpais ground (the table's own bar), the hornito field below it, and (wave 2b, MP4) >= 3 steam sources */
    subjects: [
      { name: 'the Malpais ground', kind: 'ground', region: 'malpais', minShare: 0.25 },
      { name: 'the hornito field (>= 5 cones)', kind: 'shapes', min: 5, minPx: 12, shapes: HORNITOS.map((h) => ({ id: h.id, kind: 'cone', x: h.x, z: h.z, r: h.r, rTop: h.r * 0.3, h: h.h })) },
      { name: 'the steam (>= 3 sources)', kind: 'shapes', min: 3, minPx: 20, shapes: steamShapes() },
    ],
    ref: { crops: ['key-malpais'], written: "the KEY Malpais strip, form only (its glowing vent and lava masked: the Malpais is cold). Wave 2b: from Rust Cone's south-west foot down over a field of dark spires, the aa's clinker and the pahoehoe's sheets toward the steaming hornito field and the sea; >= 3 steam sources; no lava, nothing glowing (MP1, MP2, MP4)" },
  },
  {
    /* M3 wave 2 fix round 1 (MP1's night half, "no terrain pixel brighter than the sky"): F56's lens at 22:30, the region
     * built as in F56; a lane frame, measured, never judged against a reference */
    id: 'F56-night', subject: "F56's lens at night (MP1: the Malpais cold, no ground brighter than the sky)", in: 'M3', hour: 22.5, weather: 'trade',
    at: { en: [250, -130] }, bearing: 160, camera: { mode: 'eye', eye: 1.7, pitch: -20, fov: 55 }, state: { pose: 'idle', hud: false },
    subjects: [{ name: 'the Malpais ground', kind: 'ground', region: 'malpais', minShare: 0.25 }],
    ref: { written: "lane frame (area A, MP1): F56's lens at 22:30. Measured only: no Malpais ground pixel brighter than the sky's median; nothing glows" },
  },
  {
    id: 'F57', subject: 'the Kiln Yards from the apron, dusk (blockout)', in: 'M3', hour: 19.5, weather: 'trade',
    // fix round 1: from the apron's south-east corner (its frame u 23.5, v -9.5), looking north-west and up 24 deg, so both
    // tower stubs stand whole (their broken rims in frame) and the four stack tops can be counted. At 3283f5b (221.4, -29.1;
    // bearing 300, pitch 6, fov 60) every stack top and tower-a's rim were above the frame and tower-b stood behind the
    // stacks, so the stub read as a dark spire. Node, this lens: rims and stack tops at x 0.00-0.63, y 0.16-0.88 of the
    // half-frame, the four caps at y -0.87, none behind ground
    // M3 wave 2: pitched up 20 deg (was 24) and widened to fov 60 (was 55), so the four wellheads' caps stand inside the
    // safe area (rule 17's check at a91c4f7: at 24 deg the caps sat 29-52 % in it, on the frame's lower edge); and 3.4 m
    // west along the bench's edge, turned to 315 (was (224.2, -32.4), 310): in the page at e664972 the stacks stood in
    // front of tower-b and left 67 % of it unoccluded (the check asks 70 %); from here they cover 31 % of its width, not 39
    // M3 wave 2 fix round 1: 2 m east along the bench's edge (was (221, -34)): at 036b486 the page still found tower-b 67 %
    // unoccluded (14 of 21 samples; the check asks 70 %), stack-4 standing across it. From (223, -34) stack-4 passes to
    // tower-b's left: Node (the page's own tolerance, the stacks, the towers and the racks as occluders) 18 of 21 samples
    // clear, tower-a 21 of 21, the four stacks and the four caps in the safe area
    at: { en: [223, -34] }, bearing: 315, camera: { mode: 'eye', eye: 1.7, pitch: 20, fov: 60 }, state: { pose: 'idle', hud: false },
    ref: { crops: ['board-kilnyards'], written: "the BOARD Kiln Yards panel. Wave 1 blockout: from the apron's south-east corner looking north-west and up: the four wellheads' caps along the bench's lower edge, the manifold rack, the four flue stacks with their tops in frame, the two tower stubs whole on the shelf; only the wellheads' caps glowing. Wave 2: two tiled stubs 22-28 m, 3-5 stacks, pipe racks, 4 wellheads (MP5, MP7)" },
  },
  {
    id: 'F58', subject: "the hornito field and the tube shelter's mouth", in: 'M3', hour: 17.75, weather: 'trade',
    /* M3 wave 2b (R9, provisional: "the tube shelter moves to the hornito field (hornitos stand on lava tubes), so F58 can
     * hold both"): from the field's north-east rim, 21 m NNE of the tube's mouth, looking SSW down over the field and the
     * mouth (was (262, -188) facing 150 from B6's ground, where the mouth, then at the Yards, was behind the lens). The sun at
     * 17:45 stands at 258, 52 deg right of the lens (out of the frame): the cones are lit from the side, the steam against the
     * sea's light. Node (subject-math, the hornitos as cones and the tube's crust as occluders, the terrain): 7 of 7
     * hornitos pass (56-158 px, 95 % or more unoccluded), the mouth 192 px, all in the safe area */
    at: { en: [313.5, -177.3] }, bearing: 206, camera: { mode: 'eye', eye: 2.0, pitch: -8, fov: 55 }, state: { pose: 'idle', hud: false },
    subjects: [
      { name: 'the hornitos (>= 5 of 3-6 m)', kind: 'shapes', min: 5, minPx: 20, shapes: HORNITOS.map((h) => ({ id: h.id, kind: 'cone', x: h.x, z: h.z, r: h.r, rTop: h.r * 0.3, h: h.h })) },
      { name: 'the tube shelter\'s mouth', kind: 'shapes', minPx: 30, shapes: [{ id: 'tube-mouth', kind: 'cylinder', x: TUBE_SHELTER.mouth.x, z: TUBE_SHELTER.mouth.z, r: TUBE_SHELTER.half, h: TUBE_SHELTER.height }] },
      { name: 'the steam (>= 3 of the hornitos steaming)', kind: 'shapes', min: 3, minPx: 20, shapes: steamShapes(HORNITOS.filter((h) => h.steam).map((h) => `steam-${h.id}`)) },
    ],
    ref: { written: "the hornito field from its west rim: seven spatter chimneys of 3-6 m on the lava flat, four of them steaming; the tube shelter's mouth at the field's east edge, its crust running away down the flow; the shelter's Brazier unlit, a dormant Peg nest inside (MP4, MP6)" },
  },
]);

/**
 * M3 wave 2: the Malpais is built on the region's approach (src/world/sites/malpais-region.js), never at boot. A frame in
 * the Malpais asks for it, waits until it is in the scene (20 s at most, else a stand-in), and lets it go after the shot,
 * so every film of these frames builds it from cold as play does. Every lens is fixed.
 */
const malpaisBuilt = {
  async world(f, api) {
    const M = api.C?.terrain?.malpais;
    if (!M?.ensure) { api.standIn('no Malpais region on the terrain (the blockout drawn at boot)'); return; }
    const ok = await Promise.race([M.ensure(), api.sleep(20000).then(() => 'timeout')]);
    if (ok !== true) api.standIn(`the Malpais was not built (${ok === 'timeout' ? '20 s' : M.state}${M.stats?.error ? ': ' + M.stats.error : ''})`);
    api.undo(() => M.release());
  },
};
export const STAGINGS = Object.freeze({ F56: malpaisBuilt, 'F56-night': malpaisBuilt, F57: malpaisBuilt, F58: malpaisBuilt });

/**
 * The accepted frames the Malpais can be seen in, by their computed masks (tools/world/skyline-masks.mjs --region m3,
 * built from each frame's own filmed lens): every accepted frame is computed; those whose mask is empty are listed
 * here with headroom 0 so the list is the whole accepted set and the empty ones are explicit.
 */
export const MASKS = Object.freeze({
  region: Object.freeze({ malpais: 12, yards: Object.freeze({ site: 'kiln-yards', r: 80, headroom: 32 }), hornitos: Object.freeze({ site: 'hornito-field', r: 45, headroom: 20 }) }),
});
