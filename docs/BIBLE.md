# CALIMA — BIBLE

The lore and content canon. One document, every section current. It is edited in place when the direction
changes; nothing is amended by a block on top.

**How to read it.**
- Everything here is canon.
- The art-direction references are the visual target and are kept outside the repo. Where a reference disagrees
  with this text on *names, roles, layout or rules*, this text wins. Where they disagree on *look, material and
  fidelity*, the reference wins.
- The content rules (§19) outrank everything, including the references: every name, design and interface element
  is original to CALIMA; assets are CC0 preferred, CC-BY with attribution, never NC or ND.
- In-world text and UI say **Instruments** and nothing else. Engine identifiers are exempt through the lint
  allow-list.

**Contents.** 1 Premise · 2 History · 3 Geography · 4 Peoples · 5 Brea · 6 People · 7 Instruments · 8 Items ·
9 The four features · 10 Presentation · 11 Story and quests · 12 Core loop and controls · 13 Combat rules ·
14 Stealth · 15 Progression · 16 Making and economy · 17 Rest and save · 18 Screens · 19 Content rules · 20 Glossary

---

## 1. Premise and tone

**Title.** CALIMA. Fallback title SALT & SPARK. DATUM and Tidemark are struck.

**Tagline.** THE ISLAND REMEMBERS — exactly one line, under the wordmark, (IBM Plex Mono 500
caps, flush left with the C, under the datum rule, no flanking rules, no star). In-world meaning: the Datum
is the island's memory of itself on one day 812 years ago, and the Instruments are that memory acting.

**Logline.** On a volcanic Atlantic island, the Instruments of an old survey are still holding the ground to an
800-year-old map, and they flatten anything that is not on it. A salt-pan Reckoner has to survey the island again, villages included,
before its western flank slides into the sea.

**Three pillars.**

1. **Instruments, not animals.** Every enemy is a working survey or civil-engineering tool, read by its lamp,
   its vials and the tool it carries.
2. **Salt, dust and fog: one island, three climates from one wind.** The NE trade wind makes the north a wet laurel
   cloud forest and the south black sand, salt pans and ash vineyards. When the calima blows, the sky goes ochre
   and the Instruments go half-blind.
3. **Brea is a tradeswoman, not a chosen one.** 31, numerate, respected. Her power is a brass sighting tube and a
   working knowledge of triangles.

**Theme.** The map versus the territory: who gets to say what is true ground.

**Tone.** Low-magic, literate, practical. The Survey ended for mundane reasons, its Instruments are doing exactly
what they were told, and nothing is hidden or foretold. People know what a theodolite is; the old world is history, not religion. "Arcane" on Orchil means the instrument-maker's craft
and "celestial" means a surveyor's star-fix.

**The look, in one paragraph.** Golden-weighted light: a low warm sun split from violet-rose shadow and distance;
the island receding through four to six hazed silhouette layers; sunlit cumulus behind needle stacks and an upright
broken Ring; a glitter path on the sea; a dense golden meadow with violet flower clumps in the foreground; skin
with sheen and a soft terminator; thick worn cloth; a long wrap tail in the wind. The ground stays black and white
(lapilli, black sand, salt); the flora carries gold and violet; the people carry colour; the Instruments are white
enamel and brass.

**Ground rules.** Play is always in real time (hit-stop is a capped freeze of ≤ 120 ms). The Instruments act only
for the Datum. The Malpaís is cold rock. Brea grows by survey acts, never by kills. Every person on Orchil is
someone to talk to. Every task is untimed. She wades but does not swim. She navigates by the compass strip and the
map, and reads an Instrument's state from its lamp.

## 2. History: Orchil and the Datum

| when | what |
|---|---|
| ~800 years before the game | Orchil's western volcanic flank is creeping seaward a few centimetres a year. The islanders and an off-island consortium commission the **Datum Survey**. |
| Epoch 0, "the day of the Datum" | The Survey fixes one reference model, **the Datum**: Orchil measured to the millimetre on one day. A self-maintaining population of **Instruments** is given one instruction: *keep Orchil true to the Datum*. Measuring Instruments watch; correcting Instruments push ground back; anchoring works pin the western flank to the seabed with bronze cables (the Pinned Cliff). |
| soon after | The ships stop coming. Mundane: priorities changed, nobody came back. |
| eight centuries | Coexistence. The Instruments (Orchil has no other word for them) ignore people. The Pan Houses learn to read their marks and keep out of their transects. Farmers plant in Tiller auger holes. Bronze is cast from salvaged Instrument alloy. |
| **Epoch 812, the game year** (~29th century CE) | The volcano wakes. The island drifts from the Datum faster than ever. Correcting Instruments multiply their work, and everything built after the Datum counts as error: every village, wall and salt pan. Plumbs paint the **Datum Line** on anything in error, at the height the ground is meant to be; a Screed cuts down to that line. The **Levelers**, a zealot sect, walk pegged lines ahead of Screeds to guide them onto "error". |

**How the Datum can change.** The Datum accepts new observations when enough independent benchmarks agree
(least-squares adjustment as play). Re-surveying a benchmark makes its region **true ground**: Screeds stop choosing
targets there and its Datum Line vanishes. At the master benchmark, **the Fundamental**, a new Datum can be set.

**What is at stake.** The western flank is about a fifth of the island's land: the Pinned Cliff, the Boilers and
the ground the Levelers muster on. If the anchors fail it goes into the sea in one piece, and the wave it raises
crosses the bay to the pans and Saltrow in under two minutes. The Survey was right about the flank. It is wrong
about everything built since.

**Orchil the name.** Orchil is the violet lichen dye that grew on the sea cliffs, the island's old export.
The Survey's station flags were dyed with it, which is why faded violet survey banners still hang from some
Instruments and why the Pan Houses, who read the Instruments' marks, wear orchil as their guild colour.

## 3. Geography

### 3.1 Frame

- A fictional island in Macaronesia, open Atlantic, about 28° N, near enough to Africa for the calima. No real place
  names except the geology word *malpaís*; no real peoples or sacred sites depicted.
- World square 1024 m (fallbacks 860 / 720 m). Island ellipse about 950 × 800 m, about 0.55 km² of land. Summit
  about 245 m on the NE caldera rim. Playable radius about 490 m. +x east, −z north.
- Boundary: the sea. Wading to 1.2 m; beyond the 1.1 m contour a ring of blocking current. No swimming.
- Beyond the play radius: six offshore needle stacks (18–55 m) and one sea arch on bearings 200–300; two sister
  isles on the skyline, one with a stratovolcano to the NW.
- Wind: NE trade from bearing 045. Everything leans, streams and sways SW. Cloud deck at 110–150 m on the windward
  slopes; from the caldera you look down on a sea of clouds.
- Climate 17–27 °C. No rivers; only small Cloudline waterfalls.

### 3.2 Weather and light

| state | where / when | effect on Instruments' perception |
|---|---|---|
| trade (clear) | default | ×1.0 |
| **calima** | 1 day in 4, Holds and Pans; ochre fog ×4, the sun a soft coral disc | **×0.5**; grounds the Survey Kite |
| fogbank | Cloudline, dawn and dusk; height fog below 150 m | ×0.5 inside the bank |
| squall | rare, windward side only | ×0.8; grounds the Survey Kite |
| night | 19:45–05:30; lamps rule the frame | ×0.7 |

- **Golden-weighted clock** (`env.clock = 'golden'`): low sun about 34 % of play, night about 20 %. Noon stands in
  the south.
- A New Game starts at 07:00. The 0:55 first-hour beat is calima at noon (12:00 ± 0:30). The title opens at 18:40
  golden. A Continue with no saved hour, and the look places, use 17:45.
- Warm light is split from violet-rose shadow. Crepuscular shafts only at real occluder and cloud gaps; radial
  spokes are banned.

### 3.3 The six biomes

| biome | where, elevation | ground | flora | landmarks | light and mood |
|---|---|---|---|---|---|
| **The Pans** | SW, 0–8 m | black sand (wet band, ripples, grain sparkle), white polygon salt crust, basalt; brine pools that mirror the sky, pink where they evaporate | landward **golden meadow belt** (cerrillo grass, violet viborina spikes, sea-lavender) — scenery, never cover; marram colonies, **carrizo** cane and **junco** salt rush along water — cover; tamarisk groves; glasswort | Saltrow; the salt pans; the Glass; the Sounding Ring; the Organ Shelf; three wind pumps; the red crater; the black-sand beach | bleached and maritime at noon; the signature golden-hour vista; white surf on black sand |
| **Crescent Holds** | S, 20–90 m | black lapilli, sand drifts; vines in instanced ash pit-cups behind crescent walls; 5–9 drystone terrace tiers | vines, fig, prickly pear with white cochineal flecks, tabaiba, cardón, bougainvillea, the one dragon tree; carrizo in the barrancos | Ninewalls; the Jameo skylight; the **Screed Scar** (25 m wide, dead straight, 480 m, berms both sides) | warm and dusty; calima most often |
| **Malpaís** | SE, 20–145 m | **cold** aa and pahoehoe lava rock, cinder bands, lichen crust | rare tabaiba | the **Kiln Yards** (ruined geothermal plant: two tiled cooling-tower stubs 22–28 m, 3–5 flue stacks, pipe racks, glowing man-made wellheads); Rust Cone (145 m cinder cone, T3 on top); the hornito field (steaming, 3–6 m); a lava-tube shelter with a dormant Peg nest | hard contrast. **No lava anywhere, zero emissive terrain.** Only wellheads and Kilns glow; fumarole steam |
| **Cloudline** | N–NE, 60–215 m | forest floor, wet rock, moss on north faces | laurel, tree heather, ferns | the **Fog Harp** (60 m pre-Datum fog-collector frame across the main barranco, humming bronze cables); Mistfold beneath it; cable baskets | low contrast, dripping, green; fog ×3 below 150 m |
| **Drowned Flank** | W–NW, 0–125 m | stratified basalt, tuff, scoria and ash cliffs; black sand | wind-bent sabinas (junipers) leaning SW, sparse grass | the **Pinned Cliff** (12 bronze anchor heads, 3 m discs, bolted into a stratified wall, cables into the sea); the **Boilers** sea caves; the Leveler Muster | the golden-hour stage on the west-facing wall |
| **Caldera** | centre, 160–245 m | pale pumice | Canarian pine (one fire-scarred with green shoots), retama, red tajinaste flower towers | **the Fundamental** (14 m white obelisk with a bronze observatory dome); the **Calibration Yard**; the **Roques** (15–25 m pillars, plus one 55–60 m hero plug on the west rim) | thin clear air; the sea of clouds below |

The Cloudline is the island's only forest; nobody calls it a rainforest. Tall rock has two names only: the
Roques inland and the stacks offshore.

### 3.4 Places (site, position E/N in metres from centre, what it looks like)

