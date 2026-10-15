# Round 5: the human pipeline (protagonist, NPCs, armor, weapons)

Owner: human-pipeline lane, Round 5, Oct 15 2026, port 5240.

**The question.** How do we make an original, high-quality protagonist, at least 8 human NPCs that look clearly different, and weapon and armor variants that swap on the protagonist? All of it has to run on the rig and movement stack we are keeping, stay legal, and be buildable on this Mac.

**The answer, proven in the running game behind `?poc=human`.**

- Start from a CC0 body: Quaternius *Universal Base Characters*.
- Dress it in CC0 outfits: Quaternius *Modular Character Outfits – Fantasy*.
- Add our own hair, armor and weapons, generated in node and skinned to the same 65-joint skeleton.
- Bind all of it through a small **rig profile** that the kept stack reads. That stack is the Retargeter, ClipLibrary, PlayerAnimator overlays, hair springs, controller and camera.
- Blender is not needed for any of this. It is optional, and only for a later pass that sculpts a unique face.

Default boot is unchanged; the gate rows at the end of §0 show it.

---

## 0. Proof: what ran and what it measured

| | result |
|---|---|
| assets built with node only (`tools/r5-poc/build-human.mjs`, gltf-transform + sharp + meshopt) | 6 GLBs, **3.0 MB total**: heroine base 597 KB, male NPC base 304 KB, 4 outfits 353–731 KB. Textures are 1024² WebP; hair is 512² and eyes 256² |
| bone map UAL → UBC (`tools/r5-poc/ubcRig.js`) | **52/52 pairs bound**, `missingSource []`, `missingTarget []`, `hipScale 0.9938` (Aloy 1.029). 52 bones are clip-driven |
| clips baked onto the new body by the **unchanged** Retargeter + ClipLibrary | 18 slots in 83.5 ms. The sprint amplitude solved itself to 0.866 (cadence target 3.25). Jog nominal speed 3.21 m/s, sprint 5.75 m/s |
| PlayerAnimator on the new body | `rig ubc-female`, 72 bones. Missing keys are only `neck2`, eyes and lids (the eyes are a mesh). 15+15 fingers with derived curl axes. **1 hair chain found by name** (`dyn_hairBraid_01`, 6 links, class `hair`). 0 twist joints. Melee layer armed (`melee.ok true`) |
| overlays live (film probe) | idle: `flat 1`, look 0.14–1.0, braid tip 2–6 mm. Sprint at 6.70–6.77 m/s: `move 1`, `run 0.59–0.65`, lean 0.037–0.052, bank 0.010–0.024, **braid tip swinging 0.086–0.225 m** off its animated rest |
| side, front and back at idle and sprint | `shots/r5-poc-human-{idle,sprint}-{side,front,back}.png` (read, §4) |
| armor variants swapped live on ONE player and skeleton | `shots/r5-poc-human-variants.png`: Ranger, Ranger with hood up, Peasant, no outfit |
| memory across swaps | geometries 175 → 175 and **textures 179 → 179 after 6 more swaps**. Ten swaps alternate exactly 173/165 ↔ 178/167. Building and then disposing the lineup returns to **178/167 exactly** |
| ≥ 8 NPCs that look clearly different | `shots/r5-poc-human-lineup.png`: 8 people from 2 bodies × 4 outfits × 6 hairstyles × tints. All play the baked idle natively |
| frame cost, spawn camp view, 90 frames | Aloy boot **319 calls**, 4.24 M tris, 16.7 ms median. Heroine boot **326 calls** (+7), 4.23 M tris, 16.7 ms median, JS 6.58 ms against 7.27 |
| player tris | Aloy plus gear: 47.1 k tris over 69 meshes. Heroine plus gear: 43.9 k tris over 73 meshes. **The body is 8 meshes and 32.1 k tris; the inherited gear is 65 meshes and about 11.8 k tris** |
| **gates on the heroine** (`tools/r5-poc/gates.r5-poc-human.mjs`: the name-free gates re-run unchanged with `poc=human`) | **PASS**: `A1-boot-clean`; `A9-perf-budget` (326 draws, 52.3–52.4 fps, 19.5–20.1 ms GPU; one contended run read 31 fps, re-run ×2 clean); `A12-clip-driven` (Sprint_Loop 0.998); `A13-no-skate` (0.002 m); `A15-foot-flat` (pitch err 1.85°, heel and toe clearance ≤ 0.9 mm); `A33-rig-finite` (72 bones, 1 chain) |
| **default boot after the seam edits** (port 5240) | **PASS**: A1; A9 (319 draws, 50–52 fps); A12; A15; A16; A26; A33-rig-finite (424 bones, 66 chains, unchanged); A35 (bow elbow 167.9°, unchanged); **A90** (heap −7.1 %, geometries +12, textures −19). `A13-no-skate` is **intermittent and was already so before this change**: 2 of 4 runs pass on the edited tree and 1 of 2 on an untouched `git archive HEAD` copy served on :5249. Each failure is a single window at 0.069–0.079 m against a 0.06 bar |

