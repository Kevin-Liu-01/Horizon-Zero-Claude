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
