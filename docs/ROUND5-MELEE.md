# ROUND 5 — lane melee (W1): the lance on Brea

Lane port 5256. Numbers are from the runs named in each row; run reports were under
`scratchpad/r5/melee/runs/` (not in the tree). The verdict on every V row below is my own reading and is
advisory (rule 3): an R29 judge has not graded them yet.

## 1. What this lane built

The relaunch of Nov 3 found the previous builder's work checkpointed: the state machine, the beat table, the
gate file. The gates were mostly green on paper and the frames looked wrong. Read at 1600x900 she bowed over
her own hands, looked at the floor in the guard and at every contact, stood with her feet together, and her
knees straightened at the top of every swing. So most of this round went into the pose.

| what | where | why |
|---|---|---|
| **Her eyes stay on what she is fighting.** The neck and skull take out the trunk's turn and lean (`HEAD_LEAD` 0.14, `HEAD_LEVEL` 0.92). The old code added pitch to the head | `meleeLayer.update` | the guard read as a woman looking at her feet |
| **The hips turn and travel with the beat.** Every pose key carries `py` (pelvis yaw) and `dz` (pelvis travel forward), interpolated with the key, standing only (`_stanceW`, not in a crouch or a roll). The animator's `pdz` now carries it | `meleeLayer._stance`, `playerAnimator` melee block | "limbs do the work"; the thrust is hip-driven (bible §5.3) |
| **The legs live in the guard and load into the beat.** `_stanceMix` goes from the guard's stance to the beat's and back. It replaces an envelope on one key, which straightened the knees at each cock | `meleeLayer._stance`, `STANCE_ENV` | she stays low through the windup, as in the reference |
| **A real guard.** Left foot forward, rear leg back, knees bent, hips bladed 15 deg, chest 21 deg more, right hand at the hip at 20 %, left on the wrap at about 53 %, tip 0.47 m | `READY`, `STANCE.ready` | V46 |
| **Keys re-tabled** on her real arm (0.475 m + 0.075 palm): the left hand spacing on a thrust is now 0.24-0.27 m, not 0.14 m | `BEATS`, `HEAVY` | two hands read as two hands |
| The right elbow goes back beside the ribs at a low hand, opens outward only as the hand rises | `_solveRight` pole | at the guard the upper arm stood level with her shoulder |
| The left forearm keeps off her belly: the elbow rolls out, the wrist does not move | `_leftElbowOut` (`LEFT_FORE_CLEAR` 0.13) | A104, Kevin's "arms crossing into her body" |
| The swing smear fades along the sweep and toward the haft | `melee.js`, trail vertex colours | it read as a strip of card |
| The stowed bow's line is found once the kit is worn (`_bowChar` looked once, before the kit existed, so every bow clause was silently off) | `meleeLayer._bowChar`, `_leftArmBowGap` | two A104/A101 clauses were not running |
| Counterweight tuning: `LANCE_VARIANTS`, `heavyTime` 1.2, `knockdown` | `lanceStow.js`, `melee.js` | §2 W1; the GLB is armory's W3 |
| Allocation: `decimalFields` (R46), small inlinable `clamp/damp/smoothstep`, `_springParentQ`, branch-free foot strike and flutter phase, `_warmSprings` | `playerAnimator.js`, `meleeLayer.js`, `melee.js`, `player.js` (2 lines, the grant) | R48 c; see §4 |

Kept from the previous builder, verified and not redone: the press-starts-the-swing state machine, the draw that
ends on the grip (R5), hit-stop holding the blade, recoil, the Undercut drawing first (M11), step-in as a velocity
floor, the aim at the hull, and the 17-row gate file.

## 2. API (published)

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

CONFIRM_RUN_PLACEHOLDER

## 4. Honest gaps and asks

### A100's dodge row: FAIL, in armory's file

During a roll the stowed lance tilts 35-89 deg (bar 30-60) and the blade reads -0.35 to +0.72 m over the right
shoulder (bar 0.20-0.70). Every other row passes. A rigid lance on a back that is rolling goes with the back. The
carry solve's free search is the existing tool, and it is switched only by the climb (`src/hero/carry.js`:
`this._climb = !!this.player.mantling`). That file is armory's since W1 day 1, so I did not edit it.

I tested the switch through a Proxy on `carry.player` (scratch row `F9-a100-proxy`): `mantling || dodging`.
The tilt then reads 34.7-59 deg (pass), but the midpoint is 0.32 m (bar 0.30), the blade reaches 0.727 m (bar 0.70)
and the wrap tail comes 0.009 m from the shaft (bar 0.06). So it is the right switch, not the whole fix.
**Ask for armory or the orchestrator:** switch the free search on in a dodge and tune it for those three, or rule
on the row. The bar was not moved.

