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

GATES_PLACEHOLDER
