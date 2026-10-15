# Round 5 — creature + world pipeline (research and working proof)

**Question.** How do we make an original roster of about 12 machine-creatures and a new map with 4–6 biomes, landmarks and sites? The art has to be original, the legal position has to hold, it has to be made on this Mac, and it has to fit the perf and memory budgets.

**Answer.** Use the method we already proved: generate the creatures procedurally in node as hard-surface meshes, with the rig and skin weights written by the same generator. Feed them through the KEPT autorig + GaitController seam without changing it. Build the world on the KEPT engine from a new landform recipe, mask-driven scatter, and generated landmarks. For ground materials, mix procedural layers (sand, salt crust, ripples) with CC0 photo scans (rock), each packed into two RGBA textures per layer. Do not use CC0 kitbash kits for creatures. Blender is not needed.

The proof is in `tools/r5-poc/` and runs behind `?poc=creature` and `?poc=biome`. The default boot is unchanged: `A1-boot-clean` passes on port 5241 with the flag code in place.

---

## 0. The proof in one table

| what | result | where |
|---|---|---|
| Creature generated in node | **Tiller**, a six-legged survey walker. 32,960 tris, 2 materials (hull palette + sensor), 1 palette texture (8×1 px), 24 bones. 302 KB GLB (meshopt + quantized). **197 ms** to generate. Original work, no third-party assets. | `tools/r5-poc/gen-creature.mjs` → `public/models/r5-poc/tiller.glb` |
| Into the game through the kept seam | `assets.loadExtra` → `machines.registerKind` → `ExpansionMachine` subclass → `attachRigRuntime({quantise:false})` → **autorig `buildRig`** → **`GaitController`** (alternating tripod) → `foldMachineMeshes` → `snapSockets`. **0 lines changed in `src/`** apart from the flag in `main.js`. | `tools/r5-poc/tiller.js`, `poc-creature.js` |
| Planted feet | Measured over 8 s of patrol (1.37 m/s, 68 plants), and also on the **drawn** pad-sole vertex, CPU-skinned:<br>• Foot bone: worst slip **11.6 mm/frame**, mean 0.02 mm.<br>• Drawn pad: worst slip **11.5 mm/frame**, mean 0.64 mm.<br>• Pad on a 0.9-slope gravel bank: \|sole − terrain\| worst **6.9 cm**, mean 1.2 cm.<br>• Swing lift 0.52 m. Cadence 1.21 Hz, inside the A48 band 0.74–2.22.<br>For comparison, the bars of A45c are 0.12 m/frame and of A46 0.08 m. | `tools/r5-poc/out/metrics.creature.json` |
| Skin weights | Authored by the generator (`_BONE` vertex attribute) and seeded through autorig's existing per-geometry cache: **0 / 25,445 wrong**. Autorig's own capsule capture on the same mesh puts **25.0 %** of vertices on the wrong bone. That includes **863 that cross between leg and body**, and 12,247 are blended. | `weights` in the metrics file |
| Creature cost in frame | **+6 draws** (3 main + 1 caster × 3 cascades) and +126 k tris, from visible-vs-hidden on the same frozen frame | `draws` |
| Memory | 3 rounds of spawn ×4 → kill → `sites.dispose`: geometries **−1 → +1**, textures **0**, scene objects **−38**. No console errors. | `memory` |
| Biome patch | A 200 m × 200 m piece of a new region (black-sand dunes, salt pan, columnar-basalt shelf, lagoon), plus a 1.8 km skirt, one landmark, 5 scatter kinds and 2 static Tillers. **50 draw calls, 1.41 M tris** at the vista. Builds in **0.83 s**, including 0.38 s of shader warm-up. Dispose returns geometries 15 → 1. | `tools/r5-poc/poc-biome.js`, `metrics.biome.json` |
| Landmark | **The Sounding Ring**, a fallen survey gyroscope 33 × 26 × 22 m. 22,120 tris, 2 materials, 182 KB. **154 ms** to generate. | `gen-landmark.mjs` → `sounding-ring.glb` |
| Ground textures | 3 layers × 2 RGBA WebP at 1024². Procedural sand 1.14 MB and salt 1.12 MB, at **3.2 s** each in node. CC0 scan rock 1.31 MB, from a 2.3 MB Poly Haven download in **2.8 s**. Procedural basalt alternative 0.91 MB. | `gen-ground.mjs` → `public/textures/r5-poc/` + `MANIFEST.json` |
| Shipped bytes | 4.9 MB in `public/` (2 GLBs + 8 WebP), against the ~52 MB still free | — |

