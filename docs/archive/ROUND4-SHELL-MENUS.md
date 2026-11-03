# ROUND 4 — lane `shell-menus` (port 5215)

The frame around the game: title flow, tabbed pause hub, world map, death and victory cards,
settings, accessibility, credits.

Owns `src/ui/menu.js`, `src/ui/map.js`, `src/ui/settings.js`, `src/ui/tips.js`, the
`SHELL / MENUS` block of `src/style.css`, and one `<script type="module">` tag in `index.html`
(unfrozen for this lane and `shell-hud` per ROUND4-AUDIT §3.3). No other lane's file is touched.

---

## 1. What shipped, by finding id

| finding | what landed |
|---|---|
| `ui-01` pause was one Resume button | Tabbed hub — Map / Quests / Inventory / Crafting / Skills / Notebook / Settings, `Esc` + `M J I O K N ,`. Four tabs **route** to the owning lane's screen (`progression.openQuestLog/openSkills`, `items.openInventory/openNotebook`); the tab bar stays live above them. Footer: SAVE · CREDITS · FIELD MANUAL · QUIT TO TITLE · RESUME, plus a live status strip (level, SP, HP, shards) and a rotating tip. |
| `ui-02` no Map screen | `map.js` — 720 m relief baked from `terrain.heightFast` with hillshade + water, chunked across frames; 10 m fog of war persisted to `localStorage`, rasterised at cell resolution and upscaled so the frontier is soft; play-radius ring; site / quest / tagged-machine glyphs; hover readouts with distance; click-to-waypoint, right-click to clear. **A marker under the fog is not drawn and cannot be clicked** — only quest markers and Focus-tagged machines ignore the fog. |
| `ui-13` victory soft-lock, 0.7 s death | Victory = 3 s cinematic card, then the world is handed back (`A68`). Death = 1.15 s crumple, then a card that **waits for input** with three options and a named killer (`A69`). |
| `ui-18` title = a button + a keybind wall | Press-any-key → scripted aerial dolly → vertical menu (Continue / New Game / Settings / Field Manual / Credits). One logo; the keybind wall moved wholesale behind FIELD MANUAL. |
| `progression-003` (shell half) | SAVE in the hub, CONTINUE on the title with a save line, respawn choices on death, no reload anywhere in the loop. |
| `progression-014` | NEW GAME opens a difficulty chooser built from `progression.DIFFICULTIES` with the real multipliers printed. |
| `camera-feel-13` | Sensitivity, gamepad sensitivity, invert Y, stick deadzone, FOV, camera shake, camera smoothing — all written onto `ctx.settings`, which `input.js` and `player.js` already read every frame. |
| `audio-14` (slider half) | Six bus sliders + mute, driving `audio.setVolume()`; the audio lane keeps the values. |
| `missing-systems-accessibility` | HUD scale (via `hud.setHudScale` + a `--hud-scale-pref` token), three CVD palettes (Okabe-Ito derived, swapped on the `--hzc-*` tokens the whole interface reads), reduced motion (kills camera shake and every menu animation), hold-vs-toggle. |
| `missing-systems-title-save-campfire-flow` | Title + save + continue above, plus **fast travel** from the map: free at a campfire, to a discovered travel point, never while something is hunting you — each refusal prints its own reason. |
| `onboarding-loop-title-screen` / `-death-no-stakes` (shell half) | The title flow above; death that costs you a choice and shows a killer-specific tip. |

### Fixed on film during this wave

* **The corpse that walked.** `respawn()` set health full *before* emitting `player-respawn`, and
  `progression`'s handler then restored the checkpoint's health over it — a checkpoint written
  while the player was already down handed back a 0 HP player who could never die again. Now
  re-checked on the microtask after the restore, and only a non-positive value is overridden.
* **The title was a contour map, and then it was a beige wall.** The first dolly flew at 118 m
  and stared 27° down: no horizon, no sky, every detail the world lanes built below the
  resolution of the shot. The second dropped to ~30 m but still tilted *down* 6–8.5°, and that
  is the cut that shipped as a flat wall with the wordmark painted on it. A probe settled it:
  marching the look ray at 16 points around the ring puts the rim crest at **16.6–32.1° of
  elevation** (18° in this sector), while the camera's vertical half-FOV is 27.5° — so a 6°
  downward tilt leaves the top of frame at 21.5°, three degrees of sky above an eighteen-degree
  ridge. The pitch is now **negative** and opens across the move (−1.5° → −4.5°, filmed at ease
  0 / 0.25 / 0.5 / 0.75 / 1), which lifts the top of frame to 29–32° and turns the rim from the
  subject into a silhouette against sky. Altitude stays low on purpose: dropping the crest to
  12° by climbing instead would need 113 m, which is the contour map again.
