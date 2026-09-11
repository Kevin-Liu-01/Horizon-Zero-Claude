/**
 * Machine AI tuning tables — the ONE place cross-lane machine numbers live
 * (SPEC v4 §File ownership rule 2: "tuning that crosses lanes lives in data").
 *
 * Owner: `machine-ai`. Read by machine.js + ai/*. Species files stay pure
 * pose/mesh code; `machine-rig` may READ these tables but must not need to
 * edit them to change a silhouette.
 *
 * Every block is keyed by machine kind with a `default` fallback; `cfg()`
 * merges the two so a species only states what it changes.
 */

/* ------------------------------------------------------------------ */
/* PERCEPTION (machine-ai-03/04/05/06/12/19, stealth-*)                */
/* ------------------------------------------------------------------ */
/**
 * Sight fill is `gain / (1 + (d/d0)^2) * cone * pose * motion` per second,
 * integrated into `suspicion` (0..1). With the defaults below, a standing,
 * still player squarely in the cone reads:
 *
 *   30 m  suspicious @ 1.77 s   alert @ 3.53 s   (audit bar: >=1.5 / >=3.0)
 *   10 m  suspicious @ 0.41 s   alert @ 0.83 s   (audit bar: alert <= 1.5)
 *
 * There is deliberately NO 360-degree proximity bubble. What replaces it is a
 * short-range PERIPHERAL arc (`periphDeg` half-angle out to `periphRange`)
 * at `periphWeight` of the fill rate, plus the head/sensor scan sweep — a
 * machine still has a blind spot directly behind it, which is what makes the
 * stealth pillar work.
 */
export const PERCEPTION = {
  default: {
    d0: 12,              // metres at which the inverse-square fill halves
    gain: 2.05,          // fill/s at point blank, in-cone, standing, still
    focusPad: 0,         // extra half-angle (rad) on top of machine.sightHalf
    periphDeg: 150,      // half-angle (deg) of the short-range peripheral arc
    periphRange: 8,      // metres the peripheral arc reaches
    periphWeight: 0.4,   // fill multiplier inside the peripheral arc
    hiddenRange: 1.6,    // crouched IN TALL GRASS: this is the whole sight range
    hiddenPeriph: 0,     // ...and the peripheral arc is off entirely
    /**
     * ENGAGED CONTACT. A machine that is ALREADY fighting keeps its target
     * while it has an unobstructed line inside this radius, cone or no cone.
     *
     * This is not the 360-degree proximity bubble the audit deleted: that one
     * applied to a PATROLLING machine and let it find a crouched player behind
     * it at 4.9 m with no build-up. This one can never begin a detection — it
     * only applies in `attack` state, i.e. after the machine has already found
     * her the honest way — it still requires line of sight, and crouching into
     * tall grass still collapses sight to `hiddenRange` and breaks it.
     *
     * Without it a duel at 3 m had the machine losing a player standing dead
     * still in front of it 21 % of the time (orbit angular speed at knife
     * range outruns the body's turn rate, and a charge drives past her), which
     * dropped it into `search` and made it stand still mid-fight.
     */
    engagedRange: 8,
    engagedWeight: 1,
    /**
     * CONTACT RANGE — knife-range fallback for a machine ALREADY in the fight
     * (fix round 1, `A41b-attack-coverage`: "Scrapper does nothing at 2 m").
     *
     * `engagedRange` above still requires line of sight, and an optical line
     * at 2 m is the easiest one in the world to lose: a rock lip between two
     * capsule centres, a charge that drove past her, one perception tick of
     * lag. When it broke, `_engageFrame` fell to `pursue(lastKnown)` — which
     * never picks a move and never sets a footwork mode — so the machine
     * walked INTO the player at 1.3 m and threw nothing for seconds.
     *
     * Inside this radius a machine that is already fighting, and whose own
     * `lastKnown` is still accurate to within `contactSlack`, may act without
     * an optical line: it hears and feels what its jaws are on. It can never
     * begin a fight (only `attack` state reaches it), it never MOVES
     * `lastKnown` (so it cannot reveal a position it does not have), and a
     * machine that has genuinely lost her — stale `lastKnown` — gets nothing.
     */
    contactRange: 3.2,
    contactSlack: 2.0,   // metres of belief error still counted as "in contact"
    // Sensor sweep. CAPPED at half the focus half-angle in perception.js so a
    // target dead ahead is never swept out of the cone — the sweep widens
    // where the machine looks, it does not blink.
    scanSweep: 0.9,
    scanPeriod: 6.5,     // seconds per full sweep
    poseStand: 1, poseCrouch: 0.55,
    motionStill: 1, motionWalk: 1.25, motionRun: 1.6,
    decay: 0.10,         // suspicion bleed-off per second with nothing sensed
    decayCalm: 0.3,      // ...once a search episode has expired
    susEnter: 0.5,       // suspicion that flips patrol -> suspicious
    alertAt: 1,          // ...and suspicious -> alert
    hearGain: 0.8,       // suspicion/s at the centre of a noise stimulus
    hearCap: 0.95,       // hearing ALONE never reaches alert
    unseenHit: 0.7,      // suspicion an unseen hit plants (machine-ai-03)
    unseenJitter: 2.0,   // metres of error on the reconstructed shot origin
    targetEyeY: 1.2,     // LOS aims at the player's chest, not her feet
    tick: 0.1,           // perception tick (s)
    omni: null,          // { radius, part, weight, ignoreStealth } — TJ radar
  },
  watcher: { periphRange: 9, scanSweep: 1.05, scanPeriod: 5.2 },
  strider: { gain: 2.15, periphRange: 9, scanSweep: 1.0, scanPeriod: 5.0, contactRange: 4.4 },
  scrapper: { gain: 2.1, periphRange: 7.5 },
  glinthawk: { gain: 2.0, periphRange: 7, scanSweep: 0.7 },
  longleg: { gain: 2.1, periphRange: 8.5, scanSweep: 1.0, contactRange: 4.5 },
  sawtooth: { gain: 1.95, periphRange: 8, contactRange: 4.2 },
  // contact range scales with the body: a Behemoth's flank IS six metres of
  // machine, so "touching it" is not the same radius it is for a Scrapper.
  behemoth: { gain: 1.95, periphRange: 9, scanSweep: 0.7, scanPeriod: 8, contactRange: 6.5 },
  /**
   * `machine-ai-19` TJ canon: while the RADAR dish is attached the Thunderjaw
   * sees omnidirectionally out to 34 m and tall grass does not hide you. Tear
   * the dish off and stealth works again. This is per-species canon, not the
   * global bubble the audit deleted.
   */
  thunderjaw: {
    gain: 1.95, periphRange: 10, contactRange: 7.5,
    omni: { radius: 34, part: 'radar', weight: 0.8, ignoreStealth: true },
  },
};