| place | (E, N) | what it is |
|---|---|---|
| **Saltrow** | (−267, −229) | Pan Houses town, ~24 buildings. Whitewashed cubes in three lime-wash tones with basalt quoins, flat stepped roofs, orchil-violet wooden balconies, bougainvillea on one house in three, salt cones, a boat ramp on black sand, a guild house with a brass bell. Warm window glow from dusk. Brea's house and cistern at the pan edge. |
| **Brea's cistern (REST)** | at Saltrow's pan edge | Where a New Game starts, and Brea's home. A stone cistern with a Brazier: the first rest point. Not a travel node. |
| the guild-house stud | the Saltrow guild house step, about 40 m from the cistern | A brass datum stud set in the step. True ground from the start, so it is the home travel node. Not one of the twelve benchmarks. |
| the salt pans | (−320, −293) | A grid of shallow brine cells, dykes and rakes; flooded and drained by the Gauge's tide clock. |
| **the Glass** | (−384, −176) | A still emerald lagoon (wading depth) under a half-eroded red crater; mirror-smooth; Gauges wade in it; reed and rush on its rim. |
| **the Sounding Ring** | (−347, −320) | A huge broken ring, 34 m across, standing 15–25° off vertical on a 5–6 m grassed shingle rise: white panels on bronze flanges, one quadrant fallen into the salt, a dim core. A Survey structure, never a stone portal. A Sonde is moored to it. Its job: the Survey's sea-level and tide reference, the gimbal ring of a great gyroscope that held "level" for the whole Datum; "sounding" is the depth-sounding of the bay. Brea wears its shape as a ring charm. |
| the Organ Shelf (+T1) | (−219, −341) | Eleven clusters of hexagonal basalt columns 0.6–1.4 m across, stepping 2–14 m like organ pipes; natural stairs. Trig pillar T1 on top. |
| the black-sand beach | (−187, −411) | Boats, gulls, white surf. Where the Pegs lay their first transect. |
| the red crater | above the Glass | Half-eroded, banded red scoria. |
| **Ninewalls** | (−11, −213) | Crescent Holds village, ~16 dwellings sunk into lapilli with pumice-and-lime roofs, behind **nine concentric crescent walls** facing NE; the dragon tree at its centre; a lava-tube mouth as hall and forge. A walled settlement — never a giant tree. |
| the Jameo | (112, −160) | The collapsed skylight of the Ninewalls lava tube, with a dark pool of white blind crabs. |
| the Screed Scar | (251, −43) → (−91, −384) | The straight cut a Screed left across the Holds. |
| **the Kiln Yards** | (219, −27) | See Malpaís. Kilns plug hoses into the wellheads. |
| Rust Cone (+T3) | (283, −101) | Red cinder cone; scree to slide. |
| hornito field | (272, −187) | Small steaming spatter cones. |
| **Mistfold** | (240, 261) | Fogcatcher village, ~12 round stone huts with sod roofs, net frames, goat folds, ladders, cable baskets across the ravine. Grows by two people and a market day once the Fog Harp is retuned. |
| the Fog Harp | (176, 229) | See Cloudline. Five cable winches to retune. |
| **the Pinned Cliff** | (−183, 103) | See Drowned Flank. The Dredge maintains its cables. |
| the Leveler Muster | (−283, 160) | Banded survey tripods and pegged lines below the Pinned Cliff; the sect's gathering ground. |
| the Boilers | (−368, −59) | Sea caves where swell booms. |
| **the Calibration Yard** | (16, 37) | An open-air yard on the caldera floor where every kind of Instrument queues to be checked against four target boards. No interior, no door, no override. |
| the Roques | (−43, 101) | Eroded volcanic pillars; the 55–60 m plug is the inland skyline mark. |
| **the Fundamental** | (128, 144) | The master benchmark. A 14 m white obelisk with a bronze observatory dome, near the summit. The end of the game. |
| trig pillars T1–T6 | Organ Shelf, Ninewalls Rise, Rust Cone, Cloudline Ridge, Flank Crest, West Rim | 4 m white cylinders with steps. A Brazier appears at the foot of each once its triangle is surveyed. |
| minor | — | a goatherd fold, a fishing hut (the first net), the Malpaís tube shelter. |

**Interactable counts.** 6 trig pillars; 12 benchmarks (travel nodes once re-surveyed); 24 Field Books; 8 salt
caches; 2 Guild Notice boards (Saltrow, Ninewalls; untimed bounties); 2 lava tubes; Braziers at Brea's cistern,
the Saltrow and Ninewalls cisterns, Mistfold, the Malpaís tube shelter and each surveyed pillar.

**The twelve benchmarks** (two to a region; positions are plan values, snapped to the ground at blockout).

| # | region | (E, N) | where |
|---|---|---|---|
| B1 | Holds | (12, −282) | on the Scar's line, 70 m south of Ninewalls ("True Ground") |
| B2 | Pans | (−380, −180) | a bronze post standing in the Glass ("The Wrong Tide") |
| B3 | Pans | (−338, −308) | the foot of the Sounding Ring's rise |
| B4 | Holds | (112, −150) | the rim of the Jameo |
| B5 | Malpaís | (226, −36) | the wellhead apron of the Kiln Yards |
| B6 | Malpaís | (268, −180) | the edge of the hornito field |
| B7 | Cloudline | (180, 222) | under the Fog Harp's south footing |
| B8 | Cloudline | (96, 296) | a spur of Cloudline Ridge, above the cloud deck |
| B9 | Flank | (−190, 112) | the top of the Pinned Cliff |
| B10 | Flank | (−358, −52) | the headland over the Boilers |
| B11 | Caldera | (16, 37) | the centre stud of the Calibration Yard |
| B12 | Caldera | (−40, 96) | the foot of the great Roque |

**The eight salt caches.** The breakwater's seaward end; under the fallen Ring quadrant; the top of the Organ
Shelf's tallest column; the third Ninewalls wall niche; the Jameo pool ledge; the Malpaís tube shelter; a cable
basket stranded mid-ravine at Mistfold; the Boilers' dry cave.

**Wind-road line-posts.** Organ Shelf rim: 5 posts. The Scar's north lip: 7. The caldera's windward wall: 6. Each
is a 3 m cane post with a cloth streamer.

**The Datum Line.** A survey-vermilion band 0.25 m tall, painted by Plumbs on walls, terraces, rock and huts at the
height the ground is meant to be. It reads as sprayed paint with drips, not a UI overlay. Flat ink, never
emissive. Re-surveying the region's benchmark erases it.

### 3.5 Fauna

Feral goat (Cloudline, Flank, Caldera); rabbit (Holds, Caldera); giant lizard (Malpaís, Holds); shearwater (Flank
cliffs, the Pans at dusk); gull (Pans, beach); blind crab (the Jameo pool, ambient only). Loot: hide, horn, meat,
scale, feather.

## 4. Factions and peoples

Orchil has **three peoples and one sect**. The nine *callings* (§6) are jobs drawn from these peoples; they are not
extra factions, and the game never prints "nine peoples".

| | **Pan Houses** (coast) | **Crescent Holds** (ash lowland) | **Fogcatchers** (cloud forest) | **Levelers** (sect) |
|---|---|---|---|---|
| who | salt-making guild families; traders and boat-builders; salt is the island's money | vine and fig farmers in ash pits; cochineal growers; bronze-smiths in the lava tube | highland herders and fog-net keepers; keepers of the paper field books; whistled speech | Datum zealots: the island must be returned to the model, so post-Datum villages should go |
| motif | the grid (salt cells) | the crescent | the vertical (nets, poles, rain) | the line and the broad arrow |
| cloth colour | salt-white linen with orchil violet | ash-grey and black wool with rust and carmine | green-grey felt (laurel, moss), sheepskin | kaolin white; vermilion and white bands; black wool cloak |
| materials | linen, palm weave, brass, tar | wool, leather, mica, basalt flake | felt, goat horn, laurel wood, net | ceramic masks made from Instrument lamp housings |
| homes | whitewashed cubes, violet balconies | drystone houses sunk in lapilli; the tube hall | round sod-roofed huts, net frames | banded tripods and pegged lines |
| attitude to Instruments | read them and get out of the way | follow Tillers to plant in their auger holes | avoid them; know the old books | guide Screeds to "error"; never command them |

**Shared dress language (all three peoples)**: cream linen and dyed cloth with thin **gold-ochre
graduated-tick embroidery**; frayed hems; leather straps and belts with tarnished brass; dust on everything.
Every islander carries **a small orchil-violet accent** (headband, sash, scarf or trim), but only Brea is a violet
block, so she reads first in a crowd. Faces at Brea's fidelity: pores, freckles, wrinkles, individual features.
Variety in age, build, hair (curls, bun, undercut), hats, glasses, earrings.

**Levelers never fight.** They walk pegged lines ahead of Screeds at a locked 0.80 m stride. Breaking a Leveler's
staff lamp (one arrow) makes the escorted Screed lose the line. Look: a hood over a kaolin ceramic mask, a
lapilli-black wool cloak, a vermilion-and-white banded sash, a banded staff with a lamp. They carry no weapon and
have no attack table and no hit points. Their voice in the story is **Chainman Isk** (§6.2), who argues the
sect's case in the Survey's own terms: the flank is real, the anchors are real, and every wall built since is
weight on the wrong side of the line.

## 5. Brea

### 5.1 Identity

| | |
|---|---|
| name | **Brea** (BRAY-ah): the coast word for pitch, the tar that seals sluices and boats. A nickname earned with tar-black hands. Her given name is a whistled phrase from her mother's highland people. |
| age | **31** |
| people | born in Saltrow of the Pan Houses to a Fogcatcher mother; she belongs to both coast and highland |
| job | the Pan Houses' **Reckoner** ("Salt-pan Reckoner"): reads Instrument marks and transects, moves the pans when the lines shift, bargains with the Gauge's tide clock |
| height, build | 1.72 m, athletic, toned bare arms |
| temperament | dry, patient, measures before she acts; resourceful and determined; her compassion shows as work done for people, not speeches |
| tool | the **Alidade**: a 6 cm brass sighting tube with stadia hairlines, carried in a loop on the right chest strap, raised hand-held to the right eye (Sighting). Never at the temple. |
| mark | a tattooed **∴** (triangulation mark) on the back of her right hand, repeated as a stitched mark on the back of the glove |
| card line | "Brea, Salt-pan Reckoner." sub-line: "A surveyor of the Pan Houses, re-drawing an island the map has forgotten." |

### 5.2 Look (rung 1, STARTER). The character turnaround sheet is the binding target.

**Head**
- **Wrap:** deep orchil violet, layered and bunched, coarse weave, frayed hems, thin red-orange thread stitched
  across the folds. It knots at the crown-back into a bunch (the "topknot" read is this cloth knot). Loose ends fly
  at the right temple.
- **Tail:** torn and frayed, hanging to the shoulder blades: 0.53–0.62 m, 0.09 m wide at the root tapering to
  0.06 m before a 2.5 cm fringe, two-ply, 7 chain links, driven by the wind. Down the left of the spine, never on
  the draw side.
- **Hair:** a short dark undercut, visible at the temples and nape. Nothing long: no braid and no hair tail.
- **Face:** strong straight brows, defined jaw and cheekbones, intense level gaze, dark brown eyes. Deep brown skin
  with visible pores, light freckling and a dusty sheen. Soft warm light, gentle terminator, wet eyes with
  catch-lights, dark upper lash line.
- **Salt paste:** a white stripe across the bridge of the nose and both cheeks, below the eyes, dry, matte and
  slightly cracked.
- **Neck:** a violet neck scarf over the throat. On a cord, a small brass **ring charm** (the Sounding Ring).

**Body**
- **Top:** sleeveless fitted violet top with a faded, worn print.
- **Harness:** crossed dark-leather chest straps (an X), riveted, with a **square brass buckle-plate** at the
  crossing.
