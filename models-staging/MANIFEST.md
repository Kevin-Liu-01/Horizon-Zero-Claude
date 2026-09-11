# Models Staging Manifest

Downloaded 2026-08-05. Total ~32 MB. All files verified: `.glb` start with `glTF` magic; `.gltf` are valid JSON with embedded (base64) buffers and textures — every file is fully self-contained. Structure inspected with `node tools/dump-structure.mjs <path>`; animation clips read via `@gltf-transform/core`.

## Individual models (staging root)

| File | Source | Author | License | Size (bytes) | Rigged? | Animation clips | Casting suggestion |
|---|---|---|---|---|---|---|---|
| `Fox.glb` | [KhronosGroup/glTF-Sample-Assets](https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb) | PixelMannen (model); tomkranis (rig/anim); @AsoboStudio & @scurest (glTF) | CC0 1.0 (model) + CC BY 4.0 (rig/anim + conversion) | 162,852 | Yes — 1 skin, 24 joints | `Survey`, `Walk`, `Run` | Rig/animation pipeline test asset; also fox/ambient wildlife. Note: authored in cm scale (~75 units tall) |
| `MechQuadruped.glb` | [poly.pizza/m/5x1hRpbmdfo](https://poly.pizza/m/5x1hRpbmdfo) | 3Donimus | CC-BY 3.0 | 3,215,544 | No — static, single mesh node | none | Behemoth-lite / heavy herd bull (Broadhead); needs procedural gait or root-motion bob |
| `MechanicalHorse.glb` | [poly.pizza/m/d4bayjeM1aD](https://poly.pizza/m/d4bayjeM1aD) | jake young | CC-BY 3.0 | 4,852,788 | No — static, ~hundreds of flat `group*` mesh nodes at origin | none | **Strider** (draft-horse acquisition machine); procedural animation required |
| `Velocirobot.glb` | [poly.pizza/m/4XsUYx8ON1T](https://poly.pizza/m/4XsUYx8ON1T) | Hoai Nguyen | CC-BY 3.0 | 3,040,864 | No — static, flat `group*` mesh nodes | none | **Sawtooth-lite / Watcher** (raptor-biped combat machine); procedural animation required |
| `Robocat.glb` | [poly.pizza/m/d78wyEWCmTC](https://poly.pizza/m/d78wyEWCmTC) | Jordan Hill | CC-BY 3.0 | 506,924 | No — static, single mesh node | none | **Ravager-lite / Scrapper** (cat-chassis combat machine); procedural animation required |
| `RobotEnemyFlying.glb` | [poly.pizza/m/lF3jeRJwiH](https://poly.pizza/m/lF3jeRJwiH) | Quaternius | CC0 1.0 | 298,324 | Yes — 2 skins, 22 joints | `CharacterArmature\|Attack`, `\|Dead`, `\|Idle`, `\|Run`, `\|Shoot`, `\|Walk` | **Glinthawk** (flying acquisition machine) — best ready-to-use flyer: rigged, has Attack/Shoot/Dead |

## quaternius-animatedmech/ — "Animated Mech" pack (Textured variants)

Source: [quaternius.com/packs/animatedmech.html](https://quaternius.com/packs/animatedmech.html) → Google Drive folder `1sueV_4CGMpZC8y30mWfgKK9UaT3mkHBX`. License: **CC0 1.0** (bundled `License.txt`). Textures embedded in each `.gltf`. All rigged humanoid mechs sharing the clip set `Dance, Death, Hello, HitRecieve_1, HitRecieve_2, Idle, Jump, Kick, No, Pickup, Punch, Run, Shoot, SwordSlash, Walk, Yes` (+ `_Holding`/`_Tall` locomotion variants where noted).

| File | Size | Joints | Clips | Casting suggestion |
|---|---|---|---|---|
| `George.gltf` | 5,152,038 | 47 | 20 (adds `Run/Walk_Holding`, `Run/Walk_Tall`) | Corrupted humanoid machine / bandit-with-gun stand-in (has Shoot) |
| `Leela.gltf` | 3,382,594 | 17 | 18 (adds `Run/Walk_Tall`) | Light scout mech — Watcher-adjacent humanoid sentry |
| `Mike.gltf` | 4,423,046 | 43 | 18 (adds `Run/Walk_Holding`) | Mid-tier combat mech / boss add |
| `Stan.gltf` | 3,787,080 | 43 | 18 (adds `Run/Walk_Holding`) | Mid-tier combat mech / boss add |

## quaternius-ultimatemonsters/ — "Ultimate Monsters" pack (selected)

Source: [quaternius.com/packs/ultimatemonsters.html](https://quaternius.com/packs/ultimatemonsters.html) → Google Drive folder `18m4KpzpEzhC9wl7jzr6dUc0N8Jozr79C`. License: **CC0 1.0** (pack page links CC0; bundled `License.txt` states CC0 1.0 — its header says "Ultimate Platformer Pack", a Quaternius boilerplate quirk). Kept a casting-relevant subset of the glTF exports (pack also ships Blend/FBX/OBJ and many more monsters — Alien, Orc, Yeti, Armabee, Goleling, etc. — re-fetch from the same folder if needed). Textures embedded.

| File | Size | Joints | Clips | Casting suggestion |
|---|---|---|---|---|
| `Big/Dino.gltf` | 1,211,215 | 43 | 14: `Death, Duck, HitReact, Idle, Jump, Jump_Idle, Jump_Land, No, Punch, Run, Walk, Wave, Weapon, Yes` | **Thunderjaw-lite** (big theropod biped) |
| `Big/Birb.gltf` | 1,223,075 | 43 | 14 (same set) | **Longleg** (terror-bird recon biped) |
| `Blob/Cat.gltf` | 175,682 | 4 | 9: `Bite_Front, Dance, Death, HitRecieve, Idle, Jump, No, Walk, Yes` | Scrapper pack filler (small quadruped-ish, has Bite) |
| `Blob/Dog.gltf` | 142,124 | 4 | 9 (same set) | Scrapper/hyena pack filler |
| `Blob/Chicken.gltf` | 213,187 | 4 | 9 (same set) | Ambient critter / herd filler |
| `Flying/Dragon.gltf` | 427,100 | 13 | 8: `Death, Fast_Flying, Flying_Idle, Headbutt, HitReact, No, Punch, Yes` | **Glinthawk flock** alternative (rigged flyer with flying idle) |
| `Flying/Dragon_Evolved.gltf` | 991,335 | 46 | 8 (same set) | **Stormbird-lite** (large apex flyer) |
| `Flying/Pigeon.gltf` | 368,129 | 13 | 8 (same set) | Ambient bird / flock filler |

## Casting quick map (per docs/research/roster-v2.md)

- Strider → `MechanicalHorse.glb` · Broadhead/Behemoth-lite → `MechQuadruped.glb` · Sawtooth-lite/Watcher → `Velocirobot.glb` · Ravager-lite/Scrapper → `Robocat.glb` · Glinthawk → `RobotEnemyFlying.glb` (rigged) or `Flying/Dragon.gltf` · Stormbird-lite → `Flying/Dragon_Evolved.gltf` · Longleg → `Big/Birb.gltf` · Thunderjaw-lite → `Big/Dino.gltf` · Scrapper packs / herd fillers → `Blob/*` · Humanoid enemies → `quaternius-animatedmech/*` · Anim pipeline test → `Fox.glb`.
- Caveat: the four CC-BY Poly Pizza machines are unrigged static meshes — plan procedural leg/gait animation or bone-grafting; the Quaternius assets are the ready-to-animate ones.

## ATTRIBUTIONS (paste into credits screen)

Required (CC-BY):

```
Fox model by PixelMannen (CC0 1.0); rigging & animation by tomkranis (CC BY 4.0);
glTF conversion by @AsoboStudio and @scurest (CC BY 4.0) — via KhronosGroup/glTF-Sample-Assets.
MechQuadruped by 3Donimus [CC-BY 3.0] via Poly Pizza (https://poly.pizza/m/5x1hRpbmdfo)
Mechanical Horse by jake young [CC-BY 3.0] via Poly Pizza (https://poly.pizza/m/d4bayjeM1aD)
Velocirobot by Hoai Nguyen [CC-BY 3.0] via Poly Pizza (https://poly.pizza/m/4XsUYx8ON1T)
Robocat by Jordan Hill [CC-BY 3.0] via Poly Pizza (https://poly.pizza/m/d78wyEWCmTC)
```

CC-BY 3.0 license text: https://creativecommons.org/licenses/by/3.0/ · CC BY 4.0: https://creativecommons.org/licenses/by/4.0/

Optional courtesy credits (CC0, no attribution required):

```
Robot Enemy Flying by Quaternius (CC0) via Poly Pizza (https://poly.pizza/m/lF3jeRJwiH)
"Animated Mech" and "Ultimate Monsters" packs by Quaternius (CC0 1.0) — https://quaternius.com
```

---

# Round 4 expansion — LICENCE + FIT AUDIT (independent verification pass)

Audited 2026-09-11 against `models-staging/expansion-a/` and `expansion-b/` as they sit on disk.
Every claim below was re-derived from the files and the live source pages, not from the rows below.

## 1. Files — 74/74 exist and load

All 74 staged models (55 in `expansion-a`, 19 in `expansion-b`; 65.0 MiB total) were re-read with
`@gltf-transform` via `node tools/dump-structure.mjs` plus a per-file inspector. Result:

- **0 failed to load, 0 bad `glTF` magic, 0 external buffer/image URIs** — every file is
  self-contained, as claimed.
- **Every measured number in the rows below is correct**: byte sizes, triangle counts, skin counts,
  joint counts and clip names all match to the digit across all 74 files. `expansion-b`'s stated
  total (9,886,748 bytes) is exact.
- The sweep manifests and the disk agree exactly — **nothing listed is missing, nothing on disk is
  unmanifested**.

## 2. Licences — 74/74 verified, 0 rejected, 0 deleted

| Path | How verified | Result |
|---|---|---|
| 49 Poly Pizza assets | fetched `poly.pizza/m/<id>`, read `Licence` + `Creator` out of the SSR `__SERVER_APP_STATE__` blob | all match the claimed row |
| 15 polygone.art assets | fetched `blob.polygone.art/assets/<guid>/data.json`, read `license` + `authorName` | all `CREATIVE_COMMONS_BY` = CC-BY 3.0, all match |
| 8 Quaternius pack `.gltf` | pack page `quaternius.com/packs/ultimateanimatedanimals.html` states "License CC0"; bundled `_quaternius-animals/License.txt` states CC0 1.0 Universal; `quaternius.itch.io/lowpoly-animated-animals` states "Creative Commons Zero v1" | CC0 confirmed three ways |
| 2 GitHub-mirror `.glb` | repo `LICENSE` is MIT; both files re-downloaded from the cited raw URLs and **md5-compared** | byte-identical to source |

- **Zero CC-BY-NC. Zero share-alike. Zero unlicensed. Zero ambiguous.** No file was rejected and
  **no file was deleted** — the two sourcing agents' licence discipline holds up completely.
- Per-asset author attribution also checks out (Poly by Google, Quaternius, Kenney, Kay Lousberg,
  Hoai Nguyen, Sherkiz, Syl, J-Toastie, Robert Mirabelle), so the ATTRIBUTIONS blocks are accurate.
- Provenance went further than the rows claimed: `Parasaurolophus` (291,016) and `Frog_easyenemies`
  (587,360) are **md5-identical** to the cited GitHub raw URLs, and sweep B's byte-identity claim for
  `Velociraptor` / `Trex` / `Apatosaurus` / `Snake` re-verified md5-for-md5.

## 3. Roster coverage — the biggest fit caveat

**Six of the thirteen target species have no entry in `docs/research/roster-v2.md` at all:**
**Lancehorn, Charger, Trampler, Stalker, Bellowback, Rockbreaker.** The roster's §3 table and §4
spec cover Watcher, Strider, Broadhead, Grazer, Scrapper, Longleg, Glinthawk, Snapmaw, Sawtooth,
Ravager, Shell-Walker, Corruptor, Behemoth, Stormbird, Thunderjaw and Tallneck — and nothing else.

Every "per roster §4" / "roster §4 puts the fire vents…" / "Components per roster" citation attached
to those six species below is therefore **unverifiable against this repo** — the cited rows do not
exist. Those six are real HZD machines, so the silhouette fits remain reasonable on HZD knowledge,
but the component lists, damage numbers and telegraph timings quoted for them are **not sourced from
roster-v2** and must not be treated as spec. Citations for Grazer, Broadhead, Snapmaw, Shell-Walker,
Ravager, Stormbird, Tallneck, Corruptor and the Watcher/Redeye rows DO check out against §3–§4.

**Action for the next pass:** either extend `roster-v2.md` with the six missing machines, or
re-scope the expansion to the machines the roster actually specifies.

## 4. Fit claims corrected in the rows below

Measured data was flawless; the *interpretive* claims were where the errors sat. Nine rows fixed:

1. **`Lobster_PolyGoogle.glb` — the claw pair does NOT "lift out as-is."** One mesh, one material.
   Separating the two claws needs vertex-island surgery, and sweep B's own notes confirm there is no
   Blender on this machine. Demoted to a shape reference. *(The only claim in either sweep that would
   have broken a kitbash plan outright.)*
2. **`Frog_Quaternius.glb` is not a Bellowback primary.** Its 43 joints are a humanoid biped with
   five-fingered hands — the same `CharacterArmature` as the already-staged `Big/Dino.gltf`.
3. **`Armabee` opened no gap.** `quaternius-ultimatemonsters/Flying/{Dragon,Pigeon,Dragon_Evolved}`
   have carried the identical 8-clip `Flying_Idle`/`Fast_Flying` set since the original staging.
4. **Armabee→hawk is not a 1:1 wing map** (Armabee↔Bat is; the hawk's 3-bone wing + 4 feather bones
   is a different topology).
5–8. **Four "the materials split cleanly into X/Y/Z" claims were overstated** — `Crocodile1328`
   (actually body/belly/eyes/teeth; scutes and limbs are NOT separable), `Anteater`, `Lion`
   (limbs share the body material) and `SecurityCamera` (colour names, no named lens group).
9. **`Stag_Quaternius.gltf` was understated and is now sharper** — the antlers are node
   `Stag_Horns` → mesh `Cube.001`, unskinned, parented straight to the `Head` joint. The horn node
   *is* the socket. Still the cleanest kitbash in either sweep.

Also corrected: the GitHub mirror path is `Trex.glb` not `TRex.glb`; `expansion-a` is 57 files only
if you count `License.txt` and `inspect.mjs` (55 models); `Worm_Quaternius.glb` reads as a zero-size
bbox because its node carries `scale = 209.45` and a −90° X rotation, not because of quantization.

## 5. Duplicates

- **Zero exact byte duplicates across the two sweeps** — sweep B's dedupe pass did its job, and every
  md5 in the tree is unique.
- The overlapping *roles* below are genuinely distinct assets (different tri counts and bytes), but
  only one of each should be promoted: Armadillo 672 vs **2,149**; Turtle 4,026 flat vs **536 domed**;
  Bison 1,492 vs 1,012; Crocodile 536 vs **1,328** vs Caiman 2,116 vs Alligator 622 (four
  crocodilians for one machine); Drill 1,198 mining vs 856 handheld (correctly kept as two);
  Wolf 51j vs 16j.
- **Redundant against assets already in this repo:** `Armabee` (see §4.3), and `Worm_Quaternius.glb`
  (240 tris, static) is superseded for its only stated role by the rigged `_donors/Snake_Quaternius.glb`,
  which both sweeps agree is the better tunnelling proxy.
- **Weight outliers worth a texture pass before promotion**: `Gopher` 1.97 MB and `GoldenEagle`
  1.57 MB both carry only ~950–1,570 tris; `Badger` does the burrower-proxy job at 514 tris / 54 KB.

## 6. Rig claims — all structurally verified

`Stag_Horns`→`Head` ✓ · `TurretCannon` = `Turret_Cannon_Base` + `_Top` ✓ · `Drill_KayKit` =
`drill_structure` + `drill_module` ✓ · `RobotEnemy` carries joints literally named `Eye` and `Gun`
plus IK `Foot.L/R`/`PT.L/R` and a `Shoot` clip ✓ · `Spider` = 4 leg pairs × 3 segments ✓ ·
`Bat` = `Shoulder.L/R → Wing1→Wing2→Wing3→Wing4` ✓ · `Armabee` = `Wing1-4.L/R` ✓ ·
`Cat` = one bone per leg plus an `_end` tip, so **clip donor only** ✓ (sweep B's caveat is correct) ·
`HawkLpRigged` = 58-joint `metarig` with real `w_feather.001-004.L/R` chains ✓ ·
`Frog_easyenemies` = genuine 3-segment quadruped ✓ (note its right front chain is mis-named
`FrontLeg.L.001` — do not key a retarget map on that name).

---

# Round 4 expansion (sweep A)

Downloaded 2026-09-10 into `models-staging/expansion-a/<species>/`. **50 MB total, 40 files, largest
2.44 MB** (budget: ≤40 MB/model, ≤200 MB/agent — both far under). Sources swept by this agent:
**Poly Pizza, Quaternius, Kenney, KayKit**.

All `.glb` verified to start with the `glTF` magic; all `.gltf` verified to be valid JSON with a
single embedded (base64 `data:`) buffer and zero external image URIs — every file is fully
self-contained. Structure recorded with `node tools/dump-structure.mjs <path>`; joints/clips/tris
recorded with `node models-staging/expansion-a/_tools/inspect.mjs <path…>` (a staging-local
companion, because `tools/dump-structure.mjs` prints the node tree and skins but not animation
clips, tri counts, or material/texture counts).

**Licence discipline:** every row below is CC0 1.0 or CC-BY 3.0. Nothing NC, nothing unlicensed, no
Sketchfab (no API token). Quaternius pack downloads ship their own `License.txt` (kept at
`expansion-a/_quaternius-animals/License.txt`, CC0 1.0 Universal, verbatim from the pack).

## How the two access paths worked (for the next sweep)

- **Poly Pizza has no free public API key** — `GET https://api.poly.pizza/v1.1/search/<q>` returns
  `401 {"error":"You need an API key to do that dingus"}`. Workaround used instead: the site is
  server-rendered and every search/model page embeds a `window.__SERVER_APP_STATE__ = {…}` JSON
  blob. Brace-match it out of `https://poly.pizza/search/<query>` for `{publicID, title, creator,
  licence}`, then fetch `https://poly.pizza/m/<publicID>` for `{Tris, Type, Animated, Licence}` plus
  the direct, auth-free CDN URL `https://static.poly.pizza/<uuid>.glb`. Scraper kept in the session
  scratchpad (`pp.mjs` / `ppinfo.mjs`).
- **Quaternius pack pages link a Google Drive folder.** Fetch
  `https://drive.google.com/drive/folders/<id>`, un-escape `\xNN`, and regex
  `["<fileId>",["<parentId>"],"<name>"` to enumerate; download each with
  `https://drive.usercontent.google.com/download?id=<fileId>&export=download&confirm=t`.
- **Poly Pizza's `Animated` metadata flag is unreliable.** `Triceratops` and `Stegosaurus` are both
  reported `anim=false` by the site but ship a 29-joint skin and 6 clips each. Always inspect the GLB.

## Sweep A downloads

`Fit` = how close the silhouette is to the HZD machine per `docs/research/roster-v2.md` §3–4.
Sizes are exact bytes. "static" = no skin, needs `autorig.js` + `GaitController`.

### Grazer — deer/antelope with saw-blade tail canisters

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `grazer/Deer_Quaternius.gltf` | [Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html) → Drive `1uJ3N5HfB7jKTseJUNQr3N4YaN0UuEtHk`/glTF | Quaternius | CC0 1.0 | 3,288,813 | 1 skin `AnimalArmature`, **46 joints** (incl. IK pole targets `IKFrontLeg.L/R`, `IKBackLeg.L/R`, `PoleTarget*`) | **13**: `Attack_Headbutt, Attack_Kick, Death, Eating, Gallop, Gallop_Jump, Idle, Idle_2, Idle_Headlow, Idle_HitReact1, Idle_HitReact2, Jump_toIdle, Walk` | 2,098 | **PRIMARY** |
| `grazer/Gazelle_PolyGoogle.glb` | [poly.pizza/m/bPYIQ_XQbrj](https://poly.pizza/m/bPYIQ_XQbrj) | Poly by Google | CC-BY 3.0 | 57,104 | static | — | 810 | alt silhouette (springier legs); authored ~cm scale, bbox 36.5×138.7×130.8 |

`Eating` + `Idle_Headlow` are literally the grass-cutting graze loop the roster calls for;
`Gallop_Jump` is the springy flee bound. Antlers are part of the single body mesh — rotor blades go
on as shell parts, not mesh edits.

### Broadhead — longhorn bull

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `broadhead/Bull_Quaternius.gltf` | Ultimate Animated Animal Pack → Drive `1uJ3N5HfB7jKTseJUNQr3N4YaN0UuEtHk`/glTF | Quaternius | CC0 1.0 | 3,110,158 | 1 skin, **42 joints** | **13** (same set as Deer) | 2,418 | **PRIMARY — exact animal** |

`Attack_Headbutt` is the Horn Charge telegraph; `Attack_Kick` covers the Hind Leg Strike.

### Lancehorn — ibex/antelope with drill horns

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `lancehorn/Stag_Quaternius.gltf` | Ultimate Animated Animal Pack → Drive `1uJ3N5HfB7jKTseJUNQr3N4YaN0UuEtHk`/glTF | Quaternius | CC0 1.0 | 3,224,724 | 1 skin, **38 joints** | **13** (same set) | 3,670 | **PRIMARY — antlers are a SEPARATE, UNSKINNED NODE.** Verified: node `Stag_Horns` → mesh `Cube.001` (1,616 tris), parented directly to the `Head` joint (the body is node `Stag` → mesh `Cube`, 2,054 tris, skinned). Hide `Stag_Horns` and socket drill horns on `Head` — zero body edits, and the horn node is already the socket |
| `lancehorn/Ibex_Syl.glb` | [poly.pizza/m/a6kS-lGDqV4](https://poly.pizza/m/a6kS-lGDqV4) | Syl | CC-BY 3.0 | 151,132 | static, **13 separate meshes** (part-split) | — | 1,520 | exact ibex silhouette; use as the ribbed-horn geometry donor for the swap above |

### Charger — ram

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `charger/Sheep_Quaternius_animated.glb` | [poly.pizza/m/rgJXF570ZK](https://poly.pizza/m/rgJXF570ZK) | Quaternius | CC0 1.0 | 223,324 | 1 skin, **16 joints** | **8**: `Death, Headbutt, Idle, Idle_Eating, Jump_Loop, Jump_Start, Run, Walk` (names are triple-prefixed `AnimalArmature\|AnimalArmature\|AnimalArmature\|…` — strip on load) | 2,528 | **PRIMARY for the ram attack, but CLIP DONOR ONLY for the body — audit correction.** Its 16 joints are byte-for-byte the same coarse skeleton as the `Cat` and `Wolf` rows (`All, Root, Body, Head, Tail, FrontLeg.L/R, BackLeg.L/R` + `_end` tips): **one bone per leg, no elbow or knee**, so there is no articulated charge wind-up. `Headbutt` is the right clip; retarget it onto the 46-joint `Alpaca` below rather than skinning to this rig |
| `charger/Alpaca_Quaternius.gltf` | Ultimate Animated Animal Pack → Drive | Quaternius | CC0 1.0 | 1,435,679 | 1 skin, **46 joints** | **13** (same set as Deer) | 2,060 | richer-rig alt if 16 joints is too coarse |
| `charger/BighornSheep_PolyGoogle.glb` | [poly.pizza/m/4kUChlMv8Vp](https://poly.pizza/m/4kUChlMv8Vp) | Poly by Google | CC-BY 3.0 | 1,090,028 | static | — | 936 | curled-horn silhouette donor |
| `charger/Ram_PolyGoogle.glb` | [poly.pizza/m/fm86jjk4m7D](https://poly.pizza/m/fm86jjk4m7D) | Poly by Google | CC-BY 3.0 | 66,556 | static; authored ~cm scale (bbox 38.7×117.5×119.2) | — | 938 | second horn donor |

### Trampler — bison/rhino with fire vents

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `trampler/Triceratops_Quaternius.glb` | [poly.pizza/m/IGvrUqGrRM](https://poly.pizza/m/IGvrUqGrRM) | Quaternius | CC0 1.0 | 309,684 | 1 skin, **29 joints** | **6**: `Triceratops_Attack, _Death, _Idle, _Jump, _Run, _Walk` | 1,332 | **PRIMARY** — low, wide, horned charger; site metadata wrongly says `anim=false` |
| `trampler/Cow_Quaternius.gltf` | Ultimate Animated Animal Pack → Drive | Quaternius | CC0 1.0 | 3,114,187 | 1 skin, **42 joints** | **13** (same set) | 2,450 | bulk-quadruped alt with the full 13-clip set |
| `trampler/Bison_PolyGoogle.glb` | [poly.pizza/m/9sTrha-TxdS](https://poly.pizza/m/9sTrha-TxdS) | Poly by Google | CC-BY 3.0 | 1,484,940 | static | — | 1,492 | best shoulder-hump silhouette — the hump is where the fire vents go |
| `trampler/Rhinoceros_PolyGoogle.glb` | [poly.pizza/m/7XutktqrTj_](https://poly.pizza/m/7XutktqrTj_) | Poly by Google | CC-BY 3.0 | 1,029,416 | static | — | 778 | rhino-bulk alt |
| `trampler/Stegoknight_HoaiNguyen.glb` | [poly.pizza/m/2Nvj7py0bvX](https://poly.pizza/m/2Nvj7py0bvX) | Hoai Nguyen | CC-BY 3.0 | 2,029,672 | static, **81 separate meshes** | — | 25,656 | already-mechanical armoured quadruped — mine it for dorsal plates and vent geometry (same author as the staged `Velocirobot.glb`) |

### Shell-Walker — hermit crab hexapod carrying a cargo crate

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `shell-walker/Spider_Quaternius.glb` | [poly.pizza/m/yRYJiAJyiM](https://poly.pizza/m/yRYJiAJyiM) | Quaternius | CC0 1.0 | 449,008 | 1 skin, **39 joints** (8 legs) | **5**: `Spider_Attack, _Death, _Idle, _Jump, _Walk` | 2,712 | **PRIMARY leg chassis** — hide 2 leg chains → hexapod crab walk, already animated. Verified chains: `FrontLeg`, `MidFrontLeg`, `MidBackLeg`, `BackLeg` (×`.L/.R`), 3 segments each. NOTE: the two sweeps disagree on WHICH pair to hide — sweep A says the front pair, sweep B says the rearmost. Pick one before the retarget map is written |
| `shell-walker/CrabEnemy_Quaternius.glb` | [poly.pizza/m/Gs3yfsV5lB](https://poly.pizza/m/Gs3yfsV5lB) | Quaternius | CC0 1.0 | 219,448 | 1 skin, **7 joints** | **10**: `Bite_Front, Bite_InPlace, Dance, Death, HitRecieve, Idle, Jump, No, Walk, Yes` | 3,624 | carapace + claw geometry donor (rig too coarse to walk on its own) |
| `shell-walker/ScifiCrate_Quaternius.glb` | [poly.pizza/m/bPeXlVjwCH](https://poly.pizza/m/bPeXlVjwCH) | Quaternius | CC0 1.0 | 138,692 | static | — | 2,688 | the **Cargo** component — detachable part slung under the platform |
| `shell-walker/RobotEnemyLegsGun_Quaternius.glb` | [poly.pizza/m/lFZfDh2hzP](https://poly.pizza/m/lFZfDh2hzP) | Quaternius | CC0 1.0 | 324,096 | 2 skins, 15 joints each | **7**: `Attack, Death, Idle, Jump, Run, Shoot, Walk` | 4,702 | lightning-gun arm geometry **and** a ready `Shoot` clip to retarget onto the claw arm |

### Snapmaw — crocodile

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `snapmaw/BlackCaiman_PolyGoogle.glb` | [poly.pizza/m/5etIv4omd7Z](https://poly.pizza/m/5etIv4omd7Z) | Poly by Google | CC-BY 3.0 | 1,740,348 | static | — | 2,116 | **PRIMARY** — true sprawling croc silhouette, long tail, 1 texture |
| `snapmaw/Crocodile_PolyGoogle.glb` | [poly.pizza/m/2an6E2WjW3z](https://poly.pizza/m/2an6E2WjW3z) | Poly by Google | CC-BY 3.0 | 38,404 | static; authored ~cm scale (bbox 69.9×36.6×252.9) | — | 536 | distance-LOD / basking-pair filler |

No rigged crocodile exists on any of the four swept sources — Snapmaw goes through `autorig.js`
(sprawling stance: hips wider than shoulders, elbow/knee out, per roster §4 "crocodile sprawl-walk").

### Ravager — big cat with a dorsal cannon

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `ravager/Jaguar_PolyGoogle.glb` | [poly.pizza/m/4fb-oMr2uUF](https://poly.pizza/m/4fb-oMr2uUF) | Poly by Google | CC-BY 3.0 | 1,408,080 | static | — | 1,020 | **PRIMARY** — broad-backed big cat; flat dorsal line is the cannon mount |
| `ravager/ArmoredAllosaurus_HoaiNguyen.glb` | [poly.pizza/m/5870A3Nrz8t](https://poly.pizza/m/5870A3Nrz8t) | Hoai Nguyen | CC-BY 3.0 | 2,436,592 | static, **208 separate meshes** | — | 26,236 | mech-plate and dorsal-hardware donor; every plate is its own mesh so pieces lift out cleanly |

### Stalker — panther, cloaking

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `stalker/Cougar_PolyGoogle.glb` | [poly.pizza/m/8nuCN-gn2s-](https://poly.pizza/m/8nuCN-gn2s-) | Poly by Google | CC-BY 3.0 | 1,644,688 | static | — | 980 | **PRIMARY** — a cougar *is* a panther; lean prowling silhouette |
| `stalker/SnowLeopard_PolyGoogle.glb` | [poly.pizza/m/26tTvxyxkPC](https://poly.pizza/m/26tTvxyxkPC) | Poly by Google | CC-BY 3.0 | 1,801,740 | static | — | 988 | leaner/longer-tailed alt |
| `stalker/Wolf_Quaternius_UAA.gltf` | Ultimate Animated Animal Pack → Drive | Quaternius | CC0 1.0 | 3,175,890 | 1 skin, **51 joints** | **12**: `Attack, Death, Eating, Gallop, Gallop_Jump, Idle, Idle_2, Idle_2_HeadLow, Idle_HitReact1, Idle_HitReact2, Jump_ToIdle, Walk` | 1,962 | rigged **stalking-gait donor** — canine not feline, but it is the only rigged predator quadruped found; retarget its `Walk`/`Gallop` onto the autorigged cougar |
| `stalker/Wolf_Quaternius_animated.glb` | [poly.pizza/m/XU7oNeKShV](https://poly.pizza/m/XU7oNeKShV) | Quaternius | CC0 1.0 | 253,068 | 1 skin, **16 joints** | **8**: `Death, Headbutt, Idle, Idle_Eating, Jump_Loop, Jump_Start, Run, Walk` | 2,740 | compact 253 KB alt of the same animal — but **the same coarse 16-joint, one-bone-per-leg skeleton as `Sheep` and `Cat`**, so it is a clip donor, not a gait rig. The 51-joint `Wolf_Quaternius_UAA.gltf` above is the articulated one |

### Bellowback — giant frog/turtle with a cargo sac

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `bellowback/Frog_Quaternius.glb` | [poly.pizza/m/37wofOCOzG](https://poly.pizza/m/37wofOCOzG) | Quaternius | CC0 1.0 | 379,892 | 1 skin, **43 joints** | **14**: `Death, Duck, HitReact, Idle, Jump, Jump_Idle, Jump_Land, No, Punch, Run, Walk, Wave, Weapon, Yes` (prefixed `CharacterArmature\|`) | 5,016 | **NOT A BELLOWBACK PRIMARY — audit correction.** Its 43 joints are a HUMANOID BIPED: `Shoulder/UpperArm/LowerArm` + fully articulated five-fingered hands (`Pinky1-3`, `Middle1-3`, `Index1-3`, `Thumb1-2`, per side) over `UpperLeg/LowerLeg/Foot`. This is the same `CharacterArmature` humanoid rig as the already-staged `quaternius-ultimatemonsters/Big/Dino.gltf` and `Big/Birb.gltf` (43 joints, identical 14-clip set) — a cartoon frog CHARACTER, not a quadrupedal frog. `Jump` is a biped hop, not a frog lurch. Use `expansion-b/bellowback/Parasaurolophus_Quaternius.glb` (mass) or `Frog_Quaternius_easyenemies.glb` (anatomy) as the Bellowback body; keep this file as a humanoid-character donor |
| `bellowback/Turtle_PolyGoogle.glb` | [poly.pizza/m/2LCcq8vhqJ3](https://poly.pizza/m/2LCcq8vhqJ3) | Poly by Google | CC-BY 3.0 | 115,884 | static, 6 materials | — | 4,026 | domed-shell donor → the dorsal cargo sac |

### Rockbreaker — burrowing mole/tunneller (hardest silhouette; expect kitbash)

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `rockbreaker/Stegosaurus_Quaternius.glb` | [poly.pizza/m/eFcNbOlpvl](https://poly.pizza/m/eFcNbOlpvl) | Quaternius | CC0 1.0 | 423,036 | 1 skin, **29 joints** | **6**: `Stegosaurus_Attack, _Death, _Idle, _Jump, _Run, _Walk` | 2,282 | best rigged **body** base — low, heavy, wide-hipped; site metadata wrongly says `anim=false` |
| `rockbreaker/GroundSloth_PolyGoogle.glb` | [poly.pizza/m/34WS63awSqJ](https://poly.pizza/m/34WS63awSqJ) | Poly by Google | CC-BY 3.0 | 1,831,568 | static | — | 990 | **digging-claw forelimbs** — the one real source of oversized excavation claws found |
| `rockbreaker/ArmoredBrachio_HoaiNguyen.glb` | [poly.pizza/m/7g8aknS_nmx](https://poly.pizza/m/7g8aknS_nmx) | Hoai Nguyen | CC-BY 3.0 | 2,298,112 | static, **60 separate meshes** | — | 26,238 | mech-bulk / heavy-plate donor |
| `rockbreaker/Armadillo_PolyGoogle.glb` | [poly.pizza/m/37B4Oz7HDqC](https://poly.pizza/m/37B4Oz7HDqC) | Poly by Google | CC-BY 3.0 | 45,984 | static; authored ~cm scale (bbox 31.1×42.0×121.8) | — | 672 | banded armour-shell reference for the burrow carapace |
| `rockbreaker/Worm_Quaternius.glb` | [poly.pizza/m/KiNAaBa4cK](https://poly.pizza/m/KiNAaBa4cK) | Quaternius | CC0 1.0 | 16,628 | static | — | 240 | segmented-body donor for the surfacing/tunnel VFX proxy |

### Stormbird — giant eagle (hardest flyer; expect kitbash)

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `stormbird/HawkLpRigged_Sherkiz.glb` | [poly.pizza/m/RkN6MEbP6g](https://poly.pizza/m/RkN6MEbP6g) | Sherkiz | CC-BY 3.0 | 866,000 | 1 skin, **58 joints** (`metarig` — per-feather wing chains) | **1**: `metarig\|Fly` | 9,956 | **PRIMARY — the only rigged raptor flyer on any swept source.** One clip only: soar/dive/hover must be procedural on top of `Fly` |
| `stormbird/Eagle_RobertMirabelle.glb` | [poly.pizza/m/1Z5L1v0bfu7](https://poly.pizza/m/1Z5L1v0bfu7) | Robert Mirabelle | CC-BY 3.0 | 502,708 | static, authored in a **spread-wing pose** (bbox 260.1×32.2×122.0 → wingspan is the X axis) | — | 7,108 | best wing-plate geometry; the spread pose is exactly the "six feather-jet engines, 3/wing" mounting reference |
| `stormbird/GoldenEagle_PolyGoogle.glb` | [poly.pizza/m/2YF1DGWp4vx](https://poly.pizza/m/2YF1DGWp4vx) | Poly by Google | CC-BY 3.0 | 1,569,804 | static | — | 1,568 | cheap distance-LOD flyer |

### Shared donors (not species-specific)

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Use |
|---|---|---|---|---|---|---|---|---|
| `_quaternius-animals/Horse.gltf` | Ultimate Animated Animal Pack → Drive | Quaternius | CC0 1.0 | 3,610,082 | 1 skin, **50 joints** | **13** (same set as Deer) | 2,182 | **Strider upgrade** — a true rigged horse with real gaits, replacing the staged static `MechanicalHorse.glb` |
| `_quaternius-animals/Donkey.gltf` | Ultimate Animated Animal Pack → Drive | Quaternius | CC0 1.0 | 3,564,269 | 1 skin, **50 joints** | **13** (same set) | 2,000 | Strider/Charger herd-variety filler |
| `_quaternius-animals/License.txt` | same pack | Quaternius | CC0 1.0 | 216 | — | — | — | verbatim pack licence (CC0 1.0 Universal) |
| `_tools/inspect.mjs` | this sweep | — | — | — | — | — | — | clip/tri/bbox inspector used for every row above |

## Notes the caster needs

- **Six Quaternius quadrupeds share one rig and one 13-clip vocabulary** (Deer, Bull, Stag, Cow,
  Alpaca, Horse, Donkey; Wolf is the same minus one clip). Bone names are identical
  (`Body/Back/Torso/Torso2/Torso3/Neck1-3/Head/FrontShoulder.L|R/FrontUpperLeg/FrontLowerLeg/
  BackShoulder/BackLeg/BackUpperLeg/BackLowerLeg/Tail1-3` + IK targets). **One retarget map covers
  Grazer, Broadhead, Lancehorn, Trampler, Charger, Strider and Stalker** — that is the single
  highest-leverage fact in this sweep.
- These `.gltf` files carry **0 textures and 5–8 materials** (flat vertex-ish palette materials), so
  the HZD chassis style pass is a straight material swap with no texture authoring.
- Positions in the Poly Pizza `.glb` re-exports are **quantized** — the accessor min/max reads as
  ~0.01–0.06 and the real scale lives on the node transform, so bbox numbers for those rows are not
  world units. Poly-by-Google `.glb`s are the opposite problem: authored in cm (bbox in the tens or
  hundreds). Normalize at load; `autorig.js` measures the live world-space bounds anyway.
- Two Quaternius clip-name shapes need stripping on load: `CharacterArmature|X` / `MonsterArmature|X`
  / `SpiderArmature|X` / `Armature|Species_X`, and the triple-prefixed
  `AnimalArmature|AnimalArmature|AnimalArmature|X` on the poly.pizza Sheep and Wolf.

## Sources swept with no usable result

- **Sketchfab** — skipped by instruction (needs an API token; no auth-free CC0 download path).
- **Kenney (kenney.nl)** — swept. `animal-pack` (CC0) is **2D PNG sprites only**, no 3D meshes;
  `animal-pack-redux` returns 404. Kenney's 3D catalogue is props/kits/vehicles/humanoids — **no
  creature or animal meshes at all**, so nothing fits any target silhouette. Its CC0 space/sci-fi
  kits remain a possible plate-greeble donor but `rig/shells.js` already generates plates
  procedurally, so nothing was downloaded.
- **KayKit (github.com/KayKit-Game-Assets, 10 public repos)** — swept. Packs are humanoid characters
  (Adventurers, Skeletons) plus dungeon/city/furniture/restaurant/space-base props. **No animals, no
  creatures, no mechs.** Nothing fits.
- **poly.pizza "mole"** — 2 results, both irrelevant (a squirrel and a mis-tagged cow). No mole or
  burrower exists on any swept source; Rockbreaker is a kitbash by necessity.
- **Quaternius "Ultimate Animated Dinosaurs" pack** — the pack ships FBX/OBJ/Blend only, **no glTF**,
  so its Drive folder is unusable here. The individual dinosaurs were taken instead as Poly Pizza's
  auto-converted CC0 GLBs (Triceratops, Stegosaurus above), which do carry the rig and clips.

## ATTRIBUTIONS — sweep A (append to credits screen)

Required (CC-BY 3.0), all via Poly Pizza:

```
Gazelle, Bighorn Sheep, Ram, Bison, Rhinoceros, Black Caiman, Crocodile, Jaguar, Cougar,
Snow Leopard, Turtle, Ground Sloth, Armadillo and Golden Eagle by Poly by Google [CC-BY 3.0]
  via Poly Pizza — https://poly.pizza/m/bPYIQ_XQbrj , /4kUChlMv8Vp , /fm86jjk4m7D , /9sTrha-TxdS ,
  /7XutktqrTj_ , /5etIv4omd7Z , /2an6E2WjW3z , /4fb-oMr2uUF , /8nuCN-gn2s- , /26tTvxyxkPC ,
  /2LCcq8vhqJ3 , /34WS63awSqJ , /37B4Oz7HDqC , /2YF1DGWp4vx
ibex by Syl [CC-BY 3.0] via Poly Pizza (https://poly.pizza/m/a6kS-lGDqV4)
Stegoknight, Armored Allosaurus and Armored Brachio by Hoai Nguyen [CC-BY 3.0] via Poly Pizza
  (https://poly.pizza/m/2Nvj7py0bvX , /5870A3Nrz8t , /7g8aknS_nmx)
Hawk Lp Rigged by Sherkiz [CC-BY 3.0] via Poly Pizza (https://poly.pizza/m/RkN6MEbP6g)
Eagle by Robert Mirabelle [CC-BY 3.0] via Poly Pizza (https://poly.pizza/m/1Z5L1v0bfu7)
```

Optional courtesy credits (CC0 1.0, no attribution required):

```
"Ultimate Animated Animal Pack" by Quaternius (CC0 1.0) — https://quaternius.com
Sheep, Wolf, Spider, Crab Enemy, Frog, Worm, Triceratops, Stegosaurus, Scifi Crate and
  Robot Enemy Legs Gun by Quaternius (CC0 1.0) via Poly Pizza
```

---

# Round 4 expansion (sweep A) — addendum pass

Downloaded 2026-09-10 into the same `models-staging/expansion-a/<species>/` tree. **17 new files,
8,763,000 bytes (8.4 MB)**; `expansion-a/` now holds **57 files (55 models + `License.txt` + `_tools/inspect.mjs`) / 58.2 MB** — still far under the
≤40 MB/model, ≤200 MB/agent budget. Same sources (**Poly Pizza, Quaternius, Kenney, KayKit**), same
verification: every file starts with the `glTF` magic, structure via `node tools/dump-structure.mjs`,
joints/clips/tris/bbox via `node models-staging/expansion-a/_tools/inspect.mjs`.

Why a second pass — four gaps the first pass left:

1. **Redeye Watcher had no candidate at all** (it is on the target list; the first pass shipped no
   `redeye-watcher/` folder).
2. **No weapon/component donors.** Roster §4 makes the Ravager's dorsal cannon, the Shell-Walker's
   lightning-gun claw and the Rockbreaker's drill *detachable components with their own HP* — they
   need real geometry, not just plates.
3. **Rockbreaker had no digging head.** `GroundSloth` gave claws; nothing gave a burrower snout.
4. **Stormbird had one rigged donor with one clip** and no mechanical winged donor.

**Correction to the first pass's "Kenney / KayKit — nothing fits" note.** That is true for
*creatures* and is re-verified here (kenney.nl's 3D catalogue is 17 kits — blaster/car/city/factory/
dungeon/space/pirate/platformer/cave/forest/graveyard/town/cube-pets — with no animal or mech
meshes; KayKit's GitHub org is 10 repos: Adventurers, Skeletons, Dungeon, City Builder, Furniture,
Halloween, Hexagon, Prototype, Restaurant, Space Base — characters and props only). But both authors'
CC0 props are **mirrored on Poly Pizza with direct auth-free `static.poly.pizza` GLB links**, and
their turret/drill props are exactly the component donors this roster needs. Three are taken below.

## Addendum downloads

### Redeye Watcher — Watcher variant (adds Energy Blast 0–55m; roster §4)

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `redeye-watcher/Velociraptor_Quaternius.glb` | [poly.pizza/m/cnlGH2UcDd](https://poly.pizza/m/cnlGH2UcDd) | Quaternius | CC0 1.0 | 285,828 | 1 skin, **29 joints** (`root/Body/FrontLeg.L\|R→FrontUpLeg→FrontLowLeg→FrontFoot`, `BackLeg→BackUpLeg→BackLowLeg`, `Back/Tail1-5`, `Hips/Torso/Shoulders/Neck/Head`) | **6**: `Armature\|Velociraptor_Attack, _Death, _Idle, _Jump, _Run, _Walk` | 1,248 | **PRIMARY — and the best Watcher body found anywhere in this sweep.** Roster §3 asks for "small theropod, digitigrade biped, big head, long neck+tail"; this is literally that, rigged, with a 5-bone tail for the Tail Strike spin. Site metadata says `anim=false` — wrong again |
| `redeye-watcher/RobotEnemy_Quaternius.glb` | [poly.pizza/m/1gNo5ezvmr](https://poly.pizza/m/1gNo5ezvmr) | Quaternius | CC0 1.0 | 563,656 | 1 skin, **15 joints** — includes bones literally named **`Eye`** and **`Gun`**, plus IK `Foot.L/R` + pole targets `PT.L/R` | **7**: `CharacterArmature\|Attack, \|Death, \|Idle, \|Jump, \|Run, \|Shoot, \|Walk` | 4,380 | **PRIMARY ALT — the mechanical read.** An `Eye` bone to drive the state-colour emissive and a `Gun` bone + `Shoot` clip for the Redeye's Energy Blast, with no rig authoring at all |
| `redeye-watcher/AnimatedRobot_Quaternius.glb` | [poly.pizza/m/QCm7qe9uNJ](https://poly.pizza/m/QCm7qe9uNJ) | Quaternius | CC0 1.0 | 401,024 | 2 skins, **43 joints** | **14**: `RobotArmature\|Robot_Dance, _Death, _Idle, _Jump, _No, _Punch, _Running, _Sitting, _Standing, _ThumbsUp, _Walking, _WalkJump, _Wave, _Yes` | 3,237 | 14 separate part meshes (`Head, Torso, Shoulder.L/R, Arm.L/R, Foot.L/R…`) → a **component/detach-physics test rig**: every limb already lifts out as its own mesh |
| `redeye-watcher/SecurityCamera_JToastie.glb` | [poly.pizza/m/a6J7IDufQP](https://poly.pizza/m/a6J7IDufQP) | J-Toastie | CC-BY 3.0 | 43,580 | static, 4 materials | — | 568 | Guerrilla's own one-line brief for the Watcher is "**a security camera on legs**" — this is the camera. Graft onto the `Head` bone of either primary; its 4 materials are `DarkGray`, `Cream`, `Black`, `LightGray` on ONE mesh (`NurbsPath-Mesh`) — a colour split, not a named lens/housing/mount split. Isolating the lens for the red emissive means picking the right colour group by eye first; it is not self-labelling |

### Ravager — dorsal cannon component (roster §4: Cannon is Tear-detachable and player-usable)

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `ravager/TurretCannon_Quaternius.glb` | [poly.pizza/m/mNJ6poH7Cp](https://poly.pizza/m/mNJ6poH7Cp) | Quaternius | CC0 1.0 | 74,416 | static — **2 meshes, `Turret_Cannon_Base` + `Turret_Cannon_Top`** | — | 1,318 | **PRIMARY cannon.** The base/top split *is* the swivel: parent Base to the spine, yaw Top toward the target for the "muzzle spin-up" telegraph, detach both as one part on Tear |
| `ravager/Turret_Kenney.glb` | [poly.pizza/m/mXKbcMPLSS](https://poly.pizza/m/mXKbcMPLSS) | Kenney | CC0 1.0 | 42,352 | static, 4 meshes (`turret_single`, `turret`, 2 `Group`) | — | 576 | 576-tri alt for LOD/herd-scale Ravagers |

### Shell-Walker — lightning-gun claw

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `shell-walker/DoubleTurret_Kenney.glb` | [poly.pizza/m/wMb4gh6STL](https://poly.pizza/m/wMb4gh6STL) | Kenney | CC0 1.0 | 52,040 | static, 2 meshes (`turret_double`, `turret`) | — | 876 | Twin barrels → the Homing Shock Blast / Shock Volley ×3 emitter on the right arm; the `turret` base doubles as the left-arm shield projector housing |

### Rockbreaker — digging head + drill

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `rockbreaker/Aardvark_PolyGoogle.glb` | [poly.pizza/m/f_O3IZGPYvs](https://poly.pizza/m/f_O3IZGPYvs) | Poly by Google | CC-BY 3.0 | 48,284 | static; authored ~cm scale (bbox 41.7×76.0×158.4) | — | 728 | **the burrower snout the first pass could not find** — aardvark = tapered digging head + forward-set digging forelimbs |
| `rockbreaker/Gopher_PolyGoogle.glb` | [poly.pizza/m/1fi2x6XlYjB](https://poly.pizza/m/1fi2x6XlYjB) | Poly by Google | CC-BY 3.0 | 1,971,532 | static (bbox 1.73×1.81×6.61) | — | 948 | true burrower body proportions — short limbs, cylindrical torso, head-as-wedge; the 1.9 MB is one texture, not geometry |
| `rockbreaker/Drill_KayKit.glb` | [poly.pizza/m/8uBbH7Dvmb](https://poly.pizza/m/8uBbH7Dvmb) | Kay Lousberg (KayKit) | CC0 1.0 | 97,776 | static — **2 meshes, `drill_structure` + `drill_module`** | — | 1,198 | **the drill.** `drill_module` is the spinning bit (spin on local Z for the tunnelling loop), `drill_structure` the housing. Also the **Lancehorn** drill-horn donor — scale to ~0.3 and mirror onto the two antler sockets. Distinct file from `expansion-b/lancehorn/Drill.glb` (different md5) |

### Stormbird — mechanical winged donor + flight clips

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `stormbird/Pterablocktyls_HoaiNguyen.glb` | [poly.pizza/m/1tuiNTr4-MX](https://poly.pizza/m/1tuiNTr4-MX) | Hoai Nguyen | CC-BY 3.0 | 3,919,884 | static, **56 separate meshes**, 8 materials, bbox 4.79×6.08×8.44 | — | **44,871** | **the only already-mechanical winged donor on any swept source** — same author/style family as the staged `Velocirobot.glb`, `Stegoknight`, `ArmoredAllosaurus`. Mine the wing spars and fuselage plates for the six feather-jet engines. **Caveat: 44.9k tris and generic `mesh<digits>` names** — pick parts by bounding box, not by name, and budget a decimate pass before anything ships in-scene |
| `stormbird/Bat_Quaternius.glb` | [poly.pizza/m/hNO9XvjlKa](https://poly.pizza/m/hNO9XvjlKa) | Quaternius | CC0 1.0 | 231,476 | 1 skin, **23 joints** — `Shoulder.L/R → Wing1→Wing2→Wing3→Wing4` (a real 4-segment wing chain per side) | **5**: `BatArmature\|Bat_Attack, _Attack2, _Death, _Flying, _Hit` | 1,046 | **fixes the first pass's one-clip flyer problem.** `HawkLpRigged` has only `Fly`; this adds Attack/Attack2/Death/Hit on a 4-bone wing chain that maps onto the hawk's per-feather chains — retarget for the Thunder Clash dive and the grounded melee |

### Snapmaw — third silhouette

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `snapmaw/Alligator_PolyGoogle.glb` | [poly.pizza/m/dtH7YQkl5qm](https://poly.pizza/m/dtH7YQkl5qm) | Poly by Google | CC-BY 3.0 | 43,604 | static; ~cm scale (bbox 54.2×31.8×163.4) | — | 622 | broad-snout alligator read (the caiman is narrow-snouted); 622 tris makes it the basking-pair / LOD body |

### Shared donors — `_donors/`

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Use |
|---|---|---|---|---|---|---|---|---|
| `_donors/TRex_Quaternius.glb` | [poly.pizza/m/UYtneO5FpF](https://poly.pizza/m/UYtneO5FpF) | Quaternius | CC0 1.0 | 336,568 | 1 skin, **29 joints** (same skeleton as the Velociraptor) | **6**: `Armature\|TRex_Attack, _Death, _Idle, _Jump, _Run, _Walk` | 1,820 | **Thunderjaw upgrade** — a rigged T-rex with real clips, replacing the `Big/Dino.gltf` stand-in. Shares the Velociraptor skeleton, so **one retarget map covers Watcher, Redeye Watcher and Thunderjaw** |
| `_donors/Apatosaurus_Quaternius.glb` | [poly.pizza/m/fvo0x8Zk3z](https://poly.pizza/m/fvo0x8Zk3z) | Quaternius | CC0 1.0 | 380,776 | 1 skin, **29 joints** | **6**: `Armature\|Apatosaurus_Attack, _Idle, _Jump, _Run, _Walk` + one mis-named `Armature\|Stegosaurus_Death` (pack export bug — match on suffix, not full name) | 1,438 | **Tallneck** (roster §3: giraffe body plan, ~25–30m, docile fixed loop) — the only long-neck quadruped with a rig found on any swept source |
| `_donors/Snake_Quaternius.glb` | [poly.pizza/m/x9x0viZs8V](https://poly.pizza/m/x9x0viZs8V) | Quaternius | CC0 1.0 | 216,696 | 1 skin, **15 joints** (serpentine chain) | **4**: `SnakeArmature\|Snake_Attack, _Idle, _Jump, _Walk` | 1,618 | Rockbreaker **surfacing/tunnelling proxy** — a rigged serpentine chain gives the underground bulge-and-breach motion the static `Worm_Quaternius.glb` cannot |
| `_donors/Scorpion_PolyGoogle.glb` | [poly.pizza/m/6Bu7d_Pkm5o](https://poly.pizza/m/6Bu7d_Pkm5o) | Poly by Google | CC-BY 3.0 | 53,508 | static; ~cm scale (bbox 70.1×37.9×115.7) | — | 724 | **Corruptor** (roster §4: scorpion — quadruped hub + prehensile tail); not on the sweep's target list but it is the one roster machine with no candidate anywhere, and this is the only scorpion under a usable licence |

## Notes the caster needs (addendum)

- **A second shared skeleton exists.** The Quaternius "Ultimate Animated Dinosaurs" models that Poly
  Pizza auto-converted — Velociraptor, T-Rex, Triceratops, Stegosaurus, Apatosaurus — all carry a
  **29-joint skeleton with the same 6-clip vocabulary** (`Attack/Death/Idle/Jump/Run/Walk`). Together
  with the 46–51-joint `AnimalArmature` family from the first pass, **two retarget maps now cover
  every land machine in the roster**: `AnimalArmature` → Grazer/Broadhead/Lancehorn/Charger/Trampler/
  Strider/Stalker, and this dino rig → Watcher/Redeye Watcher/Thunderjaw/Tallneck/Rockbreaker body.
- **Poly Pizza's `Animated` flag is wrong again** — Velociraptor, T-Rex and Apatosaurus all report
  `anim=false` and all ship a 29-joint skin with 6 clips. Never trust it; always inspect the GLB.
- **The Quaternius animal pack is now fully enumerated** (Drive `1yJXdB1iSrI8Db7hG77zxZ66vKsqIt0ry`):
  Alpaca, Bull, Cow, Deer, Donkey, Fox, Horse, Horse_White, Husky, ShibaInu, Stag, Wolf — 12 files,
  8 already taken. The 4 left (Fox, Horse_White, Husky, ShibaInu) are Scrapper/Strider colour-variety
  fillers only. **There is no crocodile, no big cat and no bird in the pack**, which is why Snapmaw,
  Ravager and Stalker still route through `autorig.js` + a retarget rather than a native rig.
- **Component geometry now exists for every Tear-detachable part the roster names** except the
  Thunderjaw's disc launchers: cannon (`TurretCannon`), lightning gun (`DoubleTurret`), cargo crate
  (`ScifiCrate`, first pass), drill (`Drill_KayKit`), radar/eye (`SecurityCamera`).
- Poly-by-Google re-exports here are again authored **in centimetres** (Aardvark, Alligator, Scorpion
  bboxes in the tens–hundreds); Quaternius re-exports are again **quantized** (bbox reads 0.01–0.50
  with the real scale on the node transform). Normalize at load.

## ATTRIBUTIONS — addendum (append to credits screen)

Required (CC-BY 3.0), all via Poly Pizza:

```
Pterablocktyls by Hoai Nguyen [CC-BY 3.0] via Poly Pizza (https://poly.pizza/m/1tuiNTr4-MX)
Security Camera by J-Toastie [CC-BY 3.0] via Poly Pizza (https://poly.pizza/m/a6J7IDufQP)
Aardvark, Gopher, Alligator and Scorpion by Poly by Google [CC-BY 3.0] via Poly Pizza
  (https://poly.pizza/m/f_O3IZGPYvs , /1fi2x6XlYjB , /dtH7YQkl5qm , /6Bu7d_Pkm5o)
```

Optional courtesy credits (CC0 1.0, no attribution required):

```
Velociraptor, T-Rex, Apatosaurus, Robot Enemy, Animated Robot, Bat, Snake and Turret Cannon
  by Quaternius (CC0 1.0) via Poly Pizza — https://quaternius.com
Turret and Double Turret by Kenney (CC0 1.0) via Poly Pizza — https://kenney.nl
Drill by Kay Lousberg / KayKit (CC0 1.0) via Poly Pizza — https://kaylousberg.com
```

# Round 4 expansion (sweep B)

Downloaded 2026-09-10 into `models-staging/expansion-b/<species>/`. **19 files, 9,886,748 bytes
(9.4 MB), largest 3.85 MB** — budget was ≤40 MB/model and ≤200 MB/agent, so both are far under.
Sources swept by this agent: **OpenGameArt, Poly Haven, itch.io, GitHub, polygone.art**.

All `.glb` verified to start with the `glTF` magic. Structure recorded with
`node tools/dump-structure.mjs` (full node-tree + joint-name dump kept at
`expansion-b/_tools/structure-dump.txt`); joints/clips/tris/bbox via
`expansion-b/_tools/inspect.mjs` (copied from sweep A).

**Licence discipline:** every row is CC0 1.0 or CC-BY 3.0. Nothing NC, nothing unlicensed, no
Sketchfab. **One pack was rejected on licence grounds** (`deepdivegamestudio.itch.io/animalassetpack`
— itch.io page declares no licence at all; the only mention of licensing is a comment *asking* what
the licence is). **Eight files staged here by an interrupted earlier pass were deleted**, not
manifested: their bytes matched no citable source URL, and an un-provenanced file cannot ship in a
public repo. Everything below was re-downloaded from a URL that is written in its own row.

## How the three new access paths worked (for the next sweep)

- **polygone.art is the whole Google Poly archive and it is wide open.** The SPA (`/dist/index.js`)
  hardcodes `BLOB_URL="https://blob.polygone.art"`. That host serves, with no auth and CORS `*`:
  - `…/data/assets.csv` — **the entire catalogue, 131,700 rows**, `guid,artistGuid,title,tag…`
  - `…/data/artists.csv` — `artistGuid,name,…assetGuids`
  - `…/assets/<guid>/data.json` — name, `authorName`, `license`, and a `formats[]` array carrying
    `formatType` (GLB / GLTF2 / OBJ / FBX) + `formatComplexity.triangleCount`
  - `…/assets/<guid>/GLB/<relativePath>` — **the original Google Poly GLB**, direct download
  This is strictly better than searching Poly Pizza for Poly-by-Google assets: 131,700 rows vs a
  curated subset, a real tri count before you download, and no scraping. Scripts kept in the session
  scratchpad (`pgsearch.mjs`, `pgget.mjs`, `pgdl.mjs`).
- **polygone.art serves the ORIGINAL file; Poly Pizza serves a re-export.** Same asset, different
  bytes, every time: Gopher `1fi2x6XlYjB` is 2,000,124 B here vs 1,971,532 B on Poly Pizza; Aardvark
  76,120 vs 48,284; Alligator 65,300 vs 43,604; Scorpion 75,708 vs 53,508. Geometry and bbox agree —
  the delta is texture re-encoding. **Poly Pizza's copy is smaller and equally correct, so prefer it
  when both exist**; use polygone.art to *find* assets and to reach the ~131k that Poly Pizza omits.
- **`trebeljahr/quaternius-showcase` (GitHub, MIT repo / CC0 models) mirrors whole Quaternius packs
  as GLB** under `public/glb/<pack>/`, including packs whose own quaternius.com download is
  FBX/OBJ/Blend-only. 33 packs; the creature-bearing ones are `animals_pack` (12), `dinosaurs_pack`
  (6), `easy_enemies_pack` (7: Frog, Rat, Snake, Snake_angry, Spider, Wasp), `mech_pack` (4).
  **Verified byte-identical to Poly Pizza's Quaternius GLBs** — `Velociraptor` 285,828,
  `TRex` 336,568 (mirror path is `dinosaurs_pack/Trex.glb`, lower-case r — `TRex.glb` 404s),
  `Apatosaurus` 380,776, `Snake` 216,696 all sha256-match sweep A's copies — RE-VERIFIED by this
  audit, md5 for md5, against the live raw URLs. That
  cross-check is what licences this mirror: same bytes, same CC0 author.
  It also answers sweep A's note that the "Ultimate Animated Dinosaurs" pack ships no glTF — **the
  GLBs exist here**, and this mirror carries `animals_pack` GLBs at **~650 KB versus the 3.1–3.6 MB
  `.gltf` sweep A pulled from Drive (5× smaller, same 46-joint rig)**. If size ever matters, re-pull
  Deer/Bull/Stag/Cow/Alpaca/Horse/Donkey/Wolf from here.

## Sweep B downloads

`Fit` = closeness to the HZD machine per `docs/research/roster-v2.md` §3–4. Sizes are exact bytes.
"static" = no skin, needs `autorig.js` + `GaitController`. **Rows duplicating sweep A were deleted
rather than shipped** (see the dedupe note below), so every file here is new to the repo.

### Stalker / Ravager / Sawtooth — the feline rig (biggest find in this sweep)

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `stalker/Cat_Quaternius_animated.glb` | [poly.pizza/m/qKICY6xla2](https://poly.pizza/m/qKICY6xla2) | Quaternius | CC0 1.0 | 238,672 | 1 skin, **16 joints** — but read the caveat: the joint list is `All, Root, Body, Head, Tail, FrontLeg.L/R, BackLeg.L/R` plus their `_end` tips, i.e. **one single bone per leg, no elbow or knee** (same coarse `AnimalArmature` as sweep A's Sheep and Wolf) | **8**: `Death, Headbutt, Idle, Idle_Eating, Jump_Loop, Jump_Start, Run, Walk` (triple-prefixed `AnimalArmature\|AnimalArmature\|AnimalArmature\|…` — strip on load) | 2,448 | **The only rigged feline in either sweep — but it is a clip donor, not a finished cat.** `Jump_Start`/`Jump_Loop` is the Jumping Jaw Smash pounce and `Walk`/`Run` give real feline timing, so it serves Stalker, Ravager and Sawtooth **at distance or under full shell plating**. Because the legs are single-bone there is no digitigrade knee bend: for a hero-distance Ravager, keep sweep A's plan (`autorig.js` on the static Lion/Jaguar) and **retarget these 8 clips onto the autorigged 3-segment legs** rather than skinning to this rig directly. House-cat proportions — scale up |

### Stormbird — the hover/soar clip pair

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `stormbird/Armabee_Quaternius_animated.glb` | [poly.pizza/m/42djT5zJnx](https://poly.pizza/m/42djT5zJnx) | Quaternius | CC0 1.0 | 143,736 | 1 skin, **13 joints** | **8**: `Death, Fast_Flying, Flying_Idle, Headbutt, HitReact, No, Punch, Yes` (prefix `CharacterArmature\|`) | 2,280 | **REDUNDANT — audit correction.** The hover/dive pair was ALREADY in this repo before both sweeps: `quaternius-ultimatemonsters/Flying/Dragon.gltf` (13 joints) and `Pigeon.gltf` (13 joints) and `Dragon_Evolved.gltf` (46 joints) each carry the IDENTICAL 8-clip set (`Death, Fast_Flying, Flying_Idle, Headbutt, HitReact, No, Punch, Yes`) on the same rig family — see the "Ultimate Monsters" table at the top of this file. Armabee is the smallest of the four (143,736 B) and is worth keeping on size alone, but it opened no gap. Roster §4 splits the Stormbird into *soar high* / *hover barrage* / *strafing dive*: `Flying_Idle` is the hover, `Fast_Flying` is the dive/strafe. Sweep A's `HawkLpRigged` has one clip (`Fly`) and the Bat has `Bat_Flying` only — neither distinguishes hover from dive, but the staged `Flying/*` monsters already did. Retarget these two onto the hawk's 58-joint `metarig`; the body is a stylised bee, so it is a **clip donor, not a silhouette donor** |
| `stormbird/HarpyEagle_PolyGoogle.glb` | [polygone.art/model/aZElBIT8DLp](https://polygone.art/model/aZElBIT8DLp) · [glb](https://blob.polygone.art/assets/aZElBIT8DLp/GLB/harpy_eagle.glb) | Poly by Google | CC-BY 3.0 | 3,849,300 | static; bbox 11.90×10.33×11.79 | — | 1,034 | **best raptor silhouette found in either sweep.** The harpy is the heaviest, broadest-winged eagle — short powerful wings and oversized talons read as "combat T5 apex flyer" where a golden eagle reads as a bird. 3.85 MB is one texture, not geometry (1,034 tris) |
| `stormbird/FerruginousHawk_PolyGoogle.glb` | [polygone.art/model/6mUdkMMh2JT](https://polygone.art/model/6mUdkMMh2JT) · [glb](https://blob.polygone.art/assets/6mUdkMMh2JT/GLB/ferruginous_hawk.glb) | Poly by Google | CC-BY 3.0 | 1,447,588 | static; bbox 2.54×3.35×3.77 | — | 1,110 | broad-winged soaring hawk, wings held out — the mid-air pose the Stormbird spends most of its time in |

### Rockbreaker — burrower anatomy (sweep A had no digging claws or armour carapace)

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `rockbreaker/Anteater_PolyGoogle.glb` | [polygone.art/model/07VI28sK4a0](https://polygone.art/model/07VI28sK4a0) · [glb](https://blob.polygone.art/assets/07VI28sK4a0/GLB/anteater.glb) | Poly by Google | CC-BY 3.0 | 111,292 | static; ~cm scale (bbox 100.1×209.4×630.7) | — | 1,054 | **PRIMARY digging head.** Better than sweep A's aardvark for this role: the anteater's snout is a long tapered cone — read it as the drill shaft itself — and its forelimbs carry genuinely oversized excavation claws. 3 materials are `Black` (60 tris, nose tip only), `Dark_Brown` (266) and `Light_Brown` (728) on ONE mesh — the two brown groups overlap across nearly the whole bbox, so this is a colour split, NOT an anatomical snout/body/limb split. The snout still has to be cut by hand |
| `rockbreaker/Armadillo2149_PolyGoogle.glb` | [polygone.art/model/81WIGctw3se](https://polygone.art/model/81WIGctw3se) · [glb](https://blob.polygone.art/assets/81WIGctw3se/GLB/armadillo.glb) | Poly by Google | CC-BY 3.0 | 224,116 | static; ~cm scale (bbox 176.3×232.9×673.8) | — | 2,149 | **the banded burrow carapace, at 3.2× the detail of sweep A's 672-tri armadillo.** 2,149 tris actually resolve the individual armour bands, so the bands can be cut into separate plate meshes instead of faked with a texture |
| `rockbreaker/Badger_PolyGoogle.glb` | [polygone.art/model/fXBbhQr-T80](https://polygone.art/model/fXBbhQr-T80) · [glb](https://blob.polygone.art/assets/fXBbhQr-T80/GLB/badger.glb) | Poly by Google | CC-BY 3.0 | 54,284 | static; ~cm scale (bbox 42.2×68.9×160.5) | — | 514 | the classic burrower body — low, wide, front-loaded shoulder mass over digging forelimbs; 514 tris makes it the tunnel-mound / LOD proxy |

### Snapmaw — mid-detail crocodilian

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `snapmaw/Crocodile1328_PolyGoogle.glb` | [polygone.art/model/fnUp2MrGjmr](https://polygone.art/model/fnUp2MrGjmr) · [glb](https://blob.polygone.art/assets/fnUp2MrGjmr/GLB/crocodile.glb) | Poly by Google | CC-BY 3.0 | 140,324 | static; ~cm scale (bbox 1279.4×188.8×714.7 — authored lying along X) | — | 1,328 | fills the gap between sweep A's 536-tri crocodile and its 2,116-tri caiman. 4 materials on ONE mesh, verified as `4CAF50` body (782 tris) / `8BC34A` belly (250) / `1A1A1A` eyes (96) / `FFFFFF` teeth (200) — i.e. body, belly, eyes, teeth. The dorsal scutes and the limbs are NOT separable by material, so the roster §4 dorsal-plate split is NOT free here; only the belly and the teeth lift out cleanly. Head is at −X, tail at +X. **Still no rigged crocodile exists on any source swept by either agent** — Snapmaw remains an `autorig.js` sprawling-stance job |

### Shell-Walker — claw and carapace donors

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `shell-walker/Crab1340_PolyGoogle.glb` | [polygone.art/model/1O5Q4pE8X6e](https://polygone.art/model/1O5Q4pE8X6e) · [glb](https://blob.polygone.art/assets/1O5Q4pE8X6e/GLB/crab.glb) | Poly by Google | CC-BY 3.0 | 141,564 | static; ~cm scale (bbox 779.5×273.5×601.9) | — | 1,340 | true crab proportions — wide flat carapace, legs splayed outboard. Sweep A's `CrabEnemy_Quaternius` is a stylised cartoon crab with a 7-joint rig too coarse to walk; this is the **shape** reference for the carapace shell that dresses the Spider rig |
| `shell-walker/Lobster_PolyGoogle.glb` | [polygone.art/model/0IceC4Tzcad](https://polygone.art/model/0IceC4Tzcad) · [glb](https://blob.polygone.art/assets/0IceC4Tzcad/GLB/lobster.glb) | Poly by Google | CC-BY 3.0 | 92,032 | static; ~cm scale (bbox 51.2×19.0×86.8) | — | 884 | **the two asymmetric arm-claws.** Roster §4 gives the Shell-Walker a *shield* claw on the left and a *lightning-gun* claw on the right; a lobster is the one common animal whose two claws are already different sizes — BUT THE PAIR DOES NOT LIFT OUT AS-IS. Verified: ONE mesh (`buffer-0-mesh-0`, 884 tris) with ONE material (`lambert2SG`). Separating the two claws needs connected-component/vertex-island surgery, which this machine cannot do — `@gltf-transform` has no island split and sweep B's own notes confirm there is no Blender here. Treat it as a SHAPE REFERENCE for asymmetric claws until a mesh-editing tool exists |

### Bellowback — sac-bodied hopper

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `bellowback/Parasaurolophus_Quaternius.glb` | [trebeljahr/quaternius-showcase `dinosaurs_pack/Parasaurolophus.glb`](https://github.com/trebeljahr/quaternius-showcase/blob/main/public/glb/dinosaurs_pack/Parasaurolophus.glb) · [raw](https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/dinosaurs_pack/Parasaurolophus.glb) | Quaternius (mirror repo MIT) | CC0 1.0 | 291,016 | 1 skin, **29 joints** — the same dino skeleton as Velociraptor/TRex/Apatosaurus/Triceratops/Stegosaurus | **6**: `Armature\|Parasaurolophus_Attack, _Death, _Idle, _Jump, _Run, _Walk` | 1,412 | **PRIMARY body — new to the repo and it drops straight onto sweep A's existing dino retarget map.** Heavy low-slung barrel torso on strong hind legs = the Bellowback's cargo-sac bulk, and the species' defining backswept head crest is a **resonating chamber** — literally the bellow. Free of charge on a rig the caster already supports |
| `bellowback/Frog_Quaternius_easyenemies.glb` | [trebeljahr/quaternius-showcase `easy_enemies_pack/Frog.glb`](https://github.com/trebeljahr/quaternius-showcase/blob/main/public/glb/easy_enemies_pack/Frog.glb) · [raw](https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb/easy_enemies_pack/Frog.glb) | Quaternius (mirror repo MIT) | CC0 1.0 | 587,360 | 1 skin, **28 joints** | **4**: `FrogArmature\|Frog_Attack, _Death, _Idle, _Jump` | 4,920 | second frog rig, **distinct pack** from sweep A's 43-joint `Frog_Quaternius.glb` (that one is a humanoid `CharacterArmature` frog *character*; this is a four-legged frog *creature*). Use whichever reads better squatting; sweep A's has 14 clips, this one has the correct anatomy |
| `bellowback/Frog_PolyGoogle.glb` | [polygone.art/model/07-wJ9bkzul](https://polygone.art/model/07-wJ9bkzul) · [glb](https://blob.polygone.art/assets/07-wJ9bkzul/GLB/frog.glb) | Poly by Google | CC-BY 3.0 | 52,148 | static; bbox 12.88×13.88×18.81 | — | 464 | 464-tri squatting frog — distance-LOD body |
| `bellowback/Turtle536_PolyGoogle.glb` | [polygone.art/model/c6n73UnGEP4](https://polygone.art/model/c6n73UnGEP4) · [glb](https://blob.polygone.art/assets/c6n73UnGEP4/GLB/turtle.glb) | Poly by Google | CC-BY 3.0 | 56,536 | static; ~cm scale (bbox 32.0×19.9×53.7) | — | 536 | **domed** shell — sweep A's turtle `2LCcq8vhqJ3` is a flat-shelled 4,026-tri sea turtle; the Bellowback's dorsal cargo sac needs the high dome, and this is 7× lighter |

### Ravager / Stalker — big-cat silhouettes

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `ravager/Lion_PolyGoogle.glb` | [polygone.art/model/cC_IFclYA4c](https://polygone.art/model/cC_IFclYA4c) · [glb](https://blob.polygone.art/assets/cC_IFclYA4c/GLB/lion.glb) | Poly by Google | CC-BY 3.0 | 93,176 | static; bbox 5.04×8.75×14.34 | — | 844 | **best Ravager silhouette.** The mane builds exactly the heavy shoulder/neck mass the dorsal cannon mounts behind, and the flat level back-line is the cannon rail. 6 materials on ONE mesh: `FF5722` (100 tris, X±2.52 — the mane, wider than the body) and four small face groups (`F06292` muzzle, `1A1A1A`, `FF9800`, `F44336`), with `DD9944` (672 tris) carrying BODY AND LIMBS TOGETHER. So the mane and the face bits separate cleanly; the limbs do NOT |
| `ravager/Tiger_PolyGoogle.glb` | [polygone.art/model/5A3w06FXUup](https://polygone.art/model/5A3w06FXUup) · [glb](https://blob.polygone.art/assets/5A3w06FXUup/GLB/tiger.glb) | Poly by Google | CC-BY 3.0 | 250,636 | static; ~cm scale (bbox 45.1×123.1×229.9) | — | 744 | heaviest-built big cat; alt Ravager body if the mane fights the cannon mount |
| `stalker/Leopard_PolyGoogle.glb` | [polygone.art/model/6nx00EmCs7T](https://polygone.art/model/6nx00EmCs7T) · [glb](https://blob.polygone.art/assets/6nx00EmCs7T/GLB/leopard.glb) | Poly by Google | CC-BY 3.0 | 75,684 | static; bbox 5.93×21.42×37.07 | — | 694 | leanest, longest-tailed cat of the three staged across both sweeps (A has Cougar + Snow Leopard) — the Stalker is the *cloaking ambusher*, so it wants the slinkiest body |

### Lancehorn / Trampler — component and bulk donors

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `lancehorn/Drill_PolyGoogle.glb` | [polygone.art/model/93nEcwogYE0](https://polygone.art/model/93nEcwogYE0) · [glb](https://blob.polygone.art/assets/93nEcwogYE0/GLB/drill.glb) | Poly by Google | CC-BY 3.0 | 91,096 | static, 3 materials; bbox 11.03×10.01×3.48 | — | 856 | **a handheld power drill** — a genuinely different object from sweep A's `Drill_KayKit.glb` (a mining rig). Its chuck-and-bit end is a short tapered spiral: the right shape for a **Lancehorn horn tip** at horn scale, where the KayKit mining drill is the right shape for the **Rockbreaker**. Take one donor per machine, not one for both |
| `trampler/Bison_bovine_PolyGoogle.glb` | [polygone.art/model/30FwRBwJ-rC](https://polygone.art/model/30FwRBwJ-rC) · [glb](https://blob.polygone.art/assets/30FwRBwJ-rC/GLB/bison.glb) | Poly by Google | CC-BY 3.0 | 1,946,188 | static; bbox 5.02×11.17×18.57 | — | 1,012 | second bison, tagged `bovine` (sweep A's `9sTrha-TxdS` is the `plains` one). Squarer shoulder hump — the hump is where roster §4 puts the fire vents — and herd variety needs two bodies anyway. 1.9 MB is one texture |

### Tools

| File | Source | Use |
|---|---|---|
| `_tools/inspect.mjs` | copied verbatim from `expansion-a/_tools/inspect.mjs` | clip/tri/bbox/joint inspector used for every row above |
| `_tools/structure-dump.txt` | `node tools/dump-structure.mjs` over all 19 GLBs | full node hierarchy + joint-name lists, as required |
| `LICENSE-quaternius-animals.txt` | Quaternius pack | verbatim CC0 1.0 Universal pack licence |

## Dedupe against sweep A (8 files downloaded, verified, then deleted)

Sweep A's addendum landed while this sweep was running and took eight of the same assets. Rather
than ship them twice, they were sha256-compared and removed from `expansion-b/`:

- **Byte-identical** (sha256 match, so also a licence cross-check on the GitHub mirror):
  `Velociraptor_Quaternius.glb` 285,828 · `TRex_Quaternius.glb` 336,568 ·
  `Apatosaurus_Quaternius.glb` 380,776 · `Snake_Quaternius.glb` 216,696.
- **Same asset, different bytes** (polygone.art original vs Poly Pizza re-export — keep sweep A's,
  which is smaller): `Gopher` · `Aardvark` · `Alligator` · `Scorpion`.

## Notes the caster needs (sweep B)

- **Rig coverage across both sweeps, stated honestly.** Two rigs are *articulated* (3-segment limbs,
  usable as-is): `AnimalArmature` **46–51j** → Grazer/Broadhead/Lancehorn/Charger/Trampler/Strider/
  Stalker-gait, and the dino **29j** → Watcher/Redeye/Thunderjaw/Tallneck/Rockbreaker-body/
  **Bellowback**. One rig is *coarse* (**16j**, one bone per leg): Sheep/Wolf/**Cat** — treat as a
  clip source only. **Snapmaw, Shell-Walker and any hero-distance feline still have no native
  articulated rig**: Snapmaw needs `autorig.js`, Shell-Walker rides sweep A's 39-joint Spider, and
  the Ravager/Stalker want `autorig.js` on a static cat with the 16j clips retargeted on.
- **`Parasaurolophus` is free roster coverage.** It joins the five dinosaurs sweep A already mapped,
  so adding Bellowback costs one mesh swap on an existing retarget map — no new rig work.
- **Three clip vocabularies now need prefix-stripping on load**, not two: `Armature|Species_X` and
  `CharacterArmature|X` and `FrogArmature|X`/`SnakeArmature|X`, plus the triple-prefixed
  `AnimalArmature|AnimalArmature|AnimalArmature|X` on Sheep, Wolf **and the new Cat**.
- **Scale discipline, restated.** Quaternius GLBs are quantized (bbox reads 0.01–0.12, real scale on
  the node transform). Poly-by-Google GLBs are authored in centimetres (bbox in the tens–hundreds),
  **and several are authored lying along a non-obvious axis** — `Crocodile1328` is 1279×189×715, i.e.
  nose-to-tail runs along X, not Z. Measure world bounds at load; do not assume +Z forward.
- **Texture bytes dominate, not geometry.** Harpy Eagle is 3.85 MB for 1,034 tris; Gopher 2.0 MB for
  948; Bison 1.9 MB for 1,012. Every one is a single large PNG. A texture-resize pass over the
  Poly-by-Google files would cut `expansion-b/` by roughly 80% before anything ships.

## Sources swept with no usable result (sweep B)

- **Poly Haven** — swept via its open API (`api.polyhaven.com/assets?t=models`). **521 models, zero
  creatures.** The library is props, furniture, plants, rocks, food, tools and modular architecture;
  the only animal-adjacent entries are decorative objects (`bull_head`, `horse_head`, `lion_head`
  wall mounts, `concrete_cat_statue`, `bronze_shark_statue`, `street_rat`). Nothing fits any target
  silhouette, and its 4K-PBR models are the wrong style and weight for this roster anyway.
- **OpenGameArt** — swept properly (advanced search, `field_art_type_tid=10` for 3D, licence filter
  restricted to CC0 / CC-BY 3.0+4.0 / CC-BY-SA 3.0+4.0 / OGA-BY). Good CC0 *content* exists —
  `Deer Low Poly (rigged)`, `Wolf Low Poly (Rigged)` (crownjoshua), `Beisa Oryx`, `White Rhinoceros`,
  `Tiger`, `Crocodile` (all Micket, all CC0 and all **rigged**), `Crab`/`Frog` (methodical pixel, CC0)
  — but **it is almost all `.blend`, with some `.fbx`/`.obj`/`.7z`, and essentially no glTF for
  creatures.** This machine has **no Blender and no FBX converter** (`blender`, `FBX2glTF`, `assimp`,
  `obj2gltf` all absent; the repo's only 3D tooling is `@gltf-transform`, which cannot read `.blend`
  or `.fbx`). So none of it is usable here. **This is the single highest-value unlock available to
  the next sweep: install Blender and OpenGameArt yields a CC0 rigged crocodile, tiger, oryx and
  rhino — exactly the four silhouettes that currently have no native rig.** Archives were downloaded
  and inspected to confirm the formats before this conclusion; none were staged.
- **itch.io** — swept the free 3D `animals` tag. Dominated by 2D pixel art. The only CC0 3D animal
  packs are **Quaternius's own** (`quaternius.itch.io/lowpoly-animated-animals`, which confirms
  *Creative Commons Zero v1.0 Universal* on the pack page — a useful canonical licence citation for
  the Quaternius rows in both sweeps), i.e. assets already staged. `deepdivegamestudio.itch.io/
  animalassetpack` declares **no licence** and was rejected on that basis.
- **GitHub** — repo search and code search both swept. Code search for `Crocodile.glb`, `Eagle.glb`
  etc. returns plenty of hits, but **they sit in hobby game repos with no asset provenance** — the
  exact "unlicensed rip" failure mode the brief forbids, so nothing was taken from them. The one
  genuinely useful result is `trebeljahr/quaternius-showcase`, documented above. `KhronosGroup/
  glTF-Sample-Assets` was checked: its only creatures are `Fox` (already staged at the repo root) and
  `BrainStem`/`Dragon*` (not animals in the roster sense).

## ATTRIBUTIONS — sweep B (append to credits screen)

Required (CC-BY 3.0), all Google Poly archive assets via polygone.art:

```
Harpy Eagle, Ferruginous Hawk, Anteater, Armadillo, Badger, Crocodile, Crab, Lobster, Lion,
Tiger, Leopard, Frog, Turtle, Drill and Bison by Poly by Google [CC-BY 3.0]
  via polygone.art — https://polygone.art/model/aZElBIT8DLp , /6mUdkMMh2JT , /07VI28sK4a0 ,
  /81WIGctw3se , /fXBbhQr-T80 , /fnUp2MrGjmr , /1O5Q4pE8X6e , /0IceC4Tzcad , /cC_IFclYA4c ,
  /5A3w06FXUup , /6nx00EmCs7T , /07-wJ9bkzul , /c6n73UnGEP4 , /93nEcwogYE0 , /30FwRBwJ-rC
```

Optional courtesy credits (CC0 1.0, no attribution required):

```
Cat and Armabee by Quaternius (CC0 1.0) via Poly Pizza — https://quaternius.com
Parasaurolophus and Frog by Quaternius (CC0 1.0), CC0 confirmed at
  https://quaternius.itch.io/lowpoly-animated-animals , GLB mirror
  https://github.com/trebeljahr/quaternius-showcase (repo MIT)
```

## Kitbash plans — sweep B

For every target species where no single model is the machine. Written against the real
`src/entities/machines/rig/shells.js` contract: a piece is
`{ m, g, p:[x,y,z], s:[sx,sy,sz], r:[rx,ry,rz], mirror?, bone?, wear? }`, `p`/`s`/`r` in **body-space
metres, +Z forward, +Y up, y=0 at the feet**; tones `m` are `plate | lacquer | trim | muscle | cable
| sensor`; primitives `g` are `box | cyl | cone | tube | wedge | blade | fang | ico | plate`. Pieces
with `bone:` parent to a named joint on the GLB rigs (names below are copied from
`_tools/structure-dump.txt`, so they are exact); pieces without one are capsule-weighted by
`autorig.js`. Every plan ends with `hideSculpt(machine)` — the donor animal is scaffolding, the shell
is the machine.

Dino-29j bone names: `root, Body, Hips, Torso, Back, Shoulders, Neck, Head, Tail1…Tail5,
FrontLeg.L/R → FrontUpLeg → FrontLowLeg → FrontFoot, BackLeg.L/R → BackUpLeg → BackLowLeg → BackFoot`.

### Shell-Walker — hexapod + cargo crate (roster §4, Transport T3)

- **Donor rig:** `expansion-a/shell-walker/Spider_Quaternius.glb` (39 joints, 8 leg chains, clips
  `Spider_Attack/_Death/_Idle/_Jump/_Walk`). **Hide leg chains 3 and 4** (the rearmost pair) to go
  octopod → **hexapod**; the `Walk` clip still reads correctly because the remaining six keep their
  alternating tripod phase.
- **Carapace:** one `{m:'plate', g:'wedge', p:[0,1.9,0.1], s:[2.6,0.5,3.0], bone:'Body'}` domed slab,
  proportioned from `expansion-b/shell-walker/Crab1340_PolyGoogle.glb` (wide-flat crab, 779×273×602
  cm) — **not** from sweep A's stylised `CrabEnemy`. Add two `lacquer` shoulder caps at
  `p:[±0.95,1.95,0.55]` for the classic HZD lacquered-over-vitals read.
- **The two arms are asymmetric on purpose.** Lift both claws out of
  `expansion-b/shell-walker/Lobster_PolyGoogle.glb` — a lobster is the one animal whose claws already
  differ in size. Big crusher → **left, shield projector**; slim ripper → **right, lightning gun**,
  with `expansion-a/shell-walker/DoubleTurret_Kenney.glb` (876 tris, meshes `turret_double`/`turret`)
  grafted into the right claw as the muzzle and `turret` reused as the left shield housing.
- **Cargo:** `expansion-a/shell-walker/ScifiCrate_Quaternius.glb` slung *under* the platform at
  `p:[0,0.95,0]`, parented to `Body`. Roster §4: **any damage detaches it** and the machine defends
  cargo over its own life — so it is a `parts[]` entry with low `tearHp`, not shell geometry.
- **Shield:** no mesh. Hex energy shield = an additive-blended plane with a scrolling hex mask,
  spawned at the left claw bone, driven by the existing telegraph event.
- **Sensors/VFX:** one `{m:'sensor', g:'ico', s:[0.16,0.16,0.16], bone:'Head'}` eye on the state
  colour; `cable` tone bundles across every leg-root gap (the roster's "synthetic muscle in the
  joint gaps"); power generator under the platform as the Shock-stun part.

### Rockbreaker — burrower (roster §4; hardest silhouette, no single donor exists)

- **Donor rig:** `expansion-a/_donors/Apatosaurus_Quaternius.glb` (dino 29j, 6 clips). Its long low
  barrel body and heavy hips are the burrower mass; **retime `_Walk` ~0.6× and drop the root ~0.4 m**
  so it ploughs rather than strides. Sweep A's Stegosaurus is the alt body.
- **Head:** replace with `expansion-b/rockbreaker/Anteater_PolyGoogle.glb`'s tapered snout, parented
  to `Head` — the cone *is* the drill shaft. Cap it with the `drill_module` mesh from
  `expansion-a/rockbreaker/Drill_KayKit.glb` spinning on local Z (`drill_structure` = the housing
  collar). **Use the KayKit mining drill here and the Poly-by-Google power drill on the Lancehorn**,
  not the same donor twice.
- **Digging forelimbs:** claws from `expansion-a/rockbreaker/GroundSloth_PolyGoogle.glb`, three
  `blade` pieces per side mirrored onto `FrontFoot.L/R`, oversized ~1.6×.
- **Carapace:** band plates stepped along `Back`/`Hips` at ~0.35 m spacing, each
  `{m:'plate', g:'wedge', wear:0.5}`, profiled from `expansion-b/rockbreaker/Armadillo2149_PolyGoogle.glb`
  — at 2,149 tris its bands actually resolve, so cut real plates instead of faking them with a texture.
- **Burrow motion:** `expansion-a/_donors/Snake_Quaternius.glb` (15j serpentine chain) drives the
  *underground* bulge — a displaced terrain ridge tracking the snake spine — then the Apatosaurus
  body breaches. That two-asset split is what sells "it tunnels", and neither asset can do it alone.
- **Components per roster:** drill (Tear, disables burrow), dorsal heat vents, Blaze canisters in the
  haunch gaps.

### Stormbird — jet-winged eagle (roster §4, Combat T5; hardest flyer)

- **Donor rig:** `expansion-a/stormbird/HawkLpRigged_Sherkiz.glb` (58-joint `metarig`, per-feather
  chains) stays the body — it is still the only rigged raptor found.
- **Clips, now solved:** it ships one clip (`Fly`). Retarget
  `expansion-b/stormbird/Armabee_Quaternius_animated.glb` → **`Flying_Idle` = the hover barrage**,
  **`Fast_Flying` = the strafing dive**; its `Wing1…Wing4.L/R` chain maps one-to-one onto sweep A's
  Bat (`Wing1-4`) — that half is verified exact. It does NOT map 1:1 onto the hawk: the hawk splits
  a wing into `Wing.L/Wing.001.L/Wing.002.L` (3 bones) plus `w_feather.001-004.L` (4 feathers),
  a different topology, so the hawk leg of the retarget needs a hand-written bone map. Add the Bat's `Bat_Attack`/`_Hit`
  for grounded melee. Three donors, one flight state machine.
- **Silhouette correction:** proportion the body to
  `expansion-b/stormbird/HarpyEagle_PolyGoogle.glb` — short broad wings, oversized talons, heavy
  chest. A golden eagle reads "bird"; a harpy reads "apex predator", which is what a T5 solo needs.
- **Six feather-jet engines, 3 per wing** (the machine's signature): `{m:'trim', g:'tube'}` nacelles
  at 35% / 60% / 85% along each wing chain, parented to `Wing2/3/4`, each with a `sensor`-tone
  exhaust disc at its rear so the blue exhaust is the state-colour channel. All six torn = grounded.
- **Plate donor:** `expansion-a/stormbird/Pterablocktyls_HoaiNguyen.glb` for wing spars and fuselage —
  but it is 44.9k tris with generic `mesh<digits>` names, so **select parts by bounding box and
  decimate before it ships**.
- **Components:** Lightning gun (chest, Tear), Freeze ×2 (shoulders), Blaze ×2 (hips).

### Snapmaw — crocodile (roster §4; no rigged crocodile exists on any source either agent swept)

- **Body:** `expansion-b/snapmaw/Crocodile1328_PolyGoogle.glb` (1,328 tris; its 4 materials already
  split jaw / dorsal scutes / belly / limbs). **It is authored lying along X** (bbox 1279×189×715 cm)
  — rotate to +Z forward before measuring.
- **Rig:** `autorig.js` in a **sprawling stance** — hips wider than shoulders, elbow and knee rotated
  outboard, belly ~0.25 m off the ground. This is the one target machine that genuinely needs the
  auto-rigger rather than a retarget.
- **Jaw:** split the snout at the material seam into upper/lower and hinge the lower on a jaw bone;
  the Lunge Bite and Snap Bite are jaw-open + root-forward, no new geometry.
- **Shell:** dorsal scute rows as stepped `wedge` plates down the spine; `muscle` tone in every limb
  gap; **Freeze sac in the gullet** as a `sensor`-tone ico under the jaw that glows before the Freeze
  Burst mortar (roster: "throat glows blue"); 2 Blaze canisters on the shoulders.
- **Tail:** 4–5 autorig tail bones — the Tail Spin (0–15 m, 180) needs real segments.

### Bellowback — cargo-sac hopper (now cheap, thanks to the dino rig)

- **Donor rig:** `expansion-b/bellowback/Parasaurolophus_Quaternius.glb` (dino 29j, 6 clips) — drops
  onto the retarget map sweep A already built for Velociraptor/TRex/Apatosaurus/Triceratops/
  Stegosaurus, so this machine costs **one mesh swap and no new rig work**.
- **The crest is the bellow.** The species' backswept head crest is a real resonating chamber —
  keep it, plate it as `lacquer`, and drive the roar/telegraph VFX from its tip.
- **Cargo sac:** dome from `expansion-b/bellowback/Turtle536_PolyGoogle.glb` (domed, 536 tris — not
  sweep A's flat 4,026-tri sea turtle), scaled to `s:[1.5,1.1,1.9]` on `Back`, `muscle` tone so it
  reads as a distended sac, with a `sensor` seam that brightens as it fills.
- **Gait:** `_Jump` retimed as the hop-lurch; `_Walk` for the laden waddle.
- **Alt:** `expansion-b/bellowback/Frog_Quaternius_easyenemies.glb` (28j, 4 clips) if a squat frog
  reads better than a crested hadrosaur — it is the correct *animal*, the Parasaurolophus is the
  correct *mass*.

### Ravager & Stalker — the two cats

- **Ravager body:** `expansion-b/ravager/Lion_PolyGoogle.glb`. The mane pre-builds the heavy
  shoulder/neck mass and the level back-line is the cannon rail. `autorig.js` for 3-segment legs,
  then **retarget the 16j Cat clips** (`Walk`/`Run`/`Jump_Start`+`Jump_Loop`) onto it — do not skin
  to the Cat rig directly (single-bone legs, see its row above).
- **Cannon:** `expansion-a/ravager/TurretCannon_Quaternius.glb`, whose `Turret_Cannon_Base` /
  `_Top` split *is* the swivel — parent Base to `Back`, yaw Top toward the target for the muzzle
  spin-up telegraph, detach both as one `parts[]` entry on Tear (player-usable per roster).
- **Stalker body:** `expansion-b/stalker/Leopard_PolyGoogle.glb` — the leanest, longest-tailed cat
  staged across both sweeps, which is what a cloaking ambusher wants.
- **Cloak:** no geometry. Drive shell material opacity + a refraction-ish distortion on the existing
  shell material; `sensor` pieces stay faintly visible so the player can still find it (HZD keeps the
  Stalker's lights readable while cloaked).
- **Components:** Ravager — cannon (Tear), power cell (rear, Shock), Chillwater canister (chest).

### Lancehorn & Trampler — horn and vent dressing

- **Lancehorn:** donor `expansion-a/lancehorn/Stag_Quaternius.gltf` — **its antlers are already a
  separate mesh (`Cube.001`)**, so hide that one mesh and mount two drill horns with no body edits.
  Drill tip from `expansion-b/lancehorn/Drill_PolyGoogle.glb` (a handheld power drill — its chuck-and-
  bit end is the right tapered spiral at horn scale), scaled ~0.3, mirrored onto the two antler
  sockets, spinning on local Z during the charge telegraph. Ribbed-horn profile reference:
  `expansion-a/lancehorn/Ibex_Syl.glb` (13 part-split meshes).
- **Trampler:** donor `expansion-a/trampler/Triceratops_Quaternius.glb` (dino 29j) or the 46j Cow.
  Shoulder hump profiled from `expansion-b/trampler/Bison_bovine_PolyGoogle.glb`; **the hump is where
  the fire vents go** — 4 `{m:'trim', g:'tube'}` stacks on `Shoulders`, each with a `sensor` disc
  that glows before the fire burst. Heavy plate donor: `expansion-a/trampler/Stegoknight_HoaiNguyen.glb`
  (81 separate meshes, so pieces lift out cleanly).

### Redeye Watcher — no new model needed

Sweep A's `redeye-watcher/Velociraptor_Quaternius.glb` (dino 29j, 6 clips) is the body and
`RobotEnemy_Quaternius.glb` has literal `Eye` and `Gun` bones plus a `Shoot` clip. The Redeye is a
**variant, not a species**: same chassis as the Watcher, eye emissive forced to red, plus the Energy
Blast (0–55 m, 40) firing from the `Gun` bone. Ship it as a flag on the Watcher, not a second rig.
