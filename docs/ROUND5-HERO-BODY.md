# ROUND 5 — lane `hero-body` report (W0b): Brea on the kept rig

Lane: hero-body · port 5252 · wave W0b · Oct 18–19 2026.
Plan: `docs/ROUND5-PLAN.md` §2 (row), §1.2 (grants), §3.1 (W0b exit), §3.2 (contracts), §4.1 (budgets),
§6 (aloy.glb), §8 (rulings), §9 (gate block). Canon: `docs/ROUND5-BIBLE.md` §3 (Brea), §3.8 (build order),
§5.2 (bow poses), §5.9 (controls).

**Status (Oct 19, 12:30 UTC).** Brea runs the kept stack on the real W0 loadout. Final lane run on 5252:
**41 PASS · 3 FAIL · 12 NEEDS-JUDGE of 56** — every movement, draw, traversal, surface and identity gate of the §9
block passes, including **A13 5/5 (R27)**, A31g, A35 at −0.55, A-draw-elbow-level, A-wrap-clear and the
no-prance bars of A-run-arms (pelvis 0.077 m p-p). The three FAILs are camera rows (§4.3): **A31b**'s film clause
(UBC's sternal clavicle joints 0.22 NDC under the frame edge; every numeric row passes), **A31f** flaky (2 of 3
runs pass), **A31c** (failed on the Round-4 baseline too; R33 b, listed). Global list on this tree (§4.5):
A1, A20b, A90 ×4 PASS; A9 / A21 FAIL with a second gate Chrome on the box (not attributable, R26 / R33 f);
pipeline's `A-assets-tracked`, `A-ID-ip-assets-gone`, `A-licence-manifest` fail on other lanes' rows (the
`SPECS.hero` literal, gates-perf's `aloy-ual.json`) — §7. `public/models/aloy.glb` is deleted; nothing in
`src/` loads it.

## 1. What was built

### 1.1 Brea (bible §3.3–§3.5, §3.8 steps 1 and 4) — `tools/build/recipes/brea.mjs`

`public/models/hero/brea.glb` (≈ 0.32 MB): ONE skeleton (the 65 UBC joints + 19 dyn_ joints) and exactly
TWO skinned meshes, so the body is 2 draws (plan §4.1):

| mesh | material | contents |
|---|---|---|
| `Brea_Skin` | `MI_Brea_Skin`, 1024² base + 512² normal + 512² ORM | UBC `Superhero_Female` body + eyes (the eye texture packed into the free top-right strip of the UBC layout) |
| `Brea_HairWrap` | `MI_Brea_HairWrap`, 512² base + normal | `Hair_BuzzedFemale` coil shell (tinted `#15110F`), heavy straight brows (×1.08, arch flattened 40 %, simplified to a third), the orchil headwrap band + its crossing turn, the wrapped TOPKNOT (Ø 14 cm, carmine binding), the wrap knot, the 0.40 × 0.07 m wrap tail (violet outside, carmine lining inside) and the 0.22 m knot tail |

dyn_ chains (the kept spring solver discovers them by name; class by regex):

| chain | parent | class | what |
|---|---|---|---|
| `dyn_hairKnotTail_01..04` + `_end` | `Head` | hair | the knot tail — `chainOf('hair')`, the A33-hair-bounce target |
| `dyn_wrapSash_01..06` + `_end` | `Head` | cloth | the wrap tail, down the LEFT of the spine (never the draw side) |
| `dyn_sashEnd_01..03` + `_end` | `pelvis` | cloth | the outfit's linen sash end at the left hip |
| `dyn_alidadeCord_01..02` + `_end` | `spine_03` | (fallback cloth) | the alidade on its neck cord at the sternum |

**Face, no Blender** (`tools/build/recipes/lib/face.mjs`, which the NPC recipes reuse — `archetypeDeltas(seed, base)`
is their hook): the seven landmarks are FOUND on the mesh (`findLandmarks`), a sum of Gaussian bumps moves head,
brows, eyes and coil shell together (the eye sockets rigid to 15 mm, 18 mm falloff), normals recomputed only
where the field moved. Then the paint layer is composited from a bind-space POSITION MAP of the skin's UV layout
(so paint is authored in 3-D): skin retoned to `#8A5A3C` mid-cheek, sun creases at the eye corners, the
**salt-line** (`#EDEAE2`, 8 mm, cheek to cheek across the nose bridge below the eyes, crackled), the **3 cm scar
through the LEFT brow** (a pale seam `#BA927E`; the brow hair is cut along it), the **∴ on the back of the right hand**; eyes `#3B2A20`.

**Hide mask:** every body vertex carries `_HIDEMASK` (uint8). Bit 0 = covered by Pan Whites I (a ray along the
vertex normal meets the outfit within −3…+8 cm). At equip the body triangles whose three vertices carry the set's
bit are culled (6,008 of 13,580 for Pan Whites I).

Heights: body 1.72 m (measured from the body mesh, not the wrap: the row's `targetHeight` is 1.7791 so that the
body, not the topknot, is 1.72 m; bible §3.3).

### 1.2 Default outfit: Pan Whites I — *Raker's Whites* (bible §3.9) — `tools/build/recipes/outfit-pan-1.mjs`

`public/models/hero/outfit-pan-1.glb` (≈ 0.28 MB, 7,876 tris, ONE mesh, ONE material, 1024² `pan` atlas +
512² normal/ORM): MCO `Female_Peasant_Body` (orchil smock `#6B3F73`, lapilli girdle `#1C1B1E`, brass buckle,
linen hem), `Female_Peasant_Arms` **rolled to the elbow** (cut past |x| 0.412 m: forearms and hands bare, so the
∴ shows; carmine rolled cuffs added), `Female_Peasant_Legs` (basalt `#4A4A50`), `Female_Peasant_Feet` (esparto
with lapilli bands), procedural linen sash knot + hanging end on `dyn_sashEnd`. Recolour = the source texel's
luminance × the slot colour, painted per piece from that piece's own UV islands.
*Deviation:* the bible names the Ranger feet; the Peasant feet keep the set on one source texture and cost 2.6 k
tris against 9.2 k.

### 1.3 v0 kit + the merged stow kit (bible §3.6, §5.2, §5.3; R10) — `tools/build/recipes/weapons/kit-v0.mjs`

One shared 512² swatch atlas (pine, bronze, esparto, vermilion/white graduations, juniper sapwood with the
heartwood stripe, horn, cane, palm weave, leather, linen string, fletching, brass).

| GLB | tris | sockets / notes |
|---|---|---|
| `kit/stowkit-v0.glb` | 1,970 | ALL stowed gear as ONE skinned mesh, ONE draw, `_PIECE` bits 1 lance · 2 bow · 4 quiver+arrows · 8 bracer · 16 alidade |
| `kit/lance-shepherd-v0.glb` | 338 | 1.55 m pine, 22 cm bronze leaf blade, **7 cm bob-shaped bronze butt cap**, esparto wraps at 20 % and 55 %, vermilion/white graduations on the upper third; `butt grip grip2 stow tip` |
| `kit/bow-sabina-v0.glb` | 404 | 1.45 m juniper self-bow blockout, esparto grip, horn nocks; `grip nock string_top string_bottom stow` |
| `kit/quiver-cane-v0.glb` | 964 | rigid cane tube, palm-weave cap over the back half, 12 arrows; `stow mouth` |
| `kit/bracer-crescent-v0.glb` | 144 | stiff leather, bronze crescent plate (dorsal, left forearm) |

Stow placement is authored from the body + outfit surface in bind space: the lance on `spine_03`, **34° from
vertical, the bob butt low at the LEFT hip, the blade over the RIGHT shoulder**, ≥ 2.5 cm off the back along its
whole length (R10); the bow on `spine_02` on the opposite diagonal beneath it; the cane quiver on `pelvis`, right
hip, tilted 20° forward; the bracer on `lowerarm_l`, dorsal; the alidade on `dyn_alidadeCord_02` at the sternum.

### 1.4 Native clips — `public/models/hero/brea-clips-ual2.glb` (0.2 MB)

UAL2 (CC0) plays on the UBC skeleton with no retarget (R15): `ClimbUp_1m`, `Slide_Start/Loop/Exit`, `Consume`,
`Hit_Knockback`, rotations only (+ pelvis translation). The seated pose for `ride()` is the UAL1
`Sitting_Idle_Loop`, baked on demand (`CLIPS.sitIdle`).

## 2. Runtime: Brea on the kept stack

### 2.1 Boot rows (contract `assets.specs` rows + `SPECS.hero`, pipeline-owned)

`src/hero/rows.js`, imported by the Player (so it evaluates before `new Assets()` copies the rows), points the
`hero` row at `/models/hero/brea.glb` (`targetHeight` 1.77913: the BODY is 1.72 m) and adds two hero-body boot
rows, `heroOutfitPan1` and `heroStowKit`, plus the animation pack `ANIMS.heroUal2`. It writes both
`assets.specs.js`'s `SPECS` and `assets.js`'s derived copy at runtime; **the files themselves are pipeline's and
are not edited.** Once pipeline makes the one-row data edit its own report anticipates (§7 request 1) the `hero`
override is a no-op.

### 2.2 The rig profile — `src/entities/anim/rigs/{ubc,index}.js`

`attachRigProfile(root)` (Player constructor, on the SOURCE root, before the clone) writes
`root.userData.rigProfile = ubcProfile(root)` when the skeleton is UBC. JSON-safe, it survives the clone and is
read by the ClipLibrary bake, the PlayerAnimator, the springs and the camera:

```js
{
  name: 'ubc-brea',
  key, map, aim, contacts, feet, fingerAxes,      // the Round-5 seams (52/52 UAL pairs, derived finger curl axes)
  orbitCaps,                                      // camera-orbit capsules by UBC names (*_04_leaf_*, ball_leaf_*, Head)
  orbitChains: { cloth: '^dyn_(wrapSash|sashEnd)', hair: '^dyn_hairKnotTail' },
  hairChain: 'dyn_hairKnotTail_01',               // chainOf('hair')
  handCollider: { from: 'lowerarm_r', to: 'hand_r', tip: 'middle_04_leaf_r', r: 0.09 },   // M10
  tune: UBC_TUNE,                                 // the re-derived aim/draw/run constants (§3)
  bow: UBC_BOW,                                   // the Lmax solve (§3)
}
```

### 2.3 Animator seams (`src/entities/playerAnimator.js`, grant)

| seam | what |
|---|---|
| `this.T` | every Round-4 aim constant (`QUIVER_HIP`, `ANCHOR_OFF`, `ANCHOR_DROP`, `HAND_ANCHOR_R/FROM`, `HEAD_OFF/R`, `HAND_IN`, `BOW_ARM_LOCK`, rest grip, ray origin, hand-behind-nock, loose kick, bow pole) read from `prof.tune` with the Round-4 values as defaults; plus `pitchShare`, `pitchLive`, `eyeR`, `runArms` |
| T-form elevation | `pitchLive`: the aim pitch is applied about the LIVE character X axis and carried by the trunk (`pitchShare` [0.36, 0.32, 0.32, 0, 0]); the cheap bind-frame rotation turned a 90° bladed trunk's "pitch" into a sideways roll of the bow shoulder (measured: 18 cm of shoulder slide, 5 cm of rise, Lmax 0.43 → 0.53 over the gate pitches). Now Lmax is 0.526–0.548 at all four |
| aim-frame elbow | `_rollElbow(side, want, w, axis)`: the draw elbow is placed on the arrow line in the AIM frame (up ⟂ arrow), capped at shoulder + 0.03 there, then a second roll about character Y keeps it ≥ 6 mm under the shoulder joint (A16); the old char-Y-only cap left the elbow 3 cm in front of the hand aiming down |
| `debugAim()` | adds `lmax`, `pull`, `restZ`, `u`, `d`, `shoulder` |
| M10 | the hand+forearm capsule pushes every dyn_ particle of every class out (radius 0.09 from the axis): push and re-project to the segment length up to four times, then hang the particle straight away from the nearer axis (one pass put the sternum cord back inside the hand crossing the chest); `debugHandCollider()` → `{ active, r, minAxis, pushes, at }` |
| `chainOf(cls)` | the chain a gate stages by class (bones, root first; `'hair'` → the knot tail) |
| alidade (E5) | `_alidadeLayer` (right hand under the right eye, Sighting = V) + `_alidadePlace` after the springs (the cord bone carries the tube to the eye); `debugAlidade()` |
| native clips | `_nativeLayer`: UAL2 `ClimbUp_1m` (scrubbed by `player.mantleK`), `Slide_Loop`, UAL1 `Sitting_Idle_Loop` as weighted actions on the same mixer; `debugNative()` |
| climb hands | `_climbHands`: both wrists on the ledge edge through the pull; `debugClimb()` |
| running arms | `_runArmClamp` (profile `runArms`): opens the elbow, then lowers the whole arm from the shoulder (the sprint clip's back swing lifts the upper arm to the horizontal on this rig), then abducts it — only on a frame that would read T-rex or crossing |
| running bounce | `_runBob` (profile `runBob`, after the ground conform): the pelvis keeps 42 % of its excursion around a 0.4 s running mean; every planted leg is re-solved onto the ankle it stood on (`_legTo`, 2-bone, sole counter-rotated); `_headStabilise` counters only what is left so the head's world bob stays Round 4's |
| locomotion re-step | `_locoStep`: a planted foot whose lock has spent 0.24 m of its 0.30 m budget, or whose ball really moved 3 cm, is lifted on the step arc and re-placed under the clip's own foot (A31g strafe reversals: 0.26 m of anchor slide → ≤ 0.03 m) |
| slide posture | `_slidePose`: pelvis pitched/rolled 85 % toward the face's normal, trunk leaning back 60 % of that, both soles planted, no foot lock while skidding |
| conform release | the ground conform stands down while the climb or the seat clip has weight (it dragged the climbing body 0.33 m down and the hands off the ledge) |
| `behindHead(pt)` | metres a char-space point sits behind the back of the skull (R8 / "never behind the head") |
| knockdown | `player.mods.knockdownMode` caps the react class; `lastHitClass` published |

### 2.4 Parts — `src/hero/{index,parts,outfit,stowkit}.js` (handed to armory at W1 day 1)

```js
installHero(player) -> HeroRig            // Player constructor; `player.hero`
HeroRig.equip(row) / unequip()             // outfit sets (rows in rows.js)
HeroRig.kit: HeroStowKit                   // .attach() .detach() .setHidden(bits) .info()
HeroRig.info() -> { brea, draws, tris, casters, skeletons, meshes[], outfit, kit, lanceOut, bowOut }
HeroRig.dispose()
HeroRig.holdPreview(url?) -> { meshes, tris, dispose() }   // the W0 held bow (Sabina blockout) bound to combat's bow node, for A-hero-draws
HeroRig.bowPulls                           // the pulls applied to combat's bows (W0 bridge, §6)
PIECE = { lance: 1, bow: 2, quiver: 4, bracer: 8, alidade: 16 }
bindPart(heroRoot, srcRoot, tag, { castShadow }) -> SkinnedMesh[]   // bind by bone NAME, own inverse binds
releasePart(meshes, player)                // removeFromParent + skeleton.dispose() + fade-clone release
class HideMask { apply(bit) -> hiddenTris; visibleTris() }   // index reorder + drawRange, no new GPU buffer
installPieceMask(material) -> { value }    // the `_piece` vertex mask, composed by the player's fade clone
```
One Skeleton for the two body meshes (the duplicate three makes is disposed); casters: body skin + outfit (≤ 2).
Each frame `HeroRig.update()` collapses the stowed lance while melee's stance is not `holstered`, the stowed bow
while combat's bow is in her hand, and hides melee's procedural Round-4 spear while it sits on its back socket
(the stow kit's Shepherd's Lance is the one on her back; melee replaces the held one at W1).

### 2.5 The published surfaces (contracts §3.2, owner hero-body, real at W0b)

```js
player.mods                          // PlayerMods: fields null = canon; .clear(); .active()
  .fallSafe  .fallLethal             // m (canon 4 / 9)
  .slideDegBySurface                 // { surface: deg } over { cinder: 28 }, else 50
  .knockdownMode                     // 'stagger' | 'light'
  .regen                             // hp/s
  .noiseMul                          // x footstep noise -> player.noiseMul / player.noise (+ stimulus filter when exposed)
  .zoom                              // x camera zoom while aiming
player.ride(path, clip = 'sitIdle')  // or ride(path, { clip, speed, seat, loop, onExit })
  -> { socket, s, length, cancel(), done: Promise<'input'|'end'|'cancel'|'death'> }
player.dismount(cause)  player.riding
player.surfaces.add({ x, z, r, surface }) -> id ; .remove(id)   // surface patches (fixtures, settlements)
player.surfaceAt(x, z)  player.slideDegOn(surface)  player.surface
player.mantleClip ('climb1m' on a 0.82-1.22 m ledge)  player.mantleK  player.mantleEdge
events: 'player-ride' {length}, 'player-dismount' {cause}, 'player-slide-exit' {cause}
```
Climb: a ~1 m ledge is the UAL2 `ClimbUp_1m` climb (0.78 s), taller/lower lips keep the Round-4 pull-up. Slide:
on cinder above 28° (canon), Space hops off it (`SLIDE_HOP_V` 3.4 m/s, no re-entry for 0.55 s), speed capped at
`SLIDE_TERMINAL` 2.6 m/s. R16: no field touches `player.speeds`, dodge, jump or slide length.

### 2.6 Input (`src/core/input.js`, grant: +12 lines)

`plant` X, `cast` F, `tool` R, `slot1..4` Digit1..4 (bible §5.9); pad: `16: 'KeyF'` (Home → cast), and the
exported `ACTION_PAD` table (plant b15 D-right, tool b12 D-up, cast b16, slots RB + D-pad); `ACTIONS` = every
rebindable action; a rebind (`input.bind`) persists to `cal.binds.v5` (overrides only) and is read back by every
new Input. The settings REBIND PANEL is shell-ui's (W2, `src/ui/settings.js`): it reads `ACTIONS` / `ACTION_PAD`.

## 3. The bow on the new body: the Lmax solve and the re-derived constants (E2)

### 3.1 Lmax

At full draw the locked bow arm (shoulder → grip, `reach` = upper arm + forearm × `bowArmLock`) and the draw
(grip → anchor) close a triangle. With `u` = anchor − bow shoulder and `d` the arrow direction, the largest draw
the arm can carry from that anchor is

    Lmax = −u·d + sqrt((u·d)² − |u|² + reach²)

The animator computes it live every aim frame (`debugAim().lmax`). Measured on Brea (gate `A-lmax-solve`,
final build, T-form elevation; the range over the two last runs):

| camPitch | −0.55 (the Round-4 off-ray up-aim) | −0.4 | 0 | 0.75 |
|---|---|---|---|---|
| Lmax (m) | 0.542–0.543 | 0.538–0.539 | 0.526–0.527 | 0.543–0.548 |

`rigProfile.bow` publishes `drawLength` 0.550 (2 mm over the largest Lmax, so the bow arm reaches its lock at
every gate pitch; the ≤ 2.4 cm excess at a level aim is taken as anchor drop along the jaw, never as a bent bow
arm — `A35` measures 167.9° at all four pitches), `restZ` 0.055, `pull` = drawLength + restZ = **0.605**,
`arrowLen` = pull + 0.20 = **0.805**. Every bow model combat builds (`hunter-bow`, `sharpshot-bow`, `war-bow`)
carries `pull` 0.605 (solution 0.6028 for each: within the gate's ±0.01). *Before the T-form fix Lmax ran
0.43–0.53 over the same pitches: the bind-frame pitch rotation was a ROLL of the 90°-bladed trunk.*

### 3.2 The constants (`UBC_TUNE`, character space, metres; head offsets in the `Head` joint's bind frame)

| constant | Round 4 (Aloy) | Brea | how it was derived |
|---|---|---|---|
| `quiverHip` | (−0.2, 1.02, −0.14) | (−0.255, 1.205, 0.055) | the stow kit's measured nock cluster (`r5StowKit.quiverNocksGame`) |
| `anchorOff` | (−0.086, −0.024, 0.118) | (−0.072, 0.034, 0.052) | right jaw corner on Brea's face mesh, from `Head` |
| `anchorDrop` | 0.038 | 0.030 | jaw length below the anchor |
| `handAnchorR` / `From` | 0.064 / 0.72 | 0.060 / 0.72 | hand-to-anchor capture radius |
| `headOff` / `headR` | (0, 0.05, 0.01) / (0.105, 0.135, 0.115) | (0, 0.114, 0.016) / (0.083, 0.096, 0.113) | the box of `Brea_Skin`'s Head-weighted vertices above the jaw line (1st–99th percentile: x ±0.078, y 0.023…0.205, z −0.092…0.123 off `Head`), its inscribed ellipsoid + 5 mm |
| `handIn` | 0.90 | 0.985 | the hand may rest ON the face (0.985 of the skull ellipsoid), never in it |
| `bowArmLock` | 0.9945 | 0.9945 | unchanged |
| `restGrip`, `restReach` | (0.14, 1.42, 0.03), 0.42 | (0.14, 1.42, 0.03), 0.40 | ready hold in front of the left shoulder |
| `rayFwd`, `rayH` | 0.45, 1.43 | 0.42, 1.42 | the first-frame aim-ray origin before an achieved grip exists |
| `handBehindNock`, `looseKick` | 0.068, 0.075 | 0.062, 0.075 | string fingers behind the nock |
| `bowPole` | (0.3, −0.95, 0.12) | same | bow-arm elbow pole |
| `eyeR` | — | (−0.0334, 0.1030, 0.0717) | the right eye (UBC Eyes mesh centre) — the alidade raise |
| `pitchShare`, `pitchLive` | (0.14, 0.15, 0.13, 0.2, 0.28), bind frame | (0.36, 0.32, 0.32, 0, 0), live char X | T-form: the trunk carries the elevation, head and neck stay with it |
| `runArms` | — | wristDrop 0.27, midGap 0.11 | Kevin's arm rules (A-run-arms) |
| `runBob` | — | keep 0.42, rate 2.5 | the sprint clip bounces Brea's pelvis 0.13–0.15 m; 0.07 m kept |
| `headRest` | 1.36 (`HEAD_REST`) | 1.468 | the `Head` joint's standing height (camera stance follow) |

The draw elbow is placed in the AIM frame (on the arrow line, at most 3 cm over the shoulder there) and then held
≥ 6 mm under the shoulder joint in character height; the M10 capsule (`r` 0.09 m, forearm + hand) is the
spring-side collider of the draw hand.

## 4. Gates (plan §9 hero-body; `tools/gates.r5.hero-body.mjs`, port 5252)

Final lane run `node tools/gates.mjs --port 5252 --extra tools/gates.r5.hero-body.mjs --lane hero-body`
(Oct 19, 11:43 UTC, 56 gates): **41 PASS, 3 FAIL, 12 NEEDS-JUDGE**; the three FAILs are the camera rows in §4.3.
Rows marked † were re-run after a later fix (`--only`), numbers from that run.

### 4.1 Movement and draw (kept, re-staged on Brea)

| gate | verdict | numbers |
|---|---|---|
| A2-dodge-displacement | PASS | 4.84 m, animator recovers |
| A3-sprint-speed | PASS | 6.74 m/s (band 6.12–7.82) |
| A11-idle-alive | PASS | 56 mm path |
| A12-clip-driven | PASS | `Sprint_Loop` weight 1.0 at 6.69 m/s |
| **A13-no-skate (R27, 5/5)** | **PASS 5/5** | worst windows 0.0075 / 0.0039 / 0.0343 / … m (bar 0.06), mean speed 6.79–6.81 (staged on the flattest clear 46 m strip, see §6) |
| A15-foot-flat | PASS | 1.84° idle and aim |
| A16-draw-anchor | PASS | 6 rows: nock-to-hand ≤ 0.052 m, elbow ≤ −0.006 m under the shoulder, headClear 1.18–1.71, launch 0.0° |
| A17-draw-beats | PASS | hand-to-quiver 0.13 m, flourish 10 sim frames, loose 0.28 m |
| A18-slope-conform / A18b@hero | PASS / PASS | ball clear ≤ 0.0008 m at 10/20/30°; moving p90 0.006 m |
| A28-run-cadence | PASS | 2.93 steps/s, flight 0.24 (plain W) |
| A28b-canon-speeds@hero | PASS | walk 1.47, jog 4.93, sprint 6.39 (sim) |
| A31-aim-strafe-skate | PASS | 0.012 m |
| A31b-aim-strafe-skate-player-anim@hero | PASS | ≤ 0.011 m, legs never cross (min sep 0.19 m) |
| **A31g-direction-change-skate** | **PASS** | worst first stance after 20 reversals 0.022 m (bar 0.08; was 0.26 m) |
| A32-draw-ramp | PASS | nock-to-hand ≤ 0.05 m through the ramp, hand ≥ 0.985 of the skull |
| A33-rig-finite | PASS | 0 non-finite bones |
| A33-hair-bounce@hero | PASS | knot tail 3.75 Hz vs footfall 3.75 Hz, significance 0.27 (staged on the flat strip, §6) |
| A34-chains-driven@hero | PASS | 15/19 dyn_ bones > 0.5° (0.79) |
| **A35-cheek-anchor@hero (+ −0.55)** | **PASS** | hand-to-head 0.109–0.157 m at −0.55/−0.4/0/0.75, bow elbow 167.9°, hands 0.58–0.61 m apart |
| A36-hit-react-visible@hero | PASS | 18.2° lean, decay 0.60 s, hit clip 0.82 |
| A26-one-convention@hero | PASS | animator probed on 5 bones by animator key, identical to BoneSpace |
| **A-lmax-solve** | **PASS** | §3.1; bows 0.605 vs solution 0.6028 |
| **A-draw-elbow-level** | **PASS** | elbow −0.007…+0.043 m (aim frame), ≥ 0.056 m behind the hand, bow arm ≥ 0.196 m off the chest, hand/elbow ≤ 0.07 m behind the skull |
| **A-wrap-clear (M10)** | **PASS** | every chain ≥ 0.055 m from the hand/forearm through a full cycle from a sprint-stop, 4 pitches, capsule active every frame |
| **A-alidade-pose** | **PASS** | tube 0.015 m from the right eye (idle/jog/crouch), elbow under and ahead, lowered in 0.20–0.21 s |
| **A-run-arms** | **PASS** | wrists ≥ 0.21 m off the midline, ≥ 0.27 m under the shoulder (−0.02 margin), fore-aft 0.48 m/cycle, **pelvis 0.077 m p-p**, knee never above hip, 6.79 m/s |

### 4.2 Traversal, surface, identity

| gate | verdict | numbers |
|---|---|---|
| **A-climb-1m** | **PASS** | walk 0.80 s / jog 0.79 s on top, palms ≤ 0.035 m from the edge in the pull, 0.00 m float, pillar steps 2.41 s |
| **A-slide** | **PASS** | slides on cinder 29.8° and 40.5°, not on grass 34.2°; 2.60 m/s (terminal 2.6); exits on Space at once; planted sole ≤ 0.031 m |
| **A-player-mods** | **PASS** | each field changes exactly its behaviour and clears; speeds unchanged (stimulus noise filter: §6) |
| **A-ride-hook** | **PASS** | pelvis ≤ 0.007 m from the seat socket on 87 seated frames; Space dismounts; geometries 157→157, textures 116→116, listeners 34/2→34/2 |
| **A-input-actions** | **PASS** | 7 actions with pad entries, rebind persisted and restored (settings panel: §6) |
| **A-face-delta** | **PASS** | 5 of 7 landmarks ≥ 6 mm (7.75 / 7.43 / 6.71 / 6.38 / 6.45), live vertices ≤ 0.07 mm from the record, eye socket 0.21 mm, profile IoU 0.913 |
| **A-brea-contrast** | **PASS** | salt 5.83:1; black sand ΔE2000 22.0, 24 % of pixels ≥ 3:1 |
| **A-hero-draws** | **PASS** | 5 draws (skin, hair+wrap, outfit, stow kit, Sabina blockout), 2 casters, 20,098 tris (body 9,848 · outfit 7,876 · kit 1,970 · held 404) |
| **A-outfit-merge-dispose** | **PASS** | ×6 equip/unequip + bracer socket swap + kit rebuild: geometries 146→146, textures 116→116, skeletons 3→3 (2 with the outfit off) |

### 4.3 Camera rows (hero-body grades them on Brea, R33 g)

| gate | baseline (Aloy) | verdict | numbers |
|---|---|---|---|
| A32-look-up@hero, A32b@hero, V22@hero | pass | PASS | reticle on the 10/16 m targets; 0 ghosted frames; V22 fill 0.64 |
| A31d-hillside-pan-0.8@hero | pass | PASS | every pan row ok (was: 12 frames under the framing bar) |
| A31e-hillside-pan-clamp@hero | pass | PASS | nearest vertex ≥ 0.15 m on every frame (was 0.12 m — the stow kit, §2) |
| A31f-hillside-yaw-sweep@hero | pass | **FLAKY 2/3** | PASS in two runs; the final run had 1 of 48 rows (yaw 0, −0.8) at onFrac 0.254 vs bar 0.273 on one sample |
| A31b-no-ghost-without-occluder@hero | pass | **FAIL (film clause only)** | every numeric row passes (0 ghosted, 0 jammed, 0 hijacked, 0 off-screen, occluder fades to 0.49); the FILM frame has her head in (NDC −0.71) but both `clavicle_*` joints at NDC −1.12 (bar ±0.9) |
| A31c-clamp-framing@hero | **fail** | FAIL (R33 b: listed, not graded) | improved: nearest vertex 0.087 → 0.12–0.14 m; the away rows' crown-occlusion test and the side rows' onFrac still miss |

A31b's film: the camera at camPitch −0.8 on the 38.4° face frames her from the head down to the shoulder line;
UBC's `clavicle_*` joints sit at the STERNAL end (1.33 m, 0.14 m under `Head`), so the frame that shows her head,
wrap and the top of her shoulders leaves both joints 0.22 NDC under the edge. The frame itself reads as the
criteria ask (head, wrap, upper back, sky) — filed for the judge with the frame, not passed.

### 4.4 Visual rows (NEEDS-JUDGE; filmed in the final run, frames read by this lane)

| gate | my reading of the frame |
|---|---|
| V1-sprint-frame | arms fore-aft beside the body, wrists low, no crossing; one foot planted; gear rides the back |
| V2-idle-frame | hands relaxed at the thighs, feet planted |
| V3-crouch-stalk | low stalk, arms hanging, feet planted; the stowed lance tips flat with the pitched chest |
| V4-aim-anchor | bow up, string hand at the jaw, over-the-shoulder aim |
| V12-sprint-vs-reference | full leg extension, arms beside the body; the trunk lean (≈ 35°) is deeper than a sprint photo's — the judge's call |
| V13-aim-strafe | front view, bow up and aimed, feet toward the travel, a weighted step (staging now holds aim and asserts it, §6) |
| V14-slope-contour | across the slope, soles on the ground |
| V23-secondary-motion@hero | knot tail and wrap tail in different positions across the three frames; the sash end and alidade cord move less |
| V24-draw-vs-reference@hero | knuckle at the jaw corner, fletching at the mouth corner, forearm on the arrow line, elbow level, wrap tail clear; the ∴ (back of the right hand) faces away from this side camera |
| V-brea-one-glance | §5 sheet: topknot bump, lance + bow diagonals with the bob butt low-left, the cane quiver at the right hip read at 64 px; the crescent bracer is weak at 64 px; no braid, no mane |
| V-brea-face | §5 sheet: salt-line, pale left-brow scar, dark eyes, ∴ in the hand inset; profile visibly not the stock face |
| V-traversal | hands at the ledge edge with the body coming over them; low slide on the face; standing on the top step |

### 4.5 Global green list (the items that exist in this tree; one run, `--only`, port 5252)

| gate | verdict | numbers |
|---|---|---|
| A1-boot-clean | PASS | state = playing |
| A20b-no-system-errors | PASS | 0 errors, 361 frames |
| A90-memory-stability | PASS | heap −3.6 %, geometries +9, textures −28 |
| A90-memory-stability-expansion | PASS | objects −1,059, geometries +3 |
| A90b-memory-attribution | PASS | 0 offenders, heap −6.8 % |
| A90-rig-reclaim | PASS | geometries +10, textures 0 over 30 cycles |
| A9-perf-budget | FAIL (not attributable) | 282 draws; 38.4 fps with brand's judge Chrome running on the box at the same time (R26 / R33 f: graded by the orchestrator on the quiet box, port 5270) |
| A21-real-draw-calls | FAIL (not attributable) | draws 286 / 177 / 306 and triangles 4.07 / 3.59 / 4.16 M PASS; median GPU FAIL on the shared box |
| A-assets-tracked (pipeline file) | FAIL (§7 req. 1) | the only miss: `public/models/aloy.glb`, still named by `assets.specs.js` `SPECS.hero` |
| A-ID-ip-assets-gone, A-licence-manifest (pipeline file) | FAIL (§7 req. 2, 4) | `public/anims-hybrid/aloy-ual.json` (gates-perf, W0a) and the pending `archive_sha256`s |
| `A90-abs`, `A-alloc-rate`, `A-vram-ledger`, `A-no-horizon-terms-*`, `A-reach-all-sites`, `A-port-guard`, `A-carried-suite` | — | not in this tree (gates-perf / brand W0a files) |

## 5. Brea's sheets for Kevin (§3.1 W0b exit, §11 decision 1)

`reference/r5/hero/brea-silhouette-sheet.png` and `reference/r5/hero/brea-face-sheet.png` (plus the stock UBC
comparison renders `ubc-stock-front.png` / `ubc-stock-profile.png`; MANIFEST rows in
`reference/r5/hero/MANIFEST.md`). Made by `src/hero/sheets.js` through `tools/screenshot.mjs` on port 5252:

    node tools/screenshot.mjs _sheets --port 5252 --eval "(async () => { const S = await import('/src/hero/sheets.js');
      return { face: await S.faceSheetOverlay(__CTX__, await S.renderStockFace(__CTX__)), sil: await S.silhouetteSheetOverlay(__CTX__) }; })()"

Every sheet render is an isolated render of the live player with neutral lights, put through the screen's own
transform (ACES Filmic at the renderer's exposure, then sRGB) — the first cut read linear render-target bytes as
sRGB and came out ≈ 2.4× too dark, which is also why `A-brea-contrast` first failed on black sand.

## 6. Honest gaps and W0 bridges

- **W0 bridge — `SPECS.hero`.** `src/hero/rows.js` points the `hero` row at Brea at runtime; `assets.specs.js`
  (pipeline) still says `/models/aloy.glb` in its file (§7 request 1). Nothing loads `aloy.glb`: the file is
  deleted and the boot is clean.
- **W0 bridge — bow pull.** `HeroRig._applyBowSolve` writes `pull` = 0.605 onto combat's three bow models once at
  boot (bow.js has no owner in W0b); armory reads `rigProfile.bow` in bow.js at W1 and the bridge goes.
- **The held bow is still combat's procedural Round-4 bow (9 meshes) in play.** `A-hero-draws` measures the W0
  loadout the plan names (the Sabina blockout) by binding it to combat's bow node with `hero.holdPreview()`;
  armory loads the GLB in bow.js at W1.
- **Gate staging moved off the W0 places table where the table is wrong on this map**, inside the gates this
  lane owns: `openGround`'s +Z strip climbs a rise 28 m out (A13's end-of-window speed read the hill — the cause
  of Round 4's "flaky" A13, 5.1 m/s against a 6.12 floor) and `runway` meets a collider 26 m out. `A13`,
  `A-run-arms` and `A33-hair-bounce` stage on `flatStrip(len)`: the flattest clear, dry straight run on the
  terrain (deterministic ring scan, worst slope ≤ 9°, twice the worst uphill grade, no blocking collider within
  1 m; on this map (−32.3, 128) heading +Z, 7° / 2.9°). A13's speed clause is the window's mean sim speed.
  world-props' `gatePlaces` (W1) should carry a `sprintStrip` place; the gates read it first when it exists
  (request 5).
- **`A-run-arms` pelvis bounce** is graded per stride cycle (the worst peak-to-peak inside one cycle; the window
  range is reported beside it, 0.079 m).
- **A-player-mods' noise field** reaches `player.noise` / `player.noiseMul`; `stimulus.addNoiseFilter` is not in
  this tree (instruments-core's W0b contract) — the player hooks it the moment it exists (`_hookNoise`).
- **The settings rebind panel** is shell-ui's (W2): `ACTIONS` / `ACTION_PAD` are exported for it.
- **No licence-clean ledge-climb still** in `reference/r5/**` yet (request 6); V-traversal's climb panel is
  graded on the written criteria.
- **A31b's film clause, A31f's flake, A31c** — §4.3.
- **V13's staging** (R33 g) holds RMB and the strafe key every frame until the freeze and paints a red
  "STAGING FAILED: not aiming" caption on the film when she is not aiming with the bow in hand at the freeze.
- **`public/LICENSES.json` third-party rows** for `ubc-standard`, `mco-fantasy-standard`, `ual2-standard` carry
  no `archive_sha256` yet: pipeline's W0b re-fetch records them (the check reports PENDING, owner named).

## 7. Requests to other lanes

1. **pipeline:** set `SPECS.hero` in `src/core/assets.specs.js` to
   `{ url: '/models/hero/brea.glb', targetHeight: 1.77913, yaw: 0, required: true }` and add the two hero-body rows
   (`heroOutfitPan1`, `heroStowKit`) and `ANIMS.heroUal2` as data, so `rows.js`'s runtime override becomes a no-op.
2. **pipeline / gates-perf:** drop the `aloy.glb` entries in `tools/optimize.mjs`, `tools/spike-hybrid-bake.mjs`
   and the scheduled-IP rows of `tools/licences/{lib,ip-scan}.mjs` (the file is gone; nothing in `src/` loads it).
   `public/anims-hybrid/aloy-ual.json` (gates-perf's W0a deletion) is the only IP hit `ip-scan` still reports.
3. **armory (W1):** load `public/models/hero/kit/bow-sabina-v0.glb` in `src/combat/bow.js`, read
   `rigProfile.bow` (drawLength / restZ / pull / arrowLen) there, and retire `HeroRig._applyBowSolve`.
4. **pipeline:** record `archive_sha256` for `ubc-standard`, `mco-fantasy-standard`, `ual2-standard` in the W0b
   re-fetch.
5. **world-props (W1):** publish `gatePlaces.sprintStrip` (≥ 50 m flat, clear, dry, straight) — A13, A-run-arms
   and A33 use it in place of their `flatStrip` search.
6. **gates-perf:** a licence-clean ledge-climb still (`tools/r5-refs/fetch.mjs`, slot `ledge-climb`).

## 8. The gate file and how it merges

`tools/gates.r5.hero-body.mjs` (generated by this lane's build script from gates-perf's re-staged carried
scopes, the vendored `gate-roster` / `gate-places` / `budgets`, and the lane's own gates) exports `GATES` and
`HERO_BODY_GATE_IDS`. It works with BOTH runners:

- the R5 registry runner (`gates.config.mjs` with `LANE_FILE_RE`, gates-perf's W0a): it auto-discovers the file;
  every row shadows the carried row of the same id;
- the Round-4 runner in this tree: it is loaded with `--extra tools/gates.r5.hero-body.mjs`; base rows of the
  same id (A2–A18, A28, A31, A32-draw-ramp, A33-rig-finite, V1–V4, V12–V14) are replaced IN PLACE, and rows that
  live in a `gates.round4.*` file are exported as `<id>@hero` (`shadowOf` names the row).

Run: `node tools/gates.mjs --port 5252 --extra tools/gates.r5.hero-body.mjs --lane hero-body`
(`--only <ids>` for a subset). At the merge the orchestrator folds the rows into `carried.mjs` (A-carried-suite
grades them on the merged build); the R5 runner needs no config edit.

Processes: this lane ran Vite on 5252 only (`npx vite --port 5252 --strictPort`), Chrome only through
`tools/gates.mjs` / `tools/screenshot.mjs` under the machine-wide Chrome slot, one at a time.

