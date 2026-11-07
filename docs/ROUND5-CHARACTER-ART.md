# ROUND 5 — character-art (W1; R54, R56, R58, R59, R63, R64, R66)

Brea's close-up, rebuilt in the recipe, and the kit settlements builds NPCs on (R56, R57 c). Budgets did not move. Fix round 2
(Nov 6-7) answers the eight findings of the gate judge and the engineering + film judge: §0 maps them to what was done, §2 measures the
final build, §3 is the reusable API (fix round 2's additions at its end), §4 keeps fix round 1's map.

## 0. Fix round 2 (Nov 6), finding by finding

The eight findings of the gate judge (`character-art/W1/gate-judge`) and the engineering + film judge (`fix-r1/judge-eng-film-r1`).
Before building I read Kevin's five Nov 6 references (R66 a), outside the repo. Image 1's three face panels are our own frames repainted,
and they show where the face has to go: a lid with a crease and a dark lash line, a warm iris under the lid, full lips, a short, soft
lower face, small round ears, and chalky paste. Everything was iterated offline first. I used a CPU previewer of the GLB (sun, hemi,
shadow, ACES) and the posed see-through scan built against the live idle pose dump, so Chrome was used only to confirm. Every number
below comes from the final build unless it says otherwise.

| # | finding | what was done | measured |
|---|---|---|---|
| 1, 6a | The eye in profile is a pale wedge: no catch-light, no lash hair, no lid | **One patch per eye** (`remapEyeUV` with two rects), each painted from **that eye's own opening** (`paintEye({ open, centre, side })`). The upper lid and its lashes shade the top third of the ball (×0.30 at the margin, back to full by 3.4 mm). The lower lid occludes a band over a thin, smooth tear line. Both corners fall to a warm grey near the skin's value (corner ×0.5, warmed 55 % toward the skin), and the inner corner has a pink caruncle. The sclera base drops from (176,162,144) to (166,148,130). Two glints sit either side of the cornea's apex (+1.25 mm / -2.1 mm), so a profile from either side finds one on the near face of the cornea. **Lid rims:** a row lying on the ball under each upper lid's margin, 0.85 mm, mapped to a new `lidRim` cell (lash line → warm lid brown, wet last row). **Lashes:** a two-sided card that curls forward (`curl` 0.24 over the inner two thirds), 6.8 mm, so a profile reads hair standing past the lid. The far eye's outer third shortens sooner, splays less (0.30) and loses its curl. The lash texture's strands no longer cross and sit on a solid root band, so no view shuts a pocket of sky (A-wrap-closed). The rim and the lashes are rough (0.5-0.7), because a smooth wet row caught the 08:00 sun as a white liner. **The lateral white** (what a profile sees) falls to about 40 % by the corner. The ball the lids always cover (2 mm margin) is culled: `cullEyeUnderLids`, 220 tris | detail sheet: both eyes in profile |
| 5a | "Inset glass balls": a bright, even white all round the iris, no lid thickness | the upper lid comes down 1.2 mm (was 0.72) and the lower lid up 0.95 mm (was 0.5). Both are held clear of the ball and of the cornea dome, never through them. Add the lid rim, the lid shade and the corners above | front: the lid covers the iris top, there is no scleral show below, and the lash line is dark |
| 5b | Lips have no volume | sculpted in the field from the stock midline's measured landmarks: the upper lip's white roll; the bow's two peaks lifted and its notch held; the tubercle; a philtrum groove between two columns; the lower lip fuller, rolled forward in two lobes over a real mentolabial fold; the corners tucked in. The lips' roughness drops to 0.34, so the lower lip carries a sheen | NOSE + LIPS panel |
| 5c, 4 | The lower face is long and heavy | chin bump dy -1.6 → **+1.8 mm** (3.4 mm up); jaw d (-1.3, -6.0, 1.4) → (-2.6, -4.4, 3.4), so less of it goes down and more goes in and forward; the mandible's line 2.4 → 1.2 mm down | A-face-delta: chin 6.47, jaw 6.13 mm (≥ 6 kept), IoU see §2 |
| 5d | Dark smudges at the mouth corners and under the nose read as stubble | three causes, all removed. (1) The muzzle zone painted the mouth area cooler and greyer; it is now neutral warm. (2) The nasolabial fold ended beside the corner of the mouth as a dark spot; it now stops above the corner, softer. (3) The `inward` layer took forward-facing skin toward near-black wherever the baked AO was low, which included the corners' deep fold; it now does that only round the nostrils. The baked AO's floor is also raised over the philtrum and the corners, and the source's strokes are smoothed in the ring round the lips | V-brea-closeup-low (08:00) |
| 5e, 4 | Matte skin, no specular breakup; large smooth planes | roughness in the ORM: forehead -0.17, brow centre -0.06 more, nose tip -0.24, bridge -0.20, cheekbone crest -0.10 on top of the cheek's -0.12, chin -0.14, lips 0.34. A `planes` layer adds a 1 cm undulation in height (0.13 mm) and in tone (±5 %), and a finer drift in the sheen. A sub-lid fold and a faint line under it (`creases`) | V-brea-closeup, -low |
| 4 | Salt paste: white band, black-pepper speckle, pixelated edges | `saltPaste` rewritten. The paste dries into **plates** about 5 mm across (cell 190/m), split by continuous hairline cracks only where it lies thick. The network is incomplete (some borders never split), and a crack is the skin in shade, a warm dark brown, never black. Plate edges curl. The dry-brush edge drags along the stroke in streaks the texels can carry, with no per-texel noise anywhere. **Texel density:** the face's density rule had stopped matching once the forehead was culled, so the face fell to the skull's 1.5, 0.56 mm a texel. It is 2.1 now, **0.43 mm a texel**, so the stroke is 19 texels tall instead of 14 | EYES + SALT PASTE |
| 4 | Temple coil patches end in a hard right-angle step | the box cut-outs round the ear (in `hairShape` and `hairBandUnderHem`) are gone. `earClear` keeps a wandering clearance of 3-6 mm off the reshaped ear's own outline. `templeHair` runs the temple down into a sideburn whose front and bottom edges meet in a soft point at the tragus' height, and over the ear the hair runs on to the nape. The skull sides and ears had also lost their density rule to the same culling (1.1 mm a texel); at 2.6 they are **0.64 mm**. The arms, which are elastic, give 14 % of their texels for it | HEM + TEMPLE, both sides |
| 4, 6b | Ear oversized, set high, elfin point, thick rim | `reshapeEars` (lib/skin-human.mjs). Each ear is scaled to **0.85** about its attachment, so it also stands off the skull less. In its own (y, z) plane the upper half's outline is pulled back toward an upright ellipse, so the helix is an arc with no top-back point. The lobe's tip rounds up and in. The ear and the skin round its root then go down **5 mm** together, so it is lowered, not sheared | THE EAR, profiles |
| 2 | The wrap tail is low-poly folded paper with hard kinks at the joints | `clothTail({ smoothSkin, rootRows, hem, ripple })`. Each row is skinned to three joints with quadratic B-spline weights, so a bend at a joint spreads over the rows either side of it. The rest shape follows a Catmull-Rom curve through the chain's points, not their polyline. The rows go where it bends: 4 on the gathered root, 18 on the free strip, crowded toward the root's end where the stiff root hands over to the hanging strip (22 in all, was 18 even). The selvedges are **rolled hems 3.4 mm thick**, joining the two faces with their normals turning round. The hem sits on the faces' own edge vertices, and with a hem the faces sample inside the panel's frayed selvedge. The first live run showed a sky-white slit along the edge, from a hem set 0.85 mm off the faces and their frayed alpha, and this closes it. A soft sag and ripple runs down the free strip. The chain, its names and its points are hero-body's and are untouched | tail 516 tris (was 360); backlit, shade, detail-back |
| 3 | R63 (c): narrow the tail to 0.40 × 0.07 m | **Superseded by R66 (c)** (Nov 6): the narrowing is suspended; the tail keeps its current length and the work goes into soft, thick, rippling cloth with no paper edge (row 2). Nothing narrowed | — |
| 7 | A-wrap-closed fails on reproduction (1 of 96, at the ear top); the row sees one idle instant | **The row now grades three idle phases in one run**: now, then 1.3 s and 2.9 s further. The world runs with its fog, sky and objects back between phases, and the kit and the cloth ends are re-collapsed for each phase. **The ear-top cause is trimmed:** the three temple cards a side that stood over the ear are gone, and no nape card stands within 20 mm of the ear's outline (the last three cards, which closed a sliver of sky against the skin from behind, are gone too). The ear is 5 mm lower and smaller. The lowest nape cards and the temple cards lie flatter (a fifth to a third of the lift). | §2. The judge's ear-top hole is gone. **Not closed:** a 6 px crack (5 x 2, at the speck rule's limit) where turn 1 meets turn 2 low at her back-right, over the skull that the wrap culls, seen from below-behind-right at one idle phase (r4 and r5: phase 0, az 255, el -0.35). It reproduces offline at az 252 / el -0.35 and az 258 / el 0 |
| 8 | A-wrap-closed cannot see the collar (R64 d) | **A second view set in the same row**: 24 azimuths × elevations 0, 0.4, 0.8 and 1.2 rad at 0.8 m, centred on `neck_01` minus 0.06 m, in the body's level frame, at all three phases (576 views in all). **What it counts:** a pixel is a hole when it is background with the player drawn as it is but covered when every player material is drawn double-sided. That is a look through a surface from its back into a hollow, never the air between body parts. The first two forms of this region counted that air as holes (r3, r5): a 300 px radius, then the collar's convex outline. **What it found:** slivers beside the neck, at the base of the collar stand, where a level look meets the smock's single-sided inner wall. Against them the body now carries a dark **collar wall** (`appendCollarLiner`, 22 tris, 3 mm inside the smock round the sides and the back, facing the neck; 19 lid segments pay for it). Offline this takes the collar views from 13 to 8 with see-throughs (1,025 → 712 px). §4 rows 14 and 15 now cite this row | §2. **Not closed:** 8 offline collar views, 24-289 px each, at the neck-to-stand junction from behind (az 120-195, el 0.4-1.2) |

## 1. What was built

All of it is procedural, in `tools/build/recipes/brea.mjs` and `tools/build/recipes/lib/{face,skin,skin-human,hair,wrap,wrap-head}.mjs`,
from the CC0 UBC sources only. Nothing was downloaded.

| brief | now |
|---|---|
| blocky paper band, torn alpha, no folds | Wound cloth on the measured head form (`woundHeadwrap`): a base turn, two crossing turns, a gathered crown, a wound topknot with a seated carmine binding, a wrap knot. Each layer lies on the ones under it (`clothStack`) and sends both hems under them. Whatever a later layer wholly covers is dropped (`cullCovered`), which pays for closed shells inside the head wrap, the bun and the knot |
| see-through (fix round 1, `A-wrap-closed`) | Measured on the LIVE pose (the head bowed about 20 deg, the arms down): 3,397 enclosed background px over 18 of 96 views became 0 offline and 8 px in 1 view live (b3), then the last fix (§2). Causes and cures: a look down the collar past the bowed head slid between her back and the single-sided smock and out through it (a dark lid inside the collar, `appendCollarSkirt`, §3 step 8); the crease where the bun meets the head wrap (the bun's shell swells into it); slits at the knot's side (the knot's shell stands proud, its turns sink their hems); the crown cap's hem (dives 6 mm under the turns); pinholes in the hair and lashes (two-sided scalp cards that hug the scalp, coil strands a texel fatter below the tips, shut pockets filled, the outer lashes splay less) |
| dark helmet shell | Coil cards at the nape and temples with a broken outline, with real value (crowns of dark warm brown over the bible's near-black). Close coils painted at BOTH temples under the real hem (`hairBandUnderHem`). The hairline's edge wanders at two scales (fix round 1), so it breaks into coils, not a clipper's line. The knot tail is a frayed cloth end on the same `dyn_hairKnotTail` chain |
| blunt, oversized nose; weak jaw | Tip lifted, narrowed and given a plane, alae in, bridge straightened; cheekbone up and forward, jaw angle down; the far cheek's outline and the ear's rim refined (`refineEdges`, `smoothPositions`). Fix round 1 (R54 "wide and flat", "a ball nose"): the lobule narrows to a defined tip and the alar lobules slim (across only, so the profile does not move), a small tip-defining point with its underside tucked up; the jaw angle comes down and 1.3 mm IN (its 6 mm delta kept), the mandible's line 0.9 mm in; a soft 3.4 mm hollow under each cheekbone, so the bone reads as a lit plane over a shaded fall to the jaw |
| faceted ears (fix round 1) | The source's normal map was baked against the stock ear's own vertex normals; on the moved, re-split and softened ear it printed flat planes across the helix and the concha. The ear keeps its unsoftened normals and the map's relief goes in at half (`ears` layer): the folds read, the planes do not |
| black nostrils, a pale shard, lit lines in a back light (fix round 1) | The game's sun shadow samples 3.5 cm out along the vertex normal (`environment.js` `normalBias 0.035`), so a surface that a few millimetres of her own skin hide from the sun lit up anyway. `leanInwardNormals` ends with three ray passes on the mid-face: a deep fold shades by its bent normal; the nose's underside takes the light the upper lip throws into it (a forward lean, safe in a back light); and for 36 back suns a vertex its own skin shuts off turns away from it by the least projection. The nostrils are graded dark brown round a dark slit; no pale columella shard; the alar groove, the lip corners and the lower lids stay dark with the sun behind her |
| topknot crown (fix round 1) | The crown cap's radial pleats reach down to 31 deg (was 46), 10 pleats over 5 rings and 24 segments, 3 mm over the turns (none pokes through as a tone block), reading only 56 px of the panel's length (no concentric rings); more segments on the bun's turns, so its outline has no corners |
| flat skin | Ray-cast AO baked into albedo and ORM, convexity shading, seamless tone, colour zones, pores, creases. A hero fill through the emissive slot (same image, no new map or draw) that follows the scene's ambient (R59 c: 0.963 at noon, 0.511 at dusk, 0.075 at 01:00; `A-brea-fill`) |
| flat salt stripe | A finger-wiped stroke of uneven width, cracked over its whole length in the albedo as well as the height, a painted light top edge, a shaded bottom edge |
| scar | 3 cm, down from under the wrap THROUGH the left brow and out of its lower edge; the hairs and the soft mass part over the brow's full height; a sunk pale channel with raised darker lips |
| ∴ as three white blobs | Three small dark ink dots on the back of the right hand |
| eyes without depth | 160 px procedural eye patch: fibred iris, limbal ring, catch-lights, a wet line; a cornea dome in the geometry, so the iris reads from the side. Fix round 1: the white falls off sooner and further toward the corners, so in profile it is a warm shaded wedge, not a pale plate |
| wrap tail | The root starts inside the knot as a closed gathered roll. Fix round 1 (R54, "the carmine lining is the loudest thing on her"): the violet facing turns back over 38 % of the lining at each selvedge (was 30 %), so a quarter of its width is carmine. The chain rig and points are hero-body's and are untouched |

## 2. Gates (`tools/gates.r5.character-art.mjs`; `node tools/gates.mjs --port 5266 --lane character-art`)

Fix round 2, Nov 6-7, port 5266. Final build: `brea.glb` 656,308 bytes, sha256 `2971abe1fd8c…`. It comes from
`build-assets --only hero-body`, the tree's file is byte-identical to that output, and `brea-clips-ual2.glb` and `outfit-pan-1.glb`
are unchanged. Runs:
- **r3** = the first fix-round-2 build, which showed the hem slit and the white lid line.
- **r4** = the build before the last two changes, with every global row.
- **r5** = the final build: the lane rows, the must-stay-green rows and the re-filmed V rows.

The visual rows are my own reading; the independent judge grades them (R29).

| gate | result | measured |
|---|---|---|
| **A-brea-budget** | PASS (r5) | r5 (`2971abe1`): 9,924 tris live (skin 6,685 + hair/wrap 3,239; ≤ 10 k), 2 draws, 1 skeleton, skin 1024² + 512² normal / ORM / AO, hair/wrap 512², 656,308 bytes (≤ 0.7 MB); alpha cut 0.5, per-vertex shadow, face normal energy 3.02 (≥ 0.6), AO range 90..255. Final build (`52ea0c43`, + the collar wall): 9,930 tris, 656,596 bytes (offline count, the gate's method: live = not hide-masked) @R6BUDGET@ |
| **A-wrap-closed** (R64 d, 3 phases) | @WRAP@ | @WRAPM@ |
| **A-brea-fill** (R59 c) | PASS (r5) | emissive 0.963 noon, 0.511 dusk, 1.0 overcast, 0.075 at 01:00 (bar ≤ 0.15) |
| A-face-delta | PASS (r5) | ≥ 6 mm on 5 of 7 (bridge 7.88, cheek 6.30 / 6.31, jaw 6.12, chin 6.48, brow 7.39; tip 5.05, upper lip 1.18), eye socket 0.213 mm (≤ 0.5), profile IoU 0.867 live / 0.9167 recipe (≤ 0.92) |
| A-human-bind | PASS (r5) | 52 / 52 pairs, hipScale 0.994 |
| A-hero-draws | PASS (r4, r5) | her own 4 draws, 2 casters, 19,980 tris (body 9,924, outfit 7,876, kit 2,180; ≤ 20 k under this tree's R38 row; R62 a's 40 k reading is the binding one). r3 failed at 20,014: the eye-cull margin went from 2.6 mm to 2 mm. The final build is 19,986 by the offline count @R6DRAWS@ |
| A33-hair-bounce | PASS (r5) | `dyn_hairKnotTail_04` detrended 0.075 m (≥ 0.04), 3.75 Hz vs footfall 3.75 Hz |
| A-tail-legible (hero-body's) | PASS in r3, r4 and r5 (three runs in a row) | 0 of 24 gust moments failing each time; graded reach min 4 (bar 4), clear3 min 5; with smooth skinning, rolled hems and 22 rows on hero-body's unchanged chain |
| A-wrap-clear | PASS (r5) | min clearance 0.055 m (≥ 0.05) |
| A-brea-contrast | PASS (r5) | salt 6.20:1, sand ΔE 21.1, 20.9 % of pixels at 3:1 |
| A-outfit-merge-dispose | PASS (r5) | geometries 152 → 152, textures 115 → 115, skeletons 3 → 3 |
| V-brea-closeup, -right, **-low** (new), -shade, -dusk, -dusk-right, -back, -backlit, -night, -detail, -detail-back | NEEDS-JUDGE; filmed and read | §2.1 |
| V-brea-closeup-calima | PENDING (R59 b) | this tree has no calima state; the row says so and cannot pass on a stand-in |
| V-brea-face, V-brea-one-glance, V23-secondary-motion | NEEDS-JUDGE; read | |
| A1, A20b | PASS (r5) | 0 system errors (r5; r4 raised `Environment.update` from the old A-wrap-closed phase advance, fixed) |
| A90b-memory-attribution | PASS (r5) | 0 offenders |
| A90-memory-stability, -expansion, A90-rig-reclaim | PASS (r4) | rig-reclaim geo growth 0, tex 0; expansion and stability within bar (r4) |
| A90-abs, A-vram-ledger, A-alloc-rate | PASS (A90-abs, A-vram-ledger, r5); A-alloc-rate FAIL, not this lane | A-alloc-rate's baseline guard names `instruments-core` (0.09 vs 0.07 KB/frame); no `src/hero` or recipe owner appears, and this lane changed no runtime code this round. Its per-function bar is graded at the W1 exit (R67) |
| A9-perf-budget, A21-real-draw-calls | PENDING (r4) | draws 241, median 59.9 fps, p95 17.9 ms; the timing terms are PENDING on a busy box (R58 b) |
| A-build-deterministic | PASS (r5) | 19 outputs, 0 differ, on disk equal; r4 failed only because the committed `brea.glb` lagged the recipe between two checkpoints @R6DET@ |
| A-assets-tracked, A-ID-ip-assets-gone, A-no-horizon-terms-code | PASS (r4/r5) | namecheck `--code` 1371 of 1371 |
| A-no-horizon-terms-player | PASS (r4) | 1504 ≤ 1508 |
| V22-chase-framing | PASS (r4) | fill 0.683 |
| A-licence-manifest | PENDING (r4) | the third-party term is PENDING on another lane's row; every other term PASS |
| A-port-guard, A-carried-suite | PENDING | a lane run has no sealed carried run: the orchestrator's rows |

How the work was checked before Chrome: a CPU previewer of the GLB (sun, hemi, shadow map, ACES), a posed variant that skins it
with the live idle pose dumped in fix round 1, and the posed see-through scan (`A-wrap-closed`'s 96 head views, offline, with a ray
trace through any enclosed pixel). These tools live in scratch, not in the tree. The offline scan read 0 enclosed px on the final build;
the old build read 16 px over 2 views there.

**`A-wrap-closed` in fix round 2.**
- **r3:** the first collar set used a 300 px radius round the collar. From 0.8 rad up it counted the air between her arm and her side
  (15-18 k px, enclosed by the arm, the torso and the hip) as a hole: not a see-through.
- **r4:** a hull of the smock down to the chest still took it in. Advancing the idle with the fog removed also raised
  `Environment.update` errors. That is fixed: the world runs with its fog, sky and objects back between phases.
- **Final row:** it grades the collar views inside the collar's own projected outline, the stand and its rim. In r4 the head set's
  only hole was a 6 px sliver between a nape coil card and the skin's outline (phase 0, az 255, el -0.35). The same feature was in the
  old build offline at 16 px over 2 views, and live it shows at some idle phases and not at others. The three cards that stood within
  20 mm of the ear are gone, and the scan reads 0 offline.

### 2.1 Still weak, next to the reference (read on r4's and r5's frames, beside `portrait-bokeh.jpg` and Kevin's Nov 6 face panels)

1. **Overall (R54).** She is closer to Kevin's face panels than at any earlier point:
   - a lid with a dark lash line over a warm iris;
   - a shorter lower face, a smaller ear and a natural temple line;
   - cracked paste, and a sheen on the forehead, nose, cheekbone and lower lip.

   Beside the photo she still reads as a stylised game heroine. There is no subsurface, so the terminator down the nose stays hard in
   a low sun, and the lips are fuller but still thinner than the reference's. I would not call the close-up "incredible" yet.
2. **Eyes in profile.** No longer a pale plate: a warm, shaded wedge, a dark lid rim and a glint at the cornea's front. The lashes
   read as hair from the front and the 3/4. In a true profile they are a sparse fringe, because the outer third has to stay short so it
   shuts no pocket of sky against the temple (A-wrap-closed).
3. **Wrap tail.** The slit along the edge is closed and the edges are rolled hems; the strip bends smoothly between joints. Where the
   stiff root hands over to the hanging strip, the chain's own joint angle is about 70°. Even spread over the rows either side, that
   corner still reads as a fold in the still-air nape view.
4. **Ear.** Smaller, lower and round-topped. Its rim polygons show at the detail panel's 0.26 m.
5. **Paste.** Plates and continuous cracks read as dried paste. At 0.8 m in full sun the stroke is a little too clean and white next
   to the key art's streakier paste.
6. **Calima** is not graded (R59 b).

### 2.2 What others need to do
- **hero-body:** the tail's chain names, joint names, points and the A-face-delta landmarks are unchanged. The tail mesh is now skinned
  over three joints with B-spline weights on a Catmull-Rom rest curve, and has rolled hems. `A-tail-legible` grades its silhouette:
  §2 has my runs. R63 (c)'s narrowing is suspended by R66 (c). The idle head is still bowed (R64 b, yours).
- **armory:** the cord and the smock are in every close-up (R64 a, yours); the collar view set of `A-wrap-closed` now films the smock's
  collar from above at 0.4..1.2 rad, so it will show you what it finds there.
- **settlements:** §3's fix-round-2 additions. An NPC head needs the two density rules as they now read (a culled face fell to the
  skull's density silently), `paintEye` with its opening, `cullEyeUnderLids`, `earClear` in place of any box round the ear, and the
  `inward` rule (forward skin is never blacked by low AO except round the nostrils).
- **orchestrator:** the independent judge for the V rows (R29); `V-brea-closeup-low` is a new row (08:00, the judges' low-sun frame).
- **armory:** the alidade cord still reads as a thick white low-poly V at the collar in every close-up (R64 a, yours). The smock is
  single-sided. Seen into from the armholes and the hem, the double-sided test finds its inside culled; those see-throughs lie outside
  the collar views' 220 px and are not graded here. At the collar itself, the body now carries a dark inner wall (§0, row 8), but a
  closed inner collar in the outfit remains the clean fix.
- **world-ground / world-sky / instruments-core:** `A-alloc-rate` names their owners (`terrain.js:78`, the baseline guard's
  `instruments-core`), not this lane.
- **orchestrator:** `V-brea-closeup-calima` needs a re-film when world-sky's state merges (R59 b). `A-port-guard` and
  `A-carried-suite` need a sealed run. On the Chrome slots: the protocol's 20 s poll lost about ten releases in a row to lanes that
  re-take a slot at once, so this lane waited 1.5-2 h per run.

## 3. API (reusable: `tools/build/recipes/lib/**`, Node only, deterministic, no clocks or `Math.random`)

### `lib/face.mjs` (kept from hero-body, one addition)
- `smoothNormals(prim, { iters, weight(p) })` softens vertex normals, welded by position; `weight` 0
  keeps a crease (lips, lids, nostrils). Do this after `recomputeNormals`.
- `smoothPositions(prim, { iters, weight(p), lambda, mu })` Taubin smoothing of positions, welded: rounds an ear's facets and
  a cheek's outline without shrinking them. Recompute the normals after it.

### `lib/skin.mjs`
- `relayoutSkinUV(prim, { density(island), reserve:[{id,w,h}], pad, elastic }) -> { islands, islandOf, reserved, shrink }`
  re-packs UV islands by a per-island scale (uniform scale + translate, so tangent normals stay
  valid). `island = { min, max, uv, tris, s, ox, oy }`; old uv = (new uv - ox/oy) / s.
- `decodeStockSkin(baseImg, normalImg, roughImg) -> stock`, `seamlessTone(prim, islands, islandOf, stock, W) -> [r,g,b]`
  (the source's broad colour welded across UV seams).
- `TriGrid(soup, cell).cast(ox,oy,oz, dx,dy,dz, maxT, minT)`, `triSoup(prim, keep?, out?)`,
  `bakeAOTexels(pm, grid, { rays, maxD, lift, want })`, `bakeAOPoints(pts, nrms, grid, opts)`,
  `blurMasked(src, W, H, valid, radius)`, `convexity(prim)`, `scalarMap(prim, values, W, H, fill)`.
- `paintSkinAtlas({ prim, islands, stock, W, tone, toneAt, ao, aoW, conv, layers, pm, toneMaps, formK, baseRough }) -> { base, normal, orm, filled, stats }`
  (RGB buffers at W; resize normal + ORM with `webp(buf, W, { to: 512 })`). A layer is `(T) => void`;
  `T` holds the bind position (`X,Y,Z`), normal (`nx,ny,nz`), atlas `x,y`, `r,g,b` (0..255), `h` (height, m),
  `rough`, `ao`, the source `sr,sg,sb` and its soft copy `br,bg,bb`.
- Layers: `smoothSkin({ zone })`, `eyeSocketClean({ eyes })`, `lipTone({ center, r, gain })`,
  `colourZones([{ at, s, gain, rough }])`, `pores({ zone, depth })`, `creases([{ pts, w, depth, dark }])`,
  `lidLines({ open, side })` (`open = eyeOpening(faceGrid, eyeCentre, { eyeR })`),
  `saltPaste({ y(X), half(X), xMax, salt, thick, cell })` (a finger-wiped chalky stroke of uneven width: fat in the middle, thin
  at its edges, cracked over its whole length in the ALBEDO as well as the height, because full sun clips the paste and a crack that
  lives only in the normal vanishes on the lit cheek), `scarSeam({ a, b, color, rim, w, depth })` (a sunk pale channel with raised
  darker lips), `inkDots({ dots, r, where })`.
- `eyeOpening(skinGrid, eyeCentre, { eyeR, ballGrid })`: pass `ballGrid` (a TriGrid of the eye mesh alone, `skinGrid` being the
  skin alone): a lid can lie within a hair of the ball, and without two grids the opening reads 3 mm too tall, which floats the
  lash card and the painted lid line up onto the lid.
- `paintEye(N, { span, iris, amber, rIris, rPupil, lidY }) -> { base, normal, orm }`, `blit(dst, W, patch, pw, ph, x, y)`,
  `webp(buf, W, { to, quality, channels, alphaQuality })`.

### `lib/wrap.mjs`
- `headForm(headSoup, { center, lift(dx,dy,dz), blur }) -> form`, `ellipsoidForm(center, { r, rAxis, axis, egg }) -> form`.
- `clothStack(form, { azN, elN, skin(dx,dy,dz) }) -> { topAt, clothAt, skinAt, bridged(d, spread), add(g), coveredAt }`: what is already
  wound on a form, as a radial height field. Give every layer the same stack, in order.
- `ribbon(form, { n, o0, w, warp(s), along, rowsT, lift, pillow, creases, creaseAmp, seed, joint, stack, bridge, hemSink, hemStart, hemDive, clearSkin, uv:{ rect, period, W, pxPerM, v:[a,b] } })`:
  one turn of cloth, a small circle on the form. With a `stack`, `lift` is the clearance ABOVE WHAT IS UNDER IT (about 1 mm, not an absolute
  height), `bridge` the angle over which it rides across a step in the layers under it, and both hems go `hemSink` under the cloth below
  them, so no hem stands in the air and two turns meet on the upper one's hem. Exposes `g.radiusAt(dx,dy,dz)` (null where it does not reach).
- `crownCap(form, { elMin, rings, seg, lift, gather, pleats, hem, uvRadial, stack, tiltAxis, uv })`: `uvRadial` runs the panel's creases up to the crown as
  pleats, never round it in rings; give it a narrow `uv.rect` width (Brea: 56 px) so the panel's length does not print rings either, and a `lift` (3 mm) that
  clears the bumps of the turns under it, or they poke through as tone blocks. `cordRing(c, axis, R, r, opts)` is kept; a seated binding is a narrow `ribbon` with rows `[-1, 0, 1]` on the stack.
- `underShell(form, { axis, oMin(s), seg, rings, at(dx,dy,dz), joint, uv, W, cloth })`: a closed low-poly shell. `cloth: true` maps a panel on it where it can be seen.
  Brea's bun shell swells 12 mm below its waist (`at` grows with the downward axis), filling the crease where the bun meets the head wrap; the
  knot's shell stands 1.2 mm proud of the knot form and the knot's two turns sink their hems 1.6 mm into it (`lib/wrap-head.mjs`).
- `cullCovered(g, depth(p), margin)`: drops every triangle wholly under what covers it; `compactGeo(g)` (lib/wrap-head.mjs) then drops the vertices. This is what pays for the shells.
- `clothTail(points, joints, { along, across, width(u), side, curl, twist, gather, gatherTo, roll, fold, rootBack, uvFront, uvBack, uvEnd })`: `roll` bulges the root's
  two faces apart into a closed rope that reads from both sides under FrontSide, `rootBack` starts the cloth that far inside the knot, and the faces meet at the selvedges.
- `vertexAO(geo, grid, { rays, maxD, floor })` writes COLOR_0 contact shadow; `fixWinding(geo)` (always,
  before joining: a double-sided material flips a back face's normal).
- `WRAP_ATLAS` (512² regions), `paintClothPanel(buf, { rect, period, dye, dye2, dye3, seed, creases, stripe, ... })`,
  `paintFrayEnd(buf, opts)`; `buf = { base: RGBA, normal: RGB, orm: RGB }` at 512².

### `lib/hair.mjs`
- `coilField(W, H, opts)`, `coilSampler(field, periodM)`, `paintCoilTile`, `paintCoilFringe`, `paintLashes`.
- `hairCoverage(pm, shellGrid, { W, want })`, `hairlineLayer({ coverage(T), sampler, flowUV(T, uv) })`:
  close hair painted into the skin atlas, dissolving through the coils at its edge. Coil crowns carry a dark warm brown over the bible's near-black, with a small metalness:
  more metal than that and the diffuse goes with it, and the nape reads as a black shell.
- `scatterAnchors(grid, { center, step, keep(p, d) })`, `coilCards(anchors, { flow(a, R), skinOf(p), rect, length, width, liftTip, twoSided })`.
  `twoSided` (fix round 1) gives each card its back as its own triangles: a card standing off the scalp is seen from behind through another
  card's air, and FrontSide culled it, leaving a pinhole of sky. `paintCoilFringe` fattens every strand by a texel below the tips (the
  runtime's mipmaps thin a strand under the 0.5 cut) and fills every pocket of air not open to the tips; `paintLashes` fills the pockets
  crossed lashes shut in. Both keep the broken outline at the tips.
- `coilTuft(points, joints, { count, along, width, uv })` a tuft on a dyn_ chain (kept for NPCs; Brea's knot tail is cloth now).
- `browLayer({ x0, x1, line(x), side, strokes, scar, mass })` a soft mass with hairs combed over it, herringbone, tapering to the tail (a paint layer).
- `lashCard(open, { side, joint, zAt, rect })` upper lash cards (fix round 1: the outer corner splays 0.42, not 0.62, and ends at 46 % length, so
  the far eye's lashes do not stand past the cheek against the sky).

### `lib/wrap-head.mjs` (a whole headwrap from a spec)
- `woundHeadwrap({ headSoup, skin(dx,dy,dz), joint, center, lift(dx,dy,dz), base: { tiltDeg, warpDeg, lowDeg, w, lift }, turns: [{ phiDeg, tauDeg, oDeg, w, lift, pillow, bridge, creaseAmp, seed, along, flip }], bun: { c, axis, r, rAxis, topY } | null, knot: [x,y,z] | null, tail: { points, joints, width(u), side, curl, twist, gather, gatherTo, roll, fold, rootBack, along, across } | null, tail2: { points, joints, width(u), side, curl, twist, gather, fold, rootBack, along, across } | null, tuft: { points, joints, count, along, width, side } | null, shell: { seg, rings } | null })`
  `-> { geo, parts, culled, covers(p), lowEdge(p), hemGap(p, max), stack, form, soup, center }`. Spec for Brea: `tools/build/recipes/brea.mjs`.
  **Breaking for an NPC spec written against the first version:** `hemDrop`, `hemDropUp` and `lowTuck` are gone, and a turn's `lift` is now about 0.0009 (the clearance over what is under it).
  `skin(d)` is a cast from inside the head, ears included: where the hems go under (`null` from it falls back to the form). The wrap closes itself: the head, the bun and the knot each hold a closed shell.
  `hemGap(p, max)`: metres of bare skin between a head point and the first hem above it (0 under the cloth, Infinity past `max`): hair and shade that follow the real hem.
- `paintWrapAtlas(doc, material, { deep, violet, dark, mid, stripe, lining: [a, b, c], facing })`: paints the standard
  512² atlas (cloth in those dyes, the coil tile, fringe, lock tile, lashes) and sets the material
  (`MASK` 0.5, double-sided, metallic-roughness from a new ORM). A faction wrap is new dye hexes. `facing` (0.3) is how much of the lining's width
  the outer dye turns back over at each selvedge; the binding reads the carmine centre.
- `joinGeos(list)` joins buckets with `fixWinding` + a default COLOR_0; `compactGeo(g)`, `rising(phi, tau)`, `rotAbout`, `DEG`.

### `lib/skin-human.mjs` (what every human recipe does the same way; call order = brea.mjs `build`)
1. Field: `findLandmarks` -> bumps -> `faceField` -> `applyField` (face.mjs) -> `recomputeNormals` -> `refineEdges(prim, { want, minLen, maxEdges })`
   (the jaw, the far cheek's outline, the ear's rim) -> `smoothPositions` (ear, cheek) -> `recomputeNormals` -> `smoothNormals`.
   `corneaDome(eyesPrim, eyes, sphereZ, { height, r0, r1 })` after any socket measure: from the side the iris and a wet form read.
2. `woundHeadwrap(...)` or your own hair, then `cullUnderWrap(prim, covers, isEar)`, `cullEyeBacks(eyesPrim, eyes)`,
   `simplifyHands(prim)`, `compactPrim(prim)`: these are what pay for the cloth.
3. `relayoutSkinUV(prim, { density: humanDensity, reserve: [{ id: 'eye', w, h }], pad: 0.009, elastic: 0.7 })`, `remapEyeUV(eyesPrim, eyes, rect)`.
4. `eyeOpening(skinGrid, eye, { eyeR, ballGrid })` per eye, `lashCard(open, { side, joint, zAt, rect })`.
5. `paintHumanSkin({ bodyPrim, skinMat, layout, eyeR, EYE_PX, L, eyes, brows: browLines(browPrim), shellGrid, occluders: wrapped.soup, collar: outfitTris, opens, marks: [...], scar, tone, iris, amber, hairColor, hairShape, hairBand, names, fill }) -> { stats }`.
   `hairBand = hairBandUnderHem(wrapped.hemGap, { center, az0, az1, azEnd, width, max })`: close coils at BOTH temples under the real hem, clear of the ear.
6. `leanInwardNormals(bodyPrim, eyesPrim, { L, eyes }) -> bent` AFTER the paint: what faces into the head stays out of a sun behind her (the shadow pass renders back faces), and
   (fix round 1) three ray passes on the mid-face (from under the lower lip to just over the eyes, |x| < 0.052): bent normals in deep folds (open < 0.62 of 96 rays within 3 cm),
   a forward lean of the nose's underside, and a least-turn projection away from every back sun (azimuth 100..260 deg, 4..52 deg high) that her own skin shuts off. The
   reason is the game's shadow `normalBias` (0.035 m): a surface a few millimetres of skin hide from the sun is lit unless its normal turns away. Any human head needs it.
7. `scalpCards({ bodyPrim, headW, shellGrid, wrapped, skinJ, skinW, hairShape, temples, twoSided })` (`temples: true` for a wrapped head; Brea passes
   `twoSided: true`; the cards now hug the scalp, tip lift 0.4..1.6 mm, so their tips break the hairline over skin, not against the sky),
   `primFromGeo(doc, joinGeos([...]))`.
8. `appendCollarSkirt(bodyPrim, outfitTris, { centerZ, y0, rx0, rz0, rx1, rz1, seg, rings, gap, backLift, margin, lip, darkUV }) -> firstVertex` after the paint:
   a closed dark lid inside the collar, both faces, skinned like the torso under it (never the neck). It runs from inside the neck to
   `margin` (12 mm) short of the collar's wall at the BACK, a hand's width under the rim there (`y0 + backLift`), with a lip to `lip` (6 mm)
   from the wall; at the front and sides it stays inside the neck. A look past a bowed head into the collar meets it, never the ground
   behind her back through the single-sided smock. 6 mm was the closest that never poked through the smock with the arms down, measured
   on the live pose. Exempt the lid's vertices from the hide mask (Brea: `i < skirtFrom`).
- `faceLayers({ L, eyes, cheek })` the standard layers; `hairShape(X, Y, Z)` the default hairline (pass your own for
  another head); `vertexWeightOf`, `eyeCentres`, `eyeFrontZ`, `movedMask`, `compactPrim`, `primFromGeo`, `EYE_SPAN`.
- A skin tone other than Brea's: `tone` (`#rrggbb` at the mid-cheek). The source layout and the stock tone stay; all paint is 3-D.
- The landmarks' rigid sockets are unchanged from W0b (the cornea dome is applied after that measure). The `_HIDEMASK` rule changed in one way: a body vertex
  inside and under the collar's opening (`insideCollar`, brea.mjs: y > 1.40, |x| < 0.112) is never hidden, or a look down the collar meets the ground through her.

### The material contract
- Skin: opaque, 1024² base, 512² normal, 512² ORM used as both occlusion and metallic-roughness (R AO,
  G roughness, B metal: 0 on skin, 0.7 on painted hair, metallic factor 1). The emissive slot points at the same base image with a factor (`paintHumanSkin({ fill })`,
  default [0.15, 0.108, 0.09]; the wrap [0.09, 0.09, 0.09]): the hero fill, in place of a subsurface pass, so a shadow side keeps
  its form on dark skin. No new map, no new draw. ACES crushes the darks hard (an input of 0.02 comes out at 0.003), which is why the factor is this size. `src/hero/index.js` scales
  `emissiveIntensity` every frame by the scene's ambient against noon's (R59 c: 7.5 % at 01:00), allocation-free; an NPC needs the same line. WebP normals are 4:2:0, so keep pore relief bold enough to survive it, and do not
  print it into the albedo as well, or it reads as freckles or stubble.
- Hair + wrap: `alphaMode MASK` cutoff 0.5, FrontSide at runtime (`src/core/assets.js` forces every model's material to it, whatever the glTF says: geometry must carry both faces of anything seen from both sides, and `fixWinding` must have run), `COLOR_0` (u8 RGBA, linear: RGB contact shade,
  A multiplies the alpha cut), `metallicFactor 1` with the ORM's B channel (0 on cloth, 0.19 on hair, so
  near-black coils do not go grey in a strong sun, and keep their diffuse in the shade). The ORM is a third 512² map; §4.4's "hair 512²" counted one.

### API added in fix round 2 (settlements: these are the parts an NPC head reuses)
- `lib/skin.mjs` `paintEye(N, { span, iris, amber, sclera, open, centre, side, conv, skin })`: given `open` (that eye's `eyeOpening`), `centre`
  (its eye centre), `side` (+1 her left) and `conv` (the patch's convergence offset, `±EYE_CONV`), the white is painted from the real lids:
  upper-lid shade, lower-lid occlusion over a tear line, corners to `skin`'s value, a caruncle at the inner corner, glints either side
  of the apex. Without `open` it paints the old shared patch.
- `lib/skin-human.mjs` `remapEyeUV(prim, eyes, [rectL, rectR])` one patch per eye (a single rect still works); `EYE_CONV`.
  `paintHumanSkin({ eyeR: [rectL, rectR], sclera, eyeSkin, temple })` paints each eye from `opens[k]`.
  `cullEyeUnderLids(eyesPrim, eyes, opens, { margin })` drops the ball under the lids (Brea: 186 tris).
  `reshapeEars(prim, headW, { mm, scale, drop, c, skull })` scale, round and lower the ears (UBC female numbers by default).
  `earClear(X, Y, Z, { gap, ear })` and `EAR` the ear's side outline; `templeHair(X, Y, Z)` the temple-to-sideburn hair. `hairShape`
  and `hairBandUnderHem` use `earClear` (no box cut-outs). `scalpCards` keeps every card 11 mm off the ear and six temple cards a side.
  `humanDensity`: the face and skull-side rules match the culled islands (face 2.1, skull sides + ears 2.6).
  `faceLayers` adds `planes` (broad skin undulation), the sub-lid fold, the AO floor over the philtrum and the mouth's corners.
- `lib/hair.mjs` `lashCard(open, { ..., length, curl, twoSided, rim: { h, rect, onBall(p) } })`: the lid-margin row on the ball, the forward
  curl, the lashes' backs. `paintLidRim(buf, { rect })` the margin cell; `WRAP_ATLAS.lidRim` = [384, 416, 128, 16] (spare is now
  [384, 432, 128, 80]). `paintLashes`: non-crossing strands, a solid root band.
- `lib/wrap.mjs` `clothTail(points, joints, { ..., rootRows, smoothSkin, hem, ripple })` (through `woundHeadwrap`'s `tail`): rows by
  region, B-spline skin weights over three joints and a Catmull-Rom rest curve, rolled hems, a running ripple. Defaults reproduce the
  old strip.
- `lib/skin-human.mjs` `appendCollarLiner(prim, outfitTris, { centerZ, y0, seg, reach, inset, below, darkUV }) -> { first, tris }`: the
  collar's dark inner wall, single-sided toward the neck, at the azimuths whose cosine is under `reach` (0.45: the front V stays open).
  Call it after `appendCollarSkirt`; the hide mask exempts it like the lid. `appendCollarSkirt({ ..., reach })`: the cosine past which
  the lid reaches the wall (default -0.1, the back only, unchanged).
- `lib/hair.mjs` `coilCards`: an anchor's `liftK` scales its tip lift; `scalpCards` sets it for the lowest nape cards (0.2), the cards
  near the ear (0.2) and the temple cards (0.3), and drops nape cards within 20 mm of the ear.
- `lib/skin.mjs` `saltPaste({ y, half, xMax, salt, thick, cell })`: `cell` is now the plate size (190/m); the old `cell` 300 fissure
  network and its fine twin are gone.

## 4. Fix round 1, finding by finding

The 23 findings of the gate judge (`character-art/W1/gate-judge`) and the engineering + film judge (r0). "Frame" names the row whose
final sheet shows it; every frame was filmed at 1600 x 900 on port 5266 and read by me, side by side with the previous sheet. Several
of these were first fixed by the previous builder of this round (cut off on Nov 3, its work checkpointed); I verified them on the
live frames and kept them.

| # | finding | what was done | measured / frame |
|---|---|---|---|
| 1 | no coils at her right temple | coils painted under the real hem at both temples (`hairBandUnderHem`), temple cards; the right side is now filmed | `V-brea-closeup-right`, `-shade`: close coils at the right temple with a broken edge |
| 2 | the scar stops at the brow's top edge | the 3 cm scar runs through the brow and out of its lower edge; the hairs and the soft mass part over the full height; a sunk channel with raised lips | `V-brea-closeup-detail` LEFT BROW + SCAR: a clean gap through the brow |
| 3 | see-through slits and a wire strap at the hems | hems go under the layers below (`clothStack`, `hemSink`); the slits closed by the A-wrap-closed work (row 15) | `A-wrap-closed` (§2); no strap in any 3/4 |
| 4 | profile eye a grey wedge, a lash slab | cornea dome; the white falls off sooner toward the corners; lashes thin at the outer corner | detail THE EYE IN PROFILE: brown iris at the front, a shaded wedge, hair-thin lashes |
| 5 | nape panel unreadable (tail across it, black shell) | new `V-brea-closeup-detail-back` films both napes in still air; coil crowns carry warm brown | detail-back: both napes are coils with value and a broken outline |
| 6 | calima not gradeable | R59 (b): PENDING until world-sky's state is on main; the row says so and cannot pass on a stand-in | `V-brea-closeup-calima` PENDING |
| 7 | R54: the day close-up looks cheap | nose, nostrils, cheek, jaw, ears, sockets, lining (rows 8-11, 23, 24) | still weak: §2.1 |
| 8 | nostrils black with a pale shard; ball tip | graded nostril paint, bent normals and the underside lean; narrower lobule, defined tip | front/3/4: dark brown nostrils round a dark slit, no shard |
| 9 | sockets near-black, right brow lost | the hero fill (R59 c); lid shadow painted, not baked black | `-shade`: socket, brow, nose wing, cheek separate in the shade |
| 10 | the salt line's lit half a smooth stripe | cracked in the albedo as well as the height over its whole length | detail EYES + SALT PASTE |
| 11 | far-cheek polygon outline; faceted ears | edges refined on the cheek and temple outline; the ear's facets came from the normal map, now at half on the ear with its own normals | detail THE EAR: rounded, folds read, no planes |
| 12 | zigzag where the turns cross on her right | each turn lies on the stack under it | `-right` profile: one cloth over another |
| 13 | staging hid the cord, filmed one side | close-up rows hide only the lance and bow (`setHidden(3)`), film both sides, the back and back-high, backlit, night | every sheet shows the alidade cord |
| 14 | a sliver inside the collar | the collar lid (row 15) | `A-wrap-closed`'s COLLAR view set (fix round 2, R64 d: 24 azimuths x elevations 0..1.2 rad round neck_01 less 6 cm, graded inside the collar's own projected outline, at three idle phases); in fix round 1 this was verified offline only |
| 15 | the back of the wrap open; no scan | `A-wrap-closed`: 96 views on a key colour; closed by the lid, the bun swell, the knot shell, the cap hem, the hair fixes | 3,397 px / 18 views (b2) -> 8 px / 1 view (b3) -> fix round 2: head AND collar sets at three idle phases, §2 |
| 16 | only her left filmed | 8 close-up rows: both sides, shade, dusk both sides, back, backlit, night, two detail sheets | §2 |
| 17 | (= 1) | | |
| 18 | (= 2) | | |
| 19 | R59 c: the fill constant at night | `src/hero/index.js` scales `emissiveIntensity` by the scene's ambient every frame (9 lines, allocation-free); `A-brea-fill` | 0.963 noon, 0.511 dusk, 0.075 at 01:00 |
| 20 | polygon artifacts where wrap layers cross; bun rings; saw-teeth; wire loops | binding as a seated ribbon; cap radial, lifted, narrow UV; more bun segments | back / back-high / detail-back: pleated crown, seated binding |
| 21 | the tail root a flat plate | closed gathered roll from inside the knot | detail-back KNOT + TAIL ROOT |
| 22 | backlit: bright nostril, white lines at lips and lids | the three ray passes in `leanInwardNormals` (§1) | `V-brea-closeup-backlit`: none |
| 23 | ears and nostrils the cheapest things | rows 8 and 11 | |
