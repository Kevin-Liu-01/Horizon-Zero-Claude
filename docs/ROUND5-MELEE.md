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

`A-alloc-rate` at `CAL_WAVE=W1` (gates-perf's instrument, unchanged): the staged fight, then sprint-and-draw,
10 s each, caller attribution. The instrument passes in every run. Per owner against the R48 (c) baseline:

| owner | baseline KB/frame (KB/s) | r1 | r2b | guard (x 1.10) |
|---|---|---|---|---|
| `playerAnimator` (melee from W1) | 48.67 (2,756) | 32.81 (1,915) | 33.53 (1,956) | pass, −31 % |
| `melee` (meleeLayer, melee.js, lanceStow) | 9.75 (552) | 0.83 (47) | 0.74 (42) | pass, −92 % |
| `frozen-control` (player.js; my grant lines) | 7.47 (423) | 6.61 (386) | 6.94 (405) | pass |

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

FRAMES_SECTION

## 6. Honest gaps and asks

### 6.1 A101 (light-2's left palm) and A104 (the left forearm): FAIL, mine, not fixed

| clause | r1 | r2b | r3 | r4 | r5 (final tree) | bar |
|---|---|---|---|---|---|---|
| A101 light-2: left palm off the haft on a two-handed frame | 0.061 m | 0.058 | 0.072 | 0.192 | R5_A101 | ≤ 0.05 |
| A104 light-1: left forearm to the spine axis | 0.077 m | 0.077 | 0.075 | 0.081 | R5_A104 | ≥ 0.10 |

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
- **gates.r5.carried.mjs:** fold my versions of A100-A107 at my exit (R47).
- **Chrome:** a wrapper in zsh must not pass `${VAR:+--flag $VAR}` (zsh does not word-split it: my first r2
  passed `--extra` and its path as one argument and burned a slot). And a page that wants the game's own module
  instance must import the URL the game loaded (`performance.getEntriesByType('resource')`), not the plain path:
  Vite serves an edited module under `?t=`.
