# ROUND 4 — `progression` lane API

Contract doc for the lanes that consume this one (`shell-hud`, `shell-menus`,
`focus-items`, `combat`, `machine-ai`). Source of truth is the header of
`src/core/progression.js`; this file is the short version plus the integration
line `core-platform` still owes us.

---

## 0. Integration — LANDED

`core-platform` has added the line, so the lane is live in a normal session:

```js
// src/main.js:19
import { installProgression } from './core/progression.js';
// src/main.js:118, after ctx.interactables, before ctx.audio/ctx.hud:
installProgression(ctx);        // idempotent; publishes ctx.progression
```

Verified on a plain `?shot=1` boot (`shots/prog-fix1-boot.png`):
`ctx.progression` is defined, `progression` is in the ctx key list, and
`game.systems` reads `… Interactables, Progression, GameAudio, HUD, Studio`.

> **Fix round 1.** Before that line landed this lane was dead code and its four
> gates brought it up themselves — the harness supplying an integration the
> product did not have. That is now inverted: `UP` in
> `tools/gates.round4.progression.mjs` records whether `ctx.progression` and the
> registered `Progression` system existed **before** the gate touched anything,
> and every gate FAILS if they did not. `installProgression` is still called,
> but only as an idempotent handle on the live instance.

`installProgression` pushes itself onto `ctx.game.systems`, so `update(dt, t)`
runs inside the guarded fixed-step loop like any other system.

---

## 1. `ctx.progression`

### level / XP
| member | meaning |
|---|---|
| `level` `xp` `totalXp` `xpIntoLevel` `xpToNext` | current standing; `xpToNext` is `Infinity` at `MAX_LEVEL` (20) |
| `skillPoints` `spentPoints` | unspent / spent |
| `addXp(n, reason, meta?)` → granted | the ONLY way XP enters; `reason:'kill'` applies the difficulty multiplier |
| `xpForKill(machine)` | `f(machine.level)` — Watcher 65, Thunderjaw 707 |
| `award({xp, reason, id, once?})` → granted | **world content.** Routes to `addXp(xp, reason, {id})`, de-duplicated on `reason:id`. Positional `award(25,'datapoint',id)` works too. |
| `discover(id, {label?, xp?}?)` → bool | idempotent ledger: emits `discovery {id,label,place,total}` **once per id, ever**. Pays no XP unless asked. |
| `hasDiscovered(id)` · `discoveries()` | what this run has logged (Notebook / world map) |

Level-up grants `+1` skill point and `+15` max health and heals to full.

> **FIX ROUND 2 — `award()` / `discover()` are published.** Eight live call
> sites in `world-props` and `fauna` were already written against this shape
> (`docs/ROUND4-WORLD-PROPS.md:106`): `activities.js:439/440` (discover + 25 XP
> per datapoint × 24), `:524` (15 × 6 caches), `:541/542` (150 + `discover`),
> `:562` (hunting ground), `fauna.js:624` (20/12 per kill). Optional chaining
> meant nothing threw — it just paid **0**, losing 840 XP of pickups plus every
> fauna kill against a main chain worth 1400.
>
> The DISCOVERED banner is reserved for ids that name a **place** — the
> `PLACE_NAMES` map (`tallneck`, `hunting-ground-valley`) or an explicit
> `discover(id, { label })`. The other live caller is the 24 `dp-*` records, and
> `focus-items` already renders a DATAPOINT card off `datapoint-collected`; a
> second overlay reading "DISCOVERED · DP SPAN 1" would announce one pickup
> twice, in slug case. Those still enter the ledger and still raise `discovery`
> (with `place:false`), so a Notebook or world map can count them.
>
> De-duplication is on `reason:id`, not on `id`, because the callers differ:
> an interactable is one-shot, while `fauna.js` passes the **species** key, so
> `hunt` (and `kill`/`combat`/`trial`/`bonus` — `AWARD_REPEATABLE`) pays every
> time. `once: true|false` overrides per call. Both ledgers are serialized
> (`awarded` / `discovered`) and cleared by `newGame()`, so a reload cannot
> re-farm a pickup; `audit()` reports both.

