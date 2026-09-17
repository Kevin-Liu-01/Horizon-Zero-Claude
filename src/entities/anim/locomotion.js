import * as THREE from 'three';
import { GAIT_SLOTS } from './clipLibrary.js';
import { ClipLayerSet } from './clipLayer.js';
import { register } from './registry.js';

/**
 * LocomotionBlend — the clip-driven base layer of the player animator.
 *
 * Owns one AnimationAction per clip slot on the player's mixer and, every
 * frame, writes their weights and times directly (no mixer fades): the
 * blend is a small explicit tree the game state steers, so it is
 * deterministic, allocation-free and easy to read on film.
 *
 *   final = base * (1 - dodgeW) * (1 - deadW) + roll * dodgeW * (1 - deadW) + death * deadW
 *   base  = stand * (1 - crouchW) + crouch * crouchW
 *   stand = idle | walk | jog | sprint      (piecewise-linear over nominal speeds)
 *   crouch = crouchIdle | crouchFwd         (same, at crouch speed)
 *
 * Weights always sum to 1 so the mixer never blends toward the bind pose.
 *
 * Gait loops are PHASE-LOCKED: one master phase u in [0,1) advances at
 * speed / blendedCycleDistance, and each gait action's time is set to
 * ((u + phaseOffset_i) mod 1) * duration_i. Playing each clip at
 * timeScale = speed / nominalSpeed_i is the same thing per clip, but a shared
 * phase means walk<->jog<->sprint crossfades never double-step and the stance
 * foot stays planted across the fade. On top of that the phase rate is scaled
 * by the blended per-frame `warp` the library bakes, which cancels the clips'
 * own non-constant stance velocity (Sprint_Loop's contact foot swings
 * 6.3 -> 9.5 m/s) — without it the planted ball slides ~0.12m per stance.
 * Reverse playback (u decreasing) is the backpedal; lateral input yaws the legs
 * (applied by the animator).
 *
 * One-shots (roll, death) are scrubbed from the owning timeline rather than
 * free-running, so they can never drift from the gameplay event that drives
 * them.
 *
 * anim-core (Round 4): every action is wrapped in a `ClipLayer` inside one
 * `ClipLayerSet`. The layers are `external` — this blend tree stays the sole
 * author of the weights — but all time writes now go through
 * `ClipLayer.scrub(k)`, so the roll and the death clip advance on the
 * gameplay timeline (itself integrated from the engine-scaled dt) and can
 * never be handed to a wall clock. Each layer is also told its un-damped
 * INTENT every frame (`ClipLayer.setIntent`), which is what lets the stuck
 * detector fail for an externally-weighted tree. `blend.audit()` reports
 * per-layer state and that detector for gate A27.
 */

const { damp, clamp, smoothstep } = THREE.MathUtils;

const BLEND_SLOTS = [
  'idle', 'walk', 'jog', 'sprint', 'strafe', 'crouchIdle', 'crouchFwd', 'roll', 'death',
  // Round 4 (player-anim): reaction / traversal / interaction one-shots. All
  // scrubbed from a gameplay timeline the animator owns, exactly like `roll`,
  // so they can never free-run past the event that started them.
  'hitChest', 'hitHead', 'jumpStart', 'jumpLoop', 'jumpLand', 'interact', 'pickup',
];
/** Slots that REPLACE the gait tree, in the order they take priority. */
const REACT_SLOTS = ['hitChest', 'hitHead'];
const AIR_SLOTS = ['jumpStart', 'jumpLoop', 'jumpLand'];
const ACT_SLOTS = ['interact', 'pickup'];
/** Overrides that are still a two-footed STANCE (the conform keeps the feet). */
const GROUNDED_OVERRIDE = new Set(['hitChest', 'hitHead', 'jumpLand', 'interact', 'pickup']);

