# ROUND 5 — lane `pipeline` report (W0b, fix round 2; round 1 is Appendix B, the W0a record Appendix A)

Lane: pipeline · port 5250 · wave W0b (protagonist on the kept rig) · Oct 22 2026 · branch `r5/w0b-pipeline`
(worktree `~/.calima-r5/trees/pipeline`, recreated from checkpoint `a8db205` after the machine rebooted at 00:07).
Plan: `docs/ROUND5-PLAN.md` §2 (row), §1.2 (grants: `src/main.js` removal-only at the W0 exit; donor lists removal-only),
§3.1–3.3, §4.1, §6 (rows owned), §8.3 (R33, R34, rule 8 amendment), §9 (pipeline block + global list), §10 (licences).

## 0. Status — this tree, and the W0b merge trial

Every gate below was run this round on port 5250 at the TRUE wave (W0b, from the branch). The **merge trial** is a
clonefile copy of this tree with every other W0b lane's current working-tree changes overlaid (hero-body `ae95d9a`+,
brand `3af2aba`+, instruments-core `f88ae82`+, engine-gpu `59e0b48`+, gates-perf `766e49b`), the merge steps of §5
applied, `R5_WAVE=W0b`, served by Vite in middleware mode on a unix socket (no TCP port) with one Chrome. It is
evidence for the merge, not a substitute for it.

