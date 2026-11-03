# Horizon Zero Dawn — Core Gameplay Mechanics Reference

Research target: HZD (2017) + The Frozen Wilds, incl. 2020 PC port. Written for builder
agents: every section is implementation-ready. Where wiki-exact numbers were unverifiable,
values are marked **(approx)** — the *relationships* between values are the faithful part.

Sources: horizon.fandom.com, horizonzerodawn.wiki.fextralife.com, gamerguides.com,
gamepressure.com, frondtech.com, game8.co, segmentnext.com, Steam community threads.

---

## 0. The damage model (read this first)

HZD has THREE parallel "damage" channels. Getting this right is the single most
faithful mechanic you can build:

| Channel | What it does | Applies to |
|---|---|---|
| **Impact damage** | Reduces machine HP. Weakpoint hits multiply it (~2–3x). | Body + components |
| **Tear** | Separate stat. Each detachable component has its own **tear HP**. When exceeded, the component POPS OFF the machine — it does NOT reduce body HP. | Components only |
| **Elemental severity** | Fills a per-element buildup bar (Fire/Freeze/Shock/Corruption). When full, a status state triggers. | Whole machine |

Detaching a component: disables the ability tied to it (e.g. Thunderjaw disc launchers
can't fire), often becomes lootable/usable as a **heavy pickup weapon** (Thunderjaw disc
launcher, Ravager cannon), and destroying containers (Blaze canisters) can trigger
elemental explosions. Machines visibly spark at wound points.

Elemental states:
- **Burning** — DoT, panics small machines.
- **Frozen (brittle)** — machine takes roughly **2x impact damage (approx)** for the state duration (~10–15 s). The core combo of the game: Freeze → Hardpoint/Precision spam.
- **Shocked** — stunned in place several seconds; open for Critical Hit melee prompt.
- **Corrupted** — machine attacks other machines.

**Browser adaptation:** components = child meshes with `{tearHP, loot[], disablesAttack}`;
on tear-death, detach mesh with physics impulse + spark burst. One buildup float per
element per machine; state = timer + material tint (frost = pale blue, shock = arcing
sprites, fire = flame particles + DoT tick).

---

## 1. Weapon roster

Tiers in the real game: Common (grey) → Uncommon (green) → Rare (blue) → Very Rare
(purple, "Shadow" prefix bought with shards + a machine heart). Higher tier = more ammo
types (1 → 2 → 3) + more mod slots. Frozen Wilds adds Banuk bows and 3 new weapons.

### 1.1 Hunter Bow — the all-rounder
- **Role:** default DPS, fast handling, mid range.
- **Feel:** fastest draw of the bows (~0.7 s to full draw (approx)); can fire underdrawn for reduced damage; quick nock between shots.
- **Ammo:**

| Ammo | Character | Reported values (Shadow tier) |
|---|---|---|
| Hunter Arrow | cheap bread-and-butter | ~40 impact (10 underdrawn) |
| Hardpoint Arrow | heavier, high dmg + high tear | ~70 impact, ~90 tear |
| Fire Arrow | low impact + fire severity | ~16 impact + ~50 fire |

- **Tactics:** weakpoint plinking, lighting Blaze canisters with fire arrows.

### 1.2 Carja Sharpshot Bow — the sniper
- **Role:** long range, slow draw (~1.5–2 s (approx)), highest single-hit numbers, zooms further while aiming.
- **Ammo:**

| Ammo | Character |
|---|---|
| Precision Arrow | biggest raw damage in the game; weakpoint one-shots trash |
| **Tearblast Arrow** | ~zero damage, HUGE tear; latches on, then a compressed-air sonic burst rips components off in a small AoE (can strip 2–3 parts). Silent until burst and doesn't reveal Aloy — stealth-strips armor |
| Harvest Arrow | high tear; components removed by it yield **bonus resources** on the ground |

- **Tactics:** open every big fight with Tearblast on the dangerous component (disc launchers, Ravager cannon), then Precision the exposed weakpoint.

### 1.3 War Bow — the elemental bow
- **Role:** short range, very fast draw, LOW impact/tear — exists purely to inject status.
- **Ammo:** Shock Arrow, Freeze Arrow, Corruption Arrow (Shadow tier has all three).
- **Tactics:** 3–5 freeze arrows → Frozen state → swap to damage weapon. Shock → Critical Hit window. Never used alone.

