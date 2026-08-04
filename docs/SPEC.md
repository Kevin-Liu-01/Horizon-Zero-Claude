# HORIZON ZERO CLAUDE — Game Spec & Gauntlet Quality Bar

A third-person open-world robot-dinosaur hunting game in the browser (Three.js + Vite),
built from six Sketchfab GLB models. This document is the reference standard every
builder and critic measures against.

## The Gauntlet Reference (what "done" looks like)

Judge every screenshot against the look of **Horizon Zero Dawn** promotional stills:

- Golden-hour sunlight, warm haze in the distance, long soft shadows
- Rolling savanna terrain with dense swaying red-gold tall grass in patches
- Scattered pines/rocks, distant mountain silhouettes fading into atmospheric fog
- Sky: warm gradient near horizon, blue above, sun disc with bloom, drifting clouds
- Machines that read as *menacing wildlife*: patrolling, scanning with glowing eyes
- Clean minimal diegetic-feeling HUD: thin health bar, compass strip, arrow counter
- Focus mode: cool blue/purple scan pulse, machines highlighted through the world

If a subsystem looks like "a programmer demo" (flat lambert ground, static grass,
gray boxes, default fog, harsh point lights) it FAILS the gauntlet.

## World

- ~700×700 m valley. Heightfield terrain from layered simplex noise: rolling meadow
  center, hills at rim, impassable mountain ring. Terrain texture blends grass/dirt/rock
  by slope & height.
- Vegetation: GPU-instanced tall grass (wind-swaying shader, tens of thousands of
  blades), pine trees, rocks. Tall red grass patches = stealth cover.
- A small hunter camp with campfire (respawn point) and the static NPC model.
- Day ambience fixed at golden hour.

## Player — Aloy (rigged Fortnite model, procedurally animated)

- Third-person camera: over-shoulder, orbit with mouse (pointer lock), collision with terrain.
- WASD move (camera-relative), Shift sprint, C crouch (stealth in tall grass), Space roll/dodge.
- Right-mouse: aim — camera zooms over shoulder, drawing arrow, slight slow-mo while airborne of arrow draw.
- Left-mouse (while aiming): draw & release arrow. Draw time scales damage/speed.
- 1/2/3: arrow types — Hunter (normal), Fire (burn DoT), Shock (stun).
- R: Focus pulse — 3s scan: machines outlined through occlusion, patrol paths shown.
- F: use medicine (heal over time), limited pouches.
- Health; on death, fade to death screen, respawn at campfire.
- Procedural skeleton animation: idle breathe, walk/run/sprint cycles with arm swing,
  crouch pose, bow-draw upper-body pose blended over locomotion, hit react. Cloth/hair
  dyn_ bones get simple spring secondary motion.

## Machines

All machines: state machine (PATROL → SUSPICIOUS → ALERT → ATTACK → SEARCH → RETURN),
sight cone + hearing radius (crouch+grass reduces detection), health, armor plates,
weak points (bonus damage, spark burst), death = collapse + explosion + loot beacon.
Eye/sensor color: blue calm, yellow suspicious, red hostile.

- **Watcher ×4** (rigged): raptor scout. Procedural leg walk cycle, neck scan sweep,
  tail sway. Attacks: lunge peck. Weak point: eye. Alerts nearby machines with a chirp.
- **Sawtooth ×2** (static sculpt): big cat. Root-motion prowl with body bob/sway,
  charge attack with pounce, swipe. Weak point: chest blaze canister.
- **Behemoth ×1** (static sculpt): giant ox. Territorial; charge + ground-slam
  (radial shockwave that must be dodged). Weak point: side cargo sacks.
- **Thunderjaw ×1** (static sculpt): apex T-Rex boss in the far zone. Stomp shockwave,
  tail sweep, mouth laser sweep, disc-launcher projectiles. Multiple weak points;
  long fight. Killing it = quest complete screen.

## Combat

- Arrows: projectile with gravity + drag, tracer, stick into terrain/machines.
- Part-based damage: weak point ×3 multiplier, armor plate ×0.4 unless plate blown off.
- Damage numbers pop at hit point (white normal, orange weak point).
- Machine health bar appears above target when damaged/hostile.
- Fire arrows: burn DoT + orange flame particles. Shock: brief stun + electric arcs.
- Hit feedback: sparks, hitstop 40ms on weak point, camera shake on big hits.