| gate (§9 pipeline + global items owned) | this tree (5250, harness) | W0b merge trial | what decides it |
|---|---|---|---|
| A-sources-staged | **FAIL** — 98 staged files missing (UBC 41, MCO 54, UAL2 3), lost with the reboot; UAL1 restored 3/3; no archive SHA-256; tamper control caught | **FAIL** (same; the 3 font rows stage and pass) | Kevin's download (§6.1), then one `restore --zip` per archive |
| A-build-deterministic | **PENDING** `blockedBy: A-sources-staged` — 5 outputs byte-identical across two network-denied builds, 451 / 437 ms, 234 / 233 MB, committed outputs 5/5 equal; `gen-humans-proof` not run (missing source); classification control 6/6 | **PENDING** (same; + hero-body's 3 recipes blocked on the same sources; 5 outputs identical, 683 / 727 ms, 266 / 262 MB) | the sources |
| A-build-only-lane | **PASS** (20 lanes, slowest pipeline 494 ms, 0 writes outside, control 2/2) | **PENDING** `blockedBy: A-sources-staged` (hero-body's 3 recipes stop on the missing sources; 0 writes outside any lane) | the sources |
| A-glb-budget | **PASS** (4 generated GLBs) | **PASS** (12; Brea 15,872 raw → 9,864 after the Pan Whites I cull ≤ 10 k; outfit 7,876 ≤ 17.5 k; stow kit 2,092 ≤ 9 k) | — |
| A-loader-fixes | **PASS** 0.0198 mm dequantised, fold 0 mm, control 120 mm | **PASS** (same numbers) | — |
| A-specs-data-driven | **PASS** 21.0 s (A1 PASS, A20b PASS 237 frames, copy diff exactly 2 paths, probe 2/2 JS, symlink control caught) | — | — |
| **A-specs-data-driven on main's tree** (first item) | **PASS** 20.4 s (A1 PASS, A20b PASS 373 frames, 590 files cloned, diff exactly `assets.specs.js` + `probe.glb`, copy removed) | — | — |
| A-human-bind | **PENDING** (`SPECS.hero` is the Round-4 body here; no rig profile) | **PASS** rig `ubc-brea`, 52/52 pairs, map 52, missingSource [], missingTarget [], missing keys = `neck2, eyeL, eyeR, lidUL, lidLL, lidUR, lidLR`, 52 animated, hipScale 0.9939 | merged tree / ruling (§6.2) |
| A-poc-promoted (literal) | **FAIL**: `src/instruments/kinds/tiller.js:34` (main's version) + the closure ruling; `?poc=biome` serves (5.0 s) | **FAIL**: brand's `tools/lint/namecheck.mjs:199` (guarded tool reference) + the closure ruling. instruments-core's re-point removed the Tiller reader | brand one-liner, then the §6.3 ruling |
| A-ID-ip-assets-gone | **FAIL** (W0b): `public/anims-hybrid/aloy-ual.json` EXPIRED (gates-perf's unmerged W0a deletion); 8/8 negative controls ok | **PASS** (24 GLBs, 222 files through rows, 0 hits) | gates-perf's merge |
| A-licence-manifest (page gate) | **FAIL** (legacy-source: the same file); credits README 0/9, rendered 0/9 (main's menu) | **PENDING** — every clause PASS except third-party (the archive hashes): files 222/222, legacy-source PASS, credits README 9/9 and rendered 9/9, 20.57 MB ≤ 60 | §6.1 |
| A-assets-tracked | **PASS** 225 paths, control caught | **PASS** | — |
| A-pipeline-boot-rows, A-pipeline-r30-merge-order (lane guards) | **PASS**, **PASS** | **PASS** (boot rows incl. `heroOutfitPan1`, `heroStowKit`; hero = Brea), **PASS** | — |

Lane harness run (`node tools/gates.mjs --port 5250 --extra tools/gates.r5.pipeline.mjs --lane pipeline`, 07:49–07:51Z):
13 gates, 7 PASS, 4 FAIL, 2 PENDING. One of the FAILs was an ERR: A-sources-staged's own tamper control threw ENOENT
on a missing file. That is fixed (§1.3); the re-run through the harness (`--only A-sources-staged`, 08:04Z) grades
it as FAIL with the control caught.

**Global list items present in this tree** (one run, `--only`, 07:50–08:00Z): A1 **PASS**, A20b **PASS** (248 frames),
A90 **PASS** (heap −8.8 %, geo +9, tex −28), A90-expansion **PASS** (heap −12.4 %, non-machine growth 0, orphan roots 0),
A90b **PASS** (0 offenders, 0 orphaned textures, heap +1.8 % after forced GC), A90-rig-reclaim **PASS** (geo +8, tex 0;
per live strider 0 geo / 0.5 tex), A9 **PENDING** (309 draws pass; 42.3 fps not attributable: the empty frame costs
4.89 ms GPU here), A21 **PENDING** (draws 309 / 195 / 322 and 4.12 / 3.67 / 4.21 M tris pass; timing terms not
attributable). Not in this tree (other lanes' unmerged files): A90-abs, A-alloc-rate, A-vram-ledger, both
horizon-terms lints, A-reach-all-sites, A-port-guard, A-carried-suite.

**Registration:** r5 auto-discovery (gates-perf) is still not on main, so this file is merged by the runner's
`--extra tools/gates.r5.pipeline.mjs` flag, which does the same import and the same `GATES`-shape merge as the
`gates.round4.*.mjs` directory scan; `--lane pipeline` then selects these 13. Once auto-discovery merges, `--extra`
becomes unnecessary.

## 1. This round — what happened and what changed

### 1.1 The reboot emptied `models-staging/r5-src`
The machine rebooted at 00:07 and the lane trees were recreated from the 06:41Z checkpoint commits at 00:17.
`models-staging/r5-src` is git-ignored, so it was not in the checkpoint, and its contents were clonefile copies of the
Round-5 proof extracts in this session's old scratch, which the reboot cleared. A full search of the Data volume (no
depth limit over `/Users`, `/private`, `/opt`, `/Applications`; Spotlight; git history of every ref; `~/Downloads`)
finds **no copy** of the UBC, MCO or UAL2 files or of their archives. So, as of this round:
- A-sources-staged is **FAIL** (98 files missing), where round 1 had it PENDING on the hashes only.
- No tree can rebuild Brea, `outfit-pan-1` or the kit: hero-body's three recipes and this lane's human proof stop on
  the missing sources (measured on the trial). The committed GLBs are unaffected.
- UAL1 is the exception: its staged files are the shipped `public/anims` export, so they were restored from there
  (`restore --row ual1 --from public/anims`: 3/3 files verified against the lock, 3.87 MB of clones).

### 1.2 One command per archive for the re-fetch (`tools/build/sources.mjs restore`)
New command (§2.0). It re-stages a source's files exactly as the lock records them, from a local directory or from
the archive, all or nothing, and with `--zip` it also records the archive SHA-256 in the lock and the LICENSES.json
row. Negative controls, run in scratch: a one-byte change to one file → refused, `mismatched: [LICENSE]`, nothing
written, exit 1; a missing file → refused, `missing: [LICENSE]`, exit 1; the files one folder deeper → found by
suffix, ok. The zip path was checked on a scratch copy of the lock and manifest with a zip of the UAL1 files: 3/3
written, archive SHA-256 recorded in both the lock and the row (`archive_bytes` 1,066,651, `retrieved` set), and an
identical second run left them unchanged. The three source rows' `pending` notes and the lock's `stagedFrom` notes now
name this command.

### 1.3 Gates that told the truth badly after the reboot — fixed
- **build:assets stopped at the first failing recipe**, so A-build-deterministic graded nothing (0 outputs, FAIL). The
  driver now runs every recipe, lists failures in `failed[]` with `missingSource`, and still exits 1. Recipes signal a
  missing source by contract (`err.code = 'R5_SRC_MISSING'` in `humans.mjs`; hero-body's existing "no human sources …
  models-staging/r5-src" message is recognised as written).
- **A-build-deterministic / A-build-only-lane** report **PENDING `blockedBy: 'A-sources-staged'`** (never PASS) only
  when every failed recipe in both runs is a missing-source failure, the same recipes failed in both, and
  A-sources-staged itself reports staged files missing. Everything that did build is still graded (byte identity,
  committed equality, RSS, network sandbox). Any other recipe failure is FAIL. The classifier has its own negative
  control: 6 planted errors (two missing-source forms, an ENOENT inside r5-src, an ENOENT on a shipped GLB, a
  TypeError, a sharp error), 0 misclassified.
- **A-sources-staged's tamper control** always tampered with the first lock entry's first file, which no longer exists,
  so the gate threw ENOENT (an ERR in the harness run). It now tampers with a file that is staged (`ual1/…Godot_Standard.bin`
  here) and requires that row's "1 staged file(s) differ" and "not in the lock" problems; with nothing staged at all it
  reports the control as not runnable instead of crashing.

### 1.4 Cross-lane state re-read (read-only)
- instruments-core re-pointed `src/instruments/kinds/tiller.js` to `/models/instruments/tiller.glb` (round-1 request
  done). hero-body's `renderStockFace` no longer reads `tools/r5-poc/assets/` (done).
- **New: hero-body's branch deletes `tools/gates.r5.pipeline.mjs`** (checkpoint `ae95d9a`; their tree holds an
  untracked copy of this branch's `a8db205` version). Merge resolution and request: §5 step 0, §6.4.
- **New: brand's `tools/lint/namecheck.mjs:199`** names `tools/r5-poc/direction-a/horizon-lexicon.txt` (deleted on this
  branch per plan §6). Its `existsSync` guard turns it into `null`, so nothing breaks, but A-poc-promoted lists it (§6.4).
- `diff3 -m` (FreeBSD, macOS) is unsafe for the `src/main.js` resolution; §5 step 1 gives the exact edit list.

## 2. Contracts published (exact signatures; complete as of this round)

### 2.0 New this round

```
node tools/build/sources.mjs restore --row <id> (--from <dir> | --zip <archive.zip>) [--retrieved YYYY-MM-DD] [--delete-zip]
```
```js
// tools/build/sources.mjs
export async function restore({ row, from?, zip?, deleteZip? = false, retrieved?, root? }):
  { row, dir, from, zip, files, written, missing: string[], mismatched: [{ rel, bytes, lockBytes }], ambiguous: string[],
    archiveSha256?, archiveBytes?, recorded?: true, zipDeleted?: true, ok, problems? }
// tools/build/build-assets.mjs
export function isMissingSource(err): boolean   // err.code 'R5_SRC_MISSING' | ENOENT inside models-staging/r5-src | message names models-staging/r5-src or R5_SRC
export async function buildAssets({ only?, out? }): { lanes, recipes, results, skipped,
  failed: [{ recipe, lane, outputs, missingSource, code, error }], wallMs, peakRssMb }   // CLI exit 1 when failed.length
```
- **`restore`** puts a source's staged files back exactly as `tools/build/sources.lock.json` records them, from a
  local directory or from the archive. Each lock file is located (exact relative path, else the unique file/member whose
  path ends in `/<rel>`) and checked against its lock bytes + SHA-256 before anything is written; the files land in a
  temporary sibling directory that replaces `r5-src/<dir>` only when all of them verified (all or nothing). The lock's
  file list never changes. With `--zip`, a recorded archive SHA-256 must equal the archive's; an unrecorded one is
  recorded in the lock and the LICENSES.json row (`archive_sha256`, `archive_bytes`, `retrieved`; `pending` removed).
  **So the whole W0b re-fetch is one command per archive** once the zip is on disk:
  `restore --row ubc-standard --zip "<…>/Universal Base Characters[Standard].zip" --delete-zip` (and the same for
  `mco-fantasy-standard`, `ual2-standard`). Because the files are verified against the Oct 15 SHA-256s, the rebuilt Brea,
  outfit and kit GLBs stay byte-identical to the committed ones, or the restore refuses (the pack changed upstream:
  then `stage-zip` and rebuild).
- **Recipes report a missing source by contract**: `humans.mjs sourcePaths()` throws with `err.code = 'R5_SRC_MISSING'`;
  hero-body's `recipes/lib/face.mjs srcRoot()` message ("… stage UBC + MCO under models-staging/r5-src/ …") is
  recognised as it is (no change asked of hero-body).
- **`build:assets` keeps going** past a failing recipe, lists it in `failed[]`, and still exits 1.

### 2.1 Third-party sources — `tools/build/sources.mjs`

```
node tools/build/sources.mjs stage-zip   --row <id> --zip <archive.zip> --keep '<glob>' [--keep …] [--dir <name>]
                                         [--strip <member prefix>] [--retrieved YYYY-MM-DD] [--page <url>] [--delete-zip]
node tools/build/sources.mjs stage-dir   --row <id> --from <dir> [--keep '<glob>' …] [--move] [--dir <name>] --retrieved YYYY-MM-DD
                                         [--archive-name <file>] [--archive-bytes <n>] [--page <url>]
node tools/build/sources.mjs stage-files --row <id> [--dir <name>]       # multi-file download, no archive (row.files[])
node tools/build/sources.mjs verify-zip  --row <id> --zip <archive.zip> [--retrieved YYYY-MM-DD] [--delete-zip]
node tools/build/sources.mjs restore     --row <id> (--from <dir> | --zip <archive.zip>) [--retrieved YYYY-MM-DD] [--delete-zip]
node tools/build/sources.mjs status                                      # = A-sources-staged
node tools/build/sources.mjs layout                                      # row id -> directory
```
```js
export const LOCK = 'tools/build/sources.lock.json', SRC_REL = 'models-staging/r5-src', CAP_BYTES = 150 MiB;
export const REQUIRED = ['ubc-standard', 'mco-fantasy-standard', 'ual1', 'ual2-standard'];  // + every non-legacy third-party source row
export const DIRS = { 'ubc-standard': 'ubc', 'mco-fantasy-standard': 'mco', ual1: 'ual1', 'ual2-standard': 'ual2' };
export function srcDir(root?, env?): string                               // R5_SRC or <root>/models-staging/r5-src
export function sourceDir(rowId, { root?, env?, lock? } = {}): string      // <srcDir>/<lock dir | DIRS | rowId>
export function layout(root?): { [rowId]: 'models-staging/r5-src/<dir>' }
export function manifestSha256(files: [{ path, sha256 }]): string          // sha256 of sorted "<sha256>  <basename>\n" lines
export async function stageFiles({ row, dir?, root? }): { row, ok, sha256?, files?, totalBytes?, problems? }
export async function restore(…)                                           // §2.0
export function loadLock(root?); stageDir(…); stageZip(…); verifyZip(…); status({ root?, env? })
// LockEntry = { row, dir, archive: { name, bytes, sha256 | null, retrieved, page, kind? }, strip, files: { <rel>: { bytes, sha256 } }, totalBytes, stagedFrom? }
```
Layout: `models-staging/r5-src/{ubc,mco,ual2,ual1}/<path inside the archive>` (the Round-5 proof's layout, which
hero-body's recipes read unchanged); new sources default to `r5-src/<row id>/`. `status` names the `restore` command
for every row with missing files.

### 2.2 Licence rows (`tools/licences/add.mjs` FIELD_ORDER) and the fold

- `archive_name`; `derived_from: [source row ids]` — a shipped row built FROM staged sources names them; check.mjs then
  requires the archive record on the sources, not on the derived row. Source row ids: `ubc-standard`,
  `mco-fantasy-standard`, `ual2-standard`, `ual1` (a GLB's `asset.extras.provenance.sources` uses the same ids).
- `node tools/licences/add.mjs --prune-landed` removes legacy rows whose files are gone (another lane's deletion landed).
- `node tools/licences/fold.mjs --theirs <LICENSES.json> [--base <LICENSES.json>] [--root <tree>] [--write]` →
  one JSON line `{ ok, written, rows, added, derived: [{ id, from, paths, fromTheirRow, unknownProvenanceSources }],
  deletedByTheirs, takenFromTheirs, conflicts, invalid, unchanged }`; exit 1 on a conflict; `export function fold({ ours,
  theirs, base, root }) → { manifest, summary }`, `export const isSourceRow`.

### 2.3 Credits — `tools/licences/credits.mjs` (brand's `tools/lint/credits-sync.mjs` consumes it)

```
node tools/licences/credits.mjs --md      # README "## Credits" body;   --json  the grouped rows
export function creditRows(manifest?): [{ group: 'cc-by'|'code'|'ofl'|'cc0', head, lines: [{ id, text }] }]
export function creditsMarkdown(manifest?): string
export function requiredAttributions(manifest?): [{ id, licence, attribution }]   // what both surfaces must show verbatim
```
Rows with `derived_from` and no attribution are thanked through their sources (no double CC0 thanks).

### 2.4 Licence checks — `tools/licences/{lib,check}.mjs`

```js
export function currentWave(root?, env?): { wave, source, exact, env, envWave, branch, branchWave, inferred, reports }
export function parseBranchWave(branch): wave | null;  export function branchWave(root?): { branch, wave }
export function laneReportNames(lane, ownsCell): string[]                  // default + §2-named report files
export function gradeCredits({ need, readmeText, rendered: null | { visible, how, text, error? }, atOrPastW0Exit })
export async function check(root?, { env?, rendered? }): { pass, clauses, creditsInput, wave }
node tools/licences/check.mjs [--json-line]
```

### 2.5 Human build library — `tools/build/humans.mjs`

`sourcePaths(src = srcDir()) → { src, ubc, hair, mco, ual2 }` (through `sourceDir`; throws `R5_SRC_MISSING`), `io`,
`readGltf`, `cleanDoc`, `cleanPrimitive`, `graft`, `rebindPrimitive`, `headCut`, `addBraid`, `joinByMaterial`,
`docStats`, `writeHuman(doc, file, { texSize, hairTexSize, provenance, extras })`, `buildHeroineBase`, `buildMaleBase`,
`buildOutfit`, `OUTFITS`.

### 2.6 Gate bodies — `tools/build/pipeline/w0b-checks.mjs`

```js
export async function buildDeterministic({ root }); export async function buildOnlyLane({ root }); export async function glbBudget({ root })
export function pocPromotedStatic({ root }); export function pocReferences({ root }): [{ file, line, kind, text, why? }]
export const POC_DIRS, BIOME_CLOSURE_FILES, BIOME_REFS, LANE_OUTPUTS, CLASSES
export function classOf(path, r5Size); export function overBudget(cls, stats); export function auditLane(lane, written, declared)
```
New in the details: `buildDeterministic → detail.{ failedRecipes, sourcesStaged, blockedBy?, missingSourceClassControl }`,
`buildOnlyLane → detail.{ blockedBy?, runs[].{ failed?, blockedOnSources } }`. `glbBudget` grades a Brea body after its
outfit cull (`_HIDEMASK` + `extras.r5Hero.hideBits`, hero-body's rule); class `clip-pack` is mesh-less.
`tools/build/pipeline/specs-fixture.mjs`: `serveAndRun(dir, gateDefs, { sock, cacheDir })`, `runGate` with `gate.shot`.

### 2.7 Unchanged

`src/core/assets.specs.js` (`SPECS`, `ANIMS`, `DELETED`), `src/core/assets.js`, `tools/build/lib/{glb,hs,zip,clone}.mjs`,
`tools/licences/{ip-scan,stamp-legacy,fold}.mjs`. `SPECS.hero` still names `/models/aloy.glb` in this tree (hero-body's
`src/hero/rows.js applyHeroRows()` repoints it at runtime once merged; the data edit is merge step 3, §5).

## 3. Frames read (pipeline owns no V gates; these film the state two action gates grade)

All four were read at 1600×900 and then deleted.
- **A-licence-manifest, this tree** (harness frame): the CREDITS modal (878×689) over the camp shows main's Round-4
  credits. The rows are HORIZON ZERO CLAUDE ("An unaffiliated homage", the Guerrilla/Sony line), ENGINE, MACHINE MODELS
  · CC-BY 3.0 with short credits ("“Mechanical Horse” — jake young"), CC0 donors, TYPEFACES Julius Sans One / Michroma
  / Orbitron / Rajdhani / Chakra Petch, and "Sketchfab fan-art rigs — Aloy, Watcher, Sawtooth, Thunderjaw, Behemoth".
  None of the 9 verbatim attribution strings is shown, so the gate reads 0/9, PENDING on brand. That matches the frame.
- **A-licence-manifest, merge trial**: the modal shows brand's generated block. The rows are CALIMA ("An original
  game"), ATTRIBUTION REQUIRED (CC BY) with the six full strings ("Black Caiman" by Poly by Google
  (https://poly.pizza/m/5etIv4omd7Z), CC-BY 3.0 …), CODE (MIT) with the meshoptimizer, three-mesh-bvh and three.js
  strings, TYPEFACES with Bodoni Moda and the two IBM Plex families, and THANKS (CC0) starting below. That is 9/9
  rendered, as graded.
- **A-human-bind, this tree**: the Round-4 body (red hair, Round-4 bow and spear) at the camp. The gate is PENDING
  because no rig profile exists here, which is correct.
- **A-human-bind, merge trial**: Brea at boot in the camp: violet top, dark wrap and topknot, wrapped shins, lance on
  the back diagonal with the cane quiver, arms down at idle. This is the body the 52/52 bind is measured on.
  (The boot-rows and loader-fixes frames are the same boot state and were not graded separately.)

## 4. First item — `A-specs-data-driven` on main (the fixture fix from round 0, re-proved after the reboot)

The fix is unchanged (`tools/build/pipeline/specs-fixture.mjs`). The scratch, the copy and the served root are realpath'd,
because Vite resolves module ids to real paths and a root under `/var → /private/var` made every module fail
`fs.allow`, so JS was served raw and CSS as `text/css`. `viteProbe` fails in < 1 s with the served MIME types before any
Chrome, and `probeControl` serves the same copy through a symlink and must be caught. This round,
`node tools/build/pipeline/specs-fixture.mjs --root "<main>" --scratch <scratch>` against main's tree `263ae19`:
**PASS 20.4 s** (A1 PASS state=playing; A20b PASS 373 frames, 0 system errors; 590 files cloned; diff exactly
`src/core/assets.specs.js` modified + `public/models/pipeline/probe.glb` deleted; probe `/src/main.js`
text/javascript 96,482 B transformed and `/src/combat/feedback.css` text/javascript; control caught: raw main.js
16,859 B, feedback.css `text/css`; copy and socket removed). In this tree, through the harness: PASS 21.0 s, A20b 237
frames. Main keeps failing the gate only through main's own W0a copy of the fixture until this branch merges.

## 5. Merge steps for the orchestrator (each run on this round's merge trial; scripts in `scratchpad/r5/pipeline/w0b-r2/bin/`)

0. **`tools/gates.r5.pipeline.mjs`: keep pipeline's file.** hero-body's checkpoint `ae95d9a` deletes it from
   `r5/w0b-hero-body` (their working tree now holds an untracked copy of this branch's `a8db205` version), so whichever
   of the two merges second meets a modify/delete conflict. Resolution: this branch's file. (hero-body: please restore
   it from main instead of deleting it; §6.4.)
1. **`src/main.js`** (pipeline's removal-only hunks vs brand's edits: one textual conflict). Resolution = brand's file
   with pipeline's three removal-only edits re-applied, each found exactly once: delete the 7-line `?poc=human` block,
   delete the ` * \`?poc=creature\` stages …` comment line, and `['creature', 'biome']` → `['biome']`. On the trial the
   resolved file differs from brand's by exactly those lines. **Do not resolve it with `diff3 -m`**: macOS's FreeBSD
   diff3 was measured silently dropping two untouched lines of brand's file (`MAX_STEPS`, `MAX_FRAME`) and a closing
   brace next to brand's insertion.
2. **`public/LICENSES.json`**: take pipeline's side, then for each of hero-body and brand:
   `git show a953355:public/LICENSES.json > base.json; git show r5/w0b-<lane>:public/LICENSES.json > theirs.json;
   node tools/licences/fold.mjs --theirs theirs.json --base base.json --write`. Trial: 0 conflicts, 0 invalid
   (hero-body → `brea`, `brea-clips-ual2`, `outfit-pan-1` derived, `brea-kit-v0` added, `legacy-hero-body` deleted;
   brand → `calima-favicon` + 3 font rows added, 6 legacy rows deleted).
3. **`SPECS.hero` → Brea** (pipeline's one-row data edit in `src/core/assets.specs.js`, hero-body's values from
   `src/hero/rows.js`): `hero: { url: '/models/hero/brea.glb', targetHeight: 1.77913, yaw: 0, required: true },`
   (hero-body's `applyHeroRows()` would also repoint it at runtime; the data row should say it). Then drop
   `public/models/aloy.glb` from `SCHEDULED_IP` in `tools/licences/lib.mjs` (inert once the file is gone).
4. `node tools/build/sources.mjs stage-files --row <id>` for `font-bodoni-moda`, `font-ibm-plex-mono`,
   `font-ibm-plex-sans-condensed` (trial: all three ok; manifest SHA-256s `0854f8df…`, `eb0ab813…`, `3d1dc2e3…`).
5. `node tools/licences/add.mjs --prune-landed` (after gates-perf's anims deletion; trial: prunes
   `legacy-anims-duplicates`, `legacy-anims-lab-bake`).
6. `node tools/lint/credits-sync.mjs` (brand's tool): the fold changes the thanks list, so README and menu.js are
   regenerated (trial: DRIFT before, "match the manifest" after).
7. **`models-staging/r5-src` must live where a reboot cannot reach it.** It is git-ignored, so no merge carries it, and
   this round's tree had been recreated from the checkpoint commit, which cannot hold it. Put it in main
   (`<main>/models-staging/r5-src`, the plan's rule 10) and symlink it into the lane trees. This tree holds only `ual1/`
   (3 files, 3.87 MB, clones of `public/anims`); `node tools/build/sources.mjs restore --row ual1 --from public/anims`
   recreates it anywhere. Then `node tools/build/staging-cleanup.mjs --root "<main>" --apply` (dry run today: 133.79 MB in
   49 entries).
8. **After Kevin's download (§6.1)**, in main: `node tools/build/sources.mjs restore --row <id> --zip <file> --delete-zip`
   for `ubc-standard`, `mco-fantasy-standard`, `ual2-standard`; then `node tools/build/sources.mjs status` and
   `node tools/build/build-assets.mjs --out <scratch>` must rebuild Brea, `outfit-pan-1` and the kit byte-identically
   (A-build-deterministic's committed-output term).

## 6. Rulings and requests

### 6.1 Kevin — the archive re-fetch (W0b exit: "licence manifest complete with SHA-256s"; now also the only way back to the human sources)
Nothing was downloaded this round either. The relayed request ("continue all work") is not a go-ahead for a ≈ 420 MB
download of named third-party archives, so the fetch stays Kevin's. Since the Oct 22 reboot it is no longer only the
hash: the staged UBC, MCO and UAL2 files are gone from this machine (searched every volume path, git history and
`~/Downloads`), so without the archives **nobody can rebuild Brea, her outfit or the kit** (hero-body's recipes and
this lane's proof both stop on the missing sources), and A-sources-staged / A-build-deterministic cannot pass.

Fetch by hand from the itch pages in the rows' `source_url` (free "name your own price" packs):
`Universal Base Characters[Standard].zip` (expected 128,968,391 B), `Modular Character Outfits - Fantasy[Standard].zip`
(294,347,394 B), `Universal Animation Library 2[Standard].zip` (≈ 17 MB). Then per archive, in main:
`node tools/build/sources.mjs restore --row ubc-standard --zip <file> --delete-zip` (rows `mco-fantasy-standard`,
`ual2-standard` the same). Each restore verifies every one of the row's staged files against its Oct 15 SHA-256 before
it writes anything, records the archive SHA-256 in the lock and the row, and deletes the zip; a refusal means the pack
changed upstream since Oct 15 (then `stage-zip`, rebuild Brea, re-commit her GLBs). Peak transient disk ≈ 440 MB.
Rulings still needed with it: **UAL1** — (a) accept the shipped v1 files' per-file SHA-256s (`public/anims`, restored
here) plus the upstream-supersession record (itch serves v3.0 since 16 Jun 2026), or (b) a v1 archive from a backup;
**r5-poc-rock-scan** — fetch the Poly Haven scan now, or defer its hash to world-ground's W1 recipe (its file dies at
the W1 exit).

### 6.2 Orchestrator — A-human-bind
Grade it on the merged W0b tree (this round's trial: see §0), or record a §8.3 ruling that defers it to the hero-body
merge. It is PENDING in this tree (no Brea here) and is not counted as PASS.

### 6.3 Orchestrator — A-poc-promoted (plan §9 clauses (b) and (c) contradict while `?poc=biome` exists)
Unchanged from round 1. `src/main.js` (removal-only for pipeline) imports `/tools/r5-poc/poc-${POC}.js`, and the biome
loads `/models/r5-poc/{sounding-ring,tiller}.glb`. **(1)** accept exactly the three closure files until world-ground
removes `?poc=biome` at the W1 exit, moving their deletion (and the tracked `sounding-ring.glb`, its LICENSES row and
its `.gitignore` exception) to world-ground's W1-exit row; A-poc-promoted then grades "nothing but the closure, no
reference outside it" at the W0 exit. **(2)** the literal bar: delete both folders at the W0 exit and strike clause
(c); `?poc=biome` and A-gpu-tier's vista go dark until the W1 Pans. Until a ruling the gate cannot PASS.

### 6.4 Other lanes
| to | what |
|---|---|
| **hero-body** | (a) your branch deletes `tools/gates.r5.pipeline.mjs` (checkpoint `ae95d9a`; your tree has an untracked copy instead): restore it from main so the merge has no modify/delete conflict (§5 step 0). (b) Done since round 1, thank you: `renderStockFace` no longer reads `tools/r5-poc/assets/` (the stock renders live in `reference/r5/hero/`). (c) Your recipes need no change for `restore`; their "no human sources" error is classified as a missing source |
| **brand** | `tools/lint/namecheck.mjs:199` compares your lexicon copy with `tools/r5-poc/direction-a/horizon-lexicon.txt`, which this branch deletes (plan §6). Your `existsSync` guard makes it report `null`, so nothing breaks, but it is a reference into the POC folder and A-poc-promoted lists it: drop the clause, or point it at `git show a953355:tools/r5-poc/direction-a/horizon-lexicon.txt`. Still open from round 1: `"build:assets": "node tools/build/build-assets.mjs"` in `package.json`; run `credits-sync.mjs` after the fold (§5 step 6) |
| **instruments-core** | Done since round 1: `src/instruments/kinds/tiller.js` reads `/models/instruments/tiller.glb`. Merge it and the reader leaves A-poc-promoted |
| **gates-perf** | the W0a deletion of `public/anims-{hybrid,reskin,retarget}/**` must merge: until it does, A-ID-ip-assets-gone and A-licence-manifest FAIL at W0b on `aloy-ual.json` in every W0b tree. Also, a process note: your slot owner line named pid 9479, which had exited 23 s after you took slot 1 while your gate Chrome ran on (§9) |
| **world-ground (W1)** | `sites.json`: `git show a953355:tools/r5-poc/direction-a/sites.json`; the ground proof is `tools/build/ground/lib/ground-proof.mjs` |
| **orchestrator** | keep `models-staging/r5-src` in main and symlink it (§5 step 7); slot owner lines should carry the pid of the process that runs the Chrome, so "pid dead = stale" stays safe (§9) |

## 7. Honest gaps

1. **No source archive, no staged human sources** (§1.1, §6.1). A-sources-staged FAILs. A-build-deterministic (and on
   the merged tree A-build-only-lane) stay PENDING on it, and nothing can rebuild Brea's GLBs until Kevin downloads
   the three archives. UAL1 and the rock scan still need rulings.
2. **This tree FAILs four gates** at the true wave. Two (A-ID-ip-assets-gone, A-licence-manifest legacy-source) are
   gates-perf's unmerged deletion; on the trial both clear. A-poc-promoted needs brand's one-line fix and the §6.3
   ruling. A-sources-staged needs §6.1.
3. **The merge trial is a projection.** It took each lane's working tree as it was at 07:30Z while those lanes were still
   working, applied steps 0–6 of §5 by script, ran the node gates in node rather than through the harness, ran the four
   page gates through `serveAndRun` (one Chrome, socket-served Vite), and ran only the static half of A-poc-promoted.
4. A-build-deterministic's wall term is graded by the R26-style rule (over the bar on a loaded box = PENDING); every
   build here took 0.4–0.7 s, far under 180 s.
5. `tools/measure-machines.mjs` still hard-codes `cwd: '/Users/kevinliu/horizon-zero-claude'` (outside the removal-only
   grant's scope; a hit for brand's code lint).
6. **Process slip (Chrome slots):** my first slot waiter treated a slot as stale when its owner pid was dead. gates-perf's
   slot1 owner line named pid 9479, which had already exited 23 s after it took the slot while its gate Chrome
   (port 5255) ran on. My waiter removed that slot at 07:39:51Z without launching anything, hero-body took it, and for a
   few minutes three gate Chromes (engine-gpu, gates-perf, hero-body) were alive against the cap of two. I stopped the
   waiter at once. The wrapper (`scratchpad/r5/pipeline/w0b-r2/bin/with-slot.sh`) now uses only the 100-minute age rule,
   and it also waits until fewer than 2 headless Chromes are alive before it launches. My own runs started with 1 other
   Chrome alive.

## 8. Files changed

Since this round's starting checkpoint `a8db205` (the orchestrator checkpointed part of this round as `3526603` at
07:45Z; `git status --short` now: ` M tools/gates.r5.pipeline.mjs`, plus this report):
`tools/build/build-assets.mjs` (keep-going, `failed[]`, `isMissingSource`), `tools/build/humans.mjs`
(`R5_SRC_MISSING`), `tools/build/pipeline/w0b-checks.mjs` (blocked-on-sources grading + classification control),
`tools/build/sources.mjs` (`restore`, status hints), `tools/build/sources.lock.json` (`stagedFrom` notes only; no file
hash changed), `public/LICENSES.json` (the three source rows' `pending` notes only), `tools/gates.r5.pipeline.mjs`
(header; A-sources-staged control), `docs/ROUND5-PIPELINE.md`. Git-ignored: `models-staging/r5-src/ual1/` (3 clones).
No file outside the §2 row and the W0b grants was edited. Every other lane tree and main were only read.

## 9. Process hygiene

- **Chrome:** every gates.mjs run happened inside one machine-wide slot (orchestrator amendment to §0 rule 8). Slot2
  was held 07:49:30–08:02:54Z for the lane block, the global items, the main proof and the trial page gates, run in
  sequence with one Chrome alive at a time. Slot1 was held 08:04:47–08:05:04Z for a runner-only re-run. Preflight
  readings: 48 GB free, memory 70–72 % free, 1 other headless Chrome. The harness reported "this run leaves 0 of its
  own" Chrome profiles.
- **Vite:** started only by `tools/gates.mjs` (`npx vite --port 5250 --strictPort` from this tree) and killed by it.
  The fixture, main proof and trial used middleware mode on unix sockets (no TCP port). Port 5173 was never touched.
  At the end, nothing listens on 5250 and no Chrome of this lane is alive.
- **Disk:** 46.8–49.1 GB free all round (the brief's "about 4 GB" predates the reboot). Shots were deleted after
  reading (22 MB in the tree, 14 MB of copies in scratch). The trial copy (54 MB) and scratch builds were removed at
  the end of the turn. Reports and scripts are kept in `scratchpad/r5/pipeline/w0b-r2/` (< 1 MB).
- **Git:** read-only only (`status`, `diff`, `log`, `show`, `ls-files`, `check-ignore`). The trial's throwaway
  repository is a `git init` inside scratch.

---

# Appendix B — W0b fix round 1 (Oct 18–19 2026, as written then; its §0–§1 only — its contracts, merge steps and requests are superseded by §2, §5 and §6 above)

Lane: pipeline · port 5250 · wave W0b (protagonist on the kept rig) · Oct 18–19 2026 · branch `r5/w0b-pipeline`.
Plan: `docs/ROUND5-PLAN.md` §2 (row), §1.2 (grants: `src/main.js` removal-only at the W0 exit; donor lists removal-only),
§3.1–3.3, §4.1, §6 (rows owned), §8.3 (incl. R33(g), R34), §9 (pipeline block + global list), §10 (licences).

### 0. Status — what this tree passes, and what the merged W0b tree passes

Gates run on port 5250 in this tree, at the TRUE wave (W0b, read from the branch; §2.4). The same 13 gates were also
run on a **W0b merge trial**: a clonefile copy of this tree plus every other W0b lane's current changes (hero-body,
brand, gates-perf, instruments-core, engine-gpu), with `public/LICENSES.json` folded by `tools/licences/fold.mjs` and
the orchestrator's merge steps applied (§5). The trial is evidence for the merge, not a substitute for it.

| gate (§9 pipeline + global items owned) | this tree (5250) | W0b merge trial | what decides it |
|---|---|---|---|
| A-sources-staged | **PENDING** | **PENDING** (fonts staged, PASS) | the 4 archive SHA-256s: needs Kevin's download go-ahead (§6.1) |
| A-build-deterministic | **PASS** 11 outputs, 5.7 / 5.7 s, 1,442 / 1,397 MB, 3 proof extracts denied | **PASS** 19 outputs incl. hero-body's 8, 7.8 / 7.7 s, 1,422 / 1,379 MB, 3 denied | — |
| A-build-only-lane | **PASS** (20 lanes, slowest 0.5 s) | **PASS** (hero-body 3 recipes, 2.7 s, 8 files, all in its row) | — |
| A-glb-budget | **PASS** (4 GLBs) | **PASS** (12; Brea 9,848 tris after the Pan Whites I cull ≤ 10 k) | — |
| A-loader-fixes | **PASS** 0.0198 mm (control 120 mm) | **PASS** | — |
| A-specs-data-driven | **PASS** 26.3 s, A20b 196 frames | **PASS** 21.1 s, A20b 324 frames | — |
| A-human-bind | **PENDING** (no Brea here) | **PASS** 52/52, map 52, missing keys = neck2 + eyes + 4 lids | merged tree / ruling (§6.2) |
| A-poc-promoted (literal) | **FAIL** | **FAIL** | readers outside the biome hook: instruments-core `tiller.js`, hero-body `sheets.js`; then a ruling (§6.3) |
| A-ID-ip-assets-gone | **FAIL** (W0b) | **PASS** (24 GLBs, 0 hits) | gates-perf's unmerged W0a deletion of `public/anims-hybrid/aloy-ual.json` |
| A-licence-manifest (page gate) | **FAIL** (legacy-source: the same file) | **PENDING** (every clause PASS but third-party: the archive hashes; credits README 9/9, rendered 9/9) | §6.1 |
| A-assets-tracked | **PASS** 225 paths | **PASS** | — |
| A-pipeline-boot-rows, A-pipeline-r30-merge-order (lane guards) | **PASS**, **PASS** | **PASS** (hero row = Brea), **PASS** | — |

Global list items present in this tree (one run, `--only`): A1 **PASS**, A20b **PASS** (246 frames), A90 **PASS**
(heap −7.1 %, geo +8, tex −28), A90-expansion **PASS** (heap −5.2 %, non-machine growth 0, orphan roots 0), A90b **PASS**
(0 offenders, 0 orphaned textures), A90-rig-reclaim **PASS** (geo +5, tex 0; per live strider 0.13 geo / 0.38 tex),
A9 **PENDING** (309 draws pass; 41.2 fps not attributable: the empty frame costs 3.31 ms GPU here), A21 **PENDING**
(draws 309 / 195 / 322 and 4.12 / 3.67 / 4.21 M tris pass; timing terms not attributable). Not in this tree (other
lanes' unmerged files): A90-abs, A-alloc-rate, A-vram-ledger, both horizon-terms lints, A-reach-all-sites,
A-port-guard, A-carried-suite.

### 1. Fix round 1 — what changed, by finding

#### F1 + F5 (blocker / major): no archive SHA-256 recorded — **still open, needs Kevin**
Nothing was downloaded. No source archive exists anywhere on this machine (searched `~/Downloads`, `/Users/kevinliu`,
`/private/tmp`, `/private/var/folders` and Spotlight for the three archive names). The request relayed for this run is
"continue all", which is not consent to a ≈ 420 MB download, so the fetch stays Kevin's (§6.1). Everything else around
it is done: the tool verifies every staged file against the archive before it records anything, and on the merge trial
A-sources-staged and A-licence-manifest are PENDING on **only** these hashes (every other clause PASS). Rulings still
needed: UAL1 (v1 is no longer downloadable; itch serves v3.0 since 16 Jun 2026) and the Poly Haven rock scan (a
`r5-poc` texture that dies at world-ground's W1 exit) — §6.1.

#### F2 (blocker): A-human-bind PENDING — **graded on the W0b merge trial: PASS**
On the trial (Brea as the hero row) the gate reads: rig `ubc-brea`, `/models/hero/brea.glb`, **52 / 52 pairs, map 52,
missingSource [], missingTarget []**, missing animator keys exactly `neck2, eyeL, eyeR, lidUL, lidLL, lidUR, lidLR`
(all allowed), 52 animated bones, hipScale 0.9938. In this tree it stays PENDING (Brea is hero-body's file) and is not
counted as PASS; the orchestrator grades it on the merged tree (or rules to defer it to the hero-body merge, §6.2). The
assert reads only names hero-body publishes (`model.userData.rigProfile`, `animator.lib.retargeter.{pairs,
missingSource, missingTarget, hipScale}`, `animator.KEY`, `animator.b`), checked against their tree.

#### F3 (major): A-poc-promoted bar reinterpreted — **the gate now grades the literal bar**
`pocPromotedStatic` (tools/build/pipeline/w0b-checks.mjs) has no closure allowance for PASS any more. PASS needs
(a) no `?poc=human|creature` path, (b) `tools/r5-poc/` and `public/models/r5-poc/` **absent**, (c) `?poc=biome` serving.
While the three files the biome needs exist (`tools/r5-poc/poc-biome.js`, `public/models/r5-poc/{sounding-ring,
tiller}.glb`) the result is at best PENDING with a named `ruling` block; anything else in either folder, or any
reference outside the biome hook, is FAIL. The title is the plan's text again. `tools/r5-poc/direction-a/` is deleted
(brand copied its lexicon to `tools/lint/lexicon/direction-a.txt` in its tree; no code in any W0b tree reads the folder;
world-ground recovers `sites.json` with `git show a953355:tools/r5-poc/direction-a/sites.json`). The ruling the plan
contradiction needs is §6.3 — the tracked `sounding-ring.glb` is named there, not excused.

#### F4 (major): wave inference lagged the real wave — **fixed; the licence gates grade at W0b**
`tools/licences/lib.mjs currentWave` now takes the LATEST of three sources: `R5_WAVE`; the lane branch `r5/<wave>-<lane>`
(this tree: `r5/w0b-pipeline` → W0b, exact); the lane-report lower bound, which now counts BOTH the default
`docs/ROUND5-<LANE>.md` and every report file the lane's §2 row names (hero-body: `ROUND5-HERO.md` per §2,
`ROUND5-HERO-BODY.md` as written in its tree; engine-gpu: `ROUND5-ENGINE.md` / `ROUND5-ENGINE-GPU.md`). `exact: false`
marks a lower-bound-only reading (main between merges): exit runs set R5_WAVE. New negative control `waveSources`
(ip-scan self-test): both hero report names reach W0b, the branch parser maps `r5/w0b-pipeline` → W0b / `main` → none,
and a W0a-deadline exception is valid at W0a and EXPIRED at W0b. **Graded at W0b, this tree FAILs A-ID-ip-assets-gone
and A-licence-manifest's legacy-source clause** on `public/anims-hybrid/aloy-ual.json` ("EXPIRED: deadline W0a exit …;
gates-perf deletes it (plan §6)"). That file is gates-perf's W0a deletion, done in their tree, not yet merged; on the
merge trial both clauses PASS.

#### F6 (major): source contracts never published; the hero-body merge would break — **reconciled and proven on a merge trial**
- **Layout aligned to what hero-body reads.** `models-staging/r5-src/` now uses the Round-5 proof's directories, which
  hero-body's `recipes/lib/face.mjs srcRoot()` and `brea.mjs` read verbatim: `ubc/`, `mco/`, `ual2/`, `ual1/`. Each
  lock entry carries `dir`; consumers resolve with `sourceDir(rowId)` / `humans.mjs sourcePaths()` (now also `.ual2`).
  `status` FAILs a directory that belongs to no lock entry.
- **One MCO id.** Row `mco-fantasy` → **`mco-fantasy-standard`**, the id hero-body baked into
  `outfit-pan-1.glb`'s provenance (the GLB is not rebuilt; nothing to reconcile).
- **`tools/licences/fold.mjs` (new)** folds another lane's `LICENSES.json` into this one row by row (three-way with the
  merge base). Their rows that ship files under one of our SOURCE rows (same id, or same `source_url`) become
  `derived_from` rows named after the shipped file, with `derived_from` taken from the GLB's own provenance and
  `source_url` = its recipe. On the trial: hero-body → `brea`, `brea-clips-ual2`, `outfit-pan-1` derived, `brea-kit-v0`
  added, `legacy-hero-body` deleted with `aloy.glb`; brand → 3 font rows + favicon added, 6 legacy rows deleted;
  0 conflicts.
- **Multi-file sources** (brand's Google Fonts rows: no archive; `archive_sha256` = SHA-256 of the sorted `sha256sum`
  manifest of the downloaded files, which `manifestSha256()` reproduces exactly): `sources.mjs stage-files --row <id>`
  verifies each shipped file and the manifest hash and stages them. On the trial the three font rows stage and pass.
- **The merge trial passes the build** (§0): A-build-deterministic and A-build-only-lane with hero-body's three recipes
  reading only `r5-src` (the proof extracts denied by the sandbox), every committed hero GLB byte-identical to the build.
- **The stub for main** is §2.0: a 10-file set + 5 rows, proven on a clonefile copy of main (A-sources-staged there:
  PENDING on the 4 archive hashes only; `humans.mjs sourcePaths()` resolves).
- Found on the way, fixed: the promoted ground builder (`tools/build/ground/lib/ground-proof.mjs`) resolved its ROOT to
  `tools/build/` and wrote stats into `tools/r5-poc/out/`; A-build-deterministic's sandbox only denied proof extracts
  next to a lane folder (now any ancestor, by signature) and let an inherited `R5_SRC` through (now dropped);
  specs-fixture copied a symlinked `node_modules` in a fresh checkout (now excluded).

#### F7 (major): the importer check missed URL readers — **every string-literal reference is now found and classified**
`pocReferences()` scans comment-stripped `src/**` and `tools/**` for `tools/r5-poc` / `models/r5-poc` inside string
literals and classifies each hit: `biome-closure` (main.js's hook, engine-gpu's A-gpu-tier import, the two recipes that
write the closure GLBs), `checker` (this lane's own gate and licence files), `runtime-reader` (src) or `tool-reference`.
The last two FAIL the gate with file:line. Negative control: the judge's URL-default case (`renderStockFace(ctx, url =
'/tools/r5-poc/assets/heroine-base.glb')`) is caught. Readers found: `src/instruments/kinds/tiller.js:34`
(instruments-core; `/models/r5-poc/tiller.glb`, in every tree) and, on the merge trial,
`src/hero/sheets.js:336` (hero-body). **The request to delete `tools/r5-poc/assets/` is withdrawn** until hero-body
re-points `renderStockFace` (§6.4); note that folder is untracked and exists only in main's working directory, so the
stock-face render already 404s in any clean checkout.

#### F8 (major): the in-game credits clause could be satisfied by a comment — **graded on the rendered modal**
`A-licence-manifest` is a page gate now. Its node half is `check.mjs` (run once per process, embedded in the assert);
its page half clicks the **CREDITS** button, waits 400 ms, requires the modal to be displayed (non-zero box,
`menus.modal === 'credits'`) and grades each CC-BY and MIT attribution against the modal's DOM text with the same pure
`gradeCredits()` check.mjs exports. menu.js source is never read. A surface showing none of the attributions is "not
wired" (PENDING before the W0 exit, FAIL from it); a partial one is FAIL. `public/licences/credits.json` is deleted
(nothing read it: brand pastes the generator output into README and menu.js at build time), with its writer in
`add.mjs` and the `--write/--check` modes. Measured: this tree (main's menu) renders the Round-4 credits, 0 / 9 → PENDING
(brand); merge trial (brand's menu + `credits-sync`) README 9 / 9, rendered 9 / 9 → PASS. Frames read for both (§3).

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
