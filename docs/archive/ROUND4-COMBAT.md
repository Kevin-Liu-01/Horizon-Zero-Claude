# ROUND 4 — lane `combat` (port 5208)

Owns `src/combat/*` and `src/ui/wheel.js` / `wheel.css`.
Everything below is the published surface other lanes may code against. Nothing here requires
another lane to change a file; where combat needs behaviour it does not own, it consumes an
already-published API (`ctx.hitHulls`, `ctx.collision`, `machines.noise`, `player.addRecoil`,
`engine.requestTimeScale`, `animator.getBoneWorld`).

---

## 1. `ctx.combat` — fields

| field | type | meaning |
|---|---|---|
| `weapons` | `Weapon[]` | six now: Hunter / Sharpshot / War / Blast Sling / **Ropecaster** / **Tripcaster** |
| `activeWeapon` | `Weapon` | the disc launcher while a heavy pickup is held, else `weapons[i]` |
| `drawStrength` | 0..1 | animator contract; also mirrored onto `player.drawStrength` |
| `aimPoint` | `Vector3` | crosshair world hit, from **one** `ctx.hitHulls.raycast` per frame |
| `nockLanded` | bool | **false while the arrow is still travelling from quiver to string** |
| `nockProgress` | 0..1 | position inside that window — a re-nock pip can render from this |
| `weaponDrawn` | bool | weapon is IN HER HAND (aiming, inside the 8 s holster window, or a hostile within 40 m) |
| `concentration` | `{active, gauge}` | gauge is 0..1, drains and refills over `CONC_TIME` = 6 s |
| `craft` | `{holding, progress, ammo, ok, blocker}` | the single hold-R craft state machine |
| `melee` | `Melee` | see §3 |
| `traps` | `Traps` | ropes + tripwires |
| `ammo` / `ammoCount(id)` | | ammo economy; `arrowCounts` is the legacy alias |

### The nock contract (`combat-no-nock-delay`, character-lane handoff)

`nockLanded` is the flag the **string** and the **animator** share.

- The window runs on the aim raise and again after every loose, for `weapon.nockTime`
  (hunter 0.42 s, sharpshot 0.62 s, war 0.34 s, sling 0.50 s, ropecaster 0.55 s, tripcaster 0.45 s).
- **The string cannot begin bending until it flips true** — `_drawing` will not start.
- While it is false the nocked-arrow PROP rides `animator.getBoneWorld('hand_r_045')` via
  `bow.setNockRide(v3|null)`, so the arrow is in her hand during the quiver flourish instead of
  floating on a slack string. `getNockWorld()` is untouched (the animator IK-targets it; writing
  to it would close a feedback loop — `docs/ROUND4-CHARACTER.md` §8.4).
- Consequence, and the point of the whole thing: two full-draw hunter shots are
  `nockTime + drawTime` = **1.12 s** apart (gate `A51-nock-gap`), not 0.714 s.

`player-anim` should hold the quiver flourish for exactly `nockProgress`.

---

## 2. Events

| event | payload | notes |
|---|---|---|
| `arrow-fired` | `{type, drawStrength, weapon, origin, dir, speed, aimPoint}` | **`dir`/`speed`/`aimPoint` are new.** `dir` is the launch vector — it is the ray to `aimPoint` and nothing else (there is no loft term any more). `machine-ai` already uses `origin` for the unseen-hit reconstruction; audio can pitch the whoosh off `speed` |
| `arrow-hit` | `{point, machine, damage, weak, type, tear, tornPart, latched, fused}` | `latched` = a Tearblast stuck and its 0.8 s fuse is running; no damage yet |
| `melee-hit` | `{machine, damage, heavy, combo, crit, point, killed, tornPart}` | |
| `silent-strike` | `{machine, killed, damage}` | |
| `critical-hit` | `{machine, damage}` | fired when a swing lands on a machine in `downed` |
| `weapon-switch` | `{weapon}` | |
| `ammo-crafted` | `{ammo, n}` | after a completed hold-R |
| `concentration-start` / `-end` | `{gauge}` | **`shell-hud` ramps its desaturate + cool-tint + vignette veil off these** |
| `wheel-open` / `wheel-close` | — | |

---

## 3. `ctx.combat.melee` — the spear

`active`, `phase` (`idle`/`windup`/`strike`/`recover`), `heavy`, `combo`, `silentTarget`,
`swing({heavy})`, `silentStrike()`, `audit() -> {swings, hits, silent, crits}`.

- LMB **outside aim** is the spear; a tap chains light 26/30/42, a hold past 0.28 s is a committed
  heavy 78/46. One `ctx.hitHulls.raycast` per strike frame, never per frame.
