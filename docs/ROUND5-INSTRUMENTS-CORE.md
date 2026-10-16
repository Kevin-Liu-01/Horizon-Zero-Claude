# ROUND 5 — lane `instruments-core` (W0a report)

Port 5254. Worktree `scratchpad/r5/instruments-core/tree`, base `9d3b891`. Plan rows used: §2
(`instruments-core`), §1.2 (the W0a removal-only grant on 14 files; the W0 machines grant), §3.1 (W0a
exit), §3.2 (`ctx.machines.roles`, kind auto-registration), §6 (Override/corruption, IP kinds), §8
(R17, R18, R28, R30), §9 (`instruments-core` block). W0b items (LAMP_STATES, beams, perk and weather
hooks, `uv1`, VFX palette, A90-rig-reclaim ×5, the kind-block file) are not started.

**Fix round 1 (Oct 16):** one judge finding — the collapse had deferred the whole roster past
`__READY__`. The roster is built in the `Machines` constructor again; see **FIX ROUND 1** below.
Files touched this round: `machines/{index,legacy,variety-assets}.js`,
`tools/gates.r5.instruments-core.mjs` (new lane guard `A-boot-roster`) and this doc. None of the 14
removal-only files changed.

**Fix round 2 (Oct 16):** one judge finding — `A-no-override` passed on a 3-line comment allowlist
while the §9 bar is 0 literal matches in `src/**`. The three comment hits are deleted (removal-only,
inside the W0a grant on `playerAnimator.js` and `menu.js`) and the allowlist is gone: the gate now
greps the raw text of every file under `src/` against 0. See **FIX ROUND 2** below.

Gates run with:

```
node tools/gates.mjs --port 5254 --extra tools/gates.r5.instruments-core.mjs --lane instruments-core
```

`--extra` is needed until gates-perf's `A-gates-autodiscover` merges (today `tools/gates.mjs` scans
only `tools/gates.round4.*.mjs`). After that, drop `--extra`; nothing else changes (the file exports
`GATES` in the same shape).

---

## FIX ROUND 2 — `A-no-override` checks the literal bar (judge finding instruments-core/W0a #2)

**Finding.** §9: "0 matches of `/override-node|overridden|\bOVERRIDE\b|overrideNode|cauldron-override/`
in `src/**`". A literal `grep -rnE` of that regex over `src/` found 3 comment lines
(`ui/menu.js:787`, `playerAnimator.js:2527`, `:2665`), and the gate passed them through a named
allowlist (`OVERRIDE_COMMENT_ALLOW`) and only counted code with comments stripped. The bar had moved.

**Fix 1: the three hits are deleted, deletions only** (the W0a removal-only grant names both files):

| file:line | before | after (characters deleted, none inserted) |
|---|---|---|
| `src/ui/menu.js:787` | "only a non-positive restore is overridden, and only on the frame after the restore has run." | "only a non-positive restore, and only on the frame after the restore has run." (−14) |
| `src/entities/playerAnimator.js:2527` | "A LOCK THAT IS ABOUT TO SLIDE DOES \*\*NOT\*\* OVERRIDE THE MOVE TEST, and this was tried and reverted rather than guessed. Letting a hot lock force the system live …" | "Letting a hot lock force the system live …" (−127; the rest of the comment, the A105 measurement and "`moveW` … is the only discriminator", is unchanged and still states the rule) |
| `src/entities/playerAnimator.js:2665` | "THE OVERRIDE THAT MAKES THE DRIFT BAR A GUARANTEE." | "THE DRIFT BAR GUARANTEE." (−26) |

Comments only; no code token changed in either file (esbuild's comment-stripped output of both files
is byte-identical before and after). The subsequence proof still holds: `removalOnly` reads 14/14
deletions-only against `9d3b891`, `menu.js` now 14 chars removed (was 0), `playerAnimator.js` 170
(was 17).

**Fix 2: the gate checks raw text, no allowlist.** `OVERRIDE_COMMENT_ALLOW` and the
comment/unexplained split are deleted from `tools/gates.r5.instruments-core.mjs`. The static half
now walks EVERY regular file under `src/` (140 today: 133 `.js` + 7 `.css`, not only `.js`), greps
the raw text (comments included) with the §9 regex verbatim, and the verdict requires
`rawHits.length === 0`. The comment-stripped code scan and the mechanic-identifier scan stay as
additional zero checks.

**Measured:**
- literal `grep -rnE '<§9 regex>' src/` in the tree: **0 lines** (exit 1);
- gate static half: `rawHits` **0** over 140 files, `codeHits` 0, `identHits` 0, removal-only 14/14;
- **negative control** (scratch copy of `src/` + the gate file, the three old comment lines put
  back): `rawHits` **3**, exactly `playerAnimator.js:2527`, `:2665`, `menu.js:787` → the gate fails;
- **negative control, other extension**: one `/* override-node probe */` line appended to
  `src/style.css` in a scratch copy: `rawHits` **1** (`src/style.css:676`), `codeHits` 0 — the old
  `.js`-only walk would have missed it;
- the full gate on port 5254: **PASS** (14 s), `rawHits` 0 over 140 files; the whole lane block
  6/6 PASS and the global list re-run (gate tables below).

Files touched this round: `src/ui/menu.js` and `src/entities/playerAnimator.js` (comment
deletions only), `tools/gates.r5.instruments-core.mjs` (allowlist removed, raw `src/**` scan added),
this doc. No runtime code changed.

---

## FIX ROUND 1 — the boot contract restored (judge finding instruments-core/W0a #1)

