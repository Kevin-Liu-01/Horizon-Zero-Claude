# ROUND 4 — AUDIT & OVERHAUL PLAN

12 subsystem auditors filmed the game, measured it with page-context probes, and had every
finding independently verified against source. **211 findings survived: 19 blockers, 84 majors,
108 minors.** This document is the Round 4 contract: what to fix, who owns which file, in what
order, and the literal gates that close each lane.

The verdict in one line: *the systems are real and the code is good; the game is not.* Aloy has
no spear, no jump and no collision; machines cheat perception, never move between attacks, and
five of eight are the wrong creature; the ground is untextured plastic under ambient light that
outshines the sun; and aiming at a Thunderjaw drops the frame rate to 4 fps.

---

## 1. EXECUTIVE VERDICT — the 10 changes that most move us toward HZD

Ranked by impact ÷ effort. Lane ids refer to §3.

| # | Change | Effort | Lane(s) | Why it is here |
|---|---|---|---|---|
| 1 | **Perception truth**: kill the omniscient chase, the 4.9 m proximity bubble, the exact-position alarm, the instant fill; add occluders + noise stimuli | M | `machine-ai` | Restores the entire stealth pillar from 5 files' worth of line edits. `stealth-hidden-radius`, `stealth-omniscient-pursuit`, `machine-ai-03/04/05/06/12` — three blockers for the price of one lane |
| 2 | **Lighting, post, AA**: CSM + direct/ambient rebalance + GTAO + grade + MSAA + real aerial fog | M | `core-platform`, `world-light` | Changes literally every frame. Ambient (1.9) currently beats the sun (1.2) and the composer renders with `samples=0`, so nothing is anti-aliased. `world-01/02/03/05` |
| 3 | **Impact pass**: re-nock delay, honest arrow drop, machine flinch/stagger, hitstop on every hit, reticle confirm, scaled numbers/sparks | M | `combat`, `machine-ai` | Every arrow currently lands with a 14 px number and no reaction. `combat-no-nock-delay`, `-arrow-drop`, `-hit-feedback-faint`, `-machine-no-flinch`, `machine-ai-10` |
| 4 | **The spear**: light/heavy melee, Silent Strike, Critical Hit | L | `combat` | LMB outside aim is dead input. Blocker in 4 independent audits; it is the payoff the stealth grass and shock-stun already exist to set up |
| 5 | **Physics & traversal**: BVH hit hulls, static collision world, capsule + gravity + jump + slope, camera whiskers | L | `spatial`, `player-control` | Fixes the 4 fps aim hitch AND walking through every trunk, tent and machine AND the camera clipping into terrain. `perf-tech-01/13`, `camera-feel-01/03/09` |
| 6 | **Machine life**: combat locomotion (circle/strafe/close), scored attack tables, stagger, planted windups, sockets, skate, corpse grounding | L | `machine-ai`, `machine-rig` | Machines are statues between attacks (Thunderjaw idle 62 %, 0.00 m displacement over 16 s) with eyes floating 0.42 m off the head. `machine-ai-02/08/09`, `machine-rig-02/03/05` |
| 7 | **Aloy completion**: all 271 `dyn_` chains springing, cheek anchor, hit/jump/interact clips, bow carry, look-at | M | `player-anim` | The ponytail is a rigid rod, the draw hand sits 0.28 m in front of her face, hit reactions are invisible on film. `player-anim-05/07/09/10/14` |
| 8 | **Shell spine**: victory soft-lock, death stakes, tabbed pause hub, world map, save/continue, settings, tutorial cards | L | `shell-menus`, `shell-hud`, `progression` | Winning the game requires a page reload. There is no map, no save, no sensitivity slider, and nothing teaches a single mechanic. `ui-01/02/13`, `progression-003`, `onboarding-loop-no-tutorial-hunt` |
| 9 | **World material & scale**: terrain PBR triplanar + cliff meshes, grass cards with displacement, tree LOD/impostors, lit rim | XL | `world-ground`, `world-props` | This is what "looks as good as the real game" literally means. `world-06/07/08/09` are all blockers and all art-pipeline work |
| 10 | **Audio hybrid**: sample bank + 3D panner + per-species creature voices + adaptive score (+ VO decision) | XL | `audio` | Eight species share two synthesized roars, Aloy is mute, and the score is a 55 Hz drone with random plucks. Blocked on decision **D2** |

Just below the line, and cheap: `combat-frame-loop-unguarded` (one exception kills the render
loop forever — 6 lines, do it in Wave 0), `combat-concentration-sprint-edge` (sprint-into-aim
burns the Concentration gauge — 4 lines), `strider-07` (herd doctrine is a one-shot dead flag).

---

## 2. FULL RANKED GAP LIST

Severity **B**locker / **M**ajor / **m**inor. Effort S/M/L/XL. Ids are unchanged from the audits;
the grouped rows carry the prefix.