- **Silent Strike** registers a persistent `ctx.interactables` entry labelled `SILENT STRIKE`,
  enabled only on an unaware machine within 2 m **of its shell**, from behind or crouched.
  Instant kill on watcher/strider/scrapper/glinthawk, else 55 % of max health.
- A swing on a machine whose `state === 'downed'` is a **Critical Hit** (40 % of max health).

### The impact lands on the machine, not down the lens (fix round 1)

`_resolve` tries an exact hull ray down the swing line first. When that misses — which is the
COMMON case, because the ray lands within ~15 deg of the crosshair while the wedge is 110 deg
(light) / 140 deg (heavy) — the arc picks the nearest machine inside the wedge and then spends
**one more `ctx.hitHulls.raycast`, aimed at that machine's body centre**, to get the exact surface
point and normal. Two hull queries on a strike frame, none on any other frame.

The first cut put the impact at `chest + cameraDir * surfaceGap(m)` — a gap measured along the
player-to-machine line, walked out along the *camera* line. Measured at 3.2 m from a Watcher, a
confirmed hit rendered its sparks, its chips and its damage number 1.7 m (20 deg off-axis) to
1.8 m (40 deg) clear of the machine, and `melee-hit.point` published that same wrong spot to
positional audio and every other listener. It is now 0.92-1.09 m from the Watcher's centre at
0/20/40 deg, i.e. on its hull. The standoff **capsule** is not the answer either: it is a keep-out
volume 2.46 m across around a mesh whose nose is 1.0 m out.

The `dir` handed to `machine.takeDamage` is now chest-to-impact rather than the camera direction,
so knockback points at what was hit (identical to the old value on the hull-ray path).
`_flashTrail` still sweeps along the camera — the SWING reads down the lens, only the HIT does
not.

### Distance is measured to the SILHOUETTE, not the navel

`melee.js:surfaceGap()` measures to the machine's standoff capsule (`standoffHalfLen` along its
heading, less `bodyRadius`) because `collision._syncMachines` inflates that capsule by
`machinePad`. Measured on port 5208: **a crouched Aloy pressed against the back of a Watcher
stands 3.35 m from its centre** — the collider will not let her closer — against a 2.0 m
centre-to-centre range check. Silent Strike could therefore never fire on any machine, and the
spear could not reach a Thunderjaw at all. Any lane doing "am I close enough to X" against a
machine should measure the same way.

---

## 4. Ballistics (`combat-arrow-drop-autocompensated`)

- The launch **loft term is deleted**. An arrow leaves the nock pointed at the crosshair and falls
  on the way: ~3.9 m of honest drop at 55 m on the hunter bow (gate `A52-arrow-drop`).
- `AIM_MAGNET` is **0** for mouse aim. What replaces it is `ctx.hitHulls`, whose per-bone capsules
  are measurably wider than the sculpt (`docs/ROUND4-SPATIAL.md` §3).
- `_pointBlankHit` is gone — point blank is the spear's job.
- `arrows.gravity` (9.8) and `arrows.drag` (0.05) are published fields, so there is one copy.
- Lobbed weapons (Blast Sling) still solve an arc; that is not a cheat — the dotted trajectory
  preview draws the true parabola the solve produced.

---

## 5. Feel

- **Hitstop on every hit**, via `engine.requestTimeScale('hitstop', …)`, 26–95 ms scaled by the
  fraction of the target's health removed. Never a direct `timeScale` write, so studio and the
  wheel outrank it (`machine-rig-19`).
- **Recoil** via `player.addRecoil(pitch, yaw)` — a spring on the lens only. `camPitch`/`camYaw`
  are never written (`camera-feel-16`).
- **Reticle tick** (`src/combat/feedback.js`, overlay `#hzc-cfx`) scaled by the same fraction and
  coloured body / weak / tear / crit / kill.
- **The impact burst is tuned for DENSITY, not for speed** (fix round 1). See below.
- **Concentration arms on the SHIFT rising edge while already aiming.** A Shift held from a sprint
  has no rising edge left, so sprint-into-aim can never burn the gauge (`A53-conc-not-on-sprint`).

### The frame the arrow lands is not a frame of draw (fix round 1)

`_updateNock` runs earlier in the same `Combat.update` than the draw block, so the frame that
takes `_nockT` to zero is the frame `nockLanded` flips. Arming the draw *and* advancing it in that
frame let the nock and the draw share a frame, and two consecutive full-draw shots came out one
frame short of `nockTime + drawTime` — 1.047 s at 21-30 fps against the 1.12 s this document
promises. The advance is now an `else if`, and the measured shot-to-shot gap is 1.148-1.174 s.

The reticle tick lives **380 ms** (was 260) and holds full opacity for the first 28 % of that: at
260 ms with a quadratic fade the chevrons were at 20 % a quarter-second after the hit, so any
frame grabbed shortly after a hit showed a bare reticle.

### Particle values are LINEAR HDR, and drag decides whether a burst reads

