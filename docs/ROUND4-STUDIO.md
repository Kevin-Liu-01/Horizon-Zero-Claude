# ROUND 4 — `studio` lane: photo mode

Owner: `studio`. Files: `src/studio/*` (`studio.js`, `pose.js`, `cast.js`, `post.js`,
`studio.css`) and `tools/gates.round4.studio.mjs`. No other file in the repo is touched.

Findings closed: `missing-systems-photo-mode`, `player-anim-17-studio-cannot-film-hit-death`,
`machine-rig-19` (studio freeze overwritten), `onboarding-loop-studio-cast-buttons`.

The Round 3 "Animation Studio" is promoted to a photo mode: **F10** from `playing`,
`paused`, `dead` or `victory`; **Esc** or F10 again to leave. Bring-up is already in
`main.js` (`ctx.studio = this._add(new Studio(ctx))`, constructed last so its camera write
and pose overlay are the final words before `engine.render()`).

---

## 1. What other lanes need to know

**Nothing is required of any other lane.** This lane consumes published contracts only:

| it calls | owned by | why |
|---|---|---|
| `engine.requestTimeScale('studio', v)` / `engine.timeScaleSources()` | `core-platform` | the ONLY time write in this lane (below) |
| `engine.composer.addPass()`, `engine.depthTexture` | `core-platform` | the photo pass is appended at runtime, never merged into the gameplay chain |
| `machine.forceState(name)` | `machine-ai` | cast panel states |
| `animator.space` / `animator.b` (anim-core `BoneSpace`) | `anim-core` + `player-anim` | gaze + eyelid overlay |
| `events.emit('player-damage' / 'player-land' / 'item-gained' / 'override-node')`, `player.dodge/jump/takeDamage/setCrouch` | `player-control`, `player-anim` | Aloy pose buttons |
| `terrain.getHeight`, `machines.spawn`, `machines.kinds` | `world-ground`, `machine-ai` | fly-cam floor, cast spawning |

Every one of those is called through `?.` and reported in the panel when absent — a lane
that has not landed yet degrades to a disabled button, never to a throw.

## 2. `ctx.studio` — published API

```js
ctx.studio.enter() / .exit() / .toggle()   // -> boolean; enter() refuses outside the 4 states
ctx.studio.setTimeScale(v)                 // 0..1, returns engine.timeScale
ctx.studio.playPose(id)                    // -> { ok, detail, handedState }  (ids: pose.js POSES)
ctx.studio.setCastState(id, { hold=true }) // -> { ok, detail, state }        (ids: cast.js CAST_STATES)
ctx.studio.setChromeHidden(on)             // hide/restore ALL non-studio chrome
ctx.studio.debug()                         // full state for gates / scripted shots
ctx.studio.lens                            // { dof, focus, autoFocus, aperture, nearRange,
                                           //   farRange, filter, filterAmt, grain, vignette,
                                           //   frameAspect, guides }
ctx.studio.pose                            // PoseDirector: .gaze .gazeYaw .gazePitch
                                           //   .expression .hideAloy .setHidden()
ctx.studio.cast                            // CastDirector: .target .locked .hold
                                           //   .setTarget() .cycle() .spawn() .release()
```

A scripted shot sets `studio._pos / _yaw / _pitch / _fov` and reads back through `debug()`;
`tools/gates.round4.studio.mjs` V79 is a worked example.

**No new events are emitted.** A photo mode that broadcast state changes would be
indistinguishable from gameplay to every listener; it stays a pure consumer.

## 3. The four things that were actually broken

**Time (`machine-rig-19`, gate A79).** `_applyTimeScale()` is the only line in this lane
that touches time, and it goes through `engine.requestTimeScale('studio', v)`. `studio` is
first in the engine's priority list, so a freeze outranks combat hitstop, Concentration and
the weapon wheel — all of which keep re-requesting their own scale every frame while the
studio is open. Round 3 wrote `engine.timeScale` directly and combat overwrote it on the
next frame. On exit the claim is released (`requestTimeScale('studio', null)`).

**Cast states (`onboarding-loop-studio-cast-buttons`, gate A78).** The Round 3 buttons
called `machine.setState()` — the state machine's own setter, which `Machine.update()`
re-derived away on the very next frame (1 frame of `attack`, 59 of `patrol`). Now:
`machine.forceState()` **plus a hold**. `forceState` is a shove, not a clamp — `attack`
still exits on `_unseenT > 4.5`, which is guaranteed when the photographer is 80 m away
behind the lens — so while a state is held the `CastDirector` re-pins the perception inputs
that state's exit tests read, re-homes the leash anchor to where the machine stands, and
re-issues `forceState` the instant the state drifts. Release puts the anchor back and hands
the machine to its own AI. Sustained states hold; `stagger` / `downed` / `dead` fire once.

