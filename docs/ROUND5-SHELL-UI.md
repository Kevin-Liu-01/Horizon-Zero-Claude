# ROUND 5 — lane `shell-ui` (W1, pulled forward by R57)

Port 5265 · tree `~/.calima-r5/trees/shell-ui` · plan §2 row, §9 "shell-ui", R54–R57 · bible §9.1, §9.7, §8.9, §10.3.

The new custom UI: a field book and a set of engraved surveying instruments. Type is only Chakra Petch
and IBM Plex Mono (R55). Every surface is paper, ink, vermilion, cobalt; 1 px rules; right angles;
graduated ticks. Lane gates: `nice -n 10 node tools/gates.mjs --port 5265 --lane shell-ui`.

## 1. What was built

| surface | file | what it is |
|---|---|---|
| tokens | `src/style.css` | bible palette as `--cal-*`; a real type scale (`--cal-type-*`: 10 steps, 11 px floor); paper grain + foxing; two motion curves; semantic colours `--cal-c-*` (the only ones the accessibility palettes re-point). Round-4 teal, Sighting violet and parchment tokens are gone (`A-ui-language-static`) |
| HUD | `src/ui/hud.{js,css}` | levelling staff (10 graduations, E-pattern, damage eats from the right, reading index settles on a spring), gourd hairline + paper chip, field-note tracker, theodolite circle (ticks 5°, numerals 30°, cardinals above the limb, 3-digit bearing chip, inertia on one transform), spirit-level exposure vial (dark glass, only the bubble wears the state), Instrument plates `TILLER · SOIL CORE · TRANSECT 14` with a graduated bar and a leader, stadia reticle, draw scale, breath meter, kit tag, tool chips, Plex damage numbers, Flagged pennant |
| plate layout | `hud.js _updateMachineBars` | plates resolve against the fixed instruments (column, circle + vial) and against each other: the most recently hit holds its place, the others step down. An Instrument with a plate no longer also wears an awareness mark; its attack flash moves to the plate's iris. Marks on the circle that crowd share one distance reading (the nearest's) |
| Sighting | `src/ui/focus.{js,css}` | the Alidade: sepia vignette ≤ 20 %, stadia crosshair, BRG / DST chip on the upper hair, cobalt rings, leaders to named chips, a paper card pinned right. **The drawn figure** replaces the Fresnel rim shells (R54: they read as white static): a half-res coverage mask (Instruments R, components G, Brea B) and one contour pass give a clean dashed outline at sub-texel accuracy; nothing the alidade draws goes over Brea. **Transects** are a surveyor's chain line: fine dashes, a station tick every 7.5 m, a floor of about a pixel at range, faded inside 6 m of the camera, behind Brea |
| map | `src/ui/map.js` | survey sheet: paper, graticule, coast + waterlines + soundings; triangles open a wash + contours every 5 m + names; Datum Line in vermilion; names placed on whichever side of a mark is free, a site with no free side reads on hover. `sites.js` is the sheet's gazetteer: the Round-4 props' landmarks stay off it |
| hub | `src/ui/menu.js`, `style.css` | a book: margin column with a levelling-staff fore-edge, station index, field data (hour, sky, E, N, BRG), red margin rule, graduated head rule, page block edges, an engraved theodolite plate drawn from arithmetic at the foot of a page (no asset), page-turn settle. The HUD rests under an open book |
| title, death | `menu.js`, `style.css` | title stations over the live vista (disabled row is a ghost, not a smudge); death page, Field Manual modal in every boot path |
| settings | `src/ui/settings.js`, `style.css` | three columns: controls + camera + interface, audio + restore, keys. Every row and every rebind on the page with no scroll (`A-settings-rows-visible`: the KEYS list used to be clipped off the right of a two-column layout) |
| tips | `src/ui/tips.js` | tutorial cards verbatim from bible §8.9; `fieldWord` now memoized |
| satchel | `src/ui/inventory.{js,css}` | pockets, specimen cards with engraved marks, detail column, take-all chip |
| other lanes' panels | `style.css` (`body #cal-dlg …`, `body #cal-prog …`) | dialogue gets a speaker tab, paper card, legible keys; log and skills get the page (no empty-looking tags, no build notes). No edit to `dialogue.js`, `quests.js`, `skills.js`, `wheel.*` |

