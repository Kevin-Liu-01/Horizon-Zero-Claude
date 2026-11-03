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

GATE_TABLE

## 4. Honest gaps

GAPS

## 5. For other lanes and the orchestrator

OTHERS