## HUD / UI (HZD-styled, minimal, geometric)

- Top-left: player health bar (thin, white on dark scrim) + medicine pouch pips.
- Top-center: compass strip with cardinal letters + machine pips (colored by state).
- Bottom-right: arrow type icon + count; draw-strength ring around crosshair when aiming.
- Center: dot crosshair, expands to draw ring while aiming.
- Objective card top-right: current hunt objective; updates on kills.
- Kill feed / XP toasts. Title screen, pause (Esc), death screen, victory screen.
- Font: a clean geometric sans (system stack fine); thin lines, slight letterspacing.

## Audio (all procedural WebAudio — no asset files)

- Wind bed + grass rustle tied to wind gusts; birdsong chirps.
- Footsteps (grass/dirt) matched to animation cadence; bow creak on draw, twang+whoosh on release.
- Arrow impact: metallic clank (machines) / thud (ground). Spark crackles.
- Watcher radar chirps, alert sting (rising), machine death explosion rumble.
- Ambient music: slow pentatonic pluck pattern + low drone pad, side-chained to combat
  state (combat layer adds percussion pulse).

## Tech / Architecture contract

- Vite + three (r169), ES modules, no framework.
- `src/main.js` owns the Game: constructs systems, fixed-order update loop.
- Shared context object `ctx`: { engine, scene, camera, renderer, input, events, assets,
  terrain, world, player, machines, combat, ui, audio, settings }.
- Every system: `class X { constructor(ctx) {} update(dt, t) {} }`.
- `events`: tiny pub/sub — emit('machine-killed', m), on('player-damaged', fn), etc.
- Terrain API: `getHeight(x,z)`, `getNormal(x,z)`, `isInTallGrass(x,z)`.
- Assets API: `assets.models.aloy` etc. — pre-normalized: +Z forward, y=0 at feet,
  real-world scale in meters.
- Performance budget: 60fps on an M-series MacBook — instancing for vegetation,
  ≤4 shadow-casting lights (ideally 1 sun), draw calls < 300, no per-frame allocations
  in hot loops.

## Machine model scale targets (normalized wrappers)

| model | target | axis |
|---|---|---|
| aloy | 1.72 m | height |
| watcher | 2.1 m | height |
| sawtooth | 2.4 m | height (≈4.5m long) |
| behemoth | 4.5 m | height |
| thunderjaw | 7.5 m | height (≈15m long) |
| npc | 1.8 m | height |

---

# INTERFACE CONTRACTS (builders MUST follow these exactly)

## File ownership (a builder edits ONLY its own files)

