# ROUND 5 — lane `shell-ui` (W1, pulled forward by R57)

Port 5265 · tree `~/.calima-r5/trees/shell-ui` · plan §2 row, §9 "shell-ui", R54–R57 · bible §9.1, §9.7, §8.9, §10.3.

The new custom UI: a field book and a set of engraved surveying instruments. Type is only Chakra Petch
and IBM Plex Mono (R55). Every surface is paper, ink, vermilion, cobalt; 1 px rules; right angles;
graduated ticks. Lane gates: `nice -n 10 node tools/gates.mjs --port 5265 --lane shell-ui`.

## 1. What was built

| surface | file | what it is |
|---|---|---|
| tokens | `src/style.css` | bible palette as `--cal-*`; a real type scale (`--cal-type-*`: 10 steps, 11 px floor); paper grain + foxing; two motion curves; semantic colours `--cal-c-*` (the only ones the accessibility palettes re-point). Round-4 teal, Sighting violet and parchment tokens are gone (`A-ui-language-static`) |
| HUD | `src/ui/hud.{js,css}` | levelling staff (10 graduations, E-pattern, damage eats from the right, reading index settles on a spring), gourd hairline + paper chip, field-note tracker, theodolite circle (ticks 5°, numerals 30°, cardinals above the limb, 3-digit bearing chip, inertia on one transform), spirit-level exposure vial (dark glass, only the bubble wears the state), Instrument plates `TILLER · SOIL CORE · TRANSECT 14` with a graduated bar and a leader, stadia reticle, draw scale, breath meter, kit tag, tool chips, Plex damage numbers, Flagged pennant. A damage number keeps off what she reads (`_dmgClear`: the circle band, the vial's word, the column, every plate) and its pop-in scale lives in the same transform, about its own bottom centre, so a number still popping already stands where it was placed (`A-dmg-chip-clear`) |
| plate layout | `hud.js _updateMachineBars` | plates resolve against the fixed instruments (column, circle + vial) and against each other: the most recently hit holds its place, the others step down. An Instrument with a plate no longer also wears an awareness mark; its attack flash moves to the plate's iris. Marks on the circle that crowd share one distance reading (the nearest's) |
| Sighting | `src/ui/focus.{js,css}` | the Alidade: sepia vignette ≤ 20 %, stadia crosshair, BRG / DST chip on the upper hair, cobalt rings, leaders to named chips, a paper card pinned right. **Everything 3D is drawn after the composer** (`engine.onAfterRender`), on the finished frame: no grade, bloom or AO touches a hairline, and the scene's depth texture is free to read. **The figure:** one Instrument is drawn in full, the one under the crosshair (else the nearest): a half-res 4x MSAA mask, dilated into a paper core on a lapilli casing, so a strut one pixel wide is a line and never a row of flecks. The dash is anchored on the Instrument (polar angle round its projected centre plus radius), not on the screen. The three nearest others get a quiet solid hairline; nobody else gets anything. **Behind her:** her real meshes (every skinned one first, then what she holds, largest first, at most 6, re-read on the poll, every ancestor's `visible` tested each frame) hold the mask's blue channel, and nothing the alidade draws goes over them. **Through cover:** off the scene's depth, anything between the lens and the sighted Instrument leaves its line at a quiet 38 %, so the figure still reads through grass and trunks. **Chips:** reveals step off her, off the sighted Instrument and off the HUD's objective mark with its metres; an unread Field Book shows its kind of record, not its title. A chip writes its position only when the pixel changes. **Transects** are a fat line in screen space, 1.5 px on a 3.6 px casing at every distance: dashes in metres, a station tick every 7.5 m, steady past where a dash can be drawn, the sighted Instrument's and the nearest other's only |
| map | `src/ui/map.js` | survey sheet: paper, graticule, coast + waterlines + soundings; triangles open a wash + contours every 5 m + names; Datum Line in vermilion; names placed on whichever side of a mark is free, a site with no free side reads on hover. Her mark is a solid vermilion dart on an ink station point (legend `POSITION`), never the objective's open arrow, and it points where she looks (`A-map-arrow-heading`); an objective on her own spot steps aside on a leader. Her dart and the stepped-aside objective claim their ground before any name is placed, so a place name never lands under either. `sites.js` is the sheet's gazetteer: the Round-4 props' landmarks stay off it |
| hub | `src/ui/menu.js`, `style.css` | a book: margin column with a levelling-staff fore-edge, station index, field data (hour, sky, E, N, BRG), red margin rule, graduated head rule, page block edges, an engraved theodolite plate drawn from arithmetic at the foot of a page (no asset), page-turn settle. The HUD rests under an open book |
| title, death | `menu.js`, `style.css` | title stations over the live vista (disabled row is a ghost, not a smudge); death page, Field Manual modal in every boot path |
| settings | `src/ui/settings.js`, `style.css` | three columns: controls + camera + interface, audio + restore, keys. Every row and every rebind on the page with no scroll (`A-settings-rows-visible`: the KEYS list used to be clipped off the right of a two-column layout) |
| tips | `src/ui/tips.js` | tutorial cards verbatim from bible §8.9; `fieldWord` now memoized |
| satchel | `src/ui/inventory.{js,css}` | pockets, specimen cards with engraved marks, detail column, take-all chip. Field Books headings come from the page's own table by category id (`bookHeading`), so no catalogue label reaches the page: the lint forbids spelling the retired one in a word row |
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
engine ledger row:   'shell-ui sighting figure mask' (RGBA8, half the drawing buffer, 4x MSAA, no depth; allocated only while the alidade is up or a component outline lingers; ctx.sighting.dispose() unregisters it)
engine hook:         engine.onAfterRender holds ctx.sighting._afterComposer (one branch while nothing is up; dispose() removes it)
ctx.sighting.overlayDraws() -> { mask, own, total }     // what the raised alidade adds to the frame right now (R61 d)
ctx.sighting.audit().figure -> { subject, quiet, draws } // who is drawn
ctx.sighting.debugOcclusion(on)                          // the negative control of A-sighting-over-brea
```

Consumed: `engine.depthTexture`, `ctx.water.seaLevel`, `ctx.terrain.getHeight`, `island/sites.js` (`TRIG`, `SITES`, `SCAR`, `REST`), `ctx.datum.regions()/regionTrue()` when W2 lands, `combat.steady`, `ctx.machines.list`, `ctx.progression.*`.

## 3. Gates

Measured on 5265, `nice -n 10`, machine care per R53, one Chrome. Fix round 1, Nov 6: the full lane block (58 rows) plus the global list in one run (`fix2/l2`), then the Sighting, map and sheet rows again after the last changes (`fix2/l3`). Lane block: 0 FAIL; 4 PENDING (A10, A62 x2, V-ui-sheet's runner waits for a judge); every V row needs its judge.

| row | result | numbers |
|---|---|---|
| A-ui-language-static | PASS | 0 offenders, 0 teal, 10-step type scale in tokens, retired tokens 0 |
| A-ui-type-only | PASS | 12 surfaces (hud 47, map 80, settings 155, satchel 93, making 116, books 118, log 68, skills 103, Sighting 79, dialogue 90, tip 74, death 49 text nodes); 0 outside the two families; 0 numerals outside Plex |
| A-ui-words-all | PASS | 58 surfaces, 0 hits; quest and skill text is a named pending clause (progression W3) |
| A-settings-rows-visible | PASS | 40 rows, 19 of 19 rebinds, 0 clipped, overflow 0 px |
| A-lamp-canon-distance-ui | PASS | 32 tokens, 0 offenders |
| A71-compass-truth | PASS | 0 pips at spawn, +1 on a Flag, lamp colour + iris aperture, 3-digit bearing |
| A71b-hud-scale-floor | PASS | min font 11 px at 720p and 900p, 20.8 px at 4K; plate 280 px at 1x |
| A71c-hud-surfaces | PASS | 10 graduations, vermilion + staff white, `inset(0 60% 0 0)` at 40 %, gourd, plates, vial, tools, kit tag, stadia |
| A71d-steady-breath-meter, A71d-conc-veil | PASS | hairline 2 px, 50 px under the reticle, fill tracks the gauge (0.56 at 2.6 s), 0 overlays, 0 filter. Pending clause: `timeScale` 0.35 and the 6 s drain are combat-kit W2's |
| A71e-tutorial-cards | PASS | 18 of 18 cards in the bible's order and text, one-shot |
| A71f, A71g, A71h, A68, A69, A70, A70b, A70c, A72, A72b, A63 | PASS | Round-4 bars (A63: 3 reveals, 0 overlaps, 0 off screen) |
| A-sighting-off, A-sighting | PASS (l3) | see §6; cobalt ring `rgb(44,79,138)`, leaders, vignette centre 0 / max 0.20, figure drawn, one subject in full, <= 2 transects, reveals off the subject. Pending clause: components with loot (R18, no named parts until instruments-a) |
| A-sighting-hue | PASS | added violet 0 px, added teal 0 px (R61 c floor 24, no tolerance) |
| A-sighting-over-brea (new) | PASS | 0 px added inside her 52 669 px; control 2 437 px; 0 chip px on her |
| A-transect-fine (new) | PASS | p95 2 px, p50 1 px, max 13 px (a station tick) |
| A-sighting-draws (new, R61 d) | PASS | +16 draws held, +17 on the sweep frame (cap 30). Pending clause: the Screed fight <= 350 with the alidade up, A21 from the W2 exit |
| A-map-triangles, -reload | PASS | 0 px before; T1+T2+T6 paints 90 268 px against 89 750 of geometry (0.58 %); survives a real reload |
| A-map-arrow-heading (new) | PASS | tip dot 1.000 / 1.000 / 1.000 / 0.999 at four yaws; objective gives way, her pixels 163 / 163 |
| A-dmg-chip-clear (new) | PASS | 0 hits on vial word, circle, column, plate at 3 / 14 / 24 frames; open-ground number stays on its anchor |
| A10-loot-single-render | PENDING | no sentry kind yet: Plumb, instruments-a W1 |
| A62-sighting-components, A62-focus-components | PENDING | R18: the Tiller fixture has no named parts until instruments-a merges |
| V-ui-sheet | NEEDS JUDGE | `fix2/l3/shots/gates/V-ui-sheet.png`, nine surfaces from one run |
| V10, V37, V36, V36-focus-scan, V-map, V-ui-title, -inventory, -settings, -pause, -tip, -death, -dialogue, -books, -making, -skills, -trade, V-hud-4k-a..d, V-ui-4k-a, -b | NEEDS JUDGE | filmed at 1600x900 and read by the builder (R29: advisory) |

Global green list on this tree (`fix2/l2`, 5265, quiet box: load 2.7, one Chrome):

| row | result | numbers |
|---|---|---|
| A1, A20b | PASS | boot clean; 358 frames, 0 system errors |
| A9 | PASS | 59.9 fps median, 241 draws, quiet box |
| A21 | counters PASS, timing FAIL (graded at the W1 exit, R58) | draws 248 / 183 / 275 of 350; triangles 3.66 / 3.87 / 3.93 M; medianGpuMs 20.6 / 41.8 / 20.7 against 14. The shell draws nothing in the world unless the alidade is up |
| A90-memory-stability, A90b, A90-rig-reclaim | PASS | objects -34, heap -2.4 %, 30 kills; rig 0 geo / 0 tex growth over 30 cycles |
| A90-memory-stability-expansion | PASS | `nonMachineGrowth` 0, objects +70 (machines), heap -5.2 % |
| A90-abs | PASS | post-GC heap 82.5 MB (450), GPU process 1202.88 MB (1500) |
| A-alloc-rate | baseline guard FAIL on other owners; shell-ui row not an offender | shell-ui 198.68 KB/s against its baseline 588.51 (0.338x). Offender: world-sky 1.18x. srcTotal is terrain's `noise2D` / `getHeight` (world-ground's W1 fix, R58 c) |
| A-vram-ledger | PASS | textures 63.39, targets 127.27, geometry 79.25, total 269.91 MB of 450; 0 unattributed |
| A-ID-ip-assets-gone, A-assets-tracked | PASS | |
| A-no-horizon-terms-player | PASS | 1451 of the 1508 ratchet |
| A-no-horizon-terms-code | PASS | 1311 of 1371, 0 uncovered, 0 over cap |
| A-licence-manifest | PENDING | third-party clause only; no asset added by this lane |
| A-port-guard, A-carried-suite | orchestrator | need a full or sealed run |
| A-reach-all-sites | not registered on this tree | world-ground W1 |

## 4. Honest gaps

- **Per-function allocation.** The shell's row is 0.338x of its baseline (198.68 KB/s), but functions are still over the 4 KB/s bar that binds at the W2 exit: `Menus._raf` 37.8, `_updateQuestPips` 34.5, `_updateMachineBars` 31.5, `_updateCompass` 27.8 KB/s and smaller ones. Second pass due at W2.
- **The overlay's GPU time is outside A21's timer.** About 1.6 ms while the alidade is up (`J-overlay-gpu`, §6). `A-sighting-draws`' `overlayGpu` bracket over-reads it (it absorbs the composer's deferred pass on Metal/ANGLE); a cleaner instrument belongs with A21's alidade-up clause at W2.
- **V36's composition.** At the yaw where the card stays up (0.15 rad, `_pickTarget`'s reach at 15 m) the tip of her lance crosses the LAMP ring; the Tiller's body stands clear of her. 0.22 rad clears the lance and loses the card.
- **Soundings read inland on this tree.** The Round-4 terrain's basin sits below sea level, so V-map shows soundings inside the outline. The bake reads `ctx.water.seaLevel`, which world-ground's island publishes; re-film V-map when it merges, and judge "soundings offshore" then.
- **Round-4 words the shell cannot reach:** log and skills text (progression W3), item names such as FIRE ARROW, TRIPWIRE, BLAST BOMB and VIGOUR DRAUGHT (combat-kit W2), `Varl`, `the campfire`, `Lessons of the Valley` (progression W3), and Field Book record titles such as one naming a Round-4 machine (the catalogue is progression W3's; the code lint forbids spelling it in a word row, so it is not word-swapped here). `ITEM_DESC` in `inventory.js` holds the one catalogue line `fieldWord` cannot word-swap without spelling a forbidden word. Round-4 prop landmarks and activity marks are off the sheet, so the sheet shows `sites.js` only.
- **The Kit Rack** still reads its Round-4 smoked-glass sheet (`wheel.css`): combat-kit W2, as ordered. Not filmed as a surface here.
- **Steady:** the meter is right, the mechanic under it is not yet (0.35 time scale, 6 s drain).
- **Aim and Sprint hold/toggle** are stored but not applied: `player.js` is frozen. The rows say NOT LIVE YET.
- **Bow wording:** TIPS say what the bow does today (RMB aims, LMB draws, release looses); the bible's card says `RMB draw, LMB loose`. They reconcile when the bow control changes.
- **Independent judges have not seen this round's frames.** The r0 judges saw the previous build; every V row above is the builder's own reading, which R29 makes advisory.
- **World under the UI.** Tree shadows, the Round-4 camp and the valley are what the frames sit on; every world lane's work changes how these frames read.

## 5. For other lanes and the orchestrator

- **Orchestrator:** `V-ui-sheet` needs its other rows in the same run (it composes the shots); it is registered last because the first page after it has twice hit a 90 s `Waiting failed` retry in the harness, whichever row follows.
- **Orchestrator:** `tools/gates.r5.shell-ui.mjs` shadows the carried rows it re-stages; `A-sighting` now reads `S._figureMat` and `S._figureRT`, and `A-map-triangles` reads `draw({washOnly:true})`.
- **engine-gpu / A-rt-ledger:** a registered target, `shell-ui sighting figure mask`, half the drawing buffer, RGBA8, 4x MSAA, no depth (about 7.2 MB at 800x450), only while the alidade is up. **A21 / the timer query:** the overlay runs in `onAfterRender`, after the engine's timer query ends, so `medianGpuMs` does not see it; `A-sighting-draws` times it on its own and `renderer.info` still counts its draws.
- **combat-kit W2:** Steady's breath-hold (`timeScale` 1.0, 4 s), `wheel.*`, item renames; then delete `ITEM_DESC` and the matching `WORD_ROWS`.
- **instruments-a:** named parts turn `A62-*` and the "components with loot" clause of `A-sighting` on; `machine.cardWork` / `cardLine` are optional.
- **progression W3:** quest and skill text, `ctx.menus.map.revealTriangle`, `triangles()`, `setTriangles()`.
- **world-ground:** `sites.js` `SITES` / `TRIG` / `SCAR` are read through a namespace import, so they take effect the day they merge; `ctx.datum.regions()` paints the Datum regions.
- **world-sky:** `SKY` in the margin prints `environment.weather` uppercased, so `trade`, `calima`, `fogbank`, `squall` will print as they land.

## 6. Fix round 1 (judges' findings, Nov 4; re-run Nov 6)

Every finding below was re-run on 5265 and the cited frames re-filmed and read. Frames and logs:
`/private/tmp/claude-501/-Users-kevinliu-Horizon-Zero-Claude/db31a0fa-9701-46f4-8234-5158425c1e49/scratchpad/r5/shell-ui/fix2/{l1,l2,l3}/`.

| finding | what changed | measured now |
|---|---|---|
| V36: dashed outlines read as crumbs and static; near transects read as road paint; 13 routes; subject buried | The figure is a half-res 4x MSAA coverage mask, dilated into bands (`FIGURE_FS`): a paper core on a lapilli casing, so a one-pixel strut is a line. The dash is anchored on the Instrument (polar angle round its centre plus radius), not the screen. Only the sighted Instrument is drawn in full; the three nearest others get a quiet solid hairline. Transects are a screen-space fat line (1.5 px core on a 3.6 px casing at every distance) with a station tick every 7.5 m, two at most. The stage finds a clear bearing by occlusion (no coordinate) and turns 0.15 rad off her, the most `_pickTarget` allows at 15 m with the card up (0.22 loses the card: measured, `l2` A-sighting) | `A-transect-fine`: p95 run 2 px, p50 1 px, 1 path; `A-sighting`: 2 routes, figure mask 0.6-0.8 % of the target, 1 subject + up to 3 quiet; V36 / J-sight-clear / J-sight-close / J-sight-noon read at 3x: one dashed contour with its casing, legs through grass at 38 % |
| A-sighting-hue passed at 0.02 % | The tolerance is gone; R61 (c)'s floor (largest channel < 24 is not counted) is the only exclusion | added violet 0 px, added teal 0 px, 0 px even under the floor |
| V-map soundings offshore | R61 (a): PENDING until world-ground's island merges; written into the row's criteria. No shell change | soundings logic unchanged (`map.js` draws them only where sea - height >= 1) |
| V10 / V37: damage chip on the vial word and a plate | `_dmgClear` keeps a number off the circle band, the vial and its word, the column and every plate, as plates already resolve. The remaining collision was the pop-in: `style.scale` scaled the number's whole translation about the layer's corner, so a popping number stood up to 18 % higher than placed. The pop now lives in the same transform about its own bottom centre (`dmgY(y, si)`, `transform-origin: 50% 100%`) | `A-dmg-chip-clear` (new): vial word, circle, column and plate anchors 0 hits at 3, 14 and 24 frames; in the open it stays on its anchor (575 vs the projected 594 minus its rise). V37: vial reads SPOTTED, plate names clear |
| Verdigris on GATHER chips and uncommon cards | `--cal-c-good`, `--cal-r-uncommon` and `.calf-reveal.k-gather` point at Felt Moss `#56603F` (bible §9.1 faction colour), hue 78 deg | A-ui-language-static 0 teal; A-sighting DOM scan 0 hits |
| Quest and dialogue words on V-ui-pause / V-ui-dialogue | R61 (b): PENDING until progression W3 and settlements W2, in those rows' criteria. The same quest text prints on V-ui-tip (field note and objective mark), so that row names the same pending clause and asks the orchestrator to rule it likewise | A-ui-words-all 0 hits over 58 surfaces; pending list names the quest/skill strings |
| The alidade drew over Brea | Her mask holds every skinned mesh first, then the largest of what she holds (6 at most), each frame through every ancestor's `visible`. Transects and the figure knock out on the mask's blue channel | `A-sighting-over-brea` (new, keeps her visible, its own silhouette from all her visible meshes): 0 added px inside her (52 669 px), control with the knock-out off adds 2 437; 0 reveal chip px on her |
| Her map arrow pointed backwards | `g.rotate(-yaw)`; her mark is now a solid dart with an ink station point, not the objective's open arrow; an objective on her spot steps aside on a leader; both claim ground before names | `A-map-arrow-heading` (new): tip dot 1.000 / 1.000 / 1.000 / 0.999 at four yaws, objective gives way with her pixels unchanged (163 vs 163) |
| A Round-4 proper noun as a Field Books heading | Headings come from `bookHeading(category id)`; an unknown category is a Fogcatcher record. V rows added for Field Books, Making, Skills and Trade | V-ui-books reads FOGCATCHER RECORDS · 3/6 |

Also this round: the Sighting reveal chips step off the HUD's objective mark (a LOOT chip printed over `62 m` in V36), and the label and reveal pools write `left` / `top` only when the pixel changes.

**What the raised alidade costs** (`J-overlay-gpu`, a probe, frozen herd at 15 m): the engine's own composer timer reads 20.2 ms down and 20.9 ms up. A timer bracketing the overlay hook reads 8.15 ms, but the same bracket around nothing but a render-target switch reads 6.57 ms: on this Metal/ANGLE path the bracket absorbs the composer's deferred final pass. The overlay's own cost is therefore about 1.6 ms. `A-sighting-draws`' `overlayGpu` (7.97 ms) is that same bracket and over-reads the same way. Draws: +16 held, +17 on the sweep frame, cap 30 (R61 d). 30 raises return the scene, mask, overlay, geometries, textures and DOM to their counts (`J-sight-cycle`, heap -15.8 MB).