/**
 * Lateral travel. There is no strafe clip in the pack, so a sidestep is a
 * forward loop YAWED toward the travel direction; the yaw a forward stride can
 * absorb is bounded by the stride LENGTH, because at 90 deg both legs swing
 * along the SAME lateral line through their own hip joint and the feet cross.
 * Hence the dedicated short-stride `strafe` loop (clipLibrary SLOT_OPTS) plus a
 * stance widen: a 0.6 m cycle yawed 78 deg leaves each foot ~4 cm on its own
 * side of the centre line, where the full 1.44 m walk cycle crossed them by
 * half a metre at 60 deg — and the residual the yaw cannot cover drops from
 * 0.34 m per stance (the foot lock saturates and the ball skates) to ~0.06 m,
 * which the lock absorbs as knee/hip flex.
 */
const LAT_A0 = 0.5, LAT_A1 = 1.15;   // move-angle band (rad) that fades the strafe loop in
/*
 * FIX ROUND (player-anim): the split was PELV_MAX 0.78 + HIP_MAX 0.62 = 1.40
 * rad, and the pelvis half is the half that crosses the legs. Yawing the
 * PELVIS re-orders the two hip JOINTS along the stride axis — past ~45 deg the
 * trailing hip is physically on the far side of the lead one, so no amount of
 * leg animation can keep the feet apart (measured: legs crossed on 41 % of
 * aim-strafe frames, and the redirect that survived was a 4.9 steps/s
 * shuffle). Yawing the THIGHS does not move the joints at all: it only turns
 * each leg's stride about its own hip, so the feet stay on their own sides
 * however far it goes. The cap therefore moves off the pelvis and onto the
 * hips, and a stance WIDEN (published as `widen`, applied by the animator)
 * buys the lateral separation the shortened stride cannot.
 */
/*
 * FIX ROUND 6 (judge-player-anim-r2, blocker). The split above moved the cap
 * off the pelvis and onto the hips, but it also LOWERED the total: 0.78 + 0.62
 * = 1.40 rad became 0.34 + 0.95 = 1.29 rad, against a pure sidestep's move
 * angle of PI/2 = 1.5708. The 0.28 rad the yaw could not cover is a standing
 * DRIFT SOURCE, not a cosmetic one: the stance foot's clip travel points 16 deg
 * off the direction the character actually moves, so a planted ball accumulates
 * speed * sin(0.28) = 0.37 m/s of error. Over the 0.5-0.7 s stances this gait
 * produces that is 0.19-0.26 m, and playerAnimator's foot lock (MAX_LOCK 0.3 m)
 * saturated on EVERY aim-strafe-left run — past the cap the anchor slides and
 * the planted ball skates with it (measured 0.3694 m in one window of nine,
 * with lock.errM pinned at exactly 0.3000).
 *
 * HIP_MAX is raised so PELV_MAX + HIP_MAX >= PI/2: the yaw now covers a pure
 * sidestep exactly and the residual collapses to whatever the phase warp leaves
 * (millimetres). This is the cap the note above already argues is the safe one
 * to spend — a thigh yaw turns each leg's stride about its OWN hip joint and
 * moves no joint, so it cannot put the trailing foot on the far side of the
 * lead one however far it goes; only the PELVIS half crosses the legs, and that
 * half is untouched at 0.34. Nothing below a 1.29 rad move angle changes at all
 * (the clamp is inactive there), so forward, diagonal and backpedal gaits are
 * bit-identical.
 */
const PELV_MAX = 0.34;               // pelvis yaw cap (rad) — torso read only
const HIP_MAX = 1.24;                // extra per-thigh yaw cap (rad): 0.34 + 1.24 >= PI/2

