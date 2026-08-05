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

---

# ROUND 2 — HZD-ACCURACY OVERHAUL (contracts v2)

The user's mandate: match the REAL game. Reference docs (READ YOURS FIRST):
docs/research/mechanics.md (weapons/ammo/crafting/keybinds/movement),
docs/research/machines.md (components/attacks/loot per machine),
docs/research/ui.md (fonts/HUD/Focus/palette). Fonts are bundled in
public/fonts/ with @font-face + CSS vars already in src/style.css:
--font (Rajdhani), --font-display (Michroma), --font-stinger (Orbitron),
--font-focus (Chakra Petch), palette vars --hzc-accent/-warn/-danger/-med/
-focus/-hostile/-text.

## Keybinds v2 (canon-adapted; the definitive map)

WASD move · Shift sprint · Shift WHILE AIMING = Concentration slow-mo ·
C crouch · Space or LeftCtrl dodge roll · RMB aim · LMB draw/loose ·
Tab (HOLD) weapon wheel · 1-4 weapon quick-slots · Z/X cycle ammo of active
weapon · V toggle Focus · T tag machine under crosshair while Focus active ·
E interact (hold 0.45s fill) · Q HOLD medicine pouch transfer (implemented in
player.js already: player.pouch 0..100, player.healing bool, addPouch(n)) ·
R craft one batch of active ammo · I inventory screen · Esc pause.
input.js already preventDefaults Tab/Space/KeyI. player.medicine is a
DEPRECATED getter — new UI reads player.pouch/maxPouch/healing.

## Damage model v2 (three channels — combat + machines share this)

hit = { point, object, impact, tear, element: 'none'|'fire'|'shock'|'freeze',
        elementAmount, dir, type }   // type = ammo id, for FX/audio
- impact: subtracts machine.health (weak spots multiply IMPACT only).
- tear: applies to the PART that owns hit.object (part.tearHp), not health.
- element: fills machine.elemental[element] buildup meter (0..100). At 100:
  fire = burn DoT 8s; shock = 3s stun; freeze = BRITTLE 8s (impact x2, visual
  frost). Meters decay. Machine.takeDamage(hit) -> { damage, tear, weak,
  killed, tornPart|null, triggeredElement|null }.

## Machine parts contract (machines builder implements, everything consumes)

machine.parts: Part[] = { name, displayName, mesh (procedural add-on built to
match docs/research/machines.md locations), tearHp, hp?, attached: bool,
weak: bool (yellow in Focus), elemental: 'blaze'|'freeze'|null (canisters
explode when shot with matching/fire element), linkedAttack: string|null
(attack id disabled when torn), loot: [{id, n}] }.
- Torn parts: detach with physics (gravity, bounce on terrain via getHeight,
  2 bounces then settle), stay 60s, register as ctx.interactables lootables.
- Thunderjaw disc launchers (x2): when torn, become PICKUPS — interacting
  swaps the player's weapon to 'Disc Launcher' (8 shots, heavy arcing
  explosive; drops on empty). Flag on the part: pickupWeapon: 'disc-launcher'.
- Sawtooth blaze canister: fire-element hit while attached -> explosion
  (AoE 120 impact to the machine itself, fireball FX) per research doc.
- Behemoth force loaders (neck, x2 in our version): torn -> disables ranged
  gravity attacks. Cargo hold (belly) -> torn drops bonus loot crate.
- Watcher eye: weak part (not tearable), one-shot with sharpshot precision.
- Eye-flash telegraph: every machine flashes its eye bright white-hot for
  ~0.4s at attack windup start (canon dodge cue) — base Machine hook; emit
  'machine-telegraph' { machine } at flash start.
- HP retune: watcher 90, sawtooth 450, behemoth 800, thunderjaw 1800.
- Corpses: register a 'Loot' interactable (machine.lootTable per research).

## Weapons contract (weapons builder: src/combat/* + src/ui/wheel.js|.css)