| id | S | E | lane | fix |
|---|---|---|---|---|
| **player-anim (`player-anim-*`)** | | | | |
| 05-secondary-motion | M | M | player-anim | Verlet all 271 `dyn_` chains + foot-strike impulses |
| 07-draw-anchor-off-face | M | S | player-anim | Cheek anchor; bow elbow 165–172°; capsule (not sphere) head guard |
| 09-hit-react | M | M | player-anim | `Hit_Chest/Head` additive + stagger/knockdown class |
| 10-missing-traversal-and-interaction-set | M | XL | player-anim, player-control | Jump/land/interact/pickup clips + locomotion state machine |
| 06-twist-bones-undriven | m | S | player-anim | Swing-twist decomposition onto the 26 twist joints |
| 08-crouch-stalk | m | M | player-anim, combat | Bow-in-left-hand carry while crouched; crouch 1.4 m/s |
| 12-idle-sway-amplitude | m | S | player-anim | Shift 3–4 cm on a 6–12 s timer (or Idle_Loop + fidgets) |
| 13-no-lookat-or-face | m | S | player-anim | Neck/head/eye look-at IK + blink timer |
| 14-bow-carry-state | m | S | combat, player-anim | `combat.weaponDrawn` 8 s + damped left-arm swing |
| 15-speed-and-turn-model | m | S | player-control | Jog 4.6→5, sprint 8.2→6.5, speed→turn curve, 0.1 s latch |
| 16-head-bob | m | S | player-anim | Counter 50–70 % of pelvis bob through the spine |
| 17-studio-cannot-film-hit-death | m | S | studio | Allow `takeDamage` in `studio` state + pose trigger panel |
| **combat (`combat-*`)** | | | | |
| melee-missing | B | XL | combat | `src/combat/melee.js`: light/heavy spear, Silent Strike, Critical Hit |
| roster-missing | M | XL | combat | Ropecaster + Tripcaster first (canon minimum); Rattler/sticky last |
| arrow-drop-autocompensated | M | S | combat | Delete the gravity loft term; magnet 1.15 m → 0 for mouse |
| no-nock-delay | M | S | combat | Per-weapon `nockTime` (hunter 0.42 s) gating the next draw |
| concentration-sprint-edge | M | S | combat | Edge off the Shift keydown *while already aiming* |
| concentration-presentation | M | M | combat, shell-hud | Desaturate + cool tint + vignette on `concentration-start` |
| hit-feedback-faint | M | M | combat, shell-hud | Scale sparks/numbers with impact; reticle tick; hitstop on every hit |
| machine-no-flinch | M | M | machine-ai | `_react` impulse + stagger state on tear / >12 % maxHP |
| elemental-no-tier-scaling | M | S | machine-ai | Per-kind `elemThreshold` (watcher 60 … thunderjaw 520) |
| bow-stowed-in-combat | M | M | combat | `wielded` flag + 8 s holster timer + left-hand low carry |
| tap-fire-cancelled | m | S | combat | Loose at any `drawStrength > 0.02` |
| blaze-canister-unreachable-frontal | m | S | machine-rig | Raise canister proud of the hull; 0.35 m proximity credit |
| tearblast-canon | m | S | combat | 0.8 s latch fuse, cap 3 parts, pure tear = silent |
| burst-vfx-blob | m | M | combat | Layered fireball + smoke + shrapnel + scorch decal |
| weapon-models-neon | m | M | combat | Wood/leather/bone bows; turret launcher; Sharpshot FOV 28–30 |
| dodge-iframes | m | S | player-control | Roll 0.75 s, i-frames only 0.12–0.40 s, cancelable at 0.55 |
| wheel-canon-gaps | m | S | combat | Ammo petals by angle; hold-R craft with radial fill; stats row |
| frame-loop-unguarded | m | S | core-platform | try/catch per system update + null-guard machine routes |
| **machine-ai (`machine-ai-*`)** | | | | |
| 01 obstacle avoidance | B | L | spatial, machine-ai | 2 m navgrid from prop/veg/water/slope + local whisker steering |
| 02 statues between attacks | B | M | machine-ai | Engage layer: orbit/strafe/retreat/close per species |
| 03 any-hit omniscient reveal | B | M | machine-ai | Unseen hit → suspicion 0.7 at shot origin, not exact position |
| 04 LOS ignores props | M | M | machine-ai, spatial | Occluder list (trunk capsules, rock/ruin spheres) in `_hasLOS` |
| 05 instant detection | M | S | machine-ai | Fill = f(dist²)·pose·motion; 3–4 s to red at 30 m still |
| 06 alarm hands exact position | M | M | machine-ai | Converge on the *caller*; escalate only on own detection |
| 07 herd doctrine one-shot | M | S | machine-ai | Reset `h.alarmed`; re-pick rearguard among the living |
| 08 fixed attack ladder | M | L | machine-ai | Scored attack table + the missing canon moves + miss recovery |
| 09 windups gallop in place | M | S | machine-ai, machine-rig | Damp `_speed` per attack phase; gait trusts measured displacement |
| 10 no stagger/knockdown/crit | M | L | machine-ai, machine-rig | `stagger`/`downed` pose channels + Critical Hit prompt |
| 11 shallow search | M | M | machine-ai | 12–20 s sweep of grass/cover points around lastKnown |
| 12 no noise stimuli | M | M | machine-ai | `machines.noise({pos,radius,strength,kind})` + emitters |
| 13 body-centre hit volumes | M | M | machine-ai, machine-rig | Bone-anchored capsules; tail sweep = rear 200° arc |
| 14 no ecosystem behaviour | M | L | machine-ai | Escort follow-formation; scavengers on corpses |
| 15 scrapper parks at 7 m | m | S | machine-ai | Token lunger darts to claw range, others hold the flank |
| 16 unreadable AoE telegraphs | m | S | machine-rig | 3–5 large boulders in a field shell; taller quake wall |
| 17 uniform death | m | M | machine-rig | Per-class stagger→buckle→collapse; drop the cyan pillar |
| 18 hard 70 m leash | m | S | machine-ai | Soft leash 150 m; never disable perception by position |
| 19 TJ canon slips | m | S | machine-ai | Laser at any HP; radar = omnidirectional 34 m while attached |
| **machine-rig (`machine-rig-*`)** | | | | |
| 01 five wrong silhouettes | B | XL | machine-rig | Plate-shell kitbash on Sawtooth/TJ; new Scrapper/Longleg/Glinthawk (see **D3**) |
| 02 floating parts & eyes | B | M | machine-rig | Bone-space sockets + bind-pose proxy snap; assert ≤0.1 m alive AND dead |
| 03 planted feet skate 0.2–1.5 m | B | L | machine-rig | Reach-aware plants, early swing at `dMax`, pivot-relative turn steps |
| 04 feet float/sink | M | M | machine-rig | Per-foot height+normal conform; contact flags for clip walkers |
| 05 corpses 2.35 m underground | M | L | machine-rig | Ground-contact death solve + mass-scaled dust/shake |
| 06 3 Hz scrambling gaits | M | M | machine-rig | Cadence tables vs body length; real suspension window |
| 07 no hit/elemental poses | M | M | machine-rig | `hit`/`stagger`/`kneel`/`shiver` pose channels |
| 08 attacks are body transforms | M | L | machine-rig | Author limb keyframes per attack (paw, head-down, launcher elevate) |
| 09 missing canon move-sets | M | L | machine-rig, machine-ai | Implement the documented tables with real poses |
| 10 rail turning | M | M | machine-rig | Stepped pivot, speed-scaled bank, look-ahead head yaw |
| 11 no idle life | M | M | machine-rig | Per-species fidget library + spring chains on cables/antennae |
| 12 no plate/muscle material | M | L | machine-rig | Lacquer/muscle/sensor materials, edge wear, tearable plate shells |
| 13 limp is a speed tweak | m | S | machine-rig | `limpLeg` channel: held paw, asymmetric duty, head droop |
| 14 behemoth component layout | m | S | machine-rig | Six force loaders, clamped cargo, neck power cell |
| 15 tear leaves no wound | m | S | machine-rig | Socket recess + cable stubs; slower, hull-normal launch |
| 16 glinthawk downed/death poses | m | S | machine-rig | Authored splayed downed pose; mixer-time (not `setTimeout`) restore |
| 17 frozen beyond 250 m | m | S | machine-rig | Phase-only cheap gait to ~500 m for tall machines |
| 18 gates too narrow | m | S | core-platform | Per-species skate/socket/corpse/cadence gates |
| 19 studio freeze overwritten | m | S | studio | Single timeScale authority: studio > wheel > hitstop > concentration |
| **world (`world-*`)** | | | | |
| 01 flat lighting, no cascades | B | M | world-light | Sun 4.5 / hemi 0.35; 3-cascade CSM; grass+bush casters |
| 06 720 m bowl, 30–94 m "mountains" | B | XL | world-ground | Lit high-relief rim ring 150–350 m + far lit heightfields + real edge |
| 07 untextured plastic terrain | B | L | world-ground | Triplanar PBR splat at two scales + cliff rock meshes + scree |
| 08 sparse grass, bald past 110 m | B | L | world-ground | Grass cards, 4–6× coverage, mid tier to 220 m, actor displacers |
| 09 cone-stack toy trees | B | XL | world-ground | Branch-card trees, 3 LODs + impostors, 1200–1800 trees |
| 02 no anti-aliasing | M | S | core-platform | `samples: 4` on the composer target + SMAA |
| 03 bloom-only post | M | M | core-platform | GTAO + filmic grade + vignette + gated DoF |
| 04 milky sky, hard god-ray streak | M | L | world-light | Deeper gradient, tight HDR sun, screen-space shafts, cloud shadows |
| 05 no aerial perspective | M | M | world-light | Height + distance fog with sun in-scatter; re-light the ridges |
| 10 static reflection-less puddles | M | L | world-ground | Flowing river ribbon, refraction, sky reflection, shore foam |
| 11 5 m ruins, no landmarks | M | XL | world-props | 25–60 m megastructures, Tallneck, 12–15 m lookout |
| 12 2-tent camp, 1 static NPC | M | L | world-props | Palisade, 6 huts, braziers, 4–6 idling NPCs, campfire rest |
| 13 no time of day | M | M | world-light | Daylight controller + night sky + campfire "rest" (see **D6**) |
| 14 no weather | M | L | world-light | Clear/overcast/rain/storm states + wetness uniform + gusts |
| 15 no wildlife | M | M | world-props | 3 instanced species with flee AI, lootable |
| 16 heightfield-only, no verticality | M | XL | spatial, world-props | Cliff/arch/cave collision meshes + climbable ledge data |
| 17 10 m path smears, no clutter | m | M | world-ground | Narrow to 0.9/2.2 m, ruts, litter ring, machine track decals |
| 18 flowers are floating squares | m | S | world-ground | Stemmed 3–5 head clusters, butterflies, machine dust puffs |
| **ui (`ui-*`)** | | | | |
| 01 pause = one Resume button | B | L | shell-menus | Tabbed hub: Map/Quests/Inventory/Crafting/Skills/Notebook/Settings |
| 02 no Map screen | B | L | shell-menus | Baked terrain canvas, site glyphs, fog of war, click waypoint |
| 13 death 0.7 s, victory soft-locks | B | S | shell-menus | Victory = 3 s banner → resume; death = hold-for-input with options |
| 03 no XP/level/skills | M | XL | progression | `progression.js` + level pip + XP bar + 3 trees |
| 04 compass is a radar | M | S | shell-hud | Pip only for Focus-tagged or quest-target machines |
| 05 quest tracker top-right, no banners | M | M | shell-hud | Move under vitals, dynamic-hide, centre banners, quest log |
| 06 boss-bar machine health | M | M | shell-hud | Project per engaged machine (cap 3); backing plate; rings beside |
| 07 hairline health bar | M | S | shell-hud | Red 4-segment bar, HP numerals, pouch pips, H-reveal |
| 08 text-only weapon widget | M | M | shell-hud | Weapon silhouettes, mod dots, bracket reticle, drop the legend |
| 09 wheel lacks art/arcs/stats | M | M | combat | Offset right, weapon art, ammo arcs on hover, stat bars |
| 10 shallow Focus scan | M | M | focus-items | Component rows + part labels, LOOT/datapoint reveals, lighter tint |
| 11 no tool quick-slots | M | M | shell-hud, focus-items | Bottom-left strip: potion/rock/trap, F use, cycle chevrons |
| 12 no stealth meter | M | S | shell-hud | Eye indicator under the compass, closed when hidden in grass |
| 14 modal inventory, no crafting | M | M | focus-items | Full-screen pockets, rarity, descriptions, capacities, Crafting tab |
| 15 fixed 8–10 px labels | m | S | shell-hud | `--hud-scale: clamp(...)`, floor at 11 px, Settings entry |
| 16 screen-fixed prompt/loot | m | S | shell-hud, focus-items | Project to the interactable; Take-All action |
| 17 no tutorial cards | m | S | shell-hud | One-shot contextual card queue with kbd glyphs |
| 18 title = 1 button + keybind wall | m | M | shell-menus | Press-any-key → vertical menu; manual behind Field Manual |
| 19 no Concentration treatment; kill feed | m | S | shell-hud | Conc veil; delete kill feed for `+XP` pops |
| **audio (`audio-*`)** | | | | |
| 16 100 % procedural ceiling | B | L | audio | Lift `SPEC.md:82`; add OGG SampleBank + license manifest (**D2**) |
| 01 no composed score | B | XL | audio | Adaptive stems + bar-quantized transitions + stingers |
| 02 two roars for eight species | B | XL | audio | Per-species voice banks + spatialized idle/servo loops |
| 03 Aloy is mute | B | L | audio | Effort/hurt/death/breath VO + bark system (**D2**) |
| 04 one-surface footsteps | M | M | audio, world-ground | `terrain.surfaceAt()` + per-surface sets + gear foley |
| 05 2D pan, weak falloff | M | M | audio | PannerNode + distance LP + reverb send + occlusion |
| 06 death is one explosion | M | M | audio, machine-rig | Power-down + collapse impacts + loot-beacon loop |
| 07 7 of 8 species silent walkers | M | S | audio, machine-rig | Emit `machine-footfall` from `GaitController._footfall` |
| 08 suspicion/scan silent | M | M | audio, machine-ai | `machine-state` + `machine-scan` events + warble/ping loops |
| 10 no hit ladder or status loops | M | M | audio | Plink/thunk/crunch/crit + burn/shock/frost loops |
| 11 static ambience bed | M | M | audio | Zone emitters (fire, water) + biome beds + distant calls |
| 13 one bow release for three bows | M | M | audio | Per-weapon sets, nock/re-nock, empty click, arrow flyby |
| 15 TJ attacks = one roar | M | M | audio, machine-ai | `machine-attack-phase` + per-projectile events |
| 09 Concentration muffles music only | m | S | audio | World bus LP; drop the heartbeat; Focus sweep tracks the ring |
| 12 silent menus | m | S | audio, shell-hud | UI event set on a UI bus |
| 14 no priority/ducking/volumes | m | S | audio, shell-menus | Voice priority + sidechain duck + persisted sliders |
| **progression (`progression-*`)** | | | | |
| 001 no XP/levels/skills | B | XL | progression | Curve, level-up banner, +HP, 3 trees wired to real hooks |
| 003 victory ends the session; no respawn; no save | B | L | progression, shell-menus | Banner→resume, MachineSite respawn, `save.js` + Continue |
| 002 quests = a kill counter | M | XL | progression | Data-driven quest registry, objective types, markers, log |
| 004 no merchants, shards not currency | M | L | progression, focus-items | Camp TRADE panel; buy/sell against the valuables that exist |
| 005 whole arsenal at spawn | M | L | combat, progression | Tiers gate ammo types; mods/coils; outfits (**D7**) |
| 009 no side content | M | XL | world-props, progression | Datapoints → Hunting Ground → override node → crates |
| 006 no capacities/crafting screen | m | M | focus-items | Caps + Crafting tab + capacity upgrades |
| 010 loot tables off canon | m | S | machine-rig | Species lens 25 % / heart 12 %; cores; braidings; harvest arrow |
| 011 one herb, flat +25 | m | S | focus-items | Three herb variants with distinct values and colours |
| 012 kill feed instead of +XP | m | S | shell-hud | XP from `machine.level`; small `+XP` pop |
| 014 no title menu/difficulty | m | M | shell-menus | Continue/New/Settings/Credits + difficulty multipliers |
| 019 death has no consequence | m | S | progression | Reload the checkpoint; no free pouch refill |
| *cross-refs* | | | | `008 no menu hub or map`→`ui-01`/`ui-02`; `007 no wildlife/potions/tools`→`world-15` + tools strip; `015 no tutorial cards`→`ui-17`. |
| **camera-feel (`camera-feel-*`)** | | | | |
| 01 no jump/climb/gravity | B | XL | player-control | Kinematic capsule, gravity −22, jump 1.5 m, mantle, vault |
| 03 camera has no world collision | B | L | player-control, spatial | 12-sample boom sweep + cylinder/sphere colliders + fade |
| 09 player has no collision | B | M | player-control, spatial | Capsule vs trees/rocks/props; machines push the player, not vice versa |
| 02 no slope handling | M | M | player-control | Tangent-plane velocity, speed × grade, slide above 50° |
| 04 aiming cancels crouch | M | S | player-control | Crouch is a toggle and survives aiming; crouch-aim pose |
| 05 dodge fully invulnerable | M | M | player-control | i-frames 0.12–0.40 s, 0.25 s buffer, chain, late cancel |
| 06 pitch tops out at 19° | M | S | player-control | Widen clamp; shorten the boom instead of raising it |
| 07 framing too far/high, no sprint FOV | M | S | player-control | camDist 3.0, pivot 1.45, sprint FOV 60 + bob |
| 08 zero camera smoothing | M | S | player-control | Damp pivot/shoulder; critically-damped spring; noise shake |
| 12 invisible wall at r=330 | M | S | player-control, world-ground | Steer + speed taper + prompt; raise the rim to a real face |
| 13 no options, no gamepad | M | M | player-control, shell-menus | Settings-driven sensitivity/invert/FOV + Gamepad API |
| 10 no swim/wade | m | M | player-control | Wade slowdown + splash; deepen one pool or drop swim |
| 11 no fall damage | m | S | player-control | >4 m damages, >9 m kills, hard-landing anim |
| 14 flat turn rate, off-canon speeds | m | S | player-control | Speed→turn curve, input latch, sprint ratio 1.4 |
| 15 camera eases on scaled time | m | S | player-control | Pass real dt to every camera ease |
| 16 recoil permanently offsets aim | m | S | combat, player-control | Spring-back kick channel, never written into `camYaw/Pitch` |
| *cross-refs* | | | | `17 LMB does nothing unaimed`→`combat-melee-missing`. |
| **stealth (`stealth-*`)** | | | | |
| hidden-radius-and-proximity-bubble | B | S | machine-ai | Hidden ⇒ maxSee ≈1.6 m; delete the 360° close bubble |
| aim-cancels-crouch | B | M | player-control, player-anim | (= `camera-feel-04`) + crouch-aim pose and camera |
| omniscient-pursuit | M | M | machine-ai | Steer to `lastKnown`; unseen hits point at the shot origin |
| grass-visual-concealment | M | M | world-ground | 6–8 tufts/m² in stealth patches; align the 0.45 threshold |
| no-cover-on-routes | M | S | world-ground | Author grass discs from the spawn table into `tallGrassDensity` |
| lure-missing | m | S | machine-ai, combat | `machines.stimulus()` + whistle key |
| hearing-stimuli | m | S | machine-ai, combat | Route impacts/rolls/explosions through the stimulus API |
| crouch-input-and-speed | m | S | player-control | C toggles; 1.4 m/s stalk |
| grass-interaction | m | S | world-ground | `uActors[4]` bend + spring-back |
| awareness-indicator-fidelity | m | S | shell-hud | Show from suspicion > 0.04; 26 px; suspicious chirp |
| alarm-leaks-position | m | S | machine-ai | Recipients get the caller's position and `search` |
| focus-path-fidelity | m | S | focus-items | Spline the route; skip non-route movers |
| search-behaviour-shallow | m | S | machine-ai | (= `machine-ai-11`) + bump reveal |
| *cross-refs* | | | | `silent-strike-missing`→`combat-melee-missing`; `detection-too-fast`→`machine-ai-05`; `los-terrain-only`→`machine-ai-04`. |
| **perf-tech (`perf-tech-*`)** | | | | |
| 01 skinned raycasts → 4 fps | B | L | spatial, combat | three-mesh-bvh + per-bone hit hulls; one machine query/frame |
| 13 no collision world | B | XL | spatial | Static BVH collider set + capsule casts + spatial hash |
| 02 vacuous perf gate | M | S | core-platform | Accumulate per frame at DPR 2 after `varietyReady`; one budget file |
| 03 shadow pass is half the frame | M | M | world-light, core-platform | CSM 3×2048 + distance caster culling |
| 04 no LOD, culling disabled | M | L | machine-rig | Offline LOD chains + skinned bounds so culling can stay on |
| 05 nothing scales with DPR | M | M | core-platform | DPR cap 1.5, dynamic resolution, real quality tiers, F3 stats |
| 06 no AA | M | S | core-platform | (= `world-02`) |
| 08 corpses never despawn | M | M | machine-ai | MachineSite lifecycle: freeze, un-shadow, fade, dispose, respawn |
| 11 three bone conventions | M | L | anim-core | Shared `src/entities/anim`: BoneSpace/RestPose/ClipLayer/RigDebug |
| 12 contract debt, all uncommitted | M | M | core-platform | Commit+tag Round 3; SPEC v4 by module ownership (**D8**) |
| 14 assets over budget | M | M | machine-rig | Per-species tri budgets, KTX2, shared tinted materials |
| 07 per-particle materials | m | M | machine-rig | Route machine FX through the instanced pool |
| 09 0.3–0.7 s spawn hitches | m | M | machine-rig | Bake rigs + part sockets offline into the GLBs |
| 10 mid-fight shader compiles | m | S | core-platform | Warm-up group + `compileAsync` behind the loading bar |
| 15 spikes in src, stub test | m | S | core-platform | Move spikes to `labs/`, add `gates`/`measure` scripts + CI |
| 16 variable-dt sim | m | M | core-platform | 60 Hz accumulator with render interpolation (**D5**) |
| **missing-systems (`missing-systems-*`)** | | | | |
| override-mount | B | XL | machine-ai | `overridden` state + teal eye + Strider mount driving the gait |
| traps-ropecaster-tools | M | XL | combat | Ropecaster + Tripcaster; tools bar; (Rattler/sticky cut) |
| title-save-campfire-flow | M | L | shell-menus | (= `progression-003`) + campfire save/rest/fast-travel menu |
| npc-dialogue-quests-merchants | M | L | progression | Named camp hunter, dialogue panel, 3–4 side quests, trade |
| landmark-activities | M | XL | world-props | Tallneck → Hunting Ground → corrupted zone → bandit camp |
| focus-datapoints-tracks | m | M | focus-items, world-props | 12 datapoints + Notebook + Focus track polylines |
| photo-mode | m | M | studio | Promote Studio: poses, DoF, filters, frames, hide-Aloy |
| difficulty | m | S | progression | 6 presets scaling damage in/out, loot, gauge |
| accessibility | m | S | shell-menus | HUD scale, colourblind palettes, reduced motion, hold/toggle |
| *cross-refs* | | | | `melee-spear-silent-strike`→`combat-melee-missing`; `traversal-jump-climb-swim`→`camera-feel-01`; `day-night-weather`→`world-13` + `world-14`; `map-quest-log`→`ui-01`/`ui-02`; `xp-level-skill-tree`→`progression-001`; `settings-controller`→`camera-feel-13`; `outfits-mods-inventory-tabs`→`progression-005`; `stealth-meter-lure`→`ui-12` + `stealth-lure-missing`; `tutorials-notifications`→`ui-17`. |
| **onboarding-loop (`onboarding-loop-*`)** | | | | |
| no-tutorial-hunt | B | L | progression, shell-hud | "Lessons of the Valley" chain + event-driven contextual cards |
| title-screen | M | M | shell-menus | Scripted title dolly; single logo element; real menu |
| death-no-stakes | M | M | progression | Checkpoint + reload choice + killer name + fades |
| objective-guidance | M | S | shell-hud | Centre banners + in-world objective diamond with metres |
| first-kill-trivial | m | S | combat | Magnet to body centre only; drop `_pointBlankHit` |
| crafting-feedback | m | S | combat, shell-hud | Hold-R with fill + `ammo-crafted` toast + no-ammo hint |
| stealth-feedback | m | S | shell-hud | (= `ui-12`) + grass rustle cue |
| studio-cast-buttons | m | S | studio | `forceState`, close pause on enter, real dt, panel z-order |
| loot-feel | m | S | focus-items, player-anim | Rummage clip, source name, rarity frames |
| healing-readability | m | S | shell-hud | Pouch prompt + green pulse + hand-to-hip layer |
| *cross-refs* | | | | `victory-softlock`→`ui-13`; `detection-instant`→`machine-ai-05`; `no-melee-silent-strike`→`combat-melee-missing`; `pause-menu`→`ui-01`; `no-xp-progression`→`progression-001`; `props-no-collision`→`camera-feel-09`; `boot-fragility`→`combat-frame-loop-unguarded`. |