Frames are in `shots/` (gitignored). JPEG copies are in `docs/media/r5-poc/`.

- **Creature:**
  - `r5-poc-creature-side`: walking side-on.
  - `-3q`: the sensor drum, yoke and lens array.
  - `-rear`: the auger and the hopper.
  - `-feet`: pads planted on a gravel slope.
  - `-gait-strip`: four frames 0.28 s apart. The planted pads stay put while the swing legs cross.
- **Biome:**
  - `r5-poc-biome-vista`: across the salt pan to the Ring and the basalt shelf.
  - `-landmark`: the Ring with two Tillers for scale.
  - `-ground`: sand ripples meeting the salt crust, with glasswort along the edge.
  - `-cliff`: columnar basalt with the CC0 scan.
  - `-cliff-procrock`: the same view with procedural rock.
  - `-kitbash`: a restyled CC0 kit mech next to the Tiller.
  - `-overview`: the layout from above.

### 0.1 What the frames show, read honestly

- **Creature.** It reads as an original machine: a long glazed-ceramic body on bronze gimbals, oxblood bands, verdigris trim, high-kneed stilt legs, a theodolite drum in place of a head. Nothing about it is an animal. It does not look like Horizon.
  - **Gap — armour shape:** the thigh armour plates are flat extruded boards.
  - **Gap — surface detail:** there is no decal or trim-sheet layer (numbers, glyphs, wear masks) and no micro-normal detail. Close up it looks "clean CG".
  - **Gap — lenses:** the lens glass glows weakly in daylight.
  - **What closes them:** this is generator work, not new pipeline work. See §5.1 step 6.
- **Biome.** It reads as a different place from the Round 4 valley: cool coastal light, black sand, white salt, basalt organ-pipes.
  - **Gap — sand repeat:** the ripples repeat visibly at mid distance.
  - **Gap — marram:** the marram grass is sparse spikes.
  - **Gap — skirt:** the skirt beyond the patch has no masks, so it is all sand, and the far mesas wear sand.
  - **Gap — shelf top:** the shelf top is plain sand.
  - **Gap — column streaks:** the column bevels shade with vertical streaks, because the normals are wrong under non-uniform instance scale.
  - **Gap — overview:** in the overview, the patch edge is visible against the skirt.
- **Rock, procedural vs scan.** The procedural basalt reads as paving, regular Voronoi cells (`-cliff-procrock`). The CC0 scan reads as rock (`-cliff`). **Natural rock should come from scans. Regular natural patterns (salt polygons, ripples) should be procedural.**
- **Kitbash.** The palette-remapped Quaternius mech (`-kitbash`) is still a chunky toy robot with a face and big hands. Its silhouette and proportions are what identify it, and a palette swap cannot touch either.

---

## 1. How to run the proof

```bash
node tools/r5-poc/gen-creature.mjs      # tiller.glb + out/tiller.stats.json        (~0.2 s)
node tools/r5-poc/gen-landmark.mjs      # sounding-ring.glb + out/landmark.stats    (~0.15 s)
node tools/r5-poc/gen-ground.mjs        # 4 ground layers (+ CC0 fetch to scratch, deleted after) (~13 s)
node tools/r5-poc/film-creature-world.mjs creature   # own Vite on :5241, films + measures, kills both
node tools/r5-poc/film-creature-world.mjs biome      # includes the DPR 1.5 run, gpu states, dispose
# by hand: http://localhost:<port>/?shot=1&poc=creature   /   ?poc=biome   /   ?poc=biome&rock=proc
```

`main.js` gets one block. It is the import of `/tools/r5-poc/poc-${flag}.js` under a whitelist, through `@vite-ignore`, so the module is never bundled. The boot line is guarded with `if (POC !== 'biome')`. With no flag, the boot is byte-for-byte the old path.

---

## 2. Creatures: the three routes, with evidence

### (a) Procedural hard-surface in node — **recommended**

**The kit.** `tools/r5-poc/lib/hs.mjs` is about 330 lines. Its main parts:
- **Crease-aware lathe:** smooth around the axis, hard along the profile, with optional panelised seams.
- **Bevelled extruded plates:** the rims carry an `edge` attribute, which becomes worn-rim lightening.
- **Simple parts:** rounded boxes, tapered struts between two points, tori, swept cables.
- **Paint:** per-vertex wear, grime and cavity.

