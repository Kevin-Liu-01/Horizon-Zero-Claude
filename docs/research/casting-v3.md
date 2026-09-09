# Machine Variety Wave — Casting & Spawn Plan (Round 3)

Maps staged models (models-staging/MANIFEST.md) onto the roster (docs/research/roster-v2.md).
The variety builder reads this + the autorig/gait framework the machines lane ships.

## Casting table

| New species | Model | Source/license | Rigged? | Role |
|---|---|---|---|---|
| **Strider** | MechanicalHorse.glb | Poly Pizza, jake young, CC-BY 3.0 | static → autorig | T1 herd acquisition, Blaze canister between haunches, flees on alarm |
| **Scrapper** | Robocat.glb | Poly Pizza, Jordan Hill, CC-BY 3.0 | static → autorig | T1 pack (hyena role), radar dish part, power cell, laser burst |
| **Glinthawk** | RobotEnemyFlying.glb | Poly Pizza, Quaternius, CC0 | RIGGED, 6 clips (Attack/Shoot/Dead…) | T2 flyer flock; freeze sac chest part; AnimationMixer clips + procedural hover |
| **Longleg** | Birb.glb (ultimatemonsters) | Quaternius, CC0 | rigged+animated | T2 biped recon; concussion sacs, alarm antenna |
| **Grazer-lite** | Cat.glb or Dog.glb (ultimatemonsters) | Quaternius, CC0 | rigged+animated | T1 herd filler with dorsal Blaze canisters (2-row) |
| (reserve) Thunderjaw-lite | Dino.glb (ultimatemonsters) | Quaternius, CC0 | rigged+animated | only if the real thunderjaw autorig disappoints |
| (reserve) Stormbird-lite | Dragon_Evolved.glb | Quaternius, CC0 | rigged+animated | stretch goal, solitary high-tier flyer |

Style pass required per model (in-engine, at load): machine materials — desaturate base albedo
toward white-grey chassis, add dark "muscle" tone on undersides, ONE emissive eye/sensor strip
wired to the machine eye-state color system (blue/yellow/red), metalness/roughness clamps like
machine.js does. CC-BY attributions already drafted in models-staging/MANIFEST.md → surface in
README credits section.

## Spawn/behavior plan (uses roster-v2.md doctrine)

- **Strider herd ×6** in the west meadow across the river: graze heads-down patrol loop,
  2-Watcher escort walking a circuit; on alarm the herd flees along the herd vector, ONE
  rearguard turns to fight (charge 15–50m, kicks up close).
- **Scrapper pack ×3** around the rusted-hull ruin (135,-35): loping patrol, radar scan pause
  every ~20s; pack flanking on attack; power-cell shock detonation.
- **Glinthawk flock ×3** circling above the riverbed pools: soar loops with sine altitude,
  sequential dive attacks (screech telegraph), freeze-spit lob; one Burn drops them (crit fall).
- **Longleg ×2** on the SE rocky shelf: strut patrol, echolocation ping pause, stun-scream +
  jet-blast melee; alarm antenna part (torn = can't summon).
- Existing roster (Watcher ×4, Sawtooth ×2, Behemoth, Thunderjaw) keeps its territory; new
  spawns must respect machines/index.js separation + camp/paths keep-outs and terrain
  getHeight sanity at spawn points.

## Contracts that bind the variety builder

- Machine contract (SPEC.md ~154-169): kind/root/position/alive/health/state/displayName/
  takeDamage + userData.machine on all meshes.
- Parts contract (SPEC.md ~270): parts[] with tearHp/weak/elemental/linkedAttack/loot.
- Events are law; reuse 'machine-alerted'/'machine-attack'/'machine-telegraph'.
- Eye-state color via the existing EYE_COLORS system.
- debugFeet() on every walking machine (gate A6).
- LOD: >250m skip discipline; instancing/material sharing; no per-frame allocs.
- Herd/alarm doctrine per roster-v2.md §2 (recon alarms pull combat units; acquisition flees).
