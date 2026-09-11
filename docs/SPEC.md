# HORIZON ZERO CLAUDE — SPEC v4

A third-person open-world robot-dinosaur hunting game in the browser (Three.js r169 + Vite).
This document is the contract. **v4 replaces the "frozen files" model with module ownership
(decision D8):** every file has exactly one owner, the rule is *don't edit another owner's
file*, and anything you need from someone else is requested as a published API.

Read alongside: `docs/ROUND4-AUDIT.md` (the 211-finding gap list and the per-lane gate spec),
`docs/ROUND3.md`, `docs/ROUND4-CHARACTER.md`, `docs/research/*`.

---

## 1. The quality bar (unchanged, and it is the whole point)

Judge every screenshot against **Horizon Zero Dawn** promotional stills:

- Golden-hour sunlight, warm aerial haze, long crisp directional shadows
- Rolling terrain with dense red-gold tall grass in patches; textured, not plastic
- Scattered pines/rocks, real relief on the rim, mountains fading into atmosphere
- Sky: warm horizon gradient, blue above, a tight sun disc with corona, drifting cloud
- Machines that read as *menacing wildlife*: patrolling, scanning, moving between attacks
- Clean minimal diegetic HUD; Focus mode a cool violet scan that keeps the world's colour

If a subsystem looks like "a programmer demo" (flat lambert ground, static grass, grey
boxes, default fog, harsh point lights) it FAILS. The Round 4 mandate is stronger still:
*the game must look and play as good as the real HZD, verified by literal gates.*

---

## 2. Contract model v4 — module ownership

1. **One owner per file.** A builder edits only the files in its lane row (§3). New files
   only inside its own paths.
2. **No lane edits another lane's file, ever.** If you need behaviour from another lane,
   publish/request an API and document it in your report; the orchestrator adds it here.
3. **Tuning that crosses lanes lives in data**, not in someone else's code — per-species
   attack ranges, elemental thresholds, HP, loot tables and detection rates live in
   `src/entities/machines/ai/tables.js` (owned by `machine-ai`).
4. **Events are law.** Names in §7 do not change; new ones are additive.
5. **Every lane's port is its own.** Never run a server on another lane's port.
6. **Gates are the acceptance bar.** A lane is done when its §4 gates in the audit pass and
   the full suite still passes (`node tools/gates.mjs --port <YOUR_PORT>`).

---

## 3. Lane table (verbatim from `docs/ROUND4-AUDIT.md` §3.1)

| lane | port | owns | headline deliverables |
|---|---|---|---|
| `core-platform` | 5201 | `src/main.js`, `src/core/engine.js`, `src/core/assets.js`, `tools/*`, `package.json`, `docs/SPEC.md` | Guarded frame loop, MSAA+SMAA, GTAO+grade, CSM plumbing, quality tiers + DRS + F3 stats, fixed-step accumulator, warm-up compile, real gates + `tools/budgets.mjs`, spikes→`labs/` |
| `spatial` | 5202 | `src/core/collision.js`, `src/core/nav.js`, `src/core/hitHulls.js` (all new) | three-mesh-bvh, static collider/occluder registry, capsule + segment casts, 2 m navgrid + flow field, per-bone hit hulls, uniform-grid spatial hash |
| `anim-core` | 5203 | `src/entities/anim/*` | `BoneSpace` (rotLocal/rotChar/rotWorld), `RestPose`, `ClipLayer` (timeScale-aware, dt-driven), `RigDebug`; retire the three conventions |
| `player-control` | 5204 | `src/entities/player.js` ⚠️, `src/core/input.js` ⚠️ | Capsule+gravity+jump+slope+fall+wade, dodge windows/buffer/chain, crouch toggle surviving aim, camera collision/smoothing/pitch/framing, settings-driven input, Gamepad API |
| `player-anim` | 5205 | `src/entities/playerAnimator.js` | All `dyn_` springs + foot-strike impulses, twist joints, cheek anchor + open bow arm, look-at + blink, head stabilisation, hit/jump/land/interact/loot clips, bow carry pose |
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

⚠️ = was frozen before Round 4; unfrozen for the owner named here.

Files with no lane row keep their Round 2/3 owner. `labs/**` (the retarget/reskin/hybrid
spikes, moved out of `src/` in Round 4) belongs to whoever is iterating on it; it never
ships in a gate.

---

## 4. Engine & core platform (owner: `core-platform`)

`src/main.js` owns the Game object: it constructs the systems in a fixed order, runs the
guarded bounded-step loop, and renders. `src/core/engine.js` owns the renderer, the post
stack, quality policy and the perf instrumentation. `src/core/assets.js` owns model
loading and normalization.

### 4.1 System contract

```js
class MySystem {
  constructor(ctx) {}
  update(dt, t) {}          // bounded slice, dt <= 1/60 s; called 0..3× per frame
  interpolate(alpha, realDt) {}   // optional: render-time blend, once per frame
}
```

- `dt` is **never larger than 1/60 s**, and the frame's total simulated time is
  `realFrameTime × engine.timeScale` (real time clamped at 0.05 s, so the old ceiling is
  unchanged). When time is frozen the loop still calls `update(0, t)` once per frame,
  because presentation systems derive their own real dt.
- `t` is **wall-clock** seconds since boot (`engine.wallTime`), distributed evenly across
  the sub-steps of a frame, so `t - lastT` still sums to the real frame time. Never assume
  `t` is scaled by `timeScale`; use `dt` for that.

**`engine.stepMode` — read this before changing it.**

| mode | how the frame is stepped | when to use it |
|---|---|---|
| `'substep'` (default) | `N = ceil(simDt / (1/60))` **equal** sub-steps that consume the frame's simulated time exactly. `engine.alpha === 1`. | Always, today. Steps stay bounded and rendered motion tracks elapsed time frame for frame. |
| `'fixed'` | whole 1/60 s steps; the remainder is carried in an accumulator and published as `engine.alpha`. | Bit-reproducible record/replay — **and only once systems implement `interpolate()`**. |

`'fixed'` without render interpolation judders, and that is not a subtlety: the leftover
is discarded every frame, so a 41 fps session advances the world by one step or two at
random. Measured on this build before the default changed — apparent machine speed CV
0.30, Aloy's mixer-rate CV 0.26, and at `timeScale 0.3` **70 % of rendered frames advanced
the simulation by nothing at all** (re-measured after: 0 %, sim-per-wall-ms CV 0.056).
If your lane keeps prev/current transforms, implement `interpolate(alpha, realDt)`; a
correct interpolator is a no-op in `'substep'` mode because `alpha` is 1 there. Switch
with `?step=fixed` or `engine.stepMode = 'fixed'`.
- **Every call is wrapped in try/catch.** A throwing system is logged once
  (`console.warn`, plus a record in `game.systemErrors` and a `system-error` event) and
  then only counted; the simulation and the render loop keep running. This is deliberate:
  three's `WebGLAnimation` re-arms `requestAnimationFrame` *after* the callback returns, so
  one uncaught exception used to freeze the game permanently.

### 4.2 `engine` published API

