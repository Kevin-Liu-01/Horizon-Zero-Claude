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
Objective types: `talk | goto | scan | kill | gather`, completed **in order** —
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
radius }]` — rebuilt only when dirty. This is what the compass and the world map
should draw.

### economy / NPC / difficulty / tiers
- `merchant.stock() price(id) sellPrice(id) sellable() buy(id,n) sell(id,n) shards()` — currency is the real `metal-shards` item.
- `talkTo(npcId) closeDialogue() dialogue` · `NPCS.varl` — `closeDialogue()`
  now takes the conversation panel down as well as clearing the flag; calling it
  directly used to leave `ctx.state === 'dialogue'`, which `main.js`'s `live`
  test excludes, i.e. it froze the simulation.
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
`quest-objective {questId,objectiveId,label,have,need,done}` ·
`quest-complete {id,title,rewards}` · `quest-tracked {id,title}` ·
`objective-changed {title,detail}` (legacy SPEC event, still emitted) ·
`banner {title,detail,kind}` — `kind` ∈ `info|level|skill|quest|quest-done|objective|save|death|victory`.
**`shell-hud` should render these and this lane's own strip can then be retired.** ·
`discovery {id,label,place,total}` — raised once per id by `discover()`; this is
the feed a Notebook or world-map "places found" list should read (`place:true`
rows are the ones that also bannered) ·
`difficulty-changed` · `trade-buy` / `trade-sell` · `dialogue-open` /
`dialogue-close` · `checkpoint-loaded {reason,killer}` ·
`victory-resume {}` — **`shell-menus` takes the endgame card here**; this lane
clears `ctx.state === 'victory'` itself only while `ctx.menus` does not exist ·
`save-written` / `save-loaded` / `save-error`.

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
5. **`focus-items`** — publish `items.serializeCapacities()` /
   `restoreCapacities(obj)` so purchased pocket capacities survive a save.
   `SaveSystem.apply` already clamps restored counts to `inventory.capacity(id)`.
6. **`combat`** — gate ammo on `progression.ammoUnlocked(id)` (`progression-005`).
7. **`shell-hud`** — the XP strip, banners and quest tracker this lane renders
   into `#hzc-prog` are a bridge, not a claim on the HUD. Render the events in
   §2 and call `progression.ui.dispose()`.

---

## 4. Gates

`tools/gates.round4.progression.mjs` — `A64-xp-loop`, `A65-save-restore`
(a literal `location.reload()` between save and Continue), `A66-quest-objectives`
(all five objective types on their real events), `A67-machine-respawn`, and the
residue-round regression gate `A64b-damage-channels` (the legacy `baseDamage`
channel under a non-1 `damageOut`).
Run: `node tools/gates.mjs --port 5213 --lane progression`.

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
