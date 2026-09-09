# Round 3 Reference — Aloy Animation / UI Language / Logo (research digest)

Sources: Guerrilla GDC 2017 "Player Traversal Mechanics in HZD" (van Grinsven), 80.lv Jonathan Colin
interview, HZD UI critiques (Akhil Dakinedi, Bootcamp case study), Game UI Database, Horizon Wiki.
Items marked [obs] are reconstruction targets from footage analysis, not dev-stated numbers.

## PART 1 — Aloy Animation (for the animator builder)

**Architecture facts:** HZD does NOT use motion matching — state machines + blend trees + additive
layers. Locomotion params: Move(bool), Speed(float), Heading(float). Turn rate from a speed→deg/s
curve (slower = tighter). Input latch: 3 frames (~0.1s) — quick flicks read as 180° turns, not stops.
Stops are authored clips interruptible early via events. Max run 6 m/s, jump 1.5m, slope limit 50°,
capsule 0.7×1.8m. Foot IK: two-bone + pelvis drop, raycast from knee height. Upper-body additive
"danger layer": shoulders raise + scanning while running in combat. Weapon attach flips between
"weapon follows hand" (run) and "hand follows weapon" (aim).

- **Jog** (default, weapon drawn) [obs]: ~5° forward lean, athletic cadence (~3 strides/s at 6m/s,
  ~1.8m stride). Bow low in LEFT hand — left arm swing damped, right arm swings normally crossbody.
  Heavy secondary motion is the signature: ponytail, necklaces, quiver, hip pouches bounce with
  ~0.1s lag. Head level (stabilized).
- **Sprint** [obs]: lean deepens to 10–15°, longer stride, arms pump higher; slight FOV widen + more
  vertical bob. Sprint is LOUD (noise 3 vs slide 1).
- **Crouch stealth walk** [obs]: hips drop to ~50–60% stand height (~1.0–1.1m), torso pitched ~30°,
  head up, weapon low across body in left hand, right hand floats low. Bob-free glide ~1.2–1.5 m/s.
- **Dodge roll** phases [obs]: Dive 0.15s (torso pitches, arms reach) → Tuck/contact 0.1s (over lead
  shoulder) → Roll 0.3s (diagonal across back, legs tucked, gear flails) → Recover 0.25–0.3s (rise
  through crouch). Total 0.7–0.9s. Tap = 2–3m, hold = 4–5m dive. I-frames center on tuck/roll.
  Chains with slight speed loss.
- **Bow aim** [obs]: string to cheek/jaw anchor, draw elbow high and level, left arm locked straight;
  torso twists + spine bends toward aim (additive on spine1/spine2/head, 2D by yaw/pitch). Aim-walk
  ~2 m/s strafing gait, lower body banks while upper body stays rock-steady. Release: string snap,
  shoulder recoil, auto re-nock ~0.5s from hip quiver.
- **Concentration:** R3-equivalent while aiming, ~0.25–0.3× time, 6s gauge, refill ~6s, desaturation
  + vignette + muffled audio [obs].
- **Idle:** weight settles into one hip, chest breathes, small head drifts; timed fidgets after
  10–20s: full-head look-arounds, hip-to-hip weight shifts; (rain: palms out — needs weather).
  In-character extras: quiver/strap adjust, touch the Focus at right temple. Combat idle: knees
  bent, weapon up, shoulders raised.
- **Stops/turns:** sprint stop = 2–3 step skid with one strong plant [obs]; banked lean into moving
  turns; stationary 180° = plant-and-turn.
- **Slide** (fan spec): sprint+crouch → 4m over ~1s, height 0.9m, exponential decel, exits into
  crouch/stand/sprint/dodge; can aim mid-slide with up to 180° upper twist.

## PART 2 — UI Design Language (for the HUD builder)

**Typography:** thin all-caps widely-tracked headers + light grotesque body; off-white and yellow on
dark translucent panels. Google stack: headers/wordmark = Julius Sans One (letter-spacing
0.3–0.45em); body/numerals = Inter or Archivo Light; techy data = Michroma/Jura Light. (Repo already
bundles Rajdhani/Michroma/Chakra Petch/Orbitron — add Julius Sans One for display.)

**HUD (dynamic — elements fade when irrelevant; each On/Off/Dynamic):**
- Top-left: thin HP bar (off-white on dark translucent, hairline border), HIDDEN at full health.
  Beneath: medicine pouch meter (herb icon + segmented green gauge). Level + XP thin bar nearby.
- Top-center compass strip: cardinal letters + ticks, quest/POI icons slide along with distance
  labels ("125m"), objective text under it. NO minimap — deliberate.
- Bottom-right: weapon icon + ammo type + count, only visible with weapon drawn.
- Bottom-left: quick-slot strip.
- **Machine status stack** above each machine HP bar: alertness circle yellow (scanning) → red
  (aware) → FLASHING RED DIAMOND (attacking); elemental status icon with white ring unfilling as
  countdown; extra icons for incapacitated.
- Damage numbers: small off-white for armor plinks, larger yellow-tinted for weak/component hits;
  tear pops. Hit confirm: reticle tick + escalating audio; component sever = chunky numbers +
  debris ("stadium full of fans" feedback).
- Elemental colors: shock blue, fire yellow/orange, explosive orange, freeze teal, corruption
  green, tear purple.
- Weapon wheel: hold-trigger, time slows heavily (not paused), drop-shadow + slight blur/vignette;
  4 slots; hovering fans out ammo types as arcs; center shows weapon icon/name/stats; in-wheel
  crafting with ingredient costs. Off-white line icons, yellow selection highlight.
- Focus: expanding blue-purple sonar pulse; purple haze vignette; machines blue-violet glow,
  weak components BRIGHT YELLOW persisting 5–7s after Focus off; patrol routes purple arrowed
  ground lines. Hexes [obs]: pulse #7B5CFF→#4AC8FF, machine #5A7BFF, component #FFD34D, paths #9B6BFF.
- Loot: white diamond prompts; toast lists item+count; rarity green/blue/purple blocks.
- Menus: tribal-tech — dark smoked-glass over blurred live world, thin off-white/gold hairline
  rules + corner brackets, all-caps tracked headers, tribal line iconography.

## PART 3 — Logo: HORIZON ZERO CLAUDE parody spec

Official construction: wordmark only. HORIZON = thin slightly-extended geometric grotesque caps,
tracking ~0.4–0.5em, circular O's, light weight. ZERO DAWN below at ~30–35% cap height, tracked
wider to optically match width, often flanked by thin horizontal hairlines. Box art: low golden sun
dead-center on the horizon line — the brand image.

**Parody blend:**
- HORIZON in Julius Sans One 400, letter-spacing 0.45em, #FAF9F5 (on dark).
- ZERO CLAUDE below at ~32% size, letter-spacing 0.65em, flanked by 1px hairlines in muted gold
  #C8A24B or terracotta.
- Sun → Claude spark: asterisk-like burst of 8–12 rounded slightly-irregular rays in terracotta
  #DA7756 (alternates: #CC785C book cloth, #C15F3C crail, #D4A27F kraft), rising HALF-VISIBLE
  behind a thin horizon rule — spark-as-dawn is the joke.
- Soft radial glow #DA7756 @ 25% behind the spark. Palette: HZD-dark #101418 bg, off-white text,
  terracotta accent. Menu items tracked caps with thin terracotta underline on hover.
