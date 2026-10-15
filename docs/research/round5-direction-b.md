# Round 5 — Creative Direction B (play-first): **UNBUILT**

Owner: creative director B (play-first lane), Round 5, Oct 15 2026.
Status: proposal for Kevin. Everything here can be produced with the proven Round-5 pipelines (`docs/research/round5-pipeline-humans.md`, `docs/research/round5-pipeline-creatures-world.md`) and fits their budgets. Where it needs a change to kept code, §11.7 names the change.

**Method.** I started from what the player must read and decide in a fight. Then I chose the place and look that make those reads easiest. Every rule in §2 has a proposed literal gate (§11.6). The design sheets below are rendered from metre-space sketches by `tools/r5-direction/sheet-b.mjs`, at the game camera's real pixel scale.

| sheet | what it shows |
|---|---|
| `docs/media/r5-direction-b/roster-read.png` | all 12 machines plus the heroine, side view, at **40 m** (21.6 px/m) and **100 m** (8.64 px/m), with weak points in their code colours |
| `docs/media/r5-direction-b/palette.png` | every swatch in this document, grouped |
| `docs/media/r5-direction-b/logo.png` | the wordmark mock: Julius Sans One with the Round-3 spark pinned to a survey chain |

Literal checks run for this document:

- `node tools/r5-direction/sheet-b.mjs`: silhouette pre-check. **Max pairwise IoU 0.292** (Tiller/Gantry), mean 0.097, over the 12 sketch silhouettes normalised to one box. Every primary weak point is **≥ 5.6 px at 40 m** except Picket (3.9 px), which dies to any hit (§2.2).
- `node tools/r5-direction/names-check.mjs`: 108 proposed names against 235 Horizon names and terms (189 single words, 46 phrases). **0 HIT**, 1 GENERIC, 1 ROOT, 17 NEAR; all of these are reviewed in §10.2.

---

## 0. The pitch on one screen

**Title:** **UNBUILT**. The lockup line is *The Sounding Coast*.

**Premise (one line):** For four hundred years a fleet of ceramic survey and construction machines has been laying out a city that nobody ever came to live in. Anything not on the Plan gets cleared, including you.

**Who you are:** **Isa Brack** is a *linewalker* of the fog-catching Netfolk. She hunts the machines (locals call them **the Works**) by reading their lamps, prying off their tools and pinning their legs. She also moves their survey stakes so her village stays off the Plan.

**Why this setting, play-first:**

- **A monochrome world makes the fight readable.** The ground is black sand, white salt and grey basalt under sea fog. That leaves saturated colour free for gameplay: lamps, element reservoirs, the UI. A weak point glowing orange at 40 m is the only orange thing on screen.
- **Fog is a scheduled play system, not mood.** The cold-current coast has a real daily sea fog (the *haar*) that rolls in at dawn and dusk. Those are stealth windows. The machines see with **lamps whose beams are visible in the fog**, so the player sees each perception cone directly.
- **Construction machines give each fight its own shape.** Every machine is a tool with an obvious working end: a tripod sentry, a plough charger, a furnace artillery piece, a crane boss. The working end is the attack, and you can pry it off. "Break the drum and it can't charge" is legible at a glance.

**The five play pillars.** Each one has a gate (§11.6):

1. **Readable at 40 m.** Each machine has one "shape word" and a distinct silhouette. State is shown by lamp shape, beam and colour. Primary weak points are at least 5 px at 40 m.
2. **Every weapon is a decision.** Six weapons with six verbs: shoot, strike, pin, heave, throw, guard. Each one wins a scripted scenario that the others lose.
3. **Armor changes a verb, not a percentage.** Each of the 12 variants changes how you play: noise, beam-lock time, parry window, pin time, wading. Each change is measurable.
4. **Fog and tide are clocks you plan around.** Haar windows (stealth), wind-clear afternoons (sniping) and low tide (routes and caches).
5. **Setups beat reflexes.** Lure a Harrow into basalt columns, pin a Shear's foot, heave a Kite out of the sky, fog a Plumb's beam. The surveyor's fantasy is preparation.

**Loops:**

- **10 seconds:** read the lamp, pick the channel, hit the part.
- **10 minutes:** scout with the Sightglass, set up (stake, pot, lure), fight, pry loot, pull stakes.
- **1 hour:** haar dawn hunt, village, cross the Pan at noon, Salter trade, a large-machine fight at dusk, the Footings on the skyline (§8.9).

---

## 1. Title, premise, setting

### 1.1 Title

"Horizon" and "Zero Dawn" are Sony marks, and the old structure "[Word] Zero Claude" reads as a deliberate echo. Kevin asked for distinct, so this drops the pattern entirely.

| candidate | verdict | why |
|---|---|---|
| **UNBUILT** | **recommended** | It names the core fiction: a city that was never built and machines still building it. Short and ownable, and it reads as an action title. A web search found no game with this name (Oct 15 2026). That is not trademark clearance: run a USPTO/EUIPO search before any public release |
| DATUM | alternate | The survey origin point, and the spark *is* a datum mark. Cold, and players don't know the word |
| THE SOUNDING COAST | kept as the region and the logo's second line | The place name; "sounding" means measuring depth, a survey word at sea |
| anything with Salt- (Saltline, Saltreach…) | rejected | crowded: *Salt*, *Salt and Sanctuary*, *Saltsea Chronicles* |
| HAAR | rejected | *It Sleeps Below the Haar* (2024) owns it in games. The word stays as our in-world name for the fog |
| Concord / Uncharted / anything with Horizon, Zero, Dawn | rejected | Sony marks (*Concord* is Firewalk/Sony, 2024) |

**Logo treatment** (`docs/media/r5-direction-b/logo.png`):

- **Wordmark:** "UNBUILT" in **Julius Sans One** (already shipped, SIL OFL), caps, 0.31 em tracking, in paper `#EFE7D8` on ink `#10161C`.
- **The rule:** the Round-3 rule becomes a **surveyor's chain**, a 2 px terracotta line with minor ticks every 23.5 px and major ticks every fifth.
- **The spark:** the **Claude spark** (Round-3 geometry, `#DA7756`, verbatim from `index.html`) **sits on the chain at the left third as the datum**. It is pinned, not rising. A soft glow sits behind it and a dashed plumb line drops from it.
- **Second line:** "THE SOUNDING COAST" at 23 % size, 0.57 em tracking.
- **Animated title** (title screen only): the chain draws left to right in 0.8 s. The spark lands on its tick with a single ceramic *tink*. Then the letters of UNBUILT draw in as cobalt dashed construction lines and fill to paper. The word is "built" in front of you, never quite finished: the final T's crossbar stays a dashed line.
- **Favicon:** the spark on a two-tick chain stub.

### 1.2 Premise and fiction (what the builders need to know)

- **The Charter.** A city-founding enterprise landed an automated fleet on an empty volcanic coast to lay out and build a city before its settlers arrived. The city on the drawings is **Tessera** ("tile" in Latin): every street, lot, kiln and cistern drawn on **the Plan**.
- **The settlers never came.** Nobody in-world knows why, and the game does not need to answer.
- **The Works kept building.** It is now Year 412 of the Plan. They survey, stake, fire tiles, lay foundations, lose them to the dunes and lay them again. The entire map is a construction site that never finishes.
- **Why they are hostile.** They are not evil and not corrupted. They **clear obstructions from the Plan**. A person standing on a planned street is a rock to be moved. Off-plan ground is mostly safe; on-plan ground is patrolled.
  - This gives an always-legible rule: **stake lines and beacons show where the Works will come.**
- **People.** Shipwrecked and migrating peoples settled the gaps over the centuries:
  - the **Netfolk**, who harvest water from the fog with nets on the dune ridge;
  - the **Salters**, who quarry the salt pan and trade along the coast;
  - the **Assessors**, zealots who believe the settlers will come once Tessera is finished. They herd the Works with lamp signals and "assign" people to lots. Comb, the Netfolk village, stands where the Plan draws a cistern.
- **Tone.** Weathered, practical, quietly eerie. Not post-apocalyptic: nothing ended, something just never started.

### 1.3 Location: the Sounding Coast, with real-world reference points

A fictional cold-current fog desert on a young volcanic coast. Each reference supplies one specific, buildable thing:

| reference (real place) | what we take | used in |
|---|---|---|
| **Skeleton Coast / Namib, Namibia** (cold Benguela current) | fog desert meeting a cold sea; daily advection fog; shipwrecks half-buried in sand | climate, the Hull, the Black Strand |
| **Alto Patache and Chungungo, Atacama, Chile** (fog-catcher nets, *atrapanieblas*) | rows of mesh panels on poles along a ridge, catching fog drip into gutters | Comb's nets: the settlement's silhouette and its water economy |
| **Reynisfjara, Iceland**, and **Giant's Causeway, Northern Ireland** | black-sand beach, sea stacks, hexagonal basalt columns | the Black Strand, the Organ Shelf, the Lamp stack |
| **Salar de Uyuni, Bolivia**, and **Danakil / Lake Assale, Ethiopia** | polygonal salt crust; a mirror-water sheet after rain or tide; salt cut into blocks and carried by caravan; salt-block buildings | the Pan, Whitecut, the Salters |
| **Lac Rose / Lake Retba, Senegal**, and the **San Francisco Bay salt ponds** | **pink brine** coloured by *Dunaliella* algae | the Salt channel's colour, the brine ponds on the Pan's south edge |
| **Lençóis Maranhenses, Brazil** | white dunes with clear blue-green freshwater lagoons between them | the Lagoons, home of the Weir |
| **La Geria, Lanzarote** (vines in ash pits behind crescent stone walls, *zocos*) and **Timanfaya** | black ash fields with crescent dry-stone walls sheltering single plants | the ash-pit fields around Comb |
| **Staffordshire bottle kilns** (e.g. Gladstone Pottery Museum, Stoke-on-Trent) | the bulb-and-chimney oven silhouette | the Kiln machine, the Bottle Kilns landmark |
| **Delftware / blue-and-white porcelain** | cobalt underglaze line decoration on white glaze | the Works' glyph decals, the Assessors' tiles and tabards |
| **Survey ranging poles, plumb bobs, theodolites, surveyor's chains** | red/white 20 cm banding, pendulum weights, lens drums, chain ticks | weapons, machines, UI, logo |

### 1.4 Era, climate

- **Era:** Year 412 of the Plan. Technology:
  - **People:** pre-industrial craft (ceramics, bronze casting, rope, sailcloth, glass beads) plus salvage from the Works (ceramic plates, bronze springs, lenses).
  - **The Works:** advanced, but analogue in look. Lamps, springs, bells, kilns; no screens and no holograms.
- **Climate:** cool fog desert.
  - Air: 11–19 °C by day, 6–9 °C at night.
  - Water: almost no rain, but **daily fog**. The haar thickens from 04:30, burns off by about 10:00, and returns thin from 19:00.
  - Wind: a steady onshore breeze, rising to strong wind on clear afternoons (17:00), and **rare sea storms**.
  - Tides: two low and two high a day (§8.8).

### 1.5 Time-of-day palette and weather

These are environment hour keyframes (`world/environment.js`). Only the values change; the system is kept.

| hour | name | sky zenith | sky horizon | sun / moon | fog colour | `densMul` | play meaning |
|---|---|---|---|---|---|---|---|
| 04:30 | pre-dawn | `#2A3445` | `#5E6E7A` | moon `#9FB2C8` | `#6F7C86` | 2.6 | haar forming; lamps and beams dominate |
| 06:30 | **haar dawn** | `#8D9AA5` | `#C9CFCF` | `#F2E2C4`, `sunMul` 0.35 | `#C9D0D3` | 3.2 | white-out, 25–60 m visibility: **the stealth window** |
| 09:30 | burn-off | `#7FA3BC` | `#C3D2D8` | `#FFF1D6` | `#D2D9DB` | 1.6 | fog lifts to a low ceiling in bands; windows open and close |
| 13:00 | flat noon | `#8DB1CA` | `#D4DEE2` | `#FFF8EC` | `#DCE3E6` | 0.9 | salt glare (grade exposure −0.2); open-ground crossing is dangerous |
| 17:00 | **wind-clear** | `#5F8DB0` | `#BFD0D8` | `#FFE2B0` | `#BFCBD2` | 0.7 | longest sightlines: **the sniping hour**; Kites fly highest |
| 19:30 | copper | `#3E4F6E` | `#E9A576` | `#E88A4E` | `#C88E72` | 1.1 | basalt goes black, salt goes copper; the Works return to the kilns |
| 21:00 | dusk haar | `#1E2638` | `#4A5566` | — | `#3E4A57` | 2.2 | thin haar; beams visible; Assessor lamp signals |
| 00:00 | night | `#0E141F` | `#1E2A38` | moon `#9FB2C8` | `#1C2430` | 1.0 | lamps only; sleep at Comb to skip |

Weather rows. The fields are the `WEATHER` table's fields; add `haar` and `seastorm`, and retune `clear`:

| state | `sunMul` | `hemiMul` | `cloud` | `densMul` | `wind` | `desat` | new field `fogFalloff` (replaces the fixed `FOG_HEIGHT_FALLOFF 1/140`) |
|---|---|---|---|---|---|---|---|
| `haar` | 0.35 | 1.6 | 0.6 | 3.2 | 0.6 | 0.45 | **1/18**: a fog that hugs the ground (stack tops and the Shelf rise out of it) |
| `clear` (wind) | 1.0 | 1.0 | 0.25 | 0.7 | 1.6 | 0.0 | 1/140 |
| `overcast` | (keep) | | | | | | 1/90 |
| `seastorm` | 0.15 | 1.7 | 1.0 | 2.6 | 2.6 | 0.7 | 1/60, rain 0.6. Rare, authored for one quest |

---

## 2. The readability contract (every asset is graded on this)

### 2.1 One shape word per machine

Each machine is designed around **one word a player would shout**:

> table on stilts · lamp on a tripod · walking stakes · open scissors · rolling pin · bottle oven · crane · crawling sluice · barrel train · box kite on a string · gyroscope on stilts · walking tower crane

The sketch pre-check gives **max pairwise silhouette IoU 0.292, mean 0.097**. The five closest pairs:

| pair | IoU |
|---|---|
| Tiller / Gantry | 0.292 |
| Shear / Harrow | 0.289 |
| Plumb / Picket | 0.281 |
| Tiller / Winch | 0.278 |
| Weir / Sounder | 0.278 |