### skills
| member | meaning |
|---|---|
| `has(id)` | boolean — the check every hook should make |
| `mult(key)` | number, never NaN. Keys: `silentStrikeDamage` `detectionRate` `noiseRadius` `tearOut` `damageOut` `damageIn` `concentrationDuration` `herbPotency` `lootYield` `gatherYield` `pouchBonus` `deathPouchKeep` |
| `skillTree()` | 12 nodes with `unlocked` / `available` |
| `canUnlock(id)` → `{ok, reason}` · `unlock(id)` | |

Difficulty is folded into the SAME `mult()` channels, so a consumer reads one
number and gets both.

### quests
`quests.all() / active() / completed() / offered() / byId(id) / def(id) /
start(id) / complete(id) / abandon(id) / track(id) / tracked / progress(id)`

`state(id)` returns `{ id, title, type, giver, summary, rewards, status,
objectives[{id,type,label,have,need,done}], current, progress, tracked }`.
Objective types: `talk | goto | scan | kill | gather | datapoint | cache |
override | hunt`, completed **in order** —
but credit is **never thrown away**. Every scan/kill/talk is counted into a run
tally the moment it happens whatever objective is current, every unfinished
`goto` is proximity-tested (not just the current one), and an objective settles
against that tally the instant it becomes current, with the same
`quest-objective` event and OBJECTIVE COMPLETE banner it would have had live.
So Focus-tagging the Watcher while Varl is still talking counts — which matters
because `FocusSystem.tagTarget()` is a toggle and "just scan it again" removes
the marker and emits nothing. Per-quest baselines are snapshotted at
`startQuest`, so accepting a quest after a long hunt does not auto-complete it.

`gather` is baselined the same way — Aloy starts with 20 ridge-wood, and the
tutorial's "Gather Ridge-Wood for arrows" has to be *earned* or the step that
teaches picking things up ticks itself off. An objective that should count what
you are already carrying opts in with `fromStock: true` (the two hand-it-over
bounties, `side-herbalists-debt` and `side-lens-trade`, do).

`getMarkers()` → `[{ x, y, z, label, questId, objectiveId, kind, tracked,
radius, npc }]` — one row per active quest's CURRENT objective. This is what the
compass and the world map should draw. Consumers may hold the array (it is
reused in place) but must not cache the coordinates.

> **EXPANSION FIX ROUND 1 — `talk` rows resolve LIVE, on read.** The list is
> rebuilt only when `_markersDirty`, and nothing sets that flag on a timer. That
> is correct for `goto`/`datapoint`/`cache`/`override`, which resolve through
> the static `ctx.props.sites()` registry — but this lane put four `talk`
> objectives on the roving Nora (`maris` `aura` `vala` `thok`) and `npc` walks
> them around camp (max roam measured over 70 s: `sona` 21.7 m, `renn` 18.0 m,
> `olin` 17.7 m, `aura` 9.4 m). A baked anchor left the gold pip on the dirt the
> person had left — 7.8 m of error against the row's own `radius: 2.5`, so the
> player stood inside the marker ring with no TALK prompt. `getMarkers()` now
> re-reads `_npcPos(row.npc)` for `talk` rows on every call; the loop is skipped
> entirely by a counter when no `talk` objective is current, and it allocates
> nothing (it writes into the rows that already exist). `npc` is set only on
> `talk` rows — a consumer that wants the live anchor for any other objective
> should call `objectiveAnchor()` rather than re-deriving one.

`objectiveAnchor(questId, objectiveId?)` → `{ x, z, site, kind, objectiveId,
radius }` — where an objective actually points AFTER site resolution, always
computed fresh. The compass, the world map and the gates all need the same
answer and none of them should have to know that `at:{ site:'outpost' }`
resolves through `world-props`. Omit `objectiveId` for the quest's current
objective. Returns `null` when the anchor cannot be resolved.

### economy / NPC / difficulty / tiers
- `merchant.stock() price(id) sellPrice(id) sellable() buy(id,n) sell(id,n) shards()` — currency is the real `metal-shards` item.
- `talkTo(npcId) closeDialogue() dialogue` — `closeDialogue()`
  now takes the conversation panel down as well as clearing the flag; calling it
  directly used to leave `ctx.state === 'dialogue'`, which `main.js`'s `live`
  test excludes, i.e. it froze the simulation.