/* ------------------------------------------------------------------ */
/* NOISE / STIMULUS (machine-ai-12, stealth-hearing-stimuli)           */
/* ------------------------------------------------------------------ */
export const NOISE = {
  /** Player locomotion noise: radius in metres, strength 0..1. */
  player: {
    crouch: { radius: 2.2, strength: 0.45 },
    walk: { radius: 9, strength: 0.7 },
    jog: { radius: 15, strength: 0.85 },
    sprint: { radius: 26, strength: 1 },
    minSpeed: 0.5,
    period: 0.2,
  },
  /** Default radii for one-shot world stimuli by kind. */
  kinds: {
    noise: { radius: 14, strength: 0.6 },
    impact: { radius: 18, strength: 0.7 },
    explosion: { radius: 45, strength: 1 },
    rock: { radius: 16, strength: 0.8, lure: true },
    whistle: { radius: 22, strength: 0.9, lure: true },
    lure: { radius: 22, strength: 0.9, lure: true },
    death: { radius: 40, strength: 0.9 },
  },
  /** A lure pulls a machine to the SOURCE and holds it there this long. */
  lureHold: 4.5,
};

/* ------------------------------------------------------------------ */
/* ALARM DOCTRINE (machine-ai-06/07, stealth-alarm-leaks-position)     */
/* ------------------------------------------------------------------ */
export const ALARM = {
  /** Recipients converge on the CALLER and go to `search` (yellow), never
   *  straight to the player's exact position in red. */
  recipientState: 'search',
  recipientSuspicion: 0.72,
  callerJitter: 3,      // metres of spread so a squad doesn't stack up
  radius: { watcher: 60, longleg: 75, default: 45 },
  /** Re-alarm cooldown so a squad does not chirp every frame. */
  cooldown: 6,
};

/* ------------------------------------------------------------------ */
/* SEARCH (machine-ai-11, stealth-search-behaviour-shallow)            */
/* ------------------------------------------------------------------ */
export const SEARCH = {
  duration: [12, 20],   // seconds of sweeping before giving up
  points: 4,            // sweep points generated around lastKnown
  radius: [6, 18],      // ring the sweep points sit in
  dwell: [1.2, 2.6],    // seconds spent looking around at each point
  lookSweep: 1.15,      // heading sweep amplitude while dwelling (rad)
  grassBias: 0.75,      // fraction of points biased onto tall-grass cover
  arrive: 2.4,          // metres that count as "reached the point"
  repath: 1.5,          // seconds between nav repaths
};