* **The dolly was a jump cut, and the gate was measuring the jump.** (Judge finding, fix round 1.)
  `_dolly()` keyed the closing ease to `_dollyT`, which counts from the moment the title
  *appears*, not from the keypress — while `closing` was pinned to 0 during the press stage. So
  the ease sat there accumulating unspent, and the frame the player pressed a key it discharged
  in one step: **35.45 m of camera translation in a single frame** after an 8 s title, with the
  rim, the Tallneck and the camp all sliding at once. Past 9 s of title there was no closing move
  left at all, only the orbit. The same mistake ate the 1.1 s beat (`t > 1.1` was already true,
  so the menu appeared on the first frame instead of after the vista had started travelling).
  The intent was already in the code and unread: `_titleAdvance()` zeroes `_titleT` precisely so
  something can measure time-since-press, and nothing did. The ease and the beat now read
  `_titleT`; `_dollyT` keeps driving only the continuous orbit, which is supposed to be running
  while the player reads the press-any-key line. Measured after the fix: the press frame moves
  **0.198 m**, and it is identical at 0 s, 8 s and 20 s of hold — the hold-independence that was
  the actual broken property.
* **`A70c` was complicit, and raising its threshold would not have fixed it.** The gate asserted
  `dollyMetres > 8` across the press, so the teleport *was* the measurement — hence three judge
  runs spreading 7.65 / 8.96 / 11.56 m where the builder had reported 16.26. Worse, the slow
  orbit alone covers ~9 m in that window, so `> 8` never proved the camera closed in at all.
  Displacement is simply the wrong instrument here, and it is not even stable: the sim clock runs
  at ~87% of wall clock on a loaded box (a 20 s hold advances the title timer 17.3 s), so travel
  measures 10.0–12.3 m run to run. The gate now reads the quantities the shot is *authored* in,
  published by `audit().title.dolly` — `easeAtPress` (0.0003 measured, 0.60 under the bug),
  `beat.stage` still `dolly` 500 ms in, `endEase`/`radiusDrop` to prove the move ran, and
  `maxStep`/`firstStep` in **metres** for the teleport check. Metres, not m/s, because `main.js`
  clamps `realDt` to `MAX_FRAME` = 0.05 s: one frame can move the camera at most ~0.34 m however
  long it took, while a fast 5 ms frame after a slow one reads as 68 m/s and would flake. That
  clamp is also what makes a jump cut structurally impossible now, not merely absent.
* **`A68` was passing by sixteen milliseconds.** Chasing the judge finding turned up a second
  bad gate next to the first. `A68` read the victory card's visibility at a fixed +400 ms and
  again at +4.4 s. The card actually appears at **416 ms** — so the first sample was landing on
  the right side of a coin flip, and inside the full 176-gate suite (loaded box, 45 min in) it
  lost, reporting "never shown" *and* "still up at 4.4 s" *and* a stuck `hud._victoryShown`
  latch, none of which were true; it passed 3/3 standalone on the same commit. A phantom failure
  in a soft-lock gate is worse than no gate, because it teaches you to ignore the one alarm that
  means the session cannot recover. The gate now **watches** the card instead of sampling it —
  polls for it to appear, polls for it to clear, and measures its lifetime **from the event**
  (3054 ms measured), which is load-independent because the card's own timer starts there. That
  is strictly more than before: appearance, a real on-screen duration (>= 1.5 s rules out a
  one-frame flash), clearance (<= 9 s rules out the soft-lock), and only then the latch.
* **Victory printed itself three times.** `progression` raises `PROGRESS SAVED` and
  `VALLEY RECLAIMED` banners through `shell-hud`'s queue, both landing on top of this lane's
  card. The card is now an opaque upper letterbox that covers the banner zone and fades out over
  the lower third.
* **The map was a dark staircase.** Hillshade centred on 0.5 halved every flat pixel; the fog
  filled one rect per 10 m cell. Both fixed (see the file comments).

---

## 2. Published surface (`ctx.menus`)

```js
ctx.menus.openHub(tab?) / closeHub() / toggleHub() / setTab(id)
ctx.menus.openModal('credits' | 'manual' | 'difficulty' | 'settings') / closeModal()
ctx.menus.saveGame() / continueGame() / newGame(difficultyId) / quitToTitle()
ctx.menus.respawn('checkpoint' | 'camp')
ctx.menus.settings            // SettingsStore: get(id) · set(id, v) · reset() · onChange(fn) · audit()
ctx.menus.map                 // WorldMap
ctx.menus.map.waypoint        // { x, y, z, label } | null
ctx.menus.map.setWaypoint(x, z, label) / clearWaypoint()
ctx.menus.map.distanceToWaypoint() / bearingToWaypoint()
ctx.menus.map.canFastTravel(site) -> { ok, reason }
ctx.menus.map.fastTravel(site)
ctx.menus.map.fog.seenAt(x, z) / reveal(x, z, r) / fraction
ctx.menus.tips.pick(context) / peek(context) / forDeath(killer)
ctx.menus.audit()             // everything a gate needs, in one object
```

