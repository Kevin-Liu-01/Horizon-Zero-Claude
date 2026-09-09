import * as THREE from 'three';
import { GAIT_SLOTS } from './clipLibrary.js';

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
 */

const { damp, clamp, smoothstep } = THREE.MathUtils;

const EPS_T = 1e-4;
const BLEND_SLOTS = ['idle', 'walk', 'jog', 'sprint', 'crouchIdle', 'crouchFwd', 'roll', 'death'];

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

    // gait nodes sorted by nominal speed (walk < jog < sprint)
    this.standNodes = ['walk', 'jog', 'sprint']
      .filter((s) => this.entries[s] && this.entries[s].gait.nominalSpeed > 0.2)
      .sort((a, b) => this.entries[a].gait.nominalSpeed - this.entries[b].gait.nominalSpeed);
    this.crouchNodes = ['crouchFwd'].filter((s) => this.entries[s] && this.entries[s].gait.nominalSpeed > 0.2);

    // smoothed weights (raw, before normalization)
    this.w = {};
    for (const slot of Object.keys(this.actions)) this.w[slot] = 0;
    if (this.actions.idle) this.w.idle = 1;
    this.crouchW = 0;
    this.dodgeW = 0;
    this.deadW = 0;
    this.phase = 0;
    this.warp = 1;          // blended per-frame phase-rate correction (no-skate)
    this.reverse = 1;        // +1 forward, -1 backpedal (damped)
    this.legYaw = 0;         // radians, lower-body yaw toward the move direction
    this.dominant = 'idle';
    this.gaitWeight = 0;
    this.stanceL = 1;        // 0..1 blended stance flag per foot (from the clips)
    this.stanceR = 1;
    this._tmpW = {};
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
    this.dodgeW = damp(this.dodgeW, s.dodging && A.roll ? 1 : 0, s.dodging ? 34 : 9, dt);
    this.deadW = damp(this.deadW, s.dead && A.death ? 1 : 0, s.dead ? 14 : 10, dt);

    // --- gait weights by speed (damped: ~0.15-0.2s crossfades) ---
    const tmp = this._tmpW;
    this._gaitWeights(tmp, 'idle', this.standNodes, s.speed);
    for (const slot of ['idle', ...this.standNodes]) {
      if (A[slot]) w[slot] = damp(w[slot], tmp[slot] || 0, 14, dt);
    }
    this._gaitWeights(tmp, 'crouchIdle', this.crouchNodes, s.speed);
    for (const slot of ['crouchIdle', ...this.crouchNodes]) {
      if (A[slot]) w[slot] = damp(w[slot], tmp[slot] || 0, 14, dt);
    }

    // --- backpedal / leg yaw from the local move direction ---
    // |angle| <= 90deg: legs turn toward the travel direction, clip forward.
    // beyond: legs turn toward the mirrored direction, clip runs backward.
    let a = s.moveAngle || 0;
    let rev = 1;
    if (Math.abs(a) > Math.PI / 2) { rev = -1; a = a > 0 ? a - Math.PI : a + Math.PI; }
    const moving = s.speed > 0.25;
    this.reverse = damp(this.reverse, moving ? rev : this.reverse, 9, dt);
    const yawMax = 1.15; // ~66deg: past this the torso counter-twist stops reading human
    this.legYaw = damp(this.legYaw, moving ? clamp(a, -yawMax, yawMax) : 0, 9, dt);

    // --- compose the final (normalized) weights ---
    const stand = 1 - this.crouchW, cr = this.crouchW;
    const live = (1 - this.dodgeW) * (1 - this.deadW);
    let sum = 0;
    const setW = (slot, v) => { if (A[slot]) { A[slot].weight = v; sum += v; } };
    for (const slot of ['idle', ...this.standNodes]) setW(slot, w[slot] * stand * live);
    for (const slot of ['crouchIdle', ...this.crouchNodes]) setW(slot, w[slot] * cr * live);
    setW('roll', this.dodgeW * (1 - this.deadW));
    setW('death', this.deadW);
    if (sum > 1e-6 && Math.abs(sum - 1) > 1e-4) {
      for (const slot in A) A[slot].weight /= sum;
    }

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
      this.phase += (s.speed * this.reverse * this.warp / cycle) * dt;
      this.phase -= Math.floor(this.phase);
    } else {
      this.warp = damp(this.warp, 1, 12, dt);
    }
    let sL = 0, sR = 0, sW = 0;
    for (const slot of GAIT_SLOTS) {
      const act = A[slot];
      if (!act) continue;
      const e = E[slot];
      let u = this.phase + e.gait.phaseOffset;
      u -= Math.floor(u);
      act.time = clamp(u * e.info.duration, 0, e.info.duration - EPS_T);
      if (act.weight > 1e-4 && e.gait.stanceL) {
        const fi = Math.min(e.info.frames - 1, Math.round(u * (e.info.frames - 1)));
        sL += e.gait.stanceL[fi] * act.weight;
        sR += e.gait.stanceR[fi] * act.weight;
        sW += act.weight;
      }
    }
    // idle poses are two-footed stances; rolls/death release the feet
    const idleW = (A.idle?.weight ?? 0) + (A.crouchIdle?.weight ?? 0);
    sL += idleW; sR += idleW; sW += idleW;
    this.stanceL = sW > 1e-4 ? sL / sW : 0;
    this.stanceR = sW > 1e-4 ? sR / sW : 0;

    // --- one-shots scrubbed from their owning timelines ---
    if (A.roll) {
      const d = E.roll.info.duration;
      A.roll.time = clamp((s.dodgeK ?? 0) * d, 0, d - EPS_T);
    }
    if (A.death) {
      const d = E.death.info.duration;
      A.death.time = clamp(s.dieT ?? 0, 0, d - EPS_T);
    }

    // dominant action for debugging / gates
    let best = 0, bestSlot = 'idle';
    for (const slot in A) if (A[slot].weight > best) { best = A[slot].weight; bestSlot = slot; }
    this.dominant = bestSlot;
    this.gaitWeight = wSum;
  }

  /** Name of the clip with the highest weight + its weight. */
  dominantAction() {
    const a = this.actions[this.dominant];
    return a ? { slot: this.dominant, clip: a.getClip().name, weight: a.weight, time: a.time } : null;
  }
}