---

## 3. ROUND 4 IMPLEMENTATION PLAN — lanes, ownership, waves

### 3.1 Lane table (extends SPEC.md §"File ownership")

A builder edits **only** the files in its row. New files are allowed *only* inside its own
paths. Cross-lane needs go through published `ctx` APIs and events, never edits.

| lane | port | owns | headline deliverables |
|---|---|---|---|
| `core-platform` | 5201 | `src/main.js`, `src/core/engine.js`, `src/core/assets.js`, `tools/*`, `package.json`, `docs/SPEC.md` | Guarded frame loop, MSAA+SMAA, GTAO+grade, CSM plumbing, quality tiers + DRS + F3 stats, fixed-step accumulator, warm-up compile, real gates + `tools/budgets.mjs`, spikes→`labs/` |
| `spatial` | 5202 | `src/core/collision.js`, `src/core/nav.js`, `src/core/hitHulls.js` (all new) | three-mesh-bvh, static collider/occluder registry, capsule + segment casts, 2 m navgrid + flow field, per-bone hit hulls, uniform-grid spatial hash |
| `anim-core` | 5203 | `src/entities/anim/*` | `BoneSpace` (rotLocal/rotChar/rotWorld), `RestPose`, `ClipLayer` (timeScale-aware, dt-driven), `RigDebug`; retire the three conventions |
| `player-control` | 5204 | `src/entities/player.js` ⚠️, `src/core/input.js` ⚠️ | Capsule+gravity+jump+slope+fall+wade, dodge windows/buffer/chain, crouch toggle surviving aim, camera collision/smoothing/pitch/framing, settings-driven input, Gamepad API |
| `player-anim` | 5205 | `src/entities/playerAnimator.js` **+ (Wave 2, orchestrator grant) the Aloy-specific anim modules `src/entities/anim/locomotion.js`, `clipLibrary.js`, `boneMap.js`** — anim-core keeps the shared `boneSpace/restPose/clipLayer/rigDebug/registry` | All `dyn_` springs + foot-strike impulses, twist joints, cheek anchor + open bow arm, look-at + blink, head stabilisation, hit/jump/land/interact/loot clips, bow carry pose |
| `machine-ai` | 5206 | `src/entities/machines/machine.js`, `index.js`, `src/entities/machines/ai/*` (new) | Perception rewrite, stimulus bus, engage locomotion, scored attack tables, stagger/downed, search sweeps, alarm doctrine, override/mount state, MachineSite lifecycle, per-kind tuning tables |
| `machine-rig` | 5207 | `gait.js`, `autorig.js`, `parts.js`, `variety-assets.js`, all 8 species files, `public/models/*`, `tools/optimize.mjs`, `tools/bake-rigs.mjs` (new) | Silhouette/material pass, bone-space sockets, skate + conform + corpse grounding, cadence tables, attack limb poses, idle library + spring chains, LOD chains, offline rig/socket bake |
| `combat` | 5208 | `src/combat/*`, `src/ui/wheel.js/.css` | Spear + Silent Strike + Critical Hit, nock timing, honest ballistics, hit feedback + hitstop, wielded carry, Ropecaster/Tripcaster, tearblast fuse, burst VFX, craft-hold, wheel canon |
| `world-light` | 5209 | `src/world/environment.js` ⚠️ | Sun/ambient rebalance, CSM cascades, sky + HDR sun + light shafts, aerial + height fog, cloud shadows, day-night controller, weather states |
| `world-ground` | 5210 | `src/world/terrain.js` ⚠️, `vegetation.js` ⚠️, `water.js` | Triplanar PBR splat + cliff meshes, rim rebuild, grass cards + displacers + stealth discs, tree LOD/impostors, river + reflections, paths/litter, `surfaceAt()` |
| `world-props` | 5211 | `src/world/props.js`, `camp.js` ⚠️, `src/world/fauna.js` (new) | Megastructures + Tallneck + lookout, settlement build-out + NPC idles, wildlife, activity sites, collider/occluder registration |
| `focus-items` | 5212 | `src/ui/focus.js/.css`, `src/ui/inventory.js/.css`, `src/items/*` | Component list + part labels + datapoints + LOOT reveals, full-screen pockets + rarity + capacities + Crafting tab, tools/potions, merchant panel UI, loot rummage |
| `progression` | 5213 | `src/core/progression.js`, `src/core/save.js`, `src/ui/quests.js`, `src/ui/skills.js` (all new) | XP/level/skill trees, quest registry + objectives + rewards, tutorial chain data, save/checkpoint/continue, difficulty, merchant economy |
| `shell-hud` | 5214 | `src/ui/hud.js`, `hud.css`, `index.html` ⚠️ | Health/pouch restyle, weapon art, compass truth, projected machine bars, stealth meter, tools strip, XP bar, banners, tutorial cards, Concentration veil, HUD scale |
| `shell-menus` | 5215 | `src/ui/menu.js`, `map.js`, `settings.js`, `tips.js` (all new), `src/style.css` ⚠️ | Tabbed pause hub, world map + waypoints, title flow, death/victory, settings + accessibility, credits |
| `studio` | 5216 | `src/studio/*` | Photo mode promotion, pose/expression panel, DoF/filters/frames, `forceState` cast fixes, real dt, timeScale authority |