- **`NPCS` / `NPC_IDS` — the whole roster, not just Varl.** All thirteen of the
  `npc` lane's named Nora are registered (`docs/ROUND4-NPC.md` §3), each with
  its own greeting ladder and two "ask about…" topics. `ctx.npcs.talkTo(id)`
  opens a conversation for every one of them.

### dialogue (expansion round)
| member | meaning |
|---|---|
| `dialogueState(npcId = dialogue.npc)` | everything the card draws: `{ id, name, title, line, topic, talked, choices[] }`. `line` is the current greeting, replaced by a topic answer while one is open. Returns `null` for an unknown id. |
| `choices[]` | `{ id, kind, label, hint, questId?, topicId? }`, 2–3 of them, HZD's priority order: report-in → offer → unheard topic → journal, `leave` **always last**. `kind` ∈ `quest-turnin \| quest-accept \| topic \| journal \| trade \| leave`. A **merchant** always keeps the `trade` row. |
| `choose(choiceId)` → `{ state, closed, action, turnIn? }` | the ONLY place a choice has consequences. `action` ∈ `'trade' \| 'journal' \| null` is what the caller should open on the way out; `turnIn` names the quest a `quest-turnin` choice closed. |
| `timesTalked(npcId)` → int | conversations this run; drives which greeting shows |

`src/ui/dialogue.js` holds **no rules** — it renders `dialogueState()` and calls
`choose()` back. Any other front-end (a wheel, a controller binding, a gate) can
drive the same two calls; `choose()` re-renders the live card itself.

### site anchors, timed trials, per-site respawn (expansion round)
Six side quests (`side-hunting-trial` `side-cauldron-override`
`side-outpost-supply` `side-lakeshore-fisher` `side-cave-datapoints`
`side-wreck-salvage`) are anchored at `ctx.props.sites()` **by kind** through
`at:{ site, alt? }`, with the authored `x/z` kept as the fallback for a build
where that site kind does not exist. Neither lane edits the other.

| member | meaning |
|---|---|
| `trialState(questId, objectiveId?)` → `{ questId, objectiveId, within, running, left, have, need }` | a `within:` (timed) objective. `left` is **seconds remaining**, `null` when the window is not open. Omit `objectiveId` for the quest's first unfinished timed objective; `null` when the quest has none. |
| `restartTrial(groundId?)` → int | run the trial again from zero; returns how many windows it reopened. Already wired to the `hunting-ground` event, so the player walking back into the ring restarts it. |
| `respawnPolicy(site)` → `{ cls, why, delay, lo, hi }` | which window a `machines.sites` record should repopulate on. `cls` ∈ `trial \| quest \| small \| medium \| large`. |
| `SITE_RESPAWN` | the table: `trial [90,150]` · `quest [120,180]` · `small [240,330]` · `medium [330,450]` · `large [420,540]` seconds. |
| `TALLY_TYPES` | `['kill','scan','talk','datapoint','cache','override','hunt']` — the run-tally buckets, and what a save carries. |

A trial ring inside 70 m of the hunting ground repopulates in 90–150 s so the
trial is re-runnable; a site whose kind an active quest is asking for gets
120–180 s. The policy is applied by re-timing the **published** `site.respawnAt`
field on `machine-disposed`, never slower than the stock window — no edit to
`machine-ai`'s files or to `ai/tables.js`.
- `difficulty` `difficultyDef` `setDifficulty(id)` `DIFFICULTIES` (6 presets)
- `ammoUnlocked(id)` `tier(id)` `unlockedAmmo()` — `combat`/`wheel` gate ammo on these.

### save / death / victory
`save(reason)` `checkpoint(reason)` `hasSave()` `saveInfo()` `continueGame()`
`newGame(difficulty?)` `loadCheckpoint(reason)` `saves` (the `SaveSystem`)
`rest(toHour)` — campfire rest: advances `environment`, refills, saves.

`saveInfo()` is the cheap header a title screen needs:
`{ savedAt, reason, level, quest, hour, difficulty, machines }`.

### UI entry points and diagnostics
`openQuestLog() openSkills() openTrade() openCampfire()` · `audit()` returns one
object with everything a gate reads (including `emitFaults`, see §3).

---

## 2. Events (all additive)

