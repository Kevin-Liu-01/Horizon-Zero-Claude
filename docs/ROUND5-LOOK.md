# CALIMA — ROUND 5 LOOK SPEC (`docs/ROUND5-LOOK.md`)

For the orchestrator, Nov 6 2026; corrected after the adversarial critic pass (16 corrections). Sources: Kevin's Nov 6 input and his three binding decisions, six analyst specs
(light and post; world; characters and Instruments; playing; UI; IP), `docs/ROUND5-PLAN.md` (§1.2 grants, §2 lanes,
§4 budgets, §8.3 to R65 and the interim R66, §9 gates) and `docs/ROUND5-BIBLE.md`. Costs are GPU ms at tier `high`,
DPR 1.25, 1600×900. A cost marked "est." is an analyst estimate until `A-look-ledger` (L-16) measures it on a quiet
box (R45, R53). The reference images are never embedded or copied. They are cited in the `ext:` form (§0.2).

---

## 0. How to read this spec

### 0.1 Kevin's decisions (Nov 6, binding; they override every analyst recommendation that conflicts)

| # | decision | where it lands |
|---|---|---|
| 1 | **UI: dark glass.** Every menu is a dark violet glass panel, as in images 2–5: map, making (crafting), character and armour, skills, satchel (inventory), field log (journal), settings, title, pause. The field HUD is thin and minimal: a compass strip, small icons and a health bar. Chakra Petch and IBM Plex Mono stay. shell-ui's finished W1 logic survives and only its skin is redone. | §3.6 (U-01…U-19), R66(e), §7 shell-ui. Option B was chosen; options A (paper) and C (hybrid) are closed. |
| 2 | **Armour: all eight sets** from image 4 form the progression: Starter, Scout, Reckoner, the board's fourth set (rung 4, VEIL), Pioneer, Vanguard, Arcane, Celestial. | §3.3 C-09 ladder, R66(f). The four outfits armory is building fill rungs 1–4. "Specter" must be renamed, because it is a Horizon enemy name: VEIL is proposed (Q4). |
| 3 | **Four new features:** campfire rest and save, an ammo crafting screen, glider traversal and tall-grass stealth. Each takes CALIMA's own form. | §3.7 F-1 the Brazier, F-2 the Making ledger, F-3 the Survey Kite, F-4 Reed cover. R66(g). |

### 0.2 Panel key (cite panels exactly this way)

The files are kept outside the repo at `/Users/kevinliu/.calima-r5/direction/` and are never committed anywhere. Cite them as `ext:<file>@<sha8>#<panel>`.

| image | file @ sha256 prefix | panels |
|---|---|---|
| 1 key-art collage | `kevin-nov6-keyart.jpg@860d7e9f` (the folder also holds `kevin-nov6-keyart.webp@aa1c880d`) | **1-TL** key art: wordmark, Brea 3/4 from behind with the lance, Ring at right, spires, valley mist · **1-TR** our Sighting frame repainted (FIELD NOTE, compass 126, TILLER card, LAMP tag, tools, SABINA BOW 040) · **1-ML** paper MAP sheet · **1-MC** three face close-ups (front, 3/4, profile) · **1-MR** sunset coastal vista (sun, sea glitter, islets, Ring, Brea on a rock at right) · **1-BL** bow aim against machines · **1-BC** SKILLS screen · **1-BR** biome strip and COMING SOON end card |
| 2 design board | `kevin-nov6-board.jpg@f2694e04` (the folder also holds `kevin-nov6-board.webp@b5c48125`) | **2-TL** title screen · **2-TC** CHARACTERS sheet · **2-TR** ENEMIES · **2-ML** MAPS (ORCHIL and THE PANS card) · **2-MC** LANDMARKS (row 1: Sounding Ring, Ninewalls, Kiln Yards; row 2: Crescent Holds, Malpaís, "Obsidian Spire") · **2-MR** UI panel · **2-BL** GAMEPLAY SYSTEMS · **2-BM** INVENTORY · **2-BR** BIOMES & ENVIRONMENTS (Pans, Holds, Malpaís, Calima) · **2-BRi** UI ICONS · **2-F** footer strip |
| 3 board 2 (words) | `kevin-nov6-board2.md@05b0e982` | **3-MAP**, **3-BREA**, **3-ENEMIES**, **3-UI**, **3-LANDMARKS**, **3-ENV** |
| 4 armour (words) | `kevin-nov6-armor.md@d8509a8f` | **4-L1…4-L8** line-up cards (Starter…Celestial), **4-DET** detail close-ups, **4-SIL** silhouettes, **4-CUS** customization, **4-BR** caped Brea from behind |
| 5 stills (words) | `kevin-nov6-stills.md@bf79cdc9` | **5-1** title vista · **5-2** bow aim · **5-3** meadow run with HUD · **5-4** stealth · **5-5** dodge in dust · **5-6** crafting · **5-7** face close-up · **5-8** gliding · **5-9** melee on a core · **5-10** map · **5-11** fire at sunset |

The stills (image 5) carry the most weight for light, camera framing, combat readability and HUD, because they show what
*playing* should look like. Image 1's 1-TR, 1-ML and 1-MC are our own frames repainted, so they show our game with the
same layout made beautiful.

Images 3–5 are words only. Kevin should save them as images beside images 1–2 (§9.2). Until then, every clause that
cites a panel of image 3, 4 or 5 is a written criterion, not a likeness test.

### 0.3 Item format

Each item in §3 has: **target** (a cited panel and measured numbers) · **technique** · **owner · wave** · **cost**
(GPU ms at high, est. until measured) · **tier** (`low` / `medium` / `high` / `ultra`, the names in
`QUALITY_TIERS`) · **gate** (the row ids in §7). Priority: P0 = needed for the look at the W1 exit or its lane's
exit; P1 = this round; P2 = cut first (✂).

---

## 1. The target in one paragraph

"Look a lot better and new" means **our game, the same layout and UI grammar, under better light**. Image 1 proves
it: 1-TR, 1-ML and 1-MC are our own Sighting frame, map sheet and Brea close-ups with every element in place, and
what changed is light, air, ground and material response.

Under a low golden sun, warm light is split from violet-rose shadow and distance. Our shadows sit at hue 58–82°
(ochre to olive); in the panels they sit at 2–35° (rose). Our midtone b\* is 28–34 against the panels' 2–13. The
island recedes through 4–6 silhouette layers that lift by +18–28 L\* and turn rose and violet in haze, with mist
pooled in the valleys. Ours is one ochre wall at L\* 45–65. Towering sunlit cumulus rises behind needle spires and
an upright broken Ring. The sun is a real highlight: our brightest 1 % of pixels sit at L\* 72–84, the panels' at
90–96, and the sea carries a glitter path under the sun. A dense golden carpet with violet flower clumps fills the
foreground. Skin shows sheen, a warm terminator and catch-lights; the wrap is thick cloth whose long tail streams in
the wind.

"New" means the frame plays like a different, more cinematic game:
- the lens sits lower and looks *out* at the island, with the horizon in the lower half, not two-thirds of the frame grass;
- machines tower over Brea in fights, and hits light the world;
- an eight-rung armour ladder;
- a cane-and-sailcloth kite over the coast;
- reed beds that hide her while the wind moves them;
- a fire at dusk;
- a thin HUD over dark violet glass menus that recede and let the world lead.

All of it is held to A21's bar: a look item goes on at `high` only when A21 still meets that exit's bar with it on, and
the GPU-recovery wins are booked to A21, never spent on the look (§4).

---

## 2. The ranked gaps (the 12 biggest levers)