**Finding.** The collapse deferred the WHOLE roster until every model had loaded: `Machines` built
nothing in its constructor and all 28 machines spawned ≈ 1–2.6 s after `__READY__`.
`progression.js:3032` finds the Machine prototype through `machines.list[0]` when it is constructed,
so its difficulty/skill damage wrapper fell to a 1 Hz retry that gives up after 30 tries. The judge
measured `A64b-damage-channels` and `A64c-silent-apex` FAIL ("the machine damage wrapper is not
installed"), and `A62`/`A63` SKIP ("no living machine").

**Cause, precisely.** In base the constructor's roster was the four IP kinds, the only machine
models `assets.js` loaded at boot; every other kind already streamed in later. R30 deletes exactly
those four, so the constructor had nothing it could build. The fix gives the boot roster models
that are loaded at boot again.

**What changed (4 files, all in my grant; the 14 removal-only files are untouched by this round).**
1. `machines/legacy.js` — `BOOT_SPECS`: the four Round-3 kinds (strider, scrapper, glinthawk,
   longleg; `registerAt: 'boot'`) are boot rows now, 1.7 MB in all, against the 4.8 MB of IP
   models base loaded at boot. `LEGACY_SPECS` now lists only the 7 deferred Round-4 kinds. Both
   carry `shadowPolicy: MACHINE_SHADOWS`. `installLegacy` returns `boot` (the kinds whose model it
   handed over inside the call). `spawnLegacyRoster` spawns each kind's roster at most once per
   manager, so the deferred pass can never spawn the boot roster a second time.
2. `machines/variety-assets.js` — `loadKindModels` finishes a model that is already in
   `ctx.assets.models` (style, `loaded`, `onLoaded`) BEFORE it returns, not on a microtask; only
   the models still to fetch wait for the promise.
3. `machines/legacy.js` — **merge-order bridge** (W0a only). Pipeline's data-driven `assets.js`
   reads `BOOT_SPECS` and loads it in `loadAll` (its `legacyRows().boot`, read in the pipeline
   tree). In a tree without that merge, `legacy.js` wraps `Assets.prototype.loadAll` once, when it
   is imported: if the instance publishes `assets.specs` (the §3.2 contract, i.e. the data-driven
   loader) the wrapper calls straight through; otherwise it loads the missing boot rows through
   the public `loadExtra` in parallel with the original rows, inside the same awaited `loadAll`. A
   boot row that fails is not fatal: that kind falls back to the deferred path. Nothing in
   `assets.js` is edited. The bridge can be deleted when both W0a branches are merged; it is
   inert either way, and goes with `legacy.js` at W2.
4. `machines/index.js` — the constructor builds the boot roster again, as base did: registrars
   first (with `kinds` and `_chassis` created before them, since a registrar can now call
   `registerKind` synchronously), then `spawnLegacyRoster(this)` for every kind whose model is
   present. The deferred pass (`varietyReady` → leftover legacy rosters → `spawnExpansion` →
   watermark → `expansionReady`) is unchanged in order. `bootAudit` records both halves. Also
   fixed: `_resolveKind` referenced `EXPANSION_BODY` after the import was removed (a chassis spawn
   would have thrown a ReferenceError); `BODY as EXPANSION_BODY` is imported again.

**Measured on this tree (port 5254, `--only`, Oct 16 00:00–00:45).**

| check | before fix (judge) | after fix |
|---|---|---|
| alive at `__READY__` (`settle: 0`) | 0 (judge `JP-focus-pick`: 0 at READY + 600 ms) | **14** (6 strider, 3 scrapper, 3 glinthawk, 2 longleg), `list[0]` = strider |
| progression wrapper at `__READY__` | false, `hookTries` 0 → true only by + 1.5 s | **true**, `hookTries` 0, `_hooked` true |
| deferred kinds land | ≈ 1–2.6 s after READY | 0.69–1.02 s after READY (14 more, total 28; Tiller herd 3) |
| boot roster spawned twice? | — | no: `deferred.roster` 0, per-kind counts unchanged |
| `A64b-damage-channels` | FAIL ×2 | **PASS** (legacy = modern damage 38 / 47.5 / 32.3 at normal / easy / hard; tear 14) |
| `A63-loot-reveals` | SKIP ×2 | **PASS** (STRIDER WRECK + SUPPLY CRATE, 3 reveals drawn, 28 datapoints) |
| `A64c-silent-apex` | FAIL (wrapper) | FAIL "no Thunderjaw in the scene" — R30; the same text the judge's waited run gave |
| `A62-focus-components` | SKIP | FAIL — it now stages a strider (2 components; it needs ≥ 3). Its subject is `sawtooth` (R30), and the judge's waited run also FAILed it. Needs gates-perf's re-stage (kinds with ≥ 3 components today: longleg 5, broadhead 4, grazer 7, ravager 4, shellwalker 4, corruptor 4, stormbird 8) |
| judge `JP-roster-timing` | wrapper false at start | wrapper/hooked/noise/gourd all true at start, 14 alive; 28 at `expansionReady` (+1.02 s) |

**New lane guard `A-boot-roster`** (`tools/gates.r5.instruments-core.mjs`; not a §9 row, it guards
this finding). It samples at `settle: 0`. `main.js` sets `__READY__` before it starts the frame
loop, so no hook retry can have run by then, and a wrapper present at that sample was installed at
construction. Checks: the boot rows are published and loaded at READY; the constructor's
`bootAudit.boot` names every boot kind; alive at READY ≥ the boot roster, and the boot kinds' count
equals it; the wrapper is installed; the deferred half lands (`expansion` > 0, `roles.herd` alive);
the boot roster is not re-spawned. Names no species (reads `BOOT_SPECS`).
**Negative control:** a scratch copy identical to this tree except `return;` as the bridge's first
line (the boot rows then load deferred, which is the pre-fix behaviour) → **FAIL**: 0 alive at READY,
wrapper false, `bootAudit.boot` empty, `deferred.roster` 14. In the same copy `A64b` happened to
PASS (its 1.2 s settle let the 1 Hz retry land), which is why the guard samples at READY and does
not rely on A64b.

**The judge's non-PASS list, re-run on the fixed tree** (the 44 action/V-number gates of
`judge/nonpass.txt`, `--only`, 01:22–01:40; `work/fix1/report-r4subset.json`), against the judge's
pre-fix tree run and base:
- changed to PASS: `A64b-damage-channels`, `A63-loot-reveals` (this fix); `A19-secondary-motion`
  and `A31e-hillside-pan-clamp` (both load-sensitive; they flip between runs on this box);
- `A21-real-draw-calls` FAIL → PENDING (GPU terms not attributable under load; draws and triangles
  PASS);
- `A62-focus-components` SKIP → FAIL (R30 staging, above);
- the other 38 are unchanged: each names a deleted kind (`watcher`, `sawtooth`, `thunderjaw`,
  `behemoth`, `redeye`, `tallneck`), the deleted quest or tally type, or corruption (A100), or was
  FAIL on base too. **None of them is a "no living machine" timing SKIP any more.**
