/**
 * Pipeline recipe — the HUMAN PROOF SET from staged sources (W0b).
 *
 * Builds the Round-5 proof's six human GLBs (heroine base, male NPC base, four
 * outfits) through the promoted library `tools/build/humans.mjs`, reading the
 * CC0 Quaternius sources ONLY from `models-staging/r5-src/` (rows ubc-standard,
 * mco-fantasy-standard). Nothing in the game loads these files: they exist so that
 * A-build-deterministic exercises the human path (gltf-transform merge, LBS
 * re-bind, sharp WebP, meshopt) that Brea (hero-body) and the NPCs
 * (settlements) are built on, before those recipes land.
 *
 * PROOF = true: the driver writes PROOF outputs only under an explicit
 * `--out <dir>` (never into the repository), so they can never ship.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LANE = 'pipeline';
export const PROOF = true;
export const RECIPE = 'tools/build/pipeline/gen-humans-proof.mjs';
const OUTFIT_NAMES = ['ranger', 'peasant', 'male-ranger', 'male-peasant'];
export const OUTPUTS = [
  'proof/humans/heroine-base.glb', 'proof/humans/npc-male-base.glb',
  ...OUTFIT_NAMES.map((n) => `proof/humans/outfit-${n}.glb`),
];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export async function build({ out }) {
  if (!out || path.resolve(out) === ROOT) throw new Error('gen-humans-proof: PROOF outputs need an explicit --out outside the repository');
  const H = await import('../humans.mjs');
  const prov = (sources) => ({ recipe: RECIPE, sources, licence: 'CC0-1.0' });
  const stats = {};
  stats['heroine-base'] = await H.buildHeroineBase(path.join(out, OUTPUTS[0]), { provenance: prov(['ubc-standard']) });
  stats['npc-male-base'] = await H.buildMaleBase(path.join(out, OUTPUTS[1]), { provenance: prov(['ubc-standard', 'mco-fantasy-standard']) });
  for (const [i, n] of OUTFIT_NAMES.entries()) {
    stats[`outfit-${n}`] = await H.buildOutfit(n, path.join(out, OUTPUTS[2 + i]), { provenance: prov(n.startsWith('male') ? ['mco-fantasy-standard'] : ['ubc-standard', 'mco-fantasy-standard']) });
  }
  return stats;
}