### 1.4 Sling — elemental grenades
- **Role:** lobbed AoE elemental bombs, arcing trajectory, slow fire.
- **Ammo:** Freeze Bomb, Shock Bomb, Fire Bomb (~20 impact + ~50 elemental each (approx)).
- **Tactics:** freeze a herd at once; cheapest way to mass-apply severity.

### 1.5 Blast Sling — explosives
- **Role:** raw AoE impact damage (blast ignores armor positioning).
- **Ammo:** Blast Bomb (base); higher tiers add **Sticky Bomb** (adheres, timed fuse) and **Proximity Bomb** (thrown mine).
- **Tactics:** crowd damage, breaking clustered components, finishing frozen targets.

### 1.6 Tripcaster — the ambush tool
- **Role:** fires tripwires between two anchor points. **Two shots per wire**: first shot plants anchor A, second plants anchor B and arms the line.
- **Ammo:** Shock Wire, Blast Wire, Fire Wire (Shadow).
- **Tactics:** pre-fight setup; lure machine (Lure Call skill / rock throw) through the wire. Shock wire → stun → Silent Strike/Critical Hit.

### 1.7 Ropecaster — the tie-down
- **Role:** ZERO damage; fires ropes that stake a machine to the ground. Bigger machines need more ropes (Watcher 1–2, Thunderjaw 5+ (approx)). Tied machines struggle, then break free after a while; each rope has its own anchor visual.
- **Ammo:** Rope (tiers = stronger rope, fewer needed).
- **Tactics:** immobilize → free crit window; a fully tied machine can be **overridden even in combat**.

### 1.8 Rattler — the shotgun/SMG
- **Role:** burst of **5 bolts per trigger pull**, huge spread, point-blank only. Highest close DPS.
- **Ammo:** Metal Bolts, Shock Bolts (tiered).
- **Tactics:** dump into a tied-down or stunned machine's weakpoint.

### 1.9 Spear (melee, always equipped)
- Light attack (fast swipe) + Heavy attack (slow overhead, high damage + knocks components loose).
- **Silent Strike:** instant-kill melee on unaware small machines/humans (skill).
- **Critical Hit:** prompt-driven high-damage stab on downed/stunned/tied machines (skill).

### 1.10 Frozen Wilds additions

| Weapon | Behavior |
|---|---|
| **Stormslinger** | Shock bolt-thrower; damage escalates with consecutive hits; can overcharge — but overcharging shocks ALOY (self-damage risk/reward). 5-shot clip (20 improved) |
| **Icerail** | Short-range freeze stream/projectile; low damage, extreme Freeze severity; 20 charges |
| **Forgefire** | Flamethrower; medium fire damage stream + leaves burning ground patches (DoT area) |

**Browser adaptation:** minimum faithful set = Hunter Bow (3 ammo), Sharpshot (Precision
+ Tearblast), War Bow (Shock + Freeze), Tripcaster (Shock wire), Ropecaster, Blast Sling.
Rattler/FW weapons are flavor, cut first.

---

## 2. Weapon wheel UX (exact)

1. **Open:** HOLD L1 (PS4) / **HOLD Tab** (PC). Releasing the hold closes it and equips the highlighted selection.
2. **Time slows** while open — NOT paused. PC/remaster expose a setting (None / Normal / Slow / Slowest); default Normal, roughly 25–30% speed (approx).
3. **Layout:** radial wheel, **exactly 4 weapon slots** (assigned in inventory). Each slot displays the weapon's **ammo icons, not the weapon** — up to 3 ammo types fan out per slot; you highlight a specific *ammo*, so wheel-select = weapon + ammo in one gesture. Right stick / mouse direction highlights.
4. **Ammo counts** shown per ammo icon; center shows highlighted item name.
5. **Craft in the wheel:** the highlighted ammo's recipe (resource icons + have/need counts) renders below the wheel; **hold X (PS4) / hold indicated key (PC)** to craft a batch without closing the wheel. Insufficient resources = greyed prompt.
6. **Fast equip:** keys **1/2/3/4** equip wheel slots directly without opening it.

