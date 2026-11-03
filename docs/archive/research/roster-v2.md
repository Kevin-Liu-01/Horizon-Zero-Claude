# Machine Roster v2 — Full HZD Bestiary Implementation Spec (Round 3 research)

Research base: Horizon Wiki per-machine pages, Guerrilla/PlayStation Blog "Making of HZD's Machines",
GDC Animation Bootcamp "Bringing Life to the Machines of HZD", Wikipedia "Machines (Horizon)".
Damage numbers are HZD internal units (Aloy ~200 HP baseline); ranges in meters.
Sizes except Thunderjaw's (official: 24m long, 9m tall) are estimates from wiki proportion statements.

## 1. Guerrilla's Machine Design Language

- **Robot megafauna, not literal animals.** Each machine reads as a recognizable animal archetype so
  players instantly infer behavior. Watchers = "security camera on legs".
- **Layered build, inside-out:** dark endoskeleton → glossy black synthetic-muscle cable bundles
  (fiber-optic/hydraulic ropes at joints, neck, haunches) → light grey-white armor plates lacquered
  over vitals. Plates large/flat/matte; muscle dark and specular. Weak components sit in muscle gaps.
- **Big shootable surfaces + removable parts.** Every machine is a loot-piñata of detachable
  components — separate meshes that pop off with physics.
- **Readable status, minimal light noise:** one glowing sensor "eye" (or array) carries state color.
  Normal chassis = white/grey with blue-white lights; corrupted = red-black tendrils, red glow, smoke.
- **Telegraphing:** every attack = distinct wind-up pose → strike. Wind-ups: 0.4–0.7s (small),
  0.8–1.5s (medium), 1.5–2.5s (heavy/ranged charge-ups, glow building on the weapon).
- **Audio identity:** layered animal + mechanical; idle chirps/warbles, distinct alert shriek per
  species that pulls other machines to the caller.

## 2. Global AI / Behavior

| State | Eye | Behavior |
|---|---|---|
| Unaware | Blue-white | Patrol loop / graze / scan pauses |
| Suspicious | Yellow | Stop, face stimulus, investigate, scan (crane neck / sonar pings) |
| Alerted | Red | Attack or flee per class; broadcast alarm → nearby machines converge; herds stampede |
| Overridden | Teal | Fights other machines; mountable (Strider/Broadhead) |
| Corrupted | Red + smoke | Hyper-aggressive, attacks everything, immune to override |

**Herd doctrine:** Acquisition machines work heads-down, rely on escorts. Recon (Watchers, Longlegs)
walk circuits and alarm-call; Combat (Sawtooth/Ravager) converge on alarms. Acquisition flee when
alarmed (one rearguard fights); combat always engage.

**Grouping:** Herds: Strider 5–15, Broadhead, Grazer (+2–4 Watcher escort ±1–3 combat). Packs:
Scrapper 2–4, Watcher 2–4. Flocks: Glinthawk 3–4. Convoys: 1–3 Shell-Walkers or 1 Behemoth + escorts.
Solo: Thunderjaw, Stormbird, Tallneck (fixed loop). Snapmaw: 2–4 basking per site.

## 3. Roster Overview

| Machine | Class | Tier | Animal | Body plan | Size (H×L) | Group |
|---|---|---|---|---|---|---|
| Watcher | Recon | 1 | Small theropod | Digitigrade biped, big head, long neck+tail | 1.8×2m | 2–4 + herds |
| Strider | Acquisition | 1 | Draft horse | Quadruped, hooves | 1.8×3m | Herds |
| Broadhead | Acquisition | 1 | Longhorn bull | Quadruped, wide horns | 2×3.5m | Herds |
| Grazer | Acquisition | 1 | Deer/gazelle | Quadruped, springy legs, rotor antlers | 1.6×2.8m | Herds |
| Scrapper | Acquisition | 1 | Hyena | Quadruped, humped, no tail | 1.3×2.5m | Packs 2–4 |
| Longleg | Recon | 2 | Terror bird | Digitigrade biped, long neck, stub wings | 4×3m | ≤3 |
| Glinthawk | Acquisition | 2 | Vulture | Flier, 2 legs | 5–6m wingspan | Flocks 3–4 |
| Snapmaw | Acquisition | 2 | Crocodile | Sprawling quadruped + tail, amphibious | 1.8×8m | 2–4 |
| Sawtooth | Combat | 3 | Smilodon | Quadruped, front-heavy, no tail | 2.5×6m | 1–3 |
| Ravager | Combat | 3 | Big cat | Quadruped + dorsal cannon | 2.5×6m | 1–2 |
| Shell-Walker | Transport | 3 | Hermit crab | Hexapod + 2 arm-claws | 3.5×4m | Convoys |
| Corruptor | Combat | 3 | Scorpion | Quadruped hub + prehensile tail | 3m (tail 6) | 1–2 |
| Behemoth | Transport | 4 | Rhino | Quadruped, massive neck hump | 5.5×11m | Convoy |
| Stormbird | Combat | 5 | Eagle | Flier, jet wings | 15–20m wingspan | Solo |
| Thunderjaw | Combat | 5 | T-rex | Biped + heavy tail | 9×24m official | Solo |
| Tallneck | Comms | — | Giraffe | Quadruped, disc head, docile | ~25–30m tall | Solo loop |