export class LocomotionBlend {
  /**
   * @param {THREE.AnimationMixer} mixer
   * @param {import('./clipLibrary.js').ClipLibrary} lib
   */
  constructor(mixer, lib) {
    this.mixer = mixer;
    this.lib = lib;
    this.actions = {};   // slot -> AnimationAction
    this.entries = {};   // slot -> library entry
    for (const slot of BLEND_SLOTS) {
      const e = lib.get(slot);
      if (!e) continue;
      const a = mixer.clipAction(e.clip);
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.enabled = true;
      a.weight = 0;
      a.timeScale = slot === 'idle' || slot === 'crouchIdle' ? 1 : 0; // others are scrubbed
      a.play();
      this.actions[slot] = a;
      this.entries[slot] = e;
    }
    if (this.actions.idle) {
      this.actions.idle.time = Math.random() * this.entries.idle.info.duration * 0.9;
    }

    // anim-core layer view: the blend tree keeps authorship of the weights
    // (external: true), ClipLayer owns every .time write + the audit.
    this.set = new ClipLayerSet(mixer, { name: 'aloy-locomotion', owner: 'anim-core' });
    for (const slot of Object.keys(this.actions)) {
      this.set.add(slot, this.actions[slot], {
        external: true,
        loop: true,
        scrubbed: slot !== 'idle' && slot !== 'crouchIdle',
        // the death pose is MEANT to park on its last frame at full weight;
        // every other scrubbed layer holding a frozen frame while visible is
        // the stuck state A27 hunts for
        holdEnd: slot === 'death',
      });
    }
    this.set.base('idle');
    register({
      id: 'anim/locomotion', file: 'src/entities/anim/locomotion.js',
      owner: 'anim-core', rig: 'aloy', convention: 'ClipLayer',
      status: 'migrated', layers: this.set.order.length,
    });

    // gait nodes sorted by nominal speed (walk < jog < sprint). `strafe` is NOT
    // one of them: it is a lateral REPLACEMENT for the whole stand tree, faded
    // in by move angle rather than by speed.
    this.standNodes = ['walk', 'jog', 'sprint']
      .filter((s) => this.entries[s] && this.entries[s].gait.nominalSpeed > 0.2)
      .sort((a, b) => this.entries[a].gait.nominalSpeed - this.entries[b].gait.nominalSpeed);
    this.crouchNodes = ['crouchFwd'].filter((s) => this.entries[s] && this.entries[s].gait.nominalSpeed > 0.2);
    // every slot in the standing tree, strafe included (weights + intent)
    this._standAll = ['idle', ...this.standNodes];
    if (this.entries.strafe) this._standAll.push('strafe');

    // smoothed weights (raw, before normalization)
    this.w = {};
    for (const slot of Object.keys(this.actions)) this.w[slot] = 0;
    if (this.actions.idle) this.w.idle = 1;
    this.crouchW = 0;
    this.dodgeW = 0;
    this.deadW = 0;
    this.phase = 0;
    this.freq = 0;          // gait cycles per second (secondary motion drives off it)
    this.warp = 1;          // blended per-frame phase-rate correction (no-skate)
    this.reverse = 1;        // +1 forward, -1 backpedal (damped)
    this._revSign = 1;       // latched mirror decision (hysteresis — see update())
    this.legYaw = 0;         // radians, PELVIS yaw toward the move direction
    this.hipYaw = 0;         // radians, extra hip rotation on both thighs
    this.dominant = 'idle';
    this.gaitWeight = 0;
    this.lateral = 0;        // 0..1 sidestep authority (drives the strafe loop)
    this.widen = 0;          // 0..1 stance widen requested by the sidestep
    this.stanceL = 1;        // 0..1 blended stance flag per foot (from the clips)
    this.stanceR = 1;
    // Round 4 override channels (see update()'s `s.hit` / `s.air` / `s.act`)
    this.hitW = 0; this.airW = 0; this.actW = 0;
    this.hitSlot = null; this.airSlot = null; this.actSlot = null;
    this._overrides = [...REACT_SLOTS, ...AIR_SLOTS, ...ACT_SLOTS].filter((s) => this.actions[s]);
    // un-damped weight destinations, kept per-tree so both survive the frame
    // and can be handed to ClipLayer.setIntent (see update()). Persistent
    // objects: no per-frame allocation.
    this._tgtStand = {};
    this._tgtCrouch = {};
  }