ctx.combat.weapons: Weapon[] = { id, name, slot 1-4, ammoTypes: Ammo[],
activeAmmo (id), draw()/loose() behavior }.
Roster: hunter-bow (hunter/hardpoint/fire arrows), sharpshot-bow (precision/
tearblast — tearblast = near-zero impact, huge AoE tear), war-bow (shock/
freeze), blast-sling (blast bomb, lobbed arc). Ammo counts + craft recipes
from docs/research/mechanics.md (ridge-wood + shards + blaze/sparker/
chillwater/echo-shell via ctx.inventory). combat.activeWeapon,
combat.setWeapon(slotOrId), combat.cycleAmmo(dir).
- Weapon wheel: HOLD Tab -> radial DOM wheel, engine.timeScale eases to 0.25,
  background scrim blur (cheap CSS), 4 slots with ammo icons, scroll/Z/X
  inside selects ammo, R crafts batch (shows recipe + have/need), release Tab
  closes + restores timeScale. Emits 'wheel-open'/'wheel-close',
  'weapon-switch' {weapon}, 'ammo-crafted' {ammo, n}.
- Concentration: Shift while aiming -> engine.timeScale 0.35, gauge
  combat.concentration = { active, gauge 0..1 } drains over 6s, refills over
  6s when inactive; cancel on release; emits 'concentration-start/end'.
  NEVER fight the wheel's timeScale (wheel wins while open).
- Different arrows keep distinct tracer/visual identity.
- Disc Launcher pickup weapon support (see machine parts contract).

## Inventory & interactables (items builder: src/items/* + src/ui/inventory.js|.css)

Item catalog (id, name, category, icon glyph/color): metal-shards, ridge-wood,
blaze, chillwater, sparker, echo-shell, wire, watcher-lens, machine-heart,
medicinal-herb (+ any needed). ctx.inventory.add/count/take + 'item-gained'.
- Inventory screen (I): dark translucent panel, category tabs (Resources /
  Ammo / Valuables), Rajdhani labels, counts; pauses gameplay like Esc but a
  distinct screen; mouse nav; Esc/I closes.
- ctx.interactables.register({ position, radius, label ('LOOT'/'GATHER'/
  'PICK UP'), hold: seconds, onInteract, once }) and expose
  ctx.interactables.current = nearest-in-range entry each frame (HUD renders
  the [E] prompt + hold fill from it; you own the hold logic + E binding).
- World gather nodes (you spawn them): ~120 medicinal herb plants (small
  green-glowing clusters in meadows; gather -> player.addPouch(25) + toast),
  ~80 ridge-wood shrubs/fallen logs, supply crates at camp (shards + ammo
  resources). Herbs/wood respawn after 120s. Terrain-conforming, none in the
  camp clearing (7m) or on steep rock. Instanced meshes, cheap.
- Machine corpse looting comes from machines builder registering lootables —
  YOU own the take-all popup UI on interact (list items + counts, auto-close).
- Starting inventory: 60 metal-shards, 20 ridge-wood, 6 blaze, 6 sparker,
  6 chillwater, 4 echo-shell.

## Focus v2 (focus builder: src/ui/focus.js + src/ui/focus.css new)

V toggles Focus mode (no time limit): keep pulse + violet through-wall glow +
cool tint, PLUS while active:
- Machine components highlighted YELLOW (parts[] where weak or tearable);
  linger 6s after Focus off (canon).
- Patrol path lines: glowing ground-hugging polylines along machine.route
  waypoints, flowing dashes, purple-blue.
- Info card (Chakra Petch, focus.css): crosshair on machine 0.4s -> name,
  level (Watcher 5 / Sawtooth 15 / Behemoth 25 / Thunderjaw 27), elemental
  weakness glyphs, component count; fades when off-target.
- T while Focus active: tag machine under crosshair -> persistent yellow
  diamond marker (screen-projected, edge-clamped, shows distance in m) until
  that machine dies.
- Gather nodes glow green-cyan during Focus (read ctx.interactables.list
  where label==='GATHER'; add a soft additive glow sprite per node while
  Focus is on — pooled, cheap).
- Q no longer touches Focus (it is medicine now); use V; update your key
  handler + any title text you own (you own none — HUD builder owns text).

## HUD restyle v2 (hud builder: src/ui/hud.js + hud.css + index.html)

Apply docs/research/ui.md faithfully with the bundled fonts (style.css vars):
- Health: segmented RED bar top-left (4 segments), thin GREEN pouch meter
  directly under it (player.pouch/maxPouch), pulses while player.healing;
  'Q' kbd hint when pouch>0 && health<max.
