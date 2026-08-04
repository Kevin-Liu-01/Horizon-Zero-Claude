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