**Browser adaptation:** hold-Tab radial with `timeScale = 0.25`; 4 slots × up to 3 ammo
petals; hold-F (or hold-LMB) to craft highlighted ammo; release-to-equip. This is a
top-3 fantasy feature — worth polish.

---

## 3. Ammo crafting (craft-anywhere)

No benches, no cost to accessibility: craft from the **weapon wheel** or the Crafting
menu at any time, including mid-combat.

### Resource → ammo mapping (faithful)

| Resource | Source | Used for |
|---|---|---|
| **Ridge-Wood** | wood piles / branches everywhere in the world | shaft of EVERY arrow/bolt ammo |
| **Metal Shards** | every machine kill; ALSO the game's currency | arrowheads for kinetic ammo (dual-use is a core loop!) |
| **Blaze** | Striders, Grazers, Bellowbacks, Thunderjaw... | Fire ammo, Blast wire |
| **Chillwater** | Sawtooth, Lancehorn, Glinthawk, Snapmaw, Behemoth... | Freeze ammo |
| **Sparker** | Watchers, Sawtooth, Thunderjaw... | Shock ammo |
| **Echo Shell** | Longlegs, Behemoth, Stormbird, Thunderjaw... | Tear ammo (Tearblast/Harvest) |
| **Blastpaste** | machines / Fireclaw region | Blast Sling bombs, Blast wire |
| **Wire** | most machines | Tripcaster wires, traps |
| **Metal Vessel** | machine loot | potions, pouch upgrades |

### Verified recipe (anchor your economy to this)
- **Hunter Arrows: 2 Ridge-Wood + 1 Metal Shard → batch of 10** (12 with Ammo Crafter skill).

### Suggested recipes for the rest **(adaptation, tuned to feel right)**

| Ammo | Recipe | Batch |
|---|---|---|
| Hardpoint Arrow | 2 Ridge-Wood + 5 Shards | 5 |
| Fire Arrow | 2 Ridge-Wood + 1 Blaze | 5 |
| Precision Arrow | 4 Ridge-Wood + 10 Shards | 3 |
| Tearblast Arrow | 4 Ridge-Wood + 2 Echo Shell | 2 |
| Shock / Freeze Arrow | 2 Ridge-Wood + 1 Sparker / Chillwater | 5 |
| Elemental Bomb (Sling) | 3 Ridge-Wood + 2 element resource | 3 |
| Blast Bomb | 3 Ridge-Wood + 2 Blastpaste (or 10 Shards) | 3 |
| Shock Wire | 4 Wire + 1 Sparker | 2 |
| Rope | 6 Wire | 2 |
| Rattler Bolts | 1 Ridge-Wood + 3 Shards | 10 |

---

## 4. Inventory

Categories (real game): **Weapons satchel, Outfits satchel, Modifications satchel,
Resources satchel, Potions pouch, Traps pouch**, plus **per-weapon ammo pouches/quivers**
(Hunter Bow quiver, Sharpshot quiver, War Bow quiver, Sling pouch, Blast Sling pouch,
Tripcaster pouch, Ropecaster pouch, Rattler pouch) and the Medicine Pouch.

- Every capacity is upgradeable **4 times** via Crafting menu → "Carry Capacity".
- Upgrade costs = Metal Shards + Ridge-Wood + **animal parts** (boar skin, rabbit bone, fish bone, fox skin — rarity grey/green/blue). Example: Resources Satchel #4 = 125 Shards + 50 Ridge-Wood + 1 Boar Skin → capacity 100. Potions Pouch #1 = 30 Shards + 50 Ridge-Wood + 15 Metal Vessel → 6 per potion type.
- Resources over capacity simply can't be picked up ("satchel full").

**Minimal faithful browser version:** one inventory screen (key **I**) with tabs
[Resources | Ammo | Potions/Traps | Modifications | Special]; hard caps per
resource (~100) and per ammo type (Hunter 100 / Hardpoint 50 / Precision 25 /
Tearblast 10 / elemental 40 / bombs 20 / ropes 30 (approx of upgraded-mid caps));
skip pouch upgrades or offer a single "upgrade satchel" craft for flavor.

---

## 5. Loot

### Machine loot tables (verified drops)

