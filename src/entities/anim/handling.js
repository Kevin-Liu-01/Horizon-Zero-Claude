/**
 * WEAPON HANDLING (M1a, the weapons brief step 1): who owns each weapon, when it changes hands, and the phase tables
 * of the draws and stows, in SECONDS OF SIM TIME (the animator's dt, never the wall clock).
 *
 * One rule: a weapon has exactly one owner at every step ('carry' on her back, 'handL', 'handR'). It changes owner
 * only at a GRIP event (the hand on its socket, the fingers closed) or a RELEASE event (seated in its keeper, the
 * fingers opening), and it moves only while a hand owns it. `carryStow.js` runs the bow on these tables;
 * `meleeLayer.js` reports the lance's events on `melee.js`'s stance clock (which stays the lance's master: R5).
 *
 * Two tempos. Every transition the player asks for (key 1, key 2, B, RMB, LMB) runs `ask` (300-400 ms); the stows the
 * game starts itself (the 8 s bow timer, the 3.6 s lance timer) run `timer`, slower and calmer.
 *
 * Pure data and pure functions: no three.js, no allocation per step.
 */

/** A phase table: [name, seconds] in order; `grip` / `release` name the phase that ENDS on the event. */
function table(phases, ev) {
  let t = 0;
  const ends = phases.map(([, s]) => (t += s));
  return { phases, ends, total: t, ...ev };
}

/*
 * THE BOW'S UNSTOW (left hand). The hand leaves her side and reaches round the left hip to the lower limb at waist
 * height (B), closes on it (C: the bow does not move; the grip event at its end), slides the bow 0.10 m down its own
 * limb out of the keeper and pivots it about the fist down and forward past the hip (D), lets the limb run through the
 * loosened fist to the riser while she brings it to the low carry (E), and settles (F).
 */
export const BOW_UNSTOW = {
  // (M1a weapons step 2: D 0.100 -> 0.083, E 0.100 -> 0.100, F 0.017 -> 0: the bow is at the carry by 0.40 s, W7)
  // (M1a weapons fix round 1: B 0.117 -> 0.100, with carryStow's palm plan 0.055 -> 0.068 m a step: the grip 0.200 -> 0.183 s)
  ask: table([['A', 0.017], ['B', 0.100], ['C', 0.033], ['D', 0.083], ['E', 0.100], ['F', 0.001]], { grip: 'C' }),
  timer: table([['A', 0.033], ['B', 0.133], ['C', 0.050], ['D', 0.133], ['E', 0.133], ['F', 0.033]], { grip: 'C' }),
};
/*
 * THE BOW'S STOW. The fist loosens and the bow runs down through it to the limb (A, B), she carries it back past the hip
 * onto its line on her back, 0.10 m short of the keeper (C), seats it up its own axis (D: the release event at its end),
 * and the open hand comes back down her side (E).
 */
export const BOW_STOW = {
  ask: table([['A', 0.033], ['B', 0.067], ['C', 0.100], ['D', 0.050], ['E', 0.083]], { release: 'D' }),
  // (M1a weapons step 2: B 0.100 -> 0.090, C 0.117 -> 0.100, E 0.150 -> 0.110: the stow the 8 s timer starts ends inside
  //  W7's 430-500 ms)
  timer: table([['A', 0.033], ['B', 0.090], ['C', 0.100], ['D', 0.067], ['E', 0.110]], { release: 'D' }),
};

/*
 * THE BOAT GAFF'S DRAW (right hand; Milestone 2 area D, wave 2; gaffLayer.js runs it). The gaff hangs butt up from the
 * back of her belt just right of her spine (kit-oro.mjs, KT0). The hand leaves her side (A) and reaches back round her
 * right hip to the grip under the butt knob while the gaff swings out on its strap to meet it, square to her forearm
 * (B), closes on it (C: the grip event at its end; the stowed copy folds, the held one is in her fist), draws it up its
 * own axis out of the frog and swings it forward past her hip to the ready at her right side, the beak up and forward
 * and below her shoulders, the hook out in front of the fist (D, one unbroken path at an even pace, the wrist under
 * W3's 0.08 m a step). KT3's band: request to ready 250-350 ms.
 */
export const GAFF_DRAW = {
  ask: table([['A', 0.033], ['B', 0.083], ['C', 0.033], ['D', 0.183]], { grip: 'C' }),
};
/*
 * THE GAFF'S STOW: from the ready the fist swings it back past the hip and onto its line over the frog (D), seats it down
 * its axis into the frog (S: the release event at its end), opens (C) and comes back down her side (A). A swap to the
 * lance starts the lance's draw at the release: the left hand that takes the lance is free.
 */
export const GAFF_STOW = {
  ask: table([['D', 0.183], ['S', 0.050], ['C', 0.033], ['A', 0.117]], { release: 'S' }),
};

/** Finger curl targets (0 open .. 1 closed) and the most the curl may change in one second. */
export const CURL = { open: 0.15, closed: 0.85, slide: 0.45, rate: 21 };
/** Rate bounds, per second of sim time (the brief's per-1/60 s bars x 60, with a margin). */
export const RATE = {
  bowDeg: 9.8 * 60,          // the bow turns at most 9.8 deg a step (bar 10; M1a weapons step 2: was 9.5)
  wristM: 0.075 * 60,        // a wrist moves at most 0.075 m a step outside a swing (bar 0.08)
};
/** The keeper: how far the weapon slides along its own axis out of (or into) its mount. */
export const KEEPER_SLIDE = 0.10;

/** The phase at time `t` of table `T`: writes [index, k in the phase 0..1] into `out` (a 2-slot array). */
export function phaseAt(T, t, out) {
  const e = T.ends;
  let i = 0;
  while (i < e.length - 1 && t >= e[i]) i++;
  const t0 = i ? e[i - 1] : 0, d = e[i] - t0;
  let k = d > 1e-6 ? (t - t0) / d : 1;
  if (k < 0) k = 0; else if (k > 1) k = 1;
  out[0] = i; out[1] = k;
  return out;
}

/** When phase `name` of table `T` ends (s), or -1. */
export function phaseEnd(T, name) {
  for (let i = 0; i < T.phases.length; i++) if (T.phases[i][0] === name) return T.ends[i];
  return -1;
}

/** smoothstep on 0..1 */
export const ease = (x) => { const k = x < 0 ? 0 : x > 1 ? 1 : x; return k * k * (3 - 2 * k); };

/**
 * The handling record the rows read (`an.handlingInfo()`): one object, refilled in place each step. Events are kept as
 * the sim times they happened at (the last of each), so a row reads ownership without a log in the page.
 */
export function makeHandlingInfo() {
  return {
    bow: { owner: 'carry', mode: 0, tempo: 'ask', phase: '', k: 0, t: 0, curl: 0, s: 0, gripAt: -1, releaseAt: -1, readyAt: -1, requestAt: -1 },
    lance: { owner: 'carry', gripLAt: -1, gripRAt: -1, releaseRAt: -1, releaseLAt: -1 },
    gaff: { owner: 'carry', mode: 0, phase: '', k: 0, t: 0, curl: 0, gripAt: -1, releaseAt: -1, readyAt: -1, requestAt: -1, palmMiss: null },
    aimGate: 1,
    simT: 0,
  };
}