| member | contract |
|---|---|
| `engine.requestTimeScale(source, value)` | The only sanctioned way to slow time. `value === null` releases the source. Resolution order: `studio` > `wheel` > `hitstop` > `concentration` > any other source > direct `engine.timeScale =` writes (`legacy`). |
| `engine.timeScale` | Resolved read; the setter is the legacy/lowest-priority channel and stays supported. |
| `engine.timeScaleSources()` | `{ source: value }` map, for the F3 overlay and studio. |
| `engine.enableCSM(opts)` / `engine.csm` / `engine.disableCSM()` | Cascaded shadow maps. `opts = { light, cascades=3, maxFar=220, mode, shadowMapSize=2048, lightMargin, shadowBias, fade, lightDirection, lightIntensity }`. Passing the existing sun as `light` hands its shadow over. `engine.csm` is `null` until enabled and `csm.update()` runs inside `engine.render()`. |
| `engine.csmSetupMaterial(mat)` | Registers a material with the cascades; no-op while CSM is off. |
| `engine.sceneTarget` | The multisampled render target the world is drawn into. Also `composer.renderTarget1`. Carries the depth texture. |
| `engine.depthTexture` | Scene depth, resolved once per frame. Free for any pass that needs depth — never attach it to a target you also write to. |
| `engine.gtao` / `engine.bloom` / `engine.grade` / `engine.smaa` | The post passes. `engine.grade.uniforms` exposes `uContrast`, `uSaturation`, `uLift`, `uShadowTint`, `uHighlightTint`, `uVignette`, `uVigInner`, `uVigOuter` — `world-light` owns those values. |
| `engine.setQuality('low'\|'medium'\|'high'\|'ultra')` / `engine.quality` / `engine.tier` | Quality tiers: DPR cap (1.0/1.25/1.5/2.0), MSAA samples, GTAO on/off + resolution scale, SMAA, shadow cull distance and caster budget, shadow filter, dynamic resolution. `?q=` picks the boot tier. |
| `engine.shadowCullDistance`, `engine.shadowCasterBudget`, `engine.activeShadowCasters`, `engine.shadowCascades`, `engine.shadowDrawEstimate` | Distance culling plus a hard nearest-N caster budget for the shadow map. The budget is a **draw** budget: with CSM on, every caster renders once per cascade, so `_cullPass` admits `shadowCasterBudget / cascades` casters and `shadowDrawEstimate` reports the product. |
| `engine.sizeCullPx`, `engine.sizeCullGlowFactor`, `engine.sizeCulled`, `engine.uncullAll()` | Screen-space small-mesh cull: a mesh whose projected diameter is under `sizeCullPx` **device** pixels (tier: 11/9/7/4) is hidden until it grows 30 % past the threshold, which removes it from the main pass *and* the shadow map. Emissive/additive meshes use `sizeCullPx × sizeCullGlowFactor` (0.5) because bloom turns a 4-pixel lens into a 200-pixel flare. Opt a mesh out with `mesh.userData.noSizeCull = true`; `uncullAll()` restores everything (photo mode). Measured at the west herd with the sim frozen: **35 of 1.44 M pixels change**, and the pass never touches a mesh its owner has already hidden. This is not LOD — it only deletes what is already sub-pixel; real LOD chains are `machine-rig` perf-tech-04/14. |
| `engine.setGrade(on)` | Grade on/off. Do **not** use `engine.grade.enabled = false`: the grade shares the output pass, so disabling it would also disable the tonemap and dump raw HDR to the screen. |
| `engine.renderScale`, `engine.setDynamicResolution(on)`, `engine.effectivePixelRatio` | Dynamic resolution holds the frame budget by trading pixels. Automatically disabled under `?shot=1`, and **anything that measures must call `setDynamicResolution(false)`** — it also snaps the scale back to 1, because `basePixelRatio` alone is not the ratio being rendered (`effectivePixelRatio = basePixelRatio × renderScale` is). The size cull deliberately does **not** follow `renderScale`: culling by the DRS-scaled buffer made a busy frame delete machine parts and made draw calls a function of GPU load. |
| `engine.onAfterRender[]` | Callbacks invoked immediately after the composer, inside the same task — the only safe place to read the WebGL canvas back. |
| `engine.perfReset()` / `engine.perfSnapshot(n)` | Honest per-frame stats: `{ medianFrameMs, p95FrameMs, maxFrameMs, p95JsMs, medianJsMs, maxJsMs, p95SimMs, medianSimMs, p95RenderMs, medianRenderMs, p95TailMs, jsTerm, maxDrawCalls, minDrawCalls, medianDrawCalls, maxTriangles, fps, pixelRatio, renderScale, quality, medianGpuMs, p95GpuMs }`. The engine sets `renderer.info.autoReset = false` and resets once per frame, so `info.render.calls` is the whole frame — shadow pass and every post pass included. **The JS term is the whole main-loop callback**, not the submit half: `jsTerm` names it (`sim(steps+interpolate) + renderSubmit + frameTail`) and `p95SimMs` / `p95RenderMs` / `p95TailMs` are its parts, so a measurement can say which half owes the milliseconds. Anything grading `p95JsMs` **must** check `jsTerm` first — a build that does not publish it is timing the submit only and grading that against the systems+submit budget is a false green. `engine.render()`'s return value is the submit part alone; `main.js _frame()` assembles the total and passes it to `engine._recordFrame(frameMs, jsMs, simMs, renderMs, tailMs)`. |
| `engine.enableGpuTimer(on)` | `EXT_disjoint_timer_query_webgl2` sampling; also turned on by the F3 overlay. |
| `engine.warmUp(scene, camera)` | `renderer.compileAsync` behind the loading bar. Any lane that adds materials after boot (deferred species, weather) should call it again. |
| `engine.frames`, `engine.simTime`, `engine.wallTime`, `engine.steps`, `engine.alpha` | Frame bookkeeping. |
| **F3** | Toggles the stats overlay: fps, frame ms median/p95/max, GPU ms, the JS split (`sim + submit + tail`), draw calls, triangles, programs, DPR + render scale, quality, sub-steps, timeScale sources, active shadow casters, system-error count. |

### 4.3 `assets` published API

```js
assets.models[name] = { root, gltf, size, spec, animations, shadowCasters }
```
Every model is wrapped so that, for the wrapper: feet sit at `y = 0`, it is scaled to
real-world metres, and its visual forward faces `+Z`. Consumers clone via `SkeletonUtils`
for independent skinned instances.

- `assets.normalize(name, gltf, spec)` — the single implementation of that contract. No
  lane may mirror it (`variety-assets.js` copying it is the debt D8 exists to end).
- `assets.loadExtra(specs, { onProgress, onEntry, force })` — additive loading for lanes
  that own their own species. `onEntry(entry, name, spec)` is the hook for per-species
  material styling. Idempotent per name.
- `assets.applyShadowPolicy(root, policy)` / `SHADOW_POLICY` — per-mesh shadow policy: a
  mesh casts only if its bounding sphere is ≥ 15 % of the model's, and the largest 8 always
  cast. These models are 10–45 separate meshes each and a shadow map costs one draw call
  per caster; buckles and bolt heads add nothing a body mesh has not already cast.

### 4.4 Model scale targets (normalized wrappers)

| model | target | axis |
|---|---|---|
| aloy | 1.72 m | height |
| watcher | 2.1 m | height |
| sawtooth | 2.75 m | height |
| behemoth | 4.5 m | height |
| thunderjaw | 9.4 m | height |
| npc | 1.8 m | height |
| strider | 2.0 m | height |
| scrapper | 1.5 m | height |
| glinthawk | 1.55 m | height (scaled by 5.5 m wingspan) |
| longleg | 4.0 m | height |

---

## 5. Shared `ctx`

```
ctx = { game, params, engine, scene, camera, renderer, input, events, assets,
        terrain, environment, vegetation, camp, player, inventory, machines, combat,
        wheel, focus, interactables, hud, audio, studio, state, settings }
```

Construction order: terrain → environment → vegetation → camp → player → inventory →
machines → combat → wheel → focus → interactables → audio → hud → studio. A system may
only touch systems built **before** it in its constructor; anything later must be looked up
lazily inside `update()`.

`ctx.state`: `loading | title | playing | paused | dead | victory | studio`. The world keeps
simulating through `title`, `dead`, `victory` and `studio`; only hard pauses freeze it.

`window.__GAME__` / `window.__CTX__` are always exposed (not just under `?shot=1`), and
`window.__READY__` flips true once the shot harness has placed the player.

---

## 6. `ctx.player` (owner: `player-control`)

`position` (feet, world) · `velocity` · `heading` (yaw rad) · `moveSpeed` (m/s) ·
`crouching` · `aiming` · `dodging` · `inTallGrass` · `health` / `maxHealth` ·
`pouch` / `maxPouch` / `healing` / `addPouch(n)` · `camYaw` / `camPitch` ·
`model` (THREE.Group with skeleton) · `animator` · `dodge()` ·
`takeDamage(amount, from)` · `_snapToGround()`.
`player.medicine` is a deprecated getter.

**Canon ground speeds — published as `player.speeds`, not written down here.**
Round 4 (`player-control`): walk 1.5 · crouch 1.4 · crouchAim 1.05 · aim **1.35** ·
jog 5.0 · sprint **6.8** m/s — HZD's own ratio, and the speed both locomotion
clips are actually authored at. Round 3's 4.6 / 8.2 is gone.

The table above is a snapshot for readers; `ctx.player.speeds` is the source of
truth. **Nothing may hard-code these numbers** — not gameplay, not the animator's
clip retiming, and above all not a gate. Round 3 gates asserted `spd > 7.5`
against a 6.8 m/s sprint, which fails a *correct* build and can only be made
green by putting the wrong speed back: a gate that enforces a bug. Every
locomotion band in `tools/gates.config.mjs` now derives from the published table
(`0.9 · speeds.sprint`, `0.87 · speeds.jog`) and `A81-canon-speed-bands` reads the
canon out of `src/entities/player.js` at run time and fails the suite for any gate
whose band that canon cannot satisfy.

### 6.1 PlayerAnimator — Round 4 (owner: `character`)

The animator is no longer procedural bone-by-bone. The CC0 Quaternius Universal
Animation Library is retargeted onto Aloy's rig once at boot
(`src/entities/anim/{boneMap,retargeter,clipLibrary,locomotion}.js`) and played
through a `THREE.AnimationMixer` on the player model; the procedural layers that
still earn their place run **after** `mixer.update` as additive offsets that
multiply onto the clip-posed local quaternions (the old per-frame reset to
`bindQ` is gone). Full write-up: `docs/ROUND4-CHARACTER.md`.

