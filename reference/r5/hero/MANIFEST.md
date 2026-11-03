# reference/r5/hero — Brea's review sheets and references (hero-body, W0b)

Never shipped (not under `public/`). Two kinds of file live here:

1. **Review sheets for Kevin** (plan §3.1 W0b exit, §11 decision 1) — renders of the live build,
   made by `src/hero/sheets.js` through `tools/screenshot.mjs` on the lane port (tool and
   command in `docs/ROUND5-HERO-BODY.md` §5). Project-original renders.
2. **Comparison renders of the stock CC0 base** the face gate compares against.

The carried pose/framing references the hero-body visual rows (V1–V4, V12–V14, V22–V24) are
graded against are gates-perf's licence-clean Commons set, `reference/r5/gates-perf/` (merged
with gates-perf W0a; MANIFEST there: author, source URL, licence, retrieved date, sha256).

## Stored

| file | gates | what | source | licence | made | sha256 |
|---|---|---|---|---|---|---|
| brea-silhouette-sheet.png | V-brea-one-glance | Brea front / side (her right) / back / side (her left) / 3/4 at 64 px tall black fill (4x nearest + true size) and full colour, default loadout; §9's five cues stated verbatim under the views (fix round 1); fix round 3: the crescent fin 1.5x taller; fix round 4: staged idle facing N in the NE trade wind (the wrap tail is cloth in the world wind, streaming left-rear — fix round 3's posed rest kick retired), the alidade on its neck cord at the sternum; fix round 5: the wrap tail's knotted root leaves the knot out to the left-rear, the strip twists a quarter turn, and it flies in the trade wind (wind 3.5 /s) clear of the stowed bow's limb (A-tail-legible measures it); W0b targeted fix (Oct 30): the neutral idle (no fidget in progress), the wrap strip's cloth retuned (bend limit, air coupling, vertical air drag, a run-scaled flutter) — re-committed from run `w5/F1` | live build render (`silhouetteSheetOverlay`) | project-original | 2026-10-30 | `007569516da05353290e4e1c3bda9f5ef4b1a709955cc4e55fadd3429262b976` |
| brea-face-sheet.png | V-brea-face | Brea's face at 1.2 m (front, profile, 3/4), the stock UBC face (front, profile), the right hand with the ∴ (fix round 1: 1 cm salt-ink dots); fix round 4: the neck cord at the collar, the tail in the trade wind; fix round 5: the new wrap-tail root; W0b targeted fix (Oct 30): re-committed from run `w5/F1` (the retuned wrap cloth) | live build render (`faceSheetOverlay`) | project-original (stock panels: CC0 source) | 2026-10-30 | `3e71a5132d1c8cb2e5b1501fcf6c3e1516972eb5b7b70f06092c517c6759472d` |
| ubc-stock-front.png | V-brea-face, A-face-delta (visual) | the stock Quaternius UBC Superhero_Female face, front, same lens and lights | Universal Base Characters [Standard], https://quaternius.itch.io/universal-base-characters | CC0-1.0 (render of a CC0 model) | 2026-10-19 | `6c087129f5579ee5d9ed9e804532bffa71044a450cf410ae3a89fcf5a8d1aabe` |
| ubc-stock-profile.png | V-brea-face | the same, profile | same | CC0-1.0 | 2026-10-19 | `34ddd344ed9b3a6c65744d9769b9a158b650df1eb4d9aab458a5330a202d0f76` |

## Pointers (files in other lanes' reference folders)

W0b targeted fix: every hero-body visual row (and V22) now names its reference in its own `reference` field
(`tools/gates.r5.hero-body.mjs`), which is what gates-perf's `A-reference-set` reads; this table is a summary.

| gate | reference |
|---|---|
| V1-sprint-frame | `reference/r5/gates-perf/run-rear.jpg`, `run-side.jpg` |
| V12-sprint-vs-reference | `reference/r5/gates-perf/run-side.jpg` |
| V2-idle-frame | `reference/r5/gates-perf/idle-stand.jpg` |
| V3-crouch-stalk | `reference/r5/gates-perf/crouch-stalk.jpg` |
| V4-aim-anchor | `reference/r5/gates-perf/draw-front.jpg`, `draw-side.jpg` |
| V13-aim-strafe | `reference/r5/gates-perf/draw-front.jpg` |
| V24-draw-vs-reference, V24-draw-down | `reference/r5/gates-perf/draw-side.jpg` |
| V23-secondary-motion | `reference/r5/gates-perf/hair-trail-run.jpg` |
| V14-slope-contour, V-traversal (slide, stair) | `reference/r5/gates-perf/slope-stand.jpg` |
| V22-chase-framing | `reference/r5/gates-perf/chase-camera.jpg` |
| V-traversal (ledge climb) | PENDING: no licence-clean ledge-climb still in the Commons set yet — slot `ledge-climb` requested from gates-perf's `tools/r5-refs/fetch.mjs`; the climb panel is graded on the written criteria |