**The one-material trick.** Albedo lives in vertex colours. Roughness and metalness come from an **8×1 palette texture addressed by UV texel**. This is the method from Round 4's `rig/shells.js`, moved offline.
- Result: a whole creature is **1 hull material + 1 flat-emissive sensor material**.
- The sensor is picked up automatically by `Machine._collectEmissive` and joins the eye-state system.

**Output.** `lib/glb.mjs` writes the GLB with @gltf-transform. It does weld, dedup, prune, reorder and quantize, then EXT_meshopt_compression. About 1.3 MB of raw float streams becomes 302 KB.

**Why this route wins:**

1. **The silhouette is ours.** Nothing in the shape comes from an animal or from a licence. The design language (§7) is written in code, so the roster stays one family.
2. **The rig is authored, not guessed.** The generator places every limb, so it emits:
   - the autorig spec (`asset.extras.r5Rig`);
   - a per-vertex bone label (`_BONE`).
   - **What the labels buy:** seeding autorig's existing cache (`geo.userData.rigKind`) gives exact rigid plates. The stock capsule capture gets 25 % of this same mesh wrong (§0).
   - **No `autorig.js` change:** the seam was already there.
3. **The bind pose is the IK pose.** The generator solves each knee with GaitController's own two-bone construction (hinge pole ±Z in the body frame), so there is no pop on the first frame. Nothing is drawn where the gait will not hold it.
4. **Cost per species is small:**
   - The Tiller's design is about 270 lines of parametric code.
   - Generating it takes 0.2 s.
   - The species class (`tiller.js`) is about 190 lines, including the weight audit.
   - New species reuse the kit plus a shared parts library: legs, hubs, drums, pads.

**What we found:**

- **Quantised GLBs corrupt the fold pass.** `rig/lod.js unifySkin` re-bakes secondary meshes with `setXYZ`. On KHR_mesh_quantization's normalised Int16 positions this clamps every vertex outside the node's box. In the proof, the sensor lenses smeared 4.4 m down the body.
  - Fix: dequantise once per kind on load (`liftExtras` in `tiller.js`).
  - Round 5 should do this in the one shared loader, not per species.
- **Meshopt interleaves streams.** A 1-byte attribute's `.array` is 4× its count, so read it through `getX` and never through `.array`.
- **`unifyMaterials` assumes the old palette.** It snaps every colour to the Round-4 HZD family palette (`PALETTE` in `rig/lod.js`, "white-grey plate over dark muscle"). Pass `{quantise:false}`, or replace the palette.
- **The sensor mesh must not cast shadows.** Its bounding sphere spans head to hopper, so the caster policy would keep it. Mark it `noShadow`.
- **Knee planes are fixed.** GaitController's IK pole is fixed ±Z, so knees live in the sagittal plane. Spider-style lateral knees need a per-leg pole option, which is a small ADAPT in `gait.js`.
  - **N legs work:** six legs ran fine; offsets are keyed by leg id.
  - **Hexapod death untested:** `deathPose('quad')` on a hexapod threw nothing across 12 kills, but the corpse shape was not graded (A47c).
- **The old eye colours are the default.** `EYE_COLORS` is still canon blue → amber → red. The `eyeCalm` option exists; the new fiction needs its own state palette.

### (b) CC0 kitbash kits, restyled — **rejected for creatures; allowed for small props**

**Licences, verified on the source pages:**
- Quaternius "Animated Mech Pack": **CC0** (opengameart node 126992 / quaternius.com). The pack's `License.txt` is CC0 1.0 and is already on disk in `models-staging/quaternius-animatedmech/`.
- Quaternius "Sci-Fi Essentials Kit": **CC0**, 65 models, ships glTF.
- Kenney "Space Kit": **CC0**, 150 files.

**What the kit actually contains:**
- Mech pack: 4 humanoid mechs, **2.4–7.9 k tris each**, 1 material with a **1.6–2.3 MB PNG atlas**, 17–47 joints, toy proportions.
- The Round-4 CC0 animal donors on disk: 2.1–5.7 k tris, **7–8 materials each**, plus clips.