⚠️ = currently frozen; see §3.3.

### 3.2 Waves (dependency order)

**Wave 0 — foundation. Nothing else starts until these land.**
`core-platform` · `spatial` · `anim-core`
Rationale: the guarded frame loop and honest perf gate must exist before anyone can measure a
regression; BVH + colliders must exist before combat scaling, machine navigation or player
collision can be written; the shared bone-space API must exist before either animation lane
refactors. **Also in Wave 0: commit and tag Round 3 (`perf-tech-12`) — there is currently no
baseline to bisect from.**

**Wave 1 — systems on the foundation.**
`player-control` (needs `spatial`) · `machine-ai` (needs `spatial` nav/occluders) ·
`machine-rig` (needs `anim-core`; the offline bake unblocks LOD + spawn cost) ·
`world-light` (needs `core-platform` post stack) · `audio` pipeline half (needs **D2**)
Rationale: rig pipeline before animation polish; navgrid before AI steering; collision before
character controller; composer/CSM plumbing before lighting values.

**Wave 2 — content and feel on Wave 1.**
`player-anim` (needs `player-control` states + `anim-core`) · `combat` (needs `spatial` hulls +
`machine-ai` stagger hooks) · `world-ground` (needs `world-light` fog/shadow contract) ·
`world-props` (needs `spatial` registration API) · `focus-items` · `progression`

