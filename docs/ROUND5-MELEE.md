# ROUND 5 — lane melee (W1): the lance on Brea

Lane port 5256. Every number below names the run it comes from; the run reports and frames are under
`scratchpad/r5/melee/runs/` (not in the tree). My reading of each V row is advisory (rule 3): an R29 judge has
not graded them.

Three builders have worked this lane. The first wrote the state machine, the beat table and the gate file.
The second (Nov 3) re-tabled the pose on Brea's real arm and ran most rows green. This round (Nov 6) re-ran the
whole block on this tree, found two clauses that the second builder had flagged as thin had tipped over, fixed
them, implemented R62 (b), and spent most of its time on the R48 allocation bar (§4). Chrome slots were the
bottleneck: one gate Chrome machine-wide, about one slot won per three hours.

## 1. What this lane built

### 1.1 Kept from the earlier builders, verified this round

The press-starts-the-swing state machine; the draw that ends on the grip (R5); hit-stop holding the blade (50 /
85 ms at timeScale 0.03); recoil along the haft; the Undercut drawing first (M11); step-in as a velocity floor;
the aim at the hull (R7); a guard with the left foot forward, knees bent and hips bladed; keys tabled on her
0.475 m arm; the hips' turn (`py`) and travel (`dz`) per key; the head kept on the target; the left forearm off
her belly; the Counterweight tuning (`LANCE_VARIANTS`, `heavyTime` 1.2, `knockdown`). See §2 for the API.

### 1.2 This round

| what | where | why |
|---|---|---|
| **The left hand follows the haft the right hand moved.** `postFix` re-seats the left hand on every two-handed frame, on the final matrices, after `_handOffSelf` / `_armHullFinal` have turned or pulled the right hand; its elbow-out pass then reads the spine where the pelvis offset and the conform put it | `meleeLayer.postFix` | r1: A101 read the left palm 0.061 m off the haft on one light-2 frame (bar 0.05) and A104 the left forearm 0.077 m from the spine at the end of light-1's recover (bar 0.10). Both clauses were the "thin margins" of the last report |
| **R62 (b) in `A-stow-clearance`**: the cover clause is the median over the 24 yaws ≤ 8 % and the worst yaw ≤ 20 %, read on the standing and the running sweep each; the detail reports both | `tools/gates.r5.melee.mjs` | the ruling of Nov 3; the bar is the ruling's, not looser |
| **Fields declared at birth (R48 c).** Every field the frame used to ADD later is declared in the constructor with the value its readers saw for `undefined`: 18 on the animator (`_bobKeep`, `_rbPlanted`, `_latK`, `_trunkPitch0`, `_bowCarryArm`, `_footLatLoc`, `_toeTips`, `_ikMaxK`, `_efS` …), 13 on the melee layer and 33 on its debug record, 10 on `Melee`, 7 on the step debug record, two on the M10 hand collider, 11 camera fields on the player (the player.js grant, 2 lines) | `playerAnimator` ctor, `meleeLayer` ctor, `melee.js` ctor, `player.js` | an added field is a new hidden class of an object TurboFan holds as a constant, and every optimised reader is thrown away the frame it appears (§4) |
| **No per-frame string or closure.** `toFixed` on a per-frame path (the carry slide, the re-parent gap, the aim gap, the contact gap, four step debug values) is a `Math.round`; the conform's `applyPelvis` and the stance step's `ballC` closures are methods; three per-frame `for…of` are indexed loops | `meleeLayer`, `melee.js`, `playerAnimator` | each was an allocation every frame (or every melee frame) in any tier |

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
MELEE_TABLES { READY, BEATS, HEAVY, STANCE }
// a pose key: { hand, shaft, lh, lhW, lhOn, yaw, py, pitch, roll, dz }

// tools/gates.r5.melee.mjs
FILM_KIT { NOHUD, FILM, FREEZE, STAGE, AIMLOCK, LOCKCAM, PIN, READY, gridOf }  // for --extra film rows
```

## 3. Gate table

GATE_TABLE_PLACEHOLDER

## 4. R48: the allocation bar on `playerAnimator.js` and the melee files

GATE_ALLOC_PLACEHOLDER

## 5. The frames, read at 1600x900 against the references

FRAMES_PLACEHOLDER

## 6. Honest gaps and asks

GAPS_PLACEHOLDER
