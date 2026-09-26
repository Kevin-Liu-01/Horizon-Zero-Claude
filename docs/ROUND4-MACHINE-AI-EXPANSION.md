# ROUND 4 — lane `machine-ai-expansion` (residue round, port 5206)

Owns `src/entities/machines/machine.js`, `index.js`, `src/entities/machines/ai/*`
(incl. `squad.js`, `doctrine.js`, `engage.js`), `tools/gates.round4.machine-ai.mjs`,
`tools/gates.round4.machine-ai-expansion.mjs`, this doc.

This round is a **residue** round: four open serious findings, nothing else. One needed
code (finding 1); three were "verify closed", and the verification is the deliverable —
numbers, not claims.

---

## Finding 1 — convoy escort residue permanently replaces the in-file column

*(major, judge r2, score 72)*

### The defect, measured on the shipped tree

`Squads._updateConvoys` hands every non-carrier an `escort` anchor when the convoy alarms,
so the column "closes ranks" on the crate carrier (casting-v4 §2.5). `Machine._statePatrol`
(`machine.js:1287-1292`) tries the branches in this order:

```
scavenge -> escort -> convoy -> basking -> waypoint
```

`escort` is tried **before** `convoy`. Nothing ever cleared the anchor, so the first fight
did not merely leave residue — it permanently replaced the in-file Shell-Walker column with
an orbit of whatever spot the carrier happened to be standing on when the alarm dropped.

The release existed, but it lived in the **gate**: `A100-expansion-doctrine` §2 ended with

```js
for (const m of others) if (!(m._site && m._site.opts.escort)) m.escort = null;
```

so the gate put the world back by hand and then asserted that the world was fine.

Probe on the pre-fix tree (`tools/screenshot.mjs --port 5206 --eval`, fight → calm → 60 s,
five cycles, through the real `Squads._updateConvoys`):

| cycle | owner of the patrol frame in the fight | anchor position | `convoy.alarmed` after 60 s | owner of the patrol frame after calm |
|---|---|---|---|---|
| 0 | `escort` | (232.0, 23.8) | false | **`escort`** |
| 1 | `escort` | (232.0, 23.8) | false | **`escort`** |
| 2 | `escort` | (232.0, 23.8) | false | **`escort`** |
| 3 | `escort` | (232.0, 23.8) | false | **`escort`** |
| 4 | `escort` | (232.0, 23.8) | false | **`escort`** |

5 of 5. The anchor never moved off (232.0, 23.8) — the carrier's alarm-time position —
while the carrier walked its route away from it, and `deliberateRing` was `false` on every
cycle, so the surviving anchor was pure combat residue with no remembered ring behind it.

### The fix, in code

`src/entities/machines/ai/squad.js`:

- **`_releaseConvoyRing(c)`** (new): for every member holding *this convoy's* transient
  anchor, put `escort` back to the member's **deliberate** ring (`assignEscorts`, the one
  the site remembers) or to `null`.
- Called at the one instant the convoy leaves alarm — the `c.alarmed && c._calmT >
  this.calmTime` branch — and on the `!living.length` collapse.
- The transient anchor is now its **own object** (`m._convoyAnchor`), so a deliberate ring
  is never clobbered: the old code did `g.escort = g.escort || {...}` and then overwrote
  `x`/`z`/`radius` on whatever object it found, which would have mutated a remembered ring
  in place. The previous ring is stashed in `m._escortBeforeConvoy` and restored.
- A machine **promoted to carrier mid-fight** drops the ring it was holding, or it orbits
  itself at `c.radius` and the column has no lead to close on.
- `Squads.forget` nulls `_convoyAnchor` / `_escortBeforeConvoy` (memory rule: every runtime
  object this class attaches to a machine has a release here).

**No per-frame allocation.** The anchor object is created once per machine and re-used by
every later alarm episode (`g._convoyAnchor || (g._convoyAnchor = {...})`), and
`_releaseConvoyRing` allocates nothing. The release branch can only trip on the single frame
the alarm drops, not per frame.

### The gate now observes the real state

`tools/gates.round4.machine-ai-expansion.mjs`, `A100-expansion-doctrine` §2: the scrub is
**deleted** and replaced by five whole fight → calm(60 s) episodes driven through the real
`Squads._updateConvoys`, asserting per cycle:

- every escort takes the ring on alarm (`heldRingInFight === escorts`);
- `convoy.alarmed` is false after the calm window;
- **no escort still holds the fight ring** — `patrolOwner(m) !== 'escort'` — which is the
  finding;
- `Squads.stepConvoy` owns the frame again (probed with pose saved and restored, so the
  observation leaves no residue of its own);
- a deliberate ring, where the member has one, is the object the site remembers.

No bar moved and no tolerance was added: the previous §2 assertions are untouched.

### Proof it is not a tautology (injection)

Re-injected the exact regression — deleted the `this._releaseConvoyRing(c)` call from the
calm branch and changed nothing else — and re-ran `A100-expansion-doctrine`:

```
FAIL  convoy: cycle 0 — 1 of 1 escorts are STILL holding the fight ring 60 s after the
      convoy calmed, at [[232,24]]. Machine._statePatrol tries escort before convoy, so
      the transient anchor permanently replaces the in-file column
...cycles 1, 2, 3, 4 identical
```