### A-stow-clearance: FAIL, all clauses in the stow kit

| clause | measured | bar | owner |
|---|---|---|---|
| quiver to calf/heel, crouch-walk | 0.036 m | 0.05 | armory's `stow_quiver` hanger, already in its tree: re-run after its merge |
| quiver to calf/heel, dodge | -0.045 m | 0.05 | same |
| head box covered, standing, lens 39 deg off her back | 30.4 %, all bow | 8 % | the stowed bow's upper limb: more diagonal, or lower, in the kit recipe |
| head box covered, chase, lens behind her | 16.8 %, all bow | 8 % | same |
| head box covered, lens 66 deg off her back | 14.2 %, all lance | 8 % | carry solve; a 2.9 cm haft in the box is already 12 %, so this may need a ruling |
| boom crossing | 0.009 m | 0.02 | pass |

armory's `A-variant-motion-rerun` re-runs this row, so it will see these numbers once this lane merges.

### `_springs` against the R48 bar: not met

The owner row is inside its guard (playerAnimator 47.66 KB/frame against a 48.67 baseline × 1.1), and the row passes.
The absolute per-function bar of 4 KB/s is not met.

| function | staged fight | sprint and draw |
|---|---|---|
| `_springs` | under the top list (was 45.8 KB/s) | 1,083 KB/s (was 1,708) |
| `update` | 209 KB/s (was 324) | 1,059 KB/s (was 1,607) |

The fight number shows the optimised code nearly clean. The sprint number is the first sprint throwing away
optimised code. Born-decimal fields took about a third off it (R46 was right about the cause), and the rehearsal of
`_warmSprings` did not visibly help. What still deoptimises at her first sprint is not found: finding it needs
per-deopt tracing like instruments-core's `R5_IC_DEOPTMARK`, and at 1-3 hours per Chrome slot today I stopped here
and shipped the gate work. `_warmSprings` is the least proven piece of this report and could be removed. In
the same file, hero-body's `_aimLayer`, `_efCost` and `_elbowFlow` are 70-145 KB/s and are not mine to change.

### The rest

- **A49 / A50** report SKIP-legacy-deleted until the Plumb lands (R18, instruments-a). Staged by hand on the Tiller,
  scratch rows: A49 passes (hit, HP drop 23.4, tip 0.012 m inside the hull). A50 reads UNDERCUT, emits, and the lance
  is in her hand with the grip done before the contact; it does not kill, because a Tiller is not one of the small
  classes. The kill clause has never been exercised on a sentry.
- **Tiller only.** A103 and A106 stage every non-legacy kind, and today that is one kind. Plumb and Peg will be new.
- **The butt-strike (bible §3.3 table, §5.3) is not built.** It would only appear on the Counterweight, which has
  no GLB until W3. The Counterweight heavy is tested on its 1.50 m marks and slower clock with the Shepherd's model
  standing in. Its knockdown is `forceState('stagger')`, untested against a live machine.
- **The hit's dark debris.** On film the chips from `impactFeedback` read as dark round dots against the sand-coloured
  air (`combat.js`, armory/combat-kit). It looks cheap next to the sparks.
- **Stowed gear at the guard.** The quiver is large in every melee frame, and the haft passes near it at the hip.
  It does not clip, but it is the first thing the eye lands on from her right. For armory.
- **A101's and A104's margins are thin**: L2's left palm, L1 and L2's left forearm sit close to their bars, so a
  loaded box could tip them. A102's L2 hand travel likewise.
- **Live real-input feel** was filmed (a press on a Tiller, a slow-motion L1 and heavy), not played at a keyboard.
  The step-in is still 1.15 m/s because of the foot lock (A105); the hips' `dz` is what sells the lunge. A skeptic
  should judge it.
- Gate instruments I changed, none loosening a bar: the beat played is read at the strike (a held press opens as a
  light's cock); two-handed frames start at the cock key, because a beat chained off light-3 spends its opening
  bringing the free hand back; A-stow-clearance now names which piece covers the head and from which bearing.

### For the orchestrator

- `tools/gates.r5.carried.mjs`: fold these rows at my exit (R47: A100-A107).
- Chrome slots: at 22:14Z and 23:45Z two gate Chromes ran at once, because a run's cleanup removed a slot another lane
  had by then taken. My `run.sh` trap did this kind of removal until I made it check `owner.txt` first. Other lanes'
  wrappers may do the same.
