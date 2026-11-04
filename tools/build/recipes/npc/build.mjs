/**
 * CALIMA — recipe: the NPC cast (settlements, W1 by R56 + R57 c; bible §6.2, §6.3; plan §4.1).
 *
 *   node tools/build/build-assets.mjs --only settlements
 *   R5_NPC_ONLY=salt-raker,atlas-pan node tools/build/build-assets.mjs --only settlements   (a partial build)
 *
 * OUTPUTS, under public/models/npc/:
 *   <archetype>.glb    one person (lib/human.mjs: skin atlas of its own, tiers, chains, props)
 *   atlas-pan.glb      the Pan Houses' faction atlas (1024² base, 512² normal + ORM)
 *   atlas-holds.glb    the Crescent Holds' faction atlas
 *   atlas-hair.glb     the shared hair + wrap atlas (512² x 3)
 *   npc-clips.glb      the clip pack, on the UBC skeleton (clips.mjs)
 *
 * Sources (CC0): Quaternius Universal Base Characters + Modular Character Outfits [Standard], Universal
 * Animation Library 1 + 2. Everything else is procedural. Deterministic: no clocks, no Math.random.
 */
import path from 'node:path';
import { ROOT } from './lib/kit/face.mjs';
import { ARCHETYPES } from './lib/archetypes.mjs';
import { buildNpc } from './lib/human.mjs';
import { buildFactionAtlas, buildHairAtlas } from './lib/atlas.mjs';
import { buildClipPack } from './lib/clips.mjs';

export const LANE = 'settlements';
const DIR = 'public/models/npc';
export const OUTPUTS = [...ARCHETYPES.map((a) => `${DIR}/${a.id}.glb`), `${DIR}/atlas-pan.glb`, `${DIR}/atlas-holds.glb`, `${DIR}/atlas-hair.glb`, `${DIR}/npc-clips.glb`];
const RECIPE = 'tools/build/recipes/npc/build.mjs';

export async function build({ out = ROOT } = {}) {
  const only = process.env.R5_NPC_ONLY ? new Set(process.env.R5_NPC_ONLY.split(',')) : null;
  const want = (k) => !only || only.has(k);
  const res = {};
  const log = (m) => { if (process.env.R5_NPC_LOG) console.error(m); };
  const prov = (sources) => ({ recipe: RECIPE, sources, licence: 'CC0-1.0' });
  if (want('atlas-pan')) res['atlas-pan'] = await buildFactionAtlas(path.join(out, DIR, 'atlas-pan.glb'), { faction: 'pan', family: 'Peasant', provenance: prov(['mco-fantasy-standard', 'npc-generated']) });
  if (want('atlas-holds')) res['atlas-holds'] = await buildFactionAtlas(path.join(out, DIR, 'atlas-holds.glb'), { faction: 'holds', family: 'Ranger', provenance: prov(['mco-fantasy-standard', 'npc-generated']) });
  if (want('atlas-hair')) res['atlas-hair'] = await buildHairAtlas(path.join(out, DIR, 'atlas-hair.glb'), { provenance: prov(['npc-generated']) });
  if (want('clips')) res.clips = await buildClipPack(path.join(out, DIR, 'npc-clips.glb'), { provenance: prov(['ual1-standard', 'ual2-standard']) });
  for (const a of ARCHETYPES) {
    if (!want(a.id)) continue;
    const t0 = Date.now();
    res[a.id] = await buildNpc(a, { file: path.join(out, DIR, `${a.id}.glb`), provenance: prov(['ubc-standard', 'mco-fantasy-standard', 'npc-generated']), log });
    log(`  ${a.id}: ${Date.now() - t0} ms`);
  }
  return res;
}
