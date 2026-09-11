# Audio bank — licence manifest

**Every file in `public/audio/` is released under [CC0 1.0 Universal][cc0] (public domain
dedication).** Round 4 decision **D2** lifted the "100 % procedural, no asset files" clause from
`docs/SPEC.md`; this directory is the result. No third-party audio is bundled, so there is no
non-commercial, attribution or share-alike obligation anywhere in this tree.

| field | value |
|---|---|
| files | 149 |
| sets | 95 |
| total size | 2361.5 KB (budget 40 MB) |
| format | Ogg / Opus, 48 kHz, `audioBitsPerSecond` 56–80 kbps |
| generator | `tools/audio-bank.mjs` + `tools/audio-recipes.js` (deterministic; re-run reproduces the bank) |
| runtime index | `src/audio/manifest.js` |

## Provenance

These cues are **synthesized by this repository's own code** — Web Audio graphs (filtered noise
bursts, inharmonic partial stacks, swept oscillators, AM growls) rendered offline in
`OfflineAudioContext` and encoded to Opus. They were not sampled, recorded or derived from any
third-party work, so the copyright holder is this project and the dedication below is ours to make.

> To the extent possible under law, the authors of Horizon Zero Claude have waived all copyright
> and related or neighbouring rights to the audio files in `public/audio/`. See
> <https://creativecommons.org/publicdomain/zero/1.0/>.

## Swapping in curated CC0 recordings (Wave 3)