Run it with:

```
npx vite --port 5240 --strictPort &
node tools/r5-poc/film-human.mjs --port 5240             # 6 shots + JSON
node tools/r5-poc/film-human.mjs --port 5240 --variants   # live swap strip + memory
node tools/r5-poc/film-human.mjs --port 5240 --lineup     # 8 NPCs
# URL: /?poc=human[&pocOutfit=ranger|peasant|none][&pocHood=1][&pocHair=Long|Buns][&pocLineup=1][&pocFingerAxes=0]
```

---

## 1. Recommendation

Use option (e), the **hybrid**:

- **The body.** It is a CC0 UBC base on the UBC 65-joint skeleton. That is the skeleton the current Quaternius UAL v3, UAL2 and outfit packs all ship on.
- **Clothing and armor.** These are CC0 Modular Outfits parts. Each one is its own swappable SkinnedMesh, bound to that same skeleton by joint name.
- **Hair secondary motion.** This is procedural: `dyn_*` joints plus geometry generated in node. The existing spring solver discovers it with no code change.
- **Weapons.** These are procedural too. `bow.js` already builds them in code; they should be baked to GLBs with socket nodes and merged per material (§5.6).

The other options:

- **Option A** from the inventory: author everything on the UAL skeleton with `npcBody.js`. This is proven for 13 NPCs, but it reads as stylised-primitive at about 2 k tris and has no sculpted face or hands. It is fine as a far-LOD or crowd fallback, not as the hero.
- **Option B**: a custom rig, which needs Blender. It is not needed. UBC is already a game rig with the same UE-style names Aloy used, minus the numeric suffixes.

---

## 2. The candidates, with evidence

