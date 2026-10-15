# Round 5 — Creative Direction C (identity-first): **SALTLINE**

Owner: creative director C, Round 5, Oct 15 2026. Status: proposal for the orchestrator and Kevin.

**Inputs:**
- `docs/research/round5-pipeline-humans.md` (the human lane)
- `docs/research/round5-pipeline-creatures-world.md` (the creature and world lane)
- `docs/ROUND5-INVENTORY.md`
- the POC frames in `shots/r5-poc-*.png` and `docs/media/r5-poc/`

Nothing under `src/`, `public/` or `tools/` was edited.

**What is and isn't verified.** Numbers marked *measured* come from the two pipeline docs, which ran them on this Mac. Every other number is a budget or a design target, and is labelled as one.

I checked names in two ways:
- with a grep over the repo's eight Horizon canon docs and against the inventory's Appendix A regexes, via `scratchpad/r5/dirc/namecheck2.py`;
- by web-checking the title candidates.

§9.2 has the results.

---

## 0. The identity on one page

**Title:** **SALTLINE**. The working title *Horizon Zero Claude* is retired: "Horizon" and "Zero Dawn" are Sony marks. The Claude spark stays, as the lamp on the logo's line (§8.8).

**Premise:** *On a fog-bound volcanic coast, the old world's sea-defence machines still survey, dredge and wall a shoreline that drowned four hundred years ago. When the line they obey jumps overnight to the eaves of her stilt village, a salt-raker named Ebba has to hunt her way to the tower that sets it.*

**The one image.** A thin survey-red line is painted at one exact height across everything: black sand, basalt columns, the reed walls of a village. It runs level and unbroken into the fog. A woman with a white band across her eyes stands just above it, and a walking tripod with a lighthouse lamp stands just below.

**The four pillars:**

1. **Line & Level.** Everything in this world is measured. The machines survey, the people read tides, and the UI is a nautical chart. One horizontal line is the brand everywhere:
   - the logo rule;
   - Ebba's salt band;
   - the band on every machine;
   - the Datum line painted across the world;
   - the health "staff".
2. **Instruments, not animals.** The machines are glazed-ceramic survey instruments and coastal plant: tripods, gyroscopes, kilns, dredgers, gantries. They have lamps, not eyes. They have no jaws, heads or tails, and nothing about them is a dinosaur. They are the only glossy things in the world.
3. **A cold fog coast.** Black sand, white salt pans, basalt organ-pipes and a lagoon, under silver morning fog (the *haar*) and copper evening light. Nothing about it is green-gold American West.
4. **Ebba.** Shaved sides, one heavy braid weighted with a bronze plumb-bob, and a white salt band across her eyes. She wears indigo and bone with a single glossy ceramic pauldron, carries a red-and-white banded survey pole, and has her quiver on her hip.

**The silhouette test.** From a flat black silhouette at 8 m, a stranger should be able to point out:
- the swinging weighted braid;
- the one-sided pauldron;
- the split kilt;
- the diagonal pole;
- the hip quiver;
- and never "a mane".

From a flat black silhouette of a machine, they should see a tool: a tripod, a crane, a kiln. They should never see a beast.

---

## 1. Title, premise, setting

### 1.1 Title and mark

| candidate | finding | verdict |
|---|---|---|
| Horizon Zero Claude | "Horizon" and "Zero Dawn" are Sony trademarks; the logo was a parody of HZD's | **retire** |
| Tidemark | an existing itch.io game: *Tidemark*, a nautical survival tabletop game set in a drowned city (mrgiardina.itch.io/tidemark). Same theme, same word, games class. It also shares "Tide" with HFW's Tideripper | reject |
| Datum | an existing itch.io game, *DATUM* (girali.itch.io/datum) | reject as title; keep as the in-world term |
| **Saltline** | a web search on Oct 15 2026 found no game called Saltline. There is a 2017 novel, *The Salt Line* (two words, different medium) | **adopt**, and run a USPTO/EUIPO clearance search in classes 9, 28 and 41 before anything public |

Why Saltline:
- A **saltline** is the white crust that evaporating seawater leaves at the high-water mark: a tidemark made of salt.
- It names Ebba's people (salt), the plot (the line) and the logo (a rule) in one word.

**Rename the code prefix too:**
- `hzc` → `sln`;
- storage keys → `sln.save.v5` and so on, with a version bump so old saves are refused (inventory §3.4);
- CSS → `.sln-*`;
- log tag → `[SLN]`;
- `package.json` name → `saltline`.

The full logo construction is in §8.8.

### 1.2 Premise and myth

**The Littoral Works ("the Works").** Late in the old world, the coasts were held by an autonomous civil-engineering fleet:
- survey tripods, dredgers and pile-drivers;
- kiln-walkers that fired the ceramic armour units walls were built from;
- cranes, levelling walkers and tethered wind-vanes.

They took no orders from people. They obeyed **the Datum**: one number, a reference height, broadcast from a 60 m tide-gauge tower called **the Staff**. The Works' single rule is that land above the Datum is kept dry and everything below it is seabed, to be dredged, piled and walled.

**The Drowning.** The sea rose faster than the Works could build, and the old coast went under. Four hundred and thirty-one years later the Works still run, but the Datum has sat at −2.0 m for centuries. The machines work the shallows, the people live above them, and the two have an old, uneasy truce.

**The jump.** The game opens the morning after the Datum jumped to **+3.2 m**. Overnight, survey tripods walked through Ebba's village of Rakewich and painted a survey-red line across every hut at +3.2 m. The floors are at +2.6 m. By the Works' rule, Rakewich is now seabed.

Further up the coast the pile-drivers have turned inland, and a walking gantry crane has started a new dyke across the salt pans.