`audit().title.dolly` publishes what the title camera last authored — `{ since, ease, radius,
camY, pitchDeg, titleT, dollyT }`. **`ease` is press-relative**: exactly 0 until a key is hit,
then smoothstep over 9 s. `since` (= `titleT`) is the clock that drives it, reset by the press —
so while the title is still waiting it reads as time since the title appeared, not 0. `dollyT` is
the separate title-entry clock, and it drives only the continuous orbit. Read `ease`/`radius`
rather than differencing camera positions: the orbit alone covers ~9 m in a 2.6 s window, so
displacement cannot tell a closing move from a camera that merely turned — and `radius` shrinks
only under the ease.

**Events emitted** (all through `ctx.events`):

| event | payload | when |
|---|---|---|
| `waypoint-set` | `{ x, y, z, label, distance }` | a waypoint is planted |
| `waypoint-cleared` | `{}` | cleared |
| `fast-travel` | `{ from, to, site }` | travel completed |
| `settings-changed` | `{ id, value, values }` | any setting changes |
| `ui-open` / `ui-close` / `ui-back` / `ui-nav` / `ui-confirm` | `{ screen \| tab \| label }` | menu navigation (audio lane's UI cues) |
| `player-respawn` | `{ source: 'menus', mode }` | a death option was taken |

**Events consumed**: `player-died`, `victory`, `player-damage`, `game-start`, `inventory-close`,
`ui-close`, `checkpoint-loaded`.

**States this lane parks on**: `'paused'` (hub), `'death-menu'` (death card — deliberately *not*
`'dead'`, which is what makes `player._die()`'s 3.2 s auto-respawn return early and turns it into
a choice), `'victory'` for at most 3 s.

---

## 3. Requests to other lanes

1. ~~**`core-platform`** — call `installMenus(ctx)` in `main.js` and delete the module tag.~~
   **DONE.** `main.js` calls `installMenus(ctx)` after the HUD, and the
   `<script type="module" src="/src/ui/menu.js">` tag is gone from `index.html`. The tag was
   provably dead before it was removed: `main.js` publishes `window.__CTX__` at line 134,
   *after* the `installMenus(ctx)` on line 122, so `autoInstall()`'s poll could only ever find a
   context that already had `ctx.menus`. `autoInstall()` stays in `menu.js` — still idempotent,
   still guarded — so the module remains safe to load on its own in a lab page.
2. **`player-control`** — read `ctx.settings.holdAim` and `ctx.settings.holdSprint`
   (`'hold' | 'toggle'`). Both are persisted and published today and the panel marks them
   `STORED`, because aim and sprint are read as raw `isDown` state inside `player.js` and cannot
   be inverted from outside it. `holdCrouch` needs nothing — this lane releases the crouch on the
   `KeyC` up-edge through the published `player.setCrouch(false)`.
3. **`shell-hud`** — when the compass renders waypoints, publish `hud.setWaypoint(wp | null)`.
   `WaypointBeacon` draws the bearing caret and the metre readout itself *only while that method
   does not exist*, and retires the moment it does (`map.js`, bottom).
4. **`world-ground` / `world-light`** — the rim ring reads as a pale wall with vertical streaking
   at grazing angles from the air; it is the weakest element in `V38-title` and in every aerial.
   Not actionable from here (`V33-rim` owns it).

---

## 4. Gates

Registered in `tools/gates.round4.shell-menus.mjs`. Ids `A68`, `A69`, `A70`, `A72` and `V38` were
free across `gates.config.mjs` and every `gates.round4.*.mjs`, so the audit's names are used
unsuffixed; `A70b`, `A70c` and `A72b` are new free ids for the findings §4 does not gate.
Every gate snapshots `localStorage` on entry and restores it in a `finally`, so a settings write
or a fog reveal here cannot change the profile a later lane's gate boots into.

| gate | proves |
|---|---|
| `A68-no-softlock` | banner visible, `state === 'playing'` 4 s later, Escape opens/closes the hub, `hud._victoryShown` cleared, and a death *after* victory still returns to play |
| `A69-death-choice` | card waits past player.js's 3.2 s timer with **zero** `player-respawn` events, ≥2 options, killer named, grayscale peak > 0.8, and the chosen option returns a living player |
| `A70-hub-tabs` | 7 tabs, each key opens its own (delegated tabs hand the screen to their owner), map click plants a waypoint, the compass shows it in metres within 2 m of the true distance |
| `A70b-fast-travel` | refused away from the fire, refused to an undiscovered site, allowed and arrives at a discovered one |
| `A70c-title-flow` | exactly one *rendered* logo, no keybind wall in `#title`, press-any-key → menu of ≥4 items, camera travelled > 8 m, manual and credits modals populated |
| `A72-settings-persist` | a real second boot in a same-origin iframe restores sensitivity 2× / invert Y / FOV 78 / music 34 % from `localStorage` and applies them to `input.opt()` and `player.fovBase` |
| `A72b-accessibility` | HUD scale reaches `--hud-scale`, palette changes `--hzc-accent`, reduced motion sets the body class *and* zeroes camera shake, hold-crouch releases on key-up, all four persisted, reset restores |
| `V38-title` | the shot |
