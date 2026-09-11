# anim-core — the shared rig runtime (Round 4, `perf-tech-11`)

`src/entities/anim/**` is now one small library every rig in the game poses through.
It replaces three incompatible bone conventions and two wall-clock animation
schedulers with four modules and one audit.

| module | file | what it owns |
|---|---|---|
| `BoneSpace` | `anim/boneSpace.js` | the ONE rotation convention: `rotLocal` / `rotChar` / `rotWorld`, cached bind pair `(W, invW)`, exact live conversions, absolute writes |
| `RestPose` | `anim/restPose.js` | bind capture + restore, the clip-driven / reset split, the pure-clip-pose cache |
| `ClipLayer` / `ClipLayerSet` | `anim/clipLayer.js` | dt-driven, timeScale-safe layers: weights, crossfades, one-shots that restore on **mixer time**, scrubbed one-shots, a stuck-action detector |
| `RigDebug` | `anim/rigDebug.js` | skeleton overlay, per-bone probes, the canonical `debugFeet()`, gate samplers |
| `anim` | `anim/registry.js` | `__CTX__.anim` — `register()`, `audit()`, `selftest()` |

```js
import { BoneSpace, RestPose, ClipLayerSet, RigDebug } from './anim/index.js';
```

---

## 1. The convention, in one paragraph

For a bone with local quaternion `L` whose parent sits at orientation `P` in some
reference frame, the bone's orientation in that frame is `R = P·L`. To
**pre-multiply** a rotation `q` onto `R` — i.e. rotate the bone about an axis
expressed in that frame — it is enough to write

```
L' = L · R⁻¹ · q · R          ⟹      P·L' = q · R
```

So every rotation helper in the repo is the same operation at a different `R`:

| call | `R` | equal to the Round 3 code |
|---|---|---|
| `rotLocal(e, axis, a)` | identity | `gait.js` `rotX/rotY/rotZ`, species `_rot(bone,'x',a)` |
| `rotChar(e, axis, a, /*bind*/ true)` | cached bind `W` | `playerAnimator._rot` (cheap, exact near bind) |
| `rotChar(e, axis, a)` | live char orientation | `playerAnimator._rotL` (exact everywhere) |
| `rotWorld(e, axis, a)` | live world orientation | *(new — nobody had one)* |

Quaternion forms: `rotLocalQ`, `rotCharQ(e, q, bind?)`, `rotWorldQ`.
Absolute writes: `setCharQ(e, q)`, `setWorldQ(e, q)`.
Static frame math (two rigs at once, e.g. the retargeter): `BoneSpace.poseIn`,
`BoneSpace.setLocalFromFrame`.

**char space** = the character root frame (+Y up, +Z forward, metres) — the frame
the clip retargeter bakes in, so clips, IK and additive overlays all agree.

Entries are `{ name, bone, bindQ, bindP, W, invW, clip }`, deliberately
byte-compatible with `playerAnimator._entries`. `BoneSpace.adopt(entries, root)`
wraps an existing table with **zero** data conversion.

`__CTX__.anim.audit()` does not take any of this on trust: for every reachable
rig module it applies the module's own helper to a real bone, restores it,
applies BoneSpace's equivalent, and compares. Gate A26 requires the deltas to be
< 1e-5 rad. Today they measure **≤ 6e-8 rad** for `playerAnimator` and **0** for
the machine species — which is what makes each migration below a pure import
swap that cannot change a frame.

---

## 2. `src/entities/playerAnimator.js` — owner `player-anim`, Wave 2

Aloy's animator already *is* this convention; it just spells it privately.
Audit status: `import-swap`, verified identical.

**Step 1 — build the space from the table you already have.** In the
constructor, right after the `makeEntry` loop that fills `this._entries`:

```js
import { BoneSpace, RestPose, RigDebug } from './anim/index.js';
…
this.space = BoneSpace.adopt(this._entries, model);   // no copies, same objects
```

**Step 2 — delete the four private helpers and forward them.** Keep the method
names so the other ~200 call sites do not move:

```js
_rot (e, axis, angle) { this.space.rotChar (e, axis, angle, true);  }  // was invW·q·W
_rotQ(e, q)           { this.space.rotCharQ(e, q,           true);  }
_rotL(e, axis, angle) { this.space.rotChar (e, axis, angle, false); }  // live, exact
_rotQL(e, q)          { this.space.rotCharQ(e, q,           false); }
_liveW(bone, out)     { return this.space.charQ(bone, out);         }
_charOf(bone, out)    { return this.space.charPos(bone, out);       }
```

**Step 3 — `_invModelQ` becomes `syncFrame()`.** Replace the first line of
`update()`:

```js
- this._invModelQ.copy(this.model.quaternion).invert();
+ this.space.syncFrame();            // this.space.invFrameQ is the same value
```

(If anything still reads `this._invModelQ`, alias it: `get _invModelQ() { return this.space.invFrameQ; }`.)

**Step 4 — the three pose lists become one `RestPose`.** `_resetList`,
`_clipList` and the `clipQ` / `_clipP` caches are exactly what `RestPose`
provides:

```js
this.rest = new RestPose({ space: this.space, positions: true });
this.rest.markClipDriven(this.lib ? this.lib.animatedNames : []);
```

then in `update()`:

```js
this.rest.restoreNonClip();                  // was the _resetList loop
…
if (this.loco) {
  this.rest.applyClip();                     // was the _clipList copy from clipQ
  this.loco.update(dt, { … });
  this.mixer.update(dt);
  this.rest.snapshotClip();                  // was the copy back into clipQ
}
```

`RestPose` shares `bindQ` / `bindP` objects with the BoneSpace entries, so there
is one bind truth per rig and a `recapture()` on either side is seen by both.

**Step 5 — `debugFeet()` through `RigDebug`** (optional, but it is the shape
gates A6/A13/A45/A46 all read):

```js
this.dbg = new RigDebug({ space: this.space, label: 'aloy' });
debugFeet() {
  return this.dbg.feet([
    { name: KEY.ballL, planted: () => this._stL > 0.5 },
    { name: KEY.ballR, planted: () => this._stR > 0.5 },
  ]);
}
```

**Step 6 — declare it.** At the end of the constructor:

```js
import { register } from './anim/index.js';
register({ id: 'playerAnimator', file: 'src/entities/playerAnimator.js',
           owner: 'player-anim', rig: 'aloy', convention: 'BoneSpace',
           status: 'migrated', bones: this.space.size });
```

`audit()` then reports `playerAnimator` under `registered` and drops it from
`pendingMigration`. **Verify with `A26` + the existing `A2/A3/A11/A12/A13`.**
If A26 ever reports `DIVERGENT from BoneSpace`, an edit changed the algebra —
that is the regression detector, not a nuisance.

---

## 3. `gait.js` + the six pose-driven species — owner `machine-rig`, Wave 1

`watcher/strider/sawtooth/thunderjaw/scrapper/behemoth` and `GaitController`
all use **local-axis** rotation plus a `Map<Bone, Quaternion>` rest table.
Audit status: `pending`, convention verified identical to `rotLocal` (delta 0).

**Step 1 — one space per machine root**, built once in the species constructor
(or in `autorig.js` and hung off the rig object):

```js
import { BoneSpace, RestPose, RigDebug } from '../anim/index.js';
this.space = new BoneSpace(this.root, { all: true });   // captures every bone at bind
this.rest  = new RestPose({ space: this.space });       // rotations only
```

**Step 2 — the rest table.** Replace

```js
- const snap = (b) => { if (b && !this._rest.has(b)) this._rest.set(b, b.quaternion.clone()); };
- _resetPose() { for (const [b, q] of this._rest) b.quaternion.copy(q); }
+ _resetPose() { this.rest.restore(); }
```

and in `gait.js`

```js
- for (const [b, q] of rig.rest) b.quaternion.copy(q);
+ rig.rest.restore();
```

Existing `Map` tables can be adopted without re-capturing:
`RestPose.fromMap(this._rest)`.

**Step 3 — the rotations.**

```js
- _rot(bone, axis, angle) { _q.setFromAxisAngle(AXES[axis], angle); bone.quaternion.multiply(_q); }
+ _rot(bone, axis, angle) { this.space.rotLocal(bone, axis, angle); }   // 'x'|'y'|'z' still work
```