**Filming a hit or a death (`player-anim-17`).** `takeDamage`, `jump` and `dodge` all
early-out unless `ctx.state === 'playing'`, and those guards are correct — they belong to
`player-control`. `PoseDirector.asPlaying(fn)` opens a **one-call window** of that state
instead of asking another lane to weaken them. If `fn` hands the state on deliberately
(`_die()` sets `dead`), that is left alone and the caller is told, so `Studio.update()` can
take the world back when the respawn timer releases it and Esc still returns the
photographer to where they came from.

**The shot itself.** Real-dt fly cam (`interpolate(alpha, realDt)`, clamped to 1/20 s) so
the lens still moves with the world at `timeScale 0`; the studio owns its keys on the
**capture** phase and swallows them, so Esc no longer left photo mode *and* opened the pause
menu underneath; panels at z-index 900, clear of everything the shell owns (HUD 40, Focus
39, inventory 44/46, pause 50, wheel/quests 60, menus 70).

**Hide HUD hides all chrome, not `#hud`.** Chrome roots are *discovered* — every `<body>`
child that is not studio chrome and does not contain the renderer's canvas — because
overlays are built at runtime by their lanes and one of them (`#perf-stats`, z-index
**99999**) sits above the studio's 900 and painted a frame-time readout across the
photograph. The set is re-swept at 4 Hz while hidden, so a toast or tutorial card appended
mid-shoot cannot pop into frame. Only what the studio hid is ever restored.

## 4. The photo pass (`post.js`)

Appended to `engine.composer` at runtime on first `enter()` — **never built until then**,
and `enabled = false` unless the studio is both open and asking for an effect, so a gameplay
frame never pays for it (`EffectComposer` skips a disabled pass before any draw). Because it
is appended after SMAA it becomes the last enabled pass while on, so `renderToScreen` lands
on it and `Frame → PNG` exports exactly what is on screen.

- **DoF** — 32-tap golden-angle spiral over the depth attachment, each tap weighted by its
  own circle of confusion so a sharp foreground cannot smear into a blurred background. The
  spiral start angle is hashed **per pixel**: with a fixed spiral, 32 taps across a 20 px
  disc is coherently coarse and the gather's own arms showed as blotchy banding in the
  defocused ground. Randomising it spends the same taps and turns identical error into
  per-pixel noise, which at these radii reads as film grain.
- **Auto-focus** lands on Aloy's **head bone**, not her transform origin — at f/0.95 the
  40 cm between sternum and face is the difference between a sharp portrait and a soft one.
- 7 filters (`none noir sepia cold warm bleach focus`), 7 frames (full, 2.39, 2.00, 1.85,
  16:9, 4:3, 1:1), grain, vignette, DOM composition guides (kept out of the pass so an
  exported PNG stays clean).

## 5. Gates — `tools/gates.round4.studio.mjs`

§4 assigns this lane `A78-cast-states` and `A79-time-authority`; both are registered
verbatim (no other lane holds those full ids). Four more close the rest of the brief.

| id | kind | what it proves |
|---|---|---|
| `A78-cast-states` | action | Attack clicked **in the panel** on a calm machine 80 m away, facing away: still `attack` a full *sim* second later, held by the director; Release hands it back |
| `A78b-cast-pose-set` | action | all 5 sustained states stick, stagger/death reach their owners, a hit **and a death** are filmable from `studio` (`player-anim-17`), no pose refused |
| `A79-time-authority` | action | `engine.timeScale === 0` and `simTime` frozen for 2 s while hitstop + concentration + the legacy setter each shout a different number on **every poll** |
| `A79b-studio-shell` | action | F10 from the pause menu closes the overlay and keeps `prevState=playing`; input taken; nothing clickable stacks at/above the studio (whole-document scan); the lens flies on real dt with the world frozen; Hide HUD leaves **no** foreign chrome; Esc restores everything |
| `A79c-lens-stack` | action | the pass does not exist before first enter and is idle after it; DoF/filter/frame/grain/vignette each arm it; auto-focus lands at head height; off again on exit |
| `V79-photo-portrait` | visual | 2.39 portrait: sharp Aloy meeting the lens, defocused background, warm grade, vignette, no HUD, no panels |
| `A79d-studio-gate-shape` | runner | every studio gate is built from fields `tools/gates.mjs` actually reads |

`A79d` exists because of a real miss: V79 was first written with `eval` + `wait`. The runner
reads neither. The gate loaded, ran **none** of its own staging, screenshotted a plain
gameplay frame with the HUD up and reported `NEEDS-JUDGE` — indistinguishable in the summary
from a gate that had done its job. The runner cannot warn about this (an unknown key is just
a key), so the lane now gates itself on the field names.
