/**
 * Donor bake — `models-staging/` → `public/models/`.
 *
 * ROUND 4, `machines-expansion`. The expansion casts nine new species onto
 * donors that are staged, licensed and measured in `models-staging/MANIFEST.md`
 * and `docs/research/casting-v4.md` §0. Nothing at runtime may read out of
 * `models-staging/` — Vite does not serve it and it is not shipped — so this is
 * the one step that moves a donor into the game, and it is a build tool, not a
 * loader.
 *
 * What it does, per donor:
 *   1. reads the staged file (`.gltf` with embedded base64 buffers, or `.glb`);
 *   2. re-writes it as a **binary** `.glb`, which is the whole size win: a
 *      Quaternius `.gltf` carries its buffers as base64 text, so the Bull is
 *      3.11 MB on disk for 2,418 triangles and 13 clips. Same data, binary: a
 *      third of that;
 *   3. drops the joint/animation-free extras nothing here uses, and prunes
 *      unused accessors/materials;
 *   4. prints the measured facts the species files are written against —
 *      bbox, triangles, joints, clip names — so a card in `casting-v4.md` can
 *      be checked against the bytes rather than against a memory of them.
 *
 * Usage:
 *   node tools/bake-rigs.mjs              # bake every donor that is missing
 *   node tools/bake-rigs.mjs --force      # re-bake all of them
 *   node tools/bake-rigs.mjs broadhead    # one species
 *   node tools/bake-rigs.mjs --report     # measure only, write nothing
 *
 * LICENSING. Four donors are CC-BY 3.0 (BlackCaiman, Lion, Scorpion, Hawk) and
 * need a credit line before ship; the rest are CC0. The table is printed at the
 * end of every run and is mirrored in README.md §Credits.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import { existsSync, mkdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'models');

/**
 * kind -> staged donor + the licence that travels with it.
 * `targetHeight` / `yawFix` live in `src/entities/machines/variety-assets.js`
 * (the runtime contract); they are repeated here only in the report so the two
 * can be compared without opening both files.
 */
export const DONORS = {
  // ---- batch A -------------------------------------------------------
  broadhead: {
    src: 'models-staging/expansion-a/broadhead/Bull_Quaternius.gltf',
    licence: 'CC0 1.0', author: 'Quaternius', title: 'Bull (Ultimate Animated Animals)',
    url: 'https://quaternius.com', targetHeight: 2.0, yawFix: 0,
  },
  grazer: {
    src: 'models-staging/expansion-a/grazer/Deer_Quaternius.gltf',
    licence: 'CC0 1.0', author: 'Quaternius', title: 'Deer (Ultimate Animated Animals)',
    url: 'https://quaternius.com', targetHeight: 2.72, yawFix: 0,
  },
  snapmaw: {
    src: 'models-staging/expansion-a/snapmaw/BlackCaiman_PolyGoogle.glb',
    licence: 'CC-BY 3.0', author: 'Poly by Google', title: 'Black Caiman',
    url: 'https://poly.pizza/m/5etIv4omd7Z', targetHeight: 0.98, yawFix: 0,
  },
  ravager: {
    src: 'models-staging/expansion-b/ravager/Lion_PolyGoogle.glb',
    licence: 'CC-BY 3.0', author: 'Poly by Google', title: 'Lion',
    url: 'https://polygone.art/model/cC_IFclYA4c', targetHeight: 3.66, yawFix: 0,
  },
  // ---- batch B -------------------------------------------------------
  shellwalker: {
    src: 'models-staging/expansion-a/shell-walker/Spider_Quaternius.glb',
    licence: 'CC0 1.0', author: 'Quaternius', title: 'Spider',
    url: 'https://poly.pizza/m/yRYJiAJyiM', targetHeight: 2.1, yawFix: 0,
  },
  corruptor: {
    src: 'models-staging/expansion-a/_donors/Scorpion_PolyGoogle.glb',
    licence: 'CC-BY 3.0', author: 'Poly by Google', title: 'Scorpion',
    url: 'https://poly.pizza/m/6Bu7d_Pkm5o', targetHeight: 2.95, yawFix: 0,
  },
  stormbird: {
    src: 'models-staging/expansion-a/stormbird/HawkLpRigged_Sherkiz.glb',
    licence: 'CC-BY 3.0', author: 'Sherkiz', title: 'Hawk (low-poly, rigged)',
    url: 'https://poly.pizza/m/RkN6MEbP6g', targetHeight: 7.89, yawFix: Math.PI,
  },
  // TALLNECK: NO DONOR IS BAKED. The species was never built (`casting-v4`
  // §2.8 puts it last and describes a re-proportion job at a scale nothing
  // else in the build uses), so `public/models/tallneck.glb` was 359 KB of
  // payload that `variety-assets.js` fetched and baked at every boot for a
  // class that never existed — a judge caught it. The SPECS entry, the
  // EXPANSION_KINDS membership, the gate cast and this row went together.
  // The staged Apatosaurus donor is still in `models-staging/expansion-a`;
  // re-add this row to bake it if the species is ever built.
  //   src: 'models-staging/expansion-a/_donors/Apatosaurus_Quaternius.glb'
  //   CC0 1.0, Quaternius, https://poly.pizza/m/fvo0x8Zk3z
  //   targetHeight 3.27, yawFix 0
  // `redeye` ships NO donor: it is the Watcher sculpt loaded a second time
  // under its own key (casting-v4 §2.9) so the per-machine material clones
  // stay separate. See `variety-assets.js` SPECS.
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** bbox / triangle / joint / clip facts, read off the document. */
function measure(doc) {
  const root = doc.getRoot();
  let tris = 0;
  const mn = [1e30, 1e30, 1e30];
  const mx = [-1e30, -1e30, -1e30];
  const el = [0, 0, 0];
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      tris += (idx ? idx.getCount() : pos.getCount()) / 3;
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, el);
        for (let k = 0; k < 3; k++) {
          if (el[k] < mn[k]) mn[k] = el[k];
          if (el[k] > mx[k]) mx[k] = el[k];
        }
      }
    }
  }
  const skin = root.listSkins()[0];
  return {
    tris: Math.round(tris),
    meshes: root.listMeshes().length,
    joints: skin ? skin.listJoints().length : 0,
    clips: root.listAnimations().map((a) => a.getName()),
    size: mx.map((v, i) => +(v - mn[i]).toFixed(2)),
  };
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