| Machine | Always/common | Rare |
|---|---|---|
| **Watcher** | Metal Shards, Sparker, Wire | Machine Core (Small), Watcher Lens, Watcher Heart |
| **Sawtooth** | Metal Shards, Blaze, Sparker, Wire, Chillwater | Machine Core (Med), Luminous Braiding, Sawtooth Lens, Sawtooth Heart |
| **Behemoth** | Metal Shards, Chillwater, Echo Shell, Sparker | Crystal Braiding, Behemoth Lens, **Behemoth Heart** (sells 140); carries a dislodgeable **loot crate component** — shoot the crate holders off before killing it or the bonus loot is destroyed |
| **Thunderjaw** | Metal Shards, Blaze, Chillwater, Sparker, Echo Shell | Crystal Braiding, Machine Core (Large), Thunderjaw Lens, **Thunderjaw Heart** (sells 200) |

Pattern to generalize: every machine drops **Shards + its element resources + Wire**;
mid+ machines add a **Machine Core**; every species has a **Lens** (green, trades for
good outfits) and a **Heart** (blue, trades for the best gear). Components shot OFF the
machine before death are lootable separately where they fell (Harvest Arrow synergy).

### World loot
- **Medicinal plants** (glowing green herbs) → fill the **medicine pouch**, not inventory: Hintergold +10%, Ochrebloom +16%, Wild Ember +20%, Salvebrush (~+10%).
- **Ridge-Wood piles** at tree bases/bushes.
- **Berries/meat/skins** from wildlife (pouch upgrades, potions).
- **Supply crates / loot boxes** in bandit camps & ruins: shards, ammo, resources, mods.

### Loot interaction UX (exact)
- Approach corpse/crate → floating button prompt. PC: **E** (brief hold), PS4: Triangle.
- Opens a small **loot list popup** at the interaction point: item icons + counts + a **"Take All"** action. Game does NOT pause; Aloy plays a crouch-rummage animation.
- Focus mode highlights lootable bodies/crates purple/yellow.
- Looted corpses show an emptied indicator.

**Browser adaptation:** hold-E 0.3 s → toast-style loot panel with Take All (Enter);
auto-take-all on plain E press is an acceptable streamline (HFW did exactly this).

---

## 6. Health & medicine

- **Health bar** top-left; max HP grows with level (base 100 → ~430 at 50 (approx)).
- **Medicine Pouch:** a SECOND green bar/meter under health. Harvesting medicinal plants adds % to the pouch (base capacity 100 units). Press **Q (PC) / D-pad Up (PS4)** to start converting pouch → health *gradually over time* (tick heal, ~10 HP/s (approx)) — not an instant chug; can be done while sprinting/fighting.
- **Potions** are separate items in the tools rotation: Health Potion (crafted from meat), Full Health Potion, Antidote, elemental resist potions. Select with tool-cycle (**Z/X** on PC), use with **F**.
- Skills: Herbalist (pouch capacity ×2), Healer (conversion rate ×3).
- **Berry refill loop:** medicinal plants are everywhere → the rhythm is "fight, then wander picking glowing herbs to top the pouch back up."

**Browser adaptation:** health bar + green pouch bar; herbs as glowing pickables that add
25 units; Q drains pouch→HP at 15/s. Skip potions if tools UI is cut — the pouch IS the
fantasy. (Repo already rewards medicine on kill — consider moving refills to herb nodes
for faithfulness.)

---

## 7. Player movement & combat feel

| Move | Real-game behavior |
|---|---|
| Jog (default) | brisk; Aloy never walks slowly outside cutscenes on PC (analog on pad) |
| **Sprint** | hold Shift; ~1.4x jog (approx); can draw bow while sprinting (aim slows you to a walk) |
| **Dodge roll** | single tap Ctrl (+direction) = full combat roll, ~0.8 s, with a TIGHT i-frame window mid-roll (approx 0.2–0.3 s); chainable with a pause; the primary defense — big machine attacks are dodged, not tanked |
| Crouch | toggle C; slower move, silent-ish; **in tall red grass while crouched = hidden** (machines lose track unless very close or grass is trampled by searching machines) |
| Slide | **NOT in HZD** — sliding is a Forbidden West feature. Don't add it if faithful. |
| Jump | Space; modest hop, contextual climb on marked ledges |
| Aim | hold RMB: camera to shoulder, FOV tightens, movement slows to strafe-walk |
| **Concentration** | while aiming, press **Shift (PC) / R3 (PS4)**: time slows (~30% (approx)) for up to **6 seconds** shown as a draining gauge next to the reticle; refills in ~6 s when fully drained; cancel early = proportionally faster refill. It's a *meter*, not a cooldown-ability |
| **Silent Strike** | melee prompt on unaware enemy (from grass/behind): instant-kills humans & small machines (Watchers, Striders); big damage + brief stun on mediums |
| Detection | indicator over enemy head: white eye (calm) → yellow "?" (investigating, moves to last seen point) → red "!" (combat) |

