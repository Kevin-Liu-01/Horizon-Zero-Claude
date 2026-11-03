# ROUND 4 — `studio` lane: photo mode

Owner: `studio`. Files: `src/studio/*` (`studio.js`, `pose.js`, `cast.js`, `post.js`,
`studio.css`) and `tools/gates.round4.studio.mjs`. No other file in the repo is touched.

Findings closed: `missing-systems-photo-mode`, `player-anim-17-studio-cannot-film-hit-death`,
`machine-rig-19` (studio freeze overwritten), `onboarding-loop-studio-cast-buttons`.

The Round 3 "Animation Studio" is promoted to a photo mode: **F10** from `playing`,
`paused`, `dead`, `death-menu` or `victory`; **Esc** or F10 again to leave. Bring-up is already in
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
ctx.studio.debug()                         // full state for gates / scripted shots; now also
                                           //   healthIn / health / deathFilm / realDeath,
                                           //   overlays{hubOpen,modal,deathState} and
                                           //   guard{armed,takes,from} (the out-of-loop hold)
ctx.studio.lens                            // { dof, focus, autoFocus, aperture, exposure,
                                           //   nearRange, farRange, filter, filterAmt, grain,
                                           //   vignette, frameAspect, guides }
ctx.studio.pose                            // PoseDirector: .gaze .gazeYaw .gazePitch
                                           //   .expression .hideAloy .setHidden()
ctx.studio.cast                            // CastDirector: .target .locked .hold
                                           //   .setTarget() .cycle() .spawn() .release()
