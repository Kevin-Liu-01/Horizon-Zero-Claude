import * as THREE from 'three';
import {
  PERCEPTION, ENGAGE, ATTACKS, REACT, ALARM, ATTACK_MODE, ELEM_THRESHOLD,
  ECOSYSTEM, OVERRIDE,
} from './tables.js';
import { Squads } from './squad.js';
import { cannonMesh, cargoMesh, coreMesh, powerCellMesh, canisterMesh } from '../parts.js';

/**
 * ============ ROUND-4 MACHINE EXPANSION — BEHAVIOUR (machine-ai) ============
 *
 * Nine new kinds from `docs/research/casting-v4.md` §2 and `roster-v2.md` §3/§4:
 * Broadhead, Grazer, Snapmaw, Ravager, Shell-Walker, Corruptor, Stormbird,
 * Tallneck, Redeye Watcher. This file is everything about them that this lane
 * owns — senses, standoff band, move table, reactions, doctrine and spawn
 * layout. It owns no geometry and no pose code.
 *
 * ---------------------------------------------------------------- CHASSIS --
 * WHY THESE MACHINES CAN EXIST BEFORE THEIR SCULPTS DO.
 *
 * `machines-expansion` owns every species file, every donor model and every
 * row it wants to add to `tables.js`. This lane owns the brain. Rather than
 * block on the sculpts — or, worse, write nine species files inside another
 * lane's paths — each new kind ships with a CHASSIS: an existing species class
 * whose rig and gait it borrows for its body, while `kind` (and therefore
 * every table, every gate key and every line of doctrine below) is its own.
 * `Machine.modelKind` is the seam and it is three lines; `ai/sites.js` frees
 * GPU buffers against it so a Broadhead can never free a Strider's geometry.
 *
 * A Broadhead therefore thinks, herds, stampedes, charges, dies, decays and
 * respawns as a Broadhead today, on a Strider body. The handover is ONE call:
 *
 *     machines.registerKind('broadhead', Broadhead);   // machines-expansion
 *
 * after which the chassis is never constructed again and nothing in this file
 * changes. `machines.chassisAudit()` prints which kinds are still on one.
 *
 * ------------------------------------------------------------ TABLE MERGE --
 * Every row below is merged into `ai/tables.js` ONLY IF THAT KIND IS ABSENT.
 * `machines-expansion` is adding its own species rows to the same tables in
 * parallel; theirs win, ours fill the gap, and neither lane has to edit the
 * other's lines. `installExpansionTables()` runs at import time — before any
 * machine is constructed, which matters because `tables.cfg()` memoises the
 * merge of `default` with `[kind]` on first read.
 *
 * ------------------------------------------------------------ BAND HONESTY --
 * Every table here obeys the three rules `A41b-attack-coverage` gates and the
 * two `A41d-held-radius-coverage` adds:
 *   1. a row's `[min,max]` is reachable by the thing that builds it (these are
 *      all GENERIC builders, so range is a fact, not a hope);
 *   2. the union of the rows covers the whole engage band with no hole;
 *   3. no non-rear row is the sole answer for more than 70 % of the band;
 *   4. the shortest non-rear row's `max` clears the ring floor
 *      (`band[0] + hyst/2`), or the footwork can want it for ever and never
 *      fire it;
 *   5. a species whose ranged rows can be TORN OFF re-bands on the tear
 *      (`_rebandOnTear`), so the hole the tear opens is closed by doctrine
 *      rather than by a fabricated row.
 * `tools/gates.round4.machine-ai-expansion.mjs` asserts 1-5 per kind.
 */

const _v = new THREE.Vector3();

/* ====================================================================== */
/* 1. TABLES                                                              */
/* ====================================================================== */

/** Which existing species class carries each new kind until its own ships. */
export const CHASSIS = {
  broadhead: 'strider',
  grazer: 'strider',
  snapmaw: 'sawtooth',
  ravager: 'sawtooth',
  shellwalker: 'behemoth',
  corruptor: 'longleg',
  stormbird: 'glinthawk',
  tallneck: 'behemoth',
  redeye: 'watcher',
};

/** Body/stat block per kind (casting-v4 §2 headers). */
export const BODY = {
  broadhead: {
    displayName: 'Broadhead', maxHealth: 220, armor: 0.10, level: 7,
    bodyRadius: 1.15, eyeHeight: 1.62, walkSpeed: 2.4, runSpeed: 8.5,
    attackRange: 4.6, sightRange: 42,
  },
  grazer: {
    displayName: 'Grazer', maxHealth: 130, armor: 0.05, level: 5,
    bodyRadius: 0.85, eyeHeight: 2.30, walkSpeed: 2.6, runSpeed: 9.5,
    attackRange: 4.0, sightRange: 40,
  },
  snapmaw: {
    displayName: 'Snapmaw', maxHealth: 400, armor: 0.22, level: 13,
    bodyRadius: 1.3, standoffHalfLen: 2.6, eyeHeight: 0.85,
    walkSpeed: 1.6, runSpeed: 7.5, attackRange: 6.0, sightRange: 40,
    elemWeak: 'fire', elemResist: 'freeze',
  },
  ravager: {
    displayName: 'Ravager', maxHealth: 650, armor: 0.24, level: 18,
    bodyRadius: 1.5, eyeHeight: 2.6, walkSpeed: 2.4, runSpeed: 10,
    attackRange: 4.2, sightRange: 48, elemWeak: 'fire', elemResist: 'shock',
  },
  shellwalker: {
    displayName: 'Shell-Walker', maxHealth: 500, armor: 0.28, level: 17,
    bodyRadius: 1.8, eyeHeight: 2.2, walkSpeed: 2.0, runSpeed: 6.0,
    attackRange: 5.0, sightRange: 42, elemResist: 'shock',
  },
  corruptor: {
    displayName: 'Corruptor', maxHealth: 600, armor: 0.26, level: 19,
    bodyRadius: 1.6, standoffHalfLen: 2.2, eyeHeight: 1.1,
    walkSpeed: 3.0, runSpeed: 12, attackRange: 4.6, sightRange: 50,
    elemWeak: 'fire',
  },
  stormbird: {
    displayName: 'Stormbird', maxHealth: 1400, armor: 0.30, level: 26,
    bodyRadius: 2.2, eyeHeight: 3.7, walkSpeed: 8, runSpeed: 16,
    attackRange: 18, sightRange: 90, elemResist: 'shock',
  },
  tallneck: {
    displayName: 'Tallneck', maxHealth: 9000, armor: 0.95, level: 1,
    bodyRadius: 3.2, standoffHalfLen: 5.0, eyeHeight: 6.0,
    walkSpeed: 1.1, runSpeed: 1.1, attackRange: 0, sightRange: 0,
    docile: true, alignToTerrain: true,
  },
  redeye: {
    displayName: 'Redeye Watcher', maxHealth: 150, armor: 0.08, level: 9,
    bodyRadius: 0.92, eyeHeight: 1.9, walkSpeed: 2.7, runSpeed: 7.4,
    attackRange: 2.8, sightRange: 46,
    // the POINT of a Redeye: its CALM sensor is already red (casting §2.9)
    eyeCalm: '#ff2a1e',
  },
};

