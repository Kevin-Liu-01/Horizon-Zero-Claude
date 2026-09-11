# ROUND 4 — `focus-items` lane contract (port 5212)

Owns `src/ui/focus.js/.css`, `src/ui/inventory.js/.css`, `src/items/*`.
Everything below is additive: no Round-3 surface was removed or renamed.

---

## 1. `ctx.items` — the lane facade (new)

Published by `Inventory`'s constructor (`src/items/inventory.js`), so it exists
from the moment `main.js` constructs `ctx.inventory` — before `ctx.combat`,
`ctx.focus` and `ctx.hud`.

```js
ctx.items = {
  inventory, tools, crafting, datapoints, screen, POCKETS,

  capacity(id) -> number          // base cap × purchased upgrade tier
  capacityTier(pocket) -> 0..3    // 'resources' | 'tools' | 'valuables'
  pocketOf(id) -> pocket id
  upgradeCost(pocket) -> { tier, shards, items:[[id,n]], mult } | null
  canUpgrade(pocket) -> { ok, reason }
  upgradeCapacity(pocket) -> bool

  recipes() -> [{ id, batch, cost:[[id,n]], note }]
  recipeStatus(id) -> [{ id, have, need, ok, def }]
  canCraft(id) -> bool
  craftBlocker(id) -> string | null
  craft(id) -> bool

  openInventory(pocket?) -> bool  // pocket: resources|ammo|tools|valuables|
                                  //         crafting|notebook|trade
  openTrade() -> bool
  openNotebook(recordId?) -> bool

  audit() -> flat object for gates
};
```

`ctx.inventory` keeps its Round-3 shape (`add/count/has/take/items/counts`)
and gains `capacity(id)`, `serialize()`, `deserialize(d)`. `add()` now clamps
at the pocket capacity and returns how many were actually taken.

## 2. `ctx.items.tools` — quick-slot data for `shell-hud`'s strip (`ui-11`)

`shell-hud` owns the bottom-left strip's pixels; this owns its data and
behaviour. Render it, do not re-implement it.

```js
tools.slots    // [{ id, name, glyph, color, rarity, count, cap, ready, blocked }]
tools.index    // selected slot
tools.active   // slots[index] | null
tools.cooldown // 0..1 remaining on the active slot (draw it as a sweep)
tools.useKey   // 'KeyF' — print this, do not hard-code the letter
tools.cycleKeys // ['BracketLeft','BracketRight'] — print these on the chevrons
tools.select(i) / tools.cycle(+1|-1) / tools.use()
tools.audit()
```

Three slots ship: **Rock** (thrown lure → `machines.lure/noise/stimulus.emit`),
**Vigour Draught** (fills the medicine pouch), **Shock Wire Trap** (spans one
tripwire through `combat.traps.placeWire`). Keys: `F` use (ignored while
mounted — `machines.overrides` owns `F` there), `[` / `]` cycle.

**No digit binds** (fix round 1). `1`–`3` used to select a tool directly, but
`combat` binds `Digit1..Digit6` to the weapon slots and `input.onDown` keeps a
**Set** of handlers per code — so one keypress drove both systems: swapping to
the War Bow silently re-armed `F` from the Rock to the Shock Wire Trap, and
picking a tool yanked the weapon. `docs/SPEC.md` §9 assigns 1-4 to weapons, so
the digits went back to `combat`. Direct tool digits would need a SPEC
amendment plus a matching change in `combat/combat.js`, which this lane does
not own — ask the orchestrator, don't re-add them here.

## 3. `ctx.items.datapoints` — records + Notebook (`missing-systems-focus-datapoints`)

Twelve Old-World records ship placed. `world-props` (or anyone) can add more
without touching this lane:

```js
ctx.items.datapoints.place({ id, title, category, author, body:[...], x, z, y? })
```

`category` is one of `world | vessels | nora | machine`. Ids are idempotent —
re-placing an id moves the existing record. Also: `list`, `collected` (Set),
`count`, `total`, `categories()`, `record(id)`, `collect(id)`,
`serialize()` / `deserialize(d)`.

## 4. `ctx.focus` — scan API (`ui-10`, `stealth-focus-path-fidelity`)

```js
focus.on · focus.toggle(force?) · focus.tags
focus.scanTarget          // machine under the crosshair while Focus is on
focus.components(m)       // per-part rows: { name, weak, tearable, torn,
                          //   elemental, loot:[{id,n,name,glyph,color,rarity}] }
focus.componentRows(m)    // the same, collapsed by name with `count`
focus.audit()             // { on, target, cardVisible, card{components,...},
                          //   partLabels[], hoverPart, reveals[],
                          //   revealCandidates, viewport{w,h}, shells,
                          //   paths{count,splined,samples,skipped},
                          //   vignette{centerAlpha,maxAlpha} }
```

**On-screen guarantee (round 2).** Every entry in `partLabels[]` and
`reveals[]` is a label the player can actually read: its anchor is inside the
viewport and its box is at least 60 % inside the frame (`_project()` rejects
anything else, and the two placement passes re-test after each de-overlap
nudge). So `reveals.length` is the number of reveals **drawn**, never the
number considered — `revealCandidates` is that larger number, and `viewport`
is the frame those coordinates are in. A component label flips to the left of
its anchor when it would otherwise run off the right edge, so labels near the
frame edge stay whole instead of half-clipped.

The twelve reveal slots are handed out to the nearest **visible** candidate,
not the nearest candidate: round 1 cut the candidate list to twelve by
distance before visibility was known, so a pickup 80° off-axis could hold a
slot the player never saw.

## 5. Events published by this lane