None of these pairs is confusable in play, because size separates them: Tiller is 2.8 m and Gantry 18 m; Plumb is 3.5 m and Picket 1.2 m. Proposed gate **A-sil40**: rendered model silhouettes, side and front, keep pairwise shape-IoU ≤ **0.45**. The sketches leave room for real models, which are fuller.

### 2.2 The weak-point grammar: four kinds, one look each

| kind | what it looks like | how you hit it | what happens | engine |
|---|---|---|---|---|
| **Lamp** (sensor) | glazed glass lens behind an **iris**, glowing in the state colour; always at the "head" end | any precise hit (Impact ×2.5) | **Blinded**: the lamp goes dark (`#3B3A36`) and sputters; perception in that lamp's arc is off for 6 s. A Plumb or Kite blinded before it flags you **cannot raise the alarm** | `Part{weak:true}` + a perception hook |
| **Reservoir** | glass-windowed bronze vessel of glowing fluid; **shape-coded by channel**: Burn = round flask, Arc = ribbed coil, Salt = hexagonal cell | Pry or precision cracks it | it bursts: its channel fills to 100 on the machine and within 3 m. Same channel → Impact ×2 on the burst | `Part{elemental}` (existing) |
| **Tool** (the working end) | unlit **bronze** (`#9A6B35`): blade, drum, mortar, hook, ring | **Pry** (tear) | it tears off. **Its linked attack is gone** (Harrow drum → no charge) and it drops loot | `Part{tearHp, linkedAttack}` (existing) |
| **Joint** | dark graphite rings at hips, knees and slewing bearings | **Salt** crusts them pink; the **Stakedriver** pins a planted foot | Brittle (Impact ×2, gait ×0.6) or Pinned (§5.3) | elemental + `gait` ADAPT |

**Size rule.** Each machine's **primary** weak point is at least **0.25 m** across, which is **≥ 5.4 px at 40 m**. Sketch values (diameter in m, px at 40 m):

| | Tiller | Plumb | Shear | Harrow | Kiln | Winch | Weir | Sounder | Kite | Spindle | Gantry |
|---|---|---|---|---|---|---|---|---|---|---|---|
| m | 0.32 | 0.34 | 0.26 | 0.48 | 0.76 | 0.60 | 0.30 | 0.44 | 0.32 | 1.44 | 0.70 |
| px at 40 m | 6.9 | 7.3 | 5.6 | 10.4 | 16.4 | 13.0 | 6.5 | 9.5 | 6.9 | 31 | 15 |

Picket is exempt: 3.9 px, but it dies to any hit.

**Contrast rule.** Lamps and reservoirs reach ≥ 3:1 luminance contrast against the surrounding hull at noon and in haar.

### 2.3 The colour budget: "greyscale plus one"

- **World:** desaturated by construction. Black sand, white salt, basalt, fog.
  - The **only saturated world colours carry gameplay:**
    - pink **brine ponds** apply Salt when you wade in them;
    - turquoise **lagoons** are Weir water;
    - orange lichen on basalt marks climbable 1 m ledges.
- **Machines:** glazed bone, celadon, oxblood, bronze; mid-chroma at most.
- **Saturation belongs to:** lamp states, the three channels, Isa's red/white rod (you must always find yourself), and the UI.
- Swatches: §9.1 and `palette.png`.

### 2.4 State is shape, then motion, then colour

| state | iris | beam | colour | sound |
|---|---|---|---|---|
| calm | wide (100 %) | off | bone white `#F4EBD0`, steady | low hum |
| wary | half (50 %) | **on**, sweeping 0.5 Hz toward the stimulus | sodium `#FFC94A`, slow pulse | rising two-note bell |
| hostile | pinhole (20 %) | **on, locked** on the target | kiln red `#E5402A`, 2 Hz flicker | bell clang + ratchet |
| blinded | closed, cracked | off | dark `#3B3A36`, spark sputter | glass crack |

**Beams.** One `InstancedMesh` of additive cones (`depthWrite:false`) serves **all** machines: **1 draw call**.

- Length is the machine's current sight range × the fog factor.
- Beams are drawn only in wary/hostile, and only when fog `densMul > 1.2` or at night.
- It costs one fill-rate-light shader; the GPU cost goes into the A21 ledger.

### 2.5 Damage channels and player-facing words

The engine's three-channel model is kept (SPEC §8); only the names and fiction change.

| player word | engine channel | what fills it | at 100 / effect |
|---|---|---|---|
| **Impact** | `impact` | Bodkin arrows, stakes, Rod, Maul | health; weak-point multipliers |
| **Pry** | `tear` | Prybarb arrows, Gaff heave, Billhook heavy | tears tools; cracks reservoirs; ×0.25 on plates |
| **Burn** | `fire` | Oilhead arrows, Oil pots, Kiln glaze | 8 s burn (existing) |
| **Arc** | `shock` | Coilhead arrows, Conductor Gaff, Arc coils | 3 s stun (existing) |
| **Salt** | `freeze` | Brinehead arrows, Brine pots, brine ponds, the Weir | 8 s **Brittle**: Impact ×2 (existing) **plus** gait speed ×0.6 and a pink crust on the joints (new) |

Other words:

| word | meaning |
|---|---|
| **Flagged** | a Picket, Plumb or Kite has marked you. A survey flag is planted at your feet and every Work within 60 m knows where you are for 20 s. Pulling the flag (hold E, 0.45 s) clears it early |
| **Pinned** | a leg held planted by a stake |
| **Steady** | slow time while looking through the Sightglass; the old Concentration slot |
| **Sighting** | the scanner mode |
| **Undercut** | the stealth kill |
| **Felling blow** | the critical on a downed machine |
| **Tiles** | currency: kiln-fired Charter tiles stamped with plan coordinates |
| **Dew flask** | healing |

### 2.6 Fog is a system

| system | change |
|---|---|
| **perception** (`ai/perception.js`, KEEP + one ADAPT) | sight range × **fog factor** (haar 0.35, thin haar 0.6, clear 1.0, night 0.7 with lamps lit). A crouched player in haar beyond 12 m is hidden, as if in tall grass today. The **beam-lock time** is the existing `visibleT` threshold, raised by Lampblack armor |
| **weather** (`environment.js`) | `haar` row and per-weather `fogFalloff`; the schedule in §1.5 |
| **Haar pot** | a local fog volume, radius 8 m for 12 s. A `stampStealthDisc(x, z, 8)`, plus a camera-facing fog card cluster (1 draw) |
| **draw distance** | during haar the far plane and scatter cull drop to 140 m: haar frames are the cheapest frames in the game |

---

## 3. The protagonist: **Isa Brack**

| | |
|---|---|
| name | **Isa Brack**. "Brack", as in brackish water, is her line-name, given when she walked her first survey line. People call her Brack |
| age, culture | 24. Netfolk of Comb. Trained as a linewalker by **Ode Fenn**, the old linewalker who is her mentor |
| role | she reads the Plan, moves stakes, and hunts Works that come onto Netfolk ground |
| voice (play-first barks) | short, practical callouts that also teach: "Lamp's up." · "Flagged. Pull it." · "Drum's off — it can't charge." · "Haar's coming in." |

### 3.1 Isa vs Aloy, in one glance

> **Deep-brown skin, black hair shaved at the sides with one thick rope braid ending in a terracotta plumb-bob weight, a terracotta line painted straight across both cheekbones, an indigo oilskin hooded half-coat, one white ceramic pauldron on the left shoulder, and a red-and-white banded survey pole across her back.**
> Aloy is red hair in many beaded braids, freckled pale skin, brown leathers with teal accents and a temple-mounted Focus. Isa has no red hair, no beads, no forehead device, and a pole you can see from 100 m.

### 3.2 Body, proportions, face

- **Body:** UBC female (CC0), normalised to **1.72 m**. This keeps every absolute-metre constant comparable to the Round-4 numbers; the POC proved it. Arm 0.475 m (char space), shoulder 1.418 m raw.
  - Proportions are stock: no bone scaling on the hero.
  - The POC heroine reads as athletic and grounded, which suits a surveyor who walks all day.
- **Face** (distinctiveness without Blender). The stock UBC face is shared with other games, so it is changed in the build:
  1. **Texture layer**, composited by `sharp` in `build-human`:
     - the **datum line**: terracotta `#DA7756` paint, 8 mm tall, straight across both cheekbones and the bridge of the nose;
     - **three short tick marks** under the left eye (chain ticks; she adds one per large Work felled, a cosmetic for progression);
     - a thin scar through the left brow;
     - brows thickened and darkened;
     - skin base `#6B4430`;
     - eyes dark amber-brown.
  2. **Node-side face fields.** Six smooth displacement fields on head vertices: jaw width −4 %, cheekbone +3 mm, nose bridge +2 mm, brow ridge +2 mm, upper-lip fullness +1.5 mm, chin −2 mm.
     - They are applied in `build-human`, with normals recomputed; no new bones.
     - Gate V-isa-face: the face crop differs from the stock UBC face by ≥ 12 % of pixels at the same pose and light.
  3. Only if Kevin's V-judge rejects both, install Blender for a sculpt pass: **346 MB DMG, about 1.2 GB installed**, against about 7 GB free.