| | licence (quoted from the source) | size | skeleton vs our stack | quality | verdict |
|---|---|---|---|---|---|
| **(a) Quaternius Universal Base Characters [Standard]** (itch `universal-base-characters`, Aug 2025, updated Sep 2026) | `License_Standard.txt`: "CC0 1.0 Universal (CC0 1.0) Public Domain Dedication". The itch page: "Asset license: Creative Commons Zero v1.0 Universal" | zip 122 MB (128,968,391 B). Kept subset 50 MB. Shipped as GLB: **597 KB** | **65 joints, UE-style names**: `root, pelvis, spine_01..03, neck_01, Head, clavicle_l, upperarm_l, lowerarm_l, hand_l, index_01_l… *_04_leaf_*, thigh_l, calf_l, foot_l, ball_l, ball_leaf_l`. **These are NOT the `DEF-*` names in our `public/anims` (UAL v1).** The UAL changelog for v2.0 (23/1/2026) reads: "Updated to new rig naming scheme (Same as modular outfits / base chars)". Bind is a T-pose, +Y up, +Z forward, metres, soles at y≈0, body 1.775 m | stylised-realistic sculpted bodies, faces and hands. Textures are 2048² base, normal and roughness. Female 12,812 tris body + 768 eyes + 1,480 brows; male 14,318 tris in total. **The free tier has only the 2 "Superhero" bodies and 8 hairstyles**; the 6-body Source tier costs $19.99, and we can't buy it | **ADOPT** |
| **(a′) Modular Character Outfits – Fantasy [Standard]** | `License_Standard.txt`: "CC0 1.0 Universal (CC0 1.0)". Readme: "only the head of the model is required. Using the full body will result in clipping." | zip 280 MB (294,347,394 B). Kept subset 83 MB. Shipped: **4 outfits, 1.6 MB** | the same 65 joints in every one of 24 files. Female outfit bind equals the Superhero female bind: **max joint Δ 0.000 m, inverse-bind Δ 0**. The male outfits are on a "Regular" male that is 2.0–3.4 cm narrower in the limbs than the Superhero male | 4 outfits (Peasant and Ranger, ×F/M) from 20 parts: hood, pauldrons, bracers, belts, boots. Textures are 4096² (we ship 1024²). Ranger is 26,966 tris, Peasant 13,568 | **ADOPT** |
| **(a″) Universal Animation Library 2 [Standard]** | `License.txt`: "CC0 1.0 Universal (CC0 1.0)" | zip 17 MB. `UAL2_Standard.glb` is 8.1 MB | **the same 65-joint UBC skeleton**, so it plays on the heroine with no retargeting | 43 clips, including `Sword_Regular_A/B/C` (+`_Rec`), `Sword_Regular_Combo`, `Sword_Heavy_Combo`, `Sword_Dash`, `Sword_Block`, `Melee_Hook`, **`OverhandThrow`**, `Hit_Knockback`, `ClimbUp_1m`, `Slide_*`, `Consume`, `Chest_Open`. **No bow-draw clip** | **ADOPT as a clip source** (melee gap M14) |
| (b) MakeHuman / MPFB2 | MakeHuman `LICENSE.md`: "These assets have been released under CC0 1.0 Universal." | needs Blender 5.2.2: **346 MB DMG** (measured content-range 346,286,611 B), about 1.2 GB installed, plus MPFB2 and asset packs | rigs come out as MakeHuman "default" or "game engine" skeletons. Getting them into our stack would mean a new boneMap and retarget, which is the same work as Aloy | realistic-proportioned but generic. Clothing comes from community assets whose licences vary, so each one has to be checked | not now. Revisit only as a source for unique faces (§6) |
| (c) Kenney Mini Characters / Blocky Characters | page text: "License · Creative Commons CC0" | small | not UAL | chibi or blocky; below the hero quality bar | reject for humans |
| (c) Poly Pizza / OpenGameArt CC0 humans | per-asset, and OGA is often CC-BY-SA | — | mostly older Quaternius packs on the pre-UAL rig, or one-off rigs | mixed and low | reject. The verification cost per asset is too high |
| (d) procedural bodies (`npcBody.js`, already in the repo) | our own code | about 0 | the UAL `DEF-*` skeleton | about 2.0–2.4 k tris, vertex colour, primitive faces | crowd and far-LOD only |
| **(e) hybrid = (a)+(a′) + procedural hair, armor and weapons** | CC0 plus our own work | 3.0 MB for everything in §0 | one skeleton | the hero reads as a real character (§4) | **RECOMMENDED** |

Download note: both packs come only through itch.io's free "Download Now → No thanks, just take me to the downloads" flow. That needs no account or payment, but it has no stable URL. Record the SHA-256 of each zip in `models-staging/human/MANIFEST.md` when promoting.

---

## 3. The pipeline, step by step