`xp-gained {amount,total,level,reason,machine}` ·
`level-up {level,skillPoints,maxHealth,gainedHealth}` ·
`skill-unlocked {id,name,tree}` ·
`quest-started {id,title,type}` ·
`quest-objective {questId,objectiveId,label,have,need,done,trial?}` — `trial` is
present only on a TIMED objective and is `'start' | 'restart' | 'lapsed'`, i.e.
the window opened/reopened/ran out and `have` was reset; a consumer that only
reads `have/need/done` is unaffected ·
`quest-complete {id,title,rewards}` · `quest-tracked {id,title}` ·
`objective-changed {title,detail}` (legacy SPEC event, still emitted) ·
`banner {title,detail,kind}` — `kind` ∈ `info|level|skill|quest|quest-done|objective|save|death|victory`.
**`shell-hud` should render these and this lane's own strip can then be retired.** ·
`discovery {id,label,place,total}` — raised once per id by `discover()`; this is
the feed a Notebook or world-map "places found" list should read (`place:true`
rows are the ones that also bannered) ·
`difficulty-changed` · `trade-buy` / `trade-sell` ·
`dialogue-open {npc,name,times}` — `name` is the person's display name and
`times` the conversation count, both added this round so a caption or an audio
cue does not have to look the roster up ·
`dialogue-topic {npc,topic}` — **new**: an "ask about…" answer is now showing;
raised once per choice (the first time per `npc:topic` also pays 10 XP through
`award()`, so it cannot be farmed) ·
`dialogue-close {npc}` · `checkpoint-loaded {reason,killer}` ·
`victory-resume {}` — **`shell-menus` takes the endgame card here**; this lane
clears `ctx.state === 'victory'` itself only while `ctx.menus` does not exist ·
`save-written` / `save-loaded` / `save-error`.

### Objective types → the events that credit them (expansion round)

Four new types, none of them a new event: each rides a channel another lane was
already emitting, so no lane had to change a line to make the side quests
completable.

| type | credited by | emitter |
|---|---|---|
| `datapoint` | `datapoint-collected {id}` | `src/items/datapoints.js` |
| `cache` | `supply-cache {id,site}` | `src/world/props/activities.js` |
| `override` | `override-node {id,site}` | `src/world/props/activities.js` |
| `hunt` | `fauna-killed {species}` | `src/world/fauna.js` |

(The pre-existing four are unchanged: `kill` ← `machine-killed`, `scan` ←
`focus-tag`, `talk` ← `dialogue-close`, `gather` ← `item-gained` + the 5 Hz
inventory sampler; `goto` is proximity-sampled.) A `kill` objective may also
carry `within: seconds`, which makes it a timed trial — see `trialState()`.

---

## 3. Requests to other lanes

> **Not a request: `award()` / `discover()`.** `world-props` and `fauna` were
> already calling them and this lane had not published them (§1, FIX ROUND 2).
> The fix is entirely inside `src/core/progression.js` — **no other lane needs
> to change a line**, and in particular nobody should be asked to swap those
> call sites for `addXp`. The shape in `docs/ROUND4-WORLD-PROPS.md:106` is now
> the shape this lane implements.

1. **`core-platform`** — the `installProgression(ctx)` line in §0.
2. **`core-platform`** (or whoever adopts `src/core/events.js`) — `emit()`
   (`src/core/events.js:14-18`) walks its subscriber set unguarded, so one
   throwing listener unwinds the emitter and silently skips every subscriber
   after it. Wrap the `for` body in try/catch. This lane emits from inside payout
   paths whose next statement is a quest step (`machine-killed` → XP → shards →
   `_advance('kill', …)`), so a stranger's exception can cost a quest objective.

   > **RETRACTION (fix round 1).** The previous version of this section attached
   > a live blocker to that request: that `playerAnimator.js` subscribed
   > `item-gained` → `_startAction` and `player-damage` → `_onDamage` with
   > neither method defined, that `inventory.add()` therefore threw on every
   > pickup, and that **the player took no damage at all**. That was **wrong**,
   > and it was filed against `player-anim` / `player-control`. Measured on this
   > tree (`shots/prog-fix1-faults.png`): `_startAction`
   > (`playerAnimator.js:608`), `_onDamage` (`:566`) and `_idleLife` (`:1506`)
   > are all defined; `ctx.inventory.add('ridge-wood', 2)` returns cleanly;
   > `emit('player-damage', {amount:7, from:{kind:'watcher'}})` takes health
   > 100 → 93 and sets `lastKiller` to `"Watcher"`; and
   > `progression.audit().emitFaults` after a kill + pickup + damage cycle is
   > `{}`. **No action is needed from `player-anim` or `player-control` on
   > account of this lane.** The `events.js` try/catch request above stands on
   > its own.

   The lane keeps its own belt (guarded emits and listeners, a 5 Hz inventory
   sampler) for the reasons in `_pollInventory`'s comment: `events.js` is still
   unguarded, and `_grant` re-entry / `SaveSystem.apply` / merchant refunds move
   items without emitting at all. `audit().emitFaults` counts anything swallowed
   and `A66` reports foreign throws by name, so the belt can never hide a defect.
