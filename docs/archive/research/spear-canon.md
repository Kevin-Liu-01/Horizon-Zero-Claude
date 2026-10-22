# Spear Canon — how Aloy actually holds and swings it

Research digest for lane `player-melee` (Round 4). Written 2026-09-17 from eight stills saved in
`reference/spear-*.jpg` (sourced and described in `reference/MANIFEST.md`) plus Guerrilla's published
material and the Horizon wikis.

Every claim below carries a tag:

| tag | meaning |
| --- | --- |
| **[FILMED]** | I read it off one of the stills in `reference/` and can point at the frame |
| **[PUBLISHED]** | stated in Guerrilla / PlayStation / wiki text, not measured by me |
| **[INFERRED]** | my reading, consistent with the stills but not directly visible |
| **[HFW]** | from *Horizon Forbidden West*, used only where HZD shows nothing |
| **[UNKNOWN]** | I could not establish it; do not gate on it |

---

## 0. The three findings that change the lane

**0.1 — In Horizon Zero Dawn the spear is NOT worn on Aloy's back.** [FILMED] It is invisible
whenever she is not attacking and materialises in her right hand on the swing. I checked every
back/profile view I could find in official material: the Steam Complete-Edition crouch-walk
screenshot, the Story Trailer at 46 s and 48 s, the Remastered launch trailer at 36 s / 93 s / 97 s /
110 s, and the E3 2015 demo at 147 s. Bows, quiver, ropecaster and pouches are all modelled on her
back; the spear is not in any of them. Players complain about exactly this ("a spear sized pocket",
Steam CE discussion 2943620809086713056). *Horizon Forbidden West* is where the spear is genuinely
worn on the back, and `reference/spear-holster-back-hfw.jpg` is that game.

→ **Gate A100 (`spear is parented to a spine/chest socket, midpoint within 0.30 m of the upper-back
centre, shaft 30–60° from vertical, blade above the right shoulder`) is a Forbidden-West rule, not a
Zero-Dawn one.** It is still the right call for this project — an invisible spear is the thing Kevin
is complaining about — but the judges should know the reference for it is HFW, and the numbers in
§1 come from an HFW still with an occluded blade end.

**0.2 — Aloy fights with the spear ONE-HANDED, in the right hand, with the left hand free.**
[FILMED] Guard, windup, contact and follow-through in the HZD Remastered sequence
(`spear-ready-side` → `spear-light-windup` → `spear-light-strike` → `spear-light-follow`) all show
the left hand empty and used as a counterweight: it reaches forward-down as the right hand cocks,
and swings back behind the hip as the right hand drives forward. The only frames where a second hand
comes near the shaft are the Override (`spear-grip-closeup`, and even there the second hand is
ambiguous) and the E3 2015 finisher. I found **no** official HZD still of a two-handed low guard.

→ **Gate V46 says "two-handed low guard as in `reference/spear-*`". The reference does not show
that.** Either V46's wording should relax to "low guard, right hand on the shaft, left hand free and
outside the torso", or the builder should knowingly author a two-handed guard that is *not* what the
game does. My recommendation is the former: the one-handed guard is what reads as Aloy, and it is
also the pose that keeps the left arm clear of the chest, which is Kevin's standing complaint.

**0.3 — The hand is in the REAR QUARTER of the shaft, not mid-shaft.** [FILMED] In every HZD frame
the butt projects only a fist-length behind the wrist and the whole rest of the shaft is forward of
the hand. Measured against shaft length, the grip centre sits about **0.15–0.28 of the way up from
the butt**, with ~0.22 as the best single number. `src/combat/bow.js` builds a 1.85 m spear and
`melee.js` currently grips it at `length * 0.38` — that is roughly 30 cm too far up the shaft, which
is part of why the carry reads wrong.

---

## 1. Carry / holster

### What HZD does
Nothing. [FILMED] No socket, no strap, no spear on the body outside an attack, an Override or a
scripted finisher. The draw is instantaneous and off-screen.

### What HFW does (the model to copy for gate A100)
From `reference/spear-holster-back-hfw.jpg` (Aloy standing, left profile, 1920×1080):

- The shaft lies **diagonally across the back**, butt cap low at the **right hip / lower back**,
  climbing toward the **right shoulder**. [HFW][FILMED]
