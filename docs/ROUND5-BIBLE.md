# CALIMA — ROUND 5 CREATIVE BIBLE

Owner: lead designer + technical director, Round 5 (Oct 15 2026). Companion build plan:
`docs/ROUND5-PLAN.md` (lanes, waves, budgets, deletions, gate spec). This bible is the content
canon every Round-5 lane builds against; where this file and an older doc disagree, this file wins.

Inputs read in full: `docs/ROUND5-INVENTORY.md`, `docs/research/round5-pipeline-humans.md`,
`docs/research/round5-pipeline-creatures-world.md`, `docs/research/round5-direction-{a,b,c}.md`,
the three judges' score sheets, and `docs/ROUND4-AUDIT.md` §4 (gate format). Revised by the
completeness-critic pass (Oct 15 2026); the changelog is `docs/ROUND5-PLAN.md` §12.

**Aloy cannot ship in any form.** The brief asks for a "custom aloy model". An Aloy likeness, name or
costume is Sony/Guerrilla IP, so **Brea** fills that role on the same rig and movement stack. This is a
decision for Kevin to confirm (PLAN §11, decision 1); her silhouette and face sheets are shown to him
before wave 0 exits.

---

## 0. The decision

### 0.1 Winner by summed scores

| direction | distinctiveness + legal | feasibility + perf | appeal + coherence | **sum** |
|---|---|---|---|---|
| **A — CALIMA** (place-first) | 80 | 61 | 83 | **224** |
| C — SALTLINE (identity-first) | 56 | 78 | 86 | 220 |
| B — UNBUILT (play-first) | 61 | 68 | 81 | 210 |

**CALIMA wins.** No tie-break was needed. Its feasibility debts (upright lance, OverhandThrow, a
one-handed heavy clip, four locomotion types outside GaitController, world detail finer than the
terrain mesh) are all fixed below by grafting C's and B's answers, so the build inherits A's place,
heroine and Horizon distance with C's feasibility discipline.

### 0.2 Every must-fix item and where it is applied

