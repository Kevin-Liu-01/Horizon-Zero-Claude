# Machines Reference — Watcher (+Redeye), Sawtooth, Behemoth, Thunderjaw

Source of record: horizon.fandom.com machine pages (Watcher, Redeye Watcher, Sawtooth,
Behemoth, Thunderjaw, Machine, Disc Launcher), fetched 2026-08-04. All damage numbers,
HP, levels, and trigger ranges below are the actual Horizon Zero Dawn (HZD) values from
the wiki's stat tables unless marked (est.) or (HFW). Ranges are in meters.

---

## 0. UNIVERSAL RULES (apply to all machines)

### 0.1 Eye/sensor state colors (exact, canonical)
| State | Eye color | Meaning | Behavior |
|---|---|---|---|
| Docile / unaware | **BLUE** | default state | performs normal function (patrol, graze, mill about) |
| Alarmed / searching | **YELLOW** | disturbance detected | stops task, scans/searches area until threat found or timeout, then returns to blue |
| Combat | **RED** | threat located | attacks |
| Attack telegraph | **flash** (bright white/red blink) | about to attack | eyes flash briefly right before every attack — this is the player's dodge cue |

- Corrupted machines additionally drip red-black corruption FX; not needed for demo.
- Override (not in scope) turns the eye a cyan/blue-purple.

### 0.2 Component rules
- Weak points take multiplied damage. Wiki lists them as "hitting deals greater damage";
  in-game feel is roughly **2x for exposed weak points, ~3x for Heart/Data Nexus/Eye**
  (est. — tune to feel).
- **Tear damage** rips components OFF without needing to deplete HP. Torn components fall
  to the ground; canisters and weapon components can be **looted where they fall**.
- **Elemental canisters explode** when shot with their matching element (Blaze canister +
  fire arrow = fire explosion damaging the machine and igniting it; Freeze canister +
  freeze; Power cell + shock = shock explosion that **stuns** the machine).
- Destroying a weapon/utility component **permanently disables the attacks/abilities
  that use it** (see per-machine tables).
- Armor plates cover weak points; plates can be shot off individually (Thunderjaw has 93
  destructible plates in the real game) to expose what's underneath.

### 0.3 Detection & stealth (shared model)
- Machines see in a forward vision cone; tall grass breaks line of sight (crouched).
- Escalation: unseen → suspicion builds (indicator fills white→yellow) → YELLOW search
  at last-known position → RED combat on confirm. De-escalates back down after losing
  the player for ~10–20 s (est.).
- Whistle lures the nearest machine to investigate (yellow state).
- **Watcher alarm call**: a Watcher that confirms a threat rears up, eye red, emits a
  loud klaxon — ALL nearby machines immediately go yellow/red and converge on the
  Watcher's position. Watchers are deployed exactly for this; killing them first is the
  core stealth loop.
- **Thunderjaw radar** detects hidden players regardless of movement (grass does not
  protect) — unlike normal machine vision. Destroying the Radar removes this.
- Thunderjaws also investigate the ORIGIN of a bow shot, not the impact point.

### 0.4 Death (visual, all machines)
- Killing blow: machine staggers, legs buckle, collapses with a heavy metallic crash.
- Eye/sensors fade from red to dark (light dies out).
- Blue-white electrical arcs/sparks spit from joints and wounds for ~2–4 s, brief smoke.
- If death came from a canister detonation, add an elemental explosion (fireball for
  Blaze) at the canister location before the collapse.
- Corpse remains lootable (interaction glow).

---

## 1. WATCHER (+ REDEYE WATCHER)

### 1.1 Stats
| | Watcher | Redeye Watcher |
|---|---|---|
| Class | Recon | Recon |
| Level (HZD) | 5 | 10 |
| HP (HZD) | **90** | **200** |
| Elemental weakness | none | none |
| Resistances | none | none |
| Size | small biped; chassis length slightly longer than a human is tall (~2 m body, head ~1.6–2 m up) (wiki + est.) | same chassis |

### 1.2 Silhouette / visual identity
- Small theropod (alvarezsaur-like): big head on long flexible neck, thin springboard
  legs on offset hip bearings, flexible tail, tiny/no forelimbs.
