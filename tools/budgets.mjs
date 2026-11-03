/**
 * ONE budget file (perf-tech-02). Every performance gate reads its numbers
 * from here; nothing hard-codes a threshold in a gate body. Run it directly
 * (`npm run budgets`) to print the contract.
 *
 * Where the numbers come from — measured on the Round 3 build, spawn vista,
 * 1600x900, `renderer.info.autoReset = false` accumulated per frame:
 *
 *   draw calls          464   (241 of them the shadow pass, 223 everything else)
 *   triangles           6.33 M
 *   p95 frame @ DPR 2   18.5 ms on an idle box, 31+ ms with two other GPU
 *                       clients on the same machine
 *
 * The Round 4 targets below are what the audit's §4 A21 spec asks for. The
 * draw-call budget is the hard one: it is exact, deterministic and completely
 * independent of what else the machine is doing.
 *
 * FIX ROUND 1 — four corrections that cost the previous round its credibility.
 *
 * 1. WHERE THE FRAME GOES. The Round 4 build's post stack costs ~8 ms of GPU
 *    at applied DPR 1.5 (GTAO 2.8, SMAA 1.3, grade 0.8, bloom ~0, the rest is
 *    half-float bandwidth), measured with `engine.enableGpuTimer(true)` +
 *    `perfSnapshot().medianGpuMs`: everything-on 20.5 ms, post-off 12.6 ms.
 *    An earlier report claimed "<= 1 ms" from an A/B of rAF intervals. That
 *    number is wrong and nobody should plan against it: rAF deltas are
 *    vsync-quantised to 16.7 / 33.3 ms and cannot resolve an 8 ms difference.
 *    Downstream consequence: `world-light` has ~12 ms of the 20 ms frame to
 *    spend on CSM + fog, NOT ~19.
 *
 * 2. WHAT THE SCENARIOS MEASURE. They used to teleport the camera and sample
 *    whatever the AI had left in frame, which put +-30 % of drift on every
 *    number in A21 (the same scenario read 456 / 341 / 295 calls in one run).
 *    Each scenario now PLACES its cast at fixed world offsets and returns a
 *    pin closure that re-asserts those transforms after every render, so the
 *    composition is frozen while gait, skinning and the cull pass keep running
 *    at full cost. Filmed to prove the framing is what the name says:
 *    `shots/perf-spawn-vista.png`, `shots/perf-west-herd.png`,
 *    `shots/perf-staged-fight.png` — the west herd measurement really does
 *    look at eight machines between 9 and 45 m.
 *
 * 3. THE PIXEL COUNT HAS TO BE THE ONE ON THE LABEL. Dynamic resolution
 *    multiplies `basePixelRatio` by `renderScale`, so a burst labelled
 *    "DPR 1.5" could be sampling 1.05 under load with nothing in the output
 *    saying so. A21 now calls `engine.setDynamicResolution(false)` for the
 *    whole gate and reports `effectivePixelRatio` from the renderer itself.
 *    The engine half of the same bug was worse and is fixed in engine.js: the
 *    screen-space size cull measured projected size against the DRS-scaled
 *    drawing buffer, so a busy frame quietly deleted machine parts and made
 *    the draw-call count depend on GPU load. It reads the base resolution now.
 *
 * 4. A WALL CLOCK ONLY MEANS SOMETHING ON A BOX THAT CAN PRESENT A FRAME.
 *    A21 measures a NULL FRAME after every scenario — scene hidden, no post,
 *    no shadows, DPR 0.5, i.e. a clear and a present — and uses the worst of
 *    them. rAF is vsync-locked, so a healthy null frame reads ~16.7 ms; if it
 *    reads materially more, or the GPU timer still reports milliseconds with
 *    nothing drawn, another process owns the GPU and no wall-clock number from
 *    that run is attributable.
 *
 *    AN UNJUDGED TERM IS PENDING, NEVER PASS (fix round 2). When the clock
 *    terms are excluded the gate reports every frame/JS number exactly as
 *    measured, flags `clockTermsCounted: false`, and resolves `pass: null` —
 *    PENDING — so it can never read green on a term it did not judge. A red
 *    DETERMINISTIC term still FAILs on the spot: counters do not care how busy
 *    the box is, and they are the terms that are currently red. `A9-perf-budget`
 *    follows the same rule for its fps half.
 *
 *    The GPU timer is the one clock that can resolve what rAF quantises away,
 *    so it VOTES — but only when it witnesses itself: every per-scenario null
 *    frame under 3 ms AND the four bursts of one frozen composition agreeing
 *    within 1.4x. It measures elapsed time on the GPU TIMELINE, so it is
 *    inflated when our stream queues behind another client's (measured on this
 *    box: 42.8 then 70.8 ms for one identical configuration).
 *
 * WHO OWES THE DEFICIT. Staged west herd at applied DPR 1.5: ~480 calls
 * against a 350 budget. The gate now prints the exact per-owner ledger, taken
 * by wrapping `renderer.renderBufferDirect` (main pass vs shadow pass vs post,
 * bucketed by scene owner) — no estimates. It also prints `batchCeiling`: the
 * best a renderer-side BatchedMesh pass could ever do, computed from the live
 * scene by grouping every rigid, opaque, single-material mesh by material
 * SIGNATURE. Measured on this build: 396 machine meshes, 136 of them skinned
 * (unbatchable), 26 transparent, and the 234 rigid ones carry 58 distinct
 * signatures — so a perfect engine-side batch saves ~176 draws world-wide but
 * leaves the west herd over budget, because the herd's own cost is dominated
 * by skinned meshes with near-unique materials. The remedy is `machine-rig`
 * perf-tech-04 (offline LOD chains + skinned bounds) and perf-tech-14
 * (per-species mesh/material budgets). Until it lands, A21's call term stays
 * RED against core-platform's ledger and the gate names the owner in
 * `detail.blockedBy`.
 *
 * NOTHING IN THIS FILE MOVES TO MAKE A GATE GREEN.
 */