**Contract — unchanged and load-bearing for combat:** `animator.bones` (bone
objects by rig name) · `getBoneWorld(name, out)` · `handAttach('l' | 'r')`
returns the same `Bone` objects it always did · combat's bow stow/draw and
`player.drawStrength` are untouched · `mixer.update` runs before combat reads
any bone transform.

**Added read-only diagnostics (gates only, safe to call any frame):**
`mixer` · `loco` · `dominantAction()` · `clipReport()` · `rollProgress(k)` ·
`debugFeet()` (A13) · `debugStance()` (A15: per-foot live vs bind sole pitch and
heel/toe clearance) · `debugArm(side)` (A16/A17/A32: shoulder/elbow/hand in char
space, `elbowAboveShoulder`, normalised `headClear` against the head keep-out
ellipsoid for the two arm SEGMENTS, `handHeadUnit` for the HAND itself,
`handToQuiver`) · `debugAim()` (draw-line geometry: cheek anchor, derived nock,
reach slide, `anchorDrop`).

`debugStance()` also reports **`soleTiltErrDeg`** — the angle between the sole's
live normal and the terrain normal under the ball. That is the axis-free version
of "is the sole flat on the ground": a pitch-only probe reads ~0 on a
cross-slope while the downhill toe hangs 4 cm in the air, which is how the
missing lateral conform survived a whole round.

**Five invariants the fix rounds added, worth keeping:**
- `player.update` must NEVER divide by `dt`. The fixed-step loop legitimately
  ticks with `dt === 0` (`main.js`: `steps === 0 → _tick(0, …)`), and a single
  such tick inside a dodge used to make `position` NaN for the rest of the run.
  Root motion is integrated directly; `velocity` is a read-only mirror while
  dodging. A NaN backstop restores the last finite position.
- Module-level scratch vectors are not shareable across an IK call.
  `_ikArm` owns `_ik*` privately; anything the aim layer must hold across the
  call (the hand→nock offset) has its own dedicated vector. `_groundConform`
  likewise owns `_cf*`, because `_rot` and `_rotL` both clobber `_q1` mid-call.
