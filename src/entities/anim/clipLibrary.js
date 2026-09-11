import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Retargeter } from './retargeter.js';
import { UAL_TO_ALOY, UAL_HIP, AIM_RULES, CONTACT_BONES } from './boneMap.js';
import { register } from './registry.js';

const { clamp } = THREE.MathUtils;

/**
 * ClipLibrary — bakes the CC0 Quaternius Universal Animation Library clips
 * onto the Aloy rig ONCE (per boot, cached) and measures each locomotion
 * loop's gait so the animator can drive it at speed without foot skate.
 *
 * Baked clips bind by bone NAME, so one library serves every
 * SkeletonUtils.clone of aloy.root. The bake runs on a private, detached
 * skeleton clone — the player's model is never touched.
 *
 * Gait metadata per clip (from the contact tracks the retargeter records):
 *   nominalSpeed  m/s the character would travel if the in-place loop were
 *                 played at timeScale 1 — total backward travel of the contact
 *                 (ball) bone divided by total contact time, so a stance ends
 *                 exactly where it began.
 *   cycleDist     nominalSpeed * duration  (meters per loop)
 *   warp          Float32Array per baked frame: multiplier on the master phase
 *                 rate that holds the planted ball still even though the clip's
 *                 own stance velocity is not constant (see analyzeGait).
 *   phaseOffset   normalized clip time at which the LEFT ball is furthest
 *                 forward — used to phase-lock walk/jog/sprint so a crossfade
 *                 never double-steps.
 *   stanceL/R     Uint8Array per baked frame: 1 = that foot is planted
 *                 (heel or ball within STANCE_H of the loop's lowest point).
 *                 The ground conform only plants flagged feet (Spike C
 *                 finding: planting "the lowest foot" yanks the pelvis on the
 *                 airborne frames of jog/sprint).
 * One-shot metadata:
 *   rootProgress  Float32Array per frame, 0..1 fraction of the clip's total
 *                 root-motion travel (Roll_RM) — the dodge's velocity curve.
 */

/** Logical clip slots -> UAL clip names. */
export const CLIPS = {
  idle: 'Idle_Loop',
  walk: 'Walk_Loop',
  jog: 'Jog_Fwd_Loop',
  sprint: 'Sprint_Loop',
  strafe: 'Walk_Loop',
  crouchIdle: 'Crouch_Idle_Loop',
  crouchFwd: 'Crouch_Fwd_Loop',
  roll: 'Roll_RM',
  death: 'Death01',
  // Round 4 (player-anim): reactions, traversal and interaction. All six were
  // baked-ready in the pack and none was wired — hits used a 0.14 rad spine
  // nudge no film could see, there was no jump pose at all, and picking an
  // item up did not move her.
  hitChest: 'Hit_Chest',
  hitHead: 'Hit_Head',
  jumpStart: 'Jump_Start',
  jumpLoop: 'Jump_Loop',
  jumpLand: 'Jump_Land',
  interact: 'Interact',
  pickup: 'PickUp_Table',
};

/**
 * Per-slot bake options. `amp` is the retargeter's amplitude warp (see
 * Retargeter._ampWarp) and it exists because the pack has exactly one forward
 * run and no strafe at all:
 *
 *  - `jog` at amp 1 is a 6.05 m/s, 2.77 m-per-step bound with 71% of the loop
 *    airborne. Phase-locked down to the 4.6 m/s the player actually runs it
 *    plays at 0.76x and reads as a moon jump (2.09 steps/s, 0.55 flight). Warped
 *    to ~3.4 m/s it plays near 1.25x at run speed: ~2.6 steps/s, ~1.7 m steps.
 *  - `strafe` is Walk_Loop shortened to a quick shuffle. Lateral travel has to
 *    be a YAWED forward loop (no strafe clips exist), and the yaw a forward
 *    stride can absorb before the legs cross is bounded by the stride LENGTH:
 *    a 0.65 m cycle can be yawed ~78 deg with the feet still on their own side
 *    of the body, where the 1.44 m walk cycle crossed them at 60 deg.
 */
export const SLOT_OPTS = {
  jog: { amp: 0.52 },
  strafe: { name: 'Strafe_Loop', cadence: 2.9, speed: 'aim', ampRange: [0.35, 0.95] },
  sprint: { cadence: 3.25, speed: 'sprint', ampRange: [0.70, 1.0] },
};