3. **`player-control`** — read `ctx.progression?.mult('damageIn')` inside
   `player.takeDamage`, and `mult('pouchBonus')` into `maxPouch`. Until then this
   lane wraps both methods (original kept on `__hzcOriginal`; set
   `fn.__hzcNative = true` to retire the wrapper).
4. **`machine-ai`** — read `mult('damageOut')`, `mult('tearOut')` and
   `mult('silentStrikeDamage')` inside `Machine.takeDamage`, and
   `mult('noiseRadius')` in `machines.noise`. Same wrapper contract.

   > **RESIDUE ROUND — both damage channels.** `Machine.takeDamage` accepts the
   > round-1 `hit.baseDamage` channel, but only while `hit.impact` is
   > `undefined` (`machine.js:640`): that same branch is what derives
   > `tear = baseDamage * 0.35` and maps a legacy `type:'fire'|'shock'|'freeze'`
   > onto elemental buildup. The wrapper used to write
   > `impact: (hit.impact ?? 0) * dmg` unconditionally, which turned a legacy
   > `{ baseDamage }` hit into a **defined** `impact: 0` — so the compat branch
   > never ran and the hit landed for 0 damage, 0 tear and no element the moment
   > any multiplier left 1.0 (i.e. on every difficulty except Normal). The
   > wrapper now resolves the source channel first: a legacy hit is scaled
   > **through `baseDamage`** with `impact` left undefined (so machine.js still
   > owns the compat mapping) and only `tear` pinned, so `tearOut` applies
   > instead of `damageOut` leaking into it; a modern hit scales `impact` and
   > keeps `baseDamage` in sync with it. `A64b-damage-channels` locks all five
   > properties (non-zero, tracks `damageOut`, legacy/modern parity, tear rides
   > `tearOut` only, elemental mapping survives) and reproduces the defect
   > exactly when the old two-line copy is restored. Whoever lands the native
   > read must resolve the channel the same way.
   >
   > **Verified, not asserted (residue re-run).** The negative control was
   > actually run: with the pre-fix two-line copy back in place, `A64b` FAILs
   > with `legacyDamage 0 / legacyTear 0 / legacyFire 0` on both `easy` (1.25)
   > and `hard` (0.85) while the modern channel still reads 47.5 / 32.3 — the
   > defect, reproduced. Shipped code passes all five checks
   > (38 → 47.5 → 32.3, tear flat at 14, fire 66.7 at every difficulty). On
   > film at the judge's angle (`shots/prog-legacy-hard-bar.png` vs
   > `shots/prog-legacy-hard-PREFIX.png`): three LEGACY-shaped
   > `{ baseDamage: 14 }` hits on **Hard**, watcher at 10 m. Fixed build —
   > projected `WATCHER LV 5` bar down to ~62 %, damage numerals on screen,
   > 90 → 56.1 HP. Pre-fix build — same three hits, bar FULL, no numerals,
   > 90 → 90 HP.
5. **`focus-items`** — publish `items.serializeCapacities()` /
   `restoreCapacities(obj)` so purchased pocket capacities survive a save.
   `SaveSystem.apply` already clamps restored counts to `inventory.capacity(id)`.
6. **`combat`** — gate ammo on `progression.ammoUnlocked(id)` (`progression-005`).
7. **`shell-hud`** — the XP strip, banners and quest tracker this lane renders
   into `#hzc-prog` are a bridge, not a claim on the HUD. Render the events in
   §2 and call `progression.ui.dispose()`.