/* ------------------------------------------------------------------ */
/* ENGAGE LOCOMOTION (machine-ai-02/15/18)                             */
/* ------------------------------------------------------------------ */
/**
 * `band` is the standoff ring the machine wants to hold while fighting.
 * archetype only changes the flavour constants; the state machine is shared.
 */
export const ENGAGE = {
  default: {
    archetype: 'orbit',
    band: [4, 9],
    orbitFlip: [2.5, 5],     // seconds between circling direction flips
    orbitSpeed: 0.62,        // × runSpeed while circling
    closeSpeed: 1,
    backSpeed: 0.55,
    jitter: 0.35,            // lateral wander so two machines don't overlap
    // metres of hysteresis on the band edges: `back` is entered below band[0]
    // and only left above band[0] + hyst (same, mirrored, for `close` at
    // band[1]). Without it a duel that settles on an edge chatters modes every
    // frame and cancels its own footwork out.
    hyst: 0.6,
    repath: 1.4,
    missRecover: 1.1,        // seconds of backing off after a whiffed attack
    leash: 150,              // soft leash from the spawn/territory centre
    strafeFace: 1,           // 1 = keep facing the player while circling
  },
  /**
   * BAND FLOORS AND THE RING (FIX ROUND 2, judge-machine-ai-followup-r1).
   *
   * `Engage._ringWindow()` cannot hold a radius below `band[0] + hyst/2`, so a
   * move whose row ENDS within that clearance is a move the footwork can only
   * ever stand at the very edge of — the orbit's own radial slop then puts the
   * machine outside it at the moment it picks. Measured: the Scrapper held
   * ring 3.3 m against a `claw` capped at 3.4 m and threw `dart-bite` eight
   * times out of eight; the Strider did the same at 4.5 m against a 4.4 m
   * kick. Every close-range floor below is therefore set at least 0.8 m under
   * the shortest move it has to set up, which leaves >= 0.5 m of band the
   * machine can actually orbit in and still be in range.
   *
   *   watcher   4.6  (skitter-bite 5.6)   sawtooth 2.5 (swipe 3.4)
   *   strider   3.8  (front-kick  4.6)    scrapper 2.5 (claw  3.4)
   *   longleg   6.1  (jet-blast   7.0)
   */
  watcher: { band: [4.6, 11], orbitSpeed: 0.7, orbitFlip: [1.8, 3.6] },
  // the band's OUTER edge has to reach the outer moves, or the machine circles
  // forever at pounce range and its charge never gets a chance to exist
  // band[0] must reach the CLOSE moves too (the authored paw swipe tops out at
  // 3.4 m); a band that starts above a move's max range makes that move
  // unreachable footwork-wise and it never appears on screen.
  sawtooth: { archetype: 'stalker', band: [2.5, 14], orbitSpeed: 0.66, orbitFlip: [2, 4] },
  behemoth: { archetype: 'bruiser', band: [5, 12], orbitSpeed: 0.5, closeSpeed: 1, orbitFlip: [3, 6] },
  thunderjaw: { archetype: 'artillery', band: [14, 30], orbitSpeed: 0.55, orbitFlip: [3, 6], missRecover: 0.8 },
  /**
   * band 10-22 -> 4.2-14 (judge-machine-ai-followup-r0 §2). The old band sat
   * entirely ABOVE both kicks, so `_pickRing` could never park the Strider at
   * kick range and `charge` was the only row `coveredAt()` could satisfy
   * anywhere inside it — the dead zone was closed by making one move do
   * everything, which is `machine-ai-08` ("fixed attack ladder") again at the
   * other end of the range. The inner edge is now just below the front kick's
   * 4.4 m row so the footwork can set the kick up, and the outer edge is 14 m
   * so no single row owns more than 60 % of the band alone
   * (`A41b-attack-coverage` gates both).
   */
  strider: { archetype: 'skittish', band: [3.8, 14], orbitSpeed: 0.8, backSpeed: 0.9 },
  scrapper: { archetype: 'pack', band: [2.5, 10], orbitSpeed: 0.75, orbitFlip: [1.6, 3.2] },
  // band[1] 16 -> 12.5: the Longleg's longest move is the 13 m scream, so the
  // old outer edge parked it 3 m past anything it could throw (A41b).
  // band[0] 7 -> 6.4 (FIX ROUND 2): the jet blast is a 7 m cone and the ring
  // floor sat at 7.3 m, so the Longleg could arrange for a move it could never
  // be in range of — the Strider livelock in miniature, and it left the
  // species only TWO moves the footwork could set up. 6.4 puts the floor at
  // 6.7 m, inside the cone, and gives the harrier its third arrangeable move.
  longleg: { archetype: 'harrier', band: [6.1, 12.5], orbitSpeed: 0.7, orbitFlip: [2, 4] },
  glinthawk: { archetype: 'flyer', band: [12, 22], orbitSpeed: 0.8 },
};