/** Senses (casting-v4 §2, `PERCEPTION` shape). */
const NEW_PERCEPTION = {
  broadhead: { gain: 2.1, periphRange: 9, scanSweep: 0.95, scanPeriod: 5.4, contactRange: 4.4 },
  grazer: { gain: 2.2, periphRange: 9.5, scanSweep: 1.05, scanPeriod: 4.6, contactRange: 4.0 },
  /**
   * AMBUSH IS A PERCEPTION SHAPE, NOT A NEW STATE (casting-v4 §2.3). A
   * basking Snapmaw notices LATE — a narrow peripheral arc and a slow sweep —
   * and then commits hard: `gain` 1.4 makes the fill from first contact to red
   * the fastest in the roster once the cone does land on her.
   */
  snapmaw: { gain: 1.4, periphRange: 5, scanSweep: 0.35, scanPeriod: 11, contactRange: 5.5 },
  ravager: { gain: 2.05, periphRange: 9, scanSweep: 0.8, contactRange: 5.0 },
  shellwalker: { gain: 1.9, periphRange: 8.5, scanSweep: 0.7, scanPeriod: 7.5, contactRange: 5.5 },
  corruptor: { gain: 2.2, periphRange: 10, scanSweep: 0.9, scanPeriod: 5, contactRange: 5.0 },
  stormbird: { gain: 2.0, periphRange: 12, scanSweep: 0.6, scanPeriod: 7, contactRange: 6.0 },
  /**
   * DOCILE: every sense zeroed (casting-v4 §2.8). Belt and braces with the
   * `docile` guard in `Machine.setState` — this makes the Tallneck incapable
   * of forming a suspicion in the first place, the guard makes it incapable of
   * acting on one if some other lane hands it one anyway.
   */
  tallneck: { gain: 0, periphWeight: 0, periphRange: 0, hearGain: 0, unseenHit: 0, engagedRange: 0, contactRange: 0 },
  /**
   * THE STRONGER ALARM CONE (roster-v2 §2 "Recon T2"; this lane's brief).
   * A Redeye is a Watcher that is better at the one job a Watcher has: a wider
   * focus cone (`focusPad`), more peripheral reach, a faster sweep and a
   * higher fill rate — and `ALARM.radius.redeye` 70 against the Watcher's 60.
   */
  redeye: {
    gain: 2.35, focusPad: 0.22, periphDeg: 165, periphRange: 12,
    periphWeight: 0.5, scanSweep: 1.15, scanPeriod: 4.4,
  },
};

/** Standoff bands (casting-v4 §2 `ENGAGE` lines). */
const NEW_ENGAGE = {
  broadhead: { archetype: 'skittish', band: [4.0, 15], orbitSpeed: 0.7, backSpeed: 0.9 },
  grazer: { archetype: 'skittish', band: [3.4, 13], orbitSpeed: 0.85, backSpeed: 0.95 },
  /**
   * band[1] 20 -> 16 and backSpeed 0.4 -> 0.6, MEASURED (A41d-must-fire).
   * A croc orbited at 0.4 x 7.5 = 3 m/s and its cheap `lunge-bite` dashes
   * 6.5 m forward, so the card's 20 m outer edge was a radius this species
   * structurally could not hold: 0.13 decayed seconds inside the mortar shell
   * across a 22 s duel, and the mortar never fired. A band whose outer third
   * the footwork never reaches is the same lie as a row whose builder cannot
   * reach its range — it just fails on terrain instead of arithmetic.
   *
   * orbitSpeed 0.4 -> 0.5 and backSpeed 0.6 -> 0.7 after the 5-seed sweep:
   * at 3 m/s it needed most of a 20 s duel just to travel between the bite
   * shell (5.8-7 m) and the mortar shell (11-15.7 m), and one run in five
   * showed only two of its four moves. 3.75 m/s is still the second-slowest
   * orbit in the roster and slower than everything but a Shell-Walker.
   */
  snapmaw: { archetype: 'bruiser', band: [5.5, 16], orbitSpeed: 0.5, backSpeed: 0.7, orbitFlip: [3.5, 7] },
  /**
   * band[1] 22 -> 18 and backSpeed 0.75 (default 0.55), same reading: the
   * Ravager banked 0.05 s inside its 12-21.7 m cannon shell and reached
   * 6.19 m, because its own `pounce` covered 11 m of ground per throw and put
   * it back at knife range. The pounce is shortened below; the band comes in
   * to meet what is left, and a cat that opens the range to use a dorsal
   * cannon has to be able to back up faster than it strolls.
   */
  ravager: { archetype: 'stalker', band: [3.0, 18], orbitSpeed: 0.7, backSpeed: 0.75, orbitFlip: [2, 4] },
  /**
   * band 5-24 -> 4.4-16, MEASURED across three passes of
   * `A41d-held-radius-coverage`. A hexapod transport orbits at 0.4 x 6 =
   * 2.4 m/s and backs off at 3.3; on its own ground it settles at 5.9-9.3 m
   * and its measured `heldReach` never passed 11.25 / 11.81 / 10.13 m in
   * three 22 s duels. The card's 24 m outer edge, and then 18, were radii this
   * species structurally does not reach, so its two ranged rows were moves it
   * carried and could never take — which is exactly the defect A41d exists to
   * catch, arriving from the table side. The band now ends just past what the
   * footwork holds, the ranged floors come down to meet it (see
   * `homing-blast` below), and band[0] 5 -> 4.4 widens the 0.5 m sliver the
   * `claw-combo` shell had at the ring floor to 1.1 m.
   */
  shellwalker: { archetype: 'bruiser', band: [4.4, 16], orbitSpeed: 0.4, closeSpeed: 0.85, orbitFlip: [3.5, 7] },
  /**
   * band[1] 24 -> 20, MEASURED (A41d-must-fire). The Faro scuttle is fast
   * (0.85 x 12 = 10.2 m/s) but its home is the cauldron ruin and its measured
   * `heldReach` swung 7.9-20.3 m run to run on that broken ground — so the
   * outer 4 m of a 20 m-wide band was a coin flip, and `inferno-blast`
   * (shell 16-23.7 m) came up unfired-and-unstood-in once in five. 20 m keeps
   * both ranged rows inside the radii this ground reliably gives, and the
   * sole-answer share stays under 20 %.
   */
  corruptor: { archetype: 'stalker', band: [4, 20], orbitSpeed: 0.85, orbitFlip: [1.6, 3.2], jitter: 0.5 },
  stormbird: { archetype: 'flyer', band: [18, 40], orbitSpeed: 0.85 },
  tallneck: { band: [0, 0], leash: 0 },
  redeye: { band: [5.8, 20], orbitSpeed: 0.7, orbitFlip: [1.8, 3.6] },
};