**Feel notes (community consensus):** bow shots have generous but honest projectile
physics — arrows have travel time and drop at long range; hit feedback = damage numbers
popping off the hit point + sparks; full-draw release has a subtle screen kick;
Concentration + full draw + weakpoint is THE signature moment of the game.

---

## 8. XP, levels, skills (skim)

XP from kills (more for bigger machines/weakpoint kills) and quests; each level grants a
skill point + small max-HP bump; cap 50 (60 with Frozen Wilds). Three trees — **Prowler**
(stealth: Silent Strike+, Dodge Prowess, Low Profile), **Brave** (combat: Concentration,
Concentration+, Double/Triple Shot, Fast Reload, Critical Hit), **Forager** (utility:
Lure Call, Healer, Herbalist, Ammo Crafter, Tinker) — plus Frozen Wilds' Traveler tree
(mount repair, Dismount Strike). Skills cost 1–3 points, gated by tier rows.

**Top 3 for a demo:** 1) **Concentration** (aim slow-mo — the game's identity),
2) **Silent Strike** (makes stealth grass + crouch meaningful), 3) **Double/Triple Shot**
(nock 2–3 arrows at once — the power-fantasy upgrade). Honorable mention: Lure Call.

---

## 9. PC keybinds — 2020 port defaults (verified)

| Action | Key |
|---|---|
| Move | **W A S D** |
| Jump | **Space** |
| Sprint | **Left Shift** (hold) |
| Crouch/stealth | **C** (toggle) |
| Dodge roll | **Left Ctrl** |
| Aim | **RMB** (hold) |
| Fire (while aiming) | **LMB** |
| Reload | **R** |
| Light melee | **LMB** (not aiming) |
| Heavy melee | **Left Shift + LMB** |
| Concentration | **Left Shift** (while aiming) |
| Weapon wheel | **Tab** (HOLD) |
| Fast weapon equip | **1 / 2 / 3 / 4** |
| Focus mode | **V** |
| Tag target (in Focus) | **LMB** |
| Use tool/trap/potion | **F** |
| Cycle tools | **Z / X** |
| Use medicine pouch | **Q** |
| Interact / loot | **E** |
| Inventory | **I** |
| Crafting menu | **O** |
| Map | **M** |
| Quests | **J** |
| Skills | **K** |
| Notebook | **N** |
| Show HUD/objectives | **H** (hold) |
| Manual save | **G** |
| Pause | **Esc** |

Note the Shift double-duty: sprint on foot, Concentration while aiming, heavy-melee
modifier. This is faithful — keep it.

---

## PRIORITY — what sells the fantasy (build in this order)

1. **Tear/component system** — shooting parts OFF machines (Tearblast!) is HZD's one-line pitch. Even 2 detachable components per machine transforms combat.
2. **Concentration** — Shift-while-aiming slow-mo with a 6 s draining gauge. Cheap to build, defines the moment-to-moment feel.
3. **Weapon wheel** — hold Tab, time-slow, 4 slots, ammo petals, hold-to-craft inside the wheel. The most recognizable UI in the game.
4. **Bow feel** — draw-time charge, arrow travel + drop, damage numbers on hit, weakpoint multiplier sparks.
5. **Elemental states** — at minimum Freeze (brittle 2x) and Shock (stun), fed by War Bow/Sling; creates the freeze→burst loop.
6. **Dodge roll with i-frames** (Ctrl) — combat is unplayable-feeling without it.
7. **Medicine pouch + glowing herbs** — the green second bar and Q-to-heal-over-time.
8. **Loot popups + resource economy** — shards-as-currency-and-ammo, craft-anywhere.
9. **Stealth grass + Silent Strike** — red tall grass, detection ?/! indicator.
10. Ropecaster/Tripcaster setups — high tactical flavor, build last.