## 2. Contracts published

```
ctx.hud.setHudScale(mult)            // 0.7-2, clamped
ctx.hud.showTip(id | {id,title,body,keys}) -> boolean   // one-shot; ids = TUTORIAL_CARDS in src/ui/tips.js
event 'tutorial-tip' {id,title,body,keys}               // the same for lanes without a handle
ctx.hud.setWaypoint({x,z,label} | null)                 // rides the theodolite circle
ctx.hud.setPaused(on)                                   // routes to the hub

ctx.menus.map.revealTriangle(a, b, c) -> boolean        // 'T1'..'T6'; persisted in cal.map.v5; emits 'map-triangle-opened'
event 'triangle-revealed' { pillars: [a, b, c] }        // the same; progression W3 (A-triangulation)
ctx.menus.map.triangles() -> [['T1','T2','T6'], ...]    // sorted id triples: what a save stores
ctx.menus.map.setTriangles(list)                        // restore from a save
ctx.menus.map.compassMarks() -> [{x,z,kind,shape}]      // discovered sites for the circle (1 Hz)
ctx.menus.map.draw({ washOnly }?)                       // washOnly: the triangles' wash + ink only (A-map-triangles measures it)

src/ui/tips.js:      fieldWord(text) · cardLine(m) · cardParts(m) · TUTORIAL_CARDS · TIPS
src/ui/inventory.js: itemIcon(id) -> svg string · itemPlayerName(id, fallback) · LOOT_POPUP
machine.cardWork / machine.cardLine (optional, a kind may publish them; else CARD_WORK in tips.js)
engine ledger row:   'shell-ui sighting figure mask' (RGBA8, half the scene target, no depth; allocated only while the alidade is up or a component outline lingers; ctx.sighting.dispose() unregisters it)
```

Consumed: `ctx.water.seaLevel`, `ctx.terrain.getHeight`, `island/sites.js` (`TRIG`, `SITES`, `SCAR`, `REST`), `ctx.datum.regions()/regionTrue()` when W2 lands, `combat.steady`, `ctx.machines.list`, `ctx.progression.*`.

## 3. Gates

Measured on 5265, `nice -n 10`, machine care per R53. Lane run (49 rows): 27 PASS, 0 FAIL, 4 PENDING, 18 for the judge.

