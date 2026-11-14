# ROUND 5 — lane melee (W1): the lance on Brea

Lane port 5256. Every number names the run it comes from: `r1` … `r5` are this round's batched runs on this
tree (reports and frames under `scratchpad/r5/melee/runs/<run>/shots/gates/`, not in the tree). My reading of
each V row is advisory (rule 3); no R29 judge has graded them.

Three builders have worked this lane. The first wrote the state machine, the beat table and the gate file. The
second (Nov 3) re-tabled the pose on Brea's real arm and ran most rows green. This round (Nov 6) re-ran the whole
block, implemented R62 (b), verified the Counterweight's knockdown on a live machine, fixed A102's heavy-hips
margin, worked the R48 allocation bar on both owners (−34 % and −91 % against their baselines; the per-function
bar is still not met, §4), and tried and measured three changes to the left hand and the contact keys that did
not hold, all reverted (§6.1, §6.2). Four rows of the block still FAIL on my side (A101, A104, A106 by one
frame, the alloc bar) and three on other lanes' (A100's dodge row, A-stow-clearance, A49/A50 SKIP). Chrome was the bottleneck: one gate Chrome machine-wide, one slot about every two
to three hours, one run lost to Kevin's own use of the machine (the memory guard killed it, correctly).

## 0. Fix round 1 (Nov 13-14): what changed, by judge finding

Two builders worked this fix round. The first (Nov 13) wrote the code below and ran one batch, `f1` (Nov 13
17:28Z), on an intermediate state. Kevin's machine was then reset. The second (Nov 14) read and verified that
work, made the light-3 change, and queued batch `g1`. g1 was still waiting for a Chrome slot when this section
was written: the orchestrator's memory guard held both slots from 02:43Z, at pressure level 2 with 33-50 % free.
**Numbers marked f1 come from that run. Rows marked "g1: not run" have no number on the final tree.**