/**
 * Move tables. IDs, ranges, cooldowns and scores are the card's; the BUILDERS
 * are generic, because the species files that would own an authored pose do
 * not exist in this lane. See the CHASSIS note — swapping a row to
 * `authored: '_hornStrike'` later changes nothing else.
 *
 * The one exception is the Redeye, whose chassis IS the Watcher: `_flashAttack`
 * and `_energyBlast` are real methods on that class right now, so those two
 * rows are authored and the Redeye's two signature moves are the Watcher's own
 * poses from day one.
 */
const NEW_ATTACKS = {
  // --- 2.1 Broadhead: band [4,15], ring floor 4.3 < horn-strike 4.8 ---------
  broadhead: [
    { id: 'horn-strike', min: 0, max: 4.8, cd: 3.2, score: 1.0, generic: 'lunge',
      params: { damage: 22, windup: 0.45, strike: 0.2, recover: 0.6, dash: 1.8, range: 4.6 } },
    { id: 'hind-kick', min: 0, max: 4.2, cd: 4.5, score: 0.78, arc: 'rear', generic: 'sweep',
      params: { damage: 20, windup: 0.4, strike: 0.18, recover: 0.6, range: 4.2, arcDeg: 200, knock: 7 } },
    { id: 'dash-horn', min: 4.2, max: 9.0, cd: 3.8, score: 0.9, generic: 'lunge',
      params: { damage: 26, windup: 0.5, strike: 0.24, recover: 0.75, dash: 4.4, range: 4.8 } },
    { id: 'horn-charge', min: 8.6, max: 32, cd: 6.5, score: 0.72, generic: 'charge',
      params: { damage: 30, windup: 0.6, strike: 0.8, recover: 0.85, speed: 14, knock: 10, range: 3.4 } },
  ],
  // --- 2.2 Grazer: band [3.4,13], ring floor 3.7 < rotor-stab 4.2 ----------
  grazer: [
    { id: 'rotor-stab', min: 0, max: 4.2, cd: 2.6, score: 1.0, generic: 'lunge',
      params: { damage: 14, windup: 0.34, strike: 0.16, recover: 0.5, dash: 1.6, range: 4.0 } },
    { id: 'hind-kick', min: 0, max: 3.8, cd: 4.0, score: 0.75, arc: 'rear', generic: 'sweep',
      params: { damage: 13, windup: 0.36, strike: 0.16, recover: 0.55, range: 3.8, arcDeg: 200, knock: 5 } },
    { id: 'leap-kick', min: 3.6, max: 7.4, cd: 3.4, score: 0.92, generic: 'lunge',
      params: { damage: 14, windup: 0.38, strike: 0.2, recover: 0.6, dash: 3.8, range: 4.0 } },
    { id: 'antler-charge', min: 7.0, max: 26, cd: 6.0, score: 0.7, generic: 'charge',
      params: { damage: 22, windup: 0.55, strike: 0.75, recover: 0.8, speed: 15, knock: 8, range: 3.2 } },
  ],
  // --- 2.3 Snapmaw: band [5.5,20], ring floor 5.8 < snap-bite 6.4 ---------
  snapmaw: [
    { id: 'snap-bite', min: 0, max: 6.4, cd: 2.8, score: 1.0, generic: 'lunge',
      params: { damage: 30, windup: 0.45, strike: 0.2, recover: 0.65, dash: 2.0, range: 6.0 } },
    { id: 'tail-spin', min: 0, max: 7.0, cd: 5.5, score: 0.8, generic: 'sweep',
      params: { damage: 34, windup: 0.6, strike: 0.26, recover: 0.9, range: 7.0, arcDeg: 300, knock: 8 } },
    { id: 'lunge-bite', min: 6.0, max: 12, cd: 4.2, score: 0.9, generic: 'lunge',
      params: { damage: 36, windup: 0.5, strike: 0.3, recover: 0.8, dash: 5.0, range: 6.4 } },
    // min 13 -> 11: the shell has to start inside the radii a 3 m/s croc holds
    { id: 'freeze-mortar', min: 11, max: 42, cd: 7.5, score: 0.85, generic: 'volley',
      params: { damage: 30, windup: 0.7, strike: 0.5, recover: 0.9, range: 42, shots: 2, arcDeg: 18, color: 0xbfe9ff } },
  ],
  // --- 2.4 Ravager: band [3,22], ring floor 3.3 < jaw-smash 4.0 -----------
  ravager: [
    { id: 'jaw-smash', min: 0, max: 4.0, cd: 2.0, score: 1.0, generic: 'lunge',
      params: { damage: 26, windup: 0.35, strike: 0.16, recover: 0.5, dash: 1.4, range: 3.8 } },
    { id: 'bite', min: 0, max: 5.0, cd: 2.8, score: 0.7, generic: 'lunge',
      params: { damage: 30, windup: 0.42, strike: 0.2, recover: 0.65, dash: 2.4, range: 4.2 } },
    { id: 'shock-cocoon', min: 0, max: 5.4, cd: 8, score: 0.8, generic: 'sweep',
      params: { damage: 33, windup: 0.7, strike: 0.3, recover: 0.9, range: 5.4, arcDeg: 360, knock: 6 } },
    // a POUNCE, not a charge across the arena: 16 m/s for 0.7 s covered 11.2 m
    // and landed the Ravager at knife range from anywhere in its band
    { id: 'pounce', min: 5.0, max: 14, cd: 4.0, score: 0.95, generic: 'charge',
      params: { damage: 34, windup: 0.5, strike: 0.5, recover: 0.8, speed: 13, knock: 10, range: 3.4 } },
    { id: 'cannon-burst', min: 10, max: 58, cd: 6.5, score: 0.9, generic: 'volley', needPart: 'cannon',
      params: { damage: 34, windup: 0.6, strike: 0.6, recover: 0.9, range: 58, shots: 3, arcDeg: 12, color: 0xffb36b } },
  ],
  // --- 2.5 Shell-Walker: band [5,24], ring floor 5.3 < claw-combo 5.8 -----
  shellwalker: [
    { id: 'claw-combo', min: 0, max: 5.8, cd: 3.0, score: 1.0, generic: 'flurry',
      params: { damage: 34, hits: 3, windup: 0.5, strike: 0.9, recover: 0.7, range: 5.0, arcDeg: 150, close: 6 } },
    // the 1.1 s windup IS the "whole body charges" telegraph (casting §2.5)
    { id: 'shock-nova', min: 0, max: 11, cd: 10, score: 0.85, generic: 'sweep',
      params: { damage: 44, windup: 1.1, strike: 0.35, recover: 1.2, range: 11, arcDeg: 360, knock: 14 } },
    { id: 'shock-volley', min: 9, max: 34, cd: 5.0, score: 0.8, generic: 'volley', needPart: 'lightning-gun',
      params: { damage: 28, windup: 0.6, strike: 0.5, recover: 0.8, range: 34, shots: 3, arcDeg: 12, color: 0xbfe8ff } },
    // min 13 -> 9.5: measured, this chassis holds 5.9-10.1 m on its own ground
    { id: 'homing-blast', min: 9.5, max: 48, cd: 8, score: 0.9, generic: 'volley', needPart: 'lightning-gun',
      params: { damage: 38, windup: 0.8, strike: 0.5, recover: 1.0, range: 48, shots: 1, arcDeg: 22, color: 0x9fd8ff } },
  ],
  // --- 2.6 Corruptor: band [4,24], ring floor 4.3 < talon-strike 5.0 ------
  corruptor: [
    { id: 'talon-strike', min: 0, max: 5.0, cd: 1.8, score: 1.0, generic: 'lunge',
      params: { damage: 22, windup: 0.32, strike: 0.15, recover: 0.5, dash: 1.6, range: 4.6 } },
    { id: 'tail-sweep', min: 0, max: 9.5, cd: 5.0, score: 0.88, generic: 'sweep',
      params: { damage: 24, windup: 0.55, strike: 0.3, recover: 0.8, range: 9.5, arcDeg: 360, knock: 9 } },
    { id: 'leap', min: 6, max: 18, cd: 5.5, score: 0.9, generic: 'charge',
      params: { damage: 26, windup: 0.5, strike: 0.85, recover: 0.8, speed: 16, knock: 10, range: 3.4 } },
    { id: 'corruption-spike', min: 12, max: 46, cd: 6.0, score: 0.85, generic: 'volley', needPart: 'spike-launcher',
      params: { damage: 30, windup: 0.6, strike: 0.5, recover: 0.85, range: 46, shots: 3, arcDeg: 12, color: 0xff4a2a } },
    // min 16 -> 13.5: the shell has to sit inside the band this ground gives
    { id: 'inferno-blast', min: 13.5, max: 60, cd: 11, score: 0.8, generic: 'volley', needPart: 'grenade-launcher',
      params: { damage: 42, windup: 0.9, strike: 0.5, recover: 1.1, range: 60, shots: 1, arcDeg: 26, color: 0xff7a1e } },
  ],
  /**
   * --- 2.7 Stormbird: band [18,40] -------------------------------------
   * The two GROUNDED rows carry the negated `needPart` this expansion needed
   * (`AttackPicker._needPartOk`): they are illegal while any engine is still
   * attached, which makes air-to-ground a data fact. Sole-answer share across
   * 18-40 m is 0 % — three rows answer every metre of the band.
   */
  stormbird: [
    { id: 'thunder-clash', min: 12, max: 90, cd: 11, score: 1.0, generic: 'volley', needPart: 'engine',
      params: { damage: 60, windup: 0.9, strike: 0.6, recover: 1.1, range: 90, shots: 3, arcDeg: 14, color: 0xbfe8ff, knock: 8 } },
    { id: 'shock-blast', min: 14, max: 70, cd: 6, score: 0.9, generic: 'volley', needPart: 'lightning-gun',
      params: { damage: 34, windup: 0.6, strike: 0.5, recover: 0.9, range: 70, shots: 2, arcDeg: 12, color: 0x9fd8ff } },
    { id: 'bomb-run', min: 25, max: 80, cd: 13, score: 0.85, generic: 'volley',
      params: { damage: 46, windup: 0.8, strike: 0.7, recover: 1.0, range: 80, shots: 4, arcDeg: 20, color: 0xff9a3d } },
    /**
     * max 17.5, not the card's 18. A row that ends EXACTLY on the band floor
     * is the livelock `AttackPicker._reachable` exists to reject: the ring
     * window starts half a hysteresis above `band[0]`, so at 18.0 the screech
     * reaches into the band and no holdable ring can ever set it up
     * (`bandBlocked` 1, asserted per sim step by `A41c`). Below the floor it
     * is honestly OUT of the airborne standoff — and it comes back the moment
     * the Stormbird is GROUNDED and re-bands to [4, 20], which is exactly
     * where a screech belongs (roster-v2 §4: the landed phase).
     */
    { id: 'screech-stun', min: 0, max: 17.5, cd: 9, score: 0.8, generic: 'sweep',
      params: { damage: 18, windup: 0.8, strike: 0.3, recover: 1.0, range: 17.5, arcDeg: 200, knock: 6 } },
    { id: 'tail-lash', min: 0, max: 20, cd: 5, score: 0.75, arc: 'rear', generic: 'sweep', needPart: '!engine',
      params: { damage: 30, windup: 0.5, strike: 0.26, recover: 0.8, range: 20, arcDeg: 220, knock: 9 } },
    { id: 'thunder-rush', min: 8, max: 36, cd: 7, score: 0.82, generic: 'charge', needPart: '!engine',
      params: { damage: 52, windup: 0.7, strike: 0.9, recover: 1.1, speed: 20, knock: 16, range: 4 } },
  ],
  // --- 2.8 Tallneck: it has no attacks, and that is the whole species -----
  tallneck: [],
  // --- 2.9 Redeye: band [5.8,20], ring floor 6.1 < skitter-bite 6.6 ------
  redeye: [
    { id: 'energy-blast', min: 6, max: 52, cd: 4.5, score: 1.0, authored: '_energyBlast', cdField: '_cdBlast', needPart: 'blaster' },
    { id: 'peck', min: 0, max: 3.1, cd: 2.1, score: 0.9, generic: 'lunge',
      params: { damage: 12, windup: 0.26, strike: 0.12, recover: 0.42, dash: 1.2, range: 3.0 } },
    { id: 'skitter-bite', min: 0, max: 6.6, cd: 3.4, score: 0.8, generic: 'lunge',
      params: { damage: 14, windup: 0.3, strike: 0.14, recover: 0.5, dash: 3.2, range: 3.6 } },
    { id: 'flash', min: 5.5, max: 12, cd: 12, score: 0.75, authored: '_flashAttack', cdField: '_cdFlash' },
  ],
};

