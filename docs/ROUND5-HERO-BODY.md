# ROUND 5 — lane `hero-body` report (W0b): Brea on the kept rig

Lane: hero-body · port 5252 · wave W0b · Oct 18–19 2026, fix round 2 Oct 22 2026.
Plan: `docs/ROUND5-PLAN.md` §2 (row), §1.2 (grants), §3.1 (W0b exit), §3.2 (contracts), §4.1 (budgets),
§6 (aloy.glb), §8 (rulings, incl. §8.3 R33 g), §9 (gate block). Canon: `docs/ROUND5-BIBLE.md` §3 (Brea),
§3.8 (build order), §5.2 (bow poses), §5.9 (controls).

**Status (Oct 22, fix round 2).** Brea runs the kept stack on the W0 loadout. Final lane run on 5252 (`lane4`, 58 gates): **39 PASS · 5 FAIL · 2 PENDING · 12 NEEDS-JUDGE**, and A-run-arms PASS in the follow-up global batch after a gate-windowing fix (§4.1), so 40 of 46 action rows pass. **The draw hand is now OUTSIDE the jaw** (it had been inside it, §0.1): V24 shows the fist on the jaw corner with the ∴ facing the lens; the loose no longer throws the arm behind the head (§0.2). Open: A-draw-elbow-level's head-plane clause (infeasible with the hand outside the face — proof in the gate, ruling requested, §0.5); camera rows A31d / A31e at the pitch clamp up-slope (one marginal row each in the final run, A31f and A31b passing; the worst cause found and fixed, §0.4, §4.3); A31c (failed at baseline, R33 b). A13 5/5 (R27) in all four full runs of this round. Global list items present: A1, A20b, A9, A90 ×4 PASS; A21 PENDING (timing); the pipeline items fail on other lanes' unmerged rows (§4.5). `public/models/aloy.glb` is deleted; nothing in `src/` loads it.

## 00. Fix round 3 (Oct 22, after judge r0) — what changed, by finding

Rulings applied (plan §8.3): **R35** (A-draw-elbow-level: the hand ≤ 0.10 m behind the head plane and always in
front of the back of the skull, the elbow ≤ 0.20 m), **R36** (A31c listed, must not get worse; A31b/d/e/f must
pass on Brea), **R37** (V12 against `run-side.jpg`, 10–30° lean), **R38** (A-hero-draws / A-input-actions: the other
lane's clause deferred), **R39** (the `SPECS.hero` swap is merged with pipeline's row, pipeline first). The head
plane in this gate is, as it has been since fix round 1, the back of the skull ellipsoid along the head's live
forward (`animator.behindHead`) — the same plane my R35 estimate of the reference elbow (≈ 0.18 m) was measured to.

### 00.1 The loose went BEHIND the skull, and the draw sat on its elbow bars (judge findings 1, 9, 10)