**Wave 3 — shell, onboarding, polish.**
`shell-hud` · `shell-menus` · `studio` · `audio` content half
Rationale: the HUD can only render XP, quests, stealth state and tool slots once `progression`,
`machine-ai` and `combat` publish them; the tutorial chain can only teach mechanics that exist.

### 3.3 Frozen files — unfreeze list

| file | unfrozen for | why |
|---|---|---|
| `src/main.js` | `core-platform` | Guarded update loop, fixed-step accumulator, system registration |
| `src/core/engine.js` | `core-platform` | Composer MSAA/AA/GTAO/grade, DPR + dynamic resolution, warm-up compile |
| `src/core/assets.js` | `core-platform` | Fold the duplicated variety loader in; KTX2; per-mesh shadow policy |
| `src/core/input.js` | `player-control` | Input buffer, rebinding, Gamepad API, sensitivity from settings |
| `src/entities/player.js` | `player-control` | The character controller *is* this file; 8 findings live here |
| `src/world/environment.js` | `world-light` | Lighting, sky, fog, day-night — the single largest visual lever |
| `src/world/terrain.js`, `vegetation.js` | `world-ground` | Terrain material, rim, grass. **API stays frozen**: `getHeight/getNormal/isInTallGrass/tallGrassDensity`, `WORLD_SIZE`, radius 330 — plus a new additive `surfaceAt(x,z)` |
| `src/world/camp.js` | `world-props` | Settlement build-out, NPC idles, campfire interactable |
| `index.html`, `src/style.css` | `shell-hud`, `shell-menus` | Title flow, menu shell, HUD scale variables |
| `docs/SPEC.md` | `core-platform` (+ `audio` for §Audio) | SPEC v4 by module ownership; the audio "no asset files" clause (**D2**) |

