# Audio bank — the slice (BUILD M1.6k) and the first hour (Milestone 2)

Every file in `public/audio/` is **synthesized by this repository's own code** and released under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). No recording and no third-party audio is bundled.

| field | value |
|---|---|
| files | 224 |
| sets | 137 (122 counted cues: 77 the slice's, 45 the first hour's) |
| total size | 5.02 MB (budget 8 MB in Milestone 1, 12 MB in Milestone 2) |
| load | boot 3.56 MB (166 files, before control); late 1.46 MB (58 files, after New Game or Continue gives control) |
| format | Ogg Opus, 48 kHz (48 kb/s mono point sources, 96 kb/s stereo beds and music) |
| recipes | `src/audio/slice/recipes.js`, `src/audio/m2/recipes.js` (deterministic; seeds per set in `tools/gates/audio/build-bank.mjs`) |
| cue list | `src/audio/slice/cues.js` with `src/audio/m2/cues.js` (bus, range, place, level) |
| runtime index | `src/audio/manifest.js` (generated) |

Brea's breath and effort set (`brea/`) is the existing synthesized set, kept until Milestone 3 regenerates it.

| file | set | ch | duration | size | bus | load |
|---|---|---|---|---|---|---|
| `foot/gravel-1.ogg` | `foot/gravel` | 1 | 0.42 s | 2.1 KB | brea | boot |
| `foot/gravel-2.ogg` | `foot/gravel` | 1 | 0.42 s | 2.1 KB | brea | boot |
| `foot/gravel-3.ogg` | `foot/gravel` | 1 | 0.42 s | 4.0 KB | brea | boot |
| `foot/gravel-4.ogg` | `foot/gravel` | 1 | 0.42 s | 2.1 KB | brea | boot |
| `foot/dirt-1.ogg` | `foot/dirt` | 1 | 0.42 s | 2.4 KB | brea | boot |
| `foot/dirt-2.ogg` | `foot/dirt` | 1 | 0.42 s | 2.4 KB | brea | boot |
| `foot/dirt-3.ogg` | `foot/dirt` | 1 | 0.42 s | 2.5 KB | brea | boot |
| `foot/dirt-4.ogg` | `foot/dirt` | 1 | 0.42 s | 2.5 KB | brea | boot |
| `foot/rock-1.ogg` | `foot/rock` | 1 | 0.42 s | 2.6 KB | brea | boot |
| `foot/rock-2.ogg` | `foot/rock` | 1 | 0.42 s | 2.6 KB | brea | boot |
| `foot/rock-3.ogg` | `foot/rock` | 1 | 0.42 s | 2.6 KB | brea | boot |
| `foot/rock-4.ogg` | `foot/rock` | 1 | 0.42 s | 2.6 KB | brea | boot |
| `foot/water-1.ogg` | `foot/water` | 1 | 0.50 s | 3.1 KB | brea | boot |
| `foot/water-2.ogg` | `foot/water` | 1 | 0.50 s | 3.1 KB | brea | boot |
| `foot/water-3.ogg` | `foot/water` | 1 | 0.50 s | 3.1 KB | brea | boot |
| `foot/water-4.ogg` | `foot/water` | 1 | 0.50 s | 3.1 KB | brea | boot |
| `foot/silt-1.ogg` | `foot/silt` | 1 | 0.42 s | 2.7 KB | brea | boot |
| `foot/silt-2.ogg` | `foot/silt` | 1 | 0.42 s | 2.6 KB | brea | boot |
| `foot/silt-3.ogg` | `foot/silt` | 1 | 0.42 s | 2.6 KB | brea | boot |
| `foot/silt-4.ogg` | `foot/silt` | 1 | 0.42 s | 2.7 KB | brea | boot |
| `foot/cobble-1.ogg` | `foot/cobble` | 1 | 0.42 s | 3.5 KB | brea | boot |
| `foot/cobble-2.ogg` | `foot/cobble` | 1 | 0.42 s | 2.2 KB | brea | boot |
| `foot/cobble-3.ogg` | `foot/cobble` | 1 | 0.42 s | 2.9 KB | brea | boot |
| `foot/cobble-4.ogg` | `foot/cobble` | 1 | 0.42 s | 2.3 KB | brea | boot |
| `foot/grass-1.ogg` | `foot/grass` | 1 | 0.42 s | 2.7 KB | brea | boot |
| `foot/grass-2.ogg` | `foot/grass` | 1 | 0.42 s | 2.7 KB | brea | boot |
| `foot/grass-3.ogg` | `foot/grass` | 1 | 0.42 s | 2.7 KB | brea | boot |
| `foot/grass-4.ogg` | `foot/grass` | 1 | 0.42 s | 2.7 KB | brea | boot |
| `cloth/brush-1.ogg` | `cloth/brush` | 1 | 0.32 s | 2.1 KB | brea | boot |
| `cloth/brush-2.ogg` | `cloth/brush` | 1 | 0.32 s | 2.1 KB | brea | boot |
| `cloth/brush-3.ogg` | `cloth/brush` | 1 | 0.32 s | 2.1 KB | brea | boot |
| `cloth/brush-4.ogg` | `cloth/brush` | 1 | 0.32 s | 2.1 KB | brea | boot |
| `cloth/flap-1.ogg` | `cloth/flap` | 1 | 0.45 s | 2.2 KB | brea | boot |
| `cloth/flap-2.ogg` | `cloth/flap` | 1 | 0.45 s | 2.3 KB | brea | boot |
| `cloth/flap-3.ogg` | `cloth/flap` | 1 | 0.45 s | 2.2 KB | brea | boot |
| `gear/light-1.ogg` | `gear/light` | 1 | 0.30 s | 1.6 KB | brea | boot |
| `gear/light-2.ogg` | `gear/light` | 1 | 0.30 s | 3.7 KB | brea | boot |
| `gear/heavy-1.ogg` | `gear/heavy` | 1 | 0.40 s | 2.6 KB | brea | boot |
| `gear/heavy-2.ogg` | `gear/heavy` | 1 | 0.40 s | 2.5 KB | brea | boot |
| `make/quick-1.ogg` | `make/quick` | 1 | 0.62 s | 4.9 KB | brea | boot |
| `make/quick-2.ogg` | `make/quick` | 1 | 0.62 s | 4.9 KB | brea | boot |
| `bow/nock-1.ogg` | `bow/nock` | 1 | 0.18 s | 2.1 KB | brea | boot |
| `bow/nock-2.ogg` | `bow/nock` | 1 | 0.18 s | 2.0 KB | brea | boot |
| `bow/draw.ogg` | `bow/draw` | 1 | 0.85 s | 5.1 KB | brea | boot |
| `bow/creak.ogg` | `bow/creak` | 1 | 2.00 s | 14.3 KB | brea | boot |
| `bow/loose-1.ogg` | `bow/loose` | 1 | 0.70 s | 4.5 KB | brea | boot |
| `bow/loose-2.ogg` | `bow/loose` | 1 | 0.70 s | 4.5 KB | brea | boot |
| `bow/loose-3.ogg` | `bow/loose` | 1 | 0.70 s | 4.5 KB | brea | boot |
| `bow/flyby-1.ogg` | `bow/flyby` | 1 | 0.50 s | 3.4 KB | brea | boot |
| `bow/flyby-2.ogg` | `bow/flyby` | 1 | 0.50 s | 3.4 KB | brea | boot |
| `bow/hit-1.ogg` | `bow/hit` | 1 | 0.70 s | 5.9 KB | sfx | boot |
| `bow/hit-2.ogg` | `bow/hit` | 1 | 0.70 s | 6.2 KB | sfx | boot |
| `bow/hit-3.ogg` | `bow/hit` | 1 | 0.70 s | 6.1 KB | sfx | boot |
| `bow/hit-weak-1.ogg` | `bow/hit-weak` | 1 | 0.90 s | 11.7 KB | sfx | boot |
| `bow/hit-weak-2.ogg` | `bow/hit-weak` | 1 | 0.90 s | 11.7 KB | sfx | boot |
| `bow/miss-1.ogg` | `bow/miss` | 1 | 0.40 s | 2.9 KB | sfx | boot |
| `bow/miss-2.ogg` | `bow/miss` | 1 | 0.40 s | 2.8 KB | sfx | boot |
| `bow/miss-3.ogg` | `bow/miss` | 1 | 0.40 s | 2.8 KB | sfx | boot |
| `bow/empty.ogg` | `bow/empty` | 1 | 0.15 s | 1.7 KB | brea | boot |
| `lance/draw.ogg` | `lance/draw` | 1 | 0.60 s | 3.8 KB | brea | boot |
| `lance/swing-1.ogg` | `lance/swing` | 1 | 0.42 s | 2.7 KB | brea | boot |
| `lance/swing-2.ogg` | `lance/swing` | 1 | 0.42 s | 2.7 KB | brea | boot |
| `lance/swing-3.ogg` | `lance/swing` | 1 | 0.42 s | 2.7 KB | brea | boot |
| `lance/hit-1.ogg` | `lance/hit` | 1 | 0.60 s | 4.4 KB | sfx | boot |
| `lance/hit-2.ogg` | `lance/hit` | 1 | 0.60 s | 4.7 KB | sfx | boot |
| `lance/hit-3.ogg` | `lance/hit` | 1 | 0.60 s | 4.5 KB | sfx | boot |
| `lance/heavy-1.ogg` | `lance/heavy` | 1 | 0.90 s | 7.2 KB | sfx | boot |
| `lance/heavy-2.ogg` | `lance/heavy` | 1 | 0.90 s | 7.5 KB | sfx | boot |
| `lance/pry.ogg` | `lance/pry` | 1 | 1.20 s | 11.3 KB | sfx | boot |
| `alidade/raise.ogg` | `alidade/raise` | 1 | 0.45 s | 4.3 KB | brea | boot |
| `alidade/bearing.ogg` | `alidade/bearing` | 1 | 1.20 s | 13.5 KB | brea | boot |
| `lamp/calm.ogg` | `lamp/calm` | 1 | 0.34 s | 1.9 KB | inst | boot |
| `lamp/wary.ogg` | `lamp/wary` | 1 | 0.42 s | 2.8 KB | inst | boot |
| `lamp/hostile.ogg` | `lamp/hostile` | 1 | 0.48 s | 4.7 KB | inst | boot |
| `lamp/dark.ogg` | `lamp/dark` | 1 | 0.60 s | 3.1 KB | inst | boot |
| `plumb/gyro.ogg` | `plumb/gyro` | 1 | 4.00 s | 32.2 KB | inst | boot |
| `plumb/servo-1.ogg` | `plumb/servo` | 1 | 0.50 s | 4.1 KB | inst | boot |
| `plumb/servo-2.ogg` | `plumb/servo` | 1 | 0.50 s | 4.3 KB | inst | boot |
| `plumb/servo-3.ogg` | `plumb/servo` | 1 | 0.50 s | 4.3 KB | inst | boot |
| `plumb/chime.ogg` | `plumb/chime` | 1 | 2.60 s | 22.4 KB | inst | boot |
| `plumb/vial-1.ogg` | `plumb/vial` | 1 | 1.00 s | 12.7 KB | inst | boot |
| `plumb/vial-2.ogg` | `plumb/vial` | 1 | 1.00 s | 12.7 KB | inst | boot |
| `plumb/topple.ogg` | `plumb/topple` | 1 | 2.40 s | 22.2 KB | inst | boot |
| `plumb/bob-1.ogg` | `plumb/bob` | 1 | 0.90 s | 5.4 KB | inst | boot |
| `plumb/bob-2.ogg` | `plumb/bob` | 1 | 0.90 s | 5.5 KB | inst | boot |
| `peg/mallet-1.ogg` | `peg/mallet` | 1 | 0.60 s | 5.5 KB | inst | boot |
| `peg/mallet-2.ogg` | `peg/mallet` | 1 | 0.60 s | 5.5 KB | inst | boot |
| `peg/mallet-3.ogg` | `peg/mallet` | 1 | 0.60 s | 5.5 KB | inst | boot |
| `peg/shot-1.ogg` | `peg/shot` | 1 | 0.70 s | 3.8 KB | inst | boot |
| `peg/shot-2.ogg` | `peg/shot` | 1 | 0.70 s | 3.8 KB | inst | boot |
| `peg/rush.ogg` | `peg/rush` | 1 | 0.90 s | 10.3 KB | inst | boot |
| `peg/idle.ogg` | `peg/idle` | 1 | 2.00 s | 23.1 KB | inst | boot |
| `gauge/sluice.ogg` | `gauge/sluice` | 1 | 4.00 s | 22.2 KB | sfx | boot |
| `gauge/gate.ogg` | `gauge/gate` | 1 | 1.40 s | 14.2 KB | sfx | boot |
| `gauge/stilt-1.ogg` | `gauge/stilt` | 1 | 0.80 s | 6.7 KB | inst | boot |
| `gauge/stilt-2.ogg` | `gauge/stilt` | 1 | 0.80 s | 6.7 KB | inst | boot |
| `gauge/stilt-3.ogg` | `gauge/stilt` | 1 | 0.80 s | 6.7 KB | inst | boot |
| `gauge/float.ogg` | `gauge/float` | 1 | 1.30 s | 11.0 KB | inst | boot |
| `gauge/idle.ogg` | `gauge/idle` | 1 | 3.00 s | 20.3 KB | inst | boot |
| `inst/servo.ogg` | `inst/servo` | 1 | 3.00 s | 23.3 KB | inst | boot |
| `inst/windup.ogg` | `inst/windup` | 1 | 0.70 s | 8.2 KB | inst | boot |
| `inst/strike-1.ogg` | `inst/strike` | 1 | 0.70 s | 6.8 KB | inst | boot |
| `inst/strike-2.ogg` | `inst/strike` | 1 | 0.70 s | 6.6 KB | inst | boot |
| `inst/stagger.ogg` | `inst/stagger` | 1 | 0.80 s | 8.0 KB | inst | boot |
| `inst/powerdown.ogg` | `inst/powerdown` | 1 | 1.80 s | 15.9 KB | inst | boot |
| `inst/collapse.ogg` | `inst/collapse` | 1 | 1.60 s | 13.5 KB | inst | boot |
| `mstep/light-1.ogg` | `mstep/light` | 1 | 0.30 s | 1.6 KB | inst | boot |
| `mstep/light-2.ogg` | `mstep/light` | 1 | 0.30 s | 1.6 KB | inst | boot |
| `mstep/light-3.ogg` | `mstep/light` | 1 | 0.30 s | 1.6 KB | inst | boot |
| `mstep/medium-1.ogg` | `mstep/medium` | 1 | 0.45 s | 3.1 KB | inst | boot |
| `mstep/medium-2.ogg` | `mstep/medium` | 1 | 0.45 s | 3.0 KB | inst | boot |
| `mstep/medium-3.ogg` | `mstep/medium` | 1 | 0.45 s | 3.0 KB | inst | boot |
| `mstep/heavy-1.ogg` | `mstep/heavy` | 1 | 0.70 s | 4.3 KB | inst | boot |
| `mstep/heavy-2.ogg` | `mstep/heavy` | 1 | 0.70 s | 4.8 KB | inst | boot |
| `mstep/heavy-3.ogg` | `mstep/heavy` | 1 | 0.70 s | 4.8 KB | inst | boot |
| `amb/pans.ogg` | `amb/pans` | 2 | 20.00 s | 208.0 KB | ambience | boot |
| `amb/trade.ogg` | `amb/trade` | 2 | 16.00 s | 165.8 KB | ambience | boot |
| `amb/saltrow.ogg` | `amb/saltrow` | 2 | 24.00 s | 249.5 KB | ambience | boot |
| `amb/shore.ogg` | `amb/shore` | 2 | 24.00 s | 245.4 KB | ambience | boot |
| `amb/cane-gust.ogg` | `amb/cane-gust` | 2 | 8.00 s | 91.4 KB | ambience | boot |
| `amb/cane-lull.ogg` | `amb/cane-lull` | 2 | 8.00 s | 123.0 KB | ambience | boot |
| `amb/gull-1.ogg` | `amb/gull` | 1 | 1.60 s | 8.6 KB | ambience | boot |
| `amb/gull-2.ogg` | `amb/gull` | 1 | 1.60 s | 11.3 KB | ambience | boot |
| `amb/gull-3.ogg` | `amb/gull` | 1 | 1.60 s | 10.9 KB | ambience | boot |
| `saltrow/bell.ogg` | `saltrow/bell` | 1 | 5.50 s | 33.5 KB | sfx | boot |
| `saltrow/pump.ogg` | `saltrow/pump` | 1 | 4.80 s | 47.0 KB | sfx | boot |
| `saltrow/rake-1.ogg` | `saltrow/rake` | 1 | 1.30 s | 9.6 KB | sfx | boot |
| `saltrow/rake-2.ogg` | `saltrow/rake` | 1 | 1.30 s | 10.1 KB | sfx | boot |
| `saltrow/rake-3.ogg` | `saltrow/rake` | 1 | 1.30 s | 9.9 KB | sfx | boot |
| `saltrow/shovel-1.ogg` | `saltrow/shovel` | 1 | 1.40 s | 8.5 KB | sfx | boot |
| `saltrow/shovel-2.ogg` | `saltrow/shovel` | 1 | 1.40 s | 14.2 KB | sfx | boot |
| `saltrow/cart.ogg` | `saltrow/cart` | 1 | 2.40 s | 22.2 KB | sfx | boot |
| `saltrow/hammer-1.ogg` | `saltrow/hammer` | 1 | 1.20 s | 9.5 KB | sfx | boot |
| `saltrow/hammer-2.ogg` | `saltrow/hammer` | 1 | 1.20 s | 11.1 KB | sfx | boot |
| `brazier/kindle.ogg` | `brazier/kindle` | 1 | 1.80 s | 10.8 KB | sfx | boot |
| `brazier/burn.ogg` | `brazier/burn` | 1 | 6.00 s | 37.1 KB | sfx | boot |
| `brazier/rest.ogg` | `brazier/rest` | 1 | 2.60 s | 13.8 KB | sfx | boot |
| `ui/tick.ogg` | `ui/tick` | 1 | 0.20 s | 2.6 KB | ui | boot |
| `ui/select.ogg` | `ui/select` | 1 | 0.30 s | 4.0 KB | ui | boot |
| `ui/back.ogg` | `ui/back` | 1 | 0.30 s | 3.8 KB | ui | boot |
| `ui/error.ogg` | `ui/error` | 1 | 0.35 s | 2.2 KB | ui | boot |
| `ui/tab.ogg` | `ui/tab` | 1 | 0.30 s | 2.1 KB | ui | boot |
| `ui/map.ogg` | `ui/map` | 1 | 0.60 s | 4.7 KB | ui | boot |
| `ui/open.ogg` | `ui/open` | 1 | 0.35 s | 4.4 KB | ui | boot |
| `ui/close.ogg` | `ui/close` | 1 | 0.35 s | 4.4 KB | ui | boot |
| `ui/triangle.ogg` | `ui/triangle` | 1 | 1.60 s | 19.5 KB | ui | boot |
| `ui/save.ogg` | `ui/save` | 1 | 1.20 s | 11.6 KB | ui | boot |
| `music/strings.ogg` | `music/strings` | 2 | 20.00 s | 346.7 KB | music | boot |
| `music/whistle.ogg` | `music/whistle` | 2 | 20.00 s | 283.8 KB | music | boot |
| `music/pedal.ogg` | `music/pedal` | 2 | 20.00 s | 463.8 KB | music | boot |
| `music/ratchet.ogg` | `music/ratchet` | 2 | 20.00 s | 403.3 KB | music | boot |
| `brea/breath-hard-1.ogg` | `brea/breath-hard` | 1 | 0.84 s | 5.9 KB | brea | boot |
| `brea/breath-hard-2.ogg` | `brea/breath-hard` | 1 | 0.84 s | 5.9 KB | brea | boot |
| `brea/breath-in.ogg` | `brea/breath-in` | 1 | 0.54 s | 3.8 KB | brea | boot |
| `brea/breath-out.ogg` | `brea/breath-out` | 1 | 0.60 s | 4.2 KB | brea | boot |
| `brea/effort-1.ogg` | `brea/effort` | 1 | 0.36 s | 2.6 KB | brea | boot |
| `brea/effort-2.ogg` | `brea/effort` | 1 | 0.36 s | 2.6 KB | brea | boot |
| `brea/effort-hard-1.ogg` | `brea/effort-hard` | 1 | 0.42 s | 3.0 KB | brea | boot |
| `brea/effort-hard-2.ogg` | `brea/effort-hard` | 1 | 0.42 s | 3.0 KB | brea | boot |
| `brea/hurt-1.ogg` | `brea/hurt` | 1 | 0.48 s | 3.4 KB | brea | boot |
| `brea/hurt-2.ogg` | `brea/hurt` | 1 | 0.48 s | 3.4 KB | brea | boot |
| `amb/holds.ogg` | `amb/holds` | 2 | 20.00 s | 208.1 KB | ambience | late (holds) |
| `amb/ninewalls.ogg` | `amb/ninewalls` | 2 | 20.00 s | 209.6 KB | ambience | late (ninewalls) |
| `amb/scar.ogg` | `amb/scar` | 2 | 16.00 s | 164.3 KB | ambience | late (scar) |
| `amb/malpais.ogg` | `amb/malpais` | 2 | 20.00 s | 208.9 KB | ambience | late (malpais) |
| `amb/calima.ogg` | `amb/calima` | 2 | 16.00 s | 169.6 KB | ambience | late (holds) |
| `holds/hoe-1.ogg` | `holds/hoe` | 1 | 0.90 s | 6.5 KB | sfx | late (ninewalls) |
| `holds/hoe-2.ogg` | `holds/hoe` | 1 | 0.90 s | 6.3 KB | sfx | late (ninewalls) |
| `holds/hoe-3.ogg` | `holds/hoe` | 1 | 0.90 s | 6.5 KB | sfx | late (ninewalls) |
| `holds/sow-1.ogg` | `holds/sow` | 1 | 1.00 s | 9.4 KB | sfx | late (ninewalls) |
| `holds/sow-2.ogg` | `holds/sow` | 1 | 1.00 s | 9.2 KB | sfx | late (ninewalls) |
| `holds/water-1.ogg` | `holds/water` | 1 | 1.80 s | 10.5 KB | sfx | late (ninewalls) |
| `holds/water-2.ogg` | `holds/water` | 1 | 1.80 s | 10.5 KB | sfx | late (ninewalls) |
| `holds/bucket-1.ogg` | `holds/bucket` | 1 | 2.20 s | 11.7 KB | sfx | late (ninewalls) |
| `holds/bucket-2.ogg` | `holds/bucket` | 1 | 2.20 s | 11.8 KB | sfx | late (ninewalls) |
| `holds/pick-1.ogg` | `holds/pick` | 1 | 1.10 s | 9.0 KB | sfx | late (ninewalls) |
| `holds/pick-2.ogg` | `holds/pick` | 1 | 1.10 s | 8.9 KB | sfx | late (ninewalls) |
| `holds/sort-1.ogg` | `holds/sort` | 1 | 1.20 s | 7.3 KB | sfx | late (ninewalls) |
| `holds/sort-2.ogg` | `holds/sort` | 1 | 1.20 s | 7.4 KB | sfx | late (ninewalls) |
| `forge/fire.ogg` | `forge/fire` | 1 | 6.00 s | 35.4 KB | sfx | late (ninewalls) |
| `forge/bellows.ogg` | `forge/bellows` | 1 | 1.80 s | 12.0 KB | sfx | late (ninewalls) |
| `forge/anvil-1.ogg` | `forge/anvil` | 1 | 1.60 s | 19.2 KB | sfx | late (ninewalls) |
| `forge/anvil-2.ogg` | `forge/anvil` | 1 | 1.60 s | 19.2 KB | sfx | late (ninewalls) |
| `forge/anvil-3.ogg` | `forge/anvil` | 1 | 1.60 s | 18.6 KB | sfx | late (ninewalls) |
| `forge/quench.ogg` | `forge/quench` | 1 | 2.00 s | 11.4 KB | sfx | late (ninewalls) |
| `rack/open.ogg` | `rack/open` | 1 | 0.32 s | 1.8 KB | ui | boot |
| `rack/step.ogg` | `rack/step` | 1 | 0.15 s | 2.1 KB | ui | boot |
| `rack/take.ogg` | `rack/take` | 1 | 0.30 s | 1.6 KB | ui | boot |
| `windwall/open.ogg` | `windwall/open` | 1 | 0.55 s | 3.7 KB | brea | late (ninewalls) |
| `windwall/shut.ogg` | `windwall/shut` | 1 | 0.55 s | 3.4 KB | brea | late (ninewalls) |
| `windwall/plant.ogg` | `windwall/plant` | 1 | 1.00 s | 4.0 KB | sfx | late (ninewalls) |
| `windwall/block-1.ogg` | `windwall/block` | 1 | 0.70 s | 5.3 KB | sfx | late (ninewalls) |
| `windwall/block-2.ogg` | `windwall/block` | 1 | 0.70 s | 5.9 KB | sfx | late (ninewalls) |
| `windwall/parry.ogg` | `windwall/parry` | 1 | 0.30 s | 2.1 KB | sfx | late (ninewalls) |
| `windwall/bash-1.ogg` | `windwall/bash` | 1 | 0.80 s | 4.8 KB | sfx | late (ninewalls) |
| `windwall/bash-2.ogg` | `windwall/bash` | 1 | 0.80 s | 5.0 KB | sfx | late (ninewalls) |
| `gaff/swing-1.ogg` | `gaff/swing` | 1 | 0.40 s | 2.6 KB | brea | late (ninewalls) |
| `gaff/swing-2.ogg` | `gaff/swing` | 1 | 0.40 s | 2.6 KB | brea | late (ninewalls) |
| `gaff/hit-1.ogg` | `gaff/hit` | 1 | 0.80 s | 6.1 KB | sfx | late (ninewalls) |
| `gaff/hit-2.ogg` | `gaff/hit` | 1 | 0.80 s | 6.6 KB | sfx | late (ninewalls) |
| `gaff/hook.ogg` | `gaff/hook` | 1 | 0.90 s | 5.2 KB | sfx | late (ninewalls) |
| `gaff/rip.ogg` | `gaff/rip` | 1 | 1.60 s | 16.3 KB | sfx | late (ninewalls) |
| `pot/throw.ogg` | `pot/throw` | 1 | 0.60 s | 3.4 KB | brea | late (ninewalls) |
| `pot/break-1.ogg` | `pot/break` | 1 | 1.40 s | 7.9 KB | sfx | late (ninewalls) |
| `pot/break-2.ogg` | `pot/break` | 1 | 1.40 s | 7.9 KB | sfx | late (ninewalls) |
| `pot/cinder.ogg` | `pot/cinder` | 1 | 1.60 s | 9.2 KB | sfx | late (ninewalls) |
| `pot/seize.ogg` | `pot/seize` | 1 | 1.20 s | 9.8 KB | sfx | late (ninewalls) |
| `tiller/step-1.ogg` | `tiller/step` | 1 | 0.55 s | 2.7 KB | inst | late (holds) |
| `tiller/step-2.ogg` | `tiller/step` | 1 | 0.55 s | 2.7 KB | inst | late (holds) |
| `tiller/step-3.ogg` | `tiller/step` | 1 | 0.55 s | 3.2 KB | inst | late (holds) |
| `tiller/idle.ogg` | `tiller/idle` | 1 | 4.00 s | 24.3 KB | inst | late (holds) |
| `tiller/trample.ogg` | `tiller/trample` | 1 | 1.50 s | 14.0 KB | inst | boot |
| `screed/step-1.ogg` | `screed/step` | 1 | 0.80 s | 5.3 KB | inst | late (ninewalls) |
| `screed/step-2.ogg` | `screed/step` | 1 | 0.80 s | 5.3 KB | inst | late (ninewalls) |
| `screed/step-3.ogg` | `screed/step` | 1 | 0.80 s | 5.3 KB | inst | late (ninewalls) |
| `screed/idle.ogg` | `screed/idle` | 1 | 5.00 s | 28.2 KB | inst | late (ninewalls) |
| `screed/charge.ogg` | `screed/charge` | 1 | 1.60 s | 14.2 KB | inst | boot |
| `screed/stall.ogg` | `screed/stall` | 1 | 2.40 s | 15.8 KB | inst | late (ninewalls) |
| `screed/seal.ogg` | `screed/seal` | 1 | 1.60 s | 9.1 KB | inst | late (ninewalls) |
| `screed/seize.ogg` | `screed/seize` | 1 | 1.30 s | 9.1 KB | inst | late (ninewalls) |
| `screed/cut.ogg` | `screed/cut` | 1 | 2.60 s | 14.9 KB | sfx | late (ninewalls) |
| `alidade/hold.ogg` | `alidade/hold` | 1 | 3.00 s | 24.1 KB | brea | late (scar) |
| `alidade/mark.ogg` | `alidade/mark` | 1 | 1.10 s | 13.7 KB | brea | late (scar) |
| `alidade/true.ogg` | `alidade/true` | 1 | 2.80 s | 26.1 KB | brea | late (scar) |