*Found* (`loose.js` / `sweep*.js` probes, every sim step of the loose, the four pitches, strafing both ways, from a
jog, from a sprint — the judge's protocol): the wrist +0.028 … +0.066 m behind the back of the skull through the
follow-through (judge: +0.023 … +0.064), the elbow 0.21–0.23 m. Four causes, all measured:

1. **The draw slid back off the anchor.** The pull is cut to the largest Lmax over the gate pitches, and the
   0.75 down aim stood 0.02 m over the other three (0.553 vs 0.526–0.533), so at every other pitch the reach clamp
   slid the whole draw 2–4 cm back (`slide` 0.022–0.035) — the wrist with it, to 0.044 m in front of the back of
   the skull at a level aim.
2. **Strafing and the aim walk lost the blade.** The strafe / aim-walk loops twisted the trunk 0.2–0.6 rad back
   toward square; the bow arm could not reach and the draw slid 8.6–9.0 cm (`slide`), the wrist 0.019 m in front of
   the plane, the elbow 0.19 m behind it.
3. **The kick ran straight back along the arrow** from the wrist's ANCHOR by `looseKick` 0.10 — 5–8 cm more than
   the room there was, and 1–2 cm of it spent first getting back from the slid wrist to the anchor.
4. **The down-aim elbow was placed by height alone** (`_rollElbow`): 0.034–0.055 m up-and-back of the hand along
   the falling arrow, run to run (bar 0.05).

*Fix* (`src/entities/playerAnimator.js`, profile `src/entities/anim/rigs/ubc.js`; every new behaviour is a profile
`tune` key whose absence is the Round-4 behaviour):

- `tune.drawProtDown` 0.7 — the bow shoulder protracts less at a steep down aim: the four Lmax now agree within
  0.004 m (0.526–0.532), the pull is re-derived (`UBC_BOW.drawLength` 0.548 → **0.527**, pull 0.603 → **0.582**,
  arrow 0.803 → **0.782**), and the standing slide is 0–1.4 cm.
- `tune.bladeLock { ref: −0.311, gain: 1 }` — **a closed-loop chest blade**: the shoulder line's yaw is measured
  before the stance and the blade (−0.311 rad standing, every pitch) and the trunk (`spine_03`) is turned back to it,
  the neck turned back by the same amount so the head keeps its facing. Strafing the slide drops 0.087 → 0.02–0.04.
- `tune.handBehindNock` 0.076 → **0.060**, `tune.handOut` 0.020 → **0.026** — the wrist closer behind the nock and a
  little further out of the face: 0/6 knuckle joints inside the posed head mesh at every row (ray parity, as §0.1).
- **The loose** — `tune.looseOut` 0.6 / `looseDown` 0.25: the kick runs back along the jaw, out away from the face
  and a little down toward the neck; it starts from where the wrist actually was at full draw (`_looseOff`); and
  **`tune.looseClear` 0.012 — a hard guard on the wrist target on every aimed frame (full draw, loose, return):
  the wrist is held ≥ 0.012 m in front of the back of the skull**, along the same plane the gate grades.
- `tune.drawShrugDown` 0.4 — a share of the draw shrug at the steep down aim (the joint rises, so the elbow can be
  up-and-back of the hand AND under the shoulder joint, A16).
- `_elbowForm` (`tune.elbowForm`) — **the draw elbow's form scan**: every elbow the arm can take is on the circle
  about the shoulder → wrist axis; it is scored against the gate bars as HARD limits (height [−0.03, +0.05], ≥ 0.055
  behind the hand, ≤ 0.195 past the skull, never over the shoulder joint) and form targets inside them (≥ 0.072,
  ≤ 0.17) and the arm turned to the nearest best point; through the loose the height floor drops 0.15 m
  (`looseDrop`: the elbow settles as the hand opens). Allocation-free (a preallocated scratch, no closures); two
  per-frame `toFixed` strings elsewhere in the aim layer were removed too.

*After* (gate run `f3draw1`, port 5252, A-draw-elbow-level PASS; behind-head values in m, + = behind the back of the
skull):

| row | elbow up (aim frame) | elbow behind hand | bow arm off chest | hand | elbow | loose: hand max | loose: elbow max | loose rear |
|---|---|---|---|---|---|---|---|---|
| −0.55 | −0.003 | 0.236 | 0.198 | −0.094 | 0.097 | **−0.012** | 0.173 | 0.066 |
| −0.4 | −0.003 | 0.235 | 0.199 | −0.088 | 0.112 | **−0.012** | 0.172 | 0.064 |
| 0 | −0.007 | 0.225 | 0.203 | −0.081 | 0.130 | **−0.012** | 0.170 | 0.058 |
| 0.75 | −0.006 | **0.066** | 0.179 | −0.055 | 0.061 | **−0.012** | 0.093 | 0.157 |
| strafe D | −0.008 | 0.231 | 0.210 | −0.073 | **0.139** | **−0.012** | 0.170 | 0.046 |
| strafe A | −0.009 | 0.229 | 0.220 | −0.062 | **0.149** | **−0.012** | 0.170 | 0.043 |
| from a jog | −0.010 | 0.232 | 0.216 | −0.068 | 0.144 | **−0.012** | 0.171 | 0.045 |
| from a sprint | −0.011 | 0.230 | 0.218 | −0.065 | 0.144 | **−0.012** | 0.170 | 0.040 |

Bars: elbow up [−0.03, +0.05], behind hand ≥ 0.05, chest ≥ 0.04, hand ≤ 0.10 and < 0, elbow ≤ 0.20; loose hand < 0,
loose elbow ≤ 0.20. **The strafing elbow is 0.052–0.061 m under the 0.20 bar** (it was 0.003–0.004); the down aim's
elbow is 0.066 m behind the hand (it was 0.041–0.053); **the loose hand never passes −0.012 m** (it was
+0.023 … +0.066), the loose elbow ≤ 0.173 m (it was 0.21–0.23). In the same run: A16 PASS (nock-to-hand 0.064–0.072 m, elbow ≤ −0.006 m vs the
shoulder, launch 0.0°), A17 PASS (**loose 0.061 m rearward**, flourish 24 sim frames), A32 PASS (≤ 0.044 m through the
ramp), A35 PASS (hand → Head joint 0.107 / 0.112 / 0.115 / 0.126 m at 0 / −0.4 / −0.55 / 0.75; bow elbow 167.9°),
A-lmax-solve PASS (live Lmax 0.527 / 0.529 / 0.531 / 0.533, bows 0.582 against the 0.588 solution), A-wrap-clear PASS
(0.055 m). Knuckle joints inside the posed head mesh: 0 of 6 at every row (probe).

The gate (`tools/gates.r5.hero-body.mjs`, A-draw-elbow-level) now encodes R35 literally — `handBehindHeadPlane`
(≤ 0.10), `handBehindSkull` (< 0), `elbowBehindHead` (≤ 0.20) — and adds **the follow-through**: on every animator
update (one sim step) from the release until 0.3 s after it, at all eight rows (four pitches, strafing D / A, from a
jog, from a sprint), `looseHandBehindSkull` (< 0) and `looseElbowBehindHead` (≤ 0.20); it reports per row
`looseMaxHandBehindHead`, `looseMaxElbowBehindHead`, the forearm midpoint and the rear travel, and a `margin` block
(the strafing elbow's distance to 0.20, the down aim's elbow-behind-hand, the worst loose hand / elbow).

### 00.2 Camera rows A31b / A31d / A31e / A31f on Brea (judge findings 2, 11) — R36

**The root cause of the run-to-run flips was not the camera: it was her stance after a staging teleport.** Every
camera row stages her with `p.position.set(...)` on the 38.8° face. A planted foot lock keeps its WORLD anchor, and
`_footLock` answered an anchor 100+ m away by sliding it to `MAX_LOCK` — 0.30 m toward the place she came from —
so whenever her feet had planted before the teleport (a page that had idled ~30 frames) BOTH feet stood 0.30 m off,
and on the face that is a lunge: the downhill ball 0.43 m under her root, the pelvis 0.50 m over it (0.82 standing),
**her Head joint 1.09 m over her feet instead of 1.36** (`lockdbg.js`, `hill4.js`, Oct 22). The rig hangs off her
head (stance follow), so the whole camera sank 0.1–0.2 m with it, and which of the two worlds a gate saw decided
A31b's −0.8 staging (relief 0 / boom 1.45 / gap 1.45, or relief 36° / gap 0.99–1.12) and the clamp rows' margins.
That is why lane1/2/4 passed and lane3 / the judge's run / this round's first runs did not.

*Fixes* (`src/entities/playerAnimator.js`, `src/entities/player.js` camera, hero-body's grant):

- **`_footLock`: a teleport is not a slip** — a lock whose anchor is > 1 m (`RESEAT_D2`) from its ball re-captures
  (error 0); a hitch or a shove (≤ 0.55 m, A13's replica) still slides as before. `replant()` (respawn) does the
  same explicitly. After a staging teleport she now stands at 1.35–1.37 m on the face.
- **`SWING_UP_ON` 0.80** — the ground yaw swing engages from 80 % of the look-up (was `SWING_UP_MIN`, 55 %). Standing,
  at camPitch −0.8 up-slope, the swing carried the lens 90° round to her side at knee height and the view up to 53°
  (all sky, A31b's film); the boom rotation, which keeps the lens behind her, answers there now. The clamp keeps the
  swing (A31e/f).
- **The rotation scan credits the deep-look-up dolly only at the pitch clamp**: under it (camPitch −0.8, now that the
  swing does not answer first) a dolly answer pulled a 1.45 m boom to 0.98 m (A31b's bar 1.20) where the rotation that
  keeps the boom's length clears. **The applied push-in is the least that clears** (`least`), not the one with most
  clearance (a 0.031 m-clear boom had been pulled 2.23 → 0.99 m for 4 mm). (A 1.25 m dolly floor under the clamp was
  tried and dropped: A31d's aimed pans dithered to 0.71.)
- **Rotated booms keep their length only as far as it clears** (and ≤ the un-rotated boom + 0.05 m): rotated 36°,
  the 2.23 m boom ran back into the hill where 1.45–1.60 m cleared.
- **`_preCut` — never hand `cameraBoom` a cut it would make 0.4 m deep**: at a deep look-up the planned boom is
  checked against `cameraBoom`'s own three-sample terrain march first and, if it would be cut, bisected to the longest
  length that clears by 1 cm (the march answered a millimetre graze with a 0.4 m back-off: a one-frame 1.03 → 0.63 m
  jump, head off the frame, the gap fade dithering her to 0.64–0.85).
- **The cut floor eases with motion, not the clock** (`REL_CUT_PER_RAD` 0.4 / `REL_CUT_PER_M` 0.5 /
  `REL_CUT_TRICKLE` 0.01 rad/s): a still camera no longer walks its rotation back into the same cut every second.
- **The head-and-shoulders keeper also engages where the ground ROTATED or DOLLIED the boom**, not only where it
  swung; at the pitch clamp only it may give back `KEEP_GROUND_EXTRA` (0.22 rad) past the aim budget (her head in the
  picture outranks the last degrees of a look-up the hill refuses; A31b grades the −0.8 stagings against the budget,
  so not there). Its change shares one per-RENDERED-frame budget with the hijack's slew (`KEEP_STEP_TOTAL` 2.6°):
  with 2–3 sim steps per frame the two had summed to 3.1–3.7° past the input on A31e's pans (bar 3).

⟨TBD runs table⟩

### 00.3 A31c (finding 3) — R36

Listed, not a W0b blocker (R36: failed at the W0-day1 baseline, `carried-baseline.json` fail ×3); it goes to the
camera backlog (§11) with an owner named at the W1 exit. This round's numbers: ⟨TBD⟩.

### 00.4 V12 (finding 4) — R37

The row's criteria are now R37's text, judged beside `reference/r5/gates-perf/run-side.jpg` (10–30° lean, stance
leg near vertical with the swing thigh forward, arms bent fore-aft beside the body, never crossing / T-rex /
prancing). Nothing in the body changed for it: the sprint trunk target is 0.30 rad (17°) from fix round 1. My reading
of `f3lane1`'s frame beside the reference (§4.4): trunk ≈ 12–15° forward, the stance leg under her, the rear leg
extended, both arms bent ~90° fore-aft beside the body — the reference's posture.

### 00.5 V23 (finding 5)

Re-staged: filmed from her FRONT-LEFT three-quarter, 2.3 m out at chest height (`lockCam(1.9, 1.3, −1.35, 1.2)`,
was a pure left side at 3.5 m), the sun on that side — the sternum and the alidade tube, the sash end at the left
hip against the dark trousers, the wrap tail trailing left-rear past her shoulder and the knot tail behind the
head are all in the lens at twice the old scale. The cord already swings (A19 gear 23° at a sprint); it was not in
the old frame at all. **And the judge looked for it in the wrong place because my criteria text said so**: on the v0
kit the alidade's cord hangs the tube in front of her RIGHT WAIST, by the girdle buckle (measured: tube centroid
y 1.12 m, 4 cm proud of the smock), not at the sternum the bible names. The criteria now say where it is; the cord
length is a content deviation from bible §3.1 / §3.5 ("at the sternum") for armory's W1 kit pass (shorten the cord
chain by ~0.18 m). My reading of `f3lane1`'s strips (§4.4): all four chains in different positions; the alidade's
motion is the smallest and is hidden by her arm in one strip.

### 00.6 V-brea-one-glance (finding 6): the wrap tail and the crescent

- **Wrap tail** — `tune.restKick` (new animator feature, `_restKick`): before the springs read the pose each frame,
  the wrap tail's root is turned so its root → end line points out to her left and back (`dir` (0.68, −0.62, −0.39),
  char space, ~52° off the vertical — more out than back: kicked straight back it rode into the line from a chase
  lens to her crown on A31c's run-away rows); the springs hang, bounce and collide it about that rest. On the move
  the kick fades by 0.4 of the gait weight (`moveDamp`: at 0 a crouch-walk carried it out sideways like a flag, V3;
  at 0.7 it hid behind her head from V23's front-left lens). At idle it
  reads as a pennant in the island's wind (V3 / V14 show it standing out to her left — a judge may call it stiff;
  the rest kick has no flutter of its own).
- **Crescent bracer** — the bronze fin is 1.5× taller (horns 7.2 → 10.8 cm proud, belly 2.4 → 3.8 cm):
  `kit-v0.mjs` gains `CRESCENT_K` 1.5 for a rebuild, and because the UBC sources are not on this machine,
  `tools/build/recipes/weapons/kit-v0-crescent.mjs` applied exactly that change to the shipped
  `stowkit-v0.glb` (the bracer piece, `_PIECE` 8: 102 crescent vertices) and `bracer-crescent-v0.glb`, in place,
  idempotent (`asset.extras.patches`), no triangle added.
- The sheet is re-filmed and re-committed (the `f3lane1` gate films, hashes in `reference/r5/hero/MANIFEST.md`):
  `reference/r5/hero/brea-silhouette-sheet.png` and `reference/r5/hero/brea-face-sheet.png` (face unchanged; the tail
  now shows behind her). My reading (§4.4): in black fill the tail leaves the outline beside her head in the front,
  back and 3/4 views (in the front view it runs along the upper bow limb's line), the crescent reads as a spiked notch
  at the left forearm in the front and back views; in the side views the tail is still mostly behind her head.

### 00.7 A-hero-draws / A-input-actions (finding 7) — R38

Both gates grade their binding clauses and report the other lane's clause **DEFERRED by name**: A-hero-draws —
Brea's own measure binding (≤ 4 draws, ≤ 2 casters, ≤ 20 k tris for body + outfit + kit — the 20 k clause is new
in the gate), the held-Sabina clause graded at armory's W1 exit; A-input-actions — actions, pad entries, rebind
persistence binding, the settings-list clause graded at shell-ui's W2 exit. Both grade the deferred clause here the
moment its piece exists. `f3lane1`: A-hero-draws PASS (4 draws / 2 casters / 19,832 tris; live 13 / 3 / 21,996 with
combat's Round-4 bow — deferred), A-input-actions PASS (7 actions, pad entries, `cal.binds.v5` persistence;
settings list deferred).

### 00.8 A-assets-tracked (finding 8) — R39

Nothing changes in this tree: `src/core/assets.specs.js` is pipeline's file. R39: the orchestrator merges
pipeline's `SPECS.hero` swap (`/models/hero/brea.glb` + `heroOutfitPan1`, `heroStowKit`, `ANIMS.heroUal2`) first,
in the same merge window as this branch's `aloy.glb` deletion; A-assets-tracked is graded on main after both.

## 0. Fix round 2 (Oct 22, morning) — what changed, by finding (kept for the record; §0.2 corrected, §0.5 superseded)

Every finding below was measured in this tree on port 5252 (probes through `tools/screenshot.mjs --eval`, the
gate rows through `tools/gates.mjs`); the frames were read.

### 0.1 The draw hand was INSIDE her jaw (V24 "∴ visible", "knuckle at the jaw corner"; Kevin "draw hand at the cheek")

*Found.* A ray-parity test of the draw-hand joints against the posed head/neck mesh at full draw: `middle_01_r`,
`index_01_r`, `middle_02_r` and `thumb_02_r` 6/6 inside at camPitch 0 and −0.55; the knuckle row sat 0.3 cm off
the face's midline, 5.9 cm in front of the `Head` joint — inside the mandible. The ∴ (on the back of the hand)
was buried in the jaw surface and the fletching lay over what showed of it (renders along the dots' own normal,
with and without the bow). Two causes, both measured:

1. **The bow ran 3.5 cm inside the anchor.** The Round-4 grip carried `_grip.x += 0.035` (char +X = her left)
   off the anchor line, so the string/nock line passed 3.5 cm medial of the jaw-corner anchor, i.e. through her
   face, and the fist with it (`nockPlanRelHead` −0.035 vs the anchor's −0.071).
2. **The wrist was clamped onto the nock's anchor.** The anchor is where the NOCK sits at full draw (the grip is
   `anchor − nockOff`; Lmax is solved for it), but the clamp held the WRIST within `handAnchorR` of it, so the
   wrist sat 3–5 cm behind the nock and the fist wrapped round the string the wrong way.

*Fix* (`src/entities/playerAnimator.js`, profile `src/entities/anim/rigs/ubc.js`; the Round-4 defaults are
unchanged for any other body): `tune.gripOut` (UBC −0.008: the string touches the jaw corner, a hair outside);
`tune.anchorNock` — the wrist's own anchor is the nock's less the hand: `handBehindNock` 0.076 back along the
arrow (UBC wrist → middle knuckle 0.084 m, so the knuckle row is at the jaw corner, inside A16's 0.09 m) and
`tune.handOut` 0.020 out to her right; `tune.drawWristExt` 0.35 rad — a relaxed wrist bent back so the knuckles
ride outside the jaw and the hooked fingers curl in to the string. *Measured after:* 0 knuckle joints inside the
head mesh at −0.55 / −0.4 / 0 / 0.75 and strafing; the ∴ faces her right of the arrow (back-of-hand normal · right
= 0.95); V24 shows the three dots, the fist on the jaw, the fletching at the mouth corner.

### 0.2 The loose threw the arm out behind her head (bible §5.2 "8–12 cm back along the jaw"; Kevin "never an arm behind the head")

*Found* (bow-cycle film + per-frame probe from idle / jog / sprint): at the loose the string hand went to the
UN-clamped string line pushed back by the whole pull — the arm straight out behind her at shoulder height, the
hand 0.195–0.255 m and the elbow 0.21–0.25 m behind the back of the skull, 0.30 m of travel.
*Fix:* `tune.looseOnJaw` — through the follow-through the hand rides the wrist's anchor slid back along the arrow
by `looseKick` (UBC 0.10, bible 8–12 cm), the elbow roll held; it returns to the string as the kick and the hold
decay together. *After (as reported then):* "the loose hand stays 0.031–0.041 m IN FRONT of the skull's back
plane". **CORRECTION (fix round 3): that claim was wrong — the sign was flipped.** The judge's per-frame trace
(`animator.behindHead(hand_r)`, positive = behind) and this lane's own re-measurement on the same build both read
the wrist +0.028 … +0.066 m BEHIND the back of the skull at looseT 0.2–0.45 (the loose.js probe, Oct 22: +0.028
at −0.55, +0.035 at −0.4, +0.053 level, +0.066 at the 0.75 down aim, +0.050 / +0.054 strafing, +0.046 / +0.045 from a
jog / a sprint), the elbow 0.21–0.23 m behind it. R35 was issued on the wrong number. What actually fixes it is
§00.1 below.

### 0.3 The A17 flourish was counted on rendered frames (R11 says sim frames)

The carried A17 counted rAF frames while `_quiverT < 1`; on the loaded box (≈ 20 fps, up to 3 sim steps per
render) a 20-sim-frame beat rendered as 7 frames and the row failed. R11 (plan §8.2): "counted on the sim clock
(≥ 8 sim frames at 60 Hz)". The gate now counts animator updates inside the beat (each is one sim step) and
reports rendered frames beside it: 20–23 sim frames (rendered 6–10) across this round's runs.

### 0.4 A31e / A31f — the camera parked the lens on her stowed lance (up-slope bearing, pitch clamp)

*Found* (the A31f sequence replayed frame by frame at ≈ 20 fps): on the 38.8° face at camPitch −1.15 with the lens
up-slope, the rotation solver took 5° and credited a 0.65 push-in that its three centre samples called clear;
`cameraBoom`'s whisker ring then cut the boom to 0.63–0.67 m, which put the lens 0.001–0.06 m from the stowed
lance (Brea's 1.55 m R10 diagonal reaches round her back where Aloy's 1.16 m spear did not) and dithered her to
0.30. Even when seeded clear (26°, gap 0.94) the release walked the rotation back down into the same cut.
*Fix* (`src/entities/player.js`, hero-body's W0 grant): (a) a seed clears the swing hysteresis of the previous
staging (`_swingTgt`); (b) `_groundRotFor` credits a deep-look-up push-in only when the pushed-in lens is
≥ `SWING_CLR` from her body proxy; (c) **the cut floor** — in the pitch-clamp regime (camPitch within 0.15 rad of
`PITCH_UP`), a boom `cameraBoom` actually cut ≥ 0.08 m under the placement AND to under `DOLLY_GAP` (0.90 m, where
the fade dithers her) raises a floor under the rotation (+0.06 rad per cut frame, eased off at 0.08 rad/s once free),
so the release can never walk back into the cut. (Unrestricted, the floor also caught A31b's −0.8 hillside row and
held its boom at a 1.11 m cut against that gate's 1.20 m bar — measured, then restricted.) *After:* the same replay
climbs 7.8° → 26° in four frames and holds it, gap 0.94–0.99 m, opacity 1.0, the lance 0.29 m from the lens. The
remaining misses are §4.3.

### 0.5 A-draw-elbow-level — the head-plane clause cannot hold with the hand outside the face (SUPERSEDED: ruled by R35, encoded in fix round 3, §00.1)

With the hand on the jaw and the forearm in line with the arrow (V24, Kevin "elbow level/back", the licence-clean
`draw-side.jpg` reference), the draw elbow sits 0.12–0.19 m behind the back of the skull. The gate now reports, per
row, the least head-plane depth ANY elbow on the arm's roll circle (shoulder → wrist fixed, both segment lengths
fixed) can reach while holding the other two form bars (height in [−0.03, +0.05], ≥ 0.05 m behind the hand):
−0.55: 0.114 m · −0.4: 0.123 · 0: 0.164 · strafing right / left: 0.195 / 0.195 (final run; the delivered elbow 0.129 / 0.134 / 0.172 / 0.196 / 0.196) — all five over the 0.10 m bar; the 0.75 down-aim row passes (0.060, reachable 0.065). A scapula sweep (`drawRetract` −0.10 / −0.4 / −0.7) moved the level
row only 0.165 → 0.146. The Oct 19 PASS of this clause (elbow 0.07 m) came from the fist inside the jaw (§0.1): the
wrist 5 cm further forward. The reference photo's own elbow is ≈ 0.18 m behind the back of the archer's head
(estimated from `draw-side.jpg`). Every other clause passes; the down-aim height clause was fixed this round
(`drawRetractDown` 1.1 → 0.5: −0.036 → −0.009 m). **Request (§7, orchestrator):** rule the clause to what Kevin's
"never an arm behind the head" means — e.g. the 0.10 m bar applies to points above the shoulder line or inside the
head's lateral shadow (the draw elbow at full draw is at shoulder height, 0.25 m out to her side), or a 0.20 m bar
that the reference itself meets. Until then the row reports FAIL by name; nothing was relaxed.

### 0.6 A28's jog "flight" was a floating stance foot (and A-climb-1m's palm sat on the bar)

*Found* (A28 on a quiet box, 60 Hz sampling: flight fraction 0.45 against ≤ 0.40; the Oct 19 report had 0.24, the
loaded-box runs 0.39–0.40): the fix-round-1 jog bounce compression (`runBob.keepJog` 0.22) RAISES the pelvis at the
bottom of the bob and re-solves only the feet whose stance weight is over 0.5; a foot ON the ground at touch-down /
toe-off rode up with the pelvis, so the lower ball's median height was 4.2 cm (probe, 90 samples; 2.9 cm with the
compression off). *Fix* (`_runBob`): at a jog a raise also holds every foot whose ball is within 5 cm of the ground.
*After:* flight 0.24–0.27 (probe) and 0.29 (A28, final run), median 3.0–3.2 cm; the jog pelvis bob read 0.069 and
0.136 m p-p on two probe runs (not a graded bar at a jog). The sprint (A-run-arms' graded bounce, 0.074 m) is untouched.
A-climb-1m's palm was 0.040–0.076 m off the edge run to run (bar 0.05; the walk-in ledge): the clavicle reach
allowance during the pull 0.6 → 0.9 rad.

### 0.7 Two hygiene items

- `src/hero/sheets.js` `renderStockFace(ctx, url)` no longer defaults to `/tools/r5-poc/assets/heroine-base.glb`
  (pipeline report §6.4, A-poc-promoted): the face sheet reads the committed `reference/r5/hero/ubc-stock-*.png`
  by default; a stock GLB is passed explicitly (pipeline's `humans.mjs buildHeroineBase`).
- `tools/gates.r5.pipeline.mjs` (pipeline's file) had been deleted in this branch's Oct 22 checkpoint; it is
  restored byte-identical to `a953355` so this branch's diff does not touch it.

## 1. What was built

### 1.1 Brea (bible §3.3–§3.5, §3.8 steps 1 and 4) — `tools/build/recipes/brea.mjs`

`public/models/hero/brea.glb` (≈ 0.32 MB): ONE skeleton (the 65 UBC joints + 19 dyn_ joints) and exactly
TWO skinned meshes, so the body is 2 draws (plan §4.1):

| mesh | material | contents |
|---|---|---|
| `Brea_Skin` | `MI_Brea_Skin`, 1024² base + 512² normal + 512² ORM | UBC `Superhero_Female` body + eyes (the eye texture packed into the free top-right strip of the UBC layout) |
| `Brea_HairWrap` | `MI_Brea_HairWrap`, 512² base + normal | `Hair_BuzzedFemale` coil shell (tinted `#15110F`), heavy straight brows (×1.08, arch flattened 40 %, simplified to a third), the orchil headwrap band + its crossing turn, the wrapped TOPKNOT (Ø 14 cm, carmine binding), the wrap knot, the 0.40 × 0.07 m wrap tail (violet outside, carmine lining inside) and the 0.22 m knot tail |

dyn_ chains (the kept spring solver discovers them by name; class by regex):

| chain | parent | class | what |
|---|---|---|---|
| `dyn_hairKnotTail_01..04` + `_end` | `Head` | hair | the knot tail — `chainOf('hair')`, the A33-hair-bounce target |
| `dyn_wrapSash_01..06` + `_end` | `Head` | cloth | the wrap tail, down the LEFT of the spine (never the draw side) |
| `dyn_sashEnd_01..03` + `_end` | `pelvis` | cloth | the outfit's linen sash end at the left hip |
| `dyn_alidadeCord_01..02` + `_end` | `spine_03` | (fallback cloth) | the alidade on its neck cord at the sternum |

**Face, no Blender** (`tools/build/recipes/lib/face.mjs`, which the NPC recipes reuse — `archetypeDeltas(seed, base)`
is their hook): the seven landmarks are FOUND on the mesh (`findLandmarks`), a sum of Gaussian bumps moves head,
brows, eyes and coil shell together (the eye sockets rigid to 15 mm, 18 mm falloff), normals recomputed only
where the field moved. The paint layer is composited from a bind-space POSITION MAP of the skin's UV layout:
skin retoned to `#8A5A3C` mid-cheek, sun creases at the eye corners, the **salt-line** (`#EDEAE2`, 8 mm, cheek to
cheek across the nose bridge below the eyes, crackled), the **3 cm scar through the LEFT brow** (a pale seam
`#BA927E`; the brow hair cut along it), the **∴ on the back of the right hand** (1 cm salt-ink dots in a 3.2 cm
triangle); eyes `#3B2A20`.

**Hide mask:** every body vertex carries `_HIDEMASK` (uint8). Bit 0 = covered by Pan Whites I. At equip the body
triangles whose three vertices carry the set's bit are culled (6,008 of 13,580 for Pan Whites I).
Heights: body 1.72 m (measured from the body mesh, not the wrap; the row's `targetHeight` is 1.7791).

### 1.2 Default outfit: Pan Whites I — *Raker's Whites* (bible §3.9) — `tools/build/recipes/outfit-pan-1.mjs`

`public/models/hero/outfit-pan-1.glb` (≈ 0.28 MB, 7,876 tris, ONE mesh, ONE material, 1024² `pan` atlas +
512² normal/ORM): MCO `Female_Peasant_Body` (orchil smock `#6B3F73`, lapilli girdle `#1C1B1E`, brass buckle,
linen hem), `Female_Peasant_Arms` rolled to the elbow (forearms and hands bare, so the ∴ shows; carmine rolled
cuffs), `Female_Peasant_Legs` (basalt `#4A4A50`), `Female_Peasant_Feet` (esparto with lapilli bands), procedural
linen sash knot + hanging end on `dyn_sashEnd`. *Deviation:* the bible names the Ranger feet; the Peasant feet keep
the set on one source texture and cost 2.6 k tris against 9.2 k.

### 1.3 v0 kit + the merged stow kit (bible §3.6, §5.2, §5.3; R10) — `tools/build/recipes/weapons/kit-v0.mjs`

| GLB | tris | sockets / notes |
|---|---|---|
| `kit/stowkit-v0.glb` | 2,092 (live) | ALL stowed gear as ONE skinned mesh, ONE draw, `_PIECE` bits 1 lance · 2 bow · 4 quiver+arrows · 8 bracer · 16 alidade; the lance on the `stow_lance` socket the carry solve poses (§2.4) |
| `kit/lance-shepherd-v0.glb` | 338 | 1.55 m pine, 22 cm bronze leaf blade, **7 cm bob-shaped bronze butt cap**, esparto wraps at 20 % and 55 %, vermilion/white graduations on the upper third; `butt grip grip2 stow tip` |
| `kit/bow-sabina-v0.glb` | 404 | 1.45 m juniper self-bow blockout, esparto grip, horn nocks; `grip nock string_top string_bottom stow` |
| `kit/quiver-cane-v0.glb` | 964 | rigid cane tube, palm-weave cap over the back half, 12 arrows; `stow mouth` |
| `kit/bracer-crescent-v0.glb` | 144 | stiff leather, bronze crescent plate (dorsal, left forearm) |

Measured carry (probe, Oct 22): the quiver's lowest point 0.50 m over the ground standing and 0.080–0.086 m
crouched / crouch-walking (A-stow-clearance's 0.05 m holds); the tube 10–12° from vertical at idle, 29–35° at a jog,
39–42° at a sprint (the pelvis carries it; bible 20°). The lance's bob 0.137–0.152 m over the ground crouched.

### 1.4 Native clips — `public/models/hero/brea-clips-ual2.glb` (0.2 MB)

UAL2 (CC0) plays on the UBC skeleton with no retarget (R15): `ClimbUp_1m`, `Slide_Start/Loop/Exit`, `Consume`,
`Hit_Knockback`. The seated pose for `ride()` is the UAL1 `Sitting_Idle_Loop`, baked on demand (`CLIPS.sitIdle`).

**Sources.** The recipes read `models-staging/r5-src/` (pipeline W0b) or `$R5_SRC`. Neither exists on this machine
since the Oct 22 restart (`/private/tmp` was cleared; pipeline's report: no source archive on disk), so this round
changed no GLB: every change is runtime code, gates and reference text.

## 2. Runtime: Brea on the kept stack — the published surfaces (exact signatures)

### 2.1 Boot rows (`src/hero/rows.js`)

Imported by the Player before `new Assets()`: points the `hero` row at `/models/hero/brea.glb`
(`{ url: '/models/hero/brea.glb', targetHeight: 1.77913, yaw: 0, required: true }`) and adds `heroOutfitPan1`,
`heroStowKit` and `ANIMS.heroUal2`, writing both `assets.specs.js`'s `SPECS` and `assets.js`'s copy at runtime.
**The pipeline files are not edited**; once pipeline makes the one-row data edit (§7.1) the override is a no-op.

### 2.2 The rig profile — `src/entities/anim/rigs/{ubc,index}.js`

`attachRigProfile(root)` (Player constructor, on the SOURCE root) writes `root.userData.rigProfile = ubcProfile(root)`:

```js
{
  name: 'ubc-brea',
  key, map, aim, contacts, feet, fingerAxes,      // 52/52 UAL pairs, derived finger curl axes
  orbitCaps,                                      // camera-orbit capsules by UBC names
  orbitChains: { cloth: '^dyn_(wrapSash|sashEnd)', hair: '^dyn_hairKnotTail' },
  hairChain: 'dyn_hairKnotTail_01',               // chainOf('hair')
  handCollider: { from: 'lowerarm_r', to: 'hand_r', tip: 'middle_04_leaf_r', r: 0.09 },   // M10
  tune: UBC_TUNE,                                 // the re-derived aim/draw/run constants (§3.2)
  bow: UBC_BOW,                                   // the Lmax solve (§3.1)
}
```

### 2.3 Animator seams (`src/entities/playerAnimator.js`, grant)

`this.T` (every aim constant from `prof.tune`, Round-4 values as defaults), T-form elevation (`pitchLive`),
the aim-frame elbow roll, `debugAim()` (now also `wristT`, `headAt`), the M10 capsule (`debugHandCollider()`),
`chainOf(cls)`, the alidade overlay (`debugAlidade()`), native clips (`debugNative()`), climb hands
(`debugClimb()`), `_runArmClamp`, `_runBob`, `_locoStep`, `_slidePose`, `behindHead(pt)`, fix round 2:
`tune.anchorNock / handOut / drawWristExt / gripOut / looseOnJaw` (§0.1, §0.2), and fix round 3 (§00):

```js
animator.replant()                     // release both foot locks: her feet re-plant where she stands (Player._die's respawn)
animator.debugAim()                    // + shYaw0, bladeCorr, looseClamp, elbowScan (the new layers' state)
// profile tune keys (absent = the Round-4 behaviour):
tune.bladeLock   { ref, gain }         // closed-loop chest blade (rad): the shoulder line's pre-blade yaw is held at `ref`
tune.drawProtDown  0..1                // bow-shoulder protraction share at a steep down aim
tune.drawShrugDown 0..1                // draw-shrug share at a steep down aim
tune.looseOut / looseDown  0..1        // shares of the loose kick out to her right / down the jaw line
tune.looseClear  m                     // the wrist target is held this far in front of the back of the skull, every aimed frame
tune.elbowForm   { up:[lo,hi], behindHand, behindHead, looseDrop }   // the elbow's roll-circle form scan (`_elbowForm`)
tune.restKick    [{ bone, tip, dir:[x,y,z], w, moveDamp }]   // a dyn_ chain's rest turned so root -> tip points along dir (char space), faded on the move
```

`_footLock` now re-captures a lock whose anchor is more than 1 m from its ball (a teleport is not a slip, §00.2).

### 2.4 Parts — `src/hero/{index,parts,outfit,stowkit,carry,held}.js` (handed to armory at W1 day 1)

```js
installHero(player) -> HeroRig            // Player constructor; `player.hero`
HeroRig.equip(row) / unequip()             // outfit sets (rows in rows.js)
HeroRig.kit: HeroStowKit                   // .attach() .detach() .setHidden(bits) .info() .carryInfo() .dispose()
HeroRig.info() -> { brea, draws, tris, casters, skeletons, meshes[], outfit, kit, lanceOut, bowOut }
HeroRig.update(dt)                         // per frame, no allocation: piece mask + the lance carry solve
HeroRig.dispose()
HeroRig.holdPreview(url?) -> { root, meshes, url, tris, dispose() }   // the Sabina blockout bound to combat's bow node (measurement)
HeroRig.bowPulls                           // the pulls written onto combat's bows (W0 bridge, §6)
PIECE = { lance: 1, bow: 2, quiver: 4, bracer: 8, alidade: 16 }
bindPart(heroRoot, srcRoot, tag, { castShadow, bones }) -> SkinnedMesh[]   // bind by bone NAME, own inverse binds
releasePart(meshes, player) -> { skeletons }   // removeFromParent + skeleton.dispose() + fade-clone release
class HideMask { apply(bit) -> hiddenTris; visibleTris() }   // index reorder + drawRange, no new GPU buffer
installPieceMask(material) -> { value }    // the `_piece` vertex mask, composed by the player's fade clone
class LanceCarry                           // carry.js: the stowed lance on its socket in the R10 band (A-lance-stow)
```

### 2.5 The published behaviour surface (contracts §3.2, owner hero-body, real at W0b)

```js
player.mods                          // PlayerMods: fields null = canon; .clear(); .active()
  .fallSafe  .fallLethal             // m (canon 4 / 9)
  .slideDegBySurface                 // { surface: deg } over { cinder: 28 }, else 50
  .knockdownMode                     // 'stagger' | 'light'
  .regen  .regenCap                  // hp/s; fraction of maxHealth it stops at
  .noiseMul                          // x footstep noise -> player.noiseMul / player.noise (+ stimulus.addNoiseFilter when present)
  .zoom                              // x camera zoom while aiming
player.ride(path, clip = 'sitIdle')  // or ride(path, { clip, speed, seat, loop, onExit })
  -> { socket, s, length, cancel(), done: Promise<'input'|'end'|'cancel'|'death'> }
player.dismount(cause) -> boolean    player.riding
player.surfaces.add({ x, z, r, surface }) -> id ; .remove(id) -> boolean
player.surfaceAt(x, z)  player.slideDegOn(surface)  player.surface
player.mantleClip ('climb1m' on a 0.82–1.22 m ledge)  player.mantleK  player.mantleEdge
events: 'player-ride' {length}, 'player-dismount' {cause}, 'player-slide-exit' {cause}
```

### 2.6 Input (`src/core/input.js`, grant: 12 added lines)

`plant` X, `cast` F, `tool` R, `slot1..4` Digit1..4 (bible §5.9); pad `16: 'KeyF'`; exported
`ACTION_PAD = { plant: 'b15', cast: 'b16', tool: 'b12', slot1: 'b5+b12', slot2: 'b5+b15', slot3: 'b5+b13', slot4: 'b5+b14' }`
and `ACTIONS` (every rebindable action); `input.bind(action, code)` persists overrides to `cal.binds.v5`.

## 3. The bow on the new body

### 3.1 Lmax

`Lmax = −u·d + sqrt((u·d)² − |u|² + reach²)`, `u` = anchor − bow shoulder, computed live every aim frame
(`debugAim().lmax`). **Fix round 3:** with `drawProtDown` 0.7 the steep down aim no longer stands over the other
three, so the four agree within ~0.004 m: 0.531 / 0.529 / 0.527 / 0.533 m at camPitch −0.55 / −0.4 / 0 / 0.75 (gate run
`f3draw1`; fix round 2: 0.533 / 0.526 / 0.528 / 0.553). `rigProfile.bow`: `drawLength` **0.527**, `restZ` 0.055, `pull`
**0.582**, `arrowLen` **0.782**; every combat bow carries `pull` 0.582 (the live solution 0.588, within ±0.01). The
standing pitches' draw now slides ≤ 1.4 cm off the anchor (2–4 cm before), which is what puts the wrist 7–9 cm in front
of the back of the skull at full draw.

### 3.2 The constants (`UBC_TUNE`; character space, metres)

| constant | Round 4 (Aloy) | Brea | how |
|---|---|---|---|
| `quiverHip` | (−0.2, 1.02, −0.14) | (−0.255, 1.205, 0.055) | the stow kit's measured nock cluster |
| `anchorOff` | (−0.086, −0.024, 0.118) | (−0.072, 0.034, 0.052) | right jaw corner on Brea's face mesh, from `Head` (the NOCK's anchor) |
| `anchorDrop` | 0.038 | 0.030 | jaw length below the anchor |
| `handAnchorR` / `From` | 0.064 / 0.72 | 0.060 / 0.72 | capture radius (now about the WRIST's anchor, §0.1) |
| `headOff` / `headR` | (0, 0.05, 0.01) / (0.105, 0.135, 0.115) | (0, 0.114, 0.016) / (0.083, 0.096, 0.113) | Brea_Skin's head-weighted vertex box, inscribed ellipsoid + 5 mm |
| `handIn` | 0.90 | 0.985 | the hand may rest ON the face, never in it |
| `bowArmLock` | 0.9945 | 0.9945 | unchanged |
| `handBehindNock` | 0.068 | **0.060** (f.r.2: 0.076) | wrist behind the nock; knuckles 0/6 inside the head mesh (§00.1) |
| `looseKick` | 0.075 | **0.11** (f.r.2: 0.10) | bible 8–12 cm along the jaw (§00.1) |
| `anchorNock`, `handOut`, `drawWristExt`, `gripOut` | —, —, —, 0.035 | true, **0.026** (f.r.2: 0.020), 0.35 rad, −0.008 | §0.1; handOut: A35's floor margin (§00.1) |
| `looseOnJaw` | — | true | §0.2 |
| `looseOut`, `looseDown`, `looseClear` | — | **0.6, 0.25, 0.012** | the loose back, out and down; the wrist ≥ 0.012 m in front of the skull's back plane on every aimed frame (§00.1) |
| `drawShrug`, `drawRetract`, `drawRetractDown` | 0, 0.8, 0.8 | 0.58, −0.10, 0.5 | forearm in line; down-aim elbow level |
| `drawProtDown`, `drawShrugDown` | — (1, 0) | **0.7, 0.4** | flat Lmax over pitch; the down-aim elbow up-and-back of the hand under the shoulder joint (§00.1) |
| `bladeLock` | — | **{ ref −0.311, gain 1 }** | closed-loop chest blade while moving (§00.1) |
| `elbowForm` | — | **up [−0.022, 0.04], behindHand 0.072, behindHead 0.17, looseDrop 0.15** | the elbow's roll-circle form scan (§00.1) |
| `restKick` | — | **wrapSash: dir (0.68, −0.62, −0.39), moveDamp 0.4** | the wrap tail's rest out to her left-rear, faded on the move (§00.6) |
| `drawHandRoll` | — | 1.0 | back of the hand to her right (∴ out) |
| `anchorPitch` | — | level 0, up +0.016, down −0.012 | A35 band at the up-aims |
| `restGrip`, `restReach`, `rayFwd`, `rayH` | (0.14, 1.42, 0.03), 0.42, 0.45, 1.43 | same, 0.40, 0.42, 1.42 | ready hold, first-frame aim ray |
| `eyeR` | — | (−0.0334, 0.1030, 0.0717) | the alidade raise |
| `pitchShare`, `pitchLive` | (0.14, 0.15, 0.13, 0.2, 0.28), bind frame | (0.36, 0.32, 0.32, 0, 0), live X | T-form elevation |
| `runArms`, `runBob`, `trunk`, `headRest` | —, —, —, 1.36 | see `ubc.js` | Kevin's arm rules, no prance, posture, camera stance follow |

## 4. Gates (plan §9 hero-body; `tools/gates.r5.hero-body.mjs`, port 5252)

Fix round 3 lane run `node tools/gates.mjs --port 5252 --extra tools/gates.r5.hero-body.mjs --lane hero-body`
(Oct 22, finished 21:16 UTC, run `f3lane1`, 58 gates): **43 PASS · 3 FAIL · 12 NEEDS-JUDGE** (no PENDING: R38). The
FAILs: A31b (its FILM's composition clauses only, §4.3), A31e (one sample of 629, §4.3), A31c (failed at the
W0-day1 baseline: R36, listed). Fix round 2's final run for comparison: 39 PASS · 5 FAIL · 2 PENDING.

### 4.1 Movement and draw (kept rows re-staged on Brea, R33 g) and this lane's draw gates

| gate | verdict | numbers (`f3lane1`) |
|---|---|---|
| A2-dodge-displacement | PASS | 4.84 m, animator recovers |
| A3-sprint-speed | PASS | 6.74 m/s (band 6.12–7.82) |
| A11-idle-alive | PASS | 74.7 mm path |
| A12-clip-driven | PASS | `Sprint_Loop` weight 1.0 at 6.72 m/s |
| **A13-no-skate (R27)** | **PASS 5/5** | worst stance windows 0.0076 / 0.0041 / 0.0089 / 0.0070 / 0.0065 m (bar 0.06), 6.8 m/s |
| A15-foot-flat | PASS | 1.89° idle and aim |
| A16-draw-anchor | PASS | 6 rows: nock-to-hand 0.064–0.068 m (bar 0.09), elbow ≤ −0.006 m vs the shoulder, headClear 1.73–1.97, launch 0.0° |
| A17-draw-beats (R11) | PASS | hand-to-quiver 0.092 m, flourish 23 SIM frames (10 rendered), **loose 0.056 m rearward** (f3draw1: 0.061) |
| A18-slope-conform / A18b@hero | PASS / PASS | ball clear ≤ 0.0001 m at 10/20/30°; moving p90 0.005 m |
| A19-secondary-motion | PASS | hair 48°, cloth 44°, gear 23° range at sprint |
| A28-run-cadence | PASS | jog 2.93 steps/s, flight 0.26 (bar 0.40); sprint 3.57 / 0.43 |
| A28b-canon-speeds@hero | PASS | walk 1.47, jog 4.93, sprint 6.40 (sim) |
| A31-aim-strafe-skate | PASS | 0.0104 m |
| A31b-aim-strafe-skate-player-anim@hero | PASS | ≤ 0.010 m, legs never cross (min sep 0.19 m) |
| A31g-direction-change-skate | PASS | worst first stance after 20 reversals 0.020 m (bar 0.08) |
| A32-draw-ramp | PASS | nock-to-hand ≤ 0.045 m through the ramp, ≤ 0.069 at full draw, hand ≥ 1.53 of the skull |
| A33-rig-finite | PASS | 0 non-finite bones (85) |
| A33-hair-bounce@hero | PASS | knot tail 3.76 Hz vs footfall 3.76 Hz, detrended 0.089 m p-p |
| A34-chains-driven@hero | PASS | 15/19 dyn_ bones > 0.5° (0.79) |
| **A35-cheek-anchor@hero** | **PASS** | hand_r → Head joint 0.115 / 0.112 / 0.108 / 0.126 m at −0.55 / −0.4 / 0 / 0.75 (band 0.10–0.16), behind the face plane 0.131–0.177 m, bow elbow 167.97°, hands 0.59 m apart |
| A36-hit-react-visible@hero | PASS | 19.3° lean, decay 0.65 s, hit clip 0.82 |
| A26-one-convention@hero | PASS | animator probed by animator key, identical to BoneSpace |
| **A-lmax-solve** | **PASS** | Lmax 0.529 / 0.527 / 0.532 / 0.527 m; bows 0.582 vs solution 0.587 (±0.01) |
| **A-draw-elbow-level (R35 + follow-through)** | **PASS** | 8 rows (4 pitches, strafe D/A, from a jog, from a sprint); elbow ≤ 0.153 m behind the head plane (**strafing: 0.061 / 0.054 m under the 0.20 bar**); the 0.75 down aim's elbow **0.066 m** behind the hand; the hand ≤ −0.053 m (in front); **the loose: hand ≤ −0.012 m, elbow ≤ 0.172 m on every sim step**. Per-row table §00.1 |
| **A-wrap-clear (M10)** | **PASS** | every chain ≥ 0.055 m from the hand/forearm through a full cycle from a sprint-stop, 4 pitches |
| A-alidade-pose | PASS | tube 0.015 m from the right eye (idle/jog/crouch), elbow under and ahead, lowered in 0.19–0.20 s |
| **A-run-arms** | **PASS** | wrists ≥ 0.229 m off the midline, ≥ 0.27 m under the shoulder (−0.020 margin), fore-aft 0.484 m/cycle, every stride's elbow 0.129–0.135 m behind the hip, **pelvis 0.074 m p-p**, knee never above hip, 6.79 m/s |
| A-lance-stow | PASS | R10 band at idle/jog/sprint/crouch/crouch-walk/climb/4 draws, never in the torso |

### 4.2 Traversal, surface, identity

| gate | verdict | numbers |
|---|---|---|
| A-climb-1m | PASS | walk / jog 0.78 s on top, palms ≤ 0.047 m from the edge through the pull, 0.00 m float |
| A-slide | PASS | slides on cinder 29.8° and 40.5°, not on grass 34.2°; 2.60 m/s; exits on Space at once; planted sole ≤ 0.056 m |
| A-player-mods | PASS | each field changes exactly its behaviour and clears; speeds unchanged |
| A-ride-hook | PASS | pelvis ≤ 0.002 m from the seat socket on 78 seated frames; Space dismounts; geometries 162→162, textures 116→116, listeners 34/2→34/2 |
| A-input-actions | **PASS (R38)** | 7 actions with pad entries, rebind persisted and restored (binding); the settings-list clause DEFERRED by name to shell-ui's W2 exit |
| A-face-delta | PASS | 5 of 7 graded landmarks ≥ 6 mm (7.75 / 7.43 / 6.71 / 6.38 / 6.45; unchanged face), profile IoU 0.913 |
| A-brea-contrast | PASS | salt 6.09:1; black sand ΔE2000 21.3, 22 % of pixels ≥ 3:1 |
| A-hero-draws | **PASS (R38)** | her own 4 draws / 2 casters / **19,832 tris** (body 9,864 · outfit 7,876 · kit 2,092; binding ≤ 4 / 2 / 20 k); live in play 13 draws / 3 casters / 21,996 tris with combat's procedural Round-4 bow — the held-weapon clause DEFERRED by name to armory's W1 exit |
| A-outfit-merge-dispose | PASS | ×6 equip/unequip + bracer swap: geometries 151→151, textures 116→116, skeletons 3→3 |

### 4.3 Camera rows (hero-body grades them on Brea, R33 g / R36)

⟨TBD camera table⟩

### 4.4 Visual rows (NEEDS-JUDGE; filmed in `f3lane1`, frames read by this lane — advisory, R29)

| gate | my reading of the frame |
|---|---|
| V1-sprint-frame | back view: arms fore-aft beside the body, no crossing; lance (bob low-left) and bow on opposite diagonals |
| V2-idle-frame | hands relaxed at the thighs, feet planted, weight on one leg |
| V3-crouch-stalk | low stalk, arms hanging, feet planted; **the wrap tail stands out to her left like a pennant** (its kicked rest, §00.6 — a judge may read it as stiff) |
| V4-aim-anchor | over the shoulder: bow up, string hand at the jaw, draw elbow back; the wrap tail out to her left, clear of the hand |
| V12-sprint-vs-reference (R37) | side, contact frame, beside `run-side.jpg`: trunk ≈ 12–15° forward of hip→neck (R37 band 10–30°), the stance leg under her, the rear leg extended, both arms bent ~90° swinging fore-aft beside the body (near fist forward at chest height, far elbow back), the knot tail behind the head — the reference's posture |
| V13-aim-strafe | front, far: bow up, a wide strafe step (small in frame) |
| V14-slope-contour | across the slope, soles on the ground; the wrap tail out to her left |
| V23-secondary-motion@hero | **front-left three-quarter, 2.3 m**: knot tail (behind the head: down / swung / strands out), wrap tail (violet band behind the shoulder / dark curl / flag out to the right), sash end (the strip at the left thigh, three heights), alidade (the small brass tube at her right waist: two strips, hidden by the arm in the third) — all four in different positions; the alidade's motion is the smallest |
| **V24-draw-vs-reference@hero** | the fist on the jaw/cheek with the ∴ (three pale dots) on the back of the hand facing the lens, the fletching at the mouth corner, the forearm on the arrow line with the elbow level and back, bow arm straight, the wrap tail out behind her shoulder clear of the hand, the crescent fin on the bow forearm |
| V-brea-one-glance | the committed sheet (`reference/r5/hero/brea-silhouette-sheet.png`): black fill — the tail now leaves the outline beside her head in the front, back and 3/4 views (where it crosses the upper bow limb's line in the front view); the crescent reads as a spiked notch at the left forearm in the front and back views; topknot, lance/bow X with the bob, the quiver at the right hip; colour row — the violet tail streaming left-rear |
| V-brea-face | salt-line, the pale left-brow scar, dark eyes; the profile visibly not the stock face; the ∴ inset; the tail now visible behind her in the front view |
| V-traversal | the climb's pull frame (palms on the top, knee up), the slide low with the arms out, standing on the 3 m top step — unchanged from fix round 2 |

### 4.5 Global green list (the items that exist in this tree; one run, `--only`, port 5252, run `f3global`)

| gate | verdict | numbers |
|---|---|---|
| A1-boot-clean | PASS | state = playing |
| A20b-no-system-errors | PASS | 0 errors, 233 frames |
| A9-perf-budget | PASS | 282 draws, 58.6 fps (fpsAttributable true) |
| A21-real-draw-calls | PENDING (timing terms) | draws 286 / 177 / 311 and triangles PASS; GPU / p95 terms not attributable |
| A90-memory-stability | PASS | heap −7.7 %, geometries +9, textures −28 |
| A90-memory-stability-expansion | PASS | non-machine growth 0, geometries +3 |
| A90b-memory-attribution | PASS | 0 offenders, 0 orphaned textures |
| A90-rig-reclaim | PASS | geometries +5, textures 0 over 30 cycles |
| A81-canon-speed-bands | FAIL (not this lane) | the one stale literal is npc's `A96-npc-animated` ("travellers >= 4"); none in `tools/gates.r5.hero-body.mjs` |
| A-ID-ip-assets-gone (pipeline file) | FAIL (not this lane) | the only hit: `public/anims-hybrid/aloy-ual.json` (gates-perf's W0a deletion, not merged) |
| A-licence-manifest (pipeline file) | FAIL (not this lane) | legacy-source FAIL on the same `aloy-ual.json`; third-party / credits PENDING |
| A-assets-tracked (pipeline file) | FAIL (environment) | `git check-ignore` exits 128: `models-staging/r5-src` became a SYMLINK to pipeline's tree at 21:28 UTC (not made by this lane) and git refuses a pathspec beyond it; its real miss is unchanged — `SPECS.hero` still names `aloy.glb` (R39) |
| A90-abs, A-alloc-rate, A-vram-ledger, A-no-horizon-terms-*, A-reach-all-sites, A-port-guard, A-carried-suite | — | not in this tree (gates-perf / brand / instruments-core files not merged) |

## 5. Brea's sheets for Kevin (§3.1 W0b exit, §11 decision 1)

`reference/r5/hero/brea-silhouette-sheet.png` (front, side from each side, back, 3/4 at 64 px black fill — each 4×
nearest and true size — and full colour, default loadout) and `reference/r5/hero/brea-face-sheet.png` (front /
profile / 3/4 at 1.2 m beside the stock UBC front / profile, and the right-hand ∴ inset); the stock comparison
renders `ubc-stock-front.png` / `ubc-stock-profile.png`; rows and SHA-256s in `reference/r5/hero/MANIFEST.md`.
**Re-committed in fix round 3** from the `f3lane1` gate films (the kicked wrap tail and the taller crescent). Made by
`src/hero/sheets.js` (`silhouetteSheetOverlay`, `faceSheetOverlay`) — the gates V-brea-one-glance / V-brea-face film
exactly these overlays; standalone:

    node tools/screenshot.mjs _sheets --port 5252 --eval "(async () => { const S = await import('/src/hero/sheets.js');
      return { sil: await S.silhouetteSheetOverlay(__CTX__) }; })()"

## 6. Honest gaps and W0 bridges

- **A31b — its FILM's composition clauses** (§4.3): the −0.8 hillside film is a good look-up frame (her head and
  shoulders at the bottom, sky and the mountain skyline above, solid, lens 1.5 m) but her crown sits at NDC −0.11
  (clause: above the centre) and her clavicles at −0.95 (clause: inside ±0.9) with the view at its 25.8° look-down
  budget. Every staging clause of A31b passes. Not closed.
- **A31e — one sample** of the slow clamp pan's 629 (§4.3) — ⟨see the runs table⟩.
- **The camera's answers on the 38.8° face rest on many coupled thresholds** (swing / rotation / dolly / lift / cut
  floor / keeper / hijack): this round found the dominant cause of the run-to-run flips (§00.2: the post-teleport
  lunge) and fixed it, but A31 rows still move by a sample or a few hundredths between runs.
- **A31c** — failed on the Round-4 baseline (R36: listed, not graded at W0b). This round vs the judge's r0 numbers:
  ⟨see §00.3⟩.
- **The alidade hangs at her right waist, not at the sternum** (bible §3.1 / §3.5): the v0 kit's cord chain is
  ~0.18 m too long. V23's criteria now say where it is; armory's W1 kit pass should shorten it.
- **The wrap tail's kicked rest** reads as a pennant at idle (no flutter of its own); in the side silhouettes it is
  still mostly behind her head.
- **W0 bridge — `SPECS.hero`**: `src/hero/rows.js` points the `hero` row at Brea at runtime; `assets.specs.js`
  (pipeline) still names `/models/aloy.glb` (A-assets-tracked's miss) — R39: the orchestrator merges pipeline's swap
  in the same window, pipeline first.
- **A-hero-draws' held-weapon clause** (R38, armory W1): the bow in play is combat's procedural Round-4 bow until
  armory loads `bow-sabina-v0.glb` in `src/combat/bow.js` (the W0 bridge `HeroRig._applyBowSolve` writes `pull`
  **0.582** onto combat's bows; `holdPreview()` binds the Sabina for measurement). **A-input-actions' settings-list
  clause** (R38, shell-ui W2).
- **No GLB was rebuilt from source this round**: the recipes need `models-staging/r5-src/` (or `$R5_SRC`). The one
  asset change — the crescent fin — was applied to the shipped GLBs in place by `kit-v0-crescent.mjs` and mirrored in
  `kit-v0.mjs` (`CRESCENT_K`) for the next rebuild.
- **Stow kit, for armory's W1 art pass**: the quiver tilts with the pelvis (10–12° from vertical at idle, 39–42° at a
  sprint; bible 20°); during a full draw the carry solve stands the stowed lance up beside her left side.
- **No licence-clean ledge-climb still** in `reference/r5/**` yet (V-traversal's climb panel is graded on the
  written criteria).
- **`public/LICENSES.json`**: unchanged this round (the crescent patch is project-original work under the
  `brea-kit-v0` row); pipeline's fold turns `ubc-standard`, `mco-fantasy-standard`, `ual2-standard` into derived rows
  at the merge.

## 7. Requests to other lanes and the orchestrator

1. **orchestrator — R35 was issued on my wrong number**: R35 quotes "hand 0.03–0.04 m in front of the back of the
   skull through the loose", which was my fix-round-2 claim with the sign flipped (§0.2 correction). Please re-issue
   R35's rationale on the corrected numbers: the loose went 0.023–0.066 m BEHIND the back of the skull before this
   round; it now holds the hand ≥ 0.012 m in front of it on every sim step (§00.1). The bars as ruled are unchanged
   and encoded literally.
2. **pipeline (R39):** set `SPECS.hero` in `src/core/assets.specs.js` to
   `{ url: '/models/hero/brea.glb', targetHeight: 1.77913, yaw: 0, required: true }` and add `heroOutfitPan1`,
   `heroStowKit` and `ANIMS.heroUal2` as data; drop the `aloy.glb` entries in `tools/optimize.mjs`,
   `tools/spike-hybrid-bake.mjs` and `tools/licences/{lib,ip-scan}.mjs`; record `archive_sha256` for `ubc-standard`,
   `mco-fantasy-standard`, `ual2-standard`, and restage `models-staging/r5-src/` so the hero recipes can rebuild.
3. **armory (W1):** load `public/models/hero/kit/bow-sabina-v0.glb` in `src/combat/bow.js`, read `rigProfile.bow`
   (**drawLength 0.527 / restZ 0.055 / pull 0.582 / arrowLen 0.782**) there, and retire `HeroRig._applyBowSolve`;
   shorten the alidade cord chain (~0.18 m) so the tube sits at the sternum; pin the quiver's tilt to the trunk.
4. **orchestrator / player-control owner at W1 (R36 backlog):** A31c and A31b's film composition (§6), and the
   camera's coupled thresholds on steep faces (§00.2) — this lane's §00.2 notes and probes (`scratchpad/r5/hero-body/
   bin/{swingdiag,hill*,film,a31e-probe2}.js`) are the starting point.
5. **world-props (W1):** publish `gatePlaces.sprintStrip` (≥ 50 m flat, clear, dry, straight).
6. **gates-perf:** a licence-clean ledge-climb still; merge the W0a deletion of `public/anims-hybrid/aloy-ual.json`
   (A-ID-ip-assets-gone, A-licence-manifest); and note for every camera row's staging: a raw `position.set` teleport
   now re-plants her feet (§00.2) — stagings are no longer seeded with the lunge.
7. **settlements (W2, absorbing npc):** `A96-npc-animated`'s stale `travellers >= 4` literal is A81's only failure.

## 8. The gate file and how it merges

`tools/gates.r5.hero-body.mjs` exports `GATES` and `HERO_BODY_GATE_IDS`, and works with BOTH runners:

- the R5 registry runner (`gates.config.mjs` with `LANE_FILE_RE`, gates-perf's W0a, not yet on main): it
  auto-discovers the file; every row shadows the carried row of the same id;
- the Round-4 runner on main and in this tree: load it with `--extra tools/gates.r5.hero-body.mjs`; base
  `gates.config.mjs` rows of the same id (A2–A19, A28, A31, A32-draw-ramp, A33-rig-finite, V1–V4, V12–V14) are
  replaced IN PLACE (the runner shares those objects), and rows that live in a `gates.round4.*` file are exported
  as `<id>@hero` (`shadowOf` names the row), so `--lane hero-body` runs exactly this lane's 58.

`--extra` takes ONE file; to add another lane's file in the same run, a combiner module that re-exports both
`GATES` arrays works (this lane's global-list run used one in scratch: hero-body + pipeline).

Fix round 3 changes in the file: A-draw-elbow-level (R35 encoded literally + the per-sim-step follow-through clause,
8 rows, a `margin` block), A-hero-draws / A-input-actions (R38: binding clauses graded, the other lane's clause
DEFERRED by name; A-hero-draws gains the ≤ 20 k tris clause), V12 (R37 criteria + `run-side.jpg`), V23 (front-left
three-quarter staging; the alidade's real place in the criteria), the header.

## 9. Files changed

Fix round 3 (vs this round's base checkpoint `8544703`): `src/entities/playerAnimator.js` (closed-loop blade,
`drawProtDown` / `drawShrugDown`, the loose: out/down shares, start offset, `looseClear` guard; `_elbowForm` +
`_efCost`; `restKick`; `_footLock` teleport re-capture; `replant()`; two per-frame `toFixed` strings removed; debug
fields), `src/entities/anim/rigs/ubc.js` (tune values, `UBC_BOW` re-derived), `src/entities/player.js` (camera: keeper
on rotation/dolly + clamp-only extra budget + per-rendered-frame step budget, `_preCut`, cut floor easing with motion,
least applied dolly, dolly credit at the clamp only, rotated-boom length cap, `SWING_UP_ON`; `replant()` on respawn),
`public/models/hero/kit/{stowkit-v0,bracer-crescent-v0}.glb` (crescent ×1.5, in place),
`tools/build/recipes/weapons/kit-v0.mjs` (`CRESCENT_K`), `tools/build/recipes/weapons/kit-v0-crescent.mjs` (new),
`tools/gates.r5.hero-body.mjs`, `reference/r5/hero/{brea-silhouette-sheet,brea-face-sheet}.png` +
`reference/r5/hero/MANIFEST.md`, `docs/ROUND5-HERO-BODY.md`. (The orchestrator's checkpoints committed parts of this
as they went; `git -C <tree> diff --stat 8544703` lists the whole set.)

Whole branch vs `a953355`: as fix round 2's list plus the above.

## 10. Process hygiene

Vite only as `npx vite --port 5252 --strictPort` from this tree; Chrome only through `tools/gates.mjs` /
`tools/screenshot.mjs` on 5252, one at a time, each run inside the machine-wide slot (`chrome-slots/slot{1,2}`, plan
§0 rule 8) and the disk / memory preflight; probes' scripts and logs under `scratchpad/r5/hero-body/`, never in the
tree. At the end: Vite stopped, 0 Chromes of this lane alive, `shots/` removed.