/** Hit reactions (`REACT` shape). */
const NEW_REACT = {
  broadhead: { staggerFrac: 0.13, downedFrac: 0.30 },
  grazer: { staggerFrac: 0.14, downedFrac: 0.28, downedTime: [3, 4] },
  snapmaw: { staggerFrac: 0.12, downedFrac: 0.30 },
  ravager: { staggerFrac: 0.12, downedFrac: 0.32, critDamage: 0.32 },
  shellwalker: { staggerFrac: 0.12, downedFrac: 0.34, impulse: 0.7, pushBack: 0.22 },
  corruptor: { staggerFrac: 0.12, downedFrac: 0.30, impulse: 0.8 },
  stormbird: { staggerFrac: 0.11, downedFrac: 0.30, impulse: 0.5, pushBack: 0.15, downedTime: [4, 5.5] },
  /** Every threshold above 1.0 of maxHP: nothing about a Tallneck reacts. */
  tallneck: { flinchFrac: 2, staggerFrac: 2, downedFrac: 2, tearStaggers: false },
  redeye: { staggerFrac: 0.14, downedFrac: 0.34, downedTime: [3, 4] },
};

const NEW_ELEM = {
  broadhead: 95, grazer: 75, snapmaw: 170, ravager: 260, shellwalker: 230,
  corruptor: 250, stormbird: 480, tallneck: 99999, redeye: 85,
};