- **White armor plating** on head, body, hips; dark alloy musculature underneath.
- One huge central ocular lens dominating the face — THE identifying feature. Lens is
  the state light (blue/yellow/red).
- Scanning idle: stops, cranes neck fully vertical, sweeps head side to side.
- **Redeye differences**: heavier armor crest on head, **three** eyes (large main +
  2 small secondary above/beside), thinner tail angled UPWARD, red-tinted trim. Main
  eye reads red-orange even when docile-blue logic applies (tint the housing, keep the
  state light readable).

### 1.3 Components
| Component | Location | Weakness | On destroy |
|---|---|---|---|
| Body | everywhere | none | — |
| **Eye** | face | **ALL damage types (weak point)** | catastrophic damage: one Sharpshot-class hit to the eye kills a Watcher outright |

No tear-off parts. The eye IS the fight.

### 1.4 Attacks (HZD values)
| Attack | Type | Dmg | Range | Telegraph / behavior |
|---|---|---|---|---|
| Blinding Stun Flash | blind | 0 | 6–11 | eye flares super-bright; blinds/disorients player (screen whiteout ~1.5 s); no damage |
| Energy Blast | explosion projectile | 40 | 0–55 | fires concussive orb; Watcher uses it only when it can't close distance; **Redeye PREFERS this and kites away** (Redeye dmg 40) |
| Head Strike | melee | 75 (Redeye 90) | 4–9 | jumps, head as bludgeon; big miss recovery window (counter opening) |
| Jumping Smash | melee | 75 (Redeye 90) | 6–11 | full-body leap at player; also punishable on miss |
| Tail Strike | melee | 85 (Redeye 100) | 2.5–6 | quick spinning tail bludgeon at point-blank |

### 1.5 Behavior
- Deployed in small packs (2–4) patrolling circuits AROUND herds of terraformers
  (Striders/Grazers) or escorting transports; stop at intervals to crane up and scan.
- On detect: loud alarm → herd flees or turns aggressive; paired combat machine
  (e.g. Sawtooth) converges on the Watcher's position immediately.
- Even alone, attacks on sight (post-Derangement). Clumsy fighter, flanks in numbers.
- Redeye: same patrol logic, but in combat keeps distance and shoots energy blasts.

### 1.6 Death
Small crash, sparks from neck joint, eye light dies. Single Silent Strike or one
critical arrow to the eye kills instantly. Burn state alone kills one (HP is that low).

### 1.7 Browser adaptation (we have ONE rigged watcher)
- We already have the rig — this is our behavior showcase machine. Implement full
  blue/yellow/red eye emissive state machine + alarm call that aggros other machines
  within ~60 m.
- Eye = single sphere/disc weak-point collider, 3x damage, instakill under our
  headshot rules.
- Redeye variant = same rig, retint (red trim), add 2 small emissive eye dots + a
  procedural head-crest plate mesh + tail angled up; behavior swap to kiting shooter
  (Energy Blast projectile with glow trail).
- Essential to fantasy: eye color states, alarm rear-up animation + klaxon, blinding
  flash whiteout, pounce with punishable miss.

---

## 2. SAWTOOTH

### 2.1 Stats
| | Sawtooth |
|---|---|
| Class | Combat |
| Level (HZD) | 15 |
| HP (HZD) | **1,100** |
| Elemental weakness | **FIRE (whole body)** |
| Resistances | none |
| Size | medium/heavyset; smilodon build. Wiki gives no dims; est. ~5 m long, ~2.5–3 m at shoulder (clearly towers over Aloy) |

### 2.2 Silhouette / visual identity
- Saber-toothed cat: massive chest/neck/shoulders, powerful legs, **NO tail**.
- Two curved scimitar-like serrated metal fangs from the jaw — the signature.
- Two eye sensor arrays on the face, each of TWO stacked lenses (vertical pairs).
- Long metal crest ridge along the front of the back; fan of **three long antennae**
  sprouting behind the shoulders.
