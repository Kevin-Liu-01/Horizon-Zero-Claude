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
    id: 'F56', subject: "the Malpais from the Scar's upper end (blockout)", in: 'M3', hour: 17.75, weather: 'trade',
    at: { en: [251, -43] }, bearing: 140, camera: { mode: 'eye', eye: 2.0, pitch: -3, fov: 55 }, state: { pose: 'idle', hud: false },
    ref: { written: "wave 1 blockout: from the Scar's upper end looking south-east over the Malpais: Rust Cone's crest on the left of centre, the lava falling away toward the hornito field and the sea. Wave 2-3: aa and pahoehoe both present, cinder bands, Rust Cone; 0 emissive ground texels, >= 3 steam sources (MP1, MP2, MP4)" },
  },
  {
    id: 'F57', subject: 'the Kiln Yards from the apron, dusk (blockout)', in: 'M3', hour: 19.5, weather: 'trade',
    at: { en: [221.4, -29.1] }, bearing: 300, camera: { mode: 'eye', eye: 1.7, pitch: 6, fov: 60 }, state: { pose: 'idle', hud: false },
    ref: { written: 'wave 1 blockout: from the apron\'s east end looking west-north-west: the four wellheads in a row along the bench, the manifold rack over it, the four flue stacks beyond the cut, the two tower stubs on the shelf; only the wellheads\' caps glowing. Wave 2: two tiled stubs 22-28 m, 3-5 stacks, pipe racks, 4 wellheads (MP5, MP7)' },
  },
  {
    id: 'F58', subject: "the hornito field and the tube shelter's mouth (blockout)", in: 'M3', hour: 17.75, weather: 'trade',
    at: { en: [262, -188] }, bearing: 150, camera: { mode: 'eye', eye: 2.2, pitch: -6, fov: 55 }, state: { pose: 'idle', hud: false },
    ref: { written: "wave 1 blockout: the hornito field from its north-west edge (B6's ground): seven grey spatter cones of 3-6 m on the lava flat. The tube shelter's mouth is at the Yards (its own lens comes with its look). Wave 3: >= 5 hornitos of 3-6 m, >= 3 steaming; the shelter's Brazier unlit; a dormant Peg nest inside (MP4, MP6)" },
  },
]);

/** No moving subject at blockout: every lens is fixed. */
export const STAGINGS = Object.freeze({});

/**
 * The accepted frames the Malpais can be seen in, by their computed masks (tools/world/skyline-masks.mjs --region m3,
 * built from each frame's own filmed lens): every accepted frame is computed; those whose mask is empty are listed
 * here with headroom 0 so the list is the whole accepted set and the empty ones are explicit.
 */
export const MASKS = Object.freeze({
  region: Object.freeze({ malpais: 12, yards: Object.freeze({ site: 'kiln-yards', r: 80, headroom: 32 }), hornitos: Object.freeze({ site: 'hornito-field', r: 45, headroom: 20 }) }),
});