const NEW_ALARM = { redeye: 70, shellwalker: 55, tallneck: 0 };

/** Only the Broadhead is mountable (casting-v4 §2.1). */
const NEW_OVERRIDE = {
  broadhead: { mount: true, time: 1.3 },
  grazer: { mount: false, time: 1.1 },
  snapmaw: { mount: false, time: 1.6 },
  ravager: { mount: false, time: 2.0 },
  shellwalker: { mount: false, time: 1.8 },
  redeye: { mount: false, time: 1.1 },
  // corruptor / stormbird / tallneck are deliberately absent: the Spear does
  // not take a Faro machine, a T5 flier or a comms tower.
};

/**
 * Every new kind is `table`-driven. The chassis class still has its OWN
 * `chooseAttack()` ladder (a Glinthawk dive, a Sawtooth pounce), and in the
 * default `hybrid` mode that ladder's candidate competes with — and can WIN
 * over — the table, which would have a Stormbird throwing a Glinthawk's dive.
 * `table` mode never consults it. This is also what the real species files
 * will want, since every row above names its builder explicitly.
 */
const NEW_MODE = [
  'broadhead', 'grazer', 'snapmaw', 'ravager', 'shellwalker',
  'corruptor', 'stormbird', 'tallneck', 'redeye',
];

/** Merge a block of per-kind rows, never overwriting an existing kind. */
function mergeKinds(target, rows) {
  const added = [];
  for (const k of Object.keys(rows)) {
    if (Object.prototype.hasOwnProperty.call(target, k)) continue;
    target[k] = rows[k];
    added.push(k);
  }
  return added;
}

let _installed = null;

/**
 * Fold the expansion rows into `ai/tables.js`. Idempotent, non-destructive,
 * and runs at import time so no machine can be constructed before it.
 * @returns {string[]} the kinds this call actually added
 */
export function installExpansionTables() {
  if (_installed) return _installed;
  const added = mergeKinds(ATTACKS, NEW_ATTACKS);
  mergeKinds(PERCEPTION, NEW_PERCEPTION);
  mergeKinds(ENGAGE, NEW_ENGAGE);
  mergeKinds(REACT, NEW_REACT);
  mergeKinds(ELEM_THRESHOLD, NEW_ELEM);
  mergeKinds(ALARM.radius, NEW_ALARM);
  mergeKinds(OVERRIDE.kinds, NEW_OVERRIDE);
  for (const k of NEW_MODE) if (!ATTACK_MODE[k]) ATTACK_MODE[k] = 'table';
  // the Grazer herd's declared combat escort and the Broadhead herd's recon
  // escort (casting-v4 §2.1/§2.2) — SLOTS, not widened alarm radii
  if (!ECOSYSTEM.escort.redeye) {
    ECOSYSTEM.escort.redeye = { guards: ['broadhead', 'grazer'], radius: 26, band: [18, 34] };
  }
  if (!ECOSYSTEM.escort.ravager) {
    ECOSYSTEM.escort.ravager = { guards: ['grazer'], radius: 70, band: [40, 90] };
  }
  _installed = added;
  return added;
}

installExpansionTables();

/* ====================================================================== */
/* 2. COMPONENTS                                                          */
/* ====================================================================== */

/**
 * The components the BEHAVIOUR depends on.
 *
 * A `needPart` row is only honest if the part exists: `_partAttached` answers
 * `true` for a name no part carries, so a Ravager with no cannon component
 * would fire `cannon-burst` for ever and the "tear the cannon, lose the move"
 * loop the roster is built on would be unreachable. These are therefore
 * FUNCTIONAL parts — tear HP, linked attack, loot, pickup — hung off
 * `parts.js` primitives at spawn. `machines-expansion` replaces the mesh
 * (and only the mesh) when its species file ships.
 */