## 4. Per-Machine Specs

**Watcher — Recon T1.** Bird-strut walk with head-bob; stops to crane neck vertically and scan;
sprints in lunging hops. Single large eye = whole face, state-colored. Components: Eye (head; weak
to all — one sharpshot kill). Attacks: Blinding Stun Flash 6–11m (blinds player); Head Strike lunge
4–9m (75); Jumping Smash 6–11m (75, big recovery window); Tail Strike spin 2.5–6m (85); Redeye adds
Energy Blast 0–55m (40). Alarm shriek summons everything nearby.

**Strider — Acquisition T1.** True horse gaits (walk/trot/gallop), grazes head-down, skittish —
herd flees on alarm, one rearguard fights. Components: Blaze canister between haunches (Fire
detonates fireball / Tear pops). Attacks: Charge 15–50m (85); Double front-kick 0–7m (70); hind
Spin Kick 0–3.5m (70). Rears before kicking. Overridable mount.

**Broadhead — Acquisition T1.** Strider chassis, bulkier head; lowers horns when charging.
Components: 2 Blaze canisters on back; Horns (Tear — disables charge). Attacks: Horn Charge 15–50m
(142, knockdown); rear-up Double Strike 0–7m (150); Hind Leg Strike 1.5–3.5m (125). Mountable.

**Grazer — Acquisition T1.** Deer gait, head-down grass-cutting with spinning antler rotors; flees
in springy bounds. Components: 4 Blaze canisters in two dorsal rows (Fire chain-detonation); Rotor
blades on antlers (Tear). Attacks: Antler Charge 0–50m (120); Upward Rotor Stab 1–3.5m (100);
Leaping Front Kick 2–6m (90); Hind Kick 1.5–3.5m (90).

**Scrapper — Acquisition T1.** Hyena lope, hunched; recycles dead machines with grinder jaw.
Periodically deploys dorsal radar (dish spins, scan pulse — detects moving human-sized objects).
Components: Radar (back; Tear blinds scanning); Power cell between haunches (Shock stun AoE).
Attacks: Laser Burst 8–29m (40, mouth glows); Laser ground-sweep 8–20m (90+50/s raked); Claw Swipe
lunge 5–12m (85); Grinder Jaw 8–12m (85). Packs flank.

