# ROUND 5 — lane `shell-ui` (W1, pulled forward by R57)

Port 5265 · tree `~/.calima-r5/trees/shell-ui` · plan §2 row, §9 "shell-ui", R54–R57 · bible §9.1, §9.7, §8.9, §10.3.

The new custom UI: a field book and a set of engraved surveying instruments. Type is only Chakra Petch
and IBM Plex Mono (R55). Every surface is paper, ink, vermilion, cobalt; 1 px rules; right angles;
graduated ticks.

## 1. What was built

(filled at the end of the round: see §5 for the measured table)

| surface | file | what it is |
|---|---|---|
| tokens | `src/style.css` | bible palette as `--cal-*`; a real type scale (`--cal-type-*`); paper grain + foxing; motion curves; semantic colours `--cal-c-*` (the only ones the accessibility palettes re-point). Round-4 teal / violet / parchment tokens gone (`A-ui-language-static`) |
| HUD | `src/ui/hud.{js,css}` | levelling staff (10 graduations, E-pattern, damage eats from the right, a reading index that settles on a spring), gourd hairline + paper chip, field-note tracker, theodolite circle (ticks 5°, numerals 30°, 3-digit bearing chip, inertia on one transform), spirit-level exposure vial, Instrument plates `TILLER · SOIL CORE · TRANSECT 14` with a graduated bar and a leader, stadia reticle, draw scale, breath meter, kit tag, tool chips, Plex damage numbers, Flagged pennant |
| Sighting | `src/ui/focus.{js,css}` | the Alidade: sepia vignette ≤ 20 %, stadia crosshair, BRG / DST readouts, cobalt rings, dashed ink outlines, leaders to named chips, white transect dashes, a paper card pinned right |
| map | `src/ui/map.js` | survey sheet: paper, graticule, coast + waterlines + soundings; triangles open a wash + contours every 5 m + names; Datum Line in vermilion |
| menus | `src/ui/menu.js`, `settings.js`, `tips.js`, `style.css` | hub as a book page (station index, red margin rule), settings with a rebind list, death page, Field Manual, tutorial cards verbatim from bible §8.9 |
| satchel | `src/ui/inventory.{js,css}` | pockets, specimen cards with engraved marks, detail column, take-all chip |

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

src/ui/tips.js:      fieldWord(text) · cardLine(m) · cardParts(m) · TUTORIAL_CARDS · TIPS
src/ui/inventory.js: itemIcon(id) -> svg string · itemPlayerName(id, fallback) · LOOT_POPUP
machine.cardWork / machine.cardLine (optional, a kind may publish them; else CARD_WORK in tips.js)
```