**Measured restyle (`r5-poc-biome-kitbash`):**
- Remapping the flat-colour atlas to the r5 palette in a canvas takes **164 ms** at runtime and is easy.
- The result still reads as a cartoon robot next to the Tiller.

**Round 4 has already run this experiment at scale.**
- `rig/shells.js` opens with: "the sculpts we can license are the wrong animals". That lane then had to build procedural shells over every donor and hide the sculpt.
- Kitbashing gives us someone else's silhouette, at someone else's fidelity, and usually several materials.

**Where kits do help:** generic props (crates, tools, camp clutter). Restyle the palette, merge to one material, and record each source in a manifest.

### (c) Hybrid — yes, but the "kit" is our own

The useful hybrid has two halves:
- **Creature parts:** a generated parts library inside the generator. Leg modules, knee hubs, sensor drums, lamp bezels, pads, gimbal rings, fins and augers are shared across species, so the roster shares hardware the way real equipment does.
- **Materials:** procedural albedo through vertex colour and the palette, plus a **shared trim sheet / decal atlas** for glyphs and wear (§5.1 step 6).

There is no third-party creature geometry.

---

## 3. Materials and textures: procedural vs CC0 libraries

| route | layer | build | size on disk (2 × RGBA WebP, 1024²) | licence | verdict |
|---|---|---|---|---|---|
| procedural (node: tileable fbm + Worley, Sobel normal, cavity AO, sharp WebP) | sand ripples + olivine/shell grit | 0.47 s field + 2.6 s encode | 1.14 MB | original | **good** — regular natural pattern |
| procedural | salt-pan polygon crust, pressure ridges, dirty cracks | 0.41 s + 2.6 s | 1.12 MB | original | **good** — no scan library has this |
| procedural | columnar basalt | 0.44 s + 3.2 s | 0.91 MB | original | **weak** — reads as paving |
| CC0 scan (Poly Haven `rock_face` 1K diff + nor_gl + arm JPG, repacked) | rock | 0.6 s download (2.3 MB to scratch, deleted) + 2.1 s repack | 1.31 MB | **CC0 1.0** — Poly Haven: "You can use our assets for any purpose, including commercial work"; no attribution needed | **good** — natural rock reads as rock |

**Library sizes, measured from the APIs:**
- Poly Haven 1K JPGs per map: diffuse 0.7–1.0 MB, normal 1.1–1.35 MB, ARM 0.45–0.85 MB. That is 2.3–3.2 MB per material before repack.
- ambientCG zips per material: 1K-JPG **8.5–9.5 MB**, 2K-JPG 32 MB.
- Licences: ambientCG is CC0 1.0 ("…even for commercial purposes, all without asking permission"); Poly Haven is CC0.
- Download the 1K JPG maps you need into scratch, repack, and delete. Never ship the zips.

**Layer layout that worked.** Each layer is two RGBA textures:
- `_a`: RGB albedo + A height.
- `_n`: RG normal + B roughness + A cavity AO.

All of them load with `flipY = false`; the generator flips G for GL-convention scans. The shader does height-blended splats: planar for sand and salt, triplanar for rock and slopes, anti-tiling resampling past 10 m, a macro-noise tint, and wet darkening from a mask.

**The real constraint is VRAM, not download size.**
- One 1024² RGBA8 texture with mips is **5.6 MB of GPU memory**, so each layer costs **11 MB**.
- Eight layers map-wide would be about 90 MB uncompressed. Kevin's machine has crashed on memory twice.
- **Plan:**
  - ≤ 6 layers at 1024² plus the rest at 512² (§6).
  - Share layers across biomes, tinted through uniforms.
  - Move to **KTX2/Basis** (4–8× less VRAM). That needs an encoder; none is in `node_modules`. Measure before deciding between the `toktx` CLI and a WASM encoder.
- The current game bakes 3 × 256² detail textures at runtime (`terrain.js _bakeDetail`), so this is a real increase and has to be budgeted.

**Runtime procedural vs offline procedural.**
- The `_bakeDetail`-style runtime bake costs 0.4–0.5 s per 1024² layer for the field alone in V8, which is the same engine as Chrome. With normals and AO it is about 0.6 s per layer at boot, with zero download.
- Offline WebP costs about 1.1 MB per layer to download and nothing at boot.
- **Recommendation:** use offline bakes for 1024² layers, and runtime bakes for 256² masks and macro noise.

---

## 4. The map: what is reused, what is new, how to stay inside 350 draws