```js
- function rotX(b, a) { … b.quaternion.multiply(_q1); }
+ const rotX = (b, a) => space.rotLocal(b, 'x', a);
```

`BoneSpace.rotLocal` accepts a Bone directly (no entry needed) and a string
axis, so these are one-line swaps.

**Step 4 — what you gain immediately.** The IK in `_solveLeg` hand-rolls the
world-frame conversions; `space.setWorldQ(bone, q)` and `space.worldQ(bone, out)`
are the same math with names, and `space.rotChar(...)` gives the species files
the *body-relative* axis they have been faking with local axes — the thing
`machine-rig-02` (bone-space sockets) and `machine-rig-08` (limb keyframes)
actually need.

**Step 5 — `debugFeet()`.** `RigDebug.feet()` produces the exact shape A6/A45/A46
read, and `RigDebug.groundError(feet, terrain)` is the A46 measurement:

```js
this.dbg = new RigDebug({ space: this.space, label: kind });
debugFeet() {
  return this.dbg.feet(this.legs.map((leg) => ({
    name: leg.L.foot.name, yOffset: leg.L.ankleH,
    planted: () => !this.m.lowLOD && this.m.alive && leg.planted,
  })));
}
```

Then `register({ id: 'machines/gait', …, convention: 'BoneSpace', status: 'migrated' })`.

---

## 4. `glinthawk.js` + `longleg.js` — owner `machine-rig`, Wave 1 ⚠️ **A27b**

These two are the only mixer-driven species, and `glinthawk._oneShot` schedules
its restore on the **wall clock**:

```js
setTimeout(() => { a.fadeOut(0.3); idle.reset(); idle.fadeIn(0.3); … },
           (a.getClip().duration / (a.timeScale || 1)) * 1000);
```

`src/main.js` scales the whole simulation (`dt = rawDt * engine.timeScale`), and
the weapon wheel drops timeScale to 0.25 while Concentration drops it to 0.02.
Gate **A27b-timescale-safe-glinthawk** measures the consequence on the live
bird. It wraps `setTimeout` for the synchronous span of `_oneShot`, so the
evidence is the timer itself and not an inference: a **750 ms timer fires at
0.751 s wall while 3.1 % of the clip has animated — 32.5x early**. The attack is
yanked out mid-windup and left holding weight it cannot fade (the fade is
mixer-time) for the remaining 97 % of the clip.

A27b is a **machine-rig** gate and it reports **PENDING**, not PASS — anim-core
does not own this file and will not report someone else's open bug as green. It
turns **FAIL** the moment `this.layers` exists while a wall-clock timer is still
scheduled, or a migrated one-shot still restores before the clip has animated.
Migrating this file is what turns it green.

**The fix — `ClipLayerSet`:**

```js
import { ClipLayerSet } from '../anim/index.js';

// constructor: replace the this._act table
this.layers = new ClipLayerSet(this.mixer, { name: kind, owner: 'machine-rig' });
for (const clip of gltf.animations) {
  this.layers.add(clip.name, clip, { loop: clip.name === 'Idle' });
}
this.layers.base('Idle');
this._act = this.layers.layers;         // keep the old name if call sites read it

// _oneShot: the whole method
_oneShot(name, fade = 0.25) { this.layers.oneShot(name, { fade }); }

// animate(): replace mixer.update(dt)
this.layers.update(dt);                 // advances the layer clocks AND the mixer
```

`ClipLayer` counts down in the same dt the mixer is stepped with, so the restore
lands after exactly one clip duration of **animation** time at any timeScale, the
hand-back fade starts one fade-length before the end (the base layer is at full
weight the instant the shot expires), and `layers.stuck()` returns `[]` or names
the offender. Death poses use `hold` instead of another timer:

```js
this.layers.oneShot('Death', { fade: 0.2, hold: 3, restore: null });
```

For `longleg`'s procedural neck overlay, `neck.quaternion.multiply(q)` becomes
`space.rotLocal(neck, 'y', yaw)` (identical), and the scan sweep reads better in
char space: `space.rotChar(neckEntry, 'y', yaw)`.

Verify with **A27** and `A8-death-collapse`.

---

## 5. `ClipLayer` cheat-sheet