/* ------------------------------------------------------------------ */
/* ATTACK TABLES (machine-ai-08/09, machine-ai-19)                     */
/* ------------------------------------------------------------------ */
/**
 * Scored move selection. Each row:
 *   id        move id (also the `kind` on the attack object + the event)
 *   min/max   range band in metres
 *   cd        cooldown seconds after use
 *   score     base desirability
 *   arc       'front' | 'rear' | 'any' — where the player must be
 *   authored  true  -> built by the species file's own private builder
 *   build(m, dist) -> attack object | null
 *
 * `authored` rows call into the species implementation by name. That is a
 * READ of machine-rig's file, never an edit: if the method is renamed the row
 * simply drops out and the generic fallback takes over.
 *
 * ---------------------------------------------------------------------------
 * BAND HONESTY (round-4 judge finding "strider dead zone", A41b)
 * ---------------------------------------------------------------------------
 * `authored: 'species'` is the ONE row shape that can lie. It builds only from
 * whatever `machine.chooseAttack(dist)` happened to offer this frame, so if
 * the species' own if-ladder guards the move more tightly than the row's
 * `min/max`, the row is legal at ranges where it can never build and the
 * machine simply throws nothing. That is exactly what happened to the Strider:
 * its `charge` row read 5-20 m while `strider.js` only offers a charge past
 * 15 m, its kicks stop at 4.2 m, and its own standoff band is 10-22 m — so the
 * footwork parked it at 12.5 m, dead centre of a 4.2-15 m hole, and it stood
 * there for the whole fight.
 *
 * Two rules now hold, and `A41b-attack-coverage` gates them:
 *   1. A row's `min/max` must be reachable by the thing that builds it. Where
 *      the species has a NAMED builder, the row calls it directly
 *      (`authored: '_method'` + `cdField`), which makes the table the single
 *      authority on range and cooldown. Only rows whose move is an inline
 *      object literal inside `chooseAttack()` still use `'species'`, and their
 *      bands are trimmed to that ladder's own guard.
 *   2. The union of the rows must cover the whole ENGAGE band with no hole.
 *      `AttackPicker.coveredAt()` measures this at runtime and `Engage` walks
 *      out of any hole it finds, but a table that needs the escape hatch every
 *      fight is a bug, not a design.
 *   3. ...and covering it with ONE row is not covering it. A band whose every
 *      metre has the same single answer is the fixed attack ladder wearing a
 *      coverage report: it passed rule 2 for the Strider while the species
 *      threw nothing but `charge` (judge-machine-ai-followup-r0). At least two
 *      non-rear rows must reach into the band, and no single row may be the
 *      sole answer for more than 70 % of it. `AttackPicker.bandProfile()`
 *      measures it; `A41b-attack-coverage` fails on it.
 */