1. **Fetch once, outside git.** Get UBC [Standard], MCO-Fantasy [Standard] and UAL2 [Standard] from itch. Unzip only `Base Characters/Godot - UE`, `Hairstyles/Rigged to Head Bone/glTF`, `Exports/glTF (Godot-Unreal)/Modular Parts` and the licence files. The scratch copies from this run are in `…/scratchpad/r5/{ubc,mco,ual2}`.
2. **Build** with `node tools/r5-poc/build-human.mjs --src <dir>`. Promote it to `tools/build-humans.mjs` with output to `public/models/humans/`. It does the following, each step measured in this run:
   - Repairs the packs' broken image URIs (`T_Eye_Normal_png.png`).
   - Strips `TEXCOORD_1..4` and `COLOR_0..2`, which three never reads.
   - Folds 8-influence skins (`JOINTS_1`/`WEIGHTS_1` on the Ranger body and legs) down to the top 4 and renormalises them. three skins with 4 influences and silently ignores the rest.
   - **Grafts parts onto one skin by joint name.** It compares inverse-bind matrices on the joints the part actually uses. Where they differ, it **re-binds the vertices by LBS**. That covers hairstyles authored for the other sex's head (Head bone at 1.55 m vs 1.60 m) and the Superhero male head on the Regular male skeleton (limbs Δ 2–3.4 cm).
   - Cuts a **head and neck body piece by skin weight** (3,088 of 12,812 tris) to wear under outfits.
   - **Authors the braid**: 6 `dyn_hairBraid_*` joints plus an `_end` under `Head`, and a 1,104-tri plaited tube skinned along them.
   - Dedups materials, then joins primitives per material, keeping pieces that toggle (hood, pauldrons) separate.
   - Converts textures to 1024² WebP (hair 512², eyes 256²) and applies meshopt and quantization.