  /** Piecewise-linear weights over the gait nodes for a target speed. */
  _gaitWeights(out, idleSlot, nodes, speed) {
    for (const k in out) out[k] = 0;
    if (!nodes.length) { out[idleSlot] = 1; return out; }
    const sp = (s) => this.entries[s].gait.nominalSpeed;
    const first = nodes[0];
    if (speed <= 0) { out[idleSlot] = 1; return out; }
    if (speed < sp(first)) {
      // idle <-> slowest gait; the gait joins early so the legs move as soon as she does
      const k = smoothstep(speed, 0.08, sp(first) * 0.85);
      out[idleSlot] = 1 - k;
      out[first] = k;
      return out;
    }
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      if (speed >= sp(a) && speed <= sp(b)) {
        const k = (speed - sp(a)) / Math.max(1e-6, sp(b) - sp(a));
        out[a] = 1 - k;
        out[b] = k;
        return out;
      }
    }
    out[nodes[nodes.length - 1]] = 1; // beyond the fastest clip: play it faster
    return out;
  }

  /**
   * @param {number} dt
   * @param {object} s  { speed, moveAngle, crouch, dodging, dodgeK (0..1), dead, dieT, aimW }
   */
  update(dt, s) {
    const A = this.actions, E = this.entries, w = this.w;

    // --- state weights (crossfade timings) ---
    this.crouchW = damp(this.crouchW, s.crouch ? 1 : 0, 10, dt);
    /* FIX ROUND 2 — the roll's TAIL, not its blend.
     *
     * The exit rate was 9/s, so 0.28 s after `dodging` cleared the roll clip
     * still carried e^-(9 x 0.283) = 0.067 of the pose — a finished one-shot
     * that is measurably still on stage. `A27-timescale-safe` asserts
     * `after.rollWeight < 0.05` and read 0.0672: a marginal FAIL that flips on
     * where the sample lands. 15/s reaches 0.014 in the same 0.28 s, and the
     * snap below clears the last sliver rather than leaving an asymptote
     * running. The ENTRY rate (34/s) is untouched — that one is the read. */
    const dodgeTo = s.dodging && A.roll ? 1 : 0;
    this.dodgeW = damp(this.dodgeW, dodgeTo, s.dodging ? 34 : 15, dt);
    if (dodgeTo === 0 && this.dodgeW < 0.012) this.dodgeW = 0;
    this.deadW = damp(this.deadW, s.dead && A.death ? 1 : 0, s.dead ? 14 : 10, dt);

    // --- backpedal / leg yaw from the local move direction ---
    // |angle| <= 90deg: legs turn toward the travel direction, clip forward.
    // beyond: legs turn toward the mirrored direction, clip runs backward.
    let a = s.moveAngle || 0;
    /*
     * FIX ROUND 6 (judge-player-anim-r2, blocker) — HYSTERESIS ON THE MIRROR.
     *
     * The mirror used to be a bare `Math.abs(a) > PI/2`, and a pure sidestep
     * sits EXACTLY on that boundary: strafe-left measured moveAngle at
     * +1.5708 and strafe-right at -1.5708, so which side of the test a frame
     * lands on is decided by the last bit of a float. Each flip sends `rev`
     * from +1 to -1, `reverse` is DAMPED toward it, and while it crosses zero
     * the master phase stalls and then runs BACKWARD — filmed here as
     * phase 0.729 -> 0.724 -> 0.716 -> 0.706 -> 0.693 -> 0.664 -> 0.600 over
     * eight frames of an aim-strafe-left. A planted foot's clip travel is what
     * cancels the character's translation, so a backward phase does not just
     * stop cancelling it, it ADDS to it: the foot lock's error ran
     * 0.059 -> 0.104 -> 0.150 -> 0.199 -> 0.256 m in those same frames, pinned
     * at MAX_LOCK 0.3, and past the cap the anchor slides and the planted ball
     * skates with it (0.37 m in one stance, gate A31b).
     *
     * The mirror only exists so the loop plays forward when she travels
     * forward and backward when she backpedals. At |a| ~ PI/2 the two are
     * equally good — the stride is perpendicular either way — so the choice
     * there is pure noise, and holding the previous one is strictly better
     * than flipping on it. A 0.15 rad (8.6 deg) deadband on each side is far
     * wider than the jitter and far narrower than any real forward/backpedal
     * transition, which crosses the boundary by a radian or more.
     */
    const REV_HYST = 0.15;
    const bound = Math.PI / 2 + (this._revSign < 0 ? -REV_HYST : REV_HYST);
    let rev = Math.abs(a) > bound ? -1 : 1;
    this._revSign = rev;
    if (rev < 0) a = a > 0 ? a - Math.PI : a + Math.PI;
    const moving = s.speed > 0.25;
    this.reverse = damp(this.reverse, moving ? rev : this.reverse, 9, dt);
    // lateral authority: how much of the travel is a sidestep rather than a
    // forward stride. Fades in the short-stride `strafe` loop, opens the yaw
    // caps and widens the stance (see the LAT_* note above).
    const latT = moving && this.actions.strafe ? smoothstep(Math.abs(a), LAT_A0, LAT_A1) : 0;
    this.lateral = damp(this.lateral, latT, 8, dt);
    this.widen = this.lateral;
    // The yaw is SPLIT: the pelvis takes the bulk (its yaw reorders the hip
    // JOINTS along the stride axis, which is what crosses the legs, so it is
    // capped), and the remainder goes to hip rotation on both thighs, which
    // redirects each leg's stride without moving the hip joints at all.
    const pv = clamp(a, -PELV_MAX, PELV_MAX);
    this.legYaw = damp(this.legYaw, moving ? pv : 0, 9, dt);
    this.hipYaw = damp(this.hipYaw, moving ? clamp(a - pv, -HIP_MAX, HIP_MAX) : 0, 9, dt);

    // --- gait weights by speed (damped: ~0.15-0.2s crossfades) ---
    const tStand = this._tgtStand, tCrouch = this._tgtCrouch;
    this._gaitWeights(tStand, 'idle', this.standNodes, s.speed);
    if (A.strafe) {
      // the sidestep REPLACES the forward tree (idle keeps its standing share)
      const mv = 1 - (tStand.idle || 0);
      for (const slot of this.standNodes) tStand[slot] = (tStand[slot] || 0) * (1 - latT);
      tStand.strafe = mv * latT;
    }
    for (const slot of this._standAll) {
      if (A[slot]) w[slot] = damp(w[slot], tStand[slot] || 0, 14, dt);
    }
    this._gaitWeights(tCrouch, 'crouchIdle', this.crouchNodes, s.speed);
    for (const slot of ['crouchIdle', ...this.crouchNodes]) {
      if (A[slot]) w[slot] = damp(w[slot], tCrouch[slot] || 0, 14, dt);
    }

    /* --- Round 4 override channels: hit react, jump/land, interact/pickup ---
     * Each is a slot NAME plus a 0..1 scrub and a 0..1 weight, all owned by
     * the animator (which knows the gameplay timelines). They are ordinary
     * blended clips rather than three additive layers on purpose: an additive
     * hit cannot become the DOMINANT action, and "she visibly reacted" is
     * exactly the thing gate A36-hit-react-visible has to be able to read.
     * Priority: death > roll > hit > air > act > gait. */
    this.hitSlot = A[s.hit] ? s.hit : null;
    this.airSlot = A[s.air] ? s.air : null;
    this.actSlot = A[s.act] ? s.act : null;
    this.hitW = this.hitSlot ? clamp(s.hitW ?? 0, 0, 1) : 0;
    this.airW = this.airSlot ? clamp(s.airW ?? 0, 0, 1) : 0;
    this.actW = this.actSlot ? clamp(s.actW ?? 0, 0, 1) : 0;

    // --- compose the final (normalized) weights ---
    const stand = 1 - this.crouchW, cr = this.crouchW;
    const alive = (1 - this.dodgeW) * (1 - this.deadW);
    const wHit = this.hitW * alive;
    const wAir = this.airW * alive * (1 - this.hitW);
    const wAct = this.actW * alive * (1 - this.hitW) * (1 - this.airW);
    const live = alive * (1 - this.hitW) * (1 - this.airW) * (1 - this.actW);
    let sum = 0;
    const setW = (slot, v) => { if (A[slot]) { A[slot].weight = v; sum += v; } };
    for (const slot of this._standAll) setW(slot, w[slot] * stand * live);
    for (const slot of ['crouchIdle', ...this.crouchNodes]) setW(slot, w[slot] * cr * live);
    for (const slot of this._overrides) setW(slot, 0);
    if (this.hitSlot) setW(this.hitSlot, wHit);
    if (this.airSlot) setW(this.airSlot, wAir);
    if (this.actSlot) setW(this.actSlot, wAct);
    setW('roll', this.dodgeW * (1 - this.deadW));
    setW('death', this.deadW);
    if (sum > 1e-6 && Math.abs(sum - 1) > 1e-4) {
      for (const slot in A) A[slot].weight /= sum;
    }
    // scrub the overrides from the animator's own timelines
    if (this.hitSlot) this.set.scrub(this.hitSlot, clamp(s.hitK ?? 0, 0, 1));
    if (this.airSlot) this.set.scrub(this.airSlot, clamp(s.airK ?? 0, 0, 1));
    if (this.actSlot) this.set.scrub(this.actSlot, clamp(s.actK ?? 0, 0, 1));
    for (const slot of this._overrides) {
      const L = this.set.layers[slot];
      // the UN-DAMPED destination, not the damped weight just written: an
      // external layer handed its own weight back can never look stuck, which
      // is exactly the hole docs/ROUND4-ANIM-CORE.md §5.1 closed for the gait
      if (!L) continue;
      L.setIntent(slot === this.hitSlot ? (s.hitT ?? this.hitW)
        : slot === this.airSlot ? (s.airT ?? this.airW)
          : slot === this.actSlot ? (s.actT ?? this.actW) : 0);
    }

    // --- declare INTENT to the layer set (gate A27's stuck detector) ---
    // These are the un-damped destinations of the weights just written. A
    // ClipLayer whose weight is authored externally cannot derive them — the
    // damped value it reads back IS the weight — so without this call the
    // stuck detector could only watch the timeline, and the two A27 clauses
    // that read `stuck` would be unfalsifiable. With it, a roll that keeps
    // weight for longer than any crossfade in this tree after `dodging` went
    // false is reported, which is exactly the wall-clock-desync symptom.
    const crT = s.crouch ? 1 : 0;
    const dodgeT = (s.dodging && A.roll) ? 1 : 0;
    const deadT = (s.dead && A.death) ? 1 : 0;
    const liveT = (1 - dodgeT) * (1 - deadT);
    const L = this.set.layers;
    for (const slot of this._standAll) {
      if (L[slot]) L[slot].setIntent((tStand[slot] || 0) * (1 - crT) * liveT);
    }
    for (const slot of ['crouchIdle', ...this.crouchNodes]) {
      if (L[slot]) L[slot].setIntent((tCrouch[slot] || 0) * crT * liveT);
    }
    if (L.roll) L.roll.setIntent(dodgeT * (1 - deadT));
    if (L.death) L.death.setIntent(deadT);

    // --- master gait phase: speed over the blended cycle distance, warped ---
    // `warp` is the per-frame correction that keeps the planted ball still even
    // where the clip's own stance velocity swings (Sprint_Loop: 6.3 -> 9.5 m/s
    // through one contact). Sampled at the phase the actions are ABOUT to hold,
    // blended by weight, damped so a warp step never pops the cadence.
    let dSum = 0, wSum = 0, warpSum = 0;
    for (const slot of GAIT_SLOTS) {
      const act = A[slot];
      if (!act || act.weight <= 1e-4) continue;
      const e = E[slot];
      dSum += e.gait.cycleDist * act.weight;
      wSum += act.weight;
      if (e.gait.warp) {
        let u = this.phase + e.gait.phaseOffset;
        u -= Math.floor(u);
        warpSum += e.gait.warp[Math.min(e.info.frames - 1, Math.round(u * (e.info.frames - 1)))] * act.weight;
      } else warpSum += act.weight;
    }
    if (wSum > 1e-4 && dSum > 1e-4) {
      const cycle = dSum / wSum;
      this.warp = damp(this.warp, warpSum / wSum, 26, dt);
      this.freq = s.speed * this.warp / cycle;
      this.phase += (this.freq * this.reverse) * dt;
      this.phase -= Math.floor(this.phase);
      this.cycleDist = cycle;
    } else {
      this.warp = damp(this.warp, 1, 12, dt);
      this.freq = 0;
    }
    let sL = 0, sR = 0, sW = 0;
    for (const slot of GAIT_SLOTS) {
      const act = A[slot];
      if (!act) continue;
      const e = E[slot];
      let u = this.phase + e.gait.phaseOffset;
      u -= Math.floor(u);
      this.set.scrub(slot, u);
      if (act.weight > 1e-4 && e.gait.stanceL) {
        const fi = Math.min(e.info.frames - 1, Math.round(u * (e.info.frames - 1)));
        sL += e.gait.stanceL[fi] * act.weight;
        sR += e.gait.stanceR[fi] * act.weight;
        sW += act.weight;
      }
    }
    // idle poses are two-footed stances; rolls/death release the feet. So are
    // the standing overrides — a hit react, a landing recovery, an interact
    // and a pickup all keep both feet on the floor, and without this the
    // ground conform would release the pelvis clamp the moment one plays and
    // drop her through the terrain. `jumpStart` / `jumpLoop` deliberately are
    // NOT in the set: she is in the air.
    let idleW = (A.idle?.weight ?? 0) + (A.crouchIdle?.weight ?? 0);
    for (const slot of this._overrides) {
      if (GROUNDED_OVERRIDE.has(slot)) idleW += A[slot].weight;
    }
    sL += idleW; sR += idleW; sW += idleW;
    this.stanceL = sW > 1e-4 ? sL / sW : 0;
    this.stanceR = sW > 1e-4 ? sR / sW : 0;

    // --- one-shots scrubbed from their owning timelines ---
    if (A.roll) this.set.scrub('roll', s.dodgeK ?? 0);
    if (A.death) this.set.scrub('death', (s.dieT ?? 0) / E.death.info.duration);

    // advance the layer clocks with the SAME (engine-scaled) dt the mixer gets;
    // the mixer itself is stepped by the animator right after this call
    this.set.update(dt, false);

    // dominant action for debugging / gates
    let best = 0, bestSlot = 'idle';
    for (const slot in A) if (A[slot].weight > best) { best = A[slot].weight; bestSlot = slot; }
    this.dominant = bestSlot;
    this.gaitWeight = wSum;
  }

  /** Per-layer state + stuck-action detector (gate A27). */
  audit() { return this.set.audit(); }

  /** Name of the clip with the highest weight + its weight. */
  dominantAction() {
    const a = this.actions[this.dominant];
    return a ? { slot: this.dominant, clip: a.getClip().name, weight: a.weight, time: a.time } : null;
  }
}
