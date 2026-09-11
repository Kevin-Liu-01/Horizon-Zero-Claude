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
| `lancehorn/Stag_Quaternius.gltf` | Ultimate Animated Animal Pack → Drive `1uJ3N5HfB7jKTseJUNQr3N4YaN0UuEtHk`/glTF | Quaternius | CC0 1.0 | 3,224,724 | 1 skin, **38 joints** | **13** (same set) | 3,670 | **PRIMARY — antlers are a SEPARATE mesh (`Cube.001`), so they can be hidden and replaced by drill-horn geometry without touching the body** |
| `lancehorn/Ibex_Syl.glb` | [poly.pizza/m/a6kS-lGDqV4](https://poly.pizza/m/a6kS-lGDqV4) | Syl | CC-BY 3.0 | 151,132 | static, **13 separate meshes** (part-split) | — | 1,520 | exact ibex silhouette; use as the ribbed-horn geometry donor for the swap above |

### Charger — ram

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `charger/Sheep_Quaternius_animated.glb` | [poly.pizza/m/rgJXF570ZK](https://poly.pizza/m/rgJXF570ZK) | Quaternius | CC0 1.0 | 223,324 | 1 skin, **16 joints** | **8**: `Death, Headbutt, Idle, Idle_Eating, Jump_Loop, Jump_Start, Run, Walk` (names are triple-prefixed `AnimalArmature\|AnimalArmature\|AnimalArmature\|…` — strip on load) | 2,528 | **PRIMARY — `Headbutt` is the Charger's signature ram attack** |
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
| `shell-walker/Spider_Quaternius.glb` | [poly.pizza/m/yRYJiAJyiM](https://poly.pizza/m/yRYJiAJyiM) | Quaternius | CC0 1.0 | 449,008 | 1 skin, **39 joints** (8 legs) | **5**: `Spider_Attack, _Death, _Idle, _Jump, _Walk` | 2,712 | **PRIMARY leg chassis** — hide 2 leg chains → hexapod crab walk, already animated |
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
| `stalker/Wolf_Quaternius_animated.glb` | [poly.pizza/m/XU7oNeKShV](https://poly.pizza/m/XU7oNeKShV) | Quaternius | CC0 1.0 | 253,068 | 1 skin, **16 joints** | **8**: `Death, Headbutt, Idle, Idle_Eating, Jump_Loop, Jump_Start, Run, Walk` | 2,740 | compact 253 KB alt of the same animal |

### Bellowback — giant frog/turtle with a cargo sac

| File | Source URL | Author | License | Bytes | Rig | Clips | Tris | Fit |
|---|---|---|---|---|---|---|---|---|
| `bellowback/Frog_Quaternius.glb` | [poly.pizza/m/37wofOCOzG](https://poly.pizza/m/37wofOCOzG) | Quaternius | CC0 1.0 | 379,892 | 1 skin, **43 joints** | **14**: `Death, Duck, HitReact, Idle, Jump, Jump_Idle, Jump_Land, No, Punch, Run, Walk, Wave, Weapon, Yes` (prefixed `CharacterArmature\|`) | 5,016 | **PRIMARY — the Bellowback's animal, and `Jump`/`Jump_Land` give the hop-lurch gait for free** |
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