/**
 * Canonical ground speeds. `player.speeds` is the source of truth and is read
 * at bake time when it exists (`ClipLibrary.speeds`), but `ctx.player` is not
 * assigned until `new Player(ctx)` RETURNS and the animator is constructed
 * inside that constructor — so this is the value the bake uses on a cold boot.
 * `PlayerAnimator` compares the two on its first update and says so loudly if
 * `player-control` ever moves the canon out from under the bake.
 */
export const CANON_SPEEDS = { walk: 1.5, crouch: 1.4, crouchAim: 1.05, aim: 1.35, jog: 5.0, sprint: 6.8 };

/**
 * Cadence retime (player-anim, `A28-run-cadence`).
 *
 * A phase-locked loop's step rate is `speed / cycleDistance`, so the ONLY way
 * to change the cadence at a given travel speed without skating the foot is to
 * change how far the clip's own stride carries it — which is what the
 * retargeter's amplitude warp does. `Sprint_Loop` bakes at a 5.06 m cycle,
 * which at the 6.8 m/s canon is 2.69 steps/s before warp (measured 2.97): a
 * long, floaty bound, not HZD's drive. `Strafe_Loop` had the opposite problem
 * — amp 0.42 shrank the cycle to 0.62 m and the side-step became a 4.4
 * steps/s shuffle.
 *
 * The amp is SOLVED, not guessed: bake once at amp 1, measure the real cycle
 * distance the retarget produced, and re-bake at the ratio that puts the
 * cadence on target at the published speed. One extra bake per retimed slot
 * (~12 ms, once per boot).
 */
function solveAmp(entry, opts, speeds) {
  const spd = speeds[opts.speed] ?? CANON_SPEEDS[opts.speed] ?? 0;
  const cyc = entry?.gait?.cycleDist ?? 0;
  if (!(spd > 0.05) || !(cyc > 0.05) || !(opts.cadence > 0)) return 1;
  const wantCycle = spd / (opts.cadence / 2);      // 2 steps per gait cycle
  const [lo, hi] = opts.ampRange || [0.4, 1.6];
  return clamp(wantCycle / cyc, lo, hi);
}

/** Slots that are ground-locomotion loops (phase-driven at speed). */
export const GAIT_SLOTS = ['walk', 'jog', 'sprint', 'strafe', 'crouchFwd'];

const FOOT_L = 'foot_l_0189', FOOT_R = 'foot_r_0215';
const BALL_L = 'ball_l_0190', BALL_R = 'ball_r_0216';
const STANCE_H = 0.035; // m above the loop's lowest sole sample
const LOWER_EPS = 0.02; // m a foot may sit above the other and still count as the contact foot

/** Per-frame stance flags for one foot from its ankle + ball height tracks. */
function stanceFlags(foot, ball, n) {
  const out = new Uint8Array(n);
  let minF = Infinity, minB = Infinity;
  for (let i = 0; i < n; i++) {
    minF = Math.min(minF, foot[i * 3 + 1]);
    minB = Math.min(minB, ball[i * 3 + 1]);
  }
  for (let i = 0; i < n; i++) {
    const hf = foot[i * 3 + 1] - minF, hb = ball[i * 3 + 1] - minB;
    out[i] = (hf < STANCE_H || hb < STANCE_H) ? 1 : 0;
  }
  return out;
}

/**
 * Contact travel of one foot: total backward (-Z) distance covered while it is
 * planted, and the time it spent planted. Only intervals whose BOTH endpoints
 * are stance frames count, and only while this foot is the LOWER of the two
 * (a crouch-walk swing foot skims 5cm off the floor, passes the height test and
 * — moving forward — cancels the stance foot out of a slope-based estimate).
 *
 * `travel / time` is the speed at which the character must move for the planted
 * foot to end its stance exactly where it started: the no-skate definition of
 * the clip's nominal speed. A least-squares slope over the same window answers
 * a different question (instantaneous mid-stance velocity) and reads ~10% slow
 * on Sprint_Loop, whose stance foot accelerates through contact.
 */