- Heavy armor on shoulders/head/neck; **Blaze canister glowing in the CHEST**
  (orange glow — aim marker); power cell atop the hindquarters.
- Sound identity: heavy servo whine + deep growls, audible before you see it.

### 2.3 Components
| Component | Location | Weakness | On destroy / notes |
|---|---|---|---|
| Body | everywhere | **Fire** | burn state melts its HP |
| **Blaze Canister** | center chest | **Fire + Tear** | shot with fire arrow → **elemental EXPLOSION** damaging the machine + burn; torn off with tear → falls, lootable Blaze; canister gone = no explosion possible later |
| Eyes | face | all (weak point) | bonus damage |

(Heart is loot, not a targetable component on Sawtooth in HZD.)

### 2.4 Attacks (HZD values) — all melee, it has zero ranged weapons
| Attack | Dmg | Range | Telegraph / behavior |
|---|---|---|---|
| **Berserker Fury** | 300 | 3–10 | multi-hit chain of lunging claw slashes — the "swipe combo"; brief crouch + roar first |
| Claw Swipe | 140 | 7–11 | single lunging swipe |
| Jaw Smash | 140 | 1–8 | single sideways head/jaw swing |
| **Jumping Jaw Smash** | 180 | 16–23 | THE pounce: leaps a huge distance and swings jaw on landing; clear crouch-and-wiggle telegraph, dodge sideways |

Design note: it closes distance extremely fast (rapid sprint + pounce), giving almost
no retaliation window — the fight is dodge-then-punish.

### 2.5 Behavior
- Deployed singly or up to 3, guarding Grazer/Lancehorn herds; patrols circuits around
  the herd and along human travel routes.
- Paired with Watchers: converges instantly on any Watcher alarm.
- Loud growls/servos telegraph its presence.
- **Wounded behavior (great flavor): when heavily damaged it LIMPS, holding up a front
  paw like a cat, panting irregularly.**

### 2.6 Death
Collapses mid-lunge or slumps sideways; sparks from chest wound; if the Blaze canister
was detonated it dies in a fireball and burns briefly.

### 2.7 Browser adaptation (static sculpt)
Attach procedural add-on meshes at documented spots, all tear-off-able:
1. **Blaze Canister** (chest): emissive orange cylinder, slight pulse. Fire arrow →
   explosion (300 dmg to machine + burn DoT est.) + fireball VFX; tear → pops off,
   physics drop, lootable "Blaze". ESSENTIAL — this is the Sawtooth fantasy.
2. **3 back antennae**: thin cylinders, purely cosmetic tear-offs (sparks when shot).
3. **Shoulder/neck armor plates** (2–4 quads): tear off to expose brighter "muscle"
   material that takes bonus damage.
4. **Power cell** (top of hindquarters): small emissive box; shock arrow → shock
   explosion + 3 s stun.
- Fake attacks on the static sculpt by root-motion slides + procedural body pitch:
  pounce = ballistic arc of whole mesh with anticipation squash; swipes = quick yaw
  bursts + claw VFX arc.
- Essential to fantasy: chest canister explosion, pounce with dodge window, fire
  weakness, limping at low HP (drop move speed 40%, add hitch bob).

---

## 3. BEHEMOTH

### 3.1 Stats
| | Behemoth |
|---|---|
| Class | Transport (heavyweight) |
| Level (HZD) | 25 |
| HP (HZD) | **2,700** |
| Elemental weakness | none (HZD) |
| Resistances | **Shock** |
| Size | huge rhino-like quadruped; wiki gives no dims; est. ~10 m long, ~5 m tall |

### 3.2 Silhouette / visual identity
- Rhinoceros bulk; head is one giant pyramidal snout/ram.
- Split mandible jaws with a pair of **rotary grinder tools** between them (its mouth
  is a rock grinder — feeds its shrapnel attack).
- Optical sensors on each side of the snout near the mandibles.
- **Six Force Loaders** (anti-gravity generators): three per side of the huge neck —
  glowing purple-blue discs; they levitate rocks (purple-blue gravity FX).
- **Cargo container**: big cylinder slotted vertically into its belly, held by 2 crate
  holder clamps.
