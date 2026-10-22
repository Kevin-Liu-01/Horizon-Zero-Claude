# HZD UI / Typography / Focus — Implementation Reference

Research compiled 2026-08-04 for the Horizon Zero Claude browser remake.
Sources: gamepressure interface guide, Medium UI critiques (Akhil Dakinedi; Ananyareddy
case study), Game UI Database / Interface In Game catalogues, horizon.fandom.com wiki,
Territory Studio (holographic UI vendor for Guerrilla), Steam community HUD threads,
dafont/fontspace font threads, google/fonts repo (URLs verified 200 via curl 2026-08-04).

---

## 1. FONTS

### 1.1 What the real game uses

- Guerrilla never published the UI typeface. Community identification: the HUD/menu
  body text is a clean humanist/square grotesque (Eurostile-adjacent, slightly
  condensed, wide tracking on labels, frequent ALL-CAPS headers). The **logo/title**
  lettering ("HORIZON ZERO DAWN") is custom: thin, wide-tracked caps with angular
  cut corners and notched strokes.
- Fan recreations of the logo font: **"Horizon" by Pixel Sagas** (Neale Davidson) —
  the fan-favorite match for titles. License: Pixel Sagas fonts are
  **free for personal, non-commercial use only**; redistribution/direct-download
  bundling is not permitted without a commercial license. **FLAGGED: do not bundle.**
  (Some mirrors mislabel it OFL; the author's own license page says personal use.)
  There is also "Horizon" by Joanna Vu on FontSpace (similar situation — display
  quality is also lower). Prefer the OFL alternatives below.

### 1.2 Bundleable free matches (all SIL OFL 1.1, verified direct-download URLs)

| Role | Font | Why it matches | Direct .ttf URL (raw github, verified 200) |
|---|---|---|---|
| TITLE / display #1 | **Michroma** | Wide, squarish, Eurostile-like sci-fi caps; with `letter-spacing: 0.25em` + caps it reads very "HORIZON" | `https://raw.githubusercontent.com/google/fonts/main/ofl/michroma/Michroma-Regular.ttf` (64 KB) |
| TITLE / display #2 | **Orbitron** (variable wght 400-900) | Angular geometric caps, cut corners — closest to the logo's notched feel at Bold | `https://raw.githubusercontent.com/google/fonts/main/ofl/orbitron/Orbitron%5Bwght%5D.ttf` (38 KB) |
| TITLE alt #3 | **Exo 2** (variable) | Softer futuristic display, good for subtitles | `https://raw.githubusercontent.com/google/fonts/main/ofl/exo2/Exo2%5Bwght%5D.ttf` (304 KB) |
| UI body #1 | **Rajdhani** (500 Medium / 600 SemiBold for HUD numbers & labels) | Condensed square grotesque, flat terminals; the go-to for HZD-style fan HUDs; excellent at small sizes, great numerals | Regular: `https://raw.githubusercontent.com/google/fonts/main/ofl/rajdhani/Rajdhani-Regular.ttf` · Medium: `.../Rajdhani-Medium.ttf` · SemiBold: `.../Rajdhani-SemiBold.ttf` · Bold: `.../Rajdhani-Bold.ttf` (~380-400 KB each) |
| UI body #2 | **Chakra Petch** | Square sans with tapered/angled corners — very "Focus hologram"; use for machine info cards & scan text | Regular: `https://raw.githubusercontent.com/google/fonts/main/ofl/chakrapetch/ChakraPetch-Regular.ttf` · Medium: `.../ChakraPetch-Medium.ttf` · SemiBold: `.../ChakraPetch-SemiBold.ttf` (~78 KB each) |
| UI body alt | **Saira SemiCondensed** | Neutral condensed fallback for long menu text | `https://raw.githubusercontent.com/google/fonts/main/ofl/sairasemicondensed/SairaSemiCondensed-Regular.ttf`, `.../SairaSemiCondensed-SemiBold.ttf` (~95 KB each) |

**Recommended stack**
- Title/logo/headers: `Michroma` (all-caps, `letter-spacing: .2–.3em`), Orbitron 700 for the death/victory stingers.
- HUD numerals + labels + menus: `Rajdhani` 500/600 (caps for labels, `letter-spacing: .08em`).
- Focus/scan hologram text: `Chakra Petch` 400/500.
- License file: include each font's OFL.txt (same repo folder) in `public/fonts/`.
- Convert to .woff2 with `fonttools`/`glyphhanger` if size matters; OFL permits it.

---

## 2. HUD LANGUAGE (the real game, element by element)

Global rules:
- **Dynamic HUD**: elements fade in only when relevant (full health = no health bar;
  weapon holstered = no reticle/ammo). Everything has an "Always on / Dynamic / Off"
  setting under Custom HUD. Holding a "show HUD" key (H-style) temporarily reveals
  hidden elements.
- Text color: **off-white/warm parchment** with yellow highlights for emphasis —
  "off-white and yellow" is the documented HUD scheme.
- Icon style: flat white "tribal cave-painting" glyphs (hand-drawn look) for
  weapons/resources; techno-holographic geometry only for Focus things.
- Panels: dark, slightly blue-gray translucent rectangles with 1px thin light
  borders; sharp corners, occasional 45° cut corner; small triangle motifs used
  as bullets/markers (the Focus's geodesic-triangle language).

| Element | Real-game behavior | Position |
|---|---|---|
| **Health Meter** | RED bar, divided into 4 segments by thin ticks; only visible when not full or in combat. Numeric HP not shown by default. | Top-left |
| **Medicine Pouch** | Thin GREEN bar directly UNDER the health bar (not left edge / not vertical). Shows pouch fill %; green "+" pips appear when stored medicine exceeds 100% of max HP. Hold Up (d-pad) / `Z`-style key to sip: green drains while red refills gradually. | Top-left, under health |
| **Compass** | HZD **does have a top-center compass ribbon** (cardinal letters + quest/objective icons + custom waypoint markers). No minimap anywhere. Distance-to-objective (in meters) shown under the active quest marker icon in-world. NOTE: task brief assumed "no compass strip" — that's wrong for HZD; it's toggleable but on by default. | Top-center |
| **Quest tracker** | Small text block: quest name + current objective + distance; updates with a subtle fade/slide when objectives complete. | Top-right (below compass area) |
| **Item / tool shortcut bar** | Horizontal quick-item strip: current consumable (traps, potions, rocks) with left/right cycle arrows and count; next items queued visually. | Bottom-left |
| **Weapon + ammo indicator** | Currently drawn weapon icon + selected AMMO type icon + remaining ammo count (crafted arrows count, e.g. "24"). Also shows mod-slot rarity color dots. Only visible with weapon drawn. | Bottom-right |
| **Weapon wheel** | Hold weapon-swap (LB/L1; PC: hold weapon key) → time slows heavily, world blurs (DoF), radial wheel opens on the RIGHT side: 4 weapon slots (up/down/left/right). Each slot shows the AMMO icons of that weapon; sub-select ammo per weapon and HOLD craft button (X/R) on an ammo to craft more from the wheel (radial progress fill while crafting). Shows weapon name, handling/damage stats, mod count. | Right half, radial |
| **Reticle + Concentration meter** | Bow reticle center-right (Aloy is offset LEFT so the right half is aim space). Activating Concentration (R3 while aiming / PC: mouse button) slows time ~6 s; a thin vertical **yellow gauge next to the reticle** drains while active, refills over ~6 s cooldown. | Center-right |
| **Enemy awareness icons** | Floating above each enemy: YELLOW circle that FILLS as it detects (scanning) → full RED circle = alerted/searching → flashing red JAGGED diamond = attacking you (works even for off-screen attackers, appears at screen edge toward the threat — this is the "edge-of-screen threat indicator"). | Above enemies / screen edge |
| **Enemy health bars** | Thin horizontal bar appearing ABOVE a machine once damaged or in combat (yellow-white fill on dark backing), with the machine's name + level shown when targeted/scanned. Toggleable. | Above enemy |
| **Status-effect icons on enemies** | Circular elemental icon above the enemy: fills as buildup accumulates (shock=blue, fire=yellow-orange, freeze=teal, corruption=green/purple); once triggered, converts to a countdown ring (unfilling white circle) while the effect lasts. | Above enemy, next to health |
| **Damage numbers** | Small white numbers pop off the hit point and float up/fade (~0.7 s); harder hits/tear pops read bigger; toggleable. Component BREAK shows a burst + the part flying off. | At impact point |
| **XP popups** | Small "+XP" text with amount, bottom-center-right, brief fade; XP bar itself lives in the pause menu, and a "LEVEL UP" banner notification appears center-screen with a sound sting when leveling. | Bottom-right / center |
| **Loot/pickup toasts** | Item pickups stack as a small list of "icon + item name x count" rows, BOTTOM-RIGHT, each fading after ~3 s ("looting info" HUD setting). | Bottom-right |
| **Stealth visibility meter** | An eye-shaped indicator: eye opens as you become visible; vertical sound-lines show noise detection; crouching in tall grass closes it. | Bottom-center |
| **Notifications (quest/tutorial)** | Letterboxed thin banner, dark translucent, thin gold/white line accents: "New Quest", "Objective Complete", tutorial tips as bordered cards with the relevant input glyph. | Top-center or center |

---

## 3. FOCUS (exact behavior)

- **Activation**: tap **R3** (PC default: **F** originally, later remappable; V/middle-mouse
  also seen) — a **toggle**, not hold. (Forbidden West changed to tap=pulse/hold=sustained;
  ZERO DAWN is plain toggle with no time limit while standing still.)
- **Constraint**: full Focus mode drops when you sprint/attack; the world stays fully
  interactive but movement is walk-paced while "in" the Focus view.
- **Pulse visual**: on activation, a spherical **purple ripple** expands outward from
  Aloy (geodesic wireframe dome feel — the Focus language is a "wide geodesic polyhedron
  of holographic light"); screen gets a subtle purple haze + vignette, faint
  interconnected purple neon lines, small target reticle at center.
- **Machine highlight**: machines glow **violet/blue-purple** (holographic silhouette
  fill + outline) through walls/terrain while Focus is active.
- **Scanned components**: after scanning (look at machine), its **weak-point components
  highlight YELLOW** — canonically the highlight persists **5–7 seconds** after leaving
  Focus (community-measured; a popular mod extends it), then fades. Elemental canisters
  (Blaze, Freeze, etc.) are called out with their element icon.
- **Machine info card**: hovering a machine in Focus shows a holographic card: machine
  NAME, type silhouette icon, LEVEL, health, elemental strengths/weaknesses list,
  and a component list with loot. (Browser version: name + level + weak-point line
  is enough.)
- **Patrol paths**: scanned machines display their patrol route as a **glowing line
  drawn on the ground** (blue-purple), showing the walking loop; ideal for planning
  trap placement.
- **Tagging**: while in Focus, hover + tag (R1 / middle-mouse) places a persistent
  **diamond marker** floating above the machine, visible OUTSIDE Focus and through
  terrain, until the target dies, leaves range, or is manually untagged. Multiple
  simultaneous tags allowed.
- **Other Focus reveals**: human/animal **tracks glow** (footprint trails), blood
  stains, quest clues, datapoints (green/cyan glyph icons), lootable resources and
  **medicinal plants pulse with highlight**, climbable ledge hints in some areas;
  signal lore text translated. Hostile humans highlight ORANGE-red; friendlies/neutrals purple.
- **Colors inside Focus**: neutral/friendly = purple; hostile = bright orange;
  weak points = yellow; loot/datapoints = green-cyan.
- **Concentration is separate**: it's an aiming skill (R3 WHILE AIMING), ~6 s slow-mo,
  its own thin yellow drain gauge beside the reticle, ~6 s refill cooldown. Do not
  merge the two meters.

**Browser adaptation**: toggle on `F`; purple expanding ring shader + fullscreen purple
vignette; machines get emissive violet override material + `depthTest:false` outline;
scanned machine's weakpoint meshes flip to yellow emissive for 6 s after Focus off;
patrol path = extruded line strip on terrain from the AI's waypoint list; tag = diamond
sprite with `depthTest:false` and distance-scaled size.

---

## 4. INTERACTION PROMPTS & LOOT UI

- **World prompts**: small floating label at the interactable: input glyph in a
  rounded-square chip + verb, e.g. `[E] Loot`, `[E] Gather`, `[Hold E] Override`
  (hold shows a radial/linear fill around the glyph while held). Prompt appears
  only within ~2 m and with line of sight; fades in/out.
- **Loot window**: opening a carcass/box shows a compact dark translucent panel
  (center-right): list of items with icon + name + count, "Take All" button
  (`[R] Take All`-style), per-item take. Panel has thin 1px light border, sharp
  corners, category icon.
- **Pickup toasts**: as above — bottom-right stacked rows `icon  Ridge-Wood ×3`,
  ~3 s life, newest on bottom, slight slide-in.
- **Merchant/dialog**: dark panel + off-white text, choices as vertical list with
  a thin selection frame (triangle cursor at left).

**Browser adaptation**: single `#prompt` div following a world-anchor projection,
keyboard glyph = bordered `<kbd>` chip; hold-actions animate a conic-gradient ring.
Loot: auto-loot with toast list is acceptable (HZD itself has a "skip loot animation"
option), keep the toast list faithful.

---

## 5. TITLE SCREEN & MENUS

- **Title screen (real)**: slow aerial pan over a misty mountain/valley vista at
  dawn (golden light), game LOGO in thin wide-tracked caps center-upper, "Press any
  button" beneath. Then a minimal vertical menu list (Continue / New Game / Load /
  Settings / Credits) — small caps text, left-aligned or centered, selected item
  brighter + small triangle indicator; background stays live 3D with ambient music
  (soft vocals + strings).
- **Pause menu**: full-screen dark translucent overlay with tabbed pages along top
  (Map / Quests / Inventory / Crafting / Skills / Notebook / Settings), thin line
  dividers, parchment-white text, tribal glyph icons; inventory uses rarity color
  blocking (green/blue/purple/orange frames) and a dark forest-green tint on
  Inventory/Crafting screens specifically.
- **Death screen**: quick desaturation → dark overlay, simple text ("Restart from
  last save"-style options), no mocking banner — subdued, fast respawn.
- **Victory/quest complete**: center banner "QUEST COMPLETED" thin-caps + XP reward
  line, gold/off-white on translucent dark strip, ~3 s.
- Menu motion: fast subtle fades/slides (150–250 ms), no bouncy easing; sounds are
  soft ticks.

**Browser adaptation**: render the live Three.js scene behind the title menu with a
slow orbit camera + dawn lighting; Michroma logo with 0.25em tracking; menu = HTML
overlay. Death: CSS grayscale filter ramp + overlay.

---

## 6. COLOR PALETTE (best-effort hex from screenshots/community — approximate)

| Use | Hex (approx) | Notes |
|---|---|---|
| HUD text off-white | `#EFE6D5` | warm parchment white |
| HUD accent yellow | `#F5C95C` | highlights, selected items |
| Health red | `#B03A2E` (fill), backing `#3A1F1C` | 4-segment ticks `#1E1E1E` |
| Medicine green | `#7FB069` | thin bar under health |
| Focus purple (haze/lines) | `#7B5CD6` / brighter `#8F7BE8` | screen tint at ~15-20% alpha |
| Machine highlight violet-blue | `#6A5AE0` → glow `#9C8CFF` | through-wall silhouette |
| Weak-point yellow | `#F2C230` / glow `#FFDF6B` | scanned components |
| Hostile orange | `#E8762C` | hostile humans in Focus; alert red `#D64541` |
| Loot/datapoint green-cyan | `#4EC9B0` | plants, datapoints |
| Cyan/teal UI (freeze, holo details) | `#59C1C6` | element: freeze |
| Element: shock blue | `#4FA3E3` · fire `#F0A03C` · corruption `#8E44AD`/`#67B26F` | circular buildup icons |
| Panel background | `rgba(12,16,20,0.72)` | thin border `rgba(255,255,255,0.25)` |
| Rarity frames | uncommon `#3E9B4F`, rare `#3D7BD9`, very rare `#8E44AD`, legendary(FW) `#E5A93D` | inventory blocks |

---

## PRIORITY (what sells the fantasy, in order)

1. **Focus toggle**: purple pulse + violet machine silhouettes + YELLOW weak points
   (with 6 s linger) + ground patrol lines — this is THE signature HZD interaction.
2. **Fonts**: Michroma (title, wide tracking) + Rajdhani (HUD) instantly reads "Horizon";
   the current generic font is the biggest immersion leak.
3. **Top-left red segmented health + thin green medicine bar underneath** with
   hold-to-heal drain — iconic and cheap to build.
4. **Enemy awareness pips** (yellow fill → red → flashing jagged red when attacking,
   clamped to screen edge for off-screen threats).
5. **Weapon wheel** with time-slow + blur, 4 slots, ammo icons + counts.
6. **Concentration**: aim slow-mo with a draining yellow gauge beside the reticle
   (separate from Focus).
7. **Damage numbers + status buildup circles** above machines.
8. **Bottom-right loot toasts** and `[E] Loot` glyph-chip prompts.
9. **Dynamic HUD fading** (hide health when full, hide ammo when holstered).
10. Title screen: live vista + thin-caps logo; compass ribbon top-center (yes, HZD has one).
