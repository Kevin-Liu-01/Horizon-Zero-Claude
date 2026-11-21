/**
 * THE KILN'S FIRE BEHIND ITS DOOR, ITS GLOW (Milestone 3 wave 3c, area C). The coal bed itself is geometry in the GLB
 * (tools/build/instruments/gen-m3-art.mjs `coalBed`: a heap of faceted coals behind the grate, a hot heart
 * 'r5-kiln-fire' and a dull crust 'r5-kiln-crust', five low tongues of flame); this is how bright the two glow while the
 * door stands open: a base and a three-rate flicker, the same for the game (./kind.js) and the art page
 * (tools/gates/instruments/m3/art.js), so a frame at a given sim time is the same frame. Shut: 0 (the fire is behind the
 * shut door). Imports nothing.
 */
export const FIRE_GLOW = Object.freeze({ base: 0.9, flicker: 0.28, hz: Object.freeze([7.3, 2.1]), crustK: 0.85 });

/** The fire's emissive gain at time t with the door open by `open` (0..1). */
export function fireFlicker(t, open = 1, seed = 0) {
  if (open <= 0) return 0;
  const [a, b] = FIRE_GLOW.hz;
  const n = 0.5 * Math.sin(t * a + seed) + 0.3 * Math.sin(t * b * 1.7 + seed * 2.1) + 0.2 * Math.sin(t * 13.1 + seed * 0.7);
  return open * FIRE_GLOW.base * (1 + FIRE_GLOW.flicker * n);
}