- **Freeze/Chillwater canisters x2**: one on each haunch (cool blue glow).
- **Power cell**: back of the neck. **Antenna array** between the haunches.
- Normally plods slowly; terrifying when it charges.

### 3.3 Components (HZD)
| Component | Location | Weakness | On destroy / notes |
|---|---|---|---|
| Body | everywhere | none | resists Shock |
| **Force Loaders x6** | 3 per side of neck | **Tear** | destroying/tearing them **disables ALL gravity attacks** (boulder throw + gravity purge). Exploding one launches the player several meters (knockback!) |
| **Crate Holders x2** | belly, clamping cargo container | all | destroying detaches the **cargo container** which drops as a big lootable prize (container itself can be accidentally destroyed → loot lost) |
| **Freeze Canisters x2** | haunches | **Freeze + Tear** | freeze arrow → freeze explosion + FREEZE state (machine brittle: takes heavily increased damage); tear off → lootable Chillwater |
| **Power Cell** | back of neck | **Shock + Tear** | shock arrow → shock explosion + **STUN**; tear → lootable Sparker |

### 3.4 Attacks (HZD values)
| Attack | Type | Dmg | Range | Telegraph / behavior |
|---|---|---|---|---|
| **Charge** | melee | 300 | 22–80 | lowers head, paws ground, full-speed ram; long straight run — dodge late sideways |
| **Gravity Boulder Throw** | projectile | 250 | 10–45 | force loaders glow, a boulder levitates up beside it, then hurls flat at player |
| **Gravity Purge** | projectile AoE | 200 area + 150/rock | 0–9.5 | rears in place, a STORM of boulders levitates around its body, then blasts outward in all directions — get out of the bubble |
| Grinding Shrapnel Blast | projectile stream | 35/hit | 8–25 | lowers grinder jaws to the ground, spins them, sprays rock shrapnel in a cone |
| **Quake Smash** | melee shockwave | 250 | 1–15 moving / 15–22 standing | rears up on hind legs, smashes down; forward-travelling ground shockwave + tremor |

### 3.5 Behavior
- Found in convoys (1 Behemoth + 2 escorts) hauling cargo between sites, or milling in
  small groups at its site. Pre-Derangement docile hauler; now attacks on sight.
- Slow plodding walk; surprising sprint speed in combat.
- Its gravity attacks NEED the force loaders — tearing all six turns the boss into a
  charge-and-stomp brute (huge tactical payoff).
- Freeze state is the intended kill accelerator (freeze canisters on its own body).

### 3.6 Death
Momentum crash — usually dies mid-charge or collapses onto its knees then flops
sideways with a ground-shaking thud (screen shake), dust + sparks; cargo container can
survive as loot.

### 3.7 Browser adaptation (static sculpt)
Add-on meshes at documented spots:
1. **Force Loaders x6** (neck sides, 3 per side): emissive purple-blue discs. Tear-off
   with physics; each removal reduces gravity attacks (all 6 gone = disabled). When
   shot they small-explode with player knockback. ESSENTIAL — the visible glow + the
   attack-removal loop is the Behemoth fantasy.
2. **Cargo container + 2 clamps** (belly): destroy both clamps → cylinder drops as a
   big loot pinata. ESSENTIAL flavor for "Transport class".
3. **Freeze canisters x2** (haunches): blue emissive; freeze detonation applies
   "brittle" (+50% damage taken, 8 s est.) with icy shatter VFX.
4. **Power cell** (neck top): shock detonation = 4 s stun (est.).
5. **Antenna** (rear): cosmetic tear-off.
- Gravity attacks: levitate 6–12 instanced rock meshes with purple glow shader around
  the neck, then launch as projectiles; Gravity Purge = radial burst. Quake Smash =
  expanding ring decal + camera shake + damage ring.
- Essential to fantasy: force-loader glow + tear-off disabling, boulder levitation FX,
  charge with ground shake, cargo drop.

---

## 4. THUNDERJAW