| rank | gap (panels vs our Nov 6 frames) | lever items | visual payoff | GPU cost at high (est.) |
|---|---|---|---|---|
| 1 | **Palette and tone.** Ours is all ochre or olive: lo20 hue 58–82°, mid b\* 28–34, chroma 31. The panels have rose-violet shadows (lo20 hue 2–35°, mid b\* 2–13, chroma 18–27), and ACES pushes warm highlights about 24° toward yellow. | L-01 AgX, L-02 grade + LUT, L-03 hour keys, L-04 sky IBL | very high: touches every pixel | +0.1–0.15 (on at `high` under §4.6 rule 2) |
| 2 | **No depth layering.** One ochre wall against 4–6 receding layers lifting +18–28 L\*. Far-band L\* std 13 against 18. Snow-capped Round-4 rings behind Brea. | L-05 aerial v2 + valley mist, W-02 layers, W-03 strata and mesas, W-04 stacks and the Roque plug, W-05 the Ring upright, L-15 ridges out | very high: the vista and title read | +0.6–1.1 (strata, stacks, aerial); the ridges' −0.05…−0.2 is A21 recovery |
| 3 | **The camera looks at the ground.** The horizon sits 67 % up the frame in V1-sprint, and fights look down on small machines. | P-01 chase, P-02 aim, P-03 big-fight framing, P-11 vista idle | very high: every playing frame | 0 direct; +0–0.4 for more scene in view |
| 4 | **Bare foreground.** W1 Pans: black sand at L\* 5–11 with about 2 tufts/m². 1-TR: a golden carpet, b\* +36, gradient 6.45, violet clumps. | W-06 meadow + backlit tips, W-07 black sand | high | +0.7–1.15 |
| 5 | **Brea's skin and cloth.** Shadow cheek 0.009 rel. lum. against 0.027; lit:shadow 7.5:1 against 4.6:1. No sheen, catch-lights or rim; sleeved smock against the sleeveless harness look; thin tail. | C-01…C-06, L-04 | high: close-ups and every chase frame | +0.1–0.15 (+0.15–0.25 for the C-07 hero shadow on high under §4.6 rule 2) |
| 6 | **No real highlights.** Clip 0.01–0.02 % against 0.5–4 %, bloom barely shows, the sun is small, shafts are composited after SMAA. | L-06 sun, L-07 bloom, L-08 shafts in HDR, W-09 sea glitter | high in vistas | +0.1–0.3 |
| 7 | **Sky.** Saturated royal-blue zenith #173f83 and thin fbm wisps, against a lavender zenith #9CA5CF and towering lit cumulus. | L-03, L-09 cumulus, L-10 sky last | high | +0.05–0.10 (L-09); L-10's noise row (−0.2…−0.6) is A21 recovery |
| 8 | **Water.** Matte brine tiles, an unreflective Glass, a flat fog band at the sea horizon. | W-08 mirror probe, W-09 glitter + seam | medium-high | +0.4–0.6 |
| 9 | **Instruments read toy-sized and dead.** No glowing weak points, no hull reaction, flat bone-white hulls. | I-01 cores, I-02 scale, I-03 hull value, I-05 telegraphs, I-06 backlit read | high in fights | +0.1–0.2; the LOD1 casters (I-04) recover −0.3…−0.8 in the herd frame (booked to A21) |
| 10 | **Hits light nothing.** Blue sparks, no hull flash, no impact light, brown arrow crumbs, no dodge dust, empty air. | P-04…P-09 | medium-high | ≤ 1.0 on the worst burst frame, ≤ 0.15 idle |
| 11 | **UI is cream paper that competes with a bright world.** About 15 text surfaces against image 1's six; a centred title with no Brea; menus re-render the world at 20–34 ms. | U-01…U-19 (dark glass, decision 1) | high for "new" | 0 WebGL in play; **−19 to −33 ms while a menu is open** (U-03) |
| 12 | **The enabler: GPU.** Vista 19.7–21.2 / herd 33.9 (build unrecorded; 20.10 on world-ground's tree) / fight 20.5 ms against 14, and `high`'s dynamic resolution hides overruns in real play (§4.1). The world alone costs 11.9–13.6 ms of the vista. | W-01 envelope, L-10, L-18 attribution, I-04 | none directly; makes room under A21 for rows 1–11 (booked to A21, never to the look ledger) | **≈ −3.2…−5.6 at the vista** (W-01's share from the W2 exit); herd not yet attributed |

---

## 3. Per-domain specs

### 3.1 Light, sky, atmosphere and post

Engine facts the items rest on:
- `src/core/engine.js` OutputGradeShader: ACES at exposure 0.94, split tone (0.94, 0.97, 1.08)/(1.045, 1.005, 0.955), vignette 0.34.
- UnrealBloom 0.35 / 0.5 / 1.08; GTAO at quarter resolution with a 0.55 m radius; SMAA.
- `src/world/environment.js`: a KEYS table, analytic height fog with `pow(sd,7)` in-scatter, RoomEnvironment IBL at 0.095–0.115, a procedural sky of 6 × 5-octave fbm, and shafts composited after the composer.
- The world-sky tree has no `environment.js` changes yet.

**L-00 Look shot suite and frame-stats tool (the yardstick for every look gate)** — P0
- Target: frozen, HUD-free shots matching the reference compositions. Each panel's statistics are stored as numbers only.
- Technique: `ctx.props.gatePlaces.look.{field, vista, aim, close, dusk, pansInland, pansSunset, meadow, beach, title, saltrowDusk, craterWall, steepFace, reed, brazier}`. Each place carries a pose, the camera yaw relative to the sun's bearing, the hour and the weather; wind and time are frozen.
  - field 16:30 behind Brea in grass (1-TR);
  - vista 19:00 on a cliff facing the sun with the Ring mid-distance (1-MR);
  - aim 17:45 over the shoulder (1-BL, 5-2);
  - close 18:45 at 0.8 m (1-MC);
  - dusk 19:45 among violet flowers (2-MR).
  - `tools/look/look-stats.mjs` (node + sharp, already in node_modules) reads a canvas-only PNG (the HUD is DOM and excluded) and converts sRGB to CIELAB D65. Per frame it reports:
    - L\* percentiles and p95−p5;
    - chroma;
    - lo20, mid and hi10 (a\*, b\*) and hue;
    - clip and crush %;
    - five row bands;
    - gold, violet and strong-violet masks;
    - per-band |∂L\*/∂x|;
    - depth-binned stats from one gate-only 160×90 linear-depth render (`scene.overrideMaterial`).
  - `tools/look/refs.json` holds numbers only (≤ 20 KB): panel statistics (L\*a\*b\*, ≤ 8 swatches per panel), never pixels (R66 a).
  - Under `?shot=1` the sky IBL (L-04) and the reflection probe (W-08) bake all faces and the PMREM synchronously before the shot settles, so two runs give the same PNG.
  - Hand-dressed places are postcards, so the suite also films 12 seeded random Pans poses (hours 16:30–19:45, 20–200 m from any gate place) for `A-look-random`.
- Owner · wave: look-post (`tools/look/**`); world-props (`gatePlaces.look.*` as a day-1 stub, real by its W1 exit); world-sky (the synchronous `?shot` bake) · W1 exit.
- Cost: 0 (measurement only). Tier: shots at high; each look gate re-runs `look.field` at low and medium.
- Gate: **A-look-suite**, **A-look-random**, **V-look-random**.

**L-01 Tone map: ACES → AgX with a CALIMA look; exposure recalibrated** — P0
- Target: 1-MR sun glow #FDFBD0 and sea glint #F9EAAB read cream, not lemon; the peach cloud rims of 1-TL. hi10 hue is 52–75° in every panel; ours is 72–85°.
- Technique: a `CAL_AGX` branch in OutputGradeShader, using three r169's own AgX (MIT): rec2020 inset/outset, log2 −12.47…+4.03, 6th-order sigmoid.
  - An ASC-CDL look in AgX space: slope (1.00, 0.99, 0.97), power 1.22, sat 1.12, luma-preserving. The look is mandatory, because raw AgX lifts 0.02 linear to L\* 22.
  - Base exposure is recalibrated so 0.18 grey shows at L\* 50: with power 1.22 that is ≈ 1.21 (0.02 → L\* 9.5, 0.18 → 50, 1.6 → 86.4, inside A-look-tonemap (a)).
  - `renderer.toneMapping = AgXToneMapping`, a `uAgxLook` uniform, and a CPU mirror `engine.look.evaluate(rgb)` in new `src/core/look.js`.
  - Three CPU copies of the ACES curve in other lanes' files break under AgX: `src/instruments/lamps.js:257–399` (`OutputInverse` sets `P.aces` only under ACES, so lamp rings land off their tokens), `src/hero/sheets.js:76–110` (`screenPixels` tone-maps only under ACES) and `src/ui/menu.js:172–180` (the `CALIMA_DISC` constants were fitted through ACES).
  - `look.js` exports `evaluate(rgb)` and an exact `invert(rgb)` (AgX sigmoid by Newton, LUT by 3 refinement steps, round trip ≤ 1/255). look-post gets grants at the W1 exit: `src/instruments/lamps.js` ≤ 25 lines and `src/hero/sheets.js` ≤ 10 lines, both calling `engine.look`. shell-ui refits CALIMA_DISC in W2. A-look-tonemap gains (f): A-lamp-states, A-lamp-canon-distance, A-weak40 and A-brea-contrast pass at unchanged bars in look-post's block.
- Owner · wave: look-post (+ the lamps.js and sheets.js ports by grant; shell-ui refits CALIMA_DISC in W2) · W1 exit. Cost: +0.02–0.04 (≈ 15 ALU in the existing pass). Tier: all.
- Gate: **A-look-tonemap**, **V-look-highlights**.

**L-02 Colour grade: warm light, violet-rose shadow, amber not olive** — P0
- Target:
  - 1-TL, 1-TR and 1-BL: lo20 hue 2–53° with a\* 10–17 and b\* −2…+8 (b\* 22 in grass-filled frames); mid b\* 2–13; chroma 18–27.
  - Ours: ui-sighting lo20 (14.0, 22.3), hue 58, mid b\* 28.2, chroma 31.2; V1-sprint lo20 hue 82 (olive).
- Technique: in display space after AgX:
  - split tone by luma: shadow (1.03, 0.93, 1.08) weighted 1 − smoothstep(0.05, 0.45); highlight (1.04, 1.00, 0.93) weighted smoothstep(0.55, 0.95);
  - contrast 1.06 about 0.45;
  - saturation by luma: 0.92 / 1.05 / 0.85;
  - a 32³ RGBA8 `Data3DTexture` LUT (128 KB) built at boot from `src/core/look.grade.json`: hue 75–110° rotated −12° toward amber with chroma ×0.85; greens ×0.9; Orchil violets ×1.08;
  - vignette 0.28.
  - Grade sets (golden, noon, dusk, calima) interpolate per hour through `engine.setLook()` as two blended 32³ LUT slots, not a CPU rebuild every hour.
- Owner · wave: look-post · W1 exit. Cost: +0.05–0.10 (two 3D fetches + ≈ 25 ALU; VRAM +0.26 MB for the two slots). Tier: all (low keeps the LUT).
- Gate: **A-look-frame-stats**, **V-look-grade**.

**L-03 Hour keys rebuilt for golden light** — P0
- Target: 1-TR sky #9CA5CF, horizon #CCB1B1, far haze #BE9380; 1-TL zenith #554B6E, lit cloud #C2B1BF; 1-MR sky #C8867A; 2-MR dusk sky #404065. Ours at 17.4 h: zenith #173f83, ochre fog #cfa87f, an indoor-room IBL.
- Technique: the KEYS table rewritten in the same record shape.
  - The 05:30 key and the hand-over troughs at 05:24 and 19:54 (sunI ≤ 0.15; environment.js:78–81) are kept.
  - Bible keys at 07:00 / 12:00 / 18:45 / 19:45 / 23:00, plus new keys at 09:30, 16:30, 17:45 and 19:20, taken from the light analyst's table (16:30: sun #FFD9A8 I 4.8, zenith #6F7FB8, horizon #E2BBAE, fogH #C89A88, hemi sky #8C8FC4; 18:45 zenith **#555079**; 19:20: sun #FF9B52, zenith #4A4A7C).
  - The hemisphere light drops to 0.10–0.14 (warm ground bounce only); sky fill comes from L-04 at environmentIntensity 0.30–0.45 by day and 0.12 at night.
  - EV offsets per hour: noon 0, 16:30 +0.10, 17:45 +0.15, 18:45 +0.25, 19:20 +0.40, 19:45 +0.70, night +1.30; calima +0.15; biome offsets follow bible §9.3.
  - R66(k) amends bible §2.4 to this table, and the shadows at 16:30–19:45 move from #4A5570 to violet-rose.
- Owner · wave: world-sky · W1 (inside its hour-keys deliverable). Cost: 0. Tier: all.
- Gate: **A-hour-keys** (re-keyed to the amended table), **A-look-keyfill**, **V-look-sky**.

**L-04 A sky-captured IBL replaces RoomEnvironment** — P0
- Target: 1-MC and 1-TL: sheen on skin and wrap in the sky's colours, and a sky catch-light in the eyes. Ours reflects a grey room.
- Technique:
  - A sky-only scene on layer 7 (dome, cumulus band, below-horizon term) is rendered by a `CubeCamera` into a 128² HalfFloat cube, one face per frame.
  - On the 7th frame, `pmrem.fromCubemap(cube, envRT)` writes into a pre-allocated target, published as `scene.environment` named `CAL.skyIBL`.
  - It rebakes every 0.1 h or on a 0.05 weather move. Under `?shot=1` all six faces and the PMREM bake synchronously before the shot settles (A-look-suite a).
  - The RoomEnvironment import and its 256 PMREM are deleted.
- Owner · wave: world-sky · W1 exit. Cost: mean ≈ +0.01 (bake frames ≤ 0.03 per face and ≤ 0.30 on the PMREM frame); VRAM net −3.9 MB.
- Tier: low 64² every 0.5 h; medium and high 128² every 0.1 h; ultra 256² every 0.05 h.
- Gate: **A-look-ibl**, **V-look-closeup-ibl**.

**L-05 Aerial perspective v2, valley mist and rose-violet distance** — P0
- Target:
  - 1-TL and 1-MR: 4–6 layers lifting in value and turning rose or violet (far spires #7C6A78 at L\* 47, far islands #B48886 at L\* 61), mist pooled in the valleys, warm haze toward the sun. Violet share is 15–82 % in the references.
  - Ours: one ochre wall, b\* 18–27 at every distance, violet share 0–8 %.
- Technique: the `fog_fragment` body rewritten, keeping the closed-form height integral:
  - per-channel extinction `calFogExt` (golden and trade (0.82, 1.00, 1.32); calima (1.0, 0.97, 0.90)) with opacity capped at 0.92;
  - in-scatter = mix(horizon, zenith, up²) + two normalised Henyey-Greenstein lobes (g 0.72 ×0.9 and g 0.20 ×0.25) toward `calFogSun`, replacing `pow(sd,7)`;
  - a second exponential layer for valley mist (density 0.006 at dawn and dusk, 0.0015 at noon, ×3 in fogbank; scale height 14 m above each biome's valley floor), modulated by one 120 m noise read drifting toward 225°;
  - a CPU mirror `environment.fogTransmittance(a, b)`.
- Owner · wave: world-sky · W1. Cost: +0.10–0.20, plus +0.05 for the mist noise. Tier: all; low drops the mist and one lobe.
- Gate: **A-look-aerial-layers**, **A-look-golden-air**, **V-look-depth**.

**L-06 Sun disc, corona and haze glow that bloom picks up** — P1
- Target: 1-MR, a cream disc (#FDFBD0, L\* 98) with a warm halo across about a sixth of the frame; 1-TL, the sun behind cloud with lit rims.
- Technique in `_buildSky`:
  - disc radius 0.5° at sunCol ×40 HDR with limb darkening 0.6;
  - corona lobes pow(·,900)×1.6 and pow(·,64)×0.35;
  - a haze glow pow(·,8)×0.08 scaled by fog density;
  - occlusion from the cumulus density at the sun;
  - no lens ghosts.
- Owner · wave: world-sky · W1. Cost: +0.01. Tier: all.
- Gate: **A-look-sun**, **V-look-sun**.

**L-07 Bloom retune: only true highlights glow, with a wide soft halo** — P1
- Target: 1-MR and 1-TL wide soft halos; 1-BL a lit arrow tip; diffuse surfaces never glow. Lit salt at noon (≈ 1.15 linear) currently crosses our 1.08 threshold.
- Technique: threshold 1.30 with smoothWidth 0.35; strength 0.48; radius 0.72; mip factors [0.55, 0.65, 0.85, 1.05, 1.25]; tint (1.00, 0.97, 0.93). Exposed in `engine.look` so world-sky can scale it per weather (calima ×1.25, overcast ×0.6).
- Owner · wave: look-post · W1 exit. Cost: 0. Tier: all.
- Gate: **A-look-bloom**, **V-look-glow**.

**L-08 Crepuscular shafts v2: occluder and cloud gaps only, in HDR, graded** — P1
- Target: 1-TL soft shafts through spire and Ring gaps and cloud breaks; 5-1 and 5-5 backlit haze. Bible §9.4 bans radial god-ray spokes (a Round-3 Horizon tell); R66(j) allows shafts only where something breaks the light.
- Technique:
  - A quarter-resolution radial gather fed with HDR. The source is sky-depth luminance above 1.5× the sky's analytic key luminance (from the hour keys, not a measured sky median), so cloud gaps and the corona emit while cloud bodies and geometry block.
  - 32 taps on high, 20 on medium; decay 0.955. Intensity scales with fog density ×1.8 in calima.
  - It runs from a new `engine.onAfterScene` hook before GTAO and bloom, and the grade adds `tShaft` in HDR before AgX.
  - The full-resolution additive pass after SMAA is deleted.
- Owner · wave: world-sky (gather; and, under G-post, the hook and fold, which pass to it from look-post at the W1-exit merge, §5.1) · W2 (world-sky extended to W2, R66 i).
- Cost: high net +0.00–0.10 against today's pass (≈ 0.30); medium −0.05; low −0.30 (off). Deleting the post-SMAA pass is A21 recovery (§4.2); the new gather is a ledger row. Tier: medium and up.
- Gate: **A-look-shafts**, **V-look-rays**.

**L-09 Towering cumulus: a baked horizon band, lit every frame** — P1
- Target: 1-TL and 2-TL towering flat-bottomed cumulus with peach tops (#C2B1BF) and lavender bodies; 1-TR heaps behind the mesas.
- Technique: a project-original recipe `tools/build/recipes/sky/cumulus.mjs`.
  - It CPU-raymarches 9 towers (bases at 900–1100 m, tops at 2.2–3.5 km) into a 2048×256 equirect band holding density, thickness and normal.
  - Two variants cross-fade every 20 game minutes.
  - In the sky shader: wrap-lit by the sun, a silver lining, ambient from the keys, and the terrain's aerial term at 12 km.
- Owner · wave: world-sky · W2. Cost: +0.05–0.10; VRAM ≈ +5.6 MB (two 2048×256 RGBA8 variants with mips); disk ≈ 0.8 MB (licence row: project-original). Tier: all; low uses one variant.
- Gate: **A-look-clouds**, **V-look-cumulus**.

**L-10 Sky cost offsets: draw the sky last, replace the procedural fbm** — P0 (A21 recovery, booked to A21)
- Target: the budget (L-16). Today the sky sorts before vegetation, ridges, props and actors, so its ≈ 1100-ALU fbm is shaded under pixels they cover.
- Facts: the sky is a 1,900 m BackSide sphere with depthWrite off (environment.js:1616–1620). The sister isles are deliberately carried inside the dome and the 2,400 m far plane (world-ground's `src/world/terrain.js:290–300`). Drawn last with a plain depth test, the dome would overwrite anything beyond 1,900 m. On Apple TBDR (Metal via ANGLE), hidden opaque fragments are already removed regardless of draw order, so most of the saving comes from the baked noise.
- Technique: sky vertex z = w, LEQUAL, renderOrder 1000, so the dome sits at the far plane and fills only pixels nothing else covered. A 512² RGBA8 tiling noise from the L-09 recipe replaces the six fbm calls with four fetches; the star hash runs at night only.
- Owner · wave: world-sky · W1. Cost: **noise row est. −0.2…−0.6; order row est. ≈ 0** (A-sky-last (c) books them separately); VRAM +1.4 MB. Tier: all.
- Gate: **A-sky-last**.

**L-11 Sun path through the south, and a golden-weighted clock** — P0 (the clock weighting is subject to Q1)
- Target: the stills are golden hour or dusk almost everywhere. Today the noon sun crosses the north, which is wrong at 28° N and contradicts the bible's moss on north faces. At 1800 s per day the sun is 2–22° up for only 14.9 % of real time, and night takes 43.8 %.
- Technique:
  - Bearing = 70 + f × 220°, south at the 12:45 solar noon; elevation 50·sin(πf) as now.
  - Clock rate by sun elevation: ×2.5 below −4°, ×0.5 at 2–22°, ×1 otherwise, smoothstep-blended over 2°. The day stays 1800 s, giving 33.6 % golden and 19.7 % night.
  - New Game starts at 07:00. 17:45 is only for the title, a Continue with no saved hour, and the look places. The golden-weighted clock keeps the 0:55 beat at 12:00 ± 0:30 (an A-first-hour clause). Bible §8.9 starts at 0:00 = 07:00 in Saltrow with "calima at noon" at 0:55; a 17:45 boot with night at ×2.5 would put 0:55 at night.
  - Behind a flag `env.clock = 'golden' | 'even'`, default `golden` until Kevin answers Q1.
- Owner · wave: world-sky · W1 (progression adds the A-first-hour clause in W3). Cost: 0. Tier: all.
- Gate: **A-look-sunpath-dwell**, A-first-hour (golden-clock clause).

**L-12 Contact shading: violet-tinted AO and hero-near contact shadows** — P2
- Target: 1-TL and 1-BL dark violet-brown contact at her feet, in rock seams and under the wrap.
- Technique:
  - In the grade fold: `src *= 1 − (1 − ao)(1 − uAOTint)` with uAOTint (0.80, 0.74, 0.92). GTAO radius 0.55 → 0.75 m, blend 1.0 (re-run A108 and A109).
  - A half-resolution 12-step screen-space contact-shadow pass toward the sun over 0.6 m, at depth ≤ 12 m on high and ≤ 40 m on ultra.
- Owner · wave: world-sky under G-post (look-post's W2 item, passed at its W1-exit merge, §5.1) · W2. Cost: AO tint +0.01; contact +0.10–0.15 on high, +0.35 on ultra.
- Tier: AO tint on all tiers; contact high (hero-near) and ultra; off on low and medium. Contact on high ships only under §4.6 rule 2.
- Gate: **A-look-contact**, **V-look-contact**.

**L-13 Eye adaptation, clamped around the keyed exposure** — P2
- Target: median L\* per panel: 1-TR 53, 1-MR 52, 1-BL 44, 1-MC 32, 2-MR 31.
- Technique: a 64×36 log-luminance target feeds a 1×1 ping-pong target with no readback. Exposure = keyed EV ± 0.5 EV; rate +0.8 / −1.6 EV/s; off under `?shot=1` and in gates.
- Owner · wave: look-post + world-sky (the keyed EV) · W3 (look-post's grant re-opened, or world-sky W4 under the post grant). Cost: +0.03. Tier: medium and up.
- Gate: **A-look-exposure**.

**L-14 Calima and dusk graded to the boards** — P1
- Target:
  - 2-BR "The Calima" card: sky #D89976, haze #D58A63, sun #F7B276, mid (21.9, 24.5), top-band std ≤ 6.2.
  - 2-MR dusk: mid b\* −11.6, lo20 hue 345.
  - Bible calima: fog #C98B4E ×4, disc #F2A27E.
- Technique:
  - Calima: extinction (1.0, 0.97, 0.90), HG g 0.80, shafts ×1.8, bloom ×1.25, grade set `calima` (shadow tint (1.04, 0.95, 0.98), sat 0.95).
  - Dusk at 19:45: grade set `dusk` (shadow (1.02, 0.92, 1.12), highlight (1.06, 0.98, 0.95)), blended in from 19:20.
- Owner · wave: world-sky (weather and keys) + look-post (grade sets) · W1 for calima (look-post at its W1 exit); W2 for the dusk set (world-sky under G-post, §5.1). Cost: 0. Tier: all.
- Gate: **A-look-calima**, **V-look-calima**.

**L-15 Far ridge rings out: no snow peaks and no ochre wall** — P1
- Target: 1-MR and 1-TL show only sea, islets and spires in haze beyond the coast. Ours shows Round-4 snow-capped rings at 620 / 900 / 1180 m behind Brea (brea-closeup-day) and as an ochre wall (ui-sighting).
- Technique: delete the snow term and the rings wherever the sea horizon shows. They are replaced by the sister isles in world-ground's skirt: keep the carried skirt (ISLE_CARRY 0.8), inside the 1,900 m sky dome and the 2,400 m far plane (L-10); the volcano's apparent height is 6–9° above the sea horizon (today ≈ 4.9°), plus cliffs, 2–4 k tris, fogged to the deep-band colour, i.e. ≤ 3 low basalt silhouettes for the haze to carry.
- Owner · wave: world-sky (rings out) + world-ground (isles in the skirt) · W1. Cost: −0.05…−0.2 (A21 recovery, booked to A21). Tier: all.
- Gate: **A-look-ridges**, **V-look-horizon**.

**L-16 Look ledger and tier rows: every item timed, each enabled on high only inside A21's bar** — P0
- Target: A21's 14 ms median GPU bar (interim W1-exit bars in §4.6 rule 2). Nov 6 quiet-box medians: 19.7–21.2 vista, 33.9 herd (build unrecorded; 20.10 on world-ground's tree), 20.5 staged fight.
- Technique:
  - `QUALITY_TIERS.<tier>.look` rows (§4.4).
  - `tools/look/ab-time.mjs` toggles each item on and off, interleaved in one clock state with the A-gpu-tier instrument (perfSnapshot, timer query, 4 rounds) on a quiet box (R45, R53).
  - It runs inside the W1-exit global run (R45), right after L-18. It A/Bs only items estimated ≥ 0.10 ms; the rest are timed as one group. (All ≈ 45 items × 3 frames × 2 states × 4 rounds × ~6 s would hold the only gate Chrome ≈ 1.8 h per exit.)
  - Recovery wins (§4.2) are A21 rows, never ledger rows (§4.6 rule 2).
  - Medians are written into this doc's §4.3 table at every wave exit from W1.
- Owner · wave: look-post (tool, rows) + orchestrator (the quiet runs, inside each exit's global run) · every wave exit. Cost: 0. Tier: all four rows.
- Gate: **A-look-ledger**.

**L-17 Depth of field: aim and close-up only** — P1 (aim), P2 (close-up and dialogue)
- Target: 1-BL target crisp with ruins and spires soft; 5-2 close over-the-shoulder against a soft field; 1-MC defocused background behind the head. Exploration stays sharp.
- Technique:
  - A bilateral gather DOF folded into the grade: one quarter-resolution downsample of colour and linear depth, then a separable depth-aware 9-tap blur in 2 passes, mixed by CoC.
  - Aim: focus = the crosshair raycast (4–80 m), far field only, max CoC 4 px at 1600 px, 0.25 s fade.
  - Close-up within 1.6 m of the subject, or the dialogue camera: a 13-tap disc.
  - Passes are skipped when off.
- Owner · wave: world-sky under G-post (engine; look-post's W2 item, §5.1) + combat-kit W2 (publishes focus from `combat.aimPoint`; armory publishes it in W1) · W2.
- Cost: +0.35 while aiming; 0.5–0.8 in close-up and dialogue only; 0 in exploration and every A21 scenario. The close-up DOF is outside A21 and capped by its own row (A-look-dof: ≤ 0.8 ms). Tier: high and ultra.
- Gate: **A-look-dof**, **V-look-dof**.

**L-18 GPU attribution of the A21 frames (before any positive-cost look item ships on high)** — P0
- Target: the herd frame read 33.9 ms on Nov 6 and no analyst could attribute it, but world-ground's report reads the herd at 20.10 ms on world-ground's tree, so the 33.9 ms came from another build. L-18 first records which build (git SHA and tree) it times, before it attributes anything.
- Technique: `tools/look/gpu-attrib.mjs` on the frozen frame:
  - per-pass rows from timer queries: shadow cascades; main opaque; transparent and additive (lamp beams, VFX); GTAO; bloom; SMAA; shafts; grade; the Sighting overlay. These sum to the frame within 10 %.
  - per-owner rows are hide-one marginals (hide each owner, as §4.2's draw ledger does) plus an interaction residual, with no sum rule. Timer queries cannot attribute by owner inside a render pass on Apple GPUs, and world-ground already found that owners "do not add up when hidden one at a time".
  - It runs on vista, herd and staged-fight on a quiet box. The result is a ranked table in this doc's §4.2 with a named fix owner per row ≥ 0.5 ms.
- Owner · wave: look-post (tool) + orchestrator (quiet run) · inside the W1-exit global run (R45), before L-16. Cost: 0. Tier: high.
- Gate: **A-gpu-attrib**.

### 3.2 World: terrain, landmarks, vegetation, water, settlements

World-ground's report (`trees/world-ground/docs/ROUND5-WORLD-GROUND.md` §6) reads the A21 vista at 19.7–21.2 ms, with a
7.6 ms floor when ground, water and flora are hidden. The world therefore costs 11.9–13.6 ms, and A21 leaves it ≈ 6.4 ms.

**W-01 World GPU envelope: recover A21 before the look is added** — P0, first in world-ground's fix round (A21 recovery, booked to A21)
- Target: hold 14 ms at the vistas while gaining the density of 1-TR and 1-MR.
- Technique:
  1. Terrain in 8×8 chunks of ≈ 166 m with three index-buffer LODs (1.94 / 3.88 / 7.76 m at < 200 / < 450 / beyond), one-row skirts, frustum-culled inside one `BatchedMesh` (still one draw).
  2. Beyond 160 m a 1024² macro albedo baked at boot (1.3 m/texel) replaces 3 layers + anti-tile + triplanar, cross-faded over 140–180 m.
  3. `marram-far` (4,253 × 18 tris) retired for W-06's shader grass.
  4. Pan dykes and salt rakes cast in cascade 0 only; basalt rocks in cascades 0–1 (today 2,997 dykes × 120 tris feed every cascade). This needs each CSM cascade's `shadow.camera.layers` set in engine.js (`enableCSM`, :1573): G-post's per-cascade layer masks CASTER_ONLY / CASCADE0_ONLY (≤ 15 lines, look-post at the W1 exit).
  5. The sea beyond 250 m uses the analytic swell only.
- Owner · wave: world-ground · W1 fix round to W2. world-ground's report calls the ground-mesh LOD (1) its own W2 item, so W-01's −3.0…−5.0 is not available at the W1 exit. Cost: **−3.0…−5.0** (A21 recovery, from the W2 exit); VRAM +5.6 MB. Tier: all (low and medium start the far field at 110 m).
- Gate: **A-look-world-envelope**.

**W-02 Four silhouette layers in every hero vista** — P0
- Target: 1-MR and 1-TL: near rock and grass, then ruins and the Ring, then hazed needles and stacks, then a pale skyline; near-to-far +18…+28 L\*. Our W1 Pans frames face an empty sea with a flat fog band; main shows smooth cone hills.
- Technique: a composition contract built from W-03…W-06 and L-05:
  - near 0–40 m: meadow belt, dune crest, a basalt outcrop, a framing tamarisk;
  - mid 40–250 m: the Ring, the Organ Shelf, the red crater, pumps, Saltrow;
  - far 250–700 m: the Flank wall, the Holds terraces, the offshore stacks;
  - deep > 700 m: the caldera rim with the Roque plug, the Fundamental, the sister isles.
  - world-sky sets band transmittance at 18:45: near ≥ 0.95, mid 0.82–0.92, far 0.58–0.75, deep 0.35–0.55.
- Owner · wave: world-ground (forms) + world-props (landmarks) + world-sky (air) · W1 for the Pans vistas; W3/W4 for later biomes. Cost: 0 of its own. Tier: all; low may cut the deep band to the sister isles.
- Gate: **A-look-layers**, **V-look-layers**.

**W-03 Tablelands and stratified cliffs** — P0
- Target: the striated mesas and buttresses of 1-TR; the stepped rock of 1-BR (Holds card); 2-MC "Obsidian Spire" card, used for form only (the name is out, §8).
- Technique:
  - (a) Macro forms in `recipe.js` on the Flank, the caldera's outer slopes and the crater:
    - a terrace quantizer above 25 m, benches every 14–28 m jittered per 120 m cell, k 0.55–0.8;
    - risers of 50–65° spanning ≥ 2 mesh nodes;
    - spur-and-gully ridges (18–40 m, ±6 m).
    - Sites and trig rays stay exact.
  - (b) A shared `strataChunk` (onBeforeCompile) on slopes > 0.6:
    - band = floor((y + 4·noise(xz/90)) / T), T per biome (crater 0.8–2.5 m, Flank 3–9 m, stacks 1.5–6 m);
    - a 64×1 palette row per biome (Flank: basalt #3A3A3F, ochre tuff #8C6A48, red scoria #7A3B2A, ash #B8A890);
    - a ledge-lip normal tilt and 1:8 vertical varnish streaks.
    - world-props' rock materials include the chunk.
- Owner · wave: world-ground (+ world-props includes the chunk) · W1 for the crater, the Flank face toward the Pans and the caldera skyline; W2–W4 for the rest.
- Cost: +0.2–0.4 (ALU on the 10–20 % of pixels that are steep); 2 KB palette.
- Tier: high and ultra full; medium without the ledge normal; low with albedo bands only.
- Gate: **A-look-strata**, **A-look-mesa**, **V-look-strata**.

**W-04 Needle stacks offshore, the Roque hero plug on the inland skyline, the sister isles** — P0
- Target: the islets and sea stacks backlit on a glittering sea in 1-MR; the needles above valley mist in 1-TL; the needles behind the title in 5-1; the fluted needle of the 2-MC "Obsidian Spire" card (form only).
- Technique:
  - world-props recipe `stack.mjs`: 8–20 stacked strata slabs (1.5–6 m, inset or outset 0.2–1.2 m), windward fins, a caprock on one stack in three, vertex-coloured with the strata chunk, three variants at height:base 3:1–6:1.
  - **6 offshore stacks (18–55 m) and one sea arch**, 520–900 m out on bearings 200–300, beyond `PLAY_RADIUS` + 20 m with no colliders.
    - Staggered at ≥ 3 distances so that two stand in the glitter column from T1 at 18:45.
    - Surf comes from an 8-entry circle-SDF uniform in the sea shader.
    - One draw per variant; LOD1 of 1.5 k beyond 300 m; last cascade only.
  - **One 55–60 m Roque plug** pulled forward from W4 to W1, on the caldera's west rim. The other six Roques stay W4.
  - The sister isles come from L-15.
- Owner · wave: world-props (stacks, plug; in its day-1 brief) + world-ground (isles) · W1; the other Roques W4.
- Cost: +0.25–0.45 (≤ 4 draws, ≤ 30 k LOD0 tris in view, no near-cascade casters). Tier: all; low uses LOD1 only, no casters.
- Gate: **A-look-sea-skyline**, **A-look-spires**, **V-look-sea-skyline**, **V-look-spires**.

**W-05 Pans landmarks at vista scale** — P0
- Target: 2-MC Sounding Ring card and 1-MR, a huge broken ring standing on a ridge; 1-TL the Ring right of Brea; 5-3 a ring-arch across a meadow. Today `gen-sounding-ring.mjs` tilts the outer ring 68° off vertical and sinks it 3 m, so it reads as debris.
- Technique:
  - The Ring stands **15–25° off vertical** with an outer diameter of **34 m** (26 today) and an inner one of 22 m. Glazed panels on bronze flanges, a broken quadrant with panels fallen into the salt, a dim core: a survey gyroscope, never a stone portal. It sits on a **5–6 m grassed shingle rise** (`sites.js` height 0.5 → 6; R66(m)).
  - The Organ Shelf becomes hex columns 0.6–1.4 m across, stepping 2–14 m over its 11 clusters, so they read as pipes from 150 m.
  - Wind pumps: 9–12 m towers with 6 m rotors, turning.
  - Every look frame has one landmark ≥ 140 px tall and two ≥ 40 px, over ≥ 2 screen thirds.
- Owner · wave: world-props (the Ring, Organ Shelf, pumps; it moves `tools/build/landmarks/gen-sounding-ring.mjs`, pipeline's area with the lane closed, into its `tools/build/landmarks/recipes/**` by grant) + world-ground (the Ring rise in `sites.js`, its file: height 0.5 → 6) · W1 (day-1 brief). Cost: ≈ 0–0.05. Tier: all.
- Gate: **A-look-landmark-scale**, **V-look-ring**.

**W-06 Golden meadow belt with violet flower clumps, backlit (scenery, never cover)** — P0
- Target: 1-TR shows Brea waist-deep in golden grass (bottom band L\* 42, b\* +36, C\* 42, gradient 6.45); the violet spike flowers in the foreground of 1-TL and 2-MR; the amber tip glow toward the sun in 1-TR and 1-TL (#8F4710 → #BC875A). Ours: 2.11 tufts/m² on black sand, bottom gradient 0.41.
- Technique:
  - Where: the Pans' landward belt (3–25 m elevation) behind the salt field, Saltrow's lee, dune backs and the top of the Organ Shelf; later the Holds terraces (W2), the Flank (W4) and the Caldera floor (W4).
  - Kinds: marram (its colonies stay today's stalking cover, vegetation.js:18, A59b); **cerrillo** grass (Hyparrhenia-like, ≤ 0.70 m, the main gold, so a crouched Brea at ≈ 1.0 m is never shown hidden while she is still detected); **viborina** spikes (Echium-like, violet, 0.5–0.9 m, new); sea-lavender.
  - Rings at high:
    - R0 0–12 m: 96-tri tufts at 6.0/m², flowers 0.5/m²;
    - R1 12–40 m: 40 tris at 2.5/m²;
    - R2 40–100 m: 12 tris at 0.8/m²;
    - R3 beyond: shader grass in the ground (#C9A04E–#D9B060, a ±8 % wind wave travelling toward 225°, violet speckle).
  - Flowers grow in clumps 3–9 m across over 8–25 % of the meadow.
  - Backlight (the old LOOK-12): `calSunCol × albedo × 1.6 × pow(view·sun, 4) × tipMask × shadow × (1 − night)`, ×1.2 on flowers. Solid vertex-coloured, no alpha, 0 casters.
  - Anti-shimmer: `high` is SMAA-only with no TAA, so dense blades, the 2 mm sand sparkle (W-07) and the sea micro-glints (W-09) would shimmer in motion and read cheap even when every still passes. Blades are widened in the vertex shader to ≥ 1.5 px; the sparkle and the glints are pre-filtered by pixel footprint.
  - The grass parts around her (1-TR, 5-3): a vertex push from ≤ 8 capsules (Brea and the nearest Instruments), radius 0.6 m, ≤ +0.02 ms.
  - **The meadow kinds never conceal** (they add 0 to the cover field; F-4 keeps the meadow/bare detection ratio at 1.00); reed beds, junco and today's marram colonies do.
- Owner · wave: world-ground · W1 for the Pans belt, then each biome. Cost: +0.6–1.0 at high net of retiring marram-far, including +0.05–0.15 for backlight. Booked as three ledger rows (R0 + backlight, R1, R2/R3), each ≤ 0.45 ms (§4.6 rule 3).
- Tier, radii R0/R1/R2: ultra 16/60/140; high 12/40/100; medium 10/30/70; low 8/22 with shader grass beyond (backlight per vertex).
- Gate: **A-look-meadow**, **A-look-grass-backlit**, **A-look-temporal**, **V-look-meadow**.

**W-07 Black sand that reads as sand, not a void** — P0
- Target: the structured dark ground (wet sheen, ripples, foam lace) of 1-BR "THE PANS" and 2-BR "The Pans"; 1-MR bottom band L\* 31 with std 14. Ours: L\* 5–11, std 3–4.
- Technique: the bible's albedo is kept (0.02–0.05 linear). Added:
  - grain sparkle (hash per 2 mm cell, ≈ 0.7 % of cells, ×6 sun, faded out beyond 25 m, pre-filtered by pixel footprint so it does not shimmer, A-look-temporal);
  - two wind-ripple normal octaves (0.08–0.15 m) across bearing 045, plus 1–3 m dune ripples;
  - a wet band 0–6 m from the waterline (roughness 0.25–0.40, reflecting the W-08 probe) with a receding-film highlight;
  - a foam-lace and wrack line;
  - shells and pebbles at 0.3/m² within 15 m.
- Owner · wave: world-ground · W1. Cost: +0.10–0.15. Tier: all; low drops the sparkle and the ripple normals beyond 10 m.
- Gate: **A-look-black-sand**, **A-look-temporal**, **V-look-black-sand**.

**W-08 Salt pans, brine and the Glass as mirrors (runtime reflection probe)** — P0
- Target: 2-BR "The Pans" (spires and sky mirrored in brine between white crust); 1-BR "THE PANS" (polygon crust, blue pools); 1-MR (sky on wet ground). Ours: matte tiles and an unreflective Glass.
- Technique:
  - The probe: a 128² HalfFloat cube with mips in `environment.js` on a REFLECT layer (dome, terrain LOD2, landmark and stack LOD1, settlement LOD1; ≤ 10 draws per face), one face per frame round robin, re-centred on a 25 m move or a 0.05 h change. Under `?shot=1` all six faces bake synchronously before the shot settles (A-look-suite a).
  - Sampling: water, brine and wet sand sample it with `textureLod` by roughness and a 600 m sphere-parallax correction.
  - Brine: roughness 0.05–0.12, rising with the wind; pink #D9B8B0 where it evaporates.
  - Crust: #EDEAE2 capped at 0.85, with 0.8–2.5 m polygon crack ridges.
  - The Glass: #2F8F6F, roughness 0.04.
- Owner · wave: world-sky (probe; day-1 brief) + world-ground (sampling) · W1.
- Cost: +0.30–0.45 (a face ≈ 0.15–0.25 GPU + 0.2 CPU; sampling 0.1); VRAM ≈ 1.0 MB.
- Tier: ultra 256², 6 faces / 3 frames; high 128², 1 face per frame; medium 64², 1 face / 2 frames; low the analytic sky.
- Gate: **A-look-pan-reflection**, **V-look-pans-sunset**.

**W-09 The sea at golden hour: glitter path and a seamless horizon** — P1 (merges light LOOK-15)
- Target: 1-MR, a glitter column of near-white glints (#F9EAAB, L\* 92) under the low sun with no seam at the horizon; 5-1 and 5-11. Ours: a flat fog band (std ≈ 0) and white blotches; the sun term peaks at ≈ 0.5 HDR, under the bloom threshold.
- Technique in `water.js`:
  - a direct sun term `calSunRad` (sunCol ×40) × an anisotropic GGX (αx 0.03, αy 0.12) over two ripple scales (3 m and 0.6 m) with stochastic micro-glints, pre-filtered by pixel footprint so they do not shimmer in motion (A-look-temporal);
  - the sea fades to fog only in the last 0.5° below the horizon, sampling the probe or sky at the same azimuth (warm #F2B98E sun side, violet #7A6474 away);
  - whitecaps only when wind > 0.9.
- Owner · wave: world-ground (+ world-sky publishes `calSunRad`, `calSunCol`) · W1. Cost: +0.05–0.15. Tier: all; low has no micro-glints and one ripple scale.
- Gate: **A-look-sun-glitter**, **A-look-horizon-seam**, **A-look-temporal** (beach), **V-look-sea**.

**W-10 Trees with soft canopies** — P1
- Target: the soft back-lit umbrella tree framing 1-TL's left edge; 2-MC "Ninewalls", for the dragon tree's silhouette only (Ninewalls stays walled, R66 o); the terrace trees of 1-BR (Holds). Ours: Round-4 conifers and faceted blobs.
- Technique:
  - 6–14 displaced icosphere lobes per tree, with normals 70 % toward the lobe centre;
  - wrap and back-light rims; vertex AO by depth in the crown;
  - hierarchical sway leaning to 225°; casters in cascades 0–1.
  - Pans W1: tamarisk (4–7 m, #7E8A5A with pink bloom #D7A2B4; LODs 1.4 k / 300 / 60 at 0 / 80 / 220 m), three groves plus four framing trees at look poses.
  - W2: the Ninewalls dragon tree and fig. W4: wind-flagged sabinas and Canarian pines.
- Owner · wave: world-ground · W1 / W2 / W4. Cost: +0.15–0.3 in Pans frames. Tier: high and ultra full; medium LOD1 from 50 m; low LOD1 from 30 m with no casters.
- Gate: **A-look-trees**, **V-look-trees**.

**W-11 Biome palettes, gated on the frame** — P1
- Target: 1-BR and 2-BR biome cards (Pans violet share 32–73 %; Calima warm share 67 %, sky a\* +19, b\* +26); 2-MC landmark cards (violet share 66–82 %).
- Technique: swatch rows per biome (the world analyst's table, kept verbatim in `tools/look/refs.json` as numbers) for world-ground's albedos and world-sky's per-biome grade, keyed by `biomeWeights`. Ruling R66(k): **the flora carries the gold and violet; the ground stays black and white** (bible §9.1 amended).
- Owner · wave: world-sky + world-ground · W1 (Pans, calima), W2 (Holds), W3 (Malpaís, Cloudline), W4 (Flank, Caldera, tuning). Cost: 0. Tier: all.
- Gate: **A-look-palette**, **V-look-biome-cards**.

**W-12 Saltrow at golden hour and dusk** — P1
- Target: the warm-lit dwellings at 1-TR's left edge (150–250 m); 2-MC "Crescent Holds" and 1-BR (warm stone, violet blossom); 5-11 dusk warmth.
- Technique in the kit:
  - three lime-wash tones with streaks and basalt quoins; parapets ±0.3 m and walls leaning 1–3°, with the roofline stepping ±0.6 m;
  - orchil balconies #6B3F73; bougainvillea blobs (#9B3A8C / #7B3F8F, 200–400 tris) on one house in three; salt cones;
  - window and door glow #FFB46A at emissive 1.5–2.5 from 19:45 to 05:30, with one shared lamp-pool decal and no real lights;
  - chimney smoke at dusk.
- Owner · wave: settlements · W2. Cost: +0.3–0.6 in Saltrow frames, inside A-settlement-draws. Tier: all; low has no smoke and no bougainvillea LOD0.
- Gate: **A-look-saltrow**, **V-look-saltrow**.

**W-13 Later-biome landmarks: Holds terraces, Kiln Yards, a cold Malpaís** — P2
- Target: 2-MC "Kiln Yards" (towers of different heights over rubble), "Crescent Holds" (stepped terraces), 1-BR "MALPAÍS" (translated with **no lava**, §8).
- Technique:
  - Holds: 5–9 visible drystone tiers of 1.2–2 m with vines and bougainvillea.
  - Kiln Yards: two cooling-tower stubs (22–28 m), 3–5 flue stacks (15–20 m), wellheads glowing #FF6A2A at dusk, steam lit from below.
  - Malpaís: aa #2B2A2E with cinder bands #8E3B23 and lichen, and 0 emissive on terrain.
- Owner · wave: world-ground (terrain) + world-props (Kiln Yards) + settlements (Ninewalls) · W2 / W3. Cost: +0.2–0.4 in those frames, inside §4.2's Kiln Yard ledger. Tier: all.
- Gate: **A-look-ruins**, **V-look-ruins**, **A-no-lava**.

**W-14 Relief map bake** — P1 (raised: the map is now a dark-glass painted map, U-10)
- Target: 2-ML "MAPS — ORCHIL 1,024 m" (painted relief, green north, tan centre, dark volcanic south, turquoise shallows); 3-MAP; 5-10.
- Technique: a build-time 1024² bake from the heightfield and biome mask:
  - biome albedo from W-11's swatches; hillshade (315°, 45°); 8-direction horizon AO;
  - a shallows ramp (0 m #7FD0C4, 1.2 m #4FB3B0, 12 m #1F4E66); a surf line and painterly noise;
  - a dark-palette variant for U-10 (sea #0F1E26 → #1F4E66);
  - the caldera as a dark ring with a cinder rim and **no glow**.
  - WebP ≤ 350 KB; licence row: original work.
- Owner · wave: world-ground (bake) → shell-ui (map) · W1 bake, W2 map. Cost: 0 in play; 5.6 MB VRAM only while the map is open. Tier: all.
- Gate: **A-look-map-bake** (the visual is V-map-glass, U-10).

### 3.3 Characters: Brea, NPCs, weapons and armour

Image 1's three face panels repaint our own `brea-closeup-day-nov6-wip.jpg`. The head, wrap, salt-line and cord are the
same, and only the shading changes. All five images agree on a sleeveless violet top, a crossed leather harness,
violet forearm wraps under bracers, sash panels, dark knee boots, and a long thick streaming tail.

**C-01 Skin light: wrapped diffuse, red-shifted scatter, back-transmission (Brea and near-tier NPCs)** — P0
- Target: 1-MC: the shadow side stays warm red-brown with form (shadow cheek 0.027 against our 0.009; lit:shadow 4.6:1 against 7.5:1), a soft terminator, and warm-glowing ear and jaw edges; 5-7.
- Technique: new `src/hero/skinLook.js` (`applySkinLook(material, {tier})` through onBeforeCompile; no new draw or map):
  - the directional shadow kept separate as `calShadow`;
  - per-channel wrapped Lambert w = (0.50, 0.24, 0.16), with the shadow edge softened by `mix(1, calShadow, smoothstep(−0.15, 0.25, N·L))`;
  - back-transmission from a baked u8 `_calThin` attribute (ray-cast; 1 at ≤ 5 mm, 0 at ≥ 25 mm; +7 KB), tinted (1.0, 0.36, 0.20) × 0.6;
  - R59(c)'s hero fill drops to ×0.6 once this lands.
  - NPC near tier: the full chunk; LOD1 and LOD2: wrap only.
- Owner · wave: character-art (bake + `skinLook.js` by grant on `src/hero/**`, ≤ 10 lines in `src/hero/index.js`; armory approves) + settlements (one call per near-tier NPC) · W1 exit (character-art fix round 2); NPCs at settlements' next round.
- Cost: +0.02 in gameplay; +0.08 in the 0.8 m close-up. Tier: all; low gets the wrap without transmission.
- Gate: **A-skin-scatter**, **V-brea-face-keyart**.

**C-02 Skin specular and micro-detail; matte salt-paste** — P1
- Target: the sheen on cheekbone, nose bridge and forehead in 1-MC's 3/4 panel; 5-7 ("pores and specular"); 1-MC's chalky salt-line (P95 0.665 against our 0.575).
- Technique:
  - ORM roughness repainted (T-zone 0.36–0.42, cheeks 0.48, rest 0.55; pores +0.08);
  - a second GGX lobe (×0.55 roughness, weight 0.15) with cavity specular occlusion (AO²);
  - a 128² tiling micro-pore normal at UV ×24 on the face islands, fading out from 1.5 to 3 m;
  - salt-paste texels at roughness 0.85, specular ×0.3, albedo ≤ 0.85.
- Owner · wave: character-art · W1 exit. Cost: +0.03 in gameplay, +0.10 in close-up; +0.09 MB. Tier: high and ultra all; medium no detail normal; low one lobe.
- Gate: **A-skin-spec**.

**C-03 Eyes and lashes: wet cornea, sky catch-light, dark upper lash line** — P0
- Target: 1-MC glossy eyes with catch-lights and a heavy dark lash line; the 2-TC face close-ups.
- Technique:
  - a `_calZone` attribute (cornea, tear line);
  - cornea roughness 0.04 with an analytic sky-window lobe scaled by the sky luminance (dims at night);
  - tear line 0.10;
  - lashes on the hair atlas: upper 3.0–3.5 mm with ≥ 40 strands per lid, #120E0C, plus a 1 mm lash-shade band.
- Owner · wave: character-art · W1 exit. Cost: +0.005; +100–200 tris inside the hair draw. Tier: all.
- Gate: **A-eye-catchlight**.

**C-04 Golden-hour rim and velvet cloth sheen (Brea, gear, near NPCs)** — P0
- Target: 1-TL sun-rim on shoulder, arm, wrap and tail; 1-BL backlit figure; 5-1, 5-2, 5-3 and 5-11.
- Technique: a shared `calRim` chunk inside RE_Direct (so it inherits the sun shadow): `pow(1 − N·V, 3) × pow(L·−V × 0.5 + 0.5, 2) × sun × calShadow × kRim` (skin 0.55, cloth 0.40, wrap and hair 0.45, leather 0.30). A velvet edge on violet cloth: `albedo × 1.6 × pow(1 − N·V, 4) × wrapped N·L`. It is cheaper than `MeshPhysicalMaterial` sheen (no DFG lookup) and replaces light's LOOK-14 sheen.
- Owner · wave: character-art (chunk) + armory (`clothShader.js` include, ≤ 6 lines) + settlements (NPC include) · W1 exit; NPCs at settlements' next round. Cost: +0.03 in gameplay; +0.05 in the 10-NPC Saltrow frame. Tier: all.
- Gate: **A-hero-rim**, **V-brea-golden-hour**.

**C-05 The wrap tail: long, thick, rippling cloth** — P0 (R66 d replaces R63 c)
- Target: 1-TL (a tail about 2.5 head-heights long, lifted by wind); 2-TL (long, frayed, streaming); every still.
- Technique:
  - **Length 0.53–0.62 m** (today's length, kept).
  - Root width 0.09 m, tapering to 0.06 m before a 2.5 cm frayed fringe.
  - Two-ply with 4 mm rolled hems and three 5–6 mm pleats into the knot; ≤ 900 tris.
  - The chain grows to 7 links (`dyn_wrapSash_01..07`), and the spring target is driven by `environment.windAt` (5.5 m/s trade with gust noise).
  - New capsule colliders on the stowed lance shaft and bow stave (from stowkit `carryInfo`).
- Owner · wave: hero-body (chain, colliders, wind) + character-art (mesh) · W1 exit. Cost: ≈ 0 GPU; +0.02–0.03 CPU. Tier: all; low has 5 links and no fringe cards.
- Gate: **A-tail-flow**, **V-tail-keyart**.

**C-06 STARTER: Pan Whites I re-cut to the board** — P0 (decision 2)
- Target: 4-L1 STARTER; 2-TC front, 3/4 and back; 1-TL bare shoulders; 3-BREA. All five references show the same outfit.
- Technique in `outfit-pan-1.mjs`:
  - the smock becomes a **sleeveless** fitted violet top (MCO sleeves dropped, ≈ −2.5 k);
  - a **crossed brown harness** (two 4 cm straps, brass buckles) crossing at the sternum on a 6 cm bronze **compass-rose boss** (4-DET), with the alidade cord above;
  - violet forearm wraps under leather **bracers**, with the left one keeping the crescent plate (cue 3); a band on the right upper arm;
  - two violet **sash panels** of 0.30–0.40 m on the left-rear hip, clear of the quiver, with no red at the hip;
  - boots: esparto tar-blackened (linear 0.06–0.10) with a laced top;
  - character-art paints the newly visible arm skin.
  - R64(a)'s smock art pass (weave, seams, folds, armhole binding) transfers to the sleeveless top at the same bar.
  - **Cap shift (R66 f):** body ≤ 11.5 k, outfit ≤ 16.0 k (the sleeves' ≈ 2.5 k pays for the harness), stow ≤ 9.0 k, held ≤ 3.0 k; sum 39.5 k. armory's report reads Brea at 25.3–29.1 k tris today (body 9,864, outfit 10.6–12.8 k, stow kit 3,383), and the stow kit still has to take the gaff, Windwall, net, pots and kite roll. Brea's total stays ≤ 40 k, with ≤ 5 main draws and ≤ 2 casters.
- Owner · wave: armory (fix round 2) + character-art (arm skin) + orchestrator (cap ruling) · W1 exit. Cost: ±0.01; 0 draws. Tier: all.
- Gate: **A-starter-cut**, **V-starter-vs-board**.

**C-07 Hero contact-shadow map (Brea only; retargets to the speaker in dialogue)** — P1, ships under §4.6 rule 2
- Target: in 1-MC the wrap hem shadows the brow and the nose shadows the cheek; in 1-TL the straps shade the top.
- Technique: new `src/hero/heroShadow.js`: one 1024² depth target, an orthographic sun camera fitted to Brea (≤ 2.4 m box, ≈ 2.3 mm/texel), her merged meshes only, sampled with 4-tap PCF into `calShadow`.
- Owner · wave: character-art (by grant), with G-post's W2 holder (world-sky, §5.1) signing the RT ledger · W2. Cost: +0.15–0.25; +5 draws (Brea + gear 11 → 16; worst frame 313 → 318); +4.2–8.4 MB RT. Tier: high and ultra only.
- Gate: **A-hero-shadow**.

**C-08 Weapons finish: bronze glints, hand-made bow, orchil fletching; only element ammo glows** — P1
- Target: 1-TL leaf blade, banded haft and cane quiver; 1-BL bow at full draw with a lit tip; 2-BL STEADY; 5-2.
- Technique:
  - lance edge roughness 0.22–0.30 with a 3 mm polish band;
  - Sabina tips reflexed ≥ 8° with horn nocks and carmine silk;
  - reed arrows fletched in orchil violet #6B3F73 and white;
  - element heads (Brine-Gourd, Cinder-Resin, Dust-Puff) get a vertex-masked emissive in the element colour while nocked or in flight.
  - **The images' violet-glowing tip is rejected** (ΔE2000 12.7 from Focus violet). Violet lives in the fletching.
- Owner · wave: armory · W1 exit (bow, lance, fletching); W3 (element heads, with F-2). Cost: 0. Tier: all.
- Gate: **A-weapon-finish**, **V-weapon-keyart**.

**C-09 The armour ladder: image 4's eight sets** — P1 (decision 2)

The bible's 4 × 3 grid becomes **eight rungs**. The four outfits armory has built fill rungs 1–4. Each rung is one
bible variant: that variant's look re-cut toward its board card, with that variant's perk. Every rung keeps one verb
perk (R16: no speed, dodge, jump or slide changes), 1 merged draw, ≤ 3 added pieces over its base, and the §4.1 caps
(merged outfit ≤ 16.0 k under C-06's cap shift). Rungs built from the same bible set share its atlas (pan, ash,
glaze: 1024² base + 512² normal and ORM, ≤ 0.8 MB) plus ≤ 0.15 MB of extras each. Only the worn set's atlas is
resident. The ladder index rises with acquisition (`A-armour-ladder` (a)).

| rung | tier label (UI) | set and variant (in-world name) | built from | island expression (look, from image 4) | verb perk (bible §4) | acquired (bible §4.6) | wave |
|---|---|---|---|---|---|---|---|
| 1 | STARTER — "Trusted gear for the long road." | **Raker's Whites** (Pan Whites I) | Pan I, built; C-06 re-cut | sleeveless violet top, crossed harness, compass-rose boss, bracers, sash panels, tar-dark boots | Brine-wade | default | W1 exit |
| 2 | SCOUT — "See farther." | **Guild Whites** (Pan Whites II) | Pan II, built | re-cut toward 4-L2: a layered violet-and-linen vest, the capelet as a one-side shoulder guard, patterned leg wraps, a long panel skirt; the palm hat kept | Shrug (Flagged 3 s) | quest reward, "Raker's Morning" (Guild Matron Ansel) | W1 exit (re-cut W3) |
| 3 | RECKONER — "Track deeper." | **Brine-Cured** (Pan Whites III) | Pan III, built | cowl, a slung survey satchel as the third added piece, celadon scutes, bronze-banded shin guards, a tabard with a pale lower panel | Mist-fighter | craft at Saltrow: salt ×40 + Gauge float scutes ×3 | W1 exit (satchel W3) |
| 4 | **VEIL** (board "Specter", renamed under IP; Q4) — "Move unseen." | **Pit Wraps** (Ash Wraps I), re-cut as the veil | Ash I, built; the veil pieces in W3 | re-cut toward 4-L4: hood over the wrap, rust face veil, mica goggles (its added pieces), a long black-wool coat with a frayed panel hem (geometry strips ≤ 600 tris, no alpha) | Ash-step (silent jog on ash, sand and reed litter) | Ninewalls merchant, salt ×120 | W1 exit (Ash I); W3 (veil pieces) |
| 5 | PIONEER — "Build forward." | **Lattice Quilt** (Ash Wraps III) | new | undyed quilted coat in the crescent-wall stitch, the crescent bronze gorget as the board's collar, a tool belt, bronze greaves | Brace (knockdown → 0.4 s stagger) | quest reward, "The Scar" (Ninewalls) | W3 |
| 6 | VANGUARD — "Hold the line." | **Celadon Lamellar** (Glaze Plate I) | new | ceramic pauldrons rigid on the clavicles, tile rows per bone, a violet tabard edged in brass | Ring-parry (Windwall window ×1.5) | craft at Tube Smith Oro (ceramic ×12 + bronze cable ×2), **only after "The Scar"** (bible §4.6 amended) | W3 |
| 7 | ARCANE — "Read the old marks." (replaces "Channel the ancients") | **Oxblood Lamellar** (Glaze Plate II) | new | **the island's arcane is the instrument-maker's craft, not magic:** oxblood tiles engraved with vernier scales and brass numerals, a brass alidade-rose belt medallion, layered violet robes; the 4-DET "circuit embroidery" becomes graduated-tick embroidery (the family mark) | Kiln-walk | Kiln Yards shut-down reward | W3 |
| 8 | CELESTIAL — "Fix by the stars." (replaces "Reach beyond") | **Datum Plate** (Glaze Plate III) | new | **celestial as the surveyor's star-fix:** bone-white tiles with brass graduations engraved as an ephemeris table; the sternum lampglass glowing calm #F2EAD3 (the only armour emissive), never violet crystal | Read as true | the Fundamental (final act) | W3 (the Fundamental, final act) |

- Rung 4 is one variant. It used to take Calima Veil's look (Ash II, whose perk is Dust-sight) with Pit Wraps' perk (Ash I, Ash-step). It is now Pit Wraps throughout, with the veil pieces as its re-cut, and Ash Wraps II (Calima Veil) leaves the ladder.
- Fog Felts I–III leave the ladder. They become ✂ (a W4 stretch as a Mistfold regional set) unless Kevin keeps them (Q4).
- Retired: Dust-sight, Sure-foot, Fog-mend, Thrown whistle. The base whistle stays. shell-ui drops the Dust-sight outline. With them go the Dust-sight outline contract (plan §3.2, shell-ui W2), the aimed `combat.whistle(at)` throw (A-perk-hooks-combat) and the `player.mods.fallSafe` / `fallLethal` / `regen` perk uses.
- Bible §4.6 is amended: Vanguard is crafted at Oro after "The Scar"; the other rungs keep their bible routes. (Oro appears at 0:35, so the bible's route let rung 6 come before rung 5.)
- The plan's §2 armory row and §3.1 W3 exit read "8 rungs" in place of "12 variants" (R66 f).
- Variants within a rung are customization (C-10), not new sets.
- Owner · wave: armory (sets, perks, matrix) + shell-ui tokens for the equip page (U-12; armory holds the `inventory.{js,css}` grant in W3) · W1 exit for rungs 1–4 at their W1 state; W3 for rungs 4–8 at fidelity.
- Cost: ≤ +0.02 per worn set (≤ +6 k skinned tris over Starter); disk: the rungs share three bible atlases (pan, ash, glaze) plus ≤ 0.15 MB of extras each, so §4.5's "Brea + 4 armor sets" row stays ≈ 4.0 MB (total ≈ 46 of 60 MB). Tier: all.
- Gate: **A-armour-ladder**, **A-armor-ip**, **V-armour-lineup**.

**C-10 Customization: headwrap style, half-cape, trim and colour scheme** — P2
- Target: 4-CUS; 4-BR.
- Technique:
  - headwrap: wound topknot (default), low wrap, or hood (Veil and later) as hidden-piece bits (≤ 900 tris each);
  - cape: off, or a 0.55 m violet half-cape on `clavicle_l` with a 4-link `dyn_capeFlap`. A full back cape is not offered because it hides the lance, bow and tail (cues 2 and 4);
  - trim (brass, bronze, none) and scheme (violet, gold, grey, tan) via the mask-aware tint;
  - the wrap's violet is locked (cue 1).
- Owner · wave: armory + U-12 page · W3. Cost: 0 (≤ +250 tris for the cape). Tier: all.
- Gate: **A-custom-matrix**.

**C-11 NPCs at Brea's shading; the Leveler translated** — P1
- Target: R56; 5-3 and 5-11 people at the fire. The 2-TR "LEVELERS" row is translated, never copied (the hooded spear soldiers read as an Eclipse-like sect).
- Technique: C-01, C-03 and C-04 on every near-tier NPC (LOD1 and LOD2: wrap only); face-library recipes add `_calThin` and `_calZone`; the C-07 box retargets to the speaker in dialogue. The Leveler (archetype 13): hood over a kaolin ceramic mask, a lapilli-black wool cloak, the vermilion and white banded sash, and a banded staff with a lamp. No spear and no attack table.
- Owner · wave: settlements · next round (W1 NPC half) / W2; Leveler W4. Cost: +0.05–0.06 in the Saltrow frame. Tier: all.
- Gate: **A-npc-skin-parity**, **A-leveler-palette**, **V-leveler-read**.

**C-12 Brea's identity stays the bible's** — P1
- Target: 2-TC and 3-BREA write "Age 20, Affiliation None, a seeker", which drifts toward Aloy (19, an outcast, a Nora Seeker).
- Technique: the character sheet takes bible §3.1: age 31, Saltrow, Reckoner of the Pan Houses. The five silhouette cues hold in every rung.
- Owner · wave: shell-ui (character page) + armory · W2 / W3. Cost: 0. Tier: all.
- Gate: **A-brea-ip**.

### 3.4 Instruments

Translation rule: take the panels' *scale, backlight, dust and glowing weak point*. Never take their animal bodies,
heads, jaws, tails, eyes or red cores (§8).

**I-01 Weak-point cores that glow: lamp, vial, firebox, hot hub** — P0
- Target: 1-BL, a glowing core lighting the plates around it; 2-TR; 5-9. Translated into bible §7.2 and §7.3's honest weak points:
  - lamps in their state colour;
  - vials in the element colour (Cinder #FF7A1A, Brine #BDE6E3, Dust #C98B4E);
  - the Kiln firebox (Cinder, flickering at 6–9 Hz);
  - the Spindle hub (a dull Cinder glow during its 2 s exposure only).
- Technique:
  - Interior-parallax glass: an inner glow sphere offset along the view ray by 0.6 × the vessel radius, with a fresnel rim at roughness 0.05.
  - Hull spill from a baked u8 `_lampProx` (1 at the rim → 0 at 0.8 m): `emissive += prox² × coreColour × 0.35 × gain`, with a per-draw uniform and no allocation.
  - No point lights.
- Owner · wave: instruments-a (the shared chunk in `src/instruments/lib/**` by grant; Tiller, Plumb, Peg) · W1; instruments-b W2 and instruments-c W3 per kind.
- Cost: +0.02 in a 6-Instrument fight; 0 draws and 0 textures. Tier: all; low has no interior parallax.
- Gate: **A-core-glow**, **V-core-fight**.

**I-02 Scale and menace** — P1 (heights subject to Q3)
- Target: 1-BL machines towering over Brea; 5-2 and 5-5; the silhouettes behind the 2-TR cards.
- Technique: heights change and footprints do not:
  - Screed cab mast to **3.8 m** (bible 3.0), with the moldboard lifting to 2.6 m in the Blade Charge windup;
  - Kiln chimney-mortar top to **5.5 m** (bible 4.0);
  - large kinds get larger plates, fewer small parts and bigger rivets (≤ 60 k).
  - The camera half is P-03. With P-03's corrected boom and lens, a machine only towers like 1-BL and 5-5 (at least Brea's screen height at 10 m) from ≈ 6 m: the Dredge and the Transit, with the 5.5 m Kiln close (≈ 0.9× at 10 m, clearing her crown at 18 m). A 3.8 m Screed reaches ≥ 0.9× Brea's screen height only at 5 m (A-menace-scale c, Q3).
- Owner · wave: instruments-b (Screed) W2; instruments-c (Kiln) W3. Cost: +0.05–0.10 in the Screed fight. Tier: all.
- Gate: **A-menace-scale**, **V-menace**.

**I-03 Hull finish, value range and rim** — P1
- Target: 2-TR, for finish only (worn layered plates, glossy highlights, dark joints, feet grounded in dust); 1-BL rim-lit hulls; 1-TR, a repaint of our own Tiller with more contrast.
- Technique:
  - glaze roughness 0.15–0.30 varied by crazing; verdigris on worn edges; graphite joints at 0.04;
  - baked vertex AO (≥ 28 rays, 0.4 m); a dust gradient on the lowest 0.6 m;
  - `calRim` at kRim 0.35.
- Owner · wave: instruments-a W1, then -b, -c, -d per kind. Cost: +0.02. Tier: all.
- Gate: **A-hull-value** (and one clause added to V-lineup).

**I-04 Instruments cast shadows from their LOD1 (A21 recovery, booked to A21)** — P0 (the herd frame read 33.9 ms on the Nov 6 build; L-18 names the build)
- Target: budget.
- Technique: every medium and large kind ships an LOD1 at ≈ 35 % of its tris. The shadow caster is that LOD1 at every distance (`castShadow` off on LOD0; LOD1 hidden from the main pass by layers). Small and medium kinds skip the far cascade.
  - Instrument LOD lives in frozen `rig/lod.js`: instruments-a W1 holds a grant there, ≤ 20 lines: LOD1 caster-only; A45–A48 and A-sil40 unchanged.
  - Per-cascade casters need each CSM cascade's `shadow.camera.layers` set in engine.js (`enableCSM`, :1573): G-post's per-cascade layer masks CASTER_ONLY / CASCADE0_ONLY (≤ 15 lines, look-post at the W1 exit).
- Owner · wave: instruments-a (Tiller first) W1; then -b, -c, -d. Cost: **−0.3…−0.8 in the herd frame** (est.; A21 recovery). Tier: all.
- Gate: **A-instr-shadow-lod**.

**I-05 Attack telegraphs you can read before a dodge** — P1
- Target: 5-5, a roll timed against a huge machine; 1-BL and 5-2, where the lit sensor is the first thing you see.
- Technique: lamp grammar only, with no new colour:
  - from the first windup frame, the hostile lamp stops its 4 Hz flicker and holds steady at 1.6× its HDR, with the iris snapping to a pinhole in 0.08 s;
  - the striking end gets a warm glint (#FFE6C2, 20.2 ΔE2000 from the nearest Horizon colour; HDR 1.5, 0.12 s);
  - lead time ≥ 0.45 s (≥ 0.30 s for the `flanker` cut).
- Owner · wave: instruments-a (`lamp.telegraph(t)` by grant on `src/instruments/lamps.js`) W1; each species lane wires it as a per-kind block row (-a W1, -b W2, -c W3, -d W4). Cost: 0. Tier: all.
- Gate: **A-play-telegraph**, **V-play-telegraph**.

**I-06 Lamps and weak points hold in golden backlight; an aimed cue** — P1
- Target: 5-2, 5-4 and 5-9: one glowing point per machine reads at once against a backlit golden field. Today A-weak40 is graded only at noon and in calima.
- Technique: lamp cores keep CORE_GAIN 2.5 over the new 1.30 threshold (L-07). Vials and the firebox run at 2.0× HDR with a ±15 % 0.6 Hz pulse; the Kiln firebox sheds 6 embers/s. A weak point within 2.5° of the crosshair while aiming gets 1.4× emissive, with no outline.
- Owner · wave: instruments-a (lamps) W1; combat-kit (the aimed cue) W2. Cost: 0 (embers ≤ 0.02). Tier: all.
- Gate: **A-weak40-golden**, **V-play-backlit-read**.

**I-07 The IP emissive rule and the silhouette test** — P0
- Target: 2-TR, 1-BL, 3-ENEMIES and 5-2/4/5/9, all as **counter-examples**: red-eyed animals and bipeds with glowing red cores (sampled ΔE2000 11.2–14.5 from Horizon red #ff2413).
- Technique: a gate-only emissive render:
  - NoToneMapping; environment, fog and lights off; post off;
  - `userData.ipExempt === 'fire'` meshes hidden (Cinder vials, the Kiln firebox, wellheads, braziers);
  - render to a 1600×900 target and compute ΔE2000 per pixel in JS, after normalising each emissive pixel by its max channel (otherwise any HDR core clipped to white passes trivially).
  - The colour rule it enforces is R66(c): lamp tokens, UI selection/focus/glow tokens and armour emissives ≥ 20 ΔE2000 from Horizon's five, with named exemptions; the ≤ 0.5 % area cap guards the rest.
- Owner · wave: instruments-a (harness in the kind block, which the orchestrator owns) W1; every species lane at its exit. Cost: 0 shipped. Tier: all.
- Gate: **A-ip-emissive**, **V-ip-not-animal**.

### 3.5 Playing: camera framing, combat readability, VFX

**P-01 Exploration chase framing that looks out at the world** — P0
- Target: 1-TR (our Sighting frame repainted: Brea ≈ 55–60 % of frame height, horizon in the lower half, sky, spires and the Ring above); 5-3, 5-1, 5-11. Ours: the V1-sprint horizon sits at 67 %, and ui-sighting is two-thirds grass.
- Technique in `player.js`:
  - `PITCH_REST` −0.035 rad;
  - auto-level when moving ≥ 1.5 m/s with no look input for 1.2 s, at up to 0.30 rad/s critically damped; any look delta cancels it for that frame; off while aiming, crouched, in Sighting or below −0.40;
  - slope look-ahead (+0.5 × downhill grade, −0.3 × uphill);
  - booms: jog 2.8, sprint 3.05, crouch 2.55; shoulder 0.30 → 0.34 m;
  - a `cameraAutoLevel` setting (default on).
- Owner · wave: hero-body (R57; player.js camera functions) · W1; shell-ui adds the toggle (≤ 3 lines). Cost: 0 direct (+0–0.4 for more scene; A21 vista re-timed on the new framing). Tier: all.
- Gate: **A-play-chase-horizon**, **V-play-chase-vista**.

**P-02 Over-the-shoulder aim at eye level** — P0
- Target: 5-2 (close over the shoulder, the target big and sharp); 1-BL (cheek anchor, draw hand and bow arm read). Ours: V4-aim-anchor shows the back of the head, and the bow limb passes ≈ 100 px from the crosshair.
- Technique: `CAM_DIST_AIM` 1.75 → 1.62; aim shoulder 0.52 → 0.60; aim pivot 1.45 → 1.54; entry eased over 0.18 s. Crouch-aim and per-weapon `aimFov` are unchanged.
- Owner · wave: hero-body · W1. Cost: 0. Tier: all.
- Gate: **A-play-aim-frame**, **V-play-aim**.

**P-03 Big-machine fight framing: low lens, look up, pull back** — P0
- Target: 5-5, 5-9, 5-2; 1-BL.
- Technique: an engaged-heavy blend:
  - trigger: an Instrument with `height` ≥ 2.6 m (a registry field) hostile within 22 m;
  - boom += 0.75 + 0.15 × min(H − 2.6, 4), at most +1.35; lens 1.30–1.45 m above her feet; FOV +3°; pivot −0.12; rest pitch −0.10 after 0.8 s with no look input;
  - the old +0.35 boom (3.33 m for a 3.8 m Screed, FOV 55 + 3°, rest pitch −0.10) put Brea at 49 % of frame height and the Screed's top −0.08 / −0.002 / +0.05 NDC above her crown at 18 m for a lens at 1.15 / 1.33 / 1.45 m, and the Screed at 0.57× her screen height at 10 m;
  - in 0.6 s, out 1.2 s (1.5 s after a kill); no yaw assist; hulls kept out by the orbit capsules.
  - The W1 stand-in is `sentry` at scale 3; graded on `heavy` from W2.
- Owner · wave: hero-body (camera) W1; instruments-a adds `height` to the registry by grant (≤ 6 lines), and each kind file fills it. Cost: ≤ +0.15 (wider FOV). Tier: all.
- Gate: **A-play-bigfight-frame**, **V-play-bigfight**.

**P-04 Impact VFX: palette, element bursts, chips, hull flash, impact light** — P0
- Target: 5-9 (sparks, fire and embers at the struck core); 5-2; 1-BL; 2-BL SEIZED.
- Technique:
  - (a) Palette: glaze chips in the kind's glaze; bronze keeps hot-metal sparks #FFC27A; **every blue entry removed**, with elements as Cinder, Brine and Dust.
  - (b) Melee passes the swing tangent, and showers bias 60 % along it; heavies ×1.4.
  - (c) Weak-point bursts: Cinder (3 procedural-fbm flame quads + 40–70 embers), Brine (24 mist quads), Dust (18 ochre puffs).
  - (d) Hull flash: the struck part's emissive +0.35k toward warm white for 70 ms on the real clock (lamps excluded) via `machine.flashPart(part, k)`.
  - (e) Impact light: borrow the pooled `environment.eyeLights[1]` (#FFB070, 6–18k, 6 m, 90 ms) through `environment.borrowLight(ms)`, for heavy or weak hits within 30 m only. 0 recompiles.
  - (f) Heavy swing smear at 0.45 opacity, #FFE0B0, contact frames only.
- Owner · wave: melee W1 (tangent, heavy ×, flash calls); instruments-a (`flashPart` by grant on `machines/machine.js`, ≤ 12 lines) W1; world-sky (`borrowLight`, ≤ 15 lines) W1; combat-kit W2 (`impactFeedback`, palette, bursts; grant on frozen `particles.js` for the flame and ember pools).
- Cost: ≤ 0.6 on a heavy weak-point frame (a burst: outside A21, capped by its own row, §4.6 rule 3); 0.05 idle; +1 draw (flame pool). Tier: all; low 0.5× counts.
- Gate: **A-play-impact**, **V-play-impact**.

**P-05 Hit weight: hit-stop, directional kick, FOV punch, trauma shake** — P0
- Target: the impact frame of 5-9 has weight.
- Technique:
  - Hit-stop through `engine.requestTimeScale('hitstop', 0.03)`: lance light 55 ms, heavy 90, weak +25, kill 120 (cap); arrows keep today's curve capped at 70; ≤ 180 ms in any 1 s. R66(l) says this is a capped freeze, not time dilation.
  - Kick through `player.addRecoil` along the tangent (light 0.012 rad, heavy 0.022).
  - FOV punch −1.5° (heavy) and −2.5° (kill), recovering over 0.22 s.
  - Trauma shake: shake² × 0.06 m (cap 6 cm) + 0.6° roll on heavies.
  - Damage taken: 0.03 rad and 40 ms.
  - `settings.cameraShake` scales all of it, and 0 turns it off.
- Owner · wave: melee W1; combat-kit W2; hero-body (`fovPunch`, shake curve, ≤ 15 lines) W1. Cost: 0. Tier: all.
- Gate: **A-play-hitweight**.

**P-06 Combat VFX GPU envelope** — P0
- Technique: fixed, preallocated pools, one draw each; emitters scale down past 12 % estimated screen coverage; ≤ 2 additive pools; smoke and dust normal-blended with an alpha cut at 0.02; 0 allocations per burst.
- Owner · wave: combat-kit W2; the orchestrator runs it at every wave exit from W2.
- Cost: the envelope is ≤ 1.0 on the worst VFX frame (a burst: outside A21, capped by this row, §4.6 rule 3) and ≤ 0.15 idle. Tier: all; low 0.5×, no footfall dust.
- Gate: **A-play-vfx-envelope**.

**P-07 Arrow flight: a full-draw glint and ribbon trails** — P1
- Target: 5-2, 1-BL, 2-BL STEADY. Ours: 1–5 brown breadcrumbs a frame, blue elemental trails, no glint.
- Technique:
  - a 4-point star glint on the head at draw ≥ 0.95 (HDR 2.4, 0.35 m): reed warm white #FFE6C2, otherwise the element colour;
  - one pooled ribbon strip for every arrow in flight (≤ 28 × 12 segments, 1.6 m tapering; reed 0.45 opacity with no glow; element 0.8 at HDR 1.6; a Cinder ember every 0.3 m);
  - orchil fletching (C-08). The trajectory is untouched.
- Owner · wave: armory W1 (`arrows.js`, `bow.js`); combat-kit W2 (element ids). Cost: +0.05 (1 draw). Tier: all.
- Gate: **A-play-arrow-read**, **V-play-arrow**.

**P-08 Dodge and sprint dust** — P1
- Target: 5-5, a roll through flying dust in golden backlight; 2-BL SEIZED card (a leap through dust).
- Technique: new `src/combat/fx/groundFx.js`, one instanced draw (≤ 192 quads) with a ground-fade:
  - events: dodge-start, dodge-contact (dodgeK 0.35 and 0.62) and sprint footfalls;
  - 12–16 quads per roll contact;
  - colour from `terrain.surfaceAt` (salt, black sand lifted to #4A4440, cinder, calima ochre); none on wet sand or brine;
  - forward scatter toward the sun.
- Owner · wave: combat-kit W2; hero-body emits the events (≤ 6 lines) in W1. Cost: ≤ 0.25 at peak, 0.02 idle. Tier: all; low 0.5× with no footfalls.
- Gate: **A-play-dodge-dust**, **V-play-dodge**.

**P-09 Ambient air: sunlit pollen, calima dust, Malpaís embers** — P1
- Target: the golden haze of 5-1, 5-3, 5-5 and 5-11; the motes over the grass and sea in 1-TR and 1-MR.
- Technique: world-sky's single Points draw with a per-point type:
  - Pans: 170 pollen and salt glints;
  - calima: 600 motes drifting SW at 2–4 m/s;
  - Malpaís: 240 embers near world-props emitters;
  - alpha × (0.4 + 2.2 × pow(view·sun, 4)); pollen off at night.
- Owner · wave: world-sky W1; world-props registers emitters W3. Cost: ≤ 0.08. Tier: all; low 0.5×.
- Gate: **A-play-motes**, **V-play-air**.

**P-10 One engaged-Instrument plate, top centre, with its ◆** — P1
- Target: 5-2 and 5-9 (one bar top centre with a diamond above it); 2-MR for weight. Ours: up to three plates stacked over the target.
- Technique:
  - The engaged Instrument (last to deal or take damage, or under the crosshair; large kinds always) gets one plate 34 % of the viewport wide at y 64–108 px.
  - The plate: levelling-staff fill, a paper-white ghost that holds 0.25 s then drains over 0.6 s, component ticks (WEAK in cobalt), the name in Chakra caps and HP in Plex.
  - The kind's ◆ marker sits above it in lamp colour and iris shape.
  - Others shrink to ≤ 2 compact plates (≤ 140 px) or compass pips; plates over the target fade to 40 %. Glass skin (U-01).
- Owner · wave: shell-ui W2. Cost: 0 GPU; ≤ 0.15 ms CPU p95. Tier: all.
- Gate: **A-play-engaged-plate**, **V-play-engaged-plate**.

**P-11 Vista idle and kite framing** — P2
- Target: 5-1, 5-11, 1-TL, 1-MR: a small figure from behind in a side third, the island beyond.
- Technique: after ≥ 2.5 s idle within 2 m of a ≥ 15 m drop, or on a `vista` gatePlace, the camera eases over 2.5 s to boom 4.2, FOV 58, shoulder 0.55, rest pitch −0.06. Any input restores it in 0.4 s. It is off while any Instrument within 60 m is wary or hostile. The kite (F-3) uses the same rig at boom 4.0 and FOV 60.
- Owner · wave: traversal (new, W3; it holds the camera lines with G-kite). Cost: 0 (+≤ 0.3 for more scene). Tier: all.
- Gate: **A-play-vista-idle**, **V-play-vista**.

### 3.6 UI: dark glass (decision 1)

**Decision record.** Option B (dark glass everywhere) is chosen and amended to Kevin's words: dark *violet* glass for
every menu, and a thin, minimal field HUD. Option A (polished paper) and option C (glass HUD with a paper book) are
closed. shell-ui's W1 logic survives (hud.js instruments, plate layout, `_dmgClear`, the Sighting mask, transects,
map baking, hub routing, settings rows; ≈ 88 % of the JS); its CSS (≈ 75 %) is redone. Effort is ≈ 14.75 shell-ui
lane-days (no minimap; +1.0 if Q6 says yes), plus ≈ 2.25 across look-post, combat-kit, progression, world-sky,
world-props and armory.

**How the glass stays CALIMA, not Horizon** (bible §11.1 lists "holographic Focus, hexes, smoked glass" as Horizon's
UI; R66(e) amends §9.7 and keeps these limits):
- right angles with 6 px L-shaped survey registration ticks, never notched or cut corners;
- no hexagons anywhere;
- no blur in play;
- violet as the glass's dark tint and as a dye fill, never as a glow wash;
- every glow and accent token ≥ ΔE2000 20 from #ff2413, #38c6ff, #ffb31f, #19ffd0 and #9B6BFF;
- the levelling staff, theodolite strip, stadia hairs and graduated tick stay the motifs;
- Chakra Petch and IBM Plex Mono.

**U-01 Dark violet glass token system** — P0
- Target: the panels of 2-MR, 2-BM, 2-ML and 1-BC (sampled #1C1A1E–#272329 with a violet cast; thin pale frame lines); "dark violet glass" in decision 1.
- Technique:
  - `--cal-glass` **#1E1A28** (L\* 10.3, a\* 5.8, b\* −8.8; ≥ 41 ΔE2000 from all five Horizon colours);
  - `--cal-glass-a-hud` 0.70 and `--cal-glass-a-menu` 0.90;
  - shell-ui renders the tokens into a project-original `reference/r5/shell-ui/glass-tokens.png` (with its MANIFEST row), the stored reference for every glass V-row (the paper `field-book.jpg` shows the opposite of dark glass);
  - a two-stop gradient (+4 % / −6 %), a 3 % baked grain tile (data URI ≤ 3 KB) and a 1 px top highlight `rgba(241,238,230,0.08)`;
  - line `rgba(241,238,230,0.16)`; text staff white #F1EEE6;
  - selection: a 1 px lilac line **#D8CCE4** (≥ 30.5 from all five) over an Orchil Deep #5A2E66 fill at 60 % (≥ 30.8);
  - health survey vermilion #D2452E (flat ink only, never emissive: a named R66(c) exemption);
  - WEAK as a staff-white chip with cobalt #2C4F8A text (≥ 26.7 from all five; lifted cobalts such as #6F93D6 fail at 17.3 and 19.5);
  - **brass is not a selection or glow token** (#B08A45 is 17.6 from #ffb31f).
  - Bible §9.1's "violet never in the UI" and §9.7's paper surface are amended by R66(e).
- Owner · wave: shell-ui · starts in W1 fix round 2; W2. Cost: 0 WebGL. Tier: all.
- Gate: **A-glass-language-static**, **A-violet-budget**.

**U-02 Declutter the field HUD to image 1's six surfaces** — P0
- Target: 1-TR has 6 surfaces (field note, compass with the 126 chip, ONE TILLER card, ONE LAMP tag, the tool rack, SABINA BOW 040) plus faint transect dashes. Ours (ui-sighting) has ≈ 15.
- Technique:
  - text chips only for the 2 reveals nearest the crosshair (within 25 m and 0.22 W of centre); the others become 6 px ink ticks;
  - BRG/DST folded into the card header, with the floating box deleted;
  - the vial hides after 4 s UNSEEN;
  - one full plate and ≤ 2 compact ones;
  - ≤ 1 tutorial card, auto-dismissed after 8 s.
- Owner · wave: shell-ui · W1 fix round 2. Cost: 0 (compositor ≈ −0.02). Tier: all.
- Gate: **A-ui-declutter**, **V-hud-declutter**.

**U-03 Freeze and frost the world behind every menu (a GPU saving)** — P0
- Target: the soft, unreadable backdrops of 2-BM and 1-BC. Today `main.js` re-renders the world every frame while paused (19.7–33.9 ms) under a page that covers ≈ 90 %.
- Technique:
  - On the first frame a page opens, the composer output is blitted to a quarter-resolution RGBA8 target with 4 dual-Kawase passes and held, tinted ×0.45 toward #1E1A28.
  - While a page is open `engine.render` draws one quad.
  - The new `engine.holdFrame(tex | null)` (≈ 30 lines) is G-post's (look-post at the W1 exit, or world-sky in W2, §5.1); shell-ui calls it on open and close.
  - RT ledger row "frosted frame" ≈ 1.7 MB, present only while a page is open.
- Owner · wave: look-post (API, at the W1 exit if it opens in time; otherwise world-sky under G-post in W2) + shell-ui · W2. Cost: ≈ 0.3 once at open; **the menu frame falls from 19.7–33.9 to ≤ 1.0 ms**; 0 in play. Tier: all.
- Gate: **A-menu-freeze**.

**U-04 Compositing guard: no live backdrop blur in play** — P0
- Target: the frosted look of 2-MR without a CSS `backdrop-filter`. That costs an estimated 0.4–1.2 ms in the GPU process, outside A21's timer, and `wheel.css` ships `blur(5px)` today.
- Technique: no `backdrop-filter` or `filter: blur` while `'playing'`; glass faked by alpha + gradient + grain + highlight; static shadows only; transform-only motion. The orchestrator adds a CDP Tracing wrapper (viz, gpu, cc) to `tools/gates.mjs` for this row.
- Owner · wave: shell-ui + combat-kit (wheel.css) + orchestrator (CDP wrapper, ≤ 30 lines) · W2. Cost: budget ≤ 0.35 GPU-process ms for the whole HUD. Tier: all.
- Gate: **A-ui-composite-cost**.

**U-05 Text contrast held at four lights** — P0
- Target: the golden, high-key worlds of the stills; the white Pans salt; 2-MR dusk.
- Technique: glass at alpha ≥ 0.70 over #1E1A28, blended over pure white, reads ≈ sRGB 0.38, which gives ≥ 5.3:1 for staff-white text. Hairlines drawn over the world keep `--cal-engrave`.
- Owner · wave: shell-ui · W2. Cost: 0. Tier: all.
- Gate: **A-ui-contrast**.

**U-06 The thin glass field HUD (decision 1: compass strip, small icons, health bar)** — P0
- Target: 2-MR (vitals and quest top-left, tools bottom-centre with key hints, a prompt by the crosshair, ammo bottom-right); 5-3 (a compass strip and minimal HUD while exploring); 1-TR (layout).
- Technique: hud.css only, with the DOM and logic kept:
  - health: the levelling staff, 300 × 6 px vermilion with 9 graduation gaps, and a stamina hairline (never a red 4-segment bar or a green pouch);
  - a 24 px emblem (broad arrow in a ring, not a diamond); a salt count;
  - the field note under it as 340 px of glass (kicker Chakra 11, title Chakra 600 17, objective Plex 13) that fades after 8 s without change;
  - the theodolite strip unchanged, with a glass bearing chip;
  - 3 tool cells of 44 px bottom-centre;
  - the interact prompt as a key cap + verb 24 px right of the crosshair;
  - weapon and ammo 240 × 56 bottom-right;
  - **no minimap** (Q6); calm exploration shows ≤ 4 surfaces.
- Owner · wave: shell-ui · W1 fix round 2 → W2. Cost: 0 WebGL; compositor ≤ 0.1. Tier: all.
- Gate: **A-hud-glass**, **V-hud-glass**.

**U-07 The Sighting card and reveal chips in glass; the overlay keeps its survey grammar** — P0
- Target: 1-TR's TILLER card layout (TILLER, SOIL CORE, TRANSECT 27, bar, LAMP · CALM, COMPONENTS 1/1, LAMP WEAK, CARRIES) in 2-MR's glass.
- Technique: the card in glass at 0.80 with a 3 px vermilion left rule, staff-white ticks and the WEAK chip (U-01). The sepia vignette (≤ 20 %), stadia hairs, figure mask and transects are unchanged; cobalt rings get a 1 px staff-white casing.
- Owner · wave: shell-ui · W2. Cost: 0 added. Tier: all.
- Gate: **V36-glass** + A-sighting, A-sighting-hue, A-sighting-over-brea, A-transect-fine, A-sighting-draws unchanged.

**U-08 The title screen as key art** — P0
- Target:
  - 2-TL: wordmark top-left, then CONTINUE / NEW GAME / SETTINGS / EXTRAS / QUIT in a left column, Brea 3/4 from behind in the right half;
  - 1-TL and 5-1: a low warm sun, haze, the Ring and spires on the skyline.
  - **Counter-example:** their thin wide-tracked wordmark with a tagline (§8).
- Technique:
  - The **§9.8 lockup unchanged** (Chakra Petch 600, spark above the I, one datum rule, broad arrow) with **THE ISLAND REMEMBERS under the datum rule in the R66(p) treatment**, placed at left 0.08 W, cap top 0.16 H, 96 px at 1600×900.
  - Stations at x 0.085 W from 0.50 H, 36 px pitch, Chakra 500 17 px caps; a staff hairline with a tick per row; the selected row gets a lilac broad arrow.
  - A left scrim from rgba(14,12,18,0.50) to 0 at 0.48 W. This is the title's glass: the title is key art, so it takes this scrim, not a 0.90 glass panel (R66 e).
  - The scene: `gatePlaces.title` (a rise facing the Ring and spires), Brea idle with wind in the tail, camera yaw 145–160° from her facing, FOV 40°; her box centre at x 0.66–0.76 W, height 0.48–0.62 H.
  - Light: the title hour from Q1 (recommended 18:40 golden with calima haze kept as weather).
- Owner · wave: shell-ui (menu.js) + world-sky (title key) + world-props (pose) · W2, after the world look pass. Cost: ≈ +0.3 over today's title (Brea's draws). Tier: all.
- Gate: **A-title-layout**, **A-logo-metrics**, **V-ui-title-keyart**.

**U-09 The hub in glass with top tabs** — P1
- Target: 1-BC's header (MAP / SKILLS / FIELD BOOKS / INVENTORY / SETTINGS, active underlined); 4's tab bar; 5-6 and 5-10.
- Technique: the margin station index becomes a top bar: **MAP · FIELD LOG · SATCHEL · MAKING · CHARACTER · SKILLS · FIELD BOOKS · SETTINGS** (Chakra 500 14 caps; the active tab gets a 2 px lilac underline). Q/E (LB/RB) cycle the tabs. The page is full-width glass at 0.90 over U-03's frame; footer actions are right-aligned and the field data sits footer-left. Routing is unchanged. Field log, settings, field books and death are restyled.
- Owner · wave: shell-ui · W2. Cost: menu only, ≤ 1.0. Tier: all.
- Gate: **A70-hub-tabs** (re-staged), **V-ui-pause-glass**.

**U-10 The dark painted map** — P1
- Target: 2-ML (painted relief island on dark, legend left, place card right with TRACK); 5-10 ("WORLD — ORCHIL, 1,024 m", footer Zoom / Waypoint / Close); 3-MAP.
- Technique:
  - the W-14 dark bake inside revealed triangles; unrevealed land in dark slate with a staff-white coastline (the survey rule stands);
  - contours 1 px at 12 %; the Datum Line in vermilion; names in Chakra 600 with a dark halo;
  - legend in set icons (MAIN OBJECTIVE, SITE, SETTLEMENT, BENCHMARK, TRIG PILLAR, BRAZIER, WAYPOINT, DANGER), **never "Camp"**;
  - a site card with TRACK; footer ZOOM / WAYPOINT / CLOSE; scale bar 0/250/500 m; no glowing caldera.
- Owner · wave: shell-ui · W2. Cost: menu only. Tier: all.
- Gate: **A-map-dark**, **A-map-relief**, **V-map-glass** (+ A-map-triangles, A-map-arrow-heading).

**U-11 The satchel as a specimen grid with a large item render** — P1
- Target: 2-BM (tabs, a 5×3 grid with counts, a framed selected cell, a detail column with a large item picture).
- Technique:
  - tabs ALL / WEAPONS / TOOLS / STORES / FIELD BOOKS / TRADE;
  - 84 px cells (5 columns, 8 px gap), each with a 44 px set icon, a Plex count and a 3 px rarity rule in `--cal-r-*` (never Fortnite-style coloured tiles);
  - the selected cell framed in lilac with registration ticks;
  - a 380 px detail column with a GLB turntable on the main canvas (scissor) over the held frame, or the 160 px mark.
- Owner · wave: shell-ui W2; armory adds the equip half in W3. Cost: menu +0.2–0.4 on top of the held frame. Tier: all; low shows the mark.
- Gate: **A-satchel-grid**, **V-ui-inventory-grid**.

**U-12 The CHARACTER page: the armour ladder and customization** — P1 (decision 2)
- Target: 4's header (CHARACTER tab, "BREA, Salt-pan Reckoner"), 4-L1…L8 cards, 4-SIL and 4-CUS; 2-TC for the sheet.
- Technique:
  - eight rung cards (C-09) in glass, each with the tier label, the set name, the one-line tagline and 4–5 swatches;
  - locked rungs show a black-fill silhouette only; the selected card gets a lilac frame, **with no violet glow**;
  - a turntable of the worn set;
  - the C-10 options; the character sheet from bible §3.1 (C-12).
- Owner · wave: armory (`inventory.{js,css}` grant, W3) with shell-ui's tokens. Cost: menu only. Tier: all.
- Gate: **A-character-page**, **V-ui-character**.

**U-13 Field Book certifications drawn as a triangulation net** — P1
- Target: 1-BC (a centre node with linked nodes, a detail column, points bottom-left, actions bottom-right); 2-BL FIELD BOOKS. **Counter-example:** 3-UI's hexagon tree with a glowing violet centre.
- Technique:
  - 44 px circles holding the broad arrow, linked by 1 px rules into triangles;
  - the selected node gets a 2 px lilac ring;
  - footer "N CERTIFICATION MARKS" with CERTIFY and BACK;
  - three entries (Transect, Ballast, Bearing), each naming its survey act; no hexagons and no bloom.
- Owner · wave: progression (skills.js) W3 + shell-ui (style.css) W2. Cost: 0. Tier: all.
- Gate: **A-skills-net**, **A-ip-progression**, **V-ui-skills-net**.

**U-14 The Kit Rack as a protractor half-ring at the right edge, in real time** — P1
- Target: the partial wheel at the right edge of 2-MR. **Counter-example:** a full centre radial with slow-motion (Horizon's weapon wheel).
- Technique: a 180° half-ring anchored to the right edge (outer 190 px, inner 96 px), 5 sectors, a rim graduated every 6° with numerals every 30°, glass at 0.78 with icons; timeScale stays 1.0 (R32); `backdrop-filter` removed.
- Owner · wave: combat-kit (`wheel.{js,css}`) W2. Cost: −0.3…−0.8 compositor while open (blur removed). Tier: all.
- Gate: **A-kitrack-protractor**, **V-kitrack**.

**U-15 A 24-icon line set built on the survey marks** — P2
- Target: 2-BRi (18 line icons in one grammar), for the grammar only. The glyphs are drawn new, never traced.
- Technique: 24 SVG paths from arithmetic on a 24 px grid with a 1.5 px stroke: map marks, tools, weapons, elements, statuses, brazier, kite, close and back.
- Owner · wave: shell-ui · W2. Cost: 0. Tier: all.
- Gate: **A-icon-set**, **V-ui-icons**.

**U-16 Dialogue as a glass lower-third** — P2
- Technique: `body #cal-dlg` overridden in style.css: 820 px wide, ≤ 132 px tall, bottom at 7 % H, speaker in Chakra 600 14, line in Plex 16, ≤ 3 lines, glass at 0.78. The words stay PENDING (R61 b).
- Owner · wave: shell-ui · W2. Cost: 0. Tier: all.
- Gate: **A-dialogue-lower-third**.

**U-17 Look-gate staging uses CALIMA quest words only** — P0
- Target: 1-TR, 2-MR and 5-3 print "LESSONS OF THE VALLEY / Speak with Varl/Vazi/Vavi at the campfire", and our HUD still does (R65).
- Technique: every look re-film stages a bible §8.9 beat through a shell-ui `hud.stageNote({kicker, title, objective})` that works only under `?shot=1` (e.g. "THE FIRST TRIANGLE / Climb the trig pillar at Rust Cone"). There is no progression debug hook to use.
- Owner · wave: shell-ui · W2 (now, for any look film). Cost: 0. Tier: all.
- Gate: **A-ui-words-look**.

**U-18 True blur slabs, ultra only** — P2 ✂
- Technique: a 1/8-resolution blit, a 2-pass Gaussian and ≤ 8 instanced panel quads from `onAfterRender`.
- Owner · wave: shell-ui · W2 stretch. Cost: +0.15–0.25 and +4 draws on ultra only.
- Gate: **J-glass-slab-cost**.

**U-19 UI geometry and colour IP guard** — P1
- Target: 2-MR, 1-BC, 2-BL FIELD BOOKS and 3-UI/4 as counter-examples for chrome (notches, hexagons, holograms, Focus-violet glows).
- Technique: the U-01 rules, checked over every screen.
- Owner · wave: shell-ui + combat-kit + progression · W2 / W3. Tier: all.
- Gate: **A-ui-ip-geometry**, **V-ui-ip**.

### 3.7 The four new features (decision 3), each in CALIMA's own form

| Kevin asked for | Horizon's form (never copy) | CALIMA's form |
|---|---|---|
| a campfire to rest and save | campfire = save + fast travel + stash | **the Brazier**: a pitch fire at a cistern. Rest chooses the light (dawn, golden, dusk, night) and saves. It never moves you: travel stays at the benchmarks and Brea's cistern |
| an ammo crafting screen | a craft card with a hex glow, "Shock Arrow — stuns machines", a time-slowed wheel | **the Making ledger**: a glass ledger page of island recipes and tallies with a lit turntable. MAKE in the hub, or quick-make in the Kit Rack at timeScale 1.0 |
| glider traversal | the Shieldwing (a glowing triangular hard-light wing, deploy anywhere) | **the Survey Kite**: a two-cell box kite of split cane and sailcloth, flown on the trade wind. It opens only in the wind, climbs on windward ridges, refuses calima, and shows you to Sondes |
| tall-grass stealth | discrete rust-red tall-grass patches that hide you | **Reed cover**: continuous carrizo cane and salt-rush beds along water, plus today's marram colonies. They hide you **while the wind moves them**. Pegs cut transect lanes through them, and the golden meadow never hides you |

**F-1 The Brazier: rest and save** — P1
- Target: 5-11 (Brea sits by a fire on a cliff at sunset, warm light on her face against a cool sea); 1-MR.
- CALIMA form:
  - A basalt bowl on three stones beside a stone cistern, kindled with pitch-soaked driftwood (Brea's name means pitch).
  - Placed at Brea's cistern (`REST`), the Saltrow and Ninewalls cisterns, Mistfold, the Malpaís tube shelter, and the foot of each trig pillar once its triangle is surveyed.
  - UI words: BRAZIER, KINDLE, REST, REST UNTIL DAWN / GOLDEN / DUSK / NIGHT. **"Camp" and "campfire" are banned words.**
- Rules:
  1. Interact to sit (`player.ride(path, 'Sitting_Idle_Loop')`, the published contract), choose a light, and the world fades to that hour through the existing `environment.rest({toHour, seconds})` (environment.js:576–591; no new contract).
  2. Resting writes the save (A65).
  3. A brazier is never a travel node; travel stays at the benchmarks and Brea's cistern, where the map sheet already puts it.
  4. Rest is refused while any Instrument within 60 m is wary or hostile.
  5. Resting refills the Brine gourds from the cistern.
- Visuals:
  - two crossed quads with a procedural fbm flame shader (HDR core #FFB070 shading to #FF6A2A at the edges);
  - ≤ 48 embers from the shared ember pool;
  - light from the pooled `fireLight` (0 recompiles), intensity max(night, a dusk ramp from 18:30, 1 within 12 m) × 26 × the existing 9.1/21.7 Hz flicker, over 14 m;
  - `userData.ipExempt = 'fire'`.
- Owner · wave:
  - settlements W2: the brazier module in its kit and placement at the settlements and `REST`;
  - world-sky W1: the fireLight rule (≤ 10 lines); `environment.rest` already exists, so there is no `advanceTo` stub;
  - world-props W3: braziers at the trig pillars;
  - shell-ui W2: the glass rest dialog;
  - progression W3: save v6 on rest (W2 uses today's save path);
  - audio W3: crackle.
  - The movement stack is not touched (published contract only).
- Cost: +0.08 near a lit brazier; light 0. Tier: all.
- Gate: **A-brazier-rest**, **A-play-brazier**, **V-play-brazier**.

**F-2 The Making ledger: ammo making** — P1
- Target: 5-6, for layout mood only. Its name, wording, hex glow and card layout are **counter-examples**; 2-BM; the MAKING station (STN 04) already in our hub.
- CALIMA form: the MAKING tab, in glass, as a two-column **ledger**:
  - Left: ledger rows for the bible §5.2 ammo, **REED** (Blunt), **BARBED** (Pry), **BRINE-GOURD**, **CINDER-RESIN** and **DUST-PUFF**, plus Brine, Cinder and Dust pots and nets. Each row shows carried / cap in Plex.
  - Right: the selected item as a GLB turntable under one key light and one rim light, with **no glow plate**.
  - The recipe as tallies of island materials: cane shafts, gull feathers, obsidian flakes, vent resin, brine gourds, pumice dust, cord, salt.
  - The effect in our words, e.g. DUST-PUFF "Clouds an Instrument: its lamps go blind for 6 s".
  - **MAKE ×1** and **MAKE ×6**.
- Rules:
  1. Making in the hub happens over U-03's held frame (a menu).
  2. In the field, quick-make from the Kit Rack: hold a slot 1.2 s to make one bundle of 6; timeScale stays 1.0 (R32); damage interrupts it with 0 made.
  3. The button is MAKE, never CRAFT.
  4. Nothing on this page reads "shock", "stun" or "interrupts their routines".
- Owner · wave: combat-kit W2 (recipes in `src/items/crafting.js`, quick-make in the Kit Rack); shell-ui W2 (the page); armory W1/W3 (arrow and element-head GLBs, C-08).
- Cost: menu +0.2–0.4 on top of the held frame (≤ 1.0 total); quick-make 0. Tier: all; low shows the mark instead of the GLB.
- Gate: **A-making-ledger**, **V-ui-making**.

**F-3 The Survey Kite: glider traversal** — P1
- Target: 5-8, for the mood only. Its membrane wings are the **counter-example** (they echo the Shieldwing); 1-MR (the high coastal view); 5-1.
- CALIMA form:
  - A Hargrave-type **two-cell box kite** of split carrizo cane and undyed sailcloth, with an orchil-dyed leading cell and side wings, bridled to a cane crossbar that Brea hangs from.
  - The Fogcatchers use such kites to carry fog-net lines over the barrancos, and the Pan Houses use them for aerial sightings. Brea earns hers at Saltrow (a W3 quest hook; Mistfold does not exist until settlements W4; until then it is a debug unlock).
  - It is carried furled as a 0.95 × 0.12 m roll strapped horizontally across the small of her back under the quiver (≤ 600 tris in the stow kit). It opens with a cloth snap in 0.35 s.
  - The silhouette has rectangular cells, visible spars and no triangular planform. There is no glow, no hard light and no emissive.
- Rules (the wind does the work):
  1. It opens only when airborne for ≥ 0.35 s with ≥ 3 m of clearance (jump again).
  2. Air speed 7.5 m/s and sink 1.5 m/s in still air (glide 5:1). The trade wind adds 0.4 × `windAt` to ground speed: about 6.5:1 flying with the wind, 3.5:1 against it.
  3. **Ridge lift:** over windward slopes ≥ 25° (facing within 60° of the wind source) within 40 m below, vertical speed is +0.5…+1.5 m/s up to launch + 25 m.
  4. **Calima and squall ground the kite:** it will not open.
  5. Folding happens on landing or by input. Landing at ≤ 3 m/s vertical takes no fall damage; folding mid-air leaves today's fall rules unchanged.
  6. While flying, Plumbs and Sondes see her at ×2 range: one traversal-owned `perception.detectMul` filter keyed by the `sentry` and `spotter` roles (no kind-file edits).
  7. No weapons while flying.
  8. The camera uses P-11's vista rig.
- Owner · wave:
  - **traversal**, a new lane on port 5250 (judge 5280), W3–W4. It holds grant **G-kite**:
    - `src/entities/player.js` ≤ 90 lines (a `kite` airborne state, entry and exit, wind and ridge-lift integration, the landing hook);
    - `src/entities/playerAnimator.js` ≤ 40 lines (a hang-pose layer built from the kept UAL clips; no new clip source);
    - `src/core/input.js` ≤ 4 lines;
    - new `src/traversal/**` (including the ×2 `detectMul` filter of rule 6), `tools/build/recipes/kite/**`, `public/models/traversal/**`.
  - traversal runs in audio's W3 slot after audio exits, then in brand's W4 slot until brand's scrub (§5.2).
  - armory W3 adds the furled roll to the stow kit.
  - world-sky publishes `windAt` (W1 contract).
- Cost: open ≤ 1 draw and 1 caster (cascades 0–1), ≤ 1.2 k tris, sail flutter in the vertex shader; furled 0 extra draws; CPU ≤ 0.05 ms. Tier: all.
- Gate: **A-kite-flight**, **A-kite-inert**, **A-kite-ip**, **V-kite**.

**F-4 Reed cover: tall-grass stealth** — P1
- Target: 5-4, for mood only (crouched at dusk, machines patrolling). Its tall grass, red-eyed patrols and triangle marker are **counter-examples**.
- CALIMA form:
  - **Carrizo** (giant cane, 2.0–3.2 m, pale green-gold stems #B9C48A, buff plumes #D6C9A0) along barranco floors, the Glass rim, Saltrow's lee ditches and the pan dykes.
  - **Junco** salt rush (0.7–1.0 m, olive-straw) on brine margins, giving crouch cover only.
  - Both follow the moisture and water mask as continuous ragged-edged fields, never discrete patches. They are never red or rust (per-instance hue ≥ 38°).
- Rules:
  1. **The wind hides you.** Concealment = density × a wind term. In trade gusts (`windAt` ≥ 4 m/s) the moving canes mask motion, so crouch-walking stays hidden. In a lull (< 2 m/s; the dawn and dusk lulls) only stillness hides you.
  2. **The golden meadow never hides you** (W-06): it is scenery.
  3. Pegs cut **transect lanes** through reed (1 m clear-cut lines with cover 0), and Screeds level reed on the Datum.
  4. Cinder burns reed (cover 0 for 120 s, a brief smoke screen); ✂ if W2 runs short.
  5. The detection read is P-12 below. **No HUD glyph over Instruments, and no triangle or eye over heads.**
  6. Tip text: "REEDS HIDE YOU WHILE THE WIND MOVES THEM". Never "tall grass".
  7. The cover is the existing stealth cover, widened: `tallGrassDensity` and `isInTallGrass` are frozen by A-terrain-api and read by 9 files (hud.js, fauna.js, instruments/lib/hot.js, audio.js, player.js:2326, playerAnimator.js:1910, ai/perception.js:299–327, ai/search.js:36 and vegetation.js), so the names stay. Today's marram colonies (vegetation.js:18, A59b; the "scrub" of bible §11.1) stay cover.
- P-12, the detection read (folded in here): No HUD glyph over Instruments. Detection reads from the lamp in the world (iris, rhythm, colour; bible §7.2) and from the compass ◆ pip filling in state colour, plus the 6 % vignette (corner luminance −6 % over 0.4 s through the grade's `uVignette`). A glyph that fills calm → wary → hostile over each enemy would be Horizon's detection marker in another shape.
- Owner · wave:
  - world-ground W1 (Pans: the Glass rim and Saltrow ditches) and W2 (Holds barrancos): reed and rush kinds (1 draw each, 0 casters). world-ground keeps the frozen names, now returning reed, junco and marram-colony cover (meadow kinds add 0), and adds `coverAt`/`cutCover`: the cover field `ctx.terrain.coverAt(x, z)` from the existing 256² stealth mask, and a contract `ctx.terrain.cutCover(polyline, w)`;
  - instruments-a W1: Pegs call `cutCover`;
  - hero-body (G-camera, ≤ 10 lines) sets `inTallGrass = cover > 0.45 && (moveSpeed < 0.2 || windAt ≥ 4)`;
  - perception.js and search.js are untouched; there is no instruments-b grant;
  - shell-ui W2: the compass ◆ pip fill and the tip;
  - progression W3: the dialogue line at progression.js:652;
  - audio W3: reed rustle scaled by wind.
  - Cerrillo is ≤ 0.70 m (W-06), so a crouched Brea is never shown hidden in meadow while she is still detected (A-reed-cover j). A59b and A60 stay green.
- Cost: +0.15–0.3 where reed is in view (≈ 120 tris per instance); perception ≤ 0.02 ms per Instrument. Tier: all; low uses half density.
- Gate: **A-reed-cover**, **A-play-stealth-read**, **V-reed-stealth**.

---

## 4. Perf plan (A21: median GPU ≤ 14 ms at DPR 1.25, 1600×900)

### 4.1 Where we stand

Nov 6, quiet box: **vista 19.7–21.2 ms, herd 33.9 ms, staged fight 20.5 ms**, against 14 ms. The vista reading is
world-ground's report (`trees/world-ground/docs/ROUND5-WORLD-GROUND.md` §6). The same report reads the herd at 20.10 ms
on world-ground's tree, so the 33.9 ms herd came from another build; L-18 says which build before it attributes
anything. The post chain is bloom + GTAO at quarter resolution + SMAA, plus world-sky's shafts after the composer. Of
the vista, the world costs 11.9–13.6 ms; the floor with ground, water and flora hidden is 7.6 ms (post, sky and the
rest). **The look items do not close this gap; they must not widen it.** Closing it is a separate GPU-recovery track,
and it runs first. Its wins (§4.2) are booked to A21, never to the look ledger (§4.6 rule 2).

Dynamic resolution hides cost in real play. `QUALITY_TIERS.high` ships `drs: true, drsFloor: 0.7` (engine.js:98), and
only `?shot` turns it off (main.js:90). In Kevin's real play any frame over 20.5 ms renders at 70 % scale, so gate
shots are sharper than the game. Rule 2 therefore also requires the median `renderScale` in shipped (non-`?shot`) mode
to be ≥ 0.95 on each A21 scenario.

### 4.2 GPU recovery first (booked to A21, never to the look ledger)

Every saving in this table is an A21 row. None of it pays for a look item: a look item is enabled on `high` only by
§4.6 rule 2.

| order | win | owner · when | est. saving |
|---|---|---|---|
| 1 | **L-18 attribution** of vista, herd and fight by pass (timer queries) and by owner (hide-one marginals plus an interaction residual), with every row ≥ 0.5 ms assigned a fix owner here | look-post (tool) + orchestrator · inside the W1-exit global run (R45), before L-16 | — (it first names the herd's build: 33.9 ms on Nov 6, 20.10 ms on world-ground's tree) |
| 2 | **W-01** terrain chunks + LOD, far-field macro albedo, marram-far retired, caster cascades, far sea | world-ground · W1 fix round to W2 (the ground-mesh LOD is its W2 item, so not available at the W1 exit) | −3.0…−5.0 vista |
| 3 | **L-10** sky last (z = w, LEQUAL, renderOrder 1000) + baked noise | world-sky · W1 day 1 | noise row −0.2…−0.6; order row ≈ 0 (booked separately) |
| 4 | **I-04** Instrument LOD1 casters (medium and large); small kinds skip the far cascade (`rig/lod.js` grant + G-post's per-cascade layer masks) | instruments-a W1, then each kind lane | −0.3…−0.8 herd |
| 5 | **L-08** the full-resolution post-SMAA shaft pass deleted, re-cast at quarter resolution in HDR | world-sky (gather; fold under G-post) · W2 | net −0.1…+0.1 (−0.3 on low) |
| 6 | **L-15** ridge rings out | world-sky · W1 | −0.05…−0.2 |
| 7 | herd candidates to measure in step 1: Instruments in all 3 cascades × 8 bodies, additive lamp-beam overdraw, skinned-mesh and material count per kind, GTAO at herd density | named by L-18 | unknown until measured |
| — | **U-03** menu hold frame (not an A21 frame; it protects the machine) | look-post at the W1 exit if in time, otherwise world-sky under G-post in W2; + shell-ui · W2 | −19…−33 while a menu is open |

### 4.3 The look ledger (vista at high, analyst estimates; `A-look-ledger` replaces each with an A/B median)

Recovery wins are not in this ledger. They are booked to A21 (§4.2, §4.6 rule 2).

| group | items | est. Δ ms |
|---|---|---|
| post and sky adds | L-01 +0.03, L-02 +0.08, L-04 +0.01, L-05 +0.15 (+0.05 mist), L-06 +0.01, L-09 +0.08, L-12 tint +0.01, L-12 hero-near contact +0.10–0.15, L-13 +0.03 | +0.38…+0.73 |
| world adds | W-03 +0.3, W-04 +0.35, W-05 +0.03, W-06 +0.8 (three rows: R0 + backlight, R1, R2/R3), W-07 +0.12, W-08 +0.38, W-09 +0.1, W-10 +0.22, F-4 reed +0.15–0.3 | +1.75…+3.5 |
| character and playing adds | C-01…C-04 +0.1, C-07 +0.15–0.25, P-01 framing +0.2, P-09 +0.05 | +0.30…+0.65 |
| **look ledger (vista)** | every item on at `high` | **+2.4…+4.9** |
| for comparison only: A21 recovery (§4.2) | W-01 (from the W2 exit), L-10 noise row, L-15, L-08 net | −3.2…−5.9 |
| vista net, for information only | ledger + recovery | −3.5…+1.7 (−3.9…+1.3 with L-10's earlier −0.4…−1.2 estimate) → vista ≈ 16.2–22.9 ms on the 19.7–21.2 ms baseline |
| herd | the same world and post terms, I-01…I-03 +0.04, VFX idle +0.15 (I-04's −0.3…−0.8 is A21 recovery) | unknown until L-18 names the build: 33.9 ms on the Nov 6 build, 20.10 ms on world-ground's tree |
| fight | vista terms + P-03 ≤ 0.15; the P-04/P-06 bursts are outside A21 and capped by their own rows (≤ 1.0) | ≈ 17–22 ms |

The ledger is positive by construction. Each positive-cost row goes on at `high` only when A21's measured median with it
on meets that exit's bar and shipped-mode `renderScale` stays ≥ 0.95 (§4.6 rule 2); a row that misses stays off on
`high` and its V-row reads FAIL-deferred. Q2 asks Kevin for the fallback.

### 4.4 Tier table (`QUALITY_TIERS.<tier>` plus a new `.look` row; `high` is the shipped tier that A21 grades)

| lever | low | medium | high | ultra |
|---|---|---|---|---|
| DPR cap · GTAO · CSM (existing) | 1.0 · off · [1024] | 1.25 · off · [2048, 1024] | 1.25 · ¼ · [2048, 1024] | 2.0 · full · full |
| AgX + grade + LUT (L-01/02) | on | on | on | on |
| sky IBL (L-04) | 64², every 0.5 h | 128², 0.1 h | 128², 0.1 h | 256², 0.05 h |
| aerial v2 (L-05) | 1 lobe, no mist | full | full | full |
| shafts (L-08) | off | 20 taps | 32 taps | 32 taps |
| cumulus (L-09) | 1 variant | 2 | 2 | 2 |
| AO tint / contact (L-12) | tint | tint | tint + hero-near contact (rule 2) | tint + 40 m contact |
| adaptation (L-13) | off | on | on | on |
| DOF (L-17) | off | off | aim + close-up | aim + close-up |
| reflection probe (W-08) | analytic sky | 64², 1 face / 2 frames | 128², 1 face / frame | 256², 6 faces / 3 frames |
| strata (W-03) | albedo bands | no ledge normal | full | full |
| meadow R0/R1/R2 (W-06) | 8 / 22 / shader | 10 / 30 / 70 | 12 / 40 / 100 | 16 / 60 / 140 |
| trees (W-10) | LOD1 from 30 m, no casters | LOD1 from 50 m | full | full |
| stacks (W-04) | LOD1, no casters | full, last cascade | full | full |
| sand sparkle / sea micro-glints (W-07/09) | off / off | on / on | on / on | on / on |
| far-field start (W-01) | 110 m | 110 m | 160 m | 160 m |
| skin (C-01/02) | wrap only, 1 lobe | + transmission, no detail | full | full |
| hero shadow map (C-07) | off | off | on (rule 2) | on |
| combat VFX, motes, dust (P-04…P-09) | 0.5×, no footfalls | 1× | 1× | 1× |
| UI true blur (U-18) | off | off | off | optional |

### 4.5 Cut order

- **Low** ships with the cuts in the table above. It keeps the cheap core of the look (AgX, grade and LUT, keys, sky IBL, single-lobe aerial, sun disc, bloom retune, sky last, sun path, AO tint, the black-sand base, the sea glitter base). Its bar is rule 2 applied on `low`: A21's quiet-box medians with low's items on meet that exit's bar. Recovery wins are not netted against it.
- **High**, if A21 misses an exit's bar after §4.2, these stay off on `high` first (smallest visual loss per ms first; `ultra` is never a graded tier, so parking an item there does not ship it):
  1. C-07 hero shadow off on high;
  2. L-12 contact off on high;
  3. L-17 close-up DOF off (aim DOF stays, because it only runs while aiming);
  4. W-08 probe to 64² every 2 frames;
  5. W-06 R2 100 → 70 m;
  6. W-10 trees LOD1 from 50 m;
  7. W-04 stacks without casters;
  8. L-08 at 20 taps;
  9. W-03 without the ledge normal.

### 4.6 Rules

1. Every look item names its GPU cost and tier (§3). `A-look-ledger` replaces each estimate with a quiet-box A/B median at every wave exit from W1 (items estimated ≥ 0.10 ms one by one; the rest as one group, L-16).
2. **Recovery wins (W-01, I-04, L-10, L-15, deleting the post-SMAA shaft pass) are booked to A21, never to this ledger. A positive-cost look item is enabled on `high` at an exit only when A21's quiet-box median with the item on meets that exit's bar, and the median `renderScale` in shipped (non-`?shot`) mode is ≥ 0.95 on each A21 scenario. Bars: W1 exit vista ≤ 17.0, herd ≤ 20.0, fight ≤ 17.0 ms; from the W2 exit 14.0 ms on all three, and A-gpu-tier-pans ≤ 13.0. An item that misses stays off on `high` and its V-row reads FAIL-deferred. `ultra` is never a graded tier.** The interim W1 bars are a proposal; Q2 still decides the fallback.
3. **≤ 0.45 ms per ledger row on A21 frames. W-06 is three rows (R0 + backlight, R1, R2/R3). Bursts (P-04, P-06) and the close-up DOF are outside A21 and capped by their own rows.**
4. Draws stay ≤ 350, and every draw a look item adds outside post is ledgered with that item (for example C-07's +5, W-04's ≤ 4, F-4's ≤ 2, and the P-04 flame pool and P-07 ribbon at +1 each), as `A-look-ledger` checks.
5. `A-rt-ledger` ≤ 170 MB and `A-vram-ledger` ≤ 450 MB with the look on. L-04 frees 3.9 MB of VRAM; L-09 +5.6, W-01 +5.6, L-10 +1.4, W-08 +1.0, L-02 +0.26 and C-07 +8.4 add.
6. 0 shader recompiles from look items at runtime (pooled lights only).
7. No `backdrop-filter` in play; the HUD's GPU-process cost is ≤ 0.35 ms (U-04).

---

## 5. Routing

### 5.1 Who owns the post chain

engine-gpu has merged and has no active lane. A short new lane **look-post** takes it:
- port **5251** (engine-gpu's, retired) with judge **5281**; R66(i) records the port reuse, because the plan's §2 says ports are never shared;
- active from the first free W1 slot until its W1-exit merge, which lands before world-sky starts W2 work (rule 8's six-agent cap);
- grant **G-post** over `src/core/engine.js`: OutputGradeShader and Pass (tone map, grade, LUT, AO tint, shaft fold, DOF fold), bloom parameters, the new `onAfterScene` hook, the contact pass, `holdFrame`, adaptation, the per-cascade layer masks CASTER_ONLY / CASCADE0_ONLY (≤ 15 lines in `enableCSM`, :1573; W-01 (4) and I-04 need them), and the `QUALITY_TIERS.<tier>.look` rows;
- grants at the W1 exit on `src/instruments/lamps.js` (≤ 25 lines) and `src/hero/sheets.js` (≤ 10 lines), both calling `engine.look` so the lamp rings and the one-glance sheets survive AgX (L-01);
- it owns new `src/core/look.js`, `src/core/look.grade.json` and `tools/look/**`;
- it inherits engine-gpu's must-stay-green rows (A-gpu-tier, A-rt-ledger, A22, A108, A109, V20, V33b, V-gpu-tier-look) and **absorbs the R48(c) engine follow-up backlog** (the aim DOF was already filed there).

world-sky keeps `environment.js` (sky, fog, keys, weather, probe, IBL, shafts gather). At look-post's W1-exit merge its
W2 items (the `onAfterScene` hook with the L-08 fold, L-12, the L-14 dusk set, L-17, and U-03 `holdFrame` if it is not
done) pass with G-post to world-sky for its W2 extension. After world-sky's W2 exit, `engine.js` is frozen again;
later post changes go through a §1.2 grant to world-sky at W4. Fallback, if no slot frees before the W1 exit: the same
grant goes to world-sky.

### 5.2 Lane → items → when

"Absorb now" = in the lane's day-1 brief (lanes not yet started). "Next fix round" = the lane's next targeted round
(lanes running). Running lanes are those with commits beyond main on Nov 6.

| lane | status Nov 6 | items | when |
|---|---|---|---|
| **look-post** (new) | to open | L-18 tool first, L-00 tool + refs (+ A-look-random), L-01 (+ `look.evaluate`/`invert`, the lamps.js and sheets.js ports by grant), L-02, L-07, L-14 calima grade set, L-16 tool and tier rows, G-post's per-cascade layer masks, U-03 `holdFrame` if in time; L-13 in W3 by grant re-open | W1 exit; the lane ends at its W1-exit merge. L-18 then L-16 run inside the W1-exit global run. Its W2 items pass with G-post to world-sky (§5.1) |
| **world-sky** | not started (absorb now); **extended through W2** (R66 i) | L-03 (+ the 05:30 key and the 05:24/19:54 troughs), L-04, L-05 (+ golden air, mist), L-06, L-10 (z = w, LEQUAL), L-11 (New Game 07:00), L-14 calima, L-15 rings out, W-08 probe, the synchronous `?shot` bakes, `calSunCol`/`calSunRad`/`windAt`/`borrowLight` contracts, P-09 motes, F-1 fireLight rule, U-08 title key; in W2 under G-post: the `onAfterScene` hook + L-08 fold, L-12, the L-14 dusk set, L-17, U-03 `holdFrame` if not done | W1: all listed except the W2 items. W2 (starting after look-post's W1-exit merge): L-08 gather + fold, L-09 cumulus, L-14 dusk keys + set, L-12, L-17, U-03 if not done. W4: per-biome tuning, W-11 later biomes |
| **world-props** | not started (absorb now) | `gatePlaces.look.*` stub day 1 (L-00), W-04 stacks + Roque plug, W-05 Ring upright 34 m (the `gen-sounding-ring.mjs` move by grant), Organ Shelf pipes, pumps, includes the W-03 strata chunk, U-08 title pose | W1 (day-1 brief). W3: W-13 Kiln Yards, braziers at trig pillars (F-1), ember emitters (P-09). W4: the other Roques |
| **instruments-a** | not started (absorb now) | I-01 shared chunk (grant) + Tiller/Plumb/Peg, I-03, I-04 LOD1 casters (+ `rig/lod.js` grant), I-05 `lamp.telegraph` (grant) + its kinds, I-06, I-07 harness, P-03 registry `height` (grant), P-04 `flashPart` (grant), F-4 Pegs call `cutCover` | W1 |
| **world-ground** | running → next fix round | **W-01 first** (ground-mesh LOD in W2), W-02, W-03 (Pans-visible faces), W-05 the Ring rise in `sites.js` (0.5 → 6), W-06 Pans belt + backlight + anti-shimmer + capsule push (cerrillo ≤ 0.70 m), W-07, W-08 sampling, W-09, W-10 tamarisks, W-11 Pans, W-14 bake, L-15 sister isles (carried skirt), F-4 reed and rush + the frozen `tallGrassDensity`/`isInTallGrass` names returning reed, junco and marram-colony cover + `coverAt`/`cutCover`, IP-09 vegetation (rust stealth band removed) | W1 fix round. W2: W-01 ground-mesh LOD, Holds terraces (W-13), barranco reeds, dragon tree. W3/W4: per the items |
| **character-art** | running → next fix round | C-01, C-02, C-03, C-04 chunk, C-05 mesh, C-06 arm skin; C-07 by grant | W1 exit (fix round 2); C-07 in W2 under §4.6 rule 2 |
| **hero-body** | running → next fix round | P-01, P-02, P-03 (stand-in; boom += 0.75 + 0.15 × min(H − 2.6, 4)), P-05 `fovPunch`/shake, P-08 dodge events, C-05 chain (7 links, colliders, wind), **R63(c) narrowing withdrawn**, F-4 `inTallGrass` rule (≤ 10 lines inside G-camera) | W1 fix round |
| **armory** | running → next fix round | C-06 Starter re-cut (+ R64(a)'s art pass on the sleeveless top), C-04 `clothShader` include, C-08 weapons, P-07 glint and ribbons, C-09 rungs 1–4 at their W1 state | W1 fix round 2. W3: C-09 rungs 4–8 at fidelity (the acquisition column), C-10, U-12 CHARACTER page (grant), F-2 element heads, F-3 kite roll in the stow kit |
| **melee** | running → next fix round | P-04 tangent + heavy multiplier + `flashPart` calls, P-05 lance hit-stop and kick | W1 fix round; W2 heavy smear |
| **settlements** | running (NPC half) → next fix round | C-01/C-03/C-04 NPC parity now; C-11 | now: NPC shading. W2: W-12 Saltrow look, F-1 brazier kit + placement. W4: Leveler (C-11) |
| **shell-ui** | running → next fix round | U-02 declutter, U-17 staging words (`hud.stageNote` under `?shot=1`), U-01 tokens (+ `reference/r5/shell-ui/glass-tokens.png`) and U-06 glass HUD started | W1 fix round 2: U-02, U-17, U-01, U-06 start. W2: U-03…U-11, U-15 icons, U-16 dialogue, U-19, P-10, F-1 dialog, F-2 page, F-4 compass-pip fill and tip (no glyph over Instruments), U-08 title, the CALIMA_DISC refit (L-01), the Dust-sight outline dropped (C-09) |
| combat-kit | W2 | P-04 palette/bursts/impact light, P-05 arrows, P-06, P-07 element colours, P-08 (`src/combat/fx/**`), I-06 aimed cue, U-14 Kit Rack (protractor), F-2 recipes + quick-make; the aimed `combat.whistle(at)` throw retired with Thrown whistle (C-09) | W2 |
| instruments-b | W2 | I-01 (Sickle, Screed, Gauge), I-02 Screed 3.8 m (Q3), I-04, I-05, I-07 | W2 |
| progression | W3 | U-13 net, F-1 save on rest, IP-12, F-4 dialogue line, quest words, the A-first-hour golden-clock clause (L-11) | W3 |
| instruments-c | W3 | I-01 (Kiln firebox, Spindle hub), I-02 Kiln 5.5 m (Q3), I-04, I-05 | W3 |
| audio | W3 | brazier crackle, kite cloth, reed rustle with wind | W3 |
| **traversal** (new) | W3–W4 (port 5250, judge 5280) | F-3 Survey Kite under G-kite (+ the `sentry`/`spotter` `perception.detectMul` ×2 filter), P-11 vista idle + kite camera | W3 in audio's slot after audio exits; W4 in brand's slot until brand's scrub (ridge-lift tuning on the Flank and Caldera) |
| instruments-d | W4 | I-01/I-03/I-05 for the Transit and Dredge, I-07 | W4 |
| brand | W4 | IP-01 final scrub, A-logo-metrics, A-keyart-sun | W4 |
| orchestrator | standing | IP-04 lint and scan clauses under grants (brand, pipeline and gates-perf are idle), IP-05/06 judge template, the CDP wrapper (U-04), L-18 then L-16 inside each exit's global run | now |

**Slots (rule 8, R53).** Six agents at most, and one gate Chrome. W2 would otherwise run 8 lanes, W3 7 and W4 7 (with
traversal). look-post ends at its W1-exit merge before world-sky starts W2 work. traversal takes audio's W3 slot after
audio exits, then brand's W4 slot until brand's scrub. L-18 then L-16 run inside the W1-exit global run. L-16 A/Bs
only items estimated ≥ 0.10 ms; the rest are timed as one group. Recommended order for the next free W1 slots:
**world-sky → look-post → world-props → instruments-a**. world-sky and look-post carry the largest share of the look,
and world-ground's W-01 already runs. Visual rows of the UI restyle are graded on frames from after the world look
pass (R66 e).

### 5.3 New §1.2 grant rows (ready to paste)

| lane | wave | file | allowance |
|---|---|---|---|
| look-post (**G-post**) | W1 exit, ending at its W1-exit merge (W3 re-open for L-13 only) | `src/core/engine.js` | post chain only: tone map (AgX + look), grade pass and LUT slots, AO tint, `tShaft` fold, DOF fold, bloom parameters, `onAfterScene` hook, contact pass, `holdFrame(tex)`, adaptation, per-cascade layer masks CASTER_ONLY / CASCADE0_ONLY (≤ 15 lines in `enableCSM`), `QUALITY_TIERS.<tier>.look` rows. New `src/core/look.{js,grade.json}`, `tools/look/**`. Must stay green: A-gpu-tier, A-rt-ledger, A22, A108, A109, V20, V33b, V-gpu-tier-look |
| look-post | W1 exit | `src/instruments/lamps.js` (instruments-core's; lane done) | ≤ 25 lines: `OutputInverse` calls `engine.look.invert` in place of its ACES branch. A-lamp-states, A-lamp-canon-distance and A-weak40 pass at unchanged bars |
| look-post | W1 exit | `src/hero/sheets.js` (armory's) | ≤ 10 lines: `screenPixels` calls `engine.look.evaluate` in place of its ACES branch. A-brea-contrast and the one-glance sheets pass at unchanged bars |
| world-sky (**G-post**, W2 holder) | W2 | `src/core/engine.js` | G-post's allowance for look-post's W2 items only: `onAfterScene` hook + L-08 fold, L-12 AO tint and contact, the L-14 dusk grade set, L-17 DOF fold, U-03 `holdFrame` if not done. Same must-stay-green rows |
| character-art | W1 exit–W2 | `src/hero/**` (armory's) | new `skinLook.js`, `heroShadow.js`; ≤ 10 lines in `src/hero/index.js` |
| instruments-a | W1 | `src/instruments/lib/**`, `src/instruments/{lamps,registry}.js`, `src/entities/machines/machine.js` (instruments-core's; lane done) | the shared core-glow chunk; `lamp.telegraph(t)` ≤ 30 lines; registry `height` ≤ 6 lines; `flashPart(part, k)` ≤ 12 lines |
| instruments-a | W1 | `src/entities/machines/rig/lod.js` (frozen) | ≤ 20 lines: LOD1 caster-only (I-04); A45–A48 and A-sil40 unchanged |
| hero-body (**G-camera**) | W1 | `src/entities/player.js` | ≤ 160 lines: P-01/02/03 camera, `fovPunch`, trauma shake, dodge events, the F-4 `inTallGrass` rule (≤ 10 of them). Guarded by A31b/d/e/f, A32b and V22 |
| traversal (**G-kite**) | W3–W4 | `src/entities/player.js`, `src/entities/playerAnimator.js`, `src/core/input.js` | ≤ 90 / ≤ 40 / ≤ 4 lines: the `kite` airborne state, a hang-pose layer from kept UAL clips, reuse of the jump action; P-11 camera lines. `A-kite-inert` must pass: with the kite never opened, the movement suite is unchanged |
| combat-kit | W2 | `src/combat/particles.js` (frozen UI engine) | ≤ 60 lines: flame and ember pools |
| world-sky | W2 | `src/world/environment.js` | extension of its W1 row through W2 (R66 i) |
| world-props | W1 | `tools/build/landmarks/gen-sounding-ring.mjs` (pipeline's area; lane closed) | move into `tools/build/landmarks/recipes/**` (W-05) |
| orchestrator | W2 | `tools/gates.mjs` | ≤ 30 lines: CDP trace wrapper (viz, gpu, cc) |
| orchestrator | W1 now | `tools/lint/**` (brand's), `tools/licences/**` (pipeline's), `tools/r5-refs/licence.mjs` (gates-perf's) | IP-04 additions only (lexicon terms, A-ui-words alternatives, direction hashes and panel dHashes, refused-source pattern) |

No grant on `ai/perception.js` or `ai/search.js`: F-4 keeps the frozen terrain names, and F-3's ×2 range is a
traversal-owned `perception.detectMul` filter on the published hook.

**§2 path additions (ready to paste).** combat-kit: `src/combat/fx/**`. world-sky: `tools/build/recipes/sky/**` and
`public/textures/sky/**`. New rows: look-post and traversal (R66 i).

---

## 6. Proposed ruling (final R66; replaces the interim text in §8.3)

- **R66 — Kevin's Nov 6 look target (final; the spec is `docs/ROUND5-LOOK.md`).** Kevin, Nov 6: "the game needs to
  look a lot better and new. check image 1 for inspiration. also check image 2", followed by an armour board ("armor:"),
  gameplay stills, and three decisions: dark-glass UI, all eight armour sets, and four new features.

  **(a) References.** The five references live **outside** this public repo, at `/Users/kevinliu/.calima-r5/direction/`:
  - `kevin-nov6-keyart.jpg` (image 1, sha256 860d7e9f…), with `kevin-nov6-keyart.webp` (aa1c880d…) beside it;
  - `kevin-nov6-board.jpg` (image 2, f2694e04…), with `kevin-nov6-board.webp` (b5c48125…) beside it;
  - `kevin-nov6-board2.md` (image 3);
  - `kevin-nov6-armor.md` (image 4);
  - `kevin-nov6-stills.md` (image 5).

  Images 3–5 are described in words; until Kevin saves them as images, their panel clauses are written criteria, not
  likeness. None of the files is ever committed, stored in LFS, release assets, gists, PRs, issues or artifacts. Panel
  statistics (L\*a\*b\*, ≤ 8 swatches per panel) may be stored as numbers in refs.json. No pixels may go to generative,
  tracing, image-to-3D or style-transfer tools. Docs cite them as `ext:<file>@<sha8>#<panel>` (ROUND5-LOOK §0.2) and
  never embed pixels. Crops live only in a session scratchpad.

  **(b) Judging.** From now on every lane reads all five before building or fixing. The stills weigh most for light,
  camera framing, combat readability and HUD. **R54's "incredible" bar is graded against the cited panels.** A frame
  that passes its words but looks cheap beside its panel is a major finding. The judge sees the Nov 6 WIP frame of the
  same staging, the new frame and the panel. FAIL unless the judge, shown the two frames unlabelled, picks the new one
  as closer to the panel on light, haze, palette, composition, density and material.
  - Every V-row that cites a panel also names ≥ 1 licence-clean stored reference under `reference/r5/**` and carries the **IP-clause**, which outranks every likeness clause.
  - Panels are gradeable for: light, haze, colour temperature, camera height, FOV and placement, density, skin and cloth response, and HUD placement and legibility.
  - Panels are **never** a target for: creature or machine bodies, eyes or cores, text, names, logos, icon glyphs, chrome geometry, or glows.

  **(c) IP translation.**
  - Nothing from Horizon, Sony, Guerrilla, Epic or Fortnite: no names, logos, taglines, machine designs, silhouettes or UI trade dress.
  - The images' "A Horizon Zero Dawn spinoff" and "a new chapter in the Horizon" never appear anywhere.
  - Their words translate as ROUND5-LOOK §8: Watchers → Sonde, Corruption/blight → the Datum Line, Shock Arrow → Dust-Puff, Specter → VEIL, Camp/campfire → Brazier, Obsidian Spire → the Roques, Ember → Cinder, Varl/Vazi/Vavi and "Lessons of the Valley" → canon quests (PENDING under R61 b and R65).
  - Instruments keep bible §7: no heads, jaws, tails or eyes; no red eye or glowing heart.
  - Lamp tokens (calm 24.7, wary 27.8, hostile 26.6), UI selection/focus/glow tokens and armour emissives are ≥ 20 ΔE2000 from the five (#ff2413, #38c6ff, #ffb31f, #19ffd0, #9B6BFF). Named exemptions: the bible element colours; survey vermilion as flat ink only, never emissive; the spark on the logo and calima sun only; fire tagged `ipExempt:'fire'`. A-ip-emissive's ≤ 0.5 % area cap guards the rest.
  - Violet is a dye and a glass tint, never a glow wash.
  - No live lava (pending Q5).
  - No large walker against a low sun in title, menu, loading or marketing frames.
  - The wordmark stays the §9.8 lockup; its one tagline is THE ISLAND REMEMBERS in the R66(p) treatment, and no other.
  - The image model's provenance makes the images class "refused" for references, and any asset whose provenance names an image generator is listed for Kevin.

  **(d) The wrap tail.** R63(c)'s narrowing is **withdrawn**, not only suspended.
  - The tail is 0.53–0.62 m long, 0.09 m wide at the root, 0.06 m before a 2.5 cm frayed fringe, two-ply with rolled hems, ≤ 900 tris, on 7 links (`dyn_wrapSash_01..07`) driven by `environment.windAt`, with colliders on the stowed lance and bow.
  - hero-body does not shorten it to 0.49 m. character-art builds the cloth.
  - `A-tail-flow` replaces the size clause of R63(c), and `A-tail-legible`, `A-wrap-clear` and `A-stow-clearance` stand.
  - Bible §3.5's row becomes these numbers.

  **(e) UI (Kevin's decision 1).**
  - Every menu, including pause, is **dark violet glass** (`--cal-glass` #1E1A28 at 0.90; 0.70 in the HUD). The title is key art: its station column sits on U-08's left glass scrim (rgba(14,12,18,0.50) to 0 at 0.48 W), not a 0.90 panel. The field HUD is thin and minimal: theodolite compass strip, small tool icons, levelling-staff health, field note, weapon and ammo.
  - Options A and C are closed. shell-ui keeps its W1 logic and redoes its skin.
  - Bible §9.7's paper surfaces and §9.1's "violet never in the UI" are amended. The limits that keep the glass from reading as Horizon's: right angles with registration ticks; no notches, cut corners, hexagons, holograms, teal or Focus-violet glows; no `backdrop-filter` in play; a Kit Rack in real time (a half-ring at the right edge); one currency; no level or XP readout.
  - V10, V37, V36, V-map, V-ui-* and A-ui-language-static take the new criteria of ROUND5-LOOK §7. The levelling staff, theodolite strip, stadia hairs and graduated tick stay.
  - The UI restyle's visual rows are graded on frames from after the world look pass.

  **(f) Armour (Kevin's decision 2).**
  - The bible's 4 × 3 becomes **eight rungs**: Starter, Scout, Reckoner, VEIL (the board's "Specter", renamed because "Specter" is a Horizon enemy; Q4), Pioneer, Vanguard, Arcane, Celestial. The ROUND5-LOOK §3.3 C-09 table maps them onto the bible sets and perks.
  - The four outfits armory has built fill rungs 1–4 (Pan I → Starter, Pan II → Scout, Pan III → Reckoner, Ash I → VEIL). Each rung is one bible variant with its own perk: VEIL is Pit Wraps (Ash I, Ash-step) re-cut with hood, veil and goggles; Ash II (Calima Veil) leaves the ladder.
  - Arcane is the instrument-maker's craft (vernier-engraved oxblood plate, "Read the old marks"). Celestial is the surveyor's star-fix (the Datum Plate, an ephemeris engraving, "Fix by the stars"). Its calm lampglass is the only armour emissive. There are no runes and no crystal glow.
  - Each rung: 1 merged draw, ≤ 3 added pieces. Rungs built from the same bible set share its atlas (pan, ash, glaze; 1024² + 512², ≤ 0.8 MB) plus ≤ 0.15 MB of extras each; only the worn set's atlas is resident. Plan §4.5's armour row stays ≈ 4.0 MB.
  - The ladder index rises with acquisition. Bible §4.6 is amended: Vanguard is crafted at Oro after "The Scar"; the other rungs keep their bible routes.
  - **The Starter is sleeveless** (bible §3.9 amended), with a cap shift inside Brea's 40 k: body ≤ 11.5 k, outfit ≤ 16.0 k (the sleeves' ≈ 2.5 k pays for the harness), stow ≤ 9.0 k, held ≤ 3.0 k; sum 39.5 k; ≤ 5 main draws and ≤ 2 casters. R64(a)'s smock art pass (weave, seams, folds, armhole binding) transfers to the sleeveless top at the same bar.
  - Fog Felts leave the ladder as ✂ (Q4). Retired: Dust-sight, Sure-foot, Fog-mend, Thrown whistle. The base whistle stays. shell-ui drops the Dust-sight outline.
  - The plan's §2 armory row and §3.1 W3 exit read "8 rungs" in place of "12 variants".
  - Brea stays 31 and a Pan Houses Reckoner.

  **(g) New features (Kevin's decision 3), each in CALIMA's form:**
  - the **Brazier** (rest chooses the light and saves; never a travel node; "camp" and "campfire" banned);
  - the **Making ledger** (MAKE in the hub, quick-make in the Kit Rack at timeScale 1.0; bible §5.2 ammo names);
  - the **Survey Kite** (a cane-and-sailcloth box kite flown on the trade wind; ridge lift; grounded by calima; seen by Sondes);
  - **Reed cover** (carrizo and salt rush hide her while the wind moves them, and today's marram colonies stay cover; the golden meadow never does; Pegs cut lanes). The frozen `tallGrassDensity` / `isInTallGrass` names stay (A-terrain-api), and hero-body sets `inTallGrass = cover > 0.45 && (moveSpeed < 0.2 || windAt ≥ 4)`.

  Bible §8.7 now reads "no mounts, grapples, swimming or pole-vault this round; the survey kite (R66 g)", and §11.1's stealth and traversal rows are amended to match. The kept movement stack is touched only through **G-kite** (traversal lane, W3–W4) and **G-camera** (hero-body, W1, ≤ 160 lines), each with its line budget and `A-kite-inert` / the A31 family (A31b/d/e/f, A32b, V22) green.

  **(h) The look never spends the GPU recovery.**
  - `A-gpu-attrib` (L-18) runs inside the W1-exit global run (R45), before any positive-cost look item is enabled on `high`. It first names the build it times.
  - Recovery wins (W-01, I-04, L-10, L-15, deleting the post-SMAA shaft pass) are booked to A21, never to the look ledger (`A-look-ledger`). A positive-cost look item is enabled on `high` at an exit only when A21's quiet-box median with the item on meets that exit's bar, and the median `renderScale` in shipped (non-`?shot`) mode is ≥ 0.95 on each A21 scenario. Bars: W1 exit vista ≤ 17.0, herd ≤ 20.0, fight ≤ 17.0 ms; from the W2 exit 14.0 ms on all three, and A-gpu-tier-pans ≤ 13.0. An item that misses stays off on `high` and its V-row reads FAIL-deferred. `ultra` is never a graded tier. The interim W1 bars are a proposal; Q2 still decides the fallback.
  - ≤ 0.45 ms per ledger row on A21 frames. W-06 is three rows (R0 + backlight, R1, R2/R3). Bursts (P-04, P-06) and the close-up DOF are outside A21 and capped by their own rows.
  - At the switch to AgX (L-01) and the sky IBL (L-04), every colour-measured row (the lamp ΔE rows, A-lamp-canon-distance, A-sighting-hue, A-hour-keys) is **re-measured once with its bar unchanged**, and every affected visual row is re-judged in the same wave. A row that fails on re-measure is a finding for look-post, not a rebaseline. look-post ports the ACES copies in `src/instruments/lamps.js` and `src/hero/sheets.js` to `engine.look` by grant at the W1 exit; shell-ui refits `CALIMA_DISC` in W2.

  **(i) Lanes.**
  - A new lane **look-post** (port 5251, judge 5281; from the first free W1 slot to its W1-exit merge, before world-sky starts W2 work) owns the post chain under G-post, inherits engine-gpu's must-stay-green rows, and closes R48(c). Its W2 items pass with G-post to world-sky.
  - **world-sky stays active through W2.**
  - A new lane **traversal** (port 5250, judge 5280; W3–W4) builds the kite. It takes audio's W3 slot after audio exits, then brand's W4 slot until brand's scrub.
  - Ports: look-post reuses engine-gpu's 5251 and traversal reuses pipeline's 5250. Both earlier owners have exited, and this line is the explicit exception to the plan's §2 rule that ports are never shared.
  - L-18 then L-16 run inside the W1-exit global run. L-16 A/Bs only items estimated ≥ 0.10 ms; the rest are timed as one group.
  - Not-started lanes (world-sky, world-props, instruments-a) take their ROUND5-LOOK §5.2 items in their day-1 briefs; running lanes take theirs at their next fix round.

  **(j) The light.**
  - The sun's bearing is corrected so noon stands in the south (28° N).
  - Pending Q1, world-sky ships the golden-weighted clock behind `env.clock` (default `golden`). New Game starts at 07:00. 17:45 is only for the title, a Continue with no saved hour, and the look places. The golden-weighted clock keeps the 0:55 beat at 12:00 ± 0:30 (an A-first-hour clause).
  - V-sky-trade's "not golden-hour drama" is graded at trade noon only.
  - Crepuscular shafts are allowed **only** at occluder and cloud gaps (A-look-shafts' spoke test); radial spokes stay banned (bible §9.4).

  **(k) Bible amendments** (applied by the orchestrator):
  - §2.4: the ROUND5-LOOK L-03 keys, with violet-rose shadows and a 18:45 zenith of #555079; the 05:30 key and the hand-over troughs at 05:24 and 19:54 (sunI ≤ 0.15) stay.
  - §3.5: the tail (d). §3.9: the Starter (f). §4: the ladder (f); §4.6: Vanguard is crafted at Oro after "The Scar".
  - §8.3 flora: cerrillo, viborina, tamarisk groves in the Pans, bougainvillea in villages, carrizo and junco.
  - §8.7 and §11.1 (g).
  - §9.1: the flora carries gold and violet while the ground stays black and white; glass tokens added.
  - §9.4 (j). §9.7 (e).
  - §7.4's heights and §9.8's title light wait for Q3 and Q1.

  **(l) Hit-stop** is a capped freeze, not time dilation: ≤ 120 ms per hit and ≤ 180 ms in any 1 s (`A-play-hitweight`). R32 stands for Steady, aiming and the Kit Rack.

  **(m) World scope.**
  - The Sounding Ring stands 15–25° off vertical at 34 m on a 5–6 m rise (`sites.js` height 0.5 → 6, world-ground's file; `A-landmark-bearing` re-run). world-props moves `tools/build/landmarks/gen-sounding-ring.mjs` (pipeline's area; lane closed) into its `recipes/**` by grant.
  - Six offshore stacks and a sea arch beyond `PLAY_RADIUS` + 20 m are new W1 scope for world-props.
  - One 55–60 m Roque plug moves from W4 to W1.
  - The Round-4 far ridge rings go; the sister isles stay carried inside the sky dome and the far plane (ISLE_CARRY 0.8).

  **(n) Storage.** The references are never committed anywhere.

  **(o) Ninewalls stays walled.** Image 2's NINEWALLS-as-a-tree is the image model's error; Ninewalls stays the walled settlement of the bible. The tree informs only the dragon tree's silhouette (W-10).

  **(p) The tagline (Kevin, Nov 6).** "THE ISLAND REMEMBERS" appears in the game, under the wordmark, in a lockup that is not Horizon's. It is set in IBM Plex Mono 500 caps with tracking ≤ 0.08 em, at 0.30× the wordmark's cap height, under the §9.8 datum rule. It is left-aligned flush with the C of CALIMA, with no rule on either side, no star and nothing centred. `V-logo`'s "any second line of text, tagline" FAIL clause is amended to allow exactly this line in exactly this treatment. The name lint allows the phrase only in the title lockup's string, and "REMEMBERS" is excepted from the "Ember" substring hit there. brand owns it at W4, and shell-ui places it in W2 (U-08).

  **(q) Kevin's answers to §9.1 (Nov 6) are binding:**
  - golden-weighted light (Q1);
  - a 16.7 ms fallback bar (Q2);
  - Screed 3.8 m and Kiln 5.5 m (Q3);
  - VEIL at rung 4, with Fog Felts and Calima Veil off the ladder (Q4);
  - a cold Malpaís (Q5);
  - no minimap (Q6);
  - the tagline kept, per (p) (Q7);
  - PD/CC0 reference fetches allowed (Q8).

  The bible amendments these imply land with this ruling: §9.8 title light, §7.4 heights, the §4 ladder and retired perks, and the §9.8 lockup's tagline.

---

## 7. New gate rows (ready to paste into §9)

**IP-clause** (every V-row below that cites a panel ends with it; the judge prompt template carries the verbatim
sentence): *"FAIL if the frame shows any element of the image IP list (ROUND5-LOOK §8); this clause outranks every
likeness clause."*

**Shared look staging.** Rows marked "look staging" run with `?shot=1` at 1600×900, DPR 1.25, tier high, in trade
weather unless named. They use `gatePlaces.look.*`, are measured with `tools/look/look-stats.mjs` on canvas-only PNGs,
and name no coordinate, species or bone literal.

### look-post (W1 exit; its W2 rows pass with G-post to world-sky, §5.1)

- **A-look-suite** (action) — pass:
  - (a) all `gatePlaces.look.*` shots stage with 0 console errors and give an identical PNG SHA-256 on 2 consecutive runs; under `?shot=1` the sky IBL and the reflection probe bake all faces and the PMREM synchronously before settling (round-robin bakes otherwise make the hash differ);
  - (b) look-stats reproduces a fixture PNG's stored stats within ±0.3 per number, and a synthetic 6-patch image within ±0.5 L\*a\*b\* and ±0.5 % per mask;
  - (c) `tools/look/refs.json` ≤ 20 KB with 0 bytes of image data;
  - (d) the depth render puts planted boxes at 30/120/400/900 m into the right bins;
  - (e) HUD and banner pixels = 0;
  - (f) no repo file matches a reference image's SHA-256.
- **A-look-tonemap** (action) — a 4×4 HalfFloat input through the live grade pass at grade mix 0 → pass:
  - (a) 0.18 → L\* 50 ± 1.5, 0.02 → 6–12, 1.6 → 85–91;
  - (b) GPU equals `engine.look.evaluate()` within 1/255, and `engine.look.invert()` round-trips within 1/255 (L-01);
  - (c) hue skew at 0.3× against the source: #FFB070×4 ≤ 14°, #F08A5A×3 ≤ 12°, #FF2D8C×6 ≤ 14°, Orchil #6B3F73×4 ≤ 10° (Brea's violet is what has to survive AgX);
  - (d) a 64-step grey ramp from 0.001 to 32 is strictly increasing in L\*;
  - (e) the lamp ΔE rows and A-sighting-hue pass at their bars, re-measured (R66 h);
  - (f) A-lamp-states, A-lamp-canon-distance, A-weak40 and A-brea-contrast pass at unchanged bars in look-post's block.
- **V-look-highlights** (visual) — `look.vista` against `ext:kevin-nov6-keyart.jpg@860d7e9f#1-MR` and `reference/r5/gates-perf/golden-clouds.jpg`. Pass: the sun glow and sea glints read cream or peach-white, not lemon; no hue banding round the sun. IP-clause.
- **A-look-frame-stats** (action, look staging) — pass:
  - `look.field` (1-TR): lo20 hue 35–58, lo20 L\* 20–30; hi10 hue 62–80, chroma ≤ 18; mid b\* 8–18; chroma 22–29; p95−p5 ≥ 62; p99 ≥ 88; clip 0.2–3 %.
  - `look.vista` (1-MR): lo20 a\* ≥ 8, b\* ≤ 10; mid a\* 12–22, b\* 5–15; chroma 18–27; p95−p5 ≥ 60; p99 ≥ 90; clip 1–5 %; crush ≤ 1.5 %; top-20 % band mean ≥ 1.8× bottom-20 %, top-band std ≤ 12.
  - `look.aim` (1-BL): lo20 a\* ≥ 8, b\* ≤ 8; hi10 hue 55–75, chroma ≤ 16; mid b\* ≤ 14; chroma 16–25; p95−p5 ≥ 66; p99 ≥ 90; clip 0.5–4 %.
  - `look.close` (1-MC): lo20 a\* ≥ 10, b\* ≤ 6, L\* 9–16; hi10 hue 40–65; mid a\* ≥ 20, b\* ≤ 8; crush ≤ 3 %.
  - `look.dusk` (2-MR): mid b\* ≤ −4, a\* 5–15; lo20 hue in 320–20; chroma 12–20.
  - Every LUT texel equals the `look.js` evaluation within 1/255.
- **A-look-random** (action, look staging) — 12 seeded random Pans poses (hours 16:30–19:45, 20–200 m from any gate place) → pass: ≥ 9 of the 12 meet the `look.field` bars of A-look-frame-stats.
- **V-look-random** (visual) — the same 12 frames, graded for R54 (R66 b) against `#1-TR` and `#1-MR`, and `reference/r5/gates-perf/long-shadows.jpg` and `reference/r5/gates-perf/ridge-skyline.jpg`. IP-clause.
- **V-look-grade** (visual) — `look.field`, `look.aim` against `#1-TR`, `#1-BL` and `reference/r5/gates-perf/long-shadows.jpg`. Pass:
  1. rock and cloth shadows read violet-rose, not olive or brown;
  2. sunlit grass reads amber-gold, not mustard;
  3. Brea's violet is the most saturated hue;
  4. no crushed black outside the vignette.
  IP-clause.
- **A-look-bloom** (action) — pass:
  - (a) on a noon Pans salt patch (L\* 85–92) the folded bloom ≤ 0.02 linear;
  - (b) `look.vista`: +≥ 6 L\* at 6 sun radii, the profile monotonic to 30 radii;
  - (c) a hostile lamp (#FF2D8C, ×2.5) at 40 m: halo radius ≥ 2.5× the core, hue within 15°;
  - (d) bloom energy ≤ 8 % in `look.vista`, ≤ 3 % in `look.field`.
- **V-look-glow** (visual) — against `#1-BL` and `reference/r5/gates-perf/spark-burst.jpg`. Pass: the lamp or arrow tip has a soft halo; sunlit cloth and rock do not glow. IP-clause.
- **A-look-contact** (action) — pass:
  - Brea on salt at noon: a 10 cm band round her boots ≤ 0.6× the open salt 1 m away;
  - pixels with AO < 0.7 shift ≥ 3 in (a\*, b\*) toward violet against the untinted build;
  - A108 and A109 pass;
  - contact ≤ 0.15 ms on high (A/B).
- **V-look-contact** (visual) — against `#1-TL` and `reference/r5/gates-perf/wall-contact.jpg`. Pass: grounded feet with soft dark contact; creases under the wrap and harness read violet-brown, not grey. IP-clause.
- **A-look-exposure** (action) — pass:
  - median L\*: field 46–56, vista 47–57, aim 40–50, close 28–38, dusk 26–36;
  - A-biome-grade ≤ 0.05 EV per frame with adaptation running;
  - under `?shot=1` the applied exposure equals the key;
  - salt → lava-tube mouth stays within ±0.5 EV of the key.
- **A-look-dof** (action) — pass:
  - 0 ms and 0 draws in every A21 scenario and in `look.field`;
  - aim (A-play-aim-frame staging with a landmark ≥ 120 m behind): Laplacian variance in the target box ≥ 0.85× DOF-off, in the far landmark ≤ 0.45×, on Brea ≥ 0.90×; a 6 px band outside her silhouette mean |ΔL| ≤ 3 %;
  - `look.close`: background tile L\* std (16 px, beyond 2 m) ≤ 50 % of the face tiles;
  - ≤ 0.45 ms aiming and ≤ 0.8 ms in close-up; the low and medium tiers make 0 DOF draws.
- **V-look-dof** (visual) — against `#1-MC`, `#1-BL` and `reference/r5/gates-perf/portrait-bokeh.jpg`. Pass: a soft background, a crisp wrap edge and target, no halo seam. IP-clause.
- **A-look-ledger** (action, quiet box, R45/R53; inside each exit's global run, after A-gpu-attrib) — pass:
  - A/B medians for every item estimated ≥ 0.10 ms, and one group median for the rest, recorded in ROUND5-LOOK §4.3;
  - recovery wins (W-01, I-04, L-10, L-15, deleting the post-SMAA shaft pass) appear only as A21 rows (§4.2), never as ledger offsets;
  - every positive-cost item enabled on `high`: A21's quiet-box median with it on meets that exit's bar (W1 exit vista ≤ 17.0, herd ≤ 20.0, fight ≤ 17.0 ms; from the W2 exit 14.0 ms on all three, and A-gpu-tier-pans ≤ 13.0), and the median `renderScale` in shipped (non-`?shot`) mode is ≥ 0.95 on each A21 scenario; on `low`, the same bars hold with low's items on;
  - every ledger row ≤ 0.45 ms on A21 frames (W-06 as three rows: R0 + backlight, R1, R2/R3); bursts (P-04, P-06) and the close-up DOF are graded by their own rows;
  - every item enabled on high has a ledger row (R66 h); an item that misses is off on `high` and its V-row reads FAIL-deferred; `ultra` is never graded;
  - draws ≤ 350, 0 look draws outside post apart from those ledgered;
  - A-rt-ledger ≤ 170 MB and A-vram-ledger ≤ 450 MB with the look on.
- **A-gpu-attrib** (action, quiet box; inside the W1-exit global run, before A-look-ledger) — pass:
  - the run records the build it times (git SHA and tree), so the herd's 33.9 ms (Nov 6) and 20.10 ms (world-ground's tree) are reconciled before anything is attributed;
  - vista, herd and staged fight each produce a per-pass table (shadow cascades, opaque, additive, GTAO, bloom, SMAA, shafts, grade, overlay) whose rows sum to the frame median within 10 %;
  - per-owner rows are hide-one marginals plus an interaction residual, with no sum rule (timer queries cannot attribute by owner inside a render pass on Apple GPUs);
  - every row ≥ 0.5 ms names a fix owner in ROUND5-LOOK §4.2;
  - re-run at every wave exit.

### world-sky (W1, W2 extension, W4)

- **A-hour-keys** (re-keyed) — pass: zenith, horizon and fog at the amended bible §2.4 hours (L-03 table) within ΔE 5, on the pre-grade uniforms; the 05:30 key is present, and the hand-over troughs at 05:24 and 19:54 keep sunI ≤ 0.15.
- **A-look-keyfill** (action) — `look.field` with a salt patch (#EDEAE2) shadowed by a 2 m pole the gate spawns → pass:
  - (a) lit:shadow scene-linear luminance 3.5–6.0:1 at 16:30 and 1.6–3.5:1 at 18:45;
  - (b) displayed shadow patch a\* +3…+14, b\* −10…+4; lit patch b\* ≥ +10, a\* ≥ +3;
  - (c) A55 holds at noon;
  - (d) while the clock runs, no key moves > ΔE 1.5 per frame.
- **V-look-sky** (visual) — `look.field` against `#1-TR` and `reference/r5/gates-perf/golden-clouds.jpg`. Pass: lavender-blue overhead grading to rose-peach at the horizon; no royal-blue zenith; no ochre band ringing the horizon. IP-clause.
- **A-look-ibl** (action) — pass:
  - (a) `scene.environment.name === 'CAL.skyIBL'`, and src has 0 RoomEnvironment imports;
  - (b) at 16:30 the +Y face is within 25° hue of the zenith key and ±30 % of the rendered zenith pixel's luminance; −Y within 25° of the hemi ground key;
  - (c) over 10 forced rebakes: textures unchanged, A-alloc-rate unchanged, the PMREM frame ≤ median + 0.35 ms, each face frame ≤ median + 0.08 ms;
  - (d) A-vram-ledger shows the room PMREM gone.
- **V-look-closeup-ibl** (visual) — `look.close` against `#1-MC` and `reference/r5/hero/brea-face-sheet.png`. Pass: sky-tinted sheen on cheekbone, nose and forehead; a sky catch-light; no room-light reflections on Brea or any glaze. IP-clause.
- **A-look-aerial-layers** (action) — `look.vista`, `look.field`; non-sky pixels binned at [5–30), [30–120), [120–400), [400–1000), ≥ 1000 m → pass:
  - (a) from 30 m on, mean L\* rises ≥ 3 per bin;
  - (b) L\* std falls ≥ 10 % per bin;
  - (c) far bin b\* ≤ +18 and within ΔE 12 of the graded fogH;
  - (d) over 400 m, T at 2 m ≤ 0.70× T at 60 m at 07:00 and 19:00, ≤ 0.90× at 12:00;
  - (e) A57-aerial holds.
- **A-look-golden-air** (action) — `look.pansInland`, `look.title`, `look.pansSunset` at 18:45 → pass:
  - fog toward the sun L\* ≥ 70 with b\* ≥ +25;
  - far band away from the sun a\* ≥ +5, b\* ≤ +4;
  - shadow pixels (L\* < 30) mean a\* ≥ +5 and b\* ≤ +12;
  - violet share (a\* > 5, b\* < 0) ≥ 12 %;
  - a mist band ≥ 10 % of `look.title` at ≥ the terrain behind + 8 L\*;
  - cost ≤ +0.35 ms.
- **V-look-depth** (visual) — `look.vista` against `#1-MR`, `#1-TL` and `reference/r5/gates-perf/ridge-skyline.jpg`. Pass: ≥ 4 receding layers, each paler and rosier; mist in the low ground with ridge tops clear; nothing beyond 400 m reads ochre. IP-clause.
- **A-look-sun** (action) — `look.vista`, sun 5.8° up in frame → pass:
  - (a) the L\* ≥ 97 region has an equivalent radius of 6–11 px;
  - (b) its chroma ≤ 12;
  - (c) L\* ≥ 80 at 4–8 disc radii, and ≥ sky median + 6 at 20–30;
  - (d) cloud cover ≥ 0.8 over the sun → disc max L\* ≤ 85;
  - (e) frame clip ≤ 5 %.
- **V-look-sun** (visual) — against `#1-MR` and `reference/r5/brand/calima-dawn-maspalomas.jpg`. Pass: a soft cream disc with a wide warm halo; no ghosts; salmon-to-lavender without banding. IP-clause.
- **A-look-shafts** (action, W2) — `look.vista` variant with the Ring between camera and the 18:45 sun → pass:
  - (a) angular modulation on the 0.12–0.30 frame-height annulus (180 bins, peak-to-trough over mean) ≥ 6 % with occluders and ≤ 2 % on an open sea sky;
  - (b) ≥ 70 % of shaft energy within 3° of an occluder or cloud gap;
  - (c) `tShaft` bound in the grade; `environment.js` makes 0 `onAfterRender` draws;
  - (d) sun behind the camera → `tShaft` max ≤ 0.001;
  - (e) calima:trade energy 1.5–2.2;
  - (f) V-sky-trade's no-spokes clause passes.
- **V-look-rays** (visual) — against `#1-TL` and `reference/r5/gates-perf/golden-clouds.jpg`. Pass: soft shafts through spire, Ring and cloud gaps fading from the sun; no hard wedges; no rays from an unoccluded sun. IP-clause.
- **A-look-clouds** (action, W2) — `look.field` at 16:30 and `look.vista` → pass:
  - (a) band cloud 12–30 % of the visible sky with ≥ 3 towers of height ≥ 1.5× base;
  - (b) lit-side minus shadow-side L\* ≥ 20 per tower;
  - (c) each tower's lowest 10 % within ΔE 15 of the horizon beside it;
  - (d) 0 extra draws and 0 transparent planes;
  - (e) A-cloud-sea and V-sky-trade pass.
- **V-look-cumulus** (visual; a yaw pair, since the seam clause cannot be read from one frame) — against `#1-TL`, `ext:kevin-nov6-board.jpg@f2694e04#2-TL` and `reference/r5/gates-perf/golden-clouds.jpg`. Pass: towering flat-bottomed cumulus with peach tops and lavender bodies, behind the spires, with no seam at any yaw. IP-clause.
- **A-sky-last** (action) — pass:
  - (a) the sky is the last entry of `renderLists.get(scene, 0).opaque`;
  - (b) `look.field` before and after: ≥ 99.9 % of pixels within 1/255 (the sky-last part); sky mean ΔE ≤ 3 (the baked noise); the sky material writes z = w with LEQUAL, so the sister isles beyond the 1,900 m dome stay drawn;
  - (c) interleaved A/B at the A21 vista and herd books two rows separately, as A21 recovery (§4.2): the baked noise (est. −0.2…−0.6 ms) and the draw order (est. ≈ 0); the noise row's median is a saving;
  - (d) 0 fbm calls outside the night branch.
- **A-look-sunpath-dwell** (action) — pass:
  - (a) bearing 180 ± 5 at 12:45 and 168 ± 5 at 12:00; peak elevation 50 ± 1; sunrise 65–75; sunset 285–295; at 12:00 a wind pump's shadow points to bearing 348 ± 8;
  - (b) with `env.clock = 'golden'`, a 24 h simulation in 1/60 s steps: ≥ 30 % of real time with the sun 2–22° up, ≤ 22 % night, the day 1800 s ± 1 %;
  - (c) the rate never changes > 10 % per frame;
  - (d) A-hour-keys, A56-cascades and every hour-pinned row pass;
  - (e) a New Game starts at 07:00; the title, a Continue with no saved hour and the look places start at 17:45; with `env.clock = 'golden'` the 0:55 beat ("calima at noon", bible §8.9) falls at 12:00 ± 0:30 (also an A-first-hour clause, progression W3).
- **A-look-calima** (action) — calima at noon at `look.field` → pass: mid a\* 15–26, b\* 18–32; top-40 % band std ≤ 8; disc within ΔE 3 of #F2A27E; lamps readable at 40 m (V-calima); `look.dusk` meets its A-look-frame-stats bars (W2).
- **V-look-calima** (visual) — against `#2-BR` (THE CALIMA card) and `reference/r5/brand/calima-dawn-maspalomas.jpg`. Pass: a flat amber-coral sky, a coral disc, soft silhouetted spires, soft shadows. IP-clause.
- **A-look-ridges** (action) — pass: at noon trade from the Saltrow gatePlace at 8 yaws, 0 ridge-material pixels at L\* > 85; ridge draws ≤ 3; ridge mean b\* ≤ +12 at 16:30.
- **V-look-horizon** (visual) — against `#1-MR` and `reference/r5/brand/salinas-de-janubio.jpg`. Pass: sea and islets in haze beyond the coast; no snow peaks. IP-clause.
- **A-look-pan-reflection** (action) — `look.pansSunset` at 18:45 and `look.pansInland` → pass:
  - for each registered silhouette mirrored on brine, the Glass or wet sand, the normalised cross-correlation of the column profile against the flipped profile is ≥ 0.6;
  - brine L\* within ±10 of the sky at the mirrored elevation;
  - probe ≤ 10 draws per face and ≤ 1 face per frame on high;
  - 0 per-frame allocations; VRAM ≤ 1.1 MB;
  - crust p95 L\* ≤ 93 with sun-side b\* ≥ +10;
  - ≥ 6 crack ridges per 10 m in the crouched frame;
  - cost ≤ +0.45 ms.
- **V-look-pans-sunset** (visual) — against `#2-BR` (The Pans card), `ext:kevin-nov6-keyart.jpg@860d7e9f#1-BR` (THE PANS) and `reference/r5/gates-perf/salt-pans.jpg`. Pass: sky colour and landmark silhouettes mirrored in pink and blue brine between white polygon crust. FAIL: matte tiles; mirrors of the wrong hour; sky without silhouettes. IP-clause.
- **A-play-motes** (action) — pass:
  - Pans at 18:45 with the sun within 25° of view centre: 50–250 blobs covering ≤ 0.6 % of the frame; the sun behind the lens gives ≤ 30 % of that;
  - calima: ≥ 150 blobs within ΔE2000 12 of #C98B4E, drifting within 30° of the projected wind;
  - Malpaís (W3 on): ≥ 40 rising embers within 60 m of an emitter, 0 on the Pans;
  - ≤ 0.08 ms; ≤ 2 draws.
- **V-play-air** (visual; a sun pair, filmed toward and away from the sun, since the clause cannot be read from one frame) — against `#1-MR` and `ext:kevin-nov6-stills.md@bf79cdc9#5-3`, and `reference/r5/gates-perf/long-shadows.jpg`. Pass: motes catch the sun only toward the light and read as haze, not snow. IP-clause.
- must stay green: global list, A108, A109, A-weather-states, A55, A56, A57, A-cloud-sea, A-biome-grade, V-calima, V31-night, V-sky-trade (its "not golden-hour drama" clause graded at trade noon only, R66 j).

### world-ground (W1–W4)

- **A-look-world-envelope** (action, quiet box; graded from the W2 exit, because W-01's ground-mesh LOD is world-ground's W2 item; recorded at the W1 exit) — frozen `look.pansInland` and `look.pansSunset` at high → pass:
  - median GPU(all) − median GPU(terrain, skirt, sea, Glass, vegetation, landmarks and kit hidden) ≤ 6.5 ms over 3 runs;
  - terrain tris drawn ≤ 300 k; whole-frame draws ≤ 120;
  - at the 160 m far-field seam |ΔL\*| ≤ 3 in 16 columns;
  - A-anti-tile, A-skirt-masked, A108 and A109 no worse than their run-j values.
- **A-look-layers** (action) — `look.pansInland`, `look.pansSunset`, `look.title` at 18:45 and `look.pansInland` at 07:00 → pass:
  - ≥ 4 non-sky bands (near < 40, mid 40–250, far 250–700, deep > 700 m), each ≥ 5 % of the frame;
  - in ≥ 50 % of columns the topmost non-sky pixel is ≥ 250 m away and ≥ 3 % of frame height above the sea horizon;
  - band mean L\* rises monotonically, each step ≥ 4, total 15–35;
  - at every band boundary |ΔL\*| ≥ 6 in ≥ 60 % of columns;
  - on the anti-sun half, far b\* ≤ near b\* − 18;
  - far-band L\* std ≥ 14.
- **V-look-layers** (visual) — against `#1-MR`, `#1-TL` and `reference/r5/gates-perf/ridge-skyline.jpg`. Pass: four stacked planes read at a glance, each farther one lighter and cooler; the far shapes read as needles, tablelands, stacks and the Ring. FAIL: a bare sea and sky seam across more than half the width; a flat fog band; one grey tone beyond 250 m; cone hills. IP-clause.
- **A-look-strata** (action) — `gatePlaces.steepFace`, `look.craterWall`, a Flank riser at 60 m → pass:
  - a 200 px vertical L\* profile through the lit face shows ≥ 5 transitions per 100 px, each |ΔL\*| ≥ 5;
  - bands are world-fixed (a 3 m camera rise shifts the phase by the projected 3 m ± 15 %);
  - ≥ 30 % of transitions show a darker lip (≥ 8 L\* within 3 px);
  - slopes < 0.45 show no bands.
- **A-look-mesa** (action) — `look.pansInland` → pass:
  - the ridge silhouette has ≥ 3 near-flat segments (|slope| < 8° over ≥ 25 m) bounded by risers ≥ 45°;
  - A-world-size, A-trig-pillars and A-reach-all-sites green;
  - ≤ +0.4 ms on the steep-face frame.
- **V-look-strata** (visual) — against `#1-TR` (the canyon walls), `#2-MC` row 2 right (form only) and `reference/r5/gates-perf/strata-talus.jpg`. Pass: bedding, ledges and varnish read as layered rock with lit and shaded faces. FAIL: stripes painted on a cone; one band period; swimming bands; black glassy "obsidian". IP-clause.
- **A-look-meadow** (action) — pass:
  - instance counts per ring in a 20×20 m square at `gatePlaces.meadow` within ±15 % of W-06's table (cover-weighted);
  - flowers in R0+R1 clumped (Clark-Evans R ≤ 0.75);
  - bottom 40 % of `look.meadow` at 18:45: gold pixels ≥ 45 %, strong violet 1.5–8 %, mean horizontal gradient ≥ 4.5, bare ground inside cover ≥ 0.6 cells ≤ 10 %;
  - the R2→R3 hand-over ≤ 4 L\*;
  - ≤ 7 draws, 0 casters;
  - ≤ +1.0 ms at high.
- **A-look-grass-backlit** (action) — a grass gatePlace at 17:45 → pass:
  - near grass (0–25 m, material-id mask) within 30° of the sun has mean L\* ≥ 1.25× the sun-behind view, hue 55–75°, chroma ≤ 45;
  - shadowed grass gains ≤ 1.05×.
- **V-look-meadow** (visual) — against `#1-TR`, the foreground spike of `#1-TL`, `#2-MR` and `reference/r5/gates-perf/ground-grain.jpg`. Pass: a continuous golden carpet with blades near Brea, backlit tips and violet spikes in clumps; blades bend from her legs. FAIL: sparse tufts on sand; a green lawn; red or rust grass; flowers as even confetti; visible ring edges. IP-clause.
- **A-look-temporal** (action) — a 1 s, 10°/s pan over `look.meadow` and `look.beach` → pass: median frame-to-frame |ΔL\*| on static geometry ≤ 2.0, and ≤ 0.5 % of pixels above 8 for ≥ 3 frames (`high` is SMAA-only with no TAA; W-06 blades ≥ 1.5 px, the W-07 sparkle and W-09 glints pre-filtered by pixel footprint).
- **A-look-black-sand** (action) — `look.beach` standing and crouched at 07:00 and 18:45 → pass:
  - in the sand mask p50 L\* ≥ 20 and std ≥ 7; bottom-band gradient ≥ 1.6;
  - sparkle (L\* ≥ 65) 0.2–1.5 % toward the sun at 18:45 and 0 beyond 30 m;
  - sampled albedo 0.02–0.05 linear;
  - the wet band ≥ 10 L\* over dry toward the sun;
  - A-anti-tile ≤ 0.15;
  - ≤ +0.15 ms.
- **V-look-black-sand** (visual) — against `#1-BR` (THE PANS card), `#2-BR` (The Pans card) and `reference/r5/gates-perf/ground-grain.jpg`. Pass: dark ground with grain, ripples, wet sheen and foam lines in the low sun. FAIL: a flat black hole; grey ash; a snow-like glitter. IP-clause.
- **A-look-sun-glitter** (action) — `look.pansSunset` with the sun 4–10° up → pass:
  - the column (sun azimuth ±3 % W, horizon to 30 % H) has mean L\* ≥ 70 and ≥ 2.5× the sea at ±25°;
  - it is ≤ 4 % W at the horizon and ≥ 2× wider at its foot;
  - ≥ 1.5 % of its pixels at L\* ≥ 92 and ≥ 30 % below 70;
  - 0 glints with the sun behind the camera.
- **A-look-horizon-seam** (action) — every sea-facing look frame → pass: outside the column, mean |ΔL\*| between the last sea row and the first sky row ≤ 5; the 2° below the horizon has L\* std ≥ 3; ≤ +0.15 ms.
- **V-look-sea** (visual) — against `#1-MR` and `reference/r5/brand/salinas-de-janubio.jpg`. Pass: a glittering path under the sun that breaks into sparkles toward the viewer, on a sea running silver to violet. FAIL: a flat fog band; white blotches; a mirror-flat sea. IP-clause.
- **A-look-trees** (action) — per species at 30 m, 18:45 → pass:
  - crown width ÷ height: tamarisk 1.0–1.6, sabina 1.4–2.4 (leaning 15–35° to 225°), dragon tree 1.2–1.8 (≥ 12 limbs), pine 0.5–0.9;
  - ≥ 4 lobes in the silhouette;
  - lit-to-shade range ≥ 25 L\*, with a backlit rim ≥ shade + 30 within 3 px;
  - each LOD switch changes the area by ≤ 6 %;
  - ≤ 1 draw per species per LOD + 1 caster;
  - ≤ +0.3 ms.
- **V-look-trees** (visual) — against the left-edge tree of `#1-TL` and `reference/r5/gates-perf/pine-ridge.jpg`. Pass: soft, volumetric, backlit canopies with readable lobes and a wind lean. FAIL: lollipops; faceted blobs; Round-4 conifers; alpha cards. IP-clause.
- **A-look-palette** (action) — each biome's look frame at its key hours → pass:
  - frame mean C\* ≥ 13 (≥ 11 for Malpaís and fog);
  - k-means (k 6) puts ≥ 4 centroids within ΔE76 12 of the biome swatches;
  - violet share ≥ 12 % at golden and dusk; warm share 20–65 % at golden;
  - calima: top band a\* +15…+23, b\* +20…+32, warm share ≥ 55 %;
  - A-hour-keys holds.
- **V-look-biome-cards** (visual) — one frame per biome against the cards of `#1-BR` and `#2-BR`, and `reference/r5/gates-perf/{salt-pans,biome-ravine,dry-riverbed}.jpg`. Pass: each biome is recognisable from colour alone at 256 px. FAIL: two biomes sharing a palette; a grey frame. IP-clause.
- **A-look-map-bake** (action) — pass:
  - depth-ramp colours within ΔE 8 at 0, 1.2 and 12 m;
  - each biome region median within ΔE 12 of its swatch;
  - hillshade correlation ≥ 0.85 with an analytic Lambert;
  - ≤ 350 KB with a LICENSES row (original work);
  - caldera and Malpaís polygons have 0 px with R ≥ 200, G ≤ 120, B ≤ 90;
  - disposed when the map closes (A90 deltas 0).
- **A-reed-cover** (action; F-4) — an idle `sentry` faces Brea crouched at 12, 18 and 24 m; detection-fill time measured → pass:
  - (a) golden meadow density ≥ 0.8 against bare ground: ratio 1.00 ± 0.05 still and moving;
  - (b) reed density ≥ 0.8 with `windAt` ≥ 4 m/s: ratio ≥ 2.0 still and ≥ 1.6 crouch-walking at 1.2 m/s;
  - (c) reed in a forced lull (< 2 m/s): still ≥ 2.0, crouch-walking ≤ 1.15;
  - (d) within 0.5 m of a Peg transect lane cut through reed: 1.00 ± 0.05;
  - (e) per-instance tint hue ≥ 38°, reed mean hue 55–100°, top-decile-density instances within ΔE2000 10 of the rest;
  - (f) ≥ 90 % of reed instances where moisture ≥ 0.5;
  - (g) rendered strings: 0 matches of `/tall grass|stealth grass|hide in (the )?grass/i`;
  - (h) reed + rush ≤ 2 draws, 0 casters, ≤ 0.3 ms at `look.reed`; perception ≤ 0.02 ms per Instrument;
  - (i) every perception change runs a negative control (bare ground, ratio 1.00);
  - (j) crouched in meadow, ≥ 50 % of her silhouette is visible from the sentry lamp at 12–24 m.
- **V-reed-stealth** (visual; F-4; a 3-frame strip at 80 ms, since the motion clauses cannot be read from one frame) — `look.reed` at 19:45, Brea crouched in carrizo with a wary `sentry` at 18 m, against `ext:kevin-nov6-stills.md@bf79cdc9#5-4` (mood only), `ext:kevin-nov6-board.jpg@f2694e04#2-MR` and `reference/r5/gates-perf/crouch-stalk.jpg`. Pass: tall pale canes with plumes moving in the wind, Brea readable inside them, the machine's state read from its lamp (iris, rhythm, colour) and the compass ◆ pip. FAIL: rust or red grass patches; any HUD glyph over an Instrument; a triangle or eye over heads; any red eye. IP-clause.
- must stay green: A-anti-tile, A-skirt-masked, A-world-size, A-terrain-api, A-reach-all-sites, A59b, A60 (re-read on the cover field), A108, A109.

### world-props (W1, W3, W4)

- **A-look-sea-skyline** (action) — `look.pansSunset`, `look.title` at 18:45 → pass:
  - ≥ 3 stacks ≥ 24 px tall;
  - ≥ 1 inside the glitter column with mean L\* ≤ the column − 25;
  - stack height coefficient of variation ≥ 0.25;
  - the stratovolcano ≥ 14 px above the horizon, its apparent height 6–9° above the sea horizon (L-15; today ≈ 4.9°), drawn in front of the sky dome (L-10);
  - stacks ≥ `PLAY_RADIUS` + 20 m out with 0 colliders;
  - ≤ 4 draws + ≤ 1 caster;
  - foam (L\* ≥ 75) at every visible stack foot.
- **A-look-spires** (action) — `look.pansInland` at 18:45 and 07:00 → pass:
  - ≥ 2 needles (height:base ≥ 3:1) above the caldera rim line; the hero plug ≥ 90 px, the second ≥ 40 px;
  - landmark caps ≤ 40 k tris, ≤ 3 draws + 2 casters; A-place-draws ≤ 45;
  - ≤ +0.45 ms.
- **V-look-sea-skyline** (visual) — against `#1-MR` and `reference/r5/gates-perf/ridge-skyline.jpg`. Pass: a staggered chain of stacks at ≥ 3 distances, backlit on the bright sea, hazed, with surf at their feet. FAIL: an empty horizon; one blob; equal stacks in a row; a stack over the sun disc. IP-clause.
- **V-look-spires** (visual) — against `#2-MC` row 2 right (form only) and `reference/r5/gates-perf/strata-talus.jpg`. Pass: a tall fluted needle with ledges above the rim. FAIL: a cone; a smooth pillar; black glass. IP-clause.
- **A-look-landmark-scale** (action) — pass:
  - the Ring ≥ 140 px tall from `look.pansInland` and ≥ 120 px from T1; ≥ 15 % of its box shows background through it; ≥ 50 % of its silhouette above the sea horizon; tilt 15–25° from vertical; outer diameter 34 ± 0.5 m;
  - the Organ Shelf from 150 m shows ≥ 8 distinct column-top heights;
  - pump rotors ≥ 30 px from the salt field's centre;
  - every look frame meets the 140/40/40 px rule;
  - A-landmark-bearing and A-place-draws green.
- **V-look-ring** (visual) — against `#2-MC` row 1 left (The Sounding Ring), `#1-MR` and `reference/r5/gates-perf/survey-tripod.jpg`. Pass: an upright broken ring proud of the ground, legible at a glance, sun or sea glow through it, gimbal-and-flange construction readable. FAIL: flat or half-buried; a closed stone portal; smaller on screen than the pumps. IP-clause.
- **A-look-ruins** (action, W3) — pass:
  - Kiln Yards from T3: silhouette ≥ 80 px with ≥ 3 verticals ≥ 15 m (height CV ≥ 0.2);
  - Holds: ≥ 5 tiers each with an edge |ΔL\*| ≥ 6; ≥ 4 blossom patches at Ninewalls;
  - Malpaís: A-no-lava green, cinder-red share ≥ 6 % at 18:45.
- **V-look-ruins** (visual, W3) — against `#2-MC` (Kiln Yards; Crescent Holds) and `reference/r5/gates-perf/collapsed-tower.jpg`. Pass: towers of different heights against the sky; terraces stepping up a slope. FAIL: classical columns or temples; any lava. IP-clause.
- **A-place-names** (action) — PLACES ids, map labels and place strings: 0 named lint hits, 0 `/spire/i`.

### character-art (W1 exit; W2 by grant)

- **A-skin-scatter** (action) — staged V-brea-closeup frames at 1600×900, DPR 1.25; 9×9 px patches at projected face-library landmarks → pass:
  - (a) DAY 11:00 front: shadow cheek 0.022–0.060 relative luminance;
  - (b) lit:shadow 3.5–5.5;
  - (c) the 80→20 % fall spans ≥ 10 % of face width;
  - (d) shadow-cheek warmth (R−B)/(R+G+B) ≥ 0.40;
  - (e) BACKLIT 18:45: ear helix ≥ 1.5× shadow cheek, and < 1.15 with `_calThin` zeroed (negative control);
  - (f) NIGHT 01:00 shadow cheek ≤ 0.010;
  - (g) `userData.calSkin === 1` on Brea and every near-tier NPC skin; draws and textures unchanged; A-brea-budget, A-brea-fill, A-face-delta green.
- **V-brea-face-keyart** (visual) — front, 3/4 and profile on both sides at 0.8 m, DAY and 18:45, against `#1-MC` (all three faces), `#5-7` and `reference/r5/hero/brea-face-sheet.png`. Pass:
  1. a warm red-brown shadow side that keeps cheekbone, jaw and nose planes;
  2. a soft terminator;
  3. sheen on forehead, nose bridge and cheekbone;
  4. wet eyes with catch-lights;
  5. a dark upper lash line;
  6. a matte chalky salt-line;
  7. the wrap as soft dyed cloth with deep folds.
  FAIL if it reads as brea-closeup-day-nov6-wip with only the brightness changed, or looks cheap beside the panel (R54 d). IP-clause.
- **A-skin-spec** (action) — the 3/4 DAY frame re-rendered with flat skin albedo (gate-only override) → pass:
  - (a) highlights (≥ 2.2× face median) cover 1.5–8 % of the face box;
  - (b) ≥ 60 % of them within 2 cm of the forehead, nose-bridge and cheekbone landmarks;
  - (c) MACRO 0.4 m cheek: high-pass RMS 0.012–0.040, falling ≥ 30 % with the detail weight forced to 0; weight 0 at 3 m;
  - (d) the salt-line ≥ 2.5× the lit cheek with ≥ 90 % of its pixels ≤ 0.97 sRGB;
  - (e) A-brea-budget ≤ 0.7 MB.
- **A-eye-catchlight** (action) — front and 3/4 at 0.8 m → pass:
  - (a) DAY and DUSK: each iris disc holds a highlight blob ≥ 2×2 px, ≥ 0.75 sRGB and ≥ 4× the iris median;
  - (b) NIGHT: no iris pixel > 0.50;
  - (c) profile: a ≥ 1 px rim highlight on ≥ 30 % of the cornea outline;
  - (d) the 2 mm upper-lid band ≤ 0.45× the lid 4 mm above, over ≥ 70 % of the width;
  - (e) A-wrap-closed 0 px.
- **A-hero-rim** (action) — V22 chase staging at 18:45, sun behind Brea within 30° azimuth at 8–15° → pass:
  - (a) her outer 3 px edge band ≥ 1.8× her interior;
  - (b) ≥ 35 % of edge pixels ≥ interior P90;
  - (c) in a landmark's cast shadow, edge:interior ≤ 1.2;
  - (d) noon front-lit edge:interior ≤ 1.3;
  - (e) 0 extra draws.
- **V-brea-golden-hour** (visual) — chase back-3/4, idle and mid-sprint at 18:45, against `#1-TL`, `#5-3` and `reference/r5/gates-perf/run-rear.jpg`. Pass:
  1. a warm sun-rim on shoulder, arm, wrap edge and tail;
  2. deep saturated violet;
  3. skin glowing warm at its edges;
  4. glints on leather and bronze;
  5. light, not an outline, separates her from the background.
  FAIL: flat-lit against a golden sky; a uniform halo. IP-clause.
- **A-hero-shadow** (action, W2) — pass:
  - (a) DAY front, sun 35–50° in front: forehead 1.5 cm under the hem ≤ 0.75× the patch 4 cm under;
  - (b) the cheek beside the nose on the anti-sun side ≤ 0.80× its mirror;
  - (c) ≥ 15 % dip within 1 cm beside each strap;
  - (d) medium: define absent, 5 fewer draws;
  - (e) ≤ +5 draws, ≤ 8.4 MB in A-rt-ledger, ≤ +0.25 ms;
  - (f) A90 flat, the alloc row ≤ 1 KB/s;
  - (g) enabled on high only under R66(h).

### hero-body (W1 fix round)

- **A-play-chase-horizon** (action) — a Pans gatePlace at 13:00 and 18:45, starting at pitch +0.25, then jog 4 s and sprint 4 s on 4 bearings with no look input → pass:
  1. pitch within 0.02 rad of rest ≤ 3.0 s after the last look input;
  2. the 800 m horizon row at 40–50 % of frame height on flat ground;
  3. Brea 52–60 % of height at jog (V22's 54 % floor holds) and 46–56 % at sprint, centroid NDC x in [−0.24, −0.10];
  4. lens 1.25–1.55 m above her feet;
  5. after a look delta ≥ 0.002 rad, 0 auto-level for 0.5 s;
  6. 0 auto-level over 60 frames while aiming, crouched or at pitch −0.8;
  7. A31b/d/e/f, A32b and V22 unchanged; A31c ≥ 0.75 × the pinned control by the W2 exit (R51).
- **V-play-chase-vista** (visual) — a jog toward the Ring at 18:45, against `#1-TR`, `#5-3` and `reference/r5/gates-perf/chase-camera.jpg`. Pass: the top half of the frame is sky and landmark silhouettes; Brea is one clean silhouette left of centre with the tail visible; the Ring is in the centre or right third. FAIL: horizon in the top third; the lens looks down on her crown. IP-clause.
- **A-play-aim-frame** (action) — `sentry` at 20 m, full draw at pitch 0 / −0.3 / +0.3, standing and crouched → pass:
  1. at pitch 0, the head projects to NDC x [−0.55, −0.32], y [−0.05, +0.30];
  2. the draw hand and the right-cheek landmark are visible in an ID-buffer test;
  3. 0 hero pixels within a 0.12-NDC disc of the crosshair;
  4. the hero mask covers 14–26 %;
  5. the target box fully in frame and ≥ 85 % unoccluded;
  6. the lens ≥ 0.25 m from every bone;
  7. A31, A31b/d/e/f, A32, A32b, A-draw-elbow-level, A107, V4, V13, V24 unchanged.
- **V-play-aim** (visual) — against `#5-2`, `#1-BL` and `reference/r5/gates-perf/draw-side.jpg`. Pass: lens over the right shoulder at eye level; the cheek anchor and string line read; the target fills the right half and is the sharpest thing; nothing crosses the crosshair. FAIL: looking down on the wrap. IP-clause.
- **A-play-bigfight-frame** (action) — 18:45, stand-in (W1) or `heavy` (W2 on) hostile at 8, 12 and 18 m → pass:
  1. the Instrument's top ≥ 0.05 NDC above Brea's crown at 8 and 12 m for H ≥ 3.5 m; at 18 m only for H ≥ 5 m (the Kiln clears by 0.15);
  2. ≥ 80 % of its box in frame at 12 and 18 m, ≥ 55 % at 8 m;
  3. Brea 38–48 % of frame height;
  4. lens 1.30–1.45 m above her feet;
  5. a 20 s circle-strafe at 6 m: boom never < 1.2 m, 0 frames inside a hull;
  6. boom ≤ 1.5 m/s and FOV ≤ 6°/s through transitions;
  7. within 2 % of exploration framing ≤ 2.0 s after a kill;
  8. A-play-chase-horizon unchanged.
- **V-play-bigfight** (visual) — against `#5-5`, `#5-9`, `#1-BL` and `reference/r5/gates-perf/lance-strike.jpg`. Pass: the machine's top above her head; Brea left or centre-left; horizon in the lower half. FAIL: the lens looks down on both. IP-clause.
- **A-play-hitweight** (action) — timeScale and camera logged every frame at 60 fps sim → pass:
  1. frames at timeScale ≤ 0.05 last 55 / 90 / 115 / 120 ms (light / heavy / weak / kill), each within 1 frame;
  2. arrows ≤ 70 ms, matching today's formula;
  3. 10 s of light spam: no 1 s window > 180 ms;
  4. A53, A-steady-breath, A-rack-no-slow unchanged;
  5. kick peaks 0.010–0.014 rad (light) and 0.019–0.025 rad (heavy), with sign matching the tangent, back within 0.001 in ≤ 0.35 s;
  6. FOV punch −1.5 ± 0.2° on a heavy, back in ≤ 0.3 s;
  7. `settings.cameraShake = 0` reads exactly 0 for all three effects;
  8. A-melee-latency and A105 unchanged.
- **A-tail-flow** (action; with character-art) — pass:
  - (a) bind mesh: length 0.53–0.62 m, root width 0.09 ± 0.01, pre-fringe width 0.06 ± 0.01, hem ≥ 3 mm, ≤ 900 tris, 7 links;
  - (b) idle 4 s in 5.5 m/s wind from 045: tip lateral peak-to-peak 0.12–0.35 m;
  - (c) sprint 4 s: ≥ 2 curvature sign changes in ≥ 50 % of frames;
  - (d) every frame of idle, sprint, crouch, dodge and full draw at the 4 pitches: no vertex > 5 mm inside the stowed lance or bow capsule; A-wrap-clear, A-tail-legible, A-stow-clearance (R62 b), A33-hair-bounce and A34 pass;
  - (e) spring solver ≤ 0.10 ms CPU.
- **V-tail-keyart** (visual) — chase back-3/4, idle in wind and mid-sprint, 3 frames 80 ms apart, against `#1-TL`, `#2-TL` and `reference/r5/gates-perf/hair-trail-run.jpg`. Pass:
  1. long (hanging below the shoulder blades; in wind, past the shoulder);
  2. thick soft cloth with rolled hems and a frayed end;
  3. different in each frame;
  4. carmine lining only as an edge sliver;
  5. never through the lance, bow or quiver.
  FAIL: a paper edge, a plank, any clipping. IP-clause.

### armory (W1 fix round 2, W3)

- **A-starter-cut** (action) — pass:
  - (a) no sleeve pieces; skin-hue pixels ≥ 60 % of shoulder-to-elbow on both arms in the flat-lit V-brea-one-glance front and back views;
  - (b) strap centrelines cross within 3 cm of the sternum landmark; boss 6 ± 1 cm;
  - (c) both forearms covered by wrap and bracer from the wrist to ≥ 0.18 m; crescent plate on the left;
  - (d) ≥ 2 sash panels ≥ 0.30 m on the left-rear hip, hue ≥ 25 ΔE2000 from #A3213A;
  - (e) boot mean luminance ≤ 0.10 on the flat-lit sheet;
  - (f) caps as R66(f): body ≤ 11.5 k, outfit ≤ 16.0 k, stow ≤ 9.0 k, held ≤ 3.0 k, total ≤ 40 k (caps sum 39.5 k); ≤ 5 draws; ≤ 2 casters; ≤ 0.8 MB;
  - (g) A-brea-contrast, V-brea-one-glance 5/5, A-variant-swap-matrix (R62 c), A-wrap-clear, A-run-arms, A35, A-draw-elbow-level and A-stow-clearance pass.
- **V-starter-vs-board** (visual) — front, 3/4 and back at 2 m and chase, DAY and 18:45, against `#2-TC`, `#1-TL`, `ext:kevin-nov6-armor.md@d8509a8f#4-L1` and `reference/r5/hero/brea-silhouette-sheet.png`. Pass:
  1. sleeveless violet top with bare toned arms;
  2. crossed brown harness with a bronze boss;
  3. violet forearm wraps under bracers;
  4. sash panels that hang and move;
  5. dark trousers and dark laced knee boots;
  6. the wrap, tail, salt-line, lance and cane quiver all read;
  7. the top carries R64(a)'s smock art-pass bar (weave, seams, folds, armhole binding) at 0.8 m.
  FAIL: the old smock with its sleeves cut off; boots the brightest thing below the waist. IP-clause.
- **A-weapon-finish** (action) — pass:
  - (a) golden 3/4 at 1.5 m: a blade highlight ≥ 0.85 sRGB over ≥ 4 px;
  - (b) Sabina reflex ≥ 8°, length 1.45 ± 0.02 m;
  - (c) fletching within 6 ΔE2000 of #6B3F73;
  - (d) element heads at ≥ 1.1× bloom threshold only while nocked or in flight, 0 otherwise; no weapon emissive within 20 ΔE of #9B6BFF;
  - (e) atlas and draws unchanged; A-lmax-solve and A-weapon-swap-memory pass.
- **V-weapon-keyart** (visual) — full draw (V24) and stowed at 18:45, against `#1-BL`, `#1-TL` and `reference/r5/gates-perf/bow-in-hand.jpg`. Pass: the bronze blade glints; a hand-made bow with reflexed tips and a grip wrap; the haft's bands read; only element arrows glow, in their element colour. IP-clause.
- **A-play-arrow-read** (action) — full draw at `sentry` 20 m, then release → pass:
  1. glint ≥ 6 px with linear peak ≥ 1.3 at full draw, absent below 0.9 draw;
  2. at +80 ms one connected streak ≥ 40 px long and ≤ 6 px wide;
  3. within ΔE2000 10 of its ammo colour;
  4. 0 % of pixels at hue 180–260° and saturation > 0.35;
  5. ≥ 20 ΔE2000 from #9B6BFF and #FF2D8C;
  6. ≤ +1 draw;
  7. A52 and the launch-ray clauses unchanged.
- **V-play-arrow** (visual) — against `#5-2`, `#1-BL` and `reference/r5/gates-perf/draw-front.jpg`. Pass: the nocked tip catches light, and the shot leaves a readable streak to the hit. IP-clause.
- **A-armour-ladder** (action; W1 rungs 1–4 at their W1 state, W3 all 8) — pass:
  - (a) 8 rungs registered with ladder index 1–8 rising with acquisition (C-09 table's acquisition column; Vanguard crafted at Oro only after "The Scar");
  - (b) per rung: merged tris within its cap (outfit ≤ 16.0 k), 1 outfit draw, the bible set's shared atlas ≤ 0.8 MB plus ≤ 0.15 MB of extras; no alpha-tested material (fringes are geometry strips); only the worn atlas resident (the texture count after 6 swaps equals baseline);
  - (c) 64 px height-normalised black-fill masks, front and side: pairwise IoU ≤ 0.90, ≤ 0.88 between neighbours;
  - (d) every rung: ≥ 60 % of visible wrap pixels within 8 ΔE of Orchil Deep (hood up included), the salt-line in the face crop, the lance and quiver present;
  - (e) A-variant-swap-matrix (R62 c), A-variant-motion-rerun, A-outfit-swap-memory, A-armor-verb with its negative control, A-no-move-mods pass for all 8; the retired perks (Dust-sight, Sure-foot, Fog-mend, Thrown whistle) are on no rung;
  - (f) no armour emissive except the Datum Plate lampglass within 3 ΔE of #F2EAD3.
- **A-armor-ip** (action) — pass:
  - every tier label, set name and tagline: 0 named lint hits, and graded ≤ the image string it replaces (0 of 8 worse);
  - 0 occurrences of "Specter", "ancients", "channel";
  - ≤ 1 emissive mesh per set;
  - R16: `player.speeds` unchanged.
- **V-armour-lineup** (visual, W3) — 8 full-body cards, front, 3/4 and back at 2 m and 20 m on dusk ground, against `#4-L1…#4-L8`, `#4-SIL`, `#2-TC` and `reference/r5/hero/brea-silhouette-sheet.png`. Pass:
  1. each rung is a distinct silhouette at 20 m;
  2. the progression reads cloth → leather → quilt → ceramic plate;
  3. every card keeps the violet wrap and tail, salt-line and lance;
  4. low-magic: no runes, no crystal glow, the only light the Datum lampglass;
  5. no fur, braid or red hip sash;
  6. no circuit-trace embroidery.
  FAIL: neighbours differing only by colour. IP-clause.
- **A-custom-matrix** (action, W3) — 3 headwraps × 2 capes × 3 trims × 4 schemes on Starter and one plate rung → pass:
  - ≤ 5 draws; textures unchanged; tris in cap;
  - A-brea-contrast for every scheme; V-brea-one-glance 5/5 for every headwrap and cape;
  - cape ≥ 0.05 m from the draw hand through a full draw at 4 pitches and ≥ 0.03 m from the stowed lance; A-tail-legible with the cape on;
  - survives save and reload (A65); geometries, textures and skeletons at baseline after 6 swaps.
- **A-character-page** (action, W3) — pass:
  - CHARACTER tab with 8 rung cards (tier label, set name, tagline, 4–5 swatches);
  - locked rungs show black-fill silhouettes only;
  - the sheet reads age "31" and "Pan Houses";
  - glass tokens per A-glass-language-static;
  - selected-card styles ≥ 20 ΔE2000 from Horizon's five;
  - 30 open/close cycles: geometries +0, textures +0.
- **V-ui-character** (visual, W3) — against `#4-L1…#4-L8`, `#4-CUS` (described) and `#2-TC`, and `reference/r5/shell-ui/glass-tokens.png`. Pass: a glass character page whose eight rungs read as a progression; a lit turntable; customization rows; Brea's identity cues. IP-clause.

### melee (W1 fix round, W2)

- melee runs **A-play-impact** clauses (2) and (6) and **A-play-hitweight** clauses (1), (3) and (5) for lance hits in its own block from W1 (rows owned by combat-kit from W2).

### combat-kit (W2)

- **A-play-impact** (action) — 8 m from `herd` (W1) or `heavy` (W2 on): a lance heavy on a weak point and a full-draw arrow on the hull; frozen at +60 and +250 ms; VFX mask from an A/B with pools hidden → pass:
  1. at +60 ms the mask covers 0.6–3.5 % (arrow body) / 1.5–6 % (heavy weak);
  2. ≥ 70 % of the mask within 0.9 m of impact;
  3. 0 % at hue 180–260° and saturation > 0.35;
  4. ≥ 8 chip blobs ≥ 3 px;
  5. a Cinder weak hit shows ≥ 25 rising ember blobs at +250 ms within ΔE2000 12 of #FF7A1A;
  6. the struck part's mean luminance +15…+40 % at +30 ms, back within 2 % by +150 ms;
  7. the impact light raises ground within 3 m by 8–60 % at +40 ms;
  8. `renderer.info.programs` constant over 20 hits;
  9. GPU ≤ 0.6 ms on the burst frame, ≤ 0.1 ms with none live;
  10. V28 and V47 pass.
- **V-play-impact** (visual; a 3-frame strip at 80 ms) — against `#5-9`, `#1-BL` and `reference/r5/gates-perf/spark-burst.jpg`. Pass: a bright core with a fan of sparks and chips; a Cinder weak hit shows fire with rising embers; the hull reacts. FAIL: a smoke puff; blue sparks. IP-clause.
- **A-play-vfx-envelope** (action, quiet box) — the A21 staged fight with a heavy weak hit, a Cinder arrow hit, a roll and 2 arrows in flight within 0.3 s → pass:
  - the next 10 frames' GPU median ≤ +1.0 ms against pools hidden; idle ≤ +0.15;
  - ≤ 10 VFX draws (inside §4.2's 25);
  - programs constant after warm-up;
  - ≤ 64 KB/s allocated;
  - A91, A90, A90-abs and A21's 350 hold.
- **A-play-dodge-dust** (action) — dry salt at 18:45 with the sun ahead; rolls left, right and forward frozen at dodgeK 0.5 → pass:
  1. the mask covers 2–9 %, ≥ 60 % below her hip line;
  2. mean luminance ≥ 1.10× the background covered, ≤ 1.0× with the sun behind;
  3. 0 dust on wet sand;
  4. within ΔE2000 12 of the surface's dust colour;
  5. ground-line Sobel energy ≤ 1.2× background;
  6. ≤ 0.25 ms at peak;
  7. 0 live quads 1.3 s after;
  8. A2, the roll rows and A91 unchanged.
- **V-play-dodge** (visual) — against `#5-5`, `#2-BL` (SEIZED card) and `reference/r5/gates-perf/dry-riverbed.jpg`. Pass: a backlit dust fan trails the roll and reads as dust, not smoke balls. IP-clause.
- **A-kitrack-protractor** (action) — Rack open → pass:
  - 0 `backdrop-filter`;
  - an arc of 180 ± 2° with its centre x ≥ W − 40 px; 5 sectors;
  - no full-circle radial anywhere;
  - timeScale 1.000;
  - A-ui-composite-cost's rack clause ≤ 0.50 ms.
- **V-kitrack** (visual; a 3-frame strip at 80 ms) — against the wheel in `#2-MR` and `reference/r5/gates-perf/survey-tripod.jpg`. Pass: a half-ring at the right edge, legible icons, the world visible and moving behind it. IP-clause.
- **A-making-ledger** (action; F-2, with shell-ui) — pass:
  - the MAKING page lists exactly the bible §5.2 ammo ids plus pots and nets, with names from the bible;
  - MAKE ×6 Dust-Puff consumes the recipe and adds 6 (survives reload, A65);
  - quick-make: holding a Kit Rack slot 1.2 ± 0.1 s adds 6, with timeScale 1.000 throughout; damage mid-hold → 0 made;
  - held-frame GPU ≤ 1.0 ms with the turntable;
  - 0 hexagons, 0 `backdrop-filter`, 0 glow tokens < 20 ΔE2000 from Horizon's five;
  - page strings: 0 matches of `/shock|stuns?|interrupts? (their|its) routines|craft/i`; buttons read MAKE.
- **V-ui-making** (visual) — against `#5-6` (mood only) and `#2-BM`, and `reference/r5/shell-ui/glass-tokens.png`. Pass: ledger rows with tallies of island materials, a large lit render, our own words. FAIL: a hex glow; violet bloom behind the item; the image's card layout. IP-clause.
- **A-weak40-golden** (action; the kind block, I-06) — 40 m at 18:45 sun-behind and at 19:45 → pass:
  1. lamp and vial ≥ 3:1 against the hull annulus and ≥ 2:1 against the sky behind;
  2. hull median ≥ 1.4:1 against the background annulus;
  3. the hostile lamp within 6 of #FF2D8C and ≥ 20 from #ff2413;
  4. the aimed cue reaches 1.4× ± 0.05 within 0.2 s and drops back within 0.2 s.
- **V-play-backlit-read** (visual) — into the sun at 18:45 with 3 `herd` at 25–40 m, against `#5-2`, `#5-4` and `#1-BL`, and `reference/r5/gates-perf/herd-file.jpg`. Pass: each lamp a point of its state colour; silhouettes separate from the grass. FAIL: any red eye. IP-clause.

### Instruments — the per-kind block (additions; every species lane runs them)

- **A-core-glow** (action) — pass:
  - (a) core HDR ≥ 1.25× the live bloom threshold in its active state (lamps when wary or hostile, vials always, the firebox when lit, the Spindle hub only in its exposure and ≤ 0.2× outside it);
  - (b) within 3 of its bible colour; lamps also ≥ 20 from the five;
  - (c) DUSK 20:30: hull within 0.6 m of the core ≥ 15 % brighter than with the core dark, and beyond 1.2 m ≤ 3 % change;
  - (d) a 30° orbit at 6 m moves the inner glow ≥ 2 px relative to the rim;
  - (e) still 1 hull + 1 sensor material per kind; lights and draws unchanged; A-weak40 ≥ 3:1; A-lamp-states passes.
- **V-core-fight** (visual) — staged duel at dusk, chase at 10–15 m, against `#1-BL`, `#5-9` and `reference/r5/gates-perf/survey-tripod.jpg`. Pass: the weak point is the hottest light and lights the plates round it; its colour is the bible's; no eye, face, head or jaw; it reads as a survey tool. FAIL: a red eye or a lone glowing "face". IP-clause.
- **A-menace-scale** (action; Screed W2, Kiln W3; heights per Q3) — pass:
  - (a) Screed top 3.8 ± 0.1 m, Kiln top 5.5 ± 0.1 m; footprints within 0.05 m of the bible;
  - (b) A-sil40 IoU ≤ 0.45, A45c, A46, A47c, A-glb-budget green;
  - (c) staged Screed fight: Screed screen height ≥ 0.9× Brea's at 5 m, ≥ 0.6× at 10 m; camera pitched up 3–6° (P-03);
  - (d) A31c/d–f and V22 pass.
- **V-menace** (visual) — Screed and Kiln at 18:45, against `#1-BL`, `#5-5` and `reference/r5/gates-perf/collapsed-tower.jpg`. Pass: the machine towers and fills the upper frame; Brea readable in front; the low camera looks up; dust and backlight separate the layers. FAIL: toy-sized, as the Tiller in ui-sighting. IP-clause.
- **A-hull-value** (action) — per kind at 13:00 and 18:45 → pass:
  - (a) hull P5–P95 luminance ≥ 0.30;
  - (b) ≤ 2 % hull pixels ≥ 0.97 sRGB;
  - (c) foot band (lowest 15 %) ≤ 0.80× the upper half;
  - (d) ≥ 3 % of bronze pixels verdigris (hue 150–175°);
  - (e) backlit edge band ≥ 1.5× interior.
  - V-lineup gains: "worn glossy ceramic over bronze, dark joints, grounded feet, at the finish of `#2-TR` (finish only)".
- **A-instr-shadow-lod** (action) — pass:
  - (a) every medium and large kind has LOD1 ≤ 40 % of LOD0 tris;
  - (b) the shadow pass draws LOD1 only: herd-frame Instrument shadow tris ≤ 45 % of today;
  - (c) herd median GPU −0.3 ms or more (quiet box, 3 runs);
  - (d) A46 and A47 unchanged; shadow-mask IoU LOD0:LOD1 ≥ 0.90 at 12 m.
- **A-play-telegraph** (action) — A41b's duel, every authored attack → pass:
  1. 100 % of attacks telegraph 0.45–0.9 s before the hit frame (0.30–0.6 s for `flanker`);
  2. at 25 m, at 18:45 backlit and 13:00 trade, the held lamp ≥ 1.5× its flicker mean;
  3. glint ≥ 4 px with linear peak ≥ 1.3;
  4. hold hue within 6 of #FF2D8C;
  5. 0 telegraphs without an attack within 1.0 s.
- **V-play-telegraph** (visual; a 3-frame strip at 80 ms) — ending 0.3 s before contact, against `#5-5`, `#1-BL` and `reference/r5/gates-perf/lance-windup.jpg`. Pass: which end will strike is readable, with a steady lamp. FAIL: a red eye or face. IP-clause.
- **A-ip-emissive** (action) — per kind × {calm, wary, hostile} at 15 and 40 m, emissive-only render (I-07) → pass:
  - (1) emissive pixels (luma ≥ 0.05), each normalised by its max channel before ΔE (so an HDR core clipped to white cannot pass trivially), within ΔE2000 < 20 of any of Horizon's five ≤ 0.5 %;
  - (2) hostile at 15 m: emissive ≤ 1.5 % of the kind's silhouette.
- **V-ip-not-animal** (visual) — black-fill silhouettes, front, side and 3/4 at 40 m on plain sky, against `#2-TR` and `#3-ENEMIES` as **counter-examples**, and `reference/r5/gates-perf/survey-tripod.jpg`. PASS when the judge names the tool from the silhouette in ≥ 2 of 3 views. FAIL on any animal or humanoid read (head, jaw, neck, tail, wings, face, single eye) or any match to a panel creature's pose and proportions. IP-clause.

### settlements (now: NPC half; W2; W4)

- **A-npc-skin-parity** (action) — pass:
  - (a) every near-tier skin, eye and cloth material carries `calSkin` and `calRim`;
  - (b) each archetype at 2 m DAY front: A-skin-scatter (a), (b) and (d) within 20 % of Brea's values; A-eye-catchlight passes;
  - (c) in dialogue the hero-shadow box centres on the speaker within 1 frame;
  - (d) A-npc-draws ≤ 44, A-npc-fidelity, A-npc-dispose green.
  - V-npc-vs-brea gains: "the NPC's shadow side and eyes match Brea's in the same light".
- **A-look-saltrow** (action, W2) — `look.saltrowDusk` at 19:45 and 18:45 → pass:
  - ≥ 25 lit window or door patches ≥ 4 px at 19:45;
  - lime-wash lit L\* 70–90; shaded L\* 40–62 with a\* ≥ +3 and b\* ≤ +4;
  - roofline height std ≥ 0.4 m; ≥ 8 bougainvillea patches;
  - A-settlement-draws, A61-settlement-colliders, A-settlement-dispose green.
- **V-look-saltrow** (visual, W2) — against `#1-TR` (the left-edge village at distance), `#2-MC` (Crescent Holds card) and `reference/r5/brand/salinas-de-janubio.jpg`. Pass: a lived-in white village glowing warm at dusk, with violet blossom and turning pumps. FAIL: clean white boxes; uniform roofs; palisade language (V35). IP-clause.
- **A-brazier-rest** (action; F-1, W2; input-driven per R31) — pass:
  - walk to the `REST` brazier and interact → seated within 1.0 s through `player.ride`;
  - choosing GOLDEN puts the hour at 18.75 ± 0.02 within 3 s with A-hour-keys colours;
  - a save is written; reload restores the position at the brazier, hour 18.75 and the loadout (A65);
  - with a hostile Instrument within 60 m, rest is refused and the hour changes by 0;
  - lighting a brazier changes the map's travel list by 0;
  - Brine gourds are refilled;
  - UI strings: 0 matches of `/\bcamp(fire)?s?\b/i`;
  - `renderer.info.programs` constant when it lights.
- **A-play-brazier** (action) — REST at 19:30, Brea seated 1.2 m from the fire, side camera → pass:
  1. fire-side face luminance ≥ 1.4× the shadow side, hue 20–45°;
  2. flame peak linear ≥ 1.3;
  3. ≥ 12 rising ember blobs;
  4. programs unchanged;
  5. ≤ +0.1 ms;
  6. beyond 40 m in daylight fireLight = 0;
  7. the brazier is `ipExempt: 'fire'`.
- **V-play-brazier** (visual) — against `#5-11`, `#1-MR` and `reference/r5/gates-perf/conversation.jpg`. Pass: a living fire in a basalt bowl by a cistern; warm light on her face and wrap; a cool sky and sea behind. FAIL: a log campfire ring with a tent; any "camp" word. IP-clause.
- **A-leveler-palette** (action, W4) — Leveler at 8 m, front and 3/4, noon → pass:
  - figure pixels with L\* < 20 ≤ 30 %;
  - ≥ 2 white (L\* ≥ 85) and ≥ 2 vermilion bands across the sash;
  - no staff-head blade > 0.10 m;
  - Leveler 64 px mask IoU ≤ 0.80 against every other archetype;
  - 0 attack entries.
- **V-leveler-read** (visual, W4) — against `#2-TR` (THE LEVELERS row) as a **counter-example** and `reference/r5/gates-perf/surveyor-sighting.jpg`. FAIL on a dark hood + helmet + spear read; PASS on mask + banded sash + staff with lamp at 8 m. IP-clause.

### shell-ui (W1 fix round 2, W2)

- **A-ui-declutter** (action) — pass:
  - A-sighting's herd at 15 m: text-bearing HUD surfaces (effective opacity ≥ 0.15, ≥ 50 % on screen) ≤ 8;
  - text reveal chips ≤ 2; floating BRG/DST boxes 0, with the card carrying 'BRG' + 3 digits and 'DST' + 3 digits;
  - V37 staging: ≤ 1 full plate, ≤ 2 compact;
  - calm exploration (full health, nothing Flagged, 30 s idle) ≤ 4 surfaces;
  - A-sighting, A63, A71c, A71g, A-dmg-chip-clear PASS.
- **V-hud-declutter** (visual) — against `#1-TR` and `reference/r5/shell-ui/glass-tokens.png`. Pass: one card and one weak-point tag; no pile of gather labels; transect as faint dashes; the four-corner layout; the world, not the HUD, holds the eye. IP-clause.
- **A-glass-language-static** (action) — replaces A-ui-language-static's paper clause → pass:
  - 0 `backdrop-filter` while playing;
  - 0 clip-path polygons with ≥ 5 vertices or any non-axis-aligned edge on a panel;
  - 0 border-radius > 2 px except discs by role (skills nodes, compass chip, broad-arrow ring), each marked `data-shape='disc'`; SVG and canvas circles are counted too;
  - every glass panel alpha in [0.66, 0.95] with RGB within ΔE00 3 of #1E1A28;
  - 0 px of teal (160–185°, sat > 0.4) in any UI frame;
  - A-ui-type-only PASS.
- **A-violet-budget** (action) — pass:
  - per menu frame, pixels at hue 250–290° with S > 0.4 and V > 0.25 ≤ 2.5 %, with GL renders (the turntables, Brea), swatches and the selection fill (#5A2E66 at 60 %) masked out of the count;
  - Sighting overlay 0 (A-sighting-hue);
  - field HUD while playing ≤ 0.3 % with Brea masked out;
  - every token named `/glow|focus|accent|select|highlight/` ≥ 20 ΔE2000 from Horizon's five.
- **A-menu-freeze** (action; with G-post's holder) — herd staging, open the hub on the MAP tab (the satchel, making and character turntables add draws) → pass:
  - frames 5–65: medianGpuMs ≤ 1.0 and render calls ≤ 4;
  - the visible margin has luminance std ≤ 0.02 over any 32 px window;
  - after close, draws return within ±5 % in ≤ 2 frames;
  - 30 cycles: geometries +0, textures +0, the ledger row present only while open;
  - A68, A69, A70 and the A90 family PASS.
- **A-ui-composite-cost** (action; orchestrator's CDP wrapper) — frozen vista at 1600×900, DPR 1.25, 240 frames HUD shown against `#hud` hidden → pass:
  - median GPU-main busy Δ ≤ 0.35 ms; WebGL Δ ≤ 0.10 ms; Kit Rack open Δ ≤ 0.50 ms;
  - 0 elements under `#hud` or `cal-*` roots with a computed `backdrop-filter` while playing.
- **A-ui-contrast** (action) — four lights (Pans noon on white salt, golden grass 18:40, dusk 20:10, night 23:30) with the field note, Instrument card, weapon card, tools and compass chip up → pass:
  - every text run's WCAG ratio against the 95th-percentile non-text luminance in its panel ≥ 4.5:1 under 18 px and ≥ 3.0:1 at 18 px and up;
  - compass numerals ≥ 3.0:1 against a 6 px band.
- **A-hud-glass** (action) — pass:
  - every HUD panel alpha in [0.66, 0.80] over #1E1A28 ± ΔE00 3;
  - health 300 ± 8 px wide with 9 graduation gaps; tools centred within ±12 px of W/2 with bottom ≥ 0.92 H;
  - 0 minimap elements (unless Q6);
  - A71b/c/d/f/g/h, A63, A-dmg-chip-clear and A-ui-contrast PASS.
- **V-hud-glass** (visual) — replaces V10 and V37's paper clauses; V-hud-4k-a..d take them, against `#2-MR`, `#5-3` and `reference/r5/shell-ui/glass-tokens.png`. Pass:
  1. dark violet translucent panels that recede, with the world reading first;
  2. levelling-staff health and quest top-left;
  3. small tools bottom-centre with key hints;
  4. a prompt beside the crosshair;
  5. right angles and registration ticks;
  6. legible at 1600×900 and 4K.
  FAIL: notches, hexagons, a red 4-segment bar, a green pouch, cyan, a level ring. IP-clause.
- **V36-glass** (visual) — Sighting on a Tiller at 15 m, against `#1-TR` and `reference/r5/gates-perf/surveyor-sighting.jpg`. Pass: one glass card carrying the full TILLER reading; one cobalt ring with its tag; faint transect dashes; sepia vignette ≤ 20 %; not violet, teal or holographic. IP-clause.
- **A-title-layout** (action) — pass:
  - wordmark box left ≤ 0.12 W, right ≤ 0.50 W, top ≤ 0.24 H; 0 text nodes below the datum rule;
  - ≥ 5 station rows with left x in [0.07, 0.14] W and exactly 1 selected;
  - Brea's projected box centre x in [0.62, 0.80] W, height [0.45, 0.65] H, 0 overlap with wordmark or stations;
  - station text ≥ 4.5:1 against its row's 95th percentile;
  - 0 DOM matches of `horizon|spinoff|new chapter|remembers`;
  - A-keyart-sun holds.
- **A-logo-metrics** (action) — at 1600×900 and on a 3840×2160 crop → pass:
  - font-family Chakra Petch, weight ≥ 600, letter-spacing 0.16–0.20 em;
  - median stem ÷ cap height ≥ 0.12;
  - exactly 1 text node in the lockup;
  - "REMEMBERS" on 0 rendered surfaces;
  - V-logo's FAIL clauses hold.
- **V-ui-title-keyart** (visual) — against `#2-TL`, `#1-TL`, `#5-1` and `reference/r5/brand/calima-dawn-maspalomas.jpg`. Pass:
  1. the §9.8 wordmark top-left with the stations under it;
  2. Brea 3/4 from behind in the right third, tail moving;
  3. the Ring or spires on the skyline;
  4. low warm sun and distant haze (or calima per Q1);
  5. left third darker than right;
  6. it reads as key art.
  FAIL: any tagline other than R66(p)'s, R66(p)'s set centred, between rules or in wide-tracked caps; thin wide-tracked caps; a walker on the skyline. IP-clause.
- **A70-hub-tabs** (re-staged) — pass:
  - a top bar with 8 tabs (MAP, FIELD LOG, SATCHEL, MAKING, CHARACTER, SKILLS, FIELD BOOKS, SETTINGS); Q/E and LB/RB cycle them;
  - every tab routes;
  - A68, A69, A72, A72b, A-settings-rows-visible PASS.
- **V-ui-pause-glass** (visual) — against `#1-BC` (header), `#5-6` and `#5-10`, and `reference/r5/shell-ui/glass-tokens.png`. Pass: top tabs with the active one underlined; a dark glass page over a frosted frozen world; footer actions on the right; right angles and registration ticks. V-ui-settings, -death, -books, -making and -trade are re-judged in this family. IP-clause.
- **A-map-dark** (action) — pass:
  - unrevealed land L ≤ 0.05; coastline ≥ 3:1 against the sea;
  - legend uses set icons with BRAZIER, never "Camp";
  - TRACK sets the waypoint;
  - A-map-triangles and A-map-arrow-heading PASS.
- **A-map-relief** (action) — pass:
  - before any reveal, non-ink land differing from the base by > 0.015 L ≤ 1 %;
  - after T1+T2+T6, luminance std inside the triangle ≥ 2.5× unrevealed land;
  - relief outside revealed triangles ≤ 0.5 %;
  - each bake slice ≤ 4 ms.
- **V-map-glass** (visual) — against `#2-ML`, `#5-10`, `#3-MAP` and `reference/r5/shell-ui/glass-tokens.png`. Pass:
  1. a painted island with relief where revealed;
  2. legend left, site card right with TRACK;
  3. north green, centre pale, south dark;
  4. unrevealed land bare;
  5. no glowing lava.
  IP-clause.
- **A-satchel-grid** (action) — pass:
  - ≥ 15 cells visible without scrolling, 84 ± 4 px, 5 columns; counts in Plex;
  - the detail shows a GLB render (render calls minus held-frame calls 1–3) or the 160 px mark;
  - 0 hexagons; 0 cell fills with chroma > 12 apart from the 3 px rule;
  - 30 cycles: geometries +0, textures +0.
- **V-ui-inventory-grid** (visual) — against `#2-BM` and `reference/r5/shell-ui/glass-tokens.png`. Pass: a grid of square cells with counts; one framed selection; a detail column with a large rendered item; tabs across the top. FAIL: Fortnite-style rarity tiles. IP-clause.
- **A-icon-set** (action) — pass: 24 icons registered; pairwise 24 px mask IoU ≤ 0.60; stroke 1.5 ± 0.25 px; 0 hexagons; every legend mark and tool slot uses a set icon.
- **V-ui-icons** (visual) — against `#2-BRi` (grammar only) and `reference/r5/brand/os-benchmark-broad-arrow.jpg`. Pass: one line weight and grammar; each icon distinct at 24 px; survey motifs; no hexes. IP-clause.
- **A-dialogue-lower-third** (action) — pass: box bottom ≥ 0.88 H and top ≥ 0.70 H; width ≤ 0.55 W; ≤ 3 lines; A-ui-contrast holds.
- **A-ui-words-look** (action) — pass:
  - across the DOM text of every look-gate frame, 0 case-insensitive matches of `\b(varl|vazi|vavi|lessons of the valley|horizon|spinoff|new chapter|watchers?|corrupt\w*|shock arrow|camp(fire)?s?|specter)\b` (every term wrapped in `\b`, so "horizontal" and "campaign" do not match);
  - A-ui-words-all PASS.
- **A-play-engaged-plate** (action, W2) — 3 `herd` + 1 `heavy`, hit the heavy → pass:
  1. exactly 1 top-centre plate within 120 ms, 32–36 % W, centred within 8 px;
  2. its ◆ centred within 6 px above, within 6 of the lamp colour;
  3. ≤ 2 other plates ≤ 140 px;
  4. overlap with the engaged box ≤ 5 %, or opacity ≤ 40 %;
  5. ghost drain 0.55–0.65 s;
  6. Chakra Petch and Plex fonts;
  7. A-ui-words 0;
  8. HUD CPU ≤ 0.15 ms p95.
- **V-play-engaged-plate** (visual) — against `#5-2` and `#2-MR`, and `reference/r5/shell-ui/glass-tokens.png`. Pass: the bar sits top centre and reads at a glance; the machine stays fully visible below it. FAIL: Horizon's red machine bar with a level. IP-clause.
- **A-play-stealth-read** (action; F-4) — 19:45, crouched in reed 18 m from a patrolling `sentry`, perception staged at 0 / 50 / 100 % → pass (clauses 1–4 read the compass ◆ pip, not a glyph over the Instrument):
  1. pip fill 0 / ≈ 50 / 100 % (± 5);
  2. pip colours within 6 of the calm, wary and hostile lamps;
  3. each pip within 24 px of its Instrument's bearing on the compass strip;
  4. ≤ 4 filling pips, none filled at 0 % perception;
  5. corner luminance 5–8 % below standing, centre within 1 %;
  6. A-ui-words clean; A71d's no-overlay clause holds; 0 glyphs over Instruments (A-ui-ip-geometry 7).
- **A-ui-ip-geometry** (action) — HUD, every hub tab, the Kit Rack and the character page at 1600×900 → pass:
  - (1) 0 clip-path polygons with a non-axis-aligned edge;
  - (2) 0 six-vertex shapes at 120° ± 10°, icons included;
  - (3) border-radius ≤ 2 px except discs by role (skills nodes, compass chip, broad-arrow ring), counting SVG and canvas circles;
  - (4) the Kit Rack is a ≤ 180° arc at the right edge with timeScale 1.000;
  - (5) every glow, focus, accent, select or highlight colour ≥ 20 ΔE2000 from Horizon's five;
  - (6) 0 `backdrop-filter` in play;
  - (7) exactly 1 currency readout (salt), 0 LV/LEVEL/XP readouts, 0 glyphs over Instruments.
- **V-ui-ip** (visual) — against `#2-MR` (placement and legibility only) and `reference/r5/shell-ui/glass-tokens.png`. FAIL on any hexagon, notched corner, full radial wheel, violet or teal glow, or holographic overlay. IP-clause.
- **J-glass-slab-cost** (action, ✂, ultra) — pass: ≤ 0.25 ms by the J-overlay-gpu difference method; ≤ +4 draws; the RT row present only on ultra; A-ui-contrast and A90 PASS.

### progression (W3)

- **A-skills-net** (action) — pass:
  - ≥ 3 nodes drawn as circles, 0 six-vertex polygons;
  - every node has ≥ 2 edges, closing ≥ 1 triangle;
  - the detail column takes the right 32–40 %; footer count and two buttons present;
  - 0 px at 160–185° with sat > 0.4.
- **V-ui-skills-net** (visual) — against `#1-BC` (layout only) and `#3-UI` (hex tree as a **counter-example**), and `reference/r5/shell-ui/glass-tokens.png`. Pass: a node net centre-left with one selected node, a detail column right, points bottom-left, two actions bottom-right, reading as a survey net of triangles. IP-clause.
- **A-ip-progression** (action) — pass:
  - (1) the hub has 0 strings matching `/skill points?|skill tree|level up|\bLV\b|\bXP\b|purchase/i`;
  - (2) exactly 3 certifications (Transect, Ballast, Bearing), each naming its survey act;
  - (3) the Steady card reads "4 s", never "cooldown";
  - (4) 3 Tiller kills change every progression counter by 0.
- **A-first-hour** gains (L-11): a New Game starts at 07:00 in Saltrow, and with `env.clock = 'golden'` the 0:55 beat ("calima at noon", bible §8.9) falls at 12:00 ± 0:30.

### traversal (new; W3–W4)

- **A-kite-flight** (action; input-driven, R31) — pass:
  - (a) jump from ≥ 4 m and press jump again after ≥ 0.35 s airborne with ≥ 3 m clearance → open within 0.35 ± 0.05 s; 0 opens with < 3 m clearance;
  - (b) `windAt` forced to 0: air speed 7.5 ± 0.3 m/s, sink 1.5 ± 0.1 m/s, glide 5.0 ± 0.4;
  - (c) trade 5.5 m/s from 045: ground glide 6.0–7.0 flying toward 225°, 3.0–4.0 toward 045, 4.7–5.3 crosswind;
  - (d) a scripted pass along a windward slope ≥ 25° within 40 m below gains 10–25 m and never exceeds launch + 25 m;
  - (e) calima or squall: 0 opens in 10 attempts;
  - (f) landing at ≤ 3 m/s vertical → 0 damage; fold at 12 m → today's fall rules;
  - (g) while open, Plumb and Sonde detection range ×2 ± 0.1 through the one traversal-owned `detectMul` filter keyed by the `sentry` and `spotter` roles (negative control: ×1 furled);
  - (h) attack and aim inputs ignored while open;
  - (i) the kite is saved as unlocked (A65);
  - (j) ≤ 1 draw + 1 caster open, 0 extra furled; ≤ 1.2 k tris; CPU ≤ 0.05 ms; A-stow-clearance passes with the roll.
- **A-kite-inert** (action) — with the kite never opened:
  - the movement suite (A2–A19 movement rows, A31b/d/e/f, A32b, A-climb-1m, A-slide, A-ride-hook, A-player-mods, A13 5/5) passes at its bars;
  - a 60 s scripted traversal gives a position and state digest identical to the pre-grant build;
  - the G-kite diff stays inside its line budgets.
- **A-kite-ip** (action) — pass:
  - 0 emissive kite pixels;
  - planform from above shows ≥ 2 rectangular cells (rectangularity ≥ 0.85 each);
  - front-silhouette IoU against a single-delta-wing mask ≤ 0.5;
  - 0 traversal strings matching `/\b(glid(e|er|ing)|shieldwing|wings?)\b/i` (scoped to traversal strings; the old `/wing/i` matched "following", "showing", "drawing" and "swing"); the UI says KITE, FLY, FOLD.
- **V-kite** (visual; a 3-frame strip at 80 ms) — mid-flight over the coast at 18:45 from the P-11 rig, against `#5-8` (mood only; its membrane wings are a **counter-example**), `#1-MR` and a licence-clean box-kite photograph added under `reference/r5/traversal/` (Q8). Pass: a cane-and-sailcloth box kite with visible spars and cells and cloth flutter; Brea hanging from the crossbar; the sea, stacks and haze below. FAIL: any wing shape, glow or canopy on her. IP-clause.
- **A-play-vista-idle** (action) — the Ring ridge gatePlace, idle 4 s facing out → pass:
  1. boom 4.2 ± 0.1 m in 2.3–2.8 s;
  2. Brea 18–28 % of height, |NDC x| of centroid 0.25–0.5;
  3. horizon at 40–55 %;
  4. any input restores chase within 0.45 s;
  5. 0 activations with an Instrument wary or hostile within 60 m.
- **V-play-vista** (visual) — against `#1-MR`, `#5-1` and `reference/r5/gates-perf/ridge-skyline.jpg`. Pass: a small figure from behind in a side third, the island and the Ring beyond. IP-clause.

### orchestrator and brand (IP; W1 now, re-graded at every exit, final at W4)

- **A-ip-marks** (action) — pass:
  - (1) `git grep -i -I -E "zero ?dawn|chapter in the horizon|horizon.{0,3}spin.?off|callma"` over src/**, public/**, index.html, README.md and package.json: 0 lines in string literals now, and 0 including comments at W4 (baseline: 1 comment, meleeLayer.js:206);
  - (2) namecheck `--player` named reading: 0 Horizon / Zero Dawn hits on title, loading, pause, credits and any end card;
  - (3) the lockup holds 2 graphic elements and 1 text node;
  - (4) V-logo's FAIL clauses hold.
- **A-ip-copy-nov6** (action) — pass:
  - (1) a fixture of the image→replacement pairs from §8 (`tools/lint/fixtures/nov6-pairs.json`, a guard area): named hits on replacements 0, and graded(new) ≤ graded(old) for every pair;
  - (2) live build, named reading: 0 hits for {Horizon, Zero Dawn, Watcher(s), Corrupted, Corruption, Blight, Shock, Specter, Apex, Seeker, Spear, Camp, Campfire, Varl, Vazi, Vavi, Lessons of the Valley}, each PENDING only inside its owner's file until that owner's exit (settlements W2, shell-ui W2, combat-kit W2, progression W3, armory W3);
  - (3) the graded ratchet non-increasing.
- **A-lexicon-nov6** (action) — pass:
  - (1) Campfire, Vazi, Vavi, Glider, Lessons of the Valley, Skill Point, Skill Points, Tall Grass, Stealth Grass, Red Eye and Shock Arrow are each flagged on a planted string (11/11);
  - (2) in a throwaway root: a 256 px crop of `#1-TR` makes ip-scan FAIL with "direction-reference"; a LICENSES row naming kevin-nov6 is flagged; a reference MANIFEST row naming kevin-nov6 is class "refused";
  - (3) `A-no-horizon-terms-code` rises once by exactly 17 new pairs at the R66 commit, each inside an existing scheduled area entry, and is non-increasing after;
  - (4) A-ui-words flags every new alternative.
- **A-ip-direction-absent** (action) — pass:
  - (1) no file in the repo working tree (tracked and untracked-not-ignored) or in any lane worktree (plan §0 rule 10) matches the sha256 of the four image files: `kevin-nov6-keyart.jpg` (860d7e9f), `kevin-nov6-board.jpg` (f2694e04), `kevin-nov6-keyart.webp` (aa1c880d) and `kevin-nov6-board.webp` (b5c48125);
  - (2) dHash-64 of every raster ≥ 64 px against the 2 images and 20 panel boxes: minimum Hamming distance ≥ 11, exempting gate renders that carry a run-id and git-SHA sidecar (our own frames converge on the panels as the look improves: `review/brea-closeup-day-nov6-wip.jpg` is already 12 from 1-MC);
  - (3) `git log --all --name-only`: 0 paths matching `/kevin-nov6|keyart/`.
- **A-judge-ip-clause** (action) — pass:
  - (1) 100 % of V-rows citing `ext:kevin-nov6-*` carry `IP-clause`, and the judge prompt template carries its verbatim sentence;
  - (2) 100 % name ≥ 1 `reference/r5/**` file with a MANIFEST row;
  - (3) tracked docs/** and reference/**: 0 image embeds or links resolving to a kevin-nov6 file; citations match `ext:kevin-nov6-(keyart|board)\.jpg@[0-9a-f]{8}` or `ext:kevin-nov6-(board2|armor|stills)\.md@[0-9a-f]{8}`;
  - (4) 0 asset provenance strings naming a direction file.
- **A-no-lava** (action) — the emissive-only pass on the Malpaís and Caldera vistas with fire-tagged meshes exempt → pass: terrain, rock and landmark emissive 0; each wellhead ≤ 0.5 % of the frame; steam L\* ≥ 70; A-look-map-bake's caldera clause; V38-title's live-lava FAIL clause on every title, loading and menu backdrop.
- **A-keyart-sun** (action) — pass: for title, menu, loading, pause and any `marketing`-tagged frame, a large or colossal Instrument in the frustum requires sun elevation ≥ 25° or calima; 0 violations.
- **A-brea-ip** (action) — pass:
  - (1) sheet strings: age "31", affiliation containing "Pan Houses", 0 named hits (Seeker, Spear);
  - (2) the emissive-only pass of Brea and kit at full draw: 0 emissive apart from the alidade glint (≤ 0.05 % of the frame) and the Datum lampglass;
  - (3) V-brea-one-glance 5/5 in every rung.

---

## 8. IP list

### 8.1 Never copy (from the images)

| element | where | why |
|---|---|---|
| "A HORIZON ZERO DAWN SPINOFF", "A NEW CHAPTER IN THE HORIZON" | 1-TL; 2-F; 4-BR | Sony's trademark used as a claim of affiliation |
| thin wide-tracked CALIMA with a 4-point star and a tracked sub-line ("THE ISLAND REMEMBERS") | 1-TL, 2-TL, 1-BR, 3 | Horizon's logo trade dress (bible §11.1). Kevin keeps the phrase (R66 p); what stays banned is the dress: thin wide-tracked caps, a centred tracked sub-line between rules, a 4-point star. "REMEMBERS" is excepted from the "Ember" lint hit in that one string |
| two publisher-style emblems under COMING SOON | 1-BR | unknown origin; never drawn or traced |
| red single-eyed animal or biped machines; glowing red chest cores; "Watchers" bird drones | 1-BL, 2-TR, 3-ENEMIES, 5-2/4/5/9 | derived from Guerrilla's designs (reds 11.2–14.5 ΔE2000 from #ff2413) |
| hooded, cloaked spear soldiers as Levelers | 2-TR, 3-ENEMIES | an Eclipse-like sect read |
| membrane-wing glider | 5-8 | Forbidden West's Shieldwing |
| crouching in tall red/gold grass among red-eyed patrols; a triangle detection marker | 5-4 | Horizon's signature stealth combination |
| "SHOCK ARROW — stuns machines and interrupts their routines"; the crafting card with a violet hex glow | 2-BM, 5-6 | Horizon's ammo and craft card |
| "THE CORRUPTION — a spreading blight"; "corrupted machines" | 2-BL, 2-TR | the HZD Corruptor, HFW's Red Blight |
| "Specter", "Apex enforcer", "seeker", "spear", "Camp", "Ember", "Spire" | 4, 3, 2-ML, 1-BR, 2-MC | lexicon-exact Horizon terms |
| "LESSONS OF THE VALLEY / Speak with Varl/Vazi/Vavi at the campfire" | 1-TR, 2-MR, 3-UI, 5-3 | our own retired Round-4 text plus a Horizon NPC name |
| hexagon skill nodes, notched smoked-glass corners, holographic books, Focus-violet glows (ΔE 12.7–18.8 from #9B6BFF), a full centre radial weapon wheel with slow-motion | 1-BC, 2-BL, 2-MR, 3-UI, 5-6 | Horizon UI trade dress (bible §11.1) |
| skill points, PURCHASE, level ring, "Cooldown: 45s" on Steady | 1-BC, 5-3 | Horizon's progression |
| live lava, an erupting volcano, a glowing caldera | 1-BR, 2-MC, 2-BR, 3-MAP | the Burning Shores line (bible §2.1) |
| a giant walker against a low sun in presentation frames | 1-BL, 5-2, 5-5 | Horizon's key-art staple |
| "Age 20, Affiliation None, seeker" for Brea | 2-TC, 3-BREA | drift toward Aloy |
| grey/green/blue/purple/gold rarity tiles; storm-circle minimap | (Epic/Fortnite) | Fortnite trade dress |
| any pixel of any panel in the repo, in LFS or artifacts, or as input to generative (img2img), tracing, image-to-3D or style-transfer tools (panel statistics as numbers in refs.json are allowed, R66 a) | all | no licence; Sony marks; class "refused" |

### 8.2 Translate as

| image element | CALIMA translation |
|---|---|
| golden hour, violet shadows, haze, shafts, cumulus, sea glitter | L-01…L-11, W-09: our own grade, keys and recipes (no Nubis code, no OCIO configs) |
| needle spires and mesas, "Obsidian Spire" | the Roques, offshore stacks, strata cliffs (W-03, W-04); never named "Spire" |
| the broken ring on a ridge | the Sounding Ring as a survey gyroscope, upright (W-05) |
| Ninewalls drawn as a tree | the walled settlement; the tree informs only the dragon tree's silhouette (R66 o) |
| glowing core on a machine | lamp, vial, firebox or hot hub in its bible colour (I-01) |
| big machines towering | taller Screed and Kiln (Q3) + a look-up camera (P-03) |
| Watchers | the Sonde (tethered survey balloon) |
| Screed "corrupted machines" | "Walking graders. They level all error to the Datum Line." |
| Conduit "Apex enforcer" | the Transit (colossal theodolite); the name Conduit is dropped |
| Levelers | kaolin mask, banded sash, staff with a lamp; never combatants (C-11) |
| Shock Arrow | the **Dust-Puff** arrow and Dust Pot: "Clouds an Instrument: its lamps go blind" |
| crafting screen | the **Making ledger** (F-2), MAKE not CRAFT |
| campfire rest and save | the **Brazier** at cisterns (F-1); never a travel node |
| glider | the **Survey Kite**, a cane-and-sailcloth box kite flown on the trade wind (F-3) |
| tall-grass stealth | **Reed cover**: carrizo and salt rush (and today's marram colonies) that hide you while the wind moves them; the golden meadow never does (F-4) |
| detection triangle over heads | no HUD glyph over Instruments: the lamp in the world (iris, rhythm, colour) and the compass ◆ pip filling in state colour, plus the 6 % vignette (F-4) |
| Specter armour | **VEIL** (Pit Wraps re-cut with hood, veil and goggles, rung 4; Q4) |
| Arcane, "Channel the ancients" | Oxblood Lamellar, "Read the old marks": vernier engravings, a brass alidade rose |
| Celestial with crystal-violet glow | the Datum Plate, "Fix by the stars": an ephemeris engraving and a calm lampglass |
| circuit/glyph embroidery | graduated-tick embroidery (the family mark) |
| dark glass UI | dark violet glass with right angles, registration ticks, survey motifs, lilac selection (U-01) |
| radial wheel at the right edge | the Kit Rack as a protractor half-ring in real time (U-14) |
| hex skill tree | Field Book certifications as a triangulation net (U-13) |
| white diamond quest marker | the benchmark broad arrow; ◆ is reserved for Instruments in lamp colour |
| enemy bar with a diamond | the levelling-staff plate with the ◆ compass marker (P-10) |
| painted world map with "Camp" | W-14 bake + U-10 with BRAZIER, BENCHMARK, TRIG PILLAR |
| violet-glowing arrow tip | orchil fletching + a warm glint; only element ammo glows, in its element colour |
| "Ash and Ember" | "Ash and Cinder" |
| Malpaís with lava | cold aa and pahoehoe, fumarole steam, man-made wellhead glow (W-13) |
| quest "Lessons of the Valley" in look frames | a bible §8.9 beat staged by shell-ui's `hud.stageNote` under `?shot=1` (U-17) |

### 8.3 Already canon (fine to show)

Brea, Orchil, the Pans, Pan Whites and the Pan Houses, Saltrow, Crescent Holds, Ninewalls (walled), Malpaís (cold),
the Sounding Ring, the Kiln Yards, the Datum and the Datum Line, Salt-Pan Reckoner, the Instruments (Tiller, Plumb, Peg,
Gauge, Sickle, Spindle, Davit, Sonde, Screed, Kiln, Dredge, Transit), Levelers (as non-combatants), SOIL CORE,
TRANSECT, LAMP CALM / WEAK, the Sabina Bow and Reed Arrow, the Shepherd's Lance, salt as currency, cord, the cistern,
benchmarks and trig pillars, the calima, Steady (a 4 s breath), the Kit Rack (real time), Field Books
(certifications), Seized (joints locked by Brine, no multiplier), elements Cinder, Brine and Dust, the generic menu
and legend words (CONTINUE, NEW GAME, SETTINGS, MAP, INVENTORY, JOURNAL, WAYPOINT, SURVEY POINT, DANGER), the compass
strip, the health bar as a levelling staff, the compass-rose medallion, and armour tier words Starter, Scout,
Reckoner, Pioneer, Vanguard, Arcane and Celestial as labels.

---

## 9. Questions only Kevin can answer, and Kevin's actions

### 9.1 Kevin's answers (Nov 6, binding under R66 q)

1. **Light: golden-weighted.**
   - The clock is `env.clock = 'golden'`: low sun about 34 % of play, night about 20 %.
   - The title opens at 18:40 golden, with calima kept as weather. 17:45 is used for a Continue with no saved hour and for the look places.
   - A New Game still starts at 07:00, and the 0:55 "calima at noon" beat stays at 12:00 ± 0:30.
   - V-sky-trade's drama clause is graded at trade noon only.
   - Bible §9.8's title light is amended.
2. **Budget fallback: 60 fps.**
   - The interim bars are W1 exit vista ≤ 17.0, herd ≤ 20.0 and fight ≤ 17.0 ms. From the W2 exit the bar is 14.0 ms on all three, and A-gpu-tier-pans ≤ 13.0.
   - If the shipped `high` tier still misses 14.0 ms after the GPU-recovery track (L-18's fixes, W-01, I-04, L-10, L-15), the bar for the vista and the fights becomes **16.7 ms** at full sharpness: DPR 1.25, with the median `renderScale` ≥ 0.95. The herd follows the same rule.
   - A look item that misses even 16.7 ms stays off on `high`, and its V-row reads FAIL-deferred.
3. **Instrument heights: grow the big ones.**
   - Screed 3.0 → 3.8 m and Kiln 4.0 → 5.5 m, footprints unchanged, with the P-03 look-up fight camera. Bible §7.4 is amended.
   - The Dredge and the Transit tower like 1-BL and 5-5; small kinds stay nimble.
4. **Armour rung 4: VEIL.** Pit Wraps is re-cut with a hood, veil, goggles and a long coat. Fog Felts and Calima Veil leave the ladder (a possible W4 Mistfold stretch), and Dust-sight, Sure-foot, Fog-mend and Thrown whistle retire; the base whistle stays.
5. **Malpaís: cold.** Aa and pahoehoe lava fields, fumarole steam, and only the man-made wellheads and kilns glow.
6. **No minimap.** The compass strip only.
7. **Tagline: kept in game**, in R66(p)'s treatment, which is not Horizon's lockup.
8. **Reference downloads: yes, public domain or CC0 only**, through `tools/r5-refs`. Each is logged with its source URL, licence and SHA in the refs manifest, used as a grading reference only, and never shipped or committed as an asset. V-kite's box-kite photograph clause is graded once fetched.

### 9.2 Kevin's actions (agents cannot do these)

- The references are never committed anywhere (R66 n).
- Save images 3–5 (the second board, the armour board and the stills) as images beside images 1–2 in the direction folder. Until then their panel clauses are written criteria, not likeness (§0.2).
- Before anything public (image 1 ends on COMING SOON): plan §11 decision 2 (make the public repo `Horizon-Zero-Claude` private, or start a fresh CALIMA repo; `package.json` still carries the name), and decision 3 (the CALIMA trademark search and clearance for the Claude spark as a logo). Both are release-blocking.