### 4.1 What the existing code gives a new region (from ROUND5-INVENTORY §2.3 + this proof)

| system | reuse | replace / add |
|---|---|---|
| `core/engine.js` | everything. The proof ran the biome on it standalone: CSM ×3 via `enableCSM`, `csmSetupMaterial` chained exactly like `environment.registerMaterial`, `warmUp`, perf ring, GPU timer | — |
| `world/terrain.js` | frozen API (`getHeight`, `getNormal`, `heightFast`, `slopeFast`, `surfaceAt`, `materialAt`, stealth field), mesh build, height grid, `SURFACES` vocabulary | the **landform recipe** (river / shelf / path / biome factor functions, rim, strata) → a new `height(x,z)` + mask functions as in `poc-biome.js`. The ground shader becomes the 3-layer height-blended splat. **Risk:** `riverCenterX/riverFactor/...` are module exports read by water, vegetation and props; the new region must keep exporting them, or those lanes ADAPT together |
| `world/vegetation.js` | grass cards, chunk streaming, wind, tree LOD/impostors, `pines-*`/`rocks-*` auto-collision | species palette and the `KEEPOUT` literal. The proof's marram and glasswort are solid vertex-coloured tufts (no alpha overdraw): 1 draw per kind, 96 and 36 tris |
| `world/water.js` | ribbon solver | the river path. The proof used one flat sea/lagoon plane (1 draw) |
| `world/environment.js` | sky, sun, CSM, fog, weather machinery | hour keyframes and grade (the HZD late afternoon). It also builds `RiverWater`, which has to come out |
| `world/props/*` | `Places` engine, `kit.js` geometry kit, clearings, rockworks colliders, activities | every `PLACES` row, megastructure and camp. Landmarks become generated GLBs registered with `ctx.collision.register` + a `PLACES` row |

### 4.2 Heightfield authoring

1. **Analytic recipe.** As proven: fbm dunes, a coast falloff, a flattened pan from an ellipse mask, a stepped terrace from a warped half-plane mask, and a far field for the skirt. Masks come from the same functions as the heights, so the scatter, the shader and gameplay (`surfaceAt`) always agree.
   - **Proposed, not proven:** run an offline erosion pass in node on a 1024² grid, bake it to a 16-bit PNG (about 2 MB), and have `getHeight` sample it bilinearly plus analytic detail.
2. **Biome masks.**
   - Bake once into a 256² RGBA `DataTexture` per region: R salt, G rock, B wet, A free. The patch's mask bake took **115 ms**.
   - Slope rock is computed in the shader.
   - For 4–6 biomes over 720 m: one 512² mask plus a hand-editable 64² "biome id" control map.
3. **Scatter.**
   - One `InstancedMesh` per kind, placed by the masks with seeded rejection. **66 ms** for about 9,550 instances.
   - Structured geology is placed as structure, not noise: the basalt shelf is **11 hex-lattice clusters, 1,427 columns, 1 draw + 3 shadow**. Random sticks read wrong, and the first pass proved it.
4. **Landmarks.** Use the creature kit, one GLB each: 2 materials, 1 shadow caster, ≤ 40 k tris. Register the collider and the `PLACES` row.

### 4.3 Draw calls

The proof's vista ledger, measured by hiding each owner on the same frame:

| owner | draws |
|---|---|
| post chain | ≈ 22 (fixed) |
| sky | 1 |
| terrain | 1 |
| skirt | 1 |
| water | 1 |
| basalt columns | 4 (1 + 3 cascades) |
| boulders | 4 |
| marram | 1 |
| glasswort | 1 |
| salt shards | 1 |
| landmark | 5 |
| 2 Tillers | 8 |
| **total** | **50** |

**Proposed worst-gameplay-frame budget (≤ 350):**

| owner | budget | note |
|---|---|---|
| post chain | 22 | fixed today |
| terrain + skirt + far ranges + sky + water | 12 | the proof used 4 |
| ground scatter (≤ 8 kinds visible) | 32 | 1 main + 3 shadow for casters, 1 for non-casters |
| grass / vegetation chunks | 50 | today's grass is 178 chunks world-wide; the staged fight measured 76 for vegetation |
| landmarks and places (≤ 3 visible) | 45 | landmarks 5 each; place kits merged per material |
| machines (8 on screen) | 48 | **6 each** measured on the Tiller; today's folded species cost 4–17 |
| heroine + gear | 25 | 37 today; owned by the character lane |
| NPCs, VFX, UI | 40 | |
| **total** | **274** | 76 headroom |