| # | must-fix (judge) | applied as | § |
|---|---|---|---|
| D1 | replace Julius Sans One, Rajdhani, Chakra Petch; ship OFL.txt; OFL in the manifest | **Bodoni Moda + IBM Plex Sans Condensed + IBM Plex Mono** (C's stack), all OFL-1.1 | 9.7 |
| D2 | calm/wary off override-teal and Focus-violet; ΔE2000 ≥ 20 gate | new lamp tokens, measured ΔE ≥ 24.7 from all five canon colours; gate `A-lamp-canon-distance` | 7.2 |
| D3 | drop DATUM as a fallback title | fallback is **SALT & SPARK** only | 1.1 |
| D4 | re-stage the title shot: the Pans, not the Transit on a sunset skyline | title = the Pans in calima; the Transit is never key art on a low-sun skyline | 1.1, 8.9, 9.8 |
| D5 | no "tear", "impact", "brittle" in UI | player words **Pry** and **Blunt**; statuses Charred / Seized / Clouded | 5.8 |
| D6 | keep live lava out of hero vistas; correct the Burning Shores omission | **no live lava anywhere** (cold malpaís, fumaroles, man-made wellhead glow); Burning Shores acknowledged | 2.1, 8.3, 11 |
| D7 | recolour the waist sash; keep the quiver a distinct cane tube | sash is undyed linen, no red at the hip; quiver is a rigid capped cane tube | 3.4, 3.6 |
| D8 | merge B's lexicon into A's, add Brittle and Impact, lint role ids / table keys / UI | union lexicon (417 tokens) ran over all 179 proposed names: **0 hard hits** | 10.3 |
| D9 | delete or rename `ai/override.js`, the OVERRIDE table and the `overridden` state in P0 | deleted in wave 0; design rule 7.1-R7 | 7.1 |
| D10 | change the logo font; drop the wide-tracked tagline under the hairline | Bodoni Moda wordmark, no second line, no tagline | 9.8 |
| D11 | trademark search for CALIMA; Anthropic brand terms for the spark | release-blocking checklist, PLAN §11 | 1.1 |
| F1 | upright lance fails A100/R8 — re-stow on a 30–60° diagonal or get a ruling + new draw path | **diagonal re-stow (ruling R10)**; the upright carry was measured against heel kick, arm swing and camera boom and rejected | 3.6 |
| F2 | replace OverhandThrow (lance, pots, net) with a constrained cast | **no lance throw**; pots and net use C's pendulum / spin cast; gate `A-cast-pendulum` | 5.3, 5.6, 5.7 |
| F3 | drop Sword_Heavy_Combo for the Counterweight Lance | heavy = meleeLayer HEAVY beats, two hands by construction (ruling R12) | 5.3 |
| F4 | guard the gaff clips | raw-clean clips only (Sword_Regular_A, Sword_Block, Idle_Shield_Loop, Shield_OneShot); anything else through the elbow guards + per-clip audit (R14) | 5.4 |
| F5 | ash pits as instanced meshes; MESH_SEGS ≈ 670 | pit-cups + crescent walls instanced; terrain at 1.94 m nodes (MESH_SEGS 686 at 1024 m) | 8.2, 8.7 |
| F6 | re-cost the Dredge as follow-the-leader; exemptions for Gyre/Sonde | Dredge costed 3 + 1.5 days with a cut line; **Gyre removed** (roll + Rollerback echo); Sonde **tethered** (B's spike) | 7.4 |
| F7 | absolute A45c bar for the Transit | 0.12 m/frame absolute, no leg-fraction bar | 7.4 #12 |
| F8 | cost a swim state and the tide | swim **cut** this round (deep water is a blocking current ring); tide costed 1.5 days with a static fallback | 8.6 |
| F9 | keep UAL1 locomotion | UAL1 stays the locomotion source; UAL2 is a native clip source only (R15) | 3.7 |
| F10 | cut biome scope to proven layers until the Pans vista passes | biomes 2–6 are gated behind `V-biome-vista-pans` | 8.3 |
| P1 | saturated hostile + shape/motion cues instead of a white strobe and violet wary | B's iris aperture + visible beam; hostile is saturated cochineal magenta | 7.2 |
| P2 | Brea's dominant colour off the salt-crust hex; contrast gate | dominant colour is orchil violet (CR 6.8:1 on salt); gate `A-brea-contrast` | 3.4 |
| P3 | throws never behind the head | as F2 | 5 |
| P4 | stow-clearance gate | `A-stow-clearance` (heels, terrain, camera boom, head box) | 3.6 |
| P5 | each armor variant a verb, not a percentage | 12 verb perks, none touching movement speed (R16) | 4 |
| P6 | Burning Shores in the distinctiveness table; no lava in key art | as D6 | 11 |
| P7 | prefer 1024 m | **1024 m** world square, one-number fallbacks 860 / 720 m | 8.1 |

### 0.3 Grafts

| from | graft | § |
|---|---|---|
| C | Bodoni Moda / IBM Plex type stack with OFL.txt | 9.7 |
| C | `A-ID-ip-assets-gone` + licence manifest with zip SHA-256s | PLAN §10 |
| C | title-collision findings (DATUM, Tidemark struck) | 1.1 |
| C | world-scale survey paint: **the Datum Line** (region-local, shows the Screed's cut height) | 8.8 |
| C | the pendulum cast; visible-gear rule (≤ 2 back, ≤ 2 hip); merged outfit + skeleton dispose; no movement modifiers on armor | 3.6, 4.1, 5.5 |
| C | grey-box colossus de-risk (30 k tris through the full seam before detailing); solid legs, no lattice at melee height | 7.4 #12 |
| C | Admiralty-chart cues on the field-book map (soundings, Bodoni italic place names) | 9.7 |
| B | mechanic words Pry / Steady / Flagged / Undercut / Felling blow | 5.8, 10 |
| B | `names-check.mjs` lexicon (Saltbite, Call of the Mountain) unioned into the lint | 10.3 |
| B | shape-first lamp states (iris 100/50/20 %), one instanced beam draw in fog | 7.2 |
| B | weak-point grammar (lamp / vial / tool / joint); tool removal disables its linked attack | 7.3 |
| B | "environmental manipulation, never mind control" as a written rule | 7.1-R7 |
| B | hero de-risk order (aim solve on the bare body, then outfit piece by piece); pauldron rigid on `clavicle_l` | 3.8, 4.5 |
| B | charge-into-terrain self-stun (Screed); the repair support Instrument with a visible spare rack (Davit) | 7.4 |
| B | tethered flier with a 2-day spike and numeric exits (Sonde) | 7.4 #8 |
| B | lookout NPCs who call warnings; a repair that visibly grows a settlement | 6.3, 8.5 |
| B | literal readability gates `A-sil40`, `A-weak40`, `A-lamp-states`, `A-weapon-role`, `A-armor-verb` | PLAN §9 |
| A (kept) | the place, the Datum lore, Brea, Alidade, triangulation map reveal, Windwall, gaff, Peg transects, Gauge, calima weather, costed extension table, GPU-first wave 0, prove-one-biome rule, one-centre site file | throughout |

---

## 1. Title and premise

### 1.1 Title: **CALIMA**

*Calima* is the Canary Islands' word for the Saharan dust haze that turns the sky ochre and the
sun into a soft coral disc. In CALIMA that dust-sun **is** the Claude spark (`#DA7756`), it is a
weather state that halves the Instruments' perception, and it is the title shot.

- Fallback title: **SALT & SPARK**. *DATUM* is struck (an existing itch.io game, girali.itch.io/datum);
  *Tidemark* is struck for the same reason (C's finding).
- Before any public release (release-blocking, PLAN §11): a USPTO/EUIPO search for CALIMA in
  classes 9, 28 and 41, and a check of Anthropic's brand terms for the spark as a game logo. A web
  search on Oct 15 2026 found no video game titled "Calima"; that is not clearance.
- No "A CLAUDE GAME" kicker or any other third-party word mark in the lockup.

**Logline.** *On a volcanic Atlantic island, survey machines are still holding the ground to an
800-year-old map, and they flatten anything that isn't on it. A salt-pan Reckoner has to survey
the island again, villages included, before its western flank slides into the sea.*

### 1.2 Three pillars

1. **Instruments, not animals.** Every enemy is a working survey or civil-engineering tool:
   theodolite tripods, soil samplers, a road grader, a pottery kiln, a tide gauge, a crane, a
   cable layer. No jaws, no heads, no tails, no eyes. Family mark: vermilion-and-white staff
   graduations.
2. **Salt, dust and fog: one island, three climates from one wind.** The NE trade wind makes the
   windward north a wet laurel cloud forest and the leeward south black sand, salt pans and ash
   vineyards. When the calima blows, the sky goes ochre and the Instruments go half-blind.
3. **Brea is a tradeswoman, not a chosen one.** 31, numerate, respected. Her power is a brass
   sighting tube and a working knowledge of triangles.

### 1.3 The lore everything hangs on: the Datum

- **The threat.** 800 years ago Orchil's western volcanic flank was creeping seaward a few
  centimetres a year (a real hazard class: La Palma, El Hierro's prehistoric El Golfo slide).
- **The Survey.** The islanders and an off-island consortium commissioned the **Datum Survey**:
  a self-maintaining population of instruments with one reference model (the *Datum*: Orchil
  measured to the millimetre on one day) and one instruction: **keep Orchil true to the Datum.**
  - *Measuring* instruments watch; *correcting* instruments push ground back where it belongs;
    *anchoring works* pin the western flank to the seabed with bronze cables.
- **Then the ships stopped coming.** Mundane, not apocalyptic: priorities changed and nobody came
  back. No extinction event, no rogue AI, nothing buried to dig up.
- **Coexistence.** For eight centuries the **Instruments** (nobody says "machines") ignored
  people; the Pan Houses read their marks and kept out of their transects.
- **Epoch 812 (the game year).** The volcano wakes; the island drifts from the Datum faster than
  ever; correcting Instruments multiply their work, and everything built *after* the Datum counts
  as error: every village, wall and salt pan. Plumbs paint the **Datum Line** on anything in error,
  at the height the ground is meant to be — the line a Screed will cut down to.
- **Brea's arc.** The Datum accepts new observations when enough independent benchmarks agree
  (least-squares adjustment as play). She climbs trig pillars, re-surveys benchmarks, and makes
  the Datum treat each village as true ground. At the master benchmark, **the Fundamental**, she
  must set a Datum that keeps the flank pinned *and* the people on it.
- **Theme:** the map versus the territory — who gets to say what is true ground.

---

## 2. Setting: **Orchil**, a fictional island in Macaronesia

### 2.1 Where, and why it is not Horizon

- Open Atlantic at the latitude of the Canaries (~28° N), close enough to Africa for the calima.
- Named for *orchil*, the violet lichen dye that grew on its sea cliffs (a real Canary export).
- The zero meridian once ran through the Fortunate Isles (Ptolemy; France, 1634, through El
  Hierro): the island that was the zero of the world map is where a survey still holds the ground.
- **Horizon overlap, stated honestly.** Horizon's games are set in the post-collapse western USA,
  **and HFW: Burning Shores is a volcanic archipelago with live lava** (Direction A's §1.3 omitted
  this). CALIMA therefore has **no live lava anywhere**: its volcanism is a cold *malpaís* (aa and
  pahoehoe fields), fumaroles, cinder cones and man-made geothermal wellheads. Hero vistas lead with
  salt grids, white surf on black sand, crescent walls, laurel cloud forest and the calima disc.
- Every feature is a **reference, not a reproduction**: no real place names (except the geology
  word *malpaís*), no Guanche people depicted, no sacred sites or their names. Whistled speech,
  the shepherd's leap and crescent walls are re-imagined for an invented future people.

| game feature | real-world reference | biome |
|---|---|---|
| salt pans beside a black-sand beach and a lagoon | Salinas de Janubio, Lanzarote | The Pans |
| an emerald lagoon under a half-eroded red crater | El Golfo / Charco de los Clicos, Lanzarote | The Pans |
| an organ-pipe cliff of hexagonal basalt | Los Órganos, La Gomera | The Pans |
| vines in black-ash pits behind crescent stone walls | La Geria, Lanzarote | Crescent Holds |
| cochineal farmed on prickly pear | Guatiza and Mala, Lanzarote | Crescent Holds |
| a village hall inside a lava tube with a skylight | Jameos del Agua, Lanzarote | Crescent Holds |
| one giant dragon tree | Drago Milenario, Icod (Tenerife) | Crescent Holds |
| cold aa lava fields, cinder cones, fumaroles | Timanfaya (cold fields only) | Malpaís |
| laurel cloud forest, moss, deep ravines | Garajonay laurisilva (La Gomera) | Cloudline |
| fog-collecting nets; whistled language | El Hierro fog trees; La Gomera *silbo* | Cloudline |
| landslide amphitheatre, sea caves, wind-bent junipers | El Golfo (El Hierro), Los Hervideros, the sabinar | Drowned Flank |
| pumice caldera floor, eroded pillars, red flower spires, sea of clouds | Las Cañadas del Teide, Roques de García, *tajinaste rojo* | Caldera |
| white cylindrical trig pillars on summits | Spain's *vértices geodésicos* | island-wide (map reveal) |

### 2.2 Era

**Epoch 812 of the Datum** (~29th century CE). Pre-industrial craft at a high standard by literate
people: bronze cast from salvaged Instrument alloy, ceramics, dyeing, rope, boats, paper field books.
People know what a theodolite is; the old world is history, not religion.

### 2.3 Climate and weather

Subtropical oceanic, 17–27 °C. NE trade wind from bearing **045**: foliage leans SW, crescent walls
face NE, flags stream SW. The trade-wind inversion parks a cloud deck at 110–150 m on the windward
slopes; from the caldera you look down on a sea of clouds.

| weather state (`setWeather`) | frequency | effect | Instrument perception (`environment.perceptionScale`) |
|---|---|---|---|
| `trade` (clear) | default | normal light | 1.0 |
| `calima` | 1 in 4 days, Holds and Pans | fog Calima Ochre `#C98B4E` ×4, sun drawn as a coral disc `#F2A27E`, shadow strength 0.45 | **0.5** |
| `fogbank` | Cloudline, dawn and dusk | height fog below 150 m, ×3 | 0.5 inside the bank |
| `squall` | rare | rain on the windward side only | 0.8 |
| night (any) | 19:45–05:30 | lamps rule the frame | 0.7 |

Fumarole steam in the Malpaís is a local particle emitter, not a weather state.

### 2.4 Time-of-day palette (keyframes for `environment.js`; sun rises 06:00 ENE, sets 19:30 WNW)

| hour | sky zenith | horizon | sun / key | fog | notes |
|---|---|---|---|---|---|
| 05:30 pre-dawn | `#2B3550` | `#9C8FA0` | — | `#6F7480` | Saltrow lamps on; sea darker than sky |
| 07:00 dawn | `#6E88A8` | `#F2B98E` | `#FFC9A0` low ENE | `#C9B3A6` | cloud sea lit from below `#F6D2B0`; cool shadows `#4A5570` |
| 12:00 trade noon | `#3F78B5` | `#BFD3E0` | `#FFF6E8` | `#CFD8DE` thin | black sand drinks light; salt glares; −0.3 EV in the Pans |
| any hour, calima | `#B9875C` | `#D2A274` | **disc `#F2A27E`** (the spark) | `#C98B4E` ×4 | soft shadows, flat ochre — **the title light** |
| 18:45 golden | `#5A6E9A` | `#F08A5A` | `#FFB070` | `#D9A37E` | rakes basalt columns and the Drowned Flank wall |
| 19:45 dusk | `#2F3560` | `#C46A7A` | — | `#7A6474` | Kiln Yards wellheads glow `#FF6A2A` (man-made, not lava) |
| 23:00 night | `#0D1220` | `#1B2438` | moon `#9FB3D6` 0.12 | `#20283A` | salt pans glow under the moon; stars |

---

## 3. Protagonist: **Brea**

### 3.1 Identity

| | |
|---|---|
| name | **Brea** (BRAY-ah): coast word for pitch, the tar that seals sluices and boats; a nickname earned with tar-black hands. Her given name is a whistled phrase from her mother's highland people |
| age | 31 |
| culture | born in **Saltrow** (the Pan Houses) to a Fogcatcher mother; belongs to both coast and highland |
| job | the Pan Houses' **Reckoner**: reads Instrument marks and transects, moves the pans when the lines shift, bargains with the Gauge's tide clock |
| temperament | dry, patient, measures before she acts; talks in quantities ("forty paces, two hands of wind") |
| tool | the **Alidade**: a 6 cm brass sighting tube with stadia hairlines on a sternum cord, raised to the right eye (the Sighting mode). Hand-held, away from the temple |
| mark | a tattooed **∴** (triangulation mark) on the back of her right hand, visible in every draw close-up |

### 3.2 Silhouette: five reads (gate `V-brea-one-glance`, 64 px tall, black fill)

1. **Head:** an orchil-violet **headwrap with a topknot** and a 0.40 m cloth tail trailing left-rear,
   over short black coils. No braid, no red hair, no mane.
2. **Torso colour block:** an orchil-violet over-smock cinched by a black lapilli-leather girdle.
3. **Left forearm:** a **crescent bracer**. From minute 0 it is the archer's bracer: stiff leather with a
   bronze crescent plate. At 0:35 the closed **Windwall** (nine slats, same crescent read) replaces it
   in the same socket. The cue holds in every loadout.
4. **Back:** one steep lance diagonal with a **bronze bob at the low (left) end**. On the default
   Shepherd's Lance this is a 7 cm bob-shaped butt cap; on the Counterweight Lance it is the full
   12 cm cast plumb bob. The cue holds in the default loadout.
5. **Right hip:** a tall, rigid, capped **cane tube** quiver tilted 20° forward.

Front: violet wrap band, salt-paste line across nose and cheeks, alidade glint at the sternum,
undyed-linen sash knotted at the left hip, wide basalt-grey trousers, esparto-wrapped boots.
Side: topknot bump at the crown-back, wrap tail behind, cane quiver forward on the right, pot rack and
net bundle at the lumbar. Back: lance butt at the left hip rising over the right shoulder, bow on the
opposite diagonal beneath it, wrap tail left of the spine.

### 3.3 Body and proportions

- Base: **Quaternius Universal Base Characters, "Superhero" female** (CC0), normalised to **1.72 m**
  (measured from the body mesh, not hair or wrap). Every absolute-metre constant in the kept stack
  compares like for like with the Round-4 numbers.
- Measured on this skeleton (pipeline proof): arm 0.233 + 0.242 = **0.475 m**; pelvis rest 0.911 m;
  `Head` joint 1.502 m (skull base); hipScale 0.994; UBC 65-joint skeleton; 52/52 UAL pairs bound.
- **No per-bone rescaling.** Taller only by uniform scale at normalise time, then re-run the bow solve.

### 3.4 Palette (default outfit, by visible share)

| swatch | hex | where | share |
|---|---|---|---|
| Orchil Violet | `#6B3F73` | over-smock | 35 % |
| Orchil Deep | `#5A2E66` | headwrap + tail | 8 % |
| Basalt Grey | `#4A4A50` | trousers | 20 % |
| Lapilli Black | `#1C1B1E` | girdle, boot wraps | 10 % |
| Undyed Linen | `#D9CFBA` | sleeves, sash | 12 % |
| Cochineal Carmine | `#A3213A` | wrap-tail lining, cuffs, Windwall hide | 6 % |
| Brass | `#B08A45` | alidade, buckles, quiver cap | 4 % |
| skin | ref `#8A5A3C` mid-cheek | — | 5 % |

Measured contrast: Orchil Violet on salt crust `#EDEAE2` = **6.8:1** luminance, ΔE2000 56; on
lapilli `#1C1B1E` = ΔE 26 (chroma carries her; the linen and brass patches add ≥ 3:1 local
contrast). Gate `A-brea-contrast` (PLAN §9). **No red at the hip**; the sash is linen.

### 3.5 Hair, wrap and face

| part | build | chain / rig | notes |
|---|---|---|---|
| short coils | UBC `Hair_BuzzedFemale` shell, tint `#15110F` | rigid `Head` | — |
| topknot | procedural wrapped bun, Ø 14 cm, ≤ 400 tris | rigid `Head` | crown-back |
| knot tail | lofted tube 0.22 m, ≤ 500 tris | `dyn_hairKnotTail_01..04` + `_end`, class **hair** | **A33-hair-bounce target** |
| headwrap band | 6 cm band, ≤ 900 tris | rigid `Head` | Orchil Deep |
| wrap tail | cloth strip 0.40 m × 7 cm, ≤ 700 tris | `dyn_wrapSash_01..06` + `_end`, class **cloth** | down the left of the spine; never on the draw side |
| sash end | ≤ 300 tris | `dyn_sashEnd_01..03`, cloth | left hip |
| alidade cord | 2 links | `dyn_alidadeCord_01..02` | sternum |

**Spring collider (M10).** A capsule on the right hand + forearm is added to the spring solver; it
replaces the Aloy-name braid guard. Bar: wrap tail and knot tail ≥ 0.05 m from the draw hand through
a full draw cycle at three camera pitches (`A-wrap-clear`).

**Face, no Blender** (`tools/build/recipes/brea.mjs`):
1. **Displacement field** (sum of Gaussian bumps in bind space) applied with the same field to head,
   brows, eye mesh and hair shell; eye socket rigid (18 mm falloff mask); normals recomputed.
   Nose bridge +6 mm, nose length +7 mm, cheekbones +6 mm lateral / +3 mm forward, jaw angle +7 mm,
   chin +6 mm, brow ridge +4 mm, upper lip −2 mm. Gate `A-face-delta`: ≥ 6 mm on ≥ 5 of the 7
   landmarks, and the profile-silhouette IoU against stock UBC ≤ 0.92 (a visible change, not random
   bumps). The field and the paint compositor live in `tools/build/recipes/lib/face.mjs`, which the NPC
   recipes reuse with seeded per-archetype offsets (§6.2).
2. **Paint layer** (sharp composite on the 1024² base): warm olive-brown skin; sun creases; the
   **salt-line** (`#EDEAE2` paste, 8 mm, cheek to cheek across the nose bridge, below the eyes,
   slight crackle); a 3 cm scar through the left brow; the ∴ on the right hand; no freckles.
3. Eyes dark brown `#3B2A20`; heavy straight brows (thickness ×1.08).
4. Fallback only on a second failed `V-brea-face`: Blender sculpt pass (346 MB DMG, ~1.2 GB installed).

### 3.6 Carry layout (stow sockets) — ruling R10

Direction A's upright lance is **rejected**. Measured reasons: a vertical 1.5 m pole behind a 1.72 m
body puts the ferrule at calf height (sprint heel-kick reaches it), puts the shaft in the
fore-aft arm backswing if offset from the spine, crosses the head in every chase-camera frame if on
the spine, fails A100's 30–60° band and the carry solver's 30.5° clamp, and a high-grab draw from it
breaks R8. The kept diagonal is used; Brea's back read is broken by the wrap/topknot (no braid), the
violet block, the counterweight bob and the crescent bracer — the remedy the distinctiveness judge
itself offered for B ("or a non-braid hair read").

| item | socket bone | placement | constraint |
|---|---|---|---|
| lance (1.55 m) | `spine_03` | **steep diagonal 32–40° from vertical**, butt (ferrule or counterweight bob) low at the **left** hip, blade **above the right shoulder** 0.25–0.60 m | A100 band; wrap-tail clearance ≥ 0.06 m; does not touch bow or quiver |
| bow | `spine_02` | opposite diagonal beneath the lance (right hip → left shoulder) | gap to back ≤ 0.03 m |
| quiver (rigid cane tube, palm-weave cap, 12 arrows) | `pelvis`, right hip | tilted 20° forward so the nock hand never goes behind the shoulder plane | A17 quiver point |
| gaff | `pelvis`, left rear hip | hook over the girdle, haft angled 30° back | clear of the left forearm swing |
| pots ×3 + net bundle | `pelvis`, lumbar | pots left-lumbar, net centre-lumbar | clear of both forearm swings |
| archer's crescent bracer (default), replaced by the closed Windwall from 0:35 | `lowerarm_l` | dorsal side of the forearm | clear of the bowstring path |
| alidade | neck cord | sternum | — |

- **Visible-gear rule** (C): ≤ 2 back items (lance, bow) + ≤ 2 hip items (quiver, gaff) + the lumbar
  rack. Everything stowed is **one merged mesh, one draw** on one 1024² weapon atlas; a per-vertex
  `pieceId` + uniform bitmask collapses the drawn weapon's stowed copy (still one draw).
- **Stow is authored from the body surface** (offset from nearest body vertices along the normal),
  which fixes the proof's 0.2 m floating spear.
- **Clearance gate** `A-stow-clearance`: heels/calves ≥ 0.05 m at sprint, ≥ 0.05 m above terrain at
  crouch, no boom crossing, ≤ 8 % of the head's screen box covered in the chase cam.

### 3.7 What she needs from the kept movement stack

| action | source | Kevin's rule it must meet | gate |
|---|---|---|---|
| idle, walk, jog, run, sprint, crouch | **UAL1** clips retargeted by the kept Retargeter (R15) + kept overlays | idle hands fine; running arms fore-aft beside the body, never T-rex, never prancing, never crossing | A11, A12, A13, A28, `A-run-arms`, V1–V3 |
| bow nock, draw, hold, loose | kept `_aimLayer`, ~12 constants re-derived on the 0.475 m arm after the **Lmax solve** | draw hand at the cheek outside the hair; elbow level or back; bow arm 165–172° and clear of the chest; never an arm behind the head | A16, A17, A32, A35, `A-draw-elbow-level`, V24 |
| lance ready / lights / heavy / butt-strike | kept `meleeLayer` (grip by construction), tables re-measured | melee performed by the body, weapon held properly | A100–A107, R1–R16 |
| gaff, Windwall | UAL2 raw-clean clips + guarded clips (R14) | same | `A-clip-elbow-audit` |
| pots, net | **pendulum / spin cast** (no OverhandThrow, R13) | never behind the head | `A-cast-pendulum` |
| alidade raise | overlay reusing the bow-anchor IK target: right hand to right eye | elbow down and in, never above the head | `A-alidade-pose` |
| climb 1 m, cinder slide | UAL2 `ClimbUp_1m`, `Slide_Start/Loop/Exit`; actions in `player.js` (hero-body, wave 0) | hands on the ledge, no float | `A-climb-1m`, `A-slide`, `V-traversal` |
| ride a cable basket | `player.ride(path, clip)` hook (hero-body, wave 0) + `Sitting_Idle_Loop`; baskets built by settlements (wave 4) | — | `A-basket` |
| heal (fog-water gourd) | UAL2 `Consume` | — | — |
| rake, interact, pick up | UAL2 `Farm_Harvest`; UAL1 `Interact`, `PickUp_Table` | — | — |
| swim, pole-vault leap | **cut this round** | — | — |

### 3.8 Build order for Brea (B's de-risk sequence)

1. Bare UBC body + head + wrap/topknot/knot tail; rig profile; seams.
2. Solve `Lmax = −u·d + sqrt((u·d)² − ‖u‖² + reach²)` **first**; author `bow.pull` and arrow length
   from it; re-derive the ~12 aim constants until **A35, A16, A32, A17** pass on the bare body
   (today: bow arm 141°, elbow 0.089 m low).
3. Add outfit pieces one at a time (smock, sash, girdle, boots, quiver, archer's bracer, stow kit), re-running
   A35 + `A-draw-elbow-level` + `A-wrap-clear` + `A-run-arms` + `A-stow-clearance` after **each**.
4. Face field + paint; `A-face-delta`, `V-brea-face`.

### 3.9 Default outfit: *Pan Whites I — Raker's Whites*

| slot | source | retexture (`pan` atlas, 1024² base, 512² normal + ORM) | tris |
|---|---|---|---|
| over-smock | MCO `Female_Peasant_Body` (CC0) | orchil-dyed linen; lapilli-leather girdle | ≈ 5 k |
| sleeves | MCO `Female_Peasant_Arms` | undyed linen rolled to the elbow; leather finger-tab right | ≈ 2.5 k |
| trousers | MCO `Female_Peasant_Legs` | basalt grey, wide | ≈ 2.5 k |
| boots | MCO `Female_Ranger_Feet` | esparto-wrapped, rope soles | ≈ 3 k |
| sash | procedural | undyed linen, left-hip knot + `dyn_sashEnd` | ≤ 900 |
| head | §3.5 | — | ≤ 2.5 k |
| **total** | body cut at head/neck + outfit + hair | **merged at equip into one SkinnedMesh per material** | see the caps below |

**Triangle caps (they sum to the 40 k total):** body + head + hair + wrap + eyes **≤ 10 k** (the merge
culls body faces fully hidden under the equipped outfit through a per-set hide mask), merged outfit
**≤ 17.5 k**, stow kit **≤ 9 k**, held weapon **≤ 3 k**: **39.5 k**.

Draws: skin+eyes, hair+wrap, outfit (merged), stow kit (merged), held weapon = **5 main**; shadows from
one merged LOD1 proxy (≤ 2 casters × 3 cascades). The outfit merge, the merged stow kit and v0 kit GLBs
(Shepherd's Lance with the bob cap, cane quiver, archer's bracer, Sabina Bow blockout) are wave-0
deliverables of hero-body, so the wave-0 draw and silhouette gates run on the real loadout.

---

## 4. Armor: 4 sets × 3 variants

### 4.1 System rules

- Slots: HEAD, SHOULDERS, TORSO, ARMS, WAIST, LEGS, FEET. Pieces are SkinnedMeshes on the one UBC
  skeleton, exported in canonical joint order, **merged at equip into one SkinnedMesh per material**.
- Sources: retextured CC0 MCO parts (Peasant/Ranger body, arms, legs, feet, hood, pauldrons) and
  procedural pieces (≤ 3 k tris each) offset from body vertices along the normal.
- One 1024² atlas per set (base 1024², normal/ORM 512²) shared by its 3 variants; a variant =
  piece toggles + tint/mask composite + ≤ 3 added pieces; ≤ 17.5 k tris merged; ≤ 0.8 MB per set.
- **Swap disposes** merged geometry, materials, every texture slot, **and the Skeleton** (the
  proof's one-bone-texture-per-swap leak); drops the fade-clone bookkeeping.
- **R16: armor never changes `player.speeds`, dodge timing/distance, jump, or slide length.**
  Every variant's identity is one **verb perk** (B's principle) measured by `A-armor-verb`; armor
  and resist numbers are secondary and small.
- **Perks act only through published hooks** (§4.7), never by armory editing another system:
  `player.mods` (hero-body), perception `detectMul` / `flagDuration` and the stimulus noise filter
  (instruments-core), the pool-damage filter, Windwall `parryMul` and `combat.whistle(at)`
  (combat-kit). Each perk's probe measures through the real path and runs a negative control
  (the same probe without the perk must show the base behaviour).
- Pauldrons are rigid on **`clavicle_l` / `clavicle_r`**, never weighted to `upperarm`, so they
  cannot fold into the neck at full draw (pauldron-to-head ≥ 0.03 m at full draw).
- Elements map to channels: Cinder = `fire`, Brine = `freeze`, Dust = `shock` (no new combat code).

### 4.2 Set A — **Pan Whites** (Saltrow; brine, economy)

Atlas `pan`: linen weave, orchil dye, salt-crust mask, palm weave, brass.

| variant | on screen | verb perk (measured) | armor · resist |
|---|---|---|---|
| **I Raker's Whites** (default) | §3.9 | **Brine-wade:** wading in brine and flooded pans applies no Brine build-up to her and no wet-footstep noise bonus | .05 · brine .20 |
| **II Guild Whites** | + woven-palm **wide hat** (0.42 m brim) that flips to a back socket in combat (two hidden meshes, 0 extra draws) + an orchil capelet with a brass guild clasp | **Shrug:** a Plumb's Flagged mark on her lasts 3 s instead of 8 s | .10 · — |
| **III Brine-Cured** | linen stiffened with salt crust on hems; celadon ceramic shoulder scutes (from Gauge floats, rigid on clavicles); crusted shin guards | **Mist-fighter:** she takes no Brine and no slow inside her own Brine Pot mist, so she can fight inside it | .20 · brine .50 |

### 4.3 Set B — **Ash Wraps** (Crescent Holds; stealth, dust)

Atlas `ash`: black and rust wool, undyed wraps, leather, smoked mica.

| variant | on screen | verb perk | armor · resist |
|---|---|---|---|
| **I Pit Wraps** | black wool wrap-tunic over rust under-layer, puttees, felt soles | **Ash-step:** at a jog, footsteps on ash, lapilli and sand emit no noise stimulus (sprint still does) | .08 · dust .20 |
| **II Calima Veil** | + rust face veil; smoked mica goggles on the brow that drop over the eyes in calima; hood up | **Dust-sight:** in calima and inside Dust Pot clouds the alidade outlines Instruments through the dust | .10 · dust .60 |
| **III Lattice Quilt** | + quilted vest stitched in the crescent-wall pattern, knapped basalt-flake lamellae; crescent bronze gorget | **Brace:** knockdowns become a 0.4 s stagger | .25 · — |

### 4.4 Set C — **Fog Felts** (Fogcatchers; traversal, wet)

Atlas `fog`: felted wool in laurel and moss, sheepskin, net mesh, goat horn.

| variant | on screen | verb perk | armor · resist |
|---|---|---|---|
| **I Shepherd's Felt** | moss-green felted tunic, sheepskin over-vest, horn toggles | **Sure-foot:** no fall damage below 6 m (base 4 m); lethal height 11 m (base 9 m). Slides are unchanged (R16; every slide can already be exited on input) | .08 · — |
| **II Dripline** | + fog-net shawl (opaque lattice geometry, no alpha) strung with water beads; two back points swing (`dyn_shawlFlap_l/r_01..03`) | **Fog-mend:** health regenerates 1 hp/s up to 60 % inside fog bank or rain | .10 · cinder .40 |
| **III Highline** | + felt hood, goat-horn shoulder toggles, rope coil worn cross-body (left shoulder → right hip, clear of the string side) | **Thrown whistle:** the base whistle (G) makes noise where Brea stands; in Highline, holding G throws it to the aimed point up to 40 m away (the Fogcatchers' ravine-carrying whistle), and the nearest Instrument investigates *that* point | .15 · — |

### 4.5 Set D — **Glaze Plate** (salvaged Instrument ceramic; heavy)

Atlas `glaze`: ceramic tiles laced with bronze wire over linen — ceramic lamellar, not "machine hide".

| variant | on screen | verb perk | armor · resist |
|---|---|---|---|
| **I Celadon Lamellar** | rows of celadon tiles, each row rigid to one bone (`pelvis`, `spine_01/02/03`) so bending opens real gaps; tiled right bracer | **Ring-parry:** Windwall parry window ×1.5 | .30 · — |
| **II Oxblood Lamellar** | oxblood tiles, ceramic pauldrons (rigid on clavicles), glazed shin plates | **Kiln-walk:** standing in fire pools and glaze puddles deals no damage | .32 · cinder .50 |
| **III Datum Plate** | bone-white tiles with brass graduations; a salvaged lampglass set at the sternum glowing calm (emissive, `noShadow`) | **Read as true:** while she walks or stands still, Instrument detection fills ×0.5 (hostile Instruments are not fooled). Final-act set | .35 · — |

### 4.6 How each variant is acquired (equip panel: `src/ui/inventory.js`, armory wave 3)

| set | I | II | III |
|---|---|---|---|
| Pan Whites | default | quest reward, "Raker's Morning" (Guild Matron Ansel) | craft at Saltrow: salt ×40 + Gauge float scutes ×3 |
| Ash Wraps | Ninewalls merchant, salt ×120 | craft: mica ×4 + wool ×6 | quest reward, "The Scar" (Ninewalls) |
| Fog Felts | Mistfold merchant, salt ×150 | Fog Harp retune reward | craft: cord ×6 + goat horn ×2 |
| Glaze Plate | craft at Tube Smith Oro: ceramic ×12 + bronze cable ×2 | Kiln Yards shut-down reward | the Fundamental (final act) |

| weapon | variant 1 | variant 2 | variant 3 |
|---|---|---|---|
| bows | Sabina: default | Cane Recurve: Saltrow merchant | Sighting Bow: reward for three triangles |
| lances | Shepherd's: default | Obsidian: Ninewalls merchant | Counterweight: craft (a Pried Plumb bob + bronze ×4) |
| gaffs | Boat Gaff: Oro at 0:35 | Rake Gaff: Saltrow merchant | Bronze Gaff: craft (a Screed ram cylinder) |
| Windwalls | Pine: Oro at 0:35 | Scute: craft (Tiller scutes ×9) | Mirror: Calibration Yard quest |
| pots | Brine and Cinder: Oro at 0:35 (2 + 1) | — | Dust: craft (pumice ×3) |
| nets | Hand Net: fishing hut (hour 2) | Basalt Net: craft (basalt sinkers ×8) | Wire Net: craft (bronze cable ×3) |

The equipped loadout (armor variant, weapon variants, ammo, pots, nets) is saved (`A65`).

### 4.7 Perk hooks and probes (each probe also runs without the perk as a negative control)

| perk | hook (owner) | probe through the real path | pass with the perk / without it |
|---|---|---|---|
| Brine-wade | stimulus noise filter (instruments-core); Brine build-up filter (combat-kit) | jog 10 s in a brine pan | Brine build-up 0 and wet-footstep noise events = dry count ±10 % / build-up > 0 and wet bonus present |
| Shrug | `perception.flagDuration` (instruments-core) | a Plumb Flags her; read 3 Instruments' search state | flag ends at 3 ± 0.1 s / 8 ± 0.1 s |
| Mist-fighter | Brine build-up filter (combat-kit) | stand 5 s in her own Brine Pot mist | 0 build-up, speed unchanged / build-up > 0 and speed −40 % |
| Ash-step | stimulus noise filter | jog 10 s on ash, then sprint 5 s | 0 footstep noise events at jog and > 0 at sprint / > 0 at jog |
| Dust-sight | `perception` occlusion + Sighting outline flag (instruments-core, shell-ui) | calima, an Instrument at 30 m behind a Dust cloud | outline drawn / not drawn |
| Brace | `player.mods.knockdownMode` (hero-body) | take a Screed Blade Charge | stagger 0.4 ± 0.05 s, no knockdown state / knockdown |
| Sure-foot | `player.mods.fallSafe`, `fallLethal` | drop 5.5 m, then 10 m | 0 damage, then alive / damage > 0, then dead |
| Fog-mend | `player.mods.regen` | 20 s in a fog bank at 30 % HP | +1 hp/s ±10 %, capped at 60 % / no regen |
| Thrown whistle | `combat.whistle(at)` (combat-kit) | whistle at an aimed point 35 m away | the nearest Instrument's search target within 2 m of that point / within 2 m of Brea |
| Ring-parry | Windwall `parryMul` (combat-kit) | parry a Sickle lunge; count the frames of the window | 1.5 × base ± 1 frame / base ± 1 frame |
| Kiln-walk | pool-damage filter (combat-kit) | stand 4 s in a Cinder fire pool | 0 damage / > 0 |
| Read as true | `perception.detectMul` (instruments-core) | walk at 20 m from a calm Plumb; then from a hostile one | calm fill rate ×0.5 ±10 %, hostile unchanged / ×1.0 |

---

## 5. Weapons: 6 weapons × 3 variants (18 variants)

### 5.1 Contract and authoring

- Kept contract `{ group, model, pull, restZ, setDraw(d, showAmmo), setArrowType(id), getNockWorld(d, out) }`
  and `buildWeaponModel(id)` / `buildSpear()` entry points.
- Node-baked GLBs, merged per material (**1–2 draws**), one shared 1024² weapon atlas, named sockets
  `grip`, `grip2`, `nock`, `string_top`, `string_bottom`, `tip`, `stow`, `hook`. **Authored at real
  length** — `SPEAR_SCALE 0.80` is retired (M9). Variants are data (length, curve, palette, head,
  attachments). ≤ 3 k tris (lance ≤ 1.5 k), ≤ 0.15 MB each.
- Each weapon must win its scripted scenario by ≥ 30 % over the median of the other five
  (`A-weapon-role`). It is reported every wave and becomes a **pass bar at the wave-3 exit**, when all
  six weapons exist. Each weapon runs its default variant, and the others run their best variant.

| weapon | scenario (staged by role and `gatePlaces`) | metric (lower or higher is better) |
|---|---|---|
| bow | Sabina Bow vs an unaware Plumb (`sentry`) at 40 m on `openGround` | time to topple (two level-vial hits), lower |
| lance | Shepherd's Lance vs 3 Sickles (`flanker`) within 4 m | damage dealt in 10 s, higher |
| gaff | Boat Gaff vs a Tiller (`herd`): remove the hopper | time to component removal, lower |
| Windwall | Pine Windwall vs 3 Screed (`heavy`) Blade Charges | damage taken, lower |
| pots | Brine Pot vs a Kiln (`artillery`) firebox | time to kill, lower |
| net | Hand Net vs a Sonde (`spotter`) aloft at 15 m | time until it is grounded, lower |

### 5.2 Bows — the juniper family

| variant | silhouette and materials | role | numbers |
|---|---|---|---|
| **Sabina Bow** | 1.45 m self-bow of wind-twisted juniper; pale sapwood face, dark heartwood stripe; esparto grip; horn nocks | all-round | draw 0.65 s; ×1.0 |
| **Cane Recurve** | 1.15 m laminated giant cane + goat horn + bronze static recurve tips; carmine silk wraps | fast, quiet | draw 0.45 s; ×0.8; noise ×0.7 |
| **Sighting Bow** | 1.60 m resin-dark pine longbow with a bronze sight vane and a small lampglass on the riser | precision | ×2 zoom while aiming (`player.mods.zoom`); Steady lasts 6 s instead of 4 s; weak point ×1.5; draw 0.9 s |

- `pull` per variant = the Lmax solve on Brea (± 0.01 m); arrow = pull + 0.20 m. Arrows: cane
  shafts, gull fletching (white and black), bronze or obsidian heads.
- Ammo: **Reed** (Blunt), **Barbed** (Pry), **Brine-Gourd**, **Cinder-Resin**, **Dust-Puff**.
- **Poses:** hold — bow in the left hand, vertical, tip down; nock — right hand to the forward-tilted
  hip quiver, below the shoulder; draw — bow arm 165–172°, draw hand at the right jaw corner
  0.10–0.16 m from the head and outside knot/tail, elbow at shoulder height or behind
  (−0.03…+0.05 m), bow arm ≥ 0.04 m clear of the chest, the closed fan on the dorsal side so the
  string clears it; loose — hand travels 8–12 cm back along the jaw; stow — back diagonal.

### 5.3 Lances — the shepherd's family (1.55 m, near the tuned 1.48 m)

| variant | silhouette and materials | role |
|---|---|---|
| **Shepherd's Lance** | 1.55 m resin-dark pine, 22 cm bronze leaf blade, a **7 cm bob-shaped bronze butt cap** (the silhouette cue 4 in the default loadout), esparto wraps at both hand positions, vermilion/white graduations every 0.2 m on the upper third | balanced reach; the full beat table |
| **Obsidian Lance** | same haft, 30 cm knapped obsidian blade bound in sinew and resin | Pry specialist: component damage ×1.6, Blunt ×0.8 |
| **Counterweight Lance** | 1.50 m haft, broader blade, cast **bronze plumb-bob counterweight** at the butt (from a Plumb) | heavy: knockdowns, butt-strike finisher; slower |

- **Poses:** ready two-handed — left hand at 55 % of the shaft from the butt, right at 20 %, blade
  forward and up 15°, tip 0.35–0.55 m char-space (R2); thrust hip-driven, rear foot pushes,
  shoulders follow hips; sweep; butt-strike. **No throw** (the lance never leaves her hands).
- **Heavy (R12):** meleeLayer HEAVY beats (cock `(-0.30,1.62,0.22)` / contact `(-0.22,1.24,0.80)` /
  follow `(0.04,0.94,0.54)` scaled and re-measured), **both hands on the shaft at windup, contact
  and follow-through**. `Sword_Heavy_Combo` is never used (measured one-handed: hands never within
  0.22 m).
- Light-3 is one-handed (R1). Stow: §3.6 diagonal; draw/holster arm path R8.

### 5.4 **Gaff** (new): the fisherman's hook-blade

| variant | silhouette and materials | role |
|---|---|---|
| **Boat Gaff** | 0.75 m laurel haft, forged bronze hook with a 12 cm back-blade, carmine grip wrap | fast 3-hit combo; **hook-rip** pulls a component off small/medium Instruments |
| **Rake Gaff** | 0.85 m; T-shaped salt-rake comb of bronze tines with a hook at one end | wide sweeps, knockback on Pegs and Sickles |
| **Bronze Gaff** | cast from a Screed ram cylinder; heavy, serrated inner hook | breaks armor plates ×1.5; slower |

- **Clips (R14):** 3-hit combo = UAL2 `Sword_Regular_A`, retimed and mirrored per combo step (the
  Round-4 method); guard = `Sword_Block`; **hook-rip = a procedural beat** (hand travels 0.30–0.40 m
  toward the body along the haft over 0.25 s, elbow below the shoulder, forearm ≥ 0.10 m off the
  belly axis) instead of `Melee_Hook` (47 % of frames arm-over/behind-head); **lunge = the kept
  step-in impulse** instead of `Sword_Dash` (53 %). `Sword_Regular_B/C`, `Sword_Dash`, `Melee_Hook`
  may be used only if their guarded output passes `A-clip-elbow-audit`.
- Gripped in `hand_r` by construction, hook edge forward; masked to the upper body over the kept
  locomotion (`MASK_PREFIX` matches `Head` case-insensitively).

### 5.5 **Windwall** (new): the crescent fan-shield

The shape is the La Geria crescent wall: a windbreak you carry.

- **Closed:** a 0.42 m bundle of 9 slats along the dorsal left forearm. From 0:35 it replaces the
  archer's crescent bracer in the same `lowerarm_l` socket, so it also serves as the bracer. **Open:** slats pivot from a wrist hub into a **110° crescent**, 0.9 m chord × 0.55 m
  deep, goat hide (carmine-dyed) between them. Rig: 9 rigid slat bones `fan_00..08` under `hand_l`
  driven by one `open` parameter (deliberately not `dyn_`). ≤ 2.5 k tris, 1 draw.

| variant | look | numbers |
|---|---|---|
| **Pine Windwall** | pale pine slats, ochre hide | opens 0.18 s; parry window 0.25 s; blocks 40 % of heavy hits |
| **Scute Windwall** | each slat riveted with a Tiller bone-glaze scute | opens 0.28 s; blocks 80 %; guard breaks later |
| **Mirror Windwall** | polished brass boss and mirror rim | a perfect parry **reflects a Plumb sightline or the Transit's sweep**, darkening the source lamp 4 s |

| verb | clip | note |
|---|---|---|
| guard | `Idle_Shield_Loop` | raw-clean |
| parry | `Sword_Block` | raw-clean |
| absorb | `Shield_OneShot` | raw-clean |
| bash | `Shield_OneShot` + kept step-in impulse | `Shield_Dash` (48 % bad frames) only if its guarded output passes the audit |
| guard-break stagger | `Idle_Shield_Break` | must pass the per-clip audit before use |
| **plant** | `Crouch_Idle_Loop` | the fan drives into the ground as 0.9 m of crescent cover that **blocks Instrument line of sight** |

Moving while guarding uses the existing `aim` speed (1.35 m/s); no new speed value.

### 5.6 **Pots** (new): hand-thrown clay grenades

- ~0.15 m burnished pottery, ≤ 300 tris; three ride in the lumbar rack; crafted from clay + salt,
  vent resin or pumice.
- **Throw = the pendulum cast** (C's beat, ruling R13): the right arm swings the pot fore-aft *beside
  the thigh* (the running-arm plane, larger amplitude, 1–2 swings), releases forward-up at 30–40°;
  hand never above `shoulder_y + 0.05 m`, elbow never > 0.10 m behind the head plane. Quick lob =
  one swing, long cast = two. Arc preview in UI. No `OverhandThrow` anywhere (measured: it cocks the
  arm 0.63 m behind the head in ~50 % of frames).

| variant | look | effect |
|---|---|---|
| **Brine Pot** | grey-green clay, wax seal, sloshes | brine mist 3 m, 10 s: speed −40 %, armor −20 %; **quenches a Kiln firebox** |
| **Cinder Pot** | oxblood slip with carmine zig-zags, rag fuse | fire pool 2.5 m for 6 s |
| **Dust Pot** | pale pumice-clay punched with holes | dust cloud 5 m for 6 s: perception −80 %, breaks lock, resets alert |

### 5.7 **Cast Net** (new): the fisherman's throw-net

- Procedural disc 24 radial × 6 rings, ≤ 1.2 k tris, 1 draw, preallocated buffer; one `open`
  parameter spreads it. Carry: one (two with Fog Felts III's rope coil).
- **Throw = spin-cast:** a sidearm rotation at waist-to-chest height, the way real cast nets are
  thrown; same limits as the pendulum cast (hand ≤ shoulder + 0.05 m, elbow ≤ 0.10 m behind head).
- On contact the rim sinkers pin to the target's nearest bones; while fouled, gait amplitude and speed
  scale ×0.4. Retrieve with `PickUp_Table` within 3 m.

| variant | build | effect |
|---|---|---|
| **Hand Net** | 2.4 m linen cord, basalt sinkers | fouls Pegs and Sickles (−60 % speed, 5 s); **fouls a Sonde's fans, so it sinks** |
| **Basalt Net** | 3.2 m, heavy basalt sinkers | also slows medium Instruments |
| **Wire Net** | bronze wire | fouls and shorts lamps (dark 3 s); Sickle blades can't cut it |

### 5.8 Elements, damage words, ammo

| element | engine channel | status (player word) | colour | strong against |
|---|---|---|---|---|
| **Cinder** (vent resin) | `fire` | **Charred** (burn over time) | `#FF7A1A` | Sonde envelopes, Kiln canisters |
| **Brine** (corrosion) | `freeze` | **Seized** (bronze joints lock for 8 s: legs at speed ×0.6, and every tool or plate whose joint is seized comes off with **one** Pry hit or one hook-rip, regardless of its HP. **No damage multiplier**: this is not Horizon's Frozen/Brittle) | `#BDE6E3` | bronze-heavy Instruments; quenches a Kiln firebox |
| **Dust** (calima) | `shock` | **Clouded** (lamps blinded) | `#C98B4E` | sight-based Instruments (Plumb, Sonde) |

Base channels keep their engine names (`impact`, `tear`) in code; the **player words are Blunt and
Pry**. "Tear", "Impact", "Brittle" never reach the UI (`A-ui-words`).

**Two loops that are deliberately not Horizon's:**
- **Steady is a breath-hold, not slow motion.** Hold Shift while aiming (never while sprinting, A53):
  bow sway goes to 0 for 4 s of held breath (6 s with the Sighting Bow), then the reticle shakes for
  2 s while she recovers. `timeScale` stays 1.0 throughout. There is no time dilation anywhere in CALIMA.
- **The Kit Rack does not slow time.** Holding Tab opens the rack while the world keeps running at
  1.0; a quick-slot row (1–4) covers the moment-to-moment swaps.

### 5.9 Controls (keyboard + mouse; the pad map mirrors it in `input.js`)

| action | key | context | status |
|---|---|---|---|
| move / sprint / walk / crouch / jump-mantle / dodge | WASD / Shift / Alt / C / Space / Ctrl | — | kept |
| interact, pick up, climb a ledge, re-survey (hold) | E | prompt | kept (`interact`) |
| raise the Alidade (Sighting) | V | — | kept bind, renamed `sighting` |
| Flag a target in Sighting | T | Sighting | kept bind |
| gourd (heal) | Q | — | kept |
| aim the bow / Windwall guard | RMB | bow held / melee weapon held | kept button, new guard context |
| loose / light strike / bash | LMB (hold = heavy) | per held weapon | kept |
| Steady (breath-hold) | Shift | while aiming | kept bind, new behaviour |
| parry | RMB pressed within the variant's window before contact | Windwall guard | new |
| plant the Windwall | X | while guarding | **new** `plant` (X is ammo-cycle only outside guard) |
| cast a pot or net (tap = lob, hold = long cast with arc preview) | F | pot or net selected | **new** `cast` (F's tool use moves to the Kit Rack) |
| hook-rip | R | gaff held, near a component | **new** `tool` (R's craft moves to the Kit Rack) |
| whistle (Highline: hold to throw it) | G | — | kept (`combat.whistle`), extended |
| Kit Rack (no slow-motion) / quick slots | Tab (hold) / 1–4 | — | kept / **new** `slot1..4` |
| cycle ammo | Z / X | not guarding | kept |

New `input.js` actions (hero-body wave 0, ≤ 12 lines): `plant`, `cast`, `tool`, `slot1..4`, plus
pad entries. All of them can be rebound in settings (`A-input-actions`). The new binds go live in
wave 2, when combat-kit moves tool use (F) and craft (R) into the Kit Rack; `A-input-actions-live` then
checks that no two actions share a key in the same context.

---

## 6. Humans

### 6.1 Factions

| | **Pan Houses** (coast) | **Crescent Holds** (ash lowland) | **Fogcatchers** (cloud forest) | **Levelers** (antagonist sect) |
|---|---|---|---|---|
| who | salt-making guild families; traders, boat-builders; salt is the island's money | vine and fig farmers in ash pits; cochineal growers; bronze-smiths in the lava tube | highland herders and fog-net keepers; keepers of the paper field books; whistled speech | Datum zealots: the island must be returned to the model, so post-Datum villages should go |
| motif | **the grid** (salt-pan cells) | **the crescent** | **the vertical** (nets, rain, poles) | **the line and the broad arrow** |
| colours | Orchil Violet, linen, Brass, Carmine | Lapilli Black, Cinder Rust `#8E3B23`, undyed wool, olive | Laurel `#3E5B3A`, Felt Moss `#56603F`, Fog Grey, charcoal | kaolin white, survey vermilion-and-white bands |
| materials | linen, palm weave, brass, tar | wool, leather, mica, basalt flake | felt, sheepskin, goat horn, laurel wood, net | ceramic masks from Instrument lamp housings |
| architecture | whitewashed cubes, flat roofs, **orchil-painted balconies**, wind pumps, salt cones | low drystone houses sunk into lapilli; the lava tube as hall and forge | round stone huts with sod roofs, net frames, ladders, **cable baskets** | banded tripods and pegged lines below the Pinned Cliff |
| attitude to Instruments | read them, get out of the way | follow Tillers to plant in their auger holes | avoid them; know the old books | guide Screeds to "error" — they never command them |

**Levelers fight through the Instruments, never as human combatants this round** (no human-combat
AI exists): they lead Screeds to targets by walking pegged lines ahead of them. Breaking their staff
lamp (one arrow) makes the escorted Screed lose the line.

### 6.2 How an NPC is built

- Body: UBC female or male, height 1.64–1.84 m; an adolescent variant at **uniform 0.90 scale only**.
  There is **no bone scale of any kind other than uniform**: no `Head` ×1.06; the younger read comes
  from the face recipe (rounder cheeks, shorter nose). The variant is cut if `V-npc-builds` shows LBS
  artefacts. Girth comes from outfit bulk.
- **Faces:** the free UBC tier has one stock face per sex, so every archetype gets its own face from
  Brea's recipe library (`tools/build/recipes/lib/face.mjs`). Seeded per-archetype landmark offsets
  cover age sag, nose, jaw and brow, and a wrinkle/age paint layer goes on the archetype's head texture.
  Gate `A-npc-face-delta`: ≥ 4 mm on ≥ 4 landmarks pairwise between archetypes of the same sex.
- Clothes: retextured MCO parts on a **faction atlas** + procedural faction pieces (hats, yokes,
  aprons, shawls, masks, baskets ≤ 1.5 k tris each). **Every archetype wears ≥ 1 procedural faction
  piece**, so archetypes differ in silhouette, not only in tint.
- Variety: a **mask-aware tint shader** reads the MCO `COLOR_0..2` masks (E13, ½ day).
- Budget: ≤ 12 k tris LOD0, ≤ 4 k LOD1 beyond 25 m, **≤ 2 draws** (one atlas per body type + faction;
  base 1024², normal/ORM shared 512²); only the nearest 4 NPCs cast a shadow (LOD1 proxy).
  **At most 4 faction atlases are resident**: atlases stream per settlement and unload with it
  (`A-npc-atlas-resident`).
- Animation: UAL2 clips play natively on UBC; UAL1 clips via one baked ClipLibrary per body type.
  Mixer at 15 Hz beyond 60 m; hidden beyond 90 m.
- Walk style is data: clip, timeScale, route speed, posture overlay (spine/head pitch after the
  mixer, preallocated quaternions), arm-swing gain, stance width.
- Dispose: merged geometry, atlas references, **Skeleton**.

### 6.3 Thirteen archetypes (with idle and walk behaviours)

| # | archetype | faction | body / height / age | outfit | idles (clips) | walk style | where / when |
|---|---|---|---|---|---|---|---|
| 1 | **Salt Raker** | Pan | F or M, 1.66–1.78, 25–45 | `pan` Peasant + Ranger feet; palm hat; rake | `Farm_Harvest` (raking), `Consume` | `Walk_Loop` ×0.95, lean +6°, short stride | pans, daytime |
| 2 | **Guild Matron** | Pan | F, 1.64, 60s | orchil-heavy; shawl; brass guild chain | `Idle_FoldArms_Loop`, `Idle_Talking_Loop`, `Idle_No_Loop` | `Walk_Formal_Loop` ×0.85, upright, arm swing ×0.6 | Saltrow guild house |
| 3 | **Salt Porter** | Pan | M, 1.82, 22–35 | sleeves rolled; salt basket on shoulder (rigid) | `Walk_Carry_Loop`, `Consume`, `Yes` | `Walk_Carry_Loop` ×1.0 | pans → store, all day |
| 4 | **Boat-Caulker** | Pan | M, 1.74, 45–60 | tar-black hands/forearms mask | `Fixing_Kneeling`, `Push_Loop` | `Walk_Loop` ×0.9, wide stance, rolling sway | boats on the black beach |
| 5 | **Lantern-Keeper** (lookout) | Pan | F, 1.68, 65+ | orchil night cloak, cane | `Idle_Lantern_Loop` (night), `Sitting_Idle_Loop` (day); **`Idle_Rail_Call` when an Instrument comes within 80 m** | `Walk_Loop` ×0.75, stoop +10° | breakwater, 19:30–05:30 |
| 6 | **Pit Farmer** | Holds | F or M, 1.66–1.80, 30–50 | `ash` wool; mica goggles up; basket | `Farm_PlantSeed`, `Farm_Watering`, `Farm_Harvest` | `Walk_Loop` ×0.92 | crescent pits |
| 7 | **Tiller-Follower** (adolescent) | Holds | F or M, 0.90 scale, ~15 | lighter wraps; seed bag | `Idle_Rail_Loop` (on a crescent wall), `Farm_PlantSeed` | `Jog_Fwd_Loop` trailing a herd; `Walk_Loop` ×1.1 | behind Tiller herds |
| 8 | **Cochineal Picker** | Holds | F, 1.70, 20–35 | carmine-stained apron and gloves; headscarf | `PickUp_Table`, `Interact`, `Idle_Talking_Loop` | `Walk_Loop` ×1.0 | prickly-pear terraces |
| 9 | **Tube Smith** | Holds | M, 1.84, 35–50 | leather apron; burn-scar decal | `TreeChopping_Loop` (hammer prop), `Chest_Open` | `Walk_Loop` ×0.9, heavy, arm swing ×0.7 | lava-tube forge, Ninewalls |
| 10 | **Fog-Netter** (lookout) | Fogcatchers | F or M, 1.70–1.80, 20–40 | `fog` felt; net pole | **`Idle_Rail_Call`** (whistling across the ravine; also the Instrument warning), `Push_Loop`, `Farm_Watering` | `Walk_Loop` ×1.05, long stride, pole in hand | Fog Harp, net arrays |
| 11 | **Goat-Herd Vaulter** | Fogcatchers | M, 1.78, 18–28 | sheepskin vest; long pole | `Sitting_Idle_Loop`, `NinjaJump_Idle_Loop`, `Yes` | `Jog_Fwd_Loop` ×1.0 | ravine sides |
| 12 | **Field-Book Elder** | Fogcatchers | F, 1.64, 70+ | dark felt; hood; book prop | `Sitting_Talking_Loop`, `Idle_No_Loop`, `Idle_Talking_Loop` | `Walk_Loop` ×0.7, stoop +12°, cane | Mistfold archive |
| 13 | **Leveler** | antagonist | F or M, 1.70–1.84 | `level`: kaolin-whitened skin tint, vermilion/white banded sash, opaque lamp-housing mask, banded staff with a lamp | `Idle_Shield_Loop` (staff guard), `Idle_FoldArms_Loop` | `Walk_Formal_Loop` ×0.9, **stride locked to 0.80 m** (they pace distances) | Leveler Muster; ahead of Screeds on `screed.followLine` paths |

Named NPCs for the first hour: **Guild Matron Ansel** (archetype 2), **Tube Smith Oro** (9, gives
the gaff and Windwall), **Lantern-Keeper Mise** (5). Settlement growth (B graft): retuning the Fog
Harp brings water back to Mistfold, which adds 2 NPCs and a market day.

---

## 7. Enemies: **the Instruments**

### 7.1 Design rules (every generator follows them)

1. **A tool first:** the silhouette is explained by one survey or civil-engineering job in one sentence.
2. **No heads, jaws, tails, faces or eyes.** Sensors are lamp drums, level vials and lenses behind irises.
3. **Family mark:** at least one graduated element — vermilion `#D2452E` and staff-white `#F1EEE6`
   bands, or brass numerals (shared decal/trim atlas through `uv1`).
4. **Materials:** bone `#E6DCC8`, celadon `#A9C4B0` and oxblood `#6E2421` **glaze** (roughness
   0.15–0.30, the only glossy dielectric in the world) over bronze `#A07A3F`; verdigris `#4F8F7E` on
   worn edges; graphite `#2B2C30` joints. No exposed muscle, no cable sinews, no chrome, no blue glow.
5. **Mechanical locomotion; every knee in the sagittal plane** (no `gait.js` per-leg pole change).
6. **Honest weak points:** a level vial, a ram seal, a bearing, a firebox door, a float tank.
7. **R7 — environmental manipulation, never mind control.** No Instrument ever fights for, follows,
   carries or obeys the player. Benchmarks change *where* Instruments work; the Calibration Yard
   changes *how well* they measure. There is no Override, no ally state, no mount
   (`ai/override.js`, the OVERRIDE table and the `overridden` state are deleted in wave 0).
8. **Components come off as recognisable tools** and the loot is usable.
9. **Size follows job:** small instruments *measure*, medium *sample and mark*, large *correct*, the
   colossus *observes*.
10. **Sound:** chimes, ratchets, escapements, gyroscope whine, ceramic clinks, staff rattle. Never a roar.

Build path (proven, 0 kept-code lines): `tools/build/instruments/gen-<kind>.mjs` (hs kit: 1 hull
material + 1 sensor material, generator-labelled weights) → `liftExtras` (dequantise, labels, sensor
`noShadow`) → seeded autorig → `GaitController` → fold → socket snap. Fidelity pass mandatory before a
kind is judged: lathe-curved armour, shared decal/trim atlas, LOD1 at ~35 %.

### 7.2 Lamp grammar: shape, then motion, then colour (replaces `EYE_COLORS`)

| state | iris aperture | beam | colour | rhythm | min ΔE2000 to Horizon canon* |
|---|---|---|---|---|---|
| **calm** | 100 % | off | bone lamp `#F2EAD3` | steady | 24.7 |
| **wary** | 50 % | **on**, sweeping 0.5 Hz toward the stimulus | level-vial chartreuse `#B5E61D` | 1 Hz pulse | 27.8 |
| **hostile** | 20 % (pinhole) | **on, locked** on the target | cochineal magenta `#FF2D8C` | 4 Hz flicker | 26.6 |
| **dark** (blinded / Clouded / dead) | closed, cracked | off | `#3B3A36` | sputter, then out | 41.0 |

\*Measured against `#38c6ff` (calm), `#ffb31f` (wary), `#ff2413` (hostile), `#19ffd0` (override
teal) and `#9B6BFF` (Focus violet). Consecutive states: calm↔wary 25.1, wary↔hostile 83.1,
hostile↔dark 42.8. Hostile vs Brea's carmine fabric 23.5; hostile vs Cinder 38.7 (no "burning =
hostile" collision). Scanner colours are also ≥ 20 from canon (paper `#E2D3B0` 20.1, ink `#26343F`
33.8, cobalt `#2C4F8A` 26.7) and the scanner highlights (ink, cobalt) use none of the lamp colours (§9.7).

**Beams:** one `InstancedMesh` of additive cones (`depthWrite:false`) for **all** Instruments —
**1 draw**. Length = current sight range × weather scale; drawn only in wary/hostile and only when
fog density > 1.2 or at night. Lamp emissive ×2.5 with a core above the bloom threshold so lenses
read at noon; lamps never cast shadows.

### 7.3 Weak-point grammar (four kinds, one look each)

| kind | looks like | how you hit it | what happens |
|---|---|---|---|
| **Lamp** | glazed lens behind an iris, glowing in the state colour, always at the "working end" | any precise hit | **dark** for 6 s: perception off in that lamp's arc; a Plumb or Sonde darkened before it Flags you cannot raise the alarm |
| **Vial** | glass-windowed bronze vessel of glowing fluid, **shape-coded by element**: Cinder round flask, Brine hexagonal cell, Dust ribbed canister | Pry or precision cracks it | bursts: its element fills to 100 on the Instrument and within 3 m |
| **Tool** | unlit bronze working end: blade, drum, mortar, hook, bob, ram | **Pry** | tears off; **its linked attack is gone**; drops loot |
| **Joint** | graphite rings, seals and bearings | Brine seizes them; precision breaks seals | Seized or a leg buckle |

Size rule: each kind's primary weak point ≥ 0.25 m across, i.e. **≥ 5 px at 40 m** (Peg exempt: any
hit kills it). Lamps and vials ≥ 3:1 luminance against the hull at noon and in calima.

### 7.4 The roster

| # | name | family / role (role id) | size class | L × W × H (m) | tris / bones | locomotion | path / extension |
|---|---|---|---|---|---|---|---|
| 1 | **Peg** | measure / swarm (`swarm`) | small | 1.1 × 0.6 × 0.9 | ≤ 8 k / 14 | quadruped trot | kept |
| 2 | **Plumb** | measure / sentry (`sentry`) | small | 2.4 × 2.4 × 3.4 | ≤ 15 k / 18 | tripod (offsets 0, ⅓, ⅔) | kept; generator has a `scale` param |
| 3 | **Tiller** | measure / herd (`herd`) | medium | 4.5 × 1.8 × 2.7 | 33 k / 24 | hexapod, alternating tripod | **proven** |
| 4 | **Gauge** | measure / tide keeper, neutral (`keeper`) | medium | 3.2 × 2.6 × 5.5 | ≤ 35 k / 26 | stilt quadruped | kept |
| 5 | **Sickle** | warden / flanker (`flanker`) | medium | 3.6 × 1.4 × 1.7 | ≤ 30 k / 24 | quadruped, fast trot | kept; blades are part `update()` rotations |
| 6 | **Spindle** | warden / duelist (`duelist`) | medium | 2.0 × 2.0 × 3.8 | ≤ 30 k / 22 | biped stilts (Round-4 biped spec) | kept |
| 7 | **Davit** | correct / repair support (`support`) | medium | 4.0 × 2.4 × 4.2 | ≤ 35 k / 26 | hexapod; crane arms are part `update()` transforms | kept + un-tear (✂) |
| 8 | **Sonde** | measure / aerial spotter (`spotter`) | small flier | 4.5 × 2.5 × 3.0, 18 m tether | ≤ 15 k / 12 | **tethered** buoyant drift | TetherFlightController (2-day spike, ✂) |
| 9 | **Screed** | correct / heavy (`heavy`) | large | 6.5 × 3.6 × 3.0 | ≤ 60 k + LOD1 / 34 | hexapod, wave gait | kept |
| 10 | **Kiln** | correct / artillery (`artillery`) | large | 5.0 × 3.4 × 4.0 | ≤ 55 k + LOD1 / 30 | heavy quadruped | kept |
| 11 | **Dredge** | anchor works / ambusher (`ambusher`) | large serpentine | 12 × 1.6 × 1.4 | ≤ 60 k + LOD1 / ≤ 52 (14 legs × 3 + 7 segments + cutter + reel) | 7-segment legged train, 14 legs | follow-the-leader spine + burrow (✂) |
| 12 | **Transit** | observe / colossus (`colossus`) | colossal | 14 × 14 × 22 | ≤ 120 k + LOD1 40 k / ≤ 64 | tripod at Plumb topology | grey-box first; topple death |

Changes from Direction A: **Gyre removed** (rolling interceptor = HFW Rollerback echo, and roll is
outside GaitController); **Davit added** (B's "kill the healer first", built on the kept hexapod
path); **Sonde tethered** (the most constrained flight). Role ids never use
charger/burrower/grazer/stalker/watcher/apex/scout.

#### 1. PEG (small; the swarm that draws the lines)
- **Silhouette:** a milk-churn on four legs — a bone-glaze cylinder on its side, short bronze legs, a
  piston mallet on its back, a rack of vermilion/white pegs on its flank, one lamp at the front.
- **Behaviour:** swarms of 3–6 hammer **transect pegs** in straight lines between Plumbs. A live
  transect is a dashed line of glowing peg-heads (instanced, 1 draw); crossing one within 20 m of a
  Plumb raises it to wary. *The stealth language of the leeward biomes.*
- **Attacks:** Mallet (piston telegraph), **Peg Shot** (one peg: stagger), Swarm Rush (`lunge` ×n).
- **Weak point:** the lamp (any hit kills). **Component:** peg rack (Pry → "bronze pins", arrow parts).

#### 2. PLUMB (small; the sentry)
- **Silhouette:** a walking theodolite — three long staff legs banded vermilion/white meet at a bronze
  tripod head; a celadon lamp drum turns 360° on a short mast topped by a glowing **level vial**; a
  bronze **plumb bob** hangs on 1.2 m of cable (2-bone procedural pendulum).
- **Behaviour:** stands at survey stations on ridges and pan edges for 8–15 s readings; **paints the
  Datum Line** on anything in error; on sighting Brea it **Flags** her (a hairline sightline; every
  Instrument within 60 m knows her position for 8 s, 3 s with Guild Whites); chimes on alarm.
- **Attacks:** Pendulum (bob swings a 3 m arc: knockback), Bob Drop (2 m slam), Sightline (Flag).
- **Weak points:** the **level vial** (Joint-class; two hits → it can't find level and **topples**
  4 s, species `onDeathPose`-style topple, no `gait.js` change) and the lamp drum (Lamp).
- **Components:** lamp drum (Pry → no more Flagging), plumb bob (Pry → no melee; Counterweight Lance part).
- **De-risk role:** the same generator at `scale` 3× and 6.5× walks hull-hidden before the Transit exists.

#### 3. TILLER (medium; the herd — proven)
- **Silhouette:** a glazed boat-hull on six stilts, bronze gimbals with oxblood bands, theodolite drum
  at the front, seed hopper on top, auger at the rear.
- **Behaviour:** herds of 3–6 core the soil every few metres on one bearing; Holds farmers plant in
  the holes; on a Plumb chime the herd flashes lamps in sequence (a readable ripple) and flees in file.
- **Attacks:** Auger Jab (rear 120°, `sweep` rear), Hopper Burst (grit cloud: Clouded 1.5 s), Herd
  Trample (`charge` along the flee path).
- **Weak point:** drum lamp. **Components:** hopper (Pry → **seed glass**), auger (Pry → no rear
  attack; drops an auger bit).

#### 4. GAUGE (medium; the tide keeper, neutral)
- **Silhouette:** a lighthouse on stilts — squat bone-glaze float drum with a verdigris waterline band
  on four very long thin stilts; a graduated staff mast (0–6 m) with a sliding float ring; a sluice nozzle.
- **Behaviour:** runs the pans and the Glass on a **tide clock**, opening and closing sluices (the Pan
  Houses depend on it and resent it); neutral unless the pans are damaged or it is attacked; wades to
  1.2 m. Flooded ground is wet: louder footsteps.
- **Attacks:** Brine Jet (cone: knockback + Brine), Stilt Stab, Wade Away.
- **Weak points:** float-drum ballast tanks (Vial-class: puncture → lists, −40 % speed); 4 knee seals
  (Joint: break one and it falls). **Components:** brine pump, mast.

#### 5. SICKLE (medium; the flanker)
- **Silhouette:** a low oxblood sledge with twin scythes — flat wedge body on four raked-back legs, a
  rotating hub at the front carrying two curved bronze blades that scissor (part `update()`
  rotations, not bones), one slit lamp.
- **Behaviour:** packs of 2–3; built to cut brush from sightlines, now it cuts people; works the
  edges of the Holds, the pine belt and the Cloudline; circles at a 9–14 m standoff and feints.
- **Attacks:** Scissor Lunge (8 m dash), Clearcut (hub spins both blades 360°, 2.5 m), Brush Sweep.
- **Weak point:** the hub bearing (Joint), exposed during the Clearcut wind-up.
- **Components:** 2 blades (Pry one → lunge damage halved; both → a harmless ram), a coolant flask
  (Vial, explodes on Cinder).

#### 6. SPINDLE (medium; the duelist)
- **Silhouette:** a spinning top on stilts — two tall jointed legs carry a horizontal 2 m ceramic ring
  around a bronze hub; it holds a 3 m levelling staff as a lance.
- **Behaviour:** escorts Screeds and Kilns at 6–9 m; while the ring spins above a visible threshold it
  deflects arrows from the front; Brine slows the ring, Dust stops it.
- **Attacks:** Staff Thrust (9 m `lunge`), Ring Spin (3 s deflect), Hop Stomp (`slam`).
- **Weak point:** the hub bearing, exposed 2 s when the ring stops. **Components:** staff (Pry → no
  lunge), 3 ring segments.

#### 7. DAVIT (medium; repair support — "kill the healer first")
- **Silhouette:** a compact six-legged hull carrying two folding crane arms like a ship's davits, hook
  blocks on cables, and a **visible rack of 3 spare ceramic plates** on its back (the count reads).
- **Behaviour:** stays ~20 m behind the fight; walks to any Instrument with a torn tool and **re-seats
  it from its rack in 4 s** (un-tear, ✂). Bronze sparks while it works.
- **Attacks:** Hook Swing (6 m `sweep`), Hook Grab (pulls Brea 3 m; dodge breaks it).
- **Weak point:** winch drum (Tool, 0.6 m; Pry → no repairs, hooks drop). **Components:** the plate
  rack (each plate shot off = one fewer repair), hooks ×2, cab lamp.
- **Cut line:** if un-tear slips, the Davit restores 30 % armor to the target instead (no component reset).

#### 8. SONDE (small flier; the aerial spotter — tethered)
- **Silhouette:** a ceramic survey balloon the size of a cart: a lozenge envelope of thin bone-glaze
  tiles with oxblood seams, two ducted bronze fans, an open gondola with a lamp and a sounding weight
  on a cable, and a **banded 18 m tether** to an anchor post or to a walking Plumb. At 40 m the line is the read.
- **Locomotion:** **TetherFlightController** — a spring-pendulum on a sphere of radius = tether, wind
  drift from `windAt`, bank from lateral velocity (≤ 10°), dives as constrained arcs. No wings to animate.
- **Behaviour:** shadows herds over the Pans; at night drops flares that Flag; in calima drops low and
  hunts by sound.
- **Attacks:** Weight Drop (AoE), Flare (Flags), Dust Purge (downward cone).
- **Weak points:** the envelope (3 punctures → slow descent; Cinder burns it down), the tether (Tool:
  Pry/cut → it drifts downwind and crashes 25–40 m away), fans ×2 (a net fouls them → it sinks).
- **De-risk:** a 2-day timeboxed spike on a 6-bone stand-in, exits: within tether + 0.2 m, no NaN over
  10 min, a net foul grounds it ≤ 6 s, dispose flat. **Fallback:** a moored "mast balloon" that does not
  move (spotter role kept).

#### 9. SCREED (large; the eraser)
- **Silhouette:** a walking road-grader — wide, low oxblood-and-bone hull on six short heavy legs; a
  3.6 m bronze moldboard blade on two hydraulic rams in front; ripper tines behind; a small cab tower
  with a lamp drum.
- **Behaviour:** walks to "error" (walls, terraces, huts) and cuts it down to the painted Datum Line,
  leaving **dead-straight scars**; aggressive when blocked; correction days are scripted events.
  **Charging into a basalt column cluster, a crescent wall or the Organ Shelf stuns it 3 s** (B graft);
  it cannot turn mid-charge.
- **Attacks:** Blade Charge (straight 25 m rush with a bow-wave of lapilli: Clouded + knockback),
  Spoil Throw (12 m cone), Ripper Sweep (rear), Grade Stomp.
- **Weak points:** 2 ram seals (Joint; break both → blade drops: no more charging), cab lamp.
- **Components:** blade (Pry once the rams are gone), ripper, spoil hopper. The Bronze Gaff is cast from its ram.

#### 10. KILN (large; the artillery)
- **Silhouette:** a walking pottery kiln — oxblood beehive dome of brick-like ceramic on four stumpy
  legs, a tall tilting chimney mortar, a glowing firebox door, ceramic canisters on the flanks.
- **Behaviour:** taps geothermal wellheads in the Malpaís by plugging in a hose and standing still for
  minutes (a stealth window); gives artillery support to Screeds from 25–60 m.
- **Attacks:** Cinder Mortar (3-shell volleys, 4 m fire pools), Glaze Spray (6 m cone: Charred + slow),
  Chimney Swing, Vent Surge (steam ring while tapped).
- **Weak point:** the firebox door — **Brine causes thermal shock: ×3 damage and a stagger**.
- **Components:** 4 canisters (Vials, explode on Cinder), chimney (Pry → no mortar), vent hose.

#### 11. DREDGE (large, serpentine; the ambusher)
- **Silhouette:** a cable-laying train — seven bone-glaze drum segments coupled by bronze universal
  joints, each on a pair of short legs (14 legs); a rotating cutter head leads, a cable reel trails.
- **Locomotion:** a **follow-the-leader spine** (segment roots replay the leader's path history) with
  legs on the kept GaitController per segment; submerges in black sand and surf (root −1.5 m, sand
  plume, GaitController paused; corpse grounding re-run on surfacing).
- **Behaviour:** lays and repairs the cables to the Pinned Cliff anchors; ambushes at the waterline.
- **Attacks:** Erupt (telegraphed by ring ripples, 1.2 s to dodge), Coil Sweep (body whips 180°),
  Cutter Drag (pulls her in), Cable Lash.
- **Weak points:** 6 couplings (Joint; break 2 and the segments behind detach and go inert), the cutter head.
- **Component:** cable reel (Pry → bronze cable).
- **Cut line:** 3-segment rigid train (no coil sweep, no burrow), or ship 11 kinds.

#### 12. TRANSIT (colossal; the island's theodolite; the boss)
- **Silhouette:** three 20 m **solid graduated-staff legs** (vermilion/white, brass numerals) splayed
  to a bronze tripod head; on top a house-sized celadon instrument drum with a 9 m telescope and a ring
  of five lamps; survey pennants; 3–4 Plumbs hang underneath, ready to drop. **No lattice anywhere
  below 6 m** (Round-4 M1 lesson).
- **Locomotion:** tripod, offsets ⅓, ~8 m strides, very slow; absolute foot-continuity bar
  (A45c ≤ 0.12 m/frame), not a leg-fraction bar.
- **Behaviour:** once a year it walks **the island's baseline** from the caldera rim to the coast,
  re-observing; anything on its sightline is queued for correction.
- **The fight:** (1) **Legs** — shoot the 9 knee seals; break all three on one leg to buckle it;
  melee targets are the three **foot shoes** at ground level (A103 reach ≤ 0.15 m). (2) **Drum** —
  the drum tilts into lance and arrow reach; hit the five-lamp ring while it drops Plumbs. (3)
  **Re-level** — it tries to re-plant; pots and nets on the foot.
- **Attacks:** Leg Stamp (8 m tremor ring), Sightline Sweep (120° beam that Flags instantly and
  calls a Screed; the Mirror Windwall reflects it), Plumb Drop, Cable Lash.
- **Death:** a topple about the planted leg, graded as a corpse (A47c). **Never climbed.**
- **De-risk (C graft):** a 30 k-tri grey box through the full seam must pass A45c, A46, A48, A21 and
  A103 **before** any detailing; Plumb-generator scale tests before that.
- **Key-art rule:** the Transit never appears as a long-legged silhouette on a low-sun skyline in
  title, menu, loading or marketing frames.

### 7.5 Build order

| wave | kinds | why |
|---|---|---|
| W1 | **Tiller, Plumb, Peg** | herd, sentry, swarm; tripod + hexapod + quadruped on the kept path; Plumb de-risks the Transit; Peg is needed at 0:10 of the first hour |
| W2 | **Sickle, Screed, Gauge** | predator, heavy, neutral keeper; the first-hour fight at Ninewalls |
| W3 | **Spindle, Kiln, Davit, Sonde** | duelist, artillery, support, flier (after its spike) |
| W4 | **Dredge, Transit** | the two extension kinds (follow-the-leader; colossal grey box first) |

### 7.6 Where they live

| biome | residents | events |
|---|---|---|
| The Pans | Peg swarms, Plumbs at pan edges, Gauges in the Glass; a Sonde moored at the Sounding Ring | Gauge tide flooding; Dredge at the surf (late) |
| Crescent Holds | Tiller herds with a Plumb escort; Sickle packs at the margins | **Screed correction days**, Levelers walking ahead |
| Malpaís | Kilns at the wellheads with Spindle escorts; Davit behind; Pegs | Kiln Yard assault |
| Cloudline | Sondes in the fog; Spindles; Sickles clearing brush | fog-bank hunts |
| Drowned Flank | Dredge; Plumbs on the crest | Levelers guiding Screeds below the Pinned Cliff |
| Caldera | the Calibration Yard queue (every kind) | **the Transit's baseline walk** |

Escorts (`ECOSYSTEM`): Plumb → Tiller; Spindle → Screed, Kiln; Davit → any large; Peg → Plumb;
Sonde → Plumb (moving anchor) or anchor post.

---

## 8. The map: **Orchil**

### 8.1 Size and frame

| | value |
|---|---|
| world square | **1024 m** (`WORLD_SIZE` 720 → 1024); fallbacks **860 m (×0.84)** and **720 m (×0.70)** — `src/world/island/sites.js` is authored in metres from one centre, so the fallback is one number |
| terrain mesh | span 1.3 × 1024 = 1,331 m at **MESH_SEGS 686 → 1.94 m nodes** (today's density), ~471 k vertices — measured in wave 0 before commitment |
| land | the island ellipse ≈ 950 × 800 m incl. shallows; **≈ 0.55 km² of land** (1.6× today's 0.34 km² bowl); summit ≈ 245 m on the NE caldera rim |
| boundary | the sea: walkable water is ≤ 1.2 m deep (wading); at the 1.1 m depth contour a ring of blocking colliders ("the current") stops her. **No swim state this round** |
| playable radius | **`PLAY_RADIUS` ≈ 490 m** at 1024 m (×0.84 / ×0.70 at the fallbacks), exported by `src/world/island/extent.js`. Every kept clamp reads it as a named offset (each offset = today's literal − 330): the player clamp (`player.js` `WORLD_R` = radius, `EDGE_SOFT` = radius − 18), the navgrid (`nav.js` `R` = radius + 2, `OUTER` = radius − 6, grid N ≈ 491 at 2 m cells), the Instrument limits (`machine.js` radius − 12, route clamp and search ring radius − 20, doctrine rim − 34, squad rim − 45) and the gather limit (radius − 15). The farthest site, the Sounding Ring, is at 472 m. Gate `A-reach-all-sites` |
| rest point | `REST` in `src/world/island/sites.js` is the **only** spawn / respawn / camp constant (it replaces 10 copies of the old (18, 26) / (22, 30) camp); the Instrument no-spawn ring is centred on it. Gate `A-single-rest` |
| skirt | ocean plane (1 draw) + two masked sister islands on the horizon (one with a NW stratovolcano) |
| frame | +x = east, −z = north (as `MASSIFS`); bible coordinates are given as (E, N); engine z = −N |
| masks | 512² biome mask (2 m/texel) + 64² hand-edited biome-id control map |

### 8.2 Layout (1 char = 32 m E–W, 1 row = 64 m N–S; generated from `sites.js` at 1024 m)

```
         E -512             -256            0             +256        +512
N  +512  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
N  +448  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
N  +384  ~~~~~~~~~~~~~~^^^~~~~~~~~~~~~~~~
N  +320  ~~~~~~~#######^^^^4^^^^M~~~~~~~~
N  +256  ~~~~##########^^^^^^^F^^^^~~~~~~
N  +192  ~~~####E###5#oooooooD^^^^^^^~~~~
N  +128  ~#########P#ooQoooooooxxxxxxx~~~
N   +64  ~###########o6ooYoooooxxxxxxxx~~
N    +0  ~###B#########oooooovxK/xxxxxx~~
N   -64  ~#############vvvvvvv///Cxxxxx~~
N  -128  ~===L=========vvvvvJ//xxHxxxxx~~
N  -192  ~~=====S======vNv///vxxxxxxxx~~~
N  -256  ~~~~==========v///2vvxxxxxx~~~~~
N  -320  ~~~~~R===O1==///vvvvvxxxx~~~~~~~
N  -384  ~~~~~~~~~~b==/vvvvvvv~~~~~~~~~~~
N  -448  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

Terrain: `~` sea · `=` The Pans · `v` Crescent Holds · `x` Malpaís · `^` Cloudline · `#` Drowned
Flank · `o` Caldera · `/` the Screed Scar.
Sites: `S` Saltrow · `N` Ninewalls · `M` Mistfold · `L` the Glass · `O` Organ Shelf · `R` Sounding
Ring · `b` black-sand beach · `J` Jameo · `K` Kiln Yards · `C` Rust Cone (+T3) · `H` hornito field ·
`F` Fog Harp · `P` Pinned Cliff · `E` Leveler Muster · `B` the Boilers · `Y` Calibration Yard · `D`
the Fundamental · `Q` Roques · `1 2 4 5 6` trig pillars T1, T2, T4, T5, T6.

### 8.3 Biomes (fidelity order: the Pans first; the rest only after `V-biome-vista-pans` passes)

| biome | elevation | ground layers | foliage (solid vertex-colour meshes, no alpha) | landmarks | light |
|---|---|---|---|---|---|
| **The Pans** (SW) | 0–8 m | **black sand** (proc., proven), **salt crust** (proc., proven), **basalt** (CC0 scan, proven), wet sand (mask) | marram (96 tris), glasswort (36), violet sea-lavender (60) | Sounding Ring (proven), Organ Shelf (11 hex clusters, proven), 3 wind pumps, red crater over the Glass | high key, −0.3 EV, salt glare, sea haze `#CFD8DE` |
| **Crescent Holds** (S) | 20–90 m | **lapilli** (proc.), sand drifts | vines in pits (80), fig (400), prickly pear with white cochineal flecks (160), tabaiba (150), cardón (180) | Ninewalls dragon tree (2.5 k, unique), the Jameo skylight, the **Screed Scar** (25 m wide, straight, 480 m, berms both sides) | warm, dusty; calima most often |
| **Malpaís** (SE) | 20–145 m | **lava rock** (CC0 scan), **cinder** (proc., 512²) | lichen crust tint, rare tabaiba | the **Kiln Yards** (ruined geothermal plant: two ceramic-tiled cooling-tower stubs, pipe racks, glowing wellheads), Rust Cone (145 m cinder cone), hornito field (3–6 m, instanced, steaming) | hard contrast; man-made wellhead glow at dusk; **no lava** |
| **Cloudline** (N–NE) | 60–215 m | forest floor (CC0 scan, 512²), wet-tinted rock | laurel (600 + impostor), tree heather (300), ferns; moss as vertex green on north normals | the **Fog Harp** (60 m pre-Datum fog-collector frame across the main barranco, humming bronze cables); Mistfold below it | low contrast, fog ×3 below 150 m, dappled canopy light (no radial spoke shafts) |
| **Drowned Flank** (W–NW) | 0–125 m | basalt scan + black sand (shared) | wind-bent sabinas leaning SW (500), sparse grass | the **Pinned Cliff**: 12 bronze anchor heads (3 m discs) bolted into a stratified wall, cables into the sea; the **Boilers** sea caves | the golden-hour stage on the west-facing wall |
| **Caldera** (centre) | 160–245 m | **pumice** (proc., 512²) | Canarian pine (500; one fire-scarred with green shoots), retama (150), **tajinaste rojo** spires (2.5 m red cones, 220 tris) | **the Fundamental** (14 m bone-glaze obelisk + bronze observatory dome), the **Calibration Yard**, the Roques (15–25 m pillars) | thin clear air, sky `#2F6FB8`, **the sea of clouds below** |

**Ground-layer budget (committed, wave 1):** 5 layers at 1024² (black sand, salt crust, basalt,
lapilli, lava rock) + 5 at 512² (forest floor, cinder, pumice, wet pan mud, beach pebbles); 2 RGBA
WebP per layer; ≤ 3 layers blended per pixel; triplanar only on slopes. ≈ 7.5 MB download, ≈ 70 MB
VRAM uncompressed.

### 8.4 Site coordinates (`src/world/island/sites.js`, metres from centre, 1024 m)

| site | (E, N) | height | | site | (E, N) | height |
|---|---|---|---|---|---|---|
| Saltrow | (−267, −229) | 3 | | Jameo (tube skylight) | (112, −160) | 103 |
| salt pans | (−320, −293) | 1 | | Kiln Yards | (219, −27) | 142 |
| the Glass | (−384, −176) | 0.5 | | Rust Cone (+T3) | (283, −101) | 145 |
| Organ Shelf | (−219, −341) | 1 | | hornito field | (272, −187) | 16 |
| Sounding Ring | (−347, −320) | 0.5 | | Mistfold | (240, 261) | 66 |
| black-sand beach | (−187, −411) | 0.5 | | Fog Harp | (176, 229) | 92 |
| Ninewalls | (−11, −213) | 71 | | Pinned Cliff | (−183, 103) | 44 |
| Screed Scar | (251, −43) → (−91, −384) | — | | Leveler Muster | (−283, 160) | 5 |
| the Boilers | (−368, −59) | 2 | | Calibration Yard | (16, 37) | 222 |
| Roques | (−43, 101) | 207 | | **the Fundamental** | (128, 144) | 233 |

Trig pillars: **T1** Organ Shelf (−187, −357) · **T2** Ninewalls Rise (75, −267) · **T3** Rust Cone
(283, −101) · **T4** Cloudline Ridge (64, 320) · **T5** Flank Crest (−133, 165) · **T6** West Rim
(−75, 48). Sight pairs: T1–T2, T1–T6, T2–T3, T2–T6, T3–T4, T3–T6, T4–T5, T4–T6, T5–T6, T5–T1 (rays
must be unobstructed — gated).

**Landmark per bearing (from Calibration Yard):** N Fog Harp / T4 · NE the Fundamental · E Kiln
Yards cooling towers · SE Rust Cone · S Ninewalls dragon tree + Scar · SW Sounding Ring + wind pumps ·
W Pinned Cliff anchors · NW Leveler Muster tripods + the sister-isle stratovolcano.

### 8.5 Interactable sites

| site | count | interaction | system |
|---|---|---|---|
| **Trig Pillars** | 6 | climb the steps of a 4 m white cylinder (`ClimbUp_1m`), sight **two** other pillars with the alidade → the triangle opens on the map. Replaces tower climbing | interactables + alidade overlay + map |
| **Benchmarks** | 12 | **re-survey:** hold 15 s while the alidade takes 3 bearings as Instruments come to look; the region becomes true ground (`ctx.datum.setTrue(region)`), so Screeds stop choosing targets there (they read `ctx.datum.regionTrue`) and its Datum Line vanishes; a fast-travel node | interactables, `ctx.datum` (world-ground), Screed targeting (instruments-b) |
| **Field Books** | 24 | lore: survey notes, sketches, an 800-year conversation | items (renamed datapoints) |
| **Salt Pans** | 1 field | raking (`Farm_Harvest`) earns **salt** (currency); the Gauge's tide decides when | activities |
| **Kiln Yards** | 1 | quench 4 wellheads with Brine Pots; the yard shuts down | places + machine-ai |
| **Fog Harp** | 1 | retune 5 cable winches to the whistle pattern the Fog-Netters teach; water returns to Mistfold, which grows | interactables + settlement hook |
| **Lava tubes** | 2 | Ninewalls tube → the Jameo skylight and its blind-crab pool; a Malpaís tube with a dormant Peg nest | places (built as in §8.7) |
| **Calibration Yard** | 1 | late game: move 4 target boards to mis-mark the baseline; every Instrument in the region measures badly for the act (perception −25 %, aim spread up) | places + ai tables |
| **Guild Notices** | 2 (Saltrow, Ninewalls) | **untimed** bounties ("bring back an unbroken Sickle blade") — no timed trials anywhere | progression |
| **Salt caches** | 8 | buried crates of salt and ammo | gather |
| dynamic | — | Scar defence, crescent-wall rebuild (`Walk_Carry_Loop`), shipwreck salvage | activities |

### 8.6 Settlements

- **Saltrow** (Pan Houses; ~24 buildings; 8–10 NPCs): whitewashed cubes, flat roofs, orchil-violet
  wooden balconies, three wind pumps lifting seawater into the pans, salt cones, a boat ramp on black
  sand, a guild house with a brass bell. Brea's house sits at the edge of the pans. **Spawn / rest
  point** = Brea's cistern (the single camp constant, `src/world/island/sites.js: REST`).
- **Ninewalls** (Crescent Holds; ~16 dwellings; 6–8 NPCs): houses sunk into lapilli, pumice-and-lime
  roofs, the **lava-tube mouth** as hall and forge, the dragon tree at the centre, nine concentric
  crescent walls facing NE.
- **Mistfold** (Fogcatchers; ~12 round huts; 5–6 NPCs, +2 after the Fog Harp): in the barranco under
  the Harp; net-fed troughs, goat folds, ladders, **cable baskets** across the ravine.
- **Minor sites:** the Leveler Muster, a goatherd fold, a fishing hut, the Malpaís tube shelter.
- **How they are built:** a modular kit per settlement (`tools/build/settlements/**` →
  `public/models/settlements/**`): wall, roof, balcony, door, stair, salt cone, pump, net frame and hut
  modules, **instanced per material**. Budget per settlement: **≤ 12 draws including casters, ≤ 150 k
  triangles, ≤ 1.2 MB**; colliders registered per module (`A61-settlement-colliders`); load and unload clean (`A-settlement-dispose`); draws gated by `A-settlement-draws`.
- **Swim / tide:** the Glass and the harbour are wading depth only; the **tide** (Gauge clock) is a
  costed 1.5-day extension with a static fallback (pans flooded by a scripted Gauge event only).

### 8.7 Traversal (no mounts, gliders, grapples, swimming or pole-vault this round)

| feature | where | how |
|---|---|---|
| ledge climb | crescent walls, **hex basalt columns as natural stairs**, trig pillars, terrace edges | UAL2 `ClimbUp_1m`; the procedural mantle stays; hero-body wave 0 (`A-climb-1m`) |
| cinder and scree sliding | Rust Cone, inner caldera walls, dune faces > 28° on cinder/scree surfaces | UAL2 `Slide_Start/Loop/Exit`; `player.mods.slideDegBySurface` (cinder 28°, other ground the kept 50°); hero-body wave 0 (`A-slide`) |
| cable baskets | Mistfold's barrancos | `player.ride(path, clip)` + `Sitting_Idle_Loop`; settlements wave 4 (`A-basket`); ✂ ladders |
| lava tubes and sea caves | Ninewalls → Jameo; Malpaís tube; the Boilers | the heightfield never gets holes: world-ground carves a **trench** along the tube polyline (in `sites.js`), and world-props lays **overhang shells** (instanced basalt vault segments) over it. The shells are registered as blocking + occluding colliders; the camera treats them as occluders (`A-tube-camera`, `A-tube-colliders`) |
| ash pits | the Holds | **instanced pit-cups** (raised rim 0.4 m, dark lapilli centre, concave normal map) + crescent walls on the NE side — never stamped into the 1.94 m heightfield |

### 8.8 The Datum Line (the world-scale signature)

Plumbs paint a **survey-vermilion `#D2452E` band 0.25 m tall** on anything in error, at the height the
ground is meant to be — on village walls, terraces, rock and huts. It is the cut height: everything
above the line is what a Screed will remove. Re-surveying a benchmark erases the lines in its region.

- One shared shader chunk (chained like `csmSetupMaterial`) on terrain, rock and prop materials;
  `uDatum[8]` region heights + active flags; spray-paint noise breaks, drips at the lower edge,
  occluded by foreground, distance fade to 0 by 250 m; one extra noise read per pixel.
- Instruments do not receive it (they carry their own bands).
- Gates: `A-datum-line` (pixel probe + erase on re-survey) and `V-datum-line` (reads as in-world paint,
  judged against licence-clean survey-paint reference photos — not a UI overlay).

### 8.9 The first hour

| time | beat | teaches | content (wave) |
|---|---|---|---|
| 0:00 | 07:00 trade-clear in **Saltrow**: rake salt with Guild Matron Ansel | movement, interact, salt as money | Saltrow NPCs (W2) |
| 0:05 | a **Gauge** floods the pans at the wrong tide; raise the alidade: "GAUGE · SLUICE 3 · TIDE 0.4 m" | Sighting | Gauge (W2; a static scripted Gauge until then) |
| 0:10 | black beach: **Pegs** hammering a transect through the pans; bow tutorial on Pegs; cross the dashed line unseen or get Flagged | bow, transects, Flagged | Peg (W1) |
| 0:18 | climb **T1** on the Organ Shelf; sight T2 and T6; the first triangle opens; the Sounding Ring, the Scar and the caldera rim on the horizon | triangulation, map | Organ Shelf, Ring, T1 (W1) |
| 0:25 | a **Tiller herd** crosses the Holds with Ninewalls youths trailing it; a **Plumb** guards it: sneak past, shoot its level vial, Pry the bob | weak points, Pry, topple | Tiller + Plumb (W1); youths (settlements W2) |
| 0:35 | **a Screed walks on Ninewalls' crescent walls**, the Datum Line painted on the walls at its cut height; Tube Smith Oro gives the gaff and Windwall; fight it with lance and pots while a **Sickle** pack flanks; lure the Screed into a crescent wall for a stun | heavy fight, melee, Windwall, self-stun | Screed + Sickle (W2) |
| 0:45 | follow the Scar's straight line to **Benchmark 1**; re-survey under pressure; Ninewalls becomes true ground, its Datum Line vanishes, the Screeds stand down; the premise is revealed | benchmarks | sites (W1) + progression (W3) |
| 0:55 | **calima** rolls in at noon; cross to the Malpaís edge under the dust (Instruments half-blind); below, the Kiln Yards' wellheads glow; far off, through ochre haze, the Transit's pale graduated legs move along the caldera rim — **at noon, through dust, never against a low sun** | weather stealth; the hook | calima (W1); Kiln Yards + Malpaís ground (W3); Transit (W4; until then the Plumb generator at `scale` 6.5 walks the rim) |

Guild Notice from Saltrow (untimed) and the moored Sonde over the Glass are the "seen, not fought"
promises for hour 2.

**Starting loadout.** Raker's Whites (Pan Whites I), the archer's crescent bracer, the Alidade, the
Sabina Bow with 12 Reed + 6 Barbed arrows, the Shepherd's Lance (stowed), 2 fog-water gourds, salt ×20.
At 0:35 Tube Smith Oro adds the Boat Gaff, the Pine Windwall (it replaces the bracer), 2 Brine Pots and
1 Cinder Pot. The net comes in hour 2 (fishing hut).

**Tutorial cards** (Plex, field-book paper; `A71e`), in order:

| beat | cards |
|---|---|
| 0:00 | Move · Sprint (Shift) · Interact (E): rake the pan |
| 0:05 | Sighting (V): raise the Alidade; read a mark |
| 0:10 | Bow: RMB draw, LMB loose · Barbed arrows Pry · Transects: crossing a live peg line near a Plumb gets you Flagged · Steady: hold Shift while aiming |
| 0:18 | Climb (E at a ledge) · Triangulate: from a pillar, sight two others |
| 0:25 | Weak points: the level vial · Pry the bob · Undercut (E behind an unaware Instrument) |
| 0:35 | Lance: LMB light, hold for heavy · Windwall: RMB guard, parry by timing, X to plant · Pots: F tap to lob, hold to cast |
| 0:45 | Benchmarks: hold E for 15 s to re-survey |
| 0:55 | Calima: Instruments see half as far |

**Walked leg.** `A-first-hour` may teleport between beats, but the leg **REST → black-sand beach**
(≈ 200 m in a straight line, ≈ 230 m on the navgrid) is walked on nav by input alone, with no teleport.

**Fallback beat text if a ✂ extension is cut** (the beat still plays):

| cut | beat | fallback |
|---|---|---|
| E19 tide | 0:05 | the static scripted Gauge opens Sluice 3 when Brea arrives; the Sighting card text is unchanged |
| E20 Datum Line paint | 0:35, 0:45 | the cut height is shown by Peg stakes with vermilion caps driven along the walls; re-survey knocks the stakes flat, and the Screeds stand down |
| E16 Windwall plant | 0:35 | the plant card is dropped; guard and parry stay |
| adolescent variant (`V-npc-builds`) | 0:25 | "Ninewalls farmers trailing it" (adult Pit Farmers with seed bags) |
| E22 Sonde flight | hour-2 promise | the moored mast balloon over the Glass |
| Transit not yet built (W3 run) | 0:55 | the Plumb generator at `scale` 6.5 walks the rim (`A-first-hour` provisional) |

### 8.10 Fauna (replaces Boar, Fox, Ridge Grouse, Ridge Goat and Scrub Hare in `src/world/fauna.js`)

| animal | biomes | behaviour | loot |
|---|---|---|---|
| **feral goat** | Cloudline, Drowned Flank, Caldera | grazes in groups of 3–6 on slopes; bolts uphill | hide, horn |
| **rabbit** | Crescent Holds, Caldera | darts between crescent walls and retama | meat |
| **giant lizard** (*Gallotia*-like) | Malpaís, Crescent Holds | basks on warm rock; slow, freezes when approached | scale |
| **shearwater** | Drowned Flank cliffs, the Pans at dusk | wheeling flocks; calls at dusk (audio) | feather (fletching) |
| **gull** | the Pans, black-sand beach | stands on salt cones and boats; lifts off in a ripple | feather |
| **blind crab** | the Jameo pool | white specks on dark water; ambient only, not huntable | — |

Names are lint-clean (no "Ridge"). Built with the kept fauna system and its dispose path; gate
`A-fauna-biomes` (world-props, wave 3).

---

## 9. Art direction

### 9.1 Palette

| group | swatches |
|---|---|
| **Land (black and white)** | lapilli `#1C1B1E` · black sand dry `#2A2826` / wet `#151416` · salt crust `#EDEAE2` · basalt `#3A3A3F` · cinder `#8E3B23` · pumice `#CFC6B4` · calima ochre `#C98B4E` |
| **Water** | Atlantic deep `#1F4E66` · the Glass emerald `#2F8F6F` · evaporating brine pink `#D9B8B0` · surf white on black sand |
| **Vegetation** | laurel `#3E5B3A` · felt moss `#56603F` · sea-lavender violet · tajinaste red · fig and vine greens |
| **People carry colour** | Orchil Violet `#6B3F73` · Orchil Deep `#5A2E66` · Cochineal Carmine `#A3213A` · Brass `#B08A45` · Undyed Linen `#D9CFBA` |
| **Instruments** | bone `#E6DCC8` · celadon `#A9C4B0` · oxblood `#6E2421` · bronze `#A07A3F` · verdigris `#4F8F7E` · graphite `#2B2C30` · survey vermilion `#D2452E` on staff white `#F1EEE6` |
| **Lamps** | calm `#F2EAD3` · wary `#B5E61D` · hostile `#FF2D8C` · dark `#3B3A36` |
| **Elements** | Cinder `#FF7A1A` · Brine `#BDE6E3` · Dust `#C98B4E` |
| **Brand / UI** | spark `#DA7756` (logo and calima sun only — never a lamp or scanner colour; it is ΔE 13 from Horizon red) · UI ink `#26343F` · field-book paper `#E2D3B0` · cobalt ink `#2C4F8A` · scrim `rgba(28,27,30,.72)` |

Rules: the land is black and white; **the people carry colour**; the Instruments are glaze on bronze
with one loud family colour (vermilion); green belongs to the north. Banned: orange-red-on-brown
"tribal" combinations, cyan-blue holograms, teal UI, violet scanner washes.

### 9.2 Material rules: grounded stylised PBR

Physically based response, simplified hand-shaped forms, no outlines or cel shading, no
`KHR_materials_transmission`. Albedo 0.03–0.85 linear.

| surface | albedo | roughness | metal | notes |
|---|---|---|---|---|
| black sand dry / wet | `#1C1B1E`–`#2A2826` / `#151416` | 0.88–0.95 / 0.25–0.40 | 0 | wet from the shoreline mask |
| salt crust | `#EDEAE2` | 0.55–0.75 | 0 | clamp at 0.85; procedural polygon cracks |
| basalt, lava rock (scans) | scan | 0.75–0.92 | 0 | triplanar on slopes only |
| lapilli / cinder / pumice | `#22201E` / `#8E3B23` / `#CFC6B4` | 0.85–0.95 | 0 | |
| foliage | per species | 0.65–0.85 | 0 | back-light tint, no alpha |
| skin | ref `#8A5A3C` | 0.45–0.60 | 0 | |
| linen / felt / palm | `#D9CFBA` / `#56603F` / — | 0.85–1.0 | 0 | |
| leather | — | 0.55–0.75 | 0 | |
| brass (people) | `#B08A45` | 0.30–0.45 | 1 | the only bright metal people own |
| **glaze (Instruments, Glaze Plate)** | bone / celadon / oxblood | **0.15–0.30** | 0 | the only glossy dielectric; crazing on the decal atlas |
| bronze / verdigris | `#A07A3F` / `#4F8F7E` | 0.35–0.55 / 0.70–0.85 | 1 / 0.2 | verdigris on edges via the `edge` attribute |
| obsidian | `#0E0D10` | 0.05–0.10 | 0 | blades and arrowheads only |
| lamp glass | state colour | — | — | emissive ×2.5, `noShadow` |

### 9.3 Lighting by biome (driven by `biomeWeights` at the camera)

| biome | fog | density | exposure | bloom threshold | mood |
|---|---|---|---|---|---|
| The Pans | `#CFD8DE` | ×1.0 | −0.3 EV | lower (salt glare) | bleached, maritime |
| Crescent Holds | `#D9C3A2` | ×1.3 | 0 | normal | warm, dusty |
| Malpaís | `#B9A08C` | ×1.1 | +0.1 | normal | hard, hot; wellhead glow at dusk |
| Cloudline | `#8E9A8C` | ×3 below 150 m | +0.2 | higher | soft, green, dripping |
| Drowned Flank | `#C7CDD2` | ×1.2 (spray) | 0 | normal | golden hour on the wall |
| Caldera | `#BFD0E6` | ×0.6 | −0.1 | normal | crisp, high, the cloud sea below |
| *calima (any)* | `#C98B4E` | ×4 | +0.2 | low; the disc blooms | ochre, flat, hushed |

### 9.4 Sky

Trade-wind stratocumulus, low and flat-bottomed, drifting SW. The cloud sea is the **height-fog term
on the windward side** (no transparent planes, no overdraw). Calima replaces the gradient with ochre
and draws the sun as a soft coral disc `#F2A27E`. Night: dense stars, moonlit salt. No radial
god-ray spokes (a Round-3 HZD-sky tell).

### 9.5 Water

The Atlantic `#1F4E66` with a **white surf band on black sand** from a shoreline-distance term in the
single sea shader (1 draw) — the island's signature image. The Glass: emerald `#2F8F6F`, still,
reflective, wading depth. Pans: shallow brine, pink where it evaporates. **No rivers**: `RiverWater`
comes out; only small Cloudline waterfalls as ribbon pieces (kept `water.js` solver).

### 9.6 Foliage

Solid vertex-coloured meshes, no alpha overdraw, one draw per kind; everything leans and sways away
from bearing 045. Use the island's **unusual silhouettes** (candelabra spurge, flat pads, spires,
wind-flagged junipers, the dragon tree) instead of generic trees. Hero trees: the one dragon tree;
one fire-scarred pine with green shoots.

### 9.7 UI language: the field book

- **Fonts (all SIL OFL-1.1, woff2 subsets ≈ 0.4 MB, each with its `OFL.txt`):** **Bodoni Moda**
  (display, wordmark, place names — italic on the map, the hydrographic convention), **IBM Plex Sans
  Condensed** 500/600 (HUD, menus), **IBM Plex Mono** 500 (numerals, bearings, damage numbers).
  **Removed:** Julius Sans One, Rajdhani, Chakra Petch, Michroma, Orbitron (chosen in Round 3
  *because* they read as Horizon).
- **Surfaces:** field-book paper `#E2D3B0` at 92 % over the scrim; hairline 1 px rules; right angles;
  **no hexagons, no pills, no smoked-glass cut corners**. Motif: the graduated tick.
- **Health:** a horizontal **levelling staff**: alternating survey-vermilion and paper graduations at
  10 %; damage eats from the right. Stamina is a hairline beneath.
- **Compass:** a **theodolite circle strip** 000–359; ticks every 5°, numerals every 30° (Plex Mono),
  a 3-digit bearing readout. Markers: settlement ■, site ●, benchmark ▲ (broad arrow), Instrument ◆
  in its lamp-state colour **and iris shape**; Flagged = a vermilion pennant over Brea's marker.
- **Instrument card:** `TILLER · SOIL CORE · TRANSECT 14` in Plex Sans Condensed caps with a graduated bar.
- **Sighting (alidade overlay):** a sepia paper vignette ≤ 20 % (world keeps its colour), a crosshair
  with **stadia hairlines**, bearing and distance readouts, weak points as **cobalt-ink rings**,
  components as dashed ink outlines with leader lines, transects as white dashes on the ground. Not
  violet, not teal, not holographic.
- **Map:** field-book paper with hand-inked contours every 5 m and depth soundings offshore; only the
  coastline until triangles are revealed; place names in Bodoni italic; the Datum Line regions in vermilion.
- **Menus:** field-book pages with a red margin rule; entries numbered as stations (STN 01).
- **Damage numbers:** Plex Mono — paper-white for Blunt, cobalt-on-paper chip for weak points,
  carmine for Pry.
- **Steady:** a hairline breath meter under the reticle that drains over 4 s; no screen veil, no
  desaturation, no time slow.
- **Tokens:** `--hzc-*` → `--cal-*`; storage keys `cal.*.v5`.

### 9.8 Logo

- **Wordmark:** **CALIMA** in Bodoni Moda 500 caps, tracking 0.18 em (engraved-chart Didone; not thin
  wide-tracked caps).
- **The I** is a **plumb line**: a thin stroke ending in a bob.
- **The Claude spark** (Round-3 geometry, `#DA7756`, unchanged) is the dot of the I: **full,
  unclipped, above the wordmark** — the calima sun. It never sits on, under or behind a rule.
- **Beneath:** one hairline **datum rule** the full width of the wordmark; under the I a small spark-
  coral **benchmark broad-arrow** points up at the spark.
- **Nothing else:** no tagline, no second line under the rule, no "A CLAUDE GAME", no reflection
  dashes, no rising-sun reading.
- **Title screen:** CALIMA over a live vista of **the Pans in calima** — salt grid, white surf on black
  sand, the coral disc sun. No walker on the skyline, no lava.
- **Loading:** the datum rule fills left to right as progress; copy "Reading the benchmarks…".
- **Favicon:** the bare spark (pixel-identical to `public/favicon.svg`; comment "the calima sun").

### 9.9 Sound (one paragraph for the audio lane)

Bed: surf, trade wind, distant guild bells. Fogcatchers: whistled calls in a pitch language,
synthesised by `tools/audio-bank.mjs` (CC0 by construction). Instruments: escapements, chimes,
ratchets, gyroscope whine, ceramic clinks; each lamp-state change is a two-tone survey chirp; never a
roar. Sets renamed and regenerated: `hero/`, `voice/<kind>/`, `idle/<kind>`, `bow/{sabina,cane,sighting}`.
**Music** (`public/audio/music/*`, regenerated): guild bells, whistled motifs, plucked strings
(timple-like), ratchet and clapper percussion, low bowed drones in the Cloudline. Combat stems use
ratchets, clappers and bell hits, **no taiko or frame drums** (the "tribal" cue §11.1 sets itself
against). Gates `A-music-palette` and `V-score`.

---

## 10. Name glossary (every Horizon term and its replacement)

### 10.1 People, places, brand

| Horizon / old term | CALIMA | code / id |
|---|---|---|
| Horizon Zero Claude / "Horizon Zero" | **CALIMA** | package `calima`, `[CAL]` log tag |
| HZC prefix | CAL | `.cal-*`, `--cal-*`, `cal.*.v5` storage |
| Aloy | **Brea** | rig profile `brea`; audio set `hero/` |
| Varl, Sona, Teb, Bast, Vala, Karst, Maris, Olin, Thok, Renn, Delve, Aura, Nil | Ansel (Guild Matron), Oro (Tube Smith), Mise (Lantern-Keeper) + archetype roster §6.3 | `npc.ids` |
| Nora / Carja / Oseram / Banuk / Eclipse | Pan Houses / Crescent Holds / Fogcatchers / — / Levelers | `faction` ids `pan`, `holds`, `fog`, `level` |
| Mother's Heart / Watch / Rise | Saltrow / Ninewalls / Mistfold | `settlement` ids |
| Ridgeback Outpost, Ridge Trial Ground, Glowfall Caves, Slackwater Camp, The Fallen Watcher | Organ Shelf, the Glass, the Boilers, Jameo, Leveler Muster … (§8.4) | `PLACES` ids |
| Cauldron (KAPPA) | **Calibration Yard** (open air) | place kind `yard` |
| Tallneck | **Trig Pillars** (triangulation; nothing giant climbed) | place kind `trig` |
| Hunting Grounds | — (no timed trials); **Guild Notices** are untimed bounties | activity `notice` |
| Corrupted / Corruption | — (no corruption; error is "off the Datum") | — |
| Prowler / Brave / Forager (skill trees, XP and skill points) | **Field Book certifications** Transect / Ballast / Bearing, earned by survey acts (re-surveys, triangles sighted, tools Pried), not by kill XP | certification ids |
| Zero Dawn / Forbidden West / Frozen Wilds / Burning Shores / Guerrilla / Sony / Fortnite / Sketchfab | none (credits list only CC0/CC-BY/OFL sources) | — |
| "Waking the machines…" | "Reading the benchmarks…" | loading copy |

### 10.2 Machines → Instruments (and gate roles)

| old kind | new kind | role id |
|---|---|---|
| Watcher, Redeye | **Plumb** | `sentry` |
| Strider, Grazer, Broadhead | **Tiller** | `herd` |
| Scrapper | **Peg** | `swarm` |
| Sawtooth, Ravager | **Sickle** | `flanker` |
| Snapmaw, Shell-Walker | **Gauge** | `keeper` |
| Longleg | **Spindle** | `duelist` |
| Behemoth, Charger, Trampler | **Screed** | `heavy` |
| Corruptor, Bellowback | **Kiln** | `artillery` |
| — | **Davit** | `support` |
| Glinthawk, Stormbird | **Sonde** | `spotter` |
| Rockbreaker, Burrower | **Dredge** | `ambusher` |
| Thunderjaw, Tallneck | **Transit** | `colossus` |
| "machines" | **Instruments** | `ctx.machines` (engine name kept) |
| eye colours blue/amber/red/teal | lamp states calm/wary/hostile/dark | `LAMP_STATES` |

### 10.3 Mechanics, items, weapons, events

| Horizon / old term | CALIMA | code / id |
|---|---|---|
| Focus (device) | **Alidade** | `ctx.sighting` |
| Focus mode / scan / pulse | **Sighting** | events `sighting-on/off/pulse` |
| tag / tagged | **Flagged** | `flagged` |
| Override (+ node, ally, mount) | **deleted** (rule R7) | `ai/override.js` removed; state `overridden` removed; event `override-node` removed |
| Concentration (slow-motion aim) | **Steady** — a breath-hold that zeroes bow sway; **no time dilation** | `combat.steady`; events `steady-start/end` |
| Silent Strike | **Undercut** | event `undercut` |
| Critical Strike / Critical Hit | **Felling blow** | `felling-blow` |
| Tear (player word) | **Pry** | channel `tear` (engine) |
| Impact (player word) | **Blunt** | channel `impact` (engine) |
| Brittle / Frost (damage multiplier) | **Seized** — joints lock, seized parts come off with one Pry; no multiplier | status `seized` |
| Burning (fire status) | **Charred** | status `charred` |
| Shocked (stun) | **Clouded** | status `clouded` |
| fire / freeze / shock elements | **Cinder / Brine / Dust** | channels `fire/freeze/shock` (engine) |
| Datapoint | **Field Book** | `fieldbook-found`; `items/fieldbooks.js` |
| supply cache | salt cache | `cache-found` |
| Metal Shards (currency) | **salt** | item `salt` |
| Blaze | cinder resin | `cinder-resin` |
| Chillwater | brine | `brine` |
| Sparker | calima dust | `dust` |
| Ridge-wood | juniper | `juniper` |
| Wire / Braided Wire | cord / bronze cable | `cord`, `bronze-cable` |
| machine core / heart | escapement | `escapement` |
| machine lens / `<kind>-lens` | lampglass | `<kind>-lampglass` |
| shards / sherds (glaze) | ceramic | `ceramic` |
| Medicine Pouch / herbs | fog-water **Gourd** | `player.gourd` |
| Hunter / Sharpshot / War Bow | Sabina Bow / Sighting Bow / Cane Recurve | `sabina`, `sighting`, `cane` |
| Spear | Lance (Shepherd's / Obsidian / Counterweight) | `lance-shepherd`, `lance-obsidian`, `lance-counter` |
| Blast Sling | Pots (Brine / Cinder / Dust) | `pot-brine` … |
| Ropecaster | Cast Net (Hand / Basalt / Wire) | `net-hand` … |
| Tripcaster | — (Peg transects are the trap language) | — |
| Tearblast arrow | Barbed arrow | `barbed` |
| Disc Launcher (pickup) | — (no carryable machine weapon) | — |
| Hunter arrow / hardpoint / precision | Reed / Barbed / Sighting arrows | `reed`, `barbed` |
| Weapon wheel ("HZD WEAPON WHEEL", slows time) | the **Kit Rack** — the world keeps running at 1.0 | `ui/wheel.js` header |
| machine-tied / rope-attached | instrument-fouled / net-fouled | events |
| Proving / "The Thunderjaw" / "The Cauldron Door" (quests) | "Raker's Morning", "The Scar", "True Ground" (first-hour chain) | quest ids |

### 10.4 Name-lint result (this bible)

The union lexicon — Direction A's 331-entry `horizon-lexicon.txt` split into tokens, plus Direction
B's 235 names and 46 phrases (incl. Saltbite, Call of the Mountain, Rollerback), plus Brittle,
Impact, Tear, Frost, Lens, Shards, Stalker, Watcher, Grazer, Charger, Burrower (417 tokens) — was run
over **179 proposed names, role ids and event ids** with A's rules (exact, substring ≥ 5, edit ≤ 1):
**0 hard hits.** Renamed during the run: Sinker Net → **Basalt Net** (Tinker), role `apex` →
**`colossus`** (HFW Apex variants), Lens Drum → **Lamp Drum**, Kit Wheel → **Kit Rack**; "Strike"
was dropped as a player word (Silent/Critical Strike); the critic pass renamed "Leveler camp" →
**Leveler Muster** (lexicon token Camp). Accepted generic nouns: lance, cliff, shelf,
salt, glaze, arrow. Near (edit 2) advisories for a human look only: Charred/Charger,
Tiller/Tinker, Screed/Sacred, Davit/Devil. The lexicon and script become `tools/lint/` (PLAN §9,
`A-no-horizon-terms`) and run over code, role ids, table keys and rendered UI strings, not just names.

---

## 11. Distinctiveness

### 11.1 Horizon vs CALIMA

| element | Horizon does | CALIMA does |
|---|---|---|
| title / logo | HORIZON thin wide caps, sun cresting a horizon rule, tracked sub-line | CALIMA in Bodoni Moda; spark full and **above** the word as the dot of a plumb-line I; one datum rule; no sub-line |
| typography | Julius / Rajdhani / Chakra-style techno caps (fan HUDs) | Bodoni Moda + IBM Plex Sans Condensed + Plex Mono |
| setting | post-collapse western USA; **HFW Burning Shores is a volcanic archipelago with live lava** | one fictional Atlantic island modelled on the Canaries; **no live lava**; led by salt grids, white surf on black sand, crescent walls, laurel cloud forest, calima |
| premise | extinction, terraforming AI, a mystery about the Old Ones | no apocalypse: an abandoned survey still running; slow geological collapse; map vs territory |
| people and the past | tribes mythologising old tech | literate guilds; the old world is history |
| protagonist | Aloy: 19, red braided hair, fur and leather, outcast, special origin | Brea: 31, violet headwrap + topknot (no braid), orchil smock, guild officer, ordinary birth |
| her tool | Focus at the temple | brass Alidade raised to the eye |
| back carry | diagonal spear + bow | **shared genre carry** (diagonal lance + bow, ruling R10); differentiated by head, colour, counterweight bob, crescent bracer |
| machine design | animals of metal, named by body-part compounds | instruments (tripod, grader, kiln, gauge, crane, balloon, train); single tool nouns; no heads, jaws, tails or eyes |
| family mark | glowing blue eye-lenses, cables | vermilion/white graduations; glaze on bronze |
| sensor states | blue → amber → red (+ teal override) | **iris 100/50/20 % + beam**, then bone → chartreuse → magenta; every state ΔE ≥ 24.7 from Horizon's five |
| control | Override, allies, mounts | **none** — environmental manipulation only (benchmarks, calibration) |
| map reveal | climb a Tallneck | triangulate from 4 m trig pillars |
| dungeons / trials | Cauldrons; timed Hunting Grounds | open-air Calibration Yard, lava tubes; untimed Guild Notices |
| weapons | Hunter/Sharpshot/War Bows, Ropecaster, Tripcaster, Blast Sling | juniper bows, shepherd's lances, **gaff**, **crescent fan-shield**, **pendulum-cast pots**, **cast net** |
| elements | fire, freeze, shock, acid, plasma, purgewater | Cinder, Brine, Dust (statuses Charred, Seized, Clouded) |
| damage words | Tear, Impact, Brittle | Pry, Blunt, Seized (no damage multiplier) |
| time | Concentration slow-mo; a time-slowed weapon wheel | **no time dilation anywhere**: Steady is a breath-hold; the Kit Rack runs in real time |
| progression | XP from kills feeds three skill trees | Field Book certifications earned by survey acts |
| currency / loot | metal shards, hearts, lenses | salt; bronze, seed glass, auger bits, bobs, escapements, lampglass |
| collectibles | datapoints | Field Books |
| armor | tribal outfits of machine hide | guild workwear (linen, wool, felt) and ceramic lamellar; verb perks |
| stealth | tall red grass | calima dust, fog banks, Peg transect lines, the planted Windwall, scrub |
| traversal | handholds, glider, grapple, mounts | basalt-column stairs, cinder sliding, cable baskets; no mounts |
| UI | holographic Focus, hexes, smoked glass | field book: paper, hairlines, contours, stadia hairs, levelling-staff health |
| key art | a giant walker on a sunset skyline | the Pans in calima; the colossus never on a low-sun skyline |
| sound | tribal choir, roaring machines | bells, whistles, chimes, ratchets, ceramic |

### 11.2 Honest overlaps: the core loop, stated in full

The first draft of this list named only genre surfaces. The critic pass found that most of the core
loop still maps one-to-one onto Horizon's, so every overlap is listed here with what is done about it.

| overlap | Horizon | CALIMA | status |
|---|---|---|---|
| bow + spear, diagonal back carry | Aloy's kit | lance + bows, ruling R10 | kept (brief + kept melee stack); differentiated by head, colour, bob and bracer |
| the enemy roster as a role remap | herd + sentry escort, flanker pack, charging heavy, artillery, water ambusher, spotter flier, colossus | the same seven roles (§10.2), plus a neutral keeper and a repair support | **kept**: the roles come from the kept AI engine and gate roster. The bodies, jobs, verbs and lamp grammar are new; the Gauge (neutral) and Davit (healer) have no Horizon role |
| scan mode | Focus scan: components, patrol paths | Sighting: components, transects | kept as a loop; restyled (paper, stadia hairs, no violet/teal, world keeps its colour) |
| slow-motion aim | Concentration | Steady | **changed**: a breath-hold that zeroes sway; no time dilation (§5.8) |
| time-slowed weapon wheel | weapon wheel | Kit Rack | **changed**: the world keeps running; quick slots 1–4 (§5.8) |
| stealth kill / critical | Silent Strike / Critical Strike | Undercut / Felling blow | kept as verbs (genre); renamed |
| freeze → brittle multiplier on the fire/freeze/shock engine | Frozen/Brittle | Seized | **changed**: seized joints make parts come off with one Pry; no damage multiplier (§5.8) |
| skill trees fed by kill XP | three trees, XP, skill points | Field Book certifications | **changed**: earned by survey acts (re-surveys, triangles, tools Pried), not by kills |
| loot from torn parts | yes | yes (recognisable tools) | kept (genre) |
| a sect that guides machines | Eclipse | Levelers | kept as a role; Levelers never command (R7), they walk pegged lines ahead of Screeds |
| a site hosting every machine kind | Cauldron | Calibration Yard | kept as a place; open air, no interior, no override; the act is moving target boards |
| corruption spreading between machines | Corruptor | — | **deleted**: the `ai/squad.js` corruption block goes in wave 0 (`A-no-corruption`) |
| whistle to lure | Aloy's whistle | base whistle (G) | kept (genre stealth); Highline throws it to a point (§4.4) |
| a colossal walker | Tallneck, Thunderjaw | the Transit | a tripod you fight and topple, never climb, never key art at a low sun |
| the net restrains | Ropecaster tie-down | Cast Net | by fouling, capped to small/medium kinds and the Sonde |
| a volcanic island | HFW Burning Shores | Orchil | no live lava; every hero frame leads with salt, calima, crescent walls and laurisilva |
| "Salt" | HFW's Saltbite | Saltrow | a common noun (lint GENERIC); different form and place |
| the Claude spark | — | logo + calima sun | Anthropic's brand mark; clear its use as a game logo before any release |

**Verbs that are not Horizon's** (gate `A-distinct-verbs`: ≥ 5 of the 8 first-hour beats teach a
verb that is absent from the HZD verb list in `tools/lint/hzd-verbs.json`): raking salt (0:00),
crossing a transect unseen (0:10), triangulating (0:18), toppling a tripod by its level vial (0:25),
parrying and planting the Windwall and luring a Screed into a wall (0:35), re-surveying a benchmark
(0:45), and moving under the calima (0:55). Seven of eight beats qualify.
