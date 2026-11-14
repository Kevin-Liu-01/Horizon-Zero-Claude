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
| `node tools/frames/film.mjs --port 5270` | wait for the memory guard and Chrome slot 1, start Vite on the port under `nice`, film every frame in one Chrome session (14-minute cap), write `runs/<utc>-<commit>/`, build today's review page |
| `node tools/frames/film.mjs --port 5270 --only F02,F08` | a targeted re-run |
| `node tools/frames/film.mjs --port 5270 --baseline` | the baseline run: its frames become the anchors until a frame is accepted |
| `node tools/frames/review.mjs [--run <dir>] [--date D]` | rebuild a review page; `--placeholder` builds one from grey placeholders |
| `node tools/frames/answers.mjs --date D < answers.txt` | record typed answers; `accept` freezes that frame as the anchor |

A review page is `<review>/<date>/index.html`: per frame, reference | today | last accepted, the
judge's four comparisons when a judge has run, the frame time, and every stand-in the filmer had to
use because the build cannot yet stage what the frame asks for. Answers are one line per frame:

```
F02 closer
F08 accept
F05 wrong: one sentence that becomes the next direction
```