const COMPONENTS = {
  ravager: (m) => {
    m.addPart({
      name: 'cannon', displayName: 'Dorsal Cannon',
      mesh: cannonMesh({ accent: 0xffb36b }),
      pos: [0, m.eyeHeight * 0.92, -0.35], tearHp: 220,
      linkedAttack: 'cannon-burst',
      // the Thunderjaw disc-launcher pickup path, reused verbatim
      pickupWeapon: 'ravager-cannon',
      loot: [{ id: 'metal-shard', n: [12, 22] }],
      sparkleWhileTorn: true,
    });
    m.addPart({
      name: 'power-cell', displayName: 'Power Cell',
      mesh: powerCellMesh({ color: 0xffd23d }),
      pos: [0, m.eyeHeight * 0.55, -1.1], tearHp: 90,
      elemental: 'shock', weak: true, weakMult: 2.5,
    });
  },
  shellwalker: (m) => {
    m.addPart({
      name: 'cargo', displayName: 'Cargo Crate', mesh: cargoMesh(),
      pos: [0, m.eyeHeight * 0.7, -0.2], tearHp: 60,
      loot: [{ id: 'metal-shard', n: [20, 40] }],
    });
    m.addPart({
      name: 'lightning-gun', displayName: 'Lightning Gun',
      mesh: cannonMesh({ accent: 0xbfe8ff }),
      pos: [0.75, m.eyeHeight * 0.8, 0.6], tearHp: 150,
      linkedAttack: 'shock-volley', pickupWeapon: 'shellwalker-gun',
      sparkleWhileTorn: true,
    });
    m.addPart({
      name: 'shield-projector', displayName: 'Shield Projector',
      mesh: coreMesh({ color: 0x9fd8ff, r: 0.24 }),
      pos: [-0.75, m.eyeHeight * 0.8, 0.6], tearHp: 130,
    });
  },
  corruptor: (m) => {
    m.addPart({
      name: 'spike-launcher', displayName: 'Spike Launcher',
      mesh: cannonMesh({ accent: 0xff4a2a }),
      pos: [0.42, m.eyeHeight * 0.85, 0.2], tearHp: 140,
      linkedAttack: 'corruption-spike', sparkleWhileTorn: true,
    });
    m.addPart({
      name: 'grenade-launcher', displayName: 'Grenade Launcher',
      mesh: cannonMesh({ accent: 0xff7a1e }),
      pos: [-0.42, m.eyeHeight * 0.85, 0.2], tearHp: 140,
      linkedAttack: 'inferno-blast', sparkleWhileTorn: true,
    });
    // the exposed heat core IS the state channel and the crit window
    m.addPart({
      name: 'heat-core', displayName: 'Heat Core',
      mesh: coreMesh({ color: 0xff4a2a, r: 0.22 }),
      pos: [0, m.eyeHeight * 0.95, -0.55], tearHp: Infinity,
      weak: true, weakMult: 3,
    });
  },
  stormbird: (m) => {
    // six feather-jet engines: ALL of them must go before the grounded rows
    // become legal (`needPart: '!engine'`)
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1;
      const k = i % 3;
      m.addPart({
        name: 'engine', displayName: 'Feather Jet',
        mesh: canisterMesh({ color: 0x9fd8ff, r: 0.18, h: 0.5 }),
        pos: [side * (0.9 + k * 0.5), m.eyeHeight * 0.75, -0.2 - k * 0.35],
        tearHp: 120, elemental: null, sparkleWhileTorn: true,
      });
    }
    m.addPart({
      name: 'lightning-gun', displayName: 'Lightning Gun',
      mesh: cannonMesh({ accent: 0x9fd8ff }),
      pos: [0, m.eyeHeight * 0.55, 0.8], tearHp: 180,
      linkedAttack: 'shock-blast', sparkleWhileTorn: true,
    });
  },
  redeye: (m) => {
    m.addPart({
      name: 'blaster', displayName: 'Dorsal Blaster',
      mesh: cannonMesh({ accent: 0xff2a1e }),
      pos: [0, 1.52, -0.20], tearHp: 90,
      linkedAttack: 'energy-blast', sparkleWhileTorn: true,
    });
  },
  snapmaw: (m) => {
    m.addPart({
      name: 'freeze-sac', displayName: 'Chillwater Sac',
      mesh: canisterMesh({ color: 0xbfe9ff, r: 0.24, h: 0.55 }),
      pos: [0, m.eyeHeight * 0.75, 1.1], tearHp: 70,
      elemental: 'freeze', weak: true, weakMult: 2.5,
      linkedAttack: 'freeze-mortar',
    });
  },
  broadhead: (m) => {
    m.addPart({
      name: 'blaze-canister', displayName: 'Blaze Canister',
      mesh: canisterMesh({ color: 0xff7a1e, r: 0.2, h: 0.55 }),
      pos: [0.30, 1.34, -0.30], tearHp: 55, elemental: 'blaze',
    });
  },
  grazer: (m) => {
    for (let i = 0; i < 4; i++) {
      m.addPart({
        name: 'blaze-canister', displayName: 'Blaze Canister',
        mesh: canisterMesh({ color: 0xff7a1e, r: 0.16, h: 0.42 }),
        pos: [(i % 2 ? 0.22 : -0.22), 1.68, i < 2 ? 0.30 : -0.35],
        tearHp: 40, elemental: 'blaze',
      });
    }
  },
};

/* ====================================================================== */
/* 3. DOCTRINE                                                            */
/* ====================================================================== */

/**
 * A ranged species whose ranged rows can be TORN OFF re-bands on the tear.
 *
 * Casting-v4 §2.5 states the rule for the Shell-Walker and §2.4 implies it for
 * the Ravager: strip the gun and the outer half of the band becomes a range
 * with no answer, which `AttackPicker.coveredAt()` correctly reports as a hole
 * and `Engage` then spends the fight walking out of. Closing it with a
 * fabricated long row would be dishonest; closing it by CHANGING THE BAND is
 * the doctrine the card asks for, and it is one line per species.
 *
 * `machine.engageCfg` is the memoised per-kind config object shared by every
 * machine of that kind, so the re-band is written onto a per-MACHINE clone
 * (`ai.engage.cfg`) and never leaks to its siblings.
 */
const REBAND_ON_TEAR = {
  ravager: { cannon: [3, 14] },
  shellwalker: { 'lightning-gun': [2.5, 11] },   // both ranged rows drop
};

function rebandOnTear(m, partName) {
  const table = REBAND_ON_TEAR[m.kind];
  const band = table && table[partName];
  if (!band) return false;
  const eng = m.ai?.engage;
  if (!eng) return false;
  if (eng.cfg === m.engageCfg) eng.cfg = { ...m.engageCfg };   // per-machine copy
  eng.cfg.band = band.slice();
  eng._heldHi = Math.max(4, band[1] * 1.5);
  eng.ring = eng._pickRing();
  return true;
}

/** Herd kinds use the ONE shared stampede implementation (casting §5.5). */
const HERD_KINDS = new Set(['broadhead', 'grazer']);

/**
 * Install the per-machine doctrine for a newly spawned expansion machine.
 * Called from `Machines._spawnCls` for every kind in `BODY`, including
 * respawns, so a site that repopulates gets its doctrine back.
 *
 * Everything hung on the machine here is a closure over THAT machine and is
 * released by `Squads.forget` + `SiteManager.dispose` (`A90-memory-stability`):
 * no timers, no DOM, no scene objects, no listeners on the root bus.
 */