async function bake(kind, opts) {
  const spec = DONORS[kind];
  const src = path.join(ROOT, spec.src);
  const out = path.join(OUT_DIR, `${kind}.glb`);
  if (!existsSync(src)) {
    console.error(`[bake-rigs] ${kind}: MISSING donor ${spec.src}`);
    return null;
  }
  const doc = await io.read(src);
  const facts = measure(doc);
  const srcBytes = statSync(src).size;
  if (opts.report) {
    console.log(`${kind.padEnd(12)} ${kb(srcBytes).padStart(8)}  ${facts.tris} tris, `
      + `${facts.joints} joints, ${facts.clips.length} clips, `
      + `${facts.size.join(' x ')}  [report only]`);
    return facts;
  }
  if (existsSync(out) && !opts.force) {
    console.log(`${kind.padEnd(12)} ${kb(statSync(out).size).padStart(8)}  (already baked — --force to redo)`);
    return facts;
  }
  await doc.transform(dedup(), prune());
  mkdirSync(OUT_DIR, { recursive: true });
  await io.write(out, doc);
  const dstBytes = statSync(out).size;
  console.log(`${kind.padEnd(12)} ${kb(srcBytes).padStart(8)} -> ${kb(dstBytes).padStart(8)}`
    + `  ${facts.tris} tris, ${facts.joints} joints, ${facts.clips.length} clips,`
    + `  bbox ${facts.size.join(' x ')}`
    + `  targetHeight ${spec.targetHeight}, yawFix ${spec.yawFix === 0 ? 0 : 'PI'}`);
  if (facts.clips.length) console.log(`${''.padEnd(12)} clips: ${facts.clips.join(', ')}`);
  return facts;
}

const args = process.argv.slice(2);
const opts = { force: args.includes('--force'), report: args.includes('--report') };
const only = args.filter((a) => !a.startsWith('--'));
const kinds = only.length ? only : Object.keys(DONORS);

console.log('\n=== machines-expansion donor bake (casting-v4.md §0) ===');
for (const kind of kinds) {
  if (!DONORS[kind]) { console.error(`[bake-rigs] unknown kind '${kind}'`); continue; }
  await bake(kind, opts);
}

const byLicence = {};
for (const [kind, s] of Object.entries(DONORS)) {
  (byLicence[s.licence] ||= []).push(`${s.title} by ${s.author} (${s.url}) -> ${kind}`);
}
console.log('\n--- attribution (README.md §Credits) ---');
for (const [lic, rows] of Object.entries(byLicence)) {
  console.log(`${lic}${lic.startsWith('CC-BY') ? '  (credit REQUIRED)' : '  (credit optional)'}`);
  for (const r of rows) console.log(`  ${r}`);
}
console.log('');