import { ROSTER } from './gate-roster.mjs';
import { PLACES } from './gate-places.mjs';

export const BUDGETS = {
  /** Accumulated renderer.info.render.calls for one full frame (all passes). */
  drawCalls: 350,
  /** Accumulated triangles for one full frame. */
  triangles: 6_500_000,
  /** p95 of the rAF frame interval, milliseconds. */
  frameP95Ms: 20,
  /**
   * Median scene GPU time (EXT_disjoint_timer_query), milliseconds, at the shipped default tier
   * (plan §9 A21 re-cast: "median GPU <= 14 ms at the A-gpu-tier tier"; engine-gpu's W0b
   * A-gpu-tier chooses that tier). Round 4 graded the GPU term against frameP95Ms (20 ms).
   */
  gpuMedianMs: 14,
  /**
   * p95 of the JS half of the frame, milliseconds. "Half of the frame" means
   * the WHOLE main-loop callback: every system update in every fixed sub-step,
   * every `interpolate()`, the render submit and the frame tail. Round 4 judge
   * finding — A21 used to read `engine.render()`'s return value here, which is
   * the submit alone, so the systems this budget exists to bound were not in
   * the number. `engine.perfSnapshot().jsTerm` declares the coverage and A21
   * refuses to grade the term without it. The budget itself never moved.
   */
  jsP95Ms: 9,
  /** Frames sampled per burst, and bursts per measurement. */
  sampleFrames: 40,
  bursts: 4,
  /**
   * The gate measures on a simulated devicePixelRatio-2 display. The engine's
   * quality tier caps the applied pixel ratio (high = 1.5) — that cap IS the
   * perf-tech-05 fix, so the gate exercises it rather than bypassing it. The
   * raw uncapped DPR-2 numbers are reported alongside for the record, measured
   * from the SAME pinned scene rather than a minute later.
   */
  deviceDpr: 2,
  /** Shadow caster cull distance per tier, metres (perf-tech-03). */
  shadowCullDistance: { low: 70, medium: 95, high: 120, ultra: 190 },
  /** Programs compiled behind the loading bar (perf-tech-10). */
  warmUpMaxMs: 4000,
};

/**
 * engine-gpu's MEASURED render-target ledger (plan §9 `A-rt-ledger`: "bytes per target recorded in
 * docs/ROUND5-ENGINE.md and tools/budgets.mjs"). Recorded here by re-export from engine-gpu's leaf
 * module (no imports, so no cycle with the lane files that import this one); never copied by hand.
 */
export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';

/**
 * ROUND 5 W0b memory budgets (gates-perf: `A-alloc-rate`, `A-vram-ledger`, `A90-abs`,
 * `A-unattributed-cap`; plan §4.2, §4.4, §9). The numbers are the plan's, verbatim; the windows and
 * durations are the method. Units: 1 KB = 1024 B for allocation rates; 1 MB = 1e6 B and 1 GB = 1e9 B
 * for memory (the A-rt-ledger convention).
 */