Everything else keeps its Round 2/3 owner. Two rules that make this safe:
1. **No lane edits another lane's file, ever.** If you need behaviour from another lane, request
   an API in your report; the orchestrator adds it to the contract.
2. **Tuning that crosses lanes lives in data.** Per-species attack ranges, elemental thresholds,
   HP, loot tables and detection rates all move into `src/entities/machines/ai/tables.js`
   (owned by `machine-ai`) so species files stay pure pose/mesh code.

---

## 4. GATE SPEC — the literal acceptance bar per lane

Same contract as `tools/gates.config.mjs`: **action** gates run JS in page context with
`__CTX__`/`__GAME__` and resolve `{ pass, detail }` (console error during a gate = FAIL;
missing API = `{ pass: null }` → PENDING). **Visual** gates capture a deterministic screenshot
via a `setup`+`settle` recipe and are judged against written criteria.

### core-platform
- **A20-frame-loop-survives** — `throw from a temp system for 3 frames; assert __CTX__.machines.list[0].position changed and rAF still running` → pass: sim advanced, error logged once.
- **A21-real-draw-calls** — `info.autoReset=false; reset each frame; accumulate 20 frames at DPR 2 after machines.varietyReady` → pass: `calls ≤ 350 && p95Frame ≤ 20ms` at spawn vista, west herd and a staged 8-machine fight.
- **A22-msaa** — `composer.renderTarget1.samples >= 4 && passes.some(p => /SMAA|TAA/.test(p.constructor.name))` → pass: both true.
- **V20-aa-crop** — shot: spawn vista, 4× nearest crop of a pine ridge. Pass: edges show intermediate pixels; FAIL on pure stair-steps (compare `shots/verify-perf-tech-aa-crop.png`).


> **Wave 0 outcome (orchestrator, Sep 9):** `A21-real-draw-calls` draw-call term is DEFERRED to
> `machine-rig` (Wave 1): graded 296 / 489 / **508** vs 350 at spawn / west-herd / staged fight, and
> **274 of 497** frozen draws in the fight are machine geometry (LOD chains + shared materials are the
> fix). The frame-time terms of A21/A23/A9 report PENDING until the host is quiet — a bare scene
> reads 32–104 ms p95 on this Mac with Adobe background services at 70–95 % CPU. `A22b-fov-recompile`
> added by `core-platform-followup`.

### spatial
- **A23-aim-cost** — `place player 25m from thunderjaw; hold RMB 3s; sample frame times` → pass: `p95 ≤ 20ms` (baseline 210 ms).
- **A24-player-blocked** — `sprint 12m into the nearest pine trunk` → pass: min distance to trunk axis `≥ 0.45m` and speed drops below 1 m/s at contact.
- **A25-machine-immovable** — `sprint into a Watcher with AI frozen for 3s` → pass: machine displacement `≤ 0.15m`, player displacement `≤ 0.4m` past contact.
- **V21-camera-cover** — shot: stand with a trunk exactly between camera and Aloy at 4 m. Pass: boom shortened, Aloy fully visible, no geometry through frame.

### anim-core
- **A26-one-convention** — `grep-equivalent: every rig module resolves rotations through anim/BoneSpace` asserted by `__CTX__.anim.audit()` → pass: 0 legacy `_rot` implementations registered.
- **A27-timescale-safe** — `set engine.timeScale 0.02 for 2s during a glinthawk one-shot` → pass: clip restores on mixer time, not wall clock; no action left stuck.

### player-control
- **A28-jump-arc** — `Space from flat ground` → pass: apex `1.35–1.7m`, airborne `0.55–0.9s`, lands within 0.1 m of terrain.
- **A29-slope-limit** — `sprint up the 56° face at (118,220)` → pass: speed `≤ 3 m/s`, |footY−ground| `≤ 0.12m` throughout.
- **A30-dodge-window** — `takeDamage(25) at dodgeK 0.05 / 0.25 / 0.65` → pass: hits 1 and 3 land, hit 2 is negated.
- **A31-crouch-aim** — `hold C, then RMB` → pass: `crouching === true && inTallGrass stealth still applies && camera pivot ≤ 1.2m`.
- **A32-look-up** — `max pitch while aiming` → pass: forward pitch `≥ 60°`; a Glinthawk at 10 m/16 m altitude is reticle-reachable.
- **V22-chase-framing** — shot: idle chase cam, side-by-side with `reference/run-back-2-walking.jpg`. Pass: Aloy fills ≥55 % of frame height, camera at head level, not looking down.

### player-anim
- **A33-hair-bounce** — `sample dyn_hairBackMain_04 world Y over 90 frames at sprint` → pass: peak-to-peak `≥ 0.04m`, oscillation locked to footfall cadence ±15 %.
- **A34-chains-driven** — `count dyn_ bones with local-quaternion range > 0.5° over 3s of jog` → pass: `≥ 180` of 271 (today: 8 chains / 30 bones at 0.2°).
- **A35-cheek-anchor** — `drawStrength 1.0 at camPitch −0.4 / 0 / 0.75` → pass: `|hand_r − head_0104| between 0.10 and 0.16m`, hand behind the face plane, bow-arm elbow `165–172°`, hand separation `≥ 0.45m`.
- **A36-hit-react-visible** — `emit player-damage {amount:14} at rest` → pass: pelvis→spine_03 lean `≥ 12°` peak, decay `> 0.45s`, dominant action switches to a hit slot.
- **V23-secondary-motion** — shot: sprint side view, 3-frame burst 80 ms apart. Pass: ponytail, quiver, pouches and skirt flaps in visibly different positions across the three; FAIL if the hair is a rigid cone.
- **V24-draw-vs-reference** — shot: full draw, side, zoomed; judged against `reference/draw-side.jpg`. Pass: knuckle at the cheek, fletching at the mouth corner, forearm in line with the arrow.