- Foot conform is solved as a **sole NORMAL** aligned to the terrain normal, not
  as one or two Euler scalars. Her feet toe out ~15°, so any fixed axis (the
  heading, or the character's forward) leaves the sole crossed on a cross-slope.
  On flat ground the target is char +Y and the solve reduces exactly to the old
  flat-foot rule.
- Anything that feeds `_springs` must be finite. A NaN bone matrix does not
  glitch — it collapses every vertex it skins, so one bad spring state DELETES
  the hair, skirt, boot fur and pouches from the render, and the integrator has
  no path back. The drives are sanitised and bad chains are re-seated each
  frame; **A33-rig-finite** is the regression net.
- The quiver-reach flourish belongs to the **aim raise** and to the post-loose
  follow-through — never to the draw edge. The string must never go live while
  the hand is travelling to the hip. Enforced twice: by the trigger, and by
  fading the flourish out on `drawS` so a simultaneous RMB+LMB cannot defeat it.

---

## 7. Events (names are law)

```
'game-start'
'system-error'          { key, name, phase, message, count }   (engine guard → anyone)
'player-damage'         { amount, from }         (anyone → player)
'player-hurt'           { health, max }          (player → HUD/audio)
'player-died' / 'player-respawn'
'player-dodge'
'medicine-used'         { left }
'arrow-fired'           { type, drawStrength }
'arrow-hit'             { point, machine|null, damage, weak, type }
'machine-damaged'       { machine, damage, weak, point, tear, tornPart, triggeredElement }
'machine-killed'        { machine }
'machine-alerted'       { machine }
'machine-attack'        { machine, kind }
'machine-telegraph'     { machine }               (eye flash at windup — the dodge cue)
'part-torn'             { machine, part }
'item-gained'           { id, n }
'wheel-open' / 'wheel-close'
'weapon-switch'         { weapon }
'ammo-crafted'          { ammo, n }
'concentration-start' / 'concentration-end'
'focus-pulse' / 'focus-on' / 'focus-off'
'objective-changed'     { title, detail }
'victory'
```

Round 4 lanes add (see the audit for owners): `machine-stagger`, `machine-state`,
`machine-scan`, `machine-footfall`, `machine-attack-phase`, `melee-hit`, `silent-strike`,
`stimulus`/`noise`, `xp-gained`, `level-up`, `quest-*`, `save-written`.

---

## 8. Damage model (three channels — `combat` + `machine-ai` share it)

```js
hit = { point, object, impact, tear,
        element: 'none'|'fire'|'shock'|'freeze', elementAmount, dir, type }
```
- **impact** subtracts `machine.health`; weak spots multiply impact only.
- **tear** applies to the PART owning `hit.object` (`part.tearHp`), not to health.
- **element** fills `machine.elemental[element]` (0..100). At 100: fire = 8 s burn DoT,
  shock = 3 s stun, freeze = 8 s BRITTLE (impact ×2). Meters decay. Per-kind thresholds
  live in `machines/ai/tables.js` (`machine-ai-elemental-no-tier-scaling`).

`machine.takeDamage(hit) → { damage, tear, weak, killed, tornPart|null, triggeredElement|null }`.

### Machine contract

```
machine.kind         'watcher'|'sawtooth'|'behemoth'|'thunderjaw'|'strider'|
                     'scrapper'|'glinthawk'|'longleg'
machine.root         THREE.Group (world-placed; meshes raycastable)
machine.position     Vector3 (alias of root.position)
machine.alive, health, maxHealth, displayName, level
machine.state        'patrol'|'suspicious'|'alert'|'attack'|'search'|'return'|
                     'stagger'|'downed'|'overridden'|'dead'
machine.parts        Part[]  (see below)
machine.route        waypoint list for Focus patrol ribbons
machine.debugFeet()  [{ name, world, planted }]   (gait gates)
```
Every mesh in a machine subtree sets `object.userData.machine = <machine ref>` so combat
raycasts resolve the owner.

```
Part = { name, displayName, mesh, tearHp, hp?, attached, weak,
         elemental: 'blaze'|'freeze'|null, linkedAttack: string|null,
         loot: [{ id, n }], pickupWeapon?: 'disc-launcher' }
```
Torn parts detach with physics, settle on terrain, persist 60 s and register as lootable
interactables. HP: watcher 90 · sawtooth 450 · behemoth 800 · thunderjaw 1800.

---

## 9. Combat, weapons, items, Focus, HUD (contracts carried from v2/v3)

- **Combat**: RMB aim; LMB hold = draw (`combat.drawStrength` 0..1), release = loose.
  Exposes `combat.weapons`, `combat.activeWeapon`, `combat.setWeapon(slotOrId)`,
  `combat.cycleAmmo(dir)`, `combat.concentration = { active, gauge }`. Bow parents to the
  Aloy LEFT hand bone via `animator.handAttach('l')`. Round 4 adds `src/combat/melee.js`
  (light/heavy spear, Silent Strike, Critical Hit), per-weapon `nockTime`, honest ballistics
  (no gravity-compensating loft), hitstop on every hit, and `combat.weaponDrawn` carry state.
- **Weapon wheel**: HOLD Tab → radial DOM wheel; `engine.requestTimeScale('wheel', 0.25)`
  while open, released on close. Never write `engine.timeScale` directly from the wheel.
- **Concentration**: Shift *while already aiming* (never on a sprint keydown) →
  `engine.requestTimeScale('concentration', 0.35)`, gauge drains over 6 s.
- **Items**: `ctx.inventory.add/count/take`; `ctx.interactables.register({ position, radius,
  label, hold, onInteract, once })` and `ctx.interactables.current = { label, holdProgress }`.
- **Focus**: V toggles. Violet through-wall glow, yellow components with names, patrol
  ribbons, info card, T to tag. World keeps its colour under a ≤20 % violet vignette.
- **HUD**: red 4-segment health + green pouch under it, compass ribbon with awareness-coloured
  diamond pips (only Focus-tagged or quest-target machines), projected machine health bars,
  stealth eye, tools strip, XP bar, centre banners, tutorial cards, `--hud-scale`.
- **Keybinds**: WASD · Shift sprint (Shift while aiming = Concentration) · C crouch toggle ·
  Space/LeftCtrl dodge · RMB aim · LMB draw/loose (or melee when not aiming) · Tab hold wheel ·
  1-4 weapons · Z/X ammo · V Focus · T tag · E interact (hold 0.45 s) · Q hold medicine ·
  R craft (hold) · I inventory · Esc pause hub.

---

## 10. Terrain API (frozen shape, owner `world-ground`)

```
terrain.getHeight(x, z)            terrain.getNormal(x, z, out?)
terrain.isInTallGrass(x, z)        terrain.tallGrassDensity(x, z)   // 0..1
terrain.surfaceAt(x, z)            // NEW in v4: 'grass'|'dirt'|'rock'|'cobble'|…
WORLD_SIZE = 720                   playable radius ≈ 330
```
These are sampled per frame by gameplay; they must stay analytic and fast. The shape is
additive-only — nothing may be removed or renamed.

---

## 11. Verification loop (every lane, every iteration)

1. **Film it.**
   `node tools/screenshot.mjs <name> --port <YOUR_PORT> [--params "px=..&pz=..&yaw=..&pitch=.."] [--wait ms] [--eval "JS with __CTX__"]`
   Exit code 2 means console errors were printed — fix those first.
2. **Read the PNG.** Not the log. The image.
3. **Gate it.** `node tools/gates.mjs --port <YOUR_PORT> [--lane <lane>] [--only id,id]`
   - Action gates run JS in page context with `__CTX__`/`__GAME__` and resolve
     `{ pass, detail }`. A console **error** during a gate is an automatic FAIL. A gate whose
     required API does not exist yet resolves `{ pass: null, detail: 'SKIP: …' }` → PENDING.
   - Visual gates capture a deterministic screenshot (`setup` + `settle`) into
     `shots/gates/<id>.png` and are judged against written `criteria`.
   - Per-gate `timeout` (default 30 s) and `params`/`plain` are supported.
   - **Every await in the runner has a wall clock.** `newPage`, the `setup` evaluate, the
     screenshot, the quarantine-ledger read and `page.close` are all raced against a
     timeout, because with sixteen lanes on one box a wedged browser used to hang the whole
     suite with no diagnostic line (measured: 13 minutes on `browser.newPage()` with 52
     Chrome processes alive). A wall-clock failure is tagged `infra:`, closes the browser,
     and retries on a fresh one; a gate's own assert timeout stays a FAIL. The boot wait is
     90 s and a boot timeout retries the same way — under sixteen concurrent lanes a cold
     page (models + shader warm-up) has been measured past 60 s, which used to report as a
     gate failure with no assert ever running.
4. **Own your gates.** Lanes other than `core-platform` write theirs into
   `tools/gates.round4.<lane>.mjs` exporting `GATES` in the same shape; the runner merges
   every `tools/gates.round4.*.mjs` automatically and refuses duplicate ids. Never weaken an
   existing gate. Exception, because the audit assigns it that way (`machine-rig-18`): the
   per-species rig gates `A45-no-skate-per-species`, `A44-socket-integrity`,
   `A47-corpse-grounded` and `A48-cadence` live in `tools/gates.config.mjs` under `lane: 'machine-rig'` —
   run them with `--lane machine-rig`. They walk every living species in turn, so they are
   slow (2–3 min) and they are meant to be red until the rig lane lands its fixes.
5. **Budgets live in one file.** `tools/budgets.mjs` exports `BUDGETS` and `PERF_SCENARIOS`;
   no gate hard-codes a threshold. `npm run budgets` prints the contract. Canon **speeds**
   are not thresholds and do not live there either — they are published by the build as
   `ctx.player.speeds` and every locomotion band derives from it (§6).

### 11.1 The runner is gated too (owner: `core-platform-followup2`)

Three harness bugs made the suite lie about the game this round, none of them catchable by
a page assert. `kind: 'runner'` gates run their `check()` in **node** — no browser, no page,
no screenshot, single-digit milliseconds — and flow through the same `emit()` and the same
report as every other gate.

- **Every result prints exactly one verdict line.** `results.push` exists in exactly one
  place (inside `emit`), the gate body is wrapped so nothing can escape it, and the report
  is written from a `finally`. A gate whose page or browser died under it after three
  attempts on fresh browsers lands as
  `[FAIL] <id> {"reason":"browser lost","relaunches":n,"attempts":3,...} retried:true` —
  it used to be counted in the summary and named nowhere, and a run that fell over was the
  one run that produced no `report.json`. A re-run on a fresh browser is flagged
  `retried:true` so green and green-on-the-second-browser are distinguishable.
  Gate: `A79-runner-verdict-line`, which also parses every merged gate body in 7 ms —
  a stray backtick in a comment turns a whole gate into garbage, and three lane files
  (`machine-ai`, `progression`, `world-props`) hit exactly that during Round 4.
  To exercise the browser-death path for real rather than wait for it:
  `node tools/gates.mjs --port <PORT> --extra tools/chaos-gates.mjs --only ZZ-chaos-kill-page,ZZ-chaos-kill-browser`
  — both gates are *expected* to FAIL, and the pass bar is that each prints its verdict
  line and the run finishes and writes its report. That file is deliberately named outside
  the `gates.round4.*.mjs` scan so no suite ever picks it up. Runner-kind gates also launch
  no browser at all: `--lane core-platform-followup2` opens zero Chromes.
- **Chrome profiles are owned and reclaimed.** Puppeteer's own
  `$TMPDIR/puppeteer_dev_chrome_profile-*` is only deleted inside a clean `browser.close()`,
  which neither harness can promise (relaunch on GPU loss, SIGKILL on a wedged exit, death
  with the shell). Dozens of ~70 MB profiles leaked and filled the disk, and gates then
  failed for "no space left on device" — a runner bug wearing a build bug's clothes. Both
  harnesses now launch with an explicit `userDataDir` under `tools/chrome-profile.mjs`'s
  root, dispose it in a `finally` **and** from `exit`/SIGINT/SIGTERM, bin the old one at
  every relaunch, and sweep at startup. The sweep only reaps a profile that is both older
  than 10 min and demonstrably unused — the owning pid is in our directory name and Chrome's
  `SingletonLock` symlink names the pid for puppeteer's — because seven lanes have live
  profiles under that root and reaping one kills a running suite.
  **The orphan case (fix round 2)** is what that rule leaked anyway, and it is the routine
  path here: when the box SIGKILLs a lane at load 45, node dies and its headless Chrome does
  not — it reparents to pid 1 and goes on holding the `SingletonLock`. So the owner pid is
  dead (nobody will ever dispose the directory) while the lock names a *live* pid, which the
  rule above keeps forever. Five such trees pinned 691 MB with 8.4 GB free, several renderers
  burning CPU, and the sweep printed nothing. Two things were wrong and both are fixed:
  (a) our root and puppeteer's now get different rules — for `hzc-<pid>-<port>-<n>`, whose
  name proves which process launched it, a holder whose command line carries
  `--user-data-dir=<this exact dir>` *and* the Chrome-for-Testing binary (pid reuse cannot
  forge either) *and* whose parent is gone is orphaned by construction: SIGKILL it, reap the
  directory, and report it as `reapedOrphans` with the pids, out loud. Puppeteer's root, whose
  owner is unknowable, keeps the conservative never-kill rule unchanged. A holder with a live
  parent is a *running lane* and is always kept. (b) The age cut plays no part in that
  decision, because a live Chrome writes to its profile continuously: the same derelict
  directory measured 92 min old at one probe and 6.7 at the next, so an age rule alone could
  never reach it. Age still guards the one case with no other evidence — dead owner, nothing
  holding the directory.
  **The recycled-owner case** is the same forever-keep reached by another road: pids wrap at
  ~99998 and a long round churns thousands, so eventually `kill(<dead owner>, 0)` succeeds
  because a *stranger* now holds that pid, and the protect-live-lanes branch keeps the
  directory for good. It is reaped only on four agreeing signals — the process table is
  readable and says that pid is not one of our harnesses (`gates.mjs`, `screenshot.mjs`,
  `chrome-profile-selftest`), nothing at all holds the directory, no `SingletonLock` names a
  live pid, and it is past the age cut — and the stranger itself is never signalled: it owns
  a name collision, not a browser. Reported as `reapedRecycledOwner`. On this box every live
  lane's profile is protected by two of those independently (owner alive *and* is `gates.mjs`,
  plus 7–10 Chrome processes holding it).
  Gate: `A80-chrome-profile-hygiene`, whose child builds all five shapes as real processes
  (a node binary reached through a symlink named `Google Chrome for Testing`, orphaned for
  real by a middle process that exits) and asserts the negatives — a non-Chrome holder, a
  Chrome with a live parent, a live harness owner, and the stranger on a recycled pid must
  all survive — as hard as the reap. Verified once end-to-end against a *real* orphaned
  Chrome-for-Testing tree in a sandbox root: MAIN reparented to pid 1, 8 helpers, lock naming
  the live main, directory 8.3 s old against the 600 s cut — 10 pids killed, directory gone.
  Two things the fixture had been getting wrong, both now asserted: `disposeProfile()` on a
  still-locked directory must kill its browser *first* (delete it first and the survivor is an
  orphan whose command line names a path that no longer exists — unsweepable forever), and the
  fixture's own handshake file must be unique per holder, since sharing it made the second
  spawn report the *first* holder's pid and any assertion on it would have demanded the sweep
  shoot a running lane.