export const MEMORY_BUDGETS = Object.freeze({
  /**
   * A-alloc-rate: steady-state allocation attributed to src/** (sampling heap profiler). W0b fix round 1: the
   * attribution GRADED is the CALLER one — every allocated byte whose stack holds a src/** frame counts against the
   * NEAREST src/** frame (a `new THREE.Vector3()`, a `.clone()`, an `Array.prototype.push` or a three.js renderer
   * internal made on src's behalf is src's allocation), for the total and for the per-function bar. No allowance:
   * the empty-frame renderer floor is measured and REPORTED by the gate (scene hidden, same page); an allowance
   * for it would be an orchestrator ruling recorded here with its measurement, and none is recorded.
   */
  alloc: Object.freeze({ srcKBps: 64, fnKBps: 4, heapSlopeBps: 0, windowS: 10, warmupS: 3, samplingIntervalB: 2048, refFps: 60,
    attribution: 'caller', emptyFrameS: 5,
    /**
     * W0b fix round 3 (plan §8.3 R46, R48 (b) and (c)). A-alloc-rate is graded at gates-perf's exit as an INSTRUMENT
     * (sealed run, every byte attributed to a named owner, planted-allocator self-test, over-bar owners routed with
     * file:line). At the orchestrator's W0b global run (port 5270) its per-owner numbers are RECORDED as the baseline
     * (`CAL_ALLOC_RECORD_BASELINE=1` writes `baselineFile` from one run, `=merge` adds a further run, keeping per owner
     * the larger number; the orchestrator commits the file); from then on no owner may
     * exceed its baseline by more than `baselineGuard` (x 1.10) at a wave exit. (Fix round 3 read this as BOTH its
     * KB per frame and its KB/s exceeding 1.10 x the baseline's, on the argument that a louder box raises one of the two for frame-driven or
     * time-driven code; a real regression raises both). TARGETED FIX ROUND 1 (engineering + gate judges: requiring both
     * is looser than R48 c's "no owner may exceed its baseline by more than 10 %"): an owner now exceeds it when EITHER its
     * KB per frame OR its KB/s exceeds 1.10 x the baseline's. The absolute bars (srcKBps for all of src/**, fnKBps per
     * function) bind each owner from the wave in `owners[].barsFrom`: R48 c's schedule ("the first exit at which a lane
     * holds that file"), one row per holding lane and wave (plan §2 rows, §6, §1.2 grants), `cls: 'held'`. An owner with
     * `barsFrom: null` is ONLY one of two classes (targeted fix round 1; A-alloc-rate's schedule self-test checks it):
     *   cls 'frozen'             plan §1.1 frozen files, and the kept files a W0 lane touched only through a §1.2 grant
     *                            (-> §11 W1 perf-hygiene grant; R46's carried classes (a)-(c));
     *   cls 'no-lane-after-W0b'  engine.js (-> §11 engine follow-up grant at W1 launch, R48 c) and the other files that,
     *                            like engine.js, no §2 row holds after W0b (pipeline's assets.js, hero-body's anim/rigs/**,
     *                            instruments-core's instruments/{lamps,roles,registry}.js and lib/**).
     * Both are graded by the baseline guard only. The srcKBps total binds once no src owner is left with barsFrom null.
     * Owners are matched in order (first match wins); a src file no row matches is owner `other-src` (orchestrator).
     */
    baselineGuard: 1.10,
    baselineFile: 'tools/gates/alloc-baseline.json',
    /** the planted allocator (self-test): bytes it must recover within this fraction of the independent heap-delta size */
    controlTolerance: 0.15, controlWindowS: 6,
    owners: Object.freeze([
      /*
       * W0b targeted fix round 1 (engineering-judge finding: whole directories that lanes hold from W1-W3 had
       * barsFrom null, so the 4 KB/s bar never bound there). Each row is ONE holding lane and the first wave exit after the
       * W0b baseline at which that lane holds the files (plan §2 rows, §1.2 grants; R48 c "the first exit at which a lane
       * holds that file"). barsFrom null is kept ONLY for (a) the frozen kept files (plan §1.1, and kept files touched at W0
       * only through a §1.2 grant: cls 'frozen') and (b) engine.js and the other files no lane holds after W0b (cls
       * 'no-lane-after-W0b': R48 c routes engine.js to the §11 engine follow-up grant); both are graded by the baseline
       * guard. First match wins, so the narrower rows come first.
       */
      // world-ground W1 (plan §2: world/{terrain,vegetation,water}.js, world/island/**, world/datum/**)
      { id: 'terrain', files: '^/src/world/terrain\\.js$', lane: 'world-ground', cls: 'held', barsFrom: 'W1', ruling: 'R48 (c): noise2D / getHeight' },
      { id: 'world-ground', files: '^/src/world/(vegetation|water)\\.js$|^/src/world/(island|datum)/', lane: 'world-ground', cls: 'held', barsFrom: 'W1', ruling: 'plan §2 world-ground (W1-W4)' },
      // world-sky W1 (environment.js)
      { id: 'world-sky', files: '^/src/world/environment\\.js$', lane: 'world-sky', cls: 'held', barsFrom: 'W1', ruling: 'plan §2 world-sky (W1, W4)' },
      // melee W1: playerAnimator.js (R48 c), anim/{meleeLayer,clipMelee,castLayer}.js, combat/{melee,lanceStow}.js
      { id: 'playerAnimator', files: '^/src/entities/playerAnimator\\.js$', lane: 'melee (hero-body until W1)', cls: 'held', barsFrom: 'W1', ruling: 'R48 (c): _springs' },
      { id: 'melee', files: '^/src/entities/anim/(meleeLayer|clipMelee|castLayer)\\.js$|^/src/combat/(melee|lanceStow)\\.js$', lane: 'melee', cls: 'held', barsFrom: 'W1', ruling: 'plan §2 melee (W1, W2)' },
      // world-props W1: fauna.js (R48 c), props.js, props/** except settlement.js / npcs.js (settlements'), sites/**
      { id: 'fauna', files: '^/src/world/fauna\\.js$', lane: 'world-props', cls: 'held', barsFrom: 'W1', ruling: 'R48 (c)' },
      { id: 'settlements', files: '^/src/world/(camp\\.js$|npc/|settlements/)|^/src/world/props/(settlement|npcs)\\.js$', lane: 'settlements', cls: 'held', barsFrom: 'W2', ruling: 'R48 (c); plan §2 settlements (W2, W4)' },
      { id: 'world-props', files: '^/src/world/props\\.js$|^/src/world/props/|^/src/world/sites/', lane: 'world-props', cls: 'held', barsFrom: 'W1', ruling: 'plan §2 world-props (W1, W3, W4)' },
      // frozen UI engines (plan §1.1): no lane holds them
      { id: 'frozen-ui-engines', files: '^/src/ui/dialogue\\.js$|^/src/items/(interactables|inventory)\\.js$|^/src/audio/(bank|buses|clock|music|probe|spatial|zones)\\.js$|^/src/combat/particles\\.js$', lane: 'FROZEN UI engines (plan §1.1): §11 W1 perf-hygiene grant', barsFrom: null, cls: 'frozen', ruling: 'plan §1.1 (frozen)' },
      // armory W1: combat/{bow,weapons,arrows,combat}.js, src/hero/** (from W1 day 1)
      { id: 'armory', files: '^/src/combat/(bow|weapons|arrows|combat)\\.js$|^/src/hero/', lane: 'armory', cls: 'held', barsFrom: 'W1', ruling: 'plan §2 armory (W1, W3)' },
      // progression W3: core/{progression,save}.js, ui/{quests,skills}.js, items/{datapoints,fieldbooks}.js
      { id: 'progression', files: '^/src/core/(progression|save)\\.js$|^/src/ui/(quests|skills)\\.js$|^/src/items/(datapoints|fieldbooks)\\.js$', lane: 'progression', cls: 'held', barsFrom: 'W3', ruling: 'plan §2 progression (W3)' },
      // combat-kit W2: the rest of combat/** and items/**, ui/wheel.js
      { id: 'combat-kit', files: '^/src/combat/|^/src/items/|^/src/ui/wheel\\.js$', lane: 'combat-kit', cls: 'held', barsFrom: 'W2', ruling: 'plan §2 combat-kit (W2)' },
      // shell-ui W2 (R48 c): the rest of ui/**
      { id: 'shell-ui', files: '^/src/ui/', lane: 'shell-ui', cls: 'held', barsFrom: 'W2', ruling: 'R48 (c)' },
      // audio W3 (R48 c): the rest of audio/** (audio.js, manifest.js)
      { id: 'audio', files: '^/src/audio/', lane: 'audio', cls: 'held', barsFrom: 'W3', ruling: 'R48 (c)' },
      // the Instrument kinds, by the lane that builds each (plan §2 instruments-a..d); src/instruments/lib/{tether,followLeader}.js with theirs
      { id: 'instruments-a', files: '^/src/instruments/kinds/(tiller|plumb|peg)', lane: 'instruments-a', cls: 'held', barsFrom: 'W1', ruling: 'plan §2 instruments-a (W1); A-alloc-machines grades per frame owner (R46)' },
      { id: 'instruments-b', files: '^/src/instruments/kinds/(sickle|screed|gauge)', lane: 'instruments-b', cls: 'held', barsFrom: 'W2', ruling: 'plan §2 instruments-b (W2)' },
      { id: 'instruments-c', files: '^/src/instruments/kinds/(spindle|kiln|davit|sonde)|^/src/instruments/lib/tether\\.js$', lane: 'instruments-c', cls: 'held', barsFrom: 'W3', ruling: 'plan §2 instruments-c (W3)' },
      { id: 'instruments-d', files: '^/src/instruments/kinds/(dredge|transit)|^/src/instruments/lib/followLeader\\.js$', lane: 'instruments-d', cls: 'held', barsFrom: 'W4', ruling: 'plan §2 instruments-d (W4)' },
      // brand W4: src/studio/**
      { id: 'studio', files: '^/src/studio/', lane: 'brand', cls: 'held', barsFrom: 'W4', ruling: 'plan §2 brand (W4: src/studio/**)' },
      // ---- barsFrom null: ONLY (1) frozen / kept files (plan §1.1, and the kept files a W0 lane touched only through a §1.2
      // grant) and (2) engine.js and the other files that, like engine.js, no lane holds after W0b (R48 c's own reason for
      // engine.js). Both are graded by the baseline guard; scheduleSelfTest() checks every null row carries one of the two. ----
      { id: 'engine', files: '^/src/core/engine\\.js$', lane: 'engine (no lane after W0b): §11 engine follow-up grant, assigned at W1 launch', barsFrom: null, cls: 'no-lane-after-W0b', ruling: 'R48 (c)' },
      { id: 'frame-loop', files: '^/src/main\\.js$', lane: 'FROZEN frame loop (main.js, plan §1.1 engine row): orchestrator', barsFrom: null, cls: 'frozen', ruling: 'plan §1.1' },
      { id: 'frozen-spatial', files: '^/src/core/(collision|nav|hitHulls)\\.js$', lane: 'FROZEN kept movement: §11 W1 perf-hygiene grant (bit-identical outputs)', barsFrom: null, cls: 'frozen', ruling: 'plan §1.1; R48 (c), R46 (a)-(c)' },
      { id: 'frozen-control', files: '^/src/core/(input|events)\\.js$|^/src/entities/player\\.js$', lane: 'FROZEN control (plan §1.1: input.js, events.js, player.js outside the hero-body W0 grant; melee\'s W1 <= 15-line player.js grant re-grades it, R46): §11 W1 perf-hygiene grant', barsFrom: null, cls: 'frozen', ruling: 'plan §1.1, §1.2' },
      { id: 'frozen-rigging', files: '^/src/entities/anim/(boneSpace|restPose|clipLayer|retargeter|rigDebug|locomotion)\\.js$', lane: 'FROZEN kept rigging: §11 W1 perf-hygiene grant (bit-identical outputs)', barsFrom: null, cls: 'frozen', ruling: 'plan §1.1; R48 (c), R46 (a)-(c)' },
      { id: 'kept-anim', files: '^/src/entities/anim/(clipLibrary|boneMap|registry|index)\\.js$', lane: 'KEPT animation plumbing (hero-body edited it at W0b only through its §1.2 grant; no lane after W0b)', barsFrom: null, cls: 'frozen', ruling: 'plan §1.2 hero-body W0 grant' },
      { id: 'frozen-machine-rig', files: '^/src/entities/machines/(gait|autorig)\\.js$|^/src/entities/machines/rig/(?!(shells|rigs)-expansion\\.js$)', lane: 'FROZEN kept machine rig: §11 W1 perf-hygiene grant (bit-identical outputs)', barsFrom: null, cls: 'frozen', ruling: 'plan §1.1; R48 (c), R46 (a)-(c)' },
      { id: 'frozen-machine-ai', files: '^/src/entities/machines/ai/(index|emit|engage|reactions|rng|search|sites|squad|stimulus)\\.js$', lane: 'FROZEN machine AI engine (plan §1.1, after instruments-core W0)', barsFrom: null, cls: 'frozen', ruling: 'plan §1.1; R46 (a)-(c)' },
      { id: 'kept-machines', files: '^/src/entities/machines/(machine|index|variety-assets|parts)\\.js$|^/src/entities/machines/ai/(tables|doctrine|attacks|perception)\\.js$', lane: 'KEPT machine plumbing (instruments-core edited it at W0 only through its §1.2 grants; no lane after W0b; A-alloc-machines grades per frame owner, R46)', barsFrom: null, cls: 'frozen', ruling: 'plan §1.2 instruments-core W0 grants; R46' },
      // instruments-b W2 exit (plan §6 W2-exit row, §1.2 deletion grant; R46 d): every file directly under machines/ that no
      // kept row above names (the legacy species files and legacy.js; no kind is named here: A-gate-preludes) and the two
      // expansion shells. A bar binding at that exit grades any of them that survives it.
      { id: 'legacy-species', files: '^/src/entities/machines/[^/]+\\.js$|^/src/entities/machines/rig/(shells|rigs)-expansion\\.js$', lane: 'instruments-b (deletes them at the W2 exit, plan §6; R46 d)', barsFrom: 'W2', cls: 'held', ruling: 'plan §6 W2-exit row; R46 (d)' },
      { id: 'hero-rigs', files: '^/src/entities/anim/', lane: 'hero-body (W0b only: anim/rigs/** and any other anim file it created): no lane after W0b', barsFrom: null, cls: 'no-lane-after-W0b', ruling: 'plan §2 hero-body (W0b)' },
      { id: 'instruments-core', files: '^/src/entities/machines/|^/src/instruments/', lane: 'instruments-core (W0a, W0b: instruments/{lamps,roles,registry}.js, instruments/lib/**, legacy-free machine files): no lane after W0b; A-alloc-machines grades per frame owner (R46)', barsFrom: null, cls: 'no-lane-after-W0b', ruling: 'plan §2 instruments-core (W0a, W0b); R46' },
      { id: 'pipeline', files: '^/src/core/assets(\\.specs)?\\.js$', lane: 'pipeline (W0a, W0b): no lane after W0b', barsFrom: null, cls: 'no-lane-after-W0b', ruling: 'plan §2 pipeline (W0a, W0b)' },
    ].map(Object.freeze)) }),
  /** A-vram-ledger: plan §4.4 — textures <= 160, render targets <= the A-rt-ledger cap 170, geometry <= 120, total <= 450 MB */
  vram: Object.freeze({ texturesB: 160e6, renderTargetsB: 170e6, geometryB: 120e6, totalB: 450e6 }),
  /** A90-abs: post-GC JS heap <= 450 MB, Chrome GPU-process footprint <= 1.5 GB at the staged fight (60 s after the A90 workload) */
  abs: Object.freeze({ heapB: 450e6, gpuProcessB: 1.5e9, fightS: 60, a90LoopS: 150, a90LifecycleS: 150, minKills: 25 }),
  /**
   * A-unattributed-cap: draws from scene children with no registered owner (tools/gates/gates-perf.w0b.mjs
   * DRAW_OWNERS) — the cap is the W0 MEASUREMENT (plan §4.2: "measured at W0, capped <= 30 by W2"); every later
   * wave must measure <= it, and <= 30 from the W2 exit. Recorded once from the first W0b measurement BY THE DIRECT
   * per-draw count (every renderBufferDirect call of 8 frames bucketed by its scene root): 5 draws, the five unnamed
   * instanced particle quads of src/combat/particles.js (frozen; named -> registered by whoever holds its grant).
   * 335 draws in that frame, post chain 22. The two hide methods did NOT agree with it: hide-the-unregistered-roots
   * read 6, and hide-each-owner read 5 / 3 / 0 on the same build (each owner's hide delta overshot its direct count
   * by about one draw, so their sum under-counted the remainder; judge finding, W0b fix round 1). The gate grades
   * the direct count and requires the hide methods, measured as paired with/without readings, to agree with it
   * within +-1 draw per owner, else PENDING with the disagreement named.
   */
  unattributed: Object.freeze({ w2Bar: 30, w0Cap: Object.freeze({ draws: 5,
    measured: '2026-10-22, gates-perf port 5255, staged fight (8 x herd/Tiller fixture, R18 fallbacks named), tier high, pixel ratio 1.5, 1600x900' }) }),
});