export const ATTACKS = {
  watcher: [
    // guard: `dist > attackRange * 1.25` with attackRange 2.5 -> 3.125 m
    { id: 'peck', min: 0, max: 3.1, cd: 2.1, score: 1.0, authored: 'species' },
    { id: 'flash', min: 5.5, max: 11.5, cd: 12, score: 0.8, authored: '_flashAttack', cdField: '_cdFlash' },
    { id: 'energy-blast', min: 7, max: 26, cd: 6.5, score: 0.75, authored: '_energyBlast', cdField: '_cdBlast' },
    // reaches 5.6 rather than 4.4 so the 4.4-5.5 m hole between the bite and
    // the stun flash is closed (the dash is 2.6 m onto a 3.4 m bite)
    { id: 'skitter-bite', min: 0, max: 5.6, cd: 3.4, score: 0.62, generic: 'lunge',
      params: { damage: 12, windup: 0.32, strike: 0.14, recover: 0.5, dash: 2.6, range: 3.4 } },
  ],
  sawtooth: [
    { id: 'swipe', min: 0, max: 3.4, cd: 1.6, score: 1.0, authored: 'species' },
    { id: 'pounce', min: 3, max: 9, cd: 3.2, score: 0.95, authored: 'species' },
    // canon moves the Round-3 ladder never had (machine-ai-08)
    { id: 'charge', min: 6, max: 26, cd: 6.5, score: 0.92, generic: 'charge',
      params: { damage: 28, windup: 0.6, strike: 0.75, recover: 0.9, speed: 13, knock: 9, range: 3.2 } },
    { id: 'bite', min: 0, max: 4.6, cd: 2.6, score: 0.78, generic: 'lunge',
      params: { damage: 26, windup: 0.4, strike: 0.18, recover: 0.62, dash: 2.2, range: 4 } },
    /**
     * Canon (roster-v2 §4: "Berserker Fury multi-slash 3-10 m"). Round 4 shipped
     * a rear-arc `tail-lash` here, which was fabricated: roster-v2 §3 gives the
     * Sawtooth "Quadruped, front-heavy, NO TAIL", the rig has no tail bone, and
     * the move dealt 18 damage from behind with no visible limb and no
     * telegraph the player could see. Deleted; this is the move the audit
     * (machine-ai-08) actually asked for. Front arc, three slashes.
     */
    { id: 'berserker', min: 3, max: 10, cd: 9, score: 0.85, generic: 'flurry',
      params: { damage: 36, hits: 3, windup: 0.55, strike: 0.95, recover: 0.75, range: 4.6, arcDeg: 140, close: 11 } },
  ],
  behemoth: [
    { id: 'slam', min: 0, max: 12, cd: 7, score: 1.0, authored: 'species' },
    { id: 'gravity-boulder', min: 11, max: 42, cd: 9, score: 0.9, authored: 'species' },
    { id: 'charge', min: 6, max: 30, cd: 4.5, score: 0.9, authored: 'species' },
    { id: 'shoulder-check', min: 0, max: 7.5, cd: 5.5, score: 0.72, generic: 'sweep',
      params: { damage: 30, windup: 0.55, strike: 0.22, recover: 0.85, range: 7.5, arcDeg: 150, knock: 12 } },
  ],
  thunderjaw: [
    { id: 'tail', min: 0, max: 15, cd: 6, score: 1.0, arc: 'rear', authored: '_tailSweep', cdField: '_cdTail' },
    { id: 'stomp', min: 0, max: 11, cd: 6, score: 0.95, authored: '_stomp', cdField: '_cdStomp' },
    // machine-ai-19: the mouth laser is canon at ANY health, not under 40 %
    { id: 'laser', min: 13, max: 65, cd: 9.5, score: 0.88, authored: '_laser', pass: 'dist', cdField: '_cdLaser' },
    { id: 'disc', min: 16, max: 90, cd: 8.5, score: 0.82, authored: '_discs', cdField: '_cdDisc', needPart: 'disc-launcher' },
    // min 10.5, not 13: stomp stops at 11 and the bite at 7, so 11-13 m used
    // to be a hole a player could simply stand in (tail is rear-arc only)
    { id: 'cannon', min: 10.5, max: 70, cd: 7, score: 0.78, authored: '_cannonBurst', pass: 'dist', cdField: '_cdCannon' },
    { id: 'bite', min: 0, max: 7, cd: 4.5, score: 0.72, generic: 'lunge',
      params: { damage: 45, windup: 0.55, strike: 0.2, recover: 0.85, dash: 3.2, range: 7 } },
  ],
  /**
   * THE DEAD ZONE, fixed TWICE.
   *
   * Round 4 wave 1 closed the original 4.2-15 m hole by widening `charge` down
   * to 4.2 m. That removed the hole and created a worse one: with the engage
   * band at 10-22 m and both kicks capped at 4.4 m, `charge` became the ONLY
   * row legal anywhere the footwork ever stood, so the species had a single
   * move — and a gallop the roster puts at 15-50 m was being thrown from 5.5 m
   * (measured: front-kick at 2 m, charge at every other staging).
   *
   * The band now covers kick range (ENGAGE.strider above) and the ladder has a
   * middle rung, so each range has a DIFFERENT answer:
   *
   *   0   - 4.6 m   front-kick  the authored double front-kick, reach 4.6 m
   *   0   - 4.4 m   back-kick   authored, rear arc only (never arranged for)
   *   4.0 - 8.4 m   dash-kick   skitter in and land the same double kick
   *   8.2 - 30  m   charge      the committed gallop, back at gallop distance
   *
   * FIX ROUND 2 (judge-machine-ai-followup-r1): `front-kick`'s row max was
   * 4.4 m — a tenth of a metre INSIDE the smallest ring the footwork can hold
   * (band[0] 4.2 + half a hysteresis = 4.5 m). The kick was therefore the move
   * the picker arranged for on every flip and the one move that could never
   * fire, so the Strider held 4.5 m for a whole fight and threw `dash-kick`
   * seven times: the dead zone back for a third time, wearing the ring instead
   * of the range. The row now reads 4.6 m, which is what the builder actually
   * strikes with (`strider.js:_frontKick` -> `damagePlayer(16, 4.6)`), so it
   * is honest AND clears the ring floor. The livelock itself is closed
   * structurally in `AttackPicker._reachable` / `Engage._ringWindow` — this
   * row is data being truthful, not the fix.
   *
   * `dash-kick` is the canon "Double front-kick 0-7 m" (roster-v2 §4) with the
   * approach the authored version does not have: `lunge` dashes 4.2 m through
   * the strike phase and rolls its 4.6 m front-arc damage check every frame of
   * it, so from the row's own maximum it arrives at 4.2 m and connects. It is
   * built HERE rather than by widening `strider.js:_frontKick`, whose
   * `damagePlayer(16, 4.6)` is a standing kick and belongs to `machine-rig`;
   * the ask to give that builder the canon 7 m reach (and to correct its
   * stale "Charge 15-50 m (roster)" docstring, which `ATTACK_MODE.strider =
   * 'table'` has made unreachable) is published in the LANE CONTRACT.
   *
   * Coverage is continuous 0-30 m and no row is the sole answer for more than
   * 57 % of the 4.2-14 m band. `A41b-attack-coverage` asserts both.
   */
  strider: [
    { id: 'front-kick', min: 0, max: 4.6, cd: 3, score: 1.0, authored: '_frontKick' },
    { id: 'back-kick', min: 0, max: 4.4, cd: 4.5, score: 0.8, arc: 'rear', authored: '_backKick' },
    { id: 'dash-kick', min: 4, max: 8.4, cd: 3.6, score: 0.92, generic: 'lunge',
      params: { damage: 16, windup: 0.45, strike: 0.22, recover: 0.7, dash: 4.2, range: 4.6 } },
    { id: 'charge', min: 8.2, max: 30, cd: 6, score: 0.7, authored: '_charge', pass: 'dist', cdField: '_cdCharge' },
  ],
  scrapper: [
    { id: 'claw', min: 0, max: 3.4, cd: 2.4, score: 1.0, authored: 'species' },
    { id: 'laser', min: 7, max: 29, cd: 6, score: 0.85, authored: '_laserBurst', cdField: '_cdLaser' },
    // max 7.2, not 6.5: the old table left half a metre of nothing at exactly
    // the 7 m the Round-3 audit already caught this species parking at
    { id: 'dart-bite', min: 0, max: 7.2, cd: 3.2, score: 0.8, generic: 'lunge',
      params: { damage: 15, windup: 0.3, strike: 0.14, recover: 0.45, dash: 4.2, range: 3.2 } },
  ],
  glinthawk: [
    // `dive` claims the flock's single diver token, so a second Glinthawk has
    // only the spit — which is why the spit now reaches in to 5 m instead of 9
    { id: 'dive', min: 0, max: 34, cd: 6, score: 1.0, authored: 'species' },
    { id: 'freeze-spit', min: 5, max: 30, cd: 5, score: 0.85, authored: '_freezeSpit', cdField: '_cdSpit' },
  ],
  longleg: [
    { id: 'scream', min: 0, max: 13, cd: 8, score: 1.0, authored: 'species' },
    // the jet blast is a 7 m cone (`damagePlayer(24, 7)`), not a 20 m one; the
    // old row was legal out to 20 m and built nothing past 6.5
    { id: 'jet-blast', min: 0, max: 7, cd: 6, score: 0.85, authored: '_jetBlast', cdField: '_cdJet' },
    { id: 'peck', min: 0, max: 4, cd: 2.6, score: 0.8, authored: 'species' },
    // 0.9 s of strike at 13 m/s covers 11.7 m, so a 12 m hop actually arrives
    { id: 'hop-strike', min: 4, max: 12, cd: 5.5, score: 0.74, generic: 'charge',
      params: { damage: 22, windup: 0.5, strike: 0.9, recover: 0.8, speed: 13, knock: 7, range: 3 } },
  ],
};

