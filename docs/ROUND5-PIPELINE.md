# ROUND 5 — lane `pipeline` report (W0b; the W0a record is Appendix A)

Lane: pipeline · port 5250 · wave W0b (protagonist on the kept rig) · Oct 18–19 2026 · branch `r5/w0b-pipeline`.
Plan: `docs/ROUND5-PLAN.md` §2 (row), §1.2 (grants: `src/main.js` removal-only at the W0 exit; donor lists removal-only),
§3.1–3.2, §4.5–4.6, §6 (rows owned), §8.3, §9 (pipeline block + global list), §10 (licences).

## 0. Status by deliverable

| deliverable | state |
|---|---|
| **First item — `A-specs-data-driven` failing on main inside its temp copy** | **root cause found and fixed; proven on main** (§1). With `R5_SCRATCH` unset the scratch is `os.tmpdir()` = `/var/folders/…`, a path through the `/var → /private/var` symlink. Vite resolves module ids to real paths, so its fs-allow check (built from the un-real root) refused every source file, the transform was skipped and the static fallback served raw files — a CSS file imported from JS came back as `text/css` ("Failed to load module script … text/css"), no `__READY__`, A1/A20b timed out. Lane runs had passed only because `R5_SCRATCH` pointed at `/private/tmp` (already real). The fixture now realpaths scratch, copy and served root, and `viteProbe` fails in < 1 s, before any Chrome, if a module is served untransformed. **Measured: the fixed fixture on main's tree with the default TMPDIR scratch PASS in 25.0 s (A1 PASS, A20b PASS 377 frames, 00:06 Oct 19)**; its negative control (the same copy served through a symlink, un-realpath'd) reproduces the exact `text/css` failure |
| Re-fetch that records archive SHA-256s | **tooling done; no archive downloaded** (gap 1). `node tools/build/sources.mjs verify-zip --row <id> --zip <file> --delete-zip` hashes an archive (streamed) and proves every staged file equals its member byte for byte, then writes `archive_sha256` + `archive_bytes` into the lock and the row and deletes the zip. The download needs Kevin's explicit go-ahead (plan §11; W0a report §6) and this run carried only "continue all". Archive names and sizes confirmed on the itch pages: UBC `Universal Base Characters[Standard].zip` 122 MB (= the recorded 128,968,391 B), MCO `Modular Character Outfits - Fantasy[Standard].zip` 280 MB (= 294,347,394 B), UAL2 `Universal Animation Library 2[Standard].zip` 17 MB. **UAL1 can no longer be re-fetched as v1**: the itch page has served v3.0 since 16 Jun 2026 (ruling needed, §6) |
| Trimmed sources in `models-staging/r5-src/` | **done** — 4 sources, 101 files, **137.97 MB** (cap 150): `ubc-standard` 41 files / 50.7 MB, `mco-fantasy` 54 / 81.8 MB, `ual2-standard` 3 / 8.1 MB, `ual1` 3 / 4.1 MB. Per-file SHA-256 in the tracked lock `tools/build/sources.lock.json`. Copy-on-write clones of the Oct 15 proof extracts and of `public/anims` (≈ 5 MB of real disk). **Git-ignored and inside this worktree: the orchestrator must move it into main before removing the worktree** (§6) |
| Licence manifest complete (MIT code rows, legacy-r4 rows) | **complete except the archive hashes** — 35 rows: new source rows `ubc-standard`, `mco-fantasy`, `ual2-standard` (and `ual1` updated) with page URL, archive name, byte size, retrieved date and the pack licence texts in `public/licences/`; MIT rows for three, three-mesh-bvh and the meshopt decoder; 22 legacy rows; the Sounding Ring row. New row fields `archive_name` and `derived_from` (a row built from staged sources inherits its sources' archive record). `A-licence-manifest` is PENDING on exactly three clauses: third-party (5 archive SHA-256s: the 4 sources + the legacy rock scan), legacy-source (`aloy.glb`, `aloy-ual.json` still ship under scheduled exceptions), credits (brand's README and menu surfaces) |
| Credits generator | **done** — `tools/licences/credits.mjs --md` (README "Credits" body) and `--write` → `public/licences/credits.json` (the in-game data file). Every manifest write through `add.mjs` regenerates it; `check.mjs` FAILs a stale one. 9 attributions (6 CC-BY donors + 3 MIT) wait for brand's two surfaces |
| Deterministic `build:assets` with `--only <lane>` | **done** — the human library promoted (`tools/build/humans.mjs`) with a PROOF recipe that builds the six proof humans from `r5-src` only; the Sounding Ring generator promoted. `A-build-deterministic` and `A-build-only-lane` **PASS** (§3) |
| `?poc=human` and `?poc=creature` removal (W0 exit, removal-only) | **done** — `src/main.js` −9 / +1 (the `+1` is the same line minus `'creature', `); 18 promoted or dead proof files deleted from `tools/r5-poc/`. `tools/r5-poc/` keeps `poc-biome.js` (main.js still imports it for A-gpu-tier until world-ground's W1 exit) and `direction-a/` (brand's lexicon input, world-ground's `sites.json`): a named PENDING handover in `A-poc-promoted` |
| HZD donor lists (removal-only) | **done** — `tools/optimize.mjs` −24 (the six Sketchfab/HZD jobs), `tools/bake-rigs.mjs` −14 (Tallneck / redeye notes); `tools/measure-machines.mjs` holds no donor list (0 lines changed) |
| `models-staging/**` HZD-cast cleanup | tracked part **done** (6 files deleted, Round-5 header in `models-staging/MANIFEST.md`); the untracked bulk exists only in main: `node tools/build/staging-cleanup.mjs --root <main> --apply` deletes **133.79 MB in 49 entries** (dry run measured on main) — orchestrator |
| `?poc=biome` in clean checkouts (found on the way) | **fixed** — its Sounding Ring was a git-ignored proof output, so every lane worktree and fresh clone failed the biome vista (`Promise.all` rejects; engine-gpu's A-gpu-tier vista). The promoted generator writes it tracked (186,584 B, provenance-stamped). Measured: `?poc=biome` serves in this worktree (landmark 22,120 tris, both GLBs loaded, 0 console errors) |

## 1. The `A-specs-data-driven` fix

`tools/build/pipeline/specs-fixture.mjs`:
- `runSpecsFixture` realpaths the scratch dir and the root before building the copy path (and compares real paths for the
  "scratch outside the repo" rule); `serveAndRun(dir, …)` realpaths `dir` before handing it to Vite.
- `viteProbe(dir, socket)` (exported): before any Chrome, `GET /src/main.js` and the first CSS file a `src/**` module
  imports, with a module script's `Accept: */*`. Both must come back as JavaScript and the entry must have its imports
  rewritten to `/src/…`. A failure returns `{ ok: false, checks }` with the served MIME types and every gate of the run
  FAILs with that evidence in < 1 s (no 2 × 120 s timeouts, no Chrome).
- `probeControl(dir, socket)` (exported, negative control, no Chrome): serves the same copy through a symlink without
  realpath — the main-run failure mode — and must be caught. Measured: caught, `/src/combat/feedback.css` served as
  `text/css`, `/src/main.js` raw 16,859 B (transformed: 93–96 KB).
- `cloneTree` now uses `cp -c` (clonefile) through `tools/build/lib/clone.mjs`: node's `COPYFILE_FICLONE` was measured
  making FULL copies on this volume (a 6.5 MB file cost 6.5 MB of free space; `cp -c` 0.24 MB), so every W0a fixture run
  had cost the tree's size in transient disk.
- `runGate` accepts `gate.ready` / `gate.readyTimeout`, and `serveAndRun` a `cacheDir` (used by the biome check).

Measured: the fixed fixture with the TMPDIR default scratch — this tree 00:04 **PASS** 25.4 s (A1 PASS, A20b PASS 377
frames); **main's tree 00:06 PASS 25.0 s** (A1 PASS, A20b PASS 377 frames, diff exactly `assets.specs.js` +
`probe.glb`, copy removed). The lane run later in the night FAILed on A20b's own frame bar — see §3, the same failure
reproduces on main's unmodified tree at the same minute.

## 2. Contracts published (exact signatures)

### 2.1 Third-party sources — `tools/build/sources.mjs` (any lane stages sources through it, as rows go through `add.mjs`)

```
node tools/build/sources.mjs stage-zip  --row <id> --zip <archive.zip> --keep '<glob>' [--keep …] [--strip <member prefix>]
                                        [--retrieved YYYY-MM-DD] [--page <url>] [--delete-zip]
node tools/build/sources.mjs stage-dir  --row <id> --from <dir> [--keep '<glob>' …] [--move] --retrieved YYYY-MM-DD
                                        [--archive-name <file>] [--archive-bytes <n>] [--page <url>]
node tools/build/sources.mjs verify-zip --row <id> --zip <archive.zip> [--retrieved YYYY-MM-DD] [--delete-zip]
node tools/build/sources.mjs status                 # = A-sources-staged
```
```js
export const LOCK = 'tools/build/sources.lock.json', SRC_REL = 'models-staging/r5-src', CAP_BYTES = 150 MiB;
export const REQUIRED = ['ubc-standard', 'mco-fantasy', 'ual1', 'ual2-standard'];   // + every non-legacy third-party source row
export function srcDir(root?, env?): string                       // R5_SRC or <root>/models-staging/r5-src
export function loadLock(root?): { schema: 1, about, sources: { [rowId]: LockEntry } }
export async function stageDir({ row, from, keeps, move, archiveName, archiveBytes, retrieved, page }): { row, files, totalBytes }
export async function stageZip({ row, zip, keeps, strip, retrieved, page, deleteZip }): { row, sha256, bytes, files, totalBytes, zipDeleted }
export async function verifyZip({ row, zip, retrieved, deleteZip }): { ok, sha256, bytes, checked, mismatched, missing, ambiguous }
export async function status({ root?, env? }): { pass: true|null|false, detail }
// LockEntry = { row, archive: { name, bytes, sha256 | null, retrieved, page }, strip, files: { <rel>: { bytes, sha256 } }, totalBytes, stagedFrom? }
```
Layout: `models-staging/r5-src/<LICENSES row id>/<path inside the archive>`. `tools/build/lib/zip.mjs` (read-only zip:
`openZip(file) → { entries, read(entry), close() }`, `sha256File(file) → { sha256, bytes }`, Zip64-aware, node built-ins
only) and `tools/build/lib/clone.mjs` (`cloneFiles([[src, dst]…]) → 'clone' | 'copy'`, `cloneFile(src, dst)`).

### 2.2 Licence rows — two new fields (`tools/licences/add.mjs` FIELD_ORDER)

- `archive_name`: the archive's file name (itch.io has no stable file URL; page URL + name + bytes + hash identify it).
- `derived_from: [row ids]`: a shipped row built FROM staged sources (Brea, NPC bodies, UAL2 clip files) names its source
  rows; `check.mjs` third-party then requires the sources (not the derived row) to carry `source_url` / `archive_sha256` /
  `retrieved`. Example for hero-body: `{ "id": "brea", "paths": ["public/models/hero/brea-*.glb"], "licence": "CC0-1.0",
  "source_url": "tools/build/recipes/brea.mjs", "derived_from": ["ubc-standard", "mco-fantasy"], … }` via `add.mjs`.

### 2.3 Credits — for brand (`tools/licences/credits.mjs`)

```
node tools/licences/credits.mjs --md      # README "## Credits" section body (verbatim CC-BY + MIT attributions)
node tools/licences/credits.mjs --write   # public/licences/credits.json  (regenerated by every add.mjs write)
node tools/licences/credits.mjs --check   # exit 1 if credits.json is missing or stale
export function creditRows(manifest?): [{ group: 'cc-by'|'code'|'ofl'|'cc0', head, lines: [{ id, text }] }]
export function creditsMarkdown(manifest?): string;  export function creditsJson(manifest?): string;  export const CREDITS_JSON
```
`src/ui/menu.js` (brand) either fetches `/licences/credits.json` and renders `groups[].head` + `groups[].lines[].text`
(the `credits` clause accepts this when menu.js names `licences/credits.json` and the file is in sync), or carries the
strings verbatim.

### 2.4 Human build library — `tools/build/humans.mjs` (for hero-body `recipes/brea.mjs`, settlements `recipes/npc/**`, armory `recipes/armor/**`)

```js
export const io;                                             // NodeIO + ALL_EXTENSIONS + meshopt encoder/decoder
export function sourcePaths(src = R5_SRC || 'models-staging/r5-src'): { src, ubc, hair, mco }   // throws if a dir is missing
export async function readGltf(file): Document               // repairs the packs' `*_png.png` image URIs
export function cleanDoc(doc); export function cleanPrimitive(prim)   // drop TEXCOORD_1+/COLOR_n, fold 8 -> 4 influences
export function graft(base, part, label): Node[]             // re-point a part at the base skin by joint name (LBS re-bind if binds differ)
export function rebindPrimitive(prim, delta)
export function headCut(doc, srcNode, keepNames, name): Node
export function addBraid(doc, { color, rootRadius }): Node   // dyn_hairBraid_01..06 + _07_end under Head
export function joinByMaterial(doc, nodes, name, keepSeparate: RegExp[])
export function docStats(doc): { tris, verts, materials, meshes, textures, bones }
export async function writeHuman(doc, file, { texSize = 1024, hairTexSize = 512, provenance, extras }): { kb, tris, prims, stats }
   // provenance = { recipe, sources: [row ids], licence } (checked by lib/glb.mjs checkProvenance); writes asset.extras.{provenance, r5Stats}
export async function buildHeroineBase(file, { hair, src, provenance }); export async function buildMaleBase(file, { src, provenance });
export async function buildOutfit(name, file, { src, provenance }); export const OUTFITS
```
Every function body is the proof's (`tools/r5-poc/build-human.mjs`), statement for statement; logs go to stderr only with
`R5_BUILD_VERBOSE=1`.

### 2.5 Recipe contract additions (`tools/build/build-assets.mjs`)

`export const PROOF = true` marks a recipe whose outputs are build evidence: the driver runs it only with an explicit
`--out <dir>` and reports it in `skipped` otherwise (`tools/build/pipeline/gen-humans-proof.mjs` → `proof/humans/*.glb`).
The JSON line gained `skipped: [{ recipe, why }]`. Recipes now: `instruments/gen-tiller.mjs`,
`landmarks/gen-sounding-ring.mjs` (new; → `public/models/r5-poc/sounding-ring.glb`, world-props' landmark recipes
replace it at W1), `pipeline/gen-humans-proof.mjs` (new, PROOF), `pipeline/gen-probe.mjs`. `tools/build/ground/lib/
ground-proof.mjs` is the proof's ground-layer builder moved verbatim for world-ground's W1 layer recipes (not a recipe; it
needs the Poly Haven rock scan staged first).

### 2.6 Gate bodies — `tools/build/pipeline/w0b-checks.mjs`, `biome-check.mjs`

```js
export async function buildDeterministic({ root }) ; export async function buildOnlyLane({ root }) ; export async function glbBudget({ root })
export function pocPromotedStatic({ root }) ; export const LANE_OUTPUTS, CLASSES, BIOME_CLOSURE, HANDOVER
export function classOf(path, r5Size): string | null ; export function overBudget(cls, stats): string[] ; export function auditLane(lane, written, declared)
// biome-check.mjs: export async function biomeCheck({ root, scratch, port }) ; CLI prints one JSON line
```
`LANE_OUTPUTS` is the output-path ownership table `A-build-only-lane` audits against (plan §2); `CLASSES` is plan §4.1 as
data (plus a `fixture` class for the loader probe). A new lane recipe whose outputs fall outside its lane's row FAILs.

### 2.7 Unchanged from W0a (still the contracts)

`src/core/assets.specs.js` (`SPECS`, `ANIMS`, `DELETED`), `src/core/assets.js` (loader, `legacyDeleted()`, `unload()`),
`tools/build/lib/{glb,hs}.mjs`, `tools/licences/{add,check,ip-scan,lib,stamp-legacy}.mjs` — Appendix A §2. **`SPECS.hero`
still points at `/models/aloy.glb`**: the swap to Brea is a one-row data edit in a pipeline file, made on hero-body's
request or by the orchestrator in the W0-exit merge (it also expires the `aloy.glb` IP exception).

## 3. Gates — this lane's W0b block

Registered in `tools/gates.r5.pipeline.mjs` (13 gates). Main's `tools/gates.mjs` still scans only
`tools/gates.round4.*.mjs`, so until gates-perf's auto-discovery merges (their `gates.config.mjs` imports every
`tools/gates.r5.*.mjs` that exports `GATES`; this file does) the lane runs with the harness's own merge flag:

```
R5_SCRATCH=<scratch outside the repo> node tools/gates.mjs --port 5250 --extra tools/gates.r5.pipeline.mjs --lane pipeline
```
(`--lane pipeline` filters exactly this file's 13 gates.) Run 1 of this round (Oct 19, port 5250, this tree): the runner
block 00:54–00:57 and the page block «PAGE-TIME», one invocation each (the harness's own Chrome never overlaps the
gates' child Chromes); reports in `scratchpad/r5/pipeline/w0b/run1/`.

| gate | result on 5250 | measured |
|---|---|---|
| **A-sources-staged** | **PENDING** (named) | `r5-src` 137.97 MB ≤ 150, git-ignored; 4 required sources staged, 101 files, 0 missing / 0 changed / 0 extra against the lock; no transient zip. PENDING only on the 4 archive SHA-256s (needs the archives). Negative control (a copy-on-write clone with one staged byte changed and a stray file) FAILs with both problems named |
| **A-build-deterministic** | **PASS** | 2 builds under `sandbox-exec (deny network*)`, the 3 proof-extract dirs made unreadable (so sources can only come from `r5-src`): 11 outputs (10 GLB + `probe.ref.json`) byte-identical by the driver's hashes and re-hashed on disk; wall **23.7 s / 13.1 s** (≤ 180), peak RSS **1,132 / 1,237 MB** (≤ 2,048); every committed output (5) equals the build. Earlier hand pair at load 75–98: 158.6 / 181.1 s, still byte-identical — the gate grades wall time by the R26 rule (over the bar on a loaded box = PENDING, not PASS) |
| **A-build-only-lane** | **PASS** | `--only <lane>` for all 20 lanes into the real tree, mtime audit of `public/` + `tools/build/`: only pipeline has recipes (4); it wrote 5 files, all its own, committed bytes unchanged; every other lane wrote 0; slowest lane 3.0 s (≤ 60); 0 recipe outputs outside their lane's row. Negative control (a pipeline run "writing" a hero-body path and an undeclared path) caught 2/2 |
| **A-glb-budget** | **PASS** | 4 generated GLBs: `instruments/tiller.glb` + `r5-poc/tiller.glb` (instrument-medium, 4.5 m: 32,960 tris ≤ 35 k, 2 draws, 24 bones, 309,880 B ≤ 400 KB), `pipeline/probe.glb` (fixture: 340 tris, 3 draws, 11,092 B), `r5-poc/sounding-ring.glb` (landmark: 22,120 tris ≤ 40 k, 2 draws, 186,584 B ≤ 300 KB); `r5Stats` agree with the file for all 4; 11 legacy GLBs not graded (no CALIMA provenance). Controls: a 12 k-tri / 0.9 MB Brea body and an unclassified path both caught |
| **A-human-bind** | «HB» | Calibration before the removal (the gate's assert on the `?poc=human` heroine, a pre-removal copy, 00:52): **52 / 52 pairs, map 52, missingSource [], missingTarget [], missing keys = neck2 + eyeL/R + 4 lids (all allowed), 52 animated bones, hipScale 0.9938** — PASS. On this tree the hero row is the Round-4 body (no rig profile) → named PENDING until Brea is the hero row (hero-body W0b; graded on the merged tree) |
| **A-poc-promoted** (W0 exit) | **PENDING** (named handover) | static: no `?poc=human|creature` path in `src/main.js`, `?poc=biome` hook present, `public/models/r5-poc/` = exactly `{sounding-ring, tiller}.glb`, 0 importers of `tools/r5-poc/`, negative control (the pre-removal main.js text) caught. Biome: `?poc=biome` serves — landmark 22,120 tris, Tillers 65,920, terrain 80,000, both r5-poc GLBs loaded, 0 console errors. PENDING only on `tools/r5-poc/direction-a/` (brand / world-ground handover) |
| **A-specs-data-driven** | **FAIL** (environment; §1 PASS earlier) | static PASS (0 row names, 0 URL literals in `assets.js`, specs pure data); dynamic: copy 582 files by `cp -c`, diff exactly `assets.specs.js` + `probe.glb`, `viteProbe` 2/2 JS, symlink control caught, A1 PASS, fixture row absent in the copy; **A20b 34 / 32 / 42 frames advanced vs its > 120 bar** (0 system errors, 0 hook errors) in three runs 00:57–00:59. **The same fixture on main's unmodified tree at 01:00: 47 frames, FAIL** — the shared GPU's throughput collapsed after 00:52 (rAF 22/s on an idle box, Metal renderer, an animated Aerials wallpaper drawing). At 00:04 / 00:06 the identical path PASSed with 377 frames on both trees |
| **A-loader-fixes** | «LF» | |
| **A-ID-ip-assets-gone** (global) | **PASS** | 20 GLBs read with gltf-transform, 222 shipped files through their rows: 0 IP hits, 0 without provenance, 0 unreadable, 0 NC/ND; 2 named scheduled exceptions (`aloy.glb` → W0 exit, hero-body; `anims-hybrid/aloy-ual.json` → W0a exit, gates-perf's unmerged deletion); negative controls 7/7 |
| **A-assets-tracked** (global) | **PASS** | 226 referenced paths: 0 ignored, 0 missing; rules 6/6 must-track (incl. `r5-poc/sounding-ring.glb`), 10/10 must-ignore (`r5-src`, bake artefacts, other proof outputs); negative control caught |
| **A-licence-manifest** (global) | **PENDING** | PASS: files-matched (222 files, each exactly one row), row-schema (35), code-rows (3 MIT), licence-texts, size 34.48 MB ≤ 60. PENDING: third-party (5 archive SHA-256s), legacy-source (2 IP files under scheduled exceptions), credits (9 attributions not yet on brand's surfaces; `credits.json` present and in sync). 0 FAIL clauses |
| A-pipeline-r30-merge-order (lane guard) | **PASS** | every R30 file and reader gone together (watcher, sawtooth, behemoth, thunderjaw, npc) |
| A-pipeline-boot-rows (lane guard) | «BR» | |

## 4. Global green list — the items that exist in this tree

«GLOBAL»

Not in this tree (other lanes' W0a/W0b gates, not merged): `A90-abs`, `A-alloc-rate`, `A-vram-ledger`,
`A-no-horizon-terms-player`, `A-no-horizon-terms-code`, `A-reach-all-sites`, `A-port-guard`, `A-carried-suite`.

Visual gates: pipeline owns none (plan §9: 11 action, 0 visual), so there is no frame for a judge in this block. The one
visual consequence of this lane's W0b work is that `?poc=biome` now renders its landmark in a clean checkout (measured
above by scene content, not by a shot).

## 5. Honest gaps

1. **No archive SHA-256 is recorded.** The 4 sources are staged and hashed per file, but `archive_sha256` stays null
   (`A-sources-staged` and `A-licence-manifest` PENDING) until the archives exist on this machine again. The re-fetch is
   a ≈ 420 MB download (UBC 122 MB, MCO 280 MB, UAL2 17 MB) that the plan puts behind Kevin's explicit approval; it was
   not done. With the zips in hand it is three commands (§6), each verifying all staged files before recording.
2. **UAL1's archive cannot be reproduced.** The shipped clips are UAL v1 (`DEF-*` names; R15 keeps them) and the itch
   page has served v3.0 since 16 Jun 2026. Without a v1 archive from a backup, `ual1` can carry per-file hashes only.
3. **`A-specs-data-driven` FAILs in this round's lane run** on A20b's frame bar, with main's unmodified tree failing the
   same way at the same minute; it PASSed on both trees at 00:04–00:06. It needs a re-run when the GPU is back to normal.
4. **`A-human-bind` cannot PASS in this tree**: Brea is hero-body's, in another worktree. The assert is calibrated
   (52/52 on the proof heroine) and grades on the merged tree once `SPECS.hero` names Brea.
5. **`A-poc-promoted` cannot PASS literally**: the plan wants `tools/r5-poc/` and `public/models/r5-poc/` gone while
   `?poc=biome` keeps serving A-gpu-tier, but main.js (removal-only) imports `/tools/r5-poc/poc-${POC}.js` and the biome
   loads `/models/r5-poc/{sounding-ring,tiller}.glb`. The gate enforces the reachable bar (only the biome closure stays) and
   names the `direction-a/` handover; both folders go with the `?poc=biome` block at world-ground's W1 exit.
6. `A-build-deterministic`'s wall-time term is not attributable on this box most of the night (load 60–110): the gate
   PASSed at 13–24 s, a hand pair at load ~90 took 159 / 181 s (identical bytes). The R26-style PENDING rule is this
   lane's reading of "≤ 180 s"; the orchestrator may prefer a strict bar.
7. `npm run build:assets` still needs its script line in `package.json` (brand's file); the gates call
   `node tools/build/build-assets.mjs` directly.
8. The four rowless `SCHEDULED_IP` entries for the deleted machine GLBs stay in `tools/licences/lib.mjs`: inert (files and
   readers gone) but they are the fixture of `A-ID-ip-assets-gone`'s 7th negative control.
9. `tools/measure-machines.mjs` keeps a hard-coded `cwd: '/Users/kevinliu/horizon-zero-claude'` (not a donor list; out of
   the removal-only grant's scope) — a hit for brand's code lint.
10. Round-4 gates on the machine rows still stage legacy kinds (gates-perf's carried suite owns them); not run here.

## 6. Requests

| to | what |
|---|---|
| **Kevin** | approve the archive re-fetch, or download the three free archives by hand (UBC `Universal Base Characters[Standard].zip`, MCO `Modular Character Outfits - Fantasy[Standard].zip`, UAL2 `Universal Animation Library 2[Standard].zip`, ≈ 420 MB together, from the itch pages in the rows' `source_url`); then `node tools/build/sources.mjs verify-zip --row ubc-standard --zip <file> --delete-zip` (same for `mco-fantasy`, `ual2-standard`). A mismatch means the pack changed since Oct 15: re-stage with `stage-zip` and rebuild |
| **orchestrator / Kevin** | rule on UAL1: per-file SHA-256s + the upstream-supersession record, or a v1 archive from a backup |
| **orchestrator** | **before removing this worktree, move `models-staging/r5-src` into main** (`mv <tree>/models-staging/r5-src "<main>/models-staging/r5-src"`, same volume, instant) and symlink it into later worktrees (plan rule 10); it is git-ignored, so the merge does not carry it |
| orchestrator | run `node tools/build/staging-cleanup.mjs --root "<main>"` (dry run: 133.79 MB in 49 entries), then `--apply`; delete main's untracked `tools/r5-poc/assets/` (3.0 MB, nothing loads it after the `?poc=human` removal) and the proof scratch `scratchpad/r5/{ubc,mco,ual2}` once `r5-src` is in main |
| orchestrator | re-run `A-specs-data-driven` when the GPU is back (A20b frame bar; main fails identically right now). Keep `R5_SCRATCH` optional: the fixture is now correct with the TMPDIR default |
| orchestrator | merge order with hero-body: their rig profile must not import `tools/r5-poc/ubcRig.js` (deleted here); `A-poc-promoted` names any importer |
| **brand (W0b)** | add `"build:assets": "node tools/build/build-assets.mjs"` to `package.json`; paste `node tools/licences/credits.mjs --md` into README "## Credits"; make `src/ui/menu.js` render `/licences/credits.json` (or the strings verbatim); move `tools/r5-poc/direction-a/horizon-lexicon.txt` (and the logo/palette generators if kept) into `tools/lint/` |
| **hero-body (W0b)** | build Brea through `tools/build/humans.mjs` from `r5-src` (provenance `sources: ['ubc-standard', 'mco-fantasy']`), add her row with `derived_from` through `add.mjs`, ask for (or take in the merge) the `SPECS.hero` swap. `A-glb-budget` grades `public/models/hero/**` (body ≤ 10 k tris / 2 draws / 0.7 MB; outfit ≤ 17.5 k / 1 draw / 0.8 MB; stow kit ≤ 9 k / 1 draw) and `A-human-bind` grades the bind |
| world-ground (W1) | `sites.json` from `tools/r5-poc/direction-a/`; the ground proof in `tools/build/ground/lib/ground-proof.mjs`; stage the Poly Haven rock scan with `sources.mjs stage-zip` (row `r5-poc-rock-scan`); remove `?poc=biome` + `tools/r5-poc/` + `public/models/r5-poc/sounding-ring.glb` (+ its row and `.gitignore` exception) together at the W1 exit |
| instruments-core / instruments-a | the Tiller fixture may keep `/models/r5-poc/tiller.glb` until W1 (it is in the biome closure); when it moves, drop the second output of `gen-tiller.mjs` |

## 7. Files changed (this tree)

New: `tools/build/{sources.mjs, sources.lock.json, humans.mjs, staging-cleanup.mjs}`, `tools/build/lib/{zip,clone}.mjs`,
`tools/build/pipeline/{w0b-checks,biome-check,gen-humans-proof}.mjs`, `tools/build/landmarks/gen-sounding-ring.mjs`,
`tools/build/ground/lib/ground-proof.mjs`, `public/models/r5-poc/sounding-ring.glb`,
`public/licences/{credits.json, quaternius-ubc-License_Standard.txt, quaternius-mco-fantasy-License_Standard.txt,
quaternius-ual2-License.txt}`; git-ignored: `models-staging/r5-src/**` (101 files).
Modified: `tools/build/pipeline/specs-fixture.mjs` (§1), `tools/build/build-assets.mjs` (PROOF), `tools/gates.r5.pipeline.mjs`
(6 new gates), `tools/licences/{add,check,credits}.mjs`, `public/LICENSES.json` (+4 rows, `ual1`), `.gitignore` (+5: the
Sounding Ring exception), `models-staging/MANIFEST.md` (Round-5 header), `src/main.js` (−9 / +1, removal-only),
`tools/optimize.mjs` (−24), `tools/bake-rigs.mjs` (−14), `docs/ROUND5-PIPELINE.md`.
Deleted: 18 files under `tools/r5-poc/` (`build-human.mjs`, `film-{creature-world,human}.mjs`, `gates.r5-poc-human.mjs`,
`gen-{creature,ground,landmark}.mjs`, `lib/{glb,hs}.mjs`, `out/*.json` ×5, `poc-creature.js`, `pocHuman.js`, `tiller.js`,
`ubcRig.js`); 6 under `models-staging/` (`npc/MANIFEST.md`, `anims-{hybrid,reskin,retarget}/quaternius-ual/LICENSE`,
`quaternius-{animatedmech,ultimatemonsters}/License.txt`). No file outside the §2 row and the §1.2 W0b grants was edited.

## 8. Process hygiene

Vite only through the harness (`npx vite --port 5250 --strictPort` from this tree, killed by the harness) and in
middleware mode on unix sockets for the fixtures (no TCP port, dep cache in scratch). Chrome only through
`tools/gates.mjs` and the gates' own child runners (`specs-fixture.mjs`, `biome-check.mjs`, both calling the preflight:
disk ≥ 3 GB, memory free ≥ 25 %, < 2 headless Chromes); at most one Chrome of this lane alive at any time. One calibration
attempt launched while 2 other headless Chromes were alive (a script of mine skipped the preflight; Chrome failed to
start, nothing ran) — fixed and re-run behind the preflight. Port 5173 never touched. Disk 4.0–4.6 GB free throughout;
`r5-src` cost ≈ 5 MB of real disk (clones); shots deleted after reading. Scratch: `scratchpad/r5/pipeline/w0b/` (logs and
reports kept, copies removed). «END-HYGIENE»

---

# Appendix A — W0a report (Oct 15–16 2026, as written then)

Lane: pipeline · port 5250 · wave W0a (foundations) · Oct 15–16 2026 · **fix rounds 1, 2 and 3 applied** (§8, §9, §10).
Plan: `docs/ROUND5-PLAN.md` §2 (row), §1.2 (grants), §3.1–3.2, §6 (R30 rows), §9 (gate block), §10 (licences).

### 0. Status

| W0a deliverable (plan §3.1 / §1.2 / §6) | state |
|---|---|
| Data-driven SPECS + `SPECS.hero` (contract `assets.specs` rows) | **done** — `src/core/assets.specs.js` (data) + `src/core/assets.js` (loader names no row) |
| Shared loader fixes (dequantise, `getX`, provenance read) | **done** — plus lamp no-shadow, `unload()` dispose path, tolerant `loadExtra` |
| R30 deletions, **this lane's share** (plan §6 row 2: `npc.glb`, `npc/README.txt`, `SPECS.npc`) | **done** — 2,737,100 B + README deleted; `camp.js` guard (2 of the 6 granted lines) |
| R30 machine GLBs (plan §6 row 1: **"W0a (instruments-core; SPECS rows by pipeline)"**) | **SPECS rows done here; the file deletion is instruments-core's.** Fix round 3 (the judge's option (b)): this branch leaves `public/models/{watcher,sawtooth,behemoth,thunderjaw}.glb` **byte-identical to base**, and the loader serves each one only while the class that reads it is in the tree. The file and its class leave together in instruments-core's change, so no branch and no merge order can put a class on a missing body. **The placeholder capsule is deleted from the code; no placeholder body exists in any state** (§2.3). The merged tree needs that 4-file deletion (§4.1); until it lands `A-pipeline-r30-merge-order` and `A-ID-ip-assets-gone` FAIL by name |
| `.gitignore` fixed | **done** — `!public/models/**/*.glb`, bake excludes at any depth, `models-staging/r5-src`, proof outputs ignored except the Tiller fixture |
| `A-specs-data-driven`, `A-assets-tracked`, `A-ID-ip-assets-gone` | **PASS** on 5250 (Oct 16 09:26, fix round 3). The IP scan passes in-wave with named exceptions; at `R5_WAVE='W0a exit'` this branch alone **FAILs** it (the four machine GLBs, measured), and the merge with instruments-core's deletion PASSes it |
| `A1`, `A20b` (W0a exit) | **PASS** on 5250 and in the full W0a merge (§4.3) |
| `public/LICENSES.json` + `tools/licences/**` (global-list `A-licence-manifest`) | built; gate **PENDING** (W0b SHA-256 re-fetch, brand's credits wiring, and IP still shipping under scheduled exceptions: `aloy.glb`; in this tree also `aloy-ual.json` and the four machine GLBs). It cannot PASS with IP on disk |
| `tools/build/**` (promoted libs, recipe driver, Tiller generator) | done ahead of W0b where W0a needed it (§2.5) |

Not started (W0b / W0 exit, by plan): the SHA-256 re-fetch and `models-staging/r5-src/` staging (`A-sources-staged`),
`A-build-deterministic` / `A-build-only-lane` as registered gates, `A-human-bind`, `A-glb-budget`, `A-poc-promoted`,
the removal-only donor-list edits in `tools/{optimize,bake-rigs,measure-machines}.mjs`, the `?poc=` removal in `main.js`,
the `models-staging/**` HZD-cast cleanup.

### 1. What changed (files)

| path | what |
|---|---|
| `src/core/assets.specs.js` (new) | the boot rows as DATA: `SPECS` (`hero`, `probe`), `ANIMS` (`ual`), `DELETED` (the 5 R30 rows, each with its `owner`; the four instruments-core rows carry their `reader` class and their boot `row`). Pure data: no imports, plain objects only (checked by the gate) |
| `src/core/assets.js` | rows from `assets.specs.js` + `machines/legacy.js` (lazy, optional); R30 rows by owner (§2.3); shared loader fixes; `unload()`; R30 contract `legacyDeleted(kind)` + `r30`. Fix round 3: the capsule `standIn()` and the whole bridge path are deleted |
| `src/world/camp.js` | grant, 2 lines: the Round-2 single-mannequin fallback runs only if `assets.models.npc` exists |
| `.gitignore` | grant: `!public/models/**/*.glb`; `public/models/**/*.baked.glb`, `public/models/**/*.orig`; `models-staging/r5-src` (no trailing slash: the worktrees symlink it, and git treats a symlink as a file); `public/models/r5-poc/*` (proof outputs, never committed) **except `!public/models/r5-poc/tiller.glb`** (§4.5) |
| `public/models/npc.glb`, `public/models/npc/README.txt` | **deleted** (R30, this lane's §6 row). SHA-256 of what was deleted: `scratchpad/r5/pipeline/r30-deleted.sha256` |
| `public/models/{watcher,sawtooth,behemoth,thunderjaw}.glb` | **unchanged from base** (fix round 3; they were deleted here in rounds 0–2). Restored from the base commit's blobs; SHA-256s equal the recorded ones; `git status` lists none of them, so instruments-core's deletion merges cleanly in either order |
| `public/models/{strider,scrapper,snapmaw,ravager,corruptor,stormbird,glinthawk,longleg,broadhead,grazer,shellwalker}.*` | **metadata only**: `asset.extras.provenance` stamped by `tools/licences/stamp-legacy.mjs`. Verified per file: BIN chunk byte-identical, JSON identical except the added block (`glinthawk.glb` shrank 3,960 B: its FBX2glTF JSON was pretty-printed and is now compact; `longleg.gltf` gets the block inserted textually, every other byte unchanged) |
| `public/LICENSES.json` (new) | 31 rows, every shipped file under `public/` matched exactly once **except the four machine GLBs**, which carry no row by design (a row would have to declare their NC licence; §2.6). Two `ip: true` rows: `legacy-hero-body`, `legacy-anims-lab-bake` |
| `public/licences/{three,three-mesh-bvh,meshoptimizer}-LICENSE.txt` (new) | MIT texts of the shipped code, copied from `node_modules` (no download) |
| `public/models/pipeline/probe.glb` (new, 11 KB) | the loader fixture (§2.4), project-original |
| `public/models/instruments/tiller.glb` (new, 303 KB) | the promoted Tiller, project-original, provenance-stamped; handed to instruments-a with its generator at W1 |
| `public/models/r5-poc/tiller.glb` (new, tracked, 303 KB) | the same bytes at the URL instruments-core's fixture `src/instruments/kinds/tiller.js` loads (§4.5) |
| `tools/build/lib/{hs,glb}.mjs` (new) | promoted from `tools/r5-poc/lib/` (the proof copies stay until the W0 exit) |
| `tools/build/build-assets.mjs` (new) | the recipe driver (`--only <lane>`, `--out <dir>`, `--list`) |
| `tools/build/pipeline/gen-probe.mjs`, `probe.ref.json` (new) | probe recipe + its float reference |
| `tools/build/pipeline/specs-fixture.mjs` (new) | the dynamic half of `A-specs-data-driven` (scratch copy, no-port Vite, one Chrome) |
| `tools/build/instruments/gen-tiller.mjs` (new) | the proof's Tiller generator in the recipe contract; `OUTPUTS` = both Tiller paths |
| `tools/licences/{lib,add,check,credits,ip-scan,stamp-legacy}.mjs` (new) | manifest helpers, row CLI, `A-licence-manifest`, credits generator, `A-ID-ip-assets-gone`, legacy provenance stamp. Fix round 3: `rowless` scheduled exceptions (§2.6) + a 7th negative control |
| `tools/gates.r5.pipeline.mjs` (new) | this lane's gates |
| `docs/ROUND5-PIPELINE.md` (new) | this report |

No file outside the §2 row and the W0a §1.2 grants was edited. Fix round 3 hands back to base the four files whose
deletion plan §6 gives to instruments-core.

### 2. Contracts published (exact signatures)

#### 2.1 `src/core/assets.specs.js` — the `assets.specs` rows (owner: pipeline; consumers: hero-body, instruments-core)

```js
export const SPECS = {
  hero:  { url: '/models/aloy.glb', targetHeight: 1.72, yaw: 0, yOffset: -0.055, required: true },
  probe: { url: '/models/pipeline/probe.glb', targetHeight: 0.6, yaw: 0, dequantise: true },
};
export const ANIMS = { ual: { url: '/anims/AnimationLibrary_Godot_Standard.gltf' } };
export const DELETED = {                       // R30 rows; remove at W0b
  <kind>: { file, ruling: 'R30', owner: 'pipeline' | 'instruments-core', why,
            reader?: 'src/entities/machines/<kind>.js',   // instruments-core rows: the class that reads the file
            row?: { url, targetHeight, yaw } },           // its boot row, served only while `reader` is present
};
```
Row shape (all optional except `url`, `targetHeight`): `{ url, targetHeight, yaw, yOffset?, shadowPolicy?: { minFraction, alwaysLargest }, dequantise?: boolean, noShadow?: string /* RegExp source over material names */, required?: boolean }`.
**`SPECS.hero`** is the hero body row; hero-body swaps its `url` (and `targetHeight` / `yOffset`) to Brea in W0b.
That is a one-row data edit in a pipeline-owned file: pipeline makes it on request in W0b (or the orchestrator grants it).

#### 2.2 `src/core/assets.js`

```js
export const SPECS;                 // core boot rows + the R30 rows still served here, minus every R30 file gone from the tree
export const ANIMS;
export { DELETED };
export function r30Live(deletedRow): boolean
  // true while an instruments-core R30 row's `reader` class is in this tree (a lazy-glob presence test of
  // src/entities/machines/*.js, nothing imported); then its file is an ordinary boot row
export async function legacyRows(): Promise<{ boot: Rows, deferred: Rows }>
  // reads src/entities/machines/legacy.js if present (lazy import.meta.glob):
  //   BOOT_SPECS   -> merged into ctx.assets.specs and loaded at boot
  //   LEGACY_SPECS -> ctx.assets.deferredSpecs (listed only; legacy.js loads them itself)
export const SHADOW_POLICY = { minFraction: 0.15, alwaysLargest: 8 };
export function applyShadowPolicy(root, policy = SHADOW_POLICY): number   // unchanged; skips userData.noShadow meshes
export function readAttribute(attr, out?): Float32Array                    // getComponent read: interleaved + normalised safe
export function isQuantised(attr): boolean
export function dequantiseRoot(root): number                               // attributes expanded; `_bone` lifted to geometry.userData.r5Labels via getX
export function readAssetExtras(gltf): object                              // asset.extras of the source document
export function disposeObjectTree(root): { geometries, materials, textures, skeletons }

class Assets {
  models: { [name]: Entry }; anims; specs; deferredSpecs; loader;
  skipped: Array<{ name, status: 'SKIP-legacy-deleted' | 'SKIP-load-failed', note }>;
  r30: { deleted: string[], pending: string[] };   // set by loadAll: gone (SKIP-legacy-deleted) | still served with its reader class
  legacyDeleted(kindOrModelKind): { name, status: 'SKIP-legacy-deleted', note } | null
    // THE R30 CONTRACT FOR GATES: a subject that answers here reports `SKIP-legacy-deleted (R30)` with `record.note`
  loadAll(onProgress?): Promise<models>
  loadExtra(rows, { onProgress?, onEntry?(entry, name, spec), force? }): Promise<models>
    // a row naming an R30 file gone from this tree is never fetched (SKIP-legacy-deleted); a failing row is
    // skipped with a warning and `skipped` gets SKIP-load-failed; the promise no longer rejects for one bad row
  unload(name): counts | null                                              // dispose path (skeleton.dispose() included)
  normalize(name, gltf, spec): Entry
}
Entry = { root, gltf, size, spec, animations, shadowCasters, provenance, extras, dequantised }
```
Removed in fix round 3: `standIn()`, `Entry.standIn` / `Entry.legacyDeleted`, `skipped[].bridge`, `r30.bridges`,
`r30.halfMerged` (nobody else read them: checked in the instruments-core, gates-perf and engine-gpu trees).
Behaviour kept identical for the Round-4 files: same normalisation, same `FrontSide` rule, same shadow policy; the
default lamp/sensor/lens no-shadow pattern applies only to provenance-carrying assets or rows that set `noShadow`.

#### 2.3 R30 by owner — and why no placeholder exists any more (fix round 3)

Plan §6 splits the R30 deletion by owner:

| §6 row | files | deleted by | in this branch |
|---|---|---|---|
| 1 | `public/models/{watcher,sawtooth,behemoth,thunderjaw}.glb` + `watcher.js`, `sawtooth.js`, `behemoth.js`, `thunderjaw.js`, `redeye.js`, their legacy/shell rows | **instruments-core** (SPECS rows by pipeline) | the GLBs are left at base; their boot rows live in `DELETED.<kind>.row` and are served only while `reader` exists |
| 2 | `public/models/npc.glb`, `npc/README.txt`, `SPECS.npc` | **pipeline** (`camp.js` guard) | deleted; never fetched; `SKIP-legacy-deleted` |

Rounds 0–2 deleted the row-1 GLBs here too, which made this branch alone (and any commit holding pipeline without
instruments-core) a state where the old classes were still constructed but had no body — the capsule crash guard,
and the carried / visual FAILs the judges filmed. Fix round 3 takes the judge's option (b): the file and the class
that reads it now go in **one** change (instruments-core's, as §6 assigns), and the loader keys each row to its
reader:

| tree state | file | reader class | loader | world |
|---|---|---|---|---|
| this branch alone, or pipeline merged before instruments-core | present | present | served (real GLB) | as base: real Watchers, Sawtooths, Behemoth, Thunderjaw |
| instruments-core alone (their tree today) | present | gone | (base loader) loads it, unused | no R30 kind |
| both merged + instruments-core's 4-file deletion | gone | gone | never fetched, `SKIP-legacy-deleted` | no R30 kind, no capsule |
| both merged, deletion missing | present | gone | never fetched | no R30 kind; **`A-pipeline-r30-merge-order` + `A-ID-ip-assets-gone` FAIL: orphaned IP files** |
| synthetic half state (file gone, class present) | gone | present | — | not reachable from any branch; the guard FAILs it by name |

There is no placeholder body in any state: `standIn()` is deleted and `A-pipeline-boot-rows` asserts that no model
entry, mesh or material in the scene is a stand-in.

#### 2.4 Loader fixture

`public/models/pipeline/probe.glb`: a 0.6 m datum stake (hex bisque plinth, bronze post, lamp bead), 340 tris,
253 verts, 2 materials, 11,092 B; KHR_mesh_quantization + EXT_meshopt_compression, a `_BONE` label stream
(1-byte, interleaved: array length 228 for 57 vertices), a TEXCOORD_1 set, a lamp material.
`tools/build/pipeline/probe.ref.json` is the float snapshot of every mesh after reorder and before quantisation.
Nothing in the game reads it; frame `frames/pipeline-probe.png` (placed by hand for the frame only).

#### 2.5 Build pipeline (`tools/build/**`)

```js
// tools/build/lib/glb.mjs
export const LICENCES = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0', 'project-original'];
export const GENERATOR = 'CALIMA tools/build';
export async function writeGLB(parts, { file?, provenance /* required */, extras?, compress? = true, reference?(doc) })
  : Promise<{ bytes, tris, verts, materials, meshes, textures, bones, reference }>
  // writes asset.extras = { ...extras, provenance: { generator, recipe, sources, licence }, r5Stats: {tris, verts, materials, meshes, textures, bones} }
  // (`r5Size` stays the recipe's own [x, y, z] design size, as in the proof)
export function checkProvenance(p), export function snapshotPositions(doc, decimals = 6)

// recipe contract, discovered by tools/build/build-assets.mjs (gen-*.mjs anywhere under tools/build, or recipes/**)
export const LANE = '<lane id>';  export const OUTPUTS = ['<repo-relative path>', ...];
export async function build({ out }): Promise<stats>   // deterministic, offline, sources only from models-staging/r5-src/
```
`node tools/build/build-assets.mjs [--only <lane>] [--out <dir>] [--list]` prints one JSON line (per-output SHA-256
and bytes, wall ms, peak RSS). Measured (fix round 2, 4 outputs: probe, its reference, the Tiller and its r5-poc
copy): two builds under `sandbox-exec (deny network*)` byte-identical, 518 / 400 ms, 209 / 211 MB peak RSS; all three
committed GLBs equal the build's bytes. Not touched in fix round 3.

#### 2.6 Licences (`tools/licences/**`, `public/LICENSES.json`)

```
node tools/licences/add.mjs --json '<row>' | --file row.json | --remove <id> | --format    # validates, keeps rows sorted
node tools/licences/check.mjs          # A-licence-manifest report (exit 1 on FAIL)
node tools/licences/ip-scan.mjs        # A-ID-ip-assets-gone report
node tools/licences/credits.mjs --md | --json   # README "Credits" body / menu CREDITS rows
node tools/licences/stamp-legacy.mjs [--check]  # legacy provenance stamp (idempotent)
R5_WAVE='<wave>' node ...              # e.g. R5_WAVE='W0a exit': the orchestrator's wave-exit runs declare the wave
```
```js
// tools/licences/lib.mjs
export const WAVES = ['W0-day1','W0a','W0a exit','W0b','W0 exit','W1','W1 exit', … ,'W4 exit'];
export function parseWave(s): string | null           // "W0 exit (R30)" -> 'W0 exit', "0b" -> 'W0b'
export function deadlineOf(delete_at): string | null  // a bare wave is a deadline at its exit: 'W0a' -> 'W0a exit'
export function currentWave(root?, env?): { wave, source, env, envWave, inferred, reports }
export const SCHEDULED_IP = { '<public path>': { delete_at, owner, why, liveRow?, rowless?, reader?, source? } }
export async function loadSpecs(root?): SPECS | null
export function rowProvenanceText(row): string
export function scheduledStatus(file, rows, { wave, specs, root? }): { valid, why, deadline?, owner?, rowless?, reader? }
// tools/licences/check.mjs: export async function check(root?, { env? }) -> { pass: true|null|false, clauses }
// tools/licences/ip-scan.mjs: export async function scan(root?, { env? }); export async function selfTest(dir)
```
**IP rows are never accepted** (fix round 1): `validateRow` requires attribution / `source_url` with no `ip`
exemption, and an `ip: true` row also needs `delete_at` + `delete_owner`. A scheduled exception holds only while
its row is `ip: true` with the same deadline, the repository is before that deadline (`currentWave`), and — for
`aloy.glb` (`liveRow: 'hero'`) — `SPECS.hero` still points at it.

**`rowless` exceptions (fix round 3).** The four machine GLBs are back in this tree (their deletion is
instruments-core's this wave). They carry **no** LICENSES.json row — a row would have to declare their source
licence, and three are CC-BY-NC-4.0, which no manifest may declare (the plan's own clause) and `validateRow` rejects.
Their source records (title, author, licence) sit in the exception entry itself. A `rowless` exception holds only
while **all** of: no row matches the file; the wave is before its deadline (W0a exit); its `reader` class is still
in the tree. Otherwise it is an IP hit in both licence gates (`files-matched` FAIL: unmatched; `legacy-source` FAIL).
A 7th negative control runs on every `A-ID-ip-assets-gone` run (§3): the planted rowless file is honoured in-wave and
caught at `R5_WAVE='W0a exit'`, when its reader is deleted (ORPHANED), and when a row appears for it.

### 3. Gates

Registered in `tools/gates.r5.pipeline.mjs`. Until gates-perf's `A-gates-autodiscover` merges, the harness only
scans `tools/gates.round4.*.mjs`, so the file goes in through the runner's existing `--extra` flag:

```
R5_SCRATCH=<scratch outside the repo> node tools/gates.mjs --port 5250 --extra tools/gates.r5.pipeline.mjs --lane pipeline
```
(after autodiscovery: drop `--extra`; gates-perf's registry already imports this file in the merge, §4.3).
`A-specs-data-driven` launches one Chrome of its own in a child process, ordered before the page gates, so the
harness's lazily launched browser is never alive at the same time.

Fix round 3 runs (Oct 16, port 5250, this tree, the real harness; one Chrome of mine at a time, each launch
holding a ticket in gates-perf's machine-wide Chrome semaphore on top of the < 2 headless Chromes / disk / memory
preflight; reports and logs in `scratchpad/r5/pipeline/fix3/`): the lane block 09:26–09:27 (`A.lane.log`); the global,
carried and visual block 09:27–09:49 (`A.all.log`, 31 gates); A44 three more times 09:49–09:51 (`A.a44r*.log`); the
judge's camera 09:51 (`A.film.log`); A9 + A50b four more times 10:14–10:19 (`D.*.log`); A21 10:20 (`E.a21.log`).

| gate | wave | result on 5250 | measured |
|---|---|---|---|
| **A-ID-ip-assets-gone** | W0a | **PASS** (in-wave) | 23 shipped GLB/glTF read with gltf-transform (the four machine GLBs are back in this tree): 0 IP hits, 0 without provenance, 0 unreadable; 221 shipped files of every type graded through their LICENSES.json rows, 0 unflagged IP rows; 6 manifests, 0 declared NC/ND. **6 named exceptions**: `aloy.glb` (W0 exit, hero-body, `SPECS.hero` still points at it), `anims-hybrid/aloy-ual.json` (W0a exit, gates-perf) and the rowless `watcher`/`sawtooth`/`behemoth`/`thunderjaw.glb` (W0a exit, instruments-core, each valid only while its class file exists; their extras match `sketchfab`, so they are graded as IP and listed). **Negative controls 7/7** (new: `pendingOtherLane` — honoured in-wave, caught at `R5_WAVE='W0a exit'`, when orphaned, and when a row appears). **At `R5_WAVE='W0a exit'` this tree alone FAILs: 5 EXPIRED hits** (the 4 GLBs + `aloy-ual.json`) |
| **A-assets-tracked** | W0a | **PASS** | 221 referenced paths: 0 ignored, 0 missing; the 4 machine GLBs are graded as served files (present, tracked); rules 5/5 must-track, 10/10 must-ignore; negative control caught; Tiller fixture tracked |
| **A-specs-data-driven** | W0a | **PASS** | static: 0 row names, 0 asset URLs in `assets.js` (the R30 boot rows are data in `DELETED`); `assets.specs.js` pure data. Dynamic: scratch copy (588 files), diff exactly `assets.specs.js` + `probe.glb` deleted; A1 PASS, A20b PASS (0 / 0, 225 frames); 24.9 s; copy, socket and profile removed |
| **A-licence-manifest** (global list) | W0b | **PENDING** | PASS: row-schema (31 rows), code-rows, licence-texts, size 38.90 MB ≤ 60. PENDING: files-matched (only the 4 rowless pending deletions, named), third-party (W0b re-fetch), legacy-source (IP ships under the 6 exceptions), credits (brand W0b). No clause FAILs |
| **A-loader-fixes** | (grant check) | **PASS** | dequantised error 0.0198 mm; fold through `rig/lod.js`: 0 mm moved, 0 mm uncovered; labels via `getX` exact; lamp casts no shadow; entry disposed. Negative control: raw quantised re-bake 120 mm, dequantised 0 mm |
| A-pipeline-boot-rows (lane guard) | — | **PASS** | boot rows `watcher`, `sawtooth`, `behemoth`, `thunderjaw`, `hero`, `probe` all loaded, 0 SKIP-load-failed; `npc` SKIP-legacy-deleted; `r30 = { deleted: [npc], pending: [watcher, sawtooth, behemoth, thunderjaw] }`; **0 placeholder entries, 0 placeholder meshes in the scene**; R30 machines, all on real bodies: watcher 6, sawtooth 2, behemoth 1, thunderjaw 1, tallneck 1 (0 on a deleted body); camp NPCs 13 |
| A-pipeline-r30-merge-order (lane guard) | — | **PASS** (FAIL in fix round 2) | consistent: the 4 GLBs present together with their 4 classes, `npc` gone, 0 chassis imports of a deleted class, `camp.js` guard present, `SCHEDULED_IP` agrees with `DELETED`. It FAILs the orphan and half states by name (§4.1) |
| A1-boot-clean | W0a exit | **PASS** | `state=playing` |
| A20b-no-system-errors | W0a exit | **PASS** | 0 / 0, 191 frames |

Global green list items that exist in this tree (same session):

| gate | result | measured |
|---|---|---|
| A9-perf-budget | **PASS** 3 of 5 runs; PENDING 2 (contention) | 319 draws in every run (< 350); 46.2 / 51.9 / 52.3 fps attributable (scene GPU 32.3 / 19.5 / 19.5 ms); 32.5 and 38.4 fps not attributable (5.9 / 5.3 ms of GPU with nothing drawn) |
| A21-real-draw-calls | PENDING (contention), 2 runs | draws 319 / 211 / 340 and triangles 4.24 / 3.92 / 4.38 M — PASS terms; GPU / frame / JS terms not attributable (frame-burst instability 2.27×). The raw GPU medians (90–147 ms) sit in the band the other lanes' trees measure on this box (78–187 ms): engine-gpu's terms, unchanged by this lane |
| A90-memory-stability | **PASS** | 30 kills; heap −0.7 %, geometries +13, textures −19, objects −526 |
| A90-memory-stability-expansion | **PASS** | non-machine growth 0, orphan roots 0, heap −0.6 %, objects −416, geometries +4 |
| A90b-memory-attribution | **PASS** | self-test ok; 0 offenders, 0 orphaned textures; heap −5.4 % after forced GC |
| A90-rig-reclaim | **PASS** | 30 cycles over 17 kinds (the R30 kinds on their real bodies again); geometries +9 (≤ 40), textures 0; per live Watcher 0 geo / 0.38 tex; held-then-released 0 |
| A-port-guard, A-carried-suite, A-alloc-rate, A-vram-ledger, A90-abs, A-no-horizon-terms-*, A-reach-all-sites | not in this tree | other lanes' gates (the carried rows run in the merge simulation, §4.3) |

Visual gates: pipeline has none (plan §9: 11 action, 0 visual). The judges' cited shots were re-filmed and read
(`scratchpad/r5/pipeline/fix3/frames/`):
- `fix3-tree-watcher.png` — `tools/screenshot.mjs` on 5250, the judge's eval and camera (player 7 m south of the
  route Watcher at (−60, 10), camYaw π, pitch 0.12): the real rigged Watcher body standing on its legs, orange eye,
  under "WATCHER LV 5 / SPOTTED" (eval: `/models/watcher.glb`, 8 meshes, 6 skinned, 0 placeholder). Fix round 2's
  frame at this camera (`fix2/frames/fix2-tree-standin-watcher.png`) was the grey capsule.
- `tree-V6-machine-death.png` — a collapsed Watcher wreck with its loot beam; **the same frame as engine-gpu's
  near-main baseline** (`engine-gpu/tree/shots/gates/V6-machine-death.png`), no capsule.
- `tree-V25-alarm-converge.png` — three Watchers converging, amber sensor eyes lit, under "WATCHER LV 5"; no capsule.
- `tree-V26a-silhouette.png` — the lineup ends with the real Redeye Watcher (red eye); no capsule.
- `tree-V12`, `tree-V14`, `tree-V23`, `tree-V24` — the backgrounds the judge cited: real machine bodies (a Watcher
  behind the sprint in V12, a Watcher on the plain in V14 — the frame equals engine-gpu's baseline, whose grey
  cylinder at left is a world prop present there too — machines in V23/V24); no capsule anywhere.
- `full-site.png` (merge, §4.3) and `sim-full-V6/V25` — no capsule, no machine at the judge's camera, gates-perf's
  named SKIP cards.

### 4. Merge notes

#### 4.1 Merge order — any order; one 4-file deletion completes R30

0 shared paths between pipeline and the other three W0a branches (measured again in fix round 3: instruments-core
39 changed paths, gates-perf 105, engine-gpu 6, none of them mine), so git merges them in any order, and
**every intermediate state is a working game with no placeholder** (§2.3 table). Measured (runner gates in node,
merge simulations in `scratchpad/r5/pipeline/fix3/`):

| state | `A-pipeline-r30-merge-order` | `A-ID-ip-assets-gone` | `A-assets-tracked` | `A-licence-manifest` |
|---|---|---|---|---|
| pipeline alone (this tree, lane run) | **PASS** — 4 kinds pending with their classes, `npc` gone | **PASS** in-wave (6 named exceptions) · **FAIL** at `R5_WAVE='W0a exit'` (the 4 GLBs + `aloy-ual.json`) | PASS | PENDING |
| pipeline + instruments-core + gates-perf + engine-gpu, **without** the 4-file deletion (`sim-fullnorm`) | **FAIL** — 4 × "ORPHANED IP FILE … delete it (owner instruments-core, plan §6 row 1)" | **FAIL** — 4 ORPHANED hits | PASS (212 paths) | FAIL (files-matched, legacy-source) |
| the same **with** the deletion (`sim-fullrm`) | **PASS** — every R30 file and reader gone | **PASS** (one exception, `aloy.glb`) | PASS (4 R30 paths listed as deleted) | PENDING (W0b clauses + `aloy.glb`) |
| the same at `R5_WAVE='W0a exit'` (`sim-fullrmexit`) | PASS | **PASS** | PASS | PENDING |
| synthetic half state: this tree minus the 4 GLBs, classes kept (`sim-halfsynth`) | **FAIL** — 4 × "HALF STATE … the class would boot without a body" | PASS | — | — |

**The one action left for R30 (owner instruments-core, plan §6 row 1):** delete
`public/models/{watcher,sawtooth,behemoth,thunderjaw}.glb`. Two ways, both measured above:
1. instruments-core adds the `git rm` to its branch. Its tree alone boots HEAD's `assets.js`, whose `loadAll` rejects
   on a missing boot row, so it needs pipeline's `src/core/assets.js` + `src/core/assets.specs.js` synced in first
   (the orchestrator's day-1 contract-stub sync, plan §0 rule 10) — after that its branch is self-consistent
   alone and the merge with pipeline is clean in either order (base-identical files on this side, so no
   modify/delete conflict).
2. or the orchestrator runs `git rm public/models/{watcher,sawtooth,behemoth,thunderjaw}.glb` in the commit that
   completes the pipeline + instruments-core pair (whichever merges second). Every earlier commit boots as base did.

Either way the check is `A-pipeline-r30-merge-order` PASS and `A-ID-ip-assets-gone` PASS at `R5_WAVE='W0a exit'`.

#### 4.2 This tree's carried rows — the half-merge is gone (fix round 3)

The fix-round-2 FAIL list, re-run on 5250 in this tree with the four GLBs back (run `all`, plus reruns):

| row | fix round 2 (capsule bridges) | fix round 3 (real bodies) |
|---|---|---|
| A47-corpse-grounded | FAIL — watcher −0.32 m, redeye −0.31 m | **PASS** — 0 offenders, 17 species (watcher −0.01 m, redeye +0.04 m) |
| A47b-corpse-posed | FAIL — watcher −0.296 m, redeye −0.297 m | **PASS** — 0 offenders, 17 species (watcher −0.025 m) |
| A44b-socket-vertex-integrity | FAIL — redeye 0.287 m | **PASS** — worst 0.019 m over 246 sockets |
| A92-arrow-corpse-release | FAIL — control 0 riding | **PASS** — control 8 riding / 8 reparented; phase A 8 riding at death, 0 orphaned, 0 stray |
| A76b-footfall-species | FAIL — watcher, redeye silent | **PASS** — 16 walkers, 0 silent (watcher 885, redeye 259 footfalls) |
| A48b-cadence-headroom-expansion | FAIL — watcher 1.0, redeye 0.947 | **PASS** — 6 species, 0 ceiling-bound frames (watcher 0 / 897, redeye 0 / 870) |
| A25c-camera-vs-machine | FAIL — staged the bridge | **PASS** — watcher + thunderjaw: the boom shortens at the metal, full when clear |
| A47c-corpse-mass | FAIL — watcher, redeye, tallneck, corruptor | **PASS** — 0 offenders, 16 species (watcher ratio 0.42) |
| A6-machine-foot-plant | PENDING — idle bridge watcher | **PASS** — watcher, worst ground error 0.058 m over 7 planted samples |
| A44-socket-integrity | FAIL — longleg dead head 0.123 m | **PASS 4 / 4** — worst 0 / 0.07 / 0.07 / 0.07 m; longleg dead head 0 / 0.065 / 0 / 0 m (the 0.07 is glinthawk's alive eye) |
| A50b-aim-on-drawn-geometry | FAIL — behemoth 92 %, shellwalker 68 % | **PASS 4 of 5** on 5250 — behemoth 100 % in every run; the long run's one FAIL was shellwalker 92 % (4 of 50 truthed rays not covered by its `shell-hard` hulls, 0 ghost hits, 16 species 100 %); the 4 reruns: shellwalker 100 % each. Bisect below |

Also PASS in that run: A44c, A45, A46, A48, A43.

**Bisect — is any remaining intermittency this lane's?** (Run C, 10:07–10:13, `sim-diagmine.json` /
`sim-diagbase.json`.) The same simulation harness on two copies of this tree: as it is, and with **every one of this
lane's 23 runtime changes under `src/` and `public/` put back to base** (`npc.glb` back, base `assets.js` and
`camp.js`, unstamped GLBs, no specs file). Each copy: A44, six A50b (A50b's own assert, wrapped with a snapshot of
the first live shellwalker), A44, A44.
- **A50b: this tree 5 PASS / 1 FAIL; base 5 PASS / 1 FAIL — the same failure in both** (watcher 96 %: 2 hits on
  invisible geometry); shellwalker 100 % in all 12 runs.
- **A44: this tree worst 0.036 / 0 / 0 m; base 0.017 / 0.036 / 0 m** — the longleg dead head, in the same band.

So the rows that still move, move identically without this lane's change; their source is the Round-4 rows
themselves (gates-perf's own tree logs a non-zero longleg dead head in 6 of its runs, 0.021–0.048 m).

**Correction (finding 2 of fix round 2).** Until fix round 2 this report called the A44 `longleg` dead-head FAIL
"intermittent, not caused by the bridges". The numbers say otherwise: it moved past the budget only in this branch while it held the
bridge capsules — FAIL at 0.123, 0.127 (my fix-round runs), 0.125, 0.13 (the pipeline film judge) and 0.129 m (the
gate judge's 05:21 run), PASS at 0.096 and 0.012 m in the other runs of that same state — never in another lane's
tree (gates-perf's own tree ranges 0–0.048 m) and at most 0.052 m in the merged simulations. The row is
`longleg`'s dead head, but the world it measures (who dies where, what the corpse falls against) was the half-merge
world with 14 capsule machines in it. With the bridges gone (§10) it is re-measured four times in this tree and
three times in the merged tree: every run PASS — this tree 0 / 0.065 / 0 / 0 m, the merge 0 / 0.052 / 0 m, against the
0.1 m budget; and the bisect (§4.2) shows base itself at 0.017–0.036 m, so the sub-budget gap is the row's own
spread, while the 0.12–0.13 m FAILs belonged to the capsule state that no longer exists.

#### 4.3 The supported state, measured (merge simulation `full`, fix round 3)

**Fix round 3 (Oct 16 09:52–10:07; `fix3/sim-full.json`).** pipeline (this tree) + the current working trees of
instruments-core (39 paths), gates-perf (105) and engine-gpu (6) — 0 paths shared with pipeline, no edit to any
lane's file — **plus instruments-core's plan §6 deletion of the four machine GLBs** (applied in the copy, `--rm`).
Vite in middleware mode on a unix socket, one Chrome, gate bodies from the copy's own registry (gates-perf's
autodiscovery: 264 gates, 0 load failures); copy, socket and profile removed (`cleaned: true`):

- **Runner gates:** `A-pipeline-r30-merge-order` **PASS** (every R30 file and reader gone); `A-ID-ip-assets-gone`
  **PASS** (one exception, `aloy.glb`), and PASS again at `R5_WAVE='W0a exit'` (`sim-fullrmexit`); `A-assets-tracked`
  **PASS** (212 paths, the 4 GLBs listed as deleted); `A-licence-manifest` PENDING (W0b clauses + `aloy.glb`).
- **Boot:** A1 PASS, A20b PASS (0 / 0, 358 frames), `A-pipeline-boot-rows` PASS — boot rows `hero`, `probe` +
  instruments-core's `BOOT_SPECS` strider, scrapper, glinthawk, longleg; `r30 = { deleted: [watcher, sawtooth,
  behemoth, thunderjaw, npc], pending: [] }`; 0 placeholder entries, 0 placeholder meshes.
- **The world:** 28 live machines over 12 kinds (strider 6, scrapper 3, glinthawk 3, longleg 2, broadhead 2, grazer 2,
  snapmaw 2, shellwalker 2, ravager, corruptor, stormbird, tiller 3), no R30 kind, nothing in its place.
- **Carried rows (gates-perf's re-staged versions): PASS** — **A44 three times** (worst 0.07 m each, glinthawk's
  alive eye; longleg dead head 0 / 0.052 / 0 m), A45, A46, A47 (12 species), A48, A45c, A44b (worst 0.003 m, 142
  sockets), A47b, A50, A45b, A91, A92 (control 8 riding, phase A 8 at death), A93, A94, A95, A76b, A25c, A48b, A43,
  A50b (12 species, all 100 %), A47c, A49. Named SKIPs (PENDING, never PASS): A76 (SKIP-R18, one declared size
  class), A6 ("no planted samples"), A44c (SKIP-legacy-deleted R30 + SKIP-legacy R28 roles). V6 and V25 film
  gates-perf's card "SKIP-legacy-deleted (R30): role sentry: no live kind yet (lands with Plumb, instruments-a W1)";
  V26a is gone from the registry (gates-perf).
- **Frame:** the judge's camera (player (−60, 3), camYaw π, pitch 0.12) — `fix3/frames/full-site.png`: no capsule,
  no machine HUD, eye "UNSEEN", 0 machines within 45 m, the tower prop and aqueduct unchanged.

The same merge **without** the 4-file deletion (`sim-fullnorm`, runner gates) boots the same world (the GLBs are
never fetched once their classes are gone) but FAILs `A-pipeline-r30-merge-order` and `A-ID-ip-assets-gone` with four
"ORPHANED … delete it (owner instruments-core, plan §6 row 1)" lines each (§4.1).

#### 4.4 The gates-side hook — withdrawn

Fix rounds 1–2 proposed a `legacyDeleted()` line in gates-perf's `SPECIES` preludes to skip bridge bodies. There are
no bridge bodies any more, so the request is withdrawn. `ctx.assets.legacyDeleted(kind)` stays the R30 contract for
any gate whose subject was a deleted file (`npc` now; the four machine kinds once their deletion lands).

#### 4.5 The Tiller fixture's GLB — no cross-lane edit (fix round 2)

instruments-core's `src/instruments/kinds/tiller.js` (their file until W1) loads `/models/r5-poc/tiller.glb`.
Pipeline ships a tracked file at exactly that URL:

- `tools/build/instruments/gen-tiller.mjs` `OUTPUTS` = `public/models/instruments/tiller.glb` (the final path,
  handed to instruments-a at W1) **and** `public/models/r5-poc/tiller.glb` (the same bytes, SHA-256
  `56be9998…c490af3a8`, 309,880 B, provenance-stamped: `project-original`, recipe `gen-tiller.mjs`).
- `.gitignore`: `public/models/r5-poc/*` + `!public/models/r5-poc/tiller.glb` — every other proof output there
  stays ignored. LICENSES row `instrument-tiller` covers both paths.
- A merge into a tree that holds the old, unstamped proof file there (Kevin's main tree has one, ignored) replaces
  it silently (checked on a scratch repo with git 2.43.2).
- What comes later, each step in its owner's own wave: the fixture moves off `r5-poc/` (instruments-core W0b, or
  instruments-a at W1); only after that is on main does pipeline drop the second output and delete
  `public/models/r5-poc/` (`A-poc-promoted`, W0 exit). `A-assets-tracked` FAILs and names the file if the order is wrong.

### 5. Honest gaps

1. **R30 is complete only once instruments-core's 4-file deletion lands** (§4.1). This branch no longer deletes
   those files (plan §6 gives them to instruments-core); the merged tree FAILs `A-pipeline-r30-merge-order` and
   `A-ID-ip-assets-gone` by name until they are gone. instruments-core's branch today deletes the classes but not
   the GLBs, and it cannot delete them on its own while its tree runs HEAD's loader (§4.1, way 1).
2. `A-ID-ip-assets-gone` PASSes **in-wave** in this tree with six named exceptions: `aloy.glb` (W0 exit, hero-body),
   `anims-hybrid/aloy-ual.json` (W0a exit, gates-perf) and the four machine GLBs (W0a exit, instruments-core, rowless,
   valid only while their classes exist). That is the exception mechanism the gate already used for `aloy-ual.json`,
   not a lower bar at the exit: at `R5_WAVE='W0a exit'` this tree alone FAILs it (5 hits, measured), and only
   the merge with the deletion PASSes. It stays a working-tree guarantee only: deleted files remain in git history
   (§11 decision 2, Kevin's action). The scan reads non-GLB files through their LICENSES.json rows, not their bytes;
   167 OGGs carry the old project name as encoder tag (audio lane, W3, `A-no-horizon-terms-*`).
3. `A-licence-manifest` is PENDING, not PASS: the archive SHA-256 re-fetch (W0b, ≈ 420 MB download that needs Kevin's
   explicit go-ahead), brand's README / in-game credits, and IP still shipping under scheduled exceptions.
4. `currentWave` with no `R5_WAVE` is a lower bound (latest first wave among lanes whose report exists). Inside a
   wave the exact step (e.g. "W0a" vs "W0a exit") is only known if the orchestrator sets `R5_WAVE` on its exit runs.
5. The legacy fonts (`public/fonts/*`, OFL) ship without their OFL.txt (pre-existing; brand replaces them at the W0
   exit with texts included).
6. `A-loader-fixes` exercises the static fold path; the skinned `unifySkin` path is covered only by the direct
   re-bake negative control (W0b extension: the Tiller through `attachRigRuntime`).
7. `npm run build:assets` needs the script line in `package.json` (brand's file); `A-build-deterministic` /
   `A-build-only-lane` are not registered yet (W0b, once `r5-src` sources exist).
8. `public/textures/r5-poc/*` and the `?poc=` hooks stay per plan; the production bundle still carries the
   `?poc=human` proof's six CC0 GLBs (3.1 MB) from `tools/r5-poc/assets/` until `A-poc-promoted` (W0 exit).
9. main's untracked `models-staging/{orig,baked}/` (≈ 25 MB, ignored) may hold the original Sketchfab/NC
   downloads; the W0b cleanup must look there in the main tree (orchestrator; lanes cannot touch main).
10. A21 is PENDING on contention (other lanes' headless Chromes during the runs); its draw and triangle terms
    pass, and its raw GPU medians match the other lanes' trees on this box. A9 PASSed 3 of 5 runs, PENDING (not
    attributable) in the 2 contended ones.
11. The merge simulations use a Vite in middleware mode behind request interception rather than the harness's TCP
    Vite (lanes may only bind their own port from their own tree); the per-gate steps mirror `tools/gates.mjs`, but
    `kind: 'runner'` gates there run in node against the simulated copy.

### 6. Requests

| to | what |
|---|---|
| **orchestrator + instruments-core** | **delete `public/models/{watcher,sawtooth,behemoth,thunderjaw}.glb`** (plan §6 row 1, instruments-core's): either sync pipeline's `src/core/assets.js` + `src/core/assets.specs.js` into instruments-core's tree and let them add the `git rm` to their branch, or `git rm` the four files in the commit that completes the pipeline + instruments-core pair (§4.1). Check: `A-pipeline-r30-merge-order` PASS, `A-ID-ip-assets-gone` PASS at `R5_WAVE='W0a exit'` |
| orchestrator | ~~decide the R30 merge order~~ — **withdrawn** (fix round 3): any order works; no state shows a placeholder |
| orchestrator | set `R5_WAVE` on wave-exit runs (`R5_WAVE='W0a exit'`, `'W0 exit'`, …) so scheduled IP exceptions are graded against the exact step |
| orchestrator | run this lane's gates with `--extra tools/gates.r5.pipeline.mjs` until autodiscovery merges; set `R5_SCRATCH` to a scratch dir outside the repo |
| pipeline (W0b, self) | remove the four `rowless` `SCHEDULED_IP` entries and `DELETED`'s rows once the deletion is on main; remove the stale `legacy-anims-*` rows after gates-perf's deletion has merged; remove `SCHEDULED_IP['public/models/aloy.glb']` and the `legacy-hero-body` row together with `aloy.glb` |
| gates-perf | ~~adopt the `legacyDeleted()` prelude hook~~ — **withdrawn** (§4.4); keep `tools/gates.r5.pipeline.mjs` in autodiscovery (its runner gates are `kind: 'runner'`) |
| Kevin | approve the W0b archive re-fetch (≈ 420 MB transient, deleted the same day) so `archive_sha256` can be recorded |
| brand (W0b) | add `"build:assets": "node tools/build/build-assets.mjs"` to `package.json`; paste `node tools/licences/credits.mjs --md` into README "Credits" and feed `--json` to `menu.js` `CREDITS` |
| hero-body (W0b) | Brea's GLBs through `tools/build/lib/glb.mjs` (provenance mandatory), rows via `tools/licences/add.mjs`; ask pipeline for the `SPECS.hero` row swap (that swap also expires the `aloy.glb` exception) |
| instruments-core | export `BOOT_SPECS` from `legacy.js` only for rows that must load before boot; `LEGACY_SPECS` is read as deferred. W0b: when the Tiller fixture moves off `/models/r5-poc/tiller.glb`, tell pipeline |

### 7. Process hygiene

Vite: `npx vite --port 5250 --strictPort` from this tree only (the harness's own spawn, and one for the frame),
killed after every run; nothing listens on 5250. The fixture and the merge simulations run Vite in middleware mode on
a unix socket (no TCP port, `server.ws: false`, dep cache inside the scratch copy; socket removed). Chrome: at most
one of this lane's alive at any time; fix round 3 holds a ticket in gates-perf's machine-wide semaphore
(`$TMPDIR/cal-chrome-profiles/chrome-semaphore`, their FIFO `pid|lstart` protocol) for every launch, on top of the
preflight (free disk ≥ 3 GB, memory free ≥ 25 %, < 2 headless Chromes), and waited ≈ 21 min at 09:05 while
gates-perf and engine-gpu held both slots. 0 profiles of this lane left. Port 5173 never touched. Scratch:
`scratchpad/r5/pipeline/` only; every merge-simulation copy deleted after its run (`cleaned: true` in each
`sim-*.json`); the harness's `shots/` moved out of the tree after each run. The four GLBs were restored from the base
commit's blobs with `git show HEAD:<path>` (read-only git), never with checkout. Artefacts: fix round 1
`fix1/`, fix round 2 `fix2/`, fix round 3 `fix3/` (`A.*` / `D.*` / `E.*` this tree on 5250, `sim-*` merge
simulations and the bisect, `frames/`, the scratch diagnosis gate `gates.r5.zzdiag.mjs` that only ever entered
simulation copies).

### 8. Fix round 1 (Oct 15 evening) — by finding

**Finding 1 — the stand-in capsules break carried gates in this branch, unreported (any-order merge).**
- Diagnosis: pipeline cannot remove the R30 kinds' construction (instruments-core's files), so the state "pipeline
  merged, instruments-core not" can only be guarded, not made correct. The supported states are both halves or
  instruments-core alone.
- Made explicit and enforced: merge order in §4.1 and §6 (first request); new lane guard
  `A-pipeline-r30-merge-order` (PASS only with both halves; the half-merge was PENDING with a named note — FAIL since fix round 2, §9 —, a GLB back
  on disk is FAIL); one `console.warn` at boot in the half-merge; `assets.r30`.
- The judge's preferred contract: every R30 kind is now `SKIP-legacy-deleted` in `assets.skipped` (the `STAND-IN`
  status is gone; `bridge: true` marks a bridge body) and `assets.legacyDeleted(kind)` answers for it and for any
  machine riding it (`redeye`, `tallneck`); `A-pipeline-boot-rows` checks all 14 bridge machines resolve.
- Measured and listed by id (§4.2): the carried suite on the half-merge FAILs A47, A47b, A44b, A92 on bridges
  (+ intermittent A50b); the Round-4 suite still in this branch FAILs A47, A47b, A44b, A48b, A76b, A25c, A92, A47c,
  A50b on bridge kinds (A44 once on `longleg`, intermittent, PASS on rerun). The supported state (§4.3): every one
  of those rows PASS or a named SKIP, 0 bridges, the judge's camera shows no capsule (`full-site.png`). The gates
  side (§4.4): the one-line `SPECIES` hook turns A47 / A47b / A44b into PASS-with-skip in the half-merge; A92 stays
  FAIL, so the merge order remains the fix.

**Finding 2 — `ip: true` rows skipped the licence checks; the `aloy.glb` exception never expired.**
- `check.mjs` `legacy-source`: an `ip: true` row (or a row whose provenance text names IP) is never accepted:
  PENDING while every file under it is a valid scheduled exception, FAIL otherwise. The gate cannot PASS with IP on
  disk.
- `add.mjs validateRow` and the `row-schema` clause (which now runs it): no `ip` exemption for `attribution` /
  `source_url`; an IP row also needs `delete_at` + `delete_owner`. `legacy-hero-body` now carries its full source
  record (Sketchfab URL, author, CC-BY attribution — never credited, plan §10.2).
- `SCHEDULED_IP` moved to `lib.mjs` with deadlines; an exception holds only while the row is `ip: true` with the
  same deadline, the repository is before that deadline (`R5_WAVE`, or the lane-report lower bound that moves by
  itself when a W1 lane merges), and `SPECS.hero` still points at `aloy.glb`. Expired = an IP hit in both gates.
- `A-ID-ip-assets-gone` extended to every LICENSES.json row's provenance text and to shipped files of every type
  through their rows. `anims-hybrid/aloy-ual.json` (a bake keyed to the IP rig) is now flagged `ip: true` with its
  W0a deadline.
- The judge's own control re-run (`fix1/licfake2.json`, W0b clauses resolved as the judge did): with `aloy.glb`
  alone the check is PENDING (`legacy-source`), never PASS; with the planted `another-fan-rip.glb` under a legacy
  `ip: true` row: **FAIL** (row-schema 3 problems, legacy-source FAIL, scan FAIL); the same plant as a PNG: FAIL;
  `aloy.glb` at `R5_WAVE='W0 exit'`: FAIL in both gates. These controls now run inside `A-ID-ip-assets-gone` on
  every run (6/6 caught).

### 9. Fix round 2 (Oct 16 night) — by finding

*Superseded by §10 for finding 1: the merge-order position below was replaced in fix round 3 by the plan §6 owner split; the GLBs are no longer deleted here.*

**Finding 1 (blocker) — in this tree the deleted GLBs put the R30 kinds on placeholder capsules; carried rows FAIL.**
- Verdict unchanged, and stated plainly: **this branch cannot make that state correct** (the judge's own
  conclusion, re-checked in §2.3). The R30 machines are built by direct `_spawnCls` calls in instruments-core's
  `machines/index.js`, the old classes bind IP rigs by bone name, and an empty boot roster breaks progression's
  `list[0]` hook — every lever is in instruments-core's files, and their branch already removes all of it.
  No bar was moved and no gate was loosened to hide it: the in-tree rows were re-run and still FAIL (§4.2).
- Changed: `A-pipeline-r30-merge-order` now **FAILs** the half-merge (it was PENDING). A FAIL in the
  orchestrator's post-merge run (plan §3.3: "merges the lane, runs A1 + the lane's gates … commits") blocks a
  commit of pipeline-without-instruments-core, so main — and Kevin's 5173 preview — can never show the capsules.
  This branch alone now reports that FAIL in its own lane run (02:03, `fix2/A.lane.report.json`).
- Re-measured the supported state with the **current** trees of instruments-core (index.js 23:57, report 01:43),
  gates-perf (carried suite 00:31) and engine-gpu, with **no edit to any other lane's file** (§4.3).
- Decision needed from the orchestrator (the judge's option (a)): merge instruments-core before or together with
  pipeline, commit nothing in between, judge this lane's W0a acceptance on the merged tree.

**Finding 2 (major) — after the merge `A-assets-tracked` FAILed unless `tiller.js` was repointed by a cross-lane edit.**
- Fixed in this lane's own files (§4.5): the promoted generator also writes the byte-identical Tiller at the URL
  the fixture already loads (`public/models/r5-poc/tiller.glb`), `.gitignore` tracks exactly that file
  (`public/models/r5-poc/*` + `!…/tiller.glb`), and the LICENSES row covers both paths. Deterministic and offline
  (two sandboxed builds byte-identical; the committed bytes equal the build's).
- `A-assets-tracked` gained a negative control (a src literal naming an ignored proof output is caught) and the
  rule set now pins both halves: the fixture path must be tracked, every other proof output ignored.
- Measured: in this tree PASS (218 paths, 0 ignored, 0 missing); in the full W0a merge **without** the repoint
  PASS (§4.3). The orchestrator's repoint request is withdrawn (§6).

### 10. Fix round 3 (Oct 16 morning) — by finding

**Finding 1 (blocker) — in this tree the R30 kinds stood on placeholder capsules; the lane guard and the carried and
visual gates FAILed.** Fixed in this branch, with the judge's option (b), which is what plan §6 says: the four
machine GLBs are instruments-core's deletion ("W0a (instruments-core; SPECS rows by pipeline)"), `npc.glb` is
pipeline's.
- `public/models/{watcher,sawtooth,behemoth,thunderjaw}.glb` restored **byte-identical to base** (SHA-256 equal to
  the recorded deletion hashes; `git status` lists none of them), so instruments-core's deletion of them merges
  without conflict in either order. `npc.glb` + `npc/README.txt` stay deleted (this lane's §6 row).
- `assets.specs.js` `DELETED`: each row names its `owner`; the four instruments-core rows carry their `reader` class
  and their boot `row`. `assets.js` serves such a row **only while its reader class is in the tree** (`r30Live`), so a
  class and its body exist together in every branch and every merge order. The capsule `standIn()`, the bridge path,
  `r30.bridges` / `halfMerged` and the half-merge warning are **deleted**; no placeholder body exists in any state.
- `A-pipeline-boot-rows` now asserts the absence of any placeholder (model entry, scene mesh or material) and that
  every R30 machine stands on a real, loaded body. `A-pipeline-r30-merge-order` now checks consistency: file and
  reader together or neither; it FAILs the half state and an orphaned IP file by name.
- Licences: the four GLBs ship in this tree without a LICENSES.json row (a row would have to declare an NC licence);
  they are `rowless` scheduled exceptions valid only in-wave and only while their class exists (§2.6), with a 7th
  negative control proving expiry at `R5_WAVE='W0a exit'`, on orphaning and when a row appears.
- Measured on 5250 in this tree: the lane block PASS (merge-order PASS, boot-rows PASS with 0 placeholders); every
  row of the judge's FAIL list now PASS — A47, A47b, A44b, A92, A76b, A48b, A25c, A47c, A6 (was PENDING), A44 4/4;
  A50b 4 of 5 (the one FAIL is shellwalker 92 %, reproduced at the same rate with all of this lane's changes reverted,
  §4.2). Frames re-filmed at the judge's camera and in V6 / V25 / V26a / V12 / V14 / V23 / V24: real bodies, no
  capsule; V6 and V14 equal engine-gpu's near-main baseline (§3).
- Measured in the full W0a merge with instruments-core's 4-file deletion applied: every runner and carried row PASS or a
  named SKIP, 0 placeholders, no machine at the judge's camera (§4.3). Without that deletion the merge boots the same
  but FAILs the two R30 gates by name: the one remaining action belongs to instruments-core / the orchestrator
  (§4.1, §6).
- What this costs, stated plainly: until instruments-core's deletion lands, the four IP GLBs (three CC-BY-NC) are in
  this branch, exactly as in base and in instruments-core's tree today. `A-ID-ip-assets-gone` names them on every run
  and FAILs at the W0a exit if they are still there.

**Finding 2 (major) — A44 (longleg dead head) failed repeatedly in this tree only.**
- Re-measured with the capsules gone: this tree 4 / 4 PASS (longleg dead head 0, 0.065, 0, 0 m), the merged tree
  3 / 3 PASS (0, 0.052, 0 m) — the three merged runs the judge asked for.
- Bisected (§4.2): the same harness with every runtime change of this lane reverted gives the same band (0.017–0.036
  m vs 0–0.036 m here). Nothing in the roster, RNG or loader of this lane moves the row now; the 0.12–0.13 m FAILs
  came from the capsule world, which no longer exists in any state.
- §4.2 corrected: the earlier "intermittent, not caused by the bridges" was wrong; the FAILs occurred only in the
  half-merge state.