- **Arms:** violet cloth bands on both upper arms; leather bracers capped in tarnished brass, with buckles, on both
  forearms over violet wraps; dark fingerless gloves. The **left bracer carries the bronze crescent plate** (the
  archer's bracer; the closed Windwall takes that socket from 0:35).
- **Waist:** a wide leather belt with pouches and a square brass buckle; a second slung belt with pouches; a
  **violet hip sash with long ragged panels front and back to below the knee**, embroidered with thin gold-ochre
  glyph and tick lines, frayed at the ends. No red at the hip.
- **Legs:** dark brown-grey work trousers, worn and dusty, leather knee straps; violet cloth wrapped round the
  shins over the boots.
- **Boots:** heavy dark-brown laced leather work boots, scuffed.
- **Back:** a leather **survey case** on the bow's diagonal (charts at first, the furled Survey Kite once earned), plus the
  bow and lance mounts. Visible back gear is exactly three items: lance, bow, case.
- **Materials:** everything used and dusty: edge-worn leather, tarnished brass, cloth faded at the folds.
- **Palette:** deep violet, orchil violet `#6B3F73`, near-black violet, dark brown, plum, terracotta, grey-violet,
  lavender, sand. Brass `#B08A45`.

**Five one-glance reads:**

1. Head: violet wrap with a knot bunch and a long frayed tail trailing left-rear.
2. Torso: a violet block crossed by a dark leather X.
3. Left forearm: the crescent bracer, later the closed Windwall.
4. Back: one steep lance diagonal with a bronze bob at the low left end.
5. Right hip: a tall rigid capped cane-tube quiver tilted 20° forward. Plus the long sash panels at the legs.

**Carry.** Lance on a steep diagonal 32–40° from vertical, butt low at the left hip, blade above the right
shoulder; bow on the opposite diagonal beneath it; cane quiver at the right hip; gaff at the left rear hip; three
pots and the net bundle at the lumbar; the furled Survey Kite (0.95 × 0.12 m) in the survey case once earned.

**Stow and unstow paths.** No hand passes behind the head plane to reach the back carry.
- *Lance:* the left hand takes the butt at the left hip and swings the shaft forward and up under the left arm;
  the right hand joins on the haft in front of the chest. The blade end clears the right shoulder as the shaft
  pivots; no hand rises above the shoulder. Stowing reverses it.
- *Bow:* the bow hand reaches back at waist height, takes the lower limb below the shoulder blade and draws the
  bow down and forward past the hip. Never over the shoulder.
- *Survey case:* opened only at a Brazier or a counter. The kite deploys from the case's lower flap by a waist
  lanyard.

**Animation bars (binding).** Idle hands fine. Running arms fore-aft beside the body. Bow draw hand at the cheek
outside the hair, elbow level with or behind the arrow line, bow arm clear of the chest. Never an arm behind the
head. Throws are pendulum or spin casts, never overhand. Melee is performed by the body with the weapon held
properly; heavy strikes are two-handed. The lance is never thrown. Stow, unstow, mantle, climb, roll and the
kite's hang pose obey the same arm rule as the draw.

### 5.3 Voice

Dry, numerate, patient. She talks in quantities and bearings, and she is funnier than she lets on. She has one word for them:
"Instruments". Illustrative lines:

- "Forty paces, two hands of wind. It hasn't seen us. Yet."
- "That line is a hand above my mother's lintel. Somebody is going to lose a roof."
- "It isn't angry. It's correct. That's worse."
- "Three bearings and I'll have this ground true. Keep them off me that long."

### 5.4 Arc

She starts as a guild officer doing her job: reading marks and moving pans out of the way. Ninewalls shows her that
getting out of the way no longer works. She learns that the Datum can be argued with in its own language, and
becomes the person who re-surveys the island benchmark by benchmark, making the map admit each village is true
ground. At the Fundamental she must set a Datum that keeps the western flank pinned *and* keeps the people on it:
not destroy the Survey, not obey it, but correct it.

## 6. People: archetypes and named NPCs

**Build rule**. Near-tier NPCs (the 6 nearest within 18 m) are built like Brea: full body, sculpted and
painted face from the face library, separate hair or headwrap with live cloth chains, layered faction outfit, the
same skin and eye shading. Adult heights 1.64–1.84 m; one adolescent build at uniform 0.90 scale.

### 6.1 The thirteen archetypes and the nine callings

| # | archetype | people | canon build | does | calling → dress cue |
|---|---|---|---|---|---|
| 1 | **Salt Raker** | Pan | F or M, 25–45 | rakes the pans by day | **The Harvester** "Feeds the island": head wrap, hoop earrings, sleeveless top under crossed straps, panelled skirt-apron over trousers, bracers |
| 2 | **Guild Matron** | Pan | F, 60s | runs the guild house; formal walk; brass guild chain | The Elder (see 12) |
| 3 | **Salt Porter** | Pan | M, 22–35 | carries salt baskets pans → store | **The Trader** "Connects the island": wide straw hat, open cream shirt, sash, baggy trousers, satchel straps |
| 4 | **Boat-Caulker** | Pan | M, 45–60 | tars boats on the black beach; tar-black forearms | **The Sailor** "Braves the waters": top bun, hoop earrings, cream crop top, layered skirt over shin wraps, arm bands |
| 5 | **Lantern-Keeper** (lookout) | Pan | F, 65+ | keeps the breakwater lamp at night; calls a warning when an Instrument comes within 80 m | **The Healer** "Restores balance": head wrap, white paste stripe, layered poncho-shawl with embroidery, long skirt panels, bracers |
| 6 | **Pit Farmer** | Holds | F or M, 30–50 | plants, waters and harvests the ash pits | **The Farmer** "Cultivates the land": short curls, headband, cream shirt rolled to the elbow, vest, embroidered sash, baggy trousers gathered at the shin, sandal-boots |
| 7 | **Tiller-Follower** (adolescent) | Holds | F or M, ~15 | trails Tiller herds with a seed bag | **The Dreamer** "Imagines tomorrow": short curls, neck scarf, cream shirt under a vest, sash, baggy trousers |
| 8 | **Cochineal Picker** | Holds | F, 20–35 | works the prickly-pear terraces; carmine-stained apron and gloves | The Harvester (alternate) |
| 9 | **Tube Smith** | Holds | M, 35–50 | forges bronze in the lava tube; leather apron, burn scar | — |
| 10 | **Fog-Netter** (lookout) | Fogcatchers | F or M, 20–40 | tends net arrays; whistles across the ravine and as an Instrument warning | — |
| 11 | **Goat-Herd Vaulter** | Fogcatchers | M, 18–28 | herds on ravine sides with a long pole | **The Guard** "Protects the people": tall, muscular, bare chest under a crossed harness, headband, bracers, belts with pouches |
| 12 | **Field-Book Elder** | Fogcatchers | F, 70+ | keeps the Mistfold archive | **The Elder** "Remembers": white beard, head wrap, long layered robe-vest with embroidered panels; and **The Scholar** "Seeks knowledge": round glasses, curls, vest with crossed straps, satchel (as the Elder's archive apprentice) |
| 13 | **Leveler** | sect | F or M | paces lines ahead of Screeds | none (see §4) |

In every case the calling gives *construction, fidelity and accessories*; the cloth colour is the archetype's own
people's colour with a violet accent (§4). Archetypes 4, 5 and 12 may be cast as either sex and across a wider
age band than the "canon build" column, so every calling has a home; the named NPCs keep
their written sex and age. The Scholar is the Mistfold archive apprentice. The Guard is a watchman who calls
warnings; nobody on Orchil fights Instruments for a living, and no human is ever an enemy to fight. The salt-paste
stripe is a Pan Houses working custom against pan glare; others wear a partial mark, and the full cheek-to-cheek
line is Brea's.

### 6.2 Named NPCs

| name | archetype | role |
|---|---|---|
| **Guild Matron Ansel** | 2 | Brea's guild superior at Saltrow. Rakes salt with her at 0:00; gives "Raker's Morning" and its reward (rung 2). |
| **Tube Smith Oro** | 9 | Ninewalls' smith. At 0:35 gives the Boat Gaff, the Pine Windwall, two Brine Pots and a Cinder Pot. Quilts rung 5 when the Holds figure is closed, and makes rung 6 after it. |
| **Lantern-Keeper Mise** | 5 | Saltrow's night lookout on the breakwater. |
| **Nesra** | 10 | Brea's mother, a Fog-Netter. Alive. She went back up to Mistfold nine years ago when her knees could no longer take the pans, and left her kite at the Saltrow guild house. Brea meets her in "The Harp". (Default; a writing item confirms it.) |
| **Elder Tavo** | 12 | Keeper of the Mistfold field books; gives "The Harp" with the Fog-Netters. |
| **Chainman Isk** | 13 | The Levelers' voice at the Muster. Never fights, never lies about the flank. |

Every other speaking part is unnamed until the writing area names it. No person, quest or place name from the
earlier prototype ever appears.

## 7. The Instruments

### 7.1 What they are

A self-maintaining population of survey and civil-engineering tools left by the Datum Survey. They are not angry
and not guardians of anyone: they are correct, and the villages are error. In-world speech says "Instruments".
Design rules that every kind obeys:

1. **A tool first.** One sentence of survey or civil-engineering work explains the silhouette.
2. **No heads, jaws, tails, faces or eyes.** Sensors are lamp drums, level vials and lenses behind irises, placed at
   the working end, never as a face on a neck.
3. **Size follows job:** small Instruments measure, medium ones sample and mark, large ones correct, the colossus
   observes.
4. **Honest weak points** (lamp, vial, tool, joint) that glow or read clearly, each at least 0.25 m across.
5. **Components come off as recognisable tools**, and the loot is usable.
6. **No control.** No Instrument ever fights for, follows, carries or obeys the player, and none converts another.
7. **Sound:** chimes, ratchets, escapements, gyroscope whine, ceramic clinks, staff rattle; a two-tone survey chirp
   on every lamp-state change. Never a roar.
8. **Mechanical locomotion**, every knee in the sagittal plane. Two-legged stilt walkers are allowed (the Spindle
   is one). What is never built is an animal or humanoid body: no torso with arms, no head on a neck, no spine
   that flexes.

### 7.2 Shared design language (binding for every kind)

- **White enamel shell plates** over **dark gunmetal joints and struts**, with **tarnished brass trim, rivets and
  gimbals**. Worn, layered, glossy on the enamel, dusty on the lowest 0.6 m.
- **Tall, slender, long-legged** survey-tripod and stilt proportions wherever the kind's job allows.
- **Antennae and spike finials** on top.
- **Glowing lamp lenses** behind irises; **glass level-vial tubes** that glow; **gyroscope rings**.
- **Faded violet survey banners** hanging from some.
- Real-world parents: the total station on its tripod, the theodolite, GNSS rover poles and domes, the survey drone.
- **Family mark:** graduations. Thin vermilion `#D2452E` and staff-white bands and brass
  numerals on legs, masts and staffs, as flat ink and engraving (never emissive, never broad toy stripes).
- **Materials:** white enamel `#E6DCC8` is the dominant hull colour. Celadon `#A9C4B0` and oxblood `#6E2421` glaze survive only as small accent parts (a Gauge's waterline
  band, a Kiln's firebox surround, a Sickle's hub cowl). Trim is tarnished brass and bronze; joints and struts are gunmetal. Verdigris stays on worn edges.

### 7.3 Lamp grammar: shape, then motion, then colour

| state | iris | beam | rhythm | colour |
|---|---|---|---|---|
| calm | 100 % | off | steady | warm bone lamp `#F2EAD3` |
| wary | 50 % | on, sweeping toward the stimulus | 1 Hz pulse | chartreuse `#B5E61D` |
| hostile | 20 % pinhole | on, locked | 4 Hz flicker; holds steady and brightens at an attack windup | cochineal magenta `#FF2D8C` |
| dark | closed, cracked | off | sputter, then out | `#3B3A36` |

**Colour rule.** State is carried by iris, beam and rhythm first, so it reads without colour. The calm lamp is a warm
bone-gold lens with a hot core. Level vials and gyroscope glass are pale ice glass (no bluer than `#D6F0EE`) with a
visible bubble. No lamp is ever red, and no lamp is a saturated orange or a saturated cyan: every lamp token must
pass the colour-distance lint. The four hues above are final. Detection is read from the lamp in the world
and from the compass ◆ pip; there is no glyph over an Instrument.

**Lens rule.** A lamp sits in a drum or housing at the working end, behind an iris, with visible instrument parts
around it (limb circle, vernier, telescope tube). It is never one centred pupil on a neck.

**Banner rule.** Faded orchil survey banners hang only from the Gauge, Plumb, Screed mast and Transit, small and
desaturated; none out-saturates Brea at 40 m.

**Scale rule.** Bodies keep the footprints in the roster. Tallness comes from masts, staffs, antennae and finials.
The Sickle and the Dredge stay low because their jobs are low. Nothing floats except the Sonde on its tether.

**Weak-point grammar.** *Lamp* (glazed lens at the working end; a precise hit darkens it 6 s) · *Vial*
(glass-windowed vessel of glowing fluid, shape-coded: Cinder round flask, Brine hexagonal cell, Dust ribbed
canister; Pry or precision bursts it) · *Tool* (the unlit working end; Pry tears it off and its attack is gone) ·
*Joint* (rings, seals and bearings; Brine seizes them, precision breaks seals).

### 7.4 The roster (twelve kinds)

Sizes are final (Screed 3.8 m, Kiln 5.5 m). Names, roles and looks here are canon. The Peg is a
0.9 m canister and the Tiller a 2.7 m six-legged hull.

| # | kind | job in one line | class, L×W×H (m) | group, where | role id |
|---|---|---|---|---|---|
| 1 | **Peg** | drives transect pegs between survey stations | small, 1.1 × 0.6 × 0.9 body; ranging pole to ~1.9 | swarms of 3–6; Pans, Malpaís | `swarm` |
| 2 | **Plumb** | a walking theodolite that takes readings and paints the Datum Line | small, 2.4 × 2.4 × 3.4 | alone at stations on ridges and pan edges; escorts Tillers | `sentry` |
| 3 | **Tiller** | cores the soil every few metres on one bearing | medium, 4.5 × 1.8 × 2.7 | herds of 3–6; Holds | `herd` |
| 4 | **Gauge** | runs the pans and the Glass on a tide clock | medium, 3.2 × 2.6 × 5.5 | alone, **neutral**; Pans | `keeper` |
| 5 | **Sickle** | cuts brush from sightlines | medium, 3.6 × 1.4 × 1.7 | packs of 2–3; Holds margins, pine belt, Cloudline | `flanker` |
| 6 | **Spindle** | carries the levelling staff; escorts the heavy correctors | medium, 2.0 × 2.0 × 3.8 | escorts Screeds and Kilns at 6–9 m | `duelist` |
| 7 | **Davit** | a crane that re-seats torn tools on other Instruments | medium, 4.0 × 2.4 × 4.2 | ~20 m behind any large kind | `support` |
| 8 | **Sonde** | a tethered survey balloon | small flier, 4.5 × 2.5 × 3.0 on an 18 m tether | over the Pans, in Cloudline fog | `spotter` |
| 9 | **Screed** | a walking road-grader that cuts error down to the Datum Line | large, 6.5 × 3.6 × **3.8** | alone with escorts; Holds; Leveler-guided | `heavy` |
| 10 | **Kiln** | a walking kiln that fires on geothermal heat and lobs cinder | large, 5.0 × 3.4 × **5.5** | at Malpaís wellheads; supports Screeds from 25–60 m | `artillery` |
| 11 | **Dredge** | a cable-laying train that maintains the Pinned Cliff anchors | large serpentine, 12 × 1.6 × 1.4 | the waterline and black sand; Drowned Flank, Pans (late) | `cable` |
| 12 | **Transit** | the island's great theodolite; walks the baseline once a year | colossal, 14 × 14 × 22 | alone; caldera rim to coast | `colossus` |

#### 1. PEG — the swarm that draws the lines
- **Look:** a small four-legged white-enamel canister with a piston mallet on its back, a rack of vermilion-capped
  pegs on its flank and one lamp at the front. A slender brass ranging pole and finial rise from the body to
  just above Brea's height, so a swarm reads as a row of walking poles.
- **Behaviour:** hammers transect pegs in straight lines between Plumbs. A live transect is a dashed line of glowing
  peg-heads; crossing one within 20 m of a Plumb raises that Plumb to wary. Pegs cut 1 m lanes through reed beds.
- **Attacks:** Mallet; Peg Shot (stagger); Swarm Rush.
- **Weak point:** the lamp (any hit kills). **Component:** the peg rack → bronze pins (arrow parts).

#### 2. PLUMB — the sentry
- **Look:** three long graduated staff legs meet at a brass tripod head; a lamp drum turns 360° on a short mast
  topped by a glowing **level vial**; a brass **plumb bob** hangs on 1.2 m of cable. The head is a gyroscope sphere in a brass ring, carried on the
  tripod legs (it does not float), so it can topple.
- **Behaviour:** stands at stations for 8–15 s readings; **paints the Datum Line**; on sighting Brea it **Flags**
  her: a hairline sightline, and every Instrument within 60 m knows her position for 8 s. Chimes on alarm.
- **Attacks:** Pendulum (bob swing, knockback); Bob Drop; Sightline (Flag).
- **Weak points:** the level vial (two hits and it cannot find level: it topples for 4 s); the lamp drum.
- **Components:** lamp drum (no more Flagging); plumb bob (no melee; the Counterweight Lance part).

#### 3. TILLER — the herd
- **Look:** a long white-enamel hull on six stilts, brass gimbals, a theodolite drum lamp at the front, a seed
  hopper under a shallow dome on top, an auger at the rear, a vertical mast and finial.
- **Behaviour:** herds core the soil on one bearing; Holds farmers plant in the holes. A herd does not react to
  Brea unless she stands on its bearing, and it never flees: on a Plumb's chime it closes file and keeps coring.
  To the player a herd is moving cover and a moving wall, not prey.
- **Attacks:** Auger Jab (rear); Hopper Burst (grit: Clouded 1.5 s); Herd Trample.
- **Weak point:** the drum lamp. **Components:** hopper → seed glass; auger → auger bit.

#### 4. GAUGE — the tide keeper (neutral)
- **Look:** a lighthouse on stilts: a squat float drum with a verdigris waterline band on four very long thin
  stilts, a graduated staff mast (0–6 m) with a sliding float ring, a sluice nozzle. The mast is a tall lantern-glass column hung with faded violet banners.
- **Behaviour:** opens and closes sluices on its own tide clock; the Pan Houses depend on it and resent it. Neutral
  unless the pans are damaged or it is attacked. Wades to 1.2 m.
- **Attacks:** Brine Jet; Stilt Stab; Wade Away.
- **Weak points:** ballast tanks (puncture → lists, −40 % speed); four knee seals. **Components:** brine pump, mast.

#### 5. SICKLE — the flanker
- **Look:** a low wedge body on four raked-back legs; a rotating hub at the front with two curved bronze blades
  that scissor; one slit lamp. The one kind that stays low and fast; enamel plates, an oxblood hub cowl.
- **Behaviour:** built to cut brush, now cuts people. Packs circle at 9–14 m and feint.
- **Attacks:** Scissor Lunge (8 m); Clearcut (360° spin); Brush Sweep.
- **Weak point:** the hub bearing, exposed in the Clearcut wind-up. **Components:** two blades; a coolant flask
  (vial; explodes on Cinder).

#### 6. SPINDLE — the duelist
- **Look:** two tall jointed stilt legs carry a level 2 m ring around a brass hub; it holds a 3 m levelling
  staff as a lance. The ring is a big brass wheel with a warm hub lamp.
- **Behaviour:** while the ring spins it deflects arrows from the front. Brine slows the ring; Dust stops it.
- **Attacks:** Staff Thrust (9 m); Ring Spin; Hop Stomp.
- **Weak point:** the hub bearing, exposed 2 s when the ring stops (a dull warm glow). **Components:** the staff;
  three ring segments.

#### 7. DAVIT — the repairer ("kill the healer first")
- **Look:** a compact six-legged hull with two folding crane arms, hook blocks on cables, and a visible rack of
  three spare enamel plates on its back (the count reads).
- **Behaviour:** walks to any Instrument with a torn tool and re-seats it from the rack in 4 s, with bronze sparks.
- **Attacks:** Hook Swing; Hook Grab (pulls Brea 3 m; a dodge breaks it).
- **Weak point:** the winch drum (Pry → no repairs). **Components:** plate rack (each plate shot off is one fewer
  repair); two hooks; cab lamp.

#### 8. SONDE — the tethered spotter
- **Look:** a lozenge survey balloon the size of a cart, thin enamel tiles, two ducted brass fans, an open gondola
  with a lamp and a sounding weight, and a **banded 18 m tether** to an anchor post or a walking Plumb. Nothing else on Orchil flies or hovers.
- **Behaviour:** shadows herds over the Pans; drops flares at night that Flag; in calima drops low and hunts by
  sound. Sees a kite-flying Brea at double range.
- **Attacks:** Weight Drop; Flare; Dust Purge.
- **Weak points:** the envelope (three punctures; Cinder burns it down); the tether (cut it and it drifts downwind
  and crashes); the fans (a net fouls them and it sinks).

#### 9. SCREED — the eraser
- **Look:** a walking road-grader: a wide hull on six short heavy legs, a 3.6 m bronze moldboard blade on two
  hydraulic rams in front, ripper tines behind, and a cab mast with a lamp drum reaching **3.8 m**. The blade lifts
  to 2.6 m in the charge wind-up. The mast carries a disc platform and a finial. Its fight gets scale and drama from mass, dust and the blade.
- **Behaviour:** walks to error and cuts it down to the Datum Line, leaving dead-straight scars. Cannot turn
  mid-charge: charging into a basalt column cluster, a crescent wall or the Organ Shelf stalls it for 3 s. Levels reed.
- **Attacks:** Blade Charge (25 m, bow-wave of lapilli); Spoil Throw; Ripper Sweep; Grade Stomp.
- **Weak points:** two ram seals (break both and the blade drops); cab lamp. **Components:** blade, ripper, spoil
  hopper; a ram cylinder (the Bronze Gaff).

#### 10. KILN — the artillery
- **Look:** a walking kiln: a beehive dome on four stumpy legs, a tall tilting chimney-mortar reaching **5.5 m**, a
  glowing firebox door, canisters on the flanks. White enamel dome plates with an oxblood firebox surround.
- **Behaviour:** plugs a hose into Malpaís wellheads and stands still for minutes (a stealth window); shells for
  Screeds from 25–60 m.
- **Attacks:** Cinder Mortar (three-shell volleys); Glaze Spray; Chimney Swing; Vent Surge.
- **Weak point:** the firebox door: **Brine on the hot door springs it open and staggers the Kiln for 2 s**, a
  window for Pry and precision on the firebox. No damage multiplier (§8.3). **Components:** four
  canisters (vials); the chimney (no mortar); the vent hose.

#### 11. DREDGE — the cable-layer
- **Look:** a cable-laying train: seven enamel drum segments on universal joints, a pair of short legs each
  (14 legs), a rotating cutter head in front, a cable reel behind.
- **Behaviour:** works the waterline in plain sight, laying and repairing the Pinned Cliff cables. It never
  hides and never goes under the sand. Its danger is the cable it has already paid out: loops of slack bronze
  cable lie across the beach behind it, and the reel hauls them taut.
- **Attacks:** Haul Taut (the slack loop Brea is standing in lifts and sings for 1.2 s, then snaps tight);
  Coil Sweep; Cutter Drag; Cable Lash.
- **Weak points:** six couplings (break two and the rear segments go inert); the cutter head. **Component:** the
  cable reel → bronze cable.

#### 12. TRANSIT — the colossus and the final fight
- **Look:** three 20 m solid graduated staff legs splayed to a brass tripod head; a house-sized instrument drum
  with a 9 m telescope and a ring of five lamps; survey pennants; three or four Plumbs hanging underneath, ready to
  drop. Its great level vial is a glass tube in a brass cage slung outside the drum: unlit by day (glass and a
  bubble, nothing more), back-lit bone-white at night. Nothing glows inside the body.
- **Behaviour:** once a year it walks the island's baseline from the caldera rim to the coast; anything on its
  sightline is queued for correction.
- **The fight:** (1) legs — shoot the nine knee seals, three per leg, to buckle a leg; melee the foot shoes;
  (2) drum — it tilts into reach; break the five-lamp ring while it drops Plumbs; (3) re-level — it tries to
  re-plant; pots and nets on the foot.
- **Attacks:** Leg Stamp; Sightline Sweep (Flags instantly and calls a Screed; the Mirror Windwall reflects it);
  Plumb Drop; Cable Lash.
- **Death:** a topple about the planted leg. **Never climbed. Never shown against a low sun in title, menu, loading
  or marketing frames.**

**Escorts.** Plumb → Tiller; Spindle → Screed, Kiln; Davit → any large kind; Peg → Plumb; Sonde → Plumb or an
anchor post.

## 8. Items

### 8.1 Weapons (six families, three variants each)

| family | variants (how got) | what it is for |
|---|---|---|
| **Bows** (juniper family) | **Sabina Bow** (start) · **Cane Recurve** (Saltrow merchant; fast, quiet) · **Sighting Bow** (reward for three triangles; ×2 zoom, long Steady) | precision; toppling a Plumb by its level vial |
| **Lances** (shepherd's family, 1.55 m) | **Shepherd's Lance** (start; bronze leaf blade, bob-shaped butt cap, graduated haft) · **Obsidian Lance** (Ninewalls merchant; Pry specialist) · **Counterweight Lance** (craft: a Pried Plumb bob + bronze ×4; heavy) | reach against packs; two-handed heavy; never thrown |
| **Gaff** | **Boat Gaff** (Oro, 0:35) · **Rake Gaff** (Saltrow merchant) · **Bronze Gaff** (craft: a Screed ram cylinder) | fast combo; **hook-rip** pulls a component off small and medium Instruments |
| **Windwall** (crescent fan-shield, nine slats) | **Pine** (Oro, 0:35) · **Scute** (craft: Tiller scutes ×9) · **Mirror** (Calibration Yard quest; a perfect parry reflects a Plumb sightline or the Transit's sweep) | guard, parry, bash, and **plant** as 0.9 m of cover that blocks line of sight |
| **Pots** (clay, pendulum cast) | **Brine Pot** and **Cinder Pot** (Oro, 0:35) · **Dust Pot** (craft: pumice ×3) | Brine mist slows and quenches a Kiln firebox; Cinder fire pool; Dust cloud blinds and breaks lock |
| **Cast Net** (spin cast) | **Hand Net** (fishing hut, hour 2) · **Basalt Net** (craft: basalt sinkers ×8) · **Wire Net** (craft: bronze cable ×3) | fouls Pegs and Sickles; fouls a Sonde's fans so it sinks |

### 8.2 Ammo (five arrows)

| arrow | does | made from |
|---|---|---|
| **Reed** | Blunt damage | cane shaft, gull feather |
| **Barbed** | Pry: tears tools off | cane shaft, gull feather, bronze pins or obsidian flake |
| **Brine-Gourd** | Brine: builds Seized | + a brine gourd |
| **Cinder-Resin** | Cinder: builds Charred | + vent resin |
| **Dust-Puff** | Dust: "Clouds an Instrument: its lamps go blind for 6 s" | + pumice dust |

Reed arrows are fletched in orchil violet and white. Only element heads glow, and only in their element colour.
There is no violet-glowing arrow tip.

### 8.3 Elements, statuses, damage words

| element | status (player word) | what it does | colour |
|---|---|---|---|
| **Cinder** (vent resin) | **Charred** | burn over time; strong on Sonde envelopes and Kiln canisters | `#FF7A1A` |
| **Brine** (corrosion) | **Seized** | joints lock 8 s; a seized tool or plate comes off with one Pry hit or hook-rip. No damage multiplier | `#BDE6E3` |
| **Dust** (calima) | **Clouded** | lamps blinded; strong on Plumb and Sonde | `#C98B4E` |

Player damage words: **Blunt** and **Pry**. Verbs: **Steady** (a 4 s breath-hold that zeroes bow sway, then 2 s of
shake; innate, no cooldown, no slow motion) · **Undercut** (stealth blow from behind) · **Felling
blow** · **Sighting** (raise the Alidade) · **Take a bearing** (while Sighting, hold one Instrument as a pip on
the compass strip with its bearing; one at a time, nothing is drawn in the world). **Flagged** is a state, not a
verb, and it only ever means that Brea has been marked (§14). Engine status identifiers never reach the UI.

### 8.4 The armour ladder: eight rungs (binding)

Every rung keeps her wrap and tail, the paste stripe and the back carry. Each rung is one verb perk; armour never
changes movement speed, dodge, jump or slide.

**One rung at a time.** Each rung is cut to be fitted over the one below it, so a rung's source opens only when
the rung below is owned. A rung earned early waits at its giver's. Intended pacing: rung 2 in hour 1, rung 3 in
hour 2, rung 4 in hours 2–3, rung 5 in hour 3, rung 6 in hours 3–4, rung 7 at the Kiln Yards, rung 8 at the end.
No more than two rungs can be held inside the first hour. Variants within a rung are customization only (wrap style, a
half-cape, trim, colour scheme; the wrap's violet is locked).

| rung | tier label and tagline | in-world name | look | verb perk | how got |
|---|---|---|---|---|---|
| 1 | **STARTER** "Trusted gear for the long road." | Raker's Whites | §5.2 | **Brine-wade:** wading brine adds no Brine build-up and no wet-step noise | start |
| 2 | **SCOUT** "See farther." | Guild Whites | layered violet-and-linen vest, one-side shoulder guard, patterned leg wraps, long panel skirt, woven palm hat | **Shrug:** a Plumb's Flag lasts 3 s, not 8 | quest "Raker's Morning" (Ansel) |
| 3 | **RECKONER** "Track deeper." | Brine-Cured | cowl, slung survey satchel, celadon shoulder scutes, bronze-banded shin guards, tabard with a pale lower panel | **Mist-fighter:** no Brine or slow inside her own Brine Pot mist | quest "The Wrong Tide" (hour 2): made at the Saltrow guild house from salt ×40 and the three Gauge float scutes the quest yields; never by killing Saltrow's Gauge |
| 4 | **VEIL** "Move unseen." | Pit Wraps | hood over the wrap, rust face veil, mica goggles, long black-wool coat with a frayed hem | **Ash-step:** a jog on ash, sand and reed litter makes no noise | the Ninewalls counter, salt ×120, once rung 3 is owned |
| 5 | **PIONEER** "Build forward." | Lattice Quilt | undyed quilted coat in the crescent-wall stitch, crescent bronze gorget, tool belt, bronze greaves | **Brace:** knockdowns become a 0.4 s stagger | Oro quilts it when the Holds figure is closed (T2 sighted and both Holds benchmarks re-surveyed; about hour 3) |
| 6 | **VANGUARD** "Hold the line." | Celadon Lamellar | ceramic tile rows, ceramic pauldrons, violet tabard edged in brass | **Ring-parry:** Windwall parry window ×1.5 | made by Oro (ceramic ×12 + Sickle blade ×2), once rung 5 is owned |
| 7 | **ARCANE** "Read the old marks." | Oxblood Lamellar | oxblood tiles engraved with vernier scales and brass numerals, a brass alidade-rose belt medallion, layered violet robes with graduated-tick embroidery. No runes, no magic | **Kiln-walk:** fire pools and glaze puddles do no damage | quest "The Kiln Yards" (held at Oro's until rung 6 is owned) |
| 8 | **CELESTIAL** "Fix by the stars." | the Datum Plate | bone-white tiles with brass graduations engraved as an ephemeris table; a calm lampglass at the sternum, the only armour emissive. No crystal glow | **Read as true:** while she walks or stands, detection fills at half speed (hostile Instruments are not fooled) | the Fundamental (final act) |

Rungs 6 and 7 are salvaged Instrument enamel plates re-glazed by the Tube Smiths in island glazes (celadon, oxblood);
rung 8 is raw white Instrument enamel with brass. All eight read as one violet-and-leather family that escalates.

Off the ladder: Fog Felts I–III (a possible later Mistfold regional set) and Calima Veil. Retired perks: Dust-sight,
Sure-foot, Fog-mend, Thrown whistle. The base whistle (lure to where Brea stands) stays.

### 8.5 Tools, consumables, currency

- **Alidade** (§5.1). **Fog-water Gourd** (heal; two at the start; refilled at a cistern). **Whistle** (lure).
- **Salt** is the only currency (20 at the start; raked from the pans, found in salt caches, paid by Guild Notices).
- **Field Books** (24): survey notes, sketches, an 800-year conversation.
- **Field Book certifications** replace XP and skill trees: **Transect**, **Ballast**, **Bearing**, 3–5 ranks each,
  earned by survey acts (re-surveys, triangles sighted, tools Pried), never by kills. Health rises only through
  Ballast. Drawn as a triangulation net, not hexagons.
- **Kit Rack**: the real-time gear selector (a protractor half-ring at the right screen edge, five sectors) plus
  quick slots 1–4. The world keeps running.

### 8.6 Materials (consolidated)

| material | from |
|---|---|
| salt | pans, caches, bounties |
| cane shafts (carrizo), juniper | reed beds; wind-bent sabinas |
| gull and shearwater feathers | birds |
| obsidian flakes, pumice (dust), basalt sinkers, clay | Malpaís and Caldera ground |
| vent resin (Cinder) | fumaroles, wellheads |
| brine gourds (Brine) | the pans |
| calima dust (Dust) | calima days; Tiller hoppers |
| cord, wool, mica, goat horn, hide, scale, meat | settlements and fauna |
| bronze pins | Peg rack |
| seed glass, auger bit, Tiller scutes | Tiller |
| plumb bob, lampglass (per kind) | Plumb; any lamp |
| Gauge float scutes, brine pump | Gauge |
| Sickle blade, coolant flask | Sickle |
| ram cylinder, blade, ripper | Screed |
| ceramic (enamel plate) | any hull; Davit plate rack |
| bronze cable | Dredge reel |
| escapement | any Instrument (the "works") |

## 9. The four features

| feature | what it does | rules |
|---|---|---|
| **the Brazier** | rest and save | A basalt bowl on three stones beside a stone cistern, kindled with pitch-soaked driftwood (Brea's name means pitch). Sit, choose the light to wake to (dawn, golden, dusk, night), and the game saves. Refills the gourds. Refused while any Instrument within 60 m is wary or hostile. **Never a travel node.** UI words: BRAZIER, KINDLE, REST, REST UNTIL DAWN / GOLDEN / DUSK / NIGHT, and no others. |
| **the Making ledger** | making ammo and kit | The MAKING tab: a two-column glass ledger. Left, rows for the five arrows, three pots and nets with carried / cap. Right, the item on a turntable (no glow plate) with its recipe as tallies of island materials and its effect in plain words. Buttons **MAKE ×1** and **MAKE ×6**, and no other verb. In the field, hold a quick slot (1–4) for 1.2 s to quick-make a bundle of six for that slot at normal time; taking damage interrupts it. |
| **the Survey Kite** | gliding on the wind | A two-cell box kite of split carrizo cane and undyed sailcloth with an orchil-dyed leading cell, bridled to a cane crossbar she hangs from. Fogcatchers fly such kites to carry fog-net lines over the barrancos; the Pan Houses use them for aerial sightings. Carried furled as a roll. Opens only when airborne ≥ 0.35 s with ≥ 3 m clearance. Glide 5:1 in still air; the trade wind helps or hinders; **ridge lift** on windward slopes. **Calima and squalls ground it.** Plumbs and Sondes see her at double range. No weapons in flight. Rectangular cells and visible spars. Earned at Saltrow. |
| **Reed cover** | hiding in reed by water | Continuous beds of **carrizo** cane (2–3.2 m, pale green-gold) and **junco** salt rush (crouch height) along water, plus the marram colonies. They hide her **while the wind moves them**: in trade gusts she can crouch-walk hidden; in a lull only stillness hides her. Pegs cut transect lanes through reed; Screeds level it; Cinder burns it. **The golden meadow never hides her.** Tip: "REEDS HIDE YOU WHILE THE WIND MOVES THEM". The only word for it is reed. |

## 10. Presentation canon (only what touches lore)

- **Wordmark:** CALIMA in Chakra Petch 600 caps; the I is a plumb line ending in a bob, with the spark (the calima
  sun) full and unclipped above it; one hairline datum rule beneath; a small broad arrow under the I. One tagline
  line (§1). Not thin wide-tracked caps, no four-point star.
- **UI:** dark violet glass (`#1E1A28`), right angles with registration ticks, lilac selection line, Chakra Petch
  and IBM Plex Mono. Thin field HUD: theodolite compass strip with a three-digit bearing, levelling-staff health,
  small tool icons, a field note, weapon and ammo. No minimap. Hub tabs: MAP · FIELD LOG · SATCHEL · MAKING ·
  CHARACTER · SKILLS · FIELD BOOKS · SETTINGS. Map legend words: BRAZIER, BENCHMARK, TRIG PILLAR, SETTLEMENT.
  Markers: settlement ■, site ●, benchmark ▲ broad arrow, Instrument ◆ in lamp colour.
- **Title screen:** key art at 18:40 golden light with the station menu on a left scrim.
- **Sound and music:** surf, trade wind, guild bells, whistled motifs, plucked strings, ratchet and clapper
  percussion, low bowed drones in the Cloudline. No taiko, no frame drums, no choir.

## 11. Story and quests

### 11.1 The spine

| act | what happens | named pieces |
|---|---|---|
| **I. The line on the wall** (hour 1) | A wrong tide, a transect through the pans, the first triangle, a Screed on Ninewalls, the first re-survey. The premise lands: ground can be made true. | "Raker's Morning", "The Scar", "True Ground" |
| **II. Re-survey the island** (open) | Sight the six trig pillars to open the map triangle by triangle. Re-survey the twelve benchmarks so each region stops being error. Three regional problems: retune the **Fog Harp** so water returns to Mistfold; quench the four wellheads to shut down the **Kiln Yards**; break the **Levelers'** pegged lines below the Pinned Cliff and survive the **Dredge** at the cables. Untimed Guild Notices; the fishing hut's net; the Survey Kite. | "A Line Over the Glass", "The Wrong Tide", "The Kiln Yards", "The Harp" |
| **III. The baseline** (end) | At the **Calibration Yard**, move four target boards so every Instrument in the region measures badly for the act. The **Transit** walks the island's baseline from the caldera rim; fight and topple it. At **the Fundamental**, wearing the Datum Plate, set a new Datum that keeps the flank pinned and the people on it. | "The Yard", "The Fundamental" |

Each region is one **figure to close**: one trig pillar, two benchmarks and one settlement or site problem. Closing it
does four visible things: the map sheet fills in, the vermilion line comes off the walls, the correcting Instruments
leave, and a Brazier can be kindled at the pillar's foot. That is the progress bar, and it is in the world.

### 11.2 The first hour: three quests, nine canon beats, two inserts

A New Game starts at 07:00 on a clear trade-wind morning. Objective types: talk, goto, sight, kill, gather, survey.

**Quest 1 — RAKER'S MORNING** (Saltrow; Guild Matron Ansel). First field note:
`FIELD NOTE · RAKER'S MORNING · Rake the third pan with Matron Ansel`

| time | beat | objective | teaches |
|---|---|---|---|
| 0:00 | Brea wakes beside her cistern; the Brazier has burned down to grey ash. A Pan Houses sighting kite flies over Saltrow. | Walk down to the pans; rake the third pan with Ansel (salt ×10) | move, interact, salt is money |
| 0:05 | A **Gauge** opens Sluice 3 at the wrong tide and floods the pan. | Raise the Alidade and read it: `GAUGE · SLUICE 3 · TIDE 0.4 m`. Tell Ansel. | Sighting; the premise in one exchange |
| 0:08 (insert) | | Cut cane at the dyke and make a bundle of Reed arrows | the Making ledger; quick-make |
| 0:10 | **Pegs** hammer a transect through the pans to the black beach. | Cross the Peg line without being Flagged; put out the Pegs' lamps (optional count) | bow, Steady, transects, Flagged. The path crosses golden meadow (does not hide her) and then salt rush at the Glass rim (does): Reed cover and its tip |
| 0:18 | | Climb trig pillar **T1** on the Organ Shelf; sight T2 and T6 | climbing, triangulation, the map. The Sounding Ring, the Scar and the caldera rim on the skyline |
| 0:21 | From T1 she sees a **Plumb** at the pan-edge station, painting the Datum Line along Saltrow's outer dyke. The Pegs that laid the morning's transect attend it. | Come down on it through the lee ditch's rush. Topple it: two hits on the level vial, then Pry the bob while it is down. The Peg swarm rushes when it chimes. | weak points, the topple, Pry, a swarm. The line is now on Saltrow's own wall |

Reward: rung 2 (Scout, Guild Whites), salt ×30. The Brazier at T1's foot can now be kindled. The first evening's
rest at Brea's cistern is where a first session naturally ends.

**Quest 2 — THE SCAR** (Ninewalls; Tube Smith Oro).

| time | beat | objective | teaches |
|---|---|---|---|
| 0:28 | A second **Plumb** has set up on the terrace above Ninewalls and is painting the line across the pit walls. Between Brea and it a **Tiller herd** is coring up the slope on its bearing, Ninewalls youths trailing it with seed bags. | Reach the Plumb. The herd is the terrain: walk in its lee, where the hulls block the Plumb's sightline (the herd holds its bearing and does not react to her), or take the barranco's carrizo on a gust. Undercut the Plumb from behind, or topple it. Make Barbed arrows from the Peg pins. | moving cover, Undercut, the Holds |
| 0:35 | **A Screed walks on Ninewalls' crescent walls**, the Datum Line painted on them at its cut height. | Find Oro at the tube mouth (he hands over the Boat Gaff, Pine Windwall, two Brine Pots, one Cinder Pot). Stop the Screed before the third wall: lure its charge into a wall so it stalls for 3 s, break both ram seals, while a **Sickle** pack flanks. | heavy fight, melee, Windwall, pots, the wall trick. This is the first Screed the player meets |

Reward: salt ×60; Oro's kit is hers to keep; the Ninewalls counter opens. (Rung 5 comes from Oro when the Holds
figure is closed, §8.4.) Fail-soft: if the Screed reaches the third wall the
quest continues with that wall cut down to the line; the village is poorer but the game does not fail the player.
Oro's line: "It will send another. It is not angry. The wall is not on its map."

**Quest 3 — TRUE GROUND.**

| time | beat | objective | teaches |
|---|---|---|---|
| 0:45 | | Follow the Scar's straight line to **Benchmark 1**. Hold the Alidade on the mark for 15 s and take three bearings while Instruments come to look. | re-survey under pressure (planting the Windwall first is the intended answer). Ninewalls becomes true ground: the line fades from the walls and the Screeds stand down |
| 0:50 (insert) | | Kindle the Brazier at the Ninewalls cistern and rest (the dialog pre-selects noon for this one rest) | the Brazier; the first named save |
| 0:55 | **Calima** rolls in at noon. | Cross to the Malpaís edge under the dust; read what is walking on the rim: `TRANSIT · BASELINE · STATION 1 OF 9` | weather stealth; the hook. The Transit's pale legs show through ochre haze at noon, never against a low sun |

Reward: the travel node at Benchmark 1; the hour-2 quests open.

**Starting loadout.** Starter rung, the archer's crescent bracer, the Alidade, the Sabina Bow with 12 Reed and 6 Barbed
arrows, the Shepherd's Lance (stowed), two fog-water Gourds, salt ×20.

**Tutorial cards** (one at a time, 8 s): `MAKE · hold a quick slot to make six` · `REEDS HIDE YOU WHILE THE WIND
MOVES THEM` · `BRAZIER · rest to choose the light. Resting saves.`

### 11.3 After the first hour

| quest | giver, place | spine | reward |
|---|---|---|---|
| **A LINE OVER THE GLASS** | Ansel, Saltrow guild house | The Pan Houses' sighting kite is torn. Brea's Fogcatcher mother left one at the guild house; rebuild it (cane ×8, cord ×4, sailcloth from the wreck on the black beach), cut the moored Sonde's tether so the test flight is not Flagged, and fly from T1 to the Sounding Ring on the trade wind. | **the Survey Kite** |
| **THE WRONG TIDE** | Ansel | Follow the Gauge through one tide; find the benchmark it is levelling to (Benchmark 2, in the Glass); re-survey it; the Gauge returns to the Pan Houses' clock. | the pans produce again; rung 3 (Reckoner) |
| **THE KILN YARDS** | Oro | Quench four wellheads with Brine Pots while Kilns are plugged in; Spindle escorts. | rung 7 (Arcane) |
| **THE HARP** | Fog-Netters, Mistfold | Retune five winches to a whistled pattern; water returns. | Mistfold grows; cable baskets |
| **THE YARD** | — | Move four target boards at the Calibration Yard. | the region's Instruments are out of adjustment for the act; Mirror Windwall |
| **THE FUNDAMENTAL** | — | The Transit's baseline walk; then set the new Datum. | rung 8 (Celestial); the ending |
| **Guild Notices** | notice boards, Saltrow and Ninewalls | Untimed bounties: "Bring back an unbroken Sickle blade"; "Three lampglasses, any kind"; "Walk the Scar end to end unseen". | salt, cord, materials |

The quest marker is the benchmark **broad arrow**, never a diamond (◆ is reserved for Instruments). A tracked quest is
one compass marker and the field note; there is no floating world beacon.

### 11.4 The ending (default; the writing area drafts the text)

There is no binary choice. At the Fundamental Brea runs the last adjustment: one bearing for each benchmark she
has re-surveyed, taken in turn while the toppled Transit's Plumbs come to look. The mechanic is the re-survey she
has done all game, at length.

- At least **four of the six figures** must be closed before the dome will open.
- The new Datum keeps the anchoring works' instruction (the flank stays pinned) and enters every re-surveyed
  region as true ground.
- A region she did not close stays in error. The epilogue walks the island and shows each region as she left it:
  line on the walls or not, Instruments correcting or only measuring.
- The Levelers are not defeated. Chainman Isk reads the new sheet and walks the new line.

### 11.5 Writing still owed

All dialogue; the 24 Field Books; the Guild Notices; the ending's text; names for unnamed speaking parts. These
are items of the writing area in the build plan, each tied to the milestone that first shows it.

## 12. Core loop and controls

**The loop in one sentence: read the ground, reach the mark, make it true, come home.** Brea wins by measuring, not
by killing; kills are how she reaches the mark alive.

| step | the player does | reward |
|---|---|---|
| **READ** | raises the Alidade; reads Instrument cards, transects, the Datum Line, wind and light | a plan |
| **REACH** | crosses worked ground: reed beds, transects, basalt stairs, cinder slides, a kite line off a ridge | position |
| **UNMAKE** (optional) | takes a tool off an Instrument, blinds a lamp, topples a tripod, fights when cornered | parts; a safer mark |
| **MAKE TRUE** | triangulates from a trig pillar, or holds a 15 s re-survey at a benchmark | true ground; a travel node; certification progress |
| **COME HOME** | rakes, trades, makes ammo, kindles a Brazier and rests | restock; the save; the light she wants next |

**Controls.** Move WASD · sprint Shift · walk Alt · crouch C · jump and mantle Space · dodge Ctrl · interact, climb,
re-survey (hold), kindle, sit E · Alidade V · take a bearing T (while Sighting) · Gourd Q · aim or guard RMB · loose, strike, bash LMB
(hold = heavy) · Steady Shift while aiming · plant Windwall X while guarding · cast pot or net F · hook-rip R ·
whistle G · quick slots 1–4 (1 bow, 2 lance, 3 gaff, 4 pots and net; empty until earned) · arrow or pot type:
mouse wheel · quick-make: hold a quick slot 1.2 s · Kit Rack Tab (hold; the half-ring arrives with Oro's kit) · open the Survey Kite:
Space again when airborne ≥ 0.35 s with ≥ 3 m clear · fold the kite C or Ctrl · hub Esc, map M, Q and E cycle hub tabs.

**Gamepad.** The engine's input layer already reads a pad for movement, camera and the older verbs. The new
verbs take: Alidade D-pad up · take a bearing R3 while Sighting · Gourd D-pad down · whistle D-pad left · quick
slots D-pad right (tap cycles, hold 1.2 s quick-makes) · Kit Rack LB (hold) · plant Windwall A while guarding ·
cast RB · hook-rip Y · open the kite A again when airborne, fold B · hub Start · map Select. Existing bindings
are read from the input layer when the slice is built and this line is corrected to match them.

**Traversal.** Walk, jog, sprint, crouch, jump, mantle, 1 m ledge climb, dodge, cinder and scree slides, wading to
1.2 m, the Survey Kite, cable baskets at Mistfold. That list is complete. Armour never changes speed, dodge, jump
or slide.

**Travel.** Nodes are re-surveyed benchmarks and the Saltrow guild-house stud. A Brazier is never a node, Brea's
cistern included. Travel is free, is refused
while Flagged or while any Instrument within 60 m is wary or hostile, and advances the clock by the walking time. The
UI words are **WALK THE LINE TO …** and no others.

**The Survey Kite in numbers.** Still air 7.5 m/s forward, 1.5 m/s sink (5:1). The trade wind adds 0.4 × wind speed to
ground speed (about 6.5:1 downwind, 3.5:1 upwind). Ridge lift on windward slopes of 25° or more within 40 m below:
+0.5 to +1.5 m/s, capped at launch height + 25 m. Landing at 3 m/s vertical or less does no damage. Because the wind
blows from 045, the island has a downwind grain: routes home to Saltrow are fast and routes up to the caldera are
walked. Three wind roads chain ridge lift (the Organ Shelf rim, the Scar's north lip, the caldera's windward wall),
marked by old Fogcatcher line-posts whose cloth streams when the lift is on. Trig pillar tops are launch points.
**Hang pose:** a hip sling and chest strap take her weight; her hands hold a cane control bar at sternum-to-chin
height, 0.30–0.40 m in front of the chest, elbows bent and below the shoulders. Her arms are never overhead.

## 13. Combat rules

1. **Take the tool, not the health bar.** Every Instrument attack belongs to a visible tool; Pry it off and the attack
   is gone. A fight is a sequence of removals.
2. **Shape, motion, then colour.** The player reads an Instrument by its iris, beam and rhythm before its hue.
3. **Real time always.** Hit-stop is a capped freeze (≤ 120 ms per hit, ≤ 180 ms in any second), not slow motion.
4. **The ground fights.** Crescent walls and basalt clusters stall a charging Screed; reed burns; calima blinds.
5. **Melee is performed by the body.** Hips first, both hands on the shaft for heavy beats, weapon gripped at its
   sockets. The lance is never thrown. Pots are pendulum casts and nets are spin casts at waist-to-chest height; no
   overhand throw exists. The Undercut is a low two-handed thrust from a crouch, never an overhead stab.

**Bow numbers.** Sabina Bow: draw 0.65 s, damage ×1.0. Cane Recurve: 0.45 s, ×0.8, noise ×0.7. Sighting Bow: 0.9 s,
×2 zoom, weak point ×1.5, Steady 6 s. Steady: sway 0 for 4 s, then 2 s of shake; no cooldown.

**Bow pose (binding).** At full draw the string hand's index knuckle sits within 0.03 m of the **jaw-corner
anchor**, a point fixed to the head bone on the skin at the right corner of the jaw. The hand is at the cheek,
touching, not floating beside the head, and the whole hand is outside the wrap volume (knot, folds and tail).
Elbow at shoulder height or behind; bow arm 165–172° and at least 0.04 m clear of the chest; the loose
travels 8–12 cm back along the jaw; the nock reach goes to the forward-tilted hip quiver, below the shoulder. Never
a hand or forearm behind the head, in any stance, at any camera angle.

**Carry caps.** Reed 36 · Barbed 18 · each element arrow 12 · pots 3 · net 1 · Gourds 2 (3 with Ballast II). Arrows
are made in bundles of six. There are no rarity tiers on ammo.

**How fights scale.** Every Instrument of a kind is the same Instrument. Four dials, all visible in the world:

| dial | what changes | how the player sees it |
|---|---|---|
| composition | the escort grammar (§7.4) | count the kinds: a Screed alone is hour 1; Screed + Spindle + Davit + a Leveler is hour 4 |
| correction pressure | untrue regions draw correctors more often; a re-surveyed region keeps measuring kinds only | the Datum Line on the walls and the scars on the ground |
| calibration | an Instrument fresh from the Calibration Yard is *in adjustment*: perception ×1.25. After "The Yard", the region's Instruments are *out of adjustment*: −25 % | a brass calibration tag and a fresh pennant |
| weather and hour | calima, fog, night, wet ground, lulls | the sky |

A late-game Peg still dies to one hit, and an early Screed is still beatable with the wall trick. Encounter cap: one
large plus four medium or small within 60 m, or the colossus plus three Plumbs.

**Humans are never targets.** Aiming at a person lowers the bow.

**Tolerance (difficulty).** Three settings named as survey accuracy classes, chosen at New Game and changeable in
Settings: **Loose** (damage in ×0.6, out ×1.25, detection ×0.8) · **Standard** · **Fine** (×1.5, ×0.85, ×1.2).

**Death.** The screen is glass with `THE LINE IS LOST` and two stations: RETURN TO THE LAST BRAZIER / QUIT TO TITLE.
Brea stands up at the Brazier where she last rested, at the hour of her death. Everything a silent checkpoint
recorded since that rest is kept (§17). Nothing is taken from the satchel.

## 14. Stealth

| piece | rule |
|---|---|
| states | calm → wary → hostile → dark (§7.3) |
| **Flagged** | a Plumb sightline or a Sonde flare: every Instrument within 60 m knows her position for 8 s (3 s on rung 2) |
| **transects** | a live Peg line; crossing within 20 m of a Plumb raises it to wary |
| **Reed cover** | she is hidden when she is in cover and either still or the wind there is 4 m/s or more. Below 4 m/s only stillness hides her. Carrizo hides her standing; junco only crouched; marram colonies count; the golden meadow never does |
| reed is consumable | Pegs cut 1 m transect lanes; Screeds level it; Cinder burns it (no cover for 120 s); cutting cane thins a 1 m circle for 120 s |
| weather | calima and fog halve Instrument sight; night ×0.7; squall ×0.8; wet ground is loud |
| noise | footsteps depend on the surface; rung 4 silences a jog on ash, sand and reed litter |
| whistle | draws the nearest Instrument's search to where Brea stands |
| tools | a Dust Pot breaks lock and resets alert; a planted Windwall is 0.9 m of cover that blocks sight |
| **Undercut** | E behind an unaware Instrument |

**How the player reads detection** (no glyph over any Instrument): the lamp itself; the compass ◆ pip in that
Instrument's state; a 6 % vignette while anything is wary or worse; sound (a Plumb chime, a Tiller ripple, ratchets
speeding up). When Flagged, the hairline sightline is drawn in the world from the Plumb's lens to Brea in staff-white,
and a vermilion pennant sits over Brea's own compass marker. The sightline is information, not a weapon. The Mirror
Windwall's reflection darkens the lamp for 4 s and deals no damage.

**Stealth has a clock.** A reed crossing is planned around the wind: wait for the gust (the canes lean, the rustle
rises), move, freeze in the lull. In trade weather the wind at a reed bed cycles **a 9 s gust (5–7 m/s) and a
5 s lull (1.5–3 m/s)**, period 14 s ± 2 s, phase seeded per bed so two beds are never in step. On a calima day
the lull is 8 s. At night the gust is 7 s. The canes begin to lean 0.8 s before the gust reaches 4 m/s, which is
the player's cue.

## 15. Progression

Growth is earned by survey acts and is granted the moment it is earned. Kills move no counter.

**Three things grow.**

1. **Armour rungs** (§8.4): eight, one verb perk each, owned strictly in order (a rung's source opens only when
   the rung below is owned). It is a ladder of verbs, not of power: armour and resist numbers rise by at most 5 %
   per rung.
2. **Certifications:** Brea's guild standing in three disciplines. Every rank is earned by a counted survey act and
   granted the moment the count is met, with a card. Shown on the SKILLS tab as a triangulation net (44 px circles
   with the broad arrow, 1 px rules; never hexagons), headed `CERTIFICATIONS`.

| certification | the act counted | I | II | III | IV |
|---|---|---|---|---|---|
| **TRANSECT** | live transects crossed unseen; Undercuts; metres moved hidden in reed | Quiet Line: crouch-walk noise −30 % | Second Wind: reed hides a crouch-walk from 3 m/s | Lane Walker: moving along a cut Peg lane makes no reed noise | Undercut the Large: works on ram seals and the firebox |
| **BEARING** | triangles sighted; lamps darkened; vials cracked at 30 m or more | Long Breath: Steady 5 s | Back Bearing: the held bearing also reads its range in metres | Fast Nock: draw −10 % on a held Steady | True Reading: Sighting range +25 % |
| **BALLAST** | benchmarks re-surveyed; tools Pried; pots and nets made | +15 health | Third Gourd | Deep Satchel: +1 pot, +6 of each element arrow | +15 health; quick-make 0.8 s |

3. **Order.** Geodetic control is graded by order of accuracy. Brea starts as a Third-Order
   Reckoner and can reach Second and First. Order is computed only from ground made true, shown on the CHARACTER page
   as `BREA · SALT-PAN RECKONER · SECOND ORDER` with one bar, `GROUND MADE TRUE 31 / 55 ha`. It gives no stat increase.
   It gates the guild's better stock, "The Yard" (Second Order) and "The Fundamental" (First Order).

**Weapons** are sidegrades with a role (§8.1): no weapon level, no upgrade slots.

**Field Books** (24, found) are lore only. Each one also inks a single mark on the map (a salt cache, a line-post, a
benchmark's approach). They never grant abilities.

## 16. Making and economy

**Two supply chains.** Ammo comes from the land (cane, feather, resin, brine, dust). Gear comes from the Instruments
(bronze, ceramic, named tools). The player never farms Instruments for arrows.

| item | made from | yields |
|---|---|---|
| Reed arrow | cane ×2, gull feather ×1 | 6 |
| Barbed arrow | cane ×2, gull feather ×1, obsidian flake ×2 (or bronze pins) | 6 |
| Brine-Gourd / Cinder-Resin / Dust-Puff arrow | cane ×2, cord ×1, and brine ×1 / vent resin ×1 / pumice dust ×1 | 6 |
| Brine / Cinder / Dust Pot | clay ×1 and salt ×2 / vent resin ×1 / pumice ×3 | 1 |
| Cast Net | cord ×6, basalt sinkers ×8 | 1 |

Quantities are starting values for tuning. Arrows, pots and nets are made anywhere. Rung 3 and the Sighting Bow
hand-in are at the Saltrow guild house; rungs 5 and 6, the Bronze Gaff, the Counterweight Lance and the Scute
Windwall are at Oro's forge. A Brazier is rest and save only, never a workbench. Quick-make interrupted by damage makes nothing
and loses nothing.

**Brea lays no traps.** Her field tools are the pots, the net and the planted Windwall.

**Salt** is the only currency and is also an ingredient. **Cord** is a material and small trade good, not a second
currency; the HUD shows salt only. Prices are in tens and low hundreds.

| source | yield |
|---|---|
| raking a pan | salt ×5 per rake; a pan holds ×20 and refills on the Gauge's tide |
| salt caches (8) | salt ×25–40 and ammo, once |
| Guild Notices | salt ×30–80 |
| selling Pried parts | bronze pins ×3 each, ceramic ×4, auger bit ×8, seed glass ×10, lampglass ×12, bob ×25, escapement ×40 |
| quest rewards | salt ×30–60 |

Sinks: rung 4 (salt ×120), rung 3 (salt ×40 and scutes), Cane Recurve ×90, Rake Gaff ×70, Obsidian Lance ×80, pots,
materials at a counter. By the end of hour 1 the player has seen about salt ×100.

**Counters** (Saltrow guild counter, Ninewalls tube-mouth counter, later Mistfold): the satchel grid with a TRADE
tab; the verb is **TRADE**, never buy, sell or purchase. Goods carry one of three trade grades (common, guild,
old-work) shown as a 3 px rule, never as coloured tiles.

## 17. Rest and save

1. Interact with a Brazier to sit; choose REST UNTIL DAWN / GOLDEN / DUSK / NIGHT; the world fades to that hour.
2. Rest chooses the hour, not the weather. The dialog shows the forecast for that hour in one line
   (`TRADE · WIND 045 AT 5 m/s`, `CALIMA BY NOON`).
3. Resting writes the named save and refills the fog-water Gourds.
4. Rest is refused while any Instrument within 60 m is wary or hostile: `THE LAMPS ARE UP. NO REST HERE.`
5. A pillar's Brazier is kindled once (E, 2 s) and stays lit for the rest of the save. Lit Braziers are a visible
   tally of progress across the island at night.
6. Resting advances the site clock by the hours slept. Re-surveyed regions stay true.

**Sites refill on a clock.** A cleared site stays clear for 12 in-game hours on the site clock (hours played plus
hours slept). Measuring kinds (Peg, Plumb, Tiller, Sonde) return in any region. Correcting kinds (Screed, Kiln,
Sickle, Spindle, Davit) return only where the ground is still in error. Nothing returns within 80 m of Brea or
inside her view, and nothing returns at a site inside true ground that a quest has emptied.

**Where the game saves.** A rest writes the named save. A re-surveyed benchmark, a
closed triangle and a completed quest stage each write a silent checkpoint. The hub footer reads
`LAST REST · NINEWALLS CISTERN · 18:40` and offers SAVE only within 12 m of a lit Brazier.

**One rule for death, respawn and home.**
- *Where:* death always returns Brea to the Brazier of her last rest. A New Game counts as a rest at her cistern.
- *What is kept:* the world and satchel as of the newest record, named save or silent checkpoint. A re-survey
  finished two minutes before she died is still finished.
- *Home:* Brea's cistern is where the game starts and is a Brazier like any other. It is not a travel node; the
  guild-house stud beside it is (§12).

**Older saves.** A save written by an earlier format is not migrated. Continue is hidden for it, the title shows
`OLDER SAVE · NOT READABLE BY THIS BUILD`, and the old record is left under its own key, never deleted. From this
format on, every save carries a version number and each later format ships a one-step migration.

## 18. Screens

Shared rules: glass `#1E1A28` at 0.90 opacity in menus and 0.70 in the HUD; Chakra Petch for display, labels and
menus; IBM Plex Mono for numerals, body and dialogue; right angles with 6 px L-shaped registration ticks; lilac
`#D8CCE4` selection line; violet as tint and dye, never a glow; square corners and sharp edges
throughout. The world freezes and frosts behind every menu.

| screen | what it is | words |
|---|---|---|
| Title | key art at 18:40 golden, not a panel: wordmark top-left with the tagline under the datum rule; five stations in a left column on a soft scrim; Brea three-quarters from behind at right | CONTINUE · NEW GAME · SETTINGS · EXTRAS · QUIT |
| New Game | one glass card: Tolerance | LOOSE · STANDARD · FINE · BEGIN |
| Loading | a dark map sheet with one triangle being ruled in; one Field Book line | never a walker on a low-sun skyline |
| Field HUD | at most four surfaces in calm play. Top-left: levelling-staff health, stamina hairline, broad-arrow emblem, salt; the field note beneath (fades after 8 s). Top-centre: theodolite strip with a three-digit bearing. Bottom-centre: three tool cells. Bottom-right: weapon and ammo. Prompt: key cap and verb beside the crosshair | salt is the only currency shown |
| Engaged plate | one Instrument plate top-centre with its ◆ and a staff bar | `SCREED · GRADE · SCAR 3` |
| Sighting | sepia vignette ≤ 20 %; stadia hairs; cobalt rings on weak points; dashed outlines on tools; transects as white ground dashes; one glass card | LAMP · WEAK · CARRIES |
| Kit Rack | a protractor half-ring at the right edge, five sectors, real time | a half-ring at the edge only |
| Hub | full-width glass, top tabs with a lilac underline | MAP · FIELD LOG · SATCHEL · MAKING · CHARACTER · SKILLS · FIELD BOOKS · SETTINGS |
| Map | dark painted relief inside revealed triangles; unrevealed land in slate with a staff-white coastline; Datum regions in vermilion | legend: MAIN OBJECTIVE · SITE · SETTLEMENT · BENCHMARK · TRIG PILLAR · BRAZIER · WAYPOINT · DANGER |
| Satchel | five-column grid, detail column with a turntable | ALL · WEAPONS · TOOLS · STORES · FIELD BOOKS · TRADE |
| Making | §9 | MAKE ×1 · MAKE ×6 |
| Character | header, the worn set on a turntable, eight rung cards (tier label, set name, tagline, swatches; locked = black silhouette), customization | WEAR |
| Skills | the certification net and a detail column | CERTIFICATIONS · TRANSECT · BEARING · BALLAST |
| Dialogue | a glass lower-third, at most three lines; choices as numbered stations | |
| Brazier rest | a small glass dialog beside the fire, the world still visible | KINDLE · REST UNTIL … |
| Re-survey | the Sighting hairs plus three bearing rows that fill one by one | `BRG 1 214° … CLOSED` |
| Death | §13 | THE LINE IS LOST |
| Extras | the Field Manual (tutorial cards) and Credits with every attribution | |
| Continue and save slots | three slots as glass cards: place, hour, Order, hectares, a thumbnail of the last rest | CONTINUE · SLOT 1–3 · ERASE (hold) |
| Field Log | the hub's quest page: one tracked quest, its stages as a ruled list, completed quests below | FIELD LOG · TRACK |
| Field Book reader | one book at a time: a ruled page in Plex Mono with a sketch; the mark it inked on the map | FIELD BOOKS · n / 24 · SHOW ON MAP |
| Trade counter | the satchel grid beside the counter's stock; price in salt; the three trade grades as a 3 px rule | TRADE · GIVE · TAKE |
| Guild Notice board | a wooden board in the world; reading it opens up to three notices as glass cards | GUILD NOTICE · TAKE · untimed |
| Kite read-out | in flight only, bottom-centre, two numerals and a streamer glyph: wind over the ground and climb or sink | `WIND 045 · 5 m/s` · `LIFT +0.8` |
| Certification card | a glass card for 4 s when a rank is granted, with the act counted | `BEARING II · BACK BEARING` |
| Settings: graphics | tier (high, medium, low), resolution scale, shadows, motion blur off by default, camera shake and FOV punch sliders, vignette toggle | GRAPHICS |
| Settings: controls | every action rebindable for keys and pad; hold or toggle for aim, Steady and re-survey | CONTROLS · REBIND · RESET |
| Settings: reading | subtitles on by default with the speaker's name, three sizes, optional backing; UI scale | READING |
| Unsupported browser | a plain page when WebGL2 or a needed extension is missing | `CALIMA NEEDS WEBGL 2` and what to try |
| Context lost | a glass card if the graphics context is lost; the game pauses, restores, and reloads the last record if it cannot | `DISPLAY RESET · RESUMING` |

**Reading without colour.** No screen carries meaning by colour alone: every status has a word or a shape as
well. UI tokens that mean different things stay distinguishable under simulated deuteranopia, protanopia and
tritanopia. Lamp states already read from iris, beam and rhythm (§7.3).

## 19. Content rules

The short list every build, frame, string and asset obeys.

1. **Everything is original to CALIMA:** names, designs, logo, interface. The title screen carries the wordmark
   and THE ISLAND REMEMBERS and nothing else.
2. **Instruments are tools** (§7.1): mechanical bodies whose only sensors are lamp drums, level vials and lenses
   at the working end. Every lamp colour passes the colour lint. Two-legged stilt walkers are allowed.
3. **Instruments act only for the Datum.** They never serve, carry or follow anyone. The Malpaís is cold.
4. **Real time always.** Growth is by armour rung, certification and Order, all earned by survey acts.
5. **The interface is right-angled glass** (§18). The Kit Rack is a half-ring at the screen edge, navigation is
   the compass strip and the map, and detection is read from the lamp.
6. **The kite is a box kite** with rectangular cells and visible spars. **Cover is reed by water**, and only
   while the wind moves it.
7. **No human is ever an enemy.** Levelers are line-walkers with a staff lamp.
8. **The Transit is never shown against a low sun** in title, menu, loading or marketing frames.
9. **Assets:** CC0 preferred, CC-BY with attribution, never NC or ND; every third-party file is in the licence
   manifest with its hash.
10. **Words:** the name lint runs over `src/`, `public/`, `tools/` and `docs/`. This file passes it.

Stage stealth frames in pale carrizo by water. Lead the title frame with the wordmark and the survey world.

## 20. Glossary

| term | meaning |
|---|---|
| **Alidade** | Brea's brass sighting tube; raising it is Sighting |
| **Ballast / Bearing / Transect** | the three Field Book certifications |
| **Benchmark** | a survey mark; re-surveying it makes its region true ground; then a travel node |
| **Blunt / Pry** | the two physical damage words |
| **Brazier** | rest-and-save fire at a cistern |
| **Brea** | "pitch"; the heroine |
| **Calima** | Saharan dust haze; the weather that half-blinds Instruments; the title |
| **Calibration Yard** | open-air yard where Instruments are checked against target boards |
| **Carrizo / junco** | giant cane and salt rush: Reed cover |
| **Cerrillo / viborina** | golden meadow grass and violet flower spikes: scenery, never cover |
| **Charred / Seized / Clouded** | the statuses of Cinder / Brine / Dust |
| **Cinder / Brine / Dust** | the three elements |
| **the Datum** | Orchil as measured on one day 812 years ago; the Instruments' reference |
| **Datum Line** | the vermilion band painted where the ground "should" be |
| **Datum Survey** | the project that built the Instruments |
| **Epoch 812** | the game year |
| **error** | anything not on the Datum: every village, wall and salt pan |
| **Felling blow / Undercut** | critical blow / stealth blow |
| **Field Book** | collectible survey notes |
| **Flagged** | marked by a Plumb's sightline so nearby Instruments know where Brea is |
| **bearing (take a)** | hold one Instrument as a pip on the compass strip while Sighting |
| **guild-house stud** | the brass datum stud at Saltrow; the home travel node |
| **the Fundamental** | the master benchmark |
| **Gourd** | fog-water flask; the heal |
| **Guild Notice** | untimed bounty board |
| **Instruments** | the Survey's self-maintaining tools; the only in-world word |
| **Kit Rack** | real-time gear selector |
| **Levelers** | sect that guides Screeds onto error |
| **Making / MAKE** | making ammo and kit |
| **malpaís** | cold lava badlands |
| **orchil** | violet lichen dye; the island's name |
| **Pan Houses / Crescent Holds / Fogcatchers** | the three peoples |
| **Reckoner** | the Pan Houses' office that reads Instrument marks; Brea's job (also rung 3's tier label) |
| **REST** | Brea's cistern; home |
| **Roques** | eroded volcanic pillars |
| **salt** | the currency |
| **Sighting** | the Alidade view: bearings, distances, weak points ringed |
| **Sounding Ring** | the great broken ring on the Pans |
| **Steady** | breath-hold while aiming |
| **Survey Kite** | cane-and-sailcloth box kite |
| **transect** | a live line of Peg stakes; crossing one near a Plumb alerts it |
| **trig pillar** | 4 m white cylinder; sighting two others from one opens a map triangle |
| **true ground** | a region the Datum has accepted |
| **Windwall** | crescent fan-shield |
| **Order** | Brea's geodetic rank (Third, Second, First), computed from hectares of ground made true |
| **Tolerance** | the difficulty setting: Loose, Standard, Fine |
| **figure** | one region's set of pillar, benchmarks and site problem; closing it makes the region true |
| **in / out of adjustment** | an Instrument's calibration state |
| **WALK THE LINE** | travel between re-surveyed benchmarks |
| **wind road** | a line of chained ridge lift for the Survey Kite |