/**
 * Page-context staging kit shared by every perf scenario (and available to any
 * other gate that needs a reproducible scene). Injected once before the
 * scenario expressions are eval'd.
 *
 * The important piece is `pinAll()`: it freezes the COMPOSITION, not the
 * simulation. Machine positions/headings and the camera are re-asserted in an
 * `engine.onAfterRender` hook, so the AI cannot walk the scene out from under a
 * measurement burst, while animation, skinning, the shadow-caster cull and the
 * screen-space cull all keep running at their true cost. It returns an unpin
 * function; every caller must call it.
 *
 * SELF-CONTAINED (plan §8.3 R34, W0b fix round 1). engine-gpu's gates (A-terrain-1024-probe, A-rt-ledger-census,
 * A-rt-ledger) eval PERF_SCENARIOS with STAGE_PRELUDE ALONE, so the prelude now carries its own role and place
 * resolution: the gate-roster prelude (KIND, ROLE_NOTE, roleSkip) and the gate-places prelude (PLACE, placeSkip,
 * standAt) are spliced INSIDE the __stage closure and published on it (`__stage.KIND`, `__stage.PLACE(name)`,
 * `__stage.standAt(p, name)`), and the scenarios read them only from there. Nothing is declared at the caller's top
 * level except `__stage`, so a gate that also splices ROSTER / PLACES for itself (A21, the W0b rows) does not
 * collide. Splice it inside an `async` body: it awaits the roster's bounded wait for the deferred Instrument kinds
 * (<= 25 s) and the places prelude's import of sites.js. Self-test: `A-perf-scenarios-self-contained`
 * (tools/gates/gates-perf.w0b.mjs) evals every scenario in a scope that holds STAGE_PRELUDE and nothing else.
 */