- `A31b` / `A31f` stay FAIL for a reason worth naming. Their hill-site picker takes the steepest
  26–40° face with no collider within 7 m. In base the Thunderjaw stood at (30, −220), so the face at
  (33, −228) was excluded and the gates ran at (−30, −273). With R30 that face is clear, the picker
  chooses it, and the camera bar fails there (in the judge's pre-fix run as well). The camera belongs
  to hero-body and the staging to gates-perf; the change of site comes from R30, not from timing.

**Styling unchanged by the loader path.** `ICP-entry-signature` (scratch probe) hashes every boot
entry's materials (name, colour, metalness, roughness, emissive, side), per-mesh `castShadow`,
`shadowCasters`, `styledKind`, `shadowPolicy` and size. Results: boot path in this tree, against the
deferred path in the negative-control copy: **identical hashes for all four kinds** (strider
`7b421c90`, scrapper `8a36aa51`, glinthawk `d78ab827`, longleg `dea1e18e`; 1 / 1 / 3 / 1 shadow
casters, `styledKind` set once).

---

## PART A — the removal-only Override + corruption pass (14 granted files)

Done first, kept separate. Grant §1.2: "removal-only: every line and branch of the Override mechanic
(`override-node`, `overridden`, `OVERRIDE`, `overrideNode`, the `cauldron-override` terminal) and the
`ai/squad.js` corruption block". Review it with:

```
git diff 9d3b891 -- src/audio/audio.js src/combat/melee.js src/core/progression.js \
  src/entities/machines/ai/engage.js src/entities/machines/ai/squad.js src/entities/machines/ai/stimulus.js \
  src/entities/playerAnimator.js src/studio/cast.js src/studio/pose.js src/ui/focus.js src/ui/menu.js \
  src/world/props/activities.js src/world/props/places.js src/world/props/tallneck.js
```

**Proof of "deletions only"** (inside `A-no-override`, clause `removalOnly`): for each file the
W0a text is a character SUBSEQUENCE of the `9d3b891` text, i.e. it is reachable by deleting
characters and inserting none. `git diff --word-diff` shows 12 `+` tokens; every one is a truncation
of the `-` token it replaces (`['dead','downed','stagger']);` from `[...,'stagger','overridden']);`,
`restore,` from `restore is overridden,`). The subsequence test is the exact form of that claim.
Result (after fix round 2): 14/14 deletions-only, 14 files changed; 33 line-diff insertions / 245
deletions, every insertion a truncated line.

| file | removed (chars) | what |
|---|---|---|
| `src/audio/audio.js` | 17 | `'override-node'` from the discovery-sting event list |
| `src/combat/melee.js` | 66 | `'overridden'` from `NO_SNEAK_STATES`; three `p.mounted` / `p?.mounted` guards (the mount half of Override; nothing sets `player.mounted` any more); "or a mount" in one comment |
| `src/core/progression.js` | 1272 | the whole `side-cauldron-override` quest; the `override` tally type (`TALLY_TYPES`, the `case 'override'` branch, the `on('override-node')` listener); `'override-tallneck'` in `PLACE_NAMES`; the doc lines naming them |
| `src/entities/machines/ai/engage.js` | 32 | "(an overridden machine chasing)" comment |
| `src/entities/machines/ai/squad.js` | 3668 | the corruption block: `CORRUPT_EYE`, `_updateCorruption`, `corrupt`, `uncorrupt`, the `_corruptor` releases in `noteKill` / `forget`, the `update()` call; the three `overridden` rearguard checks |
| `src/entities/machines/ai/stimulus.js` | 74 | two `overridden` skips |
| `src/entities/playerAnimator.js` | 170 | `'override-node'` from the interact-beat event list (17); fix round 2: the two comment sentences that used the word `OVERRIDE` (153) |
| `src/studio/cast.js` | 77 | `'overridden'` hold state, the `Override` cast row, `manager.override` in the doc |
| `src/studio/pose.js` | 108 | the `interact` pose (it fired `override-node`) and its doc mention |
| `src/ui/focus.js` | 67 | `m.mountedBy \|\| m.overridden` in `_walksRoute`; two doc mentions |
| `src/world/props/activities.js` | 3654 | the OVERRIDE NODE activity: build, interactable, `sites()` row, glow update, doc |
| `src/world/props/places.js` | 821 | the `cauldron-override` terminal interactable and its banner comment (the terminal's mesh stays as an inert prop) |
| `src/world/props/tallneck.js` | 144 | "carries the OVERRIDE interactable" doc sentence |
| `src/ui/menu.js` | 14 | fix round 2: " is overridden" from the respawn-guard comment (the file's only §9 regex hit) |

**No §9 regex hit is left anywhere in `src/**`, comments included** (fix round 2). The first round
kept three English-word comment lines behind a gate allowlist; that was a moved bar, and both the
lines and the allowlist are now deleted (see FIX ROUND 2).

---

## PART B — `src/entities/machines/**` (the W0 machines grant)

### B1. Override and corruption gone from the machine code
- `ai/override.js` deleted (269 lines): ally state, follow, mount, ride, teal eyes.
- `ai/index.js`: `OverrideSystem` import/export/install and `machines.{override,canOverride,mount,
  dismount,overrides,mounted}` removed; `lure()` no longer checks `overridden`; contract doc updated.
- `ai/tables.js`: `OVERRIDE` table, `overrideCfg`, `ECOSYSTEM.corruption` removed.
- `machine.js`: `EYE_COLORS.override`, `corrupted`, `overridden`, `mountedBy` fields, the mount
  release in `_die`, `forceState('overridden')`, the `overridden` FSM case and `_stateOverridden`
  removed. **The FSM is now closed:** `export const MACHINE_STATES` = patrol, suspicious, alert,
  search, attack, return, stagger, downed, dead, and `setState` refuses any other name (the first
  A-no-override run caught `forceState('overridden')` still parking a machine in an unhandled state
  through the generic `setState` fall-through).
- `index.js`: respawn / recycle / standoff loops no longer test `overridden`, `corrupted`,
  `mountedBy`; `overrides.update()` gone.
- `ai/doctrine.js`: the Corruptor's corruption install and `corrupted` audit count gone (the
  Corruptor body stays a plain legacy hostile until instruments-b deletes it at W2).

### B2. IP kinds deleted (R30, §6)
`watcher.js`, `sawtooth.js`, `behemoth.js`, `thunderjaw.js`, `redeye.js` deleted (2,429 lines) with
every row that named them: the authored roster (4 Watchers, 2 Sawtooths, Behemoth, Thunderjaw), the
2-Watcher strider escort, `RIGS.{sawtooth,behemoth,thunderjaw}`, `SAWTOOTH/THUNDERJAW/BEHEMOTH_SHELL`,
`REDEYE_SHELL`, their table rows, the Redeye doctrine/escort/spawn rows. The **Tallneck kind** (its
only body was the Behemoth chassis) and the snapmaw/ravager/shellwalker chassis rows that pointed at
deleted donors went too. The GLBs and `assets.js` SPECS rows are pipeline's (R30); this half never
reads them, so either merge order works.

### B3. Legacy collapse
Every surviving pre-CALIMA kind — strider, scrapper, glinthawk, longleg, broadhead, grazer, snapmaw,
ravager, shellwalker, corruptor, stormbird — lives in **`src/entities/machines/legacy.js`** (one row
per kind: class, asset spec, style, bake flag, registration timing, rig row, table rows, doctrine row,
roster) and is reachable only from it. Kept files carry no kind row any more:

| kept file | before | now |
|---|---|---|
| `index.js` | imported 8 species classes; authored roster; `_spawnVariety` | reaches `legacy.js` through a guarded `import.meta.glob('./legacy.js')` (absent file = no legacy kinds, 0 edits) and imports `installInstruments`; names no kind |
| `ai/tables.js` | 8 kinds' rows in PERCEPTION/ENGAGE/ATTACKS/REACT/ELEM/ALARM/ATTACK_MODE/ESCORT/SCAVENGER | `default` rows + `registerKindTables` |
| `ai/doctrine.js` | 9 kinds' CHASSIS/BODY/NEW_* tables/COMPONENTS/doctrine branches/SPAWN_PLAN | kind-agnostic host + `registerDoctrine` |
| `autorig.js` | `RIGS` for 3 IP kinds + spread of `rigs-expansion.js` | `RIGS = {}` + `registerRig` |
| `variety-assets.js` | species imports, SPECS, STYLE, EXPANSION lists, `registerExpansionSpecies` | `loadKindModels` + style/bake machinery |
| `rig/shells.js` | 6 species shells | shell machinery only; the 3 legacy shells moved to `rig/shells-expansion.js` |

`rig/shells-expansion.js` (legacy, deleted at W2 with `legacy.js`) received SCRAPPER/LONGLEG/
GLINTHAWK_SHELL; `scrapper.js`, `longleg.js`, `glinthawk.js` had their shell import line repointed
(one line each). Shells were moved to that file, not into `legacy.js`, because the species modules
import their shell and `legacy.js` imports the species: putting the shells in `legacy.js` would make
an import cycle.

**Behaviour preserved.** Every table, rig, style, component and spawn number moved verbatim
(extracted programmatically from the old files). Roster now: 25 legacy machines (6 striders,
3 scrappers, 3 glinthawks, 2 longlegs, 2 broadheads, 2 grazers, 2 snapmaws, 1 ravager,
2 shell-walkers, 1 corruptor, 1 stormbird) + 3 Tiller fixtures, against 39 before (the 14 removed:
4 Watchers + 2 Sawtooths + Behemoth + Thunderjaw of the authored roster, the 2-Watcher strider
escort, 3 Redeyes, the Tallneck).

**Boot timing is base's (fix round 1, see the FIX ROUND 1 section).** As in base, the authored
roster is built INSIDE the `Machines` constructor and exists at `__READY__`: the 14 Round-3 machines
(6 striders, 3 scrappers, 3 glinthawks, 2 longlegs; base built its 8 IP machines there). Their
models are boot rows (`legacy.js` `BOOT_SPECS`). The Round-4 expansion kinds and the Tiller stream
in afterwards exactly as base's deferred kinds did (`varietyReady` / `expansionReady`, ≈ 0.7–1.0 s
after `__READY__` here).

Each kind loads on its own (`loadKindModels`): a kind whose model fails is listed in
`bootAudit.*.failed` with one `console.warn` and never spawned; the rest of the roster is untouched.

---

## PART C — Instruments core (`src/instruments/**`)

- `registry.js` — kind auto-registration (`import.meta.glob('./kinds/*.js')`).
- `roles.js` — the 12 role ids, the R18 notes, `buildRoles`.
- `lib/generated.js` — `liftExtras`, `seedAuthoredWeights`, `weightAudit` (the POC's generated-kind
  helpers, promoted: dequantise once per kind, keep `_bone` labels via `getX`, lamp mesh `noShadow`).
- `kinds/tiller.js` — **the W0 fixture**, role `herd`, `fixture: true`. The proven POC creature
  (`tools/r5-poc/tiller.js`) through the registry; class `kind: 'tiller'`, weak point `lamp`, calm
  lamp `#F2EAD3` (bible §7.2; the wary/hostile colours stay `EYE_COLORS` until LAMP_STATES in W0b),
  bible §7.4 #3 attacks on generic builders (hopper-burst, auger-jab rear, drum-shove, herd-trample),
  one spawn row (herd of 3 at (64, −96)). Model: `/models/r5-poc/tiller.glb` (see gaps).

---

## Contracts published (exact signatures)

### `ctx.machines` (manager)

```
machines.roles        Readonly<{ sentry|herd|swarm|flanker|heavy|keeper|duelist|artillery|support|spotter|ambusher|colossus: string|null }>
                      exactly 12 keys; a value is a LIVE non-legacy kind id (W0: herd -> 'tiller'); null = R18
machines.roleNotes    Readonly<{ [role]: string }>   'R18: no live kind yet — plumb (instruments-a, W1)' | 'R28 fixture: …' | 'live: …'
machines.roleIds      readonly string[]   (ROLE_IDS order)
machines.roleOf(kind) -> string | null
machines.isLegacyKind(kind) -> boolean    true for every kind NOT registered from src/instruments/kinds/
machines.instrumentKinds  Readonly<{ [id]: descriptor }>   (descriptor + `source` path)
machines.kindAudio    Readonly<{ [id]: { set, mass } | null }>
machines.bootAudit    { boot: { kinds: string[], roster: number },          // set IN the constructor
                        deferred: { roster: number, expansion: number },     // set when expansionReady goes up
                        legacy: { loaded, failed } | null, instruments: { loaded, failed } | null }
machines.kinds / canSpawn(kind) / spawn(kind, x, z, opts) / registerKind(kind, Cls)   (unchanged)
```

Removed: `machines.override`, `canOverride`, `mount`, `dismount`, `overrides`, `mounted`,
`squads.corrupt`, `squads.uncorrupt`; machine fields `overridden`, `corrupted`, `mountedBy`;
events `machine-overridden`, `player-mounted`, `player-dismounted`, `machine-corrupted`,
`machine-uncorrupted`, `override-node`, `cauldron-override`.

### Kind module (`src/instruments/kinds/<id>.js`, default export)

```
{ id, Cls, spec: { url, targetHeight, yaw, shadowPolicy? },
  onEntry?(entry), style?, role?, fixture?,
  tables?: { perception?, engage?, attacks?, attackMode?, react?, elem?, alarm?, escort?, scavenger? },
  rig?, doctrine?: { body?, chassis?, components?(m), herd?, reband?: { part: [lo, hi] }, install?(m, opts), spawn?: [ { n, x, z, route, poi, herd?, basking?, convoy?, escort?, routePoints?, territory? } ] },
  audio?: { set, mass } }
```
A file in `kinds/` whose default export has no `id` is ignored (helpers may live beside a kind).

### Registrars (kept files, my grant)

```
ai/tables.js     registerKindTables(kind, rows, { replace = false } = {}) -> string[]   (blocks written; drops the kind's cfg() memo)
                 unregisterKindTables(kind) -> boolean
                 registeredKindTables() -> string[]
ai/doctrine.js   registerDoctrine(kind, row, { replace = false } = {}) -> boolean
                 unregisterDoctrine(kind) -> boolean
                 doctrineKinds() -> string[]
                 rebandMachine(m, band, archetype = null) -> boolean
                 CHASSIS, BODY, SPAWN_PLAN (filled by registration)
                 installDoctrine(m, opts), installExpansionDoctrine(machines), spawnExpansion(machines),
                 siteAnchor(ctx, plan), doctrineAudit(machines)          (unchanged shapes)
autorig.js       RIGS; registerRig(kind, spec, { replace = false } = {}) -> boolean; unregisterRig(kind) -> boolean
variety-assets.js loadKindModels(ctx, rows, { onLoaded, onProgress }) -> Promise<{ loaded: string[], failed: string[] }>
                 (a model already in ctx.assets.models is styled and handed to onLoaded BEFORE the call returns)
                 styleMachine(root, style); freezeSkins(root) -> number; MACHINE_SHADOWS
machine.js       MACHINE_STATES (frozen, 9 states); setState refuses any other name
registry.js      installInstruments(machines) -> { kinds: string[], roles, ready: Promise<{ loaded, failed }> }
roles.js         ROLE_IDS, ROLE_PLAN, FORBIDDEN_ROLE_ID, buildRoles(descriptors) -> { roles, notes }
legacy.js        LEGACY, LEGACY_KINDS,
                 BOOT_SPECS   { kind: { url, targetHeight, yaw, shadowPolicy } }   boot rows (registerAt 'boot')
                 LEGACY_SPECS { kind: { url, targetHeight, yaw, shadowPolicy } }   deferred rows (registerAt 'loaded')
                 installLegacy(machines) -> { kinds: string[], boot: string[], ready: Promise<{ loaded, failed }> }
                 spawnLegacyRoster(machines) -> number   (each kind's roster at most once per manager)
lib/generated.js liftExtras(entry); seedAuthoredWeights(machine) -> number; weightAudit(machine) -> { verts, wrongDominant, legBodyCross, blendedVerts, rigidPct }
```

**For pipeline (`assets.specs` contract):** `legacy.js` publishes the two row sets your
data-driven `assets.js` reads (names as in your branch): `BOOT_SPECS` — strider, scrapper,
glinthawk, longleg — which `loadAll` must load before `Machines` is built (your `legacyRows().boot`
does), and `LEGACY_SPECS` — the 7 Round-4 kinds — which stay deferred (`installLegacy` loads them;
you only list them). Rows carry `shadowPolicy: MACHINE_SHADOWS`, so an entry normalises the same
whichever loader fetched it, and `loadKindModels` styles a pre-loaded entry exactly once
(`entry.styledKind`). Nothing in machines reads `assets.models.{watcher,sawtooth,behemoth,thunderjaw,npc}`.
Until your loader is merged, `legacy.js` carries a merge-order bridge (FIX ROUND 1 §3) that is
inert against a loader exposing `assets.specs`.

---

## Gates (port 5254, this tree)

Fix-round-2 runs on the final code, Oct 16 2026 from 04:42. Reports archived in
`scratchpad/r5/instruments-core/work/fix2/report-{lane,global}.json` (fix round 1 in `work/fix1/`,
the first round in `work/{lane-report-final,global-report-final}.json`).

### This lane's W0a block — `--lane instruments-core`: **5 / 5 PASS, + the `A-boot-roster` guard PASS**

| gate | verdict | measured |
|---|---|---|
| `A-legacy-collapse` (runner) | **PASS** (167 s) | static: 11 legacy kinds / 11 legacy modules, 0 IP kind files, 0 imports of a deleted file, **0 stray imports** of a legacy module outside legacy files, **0 kind rows** in 14 kept machine files (code scan, comments stripped), one door (`index.js` glob). Deletion probes in a scratch copy, 0 other edits: **scrapper** (row 61 lines + `scrapper.js` + `scrapper.glb`) A1 PASS, A20b PASS; **snapmaw** (row 85 lines + `snapmaw.js` + `snapmaw.glb`) A1 PASS, A20b PASS; **the whole legacy set** (`legacy.js`, 2 legacy rig files, 11 species files, 11 models) A1 PASS, A20b PASS |
| `A-kind-registration` (runner) | **PASS** (62 s) | a new module `src/instruments/kinds/zz-icprobe.js` dropped into a copy (the only difference from this tree): copy boots clean (A1, A20b PASS); kind `icprobe` registered, model loaded, `perceptionCfg.gain` 1.234 (own) with `d0`/`tick` from default, `engageCfg.band` [5.1, 13.3] (own) with `hyst` from default, `reactCfg` all default, 2 attacks, mode `table`, elem 77, audio set `icprobe`, 1 spawn row, **1 live at boot**, `isLegacyKind` false, role null. The Tiller fixture in the same page: 4 attacks, elem 110, 3 live, role `herd` |
| `A-no-override` | **PASS** (14 s) | `ai/override.js` absent; **140** `src/**` files (133 `.js` + 7 `.css`): **0** raw-text hits of the §9 regex, comments included, **no allowlist** (fix round 2); 0 hits in comment-stripped code; **0** mechanic identifiers (`OverrideSystem`, `canOverride`, `mountedBy`, `machines.mount`, …); removal-only **14/14** deletions-only vs `9d3b891` (`playerAnimator.js` 170 chars, `menu.js` 14); live: `tables.OVERRIDE` undefined, `overrideCfg` undefined, `EYE_COLORS.override` absent, `_stateOverridden` undefined, 0 of `override/canOverride/mount/dismount/overrides/mounted` on the manager, `MACHINE_STATES` = 9 states; all 12 spawnable kinds asked for 12 states incl. `overridden`/`ally`/`mount`/`mounted` → **0** forbidden states reached. Negative controls (static half): the 3 old comment lines restored → `rawHits` 3; an `override-node` line in `style.css` → `rawHits` 1 |
| `A-no-corruption` | **PASS** (606 s) | 0 code hits of `_updateCorruption` / `corrupt` / `uncorrupt` / `ECOSYSTEM.corruption` / `corrupted` / `_corruptor` / corruption events in 133 files; `ECOSYSTEM.corruption` absent, `squads.{corrupt,uncorrupt,_updateCorruption}` absent; staged Corruptor + strider, scrapper, glinthawk, longleg, broadhead, grazer within 9 m, fight held for **600 s**, 2,359 samples of every machine: **0** `corrupted === true`, 0 `_corruptor`, 0 corruption events, up to 8 machines engaged at once |
| `A-roles-published` | **PASS** (6 s) | 12 roles exactly; `herd` → `tiller` (R28 fixture note), 11 null each with an R18 note naming kind, lane and wave; 0 legacy kinds mapped; 0 forbidden role ids; staging `roles.herd` spawns a `tiller` (modelKind `tiller`, non-legacy). **Not graded:** the gate-roster clause (gap 1) |
| `A-boot-roster` (lane guard, fix round 1) | **PASS** (6 s; 3/3 runs in fix round 1, 1/1 in fix round 2) | READY at 4.1–4.5 s after navigation (3.6 s in fix round 2, same 14 / 6-3-3-2, wrapper at READY, `hookTries` 0); at READY **14 alive** = `bootAudit.boot.roster` (strider 6, scrapper 3, glinthawk 3, longleg 2), all 4 boot models loaded, wrapper installed, `hookTries` 0; deferred half +0.69 / +0.73 / +0.79 s: expansion 14, Tiller herd 3, total 28, boot roster not re-spawned. Negative control (bridge off): FAIL, 0 alive at READY |

### Global green list items that exist today (this tree, port 5254)

Fix-round-2 run, 04:57–05:07, two other lanes' Chromes (5250, 5255) alive; load average 4.08 / 3.90 / 3.94 (1 / 5 / 15 min) when it ended.

| gate | verdict | measured |
|---|---|---|
| `A1-boot-clean` | **PASS** | `state=playing`, 0 console errors |
| `A20b-no-system-errors` | **PASS** | 0 system errors, 0 hook errors, 221 frames |
| `A90-memory-stability` | **PASS** | 28 kills; heap **−9.6 %** (bar < 25 %), geometries **+9** (≤ 40), textures **−28** (≤ 8), scene objects **−1,096** (≤ 60) |
| `A90-memory-stability-expansion` | **PASS** | objGrowth −1,059, nonMachineGrowth **0**, orphan roots 0, geo +3, heap −3.5 %; population budget 1,600 nodes, bootNodes 1,250, not over budget |
| `A90b-memory-attribution` | **PASS** | 0 offenders, 0 orphaned textures, post-GC heap −4.1 % |
| `A90-rig-reclaim` | **PASS** (1 run; 5/5 is the W0b bar) | 30 cycles over 12 kinds incl. the Tiller: geometries **+7** (≤ 40), textures **0** (≤ 30); per live machine (8 striders) geo **0**, tex **0.38** (≤ 1 each); held-then-released 0 / 0 |
| `A9-perf-budget` | gate printed **FAIL** on the fps term; by **R26 it is PENDING** (load average ≈ 4, R26's quiet box is < 3) | draws **309** (< 350, PASS; base 319); fps 36.6, scene GPU 58.8 ms; the gate's own null-frame probe read 1.52 ms at that instant, so its attribution called the box quiet while the load average said otherwise. **Interleaved A/B, base `9d3b891` vs this tree, same minutes (05:08–05:11, load 3.2–6.3), 3 rounds:** base 23.8 / 27.6 / 27.4 fps, tree 27.2 / 27.9 / 38.3 fps (median 27.4 vs 27.9), all six PENDING (null frame 4.3–6.6 ms GPU); draws 319 vs 309. Fix round 2 changed comments only (esbuild output of both `src` files identical), so it cannot move fps; the quiet-box run belongs to the orchestrator (R26) |
| `A21-real-draw-calls` | **PENDING** | draws 309 / 195 / 325 (≤ 350, PASS), triangles 4.12 / 3.67 / 4.25 M (≤ 6.5 M, PASS); GPU and p95 terms not attributable (null frame 6.0 ms GPU). Its staged fight still asks for deleted kinds by name, so it stages fewer machines (gates-perf re-casts it by role) |

Not in this tree yet (other lanes' W0a/W0b gates): `A90-abs`, `A-alloc-rate`, `A-vram-ledger`,
`A-ID-ip-assets-gone`, `A-licence-manifest`, `A-assets-tracked`, `A-no-horizon-terms-player`,
`A-no-horizon-terms-code`, `A-reach-all-sites`, `A-port-guard`, `A-carried-suite`.

### Other checks run here
- brand's W0-day1 block on this tree: `A-identifiers-renamed`, `A-single-rest`, `A-storage-keys`,
  `A-storage-keys-reload` PASS; `A-extent-refactor` FAILs on `colliders` / `navCostHash` only — the
  Override Node pillar R17 removes (see brand, below). All 10 extents and the 20-query path hash
  are identical.
- Two frames of the Tiller herd at boot (`shots/gates/FILM-tiller-{side,herd}.png`, gitignored,
  read by me): the glazed hull, oxblood bands, six stilt legs and front drum render in the old
  valley meadow; a sanity check only — this block has no V gate and the fixture's fidelity is
  instruments-a's W1 work.

---

## Honest gaps

1. **`A-roles-published` is not fully graded.** Its "`tools/gate-roster.mjs` resolves every role"
   clause needs gates-perf's file, which does not exist in this tree; the gate passes on the shape,
   live-kind and R28 clauses and says so in its detail. It must be re-graded once gate-roster lands.
2. **The Tiller model is untracked.** The fixture loads `/models/r5-poc/tiller.glb`, the POC
   generator's output, which is in the main tree but gitignored (`*.glb`). For testing I copied it
   byte-identical from main (sha256 `5900d51e…9c661b53`) into this tree; it is NOT part of the
   branch. On a clone without it the kind fails to load (one `console.warn`), is never spawned, and
   `roles.herd` falls back to null with an R18 note — no console error. When pipeline promotes the
   generator (W0b) `spec.url` in `src/instruments/kinds/tiller.js` moves to its output (one line).
   The GLB carries `extras.r5Generator.licence` but no `extras.provenance` (pipeline's
   `A-ID-ip-assets-gone` / manifest).
3. **Closed in fix round 2.** The three prose comments that kept the English word are deleted and
   `A-no-override` has no allowlist; 0 raw hits in `src/**`. The cost is two shorter comment
   headlines in `playerAnimator.js` (the "tried and reverted" remark is gone; the measurement that
   proves it stays) — deletion was the only edit the removal-only grant allows.
4. **Removal-only leaves two stale counts in prose**: progression.js still says "Six new quests"
   (five listed) and "FOUR NEW OBJECTIVE TYPES" (three remain). Rewording needs an insertion.
5. **Lamp colours are half-done.** The fixture's calm lamp is the bible's `#F2EAD3`; wary and
   hostile still come from `EYE_COLORS` (canon amber/red) until `LAMP_STATES` (W0b).
6. **`A-no-corruption` has no negative control** (the deleted cascade cannot be re-run); its staging
   reproduces the old trigger condition (Corruptor in a fight with 6 other kinds inside 9 m, 25 m
   was the old radius, 4 s period) for 600 s.
7. **A9's fps half is unresolved on this box.** The first run read FAIL (32.9 fps, scene GPU 49 ms)
   while two other lanes' Chromes were rendering. Interleaved A/B on the base commit vs this tree,
   same minutes, load 4.7–8.2: base 22.9 / 24.4 fps (GPU 98.4 / 90.0 ms), this tree 33.6 / 25.0
   fps (68.6 / 86.5 ms), all four PENDING (null frame 6–7 ms GPU); draws 319 base vs 309 here. Not
   a regression; the R26 quiet-box run belongs to the orchestrator. Fix round 2: the global run's A9
   printed FAIL (36.6 fps; the null-frame probe read 1.52 ms at that instant) at load average ≈ 4,
   which R26 grades PENDING; a 3-round interleaved A/B right after gave base 23.8 / 27.6 / 27.4 fps
   vs this tree 27.2 / 27.9 / 38.3, all PENDING. `tools/gates.config.mjs` (gates-perf's) grades
   attribution by the null frame only and does not read the load average R26 names; gates-perf may
   want to add that term.
8. **The Round-4 per-kind machine gates** (`machine-ai`, `machine-rig`, `machines-expansion` lane
   files) were not re-run: they stage deleted kinds by name and are being re-staged by gates-perf
   into the carried suite / kind block. The legacy roster was exercised by the two A-legacy-collapse
   deletion probes, the whole-set probe, A1, A20b and the four A90 gates.
9. **Boot roster (fix round 1): the contract is base's again, with one difference in WHICH
   machines exist at `__READY__`.** Base had 8 IP machines there; now there are the 14 Round-3
   machines. The Round-4 kinds and the Tiller still arrive with `varietyReady` / `expansionReady`
   (0.7–1.0 s after READY here), as base's deferred kinds did. Two consequences others must know:
   (a) **at the W2 exit**, when instruments-b deletes `legacy.js`, the boot roster is empty again
   unless an Instrument kind by then has a boot row (pipeline's `assets.specs.js`) AND its spawn
   rows run in the constructor (today `spawnExpansion` is deferred-only). `A-boot-roster` will FAIL
   at that point by design, so the regression cannot pass unnoticed. (b) The merge-order bridge in
   `legacy.js` wraps `Assets.prototype.loadAll` from outside pipeline's file; it is inert against
   pipeline's loader, but it is still a runtime wrapper of another lane's class, and it should be
   deleted once both branches are on main (deleting 44 lines of `legacy.js`, plus its `Assets` import).
10. **The scratch-copy probes need the lane port.** They stop the lane's own Vite (only one whose
    cwd is this tree), run, and restart it; anything else on the port makes them PENDING.
11. **Fixture details that belong to later lanes:** loot uses today's item ids (`metal-shards`,
    `wire`; combat-kit renames in W2); its audio falls back to the default voice set until the audio
    lane builds `tiller` (W3).
12. **W0b items not started:** `LAMP_STATES` + beams (`A-lamp-states`, `A-lamp-canon-distance`,
    `A-beams-one-draw`), perception weather + perk hooks (`A-perception-weather`, `A-perk-hooks`;
    the §3.2 perk-hook stubs are due on W0b day 1), `uv1` through the fold, VFX palette,
    `A90-rig-reclaim` 5/5 (1/1 PASS today), `tools/gates.r5.kind-block.mjs`.
13. **`A-no-corruption`'s static half is a code scan, by the wording of its bar** (found while
    fixing round 2, not a judge finding). §9 words it as "`_updateCorruption`, `corrupt`,
    `uncorrupt` and `ECOSYSTEM.corruption` absent" (the mechanic's identifiers), not as a
    `src/**` regex count like `A-no-override`, so the gate scans code + strings with comments
    stripped: 0 hits. A raw `grep -rnE '_updateCorruption|\bcorrupt\b|\buncorrupt\b|ECOSYSTEM\.corruption' src/`
    finds 2 comment lines that use the English word for damaged data, both outside my grant:
    `src/ui/settings.js:193` ("corrupt payload: defaults stand") and `src/audio/bank.js:14`
    ("a missing or corrupt file"). If the orchestrator reads that bar as raw text too, those two
    comments need an owner (`settings.js` is shell-ui's from W2; §2 names no owner for
    `audio/bank.js`) or a ruling; I did not edit them.

---

## What another lane or the orchestrator must do

**Orchestrator**
- Merge this lane before hero-body and brand touch `playerAnimator.js` / `menu.js` in W0b (plan
  §3.1). `A-no-override`'s removal-only clause then proves the W0a version on the first commit after
  `9d3b891` that touched each file, so later edits by those lanes do not fail it.
- Run this block alone (`--lane instruments-core`): the two runner probes go first, before the
  harness opens its own Chrome, so the run never holds two Chromes. On the main tree set
  `R5_SCRATCH` (default there is `$TMPDIR/r5-ic-probe-<port>`; in a lane tree it is
  `<tree>/../ic-probe-<port>`). The copies are a few MB and deleted after each probe.
- The full Round-4 suite still names deleted content (list under gates-perf below); expect those
  FAILs until the carried suite replaces them.
- Fix round 1: no ruling is needed — the boot contract is kept on the lane side (machines exist at
  `__READY__`, progression's wrapper installs at construction). After both W0a branches are merged,
  delete the `legacy.js` merge-order bridge (it is inert then) and re-run `A-boot-roster` on main.
  Carry `A-boot-roster` into the W2 exit: deleting `legacy.js` empties the boot roster unless an
  Instrument kind has a boot row and constructor-time spawn by then (gap 9a).

**pipeline** — delete `SPECS.{watcher,sawtooth,behemoth,thunderjaw,npc}` and their GLBs (R30); this
lane no longer reads `assets.models` for them. `legacy.js` now exports **non-empty `BOOT_SPECS`**
(strider, scrapper, glinthawk, longleg, with `shadowPolicy`), which your `legacyRows().boot` merges
into `assets.specs` and `loadAll` loads — your docs say "none today", and your lane guard
`A-pipeline-boot-rows` should expect 6 boot rows after the merge, not 2. Those four files are
tracked and already carry your provenance stamp. `LEGACY_SPECS` is now the 7 deferred Round-4 rows
only. Tell this lane the promoted Tiller output path; add `extras.provenance` to generated GLBs.

**gates-perf** — `ctx.machines.roles` / `roleNotes` / `roleIds` / `roleOf` / `isLegacyKind` are the
shape `tools/gate-roster.mjs` should resolve. Round-4 gates that exercise deleted content:
`A66-quest-objectives-expansion` (lists and walks the deleted `side-cauldron-override` quest) and
`A65-save-restore-expansion` (override tally type gone), `A100-expansion-doctrine` (DIES), and
every gate that stages `watcher` / `sawtooth` / `behemoth` / `thunderjaw` / `redeye` / `tallneck`
by name (`budgets.mjs` staged-fight order, the A90 loop's `spawn('watcher')`, which now returns null
with a console.warn and still PASSes). Fix round 1 measured two of them on this tree:
`A62-focus-components` prefers `sawtooth` and falls back to `list[0]`, now a strider with 2
components against its bar of 3 (FAIL); re-stage it on a kind with ≥ 3 components.
`A64c-silent-apex` FAILs "no Thunderjaw in the scene". Both are R30 staging, not timing; the
judge's waited runs on the pre-fix tree gave the same verdicts. `A31b` / `A31f` choose their hill by
"steepest clear face", and R30 changed which face that is (FIX ROUND 1); pin the site through
`gate-places` when you re-stage them.

**brand** — `A-extent-refactor` now FAILs on two of its own stricter terms: `colliders` 4825 vs the
recorded 4826 and `navCostHash` `e18558a5` vs `92662038`. Both are the Override Node pillar
(`activities.js`) that R17 removes — one static collider and the nav cells under it. All 10 extents
are identical, and so is the 20-query **path hash** (`66a0055d`, the plan's literal clause).
Re-baseline those two terms after this merge. `A-identifiers-renamed`, `A-single-rest`,
`A-storage-keys`, `A-storage-keys-reload` PASS on this tree. `menu.js:787` lost " is overridden"
(fix round 2, comment only); if you want the sentence fuller in W0b, reword it without
`overridden` / `OVERRIDE` — `A-no-override` now greps raw `src/**` with no allowlist.

**hero-body** — `player.mounted` / `mountSeat` no longer exist (nothing sets them). Fix round 2
deleted the English-word "OVERRIDE" from two foot-lock comments in `playerAnimator.js` (the
`_stanceStep` live-test note and the `_tryStep` URGENT headline, now "THE DRIFT BAR GUARANTEE.");
no code changed.

**every lane that edits `src/`** — `A-no-override` is on the global list and now greps the raw text
of every file under `src/` (comments, strings, CSS) with the §9 regex and no allowlist. Lower-case
"override" is fine (`GROUNDED_OVERRIDE`, override channels — `\bOVERRIDE\b` does not match inside
`GROUNDED_OVERRIDE`); the words `overridden` and upper-case `OVERRIDE` anywhere in `src/` fail it.

**instruments-a (W1)** — `src/instruments/kinds/tiller.js` is yours from W1 day 1. Its weak point is
named `lamp` (was `lantern` in the POC). The kind-module contract is above; a module dropped into
`kinds/` registers with no other edit (proved by `A-kind-registration`).

**instruments-b (W2 exit)** — `A-legacy-gone` is already proved in shape: deleting `legacy.js`,
`rig/shells-expansion.js`, `rig/rigs-expansion.js`, the 11 species files and the 11 legacy models
boots clean (A-legacy-collapse's whole-set probe). `index.js` reaches `legacy.js` through a guarded
glob, so no other file needs an edit.

**combat-kit (W2)** — `src/items/tools.js:91` still checks `ctx.machines.mounted` /
`ctx.player.mounted` (always undefined now).

**shell-ui (W2)** — `src/ui/map.js` still lists an `override` site kind (none exist now);
`src/ui/hud.js` quest rows ask for Watcher/Sawtooth/Behemoth/Thunderjaw kills (no such kinds).

**progression (W3)** — first-hour quests that kill/scan a Watcher or the Thunderjaw cannot complete
until rewritten; the `override` tally type and `side-cauldron-override` are gone; `docs/SPEC.md:983`
still lists `override-node` (core-platform's doc).

**audio (W3)** — `audio.js` `SPECIES` still lists the deleted kinds; unknown kinds (the Tiller) fall
back to the default voice set.

**world-props (W1)** — `activities.revealList()` and `props.revealed` lost their only writer; the
cauldron terminal mesh is now an inert prop.
