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
     * 32 x 18 rays, fov 55: bearing 270 pitch 0 -> Malpais 54 %, the Scar 25 %). Facing 155 and pitched down 15 deg the
     * lens looks down Rust Cone's scree past the hornito field to the flow's sea front: Malpais ground 45 % of the rays
     * (Rust Cone's flank 29 %, the lava below 16 %), the sea 26 %, sky 25 %, the Scar 0 % */
    at: { en: [250, -130] }, bearing: 155, camera: { mode: 'eye', eye: 1.7, pitch: -15, fov: 55 }, state: { pose: 'idle', hud: false },
    ref: { crops: ['key-malpais'], written: "the KEY Malpais strip, form only (its glowing vent and lava masked: the Malpais is cold). Wave 2: Rust Cone's red scree in the foreground, the aa's clinker and spires and the pahoehoe's sheets below toward the hornito field and the sea; no lava, nothing glowing. Wave 3: >= 3 steam sources (MP1, MP2, MP4)" },
  },
  {
    id: 'F57', subject: 'the Kiln Yards from the apron, dusk (blockout)', in: 'M3', hour: 19.5, weather: 'trade',
    // fix round 1: from the apron's south-east corner (its frame u 23.5, v -9.5), looking north-west and up 24 deg, so both
    // tower stubs stand whole (their broken rims in frame) and the four stack tops can be counted. At 3283f5b (221.4, -29.1;
    // bearing 300, pitch 6, fov 60) every stack top and tower-a's rim were above the frame and tower-b stood behind the
    // stacks, so the stub read as a dark spire. Node, this lens: rims and stack tops at x 0.00-0.63, y 0.16-0.88 of the
    // half-frame, the four caps at y -0.87, none behind ground
    at: { en: [224.2, -32.4] }, bearing: 310, camera: { mode: 'eye', eye: 1.7, pitch: 24, fov: 55 }, state: { pose: 'idle', hud: false },
    ref: { crops: ['board-kilnyards'], written: "the BOARD Kiln Yards panel. Wave 1 blockout: from the apron's south-east corner looking north-west and up: the four wellheads' caps along the bench's lower edge, the manifold rack, the four flue stacks with their tops in frame, the two tower stubs whole on the shelf; only the wellheads' caps glowing. Wave 2: two tiled stubs 22-28 m, 3-5 stacks, pipe racks, 4 wellheads (MP5, MP7)" },
  },
  {
    id: 'F58', subject: "the hornito field and the tube shelter's mouth (blockout)", in: 'M3', hour: 17.75, weather: 'trade',
    at: { en: [262, -188] }, bearing: 150, camera: { mode: 'eye', eye: 2.2, pitch: -6, fov: 55 }, state: { pose: 'idle', hud: false },
    ref: { written: "wave 1 blockout: the hornito field from its north-west edge (B6's ground): seven grey spatter cones of 3-6 m on the lava flat. The tube shelter's mouth is at the Yards (its own lens comes with its look). Wave 3: >= 5 hornitos of 3-6 m, >= 3 steaming; the shelter's Brazier unlit; a dormant Peg nest inside (MP4, MP6)" },
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
export const STAGINGS = Object.freeze({ F56: malpaisBuilt, F57: malpaisBuilt, F58: malpaisBuilt });

/**
 * The accepted frames the Malpais can be seen in, by their computed masks (tools/world/skyline-masks.mjs --region m3,
 * built from each frame's own filmed lens): every accepted frame is computed; those whose mask is empty are listed
 * here with headroom 0 so the list is the whole accepted set and the empty ones are explicit.
 */
export const MASKS = Object.freeze({
  region: Object.freeze({ malpais: 12, yards: Object.freeze({ site: 'kiln-yards', r: 80, headroom: 32 }), hornitos: Object.freeze({ site: 'hornito-field', r: 45, headroom: 20 }) }),
});
