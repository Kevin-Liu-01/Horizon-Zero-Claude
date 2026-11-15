# CALIMA — BACKLOG

Findings outside the frozen rows of [`GATES.md`](GATES.md). Nothing here blocks a merge unless it is marked
**blocker**. Severity: **blocker** (hard rule, crash, regression) · **major** (a frozen row fails) · **note**.
Each item names the area that owns it. An item is deleted when it is fixed; this file is not a history.

Gate ids are the ids in `tools/gates.r5.*.mjs`. Section and milestone references (§, M…) are to
[`BIBLE.md`](BIBLE.md) and the build plan. The per-area reports this list was built from are in git history.

## 0. Integration

| # | sev | owner | item |
|---|---|---|---|
| I1 | major | armory | The armour sets key their own body cover on the old body's triangle counts (7,932 / 13,580). The integrated `brea.glb` is 7,342 / 12,448, so every set falls back to the body's own cover bit (`src/hero/parts.js` `ownMask` returns null). That bit matches the Starter; Pan II, Pan III and Ash I need their own covers. A trial rebuild against the integrated body put `armor-pan-3.glb` at 151,076 bytes, over the 0.15 MB `A-armory-budget` cap (Pan II 149,856, at the cap). |
| I2 | note | armory | `public/models/armory/stowkit.glb` does not equal its recipe's output on `r5/int`; `A-build-deterministic` will flag it. Likely the stowed-bow angle change (28° → 20°). Rebuild it. |
| I3 | major | hero-anim | About 33 animator fields are added outside the constructor of `playerAnimator.js` (`_aimAlign`, `_aiT`, `_aoT`, `_rh*`, `_lx*`, `_tuW`, `_caA`, `_caPoseW`, `_aimRan`, `_bladeSm`, `_tAimW`, `_gripH`, `_tr*`, `trunkReach`, `trunkStep`, `_gv*`, `_nl*`, `_bsT`, `_hcS` …). Each is a new hidden class on a hot object. Declare each in the constructor during the M1.3a split, then re-measure `A-alloc-rate` on the animator. |
| I4 | major | hero-anim, melee | Press detection in `src/combat/melee.js` is a hand merge of the bow's left-button rule onto the melee press / hold / release logic. It has never run live. Re-run the drawn-dodge and held-cancel cells (0 lance steps, 0 strikes) and `A-melee-latency`. |
| I5 | major | hero-art, hero-anim | The wrap tail mesh was tuned on a 0.489 m chain and now rides a 0.540 m chain. `A-tail-legible`, `A-wrap-clear` and `V-brea-one-glance` must be re-run on the integrated Brea. |
| I6 | major | orchestrator | Every gate run before integration was on a lane's own tree. The 77 kept-stack rows (GATES §3) have not yet run on `r5/int`, and the integration merges touched the kept stack. They must run before the next merge that touches it. |
| I7 | closed | orchestrator | Merged on `r5/int` (M0.2b, Nov 14): world-ground's fix round 1, world-sky (main merges only), world-props' sea-stack rebuild and look-post's grade re-fit; `vite build` clean. The lanes' own status documents stay retired (modify/delete resolved as delete). The Instruments' shadow-caster swap waits on look-post's layer constant. |
| I8 | note | people | The NPC kit under `tools/build/recipes/npc/lib/kit/` is a copy of the hero kit at an older commit. Delete the copy, point the NPC recipes at the shared library and rebuild (M1.2a). |
| I9 | note | engine | `vite build` warns that one chunk is over 1,500 kB. Split the hub UI and the turntable into lazy chunks. |
| I10 | major | orchestrator | Booted live on `r5/int` at 6b979f2 (Nov 14, headless Chrome, Vite 127.0.0.1:5270): ready in 5.9 s, 0 console errors, 0 failed requests; Brea on the ground 0.9 m from the Brazier at REST; `installPeople` ran: 10 people, all nine archetypes, every one in a clip; key 2 puts the lance in her hand, key 1 stows it and selects the Sabina bow. Still to confirm: the in-game credits screen against the licence manifest. |
| I11 | closed | engine | The name lint is at 0 outside the files held to R4b (Nov 14). The grass-cover identifiers are renamed to reed cover (`inReedCover`, `isInReedCover`, `reedCoverDensity`, `pReedCover`, also in the carried file so its rows still run); the element channel keeps its engine id but its sound, zone key and HUD swatch use Dust; the item and HUD words use MAKE and Instrument; the previous lint's term data under `tools/lint/` is deleted (only `allow.json` and `credits-sync.mjs` remain); two dead Round-3/4 tools (`tools/compare.mjs`, `tools/bake-rigs.mjs`) are deleted; four carried row ids are renamed (A100/A101/V46/V48 lance, A70b-node-travel, A61b-rest-event). |
| I12 | note | systems | Stand-ins left by the removal: one quest ("Raker's Morning", first two objectives), one named person, 24 Field Book stubs with no text or position, quick slots 1 and 2 only. The XP plumbing in `progression.js` is inert (one level, kills pay nothing) and is removed at the M1.6 split. |
| I13 | note | engine | `tools/build/pipeline/w0b-checks.mjs` still lists a deleted proof-scene path and an Instrument model under the pipeline's outputs. |
| I14 | major | orchestrator, engine | Four area gate files (`tools/gates.r5.{brand,gates-perf,instruments-core,shell-ui}.mjs`) read the retired documents when they load: they quoted their row criteria and word lists from them. With the documents gone the registry reports them as load failures and their 124 rows do not run (registry 667 → 543 rows; the carried file and all 77 kept-stack rows still load). Decide per row at the next freeze: restate it in GATES, or delete it with the carried cut. The machine-readable ruling markers the build tools need were moved to `tools/build/sources.rulings.md`. Nov 14: `instruments-core` loads again (45 rows) after its four W0a removal proofs (A-no-override, A-no-corruption, A-legacy-collapse, A-boot-roster) were retired with their subjects; brand's rename rows (A-identifiers-renamed, A-extent-refactor, A-single-rest, A-storage-keys, -reload) and its two lexicon lints are retired, but brand, gates-perf and shell-ui still read the retired documents at load. |
| I15 | note | engine | The bloom, GTAO and SMAA passes stay at three r169 in `src/core/vendor/three-r169/` after the r187 upgrade (M0.7). Moving them to r187's versions (paired-tap blur with new kernels and composite alpha, private SMAA targets, renamed GTAO fields) changes the look: do it with its own before and after, after Milestone 1, beside the built-in cascaded sun light. |
| I16 | note | engine | On r187 one boot logged the GL warning "glGetProgramiv: Program object expected" (not on r169; not seen on the installed r187's boot). Likely `Engine.warmUp`'s poll of `renderer.info.programs` reaching a program r187 has already deleted; check the release order in r187's program cache. |
| I17 | major | instruments | `A-lamp-canon-distance` fails on r169 and r187 alike: `src/entities/machines/rig/shells.js` `shellMaterials(sensorColor = ...)` defaults to an excluded colour (ΔE 0). Change the default or delete the old shell path. |
| I18 | note | engine | M0.8 left about 10 ms of each named frame unattributed: paired skip-one differences scatter by ±2-5 ms on this machine, timer queries under vsync read the GPU at a lowered clock, and launch flags that turn vsync off leave ANGLE Metal's timer queries without results. Next: one Metal System Trace on F02 (a large download; needs a yes), then the geometry levers of M1.1a. |
| I19 | major | orchestrator | M0.13: the turntable page in its own Chrome is under 1.5 GB (0.67 GB footprint) but not guard-quiet beside a gate Chrome on this 18 GB Mac (free memory down to 40 %, pressure level 2). The one-Chrome rule stands for it; Q10.4 (a second machine) is raised. |

## 1. Hero art (Brea's head, skin and wrap)

| sev | item |
|---|---|
| major | The last fix round's live results were never recorded: `A-wrap-closed`, `A-skin-scatter`, `A-skin-spec`, `A-eye-catchlight`, `A-hero-rim` and `A-hero-draws` were last read on an earlier build. |
| major | `A-wrap-closed`, collar set: failed (1,116 px over 5 views); a back flange was added since and checked in offline renders only. Head set 0 px. |
| major | The wrap does not yet match BIBLE §5.2: folds live in the normal map, not in geometry; no loose cloth ends at the right temple; the ear rim kinks at 0.22–0.26 m; the paste stripe is still a neat stroke; the full-sun cheek is slightly orange. |
| note | `A-tail-flow` and `V-tail-keyart` are not registered: they need the 7-link 0.53–0.62 m chain, wind and colliders (M1.2e). Re-try the 0.09 → 0.06 m centre widths then. |
| note | In still air, from the nape, the tail folds at the chain's 70° hand-over and reads as a flat plate. |
| note | `V-brea-closeup-calima` needs a re-film once the calima sky state is on `r5/int`. |
| note | Asks: armory to call `applyClothLook(material, {rim: 0.40, velvet: true})`; people to call `bakeThinness` and `applySkinLook` on near-tier NPCs. |
| note | `A90-abs`, `A-alloc-rate` and `A-vram-ledger` timed out in every lane run that included them. |
| note | Gates that key the background off a frame's corner pixel share the old `A-wrap-closed` bug; `keyOf` is the fix. |

## 2. Hero animation (body, bow, carry)

| sev | item |
|---|---|
| major | **The bow pose bar (BIBLE §13) fails in motion.** A crouch-moving raise and a backpedal re-raise put the string hand over the crown or behind the nape; crouched-backpedal head step 0.032–0.046 m. `A-draw-arm-continuity-crouchmove` 5/15 and `-cam` 14/28 fail. The constraint aim rig (M1.3b) replaces the current approach; the rows stand. |
| major | `A-dodge-exit-continuity` fails: after a full-draw jump the wrist is 0.099 / 0.112 m off on landing. |
| major | In a fast yaw turn while strafing (left above all) the forearm is 20–24° off the arrow while the camera moves (31.3° in one jog cell; bar 20°). |
| major | Crouched sweeps at two cells: the 0.5 m bow flip in `combat.js` outruns the stand-up; knuckle 0.06–0.115 m and wrist 0.13–0.185 m off for about 4 steps. The fix is a blend instead of the flip. |
| major | `A31c` fails. |
| note | Head steps of 0.030–0.044 m in strafe-right cells at cancel, loose and crouch toggle; 0.036–0.059 m raising out of a sideways run. |
| note | The last 0.08 of the draw ramp: hand 0.01–0.05 m short, forearm 23–38° off for up to 4 steps. |
| note | The end of a moving roll steps her body 0.27–0.33 m in one sim step (clip hand-over). A lance drawn from a lowered bow reaches 0.35–0.39 m behind the skull (see I4). |
| note | Crouched at 0.75 the full draw is off the string (0.46 vs 0.527); the crouch-aim body sinks 0.08–0.10 m at about 0.3 s. |
| note | The animator's nock estimate is 0.07–0.09 m off the rendered nock; the Sabina Bow should publish its grip node. |
| note | The idle head is bowed; it shows in every close-up. |
| note | Stow kit: the quiver tilts 10–12° at idle and 39–42° at a sprint (BIBLE: 20°); during a full draw the stowed lance stands up beside her left side. |
| note | `A-hero-draws` still tests a retired 20 k triangle budget. |
| note | There is no licence-clean ledge-climb reference. |

## 3. Melee

| sev | item |
|---|---|
| major | The last fix round's final tree was never graded (`A101`, `A104`, `A106` ×3, 32 ids, `A-alloc-rate`). The numbers on record are from an intermediate state. |
| major | `A104` (left forearm to spine): failed at 0.095 m (bar 0.10); the trigger was raised to 0.115 afterwards and not measured. |
| major | `V46` guard: still a low guard with the rear fist at the hip; a forward rear wrist drops the left hand to 40–43 % of the haft (`A101` band 50–60 %). |
| major | `V47` contacts were re-keyed (light 1 thrust, light 2 cross, light 3 overhand, heavy drive) and not filmed since. |
| major | `A100` dodge row fails: the stowed lance tilts 35–89° (bar 30–60°), blade −0.35 to +0.72 m (bar 0.20–0.70). The free search in `src/hero/carry.js` is switched on by the climb only. |
| major | `A-stow-clearance` fails on carried pieces: quiver to calf 0.035 m in a crouch-walk and −0.045 m in a dodge (bar 0.05); head box 29.8–30.6 % standing at the worst yaw (bar 20 %), 8.2–9.0 % running median (bar 8 %); in a dodge the stowed bow goes 0.28 m into the ground. |
| note | The bow carry hand moved to x 0.275; armory to re-read the held clause of `A-variant-swap-matrix` on the four sets. |
| note | `A49` / `A50` skip until they are staged on a `sentry` kind. The Plumb is on `r5/int`; stage them on it. |
| note | The Counterweight Lance's butt-strike finisher is not built (it needs its model). |
| note | Hit chips read as dark round dots against sand-coloured air. The 1.15 m/s step-in should be judged at a keyboard. |
| note | Fold `A100`–`A107` into the kept-stack file when the carried file is cut. |

## 4. Armory (outfits, weapons, carry)

| sev | item |
|---|---|
| major | No visual row has been re-graded since the outfit colours changed; every `V` row on record shows the old colours. |
| major | `A-variant-swap-matrix` fails: clipping over 0.5 % on 7 of 32 rows (Ash I idle + lance 1.05 %, sprint + bow 0.78 %; Pan III draw 0.69–0.70 %; Pan II 0.53–0.56 %); stowed −4.7 to −4.9 cm (quiver inside the outfit, right forearm wrap and bracer); held −4.6 to −5.0 cm (stave against the forearm wraps). |
| major | The quiver touches the right forearm through the sprint stride (0.1–1.9 cm); 4 cm further back clears it. |
| major | `A-starter-cut:arms` fails front-right at 0.12 (bar 0.60); the sampling line is the suspect. |
| major | `A-weapon-finish:glint` fails with 0 px at all 8 bearings; the row was rewritten and has not run since. |
| major | Starter pieces of BIBLE §5.2 not built: the long front and back sash panels to below the knee, fingerless gloves, neck scarf, the slung second belt with pouches, knee straps, the square brass buckle-plate (a gate still asks for a round 6 cm boss), the survey case on the back. |
| note | A light lance strike lays her right upper arm across her chest: 0.44–0.47 % of the 0.5 % bar on every rung. The lance ready grip is one-handed and trailing. |
| note | Rungs 2–4 are at first-pass state: rung 2 is not yet the Scout look of BIBLE §8.4; rung 3's satchel and rung 4's hood, veil and goggles are owed. |
| note | Under-layer culling relies on the stock body's albedo; the repainted boots have no engine frame yet. |

## 5. People and settlements

| sev | item |
|---|---|
| major | `A-npc-fidelity` fails: the silhouette jumps at the 18 m LOD change (pit farmer 0.026 m, tube smith 0.025 m, cochineal picker 0.033 m; bar 0.02). Next: per-region LOD1 budgets and an offline posing tool. |
| major | Clothes are the weakest part of every people frame: recoloured stock bodies, flat aprons, smooth skirt cones, no strap-and-buckle work (M1.5). |
| major | `A-alloc-rate` baseline guard fails on this area's row (1.16–1.25×); the pose update allocates about 170 KB/s and the person update about 136 KB/s. |
| major | The NPC class of `A-glb-budget` still holds an old row (12 k triangles, 2 draws, 65 bones, 0.4 MB); the current people need about 34 k / 8 / 120 / 1.0 MB. |
| note | `V-npc-vs-brea-*` must be re-filmed against the integrated Brea. |
| note | The adolescent reads about 18, not 15. Grey hair at the elders' temples is a noisy coil at 2 m. |
| note | Seated, rail and boat clips have nothing to sit or lean on until placement. The LOD1 → LOD2 change at 35 m is cross-faded but not graded for pop. |
| note | The GPU term of `A21` fails on a quiet machine (19.5 / 32.7 / 20.5 ms vs 14) and is not attributed. |
| note | The settlement host (`src/world/settlements/host.js`) keeps the Brazier at REST and loads the nine people. Buildings and the placement of people on the island are not built. |

## 6. Shell UI

| sev | item |
|---|---|
| major | No independent judge has seen the last fix round's frames; every `V` row is the builder's own reading. |
| major | Decisions asked: the interact prompt beside the crosshair (BIBLE §18) against `A71f-interact-anchor`; the field note's 8 s fade against `A71g-tracker-live`. |
| note | `A-violet-budget`, `A-ui-contrast`, `A-ui-composite-cost`, `A-menu-freeze` and `A-ui-ip-geometry` are not registered. |
| note | The weak-point ring is not counted as a ring. Blunt damage numerals are weak on white salt. |
| note | Per-function allocation: `Menus._raf` 37.8, `_updateQuestPips` 34.5, `_updateMachineBars` 31.5–60.4, `_updateCompass` 27.8 KB/s. |
| note | Overlay GPU cost (about 1.6 ms with the Alidade up) is outside `A21`'s timer. |
| note | `V36`: at the yaw that keeps the card, the lance tip crosses the LAMP ring. |
| note | Re-film `V-map` on the island; its soundings were drawn for the old terrain. |
| note | The Kit Rack half-ring is not built; quick slots 1 and 2 stand in. The log, skills and item pages hold stand-in text. |
| note | The Steady meter is right and the mechanic is not (it scales time; BIBLE §8.3 says a breath-hold with no slow motion). Aim and Sprint hold-or-toggle are stored but not applied. The tips describe the old bow controls. |
| note | `V-ui-sheet` must be registered last; the page after it has twice hit a 90 s harness retry. |

## 7. Instruments

| sev | item |
|---|---|
| major | Peg: `A47c` (wreck mass 0.94, bar 0.75); `A-lamp-states` (the lamp sits in the grass at 0.5 m; the hostile pinhole is 5 px at 15 m); `A-linked-attack` (no attack phases after the tear; not diagnosed); `A-hull-value`. `A-ip-emissive` and `A-lamp-states` conflict for a 0.9 m kind and need a decision. |
| major | `A-hull-value` fails on every kind: backlit edge 0.67–1.05× interior (bar 1.5×); feet brighter than the shaded upper half at noon on the Tiller and Peg. The harness may be at fault. |
| major | `A-core-glow` far clause fails on the Tiller and Plumb (12–21 % change where spill is 0: bloom or grass noise; there is no control frame). |
| major | None of the three built kinds meets the look of BIBLE §7.2 yet: the Tiller is clean and toy-like at golden hour; the Peg reads as a cart handle from the rear and its lamp as a camera lens. `V26`, `V27` and `V-lineup` are open (M1.4). |
| note | The shadow-caster swap is inert until look-post's newer checkpoint is merged (I7). |
| note | Decisions asked: a lamp rule that holds 1.6× HDR breaks its own hue clause; lamp spill 0.35 → 0.2. `A-glb-budget` should budget LOD0 only. |
| note | A fresh-spawn deoptimisation is not investigated; `A-alloc-rate` is not measured on the Instrument rows. |
| note | Spawn rows are staging values; placement belongs to the world and settlement areas. Hooks offered: `machines.heightOf(kind)`, `machine.flashPart`, `ctx.terrain.cutCover`, the calima state, `plumb` and `peg` audio sets. |

## M1a round 2 additions (Nov 15 2026)

I17: the shells.js default colour is fixed (df43631); close it once A-lamp-canon-distance runs green.

**Section 0 (Integration):**

| # | sev | owner | item |
|---|---|---|---|
| I20 | blocker | hero-anim | `A17-draw-beats` regressed between 471b07d and dee526d: the loose's rearward follow-through is 0.0056 m (bar 0.05). |
| I21 | blocker | armory | `A32b-lookup-no-ghost` regressed: the hero's shadow-proxy material (colour and depth writes off) is listed with her fade materials, so the occluder test counts one depth-off material. Keep it out of the fade list. |
| I22 | closed | engine | `A80-chrome-profile-hygiene` regressed when the runner took the shared browser slot inside `launchBrowser`; fixed in b8640ed and passing. |
| I23 | major | engine | Tier 0 skips the headless boot unless `--port` is given; one round-2 commit built clean and threw at boot. Make the boot part of every merge check. |
| I24 | major | hero-anim, engine | `tools/gates/hero-sweep/session.mjs` shares one page between rows; melee state from one row leaked into the next. One page per row, or a melee reset. |
| I25 | note | orchestrator | A full kept-stack run takes two browser sessions (about 9 and 12.5 minutes); `A90-memory-stability` alone is about 5 minutes. |

**Section 1 (Hero art):**

| sev | item |
|---|---|
| blocker | The face has pure-black pixels again: 12 in F12 and 1 in F13 at dee526d (0 at 970a991). |
| major | The ear rim still shows a corner and kinked straight runs; the tail is still a stiff strip in profile. |

**Section 2 (Hero animation):**

| sev | item |
|---|---|
| blocker | One crouch frame still clips cloth through the body (bar 0). |
| major | `A32-draw-ramp`: the index knuckle is 0.042-0.050 m from the jaw-corner anchor at full draw (bar 0.03); the fix is in the bow code. |
| major | The full-draw elbow clause of `A-draw-elbow-level` cannot be met with the rig's draw form; needs a decision at the next freeze. |
| major | Visual rows `V1`, `V3`, `V13`, `V-traversal` fail; three of them are framing (lens behind her with the legs cut, a ledge panel without her). |

**Section 4 (Armory):**

| sev | item |
|---|---|
| blocker | The boots' swatch is 10.1 dE from the sheet (bar 10; 2.0 before the pale laces were added). |
| major | The draw shoulder reads as a pale rounded blob in the over-the-shoulder frames (F17, F24). |
| major | The left bracer has no brass cap. |
| note | The violet ladder is out of order: the sash panel reads lighter and pinker than the sheet. |
| note | Lance and bow still cross in a 45 deg X on the back, with the bow over the lance. |

**World and sky-look (World and sky-look, Milestone 1a):**

| sev | item |
|---|---|
| major | F02 frame time with the look off reads 11.9 / 10.8 ms (bar 11) on the same geometry; settle it on a quiet box. |
| major | The meadow still crawls in the walking clip. |
| major | F05: two neighbouring silhouette layers are 0.4 L* apart (bar 6). |
| major | F04 shows only the salt crust, milky and pink-grey (mean luminance 33.5 %); none of the other ground materials is in frame. |
| major | Shadow hue on warm shaded ground (skin, straw, sand) falls outside the 280-330 deg band (F02 47.9 deg); decide whether the band applies there. |
| note | F32: no field walls visible from 120 m; a pale haze wedge stands behind the ridge. |
| note | The lance swing trail still shows as a pale arc in F19. |
| note | F30: the Brazier draws as bright vertical streaks in the grass. |

## M1a round 3 and exit additions (Nov 15 2026)

| id | sev | area | finding |
|---|---|---|---|
| R3-1 | major | engine | TECH §9.1's p95 interval line cannot be met in headless Chrome. A canvas that only clears reads p95 17.8 ms over 30 s; the game reads 17.1–17.7 ms at 59.97 fps with no frame over 33 ms. Needs a ruling on the grading (frame count and frames over 33 ms) or a headed measurement. |
| R3-2 | major | world | M1.1a: F02 with the look off at 11.5–12.2 ms (a000205, 159b9fd) against 11 ms. 49563ce, the shipped world, was never measured whole. |
| R3-3 | major | world | M1.1b: the walking clip still crawls at 1 m/s. The 12–30 m band is 1.23× the reference. |
| R3-4 | major | world, sky-look | F04: the crust reads as smooth plaster (palette 13.2; crust 25.6 ΔE at 1 m). The dyke stones read as flat chips. The salt-crust top-down autocorrelation is 0.54. |
| R3-5 | major | world | F32: an LOD seam 3–4 px wide against a 2 px bar. |
| R3-6 | major | sky-look | F05's shade hue is 15.3° against the crop's 41.2°. It moved when the shared ground light changed. |
| R3-7 | major | hero-anim | A104 and A105 fail. The elbow row has had no valid page number since 349ac11. One sweep blend has a hand behind the head (unstow lance into a roll). The panels do not stream in the wind. |
| R3-8 | major | hero-anim | F03 has no landmark above her head (M1.1h). |
| R3-9 | major | armory | F10: the lance and bow cross at 45°. F17 and F24: a pale bulbous draw shoulder. |
| R3-10 | major | ui | M1.6g1 was not measured this round. F03 shows the first-boot MOVE card as a fifth surface. |
| R3-11 | note | tools | `face-frames.mjs` counts the wrap tail's torn tongue inside F11's fixed face box: 14 px at fb6d5f0, all cloth. Mask cloth out of the box. |
| R3-12 | note | instruments | In F24 the Plumb's lamp is lit hostile at fb6d5f0 (dark at dee526d). The frame does not say calm or alert. |
| R3-13 | note | sky-look | The sky decision (hour keys or the LUT sky) is not yet written in the state file. |
| R3-14 | note | engine | A9 stays PENDING inside a kept-stack run: the gate browser itself lifts the 1-minute load past 3. |

| R3-15 | major | ui | A70: the K key still shows the map tab (kept-stack row, fb6d5f0). |
| R3-16 | major | hero-anim | V13: in the aim strafe the feet point opposite ways. V-traversal: the ledge-climb panel does not frame her. |
| R3-17 | note | engine | Three gate files still fail to load because they read the retired documents (I14). |

## M1a debt and M1b wave 1 additions (Nov 15 2026)

| sev | owner | item |
|---|---|---|
| blocker | systems | F05 has a Brazier's cistern ring of box blocks in the foreground beside Brea, a regression against its provisional anchor. Keep every Brazier out of the Frame Set's lenses, and texture the blocks. |
| blocker | hero-anim | The sash wind coupling (2.4 1/s) streams the front panel forward in the windless studio (F09, regression; F08 splayed). Zero the wind in the studio. In the field, stream downwind without a hard point. |
| blocker | systems | A71g: the field-note tracker never shows (opacity 0) at full health, after the vitals hide, or on a new objective. It passed at fb6d5f0. Likely the quest runtime or the quest-cards change in `src/ui/hud.js`. |
| blocker | systems | A65 reads the version-5 save key and fails with a null read under save v6. Restate the row to the v6 slot by id at the next freeze, so the kept stack proves the live round trip again. |
| blocker | instruments | A44b: the Peg's `part:peg-rack` socket is 0.165 m from its drawn vertices (bar 0.10), alive and dead. |
| blocker | instruments, orchestrator | A78: the cast-state row now picks the Gauge, which has no attack state. Pick a kind with an attack set in the row, or keep neutral kinds out of that role. |
| blocker | instruments, systems | A90: +43 geometries over 30 kill/respawn cycles (bar 40; +16 at fb6d5f0). Not bisected. The candidates are new since fb6d5f0: the Peg swarm and transect instances, the Gauge and the Braziers. |
| major | world | M1.1e: F04's luminance (31.5 %) and its palette (10.2, passing) pull against each other. Rule on one target, or make the crust both bright and on the swatch. |
| major | world | M1.1j: rule whether sky showing through a notch between terrain chunks counts as a seam. The crack count between LOD levels alone is 0 px. |
| major | instruments, world | M1.4e: the Glass is at most 0.64 m deep, so the Gauge cannot be shown wading to 1.2 m there. |
| note | orchestrator | F23 (Peg) and F23 (Gauge) were re-staged in `frameset.json` without a version bump. Bump to v3 and add the rows to the README table. |
| note | all | A "smallest change" in another lane's file must come with that lane's kept rows, run at the commit. A71g and A65 broke through such seams this round. |
| closed | hero-anim | V13 (feet) and V-traversal (ledge panel framing) pass in the kept stack at 39f7533. |
| closed | world | F04's palette is 10.2 (bar 12). The F32 haze band along the ridge is gone. |