### machine-ai
- **A37-stealth-approach** — `crouch in tall grass, walk from 20m to 3m behind a patrolling Watcher over 15s` → pass: state never leaves `patrol/suspicious`, suspicion `< 0.3`.
- **A38-unseen-shot** — `hit a Watcher for 5 impact from 35m directly behind, out of its cone` → pass: state becomes `suspicious` or `search` (not `alert`/`attack`), `lastKnown` within 8 m of the *shot origin*, not of the player.
- **A39-detection-curve** — `stand still in cone at 30m` → pass: first `suspicious` `≥ 1.5s`, `alert` `≥ 3.0s`; at 10 m `alert ≤ 1.5s`.
- **A40-lost-contact** — `break LOS behind a boulder and crouch for 6s while a machine is in attack` → pass: it goes to `search`, walks to `lastKnown` (not to the player), and player distance grows.
- **A41-combat-motion** — `stage a Sawtooth duel at 8m for 25s` → pass: idle-statue samples `< 20%`, machine XZ displacement `> 25m`, `≥ 3` distinct attack ids used.
- **A42-stagger** — `tear a part off a Sawtooth mid-windup` → pass: current attack cancelled, `stagger` state `0.6–1.2s`, `machine-stagger` emitted.
- **A43-corpse-lifecycle** — `kill 8 machines, wait 130s at 90m` → pass: scene object growth `≤ +40`, dead machines' `update` cost `≈0`, site respawn scheduled.
- **V25-alarm-converge** — shot: Watcher alarms with the player hidden 50 m away; capture at +3 s. Pass: recipients moving toward the *caller*, eyes yellow not red.

### machine-rig
- **A44-socket-integrity** — `for every species: min distance from each part/eye anchor to nearest hull vertex, idle AND +2s after death` → pass: `≤ 0.10m` every case (today: TJ tail tip 1.50 m, Longleg sacs 1.51 m dead).
- **A45-no-skate-per-species** — `A13's stance-window probe, per species, at walk, run, and a 150° turn` → pass: drift `≤ 0.06m` in all three (today: 0.18–1.48 m).
- **A46-ground-truth** — `planted foot |y − terrain| across walk/run` → pass: `≤ 0.08m` max, per foot, per species.
- **A47-corpse-grounded** — `2.5s after death, lowest mesh vertex vs terrain` → pass: penetration `≤ 0.10m` (today: TJ 2.35 m).
- **A48-cadence** — `footfalls/s and airborne fraction at run` → pass: inside per-species band (sawtooth ≤ 2.0 cycles/s, airborne `> 0.08`).
- **V26-silhouette** — shot: side + front of each species at 12 m, plain sky. Pass: reads as its HZD machine against `docs/research/roster-v2.md` §3/§4 — Sawtooth has fangs and chest mass, TJ has a boxy head and horizontal tail, Scrapper is a quadruped, Longleg has stub wings, Glinthawk has wings at all.
- **V27-attack-pose** — shot: freeze each species mid-windup. Pass: limbs are doing the work (paw raised, head down, launchers elevated); FAIL if only the body transform changed.

### combat
- **A49-melee-exists** — `LMB with no aim, 1.5m from a Watcher` → pass: `melee-hit` emitted, machine HP drops.
- **A50-silent-strike** — `crouch behind an unaware Watcher at 2m` → pass: `interactables.current.label === 'SILENT STRIKE'`; executing it kills instantly and emits `silent-strike`.
- **A51-nock-gap** — `two consecutive full-draw hunter shots` → pass: interval `1.05–1.40s` (today: 0.714 s).
- **A52-arrow-drop** — `aim at a target 55m away, full draw, measure impact vs crosshair` → pass: impact lands `2.5–5m` BELOW the aim point (honest drop), and the launch vector is within 0.3° of the crosshair ray.
- **A53-conc-not-on-sprint** — `hold Shift+W to 8 m/s, then press RMB` → pass: `combat.concentration.active === false`, `engine.timeScale ≈ 1`.
- **A54-elemental-tiers** — `apply freeze until brittle on watcher / sawtooth / thunderjaw` → pass: `1–2 / 3–5 / 8–12` arrows respectively.
- **V28-impact** — shot: full-draw weak hit on a Sawtooth at 8 m, frozen +60 ms. Pass: bright spark burst ≥1/8 machine height, plate chips, reticle tick, damage number ≥18 px, machine visibly flinched.
- **V29-wielded-carry** — shot: jog toward an alert Sawtooth. Pass: bow low in the LEFT hand, left-arm swing damped; FAIL if it is on her back.

### world-light
- **A55-light-ratio** — `sample lit vs shadowed ground luminance under the watchtower` → pass: shadow `≤ 55%` of lit (today: 89 %).
- **A56-cascades** — `renderer shadow config` → pass: `≥3` cascades, near cascade texel `≤ 2cm/px`, casters culled beyond 120 m.
- **A57-aerial** — `fog transmittance at 300m` → pass: `0.55–0.70` (today: 0.957); rim geometry lit, not `MeshBasicMaterial`.
- **V30-golden-hour** — shot: spawn vista at t=17:30, all four yaws. Pass: long crisp directional shadows from tents/trees/machines, cool shade vs warm light, rim hazed ~40 % toward the horizon colour, sun a tight disc with corona.
- **V31-night** — shot: same vista at t=23:00. Pass: readable moonlit scene, machine eyes and campfire are the light sources, stars visible, no black mud.

### world-ground
- **A58-surface-api** — `terrain.surfaceAt() across river cobbles / path / shelf / meadow` → pass: 4 distinct values.
- **A59-grass-coverage** — `count grass instances within 20m of the player at 6 meadow points` → pass: `≥ 4 tufts/m²` near tier; stealth patches `≥ 6/m²`; visible ground fraction in a downward shot `< 25%`.
- **A60-stealth-lanes** — `for every machine route waypoint, sample tallGrassDensity along the polyline` → pass: every route has `≥ 25%` of its length above 0.45 (today: 8 of 16 routes at 0 %).
- **V32-ground-detail** — shot: crouched, camera 1.5 m above ground. Pass: visible grain/pebbles/soil variation and normal-mapped relief; FAIL if it reads as flat vertex colour.
- **V33-rim** — shot: from the camp toward the north rim. Pass: rim reads as an alpine wall with strata and talus, hazed, ≥150 m of relief; FAIL on a bald beige hump.

### world-props
- **A61-colliders-registered** — `ctx.collision.count()` → pass: every tree/rock/ruin/tent/tower instance registered; `≥ 800` colliders.
- **V34-midground** — shot: all four yaw vistas. Pass: every bearing has a man-made or landmark silhouette in the 150–300 m band.
- **V35-settlement** — shot: camp at dusk. Pass: palisade, ≥5 structures, lit braziers, ≥4 NPCs in distinct idle poses.

### focus-items
- **A62-focus-components** — `crosshair on a Sawtooth with Focus on` → pass: card lists named components with loot; hovering a part shows its name.
- **A63-loot-reveals** — `Focus on with a corpse and a crate in view` → pass: both glow and register LOOT labels.
- **V36-focus-scan** — shot: Focus active on a Sawtooth at 15 m. Pass: world keeps its colour under a ≤20 % violet vignette; components labelled yellow with names; patrol ribbon curved, not polygonal.

