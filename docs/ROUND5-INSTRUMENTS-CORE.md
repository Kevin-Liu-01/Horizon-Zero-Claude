# ROUND 5 — lane `instruments-core` (W0b report; the W0a report follows below)

Port 5254. Worktree `scratchpad/r5/instruments-core/tree` (branch `r5/w0b-instruments-core`), based on
main `a953355` (W0a merged + PLAN §8.3). Plan rows used: §2 (`instruments-core`), §1.2 (the W0 machines
grant: `machine`, `index`, `variety-assets`, `parts`, `ai/{tables,attacks,perception,index}`,
`ai/stimulus.js` ≤ 10 lines, `rig/lod.js` ≤ 6 lines for `uv1` + PALETTE + quantise flag, `rig/fx.js`
palette defaults), §3.1 (W0b exit: "lamps + roles + perk hooks live"), §3.2 (the two contracts this
lane owns), §4.1 (lamp beams: 64 per cone, instanced, 1 draw), §6 (no W0b deletions for this lane),
§8 (R17, R18, R28, R30, R34), §9 (`instruments-core` W0b block, the per-kind block, the global list).

**HOW TO RUN.** `tools/gates.mjs` (frozen harness, unchanged) merges `tools/gates.round4.*.mjs` by its
directory scan plus ONE `--extra <file>`, with the same `GATES`-array merge. gates-perf's r5
auto-discovery (`LANE_FILE_RE` in `gates.config.mjs`) is not in main yet, so this lane file rides in on
`--extra`:

```
R5_SCRATCH=<scratchpad>/r5/instruments-core \
R5_GATE_ROSTER=<gates-perf tree>/tools/gate-roster.mjs \      # only until gate-roster.mjs is in the tree
node tools/gates.mjs --port 5254 --extra tools/gates.r5.instruments-core.mjs --lane instruments-core
node tools/gates.mjs --port 5254 --extra tools/gates.r5.instruments-core.mjs --lane instruments-core-kind   # the per-kind block on the fixture
R5_IC_FILM=1 node tools/gates.mjs --port 5254 --extra tools/gates.r5.instruments-core.mjs --lane instruments-core-film   # the lamp films (advisory)
```

Once auto-discovery merges, drop `--extra` (the file exports `GATES` in the registry shape) and the
shadow rows change id from `<id>@ic` to `<id>` by themselves (`shadowId()` reads
`gates.config.mjs` for `LANE_FILE_RE`), so they shadow the carried rows of the same id (§3.3).
`R5_GATE_ROSTER` is read only when `tools/gate-roster.mjs` is absent.

---

## W0b — what was built, by deliverable

### 1. `LAMP_STATES` — the lamp grammar (bible §7.2), iris + one-draw beam
`src/instruments/lamps.js` (new). Shape, then motion, then colour:

| state | token | iris (lit area) | rhythm | beam |
|---|---|---|---|---|
| calm (patrol, return) | `#F2EAD3` | 100 % | steady | never |
| wary (suspicious, search) | `#B5E61D` | 50 % | 1 Hz pulse (trough 0.55) | sweeping ±14° at 0.5 Hz toward `lastKnown` |
| hostile (alert, attack, stagger, downed) | `#FF2D8C` | 20 % (pinhole) | 4 Hz flicker (trough 0.30) | locked on the player's chest |
| dark (dead, a lamp hit for 6 s, Clouded = `stunT`) | `#3B3A36` | closed, cracked | 0.55 s sputter of the last colour, then out | never |

- **Two instanced draws for every lamp of every Instrument** (`LampSystem`, owned by the manager as
  `machines.lamps`): one `InstancedMesh` of lamp drums and one `InstancedMesh` of additive
  64-segment cones (the beams, §4.1 "1 draw"). A lamp drum is the face disc plus a short barrel, and
  the lens, the core, the six swept blades, the drum face, the bezel and the dark fracture are all one
  shader; capacity is 128. A kind registers its lamp once with `machine.addLamp(at, { radius })`;
  nothing is per machine (no geometry, material or texture). The states, colours and apertures are
  written in `Machines.interpolate()`. The instance matrices are written in the scene's onBeforeRender,
  from fresh world matrices. Both paths are allocation-free, and records self-prune when a machine is
  disposed.
- **Fix round 1: the lamp reads at noon** (judge finding; see "W0b FIX ROUND 1" above).
  - **Core:** a hot core above the bloom threshold (bible §7.2) inside the token ring.
  - **Drum face:** a dark graphite drum face around the glass (the retracted blades and the housing).
  - **Barrel:** a graphite barrel lit by the sun and sky, sinking into the hull.
  - **Lens size:** on the Tiller the lens is 0.264 m across in a 0.40 m face.
- **The ring on screen is the token.** The engine tone-maps (ACES), sRGB-encodes and grades every
  pixel in one output pass, so the ring carries the HDR value that the output pass maps back onto the
  token. This is `outputInverse`: the grade, the sRGB transfer and the ACES fit inverted analytically,
  then Newton on an exact copy of the forward pass.
  - **Core value:** the core is ×2.5 the ring's HDR, raised until it clears the live bloom threshold
    by ×1.25.
  - **Re-solve:** it runs only when exposure, a grade uniform or the bloom threshold changes (a cheap
    change test per frame, plus the full signature every 64 frames).
  - **Allocation:** a re-solve allocates nothing.
  - **Lamps are not lit like the hull:** they never cast shadows, are not fogged, and their G-buffer
    copy is skipped. A `scene.onBeforeRender` chain hides both draws when `scene.overrideMaterial` is
    set (the GTAO normal/depth pass), so one draw stays one draw.
- **Beams** are drawn only in wary/hostile and only when the air carries them: aerial-fog density
  multiplier > 1.2 (`environment.weatherParams.densMul`) or `nightFactor` > 0.5. Length = the
  machine's sight range × `perceptionScale`; half-angle 5°; brightness falls with length (`along²`)
  and toward the silhouette (`|n·v|²`). Fixed this round (from the films): the cone is scaled
  non-uniformly (radius × radius × length) and its normals were not taken through the inverse scale,
  so every normal leaned down the axis and the shaft read as a flat, hard-edged wedge that grew
  brighter with length; normals now go `M (n / s²)` (= `R S⁻¹ n`). Fog boost raised from
  `0.35 (densMul − 1)` to `0.8 (densMul − 1)` so a beam reads in daytime fog.
- **Every glow the machine owns follows the same grammar** (`machine._updateEyes`): eye sprites,
  flat emissive lenses and shell sensor strips use `lampStateFor` / `lampGain` on the SIM clock;
  `EYE_COLORS` are the four tokens (legacy kinds included, until they go at W2). The Round-4
  white-hot windup flash stays only on machines WITHOUT an iris lamp (the legacy kinds' dodge cue).
- **The Tiller fixture** (`src/instruments/kinds/tiller.js`) registers its drum lamp at body
  `[0, 2.28, 2.085]`, face radius 0.20 m (fix round 1; was 0.18) (just in front of the generator's lens dome, riding the head
  bone); the drum lamp is its weak point, and a precise hit darkens it for 6 s (`lampDarkT`, which
  also blinds its perception: sight range 0, no omni).
- Published for shell-ui (W2): `COMPASS_PIP` (the lamp tokens + apertures for the compass ◆), and
  `SCANNER_TOKENS` / `SCANNER_HIGHLIGHTS` (bible §9.7 paper / ink / cobalt), so no HUD file re-types a
  lamp colour.

### 2. `ctx.machines.roles`, kind auto-registration, per-kind tables (W0a; graded again at W0b)
Unchanged from W0a (contract below). New this round: `A-roles-published` now GRADES its last clause,
"`tools/gate-roster.mjs` resolves every role": it runs gates-perf's `ROSTER` prelude in the page and
requires every role to resolve to the published kind (herd → `tiller`) or to `null` with a SKIP label,
and the roster's `STAGED_KINDS` to hold no legacy kind. The module is read from the tree, or from
`R5_GATE_ROSTER` until gates-perf merges; with neither the gate is PENDING by name, never PASS.

### 3. Perception weather hook + `perceptionScale`
`src/instruments/lib/weather.js` (new): `perceptionScale(env)` — `environment.perceptionScale` when
world-sky publishes it (W1, authoritative), else bible §2.3 by the weather NAME (`trade`/`clear` 1.0,
`calima`/`fogbank` 0.5, `squall`/`rain` 0.8) and night ×0.7 (`nightFactor` blend), the smaller
applying. `ai/perception.js` multiplies every Instrument's sight range by
`machines.perception.sightScale` (read once per sim step). No edit to `environment.js`.

### 4. The perk hooks (§3.2 contract, bible §4.7) and the Dust-sight occlusion flag
`machines.perception` (`PerceptionHooks`, `ai/perception.js`) and `machines.stimulus.addNoiseFilter`
(`ai/stimulus.js`, +7 lines of the ≤ 10 granted):
- `perception.detectMul` (default 1) multiplies the sight FILL RATE of every Instrument that has not
  found her (calm, wary); alert/attack/stagger/downed are unchanged ("Read as true": 0.5).
- `perception.flagDuration` (default 8 s; "Shrug": 3). A Flag is raised by a machine whose perception
  row says `flags: true` (or `machine.flagsOnSight`) when it goes alert BY SIGHT with a lit lamp (a
  dark lamp cannot Flag); every Instrument within `flagRadius` (60 m) is marked (`machine.flagMark`),
  searches toward her, and the mark clears when the Flag ends. Events `flagged`, `flag-ended`.
- `stimulus.addNoiseFilter(fn)` → remover; `fn(ev)` sees every stimulus first; `false` drops it.
- Dust-sight: `perception.addDustCloud({ x, y, z, r, seconds })` → remover; a cloud blocks every
  Instrument's line of sight through it (`hasLOS`); `machine.dustOccluded` (5 Hz) is THE occlusion
  flag — Dust on the line from her eye, or calima beyond 24 m; `perception.outlined(m)` =
  `dustSight && m.dustOccluded` is what shell-ui's Sighting overlay outlines (W2).

### 5. `uv1` survives the fold
`rig/lod.js` (`normalizeAttrs` + `mergeByMaterial`, 5 lines of the ≤ 6): a merge group whose material
samples the second UV set (any texture with `channel === 1`, or `material.userData.uv1 === true`)
keeps `uv1` through the merge (and gets zeros for a member that lacks it); groups that do not
sample it still drop it. Same grant: `INSTRUMENT_PALETTE` (bible §7.1 / §9.1: bone, celadon,
oxblood, bronze, verdigris, graphite, vermilion, staff white) and `unifyMaterials(m, { quantise:
'instrument' })`; `quantise: true` keeps the Round-4 palette for the legacy kinds, `false` (the
Tiller) keeps a generated kind's own palette.

### 6. The VFX palette
`src/instruments/lib/vfx.js` (new, no imports): `VFX_COLORS` — Cinder / Brine / Dust element ramps
(bible §5.8), salt-crust glints, bronze chips (the `rig/fx.js` default spark and `_arcFlash`, was ice
blue `0xbfe8ff`), the loot beacon (was cyan), the Seized plate tint, late flame (no longer lerps to
the hostile lamp), sensor ping rings (the calm token). Every machine emitter in `machine.js`,
`ai/attacks.js`, `rig/fx.js`, `legacy.js` and the legacy species files reads it; `parts.js` sensor
parts start in the calm token.

### 7. R34 — the role-based memory workload (A90b 3/3, A90-rig-reclaim 5/5)
`Machine._releaseOnDispose()` (the last step of a disposed machine): lamp record and Flag mark
released, every SkinnedMesh skeleton disposed and unbound, bone arrays emptied, the subtree cut from
`root`, and every field still pointing into it nulled, so a stale reference to a Machine retains a
shell, not a sculpt. `index.js` `releaseBuildScope(m)` rebuilds `machine._rot` over the rig alone,
so `autorig.buildRig`'s closure scope (the replaced Meshes) can be collected (measured before: 2
detached Meshes per live auto-rigged machine).

### 8. `tools/gates.r5.kind-block.mjs` — the per-kind block
`kindBlock({ kind | role, lane, class, fixture, suffix })` returns the 25 §9 rows for one kind (ids
`<§9 id>:<kind or role>`); the module's own `GATES` is `[]` so auto-discovery registers nothing by
itself. The Round-4 per-species rows are vendored VERBATIM (bars unchanged) with the
"one machine per species" prelude replaced by "one machine of KIND". Fixture clauses that are
fidelity-only (A-sil40 pair set, A-weak40 glaze contrast, A42 / A-linked-attack components, V26 /
V27 / V-lineup) report `SKIP-fixture` with the measured numbers. Hand-over: the orchestrator at W1;
instruments-a/-b/-c/-d call it for their kinds.