Two things about `src/combat/particles.js` that any lane spawning FX through it needs to know,
both learned by failing `V28-impact`:

1. **Every frame goes through the composer** (ScenePass -> GTAO -> bloom -> ACES tonemap + sRGB
   grade), and the particle shader writes straight into that linear HDR target. A colour of
   `0.30` is not a dark grey — ACES puts it at roughly sRGB **0.6**, a mid blue-grey. "Dark metal
   plate chips" needed linear ~`0.03`. Conversely anything over the bloom threshold (**1.08**)
   glows, which is why an impact's spark palette is multiplied by `1.7 + 1.0 * k` and its core
   flash is a literal `[3.2, 2.7, 1.6]`.
2. **`burst({ drag })` is per-particle now** (`iDrag`), not per pool, because an impact shower and
   an explosion want opposite curves. Hit sparks are 1 mm flecks with a terrible ballistic
   coefficient: `drag: 9` stops them in ~5 cm of travel, which is what keeps the burst on the
   impact. The first cut threw them at 12-25 m/s on the pool's shared `drag: 2.4`, and 100 ms
   later — measured against a Sawtooth at 8 m, 160 px/m — the nearest of sixty-four sparks was
   **164 px from the impact** and the cloud spanned 500 px. Every particle was on screen; none of
   them was on the hit. It now measures r10 34 px / r50 61 px / r90 129 px against a 318 px
   machine, with the dark chips thrown to a ring outside that (r50 ~95 px).
3. `burst({ ... })` also takes nothing new for edges; **`new ParticlePool({ edge })`** does:
   `>= 1` keeps the original `(1 - r^2)^edge` glow (2.0, the default, is bit-identical to before),
   below 1 switches to a hard disc that fades over the outer `edge` of its radius. Debris needs a
   silhouette; the chips pool runs at `0.3`.

### Real time comes from a monotonic clock

Every real-time timer in `combat.js` (nock, draw, Concentration, holster, craft hold) derives its
dt from `performance.now()`, not from the `t` main.js passes. That `t` interleaves two sources —
the sub-step loop passes the END of the frame, a `steps === 0` frame passes the START — so
whenever time is slowed it goes backwards, the frame clamps to `dt = 0`, and the timer loses most
of its ticks. Measured with the wheel open at 0.25x: a 0.55 s craft hold reached 0.18 after 1.2 s
of holding R. Any lane with a "real seconds" timer should do the same, or ask `core-platform` for
a monotonic wall clock on `engine`.

---

## 6. Noise (`stealth-hearing-stimuli`, `stealth-lure-missing`)

Combat routes player-made sound into `machines.noise({x, z, kind, strength})`:
arrow/bomb impacts (`impact`), explosions (`explosion`), trap trips, melee swings and whiffs,
and — new — **`player-dodge` (roll), `player-land` (scaled by fall height), `player-splash`**.
`G` is the whistle (`combat.whistle()` → `machines.whistle()`), a `lure`-flagged stimulus.
Radii come from machine-ai's `NOISE.kinds`; combat only scales strength.

---

## 7. Weapon wheel (`combat-wheel-canon-gaps`, `ui-09`)

Six petals laid out **by angle** off `weapons.length` — the four hard-coded screen directions
could not address the Ropecaster or the Tripcaster at all, so two of the six weapons were
unreachable from the wheel. Adds weapon silhouettes (`weaponIconSVG`), ammo arcs on the outer ring
filled by quiver fullness, DMG/TEAR/SPD/RNG stat bars from `weapon.stats`, a hold-R craft radial,
and the canon offset to the right of screen centre.

Published for combat: `wheel.open`, `wheel.hover`, `wheel.hoverWeapon`, **`wheel.hoverAmmoId`** —
combat's craft hold reads the last one so hold-R crafts what the player is LOOKING at. There is
now exactly one craft state machine; the wheel's old instant tap-craft is gone.

---

## 8. Gates

`tools/gates.round4.combat.mjs`: `A49-melee-exists`, `A50-silent-strike`, `A51-nock-gap`,
`A52-arrow-drop`, `A53-conc-not-on-sprint`, `A54-elemental-tiers`, `V28-impact`,
`V29-wielded-carry`. Ids are §4's verbatim; `machine-rig` owns `A49-fx-pool-clean` and
`A50-hulls-visible`, whose NUMBERS overlap but whose full ids do not (the runner keys on the full
id, as `A28-jump-arc` / `A28-run-cadence` already do).

`A54-elemental-tiers` is the **contract between combat and machine-ai**: the thresholds are
theirs (`ai/tables.js ELEM_THRESHOLD`), the arrow is ours (`AMMO.freeze.elementAmount = 60`), and
the gate fails if either side moves off the canon 1–2 / 3–5 / 8–12 tiers.