3. **Rig profile** (`tools/r5-poc/ubcRig.js` → `src/entities/anim/rigs/ubc.js`). This is everything a new body hands the kept stack: `map` (UAL source → body, 52 pairs), `key` (the animator's 31 short keys), `contacts` and `feet` (gait), `aim` (the stock `AIM_RULES`), and `fingerAxes`. The finger axes are **derived from the bind pose**, not typed by hand. It rides on `root.userData.rigProfile`, which `SkeletonUtils.clone` copies.
4. **Seams in the kept files.** With no profile present each one is identical to today; about 50 changed lines across 3 kept files, plus the flag in `main.js`:
   - `PlayerAnimator`: `this.KEY` comes from the profile. `_findName` also accepts the suffix-free stem. `e.curlAxis` is set per finger.
   - `ClipLibrary`: the profile's map, aim and contacts, plus feet for `analyzeGait`.
   - `player._readHeadOffset`: a head-bone fallback.
   - `main.js`: the dev-only `?poc=human` import.
5. **Runtime binding.** `assets.normalize` scales the **body** to the chosen height, measured from `Body_Full` and not from hair or hood. The POC uses 1.72 m, Aloy's height, so every absolute-metre constant compares like for like. Outfits are separate GLBs. Each SkinnedMesh keeps its own inverse-bind matrices and bindMatrix, and is bound to the body's bones **by name** (`tools/r5-poc/pocHuman.js: attachOutfit`).
6. **Swapping** (`__POC__.wear(name)` and `hood(on)`). Remove the meshes, then dispose geometry, materials, every texture slot, **and the mesh's Skeleton**. Also drop the player's fade-clone bookkeeping (`_matMap`, `_mats`).

   Finding: three gives every SkinnedMesh its own `Skeleton`, and every Skeleton owns a bone DataTexture. Without `skeleton.dispose()` the POC leaked **+1 GPU texture per outfit mesh per swap** (measured 179 → 195 over 8 swaps). With it the count is flat.

   Hidden variants (hood, alternate hairstyles, the full body under an outfit) are visibility toggles. They cost no draw and no shadow.
7. **Clip source.** Point `ANIMS.ual` at UAL v3 Standard (15 MB, the same names as UBC) and add UAL2 as a second source. The bone map then becomes the identity. Keep the Retargeter for contact capture, ground-fix and amplitude warp.

   Caveat: UAL v2.1 re-exported at 30 fps (previously 24). The cadence solve re-derives automatically, but re-run A28 and A81.
8. **Re-tune and re-stage.** Work through the §4.3 list on the new body, then re-stage the gates. 21 of them name an Aloy bone or chain.

---

## 4. What broke on the new body, and how much of PlayerAnimator needs re-tuning

### 4.1 Read from the shots

- **Idle, side/front/back.** She stands planted. Fists are closed, hands hang beside the thighs ("idle hands fine"). The braid hangs down the back, and the face, outfit and boots read cleanly.
  - **Broken:** the stowed spear floats about 0.2 m behind her back. `meleeLayer` `SOCKET.MID (-0.15, 1.18, -0.335)` and `STOW_POS` are Aloy char-space metres, and Aloy carried a quiver and braid there.
- **Sprint, side/front/back.**
  - The torso drives forward and the legs reach full extension.
  - The arms swing fore-aft beside the body with hands between hip and chest. There is no T-rex, no prancing, and no crossing in the front or back views.
  - The braid trails; the solver measured 0.086–0.225 m of tip swing.
  - The head stays level.
  - The spear rides diagonally across the back.
- **Full draw, side** (`r5-poc-human-draw-side.png` plus `debugArm`).
  - The draw hand is at the cheek: hand to head 0.122 m, inside A35's 0.10–0.16 band.
  - It sits outside the hair; the shaved sides leave no braid to pass through.
  - Nock to anchor is 0.035 m.
  - **Fail: the bow arm is bent to 141°**, against A35's 165–172° (Aloy 168°). The draw triangle *over-closes* on this body: `idealGripDist 0.447` against a locked reach of 0.472.
  - **The draw elbow is 0.089 m below the shoulder**, where Kevin's rule wants it level or back.
  - Both are body-geometry constants, not algorithm problems (§4.3).

### 4.2 Bone-name assumptions found, and how each was handled

| where | Aloy assumption | on UBC | handled in the POC |
|---|---|---|---|
| `playerAnimator.KEY` (31 names) | `pelvis_05`, `head_0104`, 5 spine joints and 2 neck joints | `pelvis`, `Head`, 3 spine joints and 1 neck joint | profile `key`. `spine4`/`spine5` alias `spine_03`, so melee arms. `neck2`, eyes and lids are null |
| `_findName('index_01_r_')` | numeric suffix after `_` | `index_01_r` (no suffix) | the stem fallback in `_findName` |
| `_curlFingers` about local +Z | UE4 axes | Blender axes (+Y along the bone) | profile `fingerAxes` derived from the bind. Measured effect at current gains: ≤ 7 mm of tip difference (draw grip, left hand 0.070 vs 0.063 m tip to wrist). Low visibility, now correct |
| `clipLibrary FOOT_L/BALL_L`, `CONTACT_BONES` | `foot_l_0189` … | `foot_l`, `ball_l` | profile `contacts` and `feet` |
| `player._readHeadOffset` | `bones['head_0104']` | `Head` | falls back to `animator.b.head` |
| `player.js ORBIT_CAPS` | `middle_03_l_end`, `thumb_03_l_end`, `ball_l_end`, `head` | `*_04_leaf_*`, `ball_leaf_*`, `Head` | **not fixed.** The orbit proxy silently loses its hand, foot and head capsules. Move it into the profile |
| `combat.js:960` | `getBoneWorld('hand_r_045')` (nock landing) | `hand_r` | **not fixed.** It returns null and the check is skipped. Read `animator.KEY.handR` instead |
| `meleeLayer MASK_PREFIX` | `head_` | `Head` | **not fixed.** The masked sword clip never writes the head. Make it case-insensitive or move it to the profile |
| `meleeLayer` braid guard, gates A19/A33/A34/A104 | `dyn_hairBack*` | `dyn_hairBraid_*` | **not fixed.** The guard is inert. Do M10 instead: a spring-side collider |
| twist joints | 26 on Aloy | 0 | the twist layer is skipped. The wrist can candy-wrap under forearm roll in the draw and in melee; watch V-shots |
| eyes and lids | bones | an eye mesh on `Head` | the look-at loses its last 10 % and the blink is gone. Add 2 eye joints in the build if wanted |

### 4.3 Re-tuning: proportions and rest-pose deltas

| | UAL source (`DEF-*`) | UBC heroine (raw 1.775 m → 1.72) | Aloy (1.72) |
|---|---|---|---|
| hips / pelvis height | 0.917 | 0.932 raw, `pelvisRestY` 0.911 | — |
| shoulder (upperarm) | 0.192, 1.441 | 0.152, 1.418 raw | — |
| arm length, upper + lower (char m) | 0.548 | **0.233 + 0.242 = 0.475** | 0.493–0.501 |
| head joint | 1.569 | 1.550 raw (skull base, 1.502 scaled) | 1.40, at the skull base |
| ball rest / bind sole pitch | — | +0.0225 m / 22° | −0.007 m |
| hipScale | — | 0.994 | 1.029 |

What carries over with **zero** changes, as the idle and sprint films show:

- the locomotion tree;
- cadence and amplitude solves (re-derived at bake);
- ground conform and foot locks;
- every angular overlay: lean, bank, arm swing, breath, hit lean, stance flex. They are all applied in char space;
- the spring solver;
- every value measured at bind.

What **must be re-derived on this body**, with no algorithm changes:

- the **bow/aim set** in inventory §2.1.6, about 12 rows: `ANCHOR_OFF`, `ANCHOR_DROP`, `HAND_ANCHOR_R`, `HEAD_OFF`/`HEAD_R`, `QUIVER_HIP`, grip seed, aim-ray origin, poles, bow and two-hand carry grips, heal reach, `_bodyCapsules`. These fix the 141° bow arm and the low elbow;
- **all `meleeLayer` tables** in §2.1.7: SOCKET, CARRY, READY, STANCE, BEATS, HEAVY and the guards;
- the `player.js` orbit capsules;
- `combat` `STOW_POS` and the bow `pull`.

The arm is 3.6 % shorter than Aloy's, so the draw length has to be solved again: `Lmax = −u·d + sqrt((u·d)² − ‖u‖² + reach²)`.

---

## 5. How each asset class is authored

### 5.1 Protagonist
UBC female body, cut at head and neck, with an outfit layered on top. The hairstyle is our choice: the POC uses `Hair_BuzzedFemale` plus one thick procedural rope braid. That deliberately avoids a red mane of many braids.

**Distinctiveness.** UBC is a public CC0 base and other games use it. What makes the heroine ours:

- silhouette: shaved sides with a single braid, a hood option, pauldrons;
- palette;
- a face-paint, scar and tattoo layer composited onto the base-colour texture with `sharp` in the build;
- our own weapons;
- optionally a sculpted face (§6).

### 5.2 NPCs: 8 that look clearly different, proven
The axes of variation:

- 2 bodies, with height scaled from 1.64 to 1.84 m;
- 4 outfits, each with hood and pauldron on or off;
- 6 hairstyles plus beard;
- skin, hair and outfit tints, as material colour multipliers.

The Source tier would add 6 bodies and 3 colourways, but it is paid. The outfits carry `COLOR_0..2` vertex masks that look like recolour masks; a mask-aware tint shader would beat whole-texture tints.

**Cost as measured: 6.5 draws and 25 k tris per NPC.** The 8-NPC lineup pushed the frame to **366 calls**, over the 350 cap, and 2.54 M tris. Before NPCs ship:

- atlas skin, outfit, hair and eyes into one 1024² texture per body type, giving 1–2 draws per NPC. sharp composites the atlas; the build remaps the UVs;
- add a `simplify` LOD at about 50 % (meshoptimizer is already in the repo).

The idle is the heroine's baked clip, played by name. The male pelvis track is 1.7 cm off, so bake one ClipLibrary per body type (about 90 ms each) or play UAL v3 clips natively once step 3.7 is done.

### 5.3 Hair
UBC hair is a textured **shell rigid on `Head`**; the strands are greyscale and tinted by the material colour.

- **Short styles** suit the protagonist. `Hair_Long` is fine for NPCs at idle but will clip in motion.
- **Moving hair** (braids, ponytails, tails) is **procedural**: `dyn_<name>_NN` joints plus `_end`, and lofted geometry or alpha-tested cards skinned along the joints. The build already does this.
- The existing solver discovers chains by name and classes them by regex (`hair`, `cloth`, `gear` …). That was proven: 1 chain found, swinging 0.09–0.23 m at sprint.
- **Still to build:** a spring-side collider against the drawing hand and forearm (M10), which replaces the Aloy-name braid guard.

### 5.4 Armor and outfit variants
**One skeleton, many meshes.**

- Each piece is a SkinnedMesh bound by joint name and keeps its own inverse-bind matrices.
- Toggled pieces cost 0 draws while hidden.
- A variant set is a GLB of 0.35–0.73 MB.

**Our own armor pieces** (machine-hide plates, bracers, pauldrons) are generated in node the same way the braid is: geometry rigid-weighted to 1–2 joints and textured from a shared atlas. Where one should sit flush, take its surface from the body's own vertices (offset along the normal).

Swaps must dispose the mesh **and** its Skeleton (§3.6).

### 5.5 Weapons
They are already procedural in `src/combat/bow.js` (`buildWeaponModel`, `buildSpear`). The gear on the player is **65 visible meshes**: that, not the body (8), is the draw-call lever.

The pipeline:

1. Bake each weapon in node (three geometry + `GLTFExporter`, or gltf-transform) to a GLB, **merged per material, so 1–2 draws**.
2. Give each GLB named socket empties: `grip`, `nock`, `string_top`/`string_bottom`, `tip`, `stow`.
3. Author it at its real length. That retires the `SPEAR_SCALE 0.80` hack (M9).
4. Express variants as data (curve, wrap, palette, tip) so each variant is a parameter, not a new import.

UAL2's `OverhandThrow`, `Sword_Regular_A/B/C` and `Sword_Heavy_Combo` give a new spear or blade class real clip coverage.

---

## 6. Blender: what it would add, and the no-Blender path

**No Blender needed for:**

- bodies, outfits and hair;
- procedural `dyn_` chains;
- LBS re-binding;
- head cuts;
- joining by material;
- WebP and meshopt compression;
- simplify LODs;
- texture atlasing (sharp composite + UV remap in node);
- weapons and armor generated in node;
- the whole runtime side.

All of that was done or measured in this run.

**What Blender would add:**

- sculpting a **unique face** and head shape. This is the main distinctiveness risk: the stock UBC face is shared;
- weight-painting hand-modelled armor;
- authoring hair cards by hand;
- adding twist joints;
- MPFB2 faces, if we want them.

**Cost:** Blender 5.2.2 arm64 is a 346 MB DMG (measured) and about 1.2 GB installed, against about 11 GB free (`df`, Oct 15).

**Recommendation:** do not install it for the pipeline. Install it (`brew install --cask blender`) only when Kevin wants a sculpted face pass. The node path covers everything else.

---

## 7. Budgets (per asset)

| asset | LOD0 tris | draws (meshes) | materials | textures | file | measured now |
|---|---|---|---|---|---|---|
| protagonist body + head + hair + braid + eyes | ≤ 20 k | ≤ 4 | skin, hair, eyes, braid | 1024² WebP base/normal/ORM for skin; 512² hair | ≤ 0.7 MB | 32.1 k with ranger, in 8 meshes |
| protagonist outfit / armor set | ≤ 20 k (simplify the 27 k Ranger) | 1 + toggled pieces | 1 atlas | 1024² base/normal/ORM | ≤ 0.8 MB | Ranger 26,966 tris in 4 meshes, 731 KB |
| one armor piece (hood, pauldron, bracer) | ≤ 3 k | 0 when hidden, else 1, or merged per loadout | the outfit atlas | — | ≤ 0.15 MB | hood 2,136, pauldrons 1,376 |
| weapon (bow, spear, new) | bow ≤ 3 k, spear ≤ 1.5 k | 1–2, with the quiver and arrows merged | 1 weapon atlas | 512² | ≤ 0.15 MB | **65 gear meshes** (inherited) |
| NPC | ≤ 12 k at LOD0, ≤ 4 k at LOD1 beyond 25 m | ≤ 2 | 1 atlas per body type | 1024² | body ≤ 0.4 MB, outfits shared | 25 k and 6.5 draws: **over budget** |
| shadows | LOD1 casters only, ≤ 3 per human | — | — | — | — | 13 casters on the player |

Frame bars stay the same: A9 and A21 ≤ 350 draws. The fight scene had 7 calls to spare, and the heroine as built added 7. So the protagonist must land at ≤ 4 body meshes and the gear at ≤ 6 before Round 5 content goes in. A90 stays green provided swaps dispose skeletons.

Gates to add:

- A-human-bind: map coverage 52/52, and missing keys only within {neck2, eyes, lids};
- A-outfit-swap-memory: textures and geometries equal after 6 swaps;
- A-npc-variety: ≥ 8 distinct mesh/colour signatures;
- V-human-{idle,sprint}-{side,front,back}: judged against our own licence-clean pose references.

---

## 8. Risks

1. **The stock base is recognisable** (a CC0 public base). Mitigate with the §5.1 list; a sculpt pass needs Blender.
2. **The free tiers are thin**: 2 bodies, 4 outfits, 43 of UAL2's clips. The paid Source tiers are not an option for us, so variety leans on tints, piece toggles and our own procedural pieces.
3. **The itch download is a manual flow** with no pinned URL. Record hashes; it is a one-time fetch.
4. **Outfits are authored for "Regular" bodies.** Male NPCs use the Regular skeleton with an LBS-rebound Superhero head; female is exact.
5. **Bow-draw constants fail A35 on this body until re-derived** (141° bow arm, low elbow). Melee tables need the same re-measure.
6. **Draw calls.** NPCs as delivered break the 350 cap at 8 on screen; atlas and LOD are mandatory. The inherited gear (65 meshes) has to be merged.
7. **Per-mesh Skeletons own bone textures.** Every runtime swap and NPC dispose must call `skeleton.dispose()`. The POC hit this leak and fixed it.
8. **Switching the clip source to UAL v3/UAL2** changes fps (24 → 30) and clip content. Re-run A28/A81 and the gait gates.

## 9. Files

**Added** (all dev-only, loaded only by `?poc=human`):

- `tools/r5-poc/build-human.mjs`
- `ubcRig.js`
- `pocHuman.js`
- `film-human.mjs`
- `gates.r5-poc-human.mjs`
- `assets/*.glb` (3.0 MB)

**Edited seams** (behaviour unchanged without a profile):

- `src/entities/playerAnimator.js`
- `src/entities/anim/clipLibrary.js`
- `src/entities/player.js`
- `src/main.js`

**Shots:**

- `shots/r5-poc-human-{idle,sprint}-{side,front,back}.png`
- `-variants.png`
- `-lineup.png`
- `-draw-side.png`
- `-zaxis-draw-side.png`
- `-probe.png`
