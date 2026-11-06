# ROUND 5 — lane melee (W1): the lance on Brea

Lane port 5256. Every number names the run it comes from: `r1` … `r5` are this round's batched runs on this
tree (reports and frames under `scratchpad/r5/melee/runs/<run>/shots/gates/`, not in the tree). My reading of
each V row is advisory (rule 3); no R29 judge has graded them.

Three builders have worked this lane. The first wrote the state machine, the beat table and the gate file. The
second (Nov 3) re-tabled the pose on Brea's real arm and ran most rows green. This round (Nov 6) re-ran the whole
block, implemented R62 (b), verified the Counterweight's knockdown on a live machine, fixed A102's heavy-hips
margin, worked the R48 allocation bar on both owners (−31 % and −92 % against their baselines; the per-function
bar is still not met, §4), and tried and measured three changes to the left hand and the contact keys that did
not hold, all reverted (§6.1). Chrome was the bottleneck: one gate Chrome machine-wide, one slot about every two
to three hours, one run lost to Kevin's own use of the machine (the memory guard killed it, correctly).

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
| **The heavy sinks deepest, with margin.** Heavy stance: both knees bend further (thighL −0.82, calfL 1.08, thighR 0.30, calfR 0.40, dy −0.26); light-3 stands 0.015 m taller | `meleeLayer.STANCE` | A102 pins the heavy's hips 0.04 m under every light: r1 read 0.079 m, r2b 0.032 (FAIL), r3 PASS |
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
                                               // loaded: Vite serves an edited file under ?t=, see §6.1)
// a pose key: { hand, shaft, lh, lhW, lhOn, yaw, py, pitch, roll, dz }

// tools/gates.r5.melee.mjs
FILM_KIT { NOHUD, FILM, FREEZE, STAGE, AIMLOCK, LOCKCAM, PIN, READY, gridOf }  // for --extra film rows
```

## 3. Gate table (`node tools/gates.mjs --port 5256 --lane melee`)

GATE_TABLE

## 4. R48: the allocation bar on `playerAnimator.js` and the melee files

ALLOC_SECTION

## 5. The frames, read at 1600x900 against the references

FRAMES_SECTION

## 6. Honest gaps and asks

GAPS_SECTION