export const STAGE_PRELUDE = `
  const __stage = await (async () => {
    ${ROSTER}
    ${PLACES}
    const ctx = __CTX__;
    // every living machine of the WORLD (reset, pin; the scenario casts are role-staged through pick/fill below)
    const machines = () => (/* r5-all-machines: census */ ctx.machines?.list || []).filter((m) => m.alive);
    const groundY = (x, z) => {
      const y = ctx.terrain?.getHeight?.(x, z);
      return Number.isFinite(y) ? y : 0;
    };
    /** Every machine back on its spawn point, calm, with a fixed heading. */
    const resetAll = () => {
      machines().forEach((m, i) => {
        if (m.spawnPos) m.position.set(m.spawnPos.x, m.spawnPos.y, m.spawnPos.z);
        m.position.y = groundY(m.position.x, m.position.z);
        m.heading = (i * 0.61) % (Math.PI * 2);
        // Do NOT null lastKnown: a kind's attack update may copy it unconditionally
        // once the machine is in attack (Round 4's sentry did), and a null there throws inside
        // Machines.update every frame (the guarded loop survives it, but a
        // throwing update is not a scene worth measuring). Reported to
        // machine-ai as a missing null guard.
        try { m.state = 'patrol'; m.suspicion = 0; } catch (e) { /* machine-ai owns these */ }
      });
    };
    /** Spawn order is fixed by the world seed, so slice(0, n) is stable. */
    const pick = (kind, n) => machines().filter((m) => m.kind === kind).slice(0, n);
    const place = (m, x, z, heading) => {
      m.position.set(x, groundY(x, z), z);
      m.heading = heading;
      try { m._speed = 0; } catch (e) { /* optional */ }
    };
    const lookAt = (x, z) => {
      const p = ctx.player;
      p.camYaw = Math.atan2(x - p.position.x, z - p.position.z) + Math.PI;
    };
    const pinAll = () => {
      const snap = machines().map((m) => ({
        m, x: m.position.x, y: m.position.y, z: m.position.z, h: m.heading,
      }));
      const p = ctx.player;
      const pp = { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.camYaw, pitch: p.camPitch };
      const fn = () => {
        for (let i = 0; i < snap.length; i++) {
          const s = snap[i];
          s.m.position.set(s.x, s.y, s.z);
          s.m.heading = s.h;
        }
        p.position.set(pp.x, pp.y, pp.z);
        p.camYaw = pp.yaw;
        p.camPitch = pp.pitch;
      };
      ctx.engine.onAfterRender.push(fn);
      return () => {
        const i = ctx.engine.onAfterRender.indexOf(fn);
        if (i >= 0) ctx.engine.onAfterRender.splice(i, 1);
      };
    };
    /**
     * R5: turn [[role, n], ...] into a per-role kind plan. A role without a
     * kind borrows, in order, from the roles that have one, and says so.
     * Every role missing -> { skip } carrying the roster's named note.
     * KIND, ROLE_NOTE and roleSkip are this closure's own (the roster prelude spliced above, R34).
     */
    const castPlan = (want) => {
      const have = want.map(([r]) => r).filter((r) => KIND[r]);
      const pool = have.length ? have : Object.keys(KIND).filter((r) => KIND[r]);
      if (!pool.length) return { skip: roleSkip(...want.map(([r]) => r)).detail };
      const fallbacks = [];
      let k = 0;
      const rows = want.map(([role, n]) => {
        if (KIND[role]) return { role, kind: KIND[role], n };
        const from = pool[k++ % pool.length];
        fallbacks.push(role + ' -> ' + from + ' (' + KIND[from] + '): ' + (ROLE_NOTE[role].label || 'no kind'));
        return { role, kind: KIND[from], n };
      });
      return { rows, fallbacks };
    };
    /** The plan's machines: live ones first, the deficit spawned at (x, z). */
    const fill = (plan, x, z) => {
      const out = [];
      for (const row of plan.rows) {
        const got = machines().filter((m) => m.kind === row.kind && !out.includes(m)).slice(0, row.n);
        for (let i = got.length; i < row.n; i++) {
          let m = null;
          try { m = ctx.machines.spawn(row.kind, x + 3 * i, z + 3 * i); } catch (e) { m = null; }
          if (!m) break;
          got.push(m);
        }
        out.push(...got);
      }
      return out;
    };
    return { machines, resetAll, pick, place, lookAt, pinAll, groundY, castPlan, fill, casts: {},
      // R34: role and place resolution, published so a scenario needs nothing outside STAGE_PRELUDE
      KIND, ROLE_NOTE, roleSkip, PLACE, placeSkip, standAt, placesSource: PLACES_SOURCE };
  })();
`;