### 4.4 GPU time (the real constraint)

This box was shared with other lanes' Chrome sessions during every run, so GPU times are ranges. Draw calls and triangles are exact.

| frame | 1600×900 at DPR 1 | DPR 1.5 (the shipped `high` tier cap) |
|---|---|---|
| patch vista, median GPU | **13.7–25.8 ms** (5 runs) | **23.6–60 ms** (3 runs) |
| empty frame (post chain + sky only, 23 draws) | **7.6–9.1 ms** | **13.3–13.8 ms** |

Over every run, frame time held 59.7–60 fps at DPR 1, and p95 was 18.3–18.8 ms.

**The finding.** At DPR 1.5 the post chain alone takes most of a 16.7 ms frame. It does not depend on content: MSAA ×4 on a half-float target, GTAO, bloom, SMAA and grade. No new content keeps 60 fps at the `high` tier while that chain costs about 13.5 ms.
- **Action for the engine owner:** quiet-box A21. Candidates are MSAA → SMAA-only, GTAO at quarter resolution, or a DPR cap of 1.25.
- **The ground shader is the content lever:** 12+ fetches per pixel on triplanar slopes. Branch triplanar to slopes only, use 512² normals for far layers, and blend at most 3 layers per pixel.

---

## 5. Exact pipeline steps

### 5.1 A creature (per species, about 1 day once the parts library exists)

1. **Design sheet in code.** Write `gen-<species>.mjs` with the hs kit:
   - Size class, leg count, and one silhouette idea (§7).
   - Pieces go into per-bone buckets (`H(bone)` / `L(bone)`).
   - Tones come from the shared palette; surfaces come from `SURF`.
2. **Legs from the IK.** Set hips and ankles, then solve the knees with the gait's own two-bone construction (`solveKnee`). Write the `r5Rig` spec from the same numbers: spine ≤ 5, tail ≤ 4, legs any count. Use `parent` / `hinge` / `restFoot`.
3. **Finish.**
   - Grime and cavity shading.
   - Recentre so the feet sit at y = 0, centre x/z.
   - Merge each material bucket and emit `_BONE` labels (exact autorig boneList order).
   - Write the GLB: weld → dedup → prune → reorder → quantize (exclude `_BONE`) → meshopt.
   - Write extras: `r5Rig`, `r5BoneOrder`, `r5Size`, `r5Sockets` (weak points, lens, components).
4. **Species class.**
   - `extends ExpansionMachine`.
   - Then `liftExtras` (dequantise, labels, sensor `noShadow`).
   - Then `seedAuthoredWeights` → `attachRigRuntime({quantise:false})` → `buildRig(spec)` → `GaitController({walk, run, offsets per leg id, fidgets})` → `foldMachineMeshes` → `snapSockets`.
   - Then the attack poses and `ai/tables.js` rows.
5. **Register.**
   - Add a `variety-assets` SPECS row with `targetHeight = r5Size[1]`, so scale is 1 and body space equals generator space.
   - Call `machines.registerKind`.
   - Add the audio set and the `SPAWN_PLAN` row.
6. **Fidelity pass** (not proven here):
   - Shared decal/trim atlas through a second UV set. This needs `normalizeAttrs` in `rig/lod.js` to keep `uv1`; it is a one-line ADAPT.
   - Curved armour from lathe sections instead of flat plates.
   - LOD1 at about 35 % through gltf-transform `simplify` (meshoptimizer is installed).
7. **Gates.**
   - A6 / A45c / A46 / A48: planted feet, pad continuity, ground truth, cadence band.
   - A44: sockets.
   - A47*: corpse.
   - A90 / A90b: memory.
   - A21: draws.
   - V26 / V27: re-staged per new species.

### 5.2 A landmark

`gen-<landmark>.mjs` with the same kit gives 2 materials and ≤ 40 k tris. Write footprint extras (anchors, radius) for colliders and keepouts. Then add one `PLACES` row, `ctx.collision.register` (proxy boxes from the footprint), the interactables, and the biome keepout.

### 5.3 A ground layer

