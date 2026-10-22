# ROUND 4 — Wave 2 final verdicts (orchestrator summary from the workflow journals)

Last verdict per judge lens per lane (gate judge = Sonnet, engineering/film judge = Opus). Serious residue → Wave 3 follow-up lanes.

## player-anim
- **gates** (player-anim) — pass=True score=1 serious=0
- **eng/film** (judge-player-anim-r2) — pass=False score=72 serious=1
  - [major] A33-hair-bounce still fails a clean re-run (1 FAIL + 1 PENDING in 4 runs); §6b/§7 claim it is now reproducible
    - fix: Raise the resolvability floor in tools/gates.round4.player-anim.mjs:268 so the lock clause SKIPs instead of failing where the periodogram cannot separate the bar — empirically ~6x footHz sampling and >= 8 gait cycles in the window, not 2.5x — or hold her on flat ground long enoug

## combat
- **gates** (combat) — pass=True score=100 serious=0

## world-ground
- **gates** (world-ground) — pass=False score=0.85 serious=1
  - [blocker] V33-rim ships with core-platform's GTAO grid overlaying the whole massif, not a world-ground defect
    - fix: Not a world-ground fix. Route to core-platform: in src/core/engine.js's GTAOPass setup (~line 397-399), either set screenSpaceRadius:true or otherwise scale/fade the world-space AO radius with camera distance so it stops aliasing into a screen-locked grid on the far massif. Do no
- **eng/film** (judge-world-ground-r2) — pass=True score=88 serious=0

## world-props
- **gates** (world-props) — pass=True score=1 serious=0

## focus-items
- **gates** (focus-items) — pass=True score=97 serious=0
- **eng/film** (judge-focus-items-r2) — pass=True score=88 serious=0

## progression
- **gates** (progression) — pass=True score=1 serious=0
- **eng/film** (judge-progression-r2) — pass=False score=72 serious=1
  - [major] Skill/difficulty wrapper on Machine.takeDamage zeroes the legacy `baseDamage` damage channel
    - fix: In the machine wrapper, resolve the source value the same way machine.js does before scaling, and keep the legacy field in sync: `const bi = hit.impact ?? hit.baseDamage ?? 0; const bt = hit.tear ?? (hit.impact === undefined && hit.baseDamage !== undefined ? hit.baseDamage * 0.35

## core-platform-followup2
- **gates** (core-platform-followup2) — pass=True score=0.95 serious=0
- **eng/film** (judge-core-platform-followup2-r0) — pass=True score=91 serious=0

## machine-ai-followup
- **gates** (machine-ai-followup) — pass=True score=95 serious=0
- **eng/film** (judge-machine-ai-followup-r2) — pass=False score=82 serious=1
  - [major] A41c cannot see a recurrence of the defect it was written for: its variety bar is derived from the same reachability the regression destroys, and its published `legal` invariant is a tautology
    - fix: Derive the bar from the TABLE, not from ring reachability: use `bandProfile().distinct` (non-rear rows whose [min,max] intersects the engage band) for `s.bar`. Then add the direct assertion the r1 finding actually needs — for every non-rear row that reaches into the band, `picker

## player-control-followup
- **gates** (player-control-followup) — pass=False score=0.72 serious=2
  - [major] A31's `camera pivot ≤ 1.2 m` bar is violated while crouch-aiming at any look-up; the guard that enforces it is dead code
    - fix: Call the guard: replace `LOOKUP_LIFT * up * up` at src/entities/player.js:1709 with `this._lookLift(up)`, then re-run A32b (its boom-monotonic check tolerates +0.02 per 6° step, so re-measure `camDist` at 48°→66° directly — I measured the shipped up² curve monotonic at 1.273→1.03
  - [major] §10's framing recovery table does not reproduce, and A31b's `onScreen` bar is set below what flat ground delivers
    - fix: Two separable things. (a) Re-measure §10's table with the same estimator the gate uses and publish what it returns (0.14 / 0.19), or delete the table — as written it is the evidence for a fix that did not land. (b) Re-anchor the bar: add a flat-ground sprint-at-clamp control row 

## machine-rig-followup
- **gates** (machine-rig-followup) — pass=False score=62 serious=3
  - [major] A21-real-draw-calls still FAIL — the lane-owned deferred gate is 66 draws over and moved further from budget this round
    - fix: Take one of the two levers §6.2 already names and measures. Either add a texture-atlas bake for the watcher and behemoth donors to tools/bake-rigs.mjs (offline, so it costs no runtime), or give the watcher the plate-shell kitbash the other five got so its 19-mesh donor can be ret
  - [major] Components are still distance-retired at LOD tier 1 (>=6 body heights) with their hit hulls left behind — and §6.2 asserts the opposite
    - fix: Apply the same structural test to parts that the mesh trim now uses: drop the name regex (heart-plate/head-plate are canon weak points, hip-plate is armour), key eligibility on tearHp plus measured screen size, and start the part trim at tier 2 so nothing goes inside 14 body heig
  - [major] A45c-foot-continuity, the gate this round introduced as its own acceptance bar, fails 3 of 5 clean judge runs while the report claims PASS
    - fix: Re-derive the rate bound from what a converged plant actually costs (measured ceiling 2.23 m/s here) rather than from a 60 fps reading of the frame bound — e.g. keep <=0.12 m/frame as the primary assertion and set the rate to ~3 m/s, or make the rate term advisory and assert only
