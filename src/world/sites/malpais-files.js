/**
 * THE MALPAIS' FILES (Milestone 3 wave 2, area A): what the region fetches when it is approached, never at boot (MP11:
 * 0 Malpais bytes in the first load; regions.js `malpais.files` holds the same prefix). Pure data: Node reads it (Tier 0's
 * shipped ledger takes MALPAIS_FILES as a deferred set, tools/tier0/budgets.json) and so does the page
 * (./malpais-region.js).
 *
 *   MALPAIS_LAYERS   the ground's four layers in two KTX2 arrays (tools/build/ground/gen-malpais-layers.mjs writes them):
 *                    ids in array order, the tile (m) each is read at, the files relative to public/
 *   MALPAIS_FILES    every file the region fetches, relative to public/ (the deferred set)
 */
export const MALPAIS_LAYERS = Object.freeze({
  size: 512,
  ids: Object.freeze(['aa', 'pahoehoe', 'cinder', 'scree']),
  /** metres a tile, by layer (the shader reads layer i at xz / tile) */
  tile: Object.freeze({ aa: 2.6, pahoehoe: 3.4, cinder: 1.6, scree: 2.2 }),
  files: Object.freeze({ a: 'textures/malpais/malpais_a.ktx2', n: 'textures/malpais/malpais_n.ktx2' }),
});

export const MALPAIS_FILES = Object.freeze([MALPAIS_LAYERS.files.a, MALPAIS_LAYERS.files.n]);