```js
const set = new ClipLayerSet(mixer, { name: 'sawtooth' });
const idle = set.add('Idle', idleClip, { loop: true, weight: 1 });
set.add('Bite', biteClip, { loop: false });
set.add('Flinch', flinchClip, { mode: 'additive' });   // clip auto-converted
set.base('Idle');

set.oneShot('Bite', { fade: 0.18 });        // restores to Idle on mixer time
set.get('Flinch').fadeIn(0.08);             // additive layer, fades in animation time
set.scrub('Death', deathT / deathDuration); // gameplay owns the timeline
set.update(dt);                             // dt already × engine.timeScale
set.audit();                                // { layers:[…], stuck:[…] }
```

- **Never** use `setTimeout`, `Date.now()` or `performance.now()` to schedule
  animation state. `ClipLayer.update(dt)` is the clock.
- `external: true` when an explicit blend tree owns the weights (that is how
  `locomotion.js` keeps its normalised weight tree while still routing every
  `.time` write and the stuck detector through `ClipLayer`).
- `scrubbed: true` forces `action.timeScale = 0`; the layer never free-runs.
- `holdEnd: true` for a layer that is *meant* to park on its last frame at full
  weight (a death pose). Without it a frozen scrub reads as a stall.

### 5.1 `setIntent` — required for external layers (FIX ROUND 1)

An external layer cannot judge its own weight: the value it reads back is the
value its owner just wrote, so `weight !== target` is vacuous there. The first
Round 4 drop therefore had `stuck()` return `null` for every external layer,
which made gate A27's `stuck.length === 0` clauses unfalsifiable. Fixed:

```js
set.get('roll').setIntent(dodging ? 1 : 0);   // the UN-DAMPED destination
```

`stuck()` now reports, for an external layer:

| why | condition |
|---|---|
| `weight … held …s after intent cleared` | `overstayT > settleTime` — the layer has *continuously* had `intent ≤ 0.02` while `weight > 0.02` for longer than `settleTime` (default 0.75 animation s, longer than any crossfade in the tree) |
| `scrubbed timeline frozen …s` | `stallT > stallLimit` (1.0 animation s) — a scrubbed layer whose `action.time` has not moved *while it was visible*, unless `holdEnd` and it is parked at the clip end |
| `one-shot overran` | `elapsed` past `(duration + hold) * 3 + 1` — applies to internal layers too |

Both clocks run on the dt the layer is stepped with, so they are animation
seconds: a 0.02 timeScale slows the detector exactly as much as it slows the
clip, and a slow-motion roll is never mistaken for a stall.

**FIX ROUND 2 — both clocks time the SYMPTOM, not the layer's history.** The
first version timed `intentT` (how long the intent *value* had been unchanged)
and accumulated `stallT` regardless of weight. Both are histories a parked
layer accrues for free, so the detector fired the instant such a layer came
back into the blend. On the live rig that made A27 order-dependent: rolling
from a standstill passed, and rolling out of a sprint — where every gait node's
intent drops to 0 while its weight is still 1, and `locomotion.js` normalizes
by the weight sum so the roll's ramp *divides those tails upward* — reported
`jog` and `sprint` stuck 20 ms into a legal crossfade. It passed alone and
failed in the full suite. `overstayT` resets whenever the weight drops or the
intent returns, and `stallT` resets whenever the layer is not visible, so
neither can be pre-charged. A27 now dodges out of a sprint on purpose, and
`stuckDetectorSelfTest` case `longParkedThenBriefWeight` is the regression:
a layer parked at intent 0 for 3 s, then given weight for 0.2 s, must stay
silent.

`anim.stuckDetectorSelfTest()` drives an external layer into every one of those
states *and* through the healthy states next door (mid-fade-out, recovery, a
`holdEnd` death pose) and fails if any verdict is wrong. It runs inside
`anim.selftest()`, and A27 additionally forces the **live** Aloy roll layer into
two stuck states and checks the detector reports them before it is allowed to
read anything into an empty list.

## 6. Gates