- **Hair:**
  - `Hair_BuzzedFemale` (CC0) tinted `#151313`, plus the procedural rope braid: 6 `dyn_hairBraid_*` joints, 1,104 tris, proven at 0.09–0.23 m of tip swing at sprint.
  - New: a **braid weight**. A lathe-built ceramic plumb bob, 7 cm, terracotta glaze, ≤ 300 tris, rigid on `dyn_hairBraid_end`, with spring tip mass ×1.6 so the swing reads as a pendulum.
  - The braid hangs **behind** the shoulders, so the draw hand at the cheek has nothing to pass through (Kevin's "outside the hair" rule). It still needs the M10 spring-side collider against the drawing forearm and elbow, because the elbow goes back.

### 3.3 Default outfit: Haar Coat (A1)

| piece | source | rig | tris |
|---|---|---|---|
| head and neck cut | UBC (CC0) | skin | 3.1 k |
| eyes, brows | UBC | Head | 2.3 k |
| hair shell and braid, plus weight | CC0 + generated | Head + `dyn_hairBraid_*` | 3.4 k |
| trousers, boots, bracers, belts | **MCO Ranger F** (CC0), simplified from 27 k, tinted | skin | 12 k |
| **oilskin half-coat**, waist length, high collar | generated: shell from torso/upper-arm body vertices offset 12 mm, waxed-cloth roughness | skin (copied weights) | 4.5 k |
| hood (toggle) | MCO Ranger hood (CC0), re-tinted indigo | Head / neck | 2.1 k (0 draws hidden) |
| 2 split coat tails, back, to mid-thigh | generated cards, 4 joints each: `dyn_coatTail_l/r_01..04` (`cloth` class) | spring | 0.6 k |
| **left pauldron** (bone-glaze ceramic, 3 overlapping lames) | generated lathe and plate | rigid to `clavicle_l` (**not** `upperarm_l`, so it never folds into the neck at full draw) | 1.2 k |
| chest strap with Sightglass (brass monocular, 14 cm) | generated | rigid `spine_03` | 0.5 k |
| hip quiver, right thigh; pot bandolier (3 pots), front left shoulder to right hip | generated | rigid `pelvis` / `spine_02` | 1.6 k |
| Ranging Rod on the back, diagonal from left shoulder to right hip | weapon GLB | stow socket on `spine_03` | 1.2 k |

**Totals:** about **33 k tris** carried, plus up to 3 k for the in-hand weapon: ≤ **36 k of the 40 k budget**.

**Draws:**
1. skin, eyes and brows (one atlas);
2. hair and braid;
3. outfit, coat and plates (one atlas per set);
4. carried gear, merged;
5. the in-hand weapon.

That is **5 draws**, against 73 meshes on the POC heroine today. Shadows: one merged LOD1 proxy as the only caster (× 3 cascades).

**Palette:**

| | indigo oilskin | bone pauldron | rod red | rod white | line paint | skin | hair | bronze fittings |
|---|---|---|---|---|---|---|---|---|
| hex | `#2B3A55` | `#E9E1CF` | `#C8442F` | `#EFE9DC` | `#DA7756` | `#6B4430` | `#151313` | `#9A6B35` |

### 3.4 Silhouette, three views

- **Front:** high oilskin collar framing the face; the datum line reads as one horizontal stroke; the white left pauldron sits asymmetric against the dark coat; the pot bandolier crosses the chest.
- **Side:** the hood (or braid weight) behind; the coat's hem breaks at the waist and the two tails at mid-thigh; the quiver sits on the right thigh.
- **Back:** the **red/white rod diagonal** is the read, along with the braid with its terracotta weight on the spine and the split tails.
- Gate **V-isa-glance**: braid weight, pauldron, banded rod and hood are each identifiable in the side, front and back shots at 10 m and 25 m.

### 3.5 Movement notes for this body (Kevin's rules, made specific)

- **Idle:** hands relaxed beside the thighs, as in the POC. The braid weight hangs still (≤ 6 mm drift).
- **Run:** arms swing fore-aft beside the body; the bandolier and quiver must not push the arm path inward.
  - Gate: wrist-to-torso-midline lateral distance ≥ 0.10 m through the sprint cycle.
  - Coat tails need a thigh capsule collider so they never pass through the legs.
- **Bow draw:** the archer's stance presents the **left shoulder** toward the target, which is why the pauldron is there: it faces the enemy while she draws.
  - Draw hand at the cheek, on the datum line, 0.10–0.16 m from the head.
  - Elbow level with or behind the shoulder.
  - Bow arm **165–172°** and clear of the chest.
  - Pauldron-to-head ≥ 3 cm at full draw.
  - Today's POC fails the bow arm (141°) and the elbow (9 cm low), so the first animation task is re-deriving the 12 aim constants (§11.5, phase 1).
- **Melee:** the rod is held properly in both hands, or one-handed with the Buckler (rulings R1–R9 stand). The stow is re-measured onto her back; the POC spear floats 0.2 m off.

---

## 4. Armor: 4 sets × 3 variants (each one changes a verb)

**Authoring rules (all sets):**

- **Rig and swap:** one skeleton (UBC 65-joint). Each set is one outfit GLB (≤ 0.8 MB), and each piece is a SkinnedMesh bound by joint name. A swap disposes geometry, materials, textures **and `skeleton.dispose()`** (the POC leak fix).
- **What a variant is:** **toggles, tint uniforms, and at most one extra generated piece** (≤ 3 k tris), on one atlas per set: 1 draw for set and plates.
- **Stat hooks:** every stat names the system it touches. All of them are small additions to existing systems.

### Set A: Haar Coat (hunter / stealth). Verb: **hide**

| variant | what changes visually | gameplay (system hook) |
|---|---|---|
| **A1 Haar Coat** | base (§3.3): indigo oilskin, hood toggle, net-cord trim | crouch noise −30 % (`ai/stimulus` NOISE crouch radius × 0.7); in haar, beam-lock time +40 % (`perception` visibleT threshold × 1.4) |
| **A2 Lampblack** | soot-black oilskin `#1B1C1E`, hood forced up, a linen face-wrap leaving only the datum line showing, a matte (non-glossy) pauldron | **beam-lock time +80 % in all weather**; Burn damage taken +25 % (oil-soaked) |
| **A3 Dune Coat** | sand-white coat `#E6DCC6`, sand-skirt panels over the tails, sand goggles on the hood | **slides are silent and 40 % longer** (UAL2 `Slide_*`); sprinting near a **Sounder** no longer draws it (vibration noise × 0.3); −10 % armor vs Impact |

### Set B: Kilnplate (bruiser / melee). Verb: **stand and trade**

| variant | what changes visually | gameplay |
|---|---|---|
| **B1 Sherdmail** | ceramic sherds sewn as scale over the coat torso, a larger two-piece pauldron, ceramic greaves | melee damage taken −30 %; stagger threshold +50 %; dodge distance −10 % (the cost) |
| **B2 Glazed Kilnplate** | the sherds glazed celadon `#9DB8A6` (glossy, roughness 0.22), oxblood edge banding | Burn resist 60 %; **immune to Brittle gait-slow** (Salt still fills); Kiln glaze puddles deal ×0.3 |
| **B3 Bellguard** | a bronze bell hanging under the pauldron; bell-rope lacing | **Buckler parry window +50 % (0.18 → 0.27 s)**; a perfect parry rings the bell and staggers every small Work within 6 m (Pickets, Plumbs) |

### Set C: Linewalker Harness (marksman / tactics). Verb: **measure, then shoot**

| variant | what changes visually | gameplay |
|---|---|---|
| **C1 Chainman's Harness** | open drafting harness over a linen shirt, chain-link shoulder strap, a second hip quiver | draw speed +15 % (`combat.drawStrength` rate); quiver +6 |
| **C2 Plumbline Harness** | a brass plumb line on the chest strap, a longer Sightglass with a hood | **Steady gauge +50 %**; aim sway −30 % while crouched |
| **C3 Stakeman's Harness** | a back rack of 6 flagged stakes, flags in terracotta | Stakedriver ammo +6; **pin duration +50 %**; pulling a Flagged flag is instant |

### Set D: Saltward (elemental). Verb: **wade into it**

| variant | what changes visually | gameplay |
|---|---|---|
| **D1 Saltward Wraps** | salt-stiffened white wraps on arms and shins, pink-tinged crust at the seams, glass slit-goggles | Salt resist 70 %; **wading in brine ponds applies no Salt and no slow** (open routes across the Pan's south edge) |
| **D2 Arcward** | copper-thread wraps, a **grounding chain dragging from the belt** (it sparks on hits; audio tick), glass insulator beads | Arc resist 70 %; an Arc hit **stores a charge**, and the next arrow is Arc for free |
| **D3 Ashward** | ash-grey wraps, a ceramic lower-face plate, a soot-darkened pauldron | Burn resist 70 %; standing in burning glaze deals no damage, so you can fight a Kiln inside its own puddles |

**Unlock pacing:**

- **A1:** start.
- **B1:** Comb, about 0:25 (§8.9).
- **C1:** Whitecut, about 0:50.
- **D1:** Whitecut tally board, hour 2.
- **Variants:** crafted from Works parts (tools pried off).

---

## 5. Weapons: 6 weapons, 2–3 variants each

**Model contract (kept):**

- `{ group, model, pull, restZ, setDraw(d, showAmmo), setArrowType(id), getNockWorld(d, out) }` for launchers; `buildWeaponModel(id)` / `buildSpear()` entry points.
- Each weapon is **baked to a GLB in node**, merged per material (**1–2 draws**), and **authored at real length** (this retires `SPEAR_SCALE`).
- Socket empties: `grip`, `grip2`, `nock`, `string_top` / `string_bottom`, `tip`, `stow`, `muzzle`.
- Variants are **data**: limb curve, banding, palette, head type.
- Budget: ≤ 3 k tris, 512² share of one weapon atlas, ≤ 0.15 MB.

| weapon | role | the decision it creates | channels | range |
|---|---|---|---|---|
| **Ranging Bow** | precision | which part, from how far | Impact / Pry / element | 5–60 m |
| **Ranging Rod** | melee | commit to close range for Felling blows | Impact / Pry | 1.6 m |
| **Stakedriver** | control | pin *which* leg, *when* it is planted | Impact + Pin | 3–18 m |
| **Gaff** | rip / pull | spend 1.2 s exposed to heave a part off, or pull a Kite down | Pry + pull | 4–22 m |
| **Kiln Pots** | area / setup | prime a zone before the fight, or fog your escape | Burn / Salt / fog | 3–25 m thrown |
| **Lantern Buckler** | guard | trade the bow hand for parries and lamp-flash stuns | flash / parry | 0–12 m |

The ranged wheel holds 4 slots (keys 1–4): Bow, Stakedriver, Gaff, Pots. The Rod is always on the back. The Buckler is an **off-hand equip**. While it is in hand, aiming slings it to the hip in 0.35 s. That is the price, and it makes Buckler versus bow a real choice in a fight.

### 5.1 Ranging Bow (stays)

**Silhouette and materials:**
- Recurve, 1.50 m tip to tip. The back of the limbs is laminated ash and horn **painted in survey bands**, red `#C8442F` and white `#EFE9DC`, 10 cm each.
- Bone-glazed ceramic limb tips; a bronze **sight ring** at the riser.
- Reads at 40 m as a striped arc.

| variant | look | stats / arrows |
|---|---|---|
| **Fieldbow** | as above | Bodkin (Impact 30, Pry 10), **Prybarb** (Impact 8, Pry 45), **Sounding arrow** (0 damage; lands with a bell tone that pulls Works to the spot: a lure, 30 m) |
| **Longsight** | 1.62 m, black/white bands, a brass 18 cm sight tube on the riser | lamp hits ×1.5; Steady drains 30 % slower; draw 20 % slower |
| **Kilnbow** | 1.42 m, celadon ceramic-plated limbs, **three glass vials on the riser glowing the loaded channel's colour** (you see what's loaded) | Oilhead (Burn 35), Coilhead (Arc 35), Brinehead (Salt 35); Impact 10 |

**Poses (movement stack):**
- the kept `_aimLayer` (torso blade, cheek anchor, 2-bone IK both arms, reach clamp, head ellipsoid guard, quiver flourish **from the right hip**, loose follow-through);
- re-derive about 12 constants on the UBC body;
- solve `Lmax = −u·d + sqrt((u·d)² − ‖u‖² + reach²)` **first**, then author `bow.pull` and arrow length from that number. The expected draw is about 0.60–0.64 m, so the arrow is about 0.72 m.

**Rules:** draw hand on the datum line at the cheek; elbow level or back; bow arm 165–172° and clear of the chest and the pauldron; nock-to-hand ≤ 0.075 m (A16).

### 5.2 Ranging Rod (the spear, stays)

**Silhouette and materials:**
- 1.60 m ash pole, 35 mm, **banded red/white every 20 cm** (a real ranging pole).
- Bronze ferrule spike at the butt. At the head, a 28 cm leaf blade with a **side pry-hook**.
- **Real length is 1.60 m**, against today's 1.85 × 0.80. Re-check A103 tip-to-hull per species.

| variant | look | stats |
|---|---|---|
| **Rod** | as above | light combo Impact 25 ×3; heavy Impact 60 + stagger |
| **Billhook** | the head becomes a heavy hooked bill | heavy = **Pry 50** (tears a tool in melee); light −15 % |
| **Plumb Maul** | head is a 1.6 kg bronze plumb bob, fluted | heavy Impact 90 + **knockdown on small Works**; −20 % swing speed |

**Poses:**
- `meleeLayer` (kept), with every table re-measured on the UBC body (M15).
- Clips from **UAL2**:
  - light 1–3: `Sword_Regular_A/B/C` (+`_Rec`);
  - heavy: `Sword_Heavy_Combo`;
  - lunge: `Sword_Dash`;
  - `Sword_Block` is only used when no Buckler is equipped.
- Ready pose: two hands, tip 0.35–0.55 m char space (R2).
- Stow: diagonal from left shoulder to right hip, socket on `spine_03`, **re-measured** (the POC floats 0.2 m).
- Draw and holster path: R8, elbow never above head_y + 0.05 m.
- Felling blow on a downed machine: the heavy, with a 0.4 s hold.

### 5.3 Stakedriver (new): pin a leg

**Silhouette and materials:**
- 0.85 m bronze spring tube on an oak stock.
- **Three flagged steel stakes visible in a top rack.** The flags are terracotta, so ammo count reads on the weapon.
- Stowed horizontally across the lower back, muzzle left.

**The mechanic:**
- A stake that hits a leg segment within 0.6 m of a **planted** foot **pins** that leg for 4 s. The GaitController holds that foot locked in world space, and the body pivots around it (`gait.js` ADAPT: `pose.pinLeg`, a forced stance; the inverse of the existing `limpLeg`).
- **Two pinned legs → downed** (3 s).
- Pinning a swing foot does nothing: **timing is the skill**.
- It also pins a **Kite tether** to the ground (halving its orbit) and a **Weir's sluice gate** open, exposing its pump heart.

| variant | look | stats |
|---|---|---|
| **Stakedriver** | single tube | Impact 60, Pry 20, pin 4 s, 1 shot / 1.1 s |
| **Twin-driver** | two tubes side by side, 6-stake rack | 2 × Impact 40, pin 2.5 s each: pin two legs in one window |
| **Piledriver** | 1.0 m, fat tube, single 0.7 m stake, braced on the hip | Impact 140, pin 7 s, knocks small Works down; **the only pin that holds a Gantry leg** |

**Poses:**
- **Two-handed:** stock against the right shoulder, left hand under the fore-grip, both elbows down and in (no chicken wing). This uses the aim layer's two-hand grip path (the existing two-hand carry grip seed).
- **Fire:** procedural recoil, 0.10 s spine pitch −0.12 rad plus right shoulder back 4 cm, recovering in 0.25 s.
- **Reload:** UAL `Pistol_Reload`, upper-body masked, retimed to 1.2 s; the left hand travels to the top rack.
- Gate: stock-to-clavicle ≤ 4 cm while aimed; no hand > 0.10 m off its grip socket.

### 5.4 Gaff (new): heave a part off, pull a flier down

**Silhouette and materials:**
- 0.9 m ash boathook with a bronze hook and barb.
- 30 m of tarred line on a **hip reel** (right hip, next to the quiver).
- The flying line is one draw: a 12-segment ribbon.

**The mechanic:**
- **Throw**, then **hold LMB to Heave.** Isa plants her feet and hauls hand over hand.
- After 1.2 s of heaving, the hooked part takes Pry 70, or the target is pulled:
  - small Works: 4 m toward her;
  - a **Kite**: down to the ground, downed for 6 s.
- She is exposed while heaving; releasing early costs the hook (2 s to reel in).

| variant | look | stats |
|---|---|---|
| **Gaff** | single hook | Pry 70 per heave, pull small |
| **Grapnel** | three-prong grapnel on a shorter haft | Pry 110 on **large** tools (Harrow drum, Kiln cap); cannot pull |
| **Conductor Gaff** | copper hook, copper-braid line, glass insulator bead | heaving conducts **Arc 40/s** into the target |

**Poses:**
- **Throw:** UAL2 `OverhandThrow`, release at 62 % of the clip, right arm.
- **Heave:** a new small overlay in the aim family. Both hands grip the line **in front of the chest**; pelvis drops 6 cm; torso leans back 0.25 rad; the hands alternate along the line at 1.4 Hz (two-hand IK targets sliding toward the sternum).
- Rules: arms always in front of the torso; no hand above the shoulders.

### 5.5 Kiln Pots (new): area and setup

**Silhouette and materials:** 14 cm ceramic flasks with cork and wick, carried **three on the chest bandolier**, so the count reads on the body. The glaze band is the channel colour.

| variant | look | effect |
|---|---|---|
| **Oil pot** | orange glaze band | Burn 60 in 3 m; leaves a 6 s burning patch |
| **Brine pot** | pink glaze band | Salt 60 in 3 m; leaves a 6 s brine patch (gait ×0.6 on anything inside) |
| **Haar pot** | unglazed grey bisque | **fog volume, 8 m radius, 12 s**: breaks every beam lock inside it and clears Flagged on exit |

**Poses:** long throw (25 m) is UAL2 `OverhandThrow`. Short lob (10 m) is the same clip retimed with release at 48 % and a lower arc. The aim preview is a cobalt dashed arc (UI). The left hand stays forward for balance and never crosses behind the head.

### 5.6 Lantern Buckler (new, off-hand): guard and flash

**Silhouette and materials:** 0.48 m round buckler with a bisque ceramic face, bronze rim and centre boss. Held in the left fist. It goes to the left hip when the bow is out.

| variant | boss | stats |
|---|---|---|
| **Lantern Buckler** | 12 cm lens lamp | parry 0.18 s → stagger; **Flash** (block + LMB): 20° cone, 12 m, **blinds lamps 4 s**, 10 s cooldown |
| **Bell Buckler** | bronze bell | parry rings and staggers small Works within 6 m; no flash |
| **Mirror Buckler** | polished bronze mirror | a timed block (≤ 0.25 s) **reflects** Kiln glaze lobs and Spindle Arc bolts |

**Poses:** all from UAL2:
- guard: `Idle_Shield_Loop`;
- block: `Sword_Block`;
- bash: `Shield_OneShot`;
- shield step: `Shield_Dash`;
- guard broken: `Idle_Shield_Break`.

With the Buckler, the Rod is **one-handed** (R1 already rules light-3 one-handed). Its grip moves to the balance point, 0.55 m from the butt. Rules: the shield arm's elbow stays below the shoulder, and the rod hand never crosses the face (R3).

### 5.7 Which weapon wins which scripted scenario (gate A-weapon-role)

| weapon | scenario where it is clearly best | metric |
|---|---|---|
| Bow (Longsight) | blind a Plumb at 45 m before it flags | Plumb never reaches hostile |
| Rod (Maul) | 5 Pickets swarming | time to clear |
| Stakedriver | Harrow mid-charge | charge stopped ≤ 1 s after the pin |
| Gaff | Kite spotting at 14 m altitude | Kite grounded ≤ 3 s |
| Pots (Haar) | Flagged by 2 Plumbs on open salt | all beam locks broken ≤ 1 s |
| Buckler (Lantern) | Shear pair, melee range | stun uptime |

---

## 6. Humans

### 6.1 Factions

| | **Netfolk** (Comb) | **Salters** (Whitecut) | **Assessors** (the Glazeworks) |
|---|---|---|---|
| who | fog-catchers and vintners of the dune ridge; Isa's people | salt quarriers and caravan traders of the Pan | zealots of the Plan; they herd the Works and "assign" people to lots |
| shape language | **draped, layered, vertical**: shawls, net panels, poles | **blocky, wrapped, horizontal**: aprons, veils, banded wraps, packs | **rigid, symmetric, tall**: long tabards, masks, staves |
| materials | undyed linen, net cord, indigo dye, driftwood, knot-cord records | salt-stiffened leather, chalk, bone or ceramic slit-goggles, rope | white glaze tiles, cobalt underglaze, oxblood leather, glass lenses |
| colours | linen `#D9D2C3`, net grey `#8E918C`, indigo `#2E3D5C`, madder `#A4452C` | chalk `#F0EDE6`, ochre `#C8963E`, rust `#8A4B2A`, goggle amber `#C98A2B` | glaze `#F3F1EA`, cobalt `#2C4F8A`, oxblood `#6E1F1B`, black `#1B1C1E` |
| face and hair | weathered; braids and knots; elders grey | **white chalk paste** under the eyes against glare; head-wraps | **glazed half-masks with a single monocle lens** that imitate the Works' lamps |
| architecture | basalt-and-wreck-timber houses dug into the dune lee; net-covered canvas roofs; cisterns; **a 200 m line of fog nets on 10 m poles** | houses **cut from salt blocks** (Uyuni salt hotels); cart yards; stepped quarry terraces | the only finished fragment of Tessera: a **glazed-tile hall** in Delft blue-and-white, pristine and unsettling |
| symbol | the knot | the stamped block | the grid square |
| wants | stay off the Plan; keep the nets standing | trade; a safe route across the Pan | finish Tessera so "the settlers" come; clear Comb, which sits on a planned cistern |

### 6.2 NPC archetypes (14; Kevin wants many varieties)

**Variety axes** (proven):

- 2 bodies (F, M), height 1.30–1.84 m;
- 4 CC0 outfits (Peasant and Ranger, × F and M) with their 20 parts toggled;
- 6+ hairstyles plus beard;
- tints;
- **generated pieces per faction**: shawls, hats, aprons, goggles, veils, tabards, masks, yokes and packs, each ≤ 1.5 k tris.

New and cheap:

- **Age by posture:** a spine-pitch and head-forward overlay, plus stride timeScale and a cane.
- **Build presets:** non-uniform bone scale on `spine_01/02` (x/z) and `thigh_*`: lean 0.95, heavy 1.08 / 1.05. **Gate V-npc-builds**; if LBS artefacts show, fall back to height plus outfit bulk.
- **Children:** body scale 0.75 with `Head` bone scale 1.12. **Gate V-child-read**; cut kids if it reads as a small adult.

| # | archetype | faction | body / height / build | age | outfit (CC0 base + generated) | hair and face | idle behaviours (clip names) | walk | where |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Net-mother** (Comb's headwoman) | Netfolk | F, 1.62, lean | 60s | Peasant F + net shawl + knot-cord sash | grey buns | `Fixing_Kneeling` (mending net), `Sitting_Talking_Loop`, `Idle_Talking_Loop` | `Walk_Loop` ×0.8, stoop 0.18 rad, cane in left hand | net line, her porch |
| 2 | **Dew-carrier** | Netfolk | M, 1.78, average | 20s | Peasant M + shoulder yoke with 2 clay jars | buzzed | `Walk_Carry_Loop` route nets → cistern, `Consume` (drinks), `Idle_FoldArms_Loop` | `Walk_Carry_Loop` | net line ↔ cisterns |
| 3 | **Ash-pit vintner** | Netfolk | F, 1.68, average | 40s | Peasant F + wide woven hat (lathe) + apron | ponytail | `Farm_PlantSeed`, `Farm_Watering`, `Farm_Harvest` | `Walk_Loop` | ash-pit crescents |
| 4 | **Lamp-keeper** | Netfolk | M, 1.72, lean | 50s | Ranger M, hood up, + lantern pole | short beard | `Idle_Lantern_Loop` (night), `Interact` (lighting beacons) | `Walk_Loop` ×0.9 | beacon route, night |
| 5 | **Net-runner kid** | Netfolk | F or M, 1.30 (head ×1.12) | 9–11 | Peasant, tinted bright madder | short / buns | `Dance_Loop` (playing), `Sitting_Idle_Loop` | `Jog_Fwd_Loop` ×0.85 | between houses |
| 6 | **Lookout** | Netfolk | F, 1.70, lean | 20s | Ranger F + net shawl + horn | braid | `Idle_Rail_Loop`; **`Idle_Rail_Call` when a Work comes within 80 m** (play-first: lookouts warn you) | `Walk_Loop` | net-pole platforms |
| 7 | **Elder storyteller** | Netfolk | M, 1.66, lean | 70s | Peasant M + blanket wrap | bald, white beard | `Sitting_Talking_Loop`, `Sitting_Enter/Exit` | `Walk_Loop` ×0.7, stoop 0.28 rad | the fire |
| 8 | **Salt-cutter** | Salters | M, 1.84, **heavy** | 30s | Peasant M + leather apron + slit goggles + salt veil | wrapped head, chalk under the eyes | `TreeChopping_Loop` (cutting salt blocks), `PickUp_Table`, `Push_Loop` (salt cart) | `Walk_Loop` ×0.85 | quarry terraces |
| 9 | **Caravan-master** (Hesk) | Salters | F, 1.76, average | 40s | Ranger F + long Salter duster (generated, 2 tail chains) + goggles pushed up | cropped | `Idle_FoldArms_Loop`, `Idle_Talking_Loop`, **`Yes` / `Idle_No_Loop` (haggling)** | `Walk_Formal_Loop` ×0.95 (upright) | Whitecut yard |
| 10 | **Salt porter** | Salters | F, 1.70, heavy | 30s | Peasant F + pack frame of 4 salt blocks | wrapped | `Walk_Carry_Loop`, `Consume` | `Walk_Carry_Loop` | Pan caravan route |
| 11 | **Wreck-diver** | Salters (coast) | M, 1.74, lean | 30s | bare torso + Peasant M legs + diving goggles + rope harness, wet tint | slicked | `Swim_Idle_Loop` (lagoon), `Chest_Open` (salvage), `LayToIdle` (resting on rocks) | `Walk_Loop`; `Swim_Fwd_Loop` | wreck caches |
| 12 | **Healer / brewer** | Netfolk | F, 1.66, average | 50s | Peasant F + many pouches | grey ponytail | `Sitting_Idle_Loop`, `Interact` (stirring cistern), `Consume` | `Walk_Loop` ×0.85 | Comb cistern |
| 13 | **Assessor** (handler) | Assessors | F or M, 1.80, lean | any | Ranger + long white tabard with a cobalt grid (generated) + glazed half-mask with monocle + lamp staff | hidden | `Spell_Simple_Idle_Loop` (lamp raised), **`Spell_Simple_Shoot` (signal flash: the Works respond)**, `Idle_No_Loop` | `Walk_Formal_Loop`, **exactly 0.75 m stride** (they pace distances) | the Footings, beacons |
| 14 | **Assessor Warden** | Assessors | M, 1.84, heavy | 30s | Ranger M + ceramic plate tabard + tower shield | masked | `Idle_Shield_Loop` | `Walk_Formal_Loop` | Glazeworks gate (stretch: §6.4) |

**Budgets** (from the human pipeline): ≤ 12 k tris and **≤ 2 draws** per NPC.

- **Atlas:** skin, outfit, hair and eyes in one 1024² atlas per body type.
- **LOD:** LOD1 at 50 % beyond 25 m.
- **Far crowd:** `npcBody.js` procedural bodies (about 2 k tris) beyond 60 m.
- **This is mandatory before NPCs ship.** The POC's 8 NPCs at 6.5 draws each pushed the frame to 366 calls.
- Comb shows ≤ 12 near NPCs, so ≤ 24 draws.

### 6.3 Named NPCs (first hour)

- **Ode Fenn:** old linewalker, Isa's mentor. Archetype 4 body with Ranger and a ceramic pauldron like hers.
- **Net-mother Ama:** archetype 1.
- **Hesk:** Whitecut caravan-master, archetype 9; trades the Stakedriver.
- **The First Assessor:** seen only as a lamp-staff silhouette on the First Arch at dusk.

### 6.4 Human enemies (stretch, phase 6)

Assessor Wardens as melee enemies would reuse the player's `meleeLayer` with `engage.js` standoff bands and an `ai/tables.js` row. That is a new system (no human-combat AI exists), so it is **not** in the first release. Until then, Assessors fight *through* the Works: a handler's signal flash sends nearby Works to a target. Smashing the handler's lamp staff (one arrow) cancels it.

---

## 7. Enemies: **the Works** (12 machines)

### 7.1 Origin and design language

The Charter's construction fleet: survey, groundworks, kilnworks, waterworks, air survey and heavy lift. Rules for every generator (`tools/r5-poc/lib/hs.mjs` kit):

1. **Tool topology, never animals.** Tripods, hexapods, gantries, segmented trains, rotors. **No heads, no jaws, no teeth, no eyes.** The sensor is a **lamp** in a drum or iris.
2. **Materials:**

   | layer | material | swatches |
   |---|---|---|
   | hull | glazed ceramic | bone `#E9E1CF`, celadon `#9DB8A6`, oxblood `#6E1F1B`; roughness 0.18–0.32 |
   | structure | bronze | `#9A6B35`, ageing to verdigris `#4E8C7A` |
   | joints | graphite | `#2E3033` |

   Glyphs, lot numbers and wear come from a shared **cobalt `#2C4F8A` Delft-style decal and trim sheet**. This is the pipeline's "fidelity pass", through `uv1`.
3. **One hull material + one sensor material** per machine (the palette-texture trick), plus the components draw (`rig/components.js`).
4. **Kiln-fired plates are curved lathe sections**, not flat boards. This fixes the Tiller POC's "thigh boards" gap.
5. **Sound:** they ring like pottery and bells: struck-ceramic hits, bell-tone state changes, ratchets and springs. There are no roars.

### 7.2 Roster overview (`roster-read.png`)

| # | name | role | class | sketch L × H (m) | locomotion | shape word | build |
|---|---|---|---|---|---|---|---|
| 1 | **Tiller** | herd / prey | medium | 5.1 × 2.8 | hexapod, alternating tripod (**proven**) | table on stilts | **first 4** |
| 2 | **Plumb** | sentry / alarm | small | 2.3 × 3.5 | tripod (offsets 0 / ⅓ / ⅔) | lamp on a tripod | **first 4** |
| 3 | **Picket** | swarm / flagger | small | 0.8 × 1.2 | tripod, fast | walking stakes | 5th (reuses Plumb's rig) |
| 4 | **Shear** | fast predator | medium | 4.4 × 1.7 | quadruped (digitigrade hind) | open scissors | **first 4** |
| 5 | **Harrow** | charger / tank | large | 5.6 × 2.3 | hexapod, wave gait | rolling pin | **first 4** |
| 6 | **Kiln** | artillery | large | 3.8 × 4.5 | quadruped, slow pace | bottle oven | phase 5 |
| 7 | **Winch** | support / repair | large | 4.2 × 4.6 | hexapod plus 2 hook chains | crane | phase 5 |
| 8 | **Weir** | amphibious ambusher | medium | 5.5 × 1.4 | octopod, wave | crawling sluice | phase 5 |
| 9 | **Sounder** | burrower | large | 8.2 × 1.3 | 12-leg myriapod, spine chain | barrel train | phase 5 |
| 10 | **Kite** | aerial spotter | medium | 4.4 m body, 4.8 m rotor; flies at 8–16 m on an 18 m tether | **tethered flight** (new controller) | box kite on a string | phase 6 |
| 11 | **Spindle** | elite duelist | medium | 3.2 × 3.9 | biped stilts (Round-4 biped gait) | gyroscope on stilts | phase 6 |
| 12 | **Gantry** | colossal boss | colossal | 21.7 × 18.3 | 8-leg walking crane | walking tower crane | phase 6 |

### 7.3 The machines

In each card, *components* lists part, kind (§2.2), what happens and its loot. *Attacks* map to the generic library (`ai/attacks.js`: `lunge`, `charge`, `sweep`, `slam`, `flurry`, `volley`) or to an authored species method.

#### 1. Tiller: herd grazer (proven POC, restyled)
- **Silhouette:**
  - a long glazed capsule body held high on **six high-kneed stilts**;
  - a theodolite **lens drum** at the front, a **seed hopper** on top, an **auger** tail.
  - At 40 m it is a horizontal bar on thin legs: a walking bench.
- **Rig:** 24 bones; GaitController alternating tripod (HEX_WALK / HEX_RUN as in `tiller.js`); generator-labelled weights (0 / 25,445 wrong).
- **Components:**
  - lens drum: Lamp, weak;
  - seed hopper: Tool. Pry spills **seed cores** (crafting);
  - auger: Tool, linked to the rear kick.
- **Attacks:**
  - rear kick with the auger: `sweep`, `arc:'rear'`, Impact 18;
  - panic trample: `charge` at 8 m/s when cornered.
- **Behaviour:**
  - herds of 4–6 (squad herd), drilling soil cores in a line;
  - on alarm they flash lamps in sequence down the herd (a readable ripple), then flee in single file.
- **Counter:** Prybarb the hopper from cover; Haar pot to break the panic.
- **Loot:** tiles, seed cores, ceramic plate.

#### 2. Plumb: sentry and alarm
- **Silhouette:**
  - a thin **tripod** with a lens drum on a mast at 3.4 m;
  - a **plumb bob hangs under the hub** on a cable, swinging as it walks.
  - At 40 m it is the tallest thin thing, and its beam sweeps.
- **Rig:** 3 legs (offsets 0 / ⅓ / ⅔), mast 2 bones, drum yaw 1, bob 2 (pendulum, procedural); about 14 bones.
- **Components:**
  - lens drum: Lamp, primary 0.34 m. **Blind it and it cannot flag**;
  - plumb bob: Tool. Pry it off and the tripod loses balance and **topples** (downed 5 s);
  - signal horn: Tool, linked to the alarm.
- **Attacks:**
  - lamp flare: `volley`, a 0.6 s white-out flash on the player's screen at ≤ 15 m;
  - mast swipe: `sweep`, short.
- **Behaviour:**
  - walks the stake lines, plants, rotates its drum;
  - wary: the beam sweeps toward stimuli;
  - **hostile: Flags you** (a stake-flag at your feet; 60 m broadcast through the existing alert broadcast) and keeps the beam locked.
  - Few hit points.
- **Counter:** a Longsight lamp shot from 45 m; a Haar pot; the Lantern Buckler flash.

#### 3. Picket: swarm flagger
- **Silhouette:**
  - knee-high **walking survey stakes**: a tapered post on three spindly legs, a spring **hammer arm**, a tiny terracotta **flag**.
  - In packs of 4–6 they read as a bobbing crowd of sticks.
- **Rig:** about 8 bones (Plumb tripod scaled down: one rig family).
- **Components:** hammer (Tool); one lamp (any hit kills).
- **Attacks:**
  - peck: `lunge`, Impact 6;
  - hammer flurry: `flurry`, 3 hits;
  - **staking:** when adjacent, it hammers a flag at your feet (Flagged).
- **Behaviour:**
  - re-stake pulled lines (so pulling a stake *summons* them: a lure);
  - morale break after 2 of the pack die.
- **Counter:** Rod (Maul) sweep; Bell Buckler parry.
- Exempt from the 0.25 m weak-point rule.

#### 4. Shear: fast predator
- **Silhouette:**
  - a low **wedge** on four legs with two long **scissor blades** projecting forward from a hinge.
  - At 40 m it is a low dark line with an open V in front.
- **Rig:**
  - quadruped (rear digitigrade: hip, knee, hock), spine 3;
  - **2 blade bones on the head**: an autorig ADAPT, "tool chains" parented to a body bone;
  - about 22 bones.
- **Components:**
  - **cutter coil** at the blade hinge: Arc reservoir, primary 0.26 m. Burst → 3 s stun, blades jammed open;
  - blades ×2: Tools. **Each torn blade removes the scissor lunge**; with both off it can only body-slam;
  - slit lamp: Lamp.
- **Attacks:**
  - scissor lunge: `lunge`, dash 6 m, Impact 35, Pry-to-player knockdown;
  - cutting sweep: `sweep`, 120°;
  - hit-and-run: retreat 8 m after any hit landed on it (`engage` standoff band 9–14 m).
- **Behaviour:**
  - hunts in **pairs**; circles at the standoff band and feints (a half-lunge, 0.3 s);
  - escorts Kilns;
  - stalks Tiller herds at the Lagoons' edge.
- **Counter:** Lantern Buckler parry or flash; Stakedriver on the planted forefoot during its circle; Coilhead into the coil.

#### 5. Harrow: charger and tank
- **Silhouette:**
  - a **wide flat chassis** on six short thick legs, pushing a huge **spinning tine drum** in front.
  - At 40 m it is wide, low, with a toothed circle at the front.
- **Rig:**
  - hexapod wave gait (`offsets` LF 0, LM 0.17, LH 0.33, RF 0.5, RM 0.67, RH 0.83);
  - drum spin bone (procedural spin rate = speed);
  - about 26 bones.
- **Components:**
  - **tine drum**: Tool, 1.7 m. **Pry it off and it cannot charge** (Grapnel: Pry 110);
  - **oil tanks** on the flanks: Burn reservoirs, primary 0.48 m. Burst → 8 s burn;
  - drive belts: Tools (slows it);
  - rear lamp cluster: Lamp.
- **Attacks:**
  - **charge**: `charge`, straight line up to 40 m at 11 m/s, Impact 50 + knockdown. **It cannot turn mid-charge**;
  - drum sweep: `sweep`, front 90°;
  - stomp: `slam`, 4 m radius.
- **Behaviour:**
  - grazes the Pan in pairs, ploughing furrows;
  - **charging into basalt columns, rock or a Gantry block stuns it 3 s** (a collision probe in the charge's `onUpdate`). Lure it into the Organ Shelf.
- **Counter:**
  - sidestep the charge;
  - pin a front leg (it pivots and ploughs in a circle);
  - Salt → Brittle → its plates shatter.

#### 6. Kiln: artillery
- **Silhouette:**
  - a **bottle oven on four elephant legs**: a bulb body, a tall chimney with a glowing mouth, a glowing **furnace door** in front, bellows on the flanks.
  - At 40 m: a fat bulb and a chimney.
- **Rig:** quadruped pace; chimney 2 bones (recoil); bellows 2 (pump); about 20 bones.
- **Components:**
  - **furnace door**: Burn reservoir, primary 0.76 m. Burst → it **vents and self-burns 12 s**;
  - chimney cap (mortar): Tool. Pry → **no lobs**;
  - bellows ×2: Tools (fewer lobs);
  - peephole: Lamp.
- **Attacks:**
  - **glaze lob**: `volley`, a 3-shell arc to 45 m. Each lands a 4 m **burning glaze puddle for 6 s** (area denial; the Mirror Buckler reflects);
  - bellows blast: cone `sweep` at ≤ 6 m;
  - stomp: `slam`.
- **Behaviour:**
  - holds 25–45 m; retreats from melee at walk;
  - escorted by Shears or Harrows;
  - **fires replacement plates that Winches fit**: it is the logistics pair.
- **Counter:** a long shot at the door; Ashward armor to fight in the puddles; Grapnel the cap.

#### 7. Winch: support and repair (kill the healer first)
- **Silhouette:**
  - a compact hexapod with a tall **A-frame crane** and two dangling **hook blocks**;
  - a visible **rack of 3 spare plates** on its back.
  - At 40 m it is the only machine with a triangle on top.
- **Rig:**
  - hexapod, A-frame slew 1, jib 1;
  - 2 hook chains of 3 joints (pendulum procedural; the same tool-chain ADAPT as Shear);
  - about 28 bones.
- **Components:**
  - winch drum: Tool, primary 0.60 m. Pry → no repairs, hooks drop;
  - **spare rack**: Tool. Each plate shot off = one fewer repair (**the count reads**);
  - hooks ×2: Tools;
  - cab lamp: Lamp.
- **Attacks:**
  - hook swing: `sweep`, 6 m;
  - **hook grab**: authored. It pulls the player 3 m toward it; break free with the dodge input.
- **Behaviour:**
  - stays 20 m behind the fight;
  - walks to any Work with a torn tool and **re-fits it from its rack in 4 s**. This is `components.js` un-tear: clear the torn bit, `part.attached = true`, reset `tearHp`; an ADAPT;
  - visible bronze sparks while repairing.
- **Counter:** shoot the rack first; Gaff the drum.

#### 8. Weir: amphibious ambusher
- **Silhouette:**
  - a **low segmented flat body** on eight short splayed legs, with a tall **sluice gate** at the front over a glowing pump heart;
  - **pink brine cells** on its back.
  - In water only the lamp strip shows.
- **Rig:** octopod wave gait; gate 1 bone; spine 3; about 30 bones. Lateral (crab) knees need the gait.js **per-leg IK pole** ADAPT; sagittal knees work without it.
- **Components:**
  - sluice gate: Tool;
  - **pump heart**: Arc reservoir, primary 0.30 m, **exposed only while the gate is open**: when it lunges, or when the gate is **pinned open** with a stake;
  - brine cells ×3: Salt reservoirs (burst → Salt burst 3 m, including on itself → Brittle).
- **Attacks:**
  - ambush lunge from water: `lunge`, from submerged, Impact 40;
  - gate slam: `slam`;
  - brine spray: cone `volley`, applies **Salt to the player** (gait ×0.6).
- **Behaviour:**
  - lies submerged in lagoons and brine ponds (root below the water level; only the lamp strip shows);
  - tracks noise in water;
  - never leaves water by more than 12 m.
- **Counter:** stay on dry sand; Sounding arrow to bait the lunge; Stakedriver the gate; Saltward D1.

#### 9. Sounder: burrower
- **Silhouette:**
  - a **train of six drum segments** on paired stub legs, led by a conical **sounding drill**, tail weight behind.
  - Above ground it is a long low barrel line; below ground, a moving sand plume.
- **Rig:** spine 5 + tail 4 (autorig maximum); 12 legs, wave offsets i/12; about 40 bones. Cadence band behaviour on a 12-leg body needs a test (pipeline risk list).
- **Components:**
  - **tail weight** (the sounding bob): Tool, primary 0.44 m. Pry → **it cannot hear vibration** (deaf);
  - drill: Tool. Pry → it cannot surface-strike;
  - segment caps ×6: Joints (Salt / pin).
- **Attacks:**
  - **erupt under the target**: authored. Telegraphed by sand ripples and a rising thump; 1.2 s to dodge;
  - drill charge: `charge`, on the surface;
  - coil sweep: `sweep`, 360°.
- **Behaviour:**
  - **hunts by vibration**: sprinting or Rod heavies within 30 m draw it; crouch-walking does not;
  - submerged = root 1.5 m below terrain plus a sand particle trail (no terrain deformation).
  - It teaches movement discipline.
- **Counter:** Dune Coat A3; stand on basalt (it cannot surface through rock); Pry the tail weight.

#### 10. Kite: aerial spotter (the flier, made tractable by a tether)
- **Silhouette:**
  - a **box kite**: two open cells joined by a spar, a **rotor** above;
  - a **banded tether line** runs down to an anchor post or to a Winch.
  - At 40 m the line is the read.
- **Rig / locomotion:** **no legs.** A new **TetherFlightController**:
  - a spring-pendulum on a sphere of radius = tether length;
  - wind drift from `windAt`; bank from lateral velocity;
  - a dive is a constrained arc along the sphere.
  - It is far simpler than free flight. About 10 bones: cells, rotor spin, tail.
- **Components:**
  - rotor hub: Arc reservoir, primary 0.32 m. Burst → it drops to a 3 m hover and is stunned;
  - **tether**: Tool. **Cut it** (Pry) and the Kite drifts downwind and crashes 25–40 m away (downed, then dies or flees). **Gaff it** and you heave it down;
  - belly lamp: Lamp. Blind it to stop spotting.
- **Attacks:**
  - spotting flare: `volley`, a lamp flare that **Flags** the player from altitude;
  - dive strike: `charge` along the tether arc, Impact 30;
  - rotor gust: a knock-back cone.
- **Behaviour:**
  - tethered over the Pan (anchor posts at the Sounding Ring) and to Winches on the Footings;
  - Flags anything moving on open salt in clear weather. It stays grounded in haar.
- **Counter:** Gaff; Stakedriver on the tether (halves its orbit); Longsight lamp shot.

#### 11. Spindle: elite duelist
- **Silhouette:**
  - two long **stilt legs** under a **spinning gyroscope ring** with a core lamp;
  - a long **survey lance** held level.
  - At 40 m: a ring on two sticks.
- **Rig:** Round-4 biped gait spec (2 legs, hip–knee–ankle digitigrade); ring spin bone; lance 2 bones; about 18 bones.
- **Components:**
  - **gyroscope ring**: Tool, primary 1.44 m. Pry it off and it **loses balance and falls**: downed 5 s, the big Felling window;
  - lance tip: Arc reservoir;
  - knee bearings ×2: Joints;
  - core: Lamp.
- **Attacks:**
  - lance thrust: `lunge`, 5 m;
  - lance sweep: `sweep`;
  - spin flurry: `flurry`, 4 hits;
  - Arc bolt from the lance tip: `volley` (the Mirror Buckler reflects it).
- **Behaviour:**
  - **duels**: engages one target at melee band;
  - **deflects arrows while the ring spins fast** (the ring's spin rate is visible). Salt slows the ring and Arc stops it.
  - Guards Assessor handlers.
- **Counter:** Salt then Prybarb the ring; Buckler parry into Felling blow.

#### 12. Gantry: colossal boss (a walking tower crane, 18 m)
- **Silhouette:**
  - a lattice **tower crane on eight walking legs**: chassis at 7–9 m, mast to 16.6 m;
  - a long **jib** with a **hook block**, a **counterweight** block on the counter-jib, an **operator cab** lamp at 14 m.
  - Visible from 300 m+: the map's moving landmark.
- **Rig:** 8 legs, slow wave; slewing ring yaw; jib 2; hook chain 4; **≤ 64 bones**; **3 skinned hull meshes** plus a sensor; **LOD1 required**.
- **Components:**
  - **operator cab lamp**: Lamp, primary 0.70 m. Blinded → it swings the jib wildly for 6 s, which **damages itself on its own mast**;
  - **counterweight cables**: Tools. Torn → the jib slews uncontrolled; phase 2;
  - hook block: Tool;
  - slewing ring: Joint. **Salt it → the jib seizes for 10 s**;
  - leg bearings ×8: Joints. Only the **Piledriver** pins them.
- **Attacks:**
  - **jib sweep**: `sweep`, a 270° arc at 9 m height; duck behind blocks or columns;
  - **hook drop**: `slam`, 5 m radius, telegraphed by the hook's shadow;
  - **block drop**: authored. It sets down **foundation blocks** (2 × 2 × 4 m) that **become cover**, so the arena changes. They are colliders via `ctx.collision.register({dynamic:true})`, disposed after the fight;
  - leg stomp: `slam`.
- **Behaviour:**
  - phase 1: it patrols the Footings laying blocks on the Plan grid, with a Winch and Pickets in attendance;
  - phase 2 (counterweight off): it kneels its front legs and drives piles, sending shockwave rings along the grid lines;
  - ends when the cab lamp is destroyed while the jib is seized.
- **Counter:** Salt the slewing ring, then Gaff or Grapnel the counterweight cables from a block; Piledriver a leg to stop its walk.

### 7.4 Ecosystem and spawn plan (`doctrine.js` shape kept)

| site | cast | why |
|---|---|---|
| Strand swales | Tiller ×5, Plumb ×1 on the dune crest | the first hunt; sentry teaches blinding |
| stake lines (all biomes) | Picket ×4–6, summoned when a stake is pulled | the stake lure |
| Lagoon edge | Tiller herd + **Shear pair** stalking it | the first real fight |
| Lagoons | Weir ×2 (submerged) | water discipline |
| The Pan | Harrow ×2 ploughing, Kite on the Ring anchor, Plumb ×2 on lines | an open-ground crossing at noon |
| Organ Shelf foot | Sounder ×1 in the sand apron; Harrow lure zone | terrain play |
| Kiln Mounds | Kiln + Winch + Shear ×2 | the logistics trio: priority targets |
| Footings | Gantry + Winch + Picket ×6 + Spindle ×2 guarding Assessors | endgame |

**Escort pairs** (`ECOSYSTEM`): Plumb → Tiller; Shear → Kiln; Winch → any Large; Picket → Plumb, Gantry; Kite → anchor post or Winch.

### 7.5 Build these four first: **Tiller, Plumb, Shear, Harrow**

- **Coverage.** They span **3 locomotion families**: the proven hexapod (Tiller), the tripod (Plumb), the quadruped (Shear). Harrow reuses the hexapod with a different gait offset table.
- **Every core system.** Herd (Tiller), sentry, blind and Flagged (Plumb), duel, parry and pin timing (Shear), charge plus terrain stun (Harrow).
- **Five of six generic attacks:** `lunge`, `charge`, `sweep`, `slam`, `volley`.
- **The first hour (§8.9)** needs exactly these four, plus Pickets, which come almost free from Plumb's rig.
- **Two of them stress the engine on purpose:**
  - Shear needs the tool-chain ADAPT, which Winch, Spindle and Gantry reuse;
  - Harrow is the first **large** machine and the first charge-into-terrain collision.

---

## 8. Map: **the Sounding Coast**

### 8.1 Size and shape

| | value |
|---|---|
| world square | **1024 m** (`WORLD_SIZE` 720 → 1024; outside `terrain.js` only `ui/map.js` reads it, 34 references) |
| sea | the west ~35 % of the square: one flat plane plus a shoreline foam band (**1–2 draws**) |
| playable land | ~0.62 km², **1.8× today's bowl** (π·330² ≈ 0.34 km²) |
| crossing times | the Hull (−215, +40) to the First Arch (+260, −330) ≈ 600 m ≈ **2.0 min jog** (5.0 m/s), **1.5 min sprint** (6.8 m/s). Landmarks are spaced so a new one is on screen at most every **90 s of jogging** |
| fallback | if A21 or A90 complain at 1024, move the coastline east and crop to 860 m. Biome order is unchanged |

**Why bigger is right here:**

- the sea is free vista;
- the Gantry and Kites need 300 m sightlines;
- the Pan must be big enough that crossing it at noon is a decision;
- and the coast's low vegetation is cheaper per square metre than Round 4's forest: 76 vegetation draws in the staged fight.

Nav: a 2 m grid gives 512² = 262 k cells; A* and flow fields are fine. The biome mask is one 512² map (2 m/texel) plus a 64² hand-edited biome-id control map.

### 8.2 Layout

+x is east, +z is south; the origin is the centre. Heights are above sea level (0).

```
 z=-512 +----------------------------------------------------------------+
        |~~~~~~~~~~~~~~~~~ ::: COMB RIDGE (fog nets) ::: ^^^^ THE FOOTINGS ^^^^^|
        |~~~~~ sea ~~~~~~~ :: Comb (-120,-235) ::::::::: ^ Glazeworks  First Arch ^|
        |~~~(The Lamp)~~~~ ..ash-pit crescents.......... ^ (+150,-300) (+260,-330)^|
        |~~~(-390,-120)~~~ ......dune swales.....  ===== ^ Datum (+250,-380)  Kilns^|
        |~~~~~~~~~~~~~~~~~ BLACK STRAND .....  ______THE PAN______ ||||(+380,-250)|
 z=0    |~~~~~~ stacks ~~~ The Hull (-215,+40)  (  Sounding Ring  ) |||| ORGAN    |
        |~~~~~~~~~~~~~~~~~ ............dunes   (   (+60,+20)     ) |||| SHELF    |
        |~~~~~~~~~~~~~~~~~~~~ ..........      (___brine ponds___) |||| the Pipes|
        |~~~~~~~~~~~~~~~~~~~~~~~ LAGOONS (white dunes, 14 lagoons) Whitecut ||||  |
 z=+512 |~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ ............dune sea... (+210,+130)  |
        +----------------------------------------------------------------+
        x=-512                           x=0                          x=+512
```

| biome | extent (x, z) | elevation | character |
|---|---|---|---|
| **Black Strand** | x −320…−150, z −260…+260 | 0–14 m | black-sand beach and dune swales, sea stacks offshore, the Hull |
| **Comb Ridge** | x −230…+40, z −330…−170 | 18–34 m ridge | fog-net line on the crest, the village in the lee, ash-pit crescents |
| **The Lagoons** | x −230…+80, z +170…+440 | 2–20 m | white dunes with 14 freshwater lagoons (0.5–2.5 m deep) |
| **The Pan** | ellipse centred (+40, 0), 440 × 300 m | 3 m (flat) | polygonal salt crust, mirror sheet at high tide, pink brine ponds on the south edge |
| **Organ Shelf** | x +200…+430, z −160…+320 | terraces 8 → 45 m | columnar basalt terraces, the gorge "the Pipes" (+300, +60), sand apron at its foot |
| **The Footings** | x +90…+430, z −440…−180 | plateau at 30–36 m | the unbuilt city: foundation grid (24 m blocks), half-raised walls, stake lines, kiln mounds |

### 8.3 Biomes

| biome | ground layers (≤ 3 per pixel) | scatter (1 draw per kind) | cover | lighting mood | machines |
|---|---|---|---|---|---|
| **Black Strand** | procedural **black-sand ripples** (proven layer, re-tinted; anti-tiling past 10 m), wet sand (mask from the shoreline distance) | marram tufts, driftwood, wreck ribs, sea-stack boulders (CC0 scan rock) | marram swales (tall-grass API), wreck hulls, haar | cold low sun through haar, backlit spray; the sea is the brightest thing on screen | Tiller, Plumb, Picket |
| **Comb Ridge** | black ash (procedural), crescent dry-stone (scan rock, tinted) | ash-pit vines inside crescent walls (crouch cover), net poles, cisterns | **crescent walls** (stealth lanes), net shadows | fog-diffused, warm lamp interiors at dusk | Pickets on the plan line through the village (the Plan's cistern) |
| **The Lagoons** | **white dune sand** (procedural, light), lagoon bed | reed beds (the main tall cover), glasswort | reeds, dune crests | the one high-saturation biome: bright turquoise noon | Weir, Tiller, Shear |
| **The Pan** | **salt-crust polygons** (proven layer), brine-pond pink (mask) | salt shards, survey stakes, Kite anchor posts | **almost none**: only haar and stake lines. The open-ground decision | high-key white glare at noon, mirror at high tide, copper at 19:30 | Harrow, Kite, Plumb |
| **Organ Shelf** | **CC0 scan basalt** (proven), orange lichen (mask = climbable ledges) | **hex-lattice column clusters** (proven: 1,427 columns, 1 draw + 3 shadow), talus | columns: Harrow stun zones and sniping perches | raking side light, deep shadows, sodium sunsets | Sounder (apron), Harrow lures, Plumb on ledges |
| **The Footings** | ceramic tile floor (procedural, cobalt-glyph decal), sand drift | foundation blocks, rebar-like bronze stakes, kiln slag | foundation walls (half cover), blocks, haar | dusk copper and kiln glow; long shadows down the grid | Gantry, Winch, Kiln, Spindle, Picket |

**Ground layer budget:** ≤ 6 × 1024² + 4 × 512² (pipeline §6).

- **1024²:** black sand, white sand, salt crust, scan basalt, ash, tile floor.
- **512²:** wet sand, lagoon bed, brine, lichen.
- Shared and tinted through uniforms.

### 8.4 Landmarks (each a generated GLB, ≤ 40 k tris, 2 materials)

| landmark | where | size | what it is, and why it's there |
|---|---|---|---|
| **The Hull** | (−215, +40) | 64 m long, 18 m high, half-buried | the Charter lander, beached; ribs to climb inside; the spawn-area silhouette |
| **The Lamp** | (−390, −120) | 32 m sea stack + 14 m lighthouse | a Charter beacon, reachable only at **low tide** by the causeway; a first-hour promise |
| **Sounding Ring** | (+60, +20) | 33 × 26 × 22 m (proven) | a fallen survey gyroscope on the Pan; Kite anchors |
| **The Fog Nets of Comb** | ridge z ≈ −255 | 200 m of panels on 10 m poles | the settlement read from 400 m (instanced panels, 1 draw) |
| **The First Arch** | (+260, −330) | 48 m tall, unfinished (one side scaffolded) | the city gate of Tessera; the dusk silhouette at 1:00 |
| **Bottle Kilns** ×3 | (+380, −250) | 22–26 m | where the Works fire tiles; glow at night |
| **The Datum** | (+250, −380) | 9 m benchmark obelisk; the **spark is carved on its face** | the city's origin point; the endgame; it also sources the logo |
| **The Glazeworks** | (+150, −300) | 40 × 30 m tiled hall | the Assessors' completed fragment of Tessera |

### 8.5 Interactable sites (9 kinds)

These go through `ctx.interactables.register`, the `Places` engine and `activities.js` (KEEP / ADAPT).

| site | count | interaction | mechanic | engine |
|---|---|---|---|---|
| **Beacons** | 6 | relight or douse (hold E 0.45 s) | **reroutes the Works' patrols** on that sector's stake lines between two authored route sets. Environmental manipulation, not mind control | `machine.route` swap via `doctrine` |
| **Plan Tables** | 4 | read | reveals that sector's machine routes, stake lines and component cards on the map (a map reveal **without climbing**) | `ui/map.js` layers, Sighting card unlocks |
| **Stake lines** | ~30 segments | pull a stake | opens an off-plan gap (safe corridor for 5 min) **and summons Pickets** to re-stake: a lure you choose | navgrid stamp + `spawn('picket')` |
| **Kiln Mounds** | 3 | loot the slag pile; set up before the Works arrive at 19:30 | cache plus scheduled ambush site | `activities` + `SPAWN_PLAN` time window |
| **Tally Boards** | 2 (Comb, Whitecut) | take a bounty ("3 Shear blades", "a Harrow drum unbroken") | open-world hunts with reward tiers | `progression` quest objectives |
| **Wreck Caches** | 8 | salvage; 4 only at low tide | tiles, arrows, Kiln Pots, lore | `gather` / interactables |
| **Drowned Rooms** | 3 sea caves | enter at low tide | lore (Charter plan sheets), armor variant schematics | `Places` interior |
| **Fog Nets** | 6 broken panels | repair (materials) | Comb's water rises, the settlement visibly grows (more NPCs, a market day) | settlement hook |
| **Net-knots** | 12 | read a knot-cord | Netfolk memory records: the datapoint role, in-world as knotted cord | `datapoints` (renamed) |

### 8.6 Settlements

| settlement | where | look | NPCs (near) | services |
|---|---|---|---|---|
| **Comb** (Netfolk) | (−120, −235), the ridge's lee | basalt and wreck-timber houses dug into the dune, net-canvas roofs, cisterns, ash-pit crescents, the net line above | 10–12 (archetypes 1–7, 12) | respawn and rest (**the one camp constant**), crafting, Tally Board, Net-mother quests, armor B1 |
| **Whitecut** (Salters) | (+210, +130), the Pan's east edge | **salt-block** houses, stepped quarry terraces, cart yard | 8 (archetypes 8–11) | trade (Stakedriver, C-set), Tally Board, caravan escort quests |
| **The Glazeworks** (Assessors) | (+150, −300) | the tiled hall, stake-flag ranks, lamp staves | 6 (13, 14) | hostile ground, the hour-2+ story |

### 8.7 Traversal features (kept movement plus 2 UAL2 clips)

- **Dune slides:** UAL2 `Slide_Start/Loop/Exit` on sand slopes over 22°. Fast, and noisy unless wearing the A3 Dune Coat.
- **1 m ledges:** UAL2 `ClimbUp_1m` on lichen-marked basalt steps (orange lichen = climbable, a world-colour rule). This replaces nothing; the procedural mantle stays.
- **Low-tide causeway:** the Lamp and the Drowned Rooms.
- **Off-plan corridors:** pulled stake lines.
- **Haar windows:** crossing the Pan under fog is the stealth route.
- **Brine wading:** slow unless wearing D1.
- **Swimming:** UAL `Swim_*` in the lagoons. The Weir makes it a risk.
- **No climbing towers and no glider**, deliberately.

### 8.8 The two clocks

| clock | schedule | effect |
|---|---|---|
| **Haar** | thick 04:30–09:30, burn-off by 10:00, thin 19:00–22:00 | perception × fog factor, visible beams, far cull 140 m |
| **Tide** | low 00:00 / 12:00, high 06:00 / 18:00; a 3-game-minute transition, only applied while the player is ≥ 60 m from the affected shoreline or resting | the water uniform plus two navgrid keepout sets. Low opens the causeway, caches and Drowned Rooms; high lays a 3 cm mirror sheet over the Pan's west edge and grows the brine ponds |

### 8.9 The first hour (play-tested path, with coordinates)

| t | where | what the player does | teaches |
|---|---|---|---|
| 0:00 | Comb lower terrace (−120, −220), 04:40 pre-dawn | wake; walk with Ode down the ridge through the ash-pit crescents into the haar | movement; crouch lanes; the net line silhouette above |
| 0:04 | Strand swale (−200, −40) | **Sighting**: Tillers drilling in the fog, lamps calm. Prybarb the hopper from 25 m, Pry the seed cores | lamps, tools, Pry; the herd's flash-and-flee ripple |
| 0:11 | dune crest (−170, +20), 07:30 burn-off | a **Plumb** on the stake line; the haar is lifting (the window is closing) | blind the lamp before it flags, or sneak in the last fog; the Flagged rule |
| 0:17 | stake line (−190, +60) | Ode: "pull it". Pickets come to re-stake; **Rod** melee; one flags her, so she pulls the flag | the stake lure; melee; Flagged |
| 0:24 | Comb | craft, Haar pots, armor B1, the Tally Board ("Shear pair at the lagoons"), morning chores, the fog-net repair quest | settlement life; ≥ 8 archetypes visible |
| 0:33 | Lagoon edge (−60, +210), 10:30 | a **Shear pair** stalks a Tiller herd: the first real fight | dodge timing, the cutter coil, prying blades, Haar pot escape |
| 0:44 | across **the Pan**, 12:00 low tide | open salt, noon glare; Plumbs on lines; the **Kite** anchored at the **Sounding Ring** flags anything on the open salt (seen, not fought; a promise) | open-ground risk; reading lines; wading pink brine is slow |
| 0:50 | **Whitecut** (+210, +130) | Hesk trades the **Stakedriver**; Tally Board: "Harrow loose on the Pan" | trade; C1 harness |
| 0:54 | Pan's east edge (+160, +40) | a **Harrow** charges. Lure it into the Organ Shelf columns (+215, +30) for a stun; **pin** a planted foreleg; Prybarb the drum off (the Grapnel comes in hour 2) | terrain play; pin timing |
| 0:59 | Shelf top (+260, −40), 19:30 copper | the Footings: the **First Arch** black against kiln glow, a Gantry's jib moving on the skyline, **Assessor lamp signals** blinking | the hook for hour 2 |

The first hour uses **Tiller, Plumb, Picket, Shear and Harrow**: the first-4 build plus Picket.

---

## 9. Art direction

### 9.1 Palette (`docs/media/r5-direction-b/palette.png`)

| group | swatches |
|---|---|
| **World** (greyscale plus one) | black sand `#2B2A2C` · wet sand `#141517` · salt crust `#EDEBE4` · salt shadow `#B9BDC3` · basalt `#3A3836` · basalt wet `#22211F` · haar `#C9D0D3` · sea deep `#24434B` · lagoon `#5FB3A6` · white dune `#E6DCC6` · marram `#B9A66B` · lichen `#D98E2F` · glasswort `#9C3B32` · ash-pit vine `#6E7F3A` · brine pond `#E7A3C4` |
| **The Works** | glaze bone `#E9E1CF` · celadon `#9DB8A6` · oxblood `#6E1F1B` · cobalt glyph `#2C4F8A` · bisque `#C9B49A` · bronze `#9A6B35` · verdigris `#4E8C7A` · graphite `#2E3033` |
| **Lamps and channels** (the only saturation) | calm `#F4EBD0` · wary `#FFC94A` · hostile `#E5402A` · blinded `#3B3A36` · **Burn `#FF6A13`** · **Arc `#6FD3FF`** · **Salt `#F28AC0`** (halite pink) · Pry/tool `#9A6B35` |
| **Isa** | §3.3 |
| **Peoples** | §6.1 |
| **UI** | ink `#10161C` · paper `#EFE7D8` · terracotta (spark) `#DA7756` · cobalt line `#2C4F8A` · pencil `#8B8F93` · wary `#FFC94A` · danger `#E5402A` · heal `#7FB59A` |

The three channels were picked to be mutually distinct at small pixel sizes and distinct from the lamp states. Salt was moved off mint (which merges with Arc cyan and calm white) to **halite pink**, which is also what real salt ponds look like.

### 9.2 Material rules (stylised-realistic PBR)

| class | roughness | metalness | rule |
|---|---|---|---|
| glazed ceramic (Works hull, pauldron, tiles) | **0.18–0.32** | 0 | the **specular highlight is the read** for ceramic; glaze crawl at edges via the `edge` attribute |
| bisque / unglazed | 0.75–0.90 | 0 | |
| bronze | 0.35–0.55 | 1 | worn rims lighter (`edge`) |
| verdigris | 0.70–0.85 | 0.3 | in cavities only (cavity mask) |
| graphite joints | 0.50–0.60 | 0.2 | |
| lamp glass | 0.05 | 0 | emissive only in lamps and reservoirs; **flat emissive, ≤ 1.6 × in bloom** (fixes the POC's weak daylight lenses by raising the emissive, not the bloom) |
| oilskin (Isa's coat) | 0.45–0.60 | 0 | waxed sheen |
| linen, net | 0.85–0.95 | 0 | |
| leather | 0.60–0.75 | 0 | |
| skin | 0.50–0.60 | 0 | wrap-diffuse fake SSS |
| hair | 0.35–0.50 | 0 | |
| black sand | 0.90 dry / 0.35 wet | 0 | wet from the shoreline mask |
| salt crust | 0.70 | 0 | 0.05 under the high-tide sheet |
| basalt | 0.75–0.85 | 0 | 0.30 wet |

**General rules:**

- No pure black (min `#111`) and no pure white (max `#F4F0E8`).
- Saturation above the world swatches is reserved for gameplay.
- One hull material and one sensor material per Work.
- One atlas per human body type.
- Decals through the shared cobalt trim sheet (`uv1`).

### 9.3 Lighting moods per biome

| biome | mood | key / fill | grade |
|---|---|---|---|
| Black Strand | haar dawn backlight | low sun behind the fog; fill from sea-bounce `#9FB2C8` | cool, lifted blacks |
| Comb Ridge | sheltered warmth | net-filtered daylight; lamp interiors `#F2C27A` | warm mid-tones |
| Lagoons | bright noon | high sun; fill from white sand (high hemi) | the only saturated grade (+10 % chroma) |
| The Pan | glare / mirror | top-down sun; fill = salt bounce (very high) | exposure −0.2, contrast down |
| Organ Shelf | raking | low side sun; deep shadow | contrast up, sodium sunset |
| Footings | kiln dusk | copper sun plus point glow from kilns (the one shared point light of `Places`) | warm highlights, cobalt shadows |

### 9.4 Sky, fog, water, foliage

- **Sky:** marine-layer skies, low contrast, pale. Clouds are thin stratus bands, not cumulus. At wind-clear (17:00) the sky goes deep and clean.
- **Fog:** the haar is the hero.
  - Ground-hugging height fog (`fogFalloff` 1/18) so stack tops, the Shelf and the Arch **rise out of it**.
  - Local fog cards for Haar pots.
  - Beams are visible only when fog `densMul` > 1.2 or at night.
- **Water:**
  - **Sea:** deep `#24434B` to shallow `#3F6E6E`, foam lines from shoreline distance (heightfield), sky env reflection; no planar reflection.
  - **Lagoons:** clear turquoise over white sand, depth tint.
  - **Brine ponds:** pink, opaque, matte.
  - **Pan sheet:** a 3 cm mirror (roughness 0.05, env reflection only).
- **Foliage:** low, tough, solid vertex-coloured tufts with **no alpha overdraw** (proven):
  - marram (straw);
  - glasswort (red succulent mats);
  - reeds (lagoons; the tall cover);
  - ash-pit vines (dark green in crescent walls);
  - orange lichen as **decal patches** on basalt (climbable-ledge code);
  - a few wind-bent tamarisks.
  - **No forests.** Driftwood instead of fallen trees.

### 9.5 UI language: "the drafting table"

| element | treatment |
|---|---|
| panels | paper `#EFE7D8` at 92 % over ink, a 1 px pencil border, **corner registration marks** (not brackets) |
| lines | cobalt `#2C4F8A` hairlines; dimension lines with arrowheads; chain-tick rules |
| accent | terracotta `#DA7756`: the spark, selection, Isa's own markers |
| health | a **chain bar**: segments are chain links that drop as you take damage. The Dew flask count is shown as a ceramic flask stamp |
| compass | a surveyor's baseline with chain ticks; Works as **lamp-state pips** (iris shape + colour); stake-line crossings as small flags; **Flagged** = a terracotta flag over Isa's marker |
| machine status | name in tracked caps, a level stamp, a health line drawn as a dimension line; channel meters as **three small vials** (orange / cyan / pink) |
| Sighting (scanner) | the screen becomes **an annotated drawing**: a paper vignette ≤ 20 %, the Work traced in cobalt line art with **leader lines and labels to each component** (kind icon: lamp / vial / tool / joint), patrol routes as dashed cobalt, the reticle is the **spark**. *Not* violet, not holographic |
| Steady (slow time) | paper grain intensifies, cobalt lines thicken, the world desaturates 30 % |
| weapon wheel | a **protractor**: 4 sectors with degree ticks; ammo as vials or stakes |
| fonts (all OFL, already shipped) | **Julius Sans One** (titles, wordmark), **Rajdhani** (HUD numerals and labels), **Chakra Petch** (Sighting annotations). Retire Michroma and Orbitron (−0.4 MB) |
| logo | §1.1; title, loading screen, favicon |

### 9.6 Audio direction (for the audio lane, one paragraph)

- **The Works:** struck ceramic, bronze bells (each state change is a bell interval), ratchets, springs, kiln roar.
- **The coast:** surf, wind through nets (a tuned hum), distant foghorns from the Lamp in haar, Pickets' hammer taps carrying in fog. That tap is a **readability cue**: you hear Pickets before you see them.
- **Music:** low strings, frame drum, and a **tuned glass/ceramic motif** for the Plan.
- Regenerate the bank (`tools/audio-bank.mjs`) with the new set names; keep the CC0 dedication.

---

## 10. Distinctiveness

### 10.1 What Horizon does vs what this direction does

| element | Horizon (HZD / HFW) | **UNBUILT** |
|---|---|---|
| title and logo | *Horizon Zero Dawn*; sunrise over a horizon | **UNBUILT**; the spark **pinned to a survey chain as a datum**, not rising |
| premise | post-apocalypse; a terraforming AI rebuilt the biosphere with animal machines; a rogue AI corrupts them | **no apocalypse**: a construction fleet still building a city whose settlers never came; machines clear "obstructions"; no AI god |
| machine form | animals and dinosaurs: heads, jaws, eyes, tails | **tools**: tripods, ploughs, kilns, cranes, kites. **No heads, jaws, teeth or eyes** |
| machine materials | grey and white metal plates over black cable musculature; glowing canisters | **glazed ceramic** (bone, celadon, oxblood) over **bronze**, Delft **cobalt glyphs** |
| machine state | eye colour blue → yellow → red | **lamp iris aperture + visible beam**, then white → sodium → red; there is **no blue state** |
| hostility | Derangement / corruption | **the Plan**: on-plan ground is patrolled, off-plan ground is safe; stake lines show it |
| elements | Fire, Shock, Frost, Acid, Plasma, Purgewater, Adhesive | **Burn, Arc, Salt**. Salt is a pink crystallisation that makes machines brittle and slows them |
| part removal | Tear | **Pry** |
| scanner | the Focus: a temple-mounted device, violet hologram | the **Sightglass**: a hand-held brass monocular; cobalt drafting lines on paper |
| slow time | Concentration | **Steady** (through the Sightglass) |
| stealth | tall red grass | **haar windows**, reed beds, crescent walls; **visible lamp beams** |
| machine control | Override (ride, ally) | **none**. **Beacons reroute patrols** (no mind control, no mounts) |
| map reveal | climb Tallnecks | **read Plan Tables** (no tower climbing) |
| dungeons | Cauldrons | open-air **Kiln Mounds**; **Drowned Rooms** (tidal lore caves) |
| trials | Hunting Grounds | **Tally Boards** (open-world bounties) |
| lore objects | Datapoints (holo logs) | **plan sheets** and Netfolk **knot-cords** |
| currency | Metal Shards | **Tiles** (kiln-fired, plan-stamped) |
| healing | Medicine Pouch, herbs | **Dew flask** (fog water) |
| tie-down tools | Ropecaster, Tripcaster | **Stakedriver** pins one **leg at gait level**; **Gaff** heaves |
| protagonist | Aloy: red hair, freckles, many beaded braids, Nora leathers, teal and brown, Focus | **Isa**: deep-brown skin, black hair with shaved sides, **one rope braid with a terracotta plumb weight**, **terracotta datum line across the cheekbones**, indigo oilskin, **white ceramic left pauldron**, **red/white banded pole** |
| bow and spear | machine-part recurves; tribal spear | **survey-banded** recurve with a bronze sight ring; **ranging pole** with a pry-hook |
| peoples | Nora, Carja, Oseram, Banuk, Utaru, Tenakth, Quen | **Netfolk** (fog-catchers), **Salters** (salt-cutters), **Assessors** (Plan zealots) |
| architecture | timber palisades, hide tents, the Sun-city | **fog-net ridge village**, **salt-block** houses, a **glazed-tile hall** |
| landscape | temperate forest, snow, jungle, mesas; HFW also has a desert (Stillsands) and volcanic islands (Burning Shores) | a **cold fog-desert coast**: black sand, white salt, basalt organ pipes, white-dune lagoons, pink brine. The overlap with HFW's desert and volcanic regions is real at the word level; the read is not. **Ours is high-key monochrome and fog-driven, theirs warm and saturated** |
| palette | warm golden hour, teal and orange, lush greens | **greyscale plus one**: the world is black, white and grey; saturation is only gameplay |
| UI | teal and white holographic, tribal patterns | **the drafting table**: paper, ink, cobalt line, terracotta spark |
| traversal | climbing everything, glider, grapple | slides, 1 m ledges, tide causeways, off-plan corridors; **no glider, no grapple** |
| sound | tribal choir, roaring machines | bells, struck ceramic, foghorns, net hum |

### 10.2 Names, checked against Horizon terms (literal)

`node tools/r5-direction/names-check.mjs` checks 108 names against 235 HZD / Frozen Wilds / HFW / Burning Shores / Call of the Mountain names (189 single words, 46 multi-word phrases) plus Sony marks: people, tribes, places, machines, items and mechanics.

**Result: 0 HIT · 1 GENERIC · 1 ROOT · 17 NEAR.**

**Reviewed:**

- **GENERIC:**
  - "Salt" appears inside HFW's place name *Saltbite*. Salt is a plain English word naming a substance; accepted.
- **ROOT:**
  - "Linewalker" shares the suffix "-walker" with the *Shell-Walker* machine. Ours is a human job title, not a machine compound; accepted.
  - If Kevin wants zero, the folk term **"stakepuller"** is clean.
- **NEAR** (edit distance ≤ 2), all accepted as different in context:

  | ours | near to |
  |---|---|
  | Brack | Brave (HZD skill tree) |
  | Charter | Charger (machine) |
  | Tiller | Tinker |
  | Tiles | Tilda |
  | Sounding | Sunwing / Sun-King |
  | Black Strand | Blaze |
  | First Arch / First Assessor | Karst |
  | Kiln Mound | Morlund |
  | Stake Line | Stalker |
  | Brine Pot / Brine Ponds | Brave |
  | Glazed Kilnplate | Grazer / Blaze |
  | The Works | Horus |

  Charter/Charger is the only one a player might mishear. Charger is a minor HZD herd machine, and "the Charter" never appears as a machine name.
- **Renamed during the check:**
  - "Mark" became **Flagged**: better fiction, and it avoids HFW's "Bleeding Mark".
  - "Breaker" became **Felling blow** (Rockbreaker).
  - "Emberward" became **Ashward** (Hidden Ember).
  - "Concord" (a Sony game, 2024) was rejected as the city name; it is **Tessera**.

**Limits:**

- The Horizon list is from memory of the shipped games plus `ROUND5-INVENTORY` §3, so extend it whenever a name is added.
- A clean run is necessary, not sufficient: **do a trademark search for the title before any public release.**
- Proposed as gate **A-names** (exit 0).

---

## 11. Production

### 11.1 Per-asset budgets

| asset | LOD0 tris | draws | materials | bones | textures | file | shadow |
|---|---|---|---|---|---|---|---|
| **Isa** (body, hair, outfit set, carried gear, in-hand weapon) | **≤ 40 k** (planned 36 k) | **≤ 5** | skin atlas, hair, set atlas, gear atlas, weapon | 65 + braid 7 + tails 8 | 1024² WebP base / normal / ORM; hair 512² | ≤ 0.7 MB body + ≤ 0.8 MB per set | 1 merged LOD1 proxy |
| armor piece (generated) | ≤ 3 k | 0 hidden; merged into the set draw | set atlas | rigid 1–2 joints or copied weights | — | ≤ 0.15 MB | via proxy |
| weapon | ≤ 3 k (rod ≤ 1.5 k) | 1–2 | weapon atlas 512² | — | — | ≤ 0.15 MB | no (in hand) |
| NPC | ≤ 12 k; LOD1 ≤ 4 k beyond 25 m; npcBody beyond 60 m | ≤ 2 | 1 atlas per body type | 65 | 1024² atlas | body ≤ 0.4 MB; outfits shared | ≤ 1 caster within 20 m |
| Work, small (Plumb, Picket) | ≤ 15 k | ≤ 3 (hull, sensor, components) | 2 | ≤ 20 | 8×1 palette + shared decal sheet | ≤ 200 KB | 1 |
| Work, medium (Tiller, Shear, Weir, Kite, Spindle) | ≤ 35 k | ≤ 4 | 2 | ≤ 32 | " | ≤ 400 KB | 1 |
| Work, large (Harrow, Kiln, Winch, Sounder) | ≤ 60 k + LOD1 | ≤ 5 | ≤ 3 | ≤ 40 | " | ≤ 700 KB | 1 |
| Work, colossal (Gantry) | ≤ 120 k + LOD1 | ≤ 8 | ≤ 4 | ≤ 64 | " | ≤ 1.2 MB | ≤ 2 |
| landmark | ≤ 40 k | ≤ 3 | 2 | — | palette + decal | ≤ 300 KB | 1–2 |
| ground layer | — | — | — | — | 2 × RGBA WebP; 1024² (≈ 1.2 MB, 11 MB VRAM) or 512² | | |
| scatter kind | ≤ 200 tris (rock), ≤ 100 (plant) | 1 (+3 if casting) | 1 | — | shared | | rocks yes, plants no |
| lamp beams (all machines) | 64 tris per cone, instanced | **1** | 1 additive | — | — | — | no |

### 11.2 Worst-frame draw ledger (planned against 350)

| owner | **Gantry fight** (Footings, dusk) | **Comb market day** (Comb, noon) | **Pan crossing** (noon, clear) |
|---|---|---|---|
| post chain | 22 | 22 | 22 |
| terrain + skirt + sky + sea | 6 | 6 | 6 |
| ground scatter | 20 | 16 | 24 |
| vegetation | 10 | 24 | 6 |
| landmarks and places | 30 (Arch, Kilns, foundations kit, Glazeworks) | 40 (nets, houses, cisterns) | 10 (Ring, anchors) |
| Works | Gantry 14 (incl. 2 casters × 3), Winch 8, 6 Pickets × 3 = 18 (no casters; under 1.2 m), Spindle 2 × 7 = 14: **54** | 0 | 2 Harrow × 8 = 16, Kite 7, 2 Plumb × 6 = 12: **35** |
| lamp beams | 1 | 0 | 1 |
| Isa | 8 (5 + 3 shadow) | 8 | 8 |
| NPCs | 4 (2 Assessors) | 24 near + 6 LOD | 0 |
| VFX (pooled) | 12 | 4 | 6 |
| **total** | **167** | **150** | **118** |

There is wide headroom against 350. The coast's sparse vegetation and merged gear do most of that work.

The real limit is **GPU time**: the post chain alone is about 13.5 ms at DPR 1.5. That is an engine decision (MSAA → SMAA-only, quarter-res GTAO, or a DPR cap of 1.25) that must be taken before "60 fps at high" is judged on any content. Haar frames cull far content and are the cheapest frames.

### 11.3 Shipped-size estimate (public/ ≤ 60 MB)

| item | MB |
|---|---|
| Isa base | 0.6 |
| 4 armor sets | 3.2 |
| NPC bodies, outfits, faction pieces | 3.5 |
| 6 weapon GLBs (variants as data) | 1.0 |
| 11 Works × 0.35 + Gantry 1.2 | 5.1 |
| 8 landmarks | 2.0 |
| settlement kits | 1.5 |
| ground layers | 8.0 |
| decal / trim sheets | 1.0 |
| clips: UAL v3 + UAL2, **stripped to used clips** | ≤ 6.0 |
| audio (regenerated) | 2.8 |
| fonts (minus Michroma and Orbitron) | 1.0 |
| **total** | **≈ 36 MB** |

### 11.4 The three riskiest assets, and how to de-risk each

1. **Isa (the hero).** Three risks:
   - **The stock CC0 face is shared** with other games.
   - **The bow-draw and melee constants fail on this body**: 141° bow arm, low elbow, floating stow.
   - **The new gear** (pauldron, braid weight, coat tails, bandolier) collides with the draw arm and the run arm path.

   **De-risk, in order:**
   1. Re-derive the aim set and solve `Lmax` **before** any armor is built; pass A35/A16/A32 on the bare POC body.
   2. Build A1 piece by piece, re-running A35 plus the new collision gates (pauldron-to-head ≥ 3 cm at draw; wrist-to-midline ≥ 0.10 m at sprint; tails vs thigh capsule; braid collider vs draw forearm) after **each** piece.
   3. Face: texture layer, then face fields, then gate V-isa-face. Blender (≈ 1.2 GB) only on a failed V-judge.
2. **Kite (the tethered flier).** It is the only machine with no proven locomotion. The Round-4 fliers were clip-driven donors that are now deleted.

   **De-risk:**
   - A 2-day timeboxed spike of `TetherFlightController` (spring-pendulum on a sphere, wind, bank, dive along the arc) on a 6-bone stand-in, with gates:
     - stays within tether + 0.2 m;
     - no NaN over 10 min;
     - the Gaff heave grounds it in ≤ 3 s;
     - dispose leaves geometries flat.
   - Only then generate the art.
   - **Fallback:** a grounded "Kite stand", a rotor mast on a Winch, keeps the spotter role without flight.
3. **Gantry (the colossal boss).** Risks: 8 legs at 20 m scale, ≤ 64 bones, 3 skinned hull meshes plus LOD1, a dynamic arena (blocks as colliders), and the frame and GPU budget in the busiest scene.

   **De-risk:**
   1. Generate it first as a **static landmark** on the Footings skyline. That is useful immediately and tests tris, draws and LOD.
   2. Walk it at 0.6 m/s with the per-species rig gates (A45c, A46, A48) at scale.
   3. Add the block-drop collider lifecycle with an A90 run: spawn, fight, dispose × 3.
   4. Wire the fight last.
   5. Split the hull per the pipeline (2–3 skinned meshes).

**System risk** (not an asset): the GPU-bound post chain (§11.2). Raise it with the engine owner in Phase 0.

### 11.5 Build order (each phase ends on gates, not self-reports)

| phase | content | exit gates |
|---|---|---|
| **0: purge and rename** (2–3 days) | delete the IP models and reference stills; rename tokens (`hzc` → `ub`), storage keys v5, title and logo (§1.1); centralise the camp coordinate (Comb); `tools/gate-roster.mjs` + `gate-places.mjs`; **A-names** in the suite; the engine GPU decision | A1, A9, A20b, A90, A-names, V-logo |
| **1: Isa vertical slice** (~1 week) | promote `build-human` + rig profile; A1 Haar Coat; braid weight; face layer and fields; **aim re-derivation**; meleeLayer re-measure; Fieldbow + Rod baked GLBs; gear ≤ 2 draws | A12–A16, A32, A33, A35, A101–A107 restaged, A90, V-isa-glance, V-isa-face, V-human idle/sprint/draw |
| **2: Sounding Coast blockout** (~1 week) | heightfield recipe (1024), 6 biome masks, sea and skirt with masks; Black Strand + Comb dressing; `haar` weather + fog perception + **beams**; Tiller (restyle) + **Plumb** | A9, A21 (new PERF_SCENARIOS), A58b/A59b/A59c re-staged, **A-sil40** (2 kinds), **A-haar**, **A-lamp-states** |
| **3: the first hour** | **Picket, Shear, Harrow** (+ autorig tool chains, gait `pinLeg`); Stakedriver, Kiln Pots; stake lines, Flagged, Tally Boards; the Pan + Whitecut; NPC atlas/LOD + archetypes 1–12 | A44–A48 per new kind, **A-pin**, **A-flag**, **A-weak40**, **A-weapon-role** (4 rows), **A-npc-variety**, a scripted first-hour playthrough, A90-expansion |
| **4: armor and guard** | sets B–D (all 12 variants), Lantern Buckler (UAL2 shield clips), slides and 1 m climbs | **A-armor-verb** (12 rows), A-outfit-swap-memory, Buckler parry gate |
| **5: depth** | Kiln, Winch (+ un-tear), Weir (+ per-leg pole), Sounder; Gaff; Lagoons, Organ Shelf; **tide** | per-kind rig gates, A-weapon-role (all 6), tide nav gate |
| **6: endgame** | Spindle, **Kite** (after its spike), **Gantry** (after its landmark pass); Footings, Glazeworks, Assessor handlers; stretch: Wardens | A-tether, Gantry A21 fight scenario, A90 × 3 fight cycles |

### 11.6 New gates proposed (literal, scripted)

| gate | assertion |
|---|---|
| **A-sil40** | per Work, side and front silhouette masks rendered at 40 m (FOV 55, 1600×900, flat ink); pairwise shape-IoU ≤ 0.45; height ≥ 20 px (Picket exempt) |
| **A-weak40** | each primary weak point ≥ 5 px across at 40 m; luminance contrast vs surrounding hull ≥ 3:1 at 13:00 `clear` and 06:30 `haar` |
| **A-lamp-states** | consecutive states differ by ΔE2000 ≥ 25 **and** iris area ratio ≥ 2; beam visible in wary/hostile when `densMul` > 1.2 |
| **A-haar** | in haar, Isa crouched at 15 m from a Plumb for 10 s is never detected; in clear weather she is detected within 3 s |
| **A-flag** | a Picket's flag → every Work within 60 m enters search toward the flag ≤ 1 s; pulling the flag clears the state ≤ 1 s |
| **A-pin** | a stake on a planted foot: foot world drift ≤ 2 cm for the pin duration; the other feet still pass A45c; a stake on a swing foot pins nothing |
| **A-tether** | Kite position stays ≤ tether + 0.2 m; no NaN over 10 min; a Gaff heave grounds it ≤ 3 s |
| **A-armor-verb** | each of the 12 variants changes its declared stat by its declared amount in a scripted probe |
| **A-weapon-role** | the 6 scenarios of §5.7: the named weapon beats the median of the others by ≥ 30 % on the metric |
| **A-npc-variety** | ≥ 10 archetypes with distinct (mesh-set, tint, clip) signatures; ≥ 8 distinct in one Comb frame; ≤ 2 draws each |
| **A-names** | `names-check.mjs` exits 0 |
| **V-isa-glance**, **V-isa-face**, **V-child-read**, **V-npc-builds** | the visual criteria in §3.4, §3.2, §6.2 |

### 11.7 Changes needed in kept code (all small; each behind data so old paths are unchanged)

| file | change |
|---|---|
| `machines/gait.js` | `pose.pinLeg` (forced stance plus world foot lock; the mirror of `limpLeg`); optional per-leg IK pole (lateral knees, Weir) |
| `machines/autorig.js` | **tool chains**: extra bone chains parented to a spine or head bone (Shear blades, Winch hooks, Spindle ring and lance, Gantry jib and hook) |
| `rig/components.js` | un-tear (Winch repair): clear the torn bit, re-show, reset `tearHp` |
| `ai/perception.js` | fog factor on sight range; per-player beam-lock multiplier (armor) |
| `world/environment.js` | `haar`, `seastorm` rows; per-weather `fogFalloff`; tide state; new hour keyframes |
| shared loader (`assets` / `variety-assets`) | dequantise on load; `quantise:false`; sensor `noShadow`; `EYE_COLORS` → `LAMP_STATES` |
| `combat/*` | weapon kinds: driver, thrown-on-line, thrown pot, off-hand shield. The weapon contract is kept; the Buckler parry window |
| `entities/player.js` | slide and 1 m climb clips; shield stance; orbit capsules from the rig profile |
| new | `TetherFlightController` (Kite); `LampBeams` (one instanced mesh) |
| `world/terrain.js` | `WORLD_SIZE` 1024 and the new recipe, keeping every exported function |

### 11.8 Decisions for Kevin

1. **Title:** UNBUILT (recommended) or DATUM.
2. **Heroine:** Isa Brack (name and look, §3).
3. **Map size:** 1024 m with 35 % sea (recommended), or keep 720.
4. **Human enemies:** stretch (recommended) or core.
5. **Blender face pass:** only if V-isa-face fails (recommended).

---

## Appendix: files from this lane

- `docs/research/round5-direction-b.md`: this document.
- `tools/r5-direction/sheet-b.mjs`: renders the three sheets and prints the silhouette and weak-point pre-check (about 0.8 s, sharp only, no network).
- `tools/r5-direction/names-check.mjs`: the literal Horizon names check (exit 1 on any HIT).
- `docs/media/r5-direction-b/roster-read.png`, `palette.png`, `logo.png`.

No servers or browsers were started. Nothing under `src/` or `public/` was touched, and port 5173 was not touched.
