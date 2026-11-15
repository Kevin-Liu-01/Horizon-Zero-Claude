# Frame Set tooling (M0.4)

The Frame Set is 32 fixed frames (F01-F32, with F23 split per Instrument kind), each with a camera,
hour, weather and state, compared against a masked reference crop, a worded reference, a written
countable target or measured rows. The definition is `frameset.json`.

Nothing private is in this folder. The reference crops, film runs and review pages live under the
review root (`$CALIMA_REVIEW`, default `~/.calima-r5/review`); the crop recipe is read from there.

| command | what it does |
|---|---|
| `node tools/frames/frameset.mjs --crops` | validate the set; check every referenced crop exists |
| `node tools/frames/crops.mjs` | cut the masked reference crops from the private recipe (`--check` verifies them) |
| `node tools/frames/film.mjs --port 5270` | wait for the memory guard and Chrome slot 1, start Vite on the port under `nice`, film every frame in one Chrome session (14-minute cap), write `runs/<utc>-<commit>/`, build that run's review page |
| `node tools/frames/film.mjs --port 5270 --only F02,F08` | a targeted re-run |
| `node tools/frames/film.mjs --port 5270 --baseline` | the baseline run: its frames become the anchors until a frame is accepted |
| `node tools/frames/review.mjs [--run <dir>] [--date D]` | rebuild a review page; `--placeholder` builds one from grey placeholders |
| `node tools/frames/answers.mjs --page <page dir> < answers.txt` | record typed answers; `accept` freezes that frame as the anchor (`--date D` takes that day's newest page) |

A review page is `<review>/<date>/<run>/index.html`, one folder per film run, so a second run on the
same day never overwrites the first (pages built before frameset v2 sit directly in `<review>/<date>/`).
Per frame: reference | today | anchor, the judge's four comparisons when a judge has run, the frame
time, and every stand-in the filmer had to use because the build cannot yet stage what the frame asks
for. The anchor is the last accepted frame; until a frame is accepted, it is the 2026-11-14 refilm at
b4b46fb (`paths.mjs` `ANCHOR_RUN`), with the M0.5 baseline shown small beneath it. A frame whose
definition changed since the anchor run's frame set is labelled "re-staged since the anchor". Answers
are one line per frame:

```
F02 closer
F08 accept
F05 wrong: one sentence that becomes the next direction
```

## Frame set versions

`frameset.json` carries a `version`. Each change, and why:

**v2 (M1a round 2, decided by the orchestrator from round 1's findings).** No crop was re-cut.

| frame | v1 | v2 | why |
|---|---|---|---|
| F02 | `look.field`, bearing 300, chase pitch 2 | bible (E -228, N -338), bearing 258, chase pitch 4 | v1 faced neither the pans nor the Sounding Ring (the Ring sat about 18 deg outside the left edge). v2 stands in the golden meadow at the salt field's south-east end, facing west over the pans: the sun 8 deg right of centre, the Ring 21 deg right at 120 m, the cells across the lower frame, the horizon about 42 % from the bottom, Brea lower-centre from behind |
| F03 | `look.pansInland` (black sand), bearing 341.5 | bible (E -168, N -208), bearing 358 | the play frame's place is meadow, not black-sand flats. v2 stands in the meadow inland of Saltrow (unbroken for 80 m ahead), facing the Flank cliffs with the caldera rim to the right and the sun behind her left shoulder; same hour, pitch and HUD |
| F13 | orbit 90 deg | the same, plus `camera.lookAt: "off"` | her head follows the lens's view direction in play, so a side lens turned her face away from it, past profile. The filmer holds the look layer at weight 0 for the frame (`page.mjs`), so 90 deg is a true profile |
| F14, F16, F18, F19 | `place:openGround`, `rangeGround`, `duelGround`, bearing 180 | bible (E -316.9, N -264.9), bearing 315 | those places stand in waist-high meadow that hid the legs, the feet and the lance. v2 puts Brea on the raked crust of a white salt cell (about 24 x 11 m inside its dykes; no heap or rock in it), facing along the cell so every side lens stays inside the same cell, on her sunward side at 17:45 |
| F15 | `place:runway`, bearing 180 | bible (E -309.9, N -271.9), bearing 315 | as above; she starts 2 m inside the same cell's south-east dyke and runs north-west along it (about 9 m in the frame's 1.6 s; the 3.8 s run clip reaches the far dyke) |
| F17 | `look.aim` (black-sand beach), bearing 300 | bible (E -314.0, N -267.8), bearing 300 | the same salt cell, 4 m from its middle toward the south-east dyke, so the chase lens behind her stays on the crust |
| F32 | T1, 120 m, bearing 45, pitch -22 | T1, 120 m, bearing 55, pitch -8 | pitch -22 looked down into the caldera's flank 150-500 m away and never showed the far field. v2's centre line runs over the low saddle north-east of T1 (its skyline about 1 deg below the lens) to the east coast at 770 m, with the horizon in frame, so the far field and every LOD ring are drawn |
| clips | (follow their frames) | run F15, draw F16, crouchDraw F18, melee F19 | the bar clips in `tools/gates/hero-sweep/session.mjs` stage on their frame's place, so they moved with the frames |

Also in v2: `stageFrame` starts every frame from a reset hero (input released, no crouch or hang pose, the
lance holstered, the bow's holster timer spent, stuck arrows recycled), and a machine hidden for a frame is
also frozen and calm for it (an alert one in range had drawn her bow through combat's threat rule). The
places were chosen from the island recipe in Node (meadow, track, salt and rock masks, the field's cells,
the static scatter, the sun's bearing at the frame's hour) and checked on film; any perf or look number taken
on a v1 frame does not compare with its v2 frame.