- **The counts must add up to the run.** A gate that threw and is not `kind: 'action'` gets
  `status: 'ERROR'`, and the summary counted PASS + FAIL + PENDING + NEEDS-JUDGE only — so a
  31-gate chunk printed `31 gates: 17 pass, 8 fail, 1 pending, 3 need judging`, which is 29,
  with `V24-draw-vs-reference` and `V25-alarm-converge` timing out into a bucket that
  appeared in no total and set no exit code. Every verdict line was there; the arithmetic was
  what lied, and the arithmetic is what an orchestrator reads. The buckets are now derived
  from the results themselves (`tally`), every status present is printed, a status the runner
  does not know is named out loud, and an `ERROR` fails the run like a `FAIL`.
  Gate: `A79-runner-verdict-line` (`countsTotal`), which rejects a hard-coded bucket list.
- **A verdict line that cannot be written is counted, not swallowed.** Defensive, not
  observed: `process.stdout` is built with `kIgnoreErrors: true`, so `console.log` drops a
  failed or partial write with no throw and no event — on a box at 97 % disk with sixteen
  lanes writing screenshots, that is a plausible way for the invariant above to fail
  invisibly, and it is the one failure the reconciliation cannot catch (a dropped line's gate
  HAS reached `emit()`, so it is not in `unrunGates`). Every line now goes through
  `writeLine()` (`tools/gate-verdict.mjs`): `fs.writeSync` on the fd, looping until the whole
  buffer is down, retrying EAGAIN/EINTR, handing a genuinely-backed-up pipe to the stream
  rather than dropping it, and returning **false** only when the line cannot land at all.
  `say()` counts those losses, shouts each on fd 2, reports `droppedVerdictLines` in
  `report.p<PORT>.json`, prints `N line(s) COULD NOT BE WRITTEN` and exits 1. Report writes
  are wrapped the same way (`REPORT WRITE FAILED`) instead of unwinding past the summary.
  Gate: `A79-runner-verdict-line` round-trips a real line through a real fd and asserts
  `writeLine` reports a closed fd as a loss rather than throwing or lying.
- **Read the report, not the scrollback.** Observed on this box while gating the above: a
  suite's redirected stdout log shrank *behind the reader* — 83 KB with a summary at 03:17,
  5.7 KB with none at 05:40, the same file, no writer left alive. `shots/gates/report.p<PORT>.json`
  is the artifact to cite; a log tail is a convenience. A run whose verdict-line count does
  not equal its own summary count is a truncated log until the report says otherwise.
- **No gate may assert a speed band the canon cannot satisfy.** Gate: `A81-canon-speed-bands`
  (§6). It reads the live table out of `src/entities/player.js` — freezing `6.8` in the gate
  would be the same bug one level up — cross-checks it against the animator's `CANON_SPEEDS`
  (two tables means two canons: FAIL), and classifies every comparison of a speed-ish
  identifier to a literal in the 4–12 m/s band:
  - **STALE → FAIL, whoever owns it.** A floor the canon cannot reach, a ceiling so loose it
    asserts nothing, or a fingerprint of Round 3's table (4.6 / 8.2 / 7.5 / 7.38 / 9.5). A
    gate like this can only be made green by putting the wrong speed back.
  - **FROZEN → reported with its owning lane and the one-line fix.** A hand-derived bar the
    live canon still satisfies (a floor at 0.85–0.99× a canon speed, a ceiling at
    1.01–1.25×). It asserts the right thing today and is still owed the prelude, but it does
    not enforce a wrong speed, so it does not fail another lane's build for a style debt.
    **No tolerance** inside `core-platform-followup2`'s own gates or the four gates whose
    subject *is* the speed (`A3`/`A12`/`A13`/`A28`) — those must derive, positively checked.
  The tolerance is only defensible because the gate proves it will fire: every run it
  re-classifies each tolerated literal against a canon scaled 2× and 0.5× and fails unless
  all of them come back STALE, and it runs a 16-case classifier fixture so "no stale
  literals" can never mean "the scanner matched nothing". End-to-end proof that it still
  rejects a real one — `tools/chaos-gates.mjs` carries `ZZ-chaos-stale-speed`, Round 3's
  `spd > 7.5 && spd < 9.5` band verbatim, never auto-merged:
  `node tools/gates.mjs --port <P> --extra tools/chaos-gates.mjs --only A81-canon-speed-bands`
  must print `[FAIL] A81-canon-speed-bands … staleLiterals:[{id:"ZZ-chaos-stale-speed"…}]`.
  Open debt it currently names: `A33-hair-bounce` (`player-anim`) guards on `speed > 6.1`.
  **Every lane gate file imports the one prelude:**
  `import { CANON_SPEEDS } from './gate-speeds.mjs';` then splice `${CANON_SPEEDS}` into the
  assert body to get `SPD`, `SPRINT_MIN`, `SPRINT_MAX` and `JOG_MIN` in scope (it resolves
  PENDING, not FAIL, when `player.speeds` is absent). Absolute bars below 4 m/s — the 3 m/s
  slope cap, a 0.25 m/s idle threshold — are not canon-relative and are not flagged.
- **A locomotion gate stages onto ground it can run on.** Round 4 put a camp (tent, crates,
  bedroll, all with collision) a few metres in front of the spawn point. `A13`/`A19`/`A28`
  already teleported to the flat meadow first; `A3` and `A12` held W+Shift from spawn and so
  measured the *tent* — `sprinting: true`, `moveSpeed: 0.29`, LOOT prompt up, player parked
  at (18.1, 32.1) every attempt, reading 3.6 and 0.41 m/s. That reads exactly like "the new
  canon speed broke the animator", which is the misreading most likely to get the correct
  speeds reverted. All four now share one prelude (`OPEN_GROUND` in `tools/gates.config.mjs`:
  `p.position.set(-60, 0, -45)`, `camYaw = π`), **no threshold changed**, and they measure
  6.71 / 6.48 m/s with `Sprint_Loop` dominant at 0.75 — against the 6.12 floor derived from
  the canon 6.8. `A3`'s detail now also reports `likelyObstructed` when the sprint flag is
  set but no ground is being covered, so the next wall names itself.

6. **A quarantined system still fails your gate.** After every gate the runner reads
   `window.__GAME__.systemErrors` and `engine.hookErrorCount` and FAILs on anything it
   finds, so the guarded frame loop (§4.1) cannot hide a system that throws 60×/second
   behind a `console.warn`. A gate that deliberately makes a system throw declares
   `allowSystemErrors: ['^MySyntheticSystem\\.']`. `A20b-no-system-errors` asserts the
   ledger is empty after a clean boot plus 6 s of play, a resize and two quality swaps.

Scripts: `npm run dev` · `npm run gates` (= `test`) · `npm run shot` · `npm run measure` ·
`npm run budgets` · `npm run optimize`.

### Performance budget

| quantity | budget | measured how |
|---|---|---|
| draw calls | ≤ 350 per frame | `renderer.info.render.calls` accumulated across the whole frame (`autoReset = false`), shadow pass and post included |
| triangles | ≤ 6.5 M per frame | same |
| frame | p95 ≤ 20 ms | rAF interval, median-of-5 bursts of 40 frames |
| JS half of the frame (every system update + `interpolate()` + render submit + frame tail) | p95 ≤ 9 ms | `engine.perfSnapshot().p95JsMs`, whose coverage is declared by `.jsTerm`; split across `.p95SimMs` / `.p95RenderMs` / `.p95TailMs` |
| shadow casters | tier budget (high 150) | `engine.activeShadowCasters` |
| lights casting shadows | ≤ 1 sun (+ CSM cascades) | — |

Scenarios: spawn vista, the west meadow strider herd at (-205, -55), and a staged
eight-machine fight. No per-frame allocations in hot loops.

**Where the frame actually goes** (measured with `engine.enableGpuTimer(true)` +
`perfSnapshot().medianGpuMs`, spawn vista, applied DPR 1.5, interleaved A/B, 3 rounds —
rAF intervals are vsync-quantised at 16.7 ms and cannot resolve this, so do not A/B with
them):

| state | median GPU ms |
|---|---|
| everything on | 20.5 |
| post off (GTAO + bloom + SMAA + grade) | 12.6 |
| post off + shadows off | 12.8 |

So **the post stack costs ≈ 8 ms of GPU per frame, not the ≈ 1 ms an earlier report
claimed** — GTAO ≈ 2.8, SMAA ≈ 1.3, grade ≈ 0.8, bloom ≈ 0, and the rest is bandwidth on
the half-float chain. Merging the grade into the output pass (one pass instead of two)
bought back ~0.8 ms and one draw call. `world-light` should budget accordingly: the scene
render itself is ~12 ms at the spawn vista and ~18 ms at the west herd, which is where the
triangle budget (5.3–6.1 M) is being spent.