| event | payload | who should listen |
|---|---|---|
| `loot-rummage` | `{ entry, label, rows, sourceName, duration, position }` | `player-anim` — fired **before** the grant, never awaited |
| `item-gained` | *(Round 3)* + `rarity`, `rarityColor`, `capped` | `shell-hud` toasts |
| `inventory-full` | `{ id, name, cap }` | `shell-hud` |
| `item-crafted` | `{ id, n, name }` | `shell-hud`, `audio` |
| `capacity-upgraded` | `{ pocket, tier, mult, label }` | `shell-hud` |
| `herb-gathered` | `{ id, name, pouch, value, total }` | `shell-hud`, `audio` |
| `tool-selected` | `{ id, index, name }` | `shell-hud` strip |
| `tool-used` | `{ id, name, count }` | `shell-hud`, `audio` |
| `tool-blocked` | `{ id, reason }` | `shell-hud` |
| `tool-throw` | `{ id, from, to, flight }` | `player-anim` (throw clip) |
| `tool-landed` | `{ id, x, y, z, heard }` | `audio` |
| `datapoint-collected` | `{ id, title, category, have, total }` | `progression`, `shell-hud` |
| `inventory-open` / `inventory-close` | `{ pocket }` / — | `audio`, `shell-menus` |

## 6. Requests to other lanes

* **`shell-hud`** — render `ctx.items.tools` as the bottom-left strip
  (`ui-11`): glyph + count per slot, the selected slot highlighted, the
  `cooldown` sweep, chevrons wired to `tools.cycle(±1)`, and `tools.useKey`
  printed on the active slot.
* **`progression`** — `ctx.items.datapoints` and `ctx.inventory.serialize()` /
  `deserialize()` are ready for `save.js`; `progression.merchant` is already
  the only source of prices in the TRADE pocket.
* **`player-anim`** — `loot-rummage` and `tool-throw` are the hooks.
* **Everyone with a custom `ShaderMaterial`** — see §7.
* **`machine-rig`** — no change requested, just a note: `rig/lod.js`
  `updateRigLOD()` hides `machine.parts[].mesh` (all parts past ~`height*14`
  m, decorative ones past ~`height*6`). A hidden ancestor removes the whole
  subtree from the render, so the Focus component shells — which used to hang
  off the part holder — silently stopped drawing at exactly the 15 m the scan
  gate films from. Fixed **inside this lane**: the yellow shells are now
  parented to the scene and ride the part's world matrix
  (`focus.js _overlayFor(..., detach)` / `_syncDetached()`), so the LOD stays
  yours. Anything else that hangs an overlay off `part.mesh` will hit the same
  wall. `A62-focus-components` now asserts the shells are actually drawn.

## 7. Cross-lane bug found and fixed here

Focus-on rendered a **completely black frame**. It reproduced on the pristine
Round-3 `focus.js`, so it was a Wave-1 regression, not new work:
`core-platform` turned MSAA on (`samples: 4`), and with multisampling a
varying can be interpolated slightly **outside** its [0,1] range at sample
positions near a triangle edge. Every `pow(1.0 - x, k)` in this file could
therefore see a small negative base, which is undefined in GLSL and returns
**NaN** on this driver. Bloom's mip chain then averages that NaN across the
entire image, and tone-mapping turns the whole frame black — even though the
offending mesh covered a thin band.

Fix: clamp every `pow` base (`pow(max(0.0, …), k)`) in `focus.js`. **Any lane
with a hand-written `ShaderMaterial` should do the same audit** — the symptom
is "the whole screen goes black when my effect is on", and it will not
reproduce with bloom disabled.

## 8. Fix round 1 — the violet silhouette (`V36`)

The through-wall shell was `AdditiveBlending` with an **unclamped** alpha
(`fadeIn * violetK * dim * pulse * boost`, `boost` up to 3.5) and a colour
multiplied by the same distance boost. A machine wears up to **six** shells,
all with `depthTest: false`, so the additive sum saturated and the new bloom
pass smeared it: 38 % of the Sawtooth's screen footprint measured as near-white
(`L > 225 && sat < 0.12`) with `meanSat` collapsing from 0.50 to 0.20.

Now: `NormalBlending`, `uOpacity` clamped to 1 and no longer multiplied by the
distance boost, and the boost moved to its own `uBoost` uniform that lifts the
**rim** only. The per-shell FILL is ~0.02 alpha because six of them stack —
`1 - (1 - a)^6` is the number that lands on screen. Measured after the fix at
the same camera: **0.2 %** near-white with Focus on vs **0.2 %** with Focus
off, `meanLum` 92 vs 106, `meanSat` 0.47 vs 0.46.

Numbers to keep if this shader is touched again:

| knob | value | why |
| --- | --- | --- |
| shell blending | `NormalBlending` | additive + 6 shells + bloom = white |
| fill alpha | `0.02` | ×6 shells ≈ 0.12 on screen |
| rim alpha | `0.46 * pow(f, 1.9) * uBoost` | the rim is the silhouette |
| `uOpacity` | `min(1, …)` | it is an alpha, not a brightness |
| `uBoost` | `1 + min(0.8, dist/90)` | rim/alpha only, never colour |

Reveals also take a **seat** now (`_updateReveals`), the same de-overlap pass
the component labels already used, seeded with the labels placed that frame —
`A62`/`A63` assert `getBoundingClientRect()` overlap is empty.

Two side effects of making the shells draw at all: the 40-mesh budget is now
handed out **nearest machine first** (spawn order used to let a Watcher 140 m
away eat the slots the scanned Sawtooth needed), and an entry is reaped when
its machine leaves `PART_RANGE`, dies, or is disposed — scene-parented shells
no longer disappear with the machine's subtree, so they have to be removed.
