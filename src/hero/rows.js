/**
 * CALIMA · Brea's boot rows (hero-body W0b; plan §3.2 contract "`assets.specs`
 * rows + `SPECS.hero`", pipeline doc §2.1: "hero-body swaps its url (and
 * targetHeight / yOffset) to Brea in W0b").
 *
 * The one-row data edit of `src/core/assets.specs.js` is pipeline's to make
 * (it owns the file). Until it lands, this module — imported by the Player, so
 * it evaluates before `new Assets()` copies the rows — points the `hero` row at
 * Brea and adds the two hero-body boot rows the Player equips synchronously
 * (the default outfit and the stow kit). Once pipeline's row says Brea, the
 * `hero` override is a no-op; the two part rows stay hero-body's (they move to
 * armory with `src/hero/**` at W1 day 1).
 *
 * Row shape: `assets.specs.js` (url, targetHeight, yaw, yOffset?, ...). The
 * part rows are never added to the scene: `src/hero/outfit.js` and
 * `stowkit.js` bind clones of their meshes to the Player's bones by name, so
 * their own normalisation does not matter (targetHeight is the body's).
 */
import { SPECS as CORE_SPECS } from '../core/assets.specs.js';
import { SPECS, ANIMS } from '../core/assets.js';

/** Brea's body GLB: `targetHeight` makes the BODY 1.72 m (asset extras r5Hero). */
export const BREA_URL = '/models/hero/brea.glb';
export const HERO_ROWS = {
  hero: { url: BREA_URL, targetHeight: 1.77913, yaw: 0, required: true },
  heroOutfitPan1: { url: '/models/hero/outfit-pan-1.glb', targetHeight: 1.72, yaw: 0 },
  heroStowKit: { url: '/models/hero/kit/stowkit-v0.glb', targetHeight: 1.72, yaw: 0 },
};
/** Which outfit row is the default loadout (bible §3.9). */
export const DEFAULT_OUTFIT = 'heroOutfitPan1';

/** Idempotent: point `hero` at Brea (unless pipeline already did) and add the part rows. */
export function applyHeroRows(specs) {
  if (specs.hero?.url !== BREA_URL) specs.hero = { ...HERO_ROWS.hero };
  for (const k of ['heroOutfitPan1', 'heroStowKit']) if (!specs[k]) specs[k] = { ...HERO_ROWS[k] };
  return specs;
}
// assets.js derives its own SPECS from assets.specs.js at ITS evaluation (it is
// imported by main.js before the Player), and `new Assets()` copies that one:
// both get the rows, so every reader agrees which body is the hero.
applyHeroRows(CORE_SPECS);
applyHeroRows(SPECS);

/**
 * Brea's NATIVE clip pack (UAL2 on the UBC skeleton, no retarget; R15): the
 * climb, the slide, consume, knockback. Loaded raw like `ual` (meshes hidden,
 * never added to the scene) into `ctx.assets.anims.heroUal2`.
 */
export const HERO_ANIMS = { heroUal2: { url: '/models/hero/brea-clips-ual2.glb' } };
for (const [k, v] of Object.entries(HERO_ANIMS)) if (!ANIMS[k]) ANIMS[k] = { ...v };