| builder | owns |
|---|---|
| vegetation | src/world/vegetation.js |
| camp | src/world/camp.js |
| player-anim | src/entities/playerAnimator.js |
| machines | src/entities/machines/* (index.js, machine.js, watcher.js, sawtooth.js, behemoth.js, thunderjaw.js) |
| combat | src/combat/* (combat.js + any new files there) |
| hud | src/ui/hud.js, src/ui/focus.js, src/ui/hud.css (import from hud.js via `import './hud.css'`) |
| audio | src/audio/audio.js |

Core files (main.js, engine.js, assets.js, input.js, events.js, terrain.js,
environment.js, player.js, style.css) are FROZEN for builders — read them, don't
edit them. If a contract gap blocks you, note it in your final report instead.

## Shared ctx (constructor arg for every system)

ctx = { game, params, engine, scene, camera, renderer, input, events, assets,
        terrain, environment, vegetation, camp, player, machines, combat, focus,
        hud, audio, state, settings }
Construction order: terrain, environment, vegetation, camp, player, machines,
combat, focus, audio, hud — a system may only touch systems built BEFORE it
in its constructor; anything else must be lazy (looked up inside update()).

## ctx.player (already implemented — READ ONLY for builders)

position:Vector3 (feet, world), velocity, heading (yaw rad), moveSpeed (m/s),
crouching, aiming, dodging, inTallGrass, health, maxHealth (100), medicine,
camYaw, camPitch, model (THREE.Group with skeleton), animator, dodge(),
takeDamage(amount, from). Damage to player: events.emit('player-damage',
{ amount, from }).

## Machine contract (machines builder implements; others consume)

ctx.machines.list = Machine[] where Machine has at least:
  kind: 'watcher'|'sawtooth'|'behemoth'|'thunderjaw'
  root: THREE.Group (world-placed; meshes raycastable)
  position: Vector3 (alias of root.position)
  alive: bool, health, maxHealth
  state: 'patrol'|'suspicious'|'alert'|'attack'|'search'|'return'|'dead'
  displayName: string ('Watcher', …)
  takeDamage(hit) -> { damage:number, weak:bool, killed:bool }
    where hit = { point:Vector3(world), object:THREE.Object3D, baseDamage:number,
                  type:'hunter'|'fire'|'shock', dir:Vector3 }
  Machine handles weak-point multipliers, armor, burn DoT, shock stun internally.
Every machine root subtree must set object.userData.machine = <machine ref> on
all meshes so combat raycasts can resolve the owning machine.

## Events (names are law)

'game-start' —
'player-damage' { amount, from }        (anyone -> player)
'player-hurt' { health, max }           (player -> HUD/audio)
'player-died' / 'player-respawn' —
'player-dodge' —
'medicine-used' { left }
'arrow-fired' { type, drawStrength }
'arrow-hit' { point, machine|null, damage, weak, type }   (combat -> HUD/audio)
'machine-damaged' { machine, damage, weak, point }
'machine-killed' { machine }
'machine-alerted' { machine }           (first transition to alert/attack)
'machine-attack' { machine, kind }      (each attack execution, for audio/fx)
'focus-pulse' —                         (focus -> audio)
'objective-changed' { title, detail }   (hud quest sequencer -> itself/audio)
'victory' —                             (hud emits when thunderjaw dies)

## Combat contract (combat builder implements)

- RMB aim state comes from player.aiming; LMB hold = draw (combat sets
  player.drawStrength 0..1; playerAnimator reads it), release = loose.
- Arrow types: 1 hunter (dmg 30·draw), 2 fire (18 + burn 20/4s), 3 shock
  (16 + 2.5s stun). Infinite hunter; fire/shock limited (24 each, HUD shows).
- Raycast arrows against machine roots (userData.machine) + terrain heightfield.
- Expose: combat.arrowType, combat.arrowCounts, combat.drawStrength (0..1).
- Bow: build a simple procedural bow mesh, attach to Aloy LEFT hand bone
  ('hand_l_014'); nock visual arrow while drawing.
- Emits 'arrow-fired', 'arrow-hit', spawns spark/impact particles itself.

## PlayerAnimator contract (player-anim builder)

- Replaces stub entirely; owns ALL bone posing of the aloy rig every frame.
- Reads player state: moveSpeed, crouching, aiming, dodging, drawStrength
  (via ctx.combat?.drawStrength ?? 0), inTallGrass, health.
- Must expose: getBoneWorld(name, outVec3) helper; bones map; and
  handAttach(side) -> THREE.Bone for combat to parent the bow to.
- Key bones: pelvis_05, spine_01_06..spine_05_010, neck_01_0102, head_0104,
  clavicle_l_011/r_042, upperarm_l_012/r_043, lowerarm_l_013/r_044,
  hand_l_014/r_045, thigh_l_0185/r_0211, calf_l_0186/r_0212,
  foot_l_0189/r_0215, ball_l_0190/r_0216. (Names are exact.)
- The model's bind pose is an A-pose facing +Z at wrapper level.

## Focus contract (hud builder)

- Q key: 3s pulse. Machines get additive glow/outline visible through terrain
  (e.g. clone meshes w/ depthTest:false purple shader at low opacity, or
  emissive boost + fresnel shell). Patrol routes optional.

## Terrain API (frozen)

terrain.getHeight(x,z), terrain.getNormal(x,z,out?), terrain.isInTallGrass(x,z),
terrain.tallGrassDensity(x,z) (0..1), WORLD_SIZE=720, playable radius ≈ 330.

## Verification loop (every builder, every iteration)

1. `node tools/screenshot.mjs <name> --port <YOUR_PORT> --params "px=..&pz=..&yaw=..&pitch=.."`
   (also supports --eval "JS with __GAME__/__CTX__" and --wait ms)
2. Read the PNG. Exit code 2 = console errors were printed — fix them first.
3. Compare against the gauntlet bar at the top of this file. Iterate.
Each builder was assigned a unique port; NEVER use another builder's port.
To simulate gameplay in a shot: --eval can call __CTX__ hooks, e.g.
"__CTX__.machines.list[0].state='attack'" or move the player.