| finding | change (file) | measured |
|---|---|---|
| A101: light-2 left palm 0.059-0.067 m off | `_solveLeft` split into `_seatLeft`; new `_reseatLeft` in `postFix` seats the left palm again on the FINAL haft, after `_handOffSelf` and `_armHullFinal` have moved it. Cause found: those two passes turn the right hand by up to 0.3 rad a pass after the left hand is solved (`meleeLayer.js`) | f1 **PASS**: every two-handed palm ≤ 0.05 m. g1: not run |
| A104: left forearm 0.084-0.088 m from the spine | `_seatLeft` turns the elbow pole up to four times, not two. `_reseatLeft` re-solves when the forearm is under 0.115 m and slides the palm toward the blade in 0.03 m steps, at most 0.12 m (`meleeLayer.js`) | f1 FAIL 0.095 m (light-1 recover k 0.64), with a 0.105 trigger. Trigger raised to 0.115 after f1. g1: not run |
| A106: left forearm 20 mm inside a Tiller shin | new `_leftHullFinal`, `_armDeficitL` and `_armRollOutL`: the final hull pass now covers the LEFT forearm too. It turns the elbow about shoulder→wrist (never onto the belly: ≥ 0.10 m) and then slides the palm back along the haft in 0.04 m steps. The palm is re-seated afterwards (`meleeLayer.js`) | f1 **PASS** on every kind. The three-run repeat is queued in g1 (A101, A104 and A106 three times). g1: not run |
| V46 guard: a hand on the hip, upright trunk | `READY`: the rear wrist 0.05 m further forward and 0.02 m up, the trunk turned 0.04 rad more and pitched 0.05 rad more, the haft 0.02 more to her left. `STANCE.ready` is 0.01 m lower with the knees bent further (`meleeLayer.js`) | Not filmed on the final tree. f1's lab showed that putting the rear wrist 0.17-0.27 m forward takes the left hand to 40-43 % of the haft (A101 band 50-60 %). The guard is still a low spear guard with the rear fist at the hip; see §6.2. g1 films two more guards (G1, G2) |
| V47: light-1 and light-2 contacts identical; arms-only pokes | Contacts re-keyed. **light-1**: a level thrust, wrist 0.45 m forward, dz 0.22, trunk pitch 0.45. **light-2**: a sweep crossing her front, blade 33° to her right, shoulders turned −0.50. **light-3**: an overhand stab driving 30° down (this round). **heavy**: the lowest, longest drive, dz 0.26, pitch 0.55. `STANCE` for light-1/2/3 and the heavy is deeper (light-1 is a lunge, dy −0.19; heavy dy −0.32). A standing swing now stays WELDED to its end (`_weldSwing`), so the step-in's walk blend can no longer straighten her legs at contact (`meleeLayer.js`) | f1 lab: light-1, light-3 and the heavy filmed as lunges with the arms extended. A102 in f1 read **3 distinct arcs**: light-3 and the heavy were one arc, with contact pitch −15 and −3°. Light-3 is now −30° (keyed). f1 A105 failed with "stance duty 0.02" on the first weld rule. The `_weldSwing` rule replaced it after f1. g1: not run |
| Gate honesty (V47 pinned only; A102 live legs ungraded) | `V47-melee-swing-live`: eight panels of the LIVE beats, frozen on the contact frame with nothing overridden. A102's live stance separation is now graded (`gated: true`, the same 0.06 m bar as the pinned pairs) (`gates.r5.melee.mjs`) | f1 filmed V47-live (NEEDS-JUDGE) |
| R64 (c): carry hand at x 0.245 | `_bowCarryLayer` `_grip.set(0.275, …)` (`playerAnimator.js`) | `A-variant-swap-matrix` is armory's row and is not in this tree. g1 runs A-run-arms, A35 and V29. **Ask armory** to read the held clause on the four Pans after the merge |
| P-04 / P-05: hit weight | `melee.js`: the swing tangent is tracked per frame with no allocation. `impactFeedback` gets `tangent`, `scale` (heavy ×1.4) and `hitstop`. Hit-stop goes through `engine.requestTimeScale('hitstop', 0.03)` for 55 / 90 ms, +25 on a weak point and 120 on a kill (the cap), with an 8-entry ring keeping ≤ 180 ms of freeze in any 1 s. The kick goes along the tangent through `player.addRecoil` (peak 0.012 / 0.022 rad), scaled by `settings.cameraShake` (0 turns it off). `machine.flashPart?.(part, 1)` is guarded until instruments-a's grant lands. `melee-hit` now carries `weak, tangent, hitstop, kickPitch, kickYaw`. New gates `A-play-hitweight-lance` (clauses 1, 3, 5) and `A-play-burst-lance` (A-play-impact 2, 6) | f1: hitweight FAIL on clause 3 (204 ms in one window), because each freeze outlived its end by up to one frame. After f1 the end is set 7 ms early and each freeze counts 16 ms long in the budget. f1 burst FAIL on clause 2 (5.3 % near), because the two-frame A/B counted moving sky and grass as VFX. The mask now needs A≠B, A2≠B and A≈A2. g1: not run |
| A100 dodge row, A-stow-clearance | none: armory's `carry.js`, quiver and stowed bow. Armory's tree still switches the free search on the climb only (`this._climb = !!this.player.mantling`) | f1: same numbers as r5 (dodge tilt 35.3-88.7°, blade −0.348 to 0.722 m; quiver 0.035 / −0.045 m; head box 29.8 % worst and 8.2 % running median). **The block cannot exit until armory fixes these or the orchestrator rules** |
| Judge run blocked on the slot | g1 batches 32 lane and global ids, A101/A104/A106 twice more, a four-variant pose lab and A-alloc-rate in one slot hold, 35 s apart | not run (slot) |

Code lint `namecheck --code`: PASS (1,358 ≤ 1,371). New per-frame paths allocate nothing: module scratch
vectors, Float64Array rings, and fields declared in the constructors.

## 1. What this lane built

### 1.1 Kept from the earlier builders, verified this round

The press-starts-the-swing state machine; the draw that ends on the grip (R5); hit-stop holding the blade (50 /
85 ms at timeScale 0.03); recoil along the haft (0.045 / 0.085 m); the Undercut drawing first (M11); the step-in
as a velocity floor; the aim at the hull (R7); the guard with the left foot forward, knees bent, hips bladed; keys
on her 0.475 m arm; the hips' turn (`py`) and travel (`dz`) per key; the head kept on the target; the left forearm
off her belly in the solve; the Counterweight's tuning (`LANCE_VARIANTS`, `heavyTime` 1.2, `knockdown`).

### 1.2 This round, kept in the tree