function contactTravel(track, other, flags, times, n) {
  let travel = 0, time = 0, runs = 0, prev = false;
  const lower = (i) => track[i * 3 + 1] <= other[i * 3 + 1] + LOWER_EPS;
  for (let i = 0; i < n - 1; i++) {
    const ok = flags[i] && flags[i + 1] && lower(i) && lower(i + 1);
    if (!ok) { prev = false; continue; }
    if (!prev) runs++;
    prev = true;
    travel += track[i * 3 + 2] - track[(i + 1) * 3 + 2]; // backward is +
    time += times[i + 1] - times[i];
  }
  return { travel, time, runs };
}

/** Measure nominal speed, stance flags + phase offset from the recorded tracks. */
export function analyzeGait(info) {
  const FL = info.contactTracks[FOOT_L], FR = info.contactTracks[FOOT_R];
  const L = info.contactTracks[BALL_L], R = info.contactTracks[BALL_R];
  const times = info.times, n = info.frames;
  const empty = { nominalSpeed: 0, cycleDist: 0, phaseOffset: 0, stanceJitter: 0, stanceL: null, stanceR: null, warp: null };
  if (!L || !R || !FL || !FR || n < 3) return empty;

  const per = n - 1;                        // unique frames (last == first)
  const step = info.duration / Math.max(1, per);
  const vAt = (T, i) => {
    const a = (i - 1 + per) % per, b = (i + 1) % per;
    return (T[a * 3 + 2] - T[b * 3 + 2]) / (2 * step); // backward is positive
  };

  const stanceL = stanceFlags(FL, L, n);
  const stanceR = stanceFlags(FR, R, n);
  let a = contactTravel(L, R, stanceL, times, n);
  let b = contactTravel(R, L, stanceR, times, n);
  let travel = a.travel + b.travel, ctime = a.time + b.time;
  let nominalSpeed = ctime > 1e-4 ? Math.max(0, travel / ctime) : 0;

  // Second pass — a foot bearing weight travels BACKWARD at body speed. In
  // Crouch_Fwd_Loop the swing foot skims 5cm off the floor, passes the height
  // test and gets flagged planted while it swings forward; the animator's foot
  // lock then pins a foot the clip is moving and has to break its anchor
  // mid-stride. Requiring backward travel removes those frames (and shortens
  // jog/sprint contacts to their real length).
  if (nominalSpeed > 0.05) {
    const vMin = nominalSpeed * 0.3;
    for (let i = 0; i < per; i++) {
      if (stanceL[i] && vAt(L, i) < vMin) stanceL[i] = 0;
      if (stanceR[i] && vAt(R, i) < vMin) stanceR[i] = 0;
    }
    stanceL[n - 1] = stanceL[0];
    stanceR[n - 1] = stanceR[0];
    a = contactTravel(L, R, stanceL, times, n);
    b = contactTravel(R, L, stanceR, times, n);
    travel = a.travel + b.travel; ctime = a.time + b.time;
    if (ctime > 1e-4) nominalSpeed = Math.max(0, travel / ctime);
  }
  // per-foot disagreement: >15% means the loop is asymmetric (limp) and the
  // shared phase will read uneven — reported so the console/gates can see it
  const sa = a.time > 1e-4 ? a.travel / a.time : nominalSpeed;
  const sb = b.time > 1e-4 ? b.travel / b.time : nominalSpeed;
  const jitter = nominalSpeed > 0.05 ? Math.abs(sa - sb) / nominalSpeed : 0;

  /* --- per-frame phase warp -------------------------------------------
   * The stance foot's backward velocity is NOT constant in these clips:
   * Sprint_Loop swings 6.3 -> 9.5 -> 7.0 m/s through a single contact. A
   * constant timeScale therefore holds the foot only ON AVERAGE and lets it
   * slide +-0.12m inside the stance window. Warping the master phase by
   * nominalSpeed / stanceVel(u) cancels that: the phase runs slower where the
   * clip's foot moves fast and faster where it stalls, so the planted ball
   * tracks the ground exactly. 1.0 (no warp) during flight and for clips with
   * no measurable contact.
   */
  const warp = new Float32Array(n).fill(1);
  if (nominalSpeed > 0.05) {
    const raw = new Float32Array(per);
    for (let i = 0; i < per; i++) {
      const lo = L[i * 3 + 1] <= R[i * 3 + 1] + LOWER_EPS;
      const ro = R[i * 3 + 1] <= L[i * 3 + 1] + LOWER_EPS;
      let v = 0;
      if (stanceL[i] && lo) v = Math.max(v, vAt(L, i));
      if (stanceR[i] && ro) v = Math.max(v, vAt(R, i));
      raw[i] = v > nominalSpeed * 0.25 ? clamp(nominalSpeed / v, 0.55, 1.7) : 1;
    }
    // two circular 3-tap box passes: a hard warp step would pop the cadence
    const tmp = new Float32Array(per);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < per; i++) {
        tmp[i] = (raw[(i - 1 + per) % per] + raw[i] + raw[(i + 1) % per]) / 3;
      }
      raw.set(tmp);
    }
    for (let i = 0; i < n; i++) warp[i] = raw[i % per];
  }

  // phase: left ball furthest forward (+Z)
  let best = -Infinity, bi = 0;
  for (let i = 0; i < n - 1; i++) {
    const z = L[i * 3 + 2];
    if (z > best) { best = z; bi = i; }
  }
  const phaseOffset = info.duration > 0 ? (times[bi] / info.duration) % 1 : 0;

  let airborne = 0;
  for (let i = 0; i < n; i++) if (!stanceL[i] && !stanceR[i]) airborne++;

  return {
    nominalSpeed: +nominalSpeed.toFixed(4),
    cycleDist: +(nominalSpeed * info.duration).toFixed(4),
    phaseOffset: +phaseOffset.toFixed(4),
    stanceJitter: +jitter.toFixed(4),
    stanceRuns: a.runs + b.runs,
    contactDuty: +(ctime / Math.max(1e-6, info.duration)).toFixed(3),
    airborneFrames: airborne,
    warpRange: [+Math.min(...warp).toFixed(3), +Math.max(...warp).toFixed(3)],
    stanceL, stanceR, warp,
  };
}