/**
 * `table`  — selection is entirely table-driven; the species' own
 *            `chooseAttack()` is never consulted (its private builders are
 *            called by name instead, so canon gates like the Thunderjaw's
 *            40 %-health laser lock can be lifted from data).
 * `hybrid` — the species' `chooseAttack()` offers one candidate and the table
 *            rows compete with it. Default.
 */
export const ATTACK_MODE = { default: 'hybrid', thunderjaw: 'table', strider: 'table' };
export const attackMode = (kind) => ATTACK_MODE[kind] ?? ATTACK_MODE.default;

/** Scoring weights shared by every species. */
export const SCORING = {
  repeatPenalty: 0.45,   // × score when it is the move used last
  streakPenalty: 0.7,    // × score again when used twice in a row
  bandBonus: 0.25,       // × score for a move whose band centre is nearest
  randomness: 0.18,      // ± fraction of jitter so the ladder is never fixed
  missPenalty: 0.5,      // × score for a move that just whiffed
  missMemory: 6,         // seconds a whiff is remembered
  freshBonus: 1.3,       // × score for a move it has not shown this fight
  /**
   * ...and an ADDITIVE tier on top of it, applied after the jitter, so a legal
   * move the machine has not shown this fight ALWAYS outranks one it has.
   * Multiplicative freshness alone could be overturned by `randomness`, which
   * is what made a Sawtooth duel sometimes spend the whole window inside
   * pounce range and never reach its charge (A41 flaked ~1 run in 5).
   * Ordering AMONG fresh moves is still `score`-driven.
   */
  freshTier: 12,
  /**
   * ANTI-LIVELOCK (FIX ROUND 2, judge-machine-ai-followup-r1). Seconds the
   * footwork may keep setting up ONE move that never actually fires before it
   * gives that move up and arranges for something else, and how long the
   * give-up lasts. A move only holds the ring while it keeps its promise.
   *
   * The Strider's stuck ring had a specific cause (a row that ended inside the
   * ring clamp) and that cause is now unrepresentable — but "the machine wants
   * a move it can never take, so it holds one radius and throws one move for
   * the whole fight" is a CLASS, and it has now been produced three times by
   * three different mechanisms (a range hole, a stretched row, a clamped
   * ring). This is the bound on the class itself: whatever the reason, no move
   * can hold the footwork hostage for more than `arrangeGiveUp` seconds.
   */
  arrangeGiveUp: 8,
  stallHold: 8,
  /**
   * SETUP PATIENCE — seconds a machine will decline a move it has ALREADY
   * shown this fight while it is still walking to the range of one it has not.
   *
   * Without it a species whose cheap move closes the distance can never set a
   * long one up: the Scrapper's `dart-bite` lunges 4.2 m forward on a 3.2 s
   * cooldown, so every time the footwork took it out toward its 7 m laser the
   * bite came off cooldown first and dragged it back in — eleven attacks in
   * 30 s, two of them distinct, with the laser stalled out (A41c). Backing
   * off and then shooting is the whole read of that machine in HZD.
   *
   * Bounded three ways so it can never become a statue: it applies only to a
   * move the fight has NOT seen yet, only after the machine has already
   * thrown something (so the opening move is never delayed — `A41b` stages
   * five ranges and gives each 3 s), and only for this many seconds.
   */
  setupPatience: 2,
};

