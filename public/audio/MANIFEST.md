# Audio bank — the slice (BUILD M1.6k)

Every file in `public/audio/` is **synthesized by this repository's own code** and released under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). No recording and no third-party audio is bundled.

| field | value |
|---|---|
| files | 159 |
| sets | 91 (76 counted slice cues) |
| total size | 3.52 MB (budget 8 MB in Milestone 1) |
| format | Ogg Opus, 48 kHz (48 kb/s mono point sources, 96 kb/s stereo beds and music) |
| recipes | `src/audio/slice/recipes.js` (deterministic; seeds per set in `tools/gates/audio/build-bank.mjs`) |
| cue list | `src/audio/slice/cues.js` (bus, range, place, level) |
| runtime index | `src/audio/manifest.js` (generated) |

Brea's breath and effort set (`brea/`) is the existing synthesized set, kept until Milestone 3 regenerates it.

| file | set | ch | duration | size | bus |
|---|---|---|---|---|---|
| `foot/gravel-1.ogg` | `foot/gravel` | 1 | 0.42 s | 2.1 KB | brea |
| `foot/gravel-2.ogg` | `foot/gravel` | 1 | 0.42 s | 2.1 KB | brea |
| `foot/gravel-3.ogg` | `foot/gravel` | 1 | 0.42 s | 4.0 KB | brea |
| `foot/gravel-4.ogg` | `foot/gravel` | 1 | 0.42 s | 2.1 KB | brea |
| `foot/dirt-1.ogg` | `foot/dirt` | 1 | 0.42 s | 2.4 KB | brea |
| `foot/dirt-2.ogg` | `foot/dirt` | 1 | 0.42 s | 2.4 KB | brea |
| `foot/dirt-3.ogg` | `foot/dirt` | 1 | 0.42 s | 2.5 KB | brea |
| `foot/dirt-4.ogg` | `foot/dirt` | 1 | 0.42 s | 2.5 KB | brea |
| `foot/rock-1.ogg` | `foot/rock` | 1 | 0.42 s | 2.6 KB | brea |
| `foot/rock-2.ogg` | `foot/rock` | 1 | 0.42 s | 2.6 KB | brea |
| `foot/rock-3.ogg` | `foot/rock` | 1 | 0.42 s | 2.6 KB | brea |
| `foot/rock-4.ogg` | `foot/rock` | 1 | 0.42 s | 2.6 KB | brea |
| `foot/water-1.ogg` | `foot/water` | 1 | 0.50 s | 3.1 KB | brea |
| `foot/water-2.ogg` | `foot/water` | 1 | 0.50 s | 3.1 KB | brea |
| `foot/water-3.ogg` | `foot/water` | 1 | 0.50 s | 3.1 KB | brea |
| `foot/water-4.ogg` | `foot/water` | 1 | 0.50 s | 3.1 KB | brea |
| `foot/silt-1.ogg` | `foot/silt` | 1 | 0.42 s | 2.7 KB | brea |
| `foot/silt-2.ogg` | `foot/silt` | 1 | 0.42 s | 2.6 KB | brea |
| `foot/silt-3.ogg` | `foot/silt` | 1 | 0.42 s | 2.6 KB | brea |
| `foot/silt-4.ogg` | `foot/silt` | 1 | 0.42 s | 2.7 KB | brea |
| `foot/cobble-1.ogg` | `foot/cobble` | 1 | 0.42 s | 3.5 KB | brea |
| `foot/cobble-2.ogg` | `foot/cobble` | 1 | 0.42 s | 2.2 KB | brea |
| `foot/cobble-3.ogg` | `foot/cobble` | 1 | 0.42 s | 2.9 KB | brea |
| `foot/cobble-4.ogg` | `foot/cobble` | 1 | 0.42 s | 2.3 KB | brea |
| `foot/grass-1.ogg` | `foot/grass` | 1 | 0.42 s | 2.7 KB | brea |
| `foot/grass-2.ogg` | `foot/grass` | 1 | 0.42 s | 2.7 KB | brea |
| `foot/grass-3.ogg` | `foot/grass` | 1 | 0.42 s | 2.7 KB | brea |
| `foot/grass-4.ogg` | `foot/grass` | 1 | 0.42 s | 2.7 KB | brea |
| `cloth/brush-1.ogg` | `cloth/brush` | 1 | 0.32 s | 2.1 KB | brea |
| `cloth/brush-2.ogg` | `cloth/brush` | 1 | 0.32 s | 2.1 KB | brea |
| `cloth/brush-3.ogg` | `cloth/brush` | 1 | 0.32 s | 2.1 KB | brea |
| `cloth/brush-4.ogg` | `cloth/brush` | 1 | 0.32 s | 2.1 KB | brea |
| `cloth/flap-1.ogg` | `cloth/flap` | 1 | 0.45 s | 2.2 KB | brea |
| `cloth/flap-2.ogg` | `cloth/flap` | 1 | 0.45 s | 2.3 KB | brea |
| `cloth/flap-3.ogg` | `cloth/flap` | 1 | 0.45 s | 2.2 KB | brea |
| `gear/light-1.ogg` | `gear/light` | 1 | 0.30 s | 1.6 KB | brea |
| `gear/light-2.ogg` | `gear/light` | 1 | 0.30 s | 3.7 KB | brea |
| `gear/heavy-1.ogg` | `gear/heavy` | 1 | 0.40 s | 2.6 KB | brea |
| `gear/heavy-2.ogg` | `gear/heavy` | 1 | 0.40 s | 2.5 KB | brea |
| `bow/nock-1.ogg` | `bow/nock` | 1 | 0.18 s | 2.1 KB | brea |
| `bow/nock-2.ogg` | `bow/nock` | 1 | 0.18 s | 2.0 KB | brea |
| `bow/draw.ogg` | `bow/draw` | 1 | 0.85 s | 5.1 KB | brea |
| `bow/creak.ogg` | `bow/creak` | 1 | 2.00 s | 14.3 KB | brea |
| `bow/loose-1.ogg` | `bow/loose` | 1 | 0.70 s | 4.5 KB | brea |
| `bow/loose-2.ogg` | `bow/loose` | 1 | 0.70 s | 4.5 KB | brea |
| `bow/loose-3.ogg` | `bow/loose` | 1 | 0.70 s | 4.5 KB | brea |
| `bow/flyby-1.ogg` | `bow/flyby` | 1 | 0.50 s | 3.4 KB | brea |
| `bow/flyby-2.ogg` | `bow/flyby` | 1 | 0.50 s | 3.4 KB | brea |
| `bow/hit-1.ogg` | `bow/hit` | 1 | 0.70 s | 5.9 KB | sfx |
| `bow/hit-2.ogg` | `bow/hit` | 1 | 0.70 s | 6.2 KB | sfx |
| `bow/hit-3.ogg` | `bow/hit` | 1 | 0.70 s | 6.1 KB | sfx |
| `bow/hit-weak-1.ogg` | `bow/hit-weak` | 1 | 0.90 s | 11.7 KB | sfx |
| `bow/hit-weak-2.ogg` | `bow/hit-weak` | 1 | 0.90 s | 11.7 KB | sfx |
| `bow/miss-1.ogg` | `bow/miss` | 1 | 0.40 s | 2.9 KB | sfx |
| `bow/miss-2.ogg` | `bow/miss` | 1 | 0.40 s | 2.8 KB | sfx |
| `bow/miss-3.ogg` | `bow/miss` | 1 | 0.40 s | 2.8 KB | sfx |
| `bow/empty.ogg` | `bow/empty` | 1 | 0.15 s | 1.7 KB | brea |
| `lance/draw.ogg` | `lance/draw` | 1 | 0.60 s | 3.8 KB | brea |
| `lance/swing-1.ogg` | `lance/swing` | 1 | 0.42 s | 2.7 KB | brea |
| `lance/swing-2.ogg` | `lance/swing` | 1 | 0.42 s | 2.7 KB | brea |
| `lance/swing-3.ogg` | `lance/swing` | 1 | 0.42 s | 2.7 KB | brea |
| `lance/hit-1.ogg` | `lance/hit` | 1 | 0.60 s | 4.4 KB | sfx |
| `lance/hit-2.ogg` | `lance/hit` | 1 | 0.60 s | 4.7 KB | sfx |
| `lance/hit-3.ogg` | `lance/hit` | 1 | 0.60 s | 4.5 KB | sfx |
| `lance/heavy-1.ogg` | `lance/heavy` | 1 | 0.90 s | 7.2 KB | sfx |
| `lance/heavy-2.ogg` | `lance/heavy` | 1 | 0.90 s | 7.5 KB | sfx |
| `lance/pry.ogg` | `lance/pry` | 1 | 1.20 s | 11.3 KB | sfx |
| `alidade/raise.ogg` | `alidade/raise` | 1 | 0.45 s | 4.3 KB | brea |
| `alidade/bearing.ogg` | `alidade/bearing` | 1 | 1.20 s | 13.5 KB | brea |
| `lamp/calm.ogg` | `lamp/calm` | 1 | 0.34 s | 1.9 KB | inst |
| `lamp/wary.ogg` | `lamp/wary` | 1 | 0.42 s | 2.8 KB | inst |
| `lamp/hostile.ogg` | `lamp/hostile` | 1 | 0.48 s | 4.7 KB | inst |
| `lamp/dark.ogg` | `lamp/dark` | 1 | 0.60 s | 3.1 KB | inst |
| `plumb/gyro.ogg` | `plumb/gyro` | 1 | 4.00 s | 32.2 KB | inst |
| `plumb/servo-1.ogg` | `plumb/servo` | 1 | 0.50 s | 4.1 KB | inst |
| `plumb/servo-2.ogg` | `plumb/servo` | 1 | 0.50 s | 4.3 KB | inst |
| `plumb/servo-3.ogg` | `plumb/servo` | 1 | 0.50 s | 4.3 KB | inst |
| `plumb/chime.ogg` | `plumb/chime` | 1 | 2.60 s | 22.4 KB | inst |
| `plumb/vial-1.ogg` | `plumb/vial` | 1 | 1.00 s | 12.7 KB | inst |
| `plumb/vial-2.ogg` | `plumb/vial` | 1 | 1.00 s | 12.7 KB | inst |
| `plumb/topple.ogg` | `plumb/topple` | 1 | 2.40 s | 22.2 KB | inst |
| `plumb/bob-1.ogg` | `plumb/bob` | 1 | 0.90 s | 5.4 KB | inst |
| `plumb/bob-2.ogg` | `plumb/bob` | 1 | 0.90 s | 5.5 KB | inst |
| `peg/mallet-1.ogg` | `peg/mallet` | 1 | 0.60 s | 5.5 KB | inst |
| `peg/mallet-2.ogg` | `peg/mallet` | 1 | 0.60 s | 5.5 KB | inst |
| `peg/mallet-3.ogg` | `peg/mallet` | 1 | 0.60 s | 5.5 KB | inst |
| `peg/shot-1.ogg` | `peg/shot` | 1 | 0.70 s | 3.8 KB | inst |
| `peg/shot-2.ogg` | `peg/shot` | 1 | 0.70 s | 3.8 KB | inst |
| `peg/rush.ogg` | `peg/rush` | 1 | 0.90 s | 10.3 KB | inst |
| `peg/idle.ogg` | `peg/idle` | 1 | 2.00 s | 23.1 KB | inst |
| `gauge/sluice.ogg` | `gauge/sluice` | 1 | 4.00 s | 22.2 KB | sfx |
| `gauge/gate.ogg` | `gauge/gate` | 1 | 1.40 s | 14.2 KB | sfx |
| `gauge/stilt-1.ogg` | `gauge/stilt` | 1 | 0.80 s | 6.7 KB | inst |
| `gauge/stilt-2.ogg` | `gauge/stilt` | 1 | 0.80 s | 6.7 KB | inst |
| `gauge/stilt-3.ogg` | `gauge/stilt` | 1 | 0.80 s | 6.7 KB | inst |
| `gauge/float.ogg` | `gauge/float` | 1 | 1.30 s | 11.0 KB | inst |
| `gauge/idle.ogg` | `gauge/idle` | 1 | 3.00 s | 20.3 KB | inst |
| `inst/servo.ogg` | `inst/servo` | 1 | 3.00 s | 23.3 KB | inst |
| `inst/windup.ogg` | `inst/windup` | 1 | 0.70 s | 8.2 KB | inst |
| `inst/strike-1.ogg` | `inst/strike` | 1 | 0.70 s | 6.8 KB | inst |
| `inst/strike-2.ogg` | `inst/strike` | 1 | 0.70 s | 6.6 KB | inst |
| `inst/stagger.ogg` | `inst/stagger` | 1 | 0.80 s | 8.0 KB | inst |
| `inst/powerdown.ogg` | `inst/powerdown` | 1 | 1.80 s | 15.9 KB | inst |
| `inst/collapse.ogg` | `inst/collapse` | 1 | 1.60 s | 13.5 KB | inst |
| `mstep/light-1.ogg` | `mstep/light` | 1 | 0.30 s | 1.6 KB | inst |
| `mstep/light-2.ogg` | `mstep/light` | 1 | 0.30 s | 1.6 KB | inst |
| `mstep/light-3.ogg` | `mstep/light` | 1 | 0.30 s | 1.6 KB | inst |
| `mstep/medium-1.ogg` | `mstep/medium` | 1 | 0.45 s | 3.1 KB | inst |
| `mstep/medium-2.ogg` | `mstep/medium` | 1 | 0.45 s | 3.0 KB | inst |
| `mstep/medium-3.ogg` | `mstep/medium` | 1 | 0.45 s | 3.0 KB | inst |
| `mstep/heavy-1.ogg` | `mstep/heavy` | 1 | 0.70 s | 4.3 KB | inst |
| `mstep/heavy-2.ogg` | `mstep/heavy` | 1 | 0.70 s | 4.8 KB | inst |
| `mstep/heavy-3.ogg` | `mstep/heavy` | 1 | 0.70 s | 4.8 KB | inst |
| `amb/pans.ogg` | `amb/pans` | 2 | 20.00 s | 208.0 KB | ambience |
| `amb/trade.ogg` | `amb/trade` | 2 | 16.00 s | 165.8 KB | ambience |
| `amb/saltrow.ogg` | `amb/saltrow` | 2 | 24.00 s | 249.5 KB | ambience |
| `amb/shore.ogg` | `amb/shore` | 2 | 24.00 s | 245.4 KB | ambience |
| `amb/cane-gust.ogg` | `amb/cane-gust` | 2 | 8.00 s | 91.4 KB | ambience |
| `amb/cane-lull.ogg` | `amb/cane-lull` | 2 | 8.00 s | 123.0 KB | ambience |
| `amb/gull-1.ogg` | `amb/gull` | 1 | 1.60 s | 8.6 KB | ambience |
| `amb/gull-2.ogg` | `amb/gull` | 1 | 1.60 s | 11.3 KB | ambience |
| `amb/gull-3.ogg` | `amb/gull` | 1 | 1.60 s | 10.9 KB | ambience |
| `saltrow/bell.ogg` | `saltrow/bell` | 1 | 5.50 s | 33.5 KB | sfx |
| `saltrow/pump.ogg` | `saltrow/pump` | 1 | 4.80 s | 47.0 KB | sfx |
| `saltrow/rake-1.ogg` | `saltrow/rake` | 1 | 1.30 s | 9.6 KB | sfx |
| `saltrow/rake-2.ogg` | `saltrow/rake` | 1 | 1.30 s | 10.1 KB | sfx |
| `saltrow/rake-3.ogg` | `saltrow/rake` | 1 | 1.30 s | 9.9 KB | sfx |
| `saltrow/shovel-1.ogg` | `saltrow/shovel` | 1 | 1.40 s | 8.5 KB | sfx |
| `saltrow/shovel-2.ogg` | `saltrow/shovel` | 1 | 1.40 s | 14.2 KB | sfx |
| `saltrow/cart.ogg` | `saltrow/cart` | 1 | 2.40 s | 22.2 KB | sfx |
| `saltrow/hammer-1.ogg` | `saltrow/hammer` | 1 | 1.20 s | 9.5 KB | sfx |
| `saltrow/hammer-2.ogg` | `saltrow/hammer` | 1 | 1.20 s | 11.1 KB | sfx |
| `brazier/kindle.ogg` | `brazier/kindle` | 1 | 1.80 s | 10.8 KB | sfx |
| `brazier/burn.ogg` | `brazier/burn` | 1 | 6.00 s | 37.1 KB | sfx |
| `brazier/rest.ogg` | `brazier/rest` | 1 | 2.60 s | 13.8 KB | sfx |
| `ui/tick.ogg` | `ui/tick` | 1 | 0.20 s | 2.6 KB | ui |
| `ui/select.ogg` | `ui/select` | 1 | 0.30 s | 4.0 KB | ui |
| `ui/back.ogg` | `ui/back` | 1 | 0.30 s | 3.8 KB | ui |
| `ui/error.ogg` | `ui/error` | 1 | 0.35 s | 2.2 KB | ui |
| `ui/tab.ogg` | `ui/tab` | 1 | 0.30 s | 2.1 KB | ui |
| `ui/map.ogg` | `ui/map` | 1 | 0.60 s | 4.7 KB | ui |
| `ui/open.ogg` | `ui/open` | 1 | 0.35 s | 4.4 KB | ui |
| `ui/close.ogg` | `ui/close` | 1 | 0.35 s | 4.4 KB | ui |
| `ui/triangle.ogg` | `ui/triangle` | 1 | 1.60 s | 19.5 KB | ui |
| `ui/save.ogg` | `ui/save` | 1 | 1.20 s | 11.6 KB | ui |
| `music/strings.ogg` | `music/strings` | 2 | 20.00 s | 346.7 KB | music |
| `music/whistle.ogg` | `music/whistle` | 2 | 20.00 s | 283.8 KB | music |
| `music/pedal.ogg` | `music/pedal` | 2 | 20.00 s | 463.8 KB | music |
| `music/ratchet.ogg` | `music/ratchet` | 2 | 20.00 s | 403.3 KB | music |
| `brea/breath-hard-1.ogg` | `brea/breath-hard` | 1 | 0.84 s | 5.9 KB | brea |
| `brea/breath-hard-2.ogg` | `brea/breath-hard` | 1 | 0.84 s | 5.9 KB | brea |
| `brea/breath-in.ogg` | `brea/breath-in` | 1 | 0.54 s | 3.8 KB | brea |
| `brea/breath-out.ogg` | `brea/breath-out` | 1 | 0.60 s | 4.2 KB | brea |
| `brea/effort-1.ogg` | `brea/effort` | 1 | 0.36 s | 2.6 KB | brea |
| `brea/effort-2.ogg` | `brea/effort` | 1 | 0.36 s | 2.6 KB | brea |
| `brea/effort-hard-1.ogg` | `brea/effort-hard` | 1 | 0.42 s | 3.0 KB | brea |
| `brea/effort-hard-2.ogg` | `brea/effort-hard` | 1 | 0.42 s | 3.0 KB | brea |
| `brea/hurt-1.ogg` | `brea/hurt` | 1 | 0.48 s | 3.4 KB | brea |
| `brea/hurt-2.ogg` | `brea/hurt` | 1 | 0.48 s | 3.4 KB | brea |