- Compass ribbon stays (canon) — restyle: parchment ticks, diamond machine
  pips w/ awareness color (white calm / yellow suspicious / red hostile).
- Awareness indicators: per-machine screen-edge-clamped indicator when
  suspicious+: yellow filling circle -> red; flashing jagged red diamond
  while that machine is mid-attack (listen 'machine-attack'/'machine-telegraph').
- Weapon HUD bottom-right: active weapon name + ammo glyph + count + 'Z/X'
  cycle hint, live from combat.activeWeapon/activeAmmo/arrowCounts-equivalent.
- Concentration gauge: thin yellow vertical drain bar beside the reticle
  while aiming (combat.concentration.gauge), only when < 1.
- Interaction prompt: [E] kbd chip + label + radial hold-fill rendered from
  ctx.interactables.current (items builder computes hold progress; expose
  .current = { label, holdProgress 0..1 } minimum).
- Item toasts bottom-right stack (3s) on 'item-gained' (icon glyph + name xN).
- Damage numbers: white; orange on weak; blue-cyan '+TEAR' pops on torn parts
  (listen for takeDamage results via 'machine-damaged' {..., tear, tornPart}).
- Machine health bar: add 3 tiny elemental buildup meters under it (fire/
  shock/freeze) reading machine.elemental.
- Restyle title/pause/death/victory with --font-display/--font-stinger;
  update index.html title-screen controls grid to Keybinds v2 EXACTLY.
- Quest chain structure unchanged, restyled.

## Audio v2 additions (audio builder: src/audio/audio.js)

Sonify: 'part-torn' (metal shear + clatter), 'item-gained' (soft tick; herbs
leafy), 'wheel-open/close' (slow-mo whoosh in/out + tick per hover), 'weapon-
switch' (mechanical click), 'ammo-crafted' (wood tap + fletch), 'concentration-
start/end' (breath-in, heartbeat layer while active, low-pass the music),
'machine-telegraph' (short rising blip — the audible dodge cue), canister
explosions (bigger boom on 'machine-damaged' with triggeredElement), 'focus-on/
off' (hologram hum toggle while Focus active). Keep 100% procedural, respect
existing voice caps; wheel/concentration must also survive timeScale changes
(use real time for envelopes).

## Terrain v2 (terrain builder: src/world/terrain.js — unfrozen for THIS builder only)

The user says terrain must be much better. Constraints: keep the analytic API
exactly (getHeight/getNormal/tallGrassDensity/isInTallGrass, WORLD_SIZE,
WORLD_HALF, SimplexNoise export, playable radius 330) and FAST (gameplay
samples it per frame; vegetation.js must keep working unchanged).
Improve:
1. Landform: ridged-noise mountain rim with strata shelves; rolling meadow
   center; a dried river cut meandering roughly N-S through the west meadow
   (smooth banks, crossable, moist dark soil + greener grass along it via
   color only); rocky highland shelf SE; subtle worn dirt paths radiating
   from camp (pathFactor(x,z) export used for color/less-detail; harmless
   default for callers that ignore it).
2. Color: richer splat — moisture gradient near the river, ochre/umber dry
   patches, world-space strata banding on steep faces, snow only on rim
   peaks; keep the noise-breakup shader.
3. Mesh: segments 360 -> up to 520 if needed; keep 60fps + current draw calls.
Machine spawn zones and camp (22,30) must remain on sensible ground; check
getHeight at all spawn points (machines/index.js lists them) stays gentle.

## File ownership round 2 (ports)

| builder | owns | port |
|---|---|---|
| terrain | src/world/terrain.js | 5181 |
| animator | src/entities/playerAnimator.js | 5183 |
| machines | src/entities/machines/* | 5184 |
| weapons | src/combat/*, src/ui/wheel.js, src/ui/wheel.css | 5185 |
| hud | src/ui/hud.js, src/ui/hud.css, index.html | 5186 |
| audio | src/audio/audio.js | 5187 |
| focus | src/ui/focus.js, src/ui/focus.css (new) | 5188 |
| items | src/items/*, src/ui/inventory.js, src/ui/inventory.css | 5189 |

Everything else (main.js, engine.js, assets.js, input.js, player.js,
environment.js, vegetation.js, camp.js, style.css) is FROZEN — read, never
edit; report gaps instead. Events are law; the new events above are law too.