/* ------------------------------------------------------------------ */
/* REACTIONS — flinch / stagger / downed (combat-machine-no-flinch,    */
/* machine-ai-10)                                                      */
/* ------------------------------------------------------------------ */
export const REACT = {
  default: {
    flinchFrac: 0.04,     // damage fraction of maxHP that visibly flinches
    staggerFrac: 0.12,    // ...and that staggers (audit: >12 % maxHP)
    staggerTime: [0.6, 1.2],
    tearStaggers: true,   // tearing a component always staggers
    impulse: 1.0,         // scale of the `_react` pose impulse
    pushBack: 0.35,       // metres the body is shoved along the hit direction
    downedFrac: 0.3,      // one hit this big knocks it down outright
    downedStaggers: 3,    // ...or this many staggers inside `downedWindow`
    downedWindow: 8,
    downedTime: [3.5, 5],
    critDamage: 0.35,     // Critical Hit removes this fraction of maxHP
    critLabel: 'CRITICAL HIT',
    critHold: 0.35,
    staggerCd: 1.2,       // minimum seconds between staggers (no lock-loops)
  },
  watcher: { staggerFrac: 0.14, downedFrac: 0.34, downedTime: [3, 4] },
  strider: { staggerFrac: 0.14, downedFrac: 0.3 },
  scrapper: { staggerFrac: 0.13, downedFrac: 0.32 },
  glinthawk: { staggerFrac: 0.12, downedFrac: 0.26, downedTime: [4, 5.5] },
  longleg: { staggerFrac: 0.12, downedFrac: 0.3 },
  sawtooth: { staggerFrac: 0.12, downedFrac: 0.3, critDamage: 0.32 },
  behemoth: { staggerFrac: 0.12, downedFrac: 0.34, impulse: 0.6, pushBack: 0.2, staggerTime: [0.7, 1.2] },
  thunderjaw: { staggerFrac: 0.12, downedFrac: 0.35, impulse: 0.5, pushBack: 0.15, staggerTime: [0.7, 1.2] },
};