### 9. Gate-file hygiene for the W0b-exit scans (this round)
- **No species literal, no old-map coordinate** in either gate file (gates-perf `A-gate-preludes`
  grades every lane's file at its exit): the old kind names the static scans need now come from the
  spec (bible §10.2's "old kind" column, plan §6's IP row; the corrupting kind from the W0a base's
  doctrine), the probe kind spawns relative to `REST_SITE`, and the vendored A47c's
  `SPRAWLERS = [two Round-4 kinds]` became `[...species.keys()]` (plan §9 A47c: "mass height ≤ 0.75
  × the locomotion pose height (sprawler rule)" for every Instrument). gates-perf's own scanner, run
  in a scratch copy of its tree with these two files dropped in: 0 offenders in both.
- **The lamp films are not registered by default** (`R5_IC_FILM=1` registers them). This lane's §9
  block has 0 visual gates (A-lamp-states grades the lamp from rendered pixels); the films are
  advisory frames with no licence-clean reference yet, and gates-perf's `A-reference-set` would count a
  registered visual row without one against this lane.
- **Brand lexicon (code lint)**: brand's `namecheck.mjs --code`, run on a scratch copy with brand's
  lint folder: the coined `brineFrost` became `seizedTint`; `type: 'tearblast'` (a Round-4 arrow
  name used as a damage label; `takeDamage` reads only `fire`/`shock`/`freeze`) became `'tear'`; the
  vendored comments that named Round-4 kinds were reworded; the gate no longer writes `brittleT`
  (the Brine hit already seizes the plates). One pair remains in `kind-block.mjs`:
  `scene.overrideMaterial` (three.js API, A-sil40's flat-ink pass) — brand, please allowlist it for
  `tools/gates.r5.kind-block.mjs`.

---

## Contracts published (exact signatures; W0b additions — the W0a contract follows in the W0a report)

### `ctx.machines.lamps` — `LampSystem` (`src/instruments/lamps.js`)
```
lamps.attach(machine, anchor: Object3D, { radius = 0.13 } = {}) -> record | null   (one lamp per machine; null at capacity, with one console.warn)
lamps.detach(machine) -> boolean
lamps.stateOf(machine) -> 'calm' | 'wary' | 'hostile' | 'dark'
lamps.lampHdr(stateId) -> { r, g, b } | null      the solved RING value (a copy)
lamps.coreHdr(stateId) -> { r, g, b, k, lum } | null   the core: ring HDR x k (k >= 2.5, raised to clear the bloom threshold x1.25), its HDR luminance (fix round 1)
lamps.beamsOn() -> boolean                          densMul > 1.2 or nightFactor > 0.5
lamps.audit() -> { lamps, beams, capacity, lampDraws, beamDraws, solves, fogK, night, beamsOn, states }
lamps.update()                                      called by Machines.interpolate() once per rendered frame (states, colours, apertures)
lamps._writeMatrices()                              the instance matrices, from the scene's onBeforeRender (fresh world matrices, before upload)
lamps.lampMesh, lamps.beamMesh, lamps.group         the two instanced draws (and their parent in the scene)
lamps.records, lamps.beamDraws, lamps.lampDraws, lamps.beamCount, lamps.fogK, lamps.night
lamps.hideBeams = false                             gate/debug: draw the frame without the beams
lamps.dispose()                                     (Machines.dispose())
record = { machine, anchor, radius, phase, state, prev, since, aperture, dir, beamOn, slot, bslot, bmode, bt, blen }   (machine.lamp)
```
Module exports: `LAMP_STATES` (frozen `{ calm, wary, hostile, dark }` rows `{ id, token, aperture,
beam, rhythm, hz, sweepHz? }`), `LAMP_ORDER`, `LAMP_HEX`, `COMPASS_PIP` (`{ state: { color,
aperture } }`), `LAMP_CANON` (the five forbidden Horizon colours), `SCANNER_TOKENS`,
`SCANNER_HIGHLIGHTS`, `BEAM` (`{ fogK: 1.2, night: 0.5, halfAngleDeg: 5, segments: 64, sweepDeg:
14, capacity: 128 }`), `APERTURE_MAX` (0.66 of the face radius; was 0.86), `CORE_FRAC` (0.4),
`CORE_FRAC_BY_STATE` (`{ calm: 0.4, wary: 0.4, hostile: 0.2, dark: 0.4 }`, of the current aperture radius),
`CORE_GAIN` (2.5), `BEZEL_IN` (0.93), `BARREL_DEPTH` (0.85 face radii), `LAMP_RHYTHM` (`{ pulseLow:
0.55, flickerLow: 0.3 }`), `lampStateFor(machine)`, `lampGain(state, t, phase)`,
`outputForward(x, P)`, `outputInverse(t, P)`, `LampSystem`; re-exports `WEATHER_PERCEPTION`,
`NIGHT_PERCEPTION`, `perceptionScale`.

### On every machine (`machine.js`)
```
machine.addLamp(at: Object3D | [x, y, z] body-space, { radius = 0.13 } = {}) -> record | null
                      radius = the lamp FACE (glass = APERTURE_MAX of it); the barrel sinks 0.85 radii behind the face
                      an array makes an anchor facing +Z under machine.body (call BEFORE buildRig, so the rig carries it)
machine.lamp          the record, or null
machine.lampDarkT     seconds left dark after a precise hit on the weak point named 'lamp' (6 s, bible §7.3)
machine.flagMark      the Flag this machine searches toward, or null
machine.dustOccluded  boolean, 5 Hz (the Dust-sight occlusion flag)
machine.flagsOnSight  staging override of the perception row's `flags`
PERCEPTION.default.flags = false                     a kind row sets `flags: true` (the sentry role, W1)
EYE_COLORS = { calm, wary, hostile, dead: the four tokens, flash }   VFX_COLORS re-exported
machine.sc            MachineScalars: the per-frame doubles (heading, _speed, _accelPitch, strafeK, suspicion, _unseenT,
                      _stateT, playerDist, detectFill, scanOffset, health, lampDarkT, stunT, burnT, _burnDps, clocks,
                      _alarmCd, _attackCd, ...); Machine.prototype get/set pairs keep every old name working
MACHINE_SCALARS       the moved names (array)
stepRoot(m, dx, dz), stepRootS(m)    the shared root step (camp ring + world rim); stepRootS reads _st.sx/_st.sz
_st                   the steering scratch { want, d, x, z, fx, fz, speed, out, sx, sz }
turnS(m, dt), faceS(m, dt), moveTowardS(m, dt), steerAlongS(m, dt), navTowardS(m, dt)   (read/write _st)
conformM(m, dt), updateEyesM(m, dt, t), updatePartsM(m, dt, t), updateElementalM(m, dt), updateFxM(m, dt)
                      the machine's per-frame helpers as module functions; the methods of the old names stay as wrappers
picker._now, picker._held(map, id)   ai/attacks.js: the hold maps (cd, missed, stalled, blind, unreach) hold expiry times
```

### `ctx.machines.perception` — `PerceptionHooks` (`ai/perception.js`) and the noise filter
```
perception.detectMul      number, default 1      x sight fill rate while not alert/attack/stagger/downed
perception.flagDuration   seconds, default 8     read when a Flag is raised
perception.flagRadius     metres, default 60
perception.dustSight      boolean, default false
perception.calimaClear    metres, default 24
perception.sightScale     read-only per step: perceptionScale(environment)
perception.weather        read-only per step: the weather name it was read from
perception.clock          sim seconds
perception.flag           { active, source, t0, until, duration, raised, ended }
perception.flagPlayer(source?: Machine) -> flag | null
perception.addDustCloud({ x = 0, y = 0, z = 0, r = 3, seconds = 10 } = {}) -> remover()
perception.dustBetween(a: {x,y,z}, b: {x,y,z}) -> boolean
perception.outlined(machine) -> boolean          dustSight && machine.dustOccluded
perception.update(dt)                            from Machines.update, once per sim step
perception.audit() -> { detectMul, flagDuration, dustSight, sightScale, weather, clouds, flag, flagged }
events: 'flagged' { source, duration }, 'flag-ended' { duration, lasted }
FLAG = { duration: 8, radius: 60 }, CALIMA_CLEAR_M = 24                (exports of ai/perception.js)

machines.stimulus.addNoiseFilter(fn: (ev) => false | void) -> remover()   false drops the stimulus; edits to ev stand
```

### `src/instruments/lib/weather.js`, `lib/vfx.js`, `lib/color.js`
```
WEATHER_PERCEPTION = { trade: 1, clear: 1, overcast: 1, calima: 0.5, fogbank: 0.5, squall: 0.8, rain: 0.8, storm: 0.8 }
NIGHT_PERCEPTION = 0.7
weatherName(env) -> string;  perceptionScale(env) -> number in [0, 1]
VFX_COLORS = { cinderHot, cinderMid, cinderLate, brineHot, brineMid, brineLate, dustHot, dustMid, dustLate,
               saltGlint, bronzeChip, beacon, seizedTint, flameLate, sensorPing }   (three.js colour ints)
hexToRgb, rgbToHex, srgbToLinear, linearToSrgb, rgbToLab, deltaE2000(labA, labB), deltaE(a, b), SHARMA_PAIRS, sharmaCheck()
```

### `rig/lod.js`, `index.js`
```
INSTRUMENT_PALETTE: THREE.Color[8];  PALETTES = { legacy, instrument }
unifyMaterials(machine, { quantise: true | 'instrument' | false, ... })
mergeByMaterial: a group keeps uv1 when its material samples channel 1 (or material.userData.uv1 === true)
Machines.interpolate()   (main.js frame loop: once per rendered frame)   Machines.dispose()
```

### `tools/gates.r5.kind-block.mjs`
```
kindBlock({ kind?, role?, lane = 'kind-block', class = 'medium' | 'small' | 'large' | 'colossal', fixture = false, suffix = ':' + (kind || role) }) -> row[25]
KIND_PRELUDE(spec) -> string     page prelude: KIND, KIND_NOTE, FIXTURE, wait, simSleep, flatSpot, stageKind, freezeAll, freezeOne, holdStill, thaw, park, skipNoKind
lampStatesAssert(spec) -> string  core's A-lamp-states for any kind
PIX                               page prelude: canvas pixel capture after the composer
SIZE_CLASS                        §4.1 classes;   GATES = []
```

---

## Gates (port 5254, this tree, Oct 22 2026)

Runs (each under one machine-wide Chrome slot, PLAN §0 rule 8 amendment; at most one Chrome of this lane
alive at any time — runner rows go first and their nested runs are sequential; load average 2.5–5.5,
other lanes' gate Chromes alive): **run A** 08:52–09:07 UTC (the page block, 14 / 14 PASS), **run B**
09:29–09:42 (the scratch-copy probes and the N-run memory rows, 4 / 4 PASS), **run C** 09:42–09:53
(`A-kind-block-file`, PASS), **run D** 09:53–10:05 (the global list items in this tree + a re-run of the
two lamp gates on the final code). Reports: `scratchpad/r5/instruments-core/report-{ra,rb,rc,rd}.json`.

**Summary: the W0b block is 21 / 21 PASS on this port** (10 W0b rows + the A90-rig-reclaim and A90b
shadow rows through their 5/5 and 3/3 runners + A37 / A39 / A43 on the fixture + the 6 W0a rows),
the per-kind block 20 PASS + 5 SKIP-fixture, and the global items in this tree PASS except `A9` (PENDING
by R26 on a loud box; main fails the same term in an interleaved A/B), `A21` (PENDING, GPU terms
unattributable; draws and triangles PASS) and pipeline's `A-licence-manifest` (PENDING on pipeline's
own clauses).

### This lane's W0b block (§9 `instruments-core`) + the W0a rows it keeps green

| gate | verdict | measured |
|---|---|---|
| `A-lamp-states` | **PASS** (run A, 42 s; re-run in run D) | Tiller fixture (role `herd`, R28), camera 15.000 m on the lens axis, rendered pixels after the composer. Colour at the rhythm peak: calm `#f2ead3` ΔE **0.00**, wary `#aee318` ΔE **1.06**, hostile `#ff2f8c` ΔE **0.19**, dark `#3d3b37` ΔE **0.77** (bar ≤ 3). Iris lit px 294 / 112 / 52 → ratios **2.63 / 2.15** (bar ≥ 2), dark aperture 0 after a real precise hit on the lamp weak point. Rhythm (periodogram over 2.4 sim-s): calm rel. std **0.000**, wary **1.00 Hz**, hostile **4.00 Hz** (±15 %); dark: 0.55 s sputter (luminance range 0.391, 200 lit px of the old colour) then out (range 0.000, 0 lit). Consecutive tokens ΔE **25.1 / 83.1 / 42.8** (measured 25.4 / 83.2 / 42.2; bar ≥ 25). Beams (side view, 9 × 9 px at 3/5/7 m, 10 paired frames with/without the beam draw): overcast fog (densMul 1.85) wary **+96.8**, hostile **+35.8**, calm +0.23 with no beam; night (nightFactor 0.97) wary **+76.0**, hostile **+62.2**, calm 0; clear day: no beam in any state (bar: visible ≥ +6, none < 1.5) |
| `A-lamp-canon-distance` | **PASS** (run A, node) | CIEDE2000 checked first against the Sharma pairs (max err 4.2e-5). 28 graded tokens/literals: LAMP_STATES, COMPASS_PIP and the beam tint calm **24.7** / wary **27.8** / hostile **26.6** / dark **41.0**; SCANNER_TOKENS paper **20.1**, ink 33.8, cobalt 26.7; every lamp-context colour literal in `src/instruments/**` and `src/entities/machines/**` (incl. `vfx.js` sensorPing 24.7); 0 offenders (bar ≥ 20). Lamp tokens vs scanner highlights: min ΔE **10.6** (dark vs ink; bar ≥ 10). Listed, not graded (owner named): `ui/focus.*`, `hud.*`, `inventory.css`, `items.js`, `places.js`, `tallneck.js` (Round-4 UI/props, shell-ui W2 / world-props W1), 4 sensor-part BODY colours (their emissive lamp colour is graded), the dead `rig/shells.js` default |
| `A-beams-one-draw` | **PASS** (run A, 27 s; re-run in run D) | 8 wary Tillers in rain (densMul **2.55**): **8 / 8** lamps wary, **1** beam draw every frame (40 frames, min = max = 1), **8** instances; frame calls wary 321 vs calm 320 on the same frozen frame → **1** attributed draw; calm: 0 beam draws, 0 instances. After a warm cycle, spawn/kill/dispose × 3: geometries **200 → 200**, textures **120 → 120**, scene materials **378 → 378**, lamp records **3 → 3**, the same two meshes and geometries (uuids) |
| `A-perception-weather` | **PASS** (run A, 38 s) | Sight range by bisection to 0.08 m, player dead ahead in the open, the machine perception-only on the sim clock: trade **34.03 m** (sightRange 34; ±5 %), calima **16.98 m** → ratio **0.499** (bar 0.5 ± 5 %), fogbank 16.98 m, trade again 34.03 m; night 24.04 m (×0.706, bible 0.7). `sightScale` 1 / 0.5 / 0.708. detectMul ×0.5 probe: fill 0.5559 → 0.2779 → **0.500** (first run read 0.531: the first samples after a change carried the previous tick's value; the probe now settles 0.25 sim-s, ≥ 2 perception ticks, before sampling) |
| `A-perk-hooks` | **PASS** (run A, 54 s) | each with its negative control (R31): **detectMul** 0.5 → calm fill at 20 m 0.5559 → 0.2779 (×**0.500**), hostile 0.5559 → 0.5559 (×**1.000**); **flagDuration** 3 → Flag lasted **3.010 s**, control **8.006 s** (±0.1), the 3 recipients facing away all in `search` and marked, marks cleared at the end, the Flag raised by the flagging machine's own `setState('alert')` → `flagPlayer` (no gate frame in the stack); **noise filter** dropping footsteps → **0** footstep stimuli over a 10 s jog (median speed 4.78 m/s), control **49** (4.58 m/s), 0 emitted from gate code, filter removed after; **Dust-sight**: no cloud → not occluded, not outlined; a cloud on the line → `dustOccluded` true, outlined only with the perk, and the Instrument cannot see through it; cloud removed → not occluded. Player movement by synthesized `KeyboardEvent`s into `input.js` |
| `A-uv1-survives-fold` | **PASS** (run A, 5 s) | a generated 8.4 KB GLB (gltf-transform): 2 meshes on a decal material reading `TEXCOORD_1` (three `channel === 1`), 2 on a plain one. After `foldMachineMeshes`: decal group merged ×2 with `uv1` present, max error **3.0e-8** over 192 vertices (bar 1e-4); plain group merged ×2, `uv1` dropped, `uv` kept |
| `A-vfx-palette` | **PASS** (run A, 29 s) | static: 130 colour literals in 52 files of `src/entities/machines/**` + `src/instruments/**`, 0 within ΔE 15 of `#38c6ff` / `#19ffd0`; `rig/fx.js` default spark and `_arcFlash` = `VFX_COLORS.bronzeChip`. Live: every spawnable kind (12) driven through hit, tear, fire/freeze/shock, explosions, default arc and spark, every attack flash colour, its own FX functions, burn/seized/Clouded statuses, death and beacon; **19** distinct colours seen, 0 offenders, closest `#bde6e3` (Brine mid) at ΔE **18.7**. Listed (combat-kit W2): 25 near-blue literals in `src/combat/**` |
| `A-roles-published` | **PASS** (run A) | 12 roles exactly; herd → `tiller` (R28 note); 11 null, each with an R18 note naming kind, lane, wave; 0 legacy mapped; 0 forbidden ids; `roles.herd` spawns a non-legacy `tiller`. **gate-roster clause graded**: gates-perf's `ROSTER` prelude (from `R5_GATE_ROSTER`, its W0b worktree) resolves herd → `tiller` and the other 11 to null with their SKIP labels (R30 / R28 / R18); `STAGED_KINDS` = [tiller], 0 legacy |
| `A-kind-registration` (W0a, re-run) | **PASS** (run B, 62 s) | a new module `zz-icprobe.js` dropped into a scratch copy (spawning relative to `REST_SITE`; the only difference from this tree): A1, A20b PASS; `icprobe` registered, model loaded, own perception/engage rows merged over `default`, 2 attacks, mode `table`, elem 77, audio set `icprobe`, 1 spawn row, 1 live at boot, role null. The fixture in the same page: 4 attacks, elem 110, audio `tiller`, 3 live, role `herd` |
| `A90-rig-reclaim` **5/5** (`A90-rig-reclaim-5of5`, shadow row on the staged role kinds) | **PASS** (run B, 291 s; 5 fresh-page runs, one Chrome at a time) | **5 / 5 PASS**; 30 spawn/kill/dispose cycles of the Tiller each: geometry growth **+1 / 0 / 0 / 0 / 0** (bar ≤ +40), texture growth **0 / 0 / 0 / 0 / 0** (≤ +30); per live machine (8 Tillers) geo **0**, tex **0.38–0.63** (≤ 1 each); held-then-released ≤ +1 geo |
| `A90b-memory-attribution` **3/3** (R34, role-based workload; `A90b-memory-attribution-3of3`) | **PASS** (run B, 238 s; 3 fresh-page runs) | **3 / 3 PASS**: 30 kills each followed by a respawn of the herd role's kind (30 / 30 respawned, 0 failed); **0 offenders**, **0 at the `machine.js` model clone or the `autorig.js` bones** (autorig.js:75 bones: 816 created, 0 attached, 0 detached-retained, 0 held unreachable — W0a held ≈ 24 per 30 kills); post-GC heap **−3.1 / −0.8 / −7.5 %**; scene objects 3058 → 2561, geometries 158 → 164, textures 119 → 107 after the corpse lifecycle |
| `A-kind-block-file` | **PASS** (run C, 660 s) | shape: exports `kindBlock()`, `GATES = []`, all 25 §9 ids present, parameterised by kind (`{ kind: 'plumb' }` gives 25 rows suffixed `:plumb`), lane honoured. The block on the fixture (role `herd`, class medium), one nested fresh-page run: **20 PASS + 5 SKIP-fixture, 0 FAIL**; `A41c-sustained-variety` **5 / 5** clean runs (1 in the block + 4 fresh pages). Per-row numbers in the table below |
| `A37-stealth-approach` (shadow `@ic`, herd role) | **PASS** (run A) | crouched in tall grass 20 m → 3 m behind the Tiller: peak suspicion **0**, never left patrol, 165 samples, 0 seen while hidden |
| `A39-detection-curve` (shadow `@ic`) | **PASS** (run A) | 30 m: suspicious at **1.84 s**, alert **3.53 s** (bars ≥ 1.5 s / 3.0–4.6 s); 10 m: alert **0.86 s** (≤ 1.5 s) |
| `A43-corpse-lifecycle` (shadow `@ic`) | **PASS** (run A) | 8 Tiller wrecks frozen, faded, disposed, 8 respawns scheduled; scene objects 3233 → 2955 (**−278**, bar ≤ +40); 0 orphans retaining a disposed machine, 0 FX meshes left |
| `A-no-override` (W0a, global) | **PASS** (run A, 13 s) | 145 `src/**` files, **0** raw hits of the §9 regex (comments included, no allowlist), 0 code hits, 0 mechanic identifiers; removal-only **14/14** deletions-only vs `9d3b891` (`ai/stimulus.js`, which W0b edits again under its own ≤ 10-line grant, is proved on its W0a commit); 12 spawnable kinds × 12 asked states → 0 forbidden; FSM 9 states |
| `A-no-corruption` (W0a) | **PASS** (run A, 605 s) | 0 code hits in 138 files; staged the old corrupting kind (read from the W0a base's doctrine) + 6 others within 9 m for **600 s**: 2,361 samples, **0** `corrupted`, 0 `_corruptor`, 0 corruption events, up to 8 engaged at once |
| `A-boot-roster` (W0a lane guard) | **PASS** (run A) | READY 3.66 s after navigation; 14 alive at `__READY__` (6/3/3/2), damage wrapper installed at construction (`hookTries` 0), deferred half +0.65 s, boot roster not re-spawned |

### The per-kind block on the Tiller fixture (run C; `--lane instruments-core-kind` runs the same rows)

| row | verdict | measured |
|---|---|---|
| A44 / A44b socket integrity | PASS / PASS | lamp anchor and lamp weak point on the hull: gap **0.00 m** alive and +2 s dead (bar ≤ 0.10) |
| A45 no-skate / A45c foot continuity | PASS / PASS | stance drift **0.00 m** over 36 windows, 6.3 m walked (≤ 0.06); planted toe **0.00 m/frame** (≤ 0.12), 465 planted samples |
| A46 ground truth | PASS | planted \|y − terrain\| **0.00 m** on all 6 feet, 507 samples (≤ 0.08) |
| A47 / A47b / A47c corpse | PASS ×3 | penetration/float **0.03 m** / posed **0.029 m**; mass: the sprawler rule (reference = the locomotion chassis median 1.663 m, plan §9 A47c) |
| A48 cadence | PASS | **1.12 Hz**, band 0.70–2.11 for a 5 m body, moving frames only (5.0 s, 34 plants) |
| A-weights-authored | PASS | 25,445 vertices, **0** wrong-dominant, **100 %** rigid |
| A-sil40 | PASS (+ pair clause SKIP-fixture) | side **60 px**, front **62 px** tall at 40 m (≥ 20); no second non-legacy kind for the IoU pairs until W1 |
| A-weak40 | PASS (contrast clause SKIP-fixture, value reported) | hit sphere **11.2 px**, lamp disc 7.8 px, lit glass **6.8 px** across at 40 m (36 px within ΔE 10 of the token; bar ≥ 5); glass vs hull **4.78 : 1** at 13:00 trade (bar 3 : 1; see gap 1 — this depends on the hull's shading). Fixed this round: the first run read 3.2 px because grass and props between camera and lamp were counted; the size read now shows the machine and its lamp alone (haze and output pass still applied) and counts only inside the projected disc |
| A-lamp-states (core's gate on the kind) | PASS | as in the lane row |
| A41b / A41d / A41c attacks | PASS ×3 | A41b: band 4.2–14 m covered with no holes (hopper-burst, drum-shove, herd-trample observed); A41d: 0 failures, 0 starved over 12 bearings; A41c: 0 failures, the same move sequence on a seeded replay, **5 / 5** runs |
| A42 stagger / A-linked-attack | SKIP-fixture | the fixture has no tearable tool yet (species lane fidelity pass) |
| A-glb-budget | PASS | 32,960 tris (≤ 35 k), 24 bones (≤ 30), 2 materials, 309,880 B (≤ 400 KB) |
| A21-with-kind | PASS | staged fight **316** draws (≤ 350); the kind's own draws **6** = class budget (3 main + 1 caster × 3); lamps + beams are the shared `machines.lamps` draws |
| A90-expansion-with-kind / A90-rig-reclaim-with-kind | PASS / PASS | 30 kills + respawns: objects −462, non-machine growth 0, orphans 0, geo +5, tex −11, heap −0.2 %; 30 cycles: geo 0, tex 0, per live 0 / 0.5 |
| V26 / V27 / V-lineup | SKIP-fixture | staged and filmed, judged on the species lane's fidelity pass (bible §7.5) |

### Run D — the global green list items that exist in this tree, + the two lamp gates on the final code

09:53–10:05 UTC, load average 4.4–5.5 (two other lanes' gate Chromes alive), one
`--extra` slot: a combiner module in scratch re-exporting this lane's `GATES` + pipeline's (the
orchestrator's "combiner" route).

| gate | verdict | measured |
|---|---|---|
| `A1-boot-clean` | **PASS** | `state=playing`, 0 console errors |
| `A20b-no-system-errors` | **PASS** | 0 system errors, 0 hook errors, 229 frames |
| `A9-perf-budget` (R26) | printed **FAIL** on its fps term; **PENDING by R26** (load average 4.4–5.5; R26's quiet box is < 3) | draws **310** (< 350, PASS; W0a 309 + the lamp draw). fps 42.2, scene GPU 55.3 ms; the gate's own null-frame probe read 0.57 ms at that instant while `A21` in the same run read a 6.61 ms null frame. **Interleaved A/B, same minutes, this tree vs main `a953355` (W0a)**, one slot: tree **38.1 / 41.8** fps (scene GPU 53.5 / 46.3 ms), main **40.6 / 41.6** fps (50.2 / 47.8 ms) — main fails the same term at this load; median 40.0 vs 41.1 fps (−2.7 %, inside the run-to-run spread); draws 310 vs 309 |
| `A21-real-draw-calls` | **PENDING** (Round-4 attribution) | draws **310 / 196 / 324** (spawn vista / west herd / staged fight; ≤ 350 PASS), triangles **4.12 / 3.67 / 4.23 M** (≤ 6.5 M PASS); GPU and p95 terms not attributable (null frame 6.61 ms GPU, burst 1.84×). Its staged fight still names Round-4 kinds (gates-perf re-casts it by role) |
| `A90-memory-stability` | **PASS** | 28 kills; heap **−10.9 %** (< 25 %), geometries **+9** (≤ 40), textures **−28** (≤ 8), scene objects **−1,091** (≤ 60) |
| `A90-memory-stability-expansion` | **PASS** | objects −1,057, non-machine growth **0**, orphan roots **0**, geometries +3, heap −11.5 % |
| `A90b-memory-attribution` (Round-4 workload) | **PASS** | 28 kills, **0** offenders, 0 orphaned textures, post-GC heap **−13 %** |
| `A90-rig-reclaim` (Round-4 row, all 12 spawnable kinds) | **PASS** | 30 cycles: geometries **+9** (≤ 40), textures **0** (≤ 30); per live machine geo 0, tex 0.25 (≤ 1) |
| `A-ID-ip-assets-gone` (pipeline) | **PASS** | 19 GLBs, 0 IP hits, 0 without provenance; `aloy.glb` a scheduled exception (hero-body W0b exit) |
| `A-assets-tracked` (pipeline) | **PASS** | 221 referenced assets, 0 missing, 0 ignored; the four R30 GLBs deleted and not served |
| `A-licence-manifest` (pipeline) | **PENDING** — pipeline's clauses, not this lane's | files-matched, row schema, code rows, licence texts, size PASS; third-party (archive SHA-256 re-fetch), legacy-source (scheduled deletions) and credits PENDING. This lane added no asset this wave (the `uv1` probe GLB is built in memory and never written) |
| `A-no-override` | **PASS** | as in run A (0 raw hits in 145 files; removal-only 14/14) |
| `A-lamp-states` (final code) | **PASS** | calm `#f2ead3` ΔE 0.00, wary `#afe31a` 0.96, hostile `#ff318c` 0.39, dark `#3e3c38` 0.98; iris 272 / 112 / 52 px → 2.43 / 2.15; rhythm 0 / 1 / 4 Hz; beams fog wary +105.0 / hostile +85.7 / calm −0.2, night +221.1 / +150.6 / −0.1, clear day none |
| `A-beams-one-draw` (final code) | **PASS** | 8 / 8 wary, 1 beam draw every frame, 1 attributed; baseline geometries / textures / materials / lamp records restored after 3 cycles |

Not in this tree yet (other lanes' W0a/W0b files, not merged): `A90-abs`, `A-alloc-rate`,
`A-vram-ledger`, `A-port-guard`, `A-carried-suite` (gates-perf); `A-no-horizon-terms-player`,
`A-no-horizon-terms-code` (brand W0b); `A-reach-all-sites`; `A-legacy-gone` grades from the W2 exit.

### Advisory: gates-perf's W0b memory gates on this lane's code (not in this tree; run from a scratch copy)

gates-perf's `A-alloc-rate`, `A-vram-ledger` and `A90-abs` (their unmerged W0b worktree, `ef89f75`),
copied to scratch with THIS tree's `src/` and served on 5254 (10:17–10:24 UTC, load 3.5–4.4). Not this
lane's gates and not graded here; reported because the memory rule is Kevin's first bar.

| gate | result | what it says about this lane |
|---|---|---|
| `A-alloc-rate` | FAIL build-wide: `src/**` 83 MB/s (bar 64 KB/s); worst `noise2D` terrain.js 18.7 MB/s; then `getHeight` (terrain), `raycast` / `_meshPush` / `occluded` / `sphereQuery` (frozen collision), engine.js:1352, `_springs` (playerAnimator) | this lane's frames over 4 KB/s: `Machines.update` (index.js, 1.8–2.3 MB/s graded) and the frozen `gait.js` `update` (1.8–2.1 MB/s) |
| `A-vram-ledger` | FAIL: render targets 437.8 MB at DPR 1.5 (bar 170), total 622.8 MB (bar 450); textures 105.5 MB and geometry 79.5 MB inside their bars | engine-gpu's tier decision, not this lane's |
| `A90-abs` | FAIL on the GPU-process term only: 1,570.9 MB (ceiling 1,500); post-GC JS heap **83.2 MB** (ceiling 450) after 30 kills + 30 respawns | the JS heap after this lane's workload is far inside its ceiling |

**Is any of it this round's?** A sampling heap profile (CDP `HeapProfiler`, 10 s, 8 hostile Tillers + the
roster, 36 machines) of this tree against main `a953355` (W0a), back to back on 5254: self allocation in
machine frames is the same before and after — `Machines.update` 1,205 → 1,072 KB/s, `_updateEyes`
429 → 353 KB/s, `gait.update` 369 → 441 KB/s, `_conform` 241 → 210 KB/s, `perception.update` 121 →
152 KB/s — and `lamps.js` and the `PerceptionHooks` do not appear among the allocating frames (the
re-solve path was made allocation-free this round: 20,000 solves, heap delta ≤ 0). The profile is
dominated by double boxing in Round-4 code paths (terrain height, nav steer, collision raycasts, the
O(n²) separation loop in `Machines.update`), present on main before this lane's W0b work. See gap 10.

### The lamp films (advisory; read by me against their criteria — no licence-clean reference yet)

`R5_IC_FILM=1 … --lane instruments-core-film`, 8 frames, 1600 × 900. Iris rows are filmed through a
4° lens (`camera.zoom`) from 15.0 m on the lens axis so the iris can be read; the wide rows at the game
lens (55°). Centre-pixel colours read from the PNGs.

| frame | what I see | vs its criterion |
|---|---|---|
| `V-lamp-calm-15m` | a fully open disc, centre `#f2ead3` (the token exactly), thin dark bezel ring, set in the drum's white glaze; no beam | meets (criterion text corrected: the bezel is dark, not bronze) |
| `V-lamp-wary-15m` | the iris at half area, chartreuse `#b2e41c`, six swept blades with hairline seams around it: reads as a camera iris | meets |
| `V-lamp-hostile-15m` | a pinhole in dark blades; this frame caught the 4 Hz flicker trough (`#b00041`, still ΔE 25.0 from canon red `#ff2413`; peak `#ff2f8c`, ΔE 0.19 to the token in A-lamp-states) | meets |
| `V-lamp-dark-15m` | closed, centre `#44413c` (token `#3B3A36`), a jagged fracture with a branch | meets after the fix: the first frame's two straight cracks read as a cross-hair reticle; the shader now draws one wavering fracture and a branch below it |
| `V-lamp-hostile-15m-wide` | at play scale a small magenta point on the front drum; no glow ball, hull not blown out | meets |
| `V-lamp-calm-40m-wide` | a ≈ 6 px bone disc (core pixels `#f1e9d2`) on the bone-white drum; it separates from the drum only by its dark bezel | weak: see gap 1 |
| `V-lamp-beams-night` | after the fix: two narrow shafts, chartreuse sweeping and magenta ending on Brea, brightest at the lens, soft-edged, the grass visible through both | meets. Before the fix: a flat, hard-edged green wedge that brightened with length (the non-uniform-scale normal bug, found by this frame) |
| `V-lamp-beams-fog` | the chartreuse shaft reads clearly through the rain; the hostile beam of the second Tiller points away from the camera toward Brea and is faint against the bright grey sky | wary meets; hostile only faint from this angle (A-lamp-states' side-view probe reads it at +35.8 RGB in fog) |

---

## Honest gaps

1. **The bible and the gate disagree about the lamp core; I built the gate.** Bible §7.2: "Lamp
   emissive ×2.5 with a core above the bloom threshold so lenses read at noon". Plan §9
   `A-lamp-states`: rendered colour within ΔE2000 3 of the token. A core above the bloom threshold
   renders near white, so the lens carries exactly the token (HDR under the threshold: calm 0.98 <
   1.08) and A-lamp-states reads ΔE 0–1.06. The price is visible in `V-lamp-calm-40m-wide`: in daylight
   the calm lamp is no brighter than the bone glaze around it and separates only by its dark bezel.
   `A-weak40`'s contrast clause (SKIP-fixture, reported) read 3.35 : 1 and 4.78 : 1 on two runs, both
   with the hull ring in shade (hull luminance 0.211 / 0.133 against glass 0.824); a sunlit bone glaze
   would read much closer to the lamp (not measured). **Ruling requested:** (a) keep token-exact lamps, and the species lanes give every
   lamp a graphite/bronze drum face (bible §7.1 materials) so the 3:1 is structural — my
   recommendation; or (b) allow a bloom core and restate A-lamp-states' colour clause as "the lit ring
   outside the core".
2. **The lamp films have no licence-clean reference.** I did not download one (this agent does not
   fetch files without the user's say-so). Two slots for gates-perf's Commons fetcher (PD / CC0 /
   CC-BY): an iris-diaphragm close-up at several apertures, and a searchlight shaft in fog / at night.
   With those under `reference/r5/instruments-core/`, the films can be registered as V rows for an R29
   judge; until then they stay unregistered (`R5_IC_FILM`).
3. **Two contract clauses are measured against gates-perf's work, which is not in this tree.**
   `A-roles-published`'s "gate-roster resolves every role" ran gates-perf's own `ROSTER` prelude from
   its worktree (`R5_GATE_ROSTER`, read-only); `A90b` 3/3 ran with this lane's role-based re-stage of
   the Round-4 row (R34 asks for "the build merged with gates-perf's roster"). Both must be re-run on
   the merged build.
4. **No calima in the environment yet.** `A-perception-weather` stages `trade` / `calima` /
   `fogbank` by writing `environment.weather` (the NAME the hook reads, bible §2.3), because
   `environment.js` has none of those states until world-sky W1 (E12); night is `setTime(23)`. When
   world-sky publishes `environment.perceptionScale`, that number wins and the gate's
   `setWeather(...)` path runs instead. `A-weak40`'s calima half reports "trade measured".
5. **No kind sets `flags: true` yet.** The Flag is the sentry role's (Plumb, instruments-a W1);
   `A-perk-hooks` stages it with `machine.flagsOnSight` on the Tiller fixture and checks the stack: the
   Flag is raised by the machine's own `setState('alert')` from its own sight, not by gate code.
6. **The per-kind block on the fixture: 5 rows SKIP-fixture by design** (A42, A-linked-attack: the
   Tiller has no tearable tool yet; V26, V27, V-lineup: judged after the species lane's fidelity pass,
   bible §7.5), and the A-sil40 pair clause (no second non-legacy kind until W1).
7. **Round-4 colours this lane does not own are listed, not graded**: the Focus/HUD violet and teal
   in `src/ui/{focus.js,focus.css,hud.css,hud.js,inventory.css}` (shell-ui W2: the Sighting replaces
   Focus; draw the pips from `COMPASS_PIP`), 25 near-blue elemental-arrow literals in `src/combat/**`
   (combat-kit W2), and the frozen `rig/shells.js` `shellMaterials(sensorColor = 0x38c6ff)` default,
   which is dead code (all 10 `buildShell` callers pass the calm token) in a file outside my W0b grant.
8. **The beams were tuned from the films** (normals, fog boost). The fog boost is a look decision; the
   gate bars did not move (A-lamp-states' beam probe went from +7.5 to +96.8 / +35.8 RGB in fog,
   +76 / +62 at night, still 0 in calm and in clear day).
9. **Grant line counts**: `ai/stimulus.js` +7 (≤ 10); `rig/lod.js` uv1 5 lines (≤ 6) plus the
   PALETTE/quantise grant (23 lines); `rig/fx.js` one import + two defaults. The legacy species files
   (`glinthawk`, `longleg`, `scrapper`, `ravager`, `broadhead`, `corruptor`, `grazer`, `shellwalker`,
   `snapmaw`, `stormbird`) changed colour literals and their shell `sensorColor` only (VFX palette and
   lamp tokens), inside `src/entities/machines/**`, which §2 gives this lane.

10. **`A-alloc-rate` (gates-perf, global list) fails build-wide, and two of the over-budget frames are
   in machine code.** Measured advisory above: `Machines.update` (index.js, this lane's file) and the
   frozen `gait.js` `update` each allocate ≈ 1–2 MB/s in a 36-machine fight, the same on main before
   this round. This round's code adds no allocating frame. Driving them to zero is a Round-4 debt
   (double boxing in the separation/standoff loops and the gait solver) that the W0b grant did not
   scope; it needs an orchestrator decision on who takes it (this lane for `index.js` / `machine.js`,
   a `gait.js` grant otherwise), and the terrain / nav / collision owners dominate the total.
11. **The film frames were filmed and read by me only** (rule 3: a lane's own reading is advisory); the
   §9 block has no V gate for an R29 judge to grade.

---

## What another lane or the orchestrator must do

**Orchestrator** — merge this lane with gates-perf's W0a/W0b, then on the merged build re-run
`A-roles-published` (gate-roster now in the tree) and `A90b-memory-attribution-3of3` (R34); the
shadow ids drop their `@ic` suffix by themselves. Rule on gap 1. The `legacy.js` merge-order bridge
(W0a gap 9b) is inert now that pipeline's loader is merged; it can be deleted with `legacy.js` at W2.

**gates-perf** — `A-gate-preludes` and `A-reference-set` were run (from a scratch copy of your tree)
over both of this lane's files: 0 species literals, 0 old-map coordinates, 0 unreferenced V rows.
`tools/gates.r5.kind-block.mjs` exports `GATES = []`; register nothing from it by pattern. Fetch the two
reference slots of gap 2 when you next run the Commons fetcher.

**brand** — your code lint finds one new pair in this lane's files: `scene.overrideMaterial` (three.js
API) in `tools/gates.r5.kind-block.mjs` (A-sil40's flat-ink pass); please allowlist it there.

**instruments-a (W1)** — `src/instruments/kinds/tiller.js` is yours. Every kind: `this.addLamp(at,
{ radius })` BEFORE `buildRig`, name the lamp weak point `'lamp'` (precise hits darken it via
`lampDarkT`), and give the drum face a dark bezel (gap 1). The Plumb's perception row sets
`flags: true` (the Flag; Shrug reads `perception.flagDuration`). Register `kindBlock({ kind, lane:
'instruments-a', class })` for each kind; the Peg is exempt from A-sil40 height / A-weak40 size by the
block's own rule.

**armory (W1/W3)** — perks act only through `machines.perception.detectMul` ("Read as true" 0.5),
`.flagDuration` ("Shrug" 3), `.dustSight` (Dust-sight) and `machines.stimulus.addNoiseFilter(fn)`
(Brine-wade, Ash-step): set on equip, restore on unequip (the filter's remover).

**shell-ui (W2)** — outline every machine with `machines.perception.outlined(m)`; compass ◆ from
`COMPASS_PIP` (colour + aperture); Sighting/scanner colours from `SCANNER_TOKENS`; the Round-4 Focus
violet/teal in `ui/focus.*`, `hud.*` are yours to replace (gap 7).

**combat-kit (W2)** — a Dust Pot calls `machines.perception.addDustCloud({ x, y, z, r, seconds })`;
Clouded is the engine's `shock` channel (`stunT`), which already darkens the lamp; recolour the
near-blue elemental-arrow literals in `src/combat/**` (gap 7).

**world-sky (W1)** — publish `environment.perceptionScale` (a number) with `trade / calima / fogbank /
squall`; this lane's hook prefers it over the name table. Beams read `weatherParams.densMul` (> 1.2)
and `nightFactor` (> 0.5).

**audio (W3)** — `tiller` still falls back to the default voice set.

---

## Files changed this wave (against main `a953355`, the W0a merge)

New: `src/instruments/lamps.js`, `src/instruments/lib/{color,vfx,weather}.js`,
`tools/gates.r5.kind-block.mjs`. Changed in this lane's paths: `src/instruments/kinds/tiller.js`,
`tools/gates.r5.instruments-core.mjs`, this doc. Changed under the §1.2 W0 grants:
`src/entities/machines/{machine,index,parts,variety-assets,legacy}.js`,
`ai/{perception,index,tables,attacks}.js`, `ai/stimulus.js` (+7, ≤ 10), `rig/lod.js` (uv1 5 lines ≤ 6;
PALETTE + quantise flag), `rig/fx.js` (palette defaults). Legacy species files (colour literals and
shell `sensorColor` only): `broadhead`, `corruptor`, `glinthawk`, `grazer`, `longleg`, `ravager`,
`scrapper`, `shellwalker`, `snapmaw`, `stormbird`. Code: 29 files, +3,604 / −115 (plus this doc). No asset added or deleted;
no file outside this lane's §2 row and grants touched (`docs/ROUND5-PLAN.md` differs from `a953355` by
the orchestrator's own R33(g)/R34 sync only).

---

---

# W0a report (Oct 16 2026; kept as written, superseded where the W0b report above says so)

Port 5254. Worktree `scratchpad/r5/instruments-core/tree`, base `9d3b891`. Plan rows used: §2
(`instruments-core`), §1.2 (the W0a removal-only grant on 14 files; the W0 machines grant), §3.1 (W0a
exit), §3.2 (`ctx.machines.roles`, kind auto-registration), §6 (Override/corruption, IP kinds), §8
(R17, R18, R28, R30), §9 (`instruments-core` block). W0b items: see the W0b report above.

**Fix round 1 (Oct 16):** one judge finding — the collapse had deferred the whole roster past
`__READY__`. The roster is built in the `Machines` constructor again; see **FIX ROUND 1** below.
Files touched this round: `machines/{index,legacy,variety-assets}.js`,
`tools/gates.r5.instruments-core.mjs` (new lane guard `A-boot-roster`) and this doc. None of the 14
removal-only files changed.

**Fix round 2 (Oct 16):** one judge finding — `A-no-override` passed on a 3-line comment allowlist
while the §9 bar is 0 literal matches in `src/**`. The three comment hits are deleted (removal-only,
inside the W0a grant on `playerAnimator.js` and `menu.js`) and the allowlist is gone: the gate now
greps the raw text of every file under `src/` against 0. See **FIX ROUND 2** below.

Gates run with:

```
node tools/gates.mjs --port 5254 --extra tools/gates.r5.instruments-core.mjs --lane instruments-core
```

`--extra` is needed until gates-perf's `A-gates-autodiscover` merges (today `tools/gates.mjs` scans
only `tools/gates.round4.*.mjs`). After that, drop `--extra`; nothing else changes (the file exports
`GATES` in the same shape).

---

## FIX ROUND 2 — `A-no-override` checks the literal bar (judge finding instruments-core/W0a #2)

**Finding.** §9: "0 matches of `/override-node|overridden|\bOVERRIDE\b|overrideNode|cauldron-override/`
in `src/**`". A literal `grep -rnE` of that regex over `src/` found 3 comment lines
(`ui/menu.js:787`, `playerAnimator.js:2527`, `:2665`), and the gate passed them through a named
allowlist (`OVERRIDE_COMMENT_ALLOW`) and only counted code with comments stripped. The bar had moved.

**Fix 1: the three hits are deleted, deletions only** (the W0a removal-only grant names both files):

| file:line | before | after (characters deleted, none inserted) |
|---|---|---|
| `src/ui/menu.js:787` | "only a non-positive restore is overridden, and only on the frame after the restore has run." | "only a non-positive restore, and only on the frame after the restore has run." (−14) |
| `src/entities/playerAnimator.js:2527` | "A LOCK THAT IS ABOUT TO SLIDE DOES \*\*NOT\*\* OVERRIDE THE MOVE TEST, and this was tried and reverted rather than guessed. Letting a hot lock force the system live …" | "Letting a hot lock force the system live …" (−127; the rest of the comment, the A105 measurement and "`moveW` … is the only discriminator", is unchanged and still states the rule) |
| `src/entities/playerAnimator.js:2665` | "THE OVERRIDE THAT MAKES THE DRIFT BAR A GUARANTEE." | "THE DRIFT BAR GUARANTEE." (−26) |

Comments only; no code token changed in either file (esbuild's comment-stripped output of both files
is byte-identical before and after). The subsequence proof still holds: `removalOnly` reads 14/14
deletions-only against `9d3b891`, `menu.js` now 14 chars removed (was 0), `playerAnimator.js` 170
(was 17).

**Fix 2: the gate checks raw text, no allowlist.** `OVERRIDE_COMMENT_ALLOW` and the
comment/unexplained split are deleted from `tools/gates.r5.instruments-core.mjs`. The static half
now walks EVERY regular file under `src/` (140 today: 133 `.js` + 7 `.css`, not only `.js`), greps
the raw text (comments included) with the §9 regex verbatim, and the verdict requires
`rawHits.length === 0`. The comment-stripped code scan and the mechanic-identifier scan stay as
additional zero checks.

**Measured:**
- literal `grep -rnE '<§9 regex>' src/` in the tree: **0 lines** (exit 1);
- gate static half: `rawHits` **0** over 140 files, `codeHits` 0, `identHits` 0, removal-only 14/14;
- **negative control** (scratch copy of `src/` + the gate file, the three old comment lines put
  back): `rawHits` **3**, exactly `playerAnimator.js:2527`, `:2665`, `menu.js:787` → the gate fails;
- **negative control, other extension**: one `/* override-node probe */` line appended to
  `src/style.css` in a scratch copy: `rawHits` **1** (`src/style.css:676`), `codeHits` 0 — the old
  `.js`-only walk would have missed it;
- the full gate on port 5254: **PASS** (14 s), `rawHits` 0 over 140 files; the whole lane block
  6/6 PASS and the global list re-run (gate tables below).

Files touched this round: `src/ui/menu.js` and `src/entities/playerAnimator.js` (comment
deletions only), `tools/gates.r5.instruments-core.mjs` (allowlist removed, raw `src/**` scan added),
this doc. No runtime code changed.

---

## FIX ROUND 1 — the boot contract restored (judge finding instruments-core/W0a #1)

**Finding.** The collapse deferred the WHOLE roster until every model had loaded: `Machines` built
nothing in its constructor and all 28 machines spawned ≈ 1–2.6 s after `__READY__`.
`progression.js:3032` finds the Machine prototype through `machines.list[0]` when it is constructed,
so its difficulty/skill damage wrapper fell to a 1 Hz retry that gives up after 30 tries. The judge
measured `A64b-damage-channels` and `A64c-silent-apex` FAIL ("the machine damage wrapper is not
installed"), and `A62`/`A63` SKIP ("no living machine").

**Cause, precisely.** In base the constructor's roster was the four IP kinds, the only machine
models `assets.js` loaded at boot; every other kind already streamed in later. R30 deletes exactly
those four, so the constructor had nothing it could build. The fix gives the boot roster models
that are loaded at boot again.

**What changed (4 files, all in my grant; the 14 removal-only files are untouched by this round).**
1. `machines/legacy.js` — `BOOT_SPECS`: the four Round-3 kinds (strider, scrapper, glinthawk,
   longleg; `registerAt: 'boot'`) are boot rows now, 1.7 MB in all, against the 4.8 MB of IP
   models base loaded at boot. `LEGACY_SPECS` now lists only the 7 deferred Round-4 kinds. Both
   carry `shadowPolicy: MACHINE_SHADOWS`. `installLegacy` returns `boot` (the kinds whose model it
   handed over inside the call). `spawnLegacyRoster` spawns each kind's roster at most once per
   manager, so the deferred pass can never spawn the boot roster a second time.
2. `machines/variety-assets.js` — `loadKindModels` finishes a model that is already in
   `ctx.assets.models` (style, `loaded`, `onLoaded`) BEFORE it returns, not on a microtask; only
   the models still to fetch wait for the promise.
3. `machines/legacy.js` — **merge-order bridge** (W0a only). Pipeline's data-driven `assets.js`
   reads `BOOT_SPECS` and loads it in `loadAll` (its `legacyRows().boot`, read in the pipeline
   tree). In a tree without that merge, `legacy.js` wraps `Assets.prototype.loadAll` once, when it
   is imported: if the instance publishes `assets.specs` (the §3.2 contract, i.e. the data-driven
   loader) the wrapper calls straight through; otherwise it loads the missing boot rows through
   the public `loadExtra` in parallel with the original rows, inside the same awaited `loadAll`. A
   boot row that fails is not fatal: that kind falls back to the deferred path. Nothing in
   `assets.js` is edited. The bridge can be deleted when both W0a branches are merged; it is
   inert either way, and goes with `legacy.js` at W2.
4. `machines/index.js` — the constructor builds the boot roster again, as base did: registrars
   first (with `kinds` and `_chassis` created before them, since a registrar can now call
   `registerKind` synchronously), then `spawnLegacyRoster(this)` for every kind whose model is
   present. The deferred pass (`varietyReady` → leftover legacy rosters → `spawnExpansion` →
   watermark → `expansionReady`) is unchanged in order. `bootAudit` records both halves. Also
   fixed: `_resolveKind` referenced `EXPANSION_BODY` after the import was removed (a chassis spawn
   would have thrown a ReferenceError); `BODY as EXPANSION_BODY` is imported again.

**Measured on this tree (port 5254, `--only`, Oct 16 00:00–00:45).**

| check | before fix (judge) | after fix |
|---|---|---|
| alive at `__READY__` (`settle: 0`) | 0 (judge `JP-focus-pick`: 0 at READY + 600 ms) | **14** (6 strider, 3 scrapper, 3 glinthawk, 2 longleg), `list[0]` = strider |
| progression wrapper at `__READY__` | false, `hookTries` 0 → true only by + 1.5 s | **true**, `hookTries` 0, `_hooked` true |
| deferred kinds land | ≈ 1–2.6 s after READY | 0.69–1.02 s after READY (14 more, total 28; Tiller herd 3) |
| boot roster spawned twice? | — | no: `deferred.roster` 0, per-kind counts unchanged |
| `A64b-damage-channels` | FAIL ×2 | **PASS** (legacy = modern damage 38 / 47.5 / 32.3 at normal / easy / hard; tear 14) |
| `A63-loot-reveals` | SKIP ×2 | **PASS** (STRIDER WRECK + SUPPLY CRATE, 3 reveals drawn, 28 datapoints) |
| `A64c-silent-apex` | FAIL (wrapper) | FAIL "no Thunderjaw in the scene" — R30; the same text the judge's waited run gave |
| `A62-focus-components` | SKIP | FAIL — it now stages a strider (2 components; it needs ≥ 3). Its subject is `sawtooth` (R30), and the judge's waited run also FAILed it. Needs gates-perf's re-stage (kinds with ≥ 3 components today: longleg 5, broadhead 4, grazer 7, ravager 4, shellwalker 4, corruptor 4, stormbird 8) |
| judge `JP-roster-timing` | wrapper false at start | wrapper/hooked/noise/gourd all true at start, 14 alive; 28 at `expansionReady` (+1.02 s) |

**New lane guard `A-boot-roster`** (`tools/gates.r5.instruments-core.mjs`; not a §9 row, it guards
this finding). It samples at `settle: 0`. `main.js` sets `__READY__` before it starts the frame
loop, so no hook retry can have run by then, and a wrapper present at that sample was installed at
construction. Checks: the boot rows are published and loaded at READY; the constructor's
`bootAudit.boot` names every boot kind; alive at READY ≥ the boot roster, and the boot kinds' count
equals it; the wrapper is installed; the deferred half lands (`expansion` > 0, `roles.herd` alive);
the boot roster is not re-spawned. Names no species (reads `BOOT_SPECS`).
**Negative control:** a scratch copy identical to this tree except `return;` as the bridge's first
line (the boot rows then load deferred, which is the pre-fix behaviour) → **FAIL**: 0 alive at READY,
wrapper false, `bootAudit.boot` empty, `deferred.roster` 14. In the same copy `A64b` happened to
PASS (its 1.2 s settle let the 1 Hz retry land), which is why the guard samples at READY and does
not rely on A64b.

**The judge's non-PASS list, re-run on the fixed tree** (the 44 action/V-number gates of
`judge/nonpass.txt`, `--only`, 01:22–01:40; `work/fix1/report-r4subset.json`), against the judge's
pre-fix tree run and base:
- changed to PASS: `A64b-damage-channels`, `A63-loot-reveals` (this fix); `A19-secondary-motion`
  and `A31e-hillside-pan-clamp` (both load-sensitive; they flip between runs on this box);
- `A21-real-draw-calls` FAIL → PENDING (GPU terms not attributable under load; draws and triangles
  PASS);
- `A62-focus-components` SKIP → FAIL (R30 staging, above);
- the other 38 are unchanged: each names a deleted kind (`watcher`, `sawtooth`, `thunderjaw`,
  `behemoth`, `redeye`, `tallneck`), the deleted quest or tally type, or corruption (A100), or was
  FAIL on base too. **None of them is a "no living machine" timing SKIP any more.**
- `A31b` / `A31f` stay FAIL for a reason worth naming. Their hill-site picker takes the steepest
  26–40° face with no collider within 7 m. In base the Thunderjaw stood at (30, −220), so the face at
  (33, −228) was excluded and the gates ran at (−30, −273). With R30 that face is clear, the picker
  chooses it, and the camera bar fails there (in the judge's pre-fix run as well). The camera belongs
  to hero-body and the staging to gates-perf; the change of site comes from R30, not from timing.

**Styling unchanged by the loader path.** `ICP-entry-signature` (scratch probe) hashes every boot
entry's materials (name, colour, metalness, roughness, emissive, side), per-mesh `castShadow`,
`shadowCasters`, `styledKind`, `shadowPolicy` and size. Results: boot path in this tree, against the
deferred path in the negative-control copy: **identical hashes for all four kinds** (strider
`7b421c90`, scrapper `8a36aa51`, glinthawk `d78ab827`, longleg `dea1e18e`; 1 / 1 / 3 / 1 shadow
casters, `styledKind` set once).

---

## PART A — the removal-only Override + corruption pass (14 granted files)

Done first, kept separate. Grant §1.2: "removal-only: every line and branch of the Override mechanic
(`override-node`, `overridden`, `OVERRIDE`, `overrideNode`, the `cauldron-override` terminal) and the
`ai/squad.js` corruption block". Review it with:

```
git diff 9d3b891 -- src/audio/audio.js src/combat/melee.js src/core/progression.js \
  src/entities/machines/ai/engage.js src/entities/machines/ai/squad.js src/entities/machines/ai/stimulus.js \
  src/entities/playerAnimator.js src/studio/cast.js src/studio/pose.js src/ui/focus.js src/ui/menu.js \
  src/world/props/activities.js src/world/props/places.js src/world/props/tallneck.js
```

**Proof of "deletions only"** (inside `A-no-override`, clause `removalOnly`): for each file the
W0a text is a character SUBSEQUENCE of the `9d3b891` text, i.e. it is reachable by deleting
characters and inserting none. `git diff --word-diff` shows 12 `+` tokens; every one is a truncation
of the `-` token it replaces (`['dead','downed','stagger']);` from `[...,'stagger','overridden']);`,
`restore,` from `restore is overridden,`). The subsequence test is the exact form of that claim.
Result (after fix round 2): 14/14 deletions-only, 14 files changed; 33 line-diff insertions / 245
deletions, every insertion a truncated line.

| file | removed (chars) | what |
|---|---|---|
| `src/audio/audio.js` | 17 | `'override-node'` from the discovery-sting event list |
| `src/combat/melee.js` | 66 | `'overridden'` from `NO_SNEAK_STATES`; three `p.mounted` / `p?.mounted` guards (the mount half of Override; nothing sets `player.mounted` any more); "or a mount" in one comment |
| `src/core/progression.js` | 1272 | the whole `side-cauldron-override` quest; the `override` tally type (`TALLY_TYPES`, the `case 'override'` branch, the `on('override-node')` listener); `'override-tallneck'` in `PLACE_NAMES`; the doc lines naming them |
| `src/entities/machines/ai/engage.js` | 32 | "(an overridden machine chasing)" comment |
| `src/entities/machines/ai/squad.js` | 3668 | the corruption block: `CORRUPT_EYE`, `_updateCorruption`, `corrupt`, `uncorrupt`, the `_corruptor` releases in `noteKill` / `forget`, the `update()` call; the three `overridden` rearguard checks |
| `src/entities/machines/ai/stimulus.js` | 74 | two `overridden` skips |
| `src/entities/playerAnimator.js` | 170 | `'override-node'` from the interact-beat event list (17); fix round 2: the two comment sentences that used the word `OVERRIDE` (153) |
| `src/studio/cast.js` | 77 | `'overridden'` hold state, the `Override` cast row, `manager.override` in the doc |
| `src/studio/pose.js` | 108 | the `interact` pose (it fired `override-node`) and its doc mention |
| `src/ui/focus.js` | 67 | `m.mountedBy \|\| m.overridden` in `_walksRoute`; two doc mentions |
| `src/world/props/activities.js` | 3654 | the OVERRIDE NODE activity: build, interactable, `sites()` row, glow update, doc |
| `src/world/props/places.js` | 821 | the `cauldron-override` terminal interactable and its banner comment (the terminal's mesh stays as an inert prop) |
| `src/world/props/tallneck.js` | 144 | "carries the OVERRIDE interactable" doc sentence |
| `src/ui/menu.js` | 14 | fix round 2: " is overridden" from the respawn-guard comment (the file's only §9 regex hit) |

**No §9 regex hit is left anywhere in `src/**`, comments included** (fix round 2). The first round
kept three English-word comment lines behind a gate allowlist; that was a moved bar, and both the
lines and the allowlist are now deleted (see FIX ROUND 2).

---

## PART B — `src/entities/machines/**` (the W0 machines grant)

### B1. Override and corruption gone from the machine code
- `ai/override.js` deleted (269 lines): ally state, follow, mount, ride, teal eyes.
- `ai/index.js`: `OverrideSystem` import/export/install and `machines.{override,canOverride,mount,
  dismount,overrides,mounted}` removed; `lure()` no longer checks `overridden`; contract doc updated.
- `ai/tables.js`: `OVERRIDE` table, `overrideCfg`, `ECOSYSTEM.corruption` removed.
- `machine.js`: `EYE_COLORS.override`, `corrupted`, `overridden`, `mountedBy` fields, the mount
  release in `_die`, `forceState('overridden')`, the `overridden` FSM case and `_stateOverridden`
  removed. **The FSM is now closed:** `export const MACHINE_STATES` = patrol, suspicious, alert,
  search, attack, return, stagger, downed, dead, and `setState` refuses any other name (the first
  A-no-override run caught `forceState('overridden')` still parking a machine in an unhandled state
  through the generic `setState` fall-through).
- `index.js`: respawn / recycle / standoff loops no longer test `overridden`, `corrupted`,
  `mountedBy`; `overrides.update()` gone.
- `ai/doctrine.js`: the Corruptor's corruption install and `corrupted` audit count gone (the
  Corruptor body stays a plain legacy hostile until instruments-b deletes it at W2).

### B2. IP kinds deleted (R30, §6)
`watcher.js`, `sawtooth.js`, `behemoth.js`, `thunderjaw.js`, `redeye.js` deleted (2,429 lines) with
every row that named them: the authored roster (4 Watchers, 2 Sawtooths, Behemoth, Thunderjaw), the
2-Watcher strider escort, `RIGS.{sawtooth,behemoth,thunderjaw}`, `SAWTOOTH/THUNDERJAW/BEHEMOTH_SHELL`,
`REDEYE_SHELL`, their table rows, the Redeye doctrine/escort/spawn rows. The **Tallneck kind** (its
only body was the Behemoth chassis) and the snapmaw/ravager/shellwalker chassis rows that pointed at
deleted donors went too. The GLBs and `assets.js` SPECS rows are pipeline's (R30); this half never
reads them, so either merge order works.

### B3. Legacy collapse
Every surviving pre-CALIMA kind — strider, scrapper, glinthawk, longleg, broadhead, grazer, snapmaw,
ravager, shellwalker, corruptor, stormbird — lives in **`src/entities/machines/legacy.js`** (one row
per kind: class, asset spec, style, bake flag, registration timing, rig row, table rows, doctrine row,
roster) and is reachable only from it. Kept files carry no kind row any more:

| kept file | before | now |
|---|---|---|
| `index.js` | imported 8 species classes; authored roster; `_spawnVariety` | reaches `legacy.js` through a guarded `import.meta.glob('./legacy.js')` (absent file = no legacy kinds, 0 edits) and imports `installInstruments`; names no kind |
| `ai/tables.js` | 8 kinds' rows in PERCEPTION/ENGAGE/ATTACKS/REACT/ELEM/ALARM/ATTACK_MODE/ESCORT/SCAVENGER | `default` rows + `registerKindTables` |
| `ai/doctrine.js` | 9 kinds' CHASSIS/BODY/NEW_* tables/COMPONENTS/doctrine branches/SPAWN_PLAN | kind-agnostic host + `registerDoctrine` |
| `autorig.js` | `RIGS` for 3 IP kinds + spread of `rigs-expansion.js` | `RIGS = {}` + `registerRig` |
| `variety-assets.js` | species imports, SPECS, STYLE, EXPANSION lists, `registerExpansionSpecies` | `loadKindModels` + style/bake machinery |
| `rig/shells.js` | 6 species shells | shell machinery only; the 3 legacy shells moved to `rig/shells-expansion.js` |

`rig/shells-expansion.js` (legacy, deleted at W2 with `legacy.js`) received SCRAPPER/LONGLEG/
GLINTHAWK_SHELL; `scrapper.js`, `longleg.js`, `glinthawk.js` had their shell import line repointed
(one line each). Shells were moved to that file, not into `legacy.js`, because the species modules
import their shell and `legacy.js` imports the species: putting the shells in `legacy.js` would make
an import cycle.

**Behaviour preserved.** Every table, rig, style, component and spawn number moved verbatim
(extracted programmatically from the old files). Roster now: 25 legacy machines (6 striders,
3 scrappers, 3 glinthawks, 2 longlegs, 2 broadheads, 2 grazers, 2 snapmaws, 1 ravager,
2 shell-walkers, 1 corruptor, 1 stormbird) + 3 Tiller fixtures, against 39 before (the 14 removed:
4 Watchers + 2 Sawtooths + Behemoth + Thunderjaw of the authored roster, the 2-Watcher strider
escort, 3 Redeyes, the Tallneck).

**Boot timing is base's (fix round 1, see the FIX ROUND 1 section).** As in base, the authored
roster is built INSIDE the `Machines` constructor and exists at `__READY__`: the 14 Round-3 machines
(6 striders, 3 scrappers, 3 glinthawks, 2 longlegs; base built its 8 IP machines there). Their
models are boot rows (`legacy.js` `BOOT_SPECS`). The Round-4 expansion kinds and the Tiller stream
in afterwards exactly as base's deferred kinds did (`varietyReady` / `expansionReady`, ≈ 0.7–1.0 s
after `__READY__` here).

Each kind loads on its own (`loadKindModels`): a kind whose model fails is listed in
`bootAudit.*.failed` with one `console.warn` and never spawned; the rest of the roster is untouched.

---

## PART C — Instruments core (`src/instruments/**`)

- `registry.js` — kind auto-registration (`import.meta.glob('./kinds/*.js')`).
- `roles.js` — the 12 role ids, the R18 notes, `buildRoles`.
- `lib/generated.js` — `liftExtras`, `seedAuthoredWeights`, `weightAudit` (the POC's generated-kind
  helpers, promoted: dequantise once per kind, keep `_bone` labels via `getX`, lamp mesh `noShadow`).
- `kinds/tiller.js` — **the W0 fixture**, role `herd`, `fixture: true`. The proven POC creature
  (`tools/r5-poc/tiller.js`) through the registry; class `kind: 'tiller'`, weak point `lamp`, calm
  lamp `#F2EAD3` (bible §7.2; the wary/hostile colours stay `EYE_COLORS` until LAMP_STATES in W0b),
  bible §7.4 #3 attacks on generic builders (hopper-burst, auger-jab rear, drum-shove, herd-trample),
  one spawn row (herd of 3 at (64, −96)). Model: `/models/r5-poc/tiller.glb` (see gaps).

---

## Contracts published (exact signatures)

### `ctx.machines` (manager)

```
machines.roles        Readonly<{ sentry|herd|swarm|flanker|heavy|keeper|duelist|artillery|support|spotter|ambusher|colossus: string|null }>
                      exactly 12 keys; a value is a LIVE non-legacy kind id (W0: herd -> 'tiller'); null = R18
machines.roleNotes    Readonly<{ [role]: string }>   'R18: no live kind yet — plumb (instruments-a, W1)' | 'R28 fixture: …' | 'live: …'
machines.roleIds      readonly string[]   (ROLE_IDS order)
machines.roleOf(kind) -> string | null
machines.isLegacyKind(kind) -> boolean    true for every kind NOT registered from src/instruments/kinds/
machines.instrumentKinds  Readonly<{ [id]: descriptor }>   (descriptor + `source` path)
machines.kindAudio    Readonly<{ [id]: { set, mass } | null }>
machines.bootAudit    { boot: { kinds: string[], roster: number },          // set IN the constructor
                        deferred: { roster: number, expansion: number },     // set when expansionReady goes up
                        legacy: { loaded, failed } | null, instruments: { loaded, failed } | null }
machines.kinds / canSpawn(kind) / spawn(kind, x, z, opts) / registerKind(kind, Cls)   (unchanged)
```

Removed: `machines.override`, `canOverride`, `mount`, `dismount`, `overrides`, `mounted`,
`squads.corrupt`, `squads.uncorrupt`; machine fields `overridden`, `corrupted`, `mountedBy`;
events `machine-overridden`, `player-mounted`, `player-dismounted`, `machine-corrupted`,
`machine-uncorrupted`, `override-node`, `cauldron-override`.

### Kind module (`src/instruments/kinds/<id>.js`, default export)

```
{ id, Cls, spec: { url, targetHeight, yaw, shadowPolicy? },
  onEntry?(entry), style?, role?, fixture?,
  tables?: { perception?, engage?, attacks?, attackMode?, react?, elem?, alarm?, escort?, scavenger? },
  rig?, doctrine?: { body?, chassis?, components?(m), herd?, reband?: { part: [lo, hi] }, install?(m, opts), spawn?: [ { n, x, z, route, poi, herd?, basking?, convoy?, escort?, routePoints?, territory? } ] },
  audio?: { set, mass } }
```
A file in `kinds/` whose default export has no `id` is ignored (helpers may live beside a kind).

### Registrars (kept files, my grant)

```
ai/tables.js     registerKindTables(kind, rows, { replace = false } = {}) -> string[]   (blocks written; drops the kind's cfg() memo)
                 unregisterKindTables(kind) -> boolean
                 registeredKindTables() -> string[]
ai/doctrine.js   registerDoctrine(kind, row, { replace = false } = {}) -> boolean
                 unregisterDoctrine(kind) -> boolean
                 doctrineKinds() -> string[]
                 rebandMachine(m, band, archetype = null) -> boolean
                 CHASSIS, BODY, SPAWN_PLAN (filled by registration)
                 installDoctrine(m, opts), installExpansionDoctrine(machines), spawnExpansion(machines),
                 siteAnchor(ctx, plan), doctrineAudit(machines)          (unchanged shapes)
autorig.js       RIGS; registerRig(kind, spec, { replace = false } = {}) -> boolean; unregisterRig(kind) -> boolean
variety-assets.js loadKindModels(ctx, rows, { onLoaded, onProgress }) -> Promise<{ loaded: string[], failed: string[] }>
                 (a model already in ctx.assets.models is styled and handed to onLoaded BEFORE the call returns)
                 styleMachine(root, style); freezeSkins(root) -> number; MACHINE_SHADOWS
machine.js       MACHINE_STATES (frozen, 9 states); setState refuses any other name
registry.js      installInstruments(machines) -> { kinds: string[], roles, ready: Promise<{ loaded, failed }> }
roles.js         ROLE_IDS, ROLE_PLAN, FORBIDDEN_ROLE_ID, buildRoles(descriptors) -> { roles, notes }
legacy.js        LEGACY, LEGACY_KINDS,
                 BOOT_SPECS   { kind: { url, targetHeight, yaw, shadowPolicy } }   boot rows (registerAt 'boot')
                 LEGACY_SPECS { kind: { url, targetHeight, yaw, shadowPolicy } }   deferred rows (registerAt 'loaded')
                 installLegacy(machines) -> { kinds: string[], boot: string[], ready: Promise<{ loaded, failed }> }
                 spawnLegacyRoster(machines) -> number   (each kind's roster at most once per manager)
lib/generated.js liftExtras(entry); seedAuthoredWeights(machine) -> number; weightAudit(machine) -> { verts, wrongDominant, legBodyCross, blendedVerts, rigidPct }
```

**For pipeline (`assets.specs` contract):** `legacy.js` publishes the two row sets your
data-driven `assets.js` reads (names as in your branch): `BOOT_SPECS` — strider, scrapper,
glinthawk, longleg — which `loadAll` must load before `Machines` is built (your `legacyRows().boot`
does), and `LEGACY_SPECS` — the 7 Round-4 kinds — which stay deferred (`installLegacy` loads them;
you only list them). Rows carry `shadowPolicy: MACHINE_SHADOWS`, so an entry normalises the same
whichever loader fetched it, and `loadKindModels` styles a pre-loaded entry exactly once
(`entry.styledKind`). Nothing in machines reads `assets.models.{watcher,sawtooth,behemoth,thunderjaw,npc}`.
Until your loader is merged, `legacy.js` carries a merge-order bridge (FIX ROUND 1 §3) that is
inert against a loader exposing `assets.specs`.

---

## Gates (port 5254, this tree)

Fix-round-2 runs on the final code, Oct 16 2026 from 04:42. Reports archived in
`scratchpad/r5/instruments-core/work/fix2/report-{lane,global}.json` (fix round 1 in `work/fix1/`,
the first round in `work/{lane-report-final,global-report-final}.json`).

### This lane's W0a block — `--lane instruments-core`: **5 / 5 PASS, + the `A-boot-roster` guard PASS**

| gate | verdict | measured |
|---|---|---|
| `A-legacy-collapse` (runner) | **PASS** (167 s) | static: 11 legacy kinds / 11 legacy modules, 0 IP kind files, 0 imports of a deleted file, **0 stray imports** of a legacy module outside legacy files, **0 kind rows** in 14 kept machine files (code scan, comments stripped), one door (`index.js` glob). Deletion probes in a scratch copy, 0 other edits: **scrapper** (row 61 lines + `scrapper.js` + `scrapper.glb`) A1 PASS, A20b PASS; **snapmaw** (row 85 lines + `snapmaw.js` + `snapmaw.glb`) A1 PASS, A20b PASS; **the whole legacy set** (`legacy.js`, 2 legacy rig files, 11 species files, 11 models) A1 PASS, A20b PASS |
| `A-kind-registration` (runner) | **PASS** (62 s) | a new module `src/instruments/kinds/zz-icprobe.js` dropped into a copy (the only difference from this tree): copy boots clean (A1, A20b PASS); kind `icprobe` registered, model loaded, `perceptionCfg.gain` 1.234 (own) with `d0`/`tick` from default, `engageCfg.band` [5.1, 13.3] (own) with `hyst` from default, `reactCfg` all default, 2 attacks, mode `table`, elem 77, audio set `icprobe`, 1 spawn row, **1 live at boot**, `isLegacyKind` false, role null. The Tiller fixture in the same page: 4 attacks, elem 110, 3 live, role `herd` |
| `A-no-override` | **PASS** (14 s) | `ai/override.js` absent; **140** `src/**` files (133 `.js` + 7 `.css`): **0** raw-text hits of the §9 regex, comments included, **no allowlist** (fix round 2); 0 hits in comment-stripped code; **0** mechanic identifiers (`OverrideSystem`, `canOverride`, `mountedBy`, `machines.mount`, …); removal-only **14/14** deletions-only vs `9d3b891` (`playerAnimator.js` 170 chars, `menu.js` 14); live: `tables.OVERRIDE` undefined, `overrideCfg` undefined, `EYE_COLORS.override` absent, `_stateOverridden` undefined, 0 of `override/canOverride/mount/dismount/overrides/mounted` on the manager, `MACHINE_STATES` = 9 states; all 12 spawnable kinds asked for 12 states incl. `overridden`/`ally`/`mount`/`mounted` → **0** forbidden states reached. Negative controls (static half): the 3 old comment lines restored → `rawHits` 3; an `override-node` line in `style.css` → `rawHits` 1 |
| `A-no-corruption` | **PASS** (606 s) | 0 code hits of `_updateCorruption` / `corrupt` / `uncorrupt` / `ECOSYSTEM.corruption` / `corrupted` / `_corruptor` / corruption events in 133 files; `ECOSYSTEM.corruption` absent, `squads.{corrupt,uncorrupt,_updateCorruption}` absent; staged Corruptor + strider, scrapper, glinthawk, longleg, broadhead, grazer within 9 m, fight held for **600 s**, 2,359 samples of every machine: **0** `corrupted === true`, 0 `_corruptor`, 0 corruption events, up to 8 machines engaged at once |
| `A-roles-published` | **PASS** (6 s) | 12 roles exactly; `herd` → `tiller` (R28 fixture note), 11 null each with an R18 note naming kind, lane and wave; 0 legacy kinds mapped; 0 forbidden role ids; staging `roles.herd` spawns a `tiller` (modelKind `tiller`, non-legacy). **Not graded:** the gate-roster clause (gap 1) |
| `A-boot-roster` (lane guard, fix round 1) | **PASS** (6 s; 3/3 runs in fix round 1, 1/1 in fix round 2) | READY at 4.1–4.5 s after navigation (3.6 s in fix round 2, same 14 / 6-3-3-2, wrapper at READY, `hookTries` 0); at READY **14 alive** = `bootAudit.boot.roster` (strider 6, scrapper 3, glinthawk 3, longleg 2), all 4 boot models loaded, wrapper installed, `hookTries` 0; deferred half +0.69 / +0.73 / +0.79 s: expansion 14, Tiller herd 3, total 28, boot roster not re-spawned. Negative control (bridge off): FAIL, 0 alive at READY |

### Global green list items that exist today (this tree, port 5254)

Fix-round-2 run, 04:57–05:07, two other lanes' Chromes (5250, 5255) alive; load average 4.08 / 3.90 / 3.94 (1 / 5 / 15 min) when it ended.

| gate | verdict | measured |
|---|---|---|
| `A1-boot-clean` | **PASS** | `state=playing`, 0 console errors |
| `A20b-no-system-errors` | **PASS** | 0 system errors, 0 hook errors, 221 frames |
| `A90-memory-stability` | **PASS** | 28 kills; heap **−9.6 %** (bar < 25 %), geometries **+9** (≤ 40), textures **−28** (≤ 8), scene objects **−1,096** (≤ 60) |
| `A90-memory-stability-expansion` | **PASS** | objGrowth −1,059, nonMachineGrowth **0**, orphan roots 0, geo +3, heap −3.5 %; population budget 1,600 nodes, bootNodes 1,250, not over budget |
| `A90b-memory-attribution` | **PASS** | 0 offenders, 0 orphaned textures, post-GC heap −4.1 % |
| `A90-rig-reclaim` | **PASS** (1 run; 5/5 is the W0b bar) | 30 cycles over 12 kinds incl. the Tiller: geometries **+7** (≤ 40), textures **0** (≤ 30); per live machine (8 striders) geo **0**, tex **0.38** (≤ 1 each); held-then-released 0 / 0 |
| `A9-perf-budget` | gate printed **FAIL** on the fps term; by **R26 it is PENDING** (load average ≈ 4, R26's quiet box is < 3) | draws **309** (< 350, PASS; base 319); fps 36.6, scene GPU 58.8 ms; the gate's own null-frame probe read 1.52 ms at that instant, so its attribution called the box quiet while the load average said otherwise. **Interleaved A/B, base `9d3b891` vs this tree, same minutes (05:08–05:11, load 3.2–6.3), 3 rounds:** base 23.8 / 27.6 / 27.4 fps, tree 27.2 / 27.9 / 38.3 fps (median 27.4 vs 27.9), all six PENDING (null frame 4.3–6.6 ms GPU); draws 319 vs 309. Fix round 2 changed comments only (esbuild output of both `src` files identical), so it cannot move fps; the quiet-box run belongs to the orchestrator (R26) |
| `A21-real-draw-calls` | **PENDING** | draws 309 / 195 / 325 (≤ 350, PASS), triangles 4.12 / 3.67 / 4.25 M (≤ 6.5 M, PASS); GPU and p95 terms not attributable (null frame 6.0 ms GPU). Its staged fight still asks for deleted kinds by name, so it stages fewer machines (gates-perf re-casts it by role) |

Not in this tree yet (other lanes' W0a/W0b gates): `A90-abs`, `A-alloc-rate`, `A-vram-ledger`,
`A-ID-ip-assets-gone`, `A-licence-manifest`, `A-assets-tracked`, `A-no-horizon-terms-player`,
`A-no-horizon-terms-code`, `A-reach-all-sites`, `A-port-guard`, `A-carried-suite`.

### Other checks run here
- brand's W0-day1 block on this tree: `A-identifiers-renamed`, `A-single-rest`, `A-storage-keys`,
  `A-storage-keys-reload` PASS; `A-extent-refactor` FAILs on `colliders` / `navCostHash` only — the
  Override Node pillar R17 removes (see brand, below). All 10 extents and the 20-query path hash
  are identical.
- Two frames of the Tiller herd at boot (`shots/gates/FILM-tiller-{side,herd}.png`, gitignored,
  read by me): the glazed hull, oxblood bands, six stilt legs and front drum render in the old
  valley meadow; a sanity check only — this block has no V gate and the fixture's fidelity is
  instruments-a's W1 work.

---

## Honest gaps

1. **`A-roles-published` is not fully graded.** Its "`tools/gate-roster.mjs` resolves every role"
   clause needs gates-perf's file, which does not exist in this tree; the gate passes on the shape,
   live-kind and R28 clauses and says so in its detail. It must be re-graded once gate-roster lands.
2. **The Tiller model is untracked.** The fixture loads `/models/r5-poc/tiller.glb`, the POC
   generator's output, which is in the main tree but gitignored (`*.glb`). For testing I copied it
   byte-identical from main (sha256 `5900d51e…9c661b53`) into this tree; it is NOT part of the
   branch. On a clone without it the kind fails to load (one `console.warn`), is never spawned, and
   `roles.herd` falls back to null with an R18 note — no console error. When pipeline promotes the
   generator (W0b) `spec.url` in `src/instruments/kinds/tiller.js` moves to its output (one line).
   The GLB carries `extras.r5Generator.licence` but no `extras.provenance` (pipeline's
   `A-ID-ip-assets-gone` / manifest).
3. **Closed in fix round 2.** The three prose comments that kept the English word are deleted and
   `A-no-override` has no allowlist; 0 raw hits in `src/**`. The cost is two shorter comment
   headlines in `playerAnimator.js` (the "tried and reverted" remark is gone; the measurement that
   proves it stays) — deletion was the only edit the removal-only grant allows.
4. **Removal-only leaves two stale counts in prose**: progression.js still says "Six new quests"
   (five listed) and "FOUR NEW OBJECTIVE TYPES" (three remain). Rewording needs an insertion.
5. **Lamp colours are half-done.** The fixture's calm lamp is the bible's `#F2EAD3`; wary and
   hostile still come from `EYE_COLORS` (canon amber/red) until `LAMP_STATES` (W0b).
6. **`A-no-corruption` has no negative control** (the deleted cascade cannot be re-run); its staging
   reproduces the old trigger condition (Corruptor in a fight with 6 other kinds inside 9 m, 25 m
   was the old radius, 4 s period) for 600 s.
7. **A9's fps half is unresolved on this box.** The first run read FAIL (32.9 fps, scene GPU 49 ms)
   while two other lanes' Chromes were rendering. Interleaved A/B on the base commit vs this tree,
   same minutes, load 4.7–8.2: base 22.9 / 24.4 fps (GPU 98.4 / 90.0 ms), this tree 33.6 / 25.0
   fps (68.6 / 86.5 ms), all four PENDING (null frame 6–7 ms GPU); draws 319 base vs 309 here. Not
   a regression; the R26 quiet-box run belongs to the orchestrator. Fix round 2: the global run's A9
   printed FAIL (36.6 fps; the null-frame probe read 1.52 ms at that instant) at load average ≈ 4,
   which R26 grades PENDING; a 3-round interleaved A/B right after gave base 23.8 / 27.6 / 27.4 fps
   vs this tree 27.2 / 27.9 / 38.3, all PENDING. `tools/gates.config.mjs` (gates-perf's) grades
   attribution by the null frame only and does not read the load average R26 names; gates-perf may
   want to add that term.
8. **The Round-4 per-kind machine gates** (`machine-ai`, `machine-rig`, `machines-expansion` lane
   files) were not re-run: they stage deleted kinds by name and are being re-staged by gates-perf
   into the carried suite / kind block. The legacy roster was exercised by the two A-legacy-collapse
   deletion probes, the whole-set probe, A1, A20b and the four A90 gates.
9. **Boot roster (fix round 1): the contract is base's again, with one difference in WHICH
   machines exist at `__READY__`.** Base had 8 IP machines there; now there are the 14 Round-3
   machines. The Round-4 kinds and the Tiller still arrive with `varietyReady` / `expansionReady`
   (0.7–1.0 s after READY here), as base's deferred kinds did. Two consequences others must know:
   (a) **at the W2 exit**, when instruments-b deletes `legacy.js`, the boot roster is empty again
   unless an Instrument kind by then has a boot row (pipeline's `assets.specs.js`) AND its spawn
   rows run in the constructor (today `spawnExpansion` is deferred-only). `A-boot-roster` will FAIL
   at that point by design, so the regression cannot pass unnoticed. (b) The merge-order bridge in
   `legacy.js` wraps `Assets.prototype.loadAll` from outside pipeline's file; it is inert against
   pipeline's loader, but it is still a runtime wrapper of another lane's class, and it should be
   deleted once both branches are on main (deleting 44 lines of `legacy.js`, plus its `Assets` import).
10. **The scratch-copy probes need the lane port.** They stop the lane's own Vite (only one whose
    cwd is this tree), run, and restart it; anything else on the port makes them PENDING.
11. **Fixture details that belong to later lanes:** loot uses today's item ids (`metal-shards`,
    `wire`; combat-kit renames in W2); its audio falls back to the default voice set until the audio
    lane builds `tiller` (W3).
12. **W0b items not started:** `LAMP_STATES` + beams (`A-lamp-states`, `A-lamp-canon-distance`,
    `A-beams-one-draw`), perception weather + perk hooks (`A-perception-weather`, `A-perk-hooks`;
    the §3.2 perk-hook stubs are due on W0b day 1), `uv1` through the fold, VFX palette,
    `A90-rig-reclaim` 5/5 (1/1 PASS today), `tools/gates.r5.kind-block.mjs`.
13. **`A-no-corruption`'s static half is a code scan, by the wording of its bar** (found while
    fixing round 2, not a judge finding). §9 words it as "`_updateCorruption`, `corrupt`,
    `uncorrupt` and `ECOSYSTEM.corruption` absent" (the mechanic's identifiers), not as a
    `src/**` regex count like `A-no-override`, so the gate scans code + strings with comments
    stripped: 0 hits. A raw `grep -rnE '_updateCorruption|\bcorrupt\b|\buncorrupt\b|ECOSYSTEM\.corruption' src/`
    finds 2 comment lines that use the English word for damaged data, both outside my grant:
    `src/ui/settings.js:193` ("corrupt payload: defaults stand") and `src/audio/bank.js:14`
    ("a missing or corrupt file"). If the orchestrator reads that bar as raw text too, those two
    comments need an owner (`settings.js` is shell-ui's from W2; §2 names no owner for
    `audio/bank.js`) or a ruling; I did not edit them.

---

## What another lane or the orchestrator must do

**Orchestrator**
- Merge this lane before hero-body and brand touch `playerAnimator.js` / `menu.js` in W0b (plan
  §3.1). `A-no-override`'s removal-only clause then proves the W0a version on the first commit after
  `9d3b891` that touched each file, so later edits by those lanes do not fail it.
- Run this block alone (`--lane instruments-core`): the two runner probes go first, before the
  harness opens its own Chrome, so the run never holds two Chromes. On the main tree set
  `R5_SCRATCH` (default there is `$TMPDIR/r5-ic-probe-<port>`; in a lane tree it is
  `<tree>/../ic-probe-<port>`). The copies are a few MB and deleted after each probe.
- The full Round-4 suite still names deleted content (list under gates-perf below); expect those
  FAILs until the carried suite replaces them.
- Fix round 1: no ruling is needed — the boot contract is kept on the lane side (machines exist at
  `__READY__`, progression's wrapper installs at construction). After both W0a branches are merged,
  delete the `legacy.js` merge-order bridge (it is inert then) and re-run `A-boot-roster` on main.
  Carry `A-boot-roster` into the W2 exit: deleting `legacy.js` empties the boot roster unless an
  Instrument kind has a boot row and constructor-time spawn by then (gap 9a).

**pipeline** — delete `SPECS.{watcher,sawtooth,behemoth,thunderjaw,npc}` and their GLBs (R30); this
lane no longer reads `assets.models` for them. `legacy.js` now exports **non-empty `BOOT_SPECS`**
(strider, scrapper, glinthawk, longleg, with `shadowPolicy`), which your `legacyRows().boot` merges
into `assets.specs` and `loadAll` loads — your docs say "none today", and your lane guard
`A-pipeline-boot-rows` should expect 6 boot rows after the merge, not 2. Those four files are
tracked and already carry your provenance stamp. `LEGACY_SPECS` is now the 7 deferred Round-4 rows
only. Tell this lane the promoted Tiller output path; add `extras.provenance` to generated GLBs.

**gates-perf** — `ctx.machines.roles` / `roleNotes` / `roleIds` / `roleOf` / `isLegacyKind` are the
shape `tools/gate-roster.mjs` should resolve. Round-4 gates that exercise deleted content:
`A66-quest-objectives-expansion` (lists and walks the deleted `side-cauldron-override` quest) and
`A65-save-restore-expansion` (override tally type gone), `A100-expansion-doctrine` (DIES), and
every gate that stages `watcher` / `sawtooth` / `behemoth` / `thunderjaw` / `redeye` / `tallneck`
by name (`budgets.mjs` staged-fight order, the A90 loop's `spawn('watcher')`, which now returns null
with a console.warn and still PASSes). Fix round 1 measured two of them on this tree:
`A62-focus-components` prefers `sawtooth` and falls back to `list[0]`, now a strider with 2
components against its bar of 3 (FAIL); re-stage it on a kind with ≥ 3 components.
`A64c-silent-apex` FAILs "no Thunderjaw in the scene". Both are R30 staging, not timing; the
judge's waited runs on the pre-fix tree gave the same verdicts. `A31b` / `A31f` choose their hill by
"steepest clear face", and R30 changed which face that is (FIX ROUND 1); pin the site through
`gate-places` when you re-stage them.

**brand** — `A-extent-refactor` now FAILs on two of its own stricter terms: `colliders` 4825 vs the
recorded 4826 and `navCostHash` `e18558a5` vs `92662038`. Both are the Override Node pillar
(`activities.js`) that R17 removes — one static collider and the nav cells under it. All 10 extents
are identical, and so is the 20-query **path hash** (`66a0055d`, the plan's literal clause).
Re-baseline those two terms after this merge. `A-identifiers-renamed`, `A-single-rest`,
`A-storage-keys`, `A-storage-keys-reload` PASS on this tree. `menu.js:787` lost " is overridden"
(fix round 2, comment only); if you want the sentence fuller in W0b, reword it without
`overridden` / `OVERRIDE` — `A-no-override` now greps raw `src/**` with no allowlist.

**hero-body** — `player.mounted` / `mountSeat` no longer exist (nothing sets them). Fix round 2
deleted the English-word "OVERRIDE" from two foot-lock comments in `playerAnimator.js` (the
`_stanceStep` live-test note and the `_tryStep` URGENT headline, now "THE DRIFT BAR GUARANTEE.");
no code changed.

**every lane that edits `src/`** — `A-no-override` is on the global list and now greps the raw text
of every file under `src/` (comments, strings, CSS) with the §9 regex and no allowlist. Lower-case
"override" is fine (`GROUNDED_OVERRIDE`, override channels — `\bOVERRIDE\b` does not match inside
`GROUNDED_OVERRIDE`); the words `overridden` and upper-case `OVERRIDE` anywhere in `src/` fail it.

**instruments-a (W1)** — `src/instruments/kinds/tiller.js` is yours from W1 day 1. Its weak point is
named `lamp` (was `lantern` in the POC). The kind-module contract is above; a module dropped into
`kinds/` registers with no other edit (proved by `A-kind-registration`).

**instruments-b (W2 exit)** — `A-legacy-gone` is already proved in shape: deleting `legacy.js`,
`rig/shells-expansion.js`, `rig/rigs-expansion.js`, the 11 species files and the 11 legacy models
boots clean (A-legacy-collapse's whole-set probe). `index.js` reaches `legacy.js` through a guarded
glob, so no other file needs an edit.

**combat-kit (W2)** — `src/items/tools.js:91` still checks `ctx.machines.mounted` /
`ctx.player.mounted` (always undefined now).

**shell-ui (W2)** — `src/ui/map.js` still lists an `override` site kind (none exist now);
`src/ui/hud.js` quest rows ask for Watcher/Sawtooth/Behemoth/Thunderjaw kills (no such kinds).

**progression (W3)** — first-hour quests that kill/scan a Watcher or the Thunderjaw cannot complete
until rewritten; the `override` tally type and `side-cauldron-override` are gone; `docs/SPEC.md:983`
still lists `override-node` (core-platform's doc).

**audio (W3)** — `audio.js` `SPECIES` still lists the deleted kinds; unknown kinds (the Tiller) fall
back to the default voice set.

**world-props (W1)** — `activities.revealList()` and `props.revealed` lost their only writer; the
cauldron terminal mesh is now an inert prop.