| gate | lane | asserts |
|---|---|---|
| `A26-one-convention` | anim-core | all five modules exist, the algebra self-test is exact, **zero KNOWN_MODULES rows are `legacy`** (that status comes from a live probe, not self-declaration), every Aloy path is BoneSpace, `playerAnimator`'s private helpers are numerically identical to BoneSpace on the live rig, **and `machines.ok`** — a divergent machine rig or a species claiming `ClipLayerSet` while a wall-clock restore is still in its source FAILS this gate |
| `A27-timescale-safe` | anim-core | the `ClipLayer` + stuck-detector headless proofs at timeScale 0.02, the live falsifiability check on the Aloy roll layer, then the live roll one-shot under a pinned 0.02 timeScale — **entered from a full sprint** (8.2 m/s, `sprint` weight 1.0 at the dodge), because rolling from a standstill does not exercise the blend-normalisation path that made this gate order-dependent. Resolves on animation time, hands back, leaves nothing stuck. A NaN player during the slow-motion roll FAILS the gate and names the owning lane; it is not repaired into a pass |
| `A27b-timescale-safe-glinthawk` | **machine-rig** | §4's literal subject, standing alone so it can never be read as fixed. It wraps `setTimeout` for the span of `_oneShot` and records the wall-clock moment the restore fires. **PENDING** while glinthawk has not migrated (measured: a 750 ms timer fires at 0.751 s wall with 3.1 % of the clip animated — **32.5x early**). **FAIL** the moment `ClipLayerSet` is wired up but a wall-clock timer is still scheduled, or the migrated one-shot still restores early. **PASS** only when it advances and hands back on mixer time |

Run: `node tools/gates.mjs --port <PORT> --lane anim-core`, and
`--only A27b-timescale-safe-glinthawk` for the machine-rig handoff
(gates live in `tools/gates.round4.anim-core.mjs`; the runner merges every
`tools/gates.round4.*.mjs`).

## 7. Published API for other lanes

- `__CTX__.anim` — `{ BoneSpace, RestPose, ClipLayer, ClipLayerSet, RigDebug, register, audit, selftest }`
- `__CTX__.anim.audit()` — the A26 payload: per-module convention, verified
  equivalence deltas, `legacyModules` (live-probed divergence — the regression
  detector), `selfDeclaredForeign` (voluntary registrations only; a diagnostic,
  never a bar), `aloy.ok`, `machines.ok`, and pending migrations with owners
  and recipes
- `__CTX__.anim.selftest(timeScale)` — headless algebra + ClipLayer +
  stuck-detector + rig proofs
- `__CTX__.anim.debug(target)` — a cached `RigDebug` for a rig, resolved by
  name so a gate or a console never has to own the rig's file. `target` is
  `'aloy'` (default), a machine `kind` (`'watcher'`, `'thunderjaw'`, …), a
  machine instance, an `Object3D` root, or a `BoneSpace`. The Aloy debugger
  adopts `playerAnimator._entries` and its live frame inverse, so `probe()`
  carries `bind`, `char`, `world` and `deltaDeg`. Cold path — never per frame.

  ```js
  __CTX__.anim.debug('aloy').probe('head_0104')          // 3-space bone probe
  __CTX__.anim.debug('watcher').report()                 // bones / entries
  const f = __CTX__.anim.debug('aloy').feet([            // canonical debugFeet
    { name: 'ball_l_0190', planted: () => loco.stanceL > 0.5 },
    { name: 'ball_r_0216', planted: () => loco.stanceR > 0.5 },
  ]);
  __CTX__.anim.RigDebug.groundError(f, __CTX__.terrain); // A6 / A46 payload
  ```
- `__CTX__.anim.overlay(target, on)` — skeleton overlay on the live
  `ctx.scene`, for film. `anim.clearDebuggers()` drops every cached debugger
  and its helper (call it on rig respawn / scene teardown).
- `__CTX__.anim.stuckDetectorSelfTest(timeScale)` — the falsifiability proof on
  its own
- `ClipLayer.setIntent(v)` — **machine-rig / player-anim**: call it on every
  externally-weighted layer each frame, or that layer's stuck detection is
  limited to its timeline
- `anim.attach(ctx)` — **core-platform**: one line in `src/main.js`
  (`ctx.anim = anim.attach(ctx)`) replaces the `window.__CTX__` setter
  interceptor `registry.js` currently uses to publish without editing `main.js`.
