# ROUND 4 — Wave 1 final verdicts (orchestrator summary from the workflow journal)

Lanes ran build → gate judge + engineering/film judge → up to 2 fix rounds. This lists the LAST verdict per judge lens per lane.
Serious residue is routed to Wave 2 follow-up lanes (machine-rig-followup, machine-ai-followup, player-control-followup, core-platform-followup2).
NOTE: the final re-judging happened while machine-rig's fix round was still mutating shared machine code — cross-lane failures in audio/machine-ai
(footfall events, wreck dispose orphaning loot beacons) are consequences of that and belong to machine-rig-followup.

## core-platform-followup
- **gates** (core-platform-followup) — pass=True score=88 serious=0

## player-control
- **gates** (player-control) — pass=False score=42 serious=2
  - [blocker] New suite-wide regression: A3-sprint-speed / A12-clip-driven fail because sprint now collides with a tent at spawn
    - fix: Land the one-line fix already specified in docs/ROUND4-PLAYER-CONTROL.md §0 and the builder's report: add the same teleport-to-open-ground staging used in A13-no-skate to A3-sprint-speed and A12-clip-driven in tools/gates.config.mjs (core-platform-owned file —
  - [major] player-control's own 10 registered gates showed a per-frame render exception on one run, flipping harness status to FAIL despite every assert computing pass:true
    - fix: Re-run `node tools/gates.mjs --port 5204 --lane player-control` alone on an otherwise-idle box and check systemErrors is empty on all 10. If it reproduces, the likely culprit is player.js `_collectMaterials()`'s hardcoded `c.customProgramCacheKey = () => 'aloy