/* ------------------------------------------------------------------ */
/* ELEMENTAL TIERS (combat-elemental-no-tier-scaling)                  */
/* ------------------------------------------------------------------ */
/**
 * Buildup needed to trigger a status. `machine.elemental` stays normalised
 * 0..100 for the HUD; incoming `elementAmount` is scaled by 100/threshold, so
 * a 60-point Freeze arrow is one watcher and nine Thunderjaws.
 */
export const ELEM_THRESHOLD = {
  default: 100,
  watcher: 60,
  strider: 70,
  scrapper: 90,
  glinthawk: 110,
  longleg: 150,
  sawtooth: 240,
  behemoth: 380,
  thunderjaw: 520,
};

/* ------------------------------------------------------------------ */
/* MACHINE SITES — corpse lifecycle + respawn (perf-tech-08)           */
/* ------------------------------------------------------------------ */
export const SITE = {
  freeze: 10,        // s after death: stop animating, drop shadow casting
  fadeStart: 70,     // s after death: begin dissolving the wreck
  fadeTime: 12,      // s the dissolve takes
  keepLooted: 25,    // s a LOOTED wreck lingers before it starts fading
  respawn: [300, 420], // s after disposal before the site repopulates
  respawnMinDist: 120, // player must be at least this far away
  maxWrecks: 10,     // hard cap: the oldest wreck is disposed early
  farDispose: 200,   // a wreck this far from the player disposes immediately
};

/* ------------------------------------------------------------------ */
/* OVERRIDE / MOUNT (missing-systems-override-mount)                   */
/* ------------------------------------------------------------------ */
export const OVERRIDE = {
  /** Which species the Spear can override, and whether they can be ridden. */
  kinds: {
    strider: { mount: true, time: 1.1 },
    watcher: { mount: false, time: 1.0 },
    scrapper: { mount: false, time: 1.3 },
    longleg: { mount: false, time: 1.4 },
    sawtooth: { mount: false, time: 1.6 },
    behemoth: { mount: true, time: 1.8 },
    glinthawk: { mount: false, time: 1.5 },
    thunderjaw: { mount: false, time: 2.2 },
  },
  label: 'OVERRIDE',
  mountLabel: 'MOUNT',
  radius: 3.2,
  /** Overridden machines fight for the player inside this radius of her. */
  followBand: [4, 9],
  helpRadius: 40,
  eyeColor: 0x19ffd0,
  /** Mount: saddle height as a fraction of machine height, ride speeds. */
  seat: 0.78,
  rideSpeed: 11,
  rideTurn: 2.0,
};

/* ------------------------------------------------------------------ */
/* ECOSYSTEM (machine-ai-14)                                           */
/* ------------------------------------------------------------------ */
export const ECOSYSTEM = {
  /** Escort formation: which kinds shepherd which, and the slot ring. */
  escort: {
    watcher: { guards: ['strider'], radius: 22, band: [16, 30] },
    longleg: { guards: ['strider', 'scrapper'], radius: 26, band: [18, 34] },
  },
  /** Scavengers converge on fresh wrecks and pick them over. */
  scavenger: {
    kinds: ['scrapper'],
    radius: 90,
    window: 45,      // s a wreck stays attractive
    dwell: [8, 16],  // s spent picking at it
    arrive: 3.5,
  },
};

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
const _cache = new Map();

/** Merge `table.default` with `table[kind]` once and memoise. */
export function cfg(table, kind, tag) {
  const key = `${tag}:${kind}`;
  let v = _cache.get(key);
  if (!v) {
    v = { ...(table.default || {}), ...(table[kind] || {}) };
    _cache.set(key, v);
  }
  return v;
}

export const perceptionCfg = (kind) => cfg(PERCEPTION, kind, 'perc');
export const engageCfg = (kind) => cfg(ENGAGE, kind, 'eng');
export const reactCfg = (kind) => cfg(REACT, kind, 'react');
export const elemThreshold = (kind) => ELEM_THRESHOLD[kind] ?? ELEM_THRESHOLD.default;
export const alarmRadius = (kind) => ALARM.radius[kind] ?? ALARM.radius.default;
export const attackTable = (kind) => ATTACKS[kind] || [];
export const overrideCfg = (kind) => OVERRIDE.kinds[kind] || null;

/** Deterministic-ish pick inside a [min,max] pair. */
export function span(pair, r = Math.random()) {
  if (!Array.isArray(pair)) return pair;
  return pair[0] + (pair[1] - pair[0]) * r;
}