```

A scripted shot sets `studio._pos / _yaw / _pitch / _fov` and reads back through `debug()`;
`tools/gates.round4.studio.mjs` V79 is a worked example.

**No new events are emitted.** A photo mode that broadcast state changes would be
indistinguishable from gameplay to every listener; it stays a pure consumer.

## 3. The things that were actually broken

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
instead of asking another lane to weaken them, and if `fn` hands the state on deliberately
that is left alone and the caller is told, so `Studio.update()` can take the world back and
Esc still returns the photographer where they came from. The **death** pose is the one
exception and it does not use the window at all: routing it through `takeDamage` armed the
whole death *pipeline* — `player-died`, a 3.2 s respawn that heals and teleports her to
camp, a card, a grayscale grade on the render canvas, a park onto `death-menu` — and that
pipeline destroys the shot rather than decorating it. Traced live, the card's park and the
respawn each dropped `ctx.state === 'dead'` for a tick, which resets the animator's `_dieT`:
it sawtoothed 0.54 → 0.08 → 0.53 → 0.08 and the crumple never got past its first half
second. The animator needs exactly one thing for the crumple, so the pose stages exactly
that — `state = 'dead'` and the health it reads from — and arms nothing. `_holdState()`
holds it and pins the subject; "Idle" and `exit()` release both.

**A camera undo is not a heal.** (Judge finding, fix round 1.) `_releaseDeath()` healed to
`maxHealth`, so `F10 → Death → Esc` handed back **full health in three inputs** — measured
37 HP in, 100 HP out, no checkpoint spent, and the Death button is one bind away from live
combat. `enter()` now snapshots `player.health` and the undo restores *that* number, never
more. And a death the studio did **not** stage is no longer the studio's to undo at all:
reaching `ctx.menus.deathState` means something in the world really killed her, so
`respawn('checkpoint')` owns health *and* position and the studio stops overriding its
outcome — it used to pin her back at `_deathPos` and heal her to full, erasing the cost
`progression` charges for dying. Filmed: checkpoint at 64 HP, died 85 m away at 55 HP →
exits at the checkpoint, 64 HP, `stats.deaths` 1. `maxHealth` survives only as the fallback
for the one case with no honest snapshot — F10 pressed *inside* a real death on a build with
no menus lane — because handing back a living world with a 0 HP player is worse.

**The overlay had to survive a frozen world, and half of it did not.**
`BoneSpace.rotChar` *multiplies* into `bone.quaternion`. That is safe in gameplay only
because the animator re-evaluates every bone from its clips each frame, wiping the previous
delta before the next lands. The animator runs on **sim** dt; this overlay runs on **real**
dt — it has to, or the face freezes with the world — so at `timeScale 0` nothing reset the
bone and every rendered frame compounded. Measured on the lid bone with `narrow` held:

```
running -0.038 | +0.4s -0.609 | +0.8s -1.180 | +1.2s -1.752 | +2.0s -2.895
```

~1.4 rad/s. Two seconds of composing a shot swung Aloy's lids a third of a turn and shut
them over her eyes as flat plates — invisible in motion, ruinous in every frozen portrait,
i.e. present only in the mode this lane exists to ship. It was found on film (the V79
portrait's eyes), not by reading. The **gaze** half was already immune, and the reason is
worth stating: `_lookAt` solves the *residual* error (`setFromUnitVectors(current, want)`),
so re-running it on its own output asks for zero — an absolute solve is idempotent by
construction. The eye and lid writes are fixed angles and are not. Those six bones now carry
an undo buffer: what the bone held before the overlay wrote, and what the overlay left. If
the bone still reads what we left, nobody else has written it (the world is frozen) and the
old value goes back before the new delta; if it has changed, the animator ran and its pose
is the new base. Same code, correct frozen, running, and on the frame time resumes — and
`restore()` hands the face back untouched on exit. Gate `A79e-pose-overlay-frozen`.

**The shot itself.** Real-dt fly cam, and *real* means real: `main.js` clamps the dt it
hands `interpolate()` to `MAX_FRAME` (0.05 s), which is right for a fixed-step accumulator
(it is what stops a slow frame spiralling) and wrong for a lens, which simulates nothing.
Spending only the clamp flew the camera at **72 %** of true speed at 14 fps — and worse the
slower the box, 36 % at 7 fps (A79b, measured: 9.09 m where 12.6 m was due). `engine.wallTime`
is no escape; it advances by that same clamped number. Measuring the clock here instead is
not enough either: a host may drive `interpolate()` synchronously several times over, each
call standing for a stated dt (a scripted shot, a replay, A79b's own 8 fps drive), and then
the clock reads ~0 while the frame is genuinely worth 125 ms. So `_realSeconds()` takes the
**larger** of the two — both are lower bounds on the truth, and neither can lose time the
other still holds — and the stall band still drops a hitch rather than spending it. The
studio owns its keys on the
**capture** phase and swallows them, so Esc no longer left photo mode *and* opened the pause
menu underneath; panels at z-index 900, clear of everything the shell owns (HUD 40, Focus
39, inventory 44/46, pause 50, wheel/quests 60, menus 70).

**Capture on `window` is not exclusive, and this doc used to claim it was.** (Judge finding,
fix round 1.) Among capture-phase listeners on the *same* target the order is **registration
order**, and the order is `main.js`'s: `installMenus(ctx)` runs before `new Studio(ctx)`, so
`shell-menus` gets the first look at every key. Two defences, neither reaching into another
lane's file. `_closeOverlays()` shuts its surfaces on the way in so it has nothing to claim
— and that list had guessed the API: it called `ctx.menu.close()` while the lane shipped
`ctx.menus` with `closeHub(silent)` / `closeModal()`, and optional chaining turned the miss
into silence, so **F10 from the pause hub opened photo mode with the entire full-screen hub
— map, tabs, status strip — painted over the photograph**, and Esc then took two presses.
The silent form of `closeHub` is deliberate: the loud one broadcasts `ui-close`, which
`shell-menus` answers by re-parking the hub on the next microtask. Second defence: the
**keyup** is a channel nobody else claims (`shell-menus` binds one and it reads `KeyC`
only), so if our Escape keydown never ran, the studio leaves on the release instead. Esc is
one press even when a lane that lands next round takes the first strike.

**Hide HUD hides all chrome, not `#hud`.** Chrome roots are *discovered* — every `<body>`
child that is not studio chrome and does not contain the renderer's canvas — because
overlays are built at runtime by their lanes and one of them (`#perf-stats`, z-index
**99999**) sits above the studio's 900 and painted a frame-time readout across the
photograph. The set is re-swept at 4 Hz while hidden, so a toast or tutorial card appended
mid-shoot cannot pop into frame. Only what the studio hid is ever restored.

