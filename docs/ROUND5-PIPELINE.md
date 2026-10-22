# ROUND 5 — lane `pipeline` report (W0b, fix round 4; round 3 is Appendix D, round 2 Appendix C, round 1 Appendix B, the W0a record Appendix A)

Lane: pipeline · port 5250 · wave W0b (protagonist on the kept rig) · Oct 22 2026 · branch `r5/w0b-pipeline`
(worktree `~/.calima-r5/trees/pipeline`; this round, fix round 4, started from the orchestrator's checkpoint `02d07ee`
(11:13Z), which holds all of round 3).
Plan: `docs/ROUND5-PLAN.md` §2 (row), §1.2 (grants: `src/main.js` removal-only at the W0 exit; donor lists removal-only),
§3.1–3.3, §4.1, §6 (rows owned), §8.3 (R33, R34, rule 8 amendment), §9 (pipeline block + global list), §10 (licences).

## 0. Status — measured this round on port 5250 (lane run 13:35:03–13:36:22Z, one Chrome, no edit in flight)

`R5_SCRATCH=<scratch> node tools/gates.mjs --port 5250 --extra tools/gates.r5.pipeline.mjs --lane pipeline`:
**13 gates: 7 PASS, 4 FAIL, 2 PENDING.** These are the same verdicts as rounds 2 and 3. The one fixable finding (R4-F1,
§1) changed what A-sources-staged proves, not its verdict: the gate still FAILs on the 98 missing files. Every number
below is from this run.

| gate | verdict | measured | what decides it |
|---|---|---|---|
| A-sources-staged | **FAIL** | 98 staged files missing (UBC 41, MCO 54, UAL2 3); UAL1 staged 3/3, 3.87 MB; no archive SHA-256 (4 pending); tamper control caught; **archive-identity controls 14/14 on the current records, 14/14 on post-fetch records with UAL1 per-file, 14/14 with UAL1 first-fetch** (§1 R4-F1) | Kevin's download (§6.1) + the UAL1/UAL2 rulings (§6.2) |
| A-build-deterministic | **PENDING** `blockedBy: A-sources-staged` | 5 outputs (4 GLB/WebP) byte-identical across two network-denied builds; 443 / 439 ms; 232.7 / 234.0 MB RSS; committed outputs 5/5 equal; missing-source classification control 6/6; `gen-humans-proof` stops on the missing UBC dir (6 outputs not built) | the sources |
| A-build-only-lane | **PASS** | 20 lanes, slowest pipeline 486 ms (cap 60 s), 0 writes outside, control 2/2 caught | — |
| A-glb-budget | **PASS** | 4 generated GLBs, 0 over (Tiller 32,960 tris / 24 bones / 309,880 B) | — |
| A-loader-fixes | **PASS** | dequantised error 0.0198 mm, fold 0 mm, raw-quantised control 120 mm, lamp `castShadow` false | — |
| A-specs-data-driven | **PASS** | 20.5 s; 578 files cloned, diff exactly `assets.specs.js` + `probe.glb`; A1 PASS; A20b PASS 347 frames; symlink control caught | — |
| A-specs-data-driven **on main's tree `263ae19`** (first item) | **PASS** | 19.6 s; 590 files cloned; diff exactly the 2 paths; A1 PASS (state=playing); A20b PASS 377 frames; `/src/main.js` text/javascript 96,482 B transformed; control caught; copy removed | — |
| A-human-bind | **PENDING** | `SKIP-pending (hero-body W0b)`; `SPECS.hero` = `/models/aloy.glb`, no rig profile | merged tree (§6.2) |
| A-poc-promoted (W0 exit) | **FAIL** | no ruling recorded; 3 closure files left; 1 problem: `src/instruments/kinds/tiller.js:34` (main's file); `?poc=biome` serves in 5.3 s and is now **filmed on every run** (`shots/gates/A-poc-promoted-biome.png`; landmark 22,120 tris, Tillers 65,920, terrain 80,000, 0 console errors); projections: `w1-exit` FAIL (1: that reader), `literal` FAIL (6) | the §6.2 ruling + instruments-core's merge |
| A-ID-ip-assets-gone | **FAIL** | `public/anims-hybrid/aloy-ual.json` EXPIRED (gates-perf's unmerged W0a deletion); 20 GLBs, 221 files read, 0 other hits; control ok | gates-perf's merge |
| A-licence-manifest | **FAIL** | legacy-source FAIL (the same file); third-party PENDING (5 rows); credits PENDING 0/9 README, 0/9 rendered (modal visible, 878×689); files 221/221; 35 rows valid; 34.48 MB ≤ 60 | gates-perf's merge, merge steps 5–6, §6.1 |
| A-assets-tracked | **PASS** | 225 paths, 0 ignored, control caught | — |
| A-pipeline-boot-rows / A-pipeline-r30-merge-order | **PASS / PASS** | 6 boot rows loaded, 5 R30 rows `SKIP-legacy-deleted` / consistent | — |

A first lane run (13:22:01Z) read A-specs-data-driven **FAIL**, with a third path in its diff
(`docs/ROUND5-PIPELINE.md`). That was my error, not the gate's. I edited this report while the fixture was diffing its
copy against the live tree, and the gate correctly caught a tree that changed under it. I re-ran the whole lane block
with nothing edited while it ran (`git status` hash equal at start and end), and the table above is that run.

**Global list items present in this tree** (one run, `--only`, 13:22:59–13:32:39Z): A1 **PASS** (state=playing), A20b
**PASS** (258 frames, 0 system errors), A90 **PASS** (heap −10 %, geo +9, tex −28, objects −1,096), A90-expansion **PASS**
(heap −6.2 %, non-machine growth 0, orphan roots 0), A90b **PASS** (0 offenders, 0 orphaned textures, heap −0.2 % after
forced GC), A90-rig-reclaim **PASS** (30 cycles, geo +5, tex 0; per live strider 0 geo / 0.38 tex), A21 **PENDING** (draws
309 / 195 / 325 ≤ 350 and 4.12 / 3.67 / 4.23 M tris ≤ 6.5 M pass; the GPU terms are unjudged on this box),
and A9 **FAIL** as the gate printed it: 309 draws pass, but 41.6 fps < 45. The gate's empty-frame probe read 60.2 fps /
0.35 ms of GPU, so it attributed the 49.57 ms of scene GPU to the scene.

**A9 context (I am not reclassifying the verdict):**
- This tree's runtime on the default boot is main's. The only runtime diff to `263ae19` is the removal of the two dead
  `?poc=human` / `?poc=creature` branches in `src/main.js` (+1/−9 lines, never reached without the flag).
- The frame is the same camp view, at the same 309 draws.
- The empty-frame probe is one sample. Brand's judge Chrome was alive when the global run started (preflight:
  1 other headless Chrome, load 2.50).
- On this box A9 has read 32–52 fps across the lanes' reports. Round 3 read 38.3 fps here, unattributable (3.13 ms
  empty frame). engine-gpu recorded 41.4 fps once in a state no CPU witness sees.