### 4.1 Stats
| | Thunderjaw |
|---|---|
| Class | Combat (heavyweight apex) |
| Level (HZD) | 27 |
| HP (HZD) | **6,500** (Redmaw legendary: 8,125) |
| Elemental weakness | none (HZD) |
| Resistances | **Shock** |
| Size | **24 m long, 9 m tall** (dev-confirmed) |
| Real-game stats flavor | 271 animations, **93 destructible armor plates**, 12 unique attacks, 67 VFX, 550k polys |

### 4.2 Silhouette / visual identity
- Bipedal T-Rex: bulky legs, long body, huge counterweight tail.
- Symmetrical weapon layout: **laser emitter in the mouth**, **cannon on each side of
  the jaw (mandibular cannons x2)**, **radar array on the back** (rotating dish/fin),
  **disc launcher above each hip (x2)**.
- Blue-white sensor strips + red glow points when enraged; radar sweeps visibly.
- Footfalls audible from far away (bass thuds); knocks trees over by walking.

### 4.3 Components (HZD)
| Component | Location | Weakness | On destroy / notes |
|---|---|---|---|
| Body | everywhere | none | resists Shock |
| **Heart** | chest, under armor plates | all (weak point) | big bonus damage once exposed |
| **Data Nexus** | on the back (near radar, under plate) | all (weak point) | big bonus damage once exposed |
| **Disc Launchers x2** | above each hip | **Tear** | tear OFF → falls to ground → **player can pick it up as a heavy weapon** (8-round rocket launcher, huge blast, staggers even Thunderjaws; slows player movement; sparking cables trail from it). Removal disables all disc attacks |
| **Cannons x2** | sides of jaw | **Tear** | removal disables both cannon burst attacks |
| **Radar** | top of back | **Tear** | removal disables its see-through-stealth scan |
| **Tail** | rear | **Tear** | removal disables Tail Slam/Swipe |
| **Blaze Canisters** | underside/flank (verify on model) | **Fire + Tear** | fire arrow → fire explosion + burn; tear → loot Blaze |
| **Freeze Canisters** | neck/throat area (verify on model) | **Freeze + Tear** | freeze arrow → freeze explosion + brittle state |
| **Power Cells** | rear back near tail base (verify on model) | **Shock + Tear** | shock arrow → shock explosion + stun |

### 4.4 Attacks (HZD values) — 12 total: 6 melee + 6 ranged
Melee:
| Attack | Dmg | Range | Telegraph / behavior |
|---|---|---|---|
| Bite Attack | 250 | 11–17 | head rears back then snaps forward |
| Rushing Bite | 250 | 18–33 | short charge into a bite lunge |
| **Charge** | 275 | 20–80 | lowers head, full-speed ram across the arena |
| Foot Stomp | 290 + 50 | 0–7 | stamps if you hug its legs |
| Tail Slam | 300 | 6–16 | lifts tail, vertical slam, ground shock |
| **Tail Swipe** | 300 | 17–27 | rotates 180° and whips tail in a wide arc — killed Sunhawk Ahsis in lore |

Ranged:
| Attack | Type | Dmg | Range | Telegraph / behavior |
|---|---|---|---|---|
| Cannon Burst (lead-up) | rapid projectiles | 60/hit | 20–80 | cannons walk fire from the ground up toward you |
| Cannon Burst (side-to-side) | rapid projectiles | 60/hit | 20–80 | horizontal spray sweep |
| Disc Launcher Barrage | explosive discs | 130/disc | 20–80 | launches a sequence (~12 in HFW) of arcing discs that rain down |
| Disc Launcher Homing | explosive discs | 130 | 20–80 | discs track the player then dive |
| Disc Launcher 360 | explosive discs | 130 | 5–25 | defensive ring of discs around itself when you're close |
| **Laser Sweep** | laser fan | 200 + 130/s | 25–60 | mouth glows, fires a FAN of ~9 beams sweeping across the ground (HFW gates it below 40% HP — good enrage cue) |

### 4.5 Behavior
- Solitary apex; mills around its site when undisturbed, footsteps as early warning.
- Radar detects players in grass regardless of movement (until radar destroyed).
- Investigates the shooter's position (origin of shots), not impact points.
- The canonical fight arc: tear off a Disc Launcher → pick it up → melt the Thunderjaw
  with its own gun. This is THE most famous interaction in HZD — non-negotiable.