- **eng/film** (judge-player-control-r2) — pass=False score=5 serious=2
  - [blocker] Aloy still dissolves on a hillside the moment she looks up — solidCut 0, no occluder, on terrain A29b itself selects
    - fix: Gate the ground-pocket arm on cause, not on length: only consider fading when `terrainCut` is what pushed the lens in, and never below the boom the intentional look-up asked for — e.g. compare `boomLength` against `min(camDist, reach_at_base_pitch)` rather tha
  - [major] Sprinting down a steep face still collapses the boom to 0.45–0.53 m and dithers her for 6–9 frames — the report's stated floor of 1.07 m does not hold when she is moving
    - fix: The relief attack damp (k = 22, ~5–8 frames to converge) is the wrong tool for a step change in geometry. Either drive relief to its target without damping when the un-relieved boom is already below a safety length (the constraint is geometric — a slow attack 

## machine-ai
- **gates** (machine-ai) — pass=False score=0.78 serious=2
  - [major] Disposing a wreck orphans its loot beacon: a cyan pillar and the whole Machine leak into the scene forever
    - fix: Give the beacon an explicit teardown instead of relying on its update closure: store the mesh (e.g. `this._beaconMesh = beam`) and add `dispose()` to the `this._beacon` record in machine.js:1644 that does scene.remove(beam), geo.dispose(), mat.dispose() and `b
  - [major] PlayerAnimator._onDamage does not exist, so every machine hit on Aloy throws inside Machines.update and fails four of this lane's gates
    - fix: player-anim must implement `_onDamage(e)` on PlayerAnimator (or change the line 420 subscription to the handler that actually exists — `_hit = 1` style, as the adjacent 'player-hurt' listener does). Not a machine-ai code change; but machine-ai should re-run `-
- **eng/film** (judge-machine-ai-r2) — pass=False score=72 serious=1
  - [major] Strider can never attack: the lane's own tables create the exact dead zone this round claims to have removed
    - fix: Close the gap in lane-owned data, one line: set the strider `charge` row's `min` to 16 in tables.js:256 so the table agrees with strider.js:243 and `_reachable` returns a ring the species will actually fire from (band [10,22] clamps 18 -> 18). Alternatively na

## machine-rig
- **gates** (machine-rig) — pass=False score=36 serious=7
  - [blocker] A47-corpse-grounded FAILs reproducibly (contradicts builder's claimed PASS)
    - fix: Re-check rig/ground.js's mass-scaled impact solve for behemoth, thunderjaw and scrapper specifically — thunderjaw's -0.84m regression in particular suggests the corpse solve is not running (or is being overridden) for at least this species after the final gait
  - [blocker] A47c-corpse-mass (builder's own hardening gate) shows corpses are not collapsing for 7 of 8 species
    - fix: The corpse-grounded fix apparently only nudges the lowest vertex into a tolerance window (which a splayed limb can satisfy while the body mass floats) rather than actually lowering the body — same failure mode the gate's own doc-comment says it was written to 
  - [blocker] A47b-corpse-posed confirms scrapper's corpse floats well above the terrain
    - fix: Same corpse-grounding defect as above, specific to scrapper's death pose/mass placement.
  - [blocker] A48-cadence FAILs on a clean numeric measurement: Longleg's cadence is out of band
    - fix: Longleg's gait cadence law / suspension window in gait.js needs re-tuning against the audit's per-species band; airborneFraction 0 suggests it never leaves the ground during the sampled run, i.e. the run cycle may not be engaging for this species.
  - [major] V26-silhouette: Scrapper reads as an unreadable jumble, not a quadruped
    - fix: Builder already correctly diagnosed this as needing an art iteration on the Scrapper shell/sculpt pairing, not more code — flagged here only because the gate criterion is strict and PARTIAL is not a passing grade.
  - [major] V27-attack-pose: Longleg is missing from the captured frame entirely
    - fix: Add non-silent logging (or a setup-time assertion) in the V27 stageCast/beforeFreeze loop so a species that fails to stage shows up as a setup error instead of just being absent from the shot, then debug why Longleg's chooseAttack/_startAttack path isn't produ
  - [blocker] Cross-lane regression contaminates 3 machine-rig gates: playerAnimator._onDamage is not a function
    - fix: This is a player-anim-lane bug (playerAnimator.js is exclusively that lane's file — not a machine-rig ownership violation) and should be routed there: playerAnimator needs a real `_onDamage(e)` method (or the listener needs to call whatever the hit-react metho
- **eng/film** (judge-machine-rig) — pass=False score=40 serious=6
  - [blocker] hideSculpt() leaves the retired donor mesh as the machine's aim geometry — up to 80 % of hit hulls are invisible
    - fix: Make hitHulls skip retired geometry — in /Users/kevinliu/Horizon Zero Claude/repo/src/core/hitHulls.js:255 add `if (o.userData?.noHull || !o.visible) return;` to the build traversal (and invalidate the cached set when hideSculpt runs, since build() caches on m
  - [blocker] Corpse solve lifts wrecks instead of settling them — 6 of 8 species sit HIGHER dead than alive
    - fix: Grade the wreck's mass, not its lowest point: add a gate term asserting the corpse's MEDIAN posed vertex height drops relative to the same machine alive (e.g. deadMedianY <= aliveMedianY * 0.75), and only then the lowest-vertex window. Then re-author the death
  - [blocker] V26-silhouette fails: Longleg is still the donor cartoon-bird sculpt, Thunderjaw reads as detached debris
    - fix: Extend the shell kitbash + hideSculpt() to the longleg (src/entities/machines/longleg.js, rig/shells.js) so it is a two-tall-legged machine with stub wings on the ribs. For the thunderjaw, build real leg columns and a single welded skull/jaw block in rig/shell
  - [major] V27-attack-pose: the Sawtooth windup is its idle pose with a recoloured eye
    - fix: Author real windup keyframes for the Sawtooth in src/entities/machines/sawtooth.js — write gait.pose.legLift[frontLeg], pose.crouch and pose.headPitch during the attack windup phase rather than leaving the attack as a body transform (audit machine-rig-08). The
  - [major] Three lane gates reported as PASS fail on a clean run; machine dispose throws an uncaught TypeError
    - fix: Fix the compileAsync leak (core-platform): give warmUp a cancellable compile, or `await` the compile and drop the race, so an abandoned poll cannot outlive the load screen. Re-run the lane suite and report the actual numbers rather than a best-of-N; A47b at -0
  - [major] 25 MB of dead model duplicates left in public/models/ — shipped in dist and force-committed by .gitignore
    - fix: Delete or relocate both sets: move bake intermediates and originals to /Users/kevinliu/Horizon Zero Claude/repo/models-staging/ (already gitignored) and have tools/bake-rigs.mjs write its .orig/.baked artefacts there instead of into publicDir. Tighten .gitigno

## world-light
- **gates** (world-light) — pass=True score=90 serious=0

## audio-pipeline
- **gates** (audio) — pass=False score=0.6 serious=1
  - [blocker] A76-footfalls now FAILs (reproducibly), not PENDING as the builder reported
    - fix: In tools/gates.round4.audio.mjs, replace the 6 fixed probe points for A76 with points verified against the live generated terrain (e.g. sample a grid of candidate points at runtime and pick distinct results, or bias points toward known slope/shelf/river featur
- **eng/film** (judge-audio-pipeline) — pass=False score=72 serious=1
  - [major] Servo/idle-loop chains leak on every kill — machine idle beds die permanently after 8 in-earshot deaths
    - fix: Give `_loopChains` the same reclaim sweep the one-shot pool already has: at the top of `_loopChain()` (or once per `_updateSpatial` tick) walk `this._loopChains` and, for any chain with `busy && endsAt <= this.ac.currentTime`, call `c.reset()`. That honours th