**Longleg — Recon T2.** Ostrich strut, fast sprint, wing-assisted jumps; fires echolocation pings.
Components: Concussion sacs ×2 (chest; heavy hit = air-blast, disables sonic+scan); Power cell
(lower back; Shock); Alarm antenna (head; Tear — can't call reinforcements). Body weak Shock.
Attacks: Stun Blast scream 1–30m (neck rears + sacs glow); Jet Blast fire wave 1–50m (190, wings
sweep back first); Beak Thrust 10.5–15.5m (160); Jumping Wing Blast AoE 5–13.5m (180).

**Glinthawk — Acquisition T2.** Soars circles, alights on machine corpses to scavenge; hovers to
attack; clumsy ground hops. Weak to Fire — one Burn drops it (crit window). Components: Freeze sac
(chest, pale blue glow; any damage detonates, disables ranged); Beak (Tear). Attacks: Freeze Spit
4-projectile lob (60+30/s chill); Freeze Cloud carpet on flyover; Claw Slash swoop 7.5–18.5m (160).
Metallic screech before dive; chest glow before spit. Flocks dive in sequence.

**Snapmaw — Acquisition T2.** Crocodile sprawl-walk, belly-slide into water, fast swimmer; basks
motionless (ambush). Weak Fire, resists Freeze. Components: Freeze sac (gullet; heavy impact = big
freeze explosion); 2 Blaze canisters (shoulders). Attacks: Freeze Burst mortar 20–45m (throat glows
blue); Lunge Bite 8–19m (180, launches forward); Snap Bite 3–11m (160); Tail Spin 0–15m (180).

**Sawtooth — Combat T3.** Feline prowl → crouch → pounce; heavy servo footfalls + deep growls.
Weak Fire. Components: Blaze canister (chest, exposed — bait pounce, hit chest). Attacks: Jumping
Jaw Smash pounce 16–23m (180, ~1s crouch telegraph); Claw Swipe lunge 7–11m (140); Jaw Smash 1–8m
(140); Berserker Fury multi-slash 3–10m (300 total). Converges on Watcher alarms.

**Ravager — Combat T3.** Leaner cat; opens at range with dorsal cannon (swivels to aim), melee once
cannon lost. Weak Fire, resists Shock. Components: Cannon (back; Tear — detachable, player-usable);
Power cell (rear; Shock); Chillwater canister (chest; Freeze). Attacks: Cannon Burst 15–65m (40/shot,
muzzle spin-up); Shock Jaw Smash 1–8m (180); Jumping Jaw Smash 16–23m (220); Shock Cocoon radial
1.25–5.25m (165).

**Shell-Walker — Transport T3.** Six-legged crab walk; rotates to face threat, left arm projects hex
energy shield, right arm lightning-gun claw; cargo crate locked under legs. Components: Cargo (any
damage detaches — defends cargo over own life); Lightning gun (Tear); Shield claw (Tear kills
shield); Power generator (under platform; shock stun). Attacks: Homing Shock Blast 30–60m (140, gun
glows); Shock Volley ×3 30–60m (80); 360 Shock nova 0–12m (300, whole body charges); Claw Combo
2–12m (200).

**Corruptor — Combat T3 (Faro).** Alien scuttle on 4 arachnid legs, huge leaps, digs in; matte black
chassis, hostile to everything; corrupts machines nearby. Weak Fire; exposed glowing heat core on
back = crit window. Components: Grenade + spike launchers (dorsal; Tear); prehensile tail. Attacks:
Corruption Spike 15–50m (80+50); Inferno Blast 6-grenade spread 15–80m (60+burn); Talon/tail strikes
+ 360 sweep 3–10m (110–120); Boulder Throw 15–80m (150).

**Behemoth — Transport T4.** Rhino bulk; ponderous walk, devastating charge; rears fully upright for
slam. Vertical cargo cylinder in belly cradle. Resists Shock. Components: Force loaders ×6 (neck
sides, glow when lifting; Tear disables anti-grav attacks); Power cell (neck top; Shock stun);
Freeze canisters ×2 (haunches; frozen = huge bonus damage); Crate holders. Attacks: Charge 22–80m
(300); Gravity Boulder Throw 10–45m (250, rocks visibly levitate first — dodge cue); Gravity Purge
rock-storm nova 0–9.5m (200+150/rock); Quake Smash rear-up shockwave to 22m (250, travels forward).

**Stormbird — Combat T5.** Soars high; alternates strafing dives, hover lightning barrages, landed
melee. Six feather-jet engines (3/wing, blue exhaust). Resists Shock. Components: Engines ×6 (all
torn = grounded); Lightning gun (chest; Tear disables shock); Freeze ×2 (shoulders); Blaze ×2
(hips). Attacks: Thunder Clash dive 0–150m (250+200, climbs, folds wings, screams, plummets ~2s
telegraph); Shock Blast at predicted position 15–100m (150); Thunder Bomb Run carpet strafe (250);
grounded: electrified Tail Lash 14–22m, Thunder Rush 15–40m (360), Screech Blast stun 0–20m.

**Thunderjaw — Combat T5, apex.** T-rex stomp — screen-shake footfalls; pivots on tail; fast 275
charge. Resists Shock. Components: Heart (chest, under armor) + Data nexus (back) = crit cores; Disc
launchers ×2 (hips; detachable, player-usable — signature counterplay); Mandibular cannons ×2; Mouth
laser; Radar; Tail; Blaze/Freeze/Power canisters. Attacks: Disc Barrage 20–80m (130/disc, launchers
elevate + glow); Laser Sweep fan 25–60m (200, mouth charges); Cannon Burst 20–80m (60/shot); Charge
20–80m; Tail Swipe 17–27m (300); Foot Stomp 0–7m (290); Rushing Bite 18–33m (250).

**Tallneck — Comms, docile.** Perpetual slow giraffe pace on fixed loop; never reacts — tramples
obstacles. Disc antenna head (rotating radar rim), no eyes; armor effectively invulnerable. Neck
antennas = climb holds; override node on disc top. Deep sub-bass footfalls, radio-static pulse.

## 5. Cross-cutting Implementation Notes

- Component pipeline: chassis mesh + N component meshes with own HP, elemental multipliers
  (Fire/Freeze/Shock/Tear), detach physics, attack-disable flags.
- Canister VFX: Blaze = orange → fireball; Freeze = pale blue → ice nova; Power cell = yellow-white
  → chain-lightning stun.
- State color drives one emissive channel (eye + accent strips): blue → yellow → red → teal → red+smoke.
- Alarm propagation: alerted recon emits radius event; combat pathfind to caller, acquisition flee
  along herd vector.

## Sources

Horizon Wiki machine pages (fandom), PlayStation Blog "The Making of HZD's Machines" (design rules,
de Jonge quotes), Wikipedia "Machines (Horizon)", GDC Animation Bootcamp "Bringing Life to the
Machines of HZD", Fextralife Thunderjaw wiki (official 24×9m dimensions).