- I tried one more measurement on a quiet box (a slot plus 0 other headless Chromes). The box never went quiet in 25
  minutes (2 other lanes' Chromes the whole time), so no second A9 was taken, and I did not re-run it under contention.
- R26/R33(f) put A9's bar at 58 fps median on a quiet box. Whether this reading counts is for the orchestrator or
  gates-perf to grade on a sealed quiet run, not for this lane.

Not in this tree (other lanes' unmerged files): A90-abs, A-alloc-rate, A-vram-ledger, both horizon-terms lints,
A-reach-all-sites, A-port-guard, A-carried-suite.

**Registration:** r5 auto-discovery (gates-perf) is still not on main, so this file goes in through the runner's
`--extra tools/gates.r5.pipeline.mjs` flag. That flag does the same import and `GATES` merge as the `gates.round4.*.mjs`
scan, and the run log lists this file as the 28th merged file. `--lane pipeline` selects these 13 gates.

## 1. Fix round 4 — what changed, by finding

The judges (`pipeline-W0b-r3`, `judge-pipeline-w0b-r3-eng`) filed eleven findings. One is this lane's code and is fixed
below. The other ten are the five open blockers of round 3, each filed by both judges. Each needs Kevin's download, an
orchestrator ruling or another lane's merge. I re-checked every one this round, and none changed: no archive is on the
machine, no ruling marker is in main's plan (now `6bfae9f`, whose only new section is R35, hero-body's bow-draw elbow), and no
lane merged.

### R4-F1 (major, judge-pipeline-w0b-r3-eng): "The archive-identity control suite throws in the state it exists to certify" — **fixed: 14/14 on the current records AND on two simulated post-fetch record sets, inside the gate**

**The defect.** The judge's reading was right. Round 3's suite built its cases on a REAL source with its files on disk
(UAL1). `reset()` copied that source's REAL lock record into every case, and the expectations assumed the record had
no hash and no size. That held only before the re-fetch. I reproduced both of the judge's simulations by running round
3's suite (git `HEAD`) against post-fetch-shaped records (scratch script, not in the tree):

| post-fetch records | round 3's suite | this round's suite |
|---|---|---|
| UAL1 recorded by `record-per-file` (its ruling); UBC + MCO by `restore --zip` (plan size, members, listing); UAL2 by first fetch | `ok: null` "no source has every staged file on disk", which the gate silently skipped | **14/14, ok: true** |
| the same, but UAL1 recorded by `restore --zip` under `archive-size-ual1=first-fetch` | **threw** `ENOENT … tools/build/sources.listings/ual1.tsv` (case E refused, so E′ read a listing that was never written) | **14/14, ok: true** |

**The fix** (`tools/build/pipeline/archive-controls.mjs`, rewritten; `tools/gates.r5.pipeline.mjs`, A-sources-staged):
- **A synthetic, scratch-only source.** Every case runs on row `archive-control-synthetic` with three small files written
  in scratch (`License.txt`, `Models/part.gltf`, `Models/part.bin`; 4,234 B). Its lock entry and LICENSES.json row are
  rebuilt from nothing for each case: the name, plus only the size, `approxBytes` window or ruling that case needs. They
  are added to scratch copies of the records' lock and rows. No case reads or copies a real source's archive record, so
  the outcome no longer depends on what the real records hold or on what is staged on disk. The suite can no longer
  return `ok: null`.
- **No throw.** Each case runs in its own try/catch, so an exception becomes that case's FAIL, with the error. E′ and F
  are guarded on E having recorded ("E did not record: nothing to compare").
- **The regression control the judge asked for.** `archiveControlsPostFetch` shapes the lock, rows, plan and listing files
  as the W0b re-fetch will leave them: UBC and MCO recorded by `restore --zip` with the plan §10.1 size, a hash, members
  beyond the staged files and the listing file plus its hash; UAL2 under its first-fetch ruling, inside the window. UAL1
  takes either shape, `per-file` (record-per-file under its ruling) or `first-fetch` (restore under
  `archive-size-ual1=first-fetch`). Its precondition is that `archiveAgreement` is `[]` on every shaped source, so the
  shaped records are ones `status()` accepts. It then runs the same suite on them. A source that is already really
  recorded keeps its real record and listing.
- **The gate grades all three.** A-sources-staged runs the suite on the current records, the `per-file` post-fetch set
  and the `first-fetch` post-fetch set. It FAILs unless all three are `ok === true`, so `null` or a throw is a FAIL and
  is never skipped.
- **Two more cases** cover guards that round 3 did not exercise, so the suite has 14 cases, up from 12:
  - **L:** a first-fetch zip whose size falls outside the recorded `approxBytes` window is refused. This is the guard on
    UAL2's path.
  - **M:** the full zip under the pinned row `ubc-standard`, with its size moved to the zip's size in both the lock and
    the row, is refused by `restore`/`verify-zip` against plan §10.1. Round 3 tested that pin only through
    `archiveAgreement`.
- **The controls are not vacuous.** A mutation check (scratch copies of `sources.mjs`, one guard removed per mutant) has
  9/9 mutants killed in all three record sets, each by the case built for it:

| guard removed | cases that FAIL |
|---|---|
| subset (`beyond < 1`) | A, B, F |
| file name | C |
| plan §10.1 pin in `archiveIdentity` | M |
| `approxBytes` window | L |
| no size without a ruling | A |
| listing hash in `archiveAgreement` | E′ |
| `record-per-file` ruling | K |
| `stage-zip` keep-all refusal | H |
| `restore` recorded-hash compare | F |

### R4-F2 (blocker ×2): A-sources-staged FAIL, no archive SHA-256s, 98 human-source files missing; A-build-deterministic PENDING — **still open: needs Kevin's download and the rulings**
Re-checked this round:
- **Archives:** Spotlight finds none of the three archive names, `~/Downloads` holds none, and main's
  `models-staging/` has no `r5-src`.
- **Download:** nothing was downloaded. The relayed request ("continue all work") names no file, and fetching named
  third-party archives needs Kevin's explicit go-ahead (§6.1).
- **Rulings:** main's plan (`263ae19`) still carries only the `pool-terrain-build` and `rt-ledger-bar` markers.

A-sources-staged FAILs on 3 problems (UBC 41, MCO 54, UAL2 3 files missing) with 4 pending hashes. A-build-deterministic
is PENDING `blockedBy: A-sources-staged`: `gen-humans-proof` stops on the missing UBC dir, and the 5 outputs that build
are byte-identical. The judge's step 4, "Fix F2 first, or A-sources-staged will still FAIL", is done: R4-F1 proves the
suite passes 14/14 on post-fetch records. Once the archives and rulings land, nothing in this lane's code stands between
the re-fetch and a PASS.

### R4-F3 (blocker ×2): A-poc-promoted FAIL — **still open: needs the orchestrator's ruling and instruments-core's merge**
Unchanged:
- 1 problem: main's `src/instruments/kinds/tiller.js:34`.
- 3 closure files still on disk: `tools/r5-poc/poc-biome.js`, `public/models/r5-poc/{sounding-ring,tiller}.glb`.
- Projections: `w1-exit` FAILs only on that reader; `literal` FAILs on 6.

New this round: clause (c) carries a frame on every run. `biome-check.mjs --shot` films the asserted state at
1600×900, because `tools/screenshot.mjs` cannot film the standalone biome: it waits for `__READY__`, which that boot never
sets, and my first attempt timed out at 60 s. The frame (§3) shows what the stats assert.

`sounding-ring.glb` stays tracked for the reason in Appendix D §1 F3. Deleting it breaks clause (c) in every fresh tree,
and untracking it needs a git index write, so the ruling decides its fate.

### R4-F4 (blocker ×2): A-ID-ip-assets-gone and A-licence-manifest FAIL; credits 0/9; the rendered modal still shows Horizon/Sony/Sketchfab — **unchanged: other lanes' unmerged files**
Re-measured:
- **A-ID-ip-assets-gone:** FAIL on `public/anims-hybrid/aloy-ual.json` (EXPIRED).
- **A-licence-manifest:** legacy-source FAIL (the same file); third-party PENDING (5 rows); credits PENDING 0/9 in the
  README and 0/9 in the rendered modal.

The re-filmed modal (§3) still shows main's Round-4 `menu.js` block, with "HORIZON ZERO CLAUDE", the Guerrilla/Sony line,
"retargeted onto Aloy at boot" and "Sketchfab fan-art rigs — Aloy, Watcher, Sawtooth, Thunderjaw, Behemoth". The judges'
reading is right: the frame breaks plan §10.2. `menu.js`, `README.md` and `public/anims-*` are not this lane's files. The
fixes are gates-perf's merge and merge steps 5–6.

### R4-F5 (major ×2): A-human-bind has never run on Brea — **unchanged: graded on the merged tree**
Still `SKIP-pending (hero-body W0b)`, `heroUrl /models/aloy.glb`, and the re-filmed frame (§3) is the Round-4 body. I ran
no merge trial, since the judges do not accept one. Merge step 3 makes Brea the hero row, and §6.2 asks the orchestrator
to record that this gate is graded in a sealed run on the merged W0b tree.

## 2. Contracts published (exact signatures; complete as of this round)

### 2.0 New in fix rounds 3 and 4

```js
// tools/build/sources.mjs
export const PLAN = 'docs/ROUND5-PLAN.md';                 // §8.3 rulings: <!-- r5-ruling key=value --> lines
export const LISTINGS = 'tools/build/sources.listings';    // <LISTINGS>/<row>.tsv: one "<size>\t<crc32>\t<name>" line per member
export const PLAN_BYTES = { 'ubc-standard': 128968391, 'mco-fantasy-standard': 294347394 };   // plan §10.1, pinned
export function rulings(root?): { [key]: value }           // the plan's r5-ruling markers (engine-gpu's marker form)
export function memberListing(entries): { members, text, sha256 }    // directories, __MACOSX/, .DS_Store excluded
export function archiveIdentity({ row, ent, licRow, zipName, bytes, entries, rulingMap? = {}, mode? = 'refetch' | 'restage' }):
  { problems: string[], listing, beyond, stagedMembers, bytesFrom }  // [] problems = this zip IS the recorded upstream archive
export function archiveAgreement(licRow, ent, { root? }): string[]   // lock entry vs LICENSES.json row; [] = agree
export async function recordPerFile({ row, root?, env?, today? }): { row, ok, sha256?, files?, problems? }
export async function restore({ row, from?, zip?, deleteZip?, retrieved?, root?, env? })   // + members, membersBeyondStaged, problems
export async function stageZip({ row, zip, keeps?, strip?, retrieved?, page?, deleteZip?, dir?, root?, env? })   // + ok, members, problems
export async function verifyZip({ row, zip, retrieved?, deleteZip?, root? })   // + expectedName, members, membersBeyondStaged, problems
// LockEntry.archive gains { members, listingSha256, bytesFrom?, approxBytes?: { min, max, from }, kind?: 'file-manifest',
//                          ruling?, newVersionRuling? }; LICENSES.json rows gain the optional field `archive_note`
```
```
node tools/build/sources.mjs record-per-file --row <id>      # only under <!-- r5-ruling archive-per-file-<id>=accepted -->
node tools/build/pipeline/archive-controls.mjs [--scratch <dir>]   # the 14 identity controls on 3 record sets, one JSON line
                                                                   # { ok, current, postFetch, postFetchUal1Archive }
```
```js
// tools/build/pipeline/archive-controls.mjs
// fix round 4: the cases run on the synthetic scratch-only row SYNTH; `root` = the records the suite starts from
// (lock, LICENSES.json, plan, listings), `codeRoot` = the code under test. ok is never null; a throw inside a case is that
// case's FAIL ({ ok: false, error }), never a throw out of the suite.
export const SYNTH = 'archive-control-synthetic', N_CASES = 14;
export async function archiveControls({ root?, codeRoot?, scratch?, label? }):
  { ok: boolean, records, row: SYNTH, passed, of: N_CASES, error?, cases: [{ case, expect, ok, error?, why?, … }] }
export async function postFetchRecords({ root?, codeRoot?, out, ual1?: 'per-file' | 'first-fetch' }):
  { root: out, shaped: { [row]: how }, agree: boolean, disagreements }   // the post-W0b-fetch lock/rows/plan/listings, simulated
export async function archiveControlsPostFetch({ root?, codeRoot?, scratch?, ual1?: 'per-file' | 'first-fetch' }):
  { ...archiveControls result, ok: shape.agree && every case, shape }
// tools/build/pipeline/biome-check.mjs (fix round 4: `shot` films the asserted state, 1600×900)
export async function biomeCheck({ root?, scratch, port?, waitMs?, shot? }): { pass, detail: { gate: { pass, …, shot? }, ms } }
//   node tools/build/pipeline/biome-check.mjs --scratch <dir> [--port <p>] [--shot <png>]
// tools/build/pipeline/w0b-checks.mjs
export const POC_RULING_KEY = 'poc-closure', POC_RULINGS = ['w1-exit', 'literal'];
export function pocPromotedStatic({ root?, rulingMap? }): { pass, detail: { ruling, recordedRuling, clauseC, leftOnDisk, closureLeft,
  otherLeft, references, problems, blocked, projections: { 'w1-exit': { pass, problems }, literal: { pass, problems } }, negativeControl } }
```

**Archive identity — what a zip must be before anything is recorded** (`archiveIdentity`, used by `restore --zip`,
`verify-zip` and `stage-zip` on a known source; checked before any file is written):
1. its file name equals the lock's `archive.name`, which equals the row's `archive_name`;
2. its byte size equals the recorded `archive.bytes` (= the row's `archive_bytes`, = `PLAN_BYTES` for UBC and MCO). A
   source with no recorded size needs `<!-- r5-ruling archive-size-<row>=first-fetch -->` and must then fall inside the
   lock's `approxBytes` window when there is one (UAL2: 15.5–19 MB, from the proof's "zip 17 MB");
3. it holds members beyond the staged subset (`restore` / `verify-zip`); `stage-zip` refuses `--keep` globs that select
   every member;
4. once recorded, its member count and listing SHA-256 equal the recorded ones; a different SHA-256 is refused
   (`stage-zip` of a new upstream version needs `<!-- r5-ruling archive-new-version-<row>=accepted -->`).

The name and size are never taken from the zip, and `stage-dir` never rewrites a recorded name or size. A successful
record writes `archive.{sha256, members, listingSha256}` to the lock, the listing to `tools/build/sources.listings/<row>.tsv`,
and `archive_sha256 / archive_bytes / retrieved` to the row (`retrieved` defaults to the zip's mtime date: the download day).

**Agreement** (`archiveAgreement`; graded by `status()` = A-sources-staged and by `tools/licences/check.mjs` third-party
= A-licence-manifest): lock and row agree on SHA-256, name and size; UBC/MCO sizes equal `PLAN_BYTES`; a recorded hash
carries a size, a member count above the staged file count, and a listing file that hashes to `listingSha256`. A
`file-manifest` record (stage-files, record-per-file) is compared on its SHA-256 only.

### 2.1–2.7 (unchanged from round 2, still current)

- `node tools/build/sources.mjs stage-zip | stage-dir | stage-files | verify-zip | restore | record-per-file | status | layout`
  (header of `tools/build/sources.mjs`); `REQUIRED`, `DIRS`, `srcDir`, `sourceDir`, `layout`, `manifestSha256`,
  `stageFiles`, `loadLock`, `status({ root?, env? })`. Layout `models-staging/r5-src/{ubc,mco,ual2,ual1}/<path inside the
  archive>`.
- `tools/build/build-assets.mjs`: `isMissingSource(err)`, `buildAssets({ only?, out? }) → { lanes, recipes, results, skipped,
  failed[], wallMs, peakRssMb }` (keeps going; exit 1 when `failed.length`). Recipes signal `err.code = 'R5_SRC_MISSING'`.
- `tools/licences/add.mjs` (FIELD_ORDER now includes `archive_note`; `--prune-landed`), `fold.mjs --theirs … [--base …] [--write]`,
  `credits.mjs` (`creditRows`, `creditsMarkdown`, `requiredAttributions`; brand's `credits-sync.mjs` consumes it),
  `lib.mjs` / `check.mjs` (`currentWave`, `gradeCredits`, `check(root?, { env?, rendered? })`).
- `tools/build/humans.mjs` (`sourcePaths` throws `R5_SRC_MISSING`, `buildHeroineBase`, `buildOutfit`, `writeHuman`, …),
  `tools/build/pipeline/w0b-checks.mjs` (`buildDeterministic`, `buildOnlyLane`, `glbBudget`, `pocReferences`,
  `LANE_OUTPUTS`, `classOf`, `overBudget`, `auditLane`), `specs-fixture.mjs` (`serveAndRun`, `runGate`).
- `src/core/assets.specs.js` (`SPECS`, `ANIMS`, `DELETED`) and `src/core/assets.js` are unchanged. `SPECS.hero` still
  names `/models/aloy.glb` in this tree (merge step 3 repoints it).

## 3. Frames read (pipeline owns no V gates; these film the state three action gates grade)

Every cited frame was re-filmed by this round's runs at 1600×900, in the judges' staging. I read each one and then
deleted it.
- **A-poc-promoted's biome frame** (`shots/gates/A-poc-promoted-biome.png`, new this round; it replaces the judges'
  `judge-pipeline-r1-biome.png` angle, which is the biome's default POC camera):
  - **Landmark:** the sounding ring stands on the pale salt flat, a dark open ring with copper bands around a red/green
    core, on two plinths. Its cable runs to the left plinth.
  - **Tillers:** two small walkers stand at the flat's left edge, near the ring's base.
  - **Ground and scatter:** a dark, wind-rippled sand foreground with yellow-green marram tufts and a few grey boulders.
  - **Backdrop:** a basalt-column escarpment behind the flat, with hazy ridges and a pale sky.

  The frame shows what the stats assert (landmark 22,120 tris, Tillers 65,920, terrain 80,000, scatter 1,427 columns /
  5,200 marram / 160 boulders, 0 console errors), so clause (c) holds in this tree.
- **A-licence-manifest** (the CREDITS modal over the camp, opened by its CREDITS button): still main's Round-4 `menu.js`
  credits. The rows are:
  - HORIZON ZERO CLAUDE ("An unaffiliated homage", "Horizon Zero Dawn is © Guerrilla Games / Sony Interactive
    Entertainment");
  - ENGINE;
  - MACHINE MODELS · CC-BY 3.0 ("Mechanical Horse" — jake young …), and the CC0 donors;
  - ANIMATION ("retargeted onto Aloy at boot");
  - AUDIO;
  - TYPEFACES: Julius Sans One / Michroma / Orbitron / Rajdhani / Chakra Petch;
  - "Sketchfab fan-art rigs — Aloy, Watcher, Sawtooth, Thunderjaw, Behemoth".

  None of the 9 verbatim attribution strings is shown, so the gate's 0/9 matches the frame. The frame breaks plan §10.2
  until brand's credits block merges (§6.3), so the judges' reading is correct.
- **A-human-bind** (boot at the camp, 3/4 back view): the Round-4 red-haired body with the Round-4 bow and spear, and
  the camp NPCs around the fire. There is no Brea and no rig profile, so the gate's PENDING matches the frame.
- **Other frames:**
  - The A-loader-fixes and A-pipeline-boot-rows frames show the same boot state and grade nothing visual.
  - Of the global items' frames (incidental to action gates), I read A1, A9 and A90-rig-reclaim:
    - A1: the camp boot, with the HUD and quest tracker intact and no error overlay.
    - A9: the same view, measured at 309 draws, with nothing extra in it.
    - A90-rig-reclaim: the same view after 30 spawn/kill cycles, at level 12 from the kills, with the scene intact and
      no leftover wrecks in view.
  - I deleted the other frames unread.

## 4. First item — `A-specs-data-driven` on main (the fixture fix from round 0, re-proved this round)

The fix is unchanged (`tools/build/pipeline/specs-fixture.mjs`). The scratch, the copy and the served root are realpath'd,
because Vite resolves module ids to real paths, and a root under `/var → /private/var` made every module fail `fs.allow`,
so JS was served raw and CSS as `text/css`. `viteProbe` checks the served MIME types in < 1 s before any Chrome, and
`probeControl` serves the same copy through a symlink and must be caught. This round,
`node tools/build/pipeline/specs-fixture.mjs --root "<main>" --scratch <scratch>` against main's tree `263ae19`:
**PASS 19.6 s** (A1 PASS, state=playing; A20b PASS, 377 frames, 0 system errors; 590 files cloned; diff exactly
`src/core/assets.specs.js` modified + `public/models/pipeline/probe.glb` deleted; `/src/main.js` text/javascript 96,482 B
transformed; control caught: raw main.js 16,859 B, feedback.css `text/css`; copy removed). In this tree, through the
harness: PASS 20.5 s, A20b 347 frames. Main keeps failing the gate only through main's own W0a copy of the fixture until
this branch merges.

## 5. Merge steps for the orchestrator

0. **`tools/gates.r5.pipeline.mjs`: no conflict any more.** hero-body's branch tracks main's version again (checkpoint
   `cc80bfc`: no diff to `263ae19`), so this branch's version merges cleanly. Keep it.
1. **`src/main.js`** (pipeline's removal-only hunks vs brand's edits: one textual conflict). Resolution = brand's file
   with pipeline's three removal-only edits re-applied, each found exactly once: delete the 7-line `?poc=human` block,
   delete the ` * \`?poc=creature\` stages …` comment line, and `['creature', 'biome']` → `['biome']`. **Do not resolve it
   with `diff3 -m`** (macOS's diff3 silently dropped two of brand's lines and a brace in round 2's trial).
2. **`public/LICENSES.json`**: take pipeline's side, then for each of hero-body and brand:
   `git show a953355:public/LICENSES.json > base.json; git show r5/w0b-<lane>:public/LICENSES.json > theirs.json;
   node tools/licences/fold.mjs --theirs theirs.json --base base.json --write` (round 2's trial: 0 conflicts).
3. **`SPECS.hero` → Brea** (pipeline's one-row data edit in `src/core/assets.specs.js`, after hero-body merges):
   `hero: { url: '/models/hero/brea.glb', targetHeight: 1.77913, yaw: 0, required: true },`; then drop
   `public/models/aloy.glb` from `SCHEDULED_IP` in `tools/licences/lib.mjs`.
4. `node tools/build/sources.mjs stage-files --row <id>` for `font-bodoni-moda`, `font-ibm-plex-mono`,
   `font-ibm-plex-sans-condensed` (brand's rows).
5. `node tools/licences/add.mjs --prune-landed` after gates-perf's anims deletion (prunes `legacy-anims-duplicates`,
   `legacy-anims-lab-bake`).
6. `node tools/lint/credits-sync.mjs` (brand's tool) after the fold, so README and the in-game modal show the 9 strings.
7. **`models-staging/r5-src` in main, symlinked into the lane trees** (rule 10), so a reboot cannot take it again:
   `node tools/build/sources.mjs restore --row ual1 --from public/anims` recreates `ual1/` anywhere (3 files, 3.87 MB of
   clones). Then `node tools/build/staging-cleanup.mjs --root "<main>" --apply`.
8. **After Kevin's download (§6.1)**, in main, one command per archive:
   `node tools/build/sources.mjs restore --row ubc-standard --zip "<…>/Universal Base Characters[Standard].zip" --delete-zip`,
   the same for `mco-fantasy-standard` (`Modular Character Outfits - Fantasy[Standard].zip`) and, once its ruling is in,
   `ual2-standard` (`Universal Animation Library 2[Standard].zip`). Each refuses anything but the named upstream file
   (§2.0) and writes nothing on refusal. Then `node tools/build/sources.mjs status` and
   `node tools/build/build-assets.mjs --out <scratch>` must rebuild Brea, `outfit-pan-1` and the kit byte-identically.
9. **The POC folders in main hold untracked files no merge removes.** Main's working tree has `tools/r5-poc/assets/`
   (the `?poc=human` proof's six GLBs, no reader left in any lane tree), `tools/r5-poc/{gen-*,film-*,poc-creature,pocHuman,
   tiller,ubcRig}.js…` (tracked ones deleted by this branch) and the untracked `poc-biome.js` and
   `public/models/r5-poc/sounding-ring.glb` (Oct 15 proof output). After the §6.2 ruling: under `poc-closure=w1-exit`
   delete everything in `tools/r5-poc/` except `poc-biome.js`; under `poc-closure=literal` delete both folders
   (`rm -r tools/r5-poc public/models/r5-poc`) and this branch's `gen-tiller.mjs` second output, `gen-sounding-ring.mjs`,
   the two `.gitignore` exceptions, the `landmark-sounding-ring-poc` row and the r5-poc path of the `instrument-tiller` row go with them
   (the gate lists each one under its `literal` projection).

## 6. Rulings and requests

Each ruling below is **one marker line** in `docs/ROUND5-PLAN.md` §8.3 (the `<!-- r5-ruling key=value -->` form the plan
already uses for `pool-terrain-build` and `rt-ledger-bar`). The gates read the marker; with no marker they grade the
literal bar. Nothing here moves a bar on the lane's own say-so.

### 6.1 Kevin — the archive re-fetch (W0b exit: "licence manifest complete with SHA-256s"; also the only way back to the human sources)
Nothing was downloaded. The relayed request ("continue all work") names no file, and a download of named third-party
archives needs Kevin's explicit go-ahead. Fetch by hand from the itch pages in the rows' `source_url` (free "name your
own price" packs; "No thanks, just take me to the downloads"):

| row | file | size | page |
|---|---|---|---|
| `ubc-standard` | `Universal Base Characters[Standard].zip` | 128,968,391 B (plan §10.1) | https://quaternius.itch.io/universal-base-characters |
| `mco-fantasy-standard` | `Modular Character Outfits - Fantasy[Standard].zip` | 294,347,394 B (plan §10.1) | https://quaternius.itch.io/modular-character-outfits-fantasy |
| `ual2-standard` | `Universal Animation Library 2[Standard].zip` | ≈ 17 MB (no exact size kept) | https://quaternius.itch.io/universal-animation-library-2 |

Then merge step 8. If a browser saved "… (1).zip", rename it back: the name is part of the identity check. If UBC or
MCO no longer has the recorded size, the pack changed upstream since Oct 15: the restore refuses, and the path is the
`archive-new-version-<row>` ruling + `stage-zip` + a rebuild of Brea's GLBs. Peak transient disk ≈ 440 MB.

### 6.2 Orchestrator — the rulings

| marker | what it decides | what the gates do with it |
|---|---|---|
| `<!-- r5-ruling poc-closure=w1-exit -->` **or** `<!-- r5-ruling poc-closure=literal -->` | A-poc-promoted: plan §9 clauses (b) "both folders absent" and (c) "`?poc=biome` still serves A-gpu-tier" contradict while the biome hook exists (main.js imports `/tools/r5-poc/poc-${POC}.js`; the biome loads `/models/r5-poc/{sounding-ring,tiller}.glb`) | `w1-exit`: (b) passes with exactly the three closure files left, (c) graded, the closure's suppliers allowed; their deletion (+ the tracked `sounding-ring.glb`, its row and `.gitignore` exception) moves to world-ground's W1-exit row. `literal`: both folders absent, (c) struck (probe reported), the suppliers and A-gpu-tier's import become references that FAIL. No marker: literal bar, at best PENDING. Both are projected on every run (§0) |
| `<!-- r5-ruling archive-size-ual2-standard=first-fetch -->` | UAL2's exact zip size was never kept | `restore --zip` accepts a UAL2 zip whose size is inside 15.5–19 MB and records that size as `bytesFrom: first fetch`; without it every UAL2 zip is refused |
| `<!-- r5-ruling archive-per-file-ual1=accepted -->` (or a v1 archive from a backup, then `archive-size-ual1=first-fetch`) | UAL1 v1 cannot be re-fetched (itch serves v3.0 since 16 Jun 2026); its shipped files are R15's frozen clips | `record-per-file --row ual1` records the per-file SHA-256 manifest (stage-files form) in lock and row with an `archive_note`; without the marker it refuses |
| (no marker: a §8.3 sentence) A-human-bind is graded on the merged W0b tree | A-human-bind cannot run on Brea in this tree (Brea's GLBs and rig profile are hero-body's) | none needed: the gate is PENDING here (no rig profile) and grades 52/52 wherever Brea is the hero row (merge step 3) |

Also still open: **r5-poc-rock-scan** (`legacy: r5-poc`, dies with `public/textures/r5-poc` at world-ground's W1 exit) —
fetch the Poly Haven scan now, or defer its hash to world-ground's W1 ground recipe.

### 6.3 Other lanes
| to | what |
|---|---|
| **brand** | `tools/lint/namecheck.mjs:200` (was :199) compares your lexicon with `tools/r5-poc/direction-a/horizon-lexicon.txt`, which this branch deletes (plan §6). It is a reference into the POC folder that A-poc-promoted FAILs under either ruling: drop the clause or point it at `git show a953355:tools/r5-poc/direction-a/horizon-lexicon.txt`. Still open: `"build:assets": "node tools/build/build-assets.mjs"` in `package.json`; run `credits-sync.mjs` after the fold (§5 step 6) |
| **instruments-core** | merge your `tiller.js` re-point (`/models/instruments/tiller.glb`): main's `src/instruments/kinds/tiller.js:34` is the runtime reader A-poc-promoted FAILs on in this tree |
| **gates-perf** | the W0a deletion of `public/anims-{hybrid,reskin,retarget}/**` (done in your tree) must merge: until it does, A-ID-ip-assets-gone and A-licence-manifest FAIL at W0b on `aloy-ual.json` in every W0b tree |
| **hero-body** | done since round 2, thank you: your branch tracks main's `tools/gates.r5.pipeline.mjs` again |
| **world-ground (W1)** | under `poc-closure=w1-exit` you inherit the closure's deletion row (§5 step 9) |
| **gates-perf / orchestrator** | A9 printed FAIL in this round's global run (41.6 fps < 45, attributed by a one-sample empty-frame probe while another lane's Chrome was alive); this tree's default boot is main's. Grade A9 on a sealed quiet run under R26/R33(f); this lane could not get a quiet box in 25 min (§0) |

## 7. Honest gaps

1. **No upstream archive, no staged human sources** (R4-F2, §6.1):
   - A-sources-staged FAILs, and A-build-deterministic stays PENDING on it.
   - Nothing can rebuild Brea's GLBs until Kevin downloads the archives.
   - Rounds 3 and 4 made the re-fetch refuse anything but the named upstream file and proved the controls hold after the
     fetch. Neither round recorded a single archive hash, and neither could.
2. **Four gates FAIL in this tree** at the true wave:
   - A-sources-staged is §6.1.
   - A-poc-promoted needs a ruling that only the orchestrator can make, plus instruments-core's merge, plus brand's
     one-liner.
   - A-ID-ip-assets-gone and A-licence-manifest's legacy-source clause are gates-perf's unmerged deletion.
   - Credits 0/9 is brand's unmerged `menu.js` / README.
3. **A-human-bind has never run on Brea in a sealed run.** Round 2's 52/52 came from an unsealed merge trial and does
   not count. It is graded on the merged tree or not at all.
4. **The post-fetch regression control runs on simulated records.** No archive is on this machine, so the
   post-fetch hashes, sizes and member listings are made up, but in exactly the shape the code writes (`archiveAgreement`
   is `[]` on every shaped source).
   - **What it proves:** the controls give the same 14/14 whatever the real records hold, which is exactly what the
     finding was about.
   - **What it does not prove:** that the real archives will pass `archiveIdentity`. Only the real fetch can show that.
5. **The identity check is evidence, not proof.** A name, an exact byte size, members beyond the subset and a recorded
   listing make an accidental or naive self-made zip fail. A deliberate forger who edits the lock, the row and
   `PLAN_BYTES` together, and pads a zip to the exact size, defeats any local check. Every such edit is a reviewed diff
   to tracked files. The member listing written on the first real fetch lets anyone compare the record with the
   upstream pack later. UAL2 has no pinned size (plan §10.1 kept only UBC's and MCO's). Under its first-fetch ruling, any zip
   inside the 15.5–19 MB window that holds the staged files plus at least one more member is accepted on the first
   record. After that, the recorded hash refuses every other zip.
6. The UAL2 window (15.5–19 MB) comes from a rounded figure in the proof ("zip 17 MB"). Under its ruling, a UAL2 zip's
   exact size is taken from the first fetch.
7. **A9's fps term reads 32–52 fps on this box depending on contention**, and this lane changed nothing on the default
   boot: the only runtime diff to main is the removal of the two dead `?poc` branches. See the A9 note in §0.
8. `tools/measure-machines.mjs` still hard-codes `cwd: '/Users/kevinliu/horizon-zero-claude'` (outside the
   removal-only grant's scope).

## 8. Files changed

`git status --short` at the end of the round:
```
 M docs/ROUND5-PIPELINE.md
```
The orchestrator checkpointed this round twice, at `6ab98e5` (13:23Z) and `cdb8613` (13:50Z). Between them they hold
every code change below and the orchestrator's sync of main's `docs/ROUND5-PLAN.md` (R35, not a lane edit). Since
round 3's checkpoint `02d07ee`:
- `tools/build/pipeline/archive-controls.mjs`, rewritten (R4-F1):
  - the cases now run on the synthetic scratch-only row `archive-control-synthetic`;
  - each case has its own try/catch, and E′ and F are guarded on E;
  - two new cases, L (the window) and M (the plan §10.1 pin in `restore`/`verify-zip`), make 14 in all;
  - `postFetchRecords` / `archiveControlsPostFetch` (UAL1 `per-file` or `first-fetch`) were added;
  - a `codeRoot` parameter was added;
  - the CLI prints three record sets.
- `tools/gates.r5.pipeline.mjs`:
  - A-sources-staged runs the controls on the current records and on both post-fetch sets, and FAILs unless all three
    are `ok === true` (round 3 skipped `ok: null`);
  - A-poc-promoted passes `--shot` to the biome child and reports the frame path;
  - the header was updated.
- `tools/build/pipeline/biome-check.mjs`: `--shot <png>` / `shot` films the asserted biome state.
- `docs/ROUND5-PIPELINE.md`: this report (round 3 moved to Appendix D).

Nothing else changed this round: `sources.mjs`, the lock, `LICENSES.json`, `src/**` and `public/**` are untouched.
Git-ignored and unchanged: `models-staging/r5-src/ual1/` (3 clones). The mutation check and the before/after
reproduction ran from scratch scripts outside the tree (§9).

No file outside the §2 row and the W0b grants was edited. Every other lane tree and main were only read.

## 9. Process hygiene

- **Chrome, under the machine-wide two-slot lock** (plan §0 rule 8 amendment):
  - The first job held `slot2` 13:22:01–13:34:15Z: lane block, global items, the main proof and the biome film, in
    sequence.
  - The second lane block held `slot2` 13:35:03–13:36:22Z.
  - One Chrome of this lane was alive at a time. The preflights read 45 GB free, 73–78 % memory free, at most 1 other
    headless Chrome, and load 2.5–2.9.
  - The quiet-box A9 attempt (13:37–14:02Z) waited **without** holding a slot. It never got 0 other headless Chromes,
    so it took no slot and launched nothing.
  - No slot was held while I edited. My one edit during a run (the A-specs-data-driven race, §0) was a doc edit during
    the first job, and it is why the lane block was re-run.
- **Vite:** started only by `tools/gates.mjs`, `tools/screenshot.mjs` and the fixture, all on 5250 or a unix socket,
  and stopped by them. The failed biome screenshot's Vite was killed by the job (`pkill -f "vite --port 5250"`). At the
  end nothing listens on 5250, no Chrome of this lane is alive, and there are 0 `puppeteer_dev_chrome_profile-*` in
  `$TMPDIR`. Port 5173 was never touched.
- **Disk:** 45 GB free all round. About 19 MB of shots in the tree were read where cited and deleted with `shots/`, and
  so were their scratch copies. The controls delete their own scratch zips (< 30 KB per run now). Logs, reports and the
  two scratch scripts (`demo/mutate.mjs`, `demo/before-after.mjs`, run from outside the tree) are kept in
  `scratchpad/r5/pipeline/w0b-r4/` (≈ 400 KB).
- **Git:** read-only only (`status`, `diff`, `log`, `show`). The orchestrator's checkpoint `6ab98e5` (13:23Z) and its
  sync of main's `docs/ROUND5-PLAN.md` (R35, 13:24Z) are not this lane's writes. I left the synced plan as it is.
- **Downloads:** none.

---

# Appendix D — W0b fix round 3 (Oct 22 2026 morning, as written then; its §0–§1 only — its contracts, merge steps and requests are superseded by §2, §5 and §6 above)

### 0. Status — measured this round on port 5250 (harness run 10:50:03–10:51:24Z, one Chrome)

`R5_SCRATCH=<scratch> node tools/gates.mjs --port 5250 --extra tools/gates.r5.pipeline.mjs --lane pipeline`:
**13 gates: 7 PASS, 4 FAIL, 2 PENDING** (the same verdicts as round 2; every number below is this run's).

| gate | verdict | measured | what decides it |
|---|---|---|---|
| A-sources-staged | **FAIL** | 98 staged files missing (UBC 41, MCO 54, UAL2 3); UAL1 staged 3/3, 3.87 MB; no archive SHA-256 (4 pending); tamper control caught; **archive-identity controls 12/12** (§1 F1) | Kevin's download (§6.1) + the UAL1/UAL2 rulings (§6.2) |
| A-build-deterministic | **PENDING** `blockedBy: A-sources-staged` | 5 outputs (4 GLB/WebP) byte-identical across two network-denied builds, 391 / 388 ms, 236.1 / 236.8 MB RSS, committed outputs 5/5 equal, missing-source classification control 6/6; `gen-humans-proof` stops on the missing UBC dir (6 outputs not built) | the sources |
| A-build-only-lane | **PASS** | 20 lanes, slowest pipeline 435 ms (cap 60 s), 0 writes outside, control 2/2 caught | — |
| A-glb-budget | **PASS** | 4 generated GLBs, 0 over (Tiller 32,960 tris / 24 bones / 309,880 B) | — |
| A-loader-fixes | **PASS** | dequantised error 0.0198 mm, fold 0 mm, raw-quantised control 120 mm, lamp `castShadow` false | — |
| A-specs-data-driven | **PASS** | 23.5 s; 578 files cloned, diff exactly `assets.specs.js` + `probe.glb`; A1 PASS; A20b PASS 344 frames; symlink control caught | — |
| A-specs-data-driven **on main's tree `263ae19`** (first item) | **PASS** | 20.2 s; 590 files cloned; diff exactly the 2 paths; A1 PASS; A20b PASS 250 frames; `/src/main.js` text/javascript 96,482 B transformed; control caught (raw 16,859 B, `text/css`); copy removed | — |
| A-human-bind | **PENDING** | `SKIP-pending (hero-body W0b)`; `SPECS.hero` = `/models/aloy.glb`, no rig profile | merged tree (§6.2) |
| A-poc-promoted (W0 exit) | **FAIL** | no ruling recorded; 3 closure files left; 1 problem: `src/instruments/kinds/tiller.js:34` (main's file); `?poc=biome` serves in 5.1 s; projections: `w1-exit` FAIL (1: that reader), `literal` FAIL (6) | the §6.2 ruling + instruments-core's merge |
| A-ID-ip-assets-gone | **FAIL** | `public/anims-hybrid/aloy-ual.json` EXPIRED (gates-perf's unmerged W0a deletion); 20 GLBs, 221 files read, 0 other hits | gates-perf's merge |
| A-licence-manifest | **FAIL** | legacy-source FAIL (the same file); third-party PENDING (5 rows); credits PENDING 0/9 README, 0/9 rendered (modal visible, 878×689, 1,645 chars); files 221/221; 34.48 MB ≤ 60 | gates-perf's merge, merge steps 5–6, §6.1 |
| A-assets-tracked | **PASS** | 225 paths, 0 ignored, control caught | — |
| A-pipeline-boot-rows / A-pipeline-r30-merge-order | **PASS / PASS** | 6 boot rows loaded, 5 R30 rows `SKIP-legacy-deleted` / consistent | — |

**Global list items present in this tree** (one run, `--only`, 10:51:24–11:01:01Z): A1 **PASS** (state=playing),
A20b **PASS** (223 frames, 0 system errors), A90 **PASS** (heap −7.6 %, geo +9, tex −28, objects −1,096), A90-expansion
**PASS** (heap −11.1 %, non-machine growth 0, orphan roots 0), A90b **PASS** (0 offenders, 0 orphaned textures, heap −9.4 %
after forced GC), A90-rig-reclaim **PASS** (30 cycles, geo +8, tex 0; per live strider 0.13 geo / 0.38 tex), A9
**PENDING** (309 draws pass; 38.3 fps not attributable: the empty frame costs 3.13 ms of GPU here), A21 **PENDING**
(draws 309 / 195 / 325 ≤ 350 and 4.12 / 3.67 / 4.23 M tris ≤ 6.5 M pass; the timing terms are not attributable on this
box). Not in this tree (other lanes' unmerged files): A90-abs, A-alloc-rate, A-vram-ledger, both horizon-terms lints,
A-reach-all-sites, A-port-guard, A-carried-suite. No runtime file changed this round (`src/**` untouched), so these
are a regression check, not new evidence.

**Registration:** r5 auto-discovery (gates-perf) is still not on main, so this file goes in through the runner's
`--extra tools/gates.r5.pipeline.mjs` flag (the same import and `GATES` merge as the `gates.round4.*.mjs` scan; the run
log lists it as the 28th merged file); `--lane pipeline` selects these 13.

### 1. Fix round 3 — what changed, by finding

#### F1 (major, judge-pipeline-w0b-r0): "restore --zip and verify-zip record any zip's hash as the upstream archive's" — **fixed, with 12 controls in the gate**
The judge zipped `public/anims` into `ual1.zip`, ran `restore --row ual1 --zip ual1.zip`, and the lock and the row
recorded that zip's SHA-256 (and its name and size) as UAL1's upstream archive. Both commands checked only that the
zip **contained** the staged files, which a re-zip of the trimmed subset always does. Now (`tools/build/sources.mjs`,
§2.0):
- **Identity before anything is written** (`archiveIdentity`, shared by `restore --zip`, `verify-zip` and `stage-zip`
  on a known source): the file name must equal the lock's `archive.name` = the row's `archive_name`; the size must
  equal the recorded `archive.bytes` = the row's `archive_bytes` = the plan's §10.1 size for UBC and MCO (pinned in
  `PLAN_BYTES`); the zip must hold members beyond the staged subset; a recorded member count and listing hash must
  match. A source with no recorded size (UAL2, UAL1) is refused unless `<!-- r5-ruling archive-size-<row>=first-fetch -->`
  is in the plan, and UAL2 must then fall inside the 15.5–19 MB window the proof recorded ("zip 17 MB").
- **Nothing is taken from the zip**: name and size are never overwritten; `expectedBytes` is enforced (it was computed
  and ignored); `stage-dir` can no longer rewrite a recorded name or size; `stage-zip` refuses `--keep` globs that select
  every member (a keep-all "trimmed subset" is indistinguishable from a re-zip) and a changed SHA-256 without
  `<!-- r5-ruling archive-new-version-<row>=accepted -->`.
- **The record is auditable**: a successful record writes `archive.members`, `archive.listingSha256` and the member
  listing (`tools/build/sources.listings/<row>.tsv`, size + CRC-32 + name per member).
- **Both gates check the record** through one function (`archiveAgreement`): A-sources-staged (`status()`) and
  A-licence-manifest's third-party clause (`tools/licences/check.mjs`) FAIL when the lock and the row disagree on
  hash, name or size, when UBC/MCO's size is not the plan's, or when a recorded hash has no size, no member count
  above the staged file count, or no listing file that hashes to `listingSha256`.
- **Negative controls run inside A-sources-staged on every run** (`tools/build/pipeline/archive-controls.mjs`, scratch
  only, on the real code path, with zips built from the UAL1 files staged here). This run: **12/12**:

| case | expect | result |
|---|---|---|
| A re-zip of the 3 staged files, recorded name, no size, no ruling (the judge's attack, renamed to pass the name check) | refused by restore AND verify-zip; lock + row untouched | refused: "no byte size is recorded … needs the orchestrator ruling", "holds only the 3 staged member(s)" |
| B the same re-zip after a forger set lock + row size to its 1,066,535 B | refused | refused: "holds only the 3 staged member(s)" |
| C a full zip (3 staged + 1 extra member) saved as `ual1.zip` | refused | refused: file name ≠ the recorded upstream name |
| D a full zip with one staged member changed by one byte | refused | refused: `mismatched AnimationLibrary_Godot_Standard.bin` |
| E a full zip, no recorded size, ruling `archive-size-ual1=first-fetch` | accepted + recorded | recorded hash, 1,066,685 B with `bytesFrom: first fetch`, 4 members, listing file; row equal |
| E′ the recorded pair, then the listing file edited | agree, then caught | `[]`, then "does not hash to the recorded listingSha256" |
| F the subset re-zip after E | refused | refused on size, subset, member count, listing hash and archive SHA-256 |
| G a full zip with the size recorded, `--delete-zip` | accepted, zip deleted | accepted, recorded, zip gone |
| H `stage-zip` of the subset re-zip keeping every member, size forged | refused | refused: "the --keep globs select all 3 members" |
| I `stage-zip` of the full zip keeping the staged files | accepted, same files | accepted, 3 files with the lock's SHA-256s, 4 members |
| J `archiveAgreement` on the real lock and rows, then 5 hand edits | 0 disagreements, 5/5 caught | 0; lock name, row size, a made-up hash in both, a hash in the row only, and UBC's size moved in lock AND row (caught against plan §10.1) |
| K `record-per-file` without, then with `archive-per-file-ual1=accepted` | refused, then recorded | refused naming the ruling; then the per-file manifest hash `45e8f8fa…` in lock and row with `archive_note` |

A refused case leaves the scratch lock, the scratch LICENSES.json and the scratch r5-src byte-identical (checked by
hash in every refused case). The real lock and row are unchanged: no archive hash is recorded anywhere, because no
upstream archive is on this machine (F2).

#### F2 (blocker ×2, both judges): no archive SHA-256s; the staged human sources are gone; A-sources-staged FAILs — **still open: needs Kevin's download and two rulings**
Re-searched this round (Spotlight on the three archive names, `~/Downloads`, every lane tree and main's
`models-staging/`): no archive and no copy of the UBC, MCO or UAL2 files exists on this machine. Nothing was downloaded:
the relayed request names no file, and fetching named third-party archives needs Kevin's explicit go-ahead (§6.1 gives
file, page and size for each). What changed is that the re-fetch is now **one command per archive that refuses
anything but the named upstream file**, and the two sources whose archive cannot be proven by size have a ruling
path that the gates read (§6.2):
- UAL2: no exact size was kept. `<!-- r5-ruling archive-size-ual2-standard=first-fetch -->` lets `restore --zip`
  record the first fetch's size (inside the 15.5–19 MB window); without it every UAL2 zip is refused.
- UAL1: v1 can no longer be fetched (itch serves v3.0 since 16 Jun 2026). `<!-- r5-ruling archive-per-file-ual1=accepted -->`
  lets `node tools/build/sources.mjs record-per-file --row ual1` record the per-file SHA-256 manifest (the stage-files
  form, with an `archive_note` saying it is not an archive hash); without it the command refuses.
- The row and lock notes now name these markers and commands.
A-sources-staged stays **FAIL** (98 staged files missing: UBC 41, MCO 54, UAL2 3), A-build-deterministic stays
**PENDING `blockedBy: A-sources-staged`** (`gen-humans-proof` stops on the missing UBC dir; the 5 outputs that build are
byte-identical), and A-licence-manifest's third-party clause stays **PENDING** on 5 rows.

#### F3 (blocker / major): A-poc-promoted FAILs; the lane tracks `sounding-ring.glb` in a folder the bar says must go — **gate made ruling-ready; one more leftover removed; the contradiction still needs the orchestrator**
- The plan's clauses (b) "`tools/r5-poc/` and `public/models/r5-poc/` absent" and (c) "`?poc=biome` still serves
  A-gpu-tier" cannot both hold while the biome hook exists, and only the orchestrator can choose. The gate now grades
  the choice the moment it is recorded as `<!-- r5-ruling poc-closure=w1-exit -->` or `=literal` (§6.2), and with no
  marker keeps the literal bar (at best PENDING, never PASS). Every run also **projects both options** on the tree, so
  the ruling is made on measured consequences. This run: no ruling recorded → **FAIL** on 1 problem
  (`src/instruments/kinds/tiller.js:34`, main's file; instruments-core's unmerged re-point removes it); projection
  `w1-exit` FAIL on that same reader only; projection `literal` FAIL on 6 (the 3 closure files, the reader, and the two
  suppliers `gen-tiller.mjs:54` / `gen-sounding-ring.mjs:43` that would re-create the folder).
- **The gate missed a leftover**: it skipped symlinks, so the orchestrator's `tools/r5-poc/assets` link (to main's
  untracked proof GLBs) kept `tools/r5-poc/` present without being listed. Symlinks now count as left on disk, and the
  link is removed from this tree (nothing in any lane tree reads `tools/r5-poc/assets/` any more; main's real folder is
  merge step 9).
- `sounding-ring.glb` stays tracked, and this is deliberate rather than overlooked. Main has the same file
  **untracked** (186,348 B, Oct 15 proof output, no provenance), and every lane tree made by `git worktree add` lacks it.
  engine-gpu had to symlink main's copy into its tree to boot `?poc=biome` for A-gpu-tier. Untracking it cannot be done
  without a git index write, which lanes may not do; deleting it breaks clause (c) in every fresh tree. Under option 1 the
  tracked file, its row and its `.gitignore` exception move to world-ground's W1-exit row. Under option 2 they are
  deleted (merge step 9; the `literal` projection lists both suppliers). Either way the ruling decides it, and the gate
  names it under `literal`.
- The `?poc=human` / `?poc=creature` blocks are gone from `src/main.js` (clause (a): `humanPath` false, `creaturePath`
  false), and `?poc=biome` serves in this tree (5.1 s; landmark 22,120 tris, Tiller 65,920, terrain 80,000).

#### F4 (blocker / major): A-licence-manifest and A-ID-ip-assets-gone FAIL in this tree — **unchanged: other lanes' unmerged files**
Re-measured: A-ID-ip-assets-gone **FAIL** on `public/anims-hybrid/aloy-ual.json` (row `legacy-anims-lab-bake`, `ip: true`,
EXPIRED at the W0a exit; 20 GLBs and 221 files read, 0 other hits; gates-perf's tree has deleted the folder, unmerged).
A-licence-manifest **FAIL**: legacy-source on the same file; third-party PENDING (the archive hashes, F2); credits
PENDING with 0/9 in the README and 0/9 in the rendered modal; files 221/221 matched; 34.48 MB ≤ 60. The filmed modal
(§3) is still main's Round-4 `menu.js` (brand's file): "HORIZON ZERO CLAUDE", the Guerrilla/Sony line, the Julius /
Michroma / Orbitron fonts and "Sketchfab fan-art rigs — Aloy, Watcher, Sawtooth, Thunderjaw, Behemoth". This lane
cannot edit `menu.js`, `README.md` or `public/anims-*`; the fixes are merge steps 5 and 6 and gates-perf's merge.

#### F5 (major): A-human-bind PENDING, Brea absent from this tree — **unchanged: graded on the merged tree**
The gate reports `SKIP-pending (hero-body W0b) … heroUrl /models/aloy.glb`, and the frame (§3) shows the Round-4 body.
Brea's GLBs and rig profile are hero-body's files. Merge step 3 makes her the hero row; the gate then grades 52/52 with
no code change. I did not re-run a merge trial: the judges do not accept one as a gate run.

# Appendix C — W0b fix round 2 (Oct 22 2026, as written then; its §0–§1 only — its contracts, merge steps and requests are superseded by §2, §5 and §6 above)

### 0. Status — this tree, and the W0b merge trial

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

### 1. This round — what happened and what changed

#### 1.1 The reboot emptied `models-staging/r5-src`
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

#### 1.2 One command per archive for the re-fetch (`tools/build/sources.mjs restore`)
New command (§2.0). It re-stages a source's files exactly as the lock records them, from a local directory or from
the archive, all or nothing, and with `--zip` it also records the archive SHA-256 in the lock and the LICENSES.json
row. Negative controls, run in scratch: a one-byte change to one file → refused, `mismatched: [LICENSE]`, nothing
written, exit 1; a missing file → refused, `missing: [LICENSE]`, exit 1; the files one folder deeper → found by
suffix, ok. The zip path was checked on a scratch copy of the lock and manifest with a zip of the UAL1 files: 3/3
written, archive SHA-256 recorded in both the lock and the row (`archive_bytes` 1,066,651, `retrieved` set), and an
identical second run left them unchanged. The three source rows' `pending` notes and the lock's `stagedFrom` notes now
name this command.

#### 1.3 Gates that told the truth badly after the reboot — fixed
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

#### 1.4 Cross-lane state re-read (read-only)
- instruments-core re-pointed `src/instruments/kinds/tiller.js` to `/models/instruments/tiller.glb` (round-1 request
  done). hero-body's `renderStockFace` no longer reads `tools/r5-poc/assets/` (done).
- **New: hero-body's branch deletes `tools/gates.r5.pipeline.mjs`** (checkpoint `ae95d9a`; their tree holds an
  untracked copy of this branch's `a8db205` version). Merge resolution and request: §5 step 0, §6.4.
- **New: brand's `tools/lint/namecheck.mjs:199`** names `tools/r5-poc/direction-a/horizon-lexicon.txt` (deleted on this
  branch per plan §6). Its `existsSync` guard turns it into `null`, so nothing breaks, but A-poc-promoted lists it (§6.4).
- `diff3 -m` (FreeBSD, macOS) is unsafe for the `src/main.js` resolution; §5 step 1 gives the exact edit list.

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