8. **`shell-hud` (expansion round) — draw the trial clock.** A `within:`
   objective is on a countdown the tracker does not show, so the hunting-ground
   trial currently reads like an ordinary "Kill 3 Scrappers" until it silently
   resets. In the objective row, when
   `progression.trialState(questId)?.running` is true, render
   `trialState().left` as `M:SS` beside the `have/need` counter (HZD puts it
   right there on the Hunting Ground banner) and flash it on the
   `quest-objective` events whose `trial` field is `'restart'` or `'lapsed'`.
   `left` is already rounded to 0.01 s and is `null` when no window is open, so
   the row costs one optional-chained call per frame. **No source change is
   needed in this lane** — this is a render the data is already published for.
9. **`shell-hud` / `shell-menus` — do not cache marker coordinates.**
   `getMarkers()` returns the same array object every call and resolves `talk`
   rows live on read (§1). `hud.js:1793` and `map.js:400` already re-read it per
   frame, which is correct; a future optimisation that snapshots `m.x/m.z` would
   re-introduce the stale-pip defect.

---

## 4. Gates

`tools/gates.round4.progression.mjs` — `A64-xp-loop`, `A65-save-restore`
(a literal `location.reload()` between save and Continue), `A66-quest-objectives`
(all five objective types on their real events), `A67-machine-respawn`, and the
residue-round regression gate `A64b-damage-channels` (the legacy `baseDamage`
channel under a non-1 `damageOut`).
Run: `node tools/gates.mjs --port 5213 --lane progression`.

### Expansion round — `tools/gates.round4.progression-expansion.mjs`

Lane `progression-expansion`, same port. **Gate ids**: the audit block names
`A66-quest-objectives` / `A65-save-restore`, but lane `progression` already owns
both with a different meaning, so they are registered here as
`A66-quest-objectives-expansion` and `A65-save-restore-expansion`. Neither
original is edited, weakened or re-run from this file. `A99-dialogue` and
`V45-dialogue-panel` were unclaimed and are kept verbatim.

| gate | what it measures |
|---|---|
| `A66-quest-objectives-expansion` | all six side quests completed through their REAL events (the datapoint's own `collect()`, the cache's registered `onInteract`, `fauna._kill`, a real `takeDamage` kill, `npcs.talkTo`), each anchored at a live `ctx.props` site, trial window semantics (opens, one kill credits one, re-entering the ring restarts it), per-quest XP + skill-point rewards, and — **fix round 1** — that the `talk` marker tracks Aura while she walks (passive over 6 simulated seconds and under a forced 7.2 m displacement, both within 0.05 m) |
| `A65-save-restore-expansion` | a literal `location.reload()` between save and Continue: quest counters, trial window (stored as seconds LEFT, so it survives a clock restarting at zero), conversation state and skills all come back |
| `A99-dialogue` | `talkTo` opens the card for every one of the thirteen NPCs, choices advance state, a topic answer replaces the line, merchants keep the TRADE row, ESC closes |
| `V45-dialogue-panel` | the card on film: tracked-caps name, title, quoted line, numbered choices, speaker still on screen |

Run: `node tools/gates.mjs --port 5213 --lane progression-expansion`.

All four now (a) fail unless `main.js` built the lane before the gate ran, and
(b) wait on **observables** (`until(...)`) or on **simulated** time
(`simWait(ctx, s)` — `ctx.engine.simTime`), never on wall-clock `sleep`. The old
A66 slept a fixed 700 ms after teleporting the player and expected the 5 Hz
`goto` sampler — which runs on the fixed-step `dt`, clamped to `MAX_STEPS = 3`
under load — to have fired; it passed alone and failed in the full suite.

A64 additionally covers **FIX ROUND 2**: it drives the shipped SUPPLY CACHE
`onInteract` (15 XP, then 0 on a second hold), a one-shot `datapoint` id, two
real `fauna._kill` calls of one species through `fauna.js:624` (20 + 20 — the
repeatable branch), and `discover()` on a place id (one event, one banner) plus
a `dp-*` id (one event, no banner). A65 now also asserts both ledgers survive
the literal `location.reload()`, so a save/load cycle is not an XP farm. A66
additionally drives the **scan out of order** (tag the Watcher while `talk` is
current, then toggle the marker off so nothing on screen can credit it) and
requires it to land anyway, plus asserts no duplicate `LEVEL` banner.