The loader is deliberately format-agnostic and manifest-driven. To replace any set with real
CC0 recordings from [freesound (CC0 filter)](https://freesound.org/search/?f=license:%22Creative+Commons+0%22),
[Kenney](https://kenney.nl/assets?q=audio) or [OpenGameArt (CC0 filter)](https://opengameart.org/art-search-advanced?field_art_licenses_tid%5B%5D=4):

1. Drop the files under `public/audio/<set>/` (`.ogg`, `.webm` and `.wav` all decode).
2. Add or edit the rows in `src/audio/manifest.js` with the real `license`, `source` (the
   direct URL of the sound page) and `author`.
3. Mirror the rows in the table below. **A73 fails if any loaded buffer has no licence row**, and
   `SampleBank` refuses to load a row whose `license` is not on the allowlist
   (`CC0-1.0`, `CC-PD`, `Unlicense`) — CC-BY-**NC** can never enter the bank (D3).

## Files

| file | set | duration | size | licence | author | source |
|---|---|---|---|---|---|---|
| `aloy/breath-hard-1.ogg` | `aloy/breath-hard` | 0.84 s | 5.9 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `aloy/breath-hard-2.ogg` | `aloy/breath-hard` | 0.84 s | 5.9 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `aloy/breath-in.ogg` | `aloy/breath-in` | 0.54 s | 3.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `aloy/breath-out.ogg` | `aloy/breath-out` | 0.60 s | 4.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `aloy/effort-1.ogg` | `aloy/effort` | 0.36 s | 2.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `aloy/effort-2.ogg` | `aloy/effort` | 0.24 s | 1.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `aloy/effort-hard-1.ogg` | `aloy/effort-hard` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `aloy/effort-hard-2.ogg` | `aloy/effort-hard` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `aloy/hurt-1.ogg` | `aloy/hurt` | 0.48 s | 3.4 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `aloy/hurt-2.ogg` | `aloy/hurt` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `amb/call-far-1.ogg` | `amb/call-far` | 2.40 s | 16.3 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `amb/call-far-2.ogg` | `amb/call-far` | 2.40 s | 15.4 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `amb/call-far-3.ogg` | `amb/call-far` | 2.40 s | 16.3 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `amb/campfire.ogg` | `amb/campfire` | 12.90 s | 126.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `amb/forest.ogg` | `amb/forest` | 12.96 s | 127.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `amb/meadow.ogg` | `amb/meadow` | 11.58 s | 113.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `amb/night.ogg` | `amb/night` | 12.96 s | 127.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `amb/ridge.ogg` | `amb/ridge` | 12.96 s | 127.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `amb/river.ogg` | `amb/river` | 12.84 s | 126.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/hunter/draw.ogg` | `bow/hunter/draw` | 0.54 s | 3.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/hunter/empty.ogg` | `bow/hunter/empty` | 0.18 s | 1.4 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/hunter/flyby-1.ogg` | `bow/hunter/flyby` | 0.60 s | 3.7 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/hunter/flyby-2.ogg` | `bow/hunter/flyby` | 0.60 s | 3.7 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/hunter/nock-1.ogg` | `bow/hunter/nock` | 0.24 s | 1.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/hunter/nock-2.ogg` | `bow/hunter/nock` | 0.24 s | 1.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/hunter/release-1.ogg` | `bow/hunter/release` | 0.60 s | 4.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/hunter/release-2.ogg` | `bow/hunter/release` | 0.60 s | 4.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/sharpshot/draw.ogg` | `bow/sharpshot/draw` | 0.90 s | 6.3 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/sharpshot/empty.ogg` | `bow/sharpshot/empty` | 0.18 s | 1.4 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/sharpshot/flyby-1.ogg` | `bow/sharpshot/flyby` | 0.60 s | 3.7 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/sharpshot/flyby-2.ogg` | `bow/sharpshot/flyby` | 0.60 s | 3.7 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/sharpshot/nock-1.ogg` | `bow/sharpshot/nock` | 0.24 s | 1.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/sharpshot/nock-2.ogg` | `bow/sharpshot/nock` | 0.24 s | 1.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/sharpshot/release-1.ogg` | `bow/sharpshot/release` | 0.60 s | 4.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/sharpshot/release-2.ogg` | `bow/sharpshot/release` | 0.60 s | 4.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/war/draw.ogg` | `bow/war/draw` | 0.90 s | 6.3 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/war/empty.ogg` | `bow/war/empty` | 0.18 s | 1.4 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/war/flyby-1.ogg` | `bow/war/flyby` | 0.60 s | 4.1 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/war/flyby-2.ogg` | `bow/war/flyby` | 0.60 s | 4.1 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/war/nock-1.ogg` | `bow/war/nock` | 0.24 s | 1.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/war/nock-2.ogg` | `bow/war/nock` | 0.24 s | 1.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/war/release-1.ogg` | `bow/war/release` | 0.60 s | 4.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `bow/war/release-2.ogg` | `bow/war/release` | 0.48 s | 3.4 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/cobble-1.ogg` | `foot/cobble` | 0.36 s | 2.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/cobble-2.ogg` | `foot/cobble` | 0.36 s | 2.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/cobble-3.ogg` | `foot/cobble` | 0.36 s | 2.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/cobble-4.ogg` | `foot/cobble` | 0.36 s | 2.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/dirt-1.ogg` | `foot/dirt` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/dirt-2.ogg` | `foot/dirt` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/dirt-3.ogg` | `foot/dirt` | 0.30 s | 2.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/dirt-4.ogg` | `foot/dirt` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/grass-1.ogg` | `foot/grass` | 0.36 s | 2.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/grass-2.ogg` | `foot/grass` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/grass-3.ogg` | `foot/grass` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/grass-4.ogg` | `foot/grass` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/gravel-1.ogg` | `foot/gravel` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/gravel-2.ogg` | `foot/gravel` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/gravel-3.ogg` | `foot/gravel` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/gravel-4.ogg` | `foot/gravel` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/rock-1.ogg` | `foot/rock` | 0.24 s | 1.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/rock-2.ogg` | `foot/rock` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/rock-3.ogg` | `foot/rock` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/rock-4.ogg` | `foot/rock` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/silt-1.ogg` | `foot/silt` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/silt-2.ogg` | `foot/silt` | 0.30 s | 2.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/silt-3.ogg` | `foot/silt` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/silt-4.ogg` | `foot/silt` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/snow-1.ogg` | `foot/snow` | 0.36 s | 2.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/snow-2.ogg` | `foot/snow` | 0.36 s | 2.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/snow-3.ogg` | `foot/snow` | 0.36 s | 2.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/snow-4.ogg` | `foot/snow` | 0.36 s | 2.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/water-1.ogg` | `foot/water` | 0.54 s | 3.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/water-2.ogg` | `foot/water` | 0.54 s | 3.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/water-3.ogg` | `foot/water` | 0.54 s | 3.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `foot/water-4.ogg` | `foot/water` | 0.54 s | 3.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `gear/heavy-1.ogg` | `gear/heavy` | 0.24 s | 1.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `gear/heavy-2.ogg` | `gear/heavy` | 0.24 s | 1.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `gear/light-1.ogg` | `gear/light` | 0.18 s | 1.4 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `gear/light-2.ogg` | `gear/light` | 0.18 s | 1.4 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `hit/crit-1.ogg` | `hit/crit` | 0.60 s | 4.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `hit/crit-2.ogg` | `hit/crit` | 0.60 s | 4.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `hit/crunch-1.ogg` | `hit/crunch` | 0.54 s | 3.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `hit/crunch-2.ogg` | `hit/crunch` | 0.54 s | 3.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `hit/flesh-hard.ogg` | `hit/flesh-hard` | 0.36 s | 2.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `hit/flesh-soft.ogg` | `hit/flesh-soft` | 0.30 s | 2.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `hit/ground.ogg` | `hit/ground` | 0.30 s | 2.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `hit/plink-1.ogg` | `hit/plink` | 0.30 s | 2.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `hit/plink-2.ogg` | `hit/plink` | 0.30 s | 2.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `hit/thunk-1.ogg` | `hit/thunk` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `hit/thunk-2.ogg` | `hit/thunk` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `idle/behemoth.ogg` | `idle/behemoth` | 3.18 s | 21.9 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `idle/glinthawk.ogg` | `idle/glinthawk` | 3.18 s | 21.9 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `idle/longleg.ogg` | `idle/longleg` | 3.18 s | 21.9 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `idle/sawtooth.ogg` | `idle/sawtooth` | 2.94 s | 20.3 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `idle/scrapper.ogg` | `idle/scrapper` | 2.82 s | 19.5 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `idle/strider.ogg` | `idle/strider` | 2.76 s | 19.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `idle/thunderjaw.ogg` | `idle/thunderjaw` | 2.76 s | 19.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `idle/watcher.ogg` | `idle/watcher` | 3.18 s | 21.9 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `machine/alarm.ogg` | `machine/alarm` | 0.84 s | 5.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `machine/collapse-1.ogg` | `machine/collapse` | 0.90 s | 6.3 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `machine/collapse-2.ogg` | `machine/collapse` | 0.90 s | 6.3 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `machine/collapse-3.ogg` | `machine/collapse` | 0.90 s | 6.3 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `machine/loot-beacon.ogg` | `machine/loot-beacon` | 2.40 s | 16.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `machine/powerdown.ogg` | `machine/powerdown` | 1.62 s | 11.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `machine/scan-ping.ogg` | `machine/scan-ping` | 0.48 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `machine/servo-loop.ogg` | `machine/servo-loop` | 3.60 s | 24.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `machine/stagger.ogg` | `machine/stagger` | 1.14 s | 7.9 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `machine/unwarble.ogg` | `machine/unwarble` | 0.60 s | 4.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `machine/warble-1.ogg` | `machine/warble` | 0.72 s | 5.1 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `machine/warble-2.ogg` | `machine/warble` | 0.72 s | 5.1 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `mstep/heavy-1.ogg` | `mstep/heavy` | 0.66 s | 4.4 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `mstep/heavy-2.ogg` | `mstep/heavy` | 0.66 s | 4.4 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `mstep/heavy-3.ogg` | `mstep/heavy` | 0.66 s | 4.3 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `mstep/light-1.ogg` | `mstep/light` | 0.30 s | 2.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `mstep/light-2.ogg` | `mstep/light` | 0.36 s | 2.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `mstep/light-3.ogg` | `mstep/light` | 0.36 s | 2.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `mstep/medium-1.ogg` | `mstep/medium` | 0.48 s | 3.4 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `mstep/medium-2.ogg` | `mstep/medium` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `mstep/medium-3.ogg` | `mstep/medium` | 0.42 s | 3.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `music/bass-combat.ogg` | `music/bass-combat` | 10.56 s | 123.4 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `music/drone-tense.ogg` | `music/drone-tense` | 10.56 s | 124.3 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `music/drums-combat.ogg` | `music/drums-combat` | 10.56 s | 118.9 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `music/lead-combat.ogg` | `music/lead-combat` | 10.56 s | 114.1 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `music/pad-calm.ogg` | `music/pad-calm` | 10.56 s | 124.3 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `music/perc-tense.ogg` | `music/perc-tense` | 10.56 s | 77.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `music/pluck-calm.ogg` | `music/pluck-calm` | 10.56 s | 118.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `music/sting-alert.ogg` | `music/sting-alert` | 1.26 s | 7.1 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `music/sting-combat.ogg` | `music/sting-combat` | 2.10 s | 13.0 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `music/sting-discover.ogg` | `music/sting-discover` | 2.40 s | 19.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `music/sting-resolve.ogg` | `music/sting-resolve` | 3.00 s | 27.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `status/burn.ogg` | `status/burn` | 2.40 s | 16.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `status/frost.ogg` | `status/frost` | 2.40 s | 16.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `status/shock.ogg` | `status/shock` | 2.34 s | 16.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `voice/behemoth/strike.ogg` | `voice/behemoth/strike` | 1.56 s | 10.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `voice/behemoth/windup.ogg` | `voice/behemoth/windup` | 1.14 s | 7.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `voice/glinthawk/strike.ogg` | `voice/glinthawk/strike` | 0.90 s | 4.7 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `voice/glinthawk/windup.ogg` | `voice/glinthawk/windup` | 0.90 s | 6.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `voice/longleg/strike.ogg` | `voice/longleg/strike` | 0.72 s | 4.4 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `voice/longleg/windup.ogg` | `voice/longleg/windup` | 0.90 s | 5.4 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `voice/sawtooth/strike.ogg` | `voice/sawtooth/strike` | 0.90 s | 6.3 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `voice/sawtooth/windup.ogg` | `voice/sawtooth/windup` | 0.90 s | 6.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `voice/scrapper/strike.ogg` | `voice/scrapper/strike` | 0.90 s | 6.3 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `voice/scrapper/windup.ogg` | `voice/scrapper/windup` | 0.90 s | 6.2 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `voice/strider/strike.ogg` | `voice/strider/strike` | 0.84 s | 5.1 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `voice/strider/windup.ogg` | `voice/strider/windup` | 0.72 s | 4.9 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `voice/thunderjaw/strike.ogg` | `voice/thunderjaw/strike` | 1.68 s | 11.6 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `voice/thunderjaw/windup.ogg` | `voice/thunderjaw/windup` | 1.08 s | 7.4 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `voice/watcher/strike.ogg` | `voice/watcher/strike` | 0.90 s | 4.8 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |
| `voice/watcher/windup.ogg` | `voice/watcher/windup` | 0.90 s | 4.7 KB | CC0-1.0 | Horizon Zero Claude (procedurally synthesized, no third-party audio) | https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js |

[cc0]: https://creativecommons.org/publicdomain/zero/1.0/