- **Procedural:** a new layer function in `gen-ground.mjs`. The field must tile (periodic fbm and Worley).
- **Scan:** a CC0 id added to the fetch list, with its licence written into `public/textures/r5-poc/MANIFEST.json`.
- **Both:** 2 RGBA WebP files at 1024 (or 512 for far or rare layers), then the splat uniforms.

### 5.4 A region

1. Write `height(x,z)` plus the masks, keeping the exported terrain API.
2. Bake the mask texture.
3. Assign layers per mask channel.
4. Write the scatter table (kind, mask predicate, density, cast shadow or not).
5. Place landmarks, places and spawn sites.
6. Write the far-field skirt and its masks; **the proof's skirt had none**.

---

## 6. Licences and per-asset budgets

### Licences

- **Generated, original work:**
  - creature and landmark GLBs;
  - procedural ground layers;
  - the hs kit and all shader code;
  - the design language and names.
- **CC0 1.0:**
  - Poly Haven `rock_face` (`rock_*.webp`), recorded in `public/textures/r5-poc/MANIFEST.json`;
  - Quaternius "Mike", used only as a comparison. It is dev-served from `models-staging/`, not copied into `public/`, and not shipped.
- **CC-BY:** none used.
- **NC / HZD / Fortnite assets:** none touched.

### Per-asset budgets

| asset | tris | materials | bones | textures | file | shadow |
|---|---|---|---|---|---|---|
| creature, small (≤ 2.5 m) | ≤ 15 k | 2 (hull + sensor) | ≤ 20 | the shared 8×1 palette | ≤ 200 KB | 1 caster |
| creature, medium (2.5–6 m; Tiller 33 k / 302 KB / 24 bones) | ≤ 35 k | 2 | ≤ 32 | palette (+ shared decal atlas later) | ≤ 400 KB | 1 |
| creature, large (6–12 m) | ≤ 60 k + LOD1 | ≤ 3 | ≤ 40 | " | ≤ 700 KB | 1 |
| boss (> 12 m) | ≤ 120 k + LOD1 | ≤ 4 | ≤ 64 | " | ≤ 1.2 MB | ≤ 2 |
| landmark (Ring 22 k / 182 KB) | ≤ 40 k | 2 | — | palette | ≤ 300 KB | 1–2 |
| ground layer | — | — | — | 2 × RGBA 1024² WebP ≈ 1.1–1.4 MB (VRAM 11 MB); far/rare layers 512² ≈ 0.3 MB (VRAM 2.8 MB) | | |
| scatter kind | ≤ 200 tris / instance (rocks), ≤ 100 (plants) | 1 | — | shared | — | rocks yes, plants no |
| **map totals** | ≤ 6.5 M tris in frame (A21) | | | ≤ 6 layers at 1024 + ≤ 4 at 512: **≤ 8 MB download, ≤ 78 MB VRAM uncompressed**, until KTX2 lands | **roster 12 × ≈ 350 KB ≈ 4.2 MB, landmarks 6 × 200 KB ≈ 1.2 MB, ground ≈ 8 MB, total ≈ 14 MB** of the 52 MB free | |
| draw calls | **≤ 350 worst frame**, planned 274 (§4.3) | | | | | |

---

## 7. Proposed design language and a 12-creature roster

**"Field instruments, not animals."** These machines descend from a lost survey and terraforming fleet:
- **Topology from tools:** tripods, hexapods, stilt-walkers, gantries, trains of segments, wheels.
- **Materials:** glazed ceramic (bone, celadon, oxblood) over bronze and verdigris, with graphite joints.
- **Sensors:** lanterns and lens drums instead of eyes.
- **Movement:** mechanical gaits (tripod, wave, stilt).

The Tiller is item 1. Names are working names, checked against the HZD/HFW machine list; the naming lane owns the final list.