/**
 * Scenarios A21 walks. Each expression stages a fixed scene and evaluates to
 * the unpin function for it — `const unpin = eval(SC[name]); … ; unpin();` —
 * or, when its cast cannot be staged, to `{ skip: '<SKIP label>: <named note>' }`.
 *
 * ROUND 5 RE-CAST (gates-perf W0a, plan §9 `A21-real-draw-calls`): the cast is
 * by ROLE (`__stage.KIND.<role>`, tools/gate-roster.mjs) and the stage by PLACE
 * (`__stage.PLACE(name)` / `__stage.standAt()`, tools/gate-places.mjs), both
 * carried by STAGE_PRELUDE itself (R34): eval them in any async scope that holds
 * STAGE_PRELUDE, nothing else needed. No species, no coordinate.
 *   vista         the spawn vista (gatePlaces.spawnVista), whatever the world has in view
 *   herd          herd x6 + sentry x2 at gatePlaces.herdSite
 *   staged-fight  colossus, heavy, artillery, duelist, sentry, herd, flanker, spotter in a
 *                 forward arc at gatePlaces.fightGround
 * A role with no live kind is filled from the roles that have one, and every
 * substitution is NAMED in `__stage.casts[scenario].fallbacks` (R18); a
 * scenario whose roles ALL lack a kind is skipped with the R18/R28/R30 note.
 * Legacy kinds are never cast (R28). Missing instances are spawned for the
 * scenario (every gate runs on a fresh page, so nothing outlives the gate).
 */
