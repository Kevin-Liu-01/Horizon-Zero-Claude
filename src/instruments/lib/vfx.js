/**
 * THE VFX PALETTE (instruments-core W0b; bible §5.8 elements, §9.1 palette;
 * gate `A-vfx-palette`). One leaf module, no imports, so `machine.js`,
 * `rig/fx.js`, `ai/attacks.js` and the legacy species files read the same
 * numbers without an import cycle.
 *
 * The bar: no particle, glint, arc or spark colour within ΔE2000 15 of
 * Horizon's sensor blue `#38c6ff` or its override teal `#19ffd0`
 * (measured in `A-vfx-palette`; every value here clears it).
 *
 * Elements per bible §5.8: `fire` = Cinder (#FF7A1A), `freeze` = Brine
 * (#BDE6E3), `shock` = Dust (#C98B4E). Glints are salt crust and bronze chips,
 * never ice blue.
 */
export const VFX_COLORS = Object.freeze({
  cinderHot: 0xfff1d8, cinderMid: 0xff7a1e, cinderLate: 0xc23a10,
  brineHot: 0xf1eee6, brineMid: 0xbde6e3, brineLate: 0x6f9e98,
  dustHot: 0xfff3d8, dustMid: 0xc98b4e, dustLate: 0x6e4a28,
  saltGlint: 0xf3efe4,      // seized-joint crust shatter / crawl glints
  bronzeChip: 0xe8c48a,     // shock arcs, generic sparks, projectile flashes (was ice blue 0xbfe8ff)
  beacon: 0xe9c77b,         // loot beacon column (was cyan 0x7fe8ff)
  seizedTint: 0xd6ece6,     // Seized (Brine) tint on plates (was 0xbfe9ff)
  flameLate: 0xc23a10,      // flame licks cool toward cinder, not toward the hostile lamp
  sensorPing: 0xf2ead3,     // radar / echolocation ping rings: the calm lamp token (bible §7.2)
});