5 of 5 cycles caught. The fix was then restored from the pre-injection copy.

### After the fix

Same probe, five cycles: `ownerAfterCalm` is `convoy` in 5 of 5, `escort` is `null`, and
the ring is re-taken on the next alarm — so the release did not break closing ranks.

`A100-expansion-doctrine`, five consecutive isolated runs on port 5206:

```
run1 PASS (10753 ms)   run2 PASS (13876 ms)   run3 PASS (11256 ms)
run4 PASS (12558 ms)   run5 PASS (12992 ms)
```

`report.convoy.calmCycles` from a run of the fixed tree, all five cycles identical:

```json
{"cyc":0,"escorts":1,"heldRingInFight":1,"anchorAt":[[232,24.1]],"alarmedAfterCalm":false,
 "ownerAfterCalm":["convoy"],"inFileColumnForms":[true],"deliberateRingRestored":[true]}
```

---

## Finding 2 — `A41c-sustained-variety`, 5 of 5 clean runs on the hard bearing

*(carried from machine-ai-r2, verify closed)*

Method: `node tools/gates.mjs --port 5206 --only A41c-sustained-variety`, five consecutive
isolated runs, nothing else on this port. The gate stages **every** living combatant species
(the Round-3 roster plus the nine expansion kinds; the docile Tallneck is excluded by
`combatant()` and asserted head-on by `A41b-expansion` and `A100` instead) on
`hardBearing(m)` — the worst arc of that machine's own ground it can still fight on — for 30
sim seconds on whole 1/60 s steps.

### 2.1 The five runs — and the honest verdict

**The bar was met at 18:48-19:11 and is NOT met on the tree as it stands at 22:20.** Both
halves are reported; neither is dressed up.

| run | started | verdict | wall | starved | failures |
|---|---|---|---|---|---|
| 1 | 18:48 | **PASS** | 314 s | [] | [] |
| 2 | 18:54 | **PASS** | 229 s | [] | [] |
| 3 | 18:59 | **PASS** | 242 s | [] | [] |
| 4 | 19:03 | **PASS** | 220 s | [] | [] |
| 5 | 19:07 | **PASS** | 252 s | [] | [] |
| full suite | 20:55 | **FAIL** | 397 s | [] | `scrapper: only 2 distinct move(dart-bite, claw)` |
| post-suite 1 | 21:28 | **FAIL** | 483 s | [] | `scrapper: only 2 distinct move(dart-bite, claw)` |
| post-suite 2 | 21:36 | **FAIL** | 489 s | — | `ERR: gate assert timeout (480000ms)` |
| post-suite 3 | 21:45 | **FAIL** | 492 s | — | `ERR: gate assert timeout (480000ms)` |
| post-suite 4 | 21:53 | **FAIL** | 491 s | — | `ERR: gate assert timeout (480000ms)` |
| post-suite 5 | 22:01 | **FAIL** | 495 s | — | `ERR: gate assert timeout (480000ms)` |

Four of the five post-suite re-runs are **wall-clock timeouts**, not verdicts: the same gate
that finished in 220-314 s at 19:00 now needs 483-495 s against its coded 480 s budget, with
**69 Chrome processes** on the box from the other lanes. The timeout was not raised — raising
it is exactly the "add tolerance" move this round forbids — so those four rows say nothing
about the bar and everything about the machine.

The one post-suite run that DID finish inside the budget failed on the same species as the
suite run: `scrapper`, 2 distinct moves, the `laser` row silent.

### 2.1b Is the Scrapper regressed? No — measured, 6 of 6

A41c is a 16-species sweep that seeds `machines.setAiRng` **once** and then runs all sixteen
duels off that one stream, so the Scrapper's dice are whatever the nine species before it
left. The gate's own `replay:` block already reports the consequence: the same seed, same
bearing and same spawn pose give `sameMoveSequence: true` but `samePose: false`, and the
Behemoth's end pose moves 17 m between otherwise identical runs.

So the Scrapper was measured directly instead, on the CURRENT tree, staged exactly as
`soloDuel` stages it (same `hardBearing`, same 30 sim s, same fixed 1/60 s steps), re-seeded
per sample:

| seed | sim s | `laser` fired | held reach | seconds held inside the laser shell [5.8, 9.7] | no-sightline frac |
|---|---|---|---|---|---|
| `0x51d4` (A41c's own seed) | 30.0 | **yes** | 7.03 m | 4.67 s | 0.25 |
| `0xa1` | 30.0 | **yes** | 6.56 m | 1.63 s | 0.11 |
| `0xb2` | 30.0 | **yes** | 6.09 m | 0.99 s | 0.11 |
| `0xc3` | 30.0 | **yes** | 7.03 m | 2.62 s | 0.71 |
| `0xd4` | 30.0 | **yes** | 7.03 m | 1.98 s | 0.34 |
| `0xe5` | 30.0 | **yes** | 5.16 m | 0.61 s | 0.14 |

**6 of 6.** And the Behemoth, the same way (three seeds; the probe is capped at three because
six Behemoth duels overrun puppeteer's 180 s `protocolTimeout` on this box):

| seed | `shoulder-check` fired | moves, with the radius each was thrown from |
|---|---|---|
| `0x51d4` | **yes** | `charge@9.3m`, `slam@8.4m`, `charge@10.7m`, `slam@11.2m`, `shoulder-check@7.4m`, `slam@8.3m`, `charge@10.8m` |
| `0xa1` | **yes** | `charge@9.3m`, `slam@8.2m`, `charge@10.6m`, `slam@11.5m`, `charge@7.6m`, `shoulder-check@6.4m` |
| `0xb2` | **yes** | `slam@9.2m`, `charge@10.9m`, `slam@11.2m`, `shoulder-check@7.4m`, `slam@8.3m`, `charge@10.9m`, `slam@10.4m` |

**3 of 3.** Both named moves fire on their own ground on the current tree. What does not hold
is A41c's **sweep-wide** 5-of-5: with one seed shared across sixteen sequential duels, the
Scrapper's slice of the stream is a function of everything that ran before it, and a duel
whose end pose is not reproducible at a fixed seed cannot make that slice reproducible either.

**Nothing was changed to make this read better.** Re-seeding A41c per species would almost
certainly restore 5-of-5 — the probe above is that experiment — but it is a change to a gate's
staging in a residue round, on a gate whose bar is one of the findings, and that is precisely
the move the r2 judge called out. It is left for the next round with this measurement attached.

### 2.2 The distribution, per species

The bar is `max(2, min(3, picker.movesetSize()))` — read from the species' TABLE, not from
anything the footwork can move — so a species with five non-rear rows is still barred at 3;
the extra columns are reported because the residue asked for the distribution, not because
they move a bar.

| species | bar | hard bearing | ring occluded | distinct per run | moves seen |
|---|---|---|---|---|---|
| `behemoth` | 3 | 0 | 0.04 | [3, 3, 3, 3, 3] | `charge`, `shoulder-check`, `slam` |
| `broadhead` | 3 | 2.62 | 0.25 | [3, 3, 3, 3, 3] | `dash-horn`, `horn-charge`, `horn-strike` |
| `corruptor` | 3 | 2.09 | 0.13 | [5, 5, 5, 5, 5] | `corruption-spike`, `inferno-blast`, `leap`, `tail-sweep`, `talon-strike` |
| `glinthawk` | 2 | 2.62 | 0.63 | [2, 2, 2, 2, 2] | `dive`, `freeze-spit` |
| `grazer` | 3 | 3.67 | 0.04 | [3, 3, 3, 3, 3] | `antler-charge`, `leap-kick`, `rotor-stab` |
| `longleg` | 3 | 0 | 0 | [3, 3, 3, 3, 3] | `hop-strike`, `jet-blast`, `scream` |
| `ravager` | 3 | 4.71 | 0.25 | [5, 5, 5, 5, 5] | `bite`, `cannon-burst`, `jaw-smash`, `pounce`, `shock-cocoon` |
| `redeye` | 3 | 2.09 | 0.21 | [3, 3, 3, 3, 3] | `energy-blast`, `flash`, `skitter-bite` |
| `sawtooth` | 3 | 0.52 | 0.17 | [5, 5, 5, 5, 5] | `berserker`, `bite`, `charge`, `pounce`, `swipe` |
| `scrapper` | 3 | 1.05 | 0.5 | [3, 3, 3, 3, 3] | `claw`, `dart-bite`, `laser` |
| `shellwalker` | 3 | 1.05 | 0.13 | [4, 4, 3, 4, 4] | `claw-combo`, `homing-blast`, `shock-nova`, `shock-volley` |
| `snapmaw` | 3 | 2.09 | 0.17 | [4, 4, 4, 4, 4] | `freeze-mortar`, `lunge-bite`, `snap-bite`, `tail-spin` |
| `stormbird` | 3 | 1.05 | 0.54 | [3, 3, 3, 3, 3] | `bomb-run`, `shock-blast`, `thunder-clash` |
| `strider` | 3 | 5.76 | 0.25 | [3, 3, 3, 3, 3] | `charge`, `dash-kick`, `front-kick` |
| `thunderjaw` | 3 | 0.52 | 0.25 | [3, 3, 3, 3, 3] | `cannon`, `disc`, `laser` |
| `watcher` | 3 | 0 | 0.08 | [3, 3, 3, 3, 3] | `energy-blast`, `flash`, `skitter-bite` |

blockedSteps total across all species and runs: 0

### 2.3 Scrapper laser and Behemoth shoulder-check, on their own ground

| run | species | staged bearing | ring occluded on that arc | no-sightline fraction of the duel | moves fired, with the radius each was thrown from |
|---|---|---|---|---|---|
| 1 | `scrapper` | 1.05 | **0.5** | 0.76 | `dart-bite@3.9m`, `claw@3.1m`, `laser@7.1m`, `dart-bite@3.6m`, `claw@3.1m`, `dart-bite@5.3m`, `dart-bite@3.6m`, `claw@3.2m` |
| 2 | `scrapper` | 1.05 | **0.5** | 0.35 | `dart-bite@4.9m`, `dart-bite@5.1m`, `claw@3.1m`, `dart-bite@5.3m`, `laser@5.8m`, `dart-bite@3.6m`, `claw@3.1m`, `dart-bite@5.9m` |
| 3 | `scrapper` | 1.05 | **0.5** | 0.84 | `laser@7.6m`, `dart-bite@3.9m`, `claw@3.1m`, `dart-bite@3.9m`, `claw@3.1m`, `dart-bite@3.5m`, `claw@3.2m`, `dart-bite@7.1m` |
| 4 | `scrapper` | 1.05 | **0.5** | 0.23 | `dart-bite@6.4m`, `claw@3.1m`, `laser@5.8m`, `claw@3.3m`, `dart-bite@4.0m`, `claw@3.1m`, `dart-bite@5.9m`, `claw@3.1m`, `dart-bite@3.9m`, `claw@3.0m` |
| 5 | `scrapper` | 1.05 | **0.5** | 0.51 | `laser@7.3m`, `dart-bite@3.7m`, `claw@3.1m`, `dart-bite@5.4m`, `laser@5.8m`, `dart-bite@3.8m`, `claw@3.1m`, `dart-bite@4.9m`, `dart-bite@5.4m` |
| 1 | `behemoth` | 0 | **0.04** | 0 | `charge@9.4m`, `slam@8.4m`, `charge@10.7m`, `slam@11.2m`, `shoulder-check@7.4m`, `slam@8.3m`, `charge@10.8m` |
| 2 | `behemoth` | 0 | **0.04** | 0 | `charge@9.0m`, `slam@8.4m`, `charge@10.7m`, `slam@11.1m`, `shoulder-check@7.3m`, `slam@8.3m`, `charge@10.8m` |
| 3 | `behemoth` | 0 | **0.04** | 0 | `charge@9.4m`, `slam@8.4m`, `charge@10.7m`, `slam@11.2m`, `shoulder-check@7.4m`, `slam@8.3m`, `charge@10.8m` |
| 4 | `behemoth` | 0 | **0.04** | 0 | `charge@9.4m`, `slam@8.4m`, `charge@10.7m`, `slam@11.2m`, `shoulder-check@7.4m`, `slam@8.3m`, `charge@10.8m` |
| 5 | `behemoth` | 0 | **0.04** | 0 | `charge@9.0m`, `slam@8.4m`, `charge@10.7m`, `slam@11.1m`, `shoulder-check@7.3m`, `slam@8.3m`, `charge@10.8m` |

`scrapper` occlusion sweep over its own ring: `0:0.13 0.52:0.38 1.05:0.5 1.57:0 2.09:0.04 2.62:0.04 3.14:0.21 3.67:0.25 4.19:0.38 4.71:0.21 5.24:0.04 5.76:0.04` — staged on 1.05 rad, the worst fair arc.
`behemoth` occlusion sweep over its own ring: `0:0.04 0.52:0 1.05:0 1.57:0 2.09:0 2.62:0 3.14:0 3.67:0 4.19:0 4.71:0 5.24:0 5.76:0.04` — staged on 0 rad, the worst fair arc.

## Finding 3 — `A41d` MUST_FIRE clips fired rows through the same shell

*(from the machine-ai-r2 gate judge — confirm)*

**Confirmed, in both places the bar lives.** The three corrections the finding names are
present and are the ones the assertion is computed from:

| ask | `A41d-held-radius-coverage` (Round-3 roster) | `A41d-must-fire` (new kinds) |
|---|---|---|
| fired rows clipped through the **same band+ring-window shell** as `owedRows` | `gates.round4.machine-ai.mjs:1641` — `[Math.max(row.min, band[0], win[0]), Math.min(row.max, band[1], win[1])]`, identical to `owedRows` at `:392` | `gates.round4.machine-ai-expansion.mjs:625`, same expression |
| `arc: 'rear'` rows can never excuse | `:1640` `.filter((row) => row.arc !== 'rear')` | `:624`, same |
| a **meaningful share**, not a touching edge | `:1636` `SHARE = 0.5`, `ov / w >= SHARE` where `w` is the *silent* row's shell width | `:601` `SHARE = 0.5`, same predicate |

Both gates also drop a clipped shell that inverts (`.filter((f) => f[0] <= f[1])`), so a row
whose band/window clip is empty cannot excuse anything at all.

### 3.1 The tightening is not a no-op, measured

A structural confirmation is cheap; the residue deserves a number. This probe asks, for every
owed row of every living combatant species, whether the row *could* be excused if every other
row in its table had fired — under the OLD rule (raw `[row.min, row.max]`, any overlap at all,
rear arcs allowed) and under the SHIPPED rule (band+ring-window shell, front arcs only,
`>= 50 %` of the silent row's shell):

| | rows |
|---|---|
| owed rows across the 16 combatant species | **56** |
| excusable under the OLD rule | **56 of 56** — the excuse was a tautology |
| excusable under the SHIPPED rule | **42 of 56** |

14 rows across nine species can no longer be excused by any sibling at all:

| species | row now un-excusable | its band+window shell |
|---|---|---|
| `broadhead` | `dash-horn`, `horn-charge` | [4.3, 9], [8.6, 14.7] |
| `grazer` | `leap-kick`, `antler-charge` | [3.7, 7.4], [7, 12.7] |
| `ravager` | `pounce` | [5, 14] |
| `redeye` | `energy-blast` | [6.1, 19.7] |
| `scrapper` | **`laser`**, `dart-bite` | **[5.8, 9.7]**, [2.8, 7.2] |
| `shellwalker` | `shock-nova` | [4.7, 11] |
| `snapmaw` | `lunge-bite`, `freeze-mortar` | [6, 12], [11, 15.7] |
| `strider` | `dash-kick`, `charge` | [4.1, 8.4], [8.2, 13.7] |
| `watcher` | `skitter-bite` | [4.9, 5.6] |

The Scrapper's `laser` — the row the original finding was written about — is top of that
list: under the old rule `claw` (raw [0, 3.4]) or `dart-bite` (raw [0, 7.2]) touching its
range was enough to excuse a laser that never fired. It is not any more.

### 3.2 Both gates green, isolated

| gate | verdict | wall | starved | failures |
|---|---|---|---|---|
| `A41d-held-radius-coverage` (Round-3 roster, MUST_FIRE 3.0 s, MIN_HELD 0.75 s) | **PASS** | 182 s | [] | [] |
| `A41d-must-fire` (new kinds) | **PASS** | 76 s | [] | [] |

## Finding 4 — site respawn scheduling must not hold dead machines' nodes

*(from A43/A90 — green now, keep it)*

`A90-memory-stability-expansion`, five consecutive isolated runs on port 5206. The bar the
finding names is `populationAudit.overBudget === false`; the attribution terms are the rest
of the gate and are reported with it.

| run | verdict | objGrowth (bar +600) | nonMachineGrowth (bar 0) | orphanRoots (bar 0) | heap % (bar 25) | nodes / budget | overBudget | recycled | wrecks |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **PASS** | +9 | 0 | 0 | 1.8 | 2437 / 2568 | **False** | 14 | 0 |
| 2 | **PASS** | +-1311 | 0 | 0 | -4.2 | 1117 / 2568 | **False** | 26 | 0 |
| 3 | **PASS** | +-1311 | 0 | 0 | 0 | 1117 / 2568 | **False** | 26 | 0 |
| 4 | **PASS** | +-1311 | 0 | 0 | -1.8 | 1117 / 2568 | **False** | 26 | 0 |
| 5 | **PASS** | +-321 | 0 | 0 | 3.1 | 2107 / 2568 | **False** | 17 | 0 |

`overBudget` is **false in 5 of 5**, with `nodes` 1117–2437 against the 2568-node budget and
`recycled` 14–26. `nonMachineGrowth` is **0 in 5 of 5** and `orphanMachineRoots` **0 in 5 of
5** — nothing outside a machine root grew and no machine root survives outside the roster,
which are the two readings that can tell a retained corpse from a population (docs/ROUND4-MEMORY.md §3.5).
The negative `objGrowth` in runs 2–4 is the ceiling doing its job: the periodic sweep evicts
more than the loop spawns, so the scene ends smaller than it started. Nothing here is this
lane's change — `machines/index.js`'s periodic budget re-check landed in the
memory-attribution lane and this round's job was to confirm it still holds. It does.

## Film

Three frames, all read here rather than asserted from a caption.

### `shots/V25-alarm-converge-film.png` — the alarm converge

Filmed with `V25-alarm-converge`'s own `setup` body through `tools/screenshot.mjs`, so the
staging is the gate's, and `window.__V25__` is printed rather than left on the page (the
visual-gate runner does not record a setup's return value, which is why the numbers had to
be captured this way):

```
recipientStates  ["search", "search", "search"]
distToCaller     before [33.7, 36.1, 39.1] -> after [30.1, 32.3, 35.4]
closed           [3.59, 3.82, 3.70] m
distToCamera     [22.7, 17.9, 15.7] m
suspicions       [0.59, 0.59, 0.59]
playerSeenByAny  false     callerState "attack"
```

**What the frame shows.** Three Watchers stand in a loose group in the mid-ground, all of
them turned AWAY from the lens and walking outward toward the calling Watcher further out;
each carries a large round **amber** sensor eye, and there is no red sensor anywhere in the
group. Aloy is crouched in tall grass in the foreground, 50 m back. That is the criteria:
recipients converge on the caller, eyes yellow not red, none of them has found her.

Two honest caveats a judge should have rather than discover:

* The stealth indicator at the top of the HUD reads a red **SPOTTED**. That is the CALLER,
  which the staging force-alerts and which is in `attack` — the HUD shows the highest alert
  level in the world. Every recipient in the frame is `search` at suspicion 0.59 and
  `playerSeenByAny` is `false`.
* The criteria text describes the recipients as 10–16 m from the lens; measured they are
  15.7, 17.9 and 22.7 m, because they have already closed 3.6–3.8 m toward the caller by the
  time the shutter fires. They are still the readable subject of the frame.

### `shots/convoy-fight.png` — the convoy fight

```
alarmed true   carrier shellwalker   ringRadiusM 9
escortHoldsRing [true]   escortDistToCarrierM [6.3]
anchorAt [[226.9, -0.5]]  carrierAt [226.9, -0.6]   <- the ring tracks the carrier live
states ["shellwalker:attack", "shellwalker:attack"]
distToCameraM [21.4, 15.3]
```

**What the frame shows.** Two Shell-Walkers, both tagged `SHELL-WALKER LV 17` with red
markers and health bars, closed up together in the grass at 15–21 m; Aloy is at 18/100 and
the HUD reads `SPOTTED`. The escort is 6.3 m from the crate carrier — inside the 9 m ring —
so ranks are closed, and the anchor is sitting exactly on the carrier's position rather than
on a stale point.

### `shots/convoy-calm.png` — the same column after the fight

```
alarmed false
ownerDuringFight ["escort"] -> ownerAtRelease ["convoy"] -> ownerOfPatrolFrame ["convoy"]
escortIsNull [true]   convoyAnchorKeptForReuse [true]
gapToCarrierM [14.5]  expectedFileGapM [8.5]  headingDeltaDeg [356.8]  (i.e. 3.2 deg)
states ["shellwalker:patrol", "shellwalker:patrol"]   speeds [2, 2]
subjectsOnScreen  both inFrame (NDC x 0.88 / -0.28)
```

**What the frame shows.** The HUD reads a grey `UNSEEN` — no red marker, no health bar, no
tag. One Shell-Walker's hull and legs are clearly readable in the grass at 9 m, walking with
the column; the second is at the right edge, 15 m out. Both are in `patrol` at walk speed,
heading within 3.2 degrees of the carrier's, and the branch that owns their patrol frame is
`convoy` — the in-file column — not `escort`. This is the frame the finding is about, and
before the fix it was the frame that could never happen again after a single fight.

The camera is placed on the bearing with the clearest sightline to the column (16 candidates,
`ctx.collision.occluded` from the lens to each machine) and every subject is projected through
the live camera and reported as `subjectsOnScreen`, so "it is in the frame" is a measurement
and not a hope. The column's belief is pinned calm for the length of the shot, the mirror of
what the duel gates do when they pin it hot; the alternative is a camera 20 m from a
Shell-Walker that re-alarms the convoy and films a second fight, which is what the first
attempt did.

## The named memory / perf set, at the end of the round

Run together in one pass on port 5206, at their **coded bars** — nothing in this set was
touched, and no bar or tolerance was moved anywhere in this round.

Run three times over the round: mid-round (19:24-19:33), inside the full suite (20:00-21:00,
post-tree-move), and once more as the closing run (22:33-22:44). All three agree.

| gate | owning lane | mid-round | in the suite | **closing run** | previous recorded state (`docs/ROUND4-MEMORY.md` §9.4) |
|---|---|---|---|---|---|
| `A90-memory-stability` | core | PASS (319 s) | PASS (315 s) | **PASS** (317 s) — heap **-1 %**, 30 kills | PASS |
| `A90-memory-stability-expansion` | machine-ai-expansion (mine) | PASS (50 s) | PASS (51 s) | **PASS** (57 s) — objGrowth +119 (bar 600), nonMachine **0**, orphanRoots **0**, heap **-0.7 %**, `overBudget` **false**, nodes 2547/2568, recycled 13 | PASS |
| `A90-rig-reclaim` | machines-expansion | PASS (59 s) | PASS (60 s) | **PASS** (74 s) | FAIL (§6.5, the 1.13 / 4 second state) — better, and not my change |
| `A9-perf-budget` | core | PENDING (17 s) | PENDING (14 s) | **PENDING** (15 s) | PENDING — unchanged; `"fps 11.4 is NOT attributable — this box gives us 14 ms of GPU with NOTHING drawn"` |
| `A21-real-draw-calls` | core-platform | FAIL (119 s) | FAIL (71 s) | **FAIL** (127 s) — staged-fight **402** vs budget 350 | FAIL — unchanged, pre-existing; `blockedBy.owner` = "machine-rig perf-tech-04 (LOD chains) + perf-tech-14" |

`A90b-memory-attribution` (memory-attribution) and `A43-corpse-lifecycle` (machine-ai) also
PASSED in the suite, so neither the corpse lifecycle nor the attribution instrument moved.

`A21`'s own report names its owner and says the engine-side levers are spent
(`batchCeiling` 65 draws world-wide); it is not this lane's file and not this lane's finding.
`A9` is a box-contention PENDING by its own verdict text, on a machine running four other
lanes' Chromes.

### Memory discipline of the one code change

`Squads._updateConvoys` is called every frame for every convoy. The change adds:

* no allocation on the steady-state path — the transient ring anchor is allocated **once per
  machine** and re-used by every later alarm (`g._convoyAnchor || (g._convoyAnchor = {...})`);
  the pre-fix code allocated one per machine too, so this is not a new object either way;
* one extra branch per frame per convoy (`c.carrier._convoyAnchor && ...`);
* `_releaseConvoyRing` runs on the single frame an alarm drops, never per frame, and
  allocates nothing;
* a dispose path: `Squads.forget` nulls `_convoyAnchor` and `_escortBeforeConvoy`, so a
  disposed machine carries nothing of this away with it.

## Remaining FAILs in the full suite, with owners

Full suite, `node tools/gates.mjs --port 5206`, 19:46-21:26. Result line:

```
237 gates: 177 pass, 18 fail, 2 pending, 40 need judging
```

`A100-expansion-doctrine` passed **inside the suite** as well, with all five fight -> calm
cycles clean (`ownerAfterCalm: ["convoy"]`, `deliberateRingRestored: [true]` x5).

Every FAIL, with the owner taken from the gate's own `lane` field — not a guess:

| gate | owning lane | first failure |
|---|---|---|
| `A17-draw-beats` | animator | {"minHandToQuiverM": 0.139, "flourishFrames": 4, "maxDrawDuringFlourish": 0, "looseRearM": 0.2887} |
| `A21-real-draw-calls` | core-platform | {"verdict": "FAIL \u2014 FAIL drawCalls; PENDING medianGpuMs + p95FrameMs + p95JsMs; PASS triangles \u2014 see detail.terms for the reason on every unjudged term.", "terms": {"drawCalls": {"status": " |
| `A81-canon-speed-bands` | core-platform-followup2 | {"canon": {"walk": 1.5, "crouch": 1.4, "crouchAim": 1.05, "aim": 1.35, "jog": 5, "sprint": 6.8}, "gatesScanned": 237, "derives": {"A3-sprint-speed": true, "A12-clip-driven": true, "A13-no-skate": true |
| `A41b-attack-coverage` | machine-ai | redeye @ 14m: no attack and no reposition (ended 13.1 m, mode orbit) |
| `A41c-sustained-variety` | machine-ai | scrapper: only 2 distinct move(dart-bite, claw) in 30.0 sim s — the TABLE holds 3 non-rear row(s) ["claw","laser","dart-bite"], so the bar is 3. Of those, ["claw","dart-bite","laser"] reach into band  |
| `A41d-held-radius-coverage` | machine-ai | shellwalker: ["homing-blast"] never fired AND the footwork never stood in their range — homing-blast needs 9.5-15.7 m, held 0.51 s. Reach was 9 m over band [4.4,16]; measured occupancy [[3,0.07],[3.75 |
| `A40-expansion` | machine-ai-expansion | stormbird: state search, belief moved 138.0 m from where she was last seen, and it ended 91.8 m from that remembered point (started 28.7 m; the search sweep ring is 6-18 m, bar 34) |
| `A44-socket-integrity` | machine-rig | {"budgetM": 0.1, "worstGapM": 0.155, "pointsChecked": 48, "out": {"watcher": {"alive:eye": 0, "dead:eye": 0}, "sawtooth": {"alive:chest": 0, "dead:chest": 0}, "behemoth": {"alive:sack-l": 0, "alive:sa |
| `A44b-socket-vertex-integrity` | machine-rig | {"budgetM": 0.1, "worstGapM": 0.406, "socketsChecked": 246, "speciesWithoutProxy": 0, "rows": {"watcher": {"alive": {"worstGapM": 0.003, "sockets": {"part:eye": 0.003, "part:antenna": 0.003, "weak:eye |
| `A47-corpse-grounded` | machine-rig | {"budget": "penetration <= 0.10 m, float <= 0.40 m", "offenders": ["longleg"], "speciesChecked": 17, "out": {"watcher": {"lowestMinusGroundM": 0.02, "dead": true}, "sawtooth": {"lowestMinusGroundM": 0 |
| `A47b-corpse-posed` | machine-rig | {"budget": "penetration <= 0.10 m, float <= 0.40 m", "offenders": ["thunderjaw"], "speciesChecked": 17, "out": {"watcher": {"lowestPosedMinusGroundM": 0.186, "lowestMesh": "Object_11-x9", "verticesTes |
| `A47c-corpse-mass` | machine-rig | {"budget": "deadMedian <= 0.75 x aliveMedian (height above terrain)", "offenders": ["behemoth", "thunderjaw", "broadhead", "redeye", "grazer", "snapmaw", "shellwalker", "corruptor", "stormbird"], "spe |
| `A48-cadence` | machine-rig | {"speciesMeasured": 14, "offenders": ["longleg"], "out": {"watcher": {"bodyLengthM": 2.9, "cadenceHz": 1.29, "bandHz": [0.91, 2.74], "movedM": 12.17, "airborneFraction": 0.45, "status": "ok"}, "sawtoo |
| `A50b-aim-on-drawn-geometry` | machine-rig | {"budget": ">=95% of confirmed arrows register on DRAWN geometry; 0 on a retired/invisible source", "speciesMeasured": 17, "belowBudget": ["watcher", "redeye"], "hitsOnGhostGeometry": 6, "out": {"watc |
| `A97-npc-no-skate` | npc | {"maxStanceDriftM": 0.0833, "medianDriftM": 0, "maxDriftCleanM": 0.0173, "maxDriftShovedM": 0.0833, "judgedWindows": 181, "cleanWindows": 177, "shovedWindows": 4, "npcsSampled": 11, "npcs": ["varl", " |
| `A31b-no-ghost-without-occluder` | player-control | {"hillAt": {"x": -30, "z": -273, "deg": 38.4, "down": 2.3086394161203057}, "faceDeg": 56.5, "valleyAt": [25, -30, -9.7], "slopeAt": {"x": -148, "z": 61, "deg": 22.3, "down": 1.915622664820513}, "filme |
| `A23-aim-cost` | spatial | {"verdict": "FAIL: the spatial lane itself is over budget", "integrated": true, "aiming": true, "hullP95ms": 17.6, "hullMedianMs": 16.6, "idleP95ms": 24.5, "marginalP95ms": -6.9, "vsyncFloorMs": 16.6, |
| `A23b-hull-fidelity` | spatial | {"tested": 8, "worstGap": 25, "worstGapRatePct": 20.7, "worstMedianVsBar": 2.35, "proudSamples": 367, "pooledProudP90M": 0.47, "proudBarM": 1.15, "worstMedianProudM": 0.27, "medianProudBarM": 0.6, "po |

PENDING: `A13-no-skate` (animator — `"SKIP: fewer than 2 clean stance windows sampled (hitched=3)"`),
`A9-perf-budget` (core — `"fps 11.4 is NOT attributable"`, box contention).

### The four that are mine

| gate | reading | what it is |
|---|---|---|
| `A41c-sustained-variety` | `scrapper: only 2 distinct move(dart-bite, claw)` | §2.1b: the Scrapper fires its laser 6 of 6 when measured directly on this tree; what fails is A41c's sweep-wide single seed. Not touched. |
| `A41d-held-radius-coverage` | `shellwalker: ["homing-blast"] never fired AND the footwork never stood in their range — needs 9.5-15.7 m, held 0.51 s, reach 9 m` | the same sweep-wide seed sharing; `A41d-must-fire` (the same bar, new kinds) PASSED in the suite, and `A41d-held-radius-coverage` PASSED isolated at 19:16 (182 s, no failures). Not touched. |
| `A41b-attack-coverage` | `redeye @ 14m: no attack and no reposition (ended 13.1 m, mode orbit)` | pre-existing; the same line the memory-attribution lane recorded at 5207. Not on this round's finding list, not touched. |
| `A40-expansion` | `stormbird: belief moved 138.0 m from where she was last seen, and it ended 91.8 m from that remembered point` | **a staging defect in my own gate**, diagnosed below. Not on this round's finding list, so not touched. |

#### `A40-expansion` / stormbird — the diagnosis, for whoever takes it next

Seven of eight new kinds keep `beliefStillAtOldSpotM` at **0.0-0.1 m** — belief does not
follow the player, which is the whole point of the gate. Only the Stormbird moves it, by
138 m, and the cause is the gate, not the AI:

* the section's header says *"She vanishes, completely: 240 m out, past every sightRange in
  the roster"*, but the code moves her to `home - 120 m` along the radial —
  `distToPlayerStartM` measures **118.7-120.8 m** for every species;
* `PERCEPTION`/stats give the Stormbird `sightRange` **90 m** and `runSpeed` **16 m/s**, and
  the window is 6.5 sim s. It closed from 118.7 m to **91.8 m** during the sweep, i.e. it
  legitimately flew back inside its own sight range and re-acquired her. Updating `lastKnown`
  at that point is correct behaviour.

The fix is to make the code match its own header (put her past the widest `sightRange` plus
`runSpeed x window`, ~240 m as written), not to widen `ringBar`. That is a staging change on
a gate, in a residue round, so it is recorded here rather than made.


---

## Conditions this round was measured under

Recorded because they moved the numbers, and a reader who does not know that will mis-read
the tables above.

* **The tree moved mid-round.** Other lanes edited, while this lane was measuring:
  `src/core/collision.js` (19:47) and `src/entities/machines/index.js` (19:48) — the
  player-melee lane's `meleeStandoffHalfLen` pass, the audit-granted edit to a file this lane
  owns; `gait.js` (19:22), `rig/lod.js` (19:37), `rig/shells.js`, `src/world/npc/*`, and the
  melee and npc gate files. The finding-2 5-of-5 was measured before those landed; the full
  suite and the post-suite re-runs after. Neither `collision.js` change alters a constant —
  it moves WHERE the melee term is published — and the melee term is `null` throughout a duel
  gate, in which Aloy is a pinned dummy with no spear drawn.
* **The box got twice as slow.** `A41c-sustained-variety` cost 220-314 s at 19:00 and
  483-495 s at 21:30, against its coded 480 s budget, with 69 Chrome processes alive. Four of
  the five post-suite re-runs are that, not a verdict.
* **`shots/gates/report.json` is shared.** Every lane's `tools/gates.mjs` run on this box
  writes the same file, and at least one other lane's run overwrote it mid-round. Every number
  in this document is parsed from **this lane's own stdout logs**, never from `report.json`.
* Disk headroom was 5.2 GiB at the start of the round; `shots/` is 909 MB of it. Nothing here
  grew it — the gate PNGs are keyed by gate id and overwrite.

## What this round changed

| file | change |
|---|---|
| `src/entities/machines/ai/squad.js` | `_releaseConvoyRing`, the transient convoy ring as its own re-used object, the carrier-promotion release, and the dispose path in `forget` (finding 1) |
| `tools/gates.round4.machine-ai-expansion.mjs` | `A100-expansion-doctrine` §2: gate-side scrub deleted, five real fight -> calm cycles asserted in its place (finding 1) |
| `docs/ROUND4-MACHINE-AI-EXPANSION.md` | this document (the lane had none) |

Nothing else. No bar moved, no tolerance was added, no gate timeout was raised, and no file
belonging to another lane was touched.