### progression
- **A64-xp-loop** — `kill a Watcher` → pass: `progression.xp` increases by `f(machine.level)`, HUD `+XP` pop, level-up at threshold grants a skill point and +HP.
- **A65-save-restore** — `save at campfire, kill 2 machines, reload the page, Continue` → pass: quest stage, inventory, ammo, player position and the alive-set match the save.
- **A66-quest-objectives** — `run the tutorial chain` → pass: each objective type (talk/goto/scan/kill/gather) completes on its real event; banners fire.
- **A67-machine-respawn** — `clear a site, advance 6 min of game time out of view` → pass: roster respawns.

### shell-hud / shell-menus
- **A68-no-softlock** — `emit victory` → pass: after 4 s `ctx.state === 'playing'`; Escape opens the pause hub; no reload needed.
- **A69-death-choice** — `kill the player` → pass: overlay waits for input, offers ≥2 options, grayscale ramp ran, no auto-respawn.
- **A70-hub-tabs** — `Escape, then M/J/I/O/K/N` → pass: each opens its tab; map click sets a waypoint that appears on the compass with metres.
- **A71-compass-truth** — `at spawn with 0 tags` → pass: visible machine pips `=== 0`; tagging one adds exactly one.
- **A72-settings-persist** — `set sensitivity 2×, invert Y, reload` → pass: values restored from localStorage and applied to `player`.
- **V37-hud-language** — shot: 40 % HP, aiming, machine engaged, tool slot populated. Pass: red 4-segment health with numerals + green pouch under it, projected machine bar above the machine, stealth eye, bottom-left tools strip, XP bar — all legible at 1600×900 and at 4K.
- **V38-title** — shot: title screen after settle. Pass: one logo, aerial vista in motion, vertical menu; FAIL on a double logo or a keybind wall.

### audio (all gates run headless with an offline analyser)
- **A73-sample-bank** — `audio.bank.size` → pass: `> 60` loaded buffers with a license entry each.
- **A74-3d** — `pan/gain for a source 20m front-right vs 20m back-right` → pass: measurably different; attenuation at 300 m `< 0.02`.
- **A75-species-voices** — `force each of the 8 species to attack` → pass: 8 distinct cue ids, each with a windup and a strike voice.
- **A76-footfalls** — `run each species 5s` → pass: `machine-footfall` fires for all 8; `terrain.surfaceAt` selects ≥3 distinct player footstep sets across the valley.
- **A77-music-states** — `calm → suspicious → combat → resolve` → pass: stem crossfades quantised to the bar; combat-start and resolve stingers fire once each.

### studio
- **A78-cast-states** — `cast panel sets Attack on a calm machine` → pass: state is still `attack` 1 s later.
- **A79-time-authority** — `freeze in studio while combat is active` → pass: `engine.timeScale === 0` for 2 s.

---

## 5. ARCHITECTURE DECISIONS NEEDED FROM THE OWNER

Each blocks a lane. Recommendation given; answer yes/no or pick a letter.

**D1 — Aloy animation: procedural, clips, or re-rig?** (a) keep extending the procedural stack;
(b) keep the existing 424-joint rig and extend the Round-3 clip base with more CC0/licensed sets;
(c) re-rig with Tripo3D's auto-rigger + motion presets.
→ **(b).** That rig is the best asset in the repo (271 `dyn_` chains, 26 twist, 43 face joints);
Tripo would swap it for a generic ~60-joint skeleton and lose all of it. (a) is disproven — the
file documents three rewrites of the arm swing and still reads as a leaning mannequin. Procedural
keeps only what clips can't do: crosshair-true nock IK, foot lock, look-at, springs, aim additive.
*Owner input on clip source:* Mixamo is royalty-free in shipped games but forbids redistributing
raw files (bake into our GLB); CMU BVH is unrestricted. **Approve Mixamo + CMU for
bow/traversal/melee sets?**

**D2 — Audio: keep "100 % procedural, no asset files" (`SPEC.md:82`), or go hybrid?** Four
blockers are unfixable under it: an adaptive score, eight distinct creature voices, any Aloy VO.
→ **Lift it.** Curated CC0 samples (freesound CC0, Kenney, OpenGameArt) for foley/creatures/
ambience/UI + a composed or licensed stem score; procedural stays where it is idiomatic (Focus
hologram, elemental zaps, UI blips). ~25–40 MB compressed + a license manifest.
**Approve hybrid? And is a voiced Aloy in scope** (VO session or licensed effort library), or do
we ship breath-only and accept the gap?

**D3 — Machine sculpts: kitbash, generate, or license?** Five of eight are the wrong creature
(cat mech, cartoon bird, chrome sphere, two see-through armatures). (a) procedural plate/muscle
shells over the existing sculpts; (b) Tripo3D image→mesh→auto-rig for new ones; (c) the Sketchfab
fan-made HZD bestiary (CC-BY-**NC**).
→ **(a) for Sawtooth/Thunderjaw/Behemoth** (autorig + gait already work there, so it is additive
geometry) **and (b) for Scrapper/Longleg/Glinthawk** (base meshes unsalvageable; a generic rig is
fine on non-player characters). (c) is a trap — NC blocks any commercial or ad-supported release.
**Will this game ever be public/commercial?** If never, (c) is the fastest path for all five.

**D4 — Physics: hand-rolled or Rapier?** → **Hand-rolled**: three-mesh-bvh for static queries + a
kinematic capsule + the existing debris integrators. Nothing needs a rigid-body solver, and
Rapier's WASM adds ~1 MB and a second clock beside our fixed step. Revisit for ropes/tripwires.

**D5 — Fixed-step sim: now or after the art passes?** → **Now, in Wave 0** (60 Hz accumulator +
render interpolation). Every current constant was tuned at whatever frame rate the machine hit,
and the game runs 4–60 fps; doing this after Wave 2 invalidates every gait, spring and dodge
number tuned in between.

**D6 — World scale: keep the 720 m bowl, or rebuild?** → **Keep it**, and spend the budget on
density, verticality and a real rim (lit 150–350 m relief ring, cliffs with collision, far lit
heightfields at 1.5–4 km). Chasing HZD's 8×8 km would eat Round 4 and yield an emptier world.
Related: **is day/night in scope?** Recommend yes for the cycle (M) and rain (L); cut snow.

**D7 — Progression depth: full RPG or vertical slice?** → **Slice**: XP + level + a 6–12 node
skill tree + save/continue + tutorial chain + one merchant. Defer outfits, mods/coils, rarity,
Cauldrons, bandit camps, Hunting Grounds. Skills and save change how it *plays*; mods only change
numbers on screens that don't exist yet.

**D8 — Contract model: keep "frozen files", or move to module ownership?** The frozen list already
cost us a duplicated asset pipeline (`variety-assets.js` copies `Assets._normalize` verbatim with
its own loader) and a 1.7 s window where `machines.spawn()` returns null.
→ **Replace it** with SPEC v4: one owner + a published API per module; the rule becomes "don't
edit another owner's file". Non-negotiable prerequisite: **commit and tag Round 3 before any
Round 4 edit** — the entire autorig, gait, four species and all Round 3 docs (38 files) are
currently untracked, so there is no baseline to branch or bisect from.

---

*Sources: 12 verified subsystem audits (211 findings), `shots/audit-*.png`, `shots/verify-*.png`,
`docs/research/{mechanics,machines,ui,roster-v2,reference-v3}.md`, `docs/ROUND3.md`,
`docs/ROUND4-CHARACTER{,-NOTES}.md`, `tools/gates.config.mjs`.*