/** Normalized root-motion progress curve (0..1 along the dominant travel). */
export function analyzeRoot(info) {
  const T = info.rootTrack, n = info.frames;
  if (!T || n < 2) return null;
  const ex = T[(n - 1) * 3], ez = T[(n - 1) * 3 + 2];
  const total = Math.hypot(ex, ez);
  if (total < 0.05) return null;
  const dx = ex / total, dz = ez / total;
  const prog = new Float32Array(n);
  let run = 0;
  for (let i = 0; i < n; i++) {
    const s = (T[i * 3] * dx + T[i * 3 + 2] * dz) / total;
    run = Math.max(run, Math.min(1, s)); // monotone
    prog[i] = run;
  }
  prog[n - 1] = 1;
  return { rootProgress: prog, rootDistance: +total.toFixed(3) };
}

let _shared = null;

export class ClipLibrary {
  /**
   * @param {{root: THREE.Object3D}} aloyModel  assets.models.aloy
   * @param {{scene: THREE.Object3D, animations: THREE.AnimationClip[]}} ualGltf  assets.anims.ual
   */
  constructor(aloyModel, ualGltf, speeds) {
    this.speeds = { ...CANON_SPEEDS, ...(speeds || {}) };
    this.rig = skeletonClone(aloyModel.root);
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
    this.rig.updateMatrixWorld(true);
    this.source = ualGltf.scene;
    this.source.updateMatrixWorld(true);
    this.sourceClips = ualGltf.animations || [];
    this.retargeter = new Retargeter({
      targetRoot: this.rig, sourceRoot: this.source,
      map: UAL_TO_ALOY, hip: UAL_HIP, aim: AIM_RULES, contacts: CONTACT_BONES,
      correct: 'all', rootMotion: 'strip',
    });
    this.animatedNames = new Set(this.retargeter.animatedTargetNames());
    this.entries = new Map(); // slot -> { slot, name, clip, info, gait }
    this.bakeMs = 0;
    register({
      id: 'anim/clipLibrary', file: 'src/entities/anim/clipLibrary.js',
      owner: 'anim-core', rig: 'aloy', convention: 'BoneSpace (via Retargeter)',
      status: 'migrated', bones: this.animatedNames.size,
    });
  }

  /** One library per boot: the bake is deterministic and the clips bind by name. */
  static shared(assets, speeds) {
    if (_shared) return _shared;
    const aloy = assets?.models?.aloy;
    const ual = assets?.anims?.ual;
    if (!aloy || !ual) return null;
    _shared = new ClipLibrary(aloy, ual, speeds);
    return _shared;
  }

