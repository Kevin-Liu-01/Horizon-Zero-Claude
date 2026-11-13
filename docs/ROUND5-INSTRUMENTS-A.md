# ROUND 5 — lane `instruments-a` (W1 report): Tiller, Plumb, Peg

Port 5258, tree `~/.calima-r5/trees/instruments-a` (branch `r5/w1-instruments-a`). Plan rows used: §2
(instruments-a), §1.2 (the W1 grants on `src/instruments/lib/**`, `lamps.js`, `registry.js`, `machine.js`,
`rig/lod.js`), §3.1 (W1: "Tiller/Plumb/Peg pass per-species gates"), §4.1 (size classes), §8.3 (R46, R53–R67),
§9 (instruments-a + the per-kind block), ROUND5-LOOK §3.4 / §5.2 / §7 (I-01, I-03, I-04, I-05, I-07, P-03,
P-04 d, F-4). The previous builder of this lane left no lane work (its only checkpoint touched the plan), so
everything below is this session's.

```
node tools/gates.mjs --port 5258 --lane instruments-a        # the W1 block (99 rows: 3 x the per-kind block + species + LOOK + carried)
node tools/gates.mjs --port 5258 --lane instruments-a-film   # the lane's own close-up films (V rows)
node tools/build/build-assets.mjs --only instruments-a       # the three GLBs (deterministic, ~6 s)
node tools/build/instruments/gen-plumb.mjs --scale 3 --out <dir>   # a scaled Plumb for review
```

## 1. What was built

### 1.1 The shared Instrument build kit — `tools/build/instruments/parts/kit.mjs` (new)
Every generator builds through it, so the family reads as one maker's work (bible §7.1, LOOK I-03):
- `KBucket` (an `hs.mjs` Bucket that also carries a decal `uv1` per vertex, mapped per TRIANGLE so no
  triangle interpolates between a decal and the white texel; seam unwrap for rings).
- The shared **decal/trim atlas** (256², procedural, embedded in each GLB on `uv1` with
  KHR_texture_transform so repeating bands quantise): levelling-staff E pattern (vermilion / staff white,
  1 cm black ticks), brass numerals, vernier graduations, survey bands.
- `finish()`: baked **vertex AO** (28 Hammersley rays, 0.4 m, three-mesh-bvh), **verdigris** in bronze
  crevices and patches, a **soil/grime band** on the lowest 0.3–0.6 m, glaze **crazing** (roughness
  0.15–0.30 through an 8×4 palette), and the **`_LAMPPROX`** spill field (1 at a lamp rim → 0 at 0.8 m).