export function installDoctrine(m, opts = {}) {
  const kind = m.kind;
  if (!BODY[kind]) return false;

  COMPONENTS[kind]?.(m);

  // ---- herds: one shared stampede, one rearguard ------------------------
  if (HERD_KINDS.has(kind)) {
    // the base Machine holds `herd` for every species now, but a class that
    // builds its own is still honoured, and membership is idempotent
    if (!m.herd && opts.herd) m.herd = opts.herd;
    if (m.herd) {
      if (m.herd.members && !m.herd.members.includes(m)) m.herd.members.push(m);
      m.onAlerted = () => { Squads.alarmHerd(m); };
      m._flee = (dt) => Squads.stepFlee(m, dt);
      /**
       * ...and the stampede has to OWN the frame. `Machine._engageFrame`
       * already hands it `_flee`, but `alert` is a separate state and only
       * `strider.js` overrode `_stateAlert` to check `_fleeing`. A Broadhead
       * class that does not would stand in `alert` while its herd ran.
       */
      const baseAlert = m._stateAlert.bind(m);
      m._stateAlert = (dt) => {
        if (m._fleeing && Squads.stepFlee(m, dt)) return;
        baseAlert(dt);
      };
    }
  }

  // ---- Snapmaw: basking pair + water ambush ------------------------------
  if (kind === 'snapmaw') {
    m._basking = { t: 0, phase: Math.random() * 6.28 };
    m.onStateChange = (name) => {
      if (name !== 'alert' && name !== 'attack') return;
      const site = m.basking;
      if (!site || site.alarmed) return;
      site.alarmed = true;
      // the pair wakes WITH it — but they do not converge on the caller, they
      // come out of the water (casting-v4 §2.3: "notices late, then commits")
      for (const o of site.members) {
        if (o === m || !o.alive || o._disposed) continue;
        o.suspicion = Math.max(o.suspicion, 0.85);
        o._unseenT = 0;
        o.lastKnown.copy(m.lastKnown);
        if (o.state === 'patrol' || o.state === 'return') o.setState('alert');
      }
    };
  }

  // ---- Ravager: cannon suppression, and the band survives the tear -------
  // ---- Shell-Walker: convoy crate guard, shield arm ----------------------
  if (REBAND_ON_TEAR[kind]) {
    m._onPartTorn = (part) => rebandOnTear(m, part.name);
  }

  // ---- Corruptor: tail-corruption of nearby machines ---------------------
  if (kind === 'corruptor') {
    m._corruptor = { victims: [], t: ECOSYSTEM.corruption.period };
  }

  // ---- Stormbird: solo flyer, grounded permanently once the jets are gone -
  if (kind === 'stormbird') {
    m.flyCruise = 16;
    m._onPartTorn = () => {
      const jets = m.parts.filter((p) => p.name === 'engine' && p.attached).length;
      if (jets > 0) return false;
      // ALL SIX GONE = GROUNDED FOR GOOD (roster-v2 §4). The two grounded rows
      // become legal at the same instant through `needPart: '!engine'`, so the
      // fight changes shape from data alone.
      m._airborne = false;
      m.flyCruise = 0;
      const eng = m.ai?.engage;
      if (eng) {
        if (eng.cfg === m.engageCfg) eng.cfg = { ...m.engageCfg };
        eng.cfg.band = [4, 20];
        eng.cfg.archetype = 'bruiser';
        eng._heldHi = 30;
        eng.ring = eng._pickRing();
      }
      m.emit('machine-grounded', { machine: m });
      return true;
    };
  }

  // ---- Tallneck: docile fixed loop --------------------------------------
  if (kind === 'tallneck') {
    m.docile = true;
    m.alarmRadius = 0;
    m.suspicion = 0;
  }

  if (opts.eyeCalm || BODY[kind].eyeCalm) {
    m._eyeCalm = new THREE.Color(opts.eyeCalm || BODY[kind].eyeCalm);
    m._eyeColor.copy(m._eyeCalm);
  }
  return true;
}

/**
 * Manager-side install: one listener for the part-tear hook the doctrine needs.
 *
 * ONE listener for the whole manager, not one per machine — a per-machine
 * subscription to a long-lived bus is the exact shape `A90-memory-stability`
 * punishes, because the bus then retains every machine that ever existed.
 * This one is registered once, keyed by the event payload, and never removed
 * because the manager outlives the world.
 */
export function installExpansionDoctrine(machines) {
  const ctx = machines.ctx;
  ctx.events.on('part-torn', ({ machine, part }) => {
    machine?._onPartTorn?.(part);
  });
  return machines;
}

/* ====================================================================== */
/* 4. SPAWN LAYOUT (casting-v4.md §3)                                     */
/* ====================================================================== */

/**
 * Sites, with the clearances the casting doc measured against the live Round-3
 * roster. Counts are TRIMMED from the card's (Broadhead x5 -> x2, Grazer x6 ->
 * x2, Snapmaw x3 -> x2): nine new kinds on one valley is a draw-call and a
 * scene-node budget question as much as a casting one, and this lane's brief
 * is to keep `A9-perf-budget` / `A21-real-draw-calls` / `A90-memory-stability`
 * no worse than it found them. The DOCTRINE all works at these counts — a herd
 * of two still stampedes with one rearguard, a convoy of two still closes
 * ranks around its carrier, a basking pair is what the card calls for anyway —
 * and the counts are the one thing `machines-expansion` can raise for free
 * once its LOD chains land.
 *
 * `poi` names the world-props POI a site belongs to. `world-props-expansion`
 * publishes its site list on `ctx.worldSites`; when that list is present, a
 * site with a matching `poi` is MOVED onto the published anchor, so the
 * machines stand at the landmark rather than near it. When it is absent (this
 * lane may land first) the measured fallback below is used and the report says
 * which was taken.
 */
export const SPAWN_PLAN = [
  { kind: 'broadhead', n: 2, x: -80, z: 170, route: 28, herd: true, poi: 'north-meadow',
    escort: { kind: 'redeye', n: 2, radius: 26 } },
  { kind: 'grazer', n: 2, x: -30, z: -150, route: 26, herd: true, poi: 'south-flats' },
  { kind: 'ravager', n: 1, x: -120, z: -195, route: 28, poi: 'south-ridge' },
  { kind: 'snapmaw', n: 2, x: -174, z: -160, route: 12, basking: true, poi: 'river-pools' },
  { kind: 'shellwalker', n: 2, x: 228, z: 18, route: 30, convoy: true, poi: 'east-road' },
  { kind: 'redeye', n: 1, x: 232, z: 128, route: 22, poi: 'east-shelf' },
  { kind: 'corruptor', n: 1, x: 175, z: -195, route: 26, poi: 'cauldron' },
  { kind: 'stormbird', n: 1, x: 150, z: 230, route: 40, poi: 'north-spire' },
  { kind: 'tallneck', n: 1, x: -30, z: 245, route: 42, poi: 'tallneck-loop' },
];