  /**
   * Does a retimed slot still sit on its cadence target for these speeds?
   * `PlayerAnimator` calls this on the first update, when `ctx.player` finally
   * exists, so a canon change in `player.js` shows up as a named warning
   * instead of a gate that quietly drifts off its bar.
   */
  cadenceCheck(speeds) {
    const rows = [];
    for (const [slot, so] of Object.entries(SLOT_OPTS)) {
      if (!so.cadence) continue;
      const e = this.entries.get(slot);
      if (!e || !(e.gait.cycleDist > 0.05)) continue;
      const spd = speeds?.[so.speed] ?? this.speeds[so.speed];
      const got = 2 * spd / e.gait.cycleDist;
      rows.push({
        slot, speed: +spd.toFixed(2), amp: e.amp,
        cadence: +got.toFixed(2), target: so.cadence,
        offBy: +(got / so.cadence - 1).toFixed(3),
      });
    }
    return rows;
  }

  findSource(name) {
    const lc = name.toLowerCase();
    return this.sourceClips.find((c) => c.name.toLowerCase() === lc)
      || this.sourceClips.find((c) => c.name.toLowerCase().startsWith(lc))
      || null;
  }

  /** Bake (cached) the clip for a logical slot. */
  get(slot, opts = {}) {
    if (this.entries.has(slot)) return this.entries.get(slot);
    const name = CLIPS[slot] || slot;
    const src = this.findSource(name);
    if (!src) return null;
    const t0 = performance.now();
    const so = SLOT_OPTS[slot] || {};
    const isGait = GAIT_SLOTS.includes(slot);
    const bake = (amp) => {
      const r = this.retargeter.bake(src, {
        groundFix: opts.groundFix !== false, amp, name: so.name ?? name,
      });
      r.clip.name = so.name ?? name;
      r.gait = isGait ? analyzeGait(r.info)
        : { nominalSpeed: 0, cycleDist: 0, phaseOffset: 0, stanceJitter: 0, stanceL: null, stanceR: null };
      r.amp = amp;
      return r;
    };
    let out = bake(opts.amp ?? so.amp ?? 1);
    // cadence retime: solve the amplitude that puts this loop's step rate on
    // target at the published travel speed, then bake once more (see solveAmp)
    // The amplitude warp is not linear in stride length (0.83 amp bought 0.75
    // of the cycle on Sprint_Loop), so one solve lands ~10 % hot. Iterate the
    // same ratio on the measured result until it converges — two extra bakes
    // at worst, ~24 ms, once per boot.
    if (isGait && so.cadence && opts.amp == null) {
      for (let i = 0; i < 3; i++) {
        const amp = solveAmp(out, so, this.speeds) * out.amp;
        const [lo, hi] = so.ampRange || [0.4, 1.6];
        const next = clamp(amp, lo, hi);
        if (Math.abs(next - out.amp) < 0.012) break;
        out = bake(next);
      }
    }
    const root = analyzeRoot(out.info);
    const entry = {
      slot, name: so.name ?? name, clip: out.clip, info: out.info,
      gait: out.gait, root, amp: +out.amp.toFixed(3),
    };
    this.entries.set(slot, entry);
    this.bakeMs += performance.now() - t0;
    return entry;
  }

  bakeAll(slots = Object.keys(CLIPS)) {
    const out = {};
    for (const s of slots) out[s] = this.get(s);
    return out;
  }

  /** Compact report for the console / gates. */
  report() {
    const rows = {};
    for (const [slot, e] of this.entries) {
      rows[slot] = {
        clip: e.name, duration: e.info.duration, fps: e.info.fps,
        amp: e.amp ?? SLOT_OPTS[slot]?.amp ?? 1,
        cadenceTarget: SLOT_OPTS[slot]?.cadence ?? 0,
        groundShift: e.info.groundShift,
        nominalSpeed: e.gait.nominalSpeed, cycleDist: e.gait.cycleDist,
        phaseOffset: e.gait.phaseOffset, stanceJitter: e.gait.stanceJitter,
        contactDuty: e.gait.contactDuty ?? 0,
        airborneFrames: e.gait.airborneFrames ?? 0,
        rootDistance: e.root?.rootDistance ?? 0,
      };
    }
    return { bakeMs: +this.bakeMs.toFixed(1), clips: rows };
  }
}