| what | where | why / measured |
|---|---|---|
| **R62 (b) in `A-stow-clearance`**: the cover clause is the median over the 24 yaws ≤ 8 % and the worst yaw ≤ 20 %, on the standing and the running sweep each; the detail reports both | `tools/gates.r5.melee.mjs` | the ruling of Nov 3, implemented to its letter |
| **The Counterweight's knockdown, gated on a live machine.** `A-heavy-two-hand` now also throws a real held-LMB heavy at a staged machine with the Counterweight and with the Shepherd's Lance, recording every `forceState` call and whether `melee.js` made it | `tools/gates.r5.melee.mjs` | r2b–r4: Counterweight heavy lands, 1 stagger from melee.js; Shepherd's heavy lands, 0 (the negative control) |
| **The heavy sinks deepest, with margin.** Heavy stance: both knees bend further (thighL −0.82, calfL 1.08, thighR 0.30, calfR 0.40, dy −0.26); light-3 stands 0.015 m taller | `meleeLayer.STANCE` | A102 pins the heavy's hips 0.04 m under every light: r1 read 0.079 m, r2b 0.032 (FAIL); r3 and r5 PASS (r5: 0.093 m) |
| **Fields declared at birth (R48 c).** Every field the frame used to ADD later is declared in the constructor with the value its readers saw for `undefined`: 18 on the animator (`_bobKeep`, `_rbPlanted`, `_latK`, `_trunkPitch0`, `_bowCarryArm`, `_footLatLoc`, `_toeTips`, `_ikMaxK`, `_efS` …), the M10 collider's `minCi/minJ`, the step debug record (7), the melee layer (13) and its debug record (33), `Melee` (10), 11 camera fields on the player (the player.js grant, 2 lines; 4 of 15 used) | ctors of `PlayerAnimator`, `MeleeLayer`, `Melee`, `Player` | an added field is a new hidden class on an object optimised code holds as a constant; every optimised reader is thrown away the frame it appears (§4) |
| **No per-frame string, closure or iterator.** `toFixed` on per-frame paths (carry slide, re-parent gap, aim gap, contact gap, four step-debug values) → `Math.round`; the conform's `applyPelvis` and the stance step's `ballC` closures → methods; three per-frame `for…of` → indexed loops | `meleeLayer`, `melee.js`, `playerAnimator` | each allocated every frame (or every melee frame) in every tier |
| **The machine scalars, not their getters**, in `surfaceGap` and `_sneakOk` (`m.sc.heading`, `m.sc.suspicion`) | `melee.js` | instruments-core's W1 ask (its report, fix round 2) |

## 2. API (published, unchanged this round)

```js
// src/combat/lanceStow.js
lanceOut(melee) -> boolean                 // physically in her right hand
lanceObjects(melee, out) -> out            // the held prop's scene objects (memory counts)
createHeldLance(ctx, url?) -> HeldLance
HeldLance { group, inner, length, grip, grip2, url, variant, tuning, ready, onChange,
            setUrl(url) -> Promise, setVariant('shepherd'|'obsidian'|'counterweight', url?) -> Promise, dispose() }
LANCE_VARIANTS[id] -> { url, heavyTime, knockdown }   // obsidian and counterweight url are null until armory W3
HELD_LANCE_URL                             // armory re-points it at its final Shepherd's Lance

// ctx.combat.melee
active, phase, heavy, combo, stance, lance, lanceInHand, undercutTarget, approachMachine, aimOk, aimPoint
drawLance(hold?) -> seconds, holsterLance(fast?), swing({ heavy }), undercut(), audit(), poseState()
spearInHand, spear                         // aliases until armory calls lanceStow from combat.js (§1.2), then delete
// events: melee-hit { machine, damage, heavy, combo, crit, point, killed, tornPart, contactGap },
//         undercut { machine, killed, damage }, felling-blow { machine, damage }

// src/entities/anim/meleeLayer.js
decimalFields(o) -> o                      // born-decimal fields (R46); any lane may call it on a per-frame record
MELEE_TABLES { READY, BEATS, HEAVY, STANCE }   // the live tables (a page must import the module URL the game
                                               // loaded: Vite serves an edited file under ?t=, see §6.8)
// a pose key: { hand, shaft, lh, lhW, lhOn, yaw, py, pitch, roll, dz }

// tools/gates.r5.melee.mjs
FILM_KIT { NOHUD, FILM, FREEZE, STAGE, AIMLOCK, LOCKCAM, PIN, READY, gridOf }  // for --extra film rows
```

## 3. Gate table (`node tools/gates.mjs --port 5256 --lane melee`)