| row | result | numbers |
|---|---|---|
| A-ui-language-static | PASS | 0 offenders over 4 sheets, 10-step type scale in tokens, retired tokens 0 |
| A-ui-type-only (new) | PASS | 12 surfaces walked (hud 47, map 79, settings 155, satchel 93, making 116, books 118, log 68, skills 103, Sighting 82, dialogue 85, tip 49, death 50 text nodes); 0 outside the two families; 0 numerals outside Plex; only Chakra Petch 400-700 and Plex Mono 400-600 + italic loaded |
| A-ui-words-all | PASS | 58 surfaces, 0 hits; log and skills text is a pending clause (progression W3) |
| A-settings-rows-visible (new) | PASS | 40 rows, 19 of 19 rebinds on the page, 0 clipped, scroll overflow 0 px |
| A-lamp-canon-distance-ui | PASS | 32 tokens graded, 0 offenders |
| A71-compass-truth | PASS | 0 pips at spawn, +1 on a Flag; pip wears lamp colour + iris aperture; bearing reads `022` |
| A71b-hud-scale-floor | PASS | min font 11 / 11 / 13.2 / 17.6 / 20.8 px at 720p / 900p / 1080p / 1440p / 4K; plate 280 to 672 px |
| A71c-hud-surfaces | PASS | 10 graduations, vermilion + staff white, clip eats from the right at 40 %, gourd, plates cap 3, vial, tools, kit tag, stadia |
| A71d-steady-breath-meter, A71d-conc-veil | PASS | hairline 2 px, 50 px under the reticle, fill tracks the gauge (0.56 of the rule at 2.6 s), 0 full-screen overlays, 0 canvas filter. **Pending clause:** `timeScale` still reads 0.35 and the drain still runs 6 s: the breath-hold is combat-kit W2 |
| A71e-tutorial-cards | PASS | 18 of 18 cards in the bible's order and text, one-shot, kbd glyphs, paper, Plex body |
| A71f, A71g, A71h, A68, A69, A70, A70b, A70c, A72, A72b, A63 | PASS | Round-4 bars |
| A-sighting | PASS | ring stroke `rgb(44,79,138)`, 2 leaders, vignette centre 0 / max 0.20, figure mask 1.06 % coverage over 6 hulls at 800x450, 13 transects, readouts 308 / 018 |
| A-sighting-hue (+ A-sighting-off) | PASS | added violet 0.000 %, added teal 0.0044 % (tolerance 0.02 %). Brea is hidden in both frames: her violet cloth is the people's colour, not the overlay's |
| A-map-triangles, -reload | PASS | coastline only before (0 px of paint); T1+T2+T6 paints 90 268 px against 89 750 of geometry, 0.58 %; survives a real reload |
| A10-loot-single-render | PENDING | no sentry kind yet: Plumb, instruments-a W1 |
| A62-sighting-components, A62-focus-components | PENDING | R18: the Tiller fixture has no named parts until instruments-a merges |
| V-ui-sheet | NEEDS JUDGE | `shots/gates/V-ui-sheet.png`, nine surfaces |
| V10, V37, V36, V36-focus-scan, V-map, V-ui-title, -inventory, -settings, -pause, -tip, -death, -dialogue, V-hud-4k-a..d, V-ui-4k-a, -b | NEEDS JUDGE | filmed at 1600x900 and read by the builder (R29: advisory); §4 says what still looks weak |

Global green list on this tree (5265, one Chrome):

| row | result | numbers |
|---|---|---|
| A1, A20b | PASS | boot clean; 359 frames, 0 system errors |
| A9 | PASS | 59.9 fps median, 241 draws, quiet box |
| A21 | counters PASS, timing not graded here | 275 draws worst of 350, 3.93 M triangles of 6.5 M. medianGpuMs 19.6 / 38.6 / 20.5 against 14 reads FAIL; R58 moves that term to the W1 exit and nothing in the shell draws in the world except while the alidade is up |
| A90-memory-stability, A90b, A90-rig-reclaim | PASS | objects -33, heap -2.8 %, 30 kills; rig 0 geo / 0 tex growth over 30 cycles |
| A90-memory-stability-expansion | PASS, intermittent | PASS on the last run: `nonMachineGrowth` 0, heap +2 %. **Intermittent:** 2 of 5 runs on this tree read +1, one `Sprite` directly under the Scene, unnamed, with no Instrument root above it. No file under `src/ui` makes a sprite, and the three diagnostic runs that wrapped `scene.add` to catch its stack came back clean, so its owner is not identified. The orchestrator's W0b run on main read 0 in its one run |
| A90-abs | PASS | post-GC heap 82.35 MB (450), GPU process 1220.94 MB (1500) |
| A-alloc-rate | scheduled bars PASS; baseline guard offenders are not this lane's | shell-ui row 208.75 KB/s against a baseline of 588.51 (0.355x). Offenders: combat-kit 1.12x, instruments-a 1.69x (src of neither changed in this tree) |
| A-vram-ledger | PASS | textures 63.39, targets 127.27, geometry 79.25, total 269.91 MB of 450; 0 unattributed |
| A-ID-ip-assets-gone, A-assets-tracked | PASS | |
| A-no-horizon-terms-player | PASS | 1452 of the 1508 ratchet |
| A-no-horizon-terms-code | PASS | total 1311 of 1371, 0 uncovered, 0 over cap |
| A-licence-manifest | PENDING | third-party clause, no new asset here |
| A-port-guard, A-carried-suite | PENDING-orchestrator | need a full run or a sealed carried run |
| A-reach-all-sites | not registered yet | world-ground W1 |

## 4. Honest gaps