/**
 * Where a site actually goes: the published world-props POI when there is one,
 * else the measured fallback. Never inside the camp keep-out and never outside
 * the `_route` 310 m clamp — both are re-checked here because a POI list this
 * lane does not own could put a Stormbird in the hunter camp.
 */
export function siteAnchor(ctx, plan) {
  const out = { x: plan.x, z: plan.z, from: 'casting-v4' };
  const sites = ctx.worldSites;
  const list = Array.isArray(sites) ? sites : (sites && typeof sites.list === 'function' ? sites.list() : null);
  if (list && plan.poi) {
    const hit = list.find((s) => s && (s.id === plan.poi || s.name === plan.poi || s.poi === plan.poi));
    if (hit && Number.isFinite(hit.x) && Number.isFinite(hit.z)) {
      out.x = hit.x; out.z = hit.z; out.from = 'world-props:' + plan.poi;
    }
  }
  // camp keep-out (the same circle `Machines._route` respects)
  const dx = out.x - 22, dz = out.z - 30;
  const d = Math.hypot(dx, dz);
  if (d < 46) {
    out.x = 22 + (dx / (d || 1)) * 46;
    out.z = 30 + (dz / (d || 1)) * 46;
    out.clamped = 'camp';
  }
  const r = Math.hypot(out.x, out.z);
  if (r > 296) { out.x *= 296 / r; out.z *= 296 / r; out.clamped = 'rim'; }
  return out;
}

/**
 * Spawn the whole expansion roster. Called once, after the variety models are
 * loaded (the chassis species are among them). Returns an audit the gates and
 * the lane report read: what spawned, where it came from, and which kinds are
 * still riding a chassis.
 */
export function spawnExpansion(machines) {
  const ctx = machines.ctx;
  const audit = { spawned: 0, sites: [], chassis: [], skipped: [] };
  for (const plan of SPAWN_PLAN) {
    if (!machines.canSpawn(plan.kind)) { audit.skipped.push(plan.kind); continue; }
    const at = siteAnchor(ctx, plan);
    const rec = { kind: plan.kind, at: [+at.x.toFixed(1), +at.z.toFixed(1)], from: at.from, n: 0 };

    let herd = null;
    if (plan.herd) {
      herd = {
        center: new THREE.Vector3(at.x, 0, at.z),
        vector: new THREE.Vector3(0, 0, 1),
        alarmed: false, rearguard: null, members: [],
      };
      machines.squads.registerHerd(herd);
    }
    let basking = null;
    if (plan.basking) {
      basking = { x: at.x, z: at.z, members: [] };
      machines.squads.registerBasking(basking);
    }
    const convoyMembers = [];

    for (let i = 0; i < plan.n; i++) {
      const a = (i / Math.max(1, plan.n)) * Math.PI * 2 + 0.6;
      const rr = plan.n > 1 ? 7 + (i % 2) * 5 : 0;
      const m = machines.spawn(plan.kind, at.x + Math.sin(a) * rr, at.z + Math.cos(a) * rr, {
        herd,
        route: machines._route(at.x, at.z, plan.route, plan.kind === 'tallneck' ? 6 : 4, i * 1.9),
        heading: a,
        territory: plan.kind === 'snapmaw' ? { x: at.x, z: at.z, r: 12 } : null,
      });
      if (!m) continue;
      rec.n++;
      audit.spawned++;
      /**
       * NOT AN UNCONDITIONAL PUSH. The Strider chassis' own constructor
       * already does `if (this.herd) this.herd.members.push(this)`, so
       * appending here listed every member TWICE — which made the herd read
       * four strong with two machines and the "one rearguard, everyone else
       * runs" count come out as 2 of 3. When `machines-expansion` lands a
       * Broadhead class that does not self-register, this still adds it.
       */
      if (herd) machines.squads.join(m, herd, 'herd');
      /**
       * ...AND THE POOL GOES THROUGH THE SAME DOOR (fix round 2). This was
       * `basking.members.push(m); m.basking = basking;` — a raw attachment
       * that no MachineSite ever saw, so the pair's membership died on the
       * first respawn and the ambush never re-formed. `Squads.join` pushes,
       * elects, and writes the handle back into the site record.
       */
      if (basking) machines.squads.join(m, basking, 'basking');
      if (plan.convoy) convoyMembers.push(m);
    }

    if (plan.convoy && convoyMembers.length) {
      machines.squads.registerConvoy({
        members: convoyMembers,
        route: machines._route(at.x, at.z, plan.route, 4, 1.1),
        defend: 'cargo', radius: 9,
      });
    }

    // escorts hold SLOTS on a ring around the herd — not a widened alarm
    if (plan.escort && machines.canSpawn(plan.escort.kind)) {
      const guards = [];
      for (let i = 0; i < plan.escort.n; i++) {
        const seed = 0.9 + i * 2.6;
        const g = machines.spawn(plan.escort.kind,
          at.x + Math.sin(seed) * 30, at.z + Math.cos(seed) * 30,
          { route: machines._route(at.x, at.z, 32, 6, seed), heading: seed });
        if (g) { guards.push(g); audit.spawned++; }
      }
      if (guards.length) machines.squads.assignEscorts(at, guards, plan.escort.radius);
      rec.escorts = guards.length;
    }
    audit.sites.push(rec);
  }
  audit.chassis = machines.chassisAudit();
  return audit;
}

/** Everything a gate or the debug HUD needs to check this file's claims. */
export function doctrineAudit(machines) {
  const kinds = Object.keys(BODY);
  const out = { kinds, live: {}, squads: {} };
  for (const k of kinds) out.live[k] = 0;
  for (const m of machines.list) if (out.live[m.kind] !== undefined) out.live[m.kind]++;
  out.squads = {
    herds: machines.squads.herds.length,
    convoys: machines.squads.convoys.length,
    baskings: machines.squads.baskings.length,
    corrupted: machines.list.filter((m) => m.corrupted).length,
  };
  return out;
}

export { _v as _doctrineScratch };