export const PERF_SCENARIOS = {
  vista: `(() => {
    __stage.resetAll();
    const p = __CTX__.player;
    const s = __stage.standAt(p, 'spawnVista'); p.camPitch = s.pitch ?? 0.06;
    __stage.casts.vista = { cast: 'world as found', place: s.note || 'spawnVista' };
    return __stage.pinAll();
  })()`,

  herd: `(() => {
    // herd x6 + a sentry x2 escort at fixed offsets around gatePlaces.herdSite,
    // placed (not camera-only) so the AI cannot walk the scene out of frame.
    const want = [['herd', 6], ['sentry', 2]];
    const plan = __stage.castPlan(want);
    if (plan.skip) return plan;
    __stage.resetAll();
    const HC = __stage.PLACE('herdSite');
    const OFF = [[0, 0], [6.5, 3], [-5, 4.5], [3, -6], [-7.5, -3], [9, -7.5], [-11, 1.5], [12.5, 6]];
    const herd = __stage.fill(plan, HC.x, HC.z);
    herd.forEach((m, i) => {
      const o = OFF[i] || [0, 0];
      __stage.place(m, HC.x + o[0], HC.z + o[1], (i * 0.8) % (Math.PI * 2));
    });
    const p = __CTX__.player;
    p.position.set(HC.x + 24, 0, HC.z + 24); p.camPitch = 0.06; p._snapToGround?.();
    __stage.lookAt(HC.x, HC.z);
    __stage.casts.herd = { cast: herd.map((m) => m.kind), fallbacks: plan.fallbacks, place: HC.note || 'herdSite' };
    return __stage.pinAll();
  })()`,

  'staged-fight': `(() => {
    // Deterministic: staged on flat ground (gatePlaces.fightGround) so the
    // scenario cannot inherit whatever biome the previous one left us in, one
    // machine per fighting role in a fixed order, topped up from the roles that
    // have a kind (named), so it is the same eight on every run.
    //
    // FIX ROUND 1 (kept): a forward arc, +-38 degrees (the camera's horizontal
    // half-FOV at 55 deg vertical / 16:9 is 42 deg), 9-17 m out in two ranks, so
    // all eight are inside the frustum.
    const order = ['colossus', 'heavy', 'artillery', 'duelist', 'sentry', 'herd', 'flanker', 'spotter'];
    const plan = __stage.castPlan(order.map((r) => [r, 1]));
    if (plan.skip) return plan;
    __stage.resetAll();
    const p = __CTX__.player;
    const s = __stage.standAt(p, 'fightGround'); p.camPitch = s.pitch ?? 0.05;
    const cast = __stage.fill(plan, p.position.x, p.position.z);
    // camera forward for camYaw: (-sin, -cos) — see player.js _updateCamera
    const fx = -Math.sin(p.camYaw), fz = -Math.cos(p.camYaw);
    cast.slice(0, 8).forEach((m, i) => {
      const spread = (i - 3.5) / 3.5;                 // -1 .. 1 across the arc
      const a = Math.atan2(fx, fz) + spread * 0.66;   // +-38 degrees of forward
      const r = 9 + (i % 2) * 5.5 + (i % 4) * 1.1;    // two ranks, 9-17 m
      __stage.place(m, p.position.x + Math.sin(a) * r, p.position.z + Math.cos(a) * r, a + Math.PI);
      // A machine in the attack state reads lastKnown every frame; give it one.
      try {
        m.lastKnown = (m.lastKnown && m.lastKnown.copy) ? m.lastKnown.copy(p.position) : p.position.clone();
        m.state = 'attack'; m.alerted = true; m.suspicion = 1;
      } catch (e) { /* machine-ai owns these */ }
    });
    __stage.casts['staged-fight'] = { cast: cast.slice(0, 8).map((m) => m.kind), fallbacks: plan.fallbacks, place: s.note || 'fightGround' };
    return __stage.pinAll();
  })()`,
};

import { pathToFileURL } from 'url';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('CAL frame budgets (tools/budgets.mjs)\n');
  for (const [k, v] of Object.entries(BUDGETS)) {
    console.log(`  ${k.padEnd(20)} ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  }
  console.log(`\n  scenarios: ${Object.keys(PERF_SCENARIOS).join(', ')} (staged by role + place, pinned)`);
}