### The hold must live outside the loop it protects (judged, fix round 2)

`Game._simulate()` returns early — before the sim tick **and** before the `interpolate()`
pass — for any `ctx.state` outside its `live` list (`src/main.js`). Both callers of
`_holdState()` were inside that loop, so photo mode's only defence against a state theft
lived inside the thing the theft turns off. `shell-menus` parks `ctx.state = 'death-menu'`
1.15 s after a real death, from its own rAF, and `death-menu` is not in `live`: one machine
kill — or one click on the ALOY panel's own **Knockdown** chip at low health — froze photo
mode **solid** while it still looked alive. Measured on a build with no `?shot=1`: W held
for 0.8 s moved the lens **0.000 m**, `engine.simTime` advanced **0.000 s**, 45 frames were
drawn. Only Escape escaped, because the key listeners are the one part of this file that
never ran inside the loop.

Four channels now drive the same, unchanged `_holdState()`:

| channel | when | why it is not enough on its own |
|---|---|---|
| `events.on('ui-open')` | same tick as the death park | only covers screens that announce themselves |
| `events.on('player-respawn')` | same tick as `_die()`'s 3.2 s respawn | ditto — but it must be same-tick (below) |
| a self-owned `requestAnimationFrame`, armed by `enter()` and cancelled by `exit()` | one frame later, for **anything** | a frame late is too late for the crumple |
| the studio's own `keydown` | the photographer's next input | only helps if they press a key |

F10 is also accepted from `death-menu` now (it was refused, so F10 stopped working 1.15 s
into every death), and entering with a death already in progress **seeds** the `_realDeath`
latch from the death system's own state — `player-died` fired before this object was
listening, and without the seed that one entry path kept the stopwatch.

**Same-tick matters, not just eventually.** `playerAnimator` resets `_dieT` the moment it
ticks with `ctx.state` not `'dead'`, so a theft answered a frame late restarts the death
crumple — the exact sawtooth `pose.js` documents. Holding `'dead'` is also what finally lets
`Player._die()`'s 3.2 s respawn pass its own guard and run, so that respawn is now a live
event during a long death shoot rather than a theoretical one. Both are answered
synchronously; measured over a 7 s shoot: `_dieT` monotonic to 6.91 s, **0** restarts,
`deadW` 1.0, the subject pinned to 0.00 m of drift.

**A real death is not a stopwatch.** `_releaseDeath()` used to read `ctx.menus.deathState`,
which now *expires* mid-shoot (the 3.2 s respawn retires the card). A shoot shorter than
3.2 s therefore exited through `respawn('checkpoint')` and a longer one through the private
heal — two different worlds for the same death, decided by how long the photographer took,
which `exit()`'s own contract forbids. A `player-died` during a session now latches
`_realDeath` for the whole session, and that latch — never the card — decides. Gated both
sides: 1.7 s and 4.6 s shoots both exit at the checkpoint, 64 HP, `stats.deaths` +1.

**`KILLED BY [OBJECT OBJECT]`.** `progression` reads a fatal hit's source as
`from.displayName ?? from.kind ?? String(from)`; the hit poses passed a bare `{ position }`.
Named (`the studio`) and the object preallocated.

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
- **Exposure** — a *darkroom* exposure, ±1.5 stops, not a scene one. By the time this pass
  runs the composer has already tone mapped, so a multiply would burn the sky to paper white
  while the shadow it was opened for barely moved; `pow(x, 2^-EV)` pins pure black and pure
  white exactly where they are and walks the midtones by whole stops. Values the grade left
  above 1 (bloom cores) ride the same stop linearly instead of being clamped into the curve.
  It is here because the valley's low sun back-lights the subject: measured on V79's own
  film, Aloy's face went to silhouette in the portrait the mode exists to take.