| # | name | role | topology | size L × H | legs / rig | notes |
|---|---|---|---|---|---|---|
| 1 | **Tiller** | herd grazer | hexapod soil-survey walker, seed hopper, auger | 4.5 × 2.7 | 6 legs, 24 bones | **proven** |
| 2 | Plumb | sentry / scout | tripod theodolite on a tall mast, rotating lens drum | 2.4 × 3.4 | 3 legs (offsets 0 / ⅓ / ⅔) | GaitController takes any leg count |
| 3 | Shear | fast predator | low quadruped with scissor-blade forelimbs (tearable) | 3.5 × 1.6 | 4 legs | blades as components |
| 4 | Harrow | charger / tank | wide plough chassis, spinning tine drum | 5 × 2.4 | 6 legs | spinning part through a bone |
| 5 | Spindle | skirmisher | biped stilt-walker, gyroscopic body, lance | 2.2 × 3.8 | 2 legs (L/R, like the Round-4 biped spec) | |
| 6 | Weir | amphibious | low segmented octopod for lagoons and pans | 6 × 1.4 | 8 legs | |
| 7 | Kiln | artillery | slow quadruped carrying a furnace mortar | 5 × 3.5 | 4 legs | emissive core is the weak point |
| 8 | Loom | support / repair | crane-like hexapod with cable arms | 4 × 4 | 6 legs + 2 arm chains | arm chains need a small autorig extension |
| 9 | Bellwether | herd alarm | tall quadruped with a bell lantern (alarm radius) | 3 × 4 | 4 legs | |
| 10 | Sounder | burrower | segmented train (6 segments) on short paired legs | 7 × 1.2 | 12 legs | long spine chain; test cadence-band behaviour |
| 11 | Kite | flier | tethered rotor-kite | 6 span | **no leg gait** | **risk:** the flight path is not proven (§8) |
| 12 | Gantry | boss | 8-legged walking crane, 18 m | 20 × 18 | 8 legs, ≤ 64 bones | LOD1 is required; split the hull into 2–3 skinned meshes |

---

## 8. Risks and open items

1. **GPU frame at DPR 1.5.**
   - The post chain is about 13.5 ms empty (§4.4). That is an engine and quality-tier decision outside this lane, and the precondition for 60 fps at `high`.
   - Re-run A21 on a quiet box before attributing anything to content.
2. **Texture VRAM.** Uncompressed 1024² layers cost 11 MB each. Hold to the layer budget, and measure a KTX2 encoder: either the `toktx` CLI or a WASM encoder, with its disk cost, before adopting one.
3. **Fliers.**
   - Autorig plus the gait is a legged path. The Round-4 fliers were clip-driven donors.
   - Item 11 needs a procedural flight controller (wing and rotor bones, banking, landing). That is about 1–2 days, and it is unproven.
4. **Knee planes.** The IK pole is fixed ±Z. Lateral (spider) knees need a per-leg pole option in `gait.js`, which is an ADAPT.
5. **Shared-loader fixes, so species files do not repeat them:**
   - dequantise on load;
   - read `getX` on interleaved streams;
   - `quantise:false` or a new `PALETTE`;
   - sensor `noShadow`;
   - new `EYE_COLORS`.
6. **Hexapod and octopod corpses.** `deathPose('quad')` ran without errors (12 kills, no console errors, memory flat), but A47/A47c were not graded on six legs.
7. **Terrain coupling.** The river, shelf and path functions are module exports consumed by water, vegetation and props, so the new region has to be landed by those lanes together.
8. **Skirt and far field.** It needs masks and the same splat; in the proof it is untextured sand. The patch-to-skirt seam is visible from the air.
9. **Fidelity.** No decal or trim layer and no micro-normals yet (§5.1 step 6). The generator owns this; do not judge a final frame before it lands.
10. **Blender.** Not needed for anything proven here. Revisit only if hero bosses need baked normal maps or sculpted organic parts.
    - Disk cost: about 1 GB against about 7 GB free (`brew install --cask blender`).
    - Measured justification: none yet.

## 9. Files

- **Tools:**
  - `tools/r5-poc/lib/hs.mjs`, `lib/glb.mjs`
  - `gen-creature.mjs`, `gen-landmark.mjs`, `gen-ground.mjs`
  - `tiller.js`, `poc-creature.js`, `poc-biome.js`
  - `film-creature-world.mjs`
  - `out/*.json`: stats and metrics.
- **Assets:** `public/models/r5-poc/{tiller,sounding-ring}.glb`, `public/textures/r5-poc/*.webp` + `MANIFEST.json`.
  - **Note:** `.gitignore` has `*.glb`, so the two GLBs need `git add -f`. They can also be regenerated deterministically in about 0.35 s by the two generators.
- **The `main.js` flag block:** `?poc=creature|biome`.
- **Frames:** `shots/r5-poc-*.png` (gitignored); JPEG copies in `docs/media/r5-poc/`.
- **Processes:** Vite and Chrome on :5241 were started and killed by the harness each run, and 0 Chrome profiles were left. Port 5173 was never touched.