- `lod1From()`: the **LOD1 caster proxy** (meshopt simplify per bone label, smooth normals, labels kept).
- `writeInstrument()`: hull (vertex colour × atlas, palette roughness/metal), sensor (emissive), tools
  (tearable components as their own unlabelled nodes) and the LOD1 proxy — **2 glTF materials per kind**
  (the proxy and the tools share the hull's), provenance + r5Stats as `tools/build/lib/glb.mjs`.

### 1.2 Tiller — fidelity pass (`gen-tiller.mjs`, `kinds/tiller.js`, `kinds/tiller-herd.js`)
- Geometry, rig, bone order and sockets of the proven Tiller are unchanged; the finish is the kit's
  (AO, verdigris, grime, crazing, a vernier ring on the drum and on the hopper rim, the serial "06" on both
  thorax flanks); piston rods in satin steel instead of mirror chrome (bible §7.1 "no chrome").
- Triangles were spent where they read: the 24 toe blocks and 10 vent slats were 300-tri rounded boxes
  each (10.2 k tris of toes); now 24.2 k hull + 1.8 k sensor + 7.7 k LOD1 = 34,226 ≤ 35 k, 394,944 B ≤ 400 KB.
- **The auger is a real tool**: its own node, mounted on `tail2` as a component (Pry → no `auger-jab`,
  drops an auger bit); it **spins** while it jabs and the tail cocks (V27).
- **LOD1 caster proxy** (I-04): 7,746 tris (29.8 % of LOD0), shadow-mask IoU 0.987 against the hull.
- **The herd in file** (bible: "core the soil on one bearing"): followers walk the leader's breadcrumb
  ring (`HerdFile`) at 5.2 m per rank; **the chime ripple**: a Plumb's `plumb-chime` makes the nearest
  herd flash its lamps in sequence (0.28 s apart), then flee **in file** (A-herd-ripple PASS).
- Every attack telegraphs (I-05) with its glint on the working end (auger tip / drum / hopper).
- The `fixture` flag is gone: the herd role is now `live: 'tiller'`.

### 1.3 Plumb — new (`gen-plumb.mjs`, `kinds/plumb.js`)
A walking theodolite: three levelling-staff legs (twin-cheek upper sections with a vermilion band, octagonal
E-pattern staffs, bronze collars, steel shoes on disc pads) in bronze clevises on a tripod head with a
tribrach and three levelling screws; a celadon lamp drum with an oxblood band, a vernier horizontal
circle, two bronze standards, a telescope on its trunnion, a graduated vertical circle and the **level vial**
on top; a serial "06" on the drum back; the **bob** on 1.2 m of cable (a 2-bone pendulum owned by the kind).
11,144 tris, 14 bones, 136,852 B (small class). Behaviour: survey stations (8–15 s readings), **Flags**
by sight (`flags: true`), **chimes** on alarm, attacks **Pendulum** (conical 3 m arc), **Bob Drop**
(a stepping drop), **Sightline** (a narrow ranged hit that raises the Flag); the bob is a tearable tool
(no melee after). **Topple** (E10): two level-vial hits → a rigid fall about the rear feet line (or the
front foot), laid on its own lowest bind-pose geometry (lay angle solved per spawn), 4 s down, stands
back up; 0 `gait.js` lines. **`scale` param**: the generator multiplies every length it writes; the
runtime `opts.scale` uses the SAME `scaleRig` (`src/instruments/lib/scale.js`, re-exported by the kit), speeds
by √k; `opts.hullHidden`.

### 1.4 Peg — new (`gen-peg.mjs`, `kinds/peg.js`, `kinds/peg-transect.js`)
A milk churn on four short bronze legs with a dark lamp housing at the front, a **pile-driver** on its back
(a bronze mast; the mallet arm pivots at its head and the banded hammer hangs over the lamp — the `mallet`
bone), and splayed racks of vermilion/white survey pegs on both flanks (the tool: Pry → bronze pins, no
Peg Shot). 7,976 tris, 15 bones (bible 14; class cap 20 — the 15th is the mallet arm V27 needs).
Attacks **Mallet**, **Peg Shot**, **Swarm Rush**. **Transects** (E11): a Peg drives a peg every 2.6 m it
walks (stop, mallet up, slam); every peg of every Peg is ONE InstancedMesh (lit cap in the calm lamp token —
vermilion stays flat ink); consecutive pegs ≤ 6.5 m apart are a segment; her step across a segment raises
every Plumb within 20 m to wary; a site dispose releases the owner's pegs and the draw is disposed with
the last one; each new segment calls `ctx.terrain.cutCover([x0, z0, x1, z1], 1.0)` when world-ground
publishes it (F-4).

### 1.5 The shared runtime look — `src/instruments/lib/hull.js`, `lib/kindkit.js`, `lib/scale.js` (new, grant)
- **Core glow (I-01)**: hull spill `emissive += prox² × lampColour × gain × 0.35` (lamps.js writes
  `lamp.coreU` per frame; no point lights), **calRim** (fresnel² × backlight × 0.35 of the sun's Lambert
  peak), **hull flash** for `machine.flashPart(part, k)` (+0.35 k toward #FFE6C2 for 70 ms real time).
  One program for every Instrument hull; per-material uniforms; nothing per frame in machine code.
- **Interior parallax** in the lamp shader (lamps.js): the core is a glow 0.6 vessel radii behind the
  glass and slides against the ring with the view; a fresnel rim at the glass edge.
- **LOD1 caster** (I-04): `prepareEntry` gives the proxy its own runtime material and `noMerge`;
  `installHull` puts it on `CAL_LAYER.CASTER_ONLY` as the only caster when the engine publishes look-post's
  per-cascade masks (`renderer.shadowMap._calLayers`), else hides it and the hull casts as before.
- `kindkit.js`: tool re-centring (bakes the quantised node transform), detach before `buildRig`, mount on
  a bone after it; glint anchors; `telegraphOnWindup`.

### 1.6 Grants used (plan §1.2)
| file | grant | lines (vs main) |
|---|---|---|
| `src/instruments/lamps.js` | core-glow chunk; `telegraph` ≤ 30 | +62/−4 total: telegraph ≈ 26 (method 7, constants 2, hold 4, glint 10, matrices 3); spill 3; parallax + rim 10; carried minors 2 and 3 ≈ 20 |
| `src/instruments/registry.js` | `height` ≤ 6 | +3 (`machines.heightOf(kind)`) |
| `src/entities/machines/machine.js` | `flashPart` ≤ 12 | +9 |
| `src/instruments/lib/**` | the shared chunk | new `hull.js`, `kindkit.js`, `scale.js` |
| `src/entities/machines/rig/lod.js` | ≤ 20 | **0** (the caster policy already excludes `noShadow` meshes; nothing needed) |

### 1.7 Carried instruments-core minors
1. Fresh-spawn deopt (`Known transient`): **not found this session** (no instrumented Chrome time left
   after the block); it is the orchestrator's gap F under R67 — reported, not claimed.
2. **Chase-camera beam fan at bow range — fixed** in `BEAM_FRAG`: when the shaft points at the eye
   (view-axis cos 0.80→0.95), the lock's last 2.5 m before her chest and everything past her fade out; side
   views unchanged. New rows `A-chase-beam-census-{night,fog}`.
3. **Lock pop at the cone end — fixed**: her chest is never treated as further than `len − lockTailM`
   down the shaft (focus clamp and tail stay continuous). New row `A-lock-pop`.
4. **Ungraded past-her length on the 18/22 m twins**, 5. **unniced runner Vite**, 6. **sunlit staging
   heading**: all three live in `tools/gates.r5.instruments-core.mjs`, which is not in this lane's §2 row
   or grants — **not edited** (rule 1). They are listed for the orchestrator in §5.

## 2. Contracts published (exact signatures)
- `machines.heightOf(kind) -> number | null` (registry; P-03) — Tiller 2.6755, Plumb 3.408 (× `opts.scale`
  on the machine's own `m.height`), Peg 0.924. Descriptor field `height`.
- `machines.lamps.telegraph(machine, t, glint = null, glintR = 0.07) -> boolean` (I-05).
  `TELEGRAPH = { gain: 1.25, coreGain: 1.6, snapTau: 0.027, glintS: 0.12, glintHdr }` (lamps.js export).
  The LOOK text says "1.6× its HDR"; held at 1.6 the ring's on-screen hue moved 7.4 ΔE from #FF2D8C
  (A-play-telegraph c4 ≤ 6), so the RING holds at 1.25× (ΔE 3.39, still 1.9–2.1× its flicker mean) and the
  CORE at 1.6×. Flag for the orchestrator.
- `machine.flashPart(part, k = 1) -> boolean` (P-04 d; melee/combat-kit call it on a hit).
- `lamp.coreU` (record field, Vector3 | null) — the hull spill uniform `lib/hull.js` registers.
- `src/instruments/lib/hull.js`: `prepareEntry(entry, kind)`, `installHull(machine) -> { hull, proxy, casterMode }`,
  `hullOf(machine)`, `flashHull(machine, k)`, `HULL_LOOK`.
- `src/instruments/lib/kindkit.js`: `prepareTools(entry)`, `detachTool(machine, name)`, `mountTool(machine, mesh,
  { name, displayName, bone, anchor, scale, tearHp, linkedAttack, loot, onTorn })`, `glintAnchor(machine, bone, at, S)`,
  `telegraphOnWindup(machine, attack, anchor, glintR)`.
- `src/instruments/lib/scale.js`: `scaleRig(spec, k)` (generator + runtime).
- Events: `plumb-chime` { machine, x, z }, `herd-ripple` { herd, members, at }, `plumb-topple`
  { machine, dir, seconds }, `transect-crossed` { x, z }.
- `machines.transects` (`TransectSystem`): `add(owner, x, z)`, `release(owner)`, `audit()`, `dispose()`.
- Plumb spawn opts: `{ scale, hullHidden }`. Generator: `build({ out, scale, file })`, CLI `--scale`.

## 3. Gates (port 5258, this tree, Nov 12–13; nice -n 10, one gate Chrome, slot protocol)

Runs (reports in scratch, not in the tree): `full1` (the whole block, 22:28–22:55 UTC: 73 PASS / 18 FAIL /
2 PENDING / 13 NEEDS-JUDGE), `r2` (fix round on the 18 + globals, 23:57–00:43), `r3` (final verification:
R3_SUMMARY). The table gives the LATEST verdict per row with its number.

### 3.1 The per-kind block × {tiller (medium), plumb (small), peg (small)}
| row | tiller | plumb | peg |
|---|---|---|---|
| A44 / A44b socket integrity | PASS / PASS (0.00 m) | PASS / PASS (0.00 m; bob hanger added, tools no longer snapped) | PASS / PASS |
| A45 / A45c / A46 | PASS ×3 (0.00 m/frame, 0.00 m) | PASS ×3 (A46 worst 0.049 m) | PASS ×3 (0.00) |
| A47 / A47b | PASS / PASS | PASS (0.07 m) / PASS | PASS / PASS |
| A47c corpse mass | PASS | PASS | **FAIL** (dead median 0.44 m vs loco chassis 0.47 → 0.94; bar ≤ 0.75; a flank roll made it 1.17, reverted) |
| A48 cadence | PASS | PASS (1.73 Hz, band 0.88–2.64) | PASS (2.49 Hz, band 1.4–4.2) |
| A-weights-authored | PASS (0 wrong, 100 % rigid) | PASS | PASS |
| A-sil40 (pairs ≤ 0.45) | PASS (max pair 0.246) | PASS (max 0.192) | PASS (peg\|tiller side 0.428 after the pile-driver rework; was 0.468) |
| A-weak40 | PENDING (13:00 PASS; calima awaits world-sky) | PENDING (13:00 PASS: glass/face 10.4) | PENDING (13:00 PASS) |
| A-lamp-states | PASS | PASS (lamp r 0.20) | **FAIL** (r 0.15 lamp at 0.5 m in grass: hostile pinhole 5 lit px at 15 m; rhythm/sputter unreadable) |
| A41b / A41d / A41c | PASS ×3 | PASS ×3 (bands [2.6, 7], sole ≤ 53 %) | PASS ×3 |
| A42 stagger | PASS (auger) | PASS (bob, 0.95 s) | PASS (rack, 0.87 s) |
| A-linked-attack | PASS | PASS (pendulum 0 after the bob, 31 phases) | **FAIL** (0 attack phases in 60 s after the tear; the staged Peg is the world's nearest, 56 m out; not diagnosed) |
| A-glb-budget | PASS (34,584 tris, 24 bones, 2 mats, 397,928 B) | PASS (11,368 / 14 / 2 / 138,496 B) | PASS (7,976 / 15 / 2 / 112,344 B) |
| A21-with-kind | PASS (fight 255 draws; kind 6/6) | PASS (253; 4/6) | PASS (254; 5/6) |
| A90-expansion / -rig-reclaim -with-kind | PASS / PASS | PASS / PASS (geo +1, per live 0.13) | PASS (after the transect draw was tied to the Peg count) / PASS |
| V26 / V27 / V-lineup | NEEDS-JUDGE (filmed) | NEEDS-JUDGE | NEEDS-JUDGE |

### 3.2 instruments-a (W1) species rows
| row | verdict | measured |
|---|---|---|
| A-plumb-scale | **PASS** | scale 3 (10.2 m) and 6.5 (22.2 m), hull hidden: A45c 0.00 m/frame, A46 0.00 m, A48 1.05 Hz in [0.49, 1.46] (s3) — both scales green |
| A-plumb-topple | **PASS** | fall 0.40 s, down 4.01 s, penetration 0.035 m, stands back up (tilt 0), gait.js identical to main (SHA-256) |
| A-flagged | **PASS** | 3 recipients (tiller, peg, tiller) in search 0.01–0.017 s after the Flag; control at 80 m untouched; lasted 8.013 s / 3.008 s with flagDuration 3 |
| A-transect | **PASS** | 8 pegs, 1 instanced draw per frame; crossing → near Plumb (11.4 m) wary in 0.058 s; far Plumb (35 m) calm; site dispose disposes the transect geometry + material; `cutCover` PENDING world-ground |
| A-herd-ripple | **PASS** | flashes 0.017 / 0.283 / 0.567 s (span 0.55 s ≤ 1.5); alarm at 0.567 s; followers' worst lateral 1.97 / 1.46 m over 927 samples; leader 30 m |

### 3.3 ROUND5-LOOK per-kind rows (I-01, I-03, I-04, I-05, I-07) — this lane's harness
| row | tiller | plumb | peg |
|---|---|---|---|
| A-core-glow (a core ≥ 1.25× bloom, c spill, e materials) | **FAIL** c-far (near +163 %, far 21 %) | **FAIL** c-far (near +43.5 %, far 12.6 %; 2.3 % in an earlier run) | PASS (near +74.7 %; far n/a: no hull beyond 1.2 m) |
| A-core-parallax (d, ≥ 2 px) | PASS (6.2 px) | PASS (2.77 px) | PASS (2.02 px) |
| A-play-telegraph | PASS (13 attacks, lead 0.48–0.60 s, hold 1.8× flicker, hue ΔE 3.39) | PASS (pendulum, sightline, bob-drop; 0.55–0.70 s) | PASS (3 moves, 0.46–0.55 s) |
| A-ip-emissive | IPE_T | IPE_P | IPE_G |
| A-hull-value | **FAIL** (a, b, d PASS; c foot/upper noon 1.56; e backlit edge 1.05) | **FAIL** (a–d PASS: foot 0.79, verdigris 5.7 %; e 0.88) | **FAIL** (c noon 1.23, d 0.95 %, e 0.67) |
| A-instr-shadow-lod | PENDING look-post: (a) LOD1 29.8 % of LOD0 PASS, (d) shadow-mask IoU 0.984 PASS; (b) needs CAL_LAYER, (c) quiet box | — (small) | — (small) |

### 3.4 Carried minors (lamps.js)
| row | verdict | measured |
|---|---|---|
| A-lock-pop (23.5 → 24.5 m across the cone end at night) | PASS | light at 50 % changes ≤ 0.14 % per 2 cm step, radius ≤ 0.11 % |
| A-chase-beam-census-night / -fog (18 m, chase camera) | PASS / PASS | magenta added 1.42 % / 0.053 % (< 2 %) |

### 3.5 Global green list items run in this tree
| row | verdict | note |
|---|---|---|
| A1-boot-clean, A20b-no-system-errors | PASS | |
| A90-memory-stability, A90-rig-reclaim, A90b-memory-attribution | PASS (r2) | the herd workload now respawns the live Tiller |
| A-ID-ip-assets-gone, A-assets-tracked, A-no-horizon-terms-code, -player, A-lamp-canon-distance | PASS | namecheck --code PASS (1371 = ratchet; three new "lens" tokens renamed) |
| A-port-guard | GLOBAL_PG | r2 FAIL was this lane's: the gate module ran `git diff` at load; replaced by a file hash |
| A-licence-manifest, A-roles-published, A-beams-one-draw | GLOBAL_LRB | |
| A21-real-draw-calls | PENDING-quiet-box (draws + tris PASS) | R45/R58 |
| A90-abs, A-alloc-rate, A-vram-ledger | not graded in-lane: "Waiting failed: 90000ms" (r2, late in a 46-min run while other lanes' runs queued) | R58/R67: graded at the orchestrator's W1-exit run; this lane's owner rows were not measured |
| A-kind-registration (instruments-core's) | FAIL in r2: its nested run timed out (exit 130, no verdicts) | infrastructure; re-run on 5270 |

## 4. Honest gaps
1. **Peg**: A47c (wreck mass 0.94 > 0.75), A-lamp-states (the r 0.15 lamp sits in the grass at 0.5 m; the hostile pinhole is
   5 lit px at 15 m), A-linked-attack (no attack phases after the tear; undiagnosed), A-hull-value. The Peg also cannot meet
   A-ip-emissive c2 (≤ 1.5 % of an ~800 px silhouette = 12 px) with any lamp A-lamp-states can read — the two bars
   conflict for a 0.9 m kind; see §5.
2. **A-hull-value** (I-03) fails on every kind: the backlit edge band reads 0.67–1.05× interior (bar 1.5×) even with calRim
   at 2.5 × kRim 0.35 of the sun's Lambert peak, and at noon the feet read brighter than the shaded upper half on the
   Tiller and Peg (grime band down to 10 % albedo at the pads). The measurement (my harness) may be weighting thin legs as
   "edge"; not resolved.
3. **A-core-glow c-far** fails on the Tiller and the Plumb: the far hull changes 12–21 % between the spill-on and spill-off
   frames although its spill term is exactly 0 there — bloom and/or wind-moved grass between the two frames; the harness
   has no on/on noise control yet. Spill k is 0.2 (LOOK says 0.35: at 0.35 the Plumb's whole drum read as a lit head
   in daylight, filmed in V27).
4. **I-04 caster swap is inert in this tree** (look-post's CAL_LAYER is not merged): the LOD1 proxy ships and is hidden; the
   hull still casts. (b) and (c) are graded after look-post merges.
5. **The fresh-spawn deopt** (carried minor 1) was not investigated; R67 gap F stands. A-alloc-rate was not measured on this
   lane's owner rows.
6. **The visual bar (R54)**: read against `ext:kevin-nov6-keyart.jpg#1-BL` / `#2-TR` (finish only) and
   `reference/r5/gates-perf/survey-tripod.jpg`. The Plumb reads as a surveying instrument at once (staff legs, theodolite
   head, bob); the Tiller's finish (AO, verdigris, vernier, serial) is better than W0 but still reads clean and toy-like at
   golden hour next to the 1-BL panel — no dirt streaks, no plate overlaps, a bright bone hull; the Peg's pile-driver frame
   reads as a cart handle from the rear and its lamp housing as a large camera lens. None of the three yet "looks
   incredible" next to the panels; the judge should treat V26/V27/V-lineup as open.
7. Spawn rows are W0-map staging (Tiller 64,−96; Plumb 40,−70; Pegs 40,−30): world-props/settlements own placement.

## 5. For the orchestrator and other lanes
- **orchestrator — kind block** (`tools/gates.r5.kind-block.mjs`, yours): (a) A-glb-budget counts every mesh: it should budget
  LOD0 only (meshes whose extras carry `casterProxy` are I-04's LOD1, §4.1 "LOD1 optional/required ~35 %"); the Tiller fits
  35 k only because its toes and vents were re-tessellated. (b) Fold this lane's LOOK rows (A-core-glow, A-core-parallax,
  A-play-telegraph, A-ip-emissive, A-hull-value, A-instr-shadow-lod) into the block for -b/-c/-d. (c) A-ip-emissive c2 vs a
  Peg-sized silhouette: rule on a Peg exemption (as A-sil40/A-weak40 have).
- **orchestrator — instruments-core's gate file**: carried minors 4 (grade the 18/22 m twins' light length), 5 (`spawn('nice',
  ['-n','10','npx','vite',…])` at ~:480) and 6 (the sunlit staging heading) are in `tools/gates.r5.instruments-core.mjs`,
  outside this lane's row; not edited.
- **orchestrator — LOOK numbers**: I-05 "hold 1.6× HDR" breaks its own hue clause (7.4 ΔE); the ring holds at 1.25×, the core
  at 1.6×. I-01 spill k 0.35 → 0.2 (see gap 3). Please rule.
- **pipeline (closed) / orchestrator**: `public/models/r5-poc/tiller.glb` is no longer written by gen-tiller (my lane's outputs
  are `public/models/instruments/{tiller,plumb,peg}.glb`); the stale copy serves only `?poc=biome` until world-ground removes
  it at the W1 exit; then delete it and its path in the `instrument-tiller` licence row. `w0b-checks.mjs` LANE_OUTPUTS still
  lists `instruments/tiller.glb` under pipeline.
- **look-post**: the LOD1 proxy takes `CAL_LAYER.CASTER_ONLY` automatically once `engine.js` exports `CAL_LAYER` and the shadow
  map carries `_calLayers` (your branch does both). Small kinds do NOT use CASCADE0_ONLY: a hull off layer 0 would leave the
  combat raycaster (layer 0) unable to hit it.
- **hero-body (P-03)**: `machines.heightOf(kind)` (Tiller 2.68, Plumb 3.41, Peg 0.92); a scaled Plumb's `m.height`.
- **melee / combat-kit (P-04 d)**: call `machine.flashPart(part, k)` on a hit.
- **world-ground (F-4)**: Pegs call `ctx.terrain.cutCover([x0, z0, x1, z1], 1.0)` per new segment when it exists.
- **world-sky**: A-weak40's calima clause is PENDING on your weather state (unchanged).
- **audio (W3)**: `plumb` and `peg` sets fall back to the default voice; events `plumb-chime`, `plumb-topple`, `herd-ripple`.

## 6. Files changed (this lane, W1)
New: `tools/build/instruments/parts/kit.mjs`, `tools/build/instruments/gen-plumb.mjs`, `tools/build/instruments/gen-peg.mjs`,
`src/instruments/kinds/{plumb,peg,peg-transect,tiller-herd}.js`, `src/instruments/lib/{hull,kindkit,scale}.js`,
`public/models/instruments/{plumb,peg}.glb`, `tools/gates.r5.instruments-a.mjs`, this report.
Changed: `tools/build/instruments/gen-tiller.mjs`, `public/models/instruments/tiller.glb`, `src/instruments/kinds/tiller.js`,
`src/instruments/lamps.js` (grant), `src/instruments/registry.js` (grant, +3), `src/entities/machines/machine.js` (grant, +9),
`public/LICENSES.json` (rows `instrument-plumb`, `instrument-peg` through `tools/licences/add.mjs`). Not changed:
`rig/lod.js` (grant unused), `gait.js`, `autorig.js`, every other lane's file.