- 7 filters (`none noir sepia cold warm bleach focus`), 7 frames (full, 2.39, 2.00, 1.85,
  16:9, 4:3, 1:1), grain, vignette, DOM composition guides (kept out of the pass so an
  exported PNG stays clean).

Every control above defaults to an exact no-op (`exposure` included), so entering photo mode
arms nothing until the photographer asks — which is what `A79c` measures as `idleAfterEnter`.

## 5. Gates — `tools/gates.round4.studio.mjs`

§4 assigns this lane `A78-cast-states` and `A79-time-authority`; both are registered
verbatim (no other lane holds those full ids). Six more close the rest of the brief.

| id | kind | what it proves |
|---|---|---|
| `A78-cast-states` | action | Attack clicked **in the panel** on a calm machine 80 m away, facing away: still `attack` a full *sim* second later, held by the director; Release hands it back |
| `A78b-cast-pose-set` | action | all 5 sustained states stick, stagger/death reach their owners, a hit **and a death** are filmable from `studio` (`player-anim-17`), no pose refused |
| `A79-time-authority` | action | `engine.timeScale === 0` and `simTime` frozen for 2 s while hitstop + concentration + the legacy setter each shout a different number on **every poll** |
| `A79b-studio-shell` | action | F10 from the pause menu closes the overlay and keeps `prevState=playing`; input taken; nothing clickable stacks at/above the studio (whole-document scan); the lens flies on real dt with the world frozen; Hide HUD leaves **no** foreign chrome; Esc restores everything |
| `A79c-lens-stack` | action | the pass does not exist before first enter and is idle after it; DoF/filter/frame/grain/vignette/**exposure** each arm it *on their own*; auto-focus lands at head height; off again on exit |
| `A79e-pose-overlay-frozen` | action | a pose held at `timeScale 0` for 2 s of *rendered frames* moves no bone the overlay writes by more than 0.01 rad (the runaway was 280× that), and exit leaves the face clean |
| `V79-photo-portrait` | visual | 2.39 **head-and-shoulders** portrait: sharp Aloy meeting the lens with a *readable* (not silhouetted) face, defocused background, warm grade, vignette, no HUD, no panels |
| `A79f-photo-entry` | action | the judged path, end to end: Esc → F10 from the **pause hub** leaves nothing over the photograph (hub flags clear *and* the centre of frame hit-tests to the render canvas); Esc leaves in **one** press, and still does when `shell-menus` consumes the keydown (staged with its real death card, proven consumed by a probe on `document` capture); `F10 → Death → Esc` returns **exactly** the health she walked in with |
| `A79g-death-menu-live` | action | **the only studio gate that clears `?shot=1`** — a real death through the real Knockdown chip: the world is never parked on `death-menu`, the lens still flies (11.4 m on 0.8 s of W), the crumple runs **once** across the 3.2 s respawn, and a 1.7 s and a 4.6 s shoot hand back the identical world |
| `A79d-studio-gate-shape` | runner | every studio gate is built from fields `tools/gates.mjs` actually reads — **and at least one of them runs on the predicate a player runs** |

`A79d` exists because of a real miss: V79 was first written with `eval` + `wait`. The runner
reads neither. The gate loaded, ran **none** of its own staging, screenshotted a plain
gameplay frame with the HUD up and reported `NEEDS-JUDGE` — indistinguishable in the summary
from a gate that had done its job. The runner cannot warn about this (an unknown key is just
a key), so the lane now gates itself on the field names.

`A79d` grew a second clause for the same reason, one round later. The runner appends
`?shot=1` to every gate URL unless `plain` is set, and `live` ends in `|| params.has('shot')`
— so under the suite the frame loop runs whatever `ctx.state` holds, and the entire class of
"another lane parked the world on a state `live` does not list" was **structurally
unobservable** to eight green studio gates. A judge found it on the first probe that thought
to delete the flag. One gate clearing it is enough to see the class; zero is blindness, so
the lane now fails itself when no studio gate does.