**Draw-call attribution** is measured, not estimated: A21 wraps
`renderer.renderBufferDirect` for six frames of the frozen composition and buckets every
call by owner (walk up to the scene child) and by pass (a shadow draw is the one holding a
`MeshDepthMaterial`). The buckets add up to `renderer.info.render.calls` exactly.

Staged west herd, applied DPR 1.5, 474 calls in the frame:

| bucket | main pass | shadow pass |
|---|---|---|
| machines | 192 | 118 |
| vegetation | 59 | 0 |
| unnamed roots (pooled combat VFX) | 49 | 0 |
| props | 10 | 3 |
| player | 9 | 5 |
| terrain + sky | 5 | 0 |
| post chain (21 fullscreen quads + 1) | 22 | — |

Machines are **310 of 474 calls**. That is one draw per machine mesh with no LOD chain at
any distance — `machine-rig` perf-tech-04/14 — and no renderer-side policy substitutes for
it (see the batch ceiling below). Two smaller notes for their owners: the 49 calls under
"unnamed roots" are pooled combat VFX groups that are only visible once machines engage
(4 calls at the spawn vista, 49 at the west herd, **76 in the staged fight**) and they have
no root name, so nothing can attribute them automatically — `combat` / `machine-ai` should
name them and cap the pool. Aloy is
9 main + 5 shadow: she is not the problem.

#### A21 status after fix round 2 — the call term is RED and it is not core-platform's

> **DEFERRAL, on the record.** A21's `drawCalls` term is the one red left in this lane and
> it is **owned by `machine-rig`** (perf-tech-04 LOD chains + perf-tech-14 mesh/material
> budgets). The evidence is measured, not asserted — the per-owner draw ledger and the
> batch ceiling below — and no renderer-side lever closes it. `core-platform` does not
> close A21 by moving a number in `tools/budgets.mjs`. Re-gate A21 after `machine-rig`
> Wave 1 lands. The orchestrator should mirror this deferral in `docs/ROUND4-AUDIT.md` §4,
> which this lane does not own.

A21's scenarios used to teleport the camera and measure whatever the AI had left in
frame; the same scenario read **456 / 341 / 295 calls inside one run**. Every scenario now
*stages* its cast at fixed world offsets (`tools/budgets.mjs` `STAGE_PRELUDE` +
`PERF_SCENARIOS`) and pins those transforms in an `engine.onAfterRender` hook for the
whole measurement, so the composition cannot drift while gait, skinning and both cull
passes keep running at full cost. The capped pass, the halted-sim census and the raw
DPR-2 pass now read the *same* pinned scene instead of one taken a minute later. The
staging is filmed so nobody has to trust the description: `shots/perf-spawn-vista.png`,
`shots/perf-west-herd.png`, `shots/perf-staged-fight.png`. The 8-machine fight used to be
staged on a full ring, which left five of the eight behind the camera — it is a 150°
forward arc now, 8–17 m, all eight in frustum.

Three determinism fixes came out of the same pass:

1. **Dynamic resolution is off for the whole gate** (`engine.setDynamicResolution(false)`),
   and every burst reports `effectivePixelRatio` read back from the renderer. With DRS
   live, `basePixelRatio` is not the ratio being rendered — a burst labelled 1.5 could be
   sampling 1.05.
2. **The screen-space size cull no longer reads the DRS-scaled drawing buffer** (engine
   fix). It measured projected size against the *current* buffer, so a busy frame shrank
   every mesh by 30 % and silently deleted geometry: measured at the spawn vista, dropping
   to `renderScale 0.7` under the old formula took **35 more meshes out of the frame, 29 of
   them machine parts** — exactly when the frame was already struggling — and it made the
   draw-call count a function of GPU load. It reads the base resolution now, and the same
   probe at 1.0 / 0.7 / 1.0 reads 432 / 431 / 431 visible meshes: what is visible depends
   on where the camera is, not on how busy the GPU is.
3. **The frozen-sim burst reports `min == max`.** Halted-sim spread is 0 calls in all
   three scenarios, and capped-1.5 vs raw-2.0 differ by 8–28 calls (both reported).

Staged and pinned, applied DPR 1.5, `sizeCullPx = 7`, caster budget 150:

| scenario | calls (frozen) | **graded (worse of 1.5 / DPR 2)** | shadow pass | main + post | machine draws | pooled VFX | verdict |
|---|---|---|---|---|---|---|---|
| spawn vista | 288 | **296** | 79 | 209 | 85 + 50 | 4 | **within 350** |
| west herd (6 striders + 2 watchers, 9–45 m) | 479 | **489** | 130 | 355 | 192 + 118 | 54 | over by 139 |
| staged 8-machine fight (forward arc) | 497 | **508** | 104 | 404 | 204 + 70 | 73 | over by 158 |

Three independent runs (standalone ×2 and inside a full suite, all on a loaded box) read
288 / 288 / 288, 474 / 475 / 479 and 501 / 502 / 497 frozen calls, spread 0–1 within each
burst. The **graded** column is the number the verdict uses (fix round 2): the worse of the
tier-capped pass and the literal DPR-2 pass. It is 4–10 draws higher than the capped
number, which is exactly the leniency that grading only the capped pass used to hide.

**The batch ceiling — what a renderer-side fix could ever be worth.** A21 computes it from
the live scene (`detail.batchCeiling`): group every rigid, opaque, single-material machine
mesh by material *signature* — the best case for `BatchedMesh`, which needs one material
per batch. The build has **396 machine meshes: 136 skinned (unbatchable — a BatchedMesh
cannot skin), 26 transparent (excluded: batching loses per-object sort), and 234 rigid
carrying 58 distinct signatures.** A perfect engine-side batch is therefore 396 → 245
draws world-wide, ~151 saved, and at the west herd it does not reach the budget because
the herd's own cost is dominated by skinned meshes (a strider is 13 meshes, 7 of them
skinned) with near-unique materials. A plain geometry *merge* is worth even less than that
ceiling: the rigid meshes hang off different animated nodes, so only a `BatchedMesh` with
per-instance matrices could batch them at all, and a merged far-proxy would freeze the gait
it replaced.
**A21's `drawCalls` term therefore stays failing against this lane's ledger until
`machine-rig` lands perf-tech-04 (offline LOD chains + skinned bounds) and perf-tech-14
(per-species mesh/material budgets).** The gate names that owner in `detail.blockedBy`;
do not close it by moving a number in `tools/budgets.mjs`.

**What would close it, in numbers `machine-rig` can build against.** At the west herd the
machines cost 192 main-pass draws + 118 shadow draws = 310 of 474; in the staged fight,
205 + 70 = 275 of 501. Cutting 124–151 means the machines in frame must fit in ~155 draws:
**≤ 8 rendered meshes and ≤ 5 shadow casters per machine at 8–45 m** (LOD1), ≤ 3 / 1 beyond
60 m (LOD2). Collapsing per-mesh material
clones into ≤ 4 shared tinted materials per species is what makes those merges possible in
the first place; the current spread is 4–16 distinct signatures per species (thunderjaw:
16 signatures for 28 rigid meshes).

Also note for `world-light`: enabling CSM renders the shadow pass once per cascade — the
spawn vista measured 292 → 415 calls with three cascades on before this round.
`engine.shadowCasterBudget` is a **draw** budget now: `_cullPass` admits
`budget / cascades` casters, ranked by distance (a distance *threshold* let ties through —
`dist − radius` clamps to 0 for anything the camera stands inside — and a 150 budget was
passing 198 casters). Measured after the fix, spawn vista: CSM off 129 casters / 285 calls
→ CSM 3-cascade 50 casters × 3 = 150 shadow draws / **286 calls**. Turning the cascades on
no longer costs a frame; it costs shadow *reach*, so raise the budget deliberately if you
have room.

**The frame-time term only counts on a box that can present a frame.** A21 measures a
*null frame* — scene hidden, no post, no shadows, DPR 0.5, i.e. a clear and a present —
**after every scenario**, and takes the worst of the three. rAF is vsync-locked, so a
healthy null frame reads ~16.7 ms. It also measures *instability*: four bursts of one
frozen composition that disagree by more than 1.4× are not measuring our frame. If either
witness trips, the gate reports every frame/JS number exactly as measured and sets
`clockTermsCounted: false`.

**An unjudged term is PENDING, never PASS** (fix round 2). When the clock terms are
excluded, A21 resolves `pass: null` → PENDING, *not* a pass on the deterministic terms
alone. A red deterministic term (draw calls, triangles, or an attributable GPU timer)
still FAILs immediately — counters do not care how busy the box is — but a green
deterministic set with the wall clock unattributable reads "not judged", so the frame
budget stays visibly owing a quiet-box run instead of turning green the day the draw-call
term does. Same rule in `A9-perf-budget`: its draw-call half always counts, and its fps
half goes PENDING when the witnesses say the number is not ours.