- **Per-function allocation.** The shell's row fell to 0.355x of its baseline, but 12 functions are still over the 4 KB/s bar that binds at the W2 exit (`_updateCompass` 36, `_updateQuestPips` 34, `_scanMachines` 27, `Menus._raf` 27, `_updateObjectiveMark` 21, `_updateMachineBars` 18 KB/s). The `fieldWord`, damage-number, plate and awareness strings are gone; what is left is double boxing and the menus' own rAF. Second pass due at W2.
- **Soundings read inland on this tree.** The Round-4 terrain's basin sits below sea level, so V-map shows soundings inside the outline. The bake reads `ctx.water.seaLevel`, which world-ground's island publishes; re-film V-map when it merges, and judge "soundings offshore" then.
- **Round-4 words the shell cannot reach:** log and skills text (progression W3), item names such as FIRE ARROW, TRIPWIRE, BLAST BOMB and VIGOUR DRAUGHT (combat-kit W2), `Varl`, `the campfire`, `Lessons of the Valley` (progression W3). `ITEM_DESC` in `inventory.js` holds the one catalogue line `fieldWord` cannot word-swap without spelling a forbidden word. Round-4 prop landmarks and activity marks are off the sheet, so the sheet shows `sites.js` only.
- **The Kit Rack** still reads its Round-4 smoked-glass sheet (`wheel.css`): combat-kit W2, as ordered. Not filmed as a surface here.
- **Steady:** the meter is right, the mechanic under it is not yet (0.35 time scale, 6 s drain).
- **Aim and Sprint hold/toggle** are stored but not applied: `player.js` is frozen. The rows say NOT LIVE YET.
- **The drawn figure on a bright background.** Paper dashes with an ink casing read well on dark ground and through cover; over sunlit grass they are thinner. A close herd overlaps into a busy patch of dashes. Brea is now knocked out of it, so it never crosses her.
- **Damage numbers** are world-anchored and can land on the vial or a plate for their 1 s life. Left on purpose: they belong to the part that was hit.
- **Bow wording:** TIPS say what the bow does today (RMB aims, LMB draws, release looses); the bible's card says `RMB draw, LMB loose`. They reconcile when the bow control changes.
- **Independent judges have not seen any of this.** Every V row above is the builder's own reading, which R29 makes advisory.
- **World under the UI.** Tree shadows, the Round-4 camp and the valley are what the frames sit on; every world lane's work changes how these frames read.

## 5. For other lanes and the orchestrator

- **Orchestrator:** `V-ui-sheet` needs its other rows in the same run (it composes the shots); it is registered last because the first page after it has twice hit a 90 s `Waiting failed` retry in the harness, whichever row follows.
- **Orchestrator:** `tools/gates.r5.shell-ui.mjs` shadows the carried rows it re-stages; `A-sighting` now reads `S._figureMat` and `S._figureRT`, and `A-map-triangles` reads `draw({washOnly:true})`.
- **engine-gpu / A-rt-ledger:** a new registered target, `shell-ui sighting figure mask`, half the scene target, RGBA8, no depth (about 1.8 MB at 1000x562), only while the alidade is up. The pass adds ≤ 8 mask draws per Instrument within 50 m, ≤ 3 out to 120 m, ≤ 12 for Brea, and one full-frame triangle.
- **combat-kit W2:** Steady's breath-hold (`timeScale` 1.0, 4 s), `wheel.*`, item renames; then delete `ITEM_DESC` and the matching `WORD_ROWS`.
- **instruments-a:** named parts turn `A62-*` and the "components with loot" clause of `A-sighting` on; `machine.cardWork` / `cardLine` are optional.
- **progression W3:** quest and skill text, `ctx.menus.map.revealTriangle`, `triangles()`, `setTriangles()`.
- **world-ground:** `sites.js` `SITES` / `TRIG` / `SCAR` are read through a namespace import, so they take effect the day they merge; `ctx.datum.regions()` paints the Datum regions.
- **world-sky:** `SKY` in the margin prints `environment.weather` uppercased, so `trade`, `calima`, `fogbank`, `squall` will print as they land.