**The hooks (light; story is not this doc's job):**
- The **Levelled** cult believe the Line is the world's will, and someone climbed the Staff.
- The bronze plumb-bob on Ebba's braid was her mother's, and it is a Levelled token.
- The act-2 threat is **+9 m**, the crest of the old sea wall. Above that line nothing in the Saltings would be dry.

### 1.3 Location: the Saltings, on the Fogcoast

The **Fogcoast** is a cold-current fog desert on a volcanic shore, ocean to the west. The playable region is **the Saltings**: a lagoon basin, salt pans and dunes between a basalt headland, a cinder upland and the ruins of the old sea wall.

| real place | what we take | where it lands |
|---|---|---|
| Reynisfjara and Dyrhólaey, Iceland | black-sand beach, basalt column cliffs and sea caves, sea stacks | Black Strand, the Organ, Gauge Stack |
| Giant's Causeway, Northern Ireland | hexagonal basalt pavements stepping into the sea, 1 m column steps | the Organ: climbing on columns |
| Skeleton Coast and Sandwich Harbour, Namibia | dunes falling straight into a lagoon, permanent offshore fog bank, half-buried ships | Black Strand, the Hulk, the haar bank |
| Walvis Bay salt works, Namibia; Trapani salt pans, Sicily | evaporation ponds in rose, rust and jade; wind-pumps; salt mounds | the Pans, Rakewich ponds |
| Guérande salt marsh, France | *paludiers* raking salt with long rakes from clay-walled ponds | Panwright work and tools |
| Danakil, Ethiopia | salt cut into bars and used as currency | **salt bars** are the currency |
| Atacama, Chile: Alto Patache fog nets, the salares | fog-catcher nets on ridges; salt polygons | the Combs; the Pans' crust |
| La Geria, Lanzarote | black lapilli fields, crescent stone walls around vines in pits; dragon trees (Canaries) | Cinder Rise |
| Lake Abbé, Djibouti | limestone chimneys venting steam on a salt plain | the Flues |
| Mont-Saint-Michel and Lindisfarne | tidal causeways that drown on a schedule | the Swatchway causeway |

**Why this setting:** it is the opposite of Horizon's world, and also cheap to render:
- **Opposite of Horizon:** Horizon's American West is green forests, red-gold grass and snowy peaks.
- **Cheap:** sparse vegetation, open ground, and fog-limited sightlines. Fog lets the far tier fade by 350–600 m, by design.

### 1.4 Era and technology

**Era.** 431 years after the Drowning. Panwrights count years by the great spring low tide, so the game is set in "the 431st Low". The old-world collapse is placed in the late 22nd century and never dated on screen.

**Human technology:**

| category | what they have |
|---|---|
| ceramics | wheel pottery and kilns; they glaze, but cannot match machine glaze |
| salt | salt chemistry: brine, crusting, salt-curing |
| lines | rope and tarred line; nets |
| blades | knapped obsidian and machine glass |
| power | wind-pumps |
| metal | bronze and machine glaze salvaged from the Works. They re-forge bronze but cannot smelt steel |
| weapons | no firearms and no gunpowder. Spring and torsion devices only |

**The Works' technology:**
- glazed ceramic over bronze gimbals;
- graphite bearings;
- verdigris copper cabling;
- lighthouse lenses.

The Works make no plastic and no screens, and nothing they make glows blue.

### 1.5 Climate

- **Overall:** cool and dry. The cold current upwells offshore.
- **Temperature:** 12–22 °C by day, 6–10 °C at night.
- **Rain:** under 50 mm a year.
- **Haar (fog):** on more than 200 mornings a year a dense sea fog fills the lowlands.
  - Its top sits at about **+22 m**.
  - It burns off by about 11:00.
  - It creeps back in from the western sea bank at dusk.
- **Wind:** a north-west sea breeze every afternoon.
- **Tides:** semi-diurnal, two a game day, ±1.2 m around mean sea level 0.
- **Weather states** (the `setWeather(name)` vocabulary):

  | state | what it is |
  |---|---|
  | `haar` | dense low fog |
  | `clear` | no fog |
  | `squall` | salt spray and gusts |
  | `blow` | a black-sand dust storm: dark particles, low visibility |

### 1.6 Time-of-day palette

These keyframes replace the "HZD late afternoon" keyframes in `world/environment.js`.

| hour | sun elev. | sun colour | sky zenith / horizon | haar | shadow tint | exposure | the mood |
|---|---|---|---|---|---|---|---|
| 05:30 pre-dawn | −4° | — | `#2A3346` / `#8C8FA0` | dense, top +22 m, `#9EA6AE` | `#3A4258` | +0.6 EV | blue-grey hush; only machine lamps are bright |
| 07:00 haar morning (**hero hour**) | 6° | `#F3D9B0` | `#8FA2B4` / `#D6D7D2` | dense, top +22 m, `#C9CDCF` | `#5C6670` | +0.3 | silver, low contrast; a **fogbow** (white arc) opposite the sun; from the Cinder Rise you look *down* on a white fog sea |
| 12:00 salt noon | 55–70° | `#FFF6E8` | `#6E93B8` / `#C8D6DE` | burned off; a grey bank stays on the west horizon | `#3B4250` | −0.3 | high-key glare, hard shadows, pans blinding white, ponds saturated |
| 17:30 copper | 12° | `#E9A15F` | `#5D7A9C` / `#E8C9A4` | wisps returning | `#4A4E68` | 0 | raking copper on black sand, long shadows, wet sheen at the tide line |
| 19:15 rose | 1° | `#D9786A` | `#3B4466` / `#D59A8E` | rising from the sea | `#2E3350` | +0.2 | the lagoon mirrors rose and indigo; the salt ponds glow pink |
| 22:00 night | −30° | moon `#B7C4D6` | `#0F1424` / `#222A3E` | moderate in the lowlands | `#10141F` | +1.0 | stars; machine lamps rule the frame; faint surf phosphorescence |

---

## 2. Protagonist: Ebba

### 2.1 Who

**Ebba**, 23, a Panwright salt-raker from Rakewich. Panwrights name children for tide states: Ebba (ebb), Neap, Slack, Flood. She is:
- practical and wry, and stubborn about levels: she can read a slope to the hand's breadth;
- the daughter of a woman who left the Levelled.

She fights the way a raker works: reach, timing and patience. She carries:
- the **Tine**, an old-world bronze tuning fork. Struck, it lets her *hear* machines;
- a **ranging pole**, a red-and-white banded survey rod with a blade.

### 2.2 Silhouette: the five reads

| read | what it is | why it is ownable |
|---|---|---|
| **Head** | Shaved sides, black. One thick rope braid from the crown to the shoulder blades (0.42 m), ending in a **bronze plumb-bob** the size of a hen's egg. The bob swings on the spring solver | Aloy is a red mane of many braids. Ebba is one line with a weight on the end, which is the brand motif again |
| **Face** | A **salt band**: a 32 mm band of white salt paste across both eyes from temple to temple, its lower edge ruled with a 2 mm survey-red line | reads at 20 m, costs one texture composite, and nothing on the temple |
| **Shoulders** | **Asymmetric.** A single glossy bone-white ceramic pauldron on the **left** shoulder, cut from a Tiller hull plate with its oxblood band intact. The right sleeve is rolled to the elbow | a glossy shape on a matte body tells you she wears the machines |
| **Waist / hips** | A knee-length waxed oilskin **apron-kilt**, split front and back into two moving panels, over slim trousers. A square **hip quiver** on the right thigh. A bronze Tine holster on the left hip | it moves at every step, and quiver-on-hip changes her whole outline |
| **Back** | The **ranging pole** on the diagonal: right shoulder high, left hip low. 1.85 m, banded survey-red and bone every 0.5 m. The bow crosses it on the opposite diagonal when stowed | a survey rod as a spear is unique, and the banding reads at any distance |

### 2.3 Body and proportions

**Base:** UBC "Superhero" female (CC0), athletic and long-legged. She keeps the stock proportions, normalised to **1.72 m**.
- 1.72 m is Aloy's height. It is deliberate: every absolute-metre constant in the kept stack compares like for like, and the human lane already ran there.
- The arm is 0.233 + 0.242 = **0.475 m** (*measured*). Pelvis rest is 0.911 m and the head joint 1.502 m (*measured*).

**No bone-length edits.** They would invalidate the retarget bake. Identity comes from the head, face, outfit and gear, not from re-proportioning.

### 2.4 Face

These notes are for the build's `sharp` composite pass onto the 1024² skin base colour. No Blender.

| layer | spec |
|---|---|
| salt band | bone `#EDE8DC` at 85% opacity, 32 mm tall, temple to temple across the lids and bridge. Feathered 3 mm top edge; salt-crystal speckle at the edges (2–4 px dots, 40% opacity) |
| the ruled edge | survey red `#C2362F`, 2 mm, perfectly straight along the band's lower edge |
| scar | a vertical 18 mm scar through the **left** eyebrow, lighter by +12% value. Raised in the normal map (a Sobel bump from the same mask) |
| brows | `Eyebrows_Female`, tinted `#141414`, straight and heavy. Lift the inner ends 1 mm with a UV nudge in the composite |
| eyes | iris tinted **grey-green `#8FA39A`**: striking against dark skin, and nothing like Aloy's green |
| ears | three small bronze rings on the left ear: a 200-tri ring set, rigid on `Head` |
| skin | the UBC "Dark" base, as in the POC. Roughness 0.45–0.60 |

Later and optional: a Blender sculpt pass for a heavier brow ridge, a broader nose and a wider jaw. Trigger it only if V-ID-face fails (§10.4).

### 2.5 Hair

| part | source | detail |
|---|---|---|
| shaved sides / crown | `Hair_BuzzedFemale` shell (CC0) | tint `#141414`, 512² |
| braid | generated (proven) | 6 `dyn_hairBraid_*` joints plus `_end`, a 1,104-tri plaited tube (*measured* in the POC). **Shortened to 0.42 m**, so it ends between the shoulder blades and clears the hip quiver and the pole butt |
| plumb-bob | generated | a 280-tri lathe of bronze `#9A6B3A`, roughness 0.4, on `dyn_hairBraid_end`. Spring mass up and stiffness tuned so the tip swing at sprint stays inside **0.09–0.25 m** (the POC braid measured 0.086–0.225 m) |
| collider | **required** (M10) | spring-side capsules on the right forearm and hand plus the head ellipsoid. **Bar:** bob-to-draw-hand ≥ 0.06 m at full draw at camPitch −0.55 / 0 / +0.3 |

### 2.6 Default outfit: the Raker set, base variant

Pieces are bound by joint name and exported in canonical joint order. At equip they merge into **one** SkinnedMesh on the outfit atlas (§3.1).

| piece | source | weighted to | tris (target) | notes |
|---|---|---|---|---|
| head + neck skin | UBC body, cut by skin weight | `Head`, `neck_01`, `spine_03` | 3,088 (*measured*) | carries the salt-band composite. Eyes are atlased in |
| eyes | UBC eye mesh | `Head` | 768 | atlased into the skin texture (roughness 0.1 in the ORM) |
| brows + hair shell + braid + bob | §2.5 | `Head`, `dyn_hairBraid_*` | ≤ 4,000 | hair material, 512² |
| tunic | MCO `Female_Peasant_Body` + `_Arms` | spine, clavicles, arms | from 13,568 (the whole Peasant set, *measured*) | re-textured indigo `#2C3557`. Right forearm repainted as skin below a generated 300-tri rolled cuff |
| trousers | MCO `Female_Peasant_Legs` | pelvis, thighs, calves | (in the above) | slate `#3A3F4A` |
| boots | MCO `Female_Ranger_Feet` | calves, feet | (Ranger set) | oilskin brown, plus generated rope shin wraps (400 tris) |
| apron-kilt | generated | `dyn_apronF_01..04`, `dyn_apronB_01..04` under `pelvis` | 1,600 | oilskin `#4A4436`, roughness 0.5. The solver classes it `cloth` by name |
| glaze pauldron (L) | generated lathe shell | `clavicle_l` 70 / `upperarm_l` 30 | 1,200 | bone glaze `#E8E1D0`, roughness 0.25, oxblood band |
| bow bracer (L forearm) | generated | `lowerarm_l` | 600 | bone glaze. A real archer's arm guard |
| sash | generated | `pelvis`, `spine_01` | 500 | survey red `#C2362F` edge on indigo |
| **outfit total** | | | **≤ 17,500** | one 1024² atlas: base / normal / ORM |

The hip quiver (1,500 tris on `thigh_r` 85 / `pelvis` 15) and the Tine holster (300 tris on `pelvis`) belong to the **gear** merge, not the outfit.

### 2.7 Ebba's palette

| swatch | hex | where |
|---|---|---|
| indigo | `#2C3557` | tunic |
| slate | `#3A3F4A` | trousers |
| oilskin | `#4A4436` | apron-kilt, boots |
| bone glaze | `#E8E1D0` | pauldron, bracer, pole bands |
| survey red | `#C2362F` | salt-band rule, sash edge, pole bands |
| bronze | `#9A6B3A` | plumb-bob, Tine, fittings |
| salt | `#F1EEE6` | face band |
| hair | `#141414` | |
| iris | `#8FA39A` | |

### 2.8 Ebba vs Aloy at a glance

| | Aloy | Ebba |
|---|---|---|
| hair | a red mane of many braids | black, shaved sides, **one** braid weighted with a bronze bob |
| face | bare | a white salt band across the eyes, ruled in red |
| temple | a Focus device | nothing |
| clothes | earth-brown leather and fur | indigo linen and waxed oilskin |
| shoulder | | one glossy white ceramic pauldron |
| quiver | on the back | on the hip |
| spear | a spear | a red-and-white banded survey pole |

### 2.9 Movement notes (the kept stack)

**What carries over with no changes** (*measured* in the POC):
- locomotion, the cadence and amplitude solves, and foot locks;
- every angular overlay;
- the spring solver.

Kevin's rules hold:
- idle hands as they are;
- running arms swing fore and aft beside the body;
- the draw hand at the cheek, outside the hair, with the elbow level or back and the bow arm clear of the chest;
- never an arm behind the head;
- melee performed by the body with the weapon held properly.

**What must be re-derived on her** (human lane §4.3):
- the ~12 bow and aim constants. Today the bow arm is at 141° and the draw elbow 9 cm low; it must reach the 165–172° bar, with the elbow level;
- every `meleeLayer` table;
- the orbit capsules;
- `STOW_POS`.

**What I add on top:**
- the bob collider (§2.5);
- the pendulum-cast beat (§4.1);
- a hip quiver flourish that reuses the existing `QUIVER_HIP` point, re-measured on her.

---

## 3. Armor: 4 sets × 3 variants

### 3.1 Authoring rules (all sets)

1. **Skinned pieces on one skeleton.**
   - Every piece is a SkinnedMesh on the UBC 65-joint skeleton, bound by name.
   - It is exported against the canonical joint list in canonical order (the build's graft step).
   - Because the order is shared, the equipped piece set can be **merged at equip time into one SkinnedMesh per material** with `mergeGeometries`, which keeps Ebba's outfit at **1 draw**.
2. **Variants are recipes.** A variant is a base garment set, plus piece toggles, plus a tint and texture composite, plus 1–3 added pieces. Variants share the set's 1024² atlas (base / normal / ORM WebP).
3. **Dispose on swap:**
   - the merged geometry, materials and every texture slot;
   - **the Skeleton**, which owns a bone DataTexture. The human lane measured a leak of +1 texture per mesh per swap without this;
   - the fade-clone bookkeeping (`_matMap`, `_mats`).
4. **Budgets:**
   - each piece ≤ 3,000 tris;
   - each merged variant ≤ 17,500 tris;
   - each set's files ≤ 0.8 MB, plus ≤ 0.15 MB per extra variant pack.
5. **No movement modifiers.** Armor never changes speed, dodge timing or jump. The kept movement and its canon-speed gates (A28b, A81) stay untouched. Penalties are noise, visibility and elemental only.
6. **Stat schema:**

   | stat | meaning |
   |---|---|
   | `impact` | % reduction of the impact channel |
   | `tear` | % reduction of the tear channel |
   | `flare` / `brine` / `galvanic` | % resistance (negative is a weakness) |
   | `notice` | multiplier on how fast machine awareness fills |
   | `noise` | multiplier on footstep noise into the stimulus bus |
   | `perk` | one perk per variant |

   It maps onto the existing three-channel `takeDamage`, `ELEM_THRESHOLD`, the stealth field and `ai/stimulus.js`.

### 3.2 Set A: **Raker** (Panwright working clothes, light, starter)

**Base:** the Peasant garments re-textured indigo, the oilskin apron-kilt, rope shin wraps and the bone pauldron (§2.6).

| variant | what changes visually | impact / tear | elements | notice / noise | perk |
|---|---|---|---|---|---|
| **Raker** | the §2.6 look | 5 / 5 | 0 / 0 / 0 | 1.00 / 1.00 | +25% salt bars from raking and salt caches |
| **Fogcatcher** | adds a pearl-grey fine-mesh **net mantle** over the shoulders, with a soft net hood (toggle; alpha-tested net texture). The apron is dyed haar grey `#9EA4A6`. The silhouette softens and blurs | 5 / 5 | galvanic −10 | **0.75 in haar**, 1.0 otherwise / 0.90 | in haar, lamp-dark Shears cannot locate her beyond 8 m |
| **Brinewalker** | the boots and trousers are swapped for waxed **thigh waders** (oxblood-brown `#4B2A24`). The apron is shortened to mid-thigh. White salt crust is composited along every hem | 8 / 5 | brine +40 | 1.00 / 1.00 | no Brine crusting from standing water; full wading speed up to 0.8 m deep (uses the existing wade logic, with no new speed value) |

### 3.3 Set B: **Chainman** (old-world survey crew, medium, ranged)

**Base:**
- a **long slate-indigo oilskin coat** to mid-calf, split into four tails: 4 `dyn_coat*` chains of 3 links each;
- a **tall standing collar** that stops 40 mm below the cheek anchor, so the draw hand never meets it;
- brass instrument buttons;
- a survey-tape bandolier banded red and bone;
- the Ranger boots and bracers, re-textured.

| variant | what changes visually | impact / tear | elements | notice / noise | perk |
|---|---|---|---|---|---|
| **Chainman** | the coat and bandolier | 15 / 10 | flare +10 | 1.00 / 1.00 | bow draw time −10% |
| **Staffman** | adds a levelling-staff **sash** (black E-pattern on bone) worn diagonally, matching E-banded upper-arm bands, and a brass monocular on a chest strap | 12 / 10 | 0 | 0.95 / 1.00 | Sounding marks persist +4 s; weak-point damage +10% |
| **Linesman** | adds a coiled tarred **sounding line** over the left shoulder (rigid on `spine_03` and `clavicle_l`) and thick tan **rope gauntlets** | 15 / 15 | galvanic +10 | 1.00 / 1.05 | +1 Sounding Line charge; tie-down hold +30% |

### 3.4 Set C: **Glaze** (Holdfast heavy armour)

**Concept:** machine-ceramic plates wired over a quilted gambeson.

**Base:**
- a quilted indigo-black gambeson (`#1E1C1D`);
- pauldrons on **both** shoulders, a chest plackart and tassets;
- plate colour and plate *shape* change per variant.

Machine glaze makes Ebba partly glossy (roughness 0.2–0.3). She visibly wears what she hunted.

| variant | what changes visually | impact / tear | elements | notice / noise | perk |
|---|---|---|---|---|---|
| **Bone Glaze** | broad rounded white plates from Tiller hulls, oxblood band across the plackart | 35 / 30 | galvanic −15 (the bronze wiring conducts) | 1.15 (glints) / 1.30 | knockdown threshold +40% |
| **Celadon Glaze** | overlapping celadon **lamellar scales** (Davit and Weir shells), verdigris lacing | 25 / 25 | brine +45, galvanic +20 | 1.10 / 1.25 | immune to *Crusted* |
| **Oxblood Glaze** | ridged **crackle-glaze** plates in oxblood with kiln-soot gradients and bronze rims (Kiln shells) | 30 / 25 | flare +50, brine −15 | 1.10 / 1.25 | melee impact +20% |

### 3.5 Set D: **Levelled vestments** (the cult's dress: stealth against machines, tuning)

**Base:**
- a bleached linen wrap-robe (`#EDE8DC`) over trousers;
- a rope belt with a single bronze bob;
- black E-ticks painted on the forearms.

Hood up, the braid's spring chain is suspended and the braid is hidden.

| variant | what changes visually | impact / tear | elements | notice / noise | perk |
|---|---|---|---|---|---|
| **Novice** | the wrap and the forearm ticks | 0 / 0 | 0 | **0.75** / 0.85 | a Plumb's first detection becomes a 2 s "re-reading" before any alarm |
| **Linewalker** | adds black-and-bone E-banded wraps on the shins and upper arms and a polished bronze **mirror disc** on the chest | 5 / 5 | 0 | 0.70 / 0.85 | Sounding radius +50%; Craze build-up +20% |
| **Datum-sworn** | a full hooded mantle with a **vertical survey-red plumb line** embroidered down the back, a bronze bob at the hood's point, and a white hood over the shaved head. She becomes a vertical white blade | −10 (takes 10% more) / 0 | 0 | **0.60** / 0.80 | Retune lasts ×2 |

**Totals:** 12 variants from 4 base garment sets and about 22 generated pieces. Every variant passes the silhouette test against the others:
- coat tails, the net mantle and waders, double pauldrons and the white robe read differently at 20 m;
- colour differences are only a secondary cue.

---

## 4. Weapons: 6 weapons, 2–3 variants each

### 4.1 Loadout, stow and the shared "pendulum cast"

**Visible gear rule.** At most **2 back items and 2 hip items** are rendered. Today that is the bow and pole on the back and the quiver and Tine on the hips. Other loadout items are "in the pack" and not drawn. On every loadout change, the stowed set is merged into **one gear mesh on a 512² weapon atlas**, and the old mesh is disposed.

| | draws |
|---|---|
| stowed gear | 1 |
| held weapon | 1 |
| inherited gear today | 65 meshes (*measured*) |

**Stow positions:**

| item | position |
|---|---|
| pole | diagonal across the back |
| bow | the opposite diagonal, string out |
| Flenser | a cross-draw sheath on the left hip |
| Plank | flat on the back, under the pole (it replaces the bow on the back when the Plank is in the loadout) |
| Line and Censer | right hip, in the quiver's place when equipped |

**Pendulum cast** (a new procedural beat, shared by the Sounding Line and the Censer):
- **Swing:** the right arm swings the weight fore and aft *beside the thigh*. It is the same plane and side as her running arm swing, with larger amplitude: 1–2 swings.
- **Release:** forward-up at 30–40° above horizontal.
- **Constraints, built in:** the hand never rises above `shoulder_y + 0.05 m`, and the elbow is never more than 0.10 m behind the head plane (R8). The arm is never behind the head.
- **Why not a clip:** UAL2's `OverhandThrow` cocks the arm behind the head, so it is **not used** for either weapon. The heaving-line toss sailors actually use is underhand or sidearm.
- **Gate:** `A-cast-pendulum` (§10.6).

### 4.2 Elements and ammo

| element | colour | build-up effect | combo | ammo |
|---|---|---|---|---|
| **Flare** (oil and embers) | `#F0592B` | *Burning*: damage over time; Kiln is immune | **Quench**: Brine on a Burning target cracks its glaze (a tear burst on every plate in a 2 m radius) | Flare arrow, Flare pot |
| **Brine** (saturated brine, salt crystal) | `#BFE3E6` | *Crusted*: joints seize. 8 s at −40% machine move speed; plates brittle (+25% tear) | primes Quench; wets a target for Galvanic | Brine arrow, Brine pot |
| **Galvanic** (copper-zinc cells) | `#7FA7FF` | *Stalled*: lamp out and motors stop for 4 s | ×1.5 build-up on wet targets (in water, in haar, or Crusted) | Galvanic arrow, Galvanic jar |
| **Craze** (tuned resonance) | `#E6D49A` | *Crazed*: glaze armour drops to 0 for 10 s, and the next impact shatters the plate as a component tear | Crazed plus Stake = critical | Tuned arrow (whistling ceramic head), glass shot (Censer) |

**Impact** and **tear** stay the base channels, exactly as in `combat.js`. Element ids are `flare`, `brine`, `galvanic` and `craze`.

### 4.3 The six weapons

#### W1. **Bow**: precision ranged

**Materials:**
- the stave is laminated drift-ash with a sinew back, painted oxblood;
- **glazed ceramic nock caps** in bone;
- the grip is wrapped in indigo cord.

Arrows are fletched in bone and indigo, cresting in survey red.

**Silhouette:** every bow tip ends in a white ceramic cap that reads at range.

| variant | silhouette | draw time | range | impact / tear | ammo |
|---|---|---|---|---|---|
| **Fieldbow** | 1.35 m symmetric recurve | 0.62 s | 45 m | 1.0 / 1.0 | Field, Flare, Brine |
| **Staffbow** | **1.85 m asymmetric longbow**, gripped at 38% from the bottom (yumi-like). Unmistakable | 0.95 s | 80 m | 1.4 / 1.2, weak point ×2.0 | Tuned (Craze), Barbed (tear ×1.8), Field |
| **Hornbow** | 1.05 m reflex composite with glazed recurve tips | 0.40 s | 28 m | 0.75 / 0.8 | Field, Galvanic, Barbed |

**What it needs from the movement stack:**
- **Layer:** the kept `_aimLayer` (torso blade, spine pitch, cheek anchor, two-bone IK on both arms, reach clamp, head-ellipsoid guard, loose follow-through), plus the hip-quiver flourish from `QUIVER_HIP`.
- **Re-derive on her:** `ANCHOR_OFF`, `ANCHOR_DROP`, `HAND_ANCHOR_R`, `HEAD_OFF` / `HEAD_R`, `QUIVER_HIP`, the grip seed, the aim-ray origin, the poles and `_bodyCapsules`.
- **Pull:** solve each variant's `pull` from `Lmax = −u·d + sqrt((u·d)² − ‖u‖² + reach²)` at her 0.475 m arm *before* authoring arrow lengths. Do not pick a pull and then force the arm.
- **Gates:**
  - A35: bow arm 165–172°, hand to head 0.10–0.16 m, outside the hair;
  - A32: elbow level or back;
  - A16: nock to hand;
  - A17: loose follow-through. Fix it, and ask for the sim-clock frame count;
  - A107: draw and holster path.

**Asymmetric grip.** The Staffbow's asymmetric grip is just a grip-socket offset in the model. The IK targets the `grip` empty and is otherwise unchanged.

#### W2. **Ranging Pole**: reach melee

**Materials:**
- drift-ash haft, **banded survey red and bone every 0.5 m** like a surveyor's ranging rod;
- bronze ferrule butt;
- head per variant.

It is authored at its **real length, 1.85 m**, which retires `SPEAR_SCALE 0.80` (M9).

| variant | head | impact / tear | special |
|---|---|---|---|
| **Rod** | a 0.24 m leaf blade of knapped **black obsidian** glass | 1.0 / 0.8 | balanced; the full beat table |
| **Gaff** | a bronze **boat-hook and spike** | 0.9 / 1.5 | a **rip** beat after a hit: the hook pulls a loosened plate or component off |
| **Glasspoint** | a 0.36 m needle of white machine glaze | 0.8 / 0.8 | ×1.6 against *Crazed* or downed targets (Stake) |

**What it needs from the movement stack:**
- **Layer:** the kept `meleeLayer`: grip by construction, masked additive clips, beat table, draw and holster path, guards, step-in.
- **Re-measure on her:**
  - SOCKET, CARRY, READY, STANCE, BEATS, HEAVY and the guards;
  - the stowed spear, which currently floats about 0.2 m behind her back (*measured*). Re-seat `SOCKET.MID` on `spine_03`.
- **Rulings:** R1–R9 stand.
- **One new beat (Gaff only), "rip":**
  - a 0.35 m reverse pull along the haft axis over 0.25 s, with both hands on the haft;
  - elbows stay below the shoulders;
  - the forearm stays ≥ 0.10 m off the belly axis (R9).
- **Gates:** A101, A103, A104, A105, A106 and A107, re-staged.

#### W3. **Flenser**: fast one-handed blade (new)

**Materials:** a curved flensing knife 0.55 m long (0.38 m blade). The edge is black glass set in a bronze spine, with a bone handle wrapped in oxblood.

**Silhouette:** a crescent at the left hip.

| variant | look | impact / tear | moves |
|---|---|---|---|
| **Flenser** | the crescent knife | 0.6 / 0.9 | 3-hit light combo, dash-cut, **Flense** (silent takedown), +25% harvest yield from torn components |
| **Cleaver** | a squarer 0.5 m bronze blade with a glaze inlay | 1.3 / 0.6 | heavy combo; staggers small machines |

**What it needs from the movement stack.** This is the cheapest way to answer Kevin's "melee by the body, weapon held properly":
- **Clips:** UAL2 clips on the **same skeleton**, so there is no retarget:

  | move | clip |
  |---|---|
  | light combo | `Sword_Regular_A/B/C` (+ `_Rec`) |
  | heavy (Cleaver) | `Sword_Heavy_Combo` |
  | dash-cut | `Sword_Dash` |
  | Flense | crouched `Sword_Regular_C` |

- **Masking:** to the upper body over the kept locomotion. Fix `MASK_PREFIX` so it matches `Head` case-insensitively.
- **Grip:** the grip socket on `hand_r`, by construction.
- **Draw path:** from the cross-draw sheath, with the elbow ≤ `head_y + 0.05` (R8).
- **Gates:** A101-style knuckle, blade-ahead and butt clauses; A105 and A106 for planted feet.

#### W4. **Plank**: off-hand shield (new; selecting it equips Flenser + Plank)

Aloy never carries a shield, so this is a genuinely new verb in the genre.

| variant | look | block | special |
|---|---|---|---|
| **Reed Plank** | a 0.9 × 0.45 m tall narrow board of lashed reed under an oilskin face, painted with Panwright tide-lines | 60% impact, frontal 100° | raises in 0.12 s; light bash |
| **Gate Plank** | a 1.1 × 0.55 m slab cut from a **Weir's flood-gate**: celadon glaze on a bronze frame | 90% impact + 30 brine | raises in 0.22 s; the bash staggers medium machines |
| **Glaze Buckler** | a 0.5 m round disc of bone glaze | 45% | a 0.20 s **parry** window reflects small projectiles (slag, brine spit) |

**What it needs from the movement stack:**
- **Clips (UAL2):**

  | move | clip |
  |---|---|
  | guard | `Idle_Shield_Loop` |
  | bash | `Shield_OneShot` |
  | charge | `Shield_Dash` |
  | guard break | `Idle_Shield_Break` |
  | Buckler parry | `Sword_Block` |

- **Socket:** strapped to `lowerarm_l`, with the hand on an inner grip. Verify the clips' shield side at bake time, and mirror them if they are authored right-handed; the clip library already mirrors per combo step.
- **Moving while guarding:** she uses the existing `aim` speed (1.35 m/s). There is no new speed value.

#### W5. **Sounding Line**: thrown control (new)

**Materials:** 8–14 m of tarred line with a bronze weight. It is coiled at the right hip.

**Rendering:** a 16-point Verlet rope written into a preallocated buffer every frame. It is one draw and allocates nothing per frame.

| variant | weight | range | effect |
|---|---|---|---|
| **Lead** | a bronze sounding lead | 14 m | wraps a leg: **tie-down**, through the kept `traps.js` engine and `tieDownCount(kind)`. 3 charges |
| **Grapnel** | a 4-fluke bronze hook | 12 m | **yank**: tear ×2.0 on a loosened component; drags a Vane down by its tether |
| **Chain-lead** | chain plus lead | 10 m | 2 wraps per hit on large machines. 2 charges; 0.9 s cast against 0.6 s |

**What it needs from the movement stack:** the pendulum cast (§4.1); the release event drives the projectile.

#### W6. **Censer**: area elemental (new)

**Materials:** a glazed clay pot on a bronze chain. Before release it hangs at the right hip with a glowing fuse, swaying on a 2-link dyn chain. The pot flies; the chain stays in her hand.

**Silhouette:** a smoking, glowing pot at her hip that reads at 40 m.

| variant | chain | swings | range | burst radius |
|---|---|---|---|---|
| **Hand Censer** | 0.6 m | 1 (0.55 s) | 18 m | 3.0 m |
| **Long Censer** | 1.2 m | 2 (1.0 s) | 32 m | 4.5 m |

**Pots:** Flare, Brine, Galvanic, and glass shot (Craze). Pots come from the pooled projectile system in `arrows.js`.

**What it needs from the movement stack:** the same pendulum cast as the Line, with a heavier, slower swing.

### 4.4 The Tine: the scanner tool (not a weapon slot)

**The tool:** a 22 cm bronze tuning fork with a bone handle, holstered at the left hip.

**Activation** (tap F, toggle):
- a 0.4 s upper-body additive: the right hand strikes the fork on the left bracer at waist height, and the fork is held there for 0.2 s, then holstered;
- **Sounding** stays on until she sprints or attacks.

**The Sounding view** (replaces the violet Focus):
- **The pulse:** a ring expands across the ground at 40 m/s to 60 m (90 m with Linewalker).
- **The ground:** shows **contour isolines**, minor every 1 m and major every 5 m, in celadon `#8FE0C2` on a darkened, desaturated world.
- **Machines:** a celadon outline, with lamps flaring.
- **Components:** small salt-white **benchmark glyphs** (▲ over a bar). **Weak points use the spark colour `#DA7756`**.
- **Patrol routes:** dotted **chain lines**, one dot every 2 m like a surveyor's chain.
- **Tagging** is **flagging**: a red-and-white survey pennant floats over the machine.

---

## 5. Humans

### 5.1 Three factions

| | **Panwrights** (Ebba's people) | **Holdfast** (the wall people) | **the Levelled** (cult of the Line) |
|---|---|---|---|
| who | salt-rakers, fog-catchers and potters of the lagoon | wall-keepers and salvagers who hold the old sea wall and hunt machines for plate | believers that the Datum is the world's will. They walk *along* contours and give land back to the sea |
| palette | indigo `#2C3557`, faded indigo `#4F5F86`, salt `#F1EEE6`, reed `#C2A66B`, oilskin `#4A4436` | Holdfast black `#1E1C1D`, oxblood glaze `#6E1F22`, bone glaze `#E8E1D0`, bronze `#9A6B3A` | bleach `#EDE8DC`, tick black `#17181B`, bronze bob `#9A6B3A`, survey red `#C2362F` |
| motif | **the eye band**: a horizontal salt band. Round forms, wide flat reed hats (0.6 m brim), long rakes, nets | **"they wear their floods"**: every past flood line is painted as a stacked stripe on shields, doors and sleeves. Tall vertical plank shields; angular plate | **plumb lines**: vertical. **A horizontal line painted across the mouth** ("we do not speak against the Line"), the opposite of the Panwright eye band. Shaved heads |
| materials | linen, oilskin, reed, rope, unglazed terracotta | machine glaze plates, quilted gambeson, tarred canvas, salvaged concrete | bleached linen, chalk, bronze |
| architecture | **stilt houses** on driftwood piles; reed walls plastered salt-white; reed thatch weighted with nets and stones; fog-net frames; Trapani-style wind-pumps; boardwalks | a town **inside the broken sea wall** plus two beached hulls as longhouses; roofs shingled with reclaimed glaze armour units; chain booms | white canvas tents pegged in a perfect grid on a carved benchmark terrace; ranging rods everywhere |
| sound / gesture | rake scrape; call-and-answer shouts across the ponds | bells on the wall; hammering | silence; a struck tine; bobs clicking |

### 5.2 How variety is built (no paid tiers)

**The axes:**
- 2 CC0 bodies, with height scaled 1.58–1.86 m;
- 2 base garment sets, re-textured per faction;
- about 20 generated faction pieces: hats, yokes, aprons, shields, robes, goggles, nets;
- 6 hairstyles plus beard (`Beard`, `Buns`, `Buzzed`, `BuzzedFemale`, `Long`, `SimpleParted`) with grey tints for age;
- 4 skin, 5 hair and 3 cloth tints per faction;
- head scale 0.96–1.04 (head children only, so it is safe);
- a **posture overlay** per NPC (§5.4).

**Girth comes from outfit bulk**, not bone scale. Scaling spine bones would scale the arms too.

### 5.3 NPC archetypes (12)

| # | archetype | faction | body / height | age | outfit | idles (UAL1 / UAL2 clips, plus prop) | walk style | where |
|---|---|---|---|---|---|---|---|---|
| 1 | **Salt-raker** | Panwright | F or M, 1.64–1.80 | 20–45 | indigo Peasant, flat reed hat, apron, salt band | `Farm_Harvest` (raking, with a rake prop); `Idle_FoldArms_Loop`; brow wipe via `Consume` | `Walk_Carry_Loop`, rake on shoulder, 0.95× | Rakewich ponds |
| 2 | **Fog-comb keeper** | Panwright | F, 1.62; stoop +12° | 60s, grey bun | net shawl (the Fogcatcher net piece), faded indigo | `Fixing_Kneeling` (mending net); `Idle_Lantern_Loop` at dawn (lantern prop) | `Walk_Loop` 0.80×, stoop, arm swing ×0.6 | the Combs |
| 3 | **Salt porter** | Panwright | M, 1.84 | 20s | sleeveless tunic; **yoke with two salt baskets** | `Idle_FoldArms_Loop`; `Consume` (drinks from a gourd) | `Walk_Carry_Loop` 0.90× | Rakewich ↔ Pans |
| 4 | **Potter / kiln-keeper** | Panwright | M, 1.70, bulky leather apron | 50s, grey beard | soot-and-glaze-splatter apron, bare forearms | `Fixing_Kneeling` at the kiln; `PickUp_Table` (loading pots); `Chest_Open` (kiln door) | `Walk_Loop` 0.90× | Rakewich kiln |
| 5 | **Apprentice** | Panwright | F, scaled 0.92 (1.58 m), head 1.04 | 15 | short tunic, single braid | `Sitting_Idle_Loop` on the jetty edge; `Idle_No_Loop` (sulking); `Interact` | **runs** between tasks: `Jog_Fwd_Loop`, then `Walk_Loop` 1.1× | jetties |
| 6 | **Wall-warden** | Holdfast | M/F, 1.80–1.86 | 25–40 | Bone Glaze plates plus a tall **flood-striped plank shield** | `Idle_Shield_Loop`; `Idle_Rail_Loop` (leaning on the parapet); `Idle_Rail_Call` (shouting down) | `Walk_Formal_Loop` (march) 1.0× | Breakwater walls |
| 7 | **Salvager** | Holdfast | F, 1.70 | 30–45 | Ranger with hood, **smoked goggles**, tool belt, oxblood flood stripes | `TreeChopping_Loop` at a machine carcass (prying plates); `PickUp_Table`; `Crouch_Idle_Loop` | `Walk_Loop`; `Crouch_Fwd_Loop` within 30 m of machines | Dyke Front, the Hulk |
| 8 | **Quartermaster** | Holdfast | M, 1.74, bulky coat | 50s, beard | long oilskin coat, ledger-board prop | `Idle_Talking_Loop`; `Yes`; `Idle_No_Loop` (haggling) | `Walk_Formal_Loop` 0.85× | Breakwater market |
| 9 | **Hull-wright** | Holdfast | F, 1.76 | 35 | leather apron, rolled sleeves, adze prop | `Fixing_Kneeling`; `TreeChopping_Loop` (adzing); `Push_Loop` (hauling) | `Walk_Loop` 1.0× | Breakwater hulls |
| 10 | **Linewalker** | Levelled | F/M, shaved, 1.68–1.80 | 20–40 | Novice or Linewalker wrap, E-ticks, the **mouth line** | `Spell_Simple_Idle_Loop` (holds a plumb line out at arm's length); `Idle_FoldArms_Loop` held 20–40 s | `Walk_Formal_Loop` 0.85×, **on a contour**: routes are authored with height change under 0.3 m end to end | the Bench, and along the Line |
| 11 | **Tuner** | Levelled | M, 1.82, head 0.97 | 60s | Datum-sworn robe, bronze tine | `Spell_Simple_Enter` / `Idle_Loop` (raises the tine at machines); `Idle_Lantern_Loop` | `Walk_Formal_Loop` 0.70×, stoop +6° | the Bench |
| 12 | **Hunter** | neutral | F/M, 1.72–1.80 | 25–35 | Chainman coat, Fieldbow, hip quiver | `Crouch_Idle_Loop` (reading tracks); `Idle_FoldArms_Loop` | `Walk_Loop`; `Crouch_Fwd_Loop` near machines | Black Strand, the Organ |

**Variety bar:** Rakewich and Breakwater together show ≥ 10 distinct archetype signatures (`A-npc-variety`). The human lane measured 8 distinct people from today's parts.

### 5.4 NPC runtime rules

- **Budget per NPC** (*measured today: 25k tris and 6.5 draws, over budget*):
  - **≤ 12k tris at LOD0 and ≤ 4k at LOD1** beyond 25 m (meshoptimizer `simplify`, already installed);
  - **≤ 2 draws**: a body-and-outfit atlas (1024² per body type, composited by `sharp`) and hair.
- **Shadows:** only the **nearest 4 NPCs** cast (an LOD1 proxy, 1 caster each). The rest get a contact blob, one instanced draw for all of them.
- **Animation rate:** beyond 60 m, the mixer updates at 15 Hz. Beyond 90 m the NPC is hidden.
- **Posture overlay:**
  - 4 bone rotations applied after the mixer: spine pitch, neck pitch, shoulder drop, and an arm-swing gain on the `upperarm` pitch;
  - written into preallocated quaternions, with no per-frame allocation;
  - this is how stoops, swaggers and marches differ on shared clips.
- **Clip baking:** bake one ClipLibrary per body type (about 90 ms each), because the male pelvis track is 1.7 cm off, or play the UAL2 clips natively on the shared skeleton.
- **Dispose:** each NPC's merged geometry, atlas references and **Skeleton**.

### 5.5 Human hostiles

**Not in v1.** Levelled zealots could later use the machine AI tables on a human body. Their hit hulls are already species-agnostic. No combat human appears in the first hour.

---

## 6. Machines: the Littoral Works

### 6.1 Origin

They are **coastal civil-engineering plant**. Each machine's form follows its old job:

| job | machine |
|---|---|
| survey | Plumb, Tiller |
| cut | Shear |
| drive piles | Tamper |
| level | Spindle |
| lift | Davit |
| gate water | Weir |
| fire armour units | Kiln |
| dredge | Dredge |
| sound the seabed | Sounder |
| read wind | Vane |
| build walls | Gantry |

They are not alive and not hostile by nature. They are *working*, and the Datum just redrew the job site around the people.

### 6.2 Design language: **"Glaze & Gimbal"** (rules every generator follows)

1. **The topology comes from tools and plant, never animals.** No heads with jaws, no eyes, no tails as tails: cables, augers and ladders take that role. No fur, no claws; blades are tools. Legs are stilts, columns or tripod legs.
2. **Bodies are vessels.** Glazed ceramic in bottle, drum, kiln, hull and barge shapes, hung in **bronze rings and gimbals**, with graphite joints and verdigris copper cable.
3. **Every machine carries the Line.** One oxblood glaze band circles the hull at 0.62 of its height. Black E-ticks and a stencilled serial number come from the shared decal atlas in wave 4.
4. **Sensors are lamps:** lighthouse lenses with Fresnel rings, lens drums and sounding cones. State is shown by lamp colour *and rhythm* (§6.3).
5. **Glossy, and only them:**
   - glaze roughness **0.18–0.32**; bronze 0.35–0.5, metal 1;
   - the world's median roughness stays at 0.6 or above.
   - On screen, machines are the things that catch light.
6. **Mechanical motion:**
   - tripod, wave and stilt gaits;
   - swinging counterweights and rotating drums;
   - no breathing and no head-bob;
   - idles are *instrument behaviours*: taking readings, levelling, sweeping.
7. **Damage reads as ceramic:**
   - crazing crack decals, chips, and **shatter into sherds** (reusing `rig/fx.js` particles);
   - bronze dents;
   - **no blood-oil and no blue sparks**.
8. **Weak points are what a maintenance engineer would service:** lamps, gimbals, winches, ballast tanks, fireboxes, tethers.
9. **One family:**
   - one 8×1 palette texture;
   - 2 materials: hull and lamp;
   - a shared parts library: legs, hubs, drums, pads, rings, lamps (creature lane §2c).
10. **Knees in the sagittal plane, everywhere.** It is a design rule: then no species needs the lateral-knee change to `gait.js`.

### 6.3 Lamp states (these replace the canon blue / amber / red `EYE_COLORS`)

| state | colour | rhythm | intensity |
|---|---|---|---|
| **calm / working** | Lamp `#F4EBD0` | steady | 1.0 |
| **wary** (suspicious, searching) | Sounding celadon `#8FE0C2` | **occulting at 1 Hz** (0.6 s on, 0.4 s off) | 1.2 |
| **hostile** | Flare `#F0592B` | **flashing at 4 Hz** | 1.6 |
| **retuned** (working for Ebba) | Spark `#DA7756` | slow breathe at 0.25 Hz | 1.0 |
| **stalled** (Galvanic) | — | off for 4 s | 0 |
| **downed / dead** | Lamp | flicker for 1.5 s, then out | → 0 |
| **Shear in haar** | — | **dark** until within 6 m, then hostile strobe | — |

### 6.4 Roster at a glance

Sizes use the creature lane's classes:

| class | length | tris |
|---|---|---|
| small | ≤ 2.5 m | ≤ 15k |
| medium | 2.5–6 m | ≤ 35k |
| large | 6–12 m | ≤ 60k + LOD1 |
| colossal | > 12 m | ≤ 120k + LOD1 |

| # | name | role | size (L × H, m) | locomotion | legs / bones (target) | first wave? |
|---|---|---|---|---|---|---|
| 1 | **Tiller** | herd, core-sampler | medium 4.5 × 2.7 | hexapod, alternating tripod | 6 / 24 (*measured*) | **yes, proven** |
| 2 | **Plumb** | sentry, scout | small 1.6 × 2.4 | tripod (offsets 0, ⅓, ⅔) | 3 / 13 | **yes** |
| 3 | **Shear** | pack predator | small 2.4 × 1.1 | quadruped | 4 / 20 | **yes** |
| 4 | **Tamper** | charger, heavy | medium 5.0 × 2.8 (mast 4.6) | quadruped | 4 / 18 | **yes** |
| 5 | **Spindle** | duelist, skirmisher | medium 1.8 × 3.8 | biped stilts (the Round-4 biped spec) | 2 / 10 | wave 3 |
| 6 | **Davit** | support, repair | medium 4.0 × 3.2 (arms 5.5) | hexapod + 2 arm chains | 6 / 29 | wave 3 (arm extension) |
| 7 | **Weir** | amphibious ambusher | medium 5.5 × 1.3 | octopod, wave gait | 8 / 28 | wave 3 |
| 8 | **Kiln** | artillery | large 6.5 × 4.6 | quadruped, slow | 4 / 18 | wave 3 |
| 9 | **Dredge** | amphibious heavy | large 9.5 × 4.8 | hexapod wader | 6 / 24 | wave 3 |
| 10 | **Sounder** | burrower | large 8.5 × 1.4 | 5 segments + head on 10 legs, wave gait | 10 / 39 | wave 3 (burrow extension) |
| 11 | **Vane** | aerial sentry, harasser | medium (6.0 span) | **tethered flier** | 0 / 9 | wave 4 (flight extension) |
| 12 | **Gantry** | boss | colossal 20 × 18 | octopod in 2 bogies of 4 | 8 / 40 (≤ 64) | wave 4 |

### 6.5 Machine cards

#### 1. Tiller (medium, herd), proven
- **Silhouette:**
  - a long glazed bottle-body slung between bronze rings, bone with oxblood bands;
  - six high-kneed stilt legs;
  - a theodolite drum where a head would be;
  - a rear auger and a sample hopper.
- **Rig:** 6 legs, 24 bones, alternating tripod. 33k tris and 302 KB (*measured*). Authored weights: 0 of 25,445 vertices wrong (*measured*).
- **Components:**

  | component | effect |
  |---|---|
  | sample hopper | tear spills salt and sherds (loot) |
  | auger | tear stops its burrow-escape |
  | lens drum | breaking it blinds the machine |
  | core-sample canister | weak point. Flare then Brine gives a steam Quench burst |

- **Attacks:** rear-leg kick when cornered; auger thrust; a hopper sand-blast that blinds for 1.5 s.
- **Behaviour:**
  - herds of 4–6 sample the strand **in formation lines on one bearing**, probing every 10 m like a survey grid;
  - on alarm they flee line-abreast.
- **Weak to:** Galvanic (the hopper motor) and Craze.

#### 2. Plumb (small, sentry)
- **Silhouette:**
  - a **walking surveyor's tripod**: three tall graphite legs meet at a bronze head plate;
  - a rotating lens drum with a lighthouse lamp on top;
  - a **ceramic plumb-bob hangs on a chain from the centre**, swinging as it walks.
- **Rig:** 3 legs × 3 bones, plus mast, drum and 2 bob links: 13 bones. ≤ 12k tris. Tripod offsets 0 / ⅓ / ⅔ (GaitController takes any leg count). The bob is a 2-bone procedural pendulum in the species class.
- **Components:**

  | component | effect |
  |---|---|
  | lamp drum | weak point: destroyed, it cannot raise an alarm |
  | bob | tear it off and the Plumb loses level: it stumbles every 4–6 steps and moves 30% slower |

- **Attacks:**
  - a **lamp glare** that whites out the screen for 1.2 s within 12 m;
  - a leg-spike stab;
  - a **Sounding ping** that *marks* Ebba for 6 s to every machine within 60 m.
- **Behaviour:** stands still for 8–15 s "readings" with the drum sweeping 120°, then strides to the next survey point. These are the machines that paint the Line.
- **Weak to:** Craze (the lens shatters) and arrows to the lamp.

#### 3. Shear (small, pack predator)
- **Silhouette:**
  - a low, flat hull shaped like a carpenter's plane;
  - the front legs are **long tailor's-shear blades** it walks on tip-down, opening and closing;
  - the rear legs are short and stout.
- **Rig:** 4 legs × 3 bones, plus spine 4 and blade jaws 2 × 2: 20 bones. ≤ 14k tris. Sagittal knees.
- **Components:**

  | component | effect |
  |---|---|
  | shear blades | tear removes the snip; blade loot upgrades the Flenser |
  | belly galvanic cell | weak point |
  | lamp housing | a hit forces it lamp-on in haar |

- **Attacks:** snip lunge; scissor sweep; **pin-and-cut**, where one Shear pins and two flank.
- **Behaviour:**
  - packs of 3;
  - **in haar they go lamp-dark** and circle by sound: an audible blade click is the telegraph;
  - in clear air they hunt by sight.
- **Weak to:** Galvanic (wet in the haar, ×1.5).

#### 4. Tamper (medium, charger)
- **Silhouette:**
  - a squat four-legged chassis;
  - a **tall pile-driver mast** on its back, with a heavy bronze hammer (the "monkey") riding up and down it, visible at 200 m.
- **Rig:** 4 legs × 3 bones, plus spine 4, mast 1 and hammer 1: 18 bones. ≤ 35k tris. The hammer is a procedural prismatic slide on a socket channel, not a gait bone.
- **Components:**

  | component | effect |
  |---|---|
  | **winch cable** | cut it and the hammer drops onto its own chassis: a big damage skill-shot |
  | hammer | tear it off and it can no longer slam. Ebba can **carry it** as a one-use heavy slam (`Walk_Carry_Loop`), the Disc-Launcher pickup role |
  | ballast tanks | weak to Brine |

- **Attacks:**
  - charge-ram;
  - **hammer slam**: an AOE shock ring that you jump;
  - stamp;
  - drives a pile post that becomes new cover.
- **Behaviour:** works the Dyke Front driving a line of piles. It turns territorial when anything crosses its line.

#### 5. Spindle (medium, duelist)
- **Silhouette:**
  - a **gyroscope sphere** (bone glaze, oxblood equator) spinning inside a bronze gimbal;
  - on two very tall stilt legs;
  - a long **levelling-staff lance** held horizontally across it like a tightrope pole.
- **Rig:** 2 legs × 3, plus gyro, gimbal and lance: 10 bones. ≤ 25k tris. It uses the Round-4 biped autorig spec.
- **Components:**

  | component | effect |
  |---|---|
  | gimbal ring | weak point. Break it and the Spindle **topples** (a long downed window) |
  | lance | tearable |

- **Attacks:** horizontal lance sweep; thrust; spin-up dash; a stilt leap.
- **Behaviour:** circles at mid range. Leg hits cause knockdown, and Craze makes the gyro wobble.

#### 6. Davit (medium, support / repair)
- **Silhouette:**
  - a compact six-legged hull;
  - **two long jointed crane arms** folded over its back like a ship's davits, with hooks hanging on cables.
- **Rig:** 6 legs × 3, spine 3, arms 2 × 3, hooks 2: 29 bones. ≤ 35k tris.
- **Needs an autorig extension:** `arms:[]` chains parented to `chest`. They are not gait-driven; two-bone IK carries them to a hook target. About 1 day.
- **Components:**

  | component | effect |
  |---|---|
  | arms | tearable |
  | hooks | |
  | winch drum | weak point; weak to Galvanic |
  | repair lamp | |

- **Attacks:** hook sweep (knockback); lift and drop a plate or boulder.
- **Behaviour:**
  - **re-attaches torn components to other machines** after 6 s unless the part has been looted. It is a priority target;
  - escorts Tampers and rebuilds dyke sections.

#### 7. Weir (medium, amphibious ambusher)
- **Silhouette:**
  - a long low **slab that looks exactly like a section of sea wall** lying in the shallows;
  - eight stubby legs underneath;
  - a hinged **flood-gate plate** along its back that swings up as a shield.
- **Rig:** 8 legs × 3, spine 3, gate 1: 28 bones. ≤ 30k tris. Wave gait.
- **Components:**

  | component | effect |
  |---|---|
  | gate plate | tear removes its shield. The loot builds the **Gate Plank** |
  | twin brine nozzles | |
  | keel lamp | weak point |

- **Attacks:** gate-slam (shield bash); **brine jets** (Crusted build-up); a flood surge (a knockback wave).
- **Behaviour:** idles with its legs folded (root lowered 0.6 m) as a fake wall section across lagoon channels. Sounding reveals it.

#### 8. Kiln (large, artillery)
- **Silhouette:**
  - a bulbous **bottle-kiln** (pottery-kiln shape) on four thick legs;
  - a glowing **firebox door** at the front;
  - a tall flue stack throwing heat shimmer;
  - oxblood crackle glaze over bronze hoops.
- **Rig:** 4 legs × 3, spine 4, flue 1, door 1: 18 bones. ≤ 55k tris plus LOD1.
- **Components:**

  | component | effect |
  |---|---|
  | **firebox** | weak point. **Brine causes Quench**: huge damage and plate shatter |
  | flue stack | tear it and the Kiln overheats: it stalls and takes self-damage |
  | slag mortar | |

- **Attacks:**
  - **slag lob**: molten glass that hardens into **glass caltrops**, a pooled area-denial instanced decal;
  - a short-range flame vent;
  - a heat aura (Flare build-up within 4 m);
  - stomp.
- **Behaviour:** settles into a firing position at range and glows; you must close in. It is immune to Flare.

#### 9. Dredge (large, amphibious heavy)
- **Silhouette:**
  - a long barge hull in celadon glaze on six wading stilts;
  - a **bucket-ladder** (a chain of scoops) that runs from its prow down into the water and up over its back.
- **Rig:** 6 legs × 3, spine 4, ladder pivot 2: 24 bones. ≤ 60k tris plus LOD1. The bucket chain is a looping mesh with UV and instance scroll, not bones.
- **Components:**

  | component | effect |
  |---|---|
  | bucket ladder | tear stops the fling |
  | ballast tanks | weak to Galvanic and Brine |
  | pump housing | weak point |

- **Attacks:** **slurry fling** (an artillery arc of wet sand, knockdown); ladder sweep; suction that pulls her in the water; stomp.
- **Behaviour:** dredges the lagoon channels and the Swatchway.

#### 10. Sounder (large, burrower)
- **Silhouette:**
  - a train of five ceramic **drum segments**, like a chain of benchmarks, on short paired legs;
  - a head segment carrying a spinning **sounding cone** (a transducer).
- **Rig:** 10 legs × 3, spine 5 + tail 3 (within autorig's spine ≤ 5 and tail ≤ 4), cone 1: 39 bones. ≤ 50k tris plus LOD1.
- **Needs an extension: a burrow state.**
  - root y lerps −2.5 m over 1.2 s, with a dust ring;
  - GaitController is paused while submerged;
  - a surface ripple decal tracks it;
  - it emerges with a strike and corpse grounding is re-run.
  - About 1–2 days.
- **Components:**

  | component | effect |
  |---|---|
  | segment lamps | break 3 and it can no longer burrow |
  | sounding cone | tearable |

- **Attacks:**
  - an emerge strike, telegraphed by ring ripples in the sand;
  - body sweep;
  - **sonic pulse**: Ebba becomes *Ringing*, with muffled audio and HUD jitter for 3 s.
- **Behaviour:** lives in the black dunes and follows vibration. Sprinting attracts it; a crouch-walk is safe.

#### 11. Vane (medium, aerial sentry)
- **Silhouette:**
  - a cross-shaped ceramic frame with four **spinning sail-vanes**, like a windmill or anemometer;
  - trailing a long cable to a **ground anchor post** it plants;
  - it flies in circles around its tether.
- **Rig:** hub 1, vanes 4, tether 4: 9 bones. ≤ 15k tris.
- **Needs an extension: a tethered-orbit flight controller.**
  - angle += ω·dt around the anchor, at a set radius and altitude;
  - bank = f(ω); a dive-sweep along a chord;
  - tether cut → ballistic drift → crash → the existing corpse grounding.
  - The tether makes flight a constrained circle, which is far simpler than free flight.
- **Components:**

  | component | effect |
  |---|---|
  | **tether** | an arrow cuts it: it drifts downwind and crashes. Or the Grapnel yanks it down |
  | rotor hub | weak point |
  | anemometer cups | |

- **Attacks:** dive-sweep with the vanes; a **galvanic discharge** down the tether (an arc ring on the ground); a gust (knockback).
- **Behaviour:** 2–3 Vanes watch over the Pans.

#### 12. Gantry (colossal, boss)
- **Silhouette:**
  - a **walking gantry crane**: an open bronze-and-ceramic portal bridge 20 m long and 18 m high;
  - at each end, a bogie of four **solid ceramic-cased column legs**;
  - a trolley runs along the top beam carrying a hanging **grab-bucket**;
  - lamps at the four corners.
- **Rig:** 8 legs × 4, 2 bogie roots, beam 3, trolley 1, grab 2: 40 bones (≤ 64). ≤ 120k tris plus LOD1, in 2–3 skinned meshes. Wave gait in two bogies.
- **Components:**

  | component | effect |
  |---|---|
  | grab-bucket | tear it and it drops, becoming cover |
  | trolley motor | weak to Galvanic |
  | **8 foot bogie pads** | break 2 on one side and it **kneels**, bringing the beam core within reach |
  | beam core | the final weak point |

- **Attacks:** grab-bucket drop (a large AOE); trolley sweep; stomp; carries and drops pile sections. It calls Tampers.
- **Behaviour:** builds the Dyke across the Pans. It is the act-1 boss.
- **Design choices against known failures:**
  - **No lattice at melee height** (M1). Melee targets the bogie pads.
  - The legs are solid casings, so hit hulls are capsules.

### 6.6 Build these four first: **Tiller, Plumb, Shear, Tamper**

- **They cover every first-hour beat** (§7.9):
  - ambient herd and hunting: Tiller;
  - the stealth loop: Plumb;
  - bread-and-butter combat: Shear;
  - the first big fight: Tamper.
- **They cover three gait families**: tripod, quadruped and hexapod, all with sagittal knees. **No `gait.js` or `autorig.js` change is needed.**
- **The Tiller is already proven**, so wave 1 starts with one done.
- **The Plumb is the identity machine.** It paints the Line, and its silhouette (a tripod with a hanging bob) is the roster's one-glance read.

### 6.7 Extensions the roster needs (all in later waves)

| extension | for | estimate | file |
|---|---|---|---|
| `arms:[]` IK chains (not gait-driven) | Davit (and the Gantry trolley grab) | ~1 day | `autorig.js` (ADAPT) |
| burrow / emerge state | Sounder | 1–2 days | species class + `gait.js` pause hook |
| tethered-orbit flight controller | Vane | 1–2 days | species class (new) |
| prismatic socket channel | Tamper hammer, Gantry trolley | ~0.5 day | `rig/sockets.js` (ADAPT) |
| fixes the shared loader should make once | all species | ~0.5 day | `variety-assets.js`, `rig/lod.js` |

The shared-loader fixes come from the creature lane §8.5:
- dequantise on load;
- read interleaved streams with `getX`;
- `quantise:false`, or the new palette in `rig/lod.js PALETTE`;
- the lamp mesh marked `noShadow`;
- the new lamp-state colours.

---

## 7. The map: the Saltings

### 7.1 Size and frame

| | value |
|---|---|
| heightfield | **1,024 × 1,024 m**: `WORLD_SIZE` 720 → 1,024. This changes the frozen terrain API constant, so every lane that reads it must adapt together |
| land | about **0.70 km²** (sea fills the west and south; the lagoon is about 0.04 km²) |
| against today | about **2× the current play disc** (π·330² = 0.34 km²) |
| boundary | the sea to the west and south (a current pushes you back past 60 m out), the Organ cliffs to the north, the Cinder Rise escarpment to the east. It is an SDF polygon instead of `PLAY_RADIUS` |
| terrain mesh | 1.3 × 1,024 = 1,331 m span at 640 segments = **2.08 m nodes** (today 1.94 m), **≈ 410k vertices** (+63% over today's 251k). Measure it before choosing; the fallback is 4×4 culled tiles |
| splat masks | 768² → 1.33 m texels (today 512² gives 1.41 m) |
| far field | haar plus distance fog; the far tier fades by 350–600 m. A 1.8 km skirt **with masks**, which the proof skirt lacked |
| frame | x = east, −z = north (as `MASSIFS` in `terrain.js`). Origin at the centre |
| sea level and tide | 0 m, ±1.2 m semi-diurnal |
| Datum at game start | +3.2 m (painted). The old Datum was −2.0 m |

### 7.2 Map (1 character = 32 m east–west, 1 row = 64 m north–south)

```
            x: -512 ............................. 0 ........................... +512
 z -512   ~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^   N
 z -448   ~~~~::::K::::::..^^^^^^^^^^^^^^^   ^
 z -384   ~~~~~:C::::::::..^^^^^vvvvvvv^^^   |
 z -320   ~~~~..:::::F:::..^^^^^^vBvvvv^^^
 z -256   ~~~.....:::::....^^^^^^^^^^T^^^^
 z -192   ~G~..............,,^^^^^^^^^^^^^
 z -128   ~~~...............,,^^^^^^^^^^^^
 z  -64   ~~~...H........=========,,^^^^^^
 z    0   ~~~....n.......=====O=====,,^^^^
 z  +64   ~~~....n.......===========,,,^^^
 z +128   ~~~....n.ooooooo.==========,,,^^
 z +192   ~~~.....oooSoooRpppp,,,,,,,,,D,,
 z +256   ~~~wwwXwoooooo.pppp,,,,,DDD,,,,,
 z +320   ~~~~~~.......,,,,,,DDDD,,,,G,,,,
 z +384   ~~~~~~~~~~~~~~~~~########W######
 z +448   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

**Terrain:**

| symbol | meaning |
|---|---|
| `~` | sea |
| `.` | black sand / dunes (Black Strand) |
| `:` | basalt (the Organ) |
| `=` | salt pan |
| `o` | lagoon (the Reach) |
| `p` | evaporation ponds |
| `^` | Cinder Rise |
| `v` | crescent-wall vine pits |
| `,` | scrub hinterland |
| `#` | old sea wall |
| `w` | the Swatchway channel |

**Sites:**

| symbol | site | (x, z) |
|---|---|---|
| `R` | Rakewich | (−10, +230); spawn at the jetty (−40, +235) |
| `S` | the Staff | (−130, +170) |
| `O` | Sounding Ring | (+150, +40) |
| `H` | the Hulk | (−300, −40) |
| `n` | the Combs | (−260, +40…+150) |
| `G` | Gauge Stack | (−450, −170) |
| `C` | sea caves | (−320, −330) |
| `K` | Kiln Yard | (−250, −420) |
| `F` | the Flues | (−140, −300) |
| `B` | the Bench | (+280, −310) |
| `T` | dragon-tree grove | (+360, −220) |
| `X` | the causeway | (−300, +270) |
| `D` | the Dyke Front | (+120, +320) → (+420, +200) |
| `G` (row +320) | the Gantry yard | (+380, +300) |
| `W` | Breakwater | (+300, +390) |

### 7.3 Biomes (6)

| biome | extent | elevation | ground layers | scatter (all solid vertex-coloured tufts, no alpha) | lighting signature |
|---|---|---|---|---|---|
| **Black Strand** (dunes and beach) | x −400…−220, z −380…+330 | 0–28 m | black sand; wet sand / tide band | marram, sea-kale, driftwood, shell grit | silver haar, wet specular tide band, a white surf line |
| **the Pans** (salt flat and ponds) | x −20…+300, z −60…+170, plus ponds at Rakewich | +0.4–1.0 m | salt crust; pond mud (512) | glasswort (red and green), salt mounds, wind-pumps | high-key glare. Exposure −0.3 EV, ground bounce `#E9E4D8` |
| **the Reach** (lagoon and village) | ellipse centred (−110, +190), 140 × 90 m | water 0 ± 0.9 m | wet sand; reed litter (512) | reeds, nets, stilts, jetties | mirror calm; rose and indigo at dusk |
| **the Organ** (basalt shelf and sea cliffs) | x −330…−40, z −460…−200 | terraces 6–36 m | basalt scan; lichen | column clusters (the proven hex lattice), boulders, lichen crusts, fumaroles | dark, wet, teal sea light; GTAO-heavy; backlit steam |
| **Cinder Rise** (volcanic upland) | x +80…+480, z −480…−80 | 20–140 m | cinder lapilli; lichen turf | **dragon trees**, crescent stone walls with vines and figs, tamarisk | **above the haar**: hard sun, deep sky `#5C86B5`, a white fog sea below at +22 m |
| **the Works** (old port, sea wall, Dyke Front) | x +100…+480, z +150…+480 | 2–12 m (wall crest +9 m) | concrete (512); wet sand | **tetrapod** armour units (instanced, 1 draw), piles, chain, rubble | overcast steel; the survey-red Line at its brightest; machine lamps |

### 7.4 Landmarks (≤ 40k tris, 2 materials, 1–2 shadow casters each; ≤ 3 in any frame)

| landmark | what | budget |
|---|---|---|
| **the Staff** | a **60 m levelling-staff tower** standing in the lagoon. Black E-pattern on bone, survey-red metre numerals, a lamp gallery at the top, 4 guy cables. Visible from everywhere; the Datum broadcaster | ≤ 30k |
| **Sounding Ring** | the fallen survey gyroscope (*proven*: 22,120 tris, 182 KB) | done |
| **the Hulk** | the bow of a half-buried container ship in the dunes, 70 m, rust under black sand | ≤ 35k (interior later) |
| **the Organ** | the column shelf: 11+ hex-lattice clusters, 1 draw + 3 shadow (*proven* method) | instanced |
| **Gauge Stack** | a sea stack with a toppled tide-gauge hut | ≤ 10k |
| **the Benchmark** | a 30 m **▲-over-bar survey mark** carved into the Cinder Rise. The Levelled shrine | terrain decal + 8k rim |
| **the Flues** | fumarole chimneys 6–14 m (Lake Abbé), venting steam | instanced + particles |
| **the Dyke Front** | a new machine-built wall of tetrapods and piles, crossing the Pans toward Rakewich | instanced |
| **Breakwater sea wall** | the old concrete wall arc with two beached hulls | kit-merged |
| **the Combs** | fog-net frames 4–8 m on the dune ridge | instanced |

### 7.5 Settlements

| settlement | faction | where | NPCs | read |
|---|---|---|---|---|
| **Rakewich** | Panwrights | east shore of the lagoon (−10, +230) | 12 | stilt houses, white salt-plastered reed walls, boardwalks, evaporation ponds, a kiln, wind-pumps. **The Line is painted across every hut at +3.2 m** |
| **Breakwater** | Holdfast | inside the old sea wall (+300, +390) | 14 | concrete, two hulls as longhouses, glaze-shingle roofs, flood-striped shields on the parapet, chain booms |
| **the Bench** | Levelled | the Benchmark terrace (+280, −310) | 7 | a perfect grid of white tents; ranging rods; silence |
| Combs hut | Panwright | (−240, +100) | 2 | a fog-comb keeper and a hunter |
| Hulk camp | Holdfast | (−280, −20) | 3 | salvagers |

### 7.6 Interactable sites

Each uses the kept `interactables.register` and `PLACES` row schema.

| site | count | what it does | replaces |
|---|---|---|---|
| **Fog-comb** | 6 | rest, save and respawn; collect water for salve crafting | campfire |
| **Benchmark** | 10 | Sound it: a lore line, plus the **chart contours** revealed within 150 m on the map | — (no map-reveal towers) |
| **Tide log** | 16 | a collectible paper tape from an old gauge: Works lore and the Datum's history | datapoint |
| **Salt cache** | 8 | a buried crate of salt bars and ammo | supply cache |
| **Retune post** | 4 | an old maintenance post. Match its lamp pitch with the Tine (a 3-step pitch puzzle) to **learn Retune** for one machine family | override node |
| **Reckoning** | 3 (Strand, Organ, Pans) | a timed hunting trial with a tally board | hunting grounds |
| **Kiln** | 3 (Rakewich, Breakwater, the Bench) | craft and upgrade weapons and glaze armour from machine sherds | workbench |
| **Tide gate** | 3 | open or close a sluice to drain or flood a channel (a traversal puzzle) | — |
| **Wreck salvage** | 1 (the Hulk) | a loot interior | — |

### 7.7 Traversal and world systems

- **The tide** (`water.levelAt` returns base plus `tide(t)`):
  - two tides a game day, ±1.2 m;
  - the **Swatchway causeway** is dry for about 40% of each cycle;
  - wading slows above 0.8 m, and swimming (`Swim_*` clips) starts at 1.3 m;
  - the wet-sand band and the surf line follow a `uTide` uniform;
  - a tide needle on the HUD clock.
- **Basalt column steps:** the Organ's columns stand in 1 m steps, which is exactly UAL2's `ClimbUp_1m`. It is natural, readable climbing with an existing clip.
- **Dune slides:** black dunes over 28° trigger `Slide_Start` / `Slide_Loop` / `Slide_Exit` (UAL2).
- **Stilt boardwalks and rope bridges** in Rakewich. Sea caves are open at low tide only.
- **The haar as stealth:**
  - inside the fog, machine sight range is ×0.5 and Shears go lamp-dark;
  - Sounding cuts through the fog, so the scanner matters most where you can't see.
- **The Datum Line**, the signature effect:
  - one shared shader chunk (chained like `csmSetupMaterial`) on terrain, rocks and prop kits;
  - paints a **survey-red `#C2362F` band 0.25 m tall at y = `uDatum`**, broken by spray-paint noise;
  - one extra noise read per pixel (reuse the macro noise);
  - the story raises `uDatum`: +3.2 m at the start, +9 m in act 2;
  - machines don't receive it: they carry their own band.
- **Cover:** stands of glasswort and marram (the tall-grass equivalent, through the kept `tallGrassDensity`), the haar, and the crescent walls on the Rise.

### 7.8 Ground layers and scatter plan

**Ground layers** (≤ 6 at 1024², plus ≤ 4 at 512²; 2 RGBA WebP each, the proven `_a` / `_n` packing):

| # | layer | source | resolution | status |
|---|---|---|---|---|
| 1 | black sand ripples | procedural | 1024 | proven, 1.14 MB |
| 2 | salt crust polygons | procedural | 1024 | proven, 1.12 MB |
| 3 | basalt rock | Poly Haven `rock_face` (CC0) scan | 1024 | proven, 1.31 MB |
| 4 | wet sand / tidal mud | procedural | 1024 | new |
| 5 | cinder lapilli | procedural (a regular granular pattern suits it) | 1024 | new |
| 6 | lichen turf | CC0 scan (Poly Haven or ambientCG; record it in `MANIFEST.json`) | 1024 | new |
| 7–10 | pond mud, shell grit, concrete (CC0 scan), reed litter | mixed | 512 | new |

**Fixes owed from the proof:**
- anti-tile resampling past 10 m: the sand repeat;
- masks on the skirt;
- normals under non-uniform instance scale: the column streaks.

**Scatter:**
- ≤ 8 kinds visible;
- ≤ 200 tris per rock instance and ≤ 100 per plant;
- rocks cast shadows, plants don't.

**Dragon trees** are the one hero plant:
- procedural, a forking trunk with an umbrella crown of dense spiky tufts;
- 1.2k tris at LOD0, an impostor beyond 80 m;
- grove-clustered on the Rise only.

### 7.9 The first hour

| time | where (x, z) | beat | systems taught | machines |
|---|---|---|---|---|
| 0:00–0:08 | **Rakewich** at low water, 07:00 haar (−40, +235) | Ebba wakes to the **Line painted across her hut** at +3.2 m. She rakes the ponds with her neighbours. Her mother's bob. She strikes the Tine on a broken Plumb lying in the ponds and *hears* it | movement, interact, **Sounding**, the Line | a dead Plumb |
| 0:08–0:18 | **the Pans** (+60, +150) | a Tiller herd sampling in survey lines. The hunt: hopper components, sherds. First Censer pot crafted at the Rakewich kiln | **bow** (Fieldbow), components, crafting, salt bars | Tiller ×5 |
| 0:18–0:28 | **Sounding Ring** (+150, +40) | Plumbs patrol the Ring, **painting the Line** onto the Ring's footing. A tide log at the Ring tells of the Datum | **stealth** in glasswort and haar, **Flense** with the Flenser, flagging | Plumb ×3 |
| 0:28–0:38 | **the Swatchway** (−300, +270) to the **Black Strand** | the causeway floods on its cycle: time the crossing. A dune slide. The haar thickens: **a lamp-dark Shear pack**, heard by its clicks | **tide timing**, slide, **melee** (Ranging Pole, Flenser), Sounding in fog | Shear ×3 |
| 0:38–0:48 | **the Organ** (−150, −250) | climb the basalt columns (1 m steps) past the Flues. From the top: the **Dyke Front** crossing the Pans toward Rakewich, Tampers driving piles, the **Gantry** on the horizon, and the Line catching the sun | climbing (`ClimbUp_1m`), vista, Benchmark | distant Tamper and Gantry |
| 0:48–0:60 | **the Dyke Front** (+200, +290) | Holdfast salvagers pinned by a **Tamper**. Cut its winch cable; tie it down with the **Sounding Line**. Escort the salvagers to **Breakwater** at 17:30 copper light. The hook: "someone climbed the Staff" | **Sounding Line** (tie-down), the cable skill-shot, first big fight | Tamper ×1, Plumb ×2 |

---

## 8. Art direction

### 8.1 Palette swatches

**World:**

| name | hex | use |
|---|---|---|
| Ink Sand | `#17181B` | dry black sand |
| Wet Sand | `#0E0F11` | the tide band (roughness 0.3) |
| Basalt | `#2B2D31` | columns, cliffs |
| Basalt Wet | `#1C2226` | spray zone |
| Haar | `#C9CDCF` | fog |
| Salt | `#F1EEE6` | pans, plaster |
| Salt Shadow | `#C8C2B4` | |
| Brine Rose | `#D9898A` | ponds |
| Brine Rust | `#B5583A` | ponds |
| Pond Jade | `#6E9C8B` | ponds |
| Lagoon | `#3E6E73` | |
| Sea | `#1F3A3A` | |
| Surf | `#E9EEEC` | |
| Cinder | `#3A2C28` | lapilli |
| Marram | `#A69A5B` | |
| Glasswort Red | `#8E3B3B` | |
| Sea-kale | `#7D9C95` | |
| Lichen Gold | `#B9B26A` | |
| Lichen Orange | `#C9773B` | |
| Vine Green | `#5E7F3A` | |
| Dragon-tree crown | `#4F6B4A` | |
| Concrete | `#8A867E` | |

**Machines:**

| name | hex |
|---|---|
| Glaze Bone | `#E8E1D0` |
| Glaze Celadon | `#9DBFA8` |
| Glaze Oxblood | `#6E1F22` |
| Bronze | `#9A6B3A` |
| Verdigris | `#4E8C7E` |
| Graphite | `#2E3033` |
| Lamp | `#F4EBD0` |

**People:**

| name | hex |
|---|---|
| Indigo | `#2C3557` |
| Indigo Faded | `#4F5F86` |
| Slate | `#3A3F4A` |
| Oilskin | `#4A4436` |
| Reed | `#C2A66B` |
| Bleach | `#EDE8DC` |
| Holdfast Black | `#1E1C1D` |

**Brand and UI:**

| name | hex | use |
|---|---|---|
| Spark | `#DA7756` | the Claude mark, weak points, retuned machines |
| Survey Red | `#C2362F` | the Line: world paint, logo rule, UI rules |
| UI Ink | `#111317` | scrim at 0.72 alpha |
| Sounding | `#8FE0C2` | scanner |
| Flare | `#F0592B` | hostile, fire |
| Brine | `#BFE3E6` | |
| Galvanic | `#7FA7FF` | |
| Craze | `#E6D49A` | |
| Salve | `#9DBFA8` | |

**Saturation rule.** Everything except lamps, the Line, the spark and the salt ponds stays at **OKLCH chroma ≤ 0.12**. The world is quiet so that the machines and the Line shout.

### 8.2 Material rules: stylised-real

The look is **stylised-real**:
- real PBR values with simplified forms;
- detail in silhouettes and large shapes, not micro-noise;
- no outlines and no toon ramps;
- **no `KHR_materials_transmission`**: Round 3 measured it costing about 160 draws.

| surface | albedo (sRGB) | roughness | metal | rule |
|---|---|---|---|---|
| machine glaze | Bone, Celadon, Oxblood | **0.18–0.32** | 0 | the only glossy surfaces. Crazing decals raise roughness locally to 0.5 |
| machine bronze | `#9A6B3A` | 0.35–0.50 | 1 | verdigris in cavities (roughness 0.7, metal 0) |
| graphite joints | `#2E3033` | 0.55–0.65 | 0.6 | |
| lamp lens | emissive | 0.05 | 0 | flat emissive; bloom halo ≤ 1.5× the lamp's size |
| black sand | `#17181B`–`#24252A` | 0.85–0.95 | 0 | |
| wet sand | `#0E0F11` | 0.25–0.40 | 0 | driven by `uTide` |
| salt crust | `#E6E1D6`–`#F1EEE6` | 0.70–0.90 | 0 | linear albedo ≤ 0.85, so it doesn't blow out at noon |
| basalt | `#2B2D31` | 0.60–0.80 (wet 0.25–0.35) | 0 | scan |
| cinder | `#3A2C28` | 0.90 | 0 | |
| lagoon / sea | `#3E6E73` / `#1F3A3A` | 0.04–0.10 | — | |
| linen | indigo / bleach | 0.85–0.95 | 0 | |
| oilskin | `#4A4436` | 0.45–0.60 | 0 | the only semi-glossy cloth |
| skin | UBC base | 0.45–0.60 | 0 | |
| reed / rope | `#C2A66B` | 0.85 | 0 | |
| concrete | `#8A867E` | 0.80 | 0 | salt-stain tide lines in the albedo |

### 8.3 Lighting moods per biome

| biome | key light | fog | ambient / bounce | grade | signature frame |
|---|---|---|---|---|---|
| Black Strand | low sun, 6–12°, `#F3D9B0` | haar, top +22 m | cool `#8C97A3` | lift the shadows toward `#5C6670` | a Plumb lamp through fog over wet black sand |
| the Pans | high sun `#FFF6E8` | none at noon | ground bounce `#E9E4D8` (salt) | −0.3 EV, crisp | a Tiller line crossing white salt toward the Ring |
| the Reach | rose sun at 1° | thin | the sky mirror | rose to indigo | Rakewich stilts doubled in the lagoon, the Staff behind |
| the Organ | side light through spray | wisps, backlit steam | teal sea bounce `#3E6E73` | high local contrast (GTAO) | Ebba on a column top, the Flues steaming |
| Cinder Rise | hard sun above the inversion | **a fog sea below** | sky blue `#5C86B5` | saturated, clear | dragon trees against a white fog sea |
| the Works | overcast steel | industrial haze | flat grey | desaturated except the Line and the lamps | the Gantry over the Dyke, the Line glowing red |

### 8.4 Sky, fog and water

- **Sky:**
  - a pale gradient dome per the §1.6 keyframes, with high cirrus;
  - a **permanent grey haar bank on the western sea horizon** (one band in the sky shader);
  - a **fogbow**: a white arc 42° opposite the sun, alpha 0.25, only when the weather is `haar` and the sun is below 15°;
  - a pale moon by day; stars at night;
  - **no god-ray spokes** (that was the Round-3 HZD sky).
- **Fog:**
  - the kept aerial and distance fog, plus a **height-fog term** with a `haarTop` uniform (+22 m in the morning, burning off to 0 by 11:00): exponential falloff above `haarTop`;
  - the cost is ALU only, a few instructions per pixel.
- **Water:**

  | body | look | draw |
  |---|---|---|
  | sea | bottle-green `#1F3A3A`; white foam lines by depth along the shore; Fresnel; roughness 0.08 | 1 |
  | lagoon | a near-mirror `#3E6E73`, roughness 0.04 | 1 |
  | salt ponds | flat tinted planes (rose, rust, jade), no reflection, roughness 0.3 | 1 instanced draw for all |

  The tide moves all water by ±1.2 m.

### 8.5 Foliage

Sparse and coastal. **Solid vertex-coloured tufts with no alpha overdraw**, the method proven in the biome patch: marram 96 tris, glasswort 36 tris.

| plant | count / density | where |
|---|---|---|
| marram | | dunes |
| glasswort (red on the pans, green on the lagoon edge) | | pans, lagoon edge |
| sea-kale (glaucous rosettes) | | |
| tamarisk shrubs (feathery, pink `#C9A3A8` in bloom) | | |
| vines and figs in crescent-wall pits | | the Rise |
| lichen crusts (decal-like scatter) | | basalt |
| **dragon trees** | ≤ 60 world-wide | the Rise only |

No conifers, no broadleaf forest and no tall red grass. The vegetation draw budget drops from the old valley's measured 76 to **≤ 40**.

### 8.6 VFX language

| effect | look |
|---|---|
| machine damage | **ceramic sherds** (white, celadon, oxblood chips) plus a dust puff. No sparks |
| Flare | orange embers and heat shimmer |
| Brine | white crystal bloom and crust decals |
| Galvanic | thin pale-blue arcs that crawl along the bronze |
| Craze | a hairline crack network spreading over the glaze, then a ring of sherds |
| Sounding | expanding celadon contour rings |
| the Line | spray-paint drips at its lower edge |

Everything goes through the kept pooled systems (`combat/particles.js`, `rig/fx.js`): no new allocation paths.

### 8.7 UI language: "survey and chart"

The UI replaces the HZD smoked-glass, cut-corner, triangle-bullet language.

| element | Saltline treatment |
|---|---|
| panels | UI Ink scrim inside a **chart neatline**: a double hairline frame with graduated ticks along two edges, like a map border. Square corners, no brackets |
| notifications | a **cartouche**: a rounded label with a double rule, centre top |
| health | a **levelling staff**: a vertical-feel horizontal bar of black E-marks on salt white (a CSS `repeating-linear-gradient`). Damage removes from the right; a small spark-coloured cursor marks the current level |
| salve | a thin celadon line under the staff |
| compass | a **bearing tape** in degrees (Plex Mono every 15°, Bodoni cardinal letters), with quest and flag markers |
| Slack Water (slow-mo aim) | a **tide-gauge needle** beside the reticle that drains |
| stealth | a **lamp glyph** that brightens as machines notice you, echoing §6.3 |
| awareness over machines | a small lamp icon in the machine's own state colour and rhythm |
| damage numbers | IBM Plex Mono: salt for normal, spark for weak point, Craze gold for shatter |
| icons | **engraved chart symbols**: single-weight 1.5 px strokes. No cave-painting glyphs |
| map screen | an **Admiralty-style chart** baked from the heightfield by the kept `ui/map.js`: land in salt and sepia, contours every 5 m, water with depth soundings, **the Datum line in survey red**, place names in Bodoni italic (the hydrographic convention) |
| scanner | §4.4: contour isolines, benchmark glyphs, chain-dot routes |

**Tokens.** `--hzc-*` becomes `--sln-*`:

| token | value |
|---|---|
| `ink` | `#111317` |
| `scrim` | rgba(17,19,23,.72) |
| `salt` | `#F1EEE6` |
| `fog` | `#C9CDCF` |
| `line` | `#C2362F` |
| `spark` | `#DA7756` |
| `sound` | `#8FE0C2` |
| `hostile` | `#F0592B` |
| `salve` | `#9DBFA8` |

### 8.8 Logo and typography

**Typography (all SIL OFL):**

| role | font |
|---|---|
| display, wordmark and place names | **Bodoni Moda**, the engraved-chart Didone |
| HUD and menus | **IBM Plex Sans Condensed** 500 / 600 |
| numerals, scales, tide logs | **IBM Plex Mono** 500 |

- They replace Michroma, Orbitron, Rajdhani, Chakra Petch and Julius Sans One, which `docs/research/ui.md` chose *because* they read as HZD.
- Ship woff2 subsets, about 0.4 MB total against 1.4 MB today, with each `OFL.txt`.

**Logo construction:**

```
        S A L T   ─────✳─────   L I N E
                    ‾‾‾‾‾‾‾      (reflection dashes under the rule)
                 A  C L A U D E  G A M E
```

1. **Words:** "SALT" and "LINE" in Bodoni Moda 500 caps, tracking 0.32em, Salt `#F1EEE6` on Ink.
2. **The rule:** a 1 px **survey-red** hairline runs the lockup width plus 12%, with a short vertical tick at each end (the ends of a levelling staff).
3. **The spark:** the Round-3 Claude spark is unchanged (10 rays of alternating length, stroke 8.5/100, round caps, `#DA7756`). It sits **centred on the rule** in a 1.6em gap between the words: a *lamp on the waterline*, not a dawn. Rays below the rule are clipped.
4. **The reflection:** under the rule, three horizontal dashes centred beneath the spark: widths 60%, 38% and 18% of its diameter, 2 px tall, 4 px apart, `#DA7756` at 45%, 30% and 18% opacity.
5. **The kicker:** "A CLAUDE GAME" in IBM Plex Mono 500, 0.28× cap height, tracking 0.42em, Haar `#C9CDCF`.
6. **Loading screen:** the rule draws left to right as the progress bar, filling like a levelling staff. The spark "lights" at 100%. The copy reads "Taking soundings…" instead of "Waking the machines…".
7. **Favicon:** the spark on a short rule with two reflection dashes.

---

## 9. Distinctiveness

### 9.1 Element by element

| element | Horizon (HZD / TFW / HFW / Burning Shores) | Saltline |
|---|---|---|
| title / logo | "HORIZON ZERO DAWN": thin wide caps, sunrise motif | **SALTLINE**: Didone caps, a survey rule with the Claude spark as a **lamp on the waterline** and a broken reflection. No dawn |
| hero hair | red mane of many braids | black, shaved sides, **one braid with a bronze plumb-bob** |
| hero face | bare, freckled; a Focus on the temple | **white salt band across the eyes**, ruled red; nothing on the temple; grey-green eyes |
| hero outfit | Nora leathers, fur, beads, earth tones | indigo linen, waxed oilskin, **one glossy ceramic pauldron**. No fur, feathers or beads |
| carry | back quiver; spear on the back | **hip quiver**; a **banded survey pole**; the asymmetric Staffbow |
| scanner | the Focus: a violet holographic triangle UI, purple pulse | the **Tine**, a tuning fork. **Contour isolines** in celadon, benchmark glyphs, chain-dot routes; weak points in spark terracotta |
| machine form | animals and dinosaurs: horse, croc, raptor, T-rex, giraffe, bird | **survey instruments and coastal plant**: tripod, gyroscope, kiln, dredger, gantry. No heads, jaws or tails |
| machine materials | white-grey plates over black "muscle", blue glow | **glossy glazed ceramic** (bone, celadon, oxblood) on bronze gimbals; graphite joints; verdigris cables |
| machine state | single-lens eye: blue / yellow / red | **lighthouse lamps**: steady white, occulting celadon, strobing flare; the rhythm carries the state |
| machine names | body-part compounds (Sawtooth, Thunderjaw, Snapmaw, Tideripper) | **one plain trade noun** (Plumb, Tamper, Dredge, Gantry) |
| origin myth | GAIA's terraforming system and Cauldrons rebuilding a biosphere after the Faro swarm | a **sea-defence fleet obeying a broadcast number** (the Datum) from a tide-gauge tower. The threat is **the line moving** |
| world-scale signature | Tallnecks; red-gold grass; mountain vistas | **the Datum Line painted across the land**; a fog sea you climb above; a 60 m levelling staff |
| setting | American West: Colorado, Utah, Nevada, California forests, canyons, ruined US cities | a **cold volcanic fog coast**: black sand, salt pans, basalt organ-pipes, lagoon (Iceland, Namibia, Atacama, Lanzarote, Guérande) |
| light | warm golden hour, saturated blue skies | **silver haar mornings**, high-key salt noon, copper on black sand, a fogbow |
| vegetation | dense forest, tall red grass | sparse marram, glasswort, sea-kale, dragon trees, vine pits |
| peoples | Nora, Carja, Oseram, Banuk, Tenakth, Utaru, Quen | **Panwrights** (salt and fog), **Holdfast** ("wear their floods"), **Levelled** (cult of the Line) |
| climbable colossi and map reveal | Tallnecks reveal the map | **none**. The Staff is static; Benchmarks reveal 150 m of chart contours |
| taming | Override: mount and ally | **Retune**: plant a flag, and the machine *works* there (ploughs a barricade, rebuilds a ramp). No riding |
| slow-mo aim | Concentration | **Slack Water**, with a tide-needle gauge |
| elements | fire, freeze, shock, corruption, acid, plasma, purgewater, adhesive | **Flare, Brine, Galvanic, Craze**, with ceramic-physics combos (**Quench**) |
| arsenal | Hunter / Sharpshot / War Bow, Blast Sling, Ropecaster, Tripcaster, Shredder, Spike Thrower | Fieldbow / Staffbow / Hornbow, **Censer**, **Sounding Line**, **Flenser and Plank (a shield; Aloy has none)** |
| melee verbs | spear combos, Resonator Blast | pole beats, plus **sword-and-board clips** (block, bash, parry), **Gaff rip**, **Flense** |
| currency | Metal Shards | **salt bars** |
| health UI | red 4-segment bar, green pouch | a **levelling staff** (E-pattern), celadon salve line |
| HUD frames / type | smoked glass, cut corners, triangles; HZD-like wide sci-fi caps | **chart neatlines, cartouches**; Bodoni, Plex Sans Condensed, Plex Mono |
| map screen | stylised world map | an **Admiralty chart** with soundings, contours and the red Datum line |
| site types | Hunting Grounds, Cauldrons, datapoints, Tallnecks | **Reckonings, Kiln Yards, tide logs, Benchmarks, fog-combs, Retune posts, tide gates** |

### 9.2 Name check

**Method:**
1. Every proposed name was grep-checked (word-anchored, case-insensitive) against the repo's eight Horizon canon docs: `roster-v2`, `casting-v3/v4`, `machines`, `mechanics`, `ui`, `spear-canon`, `reference-v3`.
2. Every name was checked against the inventory's Appendix A HZD regex list.
3. Every name was compared with Horizon's machine, character, place and weapon lists across HZD, TFW, HFW and Burning Shores. The HFW machine list was re-read on the web on Oct 15 2026.
4. The title candidates were web-searched.

The script is `scratchpad/r5/dirc/namecheck2.py`.

| group | names | canon-doc hits | Appendix-A regex | verdict |
|---|---|---|---|---|
| title, region | Saltline, the Saltings, Fogcoast | 0 | none | clean. **Tidemark** was dropped: an existing itch.io game, and it shares "Tide" with HFW's Tideripper. **Datum** was dropped as a title: an existing itch.io game |
| people | Ebba, Neap, Panwrights, Holdfast, the Levelled, Rakewich, Breakwater, the Bench | 0 | none | clean |
| myth | Littoral Works, Datum, the Drowning, the Staff, the Line | 0 (the Line: 1 generic use, "arms the line" about tripwires) | none | clean |
| machines | Tiller, Plumb, Shear, Tamper, Spindle, Davit, Weir, Kiln, Dredge, Sounder, Vane, Gantry, Monkey | 0 (Shear: 1 generic verb, "shear off") | none | clean. **Notes:** HFW's Plowhorn is a planting machine, while the Tiller is a beach core-sampler named for a boat's tiller. "Sounder" is also a word for a group of wild boar (HFW has a boar-like Bristleback); it is accepted, since the meaning used is the echo sounder |
| mechanics | Tine, Sounding, Flag, Slack Water, Flense, Stake, Retune, Reckoning, Tide log, Benchmark, Fog-comb, Salt cache, Tide gate, Kiln Yard, Quench, Crusted, Stalled, Crazed | 0 (Flag 1, Stake 1: generic) | none | clean |
| items | salt bars, salve, **sherds**, drift-ash, tarred line, lamp oil, copper cell, lamp lens, gimbal ring | 0 | none | clean. **"Glaze shards" was renamed to "sherds"** because `\bshards?\b` is an HZD-term regex (Metal Shards) and would trip `A-ID-no-horizon-terms` |
| weapons | Fieldbow, Staffbow, Hornbow, Ranging Pole, Rod, Gaff, Glasspoint, Flenser, Cleaver, Plank, Reed Plank, Gate Plank, Glaze Buckler, Sounding Line, Lead, Grapnel, Chain-lead, Censer | 0 (Lead 4: generic, "lead foot", "lead-up") | none | clean. **"Sling" was renamed to "Censer"**: Sling and Blast Sling are HZD weapons (8 hits in `mechanics.md`) |
| elements | Flare, Brine, Galvanic, Craze | 0 (Flare 1: a flier's "flare" phase) | none | clean. "Resonance" and "Resonator" were avoided (HFW's Resonator Blast) |
| armour | Raker, Fogcatcher, Brinewalker, Chainman, Staffman, Linesman, Bone / Celadon / Oxblood Glaze, Novice, Linewalker, Datum-sworn | 0 | none | clean. "Chain" is a generic word shared with HFW's Chainscrape, a place |
| skill trees | Ebb, Flood, Slack | 0 | none | clean |
| places | Black Strand, the Pans, the Organ, the Reach, Cinder Rise, the Works, Swatchway, Gauge Stack, the Hulk, the Combs, the Flues, Sounding Ring, Dyke Front | 0 | none | clean. "The Cut" was avoided (an HZD region) |

### 9.3 Overlaps accepted as genre

The genre itself is shared:
- a hunter with a bow and spear;
- machine-creatures with tearable components;
- tie-down, area bombs, slow-mo aim and stealth kills;
- tall-grass stealth, a weapon wheel, crafting.

The brief keeps the genre. Saltline differs in *look, fiction, names and verbs*:
- the shield;
- the pendulum cast;
- tide timing;
- Retune as work rather than riding;
- ceramic-physics elements.

---

## 10. Production

### 10.1 Per-asset budgets

| asset | LOD0 tris | LOD1 | main draws | shadow casters | materials / textures | file |
|---|---|---|---|---|---|---|
| **Ebba**, total | **≤ 40k** | casters only | **≤ 5** (skin + eyes, hair, outfit, stowed gear, held weapon) | 2 LOD1 proxies × 3 cascades = 6 | skin 1024² ×3; hair 512² ×2; outfit set 1024² ×3; gear 512² ×2 | body / hair ≤ 0.7 MB |
| └ skin + eyes / hair | ≤ 4k / ≤ 4k | | 1 / 1 | | | |
| └ outfit variant (merged) | ≤ 17.5k | | 1 | | 1 atlas per set | ≤ 0.8 MB per set + ≤ 0.15 MB per variant pack |
| └ gear (stowed merged + held) | ≤ 5k (bow ≤ 3k, pole ≤ 1.5k, Flenser ≤ 1k, Plank ≤ 1.5k, Line ≤ 1.1k, Censer ≤ 1.2k) | | 1 + 1 | | weapon atlas 512² | ≤ 0.15 MB per weapon GLB |
| armour piece | ≤ 3k | | (merged) | | set atlas | — |
| NPC | ≤ 12k | ≤ 4k beyond 25 m | ≤ 2 | nearest 4 only, 1 each | 1 atlas per body type, 1024² (base + packed normal / ORM) | body ≤ 0.4 MB |
| machine, small / medium / large / colossal | ≤ 15k / 35k / 60k / 120k | large and up | ≤ 6 measured-equivalent (Tiller: 3 main + 1 caster × 3) | 1 (colossal ≤ 2) | hull + lamp; shared 8×1 palette; decal atlas (wave 4) | ≤ 0.2 / 0.4 / 0.7 / 1.2 MB |
| landmark | ≤ 40k | optional | ≤ 3 | 1–2 | 2, palette | ≤ 0.3 MB |
| ground layer | — | — | — | — | 2 × RGBA WebP; ≤ 6 at 1024² + ≤ 4 at 512² | ≈ 1.1–1.4 / 0.3 MB |
| scatter kind | ≤ 200 (rock) / ≤ 100 (plant) per instance | — | 1 | rocks only | shared | — |

### 10.2 Frame ledgers (planned, against the ≤ 350 draw bar)

Measured today for reference: the staged fight is **343** (Aloy plus gear = 37), and the spawn vista **319**.

| owner | **Dyke Front fight** (8 machines; the worst gameplay frame) | **Rakewich at dusk** (10 NPCs) | **Gantry fight** |
|---|---|---|---|
| post chain (measured, fixed) | 22 | 22 | 22 |
| terrain, skirt, sky, water | 12 | 12 | 12 |
| ground scatter | 32 | 24 | 32 |
| vegetation | 40 | 20 | 30 |
| landmarks and places (≤ 3) | 45 | 45 | 45 |
| machines | 48 (8 × 6) | 12 (2 distant Tillers) | 40 (Gantry 10, 3 Tampers 18, 2 Davits 12) |
| Ebba + gear | 11 | 11 | 11 |
| NPCs | 10 (2 salvagers) | 32 (10 × 2 + 4 casters × 3) | 0 |
| VFX, UI, pooled | 25 | 20 | 30 |
| **total** | **245** (105 headroom) | **198** | **222** |
| triangles (bar 6.5 M) | ≈ 3.2 M (planned) | ≈ 2.6 M | ≈ 3.0 M |

**GPU.** The post chain is about 13.5 ms empty at DPR 1.5 (*measured*). That is an engine decision (MSAA → SMAA, GTAO at quarter resolution, or a 1.25 DPR cap) and not part of this direction.

This direction does not depend on full-resolution GTAO. Fog-limited sightlines, sparse vegetation, flat ponds and 2-material machines are deliberate GPU savings.

### 10.3 Download and VRAM

**Download** (`public/`, bar ~60 MB; planned):

| bucket | MB |
|---|---|
| audio, regenerated | 2.8 |
| fonts, swapped | 0.4 |
| UAL v1 (kept) | 3.9 |
| UAL2, trimmed to the ~22 clips used | ~3.5 |
| Ebba | 0.7 |
| 12 armour variants | ~4.4 |
| 6 weapons (15 variants as data) | ~1.2 |
| NPCs | ~3.0 |
| 12 machines | ~4.4 |
| 10 landmarks | ~1.8 |
| ground layers | ~8.4 |
| props and scatter kits | ~2.5 |
| UI art | 0.3 |
| **total** | **≈ 37 MB** (≈ 23 MB headroom) |

The IP and NC assets and the 12 MB of animation duplicates are deleted first (inventory §0.2).

**VRAM** (an uncompressed estimate: 1024² RGBA8 with mips is 5.6 MB, 512² is 1.4 MB):

| bucket | MB |
|---|---|
| ground | ≈ 78 |
| masks | ≈ 7 |
| Ebba | ≈ 40 |
| NPCs | ≈ 22 |
| machine decal atlas | ≈ 11 |
| prop trim | ≈ 11 |
| UI | ≈ 4 |
| **total** | **≈ 175 MB** |

This is the number to watch, given Kevin's two memory crashes. Mitigations, in order:
1. outfit normals at 512²;
2. ≤ 5 ground layers at 1024²;
3. measure a KTX2 / Basis encoder (`toktx` or WASM) for 4–8× savings before adopting it.

**A90 must stay green at every wave.**

### 10.4 The three riskiest assets, and how to de-risk them

| risk | why it is risky | de-risk (in wave 0 or the asset's own wave), with measurable exits |
|---|---|---|
| **1. Ebba herself** (identity, the face, the draw) | (a) The UBC face is a public CC0 base other games use. (b) The bow draw fails A35 on this body today: bow arm 141°, elbow 9 cm low (*measured*). (c) A weighted braid near the draw hand is the exact Round-4 failure (the braid through the glove) | **Day 1–2 spike on the POC build:** (1) the `sharp` face composite plus iris tint plus braid bob, filmed front / 3q / side at 1.6 m and 8 m. **Exit:** V-ID-silhouette and V-ID-face judged against this doc. (2) Re-derive the ~12 bow constants with the Lmax solve. **Exit:** A35, A32 and A16 PASS on her. (3) The spring collider. **Exit:** bob-to-hand ≥ 0.06 m at full draw at 3 camera pitches. **Fallback:** only if V-ID-face fails, install Blender (`brew install --cask blender`: 346 MB DMG, about 1.2 GB installed, against about 7 GB free) for one sculpt pass. The justification is that measured failure |
| **2. Gantry** (colossal boss) | 20 m and 8 legs in 2 bogies, ≤ 64 bones, 2–3 skinned meshes plus LOD1. Cadence band (A48) at this scale, foot continuity (A45c) on bogies, melee reach against a large structure (M1, M3), shadow cost | **A grey-box generator at 30k tris first**, through the full kept seam (registerKind → autorig → GaitController → fold → sockets). **Exit:** A45c, A46, A48, A21 and A103 PASS with the grey box, **before** any detailing. Design-level: solid column legs, melee targets on the bogie pads, a lattice only above 6 m |
| **3. Vane** (flier) | GaitController does not cover flight (*creature lane*: unproven); the Round-3 flier was clip-driven | **The tether constrains it**: orbit, bank, dive-chord and crash are a small kinematic controller with no free-flight pathing. Build it after the four walkers. **Exit:** 10 min of orbit with 0 console errors, tether-cut → crash → corpse grounded (A47), A90 flat across 5 spawn / kill rounds. **If it slips, ship 11 machines** and keep Vane for a later wave; no first-hour beat depends on it |

**Also watch** (not assets):
- the Datum-line and haar shader cost. Measure the GPU delta on the biome POC in wave 0;
- the `WORLD_SIZE` change, which touches every lane that reads the terrain API. Land it together.

### 10.5 Build order

| wave | contents | exit gates |
|---|---|---|
| **0: identity spikes** (≈ 2 days, parallel) | (a) **Orchestrator:** delete the IP and NC assets, the anim duplicates and user-facing HZD strings (inventory §0.2). (b) The Ebba look spike (§10.4 #1). (c) Bow constants re-derived on her. (d) The **Datum line + haar height fog** on the `?poc=biome` patch, with the GPU delta measured. (e) Logo, `--sln-*` tokens, font swap | A1, A9, A90; A35, A32, A16 on Ebba; V-ID-silhouette; A-ID-datum-line; Kevin sees the identity frames |
| **1: first-hour ground** | Region heightfield and masks (Strand, Pans, Reach) at `WORLD_SIZE` 1024; the 6 ground layers; Rakewich grey-box with 6 NPC archetypes (atlas plus LOD); **Tiller** promoted, **Plumb**; the Tine and Sounding UI; pole stow and melee tables re-measured; Raker set | A1, A9, A21, A90; A44–A48 per species; A-npc-variety (≥ 6 at this wave); A-ID-lamp-states |
| **2: combat** | **Shear, Tamper**; Flenser + Plank (UAL2 clips); the Sounding Line and Censer (the pendulum cast); the Organ and the Dyke Front; the first-hour quest chain (§7.9); Raker variants and the Chainman set | A101–A107 re-staged; A-cast-pendulum; A103 per species; A17 fixed; the first hour playable start to finish |
| **3: breadth** | Spindle, Davit (arm extension), Weir, Kiln, Dredge, Sounder (burrow extension); the Glaze and Levelled sets; Breakwater and the Bench; the Cinder Rise and the Works; landmarks; NPC archetypes 7–12 | per-species rig gates; A-npc-variety ≥ 10; A21 on the fight ledger; A90-expansion |
| **4: apex and polish** | **Vane** (tethered flight), **Gantry**; the decal and trim atlas (`uv1` kept in `normalizeAttrs`); LOD1s; the KTX2 decision; audio regeneration under the new set names; credits and the licence manifest (UBC, MCO and UAL2 zip SHA-256s; Poly Haven); README and `docs/media` re-filmed | full suite; A21 on the Gantry ledger; A-ID-no-horizon-terms = 0 |

### 10.6 New gates this direction asks for

| gate | assertion |
|---|---|
| `A-ID-no-horizon-terms` | the inventory's Appendix A regexes over `src/`, `index.html`, `public/**/*.{json,md}` and UI strings → **0 hits** (a legal credits line is whitelisted) |
| `A-ID-ip-assets-gone` | no GLB in `public/` whose `asset.extras` names Sketchfab, HZD or Fortnite; no NC licence in any manifest |
| `V-ID-silhouette` | Ebba rendered with a flat black override, front / side / back, at 1.6 m and 8 m. **Criteria:** the braid and bob separate from the head mass; the single pauldron asymmetric; the kilt split visible; the pole diagonal; the hip quiver; no mane |
| `V-ID-face` | front and 3q at 1.2 m. **Criteria:** the salt band, its red rule and the brow scar readable; the iris visibly grey-green |
| `A-ID-glossy-machines` | every machine hull material has roughness in [0.18, 0.32]; terrain and prop median ≥ 0.6 |
| `A-ID-datum-line` | `uDatum` present on the terrain, rock and prop materials. A pixel probe at the spawn vista finds a continuous survey-red band covering ≥ 25% of the screen width |
| `A-ID-lamp-states` | per kind and per AI state: lamp colour within ΔE < 8 of the §6.3 token, and blink frequency within ±15% (0 / 1 / 4 Hz) |
| `A-cast-pendulum` | during Line and Censer casts: hand ≤ `shoulder_y + 0.05`; elbow never > 0.10 m behind the head plane; release angle 30–40° |
| `A-bob-clear` | at full draw at 3 camera pitches: plumb-bob to draw hand ≥ 0.06 m; braid never crosses the forearm capsule |
| `A-npc-variety` (from the human lane) | ≥ 10 distinct archetype mesh / colour / clip signatures across Rakewich and Breakwater |
| `A-outfit-swap-memory` (from the human lane) | geometries and textures equal after 6 swaps across all 12 variants |

The inventory's 248-gate re-stage plan stands. Use role-based `tools/gate-roster.mjs` with roles mapped to the §6.4 kinds (scout → Plumb, stalker → Shear, heavy → Tamper, herd → Tiller, flier → Vane, apex → Gantry), and `tools/gate-places.mjs` for the §7.2 coordinates.

### 10.7 Rename map (for the mechanical pass in inventory §3)

**People, factions, sites and mechanics:**

| HZD term | Saltline |
|---|---|
| Aloy | Ebba |
| Nora / Carja / Oseram / Eclipse | Panwrights / Holdfast / Holdfast / Levelled |
| Focus | the Tine / Sounding |
| tag | flag |
| Override | Retune |
| Concentration | Slack Water |
| Silent Strike | Flense |
| Critical Strike | Stake |
| Medicine Pouch | salve gourd |
| Metal Shards | salt bars |
| Datapoint | tide log (plus Benchmarks) |
| Hunting Grounds | Reckoning |
| Cauldron | Kiln Yard |
| Tallneck | none (the Staff is static) |
| Corruption | none (the "reclaiming" state is the Line) |

**Resources:**

| HZD term | Saltline |
|---|---|
| Blaze | lamp oil |
| Chillwater | brine |
| Sparker | copper cell |
| Ridge-wood | drift-ash |
| Wire / Braided Wire | tarred line / laid line |
| machine core / lens | gimbal ring / lamp lens |

**Weapons and elements:**

| HZD term | Saltline |
|---|---|
| Hunter / Sharpshot / War Bow | Fieldbow / Staffbow / Hornbow |
| Blast Sling | Censer |
| Ropecaster | Sounding Line |
| Tripcaster | survey pins (a trap tool) |
| Disc Launcher | the Monkey (a torn Tamper hammer) |
| fire / freeze / shock | Flare / Brine / Galvanic, plus Craze |

**Skill trees:**

| HZD term | Saltline |
|---|---|
| Prowler / Brave / Forager | Ebb (stealth, survival) / Flood (melee, heavy) / Slack (precision, tools) |

**Machine roles** (for `gate-roster.mjs`):

| HZD machine | Saltline |
|---|---|
| Watcher | Plumb |
| Strider / Grazer | Tiller |
| Scrapper / Sawtooth | Shear |
| Charger / Behemoth | Tamper |
| Longleg | Spindle |
| Shell-Walker | Davit |
| Snapmaw | Weir |
| Ravager / Bellowback | Kiln |
| Rockbreaker / Burrower | Sounder |
| Glinthawk | Vane |
| Thunderjaw | Gantry |
| (new) | Dredge |

**Contract identifiers.** Events, `kind` strings and item ids are contracts (inventory §3.4). Rename them in one pass across emitters, `audio.js` and the gates, together with the save-version bump.

---

**Files:**
- this document, `docs/research/round5-direction-c.md`;
- the name-check script, `/private/tmp/claude-501/-Users-kevinliu-Horizon-Zero-Claude/db31a0fa-9701-46f4-8234-5158425c1e49/scratchpad/r5/dirc/namecheck2.py` (scratch, not shipped).

No servers or browsers were started, port 5173 was not touched, and no git operations were run.