**The GPU timer votes, but only when it can witness itself.** `EXT_disjoint_timer_query`
is not vsync-quantised, so it resolves what rAF cannot — but it measures elapsed time on
the GPU *timeline*, which means it is inflated when our command stream is queued behind
another client's (measured on this box: the identical all-on configuration read 42.8 ms
and then 70.8 ms minutes apart, and a trailing null probe caught a quiet gap at 0.53 ms
while the scenarios had been measured against a second suite). So the GPU term counts only
when *both* hold: every per-scenario null frame reads < 3 ms with nothing drawn, and the
four bursts of one frozen composition agree within 1.4×. When it counts, a median GPU time
over the frame budget is a FAIL nobody can wave away. With sixteen lanes on one GPU,
west-herd GPU time reads 42–105 ms against 20.5 ms measured idle; that is the neighbours,
and it must be re-run on a quiet box before anyone attributes it to the renderer.

**The JS term is the whole main loop** (Round 4 judge finding, Wave 0 follow-up). It used
to be `engine.render()`'s return value alone — cull + CSM + composer — so every system
update, every fixed sub-step and every `interpolate()` ran *outside* the number the 9 ms
"systems + submit" budget was written for: a frame that spent 30 ms in system updates
reported ~3 ms of JS. `main.js _frame()` now times the callback in three parts (sim,
render submit, frame tail) and records the total **last**, so the tail is this frame's;
`perfSnapshot()` publishes `p95JsMs` plus `jsTerm` and the split, and F3 prints
`js <p95> = sim + submit + tail`. **A21 refuses to grade `p95JsMs` unless `jsTerm` says it
covers the whole loop** — a build that does not declare it resolves that term PENDING with
that reason rather than passing on the submit half.

**Every A21 term carries its own status.** `detail.terms` gives each of `drawCalls`,
`triangles`, `medianGpuMs`, `p95FrameMs`, `p95JsMs` a PASS / FAIL / **PENDING + reason**,
what it measures, and its blocker; the verdict is FAIL if any term fails, PENDING if any
term could not be measured honestly, PASS only when every term was judged and green. The
JS term gets its own witness on top of the null frame: a fixed, allocation-free arithmetic
loop (`cpuProbe`) timed after every scenario, because JS milliseconds are
`performance.now()` deltas and a preempted or thermally throttled core inflates all of
them. If that loop takes more than 1.4× longer in one scenario than another, the JS term is
PENDING with the two numbers printed.

**`A22b-fov-recompile`** (`tools/gates.round4.core-platform.mjs`) guards the studio FOV
slider. Enter the studio, set `studio._fov` to 25 / 80 / 55; six frames after each, the
composited canvas must not be a flat colour — a 64×64 downsample read back inside
`engine.onAfterRender` must have luminance stddev > 8 (measured: 35–42 on a real frame,
exactly 0.00 with the scene hidden) — with zero console errors, and the 25 and 80 frames
must differ (a stale canvas would otherwise pass both). The last phase drops
`engine.grade`'s define cache so `OutputGradePass` genuinely relinks *while it is the pass
writing to the canvas*: that is the path where the double-injected tonemap/colorspace
chunks black-screened the studio.

**A21's grading DPR.** §4 says "accumulate 20 frames at DPR 2". The gate measures both the
tier-capped pass (applied ratio 1.5, which is what perf-tech-05 actually ships) and the raw
DPR-2 pass, and **grades every term on the worse of the two**. Grading the capped pass
alone was quietly lenient: the screen-space size cull thresholds on `basePixelRatio`, so a
lower applied ratio culls more meshes and reports fewer draws (measured: up to 8 hidden).
`detail.graded` carries the numbers the verdict used; `detail.capped` and
`detail.rawDpr2` carry both passes in full.

> Consequence the orchestrator should rule on: taken literally, §4 puts the **frame**
> budget at DPR 2 as well, and DPR 2 is ~1.8× the pixels of the ratio the game actually
> ships at (the `high` tier caps at 1.5 — that cap *is* the perf-tech-05 fix). A 20 ms p95
> at DPR 2 may simply not be reachable on this hardware. This lane has taken the strict
> reading rather than quietly grading itself on the easier pass; if §4 meant "at the tier's
> applied pixel ratio", amend §4 and this gate follows. Both numbers are in the detail
> either way, so the choice can be made on evidence.

---

## 12. Round 4 architecture decisions (all taken as recommended)

- **D1 (b)** — keep the existing 424-joint Aloy rig and extend the Round-3 clip base
  (Mixamo baked into our GLB + CMU BVH approved). Procedural keeps only what clips cannot
  do: crosshair-true nock IK, foot lock, look-at, springs, aim additive.
- **D2** — hybrid audio: lift the "100 % procedural, no asset files" clause. Curated CC0
  samples (foley/creatures/ambience/UI) + a composed or licensed stem score, with a license
  manifest; procedural stays where it is idiomatic (Focus hologram, elemental zaps, UI).
  **No Aloy VO** — breath and effort only.
- **D3** — kitbash plate/muscle shells over the existing Sawtooth/Thunderjaw/Behemoth;
  generate or kitbash new Scrapper/Longleg/Glinthawk. **No non-commercial (CC-BY-NC) assets.**
- **D4** — hand-rolled physics on three-mesh-bvh: static BVH queries + a kinematic capsule +
  the existing debris integrators. No Rapier.
- **D5** — fixed-step simulation now (60 Hz accumulator + render interpolation). Shipped in
  Wave 0; see §4.1.
- **D6** — keep the 720 m bowl and spend the budget on density, verticality and a real rim.
  Day/night in scope, rain in scope, snow cut.
- **D7** — progression vertical slice: XP + level + a 6–12 node skill tree + save/continue +
  tutorial chain + one merchant. Outfits, mods/coils, rarity, Cauldrons deferred.
- **D8** — module ownership replaces frozen files (this document). Round 3 is committed and
  tagged `round3-checkpoint` on branch `round4`.

---

## 13. Audio (owner: `audio`)

**D2 is taken: the "100 % procedural, no asset files" clause is lifted.** The mix is hybrid.
Samples carry anything that wants a recording — surfaces, creatures, weapons, ambience;
synthesis keeps what it is genuinely better at — the Focus hologram, elemental zaps, UI blips,
the wind bed, the adaptive pluck layer. Files: `src/audio/**`, `public/audio/**`.

### 13.1 Asset policy (non-negotiable)

Every file in `public/audio/` must have a row in `src/audio/manifest.js` whose `license` is on
`ALLOWED_LICENSES` (`CC0-1.0`, `CC-PD`, `Unlicense`, `PD`). `SampleBank.load()` **refuses** any
other row, and gate `A73-sample-bank` fails on a decoded buffer without a licence. CC-BY-**NC**
can never enter the bank (D3). The human-readable manifest is `public/audio/MANIFEST.md`;
budget 40 MB, currently **2.31 MB / 149 files / 95 sets**.

The loader is format-agnostic (`.ogg`, `.webm`, `.wav` all decode), so adding curated CC0
downloads is a data change: drop files, add manifest rows, mirror them in `MANIFEST.md`.
The current seed bank is synthesized by `tools/audio-bank.mjs` + `tools/audio-recipes.js`
(deterministic; re-running reproduces it byte-for-byte) and dedicated CC0 by this project.

### 13.2 Bus graph

```
                                    ┌── sfxVol   ←── sfxBus
                                    ├── ambVol   ←── ambDuck ←── ambBus
destination ← comp ← master ← worldLP┤── voiceVol ←── voiceBus
                       │            └── fxReturn ←── convolver ← reverbSend
                       ├── musicVol ← musicDuck ← musicLP ← musicBus
                       └── uiVol    ←── uiBus
```
`worldLP` covers the whole diegetic world — Concentration muffles footsteps, machines and the
reverb tail together, and **the heartbeat is gone** (`audio-09`). `uiBus` bypasses `worldLP` and
every ducker (`audio-12`). The reverb return re-enters *under* `worldLP`.

### 13.3 Published `ctx.audio` API

```js
audio.playAt(setId, position, opts)  // 3D one-shot; false when the set is absent
audio.play2D(setId, opts)            // non-positional (UI / first-person foley)
audio.setVolume(bus, 0..1)           // bus: master|music|sfx|ambience|voice|ui
audio.getVolume(bus) / audio.volumes() / audio.setMuted(bool)
audio.bankAudit()                    // { size, sets, megabytes, licenses, unlicensed, failed }
audio.probe3D(points, opts)          // offline render of the REAL graph -> per-ear energy
audio.probeSet(setId)                // offline render of one cue -> peak/rms/bands/centroid
audio.recentCues() / audio.contractCounts() / audio.level() / audio.debugState()
```
`opts` for `playAt`: `{ volume, category:'sfx'|'ambience'|'voice'|'ui', priority, rate, height,
track, duck, duckHold, reverb }`. Voices are pooled (28 chains): at the cap the pool steals the
oldest **lower-priority** chain with a 25 ms fade and refuses the sound if nothing quieter is
playing (`audio-14`).

