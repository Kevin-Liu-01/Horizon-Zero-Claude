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
| `node tools/frames/answers.mjs --page <page dir> --prev <earlier page dir> < provisional.txt` | the orchestrator's `provisional` answers (PROCESS §4 two-page rule): the tool checks closer-or-same on all four points and the originality checklist on both pages' judges, freezes the frame as a provisional anchor, marks it on the page and in the repo's `tools/frames/accepted.json`; Kevin's `accept` makes it his, his `closer` or `wrong` withdraws it |

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

## Simulation-time staging (M1a regfix 3)

F15 (the run) and F19 (the lance heavy at contact) are staged on **simulation time** (`page.mjs` 7a), by the
orchestrator's ruling after the M1a regressions run 2: timed by the wall clock, each film caught a different point of
the stride or the swing. The page's animation loop is stopped and the game's own frame (`main.js` `_frame`) is driven
one 1/60 s frame at a time on a virtual `performance.now`; Math.random is seeded; the clock the animator, the
environment, the plants, the terrain and the water read is pinned (it stands still in the frozen frame, so the grass,
the water and the sky do not move between shots); the gusts and the clouds' drift start at 0; she is put back on her
mark from a clean slate (a swing run out, the lance drawn and holstered once), the idle's life restarts from its
constructor values, every cloth and hair chain is re-seated before and after 1.5 s of idle; dynamic resolution is held
at scale 1, and the camera's fov is held at the frame's own (combat eases it toward the hip FOV on real dt every frame,
so the filmed fov wandered frame to frame). F15 freezes on the first step at or past gait phase 0 (the left ball
furthest forward) after at least 1.4 s of sprint; F19 on the first step at or past the heavy's contact key (0.62 of
the strike). `run.json` carries each staging's `sim` (frames, phase or contact key reached, a digest of her state at the
start, after the idle and at the freeze). `--wall-clock` films the old way.

`film.mjs --repeat N` films the selection N times in one session, interleaved, and writes each repeat's pixel
difference from the first (whole frame and her screen box, share of pixels whose largest channel differs by more than
10 of 255) and each staging's own noise floor (a second shot of the same frozen frame, `<id>-floor.png`) to `run.json`.

The F15 and F19 anchors were re-filmed at fb6d5f0 with this staging (a detached worktree with this `page.mjs` and
`film.mjs` copied in, never committed there); the old anchors are in `accepted/withdrawn/`.

## Frame set versions

`frameset.json` carries a `version`. Each change, and why:

**v2 (M1a round 2, decided by the orchestrator from round 1's findings).** No crop was re-cut.

| frame | v1 | v2 | why |
|---|---|---|---|
| F02 | `look.field`, bearing 300, chase pitch 2 | bible (E -228, N -338), bearing 258, chase pitch 4 | v1 faced neither the pans nor the Sounding Ring (the Ring sat about 18 deg outside the left edge). v2 stands in the golden meadow at the salt field's south-east end, facing west over the pans: the sun 8 deg right of centre, the Ring 21 deg right at 120 m, the cells across the lower frame, the horizon about 42 % from the bottom, Brea lower-centre from behind |
| F03 | `look.pansInland` (black sand), bearing 341.5, chase pitch 6 | bible (E -168, N -208), bearing 6, chase pitch 4 | the play frame's place is meadow, not black-sand flats. v2 stands in the meadow inland of Saltrow (unbroken for 80 m ahead), facing north up it with the caldera's flank rising above her head on the right and the sun behind her left shoulder; pitch 4 keeps the horizon under half height over the rising meadow; same hour and HUD |
| F13 | orbit 90 deg | the same, plus `camera.lookAt: "off"` | her head follows the lens's view direction in play, so a side lens turned her face away from it, past profile. The filmer holds the look layer at weight 0 for the frame (`page.mjs`), so 90 deg is a true profile |
| F14, F16, F18, F19 | `place:openGround`, `rangeGround`, `duelGround`, bearing 180 | bible (E -316.9, N -264.9), bearing 315 | those places stand in waist-high meadow that hid the legs, the feet and the lance. v2 puts Brea on the raked crust of a white salt cell (about 24 x 11 m inside its dykes; no heap or rock in it), facing along the cell so every side lens stays inside the same cell, on her sunward side at 17:45 |
| F15 | `place:runway`, bearing 180 | bible (E -309.9, N -271.9), bearing 315 | as above; she starts 2 m inside the same cell's south-east dyke and runs north-west along it (about 9 m in the frame's 1.6 s; the 3.8 s run clip reaches the far dyke) |
| F17 | `look.aim` (black-sand beach), bearing 300 | bible (E -314.0, N -267.8), bearing 300 | the same salt cell, 4 m from its middle toward the south-east dyke, so the chase lens behind her stays on the crust |
| F32 | T1, 120 m, bearing 45, pitch -22 | T1, 120 m, bearing 65, pitch -6 | pitch -22 looked down into the caldera's flank 150-500 m away and never showed the far field. From 120 m over T1 no view due north-east can cross the island: the caldera and the Roque plug (bearing 17 from T1) rise past 200 m within 500 m. At bearing 65 the plug is out of frame and the line of sight runs over the holds to the far coast (a ray count from the recipe: about a quarter of the frame is land past 500 m or the sea beyond it, against a tenth at 45), with the horizon in frame, so the far field and every LOD ring are drawn. A true across-the-island frame needs a higher lens, which the bar's 120 m does not allow |
| clips | (follow their frames) | run F15, draw F16, crouchDraw F18, melee F19 | the bar clips in `tools/gates/hero-sweep/session.mjs` stage on their frame's place, so they moved with the frames |
| F23-plumb | orbit yawRel 155, 4.5 m, lens height 2.0, target 4 m ahead at 1.6 m, fov 50 | the same orbit, lens height 1.8, target 5 m ahead at 1.7 m, fov 42 (instruments, after the freeze) | the Plumb (3.4 m, 6 m from her, about 10 m from the lens) filled under a third of the frame's height and its bob and feet read small; at fov 42 it fills about 45 % with Brea still beside it, her feet near the lower edge |
| F20 | orbit yawRel 0, 5.5 m, lens height 1.3, target 1.5 m to her side at 1.0 m, fov 42 | the same orbit, 4.0 m, lens height 1.7, target at 1.05 m (people, M1a round 3; the lens 1.54 m from where it was) | at 1.3 m the lens stood among the meadow's blades: one tall pale blade crossed the frame between the two figures, and at 5.5 m Ansel and Brea stood small (the review at dee526d). 1.5 m nearer they fill about 1.4 times the height, and from 1.7 m the lens looks down over the tips of the blades near it |
| F23-peg | `place:openGround`, bearing 180 | bible (E -314.8, N -267.0), bearing 315, the same orbit (instruments, M1b fix round 1; versioned in v3 below) | at openGround the ~1 m golden meadow hid the Peg's legs, mallet and racks (the judge at 6358b62: its form could not be judged). It now stands on F14's raked salt cell, Brea 3 m south-east of the cell's middle and the Peg 6 m ahead of her along the cell, so lens, Brea and Peg are all on the crust. Its actor carries `calm: true` (page.mjs calms it before it freezes): on open crust it saw her through the settle and was filmed hostile at 8d18c28 |
| F24 | the Plumb 20 m ahead of her on her line of sight | 11 m ahead, 6 deg right of it (instruments, after the freeze) | at 20 m the Plumb was a speck in the meadow beside her bow hand; at 11 m its head, drum and bob stand clear of the grass and clear of her shoulder |

Also in v2: `stageFrame` starts every frame from a reset hero (input released, no crouch or hang pose, the
lance holstered, the bow's holster timer spent, stuck arrows recycled), and a machine hidden for a frame is
also frozen and calm for it (an alert one in range had drawn her bow through combat's threat rule). The
places were chosen from the island recipe in Node (meadow, track, salt and rock masks, the field's cells,
the static scatter, the sun's bearing at the frame's hour) and checked on film; any perf or look number taken
on a v1 frame does not compare with its v2 frame.

**v3 (M1a regressions run: frames re-staged after v2 without a bump, 8d18c28, a975b00 and dd5ecaf).** No crop
was re-cut; every other frame is as in v2. A number or film of these three frames taken at v2 does not compare with v3.

| frame | v2 | v3 | why |
|---|---|---|---|
| F23-peg | `place:openGround`, bearing 180; the Peg actor as staged | bible (E -314.8, N -267.0), bearing 315, the same orbit; the Peg actor carries `calm: true` | the meadow hid the Peg's legs, mallet and racks; on F14's raked salt cell they stand clear. On open crust it saw her through the settle and was filmed hostile (8d18c28), so the filmer calms it before it freezes (`page.mjs`) |
| F23-gauge | no actor: the static scripted Gauge at Sluice 3 | a `gauge` Instrument actor 6 m from her, facing her | the living Gauge (M1.4e, dd5ecaf) is the frame's subject; the static stand-in is retired when the keeper spawns |
| F26 | a Plumb 8 m out, standing in for the Gauge | a `gauge` Instrument actor 12 m out, facing her | the alidade reads the living Gauge's card (GAUGE · SLUICE 3 · TIDE 0.4 m), not a Plumb's |