### 4.6 Death
Long stagger, one leg buckles, then the full-body collapse — 24 m of metal hitting the
ground with a massive dust ring, screen shake, spark fountains from neck/chest, eye
and running lights fade out. If a canister detonated, elemental explosion first.

### 4.7 Browser adaptation (static sculpt)
Add-on meshes (all tear-off, physics fall, lootable):
1. **Disc Launchers x2** (one above each hip): boxy launcher meshes with emissive
   vents. Tear (≥1 tearblast-grade hit) → detaches, drops, becomes an equippable heavy
   weapon: 8 shots, slow explosive projectiles, big blast + stagger, player move speed
   -35% while carried, sparking cable VFX. ESSENTIAL — the signature moment.
2. **Radar** (back): rotating fin; while alive, pulses that reveal the player in grass
   (stealth immunity within ~40 m); tear off to restore stealth. Essential #2.
3. **Cannons x2** (jaw sides): tube meshes; tear off to remove cannon attacks.
4. **Tail tip section**: tear off to remove tail attacks (swap to shorter tail stub).
5. **Heart plate** (chest): armor plate that pops off first, exposing an emissive
   heart weak point (3x damage).
6. **Blaze/Freeze canisters + power cells** (belly/neck/tail base): emissive
   orange/blue/yellow pods with matching elemental detonations.
7. **A few generic armor plates** (nod to the 93 real ones): 6–10 quads that shear off
   under tear, revealing brighter under-mesh.
- Attacks on static sculpt: whole-mesh root motion (charge, 180° tail spin as fast yaw
  + damage arc), mouth laser = animated beam fan with ground scorch decals, cannon
  tracers, disc projectiles with smoke trails + homing flag.
- Essential to fantasy: disc launcher tear-off-and-use, laser sweep at low HP, radar
  vs stealth, tail swipe, sheer scale (24 m — check our sculpt scale!).

---

## 5. DEMO HP / SCALE LADDER (direct from HZD)
| Machine | Level | HP | Relative |
|---|---|---|---|
| Watcher | 5 | 90 | 1x |
| Redeye Watcher | 10 | 200 | 2.2x |
| Sawtooth | 15 | 1,100 | 12x |
| Behemoth | 25 | 2,700 | 30x |
| Thunderjaw | 27 | 6,500 | 72x |

Player attack damage flavor (for calibration): machine melee hits on Aloy range 40
(Watcher blast) → 300 (Tail Swipe); Aloy's arrows in the real game do tens-to-hundreds
per shot. Keep our numbers proportional to this ladder.

---

## PRIORITY — what matters most for the fantasy

1. **Eye state colors (blue→yellow→red + pre-attack flash)** on every machine. This is
   the single most recognizable Horizon system and costs only emissive swaps.
2. **Thunderjaw disc launcher tear-off → pick up → use against it.** The franchise's
   signature moment; without it the Thunderjaw is just a big HP bag.
3. **Watcher alarm loop**: patrol, scan crane, klaxon that aggros nearby machines —
   makes stealth meaningful and sells machines as an ecosystem.
4. **Sawtooth chest Blaze canister** fire-detonation (explosion + burn) and its
   fire-weak body — teaches the elemental-component language on the first real fight.
5. **Component tear-off with physics + loot** everywhere (canisters, antennae,
   plates): the "machines are made of parts" feel is Horizon's combat identity.
6. **Behemoth force loaders + gravity rock attacks** (glowing purple levitation) and
   their removal disabling those attacks — the clearest attack-removal payoff.
7. **Telegraphed attack tables above** (ranges + windups): pounce (16–23 m), charge
   (20–80 m), gravity purge bubble (9.5 m) — dodge windows make the combat feel real.
8. Enrage cue: Thunderjaw laser sweep only below 40% HP.
9. Wounded flavor: Sawtooth limp at low HP; Thunderjaw radar sweep FX.
10. Death choreography: stagger → collapse → sparks → light fade (+ canister fireball).