**Loop chains are a second, separate pool** (8 chains) for the per-machine servo idle beds. A
looping bed must never compete in the one-shot pool — at `PRI.ambience` a single footstep would
steal a Sawtooth's idle hum and it would never come back — so loops are minted by `_loopChain()`
into `_loopChains`. That pool has its own reclaim rule, and it is load-bearing:

> **Invariant:** `loopChainsBusy` may exceed `servoLoops` only by the chains currently
> mid-fade. It must return to `servoLoops` within one fade.

Every teardown goes through `_retireLoop()` — fade the emitter, reserve the chain for exactly
that fade, then let `_reclaimLoopChains()` (run each `_updateSpatial` tick and at the head of
`_loopChain()`) dispose the emitter and hand the chain back. Nothing may clear `busy` by hand:
freeing early wires a still-audible bed to the next machine's position, and freeing never at all
made the 8-chain pool one-way, so eight deaths in earshot permanently silenced every machine in
the world. `LoopEmitter.stop()` only fades — whoever recycles the chain must call
`LoopEmitter.dispose()` to unhook `out`. `debugState().layers` exposes `servoLoops`,
`loopChains` and `loopChainsBusy`; gate `A78-loop-reclaim` pins the invariant across 12 deaths.

`ctx.settings.audio` = `{ master, music, sfx, ambience, voice, ui, muted }`, persisted to
`localStorage['hzc.audio.v1']`. `shell-menus` owns the sliders and writes them through
`setVolume()`; `audio` owns the values. `audio-settings-changed` is emitted on every write.

### 13.4 3D model

`PannerNode` (HRTF for the 16 nearest chains, equalpower beyond), `distanceModel: 'inverse'`,
`refDistance 2`, `rolloff 0.9`, `maxDistance 600` — 300 m attenuates to 0.4 % of the reference
level. On top of the panner:
- **air absorption**: one-pole low-pass halving every 26 m;
- **head shadow**: sources behind the listener lose 55 % of their cutoff and 16 % of their level
  — a generic HRTF barely separates front from back, and without this an arrow loosed behind you
  reads as one in front;
- **occlusion**: `ctx.collision.occluded(a, b)` per chain, throttled to ~110 ms and staggered,
  smoothed over ~150 ms; blocked sources lose 55 % of direct level, drop to a ~500 Hz cutoff and
  send ~2× more reverb. Degrades silently to "no occlusion" until the `spatial` lane installs.

### 13.5 Event contract

`audio` **consumes** these; the named lane emits them. Every listener is live and no-ops when its
emitter has nothing to say, so shipping a cue is a data change, not a code change.
`audio.contractCounts()` reports what has actually arrived. As of Wave 3 every row below has a
live emitter and has been observed arriving in a gate.

```
'machine-footfall'      { machine, kind, foot, index, position, speed, runK, strength, mass, surface }
                                                               machine-rig (rig/footfall.js — BOTH the
                                                               GaitController and FootLock paths, so the
                                                               clip-driven watcher/longleg fire it too;
                                                               glinthawk flies and never does)
'machine-death-impact'  { machine, kind, mass, position, strength }   machine-rig (rig/ground.js, once
                                                               ~0.55 s after death, when the wreck lands;
                                                               for camera shake and the collapse cue)
'machine-stagger'       { machine, point, severity }           machine-ai / combat
'machine-state'         { machine, state|to, prev|from }       machine-ai   (ai/index.js emits
                                                               {machine,state,prev}; the listener also
                                                               accepts {to,from}. to: suspicious|search|
                                                               alert|alarm|attack|idle|patrol|calm)
'machine-scan'          { machine, position, hit }             machine-ai
'machine-attack-phase'  { machine, kind, attack, phase, index? } machine-ai (phase: windup|strike|recover|
                                                               end|cancel. `index > 0` marks the n-th
                                                               projectile of a volley and swaps the roar
                                                               for a launcher thump — nothing emits it
                                                               yet, so a volley reads as one strike)
'machine-killed'        { machine }                            machine-ai
'arrow-hit'             { point, machine, weak, type, damage } combat   (damage picks the hit rung)
'part-torn' / 'machine-damaged'                                combat / machine-ai
'arrow-fired' / 'arrow-nocked' / 'arrow-draw' / 'weapon-empty' / 'weapon-switch'   combat
'player-jump|land|mantle|dodge|splash|crouch|hurt|died|respawn'                    player-control
'loot-rummage' / 'machine-disposed'                            focus-items / machine-ai (both silence
                                                               the wreck's loot beacon)
'level-up' 'skill-unlocked' 'quest-started' 'quest-complete'
'datapoint-found' 'discovery' 'supply-cache' 'override-node'
'hunting-ground'                                               progression (all fire the discover sting)
'ui-nav' / 'ui-confirm' / 'ui-back' / 'ui-error' / 'ui-open' / 'ui-close'   shell-hud, shell-menus
'inventory-open' / 'inventory-close'                           focus-items
```
Two listeners are deliberate aliases with no emitter today and are kept as the cheaper contract
should a lane want them: `'machine-suspicion' { machine, lost }` (the warble is otherwise driven
off `machine-state`) and `'machine-looted' { machine }` (covered by `loot-rummage`).

`audio` **emits** `'audio-settings-changed' { …volumes }`.

`terrain.surfaceAt(x, z)` (owner `world-ground`) selects the player footstep set. **Every one of
`Terrain.SURFACES` has its own recorded set** — `water cobble silt dirt gravel rock snow grass`
— plus aliases (`meadow moss → grass`, `path sand → dirt`, `mud → silt`, `stone → cobble`,
`scree shale → gravel`, `metal → rock`, `ice → snow`) so a vocabulary addition degrades to a near
neighbour rather than all the way back to `foot/grass`. `A76-footfalls` sweeps the valley on a
10 m × 6° polar grid and walks on every surface that sweep produces: a silent surface, or one
that falls through to `foot/grass`, fails the gate.

### 13.6 Bank contents (95 sets / 149 files)

| group | sets | what it carries |
|---|---|---|
| `foot/` | 8 | one per terrain surface, 4 variations each |
| `gear/` | 2 | `light`/`heavy` strap-and-quiver foley over the harder strides |
| `aloy/` | 6 | `effort`, `effort-hard`, `hurt`, `breath-in/out/hard` — **no VO** (D2) |
| `bow/` | 15 | `{hunter,sharpshot,war} × {nock,draw,release,flyby,empty}` |
| `hit/` | 7 | the ladder `plink→thunk→crunch→crit` + `flesh-soft/hard` + `ground` |
| `status/` | 3 | `burn`/`shock`/`frost` positional loops |
| `voice/` | 16 | `<8 species> × {windup,strike}`, spectrally distinct (A75) |
| `idle/` | 8 | one servo idle bed **per species**, not one shared hum |
| `mstep/` | 3 | footfall by weight class, 3 variations each |
| `machine/` | 9 | `servo-loop stagger powerdown collapse loot-beacon scan-ping alarm warble unwarble` |
| `amb/` | 7 | `meadow river forest ridge night` beds + `campfire` + `call-far` |
| `music/` | 11 | 7 stems + 4 stingers (§13.7) |

### 13.7 The adaptive score (`src/audio/music.js`)

Seven composed stems at **96 BPM** — bar 2.5 s, 4-bar phrase 10.0 s. All seven start at one
`AudioContext` timestamp and **never stop**; only their gains move, so a transition can never
land off the beat because the combat kit has been running silently in phase since the context was
armed. Crossfades are scheduled on the bar grid derived from that origin; `quantised` is computed
from the measured error of every transition the session actually scheduled, not asserted.

States are *chords of stems*, not tracks: `suspicious` keeps a quarter of the exploration pad,
`combat` keeps the tense drone under the kit. Escalation is fast (0.25 bar into combat),
de-escalation slow (2 bars back to calm), and leaving a fight routes through a `resolve` phrase
rather than snapping to calm. Stingers (`combat`, `resolve`, `alert`, `discover`) are one-shots
and are deliberately **not** quantised — a stinger that waits for the bar arrives after the thing
it reacts to.

`_musicSelect()` names the state at 4 Hz from two inputs: a poll of the machine roster's FSM
within 120 m, and hold windows stamped by the `machine-state` / attack handlers. Published:
`audio.setMusicState(name, opts)` and `audio.sting(name, opts)`. Everything is scheduled against
`ac.currentTime`, never gameplay `dt`, so `engine.timeScale` (Concentration, the wheel, the
studio freeze) cannot slow the music down. If a stem fails to decode, `available` stays false and
the pre-Round-4 procedural score runs instead of silence.

`A77-music-states` drives calm → suspicious → combat → resolve through the real `machine-state`
contract and requires every crossfade on the bar grid, real stem gains at each end of the fade,
and exactly one combat and one resolve stinger.