- Shaft angle measured off the visible straight segment: **≈ 20–30° from vertical** (dx ≈ 155 px
  over dy ≈ 435 px in a 3× crop → 19.6°, plus perspective foreshortening at this camera angle, so
  call it 20–30°). [HFW][FILMED]
- The **head end is occluded by her hair and shoulder pad in this still.** "Blade rises over the
  right shoulder" follows from extrapolating the shaft line, and from the fact that the butt is at
  the right hip; it is **[INFERRED]**, not seen. Do not let a judge claim this still proves the
  shoulder.
- The spear sits **outboard of the quiver and inboard of the bow**: the bow is the big orange-wrapped
  *curved* limb sweeping down-back on the same side, and the two do not intersect — the bow's chord
  passes about a hand's width outside the spear shaft. [HFW][FILMED]
- The grip wrap and its red feather binding sit **below** the shoulder line when stowed, i.e. the
  part of the shaft crossing the shoulder blades is bare haft. [HFW][FILMED]

### Recommended holster for this project
Spine/chest socket, shaft in the **35–45°** band from vertical (inside gate A100's 30–60°, and
close to the 20–30° HFW reading once you allow that our camera is not HFW's), butt low on the
**right** side of the pelvis/lower back, blade clearing the **right** shoulder by 10–15 cm, shaft
midpoint within 0.15 m of the spine line. Keep it there while sprinting and while the bow is drawn —
in HFW the stowed spear does not animate independently of the torso. [INFERRED]

---

## 2. Melee ready stance

From `reference/spear-ready-side.jpg` (HZD Remastered launch trailer @ 69.90 s, Aloy 3/4-front,
Scrounger ~3 m ahead, ground fire between them):

- **Right hand only** on the shaft, at **hip height** (roughly the top of the pelvis, level with the
  belt line). [FILMED]
- **Shaft angled DOWN-FORWARD, about 25–30° below horizontal**, blade forward and low, red feather
  hanging off the head. The tip is roughly knee-to-shin height and about a shaft-length ahead of her.
  [FILMED]
- **Grip at ~0.15–0.25 of the shaft from the butt.** Only a short stub projects behind the wrist.
  [FILMED]
- **Left arm empty, swept back and out** from the body, palm open — a counterweight, not a guard.
  [FILMED]
- **Elbow beside the ribs**, forearm outside the torso silhouette; nothing crosses the chest.
  [FILMED]
- **Stance**: knees soft, hips slightly bladed toward the target, weight on the front foot, head down
  and tracking the machine. Feet about shoulder-width, not a wide fencer's lunge. [FILMED]

The front read (`reference/spear-thrust-front.jpg`, E3 2015 @ 177 s) is the same geometry from the
other side: hand low near the waist, shaft running forward, left arm clear of the chest. That still
is a kneeling finisher, so treat it as a *front-view grip check*, not a standing ready stance — a
true standing front-view HZD ready stance is **[UNKNOWN]**; I did not find one in official material.

---

## 3. The light chain

### What the published text says [PUBLISHED]
The Horizon Fandom wiki's Spear article: for light attacks Aloy "executes a quick succession of
**light horizontal swings** while standing", a downward slash while jumping, and a lower horizontal
slash while rolling. Fextralife: "A quick and low damage attack, with a low chance to remove machine
components." The button is R1 (light) / R2 (heavy).

### What I could film
I could **not** find an official HZD clip of the standing three-hit horizontal chain. The one clean,
uncut HZD melee beat in official material is the Remastered-trailer sequence at 69.9–70.7 s, and that
is a **downward-forward diagonal chop**, not a horizontal sweep. Read honestly, that beat is either
the standing light's first hit filmed at an angle, or (more likely, given the wiki's "two vertical
slashes" description of the heavy) the **first slash of the heavy**. I am flagging the ambiguity
rather than resolving it. **[FILMED + UNKNOWN]**

The clearest horizontal sweep in any official Horizon material is
`reference/spear-sweep-back-hfw.jpg` (HFW launch trailer @ 60 s, chase-camera back view): shaft
horizontal at shoulder height, right hand on the shaft, blade leading forward-left, left arm thrown
forward across the swing direction for counter-rotation. **[HFW][FILMED]**

### Recommended light chain (3 hits)
Built from the wiki's "succession of horizontal swings", the HFW sweep, and the filmed HZD beat's
timing:

| beat | arc | hands | body | step-in |
| --- | --- | --- | --- | --- |
| **L1** | right→left horizontal sweep at chest/shoulder height, ~100–120° of yaw swept by the tip | right hand only, left arm counter-swings forward | hips/spine rotate ~20–25° left-to-right through the hit; shoulder leads the hand | 0.35–0.5 m |
| **L2** | return left→right at the same height, slightly lower, ~90–110° | right hand only, left arm counter-swings back | counter-rotation the other way, ~20° | 0.25–0.4 m |
| **L3** | the wide finisher: a down-and-forward diagonal chop (the filmed beat) ending as a thrust, tip travelling from above the shoulder line to below the hip | right hand only; body is fully committed | spine pitches forward over the lead foot; the free arm trails behind the hip | 0.5–0.8 m |

Durations, measured off the frames of the one filmed beat (windup frame 70.35 → contact 70.50 →
follow-through 70.70, and guard 69.90 → windup 70.35): **[FILMED]**

- guard → cocked: **~0.30–0.45 s** (69.90 → 70.35, includes a step-in; a trailer cut cannot be
  entirely ruled out inside that window)
- cocked → contact: **0.15 s**
- contact → follow-through: **0.20 s**
- shaft rotation cocked→contact: **~40–45°** (+35…+40° above horizontal down to 0…−5°)

Against the repo's current `MELEE.light` (`windup [0.10, 0.09, 0.12] / strike [0.10, 0.09, 0.12] /
recover [0.26, 0.24, 0.40]`): the strike and recover numbers are in the right neighbourhood, the
**windup is about 40 % too short** — 0.15 s of cock is what the film shows, and it is the part that
makes a swing read as weight rather than a twitch. `comboWindow 0.62` is consistent with a "quick
succession".

---

## 4. The heavy

**[PUBLISHED]** The Fandom wiki: "For strong attacks, Aloy executes a heavier sequence of **two
vertical slashes** which can knock down small to medium sized machines." Fextralife: "A slower and
moderate damage attack, with an increased chance to remove machine components." So the HZD heavy is
*two* slashes, vertical, and its selling point is knockdown + component removal.

**[FILMED]** The best evidence for what one of those slashes looks like is the
`spear-light-windup` → `spear-light-strike` → `spear-light-follow` triple, read as a vertical slash:

- **Windup**: right hand draws up to **sternum height**, shaft rotates to **+35…+40° above
  horizontal**, blade high and **forward of the head**. Critically — **the shaft never goes behind
  the head and the forearm never crosses the face.** The cock is a shoulder-and-spine load with the
  elbow staying beside the ribs. Right shoulder pulls back, hips pre-rotate.
- **Strike path**: hand drives forward to **chest height** while the shaft sweeps down through
  horizontal; contact happens with the shaft at **0…−5°**, blade into the target's head/shoulder.
  The path of the tip is a forward-and-down arc, not a pure vertical guillotine — it flattens into a
  thrust at contact.
- **Recovery**: hand continues to **waist height**, shaft settles **10–15° below horizontal**, tip
  past the target's near shoulder, spine pitched forward over the lead foot, free arm trailing low
  and behind. Then back to the §2 guard.

**Recommended heavy** for this project: two of those slashes, the second wider and lower, with a
longer load. Repo's current `MELEE.heavy` (`windup 0.34 / strike 0.14 / recover 0.52`, arc 140°,
step 0.9 m) is a good shape for a *single* overhead; if you keep it single, hold the 0.34 windup —
that is the number that sells "committed". An overhead that raises the blade above the head is
acceptable *only* if the shaft stays in front of the head plane; the reference never puts it behind.

Whether the HZD heavy is one- or two-handed is **[UNKNOWN]** — I found no official still of it.
Given that everything else observed is one-handed, one hand with a hard hip drive is the safer
choice, and it also keeps gate A104's "forearm never crosses the body midline by more than 0.10 m"
easy to hold.

---

## 5. Transitions

- **Draw from the back**: HZD has none on screen [FILMED — it is instantaneous]. HFW's is a reach
  across the body with the right hand to the butt cap at the right hip, then a pull down-and-forward
  so the shaft slides out low rather than being lifted over the head. **[HFW][INFERRED — I did not
  film HFW's draw frames; this is the only motion the holster geometry in
  `spear-holster-back-hfw.jpg` permits without the blade sweeping through her own head.]**
  Budget **0.25–0.35 s** and start the swing's windup from the end of the draw, not before it.
- **Re-holster**: the reverse, shaft going back butt-first past the right hip. Fire it on leaving
  melee (no swing for ~1.2 s, or on drawing the bow). **[INFERRED]**
- **Bow ↔ spear**: in HZD the bow occupies the left hand while jogging (see
  `docs/research/reference-v3.md` PART 1 and gate V29). The spear must not fight that: when the bow
  is out, the spear is on the back socket and the right arm swings normally.
- **While moving**: the reference sequence is a standing fight, so the moving-swing split is
  **[UNKNOWN]** from film. Gate A105's upper-body-mask requirement is the right call regardless.

---

## 6. MEASUREMENT TABLE — what the builder should hit and the judges should gate on

Shaft length `L` = 1.85 m in this project (`buildSpear`, `src/combat/bow.js`). "Grip fraction" is
measured from the **butt** (0.0) to the **tip** (1.0). Angles are from the horizontal unless the row
says otherwise. Every band is drawn from the source column; where the source is HFW or inferred, the
band is deliberately wider.

| # | Quantity | Target | Tolerance | Source |
| --- | --- | --- | --- | --- |
| M1 | Grip fraction, right hand, all melee beats | **0.22** | 0.15 – 0.28 | [FILMED] all 4 HZD melee stills + grip close-up |
| M2 | Butt length projecting behind the wrist | 0.33 L ≈ **0.40 m** | 0.28 – 0.50 m | derived from M1 |
| M3 | Left hand on the shaft during light/heavy | **never** (left hand free) | — | [FILMED] no HZD still shows two hands on a swing |
| M4 | Forearm ↔ shaft angle at the grip | **≤ 20°** (forearm roughly in line with the shaft) | ≤ 25° | [FILMED] `spear-grip-closeup` |
| M5 | Ready stance: hand height | **hip / belt line**, 0.95–1.05 m on a 1.75 m Aloy | ±0.08 m | [FILMED] `spear-ready-side` |
| M6 | Ready stance: shaft angle | **−28°** (blade down-forward) | −20 … −35° | [FILMED] `spear-ready-side` |
| M7 | Ready stance: tip height | knee–shin, 0.35–0.55 m | ±0.10 m | [FILMED] `spear-ready-side` |
| M8 | Ready stance: elbow distance outside the torso axis | **≥ 0.12 m**, forearm never inside the chest silhouette | ≥ 0.10 m | [FILMED] + Kevin's standing note |
| M9 | Windup: hand height | **sternum**, 1.25–1.35 m | ±0.08 m | [FILMED] `spear-light-windup` |
| M10 | Windup: shaft angle | **+38°** | +30 … +45° | [FILMED] `spear-light-windup` |
| M11 | Windup: blade position | **forward of the head plane**, never behind it | hard fail if behind | [FILMED] + Kevin's standing note |
| M12 | Contact: hand height | **chest**, 1.15–1.25 m | ±0.08 m | [FILMED] `spear-light-strike` |
| M13 | Contact: shaft angle | **−3°** (essentially horizontal) | +3 … −10° | [FILMED] `spear-light-strike` |
| M14 | Follow-through: hand height | **waist**, 1.00–1.10 m | ±0.08 m | [FILMED] `spear-light-follow` |
| M15 | Follow-through: shaft angle | **−13°** | −8 … −20° | [FILMED] `spear-light-follow` |
| M16 | Shaft rotation, windup → contact (vertical beat) | **42°** | 35 – 50° | [FILMED] M10 vs M13 |
| M17 | Tip travel per light swing | **≥ 1.6 m** | ≥ 1.4 m | [INFERRED] from M16 and the 1.45 m forward shaft |
| M18 | Hand travel per light swing | **≥ 0.55 m** | ≥ 0.45 m | [FILMED] windup→follow hand path |
| M19 | Horizontal sweep (L1/L2): tip yaw swept | **110°** | 90 – 125° | [HFW][FILMED] `spear-sweep-back-hfw` |
| M20 | Horizontal sweep: shaft height at contact | **shoulder**, 1.35–1.45 m | ±0.10 m | [HFW][FILMED] |
| M21 | Pelvis+spine yaw excursion per swing | **20–25°** | ≥ 15° (gate A102 floor) | [FILMED] torso rotation across the triple |
| M22 | Step-in per light swing | **0.35–0.5 m** (L3: 0.5–0.8 m) | gate A102's 0.25–0.8 m | [FILMED] + repo `MELEE.light.step` |
| M23 | Timing: light windup | **0.15 s** | 0.12 – 0.18 s | [FILMED] 70.35 → 70.50 |
| M24 | Timing: light strike (contact window) | **0.10 s** | 0.08 – 0.12 s | repo value, consistent with film |
| M25 | Timing: light recover | **0.22 s** | 0.20 – 0.30 s | [FILMED] 70.50 → 70.70 plus settle |
| M26 | Timing: heavy windup | **0.34 s** | 0.30 – 0.45 s | [FILMED] guard→cocked, repo value |
| M27 | Holster: shaft angle from **vertical** | **40°** | 30 – 55° (gate A100 band is 30–60°) | [HFW][FILMED] 20–30° measured, widened for our camera |
| M28 | Holster: which shoulder the blade clears | **right** | — | [HFW][INFERRED] blade end occluded in the still |
| M29 | Holster: shaft midpoint to spine line | **≤ 0.15 m** | ≤ 0.30 m (gate A100) | [HFW][INFERRED] |
| M30 | Holster: spear ↔ bow/quiver clearance | **≥ 0.08 m**, no intersection | ≥ 0.05 m | [HFW][FILMED] |
| M31 | Shaft ↔ own head/neck/spine clearance, every frame of every swing | **≥ 0.15 m** | ≥ 0.12 m (gate A104) | [FILMED] nothing ever comes near her head |
| M32 | Draw-from-back duration | **0.30 s** | 0.25 – 0.35 s | [INFERRED] |

### Rows the judges must NOT gate on
- Anything about a **two-handed** guard or two-handed light attacks — the reference contradicts it
  (§0.2, M3).
- "Blade above the right shoulder" as *proven* by `spear-holster-back-hfw.jpg` — it is extrapolated
  (M28).
- The distinction between HZD's light chain and heavy from film — the one filmed beat could be
  either (§3, §4).
- Any HZD claim about the holster. HZD has no holster (§0.1).

---

## 7. Sources

- `reference/spear-ready-side.jpg`, `spear-light-windup.jpg`, `spear-light-strike.jpg`,
  `spear-light-follow.jpg`, `spear-grip-closeup.jpg` — frames at 69.90 / 70.35 / 70.50 / 70.70 /
  41.05 s of the official *Horizon Zero Dawn Remastered* launch trailer,
  `https://cdn.akamai.steamstatic.com/steam/apps/257069627/movie_max.mp4`
- `reference/spear-thrust-front.jpg` — frame at 177.00 s of "Horizon Zero Dawn – E3 2015 Trailer |
  PS4", official PlayStation channel, `https://www.youtube.com/watch?v=Fkg5UVTsKCE`
- `reference/spear-holster-back-hfw.jpg` — official Steam store screenshot #0 for *Horizon Forbidden
  West Complete Edition* (app 2420110)
- `reference/spear-sweep-back-hfw.jpg` — frame at 60.00 s of the official *Horizon Forbidden West*
  launch trailer, `https://cdn.akamai.steamstatic.com/steam/apps/257007287/movie_max.mp4`
- Negative evidence for §0.1: Steam CE screenshot #4 (crouch-walk), HZD Story Trailer
  (app 256777357) 46 s / 48 s, Remastered trailer 36 s / 93 s / 97 s / 110 s, E3 2015 demo 147 s,
  and `https://steamcommunity.com/app/1151640/discussions/0/2943620809086713056/`
- Attack descriptions: Horizon Fandom wiki "Spear"; Fextralife HZD wiki "Spear"
  (`https://horizonzerodawn.wiki.fextralife.com/Spear`)
- Repo values quoted: `src/combat/weapons.js` `MELEE`, `src/combat/bow.js` `buildSpear`,
  `src/combat/melee.js` `_poseSpear`
- All stills are **reference-only, not shipped**; nothing in the project is derived from them.