Run r5, the final tree (Nov 7 01:31Z, quiet box, 60 fps). r1-r4 rows were the same except where §6 names a
difference.

| gate | status | measured | bar | owner of a fail |
|---|---|---|---|---|
| A100-lance-holster | FAIL | idle/run/sprint/crouch/bow-draw: tilt 33.38-38.7 deg, midpoint <= 0.219 m, blade 0.473-0.65 m, tip >= 0.476 m right, tails >= 0.1924 m; **dodge**: tilt 35.28-88.73 deg, blade -0.349-0.721 m | 30-60 deg, <= 0.30, 0.20-0.70, > 0.15, >= 0.06 | dodge row: armory (`carry.js`) |
| A101-lance-grip | FAIL | knuckle-to-axis <= 0.0139 m; blade ahead >= 0.978 m; sweeps light-1 48.7, light-2 68.3, light-3 48.6, heavy 52 deg; left palm light-1 0.0147, light-2 0.0591, light-3 0.0144, heavy 0.014 m; ready tip 0.453 m, left at 0.512; grip at contact from holstered idle click 0.191, idle hold 0.19, jog click 0.19, jog hold 0.19, sprint click 0.191, sprint hold 0.19; light-2: a two-handed frame had the left palm 0.059 m off the haft | <= 0.03; > 0; >= 45; <= 0.05; 0.35-0.55, 0.50-0.60; 0.15-0.28 | melee |
| A102-melee-body-motion | PASS | hand travel 1.376 / 1.277 / 2.155 / 1.665 m; trunk yaw 40 / 54 / 58.5 / 34.8 deg; step 0.333 / 0.513 / 0.635 / 0.622 m; tip <= 0.34 m/frame; pinned hips {"light-1":0.763,"light-2":0.794,"light-3":0.722,"heavy":0.629}; no bad | >= 1.2; >= 15; 0.25-0.8; <= 0.5; heavy lowest by 0.04 | melee |
| A103-melee-contact-sync | PASS | {"tiller":"3/3 (worst 0.033 m)"}; no bad | tip <= 0.15 m from the hull, hit in the strike phase, every non-legacy kind | melee |
| A104-melee-self-clear | FAIL | right forearm to spine >= 0.156 m; LEFT light-1 0.084, light-2 0.104, light-3 0.163, heavy 0.132, holster null m; shaft clear >= 0.153 m; hair >= 0.16 m; elbow over head <= 0.021 m; light-1: the LEFT forearm came within 0.084 m of the spine on a two-handed frame | >= 0.10; >= 0.10; >= 0.12; >= 0.06; <= 0.25 | melee |
| A105-melee-while-moving | PASS | 12 jogging windows, worst drift 0.0129 m, speed ratio 1 | drift <= 0.08 m, >= 60 % | melee |
| A106-melee-approach-immovable | FAIL | machine displacement 0 m, worst push 0 m; tiller frozen-then-animated: a forearm/fist was INSIDE a hull on 1 frame(s) (worst -0.0003 m, drawn left in rig_RF_shin#40) — S5 | no root jump > 0.15, release <= 0.10, drag <= 0.08, capsule >= 0.05 | melee |
| A107-draw-arm-path | PASS | idle: elbow over head -0.129, behind band 0.055; jog: elbow over head -0.043, behind band 0.069; sprint: elbow over head -0.013, behind band 0.07 | elbow <= head + 0.05, <= 0.10 behind | melee |
| A-stow-clearance | FAIL | cover {"standing":{"yaws":24,"median":0,"worst":0.301},"running":{"yaws":24,"median":0.086,"worst":0.179}}; boom -0.001 m; crouchWalk: the quiver comes 0.035 m from a calf/heel capsule; dodge: the quiver comes -0.045 m from a calf/heel capsule; standing sweep: stowed gear covers 30.1 % of the head box at its worst yaw; running sweep: stowed gear covers a median 8.6 % of the head box | R62 b: median <= 8 %, worst <= 20 %; calf >= 0.05; boom <= 0.02 | bow and quiver: armory |
| A-heavy-two-hand | PASS | hands <= 0.0144 m (Shepherd), <= 0.0147 m (Counterweight); knockdown shepherd: heavy true, melee staggers 0; counterweight: heavy true, melee staggers 1 | <= 0.05; CW cock >= 1.08x; CW staggers 1, Shepherd 0 | melee |
| A-melee-latency | PASS | in hand 0.15 / 0.15 / 0.183 s; holstered draw 0.25 / 0.25 / 0.25 s, strike 0.417 / 0.417 / 0.417 s | <= 0.30; draw <= 0.35, + <= 0.30 | melee |
| A49-melee-exists | PENDING | SKIP-legacy-deleted (R30): role sentry: no live kind yet (lands with Plumb, instruments-a W1) | role sentry | instruments-a (Plumb) |
| A50-undercut | PENDING | SKIP-legacy-deleted (R30): role sentry: no live kind yet (lands with Plumb, instruments-a W1) | role sentry | instruments-a (Plumb) |
| V46-lance-ready | NEEDS-JUDGE | filmed; my reading in §5 | R29 judge | melee |
| V47-melee-swing | NEEDS-JUDGE | filmed; my reading in §5 | R29 judge | melee |
| V48-lance-holster | NEEDS-JUDGE | filmed; my reading in §5 | R29 judge | melee |
| V49-draw-from-jog | NEEDS-JUDGE | filmed; my reading in §5 | R29 judge | melee |
| A-melee-floor | PASS |  | hero-body / global | must stay green |
| A-lance-stow | PASS |  | hero-body / global | must stay green |
| A1-boot-clean | PASS |  | hero-body / global | must stay green |
| A20b-no-system-errors | PASS |  | hero-body / global | must stay green |

Also run on this tree (global list and neighbours): `A-alloc-rate` FAIL on its scheduled per-function bar
(§4; my two owners pass their baseline guard, the guard's offenders are armory and combat-kit),
`A-no-horizon-terms-code` PASS (1,358 ≤ 1,371), `A-no-horizon-terms-player` PASS (1,503 ≤ 1,508),
`A-ID-ip-assets-gone` PASS, `A-assets-tracked` PASS, `A-licence-manifest` PENDING (third-party rows),
`A-port-guard` PENDING (not a full lane run), `A-carried-suite` refused beside carried rows (orchestrator's),
`A9-perf-budget` PENDING (load 12 then; r2). The A90 family, `A-vram-ledger` and `A21` did not complete: in r2 the
memory guard killed the gate Chrome three times while Kevin's own Chrome held the machine at 28-37 % free, and I
gave the slot back. They belong to the orchestrator's 5270 run. `tools/lint/namecheck.mjs --code`: PASS.

## 4. R48: the allocation bar on `playerAnimator.js` and the melee files

`A-alloc-rate` at `CAL_WAVE=W1` (gates-perf's instrument, unchanged): the staged fight, then sprint-and-draw,
10 s each, caller attribution. The instrument passes in every run. Per owner against the R48 (c) baseline:

| owner | baseline KB/frame (KB/s) | r1 | r2b | r5 (final) | guard (x 1.10) |
|---|---|---|---|---|---|
| `playerAnimator` (melee from W1) | 48.67 (2,756) | 32.81 (1,915) | 33.53 (1,956) | 32.03 (1,859) | pass, −34 % |
| `melee` (meleeLayer, melee.js, lanceStow) | 9.75 (552) | 0.83 (47) | 0.74 (42) | 0.87 (50) | pass, −91 % |
| `frozen-control` (player.js; my grant lines) | 7.47 (423) | 6.61 (386) | 6.94 (405) | 6.95 (404) | pass |

**The absolute bar (4 KB/s per function, binding on both owners from this exit) is NOT met.** Over it (r2b,
staged fight / sprint-and-draw, KB/s):

| function | whose code | KB/s |
|---|---|---|
| `update` (playerAnimator:1539) | shared, mostly mine | 219 / 1,045 |
| `_springs` (R48's named function) | mine | under 4 / 368 (Nov 3: 1,708 → 1,083; r1 327) |
| `_groundConform` 70, `_idleLife` 38, `_legToPoint` 35, `_bowCarryLayer` 28, `_runArmClamp` 22, `_headStabilise` 22, `_runBob` 21, `damp` 18, `_ikArm` 18, `_footLock` 13, `_lookLayer` 10, and nine more at 4-9 | mine | |
| `_aimLayer` 120, `_elbowFlow` 69, `_efCost` 48, `_elbowForm` 20, `_rollElbow` 9 | hero-body (R57) | |
| `surfaceGap` 21, `_advanceStance` 7, `meleeLayer.update` 6, `_sneakOk` 6, `poseState` 5 | mine (melee) | |

**Why, measured** (instruments-core's `A-alloc-machines` in diagnosis mode, `R5_IC_GPSEQ` + `R5_IC_TRACEDEOPT` +
`R5_IC_SHAPEWATCH`, in r1 and r2b). None of these functions allocates in optimised code (`damp` is four
multiplies and reads 18 KB/s): they allocate while they run in V8's baseline tier, where every double is a
HeapNumber. They are there because of deoptimisation waves. In r1, about 145 functions across every lane were
thrown away together at the start of the sprint window ("dependent prototype chain changed", Maglev), `update`
and `_springs` among them, and `update` is large enough not to be re-optimised before the window ends. Two
causes in my files were found and removed (§1.2): fields ADDED at her first sprint, aim, turn or swing on objects
optimised code holds as constants (the animator, the melee layer, `Melee`, the player), and per-frame strings
and closures. After both, r2b's SHAPEWATCH (310 objects reachable from the root ctx, keys and representations
every 200 ms) saw **no object reshape at the wave**, and the wave still came, at the instrument's own forced GC
at the window start, in the same batch as "embedded weak objects cleared" (32 functions). That is
instruments-core's unfound "gap F" (their report, fix round 2). It is not in a melee file and I could not
go further without engine-level tracing.

What would close it, for the orchestrator and gates-perf (nothing asked of the bar or the method here):
an engine-level look at the GC-triggered deopt wave the instrument measures right after its forced GC, and
hero-body's five functions. Both owners are well under their baselines; the per-function bar fails.

## 5. The frames, read at 1600x900 against the references

My reading, advisory (rule 3). Frames: `runs/r5/shots/gates/V4{6,7,8,9}-*.png` (the final tree; r1-r4
the same rows on the earlier states).

**V46-lance-ready** (vs `lance-ready-side.jpg`). The words pass: both hands on the haft, the left hand forward
on it at 52 % with the palm on the wood (A101: 0.008 m), the blade forward and down, the tip at 0.50 m, the left
foot forward, knees bent. It does NOT look like the reference. From the side the right hand rests on the side
of her waist (the wrist goal is 0.25 m out, 1.10 m up, 0.05 m behind her centre) with the elbow flared back
behind her, so the rear hand reads as a hand on the hip rather than a fist driving the butt; the trunk is
nearly upright and the weight is not over the front hand. The reference's fighter has both hands in front of him
and his weight low and forward. **A MAJOR finding under R54, mine** (§6.2 says what the experiment showed).

**V47-melee-swing** (vs the windup, strike and follow stills). The lance is in her hands in every panel;
light-1, light-2 and the heavy are two-handed, light-3 one-handed; no arm goes behind the head; the heavy's hips
are the lowest. Weak next to the references: (1) in the 3/4 row the standing contacts of light-1 and light-2
read alike, the 3/4 lens looks down the thrust and both keys hold the wrist within 0.23 m of the pelvis, so no
standing contact shows the arms extended the way `lance-strike.jpg` does; (2) the three side windups are close
to one another (haft raised over the right shoulder, blade forward-up). The moving heavy and the live contact with
the smear show the body extended over the lead foot and are the two best panels. **A major finding, mine** (§6.2).

**V48-lance-holster** (vs `lance-back-carry.jpg`). Reads well: one steep diagonal, the blade over the right
shoulder, the bronze bob low at the left hip, the arms swinging fore and aft beside the body, the wrap tail clear
of the haft. The stowed bow crosses the lance in an X and its upper limb rises behind her head (armory's piece).

**V49-draw-from-jog** (vs `lance-back-carry.jpg`). The stride carries on in every tile; the right hand goes up
her side to the haft at the right shoulder with the elbow out and under the head (A107: at a sprint the elbow is
at most 0.056 m over the shoulder and never behind the head plane); the haft comes forward over the shoulder;
the last tile is the guard. Passes as I read it.

## 6. Honest gaps and asks

### 6.1 A101 (light-2's left palm) and A104 (the left forearm): FAIL, mine, not fixed

| clause | r1 | r2b | r3 | r4 | r5 (final tree) | bar |
|---|---|---|---|---|---|---|
| A101 light-2: left palm off the haft on a two-handed frame | 0.061 m | 0.058 | 0.072 | 0.192 | 0.059 | ≤ 0.05 |
| A104 light-1: left forearm to the spine axis | 0.077 m | 0.077 | 0.075 | 0.081 | 0.084 (light-2 0.104) | ≥ 0.10 |

What is known. Pinned (`X-left-trace`, r3: every key held still across windup, strike and recover at 0.1 steps)
every two-handed frame of light-1, light-2 and the heavy has the palm 0.004-0.014 m off the haft and the left
forearm ≥ 0.124 m from the spine. The failures exist only in a LIVE swing (`X-live-trace`, r4): on light-2's
strike and early recover the layer's own palm-goal error is 0.000-0.04 m while the measured palm is 0.06-0.15 m
off the haft, so the haft moves after the left hand is solved. A104's light-1 frame is the last one of the
swing (recover k 1.03), and light-3's re-grab of the haft at the end of its recover passes the forearm 0.08 m
from the belly (a one-handed-to-two-handed frame).

What I tried, measured and reverted: (r2b) re-seating the left hand in `postFix` after the right hand's late
corrections (`_handOffSelf`, `_armHullFinal`): no gain; (r3) a closed loop after the left solve that slides the
hand along the haft when the palm is off its line or the forearm is on the belly: A101 got worse; (r4) new
contact keys (below): A101 0.192. The tree carries none of them. **For the next builder:** find what moves the
right hand or the prop between `_solveLeft` and the end of the frame in a live light-2 (the pinned pose does not
move it), e.g. by recording `handR` and the prop matrix right after `_solveLeft` and again in `debug()`.

### 6.1b A106: FAIL in r5 by 0.3 mm on one frame (mine)

r1, r2b and r3 PASS (the drive arm 0.17-0.28 m from every hull). r5: in the "frozen-then-animated" row, when the
Tiller starts moving beside her, its right shin swept into her LEFT forearm on one frame (−0.0003 m, drawn).
`_armHullGuard` and `_armHullFinal` keep only the drive (right) arm out of a hull; the left arm rides the haft and
is not guarded. **Next builder:** extend the final arm-hull pass to the left forearm (re-seat the palm on the
haft after it), and check A101's left-palm clause near a machine afterwards.

### 6.2 The look: V46's guard and V47's standing contacts (mine; R54 major)

The frames pass most words and do not look like the references (§5). I built a scratch film-and-measure rig
for it (`scratchpad/r5/melee/xpose.mjs`: candidate keys written into the live tables, filmed side and 3/4, the
layer's own measures per candidate) and ran it in r3:

- **Guard.** Moving the right hand in front of the hip (G1, G2) tucks the right elbow beside the ribs and reads
  much more like a guard; but her 0.475 m left arm then reaches only 43-46 % of the haft (A101's ready band is
  50-60 %), so a better guard needs the trunk turned further toward the front hand too. Not adopted.
- **Light-1 contact** with the arms extended (wrist 0.40 m forward, pitch 0.34, dz 0.18): filmed as a real
  thrust and measured clean pinned (palm 0.005, forearms 0.21 m), **light-2 crossing** her front (blade 25 deg
  right, shoulders turned), and the **heavy** reaching 0.11 m further. Adopted in r4 and REVERTED: A102 read only
  3 distinct arcs, A106 read the fist 0.036 m inside a Tiller's shin on one frame, A101 read the light-2 palm
  0.192 m off. The keys are in `xpose.mjs` (`L2`, `S1`, `H1`); they need their dynamic clauses worked through
  one at a time, which this round's Chrome budget did not allow.

### 6.3 A100's dodge row: FAIL, in armory's file

Every row but the dodge passes (r1-r5 identical). During a roll the stowed lance tilts 35-89 deg (bar 30-60) and
the blade reads −0.35 to +0.72 m over the right shoulder (bar 0.20-0.70). The carry solve's free search is
switched only by the climb (`src/hero/carry.js`: `this._climb = !!this.player.mantling`), armory's file. The
last builder tried `mantling || dodging`: tilt then passes (34.7-59 deg), the midpoint reads 0.32 m (bar 0.30),
the blade 0.727 m (bar 0.70), the wrap tail 0.009 m (bar 0.06). **Ask (armory):** switch the free search on in a
dodge and tune it for those three, or the orchestrator rules on the row. The bar was not moved.

### 6.4 A-stow-clearance: FAIL; every failing clause is the stowed bow or the quiver (armory)

| clause | r1 | r2b | r3 | bar | piece |
|---|---|---|---|---|---|
| quiver to calf/heel, crouch-walk | 0.035 m | 0.035 | 0.035 | ≥ 0.05 | quiver |
| quiver to calf/heel, dodge | −0.045 m | −0.045 | −0.045 | ≥ 0.05 | quiver |
| head box, standing sweep, worst yaw | 30.2 % (39 deg off her back) | 30.6 % | 29.8 % | ≤ 20 % (R62 b) | bow |
| head box, running sweep, median | 8.7 % | 9.0 % | 8.7 % | ≤ 8 % (R62 b) | bow (every running yaw over 8 % is the bow) |
| head box, the lance's worst yaw | 14.5 % (51 deg) | same | same | ≤ 20 % | lance: passes |
| boom crossing | 0.009 m | same | same | ≤ 0.02 | pass |
| sprint calf/heel | 0.051 m (quiver) | 0.051 | 0.051 | ≥ 0.05 | pass, thin |

Seen, not graded: in the dodge the stowed bow's lowest point goes 0.28 m into the terrain. armory's
`A-variant-motion-rerun` re-runs this row; armory's branch already changes the stow kit and `carry.js`.

### 6.5 A49 / A50: SKIP-legacy-deleted until the Plumb (instruments-a)

Both report SKIP (R30) until a `sentry` kind lands. Staged by hand on the Tiller (the last builder's scratch
rows): A49 passes (hit, HP drop 23.4, tip 0.012 m inside the hull); A50 reads UNDERCUT, emits, the lance is in her
hand with the grip done before contact; it does not kill, because a Tiller is not a small class.

### 6.6 The Counterweight

Verified this round on a live machine (§1.2): the heavy is two-handed on the 1.50 m marks, its cock is 20 %
longer, and it knocks a Tiller down (one `forceState('stagger')` from melee.js; the Shepherd's Lance none).
**Not built:** the butt-strike finisher (bible §3.3 row, §5.3). It needs a beat whose striking end is the butt
(the hit test, the aim, the lunge and the trail all key on the tip today) and a pose that turns the haft about
150 deg without the forearm crossing her body (A104). The Counterweight has no GLB until armory's W3 and is not
equippable before then, so nobody can see it yet; it belongs with that GLB.

### 6.7 Smaller

- The step-in is 1.15 m/s (the foot lock's limit, A105); the hips' `dz` sells the lunge. Hit-stop 50 / 85 ms,
  recoil along the haft, camera shake from `impactFeedback`. I drove it only through the gates; the skeptic
  should play it at a keyboard.
- The hit's chips (`impactFeedback`, combat.js) read as dark round dots against the sand-coloured air. armory /
  combat-kit.
- The global list items I could run: A1, A20b, `A-no-horizon-terms-code` (1,358 ≤ 1,371), `-player` (1,503 ≤
  1,508), `A-ID-ip-assets-gone`, `A-assets-tracked` PASS; `A-licence-manifest` PENDING (third-party rows);
  `A-port-guard` PENDING (not a full lane run); `A-carried-suite` refuses to run beside carried rows
  (orchestrator's); A9 PENDING (load 12 at the time). The A90 family and `A-vram-ledger` did not run: r2's Chrome
  was killed three times by the memory guard while Kevin's own Chrome had the machine at 28-37 % free, and I gave
  the slot back. They are the orchestrator's 5270 run.

### 6.8 For the orchestrator and other lanes

- **Merge note (hero-body).** `playerAnimator.js` now declares in its constructor the fields hero-body's
  functions used to add lazily (`_ikMaxK`, `_efS`) and the M10 collider's `minCi/minJ`, all with the values
  their readers saw for `undefined`; hero-body's functions are untouched. Any field hero-body adds outside the
  constructor re-opens §4's cause (check: every `this.x =` outside the constructor whose name the constructor
  does not declare).
- **R63 (a) merge.** hero-body may edit `melee.js`'s press detection (the held-LMB edge). My `melee.js` changes this
  round are elsewhere in the file (the constructor's declarations, `surfaceGap`, `_sneakOk`, `_scanSneak`'s and
  `_resolve`'s loops, `aimGap` / `lastContactGap` rounding), so the two should fold without overlap.
- **gates.r5.carried.mjs:** fold my versions of A100-A107 at my exit (R47).
- **Chrome:** a wrapper in zsh must not pass `${VAR:+--flag $VAR}` (zsh does not word-split it: my first r2
  passed `--extra` and its path as one argument and burned a slot). And a page that wants the game's own module
  instance must import the URL the game loaded (`performance.getEntriesByType('resource')`), not the plain path:
  Vite serves an edited module under `?t=`.
